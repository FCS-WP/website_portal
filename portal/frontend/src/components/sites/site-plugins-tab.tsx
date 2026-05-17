"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Package,
  Download,
  Trash2,
  Power,
  ExternalLink,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { externalPluginService } from "@/lib/services/external-plugins";
import type { SitePluginAll } from "@/types/external-plugins";
import { toast } from "sonner";

type PluginTypeFilter = "all" | "internal" | "wporg" | "premium";

interface SitePluginsTabProps {
  siteId: number;
  /**
   * Read-only mode: hides the Install / Update-all toolbar buttons AND the
   * per-row action buttons (Activate / Deactivate / Update / Uninstall).
   * View-only consumers (e.g. MKT support staff) get this; the underlying
   * Portal API would 403 their write attempts anyway, but hiding the UI
   * avoids confusing dead clicks.
   */
  readOnly?: boolean;
}

export function SitePluginsTab({ siteId, readOnly = false }: SitePluginsTabProps) {
  const [plugins, setPlugins] = useState<SitePluginAll[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<PluginTypeFilter>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [updateAllLoading, setUpdateAllLoading] = useState(false);

  // Modal states
  const [deactivateTarget, setDeactivateTarget] = useState<SitePluginAll | null>(null);
  const [updateTarget, setUpdateTarget] = useState<SitePluginAll | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<SitePluginAll | null>(null);
  const [uninstallConfirmSlug, setUninstallConfirmSlug] = useState("");
  const [updateAllConfirmOpen, setUpdateAllConfirmOpen] = useState(false);

  const fetchPlugins = useCallback(async () => {
    try {
      setLoading(true);
      const res = await externalPluginService.getSitePlugins(siteId);
      setPlugins(res.data.data || []);
    } catch {
      toast.error("Failed to load site plugins");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (siteId) fetchPlugins();
  }, [siteId, fetchPlugins]);

  // Computed counts
  const counts = useMemo(() => {
    const all = plugins.length;
    const internal = plugins.filter((p) => p.plugin_type === "internal").length;
    const wporg = plugins.filter((p) => p.plugin_type === "wporg").length;
    const premium = plugins.filter((p) => p.plugin_type === "premium").length;
    return { all, internal, wporg, premium };
  }, [plugins]);

  const outdatedWporgCount = useMemo(
    () => plugins.filter((p) => p.update_available && p.plugin_type === "wporg").length,
    [plugins]
  );

  const filteredPlugins = useMemo(() => {
    if (activeFilter === "all") return plugins;
    return plugins.filter((p) => p.plugin_type === activeFilter);
  }, [plugins, activeFilter]);

  // --- Actions ---
  const handleActivate = async (plugin: SitePluginAll) => {
    const key = `activate-${plugin.id}`;
    setActionLoading(key);
    try {
      await externalPluginService.activatePlugin(siteId, {
        slug: plugin.plugin_slug,
        plugin_file: plugin.plugin_file || "",
        plugin_name: plugin.plugin_name || undefined,
      });
      toast.success(`${plugin.plugin_name || plugin.plugin_slug} activated`);
      await fetchPlugins();
    } catch {
      toast.error(`Failed to activate ${plugin.plugin_name || plugin.plugin_slug}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    const key = `deactivate-${deactivateTarget.id}`;
    setActionLoading(key);
    try {
      await externalPluginService.deactivatePlugin(siteId, {
        slug: deactivateTarget.plugin_slug,
        plugin_file: deactivateTarget.plugin_file || "",
        plugin_name: deactivateTarget.plugin_name || undefined,
      });
      toast.success(`${deactivateTarget.plugin_name || deactivateTarget.plugin_slug} deactivated`);
      setDeactivateTarget(null);
      await fetchPlugins();
    } catch {
      toast.error(`Failed to deactivate ${deactivateTarget.plugin_name || deactivateTarget.plugin_slug}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdate = async () => {
    if (!updateTarget) return;
    const key = `update-${updateTarget.id}`;
    setActionLoading(key);
    try {
      await externalPluginService.update({
        slug: updateTarget.plugin_slug,
        site_ids: [siteId],
      });
      toast.success(`${updateTarget.plugin_name || updateTarget.plugin_slug} update initiated`);
      setUpdateTarget(null);
      await fetchPlugins();
    } catch {
      toast.error(`Failed to update ${updateTarget.plugin_name || updateTarget.plugin_slug}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUninstall = async () => {
    if (!uninstallTarget) return;
    const key = `uninstall-${uninstallTarget.id}`;
    setActionLoading(key);
    try {
      await externalPluginService.uninstallPlugin(siteId, {
        slug: uninstallTarget.plugin_slug,
        plugin_file: uninstallTarget.plugin_file || "",
        confirmation: uninstallConfirmSlug,
      });
      toast.success(`${uninstallTarget.plugin_name || uninstallTarget.plugin_slug} uninstalled`);
      setUninstallTarget(null);
      setUninstallConfirmSlug("");
      await fetchPlugins();
    } catch {
      toast.error(`Failed to uninstall ${uninstallTarget.plugin_name || uninstallTarget.plugin_slug}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateAll = async () => {
    setUpdateAllLoading(true);
    try {
      await externalPluginService.updateAllOnSite(siteId);
      toast.success("All outdated plugins are being updated");
      setUpdateAllConfirmOpen(false);
      await fetchPlugins();
    } catch {
      toast.error("Failed to update all plugins");
    } finally {
      setUpdateAllLoading(false);
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-40" />
            </div>
          </div>
          <Skeleton className="h-8 w-72" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // --- Empty state ---
  if (plugins.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No plugins found on this site. Plugins will appear here after the
            EPOS Agent reports them during its next sync.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-base font-medium">Plugins</h3>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" render={<Link href="/plugins/install" />}>
                  <Download className="h-3.5 w-3.5" />
                  Install plugin
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={outdatedWporgCount === 0}
                  onClick={() => setUpdateAllConfirmOpen(true)}
                >
                  <Package className="h-3.5 w-3.5" />
                  Update all outdated ({outdatedWporgCount})
                </Button>
              </div>
            )}
          </div>

          {/* Type Filter Tabs */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-2">
            {(
              [
                { key: "all", label: "All", count: counts.all },
                { key: "internal", label: "Company", count: counts.internal },
                { key: "wporg", label: "WP.org", count: counts.wporg },
                { key: "premium", label: "Premium", count: counts.premium },
              ] as const
            ).map(({ key, label, count }) => (
              <Button
                key={key}
                variant={activeFilter === key ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveFilter(key)}
              >
                {label} ({count})
              </Button>
            ))}
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plugin</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlugins.map((plugin) => (
                <TableRow key={plugin.id}>
                  {/* Plugin Name + Slug + Type Badge + Abandoned */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">
                            {plugin.plugin_name || plugin.plugin_slug}
                          </span>
                          {plugin.external_plugin?.is_abandoned && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="inline-flex">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Last updated{" "}
                                  {plugin.external_plugin.last_updated_wporg
                                    ? `on ${plugin.external_plugin.last_updated_wporg}`
                                    : "a long time ago"}{" "}
                                  — consider replacing
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <code className="text-xs text-muted-foreground">
                            {plugin.plugin_slug}
                          </code>
                          <TypeBadge type={plugin.plugin_type} />
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Version */}
                  <TableCell>
                    <Badge variant="secondary">
                      {plugin.installed_version || "—"}
                    </Badge>
                  </TableCell>

                  {/* Latest */}
                  <TableCell>
                    {plugin.plugin_type === "premium" ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <Badge variant="secondary">
                        {plugin.latest_version || "—"}
                      </Badge>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge
                        className={
                          plugin.is_active
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-100"
                        }
                      >
                        {plugin.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {plugin.update_available && (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Update Available
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    {readOnly ? (
                      <span className="text-xs text-muted-foreground italic">
                        View only
                      </span>
                    ) : (
                      <PluginActions
                        plugin={plugin}
                        actionLoading={actionLoading}
                        onActivate={handleActivate}
                        onDeactivate={setDeactivateTarget}
                        onUpdate={setUpdateTarget}
                        onUninstall={setUninstallTarget}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredPlugins.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No plugins match this filter.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deactivate Confirmation Modal */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Plugin</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <strong>{deactivateTarget?.plugin_name || deactivateTarget?.plugin_slug}</strong> on
              this site?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={!!actionLoading}
            >
              {actionLoading?.startsWith("deactivate") && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Confirmation Modal */}
      <Dialog
        open={!!updateTarget}
        onOpenChange={(open) => { if (!open) setUpdateTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Plugin</DialogTitle>
            <DialogDescription>
              Update <strong>{updateTarget?.plugin_name || updateTarget?.plugin_slug}</strong> from{" "}
              v{updateTarget?.installed_version} to v{updateTarget?.latest_version}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={!!actionLoading}>
              {actionLoading?.startsWith("update") && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uninstall Confirmation Modal */}
      <Dialog
        open={!!uninstallTarget}
        onOpenChange={(open) => {
          if (!open) {
            setUninstallTarget(null);
            setUninstallConfirmSlug("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Uninstall {uninstallTarget?.plugin_name || uninstallTarget?.plugin_slug}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                This will deactivate and permanently delete{" "}
                <strong>{uninstallTarget?.plugin_name || uninstallTarget?.plugin_slug}</strong> from this
                site.
              </span>
              <span className="block text-xs text-muted-foreground">
                Plugin database data may remain in the WordPress database.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Type the plugin slug to confirm:
            </label>
            <Input
              placeholder={uninstallTarget?.plugin_slug}
              value={uninstallConfirmSlug}
              onChange={(e) => setUninstallConfirmSlug(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUninstallTarget(null);
                setUninstallConfirmSlug("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                uninstallConfirmSlug !== uninstallTarget?.plugin_slug || !!actionLoading
              }
              onClick={handleUninstall}
            >
              {actionLoading?.startsWith("uninstall") && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Uninstall permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update All Confirmation Modal */}
      <Dialog
        open={updateAllConfirmOpen}
        onOpenChange={setUpdateAllConfirmOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update All Outdated Plugins</DialogTitle>
            <DialogDescription>
              This will update {outdatedWporgCount} WP.org plugin
              {outdatedWporgCount !== 1 ? "s" : ""} to their latest versions on this site.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateAllConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAll} disabled={updateAllLoading}>
              {updateAllLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --- Sub-components ---

function TypeBadge({ type }: { type: SitePluginAll["plugin_type"] }) {
  const styles: Record<typeof type, string> = {
    internal: "bg-green-100 text-green-800 hover:bg-green-100",
    wporg: "bg-blue-100 text-blue-800 hover:bg-blue-100",
    premium: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  };
  const labels: Record<typeof type, string> = {
    internal: "Company",
    wporg: "WP.org",
    premium: "Premium",
  };
  return <Badge className={styles[type]}>{labels[type]}</Badge>;
}

function PluginActions({
  plugin,
  actionLoading,
  onActivate,
  onDeactivate,
  onUpdate,
  onUninstall,
}: {
  plugin: SitePluginAll;
  actionLoading: string | null;
  onActivate: (p: SitePluginAll) => void;
  onDeactivate: (p: SitePluginAll) => void;
  onUpdate: (p: SitePluginAll) => void;
  onUninstall: (p: SitePluginAll) => void;
}) {
  const isLoading = (action: string) => actionLoading === `${action}-${plugin.id}`;

  // Company (internal) plugins — Activate/Deactivate allowed for quick ops,
  // but Update/Uninstall stay behind the Deployments flow so company code
  // can't be removed from a single site by accident.
  if (plugin.plugin_type === "internal") {
    return (
      <div className="flex items-center justify-end gap-1">
        {plugin.is_active ? (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onDeactivate(plugin)}
            disabled={isLoading("deactivate")}
          >
            {isLoading("deactivate") ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            Deactivate
          </Button>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={() => onActivate(plugin)}
            disabled={isLoading("activate")}
          >
            {isLoading("activate") ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            Activate
          </Button>
        )}
        {plugin.plugin_id && (
          <Link
            href={`/plugins/${plugin.plugin_id}`}
            className="inline-flex items-center gap-1 px-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            title="Open in plugin repository"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  // Premium plugins
  if (plugin.plugin_type === "premium") {
    return (
      <span className="text-sm text-muted-foreground italic">Unmanaged</span>
    );
  }

  // WP.org plugins
  return (
    <div className="flex items-center justify-end gap-1">
      {/* Active + outdated: Update button */}
      {plugin.update_available && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => onUpdate(plugin)}
          disabled={isLoading("update")}
        >
          {isLoading("update") ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Update{plugin.latest_version ? ` to v${plugin.latest_version}` : ""}
        </Button>
      )}

      {/* Active: show Deactivate */}
      {plugin.is_active && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => onDeactivate(plugin)}
          disabled={isLoading("deactivate")}
        >
          {isLoading("deactivate") ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Power className="h-3 w-3" />
          )}
          Deactivate
        </Button>
      )}

      {/* Inactive: show Activate + Uninstall */}
      {!plugin.is_active && (
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={() => onActivate(plugin)}
            disabled={isLoading("activate")}
          >
            {isLoading("activate") ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Power className="h-3 w-3" />
            )}
            Activate
          </Button>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => onUninstall(plugin)}
            disabled={isLoading("uninstall")}
          >
            {isLoading("uninstall") ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Uninstall
          </Button>
        </>
      )}
    </div>
  );
}
