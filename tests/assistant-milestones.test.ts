import { test, expect } from "vitest";
import type { Server } from "node:http";
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, getAssistantMilestones, logActivity } from "../src/mcp.js";
import { openDb, sha256 } from "../src/db.js";
import { createApp, type Config } from "../src/app.js";
import { connectionBody } from "../src/views.js";
import { assessmentSchema, type Assessment } from "../src/core.js";
import { DOMAINS } from "../src/catalog.js";

const assessment: Assessment = assessmentSchema.parse({
  company_label: "Synthetic Milestone OÜ", company_registry_ref: "synthetic-ms-1",
  assessed_domains: [...DOMAINS], gaps: [], conclusion: "Admin is partly arranged.",
  responsibilities: [
    { id: "billing", domain: "money", label: "Monthly billing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "Synthetic accountant", access: "Existing billing access", success_criterion: "Invoices drafted", next_checkpoint: "Next month", reason: "Accountant handles billing", evidence_refs: [] },
    { id: "rota", domain: "people", label: "Staff rota", applicability: "applicable", is_core: false, arrangement: "none", reason: "Owner keeps the rota by hand", evidence_refs: [] },
  ], next_action: { title: "Arrange the staff rota", rationale: "Weekly manual work", uncertainty: "Assistant judgment only", needs_owner: false },
});

type Db = ReturnType<typeof openDb>;

function mkOwner(db: Db, id: string, kind = "google", reporting = 1) {
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,?,?,?)").run(id, `synthetic-${id}`, kind, reporting, new Date().toISOString());
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `workspace-${id}`, `Synthetic workspace ${id}`);
}

async function connect(db: Db, ownerId: string, scopes: string[], reportingEnabled: boolean) {
  const server = buildMcpServer(db, { ownerId, scopes, companyRef: `workspace-${ownerId}`, label: `Synthetic workspace ${ownerId}`, reportingEnabled });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "synthetic-milestones-test", version: "1" });
  await server.connect(st);
  await c.connect(ct);
  return c;
}

const parsed = (r: any) => r.structuredContent ?? JSON.parse(r.content[0].text);
const counts = (db: Db, owner: string) => ({
  activity: (db.prepare("SELECT count(*) n FROM activity WHERE owner_id=?").get(owner) as { n: number }).n,
  reports: (db.prepare("SELECT count(*) n FROM reports WHERE owner_id=?").get(owner) as { n: number }).n,
  assessments: (db.prepare("SELECT count(*) n FROM assessments WHERE owner_id=?").get(owner) as { n: number }).n,
});

test("issuance and non-tool activity alone leave no milestones; demo seed stays synthetic", () => {
  const db = openDb(":memory:");
  try {
    mkOwner(db, "real");
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,revoked,created_at,last_used_at) VALUES(?,?,?,?,?,?,?,?)")
      .run("tok1", "real", "synthetic-hash", "progress:read progress:report", 1, 0, new Date().toISOString(), new Date().toISOString());
    logActivity(db, "real", "owner", "issue_token", "ok", "Owner issued a manual token.");
    logActivity(db, "real", "assistant", "token_issued", "ok", "Permission issuance, not tool contact.");
    logActivity(db, "real", "assistant", "get_started", "denied", "Failed call, not contact.");
    expect(getAssistantMilestones(db, "real")).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });

    mkOwner(db, "demo", "demo");
    db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)")
      .run("seed1", "demo", 1, JSON.stringify(assessment), "synthetic", new Date().toISOString());
    db.prepare("UPDATE workspaces SET version=1 WHERE owner_id=?").run("demo");
    logActivity(db, "demo", "launchpad", "demo_fixture_seeded", "ok", "Synthetic demo fixture loaded.");
    logActivity(db, "demo", "assistant", "get_started", "ok", "Demo seed activity is not real contact.");
    expect(getAssistantMilestones(db, "demo")).toEqual({ synthetic: true, lastContact: null, firstSavedAssessment: null });

    expect(getAssistantMilestones(db, "missing")).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });
  } finally { db.close(); }
});

test("get_started with sharing off records contact; missing scope and denied writes add nothing", async () => {
  const db = openDb(":memory:");
  const clients: Client[] = [];
  try {
    mkOwner(db, "off", "google", 0);
    mkOwner(db, "narrow", "google", 1);
    const off = await connect(db, "off", ["progress:read", "progress:report"], false);
    const narrow = await connect(db, "narrow", [], true);
    clients.push(off, narrow);
    await off.callTool({ name: "get_started", arguments: {} });
    const m = getAssistantMilestones(db, "off");
    expect(m.synthetic).toBe(false);
    expect(m.lastContact?.action).toBe("get_started");
    expect(m.lastContact?.basis).toBe("tool_activity");
    expect(typeof m.lastContact?.at).toBe("string");
    expect(m.firstSavedAssessment).toBeNull();

    expect(((await narrow.callTool({ name: "get_progress", arguments: {} })) as { isError?: boolean }).isError).toBe(true);
    expect(((await narrow.callTool({ name: "report_assessment", arguments: { report_id: "x", expected_version: 0, assessment } })) as { isError?: boolean }).isError).toBe(true);
    expect(getAssistantMilestones(db, "narrow")).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });
  } finally { for (const c of clients) await c.close(); db.close(); }
});

test("report_assessment receipt, idempotent retry, rejected writes, owner isolation", async () => {
  const db = openDb(":memory:");
  const clients: Client[] = [];
  try {
    mkOwner(db, "a");
    mkOwner(db, "b");
    const ca = await connect(db, "a", ["progress:read", "progress:report"], true);
    const cb = await connect(db, "b", ["progress:read", "progress:report"], true);
    const stopped = await connect(db, "a", ["progress:read", "progress:report"], false);
    const noscope = await connect(db, "a", ["progress:read"], true);
    clients.push(ca, cb, stopped, noscope);
    const args = { report_id: "r1", expected_version: 0, assessment };
    const receipt = parsed(await ca.callTool({ name: "report_assessment", arguments: args }));
    expect(receipt.kind).toBe("assessment_saved");
    expect(receipt.version).toBe(1);
    expect(typeof receipt.receipt_id).toBe("string");

    const first = getAssistantMilestones(db, "a").firstSavedAssessment;
    expect(first).toMatchObject({ reportId: "r1", receiptId: receipt.receipt_id, version: 1 });
    expect(typeof first?.at).toBe("string");

    const retry = parsed(await ca.callTool({ name: "report_assessment", arguments: args }));
    expect(retry.receipt_id).toBe(receipt.receipt_id);
    expect(getAssistantMilestones(db, "a").firstSavedAssessment).toEqual(first);

    const conflict = { ...args, assessment: { ...assessment, conclusion: "changed" } };
    for (const bad of [
      ca.callTool({ name: "report_assessment", arguments: conflict }),
      ca.callTool({ name: "report_assessment", arguments: { report_id: "stale", expected_version: 999, assessment } }),
      stopped.callTool({ name: "report_assessment", arguments: { report_id: "off", expected_version: 1, assessment } }),
      noscope.callTool({ name: "report_assessment", arguments: { report_id: "narrow", expected_version: 1, assessment } }),
    ]) expect(((await bad) as { isError?: boolean }).isError).toBe(true);
    expect(getAssistantMilestones(db, "a").firstSavedAssessment).toEqual(first);

    const rb = parsed(await cb.callTool({ name: "report_assessment", arguments: args }));
    expect(rb.receipt_id).not.toBe(receipt.receipt_id);
    expect(getAssistantMilestones(db, "b").firstSavedAssessment).toMatchObject({ reportId: "r1", receiptId: rb.receipt_id, version: 1 });
    expect(getAssistantMilestones(db, "a").firstSavedAssessment).toEqual(first);
  } finally { for (const c of clients) await c.close(); db.close(); }
});

test("pruned tool activity falls back to newest receipt; first saved stays first; no receipts means unknown", async () => {
  const db = openDb(":memory:");
  const clients: Client[] = [];
  try {
    mkOwner(db, "kept");
    mkOwner(db, "bare");
    const c = await connect(db, "kept", ["progress:read", "progress:report"], true);
    const d = await connect(db, "bare", ["progress:read", "progress:report"], true);
    clients.push(c, d);
    await c.callTool({ name: "report_assessment", arguments: { report_id: "r1", expected_version: 0, assessment } });
    await c.callTool({ name: "report_assessment", arguments: { report_id: "r2", expected_version: 1, assessment } });
    db.prepare("UPDATE reports SET created_at=? WHERE owner_id='kept' AND report_id='r1'").run("2026-10-20T10:00:00.000Z");
    db.prepare("UPDATE reports SET created_at=? WHERE owner_id='kept' AND report_id='r2'").run("2026-10-21T10:00:00.000Z");
    await d.callTool({ name: "get_started", arguments: {} });
    expect(getAssistantMilestones(db, "bare").lastContact?.basis).toBe("tool_activity");

    for (let i = 0; i < 501; i++) {
      logActivity(db, "kept", "owner", "note", "ok", `Synthetic filler ${i}.`);
      logActivity(db, "bare", "owner", "note", "ok", `Synthetic filler ${i}.`);
    }
    const kept = getAssistantMilestones(db, "kept");
    expect(kept.firstSavedAssessment).toMatchObject({ reportId: "r1", at: "2026-10-20T10:00:00.000Z" });
    expect(kept.lastContact).toEqual({ at: "2026-10-21T10:00:00.000Z", action: "report_assessment", basis: "assessment_receipt" });
    expect(getAssistantMilestones(db, "bare")).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });
  } finally { for (const c of clients) await c.close(); db.close(); }
});

test("revocation keeps history; owner deletion resets evidence", async () => {
  const db = openDb(":memory:");
  const clients: Client[] = [];
  try {
    mkOwner(db, "gone");
    const c = await connect(db, "gone", ["progress:read", "progress:report"], true);
    clients.push(c);
    await c.callTool({ name: "get_started", arguments: {} });
    await c.callTool({ name: "report_assessment", arguments: { report_id: "r1", expected_version: 0, assessment } });
    const before = getAssistantMilestones(db, "gone");
    expect(before.lastContact).not.toBeNull();
    expect(before.firstSavedAssessment).not.toBeNull();

    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,revoked,created_at) VALUES(?,?,?,?,?,?,?)")
      .run("tok1", "gone", "synthetic-hash", "progress:read progress:report", 1, 0, new Date().toISOString());
    db.prepare("UPDATE mcp_tokens SET revoked=1 WHERE id='tok1'").run();
    expect(getAssistantMilestones(db, "gone")).toEqual(before);

    for (const t of ["assessments", "reports", "progress", "activity", "approvals", "candidates"]) {
      db.prepare(`DELETE FROM ${t} WHERE owner_id=?`).run("gone");
    }
    expect(getAssistantMilestones(db, "gone")).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });
  } finally { for (const c of clients) await c.close(); db.close(); }
});

test("corrupt receipts and bare assessments are ignored; reads are stable and write nothing", () => {
  const db = openDb(":memory:");
  try {
    mkOwner(db, "messy");
    db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)")
      .run("bare1", "messy", 1, JSON.stringify(assessment), "synthetic", new Date().toISOString());
    expect(getAssistantMilestones(db, "messy").firstSavedAssessment).toBeNull();

    const rows: Array<[string, unknown]> = [
      ["malformed", "{not-json"],
      ["wrong-kind", JSON.stringify({ receipt_id: "rcpt_a", kind: "progress_saved", version: 1 })],
      ["empty-id", JSON.stringify({ receipt_id: "", kind: "assessment_saved", version: 1 })],
      ["zero-version", JSON.stringify({ receipt_id: "rcpt_b", kind: "assessment_saved", version: 0 })],
      ["negative-version", JSON.stringify({ receipt_id: "rcpt_c", kind: "assessment_saved", version: -2 })],
      ["fraction-version", JSON.stringify({ receipt_id: "rcpt_d", kind: "assessment_saved", version: 1.5 })],
      ["string-version", JSON.stringify({ receipt_id: "rcpt_e", kind: "assessment_saved", version: "1" })],
      ["orphan-version", JSON.stringify({ receipt_id: "rcpt_f", kind: "assessment_saved", version: 99 })],
    ];
    for (const [report_id, receipt] of rows) {
      db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,payload_json,receipt_json,created_at) VALUES(?,?,?,?,?,?,?)")
        .run("messy", report_id, "assessment", "synthetic", "{}", typeof receipt === "string" ? receipt : JSON.stringify(receipt), new Date().toISOString());
    }
    const ignored = getAssistantMilestones(db, "messy");
    expect(ignored).toEqual({ synthetic: false, lastContact: null, firstSavedAssessment: null });

    db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)")
      .run("real2", "messy", 2, JSON.stringify(assessment), "synthetic", new Date().toISOString());
    db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,payload_json,receipt_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run("messy", "good", "assessment", "synthetic", "{}", JSON.stringify({ receipt_id: "rcpt_good", kind: "assessment_saved", version: 2 }), "2026-10-22T10:00:00.000Z");
    const good = getAssistantMilestones(db, "messy");
    expect(good.firstSavedAssessment).toEqual({ at: "2026-10-22T10:00:00.000Z", reportId: "good", receiptId: "rcpt_good", version: 2 });

    const before = counts(db, "messy");
    expect(getAssistantMilestones(db, "messy")).toEqual(good);
    expect(getAssistantMilestones(db, "messy")).toEqual(good);
    expect(counts(db, "messy")).toEqual(before);
  } finally { db.close(); }
});

// --- Route + view integration: synthetic fixture owners/sessions, no real OAuth. ---

function mkRouteOwner(db: Db, id: string, kind = "google", reporting = 1) {
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,?,?,?)").run(id, `route-${id}`, kind, reporting, new Date().toISOString());
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `workspace-${id}`, `Synthetic workspace ${id}`);
}
function mkBrowserSession(db: Db, ownerId: string) {
  const raw = randomBytes(16).toString("base64url");
  const csrf = randomBytes(12).toString("base64url");
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(raw), ownerId, csrf, new Date(Date.now() + 3600_000).toISOString());
  return { cookie: `lp_session=${raw}`, csrf };
}
async function startRouteApp(db: Db) {
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app } = createApp(cfg, db);
  const server: Server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cfg.baseUrl = base;
  return { base, server };
}
async function getConnection(base: string, cookie: string, query = "") {
  const r = await fetch(`${base}/connection?lang=en${query.replace(/^\?/, "&")}`, { headers: { cookie }, redirect: "manual" });
  return { status: r.status, html: await r.text() };
}
async function stopServer(server: Server) {
  await new Promise<void>((ok) => server.close(() => ok()));
}
const humanDate = (iso: string) => {
  const d = new Date(Date.parse(iso));
  return d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
};
const historySection = (html: string) => {
  const start = html.indexOf('aria-label="Assistant history"');
  expect(start).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</section>", start));
};

test("connection route isolates owners; foreign owner selectors cannot select another owner", async () => {
  const db = openDb(":memory:");
  mkRouteOwner(db, "ownerA");
  mkRouteOwner(db, "ownerB");
  const a = mkBrowserSession(db, "ownerA");
  const b = mkBrowserSession(db, "ownerB");
  const { base, server } = await startRouteApp(db);
  try {
    const empty = await getConnection(base, a.cookie);
    expect(empty.status).toBe(200);
    expect(empty.html).toContain("No request recorded in retained history");
    expect(empty.html).not.toContain("Last request received");
    expect(empty.html).not.toContain("Assessment saved");

    const ca = await connect(db, "ownerA", ["progress:read", "progress:report"], true);
    await ca.callTool({ name: "get_started", arguments: {} });
    await ca.close();

    const ra = await getConnection(base, a.cookie);
    expect(ra.html).toContain("Last request received");
    expect(ra.html).toContain(humanDate(getAssistantMilestones(db, "ownerA").lastContact!.at));
    const rb = await getConnection(base, b.cookie);
    expect(rb.html).toContain("No request recorded in retained history");
    expect(rb.html).not.toContain("Last request received");

    for (const q of ["?owner_id=ownerB", "?ownerId=ownerB", "?owner=ownerB"]) {
      const r = await getConnection(base, a.cookie, q);
      expect(r.html).toContain("Last request received");
      expect(r.html).not.toContain("Synthetic workspace ownerB");
    }
    const anon = await fetch(`${base}/connection`, { redirect: "manual" });
    expect(anon.status).toBe(302);
  } finally { await stopServer(server); db.close(); }
});

test("token issuance and tools/list show no contact; saved receipt renders timestamp plus Status/Activity links for its owner only", async () => {
  const db = openDb(":memory:");
  mkRouteOwner(db, "rcA");
  mkRouteOwner(db, "rcB");
  const a = mkBrowserSession(db, "rcA");
  const b = mkBrowserSession(db, "rcB");
  const { base, server } = await startRouteApp(db);
  const clients: Client[] = [];
  try {
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,revoked,created_at) VALUES(?,?,?,?,?,?,?)")
      .run("tokA", "rcA", "synthetic-hash-a", "progress:read progress:report", 1, 0, new Date().toISOString());
    const ca = await connect(db, "rcA", ["progress:read", "progress:report"], true);
    clients.push(ca);
    await ca.listTools();
    expect(getAssistantMilestones(db, "rcA").lastContact).toBeNull();
    expect((await getConnection(base, a.cookie)).html).toContain("No request recorded in retained history");

    const receipt = parsed(await ca.callTool({ name: "report_assessment", arguments: { report_id: "route-r1", expected_version: 0, assessment } }));
    expect(receipt.kind).toBe("assessment_saved");
    const m = getAssistantMilestones(db, "rcA");
    const htmlA = (await getConnection(base, a.cookie)).html;
    expect(htmlA).toContain("Last request received");
    expect(htmlA).toContain("Assessment saved");
    expect(htmlA).toContain(humanDate(m.firstSavedAssessment!.at));
    expect(htmlA).toContain('href="/"');
    expect(htmlA).toContain('href="/activity"');
    expect(htmlA).not.toContain(receipt.receipt_id);
    const htmlB = (await getConnection(base, b.cookie)).html;
    expect(htmlB).toContain("No request recorded in retained history");
    expect(htmlB).not.toContain("Assessment saved");
    expect(htmlB).not.toContain("Last request received");
  } finally { for (const c of clients) await c.close(); await stopServer(server); db.close(); }
});

test("sharing off records read contact but no saved assessment; denied, stale and conflicting writes do not advance", async () => {
  const db = openDb(":memory:");
  mkRouteOwner(db, "quiet", "google", 0);
  const sess = mkBrowserSession(db, "quiet");
  const { base, server } = await startRouteApp(db);
  const clients: Client[] = [];
  try {
    const c = await connect(db, "quiet", ["progress:read", "progress:report"], false);
    const ro = await connect(db, "quiet", ["progress:read"], false);
    clients.push(c, ro);
    await c.callTool({ name: "get_started", arguments: {} });
    // Permitted reads stay available while sharing is off; they are governed by scopes, not sharing.
    expect(((await ro.callTool({ name: "get_progress", arguments: {} })) as { isError?: boolean }).isError).toBeUndefined();
    expect(((await c.callTool({ name: "report_assessment", arguments: { report_id: "blocked", expected_version: 0, assessment } })) as { isError?: boolean }).isError).toBe(true);
    expect(((await ro.callTool({ name: "report_assessment", arguments: { report_id: "narrow", expected_version: 0, assessment } })) as { isError?: boolean }).isError).toBe(true);
    let m = getAssistantMilestones(db, "quiet");
    expect(m.lastContact?.basis).toBe("tool_activity");
    expect(["get_started", "get_progress"]).toContain(m.lastContact?.action);
    expect(m.firstSavedAssessment).toBeNull();
    let html = (await getConnection(base, sess.cookie)).html;
    expect(html).toContain("Last request received");
    expect(html).not.toContain("Assessment saved");

    db.prepare("UPDATE owners SET reporting_enabled=1 WHERE id=?").run("quiet");
    const open = await connect(db, "quiet", ["progress:read", "progress:report"], true);
    clients.push(open);
    const good = parsed(await open.callTool({ name: "report_assessment", arguments: { report_id: "good", expected_version: 0, assessment } }));
    expect(good.kind).toBe("assessment_saved");
    const first = getAssistantMilestones(db, "quiet").firstSavedAssessment;
    for (const bad of [
      open.callTool({ name: "report_assessment", arguments: { report_id: "good", expected_version: 1, assessment: { ...assessment, conclusion: "changed" } } }),
      open.callTool({ name: "report_assessment", arguments: { report_id: "stale", expected_version: 0, assessment } }),
      open.callTool({ name: "report_progress", arguments: { report_id: "unknown-task", task_id: "nope", expected_version: 1, observed_at: new Date().toISOString(), milestone: "started" } }),
    ]) expect(((await bad) as { isError?: boolean }).isError).toBe(true);
    expect(getAssistantMilestones(db, "quiet").firstSavedAssessment).toEqual(first);
    html = (await getConnection(base, sess.cookie)).html;
    expect(html).toContain("Assessment saved");
  } finally { for (const c of clients) await c.close(); await stopServer(server); db.close(); }
});

test("revoked grant keeps history with revoked access; owner delete clears history and old tokens die", async () => {
  const db = openDb(":memory:");
  mkRouteOwner(db, "holder");
  let sess = mkBrowserSession(db, "holder");
  const { base, server } = await startRouteApp(db);
  const clients: Client[] = [];
  try {
    const c = await connect(db, "holder", ["progress:read", "progress:report"], true);
    clients.push(c);
    await c.callTool({ name: "get_started", arguments: {} });
    await c.callTool({ name: "report_assessment", arguments: { report_id: "h1", expected_version: 0, assessment } });

    db.prepare("INSERT INTO oauth_clients(id,metadata,expires) VALUES(?,?,?)").run("cli1", JSON.stringify({ client_name: "Test Assistant" }), Date.now() + 3600_000);
    db.prepare("INSERT INTO oauth_grants(id,owner_id,epoch,client_id,scopes,resource,revoked,expires,redirect) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("grant1", "holder", 1, "cli1", "progress:read progress:report", `${base}/mcp`, 1, Date.now() + 3600_000, "https://assistant.example/callback");
    const revoked = (await getConnection(base, sess.cookie)).html;
    expect(revoked).toContain("Access revoked");
    expect(revoked).not.toContain("Access approved");
    expect(revoked).toContain("Last request received");
    expect(revoked).toContain("Assessment saved");

    const oldSecret = `old_${randomBytes(8).toString("base64url")}`;
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,revoked,created_at) VALUES(?,?,?,?,?,?,?)")
      .run("tokOld", "holder", sha256(oldSecret), "progress:read progress:report", 1, 0, new Date().toISOString());
    const del = await fetch(`${base}/delete`, { method: "POST", headers: { cookie: sess.cookie, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf: sess.csrf }), redirect: "manual" });
    expect(del.status).toBe(302);
    sess = { cookie: (del.headers.get("set-cookie") ?? "").split(";")[0], csrf: sess.csrf };
    const cleared = (await getConnection(base, sess.cookie)).html;
    expect(cleared).toContain("No request recorded in retained history");
    expect(cleared).not.toContain("Assessment saved");
    expect(cleared).not.toContain("Last request received");
    const replay = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${oldSecret}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) });
    expect(replay.status).toBe(401);
  } finally { for (const c of clients) await c.close(); await stopServer(server); db.close(); }
});

test("standalone view defaults to no evidence; synthetic never shows real milestones; displayed values escaped", () => {
  const baseOpts = { lang: "en" as const, csrf: "csrf-x", baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [] as Record<string, unknown>[], grants: [] as Record<string, string>[], candidates: [] as Record<string, string>[] };
  const bare = connectionBody(baseOpts);
  expect(bare).toContain("No request recorded in retained history");
  expect(bare).not.toMatch(/Last request received|Assessment saved/);
  expect(bare).not.toMatch(/never connected/i);
  // Copy MCP address stays in the connect card above the history section.
  expect(bare.indexOf("Copy MCP address")).toBeLessThan(bare.indexOf("Assistant history"));

  const filled = {
    synthetic: true,
    lastContact: { at: "2026-10-21T10:00:00.000Z", action: "report_assessment", basis: "assessment_receipt" as const },
    firstSavedAssessment: { at: "2026-10-21T10:00:00.000Z", reportId: "r1", receiptId: "rcpt_real_1", version: 1 },
  };
  const synth = connectionBody({ ...baseOpts, milestones: filled });
  expect(synth).toMatch(/synthetic sample/i);
  expect(synth).not.toContain("Last request received");
  expect(synth).not.toContain("Assessment saved");
  expect(synth).not.toContain("rcpt_real_1");

  const evil = connectionBody({
    ...baseOpts,
    milestones: { synthetic: false, lastContact: { at: "2026-10-21T10:00:00.000Z", action: "<img src=x onerror=alert(1)>", basis: "tool_activity" }, firstSavedAssessment: null },
  });
  expect(evil).not.toContain("<img src=x");
  expect(evil).not.toContain("&lt;img");
  expect(evil).toContain("Last request received");
  expect(evil).toContain("Saved history, not a live connection check");

  const grant = { id: "grant-1", scopes: "progress:read", revoked: 0, expires: String(Date.now() + 3600_000), redirect: "https://assistant.example/callback", metadata: JSON.stringify({ client_name: "Test Assistant" }) };
  const granted = connectionBody({ ...baseOpts, grants: [grant] });
  expect(granted).toContain("Access approved");
  expect(granted).toContain("No request recorded in retained history");
  expect(granted).not.toContain("Last request received");

  const saved = connectionBody({
    ...baseOpts,
    milestones: { synthetic: false, lastContact: filled.lastContact, firstSavedAssessment: { at: "2026-10-21T10:00:00.000Z", reportId: "r1", receiptId: "rcpt-secret-123", version: 1 } },
  });
  expect(saved).toContain("Assessment saved");
  expect(saved).toContain('href="/"');
  expect(saved).toContain('href="/activity"');
  expect(saved).not.toContain("rcpt-secret-123");
  const section = historySection(saved);
  expect(section).not.toContain("<form");
  expect(section).not.toContain("<input");
  expect(section).not.toContain("checkbox");
});

test("connection render and route read initiate no source writes and add no approval flow", async () => {
  const db = openDb(":memory:");
  mkRouteOwner(db, "quiet2");
  const sess = mkBrowserSession(db, "quiet2");
  const { base, server } = await startRouteApp(db);
  try {
    const before = counts(db, "quiet2");
    connectionBody({ lang: "en", csrf: "c", baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [], grants: [], candidates: [] });
    connectionBody({ lang: "en", csrf: "c", baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [], grants: [], candidates: [], milestones: { synthetic: false, lastContact: null, firstSavedAssessment: null } });
    const r = await getConnection(base, sess.cookie);
    expect(r.status).toBe(200);
    expect(historySection(r.html)).not.toMatch(/approv|ratif|counter|checkbox/i);
    expect(counts(db, "quiet2")).toEqual(before);
  } finally { await stopServer(server); db.close(); }
});
