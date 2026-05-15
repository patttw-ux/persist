import from byllm.lib { Model }

glob llm = Model(model_name="claude-sonnet-4-20250514");

# Structured output types for byLLM
obj DenialAnalysis {
    has denial_type: str;
    has criterion_failed: str;
    has missing_documentation: list[str];
    has appeal_strategy: str;
    has denial_reason_summary: str;
}

obj AppealLetter {
    has subject_line: str;
    has opening_paragraph: str;
    has clinical_justification: str;
    has evidence_cited: list[str];
    has closing_paragraph: str;
    has full_letter: str;
}

obj PreSubmissionAuditResult {
    has gaps_critical: list[str];
    has gaps_recommended: list[str];
    has submission_ready: bool;
    has confidence_score: float;
    has estimated_approval_probability: float;
    has audit_summary: str;
}

# Ability 1: Parse denial letter into structured analysis
sem analyze_denial = "Analyzes a prior authorization denial letter using payer-specific criteria knowledge";
sem analyze_denial.denial_text = "The complete text of the payer denial letter including reason codes and narrative";
sem analyze_denial.payer_name = "Name of the insurance payer";
sem analyze_denial.payer_criteria_engine = "The clinical criteria engine this payer uses: InterQual for UHC, AIM Specialty Health for BCBS, Clinical Policy Bulletins for Aetna, proprietary for Cigna";
sem analyze_denial.payer_appeal_notes = "Payer-specific appeal strategy notes including what language works, what criteria to cite, and common winning patterns";
sem analyze_denial.cpt_code = "The CPT or HCPCS procedure code that was denied";
sem analyze_denial.patient_diagnosis = "The primary ICD-10 diagnosis code and description";
sem analyze_denial.return = "Structured analysis using payer-specific criteria knowledge including denial type, failed criterion, missing documentation, appeal strategy, and denial summary";
def analyze_denial(
    denial_text: str,
    payer_name: str,
    payer_criteria_engine: str,
    payer_appeal_notes: str,
    cpt_code: str,
    patient_diagnosis: str
) -> DenialAnalysis by llm();

# Ability 2: Draft formal appeal letter
sem draft_appeal_letter = "Drafts a complete formal prior authorization appeal letter using payer-specific criteria and winning language patterns";
sem draft_appeal_letter.denial_analysis = "Structured analysis of the denial";
sem draft_appeal_letter.patient_name = "Full legal name of the patient";
sem draft_appeal_letter.drug_or_service = "The medication or service being requested";
sem draft_appeal_letter.diagnosis = "The clinical diagnosis with ICD-10 code";
sem draft_appeal_letter.treatment_history = "Prior treatments attempted including step therapy failures";
sem draft_appeal_letter.clinical_evidence = "Supporting clinical evidence including lab values and scores";
sem draft_appeal_letter.payer_name = "Insurance payer name for payer-specific language";
sem draft_appeal_letter.criteria_engine = "Clinical criteria engine: InterQual, AIM, CPB, or proprietary";
sem draft_appeal_letter.appeal_language_notes = "Payer-specific winning appeal language patterns and what criteria to cite";
sem draft_appeal_letter.return = "Complete formal appeal letter using payer-specific language that matches what this payer reviewers look for";
def draft_appeal_letter(
    denial_analysis: DenialAnalysis,
    patient_name: str,
    drug_or_service: str,
    diagnosis: str,
    treatment_history: str,
    clinical_evidence: str,
    payer_name: str,
    criteria_engine: str,
    appeal_language_notes: str
) -> AppealLetter by llm();

# Ability 3: Score appeal viability (deterministic baseline + LLM refinement)
sem score_appeal_viability.denial_type = "Category of denial: medical_necessity step_therapy administrative or non_covered";
sem score_appeal_viability.criterion_failed = "The specific criterion the payer said was not met";
sem score_appeal_viability.documentation_available = "List of clinical documents available to support the appeal such as lab results physician notes treatment history";
sem score_appeal_viability.return = "Appeal viability score from 0.0 to 1.0 where 0.82 baseline for medical_necessity 0.78 for step_therapy 0.95 for administrative and 0.05 for non_covered per AMA 2024 survey data showing 81.7% overall overturn rate";
def score_appeal_viability(
    denial_type: str,
    criterion_failed: str,
    documentation_available: list[str]
) -> float by llm();

# Ability 4: Pre-submission gap audit (prior to PA submission)
sem audit_submission_gaps = "Audits a prior authorization request against payer-specific criteria before submission to identify documentation gaps that would cause denial";
sem audit_submission_gaps.payer_name = "Insurance payer name such as UnitedHealthcare or BCBS";
sem audit_submission_gaps.criteria_engine = "Clinical criteria engine this payer uses: InterQual for UHC, AIM for BCBS, CPB for Aetna";
sem audit_submission_gaps.appeal_language_notes = "Payer-specific criteria requirements and common denial reasons";
sem audit_submission_gaps.cpt_code = "CPT or HCPCS procedure code being requested";
sem audit_submission_gaps.diagnosis_codes = "ICD-10 diagnosis codes supporting the request";
sem audit_submission_gaps.drug_name = "Medication or service name being requested";
sem audit_submission_gaps.treatment_history = "Prior treatments attempted including step therapy history";
sem audit_submission_gaps.clinical_notes = "Any additional clinical documentation available";
sem audit_submission_gaps.return = "Structured audit result identifying critical gaps that will cause denial, recommended improvements, whether submission is ready, and estimated approval probability";
def audit_submission_gaps(
    payer_name: str,
    criteria_engine: str,
    appeal_language_notes: str,
    cpt_code: str,
    diagnosis_codes: list[str],
    drug_name: str,
    treatment_history: str,
    clinical_notes: str
) -> PreSubmissionAuditResult by llm();
