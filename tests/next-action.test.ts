import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { FRAMEWORK } from "../src/catalog.js";
import { assessmentSchema, computeCoverage, nextActionError, type Assessment } from "../src/core.js";
import { openDb } from "../src/db.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";
import { tanaBody, type TanaOpts } from "../src/views.js";

const duty = (id: string, domain: Assessment["responsibilities"][number]["domain"], label: string, reason: string, extra: Partial<Assessment["responsibilities"][number]> = {}) =>
  ({ id, domain, label, applicability: "applicable" as const, is_core: false, arrangement: "none" as const, reason, evidence_refs: [] as string[], ...extra });

function assess(company: string, responsibilities: Assessment["responsibilities"], next: Assessment["next_action"], extra: Partial<Assessment> = {}): Assessment {
  return assessmentSchema.parse({
    assessed_domains: [...new Set(responsibilities.map((r) => r.domain))],
    company_label: company,
    responsibilities, gaps: [], conclusion: `${company}: synthetic assessment.`,
    next_action: next, ...extra,
  });
}

const NOW = new Date("2026-11-02T12:00:00Z");
function render(a: Assessment, lang: "et" | "en"): string {
  const opts: TanaOpts = {
    lang, csrf: "csrf-x", sample: false, label: a.company_label ?? "Synthetic",
    assessment: a, coverage: computeCoverage(a), assessedAt: "2026-10-28T10:00:00Z",
    exclusions: [], approvals: [], progress: [], deadlines: null, needs: [], reportCount: 1, now: NOW,
  };
  return tanaBody(opts);
}

function details(html: string, summary: string): string {
  const start = html.indexOf(`<summary>${summary}</summary>`);
  expect(start, summary).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</details>", start));
}

const bakery = assess("Synthetic bakery workshop", [
  duty("bread", "operations", "Baking", "The owner does this work.", { is_core: true }),
  duty("vat-return", "money", "VAT return due this week", "The filing date is this week.", { evidence_refs: ["calendar:vat-week"] }),
  duty("reminders", "customers", "Invoice reminders", "Useful later, after the filing.", {}),
], {
  kind: "action",
  title: "Prepare the VAT return due this week",
  rationale: "The filing is due this week, so it comes before automating reminders.",
  owner_decision: "Approve preparing the VAT figures you will file yourself.",
  alternatives: ["Automate invoice reminders", "Buy another invoicing tool"],
  uncertainty: "The tax amount comes from the books, not from this note.",
  needs_owner: true,
});

const kiosk = assess("Synthetic harbour kiosk", [
  duty("stall", "operations", "Winter opening hours", "Nobody has said which stall stays open."),
], {
  kind: "gather_information",
  title: "Ask which stall stays open in winter",
  rationale: "A reminder job is not justified until the season is known.",
  blocker: "No opening calendar is connected, so no action can be justified yet.",
  owner_decision: "Say which stall stays open after October.",
  alternatives: ["Connect the booking sheet", "Leave winter hours on paper"],
  uncertainty: "Winter hours were not in the assistant context.",
  needs_owner: true,
});

const studio = assess("Synthetic photo studio", [
  duty("books", "money", "Accounting connection", "The existing connection expired last month.", { evidence_refs: ["connection:accounting"] }),
], {
  title: "Renew the expired accounting connection",
  rationale: "Receipts pile up until the books that already exist can be read again.",
  owner_decision: "Grant the accounting program access again.",
  alternatives: ["Keep forwarding receipts by hand"],
  uncertainty: "The provider reconnect steps are not confirmed here.",
  savings_basis: "unknown",
  needs_owner: true,
});

const clinic = assess("Synthetic neighbourhood clinic", [
  duty("payroll", "people", "Payroll", "The accountant already runs payroll.", { arrangement: "assistant_assessed", executor: "The accountant", access: "Existing payroll access", success_criterion: "Monthly payroll is prepared", next_checkpoint: "Next payday" }),
], {
  title: "Keep payroll with the existing accountant",
  rationale: "A new payroll tool would add setup and would not remove the accountant work.",
  owner_decision: "Confirm payroll stays with the accountant.",
  alternatives: ["Add a payroll application", "Move payroll onto the owner"],
  estimated_effort_saved: "about 2 hours a month of setup avoided",
  savings_basis: "estimate",
  uncertainty: "Those hours are an estimate, not a measured baseline.",
  needs_owner: true,
});

const cases = [
  ["urgent filing before a convenient automation", bakery, false],
  ["incomplete context gathers information first", kiosk, true],
  ["a missing permission is the action", studio, false],
  ["keeping the existing arrangement beats a new tool", clinic, false],
] as const;

describe("R-001 next action", () => {
  test("the framework tells the assistant the new fields and rules", () => {
    expect(FRAMEWORK.version).toBe("assessment-framework/5");
    const text = FRAMEWORK.questions.join("\n");
    for (const phrase of ["gather_information", "owner_decision", "blocker", "savings_evidence", "urgent obligation"]) expect(text).toContain(phrase);
  });

  test("demo fixtures pass the write-time rules and name an owner decision", () => {
    for (const fixture of Object.values(DEMO_FIXTURES)) {
      expect(nextActionError(fixture)).toBeNull();
      expect(fixture.next_action.owner_decision).toMatch(/\(Näidis\.\)/);
    }
  });

  test.each(cases)("%s", (_name, assessment, gather) => {
    expect(nextActionError(assessment)).toBeNull();
    for (const lang of ["et", "en"] as const) {
      const html = render(assessment, lang);
      const hero = html.slice(0, html.indexOf("</section>"));
      expect(hero).not.toContain(assessment.next_action.title);
      expect(html).toContain(assessment.next_action.title);
      expect(html).toContain(assessment.next_action.rationale);
      expect(html).toContain(lang === "et" ? "Vajab sinu otsust:" : "Needs your decision:");
      expect(html).toContain(assessment.next_action.owner_decision!);
      const folded = details(html, lang === "et" ? "Muud võimalused ja ebakindlus" : "Alternatives and uncertainty");
      expect(folded).toContain(assessment.next_action.uncertainty);
      for (const alt of assessment.next_action.alternatives ?? []) {
        expect(folded).toContain(alt);
        expect(html.slice(0, html.indexOf("<details"))).not.toContain(alt);
      }
      if (gather) {
        expect(html).toContain(lang === "et" ? "Enne tuleb välja selgitada:" : "First find out:");
        expect(html).toContain(assessment.next_action.blocker!);
      }
      const prompt = details(html, lang === "et" ? "Mida assistendile öelda" : "What to tell your assistant");
      expect(prompt).toContain(assessment.next_action.owner_decision!);
      if (gather) expect(prompt).toContain(assessment.next_action.blocker!);
      else expect(prompt).not.toContain("First find out:");
    }
  });

  test("an estimate is labelled as an estimate and observed savings name their evidence", () => {
    const et = render(clinic, "et");
    expect(et).toContain('<span class="muted">Assistendi hinnang:</span> about 2 hours a month of setup avoided');
    expect(et).not.toContain("Mõõdetud sääst:");
    const observed = assess("Synthetic courier round", [duty("drops", "operations", "Delivery drops", "The same round every weekday.")], {
      title: "Hand the weekday round to the existing driver",
      rationale: "The driver already does the round.",
      owner_decision: "Confirm the driver keeps the weekday round.",
      alternatives: ["Hire a dispatch tool"],
      estimated_effort_saved: "4 hours in March",
      savings_basis: "observed",
      savings_evidence: "Baseline: owner did the round in February 2026; source: the driver paper log.",
      uncertainty: "April may differ.",
      needs_owner: true,
    });
    expect(nextActionError(observed)).toBeNull();
    for (const [lang, label, based] of [
      ["en", "Your assistant's measured savings:", "Based on:"],
      ["et", "Assistendi mõõdetud sääst:", "Mille põhjal:"],
    ] as const) {
      const html = render(observed, lang);
      const card = html.slice(0, html.indexOf("<details"));
      expect(card).toContain(`<span class="muted">${label}</span> 4 hours in March`);
      expect(card).toContain(`<span class="muted">${based}</span> Baseline: owner did the round in February 2026; source: the driver paper log.`);
      expect(html).not.toContain(lang === "en" ? "Your assistant's estimate:" : "Assistendi hinnang:");
      expect(html).not.toContain(lang === "en" ? "Observed savings:" : "Mõõdetud sääst:");
      expect(details(html, lang === "en" ? "Alternatives and uncertainty" : "Muud võimalused ja ebakindlus")).toContain("Baseline: owner did the round in February 2026");
    }
    const legacy = assess("Synthetic courier round", [duty("drops", "operations", "Delivery drops", "The same round every weekday.")], {
      title: "Hand the weekday round to the existing driver",
      rationale: "The driver already does the round.",
      owner_decision: "Confirm the driver keeps the weekday round.",
      estimated_effort_saved: "4 hours in March",
      savings_basis: "observed",
      uncertainty: "Stored before evidence was required.",
      needs_owner: true,
    });
    const legacyEn = render(legacy, "en");
    expect(legacyEn).toContain('<span class="muted">Your assistant\'s estimate:</span> 4 hours in March');
    expect(legacyEn).not.toContain("Your assistant's measured savings:");
    const legacyEt = render(legacy, "et");
    expect(legacyEt).toContain('<span class="muted">Assistendi hinnang:</span> 4 hours in March');
    expect(legacyEt).not.toContain("Mõõdetud sääst:");
  });

  test("assistant text in the new fields is escaped", () => {
    const evil = assess("Synthetic print shop", [duty("press", "operations", "Press time", "Still manual.")], {
      kind: "gather_information",
      title: `"><script>alert(1)</script>`,
      rationale: "x & y",
      blocker: "<b>blocked</b>",
      owner_decision: `say "yes" & continue`,
      alternatives: ["<img src=x>"],
      uncertainty: "none yet",
      needs_owner: true,
    });
    const html = render(evil, "en");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;blocked&lt;/b&gt;");
    expect(html).toContain("say &quot;yes&quot; &amp; continue");
    expect(details(html, "Alternatives and uncertainty")).toContain("&lt;img src=x&gt;");
  });

  test("an old next_action without the new fields still parses and renders", () => {
    const old = assessmentSchema.parse({
      assessed_domains: ["money"],
      responsibilities: [duty("invoicing", "money", "Invoicing", "Still typed by hand.")],
      gaps: [], conclusion: "Saved before the new fields.",
      next_action: { title: "Draft the next invoice", rationale: "It is still manual.", estimated_effort_saved: "5 h", savings_basis: "unknown", uncertainty: "No new fields on this row.", needs_owner: true },
    });
    expect(old.next_action.kind).toBeUndefined();
    expect(old.next_action.owner_decision).toBeUndefined();
    expect(old.next_action.blocker).toBeUndefined();
    const html = render(old, "en");
    expect(html).toContain("Draft the next invoice");
    expect(html).toContain("It is still manual.");
    expect(html).toContain('<span class="muted">Savings unknown:</span> 5 h');
    expect(html).not.toContain("Your assistant's estimate:");
    expect(html).toContain("No new fields on this row.");
  });

  test("write-time rules reject a bad next action and allow gather_information without a decision", () => {
    const ok = { title: "Do the filing", rationale: "It is due.", uncertainty: "Amount unknown.", needs_owner: false as const };
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, kind: "gather_information" }))).toMatch(/blocker is missing/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, kind: "gather_information", blocker: " " }))).toMatch(/blocker is missing/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, needs_owner: true }))).toMatch(/owner_decision is missing/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, needs_owner: true, owner_decision: " " }))).toMatch(/owner_decision is missing/);
    const gather = assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, kind: "gather_information", blocker: "The season is unknown.", needs_owner: true });
    expect(nextActionError(gather)).toBeNull();
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: "3 h" }))).toMatch(/savings_basis is not "estimate" or "observed"/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: "3 h", savings_basis: "unknown" }))).toMatch(/savings_basis is not "estimate" or "observed"/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: " ", savings_basis: "estimate" }))).toMatch(/savings_basis is not "estimate" or "observed"/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, savings_basis: "observed" }))).toMatch(/savings_evidence is missing/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, savings_basis: "observed", savings_evidence: " " }))).toMatch(/savings_evidence is missing/);
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: "3 h", savings_basis: "estimate" }))).toBeNull();
    expect(nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: "3 h", savings_basis: "observed", savings_evidence: "Log, March 2026, owner timesheet." }))).toBeNull();
    for (const message of [
      nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, kind: "gather_information" })),
      nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, needs_owner: true })),
      nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, estimated_effort_saved: "3 h" })),
      nextActionError(assess("Synthetic", [duty("job", "money", "Job", "Open.")], { ...ok, savings_basis: "observed" })),
    ]) expect(message).toMatch(/Nothing was saved\.$/);
    expect(() => assessmentSchema.parse({ ...bakery, next_action: { ...bakery.next_action, alternatives: ["a", "b", "c", "d"] } })).toThrow();
  });
});

describe("report_assessment rejects a next action that needs a decision", () => {
  let server: Server;
  let base = "";
  const cfg: Config = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app } = createApp(cfg, openDb(":memory:"));
  const parse = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

  beforeAll(async () => {
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    cfg.baseUrl = base;
  });
  afterAll(() => server.close());

  async function login(actor: string) {
    const page = await fetch(`${base}/login`);
    const preCookie = (page.headers.get("set-cookie") ?? "").split(";")[0];
    const html = await page.text();
    const preauth = /name="preauth" value="([^"]+)"/.exec(html)![1];
    const r = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: preCookie, origin: base }, body: `actor=${actor}&preauth=${preauth}`, redirect: "manual" });
    if (r.status !== 302) throw new Error(`demo login failed: ${r.status}`);
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  }
  async function csrf(cookie: string) {
    const html = await (await fetch(`${base}/connection`, { headers: { cookie } })).text();
    return /name="csrf" value="([^"]+)"/.exec(html)![1];
  }

  test("the tool returns an actionable error and saves nothing", async () => {
    const cookie = await login("alpha");
    const on = await fetch(`${base}/reporting`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}&enabled=1`, redirect: "manual" });
    expect(on.status).toBe(302);
    const issued = await fetch(`${base}/tokens`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}`, redirect: "manual" });
    const token = /<pre>(lp_[^<]+)<\/pre>/.exec(await issued.text())![1];
    const c = new Client({ name: "next-action", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    try {
      const before = parse(await c.callTool({ name: "get_progress", arguments: {} }));
      const next = { ...before.assessment.next_action };
      delete next.owner_decision;
      const saved = await c.callTool({ name: "report_assessment", arguments: { report_id: "missing-decision", expected_version: before.version, assessment: { ...before.assessment, next_action: next } } });
      expect(saved.isError).toBe(true);
      expect((saved.content[0] as { text: string }).text).toMatch(/owner_decision is missing[\s\S]*Nothing was saved\.$/);
      const after = parse(await c.callTool({ name: "get_progress", arguments: {} }));
      expect(after.version).toBe(before.version);
      expect(after.assessment.next_action.owner_decision).toBe(before.assessment.next_action.owner_decision);
    } finally { await c.close(); }
  });
});
