# 3-minute demo video kit (issue #22)

Status: draft kit, written 2026-10-29. Estonian UI strings below are the target copy from the UI design; check every one against the running product on recording day. Rows marked "(after #N)" depend on work that is not merged yet. See [Feature readiness](#5-feature-readiness).

## 1. Story in one paragraph

Mari Disain OÜ is a synthetic one-person design company in Tallinn. Its owner, Mari, already uses ChatGPT to write emails but would not let it near taxes or money. The video follows her in November 2026 (so "this month" means November): she connects her own ChatGPT to AI Launchpad, asks for her deadlines and gets rule-computed dates with official sources, approves one payment reminder on her phone, and sees what happens to a request the assistant cannot serve. The company, the customer ("Demo Klient OÜ", `arved@demo-klient.example`), the invoice and all amounts are synthetic, and every synthetic item is labelled **NÄIDIS** on screen. Recorded in November 2026, using only work built during the event.

## 2. Storyboard

Target 2:50, hard limit 3:00. Voice-over (VO) is English; Estonian UI stays visible with burned-in English subtitles.

| Time | Format | On screen | Voice-over | Estonian UI text visible | Criterion |
|---|---|---|---|---|---|
| 0:00–0:10 | Phone | Mari's ChatGPT with an email draft; title card "AI-hüppelaud / AI Launchpad" | "Mari runs a one-person design company in Tallinn. She uses ChatGPT for emails, but she would never let it near her taxes." | AI-hüppelaud | Impact |
| 0:10–0:22 | Split | The research map of 354 admin jobs fades into one phone | "Estonian micro-businesses carry 354 admin jobs alone. Their assistant doesn't know Estonian rules and has no safe way to act." | – | Impact |
| 0:22–0:45 | Phone web (390 px) | Landing: type "Mari Disain" → company card (NÄIDIS) → November deadlines, each with a rule label and an EMTA link (after #19, #21) | "No forms. She types a company name and gets this month's deadlines. Rules compute them, each linked to its official source. Models never guess a tax date." | Sinu ettevõtte tähtajad ühe otsinguga · Näita tähtaegu · Novembri tähtajad · Arvutatud reeglist · Allikas: EMTA ↗ · Tähtajad arvutab reeglistik, mitte tehisaru. · Näidis | Impact, Technical |
| 0:45–1:08 | Split (desktop + phone) | Connect page → QR → three steps → consent ("saab / ei saa kunagi") → chip turns to connected (after #21 for page copy; the connector itself is live) | "One tap hands this to the assistant she already has. It is one remote MCP gateway with standard OAuth. No new chatbot." | Ühenda oma assistent · Ootan, et ChatGPT ühenduks… · Ühendatud | Demo, Technical |
| 1:08–1:26 | ChatGPT desktop | Prompt 1 → answer with dated bullets and source links (after #19) | "She asks in Estonian. ChatGPT answers with her deadlines and their sources, because Launchpad supplied the facts." | Mis on minu ettevõtte tähtajad sel kuul? · Allikas | Impact, Demo |
| 1:26–1:54 | Split (ChatGPT + phone) | Prompt 2 → draft → "Kinnita telefonis" → approval card (recipient, €240.00, invoice 2026-014) → approve → receipt. Cut: payload changed to €250 → void card. | "Nothing is sent, paid or filed without an approval bound to the exact recipient, amount and document. Change one euro and the approval is void." | Ootab sinu kinnitust · Kinnita täpselt see · Keeldu · Kviitung · Kehtetu | Technical, Impact |
| 1:54–2:22 | ChatGPT + phone web | Prompt 3 → honest "I can prepare it, you file it" → unmet-request card with the Meta label → "Lisa avatud soovide hulka" → public open-demand list (after #20) | "When the assistant can't help, Meta's open-weight Muse Spark Open, served by Baseten, classifies why and removes personal details. Only with Mari's approval does it join an open-demand list." | Seda ma veel ei oska · Liigitas Meta Muse Spark Open · AI liigitus · Lisa avatud soovide hulka · Avatud soovid | Meta tooling |
| 2:22–2:40 | Diagram | ChatGPT ↔ MCP gateway → rules, approvals/receipts; Muse Spark Open → friction classifier and Estonian setup guidance; "provider behind one interface" | "Meta's model does the background reading: classifying friction and writing Estonian setup guidance. Deterministic code owns every deadline and every approval." | – | Meta tooling, Technical |
| 2:40–2:50 | Card | Live URL and repo link | "AI-hüppelaud. Put the assistant you already have to work for your business." | huppelaud.arikratt.ee · github.com/paat/ai-launchpad | Demo |

Total 2:50. If a segment runs long, cut from 0:10–0:22 first.

## 3. Exact ChatGPT prompts

Type these verbatim; show the English subtitle burned in.

1. `Mis on minu ettevõtte tähtajad sel kuul?`
   *What are my company's deadlines this month?*
2. `Demo Klient OÜ pole arvet nr 2026-014 maksnud — 240 eurot, maksetähtaeg oli 20. oktoober. Koosta viisakas maksemeeldetuletus ja küsi minult enne saatmist kinnitust.`
   *Demo Klient OÜ hasn't paid invoice 2026-014 — €240, due 20 October. Draft a polite payment reminder and ask me to approve before sending.*
3. `Esita minu oktoobri käibemaksudeklaratsioon.`
   *File my October VAT return.*

**Fallback prefix** if ChatGPT does not call the tool by itself: start the prompt with `Kasuta AI-hüppelauda: ` (*Use AI Launchpad: …*), e.g. `Kasuta AI-hüppelauda: Mis on minu ettevõtte tähtajad sel kuul?`. Show the prefix in the video rather than hiding it.

## 4. Shot list and recording checklist

**Shots** (record each separately): S1 phone ChatGPT intro · S2 research map · S3 landing (scripted 390 px B-roll) · S4 connect flow · S5 prompt 1 · S6 prompt 2 + approval card + receipt + tamper cut · S7 prompt 3 + unmet-request card + open-demand list · S8 diagram · S9 end card.

**Environment**
- [ ] Live pilot URL `https://huppelaud.arikratt.ee`; record the deployed SHA and compare it with merged `main` (a health 200 is not proof of deploy).
- [ ] Fresh synthetic workspace per take; ChatGPT connected through the connector (OAuth done on camera or just before).
- [ ] Synthetic data only: Mari Disain OÜ, Demo Klient OÜ, `.example` addresses, synthetic registry code from the demo fixture. Everything synthetic shows NÄIDIS.
- [ ] No real customer data, personal data, keys, tokens or browser profile visible. Check tabs, bookmarks, URL bar and notifications.

**ChatGPT**
- [ ] Grant the tool permissions once before takes so "Allow?" dialogs do not interrupt.
- [ ] 3 takes of every ChatGPT answer; keep the best and keep the take number in the file name.
- [ ] Say "ChatGPT" only. Claude is untested (`docs/live-pilot.md`); add it only after a real Claude run.
- [ ] Verify the connector menu path on the pilot account and capture its screenshots; the design only has a placeholder.

**Dates**
- [ ] Deadline rows are date-sensitive: record in November 2026 and check each date against EMTA that day. Illustrative (verify): 10 Nov is a Tuesday, 20 Nov is a Friday.
- [ ] The approval card expires after 15 minutes: start the take right after the prompt, not before.

**Picture and sound**
- [ ] 1080p, phone UI in a device frame, desktop ChatGPT for legible typing, split screen for hand-offs.
- [ ] Burned-in English subtitles for every Estonian prompt and answer.
- [ ] Phone-viewport B-roll of web screens: scripted 390 px recordings.
- [ ] Final length ≤ 3:00 (target 2:50). Show only work built during the event.

## 5. Feature readiness

Status column is "as of writing" (2026-10-29). Owner: update it before recording.

| Segment | Depends on | Status as of writing | Verify on recording day |
|---|---|---|---|
| 0:45–1:08 connect, consent | Live pilot (existing); connect page copy and QR (after #21) | Owner-only pilot live, ChatGPT tested once (`docs/live-pilot.md`); public connect page and QR not confirmed | Connector adds from the real ChatGPT UI; menu path; chip behaviour |
| 0:22–0:45 landing, deadlines | #19 obligations calendar; #21 public landing | #19 open; #21 open. Ärikratt API key not configured, so only the synthetic company works until the owner provides it | Dates computed by rules, source links open, NÄIDIS shown, no claim of a registry lookup |
| 1:08–1:26 prompt 1 | #19 | Open | ChatGPT calls the tool; cites every source; adds no extra deadline |
| 1:26–1:54 approval | #18 `request_approval` / `get_approval` / `record_action_outcome`, approval card page | Merged (PR #23) | Card on 390 px phone, approve, receipt, tampered payload rejected, sent state labelled assistant-reported/demo |
| 1:54–2:22 unmet request | #20 friction loop (Muse Spark Open job, owner approval, open demand list) | Open | Real Baseten call within budget (or mock, labelled); redaction output; owner approves before publishing; tool name as exposed (issue says `report_unmet_need`, UX review says `report_unmet_request`) |
| 2:22–2:40 diagram | README "Where Meta's models fit" | Existing | Diagram matches what shipped; remove anything not built |
| Judge access | #21 part B synthetic sandbox | Open | See [judge-guide.md](judge-guide.md) |

## 6. Where Meta's models appear

- **Muse Spark Open** (`meta-models/muse-spark-open-1026`, via Baseten's OpenAI-compatible endpoint) writes the Estonian setup guidance cards. This exists and ran in the owner-only pilot.
- **Muse Spark Open** classifies and de-identifies unmet requests and drafts a one-line public demand spec, as a bounded background job (#20, not merged as of writing). Say this only if #20 is merged and the call is real on the day.
- **Rules, not models, compute deadlines** and approvals (README principle 4). Models read and draft.
- **Bounded spend:** one ledger with a USD 10 cap on existing credits. As of `docs/live-pilot.md`: 4 real calls, USD 8 allocated of the cap, usage estimate about USD 0.015 (an estimate, not billing). Do not say "free" or "unlimited"; do not quote a total beyond these figures. Local runs and tests use mock mode ($0).
- Not claimed: Meta consumer apps, vision, voice, or any model use not listed above.

## 7. Submission checklist

- [ ] Public repo link: `https://github.com/paat/ai-launchpad`; no secrets, `.env` or private data (`HANDOFF.md` stays untracked).
- [ ] Video uploaded to a host that works without login (state which); length ≤ 3:00.
- [ ] Live product URL `https://huppelaud.arikratt.ee` plus judge access instructions: on submission day state which applies: **(a)** owner-only pilot (Google allowlist; judges cannot sign in) or **(b)** the synthetic sandbox (#21 part B) if merged and deployed. Put the true one in the form and in `judge-guide.md`.
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
| #19 not merged | Cut the deadline segments (0:22–0:45, 1:08–1:26) and spend the time on connect + approval; do not mock the answer. |
| Approval flow fails | Show the recorded 390 px scripted run of the card pages, captioned "Salvestatud testistsenaarium / recorded scripted run". |
| Meta call is budget-blocked or Baseten is down | Show the unmet-request card from mock mode, captioned "Mock mode, no model call"; say in VO that live runs are capped at USD 10. Show the real setup-guidance card from the pilot instead if it is available. |
| #20 not merged | Drop the open-demand segment; keep the diagram and the existing setup-guidance use, stated exactly as in section 6. |
| Live site down | Local demo (`docs/local-demo.md`), captioned "lokaalne demo / local demo". |
