import { describe, expect, test } from "vitest";
import { byOpenPlaybookOrder, computeHandover, handoverObligations, jobOfApproval, type Handover } from "../src/handover.js";
import { arikratt } from "../src/arikratt.js";
import { openDb } from "../src/db.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import { computeObligations, type Obligation } from "../src/obligations.js";
import { companyObligations, type ApprovalRow } from "../src/mcp.js";
import { handoverSection, handoverStrip } from "../src/views.js";

// Synthetic traces for the three states in docs/design/progress/concept.md (Mari Disain OÜ, the alpha fixture).
const NOW = new Date("2026-11-12T10:00:00Z");
const alpha = DEMO_FIXTURES.alpha;
const kmd = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 }).obligations;
// The annual report is seasonal: its rule row stands in for the spring window.
const annual = { ...kmd[0], rule_id: "annual-report", effective_due: "2027-06-30", statutory_due: "2027-06-30" } as Obligation;
const obligations = [...kmd, annual];
const CLIENTS = [{ name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, { name: "Põhja Puit OÜ", address: "raamat@pohja-puit.example" }];

let seq = 0;
function appr(o: { kind?: string; state?: string; outcome?: string; to?: { name: string; address?: string }; cents?: number; at?: string; rule?: string; decided?: boolean; playbook?: string; title?: string; summary?: string }): ApprovalRow {
  const kind = o.kind ?? "send_message", at = o.at ?? "2026-11-05T09:00:00Z", state = o.state ?? (o.outcome ? "consumed" : "pending");
  return { id: `appr_${++seq}`, kind, report_id: `r${seq}`, digest: "d".repeat(64), state, created_at: at, expires_at: "2026-11-30T00:00:00Z",
    decided_at: o.decided === false || state === "pending" ? null : at, consumed_at: state === "consumed" ? at : null,
    outcome_json: o.outcome ? JSON.stringify({ outcome: o.outcome, history: [] }) : null, approved_by_rule: o.rule ?? null, playbook_id: o.playbook ?? null,
    payload_json: JSON.stringify({ kind, recipient: o.to ?? CLIENTS[0], ...(o.cents ? { amount_cents: o.cents } : {}), document: { title: o.title ?? "Meeldetuletus: tasumata arve", content: "y" }, summary: o.summary ?? "Payment reminder" }) };
}
const rungs = (h: Handover) => Object.fromEntries(h.jobs.map((j) => [j.id, j.rung]));
const statuses = (h: Handover) => Object.fromEntries(h.jobs.map((j) => [j.id, j.status]));
const html = (h: Handover) => handoverStrip(h, "et") + handoverSection(h, "et", NOW);

const week2 = () => [
  appr({ outcome: "sent", cents: 12_000, to: CLIENTS[0] }), appr({ outcome: "paid", cents: 24_000, to: CLIENTS[1] }), appr({ outcome: "sent", cents: 18_000, to: CLIENTS[0] }),
  appr({ state: "pending", cents: 9_000, to: CLIENTS[1] }),
  appr({ state: "expired", cents: 15_000, to: CLIENTS[1], at: "2026-11-03T08:00:00Z" }),
];

describe("„Käest ära” states", () => {
  test("day 1: just connected, three playbook jobs all yours, next step is the payment-reminder prompt", () => {
    const h = computeHandover({ assessment: null, obligations, approvals: [], now: NOW });
    // Ranked by what needs the owner: the KMD date is 8 days out, nobody has looked at reminders, the annual report is next June.
    expect(statuses(h)).toEqual({ "vat-return-prep": "due_soon", "payment-reminder": "not_checked", "annual-report": "later" });
    expect(h.jobs.map((j) => j.id)).toEqual(["vat-return-prep", "payment-reminder", "annual-report"]);
    expect(h.jobs.every((j) => j.rung === "mine")).toBe(true);
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    expect(h.month).toEqual({ ym: "2026-11", done: 0 });
    const page = html(h);
    expect(page).toContain("<b>Kontoritöö: 1 tähtaeg läheneb</b>"); expect(page).toContain('<p class="ho-sum">1 tähtaeg läheneb<small>1 kontrollimata · 1 hiljem</small></p>');
    // No connection reported yet: each job says what it needs, and the register is always reachable.
    expect(page).toContain("Vajab: raamatupidamine (teadmata), e-post (teadmata)");
    expect(page).toContain("Assistent pole veel öelnud, millega ta ühendatud on.");
    expect(page).toContain("Lase assistendil saata esimene maksemeeldetuletus");
    expect(page).toContain('href="/kataloog?g=raamatupidamine"');
  });

  test("week 2: reminders done with a pending approval, KMD by the accountant, next playbook prompt", () => {
    const h = computeHandover({ assessment: alpha, obligations, approvals: week2(), now: NOW });
    expect(statuses(h)).toEqual({ "payment-reminder": "waiting", "vat-return-prep": "due_soon", invoicing: "not_checked", "annual-report": "later" });
    expect(rungs(h)).toEqual({ "payment-reminder": "done", "vat-return-prep": "other", "annual-report": "mine", invoicing: "mine" });
    const reminders = h.jobs.find((j) => j.id === "payment-reminder")!;
    expect(reminders.evidence).toMatchObject({ done: 3, paid: 1, pending: 1 });
    expect(h.findings.expiredUnused.count).toBe(1);
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "annual-report" });
    // Invoicing is now backed by a playbook, so it counts as a playbook job, not fromAssessment.
    expect(h.fromAssessment).toBe(0);
    const page = html(h);
    expect(page).toContain('<p class="ho-sum">1 ootab sinu kinnitust<small>1 tähtaeg läheneb · 1 kontrollimata · 1 hiljem</small></p>');
    expect(page).toContain("Teeb raamatupidaja");
    expect(page).toContain("1 kinnitus aegus kasutamata");
    expect(page).toContain('<span class="ho-title">Maksemeeldetuletused</span><span class="state-chip state-chip--waiting">Ootab sinu kinnitust</span></div>');
  });

  test("month 2: reminders and invoices done, KMD at its legal ceiling, next = annual report", () => {
    const invoices = [3, 5, 9].map((d, i) => appr({ kind: "send_invoice", outcome: "sent", cents: [98_000, 118_000, 64_000][i], to: { name: `Klient ${i} OÜ`, address: `arved${i}@klient.example` }, at: `2026-12-0${d}T09:00:00Z` }));
    const autos = [1, 4, 8, 15].map((d) => appr({ outcome: "sent", cents: 20_000, rule: "rule_1", at: `2026-12-${String(d).padStart(2, "0")}T07:40:00Z` }));
    const filed = appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "EMTA (e-MTA)" }, at: "2026-11-19T10:00:00Z", playbook: "vat-return-prep" });
    const now = new Date("2026-12-15T10:00:00Z");
    const h = computeHandover({ assessment: alpha, obligations, approvals: [...week2(), filed, ...invoices, ...autos], now });
    expect(rungs(h)).toEqual({ "payment-reminder": "done", "vat-return-prep": "done", invoicing: "done", "annual-report": "mine" });
    // Done this month reads as in order; December's KMD is due in 6 days even though November's was filed.
    expect(statuses(h)).toEqual({ "vat-return-prep": "due_soon", "annual-report": "later", "payment-reminder": "in_order", invoicing: "in_order" });
    expect(h.jobs.find((j) => j.id === "vat-return-prep")).toMatchObject({ ceiling: "law" });
    expect(h.month).toEqual({ ym: "2026-12", done: 7 });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "annual-report" });
    const page = handoverSection(h, "et", now);
    expect(page).toContain("Detsembris: assistent lõpetas <b>7</b> tööd.");
    expect(page).toContain("Lagi: seadus");
  });
});

describe("Kontoritöö: what the assistant saw and can reach", () => {
  const seen = (current: "in_order" | "open") => ({ ...alpha, responsibilities: alpha.responsibilities.map((r) => (r.id === "invoicing" ? { ...r, current_state: current } : r)),
    connections: [{ kind: "accounting" as const, state: "linked" as const, service: "Merit Aktiva" }, { kind: "browser" as const, state: "not_linked" as const }] });

  test("a fresh „in order” from the assistant puts the job last; „open” ranks it above unchecked work; a stale one counts as not checked", () => {
    const fresh = computeHandover({ assessment: seen("in_order"), assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [], now: NOW });
    expect(fresh.jobs.at(-1)).toMatchObject({ id: "invoicing", status: "in_order" });
    const open = computeHandover({ assessment: seen("open"), assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [], now: NOW });
    expect(statuses(open)).toMatchObject({ invoicing: "open", "payment-reminder": "not_checked" });
    expect(open.jobs.findIndex((j) => j.id === "invoicing")).toBeLessThan(open.jobs.findIndex((j) => j.id === "payment-reminder"));
    const stale = computeHandover({ assessment: seen("in_order"), assessedAt: "2026-09-01T09:00:00Z", obligations, approvals: [], now: NOW });
    expect(statuses(stale).invoicing).toBe("not_checked");
    // A waiting approval or a near date still wins over the assistant's look.
    expect(statuses(computeHandover({ assessment: seen("in_order"), assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [appr({ state: "pending", kind: "send_invoice" })], now: NOW })).invoicing).toBe("waiting");
  });

  test("connections: reported kinds plus every kind a job needs, in fixed order; the page names the service and labels it as the assistant's report", () => {
    const h = computeHandover({ assessment: seen("open"), assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [], now: NOW });
    expect(h.connections).toEqual([{ kind: "accounting", state: "linked", service: "Merit Aktiva" }, { kind: "email", state: "unknown" }, { kind: "browser", state: "not_linked" }]);
    const page = handoverSection(h, "en", NOW);
    expect(page).toContain("<span>Accounting<small>Merit Aktiva</small></span>");
    expect(page).toContain("<span>Browser</span>");
    expect(page).toContain("<span>Business register<small>Ärikratt</small></span>");
    expect(page).toContain("Needs: accounting (linked), e-mail (not reported)");
    expect(page).toContain("As your assistant reported");
  });
});

describe("Kontoritöö: review-grok #127 fixes", () => {
  test("naming the accountant is not a look: KMD by the accountant reads later, not in order", () => {
    const h = computeHandover({ assessment: alpha, assessedAt: "2026-11-10T09:00:00Z", obligations: [annual], approvals: [], now: NOW });
    expect(h.jobs.find((j) => j.id === "vat-return-prep")?.status).not.toBe("in_order");
  });
  test("a newer look that found work beats a send earlier this month; one follow-up never finishes the list", () => {
    const sent = appr({ kind: "send_invoice", outcome: "sent", at: "2026-11-05T09:00:00Z" });
    const open = { ...alpha, responsibilities: alpha.responsibilities.map((r) => (r.id === "invoicing" ? { ...r, current_state: "open" as const } : r)) };
    expect(statuses(computeHandover({ assessment: open, assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [sent], now: NOW })).invoicing).toBe("open");
    expect(statuses(computeHandover({ assessment: open, assessedAt: "2026-11-01T09:00:00Z", obligations, approvals: [sent], now: NOW })).invoicing).toBe("in_order");
    const follow = appr({ outcome: "sent", playbook: "customer-follow-ups", title: "Järgmine kõne", summary: "Follow up" });
    expect(statuses(computeHandover({ assessment: null, obligations, approvals: [follow], now: NOW }))["customer-follow-ups"]).not.toBe("in_order");
  });
  test("a playbook job whose status came from the assistant's look says so; urgent counts below the headline stay visible", () => {
    const seen = { ...alpha, responsibilities: alpha.responsibilities.map((r) => (r.id === "payment-reminders" ? { ...r, current_state: "in_order" as const } : r)) };
    const h = computeHandover({ assessment: seen, assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [], now: NOW });
    const row = handoverSection(h, "et", NOW).match(/<li class="ho-job">[^]*?<\/li>/g)!.find((r) => r.includes("Maksemeeldetuletused"))!;
    expect(row).toContain("Korras"); expect(row).toContain("vaadatud"); expect(row).toContain("Assistendi hinnang");
    expect(handoverStrip(computeHandover({ assessment: null, obligations, approvals: [appr({ state: "pending" })], now: NOW }), "et")).toContain("1 tähtaeg läheneb");
  });
});

describe("Kontoritöö: review-grok #127 round 2", () => {
  const withState = (id: string, current: "in_order" | "open") => ({ ...alpha, responsibilities: alpha.responsibilities.map((r) => (r.id === id ? { ...r, current_state: current } : r)) });
  test("a near date beats the assistant's look and a filing earlier this month", () => {
    expect(statuses(computeHandover({ assessment: withState("vat-prep", "open"), assessedAt: "2026-11-10T09:00:00Z", obligations, approvals: [], now: NOW }))["vat-return-prep"]).toBe("due_soon");
    const filed = appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "EMTA (e-MTA)" }, at: "2026-11-05T10:00:00Z", playbook: "vat-return-prep" });
    expect(statuses(computeHandover({ assessment: null, obligations, approvals: [filed], now: NOW }))["vat-return-prep"]).toBe("due_soon");
  });
  test("an older look loses to a later send, also next month; one posted month is not the whole books job", () => {
    const sent = appr({ kind: "send_invoice", outcome: "sent", at: "2026-11-05T09:00:00Z" });
    const h = computeHandover({ assessment: withState("invoicing", "open"), assessedAt: "2026-11-01T09:00:00Z", obligations: [annual], approvals: [sent], now: new Date("2026-12-02T10:00:00Z") });
    expect(statuses(h).invoicing).toBe("not_checked");
    // The stale look is not quoted as the check behind the row.
    expect(handoverSection(h, "et", NOW).match(/<li class="ho-job">[^]*?<\/li>/g)!.find((r) => r.includes("Arvete koostamine"))).not.toContain("vaadatud");
    const posted = appr({ kind: "post_entries", outcome: "posted", to: { name: "Näidis OÜ, e-arveldaja" }, title: "Oktoober 2026", summary: "October entries" });
    expect(statuses(computeHandover({ assessment: null, obligations, approvals: [posted], now: NOW }))["books-catch-up"]).not.toBe("in_order");
  });
  test("work waiting is the headline when nothing is more urgent", () => {
    const h = computeHandover({ assessment: withState("invoicing", "open"), assessedAt: "2026-11-10T09:00:00Z", obligations: [annual], approvals: [], now: NOW });
    expect(handoverStrip(h, "et")).toContain("<b>Kontoritöö: 1 töö ootel</b>");
    expect(handoverStrip(h, "en")).not.toContain("No job is urgent");
  });
  test("with no urgent job the strip never claims nothing needs the owner (Täna also counts questions)", () => {
    const h = computeHandover({ assessment: null, obligations: [annual], approvals: [], now: NOW });
    expect(handoverStrip(h, "et")).toContain("<b>Kontoritöö: Ükski töö pole kiire</b>");
    expect(handoverStrip(h, "en")).toContain("Back office: No job is urgent");
    expect(handoverStrip(h, "en")).not.toContain("Nothing needs you");
  });
});

describe("„Käest ära” honesty rules", () => {
  test.each([
    ["send_message", "sent", "payment-reminder"],
    ["send_invoice", "sent", "invoicing"],
    ["post_entries", "posted", "books-catch-up"],
  ])("a recorded %s done outcome reaches done without a rule", (kind, outcome, job) => {
    const h = computeHandover({ assessment: null, obligations: [], approvals: [appr({ kind, outcome })], now: NOW });
    expect(h.jobs.find((j) => j.id === job)).toMatchObject({ rung: "done", ceiling: null, evidence: { done: 1 } });
  });

  test("pending, approved-but-unreported, failed and rejected approvals never fill a segment", () => {
    const approvals = [appr({ state: "pending" }), appr({ state: "approved" }), appr({ outcome: "failed" }), appr({ outcome: "rejected" }), appr({ kind: "prepare_filing", state: "pending", to: { name: "EMTA (e-MTA)" } })];
    const h = computeHandover({ assessment: null, obligations, approvals, now: NOW });
    expect(h.count.in_order).toBe(0);
    expect(h.jobs.find((j) => j.id === "payment-reminder")!.status).toBe("waiting");
    expect(h.jobs.every((j) => j.rung === "mine")).toBe(true);
    expect(h.jobs.find((j) => j.id === "payment-reminder")!.evidence.pending).toBe(1);
    expect(h.month.done).toBe(0);
  });

  test("done filings sit at the legal ceiling and the next step moves on", () => {
    const filings = [appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "EMTA (e-MTA)" } }), appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "Äriregister (e-äriregister)" } })];
    const h = computeHandover({ assessment: null, obligations, approvals: filings, now: NOW });
    expect(rungs(h)).toMatchObject({ "vat-return-prep": "done", "annual-report": "done" });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    expect(h.jobs.filter((j) => j.kind === "prepare_filing").every((j) => j.ceiling === "law")).toBe(true);
    // With every playbook job past "yours", the fallback is the connector, never a filing action.
    const all = computeHandover({ assessment: null, obligations, approvals: [...filings, appr({ outcome: "sent", cents: 100, rule: "rule_1" })], now: NOW });
    expect(all.next.type).toBe("connector");
  });

  test("no percentage anywhere; assistant-assessment rows carry „Assistendi hinnang”", () => {
    for (const h of [computeHandover({ assessment: null, obligations, approvals: [], now: NOW }), computeHandover({ assessment: alpha, obligations, approvals: week2(), now: NOW })]) {
      const page = html(h) + handoverStrip(h, "en") + handoverSection(h, "en", NOW);
      expect(page).not.toContain("%");
    }
    const page = handoverSection(computeHandover({ assessment: alpha, obligations, approvals: [], now: NOW }), "et", NOW);
    const rows = page.match(/<li class="ho-job">[^]*?<\/li>/g)!;
    // KMD ettevalmistus is assessed to accountant (rung: other), so it carries „Assistendi hinnang”.
    expect(rows.find((r) => r.includes("KMD ettevalmistus"))).toContain("Assistendi hinnang");
    // Arvete koostamine is now backed by a playbook, so it shows the assistant can prepare it rather than raw assessment text.
    expect(rows.find((r) => r.includes("Arvete koostamine"))).toContain("Assistent saab arve ette valmistada");
    // Non-playbook assessment rows (e.g. from beta) still carry „Assistendi hinnang”.
    const betaPage = handoverSection(computeHandover({ assessment: DEMO_FIXTURES.beta, obligations, approvals: [], now: NOW }), "et", NOW);
    expect(betaPage).toContain("Assistendi hinnang");
  });

  test("books-catch-up: a posted month reaches done and reads as posted, not filed", () => {
    const month = appr({ kind: "post_entries", outcome: "posted", cents: 45_320, to: { name: "Näidis OÜ, e-arveldaja" }, title: "Oktoober 2026", summary: "October entries" });
    expect(jobOfApproval(month)).toBe("books-catch-up");
    const h = computeHandover({ assessment: null, obligations, approvals: [month], now: NOW });
    expect(rungs(h)["books-catch-up"]).toBe("done");
    const row = handoverSection(h, "en", NOW).match(/<li class="ho-job">[^]*?<\/li>/g)!.find((r) => r.includes("Books brought up to date"))!;
    expect(row).toContain("Your assistant does it");
    expect(row).toContain("posted");
    expect(row).not.toMatch(/filed|ceiling: the law/i);
  });

  test("job attribution: playbook_id first, then kind plus the filing recipient", () => {
    expect(jobOfApproval(appr({ kind: "prepare_filing", to: { name: "Äriregister (e-äriregister)" } }))).toBe("annual-report");
    expect(jobOfApproval(appr({ kind: "prepare_filing", to: { name: "EMTA (e-MTA)" } }))).toBe("vat-return-prep");
    expect(jobOfApproval(appr({ kind: "prepare_filing", to: { name: "EMTA" }, playbook: "annual-report" }))).toBe("annual-report");
    expect(jobOfApproval(appr({ kind: "send_invoice" }))).toBe("invoicing");
    expect(jobOfApproval(appr({ kind: "prepare_payment" }))).toBeNull();
  });
});

describe("„Käest ära” fix cycle 1", () => {
  test("the Täna strip says how many approvals wait, visibly and in its accessible name (review-design-t5-grok medium)", () => {
    for (const approvals of [[appr({ state: "pending" })], [...week2()]]) {
      const strip = handoverStrip(computeHandover({ assessment: null, obligations, approvals, now: NOW }), "et");
      expect(strip.match(/aria-label="([^"]*)"/)![1]).toContain("1 ootab sinu kinnitust");
      expect(strip.match(/<b>([^<]*)<\/b>/)![1]).toContain("1 ootab sinu kinnitust");
    }
    expect(handoverStrip(computeHandover({ assessment: null, obligations, approvals: [], now: NOW }), "et")).not.toContain("ootab");
  });

  test("an overdue annual report is the next step with its own handoff, not the generic prompt (review-design-t5-grok medium)", () => {
    const late = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2027-07-05T10:00:00Z"), months: 2 }).obligations.find((x) => x.rule_id === "annual-report-overdue")!;
    const overdue = { ...late, effective_due: "2026-11-11", statutory_due: "2026-11-11" } as Obligation;
    // Reminders are already at the top rung: consumed under a live rule that has fired.
    const approvals = [appr({ outcome: "sent", cents: 10_000 }), appr({ outcome: "sent", cents: 10_000, rule: "rule_1" })];
    const h = computeHandover({ assessment: null, obligations: [overdue], approvals, now: NOW });
    expect(rungs(h)).toEqual({ "payment-reminder": "done", "annual-report": "mine" });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "annual-report", obligation: { rule_id: "annual-report-overdue" } });
    const page = handoverSection(h, "et", NOW);
    expect(page).toContain("Koosta mulle sammud hilinenud majandusaasta aruande esitamiseks.");
    expect(page).not.toContain("Valmista ette:");
  });
});

describe("„Käest ära” fix cycle 2", () => {
  test("the annual-report job is listed even when its due date is outside the Täna window (tribunal T-001)", async () => {
    const today = new Date("2026-10-31T10:00:00Z");
    const r = await companyObligations(arikratt(openDb(":memory:"), {}), { registryCode: "19990001", months: 2, today, cacheOnly: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.obligations.some((x) => x.rule_id === "annual-report")).toBe(false);
    const h = computeHandover({ assessment: null, obligations: handoverObligations(r), approvals: [], now: today });
    const job = h.jobs.find((j) => j.id === "annual-report");
    expect(job?.due).toBe("2027-06-30");
  });

  test("an overdue annual report binds the job: its date and handoff win over next year's deadline (#64)", () => {
    const late = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2027-07-05T10:00:00Z"), months: 2 }).obligations.find((x) => x.rule_id === "annual-report-overdue")!;
    const overdue = { ...late, effective_due: "2026-06-30", statutory_due: "2026-06-30" } as Obligation;
    const h = computeHandover({ assessment: null, obligations: [overdue, annual], approvals: [], now: NOW });
    const job = h.jobs.find((j) => j.id === "annual-report")!;
    expect(job.due).toBe("2026-06-30");
    const next = computeHandover({ assessment: null, obligations: [overdue, annual], approvals: [appr({ outcome: "sent" }), appr({ outcome: "sent", rule: "rule_1" })], now: NOW }).next;
    expect(next).toMatchObject({ type: "playbook", playbookId: "annual-report", obligation: { rule_id: "annual-report-overdue" } });
    const page = handoverSection(h, "et", NOW);
    expect(page).toContain("Tähtaeg oli 30. juuni");
    expect(page).not.toContain("Järgmine tähtaeg 30. juuni");
  });

  test("an untagged thank-you send fills no reminder segment (tribunal T-003)", () => {
    const thanks = appr({ outcome: "sent", cents: 90_000, to: { name: "Uus Klient OÜ", address: "info@uus-klient.example" }, title: "Aitäh koostöö eest", summary: "Thank-you note" });
    expect(jobOfApproval(thanks)).toBeNull();
    const alone = computeHandover({ assessment: null, obligations, approvals: [thanks], now: NOW });
    expect(rungs(alone)["payment-reminder"]).toBe("mine");
    expect(alone.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    // Only real reminders count toward the reminder job.
    const h = computeHandover({ assessment: null, obligations, approvals: [...week2(), thanks], now: NOW });
    expect(h.jobs.find((j) => j.id === "payment-reminder")!.evidence.done).toBe(3);
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "vat-return-prep" });
    for (const words of [{ title: "Võlg 120 €" }, { summary: "Overdue invoice 7" }, { title: "Tasumata arve nr 3" }, { summary: "unpaid" }])
      expect(jobOfApproval(appr({ outcome: "sent", ...words, ...("title" in words ? { summary: "x" } : { title: "x" }) }))).toBe("payment-reminder");
  });
});

describe("„Käest ära” fix cycle 3 (review-polish-grok)", () => {
  const reminded = () => [appr({ outcome: "sent" }), appr({ outcome: "sent", rule: "rule_1" })];
  test("a cold cache's conditional overdue row binds neither the annual-report date nor the next step (high)", async () => {
    const today = new Date("2026-10-31T10:00:00Z");
    const r = await companyObligations(arikratt(openDb(":memory:"), {}), { registryCode: "12345678", months: 2, today, cacheOnly: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.obligations.find((x) => x.rule_id === "annual-report-overdue")).toMatchObject({ applies: "if", effective_due: "2026-06-30" });
    const h = computeHandover({ assessment: null, obligations: handoverObligations(r), approvals: reminded(), now: today });
    expect(h.jobs.find((j) => j.id === "annual-report")?.due).toBe(r.annual_next?.effective_due);
    expect(h.next.type === "playbook" && h.next.obligation?.rule_id).not.toBe("annual-report-overdue");
    expect(handoverSection(h, "et", today)).not.toContain("Tähtaeg oli");
    // Without next year's row the job stays listed, but the conditional overdue handoff is still not the next step.
    const alone = computeHandover({ assessment: null, obligations: r.result.obligations.filter((x) => x.rule_id === "annual-report-overdue"), approvals: reminded(), now: today });
    expect(alone.next).toMatchObject({ type: "playbook", playbookId: "annual-report", obligation: null });
  });

  test("a definite overdue row binds the job and its past date carries the year (high)", () => {
    const late = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2027-07-05T10:00:00Z"), months: 2 }).obligations.find((x) => x.rule_id === "annual-report-overdue")!;
    const overdue = { ...late, applies: "yes", effective_due: "2026-06-30", statutory_due: "2026-06-30" } as Obligation;
    const h = computeHandover({ assessment: null, obligations: [overdue, annual], approvals: reminded(), now: NOW });
    expect(h.jobs.find((j) => j.id === "annual-report")?.due).toBe("2026-06-30");
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "annual-report", obligation: { rule_id: "annual-report-overdue" } });
    expect(handoverSection(h, "et", NOW)).toContain("Tähtaeg oli 30. juuni 2026");
    expect(handoverSection(h, "en", NOW)).toContain("Was due 30 Jun 2026");
  });
});

describe("customer follow-up done outcomes", () => {
  test("a recorded follow-up reaches done independently of payment reminders", () => {
    const follow = appr({ outcome: "sent", playbook: "customer-follow-ups", to: { name: "Pakkumine OÜ", address: "info@pakkumine.example" }, title: "Järgmine kõne", summary: "Follow up on the quote" });
    expect(jobOfApproval(follow)).toBe("customer-follow-ups");
    const h = computeHandover({ assessment: null, obligations, approvals: [follow], now: NOW });
    expect(rungs(h)).toMatchObject({ "payment-reminder": "mine", "customer-follow-ups": "done" });
    expect(h.jobs.find((j) => j.id === "customer-follow-ups")).toMatchObject({ ceiling: null, status: "not_checked", evidence: { done: 1 } });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
  });
});

describe("customer follow-ups next step (tribunal T-004, #96)", () => {
  const nextCard = (page: string) => {
    const start = page.indexOf('<div class="ho-next">');
    return page.slice(start, page.indexOf("</div></div>", start) + "</div></div>".length);
  };
  const fired = () => appr({ outcome: "sent", cents: 10_000, rule: "rule_1" });

  test("the follow-up card asks who to call or message, in ET and EN, with no filing or invoice copy", () => {
    const pending = appr({ state: "pending", playbook: "customer-follow-ups", to: { name: "Pakkumine OÜ", address: "info@pakkumine.example" }, title: "Järgmine kõne", summary: "Follow up on the quote" });
    const h = computeHandover({ assessment: null, obligations: [], approvals: [fired(), pending], now: NOW });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "customer-follow-ups", obligation: null, job: { kind: "send_message" } });
    const et = nextCard(handoverSection(h, "et", NOW));
    const en = nextCard(handoverSection(h, "en", NOW));
    expect(et).toContain("Lase assistendil öelda, kellele sel nädalal helistada või kirjutada");
    expect(et).toContain("„Kellele peaksin sel nädalal helistama või kirjutama?”");
    expect(et).toContain('href="/kataloog?g=kliendid"');
    expect(et).toContain("Ühenda oma kliendinimekiri → Kataloog");
    expect(en).toContain('href="/kataloog?g=kliendid"');
    expect(en).toContain("Link your customer list → Catalogue");
    expect(et).not.toContain("/kataloog?g=raamatupidamine");
    expect(en).not.toContain("/kataloog?g=raamatupidamine");
    expect(et).toContain("Loeb sinu kliendinimekirja või Kliendid lehte ning salvestab iga saadetud sõnumi.");
    expect(en).toContain("Let your assistant tell you who to call or message this week");
    expect(en).toContain("„Who should I call or message this week?”");
    expect(en).toContain("It reads your customer list or the Kliendid sheet and records every sent message.");
    for (const card of [et, en]) {
      expect(card).not.toMatch(/arve|esitan|esita|invoice|file/i);
      expect(card).not.toContain("Valmista ette:");
      expect(card).not.toContain("Prepare:");
    }
  });

  test("payment-reminder, obligation and post_entries cards keep their copy", () => {
    const reminder = computeHandover({ assessment: null, obligations, approvals: [], now: NOW });
    expect(reminder.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    const reminderEt = nextCard(handoverSection(reminder, "et", NOW));
    const reminderEn = nextCard(handoverSection(reminder, "en", NOW));
    expect(reminderEt).toContain("Lase assistendil saata esimene maksemeeldetuletus");
    expect(reminderEt).toContain("Vaata, millised minu arved on tasumata, ja saada esimesele meeldetuletus. Salvesta tulemus.");
    expect(reminderEt).toContain("Vajab tasumata arveid: sinu raamatupidamisprogrammi ühendust või faili, mille assistendile jagad.");
    expect(reminderEt).not.toContain("ainus igakuine töö");
    expect(reminderEn).toContain("Let your assistant send the first payment reminder");
    expect(reminderEn).toContain("Check which of my invoices are unpaid and send a reminder for the first one. Record the outcome.");
    expect(reminderEn).toContain("It needs your unpaid invoices: your accounting connector or a file you share with your assistant.");
    expect(reminderEn).not.toContain("the only monthly job");

    const late = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2027-07-05T10:00:00Z"), months: 2 }).obligations.find((x) => x.rule_id === "annual-report-overdue")!;
    const overdue = { ...late, effective_due: "2026-11-11", statutory_due: "2026-11-11" } as Obligation;
    const obligation = computeHandover({ assessment: null, obligations: [overdue], approvals: [appr({ outcome: "sent", cents: 10_000 }), fired()], now: NOW });
    expect(obligation.next).toMatchObject({ type: "playbook", playbookId: "annual-report", obligation: { rule_id: "annual-report-overdue" } });
    const obligationEt = nextCard(handoverSection(obligation, "et", NOW));
    const obligationEn = nextCard(handoverSection(obligation, "en", NOW));
    expect(obligationEt).toContain("Lase assistendil ette valmistada: Majandusaasta aruanne");
    expect(obligationEt).toContain("Koosta mulle sammud hilinenud majandusaasta aruande esitamiseks.");
    expect(obligationEt).toContain("Vajab kuu arveid: sinu raamatupidamisprogrammi ühendust või faile, mille assistendile jagad.");
    expect(obligationEn).toContain("Let your assistant prepare: Annual report");
    expect(obligationEn).toContain("Lay out the steps for me to file the overdue annual report.");
    expect(obligationEn).toContain("It needs the period&#39;s invoices: your accounting connector or files you share with your assistant.");

    const posted = appr({ kind: "post_entries", state: "pending", cents: 45_320, to: { name: "Näidis OÜ, e-arveldaja" }, title: "Oktoober 2026", summary: "October entries" });
    const books = computeHandover({ assessment: null, obligations: [], approvals: [fired(), posted], now: NOW });
    expect(books.next).toMatchObject({ type: "playbook", playbookId: "books-catch-up", obligation: null, job: { kind: "post_entries" } });
    const booksEt = nextCard(handoverSection(books, "et", NOW));
    const booksEn = nextCard(handoverSection(books, "en", NOW));
    expect(booksEt).toContain("Lase assistendil ette valmistada: Raamatupidamine korras");
    expect(booksEt).toContain("Kirjenda: Raamatupidamine korras. Salvesta iga kuu tulemus.");
    expect(booksEt).toContain("Vajab iga kuu pangaliikumisi (LHV ühendus või pangast alla laaditud väljavõte) ja sinu raamatupidamisprogrammi ühendust. Iga kuu kirjendamine salvestatakse.");
    expect(booksEn).toContain("Let your assistant prepare: Books brought up to date");
    expect(booksEn).toContain("Post: Books brought up to date. Record each month&#39;s outcome.");
    expect(booksEn).toContain("It needs each month&#39;s bank movements (your LHV connector or a statement you download from your bank) and your accounting connector. Each month&#39;s posting is recorded.");
    for (const card of [reminderEt, reminderEn, obligationEt, obligationEn, booksEt, booksEn]) {
      expect(card).not.toContain("Lase assistendil öelda, kellele sel nädalal helistada või kirjutada");
      expect(card).not.toContain("Let your assistant tell you who to call or message this week");
      expect(card).toContain('href="/kataloog?g=raamatupidamine"');
      expect(card).not.toContain("/kataloog?g=kliendid");
    }
  });

  test("equal dues keep status order: a waiting follow-up stays ahead of invoicing (#153)", () => {
    const pending = appr({ state: "pending", playbook: "customer-follow-ups", to: { name: "Pakkumine OÜ", address: "info@pakkumine.example" }, title: "Järgmine kõne", summary: "Follow up on the quote" });
    const h = computeHandover({ assessment: alpha, obligations: [], approvals: [fired(), pending], now: NOW });
    const open = h.jobs.filter((j) => j.rung === "mine" && j.source === "playbook" && j.status !== "in_order");
    expect(open.map((j) => [j.id, j.status, j.due])).toEqual([
      ["customer-follow-ups", "waiting", null],
      ["invoicing", "not_checked", null],
    ]);
    // The job that must win is already first. Equal null dues compare equal; the old comparator returned 1 (#153).
    expect(byOpenPlaybookOrder(open[0]!, open[1]!)).toBe(0);
    expect(byOpenPlaybookOrder(open[1]!, open[0]!)).toBe(0);
    const reminder = h.jobs.find((j) => j.id === "payment-reminder")!;
    expect(reminder.status).toBe("in_order");
    expect([open[1]!, reminder].sort(byOpenPlaybookOrder).map((j) => j.id)).toEqual(["payment-reminder", "invoicing"]);
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "customer-follow-ups" });
    expect(h.next).not.toMatchObject({ playbookId: "invoicing" });
  });

  test("invoicing next step: tailored prompt and description, no filing fallback (#120)", () => {
    const h = computeHandover({ assessment: alpha, obligations: [], approvals: [fired()], now: NOW });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "invoicing", obligation: null, job: { kind: "send_invoice" } });
    const et = nextCard(handoverSection(h, "et", NOW));
    const en = nextCard(handoverSection(h, "en", NOW));
    expect(et).toContain("Koosta ja saada järgmine arve. Salvesta tulemus.");
    expect(et).toContain("Vajab sinu raamatupidamisprogrammi ühendust (arve ja PDF) ja sinu e-posti. Saatmise tulemus salvestatakse.");
    expect(et).not.toContain("kinnitust enne, kui midagi esitan");
    expect(en).toContain("Create and send the next invoice. Record the outcome.");
    expect(en).toContain("It needs your accounting connector (the invoice and its PDF) and your e-mail. The send outcome is recorded.");
    expect(en).not.toContain("file anything");
  });

  test("invoicing appearance rule: an owner with no invoicing assessment row and no send_invoice approval has no invoicing job (#120)", () => {
    // 1. No assessment, no approvals: three baseline jobs, no invoicing.
    const h1 = computeHandover({ assessment: null, obligations, approvals: [], now: NOW });
    expect(h1.jobs.some((j) => j.id === "invoicing")).toBe(false);

    // 2. Assessment without invoicing (e.g. beta: payroll, bookkeeping-access, consulting): no invoicing job.
    const hBeta = computeHandover({ assessment: DEMO_FIXTURES.beta, obligations, approvals: [], now: NOW });
    expect(hBeta.jobs.some((j) => j.id === "invoicing")).toBe(false);

    // 3. Invoicing appears when an assessment responsibility names it.
    const hAlpha = computeHandover({ assessment: alpha, obligations, approvals: [], now: NOW });
    expect(hAlpha.jobs.some((j) => j.id === "invoicing")).toBe(true);

    // 4. Invoicing appears when an approval with kind send_invoice exists, even with no assessment.
    const invoiceAppr = appr({ kind: "send_invoice", outcome: "sent", cents: 50_000, to: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" } });
    const hAppr = computeHandover({ assessment: null, obligations, approvals: [invoiceAppr], now: NOW });
    expect(hAppr.jobs.some((j) => j.id === "invoicing")).toBe(true);
  });
});
