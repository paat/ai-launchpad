/** Assistant plan facts as of 1 Nov 2026, and the rule that picks one.
 * Costs and reasons are read off these rows. Nothing is converted or filled in.
 * Unknown stays null. A null connector count is not eligible, and a null phone
 * or training flag is not claimed. A plan we have not run is recommended only
 * when it is the customer's current plan, or when it is the same assistant as
 * a plan we have already run. When no plan is allowed, recommended is null.
 * Only an assistant with an AI Launchpad connect path may be kept or recommended. */
import type { ServiceRecord } from "./catalog.js";

export const CHECKED = "2026-11-01" as const;

export interface SourceRef { n: number; url: string; }
export interface PlanPrice {
  amount: number;
  currency: "USD" | "EUR";
  tax: "excluded" | "unknown";
  per: "month" | "seat_month";
  /** Null when the page does not publish a minimum. The cost then uses 1 seat. */
  min_seats: number | null;
  /** Set when the published figure is an annual commitment. */
  billed?: "yearly";
  /** A plan the customer must already hold. Shown with the price. */
  requires_plan?: string;
}
export interface PlanRow {
  assistant: string;
  plan: string;
  price: PlanPrice | null;
  /** 0 and null cannot run AI Launchpad. "no_cap" means the page states no count. */
  custom_connectors: number | "no_cap" | null;
  write_tools: boolean | null;
  admin_needed: boolean;
  phone: boolean | null;
  builtin_google: string[];
  builtin_microsoft: string[];
  trains_by_default: boolean | null;
  /** ISO date we ran AI Launchpad on this plan, or null. */
  launchpad_tested: string | null;
  sources: SourceRef[];
  checked: typeof CHECKED;
}
export type EmailSuite = "google" | "microsoft" | "both" | "other" | "unknown";
export interface Customer {
  current?: { assistant: string; plan: string };
  customConnectorsNeeded: number;
  emailSuite: EmailSuite;
  /** 1 unless the company size is known. */
  seats: number;
  /** Extra own-connection names. Used only in the reason sentence. */
  connectionNames?: string[];
}
export interface Reason { text_et: string; text_en: string; sources: number[]; }
export interface Recommendation {
  keep?: PlanRow;
  recommended: PlanRow | null;
  start?: PlanRow;
  stayAlternative?: PlanRow;
  paidNote: boolean;
  reasons: Reason[];
}
export interface WhyRow {
  assistant: string;
  plan: string;
  planLabel: string;
  cost: string;
  taxNote: string;
  connections: string;
  phone: string;
  tested: string;
  checked: string;
  sources: number[];
}

export const SOURCES: SourceRef[] = [
  { n: 1, url: "https://claude.com/pricing" },
  { n: 2, url: "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" },
  { n: 3, url: "https://support.claude.com/en/articles/10166901-use-google-workspace-connectors" },
  { n: 4, url: "https://support.claude.com/en/articles/15183774-connect-to-microsoft-365" },
  { n: 5, url: "https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training" },
  { n: 6, url: "https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training" },
  { n: 7, url: "https://support.claude.com/en/articles/10769299-how-to-use-claude-in-your-preferred-language" },
  { n: 8, url: "https://support.claude.com/en/articles/8461763-where-can-i-access-claude" },
  { n: 9, url: "https://chatgpt.com/et-EE/pricing/" },
  { n: 10, url: "https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta" },
  { n: 11, url: "https://help.openai.com/en/articles/8792828-what-is-chatgpt-business" },
  { n: 12, url: "https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance" },
  { n: 13, url: "https://help.openai.com/en/articles/8357869-how-to-change-your-language-setting-in-chatgpt" },
  { n: 14, url: "https://help.openai.com/et-ee/articles/7947663-chatgpt-supported-countries" },
  { n: 15, url: "https://help.openai.com/et-ee/articles/11989085-what-is-chatgpt-go" },
  { n: 16, url: "https://openai.com/business/pricing/" },
  { n: 17, url: "https://gemini.google/ee/subscriptions/?hl=et" },
  { n: 18, url: "https://support.google.com/gemini/answer/17209137" },
  { n: 19, url: "https://support.google.com/gemini/answer/13575153" },
  { n: 20, url: "https://support.google.com/gemini/answer/13594961" },
  { n: 21, url: "https://workspace.google.com/intl/fi/" },
  { n: 22, url: "https://www.microsoft.com/et-ee/microsoft-365/business/with-copilot-plans-and-pricing" },
  { n: 23, url: "https://support.microsoft.com/en-us/microsoft-365-copilot/about-microsoft-copilot-pro" },
  { n: 24, url: "https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/set-up-custom-federated-connectors" },
  { n: 25, url: "https://about.fb.com/news/2025/04/making-ai-work-harder-for-europeans/" },
  { n: 26, url: "https://about.fb.com/news/2025/03/europe-meet-your-newest-assistant-meta-ai/" },
  { n: 27, url: "https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt" },
  { n: 28, url: "https://openai.com/index/introducing-chatgpt-go/" },
  { n: 29, url: "https://x.ai/pricing" },
  { n: 30, url: "https://docs.x.ai/x-subscription/pricing" },
  { n: 31, url: "https://docs.x.ai/grok/connectors" },
  { n: 32, url: "https://x.ai/news/grok-connectors" },
  { n: 33, url: "https://x.ai/news/x-subscription" },
  { n: 34, url: "https://x.ai/legal/privacy-policy" },
  { n: 35, url: "https://x.ai/legal/faq" },
  { n: 36, url: "https://x.ai/legal/europe-privacy-policy-addendum" },
  { n: 37, url: "https://x.ai/legal/europe-privacy-policy-addendum" },
  { n: 38, url: "https://x.ai/legal/faq-enterprise" },
  { n: 39, url: "https://help.x.com/en/using-x/x-premium" },
  { n: 40, url: "https://x.ai/grok/business" },
  { n: 41, url: "https://docs.x.ai/grok/connector-management" },
  { n: 42, url: "https://play.google.com/store/apps/details?id=ai.x.grok&hl=et&gl=EE" },
  { n: 43, url: "https://x.ai/news/grok-build-mode" },
  { n: 44, url: "https://docs.x.ai/grok-bot/security" },
  { n: 45, url: "https://x.ai/grok" },
];

const byN = new Map(SOURCES.map((s) => [s.n, s]));
const src = (...ns: number[]): SourceRef[] => ns.map((n) => byN.get(n)!);

const usd = (amount: number, per: PlanPrice["per"] = "month", min_seats: number | null = 1): PlanPrice =>
  ({ amount, currency: "USD", tax: "excluded", per, min_seats });
const eur = (amount: number, tax: PlanPrice["tax"], per: PlanPrice["per"] = "month", min_seats: number | null = 1): PlanPrice =>
  ({ amount, currency: "EUR", tax, per, min_seats });

const CLAUDE_GOOGLE = ["Gmail", "Google Calendar", "Google Drive"];
const CLAUDE_MICROSOFT = ["Outlook", "SharePoint", "OneDrive", "Teams"];
const GROK_GOOGLE = ["Gmail", "Calendar", "Drive"];
const GROK_MICROSOFT = ["Outlook", "OneDrive", "Teams", "SharePoint"];
const checked = CHECKED;

/** Rows for the 1 Nov 2026 fact sheet. Unknown stays null. Legacy SuperGrok, Heavy, and X plans stay in the memo only. */
export const PLANS: PlanRow[] = [
  { assistant: "claude", plan: "free", price: usd(0), custom_connectors: 1, write_tools: true, admin_needed: false, phone: true, builtin_google: CLAUDE_GOOGLE, builtin_microsoft: CLAUDE_MICROSOFT, trains_by_default: null, launchpad_tested: "2026-10-30", sources: src(1, 2, 3, 4, 5), checked },
  { assistant: "claude", plan: "pro", price: usd(20), custom_connectors: "no_cap", write_tools: true, admin_needed: false, phone: true, builtin_google: CLAUDE_GOOGLE, builtin_microsoft: CLAUDE_MICROSOFT, trains_by_default: null, launchpad_tested: null, sources: src(1, 2, 3, 4, 5), checked },
  { assistant: "claude", plan: "max", price: usd(100), custom_connectors: "no_cap", write_tools: true, admin_needed: false, phone: true, builtin_google: CLAUDE_GOOGLE, builtin_microsoft: CLAUDE_MICROSOFT, trains_by_default: null, launchpad_tested: null, sources: src(1, 2, 3, 4, 5), checked },
  { assistant: "claude", plan: "team", price: usd(25, "seat_month", 2), custom_connectors: "no_cap", write_tools: true, admin_needed: true, phone: true, builtin_google: CLAUDE_GOOGLE, builtin_microsoft: CLAUDE_MICROSOFT, trains_by_default: false, launchpad_tested: null, sources: src(1, 2, 3, 4, 6), checked },
  { assistant: "chatgpt", plan: "free", price: usd(0), custom_connectors: 0, write_tools: false, admin_needed: false, phone: false, builtin_google: [], builtin_microsoft: [], trains_by_default: true, launchpad_tested: null, sources: src(9, 10, 12, 27), checked },
  { assistant: "chatgpt", plan: "go", price: usd(8), custom_connectors: 0, write_tools: false, admin_needed: false, phone: false, builtin_google: [], builtin_microsoft: [], trains_by_default: true, launchpad_tested: null, sources: src(9, 10, 15, 27, 28), checked },
  { assistant: "chatgpt", plan: "plus", price: usd(20), custom_connectors: null, write_tools: false, admin_needed: false, phone: false, builtin_google: [], builtin_microsoft: [], trains_by_default: true, launchpad_tested: null, sources: src(9, 10, 12, 27, 28), checked },
  { assistant: "chatgpt", plan: "pro", price: null, custom_connectors: "no_cap", write_tools: false, admin_needed: false, phone: false, builtin_google: ["Google Drive"], builtin_microsoft: [], trains_by_default: true, launchpad_tested: null, sources: src(9, 10, 12, 27, 28), checked },
  { assistant: "chatgpt", plan: "business", price: usd(25, "seat_month", 2), custom_connectors: "no_cap", write_tools: true, admin_needed: true, phone: false, builtin_google: ["Google Workspace"], builtin_microsoft: ["Microsoft 365"], trains_by_default: false, launchpad_tested: null, sources: src(10, 11, 12, 16), checked },
  { assistant: "gemini", plan: "free", price: eur(0, "unknown"), custom_connectors: 0, write_tools: false, admin_needed: false, phone: false, builtin_google: [], builtin_microsoft: [], trains_by_default: null, launchpad_tested: null, sources: src(17, 18, 20), checked },
  { assistant: "gemini", plan: "ai_pro", price: eur(21.99, "unknown"), custom_connectors: 0, write_tools: false, admin_needed: false, phone: false, builtin_google: ["Gmail", "Docs", "Vids"], builtin_microsoft: [], trains_by_default: null, launchpad_tested: null, sources: src(17, 18, 20), checked },
  { assistant: "google", plan: "workspace", price: eur(16.2, "unknown", "seat_month"), custom_connectors: null, write_tools: null, admin_needed: false, phone: null, builtin_google: ["Gmail", "Docs", "Meet"], builtin_microsoft: [], trains_by_default: null, launchpad_tested: null, sources: src(18, 21), checked },
  { assistant: "copilot", plan: "free", price: eur(0, "unknown"), custom_connectors: 0, write_tools: false, admin_needed: false, phone: null, builtin_google: [], builtin_microsoft: [], trains_by_default: null, launchpad_tested: null, sources: src(23), checked },
  { assistant: "copilot", plan: "m365_business", price: { ...eur(18.2, "excluded", "seat_month"), billed: "yearly", requires_plan: "Microsoft 365" }, custom_connectors: "no_cap", write_tools: true, admin_needed: true, phone: null, builtin_google: [], builtin_microsoft: ["Word", "Excel", "PowerPoint", "Outlook", "Teams"], trains_by_default: null, launchpad_tested: null, sources: src(22, 24), checked },
  { assistant: "copilot", plan: "pro", price: null, custom_connectors: null, write_tools: null, admin_needed: false, phone: null, builtin_google: [], builtin_microsoft: [], trains_by_default: null, launchpad_tested: null, sources: src(23), checked },
  { assistant: "meta", plan: "free", price: eur(0, "unknown"), custom_connectors: 0, write_tools: false, admin_needed: false, phone: null, builtin_google: [], builtin_microsoft: [], trains_by_default: true, launchpad_tested: null, sources: src(25, 26), checked },
  { assistant: "grok", plan: "free", price: usd(0), custom_connectors: "no_cap", write_tools: null, admin_needed: false, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: true, launchpad_tested: null, sources: src(29, 31, 32, 35, 36, 37), checked },
  { assistant: "grok", plan: "plus", price: usd(8), custom_connectors: "no_cap", write_tools: null, admin_needed: false, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: true, launchpad_tested: null, sources: src(29, 30, 31, 32, 35, 36, 37), checked },
  { assistant: "grok", plan: "premium", price: usd(30), custom_connectors: "no_cap", write_tools: true, admin_needed: false, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: true, launchpad_tested: "2026-11-01", sources: src(29, 30, 31, 32, 35, 36, 37, 44), checked },
  { assistant: "grok", plan: "super", price: usd(100), custom_connectors: "no_cap", write_tools: true, admin_needed: false, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: true, launchpad_tested: null, sources: src(29, 30, 31, 32, 35, 36, 37, 44), checked },
  { assistant: "grok", plan: "ultra", price: usd(200), custom_connectors: "no_cap", write_tools: true, admin_needed: false, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: true, launchpad_tested: null, sources: src(29, 30, 31, 32, 35, 36, 37, 44), checked },
  { assistant: "grok", plan: "teams", price: usd(30, "seat_month", null), custom_connectors: "no_cap", write_tools: null, admin_needed: true, phone: true, builtin_google: GROK_GOOGLE, builtin_microsoft: GROK_MICROSOFT, trains_by_default: false, launchpad_tested: null, sources: src(29, 31, 32, 38, 40, 41), checked },
];

const TABLE_NAME: Record<string, string> = {
  "claude/free": "Claude Free",
  "claude/pro": "Claude Pro",
  "claude/max": "Claude Max",
  "claude/team": "Claude Team",
  "chatgpt/free": "ChatGPT Free",
  "chatgpt/go": "ChatGPT Go",
  "chatgpt/plus": "ChatGPT Plus",
  "chatgpt/pro": "ChatGPT Pro",
  "chatgpt/business": "ChatGPT Business",
  "gemini/free": "Gemini",
  "gemini/ai_pro": "Google AI Pro",
  "google/workspace": "Google Workspace Business Standard",
  "copilot/free": "Microsoft Copilot",
  "copilot/m365_business": "Microsoft 365 Copilot Business",
  "copilot/pro": "Copilot Pro",
  "meta/free": "Meta AI",
  "grok/free": "Grok Free",
  "grok/plus": "Grok Plus",
  "grok/premium": "Grok Premium",
  "grok/super": "Grok Super",
  "grok/ultra": "Grok Ultra",
  "grok/teams": "Grok Teams",
};

const keyOf = (row: { assistant: string; plan: string }) => `${row.assistant}/${row.plan}`;
export const planLabel = (row: { assistant: string; plan: string }): string => TABLE_NAME[keyOf(row)] ?? keyOf(row);

const samePlan = (row: PlanRow, current: Customer["current"]) =>
  !!current && row.assistant === current.assistant && row.plan === current.plan;

const sourceNums = (row: PlanRow): number[] => [...new Set(row.sources.map((s) => s.n))].sort((a, b) => a - b);

/** Company cost for one month. Null when the page published no price.
 * An unknown minimum (null) is charged as one seat and is not claimed as a minimum. */
export function monthlyCost(row: PlanRow, seats: number): number | null {
  if (!row.price) return null;
  return row.price.amount * Math.max(seats, row.price.min_seats ?? 1);
}

export function rowFits(row: PlanRow, customer: Customer): boolean {
  return eligible(row) && slotsOk(row, customer.customConnectorsNeeded) && coversEmail(row, customer.emailSuite);
}

/** Ids `/uhenda` opens. Only these assistants may be kept or recommended. */
export const LAUNCHPAD_CONNECT_ASSISTANTS = ["claude", "chatgpt", "grok"] as const;

/** A published 0 cannot connect. Null is unknown, so the rule does not treat it as eligible.
 * An assistant without a connect path is not eligible, so it is never kept or recommended. */
function eligible(row: PlanRow): boolean {
  if (!(LAUNCHPAD_CONNECT_ASSISTANTS as readonly string[]).includes(row.assistant)) return false;
  if (row.custom_connectors === 0 || row.custom_connectors === null) return false;
  return row.write_tools === true;
}

function slotsOk(row: PlanRow, needed: number): boolean {
  if (row.custom_connectors === "no_cap") return true;
  return typeof row.custom_connectors === "number" && row.custom_connectors >= needed;
}

function coversEmail(row: PlanRow, suite: EmailSuite): boolean {
  if (suite === "other" || suite === "unknown") return true;
  if (suite === "google") return row.builtin_google.length > 0;
  if (suite === "microsoft") return row.builtin_microsoft.length > 0;
  return row.builtin_google.length > 0 && row.builtin_microsoft.length > 0;
}

function testedAssistants(sheet: readonly PlanRow[]): Set<string> {
  return new Set(sheet.filter((r) => r.launchpad_tested).map((r) => r.assistant));
}

function canRecommend(row: PlanRow, customer: Customer, sheet: readonly PlanRow[]): boolean {
  if (!rowFits(row, customer)) return false;
  if (row.launchpad_tested) return true;
  if (samePlan(row, customer.current)) return true;
  return testedAssistants(sheet).has(row.assistant);
}

function cheapest(rows: PlanRow[], seats: number): PlanRow | undefined {
  if (!rows.length) return undefined;
  const priced = rows.filter((r) => r.price);
  if (!priced.length) return rows[0];
  const currencies = [...new Set(priced.map((r) => r.price!.currency))];
  let group = priced;
  if (currencies.length > 1) {
    const firstTested = priced.find((r) => r.launchpad_tested);
    const currency = firstTested?.price?.currency ?? priced[0]!.price!.currency;
    group = priced.filter((r) => r.price!.currency === currency);
  }
  return group.reduce((best, row) => (monthlyCost(row, seats)! < monthlyCost(best, seats)! ? row : best));
}

function runsLaunchpadAlone(row: PlanRow): boolean {
  return eligible(row) && !!row.price && row.price.amount === 0 && slotsOk(row, 1);
}

function costsMoney(row: PlanRow): boolean {
  return !!row.price && row.price.amount > 0;
}

export function recommendAssistant(customer: Customer, sheet: readonly PlanRow[] = PLANS): Recommendation {
  const rows = [...sheet];
  const current = customer.current ? rows.find((r) => samePlan(r, customer.current)) : undefined;
  const keep = current && rowFits(current, customer) ? current : undefined;
  const fitting = rows.filter((r) => rowFits(r, customer));
  const recommendable = rows.filter((r) => canRecommend(r, customer, rows));
  const recommended = keep ?? cheapest(recommendable, customer.seats) ?? null;
  const start = recommended && costsMoney(recommended) ? rows.find(runsLaunchpadAlone) : undefined;
  let stayAlternative: PlanRow | undefined;
  if (customer.current && recommended && recommended.assistant !== customer.current.assistant) {
    const alt = cheapest(fitting.filter((r) => r.assistant === customer.current!.assistant), customer.seats);
    if (alt && keyOf(alt) !== keyOf(recommended)) stayAlternative = alt;
  }
  const result: Recommendation = {
    ...(keep ? { keep } : {}),
    recommended,
    ...(start ? { start } : {}),
    ...(stayAlternative ? { stayAlternative } : {}),
    paidNote: !!recommended && costsMoney(recommended) && !samePlan(recommended, customer.current),
    reasons: [],
  };
  result.reasons = buildReasons(customer, result, rows);
  return result;
}

export function candidateRows(rec: Recommendation): PlanRow[] {
  const out: PlanRow[] = [];
  const seen = new Set<string>();
  for (const row of [rec.keep, rec.recommended, rec.start, rec.stayAlternative]) {
    if (!row || seen.has(keyOf(row))) continue;
    seen.add(keyOf(row));
    out.push(row);
  }
  return out;
}

function formatAmount(amount: number, lang: "et" | "en"): string {
  if (Number.isInteger(amount)) return String(amount);
  const s = amount.toFixed(2);
  return lang === "et" ? s.replace(".", ",") : s;
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])}.${m[2]}.${m[1]}` : iso;
}

function currencyWord(currency: PlanPrice["currency"], lang: "et" | "en"): string {
  if (currency === "USD") return lang === "et" ? "dollarit" : "US dollars";
  return lang === "et" ? "eurot" : "euros";
}

function joinList(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}${and}${items[1]}`;
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

function sentenceName(row: PlanRow, lang: "et" | "en"): string {
  if (row.assistant === "claude" && row.plan === "free") return lang === "et" ? "Claude'i tasuta pakett" : "Claude's free plan";
  return planLabel(row);
}

function conditionSuffix(p: PlanPrice, lang: "et" | "en"): string {
  const bits: string[] = [];
  if (p.billed === "yearly") bits.push(lang === "et" ? "tasutakse kord aastas" : "billed yearly");
  if (p.requires_plan) {
    bits.push(lang === "et"
      ? `vajab sobivat ${p.requires_plan} paketti`
      : `requires an eligible ${p.requires_plan} plan`);
  }
  return bits.length ? `, ${bits.join(", ")}` : "";
}

function priceText(row: PlanRow, seats: number, lang: "et" | "en"): string | null {
  const p = row.price;
  if (!p) return null;
  const name = sentenceName(row, lang);
  const amt = formatAmount(p.amount, lang);
  const cur = currencyWord(p.currency, lang);
  const unit = p.per === "seat_month"
    ? (lang === "et" ? "kasutaja kohta kuus" : "per user a month")
    : (lang === "et" ? "kuus" : "a month");
  const total = monthlyCost(row, seats)!;
  const totalAmount = `${formatAmount(total, lang)} ${cur}`;
  // Below the published minimum, the total is the plan's floor, not this visitor's seat count.
  const belowMin = p.min_seats != null && seats < p.min_seats;
  const min = p.min_seats != null && p.min_seats > 1
    ? belowMin
      ? (lang === "et"
        ? `, vähemalt ${p.min_seats} kasutajat — kokku vähemalt ${totalAmount} kuus`
        : `, at least ${p.min_seats} users — at least ${totalAmount} a month in total`)
      : (lang === "et" ? `, vähemalt ${p.min_seats} kasutajat` : `, at least ${p.min_seats} users`)
    : "";
  const tax = p.tax === "excluded"
    ? (lang === "et" ? "maksud ei ole hinna sees" : "tax is not included")
    : (lang === "et" ? "lehel ei ole öeldud, kas maks on hinna sees" : "the page does not say whether tax is included");
  const extra = total !== p.amount && !belowMin
    ? (lang === "et"
      ? ` ${seats} kasutajaga on see ${totalAmount} kuus.`
      : ` For ${seats} ${seats === 1 ? "user" : "users"} that is ${totalAmount} a month.`)
    : "";
  const checkedOn = lang === "et" ? `Kontrollitud ${fmtDate(row.checked)}.` : `Checked ${fmtDate(row.checked)}.`;
  const verb = lang === "et" ? "maksab" : "costs";
  return `${name} ${verb} ${amt} ${cur} ${unit}${min}${conditionSuffix(p, lang)}, ${tax}. ${checkedOn}${extra}`;
}

function factText(row: PlanRow, lang: "et" | "en"): string {
  const name = sentenceName(row, lang);
  const bits: string[] = [];
  // Null phone is unknown, so the sentence claims neither a phone app nor web only.
  if (row.phone === true) bits.push(lang === "et" ? `${name} töötab ka telefonis.` : `${name} works on the phone too.`);
  if (row.phone === false) bits.push(lang === "et" ? `${name} töötab ainult veebis.` : `${name} works on the web only.`);
  if (row.admin_needed) bits.push(lang === "et" ? "Oma ühenduse lisab haldur." : "An admin has to add your own connection.");
  if (row.launchpad_tested) {
    const d = fmtDate(row.launchpad_tested);
    bits.push(lang === "et" ? `Oleme seda AI-hüppelauaga proovinud ${d}.` : `We tried it with AI Launchpad on ${d}.`);
  } else {
    bits.push(lang === "et" ? "Meie ei ole seda paketti AI-hüppelauaga proovinud." : "We have not tried this plan with AI Launchpad.");
  }
  return bits.join(" ");
}

const BRAND: Record<string, string> = {
  claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", google: "Google",
  copilot: "Copilot", meta: "Meta AI", grok: "Grok",
};

/** The visitor's assistant has no `/uhenda` steps, so the recommendation comes from one that does. */
function noSetupSteps(customer: Customer): Reason | null {
  const id = customer.current?.assistant;
  if (!id || (LAUNCHPAD_CONNECT_ASSISTANTS as readonly string[]).includes(id)) return null;
  const name = BRAND[id] ?? id;
  return {
    text_et: `AI-hüppelaual pole veel ${name}-i jaoks seadistamise samme.`,
    text_en: `AI Launchpad has no setup steps for ${name} yet.`,
    sources: [],
  };
}

function ownConnectionPhrase(n: PlanRow["custom_connectors"], lang: "et" | "en"): string {
  if (n === 1) return lang === "et" ? "üks oma ühendus" : "one own connection";
  if (typeof n === "number") return lang === "et" ? `${n} oma ühendust` : `${n} own connections`;
  if (n === "no_cap") return lang === "et" ? "piirangut pole avaldatud" : "no published limit";
  return lang === "et" ? "teadmata" : "unknown";
}

/** Where a free start row is named. Claude Free keeps the sentence it already had. */
function aloneOn(row: PlanRow): { et: string; en: string } {
  if (row.assistant === "claude" && row.plan === "free") return { et: "Claude'i tasuta paketis", en: "Claude's free plan" };
  const label = planLabel(row);
  return { et: `${label} paketis`, en: label };
}

/** Untested plan allowed only because this assistant was already tried on another row. */
function siblingTrial(recommended: PlanRow, customer: Customer, sheet: readonly PlanRow[]): Reason | null {
  if (recommended.launchpad_tested || samePlan(recommended, customer.current)) return null;
  const tested = sheet.find((r) => r.assistant === recommended.assistant && r.launchpad_tested);
  if (!tested?.launchpad_tested) return null;
  const date = fmtDate(tested.launchpad_tested);
  const brand = BRAND[recommended.assistant] ?? recommended.assistant;
  const label = planLabel(recommended);
  const triedEt = tested.plan === "free" ? "tasuta paketiga" : `${planLabel(tested)} paketiga`;
  const triedEn = tested.plan === "free" ? "the free plan" : planLabel(tested);
  return {
    text_et: `${label} on sama ${brand}, mida proovisime ${triedEt} (${date}).`,
    text_en: `${label} is the same ${brand} we tried on ${triedEn} (${date}).`,
    sources: sourceNums(tested),
  };
}

function buildReasons(customer: Customer, rec: Recommendation, sheet: readonly PlanRow[]): Reason[] {
  const recommended = rec.recommended;
  if (!recommended) {
    return [{
      text_et: "Ühtegi sobivat paketti ei leitud — vaata tabelit",
      text_en: "No plan fits — see the table",
      sources: [],
    }];
  }
  const reasons: Reason[] = [];
  const missing = noSetupSteps(customer);
  if (missing) reasons.push(missing);
  const free = sheet.find((r) => r.assistant === "claude" && r.plan === "free");
  if (!rec.keep && free && typeof free.custom_connectors === "number" && customer.customConnectorsNeeded > free.custom_connectors) {
    const names = customer.connectionNames ?? [];
    const paren = (lang: "et" | "en") => {
      if (!names.length) return "";
      const all = lang === "et" ? ["AI-hüppelaud", ...names] : ["AI Launchpad", ...names];
      return ` (${joinList(all, lang === "et" ? " ja " : " and ")})`;
    };
    const slots = free.custom_connectors === 1
      ? { et: "üks oma ühendus", en: "one own connection" }
      : { et: `${free.custom_connectors} oma ühendust`, en: `${free.custom_connectors} own connections` };
    reasons.push({
      text_et: `Claude'i tasuta paketis on ${slots.et}; sul on vaja ${customer.customConnectorsNeeded}${paren("et")}.`,
      text_en: `Claude's free plan has ${slots.en}; you need ${customer.customConnectorsNeeded}${paren("en")}.`,
      sources: sourceNums(free),
    });
  } else if (rec.keep) {
    const c = rec.keep.custom_connectors;
    const slots = c === "no_cap"
      ? { et: "Oma ühendustel piirangut pole avaldatud.", en: "There is no published limit on own connections." }
      : typeof c === "number"
        ? { et: `Oma ühendusi on ${c}.`, en: `It has ${c} own ${c === 1 ? "connection" : "connections"}.` }
        : { et: "Oma ühenduste arv on teadmata.", en: "The number of own connections is unknown." };
    const name = sentenceName(rec.keep, "et");
    const nameEn = sentenceName(rec.keep, "en");
    reasons.push({
      text_et: `Sinu praegune pakett on ${name}. ${slots.et} Sul on vaja ${customer.customConnectorsNeeded}.`,
      text_en: `Your current plan is ${nameEn}. ${slots.en} You need ${customer.customConnectorsNeeded}.`,
      sources: sourceNums(rec.keep),
    });
  }
  if (customer.emailSuite === "google" || customer.emailSuite === "microsoft" || customer.emailSuite === "both") {
    const g = recommended.builtin_google;
    const m = recommended.builtin_microsoft;
    const names = customer.emailSuite === "google" ? g : customer.emailSuite === "microsoft" ? m : [...g, ...m];
    if (names.length) {
      const name = sentenceName(recommended, "et");
      const nameEn = sentenceName(recommended, "en");
      reasons.push({
        text_et: `${name} sisaldab: ${joinList(names, " ja ")}.`,
        text_en: `${nameEn} includes: ${joinList(names, " and ")}.`,
        sources: sourceNums(recommended),
      });
    }
  }
  const price = priceText(recommended, customer.seats, "et");
  const priceEn = priceText(recommended, customer.seats, "en");
  if (price && priceEn) reasons.push({ text_et: price, text_en: priceEn, sources: sourceNums(recommended) });
  reasons.push({
    text_et: factText(recommended, "et"),
    text_en: factText(recommended, "en"),
    sources: sourceNums(recommended),
  });
  const sibling = siblingTrial(recommended, customer, sheet);
  if (sibling) reasons.push(sibling);
  if (rec.start && keyOf(rec.start) !== keyOf(recommended)) {
    const place = aloneOn(rec.start);
    const slots = ownConnectionPhrase(rec.start.custom_connectors, "et");
    const slotsEn = ownConnectionPhrase(rec.start.custom_connectors, "en");
    const phone = rec.start.phone === true ? ", töötab ka telefonis" : "";
    const phoneEn = rec.start.phone === true ? ", works on the phone too" : "";
    const tried = rec.start.launchpad_tested ? fmtDate(rec.start.launchpad_tested) : "";
    reasons.push({
      text_et: `AI-hüppelaua üksi saad käivitada ${place.et}: ${slots}${phone}${tried ? `, proovitud ${tried}` : ""}.`,
      text_en: `You can run AI Launchpad alone on ${place.en}: ${slotsEn}${phoneEn}${tried ? `, tried ${tried}` : ""}.`,
      sources: sourceNums(rec.start),
    });
  }
  if (rec.stayAlternative) {
    const bits = [priceText(rec.stayAlternative, customer.seats, "et"), factText(rec.stayAlternative, "et")].filter((s): s is string => !!s);
    const bitsEn = [priceText(rec.stayAlternative, customer.seats, "en"), factText(rec.stayAlternative, "en")].filter((s): s is string => !!s);
    reasons.push({ text_et: bits.join(" "), text_en: bitsEn.join(" "), sources: sourceNums(rec.stayAlternative) });
  }
  return reasons;
}

export function whyRows(rows: readonly PlanRow[], lang: "et" | "en"): WhyRow[] {
  return rows.map((row) => {
    const p = row.price;
    const minSeats = !p || p.min_seats == null
      ? (p ? (lang === "et" ? ", minimaalne kasutajate arv on teadmata" : ", min seats unknown") : "")
      : p.min_seats > 1 ? (lang === "et" ? `, vähemalt ${p.min_seats}` : `, at least ${p.min_seats}`) : "";
    const cost = !p ? (lang === "et" ? "hinda ei ole avaldatud" : "no published price")
      : `${formatAmount(p.amount, lang)} ${p.currency} ${p.per === "seat_month"
        ? (lang === "et" ? "kasutaja kohta kuus" : "per user a month")
        : (lang === "et" ? "kuus" : "a month")}${minSeats}${conditionSuffix(p, lang)}`;
    const taxNote = !p ? (lang === "et" ? "teadmata" : "unknown")
      : p.tax === "excluded"
        ? (lang === "et" ? "maksud ei ole hinna sees" : "tax is not included")
        : (lang === "et" ? "lehel ei ole öeldud, kas maks on hinna sees" : "the page does not say whether tax is included");
    const connections = row.custom_connectors === null ? (lang === "et" ? "teadmata" : "unknown")
      : row.custom_connectors === "no_cap" ? (lang === "et" ? "piirangut pole avaldatud" : "no published limit")
      : String(row.custom_connectors);
    const phone = row.phone === null ? (lang === "et" ? "teadmata" : "unknown") : row.phone ? (lang === "et" ? "jah" : "yes") : (lang === "et" ? "ei" : "no");
    const tested = row.launchpad_tested ? fmtDate(row.launchpad_tested) : (lang === "et" ? "ei" : "no");
    return {
      assistant: row.assistant, plan: row.plan, planLabel: planLabel(row),
      cost, taxNote, connections, phone, tested, checked: row.checked, sources: sourceNums(row),
    };
  });
}

function isBuiltinEmail(rec: ServiceRecord): boolean {
  const blob = `${rec.id} ${rec.name} ${rec.sector ?? ""}`.toLowerCase();
  if (!/email|gmail|outlook|mail/.test(blob)) return false;
  return /gmail|google workspace|outlook|microsoft 365|microsoft-graph-mail|workiq/.test(blob);
}

function needsAccountingHost(rec: ServiceRecord): boolean {
  if (rec.interface_class === "hosted_mcp") return false;
  if (/palk/i.test(rec.id)) return false;
  return /merit|e-arveldaja|earveldaja|e-financials|erply/.test(`${rec.id} ${rec.name}`.toLowerCase());
}

function shortName(rec: ServiceRecord): string {
  const blob = `${rec.id} ${rec.name}`;
  if (/merit/i.test(blob)) return "Merit";
  if (/e-arveldaja|earveldaja|e-financials/i.test(blob)) return "e-arveldaja";
  if (/erply/i.test(blob)) return "Erply";
  if (/^lhv/i.test(rec.name) || rec.id.startsWith("lhv")) return "LHV";
  if (/pipedrive/i.test(blob)) return "Pipedrive";
  if (/werkzeug/i.test(blob)) return "Werkzeug";
  return rec.name.replace(/ MCP.*/, "").trim();
}

/** 1 for AI Launchpad, plus each matched hosted connection. E-mail that the plan's built-in list covers does not take a slot. Merit, e-arveldaja and Erply share one hosted connection. */
export function customerFromServices(services: readonly ServiceRecord[], current?: Customer["current"], seats = 1): Customer {
  const hosted = services.filter((s) => s.interface_class === "hosted_mcp" && !isBuiltinEmail(s));
  const hostedAccounting = hosted.some((s) => /werkzeug|merit|erply|arveldaja|financials/i.test(`${s.id} ${s.name}`));
  const accounting = hostedAccounting ? [] : services.filter(needsAccountingHost);
  const names = [...hosted.map(shortName), ...(accounting.length ? [joinList([...new Set(accounting.map(shortName))], " ja ")] : [])];
  return {
    ...(current ? { current } : {}),
    customConnectorsNeeded: 1 + names.length,
    emailSuite: emailSuiteFrom(services),
    seats,
    ...(names.length ? { connectionNames: names } : {}),
  };
}

function emailSuiteFrom(services: readonly ServiceRecord[]): EmailSuite {
  let google = false;
  let microsoft = false;
  let other = false;
  for (const rec of services) {
    const blob = `${rec.id} ${rec.name} ${rec.sector ?? ""}`.toLowerCase();
    if (!/email|gmail|outlook|mailbox/.test(blob) || /google-calendar/.test(rec.id)) continue;
    if (/gmail|google workspace|google-gmail/.test(blob)) google = true;
    else if (/outlook|microsoft 365|microsoft-graph-mail|workiq/.test(blob)) microsoft = true;
    else other = true;
  }
  if (google && microsoft) return "both";
  if (google) return "google";
  if (microsoft) return "microsoft";
  if (other) return "other";
  return "unknown";
}
