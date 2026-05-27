import { Skeleton } from "@/components/ui/skeleton";

interface PageLoaderProps {
  rows?: number;
  variant?: "table" | "cards" | "detail";
}

export function PageLoader({ rows = 8, variant = "table" }: PageLoaderProps) {
  if (variant === "cards") {
    return (
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>

        {/* 4 metric cards matching the real layout */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>

        {/* Main content block */}
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className="space-y-6">
        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-56" />
        </div>

        {/* 4 stat cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-14" />
            </div>
          ))}
        </div>

        {/* Two detail blocks */}
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // table variant — matches: header + search/filter bar + table rows
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-xl border overflow-hidden">
        {/* Table header row */}
        <div className="flex items-center gap-4 border-b bg-muted/40 px-4 h-11">
          {[160, 120, 90, 100, 110, 80].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: w }} />
          ))}
        </div>
        {/* Table body rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b last:border-0 px-4 py-3"
          >
            {[160, 120, 90, 100, 110, 80].map((w, j) => (
              <Skeleton key={j} className="h-4" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
