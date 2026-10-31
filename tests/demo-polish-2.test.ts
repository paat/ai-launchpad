import { describe, expect, test } from "vitest";
import { tanaBody, handoverSection, activityBody, type TanaOpts } from "../src/views.js";
import { computeObligations } from "../src/obligations.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import { computeCoverage } from "../src/core.js";
import { computeHandover } from "../src/handover.js";

// Demo polish 2 (#63, #52): the Mari Disain OÜ demo path as the owner sees it.
const NOW = new Date("2026-11-03T12:00:00Z");
const alpha = DEMO_FIXTURES.alpha;
const mari = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
const mariDeadlines = { company: { name: "Mari Disain OÜ", registry_code: "19990001", synthetic: true, provenance: "synthetic_fixture" as const, label_et: "Näidis · väljamõeldud ettevõte", label_en: "Sample · made-up company", snapshot_id: null, as_of: null, sources: [], attribution: "Synthetic fixture; no real register data." }, obligations: mari.obligations, facts_needed: mari.facts_needed };
const handover = computeHandover({ assessment: alpha, obligations: mari.obligations, approvals: [], rules: [], now: NOW });
const tana = (over: Partial<TanaOpts> = {}) => tanaBody({ lang: "et", csrf: "c", sample: true, label: "Mari Disain OÜ (näidis)", assessment: alpha, coverage: computeCoverage(alpha), assessedAt: "2026-11-01T10:00:00Z", exclusions: [], approvals: [], progress: [], deadlines: mariDeadlines, needs: [], reportCount: 1, handover, now: NOW, ...over });
const kmdRow = (html: string) => html.match(/<li class="deadline-row">(?:(?!<\/li>)[^])*?KMD ja käibemaks[^]*?<\/li>/)![0];

describe("#63 m5: who does the KMD, said once", () => {
  test("Käest ära, Assistent tegi and the KMD row's „Kes mida teeb” all say the accountant prepares it; you file it in e-MTA", () => {
    const ho = handoverSection(handover, "et", "c", NOW).match(/<li class="ho-job">(?:(?!<\/li>)[^])*?KMD ettevalmistus[^]*?<\/li>/)![0];
    expect(ho).toContain("Teeb raamatupidaja");
    const html = tana();
    expect(html).toContain("Lisaks teeb raamatupidaja: KMD ettevalmistus");
    const who = kmdRow(html).match(/<dl class="handoff">[^]*?<\/dl>/)![0];
    expect(who).toContain("Raamatupidaja");
    expect(who).toContain("Assistendi hinnang");
    expect(who).toContain("esitad KMD e-MTA-s");
    // The assistant is not also said to gather the invoices, and the row asks it to do nothing the accountant does.
    expect(kmdRow(html)).not.toContain("kogub");
    expect(kmdRow(html)).not.toContain("Palu assistendilt");
  });

  test("without that assessment the assistant still gathers the invoices", () => {
    const row = kmdRow(tana({ handover: computeHandover({ assessment: null, obligations: mari.obligations, approvals: [], rules: [], now: NOW }) }));
    expect(row).toContain("kogub oktoobri arved kokku");
    expect(row).toContain("Palu assistendilt");
  });
});

describe("#63 m6: the KMD source link in „Käest ära”", () => {
  test("the KMD row carries the official „Allikas” link next to „Arvutatud reeglist”, the same source as its Tulekul row", () => {
    const kmd = mari.obligations.find((x) => x.rule_id === "vat-return-kmd")!;
    for (const l of ["et", "en"] as const) {
      const row = handoverSection(handover, l, "c", NOW).match(/<li class="ho-job">(?:(?!<\/li>)[^])*?(?:KMD ettevalmistus|VAT return \(KMD\))[^]*?<\/li>/)![0];
      expect(row).toMatch(l === "et" ? /Arvutatud reeglist<\/span> <a class="tap-link" href="[^"]+" rel="noopener noreferrer"><span>Allikas: / : /Calculated by rules<\/span> <a class="tap-link" href="[^"]+" rel="noopener noreferrer"><span>Source: /);
      expect(row).toContain(`href="${kmd.source.url}"`);
      expect(kmdRow(tana())).toContain(`href="${kmd.source.url}"`);
    }
  });
});

describe("#63 m12: Tehtud names the job", () => {
  const row = (milestone: string, task = "vat-prep") => ({ actor: "assistant", action: "report_progress", outcome: "ok", summary: `${task}: ${milestone} (assistant reported).`, created_at: "2026-11-03T09:15:00Z" });
  test("a progress row reads as on Täna: „Valmistas ette: KMD ettevalmistus”, with the assistant's label", () => {
    const html = activityBody({ rows: [row("draft_prepared"), row("external_completion_reported", "invoicing"), row("started", "unknown-task")], receipts: [], exclusions: [], lang: "et", now: NOW, assessment: alpha });
    expect(html).toContain("<strong>Valmistas ette: KMD ettevalmistus</strong>");
    expect(html).toContain("<strong>Teatas tehtuks: Arvete koostamine</strong>");
    // A task id the assessment does not name still names itself.
    expect(html).toContain("<strong>Alustas: unknown-task</strong>");
    expect(html).not.toContain("Assistent teatas töö käigust");
    expect(html).toContain("Assistent teatas");
    expect(tana({ progress: [{ task_id: "vat-prep", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }] })).toContain("Valmistas ette: KMD ettevalmistus");
    expect(activityBody({ rows: [row("draft_prepared")], receipts: [], exclusions: [], lang: "en", now: NOW, assessment: alpha })).toContain("<strong>Prepared: ");
  });
});

describe("#63 m13: English Täna on a sample workspace", () => {
  const beta = DEMO_FIXTURES.beta;
  const kase = computeObligations(SYNTHETIC_COMPANIES["19990002"].facts, { today: NOW, months: 2 });
  const en = (a = alpha, over: Partial<TanaOpts> = {}) => tana({ lang: "en", assessment: a, coverage: computeCoverage(a), handover: computeHandover({ assessment: a, obligations: (a === alpha ? mari : kase).obligations, approvals: [], rules: [], now: NOW }), deadlines: a === alpha ? mariDeadlines : { ...mariDeadlines, company: { ...mariDeadlines.company, name: "Kase Konsult OÜ", registry_code: "19990002" }, obligations: kase.obligations, facts_needed: kase.facts_needed }, ...over });
  const strip = (html: string) => html.replace(/<span lang="et">[^<]*<\/span>/g, "");
  test("the fixture's labels show in English; its free text stays as written, marked lang=\"et\"", () => {
    const a = en(alpha, { progress: [{ task_id: "vat-prep", milestone: "draft_prepared", observed_at: "2026-11-03T09:15:00Z" }] }), b = en(beta);
    expect(a).toContain('<p class="company">Mari Disain OÜ (sample)</p>');
    expect(a).toContain("Prepared: VAT return (KMD)");
    expect(a).toContain("Also handled by the accountant: VAT return (KMD)");
    expect(a).toContain("Next step: Let your assistant draft reminders for unpaid invoices");
    expect(a).toContain("<dt>The accountant</dt>");
    expect(a).toContain('<span lang="et">Kaotab arvete käsitsi jälgimise; sina ainult kinnitad iga kirja.</span>');
    expect(a).toContain('<span lang="et">Omaniku põhitöö; see jääb talle. (Näidis.)</span>');
    expect(b).toContain("Next step: Restore the accounting connection");
    expect(b).toContain("Also handled by the accountant: Payroll and TSD data");
    expect(b).toContain('<li class="small"><span lang="et">Kliendi- ja õigusvaldkonda selles näidises ei hinnatud, seega üldist katvust ei näidata.</span></li>');
    // Outside the lang="et" spans no fixture text is left in Estonian.
    for (const html of [a, b]) {
      const rest = strip(html.replace(/<style>[^]*?<\/style>/, ""));
      for (const et of ["näidis)", "Disainitööd", "Arvete koostamine", "Maksemeeldetuletused", "KMD ettevalmistus", "Palgaarvestus", "Raamatupidamise ühendus", "Konsultatsioonitööd", "raamatupidaja", "Raamatupidaja", "Lase assistendil", "Taasta", "Kaotab", "Omaniku"]) expect(rest, et).not.toContain(et);
    }
  });
  test("Estonian, and a real (non-sample) workspace in English, render the assistant's text as written", () => {
    expect(tana()).toContain("Lisaks teeb raamatupidaja: KMD ettevalmistus");
    expect(tana()).not.toContain('<span lang="et">Omaniku');
    const real = en(alpha, { sample: false });
    expect(real).toContain("Also handled by raamatupidaja: KMD ettevalmistus");
    expect(real).not.toContain('<span lang="et">Omaniku');
  });
});

describe("sample English: Ühendus and Tehtud labels", () => {
  test("Ühendus shows „Done by the accountant”; Tehtud names the job in English; Estonian and real workspaces keep the text as written", () => {
    const row = (milestone: string) => ({ actor: "assistant", action: "report_progress", outcome: "ok", summary: `vat-prep: ${milestone} (assistant reported).`, created_at: "2026-11-03T09:15:00Z" });
    const connect = (lang: "et" | "en", sample: boolean) => handoverSection(handover, lang, "c", NOW, sample);
    const en = connect("en", true);
    expect(en).toContain("Done by the accountant");
    expect(en).not.toContain("raamatupidaja");
    expect(connect("et", true)).toContain("Teeb raamatupidaja");
    expect(connect("en", false)).toContain("Done by raamatupidaja");
    const done = (lang: "et" | "en", sample: boolean) => activityBody({ rows: [row("draft_prepared")], receipts: [], exclusions: [], lang, now: NOW, assessment: alpha, sample });
    expect(done("en", true)).toContain("Prepared: VAT return (KMD)");
    expect(done("en", false)).toContain("Prepared: KMD ettevalmistus");
    expect(done("et", true)).toContain("Valmistas ette: KMD ettevalmistus");
  });
});
