"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Shield,
  AlertTriangle,
  Bug,
  Lock,
  RefreshCw,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";
import { securityService } from "@/lib/services/security";
import type { SecurityOverview, SiteSecurityScore } from "@/types/security";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function SecurityOverviewPage() {
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [poorSites, setPoorSites] = useState<SiteSecurityScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [overviewRes, scoresRes] = await Promise.all([
        securityService.overview(),
        securityService.scores({ below: 50, sort: "overall_score", direction: "asc", per_page: 10 }),
      ]);
      setOverview(overviewRes.data.data);
      setPoorSites(scoresRes.data.data);
    } catch {
      setOverview(null);
      setPoorSites([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => fetchData(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Overview of security posture across all sites
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Average Security Score"
          value={overview?.average_score ?? 0}
          suffix="/100"
          icon={Shield}
          iconColor="text-blue-500"
          valueColor={getScoreColor(overview?.average_score ?? 0)}
          loading={loading}
        />
        <StatCard
          title="Critical Alerts"
          value={overview?.critical_alerts ?? 0}
          icon={AlertTriangle}
          iconColor="text-red-500"
          valueColor={(overview?.critical_alerts ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}
          subtitle={`${overview?.high_alerts ?? 0} high`}
          loading={loading}
        />
        <StatCard
          title="Unresolved Vulnerabilities"
          value={overview?.unresolved_vulnerabilities ?? 0}
          icon={Bug}
          iconColor="text-orange-500"
          valueColor={(overview?.unresolved_vulnerabilities ?? 0) > 0 ? "text-orange-500" : "text-emerald-500"}
          loading={loading}
        />
        <StatCard
          title="Sites Without 2FA"
          value={overview?.sites_without_2fa ?? 0}
          icon={Lock}
          iconColor="text-amber-500"
          valueColor={(overview?.sites_without_2fa ?? 0) > 0 ? "text-amber-500" : "text-emerald-500"}
          loading={loading}
        />
      </div>

      {/* Score Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Score Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <ScoreBar
                label="Excellent (80-100)"
                count={overview?.score_distribution.excellent ?? 0}
                total={overview?.total_sites ?? 1}
                color="bg-emerald-500"
                textColor="text-emerald-600"
              />
              <ScoreBar
                label="Good (60-79)"
                count={overview?.score_distribution.good ?? 0}
                total={overview?.total_sites ?? 1}
                color="bg-blue-500"
                textColor="text-blue-600"
              />
              <ScoreBar
                label="Fair (40-59)"
                count={overview?.score_distribution.fair ?? 0}
                total={overview?.total_sites ?? 1}
                color="bg-yellow-500"
                textColor="text-yellow-600"
              />
              <ScoreBar
                label="Poor (0-39)"
                count={overview?.score_distribution.poor ?? 0}
                total={overview?.total_sites ?? 1}
                color="bg-red-500"
                textColor="text-red-600"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Middle Section: Recent Alerts + Sites Needing Attention */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent Alerts Feed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Recent Alerts</CardTitle>
            <Link
              href="/security/alerts"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View All
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : overview?.recent_alerts && overview.recent_alerts.length > 0 ? (
              <div className="divide-y">
                {overview.recent_alerts.slice(0, 10).map((alert) => (
                  <Link
                    key={alert.id}
                    href={`/sites/${alert.site_id}?tab=security`}
                    className="flex items-center gap-3 py-2.5 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                  >
                    <SeverityBadge severity={alert.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{alert.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {alert.site?.name ?? `Site #${alert.site_id}`}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center space-y-2">
                  <Shield className="h-8 w-8 mx-auto opacity-50" />
                  <p className="text-sm font-medium">No recent alerts</p>
                  <p className="text-xs text-muted-foreground/70">
                    All systems are running normally
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sites Needing Attention */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Sites Needing Attention</CardTitle>
            <Link
              href="/security/alerts"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View All
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : poorSites.length > 0 ? (
              <div className="divide-y">
                {poorSites.map((score) => (
                  <Link
                    key={score.id}
                    href={`/sites/${score.site_id}?tab=security`}
                    className="flex items-center gap-3 py-2.5 hover:bg-muted/50 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {score.site?.name ?? `Site #${score.site_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last scan: {formatDistanceToNow(new Date(score.calculated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn("text-sm font-bold", getScoreColor(score.overall_score))}>
                        {score.overall_score}
                      </span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center space-y-2">
                  <Shield className="h-8 w-8 mx-auto opacity-50" />
                  <p className="text-sm font-medium">All sites look good!</p>
                  <p className="text-xs text-muted-foreground/70">
                    No sites with poor security scores
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vulnerability Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Vulnerability Summary</CardTitle>
          <Link
            href="/security/alerts"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View All Vulnerabilities
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <VulnStat label="Critical" count={overview?.critical_alerts ?? 0} color="text-red-500" bgColor="bg-red-500/10" />
              <VulnStat label="High" count={overview?.high_alerts ?? 0} color="text-orange-500" bgColor="bg-orange-500/10" />
              <VulnStat label="Unresolved" count={overview?.unresolved_vulnerabilities ?? 0} color="text-yellow-600" bgColor="bg-yellow-500/10" />
              <VulnStat label="Total Sites" count={overview?.total_sites ?? 0} color="text-blue-500" bgColor="bg-blue-500/10" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function StatCard({
  title,
  value,
  suffix,
  subtitle,
  icon: Icon,
  iconColor,
  valueColor,
  loading,
}: {
  title: string;
  value: number;
  suffix?: string;
  subtitle?: string;
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
              {value}
              {suffix && <span className="text-base font-normal text-muted-foreground">{suffix}</span>}
            </div>
            {subtitle && (
              <p className="text-xs mt-1 text-muted-foreground">{subtitle}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreBar({
  label,
  count,
  total,
  color,
  textColor,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  textColor: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className={cn("text-sm font-medium w-36 shrink-0", textColor)}>{label}</span>
      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.max(percentage, percentage > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="text-sm font-semibold w-8 text-right">{count}</span>
    </div>
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
      className={cn("text-[10px] uppercase font-semibold shrink-0", styles[severity] || styles.low)}
    >
      {severity}
    </Badge>
  );
}

function VulnStat({
  label,
  count,
  color,
  bgColor,
}: {
  label: string;
  count: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={cn("rounded-lg p-4 text-center", bgColor)}>
      <div className={cn("text-2xl font-bold", color)}>{count}</div>
      <div className="text-xs font-medium text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-yellow-600";
  return "text-red-500";
}
