"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Save, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  PortalSmtpConfig,
  SiteSmtpConfig,
  SmtpEncryption,
  SmtpFormPayload,
} from "@/lib/services/smtp";

interface Props {
  initial: PortalSmtpConfig | SiteSmtpConfig | null;
  loading?: boolean;
  saving?: boolean;
  testing?: boolean;
  onSave: (payload: SmtpFormPayload) => Promise<void> | void;
  onTest: (toEmail: string) => Promise<void> | void;
  /**
   * For the per-site tab we hide the master "enable" switch — every saved
   * site config is implicitly enabled. The portal tab needs it because
   * MAIL_MAILER=log is the default and admins need an off switch.
   */
  showEnableToggle?: boolean;
  /** Show the "last pushed at" timestamp under the form (per-site only). */
  lastPushedAt?: string | null;
}

export function SmtpForm({
  initial,
  loading,
  saving,
  testing,
  onSave,
  onTest,
  showEnableToggle = true,
  lastPushedAt,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState<string>("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [encryption, setEncryption] = useState<SmtpEncryption>("tls");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");

  const [testEmail, setTestEmail] = useState("");
  const [passwordIsSet, setPasswordIsSet] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setEnabled(initial.enabled);
    setHost(initial.host);
    setPort(String(initial.port || 587));
    setUsername(initial.username || "");
    setEncryption(initial.encryption);
    setFromEmail(initial.from_email);
    setFromName(initial.from_name);
    setPasswordIsSet(initial.password_set);
    // Don't pre-fill the password field — backend never returns it.
    setPassword("");
  }, [initial]);

  const handleSave = async () => {
    if (!host.trim() && enabled) {
      toast.error("Host is required when SMTP is enabled.");
      return;
    }
    await onSave({
      enabled,
      host: host.trim(),
      port: parseInt(port, 10) || 587,
      username: username.trim(),
      password, // empty string means "keep existing" on the backend
      encryption,
      from_email: fromEmail.trim(),
      from_name: fromName.trim(),
    });
    // Clear the password field after save so it doesn't sit there in cleartext
    setPassword("");
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter a recipient email for the test send.");
      return;
    }
    await onTest(testEmail.trim());
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted/50 rounded animate-pulse" />
        <div className="h-10 bg-muted/50 rounded animate-pulse" />
        <div className="h-10 bg-muted/50 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {showEnableToggle && (
        <div className="flex items-center gap-3">
          <Checkbox
            id="smtp-enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <Label htmlFor="smtp-enabled" className="font-normal cursor-pointer">
            Enable SMTP (when off, portal falls back to the configured driver in .env)
          </Label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="smtp-host">Host</Label>
          <Input
            id="smtp-host"
            placeholder="smtp.example.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            id="smtp-port"
            type="number"
            placeholder="587"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="smtp-username">Username</Label>
          <Input
            id="smtp-username"
            placeholder="user@example.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="smtp-password">
            Password{" "}
            {passwordIsSet && !password && (
              <span className="text-xs text-muted-foreground">
                (leave blank to keep existing)
              </span>
            )}
          </Label>
          <div className="relative">
            <Input
              id="smtp-password"
              type={showPassword ? "text" : "password"}
              placeholder={passwordIsSet ? "••••••••" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="smtp-encryption">Encryption</Label>
          <Select
            value={encryption}
            onValueChange={(v) => setEncryption((v as SmtpEncryption) ?? "tls")}
          >
            <SelectTrigger id="smtp-encryption" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tls">TLS (STARTTLS)</SelectItem>
              <SelectItem value="ssl">SSL</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="smtp-from-name">From name</Label>
          <Input
            id="smtp-from-name"
            placeholder="EPOS Portal"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="smtp-from-email">From email</Label>
        <Input
          id="smtp-from-email"
          type="email"
          placeholder="no-reply@example.com"
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </div>

      <div className="border-t pt-5 space-y-3">
        <Label htmlFor="smtp-test-to">Send a test email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="smtp-test-to"
            type="email"
            placeholder="you@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={handleTest}
            disabled={testing}
            className="w-full sm:w-auto"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send test
          </Button>
        </div>
        {lastPushedAt && (
          <p className="text-xs text-muted-foreground">
            Last pushed to agent: {new Date(lastPushedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
