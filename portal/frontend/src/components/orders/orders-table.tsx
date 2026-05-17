"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderDetailPanel } from "./order-detail-panel";
import type { OrderSummary } from "@/types";
import { format } from "date-fns";

interface Props {
  orders: OrderSummary[];
  loading?: boolean;
  /** When true, omit the Site column (used in per-site tab). */
  hideSite?: boolean;
  /** Order ID to expand by default (used by search results). */
  initiallyExpandedId?: number | null;
}

/**
 * Reused by the Global Orders page and the per-site Orders tab. Click a row
 * to expand the inline detail panel; clicking again collapses it.
 */
export function OrdersTable({ orders, loading, hideSite = false, initiallyExpandedId = null }: Props) {
  const [expanded, setExpanded] = useState<number | null>(initiallyExpandedId);

  const toggle = (id: number) => setExpanded((cur) => (cur === id ? null : id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading orders…
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded border bg-muted/30 py-12 text-center text-sm text-muted-foreground">
        No orders match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[110px]">Order</TableHead>
            {!hideSite && <TableHead>Site</TableHead>}
            <TableHead>Customer</TableHead>
            <TableHead className="w-[150px]">Date</TableHead>
            <TableHead className="w-[140px]">Payment</TableHead>
            <TableHead className="w-[110px] text-right">Total</TableHead>
            <TableHead className="w-[130px]">Status</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const isOpen = expanded === o.id;
            return (
              <Fragment key={o.id}>
                <TableRow
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => toggle(o.id)}
                >
                  <TableCell className="font-mono">#{o.woo_order_id}</TableCell>
                  {!hideSite && (
                    <TableCell>
                      {o.site_id ? (
                        <Link
                          href={`/sites/${o.site_id}`}
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {o.site_name ?? `Site #${o.site_id}`}
                        </Link>
                      ) : (
                        o.site_name
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{o.customer_name ?? "—"}</span>
                      {o.customer_email && (
                        <span className="text-xs text-muted-foreground">{o.customer_email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.order_date ? format(new Date(o.order_date), "MMM d, HH:mm") : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{o.payment_method_title ?? o.payment_method ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {o.currency} {o.total}
                  </TableCell>
                  <TableCell><OrderStatusBadge status={o.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {o.wp_admin_edit_url && (
                        <a
                          href={o.wp_admin_edit_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in WP Admin"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={hideSite ? 7 : 8} className="p-3">
                      <OrderDetailPanel order={o} hideSite={hideSite} />
                      <div className="mt-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setExpanded(null)}>
                          Close
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
