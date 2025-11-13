import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { StatusLog } from "@/lib/database";
import { format } from "date-fns";

interface StatusChartProps {
  logs: StatusLog[];
}

const StatusChart = ({ logs }: StatusChartProps) => {
  // Group logs by hour for the last 24 hours
  const hourlyData = React.useMemo(() => {
    const now = new Date();
    const hours = [];

    for (let i = 23; i >= 0; i--) {
      const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStart = new Date(
        hour.getFullYear(),
        hour.getMonth(),
        hour.getDate(),
        hour.getHours()
      );
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const hourLogs = logs.filter((log) => {
        const ts = Number(log.timestamp);
        return (
          Number.isFinite(ts) &&
          ts >= hourStart.getTime() &&
          ts < hourEnd.getTime()
        );
      });

      const upCount = hourLogs.filter((log) => log.status === "UP").length;
      const downCount = hourLogs.filter((log) => log.status === "DOWN").length;
      const total = hourLogs.length;

      hours.push({
        hour: format(hourStart, "HH:mm"),
        up: upCount,
        down: downCount,
        total,
        uptime: total > 0 ? (upCount / total) * 100 : 0,
      });
    }

    return hours;
  }, [logs]);

  const chartConfig = {
    up: {
      label: "Up",
      color: "hsl(var(--success))",
    },
    down: {
      label: "Down",
      color: "hsl(var(--destructive))",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Overview (24h)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={hourlyData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="hour"
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 12 }}
              />
              <YAxis className="text-xs fill-muted-foreground" />
              <ChartTooltip
                content={<ChartTooltipContent />}
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.2 }}
              />
              <Bar
                dataKey="up"
                stackId="status"
                fill="var(--color-up)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="down"
                stackId="status"
                fill="var(--color-down)"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default StatusChart;
