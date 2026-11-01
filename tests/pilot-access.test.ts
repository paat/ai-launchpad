import { afterAll, beforeAll, expect, test } from "vitest";
import type { Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { createApp, configFromEnv, type Config } from "../src/app.js";
import { openDb, type Db } from "../src/db.js";

// Owner-only pilot access: synthetic opaque Google subjects only. The OIDC
// provider is faked with signed tokens exactly like launchpad.test.ts; no
// external network is used (the fetch stub throws for unknown origins).
const SUB_A = "synthetic-subject-allowed-1";
const SUB_B = "synthetic-subject-allowed-2";
const SUB_DENIED = "synthetic-subject-denied-9";
const EMAIL = "synthetic-pilot@example.invalid";

const nativeFetch = globalThis.fetch;
const localOrigins = new Set<string>();
let nonce = "", challenge = "", subject = SUB_A;
let signToken: (sub: string) => Promise<string>;

beforeAll(async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "synthetic-pilot-key", alg: "RS256", use: "sig" };
  signToken = (sub) => new SignJWT({ nonce, email: EMAIL })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer("https://accounts.google.com").setAudience("synthetic-client")
    .setSubject(sub).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (localOrigins.has(url.origin)) return nativeFetch(input, init);
    if (url.href === "https://accounts.google.com/.well-known/openid-configuration") {
      return Response.json({ issuer: "https://accounts.google.com", authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth", token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs", response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] });
    }
    if (url.href === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
    if (url.href === "https://oauth2.googleapis.com/token") {
      const p = new URLSearchParams(String(init?.body ?? ""));
      expect(p.get("code")).toBe("synthetic-code");
      expect(createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url")).toBe(challenge);
      return Response.json({ access_token: "synthetic-access", token_type: "Bearer", expires_in: 300, id_token: await signToken(subject) });
    }
    throw new Error(`External network prohibited: ${url.origin}`);
  };
});
afterAll(() => { globalThis.fetch = nativeFetch; });

type Started = { cfg: Config; db: Db; server: Server; base: string; port: number; close: () => Promise<void> };
async function start(overrides: Partial<Config>, db: Db = openDb(":memory:"), port = 0): Promise<Started> {
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", googleClientId: "synthetic-client", googleClientSecret: "synthetic-placeholder", modelMode: "test", allowedHosts: ["127.0.0.1"], ...overrides };
  const { app } = createApp(cfg, db);
  const server = await new Promise<Server>((ok) => { const s = app.listen(port, "127.0.0.1", () => ok(s)); });
  const actualPort = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${actualPort}`;
  cfg.baseUrl = base;
  localOrigins.add(base);
  // closeAllConnections drops keep-alive sockets so a restarted server on
  // the same port is not reached through a stale pooled connection.
  return { cfg, db, server, base, port: actualPort, close: () => new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); }) };
}

async function consume(res: Response) {
  const body = await res.text();
  return { status: res.status, headers: res.headers, text: async () => body, json: async () => JSON.parse(body) };
}
const responseStatus = async (response: Promise<Response>) => (await consume(await response)).status;

class Browser {
  cookies = new Map<string, string>();
  async request(base: string, path: string, fields?: Record<string, string>) {
    const res = await fetch(path.startsWith("http") ? path : base + path, { method: fields ? "POST" : "GET", redirect: "manual", headers: { connection: "close", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(fields ? { "content-type": "application/x-www-form-urlencoded", origin: base } : {}) }, body: fields ? new URLSearchParams(fields) : undefined });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(";"); const i = pair.indexOf("="); this.cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
    return consume(res);
  }
  async googleLogin(base: string, sub: string) {
    subject = sub;
    const r = await this.request(base, "/auth/login/google");
    expect(r.status).toBe(302);
    const auth = new URL(r.headers.get("location")!);
    expect(auth.searchParams.get("scope")).toBe("openid email");
    nonce = auth.searchParams.get("nonce")!; challenge = auth.searchParams.get("code_challenge")!;
    return this.request(base, `/auth/callback/google?state=${encodeURIComponent(auth.searchParams.get("state")!)}&code=synthetic-code`);
  }
  async demoLogin(base: string, actor = "alpha") {
    const html = await (await this.request(base, "/login")).text();
    return this.request(base, "/auth/demo", { actor, preauth: field(html, "preauth") });
  }
  async csrf(base: string) { return field(await (await this.request(base, "/connection")).text(), "csrf"); }
}
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1];
const count = (db: Db, table: string) => (db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n;

const postToken = async (base: string, fields: Record<string, string>) =>
  consume(await fetch(base + "/token", { method: "POST", headers: { connection: "close", "content-type": "application/x-www-form-urlencoded", origin: "https://assistant.example" }, body: new URLSearchParams(fields), redirect: "manual" }));

async function oauthCode(base: string, browser: Browser) {
  const registration = await fetch(base + "/register", { method: "POST", headers: { connection: "close", "content-type": "application/json", origin: "https://assistant.example" }, body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:45678/callback"], client_name: "Pilot test assistant", token_endpoint_auth_method: "none" }) });
  expect(registration.status).toBe(201);
  const client = await registration.json();
  const verifier = randomBytes(32).toString("base64url");
  const params = { response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: base + "/mcp", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "client-state", scope: "progress:read" };
  const startRes = await browser.request(base, "/authorize?" + new URLSearchParams(params));
  expect(startRes.headers.get("location")).toBe("/oauth/consent");
  const html = await (await browser.request(base, "/oauth/consent")).text();
  const approved = await browser.request(base, "/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "allow" });
  const location = new URL(approved.headers.get("location")!);
  const code = location.searchParams.get("code")!;
  expect(code).toBeTruthy();
  return {
    client, code,
    exchange: () => postToken(base, { grant_type: "authorization_code", client_id: client.client_id, code, code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: base + "/mcp" }),
    authorizeParams: params,
  };
}
const refresh = (base: string, clientId: string, token: string) =>
  postToken(base, { grant_type: "refresh_token", client_id: clientId, refresh_token: token, resource: base + "/mcp" });

function mcpStatus(base: string, token: string) {
  return responseStatus(fetch(base + "/mcp", { method: "POST", headers: { connection: "close", authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "pilot-test", version: "1" } } }) }));
}
async function manualToken(base: string, browser: Browser) {
  const r = await browser.request(base, "/tokens", { csrf: await browser.csrf(base) });
  expect(r.status).toBe(200);
  const m = /<pre>(lp_[^<]+)<\/pre>/.exec(await r.text());
  if (!m) throw new Error("manual token not shown once");
  return m[1];
}

test("production env parser fails closed on missing, empty and invalid allowlists", () => {
  const prod = (extra: Record<string, string>) => () => configFromEnv({ NODE_ENV: "production", ...extra } as NodeJS.ProcessEnv);
  expect(prod({})).toThrow(/GOOGLE_ALLOWED_SUBJECTS/);
  expect(prod({ LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: "" })).toThrow(/GOOGLE_ALLOWED_SUBJECTS/);
  for (const bad of [
    "someone@example.invalid",           // email, never a subject
    "has space",                          // whitespace
    "synthetic-a,,synthetic-b",           // empty entry
    "synthetic-a,",                       // trailing empty entry
    ",synthetic-a",                       // leading empty entry
    " synthetic-a",                       // leading whitespace: no trimming
    "synthetic\ta",                       // control/whitespace
    "synthetic\u0080a",                   // C1 control U+0080
    "synthetic\u0085a",                   // C1 control U+0085 (NEL)
    "synthetic\u009Fa",                   // C1 control U+009F
    "synthetic-a,synthetic-a",            // duplicate
    Array.from({ length: 21 }, (_, i) => `synthetic-${i}`).join(","), // over count bound
    "s".repeat(256),                      // over length bound
  ]) expect(prod({ LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: bad })).toThrow(/GOOGLE_ALLOWED_SUBJECTS/);
  // Entire C1 range U+0080..U+009F rejects via the env parser, without echoing the subject.
  for (let cp = 0x80; cp <= 0x9f; cp++) {
    const sub = `synthetic-${String.fromCodePoint(cp)}-a`;
    let err: unknown;
    try { prod({ LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: sub })(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).toMatch(/GOOGLE_ALLOWED_SUBJECTS/);
    expect(String((err as Error).message)).not.toContain(sub);
  }
  // Exact values are preserved as given (no lowercasing/normalizing).
  expect(configFromEnv({ NODE_ENV: "production", LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: "Synthetic-Sub_AbC-123" } as NodeJS.ProcessEnv).googleAllowedSubjects).toEqual(["Synthetic-Sub_AbC-123"]);
  // Development: omitted is the existing local demo; invalid still rejects.
  expect(configFromEnv({} as NodeJS.ProcessEnv).googleAllowedSubjects).toBeUndefined();
  expect(() => configFromEnv({ LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: "someone@example.invalid" } as NodeJS.ProcessEnv)).toThrow(/GOOGLE_ALLOWED_SUBJECTS/);
  expect(configFromEnv({ LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: `${SUB_A},${SUB_B}` } as NodeJS.ProcessEnv).googleAllowedSubjects).toEqual([SUB_A, SUB_B]);
});

test("direct createApp Config is validated: production missing/empty/malformed fails closed", () => {
  const baseCfg = (extra: Partial<Config>): Config => ({ demo: false, production: true, dbPath: ":memory:", baseUrl: "https://localhost:3000", modelMode: "test", allowedHosts: ["localhost"], ...extra });
  const attempt = (cfg: Config) => { const db = openDb(":memory:"); try { createApp(cfg, db); return true; } catch { return false; } finally { db.close(); } };
  expect(attempt(baseCfg({}))).toBe(false);                                   // missing in production
  expect(attempt(baseCfg({ googleAllowedSubjects: [] }))).toBe(false);        // empty
  expect(attempt(baseCfg({ googleAllowedSubjects: ["someone@example.invalid"] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: [""] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: ["white space"] }))).toBe(false);
  // C1 controls reject via direct Config too: spot cases plus the entire U+0080..U+009F range.
  const c1 = (cp: number) => `synthetic-${String.fromCodePoint(cp)}-a`;
  expect(attempt(baseCfg({ googleAllowedSubjects: [c1(0x80)] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: [c1(0x85)] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: [c1(0x9f)] }))).toBe(false);
  for (let cp = 0x80; cp <= 0x9f; cp++) expect(attempt(baseCfg({ googleAllowedSubjects: [c1(cp)] }))).toBe(false);
  // Generic error: the rejected subject is never echoed.
  {
    const db = openDb(":memory:");
    try {
      createApp(baseCfg({ googleAllowedSubjects: [c1(0x85)] }), db);
      expect.unreachable("C1 subject must reject");
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/GOOGLE_ALLOWED_SUBJECTS/);
      expect(String((e as Error).message)).not.toContain(c1(0x85));
    } finally { db.close(); }
  }
  expect(attempt(baseCfg({ googleAllowedSubjects: "synthetic-not-an-array" as unknown as string[] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: [12345] as unknown as string[] }))).toBe(false);
  expect(attempt(baseCfg({ googleAllowedSubjects: [SUB_A] }))).toBe(true);    // valid production
  // Development omitted starts; an explicitly empty list is invalid anywhere.
  expect(attempt({ ...baseCfg({}), production: false })).toBe(true);
  expect(attempt({ ...baseCfg({ googleAllowedSubjects: [] }), production: false })).toBe(false);
});

test("verified OIDC: allowed subject creates owner/session; denied and case-variant get generic 403 with zero rows", async () => {
  const s = await start({ googleAllowedSubjects: [SUB_A, SUB_B] });
  try {
    const deniedBrowser = new Browser();
    const denied = await deniedBrowser.googleLogin(s.base, SUB_DENIED);
    expect(denied.status).toBe(403);
    const body = await denied.text();
    expect(body).toBe("Access is not available for this account.");
    expect(body).not.toContain(SUB_DENIED); expect(body).not.toContain(EMAIL);
    expect(denied.headers.getSetCookie().join(" ")).not.toContain("lp_session=");
    expect(count(s.db, "owners")).toBe(0); expect(count(s.db, "workspaces")).toBe(0); expect(count(s.db, "sessions")).toBe(0);

    // Identity is never normalized: the case variant of an allowed subject denies.
    const caseBrowser = new Browser();
    expect((await caseBrowser.googleLogin(s.base, SUB_A.toUpperCase())).status).toBe(403);
    expect(count(s.db, "owners")).toBe(0);

    const okBrowser = new Browser();
    const ok = await okBrowser.googleLogin(s.base, SUB_A);
    expect(ok.status).toBe(302);
    expect((await okBrowser.request(s.base, "/")).status).toBe(200);
    expect(s.db.prepare("SELECT subject,kind FROM owners").get()).toEqual({ subject: `google:${SUB_A}`, kind: "google" });
    expect(count(s.db, "workspaces")).toBe(1); expect(count(s.db, "sessions")).toBe(1);
  } finally { await s.close(); s.db.close(); }
});

test("explicit local list gives demo owners no bypass; omitted list keeps the local demo", async () => {
  const restricted = await start({ demo: true, googleAllowedSubjects: [SUB_A] });
  try {
    const b = new Browser();
    expect((await b.demoLogin(restricted.base)).status).toBe(302);
    const home = await b.request(restricted.base, "/");
    expect(home.status).toBe(302); expect(home.headers.get("location")).toBe("/login");
  } finally { await restricted.close(); restricted.db.close(); }

  const open = await start({ demo: true });
  try {
    const b = new Browser();
    expect((await b.demoLogin(open.base)).status).toBe(302);
    expect((await b.request(open.base, "/")).status).toBe(200);
  } finally { await open.close(); open.db.close(); }
});

test("removing a subject and restarting denies old browser/consent sessions, manual token, code, refresh and access; the other owner is unaffected", async () => {
  const db = openDb(":memory:");
  const first = await start({ googleAllowedSubjects: [SUB_A, SUB_B] }, db);
  const base = first.base;
  let second: Started | undefined;
  try {
    const browserA = new Browser(), browserB = new Browser();
    expect((await browserA.googleLogin(base, SUB_A)).status).toBe(302);
    expect((await browserB.googleLogin(base, SUB_B)).status).toBe(302);
    const manualA = await manualToken(base, browserA);
    const manualB = await manualToken(base, browserB);
    const unexchanged = await oauthCode(base, browserA);            // code kept for after the restart
    const flowA = await oauthCode(base, browserA);
    const tokensA = await (await flowA.exchange()).json();
    const flowB = await oauthCode(base, browserB);
    const tokensB = await (await flowB.exchange()).json();
    expect(tokensA.access_token).toBeTruthy(); expect(tokensB.access_token).toBeTruthy();
    // A fresh pending consent for A, still open at restart time.
    const pendingStart = await browserA.request(base, "/authorize?" + new URLSearchParams(unexchanged.authorizeParams));
    expect(pendingStart.headers.get("location")).toBe("/oauth/consent");
    expect((await browserA.request(base, "/oauth/consent")).status).toBe(200);
    // Everything works before removal.
    expect(await mcpStatus(base, manualA)).toBe(200);
    expect(await mcpStatus(base, tokensA.access_token)).toBe(200);
    expect((await browserA.request(base, "/")).status).toBe(200);

    await first.close();
    second = await start({ googleAllowedSubjects: [SUB_B] }, db, first.port);
    expect(second.base).toBe(base);

    // Removed owner A: every old credential is denied immediately.
    const homeA = await browserA.request(base, "/");
    expect(homeA.status).toBe(302); expect(homeA.headers.get("location")).toBe("/login");
    const consentA = await browserA.request(base, "/oauth/consent");
    expect(consentA.status).toBe(302); expect(consentA.headers.get("location")).toBe("/login?return_to=%2Foauth%2Fconsent");
    expect(await mcpStatus(base, manualA)).toBe(401);
    expect(await mcpStatus(base, tokensA.access_token)).toBe(401);
    expect((await unexchanged.exchange()).status).toBe(400);
    expect((await refresh(base, flowA.client.client_id, tokensA.refresh_token)).status).toBe(400);
    // A fresh sign-in for A is denied too, creating no new session.
    const sessionsBefore = count(db, "sessions");
    expect((await new Browser().googleLogin(base, SUB_A)).status).toBe(403);
    expect(count(db, "sessions")).toBe(sessionsBefore);
    expect(count(db, "owners")).toBe(2);

    // Still-allowed owner B is unaffected across the restart.
    expect((await browserB.request(base, "/")).status).toBe(200);
    expect(await mcpStatus(base, manualB)).toBe(200);
    expect(await mcpStatus(base, tokensB.access_token)).toBe(200);
    expect((await refresh(base, flowB.client.client_id, tokensB.refresh_token)).status).toBe(200);
    expect((await new Browser().googleLogin(base, SUB_B)).status).toBe(302);

    // Metadata and health remain anonymous.
    expect(await responseStatus(fetch(base + "/health", { headers: { connection: "close" } }))).toBe(200);
    expect(await responseStatus(fetch(base + "/.well-known/oauth-authorization-server", { headers: { connection: "close" } }))).toBe(200);
    expect(await responseStatus(fetch(base + "/.well-known/oauth-protected-resource/mcp", { headers: { connection: "close" } }))).toBe(200);
  } finally {
    await first.close().catch(() => {});
    if (second) await second.close().catch(() => {});
    db.close();
  }
});
