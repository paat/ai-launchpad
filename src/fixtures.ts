import { assessmentSchema, type Assessment } from "./core.js";

/** Two unrelated SYNTHETIC demo assessments, as data only. Seeded after an
 * explicit synthetic demo login (never for real/Google workspaces) and always
 * labelled synthetic + assistant-reported, not verified. */
export const DEMO_COMPANIES = [
  { key: "alpha", label: "Demo Plumbing OÜ (synthetic)" },
  { key: "beta", label: "Demo Bakery OÜ (synthetic)" },
] as const;

const alpha: Assessment = assessmentSchema.parse({
  assessed_domains: ["money", "customers", "people", "legal_sector", "operations"],
  company_label: "Demo Plumbing OÜ (synthetic fixture)",
  responsibilities: [
    { id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "proposed", reason: "Owner writes invoices by hand after each job; no connection exists yet. (Synthetic fixture.)", evidence_refs: ["fixture:alpha-invoicing"] },
    { id: "vat-prep", domain: "money", label: "Monthly VAT return preparation", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "Existing external accountant (fixture)", access: "Accountant already has accounting-software access", success_criterion: "Draft VAT summary ready for owner review each month", next_checkpoint: "Next monthly close (fixture date)", reason: "Accountant already prepares the numbers; owner only reviews. Nothing is filed by Launchpad.", evidence_refs: ["fixture:alpha-vat"] },
    { id: "plumbing-work", domain: "operations", label: "Doing plumbing jobs", applicability: "applicable", is_core: true, arrangement: "none", reason: "This is the owner's trade — core work stays with the owner.", evidence_refs: [] },
    { id: "employee-contracts", domain: "people", label: "Employee contracts", applicability: "unresolved", is_core: false, arrangement: "none", reason: "Fixture leaves this unresolved on purpose: whether seasonal help counts as employment is unassessed, so no percentage is shown.", evidence_refs: [] },
  ],
  gaps: ["Employee-contract applicability is unassessed in this fixture."],
  assumptions: ["Synthetic example only; no real company data was used."],
  conclusion: "Synthetic fixture: bookkeeping prep is already delegated, invoicing is still manual, and one people question is unresolved — so no coverage percentage is claimed.",
  next_action: { title: "Connect invoicing to your assistant", rationale: "Removes hand-written invoices after every job — the most repeated admin work in this fixture.", estimated_effort_saved: "Unknown; unmeasured", savings_basis: "unknown", uncertainty: "Fixture volumes are invented; measure before promising hours.", needs_owner: true },
});

const beta: Assessment = assessmentSchema.parse({
  assessed_domains: ["money", "customers", "operations"],
  company_label: "Demo Bakery OÜ (synthetic fixture)",
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
