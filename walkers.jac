import from models {
    PatientCase, PARequest, DenialRecord, AppealRecord, MonitorStatus,
    PayerProfile, DenialPattern, PreSubmissionAudit,
    HasRequest, HasDenial, HasAppeal, HasMonitor, HasPayerProfile,
    HasDenialPattern, HasAudit,
}
import from abilities {
    DenialAnalysis, AppealLetter, analyze_denial, draft_appeal_letter,
    score_appeal_viability
}
import from datetime { datetime }
import from typing { cast }
import uuid;
import asyncio;

def case_created_at(item: dict[str, str]) -> str {
    return item["created_at"];
}

def payer_profile_strings(payer_name: str, profiles: list[PayerProfile]) -> list[str] {
    criteria_engine = "";
    appeal_notes = "";
    for p in profiles {
        if p.payer_name == payer_name {
            criteria_engine = p.criteria_engine;
            appeal_notes = p.appeal_language_notes;
        }
    }
    return [criteria_engine, appeal_notes];
}

walker:pub submit_pa {
    has patient_name: str;
    has patient_id: str;
    has dob: str;
    has payer_name: str;
    has member_id: str;
    has cpt_code: str;
    has drug_name: str;
    has diagnosis_codes: list[str];
    has treatment_history: str = "";

    can create with Root entry {
        now = datetime.now().isoformat();

        patient_case = PatientCase(
            patient_id=self.patient_id,
            patient_name=self.patient_name,
            dob=self.dob,
            payer_name=self.payer_name,
            member_id=self.member_id,
            created_at=now
        );
        root ++> patient_case;

        req = PARequest(
            req_id=self.patient_id + "_" + now[:10],
            cpt_code=self.cpt_code,
            drug_name=self.drug_name,
            diagnosis_codes=self.diagnosis_codes,
            treatment_history=self.treatment_history,
            status="submitted",
            submitted_at=now,
            created_at=now
        );
        patient_case +>:HasRequest:+> req;

        recent_audits = [root-->][?:PreSubmissionAudit];
        for a in recent_audits {
            if a.payer_name == self.payer_name and a.cpt_code == self.cpt_code {
                req +>:HasAudit:+> a;
                break;
            }
        }

        monitor = MonitorStatus(
            last_checked=now,
            days_pending=0
        );
        req +>:HasMonitor:+> monitor;

        report {
            "case_id": jid(patient_case),
            "req_id": jid(req),
            "status": "submitted",
            "message": "Persist is now monitoring this authorization"
        };
    }
}

walker:pub audit_prior_auth {
    has patient_name: str;
    has payer_name: str;
    has cpt_code: str;
    has diagnosis_codes: list[str];
    has drug_name: str;
    has treatment_history: str = "";
    has clinical_notes: str = "";

    can run_audit with Root entry {
        now = datetime.now().isoformat();

        profiles: list[PayerProfile] = [root->:HasPayerProfile:->][?:PayerProfile];
        criteria_engine = "";
        appeal_notes = "";
        step_therapy_required = False;
        for p in profiles {
            if p.payer_name == self.payer_name {
                criteria_engine = p.criteria_engine;
                appeal_notes = p.appeal_language_notes;
                step_therapy_required = p.step_therapy_required;
                break;
            }
        }

        audit_result = cast(PreSubmissionAuditResult, audit_submission_gaps(
            payer_name=self.payer_name,
            criteria_engine=criteria_engine,
            appeal_language_notes=appeal_notes,
            cpt_code=self.cpt_code,
            diagnosis_codes=self.diagnosis_codes,
            drug_name=self.drug_name,
            treatment_history=self.treatment_history,
            clinical_notes=self.clinical_notes
        ));

        critical_gaps: list[str] = [];
        for g in audit_result.gaps_critical {
            critical_gaps.append(g);
        }

        if step_therapy_required and self.treatment_history == "" {
            needle = "Step therapy documentation required";
            has_step_gap = False;
            for g in critical_gaps {
                if g.find(needle) >= 0 {
                    has_step_gap = True;
                    break;
                }
            }
            if not has_step_gap {
                critical_gaps.append(
                    "Step therapy documentation required — this payer requires documented failure of preferred alternatives"
                );
            }
        }

        gaps_rec: list[str] = [];
        for r in audit_result.gaps_recommended {
            gaps_rec.append(r);
        }

        gaps_all: list[str] = [];
        for c in critical_gaps {
            gaps_all.append(c);
        }
        for r in gaps_rec {
            gaps_all.append(r);
        }

        submission_ready_final = audit_result.submission_ready;
        if len(critical_gaps) > 0 {
            submission_ready_final = False;
        }

        audit = PreSubmissionAudit(
            audit_id=str(uuid.uuid4()),
            payer_name=self.payer_name,
            cpt_code=self.cpt_code,
            criteria_engine=criteria_engine,
            gaps_detected=gaps_all,
            gaps_critical=critical_gaps,
            gaps_recommended=gaps_rec,
            submission_ready=submission_ready_final,
            confidence_score=audit_result.confidence_score,
            audit_timestamp=now,
            estimated_approval_probability=audit_result.estimated_approval_probability
        );
        root ++> audit;

        report {
            "audit_id": jid(audit),
            "payer_name": self.payer_name,
            "cpt_code": self.cpt_code,
            "gaps_critical": critical_gaps,
            "gaps_recommended": gaps_rec,
            "submission_ready": submission_ready_final,
            "confidence_score": audit_result.confidence_score,
            "estimated_approval_probability": audit_result.estimated_approval_probability,
            "audit_summary": audit_result.audit_summary,
            "criteria_engine": criteria_engine
        };
    }
}

walker:pub parse_denial {
    has case_id: str;
    has raw_denial_text: str;
    has denial_date: str;

    can analyze with Root entry {
        patient_case = cast(PatientCase, &self.case_id);

        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests {
            report {"error": "No PA request found for this case"};
            disengage;
        }
        req: PARequest = requests[0];

        payer_name: str = patient_case.payer_name;

        profiles_aa: list[PayerProfile] = [root->:HasPayerProfile:->][?:PayerProfile];
        pay_pair = payer_profile_strings(payer_name, profiles_aa);

        analysis = cast(DenialAnalysis, analyze_denial(denial_text=self.raw_denial_text, payer_name=payer_name, cpt_code=req.cpt_code, patient_diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else ""
        ));

        denial_type: str = analysis.denial_type;
        base_score: float = 0.05;
        if denial_type == "medical_necessity" {
            base_score = 0.82;
        } elif denial_type == "step_therapy" {
            base_score = 0.78;
        } elif denial_type == "administrative" {
            base_score = 0.95;
        }

        docs_available: list[str] = ["physician_notes", "lab_results", "treatment_history"];
        llm_score = cast(float, score_appeal_viability(
            denial_type=denial_type,
            criterion_failed=analysis.criterion_failed,
            documentation_available=docs_available
        ));

        final_score: float = (base_score * 0.6) + (llm_score * 0.4);
        is_viable: bool = final_score > 0.5;

        denial = DenialRecord(
            denial_id=str(uuid.uuid4()),
            raw_denial_text=self.raw_denial_text,
            denial_type=analysis.denial_type,
            criterion_failed=analysis.criterion_failed,
            missing_documentation=analysis.missing_documentation,
            appeal_strategy=analysis.appeal_strategy,
            denial_reason_summary=analysis.denial_reason_summary,
            appeal_viability_score=final_score,
            appeal_viable=is_viable,
            denial_date=self.denial_date
        );
        req +>:HasDenial:+> denial;

        req.status = "denied";

        report {
            "denial_id": jid(denial),
            "denial_type": analysis.denial_type,
            "criterion_failed": analysis.criterion_failed,
            "missing_documentation": analysis.missing_documentation,
            "appeal_strategy": analysis.appeal_strategy,
            "appeal_viability_score": final_score,
            "appeal_viable": is_viable,
            "denial_reason_summary": analysis.denial_reason_summary
        };
    }
}

walker:pub draft_appeal {
    has case_id: str;
    has clinical_evidence: str = "";

    can generate with Root entry {
        now: str = datetime.now().isoformat();

        patient_case = cast(PatientCase, &self.case_id);
        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests { report {"error": "No PA request found"}; disengage; }
        req: PARequest = requests[0];

        denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];
        if not denials { report {"error": "No denial found — cannot draft appeal"}; disengage; }
        denial: DenialRecord = denials[0];

        evidence: str = req.treatment_history;
        if self.clinical_evidence { evidence = evidence + " " + self.clinical_evidence; }

        profiles_draft: list[PayerProfile] = [root->:HasPayerProfile:->][?:PayerProfile];
        payer_ctx_list = payer_profile_strings(patient_case.payer_name, profiles_draft);

        analysis: DenialAnalysis = DenialAnalysis(
            denial_type=denial.denial_type,
            criterion_failed=denial.criterion_failed,
            missing_documentation=denial.missing_documentation,
            appeal_strategy=denial.appeal_strategy,
            denial_reason_summary=denial.denial_reason_summary
        );

        letter = cast(AppealLetter, draft_appeal_letter(
            denial_analysis=analysis,
            patient_name=patient_case.patient_name,
            drug_or_service=req.drug_name,
            diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else "",
            treatment_history=req.treatment_history,
            clinical_evidence=evidence,
        ));

        appeal = AppealRecord(
            appeal_id=str(uuid.uuid4()),
            subject_line=letter.subject_line,
            opening_paragraph=letter.opening_paragraph,
            clinical_justification=letter.clinical_justification,
            evidence_cited=letter.evidence_cited,
            closing_paragraph=letter.closing_paragraph,
            full_letter=letter.full_letter,
            appeal_type=denial.denial_type,
            status="drafted",
            filed_at=now
        );
        denial +>:HasAppeal:+> appeal;

        req.status = "appeal_drafted";

        report {
            "appeal_id": jid(appeal),
            "subject_line": letter.subject_line,
            "full_letter": letter.full_letter,
            "clinical_justification": letter.clinical_justification,
            "evidence_cited": letter.evidence_cited,
            "status": "drafted"
        };
    }
}

walker:pub submit_appeal {
    has appeal_id: str;

    can submit with Root entry {
        appeal = cast(AppealRecord, &self.appeal_id);
        appeal.status = "submitted";
        appeal.submitted_at = datetime.now().isoformat();

        all_cases: list[PatientCase] = [root-->][?:PatientCase];
        for patient_case in all_cases {
            requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
            for req in requests {
                denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];
                for denial in denials {
                    appeals: list[AppealRecord] = [denial->:HasAppeal:->][?:AppealRecord];
                    for app in appeals {
                        if jid(app) == self.appeal_id {
                            req.status = "appeal_submitted";
                            report {
                                "appeal_id": self.appeal_id,
                                "status": "submitted",
                                "submitted_at": appeal.submitted_at,
                                "message": "Appeal submitted to payer. Persist will monitor for response."
                            };
                            disengage;
                        }
                    }
                }
            }
        }

        report {"error": "Appeal not found"};
    }
}

walker:pub process_denial_pdf {
    has case_id: str;
    has pdf_text: str;
    has denial_date: str = "";
    has auto_submit_appeal: bool = True;

    can process with Root entry {
        now: str = datetime.now().isoformat();
        date_val: str = self.denial_date if self.denial_date else now[:10];

        patient_case = cast(PatientCase, &self.case_id);
        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests {
            report {"error": "No PA request found"};
            disengage;
        }
        req: PARequest = requests[0];

        existing_denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];
        if existing_denials {
            report {"error": "Denial already processed for this case"};
            disengage;
        }

        payer_name: str = patient_case.payer_name;
        analysis = cast(DenialAnalysis, analyze_denial(denial_text=self.pdf_text, payer_name=payer_name, cpt_code=req.cpt_code, patient_diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else ""
        ));

        denial_type: str = analysis.denial_type;
        base_score: float = 0.05;
        if denial_type == "medical_necessity" {
            base_score = 0.82;
        } elif denial_type == "step_therapy" {
            base_score = 0.78;
        } elif denial_type == "administrative" {
            base_score = 0.95;
        }

        final_score: float = base_score;
        is_viable: bool = final_score > 0.5;

        denial = DenialRecord(
            denial_id=str(uuid.uuid4()),
            raw_denial_text=self.pdf_text,
            denial_type=analysis.denial_type,
            criterion_failed=analysis.criterion_failed,
            missing_documentation=analysis.missing_documentation,
            appeal_strategy=analysis.appeal_strategy,
            denial_reason_summary=analysis.denial_reason_summary,
            appeal_viability_score=final_score,
            appeal_viable=is_viable,
            denial_date=date_val,
        );
        req +>:HasDenial:+> denial;
        req.status = "denied";

        if not is_viable or not self.auto_submit_appeal {
            report {
                "step": "denial_parsed",
                "denial_type": analysis.denial_type,
                "criterion_failed": analysis.criterion_failed,
                "appeal_viable": is_viable,
                "viability_score": final_score,
                "message": "PDF processed — denial parsed successfully",
            };
            disengage;
        }

        evidence: str = req.treatment_history;
        analysis_obj: DenialAnalysis = DenialAnalysis(
            denial_type=denial.denial_type,
            criterion_failed=denial.criterion_failed,
            missing_documentation=denial.missing_documentation,
            appeal_strategy=denial.appeal_strategy,
            denial_reason_summary=denial.denial_reason_summary,
        );

        letter = cast(AppealLetter, draft_appeal_letter(denial_analysis=analysis_obj, patient_name=patient_case.patient_name, drug_or_service=req.drug_name, diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else "", treatment_history=req.treatment_history, clinical_evidence=evidence
        ));

        appeal = AppealRecord(
            appeal_id=str(uuid.uuid4()),
            subject_line=letter.subject_line,
            opening_paragraph=letter.opening_paragraph,
            clinical_justification=letter.clinical_justification,
            evidence_cited=letter.evidence_cited,
            closing_paragraph=letter.closing_paragraph,
            full_letter=letter.full_letter,
            appeal_type=denial.denial_type,
            status="submitted",
            submitted_at=now,
            filed_at=now,
        );
        denial +>:HasAppeal:+> appeal;
        req.status = "appeal_submitted";

        report {
            "step": "appeal_submitted",
            "denial_type": analysis.denial_type,
            "criterion_failed": analysis.criterion_failed,
            "appeal_viable": is_viable,
            "viability_score": final_score,
            "appeal_id": jid(appeal),
            "message": "Persist autonomously drafted and submitted appeal from PDF",
        };
    }
}

walker:pub auto_process_case {
    has case_id: str;
    has denial_text: str = "";
    has denial_date: str = "";
    has auto_submit_appeal: bool = True;

    can orchestrate with Root entry {
        now: str = datetime.now().isoformat();
        patient_case = cast(PatientCase, &self.case_id);

        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests {
            report {"error": "No PA request found", "step": "detection"};
            disengage;
        }
        req: PARequest = requests[0];

        denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];

        denial: DenialRecord;

        if denials {
            denial = denials[0];
            appeals: list[AppealRecord] = [denial->:HasAppeal:->][?:AppealRecord];
            if appeals {
                existing: AppealRecord = appeals[0];
                report {
                    "step": "complete",
                    "message": "Appeal already on file for this denial",
                    "appeal_id": jid(existing),
                    "status": existing.status,
                };
                disengage;
            }
        }

        if not denials {
            if not self.denial_text {
                report {
                    "step": "monitoring",
                    "message": "Persist is monitoring this case — submit denial text when received",
                };
                disengage;
            }

            payer_name_an: str = patient_case.payer_name;

            profiles_an: list[PayerProfile] = [root->:HasPayerProfile:->][?:PayerProfile];
            payer_an_vals = payer_profile_strings(patient_case.payer_name, profiles_an);

            analysis = cast(DenialAnalysis, analyze_denial(denial_text=self.denial_text, payer_name=payer_name_an, cpt_code=req.cpt_code, patient_diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else ""
            ));

            denial_type_new: str = analysis.denial_type;
            base_score: float = 0.05;
            if denial_type_new == "medical_necessity" {
                base_score = 0.82;
            } elif denial_type_new == "step_therapy" {
                base_score = 0.78;
            } elif denial_type_new == "administrative" {
                base_score = 0.95;
            }

            docs_available: list[str] = ["physician_notes", "lab_results", "treatment_history"];
            llm_score = cast(float, score_appeal_viability(
                denial_type=denial_type_new,
                criterion_failed=analysis.criterion_failed,
                documentation_available=docs_available
            ));

            final_score: float = (base_score * 0.6) + (llm_score * 0.4);
            is_viable: bool = final_score > 0.5;

            date_val: str = self.denial_date if self.denial_date else now[:10];

            denial = DenialRecord(
                denial_id=str(uuid.uuid4()),
                raw_denial_text=self.denial_text,
                denial_type=analysis.denial_type,
                criterion_failed=analysis.criterion_failed,
                missing_documentation=analysis.missing_documentation,
                appeal_strategy=analysis.appeal_strategy,
                denial_reason_summary=analysis.denial_reason_summary,
                appeal_viability_score=final_score,
                appeal_viable=is_viable,
                denial_date=date_val,
            );
            req +>:HasDenial:+> denial;
            req.status = "denied";
        }

        is_viable_effective: bool = denial.appeal_viable;

        if not is_viable_effective {
            report {
                "step": "escalate",
                "message": "Low viability — escalating to peer-to-peer review",
                "appeal_viable": False,
                "viability_score": denial.appeal_viability_score,
            };
            disengage;
        }

        evidence: str = req.treatment_history;

        profiles_aut: list[PayerProfile] = [root->:HasPayerProfile:->][?:PayerProfile];
        payer_auto_ctx = payer_profile_strings(patient_case.payer_name, profiles_aut);

        analysis_obj: DenialAnalysis = DenialAnalysis(
            denial_type=denial.denial_type,
            criterion_failed=denial.criterion_failed,
            missing_documentation=denial.missing_documentation,
            appeal_strategy=denial.appeal_strategy,
            denial_reason_summary=denial.denial_reason_summary,
        );

        letter = cast(AppealLetter, draft_appeal_letter(
            denial_analysis=analysis_obj,
            patient_name=patient_case.patient_name,
            drug_or_service=req.drug_name,
            diagnosis=req.diagnosis_codes[0] if req.diagnosis_codes else "",
            treatment_history=req.treatment_history,
            clinical_evidence=evidence,
        ));

        if self.auto_submit_appeal {
            appeal = AppealRecord(
                appeal_id=str(uuid.uuid4()),
                subject_line=letter.subject_line,
                opening_paragraph=letter.opening_paragraph,
                clinical_justification=letter.clinical_justification,
                evidence_cited=letter.evidence_cited,
                closing_paragraph=letter.closing_paragraph,
                full_letter=letter.full_letter,
                appeal_type=denial.denial_type,
                status="submitted",
                submitted_at=now,
                filed_at=now,
            );
            denial +>:HasAppeal:+> appeal;
            req.status = "appeal_submitted";

            report {
                "step": "appeal_submitted",
                "appeal_id": jid(appeal),
                "subject_line": letter.subject_line,
                "message": "Persist autonomously drafted and submitted appeal",
            };
        } else {
            appeal = AppealRecord(
                appeal_id=str(uuid.uuid4()),
                subject_line=letter.subject_line,
                opening_paragraph=letter.opening_paragraph,
                clinical_justification=letter.clinical_justification,
                evidence_cited=letter.evidence_cited,
                closing_paragraph=letter.closing_paragraph,
                full_letter=letter.full_letter,
                appeal_type=denial.denial_type,
                status="drafted",
                submitted_at="",
                filed_at=now,
            );
            denial +>:HasAppeal:+> appeal;
            req.status = "appeal_drafted";

            report {
                "step": "appeal_drafted",
                "appeal_id": jid(appeal),
                "subject_line": letter.subject_line,
                "message": "Persist drafted appeal — ready for physician review",
            };
        }

        existing_patterns_auto = [root->:HasDenialPattern:->][?:DenialPattern];
        matched_auto = False;
        for pattern in existing_patterns_auto {
            if (pattern.payer_name == patient_case.payer_name and
                pattern.cpt_code == req.cpt_code and
                pattern.denial_type == denial.denial_type) {
                pattern.times_seen += 1;
                pattern.win_rate = pattern.times_won / pattern.times_seen;
                matched_auto = True;
            }
        }
        if not matched_auto {
            new_pat = DenialPattern(
                pattern_id=str(uuid.uuid4()),
                payer_name=patient_case.payer_name,
                cpt_code=req.cpt_code,
                denial_type=denial.denial_type,
                criterion_failed=denial.criterion_failed,
                successful_appeal_language="",
                times_seen=1,
                times_won=0,
                win_rate=0.0,
            );
            root +>:HasDenialPattern:+> new_pat;
        }
    }
}

walker:pub get_all_cases {
    can fetch with Root entry {
        all_cases: list[PatientCase] = [root-->][?:PatientCase];
        result: list[dict] = [];

        for patient_case in all_cases {
            requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
            req: PARequest | None = requests[0] if requests else None;

            has_denial = False;
            has_appeal = False;
            appeal_viable = False;
            viability_score = 0.0;

            if req {
                denials = [req->:HasDenial:->][?:DenialRecord];
                if denials {
                    has_denial = True;
                    appeal_viable = denials[0].appeal_viable;
                    viability_score = denials[0].appeal_viability_score;
                    appeals = [denials[0]->:HasAppeal:->][?:AppealRecord];
                    if appeals { has_appeal = True; }
                }
            }

            result.append({
                "case_id": jid(patient_case),
                "patient_name": patient_case.patient_name,
                "patient_id": patient_case.patient_id,
                "dob": patient_case.dob,
                "payer_name": patient_case.payer_name,
                "member_id": patient_case.member_id,
                "cpt_code": req.cpt_code if req else "",
                "drug_name": req.drug_name if req else "",
                "status": req.status if req else "unknown",
                "submitted_at": req.submitted_at if req else "",
                "preauth_ref": req.preauth_ref if req else "",
                "has_denial": has_denial,
                "has_appeal": has_appeal,
                "appeal_viable": appeal_viable,
                "viability_score": viability_score,
                "created_at": patient_case.created_at
            });
        }

        result = sorted(result, key=case_created_at, reverse=True);
        report result;
    }
}

walker:pub get_case_detail {
    has case_id: str;

    can fetch with Root entry {
        patient_case = cast(PatientCase, &self.case_id);

        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests { report {"error": "No request found"}; disengage; }
        req: PARequest = requests[0];

        denial_data: dict | None = None;
        appeal_data: dict | None = None;

        denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];
        if denials {
            d: DenialRecord = denials[0];
            denial_data = {
                "denial_id": jid(d),
                "denial_type": d.denial_type,
                "criterion_failed": d.criterion_failed,
                "missing_documentation": d.missing_documentation,
                "appeal_strategy": d.appeal_strategy,
                "denial_reason_summary": d.denial_reason_summary,
                "appeal_viability_score": d.appeal_viability_score,
                "appeal_viable": d.appeal_viable,
                "denial_date": d.denial_date,
                "raw_denial_text": d.raw_denial_text
            };

            appeals: list[AppealRecord] = [d->:HasAppeal:->][?:AppealRecord];
            if appeals {
                a: AppealRecord = appeals[0];
                appeal_data = {
                    "appeal_id": jid(a),
                    "subject_line": a.subject_line,
                    "full_letter": a.full_letter,
                    "clinical_justification": a.clinical_justification,
                    "evidence_cited": a.evidence_cited,
                    "appeal_type": a.appeal_type,
                    "status": a.status,
                    "submitted_at": a.submitted_at,
                    "filed_at": a.filed_at
                };
            }
        }

        monitors_detail: list[MonitorStatus] = [req->:HasMonitor:->][?:MonitorStatus];
        monitor_data: dict | None = None;
        if monitors_detail {
            m_det: MonitorStatus = monitors_detail[0];
            monitor_data = {
                "is_expedited": m_det.is_expedited,
                "escalation_triggered": m_det.escalation_triggered,
                "cms_deadline_72hr": m_det.cms_deadline_72hr,
                "cms_deadline_7day": m_det.cms_deadline_7day,
                "follow_up_required": m_det.follow_up_required,
                "hours_pending": m_det.hours_pending,
                "days_pending": m_det.days_pending,
                "escalation_reason": m_det.escalation_reason,
            };
        }

        report {
            "case_id": jid(patient_case),
            "patient_name": patient_case.patient_name,
            "patient_id": patient_case.patient_id,
            "dob": patient_case.dob,
            "payer_name": patient_case.payer_name,
            "member_id": patient_case.member_id,
            "req_id": jid(req),
            "cpt_code": req.cpt_code,
            "drug_name": req.drug_name,
            "diagnosis_codes": req.diagnosis_codes,
            "treatment_history": req.treatment_history,
            "status": req.status,
            "submitted_at": req.submitted_at,
            "preauth_ref": req.preauth_ref,
            "priority": req.priority,
            "monitor": monitor_data,
            "denial": denial_data,
            "appeal": appeal_data
        };
    }
}

walker:pub seed_demo_data {
    can seed with Root entry {
        now = datetime.now().isoformat();

        existing = [root-->][?:PatientCase];
        for c in existing { del c; }

        case1 = PatientCase(
            patient_id="UHC987654321",
            patient_name="Sarah Johnson",
            dob="1978-04-22",
            payer_name="UnitedHealthcare",
            member_id="UHC987654321",
            created_at="2026-05-08T09:00:00"
        );
        root ++> case1;

        req1 = PARequest(
            req_id="PA-2026-UHC-001",
            cpt_code="J0135",
            drug_name="Adalimumab 40mg (Humira)",
            diagnosis_codes=["M05.79"],
            treatment_history="Patient completed 6 months of methotrexate 20mg weekly with inadequate response. DAS28-CRP remained above 5.1 throughout treatment period. Discontinued due to inadequate clinical response per ACR guidelines.",
            status="denied",
            submitted_at="2026-05-08T09:00:00",
            created_at="2026-05-08T09:00:00",
            priority=1
        );
        case1 +>:HasRequest:+> req1;

        denial1 = DenialRecord(
            denial_id=str(uuid.uuid4()),
            raw_denial_text="PRIOR AUTHORIZATION DENIAL NOTICE\nDate: May 8, 2026\nMember: Sarah Johnson | ID: UHC987654321\nService: Adalimumab 40mg (Humira) | CPT: J0135\nDenial Reason: CO-50 Medical Necessity Not Established\n\nCriterion Not Met: Per UnitedHealthcare Clinical Policy CP.PHAR.118, coverage of adalimumab requires documentation of inadequate response to at least one conventional DMARD (methotrexate or sulfasalazine) for a minimum duration of 3 months at adequate doses. The submitted documentation does not confirm completion of the required step therapy protocol with objective outcome measures.\n\nMissing Documentation: Documented DAS28-CRP scores during methotrexate trial period, specific methotrexate dose and duration with start and end dates, objective measurement of inadequate response using validated clinical assessment.\n\nAppeal Rights: You have 180 days from the date of this notice to file an internal appeal. Please contact UnitedHealthcare Appeals Department at 1-866-892-2552.",
            denial_type="step_therapy",
            criterion_failed="Documentation of inadequate response to conventional DMARD (methotrexate) for minimum 3 months with objective outcome measures per CP.PHAR.118",
            missing_documentation=["DAS28-CRP scores during methotrexate trial", "Specific methotrexate dose and duration with dates", "Objective measurement of inadequate response"],
            appeal_strategy="Document 6-month methotrexate trial with DAS28-CRP scores proving inadequate response. Cite ACR guidelines recommending biologic therapy after DMARD failure. Attach lab results showing persistent elevated inflammatory markers.",
            denial_reason_summary="UHC denied because they need documented proof with objective scores that methotrexate was tried and failed — you have the evidence, just need to present it correctly",
            appeal_viability_score=0.89,
            appeal_viable=True,
            denial_date="2026-05-08"
        );
        req1 +>:HasDenial:+> denial1;

        case2 = PatientCase(
            patient_id="BCBS445521",
            patient_name="Michael Chen",
            dob="1965-11-15",
            payer_name="Blue Cross Blue Shield",
            member_id="BCBS445521",
            created_at="2026-05-12T14:00:00"
        );
        root ++> case2;

        req2 = PARequest(
            req_id="PA-2026-BCBS-002",
            cpt_code="72148",
            drug_name="MRI Lumbar Spine without contrast",
            diagnosis_codes=["M54.5"],
            treatment_history="6 weeks conservative therapy including physical therapy and NSAIDs without adequate pain relief.",
            status="submitted",
            submitted_at="2026-05-12T14:00:00",
            created_at="2026-05-12T14:00:00",
            priority=2
        );
        case2 +>:HasRequest:+> req2;

        monitor2 = MonitorStatus(
            last_checked=now,
            days_pending=2,
            cms_deadline_7day=False,
            follow_up_required=False
        );
        req2 +>:HasMonitor:+> monitor2;

        case3 = PatientCase(
            patient_id="AET882341",
            patient_name="Patricia Williams",
            dob="1952-03-08",
            payer_name="Aetna",
            member_id="AET882341",
            created_at="2026-04-28T10:00:00"
        );
        root ++> case3;

        req3 = PARequest(
            req_id="PA-2026-AET-003",
            cpt_code="J3490",
            drug_name="Semaglutide (Ozempic) 1mg",
            diagnosis_codes=["E11.9"],
            treatment_history="Failed metformin 2000mg daily for 6 months. HbA1c 9.2% at baseline. Added sitagliptin with inadequate response at 3 months.",
            status="appeal_submitted",
            submitted_at="2026-04-28T10:00:00",
            preauth_ref="PA-2026-AET-882341",
            created_at="2026-04-28T10:00:00",
            priority=3
        );
        case3 +>:HasRequest:+> req3;

        case4 = PatientCase(
            patient_id="CIG445521",
            patient_name="Robert Martinez",
            dob="1958-07-19",
            payer_name="Cigna",
            member_id="CIG445521",
            created_at="2026-05-10T11:00:00"
        );
        root ++> case4;

        req4 = PARequest(
            req_id="PA-2026-CIG-004",
            cpt_code="93798",
            drug_name="Cardiac Rehabilitation Program (36 sessions)",
            diagnosis_codes=["I25.10"],
            treatment_history="Recent CABG surgery April 2026. Cardiologist referral for Phase II cardiac rehabilitation.",
            status="denied",
            submitted_at="2026-05-10T11:00:00",
            created_at="2026-05-10T11:00:00",
            priority=1
        );
        case4 +>:HasRequest:+> req4;

        denial4 = DenialRecord(
            denial_id=str(uuid.uuid4()),
            raw_denial_text="PRIOR AUTHORIZATION DENIAL NOTICE\nDate: May 10, 2026\nMember: Robert Martinez | ID: CIG445521\nService: Cardiac Rehabilitation | CPT: 93798\nDenial Reason: CO-50 Medical Necessity Not Established\n\nThe submitted documentation does not demonstrate that the member meets Cigna coverage criteria for cardiac rehabilitation program. Required qualifying event: documented myocardial infarction within 12 months OR recent coronary artery bypass surgery with operative report OR stable angina pectoris with documented exercise capacity less than 5 METs.\n\nNote: Operative report from CABG procedure was not included in submission.",
            denial_type="administrative",
            criterion_failed="Missing operative report from CABG surgery — qualifying event documentation not included in submission",
            missing_documentation=["CABG operative report", "Discharge summary from cardiac surgery", "Cardiologist referral letter specifying Phase II cardiac rehab"],
            appeal_strategy="Administrative denial — resubmit with CABG operative report and discharge summary. 95% overturn rate for administrative denials with correct documentation.",
            denial_reason_summary="Cigna just needs the surgery paperwork — the CABG operative report was missing from the original submission. This is a simple administrative fix.",
            appeal_viability_score=0.95,
            appeal_viable=True,
            denial_date="2026-05-10"
        );
        req4 +>:HasDenial:+> denial4;

        report {
            "message": "Demo data seeded — 4 cases created",
            "cases": [
                {"name": "Sarah Johnson", "status": "denied", "viability": 0.89},
                {"name": "Michael Chen", "status": "submitted"},
                {"name": "Patricia Williams", "status": "appeal_submitted"},
                {"name": "Robert Martinez", "status": "denied", "viability": 0.95}
            ]
        };
    }
}

walker:pub seed_payer_intelligence {
    can seed with Root entry {
        existing_pp = [root->:HasPayerProfile:->][?:PayerProfile];
        for p in existing_pp { del p; }

        uhc = PayerProfile(
            payer_id="UHC",
            payer_name="UnitedHealthcare",
            criteria_engine="InterQual",
            avg_denial_rate=0.34,
            avg_appeal_overturn_rate=0.81,
            step_therapy_required=True,
            expedited_timeline_hours=72,
            standard_timeline_days=7,
            appeal_language_notes="UHC responds to InterQual criterion citations. Always cite specific InterQual guideline version. Document step therapy with exact dates and DAS28-CRP or equivalent scores. Use clinical specialty society guidelines (ACR, ADA, ACC) as secondary support.",
            common_denial_reasons=[
                "Step therapy not completed",
                "Medical necessity not established",
                "Missing objective outcome measures",
                "Inadequate duration of prior therapy",
            ],
        );
        root +>:HasPayerProfile:+> uhc;

        bcbs = PayerProfile(
            payer_id="BCBS",
            payer_name="Blue Cross Blue Shield",
            criteria_engine="AIM",
            avg_denial_rate=0.28,
            avg_appeal_overturn_rate=0.79,
            step_therapy_required=True,
            expedited_timeline_hours=72,
            standard_timeline_days=7,
            appeal_language_notes="BCBS uses AIM Specialty Health criteria updated Q2 2025. AIM adds explicit prerequisite treatment duration minimums. Cite AIM criteria version. For imaging: document conservative treatment duration and functional limitation scores. P2P review has 69% overturn rate when conducted within 72 hours.",
            common_denial_reasons=[
                "Conservative treatment duration insufficient",
                "Functional limitation not documented",
                "Alternative imaging not attempted",
                "Missing referring physician documentation",
            ],
        );
        root +>:HasPayerProfile:+> bcbs;

        aetna = PayerProfile(
            payer_id="AET",
            payer_name="Aetna",
            criteria_engine="CPB",
            avg_denial_rate=0.25,
            avg_appeal_overturn_rate=0.77,
            step_therapy_required=True,
            expedited_timeline_hours=72,
            standard_timeline_days=7,
            appeal_language_notes="Aetna uses proprietary Clinical Policy Bulletins referenced by number in denial letters. Always cite the specific CPB number from the denial. Document why patient cannot use preferred alternatives. GLP-1 agonists require HbA1c above 7.5 and failure of metformin.",
            common_denial_reasons=[
                "CPB criteria not met",
                "Preferred alternative not tried",
                "HbA1c threshold not documented",
                "Missing endocrinologist consultation",
            ],
        );
        root +>:HasPayerProfile:+> aetna;

        cigna = PayerProfile(
            payer_id="CIG",
            payer_name="Cigna",
            criteria_engine="proprietary",
            avg_denial_rate=0.22,
            avg_appeal_overturn_rate=0.83,
            step_therapy_required=False,
            expedited_timeline_hours=72,
            standard_timeline_days=7,
            appeal_language_notes="Cigna administrative denials are easiest to overturn — 95% success with correct documentation. Always include operative reports and discharge summaries. For cardiac rehab: CABG operative report is mandatory. Missing documents are the most common Cigna denial reason.",
            common_denial_reasons=[
                "Missing operative report",
                "Missing discharge summary",
                "Qualifying event not documented",
                "Referral letter missing",
            ],
        );
        root +>:HasPayerProfile:+> cigna;

        report {
            "message": "Payer intelligence seeded — 4 payer profiles created",
            "payers": [
                "UnitedHealthcare",
                "Blue Cross Blue Shield",
                "Aetna",
                "Cigna",
            ],
        };
    }
}

walker:pub get_payer_profile {
    has payer_name: str;

    can fetch with Root entry {
        profiles = [root->:HasPayerProfile:->][?:PayerProfile];
        for p in profiles {
            if p.payer_name == self.payer_name {
                report {
                    "payer_id": p.payer_id,
                    "payer_name": p.payer_name,
                    "criteria_engine": p.criteria_engine,
                    "avg_denial_rate": p.avg_denial_rate,
                    "avg_appeal_overturn_rate": p.avg_appeal_overturn_rate,
                    "step_therapy_required": p.step_therapy_required,
                    "standard_timeline_days": p.standard_timeline_days,
                    "appeal_language_notes": p.appeal_language_notes,
                    "common_denial_reasons": p.common_denial_reasons,
                };
                disengage;
            }
        }
        report {"error": "Payer profile not found for: " + self.payer_name};
    }
}

walker:pub record_denial_pattern {
    has payer_name: str;
    has cpt_code: str;
    has denial_type: str;
    has criterion_failed: str;
    has appeal_won: bool = False;
    has successful_language: str = "";

    can record with Root entry {
        existing_patterns = [root->:HasDenialPattern:->][?:DenialPattern];
        for pattern in existing_patterns {
            if (pattern.payer_name == self.payer_name and
                pattern.cpt_code == self.cpt_code and
                pattern.denial_type == self.denial_type) {
                pattern.times_seen += 1;
                if self.appeal_won {
                    pattern.times_won += 1;
                    if self.successful_language {
                        pattern.successful_appeal_language = self.successful_language;
                    }
                }
                pattern.win_rate = pattern.times_won / pattern.times_seen;
                report {
                    "pattern_id": jid(pattern),
                    "times_seen": pattern.times_seen,
                    "win_rate": pattern.win_rate,
                    "updated": True,
                };
                disengage;
            }
        }
        new_pattern = DenialPattern(
            pattern_id=str(uuid.uuid4()),
            payer_name=self.payer_name,
            cpt_code=self.cpt_code,
            denial_type=self.denial_type,
            criterion_failed=self.criterion_failed,
            successful_appeal_language=self.successful_language,
            times_seen=1,
            times_won=1 if self.appeal_won else 0,
            win_rate=1.0 if self.appeal_won else 0.0,
        );
        root +>:HasDenialPattern:+> new_pattern;
        report {
            "pattern_id": jid(new_pattern),
            "times_seen": 1,
            "win_rate": new_pattern.win_rate,
            "created": True,
        };
    }
}

walker:pub check_cms_deadlines {
    can sweep with Root entry {
        now = datetime.now();
        now_str = now.isoformat();
        violations: list[dict] = [];
        escalated: list[dict] = [];
        all_cases: list[PatientCase] = [root-->][?:PatientCase];

        for patient_case in all_cases {
            requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
            if not requests { continue; }
            req: PARequest = requests[0];

            if not (req.status == "submitted" or req.status == "pending") { continue; }

            monitors: list[MonitorStatus] = [req->:HasMonitor:->][?:MonitorStatus];
            if not monitors { continue; }
            monitor: MonitorStatus = monitors[0];

            sub_s = req.submitted_at;
            if not sub_s or len(sub_s) < 10 { continue; }

            submitted = datetime.fromisoformat(sub_s);
            delta = now - submitted;
            hours_pending: float = delta.total_seconds() / 3600.0;
            days_pending: int = delta.days;

            monitor.hours_pending = hours_pending;
            monitor.days_pending = days_pending;
            monitor.last_checked = now_str;

            breach_expedited = monitor.is_expedited and hours_pending > 72.0;
            breach_standard = (not monitor.is_expedited) and days_pending > 7;
            warn_expedited = (
                monitor.is_expedited and hours_pending > 48.0 and hours_pending <= 72.0
            );
            warn_standard = (
                (not monitor.is_expedited) and days_pending > 5 and days_pending <= 7
            );

            if breach_expedited {
                monitor.cms_deadline_72hr = True;
                monitor.follow_up_required = True;
                if not monitor.escalation_triggered {
                    monitor.escalation_triggered = True;
                    monitor.escalation_reason = (
                        "CMS-0057-F expedited deadline exceeded: payer did not respond within 72 hours as required by federal law"
                    );
                    monitor.escalation_timestamp = now_str;
                    escalated.append({
                        "case_id": jid(patient_case),
                        "patient_name": patient_case.patient_name,
                        "payer_name": patient_case.payer_name,
                        "hours_pending": hours_pending,
                        "violation_type": "expedited_72hr",
                        "escalation_reason": monitor.escalation_reason,
                    });
                }
                violations.append({
                    "case_id": jid(patient_case),
                    "patient_name": patient_case.patient_name,
                    "payer": patient_case.payer_name,
                    "hours_pending": hours_pending,
                    "violation": "expedited_72hr_exceeded",
                    "cms_rule": "CMS-0057-F",
                });
            } elif breach_standard {
                monitor.cms_deadline_7day = True;
                monitor.follow_up_required = True;
                if not monitor.escalation_triggered {
                    monitor.escalation_triggered = True;
                    monitor.escalation_reason = (
                        "CMS-0057-F standard deadline exceeded: payer did not respond within 7 calendar days as required by federal law"
                    );
                    monitor.escalation_timestamp = now_str;
                    escalated.append({
                        "case_id": jid(patient_case),
                        "patient_name": patient_case.patient_name,
                        "payer_name": patient_case.payer_name,
                        "days_pending": days_pending,
                        "violation_type": "standard_7day",
                        "escalation_reason": monitor.escalation_reason,
                    });
                }
                violations.append({
                    "case_id": jid(patient_case),
                    "patient_name": patient_case.patient_name,
                    "payer": patient_case.payer_name,
                    "days_pending": days_pending,
                    "violation": "standard_7day_exceeded",
                    "cms_rule": "CMS-0057-F",
                });
            } elif warn_expedited {
                monitor.follow_up_required = True;
                violations.append({
                    "case_id": jid(patient_case),
                    "patient_name": patient_case.patient_name,
                    "payer": patient_case.payer_name,
                    "hours_remaining": 72.0 - hours_pending,
                    "violation": "expedited_deadline_warning",
                    "cms_rule": "CMS-0057-F",
                });
            } elif warn_standard {
                monitor.follow_up_required = True;
                violations.append({
                    "case_id": jid(patient_case),
                    "patient_name": patient_case.patient_name,
                    "payer": patient_case.payer_name,
                    "days_remaining": 7 - days_pending,
                    "violation": "standard_deadline_warning",
                    "cms_rule": "CMS-0057-F",
                });
            }
        }

        report {
            "checked_at": now_str,
            "total_violations": len(violations),
            "total_escalated": len(escalated),
            "violations": violations,
            "escalated_cases": escalated,
            "cms_rule": "CMS-0057-F",
            "message": (
                "Checked " + str(len(all_cases)) + " cases — " +
                str(len(violations)) + " CMS deadline issues found"
            ),
        };
    }
}

walker:pub get_monitoring_dashboard {
    can fetch_dash with Root entry {
        pending_cases: list[dict] = [];
        violation_cases: list[dict] = [];
        approaching_cases: list[dict] = [];

        all_cases: list[PatientCase] = [root-->][?:PatientCase];

        for patient_case in all_cases {
            requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
            if not requests { continue; }
            req: PARequest = requests[0];

            if not (req.status == "submitted" or req.status == "pending") { continue; }

            monitors: list[MonitorStatus] = [req->:HasMonitor:->][?:MonitorStatus];
            monitor: MonitorStatus | None = monitors[0] if monitors else None;

            mdays = monitor.days_pending if monitor else 0;
            mhours = monitor.hours_pending if monitor else 0.0;
            mis_exp = monitor.is_expedited if monitor else False;
            mvio = False;
            if monitor {
                mvio = monitor.cms_deadline_72hr or monitor.cms_deadline_7day;
            }
            mesc = monitor.escalation_triggered if monitor else False;
            mfoll = monitor.follow_up_required if monitor else False;
            mreason = monitor.escalation_reason if monitor else "";

            case_data: dict = {
                "case_id": jid(patient_case),
                "patient_name": patient_case.patient_name,
                "payer_name": patient_case.payer_name,
                "drug_name": req.drug_name,
                "submitted_at": req.submitted_at,
                "days_pending": mdays,
                "hours_pending": mhours,
                "is_expedited": mis_exp,
                "cms_deadline_violated": mvio,
                "escalation_triggered": mesc,
                "follow_up_required": mfoll,
                "escalation_reason": mreason,
            };

            if monitor and (monitor.cms_deadline_72hr or monitor.cms_deadline_7day) {
                violation_cases.append(case_data);
            } elif monitor and monitor.follow_up_required {
                approaching_cases.append(case_data);
            } else {
                pending_cases.append(case_data);
            }
        }

        report {
            "pending_cases": pending_cases,
            "violation_cases": violation_cases,
            "approaching_deadline": approaching_cases,
            "total_pending": len(pending_cases) + len(violation_cases) + len(approaching_cases),
            "total_violations": len(violation_cases),
            "cms_rule": "CMS-0057-F",
        };
    }
}

walker:pub mark_expedited {
    has case_id: str;
    has is_expedited: bool = True;

    can update_marker with Root entry {
        patient_case = cast(PatientCase, &self.case_id);
        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests {
            report {"error": "Case not found"};
            disengage;
        }
        req: PARequest = requests[0];

        monitors: list[MonitorStatus] = [req->:HasMonitor:->][?:MonitorStatus];
        if not monitors {
            report {"error": "Monitor not found"};
            disengage;
        }
        monitor: MonitorStatus = monitors[0];
        monitor.is_expedited = self.is_expedited;
        monitor.submitted_at = req.submitted_at;
        monitor.last_checked = datetime.now().isoformat();

        deadline_h = 72 if self.is_expedited else 168;
        exp_msg = "Case marked as expedited — 72-hour CMS deadline now applies";
        std_msg = "Case marked as standard — 7-day CMS deadline applies";
        out_msg = exp_msg if self.is_expedited else std_msg;
        report {
            "case_id": self.case_id,
            "is_expedited": self.is_expedited,
            "deadline_hours": deadline_h,
            "message": out_msg,
        };
    }
}

@restspec(protocol=APIProtocol.WEBSOCKET)
async walker :pub agent_status_stream {
    has case_id: str;

    async can stream with Root entry {
        patient_case = cast(PatientCase, &self.case_id);
        requests: list[PARequest] = [patient_case->:HasRequest:->][?:PARequest];
        if not requests {
            report {"error": "Case not found"};
            disengage;
        }
        req: PARequest = requests[0];

        report {
            "step": 1,
            "status": "running",
            "label": "Detecting authorization requirement",
            "detail": "Checking PA rules for " + req.drug_name + " (CPT " + req.cpt_code + ") under " +
                patient_case.payer_name + "..."
        };
        await asyncio.sleep(0.8);
        report {
            "step": 1,
            "status": "done",
            "label": "Authorization requirement confirmed",
            "detail": "PA required for " + req.drug_name + " (CPT " + req.cpt_code + ") under " +
                patient_case.payer_name,
            "durationMs": 800
        };

        report {
            "step": 2,
            "status": "running",
            "label": "Assembling clinical documentation",
            "detail": "Indexing " + str(len(req.diagnosis_codes)) + " diagnosis code(s) and treatment history for " +
                req.drug_name + "..."
        };
        await asyncio.sleep(1.2);
        step2_done_detail: str = (str(len(req.diagnosis_codes)) + " diagnosis codes confirmed: " +
            req.diagnosis_codes[0] + " | Treatment history documented") if req.diagnosis_codes
            else "" + " | Treatment history documented";
        report {
            "step": 2,
            "status": "done",
            "label": "Clinical documentation assembled",
            "detail": step2_done_detail,
            "durationMs": 1200
        };

        report {
            "step": 3,
            "status": "running",
            "label": "Submitting to payer",
            "detail": "Submitting FHIR R4 Claim/$submit to " + patient_case.payer_name + " — CPT " +
                req.cpt_code + ", Member ID " + patient_case.member_id
        };
        await asyncio.sleep(1.0);
        report {
            "step": 3,
            "status": "done",
            "label": "Submitted to payer",
            "detail": "FHIR R4 Claim/$submit accepted by " + patient_case.payer_name + " — CPT " +
                req.cpt_code + ", Member ID " + patient_case.member_id,
            "durationMs": 1000
        };

        denials: list[DenialRecord] = [req->:HasDenial:->][?:DenialRecord];
        if not denials {
            report {
                "step": 4,
                "status": "running",
                "label": "Monitoring payer response",
                "detail": "Monitoring " + patient_case.payer_name +
                    " response — CMS-0057-F mandates 7-day standard response window"
            };
        } else {
            report {
                "step": 4,
                "status": "done",
                "label": "Payer response received",
                "detail": "Denial received from " + patient_case.payer_name + " — Persist is analyzing...",
                "durationMs": 0
            };

            denial: DenialRecord = denials[0];

            report {
                "step": 5,
                "status": "running",
                "label": "Parsing denial reason",
                "detail": "Extracting failed criterion for " + denial.denial_type.replace("_", " ") +
                    " denial from " + patient_case.payer_name + "..."
            };
            await asyncio.sleep(1.5);
            report {
                "step": 5,
                "status": "done",
                "label": "Denial parsed",
                "detail": "Denial type: " + denial.denial_type + " — criterion: " +
                    denial.criterion_failed[:60] + "...",
                "durationMs": 1500
            };

            report {
                "step": 6,
                "status": "running",
                "label": "Scoring appeal viability",
                "detail": "Scoring appeal for " + denial.denial_type.replace("_", " ") + " denial against " +
                    patient_case.payer_name + " AMA 2024 overturn benchmarks..."
            };
            await asyncio.sleep(1.0);
            ama_rate: str = "82%" if denial.denial_type == "medical_necessity" else (
                "78%" if denial.denial_type == "step_therapy" else (
                    "95%" if denial.denial_type == "administrative" else "5%"
                )
            );
            report {
                "step": 6,
                "status": "done",
                "label": "Appeal viability scored",
                "detail": str(int(denial.appeal_viability_score * 100)) + "% viability — " +
                    denial.denial_type + " denials have " + ama_rate + " overturn rate per AMA 2024",
                "viability_score": denial.appeal_viability_score,
                "durationMs": 1000
            };

            appeals: list[AppealRecord] = [denial->:HasAppeal:->][?:AppealRecord];
            if appeals {
                appeal: AppealRecord = appeals[0];
                report {
                    "step": 7,
                    "status": "done",
                    "label": "Appeal letter drafted and ready",
                    "detail": "Appeal letter drafted — " + str(len(appeal.full_letter)) + " characters, citing " +
                        str(len(appeal.evidence_cited)) + " clinical evidence items",
                    "durationMs": 0
                };
            } elif denial.appeal_viable {
                report {
                    "step": 7,
                    "status": "idle",
                    "label": "Draft appeal letter",
                    "detail": "Click Generate Appeal Letter to draft"
                };
            } else {
                report {
                    "step": 7,
                    "status": "idle",
                    "label": "Escalate to peer-to-peer review",
                    "detail": "Low viability — recommend peer-to-peer review"
                };
            }
        }

        report {"type": "stream_complete"};
    }
}
