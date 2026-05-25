"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Trash2,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  credentialShareService,
  ShareLink,
} from "@/lib/services/credential-shares";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";

interface ActiveShareLinksProps {
  siteId: number | string;
}

export function ActiveShareLinks({ siteId }: ActiveShareLinksProps) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await credentialShareService.list(siteId);
      setLinks(res.data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleRevokeClick = (id: number) => {
    setRevokingId(id);
    setRevokeDialogOpen(true);
  };

  const confirmRevoke = async () => {
    if (revokingId === null) return;
    setRevokeLoading(true);
    try {
      await credentialShareService.revoke(siteId, revokingId);
      // Optimistically mark the revoked link as revoked
      setLinks((prev) =>
        prev.map((l) =>
          l.id === revokingId
            ? { ...l, status: 'revoked' as const, revoked_at: new Date().toISOString() }
            : l
        )
      );
      toast.success("Share link revoked");
    } catch {
      toast.error("Failed to revoke share link");
    } finally {
      setRevokeLoading(false);
      setRevokeDialogOpen(false);
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 mt-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="mt-8 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          Share Links
        </h3>
        <p className="text-sm text-muted-foreground">No share links created yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <LinkIcon className="h-4 w-4" />
        Share Links
      </h3>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium px-4 py-2.5">Shared</th>
                  <th className="text-left font-medium px-4 py-2.5">
                    Status
                  </th>
                  <th className="text-left font-medium px-4 py-2.5">
                    Includes
                  </th>
                  <th className="text-left font-medium px-4 py-2.5">
                    Expires
                  </th>
                  <th className="text-left font-medium px-4 py-2.5">Views</th>
                  <th className="text-left font-medium px-4 py-2.5">
                    Last access
                  </th>
                  <th className="text-right font-medium px-4 py-2.5">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const isActive = link.status === 'active';
                  const maxReached = link.view_count >= link.max_views;

                  return (
                    <tr key={link.id} className={`border-b last:border-b-0${!isActive ? ' opacity-60' : ''}`}>
                      {/* Shared */}
                      <td className="px-4 py-3">
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(parseISO(link.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                        {link.created_by && (
                          <div className="text-xs text-muted-foreground">
                            by {typeof link.created_by === 'string' ? link.created_by : link.created_by.name}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {link.status === 'active' && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                            Active
                          </Badge>
                        )}
                        {link.status === 'expired' && (
                          <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-xs">
                            Expired
                          </Badge>
                        )}
                        {link.status === 'exhausted' && (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">
                            Views Used
                          </Badge>
                        )}
                        {link.status === 'revoked' && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            Revoked
                          </Badge>
                        )}
                      </td>

                      {/* Includes */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {link.credentials && link.credentials.length > 0 ? (
                            link.credentials.map((credential) => (
                              <span
                                key={credential.id}
                                className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium"
                              >
                                {credential.label}
                              </span>
                            ))
                          ) : link.credential_types?.map((ct) => (
                            <span
                              key={ct.id}
                              className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium"
                            >
                              {ct.name}
                            </span>
                          )) ?? (
                            <span className="text-xs text-muted-foreground">
                              {link.credential_type_ids.length} type(s)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Expires */}
                      <td className="px-4 py-3">
                        {link.status === 'expired' ? (
                          <span className="text-xs text-destructive font-medium">
                            Expired
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(parseISO(link.expires_at), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </td>

                      {/* Views */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">
                            {link.view_count}/
                            {link.max_views === 9999
                              ? "∞"
                              : link.max_views}
                          </span>
                          {maxReached && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          )}
                        </div>
                      </td>

                      {/* Last access */}
                      <td className="px-4 py-3">
                        {link.last_accessed_at ? (
                          <div>
                            <div className="text-xs text-muted-foreground">
                              {link.last_accessed_ip || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(
                                parseISO(link.last_accessed_at),
                                { addSuffix: true }
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        {isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeClick(link.id)}
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={revokeDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeDialogOpen(false);
            setRevokingId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Revoke Share Link
            </DialogTitle>
            <DialogDescription>
              This will immediately invalidate the share link. Anyone with the
              link will no longer be able to access the credentials.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRevokeDialogOpen(false);
                setRevokingId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRevoke}
              disabled={revokeLoading}
            >
              {revokeLoading && (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              )}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
