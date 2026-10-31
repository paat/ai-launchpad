import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });

for (const width of [390, 320]) {
  test(`real HTML form demo login + Täna + management pages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Proovi näidisettevõttega" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/login-${width}.png`, fullPage: true });

    // A genuine browser form POST (this is the Origin/referrer regression).
    await page.getByRole("button", { name: /Mari Disain/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "et");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Sinult on täna vaja|^Täna pole sinult midagi vaja/);
    await expect(page.locator("main h2").nth(0)).toHaveText(/^Ootab sinult/);
    await expect(page.locator("main h2").nth(1)).toHaveText(/^Assistent tegi/);
    await expect(page.locator("main h2").nth(2)).toHaveText(/^Tulekul/);
    await expect(page.getByText("Lase assistendil tasumata arvetele meeldetuletused koostada", { exact: false }).first()).toBeVisible();
    await expect(page.locator(".sample-bar .label-chip--sample")).toHaveText("Näidis");
    await expect(page.getByText("Lisaks teeb raamatupidaja: KMD ettevalmistus (assistendi hinnang).")).toBeVisible();
    // No horizontal overflow at phone widths.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/tana-${width}.png`, fullPage: true });

    // The single summary disclosure opens on tap and keeps the assessment detail.
    await page.getByText("Kuidas see kokku pandi").click();
    await expect(page.getByText("Säästetud aega ei ole mõõdetud, seega me seda ei näita.")).toBeVisible();
    await expect(page.getByText(/Arvete koostamine — teed praegu ise/)).toBeVisible();

    // Data and permissions (English management page): grant sharing, issue a token (shown once, never in the URL).
    await page.goto("/uhenda");
    await page.getByRole("link", { name: "Andmed ja õigused" }).last().click();
    await expect(page).toHaveURL(/\/connection$/);
    const stop = page.getByRole("button", { name: "Stop progress sharing" });
    if (await stop.isVisible()) await stop.click();
    await expect(page.getByText(/Currently:/)).toContainText("off");
    await page.getByRole("button", { name: "Allow progress sharing" }).click();
    await expect(page.getByText(/Currently:/)).toContainText("on");
    await expect(page.getByRole("button", { name: /Issue assistant token/ })).toBeHidden();
    await page.getByText("Advanced: manual tokens").click();
    await page.getByRole("button", { name: /Issue assistant token/ }).click();
    await expect(page.getByRole("heading", { name: "Your new assistant token" })).toBeVisible();
    expect(page.url()).not.toContain("lp_");
    await page.screenshot({ path: `${SHOTS}/connection-${width}.png`, fullPage: true });

    await page.goto("/connection");
    await page.getByRole("button", { name: "Stop progress sharing" }).click();
    await expect(page.getByText(/Currently:/)).toContainText("off");

    // Tehtud shows the seeded sample honestly, in plain verbs.
    await page.getByRole("navigation", { name: "Peamenüü" }).getByRole("link", { name: "Tehtud", exact: true }).click();
    await expect(page.getByText("Näidisandmed laaditi")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/tehtud-${width}.png`, fullPage: true });
  });
}

test("second synthetic business has a different next action; English on request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Kase Konsult/ }).click();
  await expect(page.getByText("Taasta raamatupidamise ühendus").first()).toBeVisible();
  await page.getByRole("link", { name: /^EN/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("main h2").nth(0)).toHaveText(/^Needs you/);
  // The choice persists in the lang cookie.
  await page.goto("/activity");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Done");
  await page.goto("/?lang=et");
  // Desktop keeps the same single-column view without overflow.
  await page.setViewportSize({ width: 1280, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/tana-desktop.png`, fullPage: true });
});

test("OAuth consent approve and reject through real browser form POSTs", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Local SDK-style public client; the synthetic loopback callback is served
  // by a genuine temporary node:http server on 127.0.0.1, so the consent
  // 302 redirect performs real loopback transport and no external request
  // ever happens. (A page.route interception for the redirect target is
  // unreliable: the handler only fires for the first URL when the response
  // is a redirect, and bundled Chromium never renders the fulfilled body.)
  const seen: string[] = [];
  const callback: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    // Ignore non-callback hits (e.g. /favicon.ico); record only the
    // consent redirects this test asserts on.
    if (!url.startsWith("/callback")) {
      res.writeHead(204).end();
      return;
    }
    seen.push(url);
    res.writeHead(200, { "content-type": "text/html" }).end("<html><body><p>synthetic callback received</p></body></html>");
  });
  await new Promise<void>((resolve) => callback.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${(callback.address() as AddressInfo).port}/callback`;
  try {
    const reg = await request.post("/register", { data: { redirect_uris: [redirectUri], client_name: "Browser consent test", token_endpoint_auth_method: "none" } });
    expect(reg.ok()).toBeTruthy();
    const client = await reg.json();
    const authUrl = (state: string) => "/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: "http://127.0.0.1:3210/mcp", code_challenge: "a".repeat(43), code_challenge_method: "S256", state, scope: "progress:read" });

    // Start from /authorize, then sign in through the real demo form.
    await page.goto(authUrl("browser-state-approve"));
    await page.getByRole("button", { name: /Mari Disain/ }).click();
    await expect(page).toHaveURL(/\/oauth\/consent/);
    await expect(page.getByRole("heading", { name: "Ühenda Browser consent test AI-hüppelauaga?" })).toBeVisible();
    await expect(page.getByText("Tagasi: 127.0.0.1")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/consent-390.png`, fullPage: true });
    // Genuine same-origin form POST: must carry a real Origin (not null).
    await page.getByRole("button", { name: "Ühenda", exact: true }).click();
    await expect(page.getByText("synthetic callback received")).toBeVisible();
    expect(page.url()).toContain("code=");
    expect(page.url()).toContain("state=browser-state-approve");
    // The real callback server observed approve: state round-trips and a
    // code is present (booleans only; no credential values leave the page).
    const approve = new URL(seen[seen.length - 1]!, "http://127.0.0.1");
    expect(approve.searchParams.get("state")).toBe("browser-state-approve");
    expect(approve.searchParams.has("code")).toBe(true);

    // A second flow from the same browser rejects cleanly.
    await page.goto(authUrl("browser-state-reject"));
    await expect(page).toHaveURL(/\/oauth\/consent/);
    await page.getByRole("button", { name: "Ära ühenda" }).click();
    await expect(page.getByText("synthetic callback received")).toBeVisible();
    expect(page.url()).toContain("error=access_denied");
    expect(page.url()).not.toContain("code=");
    // The real callback server observed reject: access_denied, no code.
    const reject = new URL(seen[seen.length - 1]!, "http://127.0.0.1");
    expect(reject.searchParams.get("error")).toBe("access_denied");
    expect(reject.searchParams.has("code")).toBe(false);
    expect(seen.length).toBe(2);
  } finally {
    await new Promise<void>((resolve, reject) => callback.close((err) => (err ? reject(err) : resolve())));
  }
});
