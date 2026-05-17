"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrdersTable } from "@/components/orders/orders-table";
import { OrderSearchModal } from "@/components/orders/order-search-modal";
import { ordersService } from "@/lib/services/orders";
import type {
  MostActiveSite,
  OrderFilterOptions,
  OrderListMeta,
  OrderSummary,
} from "@/types";
import { formatDistanceToNow } from "date-fns";

const DATE_RANGES: { value: string; label: string; hours: number | null }[] = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d",  label: "Last 7 days",   hours: 24 * 7 },
  { value: "30d", label: "Last 30 days",  hours: 24 * 30 },
  { value: "all", label: "All cached",    hours: null },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [meta, setMeta] = useState<OrderListMeta | null>(null);
  const [mostActive, setMostActive] = useState<MostActiveSite[]>([]);
  const [filterOpts, setFilterOpts] = useState<OrderFilterOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  // Filters
  const [siteId, setSiteId]   = useState<string>("all");
  const [status, setStatus]   = useState<string>("all");
  const [payment, setPayment] = useState<string>("all");
  const [range, setRange]     = useState<string>("7d");
  const [page, setPage]       = useState(1);

  // Filter-options dropdowns (populated once).
  useEffect(() => {
    ordersService.filterOptions().then((r) => setFilterOpts(r.data.data));
  }, []);

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { page, per_page: 20 };
    if (siteId !== "all")   params.site_id = Number(siteId);
    if (status !== "all")   params.status  = status;
    if (payment !== "all")  params.payment = payment;

    const rangeMeta = DATE_RANGES.find((r) => r.value === range);
    if (rangeMeta?.hours) {
      params.from = new Date(Date.now() - rangeMeta.hours * 3_600_000).toISOString();
    }
    return params;
  }, [siteId, status, payment, range, page]);

  // Fetch on filter/page change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      ordersService.list(buildParams()),
      ordersService.mostActive(5),
    ])
      .then(([list, active]) => {
        if (cancelled) return;
        setOrders(list.data.data);
        setMeta(list.data.meta);
        setMostActive(active.data.data);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [buildParams]);

  const lastSyncedLabel = useMemo(() => {
    if (!meta?.last_synced_at) return null;
    try {
      return formatDistanceToNow(new Date(meta.last_synced_at), { addSuffix: true });
    } catch { return null; }
  }, [meta]);

  const clearFilters = () => {
    setSiteId("all"); setStatus("all"); setPayment("all"); setRange("7d"); setPage(1);
  };

  const hasFilters = siteId !== "all" || status !== "all" || payment !== "all" || range !== "7d";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">
            200 most recent orders across all sites
            {lastSyncedLabel ? ` · Last synced: ${lastSyncedLabel}` : ""}
          </p>
        </div>
        <Button
          onClick={() => setSearchOpen(true)}
          variant="outline"
          size="icon"
          aria-label="Search order"
          title="Search order"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Most-active strip */}
      {mostActive.length > 0 && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground mr-2">Most orders today:</span>
          {mostActive.map((m, i) => (
            <span key={m.site_id}>
              {i > 0 && <span className="mx-2 text-muted-foreground">·</span>}
              <Link href={`/sites/${m.site_id}`} className="font-medium hover:underline">
                {m.site_name ?? `Site #${m.site_id}`}
              </Link>{" "}
              <span className="text-muted-foreground">{m.order_count_today}</span>
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={siteId} onValueChange={(v) => { setSiteId(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All sites" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {filterOpts?.sites.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {filterOpts?.statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={payment} onValueChange={(v) => { setPayment(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All payments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            {filterOpts?.payment_methods.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
        )}
      </div>

      {/* Table */}
      <OrdersTable orders={orders} loading={loading} />

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {orders.length} of {meta.total} orders
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >Previous</Button>
            <span>
              Page {meta.page} / {meta.last_page}
            </span>
            <Button
              variant="outline" size="sm"
              disabled={meta.page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
            >Next</Button>
          </div>
        </div>
      )}

      <OrderSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
