import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";
import { PLAYBOOKS, loadCatalog, safeHttps, searchServices } from "../src/catalog.js";
import { CATALOGUE_GROUPS, GROUP_PLAYBOOKS, catalogueGroup, connectBody, whereItWorks } from "../src/views.js";

// Public /kataloog over real HTTP: no login, ET first, server-side filters, zero JS.
let server: Server, db: ReturnType<typeof openDb>, base: string;
beforeAll(async () => {
  const cfg: Config = { demo: true, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", allowedHosts: ["127.0.0.1"], modelMode: "test" };
  db = openDb(":memory:"); const { app } = createApp(cfg, db);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; cfg.baseUrl = base;
});
afterAll(async () => { await new Promise<void>((ok) => server.close(() => ok())); db.close(); });

const get = (path: string, cookie = "") => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
const page = async (path: string) => { const r = await get(path); expect(r.status).toBe(200); return r.text(); };
const cards = (html: string) => [...html.matchAll(/<article class="card svc" data-service="([^"]+)">([\s\S]*?)<\/article>/g)].map((m) => ({ id: m[1], html: m[2] }));
const listed = loadCatalog().filter((r) => ["hosted_mcp", "local_mcp", "self_hosted_mcp", "ordinary_api"].includes(r.interface_class ?? "") && r.id !== "arikratt");

describe("public catalogue", () => {
  test("is public, Estonian first, English on ?lang=en, and has no script", async () => {
    const html = await page("/kataloog");
    expect(html).toContain('<html lang="et">');
    expect(html).toContain("Teenused, mida sinu AI-assistent saab kasutada");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('name="csrf"');
    const en = await page("/kataloog?lang=en");
    expect(en).toContain('<html lang="en">');
    expect(en).toContain("Services your AI assistant can use");
    expect(en).toContain("Researched · not tested with AI Launchpad");
  });

  test("hero counts come from the data", async () => {
    const all = loadCatalog();
    const mcp = all.filter((r) => ["hosted_mcp", "local_mcp", "self_hosted_mcp"].includes(r.interface_class ?? "")).length;
    const api = all.filter((r) => r.interface_class === "ordinary_api").length;
    expect([mcp, api]).toEqual([88, 50]); // research snapshot 2026-10-28; update with the data
    expect(all.length).toBe(181);
    expect(await page("/kataloog")).toContain(`<strong>${mcp} MCP-ühendust ja ${api} API-t</strong> (kokku ${all.length} uuritud teenusest) Eesti ettevõtja tööde jaoks.`);
    expect(await page("/kataloog?lang=en")).toContain(`<strong>${mcp} MCP connections and ${api} APIs</strong> (out of ${all.length} researched services)`);
  });

  test("every listed service has one card with the honesty chip, and only https links", async () => {
    const html = await page("/kataloog");
    const cs = cards(html);
    expect(cs.map((c) => c.id).sort()).toEqual(listed.map((r) => r.id).sort());
    for (const c of cs) expect(c.html, c.id).toContain("Uuritud · AI-hüppelauaga pole testitud");
    expect(loadCatalog().every((r) => r.runtime_tested === false)).toBe(true);
    expect(html).not.toContain("Testitud</span>");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    for (const h of hrefs) expect(h.startsWith("/") || (h.startsWith("https://") && safeHttps(h) === h), h).toBe(true);
    expect(hrefs.filter((h) => h.startsWith("https://")).length).toBeGreaterThan(cs.length);
  });

  test("pins AI Launchpad (tested) and Ärikratt (used by Launchpad) above the list", async () => {
    const html = await page("/kataloog");
    const pinned = html.indexOf("svc--pinned"), first = html.indexOf('data-service="');
    expect(pinned).toBeGreaterThan(0);
    expect(pinned).toBeLessThan(first);
    // Per-assistant dates from docs/live-pilot.md (ChatGPT 28 Oct, Claude Free 30 Oct 2026).
    expect(html).toContain("Testitud: ChatGPT 28.10.2026 · Claude 30.10.2026");
    expect(html).not.toContain("ChatGPT ja Claude (30.10.2026)");
    expect(html).toContain('href="https://arikratt.ee/mcp"');
    expect(html).not.toContain('data-service="arikratt"');
  });

  test("each card says where it works, from interface_class, and a legend explains it", async () => {
    expect(whereItWorks("hosted_mcp")).toEqual(["Kõikjal · veeb, telefon, arvuti", "Anywhere · web, phone, computer"]);
    for (const ic of ["local_mcp", "self_hosted_mcp"]) expect(whereItWorks(ic)).toEqual(["Ainult arvutis", "On a computer only"]);
    for (const ic of ["ordinary_api", "integration_only", "unknown", undefined]) expect(whereItWorks(ic)).toEqual(["Vajab ühendust", "Needs a connector"]);
    const html = await page("/kataloog");
    const byId = new Map(loadCatalog().map((r) => [r.id, r]));
    const cs = cards(html);
    for (const c of cs) expect(c.html, c.id).toContain(`<span class="label-chip label-chip--where">${whereItWorks(byId.get(c.id)!.interface_class)[0]}</span>`);
    // All three kinds actually appear.
    for (const w of ["Kõikjal · veeb, telefon, arvuti", "Ainult arvutis", "Vajab ühendust"]) expect(cs.some((c) => c.html.includes(w)), w).toBe(true);
    const legend = /<ul class="legend"[\s\S]*?<\/ul>/.exec(html)![0];
    expect(html.indexOf(legend)).toBeLessThan(html.indexOf('class="card svc svc--pinned"'));
    expect(legend.match(/<svg class="ico"[^>]*aria-hidden="true"/g)).toHaveLength(3);
    expect(legend).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(legend).toContain("töötab kõikjal");
    expect(legend).toContain("Claude Desktop/Cowork või ChatGPT töölauarakendus");
    expect(legend).toContain("telefonis küsid ja kinnitad");
    expect(legend).not.toMatch(/testitud|kontrollitud|verified/i);
    expect(await page("/kataloog?lang=en")).toContain("Anywhere · web, phone, computer");
  });

  test("group chips filter server-side and mark the current group", async () => {
    const all = await page("/kataloog");
    for (const g of CATALOGUE_GROUPS) expect(all).toContain(`href="/kataloog?g=${g.id}"`);
    const html = await page("/kataloog?g=raamatupidamine");
    expect(html).toContain('href="/kataloog?g=raamatupidamine" aria-current="page"');
    const ids = cards(html).map((c) => c.id);
    expect(ids.length).toBe(listed.filter((r) => catalogueGroup(r.sector) === "raamatupidamine").length);
    expect(ids).toContain("werkzeug");
    expect(cards(await page("/kataloog?g=kullerid")).every((c) => catalogueGroup(loadCatalog().find((r) => r.id === c.id)!.sector) === "kullerid")).toBe(true);
    // Unknown group shows everything.
    expect(cards(await page("/kataloog?g=bogus")).length).toBe(listed.length);
  });

  test("?q uses searchServices and keeps the group", async () => {
    const want = new Set(searchServices("invoice", Infinity).map((r) => r.id));
    const ids = cards(await page("/kataloog?q=invoice")).map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => want.has(id))).toBe(true);
    const both = await page("/kataloog?q=invoice&g=raamatupidamine");
    expect(both).toContain('<input type="hidden" name="g" value="raamatupidamine">');
    expect(cards(both).length).toBeLessThanOrEqual(ids.length);
    const none = await page(`/kataloog?q=${encodeURIComponent('<b>zzz"')}`);
    expect(none).toContain("&lt;b&gt;zzz&quot;");
    expect(none).not.toContain("<b>zzz");
    expect(cards(none)).toEqual([]);
  });

  test("playbook map uses real playbook ids and shows on accounting and email cards", async () => {
    const ids = new Set(PLAYBOOKS.map((p) => p.id));
    for (const list of Object.values(GROUP_PLAYBOOKS)) for (const id of list!) expect(ids.has(id), id).toBe(true);
    const acc = cards(await page("/kataloog?g=raamatupidamine"));
    expect(acc.every((c) => c.html.includes("Avab töövoo: KMD ettevalmistus / Maksemeeldetuletus"))).toBe(true);
    expect(cards(await page("/kataloog?g=epost")).every((c) => c.html.includes("Avab töövoo: Maksemeeldetuletus"))).toBe(true);
    expect(cards(await page("/kataloog?g=kullerid")).some((c) => c.html.includes("Avab töövoo"))).toBe(false);
  });

  test("/services redirects to /kataloog, also for a signed-in owner, who keeps the nav", async () => {
    const r = await get("/services?q=merit");
    expect([r.status, r.headers.get("location")]).toEqual([302, "/kataloog?q=merit"]);
    const all3 = await get("/services?lang=en&g=pank&q=lhv%20pank&x=1");
    expect([all3.status, all3.headers.get("location")]).toEqual([302, "/kataloog?lang=en&g=pank&q=lhv+pank"]);
    expect((await get("/services")).headers.get("location")).toBe("/kataloog");
    const login = await get("/login");
    const pre = /name="preauth" value="([^"]+)"/.exec(await login.text())![1];
    const auth = await fetch(base + "/auth/demo", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: base, cookie: login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") }, body: new URLSearchParams({ actor: "alpha", preauth: pre }) });
    const cookie = [...login.headers.getSetCookie(), ...auth.headers.getSetCookie()].map((c) => c.split(";")[0]).join("; ");
    const owned = await get("/services", cookie);
    expect([owned.status, owned.headers.get("location")]).toEqual([302, "/kataloog"]);
    const html = await (await get("/kataloog", cookie)).text();
    expect(html).toContain('<nav class="main"');
    expect(html).toContain('href="/kataloog">Kataloog</a>');
  });
});

test("/uhenda links to the catalogue once the assistant is connected", () => {
  const body = (kind: "connected" | "waiting") => connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "claude", owner: true, state: kind === "connected" ? { kind, who: "Claude", at: "2026-10-30T10:00:00Z" } : { kind } });
  expect(body("connected")).toContain('<a class="tap-link" href="/kataloog?g=raamatupidamine">Järgmine samm: ühenda oma raamatupidamine → Kataloog</a>');
  expect(body("waiting")).not.toContain("/kataloog?g=");
});
