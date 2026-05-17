import { motion } from "framer-motion";
import type { PAStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const variants = {
  approved: "bg-green-50 text-green-700 border border-green-200",
  denied: "bg-red-50 text-red-700 border border-red-200",
  submitted: "bg-amber-50 text-amber-700 border border-amber-200",
  appeal_filed: "bg-blue-50 text-blue-700 border border-blue-200",
  pending: "bg-slate-100 text-slate-600 border border-slate-200",
} as const;

const dotColors: Record<keyof typeof variants, string> = {
  approved: "bg-green-700",
  denied: "bg-red-700",
  submitted: "bg-amber-700",
  appeal_filed: "bg-blue-700",
  pending: "bg-slate-600",
};

const STATUS_CONFIG: Record<
  PAStatus,
  { label: string; variant: keyof typeof variants }
> = {
  approved: { label: "Approved", variant: "approved" },
  denied: { label: "Denied", variant: "denied" },
  submitted: { label: "Submitted", variant: "submitted" },
  pending: { label: "Pending", variant: "pending" },
  appeal_drafted: { label: "Appeal Ready", variant: "appeal_filed" },
  appeal_submitted: { label: "Appeal Filed", variant: "appeal_filed" },
  appeal_won: { label: "Appeal Won", variant: "approved" },
  denied_final: { label: "Denied (Final)", variant: "denied" },
  p2p_requested: { label: "P2P Requested", variant: "appeal_filed" },
  expired: { label: "Expired", variant: "pending" },
};

interface StatusBadgeProps {
  status: PAStatus;
  size?: "sm" | "default";
}

export function StatusBadge({ status, size = "default" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const variantKey = config.variant;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variantKey],
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotColors[variantKey])}
        aria-hidden
      />
      {config.label}
    </motion.span>
  );
}
