"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { deploymentsService } from "@/lib/services/deployments";
import { DeploymentJob } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  queued: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  running: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  completed: "bg-green-100 text-green-800 hover:bg-green-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
  cancelled: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
};

export default function DeploymentsPage() {
  const router = useRouter();
  const [deployments, setDeployments] = useState<DeploymentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await deploymentsService.list(page);
      setDeployments(res.data.data || []);
      const pagination = res.data.meta?.pagination;
      if (pagination) {
        setLastPage(pagination.last_page);
      }
    } catch {
      toast.error("Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  const columns: ColumnDef<DeploymentJob>[] = [
    {
      accessorKey: "plugin",
      header: "Plugin",
      cell: ({ row }) => {
        const pv = row.original.plugin_version;
        return (
          <span className="font-medium">
            {pv?.plugin?.name || "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => {
        const pv = row.original.plugin_version;
        return pv ? (
          <Badge variant="outline">{pv.version}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant="secondary"
            className={statusColors[status] || "bg-gray-100 text-gray-800"}
          >
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "progress",
      header: "Progress",
      cell: ({ row }) => {
        const { success_count, total_sites } = row.original;
        return (
          <span className="text-sm">
            {success_count}/{total_sites}
          </span>
        );
      },
    },
    {
      accessorKey: "initiator",
      header: "Initiated By",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.initiator?.name || "—"}
        </span>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Created",
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.created_at), "MMM d, yyyy HH:mm")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => router.push(`/deployments/${row.original.id}`)}
        >
          View
        </button>
      ),
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Deployments</h1>
        <p className="text-muted-foreground">
          Track plugin deployments across your sites
        </p>
      </div>

      <DataTable columns={columns} data={deployments} pageSize={20} />

      {/* Server-side pagination controls */}
      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {lastPage}
          </span>
          <button
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
