import React from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusLog } from '@/lib/database';
import { formatResponseTime } from '@/lib/monitoring';
import { format } from 'date-fns';

interface StatusHistoryProps {
  logs: StatusLog[];
}

const StatusHistory = ({ logs }: StatusHistoryProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'UP':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'DOWN':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <AlertCircle className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant = status === 'UP' ? 'default' : status === 'DOWN' ? 'destructive' : 'secondary';
    const className = `
      ${status === 'UP' ? 'bg-success text-success-foreground' : ''}
      ${status === 'DOWN' ? 'bg-destructive text-destructive-foreground' : ''}
      ${status === 'CHECKING' ? 'bg-warning text-warning-foreground' : ''}
    `;
    
    return (
      <Badge variant={variant} className={className}>
        {status}
      </Badge>
    );
  };

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No status history available yet. Checks will appear here as they are performed.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="w-5 h-5" />
          <span>Status History ({logs.length} checks)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {logs.map((log, index) => (
              <div 
                key={log.id || index} 
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  {getStatusIcon(log.status)}
                  <div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(log.status)}
                      <span className="text-sm text-muted-foreground">
                        HTTP {log.statusCode}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-medium">
                    {formatResponseTime(log.responseTime)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Response time
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default StatusHistory;