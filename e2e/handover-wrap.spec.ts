import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { computeHandover } from "../src/handover.js";
import type { ApprovalRow, StandingRule } from "../src/mcp.js";
import { handoverSection, shell } from "../src/views.js";

const SHOTS = process.env.SHOT_DIR ?? "test-results/screenshots";
mkdirSync(SHOTS, { recursive: true });
const WORD = "raamatupidamisprogramm";

// QA M3: reminders run under a rule that fired, so the next step is the connector card, whose title holds the long compound.
test("„Käest ära” next step: „raamatupidamisprogramm” and the job titles are not split at 960–1280 px, no overflow at 320 px (QA M3)", async ({ page }) => {
  const now = new Date("2026-11-12T10:00:00Z"), at = "2026-11-05T09:00:00Z";
  const approval: ApprovalRow = { id: "appr_1", kind: "send_message", report_id: "r1", digest: "d".repeat(64), state: "consumed", created_at: at, expires_at: "2026-11-30T00:00:00Z", decided_at: at, consumed_at: at,
    outcome_json: JSON.stringify({ outcome: "sent", history: [] }), approved_by_rule: "rule_1", playbook_id: "payment-reminder", payload_json: JSON.stringify({ kind: "send_message", recipient: { name: "Demo Klient OÜ", address: "arved@demo-klient.example" }, amount_cents: 12_000, document: { title: "Meeldetuletus", content: "Tere" }, summary: "Reminder" }) };
  const rule: StandingRule = { id: "rule_1", owner_id: "o", kind: "send_message", recipients_json: null, max_amount_cents: 30_000, max_per_day: 10, expires_at: "2027-02-10T00:00:00Z", created_at: "2026-11-01T00:00:00Z", revoked_at: null };
  const h = computeHandover({ assessment: null, obligations: [], approvals: [approval], rules: [rule], now });
  expect(h.next.type).toBe("connector");
  await page.setContent(shell({ title: "Ühendus", active: "uhendus", body: handoverSection(h, "et", "c", now), csrf: "c", lang: "et", toggle: "/?lang=en" }));
  // Words of 12+ letters in the job titles and the next-step title that render on more than one line.
  const split = () => page.evaluate(() => [...document.querySelectorAll(".ho-title, .ho-next .ask-title")].flatMap((el) => [...el.childNodes].flatMap((node) => {
    if (node.nodeType !== Node.TEXT_NODE) return [];
    return [...node.textContent!.matchAll(/\p{L}{12,}/gu)].filter((m) => {
      const r = document.createRange(); r.setStart(node, m.index!); r.setEnd(node, m.index! + m[0].length);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1;
    }).map((m) => m[0]);
  })));
  for (const width of [960, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".ho-next .ask-title")).toContainText(WORD);
    expect(await split(), `${width} px`).toEqual([]);
  }
  await page.locator(".ho-next").screenshot({ path: `${SHOTS}/ho-next-1280.png` });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
