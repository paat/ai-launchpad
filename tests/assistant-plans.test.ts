import { describe, expect, test } from "vitest";
import {
  PLANS, cheaperPlan, customerFromServices, monthlyCost, recommendAssistant,
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
    expect(PLANS).toHaveLength(16);
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
    expect(row("chatgpt", "plus")).toMatchObject({ custom_connectors: 0, write_tools: false, price: { amount: 20, currency: "USD" } });
    expect(row("chatgpt", "pro").price).toBeNull();
    expect(row("chatgpt", "pro").write_tools).toBe(false);
    expect(row("chatgpt", "business").price).toEqual({ amount: 25, currency: "USD", tax: "excluded", per: "seat_month", min_seats: 2 });
    expect(row("gemini", "ai_pro").price).toEqual({ amount: 21.99, currency: "EUR", tax: "unknown", per: "month", min_seats: 1 });
    expect(row("google", "workspace").price).toEqual({ amount: 16.2, currency: "EUR", tax: "unknown", per: "seat_month", min_seats: 1 });
    expect(row("copilot", "m365_business").price).toEqual({ amount: 18.2, currency: "EUR", tax: "excluded", per: "seat_month", min_seats: 1 });
    expect(row("copilot", "pro").price).toBeNull();
    expect(row("copilot", "pro").custom_connectors).toBeNull();
    expect(row("claude", "free").trains_by_default).toBeNull();
    expect(row("google", "workspace").write_tools).toBeNull();
    expect(row("google", "workspace").phone).toBeNull();
    for (const plan of PLANS) if (plan.plan !== "free" || plan.assistant !== "claude") expect(plan.launchpad_tested, plan.plan).toBeNull();
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
    expect(cheaperPlan(usd, eur, 1)).toBeNull();
    expect(recommendAssistant(base(), [usd, eur]).recommended).toBe(usd);
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
});
