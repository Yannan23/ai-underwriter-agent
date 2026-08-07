# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Prism — an AI underwriting agent for professional indemnity insurance. The
current repository still contains an M0 demo (`apps/api`, `apps/web`,
`packages/contracts`, `packages/config`, and `packages/pipeline`), but the
target architecture is the production rebuild described in `docs/`: a Core API
modular monolith, independent asynchronous workers, Aurora PostgreSQL,
Transactional Outbox, EventBridge, Step Functions Standard, workload-specific
SQS queues, and three independently deployed frontend portals.

Use `docs/rebuild-plan.md` and `docs/rebuild-execution-plan.md` as the build
plan. Use `prism-ai-underwriter-prd.md` for product requirements.

## Commands

- `pnpm dev` / `pnpm demo:mock` — run the legacy local demo API (mock mode
  needs no API keys)
- `pnpm test` — Vitest with coverage (100% thresholds, enforced)
- `pnpm lint` / `pnpm lint:fix` — ESLint (strict, type-checked, spell-checked)
- `pnpm format` / `pnpm format:check` — Prettier
- `pnpm typecheck` — `tsc --noEmit` across all workspace packages

Husky runs lint-staged (ESLint + full typecheck + Prettier check) on
pre-commit and commitlint on commit-msg. CI re-runs all of the above.

## Design principles

- **KISS** — prefer the simplest implementation that works. No cleverness that
  needs a comment to justify itself. If a junior engineer can't follow the
  code in one read, simplify it.
- **Single responsibility** — one module/function does one thing. Pipeline
  stages are the template: each stage has one job, one input, one output.
  Split a function when you need "and" to describe what it does.
- **DRY, but not prematurely** — extract shared logic once a real third use
  appears or the duplication hides a single business rule (e.g. a threshold
  that must change in lockstep). Two similar-looking blocks with different
  reasons to change are not duplication.
- **YAGNI** — build what the current task needs, nothing speculative. No
  "just in case" parameters, abstractions, or config switches.
- **Small units** — short functions, small files, small diffs. When a change
  grows past one concern, split the work.
- **Composition over inheritance** — plain functions and typed objects. This
  codebase has no class hierarchies; keep it that way (Error subclasses are
  the only exception).
- **Fail fast and loud** — validate at boundaries, throw with a specific
  message immediately (`throw new Error('pricing requires occupationClass…')`).
  Never swallow errors; never silently skip a failed step. A failed pipeline
  stage parks the application for a human — preserve that property.
- **Pure core, effects at the edge** — business logic (eligibility, rating,
  routing, validation) is pure functions taking data in, returning data out.
  I/O, clocks, randomness, and process state live in `apps/api` or the stage
  wrapper, not the domain functions. That's what makes 100% coverage cheap.
- **Determinism where it matters** — the PRD is explicit: no LLM anywhere in
  eligibility, pricing, or routing decisions. LLM output is one _input_ to a
  deterministic routing matrix, never the decider. Do not weaken this.

## Code conventions

- **Contracts first** — all cross-package data shapes are Zod schemas in
  `packages/contracts`, parsed at boundaries (`Schema.parse(...)`). New shape?
  Add the schema and infer the type; never hand-write a duplicate interface.
- **Type honesty** — no `any` (typed lint forbids unsafe use). Use `unknown`
  at untyped boundaries and narrow. Explicit return types on declared
  functions. Handle `null`/`undefined` explicitly — `noUncheckedIndexedAccess`
  is on.
- **Naming** — descriptive, real dictionary words (cspell runs in lint; add
  genuine domain terms to `cspell.config.yaml`, never invent spellings).
- **Imports** — ordered and alphabetized (lint-enforced), inline `type`
  imports, no duplicate path segments (`foo/foo`).
- **No `console`** — it's a lint error and any stray output fails tests.
  The single server-startup log has an explicit inline exemption.
- **Async** — `await`, never `.then()` chains. Fire-and-forget only via an
  explicit `void (async () => { try … catch … })()` with error handling.
- **Comments** — explain _why_ or a non-obvious constraint, never _what_ the
  next line does. Match the existing density: a short doc comment on each
  exported function or stage, little else.
- **Formatting is Prettier's job** — never hand-align; run `pnpm format`.

## Testing rules

- Coverage thresholds are 100% (statements, branches, functions, lines) over
  `packages/*/src`. New code ships with tests that genuinely exercise its
  branches — no assertion-free tests written just to hit numbers.
- Use `test()` (not `it()`), files named `*.test.ts` under each package's
  `test/` directory.
- Test pure functions directly with constructed inputs; test stages through
  `runPipeline` or `stage.run(state, ctx)`. Fixtures live in `fixtures/`.
- Tests must be deterministic: no real network, clocks, or randomness.
- `apps/api` is currently excluded from coverage (see `vitest.config.ts`);
  when adding API tests, remove the exclusion rather than working around it.

## Workflow

- Conventional Commits (`feat: …`, `fix: …`, `chore: …`) — enforced by
  commitlint.
- Commit messages carry no `Co-Authored-By` or other AI-attribution trailers.
- Before considering any change done: `pnpm lint && pnpm format:check &&
pnpm typecheck && pnpm test` must all pass. Don't bypass hooks
  (`--no-verify`) or loosen thresholds/rules to get green — fix the code, or
  raise the trade-off explicitly if a rule seems wrong for the case.
- Keep `pnpm-lock.yaml` in sync via pnpm commands; never edit it by hand.
