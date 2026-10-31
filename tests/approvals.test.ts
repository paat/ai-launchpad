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
import { approvalDigest, canonicalJson, type ApprovalRow } from "../src/mcp.js";
import { approvalCardBody } from "../src/views.js";

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

test("the digest differs when only the recipient address differs (#35)", () => {
  const a = reminder();
  expect(approvalDigest(reminder({ recipient: { ...a.recipient, address: "billing@other.example" } }))).not.toBe(approvalDigest(a));
});

describe("approval cards over MCP", () => {
  test("send_message and send_invoice without a recipient address are rejected and nothing is saved (#35)", async () => {
    const o = owner("no-address");
    const c = await client(o.token);
    const message = reminder({ kind: "send_message", amount_cents: undefined });
    for (const [id, action] of [["m-none", { ...message, recipient: { name: "Synthetic Client OÜ" } }], ["m-blank", { ...message, recipient: { name: "Synthetic Client OÜ", address: "  " } }], ["i-none", reminder({ recipient: { name: "Synthetic Client OÜ" } })]] as const)
      expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: id, action } })), id).toContain("recipient.address is required for send_message and send_invoice");
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='no-address'").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT count(*) n FROM reports WHERE owner_id='no-address'").get() as { n: number }).n).toBe(0);
    // A filing names an authority, not an address; a message keeps amount_cents optional.
    expect(parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "f-ok", action: reminder({ kind: "prepare_filing", amount_cents: undefined, recipient: { name: "EMTA (e-MTA)" } }) } })).state).toBe("pending");
    expect(parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "m-ok", action: message } })).state).toBe("pending");
  });

  test("a legacy send approval without an address cannot be approved, on the card or by POST (#35)", async () => {
    const o = owner("legacy-address");
    const { address: _drop, ...recipient } = reminder().recipient;
    const payload = reminder({ kind: "send_message", amount_cents: undefined, recipient });
    db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at) VALUES(?,?,?,?,?,?,'pending',?,?)")
      .run("appr_no_address", "legacy-address", "send_message", "legacy-1", JSON.stringify(payload), approvalDigest(payload), new Date(Date.now() + 3600_000).toISOString(), new Date().toISOString());
    const card = await (await fetch(`${base}/approvals/appr_no_address`, { headers: { cookie: o.cookie } })).text();
    expect(card).toContain("Aadress puudub — seda kinnitust ei saa kasutada");
    expect(card).not.toContain("Kinnita täpselt see");
    expect(card).not.toContain('value="approve"');
    expect(card).toContain("Keeldu");
    const en = await (await fetch(`${base}/approvals/appr_no_address?lang=en`, { headers: { cookie: o.cookie } })).text();
    expect(en).toContain("Address missing — this approval cannot be used");
    const forced = await decide(o, "appr_no_address", { decision: "approve", digest: approvalDigest(payload) });
    expect(forced.status).toBe(409);
    expect(await forced.text()).toContain("Aadress puudub — seda kinnitust ei saa kasutada. Midagi ei kinnitatud.");
    expect(row("appr_no_address")).toMatchObject({ state: "pending", decided_at: null });
    // The owner can still clear it by declining.
    expect((await decide(o, "appr_no_address", { decision: "decline", digest: approvalDigest(payload) })).status).toBe(302);
    expect(row("appr_no_address").state).toBe("declined");
  });

  test("an already-approved legacy send without an address is not usable and takes no outcome (#35)", async () => {
    const o = owner("legacy-approved");
    const c = await client(o.token);
    const { address: _drop, ...recipient } = reminder().recipient;
    const payload = reminder({ kind: "send_message", amount_cents: undefined, recipient });
    const digest = approvalDigest(payload);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,decided_at) VALUES(?,?,?,?,?,?,'approved',?,?,?)")
      .run("appr_approved_no_address", "legacy-approved", "send_message", "legacy-2", JSON.stringify(payload), digest, new Date(Date.now() + 3600_000).toISOString(), now, now);
    const got = parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: "appr_approved_no_address" } }));
    expect(got).toMatchObject({ state: "approved", usable: false, reason: "Address missing: request a new approval that includes the recipient address" });
    for (const outcome of ["sent", "failed"])
      expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: `la-${outcome}`, approval_id: "appr_approved_no_address", digest, outcome, observed_at: now } }))).toBe("Address missing: request a new approval that includes the recipient address. Nothing was recorded.");
    expect(row("appr_approved_no_address")).toMatchObject({ state: "approved", outcome_json: null, consumed_at: null });
  });

  test("request → owner approves exact card → outcome with identical digest; one-use lifecycle", async () => {
    const o = owner("flow");
    const c = await client(o.token);
    expect((await c.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(["request_approval", "get_approval", "record_action_outcome"]));
    const started = parsed(await c.callTool({ name: "get_started", arguments: {} }));
    expect(started.tools).toEqual(expect.arrayContaining(["request_approval", "get_approval", "record_action_outcome"]));
    expect(started.approvals_note).toContain("act only when get_approval returns approved (and usable is not false)");

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
    for (const s of ["Arve", "Synthetic Client OÜ", "billing@client.example", "1240,00\u00a0€", "oktoober 2026", "Payment reminder", "<h1 id=\"a-h\">Invoice 2026-014 · Synthetic Client OÜ</h1>", "Reminder for overdue invoice 2026-014", req.digest, "Kinnita täpselt see", "Keeldu", "Assistent valmistas ette",
      "AI-hüppelaud ise ei saada, maksa ega esita midagi; seda teeb sinu assistent oma tööriistadega ja ainult täpselt selle sisuga."]) expect(card).toContain(s);
    // Besides the hidden form binding, the digest is shown only under Tehniline info.
    const visible = card.replace(`name="digest" value="${req.digest}"`, "");
    expect(visible.indexOf(req.digest)).toBeGreaterThan(visible.indexOf("Tehniline info"));
    expect(card).toMatch(/<pre[^>]*>Tere!\n\nInvoice 2026-014 \(€1,240.00\) is overdue. &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    expect(card).not.toContain("<script>alert(1)");
    expect(card).toMatch(/Kehtib 24 tundi, kuni (homme|täna) kella \d{2}:\d{2}\u2011ni\./);
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
    expect(decided).not.toContain("Kinnita täpselt see"); expect(decided).toMatch(/<span class="stamp" aria-hidden="true">.*<\/span><h1 class="receipt-head" id="a-h">Kinnitatud \d{2}:\d{2}<\/h1>/); expect(decided).toContain("Kinnitasin"); expect(decided).not.toMatch(/UTC/);
    const after = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
    expect(after).toContain("Täna pole sinult midagi vaja"); expect(after).toContain("Pooleli · ootab assistendi teadet");
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

    // Tehtud rows name their object, and the time never runs into the verb (QA D-15, D-17).
    const tehtud = await (await fetch(`${base}/activity`, { headers: { cookie: o.cookie } })).text();
    const main = tehtud.slice(0, tehtud.indexOf('<details class="tech-details">'));
    for (const verb of ["Sina kinnitasid", "Assistent valmistas töö ette ja palus sinu kinnitust", "Assistent teatas, mis kinnitatud tööga juhtus"]) expect(main).toMatch(new RegExp(`<strong>${verb}</strong><br><span>Payment reminder: invoice 2026-014 · Synthetic Client OÜ</span>`));
    expect(main).not.toMatch(/<\/strong><span class="small muted"><time/);
    // The approvals history marks synthetic data only for a demo owner.
    expect(await (await fetch(`${base}/approvals`, { headers: { cookie: o.cookie } })).text()).not.toContain(": demo");
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
    expect(replay).toEqual({ ...first, state: "approved", current_state: "approved", note });
  });

  test("a replay of a still-pending request keeps pending and the owner instruction (tribunal T-001)", async () => {
    const c = await client(owner("replay-pending").token);
    const first = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "rp1", action: reminder() } }));
    const replay = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "rp1", action: reminder() } }));
    expect(replay).toMatchObject({ approval_id: first.approval_id, state: "pending", current_state: "pending", owner_instruction: first.owner_instruction });
    expect(JSON.stringify(replay)).not.toContain("new request_approval");
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

test("startup expires actionable legacy no-address sends; consumed rows untouched; idempotent (#35)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-approvals-"));
  try {
    const path = join(dir, "legacy-address.db");
    const seed = openDb(path);
    const { address: _drop, ...recipient } = reminder().recipient;
    const insert = seed.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,consumed_at) VALUES(?,'legacy',?,?,?,'d',?,?,?,?)");
    const later = new Date(Date.now() + 3600_000).toISOString(), now = new Date().toISOString();
    insert.run("appr_la_approved", "send_message", "la-1", JSON.stringify(reminder({ kind: "send_message", recipient })), "approved", later, now, null);
    insert.run("appr_la_pending", "send_invoice", "la-2", JSON.stringify(reminder({ recipient: { ...recipient, address: "  " } })), "pending", later, now, null);
    insert.run("appr_la_consumed", "send_message", "la-3", JSON.stringify(reminder({ kind: "send_message", recipient })), "consumed", later, now, now);
    insert.run("appr_la_ok", "send_invoice", "la-4", JSON.stringify(reminder()), "approved", later, now, null);
    // Whitespace that JS trim() strips must count as blank in SQL too.
    for (const [i, address] of ["\t\n ", "  ﻿"].entries())
      for (const state of ["pending", "approved"])
        insert.run(`appr_la_ws_${state}_${i}`, "send_message", `la-ws-${state}-${i}`, JSON.stringify(reminder({ kind: "send_message", recipient: { ...recipient, address } })), state, later, now, null);
    seed.close();
    const states = () => { const d = openDb(path); try { return Object.fromEntries((d.prepare("SELECT id,state FROM approvals ORDER BY id").all() as { id: string; state: string }[]).map((r) => [r.id, r.state])); } finally { d.close(); } };
    const expected = { appr_la_approved: "expired", appr_la_pending: "expired", appr_la_consumed: "consumed", appr_la_ok: "approved", appr_la_ws_pending_0: "expired", appr_la_ws_approved_0: "expired", appr_la_ws_pending_1: "expired", appr_la_ws_approved_1: "expired" };
    expect(states()).toEqual(expected);
    expect(states()).toEqual(expected); // a second init changes nothing
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("startup expires a no-address send in the pre-kind schema, same on a second open (#35)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-approvals-"));
  try {
    const path = join(dir, "pre-kind.db");
    const old = new Database(path);
    old.exec("CREATE TABLE approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT)");
    const { address: _drop, ...recipient } = reminder().recipient;
    const at = new Date().toISOString();
    old.prepare("INSERT INTO approvals VALUES('appr_pre_kind','legacy',?,'d','pending',?,?,NULL)").run(JSON.stringify(reminder({ kind: "send_message", amount_cents: undefined, recipient })), new Date(Date.now() + 3600_000).toISOString(), at);
    old.close();
    const state = () => { const d = openDb(path); try { return (d.prepare("SELECT state FROM approvals WHERE id='appr_pre_kind'").get() as { state: string }).state; } finally { d.close(); } };
    expect(state()).toBe("expired");
    expect(state()).toBe("expired");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("startup expires a send whose lone address is any JS-whitespace code point, same on a second open (#35)", () => {
  const dir = mkdtempSync(join(tmpdir(), "lp-approvals-"));
  try {
    const path = join(dir, "ws-set.db");
    const cps = [9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279];
    const seed = openDb(path);
    const { address: _drop, ...recipient } = reminder().recipient;
    const insert = seed.prepare("INSERT INTO approvals(id,owner_id,kind,report_id,payload_json,digest,state,expires_at,created_at,consumed_at) VALUES(?,'legacy','send_message',?,?,'d','pending',?,?,NULL)");
    const later = new Date(Date.now() + 3600_000).toISOString(), now = new Date().toISOString();
    for (const cp of cps) {
      expect(String.fromCodePoint(cp).trim(), String(cp)).toBe("");
      insert.run(`appr_cp_${cp}`, `cp-${cp}`, JSON.stringify(reminder({ kind: "send_message", recipient: { ...recipient, address: String.fromCodePoint(cp) } })), later, now);
    }
    seed.close();
    for (let pass = 0; pass < 2; pass++) {
      const d = openDb(path);
      try {
        for (const cp of cps) expect((d.prepare("SELECT state FROM approvals WHERE id=?").get(`appr_cp_${cp}`) as { state: string }).state, `U+${cp.toString(16)} pass ${pass}`).toBe("expired");
      } finally { d.close(); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// tribunal T-001: assistant-supplied text never renders as markup on Täna, Tehtud or the approval pages.
const XSS = "<img src=x onerror=alert(1)>";
const pageOf = async (o: { cookie: string }, path: string) => { const r = await fetch(`${base}${path}`, { headers: { cookie: o.cookie } }); expect(r.status, path).toBe(200); return r.text(); };
const inert = (html: string, path: string) => { expect(html, path).toContain("&lt;img src=x onerror=alert(1)&gt;"); expect(html, path).not.toContain("<img src=x"); };
test("report_assessment executor, label, reason, company_label and next_action render escaped on Täna and Tehtud (tribunal T-001)", async () => {
  const o = owner("xss-assessment");
  const c = await client(o.token);
  const assessment = {
    assessed_domains: ["money"], company_label: XSS, gaps: [XSS], conclusion: XSS,
    responsibilities: [{ id: "invoicing", domain: "money", label: XSS, applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: XSS, access: "Owner-granted access", success_criterion: "Invoices drafted", next_checkpoint: "Next run", reason: XSS, evidence_refs: [] }],
    next_action: { title: XSS, rationale: XSS, estimated_effort_saved: XSS, uncertainty: XSS, needs_owner: true },
  };
  expect(parsed(await c.callTool({ name: "report_assessment", arguments: { report_id: "xss-1", expected_version: 0, assessment } })).version).toBe(1);
  expect(parsed(await c.callTool({ name: "report_progress", arguments: { report_id: "xss-p", task_id: "invoicing", expected_version: 1, observed_at: new Date().toISOString(), milestone: "draft_prepared" } })).receipt_id).toBeTruthy();
  const tana = await pageOf(o, "/");
  expect(tana).toContain(`teeb &lt;img src=x onerror=alert(1)&gt; (assistendi hinnang)`);
  for (const path of ["/", "/activity"]) inert(path === "/" ? tana : await pageOf(o, path), path);
});
test("an approval document title and recipient render escaped on Täna, Tehtud and the approval pages (tribunal T-001)", async () => {
  const o = owner("xss-approval");
  const c = await client(o.token);
  const req = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "xss-a", action: reminder({ document: { title: XSS, content: "Tere!" }, recipient: { name: XSS, address: "billing@client.example" } }) } }));
  for (const path of ["/", "/activity", "/approvals", `/approvals/${req.approval_id}`]) inert(await pageOf(o, path), path);
});

test("Täna shows a pending approval behind 60 newer consumed ones; counts and primary button use every pending one (tribunal T-003)", async () => {
  const o = owner("many-done");
  const ins = db.prepare("INSERT INTO approvals(id,owner_id,kind,payload_json,digest,state,expires_at,created_at,decided_at,consumed_at,outcome_json) VALUES(?,?,'send_invoice',?,?,?,?,?,?,?,?)");
  const later = new Date(Date.now() + 3600_000).toISOString(), t0 = Date.now() - 3600_000;
  ins.run("appr_old_pending", "many-done", JSON.stringify(reminder({ document: { title: "Oldest pending reminder", content: "Tere!" } })), "d".repeat(64), "pending", later, new Date(t0).toISOString(), null, null, null);
  for (let i = 0; i < 60; i++) {
    const at = new Date(t0 + (i + 1) * 1000).toISOString();
    ins.run(`appr_done_${i}`, "many-done", JSON.stringify(reminder({ document: { title: `Done ${i}`, content: "Tere!" } })), `${i}`.padStart(64, "0"), "consumed", later, at, at, at, JSON.stringify({ outcome: "sent", observed_at: at }));
  }
  const html = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
  expect(html).toContain("Oldest pending reminder");
  expect(html).toContain('<h2 id="ootab-h">Ootab sinult (1)</h2>');
  expect(html).toContain('<a class="needs" href="#ootab"><b>1</b>');
  expect(html).toContain('<a class="btn" href="/approvals/appr_old_pending">Vaata kinnitust</a>');
});

test("the receipt stepper treats accepted, rejected and paid as terminal for sends (#37 item 1)", () => {
  const at = "2026-10-29T10:00:00.000Z";
  const card = (kind: string, outcomes: string[]) => {
    const history = outcomes.map((outcome) => ({ outcome, observed_at: at, recorded_at: at }));
    const a: ApprovalRow = { id: "appr_s", kind, report_id: "r", payload_json: JSON.stringify(reminder({ kind })), digest: "d".repeat(64), state: "consumed", expires_at: at, created_at: at, decided_at: at, consumed_at: at, outcome_json: JSON.stringify({ ...history[history.length - 1], history }) };
    return approvalCardBody({ csrf: "c", a, lang: "et", sample: false, now: new Date(at) });
  };
  for (const kind of ["send_message", "send_invoice"]) {
    const accepted = card(kind, ["sent", "accepted"]);
    expect(accepted, kind).toMatch(/state-step--done"><span class="state-mark" aria-hidden="true">✓<\/span><span class="state-text">Vastu võetud/);
    expect(accepted, kind).not.toContain("Makstud: ootab");
    expect(accepted, kind).not.toContain('aria-current="step"');
    const rejected = card(kind, ["sent", "rejected"]);
    expect(rejected, kind).toMatch(/state-step--stop"><span class="state-mark" aria-hidden="true">✕<\/span><span class="state-text">Tagasi lükatud/);
    expect(rejected, kind).not.toContain("Makstud: ootab");
    expect(rejected, kind).not.toContain('aria-current="step"');
    const paid = card(kind, ["sent", "paid"]);
    expect(paid, kind).toMatch(/state-step--done"><span class="state-mark" aria-hidden="true">✓<\/span><span class="state-text">Makstud/);
    expect(paid, kind).not.toContain('aria-current="step"');
    // Only sent: the follow-up is still open.
    expect(card(kind, ["sent"]), kind).toMatch(/<li class="state-step state-step--todo" aria-current="step"><span class="state-mark" aria-hidden="true"><\/span><span class="state-text">Makstud: ootab/);
  }
});

test("Täna keeps an old failed or rejected approval in Ootab sinult behind 60 newer done ones (#37 item 3)", async () => {
  const o = owner("old-failed");
  const ins = db.prepare("INSERT INTO approvals(id,owner_id,kind,payload_json,digest,state,expires_at,created_at,decided_at,consumed_at,outcome_json) VALUES(?,?,'send_invoice',?,?,'consumed',?,?,?,?,?)");
  const later = new Date(Date.now() + 3600_000).toISOString(), t0 = Date.now() - 3600_000;
  const old = new Date(t0).toISOString();
  ins.run("appr_old_failed", "old-failed", JSON.stringify(reminder({ document: { title: "Old failed reminder", content: "Tere!" } })), "f".repeat(64), later, old, old, old, JSON.stringify({ outcome: "failed", observed_at: old }));
  ins.run("appr_old_rejected", "old-failed", JSON.stringify(reminder({ document: { title: "Old rejected reminder", content: "Tere!" } })), "e".repeat(64), later, old, old, old, JSON.stringify({ outcome: "rejected", observed_at: old }));
  for (let i = 0; i < 60; i++) {
    const at = new Date(t0 + (i + 1) * 1000).toISOString();
    ins.run(`appr_newer_${i}`, "old-failed", JSON.stringify(reminder({ document: { title: `Newer ${i}`, content: "Tere!" } })), `${i}`.padStart(64, "1"), later, at, at, at, JSON.stringify({ outcome: "sent", observed_at: at }));
  }
  const html = await (await fetch(`${base}/`, { headers: { cookie: o.cookie } })).text();
  expect(html).toContain('<h2 id="ootab-h">Ootab sinult (2)</h2>');
  expect(html).toContain('href="/approvals/appr_old_failed"');
  expect(html).toContain('href="/approvals/appr_old_rejected"');
  expect(html.match(/Ei õnnestunud — vaata üle/g)).toHaveLength(2);
});

describe("standing approvals (#45)", () => {
  const post = (o: { cookie: string; csrf: string }, path: string, body: Record<string, string>, origin: string | null = base) =>
    fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { cookie: o.cookie, "content-type": "application/x-www-form-urlencoded", ...(origin === null ? {} : { origin }) }, body: new URLSearchParams({ csrf: o.csrf, ...body }) });
  const html = async (o: { cookie: string }, path: string) => (await fetch(`${base}${path}`, { headers: { cookie: o.cookie } })).text();
  const rules = (ownerId: string) => db.prepare("SELECT * FROM standing_approvals WHERE owner_id=? ORDER BY created_at").all(ownerId) as Record<string, string | number | null>[];
  const audit = (ownerId: string) => db.prepare("SELECT * FROM activity WHERE owner_id=? AND action='standing_auto_approved'").all(ownerId) as Record<string, string>[];
  /** The owner approves one reminder on its card, then allows similar ones from the card. */
  async function ruleFromCard(id: string, scope: "recipient" | "any" = "recipient", max_eur = "2000") {
    const o = owner(id), c = await client(o.token);
    const first = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: `${id}-first`, action: reminder() } }));
    expect((await decide(o, first.approval_id, { decision: "approve", digest: first.digest })).status).toBe(302);
    const card = await html(o, `/approvals/${first.approval_id}`);
    expect(card).toContain("Luba edaspidi sarnased automaatselt");
    expect(card).toContain('value="2000"');
    const made = await post(o, "/standing-approvals", { approval_id: first.approval_id, scope, max_eur });
    expect(made.status).toBe(302);
    expect(made.headers.get("location")).toBe(`/approvals/${first.approval_id}#pusiluba`);
    return { o, c, first, rule: rules(id)[0] };
  }
  let n = 0;
  const ask = async (c: Client, action: Record<string, unknown>) => parsed(await c.callTool({ name: "request_approval", arguments: { report_id: `std-${++n}`, action } }));

  test("a rule from the card auto-approves the next matching send: approved at once, audited, named on Täna, Tehtud and the card", async () => {
    const { o, c, first, rule } = await ruleFromCard("std-match");
    expect(rule).toMatchObject({ kind: "send_invoice", recipients_json: JSON.stringify(["billing@client.example"]), max_amount_cents: 200_000, max_per_day: 10, revoked_at: null });
    expect(Date.parse(String(rule.expires_at)) - Date.now()).toBeGreaterThan(89.9 * 86_400_000);
    // The card now says the rule exists instead of offering it again.
    expect(await html(o, `/approvals/${first.approval_id}`)).toContain("Püsiluba on olemas: Arved: billing@client.example, kuni 2000");

    const next = reminder({ amount_cents: 99_000, recipient: { name: "Synthetic Client OÜ", address: " Billing@Client.example " }, document: { title: "Payment reminder: invoice 2026-015", content: "Tere!" } });
    const r = await ask(c, next);
    expect(r).toMatchObject({ state: "approved", auto_approved: true, approved_by_rule: rule.id, digest: approvalDigest({ ...next, currency: "EUR" }) });
    expect(r.rule_name).toMatch(/^Arved: billing@client\.example, kuni 2000/);
    expect(r.assistant_instruction).toContain("Proceed without asking the owner again");
    expect(row(r.approval_id)).toMatchObject({ state: "approved", approved_by_rule: rule.id });
    expect(row(r.approval_id).decided_at).toBeTruthy();
    // One audit row names the rule and the digest.
    const log = audit("std-match");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: "launchpad", outcome: "ok" });
    expect(log[0].summary).toContain(`standing rule ${rule.id}`);
    expect(log[0].summary).toContain(`digest ${r.digest.slice(0, 12)}`);
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: r.approval_id } }))).toMatchObject({ state: "approved", auto_approved: true, approved_by_rule: rule.id });

    expect(await html(o, "/")).toContain("Püsiloaga: Arved: billing@client.example");
    expect(await html(o, "/?lang=en")).toContain("Standing approval: Invoices to billing@client.example");
    const card = await html(o, `/approvals/${r.approval_id}?lang=et`);
    expect(card).toContain("Kinnitatud püsiloaga „Arved: billing@client.example");
    expect(card).not.toContain("Luba edaspidi sarnased automaatselt");
    expect(card).not.toContain('value="approve"');

    // The exact digest still binds the outcome.
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "std-out", approval_id: r.approval_id, digest: r.digest, outcome: "sent", observed_at: new Date().toISOString() } })).state).toBe("consumed");
    const done = await html(o, "/activity");
    expect(done).toContain("Assistent saatis püsiloa alusel:");
    expect(done).toContain("Sina andsid püsiloa");
    expect(done).toContain("Püsiluba kinnitas assistendi töö");
    expect(await html(o, "/activity?lang=en")).toContain("Your assistant sent under a standing approval:");
    // A replay returns the same auto-approved receipt with the live state.
    expect(parsed(await c.callTool({ name: "request_approval", arguments: { report_id: `std-${n}`, action: next } }))).toMatchObject({ approval_id: r.approval_id, auto_approved: true, current_state: "consumed" });
  });

  test("a replay after the outcome is recorded is no longer approved and says do not send (tribunal T-001)", async () => {
    const { c } = await ruleFromCard("std-replay");
    const action = reminder({ summary: "replay once sent" });
    const r = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "std-replay-1", action } }));
    expect(r).toMatchObject({ state: "approved", auto_approved: true });
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "std-replay-out", approval_id: r.approval_id, digest: r.digest, outcome: "sent", observed_at: new Date().toISOString() } })).state).toBe("consumed");
    const replay = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "std-replay-1", action } }));
    expect(replay).toMatchObject({ approval_id: r.approval_id, state: "consumed", current_state: "consumed" });
    expect(replay.assistant_instruction).toBe("This approval is consumed. Do not send, pay or file anything for it. If the owner still wants this done, make a new request_approval with a new report_id.");
    expect(replay.owner_instruction).toBeUndefined();
  });

  test("revoking a rule expires its approved, unused approvals; a recorded outcome stays (tribunal T-002)", async () => {
    const { o, c, rule } = await ruleFromCard("std-revoke-open");
    const open = await ask(c, reminder({ summary: "still unsent" }));
    const done = await ask(c, reminder({ summary: "already sent" }));
    expect(parsed(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "std-revoke-out", approval_id: done.approval_id, digest: done.digest, outcome: "sent", observed_at: new Date().toISOString() } })).state).toBe("consumed");
    expect((await post(o, "/standing-approvals/revoke", { rule_id: String(rule.id) })).status).toBe(302);
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: open.approval_id } })).state).toBe("expired");
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "std-revoke-late", approval_id: open.approval_id, digest: open.digest, outcome: "sent", observed_at: new Date().toISOString() } }))).toContain("expired");
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: done.approval_id } })).state).toBe("consumed");
    expect(db.prepare("SELECT summary FROM activity WHERE owner_id=? AND action='standing_rule_revoked'").get("std-revoke-open")).toMatchObject({ summary: expect.stringContaining("1 approved, unused approval expired") });
  });

  test("over the cap, a new recipient (scoped rule), the daily limit, expiry and revocation each fall back to a pending card", async () => {
    const { o, c, rule } = await ruleFromCard("std-limits");
    // Cap: one cent over waits for the owner; exactly the cap passes.
    expect(await ask(c, reminder({ amount_cents: 200_001 }))).toMatchObject({ state: "pending" });
    expect((await ask(c, reminder({ amount_cents: 200_000 }))).auto_approved).toBe(true);
    // A recipient the owner never approved.
    const stranger = await ask(c, reminder({ recipient: { name: "New Client OÜ", address: "ap@new.example" } }));
    expect(stranger.state).toBe("pending");
    expect(stranger.auto_approved).toBeUndefined();
    // A message is another kind: the invoice rule does not cover it.
    expect((await ask(c, reminder({ kind: "send_message" }))).state).toBe("pending");
    // Daily limit 10: the first auto-approval above counts; nine more pass, the eleventh waits.
    for (let i = 0; i < 9; i++) expect((await ask(c, reminder({ summary: `daily ${i}` }))).auto_approved, `#${i}`).toBe(true);
    expect((await ask(c, reminder({ summary: "daily 10" }))).state).toBe("pending");
    expect(audit("std-limits")).toHaveLength(10);
    // Expiry.
    db.prepare("UPDATE approvals SET created_at=? WHERE approved_by_rule=?").run(new Date(Date.now() - 25 * 3600_000).toISOString(), rule.id);
    expect((await ask(c, reminder({ summary: "after a day" }))).auto_approved).toBe(true);
    db.prepare("UPDATE standing_approvals SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), rule.id);
    expect((await ask(c, reminder({ summary: "expired rule" }))).state).toBe("pending");
    db.prepare("UPDATE standing_approvals SET expires_at=? WHERE id=?").run(new Date(Date.now() + 86_400_000).toISOString(), rule.id);
    expect((await ask(c, reminder({ summary: "renewed rule" }))).auto_approved).toBe(true);
    // Revocation on Ühendus stops it immediately.
    const page = await html(o, "/uhenda");
    expect(page).toContain('id="pusiload"');
    expect(page).toContain("Arved: billing@client.example, kuni 2000");
    expect(page).toContain(`name="rule_id" value="${rule.id}"`);
    expect(page).toContain(">Lõpeta</button>");
    expect(await html(o, "/uhenda?lang=en")).toContain("Standing approvals (1)");
    expect((await post(o, "/standing-approvals/revoke", { rule_id: String(rule.id) })).headers.get("location")).toBe("/uhenda#pusiload");
    expect(rules("std-limits")[0].revoked_at).toBeTruthy();
    expect((await ask(c, reminder({ summary: "after revoke" }))).state).toBe("pending");
    expect(await html(o, "/uhenda")).toContain("Püsiload puuduvad");
    expect(await html(o, "/activity")).toContain("Sina lõpetasid püsiloa");
  });

  test("an 'any recipient' rule covers new recipients but never filings or payments, even a forged rule row", async () => {
    const { o, c } = await ruleFromCard("std-any", "any", "5000");
    expect(rules("std-any")[0]).toMatchObject({ recipients_json: null, max_amount_cents: 500_000 });
    expect((await ask(c, reminder({ recipient: { name: "New Client OÜ", address: "ap@new.example" } }))).auto_approved).toBe(true);
    const now = new Date().toISOString(), later = new Date(Date.now() + 86_400_000).toISOString();
    for (const kind of ["prepare_payment", "prepare_filing"]) db.prepare("INSERT INTO standing_approvals(id,owner_id,kind,recipients_json,max_amount_cents,max_per_day,expires_at,created_at) VALUES(?,?,?,NULL,999999999,99,?,?)").run(`rule_forged_${kind}`, "std-any", kind, later, now);
    expect(await ask(c, reminder({ kind: "prepare_payment", recipient: { name: "Synthetic Client OÜ" } }))).toMatchObject({ state: "pending" });
    expect(await ask(c, reminder({ kind: "prepare_filing", amount_cents: undefined, recipient: { name: "EMTA (e-MTA)" } }))).toMatchObject({ state: "pending" });
    // Nor can the owner create one.
    for (const kind of ["prepare_payment", "prepare_filing"]) expect((await post(o, "/standing-approvals", { kind, scope: "any", max_eur: "2000" })).status, kind).toBe(400);
    expect(rules("std-any")).toHaveLength(3);
  });

  test("Ühendus creates a rule for already-approved recipients or any; the card offer is only for owner-approved sends", async () => {
    const o = owner("std-uhendus"), c = await client(o.token);
    const html0 = await html(o, "/uhenda");
    expect(html0).toContain("Lisa püsiluba");
    expect(html0).toContain("Kui assistent küsib tööriista luba, vali ‚Always allow' — AI-hüppelaud ise ei saada midagi; sind seob ainult kinnitus või sinu püsiluba.");
    // No approved recipients yet: the scoped rule would cover nobody.
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", max_eur: "2000" })).status).toBe(409);
    const msg = reminder({ kind: "send_message" });
    const first = await ask(c, msg);
    expect(await html(o, `/approvals/${first.approval_id}`)).not.toContain("Luba edaspidi sarnased automaatselt");
    // Not from a pending or declined card either.
    expect((await post(o, "/standing-approvals", { approval_id: first.approval_id, scope: "any", max_eur: "2000" })).status).toBe(404);
    await decide(o, first.approval_id, { decision: "approve", digest: first.digest });
    for (const bad of [{ max_eur: "0" }, { max_eur: "abc" }, { max_eur: "2000", extra: "1" }, { max_eur: "2000", scope: "everyone" }])
      expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", ...bad })).status, JSON.stringify(bad)).toBe(400);
    expect(rules("std-uhendus")).toHaveLength(0);
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", max_eur: "1 500,50" })).headers.get("location")).toBe("/uhenda#pusiload");
    expect(rules("std-uhendus")[0]).toMatchObject({ kind: "send_message", recipients_json: JSON.stringify(["billing@client.example"]), max_amount_cents: 150_050 });
    expect((await ask(c, reminder({ kind: "send_message", summary: "again" }))).auto_approved).toBe(true);
    // A message without an amount cannot be checked against the cap, so the owner decides (tribunal T-003).
    expect((await ask(c, reminder({ kind: "send_message", amount_cents: undefined, summary: "no amount" }))).state).toBe("pending");
  });

  test("„only past recipients” draws from reminder sends, not an untagged thank-you note (tribunal T-003)", async () => {
    const o = owner("std-thanks"), c = await client(o.token);
    const thanks = await ask(c, reminder({ kind: "send_message", recipient: { name: "Uus Klient OÜ", address: "info@uus-klient.example" }, document: { title: "Aitäh koostöö eest", content: "Tere!" }, summary: "Thank-you note" }));
    await decide(o, thanks.approval_id, { decision: "approve", digest: thanks.digest });
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", max_eur: "300" })).status).toBe(409);
    const real = await ask(c, reminder({ kind: "send_message" }));
    await decide(o, real.approval_id, { decision: "approve", digest: real.digest });
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", max_eur: "300" })).status).toBe(302);
    expect(rules("std-thanks")[0]).toMatchObject({ recipients_json: JSON.stringify(["billing@client.example"]) });
  });

  test("create and revoke need the CSRF token and the exact Origin; another owner cannot revoke", async () => {
    const { o, first, rule } = await ruleFromCard("std-csrf");
    for (const [path, body] of [["/standing-approvals", { approval_id: first.approval_id, scope: "any", max_eur: "2000" }], ["/standing-approvals/revoke", { rule_id: String(rule.id) }]] as const) {
      expect((await post({ ...o, csrf: "wrong" }, path, body)).status, path).toBe(403);
      expect((await post(o, path, body, "https://evil.example")).status, path).toBe(403);
      expect((await post(o, path, body, "null")).status, path).toBe(403);
    }
    expect(rules("std-csrf")).toHaveLength(1);
    const other = owner("std-csrf-other");
    expect((await post(other, "/standing-approvals/revoke", { rule_id: String(rule.id) })).status).toBe(302);
    expect((await post(other, "/standing-approvals", { approval_id: first.approval_id, scope: "any", max_eur: "2000" })).status).toBe(404);
    expect(rules("std-csrf")[0].revoked_at).toBeNull();
    expect(rules("std-csrf-other")).toHaveLength(0);
  });
});

describe("playbook_id on approvals („Käest ära”, #61)", () => {
  const post = (o: { cookie: string; csrf: string }, path: string, body: Record<string, string>) =>
    fetch(`${base}${path}`, { method: "POST", redirect: "manual", headers: { cookie: o.cookie, "content-type": "application/x-www-form-urlencoded", origin: base }, body: new URLSearchParams({ csrf: o.csrf, ...body }) });
  const page = async (o: { cookie: string }, path: string) => (await fetch(`${base}${path}`, { headers: { cookie: o.cookie } })).text();
  const msg = (extra: Record<string, unknown> = {}) => reminder({ kind: "send_message", amount_cents: 24000, ...extra });

  test("request_approval stores an optional playbook_id in both branches and get_approval echoes it; unknown or mismatched ids save nothing", async () => {
    const o = owner("pb"), c = await client(o.token);
    const plain = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "pb-1", action: msg() } }));
    expect(row(plain.approval_id).playbook_id).toBeNull();
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: plain.approval_id } })).playbook_id).toBeNull();
    const tagged = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "pb-2", action: msg({ summary: "tagged" }), playbook_id: "payment-reminder" } }));
    expect(row(tagged.approval_id).playbook_id).toBe("payment-reminder");
    expect(parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: tagged.approval_id } })).playbook_id).toBe("payment-reminder");
    const before = (db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='pb'").get() as { n: number }).n;
    expect((await c.callTool({ name: "request_approval", arguments: { report_id: "pb-3", action: msg(), playbook_id: "made-up" } }) as { isError?: boolean }).isError).toBe(true);
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "pb-4", action: msg(), playbook_id: "vat-return-prep" } }))).toMatch(/prepares action kind prepare_filing, not send_message\. Nothing was saved/);
    expect(errText(await c.callTool({ name: "request_approval", arguments: { report_id: "pb-5", action: msg(), playbook_id: "deadlines-check" } }))).toMatch(/needs no approval/);
    expect((db.prepare("SELECT count(*) n FROM approvals WHERE owner_id='pb'").get() as { n: number }).n).toBe(before);
    // Auto-approved under a standing rule: stored too.
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "any", max_eur: "2000" })).status).toBe(302);
    const auto = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "pb-6", action: msg({ summary: "auto" }), playbook_id: "payment-reminder" } }));
    expect(auto.auto_approved).toBe(true);
    expect(row(auto.approval_id).playbook_id).toBe("payment-reminder");
  });

  test("reads, logins and requests fill nothing; only a recorded done outcome fills a segment", async () => {
    const o = owner("pb-fill"), c = await client(o.token);
    const count = async () => (await page(o, "/uhenda")).match(/<p class="ho-sum"><span class="num">(\d+)<\/span>/)?.[1];
    expect(await count()).toBe("0");
    for (const [name, args] of [["get_started", {}], ["get_progress", {}], ["search_services", { query: "arve" }], ["get_obligations", { registry_code: "19990001" }]] as const) await c.callTool({ name, arguments: args });
    const req = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "fill-1", action: msg(), playbook_id: "payment-reminder" } }));
    expect(await count()).toBe("0");
    const tana = await page(o, "/");
    expect(tana).toContain('class="ho-strip" href="/uhenda#kaest-ara"');
    expect(tana).toContain('<span class="num">0</span> tööd 1-st');
    await decide(o, req.approval_id, { decision: "approve", digest: req.digest });
    expect(await count()).toBe("0");
    await c.callTool({ name: "record_action_outcome", arguments: { report_id: "fill-o", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: new Date().toISOString() } });
    expect(await count()).toBe("1");
    const uhendus = await page(o, "/uhenda");
    const section = uhendus.slice(uhendus.indexOf('id="kaest-ara"'), uhendus.indexOf('id="pusiload"'));
    expect(section).not.toContain("%");
    expect(section.match(/class="ask"/g)).toHaveLength(1);
    expect(section.match(/<button type="submit">/g)?.length ?? 0).toBeLessThanOrEqual(1);
    // The offer posts to the existing endpoint and creates the rule for the approved recipient.
    expect(section).toContain('<input type="hidden" name="kind" value="send_message">');
    expect((await post(o, "/standing-approvals", { kind: "send_message", scope: "approved", max_eur: "300" })).status).toBe(302);
    expect(db.prepare("SELECT recipients_json, max_amount_cents FROM standing_approvals WHERE owner_id='pb-fill'").get()).toEqual({ recipients_json: JSON.stringify(["billing@client.example"]), max_amount_cents: 30000 });
  });
});
