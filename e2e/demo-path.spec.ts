import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createApp, type Config } from "../src/app.js";
import { sha256 } from "../src/db.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Issue #21 demo path at 390 px: landing → connect → consent → approval → Täna → open demand.
// Synthetic data only; no external request (Ärikratt and models are not configured).
const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const parsed = (r: unknown) => (r as { structuredContent: Record<string, unknown> }).structuredContent;

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

test("public landing: what the product does, then Connect leads to /uhenda", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "et");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tegele sellega, milles oled hea. Kontoritöö teeb sinu AI-assistent.");
  await expect(page.locator("main .label-chip--sample").first()).toHaveText("Näidis");
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/landing-390.png`, fullPage: true });
  await page.locator(".landing-hero").getByRole("link", { name: "Ühenda oma assistent" }).click();
  await expect(page).toHaveURL(/\/uhenda$/);
});

test("/uhenda: Claude preselected (QA m11), ChatGPT one tap away, no phone hand-off without public HTTPS, no overflow, sign-in chip for visitors", async ({ page }) => {
  await page.goto("/uhenda");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ühenda oma assistent");
  // „Lihtsaim algus: Claude”, so the Claude tab is the one selected.
  await expect(page.getByRole("link", { name: "Claude", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "ChatGPT", exact: true })).not.toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "Ava Claude — juhend on juba sees" })).toHaveCount(0);
  // The local server has no public HTTPS address, so there is no open button, no prompt, no QR and no phone-URL card (QA D-14).
  await expect(page.getByRole("heading", { name: "Jätka telefonis" })).toHaveCount(0);
  await expect(page.locator(".qr-card")).toHaveCount(0);
  await expect(page.getByText("Näita teksti")).toHaveCount(0);
  await expect(page.locator(".connect-hero").getByText("Avalik HTTPS-aadress pole selles serveris veel seadistatud", { exact: false })).toBeVisible();
  await expect(page.locator("#connect-status")).toContainText("Logi sisse");
  expect(await page.locator('meta[http-equiv="refresh"]').count()).toBe(0);
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/uhenda-390.png`, fullPage: true });
  // The old steps and the plan line stay, folded under „Tee ise”.
  await page.locator("#steps-h").click();
  await expect(page.getByText("Testitud Claude'i tasuta paketis (30.10.2026).", { exact: false })).toBeVisible();
  await expect(page.getByText("Vajuta Connect, logi sisse ja kinnita. Kui Claude küsib tööriista luba, vajuta Allow.")).toBeVisible();
  await page.getByRole("link", { name: "ChatGPT", exact: true }).click();
  await expect(page.getByRole("link", { name: "ChatGPT", exact: true })).toHaveAttribute("aria-current", "true");
  await page.locator("#steps-h").click();
  await expect(page.getByText("Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.", { exact: false })).toBeVisible();
});

test("/uhenda for a sample owner: „Käest ära” before the setup steps, no amber local-setup notice (QA M2)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Mari Disain/ }).click();
  await page.goto("/uhenda");
  const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y;
  expect(await y("#kaest-ara")).toBeLessThan(await y("#steps-h"));
  await expect(page.locator(".connect-hero").getByText("Avalik HTTPS-aadress pole selles serveris veel seadistatud", { exact: false })).toBeVisible();
  await expect(page.locator("#connect-status")).toContainText("Näidistööruumis ühenduse olekut ei jälgita.");
  // Neither local-setup notice needs the owner, so neither wears the attention amber (#FFF4D6 / #F0C36B).
  const amber = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => { const c = getComputedStyle(el); return [c.backgroundColor, c.borderTopColor].some((v) => v === "rgb(255, 244, 214)" || v === "rgb(240, 195, 107)") && /HTTPS|ühenduse olekut/.test(el.textContent ?? ""); }).length);
  expect(amber).toBe(0);
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/uhenda-sample-390-fold.png` });
  await page.setViewportSize({ width: 1280, height: 800 });
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/uhenda-sample-1280.png`, fullPage: true });
});

test("consent names the one job permission, unchecked by default", async ({ page, request }) => {
  const reg = await request.post("/register", { data: { redirect_uris: ["http://127.0.0.1:9/callback"], client_name: "ChatGPT", token_endpoint_auth_method: "none" } });
  const client = await reg.json();
  await page.goto("/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: "http://127.0.0.1:3210/mcp", code_challenge: "a".repeat(43), code_challenge_method: "S256", state: "s", scope: "progress:read progress:report" }));
  await page.getByRole("button", { name: /Mari Disain/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ühenda ChatGPT AI-hüppelauaga?");
  const box = page.getByRole("checkbox", { name: "Jah: ChatGPT valmistab ette kirjad, arved ja deklaratsioonid ning küsib iga kord sinult kinnitust" });
  await expect(box).not.toBeChecked();
  expect((await box.boundingBox())!.height).toBeLessThanOrEqual(24);
  await expect(page.getByText("Hiljem lisamiseks tuleb ChatGPT uuesti ühendada.", { exact: false })).toBeVisible();
  await expect(page.getByText("progress:report", { exact: false }).first()).toBeHidden(); // scope ids only under Tehniline info
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/consent-report-390.png`, fullPage: true });
});

test("Täna, approval card, stale digest, receipt, unmet need and open demand (in-process synthetic owner)", async ({ page, context }) => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db, unmetNeeds } = createApp(cfg);
  const now = new Date().toISOString();
  // A synthetic demo owner: Mari Disain OÜ (näidis), sharing on, one manual token.
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('mari','demo-alpha','demo',1,?)").run(now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label,version) VALUES('mari','ws-mari','Mari Disain OÜ (näidis)',1)").run();
  db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES('asmt-mari','mari',1,?,'h',?)").run(JSON.stringify(DEMO_FIXTURES.alpha), now);
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,'mari','csrf-mari',?)").run(sha256("sess-mari"), new Date(Date.now() + 3600_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('tok-mari','mari',?,'progress:read,progress:report',1,?)").run(sha256("lp_tok-mari"), now);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const c = new Client({ name: "synthetic-demo-path", version: "1" });
  try {
    await context.addCookies([{ name: "lp_session", value: "sess-mari", url: cfg.baseUrl }]);
    await c.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: "Bearer lp_tok-mari" } } }));
    const letter = "Tere!\n\nMeie arve nr 2026-014 (20.10.2026) summas 240,00 € on veel tasumata; maksetähtaeg oli 20. oktoober. Palun tasuge see lähiajal. Kui olete juba maksnud, pidage see kiri tühjaks.\n\nAitäh,\nMari";
    const action = (title: string) => ({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10", document: { title, content: letter }, summary: "Demo Klient OÜ pole arvet tasunud; maksetähtaeg oli 20. oktoober." });
    const req = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "reminder-1", action: action("Maksemeeldetuletus: arve 2026-014") } })) as { approval_id: string; digest: string; approve_url: string };
    await c.callTool({ name: "report_progress", arguments: { report_id: "p-1", task_id: "vat-prep", expected_version: 1, observed_at: new Date().toISOString(), milestone: "draft_prepared" } });

    // Täna: three cards in order, the approval leads.
    await page.goto(cfg.baseUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Sinult on täna vaja/);
    const h2 = page.locator("main h2");
    await expect(h2.nth(0)).toHaveText(/^Ootab sinult/);
    await expect(h2.nth(1)).toHaveText(/^Assistent tegi/);
    await expect(h2.nth(2)).toHaveText(/^Tulekul/);
    await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/tana-pending-390.png`, fullPage: true });

    // Stale card: the content changed after it was shown → error inside the shell, nothing approved.
    const other = parsed(await c.callTool({ name: "request_approval", arguments: { report_id: "reminder-2", action: action("Maksemeeldetuletus: arve 2026-015") } })) as { approval_id: string; approve_url: string };
    await page.goto(other.approve_url);
    await page.locator('input[name="digest"]').evaluate((el) => { (el as HTMLInputElement).value = "0".repeat(64); });
    await page.getByRole("button", { name: "Kinnita täpselt see" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kaart on vananenud");
    await expect(page.getByText("Midagi muutus pärast seda, kui kaardi avasid. Midagi ei kinnitatud. Ava kinnitus uuesti.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tagasi: Täna" })).toHaveAttribute("href", "/");
    await page.screenshot({ path: `${SHOTS}/approval-stale-390.png`, fullPage: true });
    expect((parsed(await c.callTool({ name: "get_approval", arguments: { approval_id: other.approval_id } })) as { state: string }).state).toBe("pending");

    // Approval card → approve → hand the turn back.
    await page.goto(cfg.baseUrl);
    await page.getByRole("link", { name: /Maksemeeldetuletus: arve 2026-014/ }).click();
    expect(page.url()).toBe(req.approve_url);
    await expect(page.getByText("Assistent valmistas ette", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kiri, täpselt sellisena" })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/approval-pending-390.png`, fullPage: true });
    await page.getByRole("button", { name: "Kinnita täpselt see" }).click();
    await expect(page.locator("main")).toContainText("Kinnitasin");
    await expect(page.locator("main")).toContainText("Nüüd on assistendi kord.");
    await page.screenshot({ path: `${SHOTS}/approval-approved-390.png`, fullPage: true });

    // The assistant acts with its own tools and records the outcome; the receipt leads with it.
    await c.callTool({ name: "record_action_outcome", arguments: { report_id: "out-1", approval_id: req.approval_id, digest: req.digest, outcome: "sent", observed_at: new Date().toISOString() } });
    await page.goto(req.approve_url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("✓ Saadetud: demo");
    await expect(page.getByText("Sinu kinnitusi selles töös: 1.")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/approval-receipt-390.png`, fullPage: true });

    // Täna: the reminder now sits under "Assistent tegi", with its recipient.
    await page.goto(cfg.baseUrl);
    const tegi = page.locator("#tegi");
    await expect(tegi).toContainText("Demo Klient OÜ");
    await expect(tegi).toContainText("Saadetud: demo");
    await expect(tegi).toContainText("Valmistas ette: KMD ettevalmistus");
    await page.screenshot({ path: `${SHOTS}/tana-after-390.png`, fullPage: true });

    // Unmet need → classified (local mock, labelled Näidis) → published only with the owner's OK.
    await c.callTool({ name: "report_unmet_need", arguments: { report_id: "need-1", need: "Esita minu oktoobri käibedeklaratsioon.", blocker: "needs_owner_pin_or_signature" } });
    await unmetNeeds.idle();
    await page.goto(cfg.baseUrl);
    const card = page.locator("#soovid");
    await expect(card.getByRole("heading", { level: 2 })).toHaveText("Seda ei saa assistent sinu eest teha");
    await expect(card).toContainText("valmistab kõik ette; PIN-i või allkirja annad sina");
    await expect(card.locator(".label-chip--sample")).toHaveText("Näidis");
    await card.screenshot({ path: `${SHOTS}/unmet-need-390.png` });
    await card.getByRole("button", { name: "Avalda anonüümselt" }).click();

    await page.goto(`${cfg.baseUrl}/demand`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Avatud soovid");
    await expect(page.locator("main section.card").nth(1)).toContainText("1 soov");
    await noOverflow(page);
    await page.screenshot({ path: `${SHOTS}/demand-390.png`, fullPage: true });
  } finally { await c.close(); await new Promise<void>((ok) => server.close(() => ok())); db.close(); }
});
