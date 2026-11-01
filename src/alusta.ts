/** Public /alusta: fixed questions, nothing stored. Rules build the plan.
 * A model may only name programs the visitor wrote, or phrase the rules' plan.
 * Limits fail open onto that rules plan, except a register flood, which is one sentence. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { PLANS, SOURCES, planLabel, type PlanRow } from "./assistant-plans.js";
import { parseBusiness, parseTier, parseUses, type Business, type Tier, type Uses } from "./assistant-choice.js";
import type { Arikratt, CompanyCard } from "./arikratt.js";
import { loadCatalog, type ServiceRecord } from "./catalog.js";
import {
  buildIntakePlan, intakeRateOk, parseExtract, planModelInput, productsInText, routeProducts,
  type IntakeClient, type IntakeCompany, type IntakeObligation, type IntakePlan, type ProductHit,
} from "./intake.js";
import { computeObligations, validRegistryCode, type CompanyFacts, type Obligation } from "./obligations.js";
import { alustaBody, esc, tr, type Lang } from "./views.js";

export const INTAKE_DAILY_MODEL_CALLS = 400;
const MODEL_CALLS_PER_CONVERSATION = 2;
const MIN_AGE_MS = 2_000;
const MAX_AGE_MS = 30 * 60 * 1000;
const REGISTER_MAX = 20;
const HOUR_MS = 3_600_000;
const REGISTER_KEYS = 1000;

const convCalls = new Map<string, number>();
const extracted = new Set<string>();
const registerHits = new Map<string, number[]>();
let dailyDay = "";
let dailyCount = 0;

/** Tallinn civil date, YYYY-MM-DD. The daily model cap resets on this boundary. */
export function tallinnDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Tallinn", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** Test hook. Clears the in-memory conversation, register and daily counters. The per-IP model window lives in intakeRateOk and moves with the clock. */
export function resetAlustaGuards(): void {
  convCalls.clear();
  extracted.clear();
  registerHits.clear();
  dailyDay = "";
  dailyCount = 0;
}

export function mintAlusta(now: number): string {
  return `${randomBytes(18).toString("base64url")}.${now}`;
}

export function alustaMaxAge(value: string, now: number): number {
  const parsed = parseAlusta(value);
  if (!parsed) return 0;
  return Math.max(0, Math.ceil((parsed.startedAt + MAX_AGE_MS - now) / 1000));
}

function parseAlusta(value: string | null): { id: string; startedAt: number } | null {
  if (!value || value.length > 200) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 8) return null;
  const token = value.slice(0, dot);
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const startedAt = Number(value.slice(dot + 1));
  if (!Number.isSafeInteger(startedAt) || startedAt < 0) return null;
  return { id: value, startedAt };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** At most 20 register lookups and name searches per rolling hour per key. */
export function registerLookupOk(key: string, now = Date.now()): boolean {
  const recent = (registerHits.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= REGISTER_MAX) { registerHits.set(key, recent); return false; }
  if (!registerHits.has(key) && registerHits.size >= REGISTER_KEYS) {
    for (const [k, stamps] of registerHits) if (!stamps.some((t) => now - t < HOUR_MS)) registerHits.delete(k);
    if (registerHits.size >= REGISTER_KEYS) return false;
  }
  recent.push(now);
  registerHits.set(key, recent);
  return true;
}

/** One model call, or a refusal. Honeypot, too-fast, too-old, the conversation cap,
 * the daily cap and the per-IP cap all refuse. A refusal does not increment. */
export function reserveIntakeModel(opts: { id: string; ip: string; startedAt: number; now: number; honeypot: boolean }): boolean {
  if (opts.honeypot) return false;
  const age = opts.now - opts.startedAt;
  if (!Number.isFinite(age) || age < MIN_AGE_MS || age > MAX_AGE_MS) return false;
  const used = convCalls.get(opts.id) ?? 0;
  if (used >= MODEL_CALLS_PER_CONVERSATION) return false;
  const day = tallinnDay(opts.now);
  if (dailyDay !== day) { dailyDay = day; dailyCount = 0; }
  if (dailyCount >= INTAKE_DAILY_MODEL_CALLS) return false;
  if (!intakeRateOk(opts.ip, opts.now)) return false;
  convCalls.set(opts.id, used + 1);
  dailyCount += 1;
  return true;
}

const BRAND: Record<string, string> = {
  claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini", google: "Google",
  copilot: "Copilot", meta: "Meta AI", grok: "Grok",
};
const ASSISTANTS = [...new Set(PLANS.map((row) => row.assistant))];
const sourceUrl = new Map(SOURCES.map((s) => [s.n, s.url]));
const EN_MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const clip = (v: string, n: number) => v.slice(0, n);
const field = (body: Record<string, string>, key: string) => (typeof body[key] === "string" ? body[key] : "");

interface NamedProduct { product: string; id: string; via: string; }

interface Flow {
  asked: string;
  code: string;
  co: boolean;
  qtext: string;
  got: "" | "model" | "fallback" | "skip";
  shown: string;
  svc: string[];
  products: NamedProduct[];
  unmatched: string[];
  assistant: string;
  plan: string;
  pu: boolean;
  uses: Uses | null;
  tier: Tier | null;
  business: Business | null;
  csum: string;
  limited?: boolean;
  gap?: "invalid" | "code" | "name" | "down";
  pendingMatches?: { name: string; registry_code: string }[];
  pendingFound?: { company: CompanyCard; facts: CompanyFacts };
}

function blank(): Flow {
  return { asked: "", code: "", co: false, qtext: "", got: "", shown: "", svc: [], products: [], unmatched: [], assistant: "", plan: "", pu: false, uses: null, tier: null, business: null, csum: "" };
}

function catalogById(catalog: ServiceRecord[]): Map<string, ServiceRecord> {
  return new Map(catalog.map((rec) => [rec.id, rec]));
}

function readSvc(raw: string, ids: Map<string, ServiceRecord>): string[] {
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (ids.has(id) && !out.includes(id)) out.push(id);
    if (out.length === 8) break;
  }
  return out;
}

function readProducts(raw: string, ids: Map<string, ServiceRecord>): NamedProduct[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: NamedProduct[] = [];
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const product = typeof row.p === "string" ? row.p.trim().slice(0, 60) : "";
      const id = typeof row.id === "string" ? row.id.trim() : "";
      const via = typeof row.v === "string" ? row.v.trim().slice(0, 40) : "";
      if (!product) continue;
      out.push({ product, id: id && ids.has(id) ? id : "", via: id && ids.has(id) ? via : "" });
      if (out.length === 8) break;
    }
    return out;
  } catch { return []; }
}

function readUnmatched(raw: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 8).map((s) => s.slice(0, 60));
  } catch { return []; }
}

function derived(flow: Flow): { uses: Uses; tier: Tier | null; business: Business | null } {
  if (!flow.assistant) {
    return { uses: flow.uses === "other" ? "other" : "none", tier: null, business: null };
  }
  const uses: Uses = flow.assistant === "claude" || flow.assistant === "chatgpt" || flow.assistant === "grok" ? flow.assistant : "other";
  if (!flow.pu) return { uses, tier: null, business: null };
  if (flow.plan === "") {
    if (flow.assistant === "chatgpt") return { uses, tier: null, business: "unsure" };
    if (flow.assistant === "claude" || flow.assistant === "grok") return { uses, tier: "unsure", business: null };
    return { uses, tier: null, business: null };
  }
  if (flow.assistant === "chatgpt") return { uses, tier: null, business: flow.plan === "business" ? "yes" : "no" };
  if (flow.assistant === "claude" || flow.assistant === "grok") return { uses, tier: flow.plan === "free" ? "free" : "paid", business: null };
  return { uses, tier: null, business: null };
}

function applyDerived(flow: Flow): void {
  const d = derived(flow);
  flow.uses = flow.assistant || flow.uses === "other" || flow.uses === "none" ? d.uses : null;
  if (!flow.assistant && flow.uses !== "other" && flow.uses !== "none") flow.uses = null;
  flow.tier = d.tier;
  flow.business = d.business;
}

function knownPlan(assistant: string, plan: string): boolean {
  return PLANS.some((row) => row.assistant === assistant && row.plan === plan);
}

function plansFor(assistant: string): PlanRow[] {
  if (assistant === "gemini") return PLANS.filter((row) => row.assistant === "gemini" || row.assistant === "google");
  return PLANS.filter((row) => row.assistant === assistant);
}

function etDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}.${m}.${y}`;
}
function enDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${EN_MONTH[Number(m) - 1] ?? m} ${y}`;
}
function showDate(iso: string, lang: Lang): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? (lang === "en" ? enDate(iso) : etDate(iso)) : iso;
}

function cites(ns: number[]): string {
  return ns.map((n) => {
    const url = sourceUrl.get(n);
    return url ? `<a href="${esc(url)}" rel="noopener noreferrer">${n}</a>` : String(n);
  }).join(" ");
}

function paidNote(assistant: string, lang: Lang): string {
  const brand = BRAND[assistant] ?? assistant;
  if (lang === "en") return `The best result needs a paid AI plan. The connection limit is ${brand}'s plan, not AI Launchpad.`;
  const gen = brand === "Claude" ? "Claude'i" : brand === "ChatGPT" ? "ChatGPT" : brand === "Grok" ? "Groki" : brand;
  return `Parim tulemus vajab tasulist AI paketti. Ühenduste piirang on ${gen} paketi oma, mitte AI-hüppelaua.`;
}
const MUSE_DOWN = {
  et: "Muse ei ole praegu saadaval — plaan on koostatud meie reeglitest.",
  en: "Muse is not available right now — the plan comes from our rules.",
};
const MUSE_LIVE = { et: "Muse Spark (Meta) · elav vastus", en: "Muse Spark (Meta) · live answer" };
const MUSE_MOCK = { et: "Näidis", en: "Sample" };
const LIMIT_MSG = { et: "Liiga palju päringuid, proovi tunni pärast", en: "Too many requests, try again in an hour." };

function hiddenOf(flow: Flow): Record<string, string> {
  return {
    asked: flow.asked,
    code: flow.code,
    co: flow.co ? "1" : "",
    qtext: flow.qtext,
    got: flow.got,
    shown: flow.shown,
    svc: flow.svc.join(","),
    products: flow.products.length ? JSON.stringify(flow.products.map((p) => ({ p: p.product, id: p.id, v: p.via }))) : "",
    unmatched: flow.unmatched.length ? JSON.stringify(flow.unmatched) : "",
    uses: flow.uses ?? "",
    tier: flow.tier ?? "",
    business: flow.business ?? "",
    assistant: flow.assistant,
    plan: flow.plan,
    pu: flow.pu ? "1" : "",
    csum: flow.csum,
  };
}

function assistantLabel(flow: Flow, lang: Lang): string {
  const t = tr(lang);
  if (flow.uses === "none" && !flow.assistant) return t("Mul pole veel", "I don't have one yet");
  if (flow.uses === "other" && !flow.assistant) return t("Muu", "Other");
  if (flow.assistant === "google" || flow.assistant === "gemini") return "Gemini";
  return BRAND[flow.assistant] ?? flow.assistant;
}

function planChoiceLabel(flow: Flow, lang: Lang): string {
  if (!flow.pu) return "";
  if (!flow.plan) return tr(lang)("Ei tea", "I don't know");
  return planLabel({ assistant: flow.assistant, plan: flow.plan });
}

function bubblesOf(flow: Flow, lang: Lang): { side: "me" | "ai"; text: string }[] {
  const out: { side: "me" | "ai"; text: string }[] = [];
  if (flow.asked) out.push({ side: "me", text: flow.asked });
  if (flow.csum) out.push({ side: "ai", text: flow.csum });
  if (flow.got && flow.qtext) out.push({ side: "me", text: flow.qtext });
  if (flow.shown) out.push({ side: "ai", text: flow.shown });
  if (flow.pu || flow.assistant || flow.uses === "none" || flow.uses === "other") {
    if (flow.assistant || flow.uses === "none" || flow.uses === "other") out.push({ side: "me", text: assistantLabel(flow, lang) });
  }
  const planName = planChoiceLabel(flow, lang);
  if (planName && flow.assistant) out.push({ side: "me", text: planName });
  return out;
}

function summaryLine(company: CompanyCard): string {
  return [company.name, company.legal_form, company.emtak_label].filter((v): v is string => !!v && v.trim() !== "").join(" · ").slice(0, 500);
}

function annualText(facts: CompanyFacts, lang: Lang): string {
  const t = tr(lang);
  const ar = facts.annual_report?.value;
  if (!ar || ar.latest_year == null) return t("teadmata", "unknown");
  const filed = ar.filed === true ? t("esitatud", "filed") : ar.filed === false ? t("esitamata", "not filed") : t("staatus teadmata", "status unknown");
  const late = ar.overdue_days != null && ar.overdue_days > 0 ? t(`, ${ar.overdue_days} päeva üle tähtaja`, `, ${ar.overdue_days} days overdue`) : "";
  return `${ar.latest_year}, ${filed}${late}`;
}

function vatText(facts: CompanyFacts, lang: Lang): string {
  const t = tr(lang);
  const vat = facts.vat_registered;
  if (!vat) return t("teadmata", "unknown");
  return vat.value ? t("jah", "yes") : t("ei", "no");
}

function upcoming(facts: CompanyFacts, now: number): Obligation[] {
  return computeObligations(facts, { today: new Date(now), months: 3 }).obligations
    .filter((o) => o.effective_due)
    .slice(0, 3);
}

function foundCard(company: CompanyCard, facts: CompanyFacts, lang: Lang, now: number): string {
  const t = tr(lang);
  const unknown = t("teadmata", "unknown");
  const row = (dt: string, dd: string) => `<dt>${esc(dt)}</dt><dd>${esc(dd)}</dd>`;
  const obs = upcoming(facts, now).map((o) => {
    const due = o.effective_due ? showDate(o.effective_due, lang) : "";
    const title = t(o.title_et, o.title_en);
    const src = `<a class="tap-link" href="${esc(o.source.url)}" rel="noopener noreferrer">${esc(t("Allikas", "Source"))}: <span lang="et">${esc(o.source.act_et)} ${esc(o.source.section)}</span></a>`;
    return `<li>${esc(title)}${due ? ` · <time datetime="${esc(o.effective_due!)}">${esc(due)}</time>` : ""} ${src}</li>`;
  }).join("");
  return `<dl class="facts">${row(t("Nimi", "Name"), company.name || unknown)}${row(t("Õiguslik vorm", "Legal form"), company.legal_form || unknown)}${row(t("Tegevusala", "Business area"), company.emtak_label || unknown)}${row(t("Käibemaksukohustuslane", "VAT registered"), vatText(facts, lang))}${row(t("Viimane majandusaasta aruanne", "Last annual report"), annualText(facts, lang))}</dl>
${obs ? `<h2>${esc(t("Järgmised kohustused", "Next obligations"))}</h2><ul class="steps">${obs}</ul>` : ""}
<p class="small">${esc(lang === "en" ? company.label_en : company.label_et)}</p>
<p class="small muted">${esc(company.attribution)}</p>`;
}

function understood(products: NamedProduct[], viaModel: boolean, lang: Lang): string {
  const t = tr(lang);
  const names = products.map((p) => p.via ? `${p.product} → via ${p.via}` : p.product).filter(Boolean).join(", ");
  if (viaModel) return names ? t(`Sain aru: ${names}.`, `I understood: ${names}.`) : t("Sain aru: programme nime järgi ei tundnud.", "I understood: I could not name a program.");
  return names ? t(`Leitud nime järgi (mitte Muse): ${names}.`, `Matched by name (not Muse): ${names}.`) : t("Leitud nime järgi (mitte Muse).", "Matched by name (not Muse).");
}

function reasonBits(plan: IntakePlan, lang: Lang): { text: string; sources: number[] }[] {
  const bits: { text: string; sources: number[] }[] = [];
  for (const reason of plan.reasons) {
    const text = lang === "en" ? reason.text_en : reason.text_et;
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed) bits.push({ text: trimmed, sources: reason.sources });
    }
  }
  return bits;
}

function reasonBucket(sentence: string): "connections" | "cost" | "tested" | "other" {
  const s = sentence.toLowerCase();
  if (/ühendus|connection/.test(s) && /vaja|need|piirang|limit|praegune|current/.test(s)) return "connections";
  if (/maksab|costs|dollar|euro/.test(s)) return "cost";
  if (/proovinud|tried|testitud|tested/.test(s)) return "tested";
  return "other";
}

/** The rules plan, then at most one phrasing from the model. Model text is escaped and never enters the prompt. */
export function planScreenHtml(plan: IntakePlan, muse: { text: string; mock: boolean } | null, lang: Lang): string {
  const t = tr(lang);
  const rec = plan.recommendation;
  const noFit = !rec.recommended;
  const headline = noFit
    ? t("Ühtegi sobivat paketti ei leitud — vaata tabelit", "No plan fits — see the table")
    : t(`Soovitame: ${planLabel(rec.recommended!)}`, `We recommend: ${planLabel(rec.recommended!)}`);
  const bits = reasonBits(plan, lang).filter((bit) => bit.text !== headline && bit.text !== t("Ühtegi sobivat paketti ei leitud — vaata tabelit", "No plan fits — see the table"));
  const deciding: typeof bits = [];
  const used = new Set<number>();
  for (const bucket of ["connections", "cost", "tested"] as const) {
    const at = bits.findIndex((bit, i) => !used.has(i) && reasonBucket(bit.text) === bucket);
    if (at >= 0) { deciding.push(bits[at]!); used.add(at); }
  }
  const rest = bits.filter((_, i) => !used.has(i));
  const sourceLine = (rows: { sources: number[] }[]) => {
    const nums: number[] = [];
    for (const row of rows) for (const n of row.sources) if (!nums.includes(n)) nums.push(n);
    return nums.length ? `<p class="small">${esc(t("Allikad", "Sources"))}: ${cites(nums)}</p>` : "";
  };
  const lead = deciding.length ? `<p>${esc(deciding.map((bit) => bit.text).join(" "))}</p>${sourceLine(deciding)}` : "";
  const more = rest.length ? `<p>${esc(rest.map((bit) => bit.text).join(" "))}</p>${sourceLine(rest)}` : "";
  const start = rec.start ? (() => {
    const row = plan.why.find((w) => w.assistant === rec.start!.assistant && w.plan === rec.start!.plan);
    const facts = row ? ` ${row.planLabel}. ${row.cost}. ${row.taxNote}.` : ` ${planLabel(rec.start)}.`;
    return `<p>${esc(t("Võid alustada tasuta:", "You can start for free:"))}${esc(facts)}</p>`;
  })() : "";
  const stay = rec.stayAlternative ? (() => {
    const row = rec.stayAlternative;
    const brand = BRAND[row.assistant] ?? row.assistant;
    const why = plan.why.find((w) => w.assistant === row.assistant && w.plan === row.plan);
    const facts = why ? `${why.planLabel}. ${why.cost}. ${why.taxNote}. ${t("Oma ühendused", "Own connections")}: ${why.connections}. ${t("Töötab telefonis", "Works on phone")}: ${why.phone}.` : planLabel(row);
    return `<p>${esc(t(`Kui tahad jääda ${brand} juurde: `, `If you want to stay with ${brand}: `))}${esc(facts)}</p>`;
  })() : "";
  const head = ["Pakett", "Hind", "Oma ühendused", "Töötab telefonis", "Meie testisime", "Allikad"];
  const headEn = ["Plan", "Cost", "Own connections", "Works on phone", "Tested by us", "Sources"];
  const cols = lang === "en" ? headEn : head;
  const rows = plan.why.map((w) => {
    const cells = [w.planLabel, `${w.cost}. ${w.taxNote}.`, w.connections, w.phone, w.tested, ""];
    const src = cites(w.sources);
    return `<tr>${cells.map((c, i) => `<td data-label="${esc(cols[i]!)}">${i === 5 ? src : esc(c)}</td>`).join("")}</tr>`;
  }).join("");
  const table = `<table class="why"><caption>${esc(t("Miks?", "Why?"))}</caption><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  const paid = plan.paidNote && rec.recommended ? `<p class="note">${esc(paidNote(rec.recommended.assistant, lang))}</p>` : "";
  const steps = plan.steps.length ? `<ol class="steps">${plan.steps.map((s) => `<li>${s.href ? `<a href="${esc(s.href)}"${s.href.startsWith("http") ? ' rel="noopener noreferrer"' : ""}>${esc(s.text)}</a>` : esc(s.text)}</li>`).join("")}</ol>` : "";
  const prompt = `<label for="alusta-prompt">${esc(t("Tekst, mille kleebid assistenti", "Text to paste into your assistant"))}</label>
<textarea id="alusta-prompt" readonly rows="4">${esc(plan.prompt)}</textarea>
<button type="button" id="alusta-copy" data-copy-text="${esc(plan.prompt)}">${esc(t("Kopeeri", "Copy"))}</button>
<script>(function(){var b=document.getElementById("alusta-copy");if(!b)return;b.addEventListener("click",function(){var text=b.getAttribute("data-copy-text")||"";var box=document.getElementById("alusta-prompt");var select=function(){if(box){box.focus();box.select();}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).catch(select);}else select();});})();</script>`;
  const live = muse
    ? `<div class="bubble bubble--ai"><p class="small muted">${esc(muse.mock ? MUSE_MOCK[lang] : MUSE_LIVE[lang])}</p><p>${esc(muse.text)}</p></div>`
    : `<p class="small muted">${esc(MUSE_DOWN[lang])}</p>`;
  const why = `<details class="why-more"><summary>${esc(t("Miks just see?", "Why this one?"))}</summary>${more}${stay}${table}</details>`;
  const again = `<p><a class="tap-link" href="${lang === "en" ? "/alusta?lang=en" : "/alusta"}">${esc(t("Alusta uuesti", "Start again"))}</a></p>`;
  return `<h1>${esc(headline)}</h1>${live}${lead}${start}${paid}${steps}${prompt}${why}${again}`;
}

function buttons(items: { value: string; label: string; name: string }[], go: string, secondary = false): string {
  const cls = secondary ? ` class="secondary"` : "";
  return items.map((item) => `<button type="submit"${cls} name="${esc(item.name)}" value="${esc(item.value)}">${esc(item.label)}</button>`).join("") + (go ? `<input type="hidden" name="go" value="${esc(go)}">` : "");
}

export interface AlustaOutcome {
  status: number;
  titleEt: string;
  titleEn: string;
  body: string;
  /** Set when the conversation cookie should be refreshed. Absent on 403. */
  cookie?: string;
}

function actionOf(lang: Lang): string {
  return lang === "en" ? "/alusta?lang=en" : "/alusta";
}

function page(lang: Lang, preauth: string, titles: [string, string], flow: Flow, question: string, main: string, showForm: boolean, after = "", extras?: { lead?: { side: "me" | "ai"; text: string }[]; between?: string }): AlustaOutcome {
  return {
    status: 200,
    titleEt: titles[0],
    titleEn: titles[1],
    body: alustaBody({
      lang, action: actionOf(lang), preauth, hidden: hiddenOf(flow),
      bubbles: [...(extras?.lead ?? []), ...bubblesOf(flow, lang)], question, main, showForm, after,
      between: extras?.between,
    }),
  };
}

/** A second form, when one screen has two different actions. Only the clicked submit button is posted. */
function extraForm(lang: Lang, preauth: string, flow: Flow, inner: string): string {
  const t = tr(lang);
  const hidden = Object.entries({ preauth, ...hiddenOf(flow) }).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
  const hp = `<div class="hp"><label>${esc(t("Veebileht", "Website"))}<input name="website" tabindex="-1" autocomplete="off" value=""></label></div>`;
  return `<form method="post" action="${esc(actionOf(lang))}" autocomplete="off">${hp}${hidden}${inner}</form>`;
}

export async function handleAlusta(opts: {
  method: "GET" | "POST";
  lang: Lang;
  body: Record<string, string>;
  cookie: string | null;
  ipKey: string;
  now: number;
  intake: IntakeClient | null;
  register: Pick<Arikratt, "lookup" | "search">;
}): Promise<AlustaOutcome> {
  const lang = opts.lang === "en" ? "en" : "et";
  const t = tr(lang);
  const ids = catalogById(loadCatalog());
  if (opts.method === "GET") {
    const value = mintAlusta(opts.now);
    return { ...companyPage(lang, blank(), value), cookie: value };
  }
  const conv = parseAlusta(opts.cookie);
  const given = field(opts.body, "preauth");
  if (!conv || given.length > 200 || !safeEqual(given, opts.cookie ?? "")) {
    const title = t("Alusta uuesti", "Start again");
    return {
      status: 403,
      titleEt: "Alusta uuesti",
      titleEn: "Start again",
      body: `<h1>${esc(title)}</h1><p>${esc(t("Ava alustamise leht selles brauseris uuesti. Midagi ei salvestatud.", "Open the start page in this browser again. Nothing was saved."))}</p><p><a class="btn" href="${esc(actionOf(lang))}">${esc(title)}</a></p>`,
    };
  }
  const honeypot = field(opts.body, "website").trim() !== "";
  const flow = readFlow(opts.body, ids);
  const badEnum = flow.badUses || flow.badTier || flow.badBusiness || flow.badAssistant || flow.badPlan;
  const ctx = { ...opts, cookie: conv.id, preauth: conv.id };
  if (honeypot) return { ...await renderPlan(flow.state, lang, ctx, true), cookie: conv.id };
  if (!badEnum) await applyGo(flow.state, field(opts.body, "go"), ctx, lang);
  if (flow.state.limited) {
    return {
      ...page(lang, conv.id, [LIMIT_MSG.et, LIMIT_MSG.en], blank(), "", `<p>${esc(LIMIT_MSG[lang])}</p><p><a class="tap-link" href="${esc(actionOf(lang))}">${esc(t("Alusta uuesti", "Start again"))}</a></p>`, false),
      cookie: conv.id,
    };
  }
  return { ...await screen(flow.state, lang, ctx, honeypot), cookie: conv.id };
}

function companyPage(lang: Lang, flow: Flow, preauth: string): AlustaOutcome {
  const t = tr(lang);
  const qEt = "Mis on sinu ettevõtte nimi või registrikood?";
  const qEn = "What is your company's name or registry code?";
  const q = t(qEt, qEn);
  const intro = t(
    "Kolm lühikest küsimust. Leiame su ettevõtte avalikust registrist ja soovitame, millise AI-assistendi ja ühendustega alustada. Midagi ei salvestata.",
    "Three short questions. We look your company up in the public register and suggest which AI assistant and connections to start with. Nothing is saved.",
  );
  const main = `<input id="alusta-q" name="q" maxlength="200" autocomplete="off" aria-labelledby="alusta-h"><button type="submit" name="go" value="company">${esc(t("Otsi", "Search"))}</button>`;
  return page(lang, preauth, [qEt, qEn], flow, q, main, true, "", { lead: [{ side: "ai", text: intro }] });
}

interface Read { state: Flow; badUses: boolean; badTier: boolean; badBusiness: boolean; badAssistant: boolean; badPlan: boolean; }

function readFlow(body: Record<string, string>, ids: Map<string, ServiceRecord>): Read {
  const flow = blank();
  flow.asked = clip(field(body, "asked").trim(), 200);
  const code = field(body, "code").trim();
  flow.code = code && validRegistryCode(code) ? code : "";
  flow.co = field(body, "co") === "1";
  flow.qtext = clip(field(body, "qtext"), 500);
  const got = field(body, "got");
  flow.got = got === "model" || got === "fallback" || got === "skip" ? got : "";
  flow.shown = clip(field(body, "shown"), 800);
  flow.svc = readSvc(field(body, "svc"), ids);
  flow.products = readProducts(field(body, "products"), ids);
  flow.unmatched = readUnmatched(field(body, "unmatched"));
  flow.csum = clip(field(body, "csum"), 1500);
  const usesRaw = field(body, "uses");
  const tierRaw = field(body, "tier");
  const businessRaw = field(body, "business");
  const badUses = usesRaw !== "" && parseUses(usesRaw) === null;
  const badTier = tierRaw !== "" && parseTier(tierRaw) === null;
  const badBusiness = businessRaw !== "" && parseBusiness(businessRaw) === null;
  const assistant = field(body, "assistant").trim();
  const badAssistant = assistant !== "" && !ASSISTANTS.includes(assistant);
  flow.assistant = badAssistant ? "" : assistant;
  const planRaw = field(body, "plan").trim();
  const pu = field(body, "pu") === "1";
  const badPlan = !!flow.assistant && planRaw !== "" && planRaw !== "unsure" && !knownPlan(flow.assistant, planRaw);
  flow.plan = !flow.assistant || badPlan || planRaw === "unsure" ? "" : planRaw;
  flow.pu = !!flow.assistant && pu && !badPlan;
  if (!flow.assistant) {
    const uses = badUses ? null : parseUses(usesRaw);
    if (uses === "none" || uses === "other") { flow.uses = uses; flow.pu = pu; }
  }
  if (badTier || badBusiness) { flow.pu = false; flow.plan = ""; }
  if (badUses) { flow.assistant = ""; flow.plan = ""; flow.pu = false; flow.uses = null; }
  applyDerived(flow);
  if ((badTier || badBusiness) && flow.assistant) flow.pu = false;
  applyDerived(flow);
  return { state: flow, badUses, badTier, badBusiness, badAssistant, badPlan };
}

async function applyGo(flow: Flow, go: string, opts: { ipKey: string; now: number; intake: IntakeClient | null; register: Pick<Arikratt, "lookup" | "search">; body: Record<string, string>; cookie: string | null }, lang: Lang): Promise<void> {
  const body = opts.body;
  if (go === "company") {
    const q = clip(field(body, "q").trim(), 200);
    flow.asked = q;
    if (!q) return;
    if (/^\d{8}$/.test(q) && !validRegistryCode(q)) { flow.gap = "invalid"; return; }
    if (!registerLookupOk(opts.ipKey, opts.now)) { flow.limited = true; return; }
    if (validRegistryCode(q)) {
      const r = await opts.register.lookup(q);
      if (!r.ok) { flow.gap = r.unavailable === "not_found" ? "code" : "down"; return; }
      flow.pendingFound = { company: r.company, facts: r.facts };
      return;
    }
    const r = await opts.register.search(q);
    if (!r.ok) { flow.gap = "down"; return; }
    if (!r.matches.length) { flow.gap = "name"; return; }
    flow.pendingMatches = r.matches.slice(0, 5);
    return;
  }
  if (go === "pick") {
    const picked = field(body, "picked").trim();
    if (!validRegistryCode(picked)) { flow.gap = "invalid"; return; }
    if (!registerLookupOk(opts.ipKey, opts.now)) { flow.limited = true; return; }
    const r = await opts.register.lookup(picked);
    if (!r.ok) { flow.gap = r.unavailable === "not_found" ? "code" : "down"; return; }
    flow.pendingFound = { company: r.company, facts: r.facts };
    return;
  }
  if (go === "nocompany") { flow.co = true; flow.code = ""; flow.pendingFound = undefined; flow.pendingMatches = undefined; flow.gap = undefined; return; }
  if (go === "found" && flow.code) { flow.co = true; flow.pendingFound = undefined; return; }
  if (!flow.co && go !== "skip" && go !== "programs" && go !== "fix" && go !== "assistant" && go !== "plan") return;
  if (go === "fix") { flow.got = ""; flow.shown = ""; flow.svc = []; flow.products = []; flow.unmatched = []; return; }
  if (go === "skip") { flow.co = true; flow.got = "skip"; flow.qtext = ""; flow.shown = ""; return; }
  if (go === "programs") {
    flow.co = true;
    const text = clip(field(body, "text"), 500);
    flow.qtext = text;
    if (!text.trim()) { flow.got = "skip"; flow.shown = ""; flow.svc = []; flow.unmatched = []; return; }
    await extractPrograms(flow, text, opts, lang);
    return;
  }
  if (go === "assistant") {
    flow.plan = "";
    flow.pu = false;
    const chosen = field(body, "choose").trim();
    if (chosen === "none") { flow.assistant = ""; flow.uses = "none"; flow.pu = true; applyDerived(flow); return; }
    if (chosen === "other") { flow.assistant = ""; flow.uses = "other"; flow.pu = true; applyDerived(flow); return; }
    if (!ASSISTANTS.includes(chosen)) return;
    flow.assistant = chosen;
    flow.uses = null;
    applyDerived(flow);
    return;
  }
  if (go === "plan" && flow.assistant) {
    const plan = field(body, "chooseplan").trim();
    if (flow.assistant === "gemini" && plan === "workspace") flow.assistant = "google";
    if (plan === "unsure" || plan === "") { flow.plan = ""; flow.pu = true; applyDerived(flow); return; }
    if (!knownPlan(flow.assistant, plan)) return;
    flow.plan = plan;
    flow.pu = true;
    applyDerived(flow);
  }
}

function namedFrom(hits: ProductHit[]): NamedProduct[] {
  return hits.slice(0, 8).map((hit) => ({ product: hit.product, id: hit.record?.id ?? "", via: hit.via ?? "" }));
}

async function extractPrograms(flow: Flow, text: string, opts: { intake: IntakeClient | null; ipKey: string; now: number; cookie: string | null }, lang: Lang): Promise<void> {
  const conv = parseAlusta(opts.cookie ?? null);
  let viaModel = false;
  let hits: ProductHit[] = [];
  if (opts.intake && conv && !extracted.has(conv.id) && reserveIntakeModel({ id: conv.id, ip: opts.ipKey, startedAt: conv.startedAt, now: opts.now, honeypot: false })) {
    extracted.add(conv.id);
    const result = await opts.intake.extract(text);
    if (result.ok) {
      const parsed = parseExtract(result.output);
      if (parsed) {
        const routed = routeProducts(parsed.products.map((p) => p.name), parsed.products.map((p) => p.kind));
        hits = routed.hits;
        flow.unmatched = routed.unmatched.map((n) => n.slice(0, 60)).slice(0, 8);
        viaModel = true;
      }
    }
  }
  if (!viaModel) {
    hits = productsInText(text);
    flow.unmatched = [];
  }
  flow.products = namedFrom(hits);
  const ids: string[] = [];
  for (const hit of hits) {
    const id = hit.record?.id;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length === 8) break;
  }
  flow.svc = ids;
  flow.got = viaModel ? "model" : "fallback";
  flow.shown = understood(flow.products, viaModel, lang);
}

async function screen(flow: Flow, lang: Lang, opts: { ipKey: string; now: number; intake: IntakeClient | null; register: Pick<Arikratt, "lookup" | "search">; cookie: string | null; preauth: string }, honeypot: boolean): Promise<AlustaOutcome> {
  const t = tr(lang);
  const pre = opts.preauth;
  if (flow.pendingMatches) {
    const qEt = "Milline neist on sinu ettevõte?", qEn = "Which of these is your company?";
    const picks = flow.pendingMatches.map((m) => `<button type="submit" name="picked" value="${esc(m.registry_code)}">${esc(m.name)}</button>`).join("") + `<input type="hidden" name="go" value="pick">`;
    const skip = extraForm(lang, pre, flow, `<button type="submit" class="secondary" name="go" value="nocompany">${esc(t("Jätkan ilma ettevõtteta", "Continue without a company"))}</button>`);
    return page(lang, pre, [qEt, qEn], flow, t(qEt, qEn), picks, true, skip);
  }
  if (flow.pendingFound) {
    const qEt = "Kas see on sinu ettevõte?", qEn = "Is this your company?";
    const main = foundCard(flow.pendingFound.company, flow.pendingFound.facts, lang, opts.now)
      + `<button type="submit" name="go" value="found">${esc(t("Jah, see on minu ettevõte", "Yes, this is my company"))}</button>`;
    const hold: Flow = { ...flow, code: validRegistryCode(flow.pendingFound.company.registry_code) ? flow.pendingFound.company.registry_code : "", csum: summaryLine(flow.pendingFound.company), pendingFound: undefined };
    const skip = extraForm(lang, pre, { ...hold, code: "", csum: "" }, `<button type="submit" class="secondary" name="go" value="nocompany">${esc(t("Jätkan ilma ettevõtteta", "Continue without a company"))}</button>`);
    return page(lang, pre, [qEt, qEn], hold, t(qEt, qEn), main, true, skip);
  }
  if (flow.gap) {
    const msg = flow.gap === "name"
      ? t("Nime järgi ettevõtet ei leidnud. Võid jätkata ilma ettevõtteta.", "No company was found under that name. You can continue without one.")
      : flow.gap === "code"
        ? t("Selle koodiga ettevõtet ei leidnud. Võid jätkata ilma ettevõtteta.", "No company was found with this code. You can continue without one.")
        : flow.gap === "invalid"
          ? t("See registrikood ei sobi. Võid jätkata ilma ettevõtteta.", "This registry code does not fit. You can continue without one.")
          : t("Register ei vasta praegu. Võid jätkata ilma ettevõtteta.", "The register is not answering right now. You can continue without a company.");
    const main = `<button type="submit" name="go" value="nocompany">${esc(t("Jätkan ilma ettevõtteta", "Continue without a company"))}</button>`;
    return page(lang, pre, [msg, msg], flow, msg, main, true);
  }
  if (!flow.co) return companyPage(lang, flow, pre);
  if (!flow.got) {
    const qEt = "Milliseid programme sa tööks kasutad?", qEn = "Which programs do you use for work?";
    const hint = t("Näiteks raamatupidamine, pank või e-post. Võid ka vahele jätta.", "For example accounting, a bank or e-mail. You can also skip.");
    const main = `<textarea id="alusta-text" name="text" maxlength="500" rows="4" aria-labelledby="alusta-h">${esc(flow.qtext)}</textarea><p class="small">${esc(hint)}</p><button type="submit" name="go" value="programs">${esc(t("Edasi", "Continue"))}</button><button type="submit" class="secondary" name="go" value="skip">${esc(t("Jätan vahele", "Skip"))}</button>`;
    return page(lang, pre, [qEt, qEn], flow, t(qEt, qEn), main, true);
  }
  const needsPlan = !!flow.assistant && plansFor(flow.assistant).length > 0;
  if (!flow.assistant && flow.uses !== "none" && flow.uses !== "other") {
    const qEt = "Millist AI-assistenti sa kasutad?", qEn = "Which AI assistant do you use?";
    const items = [
      ...ASSISTANTS.filter((id) => id !== "google").map((id) => ({ name: "choose", value: id, label: BRAND[id] ?? id })),
      { name: "choose", value: "other", label: t("Muu", "Other") },
      { name: "choose", value: "none", label: t("Mul pole veel", "I don't have one yet") },
    ];
    const fix = flow.shown ? `<div class="fix-form">${extraForm(lang, pre, { ...flow, got: "", shown: "", svc: [], products: [], unmatched: [] }, `<button type="submit" class="text" name="go" value="fix">${esc(t("Paranda", "Fix"))}</button>`)}</div>` : "";
    return page(lang, pre, [qEt, qEn], flow, t(qEt, qEn), buttons(items, "assistant", true), true, fix);
  }
  if (needsPlan && !flow.pu) {
    const qEt = "Milline pakett sul on?", qEn = "Which plan do you have?";
    const items = [
      ...plansFor(flow.assistant).map((row) => ({ name: "chooseplan", value: row.plan, label: planLabel(row) })),
      { name: "chooseplan", value: "unsure", label: t("Ei tea", "I don't know") },
    ];
    return page(lang, pre, [qEt, qEn], flow, t(qEt, qEn), buttons(items, "plan", true), true);
  }
  return renderPlan(flow, lang, opts, honeypot);
}

async function renderPlan(flow: Flow, lang: Lang, opts: { ipKey: string; now: number; intake: IntakeClient | null; register: Pick<Arikratt, "lookup" | "search">; cookie: string | null; preauth: string }, honeypot: boolean): Promise<AlustaOutcome> {
  const services = flow.svc.map((id) => loadCatalog().find((rec) => rec.id === id)).filter((rec): rec is ServiceRecord => !!rec);
  let company: IntakeCompany | null = null;
  let obligations: IntakeObligation[] = [];
  if (!honeypot && flow.code && registerLookupOk(opts.ipKey, opts.now)) {
    const looked = await opts.register.lookup(flow.code);
    if (looked.ok) {
      company = {
        name: looked.company.name, registry_code: flow.code,
        legal_form: looked.company.legal_form, emtak_code: looked.company.emtak_code, emtak_label: looked.company.emtak_label,
      };
      obligations = upcoming(looked.facts, opts.now).map((o) => ({ title_et: o.title_et, title_en: o.title_en, effective_due: o.effective_due }));
    }
  }
  const uses = flow.uses ?? "none";
  const productNames = flow.products.map((p) => p.product).filter((name) => name.length > 0);
  const args = {
    company, obligations, services, unmatched: flow.unmatched, uses,
    tier: flow.tier, business: flow.business,
    ...(productNames.length ? { productNames } : {}),
    ...(flow.assistant ? { current: { assistant: flow.assistant, plan: flow.plan } } : {}),
    lang,
  };
  const plan = buildIntakePlan(args);
  const conv = parseAlusta(opts.cookie);
  let muse: { text: string; mock: boolean } | null = null;
  if (!honeypot && opts.intake && conv && reserveIntakeModel({ id: conv.id, ip: opts.ipKey, startedAt: conv.startedAt, now: opts.now, honeypot: false })) {
    const result = await opts.intake.summarize(planModelInput(args));
    if (result.ok) muse = { text: result.output, mock: result.mock || opts.intake.mock };
  }
  const titles: [string, string] = plan.recommendation.recommended
    ? [planLabel(plan.recommendation.recommended), planLabel(plan.recommendation.recommended)]
    : ["Ühtegi sobivat paketti ei leitud — vaata tabelit", "No plan fits — see the table"];
  return page(lang, opts.preauth, titles, flow, "", planScreenHtml(plan, muse, lang), false);
}
