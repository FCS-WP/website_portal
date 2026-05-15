"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { siteService } from "@/lib/services/sites";
import { hostingService } from "@/lib/services/hostings";
import { Site, Hosting } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SitesPage() {
  const router = useRouter();
  const [sites, setSites] = useState<Site[]>([]);
  const [hostings, setHostings] = useState<Hosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterHosting, setFilterHosting] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    url: "",
    hosting_id: "",
    description: "",
    tags: "",
    user_ids: [] as number[],
  });

  const fetchData = useCallback(async () => {
    try {
      const [sitesRes, hostingsRes] = await Promise.all([
        siteService.list(),
        hostingService.list(),
      ]);
      setSites(sitesRes.data.data || []);
      setHostings(hostingsRes.data.data || []);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredSites = sites.filter((site) => {
    if (filterStatus !== "all" && site.status !== filterStatus) return false;
    if (filterHosting !== "all" && String(site.hosting_id) !== filterHosting) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        site.name.toLowerCase().includes(s) ||
        site.url.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        url: formData.url,
        description: formData.description || null,
        tags: formData.tags ? formData.tags.split(",").map((t) => t.trim()) : [],
      };
      if (formData.hosting_id) {
        payload.hosting_id = Number(formData.hosting_id);
      }
      if (formData.user_ids.length > 0) {
        payload.user_ids = formData.user_ids;
      }

      const res = await siteService.create(payload);
      const apiKey = res.data.data?.api_key;
      toast.success("Site created successfully");
      setDialogOpen(false);

      if (apiKey) {
        setNewApiKey(apiKey);
        setApiKeyDialogOpen(true);
      }

      fetchData();
    } catch {
      toast.error("Failed to create site");
    } finally {
      setSubmitting(false);
    }
  };

  const copyApiKey = () => {
    navigator.clipboard.writeText(newApiKey);
    toast.success("API key copied to clipboard");
  };

  const columns: ColumnDef<Site>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <button
          className="font-medium text-primary hover:underline"
          onClick={() => router.push(`/sites/${row.original.id}`)}
        >
          {row.getValue("name")}
        </button>
      ),
    },
    {
      accessorKey: "url",
      header: "URL",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.getValue("url")}</span>
      ),
    },
    {
      accessorKey: "hosting",
      header: "Hosting",
      cell: ({ row }) => row.original.hosting?.name || "—",
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
    },
    {
      accessorKey: "woo_active",
      header: "WooCommerce",
      cell: ({ row }) => (
        <Badge variant={row.getValue("woo_active") ? "default" : "secondary"}>
          {row.getValue("woo_active") ? "Yes" : "No"}
        </Badge>
      ),
    },
    {
      accessorKey: "last_ping_at",
      header: "Last Ping",
      cell: ({ row }) => {
        const val = row.getValue("last_ping_at") as string | null;
        return val ? format(new Date(val), "MMM d, HH:mm") : "Never";
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = row.original.tags;
        if (!tags || tags.length === 0) return "—";
        return (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{tags.length - 3}
              </Badge>
            )}
          </div>
        );
      },
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
          <h1 className="text-3xl font-bold">Sites</h1>
          <p className="text-muted-foreground">Manage your WordPress sites</p>
        </div>
        <Button onClick={() => {
          setFormData({ name: "", url: "", hosting_id: "", description: "", tags: "", user_ids: [] });
          setDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Add Site
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Input
          placeholder="Search by name or URL..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="connected">Connected</SelectItem>
            <SelectItem value="disconnected">Disconnected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterHosting} onValueChange={(val) => setFilterHosting(val ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Hosting" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Hostings</SelectItem>
            {hostings.map((h) => (
              <SelectItem key={h.id} value={String(h.id)}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={filteredSites} pageSize={20} />

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Site</DialogTitle>
            <DialogDescription>
              Add a new WordPress site to manage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="site-name">Name</Label>
              <Input
                id="site-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Site"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-url">URL</Label>
              <Input
                id="site-url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-hosting">Hosting</Label>
              <Select
                value={formData.hosting_id}
                onValueChange={(val) => setFormData({ ...formData, hosting_id: val ?? "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select hosting" />
                </SelectTrigger>
                <SelectContent>
                  {hostings.map((h) => (
                    <SelectItem key={h.id} value={String(h.id)}>
                      {h.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-desc">Description</Label>
              <Textarea
                id="site-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site-tags">Tags (comma-separated)</Label>
              <Input
                id="site-tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="ecommerce, production, client-a"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting || !formData.name || !formData.url}>
              Create Site
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Site API Key</DialogTitle>
            <DialogDescription>
              Save this API key now. You won&apos;t be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input value={newApiKey} readOnly className="font-mono text-sm" />
              <Button variant="outline" onClick={copyApiKey}>
                Copy
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setApiKeyDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
