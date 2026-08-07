# Solo-maintainer Pull Request Checklist

Use this checklist with the repository PR template. It preserves change isolation and evidence without pretending that an independent reviewer exists.

## Before opening the PR

- Work on a short-lived `feat/`, `fix/`, `refactor/`, `test/`, or `chore/` branch created from the latest `main`.
- Keep one reviewable behaviour or infrastructure outcome per PR.
- Confirm the public seam and acceptance example before the first executable test.
- Record the expected RED reason and retain the final GREEN command output as PR evidence.
- Remove secrets, customer documents, personal data, and production identifiers from fixtures and logs.

## Before merging

- Wait for the stable `PR Quality Gate` result; do not require each implementation job separately in the Ruleset.
- Require `Dependency Review Gate` when Dependency Review is available.
- Require `CodeQL / Analyze JavaScript and TypeScript` when Code Scanning is available.
- Re-read the complete final diff after all automation and generated-file updates.
- Verify compatibility, migration, rollback, monitoring, and recovery notes for every affected high-risk path.
- Resolve all conversations, document accepted risk, squash-merge, and delete the branch.
- Never use administrator bypass for ordinary work.

## Repository settings that code cannot enforce

- Protect `main` with a GitHub Ruleset: require a pull request, required status checks, conversation resolution, and an up-to-date branch; disallow force pushes and deletion.
- Allow solo self-merge but require no external approval until a qualified second maintainer exists.
- Enable Secret Scanning and Push Protection where the repository plan supports them.
- For a private repository, enable GitHub Advanced Security and set repository variable `GHAS_ENABLED=true`; otherwise Dependency Review is deliberately reported as unavailable.
- CodeQL deliberately skips pull requests from forks because GitHub downgrades their token and does not grant SARIF upload permission; run it after bringing trusted changes onto an in-repository branch.
- Create a `live-tests` Environment restricted to `main`, place `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` only in that Environment, and never expose them as repository-level secrets.
- Restrict Actions to trusted publishers or an explicit allowlist; keep every third-party Action pinned to a full commit SHA.

The `live-tests` Environment restriction is essential: the workflow also checks `github.ref`, but the Environment rule prevents a modified workflow on an untrusted branch from receiving its secrets.
