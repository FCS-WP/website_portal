"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteService } from "@/lib/services/sites";
import { ordersService } from "@/lib/services/orders";
import { useAuthStore } from "@/stores/auth-store";
import { Site } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { Globe, Server, Calendar, Code, Plug, KeyRound, Trash2, RefreshCw, ExternalLink, FlaskConical, Shield, LayoutDashboard, Puzzle, ShoppingCart, Mail, Activity, MoreVertical, Loader2 } from "lucide-react";
import { SitePluginsTab } from "@/components/sites/site-plugins-tab";
import { SiteActivityTab } from "@/components/sites/site-activity-tab";
import { SiteCredentialsTab } from "@/components/sites/site-credentials-tab";
import { SiteSecurityTab } from "@/components/sites/site-security-tab";
import { SiteOrdersTab } from "@/components/orders/site-orders-tab";
import { ApiKeyDialog } from "@/components/sites/api-key-dialog";

export default function SiteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  // Role-derived capability flags. Centralised so each tab/button gates from
  // the same source — easier to audit and to extend later (e.g. limiting
  // certain plugin actions to admin only).
  const role = useAuthStore((s) => s.user?.role);
  const isMkt = role === "mkt";
  const isAdmin = role === "admin";

  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [autologinLoading, setAutologinLoading] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [togglingBeta, setTogglingBeta] = useState(false);

  useEffect(() => {
    async function fetchSite() {
      try {
        const res = await siteService.show(id);
        setSite(res.data.data);
      } catch {
        toast.error("Failed to load site details");
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchSite();
  }, [id]);

  const handleRegenerateKey = async () => {
    if (!site) return;
    setRegenerating(true);
    try {
      const res = await siteService.regenerateKey(site.id);
      const apiKey = res.data.data?.api_key;
      if (apiKey) {
        setNewApiKey(apiKey);
        setRegenerateDialogOpen(false);
        setApiKeyDialogOpen(true);
        // Update local site status to pending
        setSite({ ...site, status: "pending" });
        toast.success("API key regenerated successfully");
      }
    } catch {
      toast.error("Failed to regenerate API key");
    } finally {
      setRegenerating(false);
    }
  };

  const handleAutologin = async () => {
    if (!site) return;
    setAutologinLoading(true);
    try {
      const res = await siteService.autologin(site.id);
      const redirectUrl = res.data.data.redirect_url;
      if (redirectUrl) {
        window.open(redirectUrl, "_blank");
      } else {
        toast.error("No redirect URL returned");
      }
    } catch {
      toast.error("Failed to open WP Admin");
    } finally {
      setAutologinLoading(false);
    }
  };

  /**
   * Trigger the agent's full ping inline (orders + plugins + connection).
   * After it returns we refresh the site row so the header reflects the new
   * last_ping_at / status.
   */
  const handleSyncNow = async () => {
    if (!site) return;
    setSyncing(true);
    try {
      await ordersService.syncSite(site.id);
      toast.success("Sync complete.");
      // Refresh the displayed site so badges/timestamps update.
      const res = await siteService.show(site.id);
      setSite(res.data.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!site) return;
    setDeleting(true);
    try {
      await siteService.delete(site.id);
      toast.success(`Site "${site.name}" deleted successfully`);
      router.push("/sites");
    } catch {
      toast.error("Failed to delete site");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleBeta = async () => {
    if (!site) return;
    setTogglingBeta(true);
    try {
      const res = await siteService.toggleBetaTester(site.id);
      const updatedSite = res.data.data;
      setSite({ ...site, is_beta_tester: updatedSite.is_beta_tester });
      toast.success(
        updatedSite.is_beta_tester
          ? "Site enrolled as beta tester"
          : "Site removed from beta testing"
      );
    } catch {
      toast.error("Failed to toggle beta tester status");
    } finally {
      setTogglingBeta(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Site not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Title row */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <StatusBadge status={site.status} />
          {site.is_beta_tester && (
            <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">BETA</span>
          )}
        </div>

        {/* Actions row — primary actions inline, rare/risky ones in a kebab menu */}
        <div className="flex items-center gap-2 flex-wrap">
          {["connected", "online"].includes(site.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutologin}
              disabled={autologinLoading}
            >
              {autologinLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 h-4 w-4" />
              )}
              {autologinLoading ? "Opening…" : "Open WP Admin"}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing}
            title="Force the WP agent to push fresh orders, plugins, and status"
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>

          {/* Less-frequent / destructive actions live in this menu. Keeping them
              out of the main row prevents accidental clicks on Delete and reduces
              visual weight in a page that's mostly informational.

              The menu is hidden entirely for MKT (every item is admin/dev-only,
              so showing an empty kebab would just confuse them). */}
          {!isMkt && (
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  aria-label="More site actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={handleToggleBeta}
                    disabled={togglingBeta}
                  >
                    <FlaskConical className="mr-2 h-4 w-4" />
                    {togglingBeta
                      ? "Updating…"
                      : site.is_beta_tester
                        ? "Disable beta testing"
                        : "Enable beta testing"}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setRegenerateDialogOpen(true)}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Regenerate API key
                    </DropdownMenuItem>
                  )}
                  {isAdmin && <DropdownMenuSeparator />}
                  {isAdmin && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete site
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Regenerate Key Confirmation Dialog */}
      <AlertDialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate the current API key. The site agent will need
              to be reconfigured with the new key. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateKey}
              disabled={regenerating}
            >
              {regenerating ? "Regenerating..." : "Regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Key Dialog */}
      <ApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
        apiKey={newApiKey}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{site.name}&rdquo;? This action can be undone by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="plugins" className="gap-1">
            <Puzzle className="h-3.5 w-3.5" />
            Plugins
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1">
            <ShoppingCart className="h-3.5 w-3.5" />
            Orders
          </TabsTrigger>
          {!isMkt && (
            <TabsTrigger value="smtp" className="gap-1">
              <Mail className="h-3.5 w-3.5" />
              SMTP
            </TabsTrigger>
          )}
          <TabsTrigger value="credentials" className="gap-1">
            <KeyRound className="h-3.5 w-3.5" />
            Credentials
          </TabsTrigger>
          {!isMkt && (
            <TabsTrigger value="activity" className="gap-1">
              <Activity className="h-3.5 w-3.5" />
              Activity
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="security" className="gap-1">
              <Shield className="h-3.5 w-3.5" />
              Security
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Site Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Site Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">URL</dt>
                  <dd className="mt-1">
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 transition-colors"
                    >
                      {site.url}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={site.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Server className="h-3 w-3" /> Hosting
                  </dt>
                  <dd className="mt-1">{site.hosting?.name || "Not assigned"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Code className="h-3 w-3" /> WP Version
                  </dt>
                  <dd className="mt-1">{site.wp_version || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">PHP Version</dt>
                  <dd className="mt-1">{site.php_version || "Unknown"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Plug className="h-3 w-3" /> WooCommerce
                  </dt>
                  <dd className="mt-1">
                    <Badge variant={site.woo_active ? "default" : "secondary"}>
                      {site.woo_active ? "Active" : "Inactive"}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Last Ping
                  </dt>
                  <dd className="mt-1">
                    {site.last_ping_at
                      ? format(new Date(site.last_ping_at), "MMM d, yyyy HH:mm")
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                  <dd className="mt-1">
                    {format(new Date(site.created_at), "MMM d, yyyy")}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Description */}
          {site.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{site.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {site.tags && site.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2 flex-wrap">
                  {site.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assigned Users */}
          {site.users && site.users.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {site.users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between py-2 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="secondary">{user.role}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plugins" className="mt-6">
          <SitePluginsTab siteId={site.id} readOnly={isMkt} />
        </TabsContent>

        <TabsContent value="orders" className="mt-6">
          <SiteOrdersTab siteId={site.id} siteUrl={site.url} />
        </TabsContent>

        {!isMkt && (
          <TabsContent value="smtp" className="mt-6">
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  SMTP configuration coming in Phase 2.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="credentials" className="mt-6">
          <SiteCredentialsTab
            siteId={site.id}
            siteName={site.name}
            siteUrl={site.url}
            readOnly={isMkt}
          />
        </TabsContent>

        {!isMkt && (
          <TabsContent value="activity" className="mt-6">
            <SiteActivityTab siteId={site.id} />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="security" className="mt-6">
            <SiteSecurityTab siteId={site.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
