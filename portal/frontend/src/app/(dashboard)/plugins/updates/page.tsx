"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Search,
  Star,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ArrowDownToLine,
} from "lucide-react";
import { externalPluginService } from "@/lib/services/external-plugins";
import type {
  PluginUpdateRow,
  PluginUpdatesSummary,
  PluginUpdatesResponse,
  PluginSiteVersion,
  ExternalPluginCacheStatus,
} from "@/types/external-plugins";
import { toast } from "sonner";
import { format } from "date-fns";

type FilterTab = "all" | "has_updates" | "up_to_date" | "abandoned";
type SortOption = "most_affected" | "name";

export default function PluginUpdatesPage() {
  const [data, setData] = useState<PluginUpdatesResponse | null>(null);
  const [cacheStatus, setCacheStatus] = useState<ExternalPluginCacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortOption>("most_affected");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [sitesData, setSitesData] = useState<Record<string, PluginSiteVersion[]>>({});
  const [sitesLoading, setSitesLoading] = useState<string | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    slug: string;
    pluginName: string;
    siteIds: number[] | "all";
    fromVersions: string[];
    toVersion: string;
    siteCount: number;
  }>({
    open: false,
    slug: "",
    pluginName: "",
    siteIds: [],
    fromVersions: [],
    toVersion: "",
    siteCount: 0,
  });
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [updatesRes, cacheRes] = await Promise.all([
        externalPluginService.getUpdates({ search, filter, sort }),
        externalPluginService.getCacheStatus(),
      ]);
      // Backend returns a flat array of plugin rows in data.data,
      // transform into { stats, plugins } shape the UI expects
      const rawPlugins = (updatesRes.data as any).data || [];
      const plugins: PluginUpdateRow[] = rawPlugins.map((p: any) => ({
        slug: p.slug,
        name: p.name,
        rating: p.rating ?? null,
        active_installs: p.active_installs ?? null,
        last_updated_wporg: p.last_updated_wporg ?? null,
        is_abandoned: p.is_abandoned ?? false,
        latest_version: p.latest_version ?? null,
        installed_on_sites: p.total_sites ?? 0,
        needs_update_count: p.needs_update_count ?? 0,
        version_breakdown: [],
      }));
      const stats: PluginUpdatesSummary = {
        plugins_with_updates: plugins.filter((p) => p.needs_update_count > 0).length,
        sites_with_outdated: plugins.filter((p) => p.needs_update_count > 0).reduce((sum, p) => sum + p.needs_update_count, 0),
        total_outdated_instances: plugins.reduce((sum, p) => sum + p.needs_update_count, 0),
      };
      setData({ stats, plugins });
      setCacheStatus(cacheRes.data.data);
    } catch {
      toast.error("Failed to load plugin updates");
    } finally {
      setLoading(false);
    }
  }, [search, filter, sort]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      await externalPluginService.refreshCache();
      toast.success("Version cache refresh started");
      await fetchData();
    } catch {
      toast.error("Failed to refresh cache");
    } finally {
      setRefreshing(false);
    }
  };

  const handleExpandRow = async (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    if (!sitesData[slug]) {
      setSitesLoading(slug);
      try {
        const res = await externalPluginService.getUpdateSites(slug);
        setSitesData((prev) => ({ ...prev, [slug]: res.data.data }));
      } catch {
        toast.error("Failed to load site details");
      } finally {
        setSitesLoading(null);
      }
    }
  };

  const handleUpdateAll = (plugin: PluginUpdateRow) => {
    // Compute version breakdown from sites data if available
    const sites = sitesData[plugin.slug] || [];
    const fromVersions = sites.length > 0
      ? Object.entries(
          sites
            .filter((s) => s.update_available)
            .reduce<Record<string, number>>((acc, s) => {
              const v = s.installed_version || "unknown";
              acc[v] = (acc[v] || 0) + 1;
              return acc;
            }, {})
        ).map(([version, count]) => `v${version} (${count} sites)`)
      : [`${plugin.needs_update_count} site(s) need update`];
    setConfirmModal({
      open: true,
      slug: plugin.slug,
      pluginName: plugin.name,
      siteIds: "all",
      fromVersions,
      toVersion: plugin.latest_version || "latest",
      siteCount: plugin.needs_update_count,
    });
  };

  const handleUpdateSingle = (site: PluginSiteVersion, plugin: PluginUpdateRow) => {
    setConfirmModal({
      open: true,
      slug: plugin.slug,
      pluginName: plugin.name,
      siteIds: [site.site_id],
      fromVersions: [site.installed_version || "unknown"],
      toVersion: site.latest_version || plugin.latest_version || "latest",
      siteCount: 1,
    });
  };

  const handleConfirmUpdate = async () => {
    setUpdating(true);
    try {
      await externalPluginService.update({
        slug: confirmModal.slug,
        site_ids: confirmModal.siteIds,
      });
      toast.success("Update job created", {
        description: "Check the Deployments page for progress.",
      });
      setConfirmModal((prev) => ({ ...prev, open: false }));
      // Refresh data
      await fetchData();
      // Refresh site data if expanded
      if (expandedSlug === confirmModal.slug) {
        const res = await externalPluginService.getUpdateSites(confirmModal.slug);
        setSitesData((prev) => ({ ...prev, [confirmModal.slug]: res.data.data }));
      }
    } catch {
      toast.error("Failed to dispatch update");
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateVersionGroup = (plugin: PluginUpdateRow, version: string, siteCount: number) => {
    const sites = sitesData[plugin.slug]?.filter(
      (s) => s.installed_version === version && s.update_available
    );
    const siteIds = sites ? sites.map((s) => s.site_id) : [];
    setConfirmModal({
      open: true,
      slug: plugin.slug,
      pluginName: plugin.name,
      siteIds,
      fromVersions: [`v${version}`],
      toVersion: plugin.latest_version || "latest",
      siteCount,
    });
  };

  // Filter & sort
  const filteredPlugins = (data?.plugins || []).filter((p) => {
    if (search) {
      const s = search.toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !p.slug.toLowerCase().includes(s)) return false;
    }
    if (filter === "has_updates") return p.needs_update_count > 0;
    if (filter === "up_to_date") return p.needs_update_count === 0 && !p.is_abandoned;
    if (filter === "abandoned") return p.is_abandoned;
    return true;
  });

  const sortedPlugins = [...filteredPlugins].sort((a, b) => {
    if (sort === "most_affected") return b.needs_update_count - a.needs_update_count;
    return a.name.localeCompare(b.name);
  });

  const renderStars = (rating: number | null) => {
    if (rating === null) return <span className="text-muted-foreground text-xs">—</span>;
    const stars = Math.round((rating / 100) * 5);
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${i < stars ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">
          {((rating / 100) * 5).toFixed(1)}
        </span>
      </div>
    );
  };

  const filterTabs: { value: FilterTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "has_updates", label: "Has Updates" },
    { value: "up_to_date", label: "Up to Date" },
    { value: "abandoned", label: "Abandoned" },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plugin Updates</h1>
          <p className="text-muted-foreground text-sm">
            Last version check:{" "}
            {cacheStatus?.last_synced_at
              ? format(new Date(cacheStatus.last_synced_at), "MMM d, yyyy HH:mm")
              : "Never"}
          </p>
        </div>
        <Button onClick={handleRefreshCache} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh Versions
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{stats?.plugins_with_updates ?? 0}</div>
            <p className="text-sm text-muted-foreground">Plugins with updates</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{stats?.sites_with_outdated ?? 0}</div>
            <p className="text-sm text-muted-foreground">Sites with outdated plugins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">{stats?.total_outdated_instances ?? 0}</div>
            <p className="text-sm text-muted-foreground">Total outdated instances</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-8 rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="most_affected">Most Affected</option>
          <option value="name">Plugin Name</option>
        </select>
      </div>

      {/* Main Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Plugin</TableHead>
              <TableHead>Versions</TableHead>
              <TableHead>Sites</TableHead>
              <TableHead>Needs Update</TableHead>
              <TableHead>Latest</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPlugins.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No plugins found
                </TableCell>
              </TableRow>
            ) : (
              sortedPlugins.map((plugin) => (
                <PluginRow
                  key={plugin.slug}
                  plugin={plugin}
                  expanded={expandedSlug === plugin.slug}
                  sitesLoading={sitesLoading === plugin.slug}
                  sites={sitesData[plugin.slug]}
                  onToggleExpand={() => handleExpandRow(plugin.slug)}
                  onUpdateAll={() => handleUpdateAll(plugin)}
                  onUpdateSingle={(site) => handleUpdateSingle(site, plugin)}
                  onUpdateVersionGroup={(version, count) =>
                    handleUpdateVersionGroup(plugin, version, count)
                  }
                  renderStars={renderStars}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation Modal */}
      <Dialog
        open={confirmModal.open}
        onOpenChange={(open) => setConfirmModal((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Update</DialogTitle>
            <DialogDescription>
              You are about to update <strong>{confirmModal.pluginName}</strong> on{" "}
              {confirmModal.siteCount} site{confirmModal.siteCount !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <div>
              <span className="font-medium">From:</span>{" "}
              {confirmModal.fromVersions.join(", ")}
            </div>
            <div>
              <span className="font-medium">To:</span>{" "}
              <Badge variant="secondary">v{confirmModal.toVersion}</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmUpdate} disabled={updating}>
              {updating ? "Dispatching..." : "Confirm Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Plugin Row Component ────────────────────────────────────────────────────

interface PluginRowProps {
  plugin: PluginUpdateRow;
  expanded: boolean;
  sitesLoading: boolean;
  sites?: PluginSiteVersion[];
  onToggleExpand: () => void;
  onUpdateAll: () => void;
  onUpdateSingle: (site: PluginSiteVersion) => void;
  onUpdateVersionGroup: (version: string, siteCount: number) => void;
  renderStars: (rating: number | null) => React.ReactNode;
}

function PluginRow({
  plugin,
  expanded,
  sitesLoading,
  sites,
  onToggleExpand,
  onUpdateAll,
  onUpdateSingle,
  onUpdateVersionGroup,
  renderStars,
}: PluginRowProps) {
  return (
    <>
      <TableRow className="group">
        <TableCell>
          <button onClick={onToggleExpand} className="p-1 rounded hover:bg-muted">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{plugin.name}</span>
            <span className="text-xs text-muted-foreground font-mono">{plugin.slug}</span>
            <div className="flex items-center gap-2 mt-0.5">
              {renderStars(plugin.rating)}
              {plugin.active_installs && (
                <span className="text-xs text-muted-foreground">
                  {plugin.active_installs} installs
                </span>
              )}
            </div>
            {plugin.last_updated_wporg && (
              <span className="text-xs text-muted-foreground">
                WP.org: {format(new Date(plugin.last_updated_wporg), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <span className="text-sm">{sites ? [...new Set(sites.map((s) => s.installed_version))].length : "—"}</span>
        </TableCell>
        <TableCell>
          <span className="text-sm">{plugin.installed_on_sites}</span>
        </TableCell>
        <TableCell>
          {plugin.needs_update_count > 0 ? (
            <Badge variant="destructive">{plugin.needs_update_count}</Badge>
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
        </TableCell>
        <TableCell>
          {plugin.latest_version ? (
            <Badge variant="secondary">v{plugin.latest_version}</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>
        <TableCell>
          {plugin.is_abandoned ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Abandoned
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  This plugin has not been updated in over 2 years on WP.org
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : plugin.needs_update_count > 0 ? (
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
              Update available
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
              Up to date
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {plugin.needs_update_count > 0 && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onUpdateAll} title="Update all sites">
                <ArrowDownToLine className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onToggleExpand} title="View sites">
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded content */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            {sitesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Version Breakdown - computed from sites data */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Version Breakdown</h4>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Version</TableHead>
                          <TableHead>Sites</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const versionBreakdown = sites
                            ? Object.entries(
                                sites.reduce<Record<string, number>>((acc, s) => {
                                  const v = s.installed_version || "unknown";
                                  acc[v] = (acc[v] || 0) + 1;
                                  return acc;
                                }, {})
                              ).map(([version, site_count]) => ({ version, site_count }))
                            : [];
                          return versionBreakdown.map((vb) => (
                            <TableRow key={vb.version}>
                              <TableCell>
                                <Badge variant="outline">v{vb.version}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {vb.site_count} site{vb.site_count !== 1 ? "s" : ""}
                              </TableCell>
                              <TableCell>
                                {vb.version !== plugin.latest_version ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onUpdateVersionGroup(vb.version, vb.site_count)}
                                  >
                                    Update all {vb.site_count} to v{plugin.latest_version}
                                  </Button>
                                ) : (
                                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Up to date
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Site-level table */}
                {sites && sites.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Sites</h4>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Site</TableHead>
                            <TableHead>Installed</TableHead>
                            <TableHead>Latest</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sites.map((site) => (
                            <TableRow key={site.site_id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">{site.site_name}</span>
                                  <span className="text-xs text-muted-foreground">{site.site_url}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  v{site.installed_version || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  v{site.latest_version || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {site.update_available ? (
                                  <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400">
                                    Update available
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> Up to date
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {site.update_available ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onUpdateSingle(site)}
                                  >
                                    Update
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
