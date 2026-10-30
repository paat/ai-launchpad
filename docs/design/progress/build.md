# Build plan — „Käest ära” handover bar

## Before 4 Nov 2026 (0.5–1 day): the smallest honest version

Scope: a pure function that derives the job rows and rungs, the Täna strip, and the full section on Ühendus with the next-step card. No new tables; one nullable column.

### Files

- `src/db.ts` — add `"playbook_id"` to the existing `ALTER TABLE approvals ADD COLUMN` loop (nullable TEXT). This is the only NEW stored field.
- `src/mcp.ts` — `request_approval`: optional input `playbook_id: z.enum(PLAYBOOKS ids)`; store it in the INSERT (both the pending and the auto-approved branch); echo it in `get_approval`. Add one sentence to `get_started`/playbook steps: „pass playbook_id”. No new scope, no new content field, consent text unchanged.
- `src/handover.ts` (new, ~120 lines) — `computeHandover({ assessment, obligations, approvals, rules, now })` → `{ jobs: Job[], off: number, total: number, withoutYou: number, month: { done, auto }, next: NextStep, findings: string[] }`. Job = `{ id, title_et, title_en, rung: "mine" | "other" | "prep" | "done", ceiling: "rule" | "law", evidence: { done, paid, last, pending, rule? }, source: "playbook" | "assessment" }`. Rung rules and the next-step order exactly as in `concept.md`. Job attribution: `approvals.playbook_id`, falling back to `kind` + `recipient.name`.
- `src/views.ts` — `handoverStrip(h, l)` inside `tanaBody` after `.today-sum`; `handoverSection(h, l, csrf, rules)` in `connectBody` above `standingSection`. CSS from `design/progress/src/progress.css` (prefix `ho-`), appended to the `CSS` literal; the strip reuses `.ask` for the next step and the existing standing-rule form fields (`kind`, `recipients`, `max_amount`, `days`) so the „Luba automaatselt” button posts to the current endpoint with pre-filled values.
- `src/app.ts` — compute `handover` once per request where `tanaBody` and `connectBody` are rendered (the approvals, rules and obligations are already loaded there).

### Cut for the first version

- No assessment→playbook linking (`responsibilities[].playbook_id`): an assessment row that duplicates a playbook shows as its own row. Acceptable for the demo; alpha's „Arvete koostamine” has no playbook anyway.
- Findings: only „aegus kasutamata” (one query). The rest of #51 stays after 4 Nov.
- EN copy: same strings in English, no new label kinds.

### Tests

- `tests/handover.test.ts` (new): synthetic traces for the three states in `concept.md` — day 1 (no approvals → 0/3, next = payment-reminder prompt), week 2 (3 consumed sent, 1 pending, 1 expired-decided → 2/4 with the accountant rung from the alpha fixture, next = standing offer with cap 300 € from max 240 € and the two recipient addresses), month 2 (live rule + 4 auto-approved consumed → `done` rung, 7/4 month tally, next = invoice standing offer). Negative cases: a live rule with zero fires stays `prep`; a pending approval never changes the rung; `prepare_filing` never gets a rule next step; reads in `activity` change nothing.
- `tests/approvals.test.ts`: `request_approval` with and without `playbook_id`; invalid id rejected; `get_approval` echoes it.
- `tests/ui-redesign.test.ts`: Täna HTML contains `.ho-strip` with the count text and no `%`; Ühendus contains `#kaest-ara` with one `.ask` and at most one filled primary button.
- `tests/ui-redesign.browser.mjs`: add `.ho-strip`, `.ho-job`, `.ho-finding .tap-link` to the ≥ 44 px selector list; no overflow at 320/390/1280 (already asserted page-wide).
- `e2e/standing-approvals.spec.ts`: the pre-filled offer on Ühendus creates the rule and the reminders segment turns `done` after the next auto-approved outcome.

Effort: handover.ts + tests 0.4 d, views + CSS 0.3 d, mcp/db column + tests 0.2 d.

## After 4 Nov

- `responsibilities[].playbook_id` (optional) in `assessmentSchema`, so assessment rows merge into playbook rows; the framework question 2 asks the agent to set it.
- Issue #51 findings (approvals carried through, declines, time to done) as plain sentences under the list, same `ho-finding` block.
- Month-over-month tally (the „Laualt maas” ledger) on Tehtud, grouped by month, in direction B's ruled style.
- A „Teeb raamatupidaja” → „Assistent teeb” handover prompt when the assessment's `next_checkpoint` passes.
- Owner-set job list edits (hide a job that does not apply) only if real owners ask; until then the rule-based denominator stands.
