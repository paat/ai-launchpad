import { assessmentSchema, type Assessment } from "./core.js";
import type { CompanyFacts, Fact } from "./obligations.js";

/** Two unrelated SYNTHETIC demo assessments, as data only. Seeded after an
 * explicit synthetic demo login (never for real/Google workspaces) and always
 * labelled synthetic + assistant-reported, not verified. */
export const DEMO_COMPANIES = [
  { key: "alpha", label: "Mari Disain OÜ (näidis)" },
  { key: "beta", label: "Kase Konsult OÜ (näidis)" },
] as const;

// One coherent demo company (ux2 change 6): the same Mari Disain OÜ as the
// synthetic register facts below (19990001), a one-person graphic-design OÜ.
const alpha: Assessment = assessmentSchema.parse({
  assessed_domains: ["money", "customers", "operations"],
  company_label: "Mari Disain OÜ (näidis)",
  company_registry_ref: "19990001",
  responsibilities: [
    { id: "design-work", domain: "operations", label: "Disainitööd", applicability: "applicable", is_core: true, arrangement: "none", reason: "Omaniku põhitöö; see jääb talle. (Näidis.)", evidence_refs: [] },
    { id: "invoicing", domain: "money", label: "Arvete koostamine", applicability: "applicable", is_core: false, arrangement: "none", reason: "Mari koostab arved pärast iga tööd käsitsi. (Näidis.)", evidence_refs: ["fixture:alpha-invoicing"] },
    { id: "payment-reminders", domain: "customers", label: "Maksemeeldetuletused", applicability: "applicable", is_core: false, arrangement: "none", reason: "Tasumata arveid jälgib Mari ise ja kirjutab meeldetuletused käsitsi. (Näidis.)", evidence_refs: ["fixture:alpha-reminders"] },
    { id: "vat-prep", domain: "money", label: "KMD ettevalmistus", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "raamatupidaja", access: "Raamatupidajal on raamatupidamisprogrammi ligipääs (näidis)", success_criterion: "KMD numbrid on iga kuu enne 20. kuupäeva Mari jaoks valmis", next_checkpoint: "Järgmine kuu lõpetamine (näidis)", reason: "Raamatupidaja teeb KMD numbrid; Mari esitab. AI-hüppelaud ei esita midagi. (Näidis.)", evidence_refs: ["fixture:alpha-vat"] },
  ],
  gaps: [],
  assumptions: ["Näidis: päris ettevõtte andmeid ei kasutatud."],
  conclusion: "Näidis: KMD numbrid teeb raamatupidaja, arved ja maksemeeldetuletused teeb Mari veel käsitsi.",
  next_action: { title: "Lase assistendil tasumata arvetele meeldetuletused koostada", rationale: "Kaotab arvete käsitsi jälgimise; sina ainult kinnitad iga kirja.", savings_basis: "unknown", uncertainty: "Näidise mahud on välja mõeldud; aega pole mõõdetud.", needs_owner: true },
});

// The second demo company matches its synthetic register facts (19990002):
// a consultancy that is not VAT-registered and pays one employee.
const beta: Assessment = assessmentSchema.parse({
  assessed_domains: ["money", "people", "operations"],
  company_label: "Kase Konsult OÜ (näidis)",
  company_registry_ref: "19990002",
  responsibilities: [
    { id: "payroll", domain: "people", label: "Palgaarvestus ja TSD andmed", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "raamatupidaja", access: "Raamatupidajal on palgaprogrammi ligipääs (näidis)", success_criterion: "TSD andmed on iga kuu enne 10. kuupäeva valmis", next_checkpoint: "Järgmine palgapäev (näidis)", reason: "Raamatupidaja arvestab töötaja palga; omanik esitab TSD. (Näidis.)", evidence_refs: ["fixture:beta-payroll"] },
    { id: "bookkeeping-access", domain: "money", label: "Raamatupidamise ühendus", applicability: "applicable", is_core: false, arrangement: "none", reason: "Näidis: raamatupidamisprogrammi ühendus aegus, seega kuludokumendid kogunevad omaniku kätte.", evidence_refs: ["fixture:beta-books"] },
    { id: "consulting", domain: "operations", label: "Konsultatsioonitööd", applicability: "applicable", is_core: true, arrangement: "none", reason: "Omaniku põhitöö; see jääb talle. (Näidis.)", evidence_refs: [] },
  ],
  gaps: ["Kliendi- ja õigusvaldkonda selles näidises ei hinnatud, seega üldist katvust ei näidata."],
  assumptions: ["Näidis: päris ettevõtte andmeid ei kasutatud."],
  conclusion: "Näidis: palga teeb raamatupidaja, kuid raamatupidamise ühendus aegus ja kaks valdkonda on hindamata.",
  next_action: { title: "Taasta raamatupidamise ühendus", rationale: "Kuludokumendid ei kogune enam sinu kätte ja raamatupidaja senine töö jätkub; uut tööriista pole vaja.", uncertainty: "Näidis; päris sammud sõltuvad teenusepakkujast.", needs_owner: true },
});

export const DEMO_FIXTURES: Record<string, Assessment> = { alpha, beta };

/** English twins of the labels we wrote in the fixtures above, for ?lang=en on a sample workspace (#63 m13).
 * Only labels: the fixtures' free text (reasons, conclusions, gaps) stays as written. */
export const DEMO_LABELS_EN: Record<string, string> = {
  "Mari Disain OÜ (näidis)": "Mari Disain OÜ (sample)", "Kase Konsult OÜ (näidis)": "Kase Konsult OÜ (sample)",
  Disainitööd: "Design work", "Arvete koostamine": "Invoicing", Maksemeeldetuletused: "Payment reminders", "KMD ettevalmistus": "VAT return (KMD)",
  "Palgaarvestus ja TSD andmed": "Payroll and TSD data", "Raamatupidamise ühendus": "Accounting connection", Konsultatsioonitööd: "Consulting work",
  raamatupidaja: "the accountant",
  "Lase assistendil tasumata arvetele meeldetuletused koostada": "Let your assistant draft reminders for unpaid invoices",
  "Taasta raamatupidamise ühendus": "Restore the accounting connection",
};

/** SYNTHETIC register facts for the deadlines demo. The codes deliberately FAIL
 * the RIK checksum, so they can never match a real company. Their facts are
 * shaped like public-register facts but always carry provenance synthetic
 * and are labelled Näidis / Sample, never "Ametlik allikas". */
const sample = <T>(value: T): Fact<T> => ({ value, provenance: "synthetic", source: "synthetic_fixture", as_of: "2026-10-29" });
export const SYNTHETIC_COMPANIES: Record<string, { name: string; facts: CompanyFacts }> = {
  "19990001": { name: "Mari Disain OÜ", facts: { company_name: sample("Mari Disain OÜ"), registry_code: sample("19990001"), vat_registered: sample(true), labour_taxes_last_quarter: sample(0), employees: sample(0), annual_report: sample({ latest_year: 2025, filed: true, overdue_days: 0 }), tax_debt_on_list: sample(false) } },
  "19990002": { name: "Kase Konsult OÜ", facts: { company_name: sample("Kase Konsult OÜ"), registry_code: sample("19990002"), vat_registered: sample(false), labour_taxes_last_quarter: sample(1240), employees: sample(1), latest_annual_revenue: { ...sample(38_000), as_of: "2025" }, annual_report: sample({ latest_year: 2025, filed: true, overdue_days: 0 }), tax_debt_on_list: sample(false) } },
};
