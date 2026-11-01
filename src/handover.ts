// „Käest ära” (#61): the company's back-office jobs, ranked by what needs the owner now.
// Pure: a job's status comes from stored rows only (pending or done approvals, rule-computed
// dates, the assistant's latest assessment); who does it is a plain line, not the ranking.
import { PLAYBOOKS } from "./catalog.js";
import { CONNECTION_KINDS, isHandled, type Assessment, type ConnectionKind } from "./core.js";
import { normAddress, STANDING_DEFAULTS, STANDING_KINDS, type ApprovalRow, type StandingRule } from "./mcp.js";
import { tallinnDate, type Obligation, type Source } from "./obligations.js";

export type Rung = "mine" | "other" | "prep" | "done";
/** What the owner should know about the job now, most urgent first. */
export const STATUSES = ["waiting", "overdue", "due_soon", "open", "not_checked", "later", "in_order"] as const;
export type Status = (typeof STATUSES)[number];
export type ConnectionState = "linked" | "file" | "not_linked" | "unknown";
export interface Job {
  id: string; title_et: string; title_en: string; kind: string | null;
  rung: Rung; ceiling: "rule" | "law"; status: Status;
  /** The kinds of connection the job needs; the owner's assistant reports which it can reach. */
  needs: ConnectionKind[];
  evidence: { done: number; auto: number; paid: number; last: string | null; pending: number; rule?: StandingRule };
  source: "playbook" | "assessment" | "approvals";
  /** The assistant's assessment behind the row: its reason, and who handles the job if handled. */
  assessed?: { reason: string; executor?: string; current?: "in_order" | "open" };
  /** The next rule-computed date for the job, if any, and the official source of its rule (#63 m6). */
  due: string | null; dueSource: Source | null;
}
export type NextStep =
  | { type: "standing"; job: Job; kind: string; recipients: { name: string; address: string }[]; capCents: number; basis: { count: number; maxCents: number } }
  | { type: "playbook"; job: Job; playbookId: string; obligation: Obligation | null }
  | { type: "connector" };
export interface Handover {
  jobs: Job[];
  /** Jobs per status. */
  count: Record<Status, number>;
  /** Every kind some job needs or the assistant reported, in CONNECTION_KINDS order. */
  connections: { kind: ConnectionKind; state: ConnectionState; service?: string }[];
  /** When the assistant last assessed: the time behind „in order” and the connections. */
  assessedAt: string | null;
  /** Done outcomes this Tallinn month; auto = approved by a standing rule. */
  month: { ym: string; done: number; auto: number };
  next: NextStep;
  findings: { expiredUnused: { count: number; last: ApprovalRow | null } };
  /** Jobs that came from the assistant's assessment (said out loud so a growing list never reads as regression). */
  fromAssessment: number;
}

/** Jobs Launchpad knows how to attribute. Playbook jobs apply by rule; invoicing appears when the assessment or an approval names it. */
const KNOWN = [
  ...PLAYBOOKS.filter((p) => p.approval_kind).map((p) => ({ id: p.id, kind: p.approval_kind as string, triggers: p.triggers, playbook: true })),
  { id: "invoicing", kind: "send_invoice", triggers: [] as string[], playbook: false },
];
export const JOB_TITLES: Record<string, [string, string]> = {
  "payment-reminder": ["Maksemeeldetuletused", "Payment reminders"],
  "vat-return-prep": ["KMD ettevalmistus", "VAT return (KMD)"],
  "annual-report": ["Majandusaasta aruanne", "Annual report"],
  invoicing: ["Arvete koostamine", "Invoicing"],
  "books-catch-up": ["Raamatupidamine korras", "Books brought up to date"],
  // No obligation trigger: the row appears only from a tagged approval or a matching assessment label.
  "customer-follow-ups": ["Kellele helistada", "Who to call"],
};
/** The connections each known job needs (playbook `needs`, by kind). */
const NEEDS: Record<string, ConnectionKind[]> = {
  "payment-reminder": ["accounting", "email"], invoicing: ["accounting", "email"], "books-catch-up": ["bank", "accounting"],
  "vat-return-prep": ["accounting"], "annual-report": ["accounting"], "customer-follow-ups": ["customers", "email"],
};
/** A rule date this close (days) makes the job due soon. */
const SOON_DAYS = 14;
/** The assistant's „in order” or „open” counts for this long after its assessment (ms). */
const FRESH_MS = 31 * 86_400_000;
export const DONE_OUTCOMES = ["sent", "submitted", "paid", "accepted", "posted"];
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

export function computeHandover(o: { assessment: Assessment | null; assessedAt?: string | null; obligations: Obligation[]; approvals: ApprovalRow[]; rules: StandingRule[]; now: Date }): Handover {
  const today = tallinnDate(o.now), ym = today.slice(0, 7), soon = tallinnDate(new Date(o.now.getTime() + SOON_DAYS * 86_400_000));
  const assessedAt = o.assessment ? o.assessedAt ?? null : null, fresh = !!assessedAt && o.now.getTime() - Date.parse(assessedAt) <= FRESH_MS;
  const live = o.rules.filter((r) => !r.revoked_at && Date.parse(r.expires_at) > o.now.getTime());
  const rows = (o.assessment?.responsibilities ?? []).filter((r) => r.applicability === "applicable" && !r.is_core);
  const byJob = new Map<string, ApprovalRow[]>();
  for (const a of o.approvals) { const j = jobOfApproval(a); if (j) byJob.set(j, [...(byJob.get(j) ?? []), a]); }

  const build = (id: string, kind: string | null, source: Job["source"], assessed: Job["assessed"], dueRow: Obligation | null, titles: [string, string]): Job => {
    // A pending row past its expiry waits for nobody (the app expires it on the next read).
    const mine = byJob.get(id) ?? [], done = mine.filter(isDone), pending = mine.filter((a) => a.state === "pending" && Date.parse(a.expires_at) > o.now.getTime()).length;
    const ceiling = kind && STANDING_KINDS.includes(kind) ? "rule" as const : "law" as const;
    // Deep green under a rule only once a live rule of this kind has approved a done outcome.
    const rule = ceiling === "rule" ? live.find((r) => r.kind === kind && done.some((a) => a.approved_by_rule === r.id)) : undefined;
    // Book entries need the owner's yes for every month, and each customer follow-up is approved one by one, so both stay at prep and never reach done under a rule (#96).
    const rung: Rung = done.length && kind !== "post_entries" && id !== "customer-follow-ups" && (rule || ceiling === "law") ? "done" : done.length ? "prep" : assessed?.executor ? "other" : "mine";
    const last = done.map((a) => a.consumed_at ?? "").sort().pop() || null, due = dueRow?.effective_due ?? null, current = fresh ? assessed?.current : undefined;
    // First match wins: the owner's yes, a missed date, done this month, a near date, the assistant's look, someone else, a far date.
    const status: Status = pending ? "waiting" : due && due < today ? "overdue" : last && tallinnDate(new Date(last)).startsWith(ym) ? "in_order"
      : due && due <= soon ? "due_soon" : current ?? (assessed?.executor ? "in_order" : due ? "later" : "not_checked");
    return { id, title_et: titles[0], title_en: titles[1], kind, rung, ceiling, status, needs: NEEDS[id] ?? [], source, due, dueSource: dueRow?.source ?? null, ...(assessed ? { assessed } : {}),
      evidence: { done: done.length, auto: done.filter((a) => a.approved_by_rule).length, paid: done.filter((a) => outcomeOf(a) === "paid").length, last, pending, ...(rule ? { rule } : {}) } };
  };
  const assessedOf = (r: (typeof rows)[number]) => ({ reason: r.reason, ...(isHandled(r) ? { executor: r.executor } : {}), ...(r.current_state ? { current: r.current_state } : {}) });

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
  jobs.sort((a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status));
  const reported = new Map((o.assessment?.connections ?? []).map((c) => [c.kind, c]));
  const kinds = CONNECTION_KINDS.filter((k) => reported.has(k) || jobs.some((j) => j.needs.includes(k)));

  const monthDone = o.approvals.filter((a) => isDone(a) && a.consumed_at && tallinnDate(new Date(a.consumed_at)).startsWith(ym));
  const expired = o.approvals.filter((a) => a.state === "expired" && a.decided_at).sort((a, b) => (a.decided_at! < b.decided_at! ? 1 : -1));
  return {
    jobs, count: Object.fromEntries(STATUSES.map((st) => [st, jobs.filter((j) => j.status === st).length])) as Record<Status, number>,
    connections: kinds.map((kind) => { const c = reported.get(kind); return c ? { kind, state: c.state, ...(c.service ? { service: c.service } : {}) } : { kind, state: "unknown" as const }; }),
    assessedAt,
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
  // Reminders first (they can reach the top rung), then filings by the soonest rule-computed date; a job already in order waits.
  const open = jobs.filter((j) => j.rung === "mine" && j.source === "playbook" && j.status !== "in_order")
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
