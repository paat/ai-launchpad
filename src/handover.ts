// „Käest ära” (#61): how many of this company's back-office jobs are off the owner's
// plate. Pure: every fill comes from a stored row (a consumed approval with a done
// outcome, or a live standing rule that has fired). Reads, logins and requests change nothing.
import { PLAYBOOKS } from "./catalog.js";
import { isHandled, type Assessment } from "./core.js";
import { normAddress, STANDING_DEFAULTS, STANDING_KINDS, type ApprovalRow, type StandingRule } from "./mcp.js";
import { tallinnDate, type Obligation, type Source } from "./obligations.js";

export type Rung = "mine" | "other" | "prep" | "done";
export interface Job {
  id: string; title_et: string; title_en: string; kind: string | null;
  rung: Rung; ceiling: "rule" | "law";
  evidence: { done: number; auto: number; paid: number; last: string | null; pending: number; rule?: StandingRule };
  source: "playbook" | "assessment" | "approvals";
  /** The assistant's assessment behind the row: its reason, and who handles the job if handled. */
  assessed?: { reason: string; executor?: string };
  /** The next rule-computed date for the job, if any, and the official source of its rule (#63 m6). */
  due: string | null; dueSource: Source | null;
}
export type NextStep =
  | { type: "standing"; job: Job; kind: string; recipients: { name: string; address: string }[]; capCents: number; basis: { count: number; maxCents: number } }
  | { type: "playbook"; job: Job; playbookId: string; obligation: Obligation | null }
  | { type: "connector" };
export interface Handover {
  jobs: Job[]; off: number; total: number; withoutYou: number;
  /** Done outcomes this Tallinn month; auto = approved by a standing rule. */
  month: { ym: string; done: number; auto: number };
  next: NextStep;
  findings: { expiredUnused: { count: number; last: ApprovalRow | null } };
  /** Jobs that came from the assistant's assessment (said out loud so a growing list never reads as regression). */
  fromAssessment: number;
}

/** Jobs Launchpad knows how to attribute. Playbook jobs apply by rule; invoicing appears when the assessment or an approval names it. */
const KNOWN = PLAYBOOKS.filter((p) => p.approval_kind).map((p) => ({ id: p.id, kind: p.approval_kind as string, triggers: p.triggers, playbook: true }));
export const JOB_TITLES: Record<string, [string, string]> = {
  "payment-reminder": ["Maksemeeldetuletused", "Payment reminders"],
  "vat-return-prep": ["KMD ettevalmistus", "VAT return (KMD)"],
  "annual-report": ["Majandusaasta aruanne", "Annual report"],
  invoicing: ["Arvete koostamine", "Invoicing"],
  "books-catch-up": ["Raamatupidamine korras", "Books brought up to date"],
  // No obligation trigger: the row appears only from a tagged approval or a matching assessment label.
  "customer-follow-ups": ["Kellele helistada", "Who to call"],
};
export const DONE_OUTCOMES = ["sent", "submitted", "paid", "accepted", "posted"];
const RANK: Record<Rung, number> = { done: 0, prep: 1, other: 2, mine: 3 };
const norm = (s: string) => s.trim().toLowerCase();
const payloadOf = (a: ApprovalRow): { kind?: string; recipient?: { name?: string; address?: string }; amount_cents?: number; summary?: string; document?: { title?: string } } => { try { return JSON.parse(a.payload_json); } catch { return {}; } };
const outcomeOf = (a: ApprovalRow): string | null => { try { return a.outcome_json ? (JSON.parse(a.outcome_json) as { outcome?: string }).outcome ?? null : null; } catch { return null; } };
export const isDone = (a: ApprovalRow) => a.state === "consumed" && DONE_OUTCOMES.includes(outcomeOf(a) ?? "");

/** The rows „Käest ära” resolves its jobs from: the Täna window, the next deadline, and the next annual report even when it is months out (tribunal T-001). */
export const handoverObligations = (r: { result: { obligations: Obligation[]; next_deadline: Obligation | null }; annual_next: Obligation | null }): Obligation[] =>
  [...r.result.obligations, ...(r.result.next_deadline ? [r.result.next_deadline] : []), ...(r.annual_next ? [r.annual_next] : [])];

// An untagged message counts as a payment reminder only when it reads like one (tribunal T-003).
const REMINDER = /meeldetuletu|tasumata|võlg|võla|reminder|overdue|unpaid/i;
/** Which job an approval belongs to: its playbook_id, else kind (messages only if they read like a reminder) plus the recipient name for filings. */
export function jobOfApproval(a: ApprovalRow): string | null {
  if (a.playbook_id && JOB_TITLES[a.playbook_id]) return a.playbook_id;
  const p = payloadOf(a), kind = a.kind ?? p.kind;
  if (kind === "send_message") return REMINDER.test(`${p.summary ?? ""} ${p.document?.title ?? ""}`) ? "payment-reminder" : null;
  if (kind === "send_invoice") return "invoicing";
  if (kind === "post_entries") return "books-catch-up";
  if (kind === "prepare_filing") return /äriregist|business register/i.test(p.recipient?.name ?? "") ? "annual-report" : "vat-return-prep";
  return null;
}

/** Only a definite (applies "yes") past risk row may become a job's date or next step; a cold cache's conditional one may not (review-polish-grok high). */
const definitelyOverdue = (x: Obligation, today: string) => x.kind === "risk" && x.applies === "yes" && !!x.effective_due && x.effective_due < today;

export function computeHandover(o: { assessment: Assessment | null; obligations: Obligation[]; approvals: ApprovalRow[]; rules: StandingRule[]; now: Date }): Handover {
  const today = tallinnDate(o.now), ym = today.slice(0, 7);
  const live = o.rules.filter((r) => !r.revoked_at && Date.parse(r.expires_at) > o.now.getTime());
  const rows = (o.assessment?.responsibilities ?? []).filter((r) => r.applicability === "applicable" && !r.is_core);
  const byJob = new Map<string, ApprovalRow[]>();
  for (const a of o.approvals) { const j = jobOfApproval(a); if (j) byJob.set(j, [...(byJob.get(j) ?? []), a]); }

  const build = (id: string, kind: string | null, source: Job["source"], assessed: Job["assessed"], dueRow: Obligation | null, titles: [string, string]): Job => {
    const mine = byJob.get(id) ?? [], done = mine.filter(isDone);
    const ceiling = kind && STANDING_KINDS.includes(kind) ? "rule" as const : "law" as const;
    // Deep green under a rule only once a live rule of this kind has approved a done outcome.
    const rule = ceiling === "rule" ? live.find((r) => r.kind === kind && done.some((a) => a.approved_by_rule === r.id)) : undefined;
    // Book entries need the owner's yes for every month, and each customer follow-up is approved one by one, so both stay at prep and never reach done under a rule (#96).
    const rung: Rung = done.length && kind !== "post_entries" && id !== "customer-follow-ups" && (rule || ceiling === "law") ? "done" : done.length ? "prep" : assessed?.executor ? "other" : "mine";
    const last = done.map((a) => a.consumed_at ?? "").sort().pop() || null;
    return { id, title_et: titles[0], title_en: titles[1], kind, rung, ceiling, source, due: dueRow?.effective_due ?? null, dueSource: dueRow?.source ?? null, ...(assessed ? { assessed } : {}),
      evidence: { done: done.length, auto: done.filter((a) => a.approved_by_rule).length, paid: done.filter((a) => outcomeOf(a) === "paid").length, last, pending: mine.filter((a) => a.state === "pending").length, ...(rule ? { rule } : {}) } };
  };
  const assessedOf = (r: (typeof rows)[number]) => ({ reason: r.reason, ...(isHandled(r) ? { executor: r.executor } : {}) });

  const used = new Set<string>();
  const jobs: Job[] = [];
  for (const k of KNOWN) {
    const titles = JOB_TITLES[k.id];
    const match = rows.find((r) => r.id === k.id || [titles[0], titles[1]].map(norm).includes(norm(r.label)));
    // A definite overdue row (e.g. annual-report-overdue) binds the job before any later deadline (#64); a conditional one never does.
    const byDate = (a: Obligation, b: Obligation) => (a.effective_due! < b.effective_due! ? -1 : a.effective_due! > b.effective_due! ? 1 : 0);
    const overdue = o.obligations.filter((x) => k.triggers.includes(x.rule_id) && definitelyOverdue(x, today)).sort(byDate).pop();
    const due = overdue ?? o.obligations.filter((x) => k.triggers.includes(x.rule_id) && x.effective_due && x.effective_due >= today).sort(byDate)[0] ?? null;
    const applies = k.id === "payment-reminder" || o.obligations.some((x) => k.triggers.includes(x.rule_id)) || !!match || byJob.has(k.id);
    if (!applies) continue;
    if (match) used.add(match.id);
    jobs.push(build(k.id, k.kind, k.playbook ? "playbook" : match ? "assessment" : "approvals", match ? assessedOf(match) : undefined, due, titles));
  }
  for (const r of rows) if (!used.has(r.id)) jobs.push(build(`a:${r.id}`, null, "assessment", assessedOf(r), null, [r.label, r.label]));
  jobs.sort((a, b) => RANK[a.rung] - RANK[b.rung]);

  const monthDone = o.approvals.filter((a) => isDone(a) && a.consumed_at && tallinnDate(new Date(a.consumed_at)).startsWith(ym));
  const expired = o.approvals.filter((a) => a.state === "expired" && a.decided_at).sort((a, b) => (a.decided_at! < b.decided_at! ? 1 : -1));
  return {
    jobs, off: jobs.filter((j) => j.rung !== "mine").length, total: jobs.length,
    withoutYou: jobs.filter((j) => j.rung === "done" && j.ceiling === "rule").length,
    month: { ym, done: monthDone.length, auto: monthDone.filter((a) => a.approved_by_rule).length },
    next: nextStep(jobs, live, o.approvals, o.obligations.filter((x) => x.kind !== "risk" || definitelyOverdue(x, today))),
    findings: { expiredUnused: { count: expired.length, last: expired[0] ?? null } },
    fromAssessment: jobs.filter((j) => j.source === "assessment").length,
  };
}

/** The sends a standing offer for this kind is built from, and POST /standing-approvals (scope "approved") draws its recipients from:
 * owner-decided, not declined, not by a rule, and attributed to the kind's job (tribunal T-003).
 * send_message is shared with customer-follow-ups, which is never standing-approved: only payment-reminder rows count (tribunal T-001, #96). */
export function standingBasis(approvals: ApprovalRow[], kind: string): ApprovalRow[] {
  const job = kind === "send_message" ? "payment-reminder" : KNOWN.find((k) => k.kind === kind)?.id;
  return approvals.filter((a) => a.kind === kind && a.decided_at && a.state !== "declined" && !a.approved_by_rule && jobOfApproval(a) === job);
}

export const largestAmount = (rows: ApprovalRow[]) => Math.max(0, ...rows.map((a) => payloadOf(a).amount_cents ?? 0));
/** A standing offer's default cap, on the approval card and on Ühendus alike (QA m4): the largest approved amount rounded up to the next 100 €, else the default. */
export const offerCapCents = (maxCents: number) => maxCents ? Math.ceil(maxCents / 10_000) * 10_000 : STANDING_DEFAULTS.maxAmountCents;

/** One next step, first match wins: standing offer → playbook prompt → connector. */
function nextStep(jobs: Job[], live: StandingRule[], approvals: ApprovalRow[], obligations: Obligation[]): NextStep {
  for (const j of jobs) {
    // A follow-up stays one approval at a time: reminder rows of the same kind must not build its standing card (#96).
    if (j.id === "customer-follow-ups" || j.rung !== "prep" || !j.kind || !STANDING_KINDS.includes(j.kind) || live.some((r) => r.kind === j.kind)) continue;
    const basis = standingBasis(approvals, j.kind);
    const recipients = new Map<string, string>();
    for (const a of basis) { const r = payloadOf(a).recipient; if (r?.address?.trim()) recipients.set(normAddress(r.address), r.name ?? r.address); }
    if (!recipients.size) continue;
    const maxCents = largestAmount(basis), capCents = offerCapCents(maxCents);
    return { type: "standing", job: j, kind: j.kind, recipients: [...recipients].map(([address, name]) => ({ name, address })), capCents, basis: { count: basis.length, maxCents } };
  }
  // Reminders first (they can reach the top rung), then filings by the soonest rule-computed date.
  const open = jobs.filter((j) => j.rung === "mine" && j.source === "playbook")
    .sort((a, b) => (a.id === "payment-reminder" ? -1 : b.id === "payment-reminder" ? 1 : (a.due ?? "9999") < (b.due ?? "9999") ? -1 : 1))[0];
  if (open) {
    const trig = PLAYBOOKS.find((p) => p.id === open.id)?.triggers ?? [];
    // No future date: the job is there because a trigger is already past (e.g. annual-report-overdue), so use the latest such row.
    const row = open.due ? obligations.find((x) => trig.includes(x.rule_id) && x.effective_due === open.due)
      : obligations.filter((x) => trig.includes(x.rule_id)).sort((a, b) => ((a.effective_due ?? "") < (b.effective_due ?? "") ? 1 : -1))[0];
    return { type: "playbook", job: open, playbookId: open.id, obligation: row ?? null };
  }
  return { type: "connector" };
}
