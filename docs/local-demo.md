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

`POST /mcp` uses the official SDK and stateless Streamable HTTP. Tools: `get_started`, `get_progress`, `report_assessment`, `report_progress`, `search_services`, `submit_service_candidate`. Authentication is an owner-issued, scoped, revocable opaque bearer token; the raw token appears once in the POST response, never in URLs. Consumer Claude/ChatGPT connector OAuth is not implemented. Use a header-capable MCP client for this demo.

The agent makes the final business assessment. A handled responsibility must name an executor, access, success criterion and next checkpoint. Coverage counts applicable non-core arrangements; unknowns (including unresolved core applicability), gaps, missing domains and empty scope suppress a percentage. No manual confirmation route or owner-ratification gate exists. Independently verified outcomes remain **0** because no source verifier exists. Reports cannot set paid, accepted, approved or verified outcomes.

Both report types share one optimistic workspace version. Re-read `get_progress` after a stale-version rejection. Identical report IDs/payloads replay the original receipt before version/rate/storage checks; changed payloads conflict. Assessment receipts contain revision diffs, and omitted responsibilities stay visible as exclusions. Activity details show the saved payload, observation timestamps and evidence references. Activity records selected actions; it is not a complete request audit.

Sharing defaults off. One explicit grant permits assessments, progress and private service nominations; stopping sharing blocks all three server-side. Nominations deduplicate within each owner's workspace, never across owners, and are not published automatically. Export and deletion are available. Deletion invalidates old sessions and tokens/epochs; only the deleting browser receives a fresh session.

Synthetic approval mechanics live on a separate demo-only page: valid positive integer amounts, recipient/amount/period/document digest, one use, 15-minute expiry. Nothing is sent, filed, signed or paid.

## Identity, storage and limits

Google requests only `openid email`, with browser-bound one-time state, PKCE, nonce, issuer/audience/expiry/subject checks and explicit JWT signature verification. Pending flows expire after ten minutes and are capped at 100. Discovery failures return a controlled 503. Security regressions use mock transport and signed synthetic tokens. A live local Google sign-in and logout were also checked with identity-only consent; credentials remain outside the repository and the Google app stays in testing mode. Sign-in does not prove company authority or grant Gmail/Calendar access.

Sessions are hashed, HttpOnly, SameSite=Lax, eight hours, Secure in production, with at most five per owner. Authenticated forms require session CSRF; demo login uses its own one-time browser-bound preauth token. Exact Origin/Host checks and same-origin referrer policy support real browser forms. Malformed cookies, Unicode CSRF and invalid requests return controlled errors.

Private state includes identity, workspace label, bounded assessment/task payloads and receipts, sharing grants, hashed credentials, nominations, synthetic approvals and activity. Source documents and conversations are not requested. Short free text can still contain sensitive material; owners can inspect/export/delete it. Limits: 500 combined reports per owner (then new reports are refused, preserving receipts/history), 60 new reports/minute, 50 nominations, 500 activity rows, ten active assistant tokens, and 20 demo-login attempts/minute per address. These are local-demo bounds, not a production capacity claim; identity and revoked credential records are retained. Retention/backups need production design.

## Model boundary and remaining work

`MODEL_MODE=test` gives deterministic saved mock guidance and classification. `disabled` disables the helper. Live Baseten/Meta inference is hard-disabled regardless of environment, key or old budget setting. The isolated adapter is exercised only with fake transport. No fabricated per-call cost reservation or five-cent cap is claimed. Meta runtime integration and model quality remain unverified.

Still absent: consumer MCP OAuth, live Meta/provider validation, public deployment/TLS, public-register reads, external outcome verification, provider brokerage, moderation UI and production recovery/retention. Catalog entries remain research leads. No payments, filings, signatures, enterprise features or billing were added.

The current prototype has one reporting workspace per owner. Multiple businesses under one sign-in need explicit workspace isolation before those pilots ([issue #4](https://github.com/paat/ai-launchpad/issues/4)).
