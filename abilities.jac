import from byllm.lib { Model }
import from anthropic { Anthropic }
import json;
import re;
import from typing { cast }

glob llm = Model(model_name="claude-sonnet-4-20250514");
glob anthropic_client = Anthropic();

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

obj ClinicalNoteExtraction {
    has patient_name: str;
    has patient_dob: str;
    has member_id: str;
    has cpt_code: str;
    has drug_name: str;
    has diagnosis_codes: list[str];
    has treatment_history: str;
    has clinical_notes: str;
}

def extract_clinical_note(
    clinical_note_text: str,
    payer_name: str
) -> ClinicalNoteExtraction {
    response: any = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": "Extract structured data from this clinical note for prior authorization. Return ONLY raw JSON with these exact fields: patient_name (string), patient_dob (string YYYY-MM-DD format), member_id (string), cpt_code (string, most relevant procedure code), drug_name (string, medication or service name), diagnosis_codes (array of ICD-10 strings), treatment_history (string, summary of prior treatments), clinical_notes (string, relevant clinical findings). If any field cannot be determined return empty string or empty array.\n\nPayer: " + payer_name + "\n\nClinical Note:\n" + clinical_note_text
        }]
    );
    text: str = cast(str, response.content[0].text);
    json_match: any = re.search(r'\{.*\}', text, re.DOTALL);
    clean_json: str = cast(str, json_match.group(0)) if json_match else text;
    data: any = json.loads(clean_json);
    return ClinicalNoteExtraction(
        patient_name=cast(str, data.get("patient_name", "")),
        patient_dob=cast(str, data.get("patient_dob", "")),
        member_id=cast(str, data.get("member_id", "")),
        cpt_code=cast(str, data.get("cpt_code", "")),
        drug_name=cast(str, data.get("drug_name", "")),
        diagnosis_codes=cast(list[str], data.get("diagnosis_codes", [])),
        treatment_history=cast(str, data.get("treatment_history", "")),
        clinical_notes=cast(str, data.get("clinical_notes", ""))
    );
}

def analyze_denial(
    denial_text: str,
    payer_name: str,
    cpt_code: str,
    patient_diagnosis: str
) -> DenialAnalysis {
    response: any = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{"role": "user", "content": "Return ONLY raw JSON no markdown. Fields: denial_type (medical_necessity/step_therapy/administrative/non_covered), criterion_failed, missing_documentation (array), appeal_strategy, denial_reason_summary. Payer: " + payer_name + " CPT: " + cpt_code + " Diagnosis: " + patient_diagnosis + " Letter: " + denial_text}]
    );
    text: str = cast(str, response.content[0].text);
    json_match: any = re.search(r'\{.*\}', text, re.DOTALL);
    clean_json: str = cast(str, json_match.group(0)) if json_match else text;
    data: any = json.loads(clean_json);
    return DenialAnalysis(
        denial_type=cast(str, data.get("denial_type", "medical_necessity")),
        criterion_failed=cast(str, data.get("criterion_failed", "")),
        missing_documentation=cast(list[str], data.get("missing_documentation", [])),
        appeal_strategy=cast(str, data.get("appeal_strategy", "")),
        denial_reason_summary=cast(str, data.get("denial_reason_summary", ""))
    );
}

def draft_appeal_letter(
    denial_analysis: DenialAnalysis,
    patient_name: str,
    drug_or_service: str,
    diagnosis: str,
    treatment_history: str,
    clinical_evidence: str
) -> AppealLetter {
    prompt: str = "Return ONLY raw JSON no markdown. Fields: subject_line, opening_paragraph, clinical_justification, evidence_cited (array), closing_paragraph, full_letter. Patient: " + patient_name + " Service: " + drug_or_service + " Diagnosis: " + diagnosis + " Denial: " + denial_analysis.denial_type + " Criterion: " + denial_analysis.criterion_failed + " History: " + treatment_history;
    response: any = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    );
    text: str = cast(str, response.content[0].text);
    json_match: any = re.search(r'\{.*\}', text, re.DOTALL);
    clean_json: str = cast(str, json_match.group(0)) if json_match else text;
    data: any = json.loads(clean_json);
    return AppealLetter(
        subject_line=cast(str, data.get("subject_line", "")),
        opening_paragraph=cast(str, data.get("opening_paragraph", "")),
        clinical_justification=cast(str, data.get("clinical_justification", "")),
        evidence_cited=cast(list[str], data.get("evidence_cited", [])),
        closing_paragraph=cast(str, data.get("closing_paragraph", "")),
        full_letter=cast(str, data.get("full_letter", ""))
    );
}

def score_appeal_viability(
    denial_type: str,
    criterion_failed: str,
    documentation_available: list[str]
) -> float {
    if denial_type == "medical_necessity" { return 0.82; }
    elif denial_type == "step_therapy" { return 0.78; }
    elif denial_type == "administrative" { return 0.95; }
    else { return 0.05; }
}