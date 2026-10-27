# Agent services relevant to Estonian businesses

Research snapshot: 27 October 2026. Public documentation research, not integration acceptance testing. The purpose is to help small businesses launch their own assistant smoothly. Revenue, repeat usage and number of connectors installed are not success requirements.

## What exists

The [catalog](catalog/README.md) records business providers, community implementations, ordinary APIs, specialist services and unresolved announcements separately. Its [JSON](catalog/estonian-business-services.json) and [CSV](catalog/estonian-business-services.csv) preserve sources, connection type, limitations and evidence status. Initial sweep: 134 sector integration records plus 9 supporting records. An integration record is not necessarily a unique vendor or a working connector. Subsequent category supplements are identified separately in the catalog metadata.

Existing services offer enough documented capability to justify curation before adapter development. This does not yet establish that one gateway can broker all of them, that every assistant supports them, or that an end-to-end business workflow is reliable.

| Business need | Useful candidates | Boundary to preserve |
|---|---|---|
| Accounting | [Werkzeug](https://werkzeug.ee/docs/), [Trivis](https://trivis.ee/mcp), [X7](https://x7.ee/en#home-ai), [usefulapi SmartAccounts](https://usefulapi.io/smartaccounts/) | Read/write and approval behavior differ. SmartAccounts invoice creation books immediately; its server cannot edit that invoice. A chat confirmation is not proof of server-enforced approval. |
| Existing ERP | [Ask Directo](https://wiki.directo.ee/et/ask_directo) | Official local read-only MCP; requires local setup and API entitlement, not an instant phone connection. |
| Accounting practice | [Uku](https://getuku.com/mcp/) | Practice tasks, clients, time and billing; broad tool coverage is not identical to a small company's ledger needs. |
| Bank visibility | [LHV](https://lhv.ai/) | Read-only. Business-account entitlement and actual client connection remain untested. |
| Company checks | [Creditinfo](https://creditinfo.ee/en/ai-eng/), [Ärikratt](https://arikratt.ee/en/mcp), [Entity](https://entity.ee/en/lahendused/mcp), [Innovadata](https://innovadata.eu/mcp-server), [Infomasin](https://infomasin.ee/uhenda) | Coverage, freshness, account limits and rights differ. Public data retrieval is not permission to redistribute it. |
| Sales, projects and manufacturing | [Pipedrive](https://www.pipedrive.com/en/features/mcp-server), [Scoro](https://www.scoro.com/mcp/), [Katana](https://support.katanamrp.com/en/articles/15502865-katana-mcp-overview) | Useful when already in the company's stack; avoid requiring software migration simply to obtain an MCP. |
| Recruiting | [Teamdash](https://support.teamdash.com/en/articles/17252537-connect-teamdash-to-your-ai-assistant-mcp) | Read/write tasks and messages; hiring decisions remain human. |
| Delivery visibility | [nShift Track](https://helpcenter.nshift.com/hc/en-us/articles/31057872543900-Track-MCP) | Tracking MCP is read-only. Booking, labels and pickups are separate capabilities. |

## Findings that change the design

**Connection is not permission to act or broker.** For example, [Entity's terms](https://entity.ee/kasutustingimused) restrict key sharing outside the organisation and redistribution. Provider OAuth client rules and permitted usage need checking individually. Connecting a provider directly to the owner's assistant may be simpler than routing its calls through Launchpad. The single Launchpad endpoint can coordinate responsibilities and receive reports without pretending that it already proxies every service.

**Approval must be checked per operation.** Trivis's live MCP page describes selected actions awaiting approval; it does not establish universal approval before every bookkeeping change. Scoro's [detailed tool list](https://support.scoro.com/hc/en-us/articles/47563484102413-Scoro-MCP-server-supported-tools) includes financial writes despite narrower marketing language. Tool annotations and product labels do not enforce our exact-action approval requirement.

**Document search and analytics are different from operating a service.** Wise and Signicat/Dokobit documentation interfaces do not perform banking or signatures. [Cargoson through Weld](https://weld.app/connectors/cargoson/models) queries replicated warehouse data, not live transport bookings. [Fractory MCP](https://fractory.com/fractory-mcp/) is a waitlist announcement. These stay visible without becoming supported workflow promises.

**Local MCP is useful but adds setup friction.** Keep local/community implementations available for technically supported users, while prioritising documented hosted routes for phone-first onboarding. Signing remains an explicit human handoff regardless of whether a service can prepare the signing link.

**Relevant to Estonia is the criterion.** International providers belong where they serve a real Estonian business job. Estonian incorporation alone does not earn a priority listing. Specialist, adjacent and unproven offerings remain separate.

## Method and limits

Three disjoint native Codex research agents covered accounting, banking/company data, and other B2B services. The parent reopened load-bearing primary sources and reconciled misleading cached claims, third-party wrappers, local/remote distinctions and announcements. No independent cross-provider review is claimed. Remaining catalog leads are explicitly identified by `parent_source_reopened: false`; they have not received the same parent spot check.

No authenticated MCP calls, paid API calls, purchases, provider messages, real filings, payments or account changes were performed. Every catalog entry has `runtime_tested: false`. Documentation can become stale, and published capabilities may depend on plans, contracts, regions or administrator approval. “Not located in checked sources” is a bounded search result, not proof that an interface does not exist.

This is a broad catalog, not an exhaustive census. Insurance, utilities, private integrations and niche sector software remain gaps. The follow-up [browser comparison](K-browser-mcp-services.md) adds seven browser provider records; [courier research](L-courier-agent-services.md) adds seven records. The [email/calendar follow-up](M-email-calendar-agent-services.md) adds 21 more integration surfaces, including IMAP routes. The catalog now contains 178 integration records (134 initial sector, 9 supporting, 14 browser/courier follow-up and 21 email/calendar), all documentation-only.

## What to build from this

Give the owner's assistant an assessment framework and practical leverage points; let it make the final business assessment from existing context, with assumptions and gaps visible. Launchpad owns evidence labels and permission enforcement. Start with the company's responsibilities and existing services. For each responsibility record the applicable workflow, source, available route, limits, owner decisions and evidence needed for completion. Promote catalog entries to supported routes only after testing authentication, tenant separation, read/write behavior, approval enforcement, revocation, retries and honest failure states.

Keep all unsupported responsibilities visible. The aim is complete accounting for the company's non-core work, not a perfect percentage obtained by excluding difficult jobs. The companion should show what needs the owner and what is dependable, while the owner's assistant remains the working interface. See the [progress reporting design](../design/assistant-progress-reporting.md).
