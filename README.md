# AI Launchpad — AI-hüppelaud

Put your AI assistant to work for your business / Pane oma AI-assistent ettevõtte heaks tööle.

Turn the AI assistant an Estonian small-business owner already has — or is about to get — into their business assistant.

> **Status (27 Oct 2026):** research and product brief only. Pre-event research dated 25–26 Oct 2026 exists (see [docs/research/](docs/research/README.md)); event-window research notes (H, I) are dated 27 Oct 2026. **No product code, no Meta model runtime integration, no live product, and no demo exist yet.** Product code will be written only during the event (starting 27 Oct 2026) in the public repository `paat/ai-launchpad`. See [docs/hackathon.md](docs/hackathon.md).

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
5. **Store almost nothing.** The registry code and the derived obligations; everything else is re-derivable from public data.
6. **Reuse before building.** Existing MCP servers (accounting, bank, credit data, the assistant's built-in e-mail and calendar) are curated, not rebuilt. New adapters are built where demand shows.

## How it works

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
| Catalogue | Vetted MCP servers per job; how to connect each |
| Permissions | Per-authority inventory (EMTA, Business Register, …) with expiry and revocation — filing rights are separate per authority |
| Approvals & receipts | Server-enforced approval bound to the exact action; submitted / accepted / rejected / paid states |
| Portal prefill | Where no API exists, a browser agent fills the government portal and stops before Submit |
| Friction loop | Where an assistant gets stuck: classify why, deduplicate, redact, publish an owner-approved request as open demand on the marketplace |

Each job is handled one of four ways: an existing MCP · an adapter on an official API · a browser agent with a hard stop · the owner (PINs, signatures, judgement calls). Mapping in [docs/research/README.md](docs/research/README.md).

Starting jobs (from the research's top-10 lists): deadlines this month · counterparty check · sales invoice · supplier invoice into the books · bank reconciliation · payment reminder · monthly payroll/VAT filing preparation · annual-report preparation · VAT-threshold warning · grants and tenders.

## Discovery design (draft, not deployed)

The adopted discovery design is a draft: an AI Catalog index plus MCP Server Cards describing the gateway and curated connectors. Nothing here is deployed — there is no live catalogue, no live card, and no live endpoint yet. Details and evidence status are in [docs/research/H-mcp-discovery-and-publication.md](docs/research/H-mcp-discovery-and-publication.md).

## Where Meta's models will fit (planned, not built)

| Where | Planned model use | Why it's genuine |
|---|---|---|
| Setup helper for owners with no assistant yet | Muse Spark (vision), Muse Voice Transcribe | They have no assistant to help them get one |
| Background jobs: friction classification, redaction and specs; playbook updates when laws change; mapping activities to sector duties | Planned provider-hosted open weights (Muse Spark Open / Muse Glimmer), optionally via Baseten | Keeps the model behind a small interface so the provider can change; no lock-in |
| Turning accepted requests into new adapters | Muse Code | Development tooling |

Not: a chatbot competing with the owner's assistant. Estonian-language quality of these models is untested — check on day one; the product stands either way. No EU self-hosting or data-residency posture exists yet; that will be decided and documented when the integration is built.

Meta's own consumer agent app (Muse) is available only in the US and Canada as of 26 Oct 2026 and documents no custom MCP setting; see [docs/research/G-muse-app-for-estonian-smes.md](docs/research/G-muse-app-for-estonian-smes.md). AI Launchpad stays MCP-first and can add a plain API if Muse arrives in the EU.

## Hackathon scope

- **In:** Path A and Path B for the first persona; `get_started`, obligations calendar and 3–4 playbooks; approval cards; the friction loop made visible; the setup helper.
- **Demo story:** an owner who has never used AI goes from a Google search to a working business assistant on their phone in about five minutes, the assistant does a real job with an approval card, and a request it can't serve appears as open demand.
- **Out:** payments, unattended filing or signing, payroll submission, a marketplace UI beyond the demand list, FIE/e-resident/employer variants.

## Validation

Test with 3–5 real owners of the first persona during the build week (with consent). Measure time to first useful task (target under five minutes) and whether they come back the following week.

## Open questions

- ChatGPT's plan requirements for custom MCP connectors.
- Which authorities allow a multi-tenant gateway to act on an owner's mandate (EMTA X-tee machine rights, RIK Andmesild, Tervisekassa).
- Werkzeug and Trivis (existing Estonian accounting MCPs): partners, listings or competitors?
- Estonian quality of Muse Spark / Muse Spark Open / Voice Transcribe; SAM 3.1 availability in the Meta Model API.
- Address — proposed subdomain `huppelaud.arikratt.ee` is **not deployed**; do not treat it as available or live.

## Relationship to Ärikratt

This is a separate project. It calls the public [Ärikratt MCP](https://arikratt.ee/mcp) (Estonian public-register data) as an external dependency, like any other API.
