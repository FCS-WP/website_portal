"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { DataTable } from "@/components/data-table";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RefreshCw,
  Star,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ArrowDownToLine,
} from "lucide-react";
import { externalPluginService } from "@/lib/services/external-plugins";
import type {
  PluginUpdateRow,
  PluginSiteVersion,
  ExternalPluginCacheStatus,
} from "@/types/external-plugins";
import { toast } from "sonner";
import { format } from "date-fns";

type FilterTab = "all" | "has_updates" | "up_to_date" | "abandoned";
type SortOption = "most_affected" | "name";

const PER_PAGE_OPTIONS = [25, 50, 100];

export default function PluginUpdatesPage() {
  // --- Data state ---
  const [plugins, setPlugins] = useState<PluginUpdateRow[]>([]);
  const [cacheStatus, setCacheStatus] = useState<ExternalPluginCacheStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const showLoader = useDelayedLoading(loading && !initialLoaded);
  const [refreshing, setRefreshing] = useState(false);

  // --- Filters ---
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortOption>("most_affected");

  // --- Pagination ---
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  // --- Details drawer ---
  const [drawerPlugin, setDrawerPlugin] = useState<PluginUpdateRow | null>(null);
  const [drawerSites, setDrawerSites] = useState<PluginSiteVersion[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // --- Confirm modal ---
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

  // --- Debounced search ---
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [updatesRes, cacheRes] = await Promise.all([
        externalPluginService.getUpdates({ search, filter, sort, page, per_page: perPage }),
        externalPluginService.getCacheStatus(),
      ]);
      const rawPlugins = updatesRes.data.data || [];
      const mapped: PluginUpdateRow[] = rawPlugins.map((p: any) => ({
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
      setPlugins(mapped);

      const pagination = updatesRes.data.meta?.pagination;
      if (pagination) {
        setLastPage(pagination.last_page);
        setTotal(pagination.total);
      } else {
        setLastPage(1);
        setTotal(mapped.length);
      }

      setCacheStatus(cacheRes.data.data);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to load plugin updates";
      toast.error(message);
      console.error("plugin updates list failed:", err);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [search, filter, sort, page, perPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onFilterChange = (val: FilterTab) => {
    setFilter(val);
    setPage(1);
  };
  const onSortChange = (val: SortOption) => {
    setSort(val);
    setPage(1);
  };
  const onPerPageChange = (n: number) => {
    setPerPage(n);
    setPage(1);
  };

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      await externalPluginService.refreshCache();
      toast.success("Version cache refresh started");
      await fetchData();
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to refresh cache";
      toast.error(message);
      console.error("refresh cache failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // --- Drawer ---
  const openDrawer = async (plugin: PluginUpdateRow) => {
    setDrawerPlugin(plugin);
    setDrawerSites([]);
    setDrawerLoading(true);
    try {
      const res = await externalPluginService.getUpdateSites(plugin.slug);
      setDrawerSites(res.data.data);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to load site details";
      toast.error(message);
      console.error("drawer sites failed:", err);
    } finally {
      setDrawerLoading(false);
    }
  };

  // --- Update actions ---
  const handleUpdateAll = (plugin: PluginUpdateRow) => {
    const fromVersions = drawerSites.length > 0 && drawerPlugin?.slug === plugin.slug
      ? Object.entries(
          drawerSites
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

  const handleUpdateVersionGroup = (plugin: PluginUpdateRow, version: string, siteCount: number) => {
    const siteIds = drawerSites
      .filter((s) => s.installed_version === version && s.update_available)
      .map((s) => s.site_id);
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
      await fetchData();
      if (drawerPlugin?.slug === confirmModal.slug) {
        const res = await externalPluginService.getUpdateSites(confirmModal.slug);
        setDrawerSites(res.data.data);
      }
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to dispatch update";
      toast.error(message);
      console.error("update dispatch failed:", err);
    } finally {
      setUpdating(false);
    }
  };

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

  // --- Columns ---
  const columns: ColumnDef<PluginUpdateRow>[] = [
    {
      accessorKey: "name",
      header: "Plugin",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="min-w-0 max-w-[320px]">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="block truncate font-medium text-left cursor-default">
                    {p.name}
                  </span>
                }
              />
              <TooltipContent>{p.name}</TooltipContent>
            </Tooltip>
            <span className="block truncate text-xs text-muted-foreground font-mono">
              {p.slug}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              {renderStars(p.rating)}
              {p.active_installs && (
                <span className="text-xs text-muted-foreground truncate">
                  {p.active_installs} installs
                </span>
              )}
            </div>
            {p.last_updated_wporg && (
              <span className="block text-xs text-muted-foreground truncate">
                WP.org: {format(new Date(p.last_updated_wporg), "MMM d, yyyy")}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "installed_on_sites",
      header: "Sites",
      cell: ({ row }) => <span className="text-sm">{row.original.installed_on_sites}</span>,
    },
    {
      accessorKey: "needs_update_count",
      header: "Needs Update",
      cell: ({ row }) =>
        row.original.needs_update_count > 0 ? (
          <Badge variant="destructive">{row.original.needs_update_count}</Badge>
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ),
    },
    {
      accessorKey: "latest_version",
      header: "Latest",
      cell: ({ row }) =>
        row.original.latest_version ? (
          <Badge variant="secondary">v{row.original.latest_version}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const p = row.original;
        if (p.is_abandoned) {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Abandoned
                  </Badge>
                }
              />
              <TooltipContent>
                This plugin has not been updated in over 2 years on WP.org
              </TooltipContent>
            </Tooltip>
          );
        }
        if (p.needs_update_count > 0) {
          return (
            <Badge
              variant="outline"
              className="border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
            >
              Update available
            </Badge>
          );
        }
        return (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
          >
            Up to date
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {p.needs_update_count > 0 && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateAll(p);
                      }}
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>Update all sites</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDrawer(p);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>View sites</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  if (showLoader) {
    return <PageLoader variant="cards" />;
  }

  const pluginsWithUpdates = plugins.filter((p) => p.needs_update_count > 0).length;
  const totalOutdated = plugins.reduce((sum, p) => sum + p.needs_update_count, 0);

  return (
    <TooltipProvider delay={120}>
      <div className="page-content space-y-6">
        {/* --- Header --- */}
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

        {/* --- Stats --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{pluginsWithUpdates}</div>
              <p className="text-sm text-muted-foreground">Plugins with updates (this page)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{totalOutdated}</div>
              <p className="text-sm text-muted-foreground">Outdated instances (this page)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-0">
              <div className="text-2xl font-bold">{total}</div>
              <p className="text-sm text-muted-foreground">Total plugins matching filter</p>
            </CardContent>
          </Card>
        </div>

        {/* --- Filters --- */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative max-w-xs flex-1">
            <Input
              placeholder="Search plugins..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => onFilterChange(tab.value)}
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
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="h-8 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="most_affected">Most Affected</option>
            <option value="name">Plugin Name</option>
          </select>
        </div>

        {/* --- Table --- */}
        <DataTable
          columns={columns}
          data={plugins}
          loading={loading}
          serverPagination={{
            currentPage: page,
            perPage,
            total,
            lastPage,
            onPageChange: setPage,
            onPerPageChange,
            perPageOptions: PER_PAGE_OPTIONS,
          }}
        />

        {/* --- Detail drawer --- */}
        <Sheet
          open={drawerPlugin !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDrawerPlugin(null);
              setDrawerSites([]);
            }
          }}
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl overflow-y-auto"
          >
            {drawerPlugin && (
              <>
                <SheetHeader>
                  <SheetTitle className="truncate">{drawerPlugin.name}</SheetTitle>
                  <SheetDescription className="font-mono text-xs truncate">
                    {drawerPlugin.slug}
                  </SheetDescription>
                </SheetHeader>
                <div className="p-4 space-y-6">
                  {drawerLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                    </div>
                  ) : (
                    <>
                      {/* --- Version breakdown --- */}
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
                                const versionBreakdown = Object.entries(
                                  drawerSites.reduce<Record<string, number>>((acc, s) => {
                                    const v = s.installed_version || "unknown";
                                    acc[v] = (acc[v] || 0) + 1;
                                    return acc;
                                  }, {})
                                ).map(([version, site_count]) => ({ version, site_count }));
                                if (versionBreakdown.length === 0) {
                                  return (
                                    <TableRow>
                                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                        No sites
                                      </TableCell>
                                    </TableRow>
                                  );
                                }
                                return versionBreakdown.map((vb) => (
                                  <TableRow key={vb.version}>
                                    <TableCell>
                                      <Badge variant="outline">v{vb.version}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      {vb.site_count} site{vb.site_count !== 1 ? "s" : ""}
                                    </TableCell>
                                    <TableCell>
                                      {vb.version !== drawerPlugin.latest_version ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            handleUpdateVersionGroup(drawerPlugin, vb.version, vb.site_count)
                                          }
                                        >
                                          Update to v{drawerPlugin.latest_version}
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

                      {/* --- Sites --- */}
                      {drawerSites.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Sites</h4>
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Site</TableHead>
                                  <TableHead>Installed</TableHead>
                                  <TableHead>Latest</TableHead>
                                  <TableHead>Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {drawerSites.map((site) => (
                                  <TableRow key={site.site_id}>
                                    <TableCell>
                                      <div className="flex flex-col min-w-0 max-w-50">
                                        <span className="font-medium text-sm truncate">{site.site_name}</span>
                                        <span className="text-xs text-muted-foreground truncate">{site.site_url}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">v{site.installed_version || "—"}</Badge>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary">v{site.latest_version || "—"}</Badge>
                                    </TableCell>
                                    <TableCell>
                                      {site.update_available ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleUpdateSingle(site, drawerPlugin)}
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
                    </>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* --- Confirm modal --- */}
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
    </TooltipProvider>
  );
}
