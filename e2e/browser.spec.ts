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
    await expect(page.getByRole("heading", { name: "One thing needs you" })).toBeVisible();
    await expect(page.getByText("Connect invoicing to your assistant")).toBeVisible();
    await expect(page.getByText(/Independently verified outcomes: 0/)).toBeVisible();
    await expect(page.getByText("Synthetic demo · mock data")).toBeVisible();
    // No horizontal overflow at phone widths.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/status-${width}.png`, fullPage: true });

    // Evidence details open on tap.
    await page.getByText(/Responsibilities & evidence/).click();
    await expect(page.getByText("Sales invoicing")).toBeVisible();

    // Connection: grant sharing, issue a token (shown once, never in the URL).
    await page.getByRole("link", { name: "Connection" }).click();
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
});
