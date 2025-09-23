// server.cjs
// Vigil monitor - MSSQL + Microsoft Graph notifications (production-ready, complete)

require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cron = require("node-cron");
const { performance } = require("perf_hooks");
const dns = require("dns").promises;
const net = require("net");
const fs = require("fs");
const https = require("https");

// --- Config (env override strongly recommended) ---
const PORT = Number(process.env.PORT || 3337);
const MONITOR_INTERVAL_MINUTES = Math.max(
  1,
  Number(process.env.MONITOR_INTERVAL_MINUTES || 60)
);
const REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.REQUEST_TIMEOUT_MS || 10000)
);
const MAX_CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 5));

// MSSQL config (you provided defaults; consider moving to env)
const mssqlConfig = {
  user: "PEL_DB",
  password: "Pel@0184",
  server: "10.0.50.17",
  port: 1433,
  database: "vigil",
  options: {
    trustServerCertificate: true,
    encrypt: false,
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Microsoft Graph credentials (you provided these)
const CLIENT_ID =
  process.env.CLIENT_ID || "5a58e660-dc7b-49ec-a48c-1fffac02f721";
const CLIENT_SECRET =
  process.env.CLIENT_SECRET || "6_I8Q~U7IbS~NERqNeszoCRs2kETiO1Yc3cXAaup";
const TENANT_ID =
  process.env.TENANT_ID || "1c3de7f3-f8d1-41d3-8583-2517cf3ba3b1";
const SENDER_EMAIL = process.env.SENDER_EMAIL || "leaf@premierenergies.com";
// comma-separated fallback alert recipients; if not set, notification will be sent to SENDER_EMAIL
const ALERT_RECIPIENTS = (process.env.ALERT_RECIPIENTS &&
  process.env.ALERT_RECIPIENTS.split(",").map((s) => s.trim())) || [
  SENDER_EMAIL,
];

const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
// Graph client expects global fetch (Node 18+ has fetch)
try {
  globalThis.fetch = globalThis.fetch || require("node-fetch");
} catch (e) {
  /* ignore if not installed */
}

// init Graph
const credential = new ClientSecretCredential(
  TENANT_ID,
  CLIENT_ID,
  CLIENT_SECRET
);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const tokenResponse = await credential.getToken(
        "https://graph.microsoft.com/.default"
      );
      return tokenResponse.token;
    },
  },
});

// --- MSSQL connection ---
const sql = require("mssql");
let pool;

async function connectMSSQL() {
  pool = await sql.connect(mssqlConfig);
  // increase request timeout
  pool.request().timeout = Math.max(REQUEST_TIMEOUT_MS * 2, 30000);
  console.log("[mssql] connected");
  await ensureTables();
}

// --- ensure tables ---
async function ensureTables() {
  // Use IF OBJECT_ID checks to create tables if missing
  const createApps = `
IF OBJECT_ID(N'dbo.applications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.applications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    url NVARCHAR(2000) NOT NULL UNIQUE,
    createdAt BIGINT NOT NULL,
    isDown BIT NOT NULL DEFAULT 0,
    lastStatusChange BIGINT NULL,
    alertEmails NVARCHAR(2000) NULL
  );
END
`;
  const createLogs = `
IF OBJECT_ID(N'dbo.status_logs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.status_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    applicationId INT NOT NULL,
    status NVARCHAR(10) NOT NULL,
    statusCode INT NOT NULL,
    responseTime INT NOT NULL,
    timestamp BIGINT NOT NULL,
    meta NVARCHAR(MAX) NULL,
    CONSTRAINT FK_StatusLogs_Apps FOREIGN KEY (applicationId) REFERENCES dbo.applications(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_StatusLogs_App_Timestamp ON dbo.status_logs(applicationId, timestamp DESC);
END
`;
  await pool.request().query(createApps);
  await pool.request().query(createLogs);

  // Backfill meta column if table already existed
  await pool
    .request()
    .query(
      "IF COL_LENGTH('dbo.status_logs','meta') IS NULL ALTER TABLE dbo.status_logs ADD meta NVARCHAR(MAX) NULL;"
    );
}

// --- helpers: DB operations ---
async function getAllApps() {
  const res = await pool
    .request()
    .query(
      "SELECT id, name, url, createdAt, isDown, lastStatusChange, alertEmails FROM dbo.applications ORDER BY id DESC"
    );
  return res.recordset;
}

async function getAppById(id) {
  const r = await pool
    .request()
    .input("id", sql.Int, id)
    .query(
      "SELECT id, name, url, createdAt, isDown, lastStatusChange, alertEmails FROM dbo.applications WHERE id=@id"
    );
  return r.recordset[0];
}

async function createApp({ name, url, alertEmails }) {
  const r = await pool
    .request()
    .input("name", sql.NVarChar(200), name)
    .input("url", sql.NVarChar(2000), url)
    .input("createdAt", sql.BigInt, Date.now())
    .input("alertEmails", sql.NVarChar(2000), alertEmails || null)
    .query(
      `INSERT INTO dbo.applications (name, url, createdAt, alertEmails) OUTPUT INSERTED.id, INSERTED.name, INSERTED.url, INSERTED.createdAt, INSERTED.isDown, INSERTED.alertEmails VALUES (@name, @url, @createdAt, @alertEmails)`
    );
  return r.recordset[0];
}

async function updateApp(id, { name, url, alertEmails }) {
  await pool
    .request()
    .input("id", sql.Int, id)
    .input("name", sql.NVarChar(200), name)
    .input("url", sql.NVarChar(2000), url)
    .input("alertEmails", sql.NVarChar(2000), alertEmails || null)
    .query(
      `UPDATE dbo.applications SET name=@name, url=@url, alertEmails=@alertEmails WHERE id=@id`
    );
  return getAppById(id);
}

async function deleteApp(id) {
  await pool
    .request()
    .input("id", sql.Int, id)
    .query("DELETE FROM dbo.applications WHERE id=@id");
  return true;
}

async function insertLog({
  applicationId,
  status,
  statusCode,
  responseTime,
  timestamp,
}) {
  meta,
    await pool
      .request()
      .input("applicationId", sql.Int, applicationId)
      .input("status", sql.NVarChar(10), status)
      .input("statusCode", sql.Int, statusCode)
      .input("responseTime", sql.Int, responseTime)
      .input("timestamp", sql.BigInt, timestamp)
      .input("meta", sql.NVarChar(sql.MAX), meta ? JSON.stringify(meta) : null)
      .query(
        `INSERT INTO dbo.status_logs (applicationId, status, statusCode, responseTime, timestamp, meta)
      VALUES (@applicationId, @status, @statusCode, @responseTime, @timestamp, @meta)`
      );
}

// get recent logs (limit)
async function getLogs(applicationId, limit = 200) {
  // TOP accepts parameter when in parenthesis
  const r = await pool
    .request()
    .input("applicationId", sql.Int, applicationId)
    .input("limit", sql.Int, limit)
    .query(
      `SELECT TOP (@limit) id, applicationId, status, statusCode, responseTime, timestamp FROM dbo.status_logs WHERE applicationId=@applicationId ORDER BY timestamp DESC`
    );
  return r.recordset;
}

// get logs between timestamps (for uptime calc)
async function getLogsBetween(applicationId, fromMs, toMs) {
  const r = await pool
    .request()
    .input("applicationId", sql.Int, applicationId)
    .input("fromMs", sql.BigInt, fromMs)
    .input("toMs", sql.BigInt, toMs)
    .query(
      "SELECT id, applicationId, status, statusCode, responseTime, timestamp FROM dbo.status_logs WHERE applicationId=@applicationId AND timestamp BETWEEN @fromMs AND @toMs ORDER BY timestamp ASC"
    );
  return r.recordset;
}

async function diagnoseUrl(urlStr) {
  const started = Date.now();
  const urlObj = new URL(urlStr);
  const host = urlObj.hostname;
  const port = urlObj.port
    ? Number(urlObj.port)
    : urlObj.protocol === "https:"
    ? 443
    : 80;
  const out = {
    dnsOk: false,
    resolvedIp: null,
    tcpOk: false,
    tcpMs: 0,
    httpOk: false,
    statusCode: 0,
    httpMs: 0,
    error: null,
  };
  try {
    const a = await dns.lookup(host);
    out.dnsOk = true;
    out.resolvedIp = a.address;
  } catch (e) {
    out.error = `DNS_FAIL: ${e}`;
    return out;
  }
  // TCP probe
  const t1 = performance.now();
  await new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      try {
        socket.destroy();
      } catch {}
      out.tcpOk = ok;
      out.tcpMs = Math.round(performance.now() - t1);
      resolve();
    };
    socket.setTimeout(REQUEST_TIMEOUT_MS);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
    socket.connect(port, out.resolvedIp);
  });
  if (!out.tcpOk) {
    out.error = out.error || "TCP_FAIL";
    return out;
  }
  // HTTP probe
  const httpRes = await timedFetch(urlStr, REQUEST_TIMEOUT_MS);
  out.httpOk = httpRes.ok;
  out.statusCode = httpRes.statusCode;
  out.httpMs = httpRes.responseTime;
  if (!httpRes.ok && httpRes.error) out.error = `HTTP_FAIL: ${httpRes.error}`;
  return out;
}

// --- monitoring HTTP check ---
async function timedFetch(url, timeoutMs) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);

  const started = performance.now();
  try {
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "VigilMonitor/1.0" },
    });
    const elapsed = Math.max(0, Math.round(performance.now() - started));
    const httpOk = resp.status < 400; // treat 3xx as UP as well
    return { ok: httpOk, statusCode: resp.status, responseTime: elapsed };
  } catch (err) {
    const elapsed = Math.max(0, Math.round(performance.now() - started));
    return {
      ok: false,
      statusCode: 0,
      responseTime: elapsed,
      error: String(err),
    };
  } finally {
    clearTimeout(to);
  }
}

// --- Graph mailer ---
async function sendAlertEmail(toEmails, subject, htmlBody) {
  if (!Array.isArray(toEmails) || toEmails.length === 0) {
    toEmails = ALERT_RECIPIENTS;
  }
  const recipients = toEmails.map((addr) => ({
    emailAddress: { address: addr },
  }));
  const message = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: htmlBody,
      },
      toRecipients: recipients,
    },
    saveToSentItems: false,
  };

  try {
    // Mail as SENDER_EMAIL user (requires app permission Mail.Send and admin consent)
    await graphClient
      .api(`/users/${encodeURIComponent(SENDER_EMAIL)}/sendMail`)
      .post(message);
    console.log(`[graph] alert sent to ${toEmails.join(",")}: ${subject}`);
  } catch (err) {
    console.error(
      "[graph] send failed:",
      err && err.toString ? err.toString() : err
    );
  }
}

// --- Business check logic (sends notification on outage start & recovery) ---
async function checkOne(appRow) {
  const { id, url } = appRow;
  const diag = await diagnoseUrl(url);
  const log = {
    applicationId: id,
    status: diag.httpOk ? "UP" : "DOWN",
    statusCode: diag.statusCode,
    responseTime: diag.httpMs,
    timestamp: Date.now(),
    meta: {
      dnsOk: diag.dnsOk,
      resolvedIp: diag.resolvedIp,
      tcpOk: diag.tcpOk,
      tcpMs: diag.tcpMs,
      httpOk: diag.httpOk,
      httpMs: diag.httpMs,
      statusCode: diag.statusCode,
      error: diag.error,
    },
  };

  // insert log
  await insertLog(log);

  // determine state transitions
  try {
    // get up-to-date app row (to see isDown flag and alertEmails)
    const fresh = await getAppById(id);
    const alertEmails =
      fresh && fresh.alertEmails
        ? fresh.alertEmails
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : ALERT_RECIPIENTS;

    if (log.status === "DOWN" && !fresh.isDown) {
      // outage started -> notify and mark isDown
      const subject = `[Vigil] Outage detected: ${fresh.name} (${fresh.url})`;
      const html = `<p>Vigil has detected the application <b>${
        fresh.name
      }</b> is <b>DOWN</b> as of ${new Date(log.timestamp).toISOString()}.</p>
                    <p>HTTP code: ${log.statusCode} — response time: ${
        log.responseTime
      } ms</p>
                    <p>Please investigate.</p>`;
      await sendAlertEmail(alertEmails, subject, html);
      // mark app as down
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("ts", sql.BigInt, log.timestamp)
        .query(
          "UPDATE dbo.applications SET isDown=1, lastStatusChange=@ts WHERE id=@id"
        );
    } else if (log.status === "UP" && fresh.isDown) {
      // recovered -> notify and mark up
      const subject = `[Vigil] Recovery: ${fresh.name} is UP`;
      const html = `<p>Vigil recorded a recovery for <b>${fresh.name}</b> (${
        fresh.url
      }) at ${new Date(log.timestamp).toISOString()}.</p>
                    <p>HTTP code: ${log.statusCode} — response time: ${
        log.responseTime
      } ms</p>`;
      await sendAlertEmail(alertEmails, subject, html);
      await pool
        .request()
        .input("id", sql.Int, id)
        .input("ts", sql.BigInt, log.timestamp)
        .query(
          "UPDATE dbo.applications SET isDown=0, lastStatusChange=@ts WHERE id=@id"
        );
    }
  } catch (err) {
    console.error(
      "[checkOne] state update or notify failed:",
      err && err.toString ? err.toString() : err
    );
  }

  return log;
}

async function checkAllApplications() {
  const apps = await getAllApps();
  if (!apps || apps.length === 0) return { total: 0, checked: 0 };

  const concurrency = Math.min(MAX_CONCURRENCY, apps.length);
  let idx = 0;
  let checked = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = idx++;
      if (i >= apps.length) break;
      try {
        await checkOne(apps[i]);
        checked++;
      } catch (e) {
        console.error(
          "[checkAll] single check failed:",
          e && e.toString ? e.toString() : e
        );
      }
    }
  });

  await Promise.all(workers);
  return { total: apps.length, checked };
}

// uptime % in last `hours`
async function calcUptimePct(applicationId, hours) {
  const to = Date.now();
  const from = to - hours * 60 * 60 * 1000;
  const rows = await getLogsBetween(applicationId, from, to);
  if (!rows || rows.length === 0) return 0;
  const upCount = rows.filter((r) => r.status === "UP").length;
  return (upCount / rows.length) * 100;
}

// daily series for last `days`
async function calcDailySeries(applicationId, days) {
  const to = Date.now();
  const from = to - days * 24 * 60 * 60 * 1000;
  const rows = await getLogsBetween(applicationId, from, to);
  const map = new Map();
  for (const r of rows) {
    const d = new Date(Number(r.timestamp));
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { upCount: 0, totalCount: 0 });
    const entry = map.get(key);
    entry.totalCount++;
    if (r.status === "UP") entry.upCount++;
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(to - i * 24 * 60 * 60 * 1000);
    const key = day.toISOString().slice(0, 10);
    const row = map.get(key);
    const uptime =
      row && row.totalCount > 0 ? (row.upCount / row.totalCount) * 100 : 0;
    series.push({ date: key, uptime });
  }
  return series;
}

// --- express API ---
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(compression());
app.use(morgan("combined"));

// health
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    intervalMinutes: MONITOR_INTERVAL_MINUTES,
  });
});

// list apps
app.get("/api/apps", async (req, res) => {
  try {
    const apps = await getAllApps();
    res.json({ ok: true, apps });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// get single app
app.get("/api/apps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const a = await getAppById(id);
    if (!a) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, app: a });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// create app
app.post("/api/apps", async (req, res) => {
  try {
    const { name, url, alertEmails } = req.body;
    if (!name || !url)
      return res
        .status(400)
        .json({ ok: false, message: "name and url required" });
    const existing = await pool
      .request()
      .input("url", sql.NVarChar(2000), url)
      .query("SELECT id FROM dbo.applications WHERE url=@url");
    if (existing.recordset.length > 0) {
      return res.status(409).json({ ok: false, message: "URL already exists" });
    }
    const appRow = await createApp({ name, url, alertEmails });
    // do an immediate check
    setImmediate(async () => {
      try {
        await checkOne(appRow);
      } catch (e) {
        console.error("[immediate check] failed", e);
      }
    });
    res.status(201).json({ ok: true, app: appRow });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// update
app.put("/api/apps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getAppById(id);
    if (!existing)
      return res.status(404).json({ ok: false, message: "Not found" });
    const {
      name = existing.name,
      url = existing.url,
      alertEmails = existing.alertEmails,
    } = req.body;
    const updated = await updateApp(id, { name, url, alertEmails });
    res.json({ ok: true, app: updated });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// delete
app.delete("/api/apps/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const exist = await getAppById(id);
    if (!exist)
      return res.status(404).json({ ok: false, message: "Not found" });
    await deleteApp(id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// aggregated summary across all applications
app.get("/api/summary", async (req, res) => {
  try {
    const apps = await getAllApps();
    const now = Date.now();
    const from24h = now - 24 * 60 * 60 * 1000;
    const rows = [];
    let upCount = 0;
    let downCount = 0;
    let totalAvgResp = 0;
    for (const a of apps) {
      const logs = await getLogsBetween(a.id, from24h, now);
      const total = logs.length || 1;
      const up = logs.filter((r) => r.status === "UP").length;
      const uptime24h = (up / total) * 100;
      const avgResp =
        logs.reduce((s, r) => s + (r.responseTime || 0), 0) / total;
      const latest = logs[logs.length - 1] || null;
      if (latest?.status === "UP") upCount++;
      else downCount++;
      totalAvgResp += avgResp;
      rows.push({
        id: a.id,
        name: a.name,
        url: a.url,
        uptime24h,
        avgResponseTime24h: avgResp,
        latestStatus: latest?.status || "CHECKING",
        lastCheckedAt: latest?.timestamp || null,
      });
    }
    const avgResponseTimeAll = rows.length > 0 ? totalAvgResp / rows.length : 0;
    res.json({
      ok: true,
      summary: {
        total: apps.length,
        up: upCount,
        down: downCount,
        avgResponseTimeAll,
      },
      apps: rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// latest diagnostics/meta for an app
app.get("/api/apps/:id/diagnostics", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const logs = await getLogs(id, 1);
    const latest = logs[0] || null;
    const meta = latest?.meta ? JSON.parse(latest.meta) : null;
    res.json({ ok: true, meta, log: latest || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// logs
app.get("/api/apps/:id/logs", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const limit = Math.min(2000, Number(req.query.limit || 200));
    const appRow = await getAppById(id);
    if (!appRow)
      return res.status(404).json({ ok: false, message: "Not found" });
    const logs = await getLogs(id, limit);
    res.json({ ok: true, logs });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// on-demand check
app.post("/api/apps/:id/check", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const appRow = await getAppById(id);
    if (!appRow)
      return res.status(404).json({ ok: false, message: "Not found" });
    const log = await checkOne(appRow);
    res.json({ ok: true, log });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// uptime % last N hours
app.get("/api/apps/:id/uptime", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const hours = Math.min(24 * 90, Number(req.query.hours || 24));
    const appRow = await getAppById(id);
    if (!appRow)
      return res.status(404).json({ ok: false, message: "Not found" });
    const uptime = await calcUptimePct(id, hours);
    res.json({ ok: true, uptime });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// uptime series (days)
app.get("/api/apps/:id/uptime/series", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const days = Math.min(365, Number(req.query.days || 30));
    const appRow = await getAppById(id);
    if (!appRow)
      return res.status(404).json({ ok: false, message: "Not found" });
    const series = await calcDailySeries(id, days);
    res.json({ ok: true, series });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// --- Static hosting (frontend on the same port) ---
const FRONTEND_DIST =
  process.env.FRONTEND_DIST || path.resolve(__dirname, "../dist");

console.log(`[static] FRONTEND_DIST = ${FRONTEND_DIST}`);
const indexHtml = path.join(FRONTEND_DIST, "index.html");
console.log(`[static] indexHtml resolved = ${indexHtml}`);
console.log(`[static] index exists: ${fs.existsSync(indexHtml)}`);

app.use(
  express.static(FRONTEND_DIST, {
    // optional: set maxAge in prod
    // maxAge: '1d'
  })
);

// If a request looks like an API call, pass through so API 404s are preserved
app.get(/^\/api\/.*$/, (req, res, next) => next());

// For any other route, try to serve index.html (SPA). If missing, give helpful JSON.
app.get(/.*/, (req, res) => {
  // prefer absolute path to avoid cwd issues
  if (fs.existsSync(indexHtml)) {
    return res.sendFile(indexHtml);
  }
  // index not found — helpful JSON (makes debugging easier than a plain 404)
  res.status(404).json({
    ok: false,
    message:
      "Frontend not built or FRONTEND_DIST incorrect. index.html not found.",
    frontendDist: FRONTEND_DIST,
  });
});

// --- HTTPS (same certs/paths as reference) ---
const HOST = process.env.HOST || "0.0.0.0";
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "certs", "mydomain.key"), "utf8"),
  cert: fs.readFileSync(
    path.join(__dirname, "certs", "d466aacf3db3f299.crt"),
    "utf8"
  ),
  ca: fs.readFileSync(
    path.join(__dirname, "certs", "gd_bundle-g2-g1.crt"),
    "utf8"
  ),
};

// --- start server after DB connect ---
(async () => {
  try {
    await connectMSSQL();
    const server = app.listen(PORT, () => {
      console.log(`🚀 Vigil server listening on http://localhost:${PORT}`);
      console.log(
        `⏱ Monitor schedule every ${MONITOR_INTERVAL_MINUTES} minute(s)`
      );
    });

    // kick off an initial sweep on boot
    checkAllApplications().catch((e) =>
      console.error("[startup sweep] failed", e)
    );

    // schedule recurring checks
    cron.schedule(
      `*/${MONITOR_INTERVAL_MINUTES} * * * *`,
      () => {
        checkAllApplications().catch((e) =>
          console.error("[cron] checkAllApplications failed", e)
        );
      },
      { timezone: "Asia/Kolkata" }
    );

    function graceful(sig) {
      console.log(`${sig} received, shutting down...`);
      server.close(async () => {
        try {
          await pool.close();
        } catch (e) {
          /*ignore*/
        }
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10000).unref();
    }
    process.on("SIGINT", () => graceful("SIGINT"));
    process.on("SIGTERM", () => graceful("SIGTERM"));
  } catch (e) {
    console.error(
      "Failed to start server:",
      e && e.toString ? e.toString() : e
    );
    process.exit(1);
  }
})();
