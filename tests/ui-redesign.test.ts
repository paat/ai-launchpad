import { describe, expect, test } from "vitest";
import { shell, loginPage, statusBody, activityBody, connectionBody, setupBody } from "../src/views.js";
import { assessmentSchema, computeCoverage } from "../src/core.js";

// Pure view tests for the coherent mobile redesign. Browser geometry and
// interaction live in tests/ui-redesign.browser.mjs.
const assessment = assessmentSchema.parse({
  assessed_domains: ["money"],
  responsibilities: [
    { id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "none", reason: "Not arranged yet.", evidence_refs: [] },
    { id: "mystery", domain: "money", label: "Mystery duty", applicability: "unresolved", is_core: false, arrangement: "none", reason: "Unknown.", evidence_refs: [] },
  ],
  gaps: ["An urgent filing remains unassessed."],
  conclusion: "Partly mapped.",
  next_action: { title: "Check the urgent filing", rationale: "It may carry a deadline.", savings_basis: "unknown", uncertainty: "High.", needs_owner: true },
});
const status = (a = assessment) =>
  statusBody({ label: "Synthetic OÜ", demo: true, assessment: a, coverage: computeCoverage(a), assessedAt: "2026-10-28T10:00:00Z", exclusions: [], historyCount: 1, reportingEnabled: false });
const connection = (baseUrl = "https://launchpad.example.com") =>
  connectionBody({ csrf: "csrf-x", baseUrl, reportingEnabled: false, tokens: [], grants: [], candidates: [] });
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

describe("shell and login", () => {
  test("shell keeps one segmented nav, badge, logout POST+CSRF, no external assets", () => {
    const html = shell({ title: "Status", active: "status", badge: "Synthetic demo · mock data", csrf: "csrf-x", body: "<p>body</p>", demo: true });
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('<form method="post" action="/auth/logout">');
    expect(html).toContain('name="csrf" value="csrf-x"');
    expect(html).not.toMatch(/<link|<script src|@import|https?:\/\/[^"]*\.(css|woff2?|png|jpe?g)/i);
  });

  test("login leads with identity, keeps synthetic demo visibly separate and secondary", () => {
    const html = loginPage({ demo: true, google: true, preauth: "pre-1", companies: [{ key: "alpha", label: "Demo Plumbing OÜ (synthetic)" }] });
    expect(html.indexOf("Continue with Google")).toBeLessThan(html.indexOf("Try a synthetic business"));
    expect(html).toContain("Local synthetic demo");
    expect(html).toContain('<button type="submit" class="secondary">Open Demo Plumbing OÜ (synthetic)</button>');
    expect(html).toContain("does <strong>not</strong> prove you may act for a company");
  });
});

describe("status", () => {
  test("unknowns and gaps are in the main view, before any details element", () => {
    const html = status();
    const mainView = html.split("<details")[0];
    expect(mainView).toContain("Needs attention");
    expect(mainView).toContain("An urgent filing remains unassessed.");
    expect(mainView).toContain("1 item(s) still unresolved");
    expect(mainView).not.toMatch(/\d+%/); // incomplete assessment: no fake percentage
    expect(mainView).toContain("not independently checked");
    expect(mainView).toContain("Independently verified: 0");
  });

  test("one primary action: Copy next step; needs-owner is an amber pill", () => {
    const html = status();
    expect(html).toContain('id="copy-next"');
    expect(html).toContain('<span class="pill owner">Needs you</span>');
    expect((html.match(/<button type="button" id="copy-/g) ?? [])).toHaveLength(1);
  });

  test("no-assessment state has one primary connection action, limits collapsed", () => {
    const html = statusBody({ label: "Synthetic OÜ", demo: true, assessment: null, coverage: computeCoverage(null), assessedAt: null, exclusions: [], historyCount: 0, reportingEnabled: false });
    expect(html).toContain('<a class="btn" href="/connection">Connect your assistant</a>');
    expect(html.indexOf("Claude/ChatGPT remote connection remains unverified")).toBeGreaterThan(html.indexOf("Connection limits"));
    expect(html).toContain("setup helper</a> gives fixture guidance");
  });

  test("untrusted assessment text is escaped and never inline script", () => {
    const evil = assessmentSchema.parse({
      ...assessment,
      gaps: ["<svg onload=alert(1)>"],
      next_action: { ...assessment.next_action, title: '"><script>alert(2)</script>', rationale: "x & y" },
    });
    const html = status(evil);
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;svg");
    expect(scripts(html)).not.toContain("alert(");
  });
});

describe("connection redesign", () => {
  test("numbered steps: endpoint+copy before guides before first request", () => {
    const html = connection();
    const copy = html.indexOf("Copy MCP address");
    expect(html.indexOf("1 · Copy the address")).toBeLessThan(copy);
    expect(copy).toBeLessThan(html.indexOf("2 · Add it in your assistant"));
    expect(html.indexOf("2 · Add it in your assistant")).toBeLessThan(html.indexOf("3 · Send your first request"));
    expect(html.indexOf("3 · Send your first request")).toBeLessThan(html.indexOf("Progress sharing permission"));
  });

  test("guides are accessible tabs: exactly one panel unhidden in initial HTML", () => {
    const html = connection();
    expect(html).toContain('role="tab" id="tab-claude" aria-selected="true" aria-controls="guide-claude" tabindex="0"');
    expect(html).toContain('role="tab" id="tab-chatgpt" aria-selected="false" aria-controls="guide-chatgpt" tabindex="-1"');
    expect(html).toContain('id="guide-chatgpt" aria-labelledby="tab-chatgpt" hidden');
    expect(html).not.toContain('id="guide-claude" aria-labelledby="tab-claude" hidden');
    const js = scripts(html);
    expect(js).toContain("data-guide-tab");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
  });

  test("guide tabs implement ArrowLeft/Right + Home/End with roving tabindex", () => {
    const js = scripts(connection());
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) expect(js).toContain(key);
    expect(js).toContain("tabIndex=on?0:-1");
    expect(js).toContain('setAttribute("aria-selected",on?"true":"false")');
    expect(js).toContain("panel.hidden=!on");
    expect(js).toContain("btn.focus()");
    expect(js).toContain("keydown");
    expect(js).toContain("preventDefault()");
  });

  test("identity is one sentence; plan/OAuth detail is collapsed", () => {
    const html = connection();
    expect(html).toContain("Google sign-in identifies you; it does not connect your email or calendar, and it does not prove you may act for a company.");
    expect(html.indexOf("Screens and account availability vary")).toBeGreaterThan(html.indexOf("Connection details"));
  });

  test("local pending is a short notice; tunnel/localhost detail collapsed, no copy CTA", () => {
    const html = connection("http://localhost:3000");
    expect(html).toContain("<strong>Local setup pending.</strong>");
    expect(html).not.toContain("Copy MCP address");
    expect(html.indexOf("A secure tunnel could make")).toBeGreaterThan(html.indexOf("Why, and local development"));
  });

  test("sharing: read vs save stated visibly, mechanics in details, form preserved", () => {
    const html = connection();
    expect(html).toContain("Read access and saved reports are separate");
    expect(html.indexOf("Read access and saved reports are separate")).toBeLessThan(html.indexOf("<summary>How sharing works</summary>"));
    expect(html).toContain('<form method="post" action="/reporting">');
    expect(html).toContain("No manual ratification is required.");
  });
});

describe("activity and setup", () => {
  test("activity is a timeline with a concise limited-observation note", () => {
    const html = activityBody({ rows: [{ action: "report saved", actor: "assistant", outcome: "accepted", created_at: "2026-10-28", summary: "Synthetic" }], receipts: [], exclusions: [] });
    expect(html).toContain('class="card timeline"');
    expect(html).toContain("Not a complete audit trail");
    expect(html).toContain("labelled as such");
    expect(html).toContain("report saved");
  });

  test("setup helper stays temporary fixture guidance with its form intact", () => {
    const html = setupBody({ csrf: "csrf-x", result: null });
    expect(html).toContain("Setup helper (temporary)");
    expect(html).toContain("Fixture guidance");
    expect(html).toContain("No live model is called");
    expect(html).toContain('<form method="post" action="/setup">');
    expect(html).toContain('name="csrf" value="csrf-x"');
  });
});
