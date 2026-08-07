# Prism Repository Rebuild Execution and Agent Orchestration Plan

> Parent plan: [Repository Rebuild Plan](./rebuild-plan.md)
>
> Goal: turn the architecture phases into executable branches, PRs, TDD slices, optional subagent waves, and quality gates.

## 1. Core Conclusions

Do not write every test for the final repository upfront. First define the design assets that keep implementation honest:

- module interface;
- invariants and error catalogue;
- edge-case and test traceability matrix;
- contract examples;
- phase exit criteria.

Then implement through vertical TDD slices:

```text
confirm one public interface
-> write one failing behaviour test
-> verify RED for the expected reason
-> implement the minimum behaviour
-> verify GREEN
-> add the next behaviour
-> run the affected quality gate
-> review/refactor as a separate stage
```

Avoid horizontal implementation such as writing hundreds of imagined tests, building every type, building every repository, building every route, and only then attempting integration. That approach freezes the wrong interfaces and tends to test directories and mock calls instead of business behaviour.

## 2. Concurrency Model

The current agent runtime has four total slots:

```text
Main agent             1
Parallel subagents     up to 3
Total                  4
```

Practical rules:

- default to two subagents when the work can be separated cleanly;
- use three only when interfaces are frozen and file ownership does not overlap;
- keep high-coupling work in the main agent;
- do not create parallelism just to fill slots.

All agents share one workspace:

- only the main agent may switch branches, commit, rebase, or merge;
- subagents do not run git branch/commit operations;
- every subagent gets explicit file ownership;
- two agents must not edit `package.json`, lockfiles, root config, or the same module at the same time;
- root tooling, contract indexes, and final integration remain the main agent's responsibility.

## 3. Branch and PR Unit

Do not create one long-lived `rebuild` branch. Each reviewable slice uses a short-lived branch:

```text
chore/quality-foundation
feat/uw-login-routing
feat/uw-review-queue
feat/uw-case-workspace
feat/uw-document-evidence
feat/uw-ai-assessment
feat/uw-decision-pricing
feat/uw-human-review
feat/uw-quote-authoring
feat/uw-runtime-recovery
feat/broker-login-context
feat/broker-application-draft
feat/broker-document-upload
feat/broker-application-submit
feat/broker-rfi-response
feat/broker-quote-acceptance
feat/broker-binding-status
feat/admin-release-control
```

Each branch:

1. starts from latest `main`;
2. contains one describable behaviour goal;
3. includes tests, implementation, documentation, and any migration needed for that goal;
4. opens a PR;
5. passes required checks;
6. receives the Solo Maintainer checklist review;
7. squash merges;
8. deletes the branch;
9. starts the next slice from the new `main`.

Large phases may contain multiple PRs, but every PR must keep the system buildable, testable, and compatible with current `main`.

## 4. Feature Interface Gate

Before TDD starts, confirm the public interface being tested. Each interface record includes:

```text
Module
Public Interface
Caller
Inputs and outputs
Invariants
Ordering constraints
Error modes
Idempotency semantics
Performance/deadline assumptions
Production adapter
Test adapter
Tests that cross this interface
Tests explicitly kept outside this interface
```

Interfaces are confirmed feature by feature. The platform does not freeze every future contract upfront.

| Feature                       | First interface to confirm                  | Observable behaviour                              |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------- |
| Underwriter Login/Routing     | Session Resolution + Resource Authorization | single sign-in, trusted `/me`, route to Workbench |
| Review Queue/Assignment       | `getReviewQueue` / `assignReview`           | tenant/authority scope, single primary assignee   |
| Case Workspace                | `getCaseWorkspace(query, actor)`            | versioned Case/Submission/Evaluation projection   |
| Document Evidence             | `processDocument(task)`                     | scan, OCR, normalization, evidence, conflicts     |
| AI Assessment                 | `evaluateRisk(task)`                        | retrieval, model, schema, citation, safety        |
| Deterministic Decision        | `decideEvaluation(command)`                 | eligibility, pricing, authority, no auto-decline  |
| Human Review                  | `recordReviewDecision(command, actor)`      | assignment, version, authority, override, audit   |
| Quote Authoring               | `authorQuote(command, actor)`               | immutable Quote Version, authority, expiry        |
| Broker Login/Context          | Home-realm Discovery + Session Resolution   | Broker pool, brokerage membership, appointment    |
| Broker Application Draft      | `saveApplicationDraft(command, actor)`      | draft save, ETag concurrency, tenant isolation    |
| Broker Document Upload        | `createDocumentUpload(command, actor)`      | authorized upload, checksum, quarantine, status   |
| Broker Application Submission | `submitApplication(command, actor)`         | atomic Submission, Evaluation, Audit, Outbox      |
| Broker RFI Response           | `submitRfiResponse(command, actor)`         | new Submission/Evaluation, immutable history      |
| Quote Acceptance              | `acceptQuote(command, actor)`               | exact version, expiry, idempotency                |
| Policy Binding                | `bindAcceptedQuote(task)`                   | idempotent PAS, unknown outcome, reconciliation   |
| Admin Release Control         | `publishConfiguration(command, actor)`      | step-up, maker-checker, immutable release         |

If an interface changes materially, update the record and contract before continuing TDD.

## 5. Test Order for Each Vertical Slice

1. **Acceptance example**: start with a human-readable worked example whose expected result comes from the business specification.
2. **Module behaviour test**: write one failing test at the public interface; assert observable results, not private methods.
3. **Minimal implementation**: implement only the behaviour needed for the failing test.
4. **Edge behaviour**: add validation, authorization, idempotency, concurrency, error classification, deadline/timeout, redaction, and version conflicts one at a time.
5. **Real dependency integration**: use real PostgreSQL containers or AWS sandbox contracts for production adapters. Mock only true external system boundaries.
6. **System contract**: add HTTP/Event/Task contracts and N/N-1 compatibility checks.
7. **Failure and journey tests**: add crash points, duplicates, out-of-order delivery, mutation tests, cross-module journeys, performance, and security.
8. **Review/refactor**: after Red -> Green, review interface depth, remove shallow modules, delete tests that only verify implementation details, and keep 100% coverage plus mutation gates.

## 6. Long-Running Engineering Loop

Use this loop for substantial work:

```text
Plan one feature
-> confirm interface and acceptance examples
-> run TDD slice
-> run affected quality gates
-> review/refactor
-> update docs and traceability
-> open PR
-> merge
-> start next feature from main
```

Do not deploy AWS Production during rebuild phases. Phase 1 and Phase 2 product
previews deploy to Railway by default so the project has a public URL for
interviews. Development and sandbox AWS resources may be used only when they are
required by an AWS-specific feature and covered by rollback and cost controls.

## 7. Preview Deployment and AWS Cost-Control Execution Rule

Production-grade AWS/CDK design is required in the repository; production-grade
spend is not required during the rebuild.

Railway is the default public Preview platform for Phase 1 and Phase 2:

```text
Railway Preview
-> public URL / prismunderwriting.au when configured
-> demo or low-cost auth adapter
-> fixture/seed data or cheap persistence
-> deterministic fake AI by default
-> optional live provider calls behind budget flags
```

The Railway Preview is user-facing and interview-ready, but it is explicitly
non-production. It does not claim AWS multi-account isolation, Production
security baseline, Production SLO, or regional DR.

Execution order for infrastructure work:

1. model the resource in CDK;
2. run `cdk synth`;
3. add snapshot, IAM, tagging, encryption, removal-policy, and guardrail tests;
4. use local fake/test adapter where behaviour can be validated without AWS;
5. deploy the product journey to Railway Preview when the phase needs a public
   demo surface;
6. deploy a minimal Development/sandbox AWS stack only when the feature needs
   real AWS behaviour;
7. tear down or scale down the sandbox AWS resource after validation.

Before creating any cost-sensitive AWS resource, record:

```text
resource
reason local validation is insufficient
owner
expected monthly cost
environment/account
TTL or cleanup command
rollback/removal evidence
alarm or budget control
```

Cost-sensitive resources include Aurora, OpenSearch Serverless, NAT Gateway,
always-on ECS services, WAF, Macie, GuardDuty, Security Hub, cross-region
replication, Bedrock, Textract, and CloudWatch log groups with high retention or
high ingest volume.

For Phase 1 and Phase 2, the default pass condition is local tests + CI + CDK
synth + infrastructure guardrail tests + Railway Preview for the user journey.
Real AWS deployment is an exception used only for a specific AWS behaviour
validation. Full multi-account Landing Zone, Production, and DR deployment wait
until Phase 4.

## 8. Phase Execution

### Phase 0 - Completed Quality Foundation

Already completed and merged:

- architecture and quality safety net;
- lint, typecheck, test, coverage baseline;
- Husky, lint-staged, Commitlint;
- PR guardrails;
- initial CI security checks.

Known coverage gaps are explicit RED baselines, not hidden exclusions.

### Phase 1 - Underwriter Workbench End to End

Phase 1 creates no Broker Portal and no Admin Console. The public homepage has one `Sign in`. For now it goes to Workforce Cognito, `/me` resolves trusted membership/role, and the user auto-routes to Underwriter Workbench.

Infrastructure work in Phase 1 starts with local tests and CDK synth. The
public product surface deploys to Railway Preview. A minimal Development/sandbox
AWS deployment is allowed only for the first feature that truly needs real
Cognito/API/hosting behaviour, and it must follow the cost-control record above.

Feature order:

1. Workforce Login and Routing;
2. Review Queue and Assignment;
3. Case Workspace;
4. Document Evidence;
5. AI Assessment;
6. Deterministic Decision and Pricing;
7. Human Review and RFI;
8. Quote Authoring;
9. Underwriting Recovery and Operations.

Because Broker Submit does not exist yet, Local/CI/Development may use a versioned `UnderwritingCaseFixtureAdapter` to create real Submission/Evaluation/Document fixtures. This adapter must not exist in Production composition and must not expose a Production HTTP backdoor.

### Phase 2 - Broker Portal End to End

Phase 2 extends the same public `Sign in` entry with Email/Home-realm Discovery, selecting the Broker or Workforce issuer/app client. One allowed portal auto-routes; multiple workforce portals show an authenticated Workspace Selector.

Feature order:

1. Broker Login and Context;
2. Application Draft;
3. Secure Document Upload;
4. Application Submission;
5. Evaluation Progress;
6. RFI Response;
7. Quote Review and Acceptance;
8. Binding Status.

Phase 2 ends with the real dual-portal journey in Railway Preview: Broker Submit -> Underwriter Review -> Broker RFI/Quote -> Acceptance/Binding.

### Phase 3 - Admin Console End to End

Admin uses the Workforce pool with separate app client/role and step-up for high-risk actions. It covers configuration release, authority, knowledge releases, audit search, recovery, and controlled replay.

### Phase 4 - Production Release, Operations, and DR

Deliver build-once/promote-many, signed manifests, SBOM/provenance, frontend canary, Core API blue/green, Worker drain, database expand/backfill/contract, Workflow aliases, AI shadow releases, observability, runbooks, and Melbourne warm standby restore/failover evidence.

## 9. Starter Instruction for Phase 1.1

Start from a new branch:

```text
feat/uw-login-routing
```

Use TDD and at most three subagents. Confirm the public interface first, keep tests close to the owning feature/module, and continue until the feature's exit criteria pass. Start infrastructure with CDK synth and guardrail tests; deploy the Phase 1 user journey to Railway Preview; deploy Development/sandbox AWS only if real AWS behaviour is needed and the cost-control record is complete. Do not deploy AWS Production.
