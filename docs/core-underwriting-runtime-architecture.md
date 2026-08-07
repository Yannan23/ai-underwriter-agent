# Prism AI Underwriter Core Underwriting Runtime Architecture

> Document status: derived from `docs/diagrams/174.PNG`
>
> View scope: the core runtime path for a Submission from frontend intake through Policy Binding
>
> Deployment region: AWS `ap-southeast-2` (Sydney), across 3 Availability Zones

![Prism AI Underwriter Core Underwriting Path](./diagrams/174.PNG)

## 1. What This Diagram Shows

This is a **Runtime View**. It answers these questions:

- how Brokers, Underwriters, and Administrators enter the system;
- how the Core API reliably accepts and persists a Submission;
- how long-running document processing, external checks, and AI analysis run asynchronously;
- how Step Functions, SQS, and Workers cooperate through Callback Task Tokens;
- where documents, business state, and AI evidence are stored;
- how Workers access Bedrock, Textract, OpenSearch, and external data providers;
- how quote acceptance calls the Policy Administration System to complete Binding;
- which work sits on the core underwriting path and which work is moved to asynchronous side channels.

It is not a complete AWS Landing Zone or deployment overview. The following topics are intentionally covered in other views:

- security governance baselines such as GuardDuty, Security Hub, CloudTrail, and AWS Config;
- the delivery plane such as ECR, GitHub Actions, AppConfig, and promotion;
- multi-region disaster recovery such as Melbourne warm standby, data replication, and regional failover;
- detailed domain modules, database tables, and frontend feature structure.

This separation keeps the core business diagram readable and avoids stacking services that are not directly involved in a single underwriting request.

## 2. Architecture Boundaries in the Diagram

### 2.1 Global Edge and Identity

This area handles user entry, static frontend delivery, and authentication.

| Component                    | Responsibility in the diagram                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| Broker · Underwriter · Admin | Three browser user groups using Broker Portal, Underwriter Workbench, and Admin Console |
| Route 53                     | Frontend DNS and regional entry resolution                                              |
| AWS WAF                      | Edge filtering for common web attacks and invalid requests                              |
| AWS Shield                   | Baseline DDoS protection for internet-facing entry points                               |
| CloudFront                   | Delivers the three independently deployed SPAs and connects to their S3 origins         |
| Amazon Cognito               | Hosts User Pools and federates with enterprise SAML/OIDC identity providers             |

The diagram label `authentication only - not on the data path` means Cognito handles login, token issuance, and identity federation, but underwriting business data does not pass through Cognito. After the browser obtains a token, it calls API Gateway directly with a JWT.

`Route 53 · WAF · Shield · CloudFront` are combined as one simplified edge entry node for readability. They are not a single AWS service. The three frontend applications still have independent CloudFront distributions and S3 origins.

### 2.2 Primary Region - Sydney

Core business runtime runs in `ap-southeast-2`, with a target deployment across 3 AZs.

Network constraints shown in the diagram:

- VPC CIDR is `10.20.0.0/16`;
- Core API and Workers run in private application subnets;
- Aurora lives in isolated data subnets;
- ECS application tasks do not receive public ingress;
- AWS managed services are accessed privately through VPC Endpoints where possible;
- only external providers and the PAS use controlled NAT egress.

The diagram does not expand every AZ, subnet, route table, security group, NAT Gateway, or VPC Endpoint because its focus is the runtime path.

### 2.3 External Systems

External systems sit outside Prism's trust boundary and are accessed through allowlists, TLS, secret rotation, timeouts, retries, circuit breakers, and egress controls.

| External system                | Purpose                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Policy Administration System   | Receives idempotent Binding requests and turns accepted Quotes into Policies |
| Registry · Claims · Fraud Data | Provides company registry, claims history, fraud, and compliance enrichment  |
| Notification Channels          | Sends email, SMS, webhooks, and events for SIEM or analytics consumers       |

## 3. Core Component Responsibilities

### 3.1 API Gateway

The single node represents two logical entry points:

- **Regional REST API**: commands and queries for Submissions, Cases, Quotes, Review, and Binding;
- **WebSocket API**: progress notifications for Evaluation, Document Processing, and Binding.

API Gateway validates Cognito-issued JWTs and forwards REST requests to the private ALB through VPC Link. WebSocket is a state-notification channel, not the source of business truth. After reconnecting, clients must read the current state again through REST.

### 3.2 Internal ALB

The internal Application Load Balancer lives in the private network. It only accepts traffic from API Gateway VPC Link and sends requests to the Core API private target group.

It owns:

- ECS task health checks;
- cross-AZ traffic distribution;
- target group management;
- the private entry point for Core API.

ALB does not own identity authorization or domain rules.

### 3.3 ECS Fargate - Core API

Core API is a modular monolith running as multiple ECS Fargate tasks across 3 AZs. It contains Broker, Underwriter, and Admin BFF route groups, but those route groups are not deployed as separate backend services.

Core API owns:

- tenant, membership, role, and authority authorization;
- request validation and domain invariants;
- Application Draft and immutable Submission Version;
- Case, Human Review, Quote, and Acceptance state;
- idempotent command handling and optimistic concurrency;
- writing business state and Outbox Events in the same database transaction;
- creating Evaluation IDs, without running long AI analysis inside the HTTP request.

Core API is not an internal HTTP relay between Step Functions states.

### 3.4 Aurora PostgreSQL

Aurora PostgreSQL is the business source of truth. The diagram label `submission truth + outbox` means it stores at least:

- Applications, Submissions, and Evaluations;
- Case Assignment, Human Review, and Decisions;
- Quote Versions, Acceptance, and Binding state;
- Worker result metadata and idempotency records;
- Business Audit Events;
- the Transactional Outbox.

Core API uses RDS Proxy for database connection management. One Submission submit must complete the following in the same database transaction:

1. write the immutable Submission;
2. create the Evaluation;
3. write the Outbox Event;
4. commit the transaction.

If the transaction fails, all changes roll back together. This prevents intermediate states such as "Submission was saved but the workflow never starts" or "workflow started but the Submission does not exist."

### 3.5 S3 - Documents and Evidence

The S3 node is a logical summary of document storage capabilities:

- presigned upload;
- quarantined document;
- original document;
- OCR and normalized artifacts;
- Evidence Package;
- large AI input/output artifacts;
- immutable Audit Archive.

A production implementation may use multiple buckets or controlled prefixes to separate lifecycle and permission boundaries. Aurora stores business metadata, versions, and object references. S3 stores documents and large objects. S3 must not replace Aurora as the business state machine.

### 3.6 Outbox Relay and EventBridge

The Outbox Relay reads unpublished Outbox Records from Aurora, publishes them to EventBridge, and records publish status after success.

EventBridge owns:

- routing typed Domain Events to consumers;
- starting the matching Step Functions state machine;
- sending non-critical processing such as notifications, analytics, and audit archive to side-channel consumers.

EventBridge does not store underwriting business truth. Consumers must tolerate duplicate delivery.

The arrow from Aurora to EventBridge is labelled `outbox relay`. This is a logical responsibility and may be implemented by a dedicated Outbox Relay Worker.

### 3.7 Step Functions Standard

The Step Functions node represents three separate Standard workflows, not one giant state machine:

| Workflow                | Responsibility                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Underwriting Evaluation | Orchestrates evidence collection, analysis, rules, and final Evaluation state for one Submission |
| Document Processing     | Runs scan, OCR, normalization, classification, and evidence generation for one document          |
| Policy Binding          | Calls PAS after quote acceptance and handles success, failure, and unknown outcomes              |

Step Functions owns business-stage ordering, timeouts, retries, catches, parallel branches, and callback waits. It does not store final domain facts.

`Submit Application` is not part of Step Functions. Core API must first complete the database commit; only then does Outbox/EventBridge start the workflow.

### 3.8 SQS + DLQ

Step Functions does not call Workers indirectly through Core API. It sends typed Task Envelopes to workload-specific SQS queues.

Typical queues:

- Document Processing Queue;
- AI/RAG Analysis Queue;
- External Check Queue;
- Binding Queue.

Each queue has its own DLQ and independent:

- visibility timeout;
- retry and redrive policy;
- concurrency limit;
- scaling policy;
- IAM permissions;
- payload schema and version.

The Task Envelope carries only control information such as IDs, versions, tenant context, correlation ID, trace context, and Task Token. Large documents or model results are passed by S3 reference, not directly inside the message.

### 3.9 ECS Fargate - Worker Fleet

The Worker Fleet is the asynchronous compute plane, deployed and scaled separately from Core API. The diagram summarizes multiple worker workloads in one node:

- Document Worker;
- AI/RAG Worker;
- External Integration Worker;
- Policy Binding Worker;
- Outbox Relay Worker.

The correct execution order for one callback task is:

1. read a typed task from the dedicated SQS queue;
2. check with a business idempotency key whether the task is already complete;
3. call AWS managed services or external providers;
4. persist business results to Aurora and write large artifacts to S3;
5. commit the database transaction;
6. notify Step Functions success or failure with the Callback Task Token;
7. delete the SQS message.

The key constraint is **persist first, callback second**. If a Worker crashes after persisting but before callback, the retry must read the existing result and safely callback again without producing duplicate business effects.

### 3.10 AI and Retrieval

This area contains three controlled capabilities:

| Service           | Responsibility                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| Amazon Textract   | Extracts text, tables, and structured fields from approved documents                                            |
| Amazon OpenSearch | Stores approved, versioned Knowledge Base vector indexes with Tenant/Product-scoped retrieval                   |
| Amazon Bedrock    | Produces structured underwriting recommendations from Risk Snapshot, Evidence, rule context, and cited material |

This box represents a set of managed services accessed privately through VPC Endpoints. It should not be read as Bedrock and Textract literally running inside customer VPC subnets.

AI output is an evidence-backed recommendation, not a final business decision. It must include:

- fixed JSON Schema;
- Evidence Citations;
- Model, Prompt, Knowledge Base, and Policy Version;
- Confidence, Uncertainty, and Missing Information;
- Safety and Schema Validation results.

AI cannot modify a Submission, decide final price, approve a risk, decline coverage, or bind a policy. Deterministic Eligibility, Pricing, Authority Rules, and Human Underwriters retain final business authority.

## 4. End-to-End Runtime Sequence for One Submission

### 4.1 Login and Frontend Load

1. The user visits the relevant portal domain through Route 53.
2. WAF and Shield protect the CloudFront distribution.
3. CloudFront returns the SPA from the application-specific S3 origin.
4. The user signs in through Cognito or an enterprise SAML/OIDC IdP.
5. The browser receives an Access Token and includes the JWT in API requests.

### 4.2 Submit Business Transaction

1. The browser calls the Regional REST API.
2. API Gateway validates the JWT.
3. API Gateway calls Core API through VPC Link and the internal ALB.
4. Core API performs tenant authorization, schema validation, domain validation, and idempotency checks.
5. Core API writes Submission, Evaluation, and Outbox Event in the same Aurora transaction.
6. Core API returns `202 Accepted`, Submission ID, Evaluation ID, and a status URL.

### 4.3 Start Workflow

1. Outbox Relay reads the committed Outbox Event.
2. Outbox Relay publishes the Domain Event to EventBridge.
3. EventBridge starts the matching Step Functions Standard workflow based on event type.
4. Non-critical consumers such as notifications receive the same event asynchronously and do not block the workflow.

### 4.4 Run Asynchronous Analysis

1. Step Functions sends a typed Task and Callback Task Token to a dedicated SQS queue.
2. The matching Worker consumes the task.
3. Document Worker calls Textract and writes document artifacts and evidence.
4. External Worker queries registry, claims, fraud, and compliance providers.
5. AI/RAG Worker retrieves approved knowledge from OpenSearch and calls Bedrock.
6. The Worker persists results to Aurora/S3.
7. The Worker callbacks Step Functions with the Task Token.
8. Step Functions aggregates branch state and moves to the next underwriting stage.

### 4.5 Decision, Progress, and Binding

1. Deterministic rules, pricing, and authority gates run against persisted evidence.
2. Cases that satisfy auto-quote conditions generate an immutable Quote Version.
3. Uncertainty, exceeded authority, or rule requirements route the case to Human Review.
4. Missing information routes the case to RFI. Broker supplements create a new Submission and Evaluation instead of looping forever in the old Evaluation.
5. Workflow progress is pushed to the frontend through WebSocket API.
6. When the Broker accepts a specific Quote Version, an independent Binding workflow starts.
7. Binding Worker calls PAS with an idempotent request.
8. PAS success records a Policy. Unknown outcomes enter Operational Hold and reconciliation.

The diagram does not expand Rule Engine, Pricing, Authority Gate, Human Review, or Quote Version nodes; they are represented by Core API and Underwriting Evaluation business stages.

## 5. Solid and Dashed Line Semantics

| Line type     | Meaning                                                | Example                                                             |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Solid line    | Core runtime request, command, or required data flow   | Browser -> API Gateway -> Core API; Step Functions -> SQS -> Worker |
| Dashed line   | Asynchronous, supporting, or non-critical-path traffic | EventBridge -> Notification Channels                                |
| Callback line | Worker resumes a waiting workflow after persistence    | Worker -> Step Functions Task Token Callback                        |

WebSocket is only for progress notification. Even if WebSocket delivery fails, the business workflow continues and final state remains queryable from Core API.

## 6. Required Architecture Invariants

### 6.1 Persistence Before Orchestration

Core API must commit the immutable Submission and Outbox Event before any workflow starts. Workflows must not depend on uncommitted data.

### 6.2 Atomic Business State and Event Commit

Business records and Outbox Events must be committed in the same Aurora transaction to avoid dual-write gaps between the database and messaging system.

### 6.3 Worker Persists Before Callback

Workers must persist results to Aurora/S3 before using the Task Token to resume Step Functions. This prevents a workflow from reporting success while the business result is missing.

### 6.4 All Asynchronous Consumers Are Idempotent

SQS, EventBridge, callback retries, and external API timeouts may all cause duplicate execution. Idempotency records must live in durable storage, not only in Worker memory.

### 6.5 Core API Is Not an Internal HTTP Relay

Step Functions interact with Workers through queues. Core API remains the boundary for user commands, queries, and domain transactions. It does not proxy internal workflow steps.

### 6.6 AI Only Produces Constrained Recommendations

AI outputs require evidence and version metadata. Final eligibility, pricing, authority, decline review, and binding authority remain controlled by deterministic rules and authorized people.

### 6.7 Notifications Do Not Block Underwriting

Email, SMS, webhooks, analytics, and SIEM export are processed asynchronously through EventBridge and do not sit on the critical success path of Underwriting Evaluation.

## 7. Intentionally Omitted from This Diagram

To keep the Core Underwriting Path readable, the following topics belong in other architecture views or documents.

### Security and Governance View

- AWS Organizations, account boundaries, and SCPs;
- IAM, KMS, Secrets Manager, and certificate management;
- GuardDuty, Security Hub, AWS Config, and CloudTrail;
- the boundary between Application Audit and Infrastructure Audit;
- data classification, retention, and legal hold.

### Delivery View

- GitHub Actions OIDC;
- CDK pipeline;
- ECR image signing and vulnerability scanning;
- Core API blue/green, Worker rolling deploy, and frontend canary;
- Step Functions Version/Alias;
- database expand/backfill/contract;
- AppConfig feature flags and AI shadow releases.

### Multi-Region DR View

- Sydney primary and Melbourne warm standby;
- Aurora Global Database;
- S3 cross-region replication;
- OpenSearch index rebuild;
- Cognito Singapore MRR;
- Route 53 failover;
- RPO, RTO, failover runbook, and recovery drills.

## 8. Interview Narrative

Use this order when presenting the diagram:

1. **Define the scope**: this is a single-underwriting-request Runtime View across three Sydney AZs, not a map of every AWS service.
2. **Explain the synchronous path**: browser -> Edge -> Cognito -> API Gateway -> VPC Link -> ALB -> Core API.
3. **Explain the transaction boundary**: Core API atomically writes Submission and Outbox in Aurora.
4. **Explain asynchronous decoupling**: Outbox Relay -> EventBridge -> Step Functions -> dedicated SQS -> Worker.
5. **Explain reliable callback**: Worker persists first, then callbacks with the Task Token.
6. **Explain the AI boundary**: Textract, OpenSearch, and Bedrock provide evidence and recommendations; they cannot make final decisions.
7. **Explain external side effects**: Policy Binding is independent, idempotent, and handles unknown outcomes.
8. **Close with omitted views**: Security, Delivery, and DR have separate diagrams so they do not obscure the core business path.

One-sentence summary:

> Prism keeps strongly consistent underwriting invariants inside Core API and Aurora, isolates slow and failure-prone document, AI, and external integration work in Step Functions, SQS, and Workers, and achieves production reliability through persistence-first execution, Transactional Outbox, idempotency, and Callback Tokens.
