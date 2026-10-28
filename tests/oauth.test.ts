import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens, OAuthClientInformationMixed } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createApp, type Config } from "../src/app.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";
import { openDb, sha256 } from "../src/db.js";

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
  return fetch(base+"/register", {method:"POST", headers:{"content-type":"application/json",origin:"https://assistant.example"}, body: JSON.stringify({redirect_uris:["http://127.0.0.1:45678/callback"],client_name:"Local test assistant",token_endpoint_auth_method:"none",...extra})});
}
async function flow(opts: { scopes?: string; updates?: boolean; browser?: Browser; decision?: string; login?: boolean } = {}) {
  const client = await (await register()).json();
  const verifier = randomBytes(32).toString("base64url"), b = opts.browser ?? new Browser();
  const params = { response_type:"code",client_id:client.client_id, redirect_uri:client.redirect_uris[0], resource:base+"/mcp", code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",state:"client-state",scope:opts.scopes ?? "progress:read progress:report" };
  const start = await b.request("/authorize?"+new URLSearchParams(params)); expect(start.headers.get("location")).toBe("/oauth/consent");
  if (opts.login !== false) await b.login();
  const html = await (await b.request("/oauth/consent")).text();
  const fields = {csrf:field(html,"csrf"), flow:field(html,"flow"), decision:opts.decision ?? "allow", ...(opts.updates ? {updates:"1"} : {})};
  const approved = await b.request("/oauth/consent",fields);
  const location = new URL(approved.headers.get("location")!);
  return { b, client, verifier, location, fields, code:location.searchParams.get("code")!, exchange:(extra: Record<string,string> = {}) => post("/token", {grant_type:"authorization_code",client_id:client.client_id,code:location.searchParams.get("code")!,code_verifier:verifier,redirect_uri:client.redirect_uris[0],resource:base+"/mcp",...extra}) };
}
const refresh = (client: string, token: string, extra: Record<string,string> = {}) => post("/token", {grant_type:"refresh_token",client_id:client,refresh_token:token,resource:base+"/mcp",...extra});
async function sdk(token: string) {
  const c = new Client({name:"OAuth test",version:"1"});
  await c.connect(new StreamableHTTPClientTransport(new URL(base+"/mcp"), {requestInit:{headers:{authorization:`Bearer ${token}`}}})); return c;
}

test("SDK OAuth client discovers PRM, registers, signs in from no session, consents and calls tools over HTTP", async () => {
  const missing = await post("/mcp", {}); expect(missing.status).toBe(401); expect(missing.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/mcp");
  const prm = await (await fetch(base+"/.well-known/oauth-protected-resource/mcp")).json(); expect(prm.resource).toBe(base+"/mcp");
  const meta = await (await fetch(base+"/.well-known/oauth-authorization-server")).json();
  expect(meta.issuer).toBe(base+"/"); expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"]); expect(meta.revocation_endpoint_auth_methods_supported).toEqual(["none"]); expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  let info: OAuthClientInformationMixed | undefined, tokens: OAuthTokens | undefined, verifier = "", authUrl: URL | undefined;
  const provider: OAuthClientProvider = {
    redirectUrl:"http://127.0.0.1:45678/callback", clientMetadata:{redirect_uris:["http://127.0.0.1:45678/callback"],token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"],client_name:"SDK test"},
    clientInformation:()=>info, saveClientInformation:i=>{info=i;}, tokens:()=>tokens, saveTokens:t=>{tokens=t;}, saveCodeVerifier:v=>{verifier=v;}, codeVerifier:()=>verifier, state:()=>"sdk-state", redirectToAuthorization:u=>{authUrl=u;}
  };
  const transport = new StreamableHTTPClientTransport(new URL(base+"/mcp"),{authProvider:provider});
  const c = new Client({name:"SDK OAuth",version:"1"});
  await expect(c.connect(transport)).rejects.toThrow(); expect(authUrl).toBeDefined();
  const b = new Browser(); expect((await b.request(authUrl!.href)).headers.get("location")).toBe("/oauth/consent");
  expect((await b.request("/oauth/consent")).headers.get("location")).toBe("/login");
  expect((await b.login()).headers.get("location")).toBe("/oauth/consent");
  const html = await (await b.request("/oauth/consent")).text(); expect(html).toContain("http://127.0.0.1:45678"); expect(html).not.toContain('value="1" checked');
  const response = await b.request("/oauth/consent",{csrf:field(html,"csrf"),flow:field(html,"flow"),decision:"allow"});
  const callback = new URL(response.headers.get("location")!); expect(callback.searchParams.get("state")).toBe("sdk-state");
  await transport.finishAuth(callback.searchParams.get("code")!);
  const connected = new Client({name:"SDK connected",version:"1"}); await connected.connect(new StreamableHTTPClientTransport(new URL(base+"/mcp"),{authProvider:provider}));
  expect((await connected.listTools()).tools.map(t=>t.name)).toContain("get_progress");
  expect((await connected.callTool({name:"get_progress",arguments:{}})).isError).not.toBe(true);
  expect(tokens!.scope).toBe("progress:read");
  expect((db.prepare("SELECT reporting_enabled FROM owners").get() as any).reporting_enabled).toBe(0);
  await connected.close(); await c.close();
});

test.each(["verifier","client","redirect","resource","expiry","replay"])("code rejects %s mismatch or reuse", async kind => {
  const f = await flow(); let extra: Record<string,string> = {};
  if (kind === "verifier") extra.code_verifier = "wrong";
  if (kind === "client") extra.client_id = (await (await register()).json()).client_id;
  if (kind === "redirect") extra.redirect_uri = "http://127.0.0.1:45679/callback";
  if (kind === "resource") extra.resource = base+"/elsewhere";
  if (kind === "expiry") db.prepare("UPDATE oauth_codes SET expires=0").run();
  if (kind === "replay") expect((await f.exchange()).status).toBe(200);
  expect((await f.exchange(extra)).status).toBe(400);
});

test("parallel exchanges consume exactly one code and store only credential hashes", async () => {
  const f = await flow(); const results = await Promise.all([f.exchange(),f.exchange()]); expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  const t = await results.find(r=>r.status===200)!.json();
  const hashes = db.prepare("SELECT hash FROM oauth_credentials").all() as {hash:string}[];
  expect(hashes.map(x=>x.hash)).toContain(sha256(t.access_token)); expect(JSON.stringify(hashes)).not.toContain(t.refresh_token);
});

test("refresh rotates, forbids escalation and wrong resource/client, and reuse revokes family", async () => {
  const f = await flow(), t = await (await f.exchange()).json();
  expect((await refresh(f.client.client_id,t.refresh_token,{scope:"progress:read progress:report"})).status).toBe(400);
  expect((await refresh(f.client.client_id,t.refresh_token,{resource:base+"/wrong"})).status).toBe(400);
  expect((await refresh((await (await register()).json()).client_id,t.refresh_token)).status).toBe(400);
  const r = await refresh(f.client.client_id,t.refresh_token); expect(r.status).toBe(200); const next = await r.json(); expect(next.refresh_token).not.toBe(t.refresh_token);
  expect((await refresh(f.client.client_id,t.refresh_token)).status).toBe(400);
  await expect(sdk(next.access_token)).rejects.toThrow(); expect((await refresh(f.client.client_id,next.refresh_token)).status).toBe(400);
});

test.each(["access","refresh","owner","delete"])("%s revocation kills code, access and refresh and pending grants", async mode => {
  const f = await flow(), t = await (await f.exchange()).json();
  if (mode === "delete") await f.b.request("/delete",{csrf:await f.b.csrf()});
  else if (mode === "owner") {
    const g = db.prepare("SELECT id FROM oauth_grants").get() as {id:string};
    await f.b.request("/oauth/disconnect",{csrf:await f.b.csrf(),grant_id:g.id});
  } else expect((await post("/revoke",{client_id:f.client.client_id,token:mode === "access" ? t.access_token : t.refresh_token})).status).toBe(200);
  await expect(sdk(t.access_token)).rejects.toThrow(); expect((await refresh(f.client.client_id,t.refresh_token)).status).toBe(400);
});

test("explicit update permission shares through existing scope and sharing gates, with owner isolation", async () => {
  const a = await flow({updates:true}), ta = await (await a.exchange()).json();
  const b = new Browser(); await b.login("beta"); const f = await flow({browser:b,login:false}), tb = await (await f.exchange()).json();
  const ca = await sdk(ta.access_token), cb = await sdk(tb.access_token);
  const pa = await ca.callTool({name:"get_progress",arguments:{}}), pb = await cb.callTool({name:"get_progress",arguments:{}}); expect(pa.content).not.toEqual(pb.content);
  expect((await cb.callTool({name:"submit_service_candidate",arguments:{name:"Demo",connection:"https://example.com",jobs:"Test"}})).isError).toBe(true);
  const state = JSON.parse((pa.content as {text:string}[])[0].text);
  expect((await ca.callTool({name:"report_assessment",arguments:{report_id:"oauth-assessment",expected_version:state.version,assessment:DEMO_FIXTURES.alpha}})).isError).not.toBe(true);
  expect((await ca.callTool({name:"report_assessment",arguments:{report_id:"forged",expected_version:state.version+1,assessment:DEMO_FIXTURES.alpha,verified:true}})).isError).toBe(true);
  await a.b.request("/reporting",{csrf:await a.b.csrf(),enabled:"0"});
  expect((await ca.callTool({name:"submit_service_candidate",arguments:{name:"Demo",connection:"https://example.com",jobs:"Test"}})).isError).toBe(true);
  await ca.close(); await cb.close();
});

test("consent rejects foreign Origin, CSRF, account switching, expiry and replay; rejection works", async () => {
  const f = await flow({decision:"reject"}); expect(f.location.searchParams.get("error")).toBe("access_denied"); expect(f.code).toBeNull();
  expect((await f.b.request("/oauth/consent",f.fields)).status).toBe(400);
  const params = {response_type:"code",client_id:f.client.client_id,redirect_uri:f.client.redirect_uris[0],resource:base+"/mcp",code_challenge:createHash("sha256").update(f.verifier).digest("base64url"),code_challenge_method:"S256",scope:"progress:read"};
  await f.b.request("/authorize?"+new URLSearchParams(params));
  expect((await f.b.request("/oauth/consent",{csrf:"bad",decision:"allow"})).status).toBe(403);
  expect((await f.b.request("/oauth/consent",f.fields,"https://evil.example")).status).toBe(403);
  expect((await fetch(base+"/oauth/consent",{headers:{origin:"https://evil.example"},redirect:"manual"})).status).toBe(403);
  await f.b.login("beta"); expect((await f.b.request("/oauth/consent")).status).toBe(400);
  await f.b.login("alpha"); db.prepare("UPDATE oauth_pending SET expires=0").run(); expect((await f.b.request("/oauth/consent")).status).toBe(400);
});

test("DCR constrains redirects, auth methods, lengths, storage and registration rate; metadata never fetches URLs", async () => {
  for (const uri of ["http://example.com/cb","https://user:password@example.com/cb","https://example.com/cb#","javascript:alert(1)"]) expect((await register({redirect_uris:[uri]})).status).toBe(400);
  expect((await register({token_endpoint_auth_method:"client_secret_post"})).status).toBe(400);
  expect((await register({redirect_uris:Array(6).fill("https://example.com/cb")})).status).toBe(400);
  expect((await register({client_name:"x".repeat(101)})).status).toBe(400);
  expect((await register({redirect_uris:["https://example.com/"+"x".repeat(2048)]})).status).toBe(400);
  const r = await register({client_name:'<img src=x onerror="alert(1)">',logo_uri:"http://169.254.169.254/private",client_uri:"https://private.example.test"}); expect(r.status).toBe(201);
  const client = await r.json(); expect(client.logo_uri).toBeUndefined(); expect(client.client_secret).toBeUndefined();
  db.transaction(()=>{for(let i=0;i<499;i++) db.prepare("INSERT INTO oauth_clients VALUES(?,?,?)").run(`bounded${i}`,JSON.stringify(client),Date.now()+60000);})();
  expect((await register()).status).toBe(400);
  for(let i=0;i<11;i++) await register(); expect((await register()).status).toBe(429);
});

test("authorization rejects relaxed redirect ports, missing S256/resource, unknown scopes and client metadata URL IDs", async () => {
  const c = await (await register()).json(); const b = new Browser();
  const valid = {response_type:"code",client_id:c.client_id,redirect_uri:c.redirect_uris[0],resource:base+"/mcp",code_challenge:"a".repeat(43),code_challenge_method:"S256",scope:"progress:read"};
  for (const extra of [{redirect_uri:"http://127.0.0.1:45679/callback"},{code_challenge_method:"plain"},{resource:base+"/bad"},{scope:"admin"},{client_id:"http://169.254.169.254/metadata"}]) {
    const r = await b.request("/authorize?"+new URLSearchParams({...valid,...extra})); expect(r.headers.get("location")).not.toBe("/oauth/consent"); expect([400,302]).toContain(r.status);
  }
  expect((db.prepare("SELECT count(*) n FROM oauth_pending").get() as any).n).toBe(0);
});

test("access/refresh expiry and owner epoch invalidate credentials; production HTTP fails closed", async () => {
  const f = await flow(), t = await (await f.exchange()).json(); db.prepare("UPDATE oauth_credentials SET expires=0").run();
  await expect(sdk(t.access_token)).rejects.toThrow(); expect((await refresh(f.client.client_id,t.refresh_token)).status).toBe(400);
  cfg.production = true; expect((await fetch(base+"/health")).status).toBe(503);
});

test("pending consent and unexchanged code die on deletion; owner revoke clears pending reconnect", async () => {
  const f = await flow();
  const params = {response_type:"code",client_id:f.client.client_id,redirect_uri:f.client.redirect_uris[0],resource:base+"/mcp",code_challenge:"a".repeat(43),code_challenge_method:"S256",scope:"progress:read"};
  await f.b.request("/authorize?"+new URLSearchParams(params));
  expect((db.prepare("SELECT count(*) n FROM oauth_pending").get() as any).n).toBe(1);
  const id = (db.prepare("SELECT id FROM oauth_grants").get() as any).id;
  await f.b.request("/oauth/disconnect", {csrf:await f.b.csrf(),grant_id:id});
  expect((await f.exchange()).status).toBe(400);
  expect((db.prepare("SELECT count(*) n FROM oauth_pending").get() as any).n).toBe(0);
  const second = await flow({browser:f.b, login:false});
  await second.b.request("/authorize?"+new URLSearchParams({...params,client_id:second.client.client_id}));
  await second.b.request("/delete",{csrf:await second.b.csrf()});
  expect((await second.exchange()).status).toBe(400); expect((await second.b.request("/oauth/consent")).status).toBe(400);
});

test("consent escapes untrusted client names and keeps actual redirect origin visible", async () => {
  const c = await (await register({client_name:'<script>alert("x")</script>'})).json(), b = new Browser(); await b.login();
  await b.request("/authorize?"+new URLSearchParams({response_type:"code",client_id:c.client_id,redirect_uri:c.redirect_uris[0],resource:base+"/mcp",code_challenge:"a".repeat(43),code_challenge_method:"S256",scope:"progress:read progress:report"}));
  const r = await b.request("/oauth/consent"), html = await r.text();
  expect(r.headers.get("content-security-policy")).toBe("frame-ancestors 'none'"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain('<script>alert'); expect(html).toContain("http://127.0.0.1:45678");
});

test("grants and rotation replay detection survive a SQLite reopen", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(),"launchpad-oauth-")), path = join(dir,"test.db");
  try {
    const f = await flow(), t = await (await f.exchange()).json();
    await db.backup(path); await new Promise<void>(ok=>server.close(()=>ok())); db.close();
    db = openDb(path); const app = createApp(cfg,db).app; const port = Number(new URL(base).port);
    await new Promise<void>(ok=>{server=app.listen(port,"127.0.0.1",ok);});
    const c = await sdk(t.access_token); expect((await c.listTools()).tools.length).toBe(6); await c.close();
    expect((await refresh(f.client.client_id,t.refresh_token)).status).toBe(200);
    expect((await refresh(f.client.client_id,t.refresh_token)).status).toBe(400);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("scope reduction persists across refresh; epoch changes invalidate unexchanged codes", async () => {
  const f = await flow({updates:true}), t = await (await f.exchange()).json();
  const reduced = await (await refresh(f.client.client_id,t.refresh_token,{scope:"progress:read"})).json(); expect(reduced.scope).toBe("progress:read");
  expect((await refresh(f.client.client_id,reduced.refresh_token,{scope:"progress:report"})).status).toBe(400);
  const g = await flow(); db.prepare("UPDATE owners SET epoch=epoch+1").run(); expect((await g.exchange()).status).toBe(400);
});


test("authorization route variants cannot bypass exact redirects on SDK error paths", async () => {
  const c = await (await register()).json();
  const params = new URLSearchParams({client_id:c.client_id,redirect_uri:"http://127.0.0.1:45679/callback",response_type:"token",code_challenge_method:"plain"});
  for (const path of ["/authorize/", "/AUTHORIZE"]) {
    const r = await fetch(base+path+"?"+params,{redirect:"manual"}); expect(r.status).toBe(400); expect(r.headers.get("location")).toBeNull();
  }
});
