import { test, expect, type Page } from "@playwright/test";

const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const width of [390, 1280]) test(`interactive sandbox: sample to simulated sent and advanced handover at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
  await page.goto("/naidis");
  await page.getByRole("link", { name: "Proovi ise", exact: true }).click();
  await expect(page).toHaveURL(/\/proovi$/);
  await expect(page.getByText("Saad oma ajutise näidistööruumi väljamõeldud ettevõttega.", { exact: false })).toBeVisible();
  await noOverflow(page);

  await page.getByRole("button", { name: "Alusta", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".sample-bar")).toContainText("päriselt midagi ei saadeta");
  await expect(page.locator("#ootab")).toContainText("Maksemeeldetuletus: arve 2026-014");
  await expect(page.locator("#tegi")).toContainText("Saadetud: demo");
  await expect(page.locator("#tegi")).toContainText("Makstud: demo");
  await expect(page.locator("#tegi")).toContainText("Valmistas ette: KMD ettevalmistus");
  await noOverflow(page);

  await page.getByRole("link", { name: "Vaata kinnitust", exact: true }).click();
  await expect(page.getByRole("button", { name: "Kinnita täpselt see", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "Kinnita täpselt see", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("✓ Saadetud: demo");
  await expect(page.locator("main")).toContainText("päriselt ei saadetud");
  await expect(page.locator(".ho-strip")).toContainText("Käest ära:");
  await noOverflow(page);

  await page.locator(".ho-strip").click();
  const reminders = page.locator(".ho-job").filter({ hasText: "Maksemeeldetuletused" });
  await expect(reminders).toContainText("4 saadetud");
  await noOverflow(page);
});
