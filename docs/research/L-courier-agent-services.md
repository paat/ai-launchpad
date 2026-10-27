# Courier interfaces relevant to Estonian businesses

Bounded public-source pass, checked 2026-10-27. Seven new provider records in the [canonical catalog](catalog/README.md): UPS, Venipak, DHL Express, FedEx, Unisend, Nova Post, Shippo. No signup, credentials, installs, bookings, labels, paid API calls or runtime tests. This is not an exhaustive courier census. Parent reopened the UPS guide and Shippo MCP/origin guidance; other additions remain researcher-sourced documentation leads.

## Strongest findings

**UPS publishes an official local MCP**, linked from its [developer guide](https://developer.ups.com/api/reference/mcp/guide?loc=en_US) to [UPS-API/ups-mcp](https://github.com/UPS-API/ups-mcp). It exposes tracking and address validation; the latter is for US/Puerto Rico, not Estonian addresses. It does not document MCP shipment creation, label buying or pickup. Installation needs a local Python/uv runtime and developer credentials, so this is not a remote connector a phone user can simply add. UPS's [Estonia page](https://www.ups.com/ee/en/locations) confirms its local service contractor. Estonia tracking entitlement remains untested.

**Shippo is a real hosted MCP candidate for Estonian exporters, with qualifications.** Its [official MCP support page](https://support.goshippo.com/hc/en-us/articles/51285219216283-Using-Shippo-MCP-Connect-Shippo-to-AI-assistants) documents OAuth and live-account label purchases, returns and tracking. There is no separate hosted MCP test mode. Its [origin guidance](https://support.goshippo.com/hc/en-us/articles/4403038716443-Getting-Discounts-with-Shippo) explicitly permits shipping from outside the US with the merchant's own carrier account, and the [carrier page](https://support.goshippo.com/hc/en-us/articles/204548255-Carriers-Supported-by-Shippo) lists global DHL Express/FedEx/UPS support. Estonia relevance is an inference from those statements plus local carrier presence; a specific Estonian account and route still need a safe test. Do not advertise US discounts or Baltic locker coverage. Pickup/cancel through MCP not established.

**Most local courier functionality remains API or existing shop integration territory.** Venipak, DHL Express, FedEx, Unisend and Nova Post offer documented integration paths. No official operational MCP for those five was located in this bounded pass. That is not a claim no community server exists. Connecting an ordinary API still needs a supported wrapper or existing platform; API availability is not an instruction for Launchpad to build five adapters.

## Capability boundaries

| Provider | Published interface | Tracking | Booking / labels | Pickup | Returns / cancellation |
|---|---|---|---|---|---|
| UPS | Official local MCP; separate carrier APIs | MCP yes, optional POD/signature | Not documented in MCP | Not documented in MCP | Not documented in MCP |
| Venipak | API credentials and official shop modules | Carrier tracking available | Module/API shipment export and labels | Module/API courier call documented | Service returns advertised; exact API operations unresolved |
| DHL Express | MyDHL REST API | Yes/POD | Yes | Create, update, cancel | Pickup cancellation is documented; shipment cancellation/returns not independently established |
| FedEx | REST APIs | Yes | Shipment and return labels | Availability, create, cancel | Ship cancellation endpoint; service/stage restrictions apply |
| Unisend | Parcel/shipping API and modules | Tracking/webhooks | Yes | Courier call; activation affects behavior | Return and cancellation documented; returns need service activation |
| Nova Post | International API and Estonia platform modules | Yes | Yes | Detailed API method not extracted | Overview advertises returns; module supports deletion, not proof of post-pickup recall |
| Shippo | Official hosted MCP | Yes, possibly billable | Buy labels | Not established for MCP | Return labels yes; cancellation not established for MCP |

Sources: [Venipak Estonia integration page](https://venipak.com/ee/en/business-customers/e-commerce/), [MyDHL API](https://developer.dhl.com/api-reference/dhl-express-mydhl-api), [FedEx Ship API](https://developer.fedex.com/api/en-us/catalog/ship/v1/docs.html), [FedEx Pickup API](https://developer.fedex.com/api/en-us/catalog/pickup/v1/docs.html), [Unisend API](https://post.lt/savitarna/api_doc.html), [Nova Post Estonia integration](https://novapost.com/en-ee/for-business/integrations-base). Every JSON record carries its own source list.

## Material account and implementation qualifications

- **FedEx:** [Estonia online-account terms](https://www.fedex.com/en-ee/open-account.html) exclude third-party shipments and state that this account is unsuitable for logistics providers, resellers and middlemen. Direct authorized owner use and gateway brokerage are different arrangements. The [Integrator Program](https://www.fedex.com/en-us/compatible/become-a-provider.html) is a separate possible route, not automatic permission. Do not list TNT as an additional independent opportunity.
- **Unisend:** the [official Estonia-linked module guide](https://www.post.lt/instrukcija/prestashop/presta-doc-en.html) says returns require activation and courier-call behavior depends on service setup. A shipment create can trigger a collection request. Treat it as consequential, not a harmless label preview. The Estonia `/api` page was bot-gated, so rely on linked official post.lt material while retaining operation/country qualifications.
- **Nova Post:** the live Estonia country integration page explicitly lists Estonia and links the API. Old developer paths can redirect to a new GitBook site; staging/cached onboarding instructions must be distinguished from current production documentation. Do not substitute the Ukraine domestic API for the international API.
- **UPS/Shippo:** tool access is not evidence of enforceable approval. Published examples or skill instructions that ask before buying a label cannot satisfy Launchpad's exact-action server approval requirement by themselves.

## Existing-catalog enrichment and remaining qualifications

1. **Montonio is already present; do not add a duplicate shipping provider record.** Its catalog entry now includes shipping creation, labels and lifecycle states from the [shipping overview](https://docs.montonio.com/api/shipping-v2/overview), [introduction](https://docs.montonio.com/introduction), and [shipping product page](https://www.montonio.com/shipping). It offers multi-carrier shipment creation, labels and status/webhooks, with explicit Estonia origin support. Record production `https://shipping.montonio.com/api/v2` and sandbox `https://sandbox-shipping.montonio.com/api/v2`. Keep registration pending, registered, failed, labels ready, transit and delivered distinct. The product advertises courier scheduling, but this pass did not establish a public pickup API operation. API reference at `shipping.montonio.com/docs` appeared in search but live open returned 404; use the maintained documentation navigation instead. Do not apply the payment-links monthly price to shipping.
2. **DPD Estonia:** [official delivery modules](https://www.dpd.com/ee/en/delivery-modules/) require contractual-client/self-service or Interconnector credentials depending module. A Magento API account and a Shopify self-service login are not interchangeable setup instructions. Retain API-only classification unless a supported MCP is separately found.
3. **Cargoson:** carrier-specific pages such as [Nova Post Estonia](https://www.cargoson.com/en/integrations/nova-post-estonia-ou/api-documentation) describe Cargoson's own unified API, not the carrier's direct API. Their generic capability lists should not be inherited as proof every underlying carrier supports every operation. Keep carrier and aggregation route distinct, without counting every route as a new business provider.
4. **Omniva, SmartPosti and nShift:** already catalogued; no new end-to-end validation performed here. Preserve contract/provider-specific restrictions. Do not relabel existing APIs as MCP merely because a global shipping platform integrates some of the same brands.

## Exclusions and bounded negative search log

- **Sendcloud:** [official origin-country FAQ](https://www.sendcloud.com/) lists eight fully supported countries and five additional conditional origins; Estonia is absent. Worldwide destinations do not make it an Estonia-origin solution. Excluded from new records unless a future primary source establishes an applicable arrangement.
- **Shippo:** deliberately researched origin eligibility rather than treating Estonia as merely a destination. Included with explicit inference and per-account/route verification requirement, not labeled Estonia-tested.
- **Parcely:** its [own Montonio integration help](https://parcely.freshdesk.com/support/solutions/articles/47001281063-montonio-shipping-in-parcely-app) provides a useful existing shop route, but no owner-assistant API/MCP was established. Not counted as another courier. Another unrelated site also uses the name Parcely; do not merge their features.
- **TNT:** folded into FedEx coverage; no duplicate record.
- Searched English/Estonian carrier API, developer, MCP and Model Context Protocol combinations for Venipak, DHL, FedEx, UPS, Unisend, Nova Post, Shippo and Sendcloud; followed official Estonia country pages, carrier developer docs and the UPS-linked GitHub repository. No community-wrapper census or carrier contact was performed. Therefore absence wording is only “not located in checked sources.”

