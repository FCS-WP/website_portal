"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
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
import { Plus, MoreHorizontal, Pencil, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
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

const PER_PAGE_OPTIONS = [25, 50, 100];

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
  // Show the page skeleton only on the very first load — paging / filtering
  // refetches keep the table visible and fade in a subtle overlay instead.
  const [initialLoaded, setInitialLoaded] = useState(false);
  const showLoader = useDelayedLoading(loading && !initialLoaded);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Filter / pagination state. Search is held separately from the value
  // we actually ship to the server — the latter is updated through a
  // 300ms debounce so we don't fire a request on every keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterHosting, setFilterHosting] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [siteToEdit, setSiteToEdit] = useState<Site | null>(null);
  const [editForm, setEditForm] = useState({ name: "", url: "" });
  const [savingEdit, setSavingEdit] = useState(false);

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
  // filter is hidden for them too, so an empty array is fine.
  const userRole = useAuthStore((s) => s.user?.role);
  const canFetchHostings = userRole === "admin";
  // Site creation is admin+dev per route middleware; MKT can't create sites,
  // so hide the Add button for them.
  const canCreateSite = userRole === "admin" || userRole === "dev";
  const canEditSite = userRole === "admin" || userRole === "dev";

  // Debounce search input -> committed `search`. 300ms feels responsive
  // without flooding the API while the user is typing.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1); // any new query resets to page 1
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const fetchSites = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        per_page: perPage,
      };
      if (search) params.search = search;
      if (filterStatus !== "all") params.status = filterStatus;
      if (filterHosting !== "all") params.hosting_id = filterHosting;

      const res = await siteService.list(params);
      setSites(res.data.data || []);
      const pagination = res.data.meta?.pagination;
      if (pagination) {
        setLastPage(pagination.last_page);
        setTotal(pagination.total);
      } else {
        setLastPage(1);
        setTotal((res.data.data || []).length);
      }
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to load sites";
      toast.error(message);
      console.error("sites list failed:", err);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [page, perPage, search, filterStatus, filterHosting]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    if (!canFetchHostings) {
      return;
    }
    hostingService.list()
      .then((res) => setHostings(res.data.data || []))
      .catch(() => {
        // Hosting filter just won't have entries — non-blocking.
      });
  }, [canFetchHostings]);

  // Changing a filter / per-page resets to page 1 so we don't end up
  // requesting a page that's now past the new last_page.
  const onStatusChange = (val: string | null) => {
    setFilterStatus(val ?? "all");
    setPage(1);
  };
  const onHostingChange = (val: string | null) => {
    setFilterHosting(val ?? "all");
    setPage(1);
  };
  const onPerPageChange = (v: number) => {
    setPerPage(v);
    setPage(1);
  };

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

      fetchSites();
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to create site";
      toast.error(message);
      console.error("site create failed:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (site: Site) => {
    setSiteToEdit(site);
    setEditForm({ name: site.name, url: site.url });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!siteToEdit) return;
    const name = editForm.name.trim();
    const url = editForm.url.trim();
    if (!name || !url) {
      toast.error("Name and URL are required");
      return;
    }
    setSavingEdit(true);
    try {
      const payload: Record<string, unknown> = {};
      if (name !== siteToEdit.name) payload.name = name;
      if (url !== siteToEdit.url) payload.url = url;
      if (Object.keys(payload).length === 0) {
        setEditDialogOpen(false);
        return;
      }
      await siteService.update(siteToEdit.id, payload);
      toast.success("Site updated");
      setEditDialogOpen(false);
      setSiteToEdit(null);
      fetchSites();
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to update site";
      toast.error(message);
      console.error("site update failed:", err);
    } finally {
      setSavingEdit(false);
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
      fetchSites();
    } catch (err) {
      const message =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.response?.data?.message ?? "Failed to delete site";
      toast.error(message);
      console.error("site delete failed:", err);
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
                        } catch (err) {
                          const message =
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (err as any)?.response?.data?.message ?? "Failed to open WP Admin";
                          toast.error(message);
                          console.error("autologin failed:", err);
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
                {canEditSite && (
                  <DropdownMenuItem onClick={() => openEditDialog(row.original)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
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

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <TooltipProvider delay={120}>
    <div className="page-content space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          placeholder="Search by name or URL..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select value={filterStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-40">
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
          <Select value={filterHosting} onValueChange={onHostingChange}>
            <SelectTrigger className="w-full sm:w-40">
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

      <DataTable
        columns={columns}
        data={sites}
        loading={loading}
        serverPagination={{
          currentPage: page,
          perPage,
          total,
          lastPage,
          onPageChange: setPage,
          onPerPageChange: onPerPageChange,
          perPageOptions: PER_PAGE_OPTIONS,
        }}
      />

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

      {/* Edit Site Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setSiteToEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>
              Update the site name or URL if it was entered incorrectly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-site-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-site-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-site-url">
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-site-url"
                type="url"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Changing the URL only updates the portal record. You must also
                update <strong>WP Admin → Settings → General</strong> on the
                WordPress site so its <em>WordPress Address</em> and{" "}
                <em>Site Address</em> match — otherwise the agent will keep
                pinging from the old URL.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={savingEdit || !editForm.name.trim() || !editForm.url.trim()}
            >
              {savingEdit ? "Saving..." : "Save"}
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
