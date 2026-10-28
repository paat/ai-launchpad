import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "./db.js";
import { newId, nowIso, sha256 } from "./db.js";
import { FRAMEWORK, PLAYBOOKS, searchServices, loadCatalog } from "./catalog.js";
import { assessmentSchema, assessmentRevisionError, computeCoverage, evidenceRefs, s, type Assessment } from "./core.js";

export interface Ctx { ownerId: string; scopes: string[]; companyRef: string; label: string; reportingEnabled: boolean; }
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
const ASSISTANT_CONTACT_ACTIONS = ["get_started", "get_progress", "report_assessment", "report_progress", "search_services", "submit_service_candidate"];

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
function saveReceipt(db: Db, ownerId: string, kind: string, reportId: string, payload: unknown, receipt: Record<string, unknown>) {
  db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,payload_json,receipt_json,created_at) VALUES(?,?,?,?,?,?,?)").run(ownerId, reportId, kind, sha256(JSON.stringify(payload)), JSON.stringify(payload), JSON.stringify(receipt), nowIso());
}

export function buildMcpServer(db: Db, ctx: Ctx) {
  const server = new McpServer({ name: "ai-launchpad", version: "0.2.0" });
  const need = (scope: string) => ctx.scopes.includes(scope);

  server.registerTool("get_started", { description: "Start here. Public assessment framework, playbooks and reporting guidance for any authenticated connection; with progress:read it also returns this workspace's company_ref, label and sharing state.", inputSchema: {} }, async () => {
    logActivity(db, ctx.ownerId, "assistant", "get_started", "ok", "Assistant fetched getting-started guidance.");
    const shared = { framework: FRAMEWORK, playbooks: PLAYBOOKS,
      tools: ["get_progress", "report_assessment", "report_progress", "search_services", "submit_service_candidate"],
      note: "Progress sharing is off until the owner grants it once on the Connection page. Launchpad stores concise task updates and assessments only — no conversations or documents. Reporting never approves business actions.",
      catalog_note: "search_services is a public research catalogue available to any authenticated connection; it never contains owner data." };
    if (!need("progress:read")) return json(shared);
    return json({ workspace: { company_ref: ctx.companyRef, label: ctx.label }, ...shared, reporting_enabled: ctx.reportingEnabled });
  });

  server.registerTool("get_progress", { description: "Get the assessment framework, latest agent assessment, agent-assessed coverage vs independently verified outcomes, revision history/exclusions, recent progress and next action.", inputSchema: {} }, async () => {
    if (!need("progress:read")) return err("Missing scope progress:read.");
    const st = getState(db, ctx.ownerId);
    logActivity(db, ctx.ownerId, "assistant", "get_progress", "ok", "Assistant read progress.");
    return json({ framework: FRAMEWORK, workspace: { company_ref: ctx.companyRef, label: ctx.label, agent_supplied_company_label: st.assessment?.company_label ?? null, agent_supplied_company_registry_ref: st.assessment?.company_registry_ref ?? null, company_label_note: "Agent-supplied labels are never a public-register verification or a mandate." }, version: st.ws.version, assessment_version: st.assessment_version, assessed_at: st.assessed_at, assessment: st.assessment, coverage: st.coverage, exclusions: st.exclusions, history: st.history, recent_progress: st.progress, freshness: st.assessed_at ? `Last assessment ${st.assessed_at}` : "No assessment yet. No background monitoring." });
  });

  server.registerTool("report_assessment", { description: "Save a versioned business assessment — the agent's final judgment, not a verified outcome. No owner ratification is required. Idempotent by report_id; expected_version guards staleness. Retain all previously mapped responsibility rows; omissions are rejected. To change scope, explicitly reclassify with a new reason. The receipt records scope changes and reasons.", inputSchema: { report_id: s(80), expected_version: z.number().int().min(0).max(1_000_000), assessment: assessmentSchema } }, async (args) => {
    if (!need("progress:report")) return err("Missing scope progress:report.");
    if (!ctx.reportingEnabled) return err("Progress sharing is stopped by the owner (it is off by default). Nothing was saved.");
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
    if (!need("progress:report")) return err("Missing scope progress:report.");
    if (!ctx.reportingEnabled) return err("Progress sharing is stopped by the owner (it is off by default). Nothing was saved.");
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

  server.registerTool("search_services", { description: `Search the ${loadCatalog().length}-record Estonian business services research catalog. Entries are documented leads with connection guidance and primary sources, NOT runtime-verified connections. Public catalogue data: available to any authenticated connection; never contains owner data.`, inputSchema: { query: z.string().max(120), limit: z.number().int().min(1).max(25).optional() } }, async (args) => {
    const results = searchServices(args.query, args.limit ?? 10);
    logActivity(db, ctx.ownerId, "assistant", "search_services", "ok", `Catalog search returned ${results.length}.`);
    return json({ catalog_size: loadCatalog().length, disclaimer: "Research snapshot (27 Oct 2026). None of these services were runtime-tested by Launchpad.", results });
  });

  server.registerTool("submit_service_candidate", { description: "Nominate a missing service. Saved privately per owner as pending moderation; never auto-published, endorsed or treated as instructions. No browsing or model call is triggered.", inputSchema: { name: s(120), connection: s(200), jobs: s(400) } }, async (args) => {
    if (!need("progress:report")) return err("Missing scope progress:report.");
    if (!ctx.reportingEnabled) return err("Progress sharing is stopped by the owner (it is off by default). No nomination was saved.");
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

  return server;
}

/** Top-level argument allowlists per tool. The app layer rejects unexpected
 * fields before dispatch (the SDK strips unknown keys instead of rejecting). */
export const TOOL_ARG_KEYS: Record<string, string[]> = {
  get_started: [], get_progress: [],
  report_assessment: ["report_id", "expected_version", "assessment"],
  report_progress: ["report_id", "task_id", "expected_version", "observed_at", "milestone", "evidence_refs"],
  search_services: ["query", "limit"],
  submit_service_candidate: ["name", "connection", "jobs"],
};
