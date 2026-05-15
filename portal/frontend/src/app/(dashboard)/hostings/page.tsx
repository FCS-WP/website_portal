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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { hostingService } from "@/lib/services/hostings";
import { Hosting } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

const providers = ["RunCloud", "GridPane", "SpinupWP", "Cloudways", "Forge", "Ploi", "Other"];

export default function HostingsPage() {
  const [hostings, setHostings] = useState<Hosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingHosting, setEditingHosting] = useState<Hosting | null>(null);
  const [deletingHosting, setDeletingHosting] = useState<Hosting | null>(null);
  const [formData, setFormData] = useState({ name: "", provider: "", note: "" });
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
    setFormData({ name: "", provider: "", note: "" });
    setDialogOpen(true);
  };

  const openEditDialog = (hosting: Hosting) => {
    setEditingHosting(hosting);
    setFormData({
      name: hosting.name,
      provider: hosting.provider,
      note: hosting.note || "",
    });
    setDialogOpen(true);
  };

  const openDeleteDialog = (hosting: Hosting) => {
    setDeletingHosting(hosting);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (editingHosting) {
        await hostingService.update(editingHosting.id, formData);
        toast.success("Hosting updated successfully");
      } else {
        await hostingService.create(formData);
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
        <div className="flex items-center gap-2">
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
        <DialogContent>
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
