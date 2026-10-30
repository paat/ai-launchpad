import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256, type Db } from "../src/db.js";
import { BASETEN_MODEL, ModelQualityLedger, payloadHash, reservationMicroUsd, type FetchFn } from "../src/model-quality.js";
import { openExistingPublicLedger } from "../src/model-public-cards.js";
import {
  MAX_EXISTING_LABELS, UNMET_NEED_NEXT, UNMET_NEED_RECHECK_MS, buildModelInput, cleanText, deidentify, liveClassifier, mockClassifier,
  PLACEHOLDERS, parseClassification, recordUnmetNeed, unmetNeedRequestId,
} from "../src/unmet-needs.js";
import { demandBody, unmetNeedsBody } from "../src/views.js";

// Fake-only: global fetch may reach the local test server and nothing else.
const nativeFetch = globalThis.fetch;
const localOrigins = new Set<string>();
beforeAll(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (localOrigins.has(url.origin)) return nativeFetch(input as RequestInfo, init);
    throw new Error(`External network prohibited: ${url.origin}`);
  }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = nativeFetch; });

const KEY = "synthetic-key-not-real";
const SUB = "synthetic-subject-a", SUB_B = "synthetic-subject-b";
const COMPANY = "Synthetic Secret Workspace", EMAIL = "owner-a@example.invalid";

describe("deidentify", () => {
  const cases: [string, string][] = [
    ["Mail mari.maasikas+vat@example.ee about it", "Mail [email] about it"],
    ["see https://portal.example.ee/x?id=7 and www.example.com/a", "see [url] and [url]"],
    ["upload to e-arveldaja.rik.ee daily", "upload to [url] daily"],
    ["IBAN EE38 2200 2210 2014 5685 at bank", "IBAN [iban] at bank"],
    ["account EE382200221020145685.", "account [iban]."],
    ["lowercase ee38 2200 2210 2014 5685", "lowercase [iban]"],
    ["call +372 5123 4567 today", "call [phone] today"],
    ["or 0037251234567", "or [phone]"],
    ["mobile 5123 4567 or 51234567", "mobile [phone] or [phone]"],
    ["isikukood 38001085718 here", "isikukood [personal_code] here"],
    ["registry code 12345678 OÜ", "registry code [registry_code] OÜ"],
    ["card 4111 1111 1111 1111 expired", "card [card] expired"],
    ["card 4111-1111-1111-1111", "card [card]"],
    ["pay €1 200,50 now", "pay [amount] now"],
    ["pay 1200 EUR and 350 eurot and 99€", "pay [amount] and [amount] and [amount]"],
    ["fee EUR 40", "fee [amount]"],
    ["invoice 4500012 is late", "invoice [number] is late"],
    ["ref 12 34 56 78", "ref [number]"],
    ["contract with Demo Supplier OÜ ends", "contract with [company] ends"],
    ["Connect my Coop Pank account", "Connect my Coop Pank account"],
    ["File my VAT return for Q3 2026", "File my VAT return for Q3 2026"],
    ["Esita käibedeklaratsioon ja TSD", "Esita käibedeklaratsioon ja TSD"],
    // Separated digit groups (≥ 7 digits in total) become one placeholder.
    ["isikukood 380.0108.5718", "isikukood [number]"],
    ["code 3800 1085 718 here", "code [number] here"],
    ["ref 12-34-56-78", "ref [number]"],
    ["id 380/0108/5718.", "id [number]."],
    ["nr 38 00 10 85 718", "nr [number]"],
    ["acct 221 - 020 - 145 685", "acct [number]"],
    ["version 1.2.3 and 10.0.3 stay", "version 1.2.3 and 10.0.3 stay"],
    // Bare domains on any alphabetic TLD.
    ["upload at portal.example.xyz", "upload at [url]"],
    ["see foo.co.ee.", "see [url]."],
    ["via api.demo-supplier.shop/v1/upload now", "via [url] now"],
    ["at PORTAL.EXAMPLE.XYZ now", "at [url] now"],
    ["test.example.museum", "[url]"],
    ["Use e.g. the portal, etc. and i.e. more. Next step", "Use e.g. the portal, etc. and i.e. more. Next step"],
    ["upgrade to v2.4.1 first", "upgrade to v2.4.1 first"],
    // Company names in any case before a legal form.
    ["contract with demo supplier OÜ ends", "contract with [company] ends"],
    ["contract with DEMO SUPPLIER OÜ ends", "contract with [company] ends"],
    ["contract with demo supplier oü ends", "contract with [company] ends"],
    ["invoice from näidis ehitus AS today", "invoice from [company] today"],
    ["member of korteri ühistu kü", "member of [company]"],
    ["grant for demo selts mtü and Demo Fond SA", "grant for [company] and [company]"],
    ["registered as demo trading fie", "registered as [company]"],
    ["the same as last month, pay as you go", "the same as last month, pay as you go"],
    ["Kas sa saad aidata", "Kas sa saad aidata"],
    // Legal form first, and a comma before the legal form (tribunal T-001).
    ["leping OÜ Näidis Ehitus lõpeb", "leping [company] lõpeb"],
    ["invoice from AS Demo Trading today.", "invoice from [company] today."],
    ["contract with Demo Supplier, OÜ ends", "contract with [company] ends"],
    ["contract with demo supplier, oü ends", "contract with [company] ends"],
    ["minu OÜ ei saa seda teha", "minu OÜ ei saa seda teha"],
    ["minu OÜ", "minu OÜ"],
    ["registered an OÜ The next step", "registered an OÜ The next step"],
  ];
  test.each(cases)("%s", (input, expected) => {
    expect(deidentify(input)).toBe(expected);
    expect(deidentify(expected)).toBe(expected); // idempotent
  });
  test("idempotent, no identifier survives a mixed synthetic message", () => {
    const raw = "Mari (mari@example.ee, +372 5123 4567, isikukood 49001010000) wants Demo Supplier OÜ (12345678) paid €1 500 from EE38 2200 2210 2014 5685, see https://x.example.ee";
    const out = deidentify(raw);
    for (const leak of ["mari@", "5123", "49001010000", "Demo Supplier", "12345678", "1 500", "EE38", "https", "example"]) expect(out).not.toContain(leak);
    expect(deidentify(out)).toBe(out);
    expect(out).toMatch(/\[email\].*\[phone\].*\[personal_code\].*\[company\].*\[registry_code\].*\[amount\].*\[iban\].*\[url\]/);
  });
  test("company names in every legal-form position never reach the classifier input", () => {
    const raw = "We pay OÜ Näidis Ehitus, then AS Demo Trading and Demo Supplier, OÜ";
    const input = buildModelInput(deidentify(cleanText(raw)), "no_connector", []);
    for (const leak of ["Näidis", "Ehitus", "Demo", "Trading", "Supplier"]) expect(input).not.toContain(leak);
    expect(JSON.parse(input).need).toBe("We pay [company], then [company] and [company]");
  });
  test("ordinary prose words are not mistaken for an IBAN", () => {
    expect(deidentify("ab12 test case word")).toBe("ab12 test case word");
  });
});

describe("strict classification output", () => {
  const ok = { category: "tax_filings", demand_label: "VAT return filing", same_as: null, spec: "Prepare and submit the periodic VAT return through the tax portal." };
  const parse = (v: unknown, labels: string[] = []) => parseClassification(typeof v === "string" ? v : JSON.stringify(v), labels);
  test("valid output, optional json fence, same_as normalized to an existing label", () => {
    expect(parse(ok)).toEqual({ ok: true, value: ok });
    expect(parse("```json\n" + JSON.stringify(ok) + "\n```")).toMatchObject({ ok: true });
    expect(parse({ ...ok, same_as: "vat  RETURN filing" }, ["VAT return filing"])).toEqual({ ok: true, value: { ...ok, same_as: "VAT return filing" } });
  });
  test("invalid shapes are rejected, never repaired", () => {
    for (const bad of [
      "not json", "[]", "null", `Here you go: ${JSON.stringify(ok)}`,
      { ...ok, extra: 1 }, { category: ok.category, demand_label: ok.demand_label, spec: ok.spec },
      { ...ok, category: "crypto" }, { ...ok, demand_label: "x".repeat(81) }, { ...ok, demand_label: "ab" },
      { ...ok, spec: "y".repeat(201) }, { ...ok, spec: "line one\nline two is here" }, { ...ok, spec: 5 },
      { ...ok, same_as: "A label nobody published" }, { ...ok, same_as: 3 },
    ]) expect(parse(bad), JSON.stringify(bad)).toEqual({ ok: false, reason: "invalid_output" });
  });
  test("output that de-identification would change is rejected", () => {
    expect(parse({ ...ok, spec: "Pay the €1 200 VAT for the owner from the bank account." })).toEqual({ ok: false, reason: "identifiers_in_output" });
    expect(parse({ ...ok, demand_label: "Mail owner@example.ee" })).toEqual({ ok: false, reason: "identifiers_in_output" });
  });
  test("output carrying a typed placeholder is invalid, never published (#32 item 2)", () => {
    expect(PLACEHOLDERS).toEqual(expect.arrayContaining(["[email]", "[url]", "[iban]", "[phone]", "[amount]", "[company]", "[card]", "[personal_code]", "[registry_code]", "[number]"]));
    for (const p of PLACEHOLDERS) {
      expect(parse({ ...ok, spec: `Send the reminder to ${p} through the owner's mail tool.` }), p).toEqual({ ok: false, reason: "invalid_output" });
      expect(parse({ ...ok, demand_label: `Invoices for ${p.toUpperCase()}` }), p).toEqual({ ok: false, reason: "invalid_output" });
    }
    // Ordinary brackets are not placeholders.
    expect(parse({ ...ok, spec: "Prepare the VAT return [monthly] through the tax portal." })).toMatchObject({ ok: true });
  });
  test("label and spec must contain no digits at all (prompt contract)", () => {
    expect(parse({ ...ok, spec: "Pay 1200 for the form through the tax portal." })).toEqual({ ok: false, reason: "identifiers_in_output" });
    expect(parse({ ...ok, demand_label: "Form 390 filing" })).toEqual({ ok: false, reason: "identifiers_in_output" });
  });
  test("model input carries only need, blocker and at most 30 public labels within the ledger bound", () => {
    const labels = Array.from({ length: 40 }, (_, i) => `Published demand label number ${String.fromCharCode(65 + (i % 26))}${i}`.slice(0, 80));
    const input = buildModelInput("x".repeat(600), "no_connector", labels);
    const parsed = JSON.parse(input);
    expect(Object.keys(parsed)).toEqual(["need", "blocker", "existing_labels"]);
    expect(parsed.existing_labels.length).toBeLessThanOrEqual(MAX_EXISTING_LABELS);
    expect(input.length).toBeLessThanOrEqual(2000);
    expect(JSON.parse(buildModelInput("short", "unclear", labels.slice(0, 3))).existing_labels).toEqual(labels.slice(0, 3));
  });
});

// --- live classifier against the existing ledger --------------------------

const tmpDir = () => mkdtempSync(join(tmpdir(), "un-"));
/** Recognized existing 0600 ledger seeded like production (n × USD 2). */
function ledgerFile(seed = 0, status = "completed"): string {
  const path = join(tmpDir(), "ledger.db");
  const l = ModelQualityLedger.open(path);
  for (let i = 1; i <= seed; i++) {
    l.reserve(`quality-seed-${i}`, "setup_guidance", payloadHash("setup_guidance", `seed ${i}`), 2_000_000);
    if (status !== "pending") l.finalize(`quality-seed-${i}`, { status: status as "completed", output: "OPERATOR-ONLY" });
  }
  l.close();
  chmodSync(path, 0o600);
  return path;
}
const classification = (o: Record<string, unknown> = {}) => JSON.stringify({ category: "tax_filings", demand_label: "VAT return filing", same_as: null, spec: "Prepare and submit the periodic VAT return through the tax portal.", ...o });
const chat = (content: string, completion = 60) => new Response(JSON.stringify({
  model: BASETEN_MODEL, choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 400, completion_tokens: completion, total_tokens: 400 + completion },
}), { status: 200, headers: { "content-type": "application/json" } });
function fakeModel(handler: (n: number, body: Record<string, unknown>) => Response | Promise<Response>) {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    bodies.push(body);
    return handler(bodies.length, body);
  }) as unknown as FetchFn;
  return { bodies, fetchFn };
}

test("production-seeded ledger (4 × USD 2) allows ≥ 40 worst-case classify attempts, then budget_exhausted with no fetch", { timeout: 60_000 }, async () => {
  const ledger = openExistingPublicLedger(ledgerFile(4));
  const { bodies, fetchFn } = fakeModel(() => chat(classification()));
  const live = liveClassifier({ ledger, apiKey: KEY, fetchFn });
  const worst = "€".repeat(2000); // largest valid input
  let done = 0;
  for (;;) {
    const r = await live.classify(`need_${done}`, worst);
    if (r.kind !== "text") { expect(r).toEqual({ kind: "failed", reason: "budget_exhausted" }); break; }
    done++;
  }
  expect(done).toBe(Math.floor(2_000_000 / reservationMicroUsd("classify_unmet_need", worst))); // 73
  expect(done).toBeGreaterThanOrEqual(40);
  expect(bodies).toHaveLength(done); // the refused attempt made no call
  expect(bodies.every((b) => b.max_tokens === 512)).toBe(true);
  const agg = ledger.db.prepare("SELECT COUNT(*) n, SUM(allocated_micro_usd) s FROM mq_attempts").get() as { n: number; s: number };
  expect(agg.n).toBe(4 + done);
  expect(agg.s).toBeLessThanOrEqual(10_000_000);
  ledger.close();
});

test("replay by derived request id never obtains a second inference", async () => {
  const ledger = openExistingPublicLedger(ledgerFile(0));
  const { bodies, fetchFn } = fakeModel(() => chat(classification()));
  const live = liveClassifier({ ledger, apiKey: KEY, fetchFn });
  const input = buildModelInput("File the VAT return", "portal_without_api", []);
  expect(await live.classify("need_x", input)).toEqual({ kind: "text", text: classification() });
  expect(await live.classify("need_x", input)).toEqual({ kind: "text", text: classification() });
  expect(bodies).toHaveLength(1);
  expect(unmetNeedRequestId("need_x")).toMatch(/^un1\.[0-9a-f]{48}$/);
  expect(ledger.get(unmetNeedRequestId("need_x"))?.allocated_micro_usd).toBe(reservationMicroUsd("classify_unmet_need", input));
  // Same request id with a different input is a conflict, not a new call.
  expect(await live.classify("need_x", buildModelInput("Other", "unclear", []))).toEqual({ kind: "failed", reason: "request_conflict" });
  expect(bodies).toHaveLength(1);
  ledger.close();
});

test("mock classifier is deterministic and labelled mock", async () => {
  const r = await mockClassifier.classify("n", buildModelInput("File my VAT return", "portal_without_api", ["Tax filings: portal without an API"]));
  expect(mockClassifier.by).toBe("mock");
  expect(r.kind).toBe("text");
  const parsed = parseClassification((r as { text: string }).text, ["Tax filings: portal without an API"]);
  expect(parsed).toMatchObject({ ok: true, value: { category: "tax_filings", same_as: "Tax filings: portal without an API" } });
  expect((parsed as { value: { spec: string } }).value.spec).toMatch(/^Mock classification/);
});

// --- app integration -------------------------------------------------------

type Started = { db: Db; base: string; queue: { idle: () => Promise<void> }; close: () => Promise<void> };
async function start(overrides: Partial<Config> = {}, db: Db = openDb(":memory:")): Promise<Started> {
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"], ...overrides };
  const { app, unmetNeeds } = createApp(cfg, db);
  const server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cfg.baseUrl = base;
  localOrigins.add(base);
  return { db, base, queue: unmetNeeds, close: () => new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); }) };
}
const liveCfg = (path: string, fetchFn: FetchFn): Partial<Config> => ({ modelMode: "public_cards", googleAllowedSubjects: [SUB, SUB_B], modelPricingConfirmed: true, basetenApiKey: KEY, modelLedgerPath: path, modelFetchFn: fetchFn });
function makeOwner(db: Db, id: string, subject: string, opts: { reporting?: boolean; scopes?: string } = {}) {
  db.prepare("INSERT INTO owners(id,subject,email,kind,reporting_enabled,created_at) VALUES(?,?,?,?,?,?)").run(id, subject, EMAIL, "google", opts.reporting === false ? 0 : 1, new Date().toISOString());
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `ws-${id}`, COMPANY);
  const raw = `raw-${id}`, csrf = `csrf-${id}`, token = `lp_token_${id}`;
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(raw), id, csrf, new Date(Date.now() + 3600_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,?,1,?)").run(`tok_${id}`, id, sha256(token), opts.scopes ?? "progress:read,progress:report", new Date().toISOString());
  return { id, raw, csrf, token };
}
type Owner = ReturnType<typeof makeOwner>;
async function tool(s: Started, o: Owner, args: Record<string, unknown>) {
  const c = new Client({ name: "test", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${s.base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${o.token}` } } }));
  try {
    const r = await c.callTool({ name: "report_unmet_need", arguments: args }) as { isError?: boolean; content: { text: string }[] };
    return { isError: !!r.isError, text: r.content[0].text, data: r.isError ? null : JSON.parse(r.content[0].text) };
  } finally { await c.close(); }
}
async function http(s: Started, path: string, opts: { cookie?: string; fields?: Record<string, string>; origin?: string | null } = {}) {
  const origin = opts.origin === undefined ? s.base : opts.origin;
  return fetch(s.base + path, {
    method: opts.fields ? "POST" : "GET", redirect: "manual",
    headers: { connection: "close", ...(opts.cookie ? { cookie: `lp_session=${opts.cookie}` } : {}), ...(opts.fields ? { "content-type": "application/x-www-form-urlencoded", ...(origin !== null ? { origin } : {}) } : {}) },
    body: opts.fields ? new URLSearchParams(opts.fields) : undefined,
  });
}
const needRow = (db: Db, id: string) => db.prepare("SELECT * FROM unmet_needs WHERE id=?").get(id) as Record<string, string | null>;
const RAW_NEED = "File the VAT return for Demo Supplier OÜ (12345678), pay €1 200 from EE38 2200 2210 2014 5685, mail mari@example.ee";

test("report_unmet_need: scope, sharing, de-identified storage, receipt, idempotency and conflict (mock mode)", async () => {
  const s = await start();
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    const readOnly = makeOwner(s.db, "own_r", `google:${SUB_B}`, { scopes: "progress:read" });
    const off = makeOwner(s.db, "own_off", "google:off", { reporting: false });
    const args = { report_id: "need-1", need: RAW_NEED, blocker: "portal_without_api", job_hint: "VAT for Demo Supplier OÜ" };
    expect((await tool(s, readOnly, args)).text).toBe("The owner connected you read-only. Tell the owner: „Et saaksin seda sinu eest ette valmistada, ühenda mind AI-hüppelauaga uuesti ja luba nõusolekulehel töid ette valmistada.” When reconnecting, request the progress:report scope; the owner must allow it on the consent page. Nothing was saved.");
    expect((await tool(s, off, args)).text).toContain("Progress sharing is stopped");
    expect((await tool(s, a, { ...args, blocker: "anything" })).isError).toBe(true);
    expect((await tool(s, a, { ...args, need: "x".repeat(601) })).isError).toBe(true);
    expect((await tool(s, a, { ...args, owner: "forged" })).text).toContain("Unexpected field");
    expect(s.db.prepare("SELECT count(*) n FROM unmet_needs").get()).toEqual({ n: 0 });

    const r1 = await tool(s, a, args);
    expect(r1.data).toEqual({ need_id: expect.stringMatching(/^need_/), state: "received", next: UNMET_NEED_NEXT });
    const row = needRow(s.db, r1.data.need_id);
    expect(row.need_redacted).toBe("File the VAT return for [company] ([registry_code]), pay [amount] from [iban], mail [email]");
    expect(row.job_hint_redacted).toBe("VAT for [company]");
    // The raw text is never stored anywhere in the app database.
    const dump = JSON.stringify(s.db.prepare("SELECT * FROM unmet_needs").all()) + JSON.stringify(s.db.prepare("SELECT * FROM activity").all());
    for (const leak of ["Demo Supplier", "12345678", "1 200", "EE38", "mari@"]) expect(dump).not.toContain(leak);

    expect((await tool(s, a, args)).data).toEqual(r1.data); // idempotent replay
    expect((await tool(s, a, { ...args, need: "Something else" })).text).toContain("Conflict");
    expect(s.db.prepare("SELECT count(*) n FROM unmet_needs").get()).toEqual({ n: 1 });

    await s.queue.idle();
    const done = needRow(s.db, r1.data.need_id);
    expect(done).toMatchObject({ state: "classified", category: "tax_filings", classified_by: "mock" });
    expect(done.spec).toMatch(/^Mock classification/);
    const acts = (s.db.prepare("SELECT actor,action,outcome FROM activity WHERE owner_id='own_a' ORDER BY id").all() as { actor: string; action: string; outcome: string }[]).map((x) => `${x.actor}:${x.action}:${x.outcome}`);
    expect(acts).toEqual(["assistant:report_unmet_need:ok", "launchpad:unmet_need_classified:ok"]);
  } finally { await s.close(); }
});

test("report_unmet_need tells the assistant to keep names of people out, in the tool and in the need field (#32 item 1)", async () => {
  const s = await start();
  const o = makeOwner(s.db, "names", SUB);
  const c = new Client({ name: "test", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${s.base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${o.token}` } } }));
  try {
    const t = (await c.listTools()).tools.find((x) => x.name === "report_unmet_need")!;
    const rule = "Describe the job generically; never include names of people, customers or employees.";
    expect(t.description).toContain(rule);
    expect((t.inputSchema.properties as Record<string, { description?: string }>).need.description).toContain(rule);
  } finally { await c.close(); await s.close(); }
});
test("payload_hash covers only the de-identified fields, never the raw text; replay and conflict still hold", () => {
  const db = openDb(":memory:");
  const args = { report_id: "h-1", need: RAW_NEED, blocker: "portal_without_api" as const, job_hint: "VAT for Demo Supplier OÜ" };
  const r = recordUnmetNeed(db, "own_a", args) as { receipt: { need_id: string } };
  const row = needRow(db, r.receipt.need_id);
  expect(row.payload_hash).toBe(sha256(JSON.stringify([args.report_id, row.need_redacted, args.blocker, row.job_hint_redacted])));
  expect(row.payload_hash).not.toBe(sha256(JSON.stringify([args.report_id, args.need, args.blocker, args.job_hint])));
  expect(recordUnmetNeed(db, "own_a", args)).toEqual({ receipt: r.receipt, created: false });
  expect(recordUnmetNeed(db, "own_a", { ...args, need: "Something else" })).toEqual({ error: "Conflict: report_id already used with a different payload." });
});

test("per-owner caps: 20 needs per day, 200 total, 10 classifications per day (rest visibly waiting)", async () => {
  const s = await start();
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    for (let i = 0; i < 12; i++) expect((await tool(s, a, { report_id: `n-${i}`, need: `Synthetic need ${i}`, blocker: "no_connector" })).isError).toBe(false);
    await s.queue.idle();
    const states = s.db.prepare("SELECT state,reason,count(*) n FROM unmet_needs GROUP BY state,reason ORDER BY state").all();
    expect(states).toEqual([{ state: "classified", reason: null, n: 10 }, { state: "received", reason: "owner_daily_limit", n: 2 }]);
    const html = await (await http(s, "/", { cookie: a.raw })).text();
    expect(html).toContain("päevane liigituste piir (10 päevas)");
    expect(s.db.prepare("SELECT count(*) n FROM activity WHERE action='unmet_need_classification' AND outcome='deferred'").get()).toEqual({ n: 2 });

    for (let i = 12; i < 20; i++) expect((await tool(s, a, { report_id: `n-${i}`, need: `Synthetic need ${i}`, blocker: "no_connector" })).isError).toBe(false);
    const over = await tool(s, a, { report_id: "n-20", need: "One too many", blocker: "no_connector" });
    expect(over.text).toContain("daily limit reached (20 per day)");
    // Old rows count toward the 200 total but not the daily cap.
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`);
    const ins = s.db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'kept_private','2000-01-01','2000-01-01')");
    for (let i = 0; i < 199; i++) ins.run(`old-${i}`, "own_b", `old-${i}`, "h", "old", "unclear");
    expect((await tool(s, b, { report_id: "new", need: "x", blocker: "unclear" })).isError).toBe(false);
    expect((await tool(s, b, { report_id: "full", need: "x", blocker: "unclear" })).text).toContain("storage limit reached (200)");
    await s.queue.idle();
  } finally { await s.close(); }
});

test("deferred needs are re-kicked on a timer: daily-limited needs reach classified without a new report or restart", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const s = await start();
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    for (let i = 0; i < 12; i++) expect((await tool(s, a, { report_id: `n-${i}`, need: `Synthetic need ${i}`, blocker: "no_connector" })).isError).toBe(false);
    await s.queue.idle();
    expect(s.db.prepare("SELECT count(*) n FROM unmet_needs WHERE state='received' AND reason='owner_daily_limit'").get()).toEqual({ n: 2 });
    // A day later: the earlier classifications fall out of the daily window.
    s.db.prepare("UPDATE unmet_needs SET classify_started_at='2000-01-01T00:00:00.000Z' WHERE classify_started_at IS NOT NULL").run();
    vi.advanceTimersByTime(UNMET_NEED_RECHECK_MS);
    await s.queue.idle();
    expect(s.db.prepare("SELECT state,count(*) n FROM unmet_needs GROUP BY state").all()).toEqual([{ state: "classified", n: 12 }]);
  } finally { vi.useRealTimers(); await s.close(); }
});

test("a failed classification never reads as classified by the model", () => {
  const need = { id: "need_f", state: "classification_failed", reason: "invalid_output", need_redacted: "File VAT", blocker: "portal_without_api", job_hint_redacted: null, category: null, demand_label: null, same_as: null, spec: null, classified_by: BASETEN_MODEL, created_at: "2026-10-30T10:00:00.000Z" };
  const failed = unmetNeedsBody({ csrf: "c", needs: [need], lang: "en" });
  expect(failed).not.toMatch(/classified by|Liigitas/i);
  expect(failed).toContain("classification attempt failed");
  const kept = unmetNeedsBody({ csrf: "c", needs: [{ ...need, state: "kept_private", reason: null, category: "tax_filings", demand_label: "VAT return filing", spec: "Prepare the VAT return." }], lang: "en" });
  expect(kept).toMatch(new RegExp(`Classified by.*Meta ${BASETEN_MODEL} \\(live\\)`, "s"));
});

test("/demand hero credits Meta's model only when a published item was classified live", () => {
  const item = { label: "Bank account connector", count: 1, category: "banking_payments" as const, spec: "Read balances.", firstSeen: "2026-09", lastSeen: "2026-09", live: 0, mock: 1 };
  const lede = (html: string) => html.match(/<p class="lede">(.*?)<\/p>/)![1];
  expect(lede(demandBody([item], "en"))).toContain("classified by a local test classifier (sample).");
  expect(lede(demandBody([item], "en"))).not.toContain("Meta");
  expect(lede(demandBody([item, { ...item, label: "Other", live: 1, mock: 0 }], "en"))).toContain("classified by Meta's open model Muse Spark Open.");
  expect(lede(demandBody([], "en"))).toBe("What Estonian businesses asked their AI assistants to do that no connector can do yet. Anonymous, owner-approved.");
  expect(lede(demandBody([item], "et"))).toContain("liigitanud kohalik testliigitaja (näidis).");
  // Card labels: live model output carries the AI chip; mock output is a sample.
  expect(demandBody([item], "et")).toContain('<span class="label-chip label-chip--sample">Näidis</span>');
  expect(demandBody([{ ...item, live: 1, mock: 0 }], "et")).toContain("AI liigitus · Meta Muse Spark Open");
});

test("disabled mode never classifies; need stays visibly received", async () => {
  const s = await start({ modelMode: "disabled" });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    const r = await tool(s, a, { report_id: "d", need: "Connect my bank", blocker: "no_connector" });
    await s.queue.idle();
    expect(needRow(s.db, r.data.need_id)).toMatchObject({ state: "received", reason: "classification_unavailable", classified_by: null });
    expect(await (await http(s, "/", { cookie: a.raw })).text()).toContain("liigitamine pole selles serveris praegu saadaval");
  } finally { await s.close(); }
});

test("disabled mode also moves an interrupted classifying row to visibly unavailable", async () => {
  const db = openDb(":memory:");
  const a = makeOwner(db, "own_a", `google:${SUB}`);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,model_input,classify_started_at,created_at,updated_at) VALUES('need_stuck','own_a','s','h','File VAT','portal_without_api','classifying',?,?,?,?)").run(buildModelInput("File VAT", "portal_without_api", []), now, now, now);
  const s = await start({ modelMode: "disabled" }, db);
  try {
    await s.queue.idle();
    expect(needRow(db, "need_stuck")).toMatchObject({ state: "received", reason: "classification_unavailable", classified_by: null });
    expect(await (await http(s, "/", { cookie: a.raw })).text()).toContain("liigitamine pole selles serveris praegu saadaval");
  } finally { await s.close(); }
});

test("live mode: only de-identified need, blocker and public labels reach the model on the same ledger; tool never waits", async () => {
  const path = ledgerFile(4);
  let release!: () => void;
  const gate = new Promise<void>((ok) => { release = ok; });
  const { bodies, fetchFn } = fakeModel(async () => { await gate; return chat(classification()); });
  const s = await start(liveCfg(path, fetchFn));
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    // A previously published label from another owner is public data.
    s.db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,category,demand_label,spec,classified_by,decided_at,created_at,updated_at) VALUES('need_pub','own_z','p','h','private text Z','no_connector','published','banking_payments','Bank account connector','Read balances.','mock','2026-10-01','2026-10-01','2026-10-01')").run();
    const r = await tool(s, a, { report_id: "live-1", need: RAW_NEED, blocker: "portal_without_api", job_hint: "VAT" });
    expect(r.data.state).toBe("received"); // returned while the provider is still blocked
    for (let i = 0; i < 100 && bodies.length === 0; i++) await new Promise((ok) => setTimeout(ok, 10));
    expect(needRow(s.db, r.data.need_id).state).toBe("classifying");
    release();
    await s.queue.idle();
    expect(bodies).toHaveLength(1);
    const user = (bodies[0].messages as { role: string; content: string }[]).find((m) => m.role === "user")!.content;
    expect(JSON.parse(user)).toEqual({ need: "File the VAT return for [company] ([registry_code]), pay [amount] from [iban], mail [email]", blocker: "portal_without_api", existing_labels: ["Bank account connector"] });
    const sent = JSON.stringify(bodies[0]);
    for (const leak of ["own_a", SUB, COMPANY, EMAIL, "ws-own_a", "private text Z", "VAT\"", "live-1", r.data.need_id]) expect(sent).not.toContain(leak);
    expect(bodies[0].max_tokens).toBe(512);
    expect(needRow(s.db, r.data.need_id)).toMatchObject({ state: "classified", classified_by: BASETEN_MODEL, demand_label: "VAT return filing" });
    // Same single ledger: 4 production seeds + this one attempt, stored reservation.
    const l = openExistingPublicLedger(path);
    try {
      const row = l.get(unmetNeedRequestId(r.data.need_id))!;
      expect(row).toMatchObject({ job: "classify_unmet_need", status: "completed", allocated_micro_usd: reservationMicroUsd("classify_unmet_need", user) });
      expect(l.db.prepare("SELECT count(*) n FROM mq_attempts").get()).toEqual({ n: 5 });
      expect(JSON.stringify(l.db.prepare("SELECT * FROM mq_attempts").all())).not.toContain("own_a");
    } finally { l.close(); }
  } finally { await s.close(); }
});

test("restart replays an interrupted classification from the ledger with no second fetch", async () => {
  const path = ledgerFile(0);
  const { bodies, fetchFn } = fakeModel(() => chat(classification()));
  const db = openDb(":memory:");
  const s1 = await start(liveCfg(path, fetchFn), db);
  const a = makeOwner(db, "own_a", `google:${SUB}`);
  const r = await tool(s1, a, { report_id: "restart", need: "File VAT", blocker: "portal_without_api" });
  await s1.queue.idle();
  await s1.close();
  expect(bodies).toHaveLength(1);
  // Crash after the ledger finalized but before the app recorded the result.
  db.prepare("UPDATE unmet_needs SET state='classifying', category=NULL, demand_label=NULL, spec=NULL, classified_by=NULL WHERE id=?").run(r.data.need_id);
  const s2 = await start(liveCfg(path, fetchFn), db);
  try {
    await s2.queue.idle();
    expect(needRow(db, r.data.need_id)).toMatchObject({ state: "classified", demand_label: "VAT return filing" });
    expect(bodies).toHaveLength(1);
  } finally { await s2.close(); }
});

test("failure states are honest and terminal; ledger refusals map to visible states with no fetch", async () => {
  const run = async (ledgerPath: string, handler: (n: number) => Response, prep?: (db: Db, needId: string) => void) => {
    const { bodies, fetchFn } = fakeModel(handler);
    const db = openDb(":memory:");
    const s = await start(liveCfg(ledgerPath, fetchFn), db);
    try {
      const a = makeOwner(db, "own_a", `google:${SUB}`);
      const r = await tool(s, a, { report_id: "f", need: "File VAT", blocker: "portal_without_api" });
      await s.queue.idle();
      prep?.(db, r.data.need_id);
      return { row: needRow(db, r.data.need_id), calls: bodies.length, html: await (await http(s, "/", { cookie: a.raw })).text(), db };
    } finally { await s.close(); }
  };
  const failed = (reason: string) => ({ state: "classification_failed", reason, category: null, demand_label: null });
  let out = await run(ledgerFile(0), () => chat("Sure! The category is tax."));
  expect(out.row).toMatchObject(failed("invalid_output"));
  expect(out.html).toContain("Vastus ei olnud korrektne liigitus");
  out = await run(ledgerFile(0), () => chat(classification({ spec: "Pay the €1 200 VAT for the owner from the bank account." })));
  expect(out.row).toMatchObject(failed("identifiers_in_output"));
  out = await run(ledgerFile(0), () => new Response("secret-provider-detail", { status: 500 }));
  expect(out.row).toMatchObject(failed("provider_failed"));
  expect(JSON.stringify(out.row) + out.html).not.toContain("secret-provider-detail");
  out = await run(ledgerFile(0), () => chat(classification(), 513)); // over the job's 512 max_tokens
  expect(out.row).toMatchObject(failed("provider_contract_breach"));
  out = await run(ledgerFile(5), () => chat(classification()));
  expect(out.row).toMatchObject(failed("budget_exhausted"));
  expect(out.calls).toBe(0);
  expect(out.html).toContain("mudelieelarve on otsas");
  out = await run(ledgerFile(1, "provider_contract_breach"), () => chat(classification()));
  expect(out.row).toMatchObject(failed("suppressed_after_breach"));
  expect(out.calls).toBe(0);
  // Another unresolved ledger attempt: not started, visibly waiting, no new ledger row.
  const pendingPath = ledgerFile(1, "pending");
  out = await run(pendingPath, () => chat(classification()));
  expect(out.row).toMatchObject({ state: "received", reason: "attempt_in_flight", classify_started_at: null });
  expect(out.calls).toBe(0);
  expect(out.html).toContain("pole see veel alanud");
  const l = openExistingPublicLedger(pendingPath);
  try { expect(l.db.prepare("SELECT count(*) n FROM mq_attempts").get()).toEqual({ n: 1 }); } finally { l.close(); }
  // This need's own ledger row left pending by a crash: interrupted, never re-sent.
  const own = ledgerFile(0);
  const { bodies, fetchFn } = fakeModel(() => chat(classification()));
  const db = openDb(":memory:");
  makeOwner(db, "own_a", `google:${SUB}`);
  const input = buildModelInput("File VAT", "portal_without_api", []);
  db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,model_input,classify_started_at,created_at,updated_at) VALUES('need_crash','own_a','c','h','File VAT','portal_without_api','classifying',?,?,?,?)").run(input, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  { const lw = openExistingPublicLedger(own); lw.reserve(unmetNeedRequestId("need_crash"), "classify_unmet_need", payloadHash("classify_unmet_need", input), reservationMicroUsd("classify_unmet_need", input)); lw.close(); }
  const s = await start(liveCfg(own, fetchFn), db);
  try {
    await s.queue.idle();
    expect(needRow(db, "need_crash")).toMatchObject(failed("interrupted"));
    expect(bodies).toHaveLength(0);
  } finally { await s.close(); }
});

test("publish / keep private: session + CSRF + exact Origin, owner-scoped, one decision, activity logged", async () => {
  const s = await start();
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`);
    const n1 = (await tool(s, a, { report_id: "1", need: "Connect my Coop Pank account", blocker: "no_connector" })).data.need_id;
    const n2 = (await tool(s, a, { report_id: "2", need: "Sign the annual report", blocker: "needs_owner_pin_or_signature" })).data.need_id;
    await s.queue.idle();
    const status = await (await http(s, "/", { cookie: a.raw })).text();
    expect(status).toContain("Seda ei saa assistent sinu eest teha");
    expect(status).toContain("Avalda anonüümselt");
    expect(status).toContain("Jäta privaatseks");
    expect(status).toContain("Connect my Coop Pank account"); // redacted text, owner view only
    expect(status).toContain("Mida assistent saab teha:");
    expect(status).toContain("valmistab kõik ette; PIN-i või allkirja annad sina");
    expect(status).toContain("(valikuline)");
    expect(status).toContain("kohalik testliigitaja (näidis, mitte mudel)"); // technical detail
    // Estonian page, Estonian copy: the mock's English fixture text is derived from category and blocker; no AI tint (QA D-12, D-21).
    expect(status).toContain("Pank ja maksed: ühendust pole");
    expect(status).toContain("Näidis-liigitus, mitte mudel: teenus valdkonnas „Pank ja maksed”, mille takistus täna on: ühendust pole.");
    // The stored English text appears only in the lang="en" "exactly this will be public" preview (tribunal T-004).
    expect(status).toMatch(/<div lang="en"><p><strong>Banking[^<]*<\/strong><\/p><p class="small">Mock classification/);
    expect(status.replace(/<div lang="en">.*?<\/div>/gs, "")).not.toMatch(/Mock classification|local mock|Banking|class="ai-block"/);
    expect(status).not.toContain("AI liigitus · Meta Muse Spark Open"); // mock output is a sample, never "AI"
    expect(status).toContain("Täna pole sinult midagi vaja"); // undecided needs never count in the hero
    const decide = (o: Owner, fields: Record<string, string>, extra: { origin?: string | null } = {}) => http(s, "/unmet-needs/decide", { cookie: o.raw, fields, ...extra });
    expect((await decide(a, { csrf: "wrong", need_id: n1, decision: "publish" })).status).toBe(403);
    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "publish" }, { origin: "null" })).status).toBe(403);
    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "publish" }, { origin: "https://evil.invalid" })).status).toBe(403);
    expect((await http(s, "/unmet-needs/decide", { fields: { csrf: a.csrf, need_id: n1, decision: "publish" } })).status).toBe(302); // no session
    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "promote" })).status).toBe(400);
    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "publish", label: "forged" })).status).toBe(400);
    expect((await decide(b, { csrf: b.csrf, need_id: n1, decision: "publish" })).status).toBe(404); // another owner's need
    expect(needRow(s.db, n1).state).toBe("classified");

    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "publish" })).status).toBe(302);
    expect((await decide(a, { csrf: a.csrf, need_id: n2, decision: "keep_private" })).status).toBe(302);
    expect((await decide(a, { csrf: a.csrf, need_id: n1, decision: "keep_private" })).status).toBe(409); // one decision
    expect(needRow(s.db, n1).state).toBe("published");
    expect(needRow(s.db, n2).state).toBe("kept_private");
    const acts = (s.db.prepare("SELECT action FROM activity WHERE owner_id='own_a' AND actor='owner'").all() as { action: string }[]).map((x) => x.action);
    expect(acts).toEqual(["unmet_need_published", "unmet_need_kept_private"]);
    const after = await (await http(s, "/", { cookie: a.raw })).text();
    expect(after).toContain("Otsustatud soovid (2)");
    expect(after).toContain("Avaldatud anonüümselt");
    expect(after).toContain("Jäetud privaatseks");
  } finally { await s.close(); }
});

test("/demand is public, cacheable, aggregated, escaped, honest about classifier, and never leaks owner data", async () => {
  const path = ledgerFile(0);
  const label = "Tax portal <script>alert(origin)</script> filing";
  let n = 0;
  const { fetchFn } = fakeModel(() => chat(classification(++n === 1 ? { demand_label: label } : { demand_label: "Something new", same_as: label })));
  const s = await start(liveCfg(path, fetchFn));
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`);
    const n1 = (await tool(s, a, { report_id: "1", need: RAW_NEED, blocker: "portal_without_api", job_hint: "secret hint" })).data.need_id;
    await s.queue.idle();
    await http(s, "/unmet-needs/decide", { cookie: a.raw, fields: { csrf: a.csrf, need_id: n1, decision: "publish" } });
    const n2 = (await tool(s, b, { report_id: "2", need: "Submit the VAT return", blocker: "portal_without_api" })).data.need_id;
    await s.queue.idle();
    expect(needRow(s.db, n2).same_as).toBe(label); // model matched the published label
    await http(s, "/unmet-needs/decide", { cookie: b.raw, fields: { csrf: b.csrf, need_id: n2, decision: "publish" } });
    // A mock-classified published item from local mode, and an unpublished one.
    s.db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,category,demand_label,spec,classified_by,decided_at,created_at,updated_at) VALUES('need_m','own_b','m','h','mock text','no_connector','published','banking_payments','Bank account connector','Mock classification: read balances.','mock','2026-09-02','2026-09-02','2026-09-02')").run();
    s.db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,category,demand_label,spec,classified_by,created_at,updated_at) VALUES('need_c','own_b','c','h','classified text','no_connector','classified','other','Not yet published','Unpublished spec text.','mock','2026-09-02','2026-09-02')").run();

    const res = await http(s, "/demand"); // no cookie
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const html = await res.text();
    expect(html).toContain('<html lang="et">');
    expect(html).toContain("Mida Eesti ettevõtjad oma AI-assistendilt palusid, aga mida ükski ühendus veel teha ei oska. Anonüümne, omaniku loal, liigitanud Meta avatud mudel Muse Spark Open.");
    expect(html).toContain("Tax portal &lt;script&gt;alert(origin)&lt;/script&gt; filing");
    expect(html).not.toContain("<script>alert(origin)</script>");
    expect(html).toContain("2 soovi");
    expect(html).toContain(`Meta ${BASETEN_MODEL} (live) × 2`);
    expect(html).toContain("Liigitaja: kohalik testliigitaja (näidis, mitte mudel) × 1");
    expect(html.indexOf("Tax portal")).toBeLessThan(html.indexOf("Bank account connector")); // sorted by count
    expect(html).toMatch(/Esimest korda [a-zõäöü]+ \d{4} · viimati [a-zõäöü]+ \d{4}/);
    // English on request (?lang=en): same aggregate, not shared-cached because it sets the lang cookie.
    const en = await http(s, "/demand?lang=en");
    expect(en.headers.get("cache-control")).toBe("no-store");
    const enHtml = await en.text();
    expect(enHtml).toContain('<html lang="en">');
    expect(enHtml).toContain("What Estonian businesses asked their AI assistants to do that no connector can do yet. Anonymous, owner-approved, classified by Meta's open model Muse Spark Open.");
    expect(enHtml).toContain("2 requests");
    for (const leak of ["own_a", "own_b", SUB, COMPANY, EMAIL, "ws-own_a", "[company]", "[iban]", "secret hint", "mock text", "classified text", "Not yet published", "Unpublished spec", n1, n2, "Something new"]) expect(html, leak).not.toContain(leak);
    // Linked from the login page and the signed-in footer.
    expect(await (await http(s, "/login")).text()).toContain('href="/demand"');
    expect(await (await http(s, "/", { cookie: a.raw })).text()).toContain('href="/demand"');
  } finally { await s.close(); }
});

test("export includes unmet needs; delete removes them (and their public demand) without refunding the ledger", async () => {
  const path = ledgerFile(0);
  const { fetchFn } = fakeModel(() => chat(classification()));
  const s = await start(liveCfg(path, fetchFn));
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB}`);
    const id = (await tool(s, a, { report_id: "e", need: "File VAT", blocker: "portal_without_api" })).data.need_id;
    await s.queue.idle();
    await http(s, "/unmet-needs/decide", { cookie: a.raw, fields: { csrf: a.csrf, need_id: id, decision: "publish" } });
    const exp = await (await http(s, "/export", { cookie: a.raw })).json() as { unmet_needs: Record<string, unknown>[] };
    expect(exp.unmet_needs).toEqual([expect.objectContaining({ id, state: "published", need_redacted: "File VAT", demand_label: "VAT return filing", classified_by: BASETEN_MODEL })]);
    expect(await (await http(s, "/demand")).text()).toContain("VAT return filing");
    expect((await http(s, "/delete", { cookie: a.raw, fields: { csrf: a.csrf } })).status).toBe(302);
    expect(s.db.prepare("SELECT count(*) n FROM unmet_needs").get()).toEqual({ n: 0 });
    expect(await (await http(s, "/demand")).text()).toContain("Avaldatud soove veel pole.");
    const l = openExistingPublicLedger(path);
    try { expect(l.db.prepare("SELECT count(*) n FROM mq_attempts").get()).toEqual({ n: 1 }); } finally { l.close(); }
  } finally { await s.close(); }
});

test("before publishing, the card shows exactly the stored text Open demand will show, for mock and live items (tribunal T-004)", () => {
  const base = { id: "need_p", state: "classified", reason: null, need_redacted: "File VAT", blocker: "portal_without_api", job_hint_redacted: null, category: "tax_filings", same_as: null, created_at: "2026-10-30T10:00:00.000Z" };
  const mock = { ...base, demand_label: "Tax filings: Portal without an API", spec: "Mock classification (deterministic fixture, not a model): a service for tax filings.", classified_by: "mock" };
  const live = { ...base, demand_label: "VAT return filing", spec: "Prepare and file the VAT return.", classified_by: BASETEN_MODEL };
  const preview = (html: string) => html.match(/<div class="note"><p class="small"><strong>(?:Avalikult näidatakse täpselt seda:|Exactly this will be public:)<\/strong><\/p>(.*?)<\/div><\/div>/s)?.[1];
  for (const n of [mock, live]) {
    const et = unmetNeedsBody({ csrf: "c", needs: [n], lang: "et" });
    expect(preview(et), n.classified_by).toBe(`<div lang="en"><p><strong>${n.demand_label}</strong></p><p class="small">${n.spec}</p>`);
    expect(et.indexOf("Avalikult näidatakse täpselt seda:")).toBeLessThan(et.indexOf('value="publish"'));
    expect(preview(unmetNeedsBody({ csrf: "c", needs: [n], lang: "en" }))).toBe(`<div><p><strong>${n.demand_label}</strong></p><p class="small">${n.spec}</p>`);
  }
  // Joining an existing item: its public label is shown and no new spec becomes public.
  expect(preview(unmetNeedsBody({ csrf: "c", needs: [{ ...live, same_as: "VAT filing" }], lang: "et" }))).toBe('<div lang="en"><p><strong>VAT filing</strong></p>');
});
