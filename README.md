# AI Launchpad — AI-hüppelaud

Put your AI assistant to work for your business / Pane oma AI-assistent ettevõtte heaks tööle.

Turn the AI assistant an Estonian small-business owner already has — or is about to get — into their business assistant.

> **Status:** owner-only HTTPS pilot at https://huppelaud.arikratt.ee. One owner ChatGPT plus Meta/Baseten path tested; Claude untested, so this is not broad compatibility or production ready. See [docs/live-pilot.md](docs/live-pilot.md) for dated evidence, cost, and recovery limits. Local demo and tests remain mock ($0); see [docs/local-demo.md](docs/local-demo.md).

## The problem

- An Estonian micro-entrepreneur carries the whole back office: payroll and VAT filings, the annual report, invoices, bookkeeping, contracts, permits and sector rules. The [research](docs/research/README.md) maps **354 such jobs**.
- General assistants (Claude, ChatGPT) are already on the owner's phone, but they don't know Estonian obligations, aren't connected to the accounting software, bank and registers, and have no safe way to act.
- Many owners feel left behind in the agent race: they hear about AI agents but have never set one up and are wary of letting one near their taxes and money.

## Who it's for

| Audience | Gap we close |
|---|---|
| **Owners who already use ChatGPT or Claude for chat** (main target) | Turn that chat app into a business assistant: connectors, Estonian knowledge, approvals |
| **Owners who feel left behind** — never used an agent | A calm path from zero to a working assistant on their phone |
| Owners who already connect MCP servers themselves | Early testers |
| Later: accountants serving many micro-companies | One accountant sets it up for many clients |

First persona: a one-person Estonian service OÜ, books in e-arveldaja or Merit. FIEs, e-residents and employers follow later — their rules differ.

## Principles

1. **The owner's own assistant is the interface.** We don't run a chatbot that competes with it. The only exception is a temporary setup helper for people who have no assistant yet.
2. **No forms.** What public registers or the assistant's own context already know is never asked. The owner answers only what nobody else can.
3. **Nothing is filed, paid, signed or sent without an approval** bound to the exact recipient, amount, period and document. Every action leaves a receipt.
4. **Rules compute, models read.** Deadlines, tax amounts and obligations come from deterministic rules code with official sources; models read documents, plan steps and draft text.
5. **Store minimal private operational state.** Identity/workspace references, bounded assessments and task reports, grants, receipts and activity support the companion. These are not re-derivable from public registers. Do not request conversations or source documents; let owners inspect, export and delete their progress. [Current limits](docs/local-demo.md#identity-storage-and-limits).
6. **Reuse before building.** Existing MCP servers (accounting, bank, credit data, the assistant's built-in e-mail and calendar) are curated, not rebuilt. New adapters are built where demand shows.

## Planned product flow (beyond the local demo)

### Path A — the owner already has an assistant

1. **Site:** one step that can't happen in chat — add the AI Launchpad connector to Claude or ChatGPT (URL + a three-step guide; later one tap via their connector directories).
2. **In chat:** "help me run my company's admin" → the assistant calls `get_started` and asks only *which company?* (name or registry code).
3. **AI Launchpad fills in the rest from public data** via the [Ärikratt MCP](https://arikratt.ee/mcp): VAT number and activities (Business Register), employee count, labour taxes and turnover (tax board quarterly data), licences, annual-report status, tax debt → **obligations calendar and the list of jobs the assistant can take over**.
4. **Unknowns** (accounting software, bank): the assistant first checks its own connectors; it asks one question only if still unknown.

### Path B — the owner feels left behind

1. **Start where they already are:** Ärikratt company pages already get search traffic. Each shows "your assistant could handle these deadlines for this company → set it up". Their own company, no input, value first.
2. **One recommendation, not a menu:** e.g. Claude — the free plan allows one custom connector, and AI Launchpad is one endpoint.
3. **Guided setup on their own phone:** QR code from computer to phone, exact steps with screenshots for their app and phone, "✓ Connected" detected by the gateway.
4. **A safe first win in five minutes:** read-only prompts — "what are my deadlines this month?", "check this company before I take the job", "is my annual report filed?"
5. **Trust ladder:** level 1 answers and reminders → level 2 drafts the owner sends → level 3 actions with an approval card. The assistant suggests the next level; nothing is forced.
6. **Setup helper (a bridge, not a rival):** "I'm stuck — here's my screen" (screenshot → where to tap) and voice for people who prefer talking. Once their own assistant is connected, it hands over: "from now on, talk to Claude."
7. **Human backup:** a weekly online setup clinic in Estonian, or setup through their accountant.

### AI Launchpad (one MCP gateway)

| Part | What it does |
|---|---|
| Company profile & obligations calendar | Rules engine + Ärikratt public data |
| Job playbooks (~10 to start) | For each job: steps, tools, approval points, official source |
| Catalogue | Researched MCP services per job; how to connect each; runtime verification remains future work |
| Permissions | Per-authority inventory (EMTA, Business Register, …) with expiry and revocation — filing rights are separate per authority |
| Approvals & receipts | Server-enforced approval bound to the exact action; submitted / accepted / rejected / paid states |
| Portal prefill | Where no API exists, a browser agent fills the government portal and stops before Submit |
| Friction loop | Where an assistant gets stuck: classify why, deduplicate, redact, publish an owner-approved request as open demand on the marketplace |

Each job is handled one of four ways: an existing MCP · an adapter on an official API · a browser agent with a hard stop · the owner (PINs, signatures, judgement calls). Mapping in [docs/research/README.md](docs/research/README.md).

Starting jobs (from the research's top-10 lists): deadlines this month · counterparty check · sales invoice · supplier invoice into the books · bank reconciliation · payment reminder · monthly payroll/VAT filing preparation · annual-report preparation · VAT-threshold warning · grants and tenders.

## Discovery design (draft, unpublished)

The adopted discovery design is a draft: an AI Catalog index plus MCP Server Cards describing the gateway and curated connectors. Those discovery artifacts are unpublished — no live catalogue or card yet. This does not deny the live owner-only MCP pilot endpoint — see [docs/live-pilot.md](docs/live-pilot.md). Details and evidence status are in [docs/research/H-mcp-discovery-and-publication.md](docs/research/H-mcp-discovery-and-publication.md).

## Where Meta's models fit (harness tested; product roles planned)

| Where | Planned model use | Why it's genuine |
|---|---|---|
| Setup helper for owners with no assistant yet | Muse Spark (vision), Muse Voice Transcribe | They have no assistant to help them get one |
| Background jobs: friction classification, redaction and specs; playbook updates when laws change; mapping activities to sector duties | Planned provider-hosted open weights (Muse Spark Open / Muse Glimmer), optionally via Baseten | Keeps the model behind a small interface so the provider can change; no lock-in |
| Turning accepted requests into new adapters | Muse Code | Development tooling |

Not: a chatbot competing with the owner's assistant. The historical bounded quality harness ran two genuine synthetic setup calls on 2026-10-28 (generic acceptable English/Estonian, not a benchmark — see [docs/model-quality.md](docs/model-quality.md)); the owner-only pilot aggregate is now 4 real calls total — see [docs/live-pilot.md](docs/live-pilot.md) for the pinned runtime and receipts. Planned product roles beyond that bounded pilot are otherwise untested. No EU self-hosting or data-residency posture exists yet; that will be decided and documented when the integration is built.

Meta's own consumer agent app (Muse) is available only in the US and Canada as of 26 Oct 2026 and documents no custom MCP setting; see [docs/research/G-muse-app-for-estonian-smes.md](docs/research/G-muse-app-for-estonian-smes.md). AI Launchpad stays MCP-first and can add a plain API if Muse arrives in the EU.

## Hackathon scope and target demo

- **Scope:** the free micro-entrepreneur service only. [Enterprise measurement](docs/design/future-enterprise-measurement.md) is future design; billing and enterprise features are excluded.
- **Target, not current completion:** Path A and Path B for the first persona; `get_started`, obligations calendar and 3–4 playbooks; approval cards; the friction loop made visible; the setup helper.
- **Target demo story (not yet achieved):** an owner who has never used AI goes from a Google search to a working business assistant on their phone in about five minutes, the assistant does a real job with an approval card, and a request it can't serve appears as open demand.
- **Out:** payments, unattended filing or signing, payroll submission, a marketplace UI beyond the demand list, FIE/e-resident/employer variants.

## Accepted product requirements

- [R-001: recommend the action that removes the most owner work](docs/requirements/R-001-next-best-action.md) ([issue #1](https://github.com/paat/ai-launchpad/issues/1)). The owner’s agent makes the final assessment using Launchpad’s framework, with evidence, assumptions and one clear next action. Success means time saved, reliable outcomes and less remaining manual work; estimates and unconfirmed reports remain labelled. Agent-assessed coverage is separate from source-verified outcomes (currently zero); no manual ratification is required.
- [R-002: identity-only sign-in and bounded runtime model use](docs/requirements/R-002-identity-and-runtime-cost.md) ([issue #3](https://github.com/paat/ai-launchpad/issues/3)). Google is identity only; the old adapter in `src/model.ts` stays hard-disabled. A separate bounded quality harness is now live-tested ([docs/model-quality.md](docs/model-quality.md)); the reviewed public-cards path is piloted live owner-only ([docs/live-pilot.md](docs/live-pilot.md)), and broader public runtime activation stays a later decision.
- Deadlines from rules ([issue #19](https://github.com/paat/ai-launchpad/issues/19), [rules memo](docs/research/N-obligation-deadline-rules.md)). The `get_obligations` tool and the Status card compute KMD, TSD, annual-report, VAT-threshold and TÖR dates with deterministic rules, each row linked to its Riigi Teataja source; no model produces a date. Unknown facts become conditions and questions, never guesses. Public-register lookup needs an Ärikratt API key (`ARIKRATT_API_KEY`), which is not provisioned yet; until then the facts come from the owner's assistant or the labelled sample companies.

## Validation

Test with 3–5 real owners of the first persona during the build week (with consent). Measure time to first useful task (target under five minutes) and whether they come back the following week.

## Open questions

- ChatGPT's plan requirements for custom MCP connectors.
- Which authorities allow a multi-tenant gateway to act on an owner's mandate (EMTA X-tee machine rights, RIK Andmesild, Tervisekassa).
- Werkzeug and Trivis (existing Estonian accounting MCPs): partners, listings or competitors?
- Estonian quality of Muse Spark / Muse Spark Open / Voice Transcribe; SAM 3.1 availability in the Meta Model API.
- Address — owner-only HTTPS pilot live at `https://huppelaud.arikratt.ee` since 28 Oct 2026 UTC / 29 Oct Tallinn (commit `2bf1d06265ae1c8173cb3491cd34f18441a36f04`); one owner/workspace pilot, not general availability.

## Relationship to Ärikratt

This is a separate project. The planned integration calls the public [Ärikratt MCP](https://arikratt.ee/mcp) (Estonian public-register data) as an external dependency, like any other API.
