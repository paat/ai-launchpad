# MCP connection storage and publication

Research date: 27 October 2026. Scope: publishing this product's gateway and curating third-party MCP connections so assistants can find and use them. The chosen direction includes the draft AI Catalog and MCP Server Cards. Publication and deployment are separate steps. Naming update 27 Oct 2026: the user selected the product name AI Launchpad / AI-hüppelaud (repo `paat/ai-launchpad`); the canonical hostname remains undecided (`huppelaud.arikratt.ee` proposed only, not deployed). Earlier undecided-name statements in this research are historical.

Keep one versioned JSON record per connector, generate the discovery documents and client configuration from those records, and expose a small catalogue search tool through the gateway. Publish the gateway in the official MCP Registry and the assistants' own directories when ready. Store customer connection state and credentials separately from the public catalogue.

Sources labelled **B** are official documentation or technical specifications opened during this research. Architecture choices are recommendations, not interoperability claims. **UNKNOWN** means a capability needs a concrete client test or further evidence.

## What effortless connection requires

There are four separate steps: discovering a service, configuring it in the assistant's host, authorizing an account, and discovering its live tools. A readable catalogue can solve the first step for a browsing agent, including one without native support for the catalogue format. It cannot by itself give that agent permission or a host API to install a connector. ChatGPT documents an explicit custom-server creation flow; Claude also has its own connector setup and authentication. **B:** [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), [Claude authentication](https://claude.com/docs/connectors/building/authentication).

Design for the owner to install the gateway once. Later, the assistant can find suitable connections through it. Where the gateway itself brokers an integration, the owner still authorizes that downstream service. Where the assistant already has a native connection, use it when available instead of creating another copy. The gateway cannot assume it can inspect every other connector in the host.

## Public records and private connections

For the initial curated catalogue, JSON files in the repository are sufficient. Validate their shape and generate exports during a build. An operational database can hold customer connection state; a separate search service or vector database is unnecessary for a small, explicitly tagged catalogue.

| Record | Suggested contents | Visibility |
| --- | --- | --- |
| Service identity | Stable identifier, title, description, publisher/source URL, upstream registry identity when present | Public |
| Connection definition | HTTPS endpoint, transport, authentication method, setup documentation, declared required inputs, supported clients with evidence dates | Public |
| Curated suitability | Jobs served, language and jurisdiction, read/write capability, approval behavior, limitations, evidence URL, observation date | Public where based on public evidence |
| Customer connection | Tenant/user, service identifier, secret reference, granted scopes, expiry/revocation state, last successful check | Private |
| Credential | OAuth refresh/access tokens or service-specific API key | Secret storage only |

Preserve upstream metadata and record our assessment separately. A publisher's declaration is different from a successful compatibility test. Use states such as documented, tested, unsupported and unknown; do not mark every listed service as working.

The MCP Registry's `server.json` format already describes names, versions, remote URLs and required configuration inputs. Use those fields where they fit rather than inventing incompatible equivalents. Its official publication format preserves custom metadata only under `_meta["io.modelcontextprotocol.registry/publisher-provided"]`, with a 4 KB limit. Keep larger curation evidence in our own catalogue. **B:** [server.json specification](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/generic-server-json.md), [registry requirements](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md).

## Adopt AI Catalog and MCP Server Cards

The Server Card repository explicitly calls this an experimental extension, not an accepted official MCP extension. We will adopt the draft deliberately and keep its schema revision pinned. Reading JSON does not require native host adoption; automatic installation still depends on the host. **B:** [Server Card status and scope](https://github.com/modelcontextprotocol/ext-server-card/blob/526201bbc80231daa40ffcdecfc9da4e54e5dc93/README.md).

Recommended publication paths on the eventual product origin:

| Path | Purpose |
| --- | --- |
| `/.well-known/ai-catalog.json` | Public discovery index |
| `/mcp/server-card` | Gateway identity and remote connection details |
| `/mcp` | Actual Streamable HTTP MCP endpoint |
| `/catalog/` | Human-readable curated connector catalogue |
| `/docs/connect` | Clear installation instructions, catalogue/card links and host-specific configuration |

The draft discovery mechanism finds a domain's AI Catalog, selects entries with type `application/mcp-server-card+json`, and follows each entry's URL or reads its inline data. A Server Card describes remote connectivity and identity; live `tools/list`, resources and prompts remain protocol operations. Cards are advisory metadata, not access-control authority. **B:** [draft discovery specification](https://github.com/modelcontextprotocol/ext-server-card/blob/526201bbc80231daa40ffcdecfc9da4e54e5dc93/docs/discovery.md).

Illustrative catalogue, using a reserved example domain:

```json
{
  "specVersion": "1.0",
  "entries": [
    {
      "identifier": "urn:air:example.com:mcp:business-gateway",
      "type": "application/mcp-server-card+json",
      "url": "https://example.com/mcp/server-card",
      "tags": ["estonia", "business-administration"]
    }
  ]
}
```

Illustrative Server Card:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
  "name": "com.example/business-gateway",
  "title": "Business Gateway",
  "description": "Estonian business obligations and approved workflows for your existing AI assistant.",
  "version": "0.1.0",
  "websiteUrl": "https://example.com/docs/connect",
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://example.com/mcp"
    }
  ]
}
```

These are design examples, not live service declarations. Set protocol-version claims only after the gateway supports and tests them. The `$schema` identifier above is required by the inspected draft shape; validate against the pinned schema source rather than assuming that the future static schema endpoint is deployed. **B:** [inspected Server Card schema](https://github.com/modelcontextprotocol/ext-server-card/blob/526201bbc80231daa40ffcdecfc9da4e54e5dc93/schema.json).

Generate the registry manifest separately: its schema and the Server Card schema have different purposes. Do not simply rename one to the other. Serve public discovery JSON over HTTPS, with appropriate media types, ETag/cache headers and public read CORS. Link it from normal documentation so agents need not guess its location.

For third-party entries, preserve publisher-authorized identifiers and link upstream cards when available. A catalogue operator is not automatically a publisher. If we assign an identifier to an independently curated service without delegation, use an identifier under our own control, such as an HTTPS catalogue ID, rather than inventing an upstream `urn:air`. Record provenance for any card we synthesize from public documentation. **B:** [AI Catalog projection rules](https://github.com/Agent-Card/ai-catalog/blob/9316f00de22f8baf0a7bb526cf92e27a40ca047e/specification/ai-catalog.md#catalog-projection).

## Publish through several channels

| Channel | Role | Recommendation |
| --- | --- | --- |
| Own AI Catalog and cards | Direct machine discovery and links agents can read | Include in the first implementation |
| Official MCP Registry | Standard server metadata distributed to downstream catalogues | Publish the gateway's manifest when its endpoint is ready |
| Claude directory | Discovery and connection inside Claude | Submit a remote connector; add a plugin if skills help onboarding |
| ChatGPT and Codex plugin directory | Host-native discovery and installation | Package the gateway with a focused onboarding skill |
| Product documentation | Works with browsing agents and manual setup | Provide explicit endpoint, auth flow and tested client instructions |
| Editor installation links | Reduces developer setup effort | Generate only supported host-specific links |

The official MCP Registry is primarily upstream infrastructure for aggregators. It does not guarantee host installation or directory approval, and its documentation gives no uptime or durability guarantee. Keep our own records and cached upstream metadata; do not require a live registry request to execute a business task. If the catalogue later becomes a larger directory, consider its standard subregistry API. **B:** [registry architecture](https://modelcontextprotocol.io/registry/about), [aggregator guidance](https://modelcontextprotocol.io/registry/registry-aggregators).

Claude's connector portal accepts remote HTTPS servers and requires suitable tool metadata, authentication, documentation and testing. OpenAI's current plugin packaging supports root `plugin.json`, `mcp.json` and optional skills; public plugins share a directory across ChatGPT and Codex. Neither is equivalent to publishing a registry record. **B:** [Claude submission](https://claude.com/docs/connectors/building/submission), [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins).

VS Code explicitly documents a `vscode:mcp/install` URL handler. Treat installation links as host-specific integrations, not a universal MCP link scheme. **B:** [VS Code installation URLs](https://code.visualstudio.com/api/extension-guides/ai/mcp#create-an-mcp-installation-url).

## Make authorization discoverable

For the shared gateway, prefer OAuth with authorization-code flow and PKCE. Publish protected-resource metadata and authorization-server discovery metadata. Both ChatGPT and Claude support Client ID Metadata Documents (CIMD); this avoids requiring each owner to register an OAuth client manually. Add DCR compatibility when target-client testing requires it. Claude specifically requires `client_id_metadata_document_supported: true` and `none` among token endpoint authentication methods to choose CIMD. **B:** [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Claude CIMD requirements](https://claude.com/docs/connectors/building/authentication#dcr-and-cimd-details).

Public catalogue search can work without a customer credential. Protected operations must validate the user, tenant and scopes. Gateway tokens and downstream service tokens have different audiences; obtain downstream authorization separately rather than forwarding the host's gateway token. **B:** [MCP token handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#token-handling).

Connection consent and action approval are distinct. Connecting accounting software must not approve an invoice posting, filing, signature or payment. The product's exact-action approval and prohibited-automation rules remain in force.

## How an agent should find the right connection

Recommended initial gateway tools:

- `find_connections`: search by the owner's intended job, service and jurisdiction; return a small ranked set with evidence and known limitations.
- `get_connection_setup`: return endpoint, authentication requirements and instructions for the selected host, without credentials.
- `get_connection_status`: report only customer connections the gateway can actually observe, including missing authorization and expired credentials.

Keep the first business workflows as explicit, well-described tools with JSON input/output schemas. Avoid making every operation an opaque `execute_anything` call. Live tool schemas and meaningful descriptions help models select the appropriate operation; catalogue descriptions alone are not the live tool contract. **B:** [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

With a small curated catalogue, use tags, job mappings and ordinary text search. Add embeddings only if measured retrieval failures justify them. When the catalogue expands, load details for selected services instead of placing all tool definitions in every prompt.

## Initial acceptance criteria

1. A browsing agent given only the product homepage can find the catalogue, read a card and identify the MCP endpoint and setup instructions.
2. Generated catalogue, card, registry manifest and client snippets agree on identity, version and URL and pass their respective schema checks.
3. A new supported host can connect, complete authorization and successfully call a read-only tool. An OAuth redirect alone is not a successful connection test.
4. Catalogue search returns suitable services for concrete Estonian business jobs and distinguishes documented support from tested support.
5. Expired authorization and unavailable integrations produce actionable failure states; neither becomes a successful action receipt.
6. Public outputs contain no tokens, customer-specific endpoints, private handoffs or personal business data.

**UNKNOWN:** native AI Catalog adoption in each target assistant, current account-level connector eligibility, downstream accounting-provider approval semantics, and the final product name/hosting origin. Recommended defaults: link discovery documents explicitly, retain ordinary host setup, start with read-only tasks, and confirm compatibility through real tool calls before advertising it.
