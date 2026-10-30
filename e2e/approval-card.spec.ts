import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createApp, type Config } from "../src/app.js";
import { sha256 } from "../src/db.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });

test("owner approves an exact-payload card at 390px through a real browser form POST", async ({ page, context }) => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db } = createApp(cfg);
  const now = new Date().toISOString();
  // Synthetic authenticated Google-style owner; no OIDC or provider request.
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('synthetic-owner','synthetic-google-subject','google',1,?)").run(now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('synthetic-owner','workspace-synthetic','Your business workspace')").run();
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,'synthetic-owner','synthetic-csrf',?)").run(sha256("synthetic-browser-session"), new Date(Date.now() + 60_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('synthetic-token','synthetic-owner',?,'progress:read,progress:report',1,?)").run(sha256("lp_synthetic-browser-token"), now);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "synthetic-browser", version: "1" });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await context.addCookies([{ name: "lp_session", value: "synthetic-browser-session", url: cfg.baseUrl }]);
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: "Bearer lp_synthetic-browser-token" } } }));
    const content = "Tere!\n\nInvoice 2026-014 for €1,240.00 is now 14 days overdue.\nPlease pay to EE00 0000 0000 0000 0000.\n\nAitäh,\nSynthetic Studio OÜ\n" + "Line of detail.\n".repeat(40);
    const result = await client.callTool({ name: "request_approval", arguments: { report_id: "browser-1", action: { kind: "send_message", recipient: { name: "Synthetic Client OÜ", address: "billing@client.example" }, amount_cents: 124000, period: "2026-10", document: { title: "Payment reminder: invoice 2026-014", content }, summary: "Polite reminder for overdue invoice 2026-014" } } });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    const req = result.structuredContent as { approval_id: string; digest: string; approve_url: string };

    await page.goto(cfg.baseUrl);
    await expect(page.getByRole("heading", { name: "Sinult on täna vaja üht asja" })).toBeVisible();
    await page.getByRole("link", { name: "Vaata kinnitust" }).click();
    expect(page.url()).toBe(req.approve_url);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Invoice 2026-014 · Synthetic Client OÜ");
    await expect(page.locator("dl.facts").getByText("Synthetic Client OÜ")).toBeVisible();
    await expect(page.getByText("1240,00\u00a0€", { exact: true })).toBeVisible();
    await expect(page.getByText("oktoober 2026", { exact: true })).toBeVisible();
    await expect(page.getByText(/Kehtib 24 tundi, kuni (homme|täna) kella \d{2}:\d{2}\u2011ni\./)).toBeVisible();
    // The digest is technical detail: hidden until Tehniline info is opened.
    await expect(page.getByText(req.digest)).toBeHidden();
    await page.getByText("Tehniline info").click();
    await expect(page.getByText(req.digest)).toBeVisible();
    // The full text is visible (no clamp, no inner scroll): the owner approves exactly this.
    await expect(page.locator("pre.letter")).toContainText("Please pay to EE00 0000 0000 0000 0000.");
    expect(await page.locator("pre.letter").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/approval-card-390.png`, fullPage: true });

    // Genuine same-origin form POST: must carry a real Origin (not null) and the CSRF field.
    await page.getByRole("button", { name: "Kinnita täpselt see" }).click();
    await expect(page).toHaveURL(req.approve_url);
    await expect(page.locator("main [role=status]")).toContainText("Nüüd on assistendi kord.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Kinnitatud \d{2}:\d{2}$/);
    await expect(page.getByRole("button", { name: "Kinnita täpselt see" })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/approval-approved-390.png`, fullPage: true });

    const after = await client.callTool({ name: "get_approval", arguments: { approval_id: req.approval_id } });
    expect((after.structuredContent as { state: string }).state).toBe("approved");
  } finally { await client.close(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
