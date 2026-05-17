"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { securityService } from "@/lib/services/security";
import type { TwofaDashboard } from "@/types/security";

export default function TwoFaManagementPage() {
  const [dashboard, setDashboard] = useState<TwofaDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  // Enable dialog state
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [enableSite, setEnableSite] = useState<{ id: number; name: string } | null>(null);
  const [enableMethod, setEnableMethod] = useState("totp");
  const [enabling, setEnabling] = useState(false);

  // Disable dialog state
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [disableSite, setDisableSite] = useState<{ id: number; name: string } | null>(null);
  const [disabling, setDisabling] = useState(false);

  // Bulk selection
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [bulkEnabling, setBulkEnabling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await securityService.twofaDashboard();
      setDashboard(response.data.data);
    } catch {
      toast.error("Failed to load 2FA dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleEnableClick = (site: { id: number; name: string }) => {
    setEnableSite(site);
    setEnableMethod("totp");
    setEnableDialogOpen(true);
  };

  const handleDisableClick = (site: { id: number; name: string }) => {
    setDisableSite(site);
    setDisableDialogOpen(true);
  };

  const handleEnableConfirm = async () => {
    if (!enableSite) return;
    setEnabling(true);
    try {
      await securityService.enable2fa(enableSite.id, enableMethod);
      toast.success(`2FA enabled for ${enableSite.name}`);
      setEnableDialogOpen(false);
      setEnableSite(null);
      await fetchDashboard();
    } catch {
      toast.error(`Failed to enable 2FA for ${enableSite.name}. The site agent may be unreachable.`);
    } finally {
      setEnabling(false);
    }
  };

  const handleDisableConfirm = async () => {
    if (!disableSite) return;
    setDisabling(true);
    try {
      await securityService.disable2fa(disableSite.id);
      toast.success(`2FA disabled for ${disableSite.name}`);
      setDisableDialogOpen(false);
      setDisableSite(null);
      await fetchDashboard();
    } catch {
      toast.error(`Failed to disable 2FA for ${disableSite.name}. The site agent may be unreachable.`);
    } finally {
      setDisabling(false);
    }
  };

  const toggleSiteSelection = (siteId: number) => {
    setSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
      } else {
        next.add(siteId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!dashboard) return;
    const disabledSites = dashboard.sites_list.filter((s) => !s.is_enabled);
    if (selectedSites.size === disabledSites.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(disabledSites.map((s) => s.id)));
    }
  };

  const handleBulkEnable = async () => {
    if (selectedSites.size === 0) return;
    setBulkEnabling(true);
    setBulkProgress({ current: 0, total: selectedSites.size });

    const siteIds = Array.from(selectedSites);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < siteIds.length; i++) {
      setBulkProgress({ current: i + 1, total: siteIds.length });
      try {
        await securityService.enable2fa(siteIds[i], "totp");
        successCount++;
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`2FA enabled for ${successCount} site(s)`);
    }
    if (failCount > 0) {
      toast.error(`Failed to enable 2FA for ${failCount} site(s)`);
    }

    setSelectedSites(new Set());
    setBulkEnabling(false);
    setBulkProgress({ current: 0, total: 0 });
    await fetchDashboard();
  };

  const enabledPercentage = dashboard
    ? dashboard.total_sites > 0
      ? Math.round((dashboard.sites_with_2fa / dashboard.total_sites) * 100)
      : 0
    : 0;

  const disabledPercentage = dashboard
    ? dashboard.total_sites > 0
      ? Math.round((dashboard.sites_without_2fa / dashboard.total_sites) * 100)
      : 0
    : 0;

  const disabledSitesForBulk = dashboard
    ? dashboard.sites_list.filter((s) => !s.is_enabled)
    : [];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          2FA Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage two-factor authentication across all sites
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Sites
            </CardTitle>
            <Shield className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboard?.total_sites ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              2FA Enabled
            </CardTitle>
            <ShieldCheck className="size-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {dashboard?.sites_with_2fa ?? 0}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {enabledPercentage}% of all sites
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Without 2FA
            </CardTitle>
            <ShieldX className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">
              {dashboard?.sites_without_2fa ?? 0}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {disabledPercentage}% of all sites
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions */}
      {disabledSitesForBulk.length > 0 && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSelectAll}
            disabled={bulkEnabling}
          >
            {selectedSites.size === disabledSitesForBulk.length
              ? "Deselect All"
              : "Select All Without 2FA"}
          </Button>
          {selectedSites.size > 0 && (
            <Button
              size="sm"
              onClick={handleBulkEnable}
              disabled={bulkEnabling}
            >
              {bulkEnabling ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Enabling {bulkProgress.current}/{bulkProgress.total}...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5" />
                  Enable 2FA for {selectedSites.size} Selected
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Sites Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Site Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>2FA Status</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dashboard?.sites_list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No sites found
                  </TableCell>
                </TableRow>
              )}
              {dashboard?.sites_list.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    {!site.is_enabled && (
                      <input
                        type="checkbox"
                        checked={selectedSites.has(site.id)}
                        onChange={() => toggleSiteSelection(site.id)}
                        disabled={bulkEnabling}
                        className="size-4 rounded border-border"
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/sites/${site.id}`}
                      className="hover:underline"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.url}
                  </TableCell>
                  <TableCell>
                    {site.is_enabled ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Enabled
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        Disabled
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.is_enabled && site.provider
                      ? site.provider.toUpperCase()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {site.is_enabled ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          handleDisableClick({ id: site.id, name: site.name })
                        }
                        disabled={bulkEnabling}
                      >
                        <ShieldX className="size-3.5" />
                        Disable
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleEnableClick({ id: site.id, name: site.name })
                        }
                        disabled={bulkEnabling}
                      >
                        <ShieldCheck className="size-3.5" />
                        Enable
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Enable 2FA Dialog */}
      <Dialog open={enableDialogOpen} onOpenChange={setEnableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable 2FA for {enableSite?.name}</DialogTitle>
            <DialogDescription>
              Choose a two-factor authentication method for this site.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="2fa-method"
                value="totp"
                checked={enableMethod === "totp"}
                onChange={() => setEnableMethod("totp")}
                className="size-4"
              />
              <div>
                <div className="text-sm font-medium">TOTP (Authenticator App)</div>
                <div className="text-xs text-muted-foreground">
                  Use Google Authenticator, Authy, or similar apps
                </div>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="radio"
                name="2fa-method"
                value="email"
                checked={enableMethod === "email"}
                onChange={() => setEnableMethod("email")}
                className="size-4"
              />
              <div>
                <div className="text-sm font-medium">Email</div>
                <div className="text-xs text-muted-foreground">
                  Send verification codes via email
                </div>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button
              onClick={handleEnableConfirm}
              disabled={enabling}
            >
              {enabling && <Loader2 className="size-3.5 animate-spin" />}
              {enabling ? "Enabling..." : "Enable 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Confirmation */}
      <AlertDialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable 2FA for {disableSite?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disable two-factor authentication for this
              site? This will reduce security and make accounts more vulnerable
              to unauthorized access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabling}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDisableConfirm}
              disabled={disabling}
            >
              {disabling && <Loader2 className="size-3.5 animate-spin" />}
              {disabling ? "Disabling..." : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
