# Prism AI Underwriter Agent 架构图集

> 文档状态：已确认目标架构的可视化视图
>
> 建议讲解顺序：系统上下文 → 业务生命周期 → 逻辑组件 → 核保时序 → AI Agent → 前后端边界 → 物理部署 → 发布 → 容灾
>
> 详细依据：[总体架构](./architecture.md) · [后端架构](./backend-architecture.md) · [前端架构](./frontend-architecture.md) · [部署架构](./deployment-architecture.md)

这些图从不同视角描述同一目标系统。图用于沟通边界，文字架构文档仍是约束、异常语义和非功能要求的事实来源。

## AWS 生产部署架构图

[单独打开或下载 AWS 架构 SVG](./diagrams/prism-aws-production-architecture.svg) · [下载高分辨率 PNG](./diagrams/prism-aws-production-architecture.png) · [查看生成脚本](../scripts/generate-aws-architecture.mjs)

![Prism AI Underwriter Agent AWS production architecture](./diagrams/prism-aws-production-architecture.svg)

该图使用 AWS 官方 2026-04-30 Architecture Icons，聚焦生产部署拓扑：Global Edge、Sydney 三 AZ 主区、VPC 私有计算与隔离数据子网、托管工作流和队列、AI/RAG 服务、安全与可观测性、外部系统、Melbourne warm standby 和 Singapore Cognito MRR。它是面试中讲解 AWS 选型和运行路径的主图；内部领域组件继续使用下方的详细 Mermaid 图。

## 详细生产总架构 SVG

[单独打开或下载详细 SVG](./diagrams/prism-production-detailed.svg) · [查看可编辑 Mermaid 源码](./diagrams/prism-production-detailed.mmd)

详细图展开前端 Feature、身份、API Pipeline、Core API 领域模块、文档处理、Workflow/Queue/Callback Worker、Underwriting Evaluation、Controlled AI Agent、RAG、Human Review、Quote/Binding、数据、安全、可观测性、CI/CD、多账户和跨区域恢复。该图面向缩放浏览和深度架构讨论；普通文档阅读优先使用下面的 Overview。

## 总体生产架构 SVG

[单独打开或下载 SVG](./diagrams/prism-production-overview.svg)

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

关键表达：AI Agent 是受平台约束的分析能力，不是拥有最终业务权力的独立 Actor。

## 2. Underwriting 业务生命周期

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

关键表达：RFI 不在原 Evaluation 内循环；补件产生新 Submission 和新 Evaluation。Human Review 可以等待同一个不可变 Submission。Binding 是报价接受后的独立流程。

## 3. 逻辑组件与通信路径

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

三种通信语义：

- HTTP Command：用户明确发起业务动作，Core API 在 Aurora 事务中完成。
- Workflow Task：Step Functions 通过专用 SQS 请求 Worker 执行受限任务。
- Domain Event：Aurora Outbox 发布已经发生的事实，Consumer 自己处理重试和幂等。

## 4. Submission 到 Evaluation 的端到端时序

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

关键表达：Core API 不作为 Workflow 内部 HTTP 跳板；Worker 先保存结果，再 Callback。

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

Agent 只能使用服务端注入作用域的只读工具。Eligibility、Pricing、Authority、最终 Decision 和 Binding 不属于 Agent 工具权限。

## 6. 后端内部组件边界

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

每张业务表只有一个模块写入 Owner；跨模块调用只能经过公开 Application/Domain 接口，不能深层导入 Repository。

## 7. 前端 Monorepo 与独立部署

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

Monorepo 统一依赖和质量门禁；三个应用具有独立 Artifact、Distribution、CSP、身份客户端、灰度和回滚，不采用运行时 Micro-Frontend。

## 8. 生产多区域部署

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

业务数据留在澳大利亚；经批准的最少身份数据复制到新加坡。目标为 RTO ≤1 小时、RPO ≤5 分钟。

## 9. 悉尼区域运行时部署

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

Public Subnet 只承载 NAT/网络边界；ECS 无 Public IP；Data Subnet 不具备直接互联网路由。

## 10. Build、发布与版本晋级

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

所有环境部署同一 Digest。数据库、Workflow 和 AI Release 分别版本化，不能用“前后端同时上线”代替 N/N−1 兼容。

## 11. 区域灾备时序

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

故障恢复以 Aurora Checkpoint 为事实来源，不复制 Step Functions Execution 或 SQS Message。未验证 AI 依赖时恢复人工核保，但保持自动报价关闭。
