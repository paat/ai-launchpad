#!/usr/bin/env node
// Standalone browser regression for issue 12 (onboarding copy + mapped IPv6).
// Run: node --import tsx tests/onboarding-copy.browser.mjs
// Uses only an isolated synthetic page.setContent with all requests blocked.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { connectionBody } from "../src/views.ts";

const FIRST_REQUEST =
  "Use AI Launchpad to review what you know about my business admin. Tell me what is still unknown and recommend one next action that would remove the most work. Do not change any business service.";
const ENDPOINT = "https://launchpad.example.com/mcp";
const body = (baseUrl = "https://launchpad.example.com/") =>
  connectionBody({ lang: "en", csrf: "synthetic-csrf", baseUrl, reportingEnabled: false, tokens: [], grants: [], candidates: [] });

// 1. Normalized IPv4-mapped IPv6 must stay setup-pending; public HTTPS keeps unverified copy.
for (const baseUrl of [
  "https://[::ffff:127.0.0.1]",
  "https://[::ffff:10.0.0.5]",
  "https://[::ffff:192.168.1.10]",
  "https://[::ffff:172.16.0.5]",
]) {
  const html = body(baseUrl);
  assert.ok(html.includes("Local setup pending"), `${baseUrl} pending, got: ${html.slice(0, 120)}`);
  assert.ok(!html.includes("Copy MCP address"), `${baseUrl} must not offer remote copy`);
}
{
  const html = body();
  assert.ok(html.includes("Copy MCP address"), "public HTTPS keeps copy");
  assert.ok(
    html.includes("HTTPS address configured. Compatibility with your assistant has not been verified."),
    "public HTTPS keeps unverified wording",
  );
}

// 2. Static script order: reveal fallback BEFORE focus/select; fallback announced via role=status.
{
  const html = body();
  const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  assert.ok(js.includes("navigator.clipboard.writeText"), "clipboard path present");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(js), "no network in copy script");
  const reveal = js.indexOf("f.hidden=false");
  const focus = js.indexOf("a.focus()");
  const select = js.indexOf("a.select()");
  assert.ok(reveal !== -1 && focus !== -1 && select !== -1, "reveal/focus/select present");
  assert.ok(reveal < focus && focus < select, "parent revealed BEFORE focus/select");
  assert.ok(html.includes('id="copy-endpoint-fallback" hidden role="status"'), "endpoint fallback is role=status");
  assert.ok(html.includes('id="copy-first-request-fallback" hidden role="status"'), "first-request fallback is role=status");
}

// 3. Live headless Chromium: isolated synthetic page, every request blocked.
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
});
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const attempts = [];
  await context.route("**/*", (route) => {
    attempts.push(route.request().url());
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));

  const state = (id) =>
    page.evaluate((cid) => {
      const ta = document.getElementById(`copy-${cid}-text`);
      return {
        active: document.activeElement?.id ?? "",
        fallbackVisible: !document.getElementById(`copy-${cid}-fallback`).hidden,
        fallbackRole: document.getElementById(`copy-${cid}-fallback`).getAttribute("role"),
        successVisible: !document.getElementById(`copy-${cid}-ok`).hidden,
        value: ta.value,
        start: ta.selectionStart,
        end: ta.selectionEnd,
        docSelection: getSelection().toString(),
        calls: window.copyCalls ?? [],
      };
    }, id);

  for (const mode of ["missing", "rejected", "success"]) {
    await page.setContent(body());
    await page.evaluate((m) => {
      window.copyCalls = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value:
          m === "missing"
            ? undefined
            : {
                writeText: (t) => {
                  window.copyCalls.push(t);
                  return m === "rejected" ? Promise.reject(new Error("synthetic denial")) : Promise.resolve();
                },
              },
      });
    }, mode);
    for (const [id, expected] of [
      ["endpoint", ENDPOINT],
      ["first-request", FIRST_REQUEST],
    ]) {
      await page.evaluate(() => {
        window.copyCalls = [];
      });
      await page.locator(`#copy-${id}`).click();
      const s = await state(id);
      if (mode === "success") {
        assert.deepEqual(s.calls, [expected], `${id} success copies exact text`);
        assert.equal(s.successVisible, true, `${id} success announced`);
        assert.equal(s.fallbackVisible, false, `${id} no stale fallback on success`);
      } else {
        assert.equal(s.fallbackVisible, true, `${id}/${mode} fallback revealed`);
        assert.equal(s.fallbackRole, "status", `${id}/${mode} fallback announced via status`);
        assert.equal(s.successVisible, false, `${id}/${mode} stale success cleared`);
        assert.equal(s.active, `copy-${id}-text`, `${id}/${mode} textarea focused`);
        assert.equal(s.value, expected, `${id}/${mode} fallback holds exact text`);
        assert.equal(s.start, 0, `${id}/${mode} selection starts at 0`);
        assert.equal(s.end, expected.length, `${id}/${mode} full text selected`);
        assert.equal(s.docSelection, expected, `${id}/${mode} document selection is full text`);
      }
    }
  }

  // Stale-success clearing on one page: succeed once, then fail, success must hide.
  await page.setContent(body());
  await page.evaluate(() => {
    window.copyCalls = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t) => (window.copyCalls.push(t), Promise.resolve()) },
    });
  });
  await page.locator("#copy-endpoint").click();
  assert.equal((await state("endpoint")).successVisible, true, "precondition: success visible");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t) => (window.copyCalls.push(t), Promise.reject(new Error("denial"))) },
    });
  });
  await page.locator("#copy-endpoint").click();
  {
    const s = await state("endpoint");
    assert.equal(s.fallbackVisible, true, "stale run reveals fallback");
    assert.equal(s.successVisible, false, "stale success cleared after later failure");
    assert.equal(s.active, "copy-endpoint-text", "textarea focused after later failure");
  }

  assert.equal(attempts.length, 0, `zero external calls, saw ${JSON.stringify(attempts)}`);
  assert.equal(errors.length, 0, `zero page errors, saw ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ ok: true, networkAttempts: attempts.length, pageErrors: errors.length }));
} finally {
  await browser.close();
}
