import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// The public landing (owner request 2026-10-30): hero, the pure-CSS chat
// teaser, the 4 jobs and the 3 start steps at phone and desktop width. TEASER_VIDEO_DIR also
// records a 20 s loop at 390 px for the demo B-roll (the page renders at DPR 2;
// Playwright records the video at CSS-pixel size, 390×844).
const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Pause every CSS animation at one moment of the 18 s loop. */
const seek = (page: Page, ms: number) => page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), ms);
const opacity = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
/** The final frame: the whole card (with the standing-approval chip) and the last bubble sit inside the visible chat. */
const finalFrameFits = async (page: Page) => {
  const box = (sel: string) => page.locator(sel).evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const chat = await box(".chat");
  for (const sel of [".b-card", ".mock-rule", ".b-ai2"]) {
    const b = await box(sel);
    expect(b.top, sel).toBeGreaterThanOrEqual(chat.top);
    expect(b.bottom, sel).toBeLessThanOrEqual(chat.bottom + 0.5);
  }
};

for (const width of [390, 1280]) {
  test(`landing at ${width}px: hero, teaser frame, 4 jobs and 3 steps, no overflow, no script`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tegele sellega, milles oled hea. Kontoritöö teeb sinu AI-assistent.");
    await expect(page.getByRole("link", { name: "Ühenda oma assistent" })).toHaveAttribute("href", "/uhenda");
    await expect(page.locator(".phone")).toBeVisible();
    await expect(page.locator(".phone")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".teaser figcaption .label-chip--sample")).toHaveText("Näidis");
    await expect(page.locator(".jobs li")).toHaveCount(4);
    await expect(page.locator(".how li")).toHaveCount(3);
    for (const li of await page.locator(".jobs li, .how li").all()) await expect(li).toBeVisible();
    // Jobs: 2×2 on desktop, stacked on the phone.
    const tops = await page.locator(".jobs li").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(width === 1280 ? 2 : 4);
    await expect(page.locator("form, input:not(#teaser-pause)")).toHaveCount(0);
    expect(await page.locator("script").count()).toBe(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const cta = await page.getByRole("link", { name: "Ühenda oma assistent" }).boundingBox();
    expect(cta!.height).toBeGreaterThanOrEqual(44);
    if (width === 1280) {
      // Desktop: the teaser sits beside the hero text, not below it.
      const h1 = (await page.locator("h1").boundingBox())!, phone = (await page.locator(".phone").boundingBox())!;
      expect(phone.x).toBeGreaterThan(h1.x + h1.width);
    }
    // The loop: who owes me, typing, the overdue total; the card and its approval; then the standing approval; then the KMD offer.
    await seek(page, 3000);
    expect(await opacity(page, ".b-t1")).toEqual([1]);
    expect(await opacity(page, ".b-card")).toEqual([0]);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-03s.png`, fullPage: true });
    await seek(page, 7500);
    expect(await opacity(page, ".b-card, .mock-done, .mock-ok")).toEqual([1, 1, 1]);
    expect(await opacity(page, ".mock-approve, .mock-wait, .b-allow")).toEqual([0, 0, 0]);
    await seek(page, 9000);
    expect(await opacity(page, ".b-allow, .mock-allow, .mock-rule")).toEqual([1, 1, 0]);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-09s.png`, fullPage: true });
    await seek(page, 11000);
    expect(await opacity(page, ".mock-allow, .mock-rule, .b-t2, .b-ai2")).toEqual([0, 1, 1, 0]);
    await seek(page, 14000);
    expect(await opacity(page, ".b-ai2, .mock-rule, .mock-done")).toEqual([1, 1, 1]);
    await finalFrameFits(page);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-14s.png`, fullPage: true });
    await page.locator(".teaser").evaluate((e) => e.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${SHOTS}/landing-${width}-final.png` });
    if (width === 390) await page.screenshot({ path: `${SHOTS}/landing-390-full.png`, fullPage: true });
  });
}

for (const width of [880, 960, 1024, 1094, 1200]) {
  test(`no horizontal overflow at ${width}px (tribunal T-001)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("pause toggle: keyboard-focusable, 44 px, stops the animation without script (tribunal T-004)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const label = page.getByText("Peata animatsioon");
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const states = () => page.evaluate(() => [...new Set(document.getAnimations().map((a) => a.playState))]);
  expect(await states()).toEqual(["running"]);
  await page.getByRole("link", { name: "Ühenda oma assistent" }).focus();
  await page.keyboard.press("Tab"); // next stop is the pause toggle
  await expect(page.locator("#teaser-pause")).toBeFocused();
  expect(await label.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
  await page.keyboard.press("Space");
  await expect(page.locator("#teaser-pause")).toBeChecked();
  expect(await states()).toEqual(["paused"]);
  expect(await page.locator(".b-card").evaluate((e) => getComputedStyle(e).animationPlayState)).toBe("paused");
  await label.click();
  expect(await states()).toEqual(["running"]);
  await page.locator("#teaser-pause").focus();
  await page.screenshot({ path: `${SHOTS}/teaser-390-pause-focus.png`, fullPage: true });
});

test("320px: no overflow; reduced motion shows the final frame statically", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await opacity(page, ".beat:not(.beat--typing)")).toEqual([1, 1, 1, 1, 1]);
  expect(await page.locator(".beat--typing").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).toEqual([0, 0]);
  expect(await opacity(page, ".mock-wait, .mock-ok, .mock-approve, .mock-done, .mock-allow, .mock-rule")).toEqual([0, 1, 0, 1, 0, 1]);
  await expect(page.locator(".mock-done")).toHaveText("✓ Kinnitatud · Saadetud: demo");
  await expect(page.locator(".mock-rule")).toHaveText("Püsiluba: meeldetuletused kuni 500\u00a0€");
  await finalFrameFits(page);
  await page.screenshot({ path: `${SHOTS}/teaser-320-reduced-motion.png`, fullPage: true });
});

test("EN: ?lang=en renders the same page in English", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Focus on what you're good at. Your AI assistant does the office work.");
  await expect(page.getByRole("link", { name: "Connect your assistant" })).toHaveAttribute("href", "/uhenda");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await finalFrameFits(page);
  await page.screenshot({ path: `${SHOTS}/teaser-390-en.png`, fullPage: true });
});

test("B-roll: 20 s of the loop at 390 px, DPR 2", async ({ browser }) => {
  const dir = process.env.TEASER_VIDEO_DIR;
  test.skip(!dir, "set TEASER_VIDEO_DIR to record");
  test.setTimeout(90_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, recordVideo: { dir: dir!, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await page.goto("/");
  // Show the phone, then restart the loop so the recording begins at the first message.
  await page.locator(".teaser").evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.currentTime = 0; }));
  await page.waitForTimeout(20_000);
  await context.close();
  await page.video()!.saveAs(`${dir}/teaser-loop-390.webm`);
  await page.video()!.delete();
});
