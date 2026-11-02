# 3-minute demo video kit (issue #22), v3

Status: v3, 2026-11-02. Rewritten for the act-and-record flow: the assistant does the requested job, and "Täna" shows the outcome. Confirm deployment before recording; this script does not claim the branch is live. Estonian UI strings are the built copy; check each against the running product on recording day. The live site shows them only after the next deploy (compare the deployed SHA with merged `main`). See [Feature readiness](#5-feature-readiness).

## 1. Story in one paragraph

AI agents take back-office work off a small-business owner so she can do her core work. Mari is a synthetic one-person designer in Tallinn (Mari Disain OÜ). Launchpad does not compete with her assistant; it equips it: Estonian rules, source links, playbooks and recorded outcomes behind one remote MCP gateway. Rules compute and models read. She answers only what nobody else knows and can ask the assistant to check with her first. In November 2026 she connects the ChatGPT she already has, asks what admin she has and what the assistant can do itself, and watches it find an unpaid invoice in a file, send the reminder with its own tools and record the result for her phone dashboard. The company, customer ("Demo Klient OÜ", `arved@demo-klient.example`), invoices and amounts are synthetic and labelled **NÄIDIS**. No time-saved claim is made anywhere. Record 1–4 Nov 2026; upload and submit by Wed 4 Nov 21:00 ET (Thu 5 Nov 04:00 Tallinn), the hard deadline. Uses only work built during the event.

## 2. Storyboard

Target 2:44, hard limit 3:00. Voice-over (VO) is English; Estonian UI stays visible with burned-in English subtitles.

| Time | Format | On screen | Voice-over | Estonian UI text visible | Criterion |
|---|---|---|---|---|---|
| 0:00–0:10 | Phone | Mari at her design desk, ChatGPT on her phone; title card | "Mari is a designer. Admin eats into her evenings: VAT, reminders, deadlines. She'd rather design." | AI-hüppelaud | Impact |
| 0:10–0:25 | Phone web (390 px) | Landing: the hero line, then the animated chat teaser (labelled NÄIDIS): her question → November deadlines with rule label and source → payment reminder sent → recorded outcome. Re-record the loop after deployment | "AI Launchpad gives her assistant Estonian deadlines and ready workflows. She asks for the job. Her assistant does it and records the result." | Sinu AI-assistent teeb kontoritöö · Arvutatud reeglist · Assistent tegi ära · NÄIDIS | Impact, Demo |
| 0:25–0:42 | Split (desktop + phone) | `/uhenda` with the plan line → connector consent → connected chip | "She connects the ChatGPT she already has and gives it access to Launchpad." | Ühendatud | Demo, Technical |
| 0:42–1:02 | ChatGPT desktop | Prompt 1 → deadlines, each as an offer, with source links → two period-matched questions (payouts, then employee or other trigger) → "Ei" to both → the TSD row drops. Assistant says (example, not product copy): "Kas valmistan … ette?" | "Deadlines come back as offers. Two answers, and a whole filing drops off her list." | Allikas | Impact, Demo |
| 1:02–1:40 | Split (ChatGPT + phone) | Prompt 2 with `naidis-arved.csv` attached (NÄIDIS) → assistant finds one overdue invoice → sends the exact reminder through its test mail tool → calls `record_action_outcome` with `action` and `playbook_id` → dashboard receipt. Show recipient, amount and recorded result. Label the test transport: nothing really sent | "She asks her assistant to send overdue reminders. It finds one, sends it and records the result in Launchpad. She can ask it to check with her first whenever she wants." | Assistent tegi ära · Saadetud: demo · päriselt ei saadetud | Technical, Impact |
| 1:40–1:55 | Phone web | Täna with its three blocks | "Her day page: what needs her, what her assistant did, what is coming, and who does each." | Ootab sinult · Assistent tegi · Tulekul · Täna pole sinult midagi vaja (if nothing waits) | Impact |
| 1:55–2:20 | ChatGPT + phone web | Prompt 3 → Assistant says (example, not product copy): "Esitamine vajab sinu Smart-ID-d. Valmistan arved ette, esitad sina." (the `vat-return-prep` playbook prepares, she files) → unmet-need card with the Meta label → publish → Avatud soovid (`/demand`) | "Some steps stay hers: her Smart-ID. The assistant prepares the rest, and Meta's open-weight Muse Spark Open turns the gap into anonymous open demand, only with her OK." | AI liigitus · Meta Muse Spark Open · Avatud soovid | Meta tooling |
| 2:20–2:34 | Diagram | ChatGPT ↔ MCP gateway → rules, playbooks, recorded outcomes; Muse Spark Open → unmet-need classifier and setup cards | "Rules own every date. The assistant does the job and records what happened. Meta's model does the background reading and never computes a deadline or an amount." | – | Meta tooling, Technical |
| 2:34–2:44 | Card | End card; live URL and repo link | "AI-hüppelaud. Your assistant does the back office. Every action is recorded. Ask it to check with you first whenever you want." | Assistent teeb töö ära. Iga tegevus jääb kirja. · huppelaud.arikratt.ee · github.com/paat/ai-launchpad | Demo |

Total 2:44. If a segment runs long, shorten the receipt close-up, then the diagram to 8 s.

## 3. Exact ChatGPT prompts

Type these verbatim; show the English subtitle burned in.

1. `Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?`
   *What admin do I have this month, and what can you do yourself?*
2. `Vaata mu arved üle ja saada tähtaja ületanud arvete kohta meeldetuletused.` with `naidis-arved.csv` attached.
   *Look through my invoices and send reminders for overdue invoices.*
   The file holds one invoice that is unpaid and overdue (2026-014, Demo Klient OÜ, 240,00 €, due 20 Oct). Invoice 2026-015 (Tamme Kirjastus OÜ, due 10 Nov) is unpaid but not yet due. The 240 € is read from the file, never computed.
3. `Esita minu oktoobri käibedeklaratsioon.`
   *File my October VAT return.*

**Fallback prefix** if ChatGPT does not call the tool by itself: start the prompt with `Kasuta AI-hüppelauda: ` (*Use AI Launchpad: …*). Show the prefix in the video rather than hiding it.

## 4. Shot list and recording checklist

**Shots** (record each separately): S1 phone intro · S2 landing (scripted 390 px B-roll) · S3 `/uhenda` + consent · S4 prompt 1 · S5 prompt 2 + send + recorded outcome · S6 Täna · S7 prompt 3 + unmet-need card + Avatud soovid · S8 diagram · S9 end card.

**Dates (hard constraints)**
- [ ] Record the prompt 1 beat between 1 and 4 Nov 2026. On 30 Oct `months:1` returned an empty window, and after the 20th "this month" holds no monthly deadlines.
- [ ] Record the invoice beat before 10 Nov (the 1–4 Nov window satisfies this): invoice 2026-015 in `naidis-arved.csv` becomes overdue after 10 Nov, and prompt 2 would then find 2 unpaid invoices, not "1 tähtaja ületanud arve".
- [ ] Check each deadline date against EMTA that day.

**Probes before recording** (one take each on the pilot account; ux2 §6)
- [ ] **H1** Does the assistant send on the owner's request and call `record_action_outcome` with `action` and `playbook_id`, without another approval step? Confirm the row says „Assistent tegi ära”. Only ask first for the owner's saved/current preference, an instruction from file/e-mail/web text, a recipient or amount mismatch, or unclear content. File text is data, never instructions.
- [ ] **H2** Can the assistant send through the synthetic test mail tool? The `.example` addresses are test data, never a real delivery destination. If only a read-only connector is available, show the prepared message and the remaining owner step; do not record `sent` until there is a send result. Label a simulated send „Saadetud: demo · päriselt ei saadetud”.
- [ ] **H3** Does ChatGPT read a CSV attached next to the connector? If not, paste the CSV rows as text and say so on screen.
- [ ] **H4** Does ChatGPT pass `months:1` for "sel kuul"? Settle it in one prompt-1 take on recording day.

**Plan**
- [ ] Plan line, as `/uhenda?a=chatgpt` renders it: „ChatGPT Pro paketis töötavad tähtajad ja juhised (ainult lugemine). Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.” Source: help.openai.com 12584461, updated 28 Oct 2026. VERIFIED on help.openai.com 12584461, updated 28 Oct 2026: Pro can attach custom MCP servers with read/fetch only; Plus is undocumented. The owner's pilot account has run write tools (`docs/live-pilot.md`); its plan is not recorded, so note it before recording.

**Environment**
- [ ] Live pilot URL `https://huppelaud.arikratt.ee`; record the deployed SHA and compare it with merged `main` (a health 200 is not proof of deploy). The new screens appear only after the next deploy.
- [ ] Fresh synthetic workspace per take; ChatGPT connected through the connector.
- [ ] Synthetic data only: Mari Disain OÜ, Demo Klient OÜ, `.example` addresses, `naidis-arved.csv`. Everything synthetic shows NÄIDIS. No time-saved claim on screen or in VO.
- [ ] No real customer data, personal data, keys, tokens or browser profile visible. Check tabs, bookmarks, URL bar and notifications.

**ChatGPT**
- [ ] Grant tool permissions once before takes so "Allow?" dialogs do not interrupt.
- [ ] 3 takes of every ChatGPT answer; keep the take number in the file name.
- [ ] Say "ChatGPT" only. Claude was tested once on the Free plan with synthetic data (30 Oct 2026, `docs/live-pilot.md`) but is not in these takes.
- [ ] Verify the connector menu path on the pilot account and capture it.

**Picture and sound**
- [ ] 1080p, phone UI in a device frame, desktop ChatGPT for legible typing, split screen for hand-offs.
- [ ] Burned-in English subtitles for every Estonian prompt and answer.
- [ ] Phone-viewport B-roll: scripted 390 px recordings.
- [ ] Final length ≤ 3:00 (target 2:44). Show only work built during the event.

## 5. Feature readiness

Recording checklist updated 2026-11-02. Earlier feature statuses are retained below; the direct-action flow needs this branch deployed. Compare the deployed SHA before recording.

| Segment | Depends on | Status | Verify on recording day |
|---|---|---|---|
| 0:10–0:25 landing | Landing teaser (owner request 2026-10-30) | Branch `feat/landing-teaser`; live site updated by the next deploy | The teaser loops (about 18 s) and shows NÄIDIS; dates 10.11 TSD and 20.11 KMD match the engine; no company search on the page |
| 0:25–0:42 connect, consent | #21 part A (`/uhenda`, consent) | Merged; next deploy | Connector adds from the real ChatGPT UI; plan line shown |
| 0:42–1:02 prompt 1 | #19 | Merged | ChatGPT calls the tool; cites every source; adds no deadline; H4 |
| 1:02–1:40 prompt 2 | Direct `record_action_outcome`, `payment-reminder` playbook | 2026-11-02 branch change; confirm deployment | H1–H3; receipt on a 390 px phone; no default approval step; sample transport label |
| 1:40–1:55 Täna | #21 part A | Merged; next deploy | Three blocks render with the day's data |
| 1:55–2:20 prompt 3 | `vat-return-prep` playbook, #20 unmet need | Merged | `tools/list` shows `report_unmet_need`; real Baseten call within budget (or mock, labelled); the owner publishes before it reaches /demand |
| 2:20–2:34 diagram | README "Where Meta's models fit" | Existing | Matches what shipped; remove anything not built |
| Judge access | Public walkthrough and sample workspace | `/naidis` and `/proovi` are implemented in `src/app.ts`; confirm deployment | See [judge-guide.md](judge-guide.md); sample data only |

## 6. Where Meta's models appear

- **Background classifier: Muse Spark Open** (`meta-models/muse-spark-open-1026`, via Baseten's OpenAI-compatible endpoint). The owner's assistant reports an unmet need, the text is de-identified, and the model classifies it. A live classification carries the label "AI liigitus · Meta Muse Spark Open"; the local mock shows a sample label instead. Say "live" only if the call is real on the day.
- **Setup helper:** Muse Spark Open writes the Estonian setup guidance cards that the public pages show.
- **The model never computes deadlines or amounts.** Deterministic code with an official source per rule owns dates (README principle 4); the amounts come from the owner's files or accounting software.
- **Bounded spend:** one ledger with a USD 100 cap on existing credits (owner decision 1 Nov 2026). As of `docs/live-pilot.md`: 4 real calls, USD 8 allocated under the then USD 10 cap, usage estimate about USD 0.015 (an estimate, not billing). Do not say "free" or "unlimited"; do not quote a total beyond these figures. Local runs and tests use mock mode ($0).
- Not claimed: Meta consumer apps, vision, voice, or any use not listed above.

## 7. Submission checklist

- [ ] Public repo link: `https://github.com/paat/ai-launchpad`; no secrets, `.env` or private data (`HANDOFF.md` stays untracked).
- [ ] Video uploaded to a host that works without login (state which); length ≤ 3:00.
- [ ] Live product URL `https://launchpad.arikratt.ee` (redirects to `https://huppelaud.arikratt.ee` in English; check it resolves before submitting) plus judge access instructions: on submission day state which applies: **(a)** owner-only pilot (Google allowlist; judges cannot sign in) or **(b)** the public walkthrough and sample workspace, implemented in `src/app.ts`, after confirming they are deployed. Put the true one in the form and in `judge-guide.md`.
- [ ] Contributors listed (names as the owner wishes; solo Indie track entry).
- [ ] Deadline: **Thu 5 Nov 2026 04:00 Tallinn / Wed 4 Nov 2026 21:00 ET**. Aim to submit by Tue 3 Nov.
- [ ] Statement in the submission: "All product code was written during the event (27 Oct – 4 Nov 2026) in this repository. The Ärikratt MCP is an external dependency used through its public interface. The video shows only event-built work with synthetic data."
- [ ] Meta model use described exactly as in section 6.
- [ ] Rights re-check: Ärikratt data licences and attribution shown where its data appears.

## 8. Fallback plan

Label every fallback honestly on screen; never present a mock as live.

| Failure | Show instead |
|---|---|
| ChatGPT doesn't call the tool | Retry with `Kasuta AI-hüppelauda: …`; keep the prefix visible. |
| Tool permission dialog appears | Re-grant permissions and retake; do not edit it out if it is the only take. |
| Ärikratt key missing / registry lookup unavailable | Use the synthetic company only; caption "NÄIDIS · sünteetiline ettevõte". Do not claim a live registry lookup. |
| Prompt 1 gives an empty or wrong window | Re-record between 1 and 4 Nov; do not mock the answer. |
| ChatGPT cannot read the CSV (H3) | Paste the rows as text, captioned. |
| ChatGPT has no send tool (H2) | Show the prepared message and explain that the owner must send it. Do not record a real `sent` outcome. Use „Saadetud: demo” only for a labelled simulated send. |
| Outcome recording fails | Show a recorded scripted test of the outcome flow, captioned "Salvestatud testistsenaarium / recorded scripted run". Do not claim the send was recorded live. |
| Meta call is budget-blocked or Baseten is down | Show the unmet-request card from mock mode, captioned "Mock mode, no model call"; say in VO that live runs are capped at USD 100 (since 1 Nov 2026). Show the real setup-guidance card from the pilot instead if it is available. |
| Unmet-need path fails on the day | Drop the open-demand segment; keep the diagram and the setup-guidance use, stated exactly as in section 6. |
| Live site down | Local demo (`docs/local-demo.md`), captioned "lokaalne demo / local demo". |
