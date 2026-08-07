# PRD / SPEC - Prism AI Underwriter Agent

**Product:** AI Underwriter Agent for Professional Indemnity insurance  
**Company:** Prism, Sydney  
**Version:** v2 production target  
**Owner:** Emily Sun  
**Status:** Architecture-aligned rebuild specification

## 1. Problem Statement

Professional Indemnity underwriting for SME risks is still slow, manual, and evidence-heavy. Brokers submit forms and documents, underwriters re-key facts, check appetite, search guidelines, assess risk, calculate premium, route authority, and issue quotes. Much of this work is mechanical, but the business impact is high enough that decisions must remain explainable, reproducible, and auditable.

Prism automates the mechanical path while keeping consequential business authority with deterministic rules and authorized humans. The AI agent helps understand documents, retrieve approved knowledge, surface risk factors, and explain recommendations with evidence. It does not directly approve, decline, price, issue quotes, or bind policies.

## 2. Goals

1. Turn broker submissions and supporting documents into validated risk facts, source-addressable evidence, risk assessment, deterministic pricing, and underwriter-ready cases.
2. Support straight-through auto-quote for clearly in-appetite, low-risk, within-authority cases.
3. Route uncertainty, missing information, authority exceptions, hard knockouts, and decline recommendations to human review.
4. Make every material AI assertion grounded in approved evidence or approved knowledge releases.
5. Keep Submissions, Evidence, AI Results, Pricing, Quotes, Human Decisions, and Configuration Releases immutable and reproducible.
6. Provide complete business audit for compliance and interview-grade architecture explanation.
7. Rebuild feature-first: Underwriter Workbench end to end first, then Broker Portal, then Admin Console.

## 3. Non-Goals

- Auto-decline. Declines require authorized human review.
- Letting AI choose its own tools, model, prompt, tenant, product, knowledge base, price, quote, or binding action.
- Full microservice decomposition for the first production version.
- Runtime micro-frontends.
- Treating Step Functions history, SQS, Redis, logs, or WebSocket messages as business truth.
- Deploying AWS Production during the rebuild phases. Phase 1 and Phase 2 still
  produce public Railway Preview environments for interview demonstration.

## 4. Personas

| Persona                       | Needs                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Broker                        | Draft applications, upload documents, submit, respond to RFI, track progress, review and accept quotes              |
| Underwriter                   | Review assigned cases with evidence, AI assertions, deterministic rules, pricing, authority, and audit context      |
| Senior Underwriter / Approver | Review referrals, overrides, maker-checker approvals, and authority exceptions                                      |
| Admin / Product Risk          | Release versioned products, forms, rules, pricing, authority, clauses, prompts, model policies, and knowledge bases |
| Operator / Security           | Monitor workflows, queues, providers, incidents, audit, replay, and recovery                                        |

## 5. Product Principles

1. **AI analyzes; deterministic code and authorized people decide.**
2. **Auto-quote is allowed; auto-decline is not.**
3. **Evidence comes before recommendation.**
4. **Business facts are immutable.**
5. **Every async side effect is durable and idempotent.**
6. **Portal choice is UX, not authorization.**
7. **Production safety beats demo cleverness.**

## 6. Target Architecture

```text
Single public sign-in
-> Broker Portal / Underwriter Workbench / Admin Console
-> CloudFront + WAF + Cognito
-> Regional API Gateway REST/WebSocket
-> VPC Link + Internal ALB
-> Core API modular monolith on ECS Fargate
-> Aurora PostgreSQL + Transactional Outbox
-> EventBridge + Step Functions Standard
-> workload-specific SQS queues and DLQs
-> Document, AI, External Check, Binding, Outbox workers
-> Bedrock, Textract, OpenSearch, S3, external providers, PAS
```

The Core API owns synchronous commands, queries, authorization, idempotency, optimistic concurrency, domain invariants, and transactional writes. It does not run long AI/document work inside HTTP requests and does not act as a workflow-internal HTTP relay.

Workers persist results before calling back Step Functions. Aurora is business truth. S3 stores documents and large immutable artifacts. OpenSearch is a rebuildable retrieval index.

## 7. Frontend Scope

The frontend is one monorepo with three independently built and deployed applications:

| Application           | Scope                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| Broker Portal         | Draft, upload, submit, progress, RFI, quote acceptance, binding status                |
| Underwriter Workbench | Queue, assignment, case workspace, evidence, AI assessment, decision, quote authoring |
| Admin Console         | Configuration releases, authority, knowledge, audit, operations, recovery             |

The public homepage has one `Sign in`. In Phase 1 it routes to Workforce Cognito and then `/me` auto-routes the user to Underwriter Workbench. In Phase 2, Email/Home-realm Discovery chooses Broker or Workforce identity. An authenticated Workspace Selector appears only when a workforce identity has multiple allowed portals.

## 8. Core Workflow

1. Broker drafts an Application and uploads documents to S3 quarantine.
2. Submit atomically creates immutable Submission, Evaluation, Audit, Outbox, and Idempotency Result in Aurora.
3. Outbox/EventBridge starts the Underwriting Evaluation workflow after commit.
4. Document Processing workflows scan, OCR, normalize, and produce Evidence for each document.
5. Evaluation builds a Validated Risk Snapshot, waits for evidence readiness, runs external checks, retrieves approved knowledge, and requests AI analysis.
6. AI Worker returns schema-valid, citation-validated risk assessment or fails closed.
7. Deterministic rules calculate eligibility, pricing, authority, routing, and quote eligibility.
8. The system routes to Auto Quote, RFI, Human Review, Senior Review, Decline Review, or Operational Hold.
9. Quote Acceptance starts a separate Binding workflow.

RFI does not loop in the original Evaluation. Broker supplements create a new Submission and new Evaluation. Human Review may wait on the same immutable Submission because the human decision concerns that exact input.

## 9. Domain Model

| Concept            | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| Tenant             | Carrier/MGA boundary for product, authority, data, pricing, and knowledge |
| Brokerage          | Distribution organization appointed by a Tenant                           |
| BrokerUser         | Human actor operating through BrokerageMembership                         |
| Application        | Broker-editable journey                                                   |
| Submission Version | Immutable submitted snapshot                                              |
| Case               | Human accountability and operational container                            |
| Evaluation         | One machine underwriting run for one Submission                           |
| Evidence Fragment  | Immutable source-addressable evidence                                     |
| Risk Snapshot      | Validated normalized facts used downstream                                |
| AI Risk Assessment | Structured recommendation with citations                                  |
| Pricing Result     | Deterministic immutable calculation                                       |
| Quote Version      | Immutable broker-facing offer                                             |
| Policy Binding     | Independent issuance workflow after acceptance                            |

## 10. AI Safety Requirements

- Model output must validate against JSON Schema/Zod.
- Every material assertion must cite current approved Evidence or KB Release.
- Invalid schema, invalid citation, prompt injection, safety block, timeout, budget breach, or unsupported fallback must not silently pass.
- Documents, provider responses, and RAG text are untrusted data.
- The model has no SQL, arbitrary HTTP, messaging, S3 write, decision, pricing, quote, or binding tool.
- Prompt/model/KB/guardrail changes are versioned releases with eval evidence.
- Human feedback is audit/offline-eval input and does not directly mutate online model behaviour.

## 11. Data and Audit Requirements

- Aurora PostgreSQL is the source of truth for business state, versions, idempotency, outbox, and audit metadata.
- S3 stores original documents, OCR/normalized artifacts, evidence packages, large AI artifacts, and immutable audit archives.
- Business events are published through Transactional Outbox after commit.
- Every decision records actor, tenant, membership, authority, reason, configuration versions, evidence references, pricing details, AI release, and correlation/causation.
- Runtime telemetry, infrastructure audit, and business audit are separate.

## 12. Quality Requirements

Target gates for repository-owned executable TypeScript/TSX:

```text
Statements  100%
Branches    100%
Functions   100%
Lines       100%
Per-file    true
```

Coverage is supplemented by:

- domain unit tests;
- use-case tests;
- real PostgreSQL integration tests;
- OpenAPI/Event/Task contract tests;
- workflow retry/timeout/callback tests;
- Playwright E2E;
- tenant isolation and authorization tests;
- AI eval and citation tests;
- security, resilience, load, and DR tests.

Live model/provider tests are isolated from deterministic PR checks.

## 13. Deployment Requirements

- Phase 1 and Phase 2 use Railway as the default public Preview platform so the
  product journey is visible at a URL such as `prismunderwriting.au` or a
  Railway preview domain.
- Railway Preview is explicitly non-production. It demonstrates UI and workflow
  behaviour but does not claim Production SLO, AWS multi-account isolation, full
  security baseline, or DR readiness.
- AWS Organizations multi-account baseline: Management, Security, Log Archive, Shared Services/CI, Backup/Recovery, Development, Staging, Production.
- Sydney `ap-southeast-2` primary across 3 AZs.
- Melbourne `ap-southeast-4` warm standby.
- RTO <= 1 hour and RPO <= 5 minutes.
- GitHub Actions OIDC with short-lived roles.
- Build once, promote the same immutable digest.
- No long-lived AWS keys in GitHub Secrets.
- Frontend, Core API, Workers, Database, Workflow, AI Release, and KB Release are versioned separately.
- Production promotion is protected and must have rollback evidence.

## 14. Rebuild Phases

| Phase   | Scope                               | Exit Criteria                                                                                                           |
| ------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | Quality foundation and architecture | completed and merged                                                                                                    |
| Phase 1 | Underwriter Workbench end to end    | Underwriter can log in, review assigned cases, inspect evidence/AI/rules/pricing, complete RFI/decision/quote authoring |
| Phase 2 | Broker Portal end to end            | Broker can draft, upload, submit, track progress, respond to RFI, accept quote, and view binding status                 |
| Phase 3 | Admin Console end to end            | Admin can safely release immutable configuration with step-up, maker-checker, eval, audit, rollback                     |
| Phase 4 | Production release, ops, and DR     | protected promotion, runbooks, alarms, rollback, restore, failover evidence                                             |

## 15. Success Metrics

- Underwriter can complete the Phase 1 review journey end to end.
- Broker/Underwriter/Broker dual-portal journey passes in Phase 2.
- No cross-tenant data exposure in automated tests.
- No AI output reaches business routing without schema and citation validation.
- Every state-changing command is idempotent or version-protected.
- Every material business action is auditable.
- Production readiness evidence demonstrates RPO <= 5 minutes and RTO <= 1 hour before Production deployment.
