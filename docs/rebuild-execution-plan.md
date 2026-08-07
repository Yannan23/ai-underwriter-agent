# Prism 仓库重建执行与 Agent 编排计划

> 上层计划：[Repository Rebuild Plan](./rebuild-plan.md)
>
> 目标：把架构 Phase 转换为可以连续执行的 Branch、PR、TDD Slice、Subagent Wave 和质量门禁

## 1. 核心结论

### 1.1 不先写完整仓库的所有 Test

先完成以下设计资产，但不一次性写出全部可执行测试：

- Module Interface；
- Invariant 和 Error Catalogue；
- Edge-case/Test Traceability Matrix；
- Contract Example；
- 每个 Phase 的 Exit Criteria。

随后使用纵向 TDD Slice：

```text
confirm one public seam
→ write one failing behaviour test
→ verify RED for the expected reason
→ write the minimum implementation
→ verify GREEN
→ add the next behaviour
→ run the affected quality gate
→ review/refactor as a separate stage
```

禁止以下水平切片：

```text
write hundreds of imagined tests
→ build every domain type
→ build every repository
→ build every route
→ finally attempt integration
```

原因是尚未经过实现反馈的批量测试会固化错误 Interface，并倾向于验证目录和调用次数，而不是业务行为。

### 1.2 当前并发上限

当前 Agent Runtime 一共有 4 个并发槽位：

```text
Main Agent             1
Parallel Subagents     up to 3
Total                  4
```

实际策略：

- 默认同时开启 2 个 Subagent；
- Interface 已冻结且目录完全不重叠时开启 3 个；
- 高耦合任务只由 Main Agent 串行完成；
- 不为了占满槽位而制造无意义并行。

所有 Agent 共享同一个 Workspace，因此：

- 只有 Main Agent 可以切换 Git Branch、Commit、Rebase 或 Merge；
- Subagent 不执行 Git Branch/Commit 操作；
- 每个 Subagent 必须获得明确的文件所有权范围；
- 两个 Agent 不能同时编辑 `package.json`、Lockfile、根 Config 或同一个 Module；
- Root Toolchain、Contract Index 和最终集成由 Main Agent 负责。

## 2. Branch 与 PR 执行单位

不创建一个持续数月的 `rebuild` 巨型 Branch。每个可审查 Slice 使用短生命周期 Branch：

```text
chore/quality-foundation
chore/monorepo-module-boundaries
feat/submission-atomic-commit
feat/outbox-workflow-starter
feat/callback-worker-runtime
feat/document-processing
feat/ai-risk-analysis
feat/human-review
feat/quote-binding
```

每个 Branch：

1. 从最新 `main` 创建；
2. 只包含一个可描述的行为目标；
3. 包含测试、实现、文档和必要 Migration；
4. 创建 PR；
5. Required Checks 通过；
6. Solo Maintainer 检查最终 Diff；
7. Squash Merge；
8. 删除 Branch；
9. 从新的 `main` 开始下一 Slice。

大型 Phase 可以包含多个 PR，但每个 PR 必须保持系统可构建、可测试并兼容当前 `main`。

## 3. 开始任何 Feature 前的 Seam Gate

TDD 开始前必须确认测试所针对的公共 Seam。每个 Seam Record 至少包含：

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
Tests that cross this seam
Tests explicitly kept outside this seam
```

第一批建议确认的 Seam：

| Module           | Public Interface                    | 主要可观察行为                                   |
| ---------------- | ----------------------------------- | ------------------------------------------------ |
| Submission       | `submitApplication(command, actor)` | 原子创建 Submission、Evaluation、Audit 和 Outbox |
| Submission Query | `getSubmission(query, actor)`       | Tenant-scoped、版本化 Projection                 |
| Outbox Publisher | `publishBatch(limit)`               | Claim、Publish、Retry、Deduplicate               |
| Workflow Starter | `startEvaluation(event)`            | 稳定 Execution Name 和重复事件幂等               |
| Worker Runtime   | `executeTask(envelope, handler)`    | Validate、Lease、Persist、Callback、Ack          |
| Document         | `processDocument(task)`             | Quarantine、Extract、Evidence、Conflict          |
| AI Analysis      | `evaluateRisk(task)`                | Retrieval、Model、Schema、Citation、Safety       |
| Quote Acceptance | `acceptQuote(command, actor)`       | 精确 Version、Expiry、Idempotency                |
| Binding          | `bindAcceptedQuote(task)`           | Idempotent PAS Call 和 Unknown Outcome           |

实现开始前由用户确认这些 Seam；如果 Interface 发生实质变化，先更新 Seam Record 和 Contract，再继续 TDD。

## 4. 每个纵向 Slice 的测试顺序

### Step 1 — Acceptance Example

先写一个人类可读的 Worked Example，Expected Result 来自业务规格，而不是重新实现算法。

```text
Given a valid broker submission for tenant T
When submitApplication is called with idempotency key K
Then one immutable submission is accepted
And one requested evaluation exists
And one audit event exists
And one outbox event exists
And repeating K returns the same result
```

### Step 2 — Module Behaviour Test

在 Module 的公共 Interface 上写一个失败测试。只验证调用者可观察的结果，不验证私有方法或内部调用次数。

### Step 3 — Minimal Implementation

只实现当前失败测试需要的行为，不提前实现未来状态或异常。

### Step 4 — Edge Behaviour

逐个增加：

- Validation；
- Authorization；
- Idempotency；
- Concurrency；
- Error Classification；
- Deadline/Timeout；
- Redaction；
- Version Conflict。

每次仍然保持一个 Red → Green Cycle。

### Step 5 — Real Dependency Integration

使用真实 PostgreSQL Container 或 AWS Sandbox Contract 验证 Production Adapter。内部 Module 不互相 Mock；只在真实外部 Seam 使用 Test Adapter。

### Step 6 — System Contract

增加 HTTP/Event/Task Contract 和 N/N−1 Compatibility Test。

### Step 7 — Failure、Mutation 和 Journey

完成基础行为后再增加：

- Crash Point；
- Duplicate/Out-of-order；
- Mutation Test；
- 跨 Module Journey；
- Performance/Security Test。

### Step 8 — Review/Refactor

Red → Green 完成后，单独执行 Review/Refactor：

- Interface 是否仍然足够小；
- 是否存在 Pass-through/Shallow Module；
- 是否测试了实现细节；
- 是否出现重复 Fixture 或 Adapter；
- 是否需要删除已被深 Module Test 取代的旧测试；
- 是否保持 100% Coverage 和 Mutation Gate。

## 5. Long-running Engineering Loop

可以使用 Long-running Task，但必须是有界循环，而不是无限 Agent Loop。

```text
while phase exit criteria are not met:
    inspect repository and current evidence
    select the smallest highest-risk slice
    confirm its seam
    create/update the short-lived branch
    write one failing behaviour test
    implement until that behaviour is green
    run affected tests and static checks
    integrate completed subagent work
    run the full required gate
    perform review/refactor
    update checkpoint and remaining risks
    open/prepare the PR evidence
```

### 5.1 每轮 Checkpoint

每个循环记录：

- 当前 Branch 和 Slice；
- 已确认 Seam；
- 新增 Behaviour/Edge Case；
- Test RED 证据；
- Test GREEN 证据；
- Coverage/Mutation/Contract 结果；
- 已修改文件；
- 剩余风险；
- 下一最小 Slice；
- 是否需要用户权限或业务决定。

### 5.2 自动继续条件

以下情况可以自动继续：

- 下一步已经在确认的 Scope 中；
- 不需要修改已冻结的业务语义；
- 不涉及不可逆数据操作；
- 不部署 Production；
- Required Test 可以在本地或批准的 Sandbox 执行；
- Subagent 文件范围互不冲突。

### 5.3 暂停条件

以下情况必须暂停并请求用户决定：

- Public Interface 或业务状态机需要实质改变；
- 需要新外部 Provider、付费资源或生产权限；
- 需要删除/迁移用户数据；
- 架构文档相互冲突；
- 相同阻塞连续重复且没有安全替代路径；
- Production Deploy、Failover 或破坏性 Migration；
- Test 暗示需求本身存在歧义。

Long-running 不扩大授权范围。它只允许在已确认目标内持续执行。

## 6. Phase 1 的具体第一波

Branch：

```text
chore/quality-foundation
```

目标：让仓库在无外部 API Key、无公网调用的环境中稳定执行真实质量门禁。

### Main Agent

拥有：

- 根 `package.json`；
- pnpm Lockfile；
- Vitest/ESLint/TypeScript 总配置；
- Branch 和最终集成；
- Exit Criteria 与验证结果。

任务：

1. 创建 Branch；
2. 保存现有失败基线；
3. 定义 Unit/Integration/Live Test Project；
4. 集成 Subagent Patch；
5. 修复共享 Config；
6. 运行所有门禁；
7. 生成 PR Checklist 和 Evidence。

### Subagent A — Test Harness

文件范围：

```text
vitest*.ts
vitest.setup.ts
packages/**/**.live.test.ts
packages/**/**.test.ts where classification changes only
```

任务：

- 将三个真实 Anthropic/Voyage Test 移入 Live Project；
- 普通 `pnpm test` 禁止公网；
- Coverage Include 覆盖 Apps/Packages/Infra；
- 增加 Per-file 100% 配置草案；
- 不修改根 `package.json`。

### Subagent B — Lint Baseline

文件范围：

```text
scripts/generate-aws-architecture.mjs
cspell project dictionary when needed
```

任务：

- 修复当前 23 个 Lint Error；
- 不通过全局 Disable 绕过；
- 保持生成 SVG 行为不变；
- 运行脚本语法、SVG XML 和 ESLint 验证。

### Subagent C — GitHub Baseline

文件范围：

```text
.github/**
docs/pr-checklists/**
```

任务：

- PR Quality Workflow；
- Solo Developer PR Template；
- Required Gate 汇总 Job；
- 最小 Workflow Permission；
- Action SHA Pinning 草案；
- Dependabot/CodeQL/Dependency Review Baseline；
- 不接触 AWS Deploy Credential。

### Phase 1 第一波 Exit Criteria

```text
pnpm install --frozen-lockfile       PASS
pnpm format:check                    PASS
pnpm lint                            PASS
pnpm typecheck                       PASS
pnpm test:unit                       PASS without network
pnpm test:integration                PASS
pnpm test:live                       isolated/manual
coverage config                      includes all owned executable code
git diff --check                     PASS
GitHub workflows                     least-privilege and syntax validated
```

Phase 1 可能暂时无法立即达到全仓库 100% Coverage，因为将 `apps/api` 纳入后会暴露历史缺口。正确做法是把这些缺口作为真实 RED Baseline，按小 Slice 补行为测试；禁止再次排除 `apps/api`。

## 7. 后续并行 Wave

### Wave 2 — Module/Contract/Data Foundation

前置：Phase 1 Green，初始 Seam 已确认。

| 执行者  | 文件所有权                               | 任务                                        |
| ------- | ---------------------------------------- | ------------------------------------------- |
| Main    | Root、Composition、Contract Index        | 冻结 Submission Interface 和集成            |
| Agent A | `packages/contracts/**`                  | OpenAPI/Event/Task Contract + Contract Test |
| Agent B | `packages/database/**`, migration runner | PostgreSQL Container/Migration Harness      |
| Agent C | `infra/bootstrap/**`, `infra/network/**` | CDK Dev Foundation + Construct Test         |

### Wave 3 — Submission Vertical Slice

前置：Submission Interface、Contract 和 Database Harness Green。

| 执行者  | 文件所有权                                     | 任务                                               |
| ------- | ---------------------------------------------- | -------------------------------------------------- |
| Main    | Submission public Interface、Integration       | TDD orchestration and final atomic scenario        |
| Agent A | `submission/domain`, `submission/application`  | Domain/Use Case Red → Green                        |
| Agent B | `submission/adapters`, `submission/migrations` | Real PostgreSQL Adapter Integration                |
| Agent C | `submission/entry/http`                        | Route、Problem Details、ETag、Idempotency Contract |

关键 Acceptance：一次事务原子创建 Submission、Evaluation、Audit 和 Outbox；重复 Key 返回同一结果。

### Wave 4 — Async Fabric

| 执行者  | 文件所有权                            | 任务                                  |
| ------- | ------------------------------------- | ------------------------------------- |
| Main    | End-to-end synthetic execution        | Crash/duplicate/recovery integration  |
| Agent A | `outbox-publisher`                    | Claim/Publish/Retry/Deduplicate       |
| Agent B | `workflow-starter`, `infra/workflows` | EventBridge/Step Functions versioning |
| Agent C | Worker runtime package                | Typed Envelope/Persist/Callback/Ack   |

### Wave 5 — Document Processing

| 执行者  | 文件所有权                     | 任务                                           |
| ------- | ------------------------------ | ---------------------------------------------- |
| Main    | Document Interface and journey | Multi-document barrier/conflict integration    |
| Agent A | Core Document Module           | Upload/State/Evidence behaviour                |
| Agent B | Document Worker                | Scan/Textract/Normalize adapters               |
| Agent C | S3/CDK/Security tests          | Quarantine, checksum, malicious document cases |

### Wave 6 — AI/RAG

| 执行者  | 文件所有权                                 | 任务                                       |
| ------- | ------------------------------------------ | ------------------------------------------ |
| Main    | AI Analysis Interface and release manifest | Integrate controlled task                  |
| Agent A | Retrieval/OpenSearch                       | Scope, release, citation retrieval         |
| Agent B | Model Gateway/Bedrock                      | Schema, timeout, guardrail, budget         |
| Agent C | AI Eval/Citation Validator                 | Offline dataset, attacks, failure taxonomy |

### Wave 7 — Decision/Human/Quote/Binding

只并行互不写同一 Aggregate 的 Module：

- Eligibility/Pricing/Authority；
- Human Review/Assignment；
- Quote/Binding Adapter；
- Main Agent 负责跨 Module State Transition 和 Journey。

如果同一事务跨多个 Module，先由 Main Agent 串行冻结 Application Use Case Interface，再分配内部实现。

### Wave 8 — Frontends

前置：Design System、Auth 和 Generated Client Interface Green。

| 执行者  | 文件所有权                                 |
| ------- | ------------------------------------------ |
| Main    | Shared Packages、API Contract、Integration |
| Agent A | Broker Portal                              |
| Agent B | Underwriter Workbench                      |
| Agent C | Admin Console                              |

三个应用可以高度并行，但禁止直接互相 Import。

### Wave 9 — Release/Security/DR

| 执行者  | 文件所有权                                      |
| ------- | ----------------------------------------------- |
| Main    | Release Manifest、Production Gate、Final Review |
| Agent A | CI/CD Promotion Workflows                       |
| Agent B | AWS Guardrails/Security/Observability           |
| Agent C | Resilience/Recovery/DR Harness                  |

## 8. Subagent 任务模板

每次派发必须包含：

```text
Objective
Confirmed seam/contract
Owned paths
Forbidden paths
Expected tests
Commands to run
Acceptance criteria
Do not commit or switch branch
Report changed files, evidence, assumptions and blockers
```

不接受以下模糊任务：

```text
fix tests
build backend
implement AWS
improve architecture
```

任务必须可独立完成并在一个 Agent Turn 内形成可审查结果。

## 9. Main Agent 集成协议

每个 Subagent 完成后，Main Agent 必须：

1. 检查其文件范围是否越界；
2. 阅读 Diff，不只相信总结；
3. 运行该任务的 Targeted Test；
4. 检查是否测试了实现细节；
5. 检查是否新增不必要 Seam/Adapter；
6. 运行 Module Boundary 和 Typecheck；
7. 合并全部 Agent 工作后运行完整 Gate；
8. 对失败进行诊断，不盲目重复 Test；
9. 更新 Checkpoint 和 Edge-case Catalogue；
10. 只有完整 Green 后才准备 PR。

## 10. 预计运行方式

推荐以一个显式 Long-running Goal 执行，但一次只承诺一个 Phase：

```text
Goal 1: Complete Phase 1 quality foundation
Goal 2: Complete Module/Contract/Data foundation
Goal 3: Deliver atomic Submission vertical slice
...
```

不要创建“完成整个生产平台”这种没有近期退出条件的单一 Goal。每个 Goal 完成后检查架构、成本和优先级，再启动下一 Goal。

用户启动语句示例：

```text
按照 docs/rebuild-execution-plan.md 开始 Phase 1。
创建 chore/quality-foundation branch。
使用 TDD 和最多 3 个 subagent。
持续执行到 Phase 1 Exit Criteria 全部通过；不要部署 AWS Production。
```

这会授权 Branch 创建、代码修改、测试和安全的本地/CI 配置工作，但不会自动授权 Production Deployment、付费 AWS 资源创建或破坏性数据操作。
