import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, configFromEnv, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";
import { computeCoverage, assessmentSchema } from "../src/core.js";
import { loadCatalog, searchServices, safeHttps } from "../src/catalog.js";
import { runModelJob, BasetenProvider, TestProvider } from "../src/model.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";

let server: Server; let base = "";
const cfg: Config = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://localhost:3000", modelMode: "test", allowedHosts: ["localhost", "127.0.0.1"] };
const { app, db } = createApp(cfg, openDb(":memory:"));

/** Real form-login analogue: fetch /login, keep the browser-bound preauth
 * cookie + one-time token, submit with the exact same origin a browser sends. */
async function login(actor: string) {
  const page = await fetch(`${base}/login`);
  const preCookie = (page.headers.get("set-cookie") ?? "").split(";")[0];
  const html = await page.text();
  const preauth = /name="preauth" value="([^"]+)"/.exec(html)![1];
  const r = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: preCookie, origin: base }, body: `actor=${actor}&preauth=${preauth}`, redirect: "manual" });
  if (r.status !== 302) throw new Error(`demo login failed: ${r.status} ${await r.text()}`);
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function csrf(cookie: string) {
  const html = await (await fetch(`${base}/connection`, { headers: { cookie } })).text();
  return /name="csrf" value="([^"]+)"/.exec(html)![1];
}
async function grantSharing(cookie: string) {
  const r = await fetch(`${base}/reporting`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}&enabled=1`, redirect: "manual" });
  expect(r.status).toBe(302);
}
async function issueToken(cookie: string) {
  const r = await fetch(`${base}/tokens`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}`, redirect: "manual" });
  expect(r.status).toBe(200);
  expect(r.headers.get("location")).toBeNull(); // raw token must never travel in a URL
  const m = /<pre>(lp_[^<]+)<\/pre>/.exec(await r.text());
  if (!m) throw new Error("token not shown once in POST response");
  return m[1];
}
async function mcpClient(token: string) {
  const c = new Client({ name: "test", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  return c;
}
const parse = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);
const handled = { executor: "Assistant via existing invoicing connection", access: "Owner-granted invoicing access already works", success_criterion: "Monthly invoices drafted without owner typing", next_checkpoint: "Next monthly billing run" };
const fullAssessment = {
  assessed_domains: ["money", "customers", "people", "legal_sector", "operations"],
  responsibilities: [
    { id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", ...handled, reason: "Recurring monthly billing seen in assistant context.", evidence_refs: ["assistant-context:oct"] },
    { id: "plumbing-work", domain: "operations", label: "Doing plumbing jobs", applicability: "applicable", is_core: true, arrangement: "none", reason: "This is the owner's trade.", evidence_refs: [] },
  ],
  gaps: [], conclusion: "Admin is partly arranged; invoicing is the leverage point.",
  next_action: { title: "Connect invoicing to your assistant", rationale: "Removes repeated monthly invoice chasing.", estimated_effort_saved: "maybe 1-2 h/month", savings_basis: "estimate", uncertainty: "Estimate only; volumes unmeasured.", needs_owner: true },
};

beforeAll(async () => { await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base; });
afterAll(() => server.close());

test("catalog has 181 records; search preserves connection guidance and safe primary sources", () => {
  expect(loadCatalog()).toHaveLength(181);
  const r = searchServices("invoice", 5);
  expect(r.length).toBeGreaterThan(0); expect(r.length).toBeLessThanOrEqual(5);
  expect(r.every((x) => x.runtime_verified === false)).toBe(true);
  expect(r.some((x) => x.sources.length > 0)).toBe(true);
  expect(r.every((x) => x.sources.every((s) => safeHttps(s) === s))).toBe(true);
  expect(r.some((x) => x.connection.length > 0)).toBe(true);
  expect(safeHttps("http://example.com")).toBeNull();
  expect(safeHttps("https://user:pass@example.com")).toBeNull();
});
test("agent-assessed coverage: unknowns, gaps, missing fields and missing domains block the percentage; verified stays 0", () => {
  const full = assessmentSchema.parse(fullAssessment);
  const c = computeCoverage(full);
  expect(c.covered).toBe(1); expect(c.percent).toBe(100);
  expect(c.independently_verified_outcomes).toBe(0);
  expect(c.label).not.toContain("confirmed"); expect(c.label).not.toContain("AI");
  // A handled claim without executor/access/success/checkpoint does not count.
  const thin = assessmentSchema.parse({ ...fullAssessment, responsibilities: [{ id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", reason: "trust me", evidence_refs: [] }] });
  expect(computeCoverage(thin).covered).toBe(0);
  expect(computeCoverage(thin).claimed_but_incomplete).toBe(1);
  // Unresolved (even core), gaps, unassessed domains and empty inventory suppress %.
  const withUnresolvedCore = assessmentSchema.parse({ ...fullAssessment, responsibilities: [...fullAssessment.responsibilities, { id: "mystery", domain: "people", label: "?", applicability: "unresolved", is_core: true, arrangement: "none", reason: "unknown", evidence_refs: [] }] });
  expect(computeCoverage(withUnresolvedCore).percent).toBeNull();
  expect(computeCoverage(withUnresolvedCore).unresolved).toBe(1);
  expect(computeCoverage(assessmentSchema.parse({ ...fullAssessment, gaps: ["An urgent filing is unassessed."] })).percent).toBeNull();
  expect(computeCoverage(assessmentSchema.parse({ ...fullAssessment, assessed_domains: ["money"] })).percent).toBeNull();
  expect(computeCoverage(assessmentSchema.parse({ ...fullAssessment, responsibilities: [] })).assessment_complete).toBe(false);
  expect(computeCoverage(null).percent).toBeNull();
});
test("schema rejects duplicates, self-promoted verified fields and URL evidence", () => {
  expect(() => assessmentSchema.parse({ ...fullAssessment, verified: true })).toThrow();
  expect(() => assessmentSchema.parse({ ...fullAssessment, responsibilities: [...fullAssessment.responsibilities, fullAssessment.responsibilities[0]] })).toThrow(/Duplicate/);
  expect(() => assessmentSchema.parse({ ...fullAssessment, responsibilities: [{ ...fullAssessment.responsibilities[0], arrangement: "confirmed" }] })).toThrow();
  expect(() => assessmentSchema.parse({ ...fullAssessment, responsibilities: [{ ...fullAssessment.responsibilities[0], evidence_refs: ["https://evil.example/x"] }] })).toThrow();
});
test("two synthetic fixtures validate, differ in next action and unknowns, and never claim a percentage", () => {
  expect(DEMO_FIXTURES.alpha.next_action.title).not.toBe(DEMO_FIXTURES.beta.next_action.title);
  for (const f of Object.values(DEMO_FIXTURES)) {
    expect(() => assessmentSchema.parse(f)).not.toThrow();
    const c = computeCoverage(f);
    expect(c.percent).toBeNull();
    expect(c.independently_verified_outcomes).toBe(0);
  }
});
test("live inference is hard-disabled even with a positive budget; the isolated adapter contract works with fake fetch only", async () => {
  let calls = 0;
  const fakeFetch = (async () => { calls++; return Response.json({ choices: [{ message: { content: "fake" } }] }); }) as unknown as typeof fetch;
  await expect(runModelJob({ mode: "baseten", job: "setup_guidance", input: "hi", provider: new BasetenProvider(fakeFetch) })).rejects.toThrow(/disabled/);
  await expect(runModelJob({ mode: "test", job: "setup_guidance", input: "hi", provider: new BasetenProvider(fakeFetch) })).rejects.toThrow(/disabled/);
  expect(calls).toBe(0);
  process.env.BASETEN_API_KEY = "synthetic-placeholder-for-contract-test";
  const direct = await new BasetenProvider(fakeFetch).run("setup_guidance", "hi");
  expect(calls).toBe(1); expect(direct.mock).toBe(false);
  delete process.env.BASETEN_API_KEY;
  const fixture = await new TestProvider().run("setup_guidance", "adding a connector to my assistant");
  expect(fixture.mock).toBe(true);
  expect(fixture.output).toContain("Connection page");
  expect(fixture.output).toContain("get_started");
});

describe("HTTP security basics", () => {
  test("unauthenticated companion redirects; production config denies demo; unconfigured Google is an honest 503 without a stack", async () => {
    // Visitors without a session get the public landing (no owner data); companion pages still redirect.
    const landing = await fetch(`${base}/`, { redirect: "manual" });
    expect(landing.status).toBe(200);
    const landingHtml = await landing.text();
    expect(landingHtml).toContain("Tegele sellega, milles oled hea.");
    expect(landingHtml).not.toContain('action="/auth/logout"');
    for (const path of ["/activity", "/approvals", "/connection"]) {
      const r = await fetch(`${base}${path}`, { redirect: "manual" });
      expect(r.status).toBe(302); expect(r.headers.get("location")).toBe("/login");
    }
    expect(configFromEnv({ NODE_ENV: "production", LAUNCHPAD_DEMO: "1", LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS: "synthetic-subject" } as NodeJS.ProcessEnv).demo).toBe(false);
    const g = await fetch(`${base}/auth/login/google`);
    expect(g.status).toBe(503); expect(await g.text()).not.toContain(" at ");
    const { request } = await import("node:http");
    const hostStatus = await new Promise<number>((resolve) => { const rq = request(`${base}/`, { headers: { host: "evil.example" } }, (rs) => resolve(rs.statusCode ?? 0)); rq.end(); });
    expect(hostStatus).toBe(421);
  });
  test("malformed cookie and Unicode CSRF are safe 4xx/redirects, never 500 stacks", async () => {
    const bad = await fetch(`${base}/`, { headers: { cookie: "lp_session=%" }, redirect: "manual" });
    expect(bad.status).toBeLessThan(500); expect(await bad.text()).not.toContain("URIError");
    const cookie = await login("alpha");
    const uni = await fetch(`${base}/tokens`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${encodeURIComponent("é".repeat(32))}` });
    expect(uni.status).toBe(403); expect(await uni.text()).not.toContain("RangeError");
  });
  test("exact origin: other ports/protocols and 'null' cannot post forms; wrong CSRF is 403", async () => {
    const cookie = await login("alpha");
    for (const origin of ["http://127.0.0.1:1", base.replace("http:", "https:"), "null"]) {
      const r = await fetch(`${base}/tokens`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin }, body: `csrf=${await csrf(cookie)}`, redirect: "manual" });
      expect(r.status).toBe(403);
    }
    expect((await fetch(`${base}/tokens`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: "csrf=wrong" })).status).toBe(403);
    // The real-browser blocker: pages must not use no-referrer.
    const pageRes = await fetch(`${base}/login`);
    expect(pageRes.headers.get("referrer-policy")).toBe("same-origin");
  });
  test("demo login requires the browser-bound one-time preauth token", async () => {
    const direct = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: "actor=beta", redirect: "manual" });
    expect(direct.status).toBe(403); expect(direct.headers.get("set-cookie")).toBeNull();
    const page = await fetch(`${base}/login`);
    const preCookie = (page.headers.get("set-cookie") ?? "").split(";")[0];
    const preauth = /name="preauth" value="([^"]+)"/.exec(await page.text())![1];
    const noCookie = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base }, body: `actor=beta&preauth=${preauth}`, redirect: "manual" });
    expect(noCookie.status).toBe(403);
    const okRes = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: preCookie, origin: base }, body: `actor=beta&preauth=${preauth}`, redirect: "manual" });
    expect(okRes.status).toBe(302);
    const replay = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: preCookie, origin: base }, body: `actor=beta&preauth=${preauth}`, redirect: "manual" });
    expect(replay.status).toBe(403);
  });
  test("no /confirm ratification route exists any more", async () => {
    const cookie = await login("alpha");
    const r = await fetch(`${base}/confirm`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}&responsibility_id=invoicing` });
    expect(r.status).toBe(404);
  });
});

describe("MCP integration (two unrelated synthetic businesses)", () => {
  test("MCP rejects no token, Google-like token, and revoked token", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    const opts = (h: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...h }, body });
    expect((await fetch(`${base}/mcp`, opts({}))).status).toBe(401);
    expect((await fetch(`${base}/mcp`, opts({ authorization: "Bearer [REDACTED]" }))).status).toBe(401);
    const cookie = await login("beta"); const token = await issueToken(cookie);
    const html = await (await fetch(`${base}/connection`, { headers: { cookie } })).text();
    const tid = /name="token_id" value="([^"]+)"/.exec(html)![1];
    await fetch(`${base}/tokens/revoke`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}&token_id=${tid}` });
    expect((await fetch(`${base}/mcp`, opts({ authorization: `Bearer ${token}` }))).status).toBe(401);
  });
  test("demo company beta is one coherent company: the hero and the deadlines name the same Kase Konsult OÜ (#21, QA D-24)", async () => {
    const html = await (await fetch(`${base}/`, { headers: { cookie: await login("beta") } })).text();
    const hero = /<p class="company">([^<]+)<\/p>/.exec(html)![1];
    const deadlines = /<section class="section" id="tulekul"[\s\S]*?<span class="small muted">([^<]+) · 19990002<\/span>/.exec(html)![1];
    expect(hero).toBe("Kase Konsult OÜ (näidis)");
    expect(hero.replace(" (näidis)", "")).toBe(deadlines);
    expect(html).not.toMatch(/Bakery|synthetic fixture/i);
    const loginPage = await (await fetch(`${base}/login`)).text();
    expect(loginPage).toContain("Ava Kase Konsult OÜ (näidis)");
    expect(loginPage).not.toContain("(synthetic)");
  });
  test("sharing is off by default and the stop covers assessments, progress AND nominations", async () => {
    const cookie = await login("beta");
    // default-off even before any explicit stop
    const raw = await issueToken(cookie);
    const c = await mcpClient(raw);
    const before = parse(await c.callTool({ name: "get_progress", arguments: {} }));
    const v = before.version as number;
    expect(((await c.callTool({ name: "report_progress", arguments: { report_id: "off1", task_id: "payroll", expected_version: v, observed_at: new Date().toISOString(), milestone: "started" } })) as { isError?: boolean }).isError).toBe(true);
    await grantSharing(cookie);
    const granted = await mcpClient(await issueToken(cookie));
    expect(((await granted.callTool({ name: "report_progress", arguments: { report_id: "on1", task_id: "payroll", expected_version: v, observed_at: new Date().toISOString(), milestone: "started" } })) as { isError?: boolean }).isError).toBeUndefined();
    await fetch(`${base}/reporting`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}&enabled=0` });
    const stopped = await mcpClient(await issueToken(cookie));
    const sv = (parse(await stopped.callTool({ name: "get_progress", arguments: {} })).version) as number;
    const writes = [
      await stopped.callTool({ name: "report_assessment", arguments: { report_id: "off2", expected_version: sv, assessment: fullAssessment } }),
      await stopped.callTool({ name: "report_progress", arguments: { report_id: "off3", task_id: "payroll", expected_version: sv, observed_at: new Date().toISOString(), milestone: "started" } }),
      await stopped.callTool({ name: "submit_service_candidate", arguments: { name: "Stopped Service", connection: "https://example.invalid/mcp", jobs: "job" } }),
    ] as { isError?: boolean }[];
    expect(writes.map((w) => !!w.isError)).toEqual([true, true, true]);
    const ownerId = (db.prepare("SELECT id FROM owners WHERE subject='demo-beta'").get() as { id: string }).id;
    expect((db.prepare("SELECT count(*) n FROM candidates WHERE owner_id=? AND name='Stopped Service'").get(ownerId) as { n: number }).n).toBe(0);
    await c.close(); await granted.close(); await stopped.close();
    await grantSharing(cookie); // restore for later tests
  });
  test("full flow: seeded fixtures, idempotency, conflict, stale, isolation, diff/exclusions, strict fields, per-owner candidates", async () => {
    const cookieA = await login("alpha"); await grantSharing(cookieA);
    const cookieB = await login("beta"); await grantSharing(cookieB);
    const cA = await mcpClient(await issueToken(cookieA));
    const cB = await mcpClient(await issueToken(cookieB));
    expect((await cA.listTools()).tools.map((t) => t.name).sort()).toEqual(["get_approval", "get_obligations", "get_progress", "get_started", "record_action_outcome", "report_assessment", "report_progress", "report_unmet_need", "request_approval", "search_services", "submit_service_candidate"]);
    // Each demo workspace was seeded only after explicit demo login, with a different next action.
    const a0 = parse(await cA.callTool({ name: "get_progress", arguments: {} }));
    const b0 = parse(await cB.callTool({ name: "get_progress", arguments: {} }));
    expect(a0.assessment).not.toBeNull(); expect(b0.assessment).not.toBeNull();
    expect(a0.coverage.next_action).not.toBe(b0.coverage.next_action);
    expect(b0.workspace.label).toContain("Kase Konsult");
    const revised = { ...fullAssessment, responsibilities: [...fullAssessment.responsibilities, ...DEMO_FIXTURES.alpha.responsibilities.filter(r => !fullAssessment.responsibilities.some(x => x.id === r.id)).map(r => ({ ...r, applicability: "not_applicable", reason: "Synthetic revised scope: this business has no VAT registration or employees." }))] };
    const args = { report_id: "r1", expected_version: a0.version, assessment: revised };
    const r1 = parse(await cA.callTool({ name: "report_assessment", arguments: args }));
    expect(r1.kind).toBe("assessment_saved");
    expect(r1.coverage.agent_assessed_covered).toBe(1);
    expect(r1.coverage.independently_verified_outcomes).toBe(0);
    expect(r1.diff).toBeDefined();
    expect(parse(await cA.callTool({ name: "report_assessment", arguments: args })).receipt_id).toBe(r1.receipt_id);
    expect(((await cA.callTool({ name: "report_assessment", arguments: { ...args, assessment: { ...fullAssessment, conclusion: "changed" } } })) as { isError?: boolean }).isError).toBe(true);
    expect(((await cA.callTool({ name: "report_progress", arguments: { report_id: "p0", task_id: "invoicing", expected_version: 999, observed_at: new Date().toISOString(), milestone: "started" } })) as { isError?: boolean }).isError).toBe(true);
    const observed = "2026-01-03T04:05:06.000Z";
    const prog = parse(await cA.callTool({ name: "report_progress", arguments: { report_id: "p1", task_id: "invoicing", expected_version: r1.version, observed_at: observed, milestone: "external_completion_reported", evidence_refs: ["synthetic-object:unique-xyz"] } }));
    expect(prog.evidence_label).toBe("assistant_reported");
    expect(prog.observed_at).toBe(observed);
    expect(prog.evidence_refs).toEqual(["synthetic-object:unique-xyz"]);
    // Unexpected top-level claims are rejected, not silently dropped.
    const forged = await cA.callTool({ name: "report_progress", arguments: { report_id: "forged", task_id: "invoicing", expected_version: prog.version, observed_at: new Date().toISOString(), milestone: "started", verified: true, paid: true, owner_approved: true } }) as { isError?: boolean };
    expect(forged.isError).toBe(true);
    // Omission rejects the whole revision; a reasoned reclassification is visible.
    const cur = parse(await cA.callTool({ name: "get_progress", arguments: {} }));
    const trimmed = { ...revised, responsibilities: revised.responsibilities.filter(r => r.id !== "invoicing") };
    expect((await cA.callTool({ name: "report_assessment", arguments: { report_id: "omitted", expected_version: cur.version, assessment: trimmed } })).isError).toBe(true);
    const reclassified = { ...revised, responsibilities: revised.responsibilities.map(r => r.id === "invoicing" ? { ...r, applicability: "not_applicable", reason: "Synthetic business stopped selling services and has no invoices to issue." } : r) };
    const r2 = parse(await cA.callTool({ name: "report_assessment", arguments: { report_id: "r2", expected_version: cur.version, assessment: reclassified } }));
    expect(r2.diff.scope_changes[0].before.applicability).toBe("applicable");
    expect(r2.diff.scope_changes[0].after.reason).toContain("stopped selling");
    const after = parse(await cA.callTool({ name: "get_progress", arguments: {} }));
    expect(after.assessment.responsibilities.find((r: { id: string }) => r.id === "invoicing").applicability).toBe("not_applicable");
    const search = parse(await cA.callTool({ name: "search_services", arguments: { query: "accounting", limit: 3 } }));
    expect(search.catalog_size).toBe(181);
    expect(search.results.some((x: { sources: string[] }) => x.sources.length > 0)).toBe(true);
    // Candidates are private per owner: no shared IDs, no existence oracle.
    const cand = { name: "Demo New Service", connection: "https://example.invalid/mcp", jobs: "demo job" };
    const ca1 = parse(await cA.callTool({ name: "submit_service_candidate", arguments: cand }));
    const cb1 = parse(await cB.callTool({ name: "submit_service_candidate", arguments: cand }));
    expect(ca1.candidate_id).not.toBe(cb1.candidate_id);
    expect(cb1.deduplicated).toBe(false);
    expect(parse(await cA.callTool({ name: "submit_service_candidate", arguments: cand })).candidate_id).toBe(ca1.candidate_id);
    // Activity shows the exact accepted payload fields.
    const act = await (await fetch(`${base}/activity`, { headers: { cookie: cookieA } })).text();
    expect(act).toContain(observed); expect(act).toContain("synthetic-object:unique-xyz");
    await cA.close(); await cB.close();
  });
  test("malformed/oversized MCP input is rejected by schema", async () => {
    const cookie = await login("alpha"); await grantSharing(cookie);
    const c = await mcpClient(await issueToken(cookie));
    expect(((await c.callTool({ name: "search_services", arguments: { query: "x".repeat(500) } })) as { isError?: boolean }).isError).toBe(true);
    await c.close();
  });
  test("export/delete: epoch revokes tokens and other sessions cannot recreate data", async () => {
    const cookie = await login("alpha"); await grantSharing(cookie);
    const other = await login("alpha");
    const token = await issueToken(cookie);
    const exp = await (await fetch(`${base}/export`, { headers: { cookie } })).json() as { assessments: unknown[] };
    expect(exp.assessments.length).toBeGreaterThan(0);
    await fetch(`${base}/delete`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${await csrf(cookie)}` });
    expect((await fetch(`${base}/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" })).status).toBe(401);
    const otherAfter = await fetch(`${base}/`, { headers: { cookie: other }, redirect: "manual" });
    expect(otherAfter.status).toBe(302); expect(otherAfter.headers.get("location")).toBe("/login");
  });
  test("demo mode: the synthetic approval routes are gone; the real card flow replaces them", async () => {
    const cookie = await login("beta");
    const form = { cookie, "content-type": "application/x-www-form-urlencoded", origin: base };
    expect((await fetch(`${base}/demo/approvals`, { headers: { cookie } })).status).toBe(404);
    expect((await fetch(`${base}/approvals`, { method: "POST", headers: form, body: `csrf=${await csrf(cookie)}&recipient=Demo&amount_cents=1200&period=2026-10&document_ref=inv` })).status).toBe(404);
    expect((await fetch(`${base}/approvals/approve`, { method: "POST", headers: form, body: `csrf=${await csrf(cookie)}&approval_id=x&amount_cents=1200` })).status).toBe(404);
    const html = await (await fetch(`${base}/approvals`, { headers: { cookie } })).text();
    expect(html).toContain("<h1>Kinnitused</h1>");
    expect(html).not.toContain("Synthetic approval demo");
    expect(html).toContain('<a href="/approvals">Kinnitused</a>');
  });
});

describe("Google OIDC through mock transport (no external network)", () => {
  let gServer: Server; let gBase = "";
  const nativeFetch = globalThis.fetch;
  let nonce = "", challenge = "", fault = "", failDiscovery = false, tokenCalls = 0;
  const gcfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://localhost:3000", googleClientId: "synthetic-client", googleClientSecret: "synthetic-placeholder", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const g = createApp(gcfg, openDb(":memory:"));
  beforeAll(async () => {
    const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const wrongKey = (await generateKeyPair("RS256")).privateKey;
    const jwk = { ...await exportJWK(publicKey), kid: "synthetic-key", alg: "RS256", use: "sig" };
    await new Promise<void>(ok => { gServer = g.app.listen(0, "127.0.0.1", ok); });
    gBase = `http://127.0.0.1:${(gServer.address() as { port: number }).port}`;
    gcfg.baseUrl = gBase;
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin === gBase || url.origin === base) return nativeFetch(input, init);
      if (url.href === "https://accounts.google.com/.well-known/openid-configuration") {
        if (failDiscovery) throw new Error("synthetic discovery failure");
        return Response.json({ issuer: "https://accounts.google.com", authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth", token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs", response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"] });
      }
      if (url.href === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
      if (url.href === "https://oauth2.googleapis.com/token") {
        tokenCalls++;
        const p = new URLSearchParams(String(init?.body ?? ""));
        expect(p.get("code")).toBe("synthetic-code");
        expect(p.get("redirect_uri")).toBe(`${gBase}/auth/callback/google`);
        expect(createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url")).toBe(challenge);
        const token = await new SignJWT({ nonce: fault === "nonce" ? "wrong-nonce" : nonce, email: "synthetic@example.invalid" })
          .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
          .setIssuer(fault === "issuer" ? "https://evil.invalid" : "https://accounts.google.com")
          .setAudience(fault === "audience" ? "other-client" : "synthetic-client")
          .setSubject("synthetic-subject").setIssuedAt().setExpirationTime(fault === "expired-token" ? Math.floor(Date.now() / 1000) - 120 : "5m")
          .sign(fault === "signature" ? wrongKey : privateKey);
        return Response.json({ access_token: "synthetic-access", token_type: "Bearer", expires_in: 300, id_token: fault === "malformed-token" ? "not.a.jwt" : token });
      }
      throw new Error(`External network prohibited: ${url.origin}`);
    };
  });
  afterAll(async () => { globalThis.fetch = nativeFetch; await new Promise<void>(ok => gServer.close(() => ok())); g.db.close(); });
  async function begin(connectionCookie = "", query = "") {
    fault = "";
    const r = await fetch(`${gBase}/auth/login/google${query}`, { redirect: "manual", headers: { cookie: connectionCookie } });
    expect(r.status).toBe(302);
    const auth = new URL(r.headers.get("location")!);
    expect(auth.searchParams.get("scope")).toBe("openid email");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    nonce = auth.searchParams.get("nonce")!; challenge = auth.searchParams.get("code_challenge")!;
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toMatch(/^lp_oidc=/);
    return { cookie, cb: `${gBase}/auth/callback/google?state=${encodeURIComponent(auth.searchParams.get("state")!)}&code=synthetic-code` };
  }
  const callback = (cb: string, cookie = "") => fetch(cb, { headers: { cookie }, redirect: "manual" });
  test("legitimate browser succeeds after foreign/cookieless attempts, then replay fails", async () => {
    const { cookie, cb } = await begin();
    const firstNonce = nonce, firstChallenge = challenge;
    const otherBrowser = await begin(); // valid cookie from a different browser, not just random bytes
    for (const foreign of ["", otherBrowser.cookie, "lp_oidc=%"]) {
      const r = await callback(cb, foreign);
      expect(r.status).toBe(400); expect(r.headers.get("set-cookie") ?? "").not.toContain("lp_session=");
    }
    nonce = firstNonce; challenge = firstChallenge;
    const ok = await callback(cb, cookie);
    expect(ok.status).toBe(302);
    const sessionCookie = ok.headers.getSetCookie().find(c => c.startsWith("lp_session="))!.split(";")[0];
    const home = await fetch(`${gBase}/`, { headers: { cookie: sessionCookie }, redirect: "manual" });
    expect(home.status).toBe(200); expect(await home.text()).toContain("Täna pole sinult midagi vaja");
    expect((await callback(cb, cookie)).status).toBe(400);
    expect(g.db.prepare("SELECT count(*) n FROM assessments").get()).toEqual({ n: 0 });
  });
  test.each(["nonce", "issuer", "audience", "expired-token", "malformed-token", "signature"])("rejects %s without a session and consumes the failed flow", async (kind) => {
    const { cookie, cb } = await begin(); fault = kind;
    const before = tokenCalls;
    const r = await callback(cb, cookie);
    expect(tokenCalls).toBe(before + 1); expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie") ?? "").not.toContain("lp_session=");
    expect(await r.text()).toBe("Google sign-in could not be verified.");
    expect((await callback(cb, cookie)).status).toBe(400);
  });
  test("MCP authorization resumes after mocked Google identity login with browser-bound continuation", async () => {
    const registration = await fetch(`${gBase}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token_endpoint_auth_method: "none", redirect_uris: ["https://assistant.example/callback"] }) });
    const client = await registration.json();
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: "code", resource: `${gBase}/mcp`, code_challenge_method: "S256", code_challenge: "a".repeat(43), scope: "progress:read" });
    const start = await fetch(`${gBase}/authorize?${params}`, { redirect: "manual" });
    const connection = start.headers.getSetCookie()[0].split(";")[0];
    const { cookie, cb } = await begin(connection);
    const signed = await callback(cb, `${cookie}; ${connection}`);
    expect(signed.headers.get("location")).toBe("/oauth/consent");
    const browserSession = signed.headers.getSetCookie().find(c => c.startsWith("lp_session="))!.split(";")[0];
    const consent = await fetch(`${gBase}/oauth/consent`, { headers: { cookie: `${browserSession}; ${connection}` }, redirect: "manual" });
    expect(consent.status).toBe(200); expect(await consent.text()).toContain("https://assistant.example");
    const missing = await fetch(`${gBase}/oauth/consent`, { headers: { cookie: browserSession }, redirect: "manual" });
    expect(missing.status).toBe(400);
  });
  async function unauthenticatedAuthorize() {
    const client = await (await fetch(`${gBase}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token_endpoint_auth_method: "none", client_name: "Synthetic Claude", redirect_uris: ["https://assistant.example/callback"] }) })).json();
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: "code", resource: `${gBase}/mcp`, code_challenge_method: "S256", code_challenge: "b".repeat(43), scope: "progress:read progress:report", state: "assistant-state" });
    const start = await fetch(`${gBase}/authorize?${params}`, { redirect: "manual" });
    expect(start.headers.get("location")).toBe("/oauth/consent");
    return { client, connection: start.headers.getSetCookie().find(c => c.startsWith("lp_connect="))!.split(";")[0] };
  }
  test("first Connect with a Google login returns to consent for the same request, even if the connect cookie is lost", async () => {
    const { client, connection } = await unauthenticatedAuthorize();
    const gate = await fetch(`${gBase}/oauth/consent`, { headers: { cookie: connection }, redirect: "manual" });
    expect(gate.headers.get("location")).toBe("/login?return_to=%2Foauth%2Fconsent");
    expect(await (await fetch(`${gBase}${gate.headers.get("location")}`)).text()).toContain('href="/auth/login/google?return_to=%2Foauth%2Fconsent"');
    const { cookie, cb } = await begin(connection, "?return_to=%2Foauth%2Fconsent");
    const signed = await callback(cb, cookie); // the browser comes back without lp_connect
    expect(signed.headers.get("location")).toBe("/oauth/consent");
    const set = signed.headers.getSetCookie();
    expect(set).toContainEqual(expect.stringMatching(new RegExp(`^${connection}; HttpOnly; SameSite=Lax`)));
    const browserSession = set.find(c => c.startsWith("lp_session="))!.split(";")[0];
    const consent = await fetch(`${gBase}/oauth/consent`, { headers: { cookie: `${browserSession}; ${connection}` }, redirect: "manual" });
    expect(consent.status).toBe(200);
    const html = await consent.text();
    expect(html).toContain("Ühenda Synthetic Claude AI-hüppelauaga?");
    expect(html).toContain("<strong>assistant.example</strong>");
    expect(html).toContain("<dd>progress:read progress:report</dd>");
    const pending = g.db.prepare("SELECT client_id,params FROM oauth_pending WHERE id=?").get(sha256(connection.slice("lp_connect=".length))) as { client_id: string; params: string };
    expect(pending.client_id).toBe(client.client_id);
    expect(JSON.parse(pending.params)).toMatchObject({ redirectUri: "https://assistant.example/callback", scopes: ["progress:read", "progress:report"], state: "assistant-state", codeChallenge: "b".repeat(43) });
  });
  test.each(["https://evil.example/oauth/consent", "//evil.example/oauth/consent", "/oauth/consent/../../approvals", "/oauth/disconnect", "/"])("a tampered return_to %s is ignored: the login lands on /", async (bad) => {
    const { connection } = await unauthenticatedAuthorize();
    const { cookie, cb } = await begin(connection, `?return_to=${encodeURIComponent(bad)}`);
    const signed = await callback(cb, `${cookie}; ${connection}`);
    expect(signed.status).toBe(302); expect(signed.headers.get("location")).toBe("/");
    expect(signed.headers.getSetCookie().some(c => c.startsWith("lp_connect="))).toBe(false);
  });
  test.each([
    ["expires", (id: string) => g.db.prepare("UPDATE oauth_pending SET expires=? WHERE id=?").run(Date.now() - 1, id)],
    ["is deleted or consumed", (id: string) => g.db.prepare("DELETE FROM oauth_pending WHERE id=?").run(id)],
  ])("a pending request that %s between Google-login start and callback lands on / without consent", async (_, gone) => {
    const { connection } = await unauthenticatedAuthorize();
    const { cookie, cb } = await begin(connection, "?return_to=%2Foauth%2Fconsent");
    gone(sha256(connection.slice("lp_connect=".length)));
    const signed = await callback(cb, cookie);
    expect(signed.status).toBe(302); expect(signed.headers.get("location")).toBe("/");
    const set = signed.headers.getSetCookie();
    expect(set.some(c => c.startsWith("lp_connect="))).toBe(false);
    const browserSession = set.find(c => c.startsWith("lp_session="))!.split(";")[0];
    const consent = await fetch(`${gBase}/oauth/consent`, { headers: { cookie: `${browserSession}; ${connection}` }, redirect: "manual" });
    expect(consent.status).toBe(400);
  });
  test("another browser's lp_oidc cannot finish a Google login that carries this browser's pending request", async () => {
    const { connection } = await unauthenticatedAuthorize();
    const a = await begin(connection, "?return_to=%2Foauth%2Fconsent");
    const b = await begin();
    const r = await callback(a.cb, b.cookie);
    expect(r.status).toBe(400);
    const set = r.headers.getSetCookie();
    expect(set.some(c => c.startsWith("lp_session="))).toBe(false);
    expect(set.some(c => c.startsWith("lp_connect="))).toBe(false);
    expect(g.db.prepare("SELECT owner_id FROM oauth_pending WHERE id=?").get(sha256(connection.slice("lp_connect=".length)))).toEqual({ owner_id: null });
  });
  test("a login without a pending authorize lands on / even with a valid return_to", async () => {
    const { cookie, cb } = await begin("", "?return_to=%2Foauth%2Fconsent");
    expect((await callback(cb, cookie)).headers.get("location")).toBe("/");
  });
  test("wrong, missing and duplicate state fail before token exchange; original flow still works", async () => {
    const { cookie, cb } = await begin(); const before = tokenCalls;
    for (const bad of [cb.replace(/state=[^&]+/, "state=wrong"), cb.replace(/state=[^&]+&/, ""), `${cb}&state=duplicate`]) {
      expect((await callback(bad, cookie)).status).toBe(400);
    }
    expect(tokenCalls).toBe(before);
    expect((await callback(cb, cookie)).status).toBe(302);
  });
  test("expired browser flow fails without token exchange", async () => {
    const { cookie, cb } = await begin(); const before = tokenCalls; const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + 601_000);
    try { expect((await callback(cb, cookie)).status).toBe(400); expect(tokenCalls).toBe(before); }
    finally { spy.mockRestore(); }
  });
  test("discovery failure returns controlled 503 and the process continues serving", async () => {
    failDiscovery = true;
    try {
      const r = await fetch(`${gBase}/auth/login/google`, { redirect: "manual" });
      expect(r.status).toBe(503); expect(await r.text()).not.toContain("synthetic discovery failure");
      expect((await fetch(`${gBase}/health`)).status).toBe(200);
    } finally { failDiscovery = false; }
    expect((await begin()).cookie).toMatch(/^lp_oidc=/);
  });
});
