import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const PAYER_OPTIONS = [
  "UnitedHealthcare",
  "Blue Cross Blue Shield",
  "Aetna",
  "Cigna",
  "Humana",
  "Medicare Advantage",
  "Medicaid",
  "Other",
] as const;

type FieldKey = "patient_name" | "dob" | "member_id" | "payer_name";

interface NewPASheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const initialForm = {
  patient_name: "",
  dob: "",
  member_id: "",
  payer_name: "",
  cpt_code: "",
  drug_name: "",
  diagnosis_icd10: "",
  treatment_history: "",
};

type FormState = typeof initialForm;

function inputClass(hasError: boolean): string {
  return [
    "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-offset-white placeholder:text-slate-400",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
    hasError ? "border-red-500" : "border-slate-200",
  ].join(" ");
}

export function NewPASheet({ open, onOpenChange, onSuccess }: NewPASheetProps) {
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setFieldErrors({});
      setSubmitError(null);
    }
  }, [open]);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    const fk = key as FieldKey;
    if (
      fk === "patient_name" ||
      fk === "dob" ||
      fk === "member_id" ||
      fk === "payer_name"
    ) {
      setFieldErrors((e) => {
        if (!e[fk]) {
          return e;
        }
        const next = { ...e };
        delete next[fk];
        return next;
      });
    }
  }

  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!form.patient_name.trim()) {
      next.patient_name = "Required";
    }
    if (!form.dob) {
      next.dob = "Required";
    }
    if (!form.member_id.trim()) {
      next.member_id = "Required";
    }
    if (!form.payer_name.trim()) {
      next.payer_name = "Required";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) {
      return;
    }

    const diagnosis_codes = form.diagnosis_icd10.trim()
      ? [form.diagnosis_icd10.trim()]
      : [];

    setSubmitting(true);
    try {
      await api.submitPA({
        patient_name: form.patient_name.trim(),
        patient_id: crypto.randomUUID(),
        dob: form.dob,
        payer_name: form.payer_name.trim(),
        member_id: form.member_id.trim(),
        cpt_code: form.cpt_code.trim(),
        drug_name: form.drug_name.trim(),
        diagnosis_codes,
        treatment_history: form.treatment_history.trim(),
      });
      toast.success("Prior auth submitted — Persist is monitoring");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Submission failed. Try again.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-lg flex-col overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-left text-lg font-semibold text-slate-900">
            New Prior Authorization Request
          </SheetTitle>
          <SheetDescription className="mt-1 text-left text-sm text-slate-500">
            Persist will handle submission, monitoring, and appeals automatically
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="newpa-patient_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Patient Name
            </label>
            <input
              id="newpa-patient_name"
              value={form.patient_name}
              onChange={(e) => handleChange("patient_name", e.target.value)}
              placeholder="Full legal name"
              className={inputClass(Boolean(fieldErrors.patient_name))}
              aria-invalid={Boolean(fieldErrors.patient_name)}
            />
            {fieldErrors.patient_name ? (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.patient_name}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="newpa-dob"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Date of Birth
            </label>
            <input
              id="newpa-dob"
              type="date"
              value={form.dob}
              onChange={(e) => handleChange("dob", e.target.value)}
              className={inputClass(Boolean(fieldErrors.dob))}
              aria-invalid={Boolean(fieldErrors.dob)}
            />
            {fieldErrors.dob ? (
              <p className="mt-1 text-sm text-red-600">{fieldErrors.dob}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="newpa-member_id"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Member ID
            </label>
            <input
              id="newpa-member_id"
              value={form.member_id}
              onChange={(e) => handleChange("member_id", e.target.value)}
              placeholder="Insurance member ID"
              className={`${inputClass(Boolean(fieldErrors.member_id))} font-mono`}
              aria-invalid={Boolean(fieldErrors.member_id)}
            />
            {fieldErrors.member_id ? (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.member_id}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="newpa-payer_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Payer
            </label>
            <select
              id="newpa-payer_name"
              value={form.payer_name}
              onChange={(e) => handleChange("payer_name", e.target.value)}
              className={inputClass(Boolean(fieldErrors.payer_name))}
              aria-invalid={Boolean(fieldErrors.payer_name)}
            >
              <option value="" disabled>
                Select payer…
              </option>
              {PAYER_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {fieldErrors.payer_name ? (
              <p className="mt-1 text-sm text-red-600">
                {fieldErrors.payer_name}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="newpa-cpt_code"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              CPT/HCPCS Code
            </label>
            <input
              id="newpa-cpt_code"
              value={form.cpt_code}
              onChange={(e) => handleChange("cpt_code", e.target.value)}
              placeholder="e.g. J0135"
              className={`${inputClass(false)} font-mono`}
            />
          </div>

          <div>
            <label
              htmlFor="newpa-drug_name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Drug / Service Name
            </label>
            <input
              id="newpa-drug_name"
              value={form.drug_name}
              onChange={(e) => handleChange("drug_name", e.target.value)}
              placeholder="e.g. Adalimumab 40mg (Humira)"
              className={inputClass(false)}
            />
          </div>

          <div>
            <label
              htmlFor="newpa-diagnosis"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Primary Diagnosis (ICD-10)
            </label>
            <input
              id="newpa-diagnosis"
              value={form.diagnosis_icd10}
              onChange={(e) => handleChange("diagnosis_icd10", e.target.value)}
              placeholder="e.g. M05.79"
              className={`${inputClass(false)} font-mono`}
            />
          </div>

          <div>
            <label
              htmlFor="newpa-treatment_history"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Treatment History
            </label>
            <textarea
              id="newpa-treatment_history"
              rows={4}
              value={form.treatment_history}
              onChange={(e) =>
                handleChange("treatment_history", e.target.value)
              }
              placeholder="Prior treatments attempted, duration, and outcomes..."
              className="flex min-h-[100px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Submitting...
                </>
              ) : (
                "Submit to Persist Agent"
              )}
            </button>
            {submitError ? (
              <p className="mt-2 text-center text-sm text-red-600">
                {submitError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-2 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
