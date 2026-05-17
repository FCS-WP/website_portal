"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "./order-status-badge";
import { ordersService } from "@/lib/services/orders";
import type { Order, OrderSummary } from "@/types";
import { format } from "date-fns";

interface Props {
  order: OrderSummary;
  /** When true, hides the site row (used in per-site context). */
  hideSite?: boolean;
}

/**
 * Inline accordion-style detail panel (PRD §2.5). Loads the full order
 * (line_items, billing, latest note) on first expand and caches it locally.
 */
export function OrderDetailPanel({ order, hideSite = false }: Props) {
  const [full, setFull] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ordersService
      .show(order.id)
      .then((r) => { if (!cancelled) setFull(r.data.data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [order.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading order detail…
      </div>
    );
  }

  if (!full) {
    return <div className="py-6 text-sm text-muted-foreground">Could not load order detail.</div>;
  }

  return (
    <div className="grid gap-6 rounded-md bg-muted/40 p-4 md:grid-cols-2">
      {/* Left: order info */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Order information</div>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Order ID</dt>
          <dd className="font-mono">#{full.woo_order_id}</dd>

          <dt className="text-muted-foreground">Date</dt>
          <dd>{full.order_date ? format(new Date(full.order_date), "MMM d, yyyy · HH:mm") : "—"}</dd>

          {!hideSite && (
            <>
              <dt className="text-muted-foreground">Site</dt>
              <dd>{full.site_name ?? "—"}</dd>
            </>
          )}

          <dt className="text-muted-foreground">Status</dt>
          <dd><OrderStatusBadge status={full.status} /></dd>

          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-medium">{full.currency} {full.total}</dd>

          <dt className="text-muted-foreground">Payment</dt>
          <dd>{full.payment_method_title ?? full.payment_method ?? "—"}</dd>
        </dl>

        {full.latest_note && (
          <div className="rounded border bg-background p-3 text-sm">
            <div className="mb-1 text-xs uppercase text-muted-foreground">Latest note</div>
            <div className="italic">&ldquo;{full.latest_note}&rdquo;</div>
          </div>
        )}
      </div>

      {/* Right: customer + items */}
      <div className="space-y-3">
        <div className="text-sm font-semibold">Customer</div>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{full.customer_name ?? "—"}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="break-all">{full.customer_email ?? "—"}</dd>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{full.customer_phone ?? "—"}</dd>
          {full.billing_address && (
            <>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="whitespace-pre-line">{full.billing_address}</dd>
            </>
          )}
        </dl>

        <div className="pt-2">
          <div className="mb-2 text-sm font-semibold">
            Items ({full.items_count})
          </div>
          {full.line_items && full.line_items.length > 0 ? (
            <ul className="divide-y rounded border bg-background text-sm">
              {full.line_items.slice(0, 10).map((it, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-1.5">
                  <span className="truncate pr-2">{it.name} × {it.qty}</span>
                  <span className="tabular-nums">{it.total}</span>
                </li>
              ))}
              {full.line_items.length > 10 && (
                <li className="px-3 py-1.5 text-xs text-muted-foreground">
                  +{full.line_items.length - 10} more
                </li>
              )}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No line items.</div>
          )}
        </div>

        {full.wp_admin_edit_url && (
          <div className="pt-3">
            <Button
              size="sm"
              variant="default"
              render={<a href={full.wp_admin_edit_url} target="_blank" rel="noopener noreferrer" />}
            >
              Open in WP Admin <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
