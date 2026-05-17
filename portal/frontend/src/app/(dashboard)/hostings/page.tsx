"use client";

import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Eye, Copy, EyeOff } from "lucide-react";
import { hostingService } from "@/lib/services/hostings";
import { Hosting, HostingCredentials } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

const providers = ["RunCloud", "GridPane", "SpinupWP", "Cloudways", "Forge", "Ploi", "Other"];

export default function HostingsPage() {
  const [hostings, setHostings] = useState<Hosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [editingHosting, setEditingHosting] = useState<Hosting | null>(null);
  const [deletingHosting, setDeletingHosting] = useState<Hosting | null>(null);
  const [credentialsHosting, setCredentialsHosting] = useState<Hosting | null>(null);
  const [credentials, setCredentials] = useState<HostingCredentials | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    provider: "",
    note: "",
    ip_address: "",
    username: "",
    password: "",
    panel_url: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchHostings = async () => {
    try {
      const res = await hostingService.list();
      setHostings(res.data.data || []);
    } catch {
      toast.error("Failed to load hostings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHostings();
  }, []);

  const openCreateDialog = () => {
    setEditingHosting(null);
    setFormData({ name: "", provider: "", note: "", ip_address: "", username: "", password: "", panel_url: "" });
    setShowFormPassword(false);
    setDialogOpen(true);
  };

  const openEditDialog = (hosting: Hosting) => {
    setEditingHosting(hosting);
    setFormData({
      name: hosting.name,
      provider: hosting.provider,
      note: hosting.note || "",
      ip_address: hosting.ip_address || "",
      username: hosting.username || "",
      password: "",
      panel_url: hosting.panel_url || "",
    });
    setShowFormPassword(false);
    setDialogOpen(true);
  };

  const openDeleteDialog = (hosting: Hosting) => {
    setDeletingHosting(hosting);
    setDeleteDialogOpen(true);
  };

  const openCredentialsDialog = async (hosting: Hosting) => {
    setCredentialsHosting(hosting);
    setCredentials(null);
    setShowPassword(false);
    setCredentialsDialogOpen(true);
    setCredentialsLoading(true);
    try {
      const res = await hostingService.getCredentials(hosting.id);
      setCredentials(res.data.data);
    } catch {
      toast.error("Failed to load credentials");
    } finally {
      setCredentialsLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const submitData: Record<string, string | undefined> = {
        name: formData.name,
        provider: formData.provider,
        note: formData.note || undefined,
        ip_address: formData.ip_address || undefined,
        username: formData.username || undefined,
        panel_url: formData.panel_url || undefined,
      };
      // Only send password if it was entered (for edit, empty means no change)
      if (formData.password) {
        submitData.password = formData.password;
      }

      if (editingHosting) {
        await hostingService.update(editingHosting.id, submitData);
        toast.success("Hosting updated successfully");
      } else {
        await hostingService.create(submitData as { name: string; provider: string });
        toast.success("Hosting created successfully");
      }
      setDialogOpen(false);
      fetchHostings();
    } catch {
      toast.error(editingHosting ? "Failed to update hosting" : "Failed to create hosting");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingHosting) return;
    setSubmitting(true);
    try {
      await hostingService.delete(deletingHosting.id);
      toast.success("Hosting deleted successfully");
      setDeleteDialogOpen(false);
      fetchHostings();
    } catch {
      toast.error("Failed to delete hosting");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Hosting>[] = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "provider",
      header: "Provider",
      cell: ({ row }) => (
        <Badge variant="secondary">{row.getValue("provider")}</Badge>
      ),
    },
    {
      accessorKey: "ip_address",
      header: "IP",
      cell: ({ row }) => {
        const ip = row.getValue("ip_address") as string | null;
        if (!ip) return <span className="text-muted-foreground">—</span>;
        return <code className="text-xs">{ip}</code>;
      },
    },
    {
      accessorKey: "sites_count",
      header: "Sites",
      cell: ({ row }) => row.getValue("sites_count") ?? 0,
    },
    {
      accessorKey: "note",
      header: "Notes",
      cell: ({ row }) => {
        const note = row.getValue("note") as string | null;
        if (!note) return <span className="text-muted-foreground">—</span>;
        return note.length > 50 ? `${note.slice(0, 50)}...` : note;
      },
    },
    {
      accessorKey: "created_at",
      header: "Created At",
      cell: ({ row }) => format(new Date(row.getValue("created_at")), "MMM d, yyyy"),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openCredentialsDialog(row.original)}
            title="View Credentials"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEditDialog(row.original)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDeleteDialog(row.original)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hostings</h1>
          <p className="text-muted-foreground">Manage your hosting providers</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Hosting
        </Button>
      </div>

      <DataTable columns={columns} data={hostings} />

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingHosting ? "Edit Hosting" : "Add Hosting"}
            </DialogTitle>
            <DialogDescription>
              {editingHosting
                ? "Update the hosting provider details."
                : "Add a new hosting provider to the system."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="My Hosting"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select
                value={formData.provider}
                onValueChange={(val) =>
                  setFormData({ ...formData, provider: val ?? "" })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ip_address">IP Address</Label>
                <Input
                  id="ip_address"
                  value={formData.ip_address}
                  onChange={(e) =>
                    setFormData({ ...formData, ip_address: e.target.value })
                  }
                  placeholder="192.168.1.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel_url">Panel URL</Label>
                <Input
                  id="panel_url"
                  value={formData.panel_url}
                  onChange={(e) =>
                    setFormData({ ...formData, panel_url: e.target.value })
                  }
                  placeholder="https://panel.runcloud.io/..."
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({ ...formData, username: e.target.value })
                  }
                  placeholder="root"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showFormPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder={editingHosting ? "Leave blank to keep current" : "Enter password"}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowFormPassword(!showFormPassword)}
                  >
                    {showFormPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Notes</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                placeholder="Optional notes about this hosting..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !formData.name || !formData.provider}>
              {editingHosting ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Credentials — {credentialsHosting?.name}</DialogTitle>
            <DialogDescription>
              Access credentials for this hosting provider.
            </DialogDescription>
          </DialogHeader>
          {credentialsLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : credentials ? (
            <div className="space-y-4 py-4">
              <CredentialRow
                label="IP Address"
                value={credentials.ip_address}
                onCopy={() => copyToClipboard(credentials.ip_address || "", "IP Address")}
              />
              <CredentialRow
                label="Panel URL"
                value={credentials.panel_url}
                onCopy={() => copyToClipboard(credentials.panel_url || "", "Panel URL")}
                isUrl
              />
              <CredentialRow
                label="Username"
                value={credentials.username}
                onCopy={() => copyToClipboard(credentials.username || "", "Username")}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Password</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono">
                    {credentials.password
                      ? showPassword
                        ? credentials.password
                        : "••••••••••••"
                      : <span className="text-muted-foreground">Not set</span>
                    }
                  </div>
                  {credentials.password && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(credentials.password || "", "Password")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="py-4 text-muted-foreground text-sm">No credentials available.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Hosting</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingHosting?.name}&rdquo;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  isUrl,
}: {
  label: string;
  value: string | null;
  onCopy: () => void;
  isUrl?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 text-sm font-mono truncate">
          {value ? (
            isUrl ? (
              <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {value}
              </a>
            ) : (
              value
            )
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>
        {value && (
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
