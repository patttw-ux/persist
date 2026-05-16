import { Clock, LogOut, TrendingDown, Trophy } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

function StatPill({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-600">
      <Icon className={iconClassName ?? "h-3.5 w-3.5 text-slate-500"} />
      {children}
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="fixed top-0 z-50 w-full border-t-2 border-[#4F46E5] border-b border-[#E2E8F0] bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Persist"
            className="h-8 w-8 rounded-lg object-cover shrink-0"
          />
          <span className="font-semibold text-slate-900">Persist</span>
          <span className="h-4 w-px bg-slate-200" aria-hidden />
          <span className="text-sm text-slate-400">
            Autonomous Prior Authorization
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" aria-hidden />
            HIPAA
          </span>
          <StatPill icon={TrendingDown} iconClassName="h-3.5 w-3.5 text-indigo-500">
            39 req/week
          </StatPill>
          <StatPill icon={Clock}>13hrs saved</StatPill>
          <StatPill icon={Trophy}>81.7% appeals won</StatPill>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("persist_auth");
              sessionStorage.removeItem("persist_user");
              window.location.reload();
            }}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:text-slate-700"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
