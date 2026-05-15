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
    has hours_pending: float = 0.0;
    has cms_deadline_72hr: bool = False;
    has cms_deadline_7day: bool = False;
    has follow_up_required: bool = False;
    has payer_response_received: bool = False;
    has is_expedited: bool = False;
    has submitted_at: str = "";
    has escalation_triggered: bool = False;
    has escalation_reason: str = "";
    has escalation_timestamp: str = "";
}

node PayerProfile {
    has payer_id: str;
    has payer_name: str;
    has criteria_engine: str;
    has avg_denial_rate: float = 0.0;
    has avg_appeal_overturn_rate: float = 0.0;
    has step_therapy_required: bool = False;
    has expedited_timeline_hours: int = 72;
    has standard_timeline_days: int = 7;
    has appeal_language_notes: str = "";
    has common_denial_reasons: list[str] = [];
}

node DenialPattern {
    has pattern_id: str;
    has payer_name: str;
    has cpt_code: str;
    has denial_type: str;
    has criterion_failed: str;
    has successful_appeal_language: str = "";
    has times_seen: int = 1;
    has times_won: int = 0;
    has win_rate: float = 0.0;
}

node PreSubmissionAudit {
    has audit_id: str;
    has payer_name: str;
    has cpt_code: str;
    has criteria_engine: str;
    has gaps_detected: list[str];
    has gaps_critical: list[str];
    has gaps_recommended: list[str];
    has submission_ready: bool = False;
    has confidence_score: float = 0.0;
    has audit_timestamp: str = "";
    has estimated_approval_probability: float = 0.0;
}

# Typed edges
edge HasRequest { has created_at: str = ""; }
edge HasDenial  { has detected_at: str = ""; }
edge HasAppeal  { has filed_at: str = ""; }
edge HasMonitor {}
edge NextStep   {}
edge HasPayerProfile {}
edge HasDenialPattern {}
edge HasAudit {}
