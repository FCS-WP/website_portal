import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Status → Tailwind colors per PRD §2.4. Falls back to a neutral pill for any
// status not in the table (refunds-partial, custom statuses, etc.).
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  "pending-payment": "bg-gray-100 text-gray-700 border-gray-200",
  processing: "bg-blue-100 text-blue-700 border-blue-200",
  "on-hold": "bg-amber-100 text-amber-800 border-amber-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  refunded: "bg-purple-100 text-purple-700 border-purple-200",
  failed: "bg-red-200 text-red-800 border-red-300",
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
