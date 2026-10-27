import { z } from "zod";
import { DOMAINS } from "./catalog.js";

export const s = (max: number) => z.string().min(1).max(max);
export const evidenceRefs = z.array(z.string().min(1).max(120).refine((v) => !/https?:\/\//i.test(v), "remote URLs are not accepted as evidence references")).max(8);

export const responsibilitySchema = z.object({
  id: s(60), domain: z.enum(DOMAINS), label: s(120),
  applicability: z.enum(["applicable", "not_applicable", "unresolved"]),
  is_core: z.boolean(),
  arrangement: z.enum(["assistant_assessed", "proposed", "none"]),
  reason: s(400), evidence_refs: evidenceRefs,
  // Required in practice to count as "handled" (see isHandled). Optional in the
  // schema so partial drafts can be saved, but a claim without these never counts.
  executor: s(200).optional(),
  access: s(300).optional(),
  success_criterion: s(300).optional(),
  next_checkpoint: s(200).optional(),
}).strict();
export type Responsibility = z.infer<typeof responsibilitySchema>;

/** Agent judgment only: an arrangement counts as handled only when the agent
 * names the actual executor, their access, the success criterion and the next
 * checkpoint. It is still NOT independently verified. */
export function isHandled(r: Responsibility): boolean {
  return r.arrangement === "assistant_assessed" && !!r.executor?.trim() && !!r.access?.trim() && !!r.success_criterion?.trim() && !!r.next_checkpoint?.trim();
}

export const assessmentSchema = z.object({
  assessed_domains: z.array(z.enum(DOMAINS)).max(5),
  responsibilities: z.array(responsibilitySchema).max(60),
  gaps: z.array(s(400)).max(20),
  conclusion: s(800),
  company_label: s(120).optional(),
  company_registry_ref: s(60).optional(),
  assumptions: z.array(s(400)).max(10).optional(),
  next_action: z.object({
    title: s(200), rationale: s(600),
    estimated_effort_saved: s(200).optional(),
    savings_basis: z.enum(["estimate", "observed", "unknown"]).optional(),
    uncertainty: s(400), needs_owner: z.boolean(),
  }).strict(),
}).strict().superRefine((a, ctx) => {
  const ids = new Set<string>();
  for (const r of a.responsibilities) {
    if (ids.has(r.id)) ctx.addIssue({ code: "custom", message: `Duplicate responsibility id '${r.id}'. Each responsibility may appear once; padding is rejected.` });
    ids.add(r.id);
  }
  if (new Set(a.assessed_domains).size !== a.assessed_domains.length) ctx.addIssue({ code: "custom", message: "Duplicate assessed_domains entries." });
});
export type Assessment = z.infer<typeof assessmentSchema>;

export interface Coverage {
  label: string; covered: number; denominator: number; percent: number | null;
  assessment_complete: boolean; agent_assessed_covered: number;
  independently_verified_outcomes: number; claimed_but_incomplete: number;
  assistant_assessed: number; unresolved: number; gaps: number;
  needs_owner: boolean; next_action: string; note: string;
}

const NOTE = "Coverage is your assistant's judgment: a responsibility counts only when the agent names the actual executor, their access, the success criterion and the next checkpoint. Independently verified outcomes stay separate — Launchpad has no verifier yet, so that count is 0. No manual ratification is required, and no AI-autonomy claim is made.";

/** Agent assessment and source verification are separate. */
export function computeCoverage(a: Assessment | null): Coverage {
  const empty: Coverage = { label: "Assessment not complete", covered: 0, denominator: 0, percent: null, assessment_complete: false, agent_assessed_covered: 0, independently_verified_outcomes: 0, claimed_but_incomplete: 0, assistant_assessed: 0, unresolved: 0, gaps: 0, needs_owner: true, next_action: "Ask your assistant to assess your business responsibilities.", note: NOTE };
  if (!a) return empty;
  const assessedAll = DOMAINS.every((d) => a.assessed_domains.includes(d));
  const rows = a.responsibilities;
  const A = rows.filter((r) => r.applicability === "applicable" && !r.is_core);
  // Unresolved applicability blocks completeness even when marked core: an
  // unresolved row cannot vanish from uncertainty by relabelling.
  const Uall = rows.filter((r) => r.applicability === "unresolved");
  const U = Uall.filter((r) => !r.is_core);
  const H = A.filter(isHandled);
  const incompleteClaims = A.filter((r) => r.arrangement === "assistant_assessed" && !isHandled(r));
  const denom = A.length + U.length;
  const complete = assessedAll && Uall.length === 0 && a.gaps.length === 0 && denom > 0;
  const percent = complete ? Math.round((H.length / denom) * 100) : null;
  const label = denom === 0
    ? "Assessment not complete — no applicable non-core responsibilities identified yet"
    : percent === 100
      ? "Your assistant assesses all listed non-core responsibilities as handled · assessed scope (not independently verified)"
      : percent != null
        ? `Your assistant assesses ${H.length} of ${denom} mapped responsibilities as handled`
        : `${H.length} of ${denom} mapped responsibilities assessed as handled; assessment incomplete`;
  return {
    label, covered: H.length, denominator: denom, percent, assessment_complete: complete,
    agent_assessed_covered: H.length, independently_verified_outcomes: 0,
    claimed_but_incomplete: incompleteClaims.length,
    assistant_assessed: incompleteClaims.length,
    unresolved: Uall.length, gaps: a.gaps.length,
    needs_owner: a.next_action.needs_owner || Uall.length > 0 || a.gaps.length > 0 || !assessedAll || denom === 0,
    next_action: a.next_action.title, note: NOTE,
  };
}
