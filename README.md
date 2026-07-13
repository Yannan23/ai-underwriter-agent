# Prism AI Underwriter Agent

**🔴 Live demo: [prismunderwriting.au](https://prismunderwriting.au/)** — submit a proposal and watch all nine underwriting stages stream in real time.

An AI underwriting agent for **Professional Indemnity (PI) insurance** that automates the path from broker submission to issued quote — while keeping humans accountable for every judgment call.

Straightforward, in-appetite applications are quoted in **under 2 minutes** with no human touch. Medium- and high-risk submissions arrive at a human underwriter **pre-analysed**: extracted data, fired eligibility rules, cited guideline references, and a recommended decision.

> 📄 Full product spec: [prism-ai-underwriter-prd.md](./prism-ai-underwriter-prd.md)

## Why

PI underwriting today is a manual, multi-day process: a broker emails a proposal form, an underwriter re-keys the data, checks appetite, reads the underwriting manual, rates the premium in a spreadsheet, and issues a quote. For standard SME risks, most of that work is mechanical — yet every submission waits in the same queue as complex risks.

## Design principles

1. **LLMs extract and reason; code decides.** Eligibility rules, pricing logic, and final decisions live in deterministic TypeScript. The model never makes a regulatory or financial decision autonomously.
2. **Auto-approve exists; auto-decline does not.** A decline is always recommended to a human underwriter, never issued by the machine.
3. **Every recommendation is citation-grounded.** Risk assessments must cite retrieved, versioned underwriting guideline chunks — validated by code, not just prompted. Findings with invalid citations force a human referral.
4. **Contracts first.** Every pipeline stage boundary is a Zod schema defined before implementation. A mock mode swaps model calls for typed fixtures, enabling deterministic integration tests and offline demos.
5. **Reproducible decisions.** Model IDs, prompt versions, guideline versions, rule sets, and rating tables are all versioned and recorded per decision — any historical decision can be fully reconstructed.

## Pipeline

The pipeline mirrors how a human PI underwriter actually works. Each stage is independently testable, observable, and auditable.

| #   | Stage                                                    | Executor                              |
| --- | -------------------------------------------------------- | ------------------------------------- |
| 0   | Intake & ingestion (PDF / web form)                      | Deterministic                         |
| 1   | Extraction → typed schema with per-field confidence      | LLM — Claude Haiku                    |
| 2   | Validation & Request-for-Information loop                | Deterministic (Zod)                   |
| 3   | Eligibility / knockout rules (versioned appetite config) | Deterministic rules engine            |
| 4   | Guideline retrieval (RAG)                                | Voyage embeddings + pgvector + rerank |
| 5   | Risk assessment, citation-enforced                       | LLM — Claude Sonnet                   |
| 6   | Decision reasoning → deterministic decision engine       | LLM recommends, code decides          |
| 7   | Pricing & quote generation (versioned rating tables)     | Deterministic rating engine           |
| 8   | Human-in-the-loop routing & review console               | Deterministic routing + human         |

**Model routing:** lightweight extraction and classification run on Claude Haiku; multi-step reasoning runs on Claude Sonnet — cutting per-application token cost roughly in half versus a Sonnet-only baseline, with eval-verified accuracy parity.

## Stack

| Layer     | Technology                                               |
| --------- | -------------------------------------------------------- |
| Runtime   | TypeScript · Hono · Docker                               |
| Models    | Anthropic Claude (Haiku / Sonnet) via structured outputs |
| Retrieval | Voyage embeddings + reranking · Supabase pgvector        |
| Data      | Supabase (PostgreSQL · pgvector · object storage)        |
| Contracts | Zod schemas at every stage boundary                      |
| Streaming | SSE (applicant progress) · NDJSON (underwriting console) |
| Evals     | Promptfoo + curated golden dataset, gating CI releases   |
| CI/CD     | GitHub Actions                                           |

## Quality gates

Every prompt, model, or guideline change runs the Promptfoo eval suite in CI. Releases are blocked on regression against:

- **≥ 95%** field-level extraction accuracy
- **< 2%** hallucination rate (risk findings failing machine citation-validation)
- **≥ 90%** retrieval quality (relevant chunk in top-6 after rerank)
- **100%** routing correctness on knockout and referral cases
- **100%** prompt-injection resistance cases

## Observability

Structured JSON logging on every stage: request ID, model, latency, token usage, cost, confidence, and decision path — supporting debugging, cost tracking (Haiku vs Sonnet split), confidence-calibration analysis, and regulatory audit.

## Quickstart

```bash
pnpm install
pnpm demo:mock   # offline demo — all model calls replaced by typed fixtures
# open http://localhost:3000, submit the form, watch the 9 stages stream live
```

Try `architect` as the occupation to see an eligibility knockout routed to a human — decided by the rules engine before a single model token is spent.

## Status

🚧 **M0 complete** — the 9-stage pipeline runs end-to-end in mock mode behind a live SSE demo UI; deterministic engines (eligibility, rating, routing, citation validation) are real. Real model calls land next. Roadmap (see [PRD §13](./prism-ai-underwriter-prd.md#13-milestones)):

- **M0** ✅ — scaffold, Zod stage contracts, mock mode, CI
- **M1** — intake, extraction, validation/RFI, eligibility engine
- **M2** — guideline corpus, RAG, citation-enforced risk assessment
- **M3** — rating engine, quote generation, decision routing
- **M4** — underwriting console (NDJSON) with HITL actions and audit trail
- **M5** — observability dashboards, 60-case eval suite, injection hardening
- **M6** — design-partner pilot in shadow mode, confidence calibration

---

Built by [Emily Sun](https://linkedin.com/in/emily-sunshine/) · Prism, Sydney
