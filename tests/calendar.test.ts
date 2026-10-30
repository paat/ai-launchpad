import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { createApp, feedLimiter, type Config } from "../src/app.js";
import { openDb, sha256, newId, nowIso } from "../src/db.js";
import { ICS_DISCLAIMER, ICS_NO_COMPANY, deadlinesCalendar, foldLine, icsText } from "../src/ics.js";
import { computeObligations, validRegistryCode } from "../src/obligations.js";
import { DEMO_FIXTURES, SYNTHETIC_COMPANIES } from "../src/fixtures.js";

// Issue #29: the owner's deadlines as a secret, read-only .ics feed.
const TODAY = new Date("2026-10-30T10:00:00Z");
const rows = (code: string) => computeObligations(SYNTHETIC_COMPANIES[code].facts, { today: TODAY, months: 3 }).obligations;
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const events = (ics: string) => unfold(ics).split("BEGIN:VEVENT").slice(1).map((e) => e.split("END:VEVENT")[0]);

describe("ics.ts (RFC 5545)", () => {
  test("folds at 75 octets and never splits an Estonian multibyte character at the boundary", () => {
    for (const pad of [72, 73, 74, 75]) {
      const line = `SUMMARY:${"x".repeat(pad - 8)}Käibemaks õõõ ÄÖÜ šž „jutumärgid” ${"ä".repeat(80)}`;
      const folded = foldLine(line);
      for (const l of folded.split("\r\n")) {
        expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
        expect(Buffer.from(l, "utf8").toString("utf8")).toBe(l); // whole characters only
      }
      expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
      expect(unfold(folded)).toBe(line);
    }
    // 74 ASCII octets then "ä" (2 octets): the break comes before the character, not inside it.
    expect(foldLine(`${"a".repeat(74)}ä`)).toBe(`${"a".repeat(74)}\r\n ä`);
    expect(foldLine("a".repeat(75))).toBe("a".repeat(75));
  });

  test("escapes backslash, semicolon, comma and newlines in TEXT", () => {
    expect(icsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  test("CRLF only, stable UIDs, two DISPLAY alarms, NÄIDIS and Võimalik prefixes, the sentence and the source", () => {
    const company = { name: "Kase Konsult OÜ", synthetic: true };
    const ics = deadlinesCalendar({ host: "launchpad.example", now: TODAY, company, obligations: rows("19990002") });
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const l of ics.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    const u = unfold(ics);
    for (const s of ["BEGIN:VCALENDAR", "VERSION:2.0", "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H", "X-WR-CALNAME:AI-hüppelaud · Kase Konsult OÜ (näidis)"]) expect(u).toContain(s);
    const ev = events(ics);
    expect(ev.length).toBe(rows("19990002").filter((o) => o.effective_due).length);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e).toMatch(/\r\nDTSTART;VALUE=DATE:\d{8}\r\n/);
      expect(e).toMatch(/\r\nUID:[a-z-]+-\d{8}@launchpad\.example\r\n/);
      expect(e).toMatch(/\r\nSUMMARY:NÄIDIS · /);
      expect(e).toMatch(/\r\nURL:https:\/\/www\.riigiteataja\.ee\/akt\/\d+\r\n/);
      expect(e).toContain("Ütle oma assistendile: „");
      expect(e).toContain("Assistent: ");
      expect(e).toContain(" / Sina: ");
      expect(e).toContain(icsText(ICS_DISCLAIMER));
      expect(e.match(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P7D\r\nDESCRIPTION:/g)?.length).toBe(1);
      expect(e.match(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-P1D\r\nDESCRIPTION:/g)?.length).toBe(1);
    }
    // Kase Konsult has labour taxes but no stated payouts: the TSD rows are conditional.
    const tsd = ev.find((e) => e.includes("UID:tsd-monthly-return-"))!;
    expect(tsd).toContain("SUMMARY:NÄIDIS · Võimalik: TSD ja maksud · ");
    expect(tsd).toContain("Tingimus: Kehtib\\, kui");
    // Stable: a later render (another DTSTAMP) keeps every UID.
    const uids = (s: string) => events(s).map((e) => /UID:(\S+)/.exec(e)![1]);
    expect(uids(deadlinesCalendar({ host: "launchpad.example", now: new Date("2026-10-31T08:00:00Z"), company, obligations: rows("19990002") }))).toEqual(uids(ics));
    expect(new Set(uids(ics)).size).toBe(uids(ics).length);
  });

  test("a definite row of a real company has neither prefix", () => {
    const ev = events(deadlinesCalendar({ host: "h.example", now: TODAY, company: { name: "Päris OÜ", synthetic: false }, obligations: rows("19990001") }));
    const kmd = ev.find((e) => e.includes("UID:vat-return-kmd-"))!;
    expect(kmd).toMatch(/\r\nSUMMARY:KMD ja käibemaks · /);
    expect(kmd).not.toContain("Tingimus:");
  });

  test("an empty state has its reason and no events, even when rows are passed", () => {
    const ics = deadlinesCalendar({ host: "h.example", now: TODAY, company: null, obligations: rows("19990001"), emptyReason: ICS_NO_COMPANY });
    expect(unfold(ics)).toContain(`X-WR-CALDESC:${ICS_NO_COMPANY}`);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  test("the per-token limit allows 60 fetches an hour", () => {
    const allowed = feedLimiter(), t0 = 1_000_000;
    for (let i = 0; i < 60; i++) expect(allowed("a", t0 + i)).toBe(true);
    expect(allowed("a", t0 + 61)).toBe(false);
    expect(allowed("b", t0 + 61)).toBe(true);
    expect(allowed("a", t0 + 3600_000 + 1)).toBe(true);
  });
});

// Real HTTP: demo login, CSRF-guarded forms, the feed itself.
let server: Server, db: ReturnType<typeof openDb>, base: string, cfg: Config;
const originalFetch = globalThis.fetch;
let external = 0;
async function start(extra: Partial<Config> = {}) {
  cfg = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", allowedHosts: ["127.0.0.1"], modelMode: "test", ...extra };
  db = openDb(":memory:"); const { app } = createApp(cfg, db);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base;
}
beforeEach(async () => {
  external = 0;
  vi.stubGlobal("fetch", ((url: string | URL | Request, init?: RequestInit) => {
    if (new URL(url instanceof Request ? url.url : url).origin !== base) { external++; throw new Error("External network forbidden"); }
    return originalFetch(url, init);
  }) as typeof fetch);
});
afterEach(async () => { vi.unstubAllGlobals(); if (server) await new Promise<void>((ok) => server.close(() => ok())); db?.close(); expect(external).toBe(0); });

class Browser {
  cookies = new Map<string, string>();
  async request(path: string, fields?: Record<string, string>, origin = base) {
    const res = await fetch(base + path, { method: fields ? "POST" : "GET", redirect: "manual", headers: { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(fields ? { "content-type": "application/x-www-form-urlencoded", origin } : {}) }, body: fields ? new URLSearchParams(fields) : undefined });
    for (const c of res.headers.getSetCookie()) { const [name, value] = c.split(";")[0].split("="); this.cookies.set(name, value); }
    return res;
  }
  async login(actor = "alpha") { return this.request("/auth/demo", { actor, preauth: field(await (await this.request("/login")).text(), "preauth") }); }
  async csrf() { return field(await (await this.request("/uhenda")).text(), "csrf"); }
  ownerId() { return (db.prepare("SELECT owner_id FROM sessions").all() as { owner_id: string }[])[0].owner_id; }
  /** Creates the feed and returns its path from the one-time page. */
  async createFeed() {
    const r = await this.request("/calendar/feed", { csrf: await this.csrf() });
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
    const m = /\/calendar\/([A-Za-z0-9_-]{43})\.ics/.exec((await r.text()).replace(/<wbr>/g, ""));
    return { path: m![0], raw: m![1] };
  }
}
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]+)"`).exec(html)![1];
const feed = (path: string) => fetch(base + path);

describe("calendar feed over HTTP", () => {
  test("create shows the URL once, stores only its hash, and serves a NÄIDIS calendar without login", async () => {
    await start();
    const b = new Browser(); await b.login();
    const before = await (await b.request("/uhenda")).text();
    for (const s of ["Lisa tähtajad oma kalendrisse", "iPhone: puuduta linki", "Muud kalendrid → URL-i kaudu", "Lisa kalender → Telli veebist", "Kalender uueneb mõne tunni jooksul; kinnitada saab ainult assistendi kaudu."]) expect(before).toContain(s);
    expect(before).not.toMatch(/<script|onsubmit|onclick/);
    const { path, raw } = await b.createFeed();
    const stored = db.prepare("SELECT * FROM calendar_feeds").all() as { owner_id: string; token_hash: string }[];
    expect(stored).toEqual([{ owner_id: b.ownerId(), token_hash: sha256(raw), created_at: expect.any(String) }]);
    for (const t of ["calendar_feeds", "activity", "sessions"]) expect(JSON.stringify(db.prepare(`SELECT * FROM ${t}`).all())).not.toContain(raw);
    const after = await (await b.request("/uhenda")).text();
    expect(after).toContain("Kalendri jagamine on sees.");
    expect(after).toContain("Lõpeta kalendri jagamine");
    expect(after).not.toContain(raw);
    const r = await feed(path); // no cookie: the token is the credential
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const ics = unfold(await r.text());
    expect(ics).toContain("X-WR-CALNAME:AI-hüppelaud · Mari Disain OÜ (näidis)");
    expect(ics).toMatch(/SUMMARY:NÄIDIS · KMD ja käibemaks · /);
    expect(ics).toContain(`UID:vat-return-kmd-`);
    expect(ics).toContain("Ütle oma assistendile: „Valmista ");
  });

  test("the feed carries no approval, need or assessment text", async () => {
    await start();
    const b = new Browser(); await b.login();
    const owner = b.ownerId();
    db.prepare("INSERT INTO approvals(id,owner_id,payload_json,digest,state,expires_at,created_at,kind) VALUES(?,?,?,?,?,?,?,?)").run(newId("apr"), owner, JSON.stringify({ kind: "send_invoice", recipient: { name: "Salajane Klient OÜ", address: "klient@customer.example" }, amount_cents: 123456, document: { title: "Arve SECRET-INVOICE-77", content: "SECRET-APPROVAL-BODY" } }), "d".repeat(64), "pending", "2099-01-01T00:00:00.000Z", nowIso(), "send_invoice");
    db.prepare("INSERT INTO unmet_needs(id,owner_id,report_id,payload_hash,need_redacted,blocker,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(newId("need"), owner, "n1", "h", "SECRET-NEED-TEXT", "no_tool", "received", nowIso(), nowIso());
    const { path } = await b.createFeed();
    const ics = unfold(await (await feed(path)).text());
    expect(ics).toContain("BEGIN:VEVENT");
    const a = DEMO_FIXTURES.alpha;
    for (const s of ["Salajane Klient", "klient@customer.example", "1234", "SECRET-INVOICE-77", "SECRET-APPROVAL-BODY", "SECRET-NEED-TEXT", a.conclusion, a.next_action.title, ...a.responsibilities.map((r) => r.label), ...a.responsibilities.map((r) => r.reason)]) expect(ics, s).not.toContain(icsText(s));
  });

  test("revoke, an unknown token and progress deletion all give 404 with no body", async () => {
    await start();
    const b = new Browser(); await b.login();
    const { path } = await b.createFeed();
    expect((await feed(path)).status).toBe(200);
    const unknown = await feed(`/calendar/${"A".repeat(43)}.ics`);
    expect([unknown.status, await unknown.text()]).toEqual([404, ""]);
    const revoke = await b.request("/calendar/feed/revoke", { csrf: await b.csrf() });
    expect([revoke.status, revoke.headers.get("location")]).toEqual([302, "/uhenda"]);
    const gone = await feed(path);
    expect([gone.status, await gone.text()]).toEqual([404, ""]);
    expect(await (await b.request("/uhenda")).text()).toContain("Lisa tähtajad oma kalendrisse");
    // Progress deletion removes a live feed too.
    const second = await b.createFeed();
    expect((await feed(second.path)).status).toBe(200);
    expect((await b.request("/delete", { csrf: await b.csrf() })).status).toBe(302);
    expect(db.prepare("SELECT count(*) n FROM calendar_feeds").get()).toEqual({ n: 0 });
    const deleted = await feed(second.path);
    expect([deleted.status, await deleted.text()]).toEqual([404, ""]);
  });

  test("create and revoke are CSRF- and Origin-checked", async () => {
    await start();
    const b = new Browser(); await b.login();
    expect((await b.request("/calendar/feed", { csrf: "wrong" })).status).toBe(403);
    expect((await b.request("/calendar/feed", { csrf: await b.csrf() }, "https://evil.example")).status).toBe(403);
    expect(db.prepare("SELECT count(*) n FROM calendar_feeds").get()).toEqual({ n: 0 });
    const { path } = await b.createFeed();
    expect((await b.request("/calendar/feed/revoke", { csrf: "wrong" })).status).toBe(403);
    expect((await b.request("/calendar/feed/revoke", { csrf: await b.csrf() }, "https://evil.example")).status).toBe(403);
    expect((await feed(path)).status).toBe(200);
    expect((await fetch(`${base}/calendar/feed`, { method: "POST", redirect: "manual" })).headers.get("location")).toBe("/login");
  });

  test("no known registry code: an honest calendar without events", async () => {
    await start();
    const b = new Browser(); await b.login();
    await b.request("/delete", { csrf: await b.csrf() }); // removes the fixture assessment
    const ics = unfold(await (await feed((await b.createFeed()).path)).text());
    expect(ics).toContain(`X-WR-CALDESC:${ICS_NO_COMPANY}`);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  const realCode = () => { for (let n = 10000000; ; n++) if (validRegistryCode(String(n))) return String(n); };
  async function realCompanyFeed() {
    const b = new Browser(); await b.login();
    const owner = b.ownerId(), payload = JSON.stringify({ ...DEMO_FIXTURES.alpha, company_registry_ref: realCode() });
    db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)").run(newId("asmt"), owner, 99, payload, sha256(payload), nowIso());
    return unfold(await (await feed((await b.createFeed()).path)).text());
  }
  test("register not configured: the reason, no fabricated events", async () => {
    await start();
    const ics = await realCompanyFeed();
    expect(ics).toContain("X-WR-CALDESC:Avaliku registri päring pole selles serveris seadistatud. Sündmusi ei loodud.");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
  test("register facts not cached: the reason, no events and no outbound call", async () => {
    await start({ arikrattApiKey: "test-key", arikrattMcpUrl: "https://arikratt.example/mcp" });
    const ics = await realCompanyFeed();
    expect(ics).toContain("X-WR-CALDESC:Avaliku registri andmed pole veel laaditud");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  test("61st fetch of one token within an hour is refused", async () => {
    await start();
    const b = new Browser(); await b.login();
    const { path } = await b.createFeed();
    for (let i = 0; i < 60; i++) expect((await feed(path)).status).toBe(200);
    const r = await feed(path);
    expect([r.status, await r.text()]).toEqual([429, ""]);
  });
});
