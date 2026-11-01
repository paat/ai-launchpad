# S — Websites the owner's assistant can build and run

Research date 1 Nov 2026. One Grok research leg (grok-4.7, live web, read-only); the load-bearing claims were re-checked by the orchestrator at the source the same day (marked **re-checked**). Tiers: **A** statute, specification or vendor API reference; **B** official documentation; **C** third-party report. Prices and plan gates change: every one below is dated and must be re-read at checkout.

## Question

Can the owner's own assistant (Claude or ChatGPT, often on the phone) create a website for a micro business and keep it up to date — opening hours, prices, photos, news, domain — and which services make that possible today? The connect-service playbook (`src/catalog.ts`) has no website kind; earlier research (rows C26–C32 in [C](C-customers-sales-communication.md)) listed Shopify, WooCommerce, Voog, Wix and Zone but tested nothing.

## Answer

- **Yes, without Launchpad hosting anything.** Several builders now publish their own remote MCP server with OAuth, and some sit in Claude's connector directory. The site stays in the owner's account at the builder; Launchpad adds only the exact-change approval and the recorded outcome.
- **Default for "I have no website": Wix.** Wix's MCP lets an agent do "account-level actions, like creating and publishing a site", and it is "a built-in connector in Claude" (directory: made by Wix, Anthropic verified, added January 2026). **A** [Wix MCP](https://dev.wix.com/docs/overview/ai-the-wix-platform/the-wix-mcp), **B** [Claude directory: Wix](https://claude.com/marketplace/connectors/wix) — **re-checked**. A free site on a `wixsite.com` address costs nothing; a custom domain needs a paid plan (price for Estonia `UNKNOWN`).
- **A shop selling goods: Shopify's Claude connector.** It "creates a store that you can view and build on before you have a Shopify account"; refunds and cancellations "are blocked even when you approve write access"; "no extra Shopify fee for using the connector". Setup on a desktop browser; on the phone it "depends on Claude". **A** [Shopify connector for Claude](https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/shopify-connector-for-claude) — **re-checked**. Theme publishing is contradictory on the same page: it says the connector "always asks you to confirm before it publishes a theme" and also that it cannot publish a live theme. Default: the owner publishes a theme in Shopify admin; the assistant edits products and an unpublished theme.
- **Blog with real drafts: WordPress.com.** One OAuth 2.1 server for all the owner's sites, "every WordPress.com site, free or paid", and Jetpack-connected self-hosted sites "without a Jetpack plan" (updated 22 Oct 2026). `posts.create` "creates as draft by default"; "if status is publish, changes go live immediately"; ordinary writes ask for `user_confirmed: true` depending on the site's approval settings, while "DNS or nameserver changes, always require it". **A** [WordPress.com MCP](https://developer.wordpress.com/docs/mcp/), [tools reference](https://developer.wordpress.com/docs/mcp/tools-reference/) — **re-checked**. That flag is the agent's own claim, not an exact-payload approval: Launchpad's approval is still required before anything goes live. The draft → approve → publish shape fits Launchpad's model.
- **Estonian builders cannot be driven yet.** Voog has a full admin API but no official MCP (only a community local server); Zone.ee has a customer API, not an MCP; Veebimajutus.ee documents neither. **A** [Voog API](https://www.voog.com/developers/api), **B** [Zone API](https://www.zone.ee/help/kb/zone-api/), **C** [community voog-mcp](https://github.com/runnel/voog-mcp).
- **Domains stay the owner's.** No `.ee` registrar offers a registrant MCP; the registry's EPP/REPP is for accredited registrars only, and Zone authorises a `.ee` registration by eeID or by paying the invoice. The assistant may check availability and expiry; buying, renewing and transfers stay with the owner. **B** [internet.ee registry](https://www.internet.ee/registrar-portal/new-registry-system), [Zone .ee registration](https://www.zone.ee/help/kb/kuidas-registreerida-edukalt-ee-domeen/).
- **Most micro businesses are outside the accessibility law.** "The Products and Services Accessibility Act does not apply to microenterprises providing services" — fewer than ten persons and turnover or balance sheet ≤ €2 m; requirements apply from 28 Jun 2025. **B** [TTJA](https://www.ttja.ee/en/business-client/entrepreneurship/digital-accessibility/digital-accessibility-services) — **re-checked**. What does bind every business site is the company-information list (below).

## Services the assistant can drive (1 Nov 2026)

| Service | Route | Auth | Can write / publish | Draft before live | Plan | Directory | Source |
|---|---|---|---|---|---|---|---|
| **Wix** | `https://mcp.wix.com/mcp` or Claude directory | Wix account (or API key + account id) | Create and publish a site; site APIs (store, bookings, blog, contacts) | `UNKNOWN` — treat every write as live | Free site with Wix branding; custom domain paid | Claude (Jan 2026) | **A** [Wix MCP](https://dev.wix.com/docs/overview/ai-the-wix-platform/the-wix-mcp) **re-checked** |
| **Shopify** | Claude directory / ChatGPT plugin | Shopify admin approval | Products, collections, inventory, discounts; theme publish contradictory in the source (owner publishes); money actions blocked | Products draft/active; theme edits unpublished | Standard Shopify plan; connector free | Claude, ChatGPT | **A** [Shopify help](https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/shopify-connector-for-claude) **re-checked** |
| **WordPress.com** (+ Jetpack sites) | `https://public-api.wordpress.com/wpcom/v2/mcp/v1` | OAuth 2.1 | Posts, pages, media, menus, settings, site creation, DNS | Yes: create = draft; `publish` goes live | Free or paid | Claude, ChatGPT | **A** [overview](https://developer.wordpress.com/docs/mcp/), [tools](https://developer.wordpress.com/docs/mcp/tools-reference/) **re-checked** |
| **Framer** | `https://mcp.framer.com/mcp` | OAuth | Pages, layouts, CMS; "ask your agent to publish" | Branch, then merge or publish | Not stated | Claude, ChatGPT | **A** [getting started](https://www.framer.com/help/articles/getting-started-with-framer-mcp/), [capabilities](https://www.framer.com/help/articles/what-you-can-do-with-framer-mcp/) **re-checked**; no localization in MCP (30 Oct 2026) |
| **Webflow** | `https://mcp.webflow.com/mcp` | OAuth | Pages, CMS, assets, SEO; publish *unverified* | Page branches Enterprise only *unverified* | Free Starter *unverified* | Claude | **A** [getting started](https://developers.webflow.com/mcp/reference/getting-started) URL/OAuth **re-checked**; plan and publish only from the leg's reading of [Webflow help](https://help.webflow.com/hc/en-us/articles/52536562285203-Webflow-MCP-server-overview) (403 on re-check) |
| **Hostinger** | `https://mcp.hostinger.com` | OAuth 2.1 | 372 tools: deploy sites, Horizons "create a website from a prompt", DNS records, "search and register domains" | `UNKNOWN` | Hostinger plan | Custom connector | **A** [Hostinger connector](https://docs.hostinger.com/hostinger-connector/overview) **re-checked** (9 Oct 2026) |
| Squarespace | `https://mcp.squarespace.com/mcp` | Account for commerce | Products and contacts only; no page or hours tools; domains return a buy link | New products hidden until published | Squarespace plan | Custom connector | **A** [Squarespace MCP](https://developers.squarespace.com/mcp/overview), leg only |
| Self-hosted WordPress | WordPress MCP Adapter plugin | Application password via local proxy | Whatever abilities the site opts in | Per ability | Free plugin | — (desktop setup) | **A** [mcp-adapter](https://github.com/WordPress/mcp-adapter), leg only |
| Cloudflare | `https://mcp.cloudflare.com/mcp` | OAuth scopes | DNS, Workers, SSL via the API | Per call | Account plan | Custom connector | **A** [Cloudflare MCP](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/), leg only |
| Netlify, Vercel | `netlify-mcp.netlify.app/mcp`, `mcp.vercel.com` | OAuth | Deploy code; deployment status | Deploy = publish | Free tiers | Claude | **A** [Netlify](https://docs.netlify.com/build/build-with-ai/netlify-mcp-server/), [Vercel](https://vercel.com/docs/agent-resources/vercel-mcp), leg only |
| Lovable, v0, Replit | Vendor MCPs | OAuth | Generate and deploy an *app* (spends credits) | Until deploy | Lovable Pro from $25/mo for a custom domain | Varies | **A** [Lovable](https://docs.lovable.dev/integrations/lovable-mcp-server), [v0](https://v0.app/docs/api/v2/guides/mcp-server), [Replit](https://docs.replit.com/platforms/mcp-server), leg only |
| GoDaddy | `https://mcp.godaddy.com` | None | Domain search only; no register, renew or DNS | — | — | Claude, ChatGPT | **A** [GoDaddy MCP](https://developer.godaddy.com/docs/api-users/mcp), leg only |
| Voog, Zone.ee, Veebimajutus.ee | API only (Voog, Zone) / none | Token / basic auth | Not drivable from a phone assistant | — | — | — | **A** [Voog API](https://www.voog.com/developers/api), **B** [Zone API](https://www.zone.ee/help/kb/zone-api/), leg only |
| Ghost, Durable, Jimdo, Carrd, Google Sites, Bolt, Google Business Profile | No official MCP found | — | — | — | — | — | Leg found none on 1 Nov 2026; never ship a community URL as official |

## Steps that stay the owner's

Account signup and terms; the one-time OAuth approval (desktop browser is safest); paying for a plan; buying or renewing a domain (`.ee` also needs eeID or payment at the registrar). Everything else — text, prices, hours, photos, news, products, publish — the assistant can do once the owner approves the exact change.

## Jobs the assistant can take off the owner

| Job | Kind | Where it works |
|---|---|---|
| Read the site: hours, prices, contact, last publish, SSL, domain expiry | Read-only check | All drivable services above |
| Change opening hours, price list, page text | Publish (approval) | Wix, WordPress.com, Framer, Webflow, Shopify pages, Hostinger sites |
| Add or change a product and its price | Publish (approval) | Shopify, Wix store, Squarespace, WooCommerce via WordPress.com |
| Post news or a blog post | Publish (approval) | WordPress.com (draft first), Wix blog, Webflow/Framer CMS, Shopify blog |
| Swap photos | Publish (approval) | WordPress.com media, Webflow assets, Shopify files, Framer uploads |
| Fix a DNS record | Publish (approval, with the before/after records) | Cloudflare, Hostinger, WordPress.com |
| Renew domain or plan | Owner pays; assistant shows the invoice and expiry | Owner's registrar or builder |
| Answer contact-form messages | Gap: they arrive by e-mail, and a reply would use the `send_message` approval kind, but no current playbook covers a general reply (only payment reminders and customer follow-ups) | — |

## Estonian rules an assistant would check

- **Company information on the site** (Information Society Services Act § 4 (1)): name, registry code and register, address, e-mail and other contacts; whether prices include taxes and delivery; the VAT number if VAT-registered. **A** [Riigi Teataja, English](https://www.riigiteataja.ee/en/akt/519082024013) — quoted by the leg; Riigi Teataja did not render for re-check. Registry code, address and VAT number already come from Ärikratt, so this check needs no owner question.
- **Prices**: show the final price with VAT. A discount on *goods* must show the lowest price of the previous 30 days; services fall under the general not-misleading rule. **B** [eesti.ee, 29 Apr 2026](https://www.eesti.ee/et/artikkel/tarbijakaitse/tarbimine/milline-teave-ja-maergistus-peab-kaubal-olema), [TTJA](https://ttja.ee/uued-reeglid-hindade-ja-arvustuste-kuvamisel) — leg.
- **Accessibility**: service microenterprises are exempt (above); e-commerce by larger firms is in scope. **B** TTJA — **re-checked**; the statute wording (LPS § 3 (4), § 22 (11)) was quoted by the leg only.
- **Cookies**: consent must be voluntary, specific, informed, unambiguous; no pre-ticked boxes. **B** [AKI consent guidance](https://www.aki.ee/9-peatukk-nousoleku-kusimine) — leg. The exact statute section for website cookies was not retrieved: `UNKNOWN`.

## Recommendation for AI Launchpad

1. **Add `website` to the connect-service playbook** (and to `CONNECTION_KINDS`). Routes, in order: the owner's existing builder if it is drivable (table above); no website yet → Wix from the Claude directory (shop selling goods → Shopify; blog → WordPress.com); Voog, Zone or another undrivable builder → say so plainly and offer to draft the text for the owner to paste. Read-only check: the assistant reads back the site's opening hours or contact block and the owner sees the same on the live site. Directory connectors (Wix, Shopify, WordPress.com, Framer, Webflow) do not use the free plan's single custom-connector slot — whether every directory connector is on Claude's free plan and the phone app: `UNKNOWN`; default: connect once on a desktop browser.
2. **Add one playbook `website-update` and one approval kind `publish_website`.** The payload is the exact change: site, page or product, field, old value, new value, and whether it goes live. Draft first where the service has drafts (WordPress.com, Shopify products, Framer branches); a draft is not live and needs no approval. Treat Wix writes as live. Shopify themes are the exception: the assistant edits an unpublished theme and the owner publishes it in Shopify admin, because Shopify's page contradicts itself on theme publishing. This needs a new first outcome for the kind: `published` or `failed` (today `OUTCOME_FIRST` in `src/mcp.ts` has no website kind and the `record_action_outcome` enum has no `published`). Approve each change one by one; no standing rule for website changes in this round.
3. **Fold the legal check into `website-update` as a read-only first step**: company information, VAT-inclusive prices, 30-day prior price on goods discounts. No accessibility work unless the business is not a microenterprise.

**Do not build:** Launchpad-hosted sites or page storage (principle 5); Voog, Zone or Veebimajutus adapters (no MCP; revisit only on demand from the friction loop); wrappers around Ghost, Durable, Jimdo, Carrd, Google Sites or Google Business Profile; domain purchase, renewal or `.ee` transfer; Lovable/v0/Replit as the default (they build apps and spend credits); analytics or ad pixels.

## UNKNOWNs and defaults

| Unknown | Default |
|---|---|
| Wix and Shopify plan prices for Estonia | Never quote a price; the connector itself is free; the owner reads the plan at checkout |
| Whether Wix saves page edits as drafts, and whether it can place a map | Treat every Wix write as live, so always approve first; a map may need one editor step by the owner |
| Directory connectors on Claude's free plan and in the phone app | Connect once on a desktop browser; do not promise phone-only setup |
| Webflow plan gate and publish tool (help page 403 on re-check) | Use only when the owner already has Webflow |
| Statute section for website cookies | Necessary cookies only; never add analytics or a pre-ticked banner |
| Hostinger `.ee` registration and data location | Use Hostinger only when the owner already hosts there |
| EU data location for Wix, Shopify, Webflow, Framer, WordPress.com | Do not promise EU-only processing; the site lives under the vendor's terms |
