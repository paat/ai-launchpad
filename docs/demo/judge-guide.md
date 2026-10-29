# Judge guide: trying AI-hüppelaud / AI Launchpad

Live product: `https://huppelaud.arikratt.ee`. Repo: `https://github.com/paat/ai-launchpad`. Everything you can try uses **synthetic data** (company "Mari Disain OÜ", customer "Demo Klient OÜ", `.example` addresses), labelled **NÄIDIS**.

## Which access applies

- **Today:** owner-only pilot. Real workspaces sign in with an owner-only Google allowlist, so you cannot sign in. Use the demo video and the repo.
- **Planned (after #21):** a self-serve synthetic sandbox, isolated per visitor and rate-limited, with no paid model calls and cached guidance only. The owner fills in on submission day which of the two is live: ______

## What it is

Your own AI assistant (ChatGPT) becomes the interface to an Estonian small-business back office. Launchpad is one remote MCP gateway; it adds Estonian obligations, approvals and receipts. It is not a chatbot.

## Steps

1. **Open the landing page** (after #21). Type "Mari Disain" and press "Näita tähtaegu". You see November deadlines, each marked "Arvutatud reeglist" with an official source link.
2. **Connect ChatGPT** (after #21): "Ühenda oma assistent" → copy the address → ChatGPT settings → add a connector → paste. Sign in and approve the consent screen, which lists what the assistant can and can never do. Connecting needs a ChatGPT plan that allows custom connectors (not confirmed for all plans). Only ChatGPT has been tested; Claude has not.
3. **Ask** in ChatGPT (add `Kasuta AI-hüppelauda: ` at the start if it doesn't call the tool):
   - `Mis on minu ettevõtte tähtajad sel kuul?` (*What are my deadlines this month?*) → dated list with sources (after #19).
   - `Demo Klient OÜ pole arvet nr 2026-014 maksnud — 240 eurot, maksetähtaeg oli 20. oktoober. Koosta viisakas maksemeeldetuletus ja küsi minult enne saatmist kinnitust.` → ChatGPT gives you a link to an approval card showing recipient, amount, document and period. "Kinnita täpselt see" approves exactly that payload; if anything changes the approval is void. Nothing is sent: the "sent" state is demo only.
   - `Esita minu oktoobri käibemaksudeklaratsioon.` → ChatGPT says it can prepare but you must file. The unmet request is classified and de-identified by Meta's Muse Spark Open, and joins the public "Avatud soovid" list only if you approve (after #20).

## What you will see

Deadlines computed by code with a rule id and official source (EMTA / Riigi Teataja); approval cards and receipts with honest states; AI-generated labels on model output ("Liigitas Meta Muse Spark Open"). Model use is capped at USD 10 on existing credits; the sandbox uses cached guidance only.

## What is synthetic

The company, the customer, the invoice, amounts, any seeded open-demand rows and, until the owner configures an Ärikratt API key, every company. Real registry lookups are not available yet.

## What is never automated

Smart-ID / Mobile-ID / ID-card PINs, qualified signatures, real filings to government portals and real payments. The product prepares; the owner approves; the owner files, signs and pays.
