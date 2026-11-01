import { describe, expect, test } from "vitest";
import { PLAN_NOTE, chooseAssistant, needsPaidNote, offerDownload, type Business, type Tier, type Uses } from "../src/assistant-choice.js";
import { loadCatalog, safeHttps } from "../src/catalog.js";
import {
  buildIntakePlan, fallbackExtract, intakeRateOk, liveIntake, matchCatalog, mockIntake, parseExtract, planModelInput,
  type IntakePlanArgs,
} from "../src/intake.js";
import { BASETEN_MODEL, MAX_INPUT_BYTES, MAX_INPUT_CHARS, ModelQualityLedger, type FetchFn } from "../src/model-quality.js";

const HOSTILE = "HOSTILE-FREE-TEXT-xyz";
const HOUR = 3_600_000;
const CODE = "10000062";
const byId = (id: string) => {
  const rec = loadCatalog().find((r) => r.id === id);
  if (!rec) throw new Error(id);
  return rec;
};
const werkzeug = byId("werkzeug");
const pipedrive = byId("pipedrive");
const lhv = byId("lhv-ai");
const swedbank = byId("swedbank");

const chat = (content: string) => new Response(JSON.stringify({
  model: BASETEN_MODEL,
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
}), { status: 200, headers: { "content-type": "application/json" } });

describe("catalogue match", () => {
  test("matchCatalog picks one record per name and returns the rest unmatched", () => {
    const { matched, unmatched } = matchCatalog(["Merit Aktiva", "SWEDBANK", "Gmail", "no-such-program-zz", ""]);
    expect(matched.map((r) => r.id)).toEqual(["merit-aktiva-api", "swedbank", "google-gmail-mcp"]);
    expect(unmatched).toEqual(["no-such-program-zz", ""]);
    expect(matchCatalog(["LHV"]).matched.map((r) => r.id)).toEqual(["lhv-ai"]);
    expect(matchCatalog(["Pipedrive"]).matched.map((r) => r.id)).toEqual(["pipedrive"]);
    expect(matchCatalog(["Werkzeug"]).matched[0]).toBe(werkzeug);
  });

  test("fallbackExtract finds catalogue names in free text and ignores the rest", () => {
    const hits = fallbackExtract("Kasutan Swedbanki ja Gmaili.");
    expect(hits.map((r) => r.id)).toEqual(expect.arrayContaining(["swedbank", "google-gmail-mcp"]));
    expect(fallbackExtract("Ainult Werkzeug.").map((r) => r.id)).toEqual(["werkzeug"]);
    expect(fallbackExtract("bank mail mcp").map((r) => r.id)).not.toContain("swedbank");
    expect(fallbackExtract("mitte midagi siin").map((r) => r.id)).not.toContain("werkzeug");
    expect(fallbackExtract("x".repeat(20)).length).toBeLessThanOrEqual(8);
  });
});

describe("parseExtract", () => {
  const ok = { products: [{ name: "Swedbank", kind: "bank" }, { name: "Gmail", kind: "email" }] };
  test("accepts the exact shape, including an empty list and a 60-character name", () => {
    expect(parseExtract(JSON.stringify(ok))).toEqual(ok);
    expect(parseExtract('{"products":[]}')).toEqual({ products: [] });
    const name = "ä".repeat(60);
    expect(parseExtract(JSON.stringify({ products: [{ name, kind: "other" }] }))).toEqual({ products: [{ name, kind: "other" }] });
    expect(parseExtract(JSON.stringify({ products: Array.from({ length: 8 }, (_, i) => ({ name: `n${i}`, kind: "customers" })) }))?.products).toHaveLength(8);
  });

  test("rejects each invalid variant", () => {
    const name = "Swedbank";
    const bad = [
      "not json",
      "",
      "```json\n" + JSON.stringify(ok) + "\n```",
      "[]",
      "null",
      JSON.stringify({ products: ok.products, extra: 1 }),
      JSON.stringify({ items: ok.products }),
      JSON.stringify({ products: "Swedbank" }),
      JSON.stringify({ products: [{ name, kind: "bank", extra: true }] }),
      JSON.stringify({ products: [{ name }] }),
      JSON.stringify({ products: [{ kind: "bank" }] }),
      JSON.stringify({ products: [{ name, kind: "tax" }] }),
      JSON.stringify({ products: [{ name: 1, kind: "bank" }] }),
      JSON.stringify({ products: [{ name: "", kind: "bank" }] }),
      JSON.stringify({ products: [{ name: "   ", kind: "bank" }] }),
      JSON.stringify({ products: [{ name: "a".repeat(61), kind: "other" }] }),
      JSON.stringify({ products: Array.from({ length: 9 }, () => ({ name, kind: "other" })) }),
      JSON.stringify({ products: [null] }),
      JSON.stringify({ products: ["Swedbank"] }),
    ];
    for (const raw of bad) expect(parseExtract(raw), raw).toBeNull();
  });
});

describe("buildIntakePlan", () => {
  const services = [werkzeug, pipedrive, lhv, swedbank];
  const obligations = [
    { title_et: "OBLIGATION-TITLE-LEAK", title_en: "OBLIGATION-TITLE-LEAK", effective_due: "2026-11-20" },
    { title_et: "Teine", title_en: "Second", effective_due: null },
  ];
  const company = {
    name: "Synthetic Register OÜ", registry_code: CODE,
    legal_form: HOSTILE, emtak_code: "74101", emtak_label: "EMTAK-LABEL-LEAK",
  };
  const paths: { uses: Uses; tier: Tier | null; business: Business | null; paid: boolean }[] = [
    { uses: "none", tier: null, business: null, paid: true },
    { uses: "claude", tier: "free", business: null, paid: true },
    { uses: "claude", tier: "paid", business: null, paid: true },
    { uses: "claude", tier: "unsure", business: null, paid: true },
    { uses: "chatgpt", tier: null, business: "yes", paid: false },
    { uses: "chatgpt", tier: null, business: "no", paid: true },
    { uses: "chatgpt", tier: null, business: "unsure", paid: true },
    { uses: "other", tier: null, business: null, paid: true },
  ];

  test("paid note, download and service links follow the rule, with and without a company", () => {
    for (const lang of ["et", "en"] as const) for (const withCompany of [true, false]) for (const path of paths) {
      const choice = chooseAssistant({ uses: path.uses, tier: path.tier ?? undefined, business: path.business ?? undefined });
      expect(choice, `${path.uses} ${path.tier} ${path.business}`).not.toBeNull();
      const plan = buildIntakePlan({
        company: withCompany ? company : undefined,
        obligations, services, unmatched: [HOSTILE],
        choice: choice!, uses: path.uses, tier: path.tier, business: path.business, lang,
      });
      const label = `${lang} ${path.uses} ${path.tier ?? "-"} ${path.business ?? "-"} company=${withCompany}`;
      expect(plan.paidNote, label).toBe(path.paid);
      expect(plan.assistant, label).toBe(choice!.assistant);
      expect(plan.reason.length, label).toBeGreaterThan(10);
      expect(plan.reasons.length, label).toBeGreaterThan(0);
      expect(plan.why.length, label).toBeGreaterThan(0);
      expect(plan.candidates.length, label).toBe(plan.why.length);
      expect(plan.why.every((w) => w.sources.length > 0 && w.cost.length > 0), label).toBe(true);
      if (lang === "et") expect(plan.reason, label).not.toMatch(/\b(MCP|API|connector)\b/);
      expect(plan.prompt, label).not.toContain(HOSTILE);
      expect(plan.prompt, label).not.toContain("EMTAK-LABEL-LEAK");
      expect(plan.prompt, label).not.toContain("OBLIGATION-TITLE-LEAK");
      expect(plan.prompt, label).not.toContain("http");
      for (const step of plan.steps) {
        expect(step.text, label).not.toContain(HOSTILE);
        expect(step.href ?? "", label).not.toContain(HOSTILE);
      }
      if (withCompany) {
        expect(plan.prompt, label).toContain("Synthetic Register OÜ");
        expect(plan.prompt, label).toContain(CODE);
      } else {
        expect(plan.prompt, label).not.toContain("Synthetic Register OÜ");
        expect(plan.prompt, label).not.toContain(CODE);
        expect(plan.prompt, label).not.toMatch(/Minu ettevõte|My company/);
      }
      expect(plan.prompt, label).toContain("Werkzeug");
      expect(plan.prompt, label).toContain(swedbank.name);
      if (path.paid) expect(plan.planNote, label).toBe(plan.reason);
      else expect(plan.planNote, label).toBeUndefined();
      const download = offerDownload(path.uses, choice!.assistant);
      if (download) expect(plan.steps[0], label).toEqual({ text: lang === "et" ? "Hangi see." : "Get it.", href: download });
      else expect(plan.steps.some((s) => s.href === "https://claude.ai/download" || s.href === "https://chatgpt.com/download"), label).toBe(false);
      const connectHref = lang === "en" ? `/uhenda?a=${choice!.assistant}&lang=en` : `/uhenda?a=${choice!.assistant}`;
      expect(plan.steps.some((s) => s.href === connectHref), label).toBe(true);
      const serviceHrefs = plan.steps.map((s) => s.href).filter((h) => h?.startsWith("https://") && !h.includes("claude.ai") && !h.includes("chatgpt.com"));
      expect(serviceHrefs, label).toEqual([safeHttps(werkzeug.connection), safeHttps(swedbank.connection)]);
      expect(serviceHrefs, label).not.toContain(safeHttps(lhv.connection));
      expect(plan.steps.some((s) => s.text.includes("Pipedrive")), label).toBe(false);
      expect(plan.steps.at(-1)?.text, label).toBe(lang === "et" ? "Kleebi see juhis oma assistenti." : "Paste this prompt into your assistant.");
      expect(plan.steps.some((s) => s.text === (lang === "et" ? "Loo konto." : "Sign up.")), label).toBe(true);
    }
  });

  test("a grok user is recommended a tested assistant that can hold the services", () => {
    const choice = chooseAssistant({ uses: "grok", tier: "paid" })!;
    const plan = buildIntakePlan({ choice, uses: "grok", tier: "paid", services, lang: "et" });
    expect(plan.paidNote).toBe(true);
    expect(plan.planNote).toBe(plan.reason);
    expect(plan.assistant).toBe("claude");
    expect(plan.candidates.some((r) => r.assistant === "claude" && r.plan === "pro")).toBe(true);
    expect(plan.steps.map((s) => s.href).filter(Boolean)).toEqual([
      "https://claude.ai/download", "/uhenda?a=claude", safeHttps(werkzeug.connection), safeHttps(swedbank.connection),
    ]);
  });

  test("the prompt drops the company sentence and the program sentence when either is missing", () => {
    const choice = chooseAssistant({ uses: "none" })!;
    const bare = buildIntakePlan({ choice, uses: "none", lang: "en" });
    expect(bare.prompt).toBe("Through AI Launchpad, see which deadlines I have coming up and what you need from me.");
    const named = buildIntakePlan({ company: { name: "Synthetic Register OÜ", registry_code: CODE }, choice, uses: "none", services: [werkzeug], lang: "et" });
    expect(named.prompt).toBe(`Minu ettevõte on Synthetic Register OÜ, registrikood ${CODE}. Kasutan: Werkzeug. Vaata AI-hüppelaua kaudu, mis tähtajad mul tulemas on ja mida sa minult vajad.`);
  });
});

describe("plan model input", () => {
  test("keeps at most three dated obligations and stays inside the ledger input bound", () => {
    const choice = chooseAssistant({ uses: "claude", tier: "free" })!;
    const args: IntakePlanArgs = {
      company: { name: "Synthetic Register OÜ", registry_code: CODE, legal_form: HOSTILE, emtak_label: "Disain" },
      obligations: [
        { title_et: "Esimene", title_en: "First", effective_due: "2026-11-10" },
        { title_et: "Teine", title_en: "Second", effective_due: null },
        { title_et: "Kolmas", title_en: "Third", effective_due: "2026-11-20" },
        { title_et: "Neljas", title_en: "Fourth", effective_due: "2026-12-10" },
        { title_et: "Viies", title_en: "Fifth", effective_due: "2026-12-20" },
      ],
      services: [werkzeug],
      unmatched: [HOSTILE, "a".repeat(80)],
      choice, uses: "claude", tier: "free", lang: "et",
    };
    const raw = planModelInput(args);
    const body = JSON.parse(raw) as { company_name: string; business_area: string; obligations: { title: string; effective_due: string }[]; services: string[]; unmatched: string[]; paid_note: boolean; assistant: string };
    expect(body.company_name).toBe("Synthetic Register OÜ");
    expect(body.business_area).toBe("Disain");
    expect(body.obligations.map((o) => o.title)).toEqual(["Esimene", "Kolmas", "Neljas"]);
    expect(body.services).toEqual(["Werkzeug"]);
    expect(body.unmatched).toEqual([HOSTILE, "a".repeat(60)]);
    expect(body.paid_note).toBe(true);
    expect(body.assistant).toBe("claude");
    expect(raw).not.toContain("legal_form");
    expect(raw.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(MAX_INPUT_BYTES);

    const huge = planModelInput({
      ...args,
      company: { name: "N".repeat(500), registry_code: CODE, emtak_label: "Ä".repeat(500) },
      obligations: Array.from({ length: 6 }, (_, i) => ({ title_et: "T".repeat(400), title_en: "T".repeat(400), effective_due: `2026-11-${10 + i}` })),
      services: loadCatalog().slice(0, 40),
      unmatched: Array.from({ length: 20 }, () => "U".repeat(80)),
    });
    expect(huge.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(new TextEncoder().encode(huge).byteLength).toBeLessThanOrEqual(MAX_INPUT_BYTES);
    const packed = JSON.parse(huge) as { obligations: unknown[]; services: unknown[]; unmatched?: unknown[] };
    expect(packed.obligations.length).toBeLessThanOrEqual(3);
    expect((packed.unmatched ?? []).length).toBeLessThanOrEqual(8);
  });
});

describe("intake clients and limiter", () => {
  test("the limiter allows 8 calls in an hour and then refuses", () => {
    const key = "intake-limit-key";
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 8; i++) expect(intakeRateOk(key, t0 + i)).toBe(true);
    expect(intakeRateOk(key, t0 + 8)).toBe(false);
    expect(intakeRateOk(key, t0 + HOUR - 1)).toBe(false);
    expect(intakeRateOk("intake-limit-other", t0)).toBe(true);
    expect(intakeRateOk(key, t0 + HOUR)).toBe(true);
  });

  test("mock extract and summarize are deterministic and labelled mock", async () => {
    const client = mockIntake();
    expect(client.mock).toBe(true);
    const a = await client.extract("Werkzeug");
    const b = await client.extract("Werkzeug");
    expect(a).toEqual(b);
    expect(a.mock).toBe(true);
    expect(a.ok).toBe(true);
    if (a.ok) {
      const parsed = parseExtract(a.output);
      expect(parsed?.products.some((p) => p.name === "Werkzeug" && p.kind === "accounting")).toBe(true);
    }
    const choice = chooseAssistant({ uses: "claude", tier: "free" })!;
    const paid = await client.summarize(planModelInput({ choice, uses: "claude", tier: "free", lang: "et" }));
    const freeOfNote = await client.summarize(planModelInput({ choice: chooseAssistant({ uses: "grok" })!, uses: "grok", lang: "en" }));
    expect(paid).toMatchObject({ ok: true, mock: true });
    expect(freeOfNote).toMatchObject({ ok: true, mock: true });
    if (paid.ok) expect(paid.output).toMatch(/mock/);
    if (paid.ok) expect(paid.output).not.toContain("Parim tulemus vajab tasulist AI paketti.");
    if (freeOfNote.ok) {
      expect(freeOfNote.output).toContain("local mock");
      expect(freeOfNote.output).not.toContain("paid AI plan");
    }
  });

  test("a failing fetch and a ledger refusal become ok:false and do not throw", async () => {
    const refused = ModelQualityLedger.open(":memory:", 0);
    let called = 0;
    const blocked = liveIntake({
      ledger: refused, apiKey: "synthetic-key-not-real",
      fetchFn: (() => { called++; return Promise.reject(new Error("should not fetch")); }) as FetchFn,
    });
    await expect(blocked.extract("Werkzeug")).resolves.toEqual({ ok: false, reason: "budget_exhausted", mock: false });
    expect(called).toBe(0);
    refused.close();

    const down = ModelQualityLedger.open(":memory:");
    const failing = liveIntake({
      ledger: down, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => new Response("no", { status: 503 })) as FetchFn,
    });
    await expect(failing.extract("Swedbank")).resolves.toMatchObject({ ok: false, mock: false, reason: "provider_failed" });
    const thrown = liveIntake({
      ledger: down, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => { throw new Error("network down"); }) as FetchFn,
    });
    await expect(thrown.summarize('{"lang":"et"}')).resolves.toMatchObject({ ok: false, mock: false });
    const timeoutLedger = ModelQualityLedger.open(":memory:");
    const timed = liveIntake({
      ledger: timeoutLedger, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }) as FetchFn,
    });
    await expect(timed.extract("Gmail")).resolves.toMatchObject({ ok: false, reason: "timeout", mock: false });
    timeoutLedger.close();
    down.close();

    const junk = ModelQualityLedger.open(":memory:");
    let fetches = 0;
    const live = liveIntake({
      ledger: junk, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => { fetches++; return chat("not-json"); }) as FetchFn,
    });
    await expect(live.extract("  Werkzeug   ")).resolves.toEqual({ ok: false, reason: "invalid_output", mock: false });
    const again = liveIntake({
      ledger: junk, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => { fetches++; return chat("not-json"); }) as FetchFn,
    });
    await expect(again.extract("Werkzeug")).resolves.toMatchObject({ ok: false, reason: "invalid_output" });
    expect(fetches).toBe(1);
    await expect(live.extract("   ")).resolves.toEqual({ ok: false, reason: "empty", mock: false });
    expect(fetches).toBe(1);

    const good = ModelQualityLedger.open(":memory:");
    const products = '{"products":[{"name":"Werkzeug","kind":"accounting"}]}';
    let n = 0;
    const okLive = liveIntake({
      ledger: good, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => { n++; return chat(products); }) as FetchFn,
    });
    const first = await okLive.extract("Werkzeug");
    const second = await okLive.extract("Werkzeug");
    expect(first).toEqual({ ok: true, output: products, mock: false });
    expect(second).toEqual(first);
    expect(n).toBe(1);
    const long = "x".repeat(601);
    const summary = liveIntake({
      ledger: good, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => chat(long)) as FetchFn,
    });
    await expect(summary.summarize('{"lang":"en","paid_note":false}')).resolves.toEqual({ ok: false, reason: "invalid_output", mock: false });
    const padded = `${" ".repeat(601)}Short bottom line.`;
    const paddedPlan = liveIntake({
      ledger: good, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => chat(padded)) as FetchFn,
    });
    const trimmed = await paddedPlan.summarize('{"lang":"en","paid_note":true}');
    expect(trimmed).toEqual({ ok: true, output: "Short bottom line.", mock: false });
    if (trimmed.ok) expect(trimmed.output).toHaveLength(18);
    const over = "y".repeat(601);
    const overPlan = liveIntake({
      ledger: good, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => chat(over)) as FetchFn,
    });
    await expect(overPlan.summarize('{"lang":"en","paid_note":false,"over":true}')).resolves.toEqual({ ok: false, reason: "invalid_output", mock: false });
    const short = liveIntake({
      ledger: good, apiKey: "synthetic-key-not-real",
      fetchFn: (async () => chat("Lühike kokkuvõte.")) as FetchFn,
    });
    await expect(short.summarize('{"lang":"et"}')).resolves.toMatchObject({ ok: true, output: "Lühike kokkuvõte.", mock: false });
    good.close();
    junk.close();
  });
});

describe("chooseAssistant claude tier", () => {
  test("a Claude tier is required and does not change the assistant", () => {
    expect(chooseAssistant({ uses: "claude" })).toBeNull();
    expect(chooseAssistant({ uses: "claude", tier: "maybe" })).toBeNull();
    for (const tier of ["free", "paid", "unsure"] as const) {
      expect(chooseAssistant({ uses: "claude", tier })).toEqual({ assistant: "claude", reason: "already_claude" });
    }
    expect(chooseAssistant({ uses: "grok", tier: "free" })).toEqual({ assistant: "grok", reason: "already_grok" });
    expect(needsPaidNote("none", null, null)).toBe(true);
    expect(needsPaidNote("other", null, null)).toBe(true);
    expect(needsPaidNote("claude", "free", null)).toBe(true);
    expect(needsPaidNote("claude", "unsure", null)).toBe(true);
    expect(needsPaidNote("claude", "paid", null)).toBe(false);
    expect(needsPaidNote("chatgpt", null, "no")).toBe(true);
    expect(needsPaidNote("chatgpt", null, "unsure")).toBe(true);
    expect(needsPaidNote("chatgpt", null, "yes")).toBe(false);
    expect(needsPaidNote("grok", "free", "no")).toBe(false);
    expect(PLAN_NOTE.source.et).toBe("Claude'i tasuta paketis on üks oma ühendus (kontrollitud 31.10.2026)");
    expect(PLAN_NOTE.source.en).toBe("Claude's free plan has one custom connector (checked 31 Oct 2026)");
    expect(`${PLAN_NOTE.text.et} ${PLAN_NOTE.connect.et} ${PLAN_NOTE.source.et}`).not.toMatch(/\b(MCP|API|connector)\b/);
    expect(`${PLAN_NOTE.text.et} ${PLAN_NOTE.text.en}`).not.toMatch(/€|\$/);
  });
});
