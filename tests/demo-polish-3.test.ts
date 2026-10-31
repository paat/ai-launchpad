import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";
import { shell, approvalCardBody, connectionBody, playbooksBody } from "../src/views.js";
import type { ApprovalRow } from "../src/mcp.js";

// Demo polish 3 (#63): the last QA items from PR #62.
let server: Server, base = "", cookie = "";
const cfg: Config = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"] };
const { app } = createApp(cfg, openDb(":memory:"));
beforeAll(async () => {
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base;
  const page = await fetch(`${base}/login`), pre = (page.headers.get("set-cookie") ?? "").split(";")[0];
  const preauth = /name="preauth" value="([^"]+)"/.exec(await page.text())![1];
  const r = await fetch(`${base}/auth/demo`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: pre, origin: base }, body: `actor=alpha&preauth=${preauth}`, redirect: "manual" });
  cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
const get = async (path: string) => (await fetch(`${base}${path}`, { headers: { cookie } })).text();
const headings = (html: string) => [...html.matchAll(/<h([1-3])[^>]*>([^<]+)</g)].map((m) => m[2]);

describe("#63 m9: /connection and /playbooks follow the UI language", () => {
  test("„Andmed ja õigused” is Estonian by default and English with ?lang=en", async () => {
    const et = await get("/connection");
    expect(et).toContain('<html lang="et">');
    expect(et).not.toContain('<div lang="en">');
    expect(headings(et)).toEqual(expect.arrayContaining(["Andmed ja õigused", "Ühenda oma assistent", "Assistendi ajalugu", "Assistendi ligipääs", "Töö käigu jagamise luba", "Sinu minimaalsed andmed"]));
    expect(et).toContain("<title>Andmed ja õigused · AI-hüppelaud</title>");
    // The first request is a prompt for the assistant: English data, marked as such.
    expect(et).toMatch(/<div class="quote" lang="en"><p>Use AI Launchpad/);
    // Local setup pending is a neutral note, not the amber attention notice (as on Ühendus, PR #62).
    expect(et).not.toContain('class="notice"');
    expect(et).toContain('<div class="note"><p><strong>Kohalik seadistus pooleli.</strong>');
    const en = await get("/connection?lang=en");
    expect(en).toContain('<html lang="en">');
    expect(headings(en)).toEqual(expect.arrayContaining(["Connection &amp; data", "Connect your assistant", "Assistant history", "Assistant access", "Progress sharing permission", "Your minimal data"]));
    expect(en).toMatch(/<div class="quote"><p>Use AI Launchpad/);
    expect(en).toContain('<div class="note"><p><strong>Local setup pending.</strong>');
  });

  test("/playbooks shows each playbook's ET title; its English summary is marked lang=\"en\"", async () => {
    const et = await get("/playbooks");
    expect(et).toContain('<html lang="et">');
    expect(et).not.toContain('<div lang="en">');
    expect(headings(et)).toEqual(expect.arrayContaining(["Mängukavad", "Vaata üle oma tähtajad", "Meenuta kliendile tasumata arvet"]));
    expect(et).toContain('<p lang="en">Your assistant lists your upcoming tax and register deadlines');
    expect(et).toContain("Ametlik allikas:");
    const en = await get("/playbooks?lang=en");
    expect(headings(en)).toEqual(expect.arrayContaining(["Playbooks", "Check the owner&#39;s deadlines", "Remind a customer about an overdue invoice"]));
    expect(en).toContain("<p>Your assistant lists your upcoming tax and register deadlines");
    expect(en).toContain("Official source:");
    expect(en).not.toContain("Mängukavad");
  });
});

describe("#63 nit: the „Saadetud: demo” chip is in direction A's palette", () => {
  const root = shell({ title: "x", active: "none", csrf: "", body: "" }).match(/:root\{([^}]*)\}/)![1];
  const vars = Object.fromEntries([...root.matchAll(/--([\w-]+):([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
  const hex = (v: string): string => (v.startsWith("var(--") ? hex(vars[v.slice(6, -1)]) : v);
  const rgb = (v: string) => hex(v).slice(1).match(/../g)!.map((x) => parseInt(x, 16));
  test("sent is the green family for done/sent, not the old blue (AA is checked with every pair in ui-redesign)", () => {
    for (const k of ["st-sent-fg", "st-sent-bg"]) {
      const [r, g, b] = rgb(vars[k]);
      expect(g, `${k} ${vars[k]} is green`).toBeGreaterThan(r);
      expect(g, `${k} ${vars[k]} is green`).toBeGreaterThan(b);
    }
    expect([vars["st-sent-fg"], vars["st-sent-bg"]]).not.toContain("#1d4580");
  });
  test("the callout's code chip sits without stray quote gaps: „Kinnitasin” is the chip itself", () => {
    const a = { id: "appr_1", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "approved", created_at: "2026-11-03T09:00:00Z", expires_at: "2026-11-04T09:00:00Z", decided_at: "2026-11-03T09:05:00Z", consumed_at: null, outcome_json: null,
      payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo.example" }, amount_cents: 24000, document: { title: "Meeldetuletus", content: "Tere!" }, summary: "Meeldetuletus" }) } as unknown as ApprovalRow;
    const et = approvalCardBody({ csrf: "c", a, lang: "et", sample: true, now: new Date("2026-11-03T10:00:00Z") });
    expect(et).toContain("kirjuta <code>Kinnitasin</code>.");
    expect(et).not.toMatch(/„<code>|<\/code>”/);
    const en = approvalCardBody({ csrf: "c", a, lang: "en", sample: true, now: new Date("2026-11-03T10:00:00Z") });
    expect(en).toContain("write <code>Approved</code> (“Kinnitasin” works too).");
  });
});

// Fix cycle 1 (review-polish3-grok): copy on /connection and /playbooks says what the server enforces.
const conn = (lang: "et" | "en", candidates: Record<string, string>[] = []) => connectionBody({ lang, csrf: "c", baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [], grants: [], candidates });
const para = (html: string, needle: string) => [...html.matchAll(/<p[^>]*>(.*?)<\/p>/g)].map((m) => m[1]).find((p) => p.includes(needle)) ?? "";

describe("grok high: the retention sentence matches reportCapacityError", () => {
  test("refusal starts when 500 are stored and lasts until progress is deleted", () => {
    expect(para(conn("et"), "500")).toContain("Aruandeid säilitatakse kuni 500; kui see piir on täis, uusi aruandeid vastu ei võeta, kuni töö käigu kustutad.");
    expect(para(conn("en"), "500")).toContain("Up to 500 reports are retained; once that limit is reached, new reports are refused until you delete progress.");
  });
});

describe("grok medium: the assessment paragraph does not use the approval verb", () => {
  test("„Hinnangut ei pea eraldi heaks kiitma”, no „kinnitamist”", () => {
    const p = para(conn("et"), "Assistendi hinnang on tema enda otsus");
    expect(p).toContain("Hinnangut ei pea eraldi heaks kiitma.");
    expect(p).not.toContain("kinnitamist");
  });
});

describe("grok medium: a friction card that is not completed has a translated status line", () => {
  const card = { topicId: "invoice_reminders", locale: "en", state: "failed", output: null, replayed: false, label: "Invoice reminders" };
  test("no „steps above” on /playbooks; the status line is in the UI language", () => {
    const et = playbooksBody("et", [], [card]);
    expect(et).not.toContain("steps above");
    expect(et).toContain('<p class="small muted" lang="et">See soovitus pole praegu saadaval.</p>');
    const en = playbooksBody("en", [], [card]);
    expect(en).not.toContain("steps above");
    expect(en).toContain('<p class="small muted" lang="en">This suggestion is not available right now.</p>');
  });
});

describe("grok low: only fixed English tokens on a nomination carry lang=\"en\"", () => {
  test("the assistant's Estonian jobs text is not inside lang=\"en\"; the status pill is", () => {
    const html = conn("et", [{ id: "cand_1", name: "Kratt Arved", connection: "https://arved.example.ee/mcp", jobs: "Meeldetuletused eesti keeles", status: "pending_moderation", created_at: "2026-10-31T10:00:00Z" }]);
    expect(html).toContain('<span class="pill" lang="en">pending_moderation</span>');
    expect(html).not.toMatch(/lang="en"[^>]*>[^<]*Meeldetuletused eesti keeles/);
    expect(html).toContain("Meeldetuletused eesti keeles");
  });
});
