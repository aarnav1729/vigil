import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Activity,
  Clock,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Application, StatusLog } from "@/lib/database";
import { api } from "@/lib/api";
import { getStatusColor, formatResponseTime } from "@/lib/monitoring";
import StatusChart from "@/components/charts/StatusChart";
import ResponseTimeChart from "@/components/charts/ResponseTimeChart";
import UptimeChart from "@/components/charts/UptimeChart";
import StatusHistory from "@/components/monitoring/StatusHistory";
import { useToast } from "@/hooks/use-toast";

const ApplicationDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [application, setApplication] = useState<Application | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);
  const [stats, setStats] = useState({
    uptime24h: 0,
    uptime7d: 0,
    uptime30d: 0,
    avgResponseTime: 0,
    totalChecks: 0,
    failures: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadApplicationDetails();
    }
  }, [id]);

  const loadApplicationDetails = async () => {
    try {
      const appId = Number(id);
      // fetch app from backend
      const appResp = await api<{
        ok: boolean;
        app: Application & { alertEmails?: string };
      }>(`/api/apps/${appId}`);
      const appRow = appResp.app;
      if (!appRow) {
        toast({
          title: "Application Not Found",
          description: "The requested application could not be found.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }
      setApplication(appRow);

      // logs
      const logsResp = await api<{ ok: boolean; logs: StatusLog[] }>(
        `/api/apps/${appId}/logs?limit=500`
      );
      const logs = logsResp.logs || [];
      setStatusLogs(logs);

      // stats: uptime 24h/7d/30d
      const [u24Resp, u7Resp, u30Resp] = await Promise.all([
        api<{ ok: boolean; uptime: number }>(
          `/api/apps/${appId}/uptime?hours=24`
        ),
        api<{ ok: boolean; uptime: number }>(
          `/api/apps/${appId}/uptime?hours=${24 * 7}`
        ),
        api<{ ok: boolean; uptime: number }>(
          `/api/apps/${appId}/uptime?hours=${24 * 30}`
        ),
      ]);

      const totalChecks = logs.length;
      const failures = logs.filter((l) => l.status === "DOWN").length;
      const avgResponseTime =
        logs.length > 0
          ? logs.reduce((s, l) => s + (l.responseTime || 0), 0) / logs.length
          : 0;

      setStats({
        uptime24h: u24Resp.uptime ?? 0,
        uptime7d: u7Resp.uptime ?? 0,
        uptime30d: u30Resp.uptime ?? 0,
        avgResponseTime,
        totalChecks,
        failures,
      });
    } catch (error) {
      console.error("Failed to load application details:", error);
      toast({
        title: "Loading Error",
        description: "Failed to load application details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = async (appId: number, logs: StatusLog[]) => {
    try {
      const [uptime24h, uptime7d, uptime30d] = await Promise.all([
        calculateUptime(appId, 24),
        calculateUptime(appId, 24 * 7),
        calculateUptime(appId, 24 * 30),
      ]);

      const totalChecks = logs.length;
      const failures = logs.filter((log) => log.status === "DOWN").length;
      const avgResponseTime =
        logs.length > 0
          ? logs.reduce((sum, log) => sum + log.responseTime, 0) / logs.length
          : 0;

      setStats({
        uptime24h,
        uptime7d,
        uptime30d,
        avgResponseTime,
        totalChecks,
        failures,
      });
    } catch (error) {
      console.error("Failed to calculate stats:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">
            Loading application details...
          </p>
        </div>
      </div>
    );
  }

  if (!application) {
    return null;
  }

  const latestStatus = statusLogs[0];
  const statusColor = latestStatus
    ? getStatusColor(latestStatus.status)
    : "muted";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Button>
        </div>

        {/* Application Info */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <div
              className={`w-4 h-4 rounded-full ${
                latestStatus?.status === "UP"
                  ? "bg-success"
                  : latestStatus?.status === "DOWN"
                  ? "bg-destructive"
                  : "bg-warning"
              }`}
            />
            <h1 className="text-3xl font-bold">{application.name}</h1>
            <Badge
              variant={
                latestStatus?.status === "UP" ? "default" : "destructive"
              }
              className={`
                ${
                  latestStatus?.status === "UP"
                    ? "bg-success text-success-foreground"
                    : ""
                }
                ${
                  latestStatus?.status === "DOWN"
                    ? "bg-destructive text-destructive-foreground"
                    : ""
                }
                ${
                  latestStatus?.status === "CHECKING"
                    ? "bg-warning text-warning-foreground"
                    : ""
                }
              `}
            >
              {latestStatus?.status || "UNKNOWN"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-lg">{application.url}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">24h Uptime</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.uptime24h.toFixed(1)}%
              </div>
              <div
                className={`w-full h-2 rounded-full mt-2 ${
                  stats.uptime24h >= 99
                    ? "bg-success"
                    : stats.uptime24h >= 95
                    ? "bg-warning"
                    : "bg-destructive"
                }`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Response
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatResponseTime(stats.avgResponseTime)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Last {stats.totalChecks} checks
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Checks
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalChecks}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.failures} failures
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">30d Uptime</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.uptime30d.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                vs {stats.uptime7d.toFixed(1)}% 7d
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and History */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="response-time">Response Time</TabsTrigger>
            <TabsTrigger value="uptime">Uptime Trends</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatusChart logs={statusLogs} />
              <ResponseTimeChart logs={statusLogs.slice(0, 24)} />
            </div>
          </TabsContent>

          <TabsContent value="response-time">
            <ResponseTimeChart logs={statusLogs} showDetails />
          </TabsContent>

          <TabsContent value="uptime">
            <UptimeChart applicationId={application.id!} />
          </TabsContent>

          <TabsContent value="history">
            <StatusHistory logs={statusLogs} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ApplicationDetails;
