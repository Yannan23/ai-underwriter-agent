# High-risk Change Checklist

Complete this in addition to the solo-maintainer checklist when a change affects pricing, eligibility, underwriting authority, prompt/model/knowledge-base versions, database migrations, IAM/KMS, durable workflows, deployment, or CI security.

## Decision and customer safety

- Identify the business owner, invariant, effective version, and audit event for the changed decision logic.
- Demonstrate tenant isolation, authorization, idempotency, replay, duplicate, timeout, and unknown-outcome behaviour where applicable.
- Confirm AI output remains advisory, schema-valid, citation-backed, within authority, and fail-closed at deterministic decision boundaries.
- Record deterministic evaluation datasets and compare results to the accepted baseline.

## Change and recovery

- Attach generated infrastructure, schema, workflow, or migration diffs.
- State backward/forward compatibility and N/N-1 event or task-contract behaviour.
- Provide rollback or roll-forward steps and identify the point of no return.
- Verify backup/restore or workflow recovery where the change modifies durable state.
- Define post-change signals, thresholds, owner, and observation window.

## Production boundary

- Merging is not Production promotion.
- Production promotion must use an immutable release manifest and a separate manual workflow and environment.
- Break-glass use requires an incident/reason record and follow-up review.
