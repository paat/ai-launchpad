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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Soovitame: Claude Pro");
    await expect(page.locator("#alusta-prompt")).toBeVisible();
    expect(await page.locator("#alusta-prompt").inputValue()).not.toContain("saladusXYZ");
    await expect(page.getByText("Näidis", { exact: true })).toBeVisible();
    await noScroll(page);
  });
}

test("Merit Aktiva and Gmail stays on one route at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await pastCompany(page);
  await page.locator("#alusta-text").fill("Merit Aktiva and Gmail");
  await page.getByRole("button", { name: "Edasi" }).click();
  const understood = page.locator(".bubble").filter({ hasText: "Merit Aktiva → via Werkzeug" });
  await expect(understood).toBeVisible();
  const fix = page.getByRole("button", { name: "Paranda" });
  const question = page.getByRole("heading", { level: 1 });
  const bubbleBox = await understood.boundingBox();
  const fixBox = await fix.boundingBox();
  const questionBox = await question.boundingBox();
  expect(bubbleBox && fixBox && questionBox && bubbleBox.y < fixBox.y && fixBox.y < questionBox.y).toBe(true);
  await page.getByRole("button", { name: "Mul pole veel", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Soovitame: Claude Pro");
  const connectCount = await page.locator("ol.steps li").evaluateAll((els) => els.filter((el) => /^Ühenda\s/.test(el.textContent ?? "")).length);
  expect(connectCount).toBeLessThanOrEqual(2);
  await expect(page.getByText("Lülita Claude'is sisse Gmail (see on sisse ehitatud)")).toBeVisible();
  const prompt = await page.locator("#alusta-prompt").inputValue();
  expect(prompt).toContain("Merit Aktiva");
  expect(prompt).toContain("Gmail");
  expect(prompt).not.toMatch(/merit-aktiva|google-gmail|MCP/);
  const summary = page.locator("details.why-more summary");
  await expect(summary).toHaveText("Miks just see?");
  expect(await summary.evaluate(lineCount)).toBe(1);
  await summary.click();
  const caption = page.locator("table.why caption");
  await expect(caption).toHaveText("Miks?");
  expect(await caption.evaluate(lineCount)).toBe(1);
  expect(await page.locator("table.why thead").evaluate((el) => getComputedStyle(el).display)).toBe("none");
  expect(await page.locator("table.why tbody tr").first().evaluate((el) => getComputedStyle(el).display)).toBe("block");
  await noScroll(page);
});

function lineCount(el: Element): number {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top)));
  return tops.size;
}
