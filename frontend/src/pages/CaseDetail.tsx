import { AgentStep as AgentStepRow } from "@/components/AgentStep";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type {
  AgentStep as AgentStepState,
  CaseDetail,
  DenialType,
  PAStatus,
  StepStatus,
} from "@/lib/types";
import { createAgentStream } from "@/lib/websocket";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Copy,
  Loader2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

function normalizeAppealStatusForBadge(status: string): PAStatus {
  if (status === "drafted") {
    return "appeal_drafted";
  }
  if (status === "submitted") {
    return "appeal_submitted";
  }
  if (PA_STATUS_SET.has(status)) {
    return status as PAStatus;
  }
  return "expired";
}

const DENIAL_TYPE_LABEL: Record<DenialType, string> = {
  medical_necessity: "Medical Necessity",
  step_therapy: "Step Therapy",
  administrative: "Administrative",
  non_covered: "Non-Covered Service",
};

const INITIAL_STEP_LABELS: readonly string[] = [
  "Detect authorization requirement",
  "Assemble clinical documentation",
  "Submit to payer",
  "Monitor payer response",
  "Parse denial reason",
  "Score appeal viability",
  "Draft appeal letter",
];

function createInitialSteps(): AgentStepState[] {
  return INITIAL_STEP_LABELS.map((label, index) => ({
    step: index + 1,
    status: "idle" as StepStatus,
    label,
  }));
}

function mergeStepStatus(
  prev: StepStatus,
  incoming: string | undefined
): StepStatus {
  if (
    incoming === "idle" ||
    incoming === "running" ||
    incoming === "done" ||
    incoming === "error"
  ) {
    return incoming;
  }
  return prev;
}

function CaseDetailPageSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <Skeleton className="mb-4 h-4 w-48" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-52" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <Skeleton className="mb-4 h-4 w-40" />
          <Skeleton className="h-6 w-3/4 max-w-md" />
          <Skeleton className="mt-3 h-4 w-28" />
          <Skeleton className="mt-4 h-16 w-full" />
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <Skeleton className="h-24 w-full" />
        </section>
      </div>
      <div className="lg:col-span-2">
        <div className="sticky top-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <Skeleton className="h-12 w-full rounded-none bg-slate-900" />
          <div className="space-y-2 px-4 py-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViabilityScoreDisplay({ percent }: { percent: number }) {
  const colorClass =
    percent > 70
      ? "text-green-600"
      : percent >= 40
        ? "text-amber-600"
        : "text-red-600";

  return (
    <p className={`mt-1 text-4xl font-bold ${colorClass}`}>{percent}%</p>
  );
}

export function CaseDetail() {
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();

  const [minLoadDone, setMinLoadDone] = useState(false);
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [caseLoadError, setCaseLoadError] = useState<string | null>(null);
  const [steps, setSteps] = useState<AgentStepState[]>(createInitialSteps);
  const [agentStreaming, setAgentStreaming] = useState(true);
  const [agentStreamError, setAgentStreamError] = useState<string | null>(null);
  const [latestViabilityScore, setLatestViabilityScore] = useState<
    number | null
  >(null);
  const [appealActionBusy, setAppealActionBusy] = useState(false);
  const [markExpeditedBusy, setMarkExpeditedBusy] = useState(false);
  const [agentStreamKey, setAgentStreamKey] = useState(0);

  const loadCase = useCallback(async () => {
    if (!caseId) {
      return;
    }
    setCaseLoadError(null);
    try {
      const data = await api.getCaseDetail(caseId);
      setCaseData(data);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load case";
      setCaseLoadError(msg);
      toast.error(`Something went wrong — ${msg}`, {
        duration: 5000,
      });
    }
  }, [caseId]);

  useEffect(() => {
    const t = window.setTimeout(() => setMinLoadDone(true), 800);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (caseData?.patient_name) {
      document.title = `Persist — ${caseData.patient_name}`;
    }
    return () => {
      document.title = "Persist";
    };
  }, [caseData?.patient_name]);

  const onStep = useCallback((incoming: AgentStepState) => {
    const idx = incoming.step - 1;
    if (idx < 0 || idx > 6) {
      return;
    }
    setSteps((prev) => {
      const next = [...prev];
      const current = next[idx];
      if (!current) {
        return prev;
      }
      next[idx] = {
        ...current,
        step: incoming.step,
        status: mergeStepStatus(current.status, incoming.status),
        label: incoming.label ?? current.label,
        detail: incoming.detail ?? current.detail,
        durationMs: incoming.durationMs ?? current.durationMs,
        viability_score:
          incoming.viability_score ?? current.viability_score,
      };
      return next;
    });
    if (incoming.step === 6 && incoming.viability_score !== undefined) {
      setLatestViabilityScore(incoming.viability_score);
    }
  }, []);

  useEffect(() => {
    if (!caseId) {
      return;
    }
    setAgentStreaming(true);
    setAgentStreamError(null);

    const cleanup = createAgentStream(
      caseId,
      onStep,
      () => {
        setAgentStreaming(false);
      },
      (err) => {
        setAgentStreaming(false);
        setAgentStreamError(err);
        toast.error(`Something went wrong — ${err}`, {
          duration: 5000,
        });
      }
    );

    return cleanup;
  }, [caseId, onStep, agentStreamKey]);

  const completedSteps = useMemo(
    () => steps.filter((s) => s.status === "done").length,
    [steps]
  );

  const progressValue = (completedSteps / 7) * 100;

  const stepSixDone = steps[5]?.status === "done";

  const viabilityPercent = useMemo(() => {
    if (latestViabilityScore !== null) {
      return Math.round(latestViabilityScore * 100);
    }
    if (caseData?.denial?.appeal_viability_score !== undefined) {
      return Math.round(caseData.denial.appeal_viability_score * 100);
    }
    return null;
  }, [latestViabilityScore, caseData?.denial?.appeal_viability_score]);

  const handleAutoProcess = useCallback(async () => {
    if (!caseId || !caseData) {
      return;
    }
    setAppealActionBusy(true);
    setAgentStreamError(null);
    setAgentStreaming(true);
    setSteps(createInitialSteps());
    setAgentStreamKey((k) => k + 1);
    try {
      const res = await api.autoProcessCase({
        case_id: caseId,
        denial_text: caseData.denial?.raw_denial_text,
        denial_date: caseData.denial?.denial_date,
        auto_submit_appeal: true,
      });

      if (typeof res.error === "string" && res.step === undefined) {
        toast.error(res.error, { duration: 5000 });
        return;
      }

      await loadCase();

      switch (res.step) {
        case "appeal_submitted":
          toast.success(
            "Persist autonomously fought and submitted your appeal",
            { duration: 4000 }
          );
          break;
        case "appeal_drafted":
          toast.success("Persist drafted appeal — ready for physician review", {
            duration: 4000,
          });
          break;
        case "escalate":
          toast.warning(
            res.message ??
              "Low viability — Persist recommends peer-to-peer review",
            { duration: 4000 }
          );
          break;
        case "complete":
          toast.info(res.message ?? "Appeal already on file", {
            duration: 3000,
          });
          break;
        case "monitoring":
          toast.info(res.message ?? "Persist is monitoring this case", {
            duration: 4000,
          });
          break;
        case "detection":
          toast.error(
            typeof res.error === "string"
              ? res.error
              : typeof res.message === "string"
                ? res.message
                : "Case processing failed",
            { duration: 5000 }
          );
          break;
        default:
          toast.success(res.message ?? "Persist updated this case.", {
            duration: 3000,
          });
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to run Persist agent";
      toast.error(`Something went wrong — ${msg}`, {
        duration: 5000,
      });
    } finally {
      setAppealActionBusy(false);
    }
  }, [caseId, caseData, loadCase]);

  const handleSubmitAppeal = useCallback(async () => {
    if (!caseId || !caseData?.appeal) {
      return;
    }
    setAppealActionBusy(true);
    try {
      await api.submitAppeal(caseData.appeal.appeal_id);
      await loadCase();
      toast.success("Appeal submitted to payer", {
        duration: 3000,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to submit appeal";
      toast.error(`Something went wrong — ${msg}`, {
        duration: 5000,
      });
    } finally {
      setAppealActionBusy(false);
    }
  }, [caseId, caseData?.appeal, loadCase]);

  const handleCopyLetter = useCallback(() => {
    if (!caseData?.appeal?.full_letter) {
      return;
    }
    void navigator.clipboard.writeText(caseData.appeal.full_letter);
    toast.success("Appeal letter copied to clipboard", {
      duration: 3000,
    });
  }, [caseData?.appeal?.full_letter]);

  const handleMarkExpedited = useCallback(async () => {
    if (!caseId) {
      return;
    }
    setMarkExpeditedBusy(true);
    try {
      const res = await api.markExpedited(caseId, true);
      if (res.error) {
        toast.error(res.error, { duration: 4000 });
        return;
      }
      toast.success(res.message ?? "Marked as expedited", { duration: 3000 });
      await loadCase();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update expedited flag";
      toast.error(`Something went wrong — ${msg}`, { duration: 5000 });
    } finally {
      setMarkExpeditedBusy(false);
    }
  }, [caseId, loadCase]);

  const showDetail = Boolean(caseData) && minLoadDone;
  const showError = Boolean(caseLoadError) && minLoadDone && !caseData;
  const showSkeleton = !showDetail && !showError;

  if (!caseId) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <AppHeader />
        <main className="pt-14">
          <div className="mx-auto max-w-7xl px-6 py-8">
            <p className="text-sm text-slate-600">Missing case ID.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <AppHeader />
      <main className="pt-14">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 mb-4 flex cursor-pointer items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to Queue
          </button>

          {showSkeleton ? (
            <CaseDetailPageSkeleton />
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-3">
                {showError ? (
                  <p className="text-sm text-red-600">{caseLoadError}</p>
                ) : caseData ? (
                  <>
                    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-6">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
                      Patient &amp; Insurance
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">
                          {caseData.patient_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">
                          DOB: {caseData.dob}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2
                          className="h-4 w-4 shrink-0 text-slate-400"
                          aria-hidden
                        />
                        <span className="text-sm font-medium text-slate-900">
                          {caseData.payer_name}
                        </span>
                      </div>
                      <div>
                        <p className="font-mono text-sm text-slate-600">
                          Member ID: {caseData.member_id}
                        </p>
                      </div>
                      <div>
                        <span className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-sm text-slate-800">
                          {caseData.cpt_code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500">Status:</span>
                        <StatusBadge
                          status={normalizeStatus(caseData.status)}
                        />
                      </div>
                    </div>
                  </section>

                  <section className="mb-4 rounded-lg border border-slate-200 bg-white p-6">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
                      Authorization Request
                    </h2>
                    <p className="text-lg font-semibold text-slate-900">
                      {caseData.drug_name}
                    </p>
                    <p className="mt-2">
                      <span className="font-mono text-sm text-slate-700">
                        CPT {caseData.cpt_code}
                      </span>
                    </p>
                    {caseData.diagnosis_codes.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {caseData.diagnosis_codes.map((code) => (
                          <span
                            key={code}
                            className="mr-1 inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-800"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-3 text-sm text-slate-500">
                      Submitted:{" "}
                      {formatRelativeTime(caseData.submitted_at)}
                    </p>
                    {caseData.monitor?.is_expedited ? (
                      <Badge
                        variant="outline"
                        className="mt-3 border-amber-200 bg-amber-50 font-medium text-amber-800"
                      >
                        Expedited · 72h CMS
                      </Badge>
                    ) : null}
                    {(caseData.status === "submitted" ||
                      caseData.status === "pending") &&
                    caseData.monitor &&
                    !caseData.monitor.is_expedited ? (
                      <button
                        type="button"
                        disabled={markExpeditedBusy}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        onClick={() => void handleMarkExpedited()}
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        Mark as Expedited (72-hr deadline)
                      </button>
                    ) : null}
                    {caseData.status === "approved" && caseData.preauth_ref ? (
                      <p className="mt-2 font-mono text-sm text-green-700">
                        Pre-auth ref: {caseData.preauth_ref}
                      </p>
                    ) : null}
                  </section>

                  {caseData.denial ? (
                    <section className="mb-4 rounded-lg border-l-4 border-red-400 bg-red-50/30 p-6">
                      <div className="mb-4 flex items-center gap-2">
                        <AlertCircle
                          className="h-5 w-5 shrink-0 text-red-500"
                          aria-hidden
                        />
                        <span className="text-sm font-semibold text-red-800">
                          Prior Auth Denied
                        </span>
                        <span className="ml-auto text-xs text-red-500">
                          {caseData.denial.denial_date}
                        </span>
                      </div>
                      <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        {DENIAL_TYPE_LABEL[caseData.denial.denial_type]}
                      </span>
                      <p className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">
                        Criterion Not Met
                      </p>
                      <p className="text-sm leading-relaxed text-slate-800">
                        {caseData.denial.criterion_failed}
                      </p>
                      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">
                        Missing Documentation
                      </p>
                      <ul className="list-inside list-disc space-y-1">
                        {caseData.denial.missing_documentation.map((item) => (
                          <li
                            key={item}
                            className="text-sm text-slate-700"
                          >
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">
                        What This Means
                      </p>
                      <p className="text-sm italic text-slate-600">
                        {caseData.denial.denial_reason_summary}
                      </p>
                    </section>
                  ) : null}

                  {caseData.appeal ? (
                    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-6">
                      <div className="mb-4 flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">
                          Appeal Letter
                        </h2>
                        <div className="ml-auto flex items-center gap-2">
                          <StatusBadge
                            status={normalizeAppealStatusForBadge(
                              caseData.appeal.status
                            )}
                            size="sm"
                          />
                          <button
                            type="button"
                            onClick={handleCopyLetter}
                            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-700 hover:bg-slate-100"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                            Copy Letter
                          </button>
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                        {caseData.appeal.full_letter}
                      </div>
                      {caseData.appeal.status === "drafted" ? (
                        <button
                          type="button"
                          disabled={appealActionBusy}
                          onClick={handleSubmitAppeal}
                          className="mt-4 w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Submit Appeal to Payer
                        </button>
                      ) : null}
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <div className="sticky top-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between bg-slate-900 px-4 py-3">
                  <div className="flex min-w-0 flex-1 items-center">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        agentStreaming
                          ? "animate-pulse bg-green-400"
                          : "bg-slate-500"
                      }`}
                      aria-hidden
                    />
                    <span className="ml-2 text-sm font-semibold text-white">
                      Persist Agent
                    </span>
                    <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
                      Autonomous Prior Auth
                    </span>
                  </div>
                  <div className="shrink-0">
                    {agentStreaming ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-blue-400"
                        aria-hidden
                      />
                    ) : agentStreamError ? (
                      <AlertCircle
                        className="h-4 w-4 text-red-400"
                        aria-hidden
                      />
                    ) : (
                      <CheckCircle2
                        className="h-4 w-4 text-green-400"
                        aria-hidden
                      />
                    )}
                  </div>
                </div>

                {steps.length > 0 ? (
                  <Progress
                    value={progressValue}
                    className="h-1 rounded-none bg-slate-200 [&>div]:bg-blue-500"
                  />
                ) : null}

                <div className="space-y-1 px-4 py-3">
                  {steps.map((s) => (
                    <AgentStepRow
                      key={s.step}
                      step={s.step}
                      label={s.label}
                      detail={s.detail}
                      status={s.status}
                      durationMs={s.durationMs}
                      viability_score={s.viability_score}
                    />
                  ))}
                </div>

                {caseData?.status === "denied" && !caseData.appeal ? (
                  <div className="mx-4 mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    {viabilityPercent !== null ? (
                      <>
                        <p className="text-sm text-slate-500">
                          Appeal Viability Score
                        </p>
                        <ViabilityScoreDisplay percent={viabilityPercent} />
                        <p className="mt-1 text-xs text-slate-400">
                          Based on AMA data: 81.7% of properly appealed denials
                          are overturned
                        </p>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={appealActionBusy}
                      onClick={() => {
                        void handleAutoProcess();
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" aria-hidden />
                      Run Persist Agent — Fight This Denial
                    </button>
                  </div>
                ) : null}

                {stepSixDone &&
                viabilityPercent !== null &&
                !(caseData?.status === "denied" && !caseData.appeal) ? (
                  <div className="mx-4 mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                      Appeal Viability Score
                    </p>
                    <ViabilityScoreDisplay percent={viabilityPercent} />
                    <p className="mt-1 text-xs text-slate-400">
                      Based on AMA data: 81.7% of properly appealed denials are
                      overturned
                    </p>
                    {caseData?.appeal ? (
                      <div className="mt-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                        <CheckCircle2
                          className="h-4 w-4 shrink-0"
                          aria-hidden
                        />
                        {caseData.appeal.status === "drafted"
                          ? "Appeal drafted — submit when ready below"
                          : "Appeal submitted — Persist fought this denial"}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
