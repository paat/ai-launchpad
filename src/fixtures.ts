import { assessmentSchema, type Assessment } from "./core.js";
import type { CompanyFacts, Fact } from "./obligations.js";

/** Two unrelated SYNTHETIC demo assessments, as data only. Seeded after an
 * explicit synthetic demo login (never for real/Google workspaces) and always
 * labelled synthetic + assistant-reported, not verified. */
export const DEMO_COMPANIES = [
  { key: "alpha", label: "Mari Disain OÜ (näidis)" },
  { key: "beta", label: "Demo Bakery OÜ (synthetic)" },
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

const beta: Assessment = assessmentSchema.parse({
  assessed_domains: ["money", "customers", "operations"],
  company_label: "Demo Bakery OÜ (synthetic fixture)",
  company_registry_ref: "19990002",
  responsibilities: [
    { id: "supplier-orders", domain: "operations", label: "Weekly supplier orders", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "Bakery manager (fixture)", access: "Manager already orders via supplier portal", success_criterion: "Orders placed before weekly cutoff without owner input", next_checkpoint: "Next weekly order cycle (fixture)", reason: "Already delegated to a named person; assistant only assessed it. (Synthetic fixture.)", evidence_refs: ["fixture:beta-orders"] },
    { id: "bookkeeping-access", domain: "money", label: "Bookkeeping connection", applicability: "applicable", is_core: false, arrangement: "none", reason: "Fixture: the accounting connection expired, so receipts pile up with the owner.", evidence_refs: ["fixture:beta-books"] },
    { id: "baking", domain: "operations", label: "Baking the products", applicability: "applicable", is_core: true, arrangement: "none", reason: "The owner's craft — core work.", evidence_refs: [] },
  ],
  gaps: ["People and legal/sector domains are not assessed in this fixture, so overall coverage is not shown."],
  assumptions: ["Synthetic example only; no real company data was used."],
  conclusion: "Synthetic fixture: ordering is delegated, but the bookkeeping connection lapsed and two domains are unassessed.",
  next_action: { title: "Reconnect bookkeeping access", rationale: "Stops receipts piling up on the owner and restores the existing delegated routine — no new tool needed.", uncertainty: "Fixture only; real access steps depend on the provider.", needs_owner: true },
});

export const DEMO_FIXTURES: Record<string, Assessment> = { alpha, beta };

/** SYNTHETIC register facts for the deadlines demo. The codes deliberately FAIL
 * the RIK checksum, so they can never match a real company. Their facts are
 * shaped like public-register facts but always carry provenance synthetic
 * and are labelled Näidis / Sample, never "Ametlik allikas". */
const sample = <T>(value: T): Fact<T> => ({ value, provenance: "synthetic", source: "synthetic_fixture", as_of: "2026-10-29" });
export const SYNTHETIC_COMPANIES: Record<string, { name: string; facts: CompanyFacts }> = {
  "19990001": { name: "Mari Disain OÜ", facts: { company_name: sample("Mari Disain OÜ"), registry_code: sample("19990001"), vat_registered: sample(true), labour_taxes_last_quarter: sample(0), employees: sample(0), annual_report: sample({ latest_year: 2025, filed: true, overdue_days: 0 }), tax_debt_on_list: sample(false) } },
  "19990002": { name: "Kase Konsult OÜ", facts: { company_name: sample("Kase Konsult OÜ"), registry_code: sample("19990002"), vat_registered: sample(false), labour_taxes_last_quarter: sample(1240), employees: sample(1), latest_annual_revenue: { ...sample(38_000), as_of: "2025" }, annual_report: sample({ latest_year: 2025, filed: true, overdue_days: 0 }), tax_debt_on_list: sample(false) } },
};
