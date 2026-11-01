import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect } from "vitest";
import { safeHttps, searchServices, loadCatalog } from "../src/catalog.js";

const byId = (id: string) => {
  const rec = loadCatalog().find((r) => r.id === id);
  if (!rec) throw new Error(`catalog record missing: ${id}`);
  return rec;
};

describe("safeHttps strict standalone-URL gate", () => {
  test("actual combined catalogue connections stay descriptive with null connection_url; usable source links remain", () => {
    const lhv = byId("lhv-ai");
    expect(lhv.connection).toBe("https://mcp.lhv.ai/mcp; REST https://api.lhv.ai/api/v1");
    const nimistu = byId("nimistu");
    expect(nimistu.connection).toBe("https://nimistu.ee/api/mcp; fallback SSE /api/sse");
    const lahend = byId("lahend");
    expect(lahend.connection).toBe("https://lahend.ee/api/lahend-mcp/mcp; SSE /api/lahend-mcp/sse");
    for (const rec of [lhv, nimistu, lahend]) {
      expect(safeHttps(rec.connection)).toBeNull();
      const hit = searchServices(rec.name, 10).find((x) => x.id === rec.id);
      expect(hit?.connection).toBe(rec.connection);
      expect(hit?.connection_url).toBeNull();
    }
    // Usable source links on those records are preserved verbatim.
    expect(byId("lahend").sources).toContain("https://lahend.ee/mcp");
    expect(safeHttps("https://lahend.ee/mcp")).toBe("https://lahend.ee/mcp");
    for (const s of byId("nimistu").sources ?? []) expect(safeHttps(s)).toBe(s);
  });

  test("valid actual standalone connection record and canonical source links preserved", () => {
    const rec = byId("arikratt");
    expect(rec.connection).toBe("https://arikratt.ee/mcp");
    expect(safeHttps(rec.connection)).toBe("https://arikratt.ee/mcp");
    const hit = searchServices("Ärikratt", 10).find((x) => x.id === "arikratt");
    expect(hit?.connection_url).toBe("https://arikratt.ee/mcp");
    expect(hit?.sources.every((s) => safeHttps(s) === s)).toBe(true);
  });

  test("canonical HTTPS query/hash/percent-encoded path values pass through unchanged", () => {
    for (const u of [
      "https://example.com/a%20b?x=1&y=2#frag",
      "https://example.com/path?q=%2Fencoded#section-2",
      "https://example.com/mcp",
    ]) expect(safeHttps(u)).toBe(u);
  });

  test("parser-canonicalized https forms pass as new URL(input).href", () => {
    for (const u of [
      "https://rmp-api.rik.ee",
      "https://EXAMPLE.com/mcp",
      "https://example.com:443/mcp",
      "https://example.com/a/../mcp",
      "https://müller.ee/mcp",
    ]) expect(safeHttps(u)).toBe(new URL(u).href);
  });

  test("hubspot is one pinned row; scoro stays one row", () => {
    const hub = searchServices("hubspot", 25);
    expect(hub.map((r) => r.id)).toEqual(["hubspot"]);
    expect(hub[0].connection_url === null || safeHttps(hub[0].connection_url) === hub[0].connection_url).toBe(true);
    expect(searchServices("scoro", 25).map((r) => r.id)).toEqual(["scoro"]);
    expect(byId("hubspot")).toMatchObject({
      sector: "CRM",
      interface_class: "hosted_mcp",
      connection: "Official Claude directory connector; remote MCP https://mcp.hubspot.com",
      access_and_price: "OAuth 2.1; free CRM for new accounts: up to 1,000 contacts and 2 users (HubSpot FAQ, updated 2026-06-20)",
      limitations: "Writes (manage_crm_objects) show a proposed change and ask for confirmation; deletes not offered; exact-action approval by Launchpad not established",
      checked_on: "2026-11-01",
      runtime_tested: false,
    });
    expect(byId("trivis").jobs).toContain("contacts, deals, interactions");
    expect(byId("trivis").access_and_price).toContain("write");
  });

  test("count partitions reconcile with the record total", () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, "..", "docs", "research", "catalog", "estonian-business-services.json"), "utf8")) as {
      counts: {
        records: number; email_calendar_records: number; initial_sector_records: number;
        supplement_records: number; supporting_records: number;
        by_research_leg: Record<string, number>; by_group: Record<string, number>; by_interface: Record<string, number>;
      };
      records: { research_leg: string; catalog_group: string; interface_class: string }[];
    };
    const { counts, records } = raw;
    expect(records).toHaveLength(counts.records);
    expect(loadCatalog()).toHaveLength(counts.records);
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(counts.by_research_leg)).toBe(counts.records);
    expect(sum(counts.by_group)).toBe(counts.records);
    expect(sum(counts.by_interface)).toBe(counts.records);
    const legs = counts.by_research_leg;
    expect(legs.accounting + legs["banking-data"] + legs["other-b2b"]).toBe(counts.initial_sector_records);
    expect(legs["email-workspaces"] + legs["email-local"] + legs["email-scheduling"] + legs["email-community"]).toBe(counts.email_calendar_records);
    expect(legs.couriers + legs.browsers).toBe(counts.supplement_records);
    expect(legs.supplementary).toBe(counts.supporting_records);
    expect(counts.initial_sector_records + counts.supporting_records + counts.supplement_records + counts.email_calendar_records).toBe(counts.records);
    const tally = (key: "research_leg" | "catalog_group" | "interface_class") => {
      const m: Record<string, number> = {};
      for (const r of records) m[r[key]] = (m[r[key]] ?? 0) + 1;
      return m;
    };
    expect(tally("research_leg")).toEqual(counts.by_research_leg);
    expect(tally("catalog_group")).toEqual(counts.by_group);
    expect(tally("interface_class")).toEqual(counts.by_interface);
  });

  test("all actual catalog source URLs stay linkable", () => {
    let checked = 0;
    for (const rec of loadCatalog()) {
      for (const s of rec.sources ?? []) {
        expect(safeHttps(s)).toBe(new URL(s).href);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("raw whitespace/control, prose, multiple URLs and repaired forms rejected", () => {
    for (const bad of [
      " https://example.com/mcp",
      "https://example.com/mcp ",
      "https://example.com/a b",
      "https://example.com/a\tb",
      "https://example.com/a\nb",
      "https://example.com/a\rb",
      "https://example.com/a\x00b",
      "https://example.com/a\x7fb",
      "https://example.com/a\u0085b",
      "https://mcp.lhv.ai/mcp; REST https://api.lhv.ai/api/v1",
      "https://nimistu.ee/api/mcp; fallback SSE /api/sse",
      "https://lahend.ee/api/lahend-mcp/mcp; SSE /api/lahend-mcp/sse",
      "https://a.example/mcphttps://b.example/api",
      "https://a.example/mcp, https://b.example/api",
      "Endpoint is https://example.com/mcp",
      "https:example.com/mcp",
      "https://example.com\\mcp",
      "https:///mcp",
      "https://",
    ]) expect(safeHttps(bad)).toBeNull();
  });

  test("http, credentials and non-strings remain null", () => {
    expect(safeHttps("http://example.com")).toBeNull();
    expect(safeHttps("https://user:pass@example.com")).toBeNull();
    expect(safeHttps("https://user@example.com")).toBeNull();
    expect(safeHttps(42)).toBeNull();
    expect(safeHttps(null)).toBeNull();
    expect(safeHttps(undefined)).toBeNull();
    expect(safeHttps("")).toBeNull();
  });
});
