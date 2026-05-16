"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  Wifi,
  ShoppingCart,
  Puzzle,
  RefreshCw,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  Rocket,
  AlertCircle,
  Upload,
  Activity,
} from "lucide-react";
import {
  dashboardService,
  type DashboardStats,
  type RecentSite,
  type RecentActivity,
} from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await dashboardService.stats();
      setStats(res.data.data);
    } catch {
      // Silently fail with defaults
      setStats({
        total_sites: 0,
        online_sites: 0,
        offline_sites: 0,
        sites_this_month: 0,
        plugin_updates_pending: 0,
        sites_with_updates: 0,
        recent_sites: [],
        recent_activity: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = () => fetchStats(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" render={<Link href="/sites?action=create" />}>
            <Plus className="h-4 w-4 mr-2" />
            Add Site
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Sites"
          value={stats?.total_sites ?? 0}
          subtitle={`↑ ${stats?.sites_this_month ?? 0} this month`}
          subtitleColor="text-emerald-500"
          icon={Globe}
          iconColor="text-blue-500"
          loading={loading}
        />
        <MetricCard
          title="Online"
          value={stats?.online_sites ?? 0}
          subtitle={`${stats?.offline_sites ?? 0} offline`}
          subtitleColor="text-orange-500"
          icon={Wifi}
          iconColor="text-emerald-500"
          valueColor="text-emerald-500"
          loading={loading}
        />
        <MetricCard
          title="Orders today"
          value={0}
          subtitle="↑ 0% vs yesterday"
          subtitleColor="text-emerald-500"
          icon={ShoppingCart}
          iconColor="text-amber-500"
          loading={loading}
        />
        <MetricCard
          title="Plugin updates pending"
          value={stats?.plugin_updates_pending ?? 0}
          subtitle={`across ${stats?.sites_with_updates ?? 0} sites`}
          subtitleColor="text-muted-foreground"
          icon={Puzzle}
          iconColor="text-orange-500"
          valueColor="text-orange-500"
          loading={loading}
        />
      </div>

      {/* Middle Section: Site Status + Recent Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Site Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Site status</CardTitle>
            <Link
              href="/sites"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : stats?.recent_sites && stats.recent_sites.length > 0 ? (
              <div className="divide-y">
                {stats.recent_sites.map((site) => (
                  <SiteStatusRow key={site.id} site={site} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No sites yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : stats?.recent_activity && stats.recent_activity.length > 0 ? (
              <div className="divide-y">
                {stats.recent_activity.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No activity yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Recent Orders Placeholder */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">
            Recent orders (all sites)
          </CardTitle>
          <Link
            href="/orders"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View all
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center space-y-2">
              <ShoppingCart className="h-8 w-8 mx-auto opacity-50" />
              <p className="text-sm font-medium">Coming in Phase 3</p>
              <p className="text-xs text-muted-foreground/70">
                Order tracking across all sites will be available here
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function MetricCard({
  title,
  value,
  subtitle,
  subtitleColor,
  icon: Icon,
  iconColor,
  valueColor,
  loading,
}: {
  title: string;
  value: number;
  subtitle: string;
  subtitleColor?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
  valueColor?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <>
            <div className={cn("text-3xl font-bold", valueColor)}>
              {value.toLocaleString()}
            </div>
            <p className={cn("text-xs mt-1", subtitleColor || "text-muted-foreground")}>
              {subtitle}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const statusDot: Record<string, string> = {
  connected: "bg-emerald-500",
  disconnected: "bg-red-500",
  pending: "bg-yellow-500",
};

const statusLabel: Record<string, { text: string; className: string }> = {
  connected: { text: "Online", className: "bg-emerald-500/10 text-emerald-500" },
  disconnected: { text: "Offline", className: "bg-red-500/10 text-red-500" },
  pending: { text: "Pending", className: "bg-yellow-500/10 text-yellow-500" },
};

function SiteStatusRow({ site }: { site: RecentSite }) {
  const dot = statusDot[site.status] || "bg-gray-400";
  const label = statusLabel[site.status] || { text: site.status, className: "bg-gray-100 text-gray-600" };
  const lastSeen = site.last_seen_at
    ? formatDistanceToNow(new Date(site.last_seen_at), { addSuffix: false })
    : "—";

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className={cn("h-2 w-2 rounded-full shrink-0", dot)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{site.name}</p>
        <p className="text-xs text-muted-foreground truncate">{site.hosting_name}</p>
      </div>
      <span
        className={cn(
          "text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0",
          label.className
        )}
      >
        {label.text}
      </span>
      <span className="text-xs text-muted-foreground whitespace-nowrap w-16 text-right shrink-0">
        {lastSeen}
      </span>
    </div>
  );
}

function getActivityIcon(action: string) {
  if (action.includes("connected") || action.includes("ping")) {
    return { icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" };
  }
  if (action.includes("deployment") || action.includes("deploy")) {
    return { icon: Rocket, color: "text-purple-500 bg-purple-500/10" };
  }
  if (action.includes("disconnected") || action.includes("offline")) {
    return { icon: AlertCircle, color: "text-red-500 bg-red-500/10" };
  }
  if (action.includes("version") || action.includes("upload")) {
    return { icon: Upload, color: "text-blue-500 bg-blue-500/10" };
  }
  return { icon: Activity, color: "text-muted-foreground bg-muted" };
}

function ActivityRow({ activity }: { activity: RecentActivity }) {
  const { icon: Icon, color } = getActivityIcon(activity.action);
  const timeAgo = activity.created_at
    ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })
    : "";

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{activity.description}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo}</p>
      </div>
    </div>
  );
}
