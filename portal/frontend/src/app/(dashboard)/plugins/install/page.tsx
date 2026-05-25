"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Search,
  Download,
  Star,
  AlertTriangle,
  Check,
  Loader2,
  ArrowRight,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { externalPluginService } from "@/lib/services/external-plugins";
import { siteService } from "@/lib/services/sites";
import type { WpOrgSearchResult } from "@/types/external-plugins";
import { toast } from "sonner";

// ─── Helpers ────────────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&hellip;/g, '\u2026')
    .replace(/&laquo;/g, '\u00AB')
    .replace(/&raquo;/g, '\u00BB');
}

function getSafetyStatus(lastUpdated: string | null): {
  color: string;
  label: string;
  dotClass: string;
} {
  if (!lastUpdated)
    return { color: "gray", label: "Unknown", dotClass: "bg-gray-400" };
  const date = new Date(lastUpdated);
  if (isNaN(date.getTime()))
    return { color: "gray", label: "Unknown", dotClass: "bg-gray-400" };
  const days = Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days > 730)
    return { color: "red", label: "Abandoned", dotClass: "bg-red-500" };
  if (days > 180)
    return { color: "amber", label: "Aging", dotClass: "bg-amber-500" };
  return {
    color: "green",
    label: "Actively maintained",
    dotClass: "bg-green-500",
  };
}

function formatInstalls(count: number): string {
  if (count >= 1_000_000) return `${Math.floor(count / 1_000_000)}M+`;
  if (count >= 1_000) return `${Math.floor(count / 1_000)}K+`;
  return `${count}`;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "just now";
  if (diffDays < 1) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? "s" : ""} ago`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SiteOption {
  id: number;
  name: string;
  url: string;
  status: string;
  hosting?: { id: number; name: string } | null;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function InstallPluginPage() {
  const router = useRouter();

  // Search state
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<WpOrgSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Install modal state
  const [installPlugin, setInstallPlugin] = useState<WpOrgSearchResult | null>(null);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [activateAfterInstall, setActivateAfterInstall] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [siteSearch, setSiteSearch] = useState("");

  // ── Debounced search ────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setDebouncedQuery("");
      setResults([]);
      setTotal(0);
      setPages(0);
      setPage(1);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const doSearch = useCallback(
    async (q: string, p: number) => {
      if (!q) return;
      setSearching(true);
      try {
        const res = await externalPluginService.search(q, p);
        setResults(res.data.data || []);
        setTotal(res.data.meta?.results ?? 0);
        setPages(res.data.meta?.pages ?? 0);
        setHasSearched(true);
      } catch {
        toast.error("Failed to search plugins");
      } finally {
        setSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debouncedQuery) {
      doSearch(debouncedQuery, page);
    }
  }, [debouncedQuery, page, doSearch]);

  // ── Install Modal Logic ─────────────────────────────────────────────────

  const openInstallModal = async (plugin: WpOrgSearchResult) => {
    setInstallPlugin(plugin);
    setSelectedSiteIds([]);
    setSiteSearch("");
    setActivateAfterInstall(true);
    setLoadingSites(true);
    try {
      const res = await siteService.list({ status: "connected" });
      setSites(res.data.data || []);
    } catch {
      toast.error("Failed to load sites");
    } finally {
      setLoadingSites(false);
    }
  };

  const closeInstallModal = () => {
    setInstallPlugin(null);
    setSelectedSiteIds([]);
    setSiteSearch("");
  };

  const toggleSite = (id: number) => {
    setSelectedSiteIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedSiteIds(filteredSites.map((s) => s.id));
  const selectNone = () => setSelectedSiteIds([]);

  const filteredSites = sites.filter((s) => {
    if (!siteSearch) return true;
    const q = siteSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q)
    );
  });

  const handleInstall = async () => {
    if (!installPlugin || selectedSiteIds.length === 0) return;
    setInstalling(true);
    try {
      await externalPluginService.install({
        slug: installPlugin.slug,
        version: installPlugin.version,
        site_ids: selectedSiteIds,
        activate: activateAfterInstall,
      });
      toast.success(
        `Installing ${decodeHtmlEntities(installPlugin.name)} on ${selectedSiteIds.length} site${selectedSiteIds.length > 1 ? "s" : ""}`,
        {
          action: {
            label: "View deployments",
            onClick: () => router.push("/deployments"),
          },
        }
      );
      closeInstallModal();
    } catch {
      toast.error("Failed to start installation");
    } finally {
      setInstalling(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Install Plugin</h1>
        <p className="text-muted-foreground">
          Search and deploy free WordPress.org plugins to your sites
        </p>
      </div>

      {/* Search Bar */}
      <InputGroup className="h-10">
        <InputGroupAddon>
          {searching ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="size-4" />
          )}
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search WordPress.org plugins..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 text-base"
        />
      </InputGroup>

      {/* Results count */}
      {hasSearched && !searching && (
        <p className="text-sm text-muted-foreground">
          Showing {results.length} of {total.toLocaleString()} results
        </p>
      )}

      {/* Loading skeleton */}
      {searching && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-8 w-full" />
                <div className="flex gap-3">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-8 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty / initial state */}
      {!searching && !hasSearched && (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-linear-to-b from-muted/40 to-transparent py-24 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-8 ring-primary/5">
            <Download className="size-9 text-primary" />
          </div>
          <p className="text-2xl font-bold tracking-tight">
            60,000+ free plugins
          </p>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs">
            Search the entire WordPress.org plugin directory and deploy to any of your sites in one click
          </p>
          <div className="mt-6 flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />Free forever</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />Instant deploy</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-500" />Multi-site</span>
          </div>
        </div>
      )}

      {/* No results */}
      {!searching && hasSearched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <Search className="mb-4 size-12 text-muted-foreground/50" />
          <p className="text-lg font-medium text-muted-foreground">
            No plugins found for &ldquo;{debouncedQuery}&rdquo;
          </p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Try a different search term
          </p>
        </div>
      )}

      {/* Results grid */}
      {!searching && results.length > 0 && (
        <>
          <TooltipProvider>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {results.map((plugin) => {
                const safety = getSafetyStatus(plugin.last_updated);
                const isAbandoned = safety.color === "red";

                return (
                  <Card key={plugin.slug} className="flex flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3">
                      {/* Title + version */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold leading-snug line-clamp-1">
                            {decodeHtmlEntities(plugin.name)}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            by {decodeHtmlEntities(plugin.author)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          v{plugin.version}
                        </Badge>
                      </div>

                      {/* Description */}
                      <p className="line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                        {decodeHtmlEntities(plugin.short_description)}
                      </p>

                      {/* Stats row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {/* Rating */}
                        <span className="inline-flex items-center gap-1">
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                          {(plugin.rating / 20).toFixed(1)}/5
                          {plugin.num_ratings > 0 && (
                            <span className="text-muted-foreground/60">
                              · {plugin.num_ratings.toLocaleString()} ratings
                            </span>
                          )}
                        </span>

                        {/* Installs */}
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" />
                          {formatInstalls(plugin.active_installs)} active
                          installs
                        </span>

                        {/* Last updated */}
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3" />
                          {plugin.last_updated
                            ? timeAgo(plugin.last_updated)
                            : "Unknown"}
                        </span>
                      </div>

                      {/* Safety + installed count */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <Tooltip>
                          <TooltipTrigger>
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={`inline-block size-2 rounded-full ${safety.dotClass}`}
                              />
                              {safety.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {safety.color === "green" &&
                              "Updated within the last 6 months"}
                            {safety.color === "amber" &&
                              "Last update was 6 months – 2 years ago"}
                            {safety.color === "red" &&
                              "Not updated for over 2 years"}
                            {safety.color === "gray" &&
                              "Update date unknown"}
                          </TooltipContent>
                        </Tooltip>

                        {plugin.already_installed_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Check className="size-3 text-green-500" />
                            Already on: {plugin.already_installed_count} of
                            your sites
                          </span>
                        )}
                      </div>

                      {/* Spacer */}
                      <div className="flex-1" />

                      {/* Action */}
                      {isAbandoned ? (
                        <Tooltip>
                          <TooltipTrigger className="w-full">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled
                            >
                              <AlertTriangle className="mr-1.5 size-3.5" />
                              Install on sites
                              <ArrowRight className="ml-auto size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Plugin is abandoned — not updated for over 2 years
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => openInstallModal(plugin)}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          Install on sites
                          <ArrowRight className="ml-auto size-3.5" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TooltipProvider>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Install Modal ────────────────────────────────────────────────── */}
      <Dialog
        open={!!installPlugin}
        onOpenChange={(v) => {
          if (!v) closeInstallModal();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {installPlugin && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Install {decodeHtmlEntities(installPlugin.name)} v{installPlugin.version}
                </DialogTitle>
                <DialogDescription>
                  by {decodeHtmlEntities(installPlugin.author)} · Rating:{" "}
                  {(installPlugin.rating / 20).toFixed(1)}/5
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Site search */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Select target sites:</p>
                  <Input
                    placeholder="Search sites..."
                    value={siteSearch}
                    onChange={(e) => setSiteSearch(e.target.value)}
                  />
                </div>

                {/* Sites list */}
                {loadingSites ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      Loading sites...
                    </span>
                  </div>
                ) : filteredSites.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No connected sites found.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {selectedSiteIds.length} of {filteredSites.length}{" "}
                        selected
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={selectAll}
                          type="button"
                        >
                          Select all
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={selectNone}
                          type="button"
                        >
                          Select none
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-52 overflow-y-auto rounded-md border p-2 space-y-1">
                      {filteredSites.map((site) => (
                        <label
                          key={site.id}
                          className="flex items-center gap-2 rounded p-1.5 hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedSiteIds.includes(site.id)}
                            onChange={() => toggleSite(site.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {site.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {site.url}
                              {site.hosting && (
                                <> — {site.hosting.name}</>
                              )}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                {/* Activate option */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={activateAfterInstall}
                    onChange={(e) => setActivateAfterInstall(e.target.checked)}
                  />
                  <span className="text-sm">Activate after install</span>
                </label>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeInstallModal}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInstall}
                  disabled={installing || selectedSiteIds.length === 0}
                >
                  {installing ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="mr-1.5 size-3.5" />
                      Install on {selectedSiteIds.length} site
                      {selectedSiteIds.length !== 1 ? "s" : ""}
                      <ArrowRight className="ml-1 size-3.5" />
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
