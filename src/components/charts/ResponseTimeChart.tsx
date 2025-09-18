import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { StatusLog } from '@/lib/database';
import { format } from 'date-fns';
import { formatResponseTime } from '@/lib/monitoring';

interface ResponseTimeChartProps {
  logs: StatusLog[];
  showDetails?: boolean;
}

const ResponseTimeChart = ({ logs, showDetails = false }: ResponseTimeChartProps) => {
  const chartData = React.useMemo(() => {
    const validLogs = logs
      .filter(log => log.status === 'UP' && log.responseTime > 0)
      .slice(0, showDetails ? 100 : 24)
      .reverse();
    
    return validLogs.map((log, index) => ({
      time: format(new Date(log.timestamp), showDetails ? 'MMM dd HH:mm' : 'HH:mm'),
      responseTime: log.responseTime,
      formattedTime: formatResponseTime(log.responseTime),
      index
    }));
  }, [logs, showDetails]);

  const avgResponseTime = React.useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData.reduce((sum, item) => sum + item.responseTime, 0) / chartData.length;
  }, [chartData]);

  const chartConfig = {
    responseTime: {
      label: "Response Time",
      color: "hsl(var(--primary))",
    },
  };

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Response Time {showDetails ? 'History' : '(Last 24 checks)'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No response time data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Response Time {showDetails ? 'History' : '(Last 24 checks)'}</span>
          <span className="text-sm font-normal text-muted-foreground">
            Avg: {formatResponseTime(avgResponseTime)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className={showDetails ? "h-[400px]" : "h-[300px]"}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="time" 
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 12 }}
                interval={showDetails ? 'preserveStartEnd' : 0}
              />
              <YAxis 
                className="text-xs fill-muted-foreground"
                tickFormatter={(value) => formatResponseTime(value)}
              />
              <ChartTooltip 
                content={<ChartTooltipContent 
                  labelFormatter={(label) => `Time: ${label}`}
                  formatter={(value: number) => [formatResponseTime(value), 'Response Time']}
                />}
                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="responseTime"
                stroke="var(--color-responseTime)"
                fill="var(--color-responseTime)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="responseTime"
                stroke="var(--color-responseTime)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-responseTime)', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, stroke: 'var(--color-responseTime)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default ResponseTimeChart;