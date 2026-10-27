# Email, calendars and booking services

Documentation research, 27 October 2026. This supplements the initial Estonian-business catalog, which did not adequately cover mainstream email/calendar providers. Three disjoint investigations covered workspace providers, local mail hosting and connection/booking services. No mailbox, calendar or customer data was accessed; no accounts, messages, invitations or appointments were created. No connection was runtime-tested.

## What matters for Launchpad

Start with the mailbox and calendar the business already uses. The owner's assistant assesses the highest-value next improvement from existing context: finding unanswered customers, preparing replies, collecting invoice attachments, arranging meetings or dealing with scheduling conflicts. Do not recommend changing providers just to obtain an MCP endpoint.

Separate three kinds of service:

- **Mailbox/calendar providers:** where the existing business data lives.
- **Connection services and MCP implementations:** how an assistant accesses that data, possibly through another processor or a local process.
- **Booking tools and agent inboxes:** useful additional services, but neither automatically replaces access to the owner's mailbox/calendar.

An assistant's existing native connection may be sufficient. An API, standard protocol or advertised MCP is a discovery lead until the actual host, authentication, account entitlement and operation have been tested. A provider being international does not reduce its relevance to an Estonian business already using it.

## IMAP is a first-class route

Include providers supporting **IMAP**, even where they have no native MCP. Catalogue an existing reusable IMAP-to-agent connector separately from the mailbox host. Pair it with SMTP/message-submission support where sending is needed; calendar access requires its own documented interface such as CalDAV or a provider API. Do not infer calendar access from IMAP, or mail-message access from a hosting control-panel API.

IMAP is not inherently read-only. It supports mailbox mutations; ordinary message-body fetches may also mark messages as seen. The protocol documents read-only mailbox examination and fetches that avoid that side effect. A connector must enforce the permitted operation set and use the appropriate read-only behavior; a prompt alone is not a permission boundary. Do not assume the mailbox implements the latest protocol revision. [IMAP specification, RFC 9051](https://www.rfc-editor.org/rfc/rfc9051.html).

Documented existing-mailbox routes include [Zone](https://www.zone.ee/help/kb/e-posti-serverid/), [Veebimajutus](https://www.veebimajutus.ee/klienditugi/kkk/mis-sissetuleva-e-posti-serveri-aadress), Telia hosting, Google, Microsoft, Zoho, Fastmail and iCloud. Proton requires its local paid desktop Bridge. Their authentication and calendar capabilities differ; full qualifiers are in the inventory below.

Reusable connection candidates include [Nylas](https://developer.nylas.com/docs/dev-guide/mcp/) and [EmailEngine](https://learn.emailengine.app/docs/mcp). Nylas is hosted; EmailEngine is paid, self-hosted and its operational MCP is beta. EmailEngine documents account-bound read-only grants; its public documentation MCP is a different endpoint. Neither generic IMAP support nor a provider marketing page establishes that a particular local mailbox/client combination has been tested.

For each connection distinguish:

| Capability | What needs checking |
|---|---|
| Search/read messages and attachments | Folder/account scope, message exposure to model/provider, read-status side effects |
| Prepare a draft | Local draft versus draft saved in the mailbox; a saved draft is a write |
| Send/reply/forward | Exact recipients, content and attachments; approval separate from read access |
| Move/archive/delete or change flags | Explicit mailbox mutation permission; deletion/recovery semantics |
| Read availability | Free/busy access versus full event descriptions/attendees |
| Create/change/cancel an event | Whether attendees are notified; recurrence, time zones and organiser rights |
| Run recurring checks | Actual executor, credential lifetime, next check, failure notification and recovery |

These are proposed qualification checks, not claims that every provider exposes every operation. Prefer restricted OAuth grants when the supported route offers them. Where a provider requires an app password or broad mailbox credential, disclose that scope and keep credentials out of model context, reports and public catalog records. A local bridge/process adds a running-computer dependency; a cloud connector adds a data-processing destination. Neither should be hidden behind “Connected.”

## Assessment and transparency

The assessment framework should establish the existing service, desired job, personal/shared/delegated mailbox needs, required calendar behavior, current permissions and what is still unknown. Ask the owner only for missing context. The agent recommends one useful next step; the server records permission/evidence facts and makes no claim to inspect another connector's private state.

Treat email text and attachments as untrusted business content, not authority to change permissions or send messages. For direct assistant-to-provider routes, Launchpad cannot guarantee pre-action approval merely by receiving a later progress report. Only claim approval enforcement on a controlled route or a demonstrated downstream mechanism.

Progress reporting needs task/status/receipt references, not complete mail threads, calendar descriptions or attachments. Disclose each processor in the actual route. “Local IMAP” does not mean contents stay local if the assistant sends them to a remote model.

## Provider and connection inventory

This pass adds 21 integration surfaces. The [canonical JSON/CSV catalog](catalog/README.md) retains full connection, access, evidence and source details. Parent reopened load-bearing Google, Microsoft, Fastmail, Zone, Veebimajutus, Nylas and EmailEngine sources; remaining records are researcher-sourced documentation leads. None is runtime-tested.

| Service | Documented route | Important limit |
|---|---|---|
| [Google Workspace Gmail MCP and mail protocols](https://developers.google.com/workspace/guides/configure-mcp-servers) | Official hosted MCP — Developer Preview; established API/protocol alternatives are separate | MCP requires Developer Preview access and OAuth/Cloud setup. Do not equate draft-focused tool surface with credential incapable of sending. Restricted Gmail scopes can require verification/security assessment. No exact-action approval guarantee established. |
| [Google Calendar MCP and REST API](https://developers.google.com/workspace/guides/configure-mcp-servers) | Official hosted MCP — Developer Preview; established API/protocol alternatives are separate | MCP requires Developer Preview access and OAuth/Cloud setup. Configuration guide lists read-only/free-busy Calendar scopes while tool catalog includes writes: do not assume those scopes authorize mutations. Event creation may send invitations; exact-action approval not established. |
| [Microsoft 365 Work IQ MCP](https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview) | hosted_mcp | Legacy Agent 365 Mail/Calendar MCP servers are not recommended for new production. Discover supported resource schemas and tenant policy; GA is not proof every client/action works. No per-send approval guarantee established. |
| [Microsoft 365 / Outlook Graph and IMAP/SMTP](https://learn.microsoft.com/en-us/graph/permissions-reference) | Microsoft Graph API; separate OAuth IMAP/SMTP route | Choose Graph if SMTP AUTH unavailable; do not weaken tenant security defaults for integration. Calendar writes may notify attendees. Client and tenant compatibility untested. |
| [Zoho Mail MCP, API and IMAP/SMTP](https://www.zoho.com/mail/help/mcp/getting-started.html) | hosted_mcp | OAuth consent is not per-action send approval. Select correct datacentre; do not infer MCP free-tier availability implies free-tier IMAP access. |
| [Zoho Calendar MCP and REST API](https://www.zoho.com/calendar/help/mcp/getting-started.html) | hosted_mcp | Calendar mutations and notification configuration can affect other people. No exact-invitation approval guarantee established. |
| [Fastmail official MCP, JMAP and mail/calendar protocols](https://www.fastmail.help/hc/en-us/articles/15869557281295-Connecting-AI-tools-via-Fastmail-s-MCP-server) | hosted_mcp | MCP does not currently support attachments according to help page. Calendar JMAP not yet supported per developer page. External AI vendor receives retrieved content; no exact-action approval guarantee established. |
| [Proton Mail Bridge and SMTP](https://proton.me/support/imap-smtp-and-pop3-setup) | standard_protocol_local_bridge | Bridge decrypts/encrypts locally. An AI reading plaintext through Bridge gains plaintext; encryption is not an external-agent approval gate. No calendar bridge implied. |
| [Proton Calendar sharing/subscription boundary](https://proton.me/support/subscribe-to-external-calendar) | limited_calendar_sharing | No CalDAV means do not sell a standard two-way CalDAV integration. Read-only subscriptions cannot create/respond/delete events. Mail Bridge does not solve calendar writes. |
| [Apple iCloud Mail and Calendar third-party access](https://support.apple.com/en-us/102525) | standard_protocol | No official first-party MCP located in checked sources. Do not equate supported app authorization with open universal OAuth registration. Calendar endpoint/discovery and agent compatibility remain unverified. |
| [Zone email and ZoneCloud calendar](https://www.zone.ee/help/kb/e-posti-serverid/) | IMAP + SMTP; CalDAV/CardDAV explicitly documented | No provider-native email MCP located. Standard protocols require a compatible assistant connector/bridge. Do not confuse hosting API key with mailbox credentials. CalDAV support documented, endpoint discovery/auth not tested. |
| [Veebimajutus.ee email / OX Mail](https://www.veebimajutus.ee/klienditugi/kkk/mis-sissetuleva-e-posti-serveri-aadress) | IMAP + SMTP; web calendar import/export, CalDAV unknown | No native MCP located. OX calendar/webmail does not prove CalDAV access. Phone email app setup documented, but assistant connection still needs a compatible protocol connector. |
| [Telia Estonia hosting email](https://www.telia.ee/ari/it-teenused/veeb-ja-e-post/domeen-e-post-ja-kodulehe-majutus) | IMAP + SMTP; separate from Telia Exchange and Microsoft 365 | No native email MCP located. Do not apply Microsoft365/Exchange calendar capabilities to this product. Provider docs establish ports, not compatibility with any particular assistant. |
| [Telia Estonia Exchange email and groupware](https://www.telia.ee/ari/it-teenused/exchange-e-post-ja-grupitoo/) | Hosted Exchange service; Basic explicitly IMAP/POP3 mail-only sync; other calendar integration details unconfirmed | Do not assume Graph, Exchange Online or CalDAV merely from Exchange branding. No native MCP located. Endpoint and account-policy validation needed before promoting route. |
| [Elisa Estonia Microsoft 365 email and calendar](https://www.elisa.ee/et/ariklient/it-teenused/kontor/microsoft-365) | Local Microsoft365 reseller/managed setup; Microsoft mailbox/calendar route, not Elisa-native MCP | Do not reuse Elisa Finland kolumbus.fi settings for Estonian customers. Legacy smtp.elisa.ee Internet relay references do not establish hosted mailbox or calendar access. Native Elisa MCP not located. |
| [Calendly](https://developer.calendly.com/docs/mcp/calendly-mcp-server) | Official hosted scheduling MCP; not a general mailbox connector | DCR-capable client required. Scheduling account authorization is not blanket permission to inspect owner's email. Per-action approval enforcement and notification behavior not tested. |
| [Cal.com](https://cal.com/docs/mcp-server) | Official hosted MCP plus documented self-hosted/local option | Broad default tool surface. URL toolsets can reduce exposed categories but must not be equated to narrower OAuth grants. No general email inbox API implied; booking notifications are sends, not merely data reads. |
| [Nylas](https://developer.nylas.com/docs/dev-guide/mcp/) | Official cross-provider hosted MCP; existing mailbox/calendar grants, plus separate agent-account product | IMAP connections provide email only, not calendars—even if the same provider also offers calendars. Two-step hash generation is not independently proven human approval. Region selection concerns Nylas storage/route, not a guarantee all downstream model/provider data stays in EU. |
| [Cronofy](https://docs.cronofy.com/developers/mcp-server/) | Official hosted scheduling MCP backed by cross-provider calendar connectivity | Internal app grants access across its organizational unit. Free/Busy access mode hides details yet can still send event invitations/updates. No Access mode still sends invitations and relies on manual availability. Not an email inbox reader. |
| [EmailEngine](https://emailengine.app/) | Official self-hosted operational MCP beta plus REST; public mcp.emailengine.app is documentation-only | Operational MCP beta/off by default; self-hosting maintenance required. No calendar support established. IMAP is mail access, SMTP sends; neither implies calendar availability. Self-hosting does not prevent selected model from receiving read mail content. |
| [AgentMail](https://docs.agentmail.to/integrations/mcp) | Official hosted MCP for dedicated AgentMail inboxes/calendars; not ordinary owner-mailbox synchronization | New agent mailbox, not a substitute for reading owner's Gmail/IMAP history. Google Workspace routing doc handles unrecognized addresses; existing recognized user/alias/group addresses stay with Google. Host confirmation claims are not proof server-enforced approvals. |

## Evidence and remaining gaps

Public documents establish advertised interfaces only. Administrator settings, shared-mailbox delegation, OAuth application approval, provider terms, connection limits and phone-client behavior remain deployment-specific. No full community-wrapper census, provider migration advice or comparison of actual cost/reliability was performed. The catalog must retain these limits rather than promote a documented endpoint into a supported workflow.
