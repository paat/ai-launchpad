import { describe, test, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { arikratt } from "../src/arikratt.js";
import { APPROVAL_KINDS, PLAYBOOKS } from "../src/catalog.js";
import { buildMcpServer, companyObligations, type Ctx } from "../src/mcp.js";
import { computeObligations, type CompanyFacts, type Fact } from "../src/obligations.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";

const MARI = "19990001", FAKE_VALID = "10000062";
const at = (day: string) => new Date(`${day}T10:00:00Z`);
const ar = () => arikratt(openDb(":memory:"), {});
const byId = (id: string) => PLAYBOOKS.find((p) => p.id === id)!;

describe("executable job playbooks (#26)", () => {
  test("shape: every field present, deterministic copy, known approval kind", () => {
    expect(PLAYBOOKS.map((p) => p.id)).toEqual(["deadlines-check", "connect-service", "books-catch-up", "payment-reminder", "vat-return-prep", "annual-report"]);
    for (const p of PLAYBOOKS) {
      for (const k of ["id", "title", "title_et", "summary", "source", "source_label", "done_when", "verify_with"] as const) expect(p[k], `${p.id}.${k}`).toMatch(/\S/);
      expect(p.steps.length, p.id).toBeGreaterThan(0);
      expect(p.needs.length, p.id).toBeGreaterThan(0);
      expect(p.source).toMatch(/^https:\/\/(www\.(riigiteataja|emta)|abiinfo\.rik)\.ee\//);
      if (p.approval_kind !== null) expect(APPROVAL_KINDS).toContain(p.approval_kind);
    }
    expect(byId("deadlines-check").approval_kind).toBeNull();
    expect(byId("payment-reminder")).toMatchObject({ approval_kind: "send_message", source: "https://www.riigiteataja.ee/akt/13113422?leiaKehtiv=" });
    expect(byId("vat-return-prep")).toMatchObject({ approval_kind: "prepare_filing", triggers: ["vat-return-kmd"] });
    expect(byId("annual-report")).toMatchObject({ approval_kind: "prepare_filing", triggers: ["annual-report", "annual-report-overdue"] });
    expect(byId("annual-report").verify_with).toBe("With applies \"yes\" (public-register facts): the register's report_status; get_obligations stops showing the row once the register lists the report as filed. With applies \"if\": the owner's e-Business Register submission confirmation.");
  });

  test("no playbook says Launchpad does not compute deadlines; the owner does PIN, signature and submission", () => {
    for (const p of PLAYBOOKS) expect(JSON.stringify(p), p.id).not.toMatch(/does not compute|fabricate/i);
    // EMTA moved its tax pages; the old /taxes-and-payment hub returns 404 (QA m10). Checked 200 on 2026-10-31.
    expect(byId("deadlines-check").source).toBe("https://www.emta.ee/en/business-client/taxes-and-payment/payment-arrears/payment-taxes");
    expect(byId("deadlines-check").steps[0]).toBe("Call get_obligations. Rules compute every date; quote them with each row's source link and never compute a deadline yourself.");
    const vat = byId("vat-return-prep").steps.join(" ");
    expect(vat).toContain("accounting software's own VAT report");
    expect(vat).toContain("Never calculate a tax amount yourself");
    expect(vat).toMatch(/owner files the return in e-MTA with their own Smart-ID or ID-card; never automate/);
    expect(byId("annual-report").steps.join(" ")).toMatch(/owner signs and submits the report in the e-Business Register; never automate/);
    const remind = byId("payment-reminder").steps.join(" ");
    expect(remind).toContain("Do not cite the statute or interest in the reminder unless the owner asks.");
    expect(remind).not.toMatch(/threaten|viivis/);
    expect(remind).toMatch(/request_approval with action kind send_message.*get_approval.*record_action_outcome with outcome sent.*Record paid only after a sent outcome, with a NEW report_id.*only if you see the payment/s);
  });

  test("books-catch-up: drafts first, documents before posting, owner asked only what no document explains", () => {
    const p = byId("books-catch-up");
    expect(p).toMatchObject({ approval_kind: null, triggers: [], source: "https://www.riigiteataja.ee/akt/107012025012?leiaKehtiv=" });
    const all = p.steps.join(" ");
    expect(all).toContain("22 Swedbank, 10 SEB, 77 LHV, 42 Coop Pank, 96 Luminor");
    expect(all).toContain("as a draft (unconfirmed) bank entry");
    expect(all).toContain("never post during this step");
    expect(all).toContain("every connected mailbox, searched by the vendor's name and the amount");
    expect(all).toContain("never invent wording, dates or amounts");
    expect(all).toContain("one movement per question");
    expect(all).toContain("Never guess.");
    expect(all).toMatch(/Ask once; post only what they confirm\./);
    expect(p.done_when).toContain("equals the bank statement's balance");
    expect(byId("annual-report").steps.join(" ")).toContain("follow the books-catch-up playbook first");
  });

  test("connect-service: plain words, one branch per service, owner does logins, keys never in chat, read-only", () => {
    const p = byId("connect-service");
    expect(p).toMatchObject({ approval_kind: null, triggers: [] });
    const [rules, ask, ...rest] = p.steps;
    const verify = rest.at(-1)!;
    expect(rules).toMatch(/^Speak plainly: the owner may not know what MCP, a connector or an API is/);
    expect(rules).toContain("This playbook never writes, sends or calls request_approval");
    expect(rules).toContain("Never ask for keys, passwords or PINs in the chat; if the owner pastes one here, do not repeat, store or pass it to any tool");
    expect(p.needs.join(" ")).toContain("never ask for, repeat or accept a password or PIN in the chat");
    expect(ask).toMatch(/^Ask one question unless the owner already said it: what should be linked \(accounting software, e-mail or bank\)/);
    expect(ask).toContain("Follow only the steps that start with that service's name; each one says how to finish. A connector for a different service never lets you skip these steps.");
    expect(ask).toContain("if a connector for that same service already answers, name it and use it instead of asking");
    expect(ask).not.toMatch(/go straight to the last step/);
    // Branch-specific steps are scoped by their prefix; each non-accounting branch ends explicitly.
    const branch = rest.slice(0, -1);
    for (const x of branch) expect(x).toMatch(/^(E-mail|Bank|Accounting): /);
    const email = branch.filter((x) => x.startsWith("E-mail:")), bank = branch.filter((x) => x.startsWith("Bank:")), acc = branch.filter((x) => x.startsWith("Accounting:"));
    expect([email.length, bank.length]).toEqual([1, 1]);
    expect(email[0]).toContain("if it is Gmail or Microsoft 365, offer your built-in connector (if it is already connected, skip the offer), and once it is connected, go to the last step.");
    expect(email[0]).toContain("only if your Gmail or Microsoft 365 connector is already connected, offer in one line to use that mailbox for sending instead");
    expect(email[0]).toContain("do not search or quote catalogue entries for it");
    expect(email[0]).toContain("otherwise stop here without the last step");
    expect(email[0]).toContain("not from the mailbox they asked about");
    expect(email[0]).toContain("This is only an offer: nothing is sent now, and each later send still needs its job's own approval.");
    expect(email[0]).toContain("If the owner agrees, verify that connected mailbox in the last step");
    expect(bank[0]).toMatch(/^Bank: only LHV can be linked, through LHV's own read-only connection \(no payments\)\./);
    expect(bank[0]).toContain("quote only the entry with id lhv-ai; the connector address is https://mcp.lhv.ai/mcp");
    expect(bank[0]).toContain("own Smart-ID (never automate it)");
    expect(bank[0]).toContain("Any other bank: say plainly that it cannot be linked live yet and explain the statement route instead: when a job needs bank data, the owner downloads the account statement for that period from their internet bank as a file and shares it, and it is used only for that job. Then stop here without the last step. Never start a bank key, credential or payment setup, and never offer community bank tools.");
    expect(verify).toContain("LHV, only the date of the latest transaction, with no amounts.");
    for (const s of ["paste the key values", "Add custom connector", "API access permits", "search_services with \"werkzeug\""]) {
      expect(branch.filter((x) => x.includes(s)).every((x) => x.startsWith("Accounting:")), s).toBe(true);
      expect(acc.some((x) => x.includes(s)), s).toBe(true);
    }
    const readOnly = acc.findIndex((x) => x.includes("before any key is created, choose reading only"));
    const create = acc.findIndex((x) => x.includes("guide the owner to create the key"));
    expect(readOnly).toBeGreaterThanOrEqual(0);
    expect(readOnly).toBeLessThan(create);
    expect(acc[readOnly]).toContain("If the product or the connector offers no read-only key, say plainly that it cannot be linked safely yet, because the key could also change the books, and stop here: skip all remaining steps.");
    expect(acc.at(-1)).toMatch(/Once the connector is added, go to the last step\.$/);
    expect(acc.join(" ")).toContain("own Smart-ID or ID-card (never automate the login)");
    expect(acc[0]).toMatch(/^Accounting: if an accounting connector for this company already answers a read-only question, skip the remaining Accounting steps and go to the last step\./);
    expect(acc.join(" ")).toContain("ticks only reading functions (if the permit cannot be limited to reading, stop here: skip all remaining steps)");
    expect(acc.join(" ")).toContain("Merit Aktiva or Erply Books: continue only if the connector's own published setup guide documents a read-only key, and create only that; otherwise stop here: skip all remaining steps. Other software: say plainly that it cannot be linked yet and stop here: skip all remaining steps.");
    expect(acc.join(" ")).toContain("never offer community or local servers from the catalogue");
    expect(acc.join(" ")).toContain("in Claude, Customize → Connectors → Add custom connector (Claude phone app: Settings → Connectors → + → Add custom connector); in ChatGPT, Plugins → add a custom MCP server.");
    expect(acc.join(" ")).toContain("removing AI Launchpad stops deadlines and approvals, suggest upgrading the plan, and stop here without the last step; never suggest removing AI Launchpad.");
    expect(verify).toMatch(/^Verify only the service the owner asked for, or the mailbox they agreed to use instead, read-only,/);
    expect(verify).toContain("or the mailbox they agreed to use instead");
    expect(verify).toContain("e-mail, only the date of the newest message, with no subject or content;");
    expect(verify).toContain("Do not create, change, delete or send anything during setup.");
    for (const id of ["payment-reminder", "vat-return-prep", "annual-report"]) expect(byId(id).needs[0], id).toContain("(if no accounting connector answers yet, follow the connect-service playbook)");
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

  test("assistant_instruction: a conditional next_deadline is presented as conditional, its question first (tribunal T-006)", async () => {
    const r = await companyObligations(ar(), { registryCode: MARI, months: 1, today: at("2026-10-30") });
    if (!r.ok) throw new Error(r.error);
    expect(r.result.assistant_instruction.endsWith(" If next_deadline.applies is 'if', present it as conditional and quote its condition.")).toBe(true);
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

  test("payment-reminder: amount_cents is required, in euro cents with an example, and the text states the same amount (tribunal T-001)", () => {
    const steps = byId("payment-reminder").steps;
    const approval = steps.find((x) => x.includes("request_approval"))!;
    expect(approval).toContain("amount_cents: REQUIRED, the overdue amount in euro cents, exactly as on the invoice (e.g. 240,00 € → 24000)");
    expect(steps.find((x) => x.startsWith("Draft"))).toContain("the amount in the text is the same amount you put in amount_cents");
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

  test("server instructions send 'connect my e-mail / accounting' to Launchpad first, in plain words", async () => {
    const c = await connect(["progress:read"]);
    const i = c.getInstructions() ?? "";
    expect(i).toContain("may not know technical words such as MCP, connector or API");
    expect(i).toContain("short sentences, everyday words, one question per message, and no technical codes or file formats unless the owner uses them first.");
    expect(i).not.toMatch(/CAMT|ISO|XML/);
    expect(i).toContain("Before asking the owner for any fact or document, check both public data (get_obligations public_facts) and the owner's own connected files, such as Google Drive; ask only if neither has it. Always ask the facts_needed questions from get_obligations, and never let a file stand in for the owner's answer to them.");
    expect(i).toContain("call connect_my_services and follow the connect-service playbook it returns before answering from your own connector directory; it says which lookups are allowed.");
    const tools = (await c.listTools()).tools;
    expect(tools.find((x) => x.name === "search_services")?.description).toMatch(/^Research catalogue behind the connect-service playbook: when linking a service, query only as that playbook's branch says\./);
  });

  test("connect_my_services: owner phrasing finds it, read-only, returns the connect-service playbook for any scope", async () => {
    const c = await connect([]);
    const tool = (await c.listTools()).tools.find((x) => x.name === "connect_my_services")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    for (const w of ["e-mail", "Proton Mail", "Gmail", "bank", "LHV", "accounting software", "e-arveldaja", "send invoices from their mailbox", "before searching your own connector directory"]) expect(tool.description, w).toContain(w);
    const r = JSON.parse(((await c.callTool({ name: "connect_my_services", arguments: {} })) as { content: { text: string }[] }).content[0].text) as { playbook: { id: string; steps: string[] }; first_step: string };
    expect(r.playbook).toEqual(PLAYBOOKS.find((p) => p.id === "connect-service"));
    expect(r.first_step).toContain("one plain question per message");
  });

  test("read-only errors: no consent label, request progress:report, tool-accurate copy", async () => {
    const c = await connect(["progress:read"]);
    const lead = "The owner connected you read-only. Tell the owner: „Et saaksin seda sinu eest ette valmistada, ühenda mind AI-hüppelauaga uuesti ja luba nõusolekulehel töid ette valmistada.” When reconnecting, request the progress:report scope; the owner must allow it on the consent page. ";
    const calls: [string, Record<string, unknown>, string][] = [
      ["get_approval", { approval_id: "appr_x" }, "Nothing was read."],
      ["request_approval", { report_id: "r", action: filing }, "Nothing was saved and no approval was requested."],
      ["record_action_outcome", { report_id: "r", approval_id: "appr_x", digest: "x", outcome: "submitted", observed_at: new Date().toISOString() }, "Nothing was recorded."],
      ["report_unmet_need", { report_id: "r", need: "Fill a portal form", blocker: "portal_without_api" }, "Nothing was saved."],
      // #36 item 5: the reporting tools give the same reconnect guidance.
      ["report_assessment", { report_id: "r", expected_version: 0, assessment: DEMO_FIXTURES.alpha }, "Nothing was saved."],
      ["report_progress", { report_id: "r", task_id: "t", expected_version: 0, observed_at: new Date().toISOString(), milestone: "started" }, "Nothing was saved."],
      ["submit_service_candidate", { name: "Synthetic Service", connection: "https://service.example", jobs: "Invoices" }, "No nomination was saved."],
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
    const recheck = "Right before the owner files, call get_approval. If it is expired, request a fresh approval with a NEW report_id (the same report_id returns the expired receipt) for the unchanged figures or draft first. Approvals are valid for 24 hours.";
    for (const id of ["vat-return-prep", "annual-report"]) expect(byId(id).steps, id).toContain(recheck);
  });

  test("annual-report: approval of the period, key figures and signed version is required, acted on only when approved, outcome recorded (tribunal T-003, #36 item 1)", () => {
    const p = byId("annual-report");
    expect(p.steps.join(" ")).not.toMatch(/optional/i);
    const approval = p.steps.findIndex((x) => x.includes("request_approval with action kind prepare_filing"));
    // document.content holds at most 4000 characters: it binds the key figures, not the full draft.
    expect(p.steps[approval]).toContain("period: the financial year");
    expect(p.steps[approval]).toContain("document.title: the file name or version the owner will sign in the e-Business Register");
    expect(p.steps[approval]).toContain("document.content: the key figures (revenue, profit and balance-sheet totals) exactly as they appear in the accounting software, not the full draft");
    expect(JSON.stringify(p)).not.toMatch(/exact (report )?draft|approved draft/);
    expect(p.steps[approval]).toContain("This approval is REQUIRED before the owner signs or submits.");
    const filing = p.steps.findIndex((x) => x.includes("owner signs and submits the report"));
    expect(p.steps[filing]).toMatch(/^Act only after get_approval returns approved/);
    expect(filing).toBeGreaterThan(approval);
    expect(p.steps[filing + 1]).toBe("When the owner says it is submitted, call record_action_outcome with outcome submitted.");
    expect(p.done_when).toBe("The owner submitted the report in the e-Business Register and record_action_outcome recorded submitted.");
  });

  test("summaries are plain owner language without tool names; tool instructions stay in steps (tribunal T-005)", () => {
    for (const p of PLAYBOOKS) {
      expect(p.summary, p.id).not.toMatch(/get_|request_|record_|facts_needed|search_services|report_id|amount_cents/);
      expect(p.summary, p.id).toMatch(/^Your assistant /);
    }
    expect(byId("deadlines-check").steps.join(" ")).toContain("get_obligations");
    expect(byId("payment-reminder").summary).toContain("Nothing is sent until you approve the exact text, amount and recipient.");
  });

  test("payment-reminder: re-check expiry and renew before sending; paid only after a sent outcome (#36 items 2–3)", () => {
    const steps = byId("payment-reminder").steps;
    const recheck = steps.findIndex((x) => x.startsWith("Right before sending, call get_approval."));
    expect(steps[recheck]).toBe("Right before sending, call get_approval. If it is expired, request a fresh approval with a NEW report_id (the same report_id returns the expired receipt) for the unchanged reminder first. Approvals are valid for 24 hours.");
    const send = steps.findIndex((x) => x.startsWith("Only the live state authorizes a send: if get_approval (or current_state on a request_approval replay) returns approved (including auto_approved under the owner's standing approval) and usable is not false"));
    const sent = steps.indexOf("Call record_action_outcome with outcome sent (or failed).");
    const paid = steps.findIndex((x) => x.startsWith("Record paid only after a sent outcome, with a NEW report_id"));
    expect(steps.findIndex((x) => x.includes("request_approval"))).toBeLessThan(recheck);
    expect([recheck < send, send < sent, sent < paid]).toEqual([true, true, true]);
    expect(steps[paid]).toContain("A failed reminder can never become paid.");
  });

  test("the expiry re-check only re-checks and renews; recording comes after the owner files (tribunal T-004)", () => {
    for (const id of ["vat-return-prep", "annual-report"]) {
      const steps = byId(id).steps;
      const recheck = steps.findIndex((x) => x.startsWith("Right before the owner files"));
      const filing = steps.findIndex((x) => x.includes("never automate the login, signature or submission"));
      const recording = steps.findIndex((x) => x.includes("record_action_outcome"));
      expect(steps[recheck], id).not.toMatch(/record_action_outcome|[Rr]ecord the outcome/);
      expect(recheck, id).toBeLessThan(filing);
      expect(recording, id).toBeGreaterThan(filing);
      expect(steps.filter((x) => x.includes("record_action_outcome")), id).toHaveLength(1);
    }
  });

  test("every expired-approval renewal asks for a NEW report_id (tribunal T-002)", () => {
    const renewals = PLAYBOOKS.flatMap((p) => p.steps.filter((x) => /expired/.test(x)).map((x) => [p.id, x] as const));
    expect(renewals.map(([id]) => id)).toEqual(["payment-reminder", "vat-return-prep", "annual-report"]);
    for (const [id, x] of renewals) expect(x, id).toContain("request a fresh approval with a NEW report_id (the same report_id returns the expired receipt)");
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
