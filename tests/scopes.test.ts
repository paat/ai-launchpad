import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";

// Real HTTP + real OAuth consent-issued grants (not mocked MCP contexts).
// Covers issue 5: get_started scope alignment with a public-only report-only
// response, read gating, write gating and the public catalogue.
let server: Server, db: ReturnType<typeof openDb>, base: string, cfg: Config;
const originalFetch = globalThis.fetch;
let external = 0;
beforeEach(async () => {
  cfg = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", allowedHosts: ["127.0.0.1"], modelMode: "test" };
  db = openDb(":memory:"); const { app } = createApp(cfg, db);
  await new Promise<void>(ok => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as {port: number}).port}`; cfg.baseUrl = base; external = 0;
  vi.stubGlobal("fetch", ((url: string | URL | Request, init?: RequestInit) => {
    if (new URL(url instanceof Request ? url.url : url).origin !== base) { external++; throw new Error("External network forbidden"); }
    return originalFetch(url, init);
  }) as typeof fetch);
});
afterEach(async () => { vi.unstubAllGlobals(); await new Promise<void>(ok => server.close(() => ok())); db.close(); expect(external).toBe(0); });

class Browser {
  cookies = new Map<string,string>();
  async request(path: string, fields?: Record<string,string>, origin = base) {
    const res = await fetch(path.startsWith("http") ? path : base+path, { method: fields ? "POST" : "GET", redirect: "manual", headers: { cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join("; "), ...(fields ? {"content-type":"application/x-www-form-urlencoded", origin} : {}) }, body: fields ? new URLSearchParams(fields) : undefined });
    for (const c of res.headers.getSetCookie()) { const [name, value] = c.split(";")[0].split("="); this.cookies.set(name,value); }
    return res;
  }
  async login(actor = "alpha") {
    const html = await (await this.request("/login")).text();
    return this.request("/auth/demo", { actor, preauth: field(html,"preauth") });
  }
  async csrf() { return field(await (await this.request("/connection")).text(), "csrf"); }
}
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1];
const post = (path: string, fields: Record<string,string>) => fetch(base+path, {method:"POST", headers:{"content-type":"application/x-www-form-urlencoded", origin:"https://assistant.example"}, body:new URLSearchParams(fields), redirect:"manual"});
async function register(extra: Record<string,unknown> = {}) {
  return fetch(base+"/register", {method:"POST", headers:{"content-type":"application/json",origin:"https://assistant.example"}, body: JSON.stringify({redirect_uris:["http://127.0.0.1:45678/callback"],client_name:"Scope test assistant",token_endpoint_auth_method:"none",...extra})});
}
// Issue one real OAuth grant through browser login + consent, then exchange.
async function grant(scopes: string, updates: boolean, actor = "alpha", browser?: Browser) {
  const client = await (await register()).json();
  const verifier = randomBytes(32).toString("base64url"), b = browser ?? new Browser();
  const params = { response_type:"code",client_id:client.client_id, redirect_uri:client.redirect_uris[0], resource:base+"/mcp", code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",state:"scope-state",scope:scopes };
  const start = await b.request("/authorize?"+new URLSearchParams(params)); expect(start.headers.get("location")).toBe("/oauth/consent");
  await b.login(actor);
  const html = await (await b.request("/oauth/consent")).text();
  // Owner-facing consent policy: plain-language permission effects, not tool internals.
  // Scope to the consent paragraph (page footer carries nav links like /playbooks).
  const policy = html.match(/<p>progress:read.*?<\/p>/s)?.[0] ?? "";
  expect(policy).toBeTruthy();
  expect(policy).toContain("progress:read");
  expect(policy).toContain("business and workspace details");
  expect(policy).toContain("saved progress and sharing state");
  expect(policy).toContain("Getting-started guidance excludes your workspace details and sharing state unless you grant read permission.");
  expect(policy).toContain("All connected assistants can search the public service catalogue");
  expect(policy).toContain("progress:report");
  expect(policy).toContain("saves concise assessments, task updates and private service nominations");
  expect(policy).toContain("saves concise assessments, task updates and private service nominations. It can also ask you to approve a specific message, invoice, payment or filing; nothing happens unless you approve that exact content.");
  expect(policy).toContain("No conversations, source documents or Google tokens are shared");
  expect(policy).toContain("never authorizes payments, filings or signatures");
  expect(policy).not.toContain("get_started");
  expect(policy).not.toContain("search_services");
  expect(policy.toLowerCase()).not.toContain("framework");
  expect(policy.toLowerCase()).not.toContain("playbooks");
  const approved = await b.request("/oauth/consent",{csrf:field(html,"csrf"),flow:field(html,"flow"),decision:"allow", ...(updates ? {updates:"1"} : {})});
  const location = new URL(approved.headers.get("location")!);
  const code = location.searchParams.get("code")!;
  expect(code).toBeTruthy();
  const tokens = await (await post("/token", {grant_type:"authorization_code",client_id:client.client_id,code,code_verifier:verifier,redirect_uri:client.redirect_uris[0],resource:base+"/mcp"})).json();
  expect(tokens.access_token).toBeTruthy();
  return { b, client, tokens };
}
async function sdk(token: string) {
  const c = new Client({name:"Scope test",version:"1"});
  await c.connect(new StreamableHTTPClientTransport(new URL(base+"/mcp"), {requestInit:{headers:{authorization:`Bearer ${token}`}}})); return c;
}
const parse = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);
const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

test("scope alignment across real OAuth grants: report-only public get_started, read gating, write gating, public catalogue", async () => {
  const report = await grant("progress:report", true);
  const read = await grant("progress:read", false);
  const combined = await grant("progress:read progress:report", true);
  expect(report.tokens.scope).toBe("progress:report");
  expect(read.tokens.scope).toBe("progress:read");
  expect(combined.tokens.scope).toBe("progress:read progress:report");
  const cReport = await sdk(report.tokens.access_token);
  const cRead = await sdk(read.tokens.access_token);
  const cCombined = await sdk(combined.tokens.access_token);
  try {
    // Tool guidance is truthful about the public catalogue and scoped get_started.
    const tools = (await cReport.listTools()).tools;
    expect(tools.find(t => t.name === "search_services")!.description).toContain("Public catalogue");
    expect(tools.find(t => t.name === "get_started")!.description).toContain("progress:read");

    // Report-only get_started: public guidance remains, no workspace identity/settings.
    const startedReport = parse(await cReport.callTool({ name: "get_started", arguments: {} }));
    expect(startedReport.framework).toBeDefined();
    expect(startedReport.playbooks.length).toBeGreaterThan(0);
    expect(startedReport.tools).toContain("get_progress");
    expect(startedReport).not.toHaveProperty("workspace");
    expect(startedReport).not.toHaveProperty("reporting_enabled");
    const rawReport = textOf(await cReport.callTool({ name: "get_started", arguments: {} }));
    expect(rawReport).not.toContain("company_ref");
    expect(rawReport).not.toContain("reporting_enabled");
    expect(rawReport).not.toContain("Mari Disain");

    // Read scopes preserve owner-specific getting-started behavior.
    const startedRead = parse(await cRead.callTool({ name: "get_started", arguments: {} }));
    expect(startedRead.workspace.company_ref).toBeTruthy();
    expect(startedRead.workspace.label).toContain("Mari Disain");
    expect(startedRead).toHaveProperty("reporting_enabled");
    const startedCombined = parse(await cCombined.callTool({ name: "get_started", arguments: {} }));
    expect(startedCombined.workspace.label).toContain("Mari Disain");

    // get_progress is denied without progress:read.
    const denied = await cReport.callTool({ name: "get_progress", arguments: {} }) as { isError?: boolean };
    expect(denied.isError).toBe(true);
    expect(parse(await cRead.callTool({ name: "get_progress", arguments: {} })).workspace.label).toContain("Mari Disain");
    const combinedState = parse(await cCombined.callTool({ name: "get_progress", arguments: {} }));
    expect(combinedState.assessment).not.toBeNull();

    // Read-only cannot write; report-only write still works when sharing permitted.
    expect(((await cRead.callTool({ name: "report_progress", arguments: { report_id: "scope-read-write", task_id: "vat-prep", expected_version: combinedState.version, observed_at: new Date().toISOString(), milestone: "started" } })) as { isError?: boolean }).isError).toBe(true);
    const receipt = parse(await cReport.callTool({ name: "report_progress", arguments: { report_id: "scope-report-write", task_id: "vat-prep", expected_version: combinedState.version, observed_at: new Date().toISOString(), milestone: "started" } }));
    expect(receipt.kind).toBe("progress_saved");
    // Report-only still cannot read after writing.
    expect(((await cReport.callTool({ name: "get_progress", arguments: {} })) as { isError?: boolean }).isError).toBe(true);
    // Combined grant reads and writes.
    const after = parse(await cCombined.callTool({ name: "get_progress", arguments: {} }));
    const combinedReceipt = parse(await cCombined.callTool({ name: "report_progress", arguments: { report_id: "scope-combined-write", task_id: "vat-prep", expected_version: after.version, observed_at: new Date().toISOString(), milestone: "started" } }));
    expect(combinedReceipt.kind).toBe("progress_saved");

    // Catalogue is accessible to all three grants and carries only public data.
    const queries = [];
    for (const c of [cReport, cRead, cCombined]) {
      const res = parse(await c.callTool({ name: "search_services", arguments: { query: "accounting", limit: 3 } }));
      expect(res.catalog_size).toBe(181);
      expect(res.results.length).toBeGreaterThan(0);
      queries.push(JSON.stringify(res.results));
      expect(JSON.stringify(res)).not.toContain("Mari Disain");
      expect(JSON.stringify(res)).not.toContain("company_ref");
    }
    expect(queries[0]).toBe(queries[1]);
    expect(queries[1]).toBe(queries[2]);
  } finally { await cReport.close(); await cRead.close(); await cCombined.close(); }
});

test("catalogue is identical across owners and revocation still kills OAuth access", async () => {
  const a = await grant("progress:read progress:report", true, "alpha");
  const betaBrowser = new Browser();
  const b = await grant("progress:read", false, "beta", betaBrowser);
  const ca = await sdk(a.tokens.access_token);
  const cb = await sdk(b.tokens.access_token);
  try {
    const pa = parse(await ca.callTool({ name: "get_progress", arguments: {} }));
    const pb = parse(await cb.callTool({ name: "get_progress", arguments: {} }));
    expect(pa.workspace.label).toContain("Mari Disain");
    expect(pb.workspace.label).toContain("Bakery");
    expect(pa.assessment).not.toEqual(pb.assessment);
    const sa = parse(await ca.callTool({ name: "search_services", arguments: { query: "invoice", limit: 5 } }));
    const sb = parse(await cb.callTool({ name: "search_services", arguments: { query: "invoice", limit: 5 } }));
    expect(JSON.stringify(sa.results)).toBe(JSON.stringify(sb.results));
    expect(JSON.stringify(sb)).not.toContain("Bakery");
    // /mcp is never anonymous.
    const anon = await fetch(base+"/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    expect(anon.status).toBe(401);
    // Owner disconnect revokes the grant: access and refresh both die.
    const id = (db.prepare("SELECT id FROM oauth_grants WHERE owner_id=(SELECT id FROM owners WHERE subject='demo-beta')").get() as { id: string }).id;
    await betaBrowser.request("/oauth/disconnect", { csrf: await betaBrowser.csrf(), grant_id: id });
    await expect(sdk(b.tokens.access_token)).rejects.toThrow();
  } finally { await ca.close(); await cb.close(); }
});

// The consent page up to (not through) the owner's decision.
async function consentPage(scopes: string) {
  const client = await (await register()).json(), b = new Browser();
  const params = { response_type:"code",client_id:client.client_id, redirect_uri:client.redirect_uris[0], resource:base+"/mcp", code_challenge:createHash("sha256").update(randomBytes(32)).digest("base64url"),code_challenge_method:"S256",state:"copy-state",scope:scopes };
  expect((await b.request("/authorize?"+new URLSearchParams(params))).headers.get("location")).toBe("/oauth/consent");
  await b.login();
  return { b, html: await (await b.request("/oauth/consent")).text() };
}
const reject = async (c: { b: Browser; html: string }) => { await c.b.request("/oauth/consent", { csrf: field(c.html, "csrf"), flow: field(c.html, "flow"), decision: "reject" }); return c.html; };
const STORED_ET = "Kui lubad töid ette valmistada, salvestame tööde seisu, assistendi hinnangu, kinnitamiseks esitatud tekstid ja anonüümseks muudetud soovid, kuni sa need kustutad. Sinu vestlusi ega faile AI-hüppelaud ei saa.";

test("consent copy is derived from the requested scopes and never claims we store only approvals (#21)", async () => {
  const both = await reject(await consentPage("progress:read progress:report"));
  expect(both).toContain("näha sinu ettevõtte tähtaegu ja tööde seisu");
  expect(both).toContain(STORED_ET);
  expect(both).toContain("Ilma selleta saab Scope test assistant ainult lugeda.");
  const read = await reject(await consentPage("progress:read"));
  expect(read).toContain("näha sinu ettevõtte tähtaegu ja tööde seisu");
  expect(read).not.toContain("salvestame");
  expect(read).toContain("Sinu vestlusi ega faile AI-hüppelaud ei saa.");
  // Report-only: no read ability is promised, and the unticked box means no connection (the handler denies it).
  const { b, html } = await consentPage("progress:report");
  expect(html).not.toContain("tähtaegu ja tööde seisu");
  expect(html).toContain("öelda, mida ta saab sinu eest ära teha");
  expect(html).toContain("Ilma linnukeseta ühendust ei looda ja Scope test assistant saab teate, et keeldusid.");
  expect(html).not.toContain("ainult lugeda");
  expect(html).toContain(STORED_ET);
  for (const page of [both, read, html]) { expect(page).not.toContain("ainult selle"); expect(page).not.toContain("only what you are asked"); }
  const unticked = await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "allow" });
  const location = new URL(unticked.headers.get("location")!);
  expect(location.searchParams.get("error")).toBe("access_denied");
  expect(location.searchParams.get("code")).toBeNull();
  expect(db.prepare("SELECT count(*) n FROM oauth_grants").get()).toEqual({ n: 0 });
});

test("consent shows no owner nav or footer, and its errors render in the shell with lang and a way back (#21)", async () => {
  const { b, html } = await consentPage("progress:read progress:report");
  expect(html).not.toContain('<nav class="main"');
  expect(html).not.toContain("Logi välja");
  expect(html).not.toContain("Abi ja lisad");
  await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "reject" });
  const again = await b.request("/oauth/consent");
  expect(again.status).toBe(400);
  const body = await again.text();
  expect(body).toContain('<html lang="et">');
  expect(body).toContain("Ühendamise taotlus on aegunud");
  expect(body).toContain('href="/uhenda"');
  const post = await b.request("/oauth/consent", { csrf: field(html, "csrf"), flow: field(html, "flow"), decision: "allow" });
  expect(post.status).toBe(400);
  expect(await post.text()).toContain('<html lang="et">');
});
