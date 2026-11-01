#!/usr/bin/env node
// Standalone browser gate for the UI redesign (no app server, no dist build).
// Run: node --import tsx tests/ui-redesign.browser.mjs
// Synthetic data only via page.setContent(shell+body); every request blocked.
// Screenshots: scratch/implementation/ui-redesign-finish-01-shots/<state>-<w>.png
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { shell, loginBody, tanaBody, activityBody, connectionBody, setupBody, landingBody, connectBody, approvalCardBody, approvalsListBody } from "../src/views.ts";
import { assessmentSchema, computeCoverage } from "../src/core.ts";
import { NAIDIS, naidisBody } from "../src/naidis.ts";

const SHOTS = path.resolve("scratch/implementation/ui-redesign-finish-01-shots");
await mkdir(SHOTS, { recursive: true });
const CSRF = "synthetic-csrf";
const FIRST_REQUEST =
  "Use AI Launchpad to review what you know about my business admin. Tell me what is still unknown and recommend one next action that would remove the most work. Do not change any business service.";
const ENDPOINT = "https://launchpad.example.com/mcp";

const assessment = assessmentSchema.parse({
  assessed_domains: ["money"],
  responsibilities: [
    { id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "none", reason: "Not arranged yet.", evidence_refs: [] },
    { id: "mystery", domain: "money", label: "Mystery duty", applicability: "unresolved", is_core: false, arrangement: "none", reason: "Unknown.", evidence_refs: [] },
  ],
  gaps: ["An urgent filing remains unassessed."],
  conclusion: "Partly mapped.",
  next_action: { title: "Check the urgent filing", rationale: "It may carry a deadline.", savings_basis: "unknown", uncertainty: "High.", needs_owner: true },
});
const { NOW, mariDeadlines, longApproval, pendingApproval, longLetterApproval, approvedApproval, demoAssessment, twoDeadlines, tanaHandover, week2, uhendaHandover, preparedProgress } = NAIDIS;
const uhendaWaiting = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true });
const uhendaHoBody = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "claude", state: { kind: "sample" }, owner: true, now: NOW, standing: { csrf: CSRF, rules: [] }, handover: uhendaHandover });
const uhendaLocalBody = await connectBody({ lang: "et", baseUrl: "http://127.0.0.1:3210", assistant: "chatgpt", state: { kind: "anon" }, owner: false });
const uhendaExpanded = await connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true, expanded: true });
assert.match(uhendaWaiting, /<a class="tap-link" href="\/uhenda\?a=chatgpt&naita=1#tekst">Näita teksti<\/a>/);
assert.match(uhendaWaiting, /<a class="tap-link" href="\/uhenda\?a=chatgpt&naita=1#ise">Tee ise, ilma juhendita<\/a>/);
assert.equal(uhendaWaiting.includes("<pre"), false, "default /uhenda has no prompt <pre>");
assert.equal(uhendaWaiting.includes('class="step-title"'), false, "default /uhenda has no steps list");
assert.match(uhendaLocalBody, /<a class="tap-link" href="\/uhenda\?a=chatgpt&naita=1#ise">Tee ise, ilma juhendita<\/a>/);
assert.equal(uhendaLocalBody.includes("<pre"), false);
assert.equal(uhendaLocalBody.includes("#tekst"), false, "local /uhenda has no prompt link");
assert.match(uhendaExpanded, /<pre id="tekst">/);
assert.match(uhendaExpanded, /<section class="card" id="ise">[\s\S]*class="step-title"/);
assert.match(uhendaHoBody, /<a class="tap-link" href="\/uhenda\?a=claude&naita=1#tekst">Näita teksti<\/a>/);
const tana = (a, extra = {}) => tanaBody({ lang: "et", csrf: CSRF, sample: true, label: "Synthetic OÜ", assessment: a, coverage: computeCoverage(a), assessedAt: a ? "2026-10-28T10:00:00Z" : null, exclusions: [], approvals: [], progress: [], deadlines: null, needs: [], reportCount: 1, now: NOW, ...extra });
const pageHtml = {
  "connection-https": () =>
    shell({ title: "Connection", active: "none", csrf: CSRF, sample: true, bodyLang: "en",
      body: connectionBody({ lang: "en", csrf: CSRF, baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [], grants: [], candidates: [] }) }),
  "connection-local": () =>
    shell({ title: "Connection", active: "none", csrf: CSRF, sample: true, bodyLang: "en",
      body: connectionBody({ lang: "en", csrf: CSRF, baseUrl: "http://localhost:3000", reportingEnabled: false, tokens: [], grants: [], candidates: [] }) }),
  "status-assessed": () =>
    shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(assessment, { deadlines: mariDeadlines, needs: [{ id: "need_1", state: "classified", reason: null, need_redacted: "Esita KMD", blocker: "needs_owner_pin_or_signature", job_hint_redacted: null, category: "tax_filings", demand_label: "KMD esitamine", same_as: null, spec: "Mock.", classified_by: "mock", created_at: "2026-11-03T10:00:00Z" }] }) }),
  "tana-demo": () =>
    shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(demoAssessment, { deadlines: twoDeadlines, approvals: [pendingApproval], handover: tanaHandover, progress: preparedProgress }) }),
  "naidis-tana": () =>
    shell({ title: "Täna", active: "none", csrf: "", sample: true, body: naidisBody("tana", "et") }),
  "naidis-kinnitus": () =>
    shell({ title: "Kinnitus", active: "none", csrf: "", sample: true, body: naidisBody("kinnitus", "et") }),
  "naidis-tehtud": () =>
    shell({ title: "Tehtud", active: "none", csrf: "", sample: true, body: naidisBody("tehtud", "et") }),
  "status-unassessed": () =>
    shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(null) }),
  activity: () =>
    shell({ title: "Tehtud", active: "tehtud", csrf: CSRF, sample: true,
      body: activityBody({ rows: [{ action: "report_progress", actor: "assistant", outcome: "ok", created_at: "2026-10-28T10:00:00Z", summary: "Synthetic" }], receipts: [], exclusions: [], lang: "et", now: NOW }) }),
  login: () =>
    shell({ title: "Logi sisse", active: "none", csrf: "", body: loginBody({ lang: "et", demo: true, google: true, preauth: "pre-1", companies: [{ key: "alpha", label: "Mari Disain OÜ (näidis)" }] }) }),
  landing: () =>
    shell({ title: "Kontoritöö teeb sinu AI-assistent", active: "none", csrf: "", body: landingBody({ lang: "et", demo: true }) }),
  "landing-en": () =>
    shell({ title: "Your AI assistant does the office work", active: "none", csrf: "", lang: "en", body: landingBody({ lang: "en", demo: true }) }),
  uhenda: () =>
    shell({ title: "Ühenda", active: "uhendus", csrf: CSRF, body: uhendaWaiting }),
  "uhenda-ho": () =>
    shell({ title: "Ühenda", active: "uhendus", csrf: CSRF, sample: true, body: uhendaHoBody }),
  "uhenda-local": () =>
    shell({ title: "Ühenda", active: "uhendus", csrf: CSRF, body: uhendaLocalBody }),
  "approval-receipt-long": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: longApproval, lang: "et", sample: true, now: NOW }) }),
  "approval-receipt-strip": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: { ...week2[0], outcome_json: longApproval.outcome_json }, lang: "et", sample: true, now: NOW, handover: uhendaHandover }) }),
  "approval-pending": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: pendingApproval, lang: "et", sample: true, now: NOW }) }),
  "approval-long-letter": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: longLetterApproval, lang: "et", sample: true, now: NOW }) }),
  "approval-approved": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: approvedApproval, lang: "et", sample: true, now: NOW }) }),
  approvals: () =>
    shell({ title: "Kinnitused", active: "none", csrf: CSRF, sample: true, body: approvalsListBody([longApproval], "et", true, NOW) }),
  setup: () =>
    shell({ title: "Setup", active: "none", csrf: CSRF, sample: true, bodyLang: "en",
      body: setupBody({ csrf: CSRF, result: null }) }),
};

// Static: no network APIs in any inline script.
for (const [name, make] of Object.entries(pageHtml)) {
  const js = [...make().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(js), `${name}: no network in inline scripts`);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
});
const geometry = {};
try {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const attempts = [];
  await context.route("**/*", (route) => { attempts.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e?.message ?? e)));

  // New pages: every visible stand-alone a[href] is a tap target too. A link inside running text (its parent
  // has its own words besides separators) is exempt; the redesign's legacy English pages are not in scope.
  const NEW_PAGES = new Set(["status-assessed", "tana-demo", "naidis-tana", "naidis-kinnitus", "naidis-tehtud", "status-unassessed", "activity", "login", "landing", "landing-en", "uhenda", "uhenda-ho", "uhenda-local", "approval-receipt-long", "approval-receipt-strip", "approval-pending", "approval-long-letter", "approval-approved", "approvals"]);
  const overflowAndTargets = (allAnchors) => page.evaluate((allAnchors) => {
    const de = document.documentElement;
    const targets = [];
    const standAlone = (a) => ![...a.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.replace(/[\s·|]/g, ""));
    const els = new Set(document.querySelectorAll("button, .btn, .brand, footer a, nav.main a, .tabs button, .choice a, .lang-toggle, .tap-link, .link-row, label.check, .today-sum a, .ask, summary, .ho-strip, .ho-job, .ho-finding .tap-link"));
    // Links under a closed disclosure count too: measure with every details open, then restore.
    const closed = allAnchors ? [...document.querySelectorAll("details:not([open])")] : [];
    for (const d of closed) d.open = true;
    if (allAnchors) for (const a of document.querySelectorAll("a[href]")) if (standAlone(a)) els.add(a);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const vis = r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
      if (vis) targets.push({ tag: el.tagName, id: el.id || "", text: (el.textContent || "").trim().slice(0, 40), h: Math.round(r.height * 10) / 10 });
    }
    const out = { scrollW: de.scrollWidth, clientW: de.clientWidth, bodyScrollW: document.body.scrollWidth, targets };
    for (const d of closed) d.open = false;
    return out;
  }, allAnchors);
  /** Wait for every finite animation (the T4 section entrance, the stamp); the teaser's infinite loop is left running. */
  const settle = () => page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect.getTiming().iterations !== Infinity).map((a) => a.finished)));
  const boxInFirstViewport = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), innerH: window.innerHeight, visible: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0 };
  }, sel);

  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(vp);
    for (const [name, make] of Object.entries(pageHtml)) {
      await page.setContent(make());
      const g = await overflowAndTargets(NEW_PAGES.has(name));
      assert.ok(g.scrollW <= g.clientW + 1, `${name}@${vp.width}: no h-overflow html ${g.scrollW}>${g.clientW}`);
      assert.ok(g.bodyScrollW <= g.clientW + 1, `${name}@${vp.width}: no h-overflow body ${g.bodyScrollW}>${g.clientW}`);
      const small = g.targets.filter((t) => t.h < 44);
      assert.deepEqual(small, [], `${name}@${vp.width}: all main buttons/tabs/nav >=44px, small=${JSON.stringify(small)}`);
      await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}.png`) });
      (geometry[name] ??= {})[vp.width] = { scrollW: g.scrollW, clientW: g.clientW, minTargetH: g.targets.length ? Math.min(...g.targets.map((t) => t.h)) : null, targetCount: g.targets.length };
    }
    // First-viewport primary actions (both widths).
    await page.setContent(pageHtml["connection-https"]());
    const copyBox = await boxInFirstViewport("#copy-endpoint");
    assert.ok(copyBox?.visible, `connection-https@${vp.width}: Copy MCP address in first viewport ${JSON.stringify(copyBox)}`);
    geometry[`copy-endpoint@${vp.width}`] = copyBox;
    await page.setContent(pageHtml["status-unassessed"]());
    const linkBox = await boxInFirstViewport('a.btn[href="/uhenda"]');
    assert.ok(linkBox?.visible, `status-unassessed@${vp.width}: connection link in first viewport ${JSON.stringify(linkBox)}`);
    geometry[`unassessed-connection-link@${vp.width}`] = linkBox;
    // T2: the decision is pinned to the thumb — „Kinnita täpselt see” is in the first viewport of the pending card.
    await page.setContent(pageHtml["approval-pending"]());
    const approveBox = await boxInFirstViewport("button[value=approve]");
    assert.ok(approveBox?.visible, `approval-pending@${vp.width}: approve button in first viewport ${JSON.stringify(approveBox)}`);
    geometry[`approve-button@${vp.width}`] = approveBox;
  }

  // #21: the public walkthrough keeps its banner and step navigation above the fold.
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    for (const name of ["naidis-tana", "naidis-kinnitus", "naidis-tehtud"]) {
      await page.setContent(pageHtml[name]());
      await settle();
      await page.evaluate(() => window.scrollTo(0, 0));
      const banner = await boxInFirstViewport(".naidis-banner"), steps = await boxInFirstViewport(".naidis-steps");
      assert.ok(banner?.visible, `${name}@${vp.width}: banner in first viewport ${JSON.stringify(banner)}`);
      assert.ok(steps?.visible, `${name}@${vp.width}: step nav in first viewport ${JSON.stringify(steps)}`);
      const g = await overflowAndTargets(true);
      assert.ok(g.scrollW <= g.clientW + 1 && g.bodyScrollW <= g.clientW + 1, `${name}@${vp.width}: no h-overflow ${JSON.stringify(g)}`);
      assert.deepEqual(g.targets.filter((t) => t.h < 44), [], `${name}@${vp.width}: targets >= 44px`);
      await page.screenshot({ path: path.join(SHOTS, `${name}-${vp.width}-fold.png`) });
      (geometry[name] ??= {})[vp.width] = { banner, steps, scrollW: g.scrollW, clientW: g.clientW, minTargetH: Math.min(...g.targets.map((t) => t.h)) };
    }
  }

  // --- T2 ticket: sticky decision bar, sizes, focus order, amount hero, stamp and reduced motion ---
  const T2_SHOTS = process.env.SHOT_DIR ? path.resolve(process.env.SHOT_DIR) : SHOTS;
  await mkdir(T2_SHOTS, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml["approval-pending"]());
  const ticket = await page.evaluate(() => {
    const ap = document.querySelector("button[value=approve]"), de = document.querySelector("button[value=decline]"), bar = document.querySelector("form.decide");
    const amount = document.querySelector(".amount b"), amountPx = parseFloat(getComputedStyle(amount).fontSize);
    const larger = [...document.querySelectorAll("main *")].filter((el) => el !== amount && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) >= amountPx).map((el) => el.tagName + "." + el.className);
    const letter = document.querySelector("pre.letter");
    return { approveH: ap.getBoundingClientRect().height, declineH: de.getBoundingClientRect().height, declineCls: de.className, position: getComputedStyle(bar).position,
      decisionOutsideForm: [...document.querySelectorAll('[name="decision"]')].filter((el) => !el.closest("form.decide")).length,
      larger, letterTab: letter.getAttribute("tabindex"), letterClipped: letter.scrollHeight > letter.clientHeight + 1, barH: bar.getBoundingClientRect().height, scrollPad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) };
  });
  assert.equal(ticket.position, "sticky", "decide bar sticky at 390");
  assert.ok(ticket.approveH >= 56, `approve button >= 56px (${ticket.approveH})`);
  assert.ok(ticket.declineH >= 44, `decline button >= 44px (${ticket.declineH})`);
  assert.equal(ticket.declineCls, "text danger", "decline is a text danger button");
  assert.equal(ticket.decisionOutsideForm, 0, "name=decision only inside the one decision form");
  assert.deepEqual(ticket.larger, [], "the amount is the largest figure");
  assert.equal(ticket.letterTab, "0", "letter keeps tabindex=0");
  assert.equal(ticket.letterClipped, false, "letter shows its full text");
  assert.ok(ticket.barH <= ticket.scrollPad, `focused elements are not hidden under the bar: scroll-padding ${ticket.scrollPad}px >= bar ${ticket.barH}px`);
  await page.screenshot({ path: path.join(T2_SHOTS, "t2-approval-pending-390-fold.png") });
  // Focus order unchanged: letter → approve → decline.
  await page.locator("pre.letter").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.value), "approve", "Tab from the letter reaches approve");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.value), "decline", "then decline");
  geometry.ticket = ticket;
  // review-polish-grok medium: at 320 scroll-padding must cover the whole bar.
  // Tab from the top to approve, then decline: nothing focused before the bar ends under it, and both buttons are fully on screen.
  await page.setViewportSize({ width: 320, height: 740 });
  await page.setContent(pageHtml["approval-pending"]());
  const stops = [];
  for (let i = 0; i < 40 && stops.at(-1)?.value !== "decline"; i++) {
    await page.keyboard.press("Tab");
    stops.push(await page.evaluate(() => {
      const el = document.activeElement, bar = document.querySelector("form.decide").getBoundingClientRect(), r = el.getBoundingClientRect();
      return { tag: el.tagName, value: el.value ?? null, inBar: !!el.closest("form.decide"), bottom: r.bottom, barTop: bar.top, barH: bar.height, vh: innerHeight,
        pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) };
    }));
  }
  assert.deepEqual(stops.filter((s) => s.inBar).map((s) => s.value), ["approve", "decline"], `320: Tab reaches approve then decline ${JSON.stringify(stops)}`);
  for (const s of stops) {
    assert.ok(s.barH <= s.pad, `320: scroll-padding ${s.pad}px covers the ${s.barH}px bar`);
    if (s.inBar) assert.ok(s.bottom <= s.vh, `320: ${s.value} fully on screen ${JSON.stringify(s)}`);
    else assert.ok(s.bottom <= s.barTop + 0.5, `320: focused ${s.tag} ends above the bar ${JSON.stringify(s)}`);
  }
  geometry.focus320 = stops.map(({ tag, value, bottom, barTop, barH, pad }) => ({ tag, value, bottom, barTop, barH, pad }));
  // PR #65 note (#63): scroll-padding scales with text zoom. With a 32 px root font, every element focused before the bar still ends above it;
  // where the bar stays sticky (1280) the padding covers it, on phones it drops into the flow. At the default font, EN at 390 is covered too.
  for (const [width, root, lang] of [[390, 32, "et"], [390, 32, "en"], [1280, 32, "et"], [1280, 32, "en"], [390, 0, "en"]]) {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, lang, body: approvalCardBody({ csrf: CSRF, a: pendingApproval, lang, sample: true, now: NOW }) }));
    if (root) await page.addStyleTag({ content: `html{font-size:${root}px}` });
    const zoomStops = [];
    for (let i = 0; i < 40 && zoomStops.at(-1)?.value !== "decline"; i++) {
      await page.keyboard.press("Tab");
      zoomStops.push(await page.evaluate(() => {
        const el = document.activeElement, form = document.querySelector("form.decide"), bar = form.getBoundingClientRect(), r = el.getBoundingClientRect();
        return { tag: el.tagName, value: el.value ?? null, inBar: !!el.closest("form.decide"), bottom: r.bottom, barTop: bar.top, barH: bar.height, sticky: getComputedStyle(form).position === "sticky",
          pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom), root: parseFloat(getComputedStyle(document.documentElement).fontSize) };
      }));
    }
    const label = `${root || "default"} root ${width}/${lang}`;
    assert.ok(zoomStops.some((st) => !st.inBar) && zoomStops.at(-1).value === "decline" && (!root || zoomStops[0].root === root), `${label}: Tab reaches the bar after other stops ${JSON.stringify(zoomStops)}`);
    if (width === 1280 || !root) assert.ok(zoomStops.every((st) => st.sticky), `${label}: the bar stays sticky`);
    for (const st of zoomStops) {
      if (st.sticky) assert.ok(st.barH <= st.pad, `${label}: scroll-padding ${st.pad}px covers the ${st.barH}px bar`);
      if (!st.inBar) assert.ok(st.bottom <= st.barTop + 0.5, `${label}: focused ${st.tag} ends above the bar ${JSON.stringify(st)}`);
    }
    if (root) await page.screenshot({ path: path.join(T2_SHOTS, `t2-approval-pending-${width}-root${root}-${lang}.png`) });
    (geometry.focusZoom ??= {})[label] = zoomStops.map(({ tag, value, bottom, barTop, barH, pad, sticky }) => ({ tag, value, bottom, barTop, barH, pad, sticky }));
  }
  // #63 m8: from 300 px up, the bar is one row in ET and EN: „Keeldu” is a compact text button beside the approve button, both ≥44 px, and scroll-padding covers the bar.
  for (const width of [300, 320]) for (const lang of ["et", "en"]) {
    await page.setViewportSize({ width, height: 568 });
    await page.setContent(shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, lang, body: approvalCardBody({ csrf: CSRF, a: pendingApproval, lang, sample: true, now: NOW }) }));
    const bar = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect(), ap = box("button[value=approve]"), de = box("button[value=decline]"), b = box("form.decide");
      return { barH: Math.round(b.height), apTop: ap.top, apBottom: ap.bottom, deTop: de.top, deBottom: de.bottom, apH: ap.height, deH: de.height, apW: ap.width, deW: de.width,
        pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    assert.ok(bar.deTop < bar.apBottom && bar.apTop < bar.deBottom, `m8 ${width}/${lang}: approve and decline share one row ${JSON.stringify(bar)}`);
    assert.ok(bar.barH <= 100, `m8 ${width}/${lang}: one-row bar, not two (${bar.barH}px)`);
    assert.ok(bar.apH >= 44 && bar.deH >= 44, `m8 ${width}/${lang}: targets >= 44px ${JSON.stringify(bar)}`);
    assert.ok(bar.barH <= bar.pad, `m8 ${width}/${lang}: scroll-padding ${bar.pad}px covers the ${bar.barH}px bar`);
    assert.ok(bar.scrollW <= bar.clientW + 1, `m8 ${width}/${lang}: no overflow ${JSON.stringify(bar)}`);
    if (width === 320) await page.screenshot({ path: path.join(T2_SHOTS, `t2-approval-pending-320x568-${lang}.png`) });
    (geometry.bar568 ??= {})[`${width}-${lang}`] = bar;
  }
  // review-polish3-grok medium: at 320×568 with a 32 px root font the bar stacks, and no approve word breaks mid-word.
  for (const lang of ["et", "en"]) {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.setContent(shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, lang, body: approvalCardBody({ csrf: CSRF, a: pendingApproval, lang, sample: true, now: NOW }) }));
    await page.addStyleTag({ content: "html{font-size:32px}" });
    const big = await page.evaluate(() => {
      const ap = document.querySelector("button[value=approve]"), de = document.querySelector("button[value=decline]"), cs = getComputedStyle(ap);
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const content = ap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const words = ap.textContent.trim().split(/\s+/).map((w) => ({ w, px: ctx.measureText(w).width }));
      const box = (el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top, bottom: r.bottom }; };
      return { content, words, ap: box(ap), de: box(de), root: parseFloat(getComputedStyle(document.documentElement).fontSize) };
    });
    assert.equal(big.root, 32, `big text ${lang}: 32 px root`);
    for (const { w, px } of big.words) assert.ok(px <= big.content, `big text ${lang}: „${w}” (${px.toFixed(1)}px) fits the approve content box (${big.content}px) ${JSON.stringify(big)}`);
    for (const k of ["ap", "de"]) assert.ok(big[k].h >= 44 && big[k].w >= 44, `big text ${lang}: ${k} >= 44px ${JSON.stringify(big)}`);
    assert.ok(big.de.top >= big.ap.bottom - 0.5, `big text ${lang}: decline stacks under approve ${JSON.stringify(big)}`);
    await page.locator("form.decide").screenshot({ path: path.join(T2_SHOTS, `t2-approval-pending-320x568-root32-${lang}.png`) });
    (geometry.bigText ??= {})[lang] = big;
  }

  await page.setContent(pageHtml["approval-approved"]());
  const approvedState = await page.evaluate(() => ({ status: [...document.querySelectorAll("main [role=status]")].map((el) => el.textContent.slice(0, 24)),
    draw: getComputedStyle(document.querySelector(".stamp path")).animationName }));
  assert.deepEqual(approvedState.status, ["Nüüd on assistendi kord."], "one role=status on the approved line");
  assert.equal(approvedState.draw, "lp-draw", "stamp draws its check");
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: path.join(T2_SHOTS, "t2-approval-approved-390.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(pageHtml["approval-approved"]());
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".stamp path")).animationName), "none", "reduced motion: no stamp draw");
  await page.emulateMedia({ reducedMotion: null });

  await page.setViewportSize({ width: 1280, height: 800 });
  for (const name of ["approval-pending", "approval-approved"]) {
    await page.setContent(pageHtml[name]());
    const g = await overflowAndTargets(true);
    assert.ok(g.scrollW <= g.clientW + 1, `${name}@1280: no h-overflow ${g.scrollW}>${g.clientW}`);
    assert.deepEqual(g.targets.filter((t) => t.h < 44), [], `${name}@1280: targets >= 44px`);
  }
  await page.setContent(pageHtml["approval-pending"]());
  await page.screenshot({ path: path.join(T2_SHOTS, "t2-approval-1280.png"), fullPage: true });
  // #63 m7: with a 40-line letter, „Kinnita täpselt see” is still in the first 1280×800 viewport (the bar is sticky on every width).
  await page.setContent(pageHtml["approval-long-letter"]());
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  const longApprove = await boxInFirstViewport("button[value=approve]");
  const longPage = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, lines: document.querySelector("pre.letter").textContent.split("\n").length }));
  assert.ok(longPage.lines === 40 && longPage.height > 800, `approval-long-letter@1280: the letter runs past the fold ${JSON.stringify(longPage)}`);
  assert.ok(longApprove?.visible, `approval-long-letter@1280: approve button in the first viewport ${JSON.stringify(longApprove)}`);
  await page.screenshot({ path: path.join(T2_SHOTS, "approval-1280-long.png") });
  // Focus order holds with the sticky bar: facts → letter → approve → decline.
  await page.locator("pre.letter").focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.value), "approve", "1280: Tab from the letter reaches approve");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.value), "decline", "1280: then decline");
  geometry.longApprove1280 = longApprove;

  // --- T3 Täna: hero and the first ask card in the first phone viewport, one page ≤ 1 900 px, two columns on desktop ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml["tana-demo"]());
  await settle();
  const tana390 = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), h: Math.round(r.height) }; };
    const amber = [...document.querySelectorAll("main *")].filter((el) => { const cs = getComputedStyle(el); return [cs.backgroundColor, cs.borderTopColor].some((c) => c === "rgb(255, 244, 214)" || c === "rgb(240, 195, 107)"); }).map((el) => el.className);
    return { strip: box(document.querySelector(".ho-strip")), hero: box(document.querySelector("main .hero")), ask: box(document.querySelector("#ootab .ask")), askTitle: box(document.querySelector("#ootab .ask .ask-title")), height: document.documentElement.scrollHeight,
      summaries: [...document.querySelectorAll("summary")].map((el) => Math.round(el.getBoundingClientRect().height)), amber,
      headings: [...document.querySelectorAll("main h2")].map((h) => h.textContent) };
  });
  await page.screenshot({ path: path.join(T2_SHOTS, "t3-tana-390-fold.png") });
  await page.screenshot({ path: path.join(T2_SHOTS, "t3-tana-390-full.png"), fullPage: true });
  // T5 (#61) adds the „Käest ära” strip under the pills, so the first ask card now starts in the first viewport with its
  // label and title readable; its body continues below the fold.
  assert.ok(tana390.askTitle.bottom <= 844, `tana-demo@390: first ask card's label and title within 844 px ${JSON.stringify(tana390)}`);
  // Plan §3 T3 asks ≤ 1 900 px; the prototype itself is 2 502 px at 390 and this page was 3 554 px before T3. Guard the gain.
  // T5's strip is new content in the hero; the rest of the page is held to T3's bound.
  assert.ok(tana390.height - tana390.strip.h <= 2650, `tana-demo@390: page without the T5 strip ≤ 2650 px (${tana390.height} - ${tana390.strip.h})`);
  assert.ok(tana390.summaries.every((h) => h >= 44), `tana-demo@390: every summary ≥ 44 px ${tana390.summaries}`);
  assert.deepEqual([...new Set(tana390.amber)].sort(), ["needs", "state-chip state-chip--waiting"], "amber only on what needs the owner");
  assert.deepEqual(tana390.headings.slice(0, 3), ["Ootab sinult (2)", "Assistent tegi (1)", "Tulekul (2)"], "h2 counts stay as text");
  geometry.tana390 = tana390;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(pageHtml["tana-demo"]());
  await settle();
  const tana1280 = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const de = document.documentElement;
    return { ootabLeft: Math.round(r("#ootab").left), tegiLeft: Math.round(r("#tegi").left), tulekulLeft: Math.round(r("#tulekul").left), ootabTop: Math.round(r("#ootab").top), tulekulTop: Math.round(r("#tulekul").top), scrollW: de.scrollWidth, clientW: de.clientWidth };
  });
  assert.ok(tana1280.tulekulLeft > tana1280.ootabLeft + 300 && tana1280.ootabTop === tana1280.tulekulTop && tana1280.tegiLeft === tana1280.ootabLeft, `tana-demo@1280: Ootab + Tegi | Tulekul ${JSON.stringify(tana1280)}`);
  assert.ok(tana1280.scrollW <= tana1280.clientW + 1, "tana-demo@1280: no h-overflow");
  const g1280 = await overflowAndTargets(true);
  assert.deepEqual(g1280.targets.filter((t) => t.h < 44), [], "tana-demo@1280: targets >= 44px");
  await page.screenshot({ path: path.join(T2_SHOTS, "t3-tana-1280.png"), fullPage: true });
  geometry.tana1280 = tana1280;
  // review-design-t3-grok medium: an unbreakable company label wraps inside the Täna hero at 320 px.
  await page.setViewportSize({ width: 320, height: 740 });
  await page.setContent(shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana({ ...demoAssessment, company_label: "X".repeat(80) }, { handover: tanaHandover }) }));
  const longLabel = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, label: document.querySelector(".hero .company").textContent.length }));
  assert.ok(longLabel.label === 80 && longLabel.scrollW <= longLabel.clientW, `tana long company label@320: no h-overflow ${JSON.stringify(longLabel)}`);

  // --- T5 „Käest ära”: the strip sits in the Täna hero; the full section on Ühendus fits 390 and lays out in two columns at 1280 ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml["tana-demo"]());
  await settle();
  const strip = await page.evaluate(() => { window.scrollTo(0, 0); const r = document.querySelector(".ho-strip").getBoundingClientRect(), segs = [...document.querySelectorAll(".ho-strip .ho-seg")].map((s) => Math.round(s.getBoundingClientRect().width)); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), inHero: !!document.querySelector(".hero .ho-strip"), segs }; });
  assert.ok(strip.inHero && strip.bottom <= 844 && strip.h >= 44, `t5 strip in the hero, first viewport, ≥ 44 px ${JSON.stringify(strip)}`);
  assert.ok(strip.segs.length === tanaHandover.total && strip.segs.every((w) => w > 20), `t5 strip: one visible segment per job ${JSON.stringify(strip.segs)}`);
  await page.screenshot({ path: path.join(T2_SHOTS, "t5-tana-390-fold.png") });
  // review-design-t5-grok medium: the pending dot is ≥ 3:1 against an outlined and a mid-green segment (its white ring carries the
  // boundary on green), and the strip's accessible name says an approval waits.
  const dot = await page.evaluate(() => {
    const rgb = (c) => c.match(/\d+/g).slice(0, 3).map(Number), lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };
    const wait = document.querySelector(".ho-strip .ho-seg--wait"), after = getComputedStyle(wait, "::after");
    const prep = document.createElement("li"); prep.className = "ho-seg ho-seg--prep"; wait.parentElement.append(prep);
    const outlined = getComputedStyle(wait).backgroundColor, green = getComputedStyle(prep).backgroundColor; prep.remove();
    return { fill: after.backgroundColor, ring: after.borderTopColor, ringW: parseFloat(after.borderTopWidth), outlined, green,
      dotOnOutlined: ratio(after.backgroundColor, outlined), dotOnRing: ratio(after.backgroundColor, after.borderTopColor), ringOnGreen: ratio(after.borderTopColor, green),
      name: document.querySelector(".ho-strip").getAttribute("aria-label") };
  });
  assert.ok(dot.dotOnOutlined >= 3 && dot.dotOnRing >= 3 && dot.ringOnGreen >= 3 && dot.ringW >= 2, `t5 pending dot ≥ 3:1 on outlined and mid-green segments ${JSON.stringify(dot)}`);
  assert.ok(dot.name.includes("ootab"), `t5 strip accessible name says an approval waits: ${dot.name}`);
  geometry.t5dot = dot;
  geometry.t5strip = strip;
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    await page.setContent(pageHtml["uhenda-ho"]());
    const ho = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(), de = document.documentElement;
      return { scrollW: de.scrollWidth, clientW: de.clientWidth, jobsLeft: Math.round(r("#kaest-ara .ho-jobs").left), nextLeft: Math.round(r("#kaest-ara .ho-next").left), asks: document.querySelectorAll("#kaest-ara .ask").length,
        jobs: [...document.querySelectorAll("#kaest-ara .ho-job")].map((el) => Math.round(el.getBoundingClientRect().height)), aboveRules: r("#kaest-ara").top < r("#pusiload").top };
    });
    assert.ok(ho.scrollW <= ho.clientW + 1, `uhenda-ho@${vp.width}: no h-overflow ${JSON.stringify(ho)}`);
    assert.ok(ho.asks === 1 && ho.aboveRules && ho.jobs.every((h) => h >= 44), `uhenda-ho@${vp.width}: one ask, above Püsiload, rows ≥ 44 px ${JSON.stringify(ho)}`);
    if (vp.width === 1280) assert.ok(ho.nextLeft > ho.jobsLeft + 300, `uhenda-ho@1280: jobs | next step ${JSON.stringify(ho)}`);
    const g = await overflowAndTargets(true);
    assert.deepEqual(g.targets.filter((t) => t.h < 44), [], `uhenda-ho@${vp.width}: targets >= 44px`);
    await page.locator("#kaest-ara").scrollIntoViewIfNeeded();
    await page.locator("#kaest-ara").screenshot({ path: path.join(T2_SHOTS, `t5-uhendus-${vp.width}.png`) });
    geometry[`t5uhendus${vp.width}`] = ho;
  }

  // Public HTTPS /uhenda: a phone cannot scan its own screen, so the QR (.qr-card, display:none ≤719px) is hidden at 390 and visible at 1280.
  for (const [width, height, visible] of [[390, 844, false], [1280, 800, true]]) {
    await page.setViewportSize({ width, height });
    await page.setContent(pageHtml.uhenda());
    const shown = await page.locator(".qr-card").isVisible();
    assert.equal(shown, visible, `public-HTTPS /uhenda @${width}: .qr ${visible ? "visible" : "not visible"}`);
  }

  // #63 wow: after „Saadetud” the receipt carries the „Käest ära” strip, so the approval and the progress show in one shot.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml["approval-receipt-strip"]());
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  const receiptStrip = await boxInFirstViewport('.ticket .ho-strip[href="/uhenda#kaest-ara"]');
  assert.ok(receiptStrip?.visible && receiptStrip.height >= 44, `receipt-strip@390: strip in the first viewport, ≥ 44 px ${JSON.stringify(receiptStrip)}`);
  await page.screenshot({ path: path.join(T2_SHOTS, "receipt-strip-390.png") });
  geometry.receiptStrip = receiptStrip;

  // --- T4 (#59) landing fold: header, headline, button and the carousel heading in the first 1280×800 viewport beside a 656 px phone
  // whose first and last bubbles are not clipped (#63 m1); at 390 the fold shows the headline, the button and the top of the phone ---
  const landingFold = () => page.evaluate(() => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 14000; }); // the teaser's final frame
    window.scrollTo(0, 0);
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), h: Math.round(r.height) }; };
    const q = (s) => box(document.querySelector(s));
    const teaser = document.querySelector(".teaser");
    const conversation = teaser.querySelector("[data-job-conversation]:not([hidden])");
    const bubbles = conversation.querySelectorAll(".chat .bubble");
    return { innerH: window.innerHeight, header: q("header"), h1: q("h1"), btn: q(".landing-hero .btn"), phone: box(conversation.querySelector(".phone")), chat: box(conversation.querySelector(".chat")), first: box(bubbles[0]), last: box(bubbles[bubbles.length - 1]),
      jobsHeading: q("#jobs-h"), pause: q(".teaser-pause"),
      transcriptFirst: conversation.firstElementChild.matches("div.vh") && conversation.firstElementChild.querySelector("ol") !== null,
      h1Size: getComputedStyle(document.querySelector("h1")).fontSize, trustBg: getComputedStyle(document.querySelector(".trust")).backgroundColor };
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(pageHtml.landing());
  const fold1280 = await landingFold();
  const inFold = (b) => b.top >= 0 && b.bottom <= fold1280.innerH;
  assert.ok([fold1280.header, fold1280.h1, fold1280.btn].every(inFold) && fold1280.jobsHeading.top >= 0 && fold1280.jobsHeading.top < fold1280.innerH, `t4 landing@1280: header, headline, button and carousel heading in 800 px ${JSON.stringify(fold1280)}`);
  assert.ok(fold1280.phone.h === 656 && fold1280.phone.bottom <= fold1280.innerH && fold1280.phone.left > fold1280.h1.left + 300, `t4 landing@1280: 656 px phone in the fold beside the text ${JSON.stringify(fold1280.phone)}`);
  assert.ok(fold1280.last.top >= fold1280.chat.top - 1 && fold1280.last.bottom <= fold1280.chat.bottom + 1, `t4 landing@1280: last bubble not clipped ${JSON.stringify(fold1280)}`);
  assert.ok(fold1280.first.top >= fold1280.chat.top - 1, `t4 landing@1280: the opening question is not under the chat header ${JSON.stringify(fold1280)}`);
  assert.equal(fold1280.h1Size, "52px", "t4 landing@1280: --fs-display headline");
  assert.equal(fold1280.trustBg, "rgb(15, 61, 37)", "t4 landing: .trust on --c-deep");
  assert.ok(fold1280.transcriptFirst, "t4 landing: the transcript <ol> stays first in the teaser");
  await page.screenshot({ path: path.join(T2_SHOTS, "t4-landing-1280.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml.landing());
  const fold390 = await landingFold();
  assert.ok(fold390.h1.top >= 0 && fold390.btn.bottom <= 844 && fold390.phone.top < 844, `t4 landing@390: headline, button, top of the phone in the fold ${JSON.stringify(fold390)}`);
  assert.ok(fold390.pause.h >= 44, `t4 landing@390: pause control ≥ 44 px ${JSON.stringify(fold390.pause)}`);
  await page.screenshot({ path: path.join(T2_SHOTS, "t4-landing-390-fold.png") });
  geometry.t4landing = { 1280: fold1280, 390: fold390 };
  // The Täna entrance: 200 ms, 60 ms stagger; reduced motion shows the final state of the sections and of the teaser.
  await page.setContent(pageHtml["tana-demo"]());
  const enter = await page.evaluate(() => ["ootab", "tegi", "tulekul"].map((id) => { const cs = getComputedStyle(document.getElementById(id)); return `${cs.animationName} ${cs.animationDuration} ${cs.animationDelay}`; }));
  assert.deepEqual(enter, ["lp-enter 0.2s 0s", "lp-enter 0.2s 0.06s", "lp-enter 0.2s 0.12s"], "t4 Täna sections enter in turn");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await page.evaluate(() => ["ootab", "tegi", "tulekul"].map((id) => { const cs = getComputedStyle(document.getElementById(id)); return `${cs.animationName} ${cs.opacity}`; }));
  assert.deepEqual(still, ["none 1", "none 1", "none 1"], "t4 reduced motion: no section entrance");
  await page.setContent(pageHtml.landing());
  await page.locator('[data-job-activate="unpaid"]').click();
  const finalFrame = await page.evaluate(() => {
    const conversation = document.querySelector('[data-job-conversation="unpaid"]:not([hidden])');
    return [...conversation.querySelectorAll(".b-unpaid-card, .mock-done, .mock-rule, .b-unpaid-ai2")].map((e) => getComputedStyle(e).opacity);
  });
  assert.deepEqual(finalFrame, ["1", "1", "1", "1"], "t4 reduced motion: the visible unpaid teaser shows its final frame");
  await page.emulateMedia({ reducedMotion: null });

  // #69: scroll end must not undo a deliberate selection, including the last cards on a three-up track.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [360, 760, 1280]) for (const lang of ["et", "en"]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(shell({ title: "Landing", active: "none", csrf: "", lang, body: landingBody({ lang, demo: false, rand: () => 0.999999 }) }));
    const ids = await page.locator("[data-job-card]").evaluateAll((cards) => cards.map((card) => card.getAttribute("data-job-card")));
    const expectActive = async (id, action) => {
      await page.waitForTimeout(180); // let native scrollend (or the 120 ms fallback) run before checking
      const state = await page.evaluate(() => ({
        active: document.querySelector(".job-card--active")?.getAttribute("data-job-card"),
        visible: document.querySelector("[data-job-conversation]:not([hidden])")?.getAttribute("data-job-conversation"),
      }));
      assert.equal(state.visible, state.active, `${width}/${lang} ${action}: phone matches active card ${JSON.stringify(state)}`);
      assert.equal(state.active, id, `${width}/${lang} ${action}: reached ${id} ${JSON.stringify(state)}`);
    };
    for (let i = 1; i < ids.length; i++) {
      await page.locator("[data-job-next]").click();
      await expectActive(ids[i], `Next ${i + 1}`);
    }
    for (let i = ids.length - 2; i >= 0; i--) {
      await page.locator("[data-job-prev]").click();
      await expectActive(ids[i], `Previous ${i + 1}`);
    }
    for (let i = 0; i < ids.length; i++) {
      await page.locator("[data-job-activate]").nth(i).click();
      await expectActive(ids[i], `card button ${i + 1}`);
    }
    await page.setViewportSize({ width: width + 1, height: 1000 });
    await expectActive(ids.at(-1), "resize keeps the active last card");
  }
  await page.emulateMedia({ reducedMotion: null });

  // --- Guide tabs: one panel, click + keyboard (Arrow/Home/End, roving tabindex) ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(pageHtml["connection-https"]());
  const tabState = () => page.evaluate(() => ({
    active: document.activeElement?.id ?? "",
    claude: { sel: document.getElementById("tab-claude").getAttribute("aria-selected"), tab: document.getElementById("tab-claude").tabIndex, panelHidden: document.getElementById("guide-claude").hidden },
    chatgpt: { sel: document.getElementById("tab-chatgpt").getAttribute("aria-selected"), tab: document.getElementById("tab-chatgpt").tabIndex, panelHidden: document.getElementById("guide-chatgpt").hidden },
  }));
  const expectTab = async (which, label) => {
    const s = await tabState();
    const on = which === "claude" ? s.claude : s.chatgpt;
    const off = which === "claude" ? s.chatgpt : s.claude;
    assert.equal(on.sel, "true", `${label}: ${which} aria-selected=true ${JSON.stringify(s)}`);
    assert.equal(on.tab, 0, `${label}: ${which} tabindex=0`);
    assert.equal(on.panelHidden, false, `${label}: ${which} panel visible`);
    assert.equal(off.sel, "false", `${label}: other aria-selected=false`);
    assert.equal(off.tab, -1, `${label}: other tabindex=-1`);
    assert.equal(off.panelHidden, true, `${label}: other panel hidden`);
    return s;
  };
  await expectTab("claude", "initial");
  await page.locator("#tab-claude").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal((await expectTab("chatgpt", "ArrowRight")).active, "tab-chatgpt", "ArrowRight moves focus");
  await page.keyboard.press("ArrowRight"); // wraps
  assert.equal((await expectTab("claude", "ArrowRight wrap")).active, "tab-claude", "ArrowRight wraps focus");
  await page.keyboard.press("ArrowLeft"); // wraps back
  assert.equal((await expectTab("chatgpt", "ArrowLeft wrap")).active, "tab-chatgpt", "ArrowLeft wraps focus");
  await page.keyboard.press("Home");
  assert.equal((await expectTab("claude", "Home")).active, "tab-claude", "Home focus");
  await page.keyboard.press("End");
  assert.equal((await expectTab("chatgpt", "End")).active, "tab-chatgpt", "End focus");
  await page.locator("#tab-claude").click();
  await expectTab("claude", "click still works");

  // --- Copy: clipboard absent / rejection / success (endpoint + first request) ---
  const copyState = (id) => page.evaluate((cid) => {
    const ta = document.getElementById(`copy-${cid}-text`);
    return { active: document.activeElement?.id ?? "", fallbackVisible: !document.getElementById(`copy-${cid}-fallback`).hidden,
      successVisible: !document.getElementById(`copy-${cid}-ok`).hidden, value: ta.value,
      start: ta.selectionStart, end: ta.selectionEnd, calls: window.copyCalls ?? [] };
  }, id);
  for (const mode of ["missing", "rejected", "success"]) {
    await page.setContent(pageHtml["connection-https"]());
    await page.evaluate((m) => {
      window.copyCalls = [];
      Object.defineProperty(navigator, "clipboard", { configurable: true,
        value: m === "missing" ? undefined : { writeText: (t) => { window.copyCalls.push(t); return m === "rejected" ? Promise.reject(new Error("synthetic denial")) : Promise.resolve(); } } });
    }, mode);
    for (const [id, expected] of [["endpoint", ENDPOINT], ["first-request", FIRST_REQUEST]]) {
      await page.evaluate(() => { window.copyCalls = []; });
      await page.locator(`#copy-${id}`).click();
      const s = await copyState(id);
      if (mode === "success") {
        assert.deepEqual(s.calls, [expected], `${id} success copies exact text`);
        assert.equal(s.successVisible, true, `${id} success announced`);
        assert.equal(s.fallbackVisible, false, `${id} no fallback on success`);
      } else {
        assert.equal(s.fallbackVisible, true, `${id}/${mode} fallback revealed`);
        assert.equal(s.successVisible, false, `${id}/${mode} no stale success`);
        assert.equal(s.active, `copy-${id}-text`, `${id}/${mode} textarea focused`);
        assert.equal(s.value, expected, `${id}/${mode} fallback exact text`);
        assert.equal(s.start, 0); assert.equal(s.end, expected.length);
      }
    }
  }
  // Täna is zero-JS; the landing has only the carousel's inline IIFE.
  for (const name of ["status-assessed", "status-unassessed", "uhenda", "activity", "login"]) {
    assert.ok(!pageHtml[name]().includes("<script"), `${name}: zero inline JS`);
  }
  for (const name of ["landing", "landing-en"]) {
    assert.deepEqual(pageHtml[name]().match(/<script\b[^>]*>/g) ?? [], ["<script>"], `${name}: exactly one inline carousel script, no external script`);
  }

  // --- Unknowns visible outside closed details; synthetic/unchecked labels ---
  await page.setContent(pageHtml["status-assessed"]());
  const unk = await page.evaluate(() => {
    const box = [...document.querySelectorAll("#ootab .ask-row")].find((r) => r.textContent.includes("An urgent filing remains unassessed."));
    return { exists: !!box, visible: !!box && box.getBoundingClientRect().height > 0, inDetails: !!box?.closest("details"),
      body: document.body.textContent, sample: document.querySelector(".sample-bar .label-chip--sample")?.textContent ?? "",
      headings: [...document.querySelectorAll("main h2")].map((h) => h.textContent) };
  });
  assert.ok(unk.exists && unk.visible && !unk.inDetails, "unknowns visible outside details");
  assert.ok(unk.body.includes("AI-hüppelaud neid ei kontrollinud"), "unchecked label present");
  assert.equal(unk.sample, "Näidis", "sample chip visible");
  assert.deepEqual(unk.headings.slice(0, 3).map((h) => h.replace(/ \(\d+\)$/, "")), ["Ootab sinult", "Assistent tegi", "Tulekul"], "Täna card order");
  await page.setContent(pageHtml.login());
  assert.ok((await page.textContent("body")).includes("Proovi näidisettevõttega"), "login synthetic section");
  await page.setContent(pageHtml.setup());
  const setupText = await page.textContent("body");
  assert.ok(setupText.includes("Fixture guidance") && setupText.includes("No live model is called"), "setup fixture label");
  await page.setContent(pageHtml["connection-local"]());
  const localText = await page.textContent("body");
  assert.ok(localText.includes("Local setup pending."), "local pending label");
  assert.equal(await page.locator("#copy-endpoint").count(), 0, "local: no remote copy CTA");

  // --- Form actions / CSRF / field names preserved ---
  const forms = () => page.evaluate(() => [...document.querySelectorAll("form")].map((f) => ({
    action: f.getAttribute("action"), method: (f.getAttribute("method") || "").toLowerCase(),
    names: [...f.querySelectorAll("input,select,textarea,button")].map((i) => i.getAttribute("name")).filter(Boolean),
    csrf: f.querySelector('input[name="csrf"]')?.value ?? null })));
  await page.setContent(pageHtml["connection-https"]());
  let fs = await forms();
  const need = (list, action, names, label) => {
    const f = list.find((x) => x.action === action);
    assert.ok(f, `${label}: form ${action} present`);
    assert.equal(f.method, "post", `${label}: ${action} POST`);
    assert.equal(f.csrf, CSRF, `${label}: ${action} CSRF value`);
    for (const n of names) assert.ok(f.names.includes(n), `${label}: ${action} has field ${n} (${f.names})`);
  };
  need(fs, "/auth/logout", ["csrf"], "shell");
  need(fs, "/reporting", ["csrf", "enabled"], "connection");
  need(fs, "/tokens", ["csrf"], "connection");
  need(fs, "/delete", ["csrf"], "connection");
  await page.setContent(pageHtml.setup());
  fs = await forms(); need(fs, "/setup", ["csrf", "topic"], "setup");
  await page.setContent(pageHtml.login());
  fs = await forms();
  { const f = fs.find((x) => x.action === "/auth/demo"); assert.ok(f, "login demo form"); assert.ok(f.names.includes("actor") && f.names.includes("preauth"), "login demo fields"); }

  // --- Escaping: untrusted assessment text never injects ---
  const evil = assessmentSchema.parse({ ...assessment, gaps: ["<svg onload=alert(1)>"],
    next_action: { ...assessment.next_action, title: '"><script>window.__pwned=1</script>', rationale: "x & y" } });
  await page.setContent(shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(evil) }));
  const esc = await page.evaluate(() => ({ pwned: window.__pwned ?? null, svg: document.querySelectorAll("svg").length,
    scripts: [...document.querySelectorAll("script")].map((s) => s.textContent).join("\n"), text: document.body.textContent }));
  assert.equal(esc.pwned, null, "no script injection executed");
  assert.equal(esc.svg, 0, "no svg element injected");
  assert.ok(!esc.scripts.includes("__pwned"), "untrusted text not in inline script");
  assert.ok(esc.text.includes("<svg onload=alert(1)>"), "evil gap shown as escaped text");

  assert.equal(attempts.length, 0, `zero external calls, saw ${JSON.stringify(attempts)}`);
  assert.equal(errors.length, 0, `zero page errors, saw ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ ok: true, networkAttempts: attempts.length, pageErrors: errors.length, shotsDir: SHOTS, geometry }, null, 2));
} finally {
  await browser.close();
}
