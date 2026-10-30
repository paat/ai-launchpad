# AGENTS.md — AI Launchpad

Rules for any coding agent (Codex, Claude Code, Muse Code, …) working in this repository. Product context: [README.md](README.md). Event rules and dates: [docs/hackathon.md](docs/hackathon.md). Research: [docs/research/](docs/research/README.md).

If a local `HANDOFF.md` exists, read it first: it holds the current state, owner decisions and the gates that need the owner's approval. It is private and git-ignored — never commit it or copy its contents into tracked files.

## This repository is public

- NEVER commit secrets (API keys, OAuth client secrets, tokens), `.env` files, personal data, or private business data of the owner, their companies or their customers. Configuration comes from environment variables; keep an `.env.example` with placeholder values only.
- Use synthetic companies and documents in tests, fixtures and demos. Public register data is allowed with its licence attribution.
- CI runs on GitHub-hosted runners (public repo); never add a self-hosted runner.

## Hackathon rules that bind development

- **New work only.** Product code is written during the event (27 Oct – 4 Nov 2026) in this repository. Do not copy code from other repositories, including the owner's private ones. Existing services are used only through their public interfaces — the Ärikratt MCP at `https://arikratt.ee/mcp` is an external dependency.
- **The product must use Meta's models**, genuinely: the setup helper and background jobs (see README "Where Meta's models fit"). Open weights via Baseten's OpenAI-compatible endpoint (`https://inference.baseten.co/v1`, model `meta-models/muse-spark-open-1026`) or the Meta Model API. Keep the model behind a small interface so the provider can change.
- Submission deadline: Thu 5 Nov 2026 04:00 Tallinn (Wed 4 Nov 21:00 ET). The demo may show only work built during the event.

## Product principles (from README — do not drift)

**End goal:** AI agents take the back-office load off small-business owners and their employees, so people spend their time on their core work. Judge product changes by whether they move toward the person's own agent taking a job off them end-to-end; where an action is executable, require an exact-payload approval and a recorded outcome. Read-only checks need neither.

1. The owner's own assistant (Claude, ChatGPT) is the interface; we expose one remote MCP gateway. No chatbot that competes with it, except the temporary setup helper for people with no assistant yet.
2. No forms: derive from public data or the assistant's context; ask only what nobody else knows.
3. Nothing is filed, paid, signed or sent without a server-enforced approval bound to the exact recipient, amount, period and document. Record every action's state (submitted / accepted / rejected / paid).
4. Rules compute, models read: deadlines, tax amounts and obligations come from deterministic code with an official source per rule; models read, plan and draft.
5. Store almost nothing: registry code and derived obligations.
6. Reuse existing MCP servers before building adapters.

## Never automate

Smart-ID / Mobile-ID / ID-card PIN entry, qualified signatures, real submissions to government portals, real payments. Portal automation stops before Submit. Development and demos use test data.

## Engineering

KISS, YAGNI, DRY: the simplest design that ships the demo. No enterprise machinery. Completeness of authentication, validation, approvals and honest failure states is never cut for simplicity.

<!-- saas-startup-team:engineering-principles:start -->
## Engineering principles

Follow KISS, YAGNI, and DRY on every change:

- **KISS** — simplest design that fully ships the product need. Prefer boring, managed infrastructure one founder can run alone. Do not add enterprise machinery (service splits, self-operated brokers, SSO/SAML/SCIM hierarchies, multi-region HA, heavyweight observability) unless `Done` or a concrete security, legal, reliability, or operability requirement needs it.
- **YAGNI** — no speculative features, premature abstractions, unused config, or defensive branches for states that cannot happen. Do not expand scope because a future idea might need it.
- **DRY** — remove *meaningful* duplication (copy-pasted logic or restated rules that will drift). Do not invent frameworks for two similar lines, and keep intentional decorrelated variants (e.g. independent review legs) separate.

These apply to product code, tests, docs, prompts, and agent workflows. Completeness of authentication, validation, payments/data correctness, backups/recovery, and honest failure states is never cut for "simplicity."
<!-- saas-startup-team:engineering-principles:end -->
