import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Server } from "node:http";
import { createApp, type Config } from "../src/app.js";
import { openDb } from "../src/db.js";

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
