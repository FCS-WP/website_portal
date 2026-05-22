"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { smtpService, type SiteSmtpConfig, type SmtpFormPayload } from "@/lib/services/smtp";
import { SmtpForm } from "@/components/smtp/smtp-form";

interface Props {
  siteId: number;
  siteName?: string;
}

/**
 * Per-site SMTP editor. Reused on:
 *   - the global /smtp page (per-site tab, with site dropdown selection)
 *   - the site detail page SMTP tab
 *
 * Saving dispatches PushSmtpToSite, which calls the agent /smtp/update endpoint.
 */
export function SiteSmtpTab({ siteId, siteName }: Props) {
  const [config, setConfig] = useState<SiteSmtpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    smtpService
      .getSite(siteId)
      .then((res) => {
        if (!cancelled) setConfig(res.data.data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load site SMTP settings.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const handleSave = async (payload: SmtpFormPayload) => {
    setSaving(true);
    try {
      await smtpService.updateSite(siteId, payload);
      toast.success("Saved. Pushing config to the site agent…");
      // Re-fetch so password_set + last_pushed_at refresh
      const res = await smtpService.getSite(siteId);
      setConfig(res.data.data);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message || "Failed to save SMTP settings.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (toEmail: string) => {
    setTesting(true);
    try {
      await smtpService.testSite(siteId, toEmail);
      toast.success(`Test email sent via the site agent.`);
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message || "Failed to send test email.";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site SMTP {siteName ? `— ${siteName}` : ""}</CardTitle>
        <CardDescription>
          Configures <code>wp_mail()</code> on this WordPress site via the EPOS Agent plugin.
          Credentials are stored encrypted in the portal and pushed to the site's
          PHPMailer through <code>phpmailer_init</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SmtpForm
          initial={config}
          loading={loading}
          saving={saving}
          testing={testing}
          showEnableToggle={true}
          lastPushedAt={config?.last_pushed_at ?? null}
          onSave={handleSave}
          onTest={handleTest}
        />
      </CardContent>
    </Card>
  );
}
