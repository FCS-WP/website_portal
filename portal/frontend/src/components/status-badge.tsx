import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

// Each status maps to a colored dot (semantic) + a subtle pill background.
// The dot is what reads at a glance; the background is just a soft container.
// Each entry has a light + dark variant so the pill stays readable in both
// modes. Dot stays a saturated 500-step in both modes — it reads against
// either background.
const statusConfig: Record<string, { label: string; dot: string; pill: string }> = {
  pending: {
    label: "Pending",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
  },
  connected: {
    label: "Connected",
    dot: "bg-green-500",
    pill: "bg-green-50 text-green-800 border-green-200 hover:bg-green-50 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30",
  },
  disconnected: {
    label: "Disconnected",
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-800 border-red-200 hover:bg-red-50 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30",
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    dot: "bg-gray-400",
    pill: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30",
  };

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium", config.pill, className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          config.dot,
          status === "connected" && "shadow-[0_0_0_3px_rgba(34,197,94,0.15)]"
        )}
      />
      {config.label}
    </Badge>
  );
}
