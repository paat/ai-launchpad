import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256, type Db } from "../src/db.js";
import { BASETEN_MODEL, ModelQualityLedger, type FetchFn } from "../src/model-quality.js";
import { approvalCheckRequestId, liveChecker, type ApprovalChecker, type CheckOutcome } from "../src/approval-check.js";
import { approvalCheckReceipt, approvalDigest, buildMcpServer, getApproval, startApprovalCheck, waitForApprovalCheck } from "../src/mcp.js";

// No inference in this suite reaches a provider, even if mode wiring regresses.
const nativeFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "127.0.0.1") throw new Error(`External network prohibited: ${url.origin}`);
    return nativeFetch(input as RequestInfo, init);
  }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = nativeFetch; });

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { vi.useRealTimers(); for (const close of cleanup.splice(0).reverse()) await close(); });
const dbForTest = () => { const db = openDb(":memory:"); cleanup.push(() => db.close()); return db; };
const action = {
  kind: "send_invoice", recipient: { name: "Synthetic Buyer OÜ", address: "buyer@synthetic.example" },
  amount_cents: 12500, currency: "EUR", period: "2026-10",
  document: { title: "Invoice TEST-1", content: "Invoice TEST-1. Date 2026-10-31. Due 2026-11-15. Seller Synthetic Seller OÜ. Buyer Synthetic Buyer OÜ. Total 125.00 EUR." },
  summary: "Send the synthetic buyer their invoice for 125.00 EUR.",
};
const ok = { verdict: "ok", summary_et: "Näidisostja saab arve summas 125 eurot.", summary_en: "Synthetic Buyer receives an invoice for 125 euros.", concerns_et: [], concerns_en: [] };
const review = { ...ok, verdict: "review", concerns_et: ["Kontrolli saaja nime."], concerns_en: ["Check the recipient name."] };
const output = (value = ok): CheckOutcome => ({ kind: "text", text: JSON.stringify(value) });
function checker(result: CheckOutcome = output()) {
  const check = vi.fn<ApprovalChecker["check"]>(async (_id, _digest, _input, onStart) => {
    if (result.kind !== "failed" || !["budget_exhausted", "suppressed_after_breach", "attempt_in_flight"].includes(result.reason)) onStart?.();
    return result;
  });
  return { by: BASETEN_MODEL, check } satisfies ApprovalChecker;
}
function owner(db: Db, id = "synthetic-owner", kind = "google") {
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,?,1,?)").run(id, `google:${id}`, kind, new Date().toISOString());
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `ws-${id}`, "Synthetic workspace");
  return id;
}
function approval(db: Db, oid: string, id = "synthetic-approval", state = "approved") {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO approvals(id,owner_id,kind,payload_json,digest,state,created_at,expires_at,owner_confirmation,playbook_id) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id, oid, action.kind, JSON.stringify(action), approvalDigest(action), state, now, new Date(Date.now() + 3600_000).toISOString(), "Jah, saada.", "invoice-send");
  return id;
}
const parsed = (r: any) => r.structuredContent ?? JSON.parse(r.content[0].text);
async function client(db: Db, oid: string, model: ApprovalChecker | null) {
  const server = buildMcpServer(db, { ownerId: oid, scopes: ["progress:read", "progress:report"], companyRef: `ws-${oid}`, label: "Synthetic workspace", reportingEnabled: true, baseUrl: "http://localhost" }, undefined, { approvalChecker: model });
  const [st, ct] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "synthetic-approval-check", version: "1" });
  await Promise.all([server.connect(st), c.connect(ct)]);
  cleanup.push(async () => { await c.close(); await server.close(); });
  return c;
}
const request = async (c: Client, reportId: string, extra: Record<string, unknown> = {}) => parsed(await c.callTool({ name: "request_approval", arguments: { report_id: reportId, action, ...extra } }));
const get = async (c: Client, id: string) => parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: id } }));

test.each(["demo", "sample", "sandbox"])("%s owner uses the labelled mock even when a live checker is configured", async (kind) => {
  const db = dbForTest(), oid = owner(db, `synthetic-${kind}`, kind), id = approval(db, oid), live = checker();
  await startApprovalCheck(db, oid, id, live);
  expect(live.check).not.toHaveBeenCalled();
  const row = getApproval(db, oid, id)!;
  expect(row).toMatchObject({ state: "approved", check_state: "ok", check_by: "mock" });
  expect(approvalCheckReceipt(row)).toMatchObject({ by: "mock", summary_en: expect.stringContaining("Sample, not a model") });
});

test("disabled is unavailable without a call, and repeated reads do not start it", async () => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  await startApprovalCheck(db, oid, id, null);
  const live = checker();
  await startApprovalCheck(db, oid, id, live);
  expect(live.check).not.toHaveBeenCalled();
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toMatchObject({ state: "unavailable", reason: "disabled" });
  expect(getApproval(db, oid, id)?.check_at).toBeNull();
  expect(getApproval(db, oid, id)?.check_by).toBeNull();
});

test("real owner input is derived from stored action and metadata only", async () => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid), live = checker();
  await startApprovalCheck(db, oid, id, live);
  const call = live.check.mock.calls[0] as unknown as [string, string, string];
  expect(call.slice(0, 2)).toEqual([id, approvalDigest(action)]);
  expect(JSON.parse(call[2])).toEqual({ kind: action.kind, recipient_name: action.recipient.name, recipient_address: action.recipient.address, amount_eur: "125.00 EUR", amount_cents: 12500, currency: "EUR", period: "2026-10", document_title: action.document.title, document_content: action.document.content, assistant_summary: action.summary, owner_confirmation: "Jah, saada.", playbook_id: "invoice-send" });
  expect(call[2]).not.toContain(oid);
  expect(getApproval(db, oid, id)).toMatchObject({ state: "approved", check_state: "ok", check_by: BASETEN_MODEL, check_at: expect.any(String) });
});

test("the 30-check rolling limit counts started failures, ignores older checks and other owners", async () => {
  const db = dbForTest(), oid = owner(db), other = owner(db, "synthetic-other"), live = checker({ kind: "failed", reason: "provider_failed" });
  for (let i = 0; i < 30; i++) await startApprovalCheck(db, oid, approval(db, oid, `recent-${i}`), live);
  const blocked = approval(db, oid, "blocked");
  await startApprovalCheck(db, oid, blocked, live);
  expect(live.check).toHaveBeenCalledTimes(30);
  expect(approvalCheckReceipt(getApproval(db, oid, blocked)!)).toMatchObject({ state: "unavailable", reason: "daily_limit" });
  expect(getApproval(db, oid, blocked)?.check_at).toBeNull();
  expect(getApproval(db, oid, blocked)?.check_by).toBeNull();
  await startApprovalCheck(db, other, approval(db, other, "other-check"), live);
  expect(live.check).toHaveBeenCalledTimes(31);
  db.prepare("UPDATE approvals SET check_at=? WHERE id='recent-0'").run(new Date(Date.now() - 86_400_001).toISOString());
  await startApprovalCheck(db, oid, approval(db, oid, "next-day"), live);
  expect(live.check).toHaveBeenCalledTimes(32);
});

test("20-second wait returns running while one background call completes and is stored", async () => {
  vi.useFakeTimers();
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  let finish!: (r: CheckOutcome) => void;
  const live: ApprovalChecker = { by: BASETEN_MODEL, check: vi.fn<ApprovalChecker["check"]>((_id, _digest, _input, onStart) => new Promise((resolve) => { onStart?.(); finish = resolve; })) };
  const work = startApprovalCheck(db, oid, id, live);
  let waited = false;
  const wait = waitForApprovalCheck(work).then(() => { waited = true; });
  await startApprovalCheck(db, oid, id, live);
  expect(live.check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(19_999);
  expect(waited).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await wait;
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toEqual({ state: "running", by: BASETEN_MODEL });
  finish(output(review));
  await work;
  expect(getApproval(db, oid, id)).toMatchObject({ state: "approved", check_state: "review" });
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toMatchObject({ state: "review", ...review });
});

test("a busy ledger keeps the approval running until its one model call can start", async () => {
  vi.useFakeTimers();
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  const ledger = ModelQualityLedger.open(":memory:");
  cleanup.push(() => ledger.close());
  ledger.reserve("other-attempt", "setup_guidance", "synthetic-hash", 10000);
  const reserve = vi.spyOn(ledger, "reserve");
  const fetchFn = vi.fn<FetchFn>(async () => new Response(JSON.stringify({
    model: BASETEN_MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(ok) } }],
    usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  const live = liveChecker({ ledger, apiKey: "synthetic-key", fetchFn });
  const work = startApprovalCheck(db, oid, id, live);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(getApproval(db, oid, id)?.check_state).toBe("running");
  expect(fetchFn).not.toHaveBeenCalled();
  expect(getApproval(db, oid, id)?.check_by).toBeNull();
  ledger.finalize("other-attempt", { status: "completed" });
  await vi.advanceTimersByTimeAsync(2_000);
  await work;
  expect(getApproval(db, oid, id)?.check_state).toBe("ok");
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(getApproval(db, oid, id)?.check_by).toBe(BASETEN_MODEL);
  expect(reserve).toHaveBeenCalledTimes(4);
  expect(new Set(reserve.mock.calls.map(([requestId]) => requestId))).toEqual(new Set([approvalCheckRequestId(id, approvalDigest(action))]));
  expect((ledger.db.prepare("SELECT count(*) n FROM mq_attempts").get() as { n: number }).n).toBe(2);
});

test("a ledger slot still busy after 60 seconds becomes terminal unavailable", async () => {
  vi.useFakeTimers();
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  const live = checker({ kind: "failed", reason: "attempt_in_flight" });
  const work = startApprovalCheck(db, oid, id, live);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(getApproval(db, oid, id)?.check_state).toBe("running");
  expect(live.check).toHaveBeenCalledTimes(30);
  await vi.advanceTimersByTimeAsync(1);
  await work;
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toMatchObject({ state: "unavailable", reason: "attempt_in_flight" });
  expect(live.check).toHaveBeenCalledTimes(31);
  await vi.advanceTimersByTimeAsync(2_000);
  await startApprovalCheck(db, oid, id, live);
  expect(live.check).toHaveBeenCalledTimes(31);
});

test("waiting checks without model provenance still count toward the daily limit", async () => {
  vi.useFakeTimers();
  const db = dbForTest(), oid = owner(db);
  const live = checker({ kind: "failed", reason: "attempt_in_flight" });
  const work = Array.from({ length: 30 }, (_, i) => startApprovalCheck(db, oid, approval(db, oid, `waiting-${i}`), live));
  expect(getApproval(db, oid, "waiting-0")).toMatchObject({ check_state: "running", check_by: null });
  const blocked = approval(db, oid, "blocked");
  await startApprovalCheck(db, oid, blocked, live);
  expect(live.check).toHaveBeenCalledTimes(30);
  expect(approvalCheckReceipt(getApproval(db, oid, blocked)!)).toEqual({ state: "unavailable", by: null, reason: "daily_limit" });
  expect(getApproval(db, oid, blocked)?.check_at).toBeNull();
  await vi.advanceTimersByTimeAsync(60_000);
  await Promise.all(work);
});

test.each(["budget_exhausted", "suppressed_after_breach", "timeout", "provider_uncertain", "provider_failed"])("%s never changes approval state or becomes a pass", async (reason) => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid), live = checker({ kind: "failed", reason });
  await startApprovalCheck(db, oid, id, live);
  expect(getApproval(db, oid, id)?.state).toBe("approved");
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toEqual({ state: "unavailable", by: ["budget_exhausted", "suppressed_after_breach"].includes(reason) ? null : BASETEN_MODEL, reason });
});

test("invalid checker output is rejected before storage", async () => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  await startApprovalCheck(db, oid, id, checker({ kind: "text", text: '{"verdict":"ok"}' }));
  expect(getApproval(db, oid, id)).toMatchObject({ state: "approved", check_state: "unavailable", check_json: '{"reason":"invalid_output"}' });
});

test("an exhausted ledger makes no fetch and records no model provenance", async () => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  const ledger = ModelQualityLedger.open(":memory:", 0);
  cleanup.push(() => ledger.close());
  const fetchFn = vi.fn<FetchFn>();
  await startApprovalCheck(db, oid, id, liveChecker({ ledger, apiKey: "synthetic-key", fetchFn }));
  expect(fetchFn).not.toHaveBeenCalled();
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toEqual({ state: "unavailable", by: null, reason: "budget_exhausted" });
});

test("restart marks an interrupted running check unavailable without a retry", async () => {
  const dir = mkdtempSync(join(tmpdir(), "approval-check-restart-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "app.db"), first = openDb(path), oid = owner(first), id = approval(first, oid);
  first.prepare("UPDATE approvals SET check_state='running',check_by=?,check_at=? WHERE id=?").run(BASETEN_MODEL, new Date().toISOString(), id);
  first.close();
  const reopened = openDb(path); cleanup.push(() => reopened.close());
  const live = checker();
  await startApprovalCheck(reopened, oid, id, live);
  expect(live.check).not.toHaveBeenCalled();
  expect(approvalCheckReceipt(getApproval(reopened, oid, id)!)).toEqual({ state: "unavailable", by: BASETEN_MODEL, reason: "interrupted" });
});

test("MCP pending, reused digest and idempotent replay carry the live check without a second model call", async () => {
  const db = dbForTest(), oid = owner(db), live = checker(output(review)), c = await client(db, oid, live);
  const pending = await request(c, "pending");
  expect(pending).toMatchObject({ state: "pending", check: { state: "review", by: BASETEN_MODEL, ...review } });
  expect(pending.assistant_instruction).toContain("tell the owner its concerns in one line");
  expect(pending.assistant_instruction).toContain("call get_approval once before acting");
  expect(pending.assistant_instruction).toContain("say nothing about the check unless asked");
  expect((await get(c, pending.approval_id)).check).toEqual(pending.check);
  const approved = await request(c, "confirmed", { owner_confirmation: "Yes, please send it." });
  expect(approved).toMatchObject({ approval_id: pending.approval_id, state: "approved", approved_in_assistant: true, check: pending.check });
  const replay = await request(c, "pending");
  expect(replay).toMatchObject({ state: "approved", current_state: "approved", check: pending.check });
  expect(live.check).toHaveBeenCalledTimes(1);
  db.prepare("UPDATE approvals SET check_state='unavailable',check_json=? WHERE id=?").run('{"reason":"provider_failed"}', pending.approval_id);
  expect((await request(c, "pending")).check).toMatchObject({ state: "unavailable", reason: "provider_failed" });
  expect((await get(c, pending.approval_id)).check).toMatchObject({ state: "unavailable", reason: "provider_failed" });
  expect(live.check).toHaveBeenCalledTimes(1);
});

test.each(["unavailable", "ok"])("pending approval with %s advice explicitly forbids acting", async (state) => {
  const db = dbForTest(), oid = owner(db);
  const live = checker(state === "ok" ? output() : { kind: "failed", reason: "provider_failed" });
  const c = await client(db, oid, live);
  const pending = await request(c, `pending-${state}`);
  for (const receipt of [pending, await get(c, pending.approval_id), await request(c, `pending-${state}`)]) {
    expect(receipt.check.state).toBe(state);
    expect(receipt.assistant_instruction).toContain("Do not act before the approval is approved.");
    expect(receipt.assistant_instruction).not.toContain("act as usual");
  }
  db.prepare("UPDATE approvals SET state='approved' WHERE id=?").run(pending.approval_id);
  expect((await get(c, pending.approval_id)).assistant_instruction).toContain("act as usual");
  db.prepare("UPDATE approvals SET payload_json=? WHERE id=?").run(JSON.stringify({ ...action, recipient: { name: action.recipient.name } }), pending.approval_id);
  const unusable = await get(c, pending.approval_id);
  expect(unusable.usable).toBe(false);
  expect(unusable.assistant_instruction).toContain("Do not act under this unusable approval.");
  expect(unusable.assistant_instruction).not.toContain("act as usual");
});

test("MCP running receipt and replays expose the eventual result without another call", async () => {
  vi.useFakeTimers();
  const db = dbForTest(), oid = owner(db);
  let finish!: (r: CheckOutcome) => void;
  const live: ApprovalChecker = { by: BASETEN_MODEL, check: vi.fn<ApprovalChecker["check"]>((_id, _digest, _input, onStart) => new Promise((resolve) => { onStart?.(); finish = resolve; })) };
  const c = await client(db, oid, live);
  const pendingRequest = request(c, "slow");
  await vi.advanceTimersByTimeAsync(20_000);
  const pending = await pendingRequest;
  expect(pending).toMatchObject({ state: "pending", check: { state: "running", by: BASETEN_MODEL } });
  expect((await get(c, pending.approval_id)).check.state).toBe("running");
  expect((await request(c, "slow")).check.state).toBe("running");
  expect(live.check).toHaveBeenCalledTimes(1);
  finish(output());
  await vi.advanceTimersByTimeAsync(0);
  expect((await get(c, pending.approval_id)).check).toMatchObject({ state: "ok", ...ok });
  expect((await request(c, "slow")).check).toMatchObject({ state: "ok", ...ok });
  expect(live.check).toHaveBeenCalledTimes(1);
});

test.each(["consumed", "declined"])("initial MCP receipt reflects %s during the model wait and withdraws permission to act", async (state) => {
  const db = dbForTest(), oid = owner(db);
  let finish!: (r: CheckOutcome) => void, started!: (id: string) => void;
  const checkStarted = new Promise<string>((resolve) => { started = resolve; });
  const live: ApprovalChecker = { by: BASETEN_MODEL, check: vi.fn<ApprovalChecker["check"]>((id, _digest, _input, onStart) => {
    onStart?.();
    started(id);
    return new Promise((resolve) => { finish = resolve; });
  }) };
  const c = await client(db, oid, live);
  const pendingReceipt = request(c, "changed-during-check", state === "consumed" ? { owner_confirmation: "Yes, send." } : {});
  const id = await checkStarted;
  db.prepare("UPDATE approvals SET state=? WHERE id=?").run(state, id);
  finish(output());
  const receipt = await pendingReceipt;
  expect(receipt).toMatchObject({ approval_id: id, state, check: { state: "ok" } });
  expect(receipt).not.toHaveProperty("owner_instruction");
  expect(receipt.assistant_instruction).toContain(`This approval is ${state}. Do not send, pay or file anything for it.`);
  expect(receipt.assistant_instruction).not.toContain("act with your own tools");
  expect(live.check).toHaveBeenCalledTimes(1);
});

test("owner approval during the model wait replaces the initial pending prompt", async () => {
  const db = dbForTest(), oid = owner(db);
  let finish!: (r: CheckOutcome) => void, started!: (id: string) => void;
  const checkStarted = new Promise<string>((resolve) => { started = resolve; });
  const live: ApprovalChecker = { by: BASETEN_MODEL, check: vi.fn<ApprovalChecker["check"]>((id, _digest, _input, onStart) => {
    onStart?.();
    started(id);
    return new Promise((resolve) => { finish = resolve; });
  }) };
  const c = await client(db, oid, live);
  const pendingReceipt = request(c, "approved-during-check");
  const id = await checkStarted;
  db.prepare("UPDATE approvals SET state='approved',decided_at=? WHERE id=?").run(new Date().toISOString(), id);
  finish(output());
  const receipt = await pendingReceipt;
  expect(receipt).toMatchObject({ state: "approved", check: { state: "ok" } });
  expect(receipt).not.toHaveProperty("owner_instruction");
  expect(receipt.assistant_instruction).toContain("The owner approved this exact content");
  expect(receipt.assistant_instruction).toContain("Do not ask them to approve it again");
  expect(live.check).toHaveBeenCalledTimes(1);
});

test.each([null, "unknown-provider"])("valid ok output without recognized provenance (%s) cannot be returned as a pass", async (by) => {
  const db = dbForTest(), oid = owner(db), id = approval(db, oid);
  db.prepare("UPDATE approvals SET check_state='ok',check_json=?,check_by=? WHERE id=?").run(JSON.stringify(ok), by, id);
  const c = await client(db, oid, checker());
  expect(approvalCheckReceipt(getApproval(db, oid, id)!)).toEqual({ state: "unavailable", by, reason: "invalid_output" });
  expect((await get(c, id)).check).toEqual({ state: "unavailable", by, reason: "invalid_output" });
});

test("new assistant-approved and standing-rule approvals are checked without changing their state", async () => {
  const db = dbForTest(), oid = owner(db), live = checker(output(review)), c = await client(db, oid, live);
  const assistant = await request(c, "assistant", { owner_confirmation: "Yes, send." });
  expect(assistant).toMatchObject({ state: "approved", approved_in_assistant: true, check: { state: "review" } });
  db.prepare("INSERT INTO standing_approvals(id,owner_id,kind,max_amount_cents,max_per_day,expires_at,created_at) VALUES(?,?,'send_invoice',20000,10,?,?)").run("synthetic-rule", oid, new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
  const standing = await request(c, "standing", { action: { ...action, summary: "Send the second synthetic invoice." } });
  expect(standing).toMatchObject({ state: "approved", auto_approved: true, check: { state: "review" } });
  expect(live.check).toHaveBeenCalledTimes(2);
  expect((await get(c, standing.approval_id)).state).toBe("approved");
});

async function httpApp(mode: "test" | "disabled" | "public_cards", seedLedger?: (ledger: ModelQualityLedger) => void) {
  const db = dbForTest(), oid = owner(db), calls: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "approval-check-http-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const ledgerPath = join(dir, "ledger.db");
  const ledger = ModelQualityLedger.open(ledgerPath); seedLedger?.(ledger); ledger.close(); chmodSync(ledgerPath, 0o600);
  const fetchFn: FetchFn = async (_url, init) => {
    calls.push(String(init?.body));
    return new Response(JSON.stringify({ model: BASETEN_MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(ok) } }], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: mode, allowedHosts: ["127.0.0.1"], googleAllowedSubjects: [oid], modelPricingConfirmed: true, modelLedgerPath: ledgerPath, basetenApiKey: "synthetic-key", modelFetchFn: fetchFn };
  const { app } = createApp(cfg, db);
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  cleanup.push(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,'progress:read,progress:report',1,?)").run("synthetic-token", oid, sha256("synthetic-token-secret"), now);
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("synthetic-session"), oid, "synthetic-csrf", new Date(Date.now() + 3600_000).toISOString());
  const c = new Client({ name: "synthetic-http-approval-check", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: "Bearer synthetic-token-secret", connection: "close" } } }));
  cleanup.push(() => c.close());
  return { db, oid, c, calls, base, ledgerPath };
}

test("live app startup finalizes interrupted ledger rows without refund and allows one new check", async () => {
  const { c, calls, ledgerPath } = await httpApp("public_cards", (ledger) => {
    ledger.reserve("interrupted-check", "check_approval", "synthetic-hash", 12345);
  });
  const receipt = await request(c, "after-restart");
  expect(receipt.check).toMatchObject({ state: "ok", by: BASETEN_MODEL });
  expect(calls).toHaveLength(1);
  const ledger = ModelQualityLedger.open(ledgerPath);
  try {
    expect(ledger.get("interrupted-check")).toMatchObject({ status: "uncertain", error_code: "interrupted", allocated_micro_usd: 12345 });
    expect(ledger.reserve("interrupted-check", "check_approval", "synthetic-hash", 12345)).toMatchObject({ replayed: true, row: { status: "uncertain" } });
    expect((ledger.db.prepare("SELECT count(*) n FROM mq_attempts").get() as { n: number }).n).toBe(2);
  } finally { ledger.close(); }
});

test.each(["test", "disabled", "public_cards"] as const)("app %s mode uses the intended checker and includes all check fields in owner export", async (mode) => {
  const { c, calls, base, ledgerPath } = await httpApp(mode);
  const receipt = await request(c, "http-check");
  expect(receipt.state).toBe("pending");
  if (mode === "disabled") expect(receipt.check).toMatchObject({ state: "unavailable", reason: "disabled" });
  else expect(receipt.check).toMatchObject({ state: "ok", by: mode === "test" ? "mock" : BASETEN_MODEL });
  expect(calls).toHaveLength(mode === "public_cards" ? 1 : 0);
  const response = await fetch(`${base}/export`, { headers: { cookie: "lp_session=synthetic-session", connection: "close" } });
  expect(response.status).toBe(200);
  const exported = await response.json() as { approvals: Record<string, unknown>[] };
  expect(exported.approvals).toHaveLength(1);
  expect(exported.approvals[0]).toMatchObject({ check_state: receipt.check.state, check_by: receipt.check.by, check_json: expect.any(String) });
  expect(exported.approvals[0]).toHaveProperty("check_at");
  const ledger = ModelQualityLedger.open(ledgerPath);
  try { expect((ledger.db.prepare("SELECT count(*) n FROM mq_attempts WHERE job='check_approval'").get() as { n: number }).n).toBe(mode === "public_cards" ? 1 : 0); }
  finally { ledger.close(); }
});
