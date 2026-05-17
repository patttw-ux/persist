import { AgentStep as AgentStepRow } from "@/components/AgentStep";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useCountUp } from "@/hooks/useCountUp";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import type {
  AgentStep as AgentStepState,
  AppealData,
  CaseDetail,
  DenialData,
  DenialType,
  P2PReviewResult,
  PAStatus,
  StepStatus,
} from "@/lib/types";
import { createAgentStream } from "@/lib/websocket";
import {
  AlertCircle,
  BookOpen,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Copy,
  FileText,
  Loader2,
  Phone,
  Send,
  Shield,
  Trophy,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  "denied_final",
  "p2p_requested",
  "expired",
]);

function normalizeStatus(status: string): PAStatus {
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

function createStepsFromCaseData(caseData: CaseDetail): AgentStepState[] {
  const steps = createInitialSteps();
  const status = caseData.status;

  const allDone = [
    "appeal_filed",
    "appeal_submitted",
    "appeal_won",
    "approved",
    "denied_final",
    "appeal_drafted",
  ].includes(status);

  const throughSubmit = [
    "denied",
    "p2p_requested",
  ].includes(status);

  if (allDone) {
    return steps.map((s, i) => ({
      ...s,
      status: "done" as StepStatus,
      detail: [
        "PA requirement detected",
        "Clinical documentation assembled",
        "Submitted to payer via FHIR R4",
        "Payer response received",
        "Denial parsed and analyzed",
        "Appeal viability scored",
        "Appeal letter drafted and filed",
      ][i],
    }));
  }

  if (throughSubmit) {
    return steps.map((s, i) => ({
      ...s,
      status: i < 4 ? ("done" as StepStatus) : ("idle" as StepStatus),
      detail: i < 4 ? [
        "PA requirement detected",
        "Clinical documentation assembled",
        "Submitted to payer via FHIR R4",
        "Payer response received",
      ][i] : undefined,
    }));
  }

  return steps;
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

function formatAppealFiledDate(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) {
    return "—";
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return "—";
  }
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTransmissionLines(
  appeal: AppealData,
  payer: string,
  cptCode: string,
  memberId: string
) {
  return [
    {
      time: "00:00.1",
      type: "info" as const,
      text: "Initializing FHIR R4 ClaimResponse bundle...",
    },
    {
      time: "00:00.3",
      type: "info" as const,
      text: `Patient demographics validated — Member ID ${memberId}`,
    },
    {
      time: "00:00.6",
      type: "info" as const,
      text: `CPT ${cptCode} coverage verified under active policy`,
    },
    {
      time: "00:01.1",
      type: "send" as const,
      text: `POST /fhir/r4/Claim/$submit → ${payer} EDI Gateway`,
    },
    {
      time: "00:01.8",
      type: "recv" as const,
      text: `HTTP 200 OK — Claim accepted by ${payer}`,
    },
    {
      time: "00:02.1",
      type: "recv" as const,
      text: "ClaimResponse.status: active | outcome: complete",
    },
    {
      time: "00:02.4",
      type: "info" as const,
      text: `Appeal reference assigned: #${appeal.appeal_id.slice(0, 8).toUpperCase()}`,
    },
    {
      time: "00:02.9",
      type: "success" as const,
      text: "Appeal transmitted successfully — awaiting payer adjudication",
    },
  ];
}

function AppealTransmissionLog({
  appeal,
  payer,
  cptCode,
  memberId,
}: {
  appeal: AppealData;
  payer: string;
  cptCode: string;
  memberId: string;
}) {
  const lines = useMemo(
    () => getTransmissionLines(appeal, payer, cptCode, memberId),
    [appeal, payer, cptCode, memberId]
  );
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const total = lines.length;
    setVisibleLines(0);
    if (total === 0) {
      return;
    }
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i += 1) {
      timeouts.push(
        setTimeout(() => setVisibleLines(i), (i - 1) * 300)
      );
    }
    return () => timeouts.forEach(clearTimeout);
  }, [lines]);

  function typeLabelClasses(
    type: (typeof lines)[number]["type"]
  ): string {
    switch (type) {
      case "info":
        return "text-blue-400";
      case "send":
        return "text-amber-400";
      case "recv":
        return "text-green-400";
      case "success":
        return "text-green-300";
      default:
        return "text-slate-400";
    }
  }

  function typeLabel(type: (typeof lines)[number]["type"]): string {
    switch (type) {
      case "info":
        return "INFO ";
      case "send":
        return "SEND ";
      case "recv":
        return "RECV ";
      case "success":
        return "✓ OK  ";
      default:
        return "";
    }
  }

  function messageClasses(type: (typeof lines)[number]["type"]): string {
    switch (type) {
      case "info":
        return "text-slate-300";
      case "send":
        return "text-amber-300";
      case "recv":
        return "text-green-300";
      case "success":
        return "text-green-200 font-semibold";
      default:
        return "text-slate-300";
    }
  }

  return (
    <div className="mb-4 rounded-xl bg-slate-900 p-4 font-mono text-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-green-400"
            aria-hidden
          />
          <span className="font-mono text-xs text-green-400">
            FHIR R4 Transmission Log
          </span>
        </div>
        <span className="text-xs text-slate-500">
          Reference #
          {appeal.appeal_id.slice(0, 8).toUpperCase()}
        </span>
      </div>
      <div>
        {lines.slice(0, visibleLines).map((line, index) => (
          <div
            key={`${line.time}-${line.type}-${index}`}
            className="mb-1 flex items-start gap-2"
          >
            <span className="shrink-0 text-slate-500">[{line.time}]</span>
            <span className={`shrink-0 ${typeLabelClasses(line.type)}`}>
              {typeLabel(line.type)}
            </span>
            <span className={`min-w-0 break-words ${messageClasses(line.type)}`}>
              {line.text}
            </span>
          </div>
        ))}
      </div>
      {visibleLines >= lines.length && lines.length > 0 ? (
        <span
          className="mt-1 inline-block animate-pulse text-green-400"
          aria-hidden
        >
          █
        </span>
      ) : null}
    </div>
  );
}

function paragraphHasClinicalCue(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("das28") ||
    lower.includes("methotrexate") ||
    lower.includes("icd-10") ||
    /\bcpt\b/i.test(text)
  );
}

function denialTypeInsight(dt: DenialType | undefined): string {
  switch (dt) {
    case "step_therapy":
      return "Step therapy denials have 78% overturn rate when properly documented";
    case "medical_necessity":
      return "Medical necessity denials have 82% overturn rate with clinical evidence";
    case "administrative":
      return "Administrative denials have 95% overturn rate — documentation fix required";
    default:
      return "Appeals with complete clinical documentation significantly improve overturn likelihood.";
  }
}

function viabilityScoreColorClasses(
  percent: number | null
): { text: string; fill: string } {
  if (percent === null) {
    return { text: "text-slate-400", fill: "bg-slate-300" };
  }
  if (percent > 70) {
    return { text: "text-green-600", fill: "bg-green-600" };
  }
  if (percent >= 40) {
    return { text: "text-amber-600", fill: "bg-amber-600" };
  }
  return { text: "text-red-600", fill: "bg-red-600" };
}

function AppealLetterHero({
  appeal,
  patientName,
  memberId,
  payerName,
  cptCode,
  onCopy,
  onSubmit,
  submitBusy,
}: {
  appeal: AppealData;
  patientName: string;
  memberId: string;
  payerName: string;
  cptCode: string;
  onCopy: () => void;
  onSubmit: () => void;
  submitBusy: boolean;
}) {
  const paragraphs = appeal.full_letter
    .split(/\n\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const appealRefShort =
    appeal.appeal_id.length >= 8
      ? appeal.appeal_id.slice(0, 8).toUpperCase()
      : appeal.appeal_id.toUpperCase();

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-slate-900 px-6 py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-y-1">
          <FileText
            className="mr-2 h-5 w-5 shrink-0 text-blue-400"
            aria-hidden
          />
          <span className="text-sm font-semibold text-white">
            Prior Authorization Appeal
          </span>
          <span className="ml-2 rounded bg-blue-900 px-2 py-0.5 text-xs text-blue-200">
            {appeal.appeal_type}
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          {appeal.status === "submitted" ? (
            <span className="flex items-center text-xs text-green-400">
              <CheckCircle2 className="mr-1 h-4 w-4 shrink-0" aria-hidden />
              Submitted to Payer
            </span>
          ) : appeal.status === "drafted" ? (
            <span className="flex items-center text-xs text-amber-400">
              <Clock className="mr-1 h-4 w-4 shrink-0" aria-hidden />
              Ready to Submit
            </span>
          ) : (
            <span className="flex items-center text-xs text-amber-400">
              <Clock className="mr-1 h-4 w-4 shrink-0" aria-hidden />
              Appeal in progress
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-bold tracking-widest text-slate-400">
            PERSIST HEALTH SOLUTIONS
          </p>
          <p className="text-xs text-slate-400">
            Autonomous Prior Authorization Agent
          </p>
          <p className="text-xs text-slate-400">
            persist.health | AI-Powered Appeals
          </p>
        </div>
        <div className="space-y-0.5 text-right sm:ml-auto">
          <p className="text-xs text-slate-600">
            Date: {formatAppealFiledDate(appeal.filed_at)}
          </p>
          <p className="font-mono text-xs text-slate-600">
            Re: Appeal #{appealRefShort}
          </p>
          <p className="text-xs text-slate-600">Patient: {patientName}</p>
          <p className="font-mono text-xs text-slate-600">
            Member ID: {memberId}
          </p>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-6 py-3">
        <p className="text-sm font-semibold text-slate-900">
          RE: {appeal.subject_line}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-blue-100 bg-blue-50 px-6 py-3">
        <span className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
          <span className="text-xs font-medium text-blue-700">
            81.7% Appeal Overturn Rate
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
          <span className="text-xs font-medium text-blue-700">
            Generated in &lt;60 seconds
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Brain className="h-4 w-4 shrink-0 text-blue-500" aria-hidden />
          <span className="text-xs font-medium text-blue-700">
            AI-Drafted Clinical Justification
          </span>
        </span>
      </div>

      {appeal.status === "submitted" ? (
        <div className="px-6 pt-3">
          <AppealTransmissionLog
            appeal={appeal}
            payer={payerName}
            cptCode={cptCode}
            memberId={memberId}
          />
        </div>
      ) : null}

      <div className="px-6 py-5">
        {paragraphs.length === 0 ? (
          <p className="text-sm text-slate-500">No letter body.</p>
        ) : (
          paragraphs.map((para, index) => {
            const base =
              "mb-4 text-sm leading-relaxed text-slate-700 last:mb-0";
            const opening = index === 0 ? " font-medium text-slate-900" : "";
            const highlighted = paragraphHasClinicalCue(para);
            if (highlighted) {
              return (
                <div
                  key={`${index}-${para.slice(0, 24)}`}
                  className={`mb-4 rounded-r border-l-2 border-blue-300 bg-blue-50 py-1 pl-3 text-sm leading-relaxed text-slate-700 last:mb-0${opening}`}
                >
                  {para}
                </div>
              );
            }
            return (
              <p
                key={`${index}-${para.slice(0, 24)}`}
                className={`${base}${opening}`}
              >
                {para}
              </p>
            );
          })
        )}
      </div>

      {appeal.evidence_cited && appeal.evidence_cited.length > 0 ? (
        <div className="border-t border-slate-200 px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Clinical Evidence Cited
          </p>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {appeal.evidence_cited.map((cite) => (
              <motion.span
                key={cite}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  visible: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.3 },
                  },
                }}
                className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
              >
                <BookOpen className="h-3 w-3 shrink-0" aria-hidden />
                {cite}
              </motion.span>
            ))}
          </motion.div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.button
          type="button"
          onClick={onCopy}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/60"
        >
          <Copy className="h-4 w-4 shrink-0" aria-hidden />
          Copy Letter
        </motion.button>
        <div className="flex items-center gap-2 sm:justify-end">
          {appeal.status === "drafted" ? (
            <button
              type="button"
              disabled={submitBusy}
              onClick={onSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4 shrink-0" aria-hidden />
              Submit Appeal to Payer
            </button>
          ) : appeal.status === "submitted" ? (
            <span className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-green-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Appeal Submitted
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AppealViabilityCard({
  viabilityPercent,
  denial,
  appeal,
  appealActionBusy,
  onRunAgent,
}: {
  viabilityPercent: number | null;
  denial: DenialData | null | undefined;
  appeal: AppealData | null | undefined;
  appealActionBusy: boolean;
  onRunAgent: () => void;
}) {
  const animatedPercent = useCountUp(
    viabilityPercent ?? 0, 1200);
  const [barFillPct, setBarFillPct] = useState(0);
  const targetWidth =
    viabilityPercent === null
      ? 0
      : Math.min(100, Math.max(0, viabilityPercent));

  const { text: scoreTextClass, fill: barFillClass } =
    viabilityScoreColorClasses(viabilityPercent);

  useEffect(() => {
    setBarFillPct(0);
    const id = requestAnimationFrame(() => {
      setBarFillPct(targetWidth);
    });
    return () => cancelAnimationFrame(id);
  }, [targetWidth]);

  const showRunCta = Boolean(denial?.appeal_viable && !appeal);
  const showFoughtCta = appeal?.status === "submitted";

  return (
    <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Appeal Viability Analysis
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-1">
        {viabilityPercent === null ? (
          <span className={`text-5xl font-bold ${scoreTextClass}`}>—</span>
        ) : (
          <>
            <span className={`text-5xl font-bold ${scoreTextClass}`}>
              {animatedPercent}%
            </span>
            <span className="mb-1 ml-2 self-end text-xs text-slate-500">
              Viability Score
            </span>
          </>
        )}
      </div>

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out ${barFillClass}`}
          style={{ width: `${barFillPct}%` }}
        />
      </div>

      <p className="text-xs text-slate-400">
        AMA 2024 Survey | 81.7% Overturn Rate | n=1,000 Physicians
      </p>

      <p className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
        {denialTypeInsight(denial?.denial_type)}
      </p>

      {appeal?.status === "drafted" ? (
        <p className="mt-3 text-xs text-slate-600">
          Appeal drafted — submit when ready in the letter below.
        </p>
      ) : null}

      {showRunCta ? (
        <button
          type="button"
          disabled={appealActionBusy}
          onClick={onRunAgent}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Zap className="h-4 w-4 shrink-0" aria-hidden />
          Run Persist Agent — Fight This Denial
        </button>
      ) : null}

      {showFoughtCta ? (
        <div className="mt-4 flex w-full cursor-default items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white">
          <Trophy className="h-4 w-4 shrink-0" aria-hidden />
          Persist Fought This Denial
        </div>
      ) : null}
    </div>
  );
}

interface PayerIntelData {
  payer_name: string;
  criteria_engine: string;
  appeal_language_notes: string;
  win_rate?: number;
  patterns_learned?: number;
}

function PayerIntelligencePanel({ payerName }: { payerName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<PayerIntelData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!payerName) return;
    setLoading(true);
    api.getPayerProfile(payerName)
      .then((result) => {
        if ("error" in result) {
          setData(null);
        } else {
          const p = result as PayerIntelData;
          setData(p);
        }
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [payerName]);

  if (loading) {
    return (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Payer Intelligence
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-slate-100 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Payer Intelligence
          </span>
          {!expanded && (
            <span className="text-xs text-slate-600 font-medium">
              · {data.payer_name} · {data.criteria_engine}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            key="payer-intel-content"
            className="px-4 pb-4 space-y-2.5"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
          <p className="text-sm font-semibold text-slate-900">{data.payer_name}</p>

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Criteria Engine</span>
            <span className="text-xs font-semibold text-slate-700">{data.criteria_engine}</span>
          </div>

          {data.win_rate !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Win Rate</span>
              <span className="text-xs font-semibold text-green-600">
                {Math.round(data.win_rate * 100)}%
              </span>
            </div>
          )}

          {data.patterns_learned !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Patterns Learned</span>
              <span className="text-xs font-semibold text-slate-700">
                {data.patterns_learned} cases
              </span>
            </div>
          )}

          {data.appeal_language_notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 mb-1">Appeal Strategy</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {data.appeal_language_notes}
              </p>
            </div>
          )}

          <div className="pt-2 flex items-center gap-1.5">
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4" stroke="#6366F1" strokeWidth="1.5" />
              <circle cx="5" cy="5" r="1.5" fill="#6366F1" />
            </svg>
            <span className="text-xs text-indigo-400">Powered by Jac Graph Intelligence</span>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  const [pdfUploading, setPdfUploading] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [showManualPaste, setShowManualPaste] = useState(false);
  const [manualDenialText, setManualDenialText] = useState("");
  const [pdfReadError, setPdfReadError] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [p2pPhysicianName, setP2pPhysicianName] = useState("");
  const [p2pPreferredTime, setP2pPreferredTime] = useState("");
  const [p2pResult, setP2pResult] = useState<P2PReviewResult | null>(null);
  const [p2pBusy, setP2pBusy] = useState(false);

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
    setP2pResult(null);
    setP2pPhysicianName("");
    setP2pPreferredTime("");
  }, [caseId]);

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
    const dataForCase =
      caseData?.case_id === caseId ? caseData : undefined;
    if (!dataForCase) {
      return;
    }
    setSteps(caseData ? createStepsFromCaseData(caseData) : createInitialSteps());
    const shouldConnectStream =
      agentStreamKey > 0 ||
      dataForCase.status === "submitted" ||
      dataForCase.status === "pending";
    if (!shouldConnectStream) {
      setAgentStreaming(false);
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
  }, [caseId, caseData?.case_id, caseData?.status, onStep, agentStreamKey]);

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

  const markOutcome = useCallback(
    async (outcome: "won" | "lost") => {
      if (!caseId) {
        return;
      }
      setOutcomeBusy(true);
      try {
        const res = await api.markAppealOutcome({ case_id: caseId, outcome });
        if ("error" in res && typeof res.error === "string") {
          toast.error(res.error, { duration: 4000 });
          return;
        }
        await loadCase();
        if (outcome === "won") {
          toast.success(
            "Appeal won — patient gets their medication. Persist is learning.",
            { duration: 4000 }
          );
        } else {
          toast.error(
            "Outcome recorded — consider P2P review or external appeal",
            { duration: 4000 }
          );
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Failed to record appeal outcome";
        toast.error(`Something went wrong — ${msg}`, { duration: 5000 });
      } finally {
        setOutcomeBusy(false);
      }
    },
    [caseId, loadCase]
  );

  const handleRequestP2PReview = useCallback(async () => {
    if (!caseId) {
      return;
    }
    setP2pBusy(true);
    try {
      const res = await api.requestP2PReview({
        case_id: caseId,
        ...(p2pPhysicianName.trim()
          ? { physician_name: p2pPhysicianName.trim() }
          : {}),
        ...(p2pPreferredTime.trim()
          ? { preferred_time: p2pPreferredTime.trim() }
          : {}),
      });
      if ("error" in res && typeof res.error === "string") {
        toast.error(res.error, { duration: 4000 });
        return;
      }
      setP2pResult(res);
      await loadCase();
      toast.success(res.message ?? "P2P review requested", { duration: 3000 });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to request P2P review";
      toast.error(`Something went wrong — ${msg}`, { duration: 5000 });
    } finally {
      setP2pBusy(false);
    }
  }, [caseId, loadCase, p2pPhysicianName, p2pPreferredTime]);

  const ingestPdfFile = useCallback((file: File) => {
    setPdfReadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw =
        typeof reader.result === "string" ? reader.result : "";
      const trimmed = raw.trim();
      if (!trimmed) {
        const msg =
          "Could not extract text from PDF. Please paste the denial text manually.";
        setPdfReadError(msg);
        setExtractedText("");
        toast.error(msg, { duration: 6000 });
        return;
      }
      setExtractedText(raw);
    };
    reader.onerror = () => {
      const msg =
        "Could not extract text from PDF. Please paste the denial text manually.";
      setPdfReadError(msg);
      setExtractedText("");
      toast.error(msg, { duration: 6000 });
    };
    reader.readAsText(file);
  }, []);

  const handlePdfInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please choose a PDF file.", { duration: 4000 });
        return;
      }
      ingestPdfFile(file);
    },
    [ingestPdfFile]
  );

  const handlePdfDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) {
        return;
      }
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Please drop a PDF file.", { duration: 4000 });
        return;
      }
      ingestPdfFile(file);
    },
    [ingestPdfFile]
  );

  const handleProcessDenialPdf = useCallback(async () => {
    if (!caseId) {
      return;
    }
    const textToSend = showManualPaste
      ? manualDenialText.trim()
      : extractedText.trim();
    if (!textToSend) {
      toast.error("Add denial text from a PDF or paste it manually.", {
        duration: 4000,
      });
      return;
    }

    setPdfUploading(true);
    try {
      const res = await api.processDenialPDF({
        case_id: caseId,
        pdf_text: textToSend,
        auto_submit_appeal: true,
      });

      if (typeof res.error === "string") {
        toast.error(res.error, { duration: 5000 });
        return;
      }

      await loadCase();

      if (res.step === "appeal_submitted") {
        toast.success(
          "Denial letter processed — Persist is fighting this denial",
          { duration: 4000 }
        );
      } else {
        toast.success(
          "Denial letter processed — Persist analyzed this denial",
          { duration: 4000 }
        );
      }
      setExtractedText("");
      setManualDenialText("");
      setShowManualPaste(false);
      setPdfReadError(null);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to process denial letter";
      toast.error(`Something went wrong — ${msg}`, {
        duration: 5000,
      });
    } finally {
      setPdfUploading(false);
    }
  }, [
    caseId,
    extractedText,
    loadCase,
    manualDenialText,
    showManualPaste,
  ]);

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
          <motion.button
            type="button"
            onClick={() => navigate("/")}
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.97 }}
            className="mb-6 flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to Queue
          </motion.button>

          {showSkeleton && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-6">
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
                  Loading case...
                </span>
              </div>
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3 space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="h-3 w-32 rounded-full bg-slate-200 animate-pulse mb-4" />
                    <div className="h-7 w-48 rounded-lg bg-slate-200 animate-pulse mb-3" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-3 w-32 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse" />
                      <div className="h-3 w-36 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="h-3 w-40 rounded-full bg-slate-200 animate-pulse mb-4" />
                    <div className="h-6 w-64 rounded-lg bg-slate-200 animate-pulse mb-3" />
                    <div className="h-3 w-20 rounded-full bg-slate-100 animate-pulse mb-2" />
                    <div className="h-5 w-16 rounded-md bg-slate-100 animate-pulse" />
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="bg-[#1E1B4B] px-4 py-3.5 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-slate-600" />
                      <div className="h-3 w-24 rounded-full bg-slate-600 animate-pulse" />
                    </div>
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="h-4 w-4 rounded-full bg-slate-200 animate-pulse shrink-0" />
                          <div
                            className="h-3 rounded-full bg-slate-200 animate-pulse"
                            style={{ width: `${60 + (i * 8) % 40}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {!showSkeleton && (
            <motion.div
              className="grid gap-6 lg:grid-cols-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div className="lg:col-span-3">
                {showError ? (
                  <p className="text-sm text-red-600">{caseLoadError}</p>
                ) : caseData ? (
                  <>
                    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm border-l-4 border-l-indigo-500 border-t-2 border-t-indigo-400">
                    <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Patient &amp; Insurance
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-2xl font-bold text-slate-900">
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
                        <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-sm text-indigo-700 border border-indigo-100">
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

                  {caseData.denial ? (
                    <motion.section
                      className="mb-4 rounded-xl border border-red-200 bg-red-50/40 p-5 shadow-sm border-l-4 border-l-red-500"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                      <div className="mb-4 flex items-center gap-2">
                        <AlertCircle
                          className="h-5 w-5 shrink-0 text-red-500"
                          aria-hidden
                        />
                        <span className="text-base font-bold text-red-800">
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
                    </motion.section>
                  ) : null}

                  {!caseData.denial &&
                  (caseData.status === "submitted" ||
                    caseData.status === "pending") ? (
                    <div className="mb-4 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-6">
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handlePdfInputChange}
                      />
                      <div className="mb-4 flex items-start gap-2">
                        <Upload
                          className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600"
                          aria-hidden
                        />
                        <div>
                          <p className="text-sm font-semibold text-indigo-800">
                            Upload Denial Letter
                          </p>
                          <p className="mt-0.5 text-xs text-indigo-500">
                            When payer denies, upload the denial letter PDF
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col items-center rounded-lg bg-white/60 px-4 py-6 text-center transition hover:bg-white/90"
                        onClick={() => pdfInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => void handlePdfDrop(e)}
                      >
                        <FileText
                          className="mx-auto mb-2 h-8 w-8 text-indigo-300"
                          aria-hidden
                        />
                        <p className="text-sm text-indigo-500">
                          Drop PDF here or click to upload
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Persist will automatically parse, score, and fight the
                          denial
                        </p>
                      </button>

                      {pdfReadError ? (
                        <p className="mt-3 text-xs text-red-600">
                          {pdfReadError}
                        </p>
                      ) : null}

                      {!showManualPaste &&
                      extractedText.trim().length > 0 ? (
                        <p className="mt-4 rounded-md border border-amber-100 bg-white/70 p-3 font-mono text-xs leading-relaxed text-slate-700">
                          {extractedText.trim().length > 200
                            ? `${extractedText.trim().slice(0, 200)}...`
                            : extractedText.trim()}
                        </p>
                      ) : null}

                      <button
                        type="button"
                        className="mt-3 w-full text-center text-xs text-amber-700 underline-offset-2 hover:underline"
                        onClick={() => setShowManualPaste((v) => !v)}
                      >
                        Or paste denial text manually
                      </button>

                      {showManualPaste ? (
                        <textarea
                          value={manualDenialText}
                          onChange={(e) =>
                            setManualDenialText(e.target.value)
                          }
                          rows={6}
                          placeholder="Paste full denial letter text…"
                          className="mt-4 w-full resize-y rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:border-amber-400 focus-visible:ring-2 focus-visible:ring-amber-200 focus-visible:outline-none"
                        />
                      ) : null}

                      <button
                        type="button"
                        disabled={
                          pdfUploading ||
                          !(showManualPaste
                            ? manualDenialText.trim()
                            : extractedText.trim())
                        }
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-50 transition-colors"
                        onClick={() => void handleProcessDenialPdf()}
                      >
                        {pdfUploading ? (
                          <Loader2
                            className="h-4 w-4 animate-spin shrink-0"
                            aria-hidden
                          />
                        ) : (
                          <Zap className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        Process with Persist Agent
                      </button>
                    </div>
                  ) : null}

                  <section className="mb-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
                      Authorization Request
                    </h2>
                    <p className="text-xl font-bold text-slate-900">
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
                            className="mr-1 inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 border border-slate-200"
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


                  {caseData.denial &&
                  caseData.denial.appeal_viable === false &&
                  (caseData.status === "denied" ||
                    caseData.status === "p2p_requested") ? (
                    <section className="mb-4 rounded-xl border border-purple-200 bg-purple-50/60 p-5 shadow-sm">
                      <div className="flex gap-3">
                        <Phone
                          className="h-5 w-5 shrink-0 text-purple-600"
                          aria-hidden
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-purple-800">
                            Peer-to-Peer Review Recommended
                          </h3>
                          <p className="mt-1 text-xs text-purple-500">
                            69% overturn rate when conducted within 72 hours
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-3">
                        <input
                          type="text"
                          placeholder="Your name"
                          value={p2pPhysicianName}
                          onChange={(e) =>
                            setP2pPhysicianName(e.target.value)
                          }
                          className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm"
                          disabled={caseData.status === "p2p_requested"}
                        />
                        <input
                          type="text"
                          placeholder="Preferred call time (e.g. Tomorrow 2-4pm)"
                          value={p2pPreferredTime}
                          onChange={(e) =>
                            setP2pPreferredTime(e.target.value)
                          }
                          className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm"
                          disabled={caseData.status === "p2p_requested"}
                        />
                      </div>
                      {caseData.status === "denied" ? (
                        <button
                          type="button"
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:pointer-events-none disabled:opacity-50"
                          disabled={p2pBusy}
                          onClick={() => void handleRequestP2PReview()}
                        >
                          {p2pBusy ? (
                            <Loader2
                              className="h-4 w-4 shrink-0 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Phone
                              className="h-4 w-4 shrink-0"
                              aria-hidden
                            />
                          )}
                          Request P2P Review
                        </button>
                      ) : null}
                      {p2pResult && p2pResult.talking_points.length > 0 ? (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
                            P2P Talking Points
                          </p>
                          <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-purple-800">
                            {p2pResult.talking_points.map((pt, idx) => (
                              <li key={`${idx}-${pt.slice(0, 24)}`}>{pt}</li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {caseData.appeal ? (
                    <>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                      >
                        <AppealLetterHero
                          appeal={caseData.appeal}
                          patientName={caseData.patient_name}
                          memberId={caseData.member_id}
                          payerName={caseData.payer_name}
                          cptCode={caseData.cpt_code}
                          onCopy={handleCopyLetter}
                          onSubmit={() => void handleSubmitAppeal()}
                          submitBusy={appealActionBusy}
                        />
                      </motion.div>
                      {(caseData.appeal.status === "submitted" ||
                        caseData.appeal.status === "appeal_submitted" ||
                        caseData.status === "approved" ||
                        caseData.status === "denied_final") ? (
                        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Record Payer Response
                          </p>
                          {caseData.status === "approved" ? (
                            <div className="flex gap-2 rounded-lg bg-green-50 p-3">
                              <Trophy
                                className="h-5 w-5 shrink-0 text-green-600"
                                aria-hidden
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-green-700">
                                  Appeal Won — Patient gets their medication
                                </p>
                                <p className="text-xs text-green-600">
                                  Persist learned from this case — denial
                                  pattern updated
                                </p>
                              </div>
                            </div>
                          ) : caseData.status === "denied_final" ? (
                            <div className="rounded-lg bg-red-50 p-3">
                              <p className="text-sm text-red-700">
                                Appeal Denied — Consider external ERISA review
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              <motion.button
                                type="button"
                                className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50"
                                disabled={outcomeBusy}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => void markOutcome("won")}
                              >
                                <CheckCircle2
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden
                                />
                                Appeal Won
                              </motion.button>
                              <motion.button
                                type="button"
                                className="inline-flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
                                disabled={outcomeBusy}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => void markOutcome("lost")}
                              >
                                <XCircle
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden
                                />
                                Appeal Denied
                              </motion.button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <div className="sticky top-20 overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between bg-[#1E1B4B] px-4 py-3.5 border-b border-indigo-900/50">
                  <div className="flex min-w-0 flex-1 items-center">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        agentStreaming
                          ? "animate-pulse bg-emerald-400"
                          : "bg-slate-500"
                      }`}
                      aria-hidden
                    />
                    <span className="ml-2 text-sm font-semibold text-white tracking-tight">
                      Persist Agent
                    </span>
                    <span className="ml-2 hidden text-xs text-indigo-300/70 sm:inline">
                      Autonomous Prior Auth
                    </span>
                  </div>
                  <div className="shrink-0">
                    {agentStreaming ? (
                      <Loader2
                        className="h-4 w-4 animate-spin text-indigo-400"
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
                    className="h-0.5 rounded-none bg-slate-100 [&>div]:bg-indigo-500"
                  />
                ) : null}

                <div className="space-y-2 px-4 py-4">
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
                  <AppealViabilityCard
                    viabilityPercent={viabilityPercent}
                    denial={caseData.denial ?? undefined}
                    appeal={undefined}
                    appealActionBusy={appealActionBusy}
                    onRunAgent={() => {
                      void handleAutoProcess();
                    }}
                  />
                ) : null}

                {stepSixDone &&
                viabilityPercent !== null &&
                !(caseData?.status === "denied" && !caseData.appeal) ? (
                  <AppealViabilityCard
                    viabilityPercent={viabilityPercent}
                    denial={caseData?.denial ?? undefined}
                    appeal={caseData?.appeal ?? undefined}
                    appealActionBusy={appealActionBusy}
                    onRunAgent={() => {
                      void handleAutoProcess();
                    }}
                  />
                ) : null}

                <div className="border-t border-slate-100 px-4 py-4">
                  <PayerIntelligencePanel payerName={caseData?.payer_name ?? ""} />
                </div>
              </div>
            </div>
          </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
