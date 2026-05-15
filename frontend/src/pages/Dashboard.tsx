import { AppHeader } from "@/components/AppHeader";
import { NewPASheet } from "@/components/NewPASheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/hooks/useCountUp";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type { PACase, PAStatus } from "@/lib/types";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  FileX,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const PA_STATUS_SET = new Set<string>([
  "submitted",
  "pending",
  "approved",
  "denied",
  "appeal_drafted",
  "appeal_submitted",
  "appeal_won",
  "expired",
]);

function normalizeStatus(status: string): PAStatus {
  if (PA_STATUS_SET.has(status)) {
    return status as PAStatus;
  }
  return "expired";
}

function normalizeCase(raw: PACase): PACase {
  return { ...raw, status: normalizeStatus(raw.status) };
}

function KpiCard({
  borderClass,
  icon: Icon,
  iconClass,
  label,
  target,
}: {
  borderClass: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  target: number;
}) {
  const count = useCountUp(target, 600);
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 border-l-4 ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900">{count}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

function ActionCell({
  c,
  navigate,
  agentRunning,
}: {
  c: PACase;
  navigate: (to: string) => void;
  agentRunning: boolean;
}) {
  if (agentRunning) {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-700">
        <Activity
          className="h-3.5 w-3.5 shrink-0 animate-pulse text-blue-600"
          aria-hidden
        />
        Agent Running
      </span>
    );
  }
  if (c.status === "denied" && c.appeal_viable) {
    return (
      <button
        type="button"
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/case/${c.case_id}`);
        }}
      >
        Fight Denial →
      </button>
    );
  }
  if (c.status === "appeal_drafted") {
    return (
      <button
        type="button"
        className="rounded-md bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/case/${c.case_id}`);
        }}
      >
        Submit Appeal →
      </button>
    );
  }
  if (c.status === "appeal_submitted") {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-400">
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 animate-pulse"
          aria-hidden
        />
        Monitoring
      </span>
    );
  }
  if (c.status === "approved" || c.status === "appeal_won") {
    return <CheckCircle2 className="h-4 w-4 text-green-500" aria-label="Completed" />;
  }
  if (c.status === "submitted" || c.status === "pending") {
    return <span className="text-xs text-slate-400">Pending</span>;
  }
  return null;
}

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 4 }, (_, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-0">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-1 h-3 w-16" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-3 w-20" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-6 w-20 rounded-full" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-8 w-24 rounded-md" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<PACase[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [autoRunningIds, setAutoRunningIds] = useState<string[]>([]);
  const autoQueuedRef = useRef<Set<string>>(new Set());

  const refreshCasesQuiet = useCallback(async () => {
    try {
      const data = await api.getAllCases();
      setCases(data.map(normalizeCase));
    } catch {
      /* silent background refresh only */
    }
  }, []);

  const scheduleDeniedAutoProcess = useCallback(
    (list: PACase[]) => {
      const targets = list.filter(
        (c) =>
          c.status === "denied" && c.has_denial && !c.has_appeal
      );
      for (const c of targets) {
        if (autoQueuedRef.current.has(c.case_id)) {
          continue;
        }
        autoQueuedRef.current.add(c.case_id);
        setAutoRunningIds((prev) =>
          prev.includes(c.case_id) ? prev : [...prev, c.case_id]
        );

        void api
          .autoProcessCase({ case_id: c.case_id, auto_submit_appeal: true })
          .catch(() => {
            toast.error(`Something went wrong — auto-process failed for ${c.patient_name}`, {
              duration: 4000,
            });
          })
          .finally(() => {
            autoQueuedRef.current.delete(c.case_id);
            setAutoRunningIds((prev) => prev.filter((id) => id !== c.case_id));
            void refreshCasesQuiet();
          });
      }
    },
    [refreshCasesQuiet]
  );

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      let data = await api.getAllCases();
      if (data.length === 0) {
        await api.seedDemoData();
        try {
          await api.seedPayerIntelligence();
        } catch {
          /* Non-fatal — queue still loads without seeded payer profiles */
        }
        data = await api.getAllCases();
      }
      const normalized = data.map(normalizeCase);
      setCases(normalized);
      scheduleDeniedAutoProcess(normalized);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not reach the server to load cases.";
      toast.error(`Something went wrong — ${message}`, {
        duration: 5000,
      });
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [scheduleDeniedAutoProcess]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    document.title = "Persist — Prior Auth Queue";
    return () => {
      document.title = "Persist";
    };
  }, []);

  const kpi = useMemo(() => {
    const total = cases.length;
    const pendingDecision = cases.filter(
      (c) => c.status === "submitted" || c.status === "pending"
    ).length;
    const deniedFight = cases.filter(
      (c) => c.status === "denied" && c.appeal_viable
    ).length;
    const appealsFiled = cases.filter(
      (c) => c.status === "appeal_submitted" || c.status === "appeal_won"
    ).length;
    return { total, pendingDecision, deniedFight, appealsFiled };
  }, [cases]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <AppHeader />
      <main className="pt-14">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Prior Authorization Queue
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Autonomous submission, monitoring, and appeal — zero physician time
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              New PA Request
            </button>
          </div>

          {!loading && cases.length > 0 && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              <KpiCard
                borderClass="border-l-blue-400"
                icon={FileText}
                iconClass="text-blue-500"
                label="Active Cases"
                target={kpi.total}
              />
              <KpiCard
                borderClass="border-l-amber-400"
                icon={Clock}
                iconClass="text-amber-500"
                label="Pending Decision"
                target={kpi.pendingDecision}
              />
              <KpiCard
                borderClass="border-l-red-400"
                icon={XCircle}
                iconClass="text-red-500"
                label="Denied · Needs Fight"
                target={kpi.deniedFight}
              />
              <KpiCard
                borderClass="border-l-green-400"
                icon={CheckCircle2}
                iconClass="text-green-500"
                label="Appeals Filed"
                target={kpi.appealsFiled}
              />
            </div>
          )}

          {loading && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white p-4 border-l-4 border-l-slate-200"
                >
                  <Skeleton className="h-5 w-5 rounded" />
                  <Skeleton className="mt-3 h-9 w-12" />
                  <Skeleton className="mt-2 h-4 w-24" />
                </div>
              ))}
            </div>
          )}

          {!loading && cases.length === 0 && (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-16">
              <FileX className="mx-auto mb-4 h-16 w-16 text-slate-200" />
              <p className="text-lg font-medium text-slate-600">
                No prior authorizations yet
              </p>
              <p className="mt-1 text-sm text-slate-400">
                Submit your first request to get started
              </p>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Submit First PA Request
              </button>
            </div>
          )}

          {(loading || cases.length > 0) && (
            <>
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void loadCases()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  aria-label="Refresh queue"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Patient
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Service
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Payer
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Submitted
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  {loading ? (
                    <TableSkeleton />
                  ) : (
                    <tbody>
                      {cases.map((c) => (
                        <tr
                          key={c.case_id}
                          className="cursor-pointer border-b border-slate-100 transition-colors duration-100 last:border-0 hover:bg-blue-50/50"
                          onClick={() => navigate(`/case/${c.case_id}`)}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">
                              {c.patient_name}
                            </p>
                            <p className="text-xs text-slate-400">{c.dob}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{c.drug_name}</p>
                            <p className="font-mono text-xs text-slate-400">
                              {c.cpt_code}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {c.payer_name}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {formatRelativeTime(c.submitted_at)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={c.status} size="sm" />
                          </td>
                          <td className="px-4 py-3">
                            <ActionCell
                              c={c}
                              navigate={navigate}
                              agentRunning={autoRunningIds.includes(c.case_id)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  )}
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      <NewPASheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSuccess={() => {
          setSheetOpen(false);
          void loadCases();
        }}
      />
    </div>
  );
}
