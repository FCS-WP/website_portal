"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { OrderStatusBadge } from "./order-status-badge";
import { ordersService } from "@/lib/services/orders";
import type { OrderSearchFallback, OrderSummary } from "@/types";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-fill the site dropdown when launched from a site context. */
  defaultSiteId?: number | null;
}

interface SearchState {
  status: "idle" | "loading" | "found" | "not_found" | "error";
  orders?: OrderSummary[];
  fallbackUrls?: OrderSearchFallback[];
  errorMessage?: string;
}

export function OrderSearchModal({ open, onOpenChange, defaultSiteId = null }: Props) {
  const [orderId, setOrderId] = useState("");
  const [siteId, setSiteId] = useState<string>(defaultSiteId ? String(defaultSiteId) : "all");
  const [siteOptions, setSiteOptions] = useState<{ id: number; name: string }[]>([]);
  const [state, setState] = useState<SearchState>({ status: "idle" });

  // Reset on open. Fetch the site dropdown lazily.
  useEffect(() => {
    if (open) {
      setOrderId("");
      setState({ status: "idle" });
      if (siteOptions.length === 0) {
        ordersService.filterOptions().then((r) => setSiteOptions(r.data.data.sites));
      }
    }
  }, [open, siteOptions.length]);

  const submit = async () => {
    const trimmed = orderId.replace(/^#/, "").trim();
    if (!trimmed) return;

    setState({ status: "loading" });
    try {
      const resp = await ordersService.search(trimmed, siteId === "all" ? undefined : Number(siteId));
      const data = resp.data;
      if (data.found) {
        setState({ status: "found", orders: data.orders });
      } else {
        setState({
          status: "not_found",
          fallbackUrls: data.wp_admin_search_urls,
          errorMessage: data.message,
        });
      }
    } catch {
      setState({ status: "error", errorMessage: "Search failed. Try again." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Find order
          </DialogTitle>
          <DialogDescription>
            Look up an order by ID across cached orders. Older orders fall back to wp-admin search.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="orderId">Order ID</Label>
            <Input
              id="orderId"
              autoFocus
              placeholder="#10482"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="siteId">Site (optional)</Label>
            <Select value={siteId} onValueChange={(v) => setSiteId(v ?? "all")}>
              <SelectTrigger><SelectValue placeholder="All sites" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {siteOptions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!orderId.trim() || state.status === "loading"}>
              {state.status === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Search
            </Button>
          </div>
        </div>

        {/* Result panes */}
        {state.status === "found" && state.orders && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-green-700 dark:text-green-400">
              Found {state.orders.length} match{state.orders.length === 1 ? "" : "es"}
            </div>
            <ul className="divide-y rounded border">
              {state.orders.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">#{o.woo_order_id}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {o.site_name} · {o.order_date ? format(new Date(o.order_date), "MMM d, yyyy · HH:mm") : "—"}
                    </div>
                    <div className="text-xs">
                      {o.customer_name ?? "—"} · {o.payment_method_title ?? o.payment_method ?? "—"} · {o.currency} {o.total}
                    </div>
                  </div>
                  {o.wp_admin_edit_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      render={<a href={o.wp_admin_edit_url} target="_blank" rel="noopener noreferrer" />}
                    >
                      WP Admin <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.status === "not_found" && (
          <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" /> {state.errorMessage}
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300/90">
              Orders are cached up to 200 most recent per site. Search directly in wp-admin:
            </p>
            <ul className="space-y-1">
              {state.fallbackUrls?.map((s) => (
                <li key={s.site_id}>
                  <a
                    className="text-amber-900 underline underline-offset-2 dark:text-amber-300"
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.site_name} <ExternalLink className="ml-1 inline-block h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {state.errorMessage}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
