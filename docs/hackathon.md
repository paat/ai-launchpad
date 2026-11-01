# Meta Global AI Developer Hackathon — rules and dates

Source: the [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) and the [Official Rules and event waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver), read 26 Oct 2026, plus the event Discord (#rules, #faqs, #announcements, partner channels and organizer answers in the #questions and #office-hours forums), read 1 Nov 2026 — see [Discord clarifications](#discord-clarifications-read-1-nov-2026). Track: **Indie Developer**, solo.

## Requirements

| Rule | What it means here |
|---|---|
| Meta models in the project | "Your project must incorporate Meta's models": Muse Spark, Muse Wonder, Muse Image, Muse Voice Transcribe or SAM 3.1 via the Meta Model API, or open weights Muse Glimmer / Muse Spark Open. Stage-one judging is pass/fail on this. Development tooling is free choice; Muse Code is optional. |
| Public repository | This repo. |
| New work only | Only what is built during the event counts; the demo must show only that. The repo must be created on or after 26 Oct and hold only event work; building started when the kickoff ended, **26 Oct 12:24 PM ET (18:24 Tallinn)**. Organizers allow Indie entries to *use* a pre-existing project as a separate dependency if the README names it and the repo still runs standalone (e.g. mock data); we keep product code event-only and use the Ärikratt MCP as an external dependency. #rules: if judges can't tell what's new, "the project is disqualified". |
| Rights | Only code, data and assets we have rights to. Ärikratt data carries per-dataset licences and attribution. No likeness of real people, organizers or Meta characters without Meta's approval (up_exceptions@meta.com). |
| Submission | [Submission form](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit): public **GitHub** repo link, **3-minute demo video** link, every teammate added, a team name of our own choosing (solo: own name). Editable until the deadline, frozen after it: the repo as it stands at the deadline is what is judged. A hosted live product is optional (see below). |
| Conduct | Code of conduct applies; anti-projects include medical advice, basic RAG apps and political or war-related projects. |
| Waiver | Materials shared are non-confidential; Meta and Cerebral Valley get a perpetual licence to the submission; California law. |

## Judging

Stage 1 pass/fail (fits a theme, reasonably uses Meta's models) → stage 2, scored 0–10 per criterion, weighted: **Impact 30%**, **Use of Meta AI tooling 25%**, **Technical depth & execution 20%**, **Demo 25%** (working, holds up live, good video) → stage 3: top 5 per track, finals watched live. Theme: **Build for Your World**. Weights confirmed against the current official sources rechecked 27 Oct 2026: [Hackathon Judging Criteria in the Official Rules and event waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) and [§8 judging table in the participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details); both agree with the kickoff recording's rubric slide at **20:30** (see [I-hackathon-live-event.md](research/I-hackathon-live-event.md)).

> **Correction 27 Oct 2026:** an earlier version of this note summarized the four stage-2 criteria as equally weighted. That summary is stale. The primary sources above were rechecked on 27 Oct and confirm the weighted rubric Impact 30 / Use of Meta AI tooling 25 / Technical depth 20 / Demo 25.

## Dates (Tallinn time)

| When | What |
|---|---|
| Mon 26 Oct, 18:00 | Kickoff livestream; building officially starts when it ended, 18:24 |
| Tue 27 Oct – Wed 4 Nov | Building period (the event window runs Mon 26 Oct – Wed 4 Nov; our planned product-code start is Tue 27 Oct) |
| 27 / 28 / 30 Oct, 18:00 | Workshops: Agents 101 (multimodal agent), Agents 102 (verifiable agents), Fireworks with Muse open models |
| Weekdays | Meta office hours in Discord #office-hours: 16:00–17:00 until 30 Oct, 17:00–18:00 from 2 Nov |
| Tue 3 Nov | Last full day for submission and technical help |
| **Thu 5 Nov, 04:00** | **Submission deadline** (Wed 4 Nov 21:00 ET) |
| Thu 5 – Sun 8 Nov | Judging |
| Mon 9 Nov, 19:00 | Closing ceremony: top 10, live final round, winners |
| Mon 16 Nov | Community vote winner |

## Credits (public offerings, not account status)

- Meta Model API: $150 per participant; claim by 4 Nov 21:00 ET. API use before the credit appears is billed. Needs a card that accepts a temporary hold; there is no hard spend cap, only an e-mail alert. Credits cover the standard *Contributor* model variants (inputs may be used for training: use synthetic data), not zero-retention variants.
- Baseten: $100 plus 2M TPM for up to 2,000 participants. Modal: $100 for Meta open weights for up to 1,000 participants. Fireworks: the #faqs says "Details TBC" (the earlier "$25" has no Discord source).
- **Closed as of 29 Oct (organizer, #questions):** "Modal and Fireworks credits are fully distributed, and the Baseten list closed on Oct 27." Baseten keys arrived by e-mail; the last went out 28 Oct. Whether Baseten keys keep working after 4 Nov (judging 5–9 Nov) is unanswered.

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

$150k · $100k · $75k · $50k · $25k, plus bonus prizes up to $50k in total (#faqs): Most Viral Project $20k, **Best Build on Meta Open Weight Models $10k** (fits our Muse Spark Open use), Community Vote $10k, **Best Agentic Use-Case $5k**, Best Creative Build $5k. Most Viral: post the demo on X and link that post in the submission; only likes, reposts and comments on that post count, through 8 Nov end of day. Community voting opens 9 Nov, one vote per verified account.

## Discord clarifications (read 1 Nov 2026)

Most answers below come from the organizers' "Cerebral Valley" Verified App account, which often relays "organizers have said". Treat them as strong but secondary to the Official Rules. Threads: `https://discord.com/channels/1557169028080869426/<id>`.

### Demo video

- **Length:** at most 3:00. "A few seconds over won't disqualify you, but judges stop at 3:00" — aim for about 2:50 and speed up slow steps (31 Oct, threads 1566174871879155762, 1566122824056176760).
- **Language:** "understandable in English (transcript, subtitles or voiceover are fine)". An Estonian UI is fine with English subtitles or voice-over (29 and 31 Oct, 1565176846650179667, 1566129545973596191).
- **AI-generated voice and visuals:** allowed, but not a fully AI-generated video. "AI voice narration is allowed in the demo video ... though organizers prefer a video made and presented by a person." "Treat motion graphics and AI visuals as extras: most of the video should be real screen footage of the product running, with the live Meta model calls visible" (31 Oct, 1566106058089435287, 1566118404237164664). Show the product, not slides.
- **Structure:** "Open with one line saying what existed before the event and what you built during it. Then show the working flow end to end with the live Meta model calls visible, and briefly show where and how Meta's models are used. You don't need to walk through the code." Future plans belong in the written submission, not the video (31 Oct, 1566122824056176760). For us, the opener names the Ärikratt MCP as pre-existing.
- **What counts as "visible":** an on-screen model label "is a good start", but make the live Meta calls visible in the video itself; logs naming the model IDs are good provenance — ship them with the README. "Every Meta call you show should be a real one." Cuts, subtitles and side-by-side layouts are allowed (1 Nov, 1566282932014948362).
  An earlier answer (30 Oct, #office-hours 1565837086668488915) said on-screen model names are optional "but say in the README and the video where each Meta model is used". Showing the calls is the safer reading.
- **Story format** is fine: problem opening, then the app with the Meta model behind each feature, then a short impact close (30 Oct, 1565837086668488915).
- **Simulated or replayed parts:** "Labeled mock or simulated steps around a working core are fine". Speeding up or substituting a recorded run is fine if the video makes clear what is shown (28 and 30 Oct, #office-hours 1565012397792428032, 1565730193920757970; 31 Oct, 1566122824056176760).
- **Host/format:** not specified; the form takes a link that must open without sign-in. No official example video exists.

### Repository and judge path

- **A live URL is not required.** "Judges need a project that runs from the public repo's setup instructions, plus the 3-minute demo video. A hosted version is optional" (31 Oct, 1566160136404209664 and 1565954202159550594; 28 Oct, 1564251546785550427). Our hosted product is a bonus for the demo, not the judge path.
- **Keys:** we don't provide keys; "Judges may test with their own keys". The README must explain how to add keys (e.g. `.env.example`). A keyless replay mode over recorded runs "is accepted as a judge path, as long as it includes as much provenance as possible" (31 Oct, 1566218352983281786; 1 Nov, 1566502081202753700).
- **No credentials:** there is no private submission field, so no demo logins in the README or video. "Judges shouldn't have to connect their own accounts to outside services": keep a sandbox or mock-data path (29 Oct, 1565384587885023242; 28 Oct, 1564251546785550427).
- **README:** say which Meta models are used and where each runs, plus setup instructions.
- **One repo only:** "A linked second repo won't be treated as part of the submission". Everything needed to run and verify the demo goes in the submitted repo (30 Oct, #office-hours 1565813062093643786).
- **Finals:** no live demo or live Q&A for finalists has been announced; the repo and the 3-minute video are what counts (30 Oct, 1565815757382877302).
- **Public by submit time,** and stays public through judging; GitHub only (a GitLab link is refused, a mirror is fine) (31 Oct, 1566022096226619392, 1566233456558604393).
- **Licence:** no OSI licence required; any source-available licence is fine as long as the repo is public (31 Oct and 1 Nov, 1566205615678685325, 1566255816057819238).
- **Changing the idea** from the application is allowed (31 Oct, 1566203791974342696).

### Models

- "Every model your project calls at runtime must be a Meta model." Outside services, APIs and libraries are fine within their terms; a non-Meta model is not, "even alongside the required Meta models" (30–31 Oct, 1565574358422786139, 1565961206546571334).
- **Dev tools:** "Codex, Claude Code, GitHub Copilot or any other coding tool" is allowed, and you don't have to say which (30 Oct, 1565617289230024805).
- **Muse Spark Open via Baseten counts:** "open-source Meta models count however you run them, including through a hosted provider". Baseten model ID per #faqs: `meta-models/muse-spark-open-1026`. Llama "is not part of this hackathon" (29 Oct and 1 Nov).
- **Scoring Meta tooling (25%):** "scored on how creatively and deeply you use Meta's models ... what counts is that the Meta models are a real, load-bearing part of what your project runs" (29 Oct, 1565413161719304272).
- **Open-weight bonus ($10k):** "your Baseten Muse Spark Open stage can count toward Best Build on Meta Open Weight Models ... The open-weight model does not have to be the primary one." Explain in the README and demo how and where it runs in the workflow. The bonus counts only Muse Glimmer and Muse Spark Open (30–31 Oct, #office-hours 1566027158290173962, 1565732817965678769).
- **No third-party AI anywhere at runtime,** including embeddings and TTS. A built-in OS or browser voice that is not an AI model call is fine (28 and 30 Oct, 1565094743942111272, 1565766234677444708). Muse Spark Open may orchestrate only Meta models (1565620803842736218).
- **Baseten key:** works only with `meta-models/muse-spark-open-1026`. The $100 sits on the hackathon key, not the workspace balance; "Charges won't go beyond the $100" (30–31 Oct, 1565747906378735777, 1566086796830314667).
- **Meta $150 credits** "are only valid for the 10-day development window and cannot be extended, so they won't cover the judging period". A Spend Limit is only an alert, so turn off auto top-off (29–30 Oct, 1565454339126992896, 1565367532913958992).
- **Small non-neural parts** are borderline but fine "if Meta models clearly do the core work"; document them (31 Oct, 1566129246441832498). Our deterministic rules code is not a model.
- **Open question for us (HYPOTHESIS):** nobody has ruled on a non-Meta assistant (the owner's Claude or ChatGPT) calling our MCP. It is likely outside "models your project calls", because our server calls only Muse Spark Open. To settle it cheaply, ask in #questions and say it in the README and video.

### Model access issues (participant reports unless noted)

- **Meta Model API from hosted servers:** an empty `/v1/models` and `404 model_not_found` from Render, Railway and Vercel, while the same key works from home. Organizer, 1 Nov: Meta is investigating "a likely entitlement caching issue"; region denials can also come from where the traffic exits ([geographic use policy](https://dev.meta.ai/legal/geographic-use-policy)) (1566486714804076707). Baseten is not reported as affected.
- **dev.meta.ai:** the "API keys" sidebar tab logs some users out in a loop. Workaround: use "Create API key" in the Dashboard's "Start building with Muse" card (29 Oct, #meta).
- **No Meta text-to-speech model;** organizers have not answered TTS questions. Muse Voice Transcribe is speech-to-text only.
- **Results:** no individual feedback or reasons are given at any stage, and none for projects that don't place; official updates are posted in #announcements (29 Oct and 1 Nov, 1565395418488242298, 1565004177149530242).

### Recordings and references

- Recordings: [Kickoff](https://vimeo.com/1238909940/6d91bab1b2), [Agents 101](https://vimeo.com/1239550947/045ee6e57e) (repo [meta-models/legal-agent-workshop](https://github.com/meta-models/legal-agent-workshop), [handbook](https://github.com/meta-models/legal-agent-workshop/blob/main/HANDBOOK.md)), [Agents 102](https://vimeo.com/1239918451), [Fireworks](https://vimeo.com/1240323577).
- Docs: [quickstart](https://dev.meta.ai/docs/quickstart), [models](https://dev.meta.ai/docs/models), [API cookbook](https://github.com/meta-models/meta-model-cookbook), [open-weight cookbook](https://github.com/meta-models/meta-oss-cookbook), [support](https://dev.meta.ai/support).
- **Stale FAQ line:** #faqs still says the four criteria are "scored equally". The Official Rules' weighted rubric (above) is authoritative.
