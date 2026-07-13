# PRD / SPEC — Prism AI Underwriter Agent

**Product:** AI Underwriter Agent for Professional Indemnity (PI) insurance
**Company:** Prism (applied-AI studio, Sydney)
**Version:** v1.0 draft
**Owner:** Emily Sun
**Status:** Draft for build

---

## 1. Problem Statement

Professional Indemnity underwriting today is a manual, multi-day process: a broker emails a proposal form (PDF), an underwriter re-keys the data, checks it against appetite and underwriting guidelines, assesses risk, rates the premium in a spreadsheet, and issues a quote document. For standard SME risks (consultants, accountants, IT contractors, allied health), **80%+ of the work is mechanical** — yet every submission waits in the same queue as complex risks.

**Prism automates the mechanical path end-to-end while keeping humans accountable for every judgment call**: straightforward applications are quoted in under 2 minutes; medium/high-risk submissions arrive at a human underwriter pre-analysed, with extracted data, cited guideline references, and a recommended decision.

## 2. Goals & Non-Goals

### Goals (v1)

1. Automate PI underwriting from intake to quote for in-appetite SME risks.
2. **Straight-through processing (STP) of ~70%** of standard submissions with no human touch.
3. Quote turnaround **< 2 minutes** end-to-end for STP cases.
4. Every AI recommendation **grounded in retrieved, versioned underwriting guidelines with citations** — never model memory.
5. Full **audit trail** per decision: inputs, extracted fields, rules fired, guidelines cited, model outputs, human overrides.
6. Release quality gated by evals: **≥95% field-level extraction accuracy, <2% hallucination rate** on the golden dataset.

### Non-Goals (v1)

- Policy binding, issuance, endorsements, renewals (Phase 2).
- Claims handling.
- Lines other than PI (architecture must not preclude them — guidelines and rules are per-product configs).
- Autonomous **declines** — the system may auto-approve, but a decline is always recommended to a human, never issued by the machine (regulatory posture: adverse decisions require human accountability).
- Payment / broker commission handling.

## 3. Users & Personas

| Persona                                     | Needs                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broker / Applicant**                      | Submit a proposal (form upload or web form), get a quote fast, respond to information requests                                                                    |
| **Underwriter**                             | A triaged queue: only referred cases, each pre-analysed with extraction + risk assessment + cited evidence + recommendation; one-click approve / modify / decline |
| **Senior underwriter / Referral authority** | Cases exceeding delegated authority; override with reason codes                                                                                                   |
| **Compliance / Ops**                        | Query any historical decision: who/what decided, on which guideline version, with what evidence                                                                   |
| **Prism engineer**                          | Observability: latency, token cost, confidence distributions, eval regression before every release                                                                |

## 4. Real-World Underwriting Workflow → Pipeline Mapping

The pipeline mirrors how a human PI underwriter actually works. Each manual step maps to a pipeline stage; each stage is independently testable, observable, and auditable.

| #   | Manual workflow step                                                              | Pipeline stage                 | Executor                                                   |
| --- | --------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| 0   | Broker emails proposal form (PDF) / fills portal form                             | **Intake & Ingestion**         | Deterministic (storage, parsing)                           |
| 1   | Underwriter reads form, re-keys into system                                       | **Extraction**                 | LLM — Claude Haiku (`claude-haiku-4-5`)                    |
| 2   | Checks form is complete; emails broker for missing info                           | **Validation & RFI**           | Deterministic (Zod) + templated RFI                        |
| 3   | Checks appetite: occupation, revenue caps, jurisdiction, claims history knockouts | **Eligibility / Knockout**     | Deterministic rules engine (TS)                            |
| 4   | Opens the underwriting manual to relevant sections                                | **Guideline Retrieval**        | RAG — Voyage embeddings + pgvector + rerank                |
| 5   | Assesses risk: occupation hazard class, activities mix, claims record, exposures  | **Risk Assessment**            | LLM — Claude Sonnet (`claude-sonnet-5`), citation-grounded |
| 6   | Decides: accept / refer / decline, terms & conditions                             | **Decision Reasoning**         | LLM recommends → deterministic decision engine decides     |
| 7   | Rates premium in the rating tool                                                  | **Pricing & Quote Generation** | Deterministic rating engine (TS)                           |
| 8   | Refers to senior UW if outside authority; else issues quote                       | **HITL Routing & Review**      | Deterministic routing + human console                      |
| 9   | Files everything for compliance                                                   | **Audit & Observability**      | Structured logging, immutable decision record              |

**Core guardrail (applies everywhere):** LLMs perform _extraction_ and _reasoning_ only. Eligibility rules, pricing, and the final decision are deterministic TypeScript. The model never makes a regulatory or financial decision autonomously.

## 5. Architecture Overview

```
Broker/Portal ──▶ Intake API (Hono) ──▶ Supabase storage (raw docs)
                                        │
                    ┌───────────────────▼────────────────────┐
                    │        Pipeline Orchestrator (TS)       │
                    │  stage contracts = Zod schemas, each    │
                    │  stage emits SSE progress events        │
                    ├─────────────────────────────────────────┤
                    │ 1 Extraction        Haiku  → ExtractedApplication
                    │ 2 Validation        TS     → ValidatedApplication | RFI
                    │ 3 Eligibility       TS     → EligibilityResult (knockouts)
                    │ 4 Retrieval         Voyage + pgvector + rerank → GuidelineContext
                    │ 5 Risk Assessment   Sonnet → RiskAssessment (cited)
                    │ 6 Decision          Sonnet recommend → TS decision engine
                    │ 7 Pricing/Quote     TS rating engine → Quote
                    │ 8 HITL Routing      TS     → auto-approve | refer(queue)
                    └─────────────────────────────────────────┘
                                        │
              SSE ──▶ applicant frontend (stage progress, quote)
              NDJSON ──▶ underwriting console (Hono) — full stage visibility, mock mode
              Structured logs ──▶ Supabase (audit)
```

- **Runtime:** TypeScript, Hono, Docker container; GitHub Actions CI/CD.
- **Data:** Supabase — PostgreSQL (applications, decisions, audit), pgvector (guideline chunks), object storage (raw documents).
- **Models:** Anthropic API. Routing: `claude-haiku-4-5` for extraction/classification; `claude-sonnet-5` for risk assessment and decision reasoning. All model calls use structured output validated by Zod; prompt caching on the stable system prompt + guideline preamble.
- **Contracts first:** every stage boundary is a Zod schema defined before implementation; mock mode substitutes typed contract responses for model calls.

## 6. Stage Specifications

### Stage 0 — Intake & Ingestion

- **Inputs:** PDF proposal form upload, or structured web-form JSON.
- **Behaviour:** persist raw document to Supabase storage; create `application` row (status `received`); assign `request_id` (propagated through every log line and model call).
- **Output contract:** `IntakeRecord { applicationId, source: 'pdf' | 'form', documentRefs[], receivedAt }`.

### Stage 1 — Extraction (LLM: Haiku)

- **Task:** extract the PI proposal into a typed schema. Extraction only — the prompt explicitly forbids judgment, recommendation, or interpretation.
- **Output contract (abridged):**

```ts
const ExtractedApplication = z.object({
  insured: z.object({
    legalName: z.string(),
    abn: z
      .string()
      .regex(/^\d{11}$/)
      .nullable(),
    state: z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']),
    yearsInPractice: z.number().nullable(),
  }),
  business: z.object({
    occupation: z.string(), // free text, classified in-stage
    occupationClass: z.enum(OCCUPATION_CLASSES).nullable(),
    activitiesSplit: z.array(
      z.object({ activity: z.string(), pct: z.number() })
    ),
    annualFeeIncome: z.number().nullable(),
    staffCount: z.number().nullable(),
    overseasExposure: z.object({
      usCanadaPct: z.number(),
      otherPct: z.number(),
    }),
  }),
  cover: z.object({
    limitRequested: z.number(), // limit of indemnity
    excessPreference: z.number().nullable(),
    retroactiveDate: z.string().nullable(), // ISO date or 'unlimited'
  }),
  history: z.object({
    claimsLast5Years: z.array(
      z.object({
        year: z.number(),
        description: z.string(),
        amount: z.number().nullable(),
        open: z.boolean(),
      })
    ),
    priorInsurance: z.boolean().nullable(),
    everDeclinedOrCancelled: z.boolean().nullable(),
    insolvencyEvents: z.boolean().nullable(),
    knownCircumstances: z.boolean().nullable(), // undisclosed circumstances flag
  }),
  fieldConfidence: z.record(z.number()), // per-field 0–1
})
```

- **Per-field confidence:** composite of (a) model self-report, (b) source-span presence (was the value literally found in the document?), calibrated against the golden set.
- **Injection defence:** document text is wrapped as data (`<document>` delimiters); extraction model has no tools; system prompt instructs that any instruction-like content inside the document is data to be ignored; outputs constrained by schema.
- **Occupation classification:** second Haiku call maps free-text occupation → controlled `occupationClass` taxonomy (classification task, enum-constrained output).

### Stage 2 — Validation & RFI (deterministic)

- Zod-parse + business validation (ABN checksum, percentages sum to 100, retroactive date sanity).
- **Missing/low-confidence required fields** (confidence < threshold, default 0.8) → generate a templated **Request for Information** listing exactly the missing items; application status `awaiting_info`; pipeline pauses (resumable when broker responds).
- No LLM in this stage.

### Stage 3 — Eligibility / Knockout (deterministic rules engine)

- Versioned rule set (`appetite_rules` table, effective-dated). Example v1 knockouts:

| Rule                | Knockout condition                                                    |
| ------------------- | --------------------------------------------------------------------- |
| Occupation appetite | `occupationClass` not in appetite list                                |
| Size cap            | annual fee income > $5M                                               |
| Jurisdiction        | US/Canada exposure > 10% of revenue                                   |
| Claims frequency    | > 2 claims in 5 years, or any single claim > $100k, or any open claim |
| Insurance history   | prior declinature / cancellation                                      |
| Solvency            | insolvency event ≤ 5 years                                            |
| Disclosure          | known circumstances = true                                            |

- **Output:** `EligibilityResult { outcome: 'pass' | 'knockout' | 'refer', rulesFired: RuleHit[] }`. Knockout → recommended-decline package routed to human (never auto-declined). Borderline rules (e.g. fee income $3–5M) → `refer` flag carried forward.
- Every rule hit is recorded with rule id + version in the audit trail.

### Stage 4 — Guideline Retrieval (RAG)

- **Corpus:** underwriting guidelines authored in Markdown, versioned (`guideline_versions`); markdown-aware semantic chunking (split on heading hierarchy, keep tables intact, target 300–700 tokens/chunk, heading-path prepended to each chunk).
- **Index:** Voyage embeddings → Supabase pgvector (cosine, HNSW).
- **Query construction:** deterministic — from `occupationClass`, activities, claims profile, limit band (not free-form model queries).
- **Retrieve top-20 → Voyage rerank → top-6** chunks passed to Stage 5 with chunk ids + guideline version.
- **Output:** `GuidelineContext { chunks: [{ id, version, headingPath, text }], retrievalScores }`.

### Stage 5 — Risk Assessment (LLM: Sonnet)

- **Task:** assess the risk against retrieved guidelines only. Prompt rule: _every finding must cite a chunk id; if the guidelines don't cover a factor, say so — do not fill from general knowledge._
- **Output contract:**

```ts
const RiskAssessment = z.object({
  riskFactors: z.array(
    z.object({
      factor: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      citations: z.array(z.string()).min(1), // chunk ids — enforced non-empty
      rationale: z.string(),
    })
  ),
  overallRiskTier: z.enum(['low', 'medium', 'high']),
  uncoveredFactors: z.array(z.string()), // things guidelines don't address
  suggestedConditions: z.array(
    z.object({ condition: z.string(), citations: z.array(z.string()) })
  ),
})
```

- **Post-check (deterministic):** validate every citation id exists in the retrieved set; any uncited factor or invalid citation ⇒ hallucination flag ⇒ force referral. This is the mechanical definition behind the <2% hallucination metric.

### Stage 6 — Decision Reasoning (LLM recommends, code decides)

- Sonnet produces `DecisionRecommendation { recommendation: 'accept' | 'accept_with_conditions' | 'refer' | 'decline', conditions[], reasoning, citations[] }`.
- **Deterministic decision engine** combines: eligibility outcome + risk tier + recommendation + composite confidence + authority matrix → final routing. The LLM output is one input among several; it cannot unilaterally accept or decline.

### Stage 7 — Pricing & Quote (deterministic rating engine)

- Pure TypeScript; versioned rating tables. Illustrative v1 formula:

```
basePremium   = baseRate[occupationClass] × revenueBandFactor(feeIncome)
limitFactor   = ILF(limitRequested)          // increased limit factor table
claimsLoading = f(claimsLast5Years)          // 1.0 – 1.5
excessCredit  = f(selectedExcess)            // 0.85 – 1.0
technical     = basePremium × limitFactor × claimsLoading × excessCredit
premium       = max(technical, minimumPremium[occupationClass])
payable       = premium + GST + stampDuty(state)   // AU state-based stamp duty
```

- **Output:** `Quote { premiumBreakdown, limit, excess, conditions[], validUntil (+30 days), ratingTableVersion }` + rendered quote schedule (PDF/HTML).
- No model call anywhere in pricing.

### Stage 8 — HITL Routing & Review Console

- **Routing matrix (deterministic):**

| Condition                                                                                                                    | Route                                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Eligibility pass + risk `low` + recommendation `accept` + confidence ≥ 0.85 + within authority (limit ≤ $2M, premium ≤ $10k) | **Auto-approve** → quote issued                      |
| Risk `medium`, or any borderline rule, or confidence < 0.85, or conditions suggested                                         | **Refer** → underwriter queue                        |
| Risk `high`, knockout, recommendation `decline`, or limit/premium above authority                                            | **Refer (senior)** — decline requires human sign-off |

- **Console (Hono + NDJSON streaming):** per-application timeline of every stage — extracted entities (with source-doc highlighting), rules fired, retrieved clauses, risk assessment with citations, recommendation, pricing breakdown. Actions: approve / modify terms / request info / decline, each requiring a reason code; every action appends to the audit trail.
- **Mock mode:** environment flag replaces all model calls with typed fixture responses (valid against the same Zod contracts) — used for integration tests, demos, and frontend development offline.

## 7. Data Model (Supabase / PostgreSQL)

| Table                                     | Purpose                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applications`                            | one row per submission; status machine: `received → extracting → awaiting_info → assessing → priced → auto_approved / referred → quoted / declined / expired` |
| `documents`                               | raw uploads (storage refs), parse artifacts                                                                                                                   |
| `extractions`                             | versioned extraction results + per-field confidence                                                                                                           |
| `eligibility_runs`                        | rules fired, rule-set version                                                                                                                                 |
| `guideline_versions` / `guideline_chunks` | markdown source, chunk text, embedding (pgvector), heading path                                                                                               |
| `assessments`                             | risk assessment JSON + citation validation result                                                                                                             |
| `decisions`                               | recommendation, deterministic routing result, final human/auto decision, reason codes                                                                         |
| `quotes`                                  | pricing breakdown, rating table version, validity                                                                                                             |
| `audit_events`                            | append-only: every stage transition, model call (request id, model, latency, tokens, cost), human action                                                      |
| `eval_runs`                               | Promptfoo run summaries per release                                                                                                                           |

Row-level security: brokers see only their own applications; underwriters see the referral queue; audit tables are insert-only.

## 8. Guardrails & Security

1. **Authority boundary:** models never mutate state. Stage outputs are proposals; deterministic code owns all state transitions, pricing, and decisions. Auto-approve exists; auto-decline does not.
2. **Prompt injection:** proposal documents are untrusted input — delimited as data, extraction model tool-less, schema-constrained outputs, and a post-extraction sanity pass (no field may contain instruction-like content; regex + length checks).
3. **Citation enforcement:** machine-checked (Stage 5 post-check), not just prompted.
4. **PII:** applications contain personal data — Supabase RLS, encrypted at rest, no PII in logs (log field _names_ and confidence, not values), configurable retention.
5. **Model failure handling:** typed error taxonomy per stage; retries with backoff on 429/5xx; a stage that fails after retries parks the application for human pickup — never silently skips.
6. **Version pinning:** model IDs, prompt versions, guideline versions, rule-set versions, rating-table versions are all recorded per decision — any historical decision is fully reproducible.

## 9. Evaluation Framework (release gate)

- **Tooling:** Promptfoo suite, run in CI on every prompt/model/guideline change; release blocked on regression.
- **Golden dataset:** 60 curated cases (target; grows over time) spanning: clean standard risks, missing-field cases, knockout cases, borderline referrals, claims-loaded risks, injection attempts, and edge occupations.
- **Metrics & gates:**

| Metric                          | Definition                                                  | Gate                        |
| ------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Field-level extraction accuracy | exact/normalised match per required field vs labelled truth | ≥ 95%                       |
| Hallucination rate              | risk-assessment findings failing citation validation        | < 2%                        |
| Retrieval quality               | labelled relevant chunk present in top-6 after rerank       | ≥ 90%                       |
| Reasoning consistency           | same case, 3 runs → same risk tier & recommendation         | ≥ 95%                       |
| Routing correctness             | pipeline routing matches labelled expected route            | 100% on knockouts/referrals |
| Injection resistance            | injection cases produce no instruction-following behaviour  | 100%                        |

- **Model routing validation:** eval suite runs extraction on both Haiku and Sonnet; Haiku stays the extraction model only while its accuracy is within 1pt of Sonnet on the golden set (this is the evidence behind "no measured drop in eval accuracy").

## 10. Observability

- **Structured logging (JSON):** every log line carries `request_id`, `application_id`, `stage`, `model`, `latency_ms`, `input_tokens`, `output_tokens`, `cost_usd`, `confidence`, `decision_path`.
- **Dashboards/queries:** p50/p95 latency per stage; token cost per application (and Haiku vs Sonnet split — evidence for the ~45% routing saving); STP rate; referral reasons distribution; confidence calibration curve (predicted confidence vs human-overturn rate).
- **Tracing:** one trace per application spanning all stages; SSE events mirror trace milestones so the frontend progress view and the audit trail share one source of truth.

## 11. API Surface (Hono)

| Endpoint                                  | Purpose                                                   |
| ----------------------------------------- | --------------------------------------------------------- |
| `POST /applications`                      | create application (form JSON or multipart PDF)           |
| `GET /applications/:id/stream`            | **SSE** — stage-by-stage progress for applicant/broker UI |
| `POST /applications/:id/info`             | broker responds to RFI; pipeline resumes                  |
| `GET /queue`                              | underwriter referral queue                                |
| `GET /applications/:id/review`            | full review package (**NDJSON** stream of stage records)  |
| `POST /applications/:id/decision`         | human decision + reason code                              |
| `GET /quotes/:id`                         | quote schedule (HTML/PDF)                                 |
| `POST /admin/guidelines`                  | upload new guideline version → chunk → embed → index      |
| `POST /admin/rules` / `POST /admin/rates` | versioned rule-set / rating-table updates                 |

All request/response bodies are Zod contracts shared with the frontend package.

## 12. Deployment & Environments

### Hosting & topology

- **Container:** single Docker image (Hono server + pipeline workers), deployed on **Railway** (managed container hosting). Kubernetes is deliberately out of scope at this scale — one stateless service + managed Supabase gains nothing from a cluster. The image is standard OCI and the service is stateless (all state in Supabase), so migrating to EKS/GKE — or shipping a Helm chart for a customer-VPC deployment (a realistic ask in insurance) — is a contained, later effort.
- **Environments:** `dev` (mock mode default), `staging` (real models, synthetic data), `prod`. Secrets (Anthropic, Voyage, Supabase service key) via environment; never in code or logs; least-privilege keys per environment.

### CI/CD (GitHub Actions)

- Every push: typecheck → unit tests (Vitest, mock mode) → build image tagged with **git SHA** (never bare `latest`) → deploy on merge to `main`.
- **Eval gate is path-scoped:** the full Promptfoo suite runs only when prompts, guidelines, routing, or model config change (plus a nightly full run); ordinary code commits run typecheck + unit tests only. Eval regression fails the pipeline.
- **Database migrations** are versioned SQL in `supabase/migrations/`, applied automatically per environment in the deploy job — schema can never drift between dev/staging/prod.

### Release safety

- **Rollback:** SHA-tagged image history + one-click redeploy of any previous version. Rollback is the first-class failure response; fix-forward is optional.
- **Resumable pipeline across deploys:** a deploy must not kill in-flight underwriting runs. Every stage is **idempotent and re-entrant** — on restart, an application resumes from its last completed stage (the `applications` status machine is the source of truth), never re-runs from scratch and never wedges.
- **Graceful shutdown:** on SIGTERM the container stops accepting new work, lets in-flight stages complete within a drain window, and closes SSE connections cleanly (clients reconnect and resume from persisted stage state).
- **Health checks:** liveness/readiness endpoint used by the platform for deploy gating and uptime monitoring.

### Alerting & incident response

- **Sentry** for exception aggregation (every error carries `request_id`/`application_id` for trace lookup).
- **Uptime monitoring** on the health endpoint with push notification on failure.
- Alert triggers: pipeline stage failure rate, model API error rate (429/5xx), token-budget breaches, applications stuck in a non-terminal status beyond SLA.

### Data protection & residency

- Supabase project pinned to the **Sydney region** (Australian data residency — an entry requirement for insurance customers, not a nice-to-have).
- **PITR (point-in-time recovery)** enabled; backup restore tested, not assumed.
- `audit_events` retention policy configured explicitly (insert-only, long-horizon retention for compliance).

### Cost controls

- Prompt caching on stable prefixes (system prompt, guideline preamble); per-application token budget alarm; Haiku-first routing.

## 13. Milestones

| Phase           | Scope                                                                                 | Exit criteria                                             |
| --------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **M0 (wk 1)**   | Repo scaffold, Zod contracts for all stage boundaries, mock mode, CI                  | Pipeline runs end-to-end on fixtures                      |
| **M1 (wk 2–3)** | Intake + Extraction + Validation/RFI + Eligibility engine                             | ≥95% extraction accuracy on initial golden set (30 cases) |
| **M2 (wk 4–5)** | Guideline authoring + chunking + RAG + Risk Assessment with citation enforcement      | Retrieval ≥90%, hallucination <2%                         |
| **M3 (wk 6)**   | Rating engine + quote generation + decision engine + routing matrix                   | STP path works: submission → quote < 2 min                |
| **M4 (wk 7–8)** | Underwriting console (NDJSON), HITL actions, audit trail UI                           | Referred case reviewable & decidable end-to-end           |
| **M5 (wk 9)**   | Observability dashboards, eval suite to 60 cases, injection hardening                 | All §9 gates green in CI                                  |
| **M6 (wk 10+)** | Pilot with design-partner broker; calibrate confidence thresholds on real submissions | STP ~70% with zero bad auto-approvals                     |

## 14. Success Metrics (v1 acceptance)

- Quote turnaround (STP path): **< 2 minutes** p95.
- STP rate on in-appetite submissions: **~70%**.
- Extraction accuracy **≥ 95%** field-level; hallucination **< 2%** (citation-validated).
- Token cost per application **~45% lower** than Sonnet-only baseline at equal eval accuracy.
- Zero auto-approved applications overturned for eligibility error in pilot.
- 100% of decisions reconstructible from the audit trail (spot-audit).

## 15. Risks & Open Questions

| Risk / question                                      | Mitigation / decision needed                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confidence calibration is the linchpin of STP safety | Calibrate on golden set + pilot shadow mode (run pipeline, humans decide everything, compare) before enabling auto-approve                                    |
| Guideline authoring effort (quality ceiling of RAG)  | Start with one occupation segment (e.g. management consultants) deep rather than all segments shallow                                                         |
| PDF form variance (scanned, handwritten)             | v1 accepts digital PDFs + web form; scanned/handwritten → auto-refer with raw doc attached                                                                    |
| Regulatory review (AFSL / distribution arrangement)  | Prism operates as tooling for a licensed underwriter/underwriting agency in pilot — the human license-holder owns decisions; confirm arrangement before pilot |
| Rating adequacy (actuarial)                          | v1 rating tables sourced from partner's existing tables, not invented                                                                                         |
| Model deprecations                                   | model IDs pinned + eval suite reruns on any routing change                                                                                                    |
