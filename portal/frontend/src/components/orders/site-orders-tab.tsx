"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrdersTable } from "./orders-table";
import { ordersService } from "@/lib/services/orders";
import type {
  OrderFilterOptions,
  OrderListMeta,
  OrderSiteStats,
  OrderSummary,
} from "@/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const DATE_RANGES = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d",  label: "Last 7 days",   hours: 24 * 7 },
  { value: "30d", label: "Last 30 days",  hours: 24 * 30 },
  { value: "all", label: "All cached",    hours: null as number | null },
];

interface Props {
  siteId: number;
  siteUrl?: string | null;
}

export function SiteOrdersTab({ siteId, siteUrl }: Props) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [meta, setMeta] = useState<OrderListMeta | null>(null);
  const [stats, setStats] = useState<OrderSiteStats | null>(null);
  const [filterOpts, setFilterOpts] = useState<OrderFilterOptions | null>(null);
  const [loading, setLoading] = useState(true);

  const [status, setStatus]   = useState("all");
  const [payment, setPayment] = useState("all");
  const [range, setRange]     = useState("7d");
  const [page, setPage]       = useState(1);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    ordersService.filterOptions().then((r) => setFilterOpts(r.data.data));
  }, []);

  const buildParams = useCallback(() => {
    const params: Record<string, string | number> = { page, per_page: 20 };
    if (status !== "all")  params.status  = status;
    if (payment !== "all") params.payment = payment;
    const rangeMeta = DATE_RANGES.find((r) => r.value === range);
    if (rangeMeta?.hours) {
      params.from = new Date(Date.now() - rangeMeta.hours * 3_600_000).toISOString();
    }
    return params;
  }, [status, payment, range, page]);

  // Re-fetch the orders + stats for this site. Returns a cancel handle so
  // the effect can abort in-flight requests on unmount or filter change.
  const fetchOrders = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    ordersService.siteList(siteId, buildParams())
      .then((r) => {
        if (cancelled) return;
        setOrders(r.data.data);
        setMeta(r.data.meta);
        setStats(r.data.stats);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId, buildParams]);

  useEffect(() => fetchOrders(), [fetchOrders]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await ordersService.syncSite(siteId);
      toast.success("Sync complete. Orders refreshed.");
      fetchOrders();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message ?? "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const wpAdminOrdersUrl = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/wp-admin/edit.php?post_type=shop_order`
    : null;

  const lastOrderLabel = stats?.last_order_at
    ? formatDistanceToNow(new Date(stats.last_order_at), { addSuffix: true })
    : "—";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Orders</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            title="Force the WP agent to push the latest orders now"
            className="w-full sm:w-auto"
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
          {wpAdminOrdersUrl && (
            <Button
              size="sm"
              variant="outline"
              className="w-full sm:w-auto"
              render={<a href={wpAdminOrdersUrl} target="_blank" rel="noopener noreferrer" />}
            >
              Open WooCommerce Orders <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Orders today"   value={stats?.orders_today ?? "—"} />
        <StatCard label="Processing now" value={stats?.processing_now ?? "—"} />
        <StatCard label="Last order"     value={lastOrderLabel} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={status} onValueChange={(v) => { setStatus(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {filterOpts?.statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={payment} onValueChange={(v) => { setPayment(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            {filterOpts?.payment_methods.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={range} onValueChange={(v) => { setRange(v ?? "7d"); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DATE_RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <OrdersTable orders={orders} loading={loading} hideSite />

      {meta && meta.last_page > 1 && (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            Showing {orders.length} of {meta.total} orders
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={meta.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
            <span>Page {meta.page} / {meta.last_page}</span>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.last_page}
                    onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
