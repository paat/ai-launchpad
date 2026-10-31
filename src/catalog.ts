import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface ServiceRecord { id: string; name: string; sector?: string; jobs?: string; interface_class?: string; connection?: string; access_and_price?: string; limitations?: string; evidence_status?: string; runtime_tested?: boolean; checked_on?: string; sources?: string[]; }

let cache: ServiceRecord[] | null = null;
export function loadCatalog(): ServiceRecord[] {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "docs", "research", "catalog", "estonian-business-services.json");
  const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const arr = Object.values(raw).find((v) => Array.isArray(v)) as ServiceRecord[] | undefined;
  cache = arr ?? [];
  return cache;
}
/** Only well-formed https URLs without embedded credentials are ever linked. */
export function safeHttps(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v.length === 0) return null;
  if (/[\s\x00-\x1F\x7F-\x9F]/.test(v)) return null;
  if (!v.startsWith("https://")) return null;
  if (v.includes("\\")) return null;
  if (/https?:\/\//i.test(v.slice("https://".length))) return null;
  const rest = v.slice("https://".length);
  if (!rest || rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#") || rest.startsWith("@") || rest.startsWith(":")) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || !u.host) return null;
  return u.href;
}
export function searchServices(query: string, limit: number) {
  const q = query.trim().toLowerCase();
  const all = loadCatalog();
  const hits = q ? all.filter((r) => `${r.name} ${r.jobs ?? ""} ${r.sector ?? ""} ${r.interface_class ?? ""}`.toLowerCase().includes(q)) : all;
  return hits.slice(0, limit).map((r) => ({
    id: r.id, name: r.name, jobs: r.jobs ?? "", interface_class: r.interface_class ?? "",
    connection: r.connection ?? "",
    connection_url: safeHttps(r.connection),
    access_and_price: r.access_and_price ?? "",
    limitations: r.limitations ?? "", evidence_status: r.evidence_status ?? "",
    checked_on: r.checked_on ?? "",
    sources: (r.sources ?? []).map(safeHttps).filter((x): x is string => !!x).slice(0, 4),
    runtime_verified: false as const,
    note: "Research catalog entry, not runtime-verified by Launchpad. Connect it in your own assistant; Launchpad does not fetch or broker it.",
  }));
}
export const APPROVAL_KINDS = ["send_message", "send_invoice", "prepare_payment", "prepare_filing"] as const;
/** Executable job playbooks (#26): deterministic instructions for the owner's
 *  own agent. Launchpad never runs the job; triggers are obligation rule_ids. */
export interface Playbook {
  id: string; title: string; title_et: string; summary: string; source: string; source_label: string;
  triggers: string[]; needs: string[]; steps: string[];
  approval_kind: (typeof APPROVAL_KINDS)[number] | null; done_when: string; verify_with: string;
}
export const PLAYBOOKS: Playbook[] = [
  { id: "deadlines-check", title: "Check the owner's deadlines", title_et: "Vaata üle oma tähtajad",
    summary: "Your assistant lists your upcoming tax and register deadlines, each with its official source. It first asks only the questions that can change the list, then offers to prepare each job.",
    source: "https://www.emta.ee/en/business-client/taxes-and-payment/payment-arrears/payment-taxes", source_label: "Estonian Tax and Customs Board (EMTA): Payment of taxes",
    triggers: [], needs: ["The company's registry code or name (owner fact)."],
    steps: [
      "Call get_obligations. Rules compute every date; quote them with each row's source link and never compute a deadline yourself.",
      "Ask the facts_needed questions first: one answer can remove a row. Call get_obligations again with the owner's answers.",
      "For each row with a playbook_id, offer in one line to prepare it and ask whether to start. Then follow that playbook's steps.",
    ],
    approval_kind: null, done_when: "The owner has seen each deadline with its source and has said which jobs to prepare.", verify_with: "Each row's official source link." },
  { id: "connect-service", title: "Link the owner's accounting, e-mail or LHV bank", title_et: "Ühenda oma raamatupidamine, e-post või LHV pank",
    summary: "Your assistant asks what you want linked and which one you use, then walks you through it, one step at a time, in plain words. You do the logins yourself, and your keys never go through the chat.",
    source: "https://abiinfo.rik.ee/index.php/e-arveldaja/e-arveldaja-api/e-arveldaja-api-votme-genereerimine", source_label: "RIK e-arveldaja: API võtme genereerimine (raamatupidamise haru / accounting branch)",
    triggers: [],
    needs: ["Which service the owner wants linked, and which product they use (owner facts; ask only if your own connectors do not show them).", "The owner signs in to that service alone, with their own Smart-ID, ID-card or password; never ask for, repeat or accept a password or PIN in the chat."],
    steps: [
      "Speak plainly: the owner may not know what MCP, a connector or an API is. Say what it does (\"so I can read your invoices\") and name buttons exactly as the screen shows them. This playbook never writes, sends or calls request_approval; any later change or message belongs to a job's own playbook and its approval. Never ask for keys, passwords or PINs in the chat; if the owner pastes one here, do not repeat, store or pass it to any tool, and tell them to revoke it and delete the chat message.",
      "Ask one question unless the owner already said it: what should be linked (accounting software, e-mail or bank) and which one they use. Once you know which service, look at your own connected connectors before asking which product: if a connector for that same service already answers, name it and use it instead of asking. Follow only the steps that start with that service's name; each one says how to finish. A connector for a different service never lets you skip these steps.",
      "E-mail: if it is Gmail or Microsoft 365, offer your built-in connector (if it is already connected, skip the offer), and once it is connected, go to the last step. If it is Proton Mail or other mail without a built-in connector, say plainly that it cannot be linked and do not search or quote catalogue entries for it. If your Gmail or Microsoft 365 connector is already connected, offer in one line to send from that mailbox instead, naming its address and saying the e-mail then comes from that address, not from the mailbox they asked about; if the owner agrees, go to the last step. Otherwise stop here without the last step; for Proton the owner later presses Send in their own mail app after a job's approval.",
      "Bank: only LHV can be linked, through LHV's own read-only connection (no payments). Call search_services with \"LHV AI\" and quote only the entry with id lhv-ai; the connector address is https://mcp.lhv.ai/mcp, added like any custom connector, and the owner signs in to LHV with their own Smart-ID (never automate it). Say that access for business accounts is not yet confirmed. Any other bank: say plainly that it cannot be linked live yet and explain the statement route instead: when a job needs bank data, the owner downloads the account statement for that period from their internet bank as a file and shares it, and it is used only for that job. Then stop here without the last step. Never start a bank key, credential or payment setup, and never offer community bank tools. After LHV is added, go to the last step.",
      "Accounting: if an accounting connector for this company already answers a read-only question, skip the remaining Accounting steps and go to the last step. Otherwise call search_services with \"werkzeug\" and quote that entry's access_and_price and limitations; say it is a third-party service the owner signs up to, not Launchpad. Offer only that hosted connector (it covers e-arveldaja, Merit Aktiva and Erply Books); never offer community or local servers from the catalogue.",
      "Accounting: before any key is created, choose reading only wherever the permit or the connector offers it. If the product or the connector offers no read-only key, say plainly that it cannot be linked safely yet, because the key could also change the books, and stop here: skip all remaining steps.",
      "Accounting: guide the owner to create the key, one step per message. e-arveldaja: the owner logs in at https://e-arveldaja.rik.ee with their own Smart-ID or ID-card (never automate the login), opens Settings → General settings → e-Financials API access permits, adds a permit, enters the server IP address shown on the connector's dashboard (never guess one), ticks only reading functions (if the permit cannot be limited to reading, stop here: skip all remaining steps), then saves and downloads the key file. Merit Aktiva or Erply Books: continue only if the connector's own published setup guide documents a read-only key, and create only that; otherwise stop here: skip all remaining steps. Other software: say plainly that it cannot be linked yet and stop here: skip all remaining steps.",
      "Accounting: tell the owner to paste the key values only into the connector's own dashboard; if it asks for an environment, choose Production for their real books.",
      "Accounting: help the owner add the connector to this assistant: in Claude, Customize → Connectors → Add custom connector (Claude phone app: Settings → Connectors → + → Add custom connector); in ChatGPT, Plugins → add a custom MCP server. Paste the company-specific MCP URL shown on the connector's dashboard, not the catalogue address, keep the detected sign-in settings, then sign in and pick the company. Claude's free plan allows one custom connector and AI Launchpad already uses it: if Add custom connector is greyed out, say so plainly, explain that removing AI Launchpad stops deadlines and approvals, suggest upgrading the plan, and stop here without the last step; never suggest removing AI Launchpad. Once the connector is added, go to the last step.",
      "Verify only the service the owner asked for, read-only, and tell the owner the result in one line: accounting, last month's unpaid sales invoices; e-mail, only the date of the newest message, with no subject or content; LHV, only the date of the latest transaction, with no amounts. Do not create, change, delete or send anything during setup.",
    ],
    approval_kind: null, done_when: "The service the owner asked to link passes its read-only check, or the owner knows plainly why it cannot be linked yet.", verify_with: "The owner sees the same invoices or messages in their own accounting software or mailbox." },
  { id: "payment-reminder", title: "Remind a customer about an overdue invoice", title_et: "Meenuta kliendile tasumata arvet",
    summary: "Your assistant finds unpaid invoices past their due date and drafts a polite reminder. Nothing is sent until you approve the exact text, amount and recipient.",
    source: "https://www.riigiteataja.ee/akt/13113422?leiaKehtiv=", source_label: "Võlaõigusseadus § 113 (viivis), Riigi Teataja",
    triggers: [],
    needs: ["Unpaid sales invoices: the owner's accounting connector (if no accounting connector answers yet, follow the connect-service playbook) or a file the owner shares.", "The owner's own email tool to send the reminder."],
    steps: [
      "Find unpaid invoices past their due date in the owner's accounting connector or in a file the owner shares.",
      "Draft a polite reminder in the owner's language with the invoice number, the overdue amount and the due date as they appear on the invoice; the amount in the text is the same amount you put in amount_cents. Do not cite the statute or interest in the reminder unless the owner asks.",
      "Call request_approval with action kind send_message; recipient.name and recipient.address: the customer and their e-mail; amount_cents: REQUIRED, the overdue amount in euro cents, exactly as on the invoice (e.g. 240,00 € → 24000); period: the invoice's period; document.title and document.content: the exact reminder; summary: one line for the owner.",
      "Right before sending, call get_approval. If it is expired, request a fresh approval with a NEW report_id (the same report_id returns the expired receipt) for the unchanged reminder first. Approvals are valid for 24 hours.",
      "Only the live state authorizes a send: if get_approval (or current_state on a request_approval replay) returns approved (including auto_approved under the owner's standing approval) and usable is not false, send exactly that text to exactly that address with your own tools without asking the owner again; otherwise wait for the owner. Launchpad sends nothing.",
      "Call record_action_outcome with outcome sent (or failed).",
      "Record paid only after a sent outcome, with a NEW report_id (the same report_id conflicts): call record_action_outcome with outcome paid only if you see the payment, for example in the accounting connector. A failed reminder can never become paid.",
    ],
    approval_kind: "send_message", done_when: "The approved reminder was sent and record_action_outcome recorded sent.", verify_with: "The payment in the owner's accounting connector or bank statement; until then the outcome stays sent." },
  { id: "vat-return-prep", title: "Prepare the monthly VAT return (KMD)", title_et: "Valmista ette käibedeklaratsioon (KMD)",
    summary: "Your assistant gathers the month's invoices and takes the VAT figures from your accounting software's own report. You approve the exact figures, then file the return yourself in e-MTA.",
    source: "https://www.riigiteataja.ee/akt/130062026129", source_label: "Käibemaksuseadus § 27, Riigi Teataja",
    triggers: ["vat-return-kmd"],
    needs: ["The month's sales and purchase invoices: the owner's accounting connector (if no accounting connector answers yet, follow the connect-service playbook) or files the owner shares.", "The accounting software's own VAT report for the period."],
    steps: [
      "Gather the period's sales and purchase invoices from the owner's accounting connector or from files the owner shares.",
      "Check that none are missing (gaps in invoice numbers, purchases without an invoice) and ask the owner about each gap.",
      "Take the VAT figures from the accounting software's own VAT report. Never calculate a tax amount yourself; if no report exists, tell the owner and stop.",
      "Call request_approval with action kind prepare_filing; recipient.name: \"EMTA (e-MTA)\"; period: the VAT month; document.title and document.content: the report's exact figures; summary: one line for the owner.",
      "Right before the owner files, call get_approval. If it is expired, request a fresh approval with a NEW report_id (the same report_id returns the expired receipt) for the unchanged figures or draft first. Approvals are valid for 24 hours.",
      "After get_approval returns approved, tell the owner the figures to enter. The owner files the return in e-MTA with their own Smart-ID or ID-card; never automate the login, signature or submission.",
      "When the owner says it is filed, call record_action_outcome with outcome submitted.",
    ],
    approval_kind: "prepare_filing", done_when: "The owner filed the return in e-MTA and record_action_outcome recorded submitted.", verify_with: "The owner's e-MTA filing confirmation; the submitted outcome is the owner's or your report, not verified by Launchpad." },
  { id: "annual-report", title: "Prepare the annual report", title_et: "Valmista ette majandusaasta aruanne",
    summary: "Your assistant checks the register, gathers what the annual report needs and tells you what is still missing. You approve the key figures and the version you will sign, then sign and submit it yourself in the e-Business Register.",
    source: "https://www.riigiteataja.ee/akt/106072023131", source_label: "Äriseadustik § 179, Riigi Teataja",
    triggers: ["annual-report", "annual-report-overdue"],
    needs: ["The financial year's accounts: the owner's accounting connector (if no accounting connector answers yet, follow the connect-service playbook) or files the owner shares.", "Owner facts the report asks for, such as the activity description and the number of employees."],
    steps: [
      "Check the annual-report or annual-report-overdue row in get_obligations. With applies \"yes\" (public-register facts) the report is not listed as filed. With applies \"if\" the filing state is unknown: ask the owner the facts_needed question first.",
      "Gather what the report needs: the balance sheet and income statement from the accounting software, the activity description and the owner's answers.",
      "Give the owner a checklist of what is ready and what is still missing.",
      "Call request_approval with action kind prepare_filing; recipient.name: \"Äriregister (e-äriregister)\"; period: the financial year; document.title: the file name or version the owner will sign in the e-Business Register; document.content: the key figures (revenue, profit and balance-sheet totals) exactly as they appear in the accounting software, not the full draft; summary: one line for the owner. This approval is REQUIRED before the owner signs or submits. The authoritative document is the one the owner signs in the e-Business Register.",
      "Right before the owner files, call get_approval. If it is expired, request a fresh approval with a NEW report_id (the same report_id returns the expired receipt) for the unchanged figures or draft first. Approvals are valid for 24 hours.",
      "Act only after get_approval returns approved: tell the owner the approved figures and version are ready. The owner signs and submits the report in the e-Business Register; never automate the login, signature or submission.",
      "When the owner says it is submitted, call record_action_outcome with outcome submitted.",
    ],
    approval_kind: "prepare_filing", done_when: "The owner submitted the report in the e-Business Register and record_action_outcome recorded submitted.", verify_with: "With applies \"yes\" (public-register facts): the register's report_status; get_obligations stops showing the row once the register lists the report as filed. With applies \"if\": the owner's e-Business Register submission confirmation." },
];
export const DOMAINS = ["money", "customers", "people", "legal_sector", "operations"] as const;
export const FRAMEWORK = {
  version: "assessment-framework/3",
  domains: DOMAINS,
  questions: [
    "What responsibilities matter here (applicable / not applicable / unresolved, core or non-core, with short reason and evidence references)? Use each responsibility id once; missing domains stay visibly unassessed.",
    "Who handles each one? To claim arrangement 'assistant_assessed' (agent judgment: handled), name the actual arrangement via executor, their access/connection, the success criterion and the next checkpoint. Without all four it does not count as handled. It is still not independent verification.",
    "Where is the leverage: which single next action removes the most owner work, and why first (R-001)?",
    "What remains uncertain, unsupported, or owner-only? Never silently drop unfinished work: retain every previously mapped row; omissions are rejected. Explicitly mark a responsibility not_applicable with a new reason when it no longer applies. Explain every change of applicability or core status. report_progress task_id must match a mapped responsibility in this workspace.",
    "Final assessment (yours, as the agent): short conclusion, scope, assumptions, gaps, estimated effort saved with honest uncertainty (mark whether it is an estimate or observed; leave it out rather than invent hours).",
  ],
  evidence_labels: ["assistant_reported", "owner_confirmed", "source_confirmed", "launchpad_produced"],
  rule: "The agent makes the final business assessment; no owner ratification is required. Assistant reports are claims, not externally verified outcomes: independently verified outcomes are counted separately (0 until a real verifier exists). Unknown/unresolved items and unassessed domains block any percentage and any unqualified 100% claim. Company labels you supply are shown as agent-supplied, never as a public-register verification or mandate.",
};
