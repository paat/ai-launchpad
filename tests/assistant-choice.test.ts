import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type Config } from "../src/app.js";
import { PLAN_NOTE, REASONS, chooseAssistant, offerDownload, parseBusiness, parseUses } from "../src/assistant-choice.js";
import { openDb } from "../src/db.js";
import { CHOOSER_TOPICS, FRICTION_TOPICS, PublicCards } from "../src/model-public-cards.js";
import { main as batchMain, parseArgs as parseBatchArgs } from "../src/model-public-cards-cli.js";
import { ModelQualityLedger, type FetchFn } from "../src/model-quality.js";

test("chooseAssistant covers every rule and never guesses", () => {
  expect(chooseAssistant({ uses: "claude", tier: "free" })).toEqual({ assistant: "claude", reason: "already_claude" });
  expect(chooseAssistant({ uses: "claude", tier: "paid" })).toEqual({ assistant: "claude", reason: "already_claude" });
  expect(chooseAssistant({ uses: "claude", tier: "unsure", business: "no" })).toEqual({ assistant: "claude", reason: "already_claude" });
  expect(chooseAssistant({ uses: "chatgpt", business: "yes" })).toEqual({ assistant: "chatgpt", reason: "chatgpt_business" });
  expect(chooseAssistant({ uses: "chatgpt", business: "no" })).toEqual({ assistant: "claude", reason: "chatgpt_no_approvals" });
  expect(chooseAssistant({ uses: "chatgpt", business: "unsure" })).toEqual({ assistant: "claude", reason: "chatgpt_no_approvals" });
  expect(chooseAssistant({ uses: "other" })).toEqual({ assistant: "claude", reason: "other_untested" });
  expect(chooseAssistant({ uses: "none" })).toEqual({ assistant: "claude", reason: "none" });
  for (const answers of [{}, { uses: "chatgpt" }, { uses: "chatgpt", business: "maybe" }, { uses: "Claude" }, { uses: "" }, { business: "yes" }, { uses: ["claude"] }, { uses: "claude" }, { uses: "claude", tier: "maybe" }]) {
    expect(chooseAssistant(answers)).toBeNull();
  }
  expect(parseUses("none")).toBe("none");
  expect(parseUses("nope")).toBeNull();
  expect(parseBusiness("unsure")).toBe("unsure");
  expect(parseBusiness("yes ")).toBeNull();
  expect(offerDownload("claude", "claude")).toBeNull();
  expect(offerDownload("chatgpt", "chatgpt")).toBeNull();
  expect(offerDownload("chatgpt", "claude")).toBe("https://claude.ai/download");
  expect(offerDownload("none", "claude")).toBe("https://claude.ai/download");
  expect(offerDownload("other", "claude")).toBe("https://claude.ai/download");
  for (const id of Object.keys(REASONS) as (keyof typeof REASONS)[]) {
    for (const text of [REASONS[id].text.et, REASONS[id].text.en, REASONS[id].source.et, REASONS[id].source.en]) {
      expect(text).not.toMatch(/\b(MCP|connector|API|OAuth|IBAN)\b/);
    }
  }
  expect(PLAN_NOTE.source.et).toBe("Claude'i tasuta paketis on üks oma ühendus (kontrollitud 31.10.2026)");
  expect(PLAN_NOTE.source.en).toBe("Claude's free plan has one custom connector (checked 31 Oct 2026)");
  expect(`${PLAN_NOTE.text.et} ${PLAN_NOTE.connect.et} ${PLAN_NOTE.source.et}`).not.toMatch(/\b(MCP|API|connector)\b/);
  expect(CHOOSER_TOPICS.map((t) => t.id)).toEqual([
    "choose-already_claude", "choose-already_grok", "choose-chatgpt_business", "choose-chatgpt_no_approvals", "choose-other_untested", "choose-none",
  ]);
  for (const topic of CHOOSER_TOPICS) {
    expect(topic.job).toBe("setup_guidance");
    expect(topic.input.en.length).toBeGreaterThan(0);
    expect(topic.input.et.length).toBeLessThan(2000);
    expect(topic.input.en).toContain("30 Oct 2026");
    expect(topic.input.en).toContain("3 short plain sentences");
    expect(topic.input.et).toContain("3 lühikest");
  }
});

test("operator batch accepts a chooser topic in dry mode and still rejects arbitrary ids", async () => {
  expect(parseBatchArgs(["--topic", "choose-none", "--locale", "et"])).toMatchObject({ live: false, topicId: "choose-none", locale: "et" });
  expect(() => parseBatchArgs(["--topic", "choose-none", "--topic", "choose-already_claude"])).toThrow(/Duplicate/);
  const logs: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((v?: unknown) => { logs.push(String(v)); });
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await batchMain(["--list-topics"], { env: {} as NodeJS.ProcessEnv })).toBe(0);
    expect(logs.at(-1)?.split("\n")).toEqual([...FRICTION_TOPICS, ...CHOOSER_TOPICS].map((t) => t.id));
    expect(await batchMain(["--topic", "choose-none", "--locale", "et", "--ledger", "/nonexistent/vali.db"], { env: {} as NodeJS.ProcessEnv })).toBe(0);
    expect(JSON.parse(logs.at(-1)!)).toMatchObject({ dry: true, mock: true, topic: "choose-none", locale: "et", job: "setup_guidance" });
    expect(logs.at(-1)).toContain("DRY RUN");
    expect(await batchMain(["--topic", "choose-assistant"], { env: {} as NodeJS.ProcessEnv })).toBe(2);
    expect(await batchMain(["--topic", "drop-tables"], { env: {} as NodeJS.ProcessEnv })).toBe(2);
  } finally { log.mockRestore(); err.mockRestore(); }
});

let server: Server; let base = "";
beforeAll(async () => {
  const cfg: Config = { demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app } = createApp(cfg, openDb(":memory:"));
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cfg.baseUrl = base;
});
afterAll(() => { server.closeAllConnections(); server.close(); });

const get = (path: string, cookie?: string) => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });

test("/vali redirects to /alusta and keeps only the language", async () => {
  const et = await get("/vali");
  expect(et.status).toBe(302);
  expect(et.headers.get("location")).toBe("/alusta");
  const en = await get("/vali?lang=en");
  expect(en.status).toBe(302);
  expect(en.headers.get("location")).toBe("/alusta?lang=en");
  const etLang = await get("/vali?lang=et");
  expect(etLang.status).toBe(302);
  expect(etLang.headers.get("location")).toBe("/alusta?lang=et");
  const secret = await get("/vali?uses=zz-secret-token&lang=en");
  expect(secret.status).toBe(302);
  expect(secret.headers.get("location")).toBe("/alusta?lang=en");
  expect(secret.headers.get("location")).not.toContain("zz-secret-token");
  expect(await secret.text()).not.toContain("zz-secret-token");
  const home = await get("/?lang=en");
  expect(home.headers.get("set-cookie") ?? "").toContain("lang=en");
});

test("a Grok user is recommended Grok Bot; none and unsure stay on Claude", async () => {
  expect(chooseAssistant({ uses: "grok" })).toEqual({ assistant: "grok", reason: "already_grok" });
  expect(chooseAssistant({ uses: "none" })).toEqual({ assistant: "claude", reason: "none" });
  expect(chooseAssistant({ uses: "chatgpt", business: "unsure" })).toEqual({ assistant: "claude", reason: "chatgpt_no_approvals" });
  expect(chooseAssistant({ uses: "chatgpt", business: "no" })).toEqual({ assistant: "claude", reason: "chatgpt_no_approvals" });
  expect(parseUses("grok")).toBe("grok");
  expect(offerDownload("grok", "grok")).toBeNull();
  const reason = REASONS.already_grok;
  expect(reason.assistant).toBe("grok");
  expect(reason.text.en).toBe("You already use Grok. Stay with it.");
  expect(reason.text.et).toBe("Sa juba kasutad Groki. Jää selle juurde.");
  expect(reason.source.en).toBe("Source: approvals were tested on Grok Bot, 1 Nov 2026.");
  expect(reason.source.et).toBe("Allikas: Grok Botis on kinnitused proovitud 1.11.2026.");
  expect(`${reason.text.en} ${reason.text.et} ${reason.source.en} ${reason.source.et}`).not.toMatch(/\b(plan|Free|Business|MCP|connector|API|OAuth|Cursor)\b/);
  expect(CHOOSER_TOPICS.map((t) => t.id)).toContain("choose-already_grok");
  const topic = CHOOSER_TOPICS.find((t) => t.id === "choose-already_grok");
  expect(topic?.input.en).toContain("1 Nov 2026");
  expect(topic?.input.et).toContain("1.11.2026");

});

test("landing and /uhenda offer connect and /alusta as equal starts", async () => {
  const home = await (await get("/")).text();
  expect(home).toContain('href="/uhenda">Ühenda oma ChatGPT või Claude');
  expect(home).toContain('href="/alusta">Aita mul alustada');
  expect(home).toContain("Kasutan juba AI-assistenti");
  expect(home).toContain("AI-assistenti veel pole või ei tea, mida valida");
  expect(home).not.toContain('href="/vali"');
  const en = await (await get("/?lang=en")).text();
  expect(en).toContain("Help me get started");
  expect(en).toContain("Connect my ChatGPT or Claude");
  expect(en).toContain('href="/alusta?lang=en"');
  expect(en).toContain('href="/uhenda?lang=en"');
  expect(en).toContain("I already use an AI assistant");
  const uhenda = await (await get("/uhenda")).text();
  expect(uhenda).toContain('href="/alusta"');
  expect(uhenda).toContain("Aita mul alustada");
  expect(uhenda).not.toContain('href="/vali"');
  expect(uhenda).not.toContain("Aitame valida");
  const uhendaEn = await (await get("/uhenda?lang=en")).text();
  expect(uhendaEn).toContain('href="/alusta?lang=en"');
  expect(uhendaEn).toContain("Help me get started");
  expect(uhendaEn).toContain("No AI assistant yet, or not sure which");
});

test("a completed chooser card is not read: /vali only redirects and never calls the model", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vali-")), "ledger.db");
  const ledger = ModelQualityLedger.open(path);
  ledger.close();
  chmodSync(path, 0o600);
  const fetches = { n: 0 };
  const generate = vi.spyOn(PublicCards.prototype, "generate");
  const db = openDb(":memory:");
  const cfg: Config = {
    demo: false, production: false, dbPath: ":memory:", baseUrl: "http://127.0.0.1", modelMode: "public_cards", allowedHosts: ["127.0.0.1"],
    googleAllowedSubjects: ["synthetic-subject-a"], modelPricingConfirmed: true, basetenApiKey: "synthetic-key-not-real", modelLedgerPath: path,
    modelFetchFn: (async () => { fetches.n++; throw new Error("model fetch"); }) as FetchFn,
  };
  const { app } = createApp(cfg, db);
  const cardServer = await new Promise<Server>((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const cardBase = `http://127.0.0.1:${(cardServer.address() as { port: number }).port}`;
  cfg.baseUrl = cardBase;
  try {
    const res = await fetch(cardBase + "/vali", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/alusta");
    expect(fetches.n).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  } finally {
    generate.mockRestore();
    cardServer.closeAllConnections();
    await new Promise<void>((ok) => cardServer.close(ok));
    db.close();
  }
});
