"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  RotateCcw,
  XCircle,
  Search,
  CheckCircle2,
  XOctagon,
  Loader2,
  Clock,
  Wrench,
  ShieldCheck,
  Undo2,
  AlertTriangle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deploymentsService } from "@/lib/services/deployments";
import { DeploymentJob, DeploymentJobSite, DeploymentProgress } from "@/types";
import { toast } from "sonner";
import { formatDistanceToNow, format, differenceInSeconds } from "date-fns";

// --- Status color helpers ---
const jobStatusConfig: Record<string, { bg: string; text: string; label: string }> = {
  queued: { bg: "bg-gray-500/20", text: "text-gray-400", label: "Queued" },
  running: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Running" },
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Completed" },
  failed: { bg: "bg-red-500/20", text: "text-red-400", label: "Failed" },
  cancelled: { bg: "bg-yellow-500/20", text: "text-yellow-400", label: "Cancelled" },
};

// --- Helper: format elapsed time ---
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function DeploymentDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [deployment, setDeployment] = useState<DeploymentJob | null>(null);
  const [progress, setProgress] = useState<DeploymentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tabFilter, setTabFilter] = useState<"all" | "success" | "failed">("all");
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [rollbackingSiteId, setRollbackingSiteId] = useState<number | null>(null);

  const sites: DeploymentJobSite[] = deployment?.sites || [];

  const fetchDeployment = useCallback(async () => {
    try {
      const res = await deploymentsService.show(id);
      setDeployment(res.data.data);
    } catch {
      toast.error("Failed to load deployment details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await deploymentsService.progress(id);
      setProgress(res.data.data);
    } catch {
      // silent
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchDeployment();
      fetchProgress();
    }
  }, [id, fetchDeployment, fetchProgress]);

  // Auto-polling: 3s for progress, 10s for full data
  useEffect(() => {
    const shouldPoll =
      deployment?.status === "queued" || deployment?.status === "running";

    if (shouldPoll) {
      progressIntervalRef.current = setInterval(fetchProgress, 3000);
      fullIntervalRef.current = setInterval(fetchDeployment, 10000);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (fullIntervalRef.current) {
        clearInterval(fullIntervalRef.current);
        fullIntervalRef.current = null;
      }
    };
  }, [deployment?.status, fetchProgress, fetchDeployment]);

  const handleRetryFailed = async () => {
    setRetrying(true);
    try {
      await deploymentsService.retryFailed(id);
      toast.success("Retrying failed deployments...");
      fetchDeployment();
      fetchProgress();
    } catch {
      toast.error("Failed to retry");
    } finally {
      setRetrying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await deploymentsService.cancel(id);
      toast.success("Deployment cancelled");
      fetchDeployment();
      fetchProgress();
    } catch {
      toast.error("Failed to cancel deployment");
    } finally {
      setCancelling(false);
    }
  };

  const handleSelectAllFailed = () => {
    const failedIds = sites.filter((s) => s.status === "failed").map((s) => s.id);
    setSelectedSites(new Set(failedIds));
  };

  const handleRetrySelected = async () => {
    if (selectedSites.size === 0) return;
    setRetrying(true);
    try {
      await deploymentsService.retryFailed(id);
      toast.success(`Retrying ${selectedSites.size} sites...`);
      setSelectedSites(new Set());
      fetchDeployment();
      fetchProgress();
    } catch {
      toast.error("Failed to retry selected");
    } finally {
      setRetrying(false);
    }
  };

  // Computed values
  const progressTotal = progress?.total || deployment?.total_sites || 0;
  const progressSuccess = progress?.success || deployment?.success_count || 0;
  const progressFailed = progress?.failed || deployment?.failed_count || 0;
  const progressPending = progress?.pending || 0;
  const progressRunning = progress?.running || 0;
  const progressHealthy = progress?.healthy || sites.filter((s) => s.status === "healthy").length;
  const progressRolledBack = progress?.rolled_back || sites.filter((s) => s.status === "rolled_back").length;

  const successPercent = progressTotal > 0 ? ((progressSuccess / progressTotal) * 100).toFixed(1) : "0";
  const failureRate = progressTotal > 0 ? ((progressFailed / progressTotal) * 100).toFixed(1) : "0";
  const completedCount = progressSuccess + progressFailed;
  const overallPercent = progressTotal > 0 ? Math.round((completedCount / progressTotal) * 100) : 0;

  // Elapsed time
  const elapsed = useMemo(() => {
    if (!deployment?.started_at) return 0;
    const end = deployment.finished_at ? new Date(deployment.finished_at) : new Date();
    return differenceInSeconds(end, new Date(deployment.started_at));
  }, [deployment?.started_at, deployment?.finished_at]);

  // Avg per site
  const avgPerSite = useMemo(() => {
    if (progressSuccess === 0 || elapsed === 0) return 0;
    return elapsed / progressSuccess;
  }, [elapsed, progressSuccess]);

  // Estimated remaining
  const estimatedRemaining = useMemo(() => {
    const remaining = progressPending + progressRunning;
    if (avgPerSite === 0 || remaining === 0) return 0;
    return Math.round((avgPerSite * remaining) / 10); // workers=10 parallelism
  }, [avgPerSite, progressPending, progressRunning]);

  // Slowest site
  const slowestSite = useMemo(() => {
    const completedSites = sites.filter((s) => s.status === "success" || s.status === "failed");
    if (completedSites.length === 0) return 0;
    let maxDuration = 0;
    completedSites.forEach((s) => {
      if (s.deployed_at && deployment?.started_at) {
        const dur = differenceInSeconds(new Date(s.deployed_at), new Date(deployment.started_at));
        if (dur > maxDuration) maxDuration = dur;
      }
    });
    return maxDuration;
  }, [sites, deployment?.started_at]);

  // Filtered sites for table
  const filteredSites = useMemo(() => {
    let filtered = sites;
    if (tabFilter === "success") filtered = sites.filter((s) => s.status === "success");
    else if (tabFilter === "failed") filtered = sites.filter((s) => s.status === "failed");

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) => s.site?.name?.toLowerCase().includes(q) || s.site?.url?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [sites, tabFilter, searchQuery]);

  // Live log events (derived from sites - most recently deployed first)
  const liveEvents = useMemo(() => {
    const events: {
      time: string;
      icon: "success" | "failed" | "running" | "started";
      text: string;
    }[] = [];

    // Sites with deployed_at or running status
    const sitesWithTime = sites
      .filter((s) => s.deployed_at || s.status === "running")
      .sort((a, b) => {
        const ta = a.deployed_at || "";
        const tb = b.deployed_at || "";
        return tb.localeCompare(ta);
      });

    sitesWithTime.slice(0, 7).forEach((s) => {
      const time = s.deployed_at ? format(new Date(s.deployed_at), "HH:mm") : format(new Date(), "HH:mm");
      const siteName = s.site?.name || `Site #${s.site_id}`;
      if (s.status === "success") {
        events.push({ time, icon: "success", text: `${siteName} — success in ${avgPerSite.toFixed(1)}s` });
      } else if (s.status === "failed") {
        const reason = s.error_message ? s.error_message.split(" — ")[0] : "error";
        events.push({
          time,
          icon: "failed",
          text: `${siteName} — retry #${s.attempt_count} failed (${reason})`,
        });
      } else if (s.status === "running") {
        events.push({ time, icon: "running", text: `Deploying to ${siteName}...` });
      }
    });

    // Add job started event
    if (deployment?.started_at) {
      events.push({
        time: format(new Date(deployment.started_at), "HH:mm"),
        icon: "started",
        text: "Job started — 10 workers initialized",
      });
    }

    return events.slice(0, 8);
  }, [sites, deployment?.started_at, avgPerSite]);

  const canRetry = (deployment?.failed_count || 0) > 0;
  const canCancel = deployment?.status === "queued" || deployment?.status === "running";

  const pluginName = deployment?.plugin_version?.plugin?.name || "Plugin";
  const pluginSlug = deployment?.plugin_version?.plugin?.slug || pluginName;
  const pluginVersion = deployment?.plugin_version?.version || "—";
  const changelogType = deployment?.plugin_version?.changelog?.type;

  // Count per filter tab
  const allCount = sites.length;
  const successCount = sites.filter((s) => s.status === "success").length;
  const failedCount = sites.filter((s) => s.status === "failed").length;

  const handleRollbackSite = async (siteJobId: number) => {
    setRollbackingSiteId(siteJobId);
    try {
      const res = await deploymentsService.rollbackSite(siteJobId);
      const version = res.data?.data?.rollback_version;
      toast.success(version ? `Rollback initiated — restoring to ${version}` : "Rollback initiated");
      fetchDeployment();
      fetchProgress();
    } catch {
      toast.error("Failed to initiate rollback");
    } finally {
      setRollbackingSiteId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Deployment not found.</p>
      </div>
    );
  }

  const statusCfg = jobStatusConfig[deployment.status] || jobStatusConfig.queued;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/deployments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Deployments
      </Link>

      {/* === HEADER === */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">
              Deployment #DEP-{String(deployment.id).padStart(4, "0")}
            </h1>
            <Badge variant="secondary" className={`${statusCfg.bg} ${statusCfg.text} border-0`}>
              {statusCfg.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{pluginName} v{pluginVersion}</span>
            <span>·</span>
            <span>Initiated by {deployment.initiator?.name || "Unknown"}</span>
            <span>·</span>
            <span>
              Started{" "}
              {deployment.started_at
                ? `${formatDistanceToNow(new Date(deployment.started_at))} ago — ${format(new Date(deployment.started_at), "hh:mm a")}`
                : "Not yet"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryFailed}
              disabled={retrying}
              className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {retrying ? "Retrying..." : `Retry failed (${deployment.failed_count})`}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={cancelling}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              {cancelling ? "Cancelling..." : "Cancel job"}
            </Button>
          )}
        </div>
      </div>

      {/* === METRICS CARDS === */}
      <div className="grid grid-cols-7 gap-4">
        <MetricCard label="TOTAL SITES" value={progressTotal} subtitle="All with plugin installed" color="text-foreground" />
        <MetricCard label="SUCCESS" value={progressSuccess} subtitle={`${successPercent}% complete`} color="text-emerald-400" />
        <MetricCard label="HEALTHY" value={progressHealthy} subtitle="Passed health checks" color="text-green-400" />
        <MetricCard label="FAILED" value={progressFailed} subtitle={`${failureRate}% failure rate`} color="text-red-400" />
        <MetricCard label="ROLLED BACK" value={progressRolledBack} subtitle="Reverted to stable" color="text-rose-600" />
        <MetricCard label="PENDING" value={progressPending} subtitle="In queue" color="text-gray-400" />
        <MetricCard label="RUNNING" value={progressRunning} subtitle="Concurrent slots: 10" color="text-blue-400" />
      </div>

      {/* === PROGRESS SECTION === */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20">
              <Search className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {pluginSlug} → v{pluginVersion}
              </p>
              <p className="text-xs text-muted-foreground">
                Deploying to {progressTotal} sites · 10 concurrent workers · Auto-retry on timeout
              </p>
            </div>
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {progressSuccess + progressFailed} / {progressTotal}
          </span>
        </div>

        {/* Multi-color progress bar */}
        {progressTotal > 0 && (
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
            {progressSuccess > 0 && (
              <div
                className="bg-emerald-500 h-full transition-all duration-500"
                style={{ width: `${(progressSuccess / progressTotal) * 100}%` }}
              />
            )}
            {progressHealthy > 0 && (
              <div
                className="bg-green-400 h-full transition-all duration-500"
                style={{ width: `${(progressHealthy / progressTotal) * 100}%` }}
              />
            )}
            {progressFailed > 0 && (
              <div
                className="bg-red-500 h-full transition-all duration-500"
                style={{ width: `${(progressFailed / progressTotal) * 100}%` }}
              />
            )}
            {progressRolledBack > 0 && (
              <div
                className="bg-rose-800 h-full transition-all duration-500"
                style={{ width: `${(progressRolledBack / progressTotal) * 100}%` }}
              />
            )}
            {progressRunning > 0 && (
              <div
                className="bg-blue-500 h-full transition-all duration-500 animate-pulse"
                style={{ width: `${(progressRunning / progressTotal) * 100}%` }}
              />
            )}
            {progressPending > 0 && (
              <div
                className="bg-gray-500 h-full transition-all duration-500"
                style={{ width: `${(progressPending / progressTotal) * 100}%` }}
              />
            )}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span className="text-sm text-foreground font-medium">
            {overallPercent}% — {progressSuccess} sites done
          </span>
          <span>{progressTotal}</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
          <LegendDot color="bg-emerald-500" label="Success" count={progressSuccess} />
          <LegendDot color="bg-green-400" label="Healthy" count={progressHealthy} />
          <LegendDot color="bg-red-500" label="Failed" count={progressFailed} />
          <LegendDot color="bg-rose-800" label="Rolled Back" count={progressRolledBack} />
          <LegendDot color="bg-blue-500" label="Running" count={progressRunning} />
          <LegendDot color="bg-gray-500" label="Pending" count={progressPending} />
        </div>
      </div>

      {/* === TWO COLUMN SECTION === */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Per-site status table (3 cols) */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Per-site status</h3>
          </div>

          {/* Search + Tab filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search site..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <TabButton active={tabFilter === "all"} onClick={() => setTabFilter("all")}>
                All ({allCount})
              </TabButton>
              <TabButton active={tabFilter === "success"} onClick={() => setTabFilter("success")}>
                Success ({successCount})
              </TabButton>
              <TabButton active={tabFilter === "failed"} onClick={() => setTabFilter("failed")}>
                <span className="text-red-400">Failed ({failedCount})</span>
              </TabButton>
            </div>
          </div>

          <div className="space-y-0 divide-y divide-border">
            <div className="grid grid-cols-[auto_1fr_1fr_80px_100px] gap-3 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="w-5" />
              <div>Site</div>
              <div>Status</div>
              <div>Duration</div>
              <div>Actions</div>
            </div>
            {filteredSites.length > 0 ? (
              filteredSites.slice(0, 8).map((siteJob) => (
                <SiteRow
                  key={siteJob.id}
                  siteJob={siteJob}
                  selected={selectedSites.has(siteJob.id)}
                  onToggle={() => {
                    setSelectedSites((prev) => {
                      const next = new Set(prev);
                      if (next.has(siteJob.id)) next.delete(siteJob.id);
                      else next.add(siteJob.id);
                      return next;
                    });
                  }}
                  startedAt={deployment.started_at}
                  pluginName={pluginName}
                  onRollback={handleRollbackSite}
                  isRollbacking={rollbackingSiteId === siteJob.id}
                />
              ))
            ) : (
              <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                No sites found.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              Showing {Math.min(filteredSites.length, 8)} of {filteredSites.length} sites
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleSelectAllFailed}>
                Select all failed
              </Button>
              <Button
                size="sm"
                className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleRetrySelected}
                disabled={selectedSites.size === 0 || retrying}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Retry selected
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Info Panels (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Job Timing */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Job timing</h3>
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{formatElapsed(elapsed)}</p>
              <p className="text-xs text-muted-foreground mt-1">Elapsed time</p>
            </div>

            {estimatedRemaining > 0 && (
              <div className="space-y-1.5">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Estimated completion: ~{estimatedRemaining} min remaining
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <span className="text-muted-foreground">Started at</span>
              <span className="text-right font-medium text-foreground">
                {deployment.started_at ? format(new Date(deployment.started_at), "hh:mm:ss a") : "—"}
              </span>
              <span className="text-muted-foreground">Avg per site</span>
              <span className="text-right font-medium text-foreground">
                {avgPerSite > 0 ? `${avgPerSite.toFixed(1)}s` : "—"}
              </span>
              <span className="text-muted-foreground">Slowest site</span>
              <span className="text-right font-medium text-foreground">
                {slowestSite > 0 ? `${slowestSite.toFixed(1)}s` : "—"}
              </span>
              <span className="text-muted-foreground">Workers</span>
              <span className="text-right font-medium text-foreground">10 concurrent</span>
              <span className="text-muted-foreground">Max retries</span>
              <span className="text-right font-medium text-foreground">2 per site</span>
            </div>
          </div>

          {/* Job Details */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Job details</h3>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <span className="text-muted-foreground">Job ID</span>
              <span className="text-right font-medium text-foreground">
                DEP-{String(deployment.id).padStart(4, "0")}
              </span>
              <span className="text-muted-foreground">Plugin</span>
              <span className="text-right font-medium text-foreground">{pluginSlug}</span>
              <span className="text-muted-foreground">Version</span>
              <span className="text-right">
                <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">
                  v{pluginVersion}
                </Badge>
              </span>
              <span className="text-muted-foreground">Target</span>
              <span className="text-right font-medium text-foreground">All installed sites</span>
              <span className="text-muted-foreground">Initiated by</span>
              <span className="text-right font-medium text-foreground">
                {deployment.initiator?.name || "Unknown"}
              </span>
              {changelogType && (
                <>
                  <span className="text-muted-foreground">Changelog type</span>
                  <span className="text-right">
                    <Badge variant="secondary" className="border-0 text-xs capitalize">
                      {changelogType}
                    </Badge>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Live Log */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Live log</h3>
              <span className="text-xs text-muted-foreground">Last {liveEvents.length} events</span>
            </div>
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto">
              {liveEvents.length > 0 ? (
                liveEvents.map((evt, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs">
                    <span className="text-muted-foreground whitespace-nowrap font-mono w-10 shrink-0">
                      {evt.time}
                    </span>
                    <LogIcon type={evt.icon} />
                    <span className="text-foreground/80 leading-relaxed">{evt.text}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No events yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function MetricCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: number;
  subtitle: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}

function SiteRow({
  siteJob,
  selected,
  onToggle,
  startedAt,
  pluginName,
  onRollback,
  isRollbacking,
}: {
  siteJob: DeploymentJobSite;
  selected: boolean;
  onToggle: () => void;
  startedAt: string | null;
  pluginName: string;
  onRollback: (id: number) => void;
  isRollbacking: boolean;
}) {
  const siteName = siteJob.site?.name || `Site #${siteJob.site_id}`;
  const hostingName = siteJob.site?.hosting?.name;

  // Calculate duration
  let duration = "—";
  if (siteJob.deployed_at && startedAt) {
    const dur = differenceInSeconds(new Date(siteJob.deployed_at), new Date(startedAt));
    duration = `${dur.toFixed(1)}s`;
  } else if (siteJob.status === "running" && startedAt) {
    const dur = differenceInSeconds(new Date(), new Date(startedAt));
    duration = `${dur.toFixed(1)}s`;
  }

  const canRollback = siteJob.status === "success" || siteJob.status === "healthy";

  return (
    <div className="px-2 py-3">
      <div className="grid grid-cols-[auto_1fr_1fr_80px_100px] gap-3 items-start">
        <div className="pt-0.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-3.5 w-3.5 rounded border-border"
          />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{siteName}</p>
          {hostingName && (
            <p className="text-xs text-muted-foreground">{hostingName}</p>
          )}
        </div>
        <div>
          <SiteStatusBadge status={siteJob.status} />
          {siteJob.status === "failed" && siteJob.error_message && (
            <p className="text-[11px] text-red-400/80 mt-1 leading-snug">
              ⚠ {siteJob.error_message}
            </p>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{duration}</div>
        <div>
          {canRollback && (
            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium border border-red-500/50 text-red-400 rounded-md hover:bg-red-500/10 transition-colors disabled:opacity-50"
                disabled={isRollbacking}
              >
                {isRollbacking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Undo2 className="h-3 w-3" />
                )}
                Rollback
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Rollback {pluginName} on {siteName}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restore the previous stable version.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={() => onRollback(siteJob.id)}
                  >
                    Rollback
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Rolled-back site details */}
      {siteJob.status === "rolled_back" && (
        <div className="ml-8 mt-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 space-y-1.5">
          {siteJob.rollback_reason && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {siteJob.rollback_reason}
            </p>
          )}
          {siteJob.rollback_version && (
            <p className="text-xs text-muted-foreground">
              Restored to <span className="font-medium text-foreground">v{siteJob.rollback_version}</span> successfully
            </p>
          )}
          {siteJob.health_check_results && Object.keys(siteJob.health_check_results).length > 0 && (
            <div className="text-xs space-y-0.5 pt-1 border-t border-rose-500/10">
              <p className="text-muted-foreground font-medium">Health checks:</p>
              {Object.entries(siteJob.health_check_results).map(([check, passed]) => (
                <p key={check} className="flex items-center gap-1.5">
                  {passed ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  ) : passed === false ? (
                    <XOctagon className="h-3 w-3 text-red-400" />
                  ) : (
                    <Clock className="h-3 w-3 text-gray-400" />
                  )}
                  <span className={passed === false ? "text-red-400" : "text-muted-foreground"}>
                    {check}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SiteStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "success":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" /> Success
        </span>
      );
    case "healthy":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Healthy
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
          <XOctagon className="h-3.5 w-3.5" /> Failed
        </span>
      );
    case "rolled_back":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
          <Undo2 className="h-3.5 w-3.5" /> Rolled Back
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deploying...
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
          <Clock className="h-3.5 w-3.5" /> Pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400">
          <Clock className="h-3.5 w-3.5" /> {status}
        </span>
      );
  }
}

function LogIcon({ type }: { type: "success" | "failed" | "running" | "started" }) {
  switch (type) {
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />;
    case "failed":
      return <XOctagon className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />;
    case "running":
      return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0 mt-0.5" />;
    case "started":
      return <Wrench className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />;
  }
}

function LegendDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span>{label} — {count}</span>
    </span>
  );
}
