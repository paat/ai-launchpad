import { describe, expect, test } from "vitest";
import {
  PLANS, customerFromServices, monthlyCost, recommendAssistant, whyRows,
  type Customer, type PlanRow,
} from "../src/assistant-plans.js";
import { matchCatalog } from "../src/intake.js";

const row = (assistant: string, plan: string): PlanRow => {
  const found = PLANS.find((p) => p.assistant === assistant && p.plan === plan);
  if (!found) throw new Error(`${assistant}/${plan}`);
  return found;
};

const base = (over: Partial<Customer> = {}): Customer => ({
  customConnectorsNeeded: 1, emailSuite: "unknown", seats: 1, ...over,
});

const clone = (plan: PlanRow, patch: Partial<PlanRow>): PlanRow => ({
  ...plan,
  ...patch,
  builtin_google: patch.builtin_google ?? plan.builtin_google,
  builtin_microsoft: patch.builtin_microsoft ?? plan.builtin_microsoft,
  sources: patch.sources ?? plan.sources,
  price: patch.price === undefined ? plan.price : patch.price,
});

describe("fact sheet", () => {
  test("every plan has a source and the check date, and unknown prices stay null", () => {
    expect(PLANS).toHaveLength(22);
    const keys = new Set<string>();
    for (const plan of PLANS) {
      const key = `${plan.assistant}/${plan.plan}`;
      expect(keys.has(key), key).toBe(false);
      keys.add(key);
      expect(plan.sources.length, key).toBeGreaterThanOrEqual(1);
      expect(plan.checked, key).toBe("2026-11-01");
      for (const source of plan.sources) {
        expect(source.n, key).toBeGreaterThan(0);
        expect(source.url, key).toMatch(/^https:\/\//);
      }
    }
    expect(row("claude", "free")).toMatchObject({
      price: { amount: 0, currency: "USD", tax: "excluded", per: "month", min_seats: 1 },
      custom_connectors: 1, write_tools: true, phone: true, launchpad_tested: "2026-10-30",
    });
    expect(row("claude", "pro").price).toEqual({ amount: 20, currency: "USD", tax: "excluded", per: "month", min_seats: 1 });
    expect(row("claude", "max").price?.amount).toBe(100);
    expect(row("claude", "team").price).toEqual({ amount: 25, currency: "USD", tax: "excluded", per: "seat_month", min_seats: 2 });
    expect(row("chatgpt", "go").price).toEqual({ amount: 8, currency: "USD", tax: "excluded", per: "month", min_seats: 1 });
    expect(row("chatgpt", "plus")).toMatchObject({ custom_connectors: null, write_tools: false, price: { amount: 20, currency: "USD" } });
    expect(row("chatgpt", "pro").price).toBeNull();
    expect(row("chatgpt", "pro").write_tools).toBe(false);
    expect(row("chatgpt", "business").price).toEqual({ amount: 25, currency: "USD", tax: "excluded", per: "seat_month", min_seats: 2 });
    expect(row("gemini", "ai_pro").price).toEqual({ amount: 21.99, currency: "EUR", tax: "unknown", per: "month", min_seats: 1 });
    expect(row("google", "workspace").price).toEqual({ amount: 16.2, currency: "EUR", tax: "unknown", per: "seat_month", min_seats: 1 });
    expect(row("copilot", "m365_business").price).toEqual({
      amount: 18.2, currency: "EUR", tax: "excluded", per: "seat_month", min_seats: 1,
      billed: "yearly", requires_plan: "Microsoft 365",
    });
    expect(row("copilot", "pro").price).toBeNull();
    expect(row("copilot", "pro").custom_connectors).toBeNull();
    expect(row("claude", "free").trains_by_default).toBeNull();
    expect(row("google", "workspace").write_tools).toBeNull();
    expect(row("google", "workspace").phone).toBeNull();
    for (const plan of PLANS) {
      if (plan.assistant === "claude" && plan.plan === "free") continue;
      if (plan.assistant === "grok" && plan.plan === "premium") {
        expect(plan.launchpad_tested).toBe("2026-11-01");
        continue;
      }
      expect(plan.launchpad_tested, `${plan.assistant}/${plan.plan}`).toBeNull();
    }
    const grokBuiltins = { builtin_google: ["Gmail", "Calendar", "Drive"], builtin_microsoft: ["Outlook", "OneDrive", "Teams", "SharePoint"] };
    for (const plan of ["free", "plus", "premium", "super", "ultra", "teams"]) {
      const grok = row("grok", plan);
      expect(grok.sources.length, plan).toBeGreaterThanOrEqual(1);
      expect(grok.checked, plan).toBe("2026-11-01");
      expect(grok.custom_connectors, plan).toBe("no_cap");
      expect(grok, plan).toMatchObject(grokBuiltins);
    }
    expect(row("grok", "free")).toMatchObject({ price: { amount: 0, currency: "USD", tax: "excluded", per: "month", min_seats: 1 }, write_tools: null, phone: true });
    expect(row("grok", "plus")).toMatchObject({ price: { amount: 8, currency: "USD", tax: "excluded", per: "month", min_seats: 1 }, write_tools: null });
    expect(row("grok", "premium")).toMatchObject({ price: { amount: 30, currency: "USD", tax: "excluded", per: "month", min_seats: 1 }, write_tools: true, phone: true, admin_needed: false });
    expect(row("grok", "super").price).toEqual({ amount: 100, currency: "USD", tax: "excluded", per: "month", min_seats: 1 });
    expect(row("grok", "ultra").price).toEqual({ amount: 200, currency: "USD", tax: "excluded", per: "month", min_seats: 1 });
    expect(row("grok", "super")).toMatchObject({ write_tools: true, phone: true, launchpad_tested: null });
    expect(row("grok", "ultra")).toMatchObject({ write_tools: true, phone: true, launchpad_tested: null });
    expect(row("grok", "teams")).toMatchObject({
      price: { amount: 30, currency: "USD", tax: "excluded", per: "seat_month", min_seats: null },
      write_tools: null, admin_needed: true, trains_by_default: false, launchpad_tested: null,
    });
    expect(PLANS.some((plan) => plan.assistant === "grok" && /supergrok|heavy|basic|premium_plus/.test(plan.plan))).toBe(false);
  });
});

describe("recommendAssistant", () => {
  test("none and no extra service recommends Claude Free", () => {
    const rec = recommendAssistant(base());
    expect(rec.recommended).toBe(row("claude", "free"));
    expect(rec.keep).toBeUndefined();
    expect(rec.start).toBeUndefined();
    expect(rec.stayAlternative).toBeUndefined();
    expect(rec.paidNote).toBe(false);
  });

  test("none and Merit recommends Claude Pro, with Claude Free as the start", () => {
    const rec = recommendAssistant(base({ customConnectorsNeeded: 2, connectionNames: ["Merit"] }));
    expect(rec.recommended).toBe(row("claude", "pro"));
    expect(rec.start).toBe(row("claude", "free"));
    expect(rec.paidNote).toBe(true);
    expect(rec.keep).toBeUndefined();
    expect(rec.reasons.map((r) => r.text_et).join(" ")).toContain(
      "Claude'i tasuta paketis on üks oma ühendus; sul on vaja 2 (AI-hüppelaud ja Merit).",
    );
  });

  test("ChatGPT Plus and Merit recommends Claude Pro and shows ChatGPT Business", () => {
    const rec = recommendAssistant(base({
      current: { assistant: "chatgpt", plan: "plus" },
      customConnectorsNeeded: 2,
      connectionNames: ["Merit"],
    }));
    expect(rec.recommended).toBe(row("claude", "pro"));
    expect(rec.stayAlternative).toBe(row("chatgpt", "business"));
    expect(rec.start).toBe(row("claude", "free"));
    expect(rec.paidNote).toBe(true);
    expect(rec.keep).toBeUndefined();
    const stay = rec.reasons.find((r) => r.text_et.includes("ChatGPT Business"));
    expect(stay?.text_et).toMatch(/vähemalt 2 kasutajat/);
    expect(stay?.text_et).toMatch(/haldur/);
    expect(stay?.text_et).toMatch(/veebis/);
    expect(stay?.text_et).toMatch(/50 dollarit/);
    expect(stay?.sources).toEqual(expect.arrayContaining([10, 11]));
  });

  test("ChatGPT Business and Claude Pro are kept when they fit", () => {
    const business = recommendAssistant(base({ current: { assistant: "chatgpt", plan: "business" } }));
    expect(business.keep).toBe(row("chatgpt", "business"));
    expect(business.recommended).toBe(row("chatgpt", "business"));
    expect(business.stayAlternative).toBeUndefined();
    expect(business.paidNote).toBe(false);
    const pro = recommendAssistant(base({ current: { assistant: "claude", plan: "pro" } }));
    expect(pro.keep).toBe(row("claude", "pro"));
    expect(pro.recommended).toBe(row("claude", "pro"));
    expect(pro.paidNote).toBe(false);
    expect(pro.stayAlternative).toBeUndefined();
  });

  test("Gemini, Copilot and Meta AI current recommend Claude, Free or Pro by need", () => {
    for (const current of [
      { assistant: "gemini", plan: "free" },
      { assistant: "gemini", plan: "ai_pro" },
      { assistant: "copilot", plan: "free" },
      { assistant: "meta", plan: "free" },
    ]) {
      const one = recommendAssistant(base({ current }));
      expect(one.recommended, current.assistant).toBe(row("claude", "free"));
      expect(one.keep, current.assistant).toBeUndefined();
      const two = recommendAssistant(base({ current, customConnectorsNeeded: 2 }));
      expect(two.recommended, current.assistant).toMatchObject({ assistant: "claude", plan: "pro" });
      expect(two.start?.plan, current.assistant).toBe("free");
      expect(two.paidNote, current.assistant).toBe(true);
    }
  });

  test("null or zero own connections, or unknown write tools, never make a plan eligible", () => {
    const good = row("claude", "free");
    const sheet = [
      clone(good, { plan: "no-slots", custom_connectors: null }),
      clone(good, { plan: "zero", custom_connectors: 0 }),
      clone(good, { plan: "no-write", write_tools: null }),
      good,
    ];
    expect(recommendAssistant(base(), sheet).recommended).toBe(good);
  });

  test("a plan we have not run is not recommended unless it is the current plan", () => {
    const fresh = recommendAssistant(base({ customConnectorsNeeded: 2 }));
    expect(fresh.recommended.launchpad_tested).toBeNull();
    expect(fresh.recommended.assistant).toBe("claude");
    expect(row("chatgpt", "business").launchpad_tested).toBeNull();
    expect(fresh.recommended).not.toBe(row("chatgpt", "business"));
    expect(fresh.stayAlternative).toBeUndefined();
    const onBusiness = recommendAssistant(base({ current: { assistant: "chatgpt", plan: "business" }, customConnectorsNeeded: 2 }));
    expect(onBusiness.recommended).toBe(row("chatgpt", "business"));
    for (const plan of PLANS) {
      if (plan.launchpad_tested || plan.assistant === "claude") continue;
      const offered = recommendAssistant(base({ customConnectorsNeeded: 1 }));
      expect(offered.recommended, plan.plan).not.toBe(plan);
    }
  });

  test("one seat on a two-seat plan costs twice the published price", () => {
    expect(monthlyCost(row("claude", "team"), 1)).toBe(50);
    expect(monthlyCost(row("chatgpt", "business"), 1)).toBe(50);
    expect(monthlyCost(row("chatgpt", "business"), 3)).toBe(75);
    expect(monthlyCost(row("claude", "pro"), 1)).toBe(20);
    expect(monthlyCost(row("chatgpt", "pro"), 1)).toBeNull();
  });

  test("prices in different currencies are not compared", () => {
    const usd = clone(row("claude", "pro"), {
      launchpad_tested: "2026-10-30",
      price: { amount: 100, currency: "USD", tax: "excluded", per: "month", min_seats: 1 },
    });
    const eur = clone(row("gemini", "ai_pro"), {
      custom_connectors: "no_cap",
      write_tools: true,
      launchpad_tested: "2026-10-30",
      builtin_google: ["Gmail"],
      builtin_microsoft: ["Outlook"],
      price: { amount: 1, currency: "EUR", tax: "unknown", per: "month", min_seats: 1 },
    });
    expect(monthlyCost(eur, 1)! < monthlyCost(usd, 1)!).toBe(true);
    expect(recommendAssistant(base(), [usd, eur]).recommended).toBe(usd);
    expect(recommendAssistant(base(), [eur, usd]).recommended).toBe(eur);
  });

  test("e-mail suite uses the built-in list, and other or unknown does not block", () => {
    const bare = clone(row("claude", "free"), { plan: "bare", builtin_google: [], builtin_microsoft: [] });
    const gmail = clone(row("claude", "free"), { plan: "gmail", builtin_google: ["Gmail"], builtin_microsoft: [] });
    expect(recommendAssistant(base({ emailSuite: "google" }), [bare, gmail]).recommended).toBe(gmail);
    expect(recommendAssistant(base({ emailSuite: "other" }), [bare]).recommended).toBe(bare);
    expect(recommendAssistant(base({ emailSuite: "unknown" }), [bare]).recommended).toBe(bare);
    expect(recommendAssistant(base({ emailSuite: "microsoft" })).recommended.builtin_microsoft.length).toBeGreaterThan(0);
  });

  test("reason sentences stay in plain words and cite a source", () => {
    const cases = [
      base(),
      base({ customConnectorsNeeded: 2, connectionNames: ["Merit"] }),
      base({ current: { assistant: "chatgpt", plan: "plus" }, customConnectorsNeeded: 2 }),
      base({ current: { assistant: "chatgpt", plan: "business" } }),
      base({ current: { assistant: "claude", plan: "pro" } }),
      base({ emailSuite: "google" }),
    ];
    for (const customer of cases) {
      for (const reason of recommendAssistant(customer).reasons) {
        expect(reason.text_et.length).toBeGreaterThan(0);
        expect(reason.text_en.length).toBeGreaterThan(0);
        expect(reason.sources.length).toBeGreaterThan(0);
        expect(reason.text_et).not.toMatch(/MCP|\bAPI\b|connector/i);
        expect(reason.text_en).not.toMatch(/\b(MCP|API|connector)\b/);
        expect(`${reason.text_et} ${reason.text_en}`).not.toMatch(/AI-hüppelaud maksab|Launchpad costs|Launchpad price/i);
      }
    }
  });

  test("current Grok Free or Plus with no extra service recommends Claude Free and Grok Premium to stay", () => {
    for (const plan of ["free", "plus"]) {
      const rec = recommendAssistant(base({ current: { assistant: "grok", plan } }));
      expect(rec.recommended, plan).toBe(row("claude", "free"));
      expect(rec.stayAlternative, plan).toBe(row("grok", "premium"));
      expect(rec.keep, plan).toBeUndefined();
    }
  });

  test("current Grok Premium is kept", () => {
    const rec = recommendAssistant(base({ current: { assistant: "grok", plan: "premium" } }));
    expect(rec.keep).toBe(row("grok", "premium"));
    expect(rec.recommended).toBe(row("grok", "premium"));
    expect(rec.stayAlternative).toBeUndefined();
    expect(rec.paidNote).toBe(false);
  });

  test("none and Merit still recommends Claude Pro, cheaper than Grok Premium in the same currency", () => {
    const rec = recommendAssistant(base({ customConnectorsNeeded: 2, connectionNames: ["Merit"] }));
    expect(rec.recommended).toBe(row("claude", "pro"));
    expect(row("claude", "pro").price?.currency).toBe("USD");
    expect(row("grok", "premium").price?.currency).toBe("USD");
    expect(monthlyCost(row("claude", "pro"), 1)).toBe(20);
    expect(monthlyCost(row("grok", "premium"), 1)).toBe(30);
  });

  test("Merit from the catalogue needs a second own connection and Gmail does not", () => {
    const merit = customerFromServices(matchCatalog(["Merit Aktiva"]).matched);
    expect(merit.customConnectorsNeeded).toBe(2);
    expect(merit.connectionNames).toEqual(["Merit"]);
    expect(recommendAssistant(merit).recommended).toBe(row("claude", "pro"));
    const gmail = customerFromServices(matchCatalog(["Gmail"]).matched);
    expect(gmail.customConnectorsNeeded).toBe(1);
    expect(gmail.emailSuite).toBe("google");
    expect(recommendAssistant(gmail).recommended).toBe(row("claude", "free"));
  });

  test("memo UNKNOWN fields stay null and are not stored as a conservative default", () => {
    expect(row("chatgpt", "plus").custom_connectors).toBeNull();
    expect(row("google", "workspace").custom_connectors).toBeNull();
    expect(row("copilot", "m365_business").phone).toBeNull();
    expect(row("copilot", "m365_business").trains_by_default).toBeNull();
    expect(row("grok", "teams").price?.min_seats).toBeNull();
    expect(monthlyCost(row("grok", "teams"), 1)).toBe(30);
    expect(monthlyCost(row("grok", "teams"), 4)).toBe(120);
    const teams = whyRows([row("grok", "teams")], "en")[0]!;
    expect(teams.cost).toContain("min seats unknown");
    expect(teams.cost).not.toMatch(/at least 1/);
    expect(whyRows([row("grok", "teams")], "et")[0]!.cost).toContain("minimaalne kasutajate arv on teadmata");
  });

  test("Copilot Business price states yearly billing and the Microsoft 365 requirement", () => {
    const rec = recommendAssistant(base({ current: { assistant: "copilot", plan: "free" } }));
    expect(rec.stayAlternative).toBe(row("copilot", "m365_business"));
    const stay = rec.reasons.find((r) => r.text_en.includes("Microsoft 365 Copilot Business"));
    expect(stay?.text_en).toMatch(/billed yearly/);
    expect(stay?.text_en).toMatch(/requires an eligible Microsoft 365 plan/);
    expect(stay?.text_en).not.toMatch(/web only/);
    expect(stay?.text_et).toMatch(/tasutakse kord aastas/);
    expect(stay?.text_et).toMatch(/vajab sobivat Microsoft 365 paketti/);
    expect(stay?.text_et).not.toMatch(/ainult veebis/);
    const en = whyRows([row("copilot", "m365_business")], "en")[0]!;
    const et = whyRows([row("copilot", "m365_business")], "et")[0]!;
    expect(en.cost).toContain("billed yearly");
    expect(en.cost).toContain("requires an eligible Microsoft 365 plan");
    expect(en.phone).toBe("unknown");
    expect(et.cost).toContain("tasutakse kord aastas");
    expect(et.cost).toContain("vajab sobivat Microsoft 365 paketti");
    expect(et.phone).toBe("teadmata");
  });

  test("no published connector cap is not rendered as no limit", () => {
    const kept = recommendAssistant(base({ current: { assistant: "grok", plan: "premium" } }));
    const en = kept.reasons.map((r) => r.text_en).join(" ");
    const et = kept.reasons.map((r) => r.text_et).join(" ");
    expect(en).toContain("no published limit");
    expect(et).toContain("piirangut pole avaldatud");
    expect(en.replaceAll("no published limit", "")).not.toContain("no limit");
    expect(et.replaceAll("piirangut pole avaldatud", "")).not.toContain("piiranguta");
    expect(whyRows([row("grok", "premium")], "en")[0]!.connections).toBe("no published limit");
    expect(whyRows([row("claude", "pro")], "et")[0]!.connections).toBe("piirangut pole avaldatud");
    for (const plan of PLANS) {
      expect(whyRows([plan], "en")[0]!.connections).not.toBe("no limit");
      expect(whyRows([plan], "et")[0]!.connections).not.toBe("piiranguta");
    }
  });

  test("an untested plan allowed by a tested sibling says so", () => {
    const rec = recommendAssistant(base({ customConnectorsNeeded: 2, connectionNames: ["Merit"] }));
    const en = rec.reasons.map((r) => r.text_en).join(" ");
    const et = rec.reasons.map((r) => r.text_et).join(" ");
    expect(en).toMatch(/same assistant|same.*Claude|Free.*tested|tested.*Free/i);
    expect(et).toContain("Claude Pro on sama Claude, mida proovisime tasuta paketiga (30.10.2026).");
    expect(en).toContain("Claude Pro is the same Claude we tried on the free plan (30.10.2026).");
    const sentence = rec.reasons.find((r) => r.text_et.includes("sama Claude"));
    expect(sentence?.sources).toEqual(expect.arrayContaining([1, 2]));
  });

  test("the free-start reason names the start row and cites its sources", () => {
    const start = clone(row("grok", "free"), { write_tools: true, custom_connectors: 1 });
    const pro = clone(row("claude", "pro"), { launchpad_tested: "2026-10-30" });
    const rec = recommendAssistant(base({ customConnectorsNeeded: 2 }), [pro, start]);
    expect(rec.start).toMatchObject({ assistant: "grok", plan: "free" });
    expect(rec.reasons.some((r) => r.text_en.includes("Claude's free plan"))).toBe(false);
    const sentence = rec.reasons.find((r) => r.text_en.includes("Grok Free"));
    expect(sentence?.text_en).toContain("You can run AI Launchpad alone on Grok Free");
    expect(sentence?.text_et).toContain("Grok Free");
    expect(sentence?.sources).toEqual([29, 31, 32, 35, 36, 37]);
  });

  test("a sheet with no allowed plan recommends nothing", () => {
    const untested = recommendAssistant(base(), [row("chatgpt", "business")]);
    expect(untested.recommended).toBeNull();
    expect(untested.paidNote).toBe(false);
    expect(untested.reasons.map((r) => r.text_en).join(" ")).toBe("No plan fits — see the table");
    expect(untested.reasons.map((r) => r.text_et).join(" ")).toBe("Ühtegi sobivat paketti ei leitud — vaata tabelit");

    const ineligible = recommendAssistant(base(), [row("chatgpt", "free")]);
    expect(ineligible.recommended).toBeNull();
    expect(ineligible.paidNote).toBe(false);
    expect(ineligible.start).toBeUndefined();
    expect(ineligible.reasons.map((r) => r.text_en).join(" ")).toBe("No plan fits — see the table");
  });
});
