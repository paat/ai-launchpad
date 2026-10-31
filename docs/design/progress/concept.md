# AI adoption progress — concept, 30 Oct 2026

Owner ask: "an AI adoption progress bar — a sense of overall progress, an overview of what has been done, and how to improve further." North star: progress is **jobs taken off the person**, not clicks or features used. Fits direction A „Selge leht” (`docs/design/direction-a/directions.md`, `docs/design/direction-a/plan.md`): white page, one highlighted object per screen, amber only for "needs you", honest labels.

Inputs read: `src/db.ts`, `src/core.ts`, `src/mcp.ts`, `src/catalog.ts`, `src/obligations.ts`, `src/oauth.ts`, `src/fixtures.ts`, `src/views.ts` (`tanaBody`, `connectBody`), issue #51.

## Three concepts

### 1. „Käest ära” — the handover bar (recommended)

One bar where **each segment is one named back-office job** of this company. A segment has one of four fills: outlined = still yours; mid green = the assistant prepares it and you approve each one; deep green = at its ceiling (the assistant does it under your standing approval, or the law says you file it yourself and the assistant has done everything up to that); dashed = someone else does it (the assistant's assessment, e.g. the accountant). The headline is a count, never a percentage: „2 tööd 4-st on sinu käest ära”.

- (a) Glance: the count and the bar. A job's segment changes fill only when a stored approval reaches a done outcome or a standing approval is live.
- (b) Overview: the same jobs as rows under the bar, each with its rung, the evidence (how many sent/paid/submitted, when last, under which rule) and the labels the product already uses („Assistent teatas”, „Assistendi hinnang”, „Arvutatud reeglist”, „Sinu püsiluba”).
- (c) Next step: exactly one, chosen by a deterministic rule (below), rendered as the one elevated `.ask` card: a standing-approval sentence with pre-filled limits, a playbook prompt to paste to the assistant, or a connector from `/kataloog`.

Why it fits: the unit of progress is literally a job off the owner's plate; every fill is backed by a row Launchpad already stores; the "ceiling" makes the legal limits (Smart-ID, e-MTA) a visible, honest top rung instead of a missing percentage.

### 2. „Laualt maas” — the ledger

A dated ledger of jobs the assistant finished: one line per done approval (date · job · recipient · amount · „ilma sinuta” or „sinu kinnitusega”), with monthly subtotals: „Detsembris 7 tööd, 4 ilma sinuta”.

- (a) Glance: this month's two numbers, and whether the "without you" number grows month over month.
- (b) Overview: the ledger itself — it *is* Tehtud, grouped by month.
- (c) Next step: weak. A ledger shows volume, not which job is still yours; the next step has to come from elsewhere.

Verdict: the strongest "proof of work" view and the best fit for direction B „Kviitung” later, but it does not answer "how far am I" because it has no denominator. Borrowed into concept 1 as the one-line monthly tally.

### 3. „Tagasi saadud aeg” — the weekly time-back meter

A meter of hours returned per week, from the assistant's `estimated_effort_saved` per responsibility and per playbook.

- (a) Glance: „≈ 2 h nädalas tagasi”.
- (b) Overview: hours per job.
- (c) Next step: the job with the largest estimated hours still yours.

Verdict: rejected as the primary view. Launchpad measures no time; every figure would be an assistant estimate and the page already says „Säästetud aega ei ole mõõdetud, seega me seda ei näita”. It would also tempt the assistant to inflate estimates. If ever shown, only inside a row as „Assistendi hinnang: ~20 min kuus”, never as the headline.

## Recommendation: concept 1, „Käest ära”

### Where it lives

- **Täna, hero**: one tappable strip under the three pills — the count line and the small bar — linking to the full section. It is not a card; the ask card stays the only elevated object on Täna.
- **Ühendus**: the full section `#kaest-ara` placed above „Püsiload”, because the top rung *is* a standing approval and the standing-rule controls are already on that page. The next-step card lives here.

### The rungs and how each is computed

| Rung (copy) | Fill | Condition (all from stored rows) |
|---|---|---|
| „Teed ise” | outlined | none of the below |
| „Teeb raamatupidaja” (someone else) | dashed | latest assessment responsibility matched to the job has `isHandled()` true; `executor` shown; label „Assistendi hinnang” |
| „Assistent valmistab ette, sina kinnitad” | mid green | ≥ 1 `approvals` row for the job with `state='consumed'` and an outcome in sent / submitted / paid / accepted, **not** `approved_by_rule` |
| „Assistent teeb ise · Sinu püsiluba” | deep green | a live `standing_approvals` row (`revoked_at IS NULL AND expires_at > now`) whose `kind` = the job's `approval_kind`, **and** ≥ 1 done outcome for the job (a rule alone does not count until it has worked once) |
| „… sina esitad · Lagi käes: seadus” | deep green | job's `approval_kind` is `prepare_filing` or `prepare_payment` (never auto-approved, `STANDING_KINDS` in `src/mcp.ts`) and ≥ 1 done outcome |

Count in the headline = jobs whose fill is mid green, deep green or dashed. The sub-line splits it („2 ilma sinuta, 1 sinu kinnitusega”). A pending approval adds an amber dot to the segment and a waiting chip in the row; it never changes the fill.

### The job list (denominator)

Rows = union of:
1. **Executable playbooks that apply to this company** (`PLAYBOOKS` with `approval_kind !== null`): `payment-reminder` always; `vat-return-prep` when `computeObligations` returns `vat-return-kmd`; `annual-report` when it returns `annual-report` / `annual-report-overdue` (shown as seasonal with its date). `deadlines-check` is read-only and is not a job.
2. **Non-core applicable responsibilities** from the latest assessment (`applicability='applicable' AND is_core=false`) that are not already covered by a playbook row — e.g. „Arvete koostamine” in the alpha fixture.

Jobs appearing from a new assessment are said out loud in the sub-line („Assistendi hinnang lisas nimekirja 1 töö”), so the denominator growing never looks like regression.

### The next step (one, deterministic)

In order; the first that matches wins:
1. A job at mid green whose `approval_kind` is in `STANDING_KINDS` and has no live rule → **standing-approval sentence** with limits pre-filled from that job's past approvals: recipients = distinct `payload_json.recipient.address`, cap = max `amount_cents` rounded up to the next 100 €, `max_per_day` and `days` from `STANDING_DEFAULTS`. Posts to the existing standing-rule form.
2. A live rule expiring within 14 days → renew (same form).
3. A job still outlined whose playbook `needs` are met or can be met by sharing a file → the playbook's prompt („Palu assistendilt: …”), soonest obligation first, `payment-reminder` before any filing because it can reach the top rung.
4. Otherwise → the connector the playbooks' `needs` name (accounting) → `/kataloog?g=raamatupidamine`.

Findings from issue #51 appear under the list as plain sentences when present, e.g. „1 kinnitus aegus kasutamata (3. nov)” from `approvals.state='expired' AND decided_at IS NOT NULL`.

### Data mapping — exists vs NEW

| Element | Source | Status |
|---|---|---|
| Job rows from playbooks | `PLAYBOOKS[].{id,title_et,approval_kind,triggers,needs}` in `src/catalog.ts`; applicability from `computeObligations(...).obligations[].rule_id` | exists |
| Job rows from the assessment | `assessments.payload_json` → `responsibilities[].{id,label,applicability,is_core,arrangement,executor}`; `isHandled()` in `src/core.ts` | exists |
| Done evidence per job (count, last date, amount) | `approvals.{kind,state,outcome_json,consumed_at,approved_by_rule,payload_json}` | exists |
| Pending dot / waiting chip | `approvals.state='pending'`, `expires_at` | exists |
| Standing-rule rung and its text | `standing_approvals.{kind,recipients_json,max_amount_cents,max_per_day,expires_at,revoked_at}`; `standingRuleName()` | exists |
| Monthly tally „7 tööd, 4 ilma sinuta” | `approvals` consumed in the month, split by `approved_by_rule IS NOT NULL` | exists |
| Ceiling „esitad ise e-MTA-s” | `approval_kind ∉ STANDING_KINDS`; the obligation's `owner_et` in `HANDOFF` | exists |
| Seasonal date for the annual report | `computeObligations` row `annual-report` (`due`, period label) | exists |
| Connected-assistant line on day 1 | `oauth_grants.{client_id→oauth_clients.metadata.client_name, scopes, last_used_at}` | exists |
| Expired-unused finding | `approvals.state='expired' AND decided_at IS NOT NULL` | exists (#51 signal 2) |
| Pre-filled limits for the standing offer | max `amount_cents` and distinct `recipient.address` over the job's approvals | exists |
| **Which job an approval belongs to** | today only `approvals.kind`; `prepare_filing` is shared by KMD and the annual report, and `send_message` would also cover any future message job | **NEW: `approvals.playbook_id TEXT`** (nullable, added with the existing `ALTER TABLE` loop in `src/db.ts`), set from a new optional `playbook_id` argument of `request_approval` validated against `PLAYBOOKS` ids. Fallback for rows without it: `kind` + `recipient.name` („EMTA (e-MTA)” vs „Äriregister (e-äriregister)”) |
| **Which assessment responsibility is the same job as a playbook** | no link today | **NEW (optional, after 4 Nov): `responsibilities[].playbook_id`** in the assessment schema. Before that, an assessment row is shown as its own job; a duplicate at worst shows two rows, never a wrong fill |

### Honesty rules, applied

- No percentage, no hours. The headline is a count of jobs whose evidence is a stored done outcome or a live rule; a rule that has never fired does not fill a segment.
- Nothing grows from clicks: reads (`get_obligations`, `get_progress`, `search_services`), logins, connecting, and even requesting an approval do not change a fill. Only a consumed approval with a positive outcome or a live rule with at least one fire does.
- Assistant words keep their labels: „Assistent teatas” on every outcome, „Assistendi hinnang” on the accountant rung and on assessment-sourced rows, „Arvutatud reeglist” on dates. The `details` „Kuidas see arvutatakse” states the rule in two sentences, including that AI-hüppelaud verified nothing.
- The next step is always a real job the assistant can take: a playbook prompt, a connector from `/kataloog`, or a standing approval posted to the existing form.
- Amber stays "needs you": only the pending dot and the expired-unused finding use it.

### States

- **Day 1 (just connected):** 3 playbook jobs, all outlined; „0 tööd 3-st”; sub-line says fills come only from done work; the month line names the connected client and time; next step = the `payment-reminder` prompt plus the accounting-connector link, because reminders are the only monthly job that can later reach the top rung.
- **Week 2:** 4 jobs (assessment added „Arvete koostamine”); reminders mid green with a pending dot (3 sent, 1 paid, 1 waiting), KMD dashed (accountant), two outlined; „2 tööd 4-st”; finding „1 kinnitus aegus kasutamata”; next step = the standing-approval sentence for reminders with limits from the 3 past approvals.
- **Month 2 (advanced):** reminders deep green under a live rule (4 sent without the owner), KMD deep green at its legal ceiling, invoices mid green, annual report outlined and seasonal; „3 tööd 4-st, 2 ilma sinuta”; next step = standing approval for invoices to the 3 known recipients; the note names the reminders rule's expiry.

Prototype and its shots (day 1, week 2, month 2 at 390 and 1280 px, plus the 390 fold): prototype kept outside the repo. Build plan: `docs/design/progress/build.md`.
