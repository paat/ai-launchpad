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
