import { describe, expect, test } from "vitest";
import { tanaBody, handoverSection, type TanaOpts } from "../src/views.js";
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
