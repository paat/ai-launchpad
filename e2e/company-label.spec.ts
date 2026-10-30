import { test, expect } from "@playwright/test";
import { createApp, type Config } from "../src/app.js";
import { sha256 } from "../src/db.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { DEMO_FIXTURES } from "../src/fixtures.js";

test("fresh real-style workspace shows the supplied company once on Täna", async ({ page, context }) => {
  const cfg: Config = { demo: false, production: false, baseUrl: "http://127.0.0.1", dbPath: ":memory:", modelMode: "test", allowedHosts: ["127.0.0.1"] };
  const { app, db } = createApp(cfg);
  const now = new Date().toISOString();
  // Synthetic authenticated Google-style owner; no OIDC or provider request.
  db.prepare("INSERT INTO owners(id,subject,kind,reporting_enabled,created_at) VALUES('synthetic-owner','synthetic-google-subject','google',1,?)").run(now);
  db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES('synthetic-owner','workspace-synthetic','Your business workspace')").run();
  db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,'synthetic-owner','synthetic-csrf',?)").run(sha256("synthetic-browser-session"), new Date(Date.now() + 60_000).toISOString());
  db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('synthetic-token','synthetic-owner',?,'progress:read,progress:report',1,?)").run(sha256("lp_synthetic-browser-token"), now);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  cfg.baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new Client({ name: "synthetic-browser", version: "1" });
  try {
    await context.addCookies([{ name: "lp_session", value: "synthetic-browser-session", url: cfg.baseUrl }]);
    await page.goto(cfg.baseUrl);
    await expect(page.getByRole("heading", { name: "Täna pole sinult midagi vaja" })).toBeVisible();
    await expect(page.locator("main .hero").getByRole("link", { name: "Ühenda oma assistent" })).toBeVisible();
    await client.connect(new StreamableHTTPClientTransport(new URL(`${cfg.baseUrl}/mcp`), { requestInit: { headers: { authorization: "Bearer lp_synthetic-browser-token" } } }));
    const company = "Synthetic Harbor Studio OÜ";
    const result = await client.callTool({ name: "report_assessment", arguments: { report_id: "first", expected_version: 0, assessment: { ...DEMO_FIXTURES.alpha, company_label: company, company_registry_ref: "synthetic-registry-ref" } } });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    await page.reload();
    await expect(page.locator("main .hero .company")).toHaveText(company);
    await expect(page.getByText(company, { exact: true })).toHaveCount(1);
    await expect(page.getByText("Your business workspace", { exact: true })).toHaveCount(0);
    await page.getByText("Kuidas see kokku pandi", { exact: true }).click();
    await expect(page.getByText(/Ettevõtte nime andis sinu assistent/)).toContainText("synthetic-registry-ref");
    await expect(page.getByText(/Ettevõtte nime andis sinu assistent/)).toContainText("seda ei ole avalikust registrist kontrollitud ja see ei tõenda volitust");
  } finally { await client.close(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
