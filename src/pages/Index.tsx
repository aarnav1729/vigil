import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ApplicationCard from "@/components/dashboard/ApplicationCard";
import ApplicationForm from "@/components/forms/ApplicationForm";
import EmptyState from "@/components/dashboard/EmptyState";
import {
  initializeDatabase,
  getApplications,
  addApplication,
  updateApplication,
  deleteApplication,
} from "@/lib/database";

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
  const [summary, setSummary] = useState<{
    total: number;
    up: number;
    down: number;
    unknown?: number;
    avgResponseTimeAll: number;
  } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    initializeApp();
    loadSummary();
  }, []);

  const initializeApp = async () => {
    try {
      await initializeDatabase();
      await loadApplications();
      await loadSummary();
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

  const loadSummary = async () => {
    try {
      const res = await api<{
        ok: boolean;
        summary: {
          total: number;
          up: number;
          down: number;
          unknown?: number;
          avgResponseTimeAll: number;
        };
      }>("/api/summary");
      setSummary(res.summary);
    } catch (e) {
      console.warn("Failed to load summary:", e);
    }
  };

  const loadApplications = async () => {
    try {
      // Attempt to fetch from backend first and reconcile to local DB
      let serverApps: Application[] = [];
      try {
        const resp = await api<{ apps: Application[] }>("/api/apps");
        serverApps = resp.apps || [];
      } catch (err) {
        console.warn(
          "Failed to fetch apps from backend (continuing with local DB):",
          err
        );
      }

      // VIGIL_SYNC_FIX: if we have server apps, treat them as the source of truth
      if (serverApps.length > 0) {
        try {
          const db = await initializeDatabase();
          const tx = db.transaction("applications", "readwrite");

          // wipe out ALL local entries – avoid zombie IDs like 5 that don't exist on server
          await tx.store.clear();

          for (const s of serverApps) {
            if (!s.id) continue;
            await tx.store.put({
              id: s.id,
              name: s.name,
              url: s.url,
              createdAt: s.createdAt || Date.now(),
            } as Application);
          }

          await tx.done;
        } catch (e) {
          console.warn("Failed to sync server apps into local DB:", e);
        }

        // Render directly from serverApps (canonical)
        setApplications(
          serverApps.map((s) => ({
            id: s.id,
            name: s.name,
            url: s.url,
            createdAt: s.createdAt || Date.now(),
          }))
        );
        return;
      }

      // If no server apps or server unreachable, fall back to local DB (offline mode)
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
      await loadSummary();
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
      await loadSummary();
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

        {summary && (
          <div className="px-6 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg border border-card-border">
              <div className="text-xs text-muted-foreground">Total Apps</div>
              <div className="text-2xl font-bold">{summary.total}</div>
            </div>
            <div className="p-4 rounded-lg border border-card-border">
              <div className="text-xs text-muted-foreground">Up</div>
              <div className="text-2xl font-bold text-success">
                {summary.up}
              </div>
            </div>
            <div className="p-4 rounded-lg border border-card-border">
              <div className="text-xs text-muted-foreground">Down</div>
              <div className="text-2xl font-bold text-destructive">
                {summary.down}
              </div>
            </div>
            <div className="p-4 rounded-lg border border-card-border">
              <div className="text-xs text-muted-foreground">
                Avg Response (24h)
              </div>
              <div className="text-2xl font-bold">
                {summary.avgResponseTimeAll
                  ? `${Math.round(summary.avgResponseTimeAll)}ms`
                  : "-"}
              </div>
            </div>
          </div>
        )}

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
