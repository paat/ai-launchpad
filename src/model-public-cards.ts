/** Shared public guidance cards (Section A).
 *
 * Cards are keyed only by a fixed job/topic/locale and the fingerprint of
 * server-known public input text. No owner, company, session or browser
 * prose ever reaches the model or the ledger. The existing reviewed
 * model-quality ledger is both the saved-result store and the single
 * spending authority; this module adds no second store, cap or retry.
 */
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import {
  ABSOLUTE_CAP_MICRO_USD, BASETEN_MODEL, ModelQualityError, ModelQualityLedger,
  PROMPT_VERSION, PROVIDER, payloadHash, runModelQualityAttempt,
  type AttemptStatus, type FetchFn,
} from "./model-quality.js";
import type { ModelJob } from "./model.js";

export type PublicLocale = "en" | "et";
export const PUBLIC_LOCALES: readonly PublicLocale[] = ["en", "et"];

export interface PublicTopic {
  id: string;
  job: ModelJob;
  label: Record<PublicLocale, string>;
  input: Record<PublicLocale, string>;
}

export const SETUP_TOPICS: readonly PublicTopic[] = [
  {
    id: "connector",
    job: "setup_guidance",
    label: { en: "Adding a connector to my assistant", et: "Ühenduse lisamine assistendile" },
    input: {
      en: "A sole trader already has a general assistant on their phone but has connected no business service yet. What is the first safe, read-only step to add a connector?",
      et: "Väikeettevõtjal on telefonis juba üldassistent, kuid ühtegi ettevõtte teenust pole veel ühendatud. Mis on esimene turvaline, ainult lugemiseks mõeldud samm ühenduse lisamiseks?",
    },
  },
  {
    id: "choose-assistant",
    job: "setup_guidance",
    label: { en: "Choosing an assistant", et: "Assistendi valimine" },
    input: {
      en: "A small-business owner has no AI assistant yet and is choosing one general assistant to start with. What is one safe, read-only first step?",
      et: "Väikeettevõtte omanikul pole veel AI-assistenti ja ta valib alustamiseks ühe üldassistendi. Mis on üks turvaline, ainult lugemiseks mõeldud esimene samm?",
    },
  },
  {
    id: "first-check",
    job: "setup_guidance",
    label: { en: "First read-only check", et: "Esimene ainult lugemiseks kontroll" },
    input: {
      en: "A small-business owner wants a first read-only check of their business admin responsibilities before changing anything. What is one safe first step?",
      et: "Väikeettevõtte omanik soovib enne millegi muutmist esimest ainult lugemiseks kontrolli oma ettevõtte halduskohustuste üle. Mis on üks turvaline esimene samm?",
    },
  },
];

export const FRICTION_TOPICS: readonly PublicTopic[] = [
  {
    id: "retyping-orders",
    job: "classify_friction",
    label: { en: "Retyping order details by hand", et: "Tellimuste käsitsi ümbertippimine" },
    input: {
      en: "A tradesperson retypes order details from messages into a spreadsheet every evening and often misses one. Classify this friction and name one read-only next step.",
      et: "Meister tippib igal õhtul tellimuste andmed sõnumitest käsitsi tabelisse ja jätab sageli mõne vahele. Liigita see käsitöö ja nimeta üks ainult lugemiseks järgmine samm.",
    },
  },
  {
    id: "copying-invoices",
    job: "classify_friction",
    label: { en: "Copying invoice details by hand", et: "Arveandmete käsitsi kopeerimine" },
    input: {
      en: "An owner copies invoice details by hand from email into a spreadsheet for about an hour each week. Classify this friction and name one read-only next step.",
      et: "Omanik kopeerib arveandmeid umbes tund aega nädalas käsitsi meilist tabelisse. Liigita see käsitöö ja nimeta üks ainult lugemiseks järgmine samm.",
    },
  },
];

/** One saved explanation per chooser reason. The rule already decided; the card only says it in plain words.
 * Inputs are fixed server text: no owner, company or browser data. Ids stay `choose-<reason>`. */
const CHOOSER_FACT_EN = "Claude: custom connector and approvals tested on the Free plan, 30 Oct 2026 (docs/live-pilot.md). ChatGPT: approvals need ChatGPT Business.";
const CHOOSER_FACT_ET = "Claude: kohandatud ühendus ja kinnitused on proovitud tasuta paketis 30.10.2026 (docs/live-pilot.md). ChatGPT: kinnitused vajavad ChatGPT Businessi.";
const CHOOSER_ASK_EN = "Write exactly 3 short plain sentences explaining what this assistant is, why it fits, and the first step. Do not use the words MCP, connector, API or OAuth. No owner data is included; use only this text.";
const CHOOSER_ASK_ET = "Kirjuta täpselt 3 lühikest lihtsat lauset: mis see assistent on, miks see sobib ja mis on esimene samm. Ära kasuta sõnu MCP, connector, API ega OAuth. Omaniku andmeid siin ei ole; kasuta ainult seda teksti.";
function chooserTopic(id: string, label: Record<PublicLocale, string>, decision: Record<PublicLocale, string>): PublicTopic {
  return {
    id, job: "setup_guidance", label,
    input: {
      en: `The rule already decided. ${decision.en} Facts: ${CHOOSER_FACT_EN} ${CHOOSER_ASK_EN}`,
      et: `Reegel on juba otsustanud. ${decision.et} Faktid: ${CHOOSER_FACT_ET} ${CHOOSER_ASK_ET}`,
    },
  };
}
export const CHOOSER_TOPICS: readonly PublicTopic[] = [
  chooserTopic("choose-already_claude", { en: "Already using Claude", et: "Juba kasutab Claude'i" }, {
    en: "Recommend Claude because this person already uses Claude.",
    et: "Soovita Claude'i, sest see inimene juba kasutab Claude'i.",
  }),
  chooserTopic("choose-chatgpt_business", { en: "ChatGPT Business", et: "ChatGPT Business" }, {
    en: "Recommend ChatGPT because this person's company pays for ChatGPT Business, so approvals work there.",
    et: "Soovita ChatGPT-d, sest selle inimese ettevõte maksab ChatGPT Businessi eest, nii et kinnitused seal töötavad.",
  }),
  chooserTopic("choose-chatgpt_no_approvals", { en: "ChatGPT without Business", et: "ChatGPT ilma Businessita" }, {
    en: "Recommend Claude. This person uses ChatGPT, but the company does not pay for ChatGPT Business or they are not sure. ChatGPT without Business can read deadlines, but approvals need ChatGPT Business. Claude's free plan does approvals. They can keep ChatGPT for other things.",
    et: "Soovita Claude'i. See inimene kasutab ChatGPT-d, aga ettevõte ei maksa ChatGPT Businessi eest või ta pole kindel. ChatGPT ilma Business paketita näeb tähtaegu, aga kinnitused vajavad ChatGPT Businessi. Claude'i tasuta pakett teeb kinnitused ära. ChatGPT võib teiste asjade jaoks alles jääda.",
  }),
  chooserTopic("choose-other_untested", { en: "Another assistant", et: "Mõni teine assistent" }, {
    en: "Recommend Claude. This person uses another assistant. Other assistants are not tested with AI Launchpad.",
    et: "Soovita Claude'i. See inimene kasutab teist assistenti. Teisi assistente ei ole AI-hüppelauaga proovitud.",
  }),
  chooserTopic("choose-none", { en: "No assistant yet", et: "Assistenti veel pole" }, {
    en: "Recommend Claude. This person has no AI assistant yet. Claude is the easiest start and works on the free plan too.",
    et: "Soovita Claude'i. Sellel inimesel pole veel AI-assistenti. Claude on lihtsaim algus ja töötab ka tasuta paketis.",
  }),
];

export const ALL_PUBLIC_TOPICS: readonly PublicTopic[] = [...SETUP_TOPICS, ...FRICTION_TOPICS, ...CHOOSER_TOPICS];

export function findTopic(topics: readonly PublicTopic[], id: unknown): PublicTopic | null {
  if (typeof id !== "string") return null;
  return topics.find((t) => t.id === id) ?? null;
}
export function parseLocale(v: unknown): PublicLocale | null {
  return v === "en" || v === "et" ? v : null;
}

/** Stable <=64-char ledger ID derived server-side from public identity only. */
export function publicCardRequestId(topic: PublicTopic, locale: PublicLocale): string {
  const fingerprint = createHash("sha256").update(topic.input[locale]).digest("hex");
  const digest = createHash("sha256")
    .update("public-card-v1").update("\0").update(topic.job).update("\0")
    .update(topic.id).update("\0").update(locale).update("\0").update(fingerprint)
    .digest("hex");
  return `pc1.${digest.slice(0, 48)}`;
}

export type PublicCardState =
  | "none" | "pending" | "blocked" | "completed" | "failed" | "uncertain"
  | "breach" | "breach_blocked" | "exhausted" | "conflict";

export interface PublicCardView {
  topicId: string;
  locale: PublicLocale;
  job: ModelJob;
  state: PublicCardState;
  /** Escaped by the view layer; never rendered as HTML. */
  output: string | null;
  /** True when this result came from the saved ledger row, not a new call. */
  replayed: boolean;
}

const LEDGER_COLUMNS = ["request_id", "payload_hash", "job", "status", "allocated_micro_usd", "input_tokens", "output_tokens", "actual_cost_micro_usd", "output", "error_code", "created_at", "updated_at"];

/** Open the exact existing reviewed ledger, refusing anything the ledger
 * constructor would otherwise initialize. ONE writable handle is opened
 * with fileMustExist (never auto-created) and its existing schema and
 * pinned metadata are validated read-only — no writes — before that SAME
 * handle is handed to the constructor, so a missing/empty/unrecognized/
 * unsafe file can never become a fresh budget; the handle is closed on
 * any validation or construction failure. Current metadata, cap and
 * prior allocations are preserved. */
export function openExistingPublicLedger(path: string): ModelQualityLedger {
  const fail = (msg: string): never => { throw new ModelQualityError("ledger_unavailable", msg); };
  if (!path || path === ":memory:") fail("Public cards require the exact existing model ledger path; refusing to initialize a new one.");
  let st;
  try { st = lstatSync(path); } catch { fail("Model ledger file is missing; refusing to create or initialize one."); }
  if (st!.isSymbolicLink()) fail("Refusing model ledger symlink.");
  if (!st!.isFile()) fail("Model ledger path is not a regular file.");
  if (st!.size === 0) fail("Model ledger file is empty; refusing to initialize it.");
  if ((st!.mode & 0o077) !== 0) fail("Refusing model ledger with group/other permissions (need 0600).");
  let db: InstanceType<typeof Database> | null = null;
  try {
    db = new Database(path, { fileMustExist: true });
    const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name));
    if (!tables.has("mq_meta") || !tables.has("mq_attempts")) fail("Model ledger schema is unrecognized; refusing to initialize it.");
    const cols = new Set((db.prepare("PRAGMA table_info(mq_attempts)").all() as { name: string }[]).map((r) => r.name));
    if (LEDGER_COLUMNS.some((c) => !cols.has(c))) fail("Model ledger attempts schema is unrecognized; refusing to use it.");
    const meta = new Map((db.prepare("SELECT key,value FROM mq_meta").all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    if (meta.get("provider") !== PROVIDER || meta.get("model") !== BASETEN_MODEL || meta.get("prompt_version") !== PROMPT_VERSION) {
      fail("Model ledger provider/model/prompt-version metadata is unrecognized; refusing to use it.");
    }
    const ceiling = Number(meta.get("ceiling_micro_usd"));
    if (!meta.has("ceiling_micro_usd") || !Number.isInteger(ceiling) || ceiling < 0 || ceiling > ABSOLUTE_CAP_MICRO_USD) {
      fail("Model ledger ceiling metadata is unrecognized; refusing to use it.");
    }
    // Pre-validated on this same handle: the constructor's CREATE IF NOT
    // EXISTS and metadata inserts are no-ops on this recognized ledger.
    const ledger = new ModelQualityLedger(db);
    db = null; // ownership transferred to the ledger
    return ledger;
  } catch (e) {
    try { db?.close(); } catch { /* closing a refused handle */ }
    if (e instanceof ModelQualityError) throw e;
    return fail("Model ledger file is unrecognized; refusing to initialize it.");
  }
}

function stateOf(status: AttemptStatus): PublicCardState {
  return status === "provider_contract_breach" ? "breach" : status;
}

export class PublicCards {
  constructor(private opts: { ledger: ModelQualityLedger; apiKey: string; fetchFn?: FetchFn }) {}

  /** Read the saved card only. Never fetches, never exposes operator or
   * arbitrary ledger rows: only the exact allowlisted public-card key
   * with a matching payload hash and job is surfaced. */
  read(topic: PublicTopic, locale: PublicLocale): PublicCardView {
    const base = { topicId: topic.id, locale, job: topic.job };
    const row = this.opts.ledger.get(publicCardRequestId(topic, locale));
    if (!row) return { ...base, state: "none", output: null, replayed: false };
    if (row.job !== topic.job || row.payload_hash !== payloadHash(topic.job, topic.input[locale])) {
      return { ...base, state: "conflict", output: null, replayed: true };
    }
    return { ...base, state: stateOf(row.status), output: row.status === "completed" ? row.output : null, replayed: true };
  }

  readFrictionCards(): PublicCardView[] {
    return FRICTION_TOPICS.flatMap((t) => PUBLIC_LOCALES.map((l) => this.read(t, l)));
  }

  /** Generate or replay one card. Repeat/concurrent use of the same card
   * replays the saved row (including pending/terminal) with no extra
   * fetch; other cards allocate independently under the global ledger. */
  async generate(topic: PublicTopic, locale: PublicLocale): Promise<PublicCardView> {
    const base = { topicId: topic.id, locale, job: topic.job };
    try {
      const r = await runModelQualityAttempt({
        job: topic.job, input: topic.input[locale],
        requestId: publicCardRequestId(topic, locale),
        ledger: this.opts.ledger, apiKey: this.opts.apiKey,
        fetchFn: this.opts.fetchFn, confirmCurrentPricing: true,
      });
      return { ...base, state: stateOf(r.status), output: r.status === "completed" ? r.output : null, replayed: r.replayed };
    } catch (e) {
      const code = e instanceof ModelQualityError ? e.code : "";
      // Pre-allocation refusals are honest card states, never retries.
      if (code === "budget_exhausted") return { ...base, state: "exhausted", output: null, replayed: false };
      if (code === "suppressed_after_breach") return { ...base, state: "breach_blocked", output: null, replayed: false };
      // Another unresolved request blocks allocation. Saved pending rows
      // replay as "pending" via the ledger replay path above; "blocked"
      // means NOT started — never a fetch, never a new row, never a retry.
      if (code === "attempt_in_flight") return { ...base, state: "blocked", output: null, replayed: false };
      if (code === "request_conflict") return { ...base, state: "conflict", output: null, replayed: true };
      throw e;
    }
  }
}
