# Judge guide: trying AI-hüppelaud / AI Launchpad

Live product: `https://huppelaud.arikratt.ee`. MCP address: `https://huppelaud.arikratt.ee/mcp`. Repo: `https://github.com/paat/ai-launchpad`. Everything you can try uses **synthetic data** (company "Mari Disain OÜ", customer "Demo Klient OÜ", `.example` addresses), labelled **NÄIDIS**. The live site is updated by a later deploy; screens described here as "as of the next deploy" may not be live yet.

## Which access applies

- **Public landing, no login:** open the site to see what the product does, with an animated sample conversation (labelled NÄIDIS).
- **Connecting an assistant and approvals:** the live pilot is owner-only (Google allowlist), so judges cannot sign in. The public sandbox (#21 part B) is not built yet. Until it exists, use the landing page, the demo video and the repo. The owner fills in on submission day which applies: ______

## What it is

AI agents take back-office work off a small-business owner so she can focus on her core work. Launchpad does not compete with her assistant; it equips it. It is one remote MCP gateway that adds Estonian obligations, playbooks, approvals and receipts to the ChatGPT she already has. Rules compute and models read: deadlines come from deterministic code with an official source, never from a model. She approves only what binds her.

## Plan caveat

- **ChatGPT**, as `/uhenda?a=chatgpt` renders it: „ChatGPT Pro paketis töötavad tähtajad ja juhised (ainult lugemine). Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.” (Source: help.openai.com 12584461, updated 28 Oct 2026.)
- **Claude:** allows custom connectors on every plan (Free: one connector). Tested once on the Free plan with synthetic data (30 Oct 2026); see `docs/live-pilot.md`. Claude asks to allow each tool call.

## Steps

1. **Open the landing page** (no login). It says what the product does and plays a sample conversation (NÄIDIS): the assistant lists the November deadlines with "Arvutatud reeglist" and a source, then a payment-reminder approval card that the owner approves with "Kinnita täpselt see". In the real product each deadline row links its official source.
2. **Connect ChatGPT** (owner-only pilot; needs the plan above). "Ühenda oma assistent" (`/uhenda`) → copy `https://huppelaud.arikratt.ee/mcp` → ChatGPT settings → add a connector → paste. Sign in and approve the consent screen with its one job permission: prepare work, always ask first.
3. **Ask** in ChatGPT (valid as written 1–4 Nov 2026; add `Kasuta AI-hüppelauda: ` at the start if it doesn't call the tool):
   - `Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?` → deadlines as offers, with sources.
   - `Vaata mu arved üle ja tee ära, mis on vaja. Enne saatmist küsi minult kinnitust.` with `docs/demo/naidis-arved.csv` attached → the assistant reports the overdue invoice (Assistant says (example, not product copy; its own words may vary): „Leidsin 1 tähtaja ületanud arve”), a reminder draft and a link to an approval card (recipient, amount, document, period). "Kinnita täpselt see" approves exactly that payload; change anything and Launchpad refuses it; a new approval is needed. Then write "Kinnitasin" in the chat. Nothing is sent by Launchpad: the outcome reads "Saadetud: demo". Invoice 2026-015 turns overdue after 10 Nov, which changes the count.
   - `Esita minu oktoobri käibedeklaratsioon.` → the `vat-return-prep` playbook prepares the figures from your accounting software's own report; you file in e-MTA with Smart-ID. The gap is reported as an unmet need, de-identified and classified by Meta's Muse Spark Open, and joins the public "Avatud soovid" list only if you publish it.
4. **Täna** (as of the next deploy): "Ootab sinult · Assistent tegi · Tulekul" shows what needs you, what your assistant did and what is coming.

## Meta's models

Muse Spark Open (`meta-models/muse-spark-open-1026`, via Baseten) classifies unmet needs in a background job after de-identification and writes the Estonian setup guidance cards. Live output is labelled "AI liigitus · Meta Muse Spark Open"; mock output is labelled as a sample. The model never computes a deadline or an amount. Model use is capped at USD 10 on existing credits.

## What is synthetic

The company, the customer, the invoices, amounts, any seeded open-demand rows and, until the owner configures an Ärikratt API key, every company. Real registry lookups are not available yet. No time saved is measured or claimed.

## What is never automated

Smart-ID / Mobile-ID / ID-card PINs, qualified signatures, real filings to government portals and real payments. The assistant prepares; the owner approves; the owner files, signs and pays.
