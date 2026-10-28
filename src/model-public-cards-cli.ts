/** One-shot operator batch for ONE fixed public friction card.
 *
 * Dry by default: no key read, no network, no ledger opened. An explicit
 * --live invocation precomputes one allowlisted friction card into the
 * exact existing reviewed ledger; the playbook view then displays that
 * saved card and never calls the model to render. No scheduler, queue
 * or startup batch. Run: node dist/model-public-cards-cli.js ... (compiled, no tsx), or via the thin scripts/model-public-cards.ts developer wrapper
 */
import { pathToFileURL } from "node:url";
import {
  FRICTION_TOPICS, PublicCards, findTopic, openExistingPublicLedger,
  parseLocale, publicCardRequestId, type PublicLocale,
} from "./model-public-cards.js";
import { BASETEN_MODEL, PRICING_AS_OF, type FetchFn } from "./model-quality.js";

export interface BatchArgs { live: boolean; confirmPricing: boolean; topicId: string | null; locale: PublicLocale; ledgerPath: string | null; list: boolean; }

export function parseArgs(argv: string[]): BatchArgs {
  const out: BatchArgs = { live: false, confirmPricing: false, topicId: null, locale: "en", ledgerPath: null, list: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (seen.has(a)) throw new Error(`Duplicate argument ${a} (at most one card per invocation).`);
    seen.add(a);
    if (a === "--live") out.live = true;
    else if (a === "--confirm-current-pricing") out.confirmPricing = true;
    else if (a === "--list-topics") out.list = true;
    else if (a === "--topic") { out.topicId = argv[++i] ?? null; if (!out.topicId) throw new Error("--topic needs a value."); }
    else if (a === "--locale") {
      const v = parseLocale(argv[++i]);
      if (!v) throw new Error("--locale must be en or et.");
      out.locale = v;
    } else if (a === "--ledger") { out.ledgerPath = argv[++i] ?? null; if (!out.ledgerPath) throw new Error("--ledger needs a value."); }
    else throw new Error(`Unknown argument ${a}. Arbitrary prompts are not accepted; use --topic.`);
  }
  return out;
}

/** Deps are test injections only; the CLI supplies real env/fetch. */
export async function main(argv = process.argv.slice(2), deps: { env?: NodeJS.ProcessEnv; fetchFn?: FetchFn } = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const args = parseArgs(argv);
  if (args.list) { console.log(FRICTION_TOPICS.map((t) => t.id).join("\n")); return 0; }
  const topic = findTopic(FRICTION_TOPICS, args.topicId);
  if (!topic) {
    console.error(`--topic must be one of: ${FRICTION_TOPICS.map((t) => t.id).join(", ")}`);
    return 2;
  }
  if (!args.live) {
    // Dry: deliberately does not read BASETEN_API_KEY, network or ledger.
    console.log(JSON.stringify({
      dry: true, mock: true, topic: topic.id, locale: args.locale, job: topic.job,
      model: BASETEN_MODEL, requestId: publicCardRequestId(topic, args.locale),
      output: "DRY RUN (mock, synthetic): no model was called and no ledger was opened; this text is not model output. Pass --live with --ledger and pricing confirmation for one bounded precompute.",
    }, null, 2));
    return 0;
  }
  const ledgerPath = args.ledgerPath ?? env.LAUNCHPAD_MODEL_LEDGER_PATH;
  if (!ledgerPath) { console.error("--live requires --ledger <path> or LAUNCHPAD_MODEL_LEDGER_PATH (the exact existing reviewed ledger)."); return 2; }
  if (!args.confirmPricing && env.LAUNCHPAD_MODEL_PRICING_CONFIRMED !== "1") {
    console.error(`--live requires --confirm-current-pricing or LAUNCHPAD_MODEL_PRICING_CONFIRMED=1 (pinned rates as of ${PRICING_AS_OF}; recheck published pricing/credits first).`);
    return 2;
  }
  const apiKey = env.BASETEN_API_KEY;
  if (!apiKey) { console.error("BASETEN_API_KEY is not configured."); return 2; }
  const ledger = openExistingPublicLedger(ledgerPath);
  try {
    const cards = new PublicCards({ ledger, apiKey, fetchFn: deps.fetchFn });
    const card = await cards.generate(topic, args.locale);
    console.log(JSON.stringify({
      dry: false, mock: false, topic: card.topicId, locale: card.locale, job: card.job,
      model: BASETEN_MODEL, requestId: publicCardRequestId(topic, args.locale),
      state: card.state, replayed: card.replayed, output: card.output,
    }, null, 2));
    return card.state === "completed" ? 0 : 1;
  } finally { ledger.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, (e: unknown) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exitCode = 1;
  });
}
