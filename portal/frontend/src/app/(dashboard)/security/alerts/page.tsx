"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Search,
} from "lucide-react";
import { securityService } from "@/lib/services/security";
import type { SecurityAlert } from "@/types/security";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";

/* ─── Constants ──────────────────────────────────────────────────── */

const SEVERITIES = ["", "critical", "high", "medium", "low"] as const;
const STATUSES = ["", "open", "acknowledged", "resolved", "false_positive"] as const;
const TYPES = ["", "file_change", "login_anomaly", "user_change", "vulnerability"] as const;

const SEVERITY_LABELS: Record<string, string> = {
  "": "All Severities",
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const STATUS_LABELS: Record<string, string> = {
  "": "All Statuses",
  open: "Open",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
  false_positive: "False Positive",
};

const TYPE_LABELS: Record<string, string> = {
  "": "All Types",
  file_change: "File Change",
  login_anomaly: "Login Anomaly",
  user_change: "User Change",
  vulnerability: "Vulnerability",
};

/* ─── Page ───────────────────────────────────────────────────────── */

export default function SecurityAlertsPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: 20,
  });
  const [filters, setFilters] = useState({
    severity: "",
    status: "",
    type: "",
    search: "",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchAlerts = useCallback(
    async (page = 1, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const params: Record<string, string | number> = { page, per_page: 20 };
        if (filters.severity) params.severity = filters.severity;
        if (filters.status) params.status = filters.status;
        if (filters.type) params.type = filters.type;

        const res = await securityService.alerts(params as any);
        const payload = res.data;
        setAlerts(payload.data);
        setPagination({
          current_page: payload.current_page,
          last_page: payload.last_page,
          total: payload.total,
          per_page: payload.per_page,
        });
      } catch {
        setAlerts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchAlerts(1);
  }, [fetchAlerts]);

  const handleStatusChange = async (alertId: number, newStatus: string) => {
    setUpdatingId(alertId);
    try {
      await securityService.updateAlert(alertId, { status: newStatus });
      await fetchAlerts(pagination.current_page, true);
    } catch {
      /* swallow – toast could go here */
    } finally {
      setUpdatingId(null);
    }
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const from = (pagination.current_page - 1) * pagination.per_page + 1;
  const to = Math.min(pagination.current_page * pagination.per_page, pagination.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Alerts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitor and manage security alerts across all sites
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchAlerts(pagination.current_page, true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filters.severity}
              onValueChange={(v) => setFilter("severity", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(v) => setFilter("status", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.type}
              onValueChange={(v) => setFilter("type", v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search site name…"
                value={filters.search}
                onChange={(e) => setFilter("search", e.target.value)}
                className="pl-8 h-8 w-48"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-7 rounded" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-[90px_1fr_140px_120px_110px_100px_48px] gap-2 px-4 py-2.5 border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Severity</span>
                <span>Title</span>
                <span>Site</span>
                <span>Type</span>
                <span>Status</span>
                <span>Created</span>
                <span />
              </div>

              {/* Rows */}
              <div className="divide-y">
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    updating={updatingId === alert.id}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{from}</span> to{" "}
            <span className="font-medium text-foreground">{to}</span> of{" "}
            <span className="font-medium text-foreground">{pagination.total}</span> alerts
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current_page <= 1}
              onClick={() => fetchAlerts(pagination.current_page - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {pagination.current_page} of {pagination.last_page}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.current_page >= pagination.last_page}
              onClick={() => fetchAlerts(pagination.current_page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function AlertRow({
  alert,
  updating,
  onStatusChange,
}: {
  alert: SecurityAlert;
  updating: boolean;
  onStatusChange: (id: number, status: string) => void;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-[90px_1fr_140px_120px_110px_100px_48px] gap-2 items-center px-4 py-3 transition-colors hover:bg-muted/30",
        updating && "opacity-60 pointer-events-none",
      )}
    >
      <SeverityBadge severity={alert.severity} />

      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{alert.title}</p>
        {alert.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {alert.description}
          </p>
        )}
      </div>

      <span className="text-sm text-muted-foreground truncate">
        {alert.site?.name ?? `Site #${alert.site_id}`}
      </span>

      <TypeBadge type={alert.type} />

      <StatusBadge status={alert.status} />

      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
      </span>

      <StatusActions alert={alert} onStatusChange={onStatusChange} />
    </div>
  );
}

function StatusActions({
  alert,
  onStatusChange,
}: {
  alert: SecurityAlert;
  onStatusChange: (id: number, status: string) => void;
}) {
  const items: { label: string; status: string; icon: React.ReactNode }[] = [];

  if (alert.status === "open") {
    items.push(
      { label: "Acknowledge", status: "acknowledged", icon: <Eye className="h-4 w-4" /> },
      { label: "Resolve", status: "resolved", icon: <CheckCircle className="h-4 w-4" /> },
      { label: "False Positive", status: "false_positive", icon: <XCircle className="h-4 w-4" /> },
    );
  } else if (alert.status === "acknowledged") {
    items.push(
      { label: "Resolve", status: "resolved", icon: <CheckCircle className="h-4 w-4" /> },
      { label: "False Positive", status: "false_positive", icon: <XCircle className="h-4 w-4" /> },
    );
  }

  if (items.length === 0) return <span />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors cursor-pointer"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={item.status}
            className="cursor-pointer"
            onSelect={() => onStatusChange(alert.id, item.status)}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: "bg-red-500/10 text-red-600 border-red-200",
    high: "bg-orange-500/10 text-orange-600 border-orange-200",
    medium: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    low: "bg-blue-500/10 text-blue-600 border-blue-200",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] uppercase font-semibold w-fit", styles[severity] || styles.low)}
    >
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-red-500/10 text-red-600 border-red-200",
    acknowledged: "bg-blue-500/10 text-blue-600 border-blue-200",
    resolved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    false_positive: "bg-zinc-500/10 text-zinc-500 border-zinc-200",
  };

  const labels: Record<string, string> = {
    open: "Open",
    acknowledged: "Ack'd",
    resolved: "Resolved",
    false_positive: "False +",
  };

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] uppercase font-semibold w-fit", styles[status] || styles.open)}
    >
      {labels[status] ?? status}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type.replace(/_/g, " ");

  return (
    <Badge variant="secondary" className="text-[10px] font-medium capitalize w-fit">
      {label}
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <div className="text-center space-y-3">
        <Shield className="h-10 w-10 mx-auto opacity-40" />
        <p className="text-sm font-medium">No alerts found</p>
        <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">
          There are no security alerts matching your current filters. Try adjusting the filters or check back later.
        </p>
      </div>
    </div>
  );
}
