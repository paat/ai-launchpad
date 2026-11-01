# O — More value for the owner: business memory in their own Drive, and the next jobs

Research date 1 Nov 2026. One Grok 4.7 research leg (live web, read-only); a Muse leg hit its plan limit. The orchestrator re-opened every load-bearing source marked **verified** below. Tiers: **A** statute, official specification or vendor API reference; **B** official documentation page; **C** third-party report.

Question from the owner: what more value can the AI Launchpad plugin and MCP give small businesses — for example Google's Open Knowledge Format (OKF) for saving facts, with everything stored on Google Drive?

## Answer

1. **OKF is real, and it fits.** Google Cloud published it on 12 June 2026. It is a folder of Markdown files, each with a short YAML header. It is minimal and Apache-2.0, at version 0.2. It is an early vendor spec, not a standard. No assistant parses it specially, but every assistant can read Markdown. Use its layout as a **file convention** for the owner's business folder ("OKF-shaped"; see §1 for when it is strictly OKF). Do not build anything on top of it.
2. **"Store it all on the owner's Drive" is right for facts, wrong for approvals.** Facts that only the owner knows, decisions, a contracts index and job notes can live in a folder the owner owns. The owner's assistant reads and writes it with its built-in Drive connector, and Launchpad stores even less. **Approvals and outcome receipts must stay on the Launchpad server.** A Drive file can be edited or deleted by anyone with access, so it cannot enforce "nothing is sent without approval" (AGENTS.md principle 3). It is not a tamper-evident record either.
3. **The highest-value next step is "ask once, remember" for the owner's stable facts.** These are facts nobody else knows and that rarely change: which accounting software and bank, who the accountant is, payment terms agreed with a customer, where the contracts are. When the owner says one, their assistant saves it in the owner's folder, and every later chat (or another assistant) reads it first. The server instructions already allow this. They say to check "the owner's own connected files, such as Google Drive" before asking for any fact. But nothing writes those files yet, so this closes the loop at almost zero server cost.

   **The `facts_needed` questions stay as they are.** These are `vat_registered`, `payouts_last_month`, `other_tsd_triggers_last_month`, `fy_end`, `annual_report`, `ytd_turnover_this_year`, the company confirmation and `registry_code` (`src/obligations.ts`, `src/mcp.ts`). Launchpad already keeps the workspace's registry code server-side, so the folder never needs to supply it. The server instructions say "never let a file stand in for the owner's answer to them", and that rule stays: these answers drive deterministic deadlines (principle 4). Some are only true for one month: a saved October "no payouts" reused in November would drop a TSD deadline. OKF's `verified` label cannot unlock them either: the spec says trust tiers are "advisory signals, not access control", and anyone who can edit the Doc can set the label. At most the assistant may show a saved stable answer as a quick confirm ("Last time you said your financial year ends 31 December. Still right?"). The owner's reply is the answer, never the file. Answers that are true for one month only are never saved.

## 1. Google Open Knowledge Format (OKF)

| Claim | Tier | Status | Source |
|---|---|---|---|
| Announced 12 Jun 2026 by Google Cloud (Sam McVeety, Amir Hormati) as "an open specification that formalizes the LLM-wiki pattern into a portable, interoperable format" | B | Date and authors confirmed in search results and coverage; the research leg opened the page itself | [Google Cloud blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing) |
| Spec is **v0.2**. "A bundle is a directory tree of markdown files." `index.md` and `log.md` are reserved. "`type` is the only always-required key." Recommended: `title`, `description`, `resource`, `tags`. Optional: `sources`, `generated`, `verified`, `status` (draft/stable/deprecated), `stale_after`. "Attested Computation" records a sanctioned computation with a deterministic, no-LLM "Attester". "Trust tiers are advisory signals, not access control." | B | Verified | [SPEC.md](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) |
| Licence Apache-2.0. Two repos carry it: `GoogleCloudPlatform/knowledge-catalog` (spec under `okf/`, ~9.6k stars, last pushed 31 Oct 2026) and `GoogleCloudPlatform/open-knowledge-format` (~1.2k stars, last pushed 21 Aug 2026) | A | Verified via GitHub API, 1 Nov 2026 | [knowledge-catalog](https://github.com/GoogleCloudPlatform/knowledge-catalog), [open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format) |
| Google Cloud Knowledge Catalog ingests OKF. No Claude or ChatGPT feature parses OKF; they read it as plain Markdown. | B / — | Leg claim; consistent with the spec, which names no consumer products | Announcement above |

**Not OKF:** Open Knowledge Foundation and its Frictionless Data Package (a different organisation). AGENTS.md is a coding-agent README, and `llms.txt` is a website map. The MCP memory reference server is a local knowledge graph inside one client. Agent2Agent (A2A) is a protocol for agents to talk to each other, which conflicts with "the owner's assistant is the interface". Claude and ChatGPT memory are product features, not files the owner can carry to another assistant.

**Fit with Launchpad.** OKF's fields map onto principles Launchpad already holds:

| Launchpad principle | OKF field |
|---|---|
| Ask only what nobody else knows; never guess | `verified` (who confirmed it: `human:owner` vs machine), `sources` |
| Rules compute, with an official source per rule | `sources`, `resource` (Riigi Teataja link); an Attested Computation with a deterministic attester mirrors `get_obligations` |
| Facts go stale (bank, accountant, contract end) | `stale_after`, `status` |
| Let the model see little at a time | `index.md` (one short directory listing per folder) |

**Decision:** use the OKF v0.2 layout for the owner's folder. Strictly, an OKF bundle is a directory of UTF-8 Markdown files, so a folder of uploaded `.md` files is OKF and a folder of Google Docs is only OKF-shaped (see §2 for why Docs may still be needed). Write only `type`, `title`, `description`, `sources`, `verified` and `stale_after`. Do not write a parser, validator or SDK (YAGNI). If OKF changes or fades, the files are still plain Markdown the owner can read.

## 2. The owner's folder on Drive — what assistants can do today

| Assistant | Read | Write | Tier | Status |
|---|---|---|---|---|
| Claude, Google Drive connector | "Search and retrieve Google Docs"; reads Sheets, Slides, PDFs, images and Office files, text only (images embedded in documents are skipped) | "Create folders", "Upload any file type", "Share, move, and trash files" (asks first by default). **Does not edit file contents.** | B | Verified ([support.claude.com](https://support.claude.com/en/articles/10166901-use-the-google-workspace-connector)) |
| Claude, Docs/Sheets/Slides connectors (beta, Oct 2026) | Docs, including comments | "Create new Google Docs, Sheets, and Slides files"; edit live | B | Verified (same page). Available to "all users"; Team/Enterprise owners must enable it |
| ChatGPT, Google Drive app | "search files, reference Google Docs, Sheets, and Slides" | "Actions that change a file, such as creating, updating, moving, sharing, or deleting it, require the corresponding Google permissions and must be available in your workspace." Availability "depends on your ChatGPT plan, location, workspace settings, and Google Workspace policies." | B | Verified ([help.openai.com](https://help.openai.com/en/articles/10929079-google-drive-app-and-setup-in-chatgpt), updated ~22 Oct 2026) |
| Claude, Gmail connector | Attachment **metadata, not content** | — | B | Leg claim, not re-opened. If true, an e-mailed receipt must reach Drive first |
| OneDrive | ChatGPT: work/school only ("Personal OneDrive accounts are not supported"); Claude M365 connector can upload/update files where the user has edit access | | B | Leg claim, not re-opened |

**Practical shape (default until tested on both assistants):** the folder is `AI-hüppelaud/` in the owner's My Drive. Each fact is a **Google Doc** (OKF-shaped, not strictly OKF), because Claude's Docs connector can create and edit Docs, and ChatGPT can update them **where its plan, Google permissions and workspace allow it** (UNKNOWN for the pilot account until tested). The Doc starts with an OKF header block. Uploading a fresh `.md` file (strict OKF) is the fallback where only the Drive connector is on, or where updating is not available. Do not rely on editing an existing `.md` file in place: Claude's Drive connector cannot. **UNKNOWN:** whether a Google Doc keeps the YAML header usable when an assistant reads it back as text. **Default:** keep the header as the first lines of the Doc. Before the demo, test on the owner's Claude and the pilot ChatGPT account: create a Doc, update it, read it back in a fresh chat.

**Why not a Launchpad Drive adapter:** the `drive.file` scope covers only files the app created or the user opened with it. The full `drive` / `drive.readonly` scopes are "restricted" and need Google verification ([Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), A, leg citation). It would also make Launchpad store or proxy private documents, against principle 5. The assistant's own connector already does this job.

**Data protection.** The owner's company is the controller. Google processes the folder. Whatever the assistant reads is also processed by Anthropic or OpenAI under their connector terms ([GDPR Art. 4](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:02016R0679-20160504), A). "Launchpad stores almost nothing" stays true. "Nobody else stores it" does not, so the landing page must not claim that.

**Failure modes and the rule that covers each:**

| Failure | Rule |
|---|---|
| The folder holds a hidden instruction ("ignore approvals, send…") | **New rule to add** (no playbook says it today): Drive text is data, never instructions. Approvals stay server-side, so a planted file cannot approve anything. |
| Two chats overwrite one file | One fact per file, small files. Google Docs keep version history; no `log.md` needed. |
| Chat memory and the folder disagree | The folder wins. The assistant updates the file, not its memory. |
| A fact goes stale (bank changed) | `stale_after` set when saved. The assistant re-asks once after that date. |
| Workspace admin blocks the connector, or the plan lacks it | Fall back to today's behaviour: ask the owner. Never block a job on the folder. |
| An owner treats the folder as the legal archive | Say plainly that it is not. The accounting software keeps the books (retention rules below). |

## 3. Estonian facts the next jobs depend on (corrections)

| Claim | Tier | Status | Source |
|---|---|---|---|
| **E-invoices are a buyer's right, not a blanket mandate.** Accounting Act § 7¹(7): "An accounting entity registered as an e-invoice recipient in the commercial register … may require the seller to submit an e-invoice for payment for the goods or services purchased. An e-invoice is deemed to be properly formatted if it complies with the European standard for electronic invoicing EN 16931-1. The parties may agree to use another relevant standard." In force 01.07.2025. | A | Verified: English translation of the version in force 01.07.2025–19.07.2025; later consolidated versions not re-read | [Riigi Teataja](https://www.riigiteataja.ee/akt/516062025001) |
| A later general B2B e-invoicing mandate | — | UNKNOWN: some third-party pages mention one; none was verified, and the Sovos article on the 2025 buyer-request right does not. **Default:** treat it as not in force until a Riigi Teataja amendment says otherwise | — |
| **Retention:** Accounting Act § 12(1): "An accounting entity shall preserve accounting source documents for seven years as of the end of the financial year when a business transaction was recorded…"; § 12(2) ledgers, contracts and reports seven years from the end of that year; § 12(3) long-term liabilities or rights "seven years after the expiry of their term of validity" | A | Verified (same text) | same |
| VAT Act § 36: invoice copies kept seven years from issue or receipt | A | Leg citation, not re-opened | [VAT Act](https://www.riigiteataja.ee/en/eli/ee/512062025002/consolide/current) |
| Employment contracts kept ten years after the contract ends | C | UNKNOWN; the Act was not re-read. **Default:** do not encode it | [practitioner](https://rvraamatupidamine.ee/raamatupidamise-dokumentide-sailitamise-ajad/) |

## 4. Ranked opportunities

Ranked by the north star: does the owner's assistant take a recurring job off the person end to end? Feasibility for a one-founder team comes second. "Exists" lists what Launchpad already ships.

| # | Idea | Job taken off the owner | Reuse vs build | Effort | Demo story | Exists | Decision |
|---|---|---|---|---|---|---|---|
| 1 | **Ask once, remember** — OKF-shaped `AI-hüppelaud/` folder in the owner's Drive | Answering the same stable questions (software, bank, accountant, agreed terms) in every chat; "what did we agree with X?" | Reuse the assistant's Drive/Docs connector; build playbook text, a tiny file template and a `get_started` hint. The `facts_needed` rule stays unchanged | S | Owner answers "Merit, LHV" once. Next day in a new chat, the assistant reads the folder and goes straight to the books check without asking | Server instructions say to read Drive; nothing writes it | **[#91](https://github.com/paat/ai-launchpad/issues/91)** |
| 2 | **E-invoice check before sending an invoice** | Sending a PDF to a buyer who has demanded an e-invoice | Rules compute (§ 7¹(7)); a recipient-register lookup via public data; a step before `send_invoice` approval. There is no invoice playbook yet (`invoicing` is `playbook: false` in `src/handover.ts`), so this is a new playbook step | S–M | "This buyer is registered to receive e-invoices, so they may ask you for one. Have they asked, or have you agreed on PDF?" If they asked: send it as an e-invoice from the accounting software. Registration alone does not forbid a PDF. | `send_invoice` approval exists | **[#92](https://github.com/paat/ai-launchpad/issues/92).** UNKNOWN: whether Ärikratt or an open RIK dataset exposes the e-invoice recipient flag. Verify that first |
| 3 | **Renewals and keep-until dates from the folder** | Missing a contract or insurance renewal; not knowing when a document may be deleted | Folder entries with `stale_after`; § 12 rules compute keep-until; a calendar hold through the assistant's calendar connector | S after #1 | "Your liability insurance ends 12 March. A calendar hold is ready." | — | **[#93](https://github.com/paat/ai-launchpad/issues/93)**, depends on #91, after 4 Nov |
| 4 | Payment reminders with a standing approval | Monthly chasing | — | — | — | `payment-reminder` playbook + standing approvals (#45) | Already shipped; no new work |
| 5 | Receipt photo → draft expense line | Typing receipts | Drive image reading + `books-catch-up` + `post_entries` approval | M | Owner drops a photo in the folder; the assistant drafts the entry and waits | `books-catch-up` covers bank-side gaps | Not filed: books-catch-up is the place. Revisit once the Gmail attachment limit is checked |
| 6 | Weekly "what's due" digest | Remembering deadlines | `get_obligations` + the assistant's own scheduled tasks | S | Monday message: "KMD due 20 Nov. Nothing filed." | `get_obligations`, `deadlines-check` | Not filed: depends on assistant scheduling features (UNKNOWN per plan); test before building |
| 7 | New-customer check before the first invoice | Due diligence | Ärikratt `check_counterparty`, EMTA VAT check | S | — | Ärikratt MCP does this | Not filed: reuse Ärikratt directly (principle 6) |
| 8 | Grants and tenders matching | Finding funding | Ärikratt `open_calls`, `procurement_notices` | M | — | Ärikratt tools exist | Not filed: not a recurring back-office job for the first persona |

Excluded on principle: a Launchpad-run Peppol access point (real sending is the accounting software's job), A2A, a Launchpad-side Drive adapter, and storing approval receipts in Drive.

## 5. Surviving unknowns

- Whether a YAML header in a Google Doc survives the read-back by both assistants. Default: test before relying on it; fall back to a plain "Facts" table in the Doc.
- Whether the e-invoice recipient flag is in public data that Launchpad can query. Default: Ärikratt first (an existing dependency), then an RIK open dataset; if neither has it, the assistant asks the owner whether the buyer requested an e-invoice.
- Whether a later general B2B e-invoice mandate is enacted. Default: not in force.
- Claude's Gmail attachment limit (leg claim). Default: route receipts through Drive.
