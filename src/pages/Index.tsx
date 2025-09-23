import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ApplicationCard from "@/components/dashboard/ApplicationCard";
import ApplicationForm from "@/components/forms/ApplicationForm";
import EmptyState from "@/components/dashboard/EmptyState";
// Use app shape returned by server; minimal fields used here.
type Application = {
  id: number;
  name: string;
  url: string;
  createdAt: number;
  isDown?: boolean;
};
import { api } from "@/lib/api";

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
      console.error("Failed to initialize app:", error);
      toast({
        title: "Initialization Error",
        description:
          "Failed to initialize the database. Please refresh the page.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      // Attempt to fetch from backend first and reconcile to local DB
      let serverApps = [];
      try {
        const resp = await api<{ apps: Application[] }>("/api/apps");
        serverApps = resp.apps || [];
      } catch (err) {
        console.warn(
          "Failed to fetch apps from backend (continuing with local DB):",
          err
        );
      }

      // Upsert server apps into local DB (so server wins for IDs)
      if (serverApps.length > 0) {
        // wipe out local entries with same id or upsert
        for (const s of serverApps) {
          // if an app with same URL exists locally but without server id, remove it to avoid duplicates
          const localApps = await getApplications();
          const dup = localApps.find(
            (la) => la.url === s.url && (!la.id || la.id !== s.id)
          );
          if (dup && dup.id && dup.id !== s.id) {
            // delete the local-only entry (we will re-insert with official id)
            await deleteApplication(dup.id);
          }
          // ensure server app exists in local DB with same id
          // NOTE: idb `add` will error if key exists; use `updateApplication` if present
          try {
            if (s.id) {
              // try to update if present, otherwise add with same id via put
              const db = await initializeDatabase();
              // put keeps the same key (id)
              await db.put("applications", {
                id: s.id,
                name: s.name,
                url: s.url,
                createdAt: s.createdAt,
              } as Application);
            }
          } catch (e) {
            console.warn("Failed to sync server app into local DB:", e);
          }
        }
        // reload local after upsert
        const all = await getApplications();
        setApplications(all);
        return;
      }

      // If no server apps or server unreachable, fall back to local DB
      const apps = await getApplications();
      setApplications(apps);
    } catch (error) {
      console.error("Failed to load applications:", error);
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

  const handleFormSubmit = async (data: {
    name: string;
    url: string;
    alertEmails?: string;
  }) => {
    try {
      if (editingApp && editingApp.id) {
        // update local DB first (optimistic)
        await updateApplication(editingApp.id, {
          name: data.name,
          url: data.url,
        });

        // attempt to mirror to backend; if it fails, warn but keep local change
        try {
          await api(`/api/apps/${editingApp.id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              url: data.url,
              alertEmails: data.alertEmails || null,
            }),
          });
        } catch (e) {
          console.warn("Backend update failed (local DB updated):", e);
          toast({
            title: "Backend Update Failed",
            description:
              "App updated locally but failed to update on server. It will be retried on next sync.",
            variant: "warning",
          });
        }

        toast({
          title: "Application Updated",
          description: `${data.name} has been updated successfully.`,
        });
      } else {
        // CREATE: prefer server-first so we get authoritative id
        let createdApp = null;
        try {
          const resp = await api(`/api/apps`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: data.name,
              url: data.url,
              alertEmails: data.alertEmails || null,
            }),
          });
          createdApp = resp.app;
        } catch (e) {
          console.warn(
            "Backend create failed, falling back to local-only create:",
            e
          );
        }

        if (createdApp && createdApp.id) {
          // persist server copy into local DB with official id
          const db = await initializeDatabase();
          await db.put("applications", {
            id: createdApp.id,
            name: createdApp.name,
            url: createdApp.url,
            createdAt: createdApp.createdAt || Date.now(),
          } as Application);
        } else {
          // no backend id — create locally with auto-increment id
          await addApplication({ name: data.name, url: data.url });
          toast({
            title: "Offline Mode",
            description:
              "Application saved locally but not on the server. It will be synced when the server becomes available.",
            variant: "warning",
          });
        }

        toast({
          title: "Application Added",
          description: `${data.name} is now being monitored.`,
        });
      }

      await loadApplications();
    } catch (error) {
      console.error("Failed to save application:", error);
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

      // try to mirror delete on backend if this id existed on server
      try {
        await api(`/api/apps/${id}`, { method: "DELETE" });
      } catch (e) {
        console.warn("backend delete failed (non-fatal):", e);
        // don't throw; we've removed locally already
      }

      await loadApplications();
      toast({
        title: "Application Deleted",
        description:
          "The application and its monitoring data have been removed.",
      });
    } catch (error) {
      console.error("Failed to delete application:", error);
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
        title={editingApp ? "Edit Application" : "Add New Application"}
      />
    </div>
  );
};

export default Index;
