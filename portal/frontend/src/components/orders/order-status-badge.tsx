import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Status → Tailwind colors per PRD §2.4. Each entry pairs a light-mode
// "bg-*-100 / text-*-700" pill with a dark-mode "bg-*-500/10 / text-*-300"
// pill so the badge reads against either background. Falls back to a neutral
// pill for any status not in the table.
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30",
  "pending-payment": "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30",
  processing: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
  "on-hold": "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  completed: "bg-green-100 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
  cancelled: "bg-red-100 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30",
  refunded: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/30",
  failed: "bg-red-200 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "pending-payment": "Pending payment",
  processing: "Processing",
  "on-hold": "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Failed",
};

export function OrderStatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700 border-gray-200";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={cn("font-medium", style, className)}>
      {label}
    </Badge>
  );
}
