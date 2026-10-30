/** Friction loop (Issue 20): an unmet assistant request becomes
 * owner-approved anonymous open demand.
 *
 * Identifiers are removed deterministically BEFORE storage: only the
 * de-identified text is stored and only that text (plus the blocker and
 * already-published public labels) is ever sent to a model — never owner,
 * company, workspace or session data. Classification runs out of band,
 * serially, one need at a time, after the tool response. Live mode goes
 * through the existing sole model ledger (`runModelQualityAttempt`, the
 * single spending authority); test/local mode uses a deterministic mock
 * whose output is labelled mock. Every state stays visible to the owner.
 */
import { createHash } from "node:crypto";
import type { Db } from "./db.js";
import { newId, nowIso, sha256 } from "./db.js";
import {
  BASETEN_MODEL, MAX_INPUT_BYTES, MAX_INPUT_CHARS, ModelQualityError, runModelQualityAttempt,
  type FetchFn, type ModelQualityLedger,
} from "./model-quality.js";

export const BLOCKERS = ["no_connector", "needs_owner_pin_or_signature", "portal_without_api", "not_supported_yet", "unclear"] as const;
export type Blocker = typeof BLOCKERS[number];
export const CATEGORIES = ["tax_filings", "bookkeeping", "invoicing", "banking_payments", "payroll_hr", "contracts_legal", "permits_sector", "customers_sales", "grants_tenders", "other"] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  tax_filings: "Tax filings", bookkeeping: "Bookkeeping", invoicing: "Invoicing", banking_payments: "Banking & payments",
  payroll_hr: "Payroll & HR", contracts_legal: "Contracts & legal", permits_sector: "Permits & sector rules",
  customers_sales: "Customers & sales", grants_tenders: "Grants & tenders", other: "Other",
};
export const BLOCKER_LABELS: Record<Blocker, string> = {
  no_connector: "no connector exists", needs_owner_pin_or_signature: "needs the owner's PIN or signature",
  portal_without_api: "portal without an API", not_supported_yet: "not supported yet", unclear: "unclear",
};
// Owner-facing Estonian copy (issue #21). Static maps: never model output.
export const BLOCKER_LABELS_ET: Record<Blocker, string> = {
  no_connector: "ühendust pole", needs_owner_pin_or_signature: "vajab sinu Smart-ID-d või allkirja",
  portal_without_api: "portaalil pole liidest", not_supported_yet: "seda veel ei toetata", unclear: "soov jäi ebaselgeks",
};
/** "Mida assistent saab teha": what the assistant can still take off the owner, per blocker. */
export const BLOCKER_HANDOFF: Record<Blocker, { et: string; en: string }> = {
  needs_owner_pin_or_signature: { et: "valmistab kõik ette; PIN-i või allkirja annad sina", en: "prepares everything; you give the PIN or signature" },
  portal_without_api: { et: "valmistab andmed ette; sisestad portaali sina", en: "prepares the data; you enter it in the portal" },
  no_connector: { et: "ei saa veel; ühendust pole", en: "can't yet; there is no connection" },
  not_supported_yet: { et: "ei saa veel; ühendust pole", en: "can't yet; there is no connection" },
  unclear: { et: "küsib sinult, mida täpselt vaja on", en: "asks you what exactly you need" },
};
export const CATEGORY_LABELS_ET: Record<Category, string> = {
  tax_filings: "Maksudeklaratsioonid", bookkeeping: "Raamatupidamine", invoicing: "Arveldus", banking_payments: "Pank ja maksed",
  payroll_hr: "Palk ja personal", contracts_legal: "Lepingud ja õigus", permits_sector: "Load ja valdkonna nõuded",
  customers_sales: "Kliendid ja müük", grants_tenders: "Toetused ja hanked", other: "Muu",
};

export const MAX_NEED_CHARS = 600;
export const MAX_JOB_HINT_CHARS = 120;
export const OWNER_DAILY_NEEDS = 20;
export const OWNER_TOTAL_NEEDS = 200;
export const OWNER_DAILY_CLASSIFICATIONS = 10;
export const MAX_EXISTING_LABELS = 30;
const DAY_MS = 86_400_000;
/** Deferred needs (daily limit, another attempt in flight) are retried this often. */
export const UNMET_NEED_RECHECK_MS = 10 * 60_000;
export const UNMET_NEED_NEXT = "Launchpad will de-identify and classify this need; the owner decides on the Status page whether to publish it as anonymous open demand.";

// --- deterministic de-identification -------------------------------------

const NUM = String.raw`\d+(?:[ .,  –-]\d+)*`;
/** Digit groups joined by a space, dot, dash or slash. */
const SEP = String.raw`(?: ?[./-] ?| )`;
/** Legal forms: the Ü forms and FIE in any case; AS and SA only in capitals
 * ("as" and "sa" are ordinary English and Estonian words). */
const anyCase = (w: string) => [...w].map((c) => `[${c}${c.toLowerCase()}]`).join("");
const LEGAL = String.raw`(?:${["MTÜ", "OÜ", "UÜ", "TÜ", "KÜ", "FIE"].map(anyCase).join("|")}|AS|SA)(?![\p{L}\p{N}])`;
/** Words that start a sentence part, never a company name (either case
 * of the first letter). */
const NOT_NAME = String.raw`(?:${["a", "an", "the", "and", "or", "of", "to", "for", "from", "with", "by", "at", "on", "in", "into", "via", "as", "is", "my", "our", "your", "their", "this", "that", "ja", "ning", "või", "ka", "et", "kui", "minu", "meie", "see", "selle"].map((w) => `[${w[0]}${w[0].toUpperCase()}]${w.slice(1)}`).join("|")})[\s,]`;
/** One word of a company name; `CAP` a capitalised one. */
const WORD = String.raw`[\p{L}\p{N}&'.-]*`;
const CAP = String.raw`\p{Lu}${WORD}`;
const digitCount = (m: string) => m.replace(/\D/g, "").length;
/** Ordered: earlier, more specific rules win (an e-mail is never re-read
 * as a domain, an IBAN or phone never as a digit run). Placeholders
 * contain no digits, '@' or dots, so the function is idempotent. */
const RULES: readonly [RegExp, string | ((m: string) => string)][] = [
  [/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu, "[email]"],
  [/(?:https?:\/\/|www\.)[^\s<>"']+/giu, "[url]"],
  // Bare domains on any alphabetic TLD (2–24 letters, one case): "e.g.",
  // "etc." and version strings have no such TLD; "end.Next" is mixed case.
  [/(?<![\p{L}\p{N}.@-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:[a-z]{2,24}|[A-Z]{2,24})(?![\p{L}\p{N}-]|\.[\p{L}\p{N}])(?:\/[^\s<>"']*)?/gu, "[url]"],
  [/(?<![\p{L}\p{N}])[A-Za-z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?(?![\p{L}\p{N}])/gu, "[iban]"],
  [/(?<![\p{L}\p{N}+])(?:\+|00)\d[\d ()-]{5,18}\d/gu, "[phone]"],
  [new RegExp(String.raw`(?:[€$£]|(?<![\p{L}])(?:EUR|USD|GBP)(?![\p{L}]))\s?${NUM}|${NUM}\s?(?:[€$£]|(?:EUR|USD|GBP|eurot?|euros?)(?![\p{L}]))`, "giu"), "[amount]"],
  // Legal form first ("OÜ Näidis Ehitus"): capitalised names after it, not
  // a function word and without a sentence-final dot. Then capitalised
  // names before it, then names in any case not starting at a function
  // word; a comma may precede the form ("Demo Supplier, OÜ").
  [new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${CAP}\s+){0,4}${LEGAL}\s+(?!${NOT_NAME})\p{Lu}[\p{L}\p{N}&'-]*(?:\s+\p{Lu}[\p{L}\p{N}&'-]*){0,3}`, "gu"), "[company]"],
  [new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${CAP}\s+){0,3}${CAP},?\s+${LEGAL}`, "gu"), "[company]"],
  [new RegExp(String.raw`(?<![\p{L}\p{N}])(?:(?!${NOT_NAME})\p{L}${WORD}\s+){0,3}(?!${NOT_NAME})\p{L}${WORD},?\s+${LEGAL}`, "gu"), "[company]"],
  [/(?<!\p{N})\d(?:[ -]?\d){12,18}(?!\p{N})/gu, "[card]"],
  [/(?<!\p{N})[1-6]\d{10}(?!\p{N})/gu, "[personal_code]"],
  [new RegExp(String.raw`(?<!\p{N}${SEP}?)(?:5\d{6,7}|[3-8]\d{2,3}[ -]\d{4})(?!${SEP}?\p{N})`, "gu"), "[phone]"],
  [/(?<!\p{N})\d{8}(?!\p{N})/gu, "[registry_code]"],
  [new RegExp(String.raw`(?<!\p{N})\d+(?:${SEP}\d+)+`, "gu"), (m) => digitCount(m) >= 7 ? "[number]" : m],
  [/\d{5,}/gu, "[number]"],
];

/** Pure: replace e-mail addresses, URLs/domains, IBANs, phone numbers,
 * money amounts, company names with an Estonian legal form, card-like
 * digit runs, personal codes (11 digits), registry codes (8 digits) and
 * other long digit runs (also split into groups) with typed placeholders.
 * Names without a legal form are not detectable here; the tool asks the
 * assistant to omit them and the owner reviews everything before
 * publishing. */
export function deidentify(text: string): string {
  let out = text;
  for (const [re, placeholder] of RULES) out = typeof placeholder === "string" ? out.replace(re, placeholder) : out.replace(re, placeholder);
  return out;
}

/** Control characters and lone surrogates become spaces; whitespace collapses. */
export const cleanText = (s: string) => s.replace(/[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();

// --- intake ---------------------------------------------------------------

export interface UnmetNeedArgs { report_id: string; need: string; blocker: Blocker; job_hint?: string }
export type IntakeResult = { receipt: Record<string, unknown>; created: boolean } | { error: string };

export function recordUnmetNeed(db: Db, ownerId: string, args: UnmetNeedArgs): IntakeResult {
  const need = deidentify(cleanText(args.need));
  const hint = args.job_hint === undefined ? null : deidentify(cleanText(args.job_hint)) || null;
  // Over the de-identified fields only: the raw text is never stored, not even hashed.
  const hash = sha256(JSON.stringify([args.report_id, need, args.blocker, hint]));
  const receipt = (id: string) => ({ need_id: id, state: "received", next: UNMET_NEED_NEXT });
  const prior = db.prepare("SELECT id,payload_hash FROM unmet_needs WHERE owner_id=? AND report_id=?").get(ownerId, args.report_id) as { id: string; payload_hash: string } | undefined;
  if (prior) return prior.payload_hash === hash ? { receipt: receipt(prior.id), created: false } : { error: "Conflict: report_id already used with a different payload." };
  const total = (db.prepare("SELECT count(*) n FROM unmet_needs WHERE owner_id=?").get(ownerId) as { n: number }).n;
  if (total >= OWNER_TOTAL_NEEDS) return { error: `Unmet-need storage limit reached (${OWNER_TOTAL_NEEDS}). Export and delete progress before starting again. Nothing was saved.` };
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const recent = (db.prepare("SELECT count(*) n FROM unmet_needs WHERE owner_id=? AND created_at>=?").get(ownerId, since) as { n: number }).n;
  if (recent >= OWNER_DAILY_NEEDS) return { error: `Unmet-need daily limit reached (${OWNER_DAILY_NEEDS} per day). Retry tomorrow with the same report_id. Nothing was saved.` };
  if (!need) return { error: "need must describe the job in words. Nothing was saved." };
  if (need.length > MAX_NEED_CHARS) return { error: `need is longer than ${MAX_NEED_CHARS} characters after identifiers were replaced. Describe it more briefly. Nothing was saved.` };
  if (hint && hint.length > MAX_JOB_HINT_CHARS) return { error: `job_hint is longer than ${MAX_JOB_HINT_CHARS} characters after identifiers were replaced. Nothing was saved.` };
  const id = newId("need");
  const now = nowIso();
  db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,job_hint_redacted,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'received',?,?)")
    .run(id, ownerId, args.report_id, hash, need, args.blocker, hint, now, now);
  return { receipt: receipt(id), created: true };
}

// --- model input and strict output validation ----------------------------

export const normalizeLabel = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const utf8Bytes = (s: string) => new TextEncoder().encode(s).byteLength;
const fits = (s: string) => s.length <= MAX_INPUT_CHARS && utf8Bytes(s) <= MAX_INPUT_BYTES;

/** The model input: the de-identified need, the blocker and at most 30
 * already-published public labels — as many as fit the ledger's input
 * bound. Nothing else. */
export function buildModelInput(needRedacted: string, blocker: Blocker, publishedLabels: readonly string[]): string {
  const make = (labels: string[]) => JSON.stringify({ need: needRedacted, blocker, existing_labels: labels });
  const chosen: string[] = [];
  for (const label of publishedLabels.slice(0, MAX_EXISTING_LABELS)) {
    if (!fits(make([...chosen, label]))) break;
    chosen.push(label);
  }
  return make(chosen);
}

export interface Classification { category: Category; demand_label: string; same_as: string | null; spec: string }
export type ParseResult = { ok: true; value: Classification } | { ok: false; reason: "invalid_output" | "identifiers_in_output" };

const singleLine = (v: unknown, min: number, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max && !/[\p{Cc}\p{Cs}]/u.test(t) ? t : null;
};

/** Strict: exactly one JSON object (an optional single ```json fence is
 * tolerated) with exactly the four keys, a fixed category, bounded
 * single-line strings and `same_as` from the given labels only. Output
 * with any digit in label or spec (the prompt contract), or that
 * de-identification would change, is rejected, never repaired. */
export function parseClassification(text: string, existingLabels: readonly string[]): ParseResult {
  const invalid: ParseResult = { ok: false, reason: "invalid_output" };
  const body = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/, "$1");
  let v: unknown;
  try { v = JSON.parse(body); } catch { return invalid; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return invalid;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== "category,demand_label,same_as,spec") return invalid;
  if (!CATEGORIES.includes(o.category as Category)) return invalid;
  const label = singleLine(o.demand_label, 3, 80);
  const spec = singleLine(o.spec, 10, 200);
  if (!label || !spec) return invalid;
  let sameAs: string | null = null;
  if (o.same_as !== null) {
    if (typeof o.same_as !== "string") return invalid;
    sameAs = existingLabels.find((l) => normalizeLabel(l) === normalizeLabel(o.same_as as string)) ?? null;
    if (!sameAs) return invalid;
  }
  if (/\p{N}/u.test(label + spec) || deidentify(label) !== label || deidentify(spec) !== spec) return { ok: false, reason: "identifiers_in_output" };
  return { ok: true, value: { category: o.category as Category, demand_label: label, same_as: sameAs, spec } };
}

// --- classifiers ----------------------------------------------------------

export type ClassifyOutcome = { kind: "text"; text: string } | { kind: "failed"; reason: string } | { kind: "deferred"; reason: string };
export interface NeedClassifier { readonly by: "mock" | typeof BASETEN_MODEL; classify(needId: string, input: string): Promise<ClassifyOutcome> }

/** Stable ledger request ID derived server-side from the need ID only. */
export const unmetNeedRequestId = (needId: string) => `un1.${createHash("sha256").update(needId).digest("hex").slice(0, 48)}`;

const MOCK_KEYWORDS: [Category, RegExp][] = [
  ["tax_filings", /vat|tax|käibemaks|maks|tsd|emta|declaration|deklaratsioon/i],
  ["payroll_hr", /payroll|salary|palk|employee|töötaja|töötamise/i],
  ["invoicing", /invoice|arve/i],
  ["banking_payments", /bank|pank|payment|makse|transfer/i],
  ["bookkeeping", /bookkeep|raamatupida|accounting|ledger|annual report|aastaaruanne/i],
  ["contracts_legal", /contract|leping|legal|gdpr|isikuandme/i],
  ["permits_sector", /permit|licen[cs]e|luba|registreering/i],
  ["grants_tenders", /grant|toetus|tender|hange/i],
  ["customers_sales", /customer|klient|sales|müük|order|tellimus/i],
];

/** Deterministic local/test classifier. Its spec says it is a mock and
 * every stored row records `classified_by = "mock"`. */
export const mockClassifier: NeedClassifier = {
  by: "mock",
  async classify(_needId, input) {
    const { need, blocker, existing_labels } = JSON.parse(input) as { need: string; blocker: Blocker; existing_labels: string[] };
    const category = MOCK_KEYWORDS.find(([, re]) => re.test(need))?.[0] ?? "other";
    const label = `${CATEGORY_LABELS[category]}: ${BLOCKER_LABELS[blocker]}`;
    const same = existing_labels.find((l) => normalizeLabel(l) === normalizeLabel(label)) ?? null;
    const spec = `Mock classification (deterministic fixture, not a model): a service for ${CATEGORY_LABELS[category].toLowerCase()} where today's blocker is: ${BLOCKER_LABELS[blocker]}.`;
    return { kind: "text", text: JSON.stringify({ category, demand_label: label, same_as: same, spec }) };
  },
};

/** Live Meta classifier through the existing ledger only. Ledger refusals
 * map to honest states: in-flight defers (nothing started), the rest are
 * terminal and never retried automatically. */
export function liveClassifier(opts: { ledger: ModelQualityLedger; apiKey: string; fetchFn?: FetchFn }): NeedClassifier {
  return {
    by: BASETEN_MODEL,
    async classify(needId, input) {
      try {
        const r = await runModelQualityAttempt({
          job: "classify_unmet_need", input, requestId: unmetNeedRequestId(needId),
          ledger: opts.ledger, apiKey: opts.apiKey, fetchFn: opts.fetchFn, confirmCurrentPricing: true,
        });
        if (r.status === "completed" && r.output) return { kind: "text", text: r.output };
        // A replayed pending row is an earlier attempt that never finished.
        if (r.status === "pending") return { kind: "failed", reason: "interrupted" };
        return { kind: "failed", reason: r.status === "provider_contract_breach" ? "provider_contract_breach" : r.status === "uncertain" ? "provider_uncertain" : "provider_failed" };
      } catch (e) {
        const code = e instanceof ModelQualityError ? e.code : "";
        if (code === "attempt_in_flight") return { kind: "deferred", reason: "attempt_in_flight" };
        if (code === "budget_exhausted" || code === "suppressed_after_breach" || code === "request_conflict") return { kind: "failed", reason: code };
        return { kind: "failed", reason: "unavailable" };
      }
    },
  };
}

// --- serial out-of-band queue --------------------------------------------

interface NeedRow { id: string; owner_id: string; state: string; reason: string | null; need_redacted: string; blocker: Blocker; model_input: string | null }
export type ActivityLog = (ownerId: string, action: string, outcome: string, summary: string) => void;
export const classifiedByLabel = (by: string | null) => by === BASETEN_MODEL ? `Meta ${BASETEN_MODEL} (live)` : by === "mock" ? "local mock (not a model)" : "unknown";

export class UnmetNeedQueue {
  private running: Promise<void> | null = null;
  private again = false;
  /** `classifier` null = classification unavailable in this mode. */
  constructor(private db: Db, private classifier: NeedClassifier | null, private log: ActivityLog) {}

  /** Never blocks or throws: work starts on a later tick. */
  kick(): void {
    if (this.running) { this.again = true; return; }
    this.running = new Promise<void>((ok) => setImmediate(ok))
      .then(() => this.drain())
      .catch(() => { /* a failed pass leaves rows visible in their current state */ })
      .finally(() => {
        this.running = null;
        if (this.again) { this.again = false; this.kick(); }
      });
  }

  /** Resolves when no pass is running (tests and shutdown). */
  async idle(): Promise<void> { while (this.running) await this.running; }

  private set(id: string, from: string, patch: Record<string, string | null>): boolean {
    const keys = Object.keys(patch);
    const sql = `UPDATE unmet_needs SET ${keys.map((k) => `${k}=?`).join(",")}, updated_at=? WHERE id=? AND state=?`;
    return this.db.prepare(sql).run(...keys.map((k) => patch[k]), nowIso(), id, from).changes === 1;
  }

  private async drain(): Promise<void> {
    const skipped = new Set<string>();
    for (;;) {
      const rows = this.db.prepare("SELECT id,owner_id,state,reason,need_redacted,blocker,model_input FROM unmet_needs WHERE state IN ('received','classifying') ORDER BY created_at, rowid").all() as NeedRow[];
      const row = rows.find((r) => !skipped.has(r.id));
      if (!row) return;
      skipped.add(row.id);
      if (!this.classifier) {
        if (row.state === "received" && row.reason !== "classification_unavailable") this.set(row.id, "received", { reason: "classification_unavailable" });
        // An interrupted row keeps its saved input, so a later classifier replays the ledger.
        if (row.state === "classifying") this.set(row.id, "classifying", { state: "received", reason: "classification_unavailable", classify_started_at: null });
        continue;
      }
      let input = row.model_input;
      if (row.state === "received") {
        const since = new Date(Date.now() - DAY_MS).toISOString();
        const used = (this.db.prepare("SELECT count(*) n FROM unmet_needs WHERE owner_id=? AND classify_started_at>=?").get(row.owner_id, since) as { n: number }).n;
        if (used >= OWNER_DAILY_CLASSIFICATIONS) {
          if (row.reason !== "owner_daily_limit" && this.set(row.id, "received", { reason: "owner_daily_limit" })) {
            this.log(row.owner_id, "unmet_need_classification", "deferred", `Daily classification limit (${OWNER_DAILY_CLASSIFICATIONS}) reached; this need waits. No model call was made for it.`);
          }
          continue;
        }
        input = input ?? buildModelInput(row.need_redacted, row.blocker, publishedLabels(this.db));
        if (!fits(input)) { this.failed(row, "received", "input_too_large"); continue; }
        if (!this.set(row.id, "received", { state: "classifying", reason: null, model_input: input, classify_started_at: nowIso() })) continue;
      }
      // A 'classifying' row found here was interrupted by a restart: its
      // saved input and request ID replay the ledger, never a second call.
      if (!input) { this.failed(row, "classifying", "interrupted"); continue; }
      let outcome: ClassifyOutcome;
      try { outcome = await this.classifier.classify(row.id, input); } catch { outcome = { kind: "failed", reason: "unavailable" }; }
      this.finish(row, outcome, input);
      // Another unresolved ledger attempt blocks every need alike.
      if (outcome.kind === "deferred") return;
    }
  }

  private finish(row: NeedRow, outcome: ClassifyOutcome, input: string): void {
    const by = this.classifier!.by;
    if (outcome.kind === "deferred") {
      if (this.set(row.id, "classifying", { state: "received", reason: outcome.reason, classify_started_at: null }) && row.reason !== outcome.reason) {
        this.log(row.owner_id, "unmet_need_classification", "deferred", "Another model request is unresolved, so classification has not started. No model call was made for this need.");
      }
      return;
    }
    const parsed: ParseResult | null = outcome.kind === "text" ? parseClassification(outcome.text, (JSON.parse(input) as { existing_labels: string[] }).existing_labels) : null;
    if (parsed?.ok) {
      const c = parsed.value;
      if (this.set(row.id, "classifying", { state: "classified", reason: null, category: c.category, demand_label: c.demand_label, same_as: c.same_as, spec: c.spec, classified_by: by })) {
        this.log(row.owner_id, "unmet_need_classified", "ok", `Need classified as ${c.category} by ${classifiedByLabel(by)}; waiting for your publish decision on the Status page.`);
      }
      return;
    }
    this.failed(row, "classifying", parsed ? parsed.reason : (outcome as { reason: string }).reason);
  }

  private failed(row: NeedRow, from: string, reason: string): void {
    if (this.set(row.id, from, { state: "classification_failed", reason, classified_by: from === "classifying" ? this.classifier!.by : null })) {
      this.log(row.owner_id, "unmet_need_classification", "failed", `Classification failed (${reason}). It is not retried automatically and nothing was published.`);
    }
  }
}

// --- owner decisions and public aggregation ------------------------------

export type Decision = "publish" | "keep_private";
export function decideNeed(db: Db, ownerId: string, needId: string, decision: Decision): "ok" | "not_found" | "not_awaiting" {
  const next = decision === "publish" ? "published" : "kept_private";
  const now = nowIso();
  const r = db.prepare("UPDATE unmet_needs SET state=?, decided_at=?, updated_at=? WHERE id=? AND owner_id=? AND state='classified'").run(next, now, now, needId, ownerId);
  if (r.changes === 1) return "ok";
  return db.prepare("SELECT 1 FROM unmet_needs WHERE id=? AND owner_id=?").get(needId, ownerId) ? "not_awaiting" : "not_found";
}

export interface OwnerNeed { id: string; state: string; reason: string | null; need_redacted: string; blocker: string; job_hint_redacted: string | null; category: string | null; demand_label: string | null; same_as: string | null; spec: string | null; classified_by: string | null; created_at: string }
export function ownerNeeds(db: Db, ownerId: string): OwnerNeed[] {
  return db.prepare("SELECT id,state,reason,need_redacted,blocker,job_hint_redacted,category,demand_label,same_as,spec,classified_by,created_at FROM unmet_needs WHERE owner_id=? ORDER BY created_at DESC, rowid DESC").all(ownerId) as OwnerNeed[];
}

export interface DemandItem { label: string; count: number; category: Category; spec: string; firstSeen: string; lastSeen: string; live: number; mock: number }

/** Public aggregate of published needs only. Reads exactly the published
 * classification columns plus the report month — never owner, company,
 * workspace, report or need text. Grouped by `same_as` or the normalized
 * label; sorted by count. */
export function aggregateDemand(db: Db): DemandItem[] {
  const rows = db.prepare("SELECT category,demand_label,same_as,spec,classified_by,substr(created_at,1,7) month FROM unmet_needs WHERE state='published' ORDER BY decided_at, rowid").all() as { category: Category; demand_label: string; same_as: string | null; spec: string; classified_by: string; month: string }[];
  const groups = new Map<string, DemandItem & { cats: Map<Category, number> }>();
  for (const r of rows) {
    const label = r.same_as ?? r.demand_label;
    const key = normalizeLabel(label);
    let g = groups.get(key);
    if (!g) { g = { label, count: 0, category: r.category, spec: r.spec, firstSeen: r.month, lastSeen: r.month, live: 0, mock: 0, cats: new Map() }; groups.set(key, g); }
    g.count++;
    g.cats.set(r.category, (g.cats.get(r.category) ?? 0) + 1);
    if (r.month < g.firstSeen) g.firstSeen = r.month;
    if (r.month > g.lastSeen) g.lastSeen = r.month;
    if (r.classified_by === BASETEN_MODEL) g.live++; else g.mock++;
  }
  return [...groups.values()].map(({ cats, ...g }) => ({ ...g, category: [...cats.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen) || a.label.localeCompare(b.label));
}

export const publishedLabels = (db: Db) => aggregateDemand(db).map((d) => d.label).slice(0, MAX_EXISTING_LABELS);
