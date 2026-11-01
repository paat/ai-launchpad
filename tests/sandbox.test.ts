import { expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { createApp, sandboxAttemptLimiter, type Config } from "../src/app.js";
import { openDb, sha256, type Db } from "../src/db.js";
import { NAIDIS } from "../src/naidis.js";
import type { ApprovalRow } from "../src/mcp.js";

const SUBJECT = "synthetic-sandbox-test-google";
type Started = { cfg: Config; db: Db; server: Server; base: string; close: () => Promise<void> };

async function start(db = openDb(":memory:"), over: Partial<Config> = {}): Promise<Started> {
  const cfg: Config = { demo: false, production: true, dbPath: ":memory:", baseUrl: "https://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: [SUBJECT], ...over };
  const { app } = createApp(cfg, db);
  const server = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cfg.baseUrl = base.replace("http:", "https:");
  return { cfg, db, server, base, close: () => new Promise<void>((ok) => { server.close(() => ok()); server.closeAllConnections(); }) };
}
async function withServer(run: (s: Started) => Promise<void>, over: Partial<Config> = {}) {
  const s = await start(openDb(":memory:"), over);
  try { await run(s); } finally { await s.close(); s.db.close(); }
}
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1];
const count = (db: Db, table: string, ownerId?: string) => (db.prepare(`SELECT count(*) n FROM ${table}${ownerId ? " WHERE owner_id=?" : ""}`).get(...(ownerId ? [ownerId] : [])) as { n: number }).n;

class Browser {
  cookies = new Map<string, string>();
  async request(s: Started, method: "GET" | "POST", path: string, fields?: Record<string, string>, headers?: Record<string, string>) {
    const res = await fetch(s.base + path, { method, redirect: "manual", headers: { connection: "close", cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(fields ? { "content-type": "application/x-www-form-urlencoded", origin: s.cfg.baseUrl } : {}), ...headers }, body: fields ? new URLSearchParams(fields) : undefined });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";"), i = pair.indexOf("=");
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return { status: res.status, headers: res.headers, body: await res.text() };
  }
  async csrf(s: Started) { return field((await this.request(s, "GET", "/")).body, "csrf"); }
}
async function sandbox(s: Started, browser = new Browser()) {
  const form = await browser.request(s, "GET", "/proovi");
  expect(form.status).toBe(200);
  const started = await browser.request(s, "POST", "/proovi", { preauth: field(form.body, "preauth") });
  expect(started.status).toBe(302);
  expect(started.headers.get("location")).toBe("/");
  const owner = s.db.prepare("SELECT * FROM owners WHERE kind='sandbox' ORDER BY rowid DESC LIMIT 1").get() as { id: string; subject: string; created_at: string };
  const pending = s.db.prepare("SELECT * FROM approvals WHERE owner_id=? AND state='pending'").get(owner.id) as ApprovalRow;
  return { browser, owner, pending, started };
}
async function proovi(s: Started, ip?: string) {
  const browser = new Browser(), headers = ip ? { "x-forwarded-for": ip } : undefined;
  const form = await browser.request(s, "GET", "/proovi", undefined, headers);
  expect(form.status).toBe(200);
  return browser.request(s, "POST", "/proovi", { preauth: field(form.body, "preauth") }, headers);
}
function google(s: Started, id = "own_google") {
  const now = new Date().toISOString(), raw = `google-session-${id}`;
  s.db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,'google',0,?)").run(id, `google:${SUBJECT}`, now);
  s.db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,'Google workspace')").run(id, `ws-${id}`);
  s.db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(raw), id, `csrf-${id}`, new Date(Date.now() + 3600_000).toISOString());
  const browser = new Browser(); browser.cookies.set("lp_session", raw);
  return { browser, ownerId: id, csrf: `csrf-${id}` };
}
function titled(a: ApprovalRow, title: string) {
  const payload = JSON.parse(a.payload_json) as { document: { title: string } };
  payload.document.title = title;
  return JSON.stringify(payload);
}

test("public Try it links create an isolated seeded sandbox; approve simulates sent, decline and standing approvals work", async () => withServer(async (s) => {
  for (const path of ["/", "/naidis", "/naidis/kinnitus", "/naidis/tehtud"]) {
    const html = await (await fetch(s.base + path)).text();
    expect(html).toContain('href="/proovi"'); expect(html).toContain("Proovi ise");
  }
  for (const path of ["/?lang=en", "/naidis?lang=en", "/naidis/kinnitus?lang=en", "/naidis/tehtud?lang=en"]) {
    const html = await (await fetch(s.base + path)).text();
    expect(html).toContain(path.startsWith("/naidis") ? 'href="/proovi?lang=en"' : 'href="/proovi"');
    expect(html).toContain("Try it yourself");
  }
  const browser = new Browser(), form = await browser.request(s, "GET", "/proovi");
  expect(form.headers.get("cache-control")).toBe("no-store");
  expect(form.body).toContain("Saad oma ajutise näidistööruumi väljamõeldud ettevõttega. Saad kinnitusi anda ja keelduda; päriselt ei saadeta midagi. Tööruum kustub 24 tunni pärast.");
  const en = await new Browser().request(s, "GET", "/proovi?lang=en");
  expect(en.body).toContain("You get your own temporary sample workspace with a made-up company. You can approve and decline; nothing is really sent. The workspace is deleted after 24 hours.");
  expect(en.body).toContain(">Start</button>");

  const { owner, pending, started } = await sandbox(s, browser);
  expect(owner.subject).toMatch(/^sandbox:[A-Za-z0-9_-]{32}$/);
  expect(started.headers.getSetCookie().join(" ")).toContain("Max-Age=7200");
  expect(count(s.db, "assessments", owner.id)).toBe(1);
  expect(count(s.db, "progress", owner.id)).toBe(1);
  expect(count(s.db, "approvals", owner.id)).toBe(NAIDIS.week2.length);
  expect(count(s.db, "approvals", owner.id)).toBeGreaterThan(1);
  const home = await browser.request(s, "GET", "/");
  expect(home.body).toContain("päriselt midagi ei saadeta");
  expect(home.body).toContain("Maksemeeldetuletus: arve 2026-014");
  expect(home.body).toContain("Saadetud: demo"); expect(home.body).toContain("Makstud: demo");
  expect(home.body).toContain("Valmistas ette: KMD ettevalmistus");

  const csrf = await browser.csrf(s);
  const approved = await browser.request(s, "POST", `/approvals/${pending.id}/decide`, { csrf, digest: pending.digest, decision: "approve" });
  expect(approved.status).toBe(302);
  const after = s.db.prepare("SELECT * FROM approvals WHERE id=?").get(pending.id) as ApprovalRow;
  expect(after.state).toBe("consumed");
  expect(JSON.parse(after.outcome_json!)).toMatchObject({ outcome: "sent", observed_at: expect.any(String) });
  expect(Date.parse(JSON.parse(after.outcome_json!).observed_at)).toBeLessThanOrEqual(Date.now());
  expect(count(s.db, "reports", owner.id)).toBe(5);
  const simulated = s.db.prepare("SELECT summary FROM activity WHERE owner_id=? AND action='record_action_outcome' ORDER BY id DESC LIMIT 1").get(owner.id) as { summary: string };
  expect(simulated.summary).toContain("Näidis: assistent saatis — päriselt ei saadetud");
  const receipt = await browser.request(s, "GET", `/approvals/${pending.id}`);
  expect(receipt.body).toContain("Saadetud: demo"); expect(receipt.body).toContain("päriselt ei saadetud"); expect(receipt.body).toContain("Käest ära:");

  const rule = await browser.request(s, "POST", "/standing-approvals", { csrf, approval_id: pending.id, scope: "recipient", max_eur: "500" });
  expect(rule.status).toBe(302); expect(count(s.db, "standing_approvals", owner.id)).toBe(1);

  const second = await sandbox(s);
  const declined = await second.browser.request(s, "POST", `/approvals/${second.pending.id}/decide`, { csrf: await second.browser.csrf(s), digest: second.pending.digest, decision: "decline" });
  expect(declined.status).toBe(302);
  expect(s.db.prepare("SELECT state,outcome_json FROM approvals WHERE id=?").get(second.pending.id)).toEqual({ state: "declined", outcome_json: null });
}));

test("sandbox browser sessions cannot authorize OAuth, mint tokens or call MCP/report_unmet_need", async () => withServer(async (s) => {
  const { browser, owner } = await sandbox(s), csrf = await browser.csrf(s);
  const registration = await fetch(s.base + "/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://assistant.example/callback"], client_name: "Synthetic sandbox probe", token_endpoint_auth_method: "none" }) });
  expect(registration.status).toBe(201); const client = await registration.json();
  const authorize = await browser.request(s, "GET", "/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: s.cfg.baseUrl + "/mcp", code_challenge: "a".repeat(43), code_challenge_method: "S256", scope: "progress:read progress:report" }));
  expect(authorize.status).toBe(403);
  expect(count(s.db, "oauth_pending")).toBe(0); expect(count(s.db, "oauth_grants")).toBe(0);

  const token = await browser.request(s, "POST", "/tokens", { csrf });
  expect(token.status).toBe(403); expect(count(s.db, "mcp_tokens", owner.id)).toBe(0);
  const rpc = (authorization?: string) => fetch(s.base + "/mcp", { method: "POST", headers: { connection: "close", cookie: `lp_session=${browser.cookies.get("lp_session")}`, "content-type": "application/json", accept: "application/json, text/event-stream", ...(authorization ? { authorization } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "report_unmet_need", arguments: { report_id: "forbidden", need: "Synthetic unavailable job", blocker: "no_connector" } } }) });
  expect((await rpc()).status).toBe(401);
  const raw = `lp_${randomBytes(32).toString("base64url")}`;
  s.db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('forged',?,?,?,1,?)").run(owner.id, sha256(raw), "progress:read,progress:report", new Date().toISOString());
  expect((await rpc(`Bearer ${raw}`)).status).toBe(401);
  expect(count(s.db, "unmet_needs", owner.id)).toBe(0);
}));

test("sandbox is refused before setup, public-card ledger reads or model-backed work", async () => withServer(async (s) => {
  const { browser, owner } = await sandbox(s), before = count(s.db, "activity", owner.id), csrf = await browser.csrf(s);
  expect((await browser.request(s, "GET", "/setup")).status).toBe(403);
  expect((await browser.request(s, "POST", "/setup", { csrf, topic: "email", locale: "en" })).status).toBe(403);
  expect((await browser.request(s, "GET", "/playbooks")).status).toBe(403);
  expect(count(s.db, "activity", owner.id)).toBe(before);
}));

test("sandbox cannot publish demand, create a public calendar, enable reporting or delete candidates", async () => withServer(async (s) => {
  const { browser, owner } = await sandbox(s), csrf = await browser.csrf(s), now = new Date().toISOString();
  s.db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,demand_label,spec,created_at,updated_at) VALUES('need',?,'r','h','Synthetic need','no_connector','classified','SANDBOX_PRIVATE_NEED','Private spec',?,?)").run(owner.id, now, now);
  const publish = await browser.request(s, "POST", "/unmet-needs/decide", { csrf, need_id: "need", decision: "publish" });
  expect(publish.status).toBe(403);
  expect(s.db.prepare("SELECT state FROM unmet_needs WHERE id='need'").get()).toEqual({ state: "classified" });
  expect(await (await fetch(s.base + "/demand")).text()).not.toContain("SANDBOX_PRIVATE_NEED");
  expect((await browser.request(s, "POST", "/calendar/feed", { csrf })).status).toBe(403);
  expect(count(s.db, "calendar_feeds", owner.id)).toBe(0);
  const feedToken = "a".repeat(43);
  s.db.prepare("INSERT INTO calendar_feeds(owner_id,token_hash,created_at) VALUES(?,?,?)").run(owner.id, sha256(feedToken), now);
  expect((await fetch(s.base + `/calendar/${feedToken}.ics`)).status).toBe(404);
  expect((await browser.request(s, "POST", "/reporting", { csrf, enabled: "1" })).status).toBe(403);
  expect(s.db.prepare("SELECT reporting_enabled FROM owners WHERE id=?").get(owner.id)).toEqual({ reporting_enabled: 0 });
  s.db.prepare("INSERT INTO candidates(id,owner_id,norm_key,name,connection,jobs,created_at) VALUES('candidate',?,'key','Synthetic','https://example.invalid','job',?)").run(owner.id, now);
  expect((await browser.request(s, "POST", "/candidates/delete", { csrf, candidate_id: "candidate" })).status).toBe(403);
  expect(count(s.db, "candidates", owner.id)).toBe(1);
}));

test("two sandboxes and a Google owner cannot read each other's approvals or page rows", async () => withServer(async (s) => {
  const a = await sandbox(s), b = await sandbox(s), g = google(s);
  s.db.prepare("UPDATE approvals SET payload_json=? WHERE id=?").run(titled(a.pending, "SANDBOX_A_ONLY"), a.pending.id);
  s.db.prepare("UPDATE approvals SET payload_json=? WHERE id=?").run(titled(b.pending, "SANDBOX_B_ONLY"), b.pending.id);
  const googleApproval = { ...a.pending, id: "appr_google", owner_id: g.ownerId, payload_json: titled(a.pending, "GOOGLE_ONLY") } as ApprovalRow & { owner_id: string };
  s.db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)").run(googleApproval.id, g.ownerId, googleApproval.kind, googleApproval.report_id, googleApproval.payload_json, googleApproval.digest, googleApproval.expires_at, googleApproval.created_at);
  expect((await a.browser.request(s, "GET", `/approvals/${b.pending.id}`)).status).toBe(404);
  expect((await a.browser.request(s, "GET", `/approvals/${googleApproval.id}`)).status).toBe(404);
  expect((await g.browser.request(s, "GET", `/approvals/${a.pending.id}`)).status).toBe(404);
  const aHome = (await a.browser.request(s, "GET", "/")).body, bHome = (await b.browser.request(s, "GET", "/")).body, gHome = (await g.browser.request(s, "GET", "/")).body;
  expect(aHome).toContain("SANDBOX_A_ONLY"); expect(aHome).not.toContain("SANDBOX_B_ONLY"); expect(aHome).not.toContain("GOOGLE_ONLY");
  expect(bHome).toContain("SANDBOX_B_ONLY"); expect(bHome).not.toContain("SANDBOX_A_ONLY");
  expect(gHome).toContain("GOOGLE_ONLY"); expect(gHome).not.toContain("SANDBOX_A_ONLY"); expect(gHome).not.toContain("SANDBOX_B_ONLY");
}));

test("POST /proovi allows five attempts per IP per ten minutes, then renders a 429 page", async () => withServer(async (s) => {
  for (let i = 0; i < 5; i++) await sandbox(s);
  const browser = new Browser(), form = await browser.request(s, "GET", "/proovi");
  const limited = await browser.request(s, "POST", "/proovi", { preauth: field(form.body, "preauth") });
  expect(limited.status).toBe(429); expect(limited.body).toContain("<!doctype html>");
  expect(limited.body).toContain("Liiga palju katseid. Oota kümme minutit ja proovi uuesti.");
  expect(count(s.db, "owners")).toBe(5);
}));

test("six addresses in one IPv6 /64 share the sandbox limit; another /64 is independent", async () => withServer(async (s) => {
  for (const ip of ["2001:db8:abcd:12::1", "2001:db8:abcd:12::2", "2001:db8:abcd:12:aaaa:bbbb:cccc:dddd", "2001:db8:abcd:12:1:2:3:4", "2001:DB8:ABCD:12:ffff::ee"]) expect((await proovi(s, ip)).status).toBe(302);
  const blocked = await proovi(s, "2001:0db8:abcd:0012::9");
  expect(blocked.status).toBe(429);
  expect(blocked.body).toContain("Liiga palju katseid. Oota kümme minutit ja proovi uuesti.");
  expect((await proovi(s, "2001:db8:abcd:13::1")).status).toBe(302);
  expect((await proovi(s, "2001:db8:abcd:12::ffff")).status).toBe(429);
  expect(count(s.db, "owners")).toBe(6);
}, { trustLoopbackProxy: true }));

test("mapped IPv4 is limited as that IPv4, not as one shared prefix", async () => withServer(async (s) => {
  for (let i = 1; i <= 6; i++) expect((await proovi(s, `::ffff:198.51.100.${i}`)).status).toBe(302);
  for (let i = 0; i < 5; i++) expect((await proovi(s, "203.0.113.10")).status).toBe(302);
  for (const ip of ["::ffff:203.0.113.10", "0:0:0:0:0:ffff:203.0.113.10", "::ffff:cb00:710a"]) {
    const blocked = await proovi(s, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toContain("Liiga palju katseid. Oota kümme minutit ja proovi uuesti.");
  }
  expect(count(s.db, "owners")).toBe(11);
}, { trustLoopbackProxy: true }));

test("the global active-sandbox cap renders the plain-language 503 page and creates nothing", async () => withServer(async (s) => {
  const insert = s.db.prepare("INSERT INTO owners(id,subject,kind,created_at) VALUES(?,?,'sandbox',?)"), now = new Date().toISOString();
  for (let i = 0; i < 999; i++) insert.run(`old-${i}`, `sandbox:capacity-${i}`, now);
  await sandbox(s);
  expect(count(s.db, "owners")).toBe(1000);
  const browser = new Browser(), form = await browser.request(s, "GET", "/proovi");
  const sessions = count(s.db, "sessions");
  const full = await browser.request(s, "POST", "/proovi", { preauth: field(form.body, "preauth") });
  expect(full.status).toBe(503); expect(full.body).toContain("Näidistööruume on praegu liiga palju, proovi hiljem.");
  expect(count(s.db, "owners")).toBe(1000); expect(count(s.db, "sessions")).toBe(sessions);
}));

test("POST /delete reissues a sandbox session for two hours", async () => withServer(async (s) => {
  const { browser } = await sandbox(s);
  const deleted = await browser.request(s, "POST", "/delete", { csrf: await browser.csrf(s) });
  expect(deleted.status).toBe(302);
  expect(deleted.headers.get("location")).toBe("/");
  expect(deleted.headers.getSetCookie().join(" ")).toContain("Max-Age=7200");
  expect((await browser.request(s, "GET", "/")).status).toBe(200);
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 3 * 3600_000);
  try {
    const later = await browser.request(s, "GET", "/");
    expect(later.status).toBe(302);
    expect(later.headers.get("location")).toBe("/login");
  } finally { clock.mockRestore(); }
}));

const ownerTables = ["workspaces", "sessions", "mcp_tokens", "assessments", "reports", "progress", "candidates", "activity", "approvals", "unmet_needs", "calendar_feeds", "standing_approvals", "oauth_pending", "oauth_grants"];
function allOwnerRows(db: Db, id: string) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,'Synthetic')").run(id, `ws-${id}`);
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,'csrf',?)").run(`session-${id}`, id, new Date(Date.now() + 3600_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,'progress:read',1,?)").run(`token-${id}`, id, `hash-${id}`, now);
  db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,1,'{}','h',?)").run(`assessment-${id}`, id, now);
  db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,receipt_json,created_at) VALUES(?,'report','kind','h','{}',?)").run(id, now);
  db.prepare("INSERT INTO progress(id,owner_id,task_id,milestone,evidence_label,evidence_refs_json,observed_at,version,created_at) VALUES(?,?,'task','started','assistant_reported','[]',?,1,?)").run(`progress-${id}`, id, now, now);
  db.prepare("INSERT INTO candidates(id,owner_id,norm_key,name,connection,jobs,created_at) VALUES(?,?,'key','Synthetic','https://example.invalid','job',?)").run(`candidate-${id}`, id, now);
  db.prepare("INSERT INTO activity(owner_id,actor,action,outcome,summary,created_at) VALUES(?,'owner','test','ok','Synthetic',?)").run(id, now);
  db.prepare("INSERT INTO approvals(id,owner_id,payload_json,digest,state,expires_at,created_at) VALUES(?,?,'{}','digest','consumed',?,?)").run(`approval-${id}`, id, now, now);
  db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,created_at,updated_at) VALUES(?,?,'need','h','Synthetic','no_connector','classified',?,?)").run(`need-${id}`, id, now, now);
  db.prepare("INSERT INTO calendar_feeds(owner_id,token_hash,created_at) VALUES(?,?,?)").run(id, `feed-${id}`, now);
  db.prepare("INSERT INTO standing_approvals(id,owner_id,kind,max_amount_cents,max_per_day,expires_at,created_at) VALUES(?,?,'send_message',100,1,?,?)").run(`rule-${id}`, id, now, now);
  db.prepare("INSERT INTO oauth_clients(id,metadata,expires) VALUES(?, '{}', ?)").run(`client-${id}`, Date.now() + 3600_000);
  db.prepare("INSERT INTO oauth_pending(id,client_id,params,owner_id,epoch,expires) VALUES(?,?,'{}',?,1,?)").run(`pending-${id}`, `client-${id}`, id, Date.now() + 3600_000);
  db.prepare("INSERT INTO oauth_grants(id,owner_id,epoch,client_id,scopes,resource,expires,redirect) VALUES(?,?,1,?,'progress:read','https://example.invalid/mcp',?,'https://example.invalid/cb')").run(`grant-${id}`, id, `client-${id}`, Date.now() + 3600_000);
  db.prepare("INSERT INTO oauth_codes(hash,grant_id,challenge,redirect,expires) VALUES(?,?,'challenge','https://example.invalid/cb',?)").run(`code-${id}`, `grant-${id}`, Date.now() + 3600_000);
  db.prepare("INSERT INTO oauth_credentials(hash,grant_id,kind,expires) VALUES(?,?,'access',?)").run(`credential-${id}`, `grant-${id}`, Date.now() + 3600_000);
}

test("24-hour startup expiry removes every owner-scoped row and leaves a live sandbox untouched", () => {
  const db = openDb(":memory:"), old = "sandbox-expired", live = "sandbox-live", now = Date.now();
  db.prepare("INSERT INTO owners(id,subject,kind,created_at) VALUES(?,?,'sandbox',?),(?,?,'sandbox',?)").run(old, `sandbox:${old}`, new Date(now - 25 * 3600_000).toISOString(), live, `sandbox:${live}`, new Date(now).toISOString());
  allOwnerRows(db, old); allOwnerRows(db, live);
  createApp({ demo: false, production: true, dbPath: ":memory:", baseUrl: "https://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"], googleAllowedSubjects: [SUBJECT] }, db);
  for (const table of ownerTables) {
    expect(count(db, table, old), `${table} expired`).toBe(0);
    expect(count(db, table, live), `${table} live`).toBe(1);
  }
  expect(db.prepare("SELECT count(*) n FROM oauth_codes WHERE grant_id=?").get(`grant-${old}`)).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) n FROM oauth_credentials WHERE grant_id=?").get(`grant-${old}`)).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) n FROM oauth_codes WHERE grant_id=?").get(`grant-${live}`)).toEqual({ n: 1 });
  expect(db.prepare("SELECT count(*) n FROM oauth_credentials WHERE grant_id=?").get(`grant-${live}`)).toEqual({ n: 1 });
  expect(db.prepare("SELECT count(*) n FROM owners WHERE id=?").get(old)).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) n FROM owners WHERE id=?").get(live)).toEqual({ n: 1 });
  db.close();
});

test("the sandbox rate map keeps capped keys and refuses a new key until expired windows are pruned", () => {
  const allow = sandboxAttemptLimiter(), now = 1_700_000_000_000;
  for (let i = 0; i < 1000; i++) {
    for (let n = 0; n < 5; n++) expect(allow(`k-${i}`, now)).toBe(true);
    expect(allow(`k-${i}`, now)).toBe(false);
  }
  expect(allow("new-key", now)).toBe(false);
  expect(allow("k-0", now)).toBe(false);
  expect(allow("new-key", now + 600_000 - 1)).toBe(false);
  expect(allow("k-0", now + 600_000 - 1)).toBe(false);
  expect(allow("new-key", now + 600_000)).toBe(true);
});

test("GET /proovi double-submit survives a burst and rejects a missing or mismatched token", async () => withServer(async (s) => {
  const first = new Browser(), form = await first.request(s, "GET", "/proovi");
  const set = form.headers.getSetCookie().find((c) => c.startsWith("lp_proovi=")) ?? "";
  expect(set).toContain("HttpOnly");
  expect(set).toContain("SameSite=Lax");
  expect(set).toContain("Path=/proovi");
  expect(set).toContain("Secure");
  expect(form.headers.getSetCookie().some((c) => c.startsWith("lp_preauth="))).toBe(false);
  const token = field(form.body, "preauth");
  for (let i = 0; i < 600; i += 40) await Promise.all(Array.from({ length: Math.min(40, 600 - i) }, () => new Browser().request(s, "GET", "/proovi")));
  const started = await first.request(s, "POST", "/proovi", { preauth: token });
  expect(started.status).toBe(302);
  expect(count(s.db, "owners")).toBe(1);
  const replay = await first.request(s, "POST", "/proovi", { preauth: token });
  expect(replay.status).toBe(403);
  expect(replay.body).toContain("<!doctype html>");
  expect(replay.body).toContain("Ava proovimise leht selles brauseris uuesti. Tööruumi ei loodud.");
  expect(count(s.db, "owners")).toBe(1);
  const missing = await new Browser().request(s, "POST", "/proovi", { preauth: token });
  expect(missing.status).toBe(403);
  expect(missing.body).toContain("<!doctype html>");
  expect(missing.body).toContain("Ava proovimise leht selles brauseris uuesti. Tööruumi ei loodud.");
  const holder = new Browser(), held = await holder.request(s, "GET", "/proovi");
  const mismatched = await holder.request(s, "POST", "/proovi", { preauth: `${field(held.body, "preauth")}x` });
  expect(mismatched.status).toBe(403);
  expect(mismatched.body).toContain("<!doctype html>");
  expect(mismatched.body).toContain("Tööruumi ei loodud.");
  expect(count(s.db, "owners")).toBe(1);
}));

test("sandbox /uhenda shows the sample state without token, setup or calendar actions", async () => withServer(async (s) => {
  const { browser } = await sandbox(s);
  const html = (await browser.request(s, "GET", "/uhenda")).body;
  expect(html).toContain('data-state="sample"');
  expect(html).toContain("Näidistööruumis ühenduse olekut ei jälgita.");
  expect(html).toContain("päriselt midagi ei saadeta");
  expect(html).not.toMatch(/href="\/tokens|action="\/tokens|href="\/setup|action="\/setup|href="\/calendar\/feed|action="\/calendar\/feed/);
  const ava = await browser.request(s, "GET", "/uhenda/ava?a=chatgpt");
  expect(ava.status).toBe(302);
  expect(ava.headers.get("location")).toBe("/uhenda");
  for (const path of ["/playbooks", "/setup"]) {
    const denied = await browser.request(s, "GET", path);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("content-type")).toContain("text/html");
    expect(denied.body.startsWith("<!doctype html>")).toBe(true);
    expect(denied.body).toContain("Näidistööruumis pole saadaval");
    expect(denied.body).toContain("See toiming on väljalülitatud ajutises näidistööruumis. Midagi ei muudetud.");
  }
  const token = await browser.request(s, "POST", "/tokens", { csrf: await browser.csrf(s) });
  expect(token.status).toBe(403);
  expect(token.body.startsWith("<!doctype html>")).toBe(true);
  expect(token.body).toContain("Näidistööruumis pole saadaval");
  // ?lang= sticks in the lang cookie, so the English checks come after the Estonian ones.
  const en = await browser.request(s, "GET", "/uhenda?lang=en");
  expect(en.body).toContain("Connection status is not tracked in a sample workspace.");
  expect(en.body).not.toMatch(/href="\/tokens|action="\/tokens|href="\/setup|action="\/setup|href="\/calendar\/feed|action="\/calendar\/feed/);
  const deniedEn = await browser.request(s, "GET", "/playbooks?lang=en");
  expect(deniedEn.status).toBe(403);
  expect(deniedEn.body).toContain("Not available in a sample workspace");
  expect(deniedEn.body).toContain("This action is disabled in a temporary sample workspace. Nothing was changed.");
}));

test("seeded sandbox reports match sent and paid outcomes, and one live approval adds one", async () => withServer(async (s) => {
  const { browser, owner, pending } = await sandbox(s);
  const rows = () => s.db.prepare("SELECT kind,payload_json,receipt_json,payload_hash FROM reports WHERE owner_id=? ORDER BY created_at,report_id").all(owner.id) as { kind: string; payload_json: string; receipt_json: string; payload_hash: string }[];
  const outcomes = () => rows().map((r) => JSON.parse(r.payload_json).outcome as string).sort();
  expect(rows()).toHaveLength(4);
  expect(outcomes()).toEqual(["paid", "sent", "sent", "sent"]);
  for (const row of rows()) {
    expect(row.kind).toBe("outcome");
    expect(row.payload_hash).toBe(sha256(row.payload_json));
    const payload = JSON.parse(row.payload_json) as { approval_id: string; outcome: string; observed_at: string };
    const receipt = JSON.parse(row.receipt_json) as { kind: string; approval_id: string; state: string; outcome: string; observed_at: string; evidence_refs: string[]; evidence_label: string; meaning: string };
    expect(receipt).toMatchObject({ kind: "action_outcome_saved", approval_id: payload.approval_id, state: "consumed", outcome: payload.outcome, observed_at: payload.observed_at, evidence_refs: [], evidence_label: "assistant_reported" });
    expect(receipt.meaning).toBe("Launchpad recorded what your assistant reported. It did not send, pay or file anything and did not verify this outcome.");
  }
  expect((await browser.request(s, "GET", "/")).body).toContain("Assistendi teated: 4,");
  const approved = await browser.request(s, "POST", `/approvals/${pending.id}/decide`, { csrf: await browser.csrf(s), digest: pending.digest, decision: "approve" });
  expect(approved.status).toBe(302);
  expect(rows()).toHaveLength(5);
  expect(outcomes()).toEqual(["paid", "sent", "sent", "sent", "sent"]);
  expect((await browser.request(s, "GET", "/")).body).toContain("Assistendi teated: 5,");
}));

test("seeded sandbox timestamps shift onto today: the pending reminder is created that day and nothing is later than now except future expiries", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-12-10T10:00:00.000Z") });
  try {
    await withServer(async (s) => {
      const now = Date.parse("2026-12-10T10:00:00.000Z");
      const shift = (iso: string) => new Date(Date.parse(iso) + now - NAIDIS.NOW.getTime()).toISOString();
      const { owner, pending } = await sandbox(s);
      expect(pending.created_at.slice(0, 10)).toBe("2026-12-10");
      expect(pending.created_at).toBe(shift(NAIDIS.pendingApproval.created_at));
      expect(Date.parse(pending.expires_at)).toBeGreaterThan(now);
      const assessed = s.db.prepare("SELECT created_at FROM assessments WHERE owner_id=?").get(owner.id) as { created_at: string };
      const progress = s.db.prepare("SELECT observed_at,created_at FROM progress WHERE owner_id=?").get(owner.id) as { observed_at: string; created_at: string };
      expect(assessed.created_at).toBe(shift("2026-10-28T10:00:00.000Z"));
      expect(progress.observed_at).toBe(shift(NAIDIS.preparedProgress[0].observed_at));
      expect(progress.created_at).toBe(progress.observed_at);
      const iso = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
      const stamps: { at: string; expiry: boolean }[] = [];
      const walk = (value: unknown, expiry: boolean) => {
        if (typeof value === "string") {
          if ((value.startsWith("{") || value.startsWith("[")) && value.includes("T")) {
            try { walk(JSON.parse(value), expiry); return; } catch { /* plain text */ }
          }
          for (const at of value.match(iso) ?? []) stamps.push({ at, expiry });
          return;
        }
        if (!value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) walk(child, expiry || key === "expires_at");
      };
      for (const table of ["approvals", "reports", "assessments", "progress"]) {
        for (const row of s.db.prepare(`SELECT * FROM ${table} WHERE owner_id=?`).all(owner.id) as Record<string, unknown>[]) walk(row, false);
      }
      expect(stamps.some((stamp) => stamp.expiry && Date.parse(stamp.at) > now)).toBe(true);
      for (const stamp of stamps) if (!stamp.expiry || Date.parse(stamp.at) <= now) expect(Date.parse(stamp.at), stamp.at).toBeLessThanOrEqual(now);
    });
  } finally { vi.useRealTimers(); }
});

test("sandbox authorize is refused without a Google allowlist and creates no pending row", async () => withServer(async (s) => {
  const { browser } = await sandbox(s);
  const registration = await fetch(s.base + "/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://assistant.example/callback"], client_name: "Synthetic sandbox probe", token_endpoint_auth_method: "none" }) });
  expect(registration.status).toBe(201);
  const client = await registration.json() as { client_id: string; redirect_uris: string[] };
  const authorize = await browser.request(s, "GET", "/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: s.cfg.baseUrl + "/mcp", code_challenge: "a".repeat(43), code_challenge_method: "S256", scope: "progress:read progress:report" }));
  expect(authorize.status).toBe(403);
  expect(authorize.body).toContain("Access is not available for this account.");
  expect(count(s.db, "oauth_pending")).toBe(0);
  expect(count(s.db, "oauth_grants")).toBe(0);
}, { production: false, googleAllowedSubjects: undefined }));

test("no sandbox page links to a route that refuses sandboxes", async () => withServer(async (s) => {
  const { browser, owner } = await sandbox(s);
  const now = new Date().toISOString();
  s.db.prepare("INSERT INTO candidates(id,owner_id,norm_key,name,connection,jobs,created_at) VALUES('candidate',?,'key','Synthetic','https://example.invalid','job',?)").run(owner.id, now);
  const ids = s.db.prepare("SELECT id FROM approvals WHERE owner_id=?").all(owner.id) as { id: string }[];
  const queue = ["/", "/activity", "/uhenda", "/approvals", "/connection", "/kataloog", "/demand", ...ids.map((row) => `/approvals/${encodeURIComponent(row.id)}`)];
  const seen = new Set<string>();
  const posts = new Set<string>();
  // These routes 403 a sandbox. A link or form to one is the failure, named here,
  // before the crawl follows it. Language toggles are the same page, not new routes.
  const refuseGet = new Set(["/playbooks", "/setup"]);
  const refusePost = new Set(["/setup", "/tokens", "/reporting", "/candidates/delete", "/calendar/feed", "/unmet-needs/decide"]);
  const normalize = (href: string) => {
    const u = new URL(href, "http://launchpad.invalid");
    u.searchParams.delete("lang");
    const q = u.searchParams.toString();
    return u.pathname + (q ? `?${q}` : "");
  };
  const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&").split("#")[0]).filter((href) => href.startsWith("/") && !href.startsWith("//"));
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await browser.request(s, "GET", path);
    expect(res.status, path).not.toBe(403);
    if (res.status !== 200 || !res.body.startsWith("<!doctype")) continue;
    for (const href of hrefs(res.body)) {
      expect(refuseGet.has(href.split("?")[0]), `${path} links to ${href}`).toBe(false);
      const next = normalize(href);
      if (!seen.has(next)) queue.push(next);
    }
    for (const m of res.body.matchAll(/<form\b([^>]*)>/g)) {
      const tag = m[1];
      const action = /action="([^"]*)"/.exec(tag)?.[1]?.replace(/&amp;/g, "&").split("#")[0];
      if (!action?.startsWith("/")) continue;
      const method = (/method="([^"]*)"/i.exec(tag)?.[1] ?? "get").toLowerCase();
      if (method === "post") {
        expect(refusePost.has(action.split("?")[0]), `${path} posts to ${action}`).toBe(false);
        posts.add(action.split("?")[0]);
      } else {
        const next = normalize(action);
        if (!seen.has(next)) queue.push(next);
      }
    }
    expect(queue.length).toBeLessThan(80);
  }
  const csrf = await browser.csrf(s);
  for (const action of posts) {
    if (action === "/auth/logout" || action === "/delete") continue;
    const res = await browser.request(s, "POST", action, { csrf });
    expect(res.status, action).not.toBe(403);
  }
  expect(posts.has("/tokens")).toBe(false);
  expect(posts.has("/reporting")).toBe(false);
  expect(posts.has("/candidates/delete")).toBe(false);
  expect([...seen].some((path) => path === "/playbooks" || path.startsWith("/playbooks?") || path === "/setup" || path.startsWith("/setup?"))).toBe(false);
}));

test("approving a sandbox reminder twice does not 500 and stores one simulated report", async () => withServer(async (s) => {
  const { browser, owner, pending } = await sandbox(s);
  const csrf = await browser.csrf(s);
  const decide = () => browser.request(s, "POST", `/approvals/${pending.id}/decide`, { csrf, digest: pending.digest, decision: "approve" });
  const first = await decide();
  expect(first.status).toBe(302);
  expect(first.headers.get("location")).toBe(`/approvals/${pending.id}`);
  const again = await decide();
  expect(again.status).not.toBe(500);
  expect(again.status).toBe(409);
  // The read can still say pending after another request already decided the row.
  // The update then changes nothing, so the repeat must redirect and not simulate again.
  const prepare = s.db.prepare.bind(s.db);
  s.db.prepare = ((sql: string) => {
    const stmt = prepare(sql);
    if (sql === "SELECT * FROM approvals WHERE id=? AND owner_id=?") {
      const get = stmt.get.bind(stmt);
      stmt.get = ((...args: unknown[]) => {
        const row = get(...args) as { state?: string } | undefined;
        return row && row.state !== "pending" ? { ...row, state: "pending" } : row;
      }) as typeof stmt.get;
    }
    return stmt;
  }) as typeof s.db.prepare;
  try {
    const lost = await decide();
    expect(lost.status).not.toBe(500);
    expect(lost.status).toBe(302);
    expect(lost.headers.get("location")).toBe(`/approvals/${pending.id}`);
  } finally { s.db.prepare = prepare as typeof s.db.prepare; }
  expect(s.db.prepare("SELECT report_id FROM reports WHERE owner_id=? AND report_id LIKE 'sandbox:%'").all(owner.id)).toEqual([{ report_id: `sandbox:${pending.id}` }]);
  expect(count(s.db, "reports", owner.id)).toBe(5);
}));

test("POST /proovi deletes every expired sandbox row and leaves a live sandbox", async () => withServer(async (s) => {
  const now = Date.now(), old = "sandbox-expired-post", live = "sandbox-live-post";
  s.db.prepare("INSERT INTO owners(id,subject,kind,created_at) VALUES(?,?,'sandbox',?),(?,?,'sandbox',?)").run(old, `sandbox:${old}`, new Date(now - 25 * 3600_000).toISOString(), live, `sandbox:${live}`, new Date(now).toISOString());
  allOwnerRows(s.db, old); allOwnerRows(s.db, live);
  await sandbox(s);
  for (const table of ownerTables) {
    expect(count(s.db, table, old), `${table} expired`).toBe(0);
    expect(count(s.db, table, live), `${table} live`).toBe(1);
  }
  expect(s.db.prepare("SELECT count(*) n FROM oauth_codes WHERE grant_id=?").get(`grant-${old}`)).toEqual({ n: 0 });
  expect(s.db.prepare("SELECT count(*) n FROM oauth_credentials WHERE grant_id=?").get(`grant-${old}`)).toEqual({ n: 0 });
  expect(s.db.prepare("SELECT count(*) n FROM oauth_codes WHERE grant_id=?").get(`grant-${live}`)).toEqual({ n: 1 });
  expect(s.db.prepare("SELECT count(*) n FROM owners WHERE id=?").get(old)).toEqual({ n: 0 });
  expect(s.db.prepare("SELECT count(*) n FROM owners WHERE id=?").get(live)).toEqual({ n: 1 });
}));
