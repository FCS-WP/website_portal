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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreHorizontal, Trash2, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiKeyDialog } from "@/components/sites/api-key-dialog";
import { siteService } from "@/lib/services/sites";
import { hostingService } from "@/lib/services/hostings";
import { useAuthStore } from "@/stores/auth-store";
import { Site, Hosting } from "@/types";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// Color-code Last Ping by recency. Anything older than 2h likely needs
// attention — the cron pings every 5 min so a healthy site shows <15 min.
// Dot stays saturated in both modes; text gets a lighter step in dark mode
// so it pops against the dark background.
function lastPingTone(iso: string | null): { dotClass: string; textClass: string; label: string } {
  if (!iso) return { dotClass: "bg-gray-400", textClass: "text-muted-foreground", label: "Never" };
  const ageMs = Date.now() - new Date(iso).getTime();
  const mins = ageMs / 60_000;
  if (mins < 15)  return { dotClass: "bg-green-500", textClass: "text-green-700 dark:text-green-400", label: formatDistanceToNow(new Date(iso), { addSuffix: true }) };
  if (mins < 120) return { dotClass: "bg-amber-500", textClass: "text-amber-700 dark:text-amber-400", label: formatDistanceToNow(new Date(iso), { addSuffix: true }) };
  return            { dotClass: "bg-red-500",   textClass: "text-red-700 dark:text-red-400",     label: formatDistanceToNow(new Date(iso), { addSuffix: true }) };
}

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

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    url: "",
    hosting_id: "",
    description: "",
    tags: "",
    user_ids: [] as number[],
  });

  // Only admins can read /api/hostings (it's a CRUD endpoint, not a dropdown
  // source). For non-admin roles we skip the call entirely — the hosting
  // filter is hidden for them too, so an empty array is fine. We also fetch
  // sites + hostings independently so a single failed call doesn't blank
  // the whole page (previously Promise.all + 403 wiped the sites list).
  const userRole = useAuthStore((s) => s.user?.role);
  const canFetchHostings = userRole === "admin";
  // Site creation is admin+dev per route middleware; MKT can't create sites,
  // so hide the Add button for them.
  const canCreateSite = userRole === "admin" || userRole === "dev";

  const fetchData = useCallback(async () => {
    setLoading(true);

    siteService.list()
      .then((res) => setSites(res.data.data || []))
      .catch(() => toast.error("Failed to load sites"));

    if (canFetchHostings) {
      hostingService.list()
        .then((res) => setHostings(res.data.data || []))
        .catch(() => {
          // Hosting filter just won't have entries — non-blocking.
        });
    } else {
      setHostings([]);
    }

    setLoading(false);
  }, [canFetchHostings]);

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


  const handleDelete = async () => {
    if (!siteToDelete) return;
    setDeleting(true);
    try {
      await siteService.delete(siteToDelete.id);
      toast.success(`Site "${siteToDelete.name}" deleted successfully`);
      setDeleteDialogOpen(false);
      setSiteToDelete(null);
      fetchData();
    } catch {
      toast.error("Failed to delete site");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<Site>[] = [
    {
      // Merged Name + URL. The name is the click target; the URL is muted
      // metadata directly below for context.
      accessorKey: "name",
      header: "Site",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[360px]">
          <div className="flex items-center gap-2">
            <button
              className="font-medium text-primary hover:text-primary/80 truncate text-left transition-colors"
              onClick={() => router.push(`/sites/${row.original.id}`)}
            >
              {row.getValue("name")}
            </button>
            {row.original.is_beta_tester && (
              <span className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full shrink-0">BETA</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{row.original.url}</div>
        </div>
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
      cell: ({ row }) => {
        const active = !!row.getValue("woo_active");
        if (!active) {
          return <Badge variant="outline" className="text-muted-foreground">Not active</Badge>;
        }
        // WooCommerce brand purple (#7f54b3) for active state.
        return (
          <Badge
            className="border-transparent text-white hover:opacity-90"
            style={{ backgroundColor: "#7f54b3" }}
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white/90" />
            WooCommerce
          </Badge>
        );
      },
    },
    {
      accessorKey: "last_ping_at",
      header: "Last Ping",
      cell: ({ row }) => {
        const val = row.getValue("last_ping_at") as string | null;
        const tone = lastPingTone(val);
        const exact = val ? format(new Date(val), "MMM d, yyyy · HH:mm") : "Never pinged";
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className={cn("inline-flex items-center gap-1.5 text-sm cursor-default", tone.textClass)}>
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", tone.dotClass)} />
                  {tone.label}
                </span>
              }
            />
            <TooltipContent>{exact}</TooltipContent>
          </Tooltip>
        );
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const isOnline = ["connected", "online"].includes(row.original.status);
        return (
          <div className="flex items-center justify-end gap-1">
            {isOnline && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Open in WP Admin"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const res = await siteService.autologin(row.original.id);
                          const redirectUrl = res.data.data.redirect_url;
                          if (redirectUrl) {
                            window.open(redirectUrl, "_blank");
                          } else {
                            toast.error("No redirect URL returned");
                          }
                        } catch {
                          toast.error("Failed to open WP Admin");
                        }
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
                <TooltipContent>Open in WP Admin</TooltipContent>
              </Tooltip>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    setSiteToDelete(row.original);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
    <TooltipProvider delay={120}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sites</h1>
          <p className="text-muted-foreground">Manage your WordPress sites</p>
        </div>
        {canCreateSite && (
          <Button onClick={() => {
            setFormData({ name: "", url: "", hosting_id: "", description: "", tags: "", user_ids: [] });
            setDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Site
          </Button>
        )}
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
        {hostings.length > 0 && (
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
        )}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{siteToDelete?.name}&rdquo;? This action can be undone by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* API Key Dialog */}
      <ApiKeyDialog
        open={apiKeyDialogOpen}
        onOpenChange={setApiKeyDialogOpen}
        apiKey={newApiKey}
      />
    </div>
    </TooltipProvider>
  );
}
