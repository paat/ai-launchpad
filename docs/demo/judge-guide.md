# Judge guide: trying AI-hüppelaud / AI Launchpad

Live product: `https://huppelaud.arikratt.ee`. MCP address: `https://huppelaud.arikratt.ee/mcp`. Repo: `https://github.com/paat/ai-launchpad`. Everything you can try uses **synthetic data** (company "Mari Disain OÜ", customer "Demo Klient OÜ", `.example` addresses), labelled **NÄIDIS**.

## The judge path

Connecting an assistant needs the owner-only pilot sign-in (Google allowlist). Judges cannot finish that live. See it in the demo video and the repo. The loop below needs no account.

1. **Landing, no login.** Open `https://huppelaud.arikratt.ee`. The page says what the product does and plays a sample conversation labelled NÄIDIS.
2. **`/naidis`, three steps.** „Vaata näidist” opens a read-only walkthrough of the made-up company Mari Disain OÜ: **1. Täna** (`/naidis`), **2. Kinnitus** (`/naidis/kinnitus`), **3. Tehtud** (`/naidis/tehtud`). Nothing on these pages can be approved or sent. Each step offers **„Proovi ise”**, which goes to `/proovi`.
3. **„Proovi ise” (`/proovi`).** **Alusta** / **Start** creates your own temporary workspace with a made-up company. Approve and decline both work. Nothing is really sent. After you approve the reminder, the receipt reads „Saadetud: demo” and „päriselt ei saadetud”. The workspace is deleted after 24 hours. The session lasts 2 hours.

## What it is

AI agents take back-office work off a small-business owner so she can focus on her core work. Launchpad does not compete with her assistant; it equips it. It is one remote MCP gateway that adds Estonian obligations, playbooks, approvals and receipts to the ChatGPT she already has. Rules compute and models read: deadlines come from deterministic code with an official source, never from a model. She approves only what binds her.

## Plan caveat

- **ChatGPT**, as `/uhenda?a=chatgpt` renders it: „ChatGPT Pro paketis töötavad tähtajad ja juhised (ainult lugemine). Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.” (Source: help.openai.com 12584461, updated 28 Oct 2026.)
- **Claude:** allows custom connectors on every plan (Free: one connector). Tested once on the Free plan with synthetic data (30 Oct 2026); see `docs/live-pilot.md`. Claude asks to allow each tool call.

## Steps

These steps are for an owner who can sign in. Judges use the path above.

1. **Open the landing page** (no login). It says what the product does and plays a sample conversation (NÄIDIS): the assistant lists the November deadlines with "Arvutatud reeglist" and a source, then a payment-reminder approval card that the owner approves with "Kinnita täpselt see". In the real product each deadline row links its official source.
2. **Connect ChatGPT** (owner-only pilot; needs the plan above). "Ühenda oma assistent" (`/uhenda`) → copy `https://huppelaud.arikratt.ee/mcp` → ChatGPT settings → add a connector → paste. Sign in and approve the consent screen with its one job permission: prepare work, always ask first.
3. **Ask** in ChatGPT (valid as written 1–4 Nov 2026; add `Kasuta AI-hüppelauda: ` at the start if it doesn't call the tool):
   - `Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?` → deadlines as offers, with sources.
   - `Vaata mu arved üle ja tee ära, mis on vaja. Enne saatmist küsi minult kinnitust.` with `docs/demo/naidis-arved.csv` attached → the assistant reports the overdue invoice (Assistant says (example, not product copy; its own words may vary): „Leidsin 1 tähtaja ületanud arve”), and the exact reminder draft (recipient, address, amount, text), and asks once whether to send it. Answer `jah, saada` in the chat: that is the only approval. The assistant records your words with `request_approval`, Launchpad binds them to exactly that payload, and the approval card shows „Kinnitasid assistendis”; change anything and Launchpad refuses it: a new approval is needed. Launchpad never sends. On a real workspace the assistant records the outcome with `record_action_outcome` (labelled assistant-reported). The receipt „Saadetud: demo” and „päriselt ei saadetud” is the sample workspace in the judge path. Invoice 2026-015 turns overdue after 10 Nov, which changes the count.
   - `Esita minu oktoobri käibedeklaratsioon.` → the `vat-return-prep` playbook prepares the figures from your accounting software's own report; you file in e-MTA with Smart-ID. A gap the assistant cannot do is reported with `report_unmet_need`, de-identified, and classified in the background. It joins the public „Avatud soovid” list (`/demand`) only if the owner publishes it. See Meta's models for where that output is labelled, and that the public list shows none until then.
4. **Täna:** „Ootab sinult · Assistent tegi · Tulekul” shows what needs you, what your assistant did and what is coming. Signed-in owners see it at `/`. The same three sections are on `/naidis` and in the sample workspace.

## Meta's models

Muse Spark Open (`meta-models/muse-spark-open-1026`, via Baseten, `src/model-quality.ts`) runs off the pages a judge opens:

- **Unmet needs.** A background job (`src/unmet-needs.ts`) classifies a de-identified need after `report_unmet_need`. Live output is labelled „AI liigitus · Meta Muse Spark Open”. Mock output is labelled „Näidis”.
- **Setup guidance cards.** An operator generates them (`src/model-public-cards-cli.ts`, job `setup_guidance`). A page shows one only when a completed card is already saved. `/vali` labels that saved answer „Selgitab Muse Spark (Meta) · salvestatud vastus”. `/setup` labels it „General guidance · Meta/Baseten”. Opening the page does not call the model.

The live public pages do not show that output. `/demand` renders „Avaldatud soove veel pole.” when nothing is published, which is the live list. `/vali` shows the Muse sentence only for a saved completed card, and the live page has none.

The model never computes a deadline or an amount. Model use is capped at USD 10 on existing credits.

## What is synthetic

The company, the customer, the invoices and the amounts are synthetic. Register lookup runs only when the server has `ARIKRATT_API_KEY`; without it `src/arikratt.ts` returns `not_configured` and does not call the network, and the facts come from the owner's assistant or the labelled sample companies. No time saved is measured or claimed.

## What is never automated

Smart-ID / Mobile-ID / ID-card PINs, qualified signatures, real filings to government portals and real payments. The assistant prepares; the owner approves; the owner files, signs and pays.
