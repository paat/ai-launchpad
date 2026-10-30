import { test, expect, beforeAll, afterAll, describe } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp, type Config } from "../src/app.js";
import { openDb, sha256 } from "../src/db.js";
import { approvalDigest, canonicalJson } from "../src/mcp.js";

// Synthetic Google-style owners with direct sessions/tokens; no OIDC.
let server: Server; let base = "";
const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://localhost:3000", modelMode: "test", allowedHosts: ["localhost", "127.0.0.1"] };
const { app, db } = createApp(cfg, openDb(":memory:"));
const clients: Client[] = [];

function owner(id: string, scopes = "progress:read,progress:report", sharing = 1) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,'google',?,?)").run(id, `synthetic-${id}`, sharing, now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,'Synthetic workspace')").run(id, `ws-${id}`);
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(`sess-${id}`), id, `csrf-${id}`, new Date(Date.now() + 3600_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,?,1,?)").run(`tok-${id}`, id, sha256(`lp_tok-${id}`), scopes, now);
  return { cookie: `lp_session=sess-${id}`, csrf: `csrf-${id}`, token: `lp_tok-${id}` };
}
async function client(token: string) {
  const c = new Client({ name: "synthetic-approvals", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  clients.push(c); return c;
}
const parsed = (r: unknown) => { const x = r as { structuredContent?: Record<string, any>; content: { text: string }[] }; return x.structuredContent ?? JSON.parse(x.content[0].text); };
const errText = (r: unknown) => { const x = r as { isError?: boolean; content: { text: string }[] }; expect(x.isError).toBe(true); return x.content[0].text; };
const decide = (o: { cookie: string; csrf: string }, id: string, body: Record<string, string>, origin: string | null = base) =>
  fetch(`${base}/approvals/${id}/decide`, { method: "POST", redirect: "manual", headers: { cookie: o.cookie, "content-type": "application/x-www-form-urlencoded", ...(origin === null ? {} : { origin }) }, body: new URLSearchParams({ csrf: o.csrf, ...body }) });
const row = (id: string) => db.prepare("SELECT * FROM approvals WHERE id=?").get(id) as Record<string, string | null>;
const reminder = (extra: Record<string, unknown> = {}) => ({
  kind: "send_invoice", recipient: { name: "Synthetic Client OÜ", address: "billing@client.example" }, amount_cents: 124000, period: "2026-10",
  document: { title: "Payment reminder: invoice 2026-014", content: "Tere!\n\nInvoice 2026-014 (€1,240.00) is overdue. <script>alert(1)</script>\n\nAitäh" },
  summary: "Reminder for overdue invoice 2026-014", ...extra,
});

beforeAll(async () => { await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); }); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base; });
afterAll(async () => { for (const c of clients) await c.close().catch(() => {}); server.close(); });

test("canonical digest binds every field with stable key order", () => {
  const a = reminder();
  const reordered = { summary: a.summary, document: { content: a.document.content, title: a.document.title }, period: a.period, amount_cents: a.amount_cents, recipient: { address: a.recipient.address, name: a.recipient.name }, kind: a.kind };
  expect(canonicalJson(reordered)).toBe(canonicalJson(a));
  expect(approvalDigest(reordered)).toBe(approvalDigest(a));
  expect(approvalDigest(a)).toMatch(/^[0-9a-f]{64}$/);
  for (const changed of [reminder({ amount_cents: 124001 }), reminder({ period: "2026-11" }), reminder({ recipient: { name: "Other OÜ" } }), reminder({ document: { ...a.document, content: `${a.document.content} ` } }), reminder({ summary: "x" }), reminder({ kind: "send_message" })])
    expect(approvalDigest(changed)).not.toBe(approvalDigest(a));
});

describe("approval cards over MCP", () => {
  test("request → owner approves exact card → outcome with identical digest; one-use lifecycle", async () => {
    const o = owner("flow");
    const c = await client(o.token);
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["request_approval", "get_approval", "record_action_outcome"]));
    const started = parsed(await c.callTool({ name: "get_started", arguments: {} }));
    expect(started.tools).toEqual(expect.arrayContaining(["request_approval", "get_approval", "record_action_outcome"]));

    // Amount is required for invoices and payments; nothing is saved.
    const { amount_cents: _drop, ...noAmount } = reminder();
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "no-amount", action: noAmount } }))).toMatch(/amount_cents.*Nothing was saved/s);
    // Unexpected top-level and nested fields are rejected, not stripped.
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "forged", action: reminder(), approved: true } }))).toContain("Unexpected field(s) rejected: approved");
    expect((await c.callTool({ name: "request_approval", arguments: { report_id: "forged2", action: { ...reminder(), owner_approved: true } } }) as { isError?: boolean }).isError).toBe(true);
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='flow'").get() as { n: number }).n).toBe(0);

    const req = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "req-1", action: reminder() } }));
    expect(req.state).toBe("pending");
    expect(req.digest).toBe(approvalDigest({ ...reminder(), currency: "EUR" }));
    expect(req.approve_url).toBe(`${base}/approvals/${req.approval_id}`);
    expect(req.owner_instruction).toBe("Ask the owner to open the link (or the Launchpad Status page) and approve or decline. Do not act before get_approval returns approved.");
    expect(Date.parse(req.expires_at) - Date.now()).toBeGreaterThan(23.9 * 3600_000);
    // Idempotent: replay returns the same receipt; a changed payload conflicts.
    expect(parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "req-1", action: reminder() } })).approval_id).toBe(req.approval_id);
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "req-1", action: reminder({ amount_cents: 1 }) } }))).toMatch(/Conflict.*Nothing was saved/s);
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='flow'").get() as { n: number }).n).toBe(1);

    // Not approved yet: an outcome is refused.
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "early", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: new Date().toISOString() } }))).toMatch(/not approved.*Nothing was recorded/s);
    const pending = parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: req.approval_id } }));
    expect(pending).toMatchObject({ state: "pending", digest: req.digest, decided_at: null, outcome: null, action: { ...reminder(), currency: "EUR" } });

    // Täna: the pending approval leads "Ootab sinult" + footer link.
    const status = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
    expect(status).toContain("Sinult on täna vaja üht asja");
    expect(status).toContain(`href="/approvals/${req.approval_id}"`);
    expect(status).toContain('href="/approvals"');
    // The card: document title as H1, kind chip, recipient, EUR amount, period, escaped full content, digest (technical), the promise line.
    const card = await (await fetch(`${base}/approvals/${req.approval_id}`, { headers: { cookie: o.cookie } })).text();
    for (const s of ["Arve", "Synthetic Client OÜ", "billing@client.example", "1240,00\u00a0€", "oktoober 2026", "<h1 id=\"a-h\">Payment reminder: invoice 2026-014</h1>", "Reminder for overdue invoice 2026-014", req.digest, "Kinnita täpselt see", "Keeldu", "Assistent valmistas ette",
      "AI-hüppelaud ise ei saada, maksa ega esita midagi; seda teeb sinu assistent oma tööriistadega ja ainult täpselt selle sisuga."]) expect(card).toContain(s);
    // Besides the hidden form binding, the digest is shown only under Tehniline info.
    const visible = card.replace(`name="digest" value="${req.digest}"`, "");
    expect(visible.indexOf(req.digest)).toBeGreaterThan(visible.indexOf("Tehniline info"));
    expect(card).toMatch(/<pre[^>]*>Tere!\n\nInvoice 2026-014 \(€1,240.00\) is overdue. &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    expect(card).not.toContain("<script>alert(1)");
    expect(card).toMatch(/Kehtib 24 tundi, kuni (homme|täna) kella \d{2}:\d{2}-ni\./);
    expect(card).not.toMatch(/15 minutit|UTC/);
    const list = await (await fetch(`${base}/approvals`, { headers: { cookie: o.cookie } })).text();
    expect(list).toContain(`/approvals/${req.approval_id}`);

    // A stale card (wrong digest), a null Origin, a bad decision or a missing CSRF approve nothing.
    const stale = await decide(o, req.approval_id, { decision: "approve", digest: "0".repeat(64) });
    expect(stale.status).toBe(409);
    const staleHtml = await stale.text();
    expect(staleHtml).toContain("Midagi muutus pärast seda, kui kaardi avasid. Midagi ei kinnitatud. Ava kinnitus uuesti.");
    expect(staleHtml).toContain('<html lang="et">'); expect(staleHtml).toContain('href="/">Tagasi: Täna</a>');
    expect((await decide(o, req.approval_id, { decision: "approve", digest: req.digest }, "null")).status).toBe(403);
    expect((await decide(o, req.approval_id, { decision: "maybe", digest: req.digest })).status).toBe(400);
    expect((await decide({ ...o, csrf: "wrong" }, req.approval_id, { decision: "approve", digest: req.digest })).status).toBe(403);
    expect(row(req.approval_id).state).toBe("pending");

    const ok = await decide(o, req.approval_id, { decision: "approve", digest: req.digest });
    expect(ok.status).toBe(302); expect(ok.headers.get("location")).toBe(`/approvals/${req.approval_id}`);
    expect(row(req.approval_id).state).toBe("approved");
    expect((await decide(o, req.approval_id, { decision: "decline", digest: req.digest })).status).toBe(409);
    const decided = await (await fetch(`${base}/approvals/${req.approval_id}`, { headers: { cookie: o.cookie } })).text();
    expect(decided).not.toContain("Kinnita täpselt see"); expect(decided).toMatch(/✓ <\/span>Kinnitatud \d{2}:\d{2}/); expect(decided).toContain("Kinnitasin"); expect(decided).not.toMatch(/UTC/);
    const after = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
    expect(after).toContain("Täna pole sinult midagi vaja"); expect(after).toContain("Kinnitatud · ootab assistendi teadet");
    const approved = parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: req.approval_id } }));
    expect(approved.state).toBe("approved"); expect(approved.decided_at).toBeTruthy();

    // A changed payload digest saves nothing and says to request a new approval.
    const other = approvalDigest({ ...reminder({ amount_cents: 999 }), currency: "EUR" });
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-bad", approval_id: req.approval_id, digest: other, outcome: "sent", observed_at: new Date().toISOString() } }))).toMatch(/request a new approval.*Nothing was recorded/is);
    expect(row(req.approval_id)).toMatchObject({ state: "approved", outcome_json: null });

    const observed = "2026-10-29T10:00:00.000Z";
    const out = parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-1", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: observed, evidence_refs: ["gmail-message:synthetic-1"] } }));
    expect(out).toMatchObject({ state: "consumed", outcome: "sent", evidence_label: "assistant_reported", evidence_refs: ["gmail-message:synthetic-1"] });
    expect(row(req.approval_id).state).toBe("consumed");
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-1", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: observed, evidence_refs: ["gmail-message:synthetic-1"] } })).receipt_id).toBe(out.receipt_id);
    // One-use: a second action outcome cannot reopen or repeat it; only lifecycle advances.
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-2", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: observed } }))).toMatch(/Nothing was recorded/);
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-3", approval_id: req.approval_id, digest: req.digest, outcome: "submitted", observed_at: observed } }))).toMatch(/Nothing was recorded/);
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-4", approval_id: req.approval_id, digest: req.digest, outcome: "paid", observed_at: observed } })).outcome).toBe("paid");
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "o-5", approval_id: req.approval_id, digest: req.digest, outcome: "failed", observed_at: observed } }))).toMatch(/Nothing was recorded/);
    const final = parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: req.approval_id } }));
    expect(final.state).toBe("consumed");
    expect(final.outcome).toMatchObject({ outcome: "paid", evidence_label: "assistant_reported" });
    expect(final.outcome.history.map((h: { outcome: string }) => h.outcome)).toEqual(["sent", "paid"]);
    const consumedCard = await (await fetch(`${base}/approvals/${req.approval_id}`, { headers: { cookie: o.cookie } })).text();
    expect(consumedCard).not.toContain("Kinnita täpselt see"); expect(consumedCard).toContain("Assistent teatas"); expect(consumedCard).toContain("Sinu kinnitusi selles töös: 1.");
    expect(consumedCard.indexOf("receipt-head")).toBeLessThan(consumedCard.indexOf("Sinu kinnitusi selles töös"));

    // Activity: request, decision and outcomes; export carries approvals; delete removes them.
    const actions = (db.prepare("SELECT action FROM activity WHERE owner_id='flow'").all() as { action: string }[]).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["request_approval", "approval_decided", "record_action_outcome"]));
    const exp = await (await fetch(`${base}/export`, { headers: { cookie: o.cookie } })).json() as { approvals: { id: string; state: string }[] };
    expect(exp.approvals).toEqual([expect.objectContaining({ id: req.approval_id, state: "consumed" })]);
    await fetch(`${base}/delete`, { method: "POST", headers: { cookie: o.cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: `csrf=${o.csrf}` });
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='flow'").get() as { n: number }).n).toBe(0);
  });

  test("owners never see or act on each other's approvals", async () => {
    const a = owner("iso-a"), b = owner("iso-b");
    const ca = await client(a.token), cb = await client(b.token);
    const req = parsed(await ca.callTool({ name: "request_approval", arguments: { report_id: "same-id", action: reminder() } }));
    // The same report_id in another workspace is independent.
    const reqB = parsed(await cb.callTool({ name: "request_approval", arguments: { report_id: "same-id", action: reminder() } }));
    expect(reqB.approval_id).not.toBe(req.approval_id);
    expect(errText(await cb.callTool({ name: "get_approval", arguments: { approval_id: req.approval_id } }))).toMatch(/Unknown approval_id/);
    expect(errText(await cb.callTool({ name: "record_action_outcome", arguments: { report_id: "x", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: new Date().toISOString() } }))).toMatch(/Unknown approval_id.*Nothing was recorded/s);
    expect((await fetch(`${base}/approvals/${req.approval_id}`, { headers: { cookie: b.cookie } })).status).toBe(404);
    expect((await decide(b, req.approval_id, { decision: "approve", digest: req.digest })).status).toBe(404);
    expect(await (await fetch(`${base}/approvals`, { headers: { cookie: b.cookie } })).text()).not.toContain(req.approval_id);
    expect(row(req.approval_id).state).toBe("pending");
    expect(errText(await ca.callTool({ name: "get_approval", arguments: { approval_id: "appr_does-not-exist" } }))).toMatch(/Unknown approval_id/);
  });

  test("expired and declined approvals cannot be approved or acted on", async () => {
    const o = owner("exp");
    const c = await client(o.token);
    const e = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "e1", action: reminder() } }));
    db.prepare("UPDATE approvals SET expires_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z", e.approval_id);
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: e.approval_id } })).state).toBe("expired");
    const late = await decide(o, e.approval_id, { decision: "approve", digest: e.digest });
    expect(late.status).toBe(409); expect(await late.text()).toMatch(/aegunud.*Midagi ei kinnitatud/is);
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "e-o", approval_id: e.approval_id, digest: e.digest, outcome: "sent", observed_at: new Date().toISOString() } }))).toMatch(/expired.*Nothing was recorded/s);
    expect(await (await fetch(`${base}/approvals/${e.approval_id}`, { headers: { cookie: o.cookie } })).text()).not.toContain("Kinnita täpselt see");

    const d = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "d1", action: reminder({ kind: "send_message", amount_cents: undefined }) } }));
    expect((await decide(o, d.approval_id, { decision: "decline", digest: d.digest })).status).toBe(302);
    expect(row(d.approval_id)).toMatchObject({ state: "declined" });
    expect(row(d.approval_id).decided_at).toBeTruthy();
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "d-o", approval_id: d.approval_id, digest: d.digest, outcome: "sent", observed_at: new Date().toISOString() } }))).toMatch(/declined.*Nothing was recorded/s);
  });

  test("an approved but unused approval expires for acting; a consumed one keeps advancing after expiry", async () => {
    const o = owner("exp-approved");
    const c = await client(o.token);
    const a = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "ea1", action: reminder() } }));
    expect((await decide(o, a.approval_id, { decision: "approve", digest: a.digest })).status).toBe(302);
    db.prepare("UPDATE approvals SET expires_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z", a.approval_id);
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "ea-o", approval_id: a.approval_id, digest: a.digest, outcome: "sent", observed_at: new Date().toISOString() } })))
      .toBe("This approval expired before an outcome was recorded; request a new approval. Nothing was recorded.");
    expect(row(a.approval_id)).toMatchObject({ state: "expired", outcome_json: null });
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: a.approval_id } })).state).toBe("expired");
    const card = await (await fetch(`${base}/approvals/${a.approval_id}`, { headers: { cookie: o.cookie } })).text();
    expect(card).toMatch(/Aegunud/); expect(card).toMatch(/Kinnitasid/); expect(card).not.toContain("Kinnita täpselt see");

    const u = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "ea2", action: reminder() } }));
    await decide(o, u.approval_id, { decision: "approve", digest: u.digest });
    parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "eu-1", approval_id: u.approval_id, digest: u.digest, outcome: "sent", observed_at: new Date().toISOString() } }));
    db.prepare("UPDATE approvals SET expires_at=? WHERE id=?").run("2000-01-01T00:00:00.000Z", u.approval_id);
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "eu-2", approval_id: u.approval_id, digest: u.digest, outcome: "paid", observed_at: new Date().toISOString() } })).outcome).toBe("paid");
    expect(row(u.approval_id).state).toBe("consumed");
  });

  test("the first outcome must fit the action kind", async () => {
    const o = owner("first-outcome");
    const c = await client(o.token);
    const approve = async (id: string, action: Record<string, unknown>) => {
      const r = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: id, action } }));
      await decide(o, r.approval_id, { decision: "approve", digest: r.digest }); return r;
    };
    const call = (r: { approval_id: string; digest: string }, report_id: string, outcome: string) => c.callTool({ name: "record_action_outcome", arguments: { report_id, approval_id: r.approval_id, digest: r.digest, outcome, observed_at: new Date().toISOString() } });
    const m = await approve("m", reminder({ kind: "send_message", amount_cents: undefined }));
    expect(errText(await call(m, "m-paid", "paid"))).toBe("A send_message approval's first outcome must be sent or failed. Nothing was recorded.");
    expect(row(m.approval_id)).toMatchObject({ state: "approved", outcome_json: null });
    expect(parsed(await call(m, "m-sent", "sent")).outcome).toBe("sent");
    const p = await approve("p", reminder({ kind: "prepare_payment" }));
    expect(errText(await call(p, "p-sent", "sent"))).toMatch(/prepare_payment.*paid or failed\. Nothing was recorded/);
    expect(parsed(await call(p, "p-paid", "paid")).outcome).toBe("paid");
    const f = await approve("f", reminder({ kind: "prepare_filing", amount_cents: undefined }));
    expect(errText(await call(f, "f-paid", "paid"))).toMatch(/prepare_filing.*submitted or failed\. Nothing was recorded/);
    expect(parsed(await call(f, "f-failed", "failed")).outcome).toBe("failed");
    const i = await approve("i", reminder());
    expect(errText(await call(i, "i-submitted", "submitted"))).toMatch(/send_invoice.*sent or failed\. Nothing was recorded/);
  });

  test("a replayed request_approval reports the live state, not the stale creation state", async () => {
    const o = owner("replay");
    const c = await client(o.token);
    const first = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "r1", action: reminder() } }));
    const note = "Call get_approval before acting; current_state on replays is live.";
    expect(first).toMatchObject({ state: "pending", note });
    expect(first.current_state).toBeUndefined();
    await decide(o, first.approval_id, { decision: "approve", digest: first.digest });
    const replay = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "r1", action: reminder() } }));
    expect(replay).toEqual({ ...first, current_state: "approved", note });
  });

  test("caps, scope and the sharing stop switch refuse with nothing saved", async () => {
    const o = owner("caps");
    const c = await client(o.token);
    for (let i = 0; i < 20; i++) expect((await c.callTool({ name: "request_approval", arguments: { report_id: `p${i}`, action: reminder({ summary: `pending ${i}` }) } }) as { isError?: boolean }).isError).not.toBe(true);
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "p20", action: reminder() } }))).toMatch(/20 pending.*Nothing was saved/s);
    const now = new Date().toISOString();
    const ins = db.prepare("INSERT INTO approvals(id,owner_id,payload_json,digest,state,expires_at,created_at) VALUES(?,?,?,?,'declined',?,?)");
    for (let i = 0; i < 180; i++) ins.run(`appr_fill_${i}`, "caps", "{}", "x", now, now);
    db.prepare("UPDATE approvals SET state='declined' WHERE owner_id='caps' AND state='pending'").run();
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "p21", action: reminder() } }))).toMatch(/200.*Nothing was saved/s);
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='caps'").get() as { n: number }).n).toBe(200);

    const ro = owner("readonly", "progress:read");
    const cr = await client(ro.token);
    expect(errText(await cr.callTool({ name: "request_approval", arguments: { report_id: "r", action: reminder() } }))).toBe("The owner connected you read-only. Tell the owner: „Et saaksin seda sinu eest ette valmistada, ühenda mind AI-hüppelauaga uuesti ja luba nõusolekulehel töid ette valmistada.” When reconnecting, request the progress:report scope; the owner must allow it on the consent page. Nothing was saved and no approval was requested.");
    const off = owner("stopped", "progress:read,progress:report", 0);
    const cs = await client(off.token);
    expect(errText(await cs.callTool({ name: "request_approval", arguments: { report_id: "r", action: reminder() } }))).toMatch(/sharing is stopped.*Nothing was saved/s);
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id IN ('readonly','stopped')").get() as { n: number }).n).toBe(0);
  });
});

test("existing approvals table is migrated in place and legacy rows still load", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-approvals-"));
  try {
    const path = join(dir, "old.db");
    const old = new Database(path);
    old.exec("CREATE TABLE approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT)");
    old.prepare("INSERT INTO approvals VALUES('appr_legacy','legacy','{\"recipient\":\"Demo Supplier OÜ\",\"amount_cents\":1200,\"period\":\"2026-10\",\"document_ref\":\"inv-1\",\"synthetic\":true}','abc','approved_consumed','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')").run();
    old.close();
    const migrated = openDb(path);
    openDb(path).close(); // idempotent on a second open
    const cols = (migrated.prepare("PRAGMA table_info(approvals)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["kind", "report_id", "decided_at", "outcome_json"]));
    const now = new Date().toISOString();
    migrated.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('legacy','synthetic-legacy','google',1,?)").run(now);
    migrated.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('legacy','ws-legacy','Legacy')").run();
    migrated.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256("sess-legacy"), "legacy", "csrf-legacy", new Date(Date.now() + 60_000).toISOString());
    const lcfg: Config = { ...cfg, dbPath: path };
    const { app: lapp } = createApp(lcfg, migrated);
    const s = await new Promise<Server>((ok) => { const x = lapp.listen(0, "127.0.0.1", () => ok(x)); });
    const lbase = `http://127.0.0.1:${(s.address() as { port: number }).port}`; lcfg.baseUrl = lbase;
    try {
      const list = await fetch(`${lbase}/approvals`, { headers: { cookie: "lp_session=sess-legacy" } });
      expect(list.status).toBe(200); expect(await list.text()).toContain("Demo Supplier OÜ");
      const card = await fetch(`${lbase}/approvals/appr_legacy`, { headers: { cookie: "lp_session=sess-legacy" } });
      expect(card.status).toBe(200);
      const html = await card.text();
      expect(html).toContain("Demo Supplier OÜ"); expect(html).not.toContain("Kinnita täpselt see");
    } finally { await new Promise<void>((ok) => s.close(() => ok())); migrated.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
