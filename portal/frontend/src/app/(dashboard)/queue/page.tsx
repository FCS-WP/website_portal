"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowUpRight,
  Eye,
  Loader2,
  RotateCcw,
  Skull,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { queueService } from "@/lib/services/queueService";
import type { FailedJob, QueueStats } from "@/types";
import { cn } from "@/lib/utils";

const QUEUE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All queues" },
  { value: "default", label: "default" },
  { value: "deployments", label: "deployments" },
];

const DATE_RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d",  label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const QUEUE_BADGE_STYLE: Record<string, string> = {
  default:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30",
  deployments:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30",
};

const queueStyle = (q: string) =>
  QUEUE_BADGE_STYLE[q] ??
  "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";

const shortClass = (fqcn?: string) => {
  if (!fqcn) return "Unknown job";
  const idx = fqcn.lastIndexOf("\\");
  return idx >= 0 ? fqcn.slice(idx + 1) : fqcn;
};

export default function FailedJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<FailedJob[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [retryingUuid, setRetryingUuid] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [flushingAll, setFlushingAll] = useState(false);
  const showLoader = useDelayedLoading(loading);

  // Filters & pagination
  const [queue, setQueue]   = useState("all");
  const [range, setRange]   = useState("7d");
  const [page, setPage]     = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [perPage] = useState(25);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await queueService.getStats();
      setStats(res.data.data);
    } catch {
      // silent — header just falls back
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Parameters<typeof queueService.listFailedJobs>[0] = {
        page,
        per_page: perPage,
      };
      if (queue !== "all") params.queue = queue;
      if (range !== "all") params.date_range = range;

      const res = await queueService.listFailedJobs(params);
      setJobs(res.data.data || []);
      const pagination = res.data.meta?.pagination;
      if (pagination) {
        setLastPage(pagination.last_page);
        setTotal(pagination.total);
      } else {
        setLastPage(1);
        setTotal((res.data.data || []).length);
      }
    } catch {
      toast.error("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, queue, range]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const hasFilters = useMemo(
    () => queue !== "all" || range !== "7d",
    [queue, range],
  );

  const clearFilters = () => {
    setQueue("all");
    setRange("7d");
    setPage(1);
  };

  const handleRetry = async (uuid: string) => {
    setRetryingUuid(uuid);
    try {
      await queueService.retryJob(uuid);
      toast.success("Job pushed back onto the queue");
      fetchJobs();
      fetchStats();
    } catch {
      toast.error("Failed to retry job");
    } finally {
      setRetryingUuid(null);
    }
  };

  const handleDelete = async (uuid: string) => {
    setDeletingUuid(uuid);
    try {
      await queueService.deleteJob(uuid);
      toast.success("Failed job removed");
      fetchJobs();
      fetchStats();
    } catch {
      toast.error("Failed to delete job");
    } finally {
      setDeletingUuid(null);
    }
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      const res = await queueService.retryAll();
      const n = res.data.data?.retried ?? 0;
      toast.success(n > 0 ? `Retrying ${n} jobs` : "Nothing to retry");
      fetchJobs();
      fetchStats();
    } catch {
      toast.error("Failed to retry jobs");
    } finally {
      setRetryingAll(false);
    }
  };

  const handleFlushAll = async () => {
    setFlushingAll(true);
    try {
      const res = await queueService.flushAll();
      const n = res.data.data?.deleted ?? 0;
      toast.success(n > 0 ? `Flushed ${n} jobs` : "Nothing to flush");
      fetchJobs();
      fetchStats();
    } catch {
      toast.error("Failed to flush jobs");
    } finally {
      setFlushingAll(false);
    }
  };

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <TooltipProvider delay={120}>
      <div className="page-content space-y-6">
        {/* === HEADER === */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
                <Skull className="h-4 w-4 text-red-500" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Failed Jobs</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Inspect, retry, and triage jobs that the queue worker couldn&apos;t finish.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryAll}
              disabled={retryingAll || !stats?.failed_count}
            >
              {retryingAll ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Retry all
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-red-500/40 px-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={flushingAll || !stats?.failed_count}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Flush all
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Flush every failed job?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes all {stats?.failed_count ?? 0} failed jobs
                    from the queue. This action can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={handleFlushAll}
                  >
                    Flush all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* === STATS === */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Failed jobs"
            value={stats?.failed_count ?? 0}
            tone="danger"
            loading={statsLoading}
            sub={
              stats?.last_failure_at
                ? `Last ${formatDistanceToNow(new Date(stats.last_failure_at), { addSuffix: true })}`
                : "No recent failures"
            }
          />
          <StatCard
            label="Pending jobs"
            value={stats?.pending_count ?? 0}
            tone="info"
            loading={statsLoading}
            sub="Waiting to be processed"
          />
          <StatCard
            label="On this page"
            value={jobs.length}
            tone="neutral"
            loading={loading}
            sub={total ? `of ${total} total` : "No matches"}
          />
        </div>

        {/* === FILTERS === */}
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filter
          </span>
          <Select
            value={queue}
            onValueChange={(v) => {
              setQueue(v ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All queues" />
            </SelectTrigger>
            <SelectContent>
              {QUEUE_OPTIONS.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={range}
            onValueChange={(v) => {
              setRange(v ?? "7d");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        {/* === TABLE === */}
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border bg-card/30 py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading failed jobs…
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[170px]">Failed at</TableHead>
                  <TableHead>Job class</TableHead>
                  <TableHead className="w-[140px]">Queue</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-[160px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const isRetrying = retryingUuid === job.uuid;
                  const isDeleting = deletingUuid === job.uuid;
                  return (
                    <TableRow
                      key={job.uuid}
                      className="group cursor-pointer transition-colors hover:bg-muted/40"
                      onClick={() => router.push(`/queue/${job.uuid}`)}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="cursor-default font-medium text-foreground/90">
                                {formatDistanceToNow(new Date(job.failed_at), {
                                  addSuffix: true,
                                })}
                              </span>
                            }
                          />
                          <TooltipContent>
                            {format(new Date(job.failed_at), "MMM d, yyyy · HH:mm:ss")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-sm font-medium text-foreground">
                            {shortClass(job.job_class)}
                          </span>
                          {job.job_class && (
                            <span className="truncate font-mono text-[11px] text-muted-foreground/70">
                              {job.job_class}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("font-mono text-xs", queueStyle(job.queue))}
                        >
                          {job.queue}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[440px]">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="block truncate font-mono text-xs text-red-500/90">
                                {job.error_summary || "—"}
                              </span>
                            }
                          />
                          {job.error_summary && (
                            <TooltipContent className="max-w-md font-mono text-xs">
                              {job.error_summary}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => router.push(`/queue/${job.uuid}`)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              }
                            />
                            <TooltipContent>View details</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
                                  onClick={() => handleRetry(job.uuid)}
                                  disabled={isRetrying}
                                >
                                  {isRetrying ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                </Button>
                              }
                            />
                            <TooltipContent>Retry</TooltipContent>
                          </Tooltip>

                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <AlertDialogTrigger
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </AlertDialogTrigger>
                                }
                              />
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this failed job?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently removes{" "}
                                  <span className="font-mono">{shortClass(job.job_class)}</span>{" "}
                                  from the failed jobs table. It cannot be retried after this.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => handleDelete(job.uuid)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* === PAGINATION === */}
        {lastPage > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {jobs.length} of {total} jobs
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {page} / {lastPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= lastPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  tone,
  loading,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "danger" | "info" | "neutral";
  loading?: boolean;
}) {
  const toneClasses = {
    danger: "text-red-500",
    info: "text-blue-500",
    neutral: "text-foreground",
  }[tone];

  const ringClasses = {
    danger: "ring-red-500/20 bg-red-500/5",
    info: "ring-blue-500/20 bg-blue-500/5",
    neutral: "ring-border bg-card",
  }[tone];

  return (
    <div className={cn("rounded-xl border border-border p-5 ring-1 ring-inset", ringClasses)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-2 text-3xl font-bold tabular-nums", toneClasses)}>
        {loading ? <span className="text-muted-foreground/40">—</span> : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
        <AlertCircle className="h-6 w-6 text-emerald-500" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No failed jobs</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Nothing matched the current filters."
            : "Workers are happy. The queue is clear."}
        </p>
      </div>
      {hasFilters && (
        <Button variant="outline" size="sm" onClick={onClear} className="mt-1">
          Clear filters
          <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
