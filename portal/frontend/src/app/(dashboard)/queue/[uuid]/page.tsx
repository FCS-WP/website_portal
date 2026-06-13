"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RotateCcw,
  Skull,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
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
import type { FailedJobDetail } from "@/types";
import { cn } from "@/lib/utils";

const shortClass = (fqcn?: string) => {
  if (!fqcn) return "Unknown job";
  const idx = fqcn.lastIndexOf("\\");
  return idx >= 0 ? fqcn.slice(idx + 1) : fqcn;
};

const safeJson = (raw: unknown): string => {
  if (raw == null) return "";
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }
  if (typeof raw !== "string") return String(raw);
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

export default function FailedJobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const uuid = String(params.uuid);

  const [job, setJob] = useState<FailedJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [payloadExpanded, setPayloadExpanded] = useState(true);
  const [rawExpanded, setRawExpanded] = useState(false);
  const showLoader = useDelayedLoading(loading);

  const fetchJob = useCallback(async () => {
    setLoading(true);
    try {
      const res = await queueService.getFailedJob(uuid);
      setJob(res.data.data);
    } catch {
      toast.error("Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    if (uuid) fetchJob();
  }, [uuid, fetchJob]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await queueService.retryJob(uuid);
      toast.success("Job pushed back onto the queue");
      router.push("/queue");
    } catch {
      toast.error("Failed to retry job");
    } finally {
      setRetrying(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await queueService.deleteJob(uuid);
      toast.success("Failed job removed");
      router.push("/queue");
    } catch {
      toast.error("Failed to delete job");
      setDeleting(false);
    }
  };

  const copyUuid = async () => {
    try {
      await navigator.clipboard.writeText(uuid);
      toast.success("UUID copied");
    } catch {
      toast.error("Couldn't copy UUID");
    }
  };

  const rawPayload = job?.payload;
  const formattedPayload = useMemo(
    () => (rawPayload ? safeJson(rawPayload) : ""),
    [rawPayload],
  );

  const parsed = job?.parsed_payload;

  if (showLoader) {
    return <PageLoader variant="detail" />;
  }

  if (!job) {
    return (
      <div className="page-content">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to failed jobs
        </Link>
        <div className="mt-16 text-center text-muted-foreground">
          Failed job not found.
        </div>
      </div>
    );
  }

  const jobClass = parsed?.displayName || parsed?.job || job.job_class;
  const failedAtDate = job.failed_at ? new Date(job.failed_at) : null;
  const failedAt =
    failedAtDate && !Number.isNaN(failedAtDate.getTime()) ? failedAtDate : null;

  return (
    <div className="page-content space-y-6">
      {/* Back link */}
      <Link
        href="/queue"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to failed jobs
      </Link>

      {/* === HEADER === */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
              <Skull className="h-5 w-5 text-red-500" />
            </div>
            <h1 className="break-all font-mono text-2xl font-bold tracking-tight">
              {shortClass(jobClass)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={copyUuid}
              className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
              title="Copy UUID"
            >
              <span className="truncate">{uuid}</span>
              <Copy className="h-3 w-3 opacity-60 group-hover:opacity-100" />
            </button>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {failedAt
                ? `Failed ${formatDistanceToNow(failedAt, { addSuffix: true })}`
                : "Failed at unknown time"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retrying || deleting}
            className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-600 dark:text-emerald-400"
          >
            {retrying ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Retry job
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-red-500/40 px-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={retrying || deleting}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this failed job?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the failed job record. It can&apos;t be
                  retried after this. You&apos;ll be returned to the list.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={handleDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* === METADATA GRID === */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Meta label="Queue">
          <Badge variant="outline" className="font-mono text-xs">
            {job.queue}
          </Badge>
        </Meta>
        <Meta label="Connection">
          <span className="font-mono text-sm text-foreground">{job.connection}</span>
        </Meta>
        <Meta label="Attempts">
          <span className="font-mono text-sm text-foreground">
            {parsed?.attempts ?? 0}
            <span className="text-muted-foreground">
              {" "}/ {parsed?.maxTries ?? "∞"}
            </span>
          </span>
        </Meta>
        <Meta label="Failed at">
          <div className="leading-tight">
            {failedAt ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {format(failedAt, "MMM d, yyyy")}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {format(failedAt, "HH:mm:ss")}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </Meta>
        <Meta label="Job ID">
          <span className="font-mono text-sm text-foreground">#{job.id}</span>
        </Meta>
      </div>

      {/* === EXCEPTION === */}
      <Section title="Exception" subtitle="Full stack trace as captured by Laravel">
        <div className="overflow-hidden rounded-lg border border-red-500/20 bg-zinc-950 shadow-inner">
          <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-red-300">
              traceback — read from the bottom up
            </span>
          </div>
          <pre className="max-h-[480px] overflow-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-zinc-200">
            {job.exception || "No exception recorded."}
          </pre>
        </div>
      </Section>

      {/* === PAYLOAD === */}
      <Section
        title="Payload"
        subtitle="Job class metadata and serialized constructor arguments"
        right={
          <button
            onClick={() => setPayloadExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {payloadExpanded ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Collapse
              </>
            ) : (
              <>
                <ChevronRight className="h-3.5 w-3.5" /> Expand
              </>
            )}
          </button>
        }
      >
        {payloadExpanded && (
          <div className="space-y-3">
            {parsed && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {parsed.displayName && (
                  <Meta label="Display name">
                    <span className="break-all font-mono text-sm">
                      {parsed.displayName}
                    </span>
                  </Meta>
                )}
                {parsed.job && typeof parsed.job === "string" && (
                  <Meta label="Job">
                    <span className="break-all font-mono text-sm">{parsed.job}</span>
                  </Meta>
                )}
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  payload.json
                </span>
                <button
                  onClick={() => setRawExpanded((v) => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {rawExpanded ? "Hide raw" : "Show raw"}
                </button>
              </div>
              <pre
                className={cn(
                  "overflow-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed text-foreground",
                  rawExpanded ? "max-h-[600px]" : "max-h-[320px]",
                )}
              >
                {formattedPayload || "No payload"}
              </pre>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
