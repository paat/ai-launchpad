# C — Customers, sales, marketing, communication and growth

**Research date: 25 October 2026.** “All” means OÜ, FIE and ettevõtluskonto businesses, including e-resident-owned OÜs, where the activity and service eligibility permit. Consumer obligations depend on the transaction and customer, rather than the seller’s tax arrangement.

**Integration labels:** **O-MCP** = vendor-maintained MCP; **C-MCP** = community/third-party MCP; **API** = documented interface requiring an adapter. “None found” means this research did not establish a relevant public interface—not that private integrations cannot exist. MCP discovery is not a security endorsement. All filing, payment, signature requests, publication and outgoing communications require owner approval.

## Communication, scheduling and CRM

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C01 | “Show me urgent customer emails and unanswered enquiries” | All | Daily; incoming messages | Customers | API; webmail; IMAP | [Google Workspace O-MCP][googlemcp]; [Graph API][graph]; [IMAP C-MCP][imap] | read | med—missed sales or deadlines | [Gmail][gmail]; [Graph][graph] |
| C02 | “Reply using our prices, previous correspondence and attachments” | All | Each enquiry | Customer | API; SMTP; webmail | [Gmail API][gmail]; [Graph API][graph] | act-with-approval | high—wrong recipient, attachment or commitment | [Gmail sending][gmailsend] |
| C03 | “Assign this shared-inbox conversation and prevent duplicate replies” | Employer; teams | Incoming support/sales mail | Staff; customer | API; shared mailbox | [Graph API][graph]; [HubSpot O-MCP][hubspot] | act-with-approval | med—lost ownership or disclosure | [Graph][graph]; [HubSpot][hubspot] |
| C04 | “Find a meeting time and send the invitation” | All | Per meeting; recurring visits | Customer | API; calendar portal | [Google Calendar O-MCP][googlecalendar]; [Calendly O-MCP][calendly] | act-with-approval | med—double booking or timezone error | [Calendar][googlecalendar]; [Calendly][calendly] |
| C05 | “Book a haircut, consultation or repair with the right person” | Salons; professional services; repairers | Each booking | Customer; staff | Booking portal; API; telephone | [Microsoft Bookings API][bookings]; [Wix O-MCP][wixmcp] | act-with-approval | med—wrong service, duration or resource | [Bookings][bookings] |
| C06 | “Reschedule cancellations, fill the waiting list and handle no-shows” | Appointment businesses | Cancellation; availability changes | Customer | API; portal; messaging | [Calendly O-MCP][calendly]; [Bookings API][bookings]; local salon adapters: none found | act-with-approval | med—unfair charges or conflicting appointments | [Calendly tools][calendly] |
| C07 | “Clean up duplicate contacts and remember each customer’s preferences” | All | New contact; periodic cleanup | Customer | CRM API; spreadsheet | [Pipedrive API][pipedrive]; [HubSpot O-MCP][hubspot]; [Zoho O-MCP][zoho] | act-with-approval | med—merged identities or excessive data | [CRM documentation][zoho] |
| C08 | “Turn website enquiries and campaign leads into CRM records” | All | Form submission; lead event | Prospect | Forms; webhooks; API | [HubSpot O-MCP][hubspot]; [Zoho O-MCP][zoho]; [Wix O-MCP][wixmcp] | act-with-approval | med—lost leads or incorrect consent | [HubSpot][hubspot]; [AKI][aki] |
| C09 | “Tell me which deals need follow-up and draft the next message” | B2B; service businesses | Daily/weekly pipeline review | Prospect | CRM API | [Pipedrive C-MCP][pipedrivemcp]; [HubSpot O-MCP][hubspot] | draft | med—misleading promises or unwanted outreach | [Pipedrive MCP][pipedrivemcp] |
| C10 | “Summarise this customer meeting and create follow-up tasks” | All | After meeting | Customer; staff | Notes; calendar; CRM API | [Workspace O-MCP][googlemcp]; [Zoho O-MCP][zoho] | draft | med—incorrect agreed scope | [Workspace][googlemcp] |
| C11 | “Translate this offer or reply into Estonian, Russian or English” | All; exporters | Each multilingual interaction | Customer | Translation API; editor | [DeepL O-MCP][deepl] | draft | high—changed contractual meaning | [DeepL MCP][deepl] |
| C12 | “Bring social messages, calls and SMS enquiries into the customer history” | All | Incoming conversation | Customer | Business messaging; telephone; API | [Meta platforms][meta]; [CRM APIs][pipedrive]; telephony adapter depends on provider | act-with-approval | high—private-message disclosure | [Meta][meta]; [Pipedrive][pipedrive] |

## Offers, contracts, signatures and orders

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C13 | “Prepare and send a quote with quantities, exclusions and validity” | All | Customer request | Prospect | CRM; PDF; email | [Zoho O-MCP][zoho]; [Workspace O-MCP][googlemcp] | act-with-approval | high—unprofitable or binding offer | [Zoho][zoho] |
| C14 | “Turn the accepted quote into a contract and record scope changes” | Services; construction; B2B | Acceptance; additional work | Customer | Documents; email; signing portal | [Workspace O-MCP][googlemcp]; [Dokobit API][dokobit] | draft | high—disputed deliverables or liability | [Dokobit][dokobit] |
| C15 | “Check who can sign for this company, including joint representation” | OÜ; e-resident; B2B | Before contracting/signing | Business Register; signatories | Register portal; public data | [Ärikratt MCP][arikratt]; [Business Register][register] | read | high—unauthorised contract; signature identity alone is insufficient | [Commercial Code §181][representation] |
| C16 | “Send the approved document for digital signatures and chase completion” | All | Contract ready | Signatories | Dokobit portal/API; DigiDoc4 | [Dokobit APIs][dokobit]; [Smart-ID API][smartid]; [Mobile-ID API][mobileid] | act-with-approval | high—wrong document or signer | [Dokobit][dokobit]; [SK][smartid] |
| C17 | “Let me personally approve the actual signature” | All signatories | Every signing ceremony | Signatory; trust provider | ID-card; Smart-ID; Mobile-ID | [DigiDoc4][digidoc]; SK relying-party APIs | never-automate | high—PIN2/private-key use must remain with the human | [DigiDoc4 signing][digidoc] |
| C18 | “Validate the signatures and archive the original signed container” | All | Signed document received | Customer; trust provider | DigiDoc4; verification API | [Dokobit validation/archive APIs][dokobit] | read | high—invalid evidence or lost signed original | [ID.ee][signature]; [eIDAS][eidas] |
| C19 | “Track contract renewals, notice periods and termination letters” | Subscription; retainer; rental businesses | Contract-specific dates | Customer | Documents; calendar; email | [Workspace O-MCP][googlemcp]; [Graph API][graph] | draft | high—unwanted renewal or wrongful termination | [Workspace][googlemcp] |
| C20 | “Publish customer terms and send the order confirmation” | B2C sellers | Before purchase; every contract | Consumer; TTJA | E-shop; durable email/PDF | [Shopify Admin API][shopify]; [WooCommerce MCP][woo]; [Voog API][voog] | act-with-approval | high—missing pre-contract information | [TTJA e-commerce][ecommerce] |
| C21 | “Turn this email, phone or shop order into one order record” | Retail; services | Every order | Customer | API; email; manual entry | [Shopify API][shopify]; [WooCommerce MCP][woo]; [Voog API][voog] | act-with-approval | high—duplicate or incorrect order | [Shopify][shopify]; [Voog][voog] |
| C22 | “Keep stock and availability consistent across my sales channels” | Retail; makers; restaurants | Sale; restock; cancellation | Shops; marketplaces | APIs; webhooks; imports | [Shopify API][shopify]; [WooCommerce MCP][woo]; marketplace APIs below | act-with-approval | high—overselling or unavailable products | [Shopify][shopify]; [WooCommerce][woo] |
| C23 | “Warn me about late orders and agree a new delivery date” | B2C sellers | Delivery at risk; default fulfilment within 30 days unless otherwise agreed | Consumer | Order system; email | [Voog API][voog]; [Gmail API][gmail] | act-with-approval | high—breach and refund exposure | [TTJA fulfilment rules][ecommerce] |
| C24 | “Check whether the order was paid and prepare a refund or payment reminder” | All | Payment event; overdue order; cancellation | Customer; payment provider | Shop/payment API; bank portal | [Shopify Admin API][shopify]; payment-provider adapter | act-with-approval | high—duplicate refund or false payment confirmation | [Shopify][shopify] |
| C25 | “Track prepaid packages, gift cards and recurring customer services” | Salons; trainers; subscriptions | Sale; redemption; renewal | Customer | Booking/shop portal; API | [Wix O-MCP][wixmcp]; [Shopify API][shopify]; provider-specific extensions | act-with-approval | high—incorrect balance or recurring charge | [Wix][wixmcp]; [Shopify][shopify] |

## Website, e-shop and marketplaces

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C26 | “Update my website, products, photos, prices and opening information” | All | Launch; catalogue/content change | Website visitors | CMS portal; API | [Shopify API][shopify]; [WooCommerce MCP][woo]; [Voog API][voog]; [Wix O-MCP][wixmcp] | act-with-approval | high—incorrect public claims/prices | Linked platform documentation |
| C27 | “Renew my .ee domain and check who owns it” | Domain owners | Registration expiry; ownership change | Registrar; Eesti Interneti SA | Registrar portal; email | Registrant renewal API: none found; [EIS EPP/REPP][domainapi] is registrar infrastructure | act-with-approval | high—loss of domain and email | [Domain rules][domainrules] |
| C28 | “Renew hosting, repair DNS and keep the site recoverable” | Website owners | Expiry; migration; outage | Zone.ee/host | Portal; API; support | [Zone API][zone]; renewal/billing coverage requires confirmation | act-with-approval | high—site/email outage | [Zone documentation][zone] |
| C29 | “Check whether accessibility rules apply and fix my booking/checkout flow” | Online service sellers | Launch; redesign; business growth | TTJA; customers | Website audit; CMS | CMS APIs above; compliance adapter: none found | draft | high—exclusion or noncompliance; service microenterprise exemption uses fewer than 10 staff and turnover or balance sheet ≤€2m | [TTJA accessibility][accessibility] |
| C30 | “Run a discount with the correct previous price” | Consumer goods sellers | Each announced reduction | Consumer; TTJA | Shop API; price history | [Shopify API][shopify]; [WooCommerce MCP][woo] | act-with-approval | high—misleading discount; generally prior 30-day lowest price, with exceptions | [TTJA price guidance][prices] |
| C31 | “Check product listings for manufacturer, safety and traceability information” | Consumer goods sellers | New/changed listing | TTJA; manufacturer; marketplace | Product database; portal | Shop APIs; compliance adapter: none found | draft | high—unsafe or noncompliant listing | [GPSR Article 19][gpsr] |
| C32 | “Maintain privacy notices and cookie choices on my site” | Websites collecting personal data | New analytics/form/vendor | Customer; AKI | CMS; consent platform | CMS APIs; consent-platform-specific adapter | act-with-approval | high—unlawful tracking | [AKI website guidance][akiweb] |
| C33 | “Sell on Kaup24 and manage listings, orders and returns” | Eligible merchants | Onboarding; daily operations | PHH Group/Kaup24 | Seller portal; integrations | Public seller API specification: **UNVERIFIED**; MCP: none found | act-with-approval | high—stock, price or fulfilment errors | [PHH marketplace][phh] |
| C34 | “Create Osta.ee listings and handle buyer questions and completed auctions” | Traders; second-hand sellers | Listing; bid; sale | Osta.ee; buyer | Web portal | API/MCP: none found | act-with-approval | high—binding listing or mistaken auction terms | [Osta.ee][osta] |
| C35 | “Manage Amazon listings, orders, inventory and account performance” | Exporting merchants | Daily; alerts | Amazon; buyer | Seller Central; API/MCP | [SP-API][amazonapi]; [Amazon Selling Partner O-MCP][amazonmcp] | act-with-approval | high—account suspension or costly fulfilment error | [Amazon connector][amazonmcp] |
| C36 | “Manage Etsy listings, variations, stock and customer orders” | Makers; eligible creative sellers | Listing; sale; message | Etsy; buyer | Portal; API | [Etsy Open API v3][etsy]; official Dev MCP supplies documentation | act-with-approval | high—wrong listing or customer commitment | [Etsy API][etsy]; [Dev MCP][etsymcp] |
| C37 | “Update restaurant menus and process Wolt/Bolt Food orders” | Restaurants; eligible food retailers | Menu change; each order | Wolt/Bolt; diner | Merchant app; POS; partner API | [Wolt APIs][wolt]; [Bolt Stores API][bolt]; MCP: none found | act-with-approval | high—wrong food, price or acceptance | [Wolt orders][woltorders]; [Bolt][bolt] |

## Delivery, parcel lockers and fulfilment

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C38 | “Offer the right courier or parcel locker at checkout” | Goods sellers | Checkout; service/network updates | Customer; carriers | Location feeds; shipping modules | [Omniva API][omniva]; [SmartPosti API][smartposti]; [DPD interfaces][dpd] | read | med—unavailable or incorrect delivery location | Linked carrier documentation |
| C39 | “Create shipping labels and book parcel collection” | Goods sellers | Each dispatch/batch | Omniva; DPD; SmartPosti; Venipak | Contractual APIs; carrier portals | [Omniva][omniva]; [DPD][dpd]; [SmartPosti][smartposti]; [Venipak API/modules][venipak]; MCP: none found | act-with-approval | high—wrong recipient or duplicate shipment | Linked carrier documentation |
| C40 | “Tell the customer where the parcel is and flag stalled deliveries” | Goods sellers | Tracking event; enquiry | Carrier; customer | Tracking API; email | [Omniva tracking API][omniva]; other carrier adapters | act-with-approval | med—false delivery promise | [Omniva][omniva] |
| C41 | “Arrange a return label or replacement shipment” | Goods sellers | Withdrawal; defect; wrong item | Customer; carrier | Returns module; API; portal | [Omniva returns/integration][omniva]; carrier-specific adapters | act-with-approval | high—incorrect refund/return conditions | [Omniva][omniva]; [TTJA][ecommerce] |
| C42 | “Claim compensation for a lost or damaged parcel” | Goods sellers | Loss/damage; contractual claim deadline | Carrier | Claim form; email | Claim-submission API/MCP: none found | draft | med—missed contractual deadline or weak evidence | [DPD sending/claims][dpd] |
| C43 | “Prepare click-and-collect orders and record handover” | Retail; workshops | Pickup order; customer arrival | Customer | Shop/POS; portal | [Shopify Admin API][shopify]; [WooCommerce MCP][woo] | act-with-approval | med—handover to wrong person | [Shopify][shopify] |
| C44 | “Prepare the commercial invoice and contents data for an overseas parcel” | Exporters | Non-domestic shipment | Carrier; customs intermediary | Carrier portal; API; documents | [Venipak delivery platform][venipakplatform]; carrier adapters | draft | high—customs delay or false declaration | [Venipak customs fields][venipakplatform] |

## Support, complaints and consumer rights

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C45 | “Answer support questions using the customer’s actual order and our instructions” | All | Each enquiry | Customer | Helpdesk; email; chat | [HubSpot O-MCP][hubspot]; shop APIs; mail APIs | act-with-approval | med—wrong advice or disclosure | [HubSpot][hubspot] |
| C46 | “Register this complaint and prepare a reasoned response” | B2C sellers | Complaint received; reply within 15 days | Consumer; TTJA | Email; helpdesk | [Gmail API][gmail]; [HubSpot O-MCP][hubspot] | act-with-approval | high—missed statutory response | [TTJA complaint guidance][complaints] |
| C47 | “Handle a customer’s 14-day withdrawal and calculate the refund” | Distance-selling businesses | Generally 14 days from goods receipt; services from contract; exceptions apply | Consumer | Email; return portal; shop API | Shop APIs; legal-rule adapter needed | act-with-approval | high—wrong exclusion/refund; generally refund within 14 days of notice, subject to permitted withholding | [TTJA withdrawal][withdrawal] |
| C48 | “Add and monitor the online withdrawal button” | In-scope online B2C contracts | Required in Estonia from **1 September 2026** | Consumer; TTJA | Website function; confirmation email | CMS/shop APIs; implementation adapter needed | act-with-approval | high—missing withdrawal route or receipt evidence | [TTJA September change][withdrawbutton] |
| C49 | “Assess a defective-product claim without confusing it with a warranty” | Consumer goods sellers | Baseline two-year liability; first-year defect presumption; customer notification generally within two months of discovery | Consumer | Helpdesk; repair records | CRM/shop APIs; legal-rule adapter needed | draft | high—wrong refusal or remedy | [TTJA defect/warranty guide][warranty] |
| C50 | “Arrange repair or replacement and apply any extra commercial guarantee” | Retail; manufacturers; repairers | Defect; guarantee claim | Customer; manufacturer | Email; service portal | None found for general repair orchestration | act-with-approval | high—wrong remedy; 2026 repair-directive Estonian implementation **UNVERIFIED** | [TTJA warranty][warranty]; [EU repair rules][repair] |
| C51 | “Respond to the Consumer Disputes Committee with the complete evidence” | B2C businesses | Case notice; case-specific deadline | Tarbijavaidluste komisjon | TTJA/JVIS portal; email | Submission API/MCP: none found | act-with-approval | high—adverse decision or reputational damage | [Committee][committee] |
| C52 | “Prepare evidence for a card dispute or marketplace chargeback” | Online sellers | Dispute notice; provider deadline | Acquirer; marketplace | Payment/marketplace portal | Provider-specific API; universal MCP: none found | draft | high—lost proceeds or duplicate reimbursement | [Amazon SP-API][amazonapi]; [Shopify][shopify] |
| C53 | “Find affected buyers and send an approved product-recall notice” | Goods sellers | Safety defect/recall | Buyers; TTJA; supplier | Customer database; email; authority portal | Shop/CRM APIs; recall submission: none found | act-with-approval | high—injury and ineffective recall | [TTJA recall guidance][recall] |
| C54 | “Find, correct, export or erase a customer’s personal data” | All data controllers | Rights request; generally respond within one month | Customer; AKI | CRM/shop/mail APIs | Relevant APIs; cross-system adapter needed | act-with-approval | high—identity error or unlawful deletion | [Commission GDPR guidance][gdpr] |
| C55 | “Make our customer chatbot identify itself and hand difficult cases to me” | AI-assisted customer service | Deployment; each appropriate interaction | Customer | Website/chat platform | Platform APIs; disclosure/escalation adapter | act-with-approval | high—deception or unauthorised commitment; transparency rules apply from **2 August 2026** | [Commission AI transparency][aitransparency] |

## Marketing, reputation and customer growth

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C56 | “Update Google Business Profile hours, services, photos and booking links” | Eligible local businesses | Changes; holidays | Google; customers | Business Profile UI/API | [GBP APIs][gbp]; [GBP C-MCP][gbpmcp] | act-with-approval | med—customers arrive at wrong place/time | [Google documentation][gbp] |
| C57 | “Monitor reviews, draft replies and report policy-breaking reviews” | All reviewed businesses | New review | Google; platforms; reviewer | API; portal | [GBP APIs][gbp]; [GBP C-MCP][gbpmcp] | act-with-approval | high—public disclosure or reputational harm | [GBP][gbp] |
| C58 | “Prepare, schedule and publish Facebook/Instagram posts” | All | Content calendar; campaign | Meta; audience | Business Suite; publishing APIs | [Meta Instagram API][instagram]; third-party MCPs require vetting | act-with-approval | med—incorrect claims or publication | [Meta’s API collection][instagram] |
| C59 | “Review ad results and propose or apply an approved budget change” | Advertisers | Daily/weekly; campaign launch | Google; Meta | Ads UI; API | [Google Ads O-MCP][ads]—read-only; [Meta Ads C-MCP][metamcp]; write APIs | act-with-approval | high—uncontrolled spend | [Google Ads MCP][ads]; [Meta MCP][metamcp] |
| C60 | “Send a newsletter to the right segment and measure results” | All with lawful mailing lists | Campaign; lifecycle event | Subscribers | Newsletter platform/API | [MailerLite O-MCP][mailerlite]; [Smaily API][smaily] | act-with-approval | high—unlawful bulk send | [MailerLite][mailerlite]; [Smaily][smaily] |
| C61 | “Prove consent and stop marketing everywhere after an unsubscribe” | Direct marketers | Signup; withdrawal; objection | Recipient; AKI | Forms; CRM; newsletter APIs | [MailerLite][mailerlite]; [Smaily][smaily]; consent ledger adapter | act-with-approval | high—unlawful targeting; natural-person consent/limited customer exception differ from legal-person rules | [AKI direct marketing][akiweb] |
| C62 | “Find search problems and improve pages customers cannot find” | Website owners | Weekly/monthly; traffic drop | Google; visitors | Search Console; CMS | [Search Console API][searchconsole]; CMS APIs | draft | med—lost organic traffic | [Search Console][searchconsole] |
| C63 | “Show which campaigns produce actual orders and repeat customers” | All | Weekly/monthly | Marketing platforms; shop | APIs; reports | [Google Ads O-MCP][ads]; [HubSpot O-MCP][hubspot]; shop APIs | read | med—wrong attribution and spending decisions | [Ads][ads]; [HubSpot][hubspot] |
| C64 | “Create a referral offer, loyalty reward or win-back campaign” | Retail; recurring services | Customer milestone; inactivity | Customers | CRM; shop; newsletter API | [Shopify API][shopify]; [MailerLite O-MCP][mailerlite] | act-with-approval | high—incorrect benefits or unlawful outreach | [Shopify][shopify]; [AKI][aki] |
| C65 | “Check promotional claims, sponsorship disclosures and green claims before publication” | Advertisers | Each campaign | TTJA; audience | Document review; publishing UI | Publishing APIs; legal review adapter: none found | draft | high—misleading advertising; stricter environmental-claim rules from **27 September 2026** | [TTJA environmental claims][green] |
| C66 | “Collect feedback and request permission to publish a testimonial” | All | Completed service/order | Customer | Survey; email; forms | [Workspace O-MCP][googlemcp]; [HubSpot O-MCP][hubspot] | act-with-approval | med—misquotation or unauthorised personal data | [AKI transparency][aki] |
| C67 | “Watch competitors’ offers, public results and newly won contracts” | All | Weekly/monthly | Competitors; public registers | Websites; open data | [Ärikratt MCP][arikratt]; public procurement data | read | med—stale prices or mistaken comparisons | [Business Register][register]; [RHR][rhr] |

## Public procurement as a sales channel

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C68 | “Find tenders matching my service, region and capacity” | OÜ; FIE; eligible bidders | Daily/weekly | Contracting authorities | RHR search; open-data downloads | [Ärikratt MCP][arikratt]; [RHR XML/eForms open data][rhropen] | read | med—missed opportunity | [RHR][rhr]; [Open-data manual][rhropen] |
| C69 | “Tell me whether we qualify and what this bid would require” | Prospective bidders | Tender discovered | Contracting authority | Tender documents; registers | [Ärikratt MCP][arikratt]; document extraction | draft | high—unqualified or loss-making bid | [RHR][rhr] |
| C70 | “Prepare the ESPD and supporting declarations” | Bidders; consortium members | Tender-specific deadline | RHR; contracting authority | Hankepass/ESPD web service | Public bidder-write API/MCP: none found | draft | high—false declaration or exclusion | [RHR ESPD service][rhr] |
| C71 | “Ask a clarification and track changes to the tender” | Bidders | Questions; amended documents | Contracting authority | RHR messaging portal | Submission API/MCP: none found | act-with-approval | high—missed change or disclosed strategy | [RHR][rhr] |
| C72 | “Submit this approved bid and retain the submission receipt” | Bidders | Exact tender deadline | Contracting authority | Authenticated RHR portal | Public bid-submission API/MCP: none found | act-with-approval | high—late, incomplete or duplicate submission | [RHR][rhr]; [Outage procedure][rhroutage] |
| C73 | “Prepare a joint bid or apply to a dynamic purchasing system” | Small suppliers; consortium partners | Admission/tender window | Partners; contracting authority | Agreements; RHR portal | [Ärikratt][arikratt] for discovery; write adapter: none found | draft | high—joint liability or missing qualification | [RHR procurement tools][rhr] |
| C74 | “Participate in the e-auction or submit a framework call-off offer” | Admitted suppliers | Invitation; auction timetable | Contracting authority | RHR e-auction/e-catalogue | Public action API/MCP: none found | act-with-approval | high—binding underpriced offer | [RHR][rhr] |
| C75 | “Explain the award result and prepare our next action” | Bidders; winners | Award notice | Contracting authority; adviser | RHR; documents; email | [Ärikratt MCP][arikratt]; RHR portal | draft | high—missed case-specific challenge/contract deadline | [Finance Ministry procurement FAQ][rhrfaq] |

## Funding, partnerships and expansion

| ID | Use case—in the owner’s words | Who | Trigger & frequency | Authority or counterparty | Channel today | Existing API or MCP to plug in | Assistant mode | Risk if wrong | Source URL(s) |
|---|---|---|---|---|---|---|---|---|---|
| C76 | “Find grants we actually qualify for and check co-financing and previous aid” | Eligible OÜ/FIE; sector-dependent | Monthly; investment plan | EIS; PRIA; municipality; EU | Programme pages; registers | [Ärikratt MCP][arikratt]; [EU funding APIs][fundapi] | read | high—false eligibility or double funding | [EIS conditions][startgrant]; [EU APIs][fundapi] |
| C77 | “Prepare for EIS start-up support and alert me if intake reopens” | Eligible young companies | **Closed 14 August 2026, 09:00**; monitor reopening | Enterprise and Innovation Foundation; county development centre | Counselling; e-toetus portal | Read discovery: Ärikratt; application API/MCP: none found | draft | high—planning around unavailable funding; preliminary counselling required | [EIS start-up grant][startgrant] |
| C78 | “Apply for innovation or development support” | Eligible SMEs | Programme window; before restricted expenditure | EIS | e-toetus; supporting documents | Submission API/MCP: none found | act-with-approval | high—ineligible costs or unsupported claims | [Innovation voucher][innovation]; [Development voucher][development] |
| C79 | “Apply for PRIA or LEADER support for my rural business” | Eligible rural/agricultural enterprises | Measure/local-action-group window | PRIA; local action group | e-PRIA; documents | Applicant submission API/MCP: none found | act-with-approval | high—wrong measure, region or expenditure timing | [PRIA 2026 schedule][pria] |
| C80 | “Finish reporting for my existing Töötukassa start-up award” | Existing beneficiaries | Award-specific reporting dates | Töötukassa | e-Töötukassa; email | Applicant API/MCP: none found | act-with-approval | high—recovery of aid; new support ended **1 April 2026** | [MKM programme closure][tootukassa] |
| C81 | “Find and apply for municipal business or trade-fair support” | Locally eligible businesses | Local call/budget window | Municipality | Local grant portal; email | Public submission API/MCP: none found | act-with-approval | high—residency/activity mismatch or missed window | [Tallinn 2026 notice][tallinn] |
| C82 | “Find an EU call, register our organisation and submit a proposal” | Eligible businesses/consortia | Call deadline | European Commission/agencies | Funding & Tenders Portal | [Public REST APIs][fundapi] for discovery; submission adapter: none found | act-with-approval | high—eligibility or submission failure | [Portal functions][fundportal] |
| C83 | “Track grant milestones and prepare payment claims, changes and reports” | Grant recipients | Award-specific schedule | Funding authority | e-toetus; e-PRIA; EU portal | Public beneficiary-write API/MCP: none found | act-with-approval | high—repayment or unsupported expenditure | [EIS][startgrant]; [PRIA][pria]; [EU manual][fundmanual] |
| C84 | “Find useful events, book meetings and follow up with contacts” | All | Monthly; event date | Chambers; EIS; EEN; organisers | Websites; registration; email | Calendar/CRM APIs; event registration varies | act-with-approval | low—wasted time or irrelevant outreach | [EIS events][eisevents]; [EEN][een] |
| C85 | “Find a reliable supplier, distributor or collaboration partner” | All | New requirement; expansion | Companies; EEN | Registers; partnership portal; email | [Ärikratt MCP][arikratt]; EEN submission API/MCP: none found | draft | high—bad partner or inappropriate disclosure | [EEN partnership opportunities][een]; [Register][register] |
| C86 | “Choose the next customer segment or export market using evidence” | Growth-oriented businesses | Quarterly; expansion decision | Prospective customers; EIS | Sales reports; statistics; market research | [Ärikratt MCP][arikratt]; CRM/shop APIs | read | med—misallocated expansion effort | [EIS international growth][eisexport]; [HubSpot][hubspot] |

## API and MCP landscape: distinctions that affect implementation

- **Google Workspace:** official remote MCP servers are in **developer preview**. Gmail’s documented tools include reading and drafting; use the Gmail API for sending where the MCP lacks that tool. [Taylor Wilsdon’s Workspace MCP][googlecommunity] is community-maintained.
- **Microsoft 365:** official [Work IQ/Agent 365 MCP][workiq] exists, but preview, tenant, licensing and administrator requirements need checking. Graph remains the API foundation; [Softeria’s Microsoft 365 MCP][mscommunity] is community-maintained.
- **CRM:** HubSpot’s remote MCP supports CRM reads/writes; its developer MCP serves a different purpose. Zoho documents official CRM MCP servers. Pipedrive has official APIs and community MCP implementations; an official Pipedrive MCP was not established.
- **Commerce:** Shopify has official developer and shopper-facing MCPs, including [Shop MCP launched 13 October 2026][shopmcp]. These should not be treated as unrestricted merchant administration. WooCommerce documents a **preview** integration through the WordPress MCP Adapter. Wix provides an official authenticated MCP. Voog and Zone have APIs; MCPs were not found.
- **Marketplaces:** Amazon documents an official Selling Partner connector with approval-based writes. Etsy’s official Dev MCP exposes API documentation, not authenticated shop operations. Kaup24 seller API access remains **UNVERIFIED**. No relevant MCP was found for Osta.ee, Wolt or Bolt Food.
- **Marketing:** MailerLite has an official MCP; Smaily has a documented API. Google Ads’ official MCP is currently read-only. Meta Ads and Google Business Profile have community MCPs; vendor APIs remain the underlying interfaces.
- **Signing and carriers:** Dokobit and SK expose integration APIs; DigiDoc4 is a desktop signing application. No relevant maintained MCP was found for Dokobit, SK, Omniva, DPD, SmartPosti or Venipak. Contractual API onboarding remains necessary where required.
- **Public administration:** RHR open data and eSender functionality do not establish supplier bid-submission access. EU funding discovery has a public REST API; authenticated grant submission remains a separate workflow.

Discovery included GitHub, the [official MCP Registry][registry], [Smithery][smithery], [Glama][glama] and [mcp.so][mcpso]. Registry presence does not establish vendor ownership, operational health or suitable scopes.

## Gaps

1. **Estonian commerce adapters:** Voog, Zone, Smaily and parcel carriers need narrowly scoped MCP wrappers, including error handling and duplicate-action prevention.
2. **Signing orchestration:** connect document versions, representation checks, signature invitations, human signing and validation. An eIDAS qualified signature has handwritten-signature equivalence; it does not independently prove company representation. [eIDAS guidance][eidas]
3. **Browser-dependent submissions:** RHR bids, e-toetus, e-PRIA, municipal grants, TTJA cases and Osta.ee need reviewed browser workflows where suitable APIs remain unavailable.
4. **Consumer-rights state machine:** link orders, complaint dates, withdrawals, refunds, repairs and evidence. Preserve exceptions rather than applying one generic return policy.
5. **Cross-system consent:** CRM, newsletter, shop and advertising suppression lists need coordinated updates.
6. **Local scheduling:** verify commercial integration access for salon platforms before promising complete booking automation.
7. **Programme freshness:** distinguish open, exhausted, suspended and discontinued funding. Enterprise EIS and the domain registry’s Eesti Interneti SA are different organisations.
8. **2026–2027 repair changes:** EU repair rules were due to apply from 31 July 2026; Estonia-specific implementation was not established here. The European repair platform is planned for 2027, creating a future acquisition channel for repairers. [Commission][repair]
9. **Obsolete dispute links:** remove legacy EU ODR-platform references; that platform closed on 20 July 2025. [Commission notice][odr]
10. **Friction marketplace:** publish redacted failure categories, affected tools and required capabilities; keep customer messages, credentials and confidential bids out of public feature requests.

## Top 10 by value for a micro-entrepreneur

1. **C01–C02: Inbox triage and approved replies**—daily time savings and fewer lost enquiries.
2. **C05–C06: Booking management**—directly recovers otherwise empty appointment capacity.
3. **C13–C14: Quote-to-contract preparation**—shortens the path from enquiry to paid work.
4. **C21–C22: Unified orders and stock**—prevents overselling and repeated data entry.
5. **C38–C41: Parcel fulfilment and returns**—removes repetitive carrier-portal work.
6. **C46–C49: Complaint and withdrawal tracking**—protects deadlines and customer relationships.
7. **C16–C18: Signature orchestration**—reduces contract delays while preserving human control.
8. **C56–C60: Local visibility and repeat-customer marketing**—supports revenue without specialist staff.
9. **C68–C72: Tender discovery through submission**—opens a structured B2B revenue channel.
10. **C76–C83: Funding eligibility and administration**—avoids wasted applications and lost awards.

## Open questions

- Which official MCPs permit gateway operation for multiple independent businesses, with the required OAuth delegation and commercial terms?
- What authenticated seller interfaces does PHH provide, and can Osta.ee expose a supported integration?
- Which carrier operations are available under each Estonian merchant contract, especially claims and returns?
- Which local booking providers expose write APIs, webhooks and resource-level permissions?
- What are Estonia’s final implementing provisions for the 2026 repair directive and resulting guarantee-period changes?
- Can public portals support delegated agent sessions with reliable draft saving and submission receipts?
- Which grant measures accept FIEs, remotely operated e-resident companies or businesses without employees?
- How will the gateway prove that approval covered the exact recipient, document, amount and action executed?

**Research limitation:** BrowserOS session creation was blocked by the environment’s approval policy. Sources were researched through available read-only web tools; authenticated portal flows and integrations were not tested.

[googlemcp]: https://developers.google.com/workspace/guides/configure-mcp-servers
[googlecalendar]: https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server
[gmail]: https://developers.google.com/workspace/gmail/api/guides
[gmailsend]: https://developers.google.com/workspace/gmail/api/guides/sending
[graph]: https://learn.microsoft.com/graph/api/resources/mail-api-overview?view=graph-rest-1.0
[imap]: https://github.com/honest-magic/mail-mcp
[googlecommunity]: https://github.com/taylorwilsdon/google_workspace_mcp
[mscommunity]: https://github.com/Softeria/ms-365-mcp-server
[workiq]: https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview
[calendly]: https://developer.calendly.com/docs/mcp/supported-tools
[bookings]: https://learn.microsoft.com/en-us/graph/api/resources/booking-api-overview?view=graph-rest-1.0
[pipedrive]: https://developers.pipedrive.com/docs/api/v1
[pipedrivemcp]: https://github.com/WillDent/pipedrive-mcp-server
[hubspot]: https://developers.hubspot.com/ai-tools/mcp
[zoho]: https://www.zoho.com/crm/developer/docs/mcp/overview.html
[deepl]: https://github.com/DeepL/deepl-mcp-server
[meta]: https://developers.meta.com/
[instagram]: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
[arikratt]: https://arikratt.ee/mcp
[register]: https://ariregister.rik.ee/
[representation]: https://www.riigiteataja.ee/akt/130122015074?leiaKehtiv
[dokobit]: https://www.dokobit.com/api-solutions
[smartid]: https://sk-eid.github.io/smart-id-documentation/
[mobileid]: https://github.com/SK-EID/MID
[digidoc]: https://www.id.ee/en/article/you-wish-to-add-a-digital-signature-using-a-computer-5/
[signature]: https://www.id.ee/en/article/digital-signing-and-electronic-signatures/
[eidas]: https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/880312429/eSignature%2BFAQ
[shopify]: https://shopify.dev/docs/api/admin-graphql/latest
[shopmcp]: https://shopify.dev/changelog/posts/add-shopping-and-shop-pay-checkout-to-any-agent-with-shop-mcp
[woo]: https://developer.woocommerce.com/docs/features/mcp/
[voog]: https://www.voog.com/developers/api/ecommerce/orders
[wixmcp]: https://dev.wix.com/docs/api-reference/articles/ai-tools/wix-mcp/about-the-wix-mcp
[zone]: https://www.zone.ee/help/en/kb/zone-api-en/
[domainapi]: https://www.internet.ee/registrar-portal/help-and-info/eif-s-information-systems-and-technical-conditions
[domainrules]: https://www.internet.ee/registrar-portal/help-and-info/domain-regulations-and-registrar-contract
[ecommerce]: https://www.ttja.ee/ariklient/ettevotlus/tarbijakaitsenouded-tegevusalale/e-kaubandus
[accessibility]: https://www.ttja.ee/ariklient/ettevotlus/ligipaasetavus/teenuste-digiligipaasetavus
[prices]: https://www.ttja.ee/sites/default/files/documents/2024-04/Hinna%20avaldamise%20juhend%20%28uuendatud%20aprillis%202024%29.pdf
[gpsr]: https://eur-lex.europa.eu/eli/reg/2023/988/oj
[aki]: https://www.aki.ee/1-andmetootlus-ja-labipaistvus
[akiweb]: https://www.aki.ee/isikuandmed/kkk/interneti-ja-veebitegevused
[phh]: https://phhgroup.eu/marketplace/14
[osta]: https://www.osta.ee/
[amazonapi]: https://developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview
[amazonmcp]: https://github.com/amzn/selling-partner-agentic-toolkit
[etsy]: https://developers.etsy.com/documentation/
[etsymcp]: https://developers.etsy.com/documentation/mcp_server/devmcpserver/
[wolt]: https://developer.wolt.com/docs/api/menu
[woltorders]: https://developer.wolt.com/docs/orderrestaurantguide
[bolt]: https://developer.bolt.eu/stores
[omniva]: https://www.omniva.ee/en/business/api/
[dpd]: https://www.dpd.com/ee/en/sending/
[smartposti]: https://itella.ee/wp-content/uploads/2024/11/smartpost-api-documentation-17.pdf
[venipak]: https://venipak.com/lt/en/business-customers/e-commerce/
[venipakplatform]: https://venipak.com/lt/en/faq/venipak-commerce-and-delivery-platform/
[complaints]: https://www.ttja.ee/eraklient/tarbija-oigused/tarbija-oigused-ja-kohustused/kaebuse-esitamine
[withdrawal]: https://www.ttja.ee/e-kaubandus
[withdrawbutton]: https://ttja.ee/uudised/alates-1-septembrist-veebiostust-taganemine-lihtsam-e-poodidesse-tuleb-lisada-taganemisnupp
[warranty]: https://ttja.ee/sites/default/files/documents/2025-01/Pretensiooni%20esitamise%20%C3%B5igus%20ja%20garantii%20%20-%2015.10.2024.pdf
[repair]: https://commission.europa.eu/law/law-topic/consumer-protection-law/directive-repair-goods_en
[committee]: https://ttja.ee/tarbijavaidluste-komisjonist
[recall]: https://www.ttja.ee/ariklient/ohutus/toote-tagasinoudmise-ja-o
[gdpr]: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en
[aitransparency]: https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august
[gbp]: https://developers.google.com/my-business/ref_overview
[gbpmcp]: https://github.com/amirjahfar1/Google-Business-Profile-GBP-MCP
[ads]: https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server
[metamcp]: https://github.com/pipeboard-co/meta-ads-mcp
[mailerlite]: https://developers.mailerlite.com/mcp
[smaily]: https://smaily.com/help/api/
[searchconsole]: https://developers.google.com/webmaster-tools/about
[green]: https://www.ttja.ee/ariklient/ettevotlus/tarbijakaitsenouded-tegevusalale/keskkonnavaited
[rhr]: https://www.fin.ee/riigihanked-riigiabi-osalused/riigihangete-register
[rhropen]: https://www.fin.ee/sites/default/files/documents/2024-04/Kasutajajuhend%20-%20hankijale%20RHR_5.5.pdf
[rhroutage]: https://www.fin.ee/tegevuskord-riigihangete-registri-torgete-korral
[rhrfaq]: https://fin.ee/riigihanked-riigiabi-osalused/riigihanked/korduma-kippuvad-kusimused
[startgrant]: https://eis.ee/teenused/starditoetus/
[innovation]: https://eis.ee/teenused/innovatsiooniosak/
[development]: https://eis.ee/teenused/arendusosak/
[pria]: https://www.pria.ee/infokeskus/toetuste-ajakava
[tootukassa]: https://www.mkm.ee/uudised/aprillis-lopetab-tootukassa-ettevotlustoe-dubleerimise
[tallinn]: https://www.tallinn.ee/et/ametlik-teade/tallinna-ettevotlusamet-alustas-ettevotlustoetuste-taotluste-vastuvotmist
[fundapi]: https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/apis
[fundportal]: https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/about
[fundmanual]: https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/om_en.pdf
[eisevents]: https://eis.ee/sundmused/
[een]: https://een.ec.europa.eu/partnering-opportunities
[eisexport]: https://eis.ee/
[odr]: https://consumer-redress.ec.europa.eu/site-relocation_en
[registry]: https://registry.modelcontextprotocol.io/
[smithery]: https://smithery.ai/servers/me-bz42/postfast
[glama]: https://glama.ai/mcp/connectors/md.adsagent/meta-mcp
[mcpso]: https://mcp.so/