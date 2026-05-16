import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";

import type { StepStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AgentStepProps {
  step: number;
  label: string;
  detail?: string;
  status: StepStatus;
  durationMs?: number;
  viability_score?: number;
}

const LABEL_CLASS: Record<StepStatus, string> = {
  idle: "text-slate-400",
  running: "text-slate-900",
  done: "text-slate-700",
  error: "text-red-700",
};

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "idle":
      return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />;
    case "running":
      return (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-500" />
      );
    case "done":
      return (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
      );
    case "error":
      return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />;
  }
}

function viabilityLabel(score: number): { text: string; className: string } {
  const percent = Math.round(score * 100);
  if (score > 0.7) {
    return {
      text: `${percent}% — Highly Viable`,
      className: "text-green-600 font-semibold",
    };
  }
  if (score >= 0.4) {
    return {
      text: `${percent}% — Moderate`,
      className: "text-amber-600 font-semibold",
    };
  }
  return {
    text: `${percent}% — Low Viability`,
    className: "text-red-600 font-semibold",
  };
}

export function AgentStep({
  label,
  detail,
  status,
  durationMs,
  viability_score,
}: AgentStepProps) {
  const viability =
    viability_score !== undefined && status === "done"
      ? viabilityLabel(viability_score)
      : null;

  return (
    <div className="flex flex-row gap-3">
      <StatusIcon status={status} />

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", LABEL_CLASS[status])}>
          {label}
        </p>
        {detail !== undefined && (
          <p className="mt-0.5 text-xs text-slate-500">
            {detail}
            {status === "running" && (
              <span className="animate-pulse text-indigo-400">▊</span>
            )}
          </p>
        )}
        {viability !== null && (
          <p className={cn("mt-0.5 text-xs", viability.className)}>
            {viability.text}
          </p>
        )}
      </div>

      {durationMs !== undefined && status === "done" && (
        <span className="shrink-0 text-xs text-slate-400">{durationMs}ms</span>
      )}
    </div>
  );
}
