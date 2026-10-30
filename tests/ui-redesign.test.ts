import { describe, expect, test } from "vitest";
import { shell, loginBody, tanaBody, activityBody, connectionBody, setupBody, landingBody, connectBody, approvalCardBody, fmtEur, fmtDeadline, fmtPeriod, fmtWhen, type TanaOpts } from "../src/views.js";
import { computeObligations } from "../src/obligations.js";
import { SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import type { ApprovalRow } from "../src/mcp.js";
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
const NOW = new Date("2026-11-03T12:00:00Z");
const mari = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
const mariDeadlines = { company: { name: "Mari Disain OÜ", registry_code: "19990001", synthetic: true, provenance: "synthetic_fixture" as const, label_et: "Näidis · väljamõeldud ettevõte", label_en: "Sample · made-up company", snapshot_id: null, as_of: null, sources: [], attribution: "Synthetic fixture; no real register data." }, obligations: mari.obligations, facts_needed: mari.facts_needed };
const approval = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({ id: "appr_1", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "pending", created_at: "2026-11-03T12:31:00Z", expires_at: "2026-11-04T12:31:00Z", decided_at: null, consumed_at: null, outcome_json: null,
  payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10", document: { title: "Maksemeeldetuletus: arve 2026-014", content: "Tere!\n\nArve 2026-014 on tasumata." }, summary: "Demo Klient OÜ pole arvet tasunud." }), ...over });
const tana = (over: Partial<TanaOpts> = {}) => tanaBody({ lang: "et", csrf: "csrf-x", sample: true, label: "Synthetic OÜ", assessment, coverage: computeCoverage(assessment), assessedAt: "2026-10-28T10:00:00Z", exclusions: [], approvals: [], progress: [], deadlines: null, needs: [], reportCount: 2, now: NOW, ...over });
const status = (a = assessment) => tana({ assessment: a, coverage: computeCoverage(a) });
const connection = (baseUrl = "https://launchpad.example.com") =>
  connectionBody({ csrf: "csrf-x", baseUrl, reportingEnabled: false, tokens: [], grants: [], candidates: [] });
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
    expect(html).toContain("Kui ei, võib 10. novembri TSD ära jääda.");
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
    expect(tegi).toContain("Assistent tegi (3)");
    expect(tegi).toContain("Demo Klient OÜ");
    expect(tegi).toContain('<span class="state-chip state-chip--sent state-chip--demo">Saadetud: demo</span>');
    expect(tegi).toContain('<span class="label-chip label-chip--assistant">Assistent teatas</span>');
    expect(tegi).toContain("Kinnitatud · ootab assistendi teadet");
    expect(tegi).toContain("Valmistas ette: Sales invoicing");
    expect(tegi).not.toContain("started");
  });

  test("Tulekul rows: date first, rule label, source, handoff with Sina; synthetic is Näidis, never official", () => {
    const html = tana({ deadlines: mariDeadlines });
    const tul = html.slice(html.indexOf('id="tulekul"'));
    expect(tul).toContain('<time class="deadline-date" datetime="2026-11-10">');
    expect(tul).toContain("Arvutatud reeglist");
    expect(tul).toContain('<dt class="me">Sina</dt><dd>esitad KMD e-MTA-s oma Smart-ID-ga</dd>');
    expect(tul).toContain("Summad arvutab sinu raamatupidamisprogramm, mitte tehisaru.");
    expect(tul).toContain("Valmista oktoobri KMD jaoks arved ette ja küsi minult kinnitust enne, kui midagi saadad.");
    expect(tul).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
    expect(html).not.toContain("Ametlik allikas");
  });

  test("no inline script, no time-saved figure, no raw ISO timestamps on the page", () => {
    const claimed = assessmentSchema.parse({ ...assessment, next_action: { ...assessment.next_action, estimated_effort_saved: "3 hours per week", savings_basis: "observed" } });
    const html = tana({ assessment: claimed, coverage: computeCoverage(claimed), deadlines: mariDeadlines, approvals: [approval()] });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("3 hours");
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
  test("landing: one search input, sample results labelled Näidis, honest not-configured state, CTA to /uhenda", () => {
    const empty = landingBody({ lang: "et", q: "", state: { kind: "empty" } });
    expect((empty.match(/<input /g) ?? []).length).toBe(1);
    expect(empty).toContain("Ettevõtte nimi või registrikood");
    const result = landingBody({ lang: "et", q: "Mari", state: { kind: "result", result: mariDeadlines }, now: NOW });
    for (const s of ["Mari Disain OÜ", '<span class="label-chip label-chip--sample">Näidis</span>', "Tähtajad arvutab reeglistik, mitte tehisaru.", "Lase oma assistendil see töö enda peale võtta. Sina kinnitad ainult selle, mis sind seob.", 'href="/uhenda"', '<dt class="me">Sina</dt>']) expect(result, s).toContain(s);
    expect(result).not.toContain("Ametlik allikas");
    expect(landingBody({ lang: "et", q: "12345678", state: { kind: "message", code: "not_configured" } })).toContain("Avaliku registri päring pole veel seadistatud — proovi näidisettevõtet „Mari Disain”.");
    expect(landingBody({ lang: "en", q: "x", state: { kind: "message", code: "ip_limit" } })).toContain("Too many register lookups");
  });

  test("connect: ChatGPT first, honest plan lines, phone URL without QR, technical words only under Tehniline info", () => {
    const html = connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true });
    expect(html).toContain('<a href="/uhenda?a=chatgpt" aria-current="true">ChatGPT</a>');
    expect(html).toContain("Tähtajad töötavad igas ChatGPT paketis. Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.");
    expect(html).toContain("Jätka telefonis");
    expect(html).toContain("https:/<wbr>/<wbr>launchpad.example.com/<wbr>uhenda");
    expect(html).not.toMatch(/<svg|qr-box/);
    expect(html).toContain("Ootan, et ChatGPT ühenduks…");
    expect(html).toContain('href="/connection">Andmed ja õigused');
    const main = html.slice(0, html.indexOf('<details class="tech-details">'));
    expect(main).not.toMatch(/\bMCP\b|OAuth|scope|progress:/);
    const claude = connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "anon" }, owner: false });
    expect(claude).toContain("AI-hüppelauaga pole seda veel testitud.");
    expect(claude).toContain("Logi sisse, et näha, kas sinu assistent on ühendatud.");
    const ok = connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "connected", who: "ChatGPT", at: "2026-11-03T12:32:00Z" }, owner: true, now: NOW });
    expect(ok).toContain("Ühendatud · ChatGPT jõudis kohale kell 14:32");
    expect(ok).toContain("Proovi kohe: „Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?”");
  });

  test("approval card: H1 is the document, why, period, 24 h validity, decided states hand the turn back", () => {
    const pending = approvalCardBody({ csrf: "c", a: approval(), lang: "et", sample: true, now: NOW });
    expect(pending).toContain('<h1 id="a-h">Maksemeeldetuletus: arve 2026-014</h1>');
    expect(pending).toContain("<strong>Miks:</strong> Demo Klient OÜ pole arvet tasunud.");
    expect(pending).toContain("oktoober 2026");
    expect(pending).toContain("Kiri, täpselt sellisena");
    expect(pending).toContain("Kehtib 24 tundi, kuni homme kella 14:31-ni.");
    expect(pending).not.toContain("15 minutit");
    const approved = approvalCardBody({ csrf: "c", a: approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z" }), lang: "et", sample: true, now: NOW });
    expect(approved).toContain("Kinnitatud 14:36");
    expect(approved).toContain("Nüüd on assistendi kord.");
    expect(approved).toContain("Kinnitasin");
    expect(approved).toContain("Saadetud: ootab assistendi teadet");
    expect(approved).not.toContain("<script");
    expect(approvalCardBody({ csrf: "c", a: approval({ state: "declined", decided_at: "2026-11-03T12:36:00Z" }), lang: "et", sample: false, now: NOW })).toContain("Keeldusid. Midagi ei saadetud. Ütle assistendile, mida muuta.");
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
    expect(html).toContain('class="card timeline"');
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
