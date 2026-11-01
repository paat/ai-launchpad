import { test, expect } from "@playwright/test";
import type { ApprovalRow } from "../src/mcp.js";
import { BASETEN_MODEL } from "../src/model-quality.js";
import { approvalCardBody, approvalsListBody, shell } from "../src/views.js";

for (const lang of ["et", "en"] as const) for (const width of [320, 390]) {
  test(`approval checks wrap and escape on list and detail (${lang}, ${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const now = new Date("2026-11-01T12:00:00Z");
    const summary = `<img src=x onerror=alert(1)> ${"LongText".repeat(18)}`;
    const concerns = [`<script>alert(1)</script>${"Concern".repeat(18)}`];
    const base: ApprovalRow = { id: "synthetic-check", kind: "send_invoice", report_id: "synthetic-report", digest: "d".repeat(64), state: "pending", expires_at: "2026-11-02T12:00:00Z", created_at: now.toISOString(), decided_at: null, consumed_at: null, outcome_json: null,
      payload_json: JSON.stringify({ kind: "send_invoice", recipient: { name: "Synthetic Client", address: "billing@client.example" }, amount_cents: 12000, currency: "EUR", document: { title: "Invoice 1", content: "Total 120 EUR" }, summary: "Send invoice" }), check_by: BASETEN_MODEL };
    const rows: ApprovalRow[] = [
      { ...base, id: "review", check_state: "review", check_json: JSON.stringify({ verdict: "review", summary_et: summary, summary_en: summary, concerns_et: concerns, concerns_en: concerns }) },
      { ...base, id: "ok", check_by: "mock", check_state: "ok", check_json: JSON.stringify({ verdict: "ok", summary_et: "Näidis, mitte mudel.", summary_en: "Sample, not a model.", concerns_et: [], concerns_en: [] }) },
      { ...base, id: "running", check_state: "running" },
      { ...base, id: "unavailable", check_state: "unavailable", check_json: JSON.stringify({ reason: "invalid_output" }) },
    ];
    for (const body of [approvalsListBody(rows, lang, false, now), ...rows.map(a => approvalCardBody({ a, lang, sample: false, csrf: "synthetic-csrf", now }))]) {
      await page.setContent(shell({ title: "Approvals", active: "none", body, csrf: "synthetic-csrf", lang }));
      await expect(page.locator(".approval-check").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      await expect(page.locator(".approval-check img, .approval-check script")).toHaveCount(0);
    }
  });
}
