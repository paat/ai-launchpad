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
  not external verification. Claude was not tested on 28 Oct; see the
  dated Claude (Free plan) entry below.
- Catalogue: 182 research records, not 182 verified integrations. No provider
  brokerage, public-register reads, external verifier, moderation, or 100%
  claim.

## Claude (Free plan), 30 Oct 2026 ~12:50–12:57 UTC

Tested once, in a real browser, on the owner's Claude Free plan, with
synthetic data only. Not a Pro/Team/Enterprise claim.

1. Customize → Connectors → Add custom connector; name "AI-hüppelaud", URL
   `https://huppelaud.arikratt.ee/mcp` → Continue. Claude detected "Sign in
   now" and "Register automatically" (DCR) as defaults → Add.
2. Connect → Launchpad Google sign-in → Estonian consent page with "Jah: …
   valmistab töid ette" ticked → Ühenda → back on claude.ai, connected.
3. Claude called `get_obligations` for synthetic registry code 19990001 and
   got TSD 10.11 (conditional) and KMD 20.11 with Riigi Teataja sources. It
   offered the playbook and asked the `facts_needed` question.
4. Claude called `request_approval`: send_message to Demo Klient OÜ,
   `arved@demo-klient.example`, 240,00 €, period oktoober 2026.
5. The owner declined the card ("Keeldusid. Midagi ei saadetud."). Claude
   then called `get_approval`, saw `declined` and sent nothing.
6. Claude asks "Allow once / Always allow" for every custom-connector tool
   call, including read-only tools.
7. Bug found: the first Connect needed a Google sign-in and then landed on
   Täna (`/`) instead of the consent; a second Connect went straight to
   consent. Fixed after this run (the login now keeps the pending authorize
   request); the fix has not been re-tested live with Claude.

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
- Conservative $8 allocated of the then $10 cap; usage estimate $0.014840, which
  is not billing. No private business input. On 1 Nov 2026 (issue #158) the
  owner raised that ledger's ceiling from $10 to $100, matching the Baseten
  credit. The $8 of allocations stays.
- Historical stage preserved: the original 2 quality calls estimated
  $0.005588 with $4 allocated at that stage; the aggregate pilot is now
  4 calls / $8 allocated. Sole ledger and max-5-attempts rules were
  unchanged at that time; since 2026-10-29 (issue #20) new attempts reserve
  per request under the then $10 ceiling, with a 1,000-attempt backstop.
  That 1,000 figure is historical. The backstop is now 10,000
  (see [model-quality.md](model-quality.md)).

## Release evidence and recovery limits

- Live-commit gates: 200 unit / 38 probes / 6 browser. These are dated
  release evidence, not fresh counts for this docs branch; current focused
  checks are reported separately.
- Rollback to disabled releases passed; backup isolated restore plus manual
  off-host copy passed; daily server backup enabled. A durable hourly
  off-host scheduler is not installed; production recovery remains limited —
  not a production-ready or fully-automated-backup claim.
