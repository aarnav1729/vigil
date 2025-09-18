import { Monitor, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  onAddApplication: () => void;
}

const EmptyState = ({ onAddApplication }: EmptyStateProps) => {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-md border-card-border bg-card/50 backdrop-blur-sm">
        <CardContent className="text-center p-8 space-y-6">
          <div className="w-16 h-16 mx-auto bg-gradient-primary rounded-2xl flex items-center justify-center shadow-elegant">
            <Monitor className="w-8 h-8 text-primary-foreground" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Welcome to Vigil</h3>
            <p className="text-muted-foreground">
              Start monitoring your applications by adding your first URL. 
              We'll check its status every hour and notify you of any issues.
            </p>
          </div>
          
          <Button 
            onClick={onAddApplication}
            className="bg-gradient-primary hover:opacity-90 transition-opacity shadow-elegant"
            size="lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Your First Application
          </Button>
          
          <div className="pt-4 border-t border-card-border">
            <p className="text-sm text-muted-foreground">
              💡 Tip: You can monitor any website or API endpoint
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmptyState;