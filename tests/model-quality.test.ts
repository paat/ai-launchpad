import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ABSOLUTE_MAX_ATTEMPTS, BASETEN_CHAT_URL, BASETEN_MODEL, MAX_CONTEXT_TOKENS, MAX_INPUT_BYTES, ModelQualityLedger,
  calculateCostMicroUsd, inputTokenBound, payloadHash, reservationMicroUsd, runModelQualityAttempt, validateInput, type FetchFn,
} from "../src/model-quality.js";
import { SYNTHETIC_CASES, main, parseArgs } from "../scripts/model-quality.js";

const tmpLedger = () => join(mkdtempSync(join(tmpdir(), "mq-")), "ledger.db");
const SYNTHETIC_KEY = "synthetic-key-not-real";

type Call = { url: string; init: RequestInit; body: Record<string, unknown> };
const okChat = (overrides: Record<string, unknown> = {}) => ({
  model: BASETEN_MODEL,
  choices: [{
    finish_reason: "stop",
    message: { content: "Synthetic bounded answer.", reasoning_content: "secret-reasoning-detail" },
  }],
  usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
  ...overrides,
});
function fakeFetch(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    return handler(call, calls.length);
  }) as unknown as FetchFn;
  return { calls, fetchFn };
}
const jsonRes = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const happy = () => fakeFetch(() => jsonRes(okChat()));
// Reservation for the base request below (setup_guidance, fixed input).
const ALLOC = 40_836;
const base = (ledger: ModelQualityLedger, fetchFn: FetchFn, extra: Record<string, unknown> = {}) => ({
  job: "setup_guidance" as const, input: "Synthetic connector question?", requestId: "req-1",
  ledger, fetchFn, apiKey: SYNTHETIC_KEY, confirmCurrentPricing: true, ...extra,
});

describe("model quality harness (Baseten)", () => {
  // Tests must never fall back to the real global fetch: every attempt
  // injects a fake transport, and any un-injected path fails loudly here.
  const realFetch = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (() => { throw new Error("real fetch is forbidden in tests"); }) as typeof fetch;
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  test("per-attempt reservation is computed from the request actually sent; request shape is fixed", async () => {
    expect(calculateCostMicroUsd(MAX_CONTEXT_TOKENS, 4096)).toBe(1_328_128);
    expect(calculateCostMicroUsd(100, 10)).toBe(168);
    // 331 instruction bytes + 29 input bytes + 2,048 template tokens.
    expect(inputTokenBound("setup_guidance", "Synthetic connector question?")).toBe(2408);
    // (ceil(2408 × $1.25/1M) + ceil(4096 × $4.25/1M)) × 2 = (3,010 + 17,408) × 2.
    expect(reservationMicroUsd("setup_guidance", "Synthetic connector question?")).toBe(ALLOC);
    // A 512-token classify_unmet_need on the largest valid input (2,000
    // three-byte characters = 6,000 bytes; 2,000 chars cannot reach 8,192):
    // (ceil(9,216 × 1.25) + 512 × 4.25) × 2 = (11,520 + 2,176) × 2.
    const maxInput = "€".repeat(2000);
    expect(validateInput(maxInput)).toBe(maxInput);
    expect(inputTokenBound("classify_unmet_need", maxInput)).toBe(1168 + 6000 + 2048);
    expect(reservationMicroUsd("classify_unmet_need", maxInput)).toBe(27_392);
    // Even the theoretical 8,192-byte ceiling stays under USD 0.05.
    expect(calculateCostMicroUsd(1168 + MAX_INPUT_BYTES + 2048, 512) * 2).toBe(32_872);
    expect(calculateCostMicroUsd(1168 + MAX_INPUT_BYTES + 2048, 512) * 2).toBeLessThan(50_000);
    const ledger = ModelQualityLedger.open(":memory:");
    const { calls, fetchFn } = happy();
    // Extra caller fields must not inject endpoint/model/tools.
    const r = await runModelQualityAttempt(base(ledger, fetchFn, { model: "evil", url: "https://evil.invalid", tools: [{}] }) as never);
    expect(r).toMatchObject({
      status: "completed", mock: false, provider: "baseten-meta", model: BASETEN_MODEL,
      allocatedMicroUsd: ALLOC, actualCostMicroUsd: 168,
      inputTokens: 100, outputTokens: 10, replayed: false,
    });
    expect(r.output).toBe("Synthetic bounded answer.");
    // Exactly one call: no input-token preflight exists on this route.
    expect(calls.map((c) => c.url)).toEqual([BASETEN_CHAT_URL]);
    expect(calls[0].body).toEqual({
      model: BASETEN_MODEL,
      messages: [
        { role: "developer", content: expect.any(String) },
        { role: "user", content: "Synthetic connector question?" },
      ],
      max_tokens: 4096, stream: false,
    });
    expect(calls.every((c) => c.init.redirect === "manual" && c.init.method === "POST")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(SYNTHETIC_KEY);
    expect(JSON.stringify(r)).not.toContain("secret-reasoning-detail"); // reasoning_content never surfaced
    expect(ledger.get("req-1")?.allocated_micro_usd).toBe(ALLOC); // stored per-attempt reservation
    expect(ledger.get("req-1")).not.toHaveProperty("input"); // hash only, no raw input stored
    expect(JSON.stringify(ledger.get("req-1"))).not.toContain("Synthetic connector question?");
    expect(JSON.stringify(ledger.get("req-1"))).not.toContain("secret-reasoning-detail");
    ledger.close();
  });

  test("validation, pricing confirmation and missing key happen before network/allocation", async () => {
    const ledger = ModelQualityLedger.open(":memory:");
    const { calls, fetchFn } = happy();
    const savedKey = process.env.BASETEN_API_KEY;
    delete process.env.BASETEN_API_KEY;
    try {
      for (const bad of [
        { job: "anything" }, { requestId: "bad id!" }, { requestId: "" },
        { input: "" }, { input: "x".repeat(2001) },
        { confirmCurrentPricing: false }, { apiKey: undefined },
      ]) {
        await expect(runModelQualityAttempt(base(ledger, fetchFn, bad) as never)).rejects.toThrow();
      }
    } finally {
      if (savedKey === undefined) delete process.env.BASETEN_API_KEY; else process.env.BASETEN_API_KEY = savedKey;
    }
    expect(() => validateInput("é".repeat(2000))).not.toThrow();
    expect(new TextEncoder().encode("é".repeat(2000)).byteLength).toBe(4000);
    expect(calls).toHaveLength(0);
    expect(ledger.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 0 });
    ledger.close();
  });

  test("zero/lower cap blocks with no network; ceiling cannot be raised or changed", { timeout: 30_000 }, async () => {
    const path = tmpLedger();
    const ledger = ModelQualityLedger.open(path, 0);
    const { calls, fetchFn } = happy();
    await expect(runModelQualityAttempt(base(ledger, fetchFn))).rejects.toMatchObject({ code: "budget_exhausted" });
    expect(calls).toHaveLength(0);
    ledger.close();
    expect(() => ModelQualityLedger.open(path, 10_000_000)).toThrow(/cannot be changed/);
    expect(() => ModelQualityLedger.open(":memory:", 10_000_001)).toThrow(/absolute/);
  });

  test("replay returns stored result after reopen without another call; conflict rejects", { timeout: 30_000 }, async () => {
    const path = tmpLedger();
    let ledger = ModelQualityLedger.open(path);
    const first = happy();
    await runModelQualityAttempt(base(ledger, first.fetchFn));
    ledger.close();
    ledger = ModelQualityLedger.open(path);
    const second = happy();
    const replay = await runModelQualityAttempt(base(ledger, second.fetchFn));
    expect(replay).toMatchObject({ status: "completed", replayed: true, output: "Synthetic bounded answer." });
    expect(second.calls).toHaveLength(0);
    await expect(runModelQualityAttempt(base(ledger, second.fetchFn, { input: "Different synthetic input" }))).rejects.toMatchObject({ code: "request_conflict" });
    expect(second.calls).toHaveLength(0);
    expect(ledger.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 1 });
    ledger.close();
  });

  test("production-seeded ledger: two connections contend for the remaining headroom; pending blocks fail-closed", { timeout: 30_000 }, () => {
    const path = tmpLedger();
    const a = ModelQualityLedger.open(path);
    const b = ModelQualityLedger.open(path);
    const ins = a.db.prepare("INSERT INTO mq_attempts(request_id,payload_hash,job,status,allocated_micro_usd,created_at,updated_at) VALUES(?, 'h','setup_guidance','completed',2000000,'t','t')");
    a.db.transaction(() => { for (let i = 0; i < 4; i++) ins.run(`seed-${i}`); })();
    expect(a.reserve("last", "setup_guidance", "hash-last", 2_000_000).replayed).toBe(false);
    expect(() => b.reserve("other", "setup_guidance", "hash-other", 1)).toThrow(/pending/);
    a.finalize("last", { status: "completed" });
    expect(() => b.reserve("other", "setup_guidance", "hash-other", 1)).toThrow(/cap or attempt limit/);
    expect(b.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 5 });
    expect(b.db.prepare("SELECT COALESCE(SUM(allocated_micro_usd),0) s FROM mq_attempts").get()).toEqual({ s: 10_000_000 });
    // Invalid allocations are refused before any row is written.
    for (const bad of [0, -1, 1.5, 10_000_001]) expect(() => b.reserve(`bad-${bad}`, "setup_guidance", "h", bad)).toThrow(/Allocation/);
    a.close(); b.close();
  });

  test("attempt backstop is 1000; the USD 10 ceiling binds first for real reservations", { timeout: 30_000 }, async () => {
    expect(ABSOLUTE_MAX_ATTEMPTS).toBe(1000);
    const tiny = ModelQualityLedger.open(":memory:");
    tiny.db.transaction(() => {
      for (let i = 0; i < 1000; i++) { tiny.reserve(`t-${i}`, "setup_guidance", `h-${i}`, 1); tiny.finalize(`t-${i}`, { status: "completed" }); }
    })();
    expect(() => tiny.reserve("t-1000", "setup_guidance", "h", 1)).toThrow(/cap or attempt limit/);
    tiny.close();
    // Real reservations: floor(10,000,000 / 40,836) = 244 attempts, then refused with no network.
    const ledger = ModelQualityLedger.open(":memory:");
    const { calls, fetchFn } = happy();
    for (let i = 1; i <= 244; i++) {
      const r = await runModelQualityAttempt(base(ledger, fetchFn, { requestId: `req-${i}` }));
      expect(r.status).toBe("completed");
    }
    await expect(runModelQualityAttempt(base(ledger, fetchFn, { requestId: "req-245" }))).rejects.toMatchObject({ code: "budget_exhausted" });
    expect(calls).toHaveLength(244);
    expect(ledger.db.prepare("SELECT COUNT(*) n, SUM(allocated_micro_usd) s FROM mq_attempts").get()).toEqual({ n: 244, s: 244 * ALLOC });
    ledger.close();
  });

  test("crashed pending attempt stays charged, non-replayable, blocks new attempts", { timeout: 30_000 }, async () => {
    const path = tmpLedger();
    const a = ModelQualityLedger.open(path);
    a.reserve("crashed", "setup_guidance", payloadHash("setup_guidance", "Synthetic connector question?"), ALLOC);
    a.close();
    const ledger = ModelQualityLedger.open(path);
    const { calls, fetchFn } = happy();
    const replay = await runModelQualityAttempt(base(ledger, fetchFn, { requestId: "crashed" }));
    expect(replay).toMatchObject({ status: "pending", replayed: true, allocatedMicroUsd: ALLOC });
    await expect(runModelQualityAttempt(base(ledger, fetchFn, { requestId: "fresh" }))).rejects.toMatchObject({ code: "attempt_in_flight" });
    expect(calls).toHaveLength(0);
    ledger.close();
  });

  test("usage boundaries: cost exactly at the attempt's own reservation completes; one micro-USD over, over the context or over the job's max_tokens breaches", async () => {
    // 18,742 input + 4,096 output tokens cost exactly the 40,836 reservation.
    let ledger = ModelQualityLedger.open(":memory:");
    let f = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 18_742, completion_tokens: 4096, total_tokens: 22_838 } })));
    let r = await runModelQualityAttempt(base(ledger, f.fetchFn));
    expect(r).toMatchObject({ status: "completed", actualCostMicroUsd: ALLOC, allocatedMicroUsd: ALLOC });
    ledger.close();

    // One more input token: 40,837 > 40,836 reserved. Breach, charged, output suppressed.
    ledger = ModelQualityLedger.open(":memory:");
    f = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 18_743, completion_tokens: 4096, total_tokens: 22_839 } })));
    r = await runModelQualityAttempt(base(ledger, f.fetchFn));
    expect(r).toMatchObject({ status: "provider_contract_breach", errorCode: "usage_exceeds_caps", output: null, allocatedMicroUsd: ALLOC, actualCostMicroUsd: 40_837 });
    ledger.close();

    // One token over the context cap: breach.
    ledger = ModelQualityLedger.open(":memory:");
    f = fakeFetch(() => jsonRes(okChat({
      usage: { prompt_tokens: MAX_CONTEXT_TOKENS - 9, completion_tokens: 10, total_tokens: MAX_CONTEXT_TOKENS + 1 },
    })));
    r = await runModelQualityAttempt(base(ledger, f.fetchFn));
    expect(r).toMatchObject({ status: "provider_contract_breach", errorCode: "usage_exceeds_caps", output: null, allocatedMicroUsd: ALLOC });
    ledger.close();

    // Output one token over 4,096 breaches even with a small total.
    ledger = ModelQualityLedger.open(":memory:");
    f = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 10, completion_tokens: 4097, total_tokens: 4107 } })));
    r = await runModelQualityAttempt(base(ledger, f.fetchFn));
    expect(r).toMatchObject({ status: "provider_contract_breach", errorCode: "usage_exceeds_caps", output: null });
    ledger.close();

    // classify_unmet_need asks for max_tokens 512 and 513 output tokens breach its own limit.
    ledger = ModelQualityLedger.open(":memory:");
    f = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 10, completion_tokens: 513, total_tokens: 523 } })));
    r = await runModelQualityAttempt(base(ledger, f.fetchFn, { job: "classify_unmet_need", input: "{\"need\":\"synthetic\"}" }));
    expect(f.calls[0].body.max_tokens).toBe(512);
    expect(r).toMatchObject({ status: "provider_contract_breach", errorCode: "usage_exceeds_caps", output: null, allocatedMicroUsd: reservationMicroUsd("classify_unmet_need", "{\"need\":\"synthetic\"}") });
    ledger.close();

    // total_tokens inconsistent with prompt+completion: invalid usage, uncertain, charged.
    ledger = ModelQualityLedger.open(":memory:");
    f = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 999 } })));
    r = await runModelQualityAttempt(base(ledger, f.fetchFn));
    expect(r).toMatchObject({ status: "uncertain", errorCode: "missing_or_invalid_usage", output: null, allocatedMicroUsd: ALLOC });
    ledger.close();
  });

  test("incorrect response model identity is a contract breach and locks the ledger", async () => {
    const ledger = ModelQualityLedger.open(":memory:");
    const wrong = fakeFetch(() => jsonRes(okChat({ model: "meta-models/some-other-alias" })));
    const r = await runModelQualityAttempt(base(ledger, wrong.fetchFn));
    expect(r).toMatchObject({
      status: "provider_contract_breach", errorCode: "model_identity_mismatch",
      output: null, allocatedMicroUsd: ALLOC, model: BASETEN_MODEL,
    });
    const after = happy();
    await expect(runModelQualityAttempt(base(ledger, after.fetchFn, { requestId: "req-2" }))).rejects.toMatchObject({ code: "suppressed_after_breach" });
    expect(after.calls).toHaveLength(0);
    ledger.close();

    // A response that omits `model` is not an identity mismatch.
    const ledger2 = ModelQualityLedger.open(":memory:");
    const noModel = fakeFetch(() => {
      const body = okChat() as Record<string, unknown>;
      delete body.model;
      return jsonRes(body);
    });
    const r2 = await runModelQualityAttempt(base(ledger2, noModel.fetchFn));
    expect(r2).toMatchObject({ status: "completed", model: BASETEN_MODEL });
    ledger2.close();
  });

  test("timeout, oversized body and missing/invalid usage are uncertain and charged", async () => {
    const scenarios: [string, (c: Call) => Response | Promise<Response>][] = [
      ["timeout", (c) => new Promise<Response>((_, rej) => {
        (c.init.signal as AbortSignal).addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
      })],
      ["response_too_large", () => new Response("x".repeat(200_000))],
      ["missing_or_invalid_usage", () => jsonRes(okChat({ usage: undefined }))],
      ["missing_or_invalid_usage", () => jsonRes(okChat({ usage: { prompt_tokens: 1.5, completion_tokens: 10, total_tokens: 12 } }))],
      ["missing_or_invalid_usage", () => jsonRes(okChat({ usage: { prompt_tokens: -1, completion_tokens: 10, total_tokens: 9 } }))],
    ];
    for (const [code, handler] of scenarios) {
      const ledger = ModelQualityLedger.open(":memory:");
      const { calls, fetchFn } = fakeFetch(handler);
      const r = await runModelQualityAttempt(base(ledger, fetchFn, { timeoutMs: 20 }));
      expect(r, code).toMatchObject({ status: "uncertain", errorCode: code, mock: false, output: null });
      expect(ledger.get("req-1")?.allocated_micro_usd).toBe(ALLOC);
      expect(calls).toHaveLength(1); // single chat call, no preflight, no retry
      ledger.close();
    }
  });

  test("redirect, provider error body, malformed, empty and truncated results fail honestly", async () => {
    const cases: [string, () => Response][] = [
      ["redirect_refused", () => new Response(null, { status: 302, headers: { location: "https://evil.invalid" } })],
      ["provider_failed", () => new Response(JSON.stringify({ error: "secret-provider-detail" }), { status: 500 })],
      ["invalid_response", () => new Response("{nope", { status: 200 })],
      ["invalid_response", () => jsonRes(okChat({ choices: [] }))],
      ["invalid_response", () => jsonRes(okChat({ choices: [{ finish_reason: "stop", message: { content: "   " } }] }))],
      ["truncated", () => jsonRes(okChat({
        choices: [{ finish_reason: "length", message: { content: "partial" } }],
        usage: { prompt_tokens: 5, completion_tokens: 4096, total_tokens: 4101 },
      }))],
    ];
    for (const [code, make] of cases) {
      const ledger = ModelQualityLedger.open(":memory:");
      const res = make();
      const { calls, fetchFn } = fakeFetch(() => res);
      const r = await runModelQualityAttempt(base(ledger, fetchFn));
      expect(r, code).toMatchObject({ status: "failed", errorCode: code, mock: false, output: null });
      expect(JSON.stringify(r)).not.toContain("secret-provider-detail");
      expect(JSON.stringify(ledger.get("req-1"))).not.toContain("secret-provider-detail");
      expect(calls).toHaveLength(1);
      expect(ledger.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 1 });
      ledger.close();
    }
  });

  test("transport exception is still charged without leaking detail; usage breach suppresses future calls", async () => {
    let ledger = ModelQualityLedger.open(":memory:");
    const boom = fakeFetch(() => { throw new Error("socket exploded with sensitive detail"); });
    let r = await runModelQualityAttempt(base(ledger, boom.fetchFn));
    expect(r).toMatchObject({ status: "failed", errorCode: "provider_failed", allocatedMicroUsd: ALLOC });
    expect(JSON.stringify(r)).not.toContain("sensitive detail");
    expect(boom.calls).toHaveLength(1);
    ledger.close();

    ledger = ModelQualityLedger.open(":memory:");
    const breach = fakeFetch(() => jsonRes(okChat({ usage: { prompt_tokens: 1, completion_tokens: 5000, total_tokens: 5001 } })));
    r = await runModelQualityAttempt(base(ledger, breach.fetchFn));
    expect(r).toMatchObject({ status: "provider_contract_breach", errorCode: "usage_exceeds_caps", output: null });
    const after = happy();
    await expect(runModelQualityAttempt(base(ledger, after.fetchFn, { requestId: "req-2" }))).rejects.toMatchObject({ code: "suppressed_after_breach" });
    expect(after.calls).toHaveLength(0);
    expect(ledger.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 1 });
    ledger.close();
  });

  test("identity/limit breaches with untrustworthy accounting suppress and cost nothing assumed", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["wrong-model-missing-usage", { model: "other-model", usage: undefined }],
      ["wrong-model-negative-usage", { model: "other-model", usage: { prompt_tokens: -1, completion_tokens: 2 } }],
      ["over-output-inconsistent-total", { usage: { prompt_tokens: 1, completion_tokens: 4097, total_tokens: 1 } }],
      ["over-output-missing-prompt", { usage: { completion_tokens: 4097 } }],
      ["over-output-negative-prompt", { usage: { prompt_tokens: -5, completion_tokens: 4097, total_tokens: 4092 } }],
      ["excessive-input-missing-output", { usage: { prompt_tokens: MAX_CONTEXT_TOKENS + 1 } }],
    ];
    for (const [name, override] of cases) {
      const ledger = ModelQualityLedger.open(":memory:");
      const f = fakeFetch(() => jsonRes(okChat(override)));
      const r = await runModelQualityAttempt(base(ledger, f.fetchFn));
      expect(r, name).toMatchObject({
        status: "provider_contract_breach", output: null,
        allocatedMicroUsd: ALLOC, actualCostMicroUsd: null,
        errorCode: name.startsWith("wrong-model") ? "model_identity_mismatch" : "usage_exceeds_caps",
      });
      expect(ledger.get("req-1")).toMatchObject({ status: "provider_contract_breach", allocated_micro_usd: ALLOC, output: null, actual_cost_micro_usd: null });
      const after = happy();
      await expect(runModelQualityAttempt(base(ledger, after.fetchFn, { requestId: "req-2" })), name).rejects.toMatchObject({ code: "suppressed_after_breach" });
      expect(after.calls, name).toHaveLength(0);
      const replay = await runModelQualityAttempt(base(ledger, after.fetchFn));
      expect(replay, name).toMatchObject({ status: "provider_contract_breach", replayed: true, output: null, actualCostMicroUsd: null });
      expect(after.calls, name).toHaveLength(0);
      ledger.close();
    }
  });

  test("CLI defaults to dry mock (key unread, network-free), rejects arbitrary prompts, live needs ledger", async () => {
    expect(Object.keys(SYNTHETIC_CASES)).toHaveLength(4);
    expect(parseArgs(["--case", "en-connector-help"])).toMatchObject({ live: false, caseId: "en-connector-help" });
    expect(() => parseArgs(["--case", "a", "--case", "b"])).toThrow(/Duplicate/);
    expect(() => parseArgs(["tell me anything"])).toThrow(/Arbitrary prompts/);
    const logs: string[] = [];
    const orig = console.log; console.log = (s: string) => logs.push(String(s));
    const savedKey = process.env.BASETEN_API_KEY;
    try {
      delete process.env.BASETEN_API_KEY;
      expect(await main(["--case", "et-connector-help"])).toBe(0);
    } finally {
      console.log = orig;
      if (savedKey === undefined) delete process.env.BASETEN_API_KEY; else process.env.BASETEN_API_KEY = savedKey;
    }
    expect(JSON.parse(logs[0])).toMatchObject({ mock: true, provider: "dry-run-no-provider", model: BASETEN_MODEL, allocatedMicroUsd: 0 });
    // Live without a ledger exits 2 before any key read, ledger open or network call.
    expect(await main(["--live", "--case", "en-connector-help", "--request-id", "r1", "--confirm-current-pricing"])).toBe(2);
  });
});
