# E — Market, competitors, MCP ecosystem, evidence and risks

**Research cut-off: 25 October 2026.** Product capabilities below are documented or advertised, not authenticated acceptance tests. “None found” means no public offering was located; **UNVERIFIED** identifies unresolved availability, pricing or legal detail. Prices are illustrative published plans, with geography and billing conditions where material.

## 1. Evidence of administrative burden

| Evidence | Finding | Interpretation for Ärikratt Harness |
|---|---|---|
| Statistics Estonia, 2025 results published in 2026 | Businesses spent **167,731 hours** supplying statistical data in 2025, down **26%** from **226,987 hours** in 2024. [Statistics Estonia](https://stat.ee/et/uudised/statistikaamet-avaldas-aastaaruande-andmed-millele-tugineb-eesti-tulevik) | Measured burden remains substantial despite digital services. These figures cover statistical reporting across businesses, not total administration or micro-enterprises alone. |
| European Commission, 2026 Estonia country report | Business regulations obstruct investment for **53%** of surveyed Estonian companies and **65%** of micro/small companies. **29%** overall and **52%** of micro/small companies report allocating over **10% of personnel** to regulatory compliance. [Country report](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A52026SC0206) | Strong evidence of disproportionate burden. “Personnel allocated” is not equivalent to working hours lost. The underlying EIB survey methodology excludes firms with fewer than five employees, limiting applicability to solo businesses. [EIB methodology](https://www.eib.org/files/documents/lucalli/20240354_investment_report_2024_data_annex_en.pdf) |
| Commission tax-compliance study, published 2022 | Estimated **€204 billion**, equivalent to **1.9% of turnover**, in aggregate tax-compliance costs across EU28 enterprises using 2019 data. [Study](https://taxation-customs.ec.europa.eu/system/files/2022-12/221208%20DG%20GROW%20report%20-%202022%20Tax%20Compliance%20Costs%20SMEs.pdf) | Historical scale indicator, not a 2026 Estonian market-size estimate. Do not multiply this percentage by Estonian micro-business revenue. |
| Commission SME survey, July 2025 | Nearly **two-thirds** identify regulatory complexity as a growth obstacle. Cross-border obstacles include divergent business environments **33%**, unclear rules **30%**, and taxation **29%**. Research covered over **17,000 firms**, including approximately **13,000 in the EU**. [Commission findings](https://single-market-economy.ec.europa.eu/news/europes-small-and-medium-sized-enterprises-remain-ambitious-continue-face-persistent-hurdles-scaling-2025-07-02_en) | Supports assistance with understanding requirements and assembling evidence, alongside transactional automation. |
| Estonian Chamber of Commerce and Industry | Submitted **70 bureaucracy-reduction proposals** in April 2025, covering reporting, accounting, occupational safety and other requirements. [Chamber proposals](https://www.koda.ee/et/uudised/koda-esitas-valitsusele-70-ettepanekut-burokraatia-vahendamiseks) | Identifies recurring friction, but is an advocacy submission rather than a representative time-use survey. |
| EVEA | Reports **100+ policy submissions during 2025**, including bureaucracy, labour rules, occupational health and grant administration. [EVEA member report](https://evea.ee/evea-aruanne-liikmetele/) | Useful demand-discovery partner. A representative EVEA estimate of monthly administrative hours per micro-enterprise was **UNVERIFIED**. |
| OECD, 2026 synthesis | Explains how fixed compliance costs, fragmented requirements and difficult regulatory language disproportionately burden smaller firms. [OECD analysis](https://www.oecd.org/en/publications/smart-regulations-strong-business_93d38770-en/full-report/diagnostic-drivers-of-regulatory-burden-and-complexity_7296019b.html) | Supports a service that interprets requirements and reuses existing data, rather than merely adding another portal. |

The defensible “most disliked tasks” shortlist is **tax/VAT administration, repeated reporting, obtaining permits, employment compliance, grant paperwork and chasing payments**. However, an Estonia-wide ranked survey of these tasks specifically among businesses with **0–9 employees** was **UNVERIFIED**. These are evidenced problem categories, not a validated ranking.

The market also benefits from government simplification. Statistics Estonia’s reduction demonstrates that removing duplicate reporting can outperform automating it. The Commission’s Estonian real-time-economy project explicitly addresses manual transactions and fragmented services. Harness should consume those improvements, rather than build permanent automation around disappearing forms. [Real-time-economy project](https://reforms-investments.ec.europa.eu/publications-0/supporting-productivity-and-competitiveness-estonian-smes-through-real-time-economy-and-single_en)

## 2. Competing and adjacent products

### International accounting, banking and administration

| Product | Market | What it automates | AI/agent features | API/MCP availability | Published pricing | Gap versus Harness |
|---|---|---|---|---|---|---|
| **QuickBooks / Intuit Assist / Intuit Intelligence** | Primarily supported national accounting markets | Books, invoices, collections, payroll and tax workflows | Accounting, payments and other specialist agents; 2026 Intelligence expansion | Official OAuth-backed [local MCP server](https://github.com/intuit/quickbooks-online-mcp-server); write categories configurable | US Simple Start **$38/month** regular price. [Pricing](https://quickbooks.intuit.com/pricing/) | Strong financial automation; no verified Estonian filing coverage. [2026 capabilities](https://quickbooks.intuit.com/r/product-update/intuit-intelligence-ai-business-tax-2026/) |
| **Xero JAX** | Global accounting, particularly UK/ANZ/US | Reconciliation, invoicing and financial administration | Conversational financial assistant; expanding agent workflows | Official [Xero MCP](https://github.com/XeroAPI/xero-mcp-server), OAuth APIs | US Early **$27/month**, Growing **$59**, Established **$97**. [Pricing](https://www.xero.com/us/pricing-plans/) | Existing ledger ecosystem; Estonian authority orchestration remains a gap. [JAX](https://www.xero.com/media-releases/xeros-ai-financial-superagent-jax-launches-powerful-new-features/) |
| **Sage Copilot** | Country/product-specific SME accounting | Close, reconciliation and financial analysis | Variance explanations, assistance and proactive insights | [Product APIs](https://developer.sage.com/); public official MCP **UNVERIFIED** | Product-specific; comparable Estonia price **UNVERIFIED** | Capabilities depend on Sage product and jurisdiction. [Copilot](https://www.sage.com/en-us/sage-copilot/) |
| **FreshBooks** | Freelancers and service SMEs | Invoices, expenses, time and payments | Claude can analyse business information | Official **read-only** MCP connector; inherits role and can expose multiple associated businesses. [Connector](https://support.freshbooks.com/hc/en-us/articles/47907329443597-How-does-the-FreshBooks-connector-in-Claude-work) | EUR Lite **€16**, Plus **€30**, Premium **€50/month**. [2026 prices](https://www.freshbooks.com/2026-faq-price-change) | Financial reading already commoditised; no verified Estonian compliance execution. |
| **Holded** | Spain-led SME ERP | Accounting, invoicing, CRM, inventory and HR | Agents can read and operate across ERP objects | Official remote [MCP](https://www.holded.com/developers/mcp), OAuth 2.1; analyst/operator/custom scopes | Basic regular **€29/month**, excluding VAT. [Pricing](https://www.holded.com/pricing/) | Close architectural comparator; lacks verified Estonian authority integrations. |
| **Pennylane** | France; businesses and accountants | Bookkeeping, purchasing, invoicing and accountant collaboration | Conversational financial access | Official [read-only MCP](https://pennylane-mcp.readme.io/docs/getting-started), OAuth/PKCE; paid-plan eligibility | Essentiel **€24/month excluding tax**, suitable integration tier. [Pricing](https://www.pennylane.com/fr/tarifs) | Strong accountant platform; country-specific compliance. |
| **Qonto** | Selected European business-banking markets | Banking, invoices, expenses and financial administration | Analyst/operator assistance; MCP reads and drafts | Official [hosted MCP](https://qonto.com/en/ai/mcp); OAuth, role controls; payment initiation currently excluded | Basic **€9/month**, billed annually, excluding VAT. [Pricing](https://qonto.com/en/pricing) | Strong approval precedent; Estonian-company eligibility **UNVERIFIED**. |
| **Revolut Business** | International, including Estonia | Accounts, cards, expenses, transfers and FX | Automation exists; specific autonomous “Business AI” offering **UNVERIFIED** | Official [Business API](https://developer.revolut.com/docs/business/business-api); official operational MCP none found | Estonia Basic **€10/month**, Grow **€35**. [Plans](https://www.revolut.com/en-EE/business/business-account-plans/) | Financial counterparty, not comprehensive Estonian administration. |
| **Wise Business** | Cross-border businesses | Transfers, currencies, recipients and account operations | Primarily API-driven automation | Official [API](https://docs.wise.com/api-reference); documentation MCP must not be confused with transactional MCP | Estonia **€50 setup**, then applicable usage fees. [Pricing](https://wise.com/ee/pricing/business) | Useful payment partner; no verified whole-business agent. |
| **Xolo** | Estonian e-resident OÜs; other freelancer markets | Accounting, tax compliance and business support | Integrated service and human support rather than a verified general-purpose agent | Public external API/MCP none found | Leap advertised from **€59/month**, Standard **€99**, excluding VAT. [Pricing](https://www.xolo.io/zz-de/pricing) | Closest service substitute: customers may prefer delegation to a provider over operating tools themselves. |
| **Accountable** | German/Belgian self-employed markets | Receipts, bookkeeping and local tax returns | AI tax adviser alongside filing workflows | Public external API/MCP none found | German Steuern **€29.90/month** with annual billing, excluding VAT. [Pricing](https://www.accountable.de/preise/) | Demonstrates jurisdiction-specific positioning; no verified Estonia coverage. |
| **Moss** | European spend-management customers | Cards, expenses, accounts payable and pre-accounting | AI extraction/coding and approval workflows | Official [API](https://developers.getmoss.com/data-model/); official MCP none found | Platform/volume-dependent quotation. [Pricing](https://www.getmoss.com/pricing) | Strong spend controls, limited coverage beyond finance. |
| **Stripe agent toolkit** | Internet businesses | Billing, payments, subscriptions and customer operations | Agent tools for financial operations | Official [remote MCP](https://docs.stripe.com/mcp) and [agent toolkit](https://docs.stripe.com/agents); OAuth/agent keys | Underlying Stripe product and transaction fees | An integration building block; does not supply Estonian business obligations. |

### Estonian products, service providers and direct entrants

| Product | Market | What it automates | AI/agent features | API/MCP availability | Published pricing | Gap versus Harness |
|---|---|---|---|---|---|---|
| **Envoice** | Estonia/international SMEs | Purchase invoices, expenses and approval routing | SmartExtract and human-review options | API advertised; official MCP none found | Page displays **$10/$22/$59** base tiers; Estonia EUR quote **UNVERIFIED**. [Features/pricing](https://envoice.eu/en/pricing/) | Valuable document intake partner; narrower than full administration. |
| **Merit Aktiva / Palk** | Estonia and other supported markets | Accounting, invoicing and payroll | Conventional automation; agent access through third parties | Official [API](https://api.merit.ee/); Aktiva API generally Pro/Premium; ID/key authentication | Aktiva Standard **€19**, Pro **€39**, Premium **€49/month**, excluding VAT. [Pricing](https://www.merit.ee/merit-aktiva/hinnad/) | Existing system of record; adapter opportunity, already addressed partly by Werkzeug. |
| **SmartAccounts** | Estonian small businesses | Accounting, invoices, payroll and bank workflows | Conventional automation; first-party MCP none found | Official [API](https://www.smartaccounts.eu/en/2025/12/how-to-use-api/), available with subscription | Pro **€27/month** or **€249/year**, excluding VAT. [Pricing](https://www.smartaccounts.eu/en/pricing/) | Suitable upstream ledger; full agent workflow still needs integration. |
| **Joosep** | Estonian businesses/accountants | Finance, payroll, inventory and assets | Public AI features **UNVERIFIED** | Public API/MCP none found; integration discussion required | Web financial accounting advertised **€18/month excluding VAT**. [Pricing](https://www.joosep.info/hinnad/teenuste-hinnad/) | Likely import/export or bespoke integration work. [Modules](https://www.joosep.info/moodulid) |
| **Fitek** | Baltic/Nordic finance teams | Invoice capture, coding, approvals and ERP transfer | FitekAI and automated processing | API included in listed plans; official MCP none found | **€12/€16/€20 per user/month**, plus document charges. [Pricing/API](https://fitek.ee/hinnad/) | Strong purchase-invoice subsystem; broader administration remains outside scope. |
| **CostPocket** | Estonia/Baltics and other supported markets | Receipt capture, expense processing and ledger transfer | AI predicts accounts, VAT and dimensions | Accounting integrations; public MCP none found; external API terms **UNVERIFIED** | Current comparable price **UNVERIFIED** | Partner or substitute for document ingestion. [Automated posting](https://costpocket.com/en/automated-posting) |
| **Grant Thornton Estonia** | Businesses using advisory/accounting services | Outsourced accounting and advice | Public assistants for accounting standards, disclosures and employment contracts | Public assistants are advisory; transactional MCP none found | Assistants free; accounting service quoted | Human expertise and distribution partner. [Assistants](https://www.grantthornton.ee/teenused/virtuaalsed-tehisaru-assistendid/) |
| **Accountor / Aspia** | Nordic service markets | Outsourced financial/payroll administration | Product/service dependent | Public transactional MCP none found | Quote; current Estonian offering **UNVERIFIED** | Avoid assuming historic brand presence means current Estonia coverage. Finnish Accountor Services became Aspia in 2026. [Announcement](https://www.aspia.fi/en/finland/news/accountor-now-aspia-aiming-inspire-finnish-companies-grow) |
| **Werkzeug** | Estonian accounting-tool users | Invoices, journals, bank transactions, contacts and reports | Runs accounting tools inside external AI assistants | Hosted MCP for **e-arveldaja, Merit and Erply Books**; upstream credentials stored by gateway | Free start; paid tier amounts **UNVERIFIED**; self-hosting offered. [Product](https://werkzeug.ee/) · [Pricing](https://werkzeug.ee/pricing/) | Direct competitor to the connector layer. Approval depth and operational reliability require testing. |
| **Trivis** | Estonian businesses | Advertises ledger, VAT, payroll, assets and banking integrations | Agentic accounting with confirmation before book changes | Advertises MCP; endpoint, commercial access and security independently **UNVERIFIED** | Free start; paid prices **UNVERIFIED** | Direct country-specific competitor, not merely adjacent software. [Product claims](https://trivis.ee/en) |
| **Oscar** | Estonia-oriented accounting customers | Advertises AI bookkeeping plus human filing support | Advertised AI accountant and integrations | API/MCP advertised; actual availability **UNVERIFIED** | Advertised **€49/month plus VAT**; site presents waitlist/opening-soon status | Track as an entrant; do not count advertised integrations as shipped. [Product](https://oscaraccountant.com/) |

**Implication:** “Accounting through your AI assistant” and “Estonian accounting MCP” are already occupied positions. Harness needs to prove better completion, permission control and coverage across organisations and authorities.

### Bürokratt: complementary public infrastructure

[Bürokratt](https://www.ria.ee/riigi-infosusteem/tehisaru/burokratt) is RIA’s public-service virtual-assistant programme: institutional knowledge, service guidance and human handoff. Its 2026 programme includes networking assistants across institutions; planned capability should not be presented as universally deployed.

The [open-source Common Knowledge project](https://github.com/buerokratt/Common-Knowledge) includes REST-oriented components and public-information ingestion. That does **not** establish a public, authenticated API allowing third-party agents to file business transactions. A publicly available governmental transactional MCP was **not found**.

Ärikratt is not shown by these sources to be part of Bürokratt. Potential integration is approved knowledge retrieval, referrals and agency handoff, subject to RIA agreements. Branding should make the independent operator clear.

## 3. MCP ecosystem

Discovery, authentication, permissions and transaction approval are distinct functions. A directory listing or OAuth connection does not establish that a particular payment or filing is authorised.

| Platform | Discovery and trust | Authentication, permissions and approval | Billing and relevance |
|---|---|---|---|
| [Official MCP Registry](https://modelcontextprotocol.io/registry/about) | Preview metadata registry; namespace ownership verification | Does not operate servers or enforce their runtime permissions | Public discovery infrastructure; verification is not a security audit. |
| [Smithery](https://smithery.ai/future) | Public registry continues under Arcade | **Managed identity and proxy services shut down 31 October 2026**; existing proxy URLs and connection tooling retire | Do not select its retiring runtime for the MVP. Registry remains useful. |
| [Glama](https://glama.ai/mcp/servers) | Directory with quality, maintenance and related signals | Runtime safeguards vary by server/product | Generic discovery; ratings do not establish Estonian legal suitability. |
| [mcp.so](https://mcp.so/) | MCP directory; current detailed operation **UNVERIFIED** because retrieval failed | OAuth, approval and runtime enforcement **UNVERIFIED** | Discovery candidate, not a verified gateway dependency. |
| [PulseMCP](https://www.pulsemcp.com/) | Curated directory, news, use cases and API | Not itself a universal execution/approval layer | Generic ecosystem coverage; site reports listing/submission changes paused. |
| [Composio](https://docs.composio.dev/docs/sessions-via-mcp) | Managed integration/tool catalogue and dynamic discovery | Managed accounts/OAuth. Crucially, SDK `beforeExecute`/`afterExecute` hooks do **not** run through MCP | Usage plans; build approval enforcement in the actual MCP execution path. [Pricing](https://composio.dev/pricing) |
| [Zapier MCP](https://help.zapier.com/hc/en-us/articles/48308034391821-What-is-Zapier-MCP) | Broad business-app coverage and selected toolsets | Connected-account authentication; tool selection. Legal approval needs explicit workflow controls | **Two tasks per successful tool call** under task billing. [Usage rules](https://help.zapier.com/hc/en-us/articles/45645738385805-How-Zapier-MCP-usage-works) |
| [Pipedream](https://pipedream.com/pricing) | Large API/action catalogue | Managed OAuth, custom OAuth applications and user connections | Development tier; production from **$99/month billed annually**. Useful infrastructure, potentially expensive for early micro-business volumes. |
| [Docker MCP Catalog/Toolkit](https://docs.docker.com/ai/mcp-catalog-and-toolkit/toolkit/) | Docker-built signed images, isolation and software metadata | OAuth/secrets support; gateway controls tool exposure | Local/open-source gateway plus enterprise offerings; isolation does not solve prompt injection. |
| [Cloudflare remote MCP](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/) | Hosting/framework, not a vetted business catalogue | OAuth 2.1 components and application-defined scope/role mapping | Infrastructure usage billing; Harness must implement business approval semantics. |
| [Klavis](https://github.com/Klavis-AI/klavis) | Public MCP integration code | Historical managed integration/auth offering | [Current homepage](https://www.klavis.ai/) emphasises agent training data; current hosted MCP plans/support **UNVERIFIED**. |
| [MetaMCP](https://github.com/metatool-ai/metamcp) | Self-hosted aggregation and namespaces | Tool enabling, API-key/OAuth endpoints and identity integrations | Self-hosting costs; audit, billing and approval completeness require inspection rather than assumption. |
| [Arcade](https://www.arcade.dev/) | Managed agent tools; now associated with Smithery | Delegated authentication and permission-oriented execution infrastructure | Generic commercial infrastructure; no verified Estonian compliance package. |
| [Nango](https://nango.dev/) | Integration templates and custom integration code | OAuth/API-key management, tenant isolation and MCP exposure | Cloud/commercial and self-hosting options; licensing/features vary. Country workflows remain the application’s responsibility. |

None of the generic platforms above was verified as offering a comprehensive **Estonian micro-business obligation and delegation model**. Several target business productivity; that is different from country-specific compliance.

### Existing Estonian MCPs and official APIs

| Service | Evidence and scope | Harness implication |
|---|---|---|
| **Ärikratt** | Existing public-register gateway described in the brief; [service endpoint](https://arikratt.ee/mcp). Its production capabilities were not independently exercised here. | Reuse its public evidence layer and natural-person restrictions. |
| **Nimistu** | [Public repository](https://github.com/Nimistu/nimistu-mcp) documents a free, read-only remote MCP at `https://nimistu.ee/api/mcp`, with company data and source information. | Direct public-data comparator. Check current fields rather than stale directory descriptions, particularly beneficial-owner/person data. |
| **Creditinfo Estonia** | Official [AI/MCP offering](https://creditinfo.ee/en/ai-eng/) connects business-information products to assistants using account authorisation. | Potential paid risk-data partner. Distinguish live MCP from its separately announced in-portal assistant. |
| **RIK e-arveldaja** | Official [API permission setup](https://abiinfo.rik.ee/index.php/e-arveldaja/e-arveldaja-api/e-arveldaja-api-votme-genereerimine), including function permissions, IP restrictions and logs. | Prefer official API underneath a reviewed adapter. An official RIK MCP was not found. |
| **Third-party e-arveldaja MCPs** | [Experimental community server](https://github.com/iseppo/e-arveldaja-mcp) and Werkzeug expose accounting functions. | Existing code can reduce work; neither government endorsement nor safe write behaviour follows automatically. |
| **MTA machine interfaces** | MTA documents machine-to-machine rights for **KMD, TSD and TÖR**, including `XT_MM`. [Authorisations](https://www.emta.ee/en/business-client/e-services-training-courses/how-use-e-services/granting-and-termination-access) | Tax/payroll interfaces are not universally absent. Access eligibility, contracts and representative rights must be established before choosing browser automation. |

## 4. Friction-loop precedents

| Precedent | What works | What to borrow |
|---|---|---|
| [Langfuse masking](https://langfuse.com/docs/observability/features/masking) | Redaction before traces leave the application | Keep tool outcomes and error classifications without exporting invoice bodies, credentials or mailbox content. |
| [Canny Autopilot Ideas](https://help.canny.io/en/articles/14690026-autopilot-ideas) | Extracting feedback, linking evidence and deduplicating suggestions; internal ideas can be reviewed before publication | Separate private discovery from public demand. Let humans correct incorrect clustering. |
| [GitHub Discussions](https://docs.github.com/en/discussions) | Categorised discussion followed by actionable issues | Turn a repeated workflow gap into a specification with acceptance criteria and an accountable maintainer. |
| [Algora](https://github.com/algora-io/algora/blob/main/README.md) | Issue bounties, contracts and outcome-based payments | Fund reviewed integrations and maintenance, not merely submitted code. |
| [Nango](https://github.com/NangoHQ/nango) | Community integration contributions plus reusable authentication/runtime infrastructure | Make demanded adapters cheap to build while retaining a consistent review and deployment process. |

Recommended loop:

1. Classify failure as **missing capability, expired authentication, insufficient rights, invalid data, outage, approval refusal or genuine manual-only step**.
2. Deduplicate by intended outcome and counterparty, not raw error wording.
3. Measure affected consenting organisations, repetitions and observed time lost. Keep estimates separate.
4. Generate a private, redacted demand draft.
5. Publish only after explicit owner approval; attach synthetic reproduction data and acceptance tests.
6. Review the adapter, rerun the originating workflow, then report resolution.

An expired token is not demand for a new integration. Repeated retries must not inflate popularity. Public logs must exclude names, personal codes, IBANs, tax amounts, payroll, document contents, credentials and identifying file paths. Even a rare workflow description can identify a business.

The defensible asset is the relationship between **observed blockage, validated demand and a tested resolution**. A generic public feature board provides much less value.

## 5. Risks and constraints

### MCP and execution security

| Risk | Required design response |
|---|---|
| **Tool poisoning and prompt injection** | Treat tool descriptions, websites, invoices and messages as untrusted. Review and pin tool schemas; re-review changes. Invariant demonstrated malicious descriptions steering trusted tools and leaking data; these were research demonstrations, not evidence every current client is exploitable. [Research](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks) |
| **Over-broad OAuth and upstream API keys** | Enforce company, tool and object permissions at the gateway. Hiding tools from the model is insufficient. Upstream keys may grant more authority than the gateway exposes. |
| **Confused deputy and token misuse** | Use audience validation, PKCE, exact redirect handling, per-client consent and properly separated upstream credentials. Avoid token passthrough. [MCP security guidance](https://modelcontextprotocol.io/docs/draft/tutorials/security/security_best_practices) |
| **Approval that does not match execution** | Bind approval to the company, recipient/payee, amount, period and document version. Any material change invalidates approval. The model must not be able to manufacture approval itself. |
| **Duplicate or falsely successful actions** | Use idempotency where supported, read back results, retain authority receipts and distinguish submitted/accepted/rejected/paid states. Never blindly retry an uncertain payment or filing. |
| **Cross-company leakage and supply-chain compromise** | Isolate tenants, credentials and browser sessions; restrict network destinations; provide revocation and emergency disablement. Catalogue reviews and container signatures are supporting controls, not guarantees. |

The product needs three separate decisions: **does the user legally represent this business; does the connected account permit this operation; did the owner approve this exact action?**

### Liability and representation

AI does not replace the taxable person or authorised representative. The Taxation Act places organisational duties on legal representatives; personal liability has specific conditions, including intentional or grossly negligent breaches, rather than arising automatically whenever software errs. Returns must be signed by an eligible person or representative. [Taxation Act, §§8, 40, 87](https://www.riigiteataja.ee/en/eli/ee/505012026004/consolide/current)

Harness should preserve evidence of inputs, approval, execution and acceptance, with contractual allocation of responsibility among the operator, adapter provider, accountant and customer. Whether its particular service creates additional professional, intermediary or insurance requirements needs Estonian legal review.

### E-identity, delegation and wallets

**Never collect or share Smart-ID/Mobile-ID PINs.** Authentication and signing remain under the person’s control. A browser agent should pause for the owner’s device interaction and display the actual document or transaction being authorised. [Smart-ID security](https://www.smart-id.com/help/faq/pin-codes/pin-codes-and-security/) · [Mobile-ID PIN guidance](https://www.id.ee/en/article/mobile-id-pin-codes/)

Use named, revocable and appropriately limited MTA/RIK permissions. MTA rights can include receiving administrative acts: “reading” is not always legally consequence-free. [MTA authorisation guidance](https://www.emta.ee/en/business-client/e-services-training-courses/how-use-e-services/granting-and-termination-access)

The Commission’s timetable targets **EUDI wallets by the end of 2026**. This does not establish a generally available agent-delegation mechanism. [European Digital Identity](https://commission.europa.eu/topics/digital-economy-and-society/european-digital-identity_en)

**European Business Wallets are a separate legislative initiative.** The Council adopted its negotiating position on **9 June 2026**; do not assume operational business mandates or universal portal support. [Council position](https://www.consilium.europa.eu/en/press/press-releases/2026/06/09/european-business-wallets-council-adopts-negotiating-position/)

### Payments: PSD2 remains the implementation baseline

Estonian legislation regulates both **payment initiation** and **account-information services**. Owner approval does not itself exempt Harness from regulation; even a service that never holds money can fall within scope. Use a licensed partner or bank handoff and assess the actual service model. [Payment Institutions and E-money Institutions Act](https://www.riigiteataja.ee/en/eli/ee/511082025003/consolide/current)

PSD3/PSR had a provisional agreement, but the Parliament’s current procedure still shows **awaiting the Council’s first-reading position**, with an indicative December 2026 plenary date. Final application dates are **UNVERIFIED**; do not describe PSD3 as already replacing PSD2. [Legislative Observatory](https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2023%2F0210%28COD%29)

### GDPR, AI Act and retention

Mailbox and calendar access requires a documented purpose, lawful basis, minimisation, security, processor arrangements and appropriate international-transfer safeguards. OAuth consent is not automatically a GDPR legal basis for processing everybody mentioned in messages. Limit intake to selected documents/folders where possible; publishing demand is a separate processing purpose. [EDPB roles](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en) · [Transfers](https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en)

Routine bookkeeping assistance is not automatically high-risk under the AI Act. Recruitment, worker evaluation and natural-person creditworthiness introduce different classifications. Determine provider/deployer roles and applicable transparency duties before expanding.

**2026 change:** the Commission reports that the AI Omnibus entered into force on **27 July 2026**, moving Annex III high-risk requirements to **2 December 2027**, and product-embedded high-risk requirements to **2 August 2028**. Most other AI Act rules began applying in August 2026. Older implementation summaries are therefore unsafe defaults. [Commission update](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force) · [Council timeline](https://www.consilium.europa.eu/en/policies/artificial-intelligence-act/timeline-artificial-intelligence/)

Accounting Act §12 generally requires source documents and reconstruction records to be retained for **seven years after the relevant financial year**; long-term rights/liabilities have a different starting point. Records must remain readable and evidentially useful. This is not justification to retain complete mailboxes or raw agent traces for seven years. [Accounting Act](https://www.riigiteataja.ee/en/akt/516062025001)

## 6. Recommendation and ten-day MVP

### Positioning and defensible advantage

Position Harness as **“the permissioned operating layer for an Estonian micro-business, using its existing accountant, ledger and public services.”**

Its defensible advantage should combine:

- Tested Estonian workflow packages with source provenance and effective dates.
- Company-specific delegation, precise approval and reliable completion receipts.
- Existing ledgers and government interfaces, avoiding unnecessary data migration.
- A private failure dataset that produces consented, testable integration demand.
- Accountant and software-provider partnerships for exception handling and distribution.

A directory, generic OAuth proxy or public-register chat interface alone is readily substituted. Werkzeug and Trivis also invalidate a “first Estonian accounting agent” claim.

Start with **one-person OÜs providing domestic services**, one ledger and one assistant client. FIE, ettevõtluskonto and cross-border e-resident businesses need separate workflow validation; treating them as interchangeable would undermine correctness.

### Eight end-to-end demonstrations

Use a dedicated test company/account where supported, synthetic documents and controlled recipients. Choose **e-arveldaja’s official API** as the first ledger integration, subject to confirming needed operations and access on day one.

| ID | Owner’s request | Demonstrable completion |
|---|---|---|
| **E01** | “Check this company before I accept the job.” | Retrieve existing Ärikratt evidence; show sources, timestamps and unresolved issues without producing an unsupported credit verdict. |
| **E02** | “Make and send this invoice.” | Create from supplied commercial terms, preview the exact invoice, obtain approval, issue/send to a controlled recipient and retrieve the resulting identifier. |
| **E03** | “Put this supplier invoice into my books.” | Extract fields, detect duplicates, propose coding, obtain approval, post through the ledger and read back the saved document. |
| **E04** | “Match this bank statement to my invoices.” | Import a supplied statement, suggest matches, approve changes and show updated outstanding balances. No banking credentials required. |
| **E05** | “Remind this customer about the overdue invoice.” | Recheck the ledger, draft a factual reminder, approve recipient/content, send and retain the message identifier. |
| **E06** | “Get this month ready for my accountant.” | Identify missing documents and unmatched transactions, assemble an evidence-linked exception list and export an accountant handoff package. |
| **E07** | “Find relevant grants or tenders and show what I need.” | Use existing public-data tools to produce a sourced shortlist, eligibility uncertainties and required documents. Do not submit applications. |
| **E08** | “This task is unsupported—request the missing integration.” | Classify the actual failure, deduplicate it, generate a redacted demand draft, obtain approval and publish a testable request. |

**Ten-day delivery sequence:** days 1–2 establish the ledger connection, company boundaries and approval mechanism; days 3–5 complete invoice and purchase-document flows; days 6–7 add statement matching and messaging; day 8 completes accountant export and demand publication; days 9–10 test hostile documents, duplicate execution, expired/revoked access and the full demonstration.

BrowserOS can additionally demonstrate a **labelled portal prefill with a hard stop before submission**. Do not present that as completed filing. A real portal workflow depends on representative rights, portal behaviour and user-controlled authentication.

Explicitly leave out autonomous tax submission, production payments, unattended signing, payroll filing, hiring decisions, natural-person credit scoring, unrestricted inbox access and arbitrary unreviewed MCP installation. “Works with Meta AI” remains **UNVERIFIED** until custom MCP connectivity is demonstrated.

### Gaps

- **Portal transactions:** a public API/MCP was not verified for every RIK registration/reporting or municipal workflow. Map individually; avoid blanket “no API” claims.
- **Local software:** Joosep, service-provider platforms and some document tools need commercial API clarification or new adapters.
- **Approval interoperability:** generic gateways do not establish a uniform, legally meaningful approval record across assistants.
- **Authority receipts:** adapters must distinguish accepted filings from successful transport.
- **Market evidence:** representative administrative hours and willingness to pay among Estonia’s smallest businesses remain unverified.

### Top 10 by value for a micro-entrepreneur

This is a product hypothesis ranking, not a survey result.

1. **E03 — Purchase invoice to approved ledger entry:** frequent work with visible time savings.
2. **E02 — Issue and send an invoice:** directly supports revenue collection.
3. **E04 — Match transactions:** removes repetitive checking and improves balances.
4. **E05 — Chase overdue invoices:** improves cash flow with little data migration.
5. **E06 — Prepare the accountant handoff:** reduces missing-document exchanges.
6. **E09 — Prepare a filing for owner/accountant review:** valuable next-stage extension once calculations and authority interfaces are validated.
7. **E10 — Maintain a sourced obligations calendar:** helps owners act before deadlines without relying on model memory.
8. **E01 — Check a business counterparty:** immediately reuses existing Ärikratt coverage.
9. **E07 — Find suitable opportunities:** converts public information into an actionable shortlist.
10. **E08 — Resolve unsupported workflows:** creates compounding value as recurring gaps become maintained integrations.

### Open questions

- Which segment has the strongest measured burden and willingness to pay: local solo OÜs, e-residents or small employers?
- Which ledger operations, sandboxes, rate limits and commercial redistribution rights are actually available?
- Can each authority distinguish preparer, submitter, signer and recipient rights adequately?
- Does the chosen payment/account-data architecture require regulated status or a licensed partner?
- How do Werkzeug and Trivis perform under approval, revocation, duplicate-action and company-isolation tests?
- Will owners approve enough redacted public demand to sustain the marketplace, and who funds maintenance?
- Can the service deliver savings after including subscription, connector, model and human-review costs?

*Research limitation: BrowserOS session creation was rejected by the tool approval policy because approvals were disabled. Research used read-only web sources; authenticated product and portal workflows were not tested.*