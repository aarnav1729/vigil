import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Application } from "@/lib/database";

interface ApplicationFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    url: string;
    alertEmails?: string;
  }) => Promise<void>;
  application?: Application & { alertEmails?: string };
  title: string;
}

const ApplicationForm = ({
  open,
  onClose,
  onSubmit,
  application,
  title,
}: ApplicationFormProps) => {
  const [name, setName] = useState(application?.name || "");
  const [url, setUrl] = useState(application?.url || "");
  const [alertEmails, setAlertEmails] = useState(
    application?.alertEmails || ""
  );
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    url?: string;
    alertEmails?: string;
  }>({});

  const validateForm = () => {
    const newErrors: { name?: string; url?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Application name is required";
    }

    if (!url.trim()) {
      newErrors.url = "URL is required";
    } else {
      try {
        const urlObj = new URL(url);
        if (!["http:", "https:"].includes(urlObj.protocol)) {
          newErrors.url = "URL must use HTTP or HTTPS protocol";
        }
        // validate alertEmails (optional) - comma separated list
        if (alertEmails.trim()) {
          const parts = alertEmails
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (parts.some((p) => !emailRegex.test(p))) {
            newErrors.alertEmails =
              "Please provide comma-separated valid email addresses";
          }
        }
      } catch {
        newErrors.url = "Please enter a valid URL";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        alertEmails: alertEmails.trim() || undefined,
      });
      handleClose();
    } catch (error) {
      console.error("Failed to save application:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName(application?.name || "");
    setUrl(application?.url || "");
    setAlertEmails(application?.alertEmails || "");
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Application Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Blog"
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://my-blog.com"
              className={errors.url ? "border-destructive" : ""}
            />
            {errors.url && (
              <p className="text-sm text-destructive">{errors.url}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="alertEmails">Alert Emails (comma-separated)</Label>
            <Input
              id="alertEmails"
              value={alertEmails}
              onChange={(e) => setAlertEmails(e.target.value)}
              placeholder="ops@example.com,admin@example.com"
              className={errors.alertEmails ? "border-destructive" : ""}
            />
            {errors.alertEmails && (
              <p className="text-sm text-destructive">{errors.alertEmails}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Optional. Notifications will be sent to these addresses when the
              app is down.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-gradient-primary hover:opacity-90"
            >
              {loading ? "Saving..." : "Save Application"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ApplicationForm;
