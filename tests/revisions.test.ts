import { test, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer, getState } from "../src/mcp.js";
import { openDb } from "../src/db.js";
import { assessmentSchema, type Assessment } from "../src/core.js";
import { DOMAINS } from "../src/catalog.js";
import { statusBody } from "../src/views.js";

const initial: Assessment = assessmentSchema.parse({
  company_label: "Synthetic Harbor Studio OÜ", company_registry_ref: "synthetic-123",
  assessed_domains: [...DOMAINS], gaps: [], conclusion: "One duty remains unfinished.",
  responsibilities: [
    { id: "billing", domain: "money", label: "Monthly billing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "Synthetic accountant", access: "Existing billing access", success_criterion: "Invoices drafted", next_checkpoint: "Next month", reason: "Accountant handles billing", evidence_refs: [] },
    { id: "unfinished", domain: "people", label: "Staff administration", applicability: "applicable", is_core: false, arrangement: "none", reason: "Seasonal staff need administration", evidence_refs: [] },
  ], next_action: { title: "Arrange staff administration", rationale: "Work remains unfinished", uncertainty: "Assistant judgment only", needs_owner: false },
});
async function fixture(run: (f: { db: ReturnType<typeof openDb>; c: Client; stopped: Client }) => Promise<void>) {
  const db = openDb(":memory:");
  for (const owner of ["one", "two"]) {
    db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES(?,?,'google',1,?)").run(owner, `synthetic-${owner}`, new Date().toISOString());
    db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,'Your business workspace')").run(owner, `workspace-${owner}`);
  }
  const clients: Client[] = [];
  async function connect(reportingEnabled: boolean) {
    const server = buildMcpServer(db, { ownerId: "one", scopes: ["progress:read", "progress:report"], companyRef: "workspace-one", label: "Your business workspace", reportingEnabled, baseUrl: "http://localhost:3000" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "synthetic-revision-test", version: "1" });
    await server.connect(st); await c.connect(ct); clients.push(c); return c;
  }
  try { await run({ db, c: await connect(true), stopped: await connect(false) }); }
  finally { for (const c of clients) await c.close(); db.close(); }
}
const parsed = (r: any) => r.structuredContent ?? JSON.parse(r.content[0].text);
const save = (c: Client, assessment: Assessment, expected_version: number, report_id: string) => c.callTool({ name: "report_assessment", arguments: { assessment, expected_version, report_id } });

test("omission cannot inflate coverage; reasoned scope changes preserve exact receipts and history", async () => fixture(async ({ db, c, stopped }) => {
  const first = await save(c, initial, 0, "initial");
  expect(parsed(first).coverage.percent).toBe(50);
  const p = { report_id: "milestone", task_id: "unfinished", expected_version: 1, observed_at: "2026-01-03T04:05:06.000Z", milestone: "started" };
  const receipt = await c.callTool({ name: "report_progress", arguments: p });
  expect(receipt.isError).not.toBe(true);
  const omitted = { ...initial, responsibilities: [initial.responsibilities[0]] };
  expect((await save(c, omitted, 2, "omitted")).isError).toBe(true);
  expect(getState(db, "one").coverage.percent).toBe(50);
  expect(getState(db, "one").ws.version).toBe(2);
  expect(db.prepare("SELECT count(*) n FROM reports").get()).toEqual({ n: 2 });
  const revised = structuredClone(initial);
  revised.responsibilities[1].applicability = "not_applicable";
  expect((await save(c, revised, 2, "no-new-reason")).isError).toBe(true);
  revised.responsibilities[1].reason = "   ";
  expect((await save(c, revised, 2, "blank-reason")).isError).toBe(true);
  revised.responsibilities[1].reason = "Seasonal employment ended; no staff remain in this business.";
  const second = await save(c, revised, 2, "reclassified");
  expect(parsed(second).coverage.percent).toBe(100);
  expect(parsed(second).diff.scope_changes[0]).toEqual({ id: "unfinished", before: initial.responsibilities[1], after: revised.responsibilities[1] });
  expect(await save(c, initial, 0, "initial")).toEqual(first);
  expect(await save(c, revised, 2, "reclassified")).toEqual(second);
  expect(await c.callTool({ name: "report_progress", arguments: p })).toEqual(receipt);
  expect((await stopped.callTool({ name: "report_progress", arguments: p })).isError).toBe(true);
  const current = parsed(await c.callTool({ name: "get_progress", arguments: {} }));
  expect(current.coverage).toEqual(parsed(second).coverage);
  expect(current.history.map((h: any) => h.version)).toEqual([1, 3]);
  expect(current.assessment.responsibilities[1].reason).toBe(revised.responsibilities[1].reason);
  const st = getState(db, "one");
  const html = statusBody({ label: st.ws.label, demo: false, assessment: st.assessment, coverage: st.coverage, assessedAt: st.assessed_at, exclusions: st.exclusions, historyCount: st.history.length, reportingEnabled: true });
  expect(html).toContain('(100%)'); expect(html).toContain(revised.responsibilities[1].reason);
  expect(html.split('<details>')[0]).toContain(initial.company_label);
  expect(html.split(initial.company_label!).length - 1).toBe(1);
  expect(html).toContain('not verified against a public register, and not a mandate');
}));

test("unknown and foreign existing task IDs cannot create progress, receipts, activity, or versions", async () => fixture(async ({ db, c }) => {
  db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES('foreign','two',1,?,'synthetic',?)").run(JSON.stringify(initial), new Date().toISOString());
  for (const task_id of ["never-defined", "billing"]) {
    const result = await c.callTool({ name: "report_progress", arguments: { report_id: task_id, task_id, expected_version: 0, observed_at: "2026-01-03T04:05:06.000Z", milestone: "external_completion_reported" } });
    expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain("Unknown task_id in this workspace");
  }
  expect(getState(db, "one").ws.version).toBe(0);
  for (const table of ["progress", "reports", "activity"]) expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()).toEqual({ n: 0 });
}));
