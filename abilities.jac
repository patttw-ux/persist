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

# Ability 1: Parse denial letter into structured analysis
sem analyze_denial = "Analyzes a prior authorization denial letter and extracts structured clinical information sufficient to draft a winning appeal";
sem analyze_denial.denial_text = "The complete text of the payer denial letter including reason codes CO-50 or CO-97 and narrative explanation";
sem analyze_denial.payer_name = "Name of the insurance payer such as UnitedHealthcare using InterQual criteria or BCBS using AIM Specialty Health criteria";
sem analyze_denial.cpt_code = "The CPT or HCPCS procedure code that was denied such as J0135 for adalimumab";
sem analyze_denial.patient_diagnosis = "The primary ICD-10 diagnosis code and description such as M05.79 rheumatoid arthritis";
sem analyze_denial.return = "Structured analysis including denial type (medical_necessity/step_therapy/administrative/non_covered), the exact criterion that was not met, list of missing documentation items, recommended appeal strategy, and plain English summary of why it was denied";
def analyze_denial(
    denial_text: str,
    payer_name: str,
    cpt_code: str,
    patient_diagnosis: str
) -> DenialAnalysis by llm();

# Ability 2: Draft formal appeal letter
sem draft_appeal_letter = "Drafts a complete formal prior authorization appeal letter ready for submission to the payer that will overturn the denial";
sem draft_appeal_letter.denial_analysis = "The structured analysis of why the PA was denied including denial type and failed criterion";
sem draft_appeal_letter.patient_name = "Full legal name of the patient";
sem draft_appeal_letter.drug_or_service = "The medication name or medical service being requested such as adalimumab 40mg Humira";
sem draft_appeal_letter.diagnosis = "The clinical diagnosis with ICD-10 code justifying this treatment";
sem draft_appeal_letter.treatment_history = "Prior treatments attempted including step therapy failures with drug names dates doses and outcomes";
sem draft_appeal_letter.clinical_evidence = "Supporting clinical evidence including lab values validated scores such as DAS28-CRP or PHQ-9 imaging findings and specialty society guidelines that support medical necessity";
sem draft_appeal_letter.return = "A complete formal appeal letter following ERISA requirements with subject line opening paragraph citing the specific denial criterion point-by-point rebuttal clinical justification table of prior treatments evidence citations and respectful closing requesting expedited review";
def draft_appeal_letter(
    denial_analysis: DenialAnalysis,
    patient_name: str,
    drug_or_service: str,
    diagnosis: str,
    treatment_history: str,
    clinical_evidence: str
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
