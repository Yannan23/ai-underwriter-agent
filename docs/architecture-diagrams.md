# Prism AI Underwriter Agent Architecture Diagram Collection

> Document status: confirmed visual views of the target architecture
>
> Recommended presentation order: system context -> business lifecycle -> logical components -> underwriting sequence -> AI Agent -> frontend/backend boundary -> physical deployment -> release -> disaster recovery
>
> Detailed basis: [overall architecture](./architecture.md) · [backend architecture](./backend-architecture.md) · [frontend architecture](./frontend-architecture.md) · [deployment architecture](./deployment-architecture.md)

These diagrams describe the same target system from different viewpoints. Diagrams are for communicating boundaries; the written architecture documents remain the source of truth for constraints, failure semantics, and non-functional requirements.

## AWS Production Deployment Architecture Diagram

[Open or download the AWS architecture SVG](./diagrams/prism-aws-production-architecture.svg) · [download high-resolution PNG](./diagrams/prism-aws-production-architecture.png) · [view generation script](../scripts/generate-aws-architecture.mjs)

![Prism AI Underwriter Agent AWS production architecture](./diagrams/prism-aws-production-architecture.svg)

This diagram uses the official AWS Architecture Icons from 2026-04-30 and focuses on the production deployment topology: Global Edge, Sydney three-AZ primary region, private VPC compute and isolated data subnets, managed workflows and queues, AI/RAG services, security and observability, external systems, Melbourne warm standby, and Singapore Cognito MRR. This is the main interview diagram for explaining AWS choices and runtime flow; internal domain components remain in the detailed Mermaid diagrams below.

## Detailed Production Architecture SVG

[Open or download the detailed SVG](./diagrams/prism-production-detailed.svg) · [view editable Mermaid source](./diagrams/prism-production-detailed.mmd)

The detailed diagram expands frontend features, identity, API pipeline, Core API domain modules, document processing, Workflow/Queue/Callback Workers, Underwriting Evaluation, Controlled AI Agent, RAG, Human Review, Quote/Binding, data, security, observability, CI/CD, multi-account structure, and cross-region recovery. It is intended for zoomed inspection and deep architecture discussion; ordinary documentation reading should start with the overview below.

## Production Overview SVG

[Open or download SVG](./diagrams/prism-production-overview.svg)

![Prism AI Underwriter Agent production architecture](./diagrams/prism-production-overview.svg)

## 1. System Context

```mermaid
flowchart LR
    Broker[Broker User]
    Underwriter[Human Underwriter]
    Administrator[Product / Risk Administrator]
    Operator[Platform / Security Operator]

    subgraph Prism[Prism AI Underwriter Platform]
        BrokerPortal[Broker Portal]
        UWWorkbench[Underwriter Workbench]
        AdminConsole[Admin Console]
        Platform[Underwriting Platform]
        Agent[Controlled AI Underwriter Agent]
    end

    IdP[Broker and Enterprise Identity Providers]
    DataProviders[Registry / Claims / Compliance Providers]
    ModelProviders[Approved Model Providers]
    PAS[Policy Administration System]
    SIEM[Enterprise SIEM]

    Broker --> BrokerPortal
    Underwriter --> UWWorkbench
    Administrator --> AdminConsole
    BrokerPortal --> Platform
    UWWorkbench --> Platform
    AdminConsole --> Platform
    Platform --> Agent
    IdP --> BrokerPortal
    IdP --> UWWorkbench
    IdP --> AdminConsole
    Platform --> DataProviders
    Agent --> ModelProviders
    Platform --> PAS
    Operator --> Platform
    Platform --> SIEM
```

Key point: the AI Agent is an analytical capability constrained by the platform, not an independent actor with final business authority.

## 2. Underwriting Business Lifecycle

```mermaid
flowchart LR
    Draft[Editable Application Draft]
    Submit[Submit Application]
    Submission[Immutable Submission Version]
    Evaluation[Underwriting Evaluation]
    Snapshot[Validated Risk Snapshot]
    Evidence[Evidence + External Checks]
    Analysis[AI Risk Assessment]
    Gates[Deterministic Rules / Pricing / Authority]

    RFI[AWAITING_INFORMATION]
    Supplement[Broker Adds Information]
    Human[Human Review]
    Quote[Immutable Quote Version]
    Accept[Broker Accepts Exact Quote Version]
    Binding[Independent Policy Binding Workflow]
    Policy[Policy Issued]
    Hold[Operational Hold]

    Draft --> Submit --> Submission --> Evaluation
    Evaluation --> Snapshot --> Evidence --> Analysis --> Gates
    Gates -->|Missing or conflicting information| RFI
    RFI --> Supplement -->|New immutable version| Submission
    Gates -->|Authority or uncertainty requires review| Human
    Human -->|Request information| RFI
    Human -->|Approved terms| Quote
    Gates -->|All auto-quote conditions proven| Quote
    Quote --> Accept --> Binding --> Policy
    Evaluation -->|Technical dependency failure| Hold
    Binding -->|Unknown provider outcome| Hold
```

Key point: RFI does not loop inside the original Evaluation; supplementary information creates a new Submission and a new Evaluation. Human Review may wait on the same immutable Submission. Binding is an independent process after quote acceptance.

## 3. Logical Components and Communication Paths

```mermaid
flowchart TB
    subgraph Channels[User Channels]
        BrokerUI[Broker Portal]
        UWUI[Underwriter Workbench]
        AdminUI[Admin Console]
    end

    subgraph Edge[Edge and API Entry]
        CDN[CloudFront + WAF]
        REST[Regional API Gateway REST API]
        WS[API Gateway WebSocket]
        Identity[Cognito / Enterprise IdP]
    end

    subgraph Application[Application Plane]
        Core[Core API Modular Monolith]
        Realtime[Realtime Adapters]
        Starter[Workflow Starter]
        Outbox[Transactional Outbox Publisher]
    end

    subgraph Orchestration[Orchestration Plane]
        DocSF[Document Processing Workflow]
        EvalSF[Underwriting Evaluation Workflow]
        BindSF[Policy Binding Workflow]
        EB[EventBridge]
        Queues[Workload-specific SQS + DLQ]
    end

    subgraph Workers[Independent ECS Workers]
        ScanW[Document Scan Worker]
        DocW[Document Processing Worker]
        AIW[AI Underwriter Worker]
        ExtW[External Check Workers]
        BindW[Binding Worker]
    end

    subgraph Data[Data Plane]
        Aurora[(Aurora PostgreSQL<br/>Business Source of Truth)]
        S3[(S3 Documents / Artifacts / Audit)]
        KB[(OpenSearch Serverless<br/>Approved KB Releases)]
    end

    Models[Approved Models]
    Providers[External Providers]
    PAS[Policy Administration System]
    Consumers[Notification / Projection / Analytics / Archive]

    BrokerUI --> CDN
    UWUI --> CDN
    AdminUI --> CDN
    CDN --> REST --> Core
    Identity --> REST
    Channels --> WS --> Realtime
    Core --> Aurora
    Core --> S3
    Aurora --> Outbox --> EB
    EB --> Starter
    Starter --> DocSF
    Starter --> EvalSF
    Starter --> BindSF
    EB --> Consumers
    EB --> Realtime
    DocSF --> Queues
    EvalSF --> Queues
    BindSF --> Queues
    Queues --> ScanW
    Queues --> DocW
    Queues --> AIW
    Queues --> ExtW
    Queues --> BindW
    ScanW --> S3
    DocW --> S3
    ScanW --> Aurora
    DocW --> Aurora
    AIW --> Aurora
    ExtW --> Aurora
    BindW --> Aurora
    AIW --> KB
    AIW --> Models
    ExtW --> Providers
    BindW --> PAS
    ScanW -. persist then callback .-> DocSF
    DocW -. persist then callback .-> DocSF
    AIW -. persist then callback .-> EvalSF
    ExtW -. persist then callback .-> EvalSF
    BindW -. persist then callback .-> BindSF
```

Three communication semantics:

- HTTP Command: an explicit user-initiated business action completed by Core API inside an Aurora transaction.
- Workflow Task: Step Functions requests bounded Worker execution through dedicated SQS queues.
- Domain Event: Aurora Outbox publishes facts that have already happened; consumers own their own retries and idempotency.

## 4. End-to-End Sequence from Submission to Evaluation

```mermaid
sequenceDiagram
    actor Broker
    participant API as Core API
    participant DB as Aurora
    participant Outbox as Outbox / EventBridge
    participant Starter as Workflow Starter
    participant Eval as Evaluation Workflow
    participant Doc as Document Workflow
    participant Queue as Workload SQS
    participant Worker as Typed Worker
    participant UW as Human Underwriter

    Broker->>API: Submit Application + Idempotency-Key
    API->>DB: Create immutable Submission, Evaluation and Outbox event
    DB-->>API: Commit
    API-->>Broker: 202 Accepted + evaluationId

    Outbox->>DB: Claim unpublished event
    Outbox->>Starter: SubmissionCreated
    Starter->>Eval: StartExecution through PROD alias
    Eval->>DB: Load fixed Submission and Evaluation Release

    Note over Doc,DB: Document workflows start independently from validated uploads
    Doc->>Queue: Document task + callback token
    Queue->>Worker: At-least-once delivery
    Worker->>DB: Persist immutable document result
    Worker-->>Doc: Callback result reference
    Eval->>DB: Wait for document readiness barrier

    Eval->>Queue: AI or external task + callback token
    Queue->>Worker: Typed task contract
    Worker->>DB: Persist StageAttempt and immutable result
    Worker-->>Eval: Callback result reference
    Eval->>DB: Run deterministic rules, pricing and authority gates

    alt Auto-quote conditions proven
        Eval->>DB: Persist Quote Version and AUTO_QUOTE outcome
    else Information missing
        Eval->>DB: End Evaluation as AWAITING_INFORMATION
        DB-->>Broker: RFI notification through async projection
    else Human authority required
        Eval->>DB: Create HumanReviewTask
        API-->>UW: Async task notification / REST projection
        Note over Eval,UW: Evaluation waits on callback token
        UW->>API: Versioned human command
        API->>DB: Persist HumanAssessment / Decision
        API-->>Eval: Complete callback
    else Technical failure
        Eval->>DB: OPERATIONAL_HOLD
    end
```

Key point: Core API is not an internal HTTP relay for the workflow. Workers persist results before callback.

## 5. Controlled AI Underwriter Agent

```mermaid
flowchart TB
    Task[Versioned AI_RISK_ANALYSIS Task]
    Context[Context Assembler]
    Planner[Deterministic Query Planner]
    EvidenceGateway[Evidence Gateway]
    ProductKB[(Tenant / Product / KB Release)]
    RiskSnapshot[(Validated Risk Snapshot)]

    subgraph BoundedGraph[Fixed and Bounded Analysis Graph]
        Completeness[Completeness Analyzer]
        Exposure[Exposure Analyzer]
        Claims[Claims Analyzer]
        Controls[Controls Analyzer]
        Consistency[Cross-check and Contradiction Detection]
        Synthesis[Risk Assessment Synthesizer]
    end

    Validators[Schema + Citation + Safety + Confidence Validators]
    Result[(Immutable AI Risk Assessment)]
    Decision[Deterministic Decision Gate]
    Outcome[Auto Quote / RFI / Referral Route]
    Human[Human Review]

    Task --> Context
    RiskSnapshot --> Context
    Context --> Planner --> EvidenceGateway
    ProductKB --> EvidenceGateway
    EvidenceGateway --> Completeness
    EvidenceGateway --> Exposure
    EvidenceGateway --> Claims
    EvidenceGateway --> Controls
    Completeness --> Consistency
    Exposure --> Consistency
    Claims --> Consistency
    Controls --> Consistency
    Consistency --> Synthesis --> Validators
    Validators -->|Valid and grounded| Result --> Decision
    Validators -->|Incomplete / conflict / security block| Human
    Decision -->|Rules and authority allow| Outcome
    Decision -->|Uncertainty can only reduce automation| Human
```

The Agent can only use read-only tools whose scope is injected by the server. Eligibility, Pricing, Authority, final Decision, and Binding are outside the Agent's tool authority.

## 6. Backend Internal Component Boundaries

```mermaid
flowchart TB
    subgraph Inbound[Inbound Adapters]
        BrokerRoute[Broker BFF Routes]
        UWRoute[Underwriter BFF Routes]
        AdminRoute[Admin BFF Routes]
        EventConsumer[Event / Recovery Adapters]
    end

    subgraph Core[Core API Modular Monolith]
        Middleware[Auth / Tenant / Idempotency / Concurrency]
        UseCases[Application Use Cases]

        subgraph Modules[Owned Domain Modules]
            IdentityM[Identity]
            DistributionM[Distribution]
            SubmissionM[Submission]
            DocumentM[Document]
            UnderwritingM[Underwriting]
            PricingM[Pricing]
            BindingM[Binding]
            ConfigurationM[Configuration]
        end

        Ports[Owned Ports]
        Queries[Read Projection Queries]
    end

    subgraph Adapters[Infrastructure Adapters]
        Repositories[PostgreSQL Repositories]
        ObjectStore[S3 Adapter]
        WorkflowPort[Step Functions Adapter]
        EventPort[Outbox / EventBridge Adapter]
        ModelPort[Model Gateway]
        SearchPort[Evidence / OpenSearch Gateway]
        ProviderPort[Provider / PAS Gateways]
    end

    subgraph WorkerServices[Independent Worker Services]
        DocumentWorker[Document Workers]
        AIWorker[AI Worker]
        ExternalWorker[External Workers]
        BindingWorker[Binding Worker]
        OutboxWorker[Outbox Publisher]
    end

    BrokerRoute --> Middleware
    UWRoute --> Middleware
    AdminRoute --> Middleware
    EventConsumer --> UseCases
    Middleware --> UseCases
    Middleware --> Queries
    UseCases --> IdentityM
    UseCases --> DistributionM
    UseCases --> SubmissionM
    UseCases --> DocumentM
    UseCases --> UnderwritingM
    UseCases --> PricingM
    UseCases --> BindingM
    UseCases --> ConfigurationM
    UseCases --> Ports
    Ports -. implemented by .-> Repositories
    Ports -. implemented by .-> ObjectStore
    Ports -. implemented by .-> WorkflowPort
    Ports -. implemented by .-> EventPort
    Ports -. implemented by .-> ModelPort
    Ports -. implemented by .-> SearchPort
    Ports -. implemented by .-> ProviderPort
    DocumentWorker --> Repositories
    AIWorker --> Repositories
    ExternalWorker --> Repositories
    BindingWorker --> Repositories
    OutboxWorker --> Repositories
    DocumentWorker --> ObjectStore
    AIWorker --> ModelPort
    AIWorker --> SearchPort
    ExternalWorker --> ProviderPort
    BindingWorker --> ProviderPort
    OutboxWorker --> EventPort
```

Each business table has a single module write owner. Cross-module calls must go through public Application/Domain interfaces and must not deep-import repositories.

## 7. Frontend Monorepo and Independent Deployments

```mermaid
flowchart TB
    subgraph Repo[Frontend Monorepo]
        subgraph Apps[Deployable Applications]
            BrokerApp[broker-portal]
            UWApp[underwriter-workbench]
            AdminApp[admin-console]
        end

        subgraph Packages[Build-time Shared Packages]
            Design[design-system]
            APIClient[generated api-client]
            Auth[auth]
            Types[domain-types]
            Flags[feature-flags]
            Observability[observability]
            Testing[testing]
        end
    end

    subgraph BrokerDeploy[Broker Deployment]
        BrokerCF[broker.* CloudFront + WAF]
        BrokerS3[(Private S3 Origin)]
        BrokerIdentity[Broker Cognito Client]
    end

    subgraph UWDeploy[Underwriter Deployment]
        UWCF[underwriter.* CloudFront + WAF]
        UWS3[(Private S3 Origin)]
        UWIdentity[Workforce Cognito Client]
    end

    subgraph AdminDeploy[Admin Deployment]
        AdminCF[admin.* CloudFront + WAF]
        AdminS3[(Private S3 Origin)]
        AdminIdentity[Admin Client + Step-up]
    end

    Design --> BrokerApp
    Design --> UWApp
    Design --> AdminApp
    APIClient --> BrokerApp
    APIClient --> UWApp
    APIClient --> AdminApp
    Auth --> BrokerApp
    Auth --> UWApp
    Auth --> AdminApp
    Observability --> BrokerApp
    Observability --> UWApp
    Observability --> AdminApp
    BrokerApp --> BrokerS3 --> BrokerCF
    UWApp --> UWS3 --> UWCF
    AdminApp --> AdminS3 --> AdminCF
    BrokerCF -. authentication .-> BrokerIdentity
    UWCF -. authentication .-> UWIdentity
    AdminCF -. authentication .-> AdminIdentity
```

The monorepo unifies dependencies and quality gates. The three applications have independent artifacts, distributions, CSP, identity clients, canaries, and rollback. Runtime micro-frontends are not used.

## 8. Production Multi-Region Deployment

```mermaid
flowchart TB
    Users[Users]
    DNS[Route 53 + ARC Routing Controls]

    subgraph Edge[Global Edge]
        BrokerCF[Broker CloudFront + WAF]
        UWCF[Underwriter CloudFront + WAF]
        AdminCF[Admin CloudFront + WAF]
    end

    subgraph Sydney[Sydney ap-southeast-2 Primary - 3 AZ]
        SydneyAPI[Regional REST API + WebSocket]
        SydneyCompute[ECS Core API / Workers + Lambda + Step Functions]
        SydneyDB[(Aurora Global Primary)]
        SydneyS3[(Primary S3)]
        SydneySearch[(OpenSearch Serverless)]
        SydneyIdentity[Cognito Primary Pools]
    end

    subgraph Melbourne[Melbourne ap-southeast-4 Warm Standby]
        MelbourneAPI[Regional REST API + WebSocket]
        MelbourneCompute[Warm Compute and Workflow Definitions]
        MelbourneDB[(Aurora Global Secondary)]
        MelbourneS3[(Replicated S3)]
        MelbourneSearch[(Prebuilt Search Indexes)]
    end

    subgraph Singapore[Singapore ap-southeast-1 Identity DR]
        IdentityReplica[Cognito MRR Read-only Replica]
    end

    Users --> DNS
    DNS --> BrokerCF
    DNS --> UWCF
    DNS --> AdminCF
    DNS --> SydneyAPI
    DNS --> SydneyIdentity
    BrokerCF --> SydneyS3
    UWCF --> SydneyS3
    AdminCF --> SydneyS3
    SydneyAPI --> SydneyCompute
    SydneyCompute --> SydneyDB
    SydneyCompute --> SydneyS3
    SydneyCompute --> SydneySearch
    SydneyDB -. Aurora Global replication .-> MelbourneDB
    SydneyS3 -. S3 CRR .-> MelbourneS3
    SydneyS3 -. immutable KB build artifacts .-> MelbourneSearch
    SydneyIdentity -. identity replication .-> IdentityReplica
    DNS -. controlled auth failover .-> IdentityReplica
    BrokerCF -. static origin failover .-> MelbourneS3
    UWCF -. static origin failover .-> MelbourneS3
    AdminCF -. static origin failover .-> MelbourneS3
    DNS -. controlled API failover .-> MelbourneAPI
    MelbourneAPI --> MelbourneCompute
    MelbourneCompute --> MelbourneDB
    MelbourneCompute --> MelbourneS3
    MelbourneCompute --> MelbourneSearch
```

Business data remains in Australia. Only the minimum approved identity data is replicated to Singapore. Targets are RTO <= 1 hour and RPO <= 5 minutes.

## 9. Sydney Regional Runtime Deployment

```mermaid
flowchart TB
    Browser[Browser]
    REST[Regional API Gateway REST API + WAF]
    WS[API Gateway WebSocket + WAF]

    subgraph VPC[Production VPC - 3 AZ]
        subgraph Ingress[Private Ingress]
            Link[VPC Link V2]
            ALB[Internal ALB HTTPS]
        end

        subgraph Application[Private Application]
            Core[Core API ECS<br/>minimum 3 tasks]
            Scan[Document Scan Worker]
            Documents[Document Processing Worker]
            AI[AI Underwriter Worker]
            External[External Check Workers]
            Binding[Binding Worker]
            Outbox[Outbox Publisher]
        end

        subgraph Integration[Private Integration]
            Egress[Network Firewall / Egress Proxy]
        end

        subgraph Isolated[Isolated Data]
            Proxy[RDS Proxy]
            Aurora[(Aurora Writer + 2 Readers)]
            Search[(OpenSearch VPC Endpoint)]
        end

        Endpoints[VPC Endpoints]
    end

    subgraph Managed[Managed Async Services]
        EventBridge[EventBridge]
        Workflows[Step Functions Standard]
        Queues[SQS Workload Queues + DLQs]
        Realtime[Realtime SQS + Lambda]
    end

    S3[(S3 Security Domains)]
    Bedrock[Approved Bedrock Models]
    Providers[External Providers / PAS]

    Browser --> REST --> Link --> ALB --> Core
    Browser --> WS
    Core --> Proxy --> Aurora
    Core --> S3
    Aurora --> Outbox --> EventBridge
    EventBridge --> Workflows --> Queues
    Queues --> Scan
    Queues --> Documents
    Queues --> AI
    Queues --> External
    Queues --> Binding
    Scan --> S3
    Documents --> S3
    AI --> Search
    AI --> Bedrock
    External --> Egress --> Providers
    Binding --> Egress
    Scan --> Proxy
    Documents --> Proxy
    AI --> Proxy
    External --> Proxy
    Binding --> Proxy
    Outbox --> Proxy
    EventBridge --> Realtime --> WS
    Core --> Endpoints
    AI --> Endpoints
```

Public subnets only host NAT/network boundaries. ECS has no public IP. Data subnets have no direct internet route.

## 10. Build, Release, and Version Promotion

```mermaid
flowchart LR
    PR[Pull Request]
    CI[GitHub Actions CI]
    Quality[Code / Contract / Security / AI Gates]
    Build[Build Once]

    subgraph Shared[Shared Services Account]
        Images[ECR Immutable Images]
        Files[S3 Immutable Artifacts]
        Manifest[Signed Release Manifest<br/>Digest + SBOM + Provenance]
    end

    Dev[Development]
    Staging[Staging]
    Production[Production Approval]

    subgraph Strategies[Production Strategies]
        Frontend[CloudFront Header Test<br/>1% → 5% → 15%]
        API[ECS Core API<br/>10% Canary / Blue-Green]
        Worker[ECS Workers<br/>Rolling + Circuit Breaker]
        DB[Database<br/>Expand / Backfill / Contract]
        Workflow[Step Functions<br/>Immutable Version + Alias]
        AIRelease[AI / Prompt / KB<br/>Shadow + Human-only Canary]
    end

    Verify[Composite Alarms + Business Verification]
    Rollback[Previous Approved Manifest / Alias]

    PR --> CI --> Quality --> Build
    Build --> Images
    Build --> Files
    Images --> Manifest
    Files --> Manifest
    Manifest --> Dev --> Staging --> Production
    Production --> Frontend --> Verify
    Production --> API --> Verify
    Production --> Worker --> Verify
    Production --> DB --> Verify
    Production --> Workflow --> Verify
    Production --> AIRelease --> Verify
    Verify -. threshold breached .-> Rollback
```

All environments deploy the same digest. Database, Workflow, and AI Releases are versioned separately; "deploy frontend and backend together" is not a substitute for N/N-1 compatibility.

## 11. Regional Disaster Recovery Sequence

```mermaid
sequenceDiagram
    participant Monitor as Monitoring
    participant IC as Incident Commander
    participant Control as Recovery Automation / ARC
    participant Sydney as Sydney Workloads
    participant Aurora as Aurora Global Database
    participant Melbourne as Melbourne Workloads
    participant Recovery as Workflow Recovery
    participant Identity as Cognito Singapore Replica
    participant DNS as Route 53 / ARC

    Monitor->>IC: Regional health and SLO breach
    IC->>Control: Declare incident and approve failover
    Control->>Sydney: Fence writes and stop new workflow starts
    Control->>Aurora: Verify lag and last durable checkpoint
    Control->>Aurora: Promote Melbourne secondary
    Control->>Melbourne: Enable Core API, workers and outbox publisher
    Melbourne->>Aurora: Validate writer, RLS and release compatibility
    Control->>Recovery: Scan incomplete StageExecution and Binding state
    Recovery->>Aurora: Mark interrupted attempts and create new attempts
    Control->>Melbourne: Validate S3, KB, model and provider dependencies
    Control->>Identity: Route authentication to read-only replica
    Control->>DNS: Shift API and WebSocket traffic
    Monitor->>IC: Confirm business journeys and RTO/RPO evidence
```

Disaster recovery uses Aurora checkpoints as the source of truth. It does not replicate Step Functions executions or SQS messages. If AI dependencies are not verified, the platform restores manual underwriting while keeping auto-quote disabled.
