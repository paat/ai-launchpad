# P — Customers without a CRM app: where the owner's customer list lives

Research date 1 Nov 2026. One Grok research leg (grok-4.7, live web, read-only); the load-bearing claims were re-checked by the orchestrator at the source the same day (marked **re-checked**). Tiers: **A** statute, specification, vendor API reference or primary dataset; **B** official documentation; **C** third-party report.

## Question

Launchpad has no customer support today: the connect-service playbook (`src/catalog.ts`) covers accounting, e-mail and LHV bank only. The owner's hypothesis: a full CRM app is too much for a micro business; one Markdown file on Google Drive, or SQLite, may be enough; the catalogue should support CRM.

## Answer

- **A full CRM is the minority tool, as the owner thought.** In 2025, 16.70 % of Estonian firms with 10–49 people used CRM software (EU 24.69 %; Estonia 10+ 20.63 %). Firms under 10 people are not measured. **A** [Eurostat `isoc_eb_iip`, `E_CRM1`, 2025](https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/isoc_eb_iip?format=JSON&lang=EN&geo=EE&geo=EU27_2020&time=2025&indic_is=E_CRM1&unit=PC_ENT) — **re-checked**. No official series measures "spreadsheet or inbox as CRM": `UNKNOWN`.
- **A single Markdown file does not work as the store.** Claude's Google Drive connector searches, reads, uploads, moves and shares files; it does not edit file contents. The separate Google Docs, Sheets and Slides connectors create files and edit them live, and are "available for all users on Claude and Claude Desktop" (Team/Enterprise admins enable them first). **B** [Claude: Use Google Workspace connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors) — **re-checked**. A raw `.md` is not on the Drive connector's readable-types list. **B** [Claude Docs: Google Drive](https://claude.com/docs/connectors/google/drive). ChatGPT's Drive app updates Docs/Sheets/Slides "where supported and authorized"; Drive in Library is web-only for now, mobile "will follow". **B** [OpenAI: Google Drive app](https://help.openai.com/en/articles/10929079-google-drive-app-and-setup-in-chatgpt), [Library](https://help.openai.com/en/articles/20001052-library-for-chatgpt).
- **SQLite does not reach the owner's phone, and hosting it breaks our rules.** Claude reaches custom connectors from Anthropic's cloud; a SQLite file on the owner's computer is reachable only by a local server in Claude Desktop or Claude Code, never from claude.ai or the phone. **B** [Claude: custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). If Launchpad hosted it, Launchpad would be the GDPR processor of the owner's customers' personal data (Art. 28 contract, Art. 32 security, sub-processors) — against principle 5, "store almost nothing".
- **So: a Google Sheet in the owner's own Drive** is the zero-CRM default, and an owner who already has a CRM connects that vendor's own MCP. Customers and debts already sit in the accounting software; last contact already sits in the mailbox. The sheet holds only what neither has: the next follow-up.

## Where each fact already is

| Job | Where it already is | What the owner's list adds |
|---|---|---|
| Who owes money | Accounting receivables (Werkzeug: e-arveldaja, Merit, Erply) | Nothing |
| Customer name, registry code, address | Accounting customer list; Ärikratt for companies | Nothing; never copy the accounting list |
| Last contact | Gmail / Microsoft 365 connectors | A date only for a call or visit |
| Who to follow up, quote chase, renewal | Nowhere | **The real gap**: `next_follow_up` and a short note |

## Storage choice by what the owner already has

1. **A CRM already in use** → connect it; Launchpad stores nothing.
2. **No CRM, uses Google** → one Google Sheet `Kliendid` in the owner's `AI-hüppelaud/` Drive folder (the same folder as issue #91), columns `name`, `registry_code`, `email`, `phone`, `last_contact`, `next_follow_up`, `note`. One row per customer; the assistant changes cells, never rewrites the sheet.
3. **No Google, no CRM** → follow-ups live in mail drafts and calendar holds; no Launchpad store. Local SQLite only if the owner already uses Claude Desktop and asks for it.

| Option | Phone | Assistant edits in place | Employees | Owner setup | Launchpad's GDPR role |
|---|---|---|---|---|---|
| Raw `.md` in Drive | opens in Drive | **No** (Drive connector) | share file | low | none |
| Google Doc | connector yes; live pane desktop/Chrome only | yes (Docs connector) | share | low; poor for lists | none |
| **Google Sheet** | Sheets app on phone; connector edits | yes (Sheets connector) | share | low | none |
| SQLite on owner's computer | **no** | local server only | no | high | none |
| SQLite hosted by Launchpad | yes | yes | needs accounts | none for owner | **processor** — avoid |
| Existing CRM (table below) | yes | yes, with confirmation | yes | connect + log in | vendor is processor |

## CRM connectors the owner can link today

| Product | Official MCP | Free tier | Writes | Claude directory |
|---|---|---|---|---|
| HubSpot | `https://mcp.hubspot.com`, GA 13 Apr 2026, OAuth. **A/B** [docs](https://developers.hubspot.com/docs/build-with-ai/remote-mcp-server) | New free accounts: 1,000 contacts, 2 users. **B** [HubSpot FAQ, updated 20 Jun 2026](https://knowledge.hubspot.com/getting-started/frequently-asked-questions) — **re-checked** | create/edit records; `manage_crm_objects` asks for confirmation. **A** [integrate](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) | listed |
| Pipedrive | "official, reliable and fully supported", official connector in Claude and ChatGPT. **B** [Pipedrive MCP](https://www.pipedrive.com/en/features/mcp-server) — **re-checked** | all plans, token limits; no forever-free plan | create/update deals, contacts, activities | listed |
| Trivis (Estonian) | `https://ai-api.trivis.ee/mcp`, OAuth (Claude.ai) or API key; CRM section "Kontaktid ja tehingud": `list_contacts`, `create_contact`, `update_contact`, `get_deals`, `add_deal`, `update_deal`, `get_interactions`, `add_interaction`. **B** [trivis.ee/mcp](https://trivis.ee/mcp) — **re-checked** (the research leg wrongly reported no vendor page) | paid; price not checked | yes, by key scope and role | custom connector |
| Scoro (Estonian) | out of beta Dec 2025; contacts get/create/update; quotes and invoices read. **B** [tools](https://support.scoro.com/hc/en-us/articles/47563484102413-Scoro-MCP-server-supported-tools) | paid | yes | custom connector |
| Attio | `https://mcp.attio.com/mcp`, OAuth; writes ask for confirmation. **A** [docs](https://docs.attio.com/mcp/overview) | `UNKNOWN` | yes | listed |
| Zoho CRM / Bigin | via Zoho MCP console. **B** [Zoho](https://help.zoho.com/portal/en/community/topic/zoho-crm-with-built-in-mcp-support), [Bigin](https://help.zoho.com/portal/en/kb/bigin/ai/mcp/articles/getting-started-with-zoho-mcp-for-bigin) | `UNKNOWN` | Data Operations server | custom connector |
| Airtable | `https://mcp.airtable.com/mcp`, "all users on all plans". **B** [Airtable](https://airtable.com/developers/agents/mcp/getting-started) | yes | records | listed |
| Notion | `https://mcp.notion.com/mcp`, read/write pages. **B** [Notion](https://www.notion.com/help/notion-mcp) | `UNKNOWN` for MCP | yes | listed |
| Salesforce, Dynamics 365 | official, admin setup, enterprise plans. **A/B** [Salesforce](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/claude.html), [Dynamics, 29 Oct 2026](https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2026/10/29/dynamics-365-cx-mcp-server-sales/) | no | yes | not for micro firms |

Statistics Estonia's 2025 ICT questionnaire names Pipedrive and Scoro as its cloud-CRM examples. **B** [questionnaire PDF](https://stat.ee/sites/default/files/kysimustikud/2026/20505135726_Questionnaire_as_a_PDF_file_en.pdf). Not CRM: Smaily (newsletter). folk's Claude directory entry is labelled Community — point to the vendor's own page.

## Plain-text formats

No CRM schema exists that assistants follow on their own. vCard 4.0 (**A** [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350)) has no follow-up or debt fields. Google's Open Knowledge Format is a Markdown knowledge bundle for facts (issue #91), not a customer register. A fixed sheet header in the playbook is the convention.

## GDPR minimums the playbook must state

- The owner is the controller; Launchpad must not log customer-record bodies, or it processes them too.
- Basis: contract (Art. 6(1)(b)) for customers; legal duty (6(1)(c)) for invoice data; legitimate interest (6(1)(f)) for prospect notes. **B** [AKI õigustatud huvi](https://www.aki.ee/oigustatud-huvi).
- Promotional e-mail or SMS to a natural person needs prior consent, except the existing-customer exception for own similar products, with an opt-out in every message; legal-person addresses need an opt-out each time. **B** [AKI](https://www.aki.ee/isikuandmed/kkk/interneti-ja-veebitegevused). The playbook never sends promotion without that basis and an exact-action approval.
- Retention: accounting documents seven years (Accounting Act § 12, tier A, see issue #93); follow-up notes deleted three years after last contact by default (AKI accepted three years in one case, matching the Law of Obligations Act § 146 limitation period). **B** [AKI yearbook](https://aastaraamat.aki.ee/aastaraamat-2019-aastast-peadirektori-pilgu-labi/isikuandmete-sailitamisest-ettevotte-oiguste).
- A standing customer list is not "occasional" processing, so the Art. 30(5) exemption does not apply: a one-page record of processing is needed (the playbook can offer to draft it).
- Consumer Claude and ChatGPT may train on chat content when the owner's setting allows; tell the owner where the setting is before the first real customer list. **B** [Claude](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors), [OpenAI](https://help.openai.com/en/articles/11487775-apps-in-chatgpt).

## Recommendation

No new database and no Launchpad-hosted CRM. Two changes:

1. **Customers branch in the connect-service playbook + catalogue rows** (#95): if the owner names a CRM, connect that one; otherwise offer the `Kliendid` sheet in their Drive folder. Add catalogue rows for HubSpot, Attio, Airtable, Notion, Scoro and Zoho; update Trivis to its CRM tools; keep Pipedrive.
2. **"Who needs a call" playbook** (#96): reads receivables, recent mail and the sheet or CRM `next_follow_up`, drafts the messages, sends only with a `send_message` approval, and writes a follow-up date only after the owner agrees.

## UNKNOWNs and defaults

| Unknown | Default |
|---|---|
| Customer-tool share for firms with 0–9 people | Assume no CRM; accounting + mail + one sheet |
| Assistant edits a raw `.md` in Drive in place | No; use a Sheet (or a Doc for prose) |
| Sheets connector works on the Claude phone app | Test on the owner's phone before promising it; else the owner edits in the Google Sheets app |
| ChatGPT phone edits a Sheet | Web first; do not promise phone |
| Attio, Zoho, Notion free tiers | Recommend only when the owner already uses them |
| Trivis and Scoro price | Recommend only to existing customers |
