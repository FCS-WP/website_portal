"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { vaultLogService, VaultLog } from "@/lib/services/vault-logs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VaultAuditLogProps {
  siteId: number | string;
}

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "viewed", label: "Viewed" },
  { value: "copied", label: "Copied" },
  { value: "edited", label: "Edited" },
  { value: "created", label: "Created" },
  { value: "deleted", label: "Deleted" },
  { value: "shared", label: "Shared" },
  { value: "share_accessed", label: "Share Accessed" },
  { value: "share_revoked", label: "Share Revoked" },
  { value: "autologin", label: "Autologin" },
  { value: "pin_failed", label: "PIN Failed" },
  { value: "pin_locked", label: "PIN Locked" },
];

const ACTION_BADGE_STYLES: Record<string, string> = {
  viewed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  copied: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  edited: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  created: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  deleted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  shared: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  share_accessed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  share_revoked: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  autologin: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  pin_failed: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  pin_locked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function getActionBadgeStyle(action: string): string {
  return ACTION_BADGE_STYLES[action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
}

function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getRelativeTime(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true });
  } catch {
    return dateString;
  }
}

export function VaultAuditLog({ siteId }: VaultAuditLogProps) {
  const [logs, setLogs] = useState<VaultLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<{
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  } | null>(null);

  const fetchLogs = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params: Record<string, string | number> = {
          page,
          per_page: 20,
        };
        if (actionFilter !== "all") {
          params.action = actionFilter;
        }
        const res = await vaultLogService.list(siteId, params);
        setLogs(res.data.data);
        setMeta(res.data.meta);
      } catch {
        // Silently fail — logs are supplementary
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [siteId, actionFilter, page]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (value: string | null) => {
    if (!value) return;
    setActionFilter(value);
    setPage(1);
  };

  const handleRefresh = () => {
    fetchLogs(true);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Access History</h3>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Access History</h3>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select value={actionFilter} onValueChange={handleFilterChange}>
            <SelectTrigger className="h-9 w-full sm:w-[160px]">
              <SelectValue placeholder="Filter actions" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-9 w-9"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Log entries */}
      {logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No access history yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.current_page} of {meta.last_page}
            <span className="ml-2">({meta.total} entries)</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= meta.last_page}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Log entry sub-component ---

function LogEntry({ log }: { log: VaultLog }) {
  const badgeStyle = getActionBadgeStyle(log.action);
  const actionLabel = formatActionLabel(log.action);
  const relativeTime = getRelativeTime(log.created_at);

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      {/* Action badge */}
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${badgeStyle}`}
      >
        {actionLabel}
      </span>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">
            {log.user?.name || "System"}
          </span>
          {log.credential && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground truncate">
                {log.credential.label}
                {log.field_key && (
                  <span className="ml-1">→ {log.field_key}</span>
                )}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {log.ip_address && <span>{log.ip_address}</span>}
          <span>{relativeTime}</span>
        </div>
      </div>
    </div>
  );
}
