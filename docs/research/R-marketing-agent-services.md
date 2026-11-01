# R — Marketing jobs the owner's assistant can take on, and the connectors for them

Research date 1 Nov 2026. One Grok research leg (grok-4.7, live web, read-only). The orchestrator re-checked the load-bearing claims at the source the same day (marked **re-checked**). Tiers: **A** statute, specification or vendor API reference; **B** official documentation; **C** third-party report.

## Question

Which marketing jobs can a 1–5 person Estonian business hand to its own assistant (Claude or ChatGPT, often on the phone) end to end, through which connectors, and under which rules? Our 25 Oct leads (report C, rows C56–C67) were unverified. This memo updates them.

## Answer

- **Two marketing jobs work end to end today, each with one approval:** a newsletter to existing customers (MailerLite or Omnisend) and a social post (Buffer, which reaches Facebook, Instagram, LinkedIn and Google Business Profile channels the owner has already linked in Buffer). A review request reuses the newsletter path or our e-mail send path.
- **Meta now has an official, Meta-hosted ads MCP that can write.** The address is `https://mcp.facebook.com/ads`, and it can "Create and edit ads, ad sets, and campaigns". **A** [Meta Ads MCP](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview) — **re-checked**. Use it only to read reports. Our old lead `pipeboard-co/meta-ads-mcp` is a community server and is superseded.
- **Meta's MCP index lists no MCP for Facebook Page or Instagram posts.** It lists only Ads, Social Technologies (developer apps) and WhatsApp Business. **A** [Meta MCP index](https://developers.facebook.com/documentation/mcp) — **re-checked**. Organic posts go through a scheduler.
- **Google's marketing MCPs are read-only and self-hosted.** The Google Ads MCP: "This implementation is strictly read-only. It cannot modify bids, pause campaigns, or create new assets." It runs locally, or someone deploys it to Cloud Run or another cloud and adds that address as a remote connector. A Google-hosted pilot is mentioned, but its availability is `UNKNOWN`. So it is technically possible on the phone, but too much setup for a non-technical owner. **A** [Google Ads MCP](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server), updated 30 Oct 2026 — **re-checked**. The Google Analytics MCP is local and experimental. **A** [GA MCP](https://developers.google.com/analytics/devguides/MCP). The leg found no official MCP for Search Console or Google Business Profile.
- **The law allows marketing e-mail to an existing customer only with an opt-out every time.** Electronic Communications Act § 103¹ is unchanged in the version in force on 1 Nov 2026 (quoted below). A deterministic check in the playbook can enforce the sender name, the opt-out, the consent or existing-customer basis, and the absence of review incentives.
- **AI-drafted marketing text needs no "made by AI" label when the owner reviews it.** Article 50(4) has applied since 2 Aug 2026. It covers deepfakes, and text "published with the purpose of informing the public on matters of public interest". Human review exempts that text. A café's offer is not that kind of text.
- **No assistant-side cap stops ad spend.** The cap that holds is the platform's: Meta's ad account spending limit. Meta's MCP rules can deny budget edits, but the rules are in limited availability.

## Connectors (as of 1 Nov 2026)

"Phone" means the connector is remote, so it is reachable from claude.ai and the Claude mobile app once added. **B** [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

| Product | Official MCP | Writes | Confirm before a write | Price for MCP | Phone |
|---|---|---|---|---|---|
| **MailerLite** | `https://mcp.mailerlite.com/mcp`, OAuth; Claude web and desktop, ChatGPT Plus/Pro web. **A** [docs](https://developers.mailerlite.com/mcp) — **re-checked** | `create_campaign`, `update_campaign`, `schedule_campaign` ("Schedule a campaign to be sent"), `cancel_campaign`, subscribers, groups, automations | Not documented. Treat `schedule_campaign` as a send | Sending needs a paid plan: "Email sending via the API and MCP server is available on paid plans." Free has no sending. **B** [pricing](https://www.mailerlite.com/pricing) — **re-checked** | Yes |
| **Omnisend** | In the Claude directory, made by Omnisend, added Jul 2026. **B** [listing](https://claude.com/marketplace/connectors/omnisend-mcp) — **re-checked**. Vendor reference: `post_campaigns_id_send` ("Send campaign") runs through `omnisend_update`. **A** [reference](https://api-docs.omnisend.com/reference/mcp-server-v2) — **re-checked** | Create, update, delete; sends a campaign | Not documented. Treat `omnisend_update` as able to send | MCP fee not documented; a free plan exists. **B** [pricing](https://www.omnisend.com/pricing/) | Yes |
| Klaviyo | `https://mcp.klaviyo.com/mcp`, OAuth; `?read-only=true` available. **A** [docs](https://developers.klaviyo.com/en/docs/klaviyo_mcp_server) | Campaigns (send tool not checked) | `UNKNOWN` | MCP fee not documented | Yes |
| Brevo | `https://mcp.brevo.com/v1/brevo/mcp`, API key in a header. **A** [docs](https://developers.brevo.com/docs/mcp-protocol) | Contacts, campaigns, SMS, WhatsApp | `UNKNOWN` | MCP fee not documented | `UNKNOWN` (header auth in claude.ai) |
| HubSpot Marketing | `https://mcp.hubspot.com`, GA 13 Apr 2026. **A** [changelog](https://developers.hubspot.com/changelog/remote-hubspot-mcp-server-is-now-generally-available); current tools **B** [docs](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) | E-mail drafts; blog/pages create and publish | New blog posts confirmed, per vendor | Any HubSpot account | Yes |
| Mailchimp | No general marketing MCP. The "Intuit Mailchimp" Claude/ChatGPT app saves drafts and is for the US, Canada, UK and Australia only. **B** [Intuit, 28 May 2026](https://investors.intuit.com/news-events/press-releases/detail/1313/intuit-mailchimp-launches-analytics-ai-and-expanded-data-integrations-to-give-brands-conversational-actionable-intelligence) | Drafts | — | — | Not for Estonia |
| Smaily (Estonian) | **No MCP**; API only (subscribers, opt-in, unsubscribe). **B** [Smaily API](https://smaily.com/help/api/subscribers-2/create-and-update-subscribers/) | — | — | API on paid plans. **B** [pricing](https://smaily.com/pricing/) | No |
| **Buffer** | `https://mcp.buffer.com/mcp`, OAuth. Tools include `list_channels`, `create_post`, `edit_post`, `delete_post`, `get_aggregated_post_metrics`. `create_post` has `saveToDraft` ("Save as a draft instead of scheduling it") and `mode` `addToQueue` / `shareNow` / `shareNext` / `customScheduled`. **B** [developer guide](https://developers.buffer.com/guides/integrations/mcp.html) — **re-checked**. "MCP access is included on every plan, including Free." **B** [buffer.com/mcp](https://buffer.com/mcp) — **re-checked** | Post, edit, delete | Buffer: "you're always the last step", but `shareNow` publishes at once | Free plan | Yes |
| Publer | `https://mcp.publer.com`. **B** [help](https://publer.com/help/en/article/how-to-set-up-and-use-publers-mcp-server-14orlq0/) | Scheduling | — | Business and Enterprise only | Yes |
| Hootsuite | Four MCPs (Perch publishes). **B** [help](https://help.hootsuite.com/s/article/about-mcps) | Publish | — | `UNKNOWN` | `UNKNOWN` |
| Metricool | `https://ai.metricool.com/mcp`. **B** [help](https://help.metricool.com/how-to-connect-metricools-mcp-eqp9h) — **re-checked** | Scheduling | — | Any plan, including Free; plan limits apply | Yes |
| Canva | `https://mcp.canva.com/mcp`, OAuth; makes and exports designs, does not publish to social networks. **B** [Canva](https://www.canva.dev/docs/connect/canva-mcp-server-setup/) | Designs | Preview and approve, per vendor | Canva account | Yes |
| **Meta Ads** | `https://mcp.facebook.com/ads`, "a Meta-hosted Model Context Protocol server" — **re-checked** | Create and edit campaigns, ad sets, ads | No per-call confirm documented; optional MCP rules (below) | MCP pricing not documented; ad spend applies | `UNKNOWN`; connect on the web first |
| Google Ads | Local, or self-hosted on Cloud Run or another cloud; read-only — **re-checked** | None | — | Needs Google Cloud + Ads API access | Only if someone hosts it; hosted pilot `UNKNOWN` |
| Google Analytics 4 | Local, experimental; read-only (one annotation write behind a flag) | — | — | — | Not phone-ready without a separately hosted bridge |
| Wix | `https://mcp.wix.com/mcp`, official, and a built-in Claude connector. It can call APIs on the owner's site and create, update and publish sites. **B** [Wix](https://dev.wix.com/docs/api-reference/articles/ai-tools/wix-mcp/about-the-wix-mcp) — **re-checked**. Marketing coverage (Wix e-mail campaigns) not checked | Site changes, publish | Not documented | Wix account | Yes |
| Search Console, Business Profile, LinkedIn, YouTube, TikTok, Later, Trustpilot, Squarespace | No vendor MCP found by the leg. Business Profile has an official review-reply API (`accounts.locations.reviews.updateReply`, needs Google's API access approval). **A** [GBP API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply). TikTok describes an Ads MCP inside its own Agentic Hub, with no public URL | — | — | — | No |

The leg found no Estonian or Baltic AI marketing agent with an MCP. Done-for-you engines (Meta Advantage+, Google Performance Max, TikTok Smart+, and e-mail automations that are already switched on) spend or send inside the vendor's product with no per-action approval. Switching one on is itself the action to approve.

## Ranked jobs

Ranked by owner time saved × works today from Claude on the phone × low risk.

| # | Job | Connectors | Approval binds | Risk | Phone |
|---|---|---|---|---|---|
| 1 | Newsletter to existing customers | MailerLite (paid plan) or Omnisend | Subject, sender, body, segment, send time; blocked unless the checks below pass | Medium: wrong segment | Yes |
| 2 | Weekly social post | Buffer (Canva optional for the picture) | Text, image, channels, `saveToDraft` or one exact `dueAt`; never `shareNow` without approval | Medium: public | Yes |
| 3 | Ask every recent buyer for a Google review | Our `send_message` path or MailerLite | Text and recipient rule "everyone who bought in the window" | High if worded wrong; the word checks screen but do not remove it | Yes |
| 4 | "Are my Meta ads wasting money?" | Meta Ads MCP, reporting only | Nothing (read); write tools must stay unused | Low read; high if writes are used | `UNKNOWN` |
| 5 | Reply to a Google review | No official remote MCP | — | — | No |
| 6 | Search Console "pages customers can't find" | No official MCP; owner's own export in a Sheet | — | Low | Only via export |

## Rules that bind it

**Electronic Communications Act § 103¹** (version in force 01.11.2026, published RT I, 11.07.2026, 86; subsection 1 wording in force since 15.03.2019). **A** [Riigi Teataja, ESS](https://www.riigiteataja.ee/akt/ESS) — **re-checked**:

> (1) Füüsilisest isikust sideteenuse kasutaja või kliendi elektrooniliste kontaktandmete kasutamine otseturustuseks on lubatud üksnes tema eelneval nõusolekul. …
> (2) Juriidilisest isikust sideteenuse kasutaja või kliendi elektrooniliste kontaktandmete kasutamine otseturustuseks on lubatud juhul, kui: 1) kontaktandmete kasutamisel antakse iga kord selge ja arusaadav võimalus tasuta ja lihtsal viisil keelata oma kontaktandmete selline kasutamine; …
> (3) Kui isik saab seoses toote müügi või teenuse osutamisega füüsilisest või juriidilisest isikust ostja elektroonilised kontaktandmed, võib … kasutada neid kontaktandmeid ostjale oma samasuguste toodete või teenuste otseturustuseks juhul, kui: 1) ostjale antakse tema elektrooniliste kontaktandmete esmase kogumise ajal selge ja arusaadav võimalus … keelata …; 2) ostjale antakse iga kord … selge ja arusaadav võimalus … keelata …
> (4) … on keelatud juhul, kui: 1) isik, kelle nimel teave edastatakse, ei ole tuvastatav; 2) edastatud teave ei sisalda juhendit või teavet, mis võimaldab … oma õigust keeldumisele realiseerida; … 5) … on keelanud …
> (5) … nõusoleku tõendamise kohustus on isikul, kelle nimel otseturustust tehakse.

This matches the existing rule in our customer-follow-ups playbook. AKI supervises this section. **B** [AKI FAQ](https://www.aki.ee/isikuandmed/kkk/interneti-ja-veebitegevused).

**Google review policy.** Merchants must not "Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review", or "Discourage or prohibit negative reviews, or selectively solicit positive reviews from customers". **A** (platform policy) [Google](https://support.google.com/business/answer/7400114?hl=en) — **re-checked**. EU law also bans false reviews and misrepresenting reviews, for example by publishing only the positive ones (UCPD Annex I points 23b and 23c, added by Directive (EU) 2019/2161). **A** [Commission notice](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=oj:JOC_2021_526_R_0001).

**EU AI Act Article 50(4).** Deployers must disclose deepfake image, audio or video. Text "published with the purpose of informing the public on matters of public interest" must also be disclosed, but not "where the AI-generated content has undergone a process of human review or editorial control and where a natural or legal person holds editorial responsibility". **A** [AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50) — **re-checked**. Article 50 applies "from 2 August 2026"; marking by systems already on the market applies "only as from 2 December 2026". **B** [Commission FAQ](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act) — **re-checked**.

**Environmental claims.** TTJA: "Keelatud on üldised keskkonnaväited, mille keskkonnamõju ei ole võimalik tõendada". Generic claims need a recognised Type I ecolabel or the higher environmental performance set by EU law. The consumer-empowerment directive rules apply from 27 Sep 2026. **B** [TTJA](https://www.ttja.ee/ariklient/ettevotlus/tarbijakaitsenouded-tegevusalale/keskkonnavaited).

**Advertising Act § 6.** A person's name, voice or image needs their prior written consent in an ad. **A** [Reklaamiseadus](https://estlex.ee/oigusakt/reklaamiseadus) (leg-reported).

**Checks a playbook can run deterministically before an approval:** the sender is named; the body has an opt-out; the recipient basis is consent (natural person), an opt-out (legal person) or the § 103¹ (3) existing-customer basis, and the recipient has not refused; a review request has no incentive words (soodustus, kingitus, tasuta, preemia, discount, free, gift, voucher, "5 tärni", "5-star") and no "only if you were happy" wording, and goes to every buyer in the window; green-claim words (keskkonnasõbralik, roheline, kliimaneutraalne, biolagunev, eco-friendly) are flagged for proof. These checks stop the obvious unlawful payload. They do not prove that a consent is valid or that a claim is true, and words miss meaning (a promised refund is an incentive too). The assistant still judges the meaning before asking, and the owner approves the text and the recipient rule.

## Ad spend

- Meta account spending limit: "a flexible lifetime cap on the total money your ad account can spend across all ad campaigns", and "when spending reaches the limit, your ads pause, and the account stops spending". It is not available on accounts that pay from prepaid funds. **A** [Meta](https://www.facebook.com/business/help/141820733085330) — **re-checked**.
- Meta ads MCP rules: `create_campaign` / `create_ad_set` / `create_ad` (trigger `always`) and `edit_budget` with `percentage_change`, `absolute_change` or `absolute_max`. Rules are in **limited availability**: a business that is not enrolled gets error code 10. **A** [Meta rules](https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-rules-best-practices) — **re-checked** (the leg's "off until an admin sets them" is not on the page).
- Google: "For most campaigns, the daily spending limit is your average daily budget multiplied by 2", and the monthly limit is "30.4 times your average daily budget". **A** [Google](https://support.google.com/google-ads/answer/10486637) — **re-checked**.
- A Meta connector added directly in Claude is outside Launchpad's approval gate. The ads job therefore stays a read-only report. Before any write, the owner sets the Meta account spending limit, and any budget change is an exact-amount approval.

## Candidate tasks

**Limitation, stated plainly.** Launchpad is not in the path of a vendor connector's call: the assistant calls MailerLite, Omnisend, Buffer or Meta directly. The approval is therefore one the assistant follows, not one a server enforces. This is the same as our existing `send_message` playbooks ("Launchpad sends nothing"; the assistant sends with its own tools). The procedure: `request_approval` binds the exact payload; just before the send or publish call the assistant re-reads the provider's draft and proceeds only if `get_approval` confirms that unchanged payload is approved; then `record_action_outcome`. Drafts may be created freely. Sending, scheduling and publishing may not. Buffer's reference says "An assistant does not need a fresh read to work this out"; the playbook overrides that with its re-read. The hard backstops are the vendor's own: a Buffer draft does not publish, and Meta's account spending limit pauses ads. True server enforcement would need Launchpad to proxy every vendor write. That is a product-wide architecture question, not a marketing one, and it is out of scope here.

1. **Catalogue: marketing connectors.** Add MailerLite (sending needs a paid plan), Omnisend, Buffer, Canva, Wix and Meta Ads (reports only) to `estonian-business-services.json` with the limitations above. Done when `search_services` returns each with access_and_price and limitations, and Smaily is recorded as API-only.
2. **Newsletter playbook.** Done when the approval binds the sender, subject, body, segment (with its member count) and send time; the § 103¹ checks pass; the assistant re-reads the campaign and segment before `schedule_campaign` (or Omnisend's send) and stops on any change; and the outcome is recorded.
3. **Review-request playbook.** Done when a message to every buyer in a window is blocked on incentive or selective wording (words plus the assistant's reading of the meaning), uses the same consent checks, and is sent only after an approval bound to the exact text and recipients.
4. **Social post playbook (Buffer).** Done when the approval binds the text, image, channels and draft or exact `dueAt`; the post is re-read before it is scheduled; `shareNow` is never used without that approval; and the outcome records the Buffer post id.
5. **Meta ads report.** Done when the playbook reads spend and results only, and first tells the owner to set the ad account spending limit. Launchpad cannot block a directly connected Meta connector's write tools; the platform limit is the only hard cap, and the memo says so to the owner.

## UNKNOWN (default taken)

- Whether MailerLite, Omnisend, Klaviyo or Brevo confirm on their side before sending. Default: assume the tool sends; Launchpad's approval is the gate.
- Whether a review-request e-mail is always direct marketing. Default: treat it as direct marketing under § 103¹.
- Whether Meta Ads OAuth works in the Claude phone app, and Brevo header auth in claude.ai. Default: connect on the web, then test one read on the phone.
- Hootsuite URLs and plan gate. Default: not recommended until the owner's account shows them.
- The § 103¹ fine amount. Default: quote no euro figure; say AKI can order the sending to stop.
