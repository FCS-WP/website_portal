"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import { Button } from "@/components/ui/button";
import { deploymentsService } from "@/lib/services/deployments";
import { DeploymentJob } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { Eye } from "lucide-react";

const statusColors: Record<string, string> = {
  queued: "bg-gray-100 text-gray-800 hover:bg-gray-100",
  running: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  completed: "bg-green-100 text-green-800 hover:bg-green-100",
  failed: "bg-red-100 text-red-800 hover:bg-red-100",
  cancelled: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  scheduled: "bg-purple-100 text-purple-800 hover:bg-purple-100",
};

const jobTypeConfig: Record<string, { label: string; className: string }> = {
  deploy: { label: "Deploy", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  wporg_install: { label: "Install", className: "bg-green-100 text-green-800 hover:bg-green-100" },
  wporg_update: { label: "Update", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  wporg_uninstall: { label: "Uninstall", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  rollback: { label: "Rollback", className: "bg-purple-100 text-purple-800 hover:bg-purple-100" },
};

export default function DeploymentsPage() {
  const router = useRouter();
  const [deployments, setDeployments] = useState<DeploymentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);
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
        const name = pv?.plugin?.name || row.original.plugin_name;
        return (
          <span className="font-medium">
            {name || "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "job_type",
      header: "Type",
      cell: ({ row }) => {
        const type = row.original.job_type || "deploy";
        const config = jobTypeConfig[type] || jobTypeConfig.deploy;
        return (
          <Badge variant="secondary" className={config.className}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "version",
      header: "Version",
      cell: ({ row }) => {
        const pv = row.original.plugin_version;
        const version = pv?.version || row.original.target_version;
        return version ? (
          <Badge variant="outline">{version}</Badge>
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
        const scheduledAt = row.original.scheduled_at;
        return (
          <div className="flex flex-col gap-0.5">
            <Badge
              variant="secondary"
              className={statusColors[status] || "bg-gray-100 text-gray-800"}
            >
              {status}
            </Badge>
            {status === "scheduled" && scheduledAt && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(scheduledAt), "MMM d, HH:mm")}
              </span>
            )}
          </div>
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
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => router.push(`/deployments/${row.original.id}`)}
          title="View details"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <div className="page-content space-y-6">
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
