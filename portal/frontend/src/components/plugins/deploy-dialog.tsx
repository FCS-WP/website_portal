"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Rocket, Clock } from "lucide-react";
import { deploymentsService } from "@/lib/services/deployments";
import { siteService } from "@/lib/services/sites";
import { toast } from "sonner";

interface DeployDialogProps {
  pluginVersionId: number;
  pluginName: string;
  version: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SiteOption {
  id: number;
  name: string;
  url: string;
  status: string;
}

export function DeployDialog({
  pluginVersionId,
  pluginName,
  version,
  open,
  onOpenChange,
}: DeployDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"all" | "select">("all");
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // Minimum datetime for scheduling (now + 5 min)
  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  useEffect(() => {
    if (open && mode === "select" && sites.length === 0) {
      fetchSites();
    }
  }, [open, mode, sites.length]);

  const fetchSites = async () => {
    setLoadingSites(true);
    try {
      const res = await siteService.list({ status: "connected" });
      setSites(res.data.data || []);
    } catch {
      toast.error("Failed to load sites");
    } finally {
      setLoadingSites(false);
    }
  };

  const toggleSite = (siteId: number) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  };

  const toggleAll = () => {
    if (selectedSiteIds.length === sites.length) {
      setSelectedSiteIds([]);
    } else {
      setSelectedSiteIds(sites.map((s) => s.id));
    }
  };

  const targetCount = mode === "all" ? "all" : selectedSiteIds.length;

  const handleSubmit = async () => {
    if (mode === "select" && selectedSiteIds.length === 0) {
      toast.error("Please select at least one site");
      return;
    }

    setSubmitting(true);
    try {
      const payload: {
        plugin_version_id: number;
        site_ids?: number[];
        all_sites?: boolean;
        note?: string;
      } = {
        plugin_version_id: pluginVersionId,
      };

      if (mode === "all") {
        payload.all_sites = true;
      } else {
        payload.site_ids = selectedSiteIds;
      }

      if (note.trim()) {
        payload.note = note.trim();
      }

      if (scheduleEnabled && scheduledAt) {
        (payload as Record<string, unknown>).scheduled_at = new Date(scheduledAt).toISOString();
      }

      const res = await deploymentsService.create(payload);
      const deploymentId = res.data.data?.id;
      toast.success(scheduleEnabled ? "Deployment scheduled!" : "Deployment created!");
      onOpenChange(false);
      resetForm();
      if (deploymentId) {
        router.push(`/deployments/${deploymentId}`);
      } else {
        router.push("/deployments");
      }
    } catch {
      toast.error("Failed to create deployment");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setMode("all");
    setSelectedSiteIds([]);
    setNote("");
    setScheduleEnabled(false);
    setScheduledAt("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Push to Sites
          </DialogTitle>
          <DialogDescription>
            Deploy <strong>{pluginName}</strong> v{version} to your sites.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode selection */}
          <div className="space-y-3">
            <Label>Target Sites</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="deploy-mode"
                  checked={mode === "all"}
                  onChange={() => setMode("all")}
                  className="h-4 w-4"
                />
                <span className="text-sm">All connected sites</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="deploy-mode"
                  checked={mode === "select"}
                  onChange={() => {
                    setMode("select");
                    if (sites.length === 0) fetchSites();
                  }}
                  className="h-4 w-4"
                />
                <span className="text-sm">Select specific sites</span>
              </label>
            </div>
          </div>

          {/* Site checkboxes */}
          {mode === "select" && (
            <div className="space-y-2">
              {loadingSites ? (
                <p className="text-sm text-muted-foreground">Loading sites...</p>
              ) : sites.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No connected sites available.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedSiteIds.length} of {sites.length} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleAll}
                      type="button"
                    >
                      {selectedSiteIds.length === sites.length
                        ? "Deselect All"
                        : "Select All"}
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                    {sites.map((site) => (
                      <label
                        key={site.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSiteIds.includes(site.id)}
                          onChange={() => toggleSite(site.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {site.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {site.url}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="deploy-note">Note (optional)</Label>
            <Textarea
              id="deploy-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a deployment note..."
              rows={2}
            />
          </div>

          {/* Schedule for later */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Schedule for later</span>
            </label>
            {scheduleEnabled && (
              <div className="flex items-center gap-3 pl-6">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minDatetime}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">Asia/Ho_Chi_Minh</span>
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm">
              Deploy <strong>{pluginName}</strong> v{version} to{" "}
              <strong>{targetCount}</strong> site
              {targetCount !== 1 && targetCount !== "all" ? "s" : ""}
              {targetCount === "all" ? "s" : ""}?
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || (mode === "select" && selectedSiteIds.length === 0) || (scheduleEnabled && !scheduledAt)}
          >
            {scheduleEnabled ? (
              <><Clock className="mr-2 h-4 w-4" />{submitting ? "Scheduling..." : "Schedule"}</>
            ) : (
              <><Rocket className="mr-2 h-4 w-4" />{submitting ? "Deploying..." : "Deploy"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
