import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });

for (const width of [390, 320]) {
  test(`real HTML form demo login + primary actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/login");
    await expect(page.getByText("Local synthetic demo")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/login-${width}.png`, fullPage: true });

    // A genuine browser form POST (this is the Origin/referrer regression).
    await page.getByRole("button", { name: /Demo Plumbing/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Your next step" })).toBeVisible();
    await expect(page.getByText("Connect invoicing to your assistant")).toBeVisible();
    await expect(page.getByText(/Your assistant.s assessment · not independently checked/)).toBeVisible();
    await expect(page.getByText("Needs you")).toBeVisible();
    await expect(page.getByText(/Independently verified: 0/)).toBeVisible();
    await expect(page.getByText("Synthetic demo · mock data")).toBeVisible();
    await expect(page.getByText(/Assessed .* UTC/).first()).toBeVisible();
    await expect(page.getByText("Needs attention")).toBeVisible();
    // No horizontal overflow at phone widths.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/status-${width}.png`, fullPage: true });

    // The single Assessment details disclosure opens on tap and keeps all
    // detail content: responsibilities, conclusion, savings, timestamp.
    await page.getByText("Assessment details").click();
    await expect(page.getByText("Sales invoicing")).toBeVisible();
    await expect(page.getByText(/Responsibilities & evidence/)).toBeVisible();
    await expect(page.getByText(/Synthetic fixture: bookkeeping prep/)).toBeVisible();
    await expect(page.getByText("Savings not measured yet.")).toBeVisible();
    await expect(page.getByText("Unknown; unmeasured")).toHaveCount(0);

    // Connection: grant sharing, issue a token (shown once, never in the URL).
    await page.getByRole("link", { name: "Connection", exact: true }).click();
    // Demo owners persist across viewport cases; reset through the actual UI.
    const stop = page.getByRole("button", { name: "Stop progress sharing" });
    if (await stop.isVisible()) await stop.click();
    await expect(page.getByText(/Currently:/)).toContainText("off");
    await page.getByRole("button", { name: "Allow progress sharing" }).click();
    await expect(page.getByText(/Currently:/)).toContainText("on");
    await page.getByRole("button", { name: /Issue assistant token/ }).click();
    await expect(page.getByRole("heading", { name: "Your new assistant token" })).toBeVisible();
    expect(page.url()).not.toContain("lp_");
    await page.screenshot({ path: `${SHOTS}/connection-${width}.png`, fullPage: true });

    await page.getByRole("link", { name: "Connection", exact: true }).click();
    await page.getByRole("button", { name: "Stop progress sharing" }).click();
    await expect(page.getByText(/Currently:/)).toContainText("off");

    // Activity shows the seeded synthetic fixture honestly.
    await page.getByRole("link", { name: "Activity" }).click();
    await expect(page.getByText(/Synthetic demo fixture/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/activity-${width}.png`, fullPage: true });
  });
}

test("second synthetic business has a different next action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Demo Bakery/ }).click();
  await expect(page.getByText("Reconnect bookkeeping access")).toBeVisible();
  // Desktop keeps the same single-column view without overflow.
  await page.setViewportSize({ width: 1280, height: 800 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/status-desktop.png`, fullPage: true });
});

test("Copy next step copies the prompt, with a manual fallback on failure", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Demo Plumbing/ }).click();
  await expect(page.getByRole("heading", { name: "Your next step" })).toBeVisible();
  const copy = page.getByRole("button", { name: "Copy next step" });
  await expect(copy).toBeVisible();
  await expect(page.getByText("Paste into your assistant.")).toBeVisible();

  // Success wiring: capture exactly what the page asks the clipboard to write.
  await page.evaluate(() => {
    (window as unknown as { __copied: string | null }).__copied = null;
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: (t: string) => {
          (window as unknown as { __copied: string | null }).__copied = t;
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
  await copy.click();
  await expect(page.getByText("Copied — paste it into your assistant.")).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { __copied: string | null }).__copied);
  expect(copied).toContain("Connect invoicing to your assistant");
  expect(copied).toContain("Removes hand-written invoices after every job");

  // Deterministic failure: clipboard rejects, so the manual fallback appears
  // with the same prompt in a readonly text area.
  await page.evaluate(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
  });
  await copy.click();
  await expect(page.getByText("Copy failed — select the text below")).toBeVisible();
  const fallback = page.locator("#copy-next-text");
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveValue(/Connect invoicing to your assistant/);
  await expect(fallback).toHaveValue(/Removes hand-written invoices after every job/);
});

test("OAuth consent approve and reject through real browser form POSTs", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Local SDK-style public client; the synthetic loopback callback is
  // intercepted in the browser so no external request ever happens.
  const reg = await request.post("/register", { data: { redirect_uris: ["http://127.0.0.1:45678/callback"], client_name: "Browser consent test", token_endpoint_auth_method: "none" } });
  expect(reg.ok()).toBeTruthy();
  const client = await reg.json();
  const authUrl = (state: string) => "/authorize?" + new URLSearchParams({ response_type: "code", client_id: client.client_id, redirect_uri: client.redirect_uris[0], resource: "http://127.0.0.1:3210/mcp", code_challenge: "a".repeat(43), code_challenge_method: "S256", state, scope: "progress:read" });
  await page.route("http://127.0.0.1:45678/callback**", async (route) => {
    await route.fulfill({ status: 200, contentType: "text/html", body: `<html><body><p>synthetic callback received</p><p>${route.request().url()}</p></body></html>` });
  });

  // Start from /authorize, then sign in through the real demo form.
  await page.goto(authUrl("browser-state-approve"));
  await page.getByRole("button", { name: /Demo Plumbing/ }).click();
  await expect(page).toHaveURL(/\/oauth\/consent/);
  await expect(page.getByRole("heading", { name: /Connect Browser consent test/ })).toBeVisible();
  // Genuine same-origin form POST: must carry a real Origin (not null).
  await page.getByRole("button", { name: "Connect assistant" }).click();
  await expect(page.getByText("synthetic callback received")).toBeVisible();
  expect(page.url()).toContain("code=");
  expect(page.url()).toContain("state=browser-state-approve");

  // A second flow from the same browser rejects cleanly.
  await page.goto(authUrl("browser-state-reject"));
  await expect(page).toHaveURL(/\/oauth\/consent/);
  await page.getByRole("button", { name: "Reject connection" }).click();
  await expect(page.getByText("synthetic callback received")).toBeVisible();
  expect(page.url()).toContain("error=access_denied");
  expect(page.url()).not.toContain("code=");
});
