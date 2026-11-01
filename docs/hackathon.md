# Meta Global AI Developer Hackathon — rules and dates

Source: the [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) and the [Official Rules and event waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), read 26 Oct 2026. Track: **Indie Developer**, solo.

## Requirements

| Rule | What it means here |
|---|---|
| Meta models in the project | "Your project must incorporate Meta's models": Muse Spark, Muse Wonder, Muse Image, Muse Voice Transcribe or SAM 3.1 via the Meta Model API, or open weights Muse Glimmer / Muse Spark Open. Stage-one judging is pass/fail on this. Development tooling is free choice; Muse Code is optional. |
| Public repository | This repo. |
| New work only | Only what is built during the event counts; the demo must show only that. On the Indie track, building on an existing codebase is not granted, so product code starts after kickoff and the Ärikratt MCP is used as an external dependency. |
| Rights | Only code, data and assets we have rights to. Ärikratt data carries per-dataset licences and attribution. |
| Submission | Public repo link, a **3-minute demo video** showing only hackathon-built features, the live product, the people who worked on it. |
| Conduct | Code of conduct applies; anti-projects include medical advice, basic RAG apps and political or war-related projects. |
| Waiver | Materials shared are non-confidential; Meta and Cerebral Valley get a perpetual licence to the submission; California law. |

## Judging

Stage 1 pass/fail (fits a theme, reasonably uses Meta's models) → stage 2, scored 0–10 per criterion, weighted: **Impact 30%**, **Use of Meta AI tooling 25%**, **Technical depth & execution 20%**, **Demo 25%** (working, holds up live, good video) → stage 3: top 5 per track, finals watched live. Theme: **Build for Your World**. Weights confirmed against the current official sources rechecked 27 Oct 2026: [Hackathon Judging Criteria in the Official Rules and event waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) and [§8 judging table in the participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details); both agree with the kickoff recording's rubric slide at **20:30** (see [I-hackathon-live-event.md](research/I-hackathon-live-event.md)).

> **Correction 27 Oct 2026:** an earlier version of this note summarized the four stage-2 criteria as equally weighted. That summary is stale. The primary sources above were rechecked on 27 Oct and confirm the weighted rubric Impact 30 / Use of Meta AI tooling 25 / Technical depth 20 / Demo 25.

## Dates (Tallinn time)

| When | What |
|---|---|
| Mon 26 Oct, 18:00 | Kickoff livestream |
| Tue 27 Oct – Wed 4 Nov | Building period (the event window runs Mon 26 Oct – Wed 4 Nov; our planned product-code start is Tue 27 Oct) |
| 27 / 28 / 30 Oct, 18:00 | Workshops: Agents 101 (multimodal agent), Agents 102 (verifiable agents), Fireworks with Muse open models |
| Weekdays | Meta office hours in Discord #office-hours: 16:00–17:00 until 30 Oct, 17:00–18:00 from 2 Nov |
| Tue 3 Nov | Last full day for submission and technical help |
| **Thu 5 Nov, 04:00** | **Submission deadline** (Wed 4 Nov 21:00 ET) |
| Thu 5 – Sun 8 Nov | Judging |
| Mon 9 Nov, 19:00 | Closing ceremony: top 10, live final round, winners |
| Mon 16 Nov | Community vote winner |

## Credits (public offerings, not account status)

- Meta Model API: $150 per participant; claim by 4 Nov 21:00 ET. API use before the credit appears is billed.
- Baseten: $100 plus 2M TPM for up to 2,000 participants. Modal: $100 for Meta open weights for up to 1,000 participants. Fireworks: $25 for selected participants. Forms are in the event Discord resources.

## Current compliance status (1 Nov 2026)

The 27 Oct 2026 version of this section was a docs-only import (research and the product brief, no product code).

| Check | Status |
|---|---|
| New work only (product code during the event) | Product code is in this repository (`src/`), written during the event from 27 Oct 2026 |
| Genuine Meta model runtime use | `meta-models/muse-spark-open-1026` via Baseten in `src/model-quality.ts`, used for unmet-need classification (`src/unmet-needs.ts`) and public setup cards (`src/model-public-cards.ts`). See `docs/live-pilot.md` |
| Live product | Live at https://huppelaud.arikratt.ee |
| 3-minute demo video of event-built work | Open |
| Rights to code, data, assets | Open — re-check at submission; Ärikratt data carries per-dataset licences and attribution |

## Prizes (Indie track)

$150k · $100k · $75k · $50k · $25k, plus bonus prizes up to $50k in total.
