import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface ServiceRecord { id: string; name: string; sector?: string; jobs?: string; interface_class?: string; connection?: string; access_and_price?: string; limitations?: string; evidence_status?: string; runtime_tested?: boolean; checked_on?: string; sources?: string[]; }

let cache: ServiceRecord[] | null = null;
export function loadCatalog(): ServiceRecord[] {
  if (cache) return cache;
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "docs", "research", "catalog", "estonian-business-services.json");
  const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  const arr = Object.values(raw).find((v) => Array.isArray(v)) as ServiceRecord[] | undefined;
  cache = arr ?? [];
  return cache;
}
/** Only well-formed https URLs without embedded credentials are ever linked. */
export function safeHttps(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try { const u = new URL(v.trim()); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function searchServices(query: string, limit: number) {
  const q = query.trim().toLowerCase();
  const all = loadCatalog();
  const hits = q ? all.filter((r) => `${r.name} ${r.jobs ?? ""} ${r.sector ?? ""} ${r.interface_class ?? ""}`.toLowerCase().includes(q)) : all;
  return hits.slice(0, limit).map((r) => ({
    id: r.id, name: r.name, jobs: r.jobs ?? "", interface_class: r.interface_class ?? "",
    connection: r.connection ?? "",
    connection_url: safeHttps(r.connection),
    access_and_price: r.access_and_price ?? "",
    limitations: r.limitations ?? "", evidence_status: r.evidence_status ?? "",
    checked_on: r.checked_on ?? "",
    sources: (r.sources ?? []).map(safeHttps).filter((x): x is string => !!x).slice(0, 4),
    runtime_verified: false as const,
    note: "Research catalog entry, not runtime-verified by Launchpad. Connect it in your own assistant; Launchpad does not fetch or broker it.",
  }));
}
export const PLAYBOOKS = [
  { id: "deadlines-check", title: "Check this month's obligations", summary: "Read-only first win: list known responsibilities and check official sources for current dates. Launchpad does not compute or fabricate tax deadlines here.", source: "https://www.emta.ee/en/business-client/taxes-and-payment", source_label: "Estonian Tax and Customs Board (EMTA)" },
  { id: "annual-report-status", title: "Check annual report status", summary: "Confirm filing status in official registers and prepare a draft plan with your accountant. Nothing is submitted by this demo.", source: "https://www.rik.ee/en/e-business-register", source_label: "Centre of Registers and Information Systems (RIK)" },
  { id: "counterparty-check", title: "Check a company before taking the job", summary: "Look up public registry and tax-debt information before agreeing work. Public data does not prove mandate or creditworthiness.", source: "https://www.emta.ee/en/business-client/taxes-and-payment/payment-arrears/payment-tax-liabilities-instalments", source_label: "EMTA — tax liabilities" },
  { id: "vat-status-check", title: "Check VAT registration status", summary: "Verify VAT registration details against official guidance before invoicing. This demo gives no tax advice.", source: "https://www.riigiteataja.ee/en/akt/512062025002", source_label: "Value Added Tax Act (Riigi Teataja)" },
];
export const DOMAINS = ["money", "customers", "people", "legal_sector", "operations"] as const;
export const FRAMEWORK = {
  version: "assessment-framework/2",
  domains: DOMAINS,
  questions: [
    "What responsibilities matter here (applicable / not applicable / unresolved, core or non-core, with short reason and evidence references)? Use each responsibility id once; missing domains stay visibly unassessed.",
    "Who handles each one? To claim arrangement 'assistant_assessed' (agent judgment: handled), name the actual arrangement via executor, their access/connection, the success criterion and the next checkpoint. Without all four it does not count as handled. It is still not independent verification.",
    "Where is the leverage: which single next action removes the most owner work, and why first (R-001)?",
    "What remains uncertain, unsupported, or owner-only? Never silently drop unfinished work: omissions between revisions are shown to the owner as exclusions.",
    "Final assessment (yours, as the agent): short conclusion, scope, assumptions, gaps, estimated effort saved with honest uncertainty (mark whether it is an estimate or observed; leave it out rather than invent hours).",
  ],
  evidence_labels: ["assistant_reported", "owner_confirmed", "source_confirmed", "launchpad_produced"],
  rule: "The agent makes the final business assessment; no owner ratification is required. Assistant reports are claims, not externally verified outcomes: independently verified outcomes are counted separately (0 until a real verifier exists). Unknown/unresolved items and unassessed domains block any percentage and any unqualified 100% claim. Company labels you supply are shown as agent-supplied, never as a public-register verification or mandate.",
};
