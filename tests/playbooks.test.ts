import { describe, test, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { arikratt } from "../src/arikratt.js";
import { APPROVAL_KINDS, PLAYBOOKS } from "../src/catalog.js";
import { buildMcpServer, companyObligations, type Ctx } from "../src/mcp.js";
import { computeObligations, type CompanyFacts, type Fact } from "../src/obligations.js";

const MARI = "19990001", FAKE_VALID = "10000062";
const at = (day: string) => new Date(`${day}T10:00:00Z`);
const ar = () => arikratt(openDb(":memory:"), {});
const byId = (id: string) => PLAYBOOKS.find((p) => p.id === id)!;

describe("executable job playbooks (#26)", () => {
  test("shape: every field present, deterministic copy, known approval kind", () => {
    expect(PLAYBOOKS.map((p) => p.id)).toEqual(["deadlines-check", "payment-reminder", "vat-return-prep", "annual-report"]);
    for (const p of PLAYBOOKS) {
      for (const k of ["id", "title", "title_et", "summary", "source", "source_label", "done_when", "verify_with"] as const) expect(p[k], `${p.id}.${k}`).toMatch(/\S/);
      expect(p.steps.length, p.id).toBeGreaterThan(0);
      expect(p.needs.length, p.id).toBeGreaterThan(0);
      expect(p.source).toMatch(/^https:\/\/www\.(riigiteataja|emta)\.ee\//);
      if (p.approval_kind !== null) expect(APPROVAL_KINDS).toContain(p.approval_kind);
    }
    expect(byId("deadlines-check").approval_kind).toBeNull();
    expect(byId("payment-reminder")).toMatchObject({ approval_kind: "send_message", source: "https://www.riigiteataja.ee/akt/V%C3%95S" });
    expect(byId("vat-return-prep")).toMatchObject({ approval_kind: "prepare_filing", triggers: ["vat-return-kmd"] });
    expect(byId("annual-report")).toMatchObject({ approval_kind: "prepare_filing", triggers: ["annual-report", "annual-report-overdue"] });
    expect(byId("annual-report").verify_with).toBe("With applies \"yes\" (public-register facts): the register's report_status; get_obligations stops showing the row once the register lists the report as filed. With applies \"if\": the owner's e-Business Register submission confirmation.");
  });

  test("no playbook says Launchpad does not compute deadlines; the owner does PIN, signature and submission", () => {
    for (const p of PLAYBOOKS) expect(JSON.stringify(p), p.id).not.toMatch(/does not compute|fabricate/i);
    expect(byId("deadlines-check").summary).toBe("Call get_obligations: rules compute each date with its official source. Ask the facts_needed questions first, because one answer can remove a row. Then offer each row's handoff and ask whether to start.");
    const vat = byId("vat-return-prep").steps.join(" ");
    expect(vat).toContain("accounting software's own VAT report");
    expect(vat).toContain("Never calculate a tax amount yourself");
    expect(vat).toMatch(/owner files the return in e-MTA with their own Smart-ID or ID-card; never automate/);
    expect(byId("annual-report").steps.join(" ")).toMatch(/owner signs and submits the report in the e-Business Register; never automate/);
    const remind = byId("payment-reminder").steps.join(" ");
    expect(remind).toContain("Do not threaten late-payment interest (viivis) unless the owner asks for it.");
    expect(remind).toMatch(/request_approval with action kind send_message.*get_approval.*record_action_outcome with outcome sent.*paid only if you see the payment/s);
  });

  test("every trigger is a rule_id the engine can emit, mapped to one playbook, with the same official source", () => {
    const emitted = new Map<string, string>();
    const said = <T>(value: T): Fact<T> => ({ value, provenance: "assistant_supplied" });
    const factSets: CompanyFacts[] = [{}, { vat_registered: said(true) }, { vat_registered: said(false), ytd_turnover_this_year: said(39_000), hire_or_board_fee_starting: said(true) }];
    for (const facts of factSets) for (let m = 0; m < 12; m++) {
      for (const o of computeObligations(facts, { today: at(`2027-${String(m + 1).padStart(2, "0")}-01`), months: 3 }).obligations) emitted.set(o.rule_id, o.source.url);
    }
    const triggers = PLAYBOOKS.flatMap((p) => p.triggers);
    expect(new Set(triggers).size).toBe(triggers.length);
    for (const p of PLAYBOOKS) for (const t of p.triggers) {
      expect([...emitted.keys()], `${p.id} → ${t}`).toContain(t);
      if (t !== "annual-report-overdue") expect(p.source, t).toBe(emitted.get(t));
    }
  });

  test("get_obligations rows carry playbook_id and the referenced playbooks are listed", async () => {
    const may = await companyObligations(ar(), { registryCode: FAKE_VALID, assistant: { vat_registered: true }, months: 2, today: at("2027-05-15") });
    if (!may.ok) throw new Error(may.error);
    const rule = (id: string) => may.result.obligations.filter((o) => o.rule_id === id);
    expect(rule("vat-return-kmd").length).toBeGreaterThan(0);
    for (const o of rule("vat-return-kmd")) expect(o.playbook_id).toBe("vat-return-prep");
    expect(rule("annual-report")[0]?.playbook_id).toBe("annual-report");
    for (const o of rule("tsd-monthly-return")) expect(o).not.toHaveProperty("playbook_id");
    expect(may.result.playbooks).toEqual([
      { id: "vat-return-prep", title: byId("vat-return-prep").title, title_et: byId("vat-return-prep").title_et, approval_kind: "prepare_filing" },
      { id: "annual-report", title: byId("annual-report").title, title_et: byId("annual-report").title_et, approval_kind: "prepare_filing" },
    ]);
    expect(may.result.assistant_instruction).toContain("Ask the facts_needed questions first: an answer can remove a row. Then, for each row with a playbook_id, offer in one line to prepare it, and follow that playbook's steps from get_started. Never compute tax amounts or deadlines yourself.");
    const july = await companyObligations(ar(), { registryCode: FAKE_VALID, months: 1, today: at("2027-07-15") });
    if (!july.ok) throw new Error(july.error);
    expect(july.result.obligations.find((o) => o.rule_id === "annual-report-overdue")?.playbook_id).toBe("annual-report");
  });

  test("next_deadline is present when the window is empty (30 Oct, months 1, VAT-registered sample)", async () => {
    const r = await companyObligations(ar(), { registryCode: MARI, months: 1, today: at("2026-10-30") });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.window).toEqual({ from: "2026-10-30", to: "2026-10-31" });
    expect(r.result.obligations).toEqual([]);
    expect(r.result.next_deadline).toMatchObject({ rule_id: "tsd-monthly-return", effective_due: "2026-11-10" });
    expect(r.result.next_deadline!.effective_due! > r.result.window.to).toBe(true);
  });

  test("next_deadline: Tallinn date boundary at 22:30Z on 30 Oct is already 31 Oct", async () => {
    const r = await companyObligations(ar(), { registryCode: MARI, months: 1, today: new Date("2026-10-30T22:30:00Z") });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.window.from).toBe("2026-10-31");
    expect(r.result.next_deadline).toMatchObject({ effective_due: "2026-11-10" });
  });

  test("next_deadline skips null-date rows and names the first dated row", async () => {
    const r = await companyObligations(ar(), { assistant: { vat_registered: false, hire_or_board_fee_starting: true }, months: 1, today: at("2026-10-30") });
    if (!r.ok) throw new Error(r.error);
    const undated = r.result.obligations.filter((o) => o.effective_due === null).map((o) => o.rule_id);
    expect(undated).toEqual(expect.arrayContaining(["vat-registration-threshold", "tor-registration"]));
    expect(r.result.next_deadline).toMatchObject({ rule_id: "tsd-monthly-return", effective_due: "2026-11-10" });
    // next_deadline: null cannot happen: every future month always emits a dated tsd-monthly-return row within the 3-month horizon.
  });

  test("annual-report from assistant-only facts is conditional and the playbook asks first", async () => {
    const r = await companyObligations(ar(), { assistant: { company_name: "Synthetic OÜ", vat_registered: false }, months: 3, today: at("2027-05-15") });
    if (!r.ok) throw new Error(r.error);
    const row = r.result.obligations.find((o) => o.rule_id === "annual-report");
    expect(row).toMatchObject({ applies: "if", playbook_id: "annual-report" });
    expect(r.result.facts_needed.map((f) => f.fact)).toContain("annual_report");
    const p = byId("annual-report");
    expect(p.steps[0]).toContain("With applies \"if\" the filing state is unknown: ask the owner the facts_needed question first.");
    expect(p.steps[0]).not.toMatch(/row means the report is not listed as filed/);
    expect(p.verify_with).toContain("With applies \"if\": the owner's e-Business Register submission confirmation.");
  });

  test("approval steps name the full action shape with a concrete recipient", () => {
    const recipient: Record<string, string> = { "payment-reminder": "the customer", "vat-return-prep": "\"EMTA (e-MTA)\"", "annual-report": "\"Äriregister (e-äriregister)\"" };
    for (const p of PLAYBOOKS.filter((x) => x.approval_kind)) {
      const step = p.steps.find((x) => x.includes("request_approval with action kind"))!;
      expect(step, p.id).toContain(`kind ${p.approval_kind}`);
      for (const k of ["recipient.name", "period", "document.title", "document.content", "summary"]) expect(step, `${p.id} ${k}`).toContain(k);
      expect(step, p.id).toContain(recipient[p.id]);
    }
    expect(byId("payment-reminder").steps.join(" ")).toMatch(/recipient\.address.*amount_cents/);
  });
});

describe("agent-facing copy over MCP", () => {
  async function connect(scopes: string[], db = openDb(":memory:")) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('o','synthetic-o','google',1,?)").run(now);
    db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('o','ws-o','Synthetic workspace')").run();
    const ctx: Ctx = { ownerId: "o", scopes, companyRef: "ws-o", label: "Synthetic workspace", reportingEnabled: true, baseUrl: "http://localhost:3000" };
    const server: McpServer = buildMcpServer(db, ctx, arikratt(db, {}));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "synthetic-playbooks", version: "1" });
    await Promise.all([server.connect(a), c.connect(b)]);
    return c;
  }

  test("read-only errors: no consent label, request progress:report, tool-accurate copy", async () => {
    const c = await connect(["progress:read"]);
    const lead = "The owner connected you read-only. Tell the owner: „Et saaksin seda sinu eest ette valmistada, ühenda mind AI-hüppelauaga uuesti ja luba nõusolekulehel töid ette valmistada.” When reconnecting, request the progress:report scope; the owner must allow it on the consent page. ";
    const calls: [string, Record<string, unknown>, string][] = [
      ["get_approval", { approval_id: "appr_x" }, "Nothing was read."],
      ["request_approval", { report_id: "r", action: filing }, "Nothing was saved and no approval was requested."],
      ["record_action_outcome", { report_id: "r", approval_id: "appr_x", digest: "x", outcome: "submitted", observed_at: new Date().toISOString() }, "Nothing was recorded."],
      ["report_unmet_need", { report_id: "r", need: "Fill a portal form", blocker: "portal_without_api" }, "Nothing was saved."],
    ];
    for (const [name, args, nothing] of calls) {
      const t = errText(await c.callTool({ name, arguments: args }));
      expect(t, name).toBe(lead + nothing);
      expect(t, name).toContain("progress:report");
      expect(t, name).not.toContain("Jah:");
    }
  });

  test("filing playbooks re-check expiry; an expired prepare_filing approval cannot be recorded", async () => {
    const db = openDb(":memory:");
    const c = await connect(["progress:read", "progress:report"], db);
    const req = body(await c.callTool({ name: "request_approval", arguments: { report_id: "kmd", action: filing } }));
    db.prepare("UPDATE approvals SET state='approved',decided_at=?,expires_at=? WHERE id=?").run(new Date().toISOString(), "2000-01-01T00:00:00.000Z", req.approval_id);
    expect(errText(await c.callTool({ name: "record_action_outcome", arguments: { report_id: "kmd-o", approval_id: req.approval_id, digest: req.digest, outcome: "submitted", observed_at: new Date().toISOString() } })))
      .toBe("This approval expired before an outcome was recorded; request a new approval. Nothing was recorded.");
    const recheck = "Right before the owner files, call get_approval. If it is expired, request a fresh approval for the unchanged figures or draft first. Record the outcome as soon as the owner says it is filed. Approvals are valid for 24 hours.";
    for (const id of ["vat-return-prep", "annual-report"]) expect(byId(id).steps, id).toContain(recheck);
  });
  const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);
  const errText = (r: unknown) => { const x = r as { isError?: boolean; content: { text: string }[] }; expect(x.isError).toBe(true); return x.content[0].text; };
  const filing = { kind: "prepare_filing", recipient: { name: "EMTA (e-MTA)" }, period: "2026-09", document: { title: "KMD 2026-09", content: "Synthetic figures from the accounting VAT report." }, summary: "VAT return for September 2026" };

  test("get_started: deadlines-then-playbook guidance first, full playbooks, truthful storage note", async () => {
    const r = body(await (await connect(["progress:read"])).callTool({ name: "get_started", arguments: {} }));
    expect(Object.keys(r)[0]).toBe("first_step");
    expect(r.first_step.startsWith("Start with the owner's deadlines (get_obligations), then offer the matching playbook.")).toBe(true);
    expect(r.playbooks).toEqual(JSON.parse(JSON.stringify(PLAYBOOKS)));
    expect(r.note).toContain("the exact text of each approval request until the owner deletes their progress");
    expect(r.note).toContain("de-identified text of unmet needs");
    expect(r.note).toContain("It stores no conversations.");
    expect(r.note).toContain("Reporting never approves business actions.");
    expect(r.note).not.toContain("no documents");
    expect(r.note).not.toContain("conversations or documents");
  });

  test("get_obligations defaults to a 2-month window", async () => {
    const r = body(await (await connect(["progress:read"])).callTool({ name: "get_obligations", arguments: { registry_code: MARI } }));
    expect(r.window).toEqual(computeObligations({}, { today: new Date(), months: 2 }).window);
    expect(r).toHaveProperty("next_deadline");
  });
});
