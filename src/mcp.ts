import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "./db.js";
import { newId, nowIso, sha256 } from "./db.js";
import { APPROVAL_KINDS, FRAMEWORK, PLAYBOOKS, searchServices, loadCatalog } from "./catalog.js";
import { assessmentSchema, assessmentRevisionError, computeCoverage, evidenceRefs, s, type Assessment } from "./core.js";
import { arikratt, type Arikratt, type CompanyCard } from "./arikratt.js";
import { computeObligations, nextAnnualReport, tallinnDate, type CompanyFacts, type Fact, type FactNeeded, type Obligation } from "./obligations.js";
import { BLOCKERS, MAX_JOB_HINT_CHARS, MAX_NEED_CHARS, recordUnmetNeed } from "./unmet-needs.js";

const PLAYBOOK_IDS = PLAYBOOKS.map((p) => p.id) as [string, ...string[]];

export interface Ctx { ownerId: string; scopes: string[]; companyRef: string; label: string; reportingEnabled: boolean; baseUrl: string; }
const readOnly = (nothing: string) => `The owner connected you read-only. Tell the owner: „Et saaksin seda sinu eest ette valmistada, ühenda mind AI-hüppelauaga uuesti ja luba nõusolekulehel töid ette valmistada.” When reconnecting, request the progress:report scope; the owner must allow it on the consent page. ${nothing}`;
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> });
const err = (m: string) => ({ isError: true, content: [{ type: "text" as const, text: m }] });

export function logActivity(db: Db, ownerId: string | null, actor: string, action: string, outcome: string, summary: string) {
  db.prepare("INSERT INTO activity(owner_id,actor,action,outcome,summary,created_at) VALUES(?,?,?,?,?,?)").run(ownerId, actor, action, outcome, summary.slice(0, 300), nowIso());
  if (ownerId) db.prepare("DELETE FROM activity WHERE owner_id=? AND id NOT IN (SELECT id FROM activity WHERE owner_id=? ORDER BY id DESC LIMIT 500)").run(ownerId, ownerId);
}
export interface Exclusion { id: string; label: string; last_seen_version: number; last_applicability: string; last_arrangement: string; }
export function getState(db: Db, ownerId: string) {
  const ws = db.prepare("SELECT company_ref,label,version FROM workspaces WHERE owner_id=?").get(ownerId) as { company_ref: string; label: string; version: number };
  const rows = db.prepare("SELECT payload_json,version,created_at FROM assessments WHERE owner_id=? ORDER BY version ASC").all(ownerId) as { payload_json: string; version: number; created_at: string }[];
  const latest = rows[rows.length - 1];
  const assessment = latest ? assessmentSchema.parse(JSON.parse(latest.payload_json)) : null;
  // Visible history: responsibilities dropped from the latest revision stay
  // listed as exclusions; nothing unfinished disappears silently.
  const currentIds = new Set((assessment?.responsibilities ?? []).map((r) => r.id));
  const seen = new Map<string, Exclusion>();
  for (const row of rows.slice(0, -1)) {
    const prior = assessmentSchema.parse(JSON.parse(row.payload_json));
    for (const r of prior.responsibilities) if (!currentIds.has(r.id)) seen.set(r.id, { id: r.id, label: r.label, last_seen_version: row.version, last_applicability: r.applicability, last_arrangement: r.arrangement });
  }
  const history = rows.map((r) => ({ version: r.version, assessed_at: r.created_at, responsibility_ids: assessmentSchema.parse(JSON.parse(r.payload_json)).responsibilities.map((x) => x.id) }));
  const progress = (db.prepare("SELECT task_id,milestone,evidence_label,evidence_refs_json,observed_at,version FROM progress WHERE owner_id=? ORDER BY created_at DESC LIMIT 20").all(ownerId) as Record<string, unknown>[])
    .map((p) => ({ ...p, evidence_refs: JSON.parse(String(p.evidence_refs_json ?? "[]")), evidence_refs_json: undefined }));
  return { ws, assessment, assessment_version: latest?.version ?? 0, assessed_at: latest?.created_at ?? null, coverage: computeCoverage(assessment), progress, exclusions: [...seen.values()], history };
}
export interface AssistantMilestones {
  synthetic: boolean;
  lastContact: { at: string; action: string; basis: "tool_activity" | "assessment_receipt" } | null;
  firstSavedAssessment: { at: string; reportId: string; receiptId: string; version: number } | null;
}
// Tool actions that count as retained assistant contact. Grant/token issuance,
// owner actions, demo seeding, approvals and failed/denied calls are excluded.
const ASSISTANT_CONTACT_ACTIONS = ["get_started", "connect_my_services", "get_obligations", "get_progress", "report_assessment", "report_progress", "search_services", "submit_service_candidate", "report_unmet_need"];

function validAssessmentReceipt(db: Db, ownerId: string, row: { report_id: string; receipt_json: string; created_at: string }) {
  let receipt: unknown;
  try { receipt = JSON.parse(row.receipt_json); } catch { return null; }
  if (typeof receipt !== "object" || receipt === null) return null;
  const r = receipt as Record<string, unknown>;
  if (r.kind !== "assessment_saved") return null;
  if (typeof r.receipt_id !== "string" || r.receipt_id.length === 0) return null;
  if (typeof r.version !== "number" || !Number.isInteger(r.version) || r.version <= 0) return null;
  const match = db.prepare("SELECT id FROM assessments WHERE owner_id=? AND version=?").get(ownerId, r.version) as { id: string } | undefined;
  if (!match) return null;
  return { at: row.created_at, reportId: row.report_id, receiptId: r.receipt_id, version: r.version };
}

// Owner-scoped read-only milestones. Demo owners return synthetic:true with no
// real milestones; missing owners yield no evidence, never another owner's.
export function getAssistantMilestones(db: Db, ownerId: string): AssistantMilestones {
  const owner = db.prepare("SELECT kind FROM owners WHERE id=?").get(ownerId) as { kind: string } | undefined;
  if (!owner) return { synthetic: false, lastContact: null, firstSavedAssessment: null };
  if (owner.kind === "demo") return { synthetic: true, lastContact: null, firstSavedAssessment: null };
  const inList = ASSISTANT_CONTACT_ACTIONS.map(() => "?").join(",");
  const contact = db.prepare(`SELECT action,created_at FROM activity WHERE owner_id=? AND actor='assistant' AND outcome='ok' AND action IN (${inList}) ORDER BY id DESC LIMIT 1`).get(ownerId, ...ASSISTANT_CONTACT_ACTIONS) as { action: string; created_at: string } | undefined;
  const reports = db.prepare("SELECT report_id,receipt_json,created_at FROM reports WHERE owner_id=? AND kind='assessment' ORDER BY created_at ASC, rowid ASC").all(ownerId) as { report_id: string; receipt_json: string; created_at: string }[];
  let first: { at: string; reportId: string; receiptId: string; version: number } | null = null;
  let newest: { at: string; reportId: string; receiptId: string; version: number } | null = null;
  for (const row of reports) {
    const valid = validAssessmentReceipt(db, ownerId, row);
    if (!valid) continue;
    if (!first) first = valid;
    newest = valid;
  }
  let lastContact: AssistantMilestones["lastContact"] = contact ? { at: contact.created_at, action: contact.action, basis: "tool_activity" } : null;
  if (newest && (!lastContact || newest.at > lastContact.at)) {
    lastContact = { at: newest.at, action: "report_assessment", basis: "assessment_receipt" };
  }
  return { synthetic: false, lastContact, firstSavedAssessment: first };
}
export function diffAssessments(prior: Assessment | null, next: Assessment) {
  const p = new Map((prior?.responsibilities ?? []).map((r) => [r.id, r]));
  const n = new Map(next.responsibilities.map((r) => [r.id, r]));
  return {
    added: [...n.keys()].filter((id) => !p.has(id)),
    removed: [...p.entries()].filter(([id]) => !n.has(id)).map(([id, r]) => ({ id, label: r.label, applicability: r.applicability, arrangement: r.arrangement })),
    scope_changes: [...n.entries()].filter(([id, r]) => p.has(id) && (p.get(id)!.applicability !== r.applicability || p.get(id)!.is_core !== r.is_core)).map(([id, after]) => ({ id, before: p.get(id)!, after })),
    changed: [...n.entries()].filter(([id, r]) => p.has(id) && JSON.stringify(p.get(id)) !== JSON.stringify(r)).map(([id]) => id),
  };
}
function idempotent(db: Db, ownerId: string, kind: string, reportId: string, payload: unknown): { receipt: Record<string, unknown> } | "conflict" | null {
  const hash = sha256(JSON.stringify(payload));
  const prev = db.prepare("SELECT payload_hash,receipt_json FROM reports WHERE owner_id=? AND kind=? AND report_id=?").get(ownerId, kind, reportId) as { payload_hash: string; receipt_json: string } | undefined;
  if (!prev) return null;
  return prev.payload_hash === hash ? { receipt: JSON.parse(prev.receipt_json) } : "conflict";
}
// Stop accepting new records at the local-demo bound; keep old receipts and
// exclusion history intact so retries and omissions remain inspectable.
function reportCapacityError(db: Db, ownerId: string): string | null {
  const total = (db.prepare("SELECT count(*) n FROM reports WHERE owner_id=?").get(ownerId) as { n: number }).n;
  if (total >= 500) return "Report storage limit reached (500). Export and delete progress before starting again. Nothing was saved.";
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = (db.prepare("SELECT count(*) n FROM reports WHERE owner_id=? AND created_at>=?").get(ownerId, since) as { n: number }).n;
  return recent >= 60 ? "Report rate limit reached (60 per minute). Retry later with the same report_id. Nothing was saved." : null;
}
// Approval cards: the digest binds the exact action (stable key order at
// every level), so any changed field needs a new owner approval.
export const canonicalJson = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonicalJson).join(",")}]`
  : v !== null && typeof v === "object" ? `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(",")}}`
  : JSON.stringify(v);
export const approvalDigest = (action: unknown) => sha256(canonicalJson(action));
/** Sends must lock their destination (#35): the digest then binds it. */
export const ADDRESS_KINDS: readonly string[] = ["send_message", "send_invoice"];
export const ADDRESS_REQUIRED = "recipient.address is required for send_message and send_invoice: the e-mail or e-invoice address the content goes to.";
export const approvalActionSchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  recipient: z.object({ name: s(120), address: s(120).describe("The e-mail or e-invoice address. Required for send_message and send_invoice.").optional() }).strict(),
  amount_cents: z.number().int().min(1).max(999_999_999_999).optional(),
  currency: z.enum(["EUR"]).default("EUR"),
  period: s(40).optional(),
  document: z.object({ title: s(120), content: s(4000) }).strict(),
  summary: s(300),
}).strict().refine((a) => !ADDRESS_KINDS.includes(a.kind) || !!a.recipient.address?.trim(), { message: ADDRESS_REQUIRED, path: ["recipient", "address"] });
/** Standing approvals (#45): the owner's rule approves matching sends at once.
 *  Only sends: filings and payments are always the owner's own act in e-MTA or the bank. */
export const STANDING_KINDS: readonly string[] = ADDRESS_KINDS;
export const STANDING_DEFAULTS = { maxAmountCents: 200_000, maxPerDay: 10, days: 90 } as const;
export interface StandingRule { id: string; owner_id: string; kind: string; recipients_json: string | null; max_amount_cents: number; max_per_day: number; expires_at: string; created_at: string; revoked_at: string | null; }
export const normAddress = (a: string) => a.trim().toLowerCase();
/** null: any recipient. */
export function standingRecipients(r: Pick<StandingRule, "recipients_json">): string[] | null {
  if (r.recipients_json === null) return null;
  try { const v = JSON.parse(r.recipients_json); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}
const ruleEur = (cents: number, l: "et" | "en") => new Intl.NumberFormat(l === "en" ? "en-GB" : "et-EE", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export function standingRuleName(r: Pick<StandingRule, "kind" | "recipients_json" | "max_amount_cents">, l: "et" | "en" = "et"): string {
  const list = standingRecipients(r);
  const who = list === null ? (l === "en" ? "any recipient (including new ones)" : "kõik saajad (ka uued)") : `${list.slice(0, 2).join(", ")}${list.length > 2 ? ` +${list.length - 2}` : ""}`;
  const what = r.kind === "send_invoice" ? (l === "en" ? "Invoices" : "Arved") : (l === "en" ? "Messages" : "Sõnumid");
  return l === "en" ? `${what} to ${who}, up to ${ruleEur(r.max_amount_cents, l)}` : `${what}: ${who}, kuni ${ruleEur(r.max_amount_cents, l)}`;
}
export function liveStandingRules(db: Db, ownerId: string): StandingRule[] {
  return db.prepare("SELECT * FROM standing_approvals WHERE owner_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC").all(ownerId, nowIso()) as StandingRule[];
}
/** The first live rule that covers this exact action, or null (then the owner decides on a card). */
export function matchStandingRule(db: Db, ownerId: string, action: z.infer<typeof approvalActionSchema>): StandingRule | null {
  if (!STANDING_KINDS.includes(action.kind) || !action.recipient.address?.trim()) return null;
  const amount = action.amount_cents;
  if (amount === undefined) return null; // the cap cannot be checked: the owner decides on a card
  const address = normAddress(action.recipient.address), since = new Date(Date.now() - 24 * 3600_000).toISOString();
  return liveStandingRules(db, ownerId).find((r) => {
    if (r.kind !== action.kind) return false;
    const list = standingRecipients(r);
    if (list !== null && !list.includes(address)) return false;
    if (amount > r.max_amount_cents) return false;
    const used = (db.prepare("SELECT count(*) n FROM approvals WHERE owner_id=? AND approved_by_rule=? AND created_at>?").get(ownerId, r.id, since) as { n: number }).n;
    return used < r.max_per_day;
  }) ?? null;
}
const OUTCOME_FIRST: Record<string, string[]> = { send_message: ["sent", "failed"], send_invoice: ["sent", "failed"], prepare_payment: ["paid", "failed"], prepare_filing: ["submitted", "failed"] };
const OUTCOME_NEXT: Record<string, string[]> = { sent: ["accepted", "rejected", "paid"], submitted: ["accepted", "rejected"] };
export interface ApprovalRow { id: string; kind: string | null; report_id: string | null; payload_json: string; digest: string; state: string; expires_at: string; created_at: string; decided_at: string | null; consumed_at: string | null; outcome_json: string | null; approved_by_rule?: string | null; playbook_id?: string | null; owner_confirmation?: string | null; }
/** Lazy expiry: the window covers deciding and acting, so a pending or an
 *  approved-but-unused approval past expires_at becomes expired on read. */
export function expireApprovals(db: Db, ownerId: string) {
  db.prepare("UPDATE approvals SET state='expired' WHERE owner_id=? AND state IN ('pending','approved') AND expires_at<=?").run(ownerId, nowIso());
}
const ADDRESS_MISSING = "Address missing: request a new approval that includes the recipient address";
/** A stored send approval without a usable address (a legacy row) can never be approved or acted on. */
export function approvalAddressMissing(a: Pick<ApprovalRow, "kind" | "payload_json">): boolean {
  let p: { kind?: unknown; recipient?: unknown } = {};
  try { p = JSON.parse(a.payload_json); } catch { /* unreadable: kind decides */ }
  if (!ADDRESS_KINDS.includes(String(a.kind ?? p.kind ?? ""))) return false;
  const address = p.recipient && typeof p.recipient === "object" ? (p.recipient as { address?: unknown }).address : undefined;
  return typeof address !== "string" || !address.trim();
}
export function getApproval(db: Db, ownerId: string, id: string) {
  expireApprovals(db, ownerId);
  return db.prepare("SELECT * FROM approvals WHERE id=? AND owner_id=?").get(id, ownerId) as ApprovalRow | undefined;
}

function saveReceipt(db: Db, ownerId: string, kind: string, reportId: string, payload: unknown, receipt: Record<string, unknown>) {
  db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,payload_json,receipt_json,created_at) VALUES(?,?,?,?,?,?,?)").run(ownerId, reportId, kind, sha256(JSON.stringify(payload)), JSON.stringify(payload), JSON.stringify(receipt), nowIso());
}

// Deadlines (issue #19): rules compute, models read. Assistant-supplied facts
// fill gaps only; public-register facts are never overridden by them.
export const assistantFactsSchema = z.object({
  company_name: s(120).optional(),
  vat_registered: z.boolean().optional(),
  payouts_last_month: z.boolean().optional(),
  other_tsd_triggers_last_month: z.boolean().optional(),
  employees: z.number().int().min(0).max(100_000).optional(),
  fy_end: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).refine((v) => !Number.isNaN(Date.parse(`2000-${v}T00:00:00Z`)) && new Date(`2000-${v}T00:00:00Z`).toISOString().slice(5, 10) === v, "fy_end must be a real MM-DD date").optional(),
  ytd_turnover_this_year: z.number().min(0).max(1e12).optional(),
  hire_or_board_fee_starting: z.boolean().optional(),
}).strict();
export const OBLIGATIONS_DISCLAIMER = "Tähtajad arvutab reeglistik, mitte tehisaru. Kuupäevad on arvutatud, mitte esitatud, makstud ega kontrollitud. See ei ole õigus- ega maksunõu; kontrolli iga rea allikat. / Deadlines are calculated by rules, not AI. Dates are computed, not filed, paid or verified. Not legal or tax advice; check each row's source.";
const CONFIRM_QUESTIONS: Record<string, Omit<FactNeeded, "fact">> = { vat_registered: { question_et: "Registris on KMKR number, kuid viimastel kvartalitel käivet pole deklareeritud. Kas ettevõte on endiselt käibemaksukohustuslane?", question_en: "The register shows a VAT number but no declared turnover in recent quarters. Is the company still VAT-registered?" } };
const REGISTRY_CODE_NEEDED: FactNeeded = { fact: "registry_code", question_et: "Mis on ettevõtte 8-kohaline registrikood?", question_en: "What is the company's 8-digit registry code?" };
const withPlaybook = (o: Obligation): Obligation & { playbook_id?: string } => {
  const p = PLAYBOOKS.find((x) => x.triggers.includes(o.rule_id));
  return p ? { ...o, playbook_id: p.id } : o;
};
export async function companyObligations(ar: Arikratt, o: { registryCode?: string; assistant?: z.infer<typeof assistantFactsSchema>; months: number; today?: Date; cacheOnly?: boolean }) {
  let code = o.registryCode;
  let miss: { unavailable: string; unavailable_reason: string } | null = null;
  const name = o.assistant?.company_name;
  let matched: { name: string; registry_code: string } | null = null;
  if (!code && name && ar.configured) {
    const found = await ar.search(name);
    if (found.ok && found.matches.length === 1) { matched = found.matches[0]; code = matched.registry_code; }
    else if (!found.ok) miss = { unavailable: found.unavailable, unavailable_reason: found.reason };
    else if (found.matches.length === 0) miss = { unavailable: "no_match", unavailable_reason: `No company in the public register matches "${name}".` };
    else return { ok: false as const, error: `Several companies match "${name}": ${found.matches.map((m) => `${m.name} (${m.registry_code})`).join("; ")}. Ask the owner which registry code is theirs and call again with registry_code. No deadlines were computed.` };
  }
  if (!code && !o.assistant) return { ok: false as const, error: "No company is known yet. Ask the owner for the company name or 8-digit registry code, then call get_obligations with registry_code (or with facts). No deadlines were computed." };
  const lookup = code ? await ar.lookup(code, { cacheOnly: o.cacheOnly }) : null;
  if (lookup && !lookup.ok && (lookup.unavailable === "invalid_code" || lookup.unavailable === "not_found")) return { ok: false as const, unavailable: lookup.unavailable, error: `${lookup.reason} Ask the owner to check the code. No deadlines were computed.` };
  const facts: CompanyFacts = lookup?.ok ? { ...lookup.facts } : {};
  const mine = <T>(value: T): Fact<T> => ({ value, provenance: "assistant_supplied" });
  for (const [k, v] of Object.entries({ ...o.assistant, ...(code && !lookup?.ok ? { registry_code: code } : {}) })) {
    if (v !== undefined && !(k in facts)) (facts as Record<string, Fact<unknown>>)[k] = mine(v);
  }
  const today = o.today ?? new Date();
  const r = computeObligations(facts, { today, months: o.months });
  // next_deadline: a late-month window can be empty, so always name the next date (3-month horizon).
  const from = tallinnDate(today);
  const next = computeObligations(facts, { today, months: 3 }).obligations.find((x) => x.effective_due !== null && x.effective_due >= from) ?? null;
  const annual = nextAnnualReport(facts, today);
  const confirm = lookup?.ok ? lookup.confirm.map((fact) => ({ fact, ...CONFIRM_QUESTIONS[fact] })) : [];
  // A single name-search match is a guess until the owner confirms it (#30 item 4).
  const which = matched && `${matched.name} (${matched.registry_code})`;
  const confirmCompany: FactNeeded[] = which ? [{ fact: "confirm_company", question_et: `Kas ${which} on sinu ettevõte?`, question_en: `Is ${which} your company?` }] : [];
  const company: CompanyCard & { unavailable?: string; unavailable_reason?: string } = lookup?.ok ? lookup.company : {
    name: facts.company_name?.value ?? null, registry_code: code ?? "", synthetic: false, provenance: "assistant_supplied", label_et: "Assistendi teade · avalikust registrist ei loetud", label_en: "Your assistant says · not read from a public register",
    snapshot_id: null, as_of: null, sources: [], attribution: "", ...(lookup && !lookup.ok ? { unavailable: lookup.unavailable, unavailable_reason: lookup.reason } : miss ?? {}),
  };
  return { ok: true as const, result: {
    company, computed_by: "rules", window: r.window, obligations: r.obligations.map(withPlaybook),
    next_deadline: next && withPlaybook(next),
    playbooks: PLAYBOOKS.filter((p) => [...r.obligations, ...(next ? [next] : [])].some((x) => p.triggers.includes(x.rule_id))).map(({ id, title, title_et, approval_kind }) => ({ id, title, title_et, approval_kind })),
    facts_needed: [...confirmCompany, ...(miss ? [REGISTRY_CODE_NEEDED] : []), ...confirm, ...r.facts_needed.filter((n) => !confirm.some((c) => c.fact === n.fact))],
    // Register facts behind the rows, so the assistant never asks the owner for them (owner 2026-10-31).
    // A name-search guess stays empty until the owner confirms the company (confirm_company).
    public_facts: which ? {} : Object.fromEntries(Object.entries(facts).filter(([, f]) => f && (f.provenance === "public_register" || f.provenance === "synthetic"))),
    data_as_of: company.as_of, disclaimer: OBLIGATIONS_DISCLAIMER,
    assistant_instruction: `${which ? `Confirm with the owner that ${which} is their company before relying on these deadlines. ` : ""}Cite the source link for every row. Do not add, remove or change deadlines; they are computed by rules. Ask the owner only for facts in facts_needed; a fact in public_facts that is not in facts_needed is already known, so never ask for it. Name its provenance honestly: public_register is the business register, synthetic is sample data and never the register.${miss ? " Ask the owner for the 8-digit registry code." : ""} Ask the facts_needed questions first: an answer can remove a row. Then, for each row with a playbook_id, offer in one line to prepare it, and follow that playbook's steps from get_started. Never compute tax amounts or deadlines yourself. If next_deadline.applies is 'if', present it as conditional and quote its condition.`,
  },
  // Not part of get_obligations: the annual-report job's next row for „Käest ära”, outside the window (tribunal T-001).
  annual_next: annual && withPlaybook(annual) };
}

/** Sent at connect time, so the owner's assistant routes "connect my e-mail / accounting" here instead of guessing. */
export const SERVER_INSTRUCTIONS = "AI Launchpad helps a small-business owner who may not know technical words such as MCP, connector or API. Start with get_started. Whenever the owner wants to link a service to you (their accounting software, e-mail or bank), call connect_my_services and follow the connect-service playbook it returns before answering from your own connector directory; it says which lookups are allowed. Before asking the owner for any fact or document, check both public data (get_obligations public_facts) and the owner's own connected files, such as Google Drive; ask only if neither has it. Always ask the facts_needed questions from get_obligations, and never let a file stand in for the owner's answer to them. Speak plainly: short sentences, everyday words, one question per message, and no technical codes or file formats unless the owner uses them first. Name buttons exactly as the screen shows them.";
export function buildMcpServer(db: Db, ctx: Ctx, ar: Arikratt = arikratt(db, {}), hooks: { onUnmetNeed?: () => void } = {}) {
  const server = new McpServer({ name: "ai-launchpad", version: "0.2.0" }, { instructions: SERVER_INSTRUCTIONS });
  const need = (scope: string) => ctx.scopes.includes(scope);
  /** Tools that need progress:report and sharing on: a read-only connection gets the same reconnect guidance everywhere. */
  const sharingGate = (nothing: string) => !need("progress:report") ? readOnly(nothing) : !ctx.reportingEnabled ? `Progress sharing is stopped by the owner (it is off by default). ${nothing}` : null;

  server.registerTool("get_started", { description: "Start here. Start with the owner's deadlines (get_obligations), then offer the matching playbook. Public assessment framework, executable job playbooks and reporting guidance for any authenticated connection; with progress:read it also returns this workspace's company_ref, label and sharing state.", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
    logActivity(db, ctx.ownerId, "assistant", "get_started", "ok", "Assistant fetched getting-started guidance.");
    const first_step = "Start with the owner's deadlines (get_obligations), then offer the matching playbook. Rules compute every date and each row has its official source; ask the owner only for the facts it lists in facts_needed. A row with a playbook_id has a job you can prepare: follow that playbook's steps; the owner only approves.";
    const shared = { framework: FRAMEWORK, playbooks: PLAYBOOKS,
      tools: ["get_obligations", "connect_my_services", "get_progress", "report_assessment", "report_progress", "search_services", "submit_service_candidate", "request_approval", "get_approval", "record_action_outcome", "report_unmet_need"],
      note: "Progress sharing is off until the owner grants it once on the Connection page. Launchpad stores concise task updates and assessments; private service nominations; the exact text of each approval request until the owner deletes their progress; and the de-identified text of unmet needs. It stores no conversations. Reporting never approves business actions.",
      approvals_note: "Before sending, invoicing, paying or filing for the owner, show the owner the exact content in this chat and ask once. When they say yes, call request_approval with owner_confirmation set to their words: it is approved at once, so act without asking them to approve again anywhere else. Act only when the approval is approved (and usable is not false). A standing approval the owner set may approve a send without asking (auto_approved: true): to use it, call request_approval without owner_confirmation first; if it stays pending, ask the owner in this chat and call again with a new report_id, the same action and owner_confirmation. When you follow a playbook, pass its id as playbook_id so the owner sees which job the approval belongs to. Launchpad never sends, pays or files.",
      catalog_note: "search_services is a public research catalogue available to any authenticated connection; it never contains owner data." };
    if (!need("progress:read")) return json({ first_step, ...shared });
    return json({ first_step, workspace: { company_ref: ctx.companyRef, label: ctx.label }, ...shared, reporting_enabled: ctx.reportingEnabled });
  });

  server.registerTool("connect_my_services", { description: "Use when the owner wants to link, connect or set up their e-mail (Gmail, Outlook, Proton Mail or other), bank (LHV, Swedbank, SEB or other) or accounting software (e-arveldaja, Merit, Erply, Werkzeug or other) with you, or asks you to send invoices from their mailbox or read their bank or books. Call it before searching your own connector directory: it returns the step-by-step guide (the connect-service playbook) that says, in plain words, what can be linked safely and how. Read-only; never takes passwords or keys.", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
    logActivity(db, ctx.ownerId, "assistant", "connect_my_services", "ok", "Assistant fetched the service-linking guide.");
    return json({ playbook: PLAYBOOKS.find((p) => p.id === "connect-service"), first_step: "Follow the playbook's steps in order, one plain question per message. Ask what the owner wants linked and which product they use, unless they already said it." });
  });
  server.registerTool("get_obligations", { description: "The owner's Estonian back-office deadlines (VAT return KMD, TSD, annual report, VAT-registration threshold, TÖR) computed by deterministic rules from public-register facts plus any facts you supply; every row carries its official source (Riigi Teataja). Uses registry_code, else the workspace's latest assessment company_registry_ref (needs progress:read). Supply only facts the owner told you; never guess. months = 1–3 calendar months from today (Europe/Tallinn), default 2; next_deadline always names the next date, even outside the window. Rows with a playbook_id have a job playbook (see get_started).", inputSchema: { registry_code: z.string().regex(/^\d{8}$/, "registry_code is 8 digits").optional(), facts: assistantFactsSchema.optional(), months: z.number().int().min(1).max(3).optional() }, annotations: { readOnlyHint: true, openWorldHint: true } }, async (args) => {
    let code = args.registry_code;
    if (!code && need("progress:read")) { const ref = getState(db, ctx.ownerId).assessment?.company_registry_ref?.trim(); if (ref && /^\d{8}$/.test(ref)) code = ref; }
    const r = await companyObligations(ar, { registryCode: code, assistant: args.facts, months: args.months ?? 2 });
    if (!r.ok) return err(r.error);
    logActivity(db, ctx.ownerId, "assistant", "get_obligations", "ok", `Deadlines computed by rules: ${r.result.obligations.length} row(s), ${r.result.facts_needed.length} fact(s) needed${r.result.company.synthetic ? " (sample company)" : ""}.`);
    return json(r.result);
  });

  server.registerTool("get_progress", { description: "Get the assessment framework, latest agent assessment, agent-assessed coverage vs independently verified outcomes, revision history/exclusions, recent progress and next action.", inputSchema: {}, annotations: { readOnlyHint: true } }, async () => {
    if (!need("progress:read")) return err("Missing scope progress:read.");
    const st = getState(db, ctx.ownerId);
    logActivity(db, ctx.ownerId, "assistant", "get_progress", "ok", "Assistant read progress.");
    return json({ framework: FRAMEWORK, workspace: { company_ref: ctx.companyRef, label: ctx.label, agent_supplied_company_label: st.assessment?.company_label ?? null, agent_supplied_company_registry_ref: st.assessment?.company_registry_ref ?? null, company_label_note: "Agent-supplied labels are never a public-register verification or a mandate." }, version: st.ws.version, assessment_version: st.assessment_version, assessed_at: st.assessed_at, assessment: st.assessment, coverage: st.coverage, exclusions: st.exclusions, history: st.history, recent_progress: st.progress, freshness: st.assessed_at ? `Last assessment ${st.assessed_at}` : "No assessment yet. No background monitoring." });
  });

  server.registerTool("report_assessment", { description: "Save a versioned business assessment — the agent's final judgment, not a verified outcome. No owner ratification is required. Idempotent by report_id; expected_version guards staleness. Retain all previously mapped responsibility rows; omissions are rejected. To change scope, explicitly reclassify with a new reason. The receipt records scope changes and reasons.", inputSchema: { report_id: s(80), expected_version: z.number().int().min(0).max(1_000_000), assessment: assessmentSchema } }, async (args) => {
    const gate = sharingGate("Nothing was saved."); if (gate) return err(gate);
    const prior = idempotent(db, ctx.ownerId, "assessment", args.report_id, args);
    if (prior === "conflict") return err("Conflict: report_id already used with a different payload.");
    if (prior) return json(prior.receipt);
    const capacityError = reportCapacityError(db, ctx.ownerId);
    if (capacityError) return err(capacityError);
    const st = getState(db, ctx.ownerId);
    if (args.expected_version !== st.ws.version) return err(`Stale version: expected_version ${args.expected_version} does not match current ${st.ws.version}. Re-read get_progress first.`);
    const revisionError = assessmentRevisionError(st.assessment, args.assessment);
    if (revisionError) return err(revisionError);
    const newVersion = st.ws.version + 1;
    const receipt = { receipt_id: newId("rcpt"), kind: "assessment_saved", version: newVersion, saved_at: nowIso(), meaning: "Launchpad saved this assistant assessment (agent judgment). It did not verify external outcomes; independently verified outcomes are counted separately and remain 0 until a verifier exists.", coverage: computeCoverage(args.assessment), diff: diffAssessments(st.assessment, args.assessment) };
    db.transaction(() => {
      db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)").run(newId("asmt"), ctx.ownerId, newVersion, JSON.stringify(args.assessment), sha256(JSON.stringify(args.assessment)), nowIso());
      db.prepare("UPDATE workspaces SET version=? WHERE owner_id=?").run(newVersion, ctx.ownerId);
      saveReceipt(db, ctx.ownerId, "assessment", args.report_id, args, receipt);
    })();
    logActivity(db, ctx.ownerId, "assistant", "report_assessment", "ok", `Assessment v${newVersion} saved.`);
    return json(receipt);
  });

  server.registerTool("report_progress", { description: "Record a narrow milestone claim against an existing responsibility id in this owner workspace. Unknown or foreign task ids are rejected. This never marks an external outcome verified, accepted or paid. Unexpected fields are rejected.", inputSchema: { report_id: s(80), task_id: s(80), expected_version: z.number().int().min(0).max(1_000_000), observed_at: s(40), milestone: z.enum(["started", "draft_prepared", "waiting_for_owner", "blocked", "external_completion_reported"]), evidence_refs: evidenceRefs.optional() } }, async (args) => {
    const gate = sharingGate("Nothing was saved."); if (gate) return err(gate);
    if (Number.isNaN(Date.parse(args.observed_at)) || Date.parse(args.observed_at) > Date.now() + 5 * 60_000) return err("observed_at is not a plausible timestamp.");
    const prior = idempotent(db, ctx.ownerId, "progress", args.report_id, args);
    if (prior === "conflict") return err("Conflict: report_id already used with a different payload.");
    if (prior) return json(prior.receipt);
    const capacityError = reportCapacityError(db, ctx.ownerId);
    if (capacityError) return err(capacityError);
    const st = getState(db, ctx.ownerId);
    if (args.expected_version !== st.ws.version) return err(`Stale version: expected ${args.expected_version}, current ${st.ws.version}.`);
    if (!st.assessment?.responsibilities.some((r) => r.id === args.task_id)) return err("Unknown task_id in this workspace. Report an assessment mapping this responsibility first. Nothing was saved.");
    const newVersion = st.ws.version + 1;
    const receipt = { receipt_id: newId("rcpt"), kind: "progress_saved", task_id: args.task_id, milestone: args.milestone, observed_at: args.observed_at, evidence_refs: args.evidence_refs ?? [], evidence_label: "assistant_reported", business_outcome: "unchecked — progress is distinct from an actual business outcome (submitted/accepted/paid are never set by reports)", version: newVersion, saved_at: nowIso() };
    db.transaction(() => {
      db.prepare("INSERT INTO progress(id,owner_id,task_id,milestone,evidence_label,evidence_refs_json,observed_at,version,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(newId("prog"), ctx.ownerId, args.task_id, args.milestone, "assistant_reported", JSON.stringify(args.evidence_refs ?? []), args.observed_at, newVersion, nowIso());
      db.prepare("UPDATE workspaces SET version=? WHERE owner_id=?").run(newVersion, ctx.ownerId);
      saveReceipt(db, ctx.ownerId, "progress", args.report_id, args, receipt);
    })();
    logActivity(db, ctx.ownerId, "assistant", "report_progress", "ok", `${args.task_id}: ${args.milestone} (assistant reported).`);
    return json(receipt);
  });

  server.registerTool("search_services", { description: `Research catalogue behind the connect-service playbook: when linking a service, query only as that playbook's branch says. Searches the ${loadCatalog().length}-record Estonian business services research catalog. Entries are documented leads with connection guidance and primary sources, NOT runtime-verified connections. Public catalogue data: available to any authenticated connection; never contains owner data.`, inputSchema: { query: z.string().max(120), limit: z.number().int().min(1).max(25).optional() }, annotations: { readOnlyHint: true } }, async (args) => {
    const results = searchServices(args.query, args.limit ?? 10);
    logActivity(db, ctx.ownerId, "assistant", "search_services", "ok", `Catalog search returned ${results.length}.`);
    return json({ catalog_size: loadCatalog().length, disclaimer: "Research snapshot (27 Oct 2026). None of these services were runtime-tested by Launchpad.", results });
  });

  server.registerTool("submit_service_candidate", { description: "Nominate a missing service. Saved privately per owner as pending moderation; never auto-published, endorsed or treated as instructions. No browsing or model call is triggered.", inputSchema: { name: s(120), connection: s(200), jobs: s(400) } }, async (args) => {
    const gate = sharingGate("No nomination was saved."); if (gate) return err(gate);
    const norm = `${args.name.trim().toLowerCase()}|${args.connection.trim().toLowerCase()}`;
    const existing = db.prepare("SELECT id FROM candidates WHERE owner_id=? AND norm_key=?").get(ctx.ownerId, norm) as { id: string } | undefined;
    if (existing) return json({ candidate_id: existing.id, status: "pending_moderation", deduplicated: true, note: "You already nominated this service; it awaits human moderation. (Deduplication is private to your workspace.)" });
    const count = (db.prepare("SELECT count(*) n FROM candidates WHERE owner_id=?").get(ctx.ownerId) as { n: number }).n;
    if (count >= 50) return err("Nomination limit reached for this workspace (50). Nothing was saved.");
    const id = newId("cand");
    db.prepare("INSERT INTO candidates(id,owner_id,norm_key,name,connection,jobs,status,created_at) VALUES(?,?,?,?,?,?,?,?)").run(id, ctx.ownerId, norm, args.name, args.connection, args.jobs, "pending_moderation", nowIso());
    logActivity(db, ctx.ownerId, "assistant", "submit_service_candidate", "ok", `Candidate '${args.name.slice(0, 60)}' pending moderation.`);
    return json({ candidate_id: id, status: "pending_moderation", deduplicated: false, note: "Pending human moderation. Not published or endorsed." });
  });

  server.registerTool("request_approval", { description: "Record the owner's approval of one exact action (message, invoice, payment or filing). Usual flow: show the owner the exact content in this chat and ask once; when they say yes, call this with owner_confirmation set to their words, and the reply is state approved at once (approved_in_assistant: true): act without asking them to approve again on Launchpad. Without owner_confirmation the approval waits (pending) for the owner on the Launchpad approval page; use that only when the owner is not in this chat. A later call with owner_confirmation and the same action (new report_id) approves that waiting request. The digest binds every field of action; any change needs a new approval. send_message and send_invoice must name recipient.address, the exact e-mail or e-invoice address you will send to. Launchpad never sends, pays or files: after get_approval returns approved, act with your own tools using exactly this content, then call record_action_outcome before expires_at. Expires 24 hours after the request, for deciding and for acting: an approved approval with no outcome recorded by then becomes expired. Idempotent by report_id; a replay returns the creation receipt plus the live current_state. If the owner set a standing approval that covers the action (send_message/send_invoice only: kind, recipient, amount cap, daily limit, expiry), the reply is already state approved with auto_approved: true: proceed without asking the owner again. Filings and payments are never auto-approved.", inputSchema: { report_id: s(80), action: approvalActionSchema, owner_confirmation: s(300).describe("The owner's own reply in this chat approving exactly this content, quoted verbatim (e.g. \"jah, saada\"). Pass it only after you showed the owner the exact recipient, amount and text and they said yes. Optional.").optional(), playbook_id: z.enum(PLAYBOOK_IDS).describe("The playbook you are following (get_started playbooks[].id), so the owner sees which job this is. Optional.").optional() } }, async (args) => {
    const gate = sharingGate("Nothing was saved and no approval was requested."); if (gate) return err(gate);
    if (["send_invoice", "prepare_payment"].includes(args.action.kind) && args.action.amount_cents === undefined) return err(`amount_cents is required for ${args.action.kind}. Nothing was saved and no approval was requested.`);
    const playbook = args.playbook_id ? PLAYBOOKS.find((p) => p.id === args.playbook_id) : undefined;
    if (playbook && playbook.approval_kind !== args.action.kind) return err(`playbook_id ${playbook.id} ${playbook.approval_kind ? `prepares action kind ${playbook.approval_kind}` : "needs no approval"}, not ${args.action.kind}. Nothing was saved and no approval was requested.`);
    const prior = idempotent(db, ctx.ownerId, "approval", args.report_id, args);
    if (prior === "conflict") return err("Conflict: report_id already used with a different payload. Nothing was saved and no approval was requested.");
    if (prior) {
      const live = getApproval(db, ctx.ownerId, String(prior.receipt.approval_id))?.state;
      if (live === "approved" || live === "pending") return json({ ...prior.receipt, state: live, current_state: live });
      const { owner_instruction: _owner, ...rest } = prior.receipt;
      return json({ ...rest, state: live, current_state: live, assistant_instruction: `This approval is ${live}. Do not send, pay or file anything for it. If the owner still wants this done, make a new request_approval with a new report_id.` });
    }
    const capacityError = reportCapacityError(db, ctx.ownerId);
    if (capacityError) return err(capacityError);
    expireApprovals(db, ctx.ownerId);
    const { total, pending } = db.prepare("SELECT count(*) total, count(*) FILTER (WHERE state='pending') pending FROM approvals WHERE owner_id=?").get(ctx.ownerId) as { total: number; pending: number };
    if (total >= 200) return err("Approval limit reached for this workspace (200). The owner can export and delete progress to start again. Nothing was saved and no approval was requested.");
    if (args.owner_confirmation) {
      // The owner said yes in their own assistant: that is the approval, so they never approve twice.
      // A request still waiting for the same exact action is approved instead of adding a second one.
      const digest = approvalDigest(args.action), now = nowIso();
      const waiting = db.prepare("SELECT id,expires_at FROM approvals WHERE owner_id=? AND digest=? AND state='pending' ORDER BY created_at DESC LIMIT 1").get(ctx.ownerId, digest) as { id: string; expires_at: string } | undefined;
      const id = waiting?.id ?? newId("appr"), expires = waiting?.expires_at ?? new Date(Date.now() + 24 * 3600_000).toISOString();
      const receipt = { approval_id: id, state: "approved", approved_in_assistant: true, digest, decided_at: now, expires_at: expires, approve_url: `${ctx.baseUrl}/approvals/${id}`,
        assistant_instruction: "The owner approved this exact content in this chat, so it is approved now. Do not ask them to approve it again on Launchpad: act with your own tools using exactly this content, then call record_action_outcome with this digest before expires_at.",
        note: "Approved in the assistant chat, as reported by the assistant. Any change to the content needs a new approval." };
      db.transaction(() => {
        if (waiting) db.prepare("UPDATE approvals SET state='approved',decided_at=?,owner_confirmation=? WHERE id=? AND owner_id=?").run(now, args.owner_confirmation, id, ctx.ownerId);
        else db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,decided_at,playbook_id,owner_confirmation) VALUES(?,?,?,?,?,?,'approved',?,?,?,?,?)").run(id, ctx.ownerId, args.action.kind, args.report_id, JSON.stringify(args.action), digest, expires, now, now, args.playbook_id ?? null, args.owner_confirmation);
        saveReceipt(db, ctx.ownerId, "approval", args.report_id, args, receipt);
      })();
      logActivity(db, ctx.ownerId, "assistant", "approved_in_assistant", "ok", `Owner approved in the assistant chat: ${args.action.kind} to ${args.action.recipient.name} (digest ${digest.slice(0, 12)}). Launchpad sent, paid and filed nothing.`);
      return json(receipt);
    }
    const rule = matchStandingRule(db, ctx.ownerId, args.action);
    if (rule) {
      const id = newId("appr"), digest = approvalDigest(args.action), now = nowIso(), expires = new Date(Date.now() + 24 * 3600_000).toISOString(), ruleName = standingRuleName(rule);
      const receipt = { approval_id: id, state: "approved", auto_approved: true, approved_by_rule: rule.id, rule_name: ruleName, digest, decided_at: now, expires_at: expires, approve_url: `${ctx.baseUrl}/approvals/${id}`,
        assistant_instruction: `The owner's standing approval „${ruleName}” covers this exact action, so it is approved now. Proceed without asking the owner again: send exactly this content to exactly this address with your own tools, then call record_action_outcome with this digest before expires_at. Tell the owner in one line that you sent it under their standing approval.`,
        note: "Approved by the owner's standing rule (kind, recipient, amount cap, daily limit, expiry). Any change to the content needs a new request_approval." };
      db.transaction(() => {
        db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,decided_at,approved_by_rule,playbook_id) VALUES(?,?,?,?,?,?,'approved',?,?,?,?,?)").run(id, ctx.ownerId, args.action.kind, args.report_id, JSON.stringify(args.action), digest, expires, now, now, rule.id, args.playbook_id ?? null);
        saveReceipt(db, ctx.ownerId, "approval", args.report_id, args, receipt);
      })();
      logActivity(db, ctx.ownerId, "launchpad", "standing_auto_approved", "ok", `Auto-approved by standing rule ${rule.id}: ${args.action.kind} to ${args.action.recipient.name} (digest ${digest.slice(0, 12)}). Launchpad sent, paid and filed nothing.`);
      return json(receipt);
    }
    if (pending >= 20) return err("Too many approvals are waiting for the owner (20 pending). Ask the owner to decide on those first. Nothing was saved and no approval was requested.");
    const id = newId("appr"), digest = approvalDigest(args.action), expires = new Date(Date.now() + 24 * 3600_000).toISOString();
    const receipt = { approval_id: id, state: "pending", digest, expires_at: expires, approve_url: `${ctx.baseUrl}/approvals/${id}`, owner_instruction: "If the owner is in this chat, show them the exact content and ask once; when they say yes, call request_approval again with a new report_id, the same action and owner_confirmation (their words). That approves this request; do not also send them to the link. If they are not in this chat, they can approve or decline at the link (or the Launchpad Status page). Do not act before the approval is approved.", note: "Call get_approval before acting; current_state on replays is live." };
    db.transaction(() => {
      db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,playbook_id) VALUES(?,?,?,?,?,?,'pending',?,?,?)").run(id, ctx.ownerId, args.action.kind, args.report_id, JSON.stringify(args.action), digest, expires, nowIso(), args.playbook_id ?? null);
      saveReceipt(db, ctx.ownerId, "approval", args.report_id, args, receipt);
    })();
    logActivity(db, ctx.ownerId, "assistant", "request_approval", "ok", `Approval requested: ${args.action.kind} to ${args.action.recipient.name} (digest ${digest.slice(0, 12)}).`);
    return json(receipt);
  });

  server.registerTool("get_approval", { description: "Check an approval you requested: state (pending, approved, declined, expired, consumed), digest, the exact action, decision time, expiry and any assistant-reported outcome. Act only when state is approved and usable is not false (it expires at expires_at if no outcome was recorded). An approved send_message/send_invoice stored without recipient.address returns usable: false with a reason: do not act on it; request a new approval that includes the address.", inputSchema: { approval_id: s(80) }, annotations: { readOnlyHint: true } }, async (args) => {
    const gate = sharingGate("Nothing was read."); if (gate) return err(gate);
    const a = getApproval(db, ctx.ownerId, args.approval_id);
    if (!a) return err("Unknown approval_id in this workspace. Nothing was read.");
    const unusable = a.state === "approved" && approvalAddressMissing(a) ? { usable: false, reason: ADDRESS_MISSING } : {};
    const auto = a.approved_by_rule ? { auto_approved: true, approved_by_rule: a.approved_by_rule } : a.owner_confirmation ? { approved_in_assistant: true, owner_confirmation: a.owner_confirmation } : {};
    return json({ approval_id: a.id, state: a.state, ...unusable, ...auto, digest: a.digest, action: JSON.parse(a.payload_json), playbook_id: a.playbook_id ?? null, created_at: a.created_at, decided_at: a.decided_at, expires_at: a.expires_at, outcome: a.outcome_json ? JSON.parse(a.outcome_json) : null });
  });

  server.registerTool("record_action_outcome", { description: "Record what happened after you acted on an approved action with your own tools. Requires the approval's exact digest; a changed payload needs a new approval. The first outcome must be recorded before expires_at, must fit the kind (send_message/send_invoice: sent or failed; prepare_payment: paid or failed; prepare_filing: submitted or failed) and consumes the approval (one use); later outcomes, also after expiry, may only advance it (sent → accepted/rejected/paid, submitted → accepted/rejected). Outcomes are labelled assistant_reported, never verified. Idempotent by report_id.", inputSchema: { report_id: s(80), approval_id: s(80), digest: s(64), outcome: z.enum(["sent", "submitted", "accepted", "rejected", "paid", "failed"]), observed_at: s(40), evidence_refs: evidenceRefs.optional() } }, async (args) => {
    const gate = sharingGate("Nothing was recorded."); if (gate) return err(gate);
    if (Number.isNaN(Date.parse(args.observed_at)) || Date.parse(args.observed_at) > Date.now() + 5 * 60_000) return err("observed_at is not a plausible timestamp. Nothing was recorded.");
    const prior = idempotent(db, ctx.ownerId, "outcome", args.report_id, args);
    if (prior === "conflict") return err("Conflict: report_id already used with a different payload. Nothing was recorded.");
    if (prior) return json(prior.receipt);
    const capacityError = reportCapacityError(db, ctx.ownerId);
    if (capacityError) return err(capacityError);
    const a = getApproval(db, ctx.ownerId, args.approval_id);
    if (!a) return err("Unknown approval_id in this workspace. Nothing was recorded.");
    if (args.digest !== a.digest) return err("Digest does not match the approved content. The payload changed: request a new approval for the changed payload and wait for the owner. Nothing was recorded.");
    const prev = a.outcome_json ? JSON.parse(a.outcome_json) as { outcome: string; history: unknown[] } : null;
    if (a.state === "pending") return err("The owner has not approved this yet. Do not act. Nothing was recorded.");
    if (a.state === "expired") return err("This approval expired before an outcome was recorded; request a new approval. Nothing was recorded.");
    if (a.state === "approved" && approvalAddressMissing(a)) return err(`${ADDRESS_MISSING}. Nothing was recorded.`);
    const first = OUTCOME_FIRST[a.kind ?? ""] ?? [];
    if (a.state === "approved" && !first.includes(args.outcome)) return err(`A ${a.kind} approval's first outcome must be ${first.join(" or ")}. Nothing was recorded.`);
    if (a.state === "consumed" ? !OUTCOME_NEXT[prev?.outcome ?? ""]?.includes(args.outcome) : a.state !== "approved") {
      return err(a.state === "consumed"
        ? `This approval was already used (last outcome: ${prev?.outcome}). Approvals are one-use; an outcome may only advance sent → accepted/rejected/paid or submitted → accepted/rejected. Nothing was recorded.`
        : `This approval is ${a.state}; nothing may be done under it. Request a new approval. Nothing was recorded.`);
    }
    const entry = { outcome: args.outcome, observed_at: args.observed_at, evidence_refs: args.evidence_refs ?? [], evidence_label: "assistant_reported" as const };
    const savedAt = nowIso();
    const receipt = { receipt_id: newId("rcpt"), kind: "action_outcome_saved", approval_id: a.id, state: "consumed", ...entry, saved_at: savedAt, meaning: "Launchpad recorded what your assistant reported. It did not send, pay or file anything and did not verify this outcome." };
    db.transaction(() => {
      db.prepare("UPDATE approvals SET state='consumed',consumed_at=COALESCE(consumed_at,?),outcome_json=? WHERE id=? AND owner_id=?").run(savedAt, JSON.stringify({ ...entry, history: [...(prev?.history ?? []), { ...entry, recorded_at: savedAt }] }), a.id, ctx.ownerId);
      saveReceipt(db, ctx.ownerId, "outcome", args.report_id, args, receipt);
    })();
    logActivity(db, ctx.ownerId, "assistant", "record_action_outcome", "ok", `Outcome ${args.outcome} for approval ${a.id} (assistant reported, not verified).`);
    return json(receipt);
  });

  server.registerTool("report_unmet_need", { description: "Report a job the owner asked for that you could not do (no connector, needs the owner's PIN or signature, a portal without an API, not supported yet, or unclear). Describe the job generically; never include names of people, customers or employees. Write it in the owner's language, without company names, amounts, account numbers, personal or registry codes, e-mail addresses, phone numbers or other identifiers. Launchpad also replaces identifiers it detects before storing the text or showing it to any model, and keeps only that de-identified text. Launchpad then classifies it in the background (Meta's open model when live, a labelled mock locally); nothing is published unless the owner approves it on the Status page, and then only as anonymous open demand (category, short label, one-line spec). Idempotent by report_id.", inputSchema: { report_id: s(80), need: s(MAX_NEED_CHARS).describe("The job the owner asked for. Describe the job generically; never include names of people, customers or employees."), blocker: z.enum(BLOCKERS), job_hint: s(MAX_JOB_HINT_CHARS).optional() } }, async (args) => {
    const gate = sharingGate("Nothing was saved."); if (gate) return err(gate);
    const r = recordUnmetNeed(db, ctx.ownerId, args);
    if ("error" in r) return err(r.error);
    if (r.created) {
      logActivity(db, ctx.ownerId, "assistant", "report_unmet_need", "ok", `Unmet need received (${args.blocker}); stored de-identified, waiting for classification.`);
      try { hooks.onUnmetNeed?.(); } catch { /* classification is out of band; the receipt stands */ }
    }
    return json(r.receipt);
  });

  return server;
}

/** Top-level argument allowlists per tool. The app layer rejects unexpected
 * fields before dispatch (the SDK strips unknown keys instead of rejecting). */
export const TOOL_ARG_KEYS: Record<string, string[]> = {
  get_started: [], connect_my_services: [], get_progress: [],
  get_obligations: ["registry_code", "facts", "months"],
  report_assessment: ["report_id", "expected_version", "assessment"],
  report_progress: ["report_id", "task_id", "expected_version", "observed_at", "milestone", "evidence_refs"],
  search_services: ["query", "limit"],
  submit_service_candidate: ["name", "connection", "jobs"],
  request_approval: ["report_id", "action", "owner_confirmation", "playbook_id"],
  get_approval: ["approval_id"],
  record_action_outcome: ["report_id", "approval_id", "digest", "outcome", "observed_at", "evidence_refs"],
  report_unmet_need: ["report_id", "need", "blocker", "job_hint"],
};
