import React from "react";
import {
  LineChart,
  Line,
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
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

interface UptimeChartProps {
  applicationId: number;
}

const UptimeChart = ({ applicationId }: UptimeChartProps) => {
  const [chartData, setChartData] = React.useState<
    Array<{
      date: string;
      uptime: number;
      displayDate: string;
    }>
  >([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadUptimeData();
  }, [applicationId]);

  const loadUptimeData = async () => {
    try {
      const res = await api<{
        ok: boolean;
        series: { date: string; uptime: number }[];
      }>(`/api/apps/${applicationId}/uptime/series?days=30`);
      const rows = (res.series || []).map((d) => ({
        date: d.date,
        displayDate: format(parseISO(d.date), "MMM dd"),
        uptime: d.uptime ?? 0,
      }));
      setChartData(rows);
    } catch (error) {
      console.error("Failed to load uptime data:", error);
    } finally {
      setLoading(false);
    }
  };

  const chartConfig = {
    uptime: {
      label: "Uptime %",
      color: "hsl(var(--success))",
    },
  };

  const avgUptime = React.useMemo(() => {
    if (chartData.length === 0) return 0;
    return (
      chartData.reduce((sum, item) => sum + item.uptime, 0) / chartData.length
    );
  }, [chartData]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uptime Trends (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[400px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Uptime Trends (30 days)</span>
          <span className="text-sm font-normal text-muted-foreground">
            Avg: {avgUptime.toFixed(1)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="displayDate"
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                className="text-xs fill-muted-foreground"
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => `Date: ${label}`}
                    formatter={(value: number) => [
                      `${value.toFixed(1)}%`,
                      "Uptime",
                    ]}
                  />
                }
                cursor={{
                  stroke: "hsl(var(--muted-foreground))",
                  strokeWidth: 1,
                }}
              />
              <Line
                type="monotone"
                dataKey="uptime"
                stroke="var(--color-uptime)"
                strokeWidth={3}
                dot={{ fill: "var(--color-uptime)", strokeWidth: 2, r: 4 }}
                activeDot={{
                  r: 6,
                  stroke: "var(--color-uptime)",
                  strokeWidth: 2,
                }}
              />
              {/* Add reference line for 99% uptime */}
              <Line
                type="monotone"
                data={chartData.map((item) => ({ ...item, uptime: 99 }))}
                dataKey="uptime"
                stroke="hsl(var(--warning))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default UptimeChart;
