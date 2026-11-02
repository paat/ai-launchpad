// „Käest ära” (#61): the company's back-office jobs, ranked by what needs the owner now.
// Pure: a job's status comes from stored rows only (pending approvals or recorded outcomes, rule-computed
// dates, the assistant's latest assessment); who does it is a plain line, not the ranking.
import { PLAYBOOKS } from "./catalog.js";
import { CONNECTION_KINDS, isHandled, type Assessment, type ConnectionKind } from "./core.js";
import type { ApprovalRow } from "./mcp.js";
import { tallinnDate, type Obligation, type Source } from "./obligations.js";

export type Rung = "mine" | "other" | "done";
/** What the owner should know about the job now, most urgent first. */
export const STATUSES = ["waiting", "overdue", "due_soon", "open", "not_checked", "later", "in_order"] as const;
export type Status = (typeof STATUSES)[number];
export type ConnectionState = "linked" | "file" | "not_linked" | "unknown";
export interface Job {
  id: string; title_et: string; title_en: string; kind: string | null;
  rung: Rung; ceiling: "law" | null; status: Status;
  /** The kinds of connection the job needs; the owner's assistant reports which it can reach. */
  needs: ConnectionKind[];
  evidence: { done: number; paid: number; last: string | null; pending: number };
  source: "playbook" | "assessment" | "approvals";
  /** The assistant's assessment behind the row: its reason, and who handles the job if handled. */
  assessed?: { reason: string; executor?: string; current?: "in_order" | "open" };
  /** The next rule-computed date for the job, if any, and the official source of its rule (#63 m6). */
  due: string | null; dueSource: Source | null;
}
export type NextStep =
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
  /** Done outcomes this Tallinn month. */
  month: { ym: string; done: number };
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
/** The connections each known job needs (playbook `needs`, by kind). */
const NEEDS: Record<string, ConnectionKind[]> = {
  "payment-reminder": ["accounting", "email"], invoicing: ["accounting", "email"], "books-catch-up": ["bank", "accounting", "email"],
  "vat-return-prep": ["accounting"], "annual-report": ["accounting"], "customer-follow-ups": ["customers", "drive", "email"],
};
/** Jobs that go on: a recorded outcome is one step, never the whole job. */
const ONGOING = ["customer-follow-ups", "books-catch-up"];
/** A Tallinn calendar date plus whole days (no DST drift). */
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
/** A rule date this close (days) makes the job due soon. */
const SOON_DAYS = 14;
/** The assistant's „in order” or „open” counts for this long after its assessment (ms). */
const FRESH_MS = 31 * 86_400_000;
export const DONE_OUTCOMES = ["sent", "submitted", "paid", "accepted", "posted"];
const norm = (s: string) => s.trim().toLowerCase();
const payloadOf = (a: ApprovalRow): { kind?: string; recipient?: { name?: string; address?: string }; amount_cents?: number; summary?: string; document?: { title?: string } } => { try { return JSON.parse(a.payload_json); } catch { return {}; } };
const outcomeOf = (a: ApprovalRow): string | null => { try { return a.outcome_json ? (JSON.parse(a.outcome_json) as { outcome?: string }).outcome ?? null : null; } catch { return null; } };
// A recorded outcome counts whether or not the owner opted into approval.
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

export function computeHandover(o: { assessment: Assessment | null; assessedAt?: string | null; obligations: Obligation[]; approvals: ApprovalRow[]; now: Date }): Handover {
  const today = tallinnDate(o.now), ym = today.slice(0, 7), soon = addDays(today, SOON_DAYS);
  const assessedAt = o.assessment ? o.assessedAt ?? null : null, fresh = !!assessedAt && o.now.getTime() - Date.parse(assessedAt) <= FRESH_MS;
  const rows = (o.assessment?.responsibilities ?? []).filter((r) => r.applicability === "applicable" && !r.is_core);
  const byJob = new Map<string, ApprovalRow[]>();
  for (const a of o.approvals) { const j = jobOfApproval(a); if (j) byJob.set(j, [...(byJob.get(j) ?? []), a]); }

  const build = (id: string, kind: string | null, source: Job["source"], assessed: Job["assessed"], dueRow: Obligation | null, titles: [string, string]): Job => {
    // A pending row past its expiry waits for nobody (the app expires it on the next read).
    const mine = byJob.get(id) ?? [], done = mine.filter(isDone), pending = mine.filter((a) => a.state === "pending" && Date.parse(a.expires_at) > o.now.getTime()).length;
    const ceiling = kind === "prepare_filing" || kind === "prepare_payment" ? "law" as const : null;
    const rung: Rung = done.length ? "done" : assessed?.executor ? "other" : "mine";
    const last = done.map((a) => a.consumed_at ?? "").sort().pop() || null, due = dueRow?.effective_due ?? null;
    // The assistant's look counts only while fresh and newer than the last recorded outcome.
    const look = fresh && assessed?.current && (!last || assessedAt! > last) ? assessed.current : undefined;
    // One posted month or one follow-up never finishes an ongoing job.
    const doneThisMonth = !!last && !ONGOING.includes(id) && tallinnDate(new Date(last)).startsWith(ym);
    // First match wins, in the order of STATUSES: the owner's yes, a missed date, a near date, work the assistant saw, done this
    // month or a look that found nothing, a far date. Naming who does it (executor) is not a look, so it never reads as in order.
    const status: Status = pending ? "waiting" : due && due < today ? "overdue" : due && due <= soon ? "due_soon" : look === "open" ? "open"
      : doneThisMonth || look === "in_order" ? "in_order" : due ? "later" : "not_checked";
    const { current: _seen, ...said } = assessed ?? { reason: "" };
    return { id, title_et: titles[0], title_en: titles[1], kind, rung, ceiling, status, needs: NEEDS[id] ?? [], source, due, dueSource: dueRow?.source ?? null, ...(assessed ? { assessed: { ...said, ...(look ? { current: look } : {}) } } : {}),
      evidence: { done: done.length, paid: done.filter((a) => outcomeOf(a) === "paid").length, last, pending } };
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
    month: { ym, done: monthDone.length },
    next: nextStep(jobs, o.obligations.filter((x) => x.kind !== "risk" || definitelyOverdue(x, today))),
    findings: { expiredUnused: { count: expired.length, last: expired[0] ?? null } },
    fromAssessment: jobs.filter((j) => j.source === "assessment").length,
  };
}

/** Open playbook next-step order: payment reminders first, then the soonest due. Equal dues compare equal so the status order is kept (#153). */
export function byOpenPlaybookOrder(a: { id: string; due: string | null }, b: { id: string; due: string | null }): number {
  return a.id === "payment-reminder" ? -1 : b.id === "payment-reminder" ? 1 : (a.due ?? "9999") < (b.due ?? "9999") ? -1 : (a.due ?? "9999") > (b.due ?? "9999") ? 1 : 0;
}

/** One next step, first match wins: playbook prompt → connector. */
function nextStep(jobs: Job[], obligations: Obligation[]): NextStep {
  // Reminders first (they can reach the top rung), then the soonest rule-computed date. Equal dues keep the status order (#153). A job already in order waits.
  const open = jobs.filter((j) => j.rung === "mine" && j.source === "playbook" && j.status !== "in_order").sort(byOpenPlaybookOrder)[0];
  if (open) {
    const trig = PLAYBOOKS.find((p) => p.id === open.id)?.triggers ?? [];
    // No future date: the job is there because a trigger is already past (e.g. annual-report-overdue), so use the latest such row.
    const row = open.due ? obligations.find((x) => trig.includes(x.rule_id) && x.effective_due === open.due)
      : obligations.filter((x) => trig.includes(x.rule_id)).sort((a, b) => ((a.effective_due ?? "") < (b.effective_due ?? "") ? 1 : -1))[0];
    return { type: "playbook", job: open, playbookId: open.id, obligation: row ?? null };
  }
  return { type: "connector" };
}
