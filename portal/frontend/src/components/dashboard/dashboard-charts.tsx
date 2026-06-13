"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  SitesOnlinePoint,
  OrdersThisWeek,
  OrdersDayPoint,
} from "@/lib/services/dashboard";

const BRAND = "var(--color-primary)";

interface DashboardChartsProps {
  totalSites: number;
  sitesTrend: SitesOnlinePoint[] | undefined;
  orders: OrdersThisWeek | undefined;
  loading: boolean;
}

export function DashboardCharts({
  totalSites,
  sitesTrend,
  orders,
  loading,
}: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SitesOnlineCard totalSites={totalSites} data={sitesTrend} loading={loading} />
      <OrdersWeekCard orders={orders} loading={loading} />
    </div>
  );
}

function SitesOnlineCard({
  totalSites,
  data,
  loading,
}: {
  totalSites: number;
  data: SitesOnlinePoint[] | undefined;
  loading: boolean;
}) {
  const latest = data && data.length > 0 ? data[data.length - 1].online : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sites online
        </CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Last 14 days
        </span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold">{latest}</span>
              <span className="text-sm text-muted-foreground">/ {totalSites}</span>
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="sitesOnlineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.4} />
                <XAxis dataKey="label" hide />
                <YAxis hide domain={[0, totalSites || "auto"]} />
                <Tooltip content={<ChartTooltip unit="online" />} cursor={{ stroke: BRAND, strokeOpacity: 0.3 }} />
                <Area
                  type="monotone"
                  dataKey="online"
                  stroke={BRAND}
                  strokeWidth={2}
                  fill="url(#sitesOnlineFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersWeekCard({
  orders,
  loading,
}: {
  orders: OrdersThisWeek | undefined;
  loading: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const days = orders?.days ?? [];
  const selected = days.find((d) => d.date === selectedDate) ?? null;

  const handleBarClick = (day: OrdersDayPoint) => {
    setSelectedDate((prev) => (prev === day.date ? null : day.date));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Orders this week
        </CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Per day
        </span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[180px] w-full" />
        ) : (
          <>
            <div className="mb-3 text-3xl font-bold">
              {(orders?.total ?? 0).toLocaleString()}
            </div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={days} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.4} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis hide />
                <Tooltip content={<ChartTooltip unit="orders" />} cursor={{ fill: BRAND, fillOpacity: 0.1 }} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  className="cursor-pointer"
                  onClick={(_, index) => {
                    const day = days[index];
                    if (day && day.count > 0) handleBarClick(day);
                  }}
                >
                  {days.map((d) => (
                    <Cell
                      key={d.date}
                      fill={BRAND}
                      fillOpacity={!selectedDate || selectedDate === d.date ? 1 : 0.35}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <OrdersBreakdown selected={selected} hasData={(orders?.total ?? 0) > 0} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function OrdersBreakdown({
  selected,
  hasData,
}: {
  selected: OrdersDayPoint | null;
  hasData: boolean;
}) {
  if (!selected) {
    return (
      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        {hasData
          ? "Click a bar to see which sites the orders came from."
          : "No orders yet this week."}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-xs font-medium">
        {selected.label} · {selected.count} order{selected.count === 1 ? "" : "s"}
      </p>
      <ul className="space-y-1.5">
        {selected.by_site.map((s) => (
          <li key={s.site_id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">{s.site_name}</span>
            <span className="shrink-0 text-muted-foreground">
              {s.count} · {s.revenue.toLocaleString(undefined, { style: "currency", currency: "USD" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TooltipPayload {
  payload: { label: string };
  value: number;
}

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0];
  return (
    <div className="rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md">
      <p className="font-medium">{point.payload.label}</p>
      <p className="text-muted-foreground">
        {point.value} {unit}
      </p>
    </div>
  );
}
