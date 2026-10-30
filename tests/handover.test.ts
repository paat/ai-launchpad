import { describe, expect, test } from "vitest";
import { computeHandover, jobOfApproval, type Handover } from "../src/handover.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import { computeObligations, type Obligation } from "../src/obligations.js";
import type { ApprovalRow, StandingRule } from "../src/mcp.js";
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
function appr(o: { kind?: string; state?: string; outcome?: string; to?: { name: string; address?: string }; cents?: number; at?: string; rule?: string; decided?: boolean; playbook?: string }): ApprovalRow {
  const kind = o.kind ?? "send_message", at = o.at ?? "2026-11-05T09:00:00Z", state = o.state ?? (o.outcome ? "consumed" : "pending");
  return { id: `appr_${++seq}`, kind, report_id: `r${seq}`, digest: "d".repeat(64), state, created_at: at, expires_at: "2026-11-30T00:00:00Z",
    decided_at: o.decided === false || state === "pending" ? null : at, consumed_at: state === "consumed" ? at : null,
    outcome_json: o.outcome ? JSON.stringify({ outcome: o.outcome, history: [] }) : null, approved_by_rule: o.rule ?? null, playbook_id: o.playbook ?? null,
    payload_json: JSON.stringify({ kind, recipient: o.to ?? CLIENTS[0], ...(o.cents ? { amount_cents: o.cents } : {}), document: { title: "x", content: "y" }, summary: "s" }) };
}
const rule = (over: Partial<StandingRule> = {}): StandingRule => ({ id: "rule_1", owner_id: "o", kind: "send_message", recipients_json: JSON.stringify(CLIENTS.map((c) => c.address)), max_amount_cents: 30_000, max_per_day: 10, expires_at: "2027-02-10T00:00:00Z", created_at: "2026-11-20T00:00:00Z", revoked_at: null, ...over });
const rungs = (h: Handover) => Object.fromEntries(h.jobs.map((j) => [j.id, j.rung]));
const html = (h: Handover) => handoverStrip(h, "et") + handoverSection(h, "et", "csrf-x", NOW);

const week2 = () => [
  appr({ outcome: "sent", cents: 12_000, to: CLIENTS[0] }), appr({ outcome: "paid", cents: 24_000, to: CLIENTS[1] }), appr({ outcome: "sent", cents: 18_000, to: CLIENTS[0] }),
  appr({ state: "pending", cents: 9_000, to: CLIENTS[1] }),
  appr({ state: "expired", cents: 15_000, to: CLIENTS[1], at: "2026-11-03T08:00:00Z" }),
];

describe("„Käest ära” states", () => {
  test("day 1: just connected, three playbook jobs all yours, next step is the payment-reminder prompt", () => {
    const h = computeHandover({ assessment: null, obligations, approvals: [], rules: [], now: NOW });
    expect([h.off, h.total]).toEqual([0, 3]);
    expect(h.jobs.map((j) => j.id)).toEqual(["payment-reminder", "vat-return-prep", "annual-report"]);
    expect(h.jobs.every((j) => j.rung === "mine")).toBe(true);
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    expect(h.month).toEqual({ ym: "2026-11", done: 0, auto: 0 });
    const page = html(h);
    expect(page).toContain('<b>Käest ära: <span class="num">0</span> tööd 3-st</b>'); expect(page).toContain('<span class="num">0</span> tööd 3-st on sinu käest ära');
    expect(page).toContain("Lase assistendil koostada esimene maksemeeldetuletus");
    expect(page).toContain('href="/kataloog?g=raamatupidamine"');
  });

  test("week 2: reminders mid green with a pending dot, KMD by the accountant, 2 of 4, standing offer from the 3 past approvals", () => {
    const h = computeHandover({ assessment: alpha, obligations, approvals: week2(), rules: [], now: NOW });
    expect([h.off, h.total]).toEqual([2, 4]);
    expect(rungs(h)).toEqual({ "payment-reminder": "prep", "vat-return-prep": "other", "annual-report": "mine", invoicing: "mine" });
    const reminders = h.jobs.find((j) => j.id === "payment-reminder")!;
    expect(reminders.evidence).toMatchObject({ done: 3, paid: 1, pending: 1, auto: 0 });
    expect(h.findings.expiredUnused.count).toBe(1);
    // Cap = the largest owner-approved amount (240 €) rounded up to the next 100 €; recipients = the owner-approved addresses.
    expect(h.next).toMatchObject({ type: "standing", kind: "send_message", capCents: 30_000, basis: { maxCents: 24_000 } });
    expect(h.next.type === "standing" && h.next.recipients.map((r) => r.address).sort()).toEqual(CLIENTS.map((c) => c.address).sort());
    expect(h.fromAssessment).toBe(1);
    const page = html(h);
    expect(page).toContain('<span class="num">2</span> tööd 4-st on sinu käest ära');
    expect(page).toContain("Teeb raamatupidaja");
    expect(page).toContain("1 kinnitus aegus kasutamata");
    expect(page).toContain('<input type="hidden" name="kind" value="send_message">');
    expect(page).toContain('name="max_eur" inputmode="decimal" autocomplete="off" value="300"');
    expect(page).toContain("ho-seg ho-seg--prep ho-seg--wait");
  });

  test("month 2: reminders deep green under a rule that fired, KMD at its legal ceiling, 7 done and 4 without you, next = invoices offer", () => {
    const invoices = [3, 5, 9].map((d, i) => appr({ kind: "send_invoice", outcome: "sent", cents: [98_000, 118_000, 64_000][i], to: { name: `Klient ${i} OÜ`, address: `arved${i}@klient.example` }, at: `2026-12-0${d}T09:00:00Z` }));
    const autos = [1, 4, 8, 15].map((d) => appr({ outcome: "sent", cents: 20_000, rule: "rule_1", at: `2026-12-${String(d).padStart(2, "0")}T07:40:00Z` }));
    const filed = appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "EMTA (e-MTA)" }, at: "2026-11-19T10:00:00Z", playbook: "vat-return-prep" });
    const now = new Date("2026-12-15T10:00:00Z");
    const h = computeHandover({ assessment: alpha, obligations, approvals: [...week2(), filed, ...invoices, ...autos], rules: [rule()], now });
    expect(rungs(h)).toEqual({ "payment-reminder": "done", "vat-return-prep": "done", invoicing: "prep", "annual-report": "mine" });
    expect([h.off, h.total, h.withoutYou]).toEqual([3, 4, 1]);
    expect(h.jobs.find((j) => j.id === "vat-return-prep")).toMatchObject({ ceiling: "law" });
    expect(h.jobs[0].evidence.rule?.id).toBe("rule_1");
    expect(h.month).toEqual({ ym: "2026-12", done: 7, auto: 4 });
    expect(h.next).toMatchObject({ type: "standing", kind: "send_invoice", capCents: 120_000 });
    const page = handoverSection(h, "et", "c", now);
    expect(page).toContain("Detsembris: <b>7</b> tööd tehtud, <b>4</b> ilma sinuta.");
    expect(page).toContain("Lagi käes: seadus");
    expect(page).toContain("Sinu püsiluba");
  });
});

describe("„Käest ära” honesty rules", () => {
  test("a live rule with zero fires stays mid green; only a fire by a live rule fills deep green", () => {
    const owned = [appr({ outcome: "sent", cents: 10_000 })];
    expect(rungs(computeHandover({ assessment: null, obligations: [], approvals: owned, rules: [rule()], now: NOW }))["payment-reminder"]).toBe("prep");
    // A fire by a revoked rule does not count for the top rung.
    const fired = [...owned, appr({ outcome: "sent", cents: 10_000, rule: "rule_1" })];
    expect(rungs(computeHandover({ assessment: null, obligations: [], approvals: fired, rules: [rule({ revoked_at: "2026-11-10T00:00:00Z" })], now: NOW }))["payment-reminder"]).toBe("prep");
    expect(rungs(computeHandover({ assessment: null, obligations: [], approvals: fired, rules: [rule()], now: NOW }))["payment-reminder"]).toBe("done");
  });

  test("pending, approved-but-unreported, failed and rejected approvals never fill a segment", () => {
    const approvals = [appr({ state: "pending" }), appr({ state: "approved" }), appr({ outcome: "failed" }), appr({ outcome: "rejected" }), appr({ kind: "prepare_filing", state: "pending", to: { name: "EMTA (e-MTA)" } })];
    const h = computeHandover({ assessment: null, obligations, approvals, rules: [rule()], now: NOW });
    expect(h.off).toBe(0);
    expect(h.jobs.every((j) => j.rung === "mine")).toBe(true);
    expect(h.jobs.find((j) => j.id === "payment-reminder")!.evidence.pending).toBe(1);
    expect(h.month.done).toBe(0);
  });

  test("filings never get a standing-rule offer: done filings sit at the legal ceiling and the next step moves on", () => {
    const filings = [appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "EMTA (e-MTA)" } }), appr({ kind: "prepare_filing", outcome: "submitted", to: { name: "Äriregister (e-äriregister)" } })];
    const h = computeHandover({ assessment: null, obligations, approvals: filings, rules: [], now: NOW });
    expect(rungs(h)).toMatchObject({ "vat-return-prep": "done", "annual-report": "done" });
    expect(h.next).toMatchObject({ type: "playbook", playbookId: "payment-reminder" });
    expect(handoverSection(h, "et", "c", NOW)).not.toContain('name="kind" value="prepare_filing"');
    // With every playbook job past "yours", the fallback is the connector, never a filing rule.
    const all = computeHandover({ assessment: null, obligations, approvals: [...filings, appr({ outcome: "sent", cents: 100, rule: "rule_1" })], rules: [rule()], now: NOW });
    expect(all.next.type).toBe("connector");
  });

  test("no percentage anywhere; assistant-assessment rows carry „Assistendi hinnang”", () => {
    for (const h of [computeHandover({ assessment: null, obligations, approvals: [], rules: [], now: NOW }), computeHandover({ assessment: alpha, obligations, approvals: week2(), rules: [], now: NOW })]) {
      const page = html(h) + handoverStrip(h, "en") + handoverSection(h, "en", "c", NOW);
      expect(page).not.toContain("%");
    }
    const page = handoverSection(computeHandover({ assessment: alpha, obligations, approvals: [], rules: [], now: NOW }), "et", "c", NOW);
    const rows = page.match(/<li class="ho-job">[^]*?<\/li>/g)!;
    for (const id of ["Arvete koostamine", "KMD ettevalmistus"]) expect(rows.find((r) => r.includes(id))).toContain("Assistendi hinnang");
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
  test("a live rule ending in 3 days is never offered as a renewal (review-design-t5-grok high)", () => {
    const soon = rule({ expires_at: new Date(NOW.getTime() + 3 * 86_400_000).toISOString() });
    const approvals = [appr({ outcome: "sent", cents: 10_000 }), appr({ outcome: "sent", cents: 10_000, rule: "rule_1" })];
    for (const a of [[], approvals]) {
      const h = computeHandover({ assessment: null, obligations, approvals: a, rules: [soon], now: NOW });
      expect(["standing", "playbook", "connector"]).toContain(h.next.type);
      expect(html(h)).not.toContain("Pikenda püsiluba");
    }
  });
});
