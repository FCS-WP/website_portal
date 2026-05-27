"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Check,
  Pencil,
  Trash2,
  ExternalLink,
  Globe,
  Server,
  FolderOpen,
  Database,
  Key,
  KeyRound,
  AlertCircle,
  Share2,
} from "lucide-react";
import { credentialService } from "@/lib/services/credentials";
import { VaultAuditLog } from "@/components/vault/vault-audit-log";
import { Credential, CredentialField } from "@/types";
import { useAuthStore } from "@/stores/auth-store";
import { PinModal } from "@/components/vault/pin-modal";
import { CredentialFormDialog } from "@/components/vault/credential-form-dialog";
import { ShareCredentialsDialog } from "@/components/vault/share-credentials-dialog";
import { ActiveShareLinks } from "@/components/vault/active-share-links";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface SiteCredentialsTabProps {
  siteId: number | string;
  siteName: string;
  siteUrl: string;
  /**
   * Read-only mode: hides Add / Edit / Delete buttons but keeps reveal +
   * copy actions. MKT users need to read credentials to share with clients
   * but mustn't modify them. The backend already rejects MKT writes — this
   * flag just hides the dead UI controls.
   */
  readOnly?: boolean;
}

type PendingAction =
  | { type: "reveal"; credentialId: number; fieldKey: string }
  | { type: "copy"; credentialId: number; fieldKey: string }
  | { type: "delete"; credentialId: number };

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

// Unique type slugs from credentials for filter tabs
function getUniqueTypes(credentials: Credential[]) {
  const seen = new Map<string, { slug: string; name: string }>();
  for (const cred of credentials) {
    const slug = cred.credential_type.slug;
    if (!seen.has(slug)) {
      seen.set(slug, { slug, name: cred.credential_type.name });
    }
  }
  return Array.from(seen.values());
}

// Group credentials by type slug
function groupByType(credentials: Credential[]) {
  const groups = new Map<string, Credential[]>();
  for (const cred of credentials) {
    const slug = cred.credential_type.slug;
    if (!groups.has(slug)) {
      groups.set(slug, []);
    }
    groups.get(slug)!.push(cred);
  }
  return groups;
}

export function SiteCredentialsTab({
  siteId,
  siteName,
  siteUrl,
  readOnly = false,
}: SiteCredentialsTabProps) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  // Combined gate for write-style buttons. readOnly is the explicit caller
  // signal (MKT); the existing isAdmin check is preserved so dev-only logic
  // upstream still applies. canMutate => can Add/Edit/Delete.
  const canMutate = !readOnly;

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PIN modal state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Revealed values: Map<`${credentialId}-${fieldKey}`, { value, timer }>
  const [revealedValues, setRevealedValues] = useState<
    Map<string, { value: string; remaining: number }>
  >(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Copy feedback: Set<`${credentialId}-${fieldKey}`>
  const [copiedFields, setCopiedFields] = useState<Set<string>>(new Set());

  // Add/Edit dialog
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<Credential | undefined>();

  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCredentialId, setDeletingCredentialId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Autologin loading
  const [autologinLoading, setAutologinLoading] = useState(false);

  // Share dialog
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedShareCredentialIds, setSelectedShareCredentialIds] = useState<Set<number>>(new Set());
  const [shareLinksRefreshKey, setShareLinksRefreshKey] = useState(0);

  const fetchCredentials = useCallback(async () => {
    try {
      setError(null);
      const res = await credentialService.list(siteId);
      const nextCredentials = res.data.data || [];
      setCredentials(nextCredentials);
      setSelectedShareCredentialIds((prev) => {
        const availableIds = new Set(nextCredentials.map((credential: Credential) => credential.id));
        return new Set(Array.from(prev).filter((id) => availableIds.has(id)));
      });
    } catch {
      setError("Failed to load credentials");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearInterval(timer));
    };
  }, []);

  const makeFieldKey = (credentialId: number, fieldKey: string) =>
    `${credentialId}-${fieldKey}`;

  // --- Action handlers ---

  const handleRevealClick = (credentialId: number, fieldKey: string) => {
    const key = makeFieldKey(credentialId, fieldKey);
    if (revealedValues.has(key)) {
      // Already revealed, hide it
      clearRevealTimer(key);
      setRevealedValues((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    setPendingAction({ type: "reveal", credentialId, fieldKey });
    setPinModalOpen(true);
  };

  const handleCopyClick = (credentialId: number, fieldKey: string, plainValue?: string) => {
    if (plainValue !== undefined) {
      // Non-sensitive or already-revealed — copy directly
      copyToClipboard(plainValue, credentialId, fieldKey);
      return;
    }
    setPendingAction({ type: "copy", credentialId, fieldKey });
    setPinModalOpen(true);
  };

  const handleDeleteClick = (credentialId: number) => {
    setDeletingCredentialId(credentialId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingCredentialId === null) return;
    setPendingAction({ type: "delete", credentialId: deletingCredentialId });
    setDeleteDialogOpen(false);
    setPinModalOpen(true);
  };

  const handleEditClick = (credential: Credential) => {
    setEditingCredential(credential);
    setFormDialogOpen(true);
  };

  const handleAddClick = () => {
    setEditingCredential(undefined);
    setFormDialogOpen(true);
  };

  const handleToggleShareCredential = (credentialId: number) => {
    setSelectedShareCredentialIds((prev) => {
      const next = new Set(prev);
      if (next.has(credentialId)) {
        next.delete(credentialId);
      } else {
        next.add(credentialId);
      }
      return next;
    });
  };

  const handleSelectAllShareCredentials = () => {
    setSelectedShareCredentialIds(new Set(credentials.map((credential) => credential.id)));
  };

  const handleClearShareSelection = () => {
    setSelectedShareCredentialIds(new Set());
  };

  const handleShareComplete = () => {
    handleClearShareSelection();
    setShareLinksRefreshKey((key) => key + 1);
  };

  const handleAutologin = async () => {
    setAutologinLoading(true);
    try {
      const res = await credentialService.autologin(siteId);
      const url = res.data.data.redirect_url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No redirect URL returned");
      }
    } catch {
      toast.error("Failed to generate auto-login link");
    } finally {
      setAutologinLoading(false);
    }
  };

  // --- PIN success handler ---

  const handlePinSuccess = async (pin: string) => {
    if (!pendingAction) return;

    try {
      if (pendingAction.type === "reveal") {
        const { credentialId, fieldKey } = pendingAction;
        const res = await credentialService.reveal(siteId, credentialId, fieldKey, pin);
        const key = makeFieldKey(credentialId, fieldKey);
        const expiresIn = res.data.expires_in || 30;
        startRevealTimer(key, res.data.value, expiresIn);
      } else if (pendingAction.type === "copy") {
        const { credentialId, fieldKey } = pendingAction;
        const res = await credentialService.copy(siteId, credentialId, fieldKey, pin);
        copyToClipboard(res.data.value, credentialId, fieldKey);
      } else if (pendingAction.type === "delete") {
        const { credentialId } = pendingAction;
        setDeleteLoading(true);
        await credentialService.delete(siteId, credentialId, pin);
        toast.success("Credential deleted");
        fetchCredentials();
      }
    } catch {
      toast.error("Operation failed. Please try again.");
    } finally {
      setPendingAction(null);
      setDeleteLoading(false);
    }
  };

  // --- Helpers ---

  const copyToClipboard = (value: string, credentialId: number, fieldKey: string) => {
    navigator.clipboard.writeText(value).then(() => {
      const key = makeFieldKey(credentialId, fieldKey);
      setCopiedFields((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setCopiedFields((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 2000);
    });
  };

  const startRevealTimer = (key: string, value: string, seconds: number) => {
    clearRevealTimer(key);
    setRevealedValues((prev) => {
      const next = new Map(prev);
      next.set(key, { value, remaining: seconds });
      return next;
    });
    const timer = setInterval(() => {
      setRevealedValues((prev) => {
        const entry = prev.get(key);
        if (!entry || entry.remaining <= 1) {
          clearInterval(timer);
          timersRef.current.delete(key);
          const next = new Map(prev);
          next.delete(key);
          return next;
        }
        const next = new Map(prev);
        next.set(key, { ...entry, remaining: entry.remaining - 1 });
        return next;
      });
    }, 1000);
    timersRef.current.set(key, timer);
  };

  const clearRevealTimer = (key: string) => {
    const timer = timersRef.current.get(key);
    if (timer) {
      clearInterval(timer);
      timersRef.current.delete(key);
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-8 w-36" />
        </div>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => { setLoading(true); fetchCredentials(); }}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (credentials.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">
              No credentials stored for this site.
            </p>
            {canMutate && (
              <Button onClick={handleAddClick}>
                <Plus className="h-4 w-4 mr-1" />
                Add Credentials
              </Button>
            )}
          </CardContent>
        </Card>

        <CredentialFormDialog
          isOpen={formDialogOpen}
          onClose={() => setFormDialogOpen(false)}
          onSuccess={() => { setFormDialogOpen(false); fetchCredentials(); }}
          siteId={siteId}
        />

        <PinModal
          isOpen={pinModalOpen}
          onClose={() => { setPinModalOpen(false); setPendingAction(null); }}
          onSuccess={handlePinSuccess}
        />
      </>
    );
  }

  const uniqueTypes = getUniqueTypes(credentials);
  const grouped = groupByType(credentials);
  const selectedShareCredentials = credentials.filter((credential) =>
    selectedShareCredentialIds.has(credential.id)
  );

  return (
    <div className="space-y-4">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        {isAdmin && (
          <>
            <span className="text-xs text-muted-foreground">
              {selectedShareCredentialIds.size} selected
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllShareCredentials}
              disabled={selectedShareCredentialIds.size === credentials.length}
            >
              Select all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearShareSelection}
              disabled={selectedShareCredentialIds.size === 0}
            >
              Clear
            </Button>
            <Button
              variant={selectedShareCredentialIds.size > 0 ? "default" : "outline"}
              size="sm"
              onClick={() => setShareDialogOpen(true)}
              disabled={selectedShareCredentialIds.size === 0}
            >
              <Share2 className="h-4 w-4 mr-1.5" />
              Share with client
            </Button>
          </>
        )}
        {canMutate && (
          <Button size="sm" onClick={handleAddClick}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Credentials
          </Button>
        )}
      </div>

      {/* Type filter tabs */}
      {uniqueTypes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {uniqueTypes.map((t) => {
            const Icon = getTypeIcon(t.slug);
            return (
              <Button
                key={t.slug}
                variant="outline"
                size="sm"
                onClick={() => {
                  document
                    .getElementById(`cred-section-${t.slug}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <Icon className="h-3.5 w-3.5 mr-1" />
                {t.name}
              </Button>
            );
          })}
        </div>
      )}

      {/* Credential sections */}
      {Array.from(grouped.entries()).map(([slug, creds]) => (
        <div
          key={slug}
          id={`cred-section-${slug}`}
          className="scroll-mt-20 space-y-3"
        >
          {creds.map((credential) => {
            const Icon = getTypeIcon(credential.credential_type.slug);
            const isSelectedForShare = selectedShareCredentialIds.has(credential.id);
            return (
              <Card
                key={credential.id}
                className={isSelectedForShare ? "border-primary/60 ring-1 ring-primary/40" : undefined}
              >
                <CardContent className="p-0">
                  {/* Credential header */}
                  <div className="flex flex-col gap-3 border-b px-4 pb-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {isAdmin && (
                        <Checkbox
                          aria-label={`Select ${credential.label || credential.credential_type.name} for sharing`}
                          checked={isSelectedForShare}
                          onChange={() => handleToggleShareCredential(credential.id)}
                          className="accent-black"
                        />
                      )}
                      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm truncate">
                        {credential.credential_type.name}
                        {credential.label && (
                          <span className="text-muted-foreground font-normal">
                            {" — "}
                            {credential.label}
                          </span>
                        )}
                      </span>
                      {!credential.created_by && (
                        <span
                          className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                          title="Synced from WP Agent"
                        >
                          Auto-synced
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1 sm:flex-shrink-0">
                      {credential.credential_type.slug === "wordpress" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAutologin}
                          disabled={autologinLoading}
                          className="w-full sm:w-auto"
                        >
                          {autologinLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          )}
                          WP Admin
                        </Button>
                      )}
                      {canMutate && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEditClick(credential)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canMutate && isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteClick(credential.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Fields grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 px-4 pb-3 pt-3">
                    {credential.fields
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((field) => (
                        <FieldCell
                          key={field.id}
                          field={field}
                          credentialId={credential.id}
                          revealedValues={revealedValues}
                          copiedFields={copiedFields}
                          onReveal={handleRevealClick}
                          onCopy={handleCopyClick}
                          makeFieldKey={makeFieldKey}
                        />
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Dialogs */}
      <CredentialFormDialog
        isOpen={formDialogOpen}
        onClose={() => { setFormDialogOpen(false); setEditingCredential(undefined); }}
        onSuccess={() => {
          setFormDialogOpen(false);
          setEditingCredential(undefined);
          fetchCredentials();
        }}
        siteId={siteId}
        credential={editingCredential}
      />

      <PinModal
        isOpen={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setPendingAction(null); }}
        onSuccess={handlePinSuccess}
      />

      {/* Vault Audit Log */}
      <div className="mt-8 border-t pt-8">
        <VaultAuditLog siteId={siteId} />
      </div>

      {/* Share credentials dialog */}
      <ShareCredentialsDialog
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        siteId={siteId}
        siteName={siteName}
        selectedCredentials={selectedShareCredentials}
        onShareComplete={handleShareComplete}
      />

      {/* Active share links (admin only) */}
      {isAdmin && <ActiveShareLinks key={shareLinksRefreshKey} siteId={siteId} />}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setDeletingCredentialId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Credential</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this credential? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingCredentialId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteLoading}
            >
              {deleteLoading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Field cell component ---

interface FieldCellProps {
  field: CredentialField;
  credentialId: number;
  revealedValues: Map<string, { value: string; remaining: number }>;
  copiedFields: Set<string>;
  onReveal: (credentialId: number, fieldKey: string) => void;
  onCopy: (credentialId: number, fieldKey: string, plainValue?: string) => void;
  makeFieldKey: (credentialId: number, fieldKey: string) => string;
}

function FieldCell({
  field,
  credentialId,
  revealedValues,
  copiedFields,
  onReveal,
  onCopy,
  makeFieldKey,
}: FieldCellProps) {
  const key = makeFieldKey(credentialId, field.field_key);
  const revealed = revealedValues.get(key);
  const isCopied = copiedFields.has(key);
  const hasSensitiveValue = field.has_value ?? true;

  if (!field.is_sensitive) {
    // Non-sensitive field
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {field.field_label}
        </p>
        <div className="flex items-start gap-2">
          <span className="flex-1 break-all text-sm font-mono">
            {field.field_value || "—"}
          </span>
          {field.field_value && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onCopy(credentialId, field.field_key, field.field_value!)}
            >
              {isCopied ? (
                <Check className="h-3 w-3 text-green-600" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Sensitive field
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {field.field_label}
      </p>
      <div className="flex items-start gap-2">
        {!hasSensitiveValue ? (
          <span className="flex-1 text-sm text-muted-foreground">Not set</span>
        ) : revealed ? (
          <span className="flex-1 break-all text-sm font-mono">
            {revealed.value || "—"}
            <span className="text-xs text-muted-foreground ml-1.5">
              ({revealed.remaining}s)
            </span>
          </span>
        ) : (
          <span className="text-sm tracking-widest flex-1">••••••••••</span>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onReveal(credentialId, field.field_key)}
          title={revealed ? "Hide" : "Reveal"}
          disabled={!hasSensitiveValue}
        >
          {revealed ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            onCopy(
              credentialId,
              field.field_key,
              revealed ? revealed.value : undefined
            )
          }
          title="Copy"
          disabled={!hasSensitiveValue}
        >
          {isCopied ? (
            <Check className="h-3 w-3 text-green-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}
