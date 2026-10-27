| Condition | Status | Evidence as of 26 October 2026 | Source URL |
|---|---|---|---|
| Muse is a real consumer agent product | met | Launched 8 September 2026, initially powered by Muse Spark. | [Meta launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) |
| An entrepreneur located in Estonia can use Muse | **not met** | Current business FAQ specifies US and Canada, age 18+, with no further rollout date. | [Muse availability FAQ](https://muse.ai/business) |
| Meta AI remains available separately | met | Estonia’s App Store still lists **Meta AI**, with a different application ID from Muse. | [Estonian Meta AI listing](https://apps.apple.com/ee/app/meta-ai/id1558240027) |
| The harness can connect through documented consumer MCP onboarding | unknown | Custom connectors are documented; arbitrary MCP URL setup and its authentication contract are not established by the consumer documentation. | [Connector help](https://www.meta.com/help/superintelligence/1687253048996149/) |
| Third-party integration and catalog distribution exist | met | Connector platform accepts submissions; its terms explicitly include MCP servers, APIs, actions and plugins. | [Platform](https://platform.muse.ai/), [terms](https://platform.muse.ai/terms) |
| Commercial workflows are an intended use | met | Meta explicitly offers Muse for Small Business, including financial analysis and business connectors. | [Business announcement](https://about.fb.com/news/2026/09/introducing-muse-small-business/) |
| Estonian/Russian language suitability is established | unknown | Neither appears in the published iOS language lists; conversation quality remains untested. | [Muse listing](https://apps.apple.com/us/app/muse-from-meta/id6760173601) |
| Approvals, documents, memory and reminders support administrative work | partly | Capabilities exist, but approvals are configurable and reminder delivery is qualified. | [Getting started](https://www.meta.com/help/superintelligence/1331373868832401/), [connector controls](https://www.meta.com/help/superintelligence/1687253048996149/) |
| EU bookkeeping data has an established contractual protection framework | unknown | No consumer processor agreement or EU residency commitment was confirmed; connector terms designate independent controllers. | [Connector terms](https://platform.muse.ai/terms) |

## Integration paths for the harness

**Recommendation: retain MCP as the core and make Muse a conditional integration.** Its documented geographic restriction currently prevents ordinary onboarding for an Estonia-based user. An Estonian company’s owner located in an eligible country is a different case: eligibility follows the user’s location requirements, not simply the company’s incorporation. [Eligibility requirements](https://www.meta.com/help/subscriptions/1021145227643680/)

1. **Ship the existing remote MCP gateway through Claude and ChatGPT first.**  
   Build the planned streamable HTTP/OAuth gateway, clear tool descriptions, scoped permissions and an onboarding guide for each client. Both document custom MCP connections; neither requires catalog publication for the basic custom-connection route. See the comparison below. [Claude setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [ChatGPT setup](https://developers.openai.com/plugins/deploy/connect-chatgpt)

2. **Pilot Muse’s generated custom connector after eligibility is satisfied.**  
   Meta documents asking Muse to create a connector from a service’s API; its engineering explanation also permits CLIs. Recommended harness work: retain MCP, expose a small REST API if testing shows it necessary, and publish OpenAPI documentation, authentication instructions and examples. **OpenAPI is a proposed convenience, not a confirmed Meta requirement.** First test the existing MCP endpoint before building another interface. [Connector help](https://www.meta.com/help/superintelligence/1687253048996149/), [Meta engineering explanation](https://security.muse.ai/)

3. **Pursue the connector catalog for repeatable onboarding.**  
   Build a reviewable integration, product description, privacy notice, support contact, permission explanations and test account. Meta describes functional, security, legal and end-to-end review before directory listing. Whether the harness’s existing MCP implementation needs an adapter remains **UNVERIFIED** until the submission documentation is accessible. [Connector platform](https://platform.muse.ai/)

4. **Offer Muse Code as a technical-user option.**  
   Its documented `mcp_servers` configuration supports `streamable_http`, URL/headers and OAuth 2.1 through `muse mcp login`. This closely matches the proposed gateway and should require no OpenAPI layer. It is a separate terminal product; consumer-app access, pricing and geographic eligibility must not be inferred from it. [Muse Code documentation](https://dev.meta.ai/docs/muse-code/extending)

5. **Keep browser operation as a fallback.**  
   Muse can navigate websites and forms. A conventional harness web interface could therefore expose records and approval screens, but this route needs separate authentication and reliability testing. I would reserve it for unsupported services and keep filing/payment execution behind the harness’s own explicit approval. [Muse product design](https://introducing.muse.ai/)

Across these paths, implement approval as a server-enforced operation tied to the exact recipient, amount, document and expiry. Treat conversational instructions and client confirmation prompts as additional safeguards.

## Blockers

### 1. Product identity and Estonian availability

**“Muse, formerly Meta AI” is misleading. Both products currently exist.** Muse launched as the personal agent; Meta AI remains the assistant and glasses companion. Their Apple IDs are respectively `6760173601` and `1558240027`. [Muse listing](https://apps.apple.com/us/app/muse-from-meta/id6760173601), [Meta AI Estonia listing](https://apps.apple.com/ee/app/meta-ai/id1558240027)

The September launch’s Muse Spark claim is confirmed. However, Meta announced Muse Wonder on 12 October, initially through developer products, with consumer Muse deployment described as forthcoming. A particular consumer account’s current model is therefore **UNVERIFIED**. [Launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [Wonder announcement](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/)

Availability findings:

- **Muse:** documented on iOS, Android and web; its current landing page also names Mac and WhatsApp. The business FAQ limits availability to US/Canada. Native Windows availability and a Muse conversational interface inside Messenger/Instagram are **UNVERIFIED**; connecting Instagram data is a different capability. [Launch](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [current landing page](https://muse.ai/?return_to=%2Fplatform%2Fdocs), [regional FAQ](https://muse.ai/business)
- **Meta AI:** the Estonian Apple storefront listing was readable. Meta documents European rollout through WhatsApp, Messenger, Instagram and Facebook, while its product pages also describe web, mobile and Mac access. Exact feature activation for an Estonian account remains untested. [Estonian listing](https://apps.apple.com/ee/app/meta-ai/id1558240027), [European rollout](https://about.fb.com/news/2025/03/europe-meet-your-newest-assistant-meta-ai/), [product FAQ](https://ai.meta.com/meta-ai/)
- **Storefront limitation:** the [Estonian Muse Apple URL](https://apps.apple.com/ee/app/muse-from-meta/id6760173601) and Estonia-parameterized Google Play pages for [Muse](https://play.google.com/store/apps/details?id=com.facebook.aura&hl=en&gl=EE) and [Meta AI](https://play.google.com/store/apps/details?id=com.facebook.stella&hl=en&gl=EE) could not be retrieved. This is an inspection failure, not proof of store unavailability.

There is no confirmed current EU feature matrix for Muse because the documented consumer rollout excludes the EU. Claims that **DMA, GDPR or the AI Act specifically prohibit Muse connectors, memory or agent actions are UNVERIFIED**. Meta’s 2025 European assistant launch mentioned regulatory complexity, but that does not establish the cause of Muse’s 2026 regional restriction. Nor should the initial text-chat rollout be treated as today’s permanent image-feature limit. [2025 announcement](https://about.fb.com/news/2025/03/europe-meet-your-newest-assistant-meta-ai/), [current image product page](https://ai.meta.com/meta-ai/media-generation/)

### 2. Language and administrative accuracy

Neither **Estonian nor Russian** appears among the 39 languages listed for either iOS app. That establishes a localization gap in the published metadata; it does not establish that the underlying model cannot converse in those languages. [Muse languages](https://apps.apple.com/us/app/muse-from-meta/id6760173601), [Meta AI languages](https://apps.apple.com/ee/app/meta-ai/id1558240027)

Reliable Estonian/Russian conversation support, speech recognition and bookkeeping quality are **UNVERIFIED**. No primary-source evaluation specific to Estonian invoices, tax terminology or register workflows was found. Product-level document-understanding claims are insufficient evidence of correct extraction or accounting treatment. [Document capability documentation](https://www.meta.com/help/superintelligence/1331373868832401/)

### 3. Connector coverage and the missing technical contract

Meta’s confirmed business lineup includes **Asana, Box, Canva, Dropbox, Figma, Granola, HighLevel, Intuit QuickBooks, Klaviyo, Lovable, Notion, Shopify, Slack, Stripe and Zoom**, plus Facebook Pages, Instagram professional accounts and Meta ad accounts. The complete account-specific list is in app settings. [Business announcement](https://about.fb.com/news/2026/09/introducing-muse-small-business/)

Gmail is explicitly documented. Calendar connectivity is also documented, but the reviewed public help page does not enumerate providers. Outlook, Google Calendar and Plaid appeared in secondary leads attributed to a launch post that could not be opened; those specific catalog entries remain **UNVERIFIED in this report**. QuickBooks supplies confirmed accounting coverage; no Estonian accounting service, bank, e-MTA or business-register connector was confirmed. [Connector help](https://www.meta.com/help/superintelligence/1687253048996149/), [Meta business list](https://muse.ai/business)

The extensibility claims resolve as follows:

| Claim | Finding |
|---|---|
| Curated connector catalog | Confirmed, including a submission program. |
| Custom connectors generated from APIs | Confirmed; Meta also describes CLI-based generation. |
| Consumer app has no custom MCP setting | **UNVERIFIED.** Public documentation does not establish this negative claim. |
| Consumer custom connectors require OpenAPI | **UNVERIFIED.** No required schema/version was found. |
| OAuth 2.0/API-key onboarding specification | **UNVERIFIED** for generated consumer connectors; the security architecture handles OAuth tokens and API credentials. |
| Generated connectors are shareable | **UNVERIFIED.** Do not equate creating one privately with approved catalog distribution. |
| Muse Code supports remote MCP/OAuth 2.1 | Confirmed explicitly. |

Sources: [consumer connectors](https://www.meta.com/help/superintelligence/1687253048996149/), [security architecture](https://security.muse.ai/), [platform terms](https://platform.muse.ai/terms), [Muse Code](https://dev.meta.ai/docs/muse-code/extending).

Developer obligations include accurate functionality, maintenance/support, a public privacy notice, restricted data use, deletion obligations and incident notification to Meta within 48 hours. The terms cover actions, plugins and MCP servers, but that legal breadth does not itself document a consumer installation flow. [Connector terms](https://platform.muse.ai/terms)

Meta also supplies MCP-related developer tooling such as **Meta XR Operator**, for controlling/testing VR applications. That is not an administrative connector for the harness. A Meta-operated generic accounting/banking MCP service remains **UNVERIFIED**. [Official XR tooling](https://developers.meta.com/vr/downloads/package/meta-xr-operator-standalone/)

### 4. Capabilities exist, but operational guarantees remain incomplete

Muse documents file upload and reading, summarizing, editing or producing PDFs, spreadsheets, documents and images. This supports a receipt/invoice pilot, although extraction accuracy and file limits need testing. Side chats organize topics, while Muse remains aware across them; they should not be treated as isolated business workspaces. [Getting started](https://www.meta.com/help/superintelligence/1331373868832401/)

Persistent memory, editable personality/boundary files, goals, reminders and scheduled tasks are documented. These supply much of the requested custom-instruction and project functionality. [Data and identity controls](https://www.meta.com/help/superintelligence/2225571704857152/)

Muse has a cloud browser and continues working while the app is closed. Its security design includes a separate approval authority and user takeover. This is cloud browser operation; local desktop control is **UNVERIFIED**. [Product design](https://introducing.muse.ai/), [security design](https://security.muse.ai/)

Voice information is included in Muse’s documented interactions, but live voice-call functionality and Estonian/Russian voice support remain **UNVERIFIED**. Meta AI separately advertises voice conversations in 13 languages. Cross-device continuity is consistent with Muse’s shared cloud VM architecture, but synchronized approval handling requires testing. [Muse data controls](https://www.meta.com/help/superintelligence/2225571704857152/), [Meta AI listing](https://apps.apple.com/ee/app/meta-ai/id1558240027), [VM architecture](https://security.muse.ai/)

### 5. Business terms, workspace and price

Business use is clearly intended by Meta’s own offering. However, the [consumer Supplemental Terms](https://muse.ai/terms) returned a login wall, so a clause-level conclusion about commercial-use permissions, prohibited financial activities and liability is **UNVERIFIED**.

Muse for Small Business is described as skills and connectors inside Muse. Meta’s separate Enterprise Platform announcement is not evidence that an Estonia-ready managed workspace, processor contract or Business Suite/WhatsApp Business entitlement is already purchasable. Those provisions remain **UNVERIFIED**. [Business announcement](https://about.fb.com/news/2026/09/introducing-muse-small-business/), [Enterprise Platform announcement](https://about.fb.com/news/2026/09/launching-meta-enterprise-platform/)

Published Muse plans are **free with a usage limit**, **Power: $20/month, 500 million Muse tokens/week**, and **Maximum: $100/month, 3 billion Muse tokens/week**. Meta qualifies benefits by region/account. The free allowance, Estonian euro pricing and enterprise service commitments were not established. [Subscription help](https://www.meta.com/help/subscriptions/1021145227643680/)

### 6. EU business data protection

**Separate Meta AI’s EU rules from Muse’s current rules.**

For **Meta AI**, Meta’s April 2025 notice—updated March 2026—states that adult public content and AI interactions can be used for training, with an objection mechanism. Ordinary private messages are excluded unless someone shares them with AI. The Irish DPC describes legitimate-interest assessments, objection safeguards and continuing supervision; it does not give blanket approval for every business disclosure to AI. [Meta EU notice](https://about.fb.com/news/2025/04/making-ai-work-harder-for-europeans/), [DPC statement](https://www.dataprotection.ie/en/news-media/latest-news/dpc-statement-meta-ai)

Meta’s general announcement introduced AI-interaction-based advertising personalization from December 2025 in “most regions.” The exact current EU exclusion could not be confirmed from the accessible primary text: **UNVERIFIED**. Do not infer either universal EU inclusion or permanent exclusion. [Advertising announcement](https://about.fb.com/news/2025/10/improving-your-recommendations-apps-ai-meta/)

For **Muse**, training is enabled initially and can be disabled under **Settings → Data controls → Help improve our AI models**. Task-used connector information forms part of interactions; the opt-out therefore matters beyond typed chats. Meta says changing the setting also applies to previous interactions. [Muse data controls](https://www.meta.com/help/superintelligence/2225571704857152/)

Muse promises not to share conversations or VM data with Meta advertising systems. External browsing/purchases can nevertheless influence advertising indirectly. The security paper describes training trajectories containing tool calls and says the current VM does not technically prevent Meta access; Confidential VM was still described as forthcoming. Its general availability is **UNVERIFIED**. [Security and data explanation](https://security.muse.ai/)

The contractual problem is substantial: Muse’s connector terms call Meta and the developer **independent controllers**. The incorporated document named “DPA” is therefore not evidence of an Article 28 processor arrangement for the OÜ’s consumer usage. No applicable consumer processor agreement, EU-only storage/inference commitment or fixed backup/log purge period was confirmed. [Connector terms](https://platform.muse.ai/terms)

Disconnecting a connector can leave information in memories/history. Deletion, forgetting, export and reset controls exist, but a defined complete-erasure deadline was not established. [Connector retention](https://www.meta.com/help/superintelligence/1687253048996149/), [data controls](https://www.meta.com/help/superintelligence/2225571704857152/)

**Assessment:** GDPR compliance is not inherently impossible, but the evidence does not support approving unrestricted bookkeeping-data flow today. The OÜ must establish the actual controller/processor roles, lawful disclosure basis, transparency, minimization, retention, rights handling, security and international-transfer safeguards. Where processing is on its behalf, Article 28 requirements apply; independent-controller sharing needs its own justification. The EDPB requires case-specific analysis. [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679), [EDPB guidance](https://www.edpb.europa.eu/news/edpb-opinion-on-ai-models-gdpr-principles-support-responsible-ai_en)

A sensible initial scope is synthetic data, genuinely anonymous aggregates and carefully selected non-personal company information, with source documents retained in the accounting system.

### Comparison: custom remote MCP in the EU

**Claude:** Estonia is supported. Custom remote MCP works across web, desktop and mobile; Free permits one custom connector, with broader paid-plan support and OAuth setup. The existing gateway is a direct fit, subject to authorization testing. [Countries](https://support.claude.com/en/articles/8461763-where-can-i-access-claude), [custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

**ChatGPT:** Estonia is supported. Current documentation provides **Plugins → Add custom MCP server**, including streamable HTTP and authentication; plugins operate across web, desktop and mobile, subject to account/workspace controls. This is a documented route for the gateway. [Countries](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries), [setup](https://developers.openai.com/plugins/deploy/connect-chatgpt), [supported surfaces](https://learn.chatgpt.com/docs/enterprise/apps-and-connectors)

**Gemini:** Custom MCP now exists: configure its URL on the web, then use it on web/mobile. However, current requirements specify **US, English, personal Google account, age 18+, Keep Activity enabled**; this does not presently meet the Estonian consumer use case. [Google documentation](https://support.google.com/gemini/answer/17209137?hl=en)

## What to test in the app on day one

Use synthetic records and record client version, account country, plan and test date.

1. **Eligibility:** use an Estonian account and network; distinguish an informational/store page from successful Muse activation.
2. **MCP first:** provide the gateway URL and OAuth instructions. Inspect settings for custom MCP entry. Record discovery, redirects, scopes, token refresh and revocation.
3. **REST fallback:** if MCP fails, ask Muse to generate a connector from the harness’s OpenAPI document. Verify actual requests against server logs.
4. **Language/document accuracy:** test Estonian and Russian prompts with photographed receipts, multi-page PDFs, credit notes, decimal commas and mixed-language invoices.
5. **Approvals:** attempt synthetic filing, payment and email actions. Deny approval, change an amount afterward, replay the request and reconnect from another device. Every unauthorized execution must fail server-side.
6. **Persistence:** create a deadline reminder in `Europe/Tallinn`; close all clients, cross a daylight-saving boundary in test fixtures, and check delivery and duplicate handling.
7. **Privacy/exit:** disable training before connecting; inspect memory, disconnect, delete, export and reset. Check separately whether source credentials and retained data remain.
8. **Contract acceptance:** obtain the actual regional terms, privacy notice, processing roles and transfer/retention commitments before introducing identifiable bookkeeping records.

These tests target documented [connector behavior](https://www.meta.com/help/superintelligence/1687253048996149/), [task/file capabilities](https://www.meta.com/help/superintelligence/1331373868832401/) and [data controls](https://www.meta.com/help/superintelligence/2225571704857152/); they are proposed acceptance tests, not completed results.

## Sources

Primary sources are linked beside their claims. The decisive sources are Meta’s [current business availability FAQ](https://muse.ai/business), [connector documentation](https://www.meta.com/help/superintelligence/1687253048996149/), [developer terms](https://platform.muse.ai/terms), [data controls](https://www.meta.com/help/superintelligence/2225571704857152/) and the [Irish DPC statement](https://www.dataprotection.ie/en/news-media/latest-news/dpc-statement-meta-ai).

Research cutoff: **26 October 2026**. Secondary sources were used as discovery leads. BrowserOS execution was blocked by the session’s approval policy; no authenticated Estonian app test was completed. Consumer terms/privacy pages required login, and specified storefront retrievals failed. These gaps are marked **UNVERIFIED**, rather than treated as proof that a feature or contractual protection does not exist.