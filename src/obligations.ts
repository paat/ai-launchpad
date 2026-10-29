/** Deterministic Estonian deadlines for a one-person OÜ (issue #19). Pure: no
 * I/O, no model. Rules, sources and defaults follow
 * docs/research/N-obligation-deadline-rules.md; rule ids match the memo. */

export type Provenance = "public_register" | "assistant_supplied" | "assumption";
export interface Fact<T> { value: T; provenance: Provenance; as_of?: string; source?: string; }
export interface AnnualReportStatus { latest_year: number | null; filed: boolean | null; overdue_days: number | null; }
export interface CompanyFacts {
  company_name?: Fact<string>; registry_code?: Fact<string>;
  vat_registered?: Fact<boolean>; labour_taxes_last_quarter?: Fact<number>; employees?: Fact<number>;
  fy_end?: Fact<string>; annual_report?: Fact<AnnualReportStatus>; tax_debt_on_list?: Fact<boolean>;
  latest_annual_revenue?: Fact<number>;
  /** Assistant-supplied only: payouts (salary, board fee, dividends) in the last calendar month. */
  payouts_last_month?: Fact<boolean>;
  /** Assistant-supplied only: a hire or a paid board fee is about to start (TÖR). */
  hire_or_board_fee_starting?: Fact<boolean>;
}
export interface Source { act_et: string; section: string; url: string; tier: "A" | "B"; }
export interface Obligation {
  rule_id: string; covers: string[]; kind: "deadline" | "risk" | "warning" | "info";
  title_et: string; title_en: string; period_label_et: string; period_label_en: string;
  statutory_due: string | null; effective_due: string | null; shifted: boolean;
  applies: "yes" | "if"; condition_et?: string; condition_en?: string;
  reason_et: string; reason_en: string;
  applies_because: { fact: string; value: unknown; provenance: Provenance; source?: string }[];
  source: Source;
}
export interface FactNeeded { fact: string; question_et: string; question_en: string; }

const RT = "https://www.riigiteataja.ee/akt/";
const SRC = {
  kmd: { act_et: "Käibemaksuseadus", section: "§ 27 lg 1, § 38 lg 1", url: `${RT}130062026129`, tier: "A" },
  tsd: { act_et: "Tulumaksuseadus", section: "§ 40 lg 4–5, § 54 lg 2 ja 4", url: `${RT}109072026066`, tier: "A" },
  annual: { act_et: "Äriseadustik", section: "§ 179 lg 4", url: `${RT}106072023131`, tier: "A" },
  overdue: { act_et: "Äriregistri seadus", section: "§ 57 lg 1, § 61 lg 1–2", url: `${RT}114032025010`, tier: "A" },
  vatReg: { act_et: "Käibemaksuseadus", section: "§ 19 lg 1, § 20 lg 1", url: `${RT}130062026129`, tier: "A" },
  tor: { act_et: "Maksukorralduse seadus", section: "§ 25¹ lg 4, § 25² lg 3", url: `${RT}116102026010`, tier: "A" },
} satisfies Record<string, Source>;
const VAT_THRESHOLD_EUR = 40_000;

// --- calendar: ISO dates (YYYY-MM-DD) handled as UTC midnights ---
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d));
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const daysIn = (y: number, m0: number) => utc(y, m0 + 1, 0).getUTCDate();
const addDays = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
/** TsÜS § 136 lg 3–4: same day number n months later, capped at month end. */
export function addMonths(s: string, n: number): string {
  const d = parse(s), y = d.getUTCFullYear(), m = d.getUTCMonth() + n;
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
  return iso(utc(ty, tm, Math.min(d.getUTCDate(), daysIn(ty, tm))));
}
/** Easter Sunday by the Gregorian computus (anonymous algorithm). */
export function easterSunday(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(utc(y, month - 1, day));
}
/** PTS §§ 1–2 days off: fixed dates plus Good Friday, Easter Sunday and Pentecost. */
export function publicHolidays(y: number): Set<string> {
  const e = easterSunday(y);
  return new Set([...["01-01", "02-24", "05-01", "06-23", "06-24", "08-20", "12-24", "12-25", "12-26"].map((md) => `${y}-${md}`), addDays(e, -2), e, addDays(e, 49)]);
}
export const isWorkingDay = (s: string) => { const wd = parse(s).getUTCDay(); return wd !== 0 && wd !== 6 && !publicHolidays(parse(s).getUTCFullYear()).has(s); };
/** deadline-shift-next-working-day: MKS § 50 lg 1 → TsÜS § 136 lg 8 (Saturday per U7). */
export function shiftToWorkingDay(s: string): string { let d = s; while (!isWorkingDay(d)) d = addDays(d, 1); return d; }

/** Calendar date in Europe/Tallinn. */
export const tallinnDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tallinn", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const ET_MONTH = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august", "september", "oktoober", "november", "detsember"];
const ET_IN = ["jaanuaris", "veebruaris", "märtsis", "aprillis", "mais", "juunis", "juulis", "augustis", "septembris", "oktoobris", "novembris", "detsembris"];
const EN_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const because = (name: string, f: Fact<unknown> | undefined) => f ? [{ fact: name, value: f.value, provenance: f.provenance, ...(f.source ? { source: f.source } : {}) }] : [];
const known = <T>(f: Fact<T> | undefined): f is Fact<T> => f !== undefined && f.value !== null && f.value !== undefined;

/** Default FY end per RPS § 13 lg 3 (U4); an assumption, never a register fact. */
export const DEFAULT_FY_END: Fact<string> = { value: "12-31", provenance: "assumption", source: "RPS § 13 lg 3 default (U4)" };

export function computeObligations(facts: CompanyFacts, opts: { today: Date; months: number }): { obligations: Obligation[]; facts_needed: FactNeeded[]; window: { from: string; to: string } } {
  const months = Math.min(3, Math.max(1, Math.trunc(opts.months)));
  const from = tallinnDate(opts.today);
  const f0 = parse(from);
  const to = iso(utc(f0.getUTCFullYear(), f0.getUTCMonth() + months, 0));
  const inWindow = (d: string) => d >= from && d <= to;
  const out: Obligation[] = [];
  const needed: FactNeeded[] = [];
  const need = (fact: string, question_et: string, question_en: string) => { if (!needed.some((n) => n.fact === fact)) needed.push({ fact, question_et, question_en }); };
  const dated = (statutory: string) => { const effective = shiftToWorkingDay(statutory); return { statutory_due: statutory, effective_due: effective, shifted: effective !== statutory }; };
  // Monthly returns: due months from the month before the window to its last month.
  const dueMonths: { y: number; m0: number }[] = [];
  for (let i = -1; i < months; i++) { const d = utc(f0.getUTCFullYear(), f0.getUTCMonth() + i, 1); dueMonths.push({ y: d.getUTCFullYear(), m0: d.getUTCMonth() }); }
  const periodOf = ({ y, m0 }: { y: number; m0: number }) => { const p = utc(y, m0 - 1, 1); return { y: p.getUTCFullYear(), m0: p.getUTCMonth() }; };
  const lastMonth = periodOf({ y: f0.getUTCFullYear(), m0: f0.getUTCMonth() });

  // vat-return-kmd + vat-payment: the 20th after each calendar month (KMS § 27 lg 1, § 38 lg 1; U2).
  const vat = facts.vat_registered;
  if (!known(vat)) need("vat_registered", "Kas ettevõte on käibemaksukohustuslane (KMKR number)?", "Is the company VAT-registered (has a VAT number)?");
  if (!known(vat) || vat.value) {
    for (const dm of dueMonths) {
      const d = dated(iso(utc(dm.y, dm.m0, 20)));
      if (!inWindow(d.effective_due)) continue;
      const p = periodOf(dm);
      out.push({ rule_id: "vat-return-kmd", covers: ["vat-return-kmd", "vat-payment"], kind: "deadline", title_et: "KMD ja käibemaks", title_en: "VAT return (KMD) and VAT payment",
        period_label_et: `${ET_MONTH[p.m0]} ${p.y}`, period_label_en: `${EN_MONTH[p.m0]} ${p.y}`, ...d,
        ...(known(vat)
          ? { applies: "yes" as const, reason_et: "Kehtib, sest oled käibemaksukohustuslane; deklaratsioon esitatakse ka tehinguteta kuu eest.", reason_en: "Applies because the company is VAT-registered; the return is due even for a month with no transactions." }
          : { applies: "if" as const, condition_et: "Kehtib, kui oled käibemaksukohustuslane.", condition_en: "Applies if the company is VAT-registered.", reason_et: "Kehtib, kui oled käibemaksukohustuslane.", reason_en: "Applies if the company is VAT-registered." }),
        applies_because: because("vat_registered", vat), source: SRC.kmd });
    }
  }

  // tsd-monthly-return + tsd-tax-payment + cit-distribution: the 10th after the payout month.
  const payouts = facts.payouts_last_month, employees = facts.employees;
  if (!known(payouts)) need("payouts_last_month", `Kas maksid ${ET_IN[lastMonth.m0]} palka, juhatuse liikme tasu või dividende?`, `Did the company pay salary, a board member fee or dividends in ${EN_MONTH[lastMonth.m0]}?`);
  for (const dm of dueMonths) {
    const d = dated(iso(utc(dm.y, dm.m0, 10)));
    if (!inWindow(d.effective_due)) continue;
    const p = periodOf(dm);
    const isLast = p.y === lastMonth.y && p.m0 === lastMonth.m0;
    const noEmployees = known(employees) && employees.value === 0;
    let row: Pick<Obligation, "applies" | "condition_et" | "condition_en" | "reason_et" | "reason_en"> | null;
    if (isLast && known(payouts) && payouts.value) row = { applies: "yes", reason_et: `Kehtib, sest maksid ${ET_IN[p.m0]} palka, juhatuse liikme tasu või dividende.`, reason_en: `Applies because the company made payouts in ${EN_MONTH[p.m0]}.` };
    else if (isLast && known(payouts) && noEmployees) row = null; // EMTA: no zero-return without payouts or employees.
    else {
      const et = isLast && known(payouts) ? "Kehtib, kui sul on töölepinguga töötaja, kelle töötamine pole TÖR-is peatatud." : `Kehtib, kui maksid ${ET_IN[p.m0]} palka, juhatuse liikme tasu või dividende${noEmployees ? "" : " või kui sul on töölepinguga töötaja"}.`;
      const en = isLast && known(payouts) ? "Applies if you have an employee under an employment contract whose work is not suspended in the employment register." : `Applies if you paid salary, a board member fee or dividends in ${EN_MONTH[p.m0]}${noEmployees ? "" : " or have an employee under an employment contract"}.`;
      row = { applies: "if", condition_et: et, condition_en: en, reason_et: et, reason_en: en };
    }
    if (!row) continue;
    out.push({ rule_id: "tsd-monthly-return", covers: ["tsd-monthly-return", "tsd-tax-payment", "cit-distribution"], kind: "deadline", title_et: "TSD ja maksud", title_en: "Income and social tax return (TSD) and taxes",
      period_label_et: `${ET_MONTH[p.m0]} ${p.y} väljamaksed`, period_label_en: `${EN_MONTH[p.m0]} ${p.y} payouts`, ...d, ...row,
      applies_because: [...(isLast ? because("payouts_last_month", payouts) : []), ...because("employees", employees), ...because("labour_taxes_last_quarter", facts.labour_taxes_last_quarter)], source: SRC.tsd });
  }

  // annual-report: within 6 months of FY end (ÄS § 179 lg 4, TsÜS § 136 lg 3–4); annual-report-overdue: risk only (U9: no fine amount).
  const fy = known(facts.fy_end) ? facts.fy_end : DEFAULT_FY_END;
  if (fy.provenance === "assumption") need("fy_end", "Kas põhikiri määrab majandusaastaks muu perioodi kui kalendriaasta?", "Do the articles set a financial year other than the calendar year?");
  const ar = facts.annual_report;
  if (!known(ar)) need("annual_report", "Kas viimase majandusaasta aruanne on äriregistrile esitatud?", "Has the latest annual report been filed with the Business Register?");
  const [fm, fd] = fy.value.split("-").map(Number);
  const fyRows = [-2, -1, 0, 1].map((k) => {
    const y = f0.getUTCFullYear() + k, end = iso(utc(y, fm - 1, Math.min(fd, daysIn(y, fm - 1))));
    return { y, end, ...dated(addMonths(end, 6)) };
  });
  const fyLabel = (r: { y: number; end: string }) => fy.value === "12-31" ? { et: `${r.y}. a majandusaasta aruanne`, en: `${r.y} annual report` } : { et: `Majandusaasta aruanne (majandusaasta lõppes ${r.end})`, en: `Annual report (financial year ended ${r.end})` };
  // Register signal: latest_year is the newest report period on file; filed refers to that period.
  const filedFor = (y: number): boolean | null => {
    if (!known(ar) || ar.value.latest_year === null) return null;
    return ar.value.latest_year > y || (ar.value.latest_year === y && ar.value.filed !== false);
  };
  for (const r of fyRows) {
    if (!inWindow(r.effective_due) || filedFor(r.y) === true) continue;
    const l = fyLabel(r);
    out.push({ rule_id: "annual-report", covers: ["annual-report"], kind: "deadline", title_et: "Majandusaasta aruanne", title_en: "Annual report", period_label_et: l.et, period_label_en: l.en,
      statutory_due: r.statutory_due, effective_due: r.effective_due, shifted: r.shifted, applies: "yes",
      reason_et: "Kehtib igale osaühingule iga majandusaasta kohta, ka tegevuseta aasta eest.", reason_en: "Applies to every OÜ for every financial year, including inactive years.",
      applies_because: because("fy_end", fy), source: SRC.annual });
  }
  const lapsed = fyRows.filter((r) => r.effective_due < from).pop();
  const overdueDays = known(ar) ? ar.value.overdue_days : null;
  const lapsedState = lapsed ? filedFor(lapsed.y) : true;
  if (lapsed && (lapsedState === false || (overdueDays ?? 0) > 0 || lapsedState === null)) {
    const l = fyLabel(lapsed), deletion = addMonths(lapsed.statutory_due, 3);
    const yes = lapsedState === false || (overdueDays ?? 0) > 0;
    const risk_et = `Registripidaja võib määrata trahvi korduvalt ja ilma hoiatuseta; registrist kustutamine on võimalik alates ${deletion}, kui ka registripidaja antud tähtaeg möödub.`;
    const risk_en = `The registrar may fine repeatedly without a warning; deletion from the register is possible from ${deletion} once the registrar's own deadline has also passed.`;
    out.push({ rule_id: "annual-report-overdue", covers: ["annual-report-overdue"], kind: "risk", title_et: "Majandusaasta aruanne on tähtajast maas", title_en: "Annual report is overdue", period_label_et: l.et, period_label_en: l.en,
      statutory_due: lapsed.statutory_due, effective_due: lapsed.effective_due, shifted: lapsed.shifted,
      ...(yes ? { applies: "yes" as const } : { applies: "if" as const, condition_et: `Kehtib, kui ${l.et.toLowerCase()} on esitamata.`, condition_en: `Applies if the ${l.en.charAt(0).toLowerCase()}${l.en.slice(1)} has not been filed.` }),
      reason_et: risk_et, reason_en: risk_en,
      applies_because: [...because("annual_report", ar), ...because("tax_debt_on_list", facts.tax_debt_on_list)], source: SRC.overdue });
  }

  // vat-registration-threshold: warning only, never a legal decision (U5).
  if (known(vat) && !vat.value) {
    const rev = facts.latest_annual_revenue;
    if (!known(rev)) need("latest_annual_revenue", "Kui suur on selle aasta käive Eestis seni?", "What is this calendar year's Estonian turnover so far?");
    const over = known(rev) && rev.value > VAT_THRESHOLD_EUR;
    const et = "Kui selle kalendriaasta käive Eestis ületab 40 000 eurot, esita 3 tööpäeva jooksul avaldus käibemaksukohustuslaseks registreerimiseks. Arvuta käive oma arvetest, mitte avalikest andmetest.";
    const en = "If this calendar year's Estonian turnover exceeds €40,000, apply for VAT registration within 3 working days. Count turnover from your own invoices, not from public data.";
    out.push({ rule_id: "vat-registration-threshold", covers: ["vat-registration-threshold"], kind: "warning", title_et: "Käibemaksukohustuslaseks registreerimise piir", title_en: "VAT registration threshold",
      period_label_et: `${f0.getUTCFullYear()}. a käive`, period_label_en: `${f0.getUTCFullYear()} turnover`, statutory_due: null, effective_due: null, shifted: false,
      applies: "if", condition_et: et, condition_en: en,
      reason_et: known(rev) ? `Viimase aruande müügitulu oli ${new Intl.NumberFormat("et-EE").format(rev.value)} eurot${over ? ", üle piiri: tõenäoliselt ületad piiri ka sel aastal" : ""}. ${et}` : et,
      reason_en: known(rev) ? `Revenue in the latest annual report was €${new Intl.NumberFormat("en-GB").format(rev.value)}${over ? ", above the threshold: likely to cross it this year too" : ""}. ${en}` : en,
      applies_because: [...because("vat_registered", vat), ...because("latest_annual_revenue", rev)], source: SRC.vatReg });
  }

  // tor-registration: informational, only when a hire or paid board fee is starting (U3).
  const hire = facts.hire_or_board_fee_starting;
  if (known(hire) && hire.value) {
    out.push({ rule_id: "tor-registration", covers: ["tor-registration"], kind: "info", title_et: "Töötamise registreerimine (TÖR)", title_en: "Employment register (TÖR) entry",
      period_label_et: "enne tööle asumist", period_label_en: "before work starts", statutory_due: null, effective_due: null, shifted: false, applies: "yes",
      reason_et: "Registreeri töötamine hiljemalt tööle asumise hetkeks; juhatuse liikme tasu puhul enne tasustatava perioodi algust ja enne esimest väljamakset.",
      reason_en: "Register the work no later than when the person starts; for a board fee, before the paid period starts and before the first payout.",
      applies_because: because("hire_or_board_fee_starting", hire), source: SRC.tor });
  }

  out.sort((a, b) => (a.effective_due ?? "9999") < (b.effective_due ?? "9999") ? -1 : (a.effective_due ?? "9999") > (b.effective_due ?? "9999") ? 1 : 0);
  return { obligations: out, facts_needed: needed, window: { from, to } };
}

/** Official RIK checksum for 8-digit registry codes (weights 1–7, then 3–9; modulo 11). */
export function validRegistryCode(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const d = [...code].map(Number);
  const sum = (w0: number) => d.slice(0, 7).reduce((s, x, i) => s + x * (i + w0), 0) % 11;
  let r = sum(1);
  if (r === 10) r = sum(3) % 10;
  return r === d[7];
}
