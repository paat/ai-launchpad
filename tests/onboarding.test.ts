import { describe, expect, test } from "vitest";
import { connectionBody } from "../src/views.js";

// Pure view tests for the honest assistant-connection onboarding slice.
const FIRST_REQUEST = "Use AI Launchpad to review what you know about my business admin. Tell me what is still unknown and recommend one next action that would remove the most work. Do not change any business service.";
const HTTPS_UNVERIFIED = "HTTPS address configured. Compatibility with your assistant has not been verified.";

type Grant = Record<string, unknown>;
function body(over: Partial<Parameters<typeof connectionBody>[0]> & { grants?: Grant[] } = {}): string {
  const { grants, ...rest } = over;
  return connectionBody({
    lang: "en",
    csrf: "csrf-token",
    baseUrl: "https://launchpad.example.com",
    reportingEnabled: false,
    tokens: [],
    grants: (grants ?? []) as unknown as Record<string, string>[],
    candidates: [],
    ...rest,
  });
}
const grant = (over: Grant = {}): Grant => ({
  id: "grant-1",
  scopes: "progress:read",
  revoked: 0,
  expires: Date.now() + 3_600_000,
  redirect: "https://assistant.example/callback",
  metadata: JSON.stringify({ client_name: "Test Assistant" }),
  ...over,
});
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

describe("endpoint and honest availability", () => {
  test("public HTTPS with trailing slash gives the exact copyable endpoint, unverified", () => {
    const html = body({ baseUrl: "https://launchpad.example.com/" });
    expect(html).toContain("<code>https://launchpad.example.com/mcp</code>");
    expect(html).toContain('data-copy-text="https://launchpad.example.com/mcp"');
    expect(html).not.toContain("example.com//mcp");
    expect(html).toContain(HTTPS_UNVERIFIED);
    const historyAt = html.indexOf("Assistant history");
    expect(historyAt).toBeGreaterThan(0);
    expect(html.slice(0, historyAt)).not.toMatch(/publicly reachable|live connection|is reachable/i);
    expect(html).toContain("Saved history, not a live connection check");
  });

  test("connection leads before progress sharing", () => {
    const html = body();
    expect(html.indexOf("Connect your assistant")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("Connect your assistant")).toBeLessThan(html.indexOf("Progress sharing permission"));
  });

  test.each([
    ["localhost", "http://localhost:3000"],
    ["IPv4 loopback", "http://127.0.0.1:3000"],
    ["IPv6 loopback", "http://[::1]:3000"],
    ["plain http public", "http://launchpad.example.com"],
    ["https private network", "https://192.168.1.10"],
    ["https 10.x private", "https://10.0.0.5"],
    ["https 172.16 private", "https://172.16.0.5"],
    ["https mapped 127", "https://[::ffff:127.0.0.1]"],
    ["https mapped 10.x", "https://[::ffff:10.0.0.5]"],
    ["https mapped 192.168", "https://[::ffff:192.168.1.10]"],
    ["https mapped 172.16", "https://[::ffff:172.16.0.5]"],
    ["invalid base", "not a url"],
  ])("%s shows pending local setup, no remote-ready call to action", (_label, baseUrl) => {
    const html = body({ baseUrl });
    expect(html).toContain("Local setup pending");
    expect(html).not.toContain(HTTPS_UNVERIFIED);
    expect(html).not.toContain("Copy MCP address");
    expect(html).toContain("A secure tunnel could make a local server reachable, but no tunnel is configured here.");
    expect(html).not.toMatch(/impossible/i);
    // Endpoint stays available only inside the advanced local-development area.
    const advanced = html.indexOf("Advanced: local development");
    expect(advanced).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("/mcp</code>", advanced)).toBeGreaterThan(advanced);
    expect(html).toContain("do not paste a localhost, loopback or private-network address into a cloud assistant");
  });
});

describe("assistant guides and identity copy", () => {
  test("Claude and ChatGPT short steps link to the official guides, no plan promise", () => {
    const html = body();
    expect(html).toContain("https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp");
    expect(html).toContain("Customize → Connectors");
    expect(html).toContain("Add custom connector");
    expect(html).toContain("Paste the MCP address above.");
    expect(html).toContain("Sign in and review access");
    expect(html).toContain("https://developers.openai.com/api/docs/guides/custom-mcp-server");
    expect(html).toContain("Plugins");
    expect(html).toContain("add a custom MCP server");
    expect(html).toContain("OAuth");
    expect(html).toContain("Install it, then select it in chat.");
    expect(html).toContain("Screens and account availability vary");
    expect(html).toContain("nothing here promises plan eligibility or requires a purchase");
  });

  test("Google is identity only and proves no company mandate", () => {
    const html = body();
    expect(html).toContain("Google sign-in identifies you; it does not connect your email or calendar");
    expect(html).toContain("does not prove you may act for a company");
  });
});

describe("first request and copy behaviour", () => {
  test("exact first request is visible, copyable, and copying does not run it", () => {
    const html = body();
    expect(html).toContain(`<p>${FIRST_REQUEST}</p>`);
    expect(html).toContain(`data-copy-text="${FIRST_REQUEST}"`);
    expect(html).toContain("Copy first request");
    expect(html).toContain("Paste this into your assistant");
    expect(html).toContain("Copying it does not run the request.");
  });

  test("copy handler is static DOM code: clipboard + select fallback, no network or navigation", () => {
    const html = body();
    const js = scripts(html);
    expect(js).toContain('getAttribute("data-copy-text")');
    expect(js).toContain("navigator.clipboard.writeText");
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|location\s*=|\/tokens/);
    expect(html).toContain("Copy failed — select the text below and copy it yourself.");
    expect(html).toContain('id="copy-endpoint-text"');
    expect(html).toContain('id="copy-first-request-text"');
  });

  test("endpoint and client metadata are escaped, never inline script content", () => {
    const html = body({
      baseUrl: `https://launchpad.example.com/"><script>alert(1)</script>`,
      grants: [grant({ metadata: JSON.stringify({ client_name: "<img src=x onerror=alert(2)>" }), redirect: "not a url" })],
    });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
    expect(scripts(html)).not.toContain("alert(");
    expect(html).toContain("not available");
  });
});

describe("manual tokens and preserved sections", () => {
  test("manual tokens sit in a closed details element, POST + CSRF preserved, raw secrets never rendered", () => {
    const html = body({
      tokens: [{ id: "tok-1", scopes: "progress:read progress:report", revoked: "0", created_at: "2026-10-28", secret: "raw-secret-value" }],
      candidates: [{ id: "cand-1", name: "Example Service", status: "pending", connection: "MCP", jobs: "invoicing", created_at: "2026-10-28" }],
    });
    const start = html.indexOf("<details><summary>Advanced: manual tokens</summary>");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(html).not.toMatch(/<details open[^>]*>\s*<summary>Advanced: manual tokens/);
    const inside = html.slice(start, html.indexOf("</details>", start));
    expect(inside).toContain('<form method="post" action="/tokens">');
    expect(inside).toContain('name="csrf" value="csrf-token"');
    expect(inside).toContain('<form method="post" action="/tokens/revoke">');
    expect(inside).toContain('name="token_id" value="tok-1"');
    expect(html).not.toContain("raw-secret-value");
    // Preserved functionality outside the connection slice.
    expect(html).toContain("Example Service");
    expect(html).toContain('action="/candidates/delete"');
    expect(html).toContain('href="/export"');
    expect(html).toContain('action="/delete"');
    expect(html).toContain('action="/reporting"');
  });

  test("read access and optional saved reports stay distinct, no ratification or auto-update claim", () => {
    const html = body();
    expect(html).toContain("Turning sharing off blocks your assistant from saving reports here; it does not remove read access you already approved");
    expect(html).toContain("Launchpad adds no review step");
    expect(html).toContain("Nothing on this page updates by itself");
  });
});

describe("grant states", () => {
  test("numeric revoked 0 and future expiry is Access approved with a disconnect form", () => {
    const html = body({ grants: [grant()] });
    expect(html).toContain("Assistant access");
    expect(html).toContain("Access approved");
    expect(html).toContain('<form method="post" action="/oauth/disconnect">');
    expect(html).toContain('name="grant_id" value="grant-1"');
  });

  test("string '0' revoked is not treated as revoked", () => {
    const html = body({ grants: [grant({ revoked: "0", expires: String(Date.now() + 3_600_000) })] });
    expect(html).toContain("Access approved");
    expect(html).not.toContain("Access revoked");
  });

  test.each([[1], ["1"]])("revoked %s is Access revoked without a disconnect form", (revoked) => {
    const html = body({ grants: [grant({ revoked })] });
    expect(html).toContain("Access revoked");
    expect(html).not.toContain("Access approved</p>");
    expect(html).not.toContain('action="/oauth/disconnect"');
  });

  test("past expiry is Access expired", () => {
    const html = body({ grants: [grant({ expires: Date.now() - 1000 })] });
    expect(html).toContain("Access expired");
    expect(html).not.toContain('action="/oauth/disconnect"');
  });

  test("invalid expiry never says active", () => {
    const html = body({ grants: [grant({ expires: "not-a-date" })] });
    expect(html).toContain("Access expired");
    expect(html).not.toContain("Access approved");
  });

  test("a grant alone never claims contact or a saved assessment", () => {
    const html = body({ grants: [grant(), grant({ id: "grant-2", revoked: 1 })] });
    expect(html).not.toMatch(/\bconnected\b/i);
    expect(html).not.toMatch(/assistant reached|assessment (is )?saved/i);
    expect(html).toContain("An approved grant is permission only");
  });
});
