import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// The public landing (owner request 2026-10-30): hero, the carousel's chat
// teaser, the 8 jobs and the 4 start steps at phone and desktop width. TEASER_VIDEO_DIR also
// records a 20 s loop at 390 px for the demo B-roll (the page renders at DPR 2;
// Playwright records the video at CSS-pixel size, 390×844).
const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Pause every CSS animation at one moment of the 18 s loop. */
const seek = (page: Page, ms: number) => page.evaluate(async (t) => {
  await Promise.all(document.getAnimations().map((a) => a.ready));
  document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; });
}, ms);
const opacity = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
const UNPAID = '[data-job-conversation="unpaid"]:visible';
const scoped = (...selectors: string[]) => selectors.map((sel) => `${UNPAID} ${sel}`).join(", ");
const activateUnpaid = async (page: Page) => {
  await page.locator('[data-job-activate="unpaid"]').click();
  await page.waitForFunction(() => matchMedia("(prefers-reduced-motion: reduce)").matches || (document.querySelector('[data-job-conversation]:not([hidden])')?.getAnimations({ subtree: true }).length ?? 0) > 0);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.ready)));
  // Wait for the click's smooth scroll to settle instead of a fixed 180 ms (#69): the unpaid card
  // fully inside the track (±1 px, as the carousel's own scrollend handler judges it) and the same
  // scrollLeft on two consecutive animation frames — so a later full-page screenshot cannot
  // interrupt the scroll and hand the active card to a neighbour.
  await page.waitForFunction(() => {
    const track = document.querySelector("#job-track"), card = document.querySelector('[data-job-card="unpaid"]');
    if (!track || !card) return false;
    const r = card.getBoundingClientRect(), t = track.getBoundingClientRect();
    const inside = r.left >= t.left - 1 && r.right <= t.right + 1;
    const left = track.scrollLeft, w = window as typeof window & { __jobTrackScrollLeft?: number };
    const settled = w.__jobTrackScrollLeft === left;
    w.__jobTrackScrollLeft = left;
    return inside && settled;
  }, undefined, { polling: "raf" });
  await expect(page.locator(UNPAID)).toBeVisible();
};
/** The final frame: the owner's opening question (#63 m1), the whole card (with the standing-approval chip) and the last bubble sit inside the visible chat. */
const finalFrameFits = async (page: Page) => {
  const box = (sel: string) => page.locator(scoped(sel)).evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const chat = await box(".chat");
  for (const sel of [".b-unpaid-me1", ".b-unpaid-card", ".mock-rule", ".b-unpaid-ai2"]) {
    const b = await box(sel);
    expect(b.top, sel).toBeGreaterThanOrEqual(chat.top - 1);
    expect(b.bottom, sel).toBeLessThanOrEqual(chat.bottom + 1);
  }
};

for (const width of [390, 1280]) {
  test(`landing at ${width}px: hero, teaser frame, 8 jobs and 4 steps, no overflow, one carousel script`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await page.goto("/");
    await activateUnpaid(page);
    const conversation = page.locator(UNPAID);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tegele sellega, milles oled hea. Kontoritöö teeb sinu AI-assistent.");
    await expect(page.locator(".landing-hero").getByRole("link", { name: "Ühenda oma assistent" })).toHaveAttribute("href", "/uhenda");
    await expect(conversation.locator(".phone")).toBeVisible();
    await expect(conversation.locator(".phone")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".teaser figcaption .label-chip--sample")).toHaveText("Näidis");
    await expect(page.locator("#job-track > li")).toHaveCount(8);
    await expect(page.locator(".how li")).toHaveCount(4);
    for (const li of await page.locator("#job-track > li, .how li").all()) await expect(li).toBeVisible();
    await expect(page.locator("form, input:not(#teaser-pause)")).toHaveCount(0);
    await expect(page.locator("script")).toHaveCount(1);
    await expect(page.locator("script:not([src])")).toHaveCount(1);
    await expect(page.locator("script[src]")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const cta = await page.locator(".landing-hero").getByRole("link", { name: "Ühenda oma assistent" }).boundingBox();
    expect(cta!.height).toBeGreaterThanOrEqual(44);
    if (width === 1280) {
      // Desktop: the teaser sits beside the hero text, not below it.
      const h1 = (await page.locator("h1").boundingBox())!, phone = (await conversation.locator(".phone").boundingBox())!;
      expect(phone.x).toBeGreaterThan(h1.x + h1.width);
    }
    // The loop: who owes me, typing, the overdue total; the card and its approval; then the standing approval and the final bubble.
    await seek(page, 3000);
    expect(await opacity(page, scoped(".b-unpaid-t1"))).toEqual([1]);
    expect(await opacity(page, scoped(".b-unpaid-card"))).toEqual([0]);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-03s.png`, fullPage: true });
    await seek(page, 7500);
    expect(await opacity(page, scoped(".b-unpaid-card", ".mock-done", ".mock-ok"))).toEqual([1, 1, 1]);
    expect(await opacity(page, scoped(".mock-approve", ".mock-wait", ".b-unpaid-allow"))).toEqual([0, 0, 0]);
    await seek(page, 9000);
    expect(await opacity(page, scoped(".b-unpaid-allow", ".mock-allow", ".mock-rule"))).toEqual([1, 1, 0]);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-09s.png`, fullPage: true });
    await seek(page, 11000);
    expect(await opacity(page, scoped(".mock-allow", ".mock-rule", ".b-unpaid-t2", ".b-unpaid-ai2"))).toEqual([0, 1, 1, 0]);
    await seek(page, 14000);
    expect(await opacity(page, scoped(".b-unpaid-ai2", ".mock-rule", ".mock-done"))).toEqual([1, 1, 1]);
    await finalFrameFits(page);
    await page.screenshot({ path: `${SHOTS}/teaser-${width}-14s.png`, fullPage: true });
    await page.locator(".teaser").evaluate((e) => e.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: `${SHOTS}/landing-${width}-final.png` });
    if (width === 390) await page.screenshot({ path: `${SHOTS}/landing-390-full.png`, fullPage: true });
  });
}

test("390px: layout changes do not change the active job card (#69)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await activateUnpaid(page);
  for (const height of [600, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.screenshot({ path: `${SHOTS}/landing-390-resize-${height}.png`, fullPage: true });
    await expect(page.locator(".job-card--active")).toHaveAttribute("data-job-card", "unpaid");
    await expect(page.locator(UNPAID)).toBeVisible();
  }
});

test("390px: an owner wheel scroll activates the card it lands on", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const active = page.locator(".job-card--active");
  const initial = (await active.getAttribute("data-job-card"))!;
  await page.locator("#job-track").hover();
  await page.mouse.wheel(250, 0);
  await expect(active).not.toHaveAttribute("data-job-card", initial);
  await expect(page.locator(`[data-job-conversation="${await active.getAttribute("data-job-card")}"]`)).toBeVisible();
});

test("each of the 8 job cards shows exactly its own conversation in the phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const buttons = page.locator("[data-job-activate]");
  await expect(buttons).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    const button = buttons.nth(i), id = (await button.getAttribute("data-job-activate"))!;
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".job-card--active")).toHaveAttribute("data-job-card", id);
    await expect(page.locator("[data-job-conversation]:visible")).toHaveCount(1);
    await expect(page.locator(`[data-job-conversation="${id}"]`)).toBeVisible();
    await expect(page.locator(`[data-job-conversation="${id}"] .phone`)).toBeVisible();
  }
});

for (const width of [880, 960, 1024, 1094, 1200]) {
  test(`no horizontal overflow at ${width}px (tribunal T-001)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

// #63 m1: the opening question „Kes mulle võlgu on?” stays clear of the chat header in the final frame, in both languages.
for (const [width, height] of [[320, 568], [880, 800], [1280, 800], [1440, 900]] as const) {
  for (const lang of ["et", "en"] as const) {
    test(`final frame at ${width}px (${lang}) shows the opening question under the chat header`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/?lang=${lang}`);
      await activateUnpaid(page);
      await expect(page.locator(scoped(".b-unpaid-me1"))).toHaveText(lang === "et" ? "Kes mulle võlgu on?" : "Who owes me money?");
      await finalFrameFits(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      if (width === 1280 || width === 320) await page.locator(scoped(".phone")).screenshot({ path: `${SHOTS}/teaser-final-${width}-${lang}.png` });
    });
  }
}

test("pause toggle: keyboard-focusable, 44 px, stops the animation without script (tribunal T-004)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await activateUnpaid(page);
  const label = page.locator("label.teaser-pause");
  await expect(label).toHaveText("Peata animatsioon", { useInnerText: true });
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const states = () => page.evaluate(() => [...new Set(document.getAnimations().map((a) => a.playState))]);
  expect(await states()).toEqual(["running"]);
  await page.locator(".landing-hero").getByRole("link", { name: "Ühenda oma assistent" }).focus();
  await page.keyboard.press("Tab"); // next stop is the pause toggle
  await expect(page.locator("#teaser-pause")).toBeFocused();
  expect(await label.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
  await page.keyboard.press("Space");
  await expect(page.locator("#teaser-pause")).toBeChecked();
  expect(await states()).toEqual(["paused"]);
  expect(await page.locator(scoped(".b-unpaid-card")).evaluate((e) => getComputedStyle(e).animationPlayState)).toBe("paused");
  // #63 m2: paused, the visible label says how to resume; same size, same focus ring.
  await expect(label).toHaveText("Jätka animatsiooni", { useInnerText: true });
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await label.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe("solid");
  await label.click();
  expect(await states()).toEqual(["running"]);
  await expect(label).toHaveText("Peata animatsioon", { useInnerText: true });
  await page.locator("#teaser-pause").focus();
  await page.screenshot({ path: `${SHOTS}/teaser-390-pause-focus.png`, fullPage: true });
});

test("320px: no overflow; reduced motion shows the final frame statically", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await activateUnpaid(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(await opacity(page, scoped(".beat:not(.beat--typing)"))).toEqual([1, 1, 1, 1, 1]);
  expect(await page.locator(scoped(".beat--typing")).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))).toEqual([0, 0]);
  expect(await opacity(page, scoped(".mock-wait", ".mock-ok", ".mock-approve", ".mock-done", ".mock-allow", ".mock-rule"))).toEqual([0, 1, 0, 1, 0, 1]);
  await expect(page.locator(scoped(".mock-done"))).toHaveText("✓ Kinnitatud · Saadetud sinu e-postist: demo");
  await expect(page.locator(scoped(".mock-rule"))).toHaveText("Püsiluba: meeldetuletused kuni 500,00\u00a0€");
  await finalFrameFits(page);
  await page.screenshot({ path: `${SHOTS}/teaser-320-reduced-motion.png`, fullPage: true });
});

test("200% root font: nested standing beat is not clipped by the card cap (tribunal T-005)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await activateUnpaid(page);
  await page.addStyleTag({ content: "html{font-size:32px}" });
  await seek(page, 14000);
  const card = await page.locator(scoped(".b-unpaid-card")).evaluate((e) => ({ h: e.getBoundingClientRect().height, full: e.scrollHeight }));
  expect(card.h).toBeGreaterThanOrEqual(card.full - 1);
});

test("„Kuidas alustada” ends in a call to action: connect, or the sample company via the demo login (#63 m3)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const how = page.locator('section[aria-labelledby="how-h"]');
  await expect(how.getByRole("heading", { level: 2 })).toHaveText("Kuidas alustada");
  await expect(how.getByRole("link", { name: "Ühenda oma ChatGPT või Claude" })).toHaveAttribute("href", "/uhenda");
  const connect = how.getByRole("link", { name: "Ühenda oma assistent" }), sample = how.getByRole("link", { name: "Vaata näidisettevõtet" });
  await expect(connect).toHaveAttribute("href", "/uhenda");
  await expect(sample).toHaveAttribute("href", "/login"); // this server runs with LAUNCHPAD_DEMO=1
  for (const l of [how.getByRole("link", { name: "Ühenda oma ChatGPT või Claude" }), connect, sample]) expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("script")).toHaveCount(1);
  await expect(page.locator("script:not([src])")).toHaveCount(1);
  await expect(page.locator("script[src]")).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await how.scrollIntoViewIfNeeded();
  await how.screenshot({ path: `${SHOTS}/landing-alusta-390.png` });
  await sample.click();
  await expect(page).toHaveURL(/\/login$/);
});

test("EN: ?lang=en renders the same page in English", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Focus on what you're good at. Your AI assistant does the office work.");
  await expect(page.locator(".landing-hero").getByRole("link", { name: "Connect your assistant" })).toHaveAttribute("href", "/uhenda");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await activateUnpaid(page);
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
  await activateUnpaid(page);
  // Show the phone, then restart the loop so the recording begins at the first message.
  await page.locator(".teaser").evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.evaluate(() => document.getAnimations().forEach((a) => { a.currentTime = 0; }));
  await page.waitForTimeout(20_000);
  await context.close();
  await page.video()!.saveAs(`${dir}/teaser-loop-390.webm`);
  await page.video()!.delete();
});
