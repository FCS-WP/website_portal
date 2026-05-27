"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { activityLogService } from "@/lib/services/activity-logs";
import { siteService } from "@/lib/services/sites";
import type {
  ActivityLogEntry,
  ActivityLogFilterOptions,
  ActivityLogMeta,
  Site,
} from "@/types";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const DATE_RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "24h", label: "Last 24 hours", days: 1 },
  { value: "7d",  label: "Last 7 days",   days: 7 },
  { value: "30d", label: "Last 30 days",  days: 30 },
  { value: "all", label: "All time",      days: null },
];

// Light visual hint so site/user/plugin/etc. events are scannable at a glance.
// The colour tokens match StatusBadge / OrderStatusBadge so dark mode looks consistent.
const ACTION_CATEGORY_STYLE: Record<string, string> = {
  site:       "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
  user:       "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30",
  hosting:    "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  plugin:     "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
  deployment: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
  version:    "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
};
const categoryFor = (action: string) => action.split(".")[0] ?? action;
const actionStyle = (action: string) =>
  ACTION_CATEGORY_STYLE[categoryFor(action)] ??
  "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30";

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [meta, setMeta] = useState<ActivityLogMeta | null>(null);
  const [filterOpts, setFilterOpts] = useState<ActivityLogFilterOptions | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);

  // Filters
  const [action, setAction] = useState("all");
  const [userId, setUserId] = useState("all");
  const [siteId, setSiteId] = useState("all");
  const [range, setRange]   = useState("7d");
  const [page, setPage]     = useState(1);

  // Load filter dropdown sources once. Sites comes from the existing endpoint
  // (already role-scoped on the server), so a Dev only sees their own list.
  useEffect(() => {
    activityLogService.filterOptions().then((r) => setFilterOpts(r.data.data));
    siteService.list().then((r) => setSites(r.data.data || []));
  }, []);

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { page, per_page: 25 };
    if (action !== "all") params.action = action;
    if (userId !== "all") params.user_id = Number(userId);
    if (siteId !== "all") params.site_id = Number(siteId);
    const r = DATE_RANGES.find((d) => d.value === range);
    if (r?.days) {
      params.from = new Date(Date.now() - r.days * 24 * 3_600_000).toISOString();
    }
    return params;
  }, [action, userId, siteId, range, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    activityLogService.list(buildParams())
      .then((r) => {
        if (cancelled) return;
        setLogs(r.data.data);
        setMeta(r.data.meta);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildParams]);

  const clearFilters = () => {
    setAction("all"); setUserId("all"); setSiteId("all"); setRange("7d"); setPage(1);
  };
  const hasFilters = useMemo(
    () => action !== "all" || userId !== "all" || siteId !== "all" || range !== "7d",
    [action, userId, siteId, range]
  );

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <TooltipProvider delay={120}>
      <div className="page-content space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Activity Logs</h1>
          <p className="text-sm text-muted-foreground">
            Audit trail of actions performed across the portal.
            {meta?.total != null && ` ${meta.total} ${meta.total === 1 ? "entry" : "entries"}.`}
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={action} onValueChange={(v) => { setAction(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {filterOpts?.actions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={userId} onValueChange={(v) => { setUserId(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All users" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {filterOpts?.users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={siteId} onValueChange={(v) => { setSiteId(v ?? "all"); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => { setRange(v ?? "7d"); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity…
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
            No activity in this window.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">When</TableHead>
                  <TableHead className="w-[160px]">User</TableHead>
                  <TableHead className="w-[170px]">Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[120px]">Subject</TableHead>
                  <TableHead className="w-[120px]">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="cursor-default">
                              {log.created_at
                                ? formatDistanceToNow(new Date(log.created_at), { addSuffix: true })
                                : "—"}
                            </span>
                          }
                        />
                        <TooltipContent>
                          {log.created_at
                            ? format(new Date(log.created_at), "MMM d, yyyy · HH:mm:ss")
                            : "—"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm">{log.user_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-mono text-xs", actionStyle(log.action))}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{log.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.subject_type
                        ? `${log.subject_type}${log.subject_id ? ` #${log.subject_id}` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {log.ip_address ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {logs.length} of {meta.total} entries
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >Previous</Button>
              <span>Page {meta.page} / {meta.last_page}</span>
              <Button
                variant="outline" size="sm"
                disabled={meta.page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >Next</Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
