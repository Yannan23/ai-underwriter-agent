# Prism AI Underwriter Agent Repository Rebuild Plan

> Plan date: 2026-08-07
>
> Goal: rebuild the current M0 demo into a production-grade AI Underwriter platform that matches the confirmed architecture, is testable, releasable, recoverable, and interview-ready.
>
> Primary references: [Production architecture](./architecture.md) · [Backend architecture](./backend-architecture.md) · [Frontend architecture](./frontend-architecture.md) · [Deployment architecture](./deployment-architecture.md) · [Core runtime path](./core-underwriting-runtime-architecture.md)
>
> Execution detail: [TDD, subagents, and long-running engineering loop](./rebuild-execution-plan.md)

## 1. Executive Summary

The rebuild keeps TypeScript, pnpm monorepo, Zod contracts, deterministic rules, and useful business fixtures, but it does not keep layering production capabilities on top of the current in-memory pipeline.

Target deployment model:

```text
3 independently deployed frontend applications
-> Regional API Gateway REST/WebSocket
-> Internal ALB
-> Core API modular monolith on ECS Fargate
-> Aurora PostgreSQL + Transactional Outbox
-> EventBridge + Step Functions Standard
-> workload-specific SQS/DLQ
-> independently deployed ECS Fargate workers
-> Bedrock / Textract / OpenSearch / external providers / PAS
```

The rebuild is feature-first and portal-by-portal. It does not start with a large horizontal foundation of every database table, every route, and every contract. Each slice must deliver:

- one clear and deep module;
- a small stable public interface;
- production adapter and test adapter;
- database migration if needed;
- unit, integration, contract, E2E, and failure tests proportional to the feature;
- metric, log, trace, and audit events;
- CDK resources and least-privilege IAM when the feature needs AWS;
- runbook, alarm, rollback path, and documentation.

## 2. Coverage and Test Standard

For repository-owned executable TypeScript/TSX, the target is:

```text
Statements  100%
Branches    100%
Functions   100%
Lines       100%
Per-file    true
```

Coverage is not a substitute for behaviour confidence. The plan also requires:

- decision-table tests;
- property-based tests;
- state-model tests;
- mutation tests;
- real PostgreSQL integration tests;
- AWS sandbox contract tests;
- Playwright E2E;
- security, AI evaluation, load, resilience, and DR tests.

"Cover all edge cases" means maintaining a versioned risk/edge-case catalogue where every item has a Test ID, Owner, test layer, and evidence. New defects first get a regression test, then an implementation fix.

## 3. Current Baseline

Existing useful assets:

- TypeScript/pnpm workspace;
- Zod contracts;
- demo pipeline logic for eligibility, risk, pricing, and routing;
- mock fixtures and some unit tests;
- ESLint, Prettier, Husky, Commitlint, and basic GitHub Actions;
- reviewed production architecture documents;
- a demonstrable Hono API and static page.

Demo decisions to replace:

| Current demo design                 | Production target                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| In-memory `Map` application state   | Aurora PostgreSQL as business source of truth                                                 |
| Fire-and-forget sequential pipeline | Step Functions Standard + SQS Callback Workers                                                |
| SSE progress                        | WebSocket change notification + REST projection                                               |
| One static web page                 | Broker, Underwriter, Admin as separate applications                                           |
| Direct Anthropic/Voyage SDKs        | controlled Model Gateway; target Bedrock/OpenSearch                                           |
| In-memory mini-RAG                  | versioned approved KB + OpenSearch Serverless                                                 |
| One application status              | separate Case, Submission, Evaluation, Stage, Quote, Binding state machines                   |
| No authentication                   | Cognito/enterprise federation + Core API authorization                                        |
| Railway-only production claim       | Railway Preview for Phase 1/2; AWS multi-account CDK + build once/promote many for Production |

## 4. Rebuild Principles

### 4.1 Prefer Deep Modules

The module interface is both the caller surface and the test surface. Complexity belongs inside the module so callers do not need to understand transactions, locks, Outbox, retries, or adapter details.

For example, Submission exposes:

```ts
submitApplication(command, actorContext): Promise<SubmissionAccepted>
```

Callers do not separately call:

```text
createSubmission
createEvaluation
insertOutbox
insertAudit
commitTransaction
```

Those steps are guaranteed by one deep module in one transaction.

### 4.2 Create Interfaces Only at Real Variation Points

- PostgreSQL: Aurora adapter in production, real PostgreSQL test adapter in tests.
- Model: Bedrock adapter in production, deterministic fake adapter in tests.
- External Provider/PAS: HTTPS adapter in production, scripted fake adapter in tests.
- Clock, ID, random, and object storage are injectable for deterministic tests.
- Do not create empty ports for simple functions that only have one implementation and no variation need.

### 4.3 Business Facts Before Workflow

No workflow starts before Aurora commits business facts. Workers persist results before calling back Step Functions.

### 4.4 Test Behaviour, Not Implementation Details

Tests assert observable outcomes through module interfaces:

- returned result;
- persisted business facts;
- Outbox/Event;
- Audit;
- error semantics;
- idempotency and concurrency behaviour.

Do not expose private methods for tests. Do not encode repository call order as fragile mock expectations.

### 4.5 AI Has No Final Business Authority

AI only produces evidence-backed structured recommendations. Eligibility, Pricing, Authority, Quote, Decline Review, and Binding are controlled by deterministic rules and authorized people.

## 5. Target Repository Shape

Features are colocated by owning module or application feature. Tests live near the code they verify.

```text
apps/
  core-api/
    src/
      entry/http/
      modules/
        identity-access/
        tenancy/
        submission/
        document/
        underwriting/
        pricing/
        review/
        quote/
        binding/
        configuration/
        platform/
      composition-root/

  broker-portal/
  underwriter-workbench/
  admin-console/

workers/
  document-worker/
  ai-underwriter-worker/
  external-check-worker/
  binding-worker/
  outbox-publisher/

packages/
  contracts/
  testing/
  config/
  observability/

infra/
  organization/
  network/
  security/
  data/
  compute/
  workflows/
  identity/
  edge/
  observability/
  recovery/
```

Inside a module, use `domain/application/ports/adapters` where it clarifies ownership, but do not create empty template folders.

## 6. Quality Foundation

Phase 0 is complete and merged. It covers:

- architecture and quality safety net;
- lint, typecheck, format, unit, integration, and coverage gates;
- Husky, lint-staged, Commitlint;
- Solo Maintainer PR guardrails;
- initial CI security checks.

Any known coverage gaps remain explicit RED baselines and must not be hidden through exclusions.

## 7. Preview and AWS Cost-Control Policy

The production architecture remains AWS multi-account/CDK, but the rebuild must
not spend money just to look production-grade.

Phase 1 and Phase 2 should still produce a public, interview-ready Preview
deployment. Because this project already has Railway history, Railway is the
default Preview platform for the early phases:

```text
prismunderwriting.au or preview domain
-> Railway Preview app/API
-> demo auth or low-cost auth adapter
-> fixture/seed data or cheap persistence
-> deterministic fake AI by default
-> optional live provider calls behind budget flags
```

This Preview demonstrates the user journey and product behaviour. It is not AWS
Production and does not claim Production SLA, multi-account isolation, full
security-service baseline, or regional DR.

Default implementation mode:

- write CDK and infrastructure tests in the repo;
- run `cdk synth`, snapshot tests, IAM/policy tests, and guardrail tests in CI;
- prefer local fakes, deterministic adapters, Testcontainers PostgreSQL, and
  contract tests before creating cloud resources;
- create AWS resources only when a feature needs cloud behaviour that cannot be
  validated locally;
- deploy product previews to Railway during Phase 1 and Phase 2;
- deploy AWS resources only to Development or a clearly named sandbox when an
  AWS-specific behaviour must be validated;
- do not deploy AWS Production until Phase 4 readiness criteria are met.

Cost-sensitive resources such as Aurora, OpenSearch Serverless, NAT Gateway,
ECS always-on services, WAF, Macie, GuardDuty, Security Hub, cross-region
replication, Bedrock, and Textract must be opt-in for sandbox validation. They
need explicit owner, expected monthly cost, cleanup command, TTL or removal
plan, and alarms before creation.

Do not enable the full Landing Zone, Melbourne warm standby, Production
observability stack, or complete security-service baseline for normal feature
development. It is acceptable, and preferable for a solo interview project, to
keep the production-grade design in code and docs while validating most of it
through Railway Preview, `synth`, tests, and minimal AWS sandbox deployments.

Interview framing: Prism has a production-ready deployment design, but the
personal project rebuild uses cost-aware implementation gates. Architecture
maturity does not require leaving expensive managed resources running.

## 8. Feature-First Roadmap

### Phase 1 - Underwriter Workbench End to End

Phase 1 does not create Broker Portal or Admin Console. The public homepage has one `Sign in`. In this phase it goes directly to Workforce Cognito. After authentication, Core API `/me` resolves trusted membership/role to `UNDERWRITER` and auto-routes to Underwriter Workbench.

Phase 1 must produce a public Railway Preview for the Underwriter Workbench
journey. The first real AWS-specific feature gradually establishes only the
minimal Development account baseline, GitHub OIDC, CDK bootstrap, and resources
actually required by that feature. Prefer Railway Preview for product
demonstration and `cdk synth` plus infrastructure tests for AWS design. Do not
deploy AWS Production.

Feature order:

1. **Workforce Login and Routing**: public entry, Authorization Code + PKCE, Workforce Cognito, JWT verification, `/me`, Underwriter protected route, logout/refresh/expiry, and the minimal hosting/API path.
2. **Review Queue and Assignment**: queue projection, filters/pagination, single primary assignee, claim/reassign, tenant/authority scope, and first Aurora migration if needed.
3. **Case Workspace**: Case/Submission/Evaluation versions, applicant facts, document list, status, superseded guard, and URL-restorable tabs.
4. **Document Evidence**: source viewer, document workflow, Textract/OCR, normalization, evidence pointers/hashes, conflict/confidence.
5. **AI Assessment**: versioned KB, retrieval scope, Bedrock gateway, guardrails, structured result, citation validator, evidence-first UI.
6. **Deterministic Decision and Pricing**: eligibility, risk features, pricing, authority, clause release, no-auto-decline, replayable result.
7. **Human Review and RFI**: optimistic version, review decision, override reason, maker-checker, RFI, full business audit.
8. **Quote Authoring**: underwriter-reviewed Quote Version with coverage, excess, premium, clauses, and expiry. No acceptance or Binding yet.
9. **Underwriting Recovery and Operations**: operational hold, DLQ/replay controls, runbooks, alarms, and recovery tests.

Phase 1 uses a versioned `UnderwritingCaseFixtureAdapter` in Local/CI/Development to create real Submission/Evaluation/Document fixtures because Broker Submit does not exist yet. This adapter must not exist in Production composition and must not expose a Production HTTP endpoint.

Phase 1 exit criteria: an authorized Underwriter can sign in, see assigned cases, open a Case, inspect source evidence and AI assertions, verify deterministic rules/pricing, and complete RFI, Human Decision, or Quote Authoring in a public Railway Preview. Cross-tenant access, unassigned access, insufficient authority, stale versions, workflow/worker failures, and missing audit are rejected or safely recovered by automated tests. The Preview is explicitly labelled as non-production.

### Phase 2 - Broker Portal End to End

Phase 2 extends the same public `Sign in` entry with Email/Home-realm Discovery. It chooses the correct issuer/app client between Broker Cognito and Workforce Cognito. A user with one allowed portal auto-routes; a future workforce identity with Underwriter/Admin permissions sees an authenticated Workspace Selector.

Feature order:

1. Broker Login and Context;
2. Application Draft;
3. Secure Document Upload;
4. Application Submission;
5. Evaluation Progress;
6. RFI Response;
7. Quote Review and Acceptance;
8. Binding Status.

Phase 2 exit criteria: Broker enters through the single sign-in entry and completes Draft, Document Upload, Submit, Progress, RFI, Quote Acceptance, and Binding Status in the public Railway Preview. The Submission enters the Phase 1 Underwriting Runtime and is completed through a real Broker -> Underwriter -> Broker journey. The Preview remains non-production; AWS Production waits for Phase 4.

### Phase 3 - Admin Console End to End

Admin Console is added only after Broker Portal is complete. Admin and Underwriter share the Workforce User Pool but use separate app clients/roles. High-risk operations require step-up authentication.

Features:

1. Admin login, step-up, role/permission, maker-checker;
2. Product/Form release;
3. Rules, Pricing, Authority, and Clause release;
4. Prompt/Model Policy and Knowledge Release;
5. Validation/Eval, scheduled activation, canary, rollback pointer;
6. Membership, appointment, and authority management;
7. Audit search, operations hold, recovery, and controlled replay.

### Phase 4 - Production Release, Operations, and DR

Deliver build once/promote many, signed manifest, SBOM/provenance, frontend canary, Core API blue/green, Worker drain, database expand/backfill/contract, Workflow alias, AI shadow, notification/analytics/audit archive consumers, SLO/burn-rate/runbooks, and Melbourne warm standby restore/failover evidence.

Phase 4 exit criteria: the same digest promotes from Dev to Staging; Production promotion is protected; Underwriter, Broker, and Admin journeys plus rollback, restore, and failover have measured evidence meeting RPO <= 5 minutes and RTO <= 1 hour.

## 9. First 12 Pull Requests

Each PR must produce runnable vertical behaviour. Do not create empty directories, generic contracts, or empty AWS skeletons.

1. `feat/uw-login-routing`: single sign-in -> Workforce JWT -> `/me` -> Underwriter Workbench.
2. `feat/uw-review-queue`: test cases enter Queue, with pagination/filtering and Assignment.
3. `feat/uw-case-workspace`: Queue -> Case Workspace with version guards.
4. `feat/uw-document-evidence`: document processing result -> evidence viewer.
5. `feat/uw-ai-assessment`: cited AI Recommendation -> Workbench.
6. `feat/uw-decision-pricing`: deterministic Eligibility/Pricing/Authority -> Workbench.
7. `feat/uw-human-review`: versioned human review/RFI/decision.
8. `feat/uw-quote-authoring`: immutable Quote Version authored by Underwriter.
9. `feat/uw-runtime-recovery`: workflow/worker failure recovery and operations.
10. `feat/broker-login-context`: single entry with Realm Discovery -> Broker Portal.
11. `feat/broker-application-draft`: Broker Draft and autosave.
12. `feat/broker-document-upload`: secure direct upload and document readiness.

Broker features continue with Submission, Progress, RFI, Quote Acceptance, and Binding Status. Admin work starts only after Phase 2 is green.

## 10. Definition of Done

No module or feature is complete unless:

- interface, invariant, error modes, and ownership are documented;
- illegal cross-module imports are absent;
- unit coverage is 100% with per-file gates;
- required property, mutation, integration, contract, E2E, and failure tests pass;
- edge-case catalogue is updated;
- tenant/authz/PII/threat model are reviewed;
- metric, log, trace, and audit are implemented and redaction-tested;
- alarm, owner, runbook, and SLO are defined;
- CDK, IAM, and guardrail tests pass where infrastructure is touched;
- any deployed AWS sandbox resource has owner, cost expectation, TTL or cleanup
  plan, and rollback/removal evidence;
- Phase 1/2 Preview deployment is available on Railway or an equivalent preview
  platform and is labelled non-production;
- N/N-1 contract and migration compatibility are verified;
- Development/Staging deployment, verification, and rollback are possible where relevant;
- docs, ADRs, and operational notes are updated;
- TODOs, feature flags, and guardrail exceptions have owners and expiry.

## 11. Shortcuts Not Allowed

- Do not wrap the existing sequential `packages/pipeline` in one Lambda and call it a production workflow.
- Do not let Step Functions call Core API for internal steps.
- Do not put all worker tasks on one shared SQS queue.
- Do not use DynamoDB, Redis, SQS, Step Functions history, or logs as the business fact database.
- Do not run DDL automatically at app startup.
- Do not put live model tests in normal unit/coverage jobs.
- Do not achieve fake 100% coverage through exclusions.
- Do not test mock call counts as domain behaviour.
- Do not write assertion-free tests for coverage.
- Do not let WebSocket become business truth.
- Do not let AI auto-decline, price, approve, or bind.
- Do not store long-lived AWS keys in GitHub Secrets.
- Do not rebuild different artifacts per environment.
- Do not edit prompts, rules, workflows, or infrastructure directly in the Production console.
- Do not leave expensive sandbox AWS resources running without owner, TTL,
  cleanup path, and cost alarm.
- Do not present Railway Preview as AWS Production or as evidence of DR/SLA
  readiness.
