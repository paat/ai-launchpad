# Browser-to-MCP providers: bounded comparison

Checked 27 October 2026. Seven providers/products, selected for relevance to an assistant working in business websites without a service-specific adapter. All sources are official documentation or publisher repositories opened in BrowserOS. Public documentation only: no accounts, business logins, installations, purchases or authenticated actions. No claim of exhaustive coverage or runtime compatibility.

Parent reopened the load-bearing current Firecrawl, Browserbase and Browser Use source captures. Other rows remain researcher-sourced documentation leads. All seven entries are included in the [canonical catalog](catalog/README.md).

## Decision

Browser MCP is a real fallback category and should be in Launchpad's catalog. It supplies general website access, not the semantics and guarantees of a business-specific connector. Prefer a provider's supported MCP/API when it exists; use browser tools for otherwise uncovered reads, navigation, document gathering and preparation.

For a desktop-assisted path, BrowserOS, Chrome DevTools MCP, Playwright MCP's extension mode and Browser Use's local harness can use an existing or persistent login. For a phone-oriented assistant, a remote cloud browser is architecturally more plausible, but brings separate login/session management and third-party processing. A phone cannot directly reach a computer's localhost MCP endpoint. Actual mobile-client support, secure reachability, login handoff and recovery remain untested.

**Progress reporting is useful but not an approval gate.** If an assistant has direct generic browser control, it can act before reporting to Launchpad. Launchpad cannot honestly claim to enforce all actions solely because it receives reports afterward. A server-owned execution path, constrained operation or genuine downstream approval is needed for that guarantee. Continue to stop before real government Submit, payments, qualified signatures or PIN entry under this project's rules.

## Comparison

“Approval not established” below means the checked sources did not establish server-enforced approval bound to the exact business action. It does not assert that the vendor has no security controls. Connecting a browser, allowing a tool, and approving a particular recipient/document/amount are different permissions.

| Provider | Deployment / endpoint | Existing login | Execution and phone implication | Approval boundary |
|---|---|---|---|---|
| BrowserOS neo | Local browser MCP, `http://127.0.0.1:9200/mcp` | Imports Chrome logins into its separate browser; persistent accounts and agent-owned tabs | Assistant drives local browser; desktop must be running/reachable. Not a directly usable remote phone endpoint | Live view and replay aid oversight; exact business-action approval enforcement not established |
| Chrome DevTools MCP | Local Node server, stdio; attach to Chrome | Dedicated persistent profile by default; `--autoConnect` attaches to running Chrome with browser consent | General browser interaction plus developer/debug tools; local path requires a running host | Connection dialog grants browser access, not per-transaction approval |
| Microsoft Playwright MCP | Local stdio, optional self-hosted HTTP/container | Persistent profile, isolated context, or extension attaching to existing tabs | Assistant drives calls; mobile emulation is not a mobile-host integration | Explicitly says it is not a security boundary; no general transaction approval established |
| Browserbase / Stagehand MCP | Hosted `https://mcp.browserbase.com/mcp`; local server can still use cloud browser | Separate cloud sessions; Contexts persist cookies/local storage. Can attach to an existing Browserbase session, not implicitly to user's Chrome | Hosted browser tools suitable for remote clients in principle; assistant still coordinates calls | General act/fill tools; exact business approval not established |
| Browser Use | Hosted `https://api.browser-use.com/v3/mcp`; separate local `browser-harness-mcp` | Cloud profile ID or own Chrome through local harness | Hosted interface delegates a whole task to a cloud agent and exposes status/results; local harness exposes stepwise controls | No general exact-action approval established; delegated agent needs explicit bounds |
| Browserless MCP | Hosted `https://mcp.browserless.io/mcp`; local package may still target cloud | Stateful cloud session, saved authentication profiles; not automatic access to user's local Chrome | Client drives MCP browser; separate Agent Run API runs browser and model. Remote access plausible, mobile handoff untested | Special Stripe checkout has enforced purchase approval, but restricted US/USD program; generic browser control has no equivalent established |
| Firecrawl MCP | Hosted OAuth/API-key routes; local MCP server and partial self-hosted stack | Cloud Interact supports named authenticated profiles; plain scraping does not inherit user login | Scrape/search/extract plus Cloud Interact actions. Remote possible; do not infer full phone portal workflow | General form submission is documented; no universal transaction approval established |

## Provider evidence and limits

### BrowserOS neo

[Official repository](https://github.com/browseros-ai/BrowserOS), [connection documentation](https://github.com/browseros-ai/BrowserOS/blob/main/docs/neo/mcp/index.mdx), [privacy](https://docs.browseros.com/neo/privacy).

The repository documents a separate browser for agents, importing Chrome login state, parallel tabs, live inspection and local replay. The endpoint is loopback on the machine running BrowserOS. The privacy page separates BrowserOS storage/telemetry from the assistant's own model provider. Its local storage claims must not be interpreted as “page content never reaches an external model”: the connected assistant has its own processing policy. Anonymous product events are on by default and can be disabled. These are useful observability controls, not evidence of recipient/amount-bound approvals.


### Chrome DevTools MCP

[Official repository](https://github.com/ChromeDevTools/chrome-devtools-mcp), [advanced usage](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md).

Default browser launch uses a dedicated profile; existing-Chrome attachment supports manual remote debugging or `--autoConnect` with Chrome's consent dialog. Auto-connect can access all windows in the selected profile. Useful for diagnostics and supervised work, but the broad access needs deliberate account separation. The README warns that browser content is exposed to the MCP client. Google usage telemetry is enabled by default; performance tools may send trace URLs to CrUX. Separate opt-outs are documented. Neither local execution nor Chrome's connection consent implies that every subsequent business action is approved.


### Microsoft Playwright MCP

[Official repository](https://github.com/microsoft/playwright-mcp), [extension documentation](https://github.com/microsoft/playwright/blob/main/packages/extension/README.md).

The server uses structured accessibility snapshots and browser actions. Persistent, isolated and existing-browser extension modes have different authentication consequences. Persistent profile state is retained; isolated state normally disappears when closed, unless saved/imported. Extension mode reuses actual logged-in tabs. Its extension token can remove repeated connection confirmations. The server can be exposed over HTTP or run in a container, but those options do not by themselves provide a secure multi-tenant hosted service. Origin restrictions are expressly not a security boundary and do not constrain redirects. Outputs still flow to the chosen MCP client/model. The extension documentation was inspected through official search output; the main repository was also opened directly.


### Browserbase / Stagehand MCP

[Current publisher setup documentation](https://github.com/browserbase/stagehand/blob/main/packages/docs/v3/integrations/mcp/setup.mdx), [Contexts](https://docs.browserbase.com/platform/browser/core-features/contexts), [archived reference implementation](https://github.com/browserbase/mcp-server-browserbase).

Current setup documents hosted Streamable HTTP, API-key headers and navigation/action/observation/extraction. A local MCP transport does not make its Browserbase browser local. Cloud Contexts retain cookies and local storage; the provider documents encryption at rest. Sessions and page material are processed in Browserbase infrastructure, with a configured Stagehand model involved in AI actions. Cloud context reuse is different from reusing the owner's desktop browser. Do not infer that every hosted setup exposes all context flags documented for the local package.

The old MCP repository now explicitly says it is archived and not representative of current production. Use it as historical context only. The public product page remained indexed but the browser read was empty; current setup and Contexts pages carry the conclusions here. General action tools do not establish transaction approvals.


### Browser Use: cloud agent versus local harness

[Product MCP page](https://browser-use.com/mcp), [current cloud MCP guide](https://docs.browser-use.com/cloud/guides/mcp-server), [local harness documentation](https://github.com/browser-use/browser-harness/blob/main/docs/MCP.md).

Current cloud documentation uses `/v3/mcp` and bearer authentication. `run_session` starts a delegated task; `get_session` returns status, step count, cost and live URL; related tools stop or follow up on sessions. This is more than a remote click primitive: the provider runs an agent. Cloud profile IDs preserve authenticated context; actual site login eligibility still needs validation. The local harness is a separate stdio/CDP tool surface for the Chrome already running on the user's machine.

Older repository integration notes still show `/mcp`, older tool names and pricing; do not mix them with v3. Cloud execution sends task/page processing to the provider/model infrastructure. Local browser execution still exposes outputs to the selected assistant. A submitted cloud task can be monitored independently of individual browser-control calls, but arbitrary continuation, new scheduled work and guaranteed recovery after host closure remain untested.


### Browserless

[Setup](https://docs.browserless.io/mcp/browserless-mcp-server/setup), [MCP versus Agent Run](https://docs.browserless.io/overview/getting-started/create-a-browser-agent), [browser sessions](https://docs.browserless.io/mcp/browser-agent), [specific checkout approval](https://docs.browserless.io/mcp/agentic-checkout).

Hosted MCP supports OAuth and API-key access. It drives managed cloud browsers, with a default US region and documented European endpoint options; residency is therefore a configuration question, not something to assume. Session continuity requires opting into keep-alive and carrying the returned handle. Saved profiles are not the owner's local browser. The documentation-only MCP is a different read-only product.

The provider explicitly distinguishes assistant-driven MCP from the Agent Run API, where Browserless runs the model and browser and returns a job to monitor. Neither silently starts new work just because an MCP connection exists.

One approval mechanism is unusually concrete: Stripe Link checkout requires a per-purchase buyer approval, an exact amount, a session/page binding and a one-use card. It is cloud-only and currently limited to eligible US wallets, USD and $50 or less. That is **not an Estonian payments solution** or a generic guarantee for arbitrary forms. Card-field filling also does not prove merchant acceptance. This is a useful control design example, not a proposed payment integration for this project.


### Firecrawl: extraction and interaction must be distinguished

[Official capability matrix](https://docs.firecrawl.dev/capabilities), [MCP connection](https://docs.firecrawl.dev/mcp-server), [Interact](https://docs.firecrawl.dev/features/interact).

Do not label current Firecrawl as scraping-only. Its official matrix documents `firecrawl_interact` and `firecrawl_interact_stop` for acting in a scraped page, including forms and navigation. Named profiles on `firecrawl_scrape` preserve authenticated state; target-site login must be supplied separately. These interaction/profile capabilities are Cloud-delivered, not part of the default self-hosted stack. The standalone Browser Sandbox does not have an equivalent standalone MCP tool in the checked matrix.

Plain search/scrape/parse remain a different workload from authenticated interaction. Hosted account access uses `/v2/mcp-oauth`; unattended API-key access uses `/v2/mcp`. Cloud browsers and submitted login/profile material live outside the user's device. General form-submit capability is documented; transaction-specific approval enforcement was not established. Scheduled monitoring exists as a separate feature, not proof that a chat assistant keeps executing business workflows.


## Implications for Launchpad — research inference

1. Catalog browser automation separately from service-specific MCP, ordinary APIs, documentation MCP and closed AI. A browser service broadens reach; it does not certify Estonian portal support or business outcomes.
2. Offer a supervised existing-login route for preparation. For a phone-first product, qualify one cloud-browser provider and the human login/handoff path before promising “works from your phone.” An open browser session is not an active assistant.
3. Record execution provenance: browser provider, session/action reference, assistant report time, evidence reference and independently confirmed outcome when available. Keep “prepared,” “submitted,” “accepted” and “paid” separate. No full conversation or replay copying is needed by default.
4. Reuse the browser provider. The remaining product work is narrow task guidance, authorization, safe handoff and outcome reconciliation—not building a new general browser driver.
5. The technical ability to click Submit does not remove project restrictions. No PIN automation, qualified signatures, real payments or real government submissions. No provider was tested on those workflows.

