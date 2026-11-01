import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { chmodSync, existsSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createApp, configFromEnv, type Config } from "../src/app.js";
import { openDb, sha256, type Db } from "../src/db.js";
import { BASETEN_MODEL, ModelQualityLedger, payloadHash, reservationMicroUsd, type FetchFn } from "../src/model-quality.js";
import { FRICTION_TOPICS, PublicCards, SETUP_TOPICS, openExistingPublicLedger, publicCardRequestId } from "../src/model-public-cards.js";
import { setupBody } from "../src/views.js";
import { main as batchMain, parseArgs as parseBatchArgs } from "../scripts/model-public-cards.js";

// Fake-only: global fetch may reach the local test server and nothing else;
// model transport is always the injected fake below.
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
const SUB_A = "synthetic-subject-a", SUB_B = "synthetic-subject-b", SUB_DENIED = "synthetic-subject-denied";
const tmpDir = () => mkdtempSync(join(tmpdir(), "pc-"));

// Seeds default to the historical flat USD 2 allocation, as in production.
function seedCompleted(ledger: ModelQualityLedger, id: string, job: "setup_guidance" | "classify_friction", output: string, allocation = 2_000_000) {
  ledger.reserve(id, job, payloadHash(job, `synthetic operator input ${id}`), allocation);
  ledger.finalize(id, { status: "completed", output, input_tokens: 10, output_tokens: 5, actual_cost_micro_usd: 100 });
}
/** Create a recognized existing ledger file (0600) with seeded attempts. */
function ledgerFile(seed = 0, capMicroUsd?: number): string {
  const path = join(tmpDir(), "ledger.db");
  const ledger = ModelQualityLedger.open(path, capMicroUsd);
  for (let i = 1; i <= seed; i++) seedCompleted(ledger, `quality-seed-${i}`, "setup_guidance", `OPERATOR-ONLY-OUTPUT-${i}`);
  ledger.close();
  chmodSync(path, 0o600);
  return path;
}
const rowCount = (path: string) => {
  const l = openExistingPublicLedger(path);
  try { return (l.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get() as { n: number }).n; } finally { l.close(); }
};

type Handler = (n: number) => Response | Promise<Response>;
function fakeModel(handler: Handler) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => { calls.push(String(url)); return handler(calls.length); }) as unknown as FetchFn;
  return { calls, fetchFn };
}
const okChat = (content = "Generic <script>alert(1)</script> guidance.") => new Response(JSON.stringify({
  model: BASETEN_MODEL,
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
}), { status: 200, headers: { "content-type": "application/json" } });

type Started = { cfg: Config; db: Db; base: string; close: () => Promise<void> };
async function start(overrides: Partial<Config>): Promise<Started> {
  const db = openDb(":memory:");
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "public_cards", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: [SUB_A, SUB_B], modelPricingConfirmed: true, basetenApiKey: KEY, ...overrides };
  const { app } = createApp(cfg, db);
  const server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cfg.baseUrl = base;
  localOrigins.add(base);
  return { cfg, db, base, close: () => new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); }) };
}
function makeOwner(db: Db, id: string, subject: string, kind: string) {
  db.prepare("INSERT INTO owners(id,subject,email,kind,reporting_enabled,created_at) VALUES(?,?,?,?,0,?)").run(id, subject, null, kind, new Date().toISOString());
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `ws-${id}`, "Synthetic workspace");
  const raw = `raw-${id}`, csrf = `csrf-${id}`;
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(raw), id, csrf, new Date(Date.now() + 3600_000).toISOString());
  return { raw, csrf };
}
async function req(base: string, path: string, opts: { cookie?: string; fields?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method: opts.fields ? "POST" : "GET", redirect: "manual",
    headers: { connection: "close", ...(opts.cookie ? { cookie: `lp_session=${opts.cookie}` } : {}), ...(opts.fields ? { "content-type": "application/x-www-form-urlencoded", origin: base } : {}) },
    body: opts.fields ? new URLSearchParams(opts.fields) : undefined,
  });
  // Read the body now. A later server.closeAllConnections() aborts a socket whose parser is still paused on an unread page, and undici then throws.
  const body = await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}
const postSetup = (s: Started, a: { raw: string; csrf: string }, fields: Record<string, string>) =>
  req(s.base, "/setup", { cookie: a.raw, fields: { csrf: a.csrf, ...fields } });

test("existing-ledger guard refuses missing/empty/symlink/unsafe/unrecognized without initializing", () => {
  const dir = tmpDir();
  const missing = join(dir, "nope.db");
  expect(() => openExistingPublicLedger(missing)).toThrow(/missing|refusing/);
  expect(existsSync(missing)).toBe(false); // never created
  const empty = join(dir, "empty.db"); writeFileSync(empty, "", { mode: 0o600 });
  expect(() => openExistingPublicLedger(empty)).toThrow(/empty/);
  const junk = join(dir, "junk.db"); writeFileSync(junk, "not a database", { mode: 0o600 });
  expect(() => openExistingPublicLedger(junk)).toThrow(/unrecognized/);
  // A valid SQLite file with an unrelated schema is refused WITHOUT the
  // ledger constructor initializing it (no mq_* tables appear).
  const unrelated = join(dir, "unrelated.db");
  { const d = new Database(unrelated); d.exec("CREATE TABLE other(x TEXT)"); d.close(); }
  chmodSync(unrelated, 0o600);
  expect(() => openExistingPublicLedger(unrelated)).toThrow(/unrecognized/);
  { const d = new Database(unrelated, { readonly: true });
    const names = (d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(["other"]); d.close(); }
  const good = ledgerFile(2);
  const link = join(dir, "link.db"); symlinkSync(good, link);
  expect(() => openExistingPublicLedger(link)).toThrow(/symlink/);
  chmodSync(good, 0o644);
  expect(() => openExistingPublicLedger(good)).toThrow(/0600/);
  chmodSync(good, 0o600);
  const ledger = openExistingPublicLedger(good);
  // A new ledger is born at the USD 100 ceiling. Both prior allocations stay.
  expect(ledger.ceilingMicroUsd).toBe(100_000_000);
  expect(ledger.db.prepare("SELECT key FROM mq_meta WHERE key LIKE 'ceiling_raised%'").all()).toEqual([]);
  expect(ledger.get("quality-seed-1")?.output).toBe("OPERATOR-ONLY-OUTPUT-1");
  expect(ledger.get("quality-seed-2")?.allocated_micro_usd).toBe(2_000_000);
  expect(ledger.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get()).toEqual({ n: 2 });
  ledger.close();
  expect(() => openExistingPublicLedger(":memory:")).toThrow(/refusing/);
  expect(() => openExistingPublicLedger("")).toThrow(/refusing/);
});

test("enabled startup validates allowlist, pricing, key and ledger (env and direct); health is truthful", async () => {
  const path = ledgerFile(0);
  const env = (extra: Record<string, string>) => ({
    NODE_ENV: "production", MODEL_MODE: "public_cards",
    LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: SUB_A, LAUNCHPAD_MODEL_LEDGER_PATH: path,
    LAUNCHPAD_MODEL_PRICING_CONFIRMED: "1", BASETEN_API_KEY: KEY, ...extra,
  }) as NodeJS.ProcessEnv;
  expect(configFromEnv(env({}))).toMatchObject({ modelMode: "public_cards", modelPricingConfirmed: true, basetenApiKey: KEY });
  // Disabled/test startup reads no key into config.
  expect(configFromEnv({ MODEL_MODE: "disabled", BASETEN_API_KEY: KEY } as NodeJS.ProcessEnv).basetenApiKey).toBeUndefined();
  const direct = (extra: Partial<Config>) => () => createApp(
    { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "public_cards", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: [SUB_A], modelLedgerPath: path, modelPricingConfirmed: true, basetenApiKey: KEY, ...extra },
    openDb(":memory:"),
  );
  expect(direct({ googleAllowedSubjects: undefined })).toThrow(/allowlist/);
  expect(direct({ modelPricingConfirmed: false })).toThrow(/PRICING_CONFIRMED/);
  expect(direct({ basetenApiKey: undefined })).toThrow(/BASETEN_API_KEY/);
  expect(direct({ modelLedgerPath: undefined })).toThrow(/MODEL_LEDGER_PATH/);
  expect(direct({ modelLedgerPath: join(tmpDir(), "missing.db") })).toThrow(/missing|refusing/);
  const { fetchFn } = fakeModel(() => okChat());
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const health = await (await req(s.base, "/health")).json();
    expect(health).toMatchObject({ ok: true, model_mode: "public_cards", live_inference: "enabled" });
    expect(JSON.stringify(health)).not.toContain(KEY);
    expect(JSON.stringify(health)).not.toContain(path);
  } finally { await s.close(); }
  const off = await start({ modelMode: "disabled", modelLedgerPath: undefined, basetenApiKey: undefined, modelPricingConfirmed: undefined });
  try {
    expect(await (await req(off.base, "/health")).json()).toMatchObject({ model_mode: "disabled", live_inference: "disabled" });
  } finally { await off.close(); }
});

test("auth, CSRF and strict selectors deny before any allocation or fetch", async () => {
  const path = ledgerFile(0);
  const { calls, fetchFn } = fakeModel(() => okChat());
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const denied = makeOwner(s.db, "own_d", `google:${SUB_DENIED}`, "google");
    const demo = makeOwner(s.db, "own_demo", "demo-alpha", "demo");
    const good = { topic: "connector", locale: "en" };
    expect((await req(s.base, "/setup", { fields: { csrf: a.csrf, ...good } })).status).toBe(302); // no session
    expect((await postSetup(s, denied, good)).status).toBe(302); // removed/never allowlisted
    expect((await postSetup(s, demo, good)).status).toBe(302); // demo never allocates
    expect((await req(s.base, "/setup", { cookie: a.raw, fields: { csrf: "wrong", ...good } })).status).toBe(403);
    expect((await postSetup(s, a, { ...good, prompt: "arbitrary" })).status).toBe(400); // unknown field
    expect((await postSetup(s, a, { ...good, model: "evil" })).status).toBe(400);
    expect((await postSetup(s, a, { topic: "anything", locale: "en" })).status).toBe(400);
    expect((await postSetup(s, a, { topic: "connector", locale: "de" })).status).toBe(400);
    expect((await postSetup(s, a, { topic: "retyping-orders", locale: "en" })).status).toBe(400); // friction is batch-only
    expect((await postSetup(s, a, { locale: "en" })).status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(rowCount(path)).toBe(0);
  } finally { await s.close(); }
});

test("setup POST generates once beside deterministic steps, escapes output, replays saved; GET never fetches", async () => {
  const path = ledgerFile(1); // one operator quality row, never exposed
  const { calls, fetchFn } = fakeModel(() => okChat());
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const getHtml = await (await req(s.base, "/setup", { cookie: a.raw })).text();
    expect(getHtml).toContain("Connect your assistant");
    expect(getHtml).toContain('value="connector"');
    expect(calls).toHaveLength(0);
    const r1 = await postSetup(s, a, { topic: "connector", locale: "en" });
    expect(r1.status).toBe(200);
    const h1 = await r1.text();
    expect(h1).toContain("Generic &lt;script&gt;alert(1)&lt;/script&gt; guidance.");
    expect(h1).not.toContain("<script>alert(1)</script>");
    expect(h1).toContain("Generated now");
    expect(h1).toContain("Connect your assistant");
    expect(h1).toContain("never your business details");
    expect(h1).not.toContain("OPERATOR-ONLY-OUTPUT-1");
    expect(calls).toHaveLength(1);
    const h2 = await (await postSetup(s, a, { topic: "connector", locale: "en" })).text(); // double-click replay
    expect(h2).toContain("Saved guidance");
    expect(calls).toHaveLength(1);
    await req(s.base, "/setup", { cookie: a.raw });
    await req(s.base, "/playbooks", { cookie: a.raw });
    expect(calls).toHaveLength(1); // GETs never fetch
    const acts = s.db.prepare("SELECT outcome,summary FROM activity WHERE owner_id='own_a' AND action='setup_guidance_card'").all() as { outcome: string; summary: string }[];
    expect(acts).toHaveLength(2);
    expect(acts.every((x) => x.outcome === "ok")).toBe(true);
    expect(JSON.stringify(acts)).not.toContain(SUB_A);
    expect(rowCount(path)).toBe(2); // operator seed + one public card
    // Shared public content: another allowlisted owner replays the same card.
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`, "google");
    const hb = await (await postSetup(s, b, { topic: "connector", locale: "en" })).text();
    expect(hb).toContain("Saved guidance");
    expect(calls).toHaveLength(1);
    // Model ledger carries no owner identity.
    const l = openExistingPublicLedger(path);
    const dump = JSON.stringify(l.db.prepare("SELECT * FROM mq_attempts").all());
    l.close();
    expect(dump).not.toContain("own_a"); expect(dump).not.toContain(SUB_A);
  } finally { await s.close(); }
});

test("concurrent same-card POSTs: one fetch, second is pending, then replay", async () => {
  const path = ledgerFile(0);
  let release!: () => void;
  const gate = new Promise<void>((ok) => { release = ok; });
  const { calls, fetchFn } = fakeModel(async () => { await gate; return okChat("Concurrent guidance."); });
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const p1 = postSetup(s, a, { topic: "connector", locale: "et" });
    for (let i = 0; i < 100 && calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(calls).toHaveLength(1);
    const h2 = await (await postSetup(s, a, { topic: "connector", locale: "et" })).text();
    expect(h2).toContain("may have been interrupted"); // same pending row: honestly unresolved
    expect(h2).not.toContain("being generated");
    const hOther = await (await postSetup(s, a, { topic: "first-check", locale: "en" })).text();
    expect(hOther).toContain("has not started"); // another card blocked before allocation
    expect(hOther).not.toContain("may have been interrupted");
    expect(calls).toHaveLength(1);
    release();
    const h1 = await (await p1).text();
    expect(h1).toContain("Concurrent guidance.");
    const h3 = await (await postSetup(s, a, { topic: "connector", locale: "et" })).text();
    expect(h3).toContain("Saved guidance");
    expect(calls).toHaveLength(1);
    expect(rowCount(path)).toBe(1);
  } finally { await s.close(); }
});

test("pinned ledger with headroom for exactly three cards: three generate, the fourth is exhausted", async () => {
  const cards = [["connector", "en"], ["connector", "et"], ["choose-assistant", "en"]] as const;
  const need = cards.reduce((sum, [id, locale]) => sum + reservationMicroUsd("setup_guidance", SETUP_TOPICS.find((t) => t.id === id)!.input[locale]), 0);
  // 4 × USD 2 plus USD 1 of filler headroom. Not the legacy 10_000_000 pin:
  // that exact ceiling is raised to USD 100 when the ledger is opened.
  const cap = 9_000_000;
  const filler = cap - 8_000_000 - need;
  expect(filler).toBeGreaterThan(0);
  const path = ledgerFile(4, cap);
  { const l = openExistingPublicLedger(path); expect(l.ceilingMicroUsd).toBe(cap); seedCompleted(l, "filler", "setup_guidance", "OPERATOR-ONLY", filler); l.close(); }
  const { calls, fetchFn } = fakeModel(() => okChat("Slot guidance."));
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    for (const [topic, locale] of cards) {
      const h = await (await postSetup(s, a, { topic, locale })).text();
      expect(h).toContain("Slot guidance.");
    }
    expect(calls).toHaveLength(3);
    const h4 = await (await postSetup(s, a, { topic: "choose-assistant", locale: "et" })).text();
    expect(h4).toContain("budget is exhausted");
    expect(calls).toHaveLength(3); // no fetch for the refused card
    expect(rowCount(path)).toBe(8); // 4 seeds + filler + 3 cards on the one global ledger
    const l = openExistingPublicLedger(path);
    try {
      expect(l.ceilingMicroUsd).toBe(9_000_000);
      expect(l.db.prepare("SELECT SUM(allocated_micro_usd) s FROM mq_attempts").get()).toEqual({ s: 9_000_000 });
    } finally { l.close(); }
    // Saved cards still replay after exhaustion.
    const hr = await (await postSetup(s, a, { topic: "connector", locale: "en" })).text();
    expect(hr).toContain("Saved guidance");
    expect(calls).toHaveLength(3);
    const outcomes = (s.db.prepare("SELECT outcome FROM activity WHERE action='setup_guidance_card'").all() as { outcome: string }[]).map((r) => r.outcome);
    expect(outcomes).toContain("exhausted"); // failures are not logged ok
  } finally { await s.close(); }
});

test("terminal states are truthful and never auto-retried (failed, uncertain, breach)", async () => {
  const topic = SETUP_TOPICS[0];
  const unit = (handler: Handler) => {
    const ledger = ModelQualityLedger.open(":memory:");
    const f = fakeModel(handler);
    return { ledger, ...f, cards: new PublicCards({ ledger, apiKey: KEY, fetchFn: f.fetchFn }) };
  };
  { // provider 500 -> failed, terminal
    const u = unit(() => new Response("nope", { status: 500 }));
    expect((await u.cards.generate(topic, "en")).state).toBe("failed");
    expect((await u.cards.generate(topic, "en")).state).toBe("failed");
    expect(u.calls).toHaveLength(1);
    u.ledger.close();
  }
  { // missing usage -> uncertain, terminal
    const u = unit(() => new Response(JSON.stringify({ model: BASETEN_MODEL, choices: [{ finish_reason: "stop", message: { content: "x" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    expect((await u.cards.generate(topic, "en")).state).toBe("uncertain");
    expect((await u.cards.generate(topic, "en")).state).toBe("uncertain");
    expect(u.calls).toHaveLength(1);
    u.ledger.close();
  }
  { // wrong model -> breach; other cards breach-blocked with no fetch
    const u = unit(() => new Response(JSON.stringify({ model: "some-other-model", choices: [{ finish_reason: "stop", message: { content: "x" } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } }));
    const breached = await u.cards.generate(topic, "en");
    expect(breached.state).toBe("breach");
    expect(breached.output).toBeNull(); // breach output suppressed
    expect((await u.cards.generate(SETUP_TOPICS[1], "en")).state).toBe("breach_blocked");
    expect(u.calls).toHaveLength(1);
    u.ledger.close();
  }
  { // arbitrary/operator rows are never surfaced as public cards
    const u = unit(() => okChat());
    seedCompleted(u.ledger, "operator-row", "setup_guidance", "OPERATOR-ONLY");
    // A corrupted public-card row (wrong hash) reads as conflict, not content.
    u.ledger.db.prepare("INSERT INTO mq_attempts(request_id,payload_hash,job,status,allocated_micro_usd,output,created_at,updated_at) VALUES(?,?,?,'completed',2000000,'FORGED','t','t')")
      .run(publicCardRequestId(topic, "en"), "wrong-hash", topic.job);
    const view = u.cards.read(topic, "en");
    expect(view.state).toBe("conflict");
    expect(view.output).toBeNull();
    expect(u.cards.read(FRICTION_TOPICS[0], "en").output).toBeNull();
    u.ledger.close();
  }
});

test("operator batch precomputes a friction card the playbook view actually displays; dry needs no key", async () => {
  expect(parseBatchArgs(["--topic", "retyping-orders"])).toMatchObject({ live: false, locale: "en" });
  expect(() => parseBatchArgs(["--prompt", "x"])).toThrow(/Unknown/);
  const logs: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((v?: unknown) => { logs.push(String(v)); });
  try {
    // Dry: no key in env, nonexistent ledger path is never opened.
    expect(await batchMain(["--topic", "retyping-orders", "--ledger", "/nonexistent/x.db"], { env: {} as NodeJS.ProcessEnv })).toBe(0);
    expect(logs.join("\n")).toContain("DRY RUN");
    // Live without pricing confirmation refuses before opening anything.
    const path = ledgerFile(0);
    const { calls, fetchFn } = fakeModel(() => okChat("Batch friction suggestion."));
    expect(await batchMain(["--live", "--topic", "retyping-orders", "--ledger", path], { env: { BASETEN_API_KEY: KEY } as NodeJS.ProcessEnv, fetchFn })).toBe(2);
    expect(calls).toHaveLength(0);
    expect(await batchMain(["--live", "--topic", "retyping-orders", "--ledger", path], { env: { BASETEN_API_KEY: KEY, LAUNCHPAD_MODEL_PRICING_CONFIRMED: "1" } as NodeJS.ProcessEnv, fetchFn })).toBe(0);
    expect(calls).toHaveLength(1);
    // Batch replay allocates nothing.
    expect(await batchMain(["--live", "--topic", "retyping-orders", "--ledger", path, "--confirm-current-pricing"], { env: { BASETEN_API_KEY: KEY } as NodeJS.ProcessEnv, fetchFn })).toBe(0);
    expect(calls).toHaveLength(1);
    // The product view displays the batch result with zero render fetches.
    const appFetch = fakeModel(() => okChat("must not be called"));
    const s = await start({ modelLedgerPath: path, modelFetchFn: appFetch.fetchFn });
    try {
      const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
      const html = await (await req(s.base, "/playbooks?lang=en", { cookie: a.raw })).text();
      expect(html).toContain("Manual-work suggestions");
      expect(html).toContain("Batch friction suggestion.");
      expect(html).toContain("Saved guidance");
      expect(appFetch.calls).toHaveLength(0);
    } finally { await s.close(); }
  } finally { spy.mockRestore(); }
});

test("owner deletion clears owner activity but never public cards or allocations", async () => {
  const path = ledgerFile(0);
  const { calls, fetchFn } = fakeModel(() => okChat("Shared guidance."));
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    await postSetup(s, a, { topic: "connector", locale: "en" });
    expect(rowCount(path)).toBe(1);
    const del = await req(s.base, "/delete", { cookie: a.raw, fields: { csrf: a.csrf } });
    expect(del.status).toBe(302);
    expect(s.db.prepare("SELECT COUNT(*) n FROM activity WHERE owner_id='own_a'").get()).toEqual({ n: 0 });
    expect(rowCount(path)).toBe(1); // no refund, no reset, card survives
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`, "google");
    const hb = await (await postSetup(s, b, { topic: "connector", locale: "en" })).text();
    expect(hb).toContain("Shared guidance.");
    expect(hb).toContain("Saved guidance");
    expect(calls).toHaveLength(1);
  } finally { await s.close(); }
});

/** Persist a stale (year-2000, possibly interrupted) pending row, then reopen. */
function stalePendingLedgerFile(topicId: string, locale: "en" | "et"): { path: string; pendingId: string } {
  const path = ledgerFile(0);
  const topic = SETUP_TOPICS.find((t) => t.id === topicId)!;
  const pendingId = publicCardRequestId(topic, locale);
  const l = openExistingPublicLedger(path);
  try {
    l.reserve(pendingId, topic.job, payloadHash(topic.job, topic.input[locale]), reservationMicroUsd(topic.job, topic.input[locale]));
    l.db.prepare("UPDATE mq_attempts SET created_at='2000-01-01', updated_at='2000-01-01' WHERE request_id=?").run(pendingId);
  } finally { l.close(); }
  return { path, pendingId };
}

test("reopened stale pending ledger: same card honestly unresolved, zero calls, no new allocation", async () => {
  const { path, pendingId } = stalePendingLedgerFile("connector", "en");
  const { calls, fetchFn } = fakeModel(() => okChat());
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const html = await (await postSetup(s, a, { topic: "connector", locale: "en" })).text();
    expect(html).toContain("may have been interrupted"); // unresolved, not active progress
    expect(html).not.toContain("being generated");
    expect(html).not.toContain("Come back shortly");
    expect(html).not.toContain("has not started");
    expect(calls).toHaveLength(0); // replayed row: no fetch
    expect(rowCount(path)).toBe(1); // no new allocation
    const l = openExistingPublicLedger(path);
    try { expect(l.get(pendingId)?.status).toBe("pending"); } finally { l.close(); }
  } finally { await s.close(); }
});

const selectedVal = (html: string, name: string): string | null => {
  const sel = html.match(new RegExp(`<select name="${name}">([\\s\\S]*?)<\\/select>`));
  const m = sel?.[1].match(/<option value="([^"]+)" selected>/);
  return m?.[1] ?? null;
};

test("result keeps selected topic/locale; UI-equivalent resubmission replays the same card", async () => {
  const path = ledgerFile(0);
  const { calls, fetchFn } = fakeModel(() => okChat("Nondefault guidance."));
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    // Initial defaults only when no card: first topic + English.
    const getHtml = await (await req(s.base, "/setup", { cookie: a.raw })).text();
    expect(getHtml).toContain(`value="${SETUP_TOPICS[0].id}" selected`);
    expect(getHtml).toContain('value="en" selected');
    expect(getHtml).not.toContain('value="et" selected');
    // Nondefault selection: second POST state comes from the P2 report
    // (Eesti + non-first topic).
    const r1 = await postSetup(s, a, { topic: "first-check", locale: "et" });
    expect(r1.status).toBe(200);
    const h1 = await r1.text();
    expect(h1).toContain("Nondefault guidance.");
    expect(h1).toContain('value="first-check" selected');
    expect(h1).toContain('value="et" selected');
    expect(h1).not.toContain(`value="${SETUP_TOPICS[0].id}" selected`);
    expect(h1).not.toContain('value="en" selected');
    expect(calls).toHaveLength(1);
    expect(rowCount(path)).toBe(1);
    // UI-equivalent second submission: replay exactly what the returned
    // form has selected (as a second Get-guidance click would send).
    expect(selectedVal(h1, "topic")).toBe("first-check");
    expect(selectedVal(h1, "locale")).toBe("et");
    const h2 = await (await postSetup(s, a, { topic: selectedVal(h1, "topic")!, locale: selectedVal(h1, "locale")! })).text();
    expect(h2).toContain("Saved guidance");
    expect(h2).toContain("Nondefault guidance.");
    expect(h2).toContain('value="first-check" selected');
    expect(h2).toContain('value="et" selected');
    expect(calls).toHaveLength(1); // same card replay: no extra fetch
    expect(rowCount(path)).toBe(1); // no extra allocation
  } finally { await s.close(); }
});

test("all public-card states keep selection; defaults only with no card", () => {
  const topics = SETUP_TOPICS.map((t) => ({ id: t.id, label: t.label.en }));
  const states = ["pending", "blocked", "failed", "uncertain", "exhausted", "breach", "breach_blocked", "conflict", "completed"] as const;
  for (const state of states) {
    const html = setupBody({
      csrf: "csrf", result: null,
      publicCards: { topics, card: { topicId: "first-check", locale: "et", state, output: state === "completed" ? "out" : null, replayed: true } },
    });
    expect(html).toContain('value="first-check" selected');
    expect(html).toContain('value="et" selected');
    expect(html).not.toContain(`value="${SETUP_TOPICS[0].id}" selected`);
    expect(html).not.toContain('value="en" selected');
  }
  const none = setupBody({ csrf: "csrf", result: null, publicCards: { topics, card: null } });
  expect(none).toContain(`value="${SETUP_TOPICS[0].id}" selected`);
  expect(none).toContain('value="en" selected');
  expect(none).not.toContain('value="et" selected');
});

test("setup POST invalidated by /delete during generate writes no owner activity and redirects to login", async () => {
  const path = ledgerFile(0);
  let started!: () => void;
  const startedPromise = new Promise<void>((ok) => { started = ok; });
  let release!: () => void;
  const gate = new Promise<void>((ok) => { release = ok; });
  let fetchCount = 0;
  const fetchFn = (async () => {
    fetchCount++;
    started();
    await gate;
    return okChat("Shared guidance.");
  }) as unknown as FetchFn;
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const pending = postSetup(s, a, { topic: "connector", locale: "en" });
    await startedPromise; // provider paused: generate in flight, no timing sleep
    const del = await req(s.base, "/delete", { cookie: a.raw, fields: { csrf: a.csrf } });
    expect(del.status).toBe(302);
    release();
    const res = await pending;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
    const body = await res.text();
    expect(body).not.toContain("Shared guidance.");
    expect(s.db.prepare("SELECT COUNT(*) n FROM activity WHERE owner_id='own_a'").get()).toEqual({ n: 0 });
    expect((await req(s.base, "/setup", { cookie: a.raw })).status).toBe(302); // old session denied
    expect(rowCount(path)).toBe(1); // shared completed card + allocation retained
    expect(fetchCount).toBe(1);
    // Replayable safely with a new session/owner without extra fetch.
    const b = makeOwner(s.db, "own_b", `google:${SUB_B}`, "google");
    const hb = await (await postSetup(s, b, { topic: "connector", locale: "en" })).text();
    expect(hb).toContain("Shared guidance.");
    expect(hb).toContain("Saved guidance");
    expect(fetchCount).toBe(1);
  } finally { await s.close(); }
});

test("reopened stale pending ledger: different card blocked/not started, zero calls, no requested row", async () => {
  const { path } = stalePendingLedgerFile("connector", "en");
  const other = SETUP_TOPICS.find((t) => t.id === "choose-assistant")!;
  const otherId = publicCardRequestId(other, "en");
  const { calls, fetchFn } = fakeModel(() => okChat());
  const s = await start({ modelLedgerPath: path, modelFetchFn: fetchFn });
  try {
    const a = makeOwner(s.db, "own_a", `google:${SUB_A}`, "google");
    const html = await (await postSetup(s, a, { topic: "choose-assistant", locale: "en" })).text();
    expect(html).toContain("has not started"); // blocked before allocation
    expect(html).not.toContain("being generated");
    expect(html).not.toContain("Come back shortly");
    expect(html).not.toContain("may have been interrupted");
    expect(calls).toHaveLength(0); // blocked: no fetch
    expect(rowCount(path)).toBe(1); // no new allocation
    const l = openExistingPublicLedger(path);
    try { expect(l.get(otherId)).toBeUndefined(); } finally { l.close(); } // requested card never started
  } finally { await s.close(); }
});
