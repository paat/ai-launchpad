# Research: micro-entrepreneur use cases, landscape and Meta's Muse app

Research date 25 Oct 2026. Five Codex legs (`codex --search exec`, gpt-6-astra, live web search, read-only) produced the reports in this folder; the claims that drive design decisions were spot-checked against primary sources (table below). Rows marked UNVERIFIED in the leg reports were not confirmed by the legs themselves. Authenticated portal and API flows were not tested.

| Report | Scope | Use cases |
|---|---|---|
| [A-tax-government-filings.md](A-tax-government-filings.md) | EMTA, VAT, FIE/ettevõtluskonto/e-resident, customs/excise, Business Register, statistics, employer filings, licences, environment, municipal, AML — plus a month-by-month calendar for a one-person OÜ | 90 |
| [B-money-bookkeeping-banking-payroll.md](B-money-bookkeeping-banking-payroll.md) | Bookkeeping, invoicing, e-invoices, banking, payments, payroll, owner money, tax preparation, financing, insurance — plus the Estonian accounting/bank/payment API and MCP landscape | 72 |
| [C-customers-sales-communication.md](C-customers-sales-communication.md) | Email/calendar/CRM, quotes/contracts/signing, e-shop and marketplaces, parcel delivery, consumer rights, marketing, public procurement, grants as growth funding | 86 |
| [D-people-legal-risk-sectors.md](D-people-legal-risk-sectors.md) | Hiring and employment, workplace safety, GDPR, contracts/IP, counterparties and collections, insurance/IT/vehicles/premises, continuity and closure, ~20 sector-specific duty sets | 106 |
| [E-market-mcp-ecosystem-risks.md](E-market-mcp-ecosystem-risks.md) | Admin-burden evidence, competitors, MCP marketplaces/gateways, friction-loop precedents, legal/security risks, 10-day MVP | — |
| [G-muse-app-for-estonian-smes.md](G-muse-app-for-estonian-smes.md) | Can Meta's Muse app be an Estonian SME's assistant (26 Oct 2026): availability, connectors, language, GDPR; Claude/ChatGPT/Gemini comparison | — |
| [H-mcp-discovery-and-publication.md](H-mcp-discovery-and-publication.md) | MCP connection storage and publication (27 Oct 2026): AI Catalog and Server Card drafts, registry distribution, assistant directories, OAuth and agent discovery | — |
| [I-hackathon-live-event.md](I-hackathon-live-event.md) | Kickoff recording (reviewed 27 Oct 2026): event requirements from slides, judging-weight discrepancy, bonus prizes, product implications | — |
| **Total** | | **354** |

## Bottom line

1. **"Estonian accounting through your AI assistant" is already taken.** Werkzeug (hosted MCP for e-arveldaja, Merit Aktiva, Erply Books) and Trivis (Estonian AI bookkeeping with its own MCP and approve-before-posting) are live; community MCPs exist for e-arveldaja, Merit and SmartAccounts; LHV, Directo, X7 and Creditinfo ship their own. AI Launchpad should **curate** these, not rebuild them.
2. **The research found no product offering the layer above them:** onboarding that turns a company into its obligations and jobs, a per-authority permission inventory, approval bound to the exact action, filing receipts, and a friction loop that turns blocked tasks into public demand. That is the defensible part.
3. **Every use case falls into one of four handling modes:**
   - **Reuse** — an official or vetted MCP already exists (Google Workspace, Microsoft 365, HubSpot, Zoho, Calendly, Wix, Shopify, MailerLite, Stripe, PayPal, LHV read-only, Creditinfo, accounting MCPs, Ärikratt).
   - **Adapter** — a documented API exists but no MCP (EMTA X-tee for TSD/KMD/TÖR, RIK Andmesild, Merit Palk, Tervisekassa sick-leave, Omniva/DPD/SmartPosti/Venipak, Dokobit, Smart-ID/Mobile-ID relying party, Finbite/Telema e-invoices, Voog, Zone, Smaily).
   - **Browser agent with hard stop** — portal only (VAT/EORI registration, FIE return, Business Register changes and UBO, TEIS, e-toimik, riigihanked bids, e-toetus, e-PRIA, MTR, KOTKAS, municipal permits).
   - **Human only** — PIN entry and qualified signatures, notarial acts, hiring decisions, legal judgement, medical/safety decisions.
4. **Filing rights are separate per authority.** One login (ID-card, Smart-ID) works across portals, but EMTA grants filing rights per representative and per service (machine rights for KMD, TSD and TÖR exist via X-tee), and RIK and each agency have their own authorisation, so AI Launchpad needs a permission inventory with expiry and revocation.

## Verified key facts

| Claim | Status | Source |
|---|---|---|
| TSD annexes 1–2 moved to the data-based solution on 1 Oct 2026; XML upload ended, XBRL GL replaces it; CSV accepted until end of 2027 | Verified | [EMTA](https://www.emta.ee/ariklient/amet-uudised-ja-kontakt/arendustegevus/andmepohine-aruandlus) |
| New KMD from 1 Apr 2027; KMD and VD can be filed together from the April 2027 period | Verified | same |
| Werkzeug: hosted MCP for e-arveldaja (core), Merit Aktiva and Erply Books (Pro+), EU-hosted, open source; approval-before-write not stated | Verified | [werkzeug.ee](https://werkzeug.ee/) |
| Trivis: Estonian AI accounting (VAT returns, payroll, e-invoicing), approval before any book change, ships an MCP server, live sign-up | Verified | [trivis.ee](https://trivis.ee/en) |
| LHV.ai: MCP at `mcp.lhv.ai/mcp`, read-only ("cannot take any action"), free public beta; business-account support not stated | Verified | [lhv.ai](https://lhv.ai/et-EE/) |
| Creditinfo Estonia MCP is live (free tier with limits); in-portal assistant is "coming soon" | Verified | [creditinfo.ee](https://creditinfo.ee/en/ai-eng/) |
| Smithery shuts down its proxy, managed identity, API and CLI on 31 Oct 2026; the directory continues under Arcade | Verified | [smithery.ai/future](https://smithery.ai/future) |

## Coverage map

How AI Launchpad handles each area. IDs refer to rows in the leg reports.

### Money (B)

| Area | IDs | What exists | Harness approach |
|---|---|---|---|
| Bookkeeping, documents, expenses | B01–B15 | e-arveldaja API + community MCPs, Werkzeug, Trivis, Merit, SmartAccounts, Directo, X7 | Reuse; approval on posting |
| Sales invoices, e-invoices, receivables | B16–B26 | Ledger APIs; Finbite (Peppol) and Telema APIs, no MCP | Reuse ledger MCPs; e-invoice operator adapter |
| Banking and payments | B27–B37 | LHV MCP (read-only), LHV Connect, SEB/Swedbank gateways, Stripe and PayPal MCPs | Read via MCP; payments only by bank handoff or licensed partner (PSD2) |
| Payroll and owner money | B38–B51 | Merit Palk API | Adapter, new TSD format |
| Tax preparation and business-form differences | B52–B63 | EMTA X-tee (KMD/TSD), ledger exports | Adapter for prepare + approve; portal for registrations |
| Planning, financing, insurance | B64–B72 | Mostly none | Read and draft only |

### Government (A)

| Area | IDs | Harness approach |
|---|---|---|
| Tax administration, payroll, company income tax | A01–A13 | X-tee adapter for TSD; EMTA permission inventory |
| VAT and cross-border | A14–A24 | X-tee for KMD; registration via browser with hard stop |
| FIE, ettevõtluskonto, e-residents | A25–A32 | Separate workflow packages; FIE return via browser |
| Customs, excise, specialist reporting | A33–A41 | Out of first scope; flag in onboarding |
| Business Register and statistics | A42–A53 | Andmesild for annual-report data; register changes via browser; statistics "assigned survey" inbox |
| Employer filings and social insurance | A54–A67 | TÖR and Tervisekassa adapters; TEIS via browser |
| Licences, privacy, accessibility, e-invoicing | A68–A73 | Onboarding checklist; MTR via browser |
| Packaging and environment | A74–A79 | Onboarding checklist; KOTKAS/PROTO via browser |
| Municipal, property, vehicle, food | A80–A86 | Onboarding checklist; EMTA claims reads |
| AML, sanctions, regulated finance | A87–A90 | Onboarding checklist for obliged sectors |

### Customers and growth (C)

| Area | IDs | Harness approach |
|---|---|---|
| Email, calendar, CRM | C01–C12 | Reuse the assistant's own connectors (Google Workspace, Microsoft 365, HubSpot, Zoho, Calendly) — no adapters |
| Quotes, contracts, signing, orders | C13–C25 | Dokobit/Smart-ID adapter for sending; the signature itself stays human; representation check from Ärikratt |
| Website, e-shop, marketplaces | C26–C37 | Reuse Shopify/Woo/Wix/Amazon MCPs; Voog/Zone adapters; Kaup24/Osta.ee are gaps |
| Parcel delivery and returns | C38–C44 | Carrier adapters (Omniva, DPD, SmartPosti, Venipak) — demand candidates |
| Support, complaints, consumer rights | C45–C55 | Consumer-rights deadline tracking (15-day reply, 14-day withdrawal, withdrawal button since 1 Sep 2026) |
| Marketing and reputation | C56–C67 | Reuse MailerLite, Google Ads (read-only), GBP MCPs |
| Public procurement | C68–C75 | Ärikratt discovery; bids via browser with hard stop |
| Funding and partnerships | C76–C86 | Ärikratt `open_calls`; applications via browser |

### People, legal, risk and sectors (D)

| Area | IDs | Harness approach |
|---|---|---|
| Hiring and employment | D01–D23 | Drafting and TÖR adapter; candidate selection stays human |
| Workplace health and safety | D24–D29 | First-employee checklist; TEIS via browser |
| GDPR | D30–D37 | Drafting; breach deadline tracking (72 h) |
| Contracts, IP, legal monitoring | D38–D43 | Ärikratt legal acts; Dokobit |
| Counterparties, collections, disputes | D44–D52 | Ärikratt + Creditinfo MCP; e-toimik payment order via browser |
| Insurance, IT, vehicles, premises, purchasing | D53–D67 | Mostly drafting; Bitwarden, Cloudflare, Erply where used |
| Continuity, succession, sale, closure | D68–D72 | Drafting and checklists |
| Sector duties (food, accommodation, construction, electrical, beauty, e-commerce, transport, taxi, agriculture, forestry, healthcare, alcohol, tobacco, waste, AML-obliged, training, music licensing, procurement, cybersecurity) | D73–D106 | Onboarding derives them from the company's activities |

## What this means for the build

- **Onboarding is the product.** Registry code → activities, employees, VAT status, sector → obligations calendar (leg A has a ready one-person-OÜ calendar), applicable sector duties (D73–D106), and a job list showing which connector, adapter, browser step or human handles each.
- **Don't build:** email, calendar, CRM, accounting MCPs. Curate and rank them.
- **Build:** the onboarding and obligations engine, the catalogue, the per-authority permission inventory, approval bound to the exact payload, receipt tracking (submitted / accepted / rejected / paid), portal prefill with a hard stop, and the friction loop.
- **Friction loop (from leg E):** classify each failure (missing capability, expired auth, insufficient rights, invalid data, outage, approval refused, manual-only step); deduplicate by intended outcome; publish only redacted, owner-approved requests with synthetic reproduction data; rerun the original workflow when an adapter ships. An expired token is not demand.
- **Avoid:** Smithery's runtime (shutting down 31 Oct 2026); payment initiation without a licensed partner (PSD2); collecting Smart-ID/Mobile-ID PINs; claiming "works with Meta AI" until custom MCP connectivity is shown.

## 10-day demo slice

1. Registry code → obligations calendar and job list (Ärikratt data + calendar rules).
2. "Check this company before I accept the job" — Ärikratt + Creditinfo MCP.
3. "Put this supplier invoice into my books" — through a curated accounting MCP (e-arveldaja), approve, read back.
4. "Match this bank statement" — LHV MCP read or statement import.
5. "Prepare this month's VAT/payroll filing" — prepared package, portal prefill, hard stop before submission.
6. "Find grants and tenders I qualify for" — Ärikratt `open_calls` and procurement.
7. "This isn't supported" — classified, redacted demand published to the marketplace.

Leave out: autonomous filing, production payments, unattended signing, payroll submission, hiring decisions, natural-person credit scoring, unrestricted inbox access.

## Open questions

- Which authorities allow a multi-tenant gateway to act on customer mandates (EMTA X-tee machine rights, RIK Andmesild provider agreement, Tervisekassa)?
- How do Werkzeug and Trivis behave under approval, revocation, duplicate-action and tenant-isolation tests — partner, list, or compete?
- Which segment first: local one-person OÜs, e-residents, or small employers? Willingness to pay is unmeasured.
- Does LHV's MCP cover business accounts?
