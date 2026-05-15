node PatientCase {
    has patient_id: str;
    has patient_name: str;
    has dob: str;
    has payer_name: str;
    has member_id: str;
    has created_at: str;
    has status: str = "active";
}

node PARequest {
    has req_id: str;
    has cpt_code: str;
    has drug_name: str;
    has diagnosis_codes: list[str];
    has created_at: str;
    has treatment_history: str = "";
    has status: str = "submitted";
    has submitted_at: str = "";
    has preauth_ref: str = "";
    has payer_response: str = "";
    has priority: int = 1;
}

node DenialRecord {
    has denial_id: str;
    has raw_denial_text: str;
    has denial_type: str;
    has criterion_failed: str;
    has missing_documentation: list[str];
    has appeal_strategy: str;
    has denial_reason_summary: str;
    has denial_date: str;
    has appeal_viability_score: float = 0.0;
    has appeal_viable: bool = False;
}

node AppealRecord {
    has appeal_id: str;
    has subject_line: str;
    has opening_paragraph: str;
    has clinical_justification: str;
    has evidence_cited: list[str];
    has closing_paragraph: str;
    has full_letter: str;
    has appeal_type: str;
    has status: str = "drafted";
    has submitted_at: str = "";
    has filed_at: str = "";
}

node MonitorStatus {
    has last_checked: str;
    has days_pending: int = 0;
    has cms_deadline_72hr: bool = False;
    has cms_deadline_7day: bool = False;
    has follow_up_required: bool = False;
    has payer_response_received: bool = False;
}

# Typed edges
edge HasRequest { has created_at: str = ""; }
edge HasDenial  { has detected_at: str = ""; }
edge HasAppeal  { has filed_at: str = ""; }
edge HasMonitor {}
edge NextStep   {}
