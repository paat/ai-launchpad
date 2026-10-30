# 3-minute demo video kit (issue #22), v2

Status: v2, 2026-10-30. Rewritten for the built product: the agent finds the work, "Täna" shows who does what, and the plan caveats are stated honestly. Estonian UI strings are the built copy; check each against the running product on recording day. The live site shows them only after the next deploy (compare the deployed SHA with merged `main`). See [Feature readiness](#5-feature-readiness).

## 1. Story in one paragraph

AI agents take back-office work off a small-business owner so she can do her core work. Mari is a synthetic one-person designer in Tallinn (Mari Disain OÜ). Launchpad does not compete with her assistant; it equips it: Estonian rules, source links, approvals and receipts behind one remote MCP gateway. Rules compute and models read. She approves only what binds her. In November 2026 she connects the ChatGPT she already has, asks what admin she has and what the assistant can do itself, and watches it find an unpaid invoice in a file, draft the reminder and ask her exact approval on her phone. The company, customer ("Demo Klient OÜ", `arved@demo-klient.example`), invoices and amounts are synthetic and labelled **NÄIDIS**. No time-saved claim is made anywhere. Recorded 1–9 Nov 2026, using only work built during the event.

## 2. Storyboard

Target 2:44, hard limit 3:00. Voice-over (VO) is English; Estonian UI stays visible with burned-in English subtitles.

| Time | Format | On screen | Voice-over | Estonian UI text visible | Criterion |
|---|---|---|---|---|---|
| 0:00–0:10 | Phone | Mari at her design desk, ChatGPT on her phone; title card | "Mari is a designer. Admin eats into her evenings: VAT, reminders, deadlines. She'd rather design." | AI-hüppelaud | Impact |
| 0:10–0:25 | Phone web (390 px) | Landing: type "Mari Disain" → company card (NÄIDIS) → November rows, each with "Assistent … · Sina …", rule label and source link | "AI Launchpad reads public registers and computes her deadlines with rules. For each one it shows what her own assistant can take off her, and what stays with her." | Arvutatud reeglist · Assistent … · Sina … · Allikas · NÄIDIS | Impact, Technical |
| 0:25–0:42 | Split (desktop + phone) | `/uhenda` with the plan line → consent with the one job permission → connected chip | "She connects the ChatGPT she already has. One permission: prepare the work, and always ask first." | Kas lased tal töid ette valmistada? · Ühendatud | Demo, Technical |
| 0:42–1:02 | ChatGPT desktop | Prompt 1 → deadlines, each as an offer, with source links → period-matched TSD question → "Ei" → the TSD row drops | "Deadlines come back as offers. One answer, and a whole filing drops off her list." | Allikas · Kas valmistan … ette? | Impact, Demo |
| 1:02–1:40 | Split (ChatGPT + phone) | Prompt 2 with `naidis-arved.csv` attached (NÄIDIS) → "Leidsin 1 tasumata arve" → draft → "Kinnita telefonis" → approval card → Kinnita täpselt see → "Kinnitasin" → receipt "Saadetud: demo". 3 s tamper cut: €241.00 → void card. | "She didn't spot the unpaid invoice. Her assistant did. It drafts the reminder; she approves exactly this, on her phone. Change one euro and the approval is void." | Assistent valmistas ette · Kinnita täpselt see · Nüüd on assistendi kord · Saadetud: demo · Kehtetu | Technical, Impact |
| 1:40–1:55 | Phone web | Täna with its three blocks | "Her day page: what needs her, what her assistant did, what is coming, and who does each." | Ootab sinult · Assistent tegi · Tulekul · Täna pole sinult midagi vaja (if nothing waits) | Impact |
| 1:55–2:20 | ChatGPT + phone web | Prompt 3 → "Esitamine vajab sinu Smart-ID-d. Valmistan arved ette, esitad sina." (the `vat-return-prep` playbook prepares, she files) → unmet-need card with the Meta label → publish → Avatud soovid (`/demand`) | "Some steps stay hers: her Smart-ID. The assistant prepares the rest, and Meta's open-weight Muse Spark Open turns the gap into anonymous open demand, only with her OK." | AI liigitus · Meta Muse Spark Open · Avatud soovid | Meta tooling |
| 2:20–2:34 | Diagram | ChatGPT ↔ MCP gateway → rules, approvals/receipts; Muse Spark Open → unmet-need classifier and setup cards | "Rules own every date and approval. Meta's model does the background reading and never computes a deadline or an amount." | – | Meta tooling, Technical |
| 2:34–2:44 | Card | End card; live URL and repo link | "AI-hüppelaud. Your assistant does the back office. You approve only what binds you." | Assistent teeb kontoritöö. Sina kinnitad ainult selle, mis sind seob. · huppelaud.arikratt.ee · github.com/paat/ai-launchpad | Demo |

Total 2:44. If a segment runs long, cut the tamper cut to 2 s, then the diagram to 8 s.

## 3. Exact ChatGPT prompts

Type these verbatim; show the English subtitle burned in.

1. `Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?`
   *What admin do I have this month, and what can you do yourself?*
2. `Vaata mu arved üle ja tee ära, mis on vaja. Enne saatmist küsi minult kinnitust.` with `naidis-arved.csv` attached.
   *Look through my invoices and do what's needed. Ask me before sending.*
   The file holds one invoice that is unpaid and overdue (2026-014, Demo Klient OÜ, 240,00 €, due 20 Oct). Invoice 2026-015 (Tamme Kirjastus OÜ, due 10 Nov) is unpaid but not yet due. The 240 € is read from the file, never computed.
3. `Esita minu oktoobri käibedeklaratsioon.`
   *File my October VAT return.*

**Fallback prefix** if ChatGPT does not call the tool by itself: start the prompt with `Kasuta AI-hüppelauda: ` (*Use AI Launchpad: …*). Show the prefix in the video rather than hiding it.

## 4. Shot list and recording checklist

**Shots** (record each separately): S1 phone intro · S2 landing (scripted 390 px B-roll) · S3 `/uhenda` + consent · S4 prompt 1 · S5 prompt 2 + approval card + receipt + tamper cut · S6 Täna · S7 prompt 3 + unmet-need card + Avatud soovid · S8 diagram · S9 end card.

**Dates (hard constraints)**
- [ ] Record the prompt 1 beat between 1 and 9 Nov 2026. On 30 Oct `months:1` returned an empty window, and after the 20th "this month" holds no monthly deadlines.
- [ ] Record the invoice beat before 10 Nov: invoice 2026-015 in `naidis-arved.csv` becomes overdue after 10 Nov, and prompt 2 would then find 2 unpaid invoices, not "1 tasumata arve".
- [ ] Check each deadline date against EMTA that day.
- [ ] An approval expires after 24 hours: start the take after the prompt so the card is fresh.

**Probes before recording** (one take each on the pilot account; ux2 §6)
- [ ] **H1** Does ChatGPT continue without a new message after the approval? Approve, wait 2 minutes without typing. If it does not, keep the "Kinnitasin" beat as scripted.
- [ ] **H2** Can the pilot ChatGPT create an e-mail draft? Ask for a draft to `test@demo-klient.example`. If not, the receipt reads "Valmis saatmiseks · saada oma postist" and the owner reports "sent"; the demo keeps "Saadetud: demo".
- [ ] **H3** Does ChatGPT read a CSV attached next to the connector? If not, paste the CSV rows as text and say so on screen.
- [ ] **H4** Does ChatGPT pass `months:1` for "sel kuul"? Settle it in one prompt-1 take on recording day.

**Plan**
- [ ] ChatGPT approvals need the full-MCP plan (Business, Enterprise or Edu). VERIFIED on help.openai.com 12584461, updated 28 Oct 2026: Pro can attach custom MCP servers with read/fetch only; Plus is undocumented. The owner's pilot account has run write tools (`docs/live-pilot.md`); its plan is not recorded, so note it before recording.

**Environment**
- [ ] Live pilot URL `https://huppelaud.arikratt.ee`; record the deployed SHA and compare it with merged `main` (a health 200 is not proof of deploy). The new screens appear only after the next deploy.
- [ ] Fresh synthetic workspace per take; ChatGPT connected through the connector.
- [ ] Synthetic data only: Mari Disain OÜ, Demo Klient OÜ, `.example` addresses, `naidis-arved.csv`. Everything synthetic shows NÄIDIS. No time-saved claim on screen or in VO.
- [ ] No real customer data, personal data, keys, tokens or browser profile visible. Check tabs, bookmarks, URL bar and notifications.

**ChatGPT**
- [ ] Grant tool permissions once before takes so "Allow?" dialogs do not interrupt.
- [ ] 3 takes of every ChatGPT answer; keep the take number in the file name.
- [ ] Say "ChatGPT" only. Claude is untested with Launchpad (`docs/live-pilot.md`); add it only after a real Claude run.
- [ ] Verify the connector menu path on the pilot account and capture it.

**Picture and sound**
- [ ] 1080p, phone UI in a device frame, desktop ChatGPT for legible typing, split screen for hand-offs.
- [ ] Burned-in English subtitles for every Estonian prompt and answer.
- [ ] Phone-viewport B-roll: scripted 390 px recordings.
- [ ] Final length ≤ 3:00 (target 2:44). Show only work built during the event.

## 5. Feature readiness

Status as of 2026-10-30 (merged on `main` at 0262c01, not necessarily deployed). Owner: update before recording.

| Segment | Depends on | Status | Verify on recording day |
|---|---|---|---|
| 0:10–0:25 landing | #19 obligations, #21 part A | Merged; live site updated by the next deploy. Ärikratt API key not configured: only the synthetic company works | Rule labels, source links, NÄIDIS, "Assistent … · Sina …" rows; no claim of a registry lookup |
| 0:25–0:42 connect, consent | #21 part A (`/uhenda`, consent) | Merged; next deploy | Connector adds from the real ChatGPT UI; plan line shown |
| 0:42–1:02 prompt 1 | #19 | Merged | ChatGPT calls the tool; cites every source; adds no deadline; H4 |
| 1:02–1:40 prompt 2 | #18 approvals, `payment-reminder` playbook | Merged | H1–H3; card on a 390 px phone; tamper rejected; receipt "Saadetud: demo" |
| 1:40–1:55 Täna | #21 part A | Merged; next deploy | Three blocks render with the day's data |
| 1:55–2:20 prompt 3 | `vat-return-prep` playbook, #20 unmet need | Merged | `tools/list` shows `report_unmet_need`; real Baseten call within budget (or mock, labelled); the owner publishes before it reaches /demand |
| 2:20–2:34 diagram | README "Where Meta's models fit" | Existing | Matches what shipped; remove anything not built |
| Judge access | #21 part B public sandbox | Not built | See [judge-guide.md](judge-guide.md) |

## 6. Where Meta's models appear

- **Background classifier: Muse Spark Open** (`meta-models/muse-spark-open-1026`, via Baseten's OpenAI-compatible endpoint). The owner's assistant reports an unmet need, the text is de-identified, and the model classifies it. A live classification carries the label "AI liigitus · Meta Muse Spark Open"; the local mock shows a sample label instead. Say "live" only if the call is real on the day.
- **Setup helper:** Muse Spark Open writes the Estonian setup guidance cards that the public pages show.
- **The model never computes deadlines or amounts.** Deterministic code with an official source per rule owns dates and approvals (README principle 4); the amounts come from the owner's files or accounting software.
- **Bounded spend:** one ledger with a USD 10 cap on existing credits. As of `docs/live-pilot.md`: 4 real calls, USD 8 allocated of the cap, usage estimate about USD 0.015 (an estimate, not billing). Do not say "free" or "unlimited"; do not quote a total beyond these figures. Local runs and tests use mock mode ($0).
- Not claimed: Meta consumer apps, vision, voice, or any use not listed above.

## 7. Submission checklist

- [ ] Public repo link: `https://github.com/paat/ai-launchpad`; no secrets, `.env` or private data (`HANDOFF.md` stays untracked).
- [ ] Video uploaded to a host that works without login (state which); length ≤ 3:00.
- [ ] Live product URL `https://huppelaud.arikratt.ee` plus judge access instructions: on submission day state which applies: **(a)** owner-only pilot (Google allowlist; judges cannot sign in) or **(b)** the public sandbox (#21 part B) if built and deployed (not built as of 2026-10-30). Put the true one in the form and in `judge-guide.md`.
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
| Prompt 1 gives an empty or wrong window | Re-record between 1 and 9 Nov; do not mock the answer. |
| ChatGPT cannot read the CSV (H3) | Paste the rows as text, captioned. |
| ChatGPT cannot create a draft (H2) | Show the receipt "Valmis saatmiseks · saada oma postist"; keep "Saadetud: demo" only for the demo outcome. |
| Approval flow fails | Show the recorded 390 px scripted run of the card pages, captioned "Salvestatud testistsenaarium / recorded scripted run". |
| Meta call is budget-blocked or Baseten is down | Show the unmet-request card from mock mode, captioned "Mock mode, no model call"; say in VO that live runs are capped at USD 10. Show the real setup-guidance card from the pilot instead if it is available. |
| Unmet-need path fails on the day | Drop the open-demand segment; keep the diagram and the setup-guidance use, stated exactly as in section 6. |
| Live site down | Local demo (`docs/local-demo.md`), captioned "lokaalne demo / local demo". |
