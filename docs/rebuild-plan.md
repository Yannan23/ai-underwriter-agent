# Prism AI Underwriter Agent 仓库重建计划

> 计划日期：2026-08-07
>
> 目标：将当前 M0 Demo 重建为与已确认架构一致、可测试、可发布、可恢复的生产级 AI Underwriter Platform
>
> 主要依据：[生产架构](./architecture.md) · [后端架构](./backend-architecture.md) · [前端架构](./frontend-architecture.md) · [部署架构](./deployment-architecture.md) · [核心运行路径](./core-underwriting-runtime-architecture.md)
>
> 具体执行：[TDD、Subagent 与 Long-running Engineering Loop](./rebuild-execution-plan.md)

## 1. 执行摘要

本次重建保留 TypeScript、pnpm Monorepo、Zod Contract、确定性规则和现有业务 Fixture，但不在当前内存 Pipeline 上继续叠加生产能力。

目标部署模型保持不变：

```text
3 independently deployed frontend applications
→ Regional API Gateway REST/WebSocket
→ Internal ALB
→ Core API modular monolith on ECS Fargate
→ Aurora PostgreSQL + Transactional Outbox
→ EventBridge + Step Functions Standard
→ workload-specific SQS/DLQ
→ independently deployed ECS Fargate workers
→ Bedrock / Textract / OpenSearch / external providers / PAS
```

重建采用纵向切片，而不是按“先写完数据库、再写完 API、最后补测试”推进。每个切片必须同时交付：

- 一个清晰且足够深的 Module；
- 小而稳定的 Interface；
- Production Adapter 和 Test Adapter；
- 数据库 Migration；
- Unit、Integration、Contract、E2E 和 Failure Test；
- Metric、Log、Trace 和 Audit Event；
- CDK 资源和最小权限 IAM；
- Runbook、Alarm 和回滚路径。

### 1.1 关于“100% 测试覆盖率”

本计划对仓库拥有的可执行 TypeScript/TSX 代码强制：

```text
Statements  100%
Branches    100%
Functions   100%
Lines       100%
Per-file    true
```

但覆盖率 100% 不等于所有缺陷或所有现实边界条件都已验证。因此还必须增加：

- Decision Table Test；
- Property-based Test；
- State-model Test；
- Mutation Test；
  -真实 PostgreSQL Integration Test；
- AWS Sandbox Contract Test；
- Playwright E2E；
- Security、AI Evaluation、Load、Resilience 和 DR Test。

“覆盖所有 Edge Case”在工程上定义为：维护版本化 Risk/Edge-case Catalogue；目录中的每一项都有明确的 Test ID、Owner、测试层级和证据。发现的新缺陷必须先添加 Regression Test，再修复实现。

## 2. 当前仓库基线

### 2.1 已有资产

- TypeScript/pnpm Workspace；
- Zod Contract；
- Eligibility、Risk、Pricing、Routing 等 Demo Pipeline 逻辑；
- Mock Fixture 和部分 Unit Test；
- ESLint、Prettier、Husky、Commitlint 和基础 GitHub Actions；
- 已完成评审的生产架构文档；
- 一个可演示的 Hono API 和静态页面。

### 2.2 当前质量检查结果

2026-08-07 本地基线：

| 检查           | 结果       | 主要问题                                                               |
| -------------- | ---------- | ---------------------------------------------------------------------- |
| TypeScript     | 通过       | 只覆盖当前 4 个 Workspace Package                                      |
| Prettier       | 通过       | 当前格式配置可继续使用                                                 |
| ESLint         | 失败       | 架构图生成脚本产生 23 个错误                                           |
| Vitest         | 失败       | 133 个测试中 130 通过，3 个 Live Test 因直接访问 Anthropic/Voyage 失败 |
| Coverage       | 结果不可信 | 配置只包含 `packages/*/src`，明确排除了 `apps/api`                     |
| GitHub Actions | 基础可用   | 仅 Test/Lint/Format/Typecheck；无部署、安全扫描、OIDC 或制品晋级       |

### 2.3 必须替换的 Demo 设计

| 当前实现                      | 生产目标                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| 内存 `Map` 保存 Application   | Aurora PostgreSQL 是业务事实来源                                        |
| Fire-and-forget 顺序 Pipeline | Step Functions Standard + SQS Callback Worker                           |
| SSE 进度                      | WebSocket 变化通知 + REST Projection                                    |
| 单静态 Web 页面               | Broker、Underwriter、Admin 三个独立应用                                 |
| 直接 Anthropic/Voyage SDK     | 受控 Model Gateway；目标默认 Bedrock/OpenSearch                         |
| 内存 Mini-RAG                 | 版本化批准知识库 + OpenSearch Serverless                                |
| 单应用状态                    | Case、Submission、Evaluation、StageExecution、Quote、Binding 独立状态机 |
| Demo 无认证                   | Cognito/Enterprise Federation + Core API Resource Authorization         |
| Railway/Docker Demo           | AWS 多账户 CDK + Build Once/Promote Many                                |

## 3. 重建原则

### 3.1 Deep Module 优先

Module 的 Interface 同时是调用面和测试面。复杂度应隐藏在 Module 内部，调用者不需要理解事务、锁、Outbox、Retry 或 Adapter 细节。

例如 Submission Module 对外暴露：

```ts
submitApplication(command, actorContext): Promise<SubmissionAccepted>
```

调用者不应分别调用：

```text
createSubmission
createEvaluation
insertOutbox
insertAudit
commitTransaction
```

这些步骤必须由一个深 Module 在一个事务中保证。

### 3.2 只在真实变化点建立 Seam

- PostgreSQL：Production 使用 Aurora Adapter，测试使用真实 PostgreSQL Test Adapter；
- Model：Production 使用 Bedrock Adapter，测试使用 Deterministic Fake Adapter；
- External Provider/PAS：Production 使用 HTTPS Adapter，测试使用 Scripted Fake Adapter；
- Clock、ID、Random、Object Storage：使用可注入 Adapter 支持确定性测试；
- 不为只有一个实现且没有变化需要的简单函数创建空 Port。

### 3.3 业务事实先于 Workflow

任何 Workflow 都不能先于 Aurora Transaction 创建业务事实。Worker 必须先保存 Result，再 Callback Step Functions。

### 3.4 测试验证行为，不验证实现细节

测试通过 Module Interface 断言：

- 返回结果；
- 持久化业务事实；
- Outbox/Event；
- Audit；
- 错误语义；
- 幂等与并发结果。

禁止为了测试而公开私有方法，禁止把每个 Repository 调用顺序写成脆弱 Mock Expectation。

### 3.5 AI 不能拥有最终业务权力

AI 只能生成带 Evidence 的结构化 Recommendation。Eligibility、Pricing、Authority、Quote、Decline Review 和 Binding 使用确定性规则与受权人控制。

## 4. 目标仓库结构

```text
apps/
├── core-api/
│   └── src/
│       ├── entry/http/
│       ├── modules/
│       │   ├── identity-access/
│       │   ├── tenancy/
│       │   ├── application/
│       │   ├── submission/
│       │   │   ├── index.ts
│       │   │   ├── domain/
│       │   │   │   ├── submission.ts
│       │   │   │   └── submission.test.ts
│       │   │   ├── application/
│       │   │   │   ├── submit-application.ts
│       │   │   │   ├── submit-application.test.ts
│       │   │   │   └── submit-application.property.test.ts
│       │   │   ├── adapters/
│       │   │   │   ├── postgres-submission-repository.ts
│       │   │   │   └── postgres-submission-repository.integration.test.ts
│       │   │   ├── entry/http/
│       │   │   │   ├── submit-application-route.ts
│       │   │   │   └── submit-application-route.contract.test.ts
│       │   │   ├── migrations/
│       │   │   └── test-support/
│       │   ├── document/
│       │   ├── underwriting/
│       │   ├── pricing/
│       │   ├── review/
│       │   ├── quote/
│       │   ├── binding/
│       │   ├── configuration/
│       │   └── platform/
│       └── composition-root/
├── workers/
│   ├── document-worker/
│   ├── ai-underwriter-worker/
│   │   ├── src/
│   │   │   ├── task-handler.ts
│   │   │   ├── task-handler.test.ts
│   │   │   ├── model-gateway/
│   │   │   ├── retrieval/
│   │   │   ├── assessment/
│   │   │   └── test-support/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── external-check-worker/
│   ├── binding-worker/
│   └── outbox-publisher/
├── workflow-starter/
├── realtime-adapter/
├── broker-portal/
│   └── src/features/
│       └── application-form/
│           ├── index.ts
│           ├── application-form.tsx
│           ├── application-form.test.tsx
│           ├── application-form.stories.tsx
│           ├── model/
│           ├── api/
│           └── routes/
├── underwriter-workbench/
└── admin-console/

packages/
├── contracts/
│   ├── openapi/
│   ├── events/
│   ├── workflow-tasks/
│   └── ai-results/
├── database/
├── observability/
├── configuration-releases/
├── security-context/
├── testing/
├── api-client/
├── auth/
├── design-system/
├── domain-types/
├── feature-flags/
├── eslint-config/
└── tsconfig/

database/
├── migration-runner/       # discovers module-owned migrations
├── seeds/                  # environment-level composed data
└── verification/

infra/
├── organization/
├── bootstrap/
├── network/
├── security/
├── data/
├── compute/
├── workflows/
├── identity/
├── edge/
├── observability/
└── recovery/

tests/
├── journeys/               # cross-module business journeys only
├── e2e/                    # deployed-system/browser tests
├── performance/
├── resilience/
├── security/
├── ai-evals/
└── dr/

tools/
├── ci/
├── release/
├── fixtures/
└── codegen/
```

### 4.1 Import 与所有权规则

- Module 只通过本 Module 的公开 `index.ts` 暴露 Interface；
- 禁止跨 Module 深层 Import；
- 每张业务表只有一个写入 Module；
- Core API Module 之间只能通过公开 Interface 协作；
- Worker 可以复用 Contract 和 Infrastructure Package，但不能直接导入 Core API 私有实现；
- 三个前端应用禁止互相依赖；
- Shared Frontend Package 不能包含跨应用业务流程；
- CI 使用 Dependency Graph 检测循环依赖和非法层级依赖。

### 4.2 Module/Feature 就近组织

本文所说的 Module 对应日常表达中的业务 Component 或 Feature。默认规则是：**一个行为属于哪个 Module，它的实现、测试和专属资产就放在哪个 Module 目录内，并随着行为继续向下展开。**

```text
module-or-feature/
├── index.ts                         # 唯一公共 Interface
├── domain/
│   ├── aggregate.ts
│   ├── aggregate.test.ts
│   ├── state-machine.ts
│   └── state-machine.property.test.ts
├── application/
│   ├── command.ts
│   └── command.test.ts
├── adapters/
│   ├── postgres-repository.ts
│   └── postgres-repository.integration.test.ts
├── entry/
│   └── http/
│       ├── route.ts
│       └── route.contract.test.ts
├── migrations/
├── fixtures/
└── test-support/
```

就近原则包括：

- `foo.ts` 与 `foo.test.ts` 同目录；
- React Module 的 Component、Hook、Story、A11y Test 和 Component Test 同目录；
- PostgreSQL Adapter 与它的 Integration Test 同目录；
- Event/Task Consumer 与 Duplicate、Retry、Redrive Test 同目录；
- Module-owned Migration 位于该 Module 下；使用全局唯一的时间戳文件名，Migration Runner 只负责发现、重复版本检查和按全局版本排序；
- Fixture 默认属于 Module，只有确实被多个 Module 使用时才提升到共享 Testing Module；
- 删除一个 Module 时，其实现、测试、Migration 和 Test Support 可以一起被识别，避免遗留孤儿测试。

禁止重新建立全局的 `components/`、`hooks/`、`services/`、`repositories/` 或 `unit-tests/` 目录，把同一业务行为横向拆散。

以下内容不强行塞入单个业务 Module：

- 跨多个 Module 的用户 Journey 和 E2E Test；
- 整个系统的 Performance、Resilience、Security、AI Evaluation 和 DR Test；
- 多消费者共享的 OpenAPI、Event 和 Task Wire Contract；
- Monorepo Toolchain、Release Tool 和通用 Testing Harness；
- CDK Stack。CDK 仍按 Network、Data、Compute、Workflow、Edge 和 Recovery 的生命周期与 Blast Radius 组织，但每个 Construct 的 Test 与 Construct 就近。

就近不等于每个文件都创建自己的浅 Module。相关行为应先组成一个拥有小 Interface 的深 Module，再在其内部按复杂度自然展开。

## 5. 工具链与本地质量门禁

### 5.1 Runtime 与 Package Manager

- 将 `.nvmrc`、`engines.node`、Docker Base Image 和 GitHub Runner 统一固定为 Node.js 24 LTS；
- `packageManager` 固定精确 pnpm 版本，不使用范围；
- CI 使用 Frozen Lockfile；
- Renovate 或 Dependabot 通过 PR 更新 Runtime、Action 和 Dependency；
- 每次 Runtime Major Upgrade 都运行完整 Contract、E2E、Load 和 AI Eval。

### 5.2 TypeScript

在现有 `strict` 基础上启用并执行：

- `noUncheckedIndexedAccess`；
- `exactOptionalPropertyTypes`；
- `noImplicitOverride`；
- `noFallthroughCasesInSwitch`；
- `noImplicitReturns`；
- `useUnknownInCatchVariables`；
- 独立 Package Project Reference；
- Production Build 与 `tsc --noEmit` 分离。

### 5.3 ESLint

保留 Flat Config，并增加：

- Type-aware `typescript-eslint` strict/stylistic rules；
- React、Hooks 和 JSX A11y Rules；
- Vitest 与 Playwright Rules；
- Promise/Unhandled Async Rules；
- Security-sensitive Pattern Rules；
- Import Order、Circular Dependency 和 Module Boundary Rules；
- 禁止 `any`、Floating Promise、未处理 Result、直接 `console`；
- 禁止从环境变量散读配置；只有 Configuration Module 可以访问 `process.env`；
- 禁止日志记录 JWT、Task Token、完整 Prompt、Document Body 和 PII；
- CSpell 保留，但使用项目字典登记业务术语，不以全局 Disable 绕过。

第一阶段必须先修复当前 23 个 Lint Error，使默认分支恢复为零 Warning、零 Error。

### 5.4 Prettier

- 保留单一根配置；
- 所有 TS、TSX、JSON、YAML、Markdown、CDK 和 Workflow 文件统一格式；
- Generated Code 通过 `.prettierignore` 排除；
- CI 执行 `prettier --check`，本地使用 `prettier --write`；
- ESLint 不承担格式化职责，避免规则冲突。

### 5.5 Husky 与 lint-staged

Hook 是反馈工具，不是安全边界；所有检查必须在 CI 重跑。

```text
pre-commit
├── prettier --write staged files
├── eslint --fix --max-warnings 0 staged executable files
├── secret scan staged diff
└── affected typecheck when reliable; otherwise full typecheck

commit-msg
└── commitlint conventional commit

pre-push
├── unit tests
├── contract tests
└── typecheck
```

Pre-commit 目标耗时小于 30 秒；Live AI、AWS Sandbox、E2E、Load 和 DR Test 不放入本地 Hook。

### 5.6 必备根命令

```text
pnpm check              # format + lint + typecheck + unit coverage
pnpm test:unit
pnpm test:integration
pnpm test:contract
pnpm test:e2e
pnpm test:security
pnpm test:ai:offline
pnpm test:ai:live
pnpm test:resilience
pnpm test:performance
pnpm test:mutation
pnpm test:all
pnpm build
pnpm cdk:synth
pnpm cdk:diff
```

## 6. 测试架构

### 6.1 Test 就近规则

测试默认与被验证的实现放在同一目录，并使用文件名表达测试层级：

| 文件名                  | 含义                                | 默认运行时机                            |
| ----------------------- | ----------------------------------- | --------------------------------------- |
| `*.test.ts(x)`          | Unit/Module behaviour               | 本地、Pre-push、PR                      |
| `*.property.test.ts`    | Property-based invariant            | PR                                      |
| `*.integration.test.ts` | PostgreSQL/本地依赖 Integration     | PR                                      |
| `*.contract.test.ts`    | Adapter、HTTP、Event、Task Contract | PR/Sandbox                              |
| `*.a11y.test.tsx`       | Automated accessibility             | PR                                      |
| `*.visual.test.tsx`     | Story/visual regression             | PR                                      |
| `*.live.test.ts`        | 真实 AWS/Model/Provider             | Nightly/Release，不进入普通 `pnpm test` |

Vitest 使用多个 Project 区分 Unit、Integration 和 Contract，但 Project 的 `include` Pattern 从所有 Module 目录发现就近测试，而不是要求搬到中央 Test Folder。

顶层 `tests/` 只接收没有单一所有者的系统级验证：

- Broker Submit → Evaluation → Quote 的跨 Module Journey；
- Underwriter Human Review 和 Maker-checker E2E；
- Deployment 后的 Browser/API E2E；
- Performance、Resilience、Security、AI Evaluation 和 DR Scenario。

测试 Test Support 也遵循最小提升原则：先放在 Module 内；出现第二个真实调用者后，才提升到 `packages/testing` 的公开 Interface。

### 6.2 Coverage Contract

Vitest Coverage 必须：

- 包含 `apps/**/src/**/*.{ts,tsx}`；
- 包含 `packages/**/src/**/*.{ts,tsx}`；
- 包含 `infra/**/src/**/*.ts`；
- 启用全局和 `perFile` 100% Threshold；
- 输出 Text、JSON、LCOV 和 Cobertura；
- PR 展示 Coverage Diff；
- 禁止通过新增 Exclude 修复 Coverage Failure。

允许排除的内容只有：

- 纯类型声明；
- 自动生成的 OpenAPI Client；
- CDK/Codegen 自动生成产物；
- 不含逻辑的 Barrel Export；
- 第三方 Vendored Asset。

每个新增排除必须包含理由、Owner 和 Expiry，在 PR 中显式列出，并由自动规则阻止无说明的排除。Solo Maintainer 必须在 Merge 前完成检查清单确认；未来增加协作者后再启用 CODEOWNERS 审批。

### 6.3 Unit Test

Unit Test 通过 Module Interface 覆盖：

- Domain Invariant；
- Eligibility、Pricing、Authority 和 Routing Decision Table；
- State Transition；
- Schema Validation；
- Error Classification；
- Idempotency Key；
- Hash、Version 和 Release Manifest；
- PII Redaction；
- Retry/Backoff Calculation；
- Quote Expiry 和时间逻辑；
- Feature Flag 与 Kill Switch。

Clock、UUID、Random、Model、Provider 和 Object Store 使用显式 Test Adapter，禁止依赖真实时间和网络。

### 6.4 Property-based 与 State-model Test

使用 Property-based Testing 验证：

- Premium 永不为负、永不溢出并遵守舍入规则；
- 相同 Input + Configuration Snapshot 产生相同确定性结果；
- 未授权 Tenant 永远无法读取或更新其他 Tenant 数据；
- 任意重复 Command 最多产生一个业务效果；
- 任意事件重复/乱序不会倒退 Aggregate Version；
- 非法状态转换始终被拒绝；
- Quote Acceptance 只能作用于未过期的精确 Quote Version；
- AI Output 无论怎样变化，都不能绕过 Decision/Authority Gate。

State-model Test 覆盖 Application、Submission、Evaluation、Document、ReviewTask、Quote 和 Binding 的所有允许与禁止转换。

### 6.5 PostgreSQL Integration Test

Repository 和 Use Case Test 使用真实 PostgreSQL Container，不以 Repository Mock 代替以下行为：

- Transaction 和 Rollback；
- Unique/Foreign Key/Check Constraint；
- Optimistic Version；
- `FOR UPDATE SKIP LOCKED`；
- Advisory Lock；
- RLS；
- Tenant-scoped Index；
- Concurrent Submit/Accept/Assign；
- Outbox Claim、Publish、Retry 和 Poison Record；
- Migration Upgrade/Backward Compatibility；
- Connection Pool Exhaustion 和 Statement Timeout。

每个 Migration 必须通过：

```text
empty database → latest
previous release → latest
latest schema + previous app version compatibility
rollback/forward-fix rehearsal where applicable
```

### 6.6 Adapter Contract Test

Production Adapter 和 Test Adapter 必须通过同一 Contract Suite：

- S3：Checksum、Multipart、Version、Quarantine、Denied Access、Expired URL；
- Bedrock：Schema、Timeout、Throttle、Guardrail Intervention、Invalid Output；
- OpenSearch：Tenant/Product Scope、KB Release、Empty/Low-quality Retrieval；
- Textract：Async Completion、Partial Page、Unsupported/Corrupt Document；
- External Provider：Timeout、429、5xx、Malformed Response、Stale Data；
- PAS：Idempotent Success、Definitive Failure、Timeout with Unknown Outcome、Reconciliation；
- WebSocket：Connect、Disconnect、Sequence Gap、Expired Connection；
- EventBridge/SQS：Duplicate、Out-of-order、Redrive、DLQ 和 Schema Version。

PR 使用 Deterministic Fake/Mock Adapter；每天和 Release 前在隔离 AWS Sandbox 中运行真实 Contract Test。

### 6.7 API 与 Event Contract Test

- OpenAPI 是外部 REST Contract 的事实来源；
- 前端 Client 从 OpenAPI 自动生成；
- Consumer 编译验证当前和 N−1 Contract；
- 使用 Problem Details 表达稳定错误；
- 验证 ETag、`If-Match`、`Idempotency-Key` 和 `202 + Status URL`；
- Event/Task 使用版本化 JSON Schema/Zod；
- Schema Registry 检查 Backward/Forward Compatibility；
- Task Token 在 Serialization、Log 和 Trace 中必须被 Redact；
- Breaking Change 只能创建新 Version、Task Type 或 Queue。

### 6.8 Frontend Test

每个应用包含：

- Vitest Unit Test；
- Testing Library Component Test；
- MSW Contract-aware Network Test；
- Story/Visual Regression；
- axe Automated Accessibility Test；
- Playwright Browser E2E；
- 键盘和屏幕阅读器人工验收清单；
- Bundle Size 和 Web Vitals Budget。

关键 Journey：

- Broker Draft、Autosave、Conflict、Upload Resume、Submit、RFI、Quote Acceptance；
- Underwriter Queue、Assignment、Evidence、AI Assertion、Override、Maker-checker；
- Admin Rule/Prompt/KB Release、Approval、Canary、Rollback；
- WebSocket 断线、Sequence Gap、REST Resync 和 Polling Fallback。

### 6.9 AI Evaluation Test

Live Model Test 不得混入普通 Unit Test。分为：

```text
PR deterministic suite
├── schema validation
├── citation validation
├── prompt assembly snapshot with redaction
├── tool allowlist
├── budget/deadline
└── curated fixture regression

Nightly/release live suite
├── extraction accuracy
├── retrieval recall/precision
├── citation correctness
├── unsupported assertion rate
├── calibration and uncertainty
├── prompt injection / leakage
├── PII leakage
├── bias/fairness slices
├── latency and token/cost budget
└── approved fallback model parity
```

Prompt、Model、Tool Schema、Guardrail、KB 或 Rule 发生变化时，必须运行完整 Evaluation。Golden Dataset 按 Product、Occupation、Risk Tier、Document Quality 和 Tenant Policy 分层，数据集版本随 Release Manifest 保存。

Bedrock Guardrails 作为纵深防御，测试 Prompt Attack、Denied Topic、Sensitive Information 和 Content Filter；应用自身仍必须执行 Scope、Tool Permission、Schema、Citation 和 Authority Validation。

### 6.10 Mutation Test

100% Coverage 后增加 Mutation Test，避免只有“执行过代码”而没有断言行为。

优先模块：

- Eligibility；
- Pricing；
- Authority；
- State Transition；
- Idempotency；
- Tenant Authorization；
- Quote Acceptance；
- Binding Reconciliation；
- AI Citation Validator。

门禁目标：关键确定性模块不得存在未解释的 Surviving Mutant；其他拥有代码 Mutation Score 不低于 90%，等价 Mutant 必须记录理由和对应 Test Evidence。

### 6.11 Performance、Resilience 与 DR Test

Performance Test 验证：

- API p50/p95/p99；
- Fast-path Evaluation p50 ≤ 30 秒、p95 ≤ 2 分钟；
- 100 个并发 Evaluation；
- Queue Age、Worker Saturation、Aurora Connection Budget；
- Document 大小和页数上限；
- Bedrock/Provider Quota 和 Tenant Fairness；
- WebSocket Connection 和 Broadcast Capacity。

Resilience Test 注入：

- Worker 在持久化前崩溃；
- Worker 在持久化后、Callback 前崩溃；
- Callback 成功但 SQS Message 未删除；
- EventBridge 重复/乱序；
- SQS Visibility Timeout；
- Aurora Failover、Lock、Connection Exhaustion；
- Bedrock/Textract/OpenSearch/Provider Timeout 和 Throttle；
- PAS 返回未知结果；
- WebSocket 断连；
- Kill Switch 激活；
- 部署期间旧新 Worker 并存。

DR Test 至少覆盖：

- Aurora Restore 和 Global Database Failover；
- S3 Replica 完整性；
- OpenSearch Index Rebuild；
- 未完成 Evaluation 从 Aurora Checkpoint 恢复；
- Cognito MRR Promotion Runbook；
- Route 53 Failover；
- RPO ≤ 5 分钟和 RTO ≤ 1 小时的证据。

## 7. Edge-case Catalogue

以下目录必须转化为版本化 Test Matrix，而不是只写在文档中。

### 7.1 Identity、Tenant 与 Authorization

- Token 缺失、过期、签名错误、Issuer/Audience 错误；
- 用户属于 Brokerage，但不属于目标 Tenant；
- Broker 被停用、Appointment 过期或 Role 被撤销；
- Underwriter Authority 不足；
- Admin 只能管理获授权 Product/Tenant；
- URL、Body 和 Token 中 Tenant 不一致；
- RLS 和 Application Authorization 任一层拒绝跨租户访问；
- Reassignment 与正在提交的 Human Decision 竞争。

### 7.2 Draft、Submission 与并发

- 缺失/重复 Idempotency Key；
- 相同 Key 不同 Payload；
- ETag 过期导致 412；
- Version Conflict 导致 409；
- 双击 Submit；
- 请求超时但事务已经提交；
- Outbox 发布失败、重复发布、乱序发布；
- 新 Submission 产生时旧 Evaluation 正在运行；
- RFI 补件必须创建新 Submission/Evaluation。

### 7.3 Document

- 空文件、零页 PDF、损坏 PDF、加密 PDF；
- MIME 与 Magic Bytes 不一致；
- 文件过大、页数过多、压缩炸弹、嵌套附件；
- Macro、Active Content、Malware；
- OCR 低置信度、旋转页、手写、重复页、缺页；
- 多文档事实冲突；
- Presigned URL 过期、Multipart 中断、Checksum 不一致；
- Quarantined Document 不能进入 Submission；
- Prompt Injection 隐藏在正文、Metadata、图片或白色文字中。

### 7.4 Workflow、Queue 与 Worker

- Step Functions Execution 已存在；
- Task Schema N/N−1；
- SQS Duplicate、Out-of-order、Poison Message；
- Visibility Timeout 与 Heartbeat；
- Deadline 已过期；
- Task Token 无效、过期或 Callback 重复；
- Worker Crash 的每一个时点；
- DLQ Redrive 后不能产生第二次业务效果；
- Execution 已结束但旧 Task 到达；
- Deployment Drain 和 SIGTERM。

### 7.5 AI、RAG 与规则

- Model 输出不是 JSON、缺字段、超长、包含未知枚举；
- Citation 不存在、跨 Tenant、跨 Product、跨 KB Release；
- Retrieval 无结果、结果过期、相关性不足或相互矛盾；
- Prompt Injection、Prompt Leakage、Tool Misuse；
- Model Timeout、Throttle、Region/Quota 不可用；
- Fallback 未批准或结果质量不达标；
- Token/Cost/Call Budget 超限；
- Safety Guardrail Intervention；
- AI 建议与确定性规则冲突；
- 禁止 Auto-decline；所有 Rule-based Decline 进入 Human Review。

### 7.6 Human Review、Quote 与 Binding

- Case 同时打开在多个 Tab；
- Primary Underwriter Reassignment；
- Evaluation 被 Supersede 后提交旧 Decision；
- Maker 与 Checker 是同一人；
- Override 缺少 Reason/Evidence；
- Quote 已过期、已撤销或不是当前 Version；
- 相同 Quote 重复 Acceptance；
- Acceptance 成功但响应丢失；
- PAS 成功、失败、Timeout、Malformed Response、未知结果；
- Binding Reconciliation 重复运行；
- Policy 已存在但本地仍为 Pending。

### 7.7 Realtime 与 Notification

- WebSocket 断线、重连、重复事件、Sequence Gap；
- Connection Registry 已过期；
- Push 失败但业务成功；
- REST Projection 与收到的旧事件竞争；
- Email/SMS/Webhook Provider 失败；
- Notification 永远不能回滚核保事务。

### 7.8 Security、Privacy 与 Audit

- Log/Trace 中出现 JWT、Task Token、Secret、Prompt、Document 或 PII；
- 未授权读取 AI Artifact 或 Audit Archive；
- KMS Deny、Key Disabled、Rotation/Grant 问题；
- S3 Public Access 或错误 Bucket Policy；
- SSRF、XSS、CSV Injection、恶意文件名；
- Dependency/Container Critical Vulnerability；
- Audit Event 缺失 Actor、Reason、Version 或 Correlation；
- Retention、Deletion、Legal Hold 冲突。

## 8. GitHub Repository Guardrails

### 8.1 Solo Developer Operating Model

当前项目只有一名开发者，因此不设置无法满足的 Mandatory Reviewer 或 Separation-of-duties Gate。仍然采用 Branch + Pull Request，因为 PR 同时承担 Change Isolation、CI Trigger、Diff Review、Decision Record 和 Release Evidence 的职责。

标准开发流程：

```text
sync latest main
→ create short-lived feat/fix/refactor/test/chore branch
→ commit only on that branch
→ push branch
→ open Pull Request
→ automated checks and checklist
→ self-review the final diff after CI
→ squash merge
→ delete branch
```

Solo Maintainer 可以 Merge 自己的 PR，但不能绕过 Required Checks。高风险变更使用加强流程：

- Pricing、Eligibility、Authority、Prompt/Model/KB、Migration、IAM/SCP/KMS 和 Production Workflow 使用专门 PR Template；
- CI 完成后重新检查最终 Diff、Generated Plan、Migration Plan 和 Rollback Plan；
- Production 不因 Merge 自动部署；只允许手动 Promotion 明确的 Immutable Release Manifest；
- 高风险 Production Change 默认设置冷静期或 Wait Timer，紧急修复必须记录 Incident/Reason；
- 未来增加第二位合格协作者后，再启用 CODEOWNERS Required Review 和禁止 Self-review。

### 8.2 Ruleset

`main` 使用 GitHub Ruleset：

- 任何代码或配置变更必须从最新 `main` 创建短生命周期 Branch；
- 禁止在本地 `main` 创建业务 Commit；
- 禁止 Direct Push、Force Push 和 Branch Delete；
- 所有变更必须 Pull Request；
- 当前 Solo 模式不要求外部 Reviewer；
- Required Checks 全部通过后，Solo Maintainer 才能 Self-merge；
- Required Status Checks 必须来自指定 GitHub App；
- 必须解决全部 Review Conversation；
- 合并前 Branch 必须是最新；
- 使用 Squash Merge；有并发协作者后再启用 Merge Queue；
- Release Tag 禁止修改或删除；
- 可用时要求 Signed Commit；
- 不为管理员提供日常 Bypass；Break-glass 操作必须审计。

### 8.3 Critical Path Ownership Map

Solo 模式用 Ownership Map 标记高风险目录和未来需要的角色，不将其配置为当前无法满足的 Required CODEOWNERS Review：

```text
/infra/                                      current: Solo Maintainer · future: Platform + Security
/**/migrations/                              current: Solo Maintainer · future: Backend + Data owner
/apps/core-api/src/modules/pricing/          current: Solo Maintainer · future: Pricing owner
/apps/core-api/src/modules/underwriting/     current: Solo Maintainer · future: Underwriting Risk owner
/packages/configuration-releases/            current: Solo Maintainer · future: Engineering + Underwriting Risk
/tests/ai-evals/                             current: Solo Maintainer · future: AI Engineering + Underwriting Risk
/.github/workflows/                          current: Solo Maintainer · future: Platform + Security
/docs/architecture*.md                      current: Solo Maintainer · future: Architecture owner
```

可以保留非 Required 的 `CODEOWNERS` 作为路径说明；只有存在能够真正独立 Review 的协作者后，才把它升级为 Merge Gate。

### 8.4 Repository Security

- GitHub Secret Scanning 和 Push Protection；
- CodeQL；
- Dependency Review；
- Dependabot/Renovate；
- Actions Allowlist；
- 所有 Action 固定到完整 Commit SHA；
- Workflow 默认 `permissions: {}`，按 Job 最小授权；
- 禁止在不可信 PR 上运行具有 Secret 的 Workflow；
- 禁止不安全组合 `pull_request_target` 与不可信 Checkout；
- Artifact 设置最短必要 Retention；
- Fork PR 不获得 AWS、Model 或 Environment Credential。

## 9. GitHub Actions 与 CI/CD

### 9.1 Workflow 划分

```text
.github/workflows/
├── pr-quality.yml
├── pr-contracts.yml
├── pr-infra.yml
├── security-codeql.yml
├── nightly-live-integration.yml
├── nightly-ai-evals.yml
├── build-release.yml
├── deploy-development.yml
├── promote-staging.yml
├── promote-production.yml
├── post-deploy-verify.yml
├── scheduled-drift.yml
└── scheduled-recovery-drill.yml
```

### 9.2 PR Gate

PR 不接触 AWS Production Credential，执行：

1. Frozen Install；
2. License/Dependency/Secret Review；
3. Prettier；
4. ESLint；
5. Typecheck；
6. Module Boundary；
7. Unit + 100% Per-file Coverage；
8. PostgreSQL Integration；
9. OpenAPI/Event/Task Contract Compatibility；
10. Frontend Component/A11y；
11. CDK Synth、Snapshot、`cdk-nag` 和 `cfn-guard`；
12. Deterministic AI Evaluation；
13. CodeQL；
14. Docker Build 和 Container Scan；
15. Critical Playwright Journey。

使用 Path Filter 只跳过明确无影响的昂贵 Job，但必须有一个总 Gate 汇总所有 Required Check，避免 Required Workflow 因 Path Skip 永久 Pending。

### 9.3 Live Test 隔离

当前三个直接调用 Anthropic/Voyage 的测试从默认 `pnpm test` 移出：

- Unit/PR Test 永远不访问公网；
- Live Model/Provider Test 使用 GitHub Environment 和短期 Credential；
- Nightly、Manual Dispatch、Model/Prompt/KB Change 和 Release Candidate 才运行；
- Provider 故障标记为环境失败，不能污染确定性 Coverage；
- Live Test Result、Model ID、Prompt Version、Dataset Version 和 Cost 作为 Release Evidence 保存。

### 9.4 Build Once, Promote Many

`main` 通过后只构建一次：

- Core API OCI Image；
- 每种 Worker OCI Image；
- Lambda/Workflow Starter ZIP；
- 三个 Frontend Bundle；
- Migration Bundle；
- Step Functions Definition；
- CDK Cloud Assembly；
- OpenAPI/Event/Task Schema；
- AI Release Manifest；
- SBOM、Vulnerability Report、Provenance 和 Signed Release Manifest。

制品写入 Shared Services Account 的 Immutable ECR/S3，以 Digest/Content Hash 标识。Dev、Staging、Production 晋级同一 Digest，禁止按环境重建。

### 9.5 AWS Authentication

- GitHub Actions 使用 OIDC 获取短期 AWS Credential；
- OIDC Trust 限定 Repository、Branch/Tag、Workflow 和 GitHub Environment；
- Build、Plan、Dev Apply、Stage Apply、Prod Apply 使用不同 Role；
- PR 只有 Read-only Plan 权限；
- Production Role 只能由受保护 Production Environment 和手动 Promotion Workflow 使用；
- Solo 模式不配置无法完成的外部 Required Reviewer；以 Wait Timer、Immutable Release、Change Set 确认、Required Checks 和完整 Deployment Record 作为补偿控制；
- 私有 Aurora Migration/Test 在目标 VPC 内的一次性 ECS Task 或 CodeBuild Job 执行；
- GitHub-hosted Runner 不获得数据库网络访问。

### 9.6 Environment Promotion

```text
PR merged
→ build immutable release
→ automatic deploy Development
→ integration + contract + E2E + smoke
→ promote same release to Staging
→ migration rehearsal + load + resilience + AI eval
→ protected Production approval
→ Change Set review
→ canary/blue-green deployment
→ bake window + alarms
→ promote or automatic rollback
```

Production 禁止部署 `main`、`latest` 或可移动 Tag，只接受已签名 Release Manifest。

## 10. AWS Landing Zone 与 Guardrails

### 10.1 Account Model

```text
Management
Security / Audit
Log Archive
Shared Services / CI
Development
Staging
Production
Backup / Recovery
```

Workload 不运行在 Management、Security 或 Log Archive Account。人员通过 IAM Identity Center 使用短期 Role；禁止日常 IAM User 和长期 Access Key。

### 10.2 三类 Control

AWS Guardrail 分为：

| 类型       | 实现                                             | 作用                              |
| ---------- | ------------------------------------------------ | --------------------------------- |
| Preventive | SCP/RCP/Declarative Policy                       | 在违规操作发生前拒绝              |
| Proactive  | CloudFormation Hook、cfn-guard、cdk-nag          | 在 IaC Provision 前拒绝不合规资源 |
| Detective  | AWS Config、Security Hub、CloudTrail/EventBridge | 检测已存在 Drift 或安全事件       |

### 10.3 Preventive Guardrails

生产 OU 至少阻止：

- 在批准 Region 之外创建资源；
- 关闭或篡改 CloudTrail、Config、GuardDuty、Security Hub；
- 修改 Log Archive Bucket Policy/Object Lock；
- 关闭 S3 Block Public Access；
- 创建公共 S3 Bucket 或公共数据库；
- ECS Task 获得 Public IP；
- 未经批准删除 KMS Key、Backup Vault 或 Recovery Point；
- 使用 Root User 执行日常操作或创建 Root Access Key；
- 创建无 Permission Boundary 的高权限 Role；
- Development Pipeline Assume Production Role；
- Production 人员绕过受控 Deployment Role 修改关键资源。

SCP 只限制最大权限，不授予权限；每条 SCP 必须在 Sandbox 验证并保留 Break-glass 恢复路径。

### 10.4 Proactive IaC Guardrails

CDK Synth 后阻止：

- Public S3、Open Security Group、Public RDS；
- 未加密的 S3、Aurora、SQS、ECR、Log Group；
- IAM `Action: *` 或 `Resource: *`，除非有明确豁免；
- 缺少 DLQ、Alarm、Retention 或 Removal Policy；
- Production Aurora 缺少 Deletion Protection/PITR；
- S3 缺少 Versioning、Lifecycle 或 Access Logging；
- ECS Task 缺少 Health Check、Resource Limit、Readonly Root Filesystem；
- Queue Visibility Timeout 小于 Worker Deadline；
- Lambda/Task 在不需要时具有公网 Egress；
- API Gateway/CloudFront 缺少 WAF、TLS 和 Access Log；
- 无 Owner、Environment、DataClassification 和 CostCentre Tag。

Policy Exception 必须包含 Reason、Risk Owner、Expiry 和 Compensating Control。

### 10.5 Detective Guardrails

- Organization CloudTrail 写入 Log Archive；
- AWS Config Aggregator 和 Conformance Pack；
- Security Hub 汇总 Control Findings；
- GuardDuty 在所有批准 Region 启用并委派到 Security Account；
- Inspector 扫描 ECR 和运行工作负载；
- IAM Access Analyzer 检测外部访问；
- Macie 扫描敏感 S3 数据；
- EventBridge 将高严重度 Finding 路由到 On-call/SIEM；
- Drift Detection 定期运行；
- 自动修复仅用于可证明安全且可逆的控制，其他进入 Ticket/Incident。

CloudTrail 属于 Infrastructure Security Audit，不代替 CloudWatch Runtime Observability，也不代替应用 Business Audit。

### 10.6 Data 与 Key Guardrails

- Aurora、Document、AI Artifact、Audit、Release Artifact 和 Identity 使用不同 Customer-managed KMS Key；
- Secret 存 Secrets Manager，动态 Kill Switch 存 AppConfig，非敏感参数存 Parameter Store；
- Secret 不进入 Git、Image、Task Definition 明文、Log 或 Frontend Bundle；
- Aurora 使用 Multi-AZ、RDS Proxy、PITR、Global Database；
- Backup 跨账户复制到锁定 Vault，并定期 Restore Test；
- S3 Versioning、Object Lock（Audit Archive）、Lifecycle 和 Cross-region Replication；
- CloudTrail Data Event 只对敏感 Bucket/关键操作按风险启用，控制成本和数据量；
- PostgreSQL Tenant Scope 是应用强制条件，RLS 作为纵深防御。

### 10.7 Network Guardrails

- Core API 和 Worker 无 Public IP；
- Aurora 位于 Isolated Data Subnet；
- API Gateway 通过 VPC Link V2 和 Internal ALB 访问 Core API；
- AWS 服务优先使用 VPC Endpoint；
- 外部 Provider 通过固定 NAT Egress 和 Allowlist；
- Security Group 只允许显式 Source/Destination；
- 无 Bastion；受控诊断使用审计的 ECS Exec/SSM；
- WAF 保护 CloudFront 和 Regional API Gateway；
- DNS、Certificate、TLS Policy 和 Egress 变更纳入 IaC Review。

## 11. AI Guardrails

AI Guardrail 不只是一项 Bedrock 配置，而是多层控制：

```text
untrusted document isolation
→ server-injected tenant/product/evaluation scope
→ read-only tool allowlist
→ retrieval release and citation scope
→ Bedrock prompt-attack / PII / content guardrail
→ strict output schema
→ evidence and contradiction validation
→ deterministic eligibility/pricing/authority gate
→ human review where required
→ immutable audit and release evidence
```

必须实现：

- 模型不能选择自己的 Model、Prompt、Tool、Tenant 或 KB；
- Document 内容始终视为不可信数据；
- Tool 只读、参数由服务端注入、设置 Deadline 和 Budget；
- 输出必须通过 Zod/JSON Schema；
- Citation 必须属于当前批准 KB Release 或 Evidence Package；
- Safety/Schema/Citation Failure 进入 Retry、Fallback 或 Human Review，不能静默跳过；
- No Auto-decline；
- Prompt/Model/KB/Guardrail 变更使用版本化 Release Manifest；
- Shadow 不影响业务，Canary 强制 Human Review；
- Kill Switch 可立即停止 AI 自动评估；
- 原始 Prompt/Response 不进入普通 Log，必要时进入独立加密 Artifact Store。

## 12. Observability 与审计

### 12.1 Runtime Observability

统一使用 ADOT/OpenTelemetry 采集并发送到 CloudWatch/X-Ray：

- HTTP、Outbox、EventBridge、Workflow、SQS、Worker、Tool、Model 和 Callback Trace；
- API Latency/Error；
- Queue Age、DLQ、Worker Saturation；
- Stage/Attempt Duration 和 Error Class；
- Model Latency、Token、Cost、Guardrail、Fallback；
- Aurora Connection、Lock、Storage、Replica Lag；
- Business Journey 和 SLO Burn Rate。

Trace Correlation：

```text
requestId
→ tenantId
→ submissionId
→ evaluationId
→ stageExecutionId
→ attemptId
→ modelInvocationId
```

高基数 ID 不作为无界 Metric Label。

### 12.2 三种审计必须分离

| 审计                 | 事实来源                                          | 回答的问题                                     |
| -------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Runtime Telemetry    | CloudWatch/OpenTelemetry                          | 系统是否健康、哪里慢或失败                     |
| Infrastructure Audit | Organization CloudTrail                           | 谁修改了 AWS 资源或调用 AWS Control Plane      |
| Business Audit       | Aurora Transaction + Outbox + Object Lock Archive | 谁对哪个 Case/Quote 做了什么业务决定以及为什么 |

## 13. 分阶段重建路线

以下顺序按依赖和风险排列。时间取决于团队规模；建议按 Exit Criteria 而不是日期推进。

### Phase 0 — Architecture Freeze 与 Rebuild Safety Net

交付：

- ADR：Runtime、Database、Workflow、Identity、Frontend、IaC、Testing；
- 当前 Demo Golden Behaviour Snapshot；
- Edge-case Catalogue 和 Traceability Matrix；
- Legacy/Target Contract Mapping；
- Feature Flag 和迁移策略；
- 明确哪些旧代码保留、重写、删除。

Exit Criteria：每个目标 Module 有 Owner、Interface Draft、数据所有权和测试策略。

### Phase 1 — 先让质量门禁真实可信

交付：

- 修复全部 ESLint Error；
- 将 Live Test 移出默认 Test Suite；
- Coverage 包含 Apps、Packages、Infra，开启 Per-file 100%；
- 固定 Node 24 LTS 和 pnpm；
- 建立共享 ESLint/TSConfig/Testing Package；
- Husky、lint-staged、Commitlint；
- GitHub PR Ruleset、Solo PR Checklist、Critical Path Ownership Map 和 Required Checks；
- 基础 CodeQL、Secret、Dependency 和 Container Scan。

Exit Criteria：全新 Clone 在无 API Key、无公网依赖下执行 `pnpm check` 必须稳定通过。

### Phase 2 — Landing Zone 与 Development Foundation

交付：

- Control Tower/Organizations Account Baseline；
- Security、Log Archive、Shared、Dev Account；
- GitHub OIDC 和最小权限 Role；
- CDK Bootstrap、Network、KMS、Log、ECR、Artifact Bucket；
- cdk-nag/cfn-guard/SCP/Config 基础控制；
- Development VPC 和临时 Preview/Sandbox Pattern。

Exit Criteria：PR 可安全 Synth/Diff，`main` 可自动部署一个不含业务的 Development Skeleton。

### Phase 3 — Contract、Database 与 Domain Foundation

交付：

- OpenAPI、Problem Details、Event、Task、AI Result Contract；
- Aurora Schema/Migration Harness；
- Tenant、Identity/Access、Application、Submission、Platform Module；
- Idempotency、Audit、Outbox 和 Optimistic Concurrency；
- PostgreSQL Integration 和 Migration Compatibility Suite。

Exit Criteria：Submit Use Case 在真实 PostgreSQL 中原子写入 Submission、Evaluation、Audit 和 Outbox，并通过并发/重复/回滚测试。

### Phase 4 — Core API 第一条生产纵向切片

交付：

- Cognito JWT Verification；
- Core API Authorization Pipeline；
- Broker Draft/Submit/Status REST Endpoints；
- API Gateway → VPC Link → Internal ALB → ECS；
- RDS Proxy；
- Structured Log、Trace、Metric、Alarm；
- Generated API Client。

Exit Criteria：Broker 可在 Development 环境提交并读取不可变 Submission；跨租户、重复请求、412/409 和超时重试全部验证。

### Phase 5 — Durable Async Fabric

交付：

- Outbox Publisher；
- EventBridge Bus 和 Schema；
- Idempotent Workflow Starter；
- Versioned Step Functions Standard；
- Workload-specific SQS/DLQ；
- Worker Runtime Library；
- StageExecution/Attempt/Result/Callback State；
- WebSocket Notification + REST Resync。

Exit Criteria：使用 Synthetic Task 证明 Duplicate、Worker Crash、Persist-before-callback、DLQ Redrive 和 Recovery Execution。

### Phase 6 — Document Processing

交付：

- Upload Session、Presigned Multipart 和 Checksum；
- Quarantine/Original/Artifact Bucket 分层；
- Malware/Magic Bytes/Active Content Gate；
- Document State Machine；
- Textract Adapter；
- Normalization、Evidence 和 Conflict Detection；
- Document Worker Autoscaling/Timeout/DLQ。

Exit Criteria：多文档并行处理，恶意/损坏/低质量/重复/冲突文档均有可解释结果和审计记录。

### Phase 7 — AI/RAG Controlled Analysis

交付：

- Versioned KB Release Pipeline；
- OpenSearch Private Collection 和 Tenant/Product Scope；
- Context Manifest Reader；
- Retrieval、Evidence、Model Gateway、Guardrail Adapter；
- Bedrock Structured Output；
- Citation/Safety/Schema Validator；
- AI Assessment Repository；
- Offline/Live Evaluation Pipeline 和 Kill Switch。

Exit Criteria：AI Result 可重放、可追溯、引用有效；Prompt Injection、PII、Model Failure 和 Low-quality Retrieval 不会绕过 Human Review。

### Phase 8 — Deterministic Decision 与 Human Review

交付：

- Eligibility、Pricing、Authority 和 Clause Release；
- Risk Snapshot 和 Decision Gate；
- No-auto-decline Route；
- Review Queue、Single Primary Assignee、Optimistic Version；
- Maker-checker；
- Override Reason 和 Evidence；
- RFI 创建新 Submission/Evaluation。

Exit Criteria：所有 Decision Table 100% Branch + Mutation Gate；旧 Evaluation、权限不足和并发 Decision 均被拒绝。

### Phase 9 — Quote、Acceptance 与 Binding

交付：

- Immutable Quote Version；
- Expiry/Current Version Validation；
- Idempotent Acceptance；
- 独立 Binding Workflow/Queue/Worker；
- PAS Adapter；
- Unknown Outcome 和 Reconciliation；
- Policy Projection 和 Operations Hold。

Exit Criteria：成功、确定失败、超时未知、重复请求、响应丢失和 Reconciliation 全部有自动化测试。

### Phase 10 — 三个 Frontend Application

交付顺序：

1. Design System、Auth、Generated Client、Query、Observability、Testing；
2. Broker Portal：Draft、Upload、Submit、Status、RFI、Quote；
3. Underwriter Workbench：Queue、Evidence、AI Assertion、Pricing、Decision；
4. Admin Console：Product、Rule、Pricing、Authority、Prompt、KB Release；
5. A11y、Visual、RUM、Performance Budget 和 CSP。

Exit Criteria：关键 Journey 通过 Playwright、axe、Visual 和断网/并发恢复测试；三个应用可独立构建和回滚。

### Phase 11 — Staging、Release 与 Production Guardrails

交付：

- Build Once/Promote Many；
- Signed Release Manifest、SBOM 和 Provenance；
- Frontend CloudFront Staging/Canary；
- Core API ECS Blue/Green；
- Worker Rolling + Drain；
- Database Expand/Backfill/Contract；
- Workflow Version/Alias；
- AI Shadow/Human-only Canary；
- Protected Production Environment、Manual Promotion 和 Change Set Acknowledgement。

Exit Criteria：同一 Digest 从 Dev 晋级到 Staging；自动 Canary 验证和 Rollback 演练通过。

### Phase 12 — Operational Readiness 与 Multi-region DR

交付：

- Melbourne Warm Standby；
- Aurora Global Secondary、S3 Replication、OpenSearch Rebuild；
- Singapore Cognito MRR Runbook；
- Recovery Scanner；
- SLO Dashboard、Burn-rate Alarm、Runbook 和 On-call；
- Load、Chaos、Restore、Failover 和 Game Day；
- Security/Privacy/Threat Model Final Review。

Exit Criteria：生产 Readiness Review 通过，并有 RPO ≤ 5 分钟、RTO ≤ 1 小时的实测证据。

## 14. 推荐的前 12 个 Pull Request

1. 修复 Lint，隔离 Live Test，建立真实 Coverage Baseline；
2. Node/pnpm/TypeScript/ESLint/Prettier/Husky 统一工具链；
3. GitHub Ruleset、Solo PR Workflow、Critical Path Map 和 CI Security Baseline；
4. 新目录骨架和 Module Dependency Rules；
5. OpenAPI/Event/Task Contract v1；
6. PostgreSQL Container、Migration 和 Repository Test Harness；
7. Tenant + Identity/Access Module；
8. Submission + Evaluation + Audit + Outbox 原子 Use Case；
9. Core API HTTP Pipeline、Problem Details、ETag/Idempotency；
10. CDK Development Network/Data/Core API Skeleton；
11. Outbox Publisher + EventBridge + Idempotent Workflow Starter；
12. SQS Callback Worker Runtime + Synthetic Failure Harness。

前 12 个 PR 完成后，仓库应具备可重复的生产开发骨架；之后再接 Document、AI、Decision 和 Frontend 功能。

## 15. Definition of Done

任何 Module/Feature 未满足以下条件不得标记完成：

- Interface、Invariant、Error Mode 和 Ownership 已记录；
- 无非法跨 Module Import；
- Unit Coverage 100% 且 Per-file Gate 通过；
- 必要的 Property、Mutation、Integration、Contract、E2E 和 Failure Test 通过；
- Edge-case Catalogue 已更新；
- Tenant/AuthZ/PII/Threat Model 已评审；
- Metric、Log、Trace、Audit 已实现且通过 Redaction Test；
- Alarm、Owner、Runbook、SLO 已定义；
- CDK、IAM 和 Guardrail Test 通过；
- N/N−1 Contract 和 Migration Compatibility 已验证；
- 可在 Development/Staging 部署、验证和回滚；
- 文档、ADR 和 Operational Notes 已更新；
- 没有未设 Owner/Expiry 的 TODO、Feature Flag 或 Guardrail Exception。

## 16. 不应采用的捷径

- 不把现有顺序 `packages/pipeline` 直接包装成一个 Lambda 后称为生产 Workflow；
- 不让 Step Functions 通过 Core API HTTP 调用内部步骤；
- 不使用一个共享 SQS Queue 承载所有 Worker；
- 不以 DynamoDB、Redis、SQS 或 Step Functions History 代替业务事实数据库；
- 不在应用启动时自动执行 DDL；
- 不把 Live Model Test 放入普通 Unit/Coverage Job；
- 不通过排除文件获得虚假的 100% Coverage；
- 不把 Mock 调用次数当作领域行为测试；
- 不为追求 Coverage 编写无断言测试；
- 不让 WebSocket 成为业务事实来源；
- 不让 AI 直接 Auto-decline、定价、批准或 Binding；
- 不保存长期 AWS Key 到 GitHub Secret；
- 不按环境重新构建不同 Artifact；
- 不在 Production Console 直接修改 Prompt、Rule、Workflow 或 Infrastructure。

## 17. 官方依据

- [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases)：Production 应使用仍受支持的 LTS；本计划固定 Node.js 24 LTS。
- [GitHub Actions OpenID Connect](https://docs.github.com/en/actions/concepts/security/openid-connect)：使用短期 Cloud Credential，避免长期 AWS Key。
- [GitHub Actions Secure Use](https://docs.github.com/en/actions/reference/security/secure-use)：Action 固定到完整 Commit SHA，并使用最小权限。
- [GitHub Deployment Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)：Environment、Branch Restriction、Wait Timer 和 Deployment Protection；有独立 Reviewer 后再启用禁止 Self-review。
- [AWS Control Tower Control Behavior](https://docs.aws.amazon.com/controltower/latest/controlreference/control-behavior.html)：Preventive、Detective 和 Proactive Control 的职责与实现。
- [AWS CloudFormation Guard](https://docs.aws.amazon.com/cfn-guard/latest/ug/writing-rules.html)：对 CloudFormation Template 执行 Policy-as-code。
- [Amazon Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-components.html)：Prompt Attack、Denied Topic、Sensitive Information 和 Content Filter。
- [Amazon Bedrock Evaluations](https://docs.aws.amazon.com/bedrock/latest/userguide/evaluation.html)：Model、Knowledge Base 和 RAG Evaluation。
