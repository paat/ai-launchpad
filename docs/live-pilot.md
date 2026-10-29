# Live owner-only pilot (28 Oct 2026 UTC / 29 Oct Tallinn)

Bounded historical pilot at commit `2bf1d06265ae1c8173cb3491cd34f18441a36f04`,
public address `https://huppelaud.arikratt.ee`. One owner/workspace pilot;
not a general compatibility guarantee. No company, account, or personal data
below. No new live calls were made for this docs update.

## What was actually live

- Owner-only HTTPS pilot; Google identity-only sign-in.
- Actual ChatGPT DCR OAuth: submitted assessment v1 / progress v2 with saved
  receipts; revoke blocked access; reconnect with a fresh `get_progress`
  succeeded with unchanged synthetic workspace. Receipts mean stored reports,
  not external verification. Claude was not tested.
- Catalogue: 181 research records, not 181 verified integrations. No provider
  brokerage, public-register reads, external verifier, moderation, or 100%
  claim.

## Genuine Meta/Baseten use (pinned runtime)

- Provider `baseten-meta`, exact model `meta-models/muse-spark-open-1026`.
- Setup topic `connector/et` generated, plus an identical saved replay.
- Compiled one-shot background `copying-invoices/en` generated a saved card,
  displayed via Playbooks GET. The GET performs no inference; no scheduler
  and no continuous-autonomy claim.
- Local development and tests default to mock ($0). The generic old
  `src/model.ts` adapter stays hard-disabled; the live pilot used the
  distinct reviewed public-cards path. The existing private `MODEL_MODE`
  `disabled` fallback and per-release `public_cards` policy are unchanged.

## Cost and ledger (aggregate)

- 4 real calls total, including the earlier 2 quality calls.
- Conservative $8 allocated of the $10 cap; usage estimate $0.014840, which
  is not billing. No private business input.
- Historical stage preserved: the original 2 quality calls estimated
  $0.005588 with $4 allocated at that stage; the aggregate pilot is now
  4 calls / $8 allocated. Sole ledger and max-5-attempts rules were
  unchanged at that time; since 2026-10-29 (issue #20) new attempts reserve
  per request under the same $10 ceiling, with a 1,000-attempt backstop
  (see [model-quality.md](model-quality.md)).

## Release evidence and recovery limits

- Live-commit gates: 200 unit / 38 probes / 6 browser. These are dated
  release evidence, not fresh counts for this docs branch; current focused
  checks are reported separately.
- Rollback to disabled releases passed; backup isolated restore plus manual
  off-host copy passed; daily server backup enabled. A durable hourly
  off-host scheduler is not installed; production recovery remains limited —
  not a production-ready or fully-automated-backup claim.
