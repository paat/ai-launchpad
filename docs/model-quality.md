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
  Chat Completions client for exactly two fixed purposes:
  `setup_guidance` and `classify_friction`. Provider identity
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
`max_tokens: 4096` (caps the whole completion, reasoning included —
provider contract limit), `stream: false`. Input is at most 2,000
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

## No token preflight; conservative allocation and pinned pricing

Baseten documents no input-token preflight endpoint for this route, so
none is used and no character-based token estimate is made. Instead each
attempt reserves a deliberately much more conservative **USD 2
allocation** that bounds the entire context (assumptions pinned
2026-10-28):

- Context bound: 1,048,576 tokens total (input + output), from the
  published 1M-token context
  ([Baseten launch post](https://www.baseten.co/blog/muse-spark-open-launch/)).
- Published prices ([Baseten pricing](https://www.baseten.co/pricing/)):
  input $1.25 / 1M tokens, output $4.25 / 1M tokens.
- Even charging the full 1,048,576-token context as input **plus** 4,096
  output tokens costs $1.310720 + $0.017408 = **$1.328128**, below the
  USD 2 reservation. Short fixed prompts are not claimed to use the full
  context; reported usage is expected in the hundreds of tokens.

Reported `usage.prompt_tokens` / `usage.completion_tokens` must be
non-negative integers, and `usage.total_tokens`, when present, must equal
their sum. Estimated actual cost is computed from reported usage at the
pinned rates with conservative uncached, ceiling integer arithmetic, and
is recorded **separately** from the allocation. The USD 2 is an allocated
maximum charged to the pilot cap, never labelled actual spend and **never
refunded**. If reported usage exceeds the 1,048,576 total cap, the 4,096
output cap, or the USD 2 allocation, the attempt is recorded as
`provider_contract_breach`, its output is suppressed, and future calls on
that ledger are refused. Missing/invalid usage is a terminal `uncertain`
attempt, still fully allocated — a timeout does not prove the provider
charged nothing, and unknown usage is never treated as free.

This is not a hard guarantee against provider billing bugs or future
price changes. Live runs therefore require `--confirm-current-pricing`:
the operator confirms the currently published pricing and available
credits. Inputs: [reasoning / `max_tokens` semantics](https://docs.baseten.co/inference/model-apis/reasoning),
[OpenAI-compatible endpoint changelog](https://www.baseten.co/resources/changelog/muse-spark-open-and-nemotron-35-super-vl-available-on-baseten/).

## Ledger: deliberately conservative pilot cap

A trusted runner passes a separate SQLite ledger (better-sqlite3, not the
app database). The CLI takes one explicit operator-chosen private ledger path
that is reused for all live calls; there is no configurable endpoint or
model. Rules:

- Every distinct attempt allocates exactly $2 = 2,000,000 micro-USD,
  reserved atomically (`BEGIN IMMEDIATE`) **before any network call**.
- Absolute all-time ceiling: $10 and at most **5 distinct attempts** on
  the same global ledger. The operator may create a ledger with a lower
  ceiling (including $0) but cannot raise it above $10 or change an
  existing ledger's ceiling in either direction.
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
and never labelled actual spend. The existing operator-authorized pilot cap
is $10 with at most 5 distinct attempts on the same ledger. Aggregate
owner-only pilot (see [live-pilot.md](live-pilot.md)): 4 real calls total
including these two, $8 allocated of the $10 cap, usage estimate $0.014840
(not billing). Sole ledger and max-5-attempts rules unchanged. No new live
calls were made for this docs update.

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
  only the remaining attempts under the same $10/5-attempt ceiling can
  ever be allocated.
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
pilot: 4 real calls total, $8 allocated of $10, estimate $0.014840 (not
billing). Full pilot facts: [live-pilot.md](live-pilot.md).
