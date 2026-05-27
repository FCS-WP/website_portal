"use client";

import { useEffect, useState, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
import { useDelayedLoading } from "@/hooks/use-delayed-loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deploymentsService } from "@/lib/services/deployments";
import { DeploymentJob } from "@/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarClock, Pencil, X } from "lucide-react";

const jobTypeConfig: Record<string, { label: string; className: string }> = {
  deploy: { label: "Deploy", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  wporg_install: { label: "Install", className: "bg-green-100 text-green-800 hover:bg-green-100" },
  wporg_update: { label: "Update", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  wporg_uninstall: { label: "Uninstall", className: "bg-red-100 text-red-800 hover:bg-red-100" },
  rollback: { label: "Rollback", className: "bg-purple-100 text-purple-800 hover:bg-purple-100" },
};

export default function ScheduledDeploymentsPage() {
  const [deployments, setDeployments] = useState<DeploymentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<DeploymentJob | null>(null);
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Cancel dialog state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellingJob, setCancellingJob] = useState<DeploymentJob | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const fetchScheduled = useCallback(async () => {
    try {
      const res = await deploymentsService.scheduled();
      setDeployments(res.data.data || []);
    } catch {
      toast.error("Failed to load scheduled deployments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScheduled();
  }, [fetchScheduled]);

  const handleEditOpen = (job: DeploymentJob) => {
    setEditingJob(job);
    // Convert ISO to datetime-local format
    if (job.scheduled_at) {
      const dt = new Date(job.scheduled_at);
      setEditScheduledAt(dt.toISOString().slice(0, 16));
    }
    setEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingJob || !editScheduledAt) return;
    setEditSubmitting(true);
    try {
      await deploymentsService.updateSchedule(
        editingJob.id,
        new Date(editScheduledAt).toISOString()
      );
      toast.success("Schedule updated");
      setEditOpen(false);
      setEditingJob(null);
      fetchScheduled();
    } catch {
      toast.error("Failed to update schedule");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleCancelOpen = (job: DeploymentJob) => {
    setCancellingJob(job);
    setCancelOpen(true);
  };

  const handleCancelConfirm = async () => {
    if (!cancellingJob) return;
    setCancelSubmitting(true);
    try {
      await deploymentsService.cancelSchedule(cancellingJob.id);
      toast.success("Scheduled deployment cancelled");
      setCancelOpen(false);
      setCancellingJob(null);
      fetchScheduled();
    } catch {
      toast.error("Failed to cancel scheduled deployment");
    } finally {
      setCancelSubmitting(false);
    }
  };

  const minDatetime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

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
      accessorKey: "total_sites",
      header: "Sites",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.total_sites}</span>
      ),
    },
    {
      accessorKey: "scheduled_at",
      header: "Scheduled For",
      cell: ({ row }) => {
        const scheduledAt = row.original.scheduled_at;
        if (!scheduledAt) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 text-purple-600" />
            <span className="text-sm font-medium">
              {format(new Date(scheduledAt), "MMM d, yyyy HH:mm")}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "initiator",
      header: "Created By",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.initiator?.name || "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleEditOpen(row.original)}
            className="h-8 w-8 p-0"
            title="Edit schedule"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCancelOpen(row.original)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            title="Cancel schedule"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (showLoader) {
    return <PageLoader />;
  }

  return (
    <div className="page-content space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scheduled Deployments</h1>
        <p className="text-muted-foreground">
          Upcoming deployments that are waiting to run at their scheduled time.
        </p>
      </div>

      {deployments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarClock className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No scheduled deployments</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule a deployment from the plugin detail page to see it here.
          </p>
        </div>
      ) : (
        <DataTable columns={columns} data={deployments} pageSize={20} />
      )}

      {/* Edit Schedule Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Schedule</DialogTitle>
            <DialogDescription>
              Change the scheduled time for this deployment.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="datetime-local"
              value={editScheduledAt}
              min={minDatetime}
              onChange={(e) => setEditScheduledAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Timezone: Asia/Ho_Chi_Minh
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editSubmitting || !editScheduledAt}
            >
              {editSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel scheduled deployment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently cancel the scheduled deployment
              {(cancellingJob?.plugin_version?.plugin?.name || cancellingJob?.plugin_name) && (
                <> of <strong>{cancellingJob.plugin_version?.plugin?.name || cancellingJob.plugin_name}</strong></>
              )}
              {(cancellingJob?.plugin_version?.version || cancellingJob?.target_version) && (
                <> v{cancellingJob.plugin_version?.version || cancellingJob.target_version}</>
              )}
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelSubmitting ? "Cancelling..." : "Yes, cancel it"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
