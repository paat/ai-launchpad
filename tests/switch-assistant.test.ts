import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";

// Issue #141: a second assistant picks up from saved facts. Real HTTP and real
// OAuth grants, same shape as tests/scopes.test.ts grant(). Synthetic names only.
let server: Server, db: ReturnType<typeof openDb>, base: string, cfg: Config;
const originalFetch = globalThis.fetch;
let external = 0;
const SAVED = "Before asking the owner any stable fact, check the saved facts (the remember-facts playbook).";
const SWITCH = "If this chat has not picked up from the owner's other assistant yet, follow the switch-assistant playbook first.";
const DESCRIPTION = "Start here. Start with the owner's deadlines (get_obligations), then offer the matching playbook. Public assessment framework, executable job playbooks and reporting guidance for any authenticated connection; with progress:read it also returns this workspace's company_ref, label and sharing state.";

beforeEach(async () => {
  cfg = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", allowedHosts: ["127.0.0.1"], modelMode: "test" };
  db = openDb(":memory:"); const { app } = createApp(cfg, db);
  await new Promise<void>(ok => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base; external = 0;
  vi.stubGlobal("fetch", ((url: string | URL | Request, init?: RequestInit) => {
    if (new URL(url instanceof Request ? url.url : url).origin !== base) { external++; throw new Error("External network forbidden"); }
    return originalFetch(url, init);
  }) as typeof fetch);
});
afterEach(async () => { vi.unstubAllGlobals(); await new Promise<void>(ok => server.close(() => ok())); db.close(); expect(external).toBe(0); });

class Browser {
  cookies = new Map<string, string>();
  async request(path: string, fields?: Record<string, string>) {
    const res = await fetch(path.startsWith("http") ? path : base + path, { method: fields ? "POST" : "GET", redirect: "manual", headers: { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(fields ? { "content-type": "application/x-www-form-urlencoded", origin: base } : {}) }, body: fields ? new URLSearchParams(fields) : undefined });
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
const post = (path: string, fields: Record<string, string>) => fetch(base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://assistant.example" }, body: new URLSearchParams(fields), redirect: "manual" });

async function grant(clientName: string, actor = "alpha", browser?: Browser, scope = "progress:read") {
  const client = await (await fetch(base + "/register", { method: "POST", headers: { "content-type": "application/json", origin: "https://assistant.example" }, body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:45678/callback"], client_name: clientName, token_endpoint_auth_method: "none" }) })).json();
  const verifier = randomBytes(32).toString("base64url"), b = browser ?? new Browser();
  const params = { response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: base + "/mcp", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state: "switch-state", scope };
  const start = await b.request("/authorize?" + new URLSearchParams(params));
  expect(start.headers.get("location")).toBe("/oauth/consent");
  await b.login(actor);
  const html = await (await b.request("/oauth/consent")).text();
  const approved = await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "allow", ...(scope.split(" ").includes("progress:report") ? { updates: "1" } : {}) });
  const code = new URL(approved.headers.get("location")!).searchParams.get("code");
  expect(code).toBeTruthy();
  const tokens = await (await post("/token", { grant_type: "authorization_code", client_id: client.client_id, code: code!, code_verifier: verifier, redirect_uri: client.redirect_uris[0], resource: base + "/mcp" })).json();
  expect(tokens.access_token).toBeTruthy();
  return { b, tokens };
}

async function started(token: string) {
  const c = new Client({ name: "Switch test", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(base + "/mcp"), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  try {
    const description = (await c.listTools()).tools.find((t) => t.name === "get_started")!.description;
    const body = JSON.parse(((await c.callTool({ name: "get_started", arguments: {} })) as { content: { text: string }[] }).content[0].text) as { first_step: string; playbooks: { id: string; title: string; title_et: string }[] };
    return { description, body };
  } finally { await c.close(); }
}

function expectSwitch(step: string, description: string, on: boolean) {
  expect(description).toBe(DESCRIPTION);
  expect(description).not.toContain(SAVED);
  expect(description).not.toContain(SWITCH);
  expect(step).toContain(SAVED);
  expect(step).toContain("Start with the owner's deadlines (get_obligations), then offer the matching playbook.");
  if (on) {
    expect(step.startsWith(SWITCH)).toBe(true);
  } else {
    expect(step.startsWith(SAVED)).toBe(true);
    expect(step).not.toContain("switch-assistant");
  }
}

test("one OAuth client: saved-facts check, no switch-assistant sentence", async () => {
  const only = await grant("Quartz assistant");
  const r = await started(only.tokens.access_token);
  expectSwitch(r.body.first_step, r.description, false);
  const playbook = r.body.playbooks.find((p) => p.id === "switch-assistant");
  expect(playbook).toMatchObject({ title: "Pick up where your other assistant stopped", title_et: "Jätka sealt, kus eelmine assistent pooleli jäi" });
});

test("two clients with different names: the second connection is told to follow switch-assistant, and a revoked grant still counts", async () => {
  const browser = new Browser();
  const first = await grant("Quartz assistant", "alpha", browser);
  const before = await started(first.tokens.access_token);
  expectSwitch(before.body.first_step, before.description, false);

  const second = await grant("Pebble assistant", "alpha", browser);
  const after = await started(second.tokens.access_token);
  expectSwitch(after.body.first_step, after.description, true);
  expect(after.description).toBe(before.description);
  expect(after.body.first_step).not.toBe(before.body.first_step);
  const blob = `${after.body.first_step}\n${after.description}`;
  expect(blob).not.toContain("Quartz assistant");
  expect(blob).not.toContain("Pebble assistant");
  expect(after.body.playbooks.some((p) => p.id === "switch-assistant" && p.title_et === "Jätka sealt, kus eelmine assistent pooleli jäi")).toBe(true);

  db.prepare("UPDATE oauth_grants SET revoked=1 WHERE client_id IN (SELECT id FROM oauth_clients WHERE json_extract(metadata,'$.client_name')=?)").run("Quartz assistant");
  const revoked = await started(second.tokens.access_token);
  expectSwitch(revoked.body.first_step, revoked.description, true);
});

test("two grants with the same client_name do not count as another assistant", async () => {
  const browser = new Browser();
  await grant("Quartz assistant", "alpha", browser);
  const again = await grant("Quartz assistant", "alpha", browser);
  const r = await started(again.tokens.access_token);
  expectSwitch(r.body.first_step, r.description, false);
});

test("a report-only OAuth connection for an owner who has another assistant gets no switch hint", async () => {
  const browser = new Browser();
  const read = await grant("Quartz assistant", "alpha", browser);
  const report = await grant("Pebble assistant", "alpha", browser, "progress:report");
  expect(report.tokens.scope).toBe("progress:report");
  const reportStarted = await started(report.tokens.access_token);
  expectSwitch(reportStarted.body.first_step, reportStarted.description, false);
  expect(reportStarted.body).not.toHaveProperty("workspace");
  expect(reportStarted.body).not.toHaveProperty("reporting_enabled");
  const readStarted = await started(read.tokens.access_token);
  expectSwitch(readStarted.body.first_step, readStarted.description, true);
});

test("a manual token never gets the switch sentence, even when other assistants are connected", async () => {
  const browser = new Browser();
  await grant("Quartz assistant", "alpha", browser);
  await grant("Pebble assistant", "alpha", browser);
  const html = await (await browser.request("/tokens", { csrf: await browser.csrf() })).text();
  const token = /<pre>(lp_[^<]+)<\/pre>/.exec(html)![1];
  const r = await started(token);
  expectSwitch(r.body.first_step, r.description, false);
});

test("a grant from an older epoch does not count as another assistant", async () => {
  await grant("Quartz assistant");
  db.prepare("UPDATE owners SET epoch=epoch+1 WHERE subject='demo-alpha'").run();
  const next = await grant("Pebble assistant");
  const rows = db.prepare("SELECT g.epoch epoch, json_extract(c.metadata,'$.client_name') name FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id JOIN owners o ON o.id=g.owner_id WHERE o.subject='demo-alpha' ORDER BY g.epoch").all() as { epoch: number; name: string }[];
  expect(rows.map((r) => r.name)).toEqual(["Quartz assistant", "Pebble assistant"]);
  expect(rows[0].epoch).toBeLessThan(rows[1].epoch);
  const r = await started(next.tokens.access_token);
  expectSwitch(r.body.first_step, r.description, false);
});
