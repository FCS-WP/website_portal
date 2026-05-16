"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Copy,
  Check,
  Lock,
  AlertTriangle,
  Clock,
  Eye,
  Globe,
  Server,
  FolderOpen,
  Database,
  Key,
} from "lucide-react";
import {
  credentialShareService,
  ShareInfo,
  ShareAccessResponse,
} from "@/lib/services/credential-shares";

const TYPE_ICONS: Record<string, React.ElementType> = {
  wordpress: Globe,
  hosting: Server,
  ftp: FolderOpen,
  sftp: FolderOpen,
  database: Database,
  custom: Key,
};

function getTypeIcon(slug: string) {
  return TYPE_ICONS[slug] || Key;
}

type PageState = "loading" | "password" | "credentials" | "invalid";

export default function VaultSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<PageState>("loading");
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [credentials, setCredentials] = useState<ShareAccessResponse | null>(
    null
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchShareInfo = useCallback(async () => {
    try {
      const res = await credentialShareService.getShareInfo(token);
      const info = res.data.data;
      setShareInfo(info);

      if (info.requires_password) {
        setState("password");
      } else {
        // No password required — access directly
        await accessCredentials();
      }
    } catch {
      setState("invalid");
    }
  }, [token]);

  useEffect(() => {
    fetchShareInfo();
  }, [fetchShareInfo]);

  const accessCredentials = async (pwd?: string) => {
    setSubmitting(true);
    setPasswordError(null);
    try {
      const res = await credentialShareService.accessShare(token, pwd);
      setCredentials(res.data.data);
      setState("credentials");
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };
      if (error.response?.status === 403 || error.response?.status === 422) {
        setPasswordError(
          error.response?.data?.message || "Incorrect password"
        );
      } else {
        setState("invalid");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    accessCredentials(password);
  };

  const handleCopy = async (value: string, fieldId: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // -- LOADING STATE --
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  // -- INVALID / EXPIRED STATE --
  if (state === "invalid") {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h2 className="text-lg font-semibold mb-2">
            This link has expired or is invalid
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            The share link you followed is no longer accessible. It may have
            expired, reached its view limit, or been revoked.
          </p>
        </CardContent>
      </Card>
    );
  }

  // -- PASSWORD REQUIRED STATE --
  if (state === "password") {
    return (
      <Card>
        <CardContent className="py-10">
          <div className="text-center mb-6">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">Password Protected</h2>
            <p className="text-sm text-muted-foreground mt-1">
              This share link is password protected. Enter the password to view
              credentials.
            </p>
            {shareInfo && (
              <p className="text-xs text-muted-foreground mt-2">
                Site: <span className="font-medium">{shareInfo.site_name}</span>
              </p>
            )}
          </div>

          <form
            onSubmit={handlePasswordSubmit}
            className="max-w-sm mx-auto space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="share-password">Password</Label>
              <Input
                id="share-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={submitting || !password}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              View Credentials
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // -- CREDENTIALS DISPLAY STATE --
  if (state === "credentials" && credentials) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">{credentials.site_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Shared credentials
          </p>
        </div>

        {/* Warning banner */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Save these credentials now — this link may not be accessible again.
          </p>
        </div>

        {/* Credential cards grouped by type */}
        {credentials.credentials.map((group, groupIdx) => {
          const Icon = getTypeIcon(group.type_slug);
          return (
            <Card key={groupIdx}>
              <CardContent className="p-0">
                {/* Type header */}
                <div className="flex items-center gap-2 border-b px-4 py-3 bg-muted/30">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{group.type}</span>
                </div>

                {/* Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                  {group.fields.map((field, fieldIdx) => {
                    const fieldId = `${groupIdx}-${fieldIdx}`;
                    const isCopied = copiedField === fieldId;

                    return (
                      <div key={fieldIdx} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {field.label}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono truncate flex-1">
                            {field.value || "—"}
                          </span>
                          {field.value && (
                            <button
                              onClick={() => handleCopy(field.value, fieldId)}
                              className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                              title="Copy"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Info bar */}
        <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            Views remaining:{" "}
            {credentials.views_remaining === 9999
              ? "Unlimited"
              : credentials.views_remaining}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Expires:{" "}
            {new Date(credentials.expires_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
