"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Link as LinkIcon,
  Clock,
  Shield,
  UserRound,
} from "lucide-react";
import { credentialShareService } from "@/lib/services/credential-shares";
import { Credential } from "@/types";
import { toast } from "sonner";

interface ShareCredentialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: number | string;
  siteName: string;
  selectedCredentials?: Credential[];
  onShareComplete?: () => void;
}

const EXPIRY_OPTIONS = [
  { value: "12", label: "12 hours" },
  { value: "24", label: "24 hours" },
  { value: "48", label: "48 hours" },
  { value: "168", label: "7 days" },
];

const MAX_VIEWS_OPTIONS = [
  { value: "1", label: "1 view" },
  { value: "2", label: "2 views" },
  { value: "5", label: "5 views" },
  { value: "9999", label: "Unlimited" },
];

export function ShareCredentialsDialog({
  isOpen,
  onClose,
  siteId,
  siteName,
  selectedCredentials,
  onShareComplete,
}: ShareCredentialsDialogProps) {
  const shareCredentials = selectedCredentials ?? [];
  const [expiresHours, setExpiresHours] = useState("24");
  const [maxViews, setMaxViews] = useState("1");
  const [sharePassword, setSharePassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Generated link state
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedInfo, setGeneratedInfo] = useState<{
    expires_hours: number;
    max_views: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (shareCredentials.length === 0) {
      toast.error("Please select at least one account");
      return;
    }

    const selectedCredentialIds = shareCredentials.map((credential) => credential.id);
    const selectedTypeIds = Array.from(
      new Set(shareCredentials.map((credential) => credential.credential_type.id))
    );

    setGenerating(true);
    try {
      const res = await credentialShareService.create(siteId, {
        credential_ids: selectedCredentialIds,
        credential_type_ids: selectedTypeIds,
        expires_hours: parseInt(expiresHours),
        max_views: parseInt(maxViews),
        share_password: sharePassword || undefined,
      });

      const { token } = res.data.data;
      const url = `${window.location.origin}/vault/share/${token}`;
      setGeneratedUrl(url);
      setGeneratedInfo({
        expires_hours: parseInt(expiresHours),
        max_views: parseInt(maxViews),
      });
      onShareComplete?.();
    } catch (err: unknown) {
      const error = err as {
        response?: { data?: { message?: string; error?: string } };
      };
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to generate share link"
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    // Reset state
    setGeneratedUrl(null);
    setGeneratedInfo(null);
    setExpiresHours("24");
    setMaxViews("1");
    setSharePassword("");
    setShowPassword(false);
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Share credentials — {siteName}
          </DialogTitle>
          <DialogDescription>
            Generate a secure, time-limited link to share credentials with a
            client.
          </DialogDescription>
        </DialogHeader>

        {!generatedUrl ? (
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Selected accounts</Label>
              {shareCredentials.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  Select one or more accounts from the credentials list first.
                </div>
              ) : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {shareCredentials.map((credential) => {
                    const displayName = getCredentialDisplayName(credential);
                    const username = getCredentialFieldValue(credential, ["username", "user"]);
                    const email = getCredentialFieldValue(credential, ["email"]);

                    return (
                      <div
                        key={credential.id}
                        className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                      >
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {displayName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {credential.credential_type.name}
                            {username && username !== displayName ? ` · ${username}` : ""}
                            {email ? ` · ${email}` : ""}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Link expires after</Label>
              <Select value={expiresHours} onValueChange={(v) => { if (v) setExpiresHours(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max views */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max views</Label>
              <Select value={maxViews} onValueChange={(v) => { if (v) setMaxViews(v); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_VIEWS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Extra password (optional)
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Leave empty to skip"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                (leave empty to skip)
              </p>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={generating || shareCredentials.length === 0}
              className="w-full"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Generate link
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Success state */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex items-center gap-2 mb-3">
                <Check className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  Share link generated
                </span>
              </div>

              {/* URL input with copy button */}
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={generatedUrl}
                  className="text-xs font-mono bg-white dark:bg-gray-900"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Info text */}
              {generatedInfo && (
                <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Expires in {generatedInfo.expires_hours}h · Max{" "}
                    {generatedInfo.max_views === 9999
                      ? "unlimited"
                      : `${generatedInfo.max_views}`}{" "}
                    view(s) · Auto-revoke
                  </span>
                </div>
              )}
            </div>

            <Button variant="outline" onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getCredentialDisplayName(credential: Credential) {
  return (
    credential.label ||
    getCredentialFieldValue(credential, ["display_name", "username", "user", "email"]) ||
    credential.credential_type.name
  );
}

function getCredentialFieldValue(credential: Credential, keys: string[]) {
  return credential.fields.find((field) => keys.includes(field.field_key))?.field_value || "";
}
