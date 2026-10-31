import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";
import { assistantFactsSchema, companyObligations, TOOL_ARG_KEYS } from "../src/mcp.js";
import { arikratt, CACHE_TTL_MS, mapCompany } from "../src/arikratt.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "../src/fixtures.js";
import { HANDOFF, computeObligations, easterSunday, publicHolidays, shiftToWorkingDay, validRegistryCode, type CompanyFacts } from "../src/obligations.js";

const MARI = "19990001", KASE = "19990002", FAKE_VALID = "10000062", SLOW = "10000107";
const at = (day: string) => new Date(`${day}T10:00:00Z`);
const ofRule = (facts: CompanyFacts, day: string, rule: string, months = 1) => computeObligations(facts, { today: at(day), months }).obligations.filter((o) => o.rule_id === rule);

describe("rules engine (memo § 3, pure)", () => {
  // Memo § 3: due month → [TSD statutory, TSD effective, KMD statutory, KMD effective].
  const TABLE: [string, string, string, string, string][] = [
    ["2026-11", "2026-11-10", "2026-11-10", "2026-11-20", "2026-11-20"],
    ["2026-12", "2026-12-10", "2026-12-10", "2026-12-20", "2026-12-21"],
    ["2027-01", "2027-01-10", "2027-01-11", "2027-01-20", "2027-01-20"],
    ["2027-02", "2027-02-10", "2027-02-10", "2027-02-20", "2027-02-22"],
    ["2027-03", "2027-03-10", "2027-03-10", "2027-03-20", "2027-03-22"],
    ["2027-04", "2027-04-10", "2027-04-12", "2027-04-20", "2027-04-20"],
    ["2027-05", "2027-05-10", "2027-05-10", "2027-05-20", "2027-05-20"],
    ["2027-06", "2027-06-10", "2027-06-10", "2027-06-20", "2027-06-21"],
    ["2027-07", "2027-07-10", "2027-07-12", "2027-07-20", "2027-07-20"],
    ["2027-08", "2027-08-10", "2027-08-10", "2027-08-20", "2027-08-23"],
    ["2027-09", "2027-09-10", "2027-09-10", "2027-09-20", "2027-09-20"],
    ["2027-10", "2027-10-10", "2027-10-11", "2027-10-20", "2027-10-20"],
    ["2027-11", "2027-11-10", "2027-11-10", "2027-11-20", "2027-11-22"],
    ["2027-12", "2027-12-10", "2027-12-10", "2027-12-20", "2027-12-20"],
  ];
  test.each(TABLE)("%s: TSD %s → %s, KMD %s → %s", (month, tsdS, tsdE, kmdS, kmdE) => {
    const r = computeObligations(SYNTHETIC_COMPANIES[MARI].facts, { today: at(`${month}-01`), months: 1 }).obligations;
    const tsd = r.find((o) => o.rule_id === "tsd-monthly-return")!, kmd = r.find((o) => o.rule_id === "vat-return-kmd")!;
    expect([tsd.statutory_due, tsd.effective_due, tsd.shifted]).toEqual([tsdS, tsdE, tsdS !== tsdE]);
    expect([kmd.statutory_due, kmd.effective_due, kmd.shifted]).toEqual([kmdS, kmdE, kmdS !== kmdE]);
    expect(kmd.covers).toEqual(["vat-return-kmd", "vat-payment"]);
    expect(tsd.covers).toEqual(["tsd-monthly-return", "tsd-tax-payment", "cit-distribution"]);
    for (const o of r) expect(o.source.url).toMatch(/^https:\/\/www\.riigiteataja\.ee\/akt\/\d+$/);
  });
  test("cross-checks: EMTA 10 Oct 2026 → 12 Oct; RIK 30 Jun 2024 → 1 Jul", () => {
    expect(shiftToWorkingDay("2026-10-10")).toBe("2026-10-12");
    expect(shiftToWorkingDay("2024-06-30")).toBe("2024-07-01");
  });
  test("annual report FY 2026 is due Wed 30 Jun 2027; overdue is a risk row with the deletion date and no fine amount", () => {
    const due = ofRule(SYNTHETIC_COMPANIES[MARI].facts, "2027-06-01", "annual-report");
    expect(due).toMatchObject([{ statutory_due: "2027-06-30", effective_due: "2027-06-30", applies: "yes", period_label_et: "2026. a majandusaasta aruanne", source: { section: "§ 179 lg 4" } }]);
    const late = ofRule(SYNTHETIC_COMPANIES[MARI].facts, "2027-07-05", "annual-report-overdue");
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ kind: "risk", applies: "yes", statutory_due: "2027-06-30" });
    // Owner-facing dates are civil dates, never ISO (QA D-11).
    expect(late[0].reason_et).toContain("alates 30.09.2027");
    expect(late[0].reason_en).toContain("from 30 September 2027");
    expect(JSON.stringify(late[0])).not.toMatch(/€|eurot|\d+ EUR/);
    // Non-calendar FY (TsÜS § 136 lg 3–4): FY end 30 Jun → due 30 Dec.
    const fy = ofRule({ ...SYNTHETIC_COMPANIES[MARI].facts, fy_end: { value: "06-30", provenance: "assistant_supplied" } }, "2026-12-01", "annual-report");
    expect(fy[0]).toMatchObject({ statutory_due: "2026-12-30", effective_due: "2026-12-30" });
  });

  test("holiday shifts: Saturday, Sunday and PTS days off, Easter by computus 2025–2030", () => {
    expect([2025, 2026, 2027, 2028, 2029, 2030].map(easterSunday)).toEqual(["2025-04-20", "2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"]);
    const h27 = publicHolidays(2027);
    for (const d of ["2027-01-01", "2027-02-24", "2027-03-26", "2027-03-28", "2027-05-01", "2027-05-16", "2027-06-23", "2027-06-24", "2027-08-20", "2027-12-24", "2027-12-25", "2027-12-26"]) expect(h27.has(d), d).toBe(true);
    for (const d of ["2026-12-24", "2026-12-25", "2026-12-26"]) expect(publicHolidays(2026).has(d), d).toBe(true);
    expect(publicHolidays(2026).has("2026-11-16")).toBe(false); // riiklik tähtpäev, not a day off
    expect(shiftToWorkingDay("2027-08-20")).toBe("2027-08-23");
    expect(shiftToWorkingDay("2027-03-26")).toBe("2027-03-29");
    expect(shiftToWorkingDay("2026-12-24")).toBe("2026-12-28");
    expect(shiftToWorkingDay("2027-01-01")).toBe("2027-01-04");
    expect(shiftToWorkingDay("2027-02-24")).toBe("2027-02-25");
    expect(shiftToWorkingDay("2026-11-16")).toBe("2026-11-16");
  });

  test("RIK checksum: valid and invalid codes, including the second weighting round", () => {
    expect(validRegistryCode("12417834")).toBe(true);
    expect(validRegistryCode("10000062")).toBe(true); // first round = 10 → weights 3–9
    for (const bad of ["12417835", "10000060", "1241783", "124178341", "abcdefgh", "", MARI, KASE]) expect(validRegistryCode(bad), bad).toBe(false);
  });

  test("unknown facts give applies: if with a condition; nothing is dropped and nothing is invented", () => {
    const mari = ofRule(SYNTHETIC_COMPANIES[MARI].facts, "2026-11-01", "tsd-monthly-return");
    expect(mari[0]).toMatchObject({ applies: "if", condition_et: "Kehtib, kui maksid oktoobris palka, juhatuse liikme tasu või dividende või kui sul on töölepinguga töötaja." });
    expect(mari[0].applies_because.map((b) => b.fact)).not.toContain("payouts_last_month");
    const none = computeObligations({}, { today: at("2026-11-02"), months: 1 });
    expect(none.obligations.map((o) => [o.rule_id, o.applies])).toEqual([["annual-report-overdue", "if"], ["tsd-monthly-return", "if"], ["vat-return-kmd", "if"]]);
    expect(none.obligations.every((o) => o.applies_because.length === 0 && o.condition_et && o.condition_en)).toBe(true);
    expect(none.facts_needed.map((n) => n.fact)).toEqual(["vat_registered", "payouts_last_month", "fy_end", "annual_report"]);
    // Known facts decide: payouts → yes; assistant says no payouts and no other TSD trigger → no zero-return row.
    const paid = { ...SYNTHETIC_COMPANIES[MARI].facts, payouts_last_month: { value: true, provenance: "assistant_supplied" as const } };
    expect(ofRule(paid, "2026-11-01", "tsd-monthly-return")[0]).toMatchObject({ applies: "yes", applies_because: [{ fact: "payouts_last_month", provenance: "assistant_supplied" }, { fact: "employees" }, { fact: "labour_taxes_last_quarter" }] });
    expect(ofRule({ ...paid, payouts_last_month: { value: false, provenance: "assistant_supplied" }, other_tsd_triggers_last_month: { value: false, provenance: "assistant_supplied" } }, "2026-11-01", "tsd-monthly-return")).toEqual([]);
  });

  test("TSD: register employees 0 (lagged quarter, no board members) never suppresses the row", () => {
    const facts: CompanyFacts = { employees: { value: 0, provenance: "public_register" }, labour_taxes_last_quarter: { value: 0, provenance: "public_register" }, payouts_last_month: { value: false, provenance: "assistant_supplied" } };
    const r = computeObligations(facts, { today: at("2026-11-01"), months: 1 });
    expect(r.obligations.filter((o) => o.rule_id === "tsd-monthly-return")).toMatchObject([{ applies: "if", condition_en: expect.stringContaining("employee") }]);
    expect(r.facts_needed.map((n) => n.fact)).toContain("other_tsd_triggers_last_month");
    // Labour taxes in the latest quarter are lagged: likely, never yes.
    expect(ofRule({ ...facts, labour_taxes_last_quarter: { value: 900, provenance: "public_register" } }, "2026-11-01", "tsd-monthly-return")).toMatchObject([{ applies: "if" }]);
    // Both "no" facts must come from the assistant.
    expect(ofRule({ ...facts, other_tsd_triggers_last_month: { value: false, provenance: "public_register" } }, "2026-11-01", "tsd-monthly-return")).toMatchObject([{ applies: "if" }]);
  });

  test("TSD: lagged labour taxes give applies: if with a likely reason; payouts questions only for an in-window row (tribunal T-001)", () => {
    const labour: CompanyFacts = { labour_taxes_last_quarter: { value: 900, provenance: "public_register" } };
    const rows = ofRule(labour, "2026-11-01", "tsd-monthly-return", 3);
    expect(rows.length).toBe(3);
    for (const o of rows) expect(o).toMatchObject({ applies: "if", condition_et: expect.stringContaining("Kehtib, kui"), condition_en: expect.stringContaining("Applies if"), reason_et: "Tõenäoliselt kehtib: viimases kvartalis deklareeriti tööjõumakse.", reason_en: "Likely applies: labour taxes were declared in the latest quarter." });
    // Only the assistant's payouts "yes" for that period makes the row definite.
    const paid = ofRule({ ...labour, payouts_last_month: { value: true, provenance: "assistant_supplied" } }, "2026-11-01", "tsd-monthly-return", 3);
    expect(paid.map((o) => [o.period_label_en, o.applies])).toEqual([["October 2026 payouts", "yes"], ["November 2026 payouts", "if"], ["December 2026 payouts", "if"]]);
    // 25 Oct, months 2: September's TSD (due 12 Oct) is outside the window, so no September question.
    const late = computeObligations({}, { today: at("2026-10-25"), months: 2 });
    expect(late.facts_needed.map((n) => n.fact)).not.toContain("payouts_last_month");
    const lateNo = computeObligations({ payouts_last_month: { value: false, provenance: "assistant_supplied" } }, { today: at("2026-10-25"), months: 2 });
    expect(lateNo.facts_needed.map((n) => n.fact)).not.toContain("other_tsd_triggers_last_month");
    // 3 Nov, months 1: October's TSD (due 10 Nov) is inside the window, so ask about October.
    const early = computeObligations({}, { today: at("2026-11-03"), months: 1 });
    expect(early.facts_needed).toContainEqual({ fact: "payouts_last_month", question_et: "Kas maksid oktoobris palka, juhatuse liikme tasu või dividende?", question_en: "Did the company pay salary, a board member fee or dividends in October?", period_label_et: "oktoober 2026 väljamaksed" });
  });

  test("TSD: the assistant's other_tsd_triggers_last_month true makes last month's row definite (#30 item 1)", () => {
    const other = { other_tsd_triggers_last_month: { value: true, provenance: "assistant_supplied" as const } };
    const rows = ofRule(other, "2026-11-03", "tsd-monthly-return", 2);
    expect(rows.map((o) => [o.period_label_et, o.applies])).toEqual([["oktoober 2026 väljamaksed", "yes"], ["november 2026 väljamaksed", "if"]]);
    expect(rows[0]).toMatchObject({ reason_et: "Kehtib, sest assistendi sõnul oli oktoobris töötaja või muu TSD kohustus.", reason_en: "Applies because your assistant reports an employee or another TSD obligation in October.", applies_because: [{ fact: "other_tsd_triggers_last_month", value: true, provenance: "assistant_supplied" }] });
    expect(rows[0].condition_et).toBeUndefined();
    // The row cannot go away any more, so the payouts question is not asked.
    expect(computeObligations(other, { today: at("2026-11-03"), months: 2 }).facts_needed.map((n) => n.fact)).not.toContain("payouts_last_month");
    expect(ofRule({ ...other, payouts_last_month: { value: false, provenance: "assistant_supplied" } }, "2026-11-03", "tsd-monthly-return")[0].applies).toBe("yes");
  });

  test("annual report: filed null (unknown) never counts as filed", () => {
    const facts: CompanyFacts = { annual_report: { value: { latest_year: 2026, filed: null, overdue_days: null }, provenance: "public_register" } };
    expect(ofRule(facts, "2027-07-05", "annual-report-overdue")).toMatchObject([{ kind: "risk", applies: "if", condition_et: "Kehtib, kui 2026. a majandusaasta aruanne on esitamata.", condition_en: "Applies if the 2026 annual report has not been filed." }]);
    expect(ofRule(facts, "2027-06-01", "annual-report")).toMatchObject([{ applies: "if", condition_et: "Kehtib, kui 2026. a majandusaasta aruanne on esitamata." }]);
    const filed: CompanyFacts = { annual_report: { value: { latest_year: 2026, filed: true, overdue_days: 0 }, provenance: "public_register" } };
    expect(ofRule(filed, "2027-07-05", "annual-report-overdue")).toEqual([]);
  });

  test("annual report: no rows for financial years that ended before the company was founded (#43)", () => {
    const founded = (value: string): CompanyFacts["founded"] => ({ value, provenance: "public_register" });
    const young: CompanyFacts = { ...SYNTHETIC_COMPANIES[MARI].facts, annual_report: undefined, founded: founded("2026-03-12") };
    const now = computeObligations(young, { today: at("2026-10-30"), months: 3 }).obligations;
    expect(now.filter((o) => o.rule_id.startsWith("annual-report"))).toEqual([]);
    expect(JSON.stringify(now)).not.toMatch(/2025/);
    // Before: the same facts without founded still show the 2025 overdue row.
    expect(ofRule({ ...young, founded: undefined }, "2026-10-30", "annual-report-overdue", 3)).toMatchObject([{ period_label_en: "2025 annual report" }]);
    // ÄS § 179: the first financial year may run up to 18 months, so its report is never definite with an assumed FY end.
    const firstFy = { applies: "if", condition_et: "Esimese majandusaasta lõpp sõltub põhikirjast (võib olla kuni 18 kuud).", condition_en: "The end of the first financial year depends on the articles of association (it may run up to 18 months).", applies_because: [{ fact: "fy_end", provenance: "assumption" }, { fact: "founded", value: "2026-03-12", provenance: "public_register" }] };
    const filed = { ...young, annual_report: SYNTHETIC_COMPANIES[MARI].facts.annual_report };
    expect(ofRule(filed, "2027-06-01", "annual-report")).toMatchObject([{ period_label_en: "2026 annual report", ...firstFy }]);
    expect(ofRule(filed, "2027-07-05", "annual-report-overdue")).toMatchObject([{ period_label_en: "2026 annual report", applies: "if", condition_et: firstFy.condition_et }]);
    // A known FY end: ending on 31.12.2027 would exceed 18 months, so the first year ends 31.12.2026; later financial years keep the ordinary rule.
    expect(ofRule({ ...filed, fy_end: { value: "12-31", provenance: "assistant_supplied" } }, "2027-06-01", "annual-report")).toMatchObject([{ applies: "yes" }]);
    expect(ofRule(filed, "2028-06-01", "annual-report")).toMatchObject([{ period_label_en: "2027 annual report", applies: "yes" }]);
    // Founded 2012 or unknown: output unchanged.
    for (const facts of [SYNTHETIC_COMPANIES[MARI].facts, SYNTHETIC_COMPANIES[KASE].facts, {}]) for (const day of ["2026-10-30", "2027-06-01", "2027-07-05"]) {
      const base = computeObligations(facts, { today: at(day), months: 3 });
      expect(computeObligations({ ...facts, founded: founded("2012-05-04") }, { today: at(day), months: 3 })).toEqual(base);
      expect(computeObligations({ ...facts, founded: undefined }, { today: at(day), months: 3 })).toEqual(base);
    }
  });

  test("annual report: the first financial year comes from the founding date, not from today's year (#43)", () => {
    const facts: CompanyFacts = { founded: { value: "2024-12-30", provenance: "public_register" }, annual_report: { value: { latest_year: 2024, filed: false, overdue_days: null }, provenance: "public_register" } };
    expect(ofRule(facts, "2026-01-05", "annual-report-overdue", 3)).toMatchObject([{ period_label_en: "2024 annual report", applies: "if", condition_en: "The end of the first financial year depends on the articles of association (it may run up to 18 months)." }]);
  });

  test("annual report: with a known FY end the first year is conditional only when the 18-month rule allows two end dates (#43)", () => {
    const facts: CompanyFacts = { founded: { value: "2026-09-01", provenance: "public_register" }, fy_end: { value: "12-31", provenance: "assistant_supplied" }, annual_report: SYNTHETIC_COMPANIES[MARI].facts.annual_report };
    expect(ofRule(facts, "2027-06-01", "annual-report")).toMatchObject([{ period_label_en: "2026 annual report", applies: "if", condition_et: "Esimene majandusaasta võib lõppeda 31.12.2026 või 31.12.2027 (kuni 18 kuud), sõltuvalt põhikirjast.", condition_en: "The first financial year may end on 31 December 2026 or 31 December 2027 (up to 18 months), depending on the articles of association." }]);
  });

  test("VAT threshold: annual-report revenue and the assistant's year-to-date turnover stay separate", () => {
    const base: CompanyFacts = { vat_registered: { value: false, provenance: "public_register" } };
    const reg = computeObligations({ ...base, latest_annual_revenue: { value: 45_000, provenance: "public_register", as_of: "2025" } }, { today: at("2026-11-01"), months: 1 });
    const row = reg.obligations.find((o) => o.rule_id === "vat-registration-threshold")!;
    expect(row.reason_en).toMatch(/^Revenue in the latest annual report \(2025\) was €45,000, above the threshold: likely to cross it this year too\./);
    expect(row.reason_et).toMatch(/^Viimase majandusaasta aruande \(2025\) müügitulu oli 45\s000 eurot, üle piiri/);
    expect(reg.facts_needed).toContainEqual({ fact: "ytd_turnover_this_year", question_et: "Kui suur on selle aasta käive Eestis seni?", question_en: "What is this calendar year's Estonian turnover so far?" });
    const ytd = ofRule({ ...base, ytd_turnover_this_year: { value: 41_000, provenance: "assistant_supplied" } }, "2026-11-01", "vat-registration-threshold")[0];
    expect(ytd.reason_en).toMatch(/^Your assistant reports this year's Estonian turnover so far as €41,000, above the threshold\./);
    expect(ytd.reason_et).toMatch(/^Assistendi sõnul on selle aasta käive Eestis seni 41\s000 eurot, üle piiri\./);
    expect(`${ytd.reason_et} ${ytd.reason_en}`).not.toMatch(/aruande|annual report/);
    expect(ytd.applies_because).toEqual([{ fact: "vat_registered", value: false, provenance: "public_register" }, { fact: "ytd_turnover_this_year", value: 41_000, provenance: "assistant_supplied" }]);
    // The assistant cannot supply annual-report revenue.
    expect(assistantFactsSchema.safeParse({ ytd_turnover_this_year: 41_000 }).success).toBe(true);
    expect(assistantFactsSchema.safeParse({ latest_annual_revenue: 41_000 }).success).toBe(false);
  });

  test("synthetic fixtures carry provenance synthetic, never public_register", () => {
    for (const day of ["2026-11-01", "2027-06-01", "2027-07-05"]) {
      const r = computeObligations(SYNTHETIC_COMPANIES[MARI].facts, { today: at(day), months: 3 });
      expect(r.obligations.length).toBeGreaterThan(0);
      for (const o of r.obligations) for (const b of o.applies_because) expect(b.provenance, `${day} ${o.rule_id} ${b.fact}`).not.toBe("public_register");
    }
    for (const c of Object.values(SYNTHETIC_COMPANIES)) for (const f of Object.values(c.facts)) expect(f.provenance).toBe("synthetic");
  });

  test("VAT threshold is a warning only when not registered; TÖR only when a hire or board fee starts", () => {
    expect(ofRule(SYNTHETIC_COMPANIES[MARI].facts, "2026-11-01", "vat-registration-threshold")).toEqual([]);
    expect(ofRule({}, "2026-11-01", "vat-registration-threshold")).toEqual([]);
    const w = ofRule(SYNTHETIC_COMPANIES[KASE].facts, "2026-11-01", "vat-registration-threshold");
    expect(w).toMatchObject([{ kind: "warning", applies: "if", effective_due: null }]);
    expect(w[0].reason_et).toMatch(/38\s000 eurot/);
    expect(ofRule(SYNTHETIC_COMPANIES[KASE].facts, "2026-11-01", "vat-return-kmd")).toEqual([]);
    expect(ofRule(SYNTHETIC_COMPANIES[KASE].facts, "2026-11-01", "tor-registration")).toEqual([]);
    expect(ofRule({ hire_or_board_fee_starting: { value: true, provenance: "assistant_supplied" } }, "2026-11-01", "tor-registration")).toMatchObject([{ kind: "info", applies: "yes" }]);
  });

  test("window: months 1..3 from the Tallinn calendar date", () => {
    // 22:30 UTC on 30 Nov is already 1 Dec in Tallinn.
    const r = computeObligations(SYNTHETIC_COMPANIES[MARI].facts, { today: new Date("2026-11-30T22:30:00Z"), months: 3 });
    expect(r.window).toEqual({ from: "2026-12-01", to: "2027-02-28" });
    expect(r.obligations.filter((o) => o.kind === "deadline").map((o) => o.effective_due)).toEqual(["2026-12-10", "2026-12-21", "2027-01-11", "2027-01-20", "2027-02-10", "2027-02-22"]);
  });

  test("every rule_id computeObligations can emit has a static handoff (no model, no amounts)", () => {
    const said = <T>(value: T) => ({ value, provenance: "assistant_supplied" as const });
    const scenarios: CompanyFacts[] = [
      {}, // everything unknown: KMD "if", TSD "if", annual "if"
      { vat_registered: said(true), payouts_last_month: said(true), annual_report: said({ latest_year: 2024, filed: false, overdue_days: 120 }) },
      { vat_registered: said(false), ytd_turnover_this_year: said(12_000), hire_or_board_fee_starting: said(true) },
    ];
    const seen = new Set<string>();
    for (const facts of scenarios) for (const day of ["2026-06-01", "2026-11-01"]) for (const o of computeObligations(facts, { today: at(day), months: 3 }).obligations) {
      const key = o.rule_id === "tsd-monthly-return" ? `${o.rule_id}:${o.applies}` : o.rule_id;
      seen.add(key);
      expect(HANDOFF[key], key).toBeDefined();
      for (const v of Object.values(o.handoff)) { expect(v.trim(), key).not.toBe(""); expect(v, key).not.toMatch(/\{kuu\}|\{month\}|\d/); }
    }
    // The scenarios reach every rule, so no HANDOFF entry is dead and no emitted rule lacks one.
    expect([...seen].sort()).toEqual(Object.keys(HANDOFF).sort());
    const kmd = computeObligations({ vat_registered: said(true) }, { today: at("2026-11-01"), months: 1 }).obligations.find((o) => o.rule_id === "vat-return-kmd")!;
    expect(kmd.handoff).toMatchObject({ assistant_et: "kogub oktoobri arved kokku ja kontrollib, et ükski pole puudu", owner_et: "esitad KMD e-MTA-s oma Smart-ID-ga", prompt_et: "Valmista oktoobri KMD jaoks arved ette ja küsi minult kinnitust enne, kui midagi saadad.", assistant_en: "gathers October's invoices and checks none are missing" });
  });
});

// --- Fake Ärikratt MCP: in-process SDK server, synthetic values, real field names ---
const PERSON = "Synthetic Person Name", PERSON_CODE = "38001010000";
let fake: Server; let fakeUrl = ""; let toolCalls = 0;
function fakeCompany(code: string) {
  return {
    snapshot_id: "20261029T054510Z", as_of: "2026-10-29", found: true, disclaimer: "Ametlike avaandmete väljavõte; mitte ametlik registriväljavõte, õigusnõu ega krediidiotsus.",
    sources: [{ key: "ariregister", name: "Äriregister", licence: "CC BY 4.0", licence_url: "https://creativecommons.org/licenses/by/4.0/", as_of: "2026-10-29" }, { key: "emta", name: "EMTA avaandmed", licence: "CC BY-SA 3.0", licence_url: "https://creativecommons.org/licenses/by-sa/3.0/" }],
    profile: { name: "Synthetic Register OÜ", vat_number: "EE000000000", emtak_code: "74101" },
    board: { members: [{ name: PERSON, personal_code: PERSON_CODE, role: "juhatuse liige" }] },
    financials: { year: 2025, report_basis: "annual_report", revenue: 45000, revenue_reason: null, employees_avg: 1 },
    report_status: { latest_year: 2025, filed: true, next_due: "2027-06-30", status: "filed", overdue_days: 0, period: "2025" },
    tax: [{ year: 2026, quarter: 2, labour_taxes: 900, employee_count: 0, turnover: 12000 }, { year: 2026, quarter: 3, labour_taxes: 1500, employee_count: 1, turnover: 15000 }],
    tax_debt: { on_list: false, snapshot_date: "2026-10-28" }, registry_code: code,
  };
}
beforeAll(async () => {
  const a = express(); a.use(express.json());
  a.post("/mcp", async (req, res) => {
    if (req.headers["x-api-key"] !== "test-key") return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Missing API key." }, id: null });
    if (req.body?.method === "tools/call") toolCalls++;
    const s = new McpServer({ name: "fake-arikratt", version: "1" });
    s.registerTool("get_company", { inputSchema: { registry_code: z.string(), sections: z.array(z.string()).optional() } }, async ({ registry_code, sections }) => {
      if (registry_code === "12417834") await new Promise((ok) => setTimeout(ok, 400));
      if (registry_code === SLOW) await new Promise((ok) => setTimeout(ok, 5000));
      if (registry_code === "10000018") return { isError: true, content: [{ type: "text", text: "Company not found" }] };
      expect(sections).toEqual(["report_status", "tax"]);
      return { content: [{ type: "text", text: JSON.stringify(fakeCompany(registry_code)) }] };
    });
    s.registerTool("search_companies", { inputSchema: { query: z.string(), limit: z.number().optional() } }, async ({ query }) => ({ content: [{ type: "text", text: JSON.stringify({ companies: query === "Nobody Matches" ? [] : [{ name: "Synthetic Register OÜ", registry_code: FAKE_VALID, employees: 1, representatives: [{ name: PERSON, personal_code: PERSON_CODE }] }] }) }] }));
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void t.close(); void s.close(); });
    await s.connect(t); await t.handleRequest(req, res, req.body);
  });
  a.all("/mcp", (_req, res) => { res.status(405).end(); });
  await new Promise<void>((ok) => { fake = a.listen(0, "127.0.0.1", ok); });
  fakeUrl = `http://127.0.0.1:${(fake.address() as { port: number }).port}/mcp`;
});
afterAll(() => { fake.close(); });

describe("Ärikratt adapter", () => {
  test("not_configured and invalid codes make no network call", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const before = toolCalls;
    const ar = arikratt(openDb(":memory:"), {});
    expect(await ar.lookup(FAKE_VALID)).toMatchObject({ ok: false, unavailable: "not_configured" });
    expect(await ar.search("Synthetic")).toMatchObject({ ok: false, unavailable: "not_configured" });
    expect(await arikratt(openDb(":memory:"), { apiKey: "test-key", url: fakeUrl }).lookup("12345670")).toMatchObject({ ok: false, unavailable: "invalid_code" });
    expect(spy).not.toHaveBeenCalled(); expect(toolCalls).toBe(before);
    spy.mockRestore();
  });
  test("maps memo § 4 fields, keeps snapshot/attribution, never returns or caches natural-person data", async () => {
    const db = openDb(":memory:");
    const r = await arikratt(db, { apiKey: "test-key", url: fakeUrl }).lookup(FAKE_VALID);
    if (!r.ok) throw new Error(r.reason);
    expect(r.company).toMatchObject({ name: "Synthetic Register OÜ", registry_code: FAKE_VALID, synthetic: false, provenance: "public_register", snapshot_id: "20261029T054510Z", as_of: "2026-10-29", sources: [{ key: "ariregister", name: "Äriregister", licence: "CC BY 4.0", licence_url: "https://creativecommons.org/licenses/by/4.0/" }, { key: "emta", name: "EMTA avaandmed", licence: "CC BY-SA 3.0", licence_url: "https://creativecommons.org/licenses/by-sa/3.0/" }] });
    expect(r.company.attribution).toMatch(/CC BY 4\.0.*not an official register extract/s);
    expect(r.facts.vat_registered).toEqual({ value: true, provenance: "public_register", source: "arikratt:get_company", as_of: "2026-10-29" });
    expect(r.facts.labour_taxes_last_quarter?.value).toBe(1500); // latest quarter
    expect(r.facts.employees?.value).toBe(1);
    expect(r.facts.annual_report?.value).toEqual({ latest_year: 2025, filed: true, overdue_days: 0 });
    expect(r.facts.tax_debt_on_list?.value).toBe(false);
    expect(r.facts.payouts_last_month).toBeUndefined(); // assistant-supplied only
    const cached = db.prepare("SELECT * FROM company_facts").all();
    for (const blob of [JSON.stringify(r), JSON.stringify(cached)]) for (const p of [PERSON, PERSON_CODE, "board", "members", "emtak"]) expect(blob).not.toContain(p);
    const found = await arikratt(db, { apiKey: "test-key", url: fakeUrl }).search("Synthetic");
    expect(found).toEqual({ ok: true, matches: [{ name: "Synthetic Register OÜ", registry_code: FAKE_VALID }] });
  });
  test("register card: official open data via Ärikratt, never an official source; keeps the disclaimer (tribunal T-005)", () => {
    const { company } = mapCompany(FAKE_VALID, fakeCompany(FAKE_VALID));
    expect(company).toMatchObject({ label_et: "Ametlikud avaandmed (Ärikratt) · Äriregister ja EMTA, seisuga 29.10.2026", label_en: "Official open data (via Ärikratt) · Business Register and EMTA, as of 29 October 2026", disclaimer: "Ametlike avaandmete väljavõte; mitte ametlik registriväljavõte, õigusnõu ega krediidiotsus." });
    expect(JSON.stringify(company)).not.toMatch(/Ametlik allikas|Official source/);
    expect(mapCompany(FAKE_VALID, {}).company.disclaimer).toBeUndefined();
  });
  test("maps the live financials object to latest annual revenue with the report year, and profile.founded (#43)", () => {
    const { facts } = mapCompany(FAKE_VALID, { as_of: "2026-10-29", profile: { vat_number: null }, financials: { year: 2025, report_basis: "annual_report", revenue: 45000, revenue_reason: null, employees_avg: 1 } });
    expect(facts.latest_annual_revenue).toEqual({ value: 45000, provenance: "public_register", source: "arikratt:get_company", as_of: "2025" });
    expect(mapCompany(FAKE_VALID, { financials: { year: 2025, revenue: null, revenue_reason: "not_reported" } }).facts.latest_annual_revenue).toBeUndefined();
    const figs = mapCompany(FAKE_VALID, { as_of: "2026-10-29", financials: { year: 2025, revenue: 0, net_profit: -53, equity: 1248, total_assets: 1248, liabilities: 0 } }).facts.latest_annual_report_figures;
    expect(figs).toEqual({ value: { year: 2025, revenue: 0, net_profit: -53, total_assets: 1248, equity: 1248, liabilities: 0 }, provenance: "public_register", source: "arikratt:get_company", as_of: "2025" });
    expect(mapCompany(FAKE_VALID, { financials: { year: 2025, revenue: null, revenue_reason: "not_reported" } }).facts.latest_annual_report_figures).toBeUndefined();
    // Absent lines are omitted, never null or zero.
    expect(mapCompany(FAKE_VALID, { financials: { year: 2025, revenue: null, equity: 1248, total_assets: null } }).facts.latest_annual_report_figures?.value).toEqual({ year: 2025, equity: 1248 });
    expect(mapCompany(FAKE_VALID, { as_of: "2026-10-29", profile: { founded: "2026-03-12" } }).facts.founded).toEqual({ value: "2026-03-12", provenance: "public_register", source: "arikratt:get_company", as_of: "2026-10-29" });
    for (const bad of [null, "", "12.03.2026", 2026, "2026-02-31", "2025-02-29"]) expect(mapCompany(FAKE_VALID, { profile: { founded: bad } }).facts.founded, String(bad)).toBeUndefined();
  });
  test("maps live sources[] with key, name, licence and licence_url", () => {
    const { company } = mapCompany(FAKE_VALID, { sources: [{ key: "ariregister", name: "Äriregister", licence: "CC BY 4.0", licence_url: "https://example.test/licence", as_of: "2026-10-29", as_of_basis: "snapshot" }, { key: "emta", name: "EMTA", licence: "CC BY-SA 3.0", licence_url: "javascript:alert(1)" }] });
    expect(company.sources).toEqual([{ key: "ariregister", name: "Äriregister", licence: "CC BY 4.0", licence_url: "https://example.test/licence" }, { key: "emta", name: "EMTA", licence: "CC BY-SA 3.0", licence_url: null }]);
  });
  test("cache: derived facts for 24 h, then refetched", async () => {
    const db = openDb(":memory:"), ar = arikratt(db, { apiKey: "test-key", url: fakeUrl });
    const start = toolCalls;
    await ar.lookup(FAKE_VALID); await ar.lookup(FAKE_VALID);
    expect(toolCalls - start).toBe(1);
    const row = db.prepare("SELECT snapshot_id,as_of,fetched_at FROM company_facts WHERE registry_code=?").get(FAKE_VALID) as Record<string, string>;
    expect(row).toMatchObject({ snapshot_id: "20261029T054510Z", as_of: "2026-10-29" });
    db.prepare("UPDATE company_facts SET fetched_at=?").run(new Date(Date.now() - CACHE_TTL_MS + 60_000).toISOString());
    await ar.lookup(FAKE_VALID); expect(toolCalls - start).toBe(1);
    db.prepare("UPDATE company_facts SET fetched_at=?").run(new Date(Date.now() - CACHE_TTL_MS - 1).toISOString());
    await ar.lookup(FAKE_VALID); expect(toolCalls - start).toBe(2);
  });
  test("company-name search miss or failure is reported on the card and asks for the registry code (tribunal T-003)", async () => {
    const db = openDb(":memory:");
    const miss = await companyObligations(arikratt(db, { apiKey: "test-key", url: fakeUrl }), { assistant: { company_name: "Nobody Matches" }, months: 1 });
    if (!miss.ok) throw new Error(miss.error);
    expect(miss.result.company).toMatchObject({ name: "Nobody Matches", provenance: "assistant_supplied", unavailable: "no_match", unavailable_reason: expect.stringContaining("Nobody Matches") });
    expect(miss.result.facts_needed[0]).toMatchObject({ fact: "registry_code" });
    expect(miss.result.assistant_instruction).toContain("Ask the owner for the 8-digit registry code.");
    const failed = await companyObligations(arikratt(db, { apiKey: "wrong", url: fakeUrl }), { assistant: { company_name: "Synthetic Register" }, months: 1 });
    if (!failed.ok) throw new Error(failed.error);
    expect(failed.result.company).toMatchObject({ unavailable: "unauthorized", unavailable_reason: "The public-register service rejected Launchpad's API key." });
    expect(failed.result.facts_needed[0]).toMatchObject({ fact: "registry_code" });
    expect(failed.result.assistant_instruction).toContain("Ask the owner for the 8-digit registry code.");
  });
  test("a registry code the register does not know computes no deadlines, like an invalid code (#30 item 3)", async () => {
    const r = await companyObligations(arikratt(openDb(":memory:"), { apiKey: "test-key", url: fakeUrl }), { registryCode: "10000018", months: 1 });
    expect(r).toEqual({ ok: false, unavailable: "not_found", error: "The public register has no company with this code. Ask the owner to check the code. No deadlines were computed." });
  });
  test("a single name-search match asks the owner to confirm the company first (#30 item 4)", async () => {
    const db = openDb(":memory:");
    const r = await companyObligations(arikratt(db, { apiKey: "test-key", url: fakeUrl }), { assistant: { company_name: "Synthetic Register" }, months: 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.company).toMatchObject({ name: "Synthetic Register OÜ", registry_code: FAKE_VALID });
    expect(r.result.facts_needed[0]).toEqual({ fact: "confirm_company", question_et: `Kas Synthetic Register OÜ (${FAKE_VALID}) on sinu ettevõte?`, question_en: `Is Synthetic Register OÜ (${FAKE_VALID}) your company?` });
    expect(r.result.assistant_instruction).toContain(`Confirm with the owner that Synthetic Register OÜ (${FAKE_VALID}) is their company before relying on these deadlines.`);
    // A code the owner gave needs no confirmation.
    const direct = await companyObligations(arikratt(db, { apiKey: "test-key", url: fakeUrl }), { registryCode: FAKE_VALID, months: 1 });
    if (!direct.ok) throw new Error(direct.error);
    expect(direct.result.facts_needed.map((n) => n.fact)).not.toContain("confirm_company");
    expect(direct.result.assistant_instruction).not.toContain("Confirm with the owner that");
    // Register facts reach the assistant, so it never asks the owner for them (owner 2026-10-31).
    expect(direct.result.public_facts.vat_registered).toMatchObject({ value: true, provenance: "public_register" });
    // The fake register reports revenue only: that is latest_annual_revenue, not a figures fact full of nulls.
    expect(direct.result.public_facts.latest_annual_report_figures).toBeUndefined();
    expect(direct.result.public_facts.latest_annual_revenue).toMatchObject({ value: 45000, as_of: "2025" });
    // Sample companies' facts stay labelled synthetic, never register data.
    const sample = await companyObligations(arikratt(db, { apiKey: "test-key", url: fakeUrl }), { registryCode: "19990002", months: 1 });
    if (!sample.ok) throw new Error(sample.error);
    expect(Object.values(sample.result.public_facts).every((f) => f?.provenance === "synthetic")).toBe(true);
    expect(sample.result.assistant_instruction).toContain("synthetic is sample data and never the register.");
    expect(direct.result.assistant_instruction).toContain("a fact in public_facts that is not in facts_needed is already known, so never ask for it. Name its provenance honestly: public_register is the business register, synthetic is sample data and never the register.");
  });
  test("honest unavailable states: timeout, not found, bad key", async () => {
    const db = openDb(":memory:");
    expect(await arikratt(db, { apiKey: "test-key", url: fakeUrl, timeoutMs: 100 }).lookup("12417834")).toMatchObject({ ok: false, unavailable: "timeout" });
    expect(await arikratt(db, { apiKey: "test-key", url: fakeUrl }).lookup("10000018")).toMatchObject({ ok: false, unavailable: "not_found" });
    expect(await arikratt(db, { apiKey: "wrong", url: fakeUrl }).lookup(FAKE_VALID)).toMatchObject({ ok: false, unavailable: "unauthorized" });
    expect(db.prepare("SELECT count(*) n FROM company_facts").get()).toEqual({ n: 0 });
  });
});

// --- get_obligations over MCP and the status card ---
describe("get_obligations tool and status card", () => {
  let server: Server; let base = ""; const clients: Client[] = [];
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://localhost:3000", modelMode: "test", allowedHosts: ["localhost", "127.0.0.1"] };
  const { app, db } = createApp(cfg, openDb(":memory:"));
  function owner(id: string, ref?: string) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,'google',1,?)").run(id, `synthetic-${id}`, now);
    db.prepare("INSERT INTO workspaces(owner_id,company_ref,label,version) VALUES(?,?,'Synthetic workspace',?)").run(id, `ws-${id}`, ref ? 1 : 0);
    if (ref) db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,1,?,'h',?)").run(`asmt-${id}`, id, JSON.stringify({ ...DEMO_FIXTURES.alpha, company_registry_ref: ref }), now);
    db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(`sess-${id}`), id, `csrf-${id}`, new Date(Date.now() + 3600_000).toISOString());
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,?,1,?)").run(`tok-${id}`, id, sha256(`lp_tok-${id}`), "progress:read,progress:report", now);
    return { cookie: `lp_session=sess-${id}`, token: `lp_tok-${id}` };
  }
  async function client(token: string, url = `${base}/mcp`) {
    const c = new Client({ name: "synthetic-obligations", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    clients.push(c); return c;
  }
  const parsed = (r: unknown) => { const x = r as { isError?: boolean; structuredContent?: Record<string, any>; content: { text: string }[] }; expect(x.isError).toBeFalsy(); return x.structuredContent ?? JSON.parse(x.content[0].text); };
  const errText = (r: unknown) => { const x = r as { isError?: boolean; content: { text: string }[] }; expect(x.isError).toBe(true); return x.content[0].text; };
  beforeAll(async () => { await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base; });
  afterAll(async () => { for (const c of clients) await c.close().catch(() => {}); server.close(); });

  test("readOnlyHint on read tools only; get_started lists get_obligations first", async () => {
    const c = await client(owner("ann").token);
    const tools = Object.fromEntries((await c.listTools()).tools.map((t) => [t.name, t.annotations]));
    for (const t of ["get_started", "get_progress", "search_services", "get_approval", "get_obligations"]) expect(tools[t]?.readOnlyHint, t).toBe(true);
    expect(tools.get_obligations?.openWorldHint).toBe(true);
    for (const t of ["report_assessment", "report_progress", "submit_service_candidate", "request_approval", "record_action_outcome"]) expect(tools[t]?.readOnlyHint, t).toBeUndefined();
    const started = parsed(await c.callTool({ name: "get_started", arguments: {} }));
    expect(started.tools[0]).toBe("get_obligations");
    expect(Object.keys(started)[0]).toBe("first_step");
    expect(started.first_step).toContain("get_obligations");
    expect(TOOL_ARG_KEYS.get_obligations).toEqual(["registry_code", "facts", "months"]);
  });
  test("unexpected fields are rejected, top-level and nested; nothing to compute is a tool error", async () => {
    const c = await client(owner("strict").token);
    expect(errText(await c.callTool({ name: "get_obligations", arguments: { registry_code: MARI, verified: true } }))).toContain("Unexpected field(s) rejected: verified");
    expect((await c.callTool({ name: "get_obligations", arguments: { facts: { vat_registered: true, deadline: "2026-11-01" } } }) as { isError?: boolean }).isError).toBe(true);
    expect((await c.callTool({ name: "get_obligations", arguments: { months: 4 } }) as { isError?: boolean }).isError).toBe(true);
    expect(errText(await c.callTool({ name: "get_obligations", arguments: {} }))).toMatch(/Ask the owner for the company name or 8-digit registry code.*No deadlines were computed/s);
    expect(errText(await c.callTool({ name: "get_obligations", arguments: { registry_code: "12417835" } }))).toMatch(/checksum.*No deadlines were computed/s);
  });
  test("not_configured: rules still compute, facts_needed asks, no network call", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const c = await client(owner("nokey").token);
    spy.mockClear();
    const r = parsed(await c.callTool({ name: "get_obligations", arguments: { registry_code: FAKE_VALID, facts: { vat_registered: true }, months: 2 } }));
    expect(spy.mock.calls.filter(([u]) => !String(u).startsWith(base))).toEqual([]);
    spy.mockRestore();
    expect(r.company).toMatchObject({ registry_code: FAKE_VALID, provenance: "assistant_supplied", unavailable: "not_configured" });
    expect(r.company.label_en).not.toContain("Official");
    expect(r.facts_needed.map((n: { fact: string }) => n.fact)).toEqual(expect.arrayContaining(["fy_end", "annual_report"]));
    expect(r.facts_needed.map((n: { fact: string }) => n.fact)).not.toContain("vat_registered");
    const kmd = r.obligations.find((o: { rule_id: string }) => o.rule_id === "vat-return-kmd");
    expect(kmd).toMatchObject({ applies: "yes", applies_because: [{ fact: "vat_registered", value: true, provenance: "assistant_supplied" }] });
    expect(r.assistant_instruction).toBe("Cite the source link for every row. Do not add, remove or change deadlines; they are computed by rules. Ask the owner only for facts in facts_needed; a fact in public_facts that is not in facts_needed is already known, so never ask for it. Name its provenance honestly: public_register is the business register, synthetic is sample data and never the register. Ask the facts_needed questions first: an answer can remove a row. Then, for each row with a playbook_id, offer in one line to prepare it, and follow that playbook's steps from get_started. Never compute tax amounts or deadlines yourself. If next_deadline.applies is 'if', present it as conditional and quote its condition.");
    expect(r.disclaimer).toContain("calculated by rules, not AI");
    expect(r.computed_by).toBe("rules");
  });
  test("synthetic company from the assessment ref: labelled Näidis, never official; status card shows dated rows with sources", async () => {
    const o = owner("mari", MARI);
    const r = parsed(await (await client(o.token)).callTool({ name: "get_obligations", arguments: { months: 3 } }));
    expect(r.company).toMatchObject({ name: "Mari Disain OÜ", registry_code: MARI, synthetic: true, provenance: "synthetic_fixture", label_et: expect.stringContaining("Näidis"), label_en: expect.stringContaining("Sample") });
    expect(JSON.stringify(r)).not.toMatch(/Ametlik allikas|Official source/);
    expect(r.obligations.length).toBeGreaterThan(0);
    for (const ob of r.obligations) {
      expect(ob.source.url).toMatch(/^https:\/\/www\.riigiteataja\.ee\/akt\//);
      for (const b of ob.applies_because) expect(b).toMatchObject({ provenance: "synthetic", source: "synthetic_fixture" });
    }
    const html = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
    for (const s of ["Tulekul", '<ul class="deadlines">', "Mari Disain OÜ", "Arvutatud reeglist", '<span class="label-chip label-chip--sample">Näidis</span>', "https://www.riigiteataja.ee/akt/", "KMD ja käibemaks", "Tähtajad arvutab reeglistik, mitte tehisaru.", '<dt class="me">Sina</dt>']) expect(html, s).toContain(s);
    expect(html).not.toContain("Ametlik allikas");
    // Date first: a dated tile per row, with the Estonian weekday.
    expect(html).toMatch(/<time class="deadline-date" datetime="\d{4}-\d{2}-\d{2}"><span class="deadline-day">\d{1,2}<\/span><span class="deadline-mon">[a-zõäöü]+\.?<\/span><span class="deadline-wd">(esmaspäev|teisipäev|kolmapäev|neljapäev|reede)<\/span><\/time>/);
    // No registry code known: no deadline rows, an honest pointer instead.
    const plain = await (await fetch(`${base}/`, { headers: { cookie: owner("plain").cookie } })).text();
    expect(plain).not.toContain('<ul class="deadlines">');
    expect(plain).toContain("Tähtajad ilmuvad siia, kui assistent teab sinu registrikoodi.");
  });
  test("Status: an unavailable register lookup renders the hint and the plain reason, never a deadlines card (tribunal T-006)", async () => {
    const html = await (await fetch(`${base}/`, { headers: { cookie: owner("nokeyref", FAKE_VALID).cookie } })).text();
    expect(html).toContain("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?”");
    expect(html).toContain("Public-register lookup is not configured on this server.");
    expect(html).not.toContain("Järgmised tähtajad");
  });
  test("a configured lookup labels real public-register facts as official open data, never an official source", async () => {
    const cfg2: Config = { ...cfg, arikrattApiKey: "test-key", arikrattMcpUrl: fakeUrl };
    const { app: app2, db: db2 } = createApp(cfg2, openDb(":memory:"));
    const s2 = await new Promise<Server>((ok) => { const s = app2.listen(0, "127.0.0.1", () => ok(s)); });
    const base2 = `http://127.0.0.1:${(s2.address() as { port: number }).port}`; cfg2.baseUrl = base2;
    try {
      const now = new Date().toISOString();
      db2.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('o','synthetic-o','google',0,?)").run(now);
      db2.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('o','ws-o','Synthetic workspace')").run();
      db2.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('t','o',?,'progress:read',1,?)").run(sha256("lp_t"), now);
      const c = await client("lp_t", `${base2}/mcp`);
      const r = parsed(await c.callTool({ name: "get_obligations", arguments: { facts: { company_name: "Synthetic Register" } } }));
      expect(r.company).toMatchObject({ name: "Synthetic Register OÜ", registry_code: FAKE_VALID, synthetic: false, provenance: "public_register", snapshot_id: "20261029T054510Z", label_et: expect.stringContaining("Ametlikud avaandmed (Ärikratt)") });
      expect(JSON.stringify(r)).not.toMatch(/Ametlik allikas|Official source/);
      expect(r.data_as_of).toBe("2026-10-29");
      expect(JSON.stringify(r)).not.toContain(PERSON);
    } finally { s2.close(); }
  });
  test("the public landing has no company lookup: ?q= renders the teaser and never calls the register (owner 2026-10-30)", async () => {
    const cfg6: Config = { ...cfg, arikrattApiKey: "test-key", arikrattMcpUrl: fakeUrl };
    const { app: app6 } = createApp(cfg6, openDb(":memory:"));
    const s6 = await new Promise<Server>((ok) => { const s = app6.listen(0, "127.0.0.1", () => ok(s)); });
    const base6 = `http://127.0.0.1:${(s6.address() as { port: number }).port}`; cfg6.baseUrl = base6;
    try {
      for (const q of ["Mari", "Mari Disain", MARI, FAKE_VALID]) {
        const start = toolCalls;
        const r = await fetch(`${base6}/?q=${encodeURIComponent(q)}`);
        const html = await r.text();
        expect(r.status, q).toBe(200);
        expect(toolCalls - start, q).toBe(0);
        expect(html, q).toContain("Tegele sellega, milles oled hea.");
        expect(html, q).not.toMatch(/Mari Disain OÜ|Synthetic Register|name="q"/);
      }
    } finally { s6.close(); }
  });
  test("Status: a failed background fill is not retried for 10 minutes (tribunal T-007)", async () => {
    const cfg4: Config = { ...cfg, arikrattApiKey: "test-key", arikrattMcpUrl: fakeUrl };
    const { app: app4, db: db4 } = createApp(cfg4, openDb(":memory:"));
    const s4 = await new Promise<Server>((ok) => { const s = app4.listen(0, "127.0.0.1", () => ok(s)); });
    const base4 = `http://127.0.0.1:${(s4.address() as { port: number }).port}`; cfg4.baseUrl = base4;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const now = new Date().toISOString();
      db4.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('o','synthetic-o','google',0,?)").run(now);
      db4.prepare("INSERT INTO workspaces(owner_id,company_ref,label,version) VALUES('o','ws-o','Synthetic workspace',1)").run();
      db4.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES('a','o',1,?,'h',?)").run(JSON.stringify({ ...DEMO_FIXTURES.alpha, company_registry_ref: "10000018" }), now);
      db4.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("sess-o"), "o", "csrf-o", new Date(Date.now() + 3600_000).toISOString());
      const start = toolCalls;
      const load = async () => expect((await fetch(`${base4}/`, { headers: { cookie: "lp_session=sess-o" } })).status).toBe(200);
      await load();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("Status deadlines: register lookup failed (not_found)."));
      await load(); await load();
      await new Promise((ok) => setTimeout(ok, 300));
      expect(toolCalls - start).toBe(1);
    } finally { warn.mockRestore(); s4.close(); }
  });
  // One owner whose assessment carries `code`, on a fresh app with the fake register; returns a Täna page loader.
  const tanaFor = async (code: string) => {
    const cfg5: Config = { ...cfg, arikrattApiKey: "test-key", arikrattMcpUrl: fakeUrl };
    const { app: app5, db: db5 } = createApp(cfg5, openDb(":memory:"));
    const s5 = await new Promise<Server>((ok) => { const s = app5.listen(0, "127.0.0.1", () => ok(s)); });
    const base5 = `http://127.0.0.1:${(s5.address() as { port: number }).port}`; cfg5.baseUrl = base5;
    const now = new Date().toISOString();
    db5.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('o','synthetic-o','google',0,?)").run(now);
    db5.prepare("INSERT INTO workspaces(owner_id,company_ref,label,version) VALUES('o','ws-o','Synthetic workspace',1)").run();
    db5.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES('a','o',1,?,'h',?)").run(JSON.stringify({ ...DEMO_FIXTURES.alpha, company_registry_ref: code }), now);
    db5.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("sess-o"), "o", "csrf-o", new Date(Date.now() + 30 * 86400_000).toISOString());
    return { server: s5, load: async () => (await fetch(`${base5}/`, { headers: { cookie: "lp_session=sess-o" } })).text() };
  };
  test("Täna: a remembered not_found fill says the code is not in the register and is not retried for 2 hours (#41)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t0 = Date.now(); let offset = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => t0 + offset);
    const { server, load } = await tanaFor("10000018");
    try {
      const start = toolCalls;
      expect(await load()).toContain("Registri andmeid laaditakse.");
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("Status deadlines: register lookup failed (not_found)."));
      for (offset = 0; offset <= 2 * 3600_000; offset += 15 * 60_000) {
        const html = await load();
        expect(html).toContain("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?” <span class=\"muted\">Registrikoodiga ettevõtet registrist ei leitud — palu assistendil kood üle kontrollida.</span>");
        expect(html).not.toContain("Registri andmeid laaditakse.");
        expect(html).not.toContain('<ul class="deadlines">');
      }
      await new Promise((ok) => setTimeout(ok, 300));
      expect(toolCalls - start).toBe(1);
    } finally { clock.mockRestore(); warn.mockRestore(); server.close(); }
  });
  test("Täna: a timed-out fill shows the plain reason and retries after 10 minutes (#41)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t0 = Date.now(); let offset = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => t0 + offset);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort()); // the register never answers in time
    const { server, load } = await tanaFor(FAKE_VALID);
    try {
      expect(await load()).toContain("Registri andmeid laaditakse.");
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("Status deadlines: register lookup failed (timeout)."));
      const failed = await load();
      expect(failed).toContain("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?” <span class=\"muted\" lang=\"en\">The public-register lookup did not answer within 10 s.</span>");
      expect(failed).not.toContain("Registrikoodiga ettevõtet registrist ei leitud");
      offset = 9 * 60_000; await load();
      expect(warn).toHaveBeenCalledTimes(1);
      offset = 10 * 60_000 + 1; timeout.mockRestore();
      expect(await load()).toContain("Registri andmeid laaditakse.");
      await vi.waitFor(() => expect(load()).resolves.toContain('<ul class="deadlines">'));
      expect(warn).toHaveBeenCalledTimes(1);
    } finally { timeout.mockRestore(); clock.mockRestore(); warn.mockRestore(); server.close(); }
  });
  test("Täna: a checksum-invalid assessment registry ref says so instead of dropping Tulekul (#30 item 2)", async () => {
    const html = await (await fetch(`${base}/`, { headers: { cookie: owner("badref", "19774662").cookie } })).text();
    const tulekul = html.slice(html.indexOf('id="tulekul"'));
    expect(tulekul).toContain("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?” <span class=\"muted\">Registrikood ei ole korrektne — palu assistendil see üle kontrollida.</span>");
    expect(tulekul).not.toContain("Tähtajad ilmuvad siia");
  });
  test("Status page never waits for the register: a cache miss renders a one-line hint at once", async () => {
    const cfg3: Config = { ...cfg, arikrattApiKey: "test-key", arikrattMcpUrl: fakeUrl };
    const { app: app3, db: db3 } = createApp(cfg3, openDb(":memory:"));
    const s3 = await new Promise<Server>((ok) => { const s = app3.listen(0, "127.0.0.1", () => ok(s)); });
    const base3 = `http://127.0.0.1:${(s3.address() as { port: number }).port}`; cfg3.baseUrl = base3;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const now = new Date().toISOString();
      db3.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('o','synthetic-o','google',0,?)").run(now);
      db3.prepare("INSERT INTO workspaces(owner_id,company_ref,label,version) VALUES('o','ws-o','Synthetic workspace',1)").run();
      db3.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES('a','o',1,?,'h',?)").run(JSON.stringify({ ...DEMO_FIXTURES.alpha, company_registry_ref: SLOW }), now);
      db3.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("sess-o"), "o", "csrf-o", new Date(Date.now() + 3600_000).toISOString());
      const t0 = Date.now();
      const res = await fetch(`${base3}/`, { headers: { cookie: "lp_session=sess-o" } });
      const html = await res.text();
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(res.status).toBe(200);
      expect(html).toContain("Registri andmeid laaditakse. Värskenda lehte hetke pärast.");
      expect(html).not.toContain('<ul class="deadlines">');
    } finally { warn.mockRestore(); s3.close(); }
  });
});
