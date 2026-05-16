import { Clock, LogOut, ShieldCheck, TrendingDown, Trophy } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

function StatPill({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <span className="ml-2 text-base font-semibold text-slate-900">
            Persist
          </span>
          <span className="mx-4 text-slate-200" aria-hidden="true">
            |
          </span>
          <span className="text-sm text-slate-500">
            Autonomous Prior Authorization Agent
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-500" aria-hidden />
            <span className="text-xs font-medium text-green-500">HIPAA</span>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 animate-pulse"
              aria-hidden
            />
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("persist_auth");
              sessionStorage.removeItem("persist_user");
              window.location.reload();
            }}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden />
          </button>
          <StatPill icon={TrendingDown}>39 req/week</StatPill>
          <StatPill icon={Clock}>13hrs saved</StatPill>
          <StatPill icon={Trophy}>81.7% appeals won</StatPill>
        </div>
      </div>
    </header>
  );
}
