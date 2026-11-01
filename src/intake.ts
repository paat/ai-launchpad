/** Onboarding intake for a future /alusta page. Rules pick the assistant, the steps
 * and the prompt. A model may only name programs the owner already wrote, or
 * write a short bottom line from facts the rules already computed. Nothing
 * here is stored: the rate limit is an in-memory map, and the ledger the
 * caller passes in is the existing model-quality ledger. */
import { createHash } from "node:crypto";
import {
  offerDownload,
  type AssistantChoice, type AssistantId, type Business, type Tier, type Uses,
} from "./assistant-choice.js";
import {
  candidateRows, customerFromServices, recommendAssistant, whyRows,
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

/** One best catalogue record per name. Containment is case-insensitive on the name, a shortened alias, or the id. */
export function matchCatalog(names: string[]): { matched: ServiceRecord[]; unmatched: string[] } {
  const matched: ServiceRecord[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const q = norm(typeof raw === "string" ? raw : "");
    if (q.length < 3) { unmatched.push(String(raw)); continue; }
    let best: { rec: ServiceRecord; score: number } | null = null;
    for (const { rec, aliases } of catalogIndex()) {
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
    if (!best) unmatched.push(raw);
    else if (!seen.has(best.rec.id)) { seen.add(best.rec.id); matched.push(best.rec); }
  }
  return { matched, unmatched };
}

/** Deterministic catalogue hits in the owner's text. No model. At most 8, earliest first. */
export function fallbackExtract(text: string): ServiceRecord[] {
  const hay = norm(text);
  const hits: { rec: ServiceRecord; pos: number; len: number }[] = [];
  for (const { rec, aliases } of catalogIndex()) {
    let best: { pos: number; len: number } | null = null;
    for (const alias of aliases) {
      const pos = occurs(hay, alias);
      if (pos < 0) continue;
      if (!best || pos < best.pos || (pos === best.pos && alias.length > best.len)) best = { pos, len: alias.length };
    }
    if (best) hits.push({ rec, ...best });
  }
  hits.sort((a, b) => a.pos - b.pos || b.len - a.len || a.rec.name.length - b.rec.name.length || a.rec.id.localeCompare(b.rec.id));
  const out: ServiceRecord[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (seen.has(h.rec.id)) continue;
    seen.add(h.rec.id);
    out.push(h.rec);
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
  choice?: AssistantChoice;
  uses: Uses;
  tier?: Tier | null;
  business?: Business | null;
  lang: "et" | "en";
}
export interface IntakeStep { text: string; href?: string; }
export interface IntakePlan {
  assistant: AssistantId;
  reason: string;
  reasons: Recommendation["reasons"];
  paidNote: boolean;
  planNote?: string;
  /** Candidate plans for the why table: plan, published cost, tax, own connections, phone, tested. */
  why: WhyRow[];
  candidates: PlanRow[];
  steps: IntakeStep[];
  prompt: string;
}

function currentPlan(uses: Uses, tier: Tier | null, business: Business | null): { assistant: string; plan: string } | undefined {
  if (uses === "claude" && tier === "free") return { assistant: "claude", plan: "free" };
  if (uses === "chatgpt" && business === "yes") return { assistant: "chatgpt", plan: "business" };
  return undefined;
}

function asAssistantId(row: PlanRow): AssistantId {
  if (row.assistant === "chatgpt") return "chatgpt";
  if (row.assistant === "grok") return "grok";
  return "claude";
}

function intakeRecommendation(args: IntakePlanArgs): Recommendation {
  return recommendAssistant(customerFromServices(args.services ?? [], currentPlan(args.uses, args.tier ?? null, args.business ?? null)));
}

/** Prompt sentences use only the register name, the registry code and catalogue names. */
function intakePrompt(lang: "et" | "en", company: IntakeCompany | null | undefined, services: ServiceRecord[]): string {
  const names = services.map((s) => s.name).filter((n) => typeof n === "string" && n.length > 0);
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
  const rec = intakeRecommendation(args);
  const assistant = asAssistantId(rec.recommended);
  const candidates = candidateRows(rec);
  const reasons = rec.reasons;
  const reason = reasons.map((r) => lang === "en" ? r.text_en : r.text_et).join(" ");
  const steps: IntakeStep[] = [];
  const download = offerDownload(args.uses, assistant);
  if (download) steps.push({ text: lang === "et" ? "Hangi see." : "Get it.", href: download });
  steps.push({ text: lang === "et" ? "Loo konto." : "Sign up." });
  const href = lang === "en" ? `/uhenda?a=${assistant}&lang=en` : `/uhenda?a=${assistant}`;
  steps.push({ text: lang === "et" ? "Ühenda AI-hüppelaud." : "Connect AI Launchpad.", href });
  const slots = rec.recommended.custom_connectors;
  const room = slots === "no_cap" || (typeof slots === "number" && slots > 1);
  if (room) for (const service of services) {
    const url = safeHttps(service.connection);
    if (!url || !service.name) continue;
    steps.push({ text: lang === "et" ? `Ühenda ${service.name}.` : `Connect ${service.name}.`, href: url });
  }
  steps.push({ text: lang === "et" ? "Kleebi see juhis oma assistenti." : "Paste this prompt into your assistant." });
  return {
    assistant,
    reason,
    reasons,
    paidNote: rec.paidNote,
    ...(rec.paidNote ? { planNote: reason } : {}),
    why: whyRows(candidates, lang),
    candidates,
    steps,
    prompt: intakePrompt(lang, args.company, services),
  };
}

/** Compact JSON for intake_plan. Obligations, then services, then unmatched names drop until it fits. */
export function planModelInput(args: IntakePlanArgs): string {
  const lang = args.lang === "en" ? "en" : "et";
  const obligations = (args.obligations ?? [])
    .filter((o) => typeof o.effective_due === "string" && o.effective_due.length > 0)
    .slice(0, 3)
    .map((o) => ({ title: lang === "en" ? o.title_en : o.title_et, effective_due: o.effective_due as string }));
  let services = (args.services ?? []).map((s) => s.name).filter((n) => typeof n === "string" && n.length > 0);
  let unmatched = (args.unmatched ?? [])
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .slice(0, 8)
    .map((n) => n.slice(0, 60));
  let companyName = args.company?.name?.trim() || "";
  let businessArea = args.company?.emtak_label?.trim() || "";
  const rec = intakeRecommendation(args);
  const fixed = {
    assistant: asAssistantId(rec.recommended),
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
    if (unmatched.length) body.unmatched = unmatched;
    return JSON.stringify({ ...body, ...fixed });
  };
  const tooBig = (s: string) => s.length > MAX_INPUT_CHARS || new TextEncoder().encode(s).byteLength > MAX_INPUT_BYTES;
  let s = build();
  while (tooBig(s) && unmatched.length) { unmatched = unmatched.slice(0, -1); s = build(); }
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

/** Same input (job + normalized text) replays one ledger row. */
export function intakeRequestId(job: ModelJob, input: string): string {
  return `in.${createHash("sha256").update(job).update("\0").update(input).digest("hex").slice(0, 40)}`;
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
      const products = fallbackExtract(text).map((rec) => ({ name: rec.name.slice(0, 60), kind: kindOf(rec) }));
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
