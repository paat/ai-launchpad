import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";
import { esc, shell, loginBody, tanaBody, deadlinesList, approvalsListBody, activityBody, connectionBody, setupBody, landingBody, connectBody, assistantGuidePrompt, approvalCardBody, fmtEur, fmtDeadline, deadlineParts, fmtPeriod, fmtWhen, jobCardAfterScroll, type TanaOpts } from "../src/views.js";
import { computeObligations } from "../src/obligations.js";
import { SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import type { ApprovalRow, StandingRule } from "../src/mcp.js";
import { assessmentSchema, computeCoverage } from "../src/core.js";
import { computeHandover } from "../src/handover.js";

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
const NOW = new Date("2026-11-03T12:00:00Z");
const mari = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
const mariDeadlines = { company: { name: "Mari Disain OÜ", registry_code: "19990001", synthetic: true, provenance: "synthetic_fixture" as const, label_et: "Näidis · väljamõeldud ettevõte", label_en: "Sample · made-up company", snapshot_id: null, as_of: null, sources: [], attribution: "Synthetic fixture; no real register data." }, obligations: mari.obligations, facts_needed: mari.facts_needed };
const approval = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({ id: "appr_1", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "pending", created_at: "2026-11-03T12:31:00Z", expires_at: "2026-11-04T12:31:00Z", decided_at: null, consumed_at: null, outcome_json: null,
  payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10", document: { title: "Maksemeeldetuletus: arve 2026-014", content: "Tere!\n\nArve 2026-014 on tasumata." }, summary: "Demo Klient OÜ pole arvet tasunud." }), ...over });
const tana = (over: Partial<TanaOpts> = {}) => tanaBody({ lang: "et", csrf: "csrf-x", sample: true, label: "Synthetic OÜ", assessment, coverage: computeCoverage(assessment), assessedAt: "2026-10-28T10:00:00Z", exclusions: [], approvals: [], progress: [], deadlines: null, needs: [], reportCount: 2, now: NOW, ...over });
const status = (a = assessment) => tana({ assessment: a, coverage: computeCoverage(a) });
const connection = (baseUrl = "https://launchpad.example.com") =>
  connectionBody({ lang: "en", csrf: "csrf-x", baseUrl, reportingEnabled: false, tokens: [], grants: [], candidates: [] });
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

describe("shell, locale and login", () => {
  test("owner shell: one segmented nav Täna · Tehtud · Ühendus, logout POST+CSRF, html lang, no external assets", () => {
    const html = shell({ title: "Täna", active: "tana", csrf: "csrf-x", body: "<p>body</p>", sample: true });
    expect(html).toContain('<html lang="et">');
    expect(html).toMatch(/<nav class="main" aria-label="Peamenüü"><a href="\/" aria-current="page">Täna<\/a><a href="\/activity">Tehtud<\/a><a href="\/uhenda">Ühendus<\/a><\/nav>/);
    expect(html).toContain('<form method="post" action="/auth/logout">');
    expect(html).toContain('name="csrf" value="csrf-x"');
    expect(html).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
    expect(html).toContain('hreflang="en" lang="en">EN');
    expect(html).not.toMatch(/<link|<script|@import|https?:\/\/[^"]*\.(css|woff2?|png|jpe?g)/i);
    const en = shell({ title: "Today", active: "tana", csrf: "csrf-x", body: "<p>x</p>", lang: "en", toggle: "/?lang=et" });
    expect(en).toContain('<html lang="en">'); expect(en).toContain(">Today</a>"); expect(en).toContain('href="/?lang=et" hreflang="et" lang="et">ET');
    // English-only owner pages declare their language inside an Estonian shell.
    expect(shell({ title: "C", active: "none", csrf: "c", body: "<p>English</p>", bodyLang: "en" })).toContain('<div lang="en"><p>English</p></div>');
  });

  test("a sample owner page carries exactly one Näidis marker, in the bar above the content", () => {
    const html = shell({ title: "Kinnitus", active: "none", csrf: "csrf-x", body: approvalCardBody({ csrf: "csrf-x", a: approval(), lang: "et", sample: true, now: NOW }), sample: true });
    expect(html.match(/class="label-chip label-chip--sample"/g)).toHaveLength(1);
    expect(html).toMatch(/<p class="sample-bar"><span class="label-chip label-chip--sample">Näidis<\/span>[^]*<\/p>\n<main>/);
    expect(html).toContain('<a class="brand" href="/">');
    expect(shell({ title: "Täna", active: "tana", csrf: "csrf-x", body: "<p>x</p>" })).not.toContain('class="sample-bar"');
    // Täna with a synthetic company: the bar is the only marker; Tulekul keeps its source line.
    const tanaPage = shell({ title: "Täna", active: "tana", csrf: "csrf-x", body: tana({ deadlines: mariDeadlines, approvals: [approval()] }), sample: true });
    expect(tanaPage.match(/class="label-chip label-chip--sample"/g)).toHaveLength(1);
    expect(tanaPage).toContain('<span class="small muted">Mari Disain OÜ · 19990001</span>');
  });

  test("direction A tokens: every text/background pair is at least 4.5:1", () => {
    const root = shell({ title: "x", active: "none", csrf: "", body: "" }).match(/:root\{([^}]*)\}/)![1];
    const vars = Object.fromEntries([...root.matchAll(/--([\w-]+):([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
    const hex = (v: string): string => (v.startsWith("var(--") ? hex(vars[v.slice(6, -1)]) : v);
    const lum = (h: string) => { const c = hex(h).replace("#", ""), f = c.length === 3 ? [...c].map((x) => x + x) : c.match(/../g)!; return f.map((x) => { const s = parseInt(x, 16) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }).reduce((a, s, i) => a + s * [0.2126, 0.7152, 0.0722][i], 0); };
    const ratio = (fg: string, bg: string) => { const [a, b] = [lum(vars[fg]), lum(vars[bg] === "transparent" ? "#fff" : vars[bg])].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
    const pairs: [string, string][] = [["c-text", "c-bg"], ["c-text", "c-surface-2"], ["c-muted", "c-bg"], ["c-muted", "c-surface-2"], ["c-on-primary", "c-primary"], ["c-primary", "c-bg"], ["c-link", "c-surface-2"],
      ["c-on-primary", "c-deep"], ["c-mint", "c-deep"], ["c-att", "c-bg"], ["c-att-dark", "c-att-bg"], ["c-danger", "c-bg"], ["c-focus", "c-bg"],
      ...["official", "rule", "assistant", "owner", "ai", "sample", "where"].map((k) => [`lbl-${k}-fg`, `lbl-${k}-bg`] as [string, string]),
      ...["drafted", "waiting", "approved", "sent", "accepted", "rejected", "paid", "void"].map((k) => [`st-${k}-fg`, `st-${k}-bg`] as [string, string])];
    for (const [fg, bg] of pairs) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    expect(vars["c-bg"]).toBe("#fff");
  });

  test("public shell has no nav and no logout form", () => {
    const html = shell({ title: "Tähtajad", active: "none", csrf: "", body: "<p>x</p>" });
    expect(html).not.toContain('class="main"');
    expect(html).not.toContain("/auth/logout");
    expect(html).toContain('href="/demand"');
  });

  test("formatters: Tallinn time, Estonian civil dates and euros, never ISO", () => {
    expect(fmtEur(24000, "et")).toBe("240,00\u00a0€");
    expect(fmtDeadline("2026-11-10", "et")).toBe("10. nov, teisipäev");
    expect(fmtPeriod("2026-10", "et")).toBe("oktoober 2026");
    expect(fmtPeriod("2026-10", "en")).toBe("October 2026");
    // DST edge: 00:30 UTC on 25 Oct 2026 is 03:30 in Tallinn.
    expect(fmtWhen("2026-10-25T00:30:00Z", "et", NOW)).toBe("25. okt, 03:30");
    expect(fmtWhen("2026-11-03T12:31:00Z", "et", NOW)).toBe("täna, 14:31");
  });

  test("login leads with identity, keeps the synthetic demo visibly separate and secondary", () => {
    const html = loginBody({ lang: "et", demo: true, google: true, preauth: "pre-1", companies: [{ key: "alpha", label: "Mari Disain OÜ (näidis)" }] });
    expect(html.indexOf("Jätka Google'iga")).toBeLessThan(html.indexOf("Proovi näidisettevõttega"));
    expect(html).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
    expect(html).toContain('<button type="submit" class="secondary">Ava Mari Disain OÜ (näidis)</button>');
    expect(html).toContain("See <strong>ei</strong> tõenda, et võid ettevõtte nimel tegutseda.");
    expect(loginBody({ lang: "en", demo: false, google: true, preauth: "", companies: [] })).toContain("does <strong>not</strong> prove you may act for a company");
  });
});

describe("Täna", () => {
  test("three cards in order: Ootab sinult · Assistent tegi · Tulekul, then Kuidas see kokku pandi", () => {
    const html = tana({ deadlines: mariDeadlines });
    const order = ["Ootab sinult", "Assistent tegi", "Tulekul", "Kuidas see kokku pandi"].map((h) => html.indexOf(h));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).toContain("Säästetud aega ei ole mõõdetud, seega me seda ei näita.");
    // Unknowns stay in the main view, before any details element.
    const mainView = html.split("<details")[0];
    expect(mainView).toContain("An urgent filing remains unassessed.");
    expect(mainView).toContain("1 kohustus(t) on veel lahtised");
    expect(mainView).not.toMatch(/\d+%/); // incomplete assessment: no fake percentage
  });

  test("hero counts what needs the owner: approvals, questions that change a row, the next action; never undecided needs", () => {
    const need = { id: "need_1", state: "classified", reason: null, need_redacted: "Esita KMD", blocker: "needs_owner_pin_or_signature", job_hint_redacted: null, category: "tax_filings", demand_label: "KMD esitamine", same_as: null, spec: "Mock.", classified_by: "mock", created_at: "2026-11-03T10:00:00Z" };
    const html = tana({ deadlines: mariDeadlines, approvals: [approval()], needs: [need] });
    // 1 approval + 1 answer (TSD payouts) + 1 next step = 3; the optional need is listed but not counted.
    expect(html).toContain("Sinult on täna vaja 3 asja");
    expect(html).toContain("1 kinnitus, 1 vastus ja 1 järgmine samm. Ülejäänu valmistab ette sinu assistent.");
    expect(html).toContain('<a class="btn" href="/approvals/appr_1">Vaata kinnitust</a>');
    expect(html).toContain("Vasta assistendile ühele küsimusele:");
    expect(html).toContain("Kui midagi deklareerida polnud, kaob 10. novembri TSD rida.");
    expect(html).toContain("Valikuline:");
    expect(html).not.toContain("Kas põhikiri määrab"); // a question that changes no row on screen is not asked
    expect(tana({ assessment: null, coverage: computeCoverage(null) })).toContain("Täna pole sinult midagi vaja");
    const one = tana({ approvals: [approval()], assessment: { ...assessment, next_action: { ...assessment.next_action, needs_owner: false } } });
    expect(one).toContain("Sinult on täna vaja üht asja");
    // A known gap is never hidden behind "nothing needs you".
    const quiet = { ...assessment, next_action: { ...assessment.next_action, needs_owner: false } };
    const gapped = tana({ assessment: quiet, coverage: computeCoverage(quiet) });
    expect(gapped).toContain("Täna ei oota sinult ükski kinnitus");
    expect(gapped).not.toContain("Täna pole sinult midagi vaja");
  });

  test("Assistent tegi lists finished or prepared work with labels, never reads; Saadetud: demo on samples", () => {
    const done = approval({ id: "appr_2", state: "consumed", decided_at: "2026-11-02T08:00:00Z", consumed_at: "2026-11-02T08:05:00Z", outcome_json: JSON.stringify({ outcome: "sent", observed_at: "2026-11-02T08:05:00Z", history: [{ outcome: "sent", observed_at: "2026-11-02T08:05:00Z" }] }) });
    const waiting = approval({ id: "appr_3", state: "approved", decided_at: "2026-11-03T11:00:00Z" });
    const html = tana({ approvals: [done, waiting], progress: [{ task_id: "invoicing", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }, { task_id: "invoicing", milestone: "started", observed_at: "2026-11-03T09:00:00Z" }] });
    const tegi = html.slice(html.indexOf('id="tegi"'), html.indexOf('id="tulekul"'));
    expect(tegi).toContain("Assistent tegi (2)"); // the sent reminder and the prepared draft; approved-without-outcome is not done yet
    expect(tegi).toContain("Demo Klient OÜ");
    expect(tegi).toContain('<span class="state-chip state-chip--sent state-chip--demo">Saadetud: demo</span>');
    expect(tegi).toContain('<span class="label-chip label-chip--assistant">Assistent teatas</span>');
    expect(tegi).toContain("Pooleli · ootab assistendi teadet");
    expect(tegi).toContain("Valmistas ette: Sales invoicing");
    expect(tegi).not.toContain("started");
  });

  test("a not-applicable row reads as not applying and its old work leaves Täna (real company replacing a test row)", () => {
    const real = assessmentSchema.parse({ ...assessment, responsibilities: [...assessment.responsibilities, { id: "R-001", domain: "operations", label: "Setup test entry", applicability: "not_applicable", is_core: false, arrangement: "none", reason: "Left over from a setup test.", evidence_refs: [] },
      { id: "payroll", domain: "people", label: "Old payroll", applicability: "not_applicable", is_core: true, arrangement: "assistant_assessed", executor: "the accountant", access: "Payroll app", success_criterion: "TSD ready by the 10th", next_checkpoint: "Next payday", reason: "No employees any more.", evidence_refs: [] }] });
    const html = tana({ lang: "en", sample: false, assessment: real, coverage: computeCoverage(real), progress: [{ task_id: "R-001", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }, { task_id: "invoicing", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }] });
    const tegi = html.slice(html.indexOf('id="tegi"'), html.indexOf('id="tulekul"'));
    expect(tegi).toContain("Done for you (1)");
    expect(tegi).not.toContain("Setup test entry");
    expect(html).toContain("Setup test entry — does not apply to you");
    expect(html).toContain("Sales invoicing — you do it yourself now");
    expect(html).toContain("Old payroll — does not apply to you"); // reclassified core + handled row
    expect(tegi).not.toContain("Old payroll");
  });

  test("the payouts question maps to the TSD row of the same period, never the first conditional one (#21, QA D-01, D-16)", () => {
    // 3 Nov: the October question goes with the 10 Nov row (October payouts), even when the 10 Dec row is listed first.
    const reordered = { ...mariDeadlines, obligations: [...mariDeadlines.obligations].reverse() };
    const html = tana({ deadlines: reordered });
    expect(html).toContain("„Kas maksid oktoobris palka, juhatuse liikme tasu, dividende või tasu eraisikule?” Kui midagi deklareerida polnud, kaob 10. novembri TSD rida.");
    expect(html).not.toContain("detsembri TSD");
    // 30 Oct: September's TSD (due 12 Oct) is past, so no September question is asked at all.
    const oct30 = new Date("2026-10-30T10:00:00Z"), m = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: oct30, months: 2 });
    const page = tana({ now: oct30, deadlines: { ...mariDeadlines, obligations: m.obligations, facts_needed: m.facts_needed } });
    expect(page).not.toContain("septembris");
    expect(page).not.toContain("TSD rida.");
    // The handoff matches the engine: the row goes away only when there were no payouts and no employee.
    expect(html).toContain("otsib oktoobri väljamakseid raamatupidamisest ja pangast; kui midagi deklareerida polnud, kaob see rida");
    expect(html).not.toContain("kui väljamakseid polnud, kaob see rida");
  });

  test("conditional rows render their condition; an unknown annual report never reads as definite (#21, #30 item 5, QA D-02, D-11)", () => {
    const unknown = computeObligations({}, { today: NOW, months: 2 });
    const html = tana({ deadlines: { ...mariDeadlines, company: { ...mariDeadlines.company, synthetic: false, provenance: "assistant_supplied" }, obligations: unknown.obligations, facts_needed: unknown.facts_needed } });
    const risk = html.slice(html.indexOf("Majandusaasta aruanne on tähtajast maas") - 40);
    expect(risk.slice(0, 200)).toContain("Võimalik: Majandusaasta aruanne on tähtajast maas");
    expect(risk).toContain('<p class="deadline-cond"><strong>Kehtib, kui 2025. a majandusaasta aruanne on esitamata.</strong></p>');
    expect(risk).toContain("<p class=\"small\"><strong>Kui see kehtib</strong></p>");
    expect(risk).toContain("„Kui see kehtib: Koosta mulle sammud hilinenud majandusaasta aruande esitamiseks.”");
    expect(risk).toContain("registrist kustutamine on võimalik alates 30.09.2026");
    const tul = html.slice(html.indexOf('id="tulekul"')).replace(/datetime="[^"]*"/g, "");
    expect(tul).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // An annual-report row with an unknown filing state shows its condition under the title.
    const june = computeObligations({}, { today: new Date("2026-06-01T10:00:00Z"), months: 1 });
    const annual = deadlinesList({ ...mariDeadlines, obligations: june.obligations.filter((o) => o.rule_id === "annual-report"), facts_needed: [] }, "et", { now: new Date("2026-06-01T10:00:00Z"), prompts: true });
    expect(annual).toContain('<p class="deadline-cond"><strong>Kehtib, kui 2025. a majandusaasta aruanne on esitamata.</strong></p>');
    expect(annual).toContain("„Kui see kehtib: Pane majandusaasta aruande jaoks vajalikud andmed kokku");
    // Definite rows carry no condition line.
    const kmd = deadlinesList({ ...mariDeadlines, obligations: mariDeadlines.obligations.filter((o) => o.rule_id === "vat-return-kmd") }, "et", { now: NOW, prompts: true });
    expect(kmd).not.toContain("deadline-cond");
    expect(kmd).not.toContain("Kui see kehtib");
  });

  test("the assistant's rationale and effort estimate are labelled, never in the hero or the counts (#21, QA D-03)", () => {
    const claimed = assessmentSchema.parse({ ...assessment, next_action: { ...assessment.next_action, rationale: "Säästab sulle umbes 7 tundi nädalas.", estimated_effort_saved: "umbes 7 tundi nädalas", savings_basis: "observed" } });
    const html = tana({ assessment: claimed, coverage: computeCoverage(claimed) });
    const hero = html.slice(0, html.indexOf("</section>"));
    expect(hero).not.toContain("7");
    const ootab = html.slice(html.indexOf('id="ootab"'), html.indexOf('id="tegi"'));
    expect(ootab).toContain('<p class="small"><span class="muted">Assistendi hinnang:</span> Säästab sulle umbes 7 tundi nädalas. umbes 7 tundi nädalas</p>');
    expect(ootab.split("7 tundi").length - 1).toBe(3); // the labelled line twice, the quoted prompt once
  });

  test("Kuidas see kokku pandi names the source actually read (#21, QA D-06)", () => {
    const how = (html: string) => html.slice(html.indexOf("<summary>Kuidas see kokku pandi"));
    expect(how(tana({ deadlines: mariDeadlines }))).toContain("Tähtajad: reeglistik ja näidisandmed.");
    const official = { ...mariDeadlines, company: { ...mariDeadlines.company, synthetic: false, provenance: "public_register" as const } };
    expect(how(tana({ deadlines: official }))).toContain("Tähtajad: reeglistik ja avalikud avaandmed (Ärikratt).");
    const told = { ...mariDeadlines, company: { ...mariDeadlines.company, synthetic: false, provenance: "assistant_supplied" as const } };
    expect(how(tana({ deadlines: told }))).toContain("Tähtajad: reeglistik ja sinu assistendi teated.");
    expect(how(tana({ deadlines: null }))).toContain("Tähtajad: reeglistik ja sinu assistendi teated.");
    for (const html of [tana({ deadlines: told }), tana({ deadlines: null })]) expect(html).not.toContain("avalik register");
  });

  test("Assistent tegi counts only finished work; a failed outcome waits for the owner (#21, QA D-09)", () => {
    const outcome = (o: string) => JSON.stringify({ outcome: o, observed_at: "2026-11-03T09:00:00Z", history: [{ outcome: o, observed_at: "2026-11-03T09:00:00Z" }] });
    const sent = approval({ id: "appr_s", state: "consumed", decided_at: "2026-11-03T08:00:00Z", consumed_at: "2026-11-03T09:00:00Z", outcome_json: outcome("sent") });
    const failed = approval({ id: "appr_f", state: "consumed", decided_at: "2026-11-03T08:00:00Z", consumed_at: "2026-11-03T09:00:00Z", outcome_json: outcome("failed") });
    const waiting = approval({ id: "appr_w", state: "approved", decided_at: "2026-11-03T11:00:00Z" });
    const quiet = { ...assessment, gaps: [], responsibilities: assessment.responsibilities.filter((r) => r.applicability !== "unresolved"), next_action: { ...assessment.next_action, needs_owner: false } };
    const html = tana({ assessment: quiet, coverage: computeCoverage(quiet), approvals: [sent, failed, waiting], progress: [{ task_id: "invoicing", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }] });
    const ootab = html.slice(html.indexOf('id="ootab"'), html.indexOf('id="tegi"'));
    const tegi = html.slice(html.indexOf('id="tegi"'), html.indexOf('id="tulekul"'));
    expect(html).toContain('<a href="#tegi"><b>2</b><span>assistent tegi</span></a>');
    expect(tegi).toContain("Assistent tegi (2)");
    expect(tegi).toContain("Pooleli · ootab assistendi teadet");
    expect(tegi).not.toContain("Ei õnnestunud");
    expect(ootab).toContain("Ootab sinult (1)");
    expect(ootab).toContain('<span class="state-chip state-chip--rejected">Ei õnnestunud — vaata üle</span>');
    expect(ootab).toContain('href="/approvals/appr_f"');
    expect(html).toContain("Sinult on täna vaja üht asja");
    expect(html).toContain('<a class="needs" href="#ootab"><b>1</b>');
  });

  test("Tulekul rows: date first, rule label, source, handoff with Sina; synthetic is Näidis, never official", () => {
    const html = tana({ deadlines: mariDeadlines });
    const tul = html.slice(html.indexOf('id="tulekul"'));
    expect(tul).toContain('<time class="deadline-date" datetime="2026-11-10">');
    expect(tul).toContain("Arvutatud reeglist");
    expect(tul).toContain('<dt class="me">Sina</dt><dd>esitad KMD e-MTA-s oma Smart-ID-ga</dd>');
    expect(tul).toContain("Summad arvutab sinu raamatupidamisprogramm, mitte tehisaru.");
    expect(tul).toContain("Valmista oktoobri KMD jaoks arved ette ja küsi minult kinnitust enne, kui midagi saadad.");
    expect(tul).toContain("Kes mida teeb");
    // The sample bar already says Näidis; without it (a non-demo owner) the synthetic company carries its own chip.
    expect(tul).not.toContain("label-chip--sample");
    expect(tul).toContain('<span class="small muted">Mari Disain OÜ · 19990001</span>');
    expect(tana({ deadlines: mariDeadlines, sample: false })).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
    expect(html).not.toContain("Ametlik allikas");
  });

  test("no inline script, no time-saved figure, no raw ISO timestamps on the page", () => {
    const claimed = assessmentSchema.parse({ ...assessment, next_action: { ...assessment.next_action, estimated_effort_saved: "3 hours per week", savings_basis: "observed" } });
    const html = tana({ assessment: claimed, coverage: computeCoverage(claimed), deadlines: mariDeadlines, approvals: [approval()] });
    expect(html).not.toContain("<script");
    // The assistant's estimate appears only under its label, never as our claim in the hero.
    expect(html.slice(0, html.indexOf("</section>"))).not.toContain("3 hours");
    expect(html.match(/[^>]*3 hours/g)).toEqual([" It may carry a deadline. 3 hours"]);
    expect(html).toContain('<span class="muted">Assistendi hinnang:</span> It may carry a deadline. 3 hours per week');
    const visible = html.replace(/<details class="tech-details">[\s\S]*?<\/details>/g, "").replace(/datetime="[^"]*"/g, "");
    expect(visible).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|UTC/);
  });

  test("untrusted assessment text is escaped", () => {
    const evil = assessmentSchema.parse({
      ...assessment,
      gaps: ["<svg onload=alert(1)>"],
      next_action: { ...assessment.next_action, title: '"><script>alert(2)</script>', rationale: "x & y" },
    });
    const html = status(evil);
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;svg");
  });
});

describe("landing and connect", () => {
  test("landing conversations: the first shuffled card alone is active and owns the one visible transcript and phone (#69 step 2a)", () => {
    for (const lang of ["et", "en"] as const) {
      const html = landingBody({ lang, demo: false, rand: () => 0 });
      const cards = html.match(/<li class="job-card[\s\S]*?<\/li>/g) ?? [];
      expect(cards).toHaveLength(8);
      const id = cards[0].match(/data-job-card="([^"]+)"/)![1];
      expect(cards[0]).toContain('class="job-card job-card--active"');
      expect(cards[0]).toContain('aria-pressed="true"');
      expect(cards[0]).toContain('aria-controls="landing-phone"');
      for (const card of cards.slice(1)) expect(card).toContain('aria-pressed="false"');
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      const conversations = [...html.matchAll(/<div class="teaser-conversation" data-job-conversation="([^"]+)"( hidden)?>/g)];
      expect(conversations).toHaveLength(8);
      const visible = conversations.filter((m) => !m[2]);
      expect(visible).toHaveLength(1);
      expect(visible[0][1]).toBe(id);
      expect(visible[0][0]).not.toContain("hidden");
      expect(html.slice(html.indexOf(visible[0][0]), html.indexOf('<div class="phone"', html.indexOf(visible[0][0])))).toContain('<div class="vh"><p>');
    }
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    expect(css).toContain(".job-card--active{border-color:var(--c-primary)");
    expect(css).toContain(".chat{display:flex;flex:1;flex-direction:column;justify-content:flex-end;min-height:540px");
  });

  test("landing conversations: every case has its scripted ET and EN transcript (#69 step 2b)", () => {
    const expected = {
      et: [
        ["Kes mulle võlgu on?", `Sinu raamatupidamisprogrammi järgi on kolm arvet üle tähtaja, kokku ${fmtEur(72000, "et")}. Koostasin igale viisaka meeldetuletuse.`],
        ["Kas oktoobri KMD on valmis?", "Raamatupidamise järgi on oktoobris 14 müügi- ja 9 ostuarvet. Andmed on valmis, esitad e-maksuametis ise. Tähtaeg on 20. nov."],
        ["Mis aastaaruandest puudu on?", "Puudu on inventuuri kokkuvõte ja kasumi jaotamise otsus. Muu on raamatupidamises olemas. Allkirjastad e-äriregistris ise. Tähtaeg on 30. juuni."],
        ["Pane mu tähtajad kalendrisse.", "Lisasin 4 tähtaega: TSD 10. nov, KMD 20. nov, TSD 10. dets, KMD 21. dets."],
        ["Tee Demo Klient OÜ-le arve oktoobri töö eest.", "Koostasin arve tehtud töö põhjal."],
        ["Kes on oktoobris maksnud?", `Pangas on 5 laekumist, 4 sobivad arvetega. Maksmata: Demo Partner OÜ, ${fmtEur(31000, "et")}.`],
        ["Kontrolli Näidis Ehitus OÜ enne pakkumist.", "Registris aktiivne, maksuvõlga pole, eelmise aasta aruanne on esitatud."],
        ["Korja oktoobri ostuarved kokku.", `Leidsin e-postist 7 ostuarvet, kokku ${fmtEur(118420, "et")}. Lisasin need raamatupidamisse kinnitamata kannetena.`],
      ],
      en: [
        ["Who owes me money?", `Your accounting software shows three invoices overdue, ${fmtEur(72000, "en")} in total. I drafted a polite reminder for each.`],
        ["Is October's VAT return ready?", "Your books show 14 sales and 9 purchase invoices for October. The figures are ready; you file in e-MTA yourself. Due 20 Nov."],
        ["What's missing from the annual report?", "Missing: the stock-take summary and the profit-distribution decision. Everything else is in your books. You sign in the e-Business Register yourself. Due 30 Jun."],
        ["Put my deadlines in my calendar.", "Added 4 deadlines: TSD 10 Nov, VAT 20 Nov, TSD 10 Dec, VAT 21 Dec."],
        ["Invoice Demo Klient OÜ for October's work.", "I drafted the invoice from the work done."],
        ["Who paid in October?", `5 payments arrived; 4 match invoices. Unpaid: Demo Partner OÜ, ${fmtEur(31000, "en")}.`],
        ["Check Näidis Ehitus OÜ before I quote.", "Active in the register, no tax debt, last year's report filed."],
        ["Collect October's purchase invoices.", `Found 7 purchase invoices in your e-mail, ${fmtEur(118420, "en")} in total. I added them to your books as unconfirmed entries.`],
      ],
    } as const;
    for (const lang of ["et", "en"] as const) {
      const html = landingBody({ lang, demo: false, rand: () => 0 });
      const transcripts = html.match(/<div class="vh"><p>[\s\S]*?<\/ol><\/div>/g) ?? [];
      expect(transcripts).toHaveLength(8);
      const who = lang === "et" ? ["Sina", "Assistent"] : ["You", "Assistant"];
      for (const [question, answer] of expected[lang]) {
        expect(transcripts.join("\n"), `${lang}: ${question}`).toContain(`<li>${who[0]}: ${esc(question)}</li>`);
        expect(transcripts.join("\n"), `${lang}: ${answer}`).toContain(`<li>${who[1]}: ${esc(answer)}`);
      }
    }
  });

  test("landing conversations: each phone subtitle names that case's connectors (#69 step 2c)", () => {
    const expected = {
      et: { unpaid: "ühendatud: raamatupidamine, e-post, AI-hüppelaud", kmd: "ühendatud: raamatupidamine, AI-hüppelaud", annual: "ühendatud: raamatupidamine, AI-hüppelaud", calendar: "ühendatud: kalender, AI-hüppelaud", invoice: "ühendatud: raamatupidamine, e-post, AI-hüppelaud", payments: "ühendatud: pank, raamatupidamine, AI-hüppelaud", customer: "ühendatud: äriandmed, AI-hüppelaud", purchases: "ühendatud: e-post, raamatupidamine, AI-hüppelaud" },
      en: { unpaid: "connected: accounting, e-mail, AI Launchpad", kmd: "connected: accounting, AI Launchpad", annual: "connected: accounting, AI Launchpad", calendar: "connected: calendar, AI Launchpad", invoice: "connected: accounting, e-mail, AI Launchpad", payments: "connected: bank, accounting, AI Launchpad", customer: "connected: business data, AI Launchpad", purchases: "connected: e-mail, accounting, AI Launchpad" },
    } as const;
    for (const lang of ["et", "en"] as const) {
      const html = landingBody({ lang, demo: false, rand: () => 0 });
      for (const [id, subtitle] of Object.entries(expected[lang])) {
        const match = html.match(new RegExp(`data-job-conversation="${id}"[\\s\\S]*?<small>([^<]*)</small>`));
        expect(match?.[1], `${lang}: ${id}`).toBe(subtitle);
      }
    }
  });

  test("landing conversations: every scoped beat and tap has its own keyframes (#69 step 2d)", () => {
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    const ids = ["unpaid", "kmd", "annual", "calendar", "invoice", "payments", "customer", "purchases"];
    for (const id of ids) {
      const beats = ["me1", "t1", "ai1", ...(id === "unpaid" || id === "invoice" ? ["card"] : []), ...(id === "unpaid" ? ["allow", "t2", "ai2"] : [])];
      for (const beat of beats) expect(css, `${id}-${beat}`).toContain(`@keyframes lp-${id}-${beat}{`);
      for (const tap of id === "unpaid" ? ["approve", "allow"] : id === "invoice" ? ["approve"] : []) {
        for (const part of ["out", "in", "tap"]) expect(css, `${id}-${tap}-${part}`).toContain(`@keyframes lp-${id}-${tap}-${part}{`);
      }
    }
    expect(css).toContain("#teaser-pause:checked~.teaser-conversation .phone *{animation-play-state:paused!important}");
  });

  test("landing: Ärikratt is named only as the recommended connector and register-data source (#69 step 2e)", () => {
    for (const lang of ["et", "en"] as const) {
      const html = landingBody({ lang, demo: false, rand: () => 0 });
      for (const vendor of ["Merit", "SmartAccounts", "e-arveldaja", "Gmail", "LHV", "Creditinfo"]) expect(html, vendor).not.toMatch(new RegExp(vendor, "i"));
      expect(html.match(/Ärikratt/g)).toHaveLength(5);
      expect(html).toContain(`<a href="/kataloog?q=%C3%84rikratt">${lang === "et" ? "Ärikratt · soovitatud" : "Ärikratt · recommended"}</a>`);
      expect(html.match(/<p class="job-register small muted">(?:Registriandmed|Register data): Ärikratt<\/p>/g)).toHaveLength(3);
      expect(html).toContain(lang === "et" ? "Ärikratti soovitame tungivalt: sellest tulevad sinu ettevõtte registriandmed." : "We strongly recommend Ärikratt: it supplies your company&#39;s register data.");
    }
  });

  test("landing: the assistant works through vendor connectors; Launchpad adds deadlines, approvals and receipts (#69)", () => {
    const et = landingBody({ lang: "et", demo: false, rand: () => 0 }), en = landingBody({ lang: "en", demo: false, rand: () => 0 });
    for (const s of ["Tegele sellega, milles oled hea. <span>Kontoritöö teeb sinu AI-assistent.</span>", "Sinu assistent teeb kontoritöö sinu raamatupidamise, panga ja e-posti ühenduste kaudu. AI-hüppelaud juhib tööd: ütleb, milliseid ühendusi vaja, küsib sinu kinnitust, mõõdab, mis on sinu käest ära, ja kogub tagasisidet. Töötab sinu oma ChatGPT või Claude&#39;iga.",
      '<a class="btn" href="/uhenda">Ühenda oma assistent</a>', '<span class="label-chip label-chip--sample">Näidis</span>', "ühendatud: raamatupidamine, e-post, AI-hüppelaud", "Kes mulle võlgu on?", `Sinu raamatupidamisprogrammi järgi on kolm arvet üle tähtaja, kokku ${fmtEur(72000, "et")}. Koostasin igale viisaka meeldetuletuse.`,
      "Maksemeeldetuletus · 1/3", "Demo Klient OÜ", fmtEur(24000, "et"), "Kinnita täpselt see", "✓ Kinnitatud · Saadetud sinu e-postist: demo", `<span class="mock-allow">Luba sarnased automaatselt</span><span class="mock-rule">Püsiluba: meeldetuletused kuni ${fmtEur(50000, "et")}</span>`,
      "Järgmised saadan ise.", "Raamatupidamise järgi on oktoobris 14 müügi- ja 9 ostuarvet.", "Mida assistent saab ära teha", '<a href="/kataloog">vaata kataloogist</a>, mis sinu programmile olemas on.',
      "Kuidas alustada", "Ühenda oma ChatGPT või Claude", "Ühenda ka oma raamatupidamine ja e-post — assistent ütleb, milline ühendus sobib", "Küsi: „Mida saad minu kontoritööst ära teha?”", "Kinnita ühe puudutusega — või luba edaspidi automaatselt", 'href="/demand"']) expect(et, s).toContain(s);
    for (const s of ["Focus on what you're good at. <span>Your AI assistant does the office work.</span>", "Your assistant does the office work through your accounting, bank and e-mail connectors. AI Launchpad runs the work: it tells you which connectors you need, asks for your approval, measures what is off your plate and collects feedback. Works with your own ChatGPT or Claude.", "Connect your assistant", ">Sample<", "connected: accounting, e-mail, AI Launchpad",
      "Who owes me money?", `Your accounting software shows three invoices overdue, ${fmtEur(72000, "en")} in total. I drafted a polite reminder for each.`, "Payment reminder · 1/3", fmtEur(24000, "en"), "Approve exactly this", "✓ Approved · Sent from your e-mail: demo", "Allow similar ones automatically", `Standing approval: reminders up to ${fmtEur(50000, "en")}`,
      "I&#39;ll send the next ones myself.", "Your books show 14 sales and 9 purchase invoices for October.", "What your assistant can take off you", '<a href="/kataloog">see the catalogue</a> for what exists for your software.', "How to start", "Connect your accounting software and e-mail too — your assistant tells you which connector fits", "Ask: “What office work can you take off me?”", "Approve with one tap — or let it run automatically"]) expect(en, s).toContain(s);
    expect(et.match(/<ol class="how">.*?<\/ol>/s)![0].match(/<li>/g)).toHaveLength(4);
    expect(shell({ title: "x", active: "none", csrf: "", body: "" })).toContain(".how li>span{min-width:0;overflow-wrap:break-word}");
    expect(et).toContain("<li>Midagi ei saadeta ilma sinu loata</li><li>Smart-ID ja allkiri jäävad sinu kätte</li><li>Maksud ja tähtajad arvutab reeglistik, mitte tehisaru</li>");
    for (const gone of ["Kuidas see töötab", "Mis mul sel kuul adminis ees on?", "täpselt see saaja, summa ja dokument", "Muide,"]) expect(et, gone).not.toContain(gone);
    // The animation is decorative (aria-hidden, no focusable element); a visually hidden transcript carries the same conversation.
    expect(et).toContain('<div class="phone" aria-hidden="true">');
    const phone = et.slice(et.indexOf('<div class="phone"'), et.indexOf("<figcaption>"));
    expect(phone).not.toMatch(/<(a|button|input)\b|tabindex/);
    expect(et).toMatch(/<div class="vh"><p>Näidisvestlus:<\/p><ol><li>Sina: Kes mulle võlgu on\?<\/li><li>Assistent: Sinu raamatupidamisprogrammi järgi on kolm arvet üle tähtaja/);
    // No search or unsupported saving claim; the only script is the local carousel pager.
    for (const html of [et, en]) {
      expect(html.replace('<input type="checkbox" id="teaser-pause" class="vh-input">', "")).not.toMatch(/<form|<input|name="q"|\bsäästa|\bsaves? \d/i);
      expect(html.match(/<script>/g)).toHaveLength(1);
      expect(scripts(html)).toContain("data-job-prev");
      expect(scripts(html)).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|eval\(/);
      expect(html.slice(html.indexOf("</figure>")).replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<svg.*?<\/svg>/gs, "").replace(/<[^>]+>/g, ""), "no figures outside the sample chat").not.toMatch(/\d+\s*(€|%|h\b|tundi|hours)/);
    }
    // The state chip swaps with the first button (same CSS timing), so the last frame does not contradict itself.
    expect(et).toContain('<span class="mock-wait"><span class="state-chip state-chip--waiting">Ootab sinu kinnitust</span></span><span class="mock-ok"><span class="state-chip state-chip--approved">Kinnitatud</span></span>');
  });

  test("landing carousel: all 8 use cases name their connectors in ET and EN; the no-JS pager and scroll region stay accessible (#69)", () => {
    const expected = {
      et: [
        ["Võlgnikud", [["Raamatupidamine", "raamatupidamine"], ["E-post", "epost"], ["AI-hüppelaud: kinnitus", null]]],
        ["KMD", [["Raamatupidamine", "raamatupidamine"], ["AI-hüppelaud: tähtaeg", null]]],
        ["Aastaaruanne", [["Raamatupidamine", "raamatupidamine"], ["AI-hüppelaud: tähtaeg", null]]],
        ["Tähtajad kalendrisse", [["AI-hüppelaud: tähtajad", null], ["Kalender", "epost"]]],
        ["Arve kliendile", [["Raamatupidamine", "raamatupidamine"], ["E-post", "epost"], ["AI-hüppelaud: kinnitus", null]]],
        ["Laekumised", [["Pank", "pank"], ["Raamatupidamine", "raamatupidamine"]]],
        ["Uue kliendi kontroll", [["Ärikratt · soovitatud", "/kataloog?q=%C3%84rikratt"]]],
        ["Ostuarved", [["E-post", "epost"], ["Raamatupidamine", "raamatupidamine"]]],
      ],
      en: [
        ["Unpaid invoices", [["Accounting", "raamatupidamine"], ["E-mail", "epost"], ["AI Launchpad: approval", null]]],
        ["VAT return", [["Accounting", "raamatupidamine"], ["AI Launchpad: deadline", null]]],
        ["Annual report", [["Accounting", "raamatupidamine"], ["AI Launchpad: deadline", null]]],
        ["Deadlines in your calendar", [["AI Launchpad: deadlines", null], ["Calendar", "epost"]]],
        ["Invoice a customer", [["Accounting", "raamatupidamine"], ["E-mail", "epost"], ["AI Launchpad: approval", null]]],
        ["Incoming payments", [["Bank", "pank"], ["Accounting", "raamatupidamine"]]],
        ["Check a new customer", [["Ärikratt · recommended", "/kataloog?q=%C3%84rikratt"]]],
        ["Purchase invoices", [["E-mail", "epost"], ["Accounting", "raamatupidamine"]]],
      ],
    } as const;
    for (const lang of ["et", "en"] as const) {
      const html = landingBody({ lang, demo: false, rand: () => 0 });
      const cards = html.match(/<li class="job-card[\s\S]*?<\/li>/g) ?? [];
      expect(cards).toHaveLength(8);
      for (const [title, chips] of expected[lang]) {
        const card = cards.find((c) => c.includes(`>${title}</button></h3>`));
        expect(card, `${lang}: ${title}`).toBeDefined();
        const positions = chips.map(([label, group]) => {
          const chip = group
            ? `<a href="${group.startsWith("/") ? group : `/kataloog?g=${group}`}">${label}</a>`
            : `<span class="label-chip label-chip--rule">${label}</span>`;
          expect(card, `${lang}: ${title} / ${label}`).toContain(chip);
          return card!.indexOf(chip);
        });
        expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      }
      expect(html).toContain(`<h2 id="jobs-h">${lang === "et" ? "Mida assistent saab ära teha" : "What your assistant can take off you"}</h2>`);
      expect(html).toContain(`role="region" aria-label="${lang === "et" ? "Mida assistent saab ära teha" : "What your assistant can take off you"}" tabindex="0"`);
      expect(html).toContain(`data-job-prev hidden>${lang === "et" ? "‹ Eelmine" : "‹ Previous"}</button>`);
      expect(html).toContain(`data-job-next hidden>${lang === "et" ? "Järgmine ›" : "Next ›"}</button>`);
      expect(html).toContain('aria-live="polite" data-job-status hidden>1 / 8</span>');
      expect(scripts(html)).toContain("prefers-reduced-motion: reduce");
    }
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    expect(css).toContain("overflow-x:auto;scroll-snap-type:x mandatory");
    expect(css).toContain("scroll-snap-align:start");
  });

  test("landing carousel: scroll end preserves a visible active card, then prefers the first visible or nearest card (#69)", () => {
    expect(String(jobCardAfterScroll)).not.toContain("__name");
    const track = { left: 0, right: 300 };
    expect(jobCardAfterScroll(2, track, [{ left: 0, right: 100 }, { left: 100, right: 200 }, { left: 200, right: 300 }])).toBe(2);
    expect(jobCardAfterScroll(2, track, [{ left: 0, right: 100 }, { left: 110, right: 210 }, { left: 220, right: 320 }])).toBe(0);
    expect(jobCardAfterScroll(0, { left: 0, right: 100 }, [{ left: -150, right: -50 }, { left: 120, right: 220 }])).toBe(1);
  });

  test("landing carousel: deterministic shuffles differ and retain every card (#69)", () => {
    const titles = (rand: () => number) => [...landingBody({ lang: "et", demo: false, rand }).matchAll(/<li class="job-card[^"]*" data-job-card="[^"]+"><h3><button[^>]*>(.*?)<\/button><\/h3>/g)].map((m) => m[1]);
    const first = titles(() => 0), second = titles(() => 0.999999);
    expect(first).not.toEqual(second);
    const all = ["Võlgnikud", "KMD", "Aastaaruanne", "Tähtajad kalendrisse", "Arve kliendile", "Laekumised", "Uue kliendi kontroll", "Ostuarved"];
    expect(first).toHaveLength(8); expect(second).toHaveLength(8);
    expect([...first].sort()).toEqual([...all].sort());
    expect([...second].sort()).toEqual([...all].sort());
  });

  test("landing: old job tiles, two-minute setup and vendor names are gone (#69)", () => {
    const et = landingBody({ lang: "et", demo: false }), en = landingBody({ lang: "en", demo: false });
    for (const old of ["Alusta 2 minutiga", "Start in 2 minutes", "Mida assistent sinu eest ära teeb", "What your assistant takes off your plate",
      "Leiab tasumata arved ja saadab meeldetuletused.", "Kogub kuu arved ja paneb deklaratsiooni valmis. Esitad ise.", "Paneb kokku, mida aruandeks vaja. Allkirjastad ise.", "Teab sinu ettevõtte tähtaegu ja tuletab meelde.",
      "Finds unpaid invoices and sends reminders.", "Gathers the month's invoices and gets the return ready. You file it.", "Puts together what the report needs. You sign it.", "Knows your company's deadlines and reminds you."]) {
      expect(et, old).not.toContain(old); expect(en, old).not.toContain(old);
    }
    for (const vendor of ["Merit", "SmartAccounts", "e-arveldaja", "Gmail", "LHV", "Creditinfo"]) {
      expect(et).not.toMatch(new RegExp(vendor, "i")); expect(en).not.toMatch(new RegExp(vendor, "i"));
    }
  });

  test("landing teaser: KMD and annual-report answers carry rule chips and their SRC source labels", () => {
    const et = landingBody({ lang: "et", demo: false }), en = landingBody({ lang: "en", demo: false });
    const teaser = (h: string) => h.slice(h.indexOf('<figure class="teaser"'), h.indexOf("</figure>"));
    const chip = (k: string, text: string) => `<span class="label-chip label-chip--${k}">${text}</span>`;
    for (const h of [et, en]) expect(teaser(h)).not.toContain("label-chip--assistant");
    expect(teaser(et)).toContain(`Tähtaeg on <b>20.\u00a0nov</b>.<span class="labels">${chip("rule", "Arvutatud reeglist")}${chip("official", "Allikas: KMS § 27 lg 1, § 38 lg 1")}</span>`);
    expect(teaser(et)).toContain(chip("official", "Allikas: ÄS § 179 lg 4"));
    expect(teaser(en)).toContain(`${chip("rule", "Calculated by rule")}${chip("official", "Source: VAT Act § 27 lg 1, § 38 lg 1")}`);
    expect(teaser(en)).toContain(chip("official", "Source: Commercial Code § 179 lg 4"));
    for (const h of [et, en]) expect(teaser(h).match(/label-chip--(rule|official)/g)).toHaveLength(6);
    // The screen-reader transcript carries the same texts.
    expect(et).toContain("Raamatupidamise järgi on oktoobris 14 müügi- ja 9 ostuarvet. Andmed on valmis, esitad e-maksuametis ise. Tähtaeg on 20.\u00a0nov. · Arvutatud reeglist · Allikas: KMS § 27 lg 1, § 38 lg 1</li></ol>");
    expect(en).toContain("Your books show 14 sales and 9 purchase invoices for October. The figures are ready; you file in e-MTA yourself. Due 20\u00a0Nov. · Calculated by rule · Source: VAT Act § 27 lg 1, § 38 lg 1</li></ol>");
  });

  test("landing: a call to action under „Kuidas alustada”; the sample-company link only where demo login is on (#63 m3)", () => {
    const steps = (h: string) => h.slice(h.indexOf('id="how-h"'), h.indexOf('<ul class="trust"'));
    const demo = steps(landingBody({ lang: "et", demo: true })), plain = steps(landingBody({ lang: "et", demo: false }));
    for (const h of [demo, plain]) {
      expect(h).toContain('<a class="how-go" href="/uhenda">Ühenda oma ChatGPT või Claude</a>');
      expect(h).toContain('<p class="how-cta"><a class="btn" href="/uhenda">Ühenda oma assistent</a>');
      expect(h).not.toContain("<script");
    }
    expect(demo).toContain('<a class="tap-link" href="/login">Vaata näidisettevõtet</a>');
    expect(plain).not.toContain('href="/login"'); expect(plain).not.toContain("Vaata näidisettevõtet");
    expect(steps(landingBody({ lang: "en", demo: true }))).toContain('<a class="tap-link" href="/login">See the sample company</a>');
  });

  test("landing teaser: CSS-only pause toggle, labelled, no script in the teaser (tribunal T-004, WCAG 2.2.2)", () => {
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    for (const [h, pause, resume] of [[landingBody({ lang: "et", demo: false }), "Peata animatsioon", "Jätka animatsiooni"], [landingBody({ lang: "en", demo: false }), "Pause animation", "Resume animation"]]) {
      expect(h).toContain('<input type="checkbox" id="teaser-pause" class="vh-input">');
      expect(h).toContain(`<label class="teaser-pause" for="teaser-pause"><span class="tp-pause">${pause}</span><span class="tp-resume">${resume}</span></label>`);
      expect(h.slice(h.indexOf('<figure class="teaser"'), h.indexOf("</figure>"))).not.toContain("<script");
    }
    expect(css).toContain("#teaser-pause:checked~.teaser-conversation .phone *{animation-play-state:paused!important}");
    // #63 m2: paused, the visible label reads „Jätka animatsiooni” (CSS only).
    expect(css).toContain(".tp-resume,#teaser-pause:checked~figcaption .tp-pause{display:none}#teaser-pause:checked~figcaption .tp-resume{display:inline}");
    expect(css).toMatch(/\.teaser-pause\{[^}]*min-height:44px/);
    expect(css).toMatch(/#teaser-pause:focus-visible~figcaption \.teaser-pause\{outline:3px/);
  });

  test("landing transcript: the owner approves and allows, the assistant sends (tribunal T-003)", () => {
    expect(landingBody({ lang: "et", demo: false })).toContain(`<li>Sina: Kinnitatud</li><li>Assistent: Saadetud sinu e-postist (näidis)</li><li>Sina: Luba sarnased automaatselt</li><li>Assistent: Püsiluba: meeldetuletused kuni ${fmtEur(50000, "et")}. Järgmised saadan ise.`);
    expect(landingBody({ lang: "en", demo: false })).toContain(`<li>You: Approved</li><li>Assistant: Sent from your e-mail (sample)</li><li>You: Allow similar ones automatically</li><li>Assistant: Standing approval: reminders up to ${fmtEur(50000, "en")}. I&#39;ll send the next ones myself.`);
  });

  test("landing teaser: the KMD date is the engine's for November 2026 (20.11)", () => {
    const m = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2026-11-01T10:00:00Z"), months: 1 });
    const due = Object.fromEntries(m.obligations.map((o) => [o.rule_id, o.effective_due]));
    expect(due["vat-return-kmd"]).toBe("2026-11-20");
  });

  test("landing calendar answer: the four dates are the engine's first two TSD and KMD effective_due dates (tribunal T-001)", () => {
    const m = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
    const due = (rule: string) => m.obligations.filter((o) => o.rule_id === rule).map((o) => o.effective_due as string);
    const [tsdNov, tsdDec] = due("tsd-monthly-return"), [kmdNov, kmdDec] = due("vat-return-kmd");
    expect([tsdNov, tsdDec]).toEqual(["2026-11-10", "2026-12-10"]);
    expect([kmdNov, kmdDec]).toEqual(["2026-11-20", "2026-12-21"]); // 2026-12-20 is a Sunday
    // The landing writes civil dates with a non-breaking space: "21. dets" / "21 Dec".
    const date = (ymd: string, l: "et" | "en") => { const p = deadlineParts(ymd, l); return l === "et" ? `${p.day}.\u00a0${p.mon}` : `${p.day}\u00a0${p.mon}`; };
    for (const [l, tsd, kmd] of [["et", "TSD", "KMD"], ["en", "TSD", "VAT"]] as const) {
      const html = landingBody({ lang: l, demo: false, rand: () => 0 });
      const at = html.indexOf('data-job-conversation="calendar"');
      const calendar = html.slice(at, html.indexOf("</ol>", at)); // that case's rendered transcript
      expect(calendar).toContain(`${tsd} ${date(tsdNov, l)}, ${kmd} ${date(kmdNov, l)}, ${tsd} ${date(tsdDec, l)}, ${kmd} ${date(kmdDec, l)}.`);
      expect(calendar).not.toContain(`${kmd} ${date("2026-12-20", l)}`); // the old Sunday date
    }
  });

  test("landing teaser CSS: final frame is the base state, so reduced motion shows it statically", () => {
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    expect(css).toContain("@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important");
    expect(css).toMatch(/\.beat--typing\{max-height:0;opacity:0\}/);
    expect(css).toMatch(/\.mock-wait,\.mock-approve\{[^}]*opacity:0;animation-duration:18s;animation-iteration-count:infinite\}/);
    expect(css).toMatch(/\.mock-allow\{[^}]*opacity:0;animation-duration:18s;animation-iteration-count:infinite\}/);
    expect(css).toContain(".mock-ok,.mock-done,.mock-rule{animation-duration:18s;animation-iteration-count:infinite}");
    for (const k of ["me1", "t1", "ai1", "card", "allow", "t2", "ai2"]) expect(css, k).toContain(`.b-unpaid-${k}{animation-name:lp-unpaid-${k}}@keyframes lp-unpaid-${k}{`);
    for (const k of ["approve", "allow"]) for (const p of ["out", "in", "tap"]) expect(css, `${k}-${p}`).toContain(`@keyframes lp-unpaid-${k}-${p}{`);
  });

  test("connect: one open button, shared guide prompt, QR on public HTTPS, old steps inside #ise when expanded", async () => {
    const endpoint = "https://launchpad.example.com/mcp";
    const html = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true, expanded: true });
    expect(html).toContain('<a href="/uhenda?a=chatgpt" aria-current="true">ChatGPT</a>');
    expect(html).toContain("Lihtsaim algus: Claude — töötab ka tasuta paketis.");
    expect(html).toContain("ChatGPT Pro paketis töötavad tähtajad ja juhised (ainult lugemine). Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.");
    expect(html).toContain('<a class="btn" href="/uhenda/ava?a=chatgpt&lang=et">Ava ChatGPT — juhend on juba sees</a>');
    expect(html).toContain("Vajuta saatmisnuppu ja tee, mida ChatGPT ütleb. Kui ChatGPT hoiatab, et tekst tuli lingist, on see tavaline: tekst on meilt.");
    expect(html).toContain(`<pre id="tekst">${esc(assistantGuidePrompt("et", "chatgpt", endpoint))}</pre>`);
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain("Telefonis: suuna kaamera sellele koodile.");
    expect(html).not.toContain("Jätka telefonis");
    expect(html).not.toContain('class="big-url"');
    const diyAt = html.indexOf('<section class="card" id="ise"><h2>Tee ise, ilma juhendita</h2>');
    expect(diyAt).toBeGreaterThan(html.indexOf('id="connect-status"'));
    expect(html.slice(0, diyAt)).not.toContain('class="step-title"');
    const diy = html.slice(diyAt, html.indexOf("</section>", diyAt));
    expect(diy).toContain('class="step-title"');
    expect(diy).not.toContain("ChatGPT Business");
    expect(html.slice(html.indexOf('class="card connect-hero"'), diyAt)).toContain("ChatGPT Business");
    expect(html).not.toContain('<summary id="steps-h"');
    expect([...html.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1])).toEqual(["Kopeeri aadress", "Ava ChatGPT seadetes ühendused, lisa uus ühendus ja kleebi sinna aadress.", "Logi sisse ja vali, mida assistent tohib"]);
    expect(html).toContain("Ootan, et ChatGPT ühenduks…");
    expect(html).toContain('href="/connection">Andmed ja õigused');
    expect(html).toContain('href="/vali"');
    expect(html).not.toContain('href="/setup"');
    const main = html.slice(0, html.indexOf('<details class="tech-details">'));
    expect(main).not.toMatch(/\bMCP\b|OAuth|scope|progress:/);
    const htmlEn = await connectBody({ lang: "en", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true, expanded: true });
    expect(htmlEn).toContain("Easiest start: Claude — works on the free plan too.");
    expect(htmlEn).toContain("On ChatGPT Pro, deadlines and guidance work (read-only). Approvals (“Approve exactly this”) need ChatGPT Business.");
    expect(htmlEn).toContain('<a class="btn" href="/uhenda/ava?a=chatgpt&lang=en">Open ChatGPT — the guide is already in</a>');
    expect(htmlEn).toContain(`<pre id="tekst">${esc(assistantGuidePrompt("en", "chatgpt", endpoint))}</pre>`);
    expect(htmlEn).toContain("On your phone: point the camera at this code.");
    expect(htmlEn).toContain("Press the send button and do what ChatGPT says. If ChatGPT warns that the text came from a link, that is normal: the text is from us.");
    const claude = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "anon" }, owner: false, expanded: true });
    expect(claude).toContain('<a class="btn" href="/uhenda/ava?a=claude&lang=et">Ava Claude — juhend on juba sees</a>');
    expect(claude).toContain(`<pre id="tekst">${esc(assistantGuidePrompt("et", "claude", endpoint))}</pre>`);
    expect(claude).toContain("Claude lubab kohandatud ühendusi igas paketis (tasuta paketis üks ühendus). Testitud Claude&#39;i tasuta paketis (30.10.2026).");
    expect(claude).not.toContain("pole seda veel testitud");
    const claudeDiy = claude.indexOf('<section class="card" id="ise"><h2>Tee ise, ilma juhendita</h2>');
    expect(claude.slice(claude.indexOf('class="card connect-hero"'), claudeDiy)).toContain("Testitud Claude&#39;i tasuta paketis (30.10.2026).");
    expect(claude.slice(claudeDiy, claude.indexOf("</section>", claudeDiy))).not.toContain("Testitud Claude");
    expect(claudeDiy).toBeGreaterThan(claude.indexOf('id="connect-status"'));
    expect(claude.indexOf('class="step-title"')).toBeGreaterThan(claudeDiy);
    const steps = [...claude.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1]);
    expect(steps).toEqual(["Arvutis: Customize → Connectors → Add custom connector. Telefoni äpis: Settings → Connectors → + → Add custom connector.", "Nimi: AI-hüppelaud, aadress:", "Vajuta Connect, logi sisse ja kinnita. Kui Claude küsib tööriista luba, vajuta Allow."]);
    expect(claude).toContain("<code>https:/<wbr>/<wbr>launchpad.example.com/<wbr>mcp</code>");
    expect(claude).toContain("→ Continue → Add. Ära muuda midagi muud.");
    expect(claude).toContain("Logi sisse, et näha, kas sinu assistent on ühendatud.");
    expect(claude).toContain('href="/vali"');
    expect(claude).not.toContain('href="/setup"');
    const claudeEn = await connectBody({ lang: "en", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "anon" }, owner: false, expanded: true });
    expect(claudeEn).toContain("Tested on Claude&#39;s Free plan (30 Oct 2026).");
    expect(claudeEn).toContain('<a class="btn" href="/uhenda/ava?a=claude&lang=en">Open Claude — the guide is already in</a>');
    expect(claudeEn).toContain(`<pre id="tekst">${esc(assistantGuidePrompt("en", "claude", endpoint))}</pre>`);
    expect([...claudeEn.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1])).toEqual(["On a computer: Customize → Connectors → Add custom connector. In the phone app: Settings → Connectors → + → Add custom connector.", "Name: AI Launchpad, address:", "Press Connect, sign in and confirm. If Claude asks for tool permission, press Allow."]);
    const ok = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "connected", who: "ChatGPT", at: "2026-11-03T12:32:00Z" }, owner: true, now: NOW });
    expect(ok).toContain("Ühendatud · ChatGPT jõudis kohale kell 14:32");
    expect(ok).toContain("Proovi kohe: „Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?”");
  });

  test("connect: computer and phone are equal alternatives, with shared notes below, in both languages", async () => {
    for (const lang of ["et", "en"] as const) {
      const html = await connectBody({ lang, baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "anon" }, owner: false });
      const row = html.match(/<div class="connect-options">([\s\S]*?)<\/figure><\/div>/)?.[1];
      expect(row).toBeDefined();
      expect(row).toContain(`<div class="connect-option"><h2 class="connect-here">${lang === "et" ? "Selles arvutis" : "On this computer"}</h2>`);
      expect(row).toContain(`<span class="connect-or">${lang === "et" ? "või" : "or"}</span>`);
      expect(row).toMatch(new RegExp(`<figure class="connect-option qr-card"><h2>${lang === "et" ? "Telefonis" : "On your phone"}</h2><div class="qr-box"><svg role="img" aria-label="[^"]+"`));
      expect(row).not.toContain(lang === "et" ? "Claude lubab" : "Claude allows");
      expect(html.indexOf(lang === "et" ? "Claude lubab" : "Claude allows")).toBeGreaterThan(html.indexOf("</figure></div>"));
      expect(html.indexOf(`#tekst"`)).toBeGreaterThan(html.indexOf("</figure></div>"));
    }
    for (const options of [{ baseUrl: "http://localhost:3000" }, { baseUrl: "https://launchpad.example.com", sandbox: true }]) {
      const html = await connectBody({ lang: "en", assistant: "claude", state: { kind: "anon" }, owner: false, ...options });
      expect(html).not.toContain('class="connect-options"');
      expect(html).not.toContain('class="connect-option qr-card"');
    }
  });

  test("connect: the open link follows the selected assistant and language", async () => {
    const link = async (assistant: "chatgpt" | "claude", lang: "et" | "en" = "et") => (await connectBody({ lang, baseUrl: "https://launchpad.example.com", assistant, state: { kind: "anon" }, owner: false })).match(/<a class="btn" href="([^"]+)">/)?.[1];
    expect(await link("claude")).toBe("/uhenda/ava?a=claude&lang=et");
    expect(await link("chatgpt")).toBe("/uhenda/ava?a=chatgpt&lang=et");
    expect(await link("claude", "en")).toBe("/uhenda/ava?a=claude&lang=en");
  });

  test("connect: default hides the prompt and the steps behind naita=1 links; expanded keeps them open (tribunal T-004)", async () => {
    const endpoint = "https://launchpad.example.com/mcp";
    const closed = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true });
    expect(closed).toContain('<a class="tap-link" href="/uhenda?a=chatgpt&naita=1#tekst">Näita teksti</a>');
    expect(closed).toContain('<a class="tap-link" href="/uhenda?a=chatgpt&naita=1#ise">Tee ise, ilma juhendita</a>');
    expect(closed).toContain('<a href="/uhenda?a=chatgpt" aria-current="true">ChatGPT</a>');
    expect(closed).toContain('<a href="/uhenda?a=claude">Claude</a>');
    expect(closed).not.toContain("<pre");
    expect(closed).not.toContain('class="step-title"');
    expect(closed).not.toContain('class="steps-big"');
    expect(closed).not.toContain('id="tekst"');
    expect(closed).not.toContain('id="ise"');
    expect(closed).toContain("ChatGPT Business");
    const open = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true, expanded: true });
    expect(open).toContain(`<pre id="tekst">${esc(assistantGuidePrompt("et", "chatgpt", endpoint))}</pre>`);
    expect(open).not.toContain("Näita teksti");
    const iseAt = open.indexOf('<section class="card" id="ise">');
    const ise = open.slice(iseAt, open.indexOf("</section>", iseAt));
    expect(ise).toContain("<h2>Tee ise, ilma juhendita</h2>");
    expect([...ise.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map((m) => m[1])).toEqual(["Kopeeri aadress", "Ava ChatGPT seadetes ühendused, lisa uus ühendus ja kleebi sinna aadress.", "Logi sisse ja vali, mida assistent tohib"]);
    expect(open).toContain('<a href="/uhenda?a=chatgpt" aria-current="true">ChatGPT</a>');
    const en = await connectBody({ lang: "en", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "waiting" }, owner: true });
    expect(en).toContain('<a class="tap-link" href="/uhenda?a=claude&naita=1#tekst">Show the text</a>');
    expect(en).toContain('<a class="tap-link" href="/uhenda?a=claude&naita=1#ise">Do it yourself, without the guide</a>');
    expect(en).not.toContain("<pre");
    expect(en).not.toContain('class="steps-big"');
  });

  test("approval card: H1 is the document, why, period, 24 h validity, decided states hand the turn back", () => {
    const pending = approvalCardBody({ csrf: "c", a: approval(), lang: "et", sample: true, now: NOW });
    // T2 ticket: the request type sits on the kind line, the h1 holds the object; the amount is the hero figure.
    expect(pending).toContain('<p class="kind">Sõnum · Maksemeeldetuletus<small>');
    expect(pending).toContain('<h1 id="a-h">Arve 2026-014 · Demo Klient OÜ</h1>');
    expect(pending).toMatch(/<div class="amount"><b>240,00\u00a0€<\/b><span>oktoober 2026<\/span><\/div>/);
    // One decision form, pinned as the .decide bar: approve, then decline as a text button.
    expect(pending.match(/name="decision"/g)).toHaveLength(2);
    expect(pending).toMatch(/<form class="decide" method="post" action="\/approvals\/appr_1\/decide">.*<button name="decision" value="approve">Kinnita täpselt see<\/button><button class="text danger" name="decision" value="decline">Keeldu<\/button><\/form>/);
    expect(pending.indexOf('<dl class="facts">')).toBeLessThan(pending.indexOf('<pre class="letter" tabindex="0">'));
    expect(pending.indexOf('<pre class="letter" tabindex="0">')).toBeLessThan(pending.indexOf('value="approve"'));
    expect(pending).toContain("<strong>Miks:</strong> Demo Klient OÜ pole arvet tasunud.");
    expect(pending).toContain("oktoober 2026");
    expect(pending).toContain("Kiri, täpselt sellisena");
    // A non-breaking hyphen: "-ni" never wraps onto its own line (QA D-22).
    expect(pending).toContain("Kehtib 24 tundi, kuni homme kella 14:31\u2011ni.");
    expect(pending).not.toContain("14:31-ni");
    expect(pending).not.toContain("15 minutit");
    const approved = approvalCardBody({ csrf: "c", a: approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z" }), lang: "et", sample: true, now: NOW });
    expect(approved).toContain('<div class="strip strip--ok"><span class="stamp" aria-hidden="true"><svg');
    expect(approved).toContain('<h1 class="receipt-head" id="a-h">Kinnitatud 14:36</h1>');
    expect(approved).toContain('<p class="turn" role="status"><strong>Nüüd on assistendi kord.</strong>');
    // Standing offer: one sentence + one primary; the scope radios and cap sit under „Muuda piire”, same fields and endpoint.
    // The cap sits in .cap-now, hidden while „Muuda piire” is open; the inner button after the field submits an edited cap (QA M1).
    expect(approved).toContain('<h2 id="so-h">Luba edaspidi sarnased automaatselt: ainult Demo Klient OÜ<span class="cap-now">, kuni 300\u00a0€</span></h2>');
    expect(approved).toMatch(/<form method="post" action="\/standing-approvals">[^]*<button type="submit">Luba automaatselt<\/button>\n<details><summary>Muuda piire<\/summary>[^]*name="scope" value="recipient" checked[^]*name="max_eur"[^]*>\n<button type="submit">Luba automaatselt<\/button>\n<\/details><\/form>/);
    expect(approved).toContain("Nüüd on assistendi kord.");
    expect(approved).toContain("Kinnitasin");
    expect(approved).toContain("Saadetud: ootab assistendi teadet");
    expect(approved).not.toContain("<script");
    expect(approvalCardBody({ csrf: "c", a: approval({ state: "declined", decided_at: "2026-11-03T12:36:00Z" }), lang: "et", sample: false, now: NOW })).toContain("Keeldusid. Midagi ei saadetud. Ütle assistendile, mida muuta.");
  });

  test("a customer follow-up send shows no standing offer or coverage; a payment reminder still does (#96)", () => {
    const covering: StandingRule = { id: "rule_1", owner_id: "o", kind: "send_message", recipients_json: null, max_amount_cents: 30_000, max_per_day: 10, expires_at: "2027-02-10T00:00:00Z", created_at: "2026-11-01T00:00:00Z", revoked_at: null };
    const follow = (payload: Record<string, unknown>, playbook: string | null = "customer-follow-ups") => approval({
      state: "approved", decided_at: "2026-11-03T12:36:00Z", playbook_id: playbook,
      payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Pakkumine OÜ", address: "info@pakkumine.example" }, period: "2026-11-12", document: { title: "Järgmine kõne", content: "Tere!" }, summary: "Follow up on the quote", ...payload }),
    });
    const card = (a: ApprovalRow, rules: StandingRule[] = [covering]) => approvalCardBody({ csrf: "c", a, lang: "et", sample: false, now: NOW, rules });
    for (const a of [follow({}), follow({ amount_cents: 24_000 }), follow({}, null)]) {
      const html = card(a);
      expect(html).not.toContain("Luba edaspidi");
      expect(html).not.toContain("Püsiluba on olemas");
      expect(html).not.toContain('action="/standing-approvals"');
      expect(html).not.toContain('class="standing-offer"');
    }
    const reminder = card(approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z", playbook_id: "payment-reminder" }));
    expect(reminder).toContain("Püsiluba on olemas");
    expect(reminder).not.toContain("Luba edaspidi sarnased automaatselt");
    const offered = approvalCardBody({ csrf: "c", a: approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z", playbook_id: "payment-reminder" }), lang: "et", sample: false, now: NOW });
    expect(offered).toContain("Luba edaspidi sarnased automaatselt");
  });
});

describe("/uhenda/ava", () => {
  let server: Server;
  let base = "";
  const cfg: Config = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const db = openDb(":memory:");
  const { app } = createApp(cfg, db);
  beforeAll(async () => {
    await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    cfg.baseUrl = base;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => { db.close(); ok(); })));

  test("302 Location decodes to the guide prompt and contains the endpoint; ?lang=en is English; the body is a fallback link, not Express's redirect text", async () => {
    const endpoint = `${base}/mcp`;
    const location = async (path: string) => {
      const r = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(r.status).toBe(302);
      const loc = r.headers.get("location") ?? "";
      const html = await r.text();
      expect(html).not.toContain("Redirecting to");
      expect(html).toContain(`<a class="btn" href="${esc(loc)}">`);
      expect(html).toContain('<a class="tap-link" href="/uhenda">');
      const gpt = path.includes("a=chatgpt");
      if (path.includes("lang=en")) {
        expect(html).toContain(">press here</a>");
        expect(html).toContain("Back: Connection");
        expect(html).toContain(gpt ? "<h1>Opened ChatGPT</h1>" : "<h1>Opened Claude</h1>");
        expect(html).toContain(gpt ? "<title>Opened ChatGPT · AI Launchpad</title>" : "<title>Opened Claude · AI Launchpad</title>");
      } else {
        expect(html).toContain(">vajuta siia</a>");
        expect(html).toContain("Tagasi: Ühendus");
        expect(html).toContain(gpt ? "<h1>Avasin ChatGPT</h1>" : "<h1>Avasin Claude&#39;i</h1>");
        expect(html).toContain(gpt ? "<title>Avasin ChatGPT · AI-hüppelaud</title>" : "<title>Avasin Claude&#39;i · AI-hüppelaud</title>");
        expect(html).not.toContain("-i</h1>");
      }
      return loc;
    };
    const claudeLoc = await location("/uhenda/ava");
    expect(claudeLoc.startsWith("https://claude.ai/new?q=")).toBe(true);
    expect(new URL(claudeLoc).origin).toBe("https://claude.ai");
    const claudeQ = new URL(claudeLoc).searchParams.get("q");
    expect(claudeQ).toBe(assistantGuidePrompt("et", "claude", endpoint));
    expect(claudeQ).toContain(endpoint);
    expect(claudeQ).toContain("Continue");
    expect(claudeQ).toContain("Customize → Connectors");
    expect(claudeQ).toContain("Settings → Connectors → +");
    expect(claudeQ).toBe(`Tere! Aita mul ühendada AI-hüppelaud oma Claude'iga. Juhenda mind lihtsate sõnadega, üks samm korraga, ja oota, kuni ütlen „tehtud”.\n1. Arvutis: Customize → Connectors → Add custom connector. Telefoni äpis: Settings → Connectors → + → Add custom connector.\n2. Nimi: AI-hüppelaud. Aadress: ${endpoint}. Vajuta Continue ja siis Add. Ära muuda midagi muud.\n3. Vajuta Connect, logi sisse ja kinnita. Kui küsitakse tööriista luba, vali Always allow.\nKui ühendus töötab, kasuta AI-hüppelaua tööriista get_started.`);

    const gptLoc = await location("/uhenda/ava?a=chatgpt");
    expect(gptLoc.startsWith("https://chatgpt.com/?q=")).toBe(true);
    expect(new URL(gptLoc).origin).toBe("https://chatgpt.com");
    const gptQ = new URL(gptLoc).searchParams.get("q");
    expect(gptQ).toBe(assistantGuidePrompt("et", "chatgpt", endpoint));
    expect(gptQ).toContain(endpoint);
    expect(gptQ).toBe(`Tere! Aita mul ühendada AI-hüppelaud oma ChatGPT-ga. Juhenda mind lihtsate sõnadega, üks samm korraga, ja oota, kuni ütlen „tehtud”.\n1. Ava seadetes ühendused (Apps) ja lisa uus ühendus.\n2. Nimi: AI-hüppelaud. Aadress: ${endpoint}.\n3. Logi sisse ja kinnita.\nKui ühendus töötab, kasuta AI-hüppelaua tööriista get_started.`);

    const enLoc = await location("/uhenda/ava?lang=en");
    const enQ = new URL(enLoc).searchParams.get("q");
    expect(enQ).toBe(assistantGuidePrompt("en", "claude", endpoint));
    expect(enQ).toContain("Continue");
    expect(enQ).toContain("Customize → Connectors");
    expect(enQ).toContain("Settings → Connectors → +");
    expect(enQ).toBe(`Hi! Help me connect AI Launchpad to my Claude. Guide me in plain words, one step at a time, and wait until I say "done".\n1. On a computer: Customize → Connectors → Add custom connector. In the phone app: Settings → Connectors → + → Add custom connector.\n2. Name: AI Launchpad. Address: ${endpoint}. Press Continue, then Add. Change nothing else.\n3. Press Connect, sign in and confirm. If asked for tool permission, choose Always allow.\nOnce the connection works, use the AI Launchpad tool get_started.`);
    expect(enQ).not.toContain("Tere!");

    const enGpt = new URL(await location("/uhenda/ava?a=chatgpt&lang=en")).searchParams.get("q");
    expect(enGpt).toBe(`Hi! Help me connect AI Launchpad to my ChatGPT. Guide me in plain words, one step at a time, and wait until I say "done".\n1. In settings open connectors (Apps) and add a new connector.\n2. Name: AI Launchpad. Address: ${endpoint}.\n3. Sign in and confirm.\nOnce the connection works, use the AI Launchpad tool get_started.`);

    // A crafted assistant value cannot change the redirect host.
    const fixed = new URL(await location("/uhenda/ava?a=https://evil.example/phish"));
    expect(fixed.origin).toBe("https://claude.ai");
    expect(fixed.pathname).toBe("/new");
  });

  test("a local server hides the open link and the prompt; naita=1 shows the do-it-yourself steps", async () => {
    const html = await (await fetch(`${base}/uhenda?a=claude`)).text();
    expect(html).not.toContain("/uhenda/ava");
    expect(html).not.toContain("<pre>");
    expect(html).toContain("Avalik HTTPS-aadress pole selles serveris veel seadistatud");
    expect(html).not.toContain("<svg");
    expect(html).toContain('<a class="tap-link" href="/uhenda?a=claude&naita=1#ise">Tee ise, ilma juhendita</a>');
    expect(html).not.toContain('class="step-title"');
    expect(html).not.toContain('id="tekst"');
    const en = await (await fetch(`${base}/uhenda?a=chatgpt&lang=en`)).text();
    expect(en).not.toContain("/uhenda/ava");
    expect(en).not.toContain("<pre>");
    expect(en).toContain("A public HTTPS address is not configured on this server yet");
    expect(en).toContain('<a class="tap-link" href="/uhenda?a=chatgpt&naita=1#ise">Do it yourself, without the guide</a>');
    expect(en).not.toContain('class="step-title"');
    const open = await (await fetch(`${base}/uhenda?a=claude&naita=1`)).text();
    expect(open).toContain('<section class="card" id="ise"><h2>Tee ise, ilma juhendita</h2>');
    expect(open).toContain('class="step-title"');
    expect(open).not.toContain("<pre>");
    expect(open).not.toContain('href="/uhenda?a=claude&naita=1#ise"');
  });
});

describe("QA minors (#21)", () => {
  const sentRow = approval({ id: "appr_s", state: "consumed", decided_at: "2026-11-03T08:00:00Z", consumed_at: "2026-11-03T09:00:00Z", outcome_json: JSON.stringify({ outcome: "sent", observed_at: "2026-11-03T09:00:00Z", history: [{ outcome: "sent", observed_at: "2026-11-03T09:00:00Z" }] }) });
  test("approvals history marks synthetic outcomes Saadetud: demo, as on the card and Täna (QA D-05)", () => {
    expect(approvalsListBody([sentRow], "et", true, NOW)).toContain('<span class="state-chip state-chip--sent state-chip--demo">Saadetud: demo</span>');
    expect(approvalsListBody([sentRow], "en", true, NOW)).toContain("Sent: demo");
    expect(approvalsListBody([sentRow], "et", false, NOW)).not.toContain(": demo");
  });
  test("EN approved card asks for “Approved” and accepts either word (QA D-18)", () => {
    const en = approvalCardBody({ csrf: "c", a: approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z" }), lang: "en", sample: false, now: NOW });
    expect(en).toContain("write <code>Approved</code> (“Kinnitasin” works too).");
  });
  test("QR only on a public HTTPS address; localhost shows the note instead (QA D-14)", async () => {
    const local = await connectBody({ lang: "et", baseUrl: "http://127.0.0.1:3210", assistant: "chatgpt", state: { kind: "anon" }, owner: false });
    expect(local).not.toContain("Jätka telefonis");
    expect(local).not.toContain("<svg");
    expect(local).not.toContain("/uhenda/ava");
    expect(local).not.toContain("<pre>");
    expect(local).not.toContain('class="step-title"');
    expect(local).toContain('<a class="tap-link" href="/uhenda?a=chatgpt&naita=1#ise">Tee ise, ilma juhendita</a>');
    expect(local).not.toContain("#tekst");
    expect(local).toContain("Avalik HTTPS-aadress pole selles serveris veel seadistatud");
    const localhost = await connectBody({ lang: "et", baseUrl: "http://localhost:3000", assistant: "claude", state: { kind: "anon" }, owner: false });
    expect(localhost).not.toContain("<svg");
    expect(localhost).not.toContain("/uhenda/ava");
    expect(localhost).not.toContain("<pre>");
    expect(localhost).toContain('<a class="tap-link" href="/uhenda?a=claude&naita=1#ise">Tee ise, ilma juhendita</a>');
    expect(localhost).toContain("Avalik HTTPS-aadress pole selles serveris veel seadistatud");
    const https = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "anon" }, owner: false });
    expect(https).toContain("<svg");
    expect(https).toContain('<a class="btn" href="/uhenda/ava?a=chatgpt&lang=et">Ava ChatGPT — juhend on juba sees</a>');
    expect(https).toContain('<a class="tap-link" href="/uhenda?a=chatgpt&naita=1#tekst">Näita teksti</a>');
    expect(https).not.toContain("<pre>");
    expect(https).not.toContain("Jätka telefonis");
    expect(https).not.toContain("Avalik HTTPS-aadress pole selles serveris veel seadistatud");
  });
  test("Tulekul company line has no leading separator when the name is unknown (QA D-23)", () => {
    const told = { ...mariDeadlines, company: { ...mariDeadlines.company, name: null, synthetic: false, provenance: "assistant_supplied" as const, label_et: "Assistendi teade · avalikust registrist ei loetud" } };
    expect(tana({ deadlines: told })).toContain('<span class="small muted">19990001</span>');
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
  test("Tehtud: finished work in plain verbs; raw log only under Tehniline info", () => {
    const rows = [
      { action: "record_action_outcome", actor: "assistant", outcome: "ok", created_at: "2026-11-03T12:37:00Z", summary: "Outcome sent for approval appr_1 (assistant reported, not verified)." },
      { action: "approval_decided", actor: "owner", outcome: "approved", created_at: "2026-11-03T12:36:00Z", summary: "Owner approved send_message" },
      { action: "get_obligations", actor: "assistant", outcome: "ok", created_at: "2026-11-03T12:30:00Z", summary: "Read deadlines" },
    ];
    const html = activityBody({ rows, receipts: [], exclusions: [], lang: "et", now: NOW });
    expect(html).toContain('class="section timeline"');
    expect(html).toContain("See pole täielik auditilogi");
    const main = html.slice(0, html.indexOf('<details class="tech-details">'));
    expect(main).toContain("Assistent teatas, mis kinnitatud tööga juhtus");
    expect(main).toContain("Sina kinnitasid");
    expect(main).not.toContain("get_obligations");
    expect(main.replace(/datetime="[^"]*"/g, "")).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|UTC/);
    expect(main).toContain("täna, 14:37");
    expect(html.slice(html.indexOf('<details class="tech-details">'))).toContain("get_obligations");
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

describe("„Käest ära” (#61)", () => {
  const consumed = approval({ id: "appr_done", state: "consumed", decided_at: "2026-11-02T09:00:00Z", consumed_at: "2026-11-02T10:00:00Z", outcome_json: JSON.stringify({ outcome: "sent", history: [] }) });
  const h = computeHandover({ assessment, obligations: mari.obligations, approvals: [consumed, approval()], rules: [], now: NOW });

  test("Täna: one strip under the pills with the count, linking to Ühendus, before the primary action; no percentage", () => {
    const html = tana({ handover: h, approvals: [approval()] });
    const strip = html.match(/<a class="ho-strip"[^]*?<\/a>/)![0];
    expect(strip).toContain('href="/uhenda#kaest-ara"');
    expect(strip).toContain(`<b>Käest ära: <span class="num">1</span> töö ${h.total}-st</b>`);
    expect(strip).not.toContain("%");
    expect(strip.match(/<li class="ho-seg/g)).toHaveLength(h.total);
    expect(html.indexOf('class="today-sum"')).toBeLessThan(html.indexOf('class="ho-strip"'));
    expect(html.indexOf('class="ho-strip"')).toBeLessThan(html.indexOf('class="btn" href="/approvals/'));
    expect(tana()).not.toContain("ho-strip");
  });

  test("Ühendus: #kaest-ara above Püsiload, one .ask, at most one filled button, the rule explained; owner-only", async () => {
    const html = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "sample" }, owner: true, now: NOW, standing: { csrf: "csrf-x", rules: [] }, handover: h });
    const section = html.match(/<section class="section ho" id="kaest-ara"[^]*?<\/section>/)![0];
    expect(html.indexOf('id="kaest-ara"')).toBeLessThan(html.indexOf('id="pusiload"'));
    expect(section.match(/class="ask"/g)).toHaveLength(1);
    // One filled button outside „Muuda piire”; its twin inside submits an edited cap (QA M1).
    expect((section.replace(/<details>[\s\S]*?<\/details>/g, "").match(/<button type="submit">/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(section).not.toContain("%");
    expect(section).toContain("Kuidas see arvutatakse");
    expect(section).toContain("Assistendi hinnang");
    const en = await connectBody({ lang: "en", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "sample" }, owner: true, now: NOW, standing: { csrf: "csrf-x", rules: [] }, handover: h });
    expect(en).toContain(`of ${h.total} jobs are off your plate`);
    expect(await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "anon" }, owner: false, handover: h })).not.toContain("kaest-ara");
  });
});
