import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Public catalogue in a real browser: no login, no overflow, 44 px targets.
const SHOTS = process.env.CATALOGUE_SHOT_DIR ?? "/workspace/ai-launchpad/scratch/run-1029/catalogue-shots";
mkdirSync(SHOTS, { recursive: true });

for (const width of [320, 390, 1280]) {
  test(`public /kataloog at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/kataloog");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Teenused, mida sinu AI-assistent saab kasutada");
    expect(await page.locator("script").count()).toBe(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // Every link and button in the catalogue is at least 44 px tall.
    const small = await page.locator("main a, main button").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent));
    expect(small).toEqual([]);
    await page.screenshot({ path: `${SHOTS}/kataloog-${width}.png`, fullPage: width !== 390 });
    if (width === 390) await page.screenshot({ path: `${SHOTS}/kataloog-390-full.png`, fullPage: true });
    if (width === 390) await page.screenshot({ path: `${SHOTS}/kataloog-390-v2.png`, fullPage: true });
    await expect(page.locator("ul.legend")).toContainText("telefonis küsid ja kinnitad liikvel olles");
    await expect(page.locator("article.svc[data-service]").first().locator(".label-chip--where")).toHaveCount(1);

    await page.getByRole("link", { name: /^Raamatupidamine ja arved/ }).click();
    await expect(page).toHaveURL(/\/kataloog\?g=raamatupidamine$/);
    await expect(page.locator("article.svc[data-service]").first()).toContainText("Avab töövoo: KMD ettevalmistus / Maksemeeldetuletus");
    await page.getByLabel("Otsi nime või töö järgi").fill("merit");
    await page.getByRole("button", { name: "Otsi" }).click();
    await expect(page).toHaveURL(/g=raamatupidamine&q=merit/);
    expect(await page.locator("article.svc[data-service]").count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    if (width === 390) { await page.evaluate(() => document.querySelector("nav.chips")!.scrollIntoView()); await page.screenshot({ path: `${SHOTS}/kataloog-390-filtered.png` }); }
  });
}
