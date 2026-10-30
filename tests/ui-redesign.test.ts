import { describe, expect, test } from "vitest";
import { shell, loginBody, tanaBody, deadlinesList, approvalsListBody, activityBody, connectionBody, setupBody, landingBody, connectBody, approvalCardBody, fmtEur, fmtDeadline, fmtPeriod, fmtWhen, type TanaOpts } from "../src/views.js";
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
    expect(html).toContain("Kui ei maksnud ega olnud töötajat, kaob 10. novembri TSD rida.");
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

  test("the payouts question maps to the TSD row of the same period, never the first conditional one (#21, QA D-01, D-16)", () => {
    // 3 Nov: the October question goes with the 10 Nov row (October payouts), even when the 10 Dec row is listed first.
    const reordered = { ...mariDeadlines, obligations: [...mariDeadlines.obligations].reverse() };
    const html = tana({ deadlines: reordered });
    expect(html).toContain("„Kas maksid oktoobris palka, juhatuse liikme tasu või dividende?” Kui ei maksnud ega olnud töötajat, kaob 10. novembri TSD rida.");
    expect(html).not.toContain("detsembri TSD");
    // 30 Oct: September's TSD (due 12 Oct) is past, so no September question is asked at all.
    const oct30 = new Date("2026-10-30T10:00:00Z"), m = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: oct30, months: 2 });
    const page = tana({ now: oct30, deadlines: { ...mariDeadlines, obligations: m.obligations, facts_needed: m.facts_needed } });
    expect(page).not.toContain("septembris");
    expect(page).not.toContain("TSD rida.");
    // The handoff matches the engine: the row goes away only when there were no payouts and no employee.
    expect(html).toContain("küsib, kas maksid oktoobri palka või oli töötaja; kui kumbagi polnud, kaob see rida");
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
    expect(tul).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
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
  test("landing: what the product does, a labelled CSS-only chat teaser, 3 steps, trust strip, no search (owner 2026-10-30)", () => {
    const et = landingBody({ lang: "et" }), en = landingBody({ lang: "en" });
    for (const s of ["Sinu AI-assistent teeb kontoritöö.", "Sina kinnitad ainult selle, mis sind seob.", "ilma uue äpi ja vormideta", '<a class="btn" href="/uhenda">Ühenda oma assistent</a>',
      '<span class="label-chip label-chip--sample">Näidis</span>', "Mis mul sel kuul adminis ees on?", "<b>20. nov</b> — KMD ja käibemaks", "Arvutatud reeglist", "Allikas: KMS § 27", "<b>10. nov</b> — TSD · kas oktoobris oli väljamakseid?",
      "Saan oktoobri arved KMD jaoks ette valmistada. Kas alustan?", "Jah. Ja meenuta Demo Kliendile tasumata arvet.", "Maksemeeldetuletus", "Demo Klient OÜ", fmtEur(24000, "et"), "Kinnita täpselt see", "✓ Kinnitatud · Saadetud: demo",
      "Kuidas see töötab", "Ühenda oma ChatGPT või Claude (2 minutit)", "Midagi ei saadeta ilma sinu loata", "Tähtajad arvutab reeglistik, mitte tehisaru", "Smart-ID ja allkiri jäävad sinu kätte", 'href="/demand"']) expect(et, s).toContain(s);
    for (const s of ["Your AI assistant does the back office.", "Connect your assistant", ">Sample<", "<b>20 Nov</b>", fmtEur(24000, "en"), "Approve exactly this", "How it works"]) expect(en, s).toContain(s);
    // The animation is decorative (aria-hidden, no focusable element); a visually hidden transcript carries the same conversation.
    expect(et).toContain('<div class="phone" aria-hidden="true">');
    const phone = et.slice(et.indexOf('<div class="phone"'), et.indexOf("<figcaption>"));
    expect(phone).not.toMatch(/<(a|button|input)\b|tabindex/);
    expect(et).toMatch(/<div class="vh"><p>Näidisvestlus:<\/p><ol><li>Sina: Mis mul sel kuul adminis ees on\?<\/li>/);
    // No search, no script, no claim we cannot back.
    for (const html of [et, en]) expect(html).not.toMatch(/<form|<input|<script|name="q"|\bsäästa|\bsaves? \d/i);
    expect(et).not.toContain("automaatselt");
  });

  test("landing teaser: the dates are the engine's for November 2026 (10.11 TSD, 20.11 KMD)", () => {
    const m = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: new Date("2026-11-01T10:00:00Z"), months: 1 });
    const due = Object.fromEntries(m.obligations.map((o) => [o.rule_id, o.effective_due]));
    expect(due["tsd-monthly-return"]).toBe("2026-11-10");
    expect(due["vat-return-kmd"]).toBe("2026-11-20");
  });

  test("landing teaser CSS: final frame is the base state, so reduced motion shows it statically", () => {
    const css = shell({ title: "x", active: "none", csrf: "", body: "" });
    expect(css).toContain("@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important");
    expect(css).toMatch(/\.beat--typing\{max-height:0;opacity:0\}/);
    expect(css).toMatch(/\.mock-approve\{[^}]*opacity:0;animation:lp-approve 18s infinite\}/);
    for (const k of ["me1", "t1", "ai1", "ai2", "ai3", "me2", "t2", "card"]) expect(css, k).toContain(`.b-${k}{animation-name:lp-${k}}@keyframes lp-${k}{`);
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
    expect(claude).toContain("Claude lubab kohandatud ühendusi igas paketis (tasuta paketis üks ühendus). Testitud Claude&#39;i tasuta paketis (30.10.2026).");
    expect(claude).not.toContain("pole seda veel testitud");
    const steps = [...claude.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1]);
    expect(steps).toEqual(["Ava Claude'is Customize → Connectors → Add custom connector", "Nimi: AI-hüppelaud, aadress:", "Vajuta Connect, logi sisse ja kinnita. Kui Claude küsib tööriista luba, vajuta Allow."]);
    expect(claude).toContain("<code>https:/<wbr>/<wbr>launchpad.example.com/<wbr>mcp</code>");
    expect(claude).toContain("→ Continue → Add. Ära muuda midagi muud.");
    const claudeEn = connectBody({ lang: "en", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "anon" }, owner: false });
    expect(claudeEn).toContain("Tested on Claude&#39;s Free plan (30 Oct 2026).");
    expect([...claudeEn.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1])).toEqual(["In Claude open Customize → Connectors → Add custom connector", "Name: AI Launchpad, address:", "Press Connect, sign in and confirm. If Claude asks for tool permission, press Allow."]);
    expect([...html.matchAll(/<h3 class="step-title">(.*?)<\/h3>/g)].map(m => m[1])).toEqual(["Kopeeri aadress", "Ava ChatGPT seadetes ühendused, lisa uus ühendus ja kleebi sinna aadress.", "Logi sisse ja vali, mida assistent tohib"]);
    expect(claude).toContain("Logi sisse, et näha, kas sinu assistent on ühendatud.");
    const ok = connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "connected", who: "ChatGPT", at: "2026-11-03T12:32:00Z" }, owner: true, now: NOW });
    expect(ok).toContain("Ühendatud · ChatGPT jõudis kohale kell 14:32");
    expect(ok).toContain("Proovi kohe: „Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?”");
  });

  test("connect: the phone hand-off URL keeps the selected assistant (tribunal T-005)", () => {
    const phone = (assistant: "chatgpt" | "claude") => connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant, state: { kind: "anon" }, owner: false }).match(/<p class="big-url">(.*?)<\/p>/)?.[1];
    expect(phone("claude")).toBe("https:/<wbr>/<wbr>launchpad.example.com/<wbr>uhenda?a=claude");
    expect(phone("chatgpt")).toBe("https:/<wbr>/<wbr>launchpad.example.com/<wbr>uhenda?a=chatgpt");
  });

  test("approval card: H1 is the document, why, period, 24 h validity, decided states hand the turn back", () => {
    const pending = approvalCardBody({ csrf: "c", a: approval(), lang: "et", sample: true, now: NOW });
    expect(pending).toContain('<h1 id="a-h">Maksemeeldetuletus: arve 2026-014</h1>');
    expect(pending).toContain("<strong>Miks:</strong> Demo Klient OÜ pole arvet tasunud.");
    expect(pending).toContain("oktoober 2026");
    expect(pending).toContain("Kiri, täpselt sellisena");
    // A non-breaking hyphen: "-ni" never wraps onto its own line (QA D-22).
    expect(pending).toContain("Kehtib 24 tundi, kuni homme kella 14:31\u2011ni.");
    expect(pending).not.toContain("14:31-ni");
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

describe("QA minors (#21)", () => {
  const sentRow = approval({ id: "appr_s", state: "consumed", decided_at: "2026-11-03T08:00:00Z", consumed_at: "2026-11-03T09:00:00Z", outcome_json: JSON.stringify({ outcome: "sent", observed_at: "2026-11-03T09:00:00Z", history: [{ outcome: "sent", observed_at: "2026-11-03T09:00:00Z" }] }) });
  test("approvals history marks synthetic outcomes Saadetud: demo, as on the card and Täna (QA D-05)", () => {
    expect(approvalsListBody([sentRow], "et", true, NOW)).toContain('<span class="state-chip state-chip--sent state-chip--demo">Saadetud: demo</span>');
    expect(approvalsListBody([sentRow], "en", true, NOW)).toContain("Sent: demo");
    expect(approvalsListBody([sentRow], "et", false, NOW)).not.toContain(": demo");
  });
  test("EN approved card asks for “Approved” and accepts either word (QA D-18)", () => {
    const en = approvalCardBody({ csrf: "c", a: approval({ state: "approved", decided_at: "2026-11-03T12:36:00Z" }), lang: "en", sample: false, now: NOW });
    expect(en).toContain("write “<code>Approved</code>” (“Kinnitasin” works too).");
  });
  test("no phone hand-off without a public HTTPS address (QA D-14)", () => {
    const local = connectBody({ lang: "et", baseUrl: "http://127.0.0.1:3210", assistant: "chatgpt", state: { kind: "anon" }, owner: false });
    expect(local).not.toContain("Jätka telefonis");
    expect(local).toContain("Avalik HTTPS-aadress pole selles serveris veel seadistatud");
    expect(connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "anon" }, owner: false })).toContain("Jätka telefonis");
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
