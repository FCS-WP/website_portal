"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { Eye, Plus } from "lucide-react";
import { pluginService } from "@/lib/services/plugins";
import { Plugin } from "@/types";
import { toast } from "sonner";

export default function PluginsPage() {
  const router = useRouter();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    author: "",
  });

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await pluginService.list();
      setPlugins(res.data.data || []);
    } catch {
      toast.error("Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  const filteredPlugins = plugins.filter((plugin) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      plugin.name.toLowerCase().includes(s) ||
      plugin.slug.toLowerCase().includes(s)
    );
  });

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const payload: { name: string; description?: string; author?: string } = {
        name: formData.name,
      };
      if (formData.description) payload.description = formData.description;
      if (formData.author) payload.author = formData.author;

      await pluginService.create(payload);
      toast.success("Plugin created successfully");
      setDialogOpen(false);
      setFormData({ name: "", description: "", author: "" });
      fetchPlugins();
    } catch {
      toast.error("Failed to create plugin");
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnDef<Plugin>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <button
          className="font-medium text-primary hover:text-primary/80 transition-colors"
          onClick={() => router.push(`/plugins/${row.original.id}`)}
        >
          {row.getValue("name")}
        </button>
      ),
    },
    {
      accessorKey: "slug",
      header: "Slug",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground font-mono">
          {row.getValue("slug")}
        </span>
      ),
    },
    {
      accessorKey: "latest_version",
      header: "Latest Version",
      cell: ({ row }) => {
        const version = row.original.latest_version;
        return version ? (
          <Badge variant="secondary">{version.version}</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        );
      },
    },
    {
      accessorKey: "site_plugins_count",
      header: "Installed Sites",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.site_plugins_count ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => router.push(`/plugins/${row.original.id}`)}
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <div className="page-content space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Plugins</h1>
          <p className="text-muted-foreground">Manage your plugin repository</p>
        </div>
        <Button
          onClick={() => {
            setFormData({ name: "", description: "", author: "" });
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Plugin
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Input
          placeholder="Search by name or slug..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <DataTable columns={columns} data={filteredPlugins} pageSize={20} />

      {/* Create Plugin Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Plugin</DialogTitle>
            <DialogDescription>
              Add a new plugin to the repository.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="plugin-name">Name</Label>
              <Input
                id="plugin-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="My Plugin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plugin-description">Description</Label>
              <Textarea
                id="plugin-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plugin-author">Author</Label>
              <Input
                id="plugin-author"
                value={formData.author}
                onChange={(e) =>
                  setFormData({ ...formData, author: e.target.value })
                }
                placeholder="Author name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || !formData.name}
            >
              Create Plugin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
