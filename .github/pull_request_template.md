## Outcome

<!-- Describe the user-visible or operational outcome, not only the files changed. -->

## Scope

- Included:
- Explicitly excluded:
- Public seam or contract changed:

## TDD evidence

- [ ] I confirmed the public seam before implementation.
- [ ] I observed the new or changed behaviour fail for the expected reason.
- [ ] I added the minimum implementation and observed the behaviour pass.
- [ ] Tests assert observable behaviour rather than private implementation details.
- [ ] Relevant edge cases, failure modes, tenant isolation, and idempotency are covered.

## Quality evidence

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:integration`
- [ ] No Live Test or external provider call is part of the ordinary PR suite.

## Risk and operations

- [ ] No secret, personal data, insurance document, or production credential is present in the diff, fixtures, logs, or artifacts.
- [ ] Authorization and tenant-boundary effects were reviewed.
- [ ] Observability avoids sensitive payloads and provides actionable failure context.
- [ ] Compatibility, migration, rollback, and recovery implications are documented, or do not apply.
- [ ] This PR does not automatically deploy Production.

High-risk paths affected (check all that apply):

- [ ] Pricing, eligibility, authority, underwriting rules, prompt/model/knowledge base
- [ ] Database migration or irreversible data operation
- [ ] IAM, SCP, KMS, workflow, deployment, or GitHub Actions
- [ ] None of the above

If high risk, link the dedicated checklist and evidence:

## Solo-maintainer review

- [ ] The branch started from the latest `main`; no work was committed directly to `main`.
- [ ] Required checks passed without bypass.
- [ ] I reviewed the final diff after CI completed.
- [ ] I resolved every review conversation and recorded any accepted risk.
- [ ] I will squash-merge and delete the short-lived branch.
