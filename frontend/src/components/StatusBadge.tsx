import { Badge } from "@/components/ui/badge";
import type { PAStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  PAStatus,
  { label: string; className: string }
> = {
  approved: {
    label: "Approved",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  denied: {
    label: "Denied",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  submitted: {
    label: "Submitted",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  appeal_drafted: {
    label: "Appeal Ready",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  appeal_submitted: {
    label: "Appeal Filed",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  appeal_won: {
    label: "Appeal Won",
    className: "bg-green-50 text-green-700 border-green-200",
  },
  expired: {
    label: "Expired",
    className: "bg-slate-100 text-slate-500 border-slate-200",
  },
};

interface StatusBadgeProps {
  status: PAStatus;
  size?: "sm" | "default";
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border font-medium",
        size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
        config.className
      )}
    >
      {config.label}
    </Badge>
  );
}
