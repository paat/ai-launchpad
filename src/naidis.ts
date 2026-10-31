import { computeCoverage } from "./core.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "./fixtures.js";
import { computeHandover } from "./handover.js";
import type { ApprovalRow } from "./mcp.js";
import { computeObligations } from "./obligations.js";
import { activityBody, approvalCardBody, esc, handoverSection, tanaBody, tr, type DeadlinesView, type Lang } from "./views.js";

// One fixed, in-code walkthrough dataset. The public routes and browser checks
// render these same synthetic rows; none of them is loaded from a database.
export const NOW = new Date("2026-11-03T12:00:00Z");
export const mari = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
export const mariDeadlines: DeadlinesView = { company: { name: "Mari Disain OÜ", registry_code: "19990001", synthetic: true, provenance: "synthetic_fixture", label_et: "Näidis", label_en: "Sample", snapshot_id: null, as_of: null, sources: [], attribution: "" }, obligations: mari.obligations, facts_needed: mari.facts_needed };

// An 80-character document title on a consumed (sent) approval: the receipt and list must wrap it.
export const LONG_TITLE = "Maksemeeldetuletus: arve 2026-011 Kase Konsult OÜ tellitud strateegiaseminari eest";
export const longApproval: ApprovalRow = { id: "appr_long", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "consumed", created_at: "2026-11-03T09:00:00Z", expires_at: "2026-11-04T09:00:00Z", decided_at: "2026-11-03T09:05:00Z", consumed_at: "2026-11-03T09:10:00Z",
  outcome_json: JSON.stringify({ outcome: "sent", observed_at: "2026-11-03T09:10:00Z", history: [{ outcome: "sent", observed_at: "2026-11-03T09:10:00Z" }] }),
  payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10", document: { title: LONG_TITLE, content: "Tere!" }, summary: "Tasumata arve." }) };
// T2 ticket: a pending reminder with a real-length letter, and the same reminder approved.
export const reminder = { kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10",
  document: { title: "Maksemeeldetuletus: arve 2026-014", content: "Tere!\n\nMeie arve nr 2026-014 (20.10.2026) summas 240,00 € on veel tasumata; maksetähtaeg oli 20. oktoober. Palun tasuge see lähiajal. Kui olete juba maksnud, pidage see kiri tühjaks.\n\nAitäh,\nMari" },
  summary: "Demo Klient OÜ pole arvet tasunud; maksetähtaeg oli 20. oktoober." };
export const pendingApproval: ApprovalRow = { id: "appr_t2", kind: "send_message", report_id: "r2", digest: "e".repeat(64), state: "pending", created_at: "2026-11-03T11:50:00Z", expires_at: "2026-11-04T11:50:00Z", decided_at: null, consumed_at: null, outcome_json: null, payload_json: JSON.stringify(reminder) };
// #63 m7: a 40-line letter must not push the decision below the desktop fold.
export const longLetterApproval: ApprovalRow = { ...pendingApproval, id: "appr_long_letter", payload_json: JSON.stringify({ ...reminder, document: { ...reminder.document, content: Array.from({ length: 40 }, (_, i) => `Rida ${i + 1}: arve 2026-014 on veel tasumata.`).join("\n") } }) };
export const approvedApproval: ApprovalRow = { ...pendingApproval, state: "approved", decided_at: "2026-11-03T11:55:00Z" };
// T3: the prototype's Täna — demo company, one pending reminder, one prepared job, two deadlines.
export const demoAssessment = DEMO_FIXTURES.alpha;
export const twoDeadlines: DeadlinesView = { ...mariDeadlines, obligations: mari.obligations.slice(0, 2), facts_needed: [] };
// T5 „Käest ära”: Täna's strip from the same rows; Ühendus in week 2 (3 sent, 1 pending, 1 expired unused, the accountant on KMD).
export const tanaHandover = computeHandover({ assessment: demoAssessment, obligations: mari.obligations, approvals: [pendingApproval], rules: [], now: NOW });
export const sentTo = (i: number, name: string, address: string, cents: number): ApprovalRow => {
  const outcome = i === 2 ? "paid" : "sent", observed_at = `2026-11-0${i}T09:10:00Z`;
  return { ...pendingApproval, id: `appr_sent_${i}`, state: "consumed", decided_at: `2026-11-0${i}T09:00:00Z`, consumed_at: observed_at,
    outcome_json: JSON.stringify({ outcome, observed_at, history: [{ outcome, observed_at }] }), payload_json: JSON.stringify({ ...reminder, recipient: { name, address }, amount_cents: cents }) };
};
export const week2 = [sentTo(1, "Demo Klient OÜ", "arved@demo-klient.example", 12000), sentTo(2, "Põhja Puit OÜ", "raamat@pohja-puit.example", 24000), sentTo(3, "Demo Klient OÜ", "arved@demo-klient.example", 18000),
  pendingApproval, { ...pendingApproval, id: "appr_expired", state: "expired", decided_at: "2026-11-02T08:00:00Z", expires_at: "2026-11-03T08:00:00Z" }];
export const uhendaHandover = computeHandover({ assessment: demoAssessment, obligations: mari.obligations, approvals: week2, rules: [], now: NOW });
const syntheticApprovals = [longApproval, pendingApproval, longLetterApproval, approvedApproval, ...week2];
export const naidisApproval = (id: string) => syntheticApprovals.find((a) => a.id === id);

export const preparedProgress = [{ task_id: "vat-prep", milestone: "draft_prepared", observed_at: "2026-11-03T11:00:00Z" }];
export const NAIDIS = { NOW, mari, mariDeadlines, LONG_TITLE, longApproval, reminder, pendingApproval, longLetterApproval, approvedApproval, demoAssessment, twoDeadlines, tanaHandover, sentTo, week2, uhendaHandover, preparedProgress };

export type NaidisStep = "tana" | "kinnitus" | "tehtud";
const activityRows = [
  ...week2.filter((a) => a.state === "consumed").map((a) => ({ action: "record_action_outcome", actor: "assistant", outcome: "ok", created_at: a.consumed_at!, summary: `Outcome ${JSON.parse(a.outcome_json!).outcome as string} for approval ${a.id}.` })),
  { action: "report_progress", actor: "assistant", outcome: "ok", created_at: preparedProgress[0].observed_at, summary: "vat-prep: draft_prepared (assistant reported)." },
].sort((a, b) => b.created_at.localeCompare(a.created_at));

/** Owner destinations in the reused views become steps in this read-only walkthrough. */
function sampleLinks(html: string, lang: Lang): string {
  const linked = html
    .replace(/href="\/uhenda#kaest-ara"/g, 'href="/naidis/tehtud#kaest-ara"')
    .replace(/href="\/approvals\/([^"]+)"/g, (_all, id: string) => `href="/naidis/kinnitus/${id}"`)
    .replace(/href="\/approvals(?:[?#][^"]*)?"/g, 'href="/naidis/kinnitus"')
    .replace(/href="\/activity(?:[?#][^"]*)?"/g, 'href="/naidis/tehtud"')
    .replace(/href="\/(?:playbooks|connection|unmet-needs)(?:[/?#][^"]*)?"/g, 'href="/naidis"')
    .replace(/href="\/"/g, 'href="/naidis"');
  return lang === "en" ? linked.replace(/href="(\/naidis[^"]*)"/g, (_all, href: string) => {
    const hash = href.indexOf("#"), path = hash < 0 ? href : href.slice(0, hash), anchor = hash < 0 ? "" : href.slice(hash);
    return `href="${path}${path.includes("?") ? "&" : "?"}lang=en${anchor}"`;
  }) : linked;
}

export function naidisBody(step: NaidisStep, lang: Lang, approval = pendingApproval): string {
  const t = tr(lang);
  const body = step === "tana"
    ? tanaBody({ lang, csrf: "", sample: true, label: "Mari Disain OÜ (näidis)", assessment: demoAssessment, coverage: computeCoverage(demoAssessment), assessedAt: "2026-10-28T10:00:00Z", exclusions: [], approvals: week2, progress: preparedProgress, deadlines: twoDeadlines, needs: [], reportCount: 4, now: NOW, handover: uhendaHandover })
    : step === "kinnitus"
      ? approvalCardBody({ csrf: "", a: approval, lang, sample: true, now: NOW })
      : activityBody({ rows: activityRows, receipts: [], exclusions: [], assessment: demoAssessment, approvals: week2, rules: [], lang, now: NOW, sample: true })
        + approvalCardBody({ csrf: "", a: week2[0], lang, sample: true, now: NOW, handover: uhendaHandover })
        + handoverSection(uhendaHandover, lang, "", NOW, true);
  const steps = [
    ["tana", "/naidis", t("1. Täna", "1. Today")],
    ["kinnitus", "/naidis/kinnitus", t("2. Kinnitus", "2. Approval")],
    ["tehtud", "/naidis/tehtud", t("3. Tehtud", "3. Done")],
  ] as const;
  const note = step === "tana"
    ? t("Mis ootab sinult, mida assistent tegi ja mis on tulekul. Tähtajad arvutab reeglistik.", "What waits for you, what the assistant did and what is coming. Deadlines are calculated by rules.")
    : step === "kinnitus"
      ? t("Assistent küsib kinnitust täpselt sellele saajale, summale ja perioodile. Muudatus vajab uut kinnitust.", "The assistant asks you to approve exactly this recipient, amount and period. Any change needs a new approval.")
      : t("Iga toimingu kviitung ja see, mis on sinu käest ära.", "A receipt for every action and what is off your plate.");
  return `<section class="naidis-frame" aria-label="${esc(t("Näidise juhend", "Sample guide"))}">
<p class="naidis-banner">${esc(t("Näidis: väljamõeldud ettevõte Mari Disain OÜ. Siin ei saa midagi kinnitada ega saata. Päris tööruumis teeb seda sinu assistent ja kinnitad sina.", "Sample: the made-up company Mari Disain OÜ. Nothing can be approved or sent here. In a real workspace your assistant does this and you approve."))}</p>
<nav class="naidis-steps" aria-label="${esc(t("Näidise sammud", "Sample steps"))}">${steps.map(([key, href, label]) => `<a href="${href}${lang === "en" ? "?lang=en" : ""}"${key === step ? ' aria-current="page"' : ""}>${esc(label)}</a>`).join("")}</nav>
<p class="naidis-note">${esc(note)}</p></section>
<fieldset disabled class="naidis-ro">${sampleLinks(body, lang)}</fieldset>
${step === "tehtud" ? `<p class="naidis-cta"><a class="btn" href="/uhenda">${esc(t("Ühenda oma assistent", "Connect your assistant"))}</a></p>` : ""}`;
}
