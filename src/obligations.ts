/** Deterministic Estonian deadlines for a one-person OÜ (issue #19). Pure: no
 * I/O, no model. Rules, sources and defaults follow
 * docs/research/N-obligation-deadline-rules.md; rule ids match the memo. */

/** "synthetic": made-up Näidis / Sample fixtures, never register data. */
export type Provenance = "public_register" | "assistant_supplied" | "assumption" | "synthetic";
export interface Fact<T> { value: T; provenance: Provenance; as_of?: string; source?: string; }
export interface AnnualReportStatus { latest_year: number | null; filed: boolean | null; overdue_days: number | null; }
export interface CompanyFacts {
  company_name?: Fact<string>; registry_code?: Fact<string>;
  vat_registered?: Fact<boolean>; labour_taxes_last_quarter?: Fact<number>; employees?: Fact<number>;
  fy_end?: Fact<string>; annual_report?: Fact<AnnualReportStatus>; tax_debt_on_list?: Fact<boolean>;
  /** Revenue in the latest annual report (register or fixture); as_of is the report year. */
  latest_annual_revenue?: Fact<number>;
  /** Assistant-supplied only: this calendar year's Estonian turnover so far. */
  ytd_turnover_this_year?: Fact<number>;
  /** Assistant-supplied only: payouts (salary, board fee, dividends) in the last calendar month. */
  payouts_last_month?: Fact<boolean>;
  /** Assistant-supplied only: an employee (even unpaid) or another TSD trigger in the last calendar month. */
  other_tsd_triggers_last_month?: Fact<boolean>;
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
  /** Who does what (ux2 change 2): static copy per rule, never model output or amounts. */
  handoff: Handoff;
}
export interface Handoff { assistant_et: string; assistant_en: string; owner_et: string; owner_en: string; prompt_et: string; prompt_en: string; }
export interface FactNeeded { fact: string; question_et: string; question_en: string;
  /** Period facts: the period_label_et of the one row the answer can change. */
  period_label_et?: string; }

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
/** Genitive month names for "{kuu}" in handoff copy ("oktoobri arved"). */
export const ET_OF = ["jaanuari", "veebruari", "märtsi", "aprilli", "mai", "juuni", "juuli", "augusti", "septembri", "oktoobri", "novembri", "detsembri"];
/** Civil dates in owner-facing text: "30.09.2026" / "30 September 2026", never ISO. */
const etDate = (s: string) => { const d = parse(s); return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`; };
const enDate = (s: string) => { const d = parse(s); return `${d.getUTCDate()} ${EN_MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const EN_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Static who-does-what map, keyed by rule_id (TSD also by applies). {kuu}/{month} is the period month. */
export const HANDOFF: Record<string, Handoff> = {
  "vat-return-kmd": { assistant_et: "kogub {kuu} arved kokku ja kontrollib, et ükski pole puudu", assistant_en: "gathers {month}'s invoices and checks none are missing", owner_et: "esitad KMD e-MTA-s oma Smart-ID-ga", owner_en: "file the VAT return in e-MTA with your Smart-ID",
    prompt_et: "Valmista {kuu} KMD jaoks arved ette ja küsi minult kinnitust enne, kui midagi saadad.", prompt_en: "Prepare the invoices for the {month} VAT return and ask me before you send anything." },
  "tsd-monthly-return:if": { assistant_et: "küsib, kas maksid {kuu} palka või oli töötaja; kui kumbagi polnud, kaob see rida", assistant_en: "asks whether you made payouts or had an employee in {month}; if neither, this row goes away", owner_et: "vastad „jah” või „ei”", owner_en: "answer yes or no",
    prompt_et: "Küsi minult {kuu} väljamaksete kohta ja ütle, kas TSD-d on vaja.", prompt_en: "Ask me about {month}'s payouts and tell me whether a TSD is needed." },
  "tsd-monthly-return:yes": { assistant_et: "paneb väljamaksed kokku ja valmistab TSD andmed ette", assistant_en: "collects the payouts and prepares the TSD data", owner_et: "esitad TSD e-MTA-s", owner_en: "file the TSD in e-MTA",
    prompt_et: "Pane {kuu} väljamaksed kokku ja valmista TSD andmed ette. Küsi minult kinnitust enne, kui midagi saadad.", prompt_en: "Collect {month}'s payouts and prepare the TSD data. Ask me before you send anything." },
  "annual-report": { assistant_et: "paneb aruande jaoks vajalikud andmed kokku", assistant_en: "gathers what the report needs", owner_et: "kinnitad ja allkirjastad e-äriregistris", owner_en: "approve and sign in the e-Business Register",
    prompt_et: "Pane majandusaasta aruande jaoks vajalikud andmed kokku ja ütle, mida sinult veel vaja on.", prompt_en: "Gather what the annual report needs and tell me what you still need from me." },
  "annual-report-overdue": { assistant_et: "koostab sammud aruande esitamiseks", assistant_en: "lays out the steps to file", owner_et: "esitad aruande e-äriregistris", owner_en: "file it in the e-Business Register",
    prompt_et: "Koosta mulle sammud hilinenud majandusaasta aruande esitamiseks.", prompt_en: "Lay out the steps for me to file the overdue annual report." },
  "vat-registration-threshold": { assistant_et: "kontrollib sinu arvetest, kas piir on lähedal, kui sa seda palud", assistant_en: "checks your invoices against the threshold when you ask", owner_et: "esitad avalduse, kui piir ületatakse", owner_en: "apply if you cross it",
    prompt_et: "Kontrolli minu arvetest, kui lähedal on selle aasta käive käibemaksukohustuslaseks registreerimise piirile.", prompt_en: "Check my invoices for how close this year's turnover is to the VAT registration threshold." },
  "tor-registration": { assistant_et: "valmistab TÖR-i kande andmed ette", assistant_en: "prepares the employment-register entry", owner_et: "kinnitad kande e-MTA-s", owner_en: "confirm it in e-MTA",
    prompt_et: "Valmista TÖR-i kande andmed ette ja küsi minult kinnitust.", prompt_en: "Prepare the employment-register entry and ask me to confirm it." },
};
const handoff = (key: string, m0?: number): Handoff => {
  const h = HANDOFF[key], et = (v: string) => v.replace("{kuu}", m0 === undefined ? "" : ET_OF[m0]), en = (v: string) => v.replace("{month}", m0 === undefined ? "" : EN_MONTH[m0]);
  return { assistant_et: et(h.assistant_et), assistant_en: en(h.assistant_en), owner_et: h.owner_et, owner_en: h.owner_en, prompt_et: et(h.prompt_et), prompt_en: en(h.prompt_en) };
};

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
  const need = (fact: string, question_et: string, question_en: string, period_label_et?: string) => { if (!needed.some((n) => n.fact === fact)) needed.push({ fact, question_et, question_en, ...(period_label_et ? { period_label_et } : {}) }); };
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
        applies_because: because("vat_registered", vat), source: SRC.kmd, handoff: handoff("vat-return-kmd", p.m0) });
    }
  }

  // tsd-monthly-return + tsd-tax-payment + cit-distribution: the 10th after the payout month.
  const payouts = facts.payouts_last_month, others = facts.other_tsd_triggers_last_month, labour = facts.labour_taxes_last_quarter;
  // Register employee counts are quarterly, lagged and exclude board members: they never suppress a row.
  const saidNo = (f: Fact<boolean> | undefined) => known(f) && !f.value && f.provenance === "assistant_supplied";
  for (const dm of dueMonths) {
    const d = dated(iso(utc(dm.y, dm.m0, 10)));
    if (!inWindow(d.effective_due)) continue;
    const p = periodOf(dm);
    const isLast = p.y === lastMonth.y && p.m0 === lastMonth.m0;
    const period_label_et = `${ET_MONTH[p.m0]} ${p.y} väljamaksed`;
    const otherYes = known(others) && others.value;
    // Ask about last month's payouts only when that month's TSD row is in the window and could still go away.
    if (isLast && !known(payouts) && !otherYes) need("payouts_last_month", `Kas maksid ${ET_IN[p.m0]} palka, juhatuse liikme tasu või dividende?`, `Did the company pay salary, a board member fee or dividends in ${EN_MONTH[p.m0]}?`, period_label_et);
    let row: Pick<Obligation, "applies" | "condition_et" | "condition_en" | "reason_et" | "reason_en"> | null;
    if (isLast && known(payouts) && payouts.value) row = { applies: "yes", reason_et: `Kehtib, sest maksid ${ET_IN[p.m0]} palka, juhatuse liikme tasu või dividende.`, reason_en: `Applies because the company made payouts in ${EN_MONTH[p.m0]}.` };
    else if (isLast && otherYes) row = { applies: "yes", reason_et: `Kehtib, sest assistendi sõnul oli ${ET_IN[p.m0]} töötaja või muu TSD kohustus.`, reason_en: `Applies because your assistant reports an employee or another TSD obligation in ${EN_MONTH[p.m0]}.` };
    else if (isLast && saidNo(payouts) && saidNo(others)) row = null; // EMTA: no zero-return without payouts or employees.
    else {
      const et = isLast && known(payouts) ? "Kehtib, kui sul on töölepinguga töötaja, kelle töötamine pole TÖR-is peatatud." : `Kehtib, kui maksid ${ET_IN[p.m0]} palka, juhatuse liikme tasu või dividende või kui sul on töölepinguga töötaja.`;
      const en = isLast && known(payouts) ? "Applies if you have an employee under an employment contract whose work is not suspended in the employment register." : `Applies if you paid salary, a board member fee or dividends in ${EN_MONTH[p.m0]} or have an employee under an employment contract.`;
      // Register labour taxes are quarterly and lagged: a likely signal, never a definite yes.
      const likely = known(labour) && labour.value > 0;
      row = { applies: "if", condition_et: et, condition_en: en, reason_et: likely ? "Tõenäoliselt kehtib: viimases kvartalis deklareeriti tööjõumakse." : et, reason_en: likely ? "Likely applies: labour taxes were declared in the latest quarter." : en };
      if (isLast && known(payouts) && !known(others)) need("other_tsd_triggers_last_month", `Kas sul oli ${ET_IN[p.m0]} töölepinguga töötaja (ka palgata) või muu TSD kohustus?`, `Did the company have an employee under an employment contract (even unpaid) or any other TSD obligation in ${EN_MONTH[p.m0]}?`, period_label_et);
    }
    if (!row) continue;
    out.push({ rule_id: "tsd-monthly-return", covers: ["tsd-monthly-return", "tsd-tax-payment", "cit-distribution"], kind: "deadline", title_et: "TSD ja maksud", title_en: "Income and social tax return (TSD) and taxes",
      period_label_et, period_label_en: `${EN_MONTH[p.m0]} ${p.y} payouts`, ...d, ...row,
      applies_because: [...(isLast ? [...because("payouts_last_month", payouts), ...because("other_tsd_triggers_last_month", others)] : []), ...because("employees", facts.employees), ...because("labour_taxes_last_quarter", labour)], source: SRC.tsd, handoff: handoff(`tsd-monthly-return:${row.applies}`, p.m0) });
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
  const fyLabel = (r: { y: number; end: string }) => fy.value === "12-31" ? { et: `${r.y}. a majandusaasta aruanne`, en: `${r.y} annual report` } : { et: `Majandusaasta aruanne (majandusaasta lõppes ${etDate(r.end)})`, en: `Annual report (financial year ended ${enDate(r.end)})` };
  // Register signal: latest_year is the newest report period on file; filed refers to that period.
  const filedFor = (y: number): boolean | null => {
    if (!known(ar) || ar.value.latest_year === null) return null;
    if (ar.value.latest_year !== y) return ar.value.latest_year > y;
    return ar.value.filed; // null: the filing state is unknown, never assumed filed
  };
  const unfiled = (l: { et: string; en: string }) => ({ condition_et: `Kehtib, kui ${l.et.toLowerCase()} on esitamata.`, condition_en: `Applies if the ${l.en.charAt(0).toLowerCase()}${l.en.slice(1)} has not been filed.` });
  for (const r of fyRows) {
    const state = filedFor(r.y);
    if (!inWindow(r.effective_due) || state === true) continue;
    const l = fyLabel(r);
    out.push({ rule_id: "annual-report", covers: ["annual-report"], kind: "deadline", title_et: "Majandusaasta aruanne", title_en: "Annual report", period_label_et: l.et, period_label_en: l.en,
      statutory_due: r.statutory_due, effective_due: r.effective_due, shifted: r.shifted, ...(state === null ? { applies: "if" as const, ...unfiled(l) } : { applies: "yes" as const }),
      reason_et: "Kehtib igale osaühingule iga majandusaasta kohta, ka tegevuseta aasta eest.", reason_en: "Applies to every OÜ for every financial year, including inactive years.",
      applies_because: because("fy_end", fy), source: SRC.annual, handoff: handoff("annual-report") });
  }
  const lapsed = fyRows.filter((r) => r.effective_due < from).pop();
  const overdueDays = known(ar) ? ar.value.overdue_days : null;
  const lapsedState = lapsed ? filedFor(lapsed.y) : true;
  if (lapsed && (lapsedState === false || (overdueDays ?? 0) > 0 || lapsedState === null)) {
    const l = fyLabel(lapsed), deletion = addMonths(lapsed.statutory_due, 3);
    const yes = lapsedState === false || (overdueDays ?? 0) > 0;
    const risk_et = `Registripidaja võib määrata trahvi korduvalt ja ilma hoiatuseta; registrist kustutamine on võimalik alates ${etDate(deletion)}, kui ka registripidaja antud tähtaeg möödub.`;
    const risk_en = `The registrar may fine repeatedly without a warning; deletion from the register is possible from ${enDate(deletion)} once the registrar's own deadline has also passed.`;
    out.push({ rule_id: "annual-report-overdue", covers: ["annual-report-overdue"], kind: "risk", title_et: "Majandusaasta aruanne on tähtajast maas", title_en: "Annual report is overdue", period_label_et: l.et, period_label_en: l.en,
      statutory_due: lapsed.statutory_due, effective_due: lapsed.effective_due, shifted: lapsed.shifted,
      ...(yes ? { applies: "yes" as const } : { applies: "if" as const, ...unfiled(l) }),
      reason_et: risk_et, reason_en: risk_en,
      applies_because: [...because("annual_report", ar), ...because("tax_debt_on_list", facts.tax_debt_on_list)], source: SRC.overdue, handoff: handoff("annual-report-overdue") });
  }

  // vat-registration-threshold: warning only, never a legal decision (U5).
  if (known(vat) && !vat.value) {
    const rev = facts.latest_annual_revenue, ytd = facts.ytd_turnover_this_year;
    if (!known(ytd)) need("ytd_turnover_this_year", "Kui suur on selle aasta käive Eestis seni?", "What is this calendar year's Estonian turnover so far?");
    const eur = (l: string, n: number) => new Intl.NumberFormat(l).format(n), over = (n: number) => n > VAT_THRESHOLD_EUR;
    const year = known(rev) && rev.as_of ? ` (${rev.as_of})` : "";
    const et = "Kui selle kalendriaasta käive Eestis ületab 40 000 eurot, esita 3 tööpäeva jooksul avaldus käibemaksukohustuslaseks registreerimiseks. Arvuta käive oma arvetest, mitte avalikest andmetest.";
    const en = "If this calendar year's Estonian turnover exceeds €40,000, apply for VAT registration within 3 working days. Count turnover from your own invoices, not from public data.";
    out.push({ rule_id: "vat-registration-threshold", covers: ["vat-registration-threshold"], kind: "warning", title_et: "Käibemaksukohustuslaseks registreerimise piir", title_en: "VAT registration threshold",
      period_label_et: `${f0.getUTCFullYear()}. a käive`, period_label_en: `${f0.getUTCFullYear()} turnover`, statutory_due: null, effective_due: null, shifted: false,
      applies: "if", condition_et: et, condition_en: en,
      reason_et: [known(rev) ? `Viimase majandusaasta aruande${year} müügitulu oli ${eur("et-EE", rev.value)} eurot${over(rev.value) ? ", üle piiri: tõenäoliselt ületad piiri ka sel aastal" : ""}.` : "",
        known(ytd) ? `Assistendi sõnul on selle aasta käive Eestis seni ${eur("et-EE", ytd.value)} eurot${over(ytd.value) ? ", üle piiri" : ""}.` : "", et].filter(Boolean).join(" "),
      reason_en: [known(rev) ? `Revenue in the latest annual report${year} was €${eur("en-GB", rev.value)}${over(rev.value) ? ", above the threshold: likely to cross it this year too" : ""}.` : "",
        known(ytd) ? `Your assistant reports this year's Estonian turnover so far as €${eur("en-GB", ytd.value)}${over(ytd.value) ? ", above the threshold" : ""}.` : "", en].filter(Boolean).join(" "),
      applies_because: [...because("vat_registered", vat), ...because("latest_annual_revenue", rev), ...because("ytd_turnover_this_year", ytd)], source: SRC.vatReg, handoff: handoff("vat-registration-threshold") });
  }

  // tor-registration: informational, only when a hire or paid board fee is starting (U3).
  const hire = facts.hire_or_board_fee_starting;
  if (known(hire) && hire.value) {
    out.push({ rule_id: "tor-registration", covers: ["tor-registration"], kind: "info", title_et: "Töötamise registreerimine (TÖR)", title_en: "Employment register (TÖR) entry",
      period_label_et: "enne tööle asumist", period_label_en: "before work starts", statutory_due: null, effective_due: null, shifted: false, applies: "yes",
      reason_et: "Registreeri töötamine hiljemalt tööle asumise hetkeks; juhatuse liikme tasu puhul enne tasustatava perioodi algust ja enne esimest väljamakset.",
      reason_en: "Register the work no later than when the person starts; for a board fee, before the paid period starts and before the first payout.",
      applies_because: because("hire_or_board_fee_starting", hire), source: SRC.tor, handoff: handoff("tor-registration") });
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
