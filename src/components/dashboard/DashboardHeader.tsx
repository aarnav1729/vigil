import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DashboardHeaderProps {
  onAddApplication: () => void;
}

const DashboardHeader = ({ onAddApplication }: DashboardHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-6 border-b border-card-border">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Vigil
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitor your applications' uptime in real-time
        </p>
      </div>
      <Button 
        onClick={onAddApplication}
        className="bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Application
      </Button>
    </div>
  );
};

export default DashboardHeader;