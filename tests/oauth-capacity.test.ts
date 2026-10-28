import { afterEach, beforeEach, expect, test } from "vitest";
import type { Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createApp, configFromEnv, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";

// Issue 7: bounded OAuth admission/expiry/recovery. Pools are filled with
// direct rows, but every admission/replacement/registration under test goes
// through the real HTTP + SDK routes on an isolated random loopback port.
let server: Server, db: ReturnType<typeof openDb>, base: string, cfg: Config;
beforeEach(async () => {
  cfg = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", allowedHosts: ["127.0.0.1"], modelMode: "test" };
  db = openDb(":memory:"); const { app } = createApp(cfg, db);
  await new Promise<void>(ok => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base;
});
afterEach(async () => { await new Promise<void>(ok => server.close(() => ok())); db.close(); });

class Browser {
  cookies = new Map<string, string>();
  async request(path: string, fields?: Record<string, string>, origin = base) {
    const res = await fetch(path.startsWith("http") ? path : base + path, { method: fields ? "POST" : "GET", redirect: "manual", headers: { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(fields ? { "content-type": "application/x-www-form-urlencoded", origin } : {}) }, body: fields ? new URLSearchParams(fields) : undefined });
    for (const c of res.headers.getSetCookie()) { const [name, value] = c.split(";")[0].split("="); this.cookies.set(name, value); }
    return res;
  }
  async login(actor = "alpha") {
    const html = await (await this.request("/login")).text();
    return this.request("/auth/demo", { actor, preauth: field(html, "preauth") });
  }
  async csrf() { return field(await (await this.request("/connection")).text(), "csrf"); }
}
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1];
const count = (sql: string, ...v: unknown[]) => (db.prepare(`SELECT count(*) n FROM ${sql}`).get(...v) as { n: number }).n;
const ownerId = (actor: string) => (db.prepare("SELECT id FROM owners WHERE subject=?").get(`demo-${actor}`) as { id: string }).id;
async function register(headers: Record<string, string> = {}, at = base) {
  return fetch(at + "/register", { method: "POST", headers: { "content-type": "application/json", origin: "https://assistant.example", ...headers }, body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:45678/callback"], client_name: "Capacity test assistant", token_endpoint_auth_method: "none" }) });
}
const challenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
function authorize(b: Browser, clientId: string) {
  return b.request("/authorize?" + new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "http://127.0.0.1:45678/callback", resource: base + "/mcp", code_challenge: challenge, code_challenge_method: "S256", scope: "progress:read", state: "s" }));
}
function fillPending(clientId: string, n: number, owner: string | null = null, prefix = "fill") {
  db.transaction(() => {
    for (let i = 0; i < n; i++) db.prepare("INSERT INTO oauth_pending VALUES(?,?,?,?,?,?)").run(`${prefix}-${prefix.length}-${i}-${randomBytes(4).toString("hex")}`, clientId, "{}", owner, owner ? 1 : null, Date.now() + 600_000);
  })();
}
function insertClient(id: string, issuedMs: number, expiresMs: number) {
  const meta = { client_id: id, client_id_issued_at: Math.floor(issuedMs / 1000), client_name: id, redirect_uris: ["https://example.com/cb"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "progress:read" };
  db.prepare("INSERT INTO oauth_clients VALUES(?,?,?)").run(id, JSON.stringify(meta), expiresMs);
}
const post = (path: string, fields: Record<string, string>) => fetch(base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://assistant.example" }, body: new URLSearchParams(fields), redirect: "manual" });
const refresh = (client: string, token: string) => post("/token", { grant_type: "refresh_token", client_id: client, refresh_token: token, resource: base + "/mcp" });

async function fullFlow() {
  const client = await (await register()).json();
  const verifier = randomBytes(32).toString("base64url"), b = new Browser();
  const params = { response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: base + "/mcp", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "st", scope: "progress:read" };
  expect((await b.request("/authorize?" + new URLSearchParams(params))).headers.get("location")).toBe("/oauth/consent");
  await b.login();
  const html = await (await b.request("/oauth/consent")).text();
  const approved = await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "allow" });
  const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
  const tokens = await (await post("/token", { grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: base + "/mcp" })).json();
  return { b, client, tokens };
}

test("same browser replaces its own pending flow at full capacity without growing rows; failed replacement preserves the prior flow", async () => {
  const client = await (await register()).json();
  const b = new Browser(); await b.login("alpha");
  expect((await authorize(b, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const firstId = sha256(b.cookies.get("lp_connect")!);
  fillPending(client.client_id, 99); // total = 100
  expect(count("oauth_pending")).toBe(100);
  // Replacement at capacity: succeeds, frees its own slot, total unchanged.
  expect((await authorize(b, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  expect(count("oauth_pending")).toBe(100);
  const secondId = sha256(b.cookies.get("lp_connect")!);
  expect(secondId).not.toBe(firstId);
  expect(count("oauth_pending WHERE id=?", firstId)).toBe(0);
  expect(count("oauth_pending WHERE id=?", secondId)).toBe(1);
  // Failed replacement (owner already at cap via two other flows): prior flow survives.
  fillPending(client.client_id, 2, ownerId("alpha"), "own");
  db.prepare("DELETE FROM oauth_pending WHERE owner_id IS NULL AND id LIKE 'fill-%' LIMIT 2").run(); // keep total at 100
  const failed = await authorize(b, client.client_id);
  expect(failed.headers.get("location")).not.toBe("/oauth/consent");
  expect(count("oauth_pending WHERE id=?", secondId)).toBe(1);
  expect(count("oauth_pending")).toBe(100);
});

test("wrong owner cannot bind or replace a stolen pending cookie", async () => {
  const client = await (await register()).json();
  const a = new Browser(); await a.login("alpha");
  expect((await authorize(a, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const stolen = a.cookies.get("lp_connect")!;
  const victimId = sha256(stolen);
  const thief = new Browser(); thief.cookies.set("lp_connect", stolen); await thief.login("beta");
  expect((await thief.request("/oauth/consent")).status).toBe(400);
  expect((await authorize(thief, client.client_id)).headers.get("location")).not.toBe("/oauth/consent");
  const row = db.prepare("SELECT owner_id FROM oauth_pending WHERE id=?").get(victimId) as { owner_id: string };
  expect(row.owner_id).toBe(ownerId("alpha"));
  // The real owner can still use it.
  expect((await a.request("/oauth/consent")).status).toBe(200);
});

test("anonymous pool (70) cannot consume the authenticated reserve; per-owner cap is 2", async () => {
  const client = await (await register()).json();
  fillPending(client.client_id, 70);
  const anon = new Browser();
  expect((await authorize(anon, client.client_id)).headers.get("location")).not.toBe("/oauth/consent");
  // Two browsers for the same owner may each hold one flow; a third is refused.
  const a1 = new Browser(); await a1.login("alpha");
  const a2 = new Browser(); await a2.login("alpha");
  const a3 = new Browser(); await a3.login("alpha");
  expect((await authorize(a1, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  expect((await authorize(a2, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  expect((await authorize(a3, client.client_id)).headers.get("location")).not.toBe("/oauth/consent");
  expect(count("oauth_pending WHERE owner_id=?", ownerId("alpha"))).toBe(2);
  // An unrelated owner still fits in the reserve.
  const other = new Browser(); await other.login("beta");
  expect((await authorize(other, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  expect(count("oauth_pending")).toBe(73);
});

test("login-to-consent bind respects the owner cap and deletes nothing", async () => {
  const client = await (await register()).json();
  const a = new Browser(); await a.login("alpha");
  const alpha = ownerId("alpha");
  fillPending(client.client_id, 2, alpha, "mine");
  const anon = new Browser();
  expect((await authorize(anon, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const anonId = sha256(anon.cookies.get("lp_connect")!);
  await anon.login("alpha");
  expect((await anon.request("/oauth/consent")).status).toBe(400);
  const row = db.prepare("SELECT owner_id FROM oauth_pending WHERE id=?").get(anonId) as { owner_id: string | null };
  expect(row.owner_id).toBeNull(); // not bound over the cap
  expect(count("oauth_pending WHERE owner_id=?", alpha)).toBe(2); // nothing evicted
  expect(count("oauth_pending")).toBe(3);
});

test("expired owner pending rows do not block login-to-consent bind; live other-owner flow preserved", async () => {
  const client = await (await register()).json();
  const seedA = new Browser(); await seedA.login("alpha");
  const seedB = new Browser(); await seedB.login("beta");
  const alpha = ownerId("alpha"), beta = ownerId("beta");
  // Create the live anonymous flow first: authorize prunes, so expired rows
  // must be inserted afterwards to exercise the consent-bind path only.
  const anon = new Browser();
  expect((await authorize(anon, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const anonId = sha256(anon.cookies.get("lp_connect")!);
  const past = Date.now() - 1000;
  db.transaction(() => {
    for (let i = 0; i < 2; i++) db.prepare("INSERT INTO oauth_pending VALUES(?,?,?,?,?,?)").run(`expired-alpha-${i}`, client.client_id, "{}", alpha, 1, past);
    db.prepare("INSERT INTO oauth_pending VALUES(?,?,?,?,?,?)").run("live-beta-1", client.client_id, "{}", beta, 1, Date.now() + 600_000);
  })();
  await anon.login("alpha");
  expect((await anon.request("/oauth/consent")).status).toBe(200);
  expect((db.prepare("SELECT owner_id FROM oauth_pending WHERE id=?").get(anonId) as { owner_id: string }).owner_id).toBe(alpha);
  expect(count("oauth_pending WHERE id='live-beta-1'")).toBe(1); // other owner's live flow preserved
  expect(count("oauth_pending WHERE owner_id=? AND expires<=?", alpha, Date.now())).toBe(0); // expired blockers pruned
});

test("last pending slot under parallel HTTP admission: exactly one of two wins, total stays 100", async () => {
  const client = await (await register()).json();
  const a = new Browser(); await a.login("alpha");
  const b = new Browser(); await b.login("beta");
  fillPending(client.client_id, 99); // 99 total, one slot left (authenticated reserve)
  const [ra, rb] = await Promise.all([authorize(a, client.client_id), authorize(b, client.client_id)]);
  const wins = [ra, rb].filter(r => r.headers.get("location") === "/oauth/consent").length;
  await Promise.all([ra.text(), rb.text()]);
  expect(wins).toBe(1);
  expect(count("oauth_pending")).toBe(100);
});

test("expired registration stays usable while a valid grant needs it; prune never cascades the grant; replay still revokes; retention survives reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "launchpad-cap-")), path = join(dir, "test.db");
  try {
    const f = await fullFlow();
    // Simulate the pre-fix failure: a 30-day-old registration, newer grant.
    db.prepare("UPDATE oauth_clients SET expires=? WHERE id=?").run(Date.now() - 1000, f.client.client_id);
    expect((await register()).status).toBe(201); // triggers prune
    expect(count("oauth_grants WHERE client_id=? AND revoked=0", f.client.client_id)).toBe(1);
    expect(count("oauth_clients WHERE id=?", f.client.client_id)).toBe(1);
    const rotated = await refresh(f.client.client_id, f.tokens.refresh_token);
    expect(rotated.status).toBe(200);
    const next = await rotated.json();
    // Prune/reopen retention for the pre-registered active client + grant.
    await db.backup(path); await new Promise<void>(ok => server.close(() => ok())); db.close();
    db = openDb(path); const app = createApp(cfg, db).app; const port = Number(new URL(base).port);
    await new Promise<void>(ok => { server = app.listen(port, "127.0.0.1", ok); });
    expect((await register()).status).toBe(201); // prune again after reopen
    expect((await refresh(f.client.client_id, next.refresh_token)).status).toBe(200);
    // Used-refresh replay evidence survived: replaying an old token revokes.
    expect((await refresh(f.client.client_id, f.tokens.refresh_token)).status).toBe(400);
    expect(count("oauth_grants WHERE revoked=1")).toBe(1);
    // Once the grant itself expires, the expired client is reclaimed.
    db.prepare("UPDATE oauth_grants SET expires=?").run(Date.now() - 1000);
    expect((await register()).status).toBe(201);
    expect(count("oauth_clients WHERE id=?", f.client.client_id)).toBe(0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("unused pool: grace protects fresh registrations, oldest past-grace unused reclaims, DCR->authorize survives", async () => {
  const now = Date.now();
  const fresh = await (await register()).json(); // 1 unused, within grace
  db.transaction(() => { for (let i = 0; i < 99; i++) insertClient(`young-${i}`, now, now + 900_000); })();
  expect(count("oauth_clients")).toBe(100);
  // Pool full but everyone is inside the 2-minute grace: explicit capacity error, no eviction.
  const refused = await register(); expect(refused.status).toBe(400); expect(await refused.text()).toContain("capacity");
  expect(count("oauth_clients")).toBe(100);
  // The fresh registration can still authorize immediately.
  const b = new Browser();
  expect((await authorize(b, fresh.client_id)).headers.get("location")).toBe("/oauth/consent");
  // Fresh is now pending-backed, so it is no longer in the unused pool:
  // next registration may fill 100 unused + 1 active = 101 total.
  const unusedPool = () => count("oauth_clients c WHERE NOT EXISTS (SELECT 1 FROM oauth_pending p WHERE p.client_id=c.id) AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id=c.id)");
  // Age the filler past the grace: oldest unused reclaim, pending-backed client untouched.
  db.prepare("UPDATE oauth_clients SET metadata=replace(metadata, ?, ?) WHERE id LIKE 'young-%'").run(`"client_id_issued_at":${Math.floor(now / 1000)}`, `"client_id_issued_at":${Math.floor((now - 10 * 60_000) / 1000)}`);
  expect((await register()).status).toBe(201);
  expect(count("oauth_clients WHERE id=?", fresh.client_id)).toBe(1); // live pending protects it
  expect(count("oauth_pending")).toBe(1);
  expect(unusedPool()).toBe(100);
  expect(count("oauth_clients")).toBe(101); // 100 unused + 1 pending-backed
  // Pool full with aged fillers: next registration evicts the oldest eligible
  // unused (make young-0 distinctly oldest) and the total bound holds.
  const m0 = JSON.parse((db.prepare("SELECT metadata FROM oauth_clients WHERE id='young-0'").get() as { metadata: string }).metadata);
  m0.client_id_issued_at = Math.floor((now - 20 * 60_000) / 1000);
  db.prepare("UPDATE oauth_clients SET metadata=? WHERE id='young-0'").run(JSON.stringify(m0));
  expect((await register()).status).toBe(201);
  expect(count("oauth_clients WHERE id='young-0'")).toBe(0); // oldest eligible unused evicted
  expect(count("oauth_clients WHERE id='young-1'")).toBe(1);
  expect(count("oauth_clients WHERE id=?", fresh.client_id)).toBe(1);
  expect(unusedPool()).toBe(100);
  expect(count("oauth_clients")).toBe(101);
});

test("hard total 500 with only active clients fails new registration explicitly and deletes nothing", async () => {
  const owner = new Browser(); await owner.login("alpha");
  const alpha = ownerId("alpha"), now = Date.now();
  db.transaction(() => {
    for (let i = 0; i < 500; i++) {
      insertClient(`active-${i}`, now - 86400_000, now + 86400_000);
      db.prepare("INSERT INTO oauth_grants VALUES(?,?,?,?,?,?,0,?,?)").run(`g-${i}`, alpha, 1, `active-${i}`, "progress:read", base + "/mcp", now + 86400_000, "https://example.com/cb");
    }
  })();
  const refused = await register(); expect(refused.status).toBe(400); expect(await refused.text()).toContain("capacity");
  expect(count("oauth_clients")).toBe(500);
  expect(count("oauth_grants WHERE revoked=0")).toBe(500);
});

test("release identity: env validation and /health release_sha", async () => {
  expect(configFromEnv({} as NodeJS.ProcessEnv).releaseSha).toBeNull();
  const sha = "25e1d64" + "0".repeat(33);
  expect(configFromEnv({ LAUNCHPAD_RELEASE_SHA: sha } as NodeJS.ProcessEnv).releaseSha).toBe(sha);
  for (const bad of ["ABC", "A".repeat(40), "g".repeat(40), sha + "0", "  " + sha]) {
    expect(() => configFromEnv({ LAUNCHPAD_RELEASE_SHA: bad } as NodeJS.ProcessEnv)).toThrow(/LAUNCHPAD_RELEASE_SHA/);
  }
  expect(configFromEnv({ LAUNCHPAD_TRUST_LOOPBACK_PROXY: "1" } as NodeJS.ProcessEnv).trustLoopbackProxy).toBe(true);
  expect(configFromEnv({} as NodeJS.ProcessEnv).trustLoopbackProxy).toBe(false);
  const health = await (await fetch(base + "/health")).json();
  expect(health.release_sha).toBeNull();
  expect(Object.keys(health)).not.toContain("LAUNCHPAD_RELEASE_SHA");
  // Configured instance reports the exact value.
  const db2 = openDb(":memory:");
  const cfg2: Config = { ...cfg, baseUrl: "http://127.0.0.1", releaseSha: sha };
  const app2 = createApp(cfg2, db2).app;
  const srv2 = app2.listen(0, "127.0.0.1"); await new Promise<void>(ok => srv2.once("listening", () => ok()));
  const base2 = `http://127.0.0.1:${(srv2.address() as { port: number }).port}`; cfg2.baseUrl = base2;
  try { expect((await (await fetch(base2 + "/health")).json()).release_sha).toBe(sha); }
  finally { await new Promise<void>(ok => srv2.close(() => ok())); db2.close(); }
  expect(() => createApp({ ...cfg, releaseSha: "not-a-sha" }, openDb(":memory:"))).toThrow(/releaseSha/);
});

test("forwarded address: trust fn is exact loopback at hop 0 only; SDK limiter buckets prove disabled spoof resistance and trusted processing", async () => {
  for (const trust of [false, true]) {
    const db2 = openDb(":memory:");
    const cfg2: Config = { ...cfg, baseUrl: "http://127.0.0.1", trustLoopbackProxy: trust };
    const { app } = createApp(cfg2, db2);
    if (trust) {
      const fn = app.get("trust proxy fn") as (ip: string, i: number) => boolean;
      expect(fn("127.0.0.1", 0)).toBe(true);
      expect(fn("::1", 0)).toBe(true);
      expect(fn("127.0.0.1", 1)).toBe(false); // hop 0 only
      expect(fn("203.0.113.9", 0)).toBe(false); // never blanket trust
    } else {
      expect(app.get("trust proxy")).toBe(false);
    }
    const srv = app.listen(0, "127.0.0.1"); await new Promise<void>(ok => srv.once("listening", () => ok()));
    const at = `http://127.0.0.1:${(srv.address() as { port: number }).port}`; cfg2.baseUrl = at;
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) { const r = await register({ "x-forwarded-for": `203.0.113.${i}` }, at); statuses.push(r.status); await r.text(); }
      // SDK registration limit is 20/hour/IP: with trust off every spoofed
      // X-Forwarded-For still lands in the loopback bucket (21st -> 429);
      // with loopback-proxy trust, the local proxy's forwarded address
      // separates buckets (no 429).
      if (trust) expect(statuses).not.toContain(429);
      else expect(statuses[20]).toBe(429);
    } finally { await new Promise<void>(ok => srv.close(() => ok())); db2.close(); }
  }
});

test("reject returns a client to unused above the admission target; next registration reconciles while hard 500 holds", async () => {
  const client = await (await register()).json();
  const b = new Browser(); await b.login("alpha");
  expect((await authorize(b, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const now = Date.now();
  const unusedPool = () => count("oauth_clients c WHERE NOT EXISTS (SELECT 1 FROM oauth_pending p WHERE p.client_id=c.id) AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id=c.id)");
  // 100 aged unused fillers beside the 1 pending-backed registration.
  db.transaction(() => { for (let i = 0; i < 100; i++) insertClient(`rej-${i}`, now - 10 * 60_000, now + 86400_000); })();
  expect(unusedPool()).toBe(100);
  // Rejecting consent returns the client to unused: 101 is allowed transiently
  // (100 unused is the registration admission target, not an invariant).
  const html = await (await b.request("/oauth/consent")).text();
  const denied = await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "reject" });
  expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe("access_denied");
  expect(count("oauth_pending")).toBe(0);
  expect(unusedPool()).toBe(101);
  expect(count("oauth_clients")).toBe(101);
  // Next registration reconciles the 100-unused target while the 500 hard
  // total holds; the fresh grace-protected client survives, oldest fillers go.
  expect((await register()).status).toBe(201);
  expect(unusedPool()).toBe(100);
  expect(count("oauth_clients")).toBe(100);
  expect(count("oauth_clients WHERE id=?", client.client_id)).toBe(1);
});

test("current session replaces same-owner stale-epoch flow; old consent stays rejected, fresh flow uses current epoch", async () => {
  const client = await (await register()).json();
  const b = new Browser(); await b.login("alpha");
  const alpha = ownerId("alpha");
  expect((await authorize(b, client.client_id)).headers.get("location")).toBe("/oauth/consent");
  const staleCookie = b.cookies.get("lp_connect")!;
  // Concurrent owner deletion: epoch advances, live flows clear, and this
  // browser holds a fresh current session afterwards.
  await b.request("/delete", { csrf: await b.csrf() });
  const epoch = (db.prepare("SELECT epoch FROM owners WHERE id=?").get(alpha) as { epoch: number }).epoch;
  expect(epoch).toBe(2);
  expect(count("oauth_pending")).toBe(0);
  // Recreate the reviewer's losing interleave: a stale-epoch pending row for
  // the same owner lands after the deletion.
  db.prepare("INSERT INTO oauth_pending VALUES(?,?,?,?,?,?)").run(sha256(staleCookie), client.client_id,
    JSON.stringify({ redirectUri: "http://127.0.0.1:45678/callback", scopes: ["progress:read"], codeChallenge: "a".repeat(43), state: "s" }), alpha, epoch - 1, Date.now() + 600_000);
  b.cookies.set("lp_connect", staleCookie);
  // Old consent is still rejected ...
  expect((await b.request("/oauth/consent")).status).toBe(400);
  // ... but the valid current session may start a fresh authorization that
  // replaces the same owner's stale flow with current epoch/request.
  const freshChallenge = createHash("sha256").update(randomBytes(32).toString("base64url")).digest("base64url");
  const again = await b.request("/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: "http://127.0.0.1:45678/callback", resource: base + "/mcp", code_challenge: freshChallenge, code_challenge_method: "S256", scope: "progress:read", state: "s2" }));
  expect(again.headers.get("location")).toBe("/oauth/consent");
  const rows = db.prepare("SELECT epoch FROM oauth_pending").all() as { epoch: number }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].epoch).toBe(epoch);
  expect((await b.request("/oauth/consent")).status).toBe(200);
});

test("grace boundary is conservative at subsecond resolution: recorded 120s rejects, past 121s reclaims oldest", async () => {
  db.transaction(() => { const now = Date.now(); for (let i = 0; i < 99; i++) insertClient(`grace-${i}`, now, now + 86400_000); })();
  // Pin the subsecond phase so the recorded age lands deterministically in
  // [120000, 121000): the old >=120000 filter would evict here, i.e. as
  // little as ~119001ms after an actual :999ms registration.
  while (Date.now() % 1000 > 500) await new Promise(r => setTimeout(r, 25));
  const issued120 = Math.floor(Date.now() / 1000) - 120;
  insertClient("grace-boundary", issued120 * 1000, Date.now() + 86400_000);
  const recordedAge = Date.now() - issued120 * 1000;
  expect(recordedAge).toBeGreaterThanOrEqual(120_000);
  expect(recordedAge).toBeLessThan(121_000);
  expect(count("oauth_clients")).toBe(100);
  // need = 1, but nothing is past the conservative 121s boundary: refuse and
  // evict nothing, so the minimum is never weakened.
  const refused = await register();
  expect(refused.status).toBe(400); expect(await refused.text()).toContain("capacity");
  expect(count("oauth_clients WHERE id='grace-boundary'")).toBe(1);
  expect(count("oauth_clients")).toBe(100);
  // Past the conservative boundary the oldest unused client is reclaimed and
  // the admission target reconciles.
  const m = JSON.parse((db.prepare("SELECT metadata FROM oauth_clients WHERE id='grace-boundary'").get() as { metadata: string }).metadata);
  m.client_id_issued_at = Math.floor(Date.now() / 1000) - 122;
  db.prepare("UPDATE oauth_clients SET metadata=? WHERE id='grace-boundary'").run(JSON.stringify(m));
  expect((await register()).status).toBe(201);
  expect(count("oauth_clients WHERE id='grace-boundary'")).toBe(0);
  expect(count("oauth_clients")).toBe(100);
});
