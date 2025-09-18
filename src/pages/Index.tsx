import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import ApplicationCard from '@/components/dashboard/ApplicationCard';
import ApplicationForm from '@/components/forms/ApplicationForm';
import EmptyState from '@/components/dashboard/EmptyState';
import { 
  Application, 
  getApplications, 
  addApplication, 
  updateApplication, 
  deleteApplication,
  initializeDatabase 
} from '@/lib/database';

const Index = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      await initializeDatabase();
      await loadApplications();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      toast({
        title: "Initialization Error",
        description: "Failed to initialize the database. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      const apps = await getApplications();
      setApplications(apps);
    } catch (error) {
      console.error('Failed to load applications:', error);
      toast({
        title: "Loading Error",
        description: "Failed to load applications.",
        variant: "destructive",
      });
    }
  };

  const handleAddApplication = () => {
    setEditingApp(null);
    setShowForm(true);
  };

  const handleEditApplication = (app: Application) => {
    setEditingApp(app);
    setShowForm(true);
  };

  const handleFormSubmit = async (data: { name: string; url: string }) => {
    try {
      if (editingApp && editingApp.id) {
        await updateApplication(editingApp.id, data);
        toast({
          title: "Application Updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        await addApplication(data);
        toast({
          title: "Application Added",
          description: `${data.name} is now being monitored.`,
        });
      }
      await loadApplications();
    } catch (error) {
      console.error('Failed to save application:', error);
      toast({
        title: "Save Error",
        description: "Failed to save the application. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleDeleteApplication = async (id: number) => {
    try {
      await deleteApplication(id);
      await loadApplications();
      toast({
        title: "Application Deleted",
        description: "The application and its monitoring data have been removed.",
      });
    } catch (error) {
      console.error('Failed to delete application:', error);
      toast({
        title: "Delete Error",
        description: "Failed to delete the application. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (app: Application) => {
    if (app.id) {
      navigate(`/app/${app.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Initializing Vigil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader onAddApplication={handleAddApplication} />
        
        <div className="p-6">
          {applications.length === 0 ? (
            <EmptyState onAddApplication={handleAddApplication} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {applications.map((app) => (
                <ApplicationCard
                  key={app.id}
                  application={app}
                  onEdit={handleEditApplication}
                  onDelete={handleDeleteApplication}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ApplicationForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleFormSubmit}
        application={editingApp || undefined}
        title={editingApp ? 'Edit Application' : 'Add New Application'}
      />
    </div>
  );
};

export default Index;
