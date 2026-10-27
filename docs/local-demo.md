# Local demo (27 Oct 2026)

Free micro-entrepreneur scope only. Local loopback development; not deployed or production-ready. [R-001](requirements/R-001-next-best-action.md) ([issue #1](https://github.com/paat/ai-launchpad/issues/1)) defines the agent's next-action judgment. [R-002](requirements/R-002-identity-and-runtime-cost.md) ([issue #3](https://github.com/paat/ai-launchpad/issues/3)) defines identity and runtime-cost boundaries. [Enterprise measurement](design/future-enterprise-measurement.md) is future design only.

## Run without credentials or paid calls

Use Node 22.12 or newer within Node 22 (`.nvmrc`, `package.json`). Dependencies are pinned by `package-lock.json`.

```bash
npm ci
npm run dev                          # http://localhost:3000; synthetic demo enabled
npm run typecheck
npm test                             # HTTP/MCP and mocked Google OIDC regressions
npm run test:probes                   # original 38 review areas, current contract
PLAYWRIGHT_CHANNEL=chrome npm run test:browser  # installed system Chrome
# CI uses: npx playwright install --with-deps chromium; npm run test:browser
npm run build
NODE_ENV=production npm start        # demo login disabled
```

Environment variables must be supplied by the launching environment; `.env.example` is a reference, not an automatic dotenv loader. SQLite defaults to `./data/launchpad.db`; set `LAUNCHPAD_DB_PATH=:memory:` for disposable state. This event-window patch targets the current schema: older experimental databases are not migrated. Use a fresh disposable database for the demo.

`LAUNCHPAD_BASE_URL` is the exact canonical origin (scheme, hostname, port). Browse that address; aliases and different ports are rejected even if listed in `LAUNCHPAD_ALLOWED_HOSTS`. Test servers set it to their actual ephemeral port. The server binds to loopback.

## Implemented contract

The companion shows the assistant's assessment, unknowns, one next action, responsibilities/evidence, activity and accepted payloads. Two synthetic businesses have distinct fixture assessments seeded only after explicit demo login. Google users begin with an empty workspace. Four sourced playbooks and 178 researched catalog records provide guidance, not verified integrations.

`POST /mcp` uses the official SDK and stateless Streamable HTTP. Tools: `get_started`, `get_progress`, `report_assessment`, `report_progress`, `search_services`, `submit_service_candidate`. Authentication supports standard MCP OAuth authorization code + S256 PKCE through the official SDK router and an original SQLite-backed provider. The local SDK client discovers protected-resource metadata from the 401 challenge, registers a public client, obtains explicit owner consent, exchanges a code, and calls the tools. Local SDK validated; Claude/ChatGPT remote connection not verified. Owner-issued manual bearer tokens remain an advanced development option for header-capable clients; they appear once in a POST response, never in URLs.

The agent makes the final business assessment. A handled responsibility must name an executor, access, success criterion and next checkpoint. Coverage counts applicable non-core arrangements; unknowns (including unresolved core applicability), gaps, missing domains and empty scope suppress a percentage. No manual confirmation route or owner-ratification gate exists. Independently verified outcomes remain **0** because no source verifier exists. Reports cannot set paid, accepted, approved or verified outcomes.

Both report types share one optimistic workspace version. Re-read `get_progress` after a stale-version rejection. Identical report IDs/payloads replay the original receipt before version/rate/storage checks; changed payloads conflict. Assessment revisions must retain all prior responsibility rows; omissions are rejected without saving or changing coverage. Explicit reclassification (including `not_applicable`) requires a new nonblank reason; receipts show before/after scope changes. `report_progress.task_id` must match a responsibility in the same workspace. Previously accepted reports still replay after scope changes; stopping sharing blocks reports, including retries. Activity details show the saved payload, observation timestamps and evidence references. Activity records selected actions; it is not a complete request audit.

Sharing defaults off. One explicit grant permits assessments, progress and private service nominations; stopping sharing blocks all three server-side. Nominations deduplicate within each owner's workspace, never across owners, and are not published automatically. Export and deletion are available. Deletion invalidates old sessions and tokens/epochs; only the deleting browser receives a fresh session.

Synthetic approval mechanics live on a separate demo-only page: valid positive integer amounts, recipient/amount/period/document digest, one use, 15-minute expiry. Nothing is sent, filed, signed or paid.

## Identity, storage and limits

Google requests only `openid email`, with browser-bound one-time state, PKCE, nonce, issuer/audience/expiry/subject checks and explicit JWT signature verification. Pending flows expire after ten minutes and are capped at 100. Discovery failures return a controlled 503. Security regressions use mock transport and signed synthetic tokens. Live local Google sign-in, return to MCP consent, read-only connection, disconnect and logout were also checked with identity-only consent; credentials remain outside the repository and the Google app stays in testing mode. Sign-in does not prove company authority or grant Gmail/Calendar access.

Sessions are hashed, HttpOnly, SameSite=Lax, eight hours, Secure in production, with at most five per owner. Authenticated forms require session CSRF; demo login uses its own one-time browser-bound preauth token. Exact Origin/Host checks and same-origin referrer policy support real browser forms. Cookie-free token, registration, revocation, discovery and MCP protocol endpoints allow cross-origin clients; canonical Host checks still apply. Consent stays same-origin, session-CSRF protected, and cannot be framed. Malformed cookies, Unicode CSRF and invalid requests return controlled errors.

Private state includes identity, workspace label, bounded assessment/task payloads and receipts, sharing grants, hashed credentials, nominations, synthetic approvals and activity. Source documents and conversations are not requested. Short free text can still contain sensitive material; owners can inspect/export/delete it. Limits: 500 combined reports per owner (then new reports are refused, preserving receipts/history), 60 new reports/minute, 50 nominations, 500 activity rows, ten active assistant tokens, and 20 demo-login attempts/minute per address. These are local-demo bounds, not a production capacity claim; identity and revoked credential records are retained. Retention/backups need production design.

## Model boundary and remaining work

`MODEL_MODE=test` gives deterministic saved mock guidance and classification. `disabled` disables the helper. Live Baseten/Meta inference is hard-disabled regardless of environment, key or old budget setting. The isolated adapter is exercised only with fake transport. No fabricated per-call cost reservation or five-cent cap is claimed. Meta runtime integration and model quality remain unverified.

Still absent: verified consumer Claude/ChatGPT remote compatibility, live Meta/provider validation, public deployment/TLS, public-register reads, external outcome verification, provider brokerage, moderation UI and production recovery/retention. Catalog entries remain research leads. No payments, filings, signatures, enterprise features or billing were added.

The current prototype has one reporting workspace per owner. Multiple businesses under one sign-in need explicit workspace isolation before those pilots ([issue #4](https://github.com/paat/ai-launchpad/issues/4)).

## Standard OAuth connection (local DEV)

The same Google identity session, or explicit synthetic demo login, leads to one consent screen. An opaque browser cookie resumes only a server-owned connection request after login. The screen shows the unverified client name, actual redirect origin, requested scopes and minimal shared fields. `progress:report` is unchecked by default; allowing it explicitly also enables the existing owner sharing gate. Reject returns `access_denied`. The Connection page lists permissions and lets owners disconnect assistants. Stopping sharing still blocks all three write tools.

Discovery is `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`; endpoints are `/authorize`, `/token`, `/register` and `/revoke`. Public clients only (`token_endpoint_auth_method: none`); code and refresh grants, S256 only. Authorization and token exchange require the exact `/mcp` resource and exact registered redirect, including loopback port. HTTPS is required in production. HTTP issuer and callback exceptions are limited to local development loopback; no global insecure SDK flag is set. Client metadata URLs are never fetched or retained.

Five additive SQLite tables store registered clients, pending consent, grants, hashed codes and hashed access/refresh credentials. Use a fresh disposable local DEV database; this leg did not open or migrate the existing private database. Pending consent: ten minutes, one use, at most 100 globally. Codes: 60 seconds, atomic single use, bound to client, redirect, resource, owner and deletion epoch. Access credentials: up to one hour. Refresh families and registrations: up to 30 days. Refresh rotates, permanently reduces requested scope, and reuse revokes the family. Revocation and owner deletion invalidate credentials and associated pending consent; deletion also stops sharing.

Local bounds: 500 registered clients; 5 redirects per client, each at most 2048 characters; 100-character client names; 8192-character stored registration input; 10 active grants and 100 retained grants per owner; 1000 credential rows per family. Expired connection records are pruned on registration/authorization. The SDK limits registration to 20/hour/IP, authorization to 100/15 minutes/IP, and token requests to 50/15 minutes/IP. Capacity failures require retrying later or reconnecting after expiry; these are local-demo limits. There is no client URL discovery, confidential-client authentication, production retention design or remote compatibility claim.

Tests use real local HTTP and the official SDK OAuth client, with a small synthetic browser cookie jar for login/consent, plus mocked signed Google identity tokens. External fetches are rejected by the OAuth test harness. No live Google or model calls are needed. Publication requires passing parent checks and an independent review.
