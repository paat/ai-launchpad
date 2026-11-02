/** Onboarding intake for a future /alusta page. Rules pick the assistant, the steps
 * and the prompt. A model may only name programs the owner already wrote, or
 * write a short bottom line from facts the rules already computed. Nothing
 * here is stored: the rate limit is an in-memory map, and the ledger the
 * caller passes in is the existing model-quality ledger. */
import { createHash, randomBytes } from "node:crypto";
import {
  offerDownload,
  type AssistantId, type Business, type Tier, type Uses,
} from "./assistant-choice.js";
import {
  PLANS, candidateRows, customerFromServices, recommendAssistant, whyRows,
  type PlanRow, type Recommendation, type WhyRow,
} from "./assistant-plans.js";
import { loadCatalog, safeHttps, type ServiceRecord } from "./catalog.js";
import {
  MAX_INPUT_BYTES, MAX_INPUT_CHARS, ModelQualityError, runModelQualityAttempt,
  type FetchFn, type ModelQualityLedger,
} from "./model-quality.js";
import type { ModelJob } from "./model.js";

const KINDS = ["accounting", "bank", "email", "customers", "other"] as const;
export type ProductKind = (typeof KINDS)[number];
export interface ExtractedProduct { name: string; kind: ProductKind; }

const GENERIC = new Set([
  "mcp", "api", "and", "the", "for", "with", "connection", "open", "banking",
  "mail", "books", "google", "estonia", "estonian", "official", "hosted",
  "protocol", "protocols", "workspace", "service", "services", "business",
  "connector", "connectors", "server", "servers", "unofficial", "cli", "skill",
  "agent", "plugin", "kit", "from", "into", "your", "com", "www",
]);

const norm = (s: string) => s.normalize("NFKC").toLocaleLowerCase("et").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** A needle matches on a letter boundary and may carry a short Estonian ending. */
function occurs(hay: string, needle: string): number {
  if (needle.length < 3) return -1;
  let from = 0;
  while (from <= hay.length - needle.length) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return -1;
    const before = i === 0 || !/[\p{L}\p{N}]/u.test(hay[i - 1]!);
    const after = hay.slice(i + needle.length);
    if (before && /^(?:iga|sse|il|id|is|it|le|lt|st|ga|de|te|i|l|d|t)?(?=$|[^\p{L}\p{N}])/u.test(after)) return i;
    from = i + 1;
  }
  return -1;
}

function nameAliases(name: string): string[] {
  const n = norm(name);
  if (!n) return [];
  let s = n;
  const by = s.indexOf(" by ");
  if (by > 0) s = s.slice(0, by).trim();
  s = s.replace(/ mcp and .+$/, "").replace(/ (?:mcp|api)$/, "").replace(/ connection$/, "").replace(/ open banking$/, "").trim();
  return s && s !== n ? [n, s] : [n];
}

function idAliases(id: string): string[] {
  const n = norm(id.replaceAll("-", " "));
  const tokens = n.split(" ").filter(Boolean);
  const out: string[] = [];
  if (n && n.includes(" ")) out.push(n);
  for (const t of tokens) if (t.length >= 5 && !GENERIC.has(t)) out.push(t);
  const first = tokens[0];
  if (first && first.length >= 3 && !GENERIC.has(first)) out.push(first);
  return out;
}

let indexed: { rec: ServiceRecord; aliases: string[] }[] | null = null;
function catalogIndex() {
  if (!indexed) {
    indexed = loadCatalog().map((rec) => {
      const aliases = [...new Set([...nameAliases(rec.name), ...idAliases(rec.id)].filter((a) => a.length >= 3 && (a.includes(" ") || !GENERIC.has(a))))];
      return { rec, aliases };
    });
  }
  return indexed;
}

/** One owner product, routed the way the connect-service playbook routes it.
 * `key` is the canonical id stored in the hidden field. `product` is the name from code. */
export interface ProductHit {
  key: string;
  product: string;
  kind: ProductKind;
  record: ServiceRecord | null;
  via?: string;
  builtin?: "google" | "microsoft";
}

interface Phrase {
  key: string;
  needles: string[];
  kind: ProductKind;
  label: string;
  id?: string;
  via?: string;
  builtin?: "google" | "microsoft";
}

/** Named routes copied from the connect-service playbook. Accounting for Merit Aktiva,
 * e-arveldaja and Erply Books is the hosted Werkzeug row. Gmail and Microsoft 365 are
 * the assistant's built-in connector. Other banks, Proton and unnamed tools in those
 * branches are not offered as catalogue steps. */
const PHRASES: Phrase[] = [
  { key: "merit-aktiva", needles: ["merit aktiva", "merit activa"], kind: "accounting", label: "Merit Aktiva", id: "werkzeug", via: "Werkzeug" },
  { key: "merit-palk", needles: ["merit palk"], kind: "other", label: "Merit Palk" },
  { key: "merit-aktiva", needles: ["merit"], kind: "accounting", label: "Merit Aktiva", id: "werkzeug", via: "Werkzeug" },
  { key: "e-arveldaja", needles: ["e arveldaja", "earveldaja", "e financials", "arveldaja"], kind: "accounting", label: "e-arveldaja", id: "werkzeug", via: "Werkzeug" },
  { key: "erply-books", needles: ["erply books", "erply"], kind: "accounting", label: "Erply Books", id: "werkzeug", via: "Werkzeug" },
  { key: "werkzeug", needles: ["werkzeug"], kind: "accounting", label: "Werkzeug", id: "werkzeug" },
  { key: "proton-mail", needles: ["proton mail", "protonmail", "proton"], kind: "email", label: "Proton Mail" },
  { key: "microsoft-365", needles: ["microsoft 365"], kind: "email", label: "Microsoft 365", id: "microsoft-workiq-mcp", builtin: "microsoft" },
  { key: "outlook", needles: ["outlook"], kind: "email", label: "Outlook", id: "microsoft-workiq-mcp", builtin: "microsoft" },
  { key: "gmail", needles: ["gmail"], kind: "email", label: "Gmail", id: "google-gmail-mcp", builtin: "google" },
  { key: "swedbank", needles: ["swedbank"], kind: "bank", label: "Swedbank" },
  { key: "luminor", needles: ["luminor"], kind: "bank", label: "Luminor" },
  { key: "coop-pank", needles: ["coop pank", "coop"], kind: "bank", label: "Coop Pank" },
  { key: "seb", needles: ["seb"], kind: "bank", label: "SEB" },
  { key: "lhv", needles: ["lhv"], kind: "bank", label: "LHV", id: "lhv-ai" },
  { key: "pipedrive", needles: ["pipedrive"], kind: "customers", label: "Pipedrive", id: "pipedrive" },
  { key: "hubspot", needles: ["hubspot"], kind: "customers", label: "HubSpot", id: "hubspot" },
  { key: "scoro", needles: ["scoro"], kind: "customers", label: "Scoro", id: "scoro" },
  { key: "trivis", needles: ["trivis"], kind: "customers", label: "Trivis", id: "trivis" },
];

let idMap: Map<string, ServiceRecord> | null = null;
function recordById(id: string): ServiceRecord | null {
  if (!idMap) idMap = new Map(loadCatalog().map((rec) => [rec.id, rec]));
  return idMap.get(id) ?? null;
}

function phraseHit(phrase: Phrase, product: string): ProductHit {
  const record = phrase.id ? recordById(phrase.id) : null;
  const via = phrase.via && norm(phrase.via) !== norm(product) ? phrase.via : undefined;
  return {
    key: phrase.key, product, kind: phrase.kind, record,
    ...(via ? { via } : {}),
    ...(phrase.builtin ? { builtin: phrase.builtin } : {}),
  };
}

function hostedPhrase(rec: ServiceRecord): Phrase {
  return { key: `cat:${rec.id}`, needles: [], kind: kindOf(rec), label: cleanHostedName(rec), id: rec.id };
}

let keyIndex: Map<string, Phrase> | null = null;
function phraseByKey(key: string): Phrase | null {
  if (!keyIndex) {
    keyIndex = new Map();
    for (const phrase of PHRASES) if (!keyIndex.has(phrase.key)) keyIndex.set(phrase.key, phrase);
    for (const { rec } of catalogIndex()) {
      if (rec.interface_class !== "hosted_mcp") continue;
      const phrase = hostedPhrase(rec);
      if (!keyIndex.has(phrase.key)) keyIndex.set(phrase.key, phrase);
    }
  }
  return keyIndex.get(key) ?? null;
}

/** Canonical ids only. Unknown ids and any display string are dropped. */
export function productsFromKeys(keys: readonly unknown[]): ProductHit[] {
  const out: ProductHit[] = [];
  const seen = new Set<string>();
  for (const raw of keys) {
    if (typeof raw !== "string") continue;
    const phrase = phraseByKey(raw.trim());
    if (!phrase || seen.has(phrase.key)) continue;
    seen.add(phrase.key);
    out.push(phraseHit(phrase, phrase.label));
    if (out.length === 8) break;
  }
  return out;
}

let allowedNames: Set<string> | null = null;
function allowedProductNames(): Set<string> {
  if (!allowedNames) {
    const names = new Set<string>(["Gmail", "Outlook"]);
    for (const phrase of PHRASES) names.add(phrase.label);
    for (const rec of loadCatalog()) {
      const row = rec.name.trim().replace(/\s+/g, " ");
      if (row) names.add(row);
      const cleaned = cleanHostedName(rec).trim().replace(/\s+/g, " ");
      if (cleaned) names.add(cleaned);
    }
    allowedNames = names;
  }
  return allowedNames;
}

/** Names the paste prompt, the steps and the plan model may repeat. Anything else is dropped. */
function canonicalProductNames(names: readonly string[]): string[] {
  const allow = allowedProductNames();
  const out: string[] = [];
  for (const raw of names) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t || !allow.has(t) || out.includes(t)) continue;
    out.push(t);
    if (out.length === 8) break;
  }
  return out;
}

function cleanHostedName(rec: ServiceRecord): string {
  let n = rec.name;
  const by = n.search(/ by /i);
  if (by > 0) n = n.slice(0, by);
  n = n.replace(/\s+MCP.*$/i, "").replace(/\s+API.*$/i, "").trim();
  return n || rec.name;
}

interface Span { pos: number; end: number; phrase: Phrase; }

/** Playbook phrases first, then at most one hosted MCP row for a product the playbook does not name. */
function mentionsIn(hay: string): Span[] {
  const found: { pos: number; end: number; len: number; phrase: Phrase }[] = [];
  for (const phrase of PHRASES) {
    let best: { pos: number; len: number } | null = null;
    for (const needle of phrase.needles) {
      const pos = occurs(hay, needle);
      if (pos < 0) continue;
      if (!best || needle.length > best.len || (needle.length === best.len && pos < best.pos)) best = { pos, len: needle.length };
    }
    if (best) found.push({ pos: best.pos, end: best.pos + best.len, len: best.len, phrase });
  }
  found.sort((a, b) => a.pos - b.pos || b.len - a.len);
  const taken: { pos: number; end: number }[] = [];
  const out: Span[] = [];
  const overlaps = (pos: number, end: number) => taken.some((t) => !(end <= t.pos || pos >= t.end));
  for (const f of found) {
    if (overlaps(f.pos, f.end)) continue;
    taken.push({ pos: f.pos, end: f.end });
    out.push(f);
  }
  const hosted: { pos: number; end: number; len: number; rec: ServiceRecord }[] = [];
  for (const { rec, aliases } of catalogIndex()) {
    if (rec.interface_class !== "hosted_mcp") continue;
    let best: { pos: number; len: number } | null = null;
    for (const alias of aliases) {
      const pos = occurs(hay, alias);
      if (pos < 0) continue;
      if (!best || alias.length > best.len || (alias.length === best.len && pos < best.pos)) best = { pos, len: alias.length };
    }
    if (!best) continue;
    const end = best.pos + best.len;
    if (overlaps(best.pos, end)) continue;
    hosted.push({ pos: best.pos, end, len: best.len, rec });
  }
  hosted.sort((a, b) => a.pos - b.pos || b.len - a.len || a.rec.name.length - b.rec.name.length || a.rec.id.localeCompare(b.rec.id));
  for (const h of hosted) {
    if (overlaps(h.pos, h.end)) continue;
    taken.push({ pos: h.pos, end: h.end });
    out.push({ pos: h.pos, end: h.end, phrase: hostedPhrase(h.rec) });
  }
  out.sort((a, b) => a.pos - b.pos);
  return out;
}

/** Each named product yields at most one catalogue row, chosen by the connect-service playbook. */
export function routeProducts(names: string[], kinds?: ProductKind[]): { hits: ProductHit[]; unmatched: string[] } {
  const hits: ProductHit[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  names.forEach((raw, i) => {
    const name = typeof raw === "string" ? raw : "";
    const q = norm(name);
    if (q.length < 3) { unmatched.push(String(raw)); return; }
    const found = mentionsIn(q);
    if (found.length) {
      for (const span of found) {
        const product = span.phrase.label;
        const key = `${span.phrase.key}|${norm(product)}|${span.phrase.builtin ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(phraseHit(span.phrase, product));
      }
      return;
    }
    const kind = kinds?.[i];
    // A kind without a playbook or catalogue hit is not a product name we may repeat.
    if (kind === "accounting" || kind === "bank" || kind === "email" || kind === "customers") {
      unmatched.push(raw);
      return;
    }
    const best = bestHosted(q);
    if (!best) { unmatched.push(raw); return; }
    const phrase = hostedPhrase(best);
    const key = `${phrase.key}|${norm(phrase.label)}|`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(phraseHit(phrase, phrase.label));
  });
  return { hits, unmatched };
}

/** One best hosted MCP row. Developer rows (API, local, self-hosted, CLI) are never chosen. */
function bestHosted(q: string): ServiceRecord | null {
  let best: { rec: ServiceRecord; score: number } | null = null;
  for (const { rec, aliases } of catalogIndex()) {
    if (rec.interface_class !== "hosted_mcp") continue;
    let score = 0;
    for (const alias of aliases) {
      if (alias === q) { score = 3; break; }
      if (score < 2 && occurs(alias, q) >= 0) score = 2;
      else if (score < 1 && occurs(q, alias) >= 0) score = 1;
    }
    if (score === 0) continue;
    const better = !best || score > best.score
      || (score === best.score && (rec.name.length < best.rec.name.length || (rec.name.length === best.rec.name.length && rec.id < best.rec.id)));
    if (better) best = { rec, score };
  }
  return best?.rec ?? null;
}

/** One best catalogue record per name. A playbook route wins; otherwise one hosted MCP row. */
export function matchCatalog(names: string[]): { matched: ServiceRecord[]; unmatched: string[] } {
  const { hits, unmatched } = routeProducts(names);
  const matched: ServiceRecord[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!hit.record || seen.has(hit.record.id)) continue;
    seen.add(hit.record.id);
    matched.push(hit.record);
  }
  return { matched, unmatched };
}

/** Products named in free text, earliest first. No model. */
export function productsInText(text: string): ProductHit[] {
  const hits: ProductHit[] = [];
  const seen = new Set<string>();
  for (const span of mentionsIn(norm(text))) {
    const key = `${norm(span.phrase.label)}|${span.phrase.id ?? ""}|${span.phrase.builtin ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(phraseHit(span.phrase, span.phrase.label));
    if (hits.length === 8) break;
  }
  return hits;
}

/** Deterministic catalogue hits in the owner's text. No model. At most one row per product, at most 8. */
export function fallbackExtract(text: string): ServiceRecord[] {
  const out: ServiceRecord[] = [];
  const seen = new Set<string>();
  for (const hit of productsInText(text)) {
    if (!hit.record || seen.has(hit.record.id)) continue;
    seen.add(hit.record.id);
    out.push(hit.record);
    if (out.length === 8) break;
  }
  return out;
}

/** Strict model JSON. Anything else is null and the caller uses fallbackExtract. */
export function parseExtract(output: string): { products: ExtractedProduct[] } | null {
  let v: unknown;
  try { v = JSON.parse(output); } catch { return null; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== 1 || !Array.isArray(o.products) || o.products.length > 8) return null;
  const products: ExtractedProduct[] = [];
  for (const item of o.products) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const p = item as Record<string, unknown>;
    const keys = Object.keys(p);
    if (keys.length !== 2 || !keys.includes("name") || !keys.includes("kind")) return null;
    if (typeof p.name !== "string" || p.name.length < 1 || p.name.length > 60 || p.name.trim() === "") return null;
    if (typeof p.kind !== "string" || !(KINDS as readonly string[]).includes(p.kind)) return null;
    products.push({ name: p.name, kind: p.kind as ProductKind });
  }
  return { products };
}

export interface IntakeCompany {
  name: string | null;
  registry_code: string;
  legal_form?: string | null;
  emtak_code?: string | null;
  emtak_label?: string | null;
}
export interface IntakeObligation { title_et: string; title_en: string; effective_due: string | null; }
export interface IntakePlanArgs {
  company?: IntakeCompany | null;
  obligations?: IntakeObligation[];
  services?: ServiceRecord[];
  unmatched?: string[];
  uses: Uses;
  tier?: Tier | null;
  business?: Business | null;
  /** Assistant and plan id from the fact sheet. An unknown plan id for a known assistant stays unnamed. */
  current?: { assistant: string; plan: string };
  /** Rows to read. Defaults to the fact sheet. */
  sheet?: readonly PlanRow[];
  /** Owner product names for the paste prompt. Catalogue names are the fallback. */
  productNames?: string[];
  lang: "et" | "en";
}
export interface IntakeStep { text: string; href?: string; }
export interface IntakePlan {
  assistant: AssistantId | null;
  reason: string;
  reasons: Recommendation["reasons"];
  /** The same recommendation the plan was built from, including a free start and a stay-with-yours row. */
  recommendation: Recommendation;
  paidNote: boolean;
  planNote?: string;
  /** Candidate plans for the why table: plan, published cost, tax, own connections, phone, tested. */
  why: WhyRow[];
  candidates: PlanRow[];
  steps: IntakeStep[];
  prompt: string;
}

function currentPlan(args: IntakePlanArgs, sheet: readonly PlanRow[]): { assistant: string; plan: string } | undefined {
  const stated = args.current;
  if (stated?.assistant) {
    if (!sheet.some((row) => row.assistant === stated.assistant)) return undefined;
    return { assistant: stated.assistant, plan: stated.plan };
  }
  if (args.uses === "grok") return { assistant: "grok", plan: "unknown" };
  if (args.uses === "claude" && args.tier === "free") return { assistant: "claude", plan: "free" };
  if (args.uses === "chatgpt" && args.business === "yes") return { assistant: "chatgpt", plan: "business" };
  return undefined;
}

function asAssistantId(row: PlanRow): AssistantId {
  if (row.assistant === "claude" || row.assistant === "chatgpt" || row.assistant === "grok") return row.assistant;
  // recommendAssistant only keeps a connect-path assistant, so this is unreachable.
  throw new Error("unreachable assistant");
}

function intakeRecommendation(args: IntakePlanArgs): Recommendation {
  const sheet = args.sheet ?? PLANS;
  return recommendAssistant(customerFromServices(args.services ?? [], currentPlan(args, sheet)), sheet);
}

/** Prompt sentences use the register name, the registry code and canonical product names. */
function intakePrompt(lang: "et" | "en", company: IntakeCompany | null | undefined, services: ServiceRecord[], productNames?: string[]): string {
  const named = canonicalProductNames(productNames ?? []);
  const names = named.length ? named : canonicalProductNames(services.map((s) => s.name).filter((n) => typeof n === "string"));
  const parts: string[] = [];
  const code = company?.registry_code?.trim();
  const name = company?.name?.trim();
  if (name && code) {
    parts.push(lang === "et"
      ? `Minu ettevõte on ${name}, registrikood ${code}.`
      : `My company is ${name}, registry code ${code}.`);
  }
  if (names.length) parts.push(lang === "et" ? `Kasutan: ${names.join(", ")}.` : `I use: ${names.join(", ")}.`);
  parts.push(lang === "et"
    ? "Vaata AI-hüppelaua kaudu, mis tähtajad mul tulemas on ja mida sa minult vajad."
    : "Through AI Launchpad, see which deadlines I have coming up and what you need from me.");
  return parts.join(" ");
}

export function buildIntakePlan(args: IntakePlanArgs): IntakePlan {
  const lang = args.lang === "en" ? "en" : "et";
  const services = args.services ?? [];
  const sheet = args.sheet ?? PLANS;
  const rec = intakeRecommendation(args);
  const reasons = rec.reasons;
  const reason = reasons.map((r) => lang === "en" ? r.text_en : r.text_et).join(" ");
  if (!rec.recommended) {
    return {
      assistant: null,
      reason,
      reasons,
      recommendation: rec,
      paidNote: false,
      why: whyRows(sheet, lang),
      candidates: [...sheet],
      steps: [],
      prompt: intakePrompt(lang, args.company, services, args.productNames),
    };
  }
  const assistant = asAssistantId(rec.recommended);
  const candidates = candidateRows(rec);
  const steps: IntakeStep[] = [];
  const download = offerDownload(args.uses, assistant);
  const brand = assistant === "chatgpt" ? "ChatGPT" : assistant === "grok" ? "Grok" : "Claude";
  if (download) steps.push({ text: lang === "et" ? `Laadi alla ${brand}` : `Download ${brand}`, href: download });
  if (download || args.uses === "none" || args.uses === "other") steps.push({ text: lang === "et" ? "Loo konto." : "Sign up." });
  const href = lang === "en" ? `/uhenda?a=${assistant}&lang=en` : `/uhenda?a=${assistant}`;
  steps.push({ text: lang === "et" ? "Ühenda AI-hüppelaud." : "Connect AI Launchpad.", href });
  const inessive = brand === "Claude" ? "Claude'is" : brand === "ChatGPT" ? "ChatGPT-s" : brand === "Grok" ? "Grokis" : `${brand}is`;
  const turnOn = (what: string) => steps.push({
    text: lang === "et" ? `Lülita ${inessive} sisse ${what} (see on sisse ehitatud)` : `Turn on ${what} in ${brand} (built in)`,
  });
  if (rec.recommended.builtin_google.length && services.some((s) => emailKind(s) === "google")) turnOn("Gmail");
  if (rec.recommended.builtin_microsoft.length && services.some((s) => emailKind(s) === "microsoft")) turnOn("Outlook");
  const slots = rec.recommended.custom_connectors;
  const room = slots === "no_cap" || (typeof slots === "number" && slots > 1);
  const routedFor = productsRoutedThrough(args.productNames ?? []);
  if (room) for (const service of services) {
    if (service.interface_class !== "hosted_mcp" || emailKind(service)) continue;
    const url = safeHttps(service.connection);
    if (!url || !service.name) continue;
    const label = connectLabel(service);
    const products = canonicalProductNames(routedFor.get(service.id) ?? []);
    const listed = products.length
      ? (lang === "et" ? ` (${joinProducts(products, " ja ")} jaoks)` : ` (for ${joinProducts(products, " and ")})`)
      : "";
    steps.push({ text: lang === "et" ? `Ühenda ${label}${listed}.` : `Connect ${label}${listed}.`, href: url });
  }
  steps.push({ text: lang === "et" ? "Kleebi see juhis oma assistenti." : "Paste this prompt into your assistant." });
  return {
    assistant,
    reason,
    reasons,
    recommendation: rec,
    paidNote: rec.paidNote,
    ...(rec.paidNote ? { planNote: reason } : {}),
    why: whyRows(candidates, lang),
    candidates,
    steps,
    prompt: intakePrompt(lang, args.company, services, args.productNames),
  };
}

/** Gmail and Microsoft 365 follow the playbook's built-in connector, not a custom one. */
function emailKind(rec: ServiceRecord): "google" | "microsoft" | null {
  const blob = `${rec.id} ${rec.name} ${rec.sector ?? ""}`.toLowerCase();
  if (!/email|gmail|outlook|mailbox|mail/.test(blob) || /google-calendar/.test(rec.id)) return null;
  if (/gmail|google-gmail|google workspace/.test(blob)) return "google";
  if (/outlook|microsoft 365|microsoft-graph-mail|workiq/.test(blob)) return "microsoft";
  return null;
}

function connectLabel(rec: ServiceRecord): string {
  return cleanHostedName(rec);
}

/** Owner products that reach this catalogue row through a named route (Merit Aktiva → Werkzeug). */
function productsRoutedThrough(names: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!names.length) return map;
  for (const hit of routeProducts(names).hits) {
    if (!hit.record || !hit.via) continue;
    const list = map.get(hit.record.id) ?? [];
    const product = canonicalProductNames([hit.product])[0];
    if (product && !list.includes(product)) list.push(product);
    map.set(hit.record.id, list);
  }
  return map;
}

function joinProducts(items: string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]}${and}${items[1]}`;
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

/** Compact JSON for intake_plan. Obligations, then service names, drop until it fits.
 * Unmatched program text is never included: the visitor sees it only in the understood bubble. */
export function planModelInput(args: IntakePlanArgs): string {
  const lang = args.lang === "en" ? "en" : "et";
  const obligations = (args.obligations ?? [])
    .filter((o) => typeof o.effective_due === "string" && o.effective_due.length > 0)
    .slice(0, 3)
    .map((o) => ({ title: lang === "en" ? o.title_en : o.title_et, effective_due: o.effective_due as string }));
  const allow = allowedProductNames();
  let services = (args.services ?? []).map((s) => s.name).filter((n): n is string => typeof n === "string" && allow.has(n.trim().replace(/\s+/g, " ")));
  let companyName = args.company?.name?.trim() || "";
  let businessArea = args.company?.emtak_label?.trim() || "";
  const rec = intakeRecommendation(args);
  const fixed = {
    assistant: rec.recommended ? asAssistantId(rec.recommended) : null,
    tier: args.tier ?? null,
    paid_note: rec.paidNote,
    lang,
  };
  const build = () => {
    const body: Record<string, unknown> = {};
    if (companyName) body.company_name = companyName;
    if (businessArea) body.business_area = businessArea;
    body.obligations = obligations;
    body.services = services;
    return JSON.stringify({ ...body, ...fixed });
  };
  const tooBig = (s: string) => s.length > MAX_INPUT_CHARS || new TextEncoder().encode(s).byteLength > MAX_INPUT_BYTES;
  let s = build();
  while (tooBig(s) && obligations.length) { obligations.pop(); s = build(); }
  while (tooBig(s) && services.length) { services = services.slice(0, -1); s = build(); }
  while (tooBig(s) && companyName.length > 20) { companyName = companyName.slice(0, Math.floor(companyName.length / 2)); s = build(); }
  while (tooBig(s) && businessArea.length > 20) { businessArea = businessArea.slice(0, Math.floor(businessArea.length / 2)); s = build(); }
  if (tooBig(s)) { companyName = ""; businessArea = ""; s = build(); }
  return s;
}

export type IntakeResult = { ok: true; output: string; mock: boolean } | { ok: false; reason: string; mock: boolean };
export interface IntakeClient {
  readonly mock: boolean;
  extract(text: string): Promise<IntakeResult>;
  summarize(input: string): Promise<IntakeResult>;
}

const normalizeExtract = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 500);

/** A fresh id on every call, so the same note never replays a stored ledger row. */
export function intakeRequestId(job: ModelJob, input: string): string {
  const nonce = randomBytes(8).toString("hex");
  const body = createHash("sha256").update(nonce).update("\0").update(job).update("\0").update(input).digest("hex").slice(0, 32);
  return `in.${nonce}.${body}`;
}

function kindOf(rec: ServiceRecord): ProductKind {
  const s = `${rec.sector ?? ""} ${rec.id}`.toLowerCase();
  if (s.includes("account") || s.includes("merit") || s.includes("werkzeug") || s.includes("book")) return "accounting";
  if (s.includes("bank")) return "bank";
  if (s.includes("email") || s.includes("gmail") || s.includes("mail")) return "email";
  if (s.includes("crm") || s.includes("customer") || s.includes("pipedrive")) return "customers";
  return "other";
}

const MOCK_PLAN = {
  et: "Näidisplaan (kohalik mock, mitte mudel): ühenda AI-hüppelaud ja vaata tähtaegu.",
  en: "Sample plan (local mock, not a model): connect AI Launchpad and see your deadlines.",
};
const MOCK_PAID = {
  et: "Parim tulemus vajab tasulist AI paketti.",
  en: "The best result needs a paid AI plan.",
};

/** Deterministic fixture. Labelled mock. No ledger and no network. */
export function mockIntake(): IntakeClient {
  return {
    mock: true,
    async extract(text) {
      const products = productsInText(text).map((hit) => ({ name: hit.product.slice(0, 60), kind: hit.kind }));
      return { ok: true, output: JSON.stringify({ products }), mock: true };
    },
    async summarize(input) {
      let lang: "et" | "en" = "et";
      let paid = false;
      try {
        const o = JSON.parse(input) as { lang?: unknown; paid_note?: unknown };
        if (o.lang === "en") lang = "en";
        paid = o.paid_note === true;
      } catch { /* a broken fixture still returns the mock sentence */ }
      const output = `${MOCK_PLAN[lang]}${paid ? ` ${MOCK_PAID[lang]}` : ""}`.slice(0, 600);
      return { ok: true, output, mock: true };
    },
  };
}

/** The string that passed the 600-character cap, or null. Padding does not count. */
const acceptedPlan = (output: string): string | null => {
  const t = output.trim();
  return t.length > 0 && t.length <= 600 ? t : null;
};

/** Live Meta calls through the caller's ledger. Failures become { ok: false } and never throw. */
export function liveIntake(opts: { ledger: ModelQualityLedger; apiKey: string; fetchFn?: FetchFn }): IntakeClient {
  async function call(job: "intake_extract" | "intake_plan", input: string, accept: (output: string) => string | null): Promise<IntakeResult> {
    try {
      const r = await runModelQualityAttempt({
        job, input, requestId: intakeRequestId(job, input),
        ledger: opts.ledger, apiKey: opts.apiKey, fetchFn: opts.fetchFn, confirmCurrentPricing: true,
      });
      const kept = r.status === "completed" && r.output ? accept(r.output) : null;
      if (kept) return { ok: true, output: kept, mock: false };
      if (r.status === "completed") return { ok: false, reason: "invalid_output", mock: false };
      return { ok: false, reason: r.errorCode ?? r.status, mock: false };
    } catch (e) {
      return { ok: false, reason: e instanceof ModelQualityError ? e.code : "unavailable", mock: false };
    }
  }
  return {
    mock: false,
    async extract(text) {
      const body = normalizeExtract(text);
      if (!body) return { ok: false, reason: "empty", mock: false };
      const input = JSON.stringify({ text: body });
      return call("intake_extract", input, (output) => (parseExtract(output) !== null ? output : null));
    },
    async summarize(input) {
      if (typeof input !== "string" || input.trim() === "") return { ok: false, reason: "empty", mock: false };
      return call("intake_plan", input, acceptedPlan);
    },
  };
}

const HOUR_MS = 3_600_000, RATE_MAX = 8, RATE_KEYS = 1000;
const intakeAttempts = new Map<string, number[]>();
/** At most 8 model calls per rolling hour per key. In memory only. */
export function intakeRateOk(key: string, now = Date.now()): boolean {
  const recent = (intakeAttempts.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= RATE_MAX) { intakeAttempts.set(key, recent); return false; }
  if (!intakeAttempts.has(key) && intakeAttempts.size >= RATE_KEYS) {
    for (const [k, stamps] of intakeAttempts) if (!stamps.some((t) => now - t < HOUR_MS)) intakeAttempts.delete(k);
    if (intakeAttempts.size >= RATE_KEYS) return false;
  }
  recent.push(now);
  intakeAttempts.set(key, recent);
  return true;
}
