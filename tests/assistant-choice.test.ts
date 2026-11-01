import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { Server } from "node:http";
import { chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type Config } from "../src/app.js";
import { PLAN_NOTE, REASONS, chooseAssistant, offerDownload, parseBusiness, parseUses } from "../src/assistant-choice.js";
import { openDb } from "../src/db.js";
import { CHOOSER_TOPICS, FRICTION_TOPICS, PublicCards, openExistingPublicLedger, publicCardRequestId } from "../src/model-public-cards.js";
import { main as batchMain, parseArgs as parseBatchArgs } from "../src/model-public-cards-cli.js";
import { ModelQualityLedger, payloadHash, reservationMicroUsd, type FetchFn } from "../src/model-quality.js";

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

test("/vali asks one question at a time, in Estonian and English, and sets no cookie", async () => {
  const et = await get("/vali");
  expect(et.status).toBe(200);
  expect(et.headers.get("set-cookie")).toBeNull();
  const etHtml = await et.text();
  expect(etHtml).toContain("Kas sa juba kasutad AI-assistenti?");
  expect(etHtml).toContain('href="/vali?uses=chatgpt"');
  expect(etHtml).toContain('href="/vali?uses=claude"');
  expect(etHtml).toContain('href="/vali?uses=other"');
  expect(etHtml).toContain("Mõni teine (Gemini, Copilot, Meta AI …)");
  expect(etHtml).toContain('href="/vali?uses=none"');
  expect(etHtml).not.toContain("Kas sinu ettevõte maksab");
  expect(etHtml).not.toContain("Muse Spark");
  const en = await get("/vali?lang=en");
  expect(en.headers.get("set-cookie")).toBeNull();
  const enHtml = await en.text();
  expect(enHtml).toContain("Do you already use an AI assistant?");
  expect(enHtml).toContain('href="/vali?uses=chatgpt&amp;lang=en"');
  expect(enHtml).toContain("Another one (Gemini, Copilot, Meta AI …)");
  expect(enHtml).toContain('lang="en"');
  const step2 = await get("/vali?uses=chatgpt");
  expect(step2.headers.get("set-cookie")).toBeNull();
  const step2Html = await step2.text();
  expect(step2Html).toContain("Kas sinu ettevõte maksab ChatGPT Businessi eest?");
  expect(step2Html).toContain('href="/vali?uses=chatgpt&amp;business=yes"');
  expect(step2Html).toContain('href="/vali?uses=chatgpt&amp;business=no"');
  expect(step2Html).toContain('href="/vali?uses=chatgpt&amp;business=unsure"');
  expect(step2Html).toContain("Pole kindel");
  expect(step2Html).not.toContain("Kasuta Claude");
  expect(step2Html).not.toContain("claude.ai/download");
  const step2En = await (await get("/vali?uses=chatgpt&lang=en")).text();
  expect(step2En).toContain("Does your company pay for ChatGPT Business?");
  expect(step2En).toContain("Not sure");
  expect(step2En).toContain('href="/vali?uses=chatgpt&amp;business=yes&amp;lang=en"');
  const home = await get("/?lang=en");
  expect(home.headers.get("set-cookie") ?? "").toContain("lang=en");
});

test("/vali result screens name one assistant, the next step, and a download only when they need it", async () => {
  const cases = [
    { q: "uses=claude", h1: "Kasuta Claude&#39;i", connect: "/uhenda?a=claude", download: null, reason: "Sa juba kasutad Claude&#39;i" },
    { q: "uses=chatgpt&business=yes", h1: "Kasuta ChatGPT-d", connect: "/uhenda?a=chatgpt", download: null, reason: "Sinu ettevõte maksab ChatGPT Businessi eest" },
    { q: "uses=chatgpt&business=no", h1: "Kasuta Claude&#39;i", connect: "/uhenda?a=claude", download: "https://claude.ai/download", reason: "ChatGPT võid teiste asjade jaoks alles jätta" },
    { q: "uses=chatgpt&business=unsure", h1: "Kasuta Claude&#39;i", connect: "/uhenda?a=claude", download: "https://claude.ai/download", reason: "kinnitused vajavad ChatGPT Businessi" },
    { q: "uses=other", h1: "Kasuta Claude&#39;i", connect: "/uhenda?a=claude", download: "https://claude.ai/download", reason: "Teisi assistente ei ole AI-hüppelauaga proovitud" },
    { q: "uses=none", h1: "Kasuta Claude&#39;i", connect: "/uhenda?a=claude", download: "https://claude.ai/download", reason: "Alusta Claude&#39;iga" },
  ] as const;
  for (const c of cases) {
    const res = await get(`/vali?${c.q}`);
    expect(res.headers.get("set-cookie")).toBeNull();
    const html = await res.text();
    expect(html).toContain(`<h1>${c.h1}</h1>`);
    expect(html).toContain(c.reason);
    expect(html).toContain(`href="${c.connect}"`);
    expect(html).toContain("Ühenda see AI-hüppelauaga");
    expect(html).toContain('href="/vali"');
    expect(html).toContain("Alusta uuesti");
    expect(html).not.toContain("Muse Spark");
    if (c.download) expect(html).toContain(`href="${c.download}"`);
    else expect(html).not.toContain("claude.ai/download");
    if (c.download) expect(html).toContain("Hangi see");
    else expect(html).not.toContain("Hangi see");
    expect(html).not.toMatch(/\b(MCP|connector|API|OAuth|IBAN)\b/);
  }
  const en = await (await get("/vali?uses=none&lang=en")).text();
  expect(en).toContain("<h1>Use Claude</h1>");
  expect(en).toContain("Start with Claude");
  expect(en).toContain("30 Oct 2026");
  expect(en).toContain('href="/uhenda?a=claude&amp;lang=en"');
  expect(en).toContain("Connect it to AI Launchpad");
  expect(en).toContain('href="https://claude.ai/download"');
  expect(en).toContain("Get it");
  expect(en).toContain('href="/vali?lang=en"');
  expect(en).toContain("Start over");
  const enBiz = await (await get("/vali?uses=chatgpt&business=yes&lang=en")).text();
  expect(enBiz).toContain("<h1>Use ChatGPT</h1>");
  expect(enBiz).toContain("Your company pays for ChatGPT Business");
  expect(enBiz).toContain('href="/uhenda?a=chatgpt&amp;lang=en"');
  expect(enBiz).not.toContain("chatgpt.com/download");
  expect(enBiz).not.toContain("Get it");
  const enNo = await (await get("/vali?uses=chatgpt&business=no&lang=en")).text();
  expect(enNo).toContain("You can keep ChatGPT for other things");
  expect(enNo).toContain('href="https://claude.ai/download"');
  expect(enNo).not.toContain("chatgpt.com/download");
  const enOther = await (await get("/vali?uses=other&lang=en")).text();
  expect(enOther).toContain("Other assistants are not tested with AI Launchpad");
  const enHave = await (await get("/vali?uses=claude&lang=en")).text();
  expect(enHave).toContain("You already use Claude");
  expect(enHave).not.toContain("claude.ai/download");
  const enUnsure = await (await get("/vali?uses=chatgpt&business=unsure&lang=en")).text();
  expect(enUnsure).toContain("Claude&#39;s free plan does approvals");
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

  const step1 = await (await get("/vali")).text();
  expect(step1).toContain('href="/vali?uses=grok"');
  expect(step1).toContain(">Grok</a>");
  const et = await (await get("/vali?uses=grok")).text();
  expect(et).toContain("<h1>Kasuta Grok Boti</h1>");
  expect(et).toContain("Sa juba kasutad Groki. Jää selle juurde.");
  expect(et).toContain("Allikas: Grok Botis on kinnitused proovitud 1.11.2026.");
  expect(et).toContain('href="/uhenda?a=grok"');
  expect(et).not.toContain("Hangi see");
  expect(et).not.toContain("claude.ai");
  expect(et).not.toContain("chatgpt.com");
  expect(et).not.toContain("Cursor");
  const en = await (await get("/vali?uses=grok&lang=en")).text();
  expect(en).toContain("<h1>Use Grok Bot</h1>");
  expect(en).toContain("You already use Grok. Stay with it.");
  expect(en).toContain("Source: approvals were tested on Grok Bot, 1 Nov 2026.");
  expect(en).toContain('href="/uhenda?a=grok&amp;lang=en"');
  expect(en).not.toContain("Get it");
  const none = await (await get("/vali?uses=none")).text();
  expect(none).toContain("<h1>Kasuta Claude&#39;i</h1>");
  expect(none).toContain("Alusta Claude&#39;iga");
  const unsure = await (await get("/vali?uses=chatgpt&business=unsure")).text();
  expect(unsure).toContain("<h1>Kasuta Claude&#39;i</h1>");
  expect(unsure).toContain("kinnitused vajavad ChatGPT Businessi");
});

test("unknown /vali query values fall back to step 1 and are not echoed", async () => {
  for (const q of ["uses=zz-secret-token", "uses=%3Cscript%3E", "business=yes"]) {
    const html = await (await get(`/vali?${q}`)).text();
    expect(html).toContain("Kas sa juba kasutad AI-assistenti?");
    expect(html).not.toContain("zz-secret-token");
    expect(html).not.toContain("zz-bad-biz");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Kasuta Claude");
  }
  const badBiz = await (await get("/vali?uses=chatgpt&business=zz-bad-biz")).text();
  expect(badBiz).toContain("Kas sinu ettevõte maksab ChatGPT Businessi eest?");
  expect(badBiz).not.toContain("zz-bad-biz");
  expect(badBiz).not.toContain("Kasuta Claude");
  const extra = await (await get("/vali?uses=claude&business=zz-secret-token")).text();
  expect(extra).toContain("Kasuta Claude&#39;i");
  expect(extra).not.toContain("zz-secret-token");
  const authed = await get("/vali", "lp_session=not-a-session");
  expect(authed.status).toBe(200);
  expect(authed.headers.get("set-cookie")).toBeNull();
  expect(await authed.text()).toContain("Kas sa juba kasutad AI-assistenti?");
});

test("an empty or invalid ChatGPT business answer re-asks that question and sets no cookie", async () => {
  for (const path of ["/vali?uses=chatgpt&business=", "/vali?uses=chatgpt&business=foo"]) {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    const html = await res.text();
    expect(html).toContain("Kas sinu ettevõte maksab ChatGPT Businessi eest?");
    expect(html).toContain('href="/vali?uses=chatgpt&amp;business=yes"');
    // Shell class names contain "foot" (footer, ticket-foot). The rejected answer "foo" must not be echoed.
    expect(html.replaceAll("foot", "")).not.toContain("foo");
    expect(html).not.toContain("business=foo");
    expect(html).not.toContain("Kas sa juba kasutad AI-assistenti?");
  }
});

test("landing and /uhenda link everyone to /vali", async () => {
  expect(await (await get("/")).text()).toContain('href="/vali"');
  expect(await (await get("/?lang=en")).text()).toContain("No AI assistant yet? Help me choose");
  const uhenda = await (await get("/uhenda")).text();
  expect(uhenda).toContain('href="/vali"');
  expect(uhenda).toContain("Pole veel AI-assistenti? Aita mul valida");
  expect(uhenda).not.toContain("Aitame valida");
  const uhendaEn = await (await get("/uhenda?lang=en")).text();
  expect(uhendaEn).toContain('href="/vali"');
  expect(uhendaEn).toContain("No AI assistant yet? Help me choose");
});

test("a completed chooser card is shown escaped; anything else adds nothing and never calls the model", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "vali-")), "ledger.db");
  const ledger = ModelQualityLedger.open(path);
  const seed = (id: string, locale: "et" | "en", status: "completed" | "failed", output: string) => {
    const topic = CHOOSER_TOPICS.find((t) => t.id === id)!;
    ledger.reserve(publicCardRequestId(topic, locale), topic.job, payloadHash(topic.job, topic.input[locale]), reservationMicroUsd(topic.job, topic.input[locale]));
    ledger.finalize(publicCardRequestId(topic, locale), { status, output, input_tokens: 1, output_tokens: 1, actual_cost_micro_usd: 1 });
  };
  seed("choose-none", "et", "completed", `Hello <img src=x onerror=alert(1)> & "go"`);
  seed("choose-already_claude", "et", "failed", "SHOULD_NOT_SHOW");
  ledger.close();
  chmodSync(path, 0o600);
  const rows = () => { const l = openExistingPublicLedger(path); try { return (l.db.prepare("SELECT COUNT(*) n FROM mq_attempts").get() as { n: number }).n; } finally { l.close(); } };
  expect(rows()).toBe(2);
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
  const read = (q: string) => fetch(cardBase + q).then((r) => r.text());
  try {
    const shown = await read("/vali?uses=none");
    expect(shown).toContain("Selgitab Muse Spark (Meta) · salvestatud vastus");
    expect(shown).toContain("Hello &lt;img src=x onerror=alert(1)&gt; &amp; &quot;go&quot;");
    expect(shown).not.toContain("<img");
    expect(shown).toContain("Alusta Claude&#39;iga");
    const failed = await read("/vali?uses=claude");
    expect(failed).not.toContain("SHOULD_NOT_SHOW");
    expect(failed).not.toContain("Muse Spark");
    expect(failed).toContain("Sa juba kasutad Claude&#39;i");
    const absent = await read("/vali?uses=other");
    expect(absent).not.toContain("Muse Spark");
    expect(absent).toContain("Teisi assistente ei ole AI-hüppelauaga proovitud");
    const english = await read("/vali?uses=none&lang=en");
    expect(english).not.toContain("Muse Spark");
    expect(english).not.toContain("alert(1)");
    expect(english).toContain("Use Claude");
    expect(fetches.n).toBe(0);
    expect(generate).not.toHaveBeenCalled();
    expect(rows()).toBe(2);
  } finally {
    generate.mockRestore();
    cardServer.closeAllConnections();
    await new Promise<void>((ok) => cardServer.close(ok));
    db.close();
  }
});
