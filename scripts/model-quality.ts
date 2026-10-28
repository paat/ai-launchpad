/** Synthetic Baseten quality harness CLI. Default is a dry/mock run: no key
 * access, no network, no ledger. Live mode needs --live, an explicit
 * private ledger path (the root-chosen single ledger reused for all
 * calls), a request ID, one fixed synthetic case, and
 * --confirm-current-pricing. Run: npx tsx scripts/model-quality.ts ... */
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ModelQualityLedger, runModelQualityAttempt, validateRequestId,
  BASETEN_MODEL, PRICING_AS_OF, type ModelJob,
} from "../src/model-quality.js";

export const SYNTHETIC_CASES: Record<string, { job: ModelJob; input: string }> = {
  "en-connector-help": {
    job: "setup_guidance",
    input: "Synthetic case: a sole trader already has a general assistant on their phone but has connected no business service yet. What is the first safe step to add a connector?",
  },
  "et-connector-help": {
    job: "setup_guidance",
    input: "Sünteetiline juhtum: väikeettevõtjal on telefonis juba üldassistent, kuid ühtegi ettevõtte teenust pole veel ühendatud. Mis on esimene turvaline samm ühenduse lisamiseks?",
  },
  "manual-work-next-step": {
    job: "setup_guidance",
    input: "Synthetic case: an owner says copying invoice details by hand takes an hour each week. Suggest one read-only first step to identify the manual work worth removing first.",
  },
  "friction-classification": {
    job: "classify_friction",
    input: "Synthetic case: a tradesperson retypes order details from messages into a spreadsheet every evening and often misses one. Classify this friction and name one read-only next step.",
  },
};

export interface CliArgs { live: boolean; confirmPricing: boolean; caseId: string | null; requestId: string | null; ledgerPath: string | null; list: boolean; }

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { live: false, confirmPricing: false, caseId: null, requestId: null, ledgerPath: null, list: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (seen.has(a)) throw new Error(`Duplicate argument ${a} (at most one case per invocation).`);
    seen.add(a);
    if (a === "--live") out.live = true;
    else if (a === "--confirm-current-pricing") out.confirmPricing = true;
    else if (a === "--list-cases") out.list = true;
    else if (a === "--case") { out.caseId = argv[++i] ?? null; if (!out.caseId) throw new Error("--case needs a value."); }
    else if (a === "--request-id") { out.requestId = argv[++i] ?? null; if (!out.requestId) throw new Error("--request-id needs a value."); }
    else if (a === "--ledger") { out.ledgerPath = argv[++i] ?? null; if (!out.ledgerPath) throw new Error("--ledger needs a value."); }
    else throw new Error(`Unknown argument ${a}. Arbitrary prompts are not accepted; use --case.`);
  }
  return out;
}

function ensureSecureLedger(path: string): void {
  if (existsSync(path)) {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) throw new Error("Refusing ledger symlink.");
    if (!st.isFile()) throw new Error("Ledger path is not a regular file.");
    if ((st.mode & 0o077) !== 0) throw new Error("Refusing existing ledger with group/other permissions (need 0600).");
    return;
  }
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  closeSync(openSync(path, "wx", 0o600));
  chmodSync(path, 0o600);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  if (args.list) { console.log(Object.keys(SYNTHETIC_CASES).join("\n")); return 0; }
  if (!args.caseId || !(args.caseId in SYNTHETIC_CASES)) {
    console.error(`--case must be one of: ${Object.keys(SYNTHETIC_CASES).join(", ")}`);
    return 2;
  }
  const c = SYNTHETIC_CASES[args.caseId];
  if (!args.live) {
    // Dry/mock: deliberately does not read BASETEN_API_KEY, network or ledger.
    console.log(JSON.stringify({
      case: args.caseId, job: c.job, provider: "dry-run-no-provider", mock: true,
      model: BASETEN_MODEL, allocatedMicroUsd: 0, actualCostMicroUsd: null, usage: null,
      output: "DRY RUN (mock, synthetic): no model was called; this text is not model output. Pass --live with --ledger, --request-id and --confirm-current-pricing for one bounded live case.",
    }, null, 2));
    return 0;
  }
  if (!args.ledgerPath) { console.error("--live requires an explicit private --ledger <path>."); return 2; }
  if (!args.requestId) { console.error("--live requires --request-id <id>."); return 2; }
  if (!args.confirmPricing) { console.error(`--live requires --confirm-current-pricing (pinned rates as of ${PRICING_AS_OF}; recheck published pricing/credits first).`); return 2; }
  validateRequestId(args.requestId);
  if (!process.env.BASETEN_API_KEY) { console.error("BASETEN_API_KEY is not configured."); return 2; }
  ensureSecureLedger(args.ledgerPath);
  const ledger = ModelQualityLedger.open(args.ledgerPath);
  try {
    const result = await runModelQualityAttempt({
      job: c.job, input: c.input, requestId: args.requestId, ledger,
      apiKey: process.env.BASETEN_API_KEY, confirmCurrentPricing: true,
    });
    console.log(JSON.stringify({
      case: args.caseId, job: result.job, provider: result.provider, model: result.model, mock: result.mock,
      status: result.status, replayed: result.replayed, errorCode: result.errorCode,
      allocatedMicroUsd: result.allocatedMicroUsd, allocationNote: "allocated maximum per attempt, not actual spend",
      actualCostMicroUsd: result.actualCostMicroUsd,
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      output: result.output,
    }, null, 2));
    return result.status === "completed" ? 0 : 1;
  } finally { ledger.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, (e: unknown) => {
    console.error(e instanceof Error ? e.message : "failed");
    process.exitCode = 1;
  });
}
