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
import { computeObligations } from "../src/obligations.ts";
import { SYNTHETIC_COMPANIES } from "../src/fixtures.ts";
import { assessmentSchema, computeCoverage } from "../src/core.ts";

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
const NOW = new Date("2026-11-03T12:00:00Z");
const mari = computeObligations(SYNTHETIC_COMPANIES["19990001"].facts, { today: NOW, months: 2 });
const mariDeadlines = { company: { name: "Mari Disain OÜ", registry_code: "19990001", synthetic: true, provenance: "synthetic_fixture", label_et: "Näidis", label_en: "Sample", snapshot_id: null, as_of: null, sources: [], attribution: "" }, obligations: mari.obligations, facts_needed: mari.facts_needed };
const tana = (a, extra = {}) => tanaBody({ lang: "et", csrf: CSRF, sample: true, label: "Synthetic OÜ", assessment: a, coverage: computeCoverage(a), assessedAt: a ? "2026-10-28T10:00:00Z" : null, exclusions: [], approvals: [], progress: [], deadlines: null, needs: [], reportCount: 1, now: NOW, ...extra });
// An 80-character document title on a consumed (sent) approval: the receipt and list must wrap it.
const LONG_TITLE = "Maksemeeldetuletus: arve 2026-011 Kase Konsult OÜ tellitud strateegiaseminari eest";
const longApproval = { id: "appr_long", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "consumed", created_at: "2026-11-03T09:00:00Z", expires_at: "2026-11-04T09:00:00Z", decided_at: "2026-11-03T09:05:00Z", consumed_at: "2026-11-03T09:10:00Z",
  outcome_json: JSON.stringify({ outcome: "sent", observed_at: "2026-11-03T09:10:00Z", history: [{ outcome: "sent", observed_at: "2026-11-03T09:10:00Z" }] }),
  payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 24000, period: "2026-10", document: { title: LONG_TITLE, content: "Tere!" }, summary: "Tasumata arve." }) };
const pageHtml = {
  "connection-https": () =>
    shell({ title: "Connection", active: "none", csrf: CSRF, sample: true, bodyLang: "en",
      body: connectionBody({ csrf: CSRF, baseUrl: "https://launchpad.example.com", reportingEnabled: false, tokens: [], grants: [], candidates: [] }) }),
  "connection-local": () =>
    shell({ title: "Connection", active: "none", csrf: CSRF, sample: true, bodyLang: "en",
      body: connectionBody({ csrf: CSRF, baseUrl: "http://localhost:3000", reportingEnabled: false, tokens: [], grants: [], candidates: [] }) }),
  "status-assessed": () =>
    shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(assessment, { deadlines: mariDeadlines, needs: [{ id: "need_1", state: "classified", reason: null, need_redacted: "Esita KMD", blocker: "needs_owner_pin_or_signature", job_hint_redacted: null, category: "tax_filings", demand_label: "KMD esitamine", same_as: null, spec: "Mock.", classified_by: "mock", created_at: "2026-11-03T10:00:00Z" }] }) }),
  "status-unassessed": () =>
    shell({ title: "Täna", active: "tana", csrf: CSRF, sample: true, body: tana(null) }),
  activity: () =>
    shell({ title: "Tehtud", active: "tehtud", csrf: CSRF, sample: true,
      body: activityBody({ rows: [{ action: "report_progress", actor: "assistant", outcome: "ok", created_at: "2026-10-28T10:00:00Z", summary: "Synthetic" }], receipts: [], exclusions: [], lang: "et", now: NOW }) }),
  login: () =>
    shell({ title: "Logi sisse", active: "none", csrf: "", body: loginBody({ lang: "et", demo: true, google: true, preauth: "pre-1", companies: [{ key: "alpha", label: "Mari Disain OÜ (näidis)" }] }) }),
  landing: () =>
    shell({ title: "Tähtajad", active: "none", csrf: "", sample: true, body: landingBody({ lang: "et", q: "Mari Disain", state: { kind: "result", result: mariDeadlines }, now: NOW }) }),
  "landing-empty": () =>
    shell({ title: "Tähtajad", active: "none", csrf: "", body: landingBody({ lang: "et", q: "", state: { kind: "empty" }, now: NOW }) }),
  uhenda: () =>
    shell({ title: "Ühenda", active: "uhendus", csrf: CSRF, body: connectBody({ lang: "et", baseUrl: "https://launchpad.example.com", assistant: "chatgpt", state: { kind: "waiting" }, owner: true }) }),
  "uhenda-local": () =>
    shell({ title: "Ühenda", active: "uhendus", csrf: CSRF, body: connectBody({ lang: "et", baseUrl: "http://127.0.0.1:3210", assistant: "chatgpt", state: { kind: "anon" }, owner: false }) }),
  "approval-receipt-long": () =>
    shell({ title: "Kinnitus", active: "none", csrf: CSRF, sample: true, body: approvalCardBody({ csrf: CSRF, a: longApproval, lang: "et", sample: true, now: NOW }) }),
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
  const NEW_PAGES = new Set(["status-assessed", "status-unassessed", "activity", "login", "landing", "landing-empty", "uhenda", "uhenda-local", "approval-receipt-long", "approvals"]);
  const overflowAndTargets = (allAnchors) => page.evaluate((allAnchors) => {
    const de = document.documentElement;
    const targets = [];
    const standAlone = (a) => ![...a.parentElement.childNodes].some((n) => n.nodeType === 3 && n.textContent.replace(/[\s·|]/g, ""));
    const els = new Set(document.querySelectorAll("button, .btn, nav.main a, .tabs button, .choice a, .lang-toggle, .tap-link, .link-row, label.check, .today-sum a"));
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
  }

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
  // Täna is zero-JS: no inline script; the prompts are visible text.
  for (const name of ["status-assessed", "status-unassessed", "landing", "landing-empty", "uhenda", "activity", "login"]) {
    assert.ok(!pageHtml[name]().includes("<script"), `${name}: zero inline JS`);
  }

  // --- Unknowns visible outside closed details; synthetic/unchecked labels ---
  await page.setContent(pageHtml["status-assessed"]());
  const unk = await page.evaluate(() => {
    const box = [...document.querySelectorAll("#ootab .ask-row")].find((r) => r.textContent.includes("An urgent filing remains unassessed."));
    return { exists: !!box, visible: !!box && box.getBoundingClientRect().height > 0, inDetails: !!box?.closest("details"),
      body: document.body.textContent, sample: document.querySelector("header .label-chip--sample")?.textContent ?? "",
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
