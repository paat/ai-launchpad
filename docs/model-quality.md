# Baseten model-quality harness (bounded, synthetic)

Status: controlled integration harness only. The old adapter in
[src/model.ts](../src/model.ts) remains hard-disabled for live inference
(R-002) and stays unreachable live. This harness file alone enables no
runtime/UI model calls, and no live call is part of tests or CI (tests/CI
stay mock, $0). The separate reviewed public-cards slice built on this
harness is piloted live owner-only — see [live-pilot.md](live-pilot.md). All cases are synthetic; no company or personal data.
Two genuine operator-authorized live harness calls were completed through
this harness on 2026-10-28 (see Live result below). This harness makes
**no live quality claim beyond that bounded observation**: the outputs
were generic acceptable English/Estonian under operator review, not a
benchmark, quality guarantee, proof of business competence, or native-
quality claim.

## What it is

- [src/model-quality.ts](../src/model-quality.ts) — a small Baseten
  Chat Completions client for exactly three fixed purposes:
  `setup_guidance`, `classify_friction` and `classify_unmet_need` (the
  friction loop, issue #20; see below). Provider identity
  `baseten-meta`. No caller-chosen model, endpoint, tools, background mode,
  history, URLs or files; extra caller fields are ignored.
- [scripts/model-quality.ts](../scripts/model-quality.ts) — an operator CLI
  with four fixed synthetic cases, one case per invocation.
- [tests/model-quality.test.ts](../tests/model-quality.test.ts) — $0 tests
  with an injected fake transport and a synthetic key. The real global
  `fetch` is replaced with a throwing stub for the suite, so tests can
  never fall back to the network.

Fixed request contract: `POST https://inference.baseten.co/v1/chat/completions`,
exact event-key-restricted model `meta-models/muse-spark-open-1026`
(do not substitute a general alias; there is no fallback model), exactly
two messages (fixed `developer` instructions, then the `user` input),
a per-job `max_tokens` (caps the whole completion, reasoning included):
4,096 for `setup_guidance` and `classify_friction` (the provider contract
limit, unchanged) and 512 for `classify_unmet_need`; `stream: false`. Input is at most 2,000
characters and 8,192 UTF-8 bytes. The whole fetch plus body read times
out at 45 s, redirects are refused, there are no automatic retries, and
response bodies are capped at 128 KiB while streaming (also when no
`content-length` is sent). Only `choices[0].message.content` with
`finish_reason: "stop"` and non-empty text is accepted; any
`reasoning_content` is never read into output or stored. A response that
reports a `model` other than the exact fixed model is a
`provider_contract_breach` (`model_identity_mismatch`): pricing for another
model was not confirmed, so aliases are never guessed or accepted.
Provider error bodies and the API key are never returned, stored or
logged. Missing, truncated or malformed results are honest failures —
never a mock fallback.

The key comes only from trusted options or the `BASETEN_API_KEY`
environment variable. Coding-CLI configuration or credential files are
never read.

## No token preflight; per-attempt reservation and pinned pricing

Baseten documents no input-token preflight endpoint for this route, so
none is used. Instead each attempt reserves, atomically and **before any
network call**, a conservative upper bound on what the request actually
sent can cost (decided 2026-10-29, issue #20; assumptions pinned
2026-10-28):

- Published prices ([Baseten pricing](https://www.baseten.co/pricing/)):
  input $1.25 / 1M tokens, output $4.25 / 1M tokens.
- Input bound: the UTF-8 byte length of the fixed instructions plus the
  input, plus 2,048 tokens of chat-template overhead (role markers and
  special tokens). The tokenizer is byte-level BPE, so a token covers at
  least one byte: tokens never exceed bytes.
- Output bound: the job's own `max_tokens`, which the provider enforces
  for the whole completion, reasoning included.
- Reservation = cost(input bound, output bound) × 2, with ceiling integer
  arithmetic in micro-USD. The ×2 margin absorbs tokenizer or template
  surprises. Example: `setup_guidance` with the 29-byte test input is
  (ceil(2,408 × 1.25) + 4,096 × 4.25) × 2 = 40,836 micro-USD; a
  `classify_unmet_need` on the largest valid input (2,000 three-byte
  characters) reserves 27,392 micro-USD, and even the theoretical
  8,192-byte ceiling stays at 32,872 (< $0.05).

The reservation is stored as that attempt's `allocated_micro_usd`. It is
a conservative reservation, **not billing**: reported usage (expected in
the hundreds of tokens) drives a separate estimated actual cost. Rows
written before this change keep their recorded flat $2 allocations;
nothing is ever refunded. The earlier flat $2 per attempt bounded the
entire 1,048,576-token context ($1.328128 even at full context plus 4,096
output tokens) and, with the 5-attempt cap, left only one call for any
product use.

Reported `usage.prompt_tokens` / `usage.completion_tokens` must be
non-negative integers, and `usage.total_tokens`, when present, must equal
their sum. Estimated actual cost is computed from reported usage at the
pinned rates with conservative uncached, ceiling integer arithmetic, and
is recorded **separately** from the allocation. If reported usage exceeds
the 1,048,576 total cap, the job's `max_tokens`, or the estimated cost
exceeds **that attempt's own reservation**, the attempt is recorded as
`provider_contract_breach`, its output is suppressed, and future calls on
that ledger are refused. Missing/invalid usage is a terminal `uncertain`
attempt, still fully allocated — a timeout does not prove the provider
charged nothing, and unknown usage is never treated as free.

This is not a hard guarantee against provider billing bugs or future
price changes. Live runs therefore require `--confirm-current-pricing`
(or `LAUNCHPAD_MODEL_PRICING_CONFIRMED=1` for the app): the operator
confirms the currently published pricing and available credits. Inputs:
[context size](https://www.baseten.co/blog/muse-spark-open-launch/),
[reasoning / `max_tokens` semantics](https://docs.baseten.co/inference/model-apis/reasoning),
[OpenAI-compatible endpoint changelog](https://www.baseten.co/resources/changelog/muse-spark-open-and-nemotron-35-super-vl-available-on-baseten/).

## Ledger: deliberately conservative pilot cap

A trusted runner passes a separate SQLite ledger (better-sqlite3, not the
app database). The CLI takes one explicit operator-chosen private ledger path
that is reused for all live calls; there is no configurable endpoint or
model. Rules:

- Every distinct attempt allocates its own reservation (above), reserved
  atomically (`BEGIN IMMEDIATE`) **before any network call**.
- Absolute all-time ceiling: **$100** on the same global ledger (owner
  decision 1 Nov 2026, matching the owner's Baseten credit). A ledger
  pinned at exactly the previous $10 ceiling is raised once to $100 when
  opened, recording `ceiling_raised_from=10000000` and
  `ceiling_raised_on=2026-11-01`. Any other existing ceiling still cannot
  be changed, and a ceiling cannot be lowered. A backstop of at most
  10,000 distinct attempts also applies (5 until 2026-10-29, then 1,000).
  For every job except a one-character `intake_extract` (reservation
  $0.008896; 10,000 × that is $88.96), 10,000 × a one-character reservation
  exceeds $100, so the dollar ceiling binds first. The cheapest call can
  still hit the attempt backstop first. The operator may create a ledger with a
  lower ceiling (including $0) but cannot raise it above $100 except for
  that one-time $10 → $100 raise.
- No evasion: there is no daily reset, no deletion/reset flow, and no
  provider/model rotation in the harness. Provider, model and
  prompt-version are pinned in ledger metadata; reopening a ledger whose
  identity differs is refused. Do not create a fresh ledger or reset an
  existing one to evade the cap.
- No refunds: failure, timeout and crash all keep the full allocation.
- Request IDs are unique and hash-bound to provider + model +
  prompt-version + job + input (raw inputs are never stored). Repeating
  an ID with the same payload returns the stored result/status with no
  new call; a different payload is rejected as `request_conflict`.
- One attempt in flight globally. A crash leaves a `pending` row that
  stays charged, is non-replayable as a result, and blocks new attempts
  fail-closed. There is no lease expiry. Clearing that state needs manual
  review of the ledger and the provider billing view by the operator;
  the harness will not do it automatically.
- Saved outputs come only from the runner's synthetic cases. No secrets
  are stored.

## CLI

Dry/mock by default — it does not read `BASETEN_API_KEY`, touches no
network and opens no ledger:

```sh
npx tsx scripts/model-quality.ts --list-cases
npx tsx scripts/model-quality.ts --case en-connector-help
```

One live case (operator only, after the gates below; ledger file is
created `0600` in a `0700` parent when new; existing symlinks or
group/other-readable ledgers are refused):

```sh
BASETEN_API_KEY=… npx tsx scripts/model-quality.ts --live \
  --case et-connector-help --request-id quality-et-001 \
  --ledger /private/path/model-quality-ledger.db \
  --confirm-current-pricing
```

Cases: `en-connector-help`, `et-connector-help`, `manual-work-next-step`,
`friction-classification`. Arbitrary prompts are rejected. Output prints
job, provider, explicit model identity, mock flag, status, usage,
allocation vs estimated actual cost, and the synthetic output — never the
key.

## Live result (2026-10-28, sanitized)

On 2026-10-28 the operator authorized and ran two genuine live
harness calls (fixed synthetic setup prompts, no business or personal
data) via provider `baseten-meta`, exact model
`meta-models/muse-spark-open-1026` (`mock: false`, `status: completed`,
`replayed: false`):

- `en-connector-help` (`setup_guidance`): generic English guidance to pick
  one service and confirm a read-only/view-only permission before
  connecting; no action taken, no connector/service/filing verified.
- `et-connector-help` (`setup_guidance`): generic Estonian guidance to
  check read-only permissions in the assistant's settings without granting
  write access; no action taken, no service/connection/price confirmed.

Operator review: both outputs were generic acceptable English/Estonian for
their fixed synthetic prompts. This is not a benchmark, not a quality
guarantee, not proof of business competence, and not a native-quality
claim. At that historical stage, no businesses or services were
connected, no real action was taken, and no real ChatGPT consumer
connection had yet been made. Separately, the owner-only pilot later
exercised a ChatGPT DCR OAuth flow and the reviewed public-cards path
live — see [live-pilot.md](live-pilot.md). Default local development and
tests stay mock ($0); the generic old `src/model.ts` adapter stays
hard-disabled.

Usage-based estimated cost at the pinned rates: $0.003323 (EN) +
$0.002265 (ET) = **$0.005588 total estimate** for these two historical
calls. This estimate is computed from reported usage and is **not
reconciled billing**. It is distinct from the conservative allocation:
$2 per attempt, $4 allocated total for these two attempts, never refunded
and never labelled actual spend. At that time the operator-authorized pilot
cap was $10 with at most 5 distinct attempts on the same ledger. Aggregate
owner-only pilot (see [live-pilot.md](live-pilot.md)): 4 real calls total
including these two, $8 allocated of the then $10 cap, usage estimate $0.014840
(not billing). Since 2026-10-29 new attempts reserve per request (above)
and the attempt backstop was then 1,000; those $8 allocations stay. On 1 Nov
2026 the owner raised that ledger's ceiling from $10 to $100. The attempt
backstop is now 10,000. No new live calls were made for this docs update.

## Public guidance cards (explicit opt-in product slice; piloted owner-only, not general availability)

[src/model-public-cards.ts](../src/model-public-cards.ts) wraps this same
harness for shared **public** guidance cards. It is off unless
`MODEL_MODE=public_cards`, and an enabled startup additionally requires a
nonempty Google subject allowlist, `LAUNCHPAD_MODEL_PRICING_CONFIRMED=1`,
`BASETEN_API_KEY` and `LAUNCHPAD_MODEL_LEDGER_PATH` (env or direct
`createApp` config alike); anything missing fails closed with no fallback
to test mode. `test`/`disabled` behaviour and health are unchanged; the
old [src/model.ts](../src/model.ts) adapter is untouched and still
unreachable. `/health` reports `public_cards`/`enabled` only in that
explicit mode (an enabled-capability statement, not a promise of
remaining budget) and never the key, path or ledger contents.

- Fixed server-known topics only: three setup topics
  (`setup_guidance`) and two manual-work scenarios (`classify_friction`),
  each in `en`/`et`. The browser sends only a topic ID and locale;
  unknown fields/selectors are rejected. No company, owner, session,
  activity or browser-entered prose reaches the model or ledger.
- The existing ledger above is both the saved-card store and the single
  spending authority — no second table, cap or reset. Card IDs are
  derived server-side from job/topic/locale/public-input fingerprint;
  repeats, refreshes and batch/HTTP collisions replay the saved row
  (including pending and terminal states) with no extra call, refund or
  automatic retry. The ledger is validated on the same writable handle
  opened with fileMustExist (regular 0600 file, recognized schema and
  pinned provider/model/prompt/ceiling metadata) before the reviewed
  constructor, not a separate read-only precheck: a missing, empty,
  symlinked or unrecognized file refuses use and is never created. Prior
  allocations — including the two quality calls above — are preserved, so
  only the remaining headroom under the $100 ceiling (the $10 pin raised
  on 1 Nov 2026) can ever be allocated.
- Setup generation is an explicit POST behind session + current
  allowlisted Google (never demo) + CSRF, checked before reservation;
  result views use the same policy and page GETs never fetch. Cards are
  deliberately shared public content: any allowlisted owner replays the
  same card, operator-quality and arbitrary ledger rows are never shown,
  and deleting owner data removes owner activity only — it neither
  removes cards nor refunds allocations. Output is escaped text beside
  the deterministic connection steps, labelled generic Meta/Baseten
  guidance and generated vs saved/replayed; pending, failed, uncertain,
  exhausted and breach-blocked states are shown truthfully. Cards never
  change coverage, milestones, actions or assessments.
- [src/model-public-cards-cli.ts](../src/model-public-cards-cli.ts) is the
  actual one-shot operator batch main (production command
  `node dist/model-public-cards-cli.js`); dry by default (no key, network
  or ledger); `--live` precomputes one friction card into the same
  ledger, and the playbook view displays that saved card without calling
  the model. [scripts/model-public-cards.ts](../scripts/model-public-cards.ts)
  is only the thin developer wrapper. No scheduler, queue or startup
  batch exists, and no continuous autonomous work is claimed.
- Tests ([tests/model-public-cards.test.ts](../tests/model-public-cards.test.ts))
  are fake-only with synthetic keys/owners/ledgers and a network guard.
  The committed `deploy/release-mode` source policy selects
  `public_cards`; that selection alone deploys and activates nothing.
  The reviewed public-cards path was exercised live in the owner-only
  pilot — see [live-pilot.md](live-pilot.md). Broader production activation
  remains a separately reviewed manual exact-SHA promotion after the
  private prerequisites and rollback gates, and the global private
  `MODEL_MODE` stays disabled for legacy rollback — the private env
  file is not edited to enable `public_cards`. The honest limitation
  stands: generic public guidance, not a bespoke business assessment.

## Unmet-need classification (friction loop, issue #20)

[src/unmet-needs.ts](../src/unmet-needs.ts) adds the fixed job
`classify_unmet_need` on the same harness and the same ledger handle the
app already opens for public cards (`openExistingPublicLedger`); no
second ledger, store or cap exists.

- Input: only the de-identified need text, the blocker, and up to 30
  already-published public demand labels (as many as fit the 2,000-char /
  8,192-byte input bound). Identifiers (e-mail, URLs/domains, IBANs,
  phones, amounts, company names with a legal form, card-like runs,
  personal codes, registry codes, long digit runs) are replaced with typed
  placeholders by deterministic code **before** storage; the raw text is
  never stored. No owner, company, workspace or session data is sent.
- Output: strict JSON `{category, demand_label, same_as, spec}` with a
  fixed ten-value taxonomy, ≤80/≤200-char single-line strings and
  `same_as` drawn only from the given labels. De-identification is re-run
  on the output; any change rejects it. Invalid output is an honest
  `classification_failed` state, never a fabricated classification.
- `max_tokens` 512; reservation per the formula above (about $0.013 to $0.027).
  On the production ledger (4 × $2 used) the ceiling is $100 since 1 Nov
  2026, so the remaining headroom is $92. The attempt backstop is 10,000.
  These classifications reserve about $0.013 to $0.027, so 10,000 of them
  exceed $100 and the dollar ceiling binds first.
- Limits: the tool accepts at most 20 needs per owner per day and 200 in
  total; at most 10 classifications per owner per day (the rest wait,
  visibly); one in flight globally (the ledger's pending rule) and a
  serial in-process queue that runs after the tool response and resumes
  received or interrupted needs at startup. Request IDs are derived
  server-side (`un1.` + SHA-256 of the need ID); a replay or restart
  replays the ledger row and never obtains a second inference.
- Live only when `MODEL_MODE=public_cards` is already enabled; `test`
  mode uses a deterministic mock whose rows record `classified_by=mock`
  and whose spec says it is a mock; `disabled` mode classifies nothing.
- The owner publishes or keeps private each classified need on the
  Status page (session + CSRF). The public `/demand` page shows only
  aggregated category, label, spec, count, months and whether each item
  was classified live by `meta-models/muse-spark-open-1026` or by the mock.
- Tests ([tests/unmet-needs.test.ts](../tests/unmet-needs.test.ts)) are
  fake-only with a network guard. No live classification has been run yet.

## Completion gates (harness live-tested; old adapter still disabled — public-cards path piloted owner-only)

The bounded live quality harness itself has now been live-tested as above
(operator review, confirmed current published pricing and credits, and an
explicit operator decision per run). The committed source policy selects
`public_cards`; the owner-only HTTPS pilot at `https://huppelaud.arikratt.ee`
(28 Oct 2026 UTC / 29 Oct Tallinn, commit
`2bf1d06265ae1c8173cb3491cd34f18441a36f04`) exercised the distinct reviewed
public-cards path live (see [live-pilot.md](live-pilot.md) for the pinned
runtime): setup topic `connector/et` generated plus identical saved replay;
compiled one-shot background `copying-invoices/en` generated a saved card
displayed via Playbooks GET (GET performs no inference; no scheduler or
continuous-autonomy claim). The generic old `src/model.ts` adapter stays
hard-disabled; local development and tests default to mock ($0). Aggregate
pilot: 4 real calls total, $8 allocated of the then $10 cap (ceiling raised
to $100 on 1 Nov 2026), estimate $0.014840 (not
billing). Full pilot facts: [live-pilot.md](live-pilot.md).
