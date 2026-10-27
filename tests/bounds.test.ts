import { test, expect } from "vitest";
import { request } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";

test("canonical Host rejects aliases, port changes and forwarded-host tricks", async () => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["localhost", "127.0.0.1"] };
  const { app, db } = createApp(cfg);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(ok => server.once("listening", ok));
  const port = (server.address() as { port: number }).port;
  cfg.baseUrl = `http://127.0.0.1:${port}`;
  try {
    for (const host of [`localhost:${port}`, "127.0.0.1:1", "evil.invalid"]) {
      const status = await new Promise<number>((ok, reject) => {
        const req = request(`${cfg.baseUrl}/health`, { headers: { host, "x-forwarded-host": `127.0.0.1:${port}`, "x-forwarded-proto": "https" } }, res => { res.resume(); ok(res.statusCode!); });
        req.on("error", reject); req.end();
      });
      expect(status).toBe(421);
    }
    expect((await fetch(`${cfg.baseUrl}/health`)).status).toBe(200);
  } finally { await new Promise<void>(ok => server.close(() => ok())); db.close(); }
});

test("report bounds reject new writes but preserve exact replays and owner version", async () => {
  const cfg: Config = { demo: true, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db } = createApp(cfg, openDb(":memory:"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(ok => server.once("listening", ok));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "bounds", version: "1" });
  try {
    const login = await fetch(`${cfg.baseUrl}/login`);
    const preauth = /name="preauth" value="([^"]+)"/.exec(await login.text())![1];
    const signed = await fetch(`${cfg.baseUrl}/auth/demo`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: cfg.baseUrl, cookie: login.headers.get("set-cookie")!.split(";")[0] }, body: new URLSearchParams({ actor: "alpha", preauth }) });
    const cookie = signed.headers.get("set-cookie")!.split(";")[0];
    const html = await (await fetch(`${cfg.baseUrl}/connection`, { headers: { cookie } })).text();
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1];
    const post = (path: string, fields: Record<string, string>) => fetch(`${cfg.baseUrl}${path}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: cfg.baseUrl, cookie }, body: new URLSearchParams({ csrf, ...fields }) });
    await post("/reporting", { enabled: "1" });
    const token = /<pre>(lp_[^<]+)<\/pre>/.exec(await (await post("/tokens", {})).text())![1];
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
    const args = { report_id: "first", task_id: "invoice", expected_version: 1, observed_at: new Date().toISOString(), milestone: "started" };
    const first = await client.callTool({ name: "report_progress", arguments: args });
    expect(first.isError).not.toBe(true);
    for (let i = 1; i < 60; i++) expect((await client.callTool({ name: "report_progress", arguments: { ...args, report_id: `report-${i}`, expected_version: i + 1 } })).isError).not.toBe(true);
    const blocked = () => client.callTool({ name: "report_progress", arguments: { ...args, report_id: "over-limit", expected_version: 61 } });
    expect(JSON.stringify(await blocked())).toContain("rate limit");
    expect(await client.callTool({ name: "report_progress", arguments: args })).toEqual(first);
    expect(db.prepare("SELECT version FROM workspaces").get()).toEqual({ version: 61 });
    // Represent 440 older persisted receipts, without spending time on timers.
    const owner = (db.prepare("SELECT id FROM owners").get() as { id: string }).id;
    db.prepare("UPDATE reports SET created_at='2020-01-01T00:00:00.000Z'").run();
    const insert = db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,payload_json,receipt_json,created_at) VALUES(?,?,'progress','synthetic','{}','{}','2020-01-01T00:00:00.000Z')");
    db.transaction(() => { for (let i = 60; i < 500; i++) insert.run(owner, `old-${i}`); })();
    expect(JSON.stringify(await blocked())).toContain("storage limit");
    expect((await client.callTool({ name: "report_assessment", arguments: { report_id: "also-over", expected_version: 61, assessment: DEMO_FIXTURES.alpha } })).isError).toBe(true);
    expect(await client.callTool({ name: "report_progress", arguments: args })).toEqual(first);
    expect(db.prepare("SELECT count(*) n FROM reports").get()).toEqual({ n: 500 });
    expect(db.prepare("SELECT version FROM workspaces").get()).toEqual({ version: 61 });
  } finally { await client.close(); await new Promise<void>(ok => server.close(() => ok())); db.close(); }
});
