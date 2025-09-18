import { useState, useEffect } from 'react';
import { MoreHorizontal, ExternalLink, Edit, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Application, StatusLog, getLatestStatusLog, calculateUptime } from '@/lib/database';
import { getStatusColor, formatResponseTime } from '@/lib/monitoring';

interface ApplicationCardProps {
  application: Application;
  onEdit: (app: Application) => void;
  onDelete: (id: number) => void;
  onViewDetails: (app: Application) => void;
}

const ApplicationCard = ({ application, onEdit, onDelete, onViewDetails }: ApplicationCardProps) => {
  const [latestLog, setLatestLog] = useState<StatusLog | null>(null);
  const [uptime, setUptime] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (application.id) {
      loadApplicationData();
    }
  }, [application.id]);

  const loadApplicationData = async () => {
    if (!application.id) return;
    
    try {
      const [log, uptimePercent] = await Promise.all([
        getLatestStatusLog(application.id),
        calculateUptime(application.id),
      ]);
      
      setLatestLog(log || null);
      setUptime(uptimePercent);
    } catch (error) {
      console.error('Failed to load application data:', error);
    } finally {
      setLoading(false);
    }
  };

  const status = latestLog?.status || 'CHECKING';
  const statusColor = getStatusColor(status);
  const lastChecked = latestLog ? new Date(latestLog.timestamp).toLocaleString() : 'Never';
  const responseTime = latestLog?.responseTime ? formatResponseTime(latestLog.responseTime) : '-';

  return (
    <Card className="card-hover border-card-border bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${
            status === 'UP' ? 'bg-success status-success' :
            status === 'DOWN' ? 'bg-destructive status-destructive' :
            'bg-warning status-warning'
          } ${loading ? 'status-pulse' : ''}`} />
          <div>
            <h3 className="font-semibold text-lg">{application.name}</h3>
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {application.url}
            </p>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onViewDetails(application)}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(application)}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => application.id && onDelete(application.id)}
              className="text-destructive focus:text-destructive-foreground focus:bg-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Badge 
            variant={status === 'UP' ? 'default' : status === 'DOWN' ? 'destructive' : 'secondary'}
            className={`
              ${status === 'UP' ? 'bg-success text-success-foreground' : ''}
              ${status === 'DOWN' ? 'bg-destructive text-destructive-foreground' : ''}
              ${status === 'CHECKING' ? 'bg-warning text-warning-foreground' : ''}
              font-medium
            `}
          >
            {status}
          </Badge>
          <span className="text-sm font-medium">
            {responseTime}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Uptime (24h)</p>
            <p className="font-semibold text-lg">
              {uptime.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Check</p>
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <p className="font-medium text-xs truncate">
                {lastChecked}
              </p>
            </div>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => onViewDetails(application)}
        >
          View Details
        </Button>
      </CardContent>
    </Card>
  );
};

export default ApplicationCard;