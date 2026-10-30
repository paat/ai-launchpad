import { test, expect } from "@playwright/test";

// Issue #29: add the deadlines to the owner's calendar through real browser form POSTs, then stop sharing.
test("calendar feed: create (shown once), subscribe link, fetch, stop sharing at 320px", async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/login");
  await page.getByRole("button", { name: /Mari Disain/ }).click();
  await page.goto("/uhenda");
  await expect(page.getByRole("heading", { name: "Tähtajad sinu kalendris" })).toBeVisible();
  await expect(page.getByText("Kalender uueneb mõne tunni jooksul; kinnitada saab ainult assistendi kaudu.")).toBeVisible();
  await page.getByRole("button", { name: "Lisa tähtajad oma kalendrisse" }).click();
  await expect(page.getByRole("heading", { name: "Sinu kalendri aadress" })).toBeVisible();
  expect(page.url()).not.toContain(".ics");
  const href = await page.getByRole("link", { name: "Ava kalendris (iPhone)" }).getAttribute("href");
  expect(href).toMatch(/^webcal:\/\/127\.0\.0\.1:3210\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const path = new URL(href!.replace(/^webcal:/, "http:")).pathname;
  const feed = await request.get(path);
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("SUMMARY:NÄIDIS · ");

  await page.getByRole("link", { name: "Tagasi: Ühendus" }).click();
  await expect(page.getByText("Kalendri jagamine on sees.")).toBeVisible();
  await page.getByRole("button", { name: "Lõpeta kalendri jagamine" }).click();
  await expect(page.getByRole("button", { name: "Lisa tähtajad oma kalendrisse" })).toBeVisible();
  expect((await request.get(path)).status()).toBe(404);
});
