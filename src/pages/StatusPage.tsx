// src/pages/StatusPage.tsx
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

// VIGIL_STATUS_TYPES
type Summary = {
  total: number;
  up: number;
  down: number;
  unknown?: number;
  avgResponseTimeAll: number;
};

// VIGIL_LASTCHECK_TYPE
type SummaryApp = {
  id: number;
  name: string;
  url: string;
  uptime24h: number;
  avgResponseTime24h: number;
  latestStatus: "UP" | "DOWN" | "CHECKING" | string;
  lastCheckedAt: number | string | null;
};

type SummaryResponse = {
  ok: boolean;
  summary: Summary;
  apps: SummaryApp[];
};

// VIGIL_LASTCHECK_FORMAT
function formatDateTime(ts: number | string | null | undefined) {
  if (ts === null || ts === undefined) return "Not checked yet";

  const ms =
    typeof ts === "string" ? Number(ts) : typeof ts === "number" ? ts : NaN;

  if (!Number.isFinite(ms) || ms <= 0) return "Not checked yet";

  try {
    return new Date(ms).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "Not checked yet";
  }
}

function statusClasses(status: string) {
  const s = status.toUpperCase();
  if (s === "UP") {
    return {
      label: "Operational",
      badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      dot: "bg-emerald-500",
    };
  }
  if (s === "DOWN") {
    return {
      label: "Outage",
      badge: "bg-red-500/10 text-red-500 border-red-500/20",
      dot: "bg-red-500",
    };
  }
  return {
    label: "Checking",
    badge: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    dot: "bg-amber-500",
  };
}

const StatusPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api<SummaryResponse>("/api/summary");
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        console.error("Failed to load status summary:", e);
        if (!cancelled) {
          setError("Status information is temporarily unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">
            Loading application status…
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-lg">Status unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {error ||
                "We could not retrieve the current status of the applications."}
            </p>
            <p className="text-xs text-muted-foreground">
              Please try again in a few minutes. If the problem persists,
              contact the IT team.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { summary, apps } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* VIGIL_STATUS_HEADER */}
        <header className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Premier Applications Status
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Live view of core internal applications. This page is read-only and
            does not expose admin controls.
          </p>
        </header>

        {/* Summary cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">
                Total Apps
              </div>
              <div className="text-2xl font-bold">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">
                Operational
              </div>
              <div className="text-2xl font-bold text-success">
                {summary.up}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">Outages</div>
              <div className="text-2xl font-bold text-destructive">
                {summary.down}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground mb-1">
                Avg Response (24h)
              </div>
              <div className="text-2xl font-bold">
                {summary.avgResponseTimeAll
                  ? `${Math.round(summary.avgResponseTimeAll)}ms`
                  : "-"}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Apps list */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Application status
          </h2>
          {apps.length === 0 ? (
            <Card>
              <CardContent className="py-6">
                <p className="text-sm text-muted-foreground">
                  No applications are currently being monitored.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => {
                const s = statusClasses(app.latestStatus);
                return (
                  <Card key={app.id} className="border border-card-border/70">
                    <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-2 w-2 rounded-full mt-0.5">
                            <span
                              className={`h-full w-full rounded-full ${s.dot}`}
                            />
                          </span>
                          <p className="font-medium">{app.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground break-all">
                          {app.url}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
                        <Badge
                          variant="outline"
                          className={`flex items-center gap-1 px-2 py-0.5 border ${s.badge}`}
                        >
                          {s.label}
                        </Badge>
                        <div className="flex flex-col md:items-end">
                          <span className="text-xs text-muted-foreground">
                            Uptime (last 24h)
                          </span>
                          <span className="font-medium">
                            {app.uptime24h
                              ? `${app.uptime24h.toFixed(1)}%`
                              : "No data"}
                          </span>
                        </div>
                        <div className="hidden md:flex md:flex-col md:items-end">
                          <span className="text-xs text-muted-foreground">
                            Last checked
                          </span>
                          <span className="font-normal text-xs">
                            {formatDateTime(app.lastCheckedAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {apps.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Status is based on automated health checks performed every{" "}
              {process.env.MONITOR_INTERVAL_MINUTES || 10} minutes.
            </p>
          )}
        </section>
      </div>
    </div>
  );
};

export default StatusPage;
