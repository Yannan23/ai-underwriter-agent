# Day 1 Build Plan — 架构骨架 + Happy Path 全通 + 部署上线

> 关联文档：[PRD](./prism-ai-underwriter-prd.md) · [README](./README.md)
> 核心思路：上午冻结契约 + mock 模式全线跑通，下午只给 happy path 换真实现，晚上 deploy。

## 目标与验收标准（Definition of Done）

当天结束时，满足这 4 条才算完成：

1. `pnpm demo:mock` — 断网也能跑通 0→8 全部 9 个 stage（mock 模式，面试保险丝）
2. 提交一份干净的 in-appetite 申请 → 真实调用 Haiku 提取 + Sonnet 评估 → 拿到带引用的报价，全程 < 2 分钟
3. 前端（一页）通过 SSE 实时显示 stage 进度
4. 有一个公网 URL（Railway），面试官打开就能用

**Day 1 哲学：宽度优先于深度。** 9 个 stage 每个都存在、都有类型契约，但每个只做 happy path 一条路。

---

## 时间表（约 10–11 小时，含 buffer）

| 时段 | 块 | 产出 | 检查点 |
|---|---|---|---|
| 09:00–09:45 | ① 脚手架 | monorepo + Hono + Docker 骨架 | `curl /health` 返回 200 |
| 09:45–11:00 | ② **契约冻结**（关键路径） | 9 个 stage 边界的 Zod schema 全部定稿 | `pnpm typecheck` 过 |
| 11:00–12:30 | ③ Mock 全通 | pipeline runner + 每个 stage 的 fixture + SSE 端点 | **检查点 A：mock 模式端到端跑通** |
| 12:30–13:00 | 午饭 | — | — |
| 13:00–17:30 | ④–⑦ 真实现（可并行） | 真 LLM 提取、规则引擎、mini-RAG、评估、定价 | **检查点 B：真实 happy path 出报价** |
| 17:30–18:30 | ⑧ 前端一页 | 表单 + SSE 进度条 + 报价卡片 | 浏览器里完整走一遍 |
| 18:30–19:30 | ⑨ Deploy | Railway 上线 + 健康检查 | **检查点 C：公网 URL 可用** |
| 19:30–20:00 | ⑩ Demo 彩排 | demo 脚本 + 3 条种子申请 | 掐表跑一遍 < 2 分钟 |

---

## 各块细节

### ① 脚手架（45 分钟）

```
ai-underwriter-agent/
├── packages/
│   ├── contracts/        # Zod schemas — 唯一真理源
│   ├── pipeline/         # 9 个 stage 的实现
│   └── config/           # appetite.v1.json, rating.v1.json, prompts/
├── apps/
│   ├── api/              # Hono: POST /applications, GET /applications/:id/events (SSE)
│   └── web/              # 一页静态前端
├── fixtures/             # mock 模式的典型输出
├── Dockerfile
└── .github/workflows/ci.yml   # 先只跑 typecheck + vitest
```

用 Claude Code 一次性生成，人工只审结构不写代码。

### ② 契约冻结（75 分钟）— 全天最重要的 75 分钟

定义每个 stage 的输入/输出 Zod schema：

`RawSubmission → ExtractedApplication → ValidatedApplication → EligibilityResult → RetrievedGuidelines → RiskAssessment → DecisionRecommendation → Quote → RoutingResult`

外加 SSE 事件类型 `StageEvent`。

**冻结之后当天不许改 schema** —— 这是下午能并行开工的前提。改契约 = 所有并行分支返工。

### ③ Mock 全通（90 分钟）

- Pipeline runner：顺序执行 stage 数组，每个 stage 完成后 emit `StageEvent`，状态存**内存 Map**
- 每个 LLM stage 有一份手写 fixture（就是 mock 模式的返回值）
- SSE 端点把事件流推给客户端

> **Day 1 故意不接 Supabase。** 状态放内存，demo 每次全新开始完全够用；这让 deploy 少一个依赖、少一小时配置。数据库、pgvector、状态机持久化是 Day 2 的事——面试里被问到就说"这是我 Day 1 的刻意取舍"。

### ④–⑦ 真实现（下午 4.5 小时，happy path only）

| # | 内容 | 关键取舍 |
|---|---|---|
| ④ 提取 | Haiku + structured outputs，输入是**网页表单的 JSON 序列化文本**（LLM 仍然真实提取+归一化职业分类） | **砍掉 PDF 解析**——PDF 是 Day 2；面试 demo 用表单更流畅 |
| ⑤ 资格引擎 | `appetite.v1.json` + 纯函数 + 6 条 vitest 用例 | 只写 5 条 knockout 规则（职业类别、营收上限、理赔史、州、追溯日期） |
| ⑥ mini-RAG | 手写 8 段 PI 核保指引 chunk，启动时用 Voyage embed，**内存 cosine top-3** | 砍掉 pgvector 和 rerank——8 个 chunk 不需要向量数据库 |
| ⑦ 评估+决策+定价 | Sonnet 出带 chunk id 引用的风险评估 → **代码校验引用真实存在** → 规则引擎定 approve/refer → 费率表纯函数出保费 | 引用校验一定要做——demo 里最亮的 30 秒："模型说的每句话，代码都验过出处" |

### Subagent 并行策略（可选，省 ~1.5 小时）

契约冻结后四条线互不依赖，可以开 3 个 Claude Code 并行分支：

- **Agent A**：④ 提取 + ⑤ 资格引擎
- **Agent B**：⑥ mini-RAG + ⑦ 评估（含引用校验）
- **Agent C**：⑦ 决策/定价 + ⑧ 前端

本人只做两件事：审 merge、跑检查点。串行做也能在 17:30 前完成——并行是加速项不是必需项。

### ⑨ Deploy（1 小时，Railway）

1. Dockerfile 多阶段构建（build → 仅 prod 依赖的 runtime 镜像）
2. Railway 连 GitHub repo → 自动检测 Dockerfile → 设 `ANTHROPIC_API_KEY`、`VOYAGE_API_KEY` 环境变量
3. 配 health check 路径 `/health`，拿到 `*.up.railway.app` 域名
4. 推一个 commit 验证自动部署链路通

因为没有数据库，这一步几乎不会出意外。**唯一预留的坑**：Railway 请求超时对 SSE 长连接的影响——如果流被掐，fallback 是前端改轮询 `GET /applications/:id`（30 分钟内可完成的 plan B）。

### ⑩ Demo 彩排（30 分钟）

准备 3 条种子申请 + 一页 demo 脚本：

1. **开场**（30 秒）：打开公网 URL，说一句"这复刻的是 PI 核保员的真实工作流"
2. **主线**（2 分钟）：提交干净申请 → SSE 进度条逐 stage 亮起 → 报价卡片出现，指着引用说"每条风险发现都被代码校验过引用"
3. **亮点**（1 分钟）：提交一条踩 knockout 的申请 → 秒拒于规则引擎，**没花一分钱 token**——"LLM 负责提取和推理，代码负责决定"
4. **保险丝**：现场断网/API 挂了 → `MOCK_MODE=true` 重启，流程照样演示

---

## 明确砍掉的（Day 2+，被问到时的标准答案）

PDF 解析、RFI 循环、HITL 审核台（NDJSON）、Supabase 持久化 + pgvector、Promptfoo eval 进 CI、注入对抗测试、可观测性面板、优雅关闭/断点续跑。

每一项都在 PRD 里有完整设计——**Day 1 砍它们是排期决策，不是设计缺失**。

## 最大单点风险

下午④的 structured outputs 调通（模型输出偶尔不合 schema）——时间表给了它整个下午而不是 1 小时；如果 16:00 还没通，降级为 "JSON mode + Zod safeParse + 一次重试"，保 demo 优先。
