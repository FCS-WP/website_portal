"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { Mail, Building2, Globe, SendHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { siteService } from "@/lib/services/sites";
import { smtpService, type PortalSmtpConfig, type SmtpFormPayload } from "@/lib/services/smtp";
import { SmtpForm } from "@/components/smtp/smtp-form";
import { SiteSmtpTab } from "@/components/sites/site-smtp-tab";
import type { Site } from "@/types";

export default function SmtpPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SMTP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Outgoing mail for the portal itself and for each managed WordPress site.
          </p>
        </div>
      </div>

      <Tabs defaultValue={isAdmin ? "portal" : "site"}>
        <TabsList>
          {isAdmin && (
            <TabsTrigger value="portal" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Portal
            </TabsTrigger>
          )}
          <TabsTrigger value="site" className="gap-1.5">
            <Globe className="h-4 w-4" />
            Per-site
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="portal" className="mt-6">
            <PortalSmtpPanel />
          </TabsContent>
        )}

        <TabsContent value="site" className="mt-6">
          <PerSitePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PortalSmtpPanel() {
  const [config, setConfig] = useState<PortalSmtpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    smtpService
      .getPortal()
      .then((res) => {
        if (!cancelled) setConfig(res.data.data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load portal SMTP settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (payload: SmtpFormPayload) => {
    setSaving(true);
    try {
      await smtpService.updatePortal(payload);
      toast.success("Portal SMTP settings saved.");
      const res = await smtpService.getPortal();
      setConfig(res.data.data);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message || "Failed to save settings.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (toEmail: string) => {
    setTesting(true);
    try {
      await smtpService.testPortal(toEmail);
      toast.success(`Test email sent to ${toEmail}.`);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message || "Failed to send test email.";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const handleApplyToSites = async () => {
    setApplying(true);
    try {
      const res = await smtpService.applyPortalToSites(overwriteExisting);
      const t = res.data.data;
      toast.success(
        `Created ${t.created}, overwritten ${t.overwritten}, skipped ${t.skipped_existing} existing, ${t.no_api_key} sites have no agent key.`
      );
      setApplyOpen(false);
      setOverwriteExisting(false);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message || "Failed to apply to sites.";
      toast.error(message);
    } finally {
      setApplying(false);
    }
  };

  // Apply-to-all needs a saved portal config to copy from. Disable the button
  // until host + from-email are filled in (the seeder's getDefaults() checks
  // the same two keys before returning a row).
  const canApply = !!config && !!config.host && !!config.from_email;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Portal SMTP</CardTitle>
          <CardDescription>
            Server used by the portal for password resets, order spike alerts, and
            any other outbound mail. Disable to fall back to <code>MAIL_MAILER</code> in <code>.env</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SmtpForm
            initial={config}
            loading={loading}
            saving={saving}
            testing={testing}
            showEnableToggle={true}
            onSave={handleSave}
            onTest={handleTest}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apply to all sites</CardTitle>
          <CardDescription>
            Push the portal SMTP config above to every managed WordPress site
            so they all send mail through the same server. Newly created sites
            inherit this automatically — this button is for filling in the
            sites that already exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setApplyOpen(true)}
            disabled={!canApply || applying}
            variant="secondary"
          >
            {applying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
            Apply to all sites
          </Button>
          {!canApply && (
            <p className="text-xs text-muted-foreground mt-2">
              Save the portal SMTP form above first (host + from email required).
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={applyOpen} onOpenChange={setApplyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply portal SMTP to all sites?</AlertDialogTitle>
            <AlertDialogDescription>
              This copies your portal SMTP config into each site and queues a
              push to that site&apos;s agent plugin. Sites without an agent key
              are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
            <Checkbox
              className="mt-0.5"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium">Overwrite sites that already have a custom SMTP config.</span>
              <span className="block text-muted-foreground text-xs mt-0.5">
                Leave unchecked to only fill in sites that have no per-site
                SMTP saved yet. Existing per-site overrides will be left alone.
              </span>
            </span>
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyToSites} disabled={applying}>
              {applying ? "Applying…" : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PerSitePanel() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingSites(true);
    siteService
      .list({ per_page: 200 })
      .then((res: { data: { data: Site[] } }) => {
        if (cancelled) return;
        const list: Site[] = res.data.data || [];
        setSites(list);
        if (list.length > 0) setSelectedId(String(list[0].id));
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load sites.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSites(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose a site</CardTitle>
          <CardDescription>
            Each WordPress site can have its own SMTP server. Saved credentials
            are encrypted in the portal and pushed to the site agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-2">
            <Label htmlFor="site-picker">Site</Label>
            <Select
              value={selectedId ?? ""}
              onValueChange={(v) => setSelectedId(v ?? null)}
              disabled={loadingSites || sites.length === 0}
            >
              <SelectTrigger id="site-picker">
                <SelectValue
                  placeholder={loadingSites ? "Loading sites…" : "Select a site"}
                />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedId && (
        <SiteSmtpTab
          key={selectedId}
          siteId={parseInt(selectedId, 10)}
          siteName={sites.find((s) => String(s.id) === selectedId)?.name}
        />
      )}
    </div>
  );
}
