"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Rocket, Clock, Search, X } from "lucide-react";
import { deploymentsService } from "@/lib/services/deployments";
import { siteService } from "@/lib/services/sites";
import { toast } from "sonner";

interface DeployDialogProps {
  pluginVersionId: number;
  pluginName: string;
  version: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSiteIds?: number[];
  defaultSiteSummary?: Map<number, { name: string; url: string }>;
  lockMode?: "all" | "select";
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
  defaultSiteIds,
  defaultSiteSummary,
  lockMode,
}: DeployDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"all" | "select">(lockMode ?? "all");
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<Map<number, { name: string; url: string }>>(new Map());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [loadingSites, setLoadingSites] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const intentionalCloseRef = useRef(false);

  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  }, []);

  // Pre-selection from caller
  useEffect(() => {
    if (open && defaultSiteIds && defaultSiteIds.length > 0) {
      setSelectedSiteIds(defaultSiteIds);
      setMode(lockMode ?? "select");
      if (defaultSiteSummary) {
        setSelectedSummary(new Map(defaultSiteSummary));
      }
    }
  }, [open, defaultSiteIds, defaultSiteSummary, lockMode]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch sites when in select mode or search changes
  useEffect(() => {
    if (open && mode === "select") {
      fetchSites(search);
    }
  }, [open, mode, search]);

  const fetchSites = async (q: string) => {
    setLoadingSites(true);
    try {
      const res = await siteService.list({
        status: "connected",
        per_page: 50,
        ...(q ? { search: q } : {}),
      });
      const list: SiteOption[] = res.data.data || [];
      setSites(list);
      setSelectedSummary((prev) => {
        const next = new Map(prev);
        list.forEach((s) => {
          if (selectedSiteIds.includes(s.id) && !next.has(s.id)) {
            next.set(s.id, { name: s.name, url: s.url });
          }
        });
        return next;
      });
    } catch {
      toast.error("Failed to load sites");
    } finally {
      setLoadingSites(false);
    }
  };

  const toggleSite = (site: SiteOption) => {
    setSelectedSiteIds((prev) =>
      prev.includes(site.id) ? prev.filter((id) => id !== site.id) : [...prev, site.id]
    );
    setSelectedSummary((prev) => {
      const next = new Map(prev);
      if (next.has(site.id)) {
        next.delete(site.id);
      } else {
        next.set(site.id, { name: site.name, url: site.url });
      }
      return next;
    });
  };

  const removeSelected = (siteId: number) => {
    setSelectedSiteIds((prev) => prev.filter((id) => id !== siteId));
    setSelectedSummary((prev) => {
      const next = new Map(prev);
      next.delete(siteId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = sites.map((s) => s.id);
    const allSelected = visibleIds.every((id) => selectedSiteIds.includes(id));
    if (allSelected) {
      setSelectedSiteIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      setSelectedSummary((prev) => {
        const next = new Map(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedSiteIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
      setSelectedSummary((prev) => {
        const next = new Map(prev);
        sites.forEach((s) => next.set(s.id, { name: s.name, url: s.url }));
        return next;
      });
    }
  };

  const clearAllSelected = () => {
    setSelectedSiteIds([]);
    setSelectedSummary(new Map());
  };

  const targetCount = mode === "all" ? "all" : selectedSiteIds.length;

  const resetForm = () => {
    setMode(lockMode ?? "all");
    setSelectedSiteIds([]);
    setSelectedSummary(new Map());
    setSearchInput("");
    setSearch("");
    setNote("");
    setScheduleEnabled(false);
    setScheduledAt("");
  };

  const requestClose = () => {
    intentionalCloseRef.current = true;
    onOpenChange(false);
  };

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
      } = { plugin_version_id: pluginVersionId };
      if (mode === "all") {
        payload.all_sites = true;
      } else {
        payload.site_ids = selectedSiteIds;
      }
      if (note.trim()) payload.note = note.trim();
      if (scheduleEnabled && scheduledAt) {
        (payload as Record<string, unknown>).scheduled_at = new Date(scheduledAt).toISOString();
      }
      const res = await deploymentsService.create(payload);
      const deploymentId = res.data.data?.id;
      toast.success(scheduleEnabled ? "Deployment scheduled!" : "Deployment created!");
      intentionalCloseRef.current = true;
      onOpenChange(false);
      resetForm();
      router.push(deploymentId ? `/deployments/${deploymentId}` : "/deployments");
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to create deployment";
      toast.error(message);
      console.error("deploy failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedNotInVisible = Array.from(selectedSummary.entries()).filter(
    ([id]) => !sites.some((s) => s.id === id)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          if (
            !intentionalCloseRef.current &&
            mode === "select" &&
            selectedSiteIds.length > 0
          ) {
            const ok = window.confirm(
              `You have ${selectedSiteIds.length} site${selectedSiteIds.length === 1 ? "" : "s"} selected. Close without deploying?`
            );
            if (!ok) return;
          }
          intentionalCloseRef.current = false;
          resetForm();
        }
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Push to Sites
          </DialogTitle>
          <DialogDescription>
            Deploy <strong>{pluginName}</strong> v{version} to your sites.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* --- Target mode --- */}
          {!lockMode && (
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
                    onChange={() => setMode("select")}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Select specific sites</span>
                </label>
              </div>
            </div>
          )}

          {/* --- Site picker --- */}
          {mode === "select" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search sites by name or URL..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedSiteIds.length} selected
                  {sites.length > 0 && ` · ${sites.length} match${sites.length === 1 ? "" : "es"} shown`}
                </span>
                <div className="flex items-center gap-2">
                  {sites.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={toggleAllVisible} type="button">
                      {sites.every((s) => selectedSiteIds.includes(s.id))
                        ? "Deselect shown"
                        : "Select shown"}
                    </Button>
                  )}
                  {selectedSiteIds.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearAllSelected} type="button">
                      Clear all
                    </Button>
                  )}
                </div>
              </div>

              {/* --- Selected chips for sites not in current results --- */}
              {selectedNotInVisible.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Selected ({selectedNotInVisible.length} not in current results):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNotInVisible.map(([id, info]) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs"
                      >
                        <span className="max-w-40 truncate">{info.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSelected(id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${info.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* --- Results list --- */}
              <div className="max-h-72 overflow-y-auto border rounded-md p-2 space-y-1">
                {loadingSites ? (
                  <p className="text-sm text-muted-foreground p-2">Loading sites...</p>
                ) : sites.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-2">
                    {search ? "No sites match this search." : "No connected sites available."}
                  </p>
                ) : (
                  sites.map((site) => (
                    <label
                      key={site.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedSiteIds.includes(site.id)}
                        onChange={() => toggleSite(site)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{site.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Type to search across all 200+ sites. Selections persist across searches.
              </p>
            </div>
          )}

          {/* --- Note --- */}
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

          {/* --- Schedule --- */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
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

          {/* --- Confirmation summary --- */}
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
          <Button variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              (mode === "select" && selectedSiteIds.length === 0) ||
              (scheduleEnabled && !scheduledAt)
            }
          >
            {scheduleEnabled ? (
              <>
                <Clock className="mr-2 h-4 w-4" />
                {submitting ? "Scheduling..." : "Schedule"}
              </>
            ) : (
              <>
                <Rocket className="mr-2 h-4 w-4" />
                {submitting ? "Deploying..." : "Deploy"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
