import { test, expect } from "@playwright/test";

async function noScroll(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

async function pastCompany(page: import("@playwright/test").Page) {
  await page.goto("/alusta");
  await page.waitForTimeout(2100);
  await page.locator("#alusta-q").fill("Synthetic Name");
  await page.getByRole("button", { name: "Otsi" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Register ei vasta praegu");
  await page.getByRole("button", { name: "Jätkan ilma ettevõtteta" }).click();
}

for (const width of [390, 1280]) {
  test(`no assistant at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await pastCompany(page);
    await page.getByRole("button", { name: "Jätan vahele" }).click();
    await page.getByRole("button", { name: "Mul pole veel", exact: true }).click();
    await expect(page.locator("#alusta-prompt")).toBeVisible();
    await expect(page.getByText("Näidisplaan")).toBeVisible();
    await noScroll(page);
  });

  test(`Claude Pro at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await pastCompany(page);
    await page.locator("#alusta-text").fill("saladusXYZ");
    await page.getByRole("button", { name: "Edasi" }).click();
    await page.getByRole("button", { name: "Claude", exact: true }).click();
    await page.getByRole("button", { name: "Claude Pro", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Claude Pro");
    await expect(page.locator("#alusta-prompt")).toBeVisible();
    expect(await page.locator("#alusta-prompt").inputValue()).not.toContain("saladusXYZ");
    await expect(page.getByText("Näidis")).toBeVisible();
    await noScroll(page);
  });
}
