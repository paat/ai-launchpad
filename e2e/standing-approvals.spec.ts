import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createApp, type Config } from "../src/app.js";
import { sha256 } from "../src/db.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });

test("owner approves a card, allows similar ones automatically, and the next reminder shows on Täna as done with a standing approval (#45)", async ({ page, context }) => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db } = createApp(cfg);
  const now = new Date().toISOString();
  // Synthetic authenticated Google-style owner; no OIDC or provider request.
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('synthetic-owner','synthetic-google-subject','google',1,?)").run(now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('synthetic-owner','workspace-synthetic','Synthetic Studio OÜ')").run();
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,'synthetic-owner','synthetic-csrf',?)").run(sha256("synthetic-browser-session"), new Date(Date.now() + 60_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('synthetic-token','synthetic-owner',?,'progress:read,progress:report',1,?)").run(sha256("lp_synthetic-browser-token"), now);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "synthetic-browser", version: "1" });
  const reminder = (n: string, cents: number) => ({ kind: "send_message", recipient: { name: "Synthetic Client OÜ", address: "billing@client.example" }, amount_cents: cents, period: "2026-10",
    document: { title: `Payment reminder: invoice ${n}`, content: `Tere!\n\nInvoice ${n} is overdue.\n\nAitäh,\nSynthetic Studio OÜ` }, summary: `Polite reminder for overdue invoice ${n}` });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([{ name: "lp_session", value: "synthetic-browser-session", url: cfg.baseUrl }]);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: "Bearer lp_synthetic-browser-token" } } }));
    const first = (await client.callTool({ name: "request_approval", arguments: { report_id: "std-1", action: reminder("2026-014", 124000) } })).structuredContent as { approval_id: string; approve_url: string; state: string };
    expect(first.state).toBe("pending");

    await page.goto(first.approve_url);
    await page.getByRole("button", { name: "Kinnita täpselt see" }).click();
    await expect(page.locator("main [role=status]").first()).toContainText("Nüüd on assistendi kord.");
    // The offer: this recipient by default, cap max(2 000 €, this amount), up to 10 a day, 90 days.
    const offer = page.locator("section.standing-offer");
    await expect(offer.getByRole("heading", { name: "Luba edaspidi sarnased automaatselt" })).toBeVisible();
    // The scope radios and the cap sit under „Muuda piire”; the sentence above already names them.
    await expect(offer.getByRole("heading", { name: "Luba edaspidi sarnased automaatselt: ainult Synthetic Client OÜ, kuni 2000\u00a0€" })).toBeVisible();
    await offer.getByText("Muuda piire").click();
    await expect(offer.getByRole("radio", { name: /Ainult Synthetic Client OÜ/ })).toBeChecked();
    await expect(offer.getByLabel("Summa ülempiir (€)")).toHaveValue("2000");
    await expect(offer.getByText("Kuni 10 päevas · kehtib 90 päeva")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await offer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/standing-offer-390.png`, fullPage: true });

    // QA M1: a new cap is saved with the button inside „Muuda piire”, and no visible text still names the old cap.
    const old = await offer.getByLabel("Summa ülempiir (€)").inputValue();
    await offer.getByLabel("Summa ülempiir (€)").fill("2500");
    await expect(offer).not.toContainText(`${old}\u00a0€`, { useInnerText: true });
    await expect(offer.getByRole("button", { name: "Luba automaatselt" })).toHaveCount(1);
    // Genuine same-origin form POST with the CSRF field.
    await offer.locator("details").getByRole("button", { name: "Luba automaatselt" }).click();
    await expect(page.getByText(/Püsiluba on olemas: Sõnumid: billing@client\.example, kuni 2500/)).toBeVisible();

    // The assistant's next reminder is approved at once: no card waits for the owner.
    const next = (await client.callTool({ name: "request_approval", arguments: { report_id: "std-2", action: reminder("2026-015", 86000) } })).structuredContent as { approval_id: string; state: string; auto_approved?: boolean; rule_name: string };
    expect(next).toMatchObject({ state: "approved", auto_approved: true });
    expect(next.rule_name).toMatch(/^Sõnumid: billing@client\.example/);

    await page.goto(cfg.baseUrl);
    await expect(page.getByRole("heading", { name: "Täna pole sinult midagi vaja" })).toBeVisible();
    const tegi = page.locator("#tegi");
    await expect(tegi.getByText("Payment reminder: invoice 2026-015 · Synthetic Client OÜ")).toBeVisible();
    await expect(tegi.locator(".label-chip--owner", { hasText: "Püsiloaga" })).toBeVisible();
    await expect(tegi.getByText(/Püsiloaga: Sõnumid: billing@client\.example/)).toBeVisible();
    await tegi.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/standing-tana-390.png`, fullPage: true });

    await tegi.getByRole("link", { name: /invoice 2026-015/ }).click();
    await expect(page.locator("main [role=status]")).toContainText("Kinnitatud püsiloaga „Sõnumid: billing@client.example");
    await page.screenshot({ path: `${SHOTS}/standing-card-390.png`, fullPage: true });

    await page.goto(`${cfg.baseUrl}/uhenda#pusiload`);
    await expect(page.locator("#pusiload").getByRole("button", { name: "Lõpeta" })).toBeVisible();
    await page.locator("#pusiload").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/standing-uhendus-390.png`, fullPage: true });
  } finally { await client.close(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});

test("„Käest ära” (#61): the pre-filled offer on Ühendus creates the rule, and reminders turn deep green only after the rule's first done send", async ({ page, context }) => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db } = createApp(cfg);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('synthetic-owner','synthetic-google-subject','google',1,?)").run(now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('synthetic-owner','workspace-synthetic','Synthetic Studio OÜ')").run();
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,'synthetic-owner','synthetic-csrf',?)").run(sha256("synthetic-browser-session"), new Date(Date.now() + 60_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('synthetic-token','synthetic-owner',?,'progress:read,progress:report',1,?)").run(sha256("lp_synthetic-browser-token"), now);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "synthetic-browser", version: "1" });
  const reminder = (n: string, cents: number) => ({ kind: "send_message", recipient: { name: "Synthetic Client OÜ", address: "billing@client.example" }, amount_cents: cents, period: "2026-10",
    document: { title: `Payment reminder: invoice ${n}`, content: `Tere!\n\nInvoice ${n} is overdue.` }, summary: `Polite reminder for overdue invoice ${n}` });
  const ask = async (id: string, n: string, cents: number) => (await client.callTool({ name: "request_approval", arguments: { report_id: id, action: reminder(n, cents), playbook_id: "payment-reminder" } })).structuredContent as { approval_id: string; approve_url: string; digest: string; state: string; auto_approved?: boolean };
  const sent = (id: string, a: { approval_id: string; digest: string }) => client.callTool({ name: "record_action_outcome", arguments: { report_id: id, approval_id: a.approval_id, digest: a.digest, outcome: "sent", observed_at: new Date().toISOString() } });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([{ name: "lp_session", value: "synthetic-browser-session", url: cfg.baseUrl }]);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: "Bearer lp_synthetic-browser-token" } } }));
    const ho = page.locator("#kaest-ara");

    const first = await ask("ho-1", "2026-014", 24000);
    await page.goto(first.approve_url);
    await page.getByRole("button", { name: "Kinnita täpselt see" }).click();
    await page.goto(`${cfg.baseUrl}/uhenda`);
    // Approved but not reported: still yours.
    await expect(ho.locator(".ho-sum")).toContainText("0 tööd 1-st");
    await sent("ho-1-sent", first);
    await page.goto(`${cfg.baseUrl}/uhenda`);
    await expect(ho.locator(".ho-sum")).toContainText("1 töö 1-st on sinu käest ära");
    await expect(ho.locator(".ho-bar .ho-seg--prep")).toHaveCount(1);
    await expect(ho.locator(".ask")).toContainText("Ainult Synthetic Client OÜ (senised saajad), kuni 300 € kirja kohta");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // QA M1: the same on Ühendus.
    await ho.getByText("Muuda piire").click();
    await ho.getByLabel("Summa ülempiir (€)").fill("350");
    await expect(ho.locator(".ho-next")).not.toContainText("300 €", { useInnerText: true });
    await expect(ho.getByRole("button", { name: "Luba automaatselt" })).toHaveCount(1);
    await ho.locator("details").getByRole("button", { name: "Luba automaatselt" }).click();
    await expect(page).toHaveURL(/\/uhenda#pusiload$/);
    await expect(page.locator("#pusiload")).toContainText("Sõnumid: billing@client.example, kuni 350");
    // A live rule that has not fired yet does not fill the top rung.
    await expect(ho.locator(".ho-bar .ho-seg--prep")).toHaveCount(1);

    const next = await ask("ho-2", "2026-015", 18000);
    expect(next).toMatchObject({ state: "approved", auto_approved: true });
    await page.reload();
    await expect(ho.locator(".ho-bar .ho-seg--done")).toHaveCount(0);
    await sent("ho-2-sent", next);
    // A hash-only goto would not reload the page.
    await page.goto(`${cfg.baseUrl}/uhenda`);
    await expect(ho.locator(".ho-bar .ho-seg--done")).toHaveCount(1);
    await expect(ho.locator(".ho-job")).toContainText("Assistent teeb ise");
    await expect(ho.locator(".ho-month")).toContainText("2 tööd tehtud, 1 ilma sinuta");
    await page.goto(cfg.baseUrl);
    await expect(page.locator(".ho-strip")).toContainText("Käest ära: 1 töö 1-st");
    await page.goto(`${cfg.baseUrl}/uhenda#kaest-ara`);
    await ho.screenshot({ path: `${SHOTS}/t5-handover-done-390.png` });
  } finally { await client.close(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
