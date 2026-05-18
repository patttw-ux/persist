import { AppHeader } from "@/components/AppHeader";
import { NewPASheet } from "@/components/NewPASheet";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraphView } from "@/pages/GraphView";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type {
  CMSDeadlineCheckReport,
  DashboardStats,
  PACase,
  PAStatus,
} from "@/lib/types";
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  FileX,
  Network,
  Plus,
  RefreshCw,
  X,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useCountUp } from "@/hooks/useCountUp";

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
    <motion.tbody
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <tr key={i} className="border-b border-slate-100 last:border-0">
          <td className="px-4 py-4">
            <div className="h-4 w-32 rounded-full bg-slate-200 animate-pulse mb-1.5" />
            <div className="h-3 w-20 rounded-full bg-slate-100 animate-pulse" />
          </td>
          <td className="px-4 py-4">
            <div className="h-4 w-40 rounded-full bg-slate-200 animate-pulse mb-1.5" />
            <div className="h-3 w-16 rounded-full bg-slate-100 animate-pulse" />
          </td>
          <td className="px-4 py-4">
            <div className="h-4 w-28 rounded-full bg-slate-200 animate-pulse" />
          </td>
          <td className="px-4 py-4">
            <div className="h-3 w-16 rounded-full bg-slate-200 animate-pulse" />
          </td>
          <td className="px-4 py-4">
            <div className="h-6 w-24 rounded-full bg-slate-200 animate-pulse" />
          </td>
          <td className="px-4 py-4">
            <div className="h-4 w-20 rounded-full bg-slate-100 animate-pulse" />
          </td>
        </tr>
      ))}
    </motion.tbody>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<PACase[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [autoRunningIds, setAutoRunningIds] = useState<string[]>([]);
  const autoQueuedRef = useRef<Set<string>>(new Set());
  const seedAttemptedRef = useRef(false);
  const [cmsDeadline, setCmsDeadline] = useState<CMSDeadlineCheckReport | null>(
    null
  );
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(
    null
  );
  const [activeTab, setActiveTab] = useState("queue");
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [denialPatterns, setDenialPatterns] = useState<any[]>([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const userName = sessionStorage.getItem("persist_user") ?? "there";
  const displayName = userName.includes("@") ? userName.split("@")[0] : userName;

  const countTotal = useCountUp(
    dashboardStats?.total_cases ?? cases.length,
    800
  );
  const countAppeals = useCountUp(dashboardStats?.appeals_filed ?? 0, 800);
  const countPatterns = useCountUp(
    dashboardStats?.denial_patterns_learned ?? 0,
    800
  );

  const handlePatternsExpand = useCallback(async () => {
    if (!patternsExpanded && denialPatterns.length === 0) {
      setPatternsLoading(true);
      try {
        const result = await api.getDenialPatterns();
        setDenialPatterns(result.patterns ?? []);
      } catch {
        setDenialPatterns([]);
      } finally {
        setPatternsLoading(false);
      }
    }
    setPatternsExpanded((v) => !v);
  }, [patternsExpanded, denialPatterns.length]);

  const refreshCmsDeadlines = useCallback(async () => {
    try {
      const r = await api.checkCMSDeadlines();
      setCmsDeadline(r);
    } catch {
      setCmsDeadline(null);
    }
  }, []);

  const refreshCasesQuiet = useCallback(async () => {
    try {
      const data = await api.getAllCases();
      setCases(data.map(normalizeCase));
      await refreshCmsDeadlines();
    } catch {
      /* silent background refresh only */
    }
  }, [refreshCmsDeadlines]);

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
        if (seedAttemptedRef.current) return;
        seedAttemptedRef.current = true;
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
      try {
        const stats = await api.getDashboardStats();
        setDashboardStats(stats);
      } catch {
        /* stats failure must not block queue load */
      }
      scheduleDeniedAutoProcess(normalized);
      await refreshCmsDeadlines();
      setGraphRefreshKey((k) => k + 1);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not reach the server to load cases.";
      toast.error(`Something went wrong — ${message}`, {
        duration: 5000,
      });
      setCases([]);
      setCmsDeadline(null);
    } finally {
      setLoading(false);
    }
  }, [scheduleDeniedAutoProcess, refreshCmsDeadlines]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  useEffect(() => {
    document.title = "Persist — Prior Auth Queue";
    return () => {
      document.title = "Persist";
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] transition-opacity duration-300">
      <AppHeader />
      <motion.main
        className="pt-14"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="mx-auto max-w-7xl px-6 py-8">
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-6"
          >
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-slate-800">
              Welcome back,{" "}
              <span className="text-indigo-600 capitalize">{displayName}</span>
            </p>
          </motion.div>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 mb-4"
            >
              <div
                className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
              <span className="text-xs text-slate-400 ml-1">
                Loading cases...
              </span>
            </motion.div>
          )}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Prior Authorization Queue
            </h1>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Autonomous submission, monitoring, and appeal — zero physician time
            </p>
          </motion.div>
            <motion.button
              type="button"
              onClick={() => setSheetOpen(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New PA Request
            </motion.button>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              setActiveTab(value);
              if (value === "graph") {
                setGraphRefreshKey((k) => k + 1);
              }
            }}
            className="w-full"
          >
            <TabsList className="mb-6 border-b border-slate-200 bg-transparent rounded-none h-auto p-0 gap-0 w-full justify-start">
              <TabsTrigger
                value="queue"
                className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent hover:text-slate-700 transition-colors"
              >
                Prior Auth Queue
              </TabsTrigger>
              <TabsTrigger
                value="graph"
                className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600 data-[state=active]:bg-transparent hover:text-slate-700 transition-colors"
              >
                <Network className="h-3.5 w-3.5" aria-hidden />
                OSP Graph
              </TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-0">
          {!loading && cases.length > 0 && (
            <>
            <motion.div
              className="mb-8 flex items-stretch gap-2"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.1 } },
              }}
            >
              <motion.div
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { duration: 0.4 },
                  },
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 border-t-2 border-t-indigo-500"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Total Requests</p>
                  <FileText className="h-4 w-4 text-indigo-400" />
                </div>
                <p className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {countTotal}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {(dashboardStats?.submitted_pending ?? 0)} pending payer response
                </p>
              </motion.div>
              <div className="flex items-center justify-center text-slate-300 self-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <motion.div
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { duration: 0.4 },
                  },
                }}
                className="flex-[1.2] rounded-xl border border-indigo-200 bg-indigo-50/40 p-7 shadow-md shadow-indigo-100 ring-1 ring-slate-900/5 border-t-2 border-t-indigo-600"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500 mb-1">
                    Appeals Filed
                  </p>
                  <Zap className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="text-6xl font-bold tracking-tight text-indigo-700 tabular-nums">
                  {countAppeals}
                </p>
                <p className="mt-1 text-sm text-slate-500">Autonomously by Persist</p>
              </motion.div>
              <div className="flex items-center justify-center text-slate-300 self-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <motion.div
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { duration: 0.4 },
                  },
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 border-t-2 border-t-indigo-500"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Hours Saved</p>
                  <Clock className="h-4 w-4 text-indigo-400" />
                </div>
                <p className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {dashboardStats?.hours_saved ? `${dashboardStats.hours_saved.toFixed(1)}h` : "--"}
                </p>
                <p className="mt-1 text-sm text-slate-500">vs 2.5hrs manual per appeal</p>
              </motion.div>
              <div className="flex items-center justify-center text-slate-300 self-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <motion.div
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { duration: 0.4 },
                  },
                }}
                className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 border-t-2 border-t-indigo-500"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">Patterns Learned</p>
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-indigo-400" />
                    <motion.button
                      type="button"
                      onClick={() => void handlePatternsExpand()}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="rounded p-0.5 text-slate-400 hover:text-indigo-600 transition-colors"
                      aria-label="View learned patterns"
                    >
                      <motion.span
                        animate={{ rotate: patternsExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="block"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </motion.span>
                    </motion.button>
                  </div>
                </div>
                <p className="text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {countPatterns}
                </p>
                <p className="mt-1 text-sm text-slate-500">Graph memory — getting smarter</p>
              </motion.div>
            </motion.div>
            {patternsExpanded && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
                onClick={() => setPatternsExpanded(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl mx-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Denial Patterns Learned
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Powered by Jac Graph Intelligence ·{" "}
                        {denialPatterns.length} patterns in memory
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPatternsExpanded(false)}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="overflow-y-auto max-h-[60vh] px-6 py-4 space-y-3">
                    {patternsLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <div
                          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <div
                          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <div
                          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                        <span className="text-xs text-slate-400">
                          Loading patterns...
                        </span>
                      </div>
                    ) : denialPatterns.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">
                        No patterns learned yet. Record appeal outcomes to build
                        memory.
                      </p>
                    ) : (
                      denialPatterns.map((p, i) => (
                        <div
                          key={p.pattern_id ?? i}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {p.payer_name}
                            </span>
                            <span
                              className={`text-sm font-bold ${
                                (p.win_rate ?? 0) > 0.6
                                  ? "text-green-600"
                                  : "text-amber-600"
                              }`}
                            >
                              {Math.round((p.win_rate ?? 0) * 100)}% win rate
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                              {p.denial_type}
                            </span>
                            <span className="text-xs text-slate-400">
                              {p.times_seen} cases · {p.times_won} won
                            </span>
                          </div>
                          {p.successful_appeal_language && (
                            <p className="text-xs text-slate-600 leading-relaxed">
                              ✓ {p.successful_appeal_language}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-slate-100 px-6 py-3 flex items-center gap-1.5">
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <circle
                        cx="5"
                        cy="5"
                        r="4"
                        stroke="#6366F1"
                        strokeWidth="1.5"
                      />
                      <circle cx="5" cy="5" r="1.5" fill="#6366F1" />
                    </svg>
                    <span className="text-xs text-indigo-400">
                      Powered by Jac Graph Intelligence
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </>
          )}

          {!loading &&
            cases.length > 0 &&
            cmsDeadline &&
            cmsDeadline.total_escalated > 0 && (
              <div
                className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
                role="alert"
              >
                <AlertCircle
                  className="h-5 w-5 shrink-0 text-red-500"
                  aria-hidden
                />
                <div>
                  <p className="text-sm font-medium text-red-800">
                    CMS-0057-F Violation: {cmsDeadline.total_escalated} payer(s)
                    have exceeded mandatory response deadlines
                  </p>
                  <p className="mt-1 text-sm text-red-700">
                    Persist has automatically escalated these cases
                  </p>
                </div>
              </div>
            )}

          {loading && (
            <div className="mb-8 grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-t-2 border-t-indigo-100"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="h-3 w-24 rounded-full bg-slate-200 animate-pulse" />
                    <div className="h-4 w-4 rounded bg-slate-200 animate-pulse" />
                  </div>
                  <div className="mb-2 h-10 w-16 rounded-lg bg-slate-200 animate-pulse" />
                  <div className="h-3 w-32 rounded-full bg-slate-150 animate-pulse" />
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
                className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Submit First PA Request
              </button>
            </div>
          )}

          {(loading || cases.length > 0) && (
            <>
              <div className="mb-2 flex justify-end">
                <motion.button
                  type="button"
                  onClick={() => {
                    void loadCases();
                  }}
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  aria-label="Refresh queue"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </motion.button>
              </div>

              <div className={loading ? "animate-pulse" : undefined}>
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white ring-1 ring-slate-900/5">
                  <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-300 bg-slate-50">
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Patient
                        </th>
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Service
                        </th>
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Payer
                        </th>
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Submitted
                        </th>
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Status
                        </th>
                        <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                          Action
                        </th>
                      </tr>
                    </thead>
                    {loading ? (
                      <TableSkeleton />
                    ) : (
                    <motion.tbody
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.06 } },
                      }}
                    >
                      {cases.map((c) => {
                        const status = c.status as string;
                        return (
                        <motion.tr
                          key={c.case_id}
                          variants={{
                            hidden: { opacity: 0 },
                            visible: {
                              opacity: 1,
                              transition: { duration: 0.25 },
                            },
                          }}
                          className={`cursor-pointer border-b border-slate-100 transition-colors duration-100 last:border-0 hover:bg-slate-50/80 border-l-2 ${
                            status === "approved" || status === "appeal_won"
                              ? "border-l-green-400"
                              : status === "denied" || status === "denied_final"
                                ? "border-l-red-400"
                                : status === "appeal_submitted" ||
                                    status === "appeal_filed" ||
                                    status === "appeal_drafted"
                                  ? "border-l-blue-400"
                                  : status === "submitted" || status === "pending"
                                    ? "border-l-amber-400"
                                    : "border-l-slate-200"
                          }`}
                          onClick={() => navigate(`/case/${c.case_id}`)}
                        >
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-900">
                              {c.patient_name}
                            </p>
                            <p className="text-xs text-slate-400">{c.dob}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-slate-700">{c.drug_name}</p>
                            <p className="font-mono text-xs text-slate-400">
                              {c.cpt_code}
                            </p>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-700">
                            {c.payer_name}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">
                            {formatRelativeTime(c.submitted_at)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={c.status} size="sm" />
                          </td>
                          <td className="px-4 py-2.5">
                            <ActionCell
                              c={c}
                              navigate={navigate}
                              agentRunning={autoRunningIds.includes(c.case_id)}
                            />
                          </td>
                        </motion.tr>
                        );
                      })}
                    </motion.tbody>
                    )}
                  </table>
                </div>
              </div>
              <p className="mt-6 text-center text-xs text-slate-400">
                All patient data is Protected Health Information (PHI) handled in
                accordance with HIPAA Privacy Rule 45 CFR §164
              </p>
            </>
          )}
            </TabsContent>

            <TabsContent value="graph" className="mt-0">
              <GraphView
                refreshKey={graphRefreshKey}
                onPatientCaseClick={(id) => navigate(`/case/${id}`)}
              />
              <p className="mt-4 text-center text-xs text-slate-400">
                Live Jac OSP graph — PHI handled per HIPAA 45 CFR §164
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </motion.main>

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
