/** Fixed jobs only. No generic completion proxy, no caller-chosen URL/model.
 * Live inference is HARD-DISABLED in this runtime (R-002): no mode, env var or
 * budget value can reach a network transport from the app. The Baseten adapter
 * below is kept isolated for a future, separately verified spending-control
 * build and is exercised only by unit tests with a fake fetch. */
export type ModelJob = "setup_guidance" | "classify_friction" | "classify_unmet_need";
export interface ModelResult { job: ModelJob; output: string; provider: string; mock: boolean; note: string; }

const MAX_INPUT = 2000;

const SETUP_FIXTURES: { match: RegExp; text: string }[] = [
  { match: /connector/i, text: "Mock setup guidance (saved fixture, not a live model): 1) Open your assistant's settings and find Connectors / MCP servers. 2) Add the Launchpad MCP endpoint shown on the Connection page. 3) Sign in to Launchpad and review the requested OAuth permissions. Local SDK validated; Claude/ChatGPT remote connection not verified. Manual tokens are an advanced development option. 4) Ask your assistant: \"Call get_started, then assess my business responsibilities.\" 5) Come back to the Status page — the assessment appears here as your assistant's judgment, with one next action. Nothing is filed or paid by this demo." },
  { match: /choos/i, text: "Mock setup guidance (saved fixture, not a live model): pick the assistant already on your phone if you have one — Launchpad works through it and does not compete with it. If you have none, install one general assistant, return here, then follow the connector steps on the Connection page. Your first job should be read-only: ask what admin responsibilities your business has and which one removes the most work." },
  { match: /read-only|first/i, text: "Mock setup guidance (saved fixture, not a live model): a safe first check is read-only. Ask your assistant to list your responsibilities, who handles each today, and the single next action that removes the most of your work. It reports that assessment to Launchpad (with your sharing permission on); you read it on the Status page. No provider is changed, nothing is sent or paid." },
];
const SETUP_DEFAULT = "Mock setup guidance (saved fixture, not a live model): next step is to add the AI Launchpad connector to your existing assistant (Connection page), allow progress sharing, then ask it for one read-only assessment of your responsibilities. The result appears on the Status page as your assistant's judgment.";

export class TestProvider {
  name = "deterministic-test";
  transportCalls = 0;
  async run(job: ModelJob, input: string): Promise<ModelResult> {
    this.transportCalls++;
    const text = input.slice(0, MAX_INPUT);
    const output = job === "setup_guidance"
      ? (SETUP_FIXTURES.find((f) => f.match.test(text))?.text ?? SETUP_DEFAULT)
      : `Mock classification (fixture): category=needs_assessment, based on bounded input length ${text.length}.`;
    return { job, output, provider: this.name, mock: true, note: "Deterministic fixture responses. No inference was called; actual Meta model quality is untested." };
  }
}

/** Real Baseten (Meta open-weights) adapter, isolated for a future build.
 * NOT reachable from the runtime: runModelJob refuses live modes before any
 * provider is constructed. Unit tests may call this class directly with a
 * fake fetch to pin the request contract at $0. */
export class BasetenProvider {
  name = "baseten-meta";
  constructor(private fetchFn: typeof fetch = fetch) {}
  async run(job: ModelJob, input: string): Promise<ModelResult> {
    const key = process.env.BASETEN_API_KEY; // server-side only, never logged
    if (!key) throw new Error("Baseten provider not configured.");
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await this.fetchFn("https://inference.baseten.co/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "meta-models/muse-spark-open-1026", max_tokens: 400, messages: [{ role: "user", content: `[fixed job: ${job}] ${input.slice(0, MAX_INPUT)}` }] }),
      });
      if (!res.ok) throw new Error(`Baseten responded ${res.status}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return { job, output: String(j.choices?.[0]?.message?.content ?? "").slice(0, 4000), provider: this.name, mock: false, note: "Live adapter result. Unreachable from the current runtime." };
    } finally { clearTimeout(t); }
  }
}

export async function runModelJob(opts: { mode: string; job: ModelJob; input: string; provider?: TestProvider | BasetenProvider }): Promise<ModelResult> {
  if (typeof opts.input !== "string" || opts.input.length > MAX_INPUT) throw new Error("Model input too large.");
  if (opts.mode === "test") {
    if (opts.provider instanceof BasetenProvider) throw new Error("Live inference is disabled in this runtime (R-002).");
    return (opts.provider ?? new TestProvider()).run(opts.job, opts.input);
  }
  if (opts.mode === "baseten") throw new Error("Live inference is disabled in this runtime until verified provider spending controls exist (R-002). No network call was made, whatever the configured budget.");
  if (opts.mode === "disabled") throw new Error("Model jobs are disabled.");
  throw new Error("Unknown model mode.");
}
