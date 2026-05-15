# Persist — Autonomous Prior Authorization Agent

## What It Is
Persist is the first autonomous prior auth agent that doesn't stop at submission — it fights denials automatically. Full lifecycle: detect → submit → monitor → parse denial → score appeal viability → draft appeal → escalate to peer-to-peer only when necessary.

## The Gap Nobody Has Closed
- Cohere Health: payer-side only, stops at approval/denial
- Waystar Auth Accelerate: stops at submission
- Thoughtful AI PAULA: routes complex cases to humans
- Nobody: autonomously identifies winnable denials (81.7% overturn rate) and drafts + submits appeals with zero physician time

## Stack
- Backend: Jac (jaclang + byllm + jac-scale) — ALL agent logic
- Frontend: React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui
- LLM: Claude (claude-sonnet-4-20250514) via Anthropic API + byLLM
- Real-time: WebSocket walker for live agent step streaming
- Mock data: FHIR R4 Bundle structure (realistic clinical data)
- No auth: single demo user

## The 7 Walker Nodes (OSP Graph)
root
 └── PatientCase (node)
      └── PARequest (node)  [via HasRequest edge]
           ├── MonitorStatus (node)  [via HasMonitor edge]
           ├── DenialRecord (node)  [via HasDenial edge]
           │    └── AppealRecord (node)  [via HasAppeal edge]

## byLLM Scope (NOT A WRAPPER)
byLLM touches exactly two things:
1. Parse unstructured denial letter text → structured DenialAnalysis
2. Draft formal appeal letter from structured clinical evidence
Everything else is deterministic rules engine.

## Key Demo Numbers
- 39 PA requests per physician per week
- 13 hours of staff time weekly
- 81.7% of appealed denials are overturned
- 24 minutes per manual PA submission
- Persist: 90 seconds from denial to appeal submitted
- $13 billion wasted annually on PA administration

