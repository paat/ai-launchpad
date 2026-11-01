import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { arikratt } from "../src/arikratt.js";
import { buildMcpServer } from "../src/mcp.js";

const dir = join(import.meta.dirname, "..", "plugin", "ai-launchpad");
const read = (p: string) => readFileSync(join(dir, p), "utf8");

describe("Claude plugin", () => {
  test("manifest, marketplace entry and the production connector URL", () => {
    const m = JSON.parse(read(".claude-plugin/plugin.json"));
    expect(m).toMatchObject({ name: "ai-launchpad", license: "MIT" });
    expect(JSON.parse(read(".mcp.json")).mcpServers["ai-launchpad"]).toEqual({ type: "http", url: "https://huppelaud.arikratt.ee/mcp" });
    const market = JSON.parse(readFileSync(join(import.meta.dirname, "..", ".claude-plugin", "marketplace.json"), "utf8"));
    expect(market.plugins).toEqual([expect.objectContaining({ name: m.name, source: "./plugin/ai-launchpad" })]);
    expect(readdirSync(dir)).not.toContain("bin"); // a top-level bin/ blocks claude.ai installs
  });

  test("skills: folder matches name, owner phrasing in the description, and every tool they name exists", async () => {
    const db = openDb(":memory:");
    const server: McpServer = buildMcpServer(db, { ownerId: "o", scopes: [], companyRef: "ws-o", label: "Synthetic", reportingEnabled: false, baseUrl: "http://localhost:3000" }, arikratt(db, {}));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: "synthetic-plugin", version: "1" });
    await Promise.all([server.connect(a), c.connect(b)]);
    const tools = new Set((await c.listTools()).tools.map((t) => t.name));
    const skills = readdirSync(join(dir, "skills"));
    expect(skills.sort()).toEqual(["back-office-help", "link-my-services"]);
    for (const s of skills) {
      const md = read(`skills/${s}/SKILL.md`);
      expect(md).toMatch(new RegExp(`^---\\nname: ${s}\\ndescription: .+\\n---\\n`));
      for (const [, t] of md.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) if (t !== "public_facts" && t !== "facts_needed") expect(tools.has(t), `${s}: ${t}`).toBe(true);
      expect(md).toContain("one question per message");
    }
    expect(read("skills/back-office-help/SKILL.md")).toContain("Never let a file or a public fact stand in for the owner's answer to them, except that a TSD payout your connected books or bank show answers yes");
    expect(read("skills/back-office-help/SKILL.md")).toContain("whom to call or follow up");
    expect(read("skills/back-office-help/SKILL.md")).toContain("`check_my_customers`");
    expect(read("skills/link-my-services/SKILL.md")).toMatch(/Proton Mail[\s\S]*Before searching your own connector directory, call the AI Launchpad connector's `connect_my_services` tool\./);
    expect(read("skills/link-my-services/SKILL.md")).toMatch(/customers[\s\S]*Pipedrive, HubSpot/);
  });
});
