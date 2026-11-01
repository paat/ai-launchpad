import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  approvalCheckRequestId, buildApprovalCheckInput, liveChecker, mockChecker, parseApprovalCheck,
  type ApprovalCheckOutput,
} from "../src/approval-check.js";
import {
  BASETEN_MODEL, FIXED_INSTRUCTIONS, JOB_MAX_INPUT, JOB_MAX_OUTPUT_TOKENS, MAX_INPUT_BYTES, MAX_INPUT_CHARS,
  ModelQualityLedger, TIMEOUT_MS, calculateCostMicroUsd, inputTokenBound, reservationMicroUsd, validateInput,
  type FetchFn,
} from "../src/model-quality.js";

const action = {
  kind: "send_invoice", recipient: { name: "Sample Buyer", address: "buyer@example.invalid" },
  amount_cents: 12345, currency: "EUR", period: "2026-11",
  document: { title: "Invoice SAMPLE-1", content: "Invoice SAMPLE-1, 1 November 2026, due 15 November 2026. Seller: Sample Seller. Buyer: Sample Buyer. Total 123.45 EUR." },
  summary: "Send Sample Buyer the invoice for 123.45 EUR.",
};
const ok: ApprovalCheckOutput = {
  verdict: "ok", summary_et: "Sample Buyer saab arve summas 123,45 eurot.",
  summary_en: "Sample Buyer receives an invoice for 123.45 euros.", concerns_et: [], concerns_en: [],
};
const review: ApprovalCheckOutput = { ...ok, verdict: "review", concerns_et: ["Arve summa erineb."], concerns_en: ["The invoice amount differs."] };
const input = buildApprovalCheckInput(action, "Yes, send this invoice.", "invoicing");
const response = (content: string, extra: Record<string, unknown> = {}) => new Response(JSON.stringify({
  model: BASETEN_MODEL, choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 120, completion_tokens: 100, total_tokens: 220 }, ...extra,
}));

describe("approval check schema and samples", () => {
  test("builds only exact stored action fields and metadata, without invented amount", () => {
    expect(JSON.parse(input)).toEqual({
      kind: action.kind, recipient_name: action.recipient.name, recipient_address: action.recipient.address,
      amount_eur: "123.45 EUR", amount_cents: 12345, currency: "EUR", period: "2026-11",
      document_title: action.document.title, document_content: action.document.content,
      assistant_summary: action.summary, owner_confirmation: "Yes, send this invoice.", playbook_id: "invoicing",
    });
    expect(JSON.parse(buildApprovalCheckInput({ ...action, amount_cents: undefined }))).toMatchObject({
      amount_eur: null, amount_cents: null, owner_confirmation: null, playbook_id: null,
    });
  });

  test("only this job accepts the full document and worst JSON escaping; reservation uses real UTF-8 bytes", () => {
    const full = buildApprovalCheckInput({ ...action, recipient: { name: "\u0000".repeat(120), address: "\u0000".repeat(120) },
      period: "\u0000".repeat(40), document: { title: "\u0000".repeat(120), content: "\u0000".repeat(4000) }, summary: "\u0000".repeat(300) }, "\u0000".repeat(300), "customer-follow-ups");
    expect(full.length).toBeGreaterThan(MAX_INPUT_CHARS);
    expect(() => validateInput(full, "check_approval")).not.toThrow();
    expect(() => validateInput(full, "classify_unmet_need")).toThrow();
    expect(JOB_MAX_INPUT.classify_unmet_need).toEqual({ chars: MAX_INPUT_CHARS, bytes: MAX_INPUT_BYTES });
    expect(() => validateInput("a".repeat(JOB_MAX_INPUT.check_approval.chars + 1), "check_approval")).toThrow();
    expect(() => validateInput("€".repeat(30_000), "check_approval")).toThrow(/bytes/);
    const unicodeInput = buildApprovalCheckInput({ ...action, document: { ...action.document, content: "€".repeat(4000) } });
    const bound = Buffer.byteLength(FIXED_INSTRUCTIONS.check_approval) + Buffer.byteLength(unicodeInput) + 2048;
    expect(inputTokenBound("check_approval", unicodeInput)).toBe(bound);
    expect(JOB_MAX_OUTPUT_TOKENS.check_approval).toBe(1024);
    expect(reservationMicroUsd("check_approval", unicodeInput)).toBe(calculateCostMicroUsd(bound, 1024) * 2);
  });

  test.each([ok, review])("accepts valid $verdict output", (output) => {
    expect(parseApprovalCheck(JSON.stringify(output))).toEqual({ ok: true, value: output });
  });

  test.each([
    "not JSON", `\`\`\`json\n${JSON.stringify(ok)}\n\`\`\``, JSON.stringify([ok]), "null",
    JSON.stringify({ ...ok, extra: true }), JSON.stringify({ ...ok, verdict: "pass" }),
    JSON.stringify({ ...ok, summary_et: "a".repeat(201) }), JSON.stringify({ ...ok, summary_en: " " }),
    JSON.stringify({ ...ok, summary_en: "First\nsecond" }), JSON.stringify({ ...ok, summary_et: "First\u2028second" }),
    JSON.stringify({ ...ok, summary_et: "First\u2029second" }), JSON.stringify({ ...ok, summary_et: "x\ud800" }),
    JSON.stringify({ ...ok, concerns_et: ["Concern"], concerns_en: ["Concern"] }),
    JSON.stringify({ ...review, concerns_en: [] }), JSON.stringify({ ...review, concerns_et: [] }),
    JSON.stringify({ ...review, concerns_en: ["a".repeat(161)] }), JSON.stringify({ ...review, concerns_en: ["x\ty"] }),
    JSON.stringify({ ...review, concerns_et: ["a", "b", "c", "d"], concerns_en: ["a", "b", "c", "d"] }),
    JSON.stringify({ ...review, concerns_et: [42] }),
  ])("rejects invalid structure without repair: %s", (text) => {
    expect(parseApprovalCheck(text)).toEqual({ ok: false, reason: "invalid_output" });
  });

  test("mock is deterministic, explicitly a sample, and flags missing or mismatched amounts", async () => {
    expect(mockChecker.by).toBe("mock");
    const first = await mockChecker.check("a", "d", input);
    expect(first).toEqual(await mockChecker.check("b", "e", input));
    expect(first.kind).toBe("text");
    if (first.kind !== "text") throw new Error("missing sample");
    expect(parseApprovalCheck(first.text)).toMatchObject({ ok: true, value: { verdict: "ok", summary_et: expect.stringContaining("Näidis, mitte mudel"), summary_en: expect.stringContaining("Sample, not a model") } });
    for (const content of ["Total 1234.50 EUR.", "No amount.", "Total 1123.45 EUR."]) {
      const result = await mockChecker.check("a", "d", buildApprovalCheckInput({ ...action, document: { ...action.document, content } }));
      expect(result.kind === "text" && parseApprovalCheck(result.text)).toMatchObject({ ok: true, value: { verdict: "review" } });
    }
    for (const content of ["Total 123,45 €.", "Total €123.45.", "Total 123.45 EUR."]) {
      const result = await mockChecker.check("a", "d", buildApprovalCheckInput({ ...action, document: { ...action.document, content } }));
      expect(result.kind === "text" && parseApprovalCheck(result.text)).toMatchObject({ ok: true, value: { verdict: "ok" } });
    }
  });
  test("mock recognizes common euro formatting without matching a partial larger amount", async () => {
    for (const [content, verdict] of [
      ["Total €1,240.00", "ok"], ["Total EUR 1240.00", "ok"], ["Kokku 1 240,00 €", "ok"],
      ["Kokku 1240,00 €", "ok"], ["Total €11,240.00", "review"], ["Total 12 240,00 €", "review"],
    ] as const) {
      const result = await mockChecker.check("a", "d", buildApprovalCheckInput({ ...action, amount_cents: 124000, document: { ...action.document, content } }));
      expect(result.kind === "text" && parseApprovalCheck(result.text)).toMatchObject({ ok: true, value: { verdict } });
    }
  });

});

describe("live approval check through sole model ledger", () => {
  let ledger: ModelQualityLedger;
  beforeEach(() => {
    ledger = ModelQualityLedger.open(":memory:");
    vi.stubGlobal("fetch", () => { throw new Error("real network forbidden"); });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); ledger.close(); });

  test.each([ok, review])("returns validated $verdict, pins job, and replays without another fetch", async (output) => {
    const fetchFn = vi.fn(async () => response(JSON.stringify(output))) as unknown as FetchFn;
    const checker = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn });
    expect(checker.by).toBe(BASETEN_MODEL);
    const result = await checker.check("approval-a", "digest-a", input);
    expect(result).toEqual({ kind: "text", text: JSON.stringify(output) });
    expect(await checker.check("approval-a", "digest-a", input)).toEqual(result);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchFn).mock.calls[0];
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ model: BASETEN_MODEL, max_tokens: 1024,
      messages: [{ role: "developer", content: FIXED_INSTRUCTIONS.check_approval }, { role: "user", content: input }] });
    const stored = ledger.get(approvalCheckRequestId("approval-a", "digest-a"));
    expect(stored).toMatchObject({ job: "check_approval", status: "completed", allocated_micro_usd: reservationMicroUsd("check_approval", input) });
    expect(stored).not.toHaveProperty("input");
    expect(approvalCheckRequestId("approval-a", "digest-b")).not.toBe(approvalCheckRequestId("approval-a", "digest-a"));
  });

  test("invalid output is unreadable, never a pass", async () => {
    const fetchFn = vi.fn(async () => response("```json\n{}\n```")) as unknown as FetchFn;
    expect(await liveChecker({ ledger, apiKey: "synthetic-key", fetchFn }).check("a", "d", input)).toEqual({ kind: "failed", reason: "invalid_output" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("timeout keeps reservation and is terminal, with no retry", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    })) as unknown as FetchFn;
    const checker = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn });
    const pending = checker.check("a", "d", input);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    expect(await pending).toEqual({ kind: "failed", reason: "timeout" });
    expect(await checker.check("a", "d", input)).toEqual({ kind: "failed", reason: "timeout" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(ledger.get(approvalCheckRequestId("a", "d"))).toMatchObject({ status: "uncertain", allocated_micro_usd: reservationMicroUsd("check_approval", input) });
  });

  test("unknown usage and provider failure remain honest unavailable reasons", async () => {
    const uncertain = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn: (async () => response(JSON.stringify(ok), { usage: null })) as FetchFn });
    expect(await uncertain.check("a", "d", input)).toEqual({ kind: "failed", reason: "provider_uncertain" });
    const failed = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn: (async () => new Response("private provider detail", { status: 503 })) as FetchFn });
    expect(await failed.check("b", "d", input)).toEqual({ kind: "failed", reason: "provider_failed" });
  });

  test("zero budget refuses without network", async () => {
    ledger.close(); ledger = ModelQualityLedger.open(":memory:", 0);
    const fetchFn = vi.fn() as unknown as FetchFn;
    expect(await liveChecker({ ledger, apiKey: "synthetic-key", fetchFn }).check("a", "d", input)).toEqual({ kind: "failed", reason: "budget_exhausted" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("contract breach suppresses following attempt without another network call", async () => {
    const fetchFn = vi.fn(async () => response(JSON.stringify(ok), { model: "unexpected-model" })) as unknown as FetchFn;
    const checker = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn });
    expect(await checker.check("a", "d", input)).toEqual({ kind: "failed", reason: "provider_contract_breach" });
    expect(await checker.check("b", "d", input)).toEqual({ kind: "failed", reason: "suppressed_after_breach" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
