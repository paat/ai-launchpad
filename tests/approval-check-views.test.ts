import { describe, expect, test } from "vitest";
import { approvalCardBody, approvalsListBody, connectionBody, shell } from "../src/views.js";
import type { ApprovalRow } from "../src/mcp.js";
import { BASETEN_MODEL } from "../src/model-quality.js";

const output = {
  verdict: "ok", summary_et: "Näidiskliendile saadetakse 12 euro arve.", summary_en: "The sample customer receives a 12 euro invoice.",
  concerns_et: [] as string[], concerns_en: [] as string[],
};
const row = (changes: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "approval_sample", kind: "send_invoice", report_id: "sample_request", digest: "a".repeat(64), state: "pending",
  payload_json: JSON.stringify({ kind: "send_invoice", recipient: { name: "Sample OÜ", address: "invoice@sample.example" }, amount_cents: 1200, currency: "EUR", document: { title: "Sample invoice", content: "Total 12.00 EUR" }, summary: "Send the sample invoice." }),
  created_at: "2026-11-01T12:00:00Z", expires_at: "2026-11-02T12:00:00Z", decided_at: null, consumed_at: null, outcome_json: null,
  check_state: "ok", check_by: BASETEN_MODEL, check_json: JSON.stringify(output), check_at: "2026-11-01T12:00:00Z", ...changes,
});
const render = (a: ApprovalRow, lang: "et" | "en" = "et") => [
  approvalCardBody({ a, lang, sample: false, csrf: "sample_csrf" }), approvalsListBody([a], lang, false),
];

describe("advisory approval check cards", () => {
  test("live success has localized summary and exact model provenance on detail and list", () => {
    for (const html of render(row())) {
      expect(html).toContain("Meta Muse kontroll");
      expect(html).toContain("✓ Muse ei leidnud vastuolu");
      expect(html).toContain(output.summary_et);
      expect(html).toContain("Meta muse-spark-open-1026 · Baseten · nõuanne, mitte garantii");
      expect(html).not.toContain(output.summary_en);
    }
    for (const html of render(row(), "en")) {
      expect(html).toContain("Meta Muse check");
      expect(html).toContain("✓ Muse found no inconsistency");
      expect(html).toContain(output.summary_en);
      expect(html).toContain("advice, not a guarantee");
    }
  });

  test("review concerns and summaries escape all model text in both languages and both views", () => {
    const value = { ...output, verdict: "review", summary_et: '<script>alert("et")</script>', summary_en: '<script>alert("en")</script>', concerns_et: ['<img src=x onerror="alert(1)">'], concerns_en: ['<img src=x onerror="alert(2)">'] };
    for (const lang of ["et", "en"] as const) for (const html of render(row({ check_state: "review", check_json: JSON.stringify(value) }), lang)) {
      expect(html).toContain(lang === "et" ? "⚠ Muse soovitab üle vaadata" : "⚠ Muse suggests a review");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("<li>&lt;img");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img");
      expect(html).not.toContain("✓ Muse");
    }
  });

  test("mock output explicitly says sample and does not claim Muse checked it", () => {
    for (const lang of ["et", "en"] as const) for (const html of render(row({ check_by: "mock" }), lang)) {
      expect(html).toContain(lang === "et" ? "Näidis, mitte mudel" : "Sample, not a model");
      expect(html).toContain(lang === "et" ? "Näidiskontroll ei leidnud vastuolu" : "The sample check found no inconsistency");
      expect(html).not.toContain("✓ Muse");
      expect(html).not.toContain("· Baseten");
    }
  });

  test("running has no verdict or old summary", () => {
    for (const lang of ["et", "en"] as const) for (const html of render(row({ check_state: "running" }), lang)) {
      expect(html).toContain(lang === "et" ? "Kontroll käib…" : "Check in progress…");
      expect(html).not.toContain("✓ Muse");
      expect(html).not.toContain(output.summary_et);
      expect(html).not.toContain(output.summary_en);
    }
  });

  test.each([
    ["disabled", "kontroll on välja lülitatud", "checking is disabled"],
    ["daily_limit", "tänane kontrollide piir on täis", "the daily check limit was reached"],
    ["budget_exhausted", "kontrollide eelarve on kasutatud", "the check budget is used up"],
    ["suppressed_after_breach", "teenuse vastus ei vastanud kokkuleppele", "the provider did not meet its response contract"],
    ["provider_contract_breach", "teenuse vastus ei vastanud kokkuleppele", "the provider did not meet its response contract"],
    ["provider_uncertain", "teenus ei andnud õigel ajal kindlat vastust", "the provider did not return a reliable answer in time"],
    ["timeout", "teenus ei vastanud õigel ajal", "the provider did not answer in time"],
    ["provider_failed", "mudeliteenus ei vastanud", "the model service did not answer"],
    ["invalid_output", "vastus ei olnud loetav", "the answer was unreadable"],
    ["attempt_in_flight", "teine kontroll on pooleli", "another check is in progress"],
    ["interrupted", "kontroll katkes", "the check was interrupted"],
    ["<script>unknown</script>", "kontroll ei olnud saadaval", "the check was unavailable"],
  ])("unavailable %s is a plain reason and never a pass", (reason, et, en) => {
    for (const lang of ["et", "en"] as const) for (const html of render(row({ check_state: "unavailable", check_json: JSON.stringify({ reason }) }), lang)) {
      expect(html).toContain(lang === "et" ? `Kontrolli ei tehtud: ${et}` : `Not checked: ${en}`);
      expect(html).not.toContain("✓ Muse");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("Meta muse-spark-open-1026 · Baseten");
    }
  });

  test.each(["invalid JSON", "null", JSON.stringify({ ...output, verdict: "review" }), JSON.stringify({ ...output, extra: "field" })])("stored invalid output does not render as a pass: %s", (check_json) => {
    for (const html of render(row({ check_json }))) {
      expect(html).toContain("Kontrolli ei tehtud: vastus ei olnud loetav");
      expect(html).not.toContain("✓ Muse");
    }
  });

  test.each(["pending", "approved", "declined", "expired", "consumed"])("detail retains the check in approval state %s", (state) => {
    const a = row({ state, outcome_json: state === "consumed" ? JSON.stringify({ outcome: "sent" }) : null });
    expect(render(a)[0].match(/class="approval-check small"/g)).toHaveLength(1);
    expect(render(a)[0]).toContain(output.summary_et);
  });

  test("standing-approved detail retains one check", () => {
    const html = render(row({ state: "approved", approved_by_rule: "sample_rule" }))[0];
    expect(html.match(/class="approval-check small"/g)).toHaveLength(1);
  });

  test("legacy approvals say not checked", () => {
    for (const html of render(row({ check_state: undefined, check_json: undefined, check_by: undefined }))) {
      expect(html).toContain("seda kinnitust pole kontrollitud");
      expect(html).not.toContain("✓ Muse");
    }
  });

  test("check text wraps within flex list rows and cards", () => {
    const html = shell({ title: "Checks", body: render(row())[1], active: "none", csrf: "" });
    expect(html).toMatch(/\.approval-check\{[^}]*min-width:0;overflow-wrap:anywhere/);
    expect(html).toContain(".link-row>div{min-width:0;flex:1}");
  });

  test("connection privacy states exact approval text is sent to Meta via Baseten in both languages", () => {
    for (const lang of ["et", "en"] as const) {
      const html = connectionBody({ lang, csrf: "sample", baseUrl: "https://sample.example", reportingEnabled: false, tokens: [], grants: [], candidates: [] });
      expect(html).toContain(lang === "et" ? "kinnitustaotluse täpne tekst" : "the exact approval text");
      expect(html).toContain(lang === "et" ? "Meta avatud mudelile, mida majutab Baseten" : "Meta’s open model hosted by Baseten");
      expect(html).not.toMatch(/zero retention|no retention|ei säilita/i);
    }
  });
});
