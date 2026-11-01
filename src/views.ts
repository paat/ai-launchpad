import type { Assessment, Coverage } from "./core.js";
import { isHandled } from "./core.js";
import { isDone, offerCapCents, type Handover, type Job } from "./handover.js";
import { approvalAddressMissing, normAddress, standingRecipients, standingRuleName, STANDING_DEFAULTS, STANDING_KINDS, type ApprovalRow, type AssistantMilestones, type Exclusion, type StandingRule } from "./mcp.js";
import type { CompanyCard } from "./arikratt.js";
import { ET_OF, SRC, tallinnDate, type FactNeeded, type Obligation, type Source } from "./obligations.js";
import { BASETEN_MODEL } from "./model-quality.js";
import { DEMO_LABELS_EN } from "./fixtures.js";
import { PLAYBOOKS, safeHttps, type ServiceRecord } from "./catalog.js";
import { BLOCKER_HANDOFF, BLOCKER_LABELS, BLOCKER_LABELS_ET, CATEGORY_LABELS, CATEGORY_LABELS_ET, classifiedByLabel, type Blocker, type Category, type DemandItem, type OwnerNeed } from "./unmet-needs.js";
import * as QRCode from "qrcode";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// One landing case supplies the card, its phone conversation, transcript and
// scoped 18 s CSS timeline. Amount tokens are formatted with fmtEur at render.
type LandingText = { et: string; en: string };
type LandingConnector = LandingText & { g?: CatalogueGroup; href?: string; launchpad?: boolean; subtitleEt?: string; subtitleEn?: string };
type LandingChip = { kind: "rule" } | { kind: "official"; source: "kmd" | "annual" } | { kind: "official"; et: string; en: string };
type LandingApproval = { title: LandingText; client: string; amountCents: number; allow?: LandingText & { standingEt: string; standingEn: string } };
type LandingCase = LandingText & {
  id: string; bodyEt: string; bodyEn: string; connectors: readonly LandingConnector[]; registerData?: boolean;
  ask: LandingText; answer: LandingText & { boldEt?: string; boldEn?: string }; chips?: readonly LandingChip[];
  approval?: LandingApproval; next?: LandingText;
};
const ACCOUNTING: LandingConnector = { et: "Raamatupidamine", en: "Accounting", g: "raamatupidamine" };
const EMAIL: LandingConnector = { et: "E-post", en: "E-mail", g: "epost" };
const BANK: LandingConnector = { et: "Pank", en: "Bank", g: "pank" };
const CALENDAR: LandingConnector = { et: "Kalender", en: "Calendar", g: "epost" };
const ARIKRATT: LandingConnector = { et: "Ärikratt · soovitatud", en: "Ärikratt · recommended", href: "/kataloog?q=%C3%84rikratt", subtitleEt: "äriandmed", subtitleEn: "business data" };
const APPROVAL: LandingConnector = { et: "AI-hüppelaud: kinnitus", en: "AI Launchpad: approval", launchpad: true };
const DEADLINE: LandingConnector = { et: "AI-hüppelaud: tähtaeg", en: "AI Launchpad: deadline", launchpad: true };
const DEADLINES: LandingConnector = { et: "AI-hüppelaud: tähtajad", en: "AI Launchpad: deadlines", launchpad: true };
const RULE: LandingChip = { kind: "rule" };
const KMD_SOURCE: LandingChip = { kind: "official", source: "kmd" };
const ANNUAL_SOURCE: LandingChip = { kind: "official", source: "annual" };
const LANDING_CARDS: readonly LandingCase[] = [
  {
    id: "unpaid", et: "Võlgnikud", en: "Unpaid invoices",
    bodyEt: "Leiab tasumata arved ja saadab viisaka meeldetuletuse. Iga kiri läheb välja sinu kinnitusega.",
    bodyEn: "Finds unpaid invoices and sends a polite reminder. Every message goes out with your approval.",
    connectors: [ACCOUNTING, EMAIL, APPROVAL],
    ask: { et: "Kes mulle võlgu on?", en: "Who owes me money?" },
    answer: {
      et: "Sinu raamatupidamisprogrammi järgi on kolm arvet üle tähtaja, kokku {total}. Koostasin igale viisaka meeldetuletuse.",
      en: "Your accounting software shows three invoices overdue, {total} in total. I drafted a polite reminder for each.",
    },
    approval: {
      title: { et: "Maksemeeldetuletus · 1/3", en: "Payment reminder · 1/3" }, client: "Demo Klient OÜ", amountCents: 24000,
      allow: { et: "Luba sarnased automaatselt", en: "Allow similar ones automatically", standingEt: "Püsiluba: meeldetuletused kuni {cap}", standingEn: "Standing approval: reminders up to {cap}" },
    },
    next: { et: "Järgmised saadan ise.", en: "I'll send the next ones myself." },
  },
  {
    id: "kmd", et: "KMD", en: "VAT return",
    bodyEt: "Kogub kuu müügi- ja ostuarved ning paneb deklaratsiooni andmed valmis. Esitad ise.",
    bodyEn: "Gathers the month's sales and purchase invoices and gets the return's figures ready. You file it.",
    connectors: [ACCOUNTING, DEADLINE], registerData: true,
    ask: { et: "Kas oktoobri KMD on valmis?", en: "Is October's VAT return ready?" },
    answer: {
      et: "Raamatupidamise järgi on oktoobris 14 müügi- ja 9 ostuarvet. Andmed on valmis, esitad e-maksuametis ise. Tähtaeg on 20. nov.",
      en: "Your books show 14 sales and 9 purchase invoices for October. The figures are ready; you file in e-MTA yourself. Due 20 Nov.",
      boldEt: "20. nov", boldEn: "20 Nov",
    },
    chips: [RULE, KMD_SOURCE],
  },
  {
    id: "annual", et: "Aastaaruanne", en: "Annual report",
    bodyEt: "Vaatab, mis aruandeks puudu on, ja paneb nimekirja kokku. Allkirjastad ise.",
    bodyEn: "Checks what the report is still missing and makes the list. You sign it.",
    connectors: [ACCOUNTING, DEADLINE], registerData: true,
    ask: { et: "Mis aastaaruandest puudu on?", en: "What's missing from the annual report?" },
    answer: {
      et: "Puudu on inventuuri kokkuvõte ja kasumi jaotamise otsus. Muu on raamatupidamises olemas. Allkirjastad e-äriregistris ise. Tähtaeg on 30. juuni.",
      en: "Missing: the stock-take summary and the profit-distribution decision. Everything else is in your books. You sign in the e-Business Register yourself. Due 30 Jun.",
      boldEt: "30. juuni", boldEn: "30 Jun",
    },
    chips: [RULE, ANNUAL_SOURCE],
  },
  {
    id: "calendar", et: "Tähtajad kalendrisse", en: "Deadlines in your calendar",
    bodyEt: "Arvutab sinu ettevõtte maksu- ja aruandetähtajad avalikest registritest ja paneb need sinu kalendrisse.",
    bodyEn: "Calculates your company's tax and filing deadlines from public registers and puts them in your calendar.",
    connectors: [DEADLINES, CALENDAR], registerData: true,
    ask: { et: "Pane mu tähtajad kalendrisse.", en: "Put my deadlines in my calendar." },
    answer: {
      et: "Lisasin 4 tähtaega: TSD 10. nov, KMD 20. nov, TSD 10. dets, KMD 21. dets.",
      en: "Added 4 deadlines: TSD 10 Nov, VAT 20 Nov, TSD 10 Dec, VAT 21 Dec.",
    },
    chips: [RULE],
  },
  {
    id: "invoice", et: "Arve kliendile", en: "Invoice a customer",
    bodyEt: "Koostab arve tehtud töö põhjal ja saadab selle kliendile, kui oled kinnitanud.",
    bodyEn: "Drafts the invoice from the work done and sends it to the customer once you approve.",
    connectors: [ACCOUNTING, EMAIL, APPROVAL],
    ask: { et: "Tee Demo Klient OÜ-le arve oktoobri töö eest.", en: "Invoice Demo Klient OÜ for October's work." },
    answer: { et: "Koostasin arve tehtud töö põhjal.", en: "I drafted the invoice from the work done." },
    approval: { title: { et: "Arve", en: "Invoice" }, client: "Demo Klient OÜ", amountCents: 89280 },
  },
  {
    id: "payments", et: "Laekumised", en: "Incoming payments",
    bodyEt: "Võrdleb panga laekumisi arvetega ja näitab, mis on veel maksmata.",
    bodyEn: "Matches bank payments to invoices and shows what is still unpaid.",
    connectors: [BANK, ACCOUNTING],
    ask: { et: "Kes on oktoobris maksnud?", en: "Who paid in October?" },
    answer: {
      et: "Pangas on 5 laekumist, 4 sobivad arvetega. Maksmata: Demo Partner OÜ, {unpaid}.",
      en: "5 payments arrived; 4 match invoices. Unpaid: Demo Partner OÜ, {unpaid}.",
    },
  },
  {
    id: "customer", et: "Uue kliendi kontroll", en: "Check a new customer",
    bodyEt: "Enne tööd vaatab üle kliendi registriandmed, maksuvõla ja esitatud aruanded.",
    bodyEn: "Before you take the job, checks the customer's register data, tax debt and filed reports.",
    connectors: [ARIKRATT],
    ask: { et: "Kontrolli Näidis Ehitus OÜ enne pakkumist.", en: "Check Näidis Ehitus OÜ before I quote." },
    answer: {
      et: "Registris aktiivne, maksuvõlga pole, eelmise aasta aruanne on esitatud.",
      en: "Active in the register, no tax debt, last year's report filed.",
    },
    chips: [{ kind: "official", et: "Allikas: avalikud registrid", en: "Source: public registers" }],
  },
  {
    id: "purchases", et: "Ostuarved", en: "Purchase invoices",
    bodyEt: "Korjab e-postist ostuarved kokku ja lisab need raamatupidamisse.",
    bodyEn: "Collects purchase invoices from your e-mail and adds them to your books.",
    connectors: [EMAIL, ACCOUNTING],
    ask: { et: "Korja oktoobri ostuarved kokku.", en: "Collect October's purchase invoices." },
    answer: {
      et: "Leidsin e-postist 7 ostuarvet, kokku {purchases}. Lisasin need raamatupidamisse kinnitamata kannetena.",
      en: "Found 7 purchase invoices in your e-mail, {purchases} in total. I added them to your books as unconfirmed entries.",
    },
  },
];

// Each beat grows in at its percentage and the whole chat fades out at the
// end. Without animation (prefers-reduced-motion) base styles are final frames.
const HIDE = "max-height:0;opacity:0;transform:translateY(12px)";
const teaserBeat = (id: string, k: string, a: number, cap = "16rem") => `.b-${id}-${k}{animation-name:lp-${id}-${k}}@keyframes lp-${id}-${k}{0%,${a}%{${HIDE}}${a + 2}%,94%{max-height:${cap};opacity:1;transform:none}98%{max-height:${cap};opacity:0}100%{max-height:0;opacity:0}}`;
const teaserTyping = (id: string, k: string, a: number, b: number) => `.b-${id}-${k}{animation-name:lp-${id}-${k}}@keyframes lp-${id}-${k}{0%,${a}%{max-height:0;opacity:0}${a + 1}%,${b}%{max-height:4rem;opacity:1}${b + 1}%,100%{max-height:0;opacity:0}}`;
const teaserTap = (id: string, k: string, a: number) => `@keyframes lp-${id}-${k}-out{0%,${a}%{opacity:1}${a + 1}%,100%{opacity:0}}@keyframes lp-${id}-${k}-in{0%,${a}%{opacity:0;transform:scale(.96)}${a + 2}%,100%{opacity:1;transform:none}}@keyframes lp-${id}-${k}-tap{0%,${a - 8}%{opacity:0;transform:scale(.3)}${a - 5}%{opacity:1;transform:scale(1)}${a}%,100%{opacity:0;transform:scale(2.4)}}`;
const TEASER_CSS = LANDING_CARDS.map((c) => {
  const id = c.id, css = [teaserBeat(id, "me1", 3), teaserTyping(id, "t1", 7, 19), teaserBeat(id, "ai1", 19)];
  if (c.approval) {
    css.push(teaserBeat(id, "card", 26, "48rem"), teaserTap(id, "approve", 38));
    css.push(`.b-${id}-card .mock-wait,.b-${id}-card .mock-approve{animation-name:lp-${id}-approve-out}.b-${id}-card .mock-ok,.b-${id}-card .mock-done{animation-name:lp-${id}-approve-in}.b-${id}-card .mock-btn>.mock-tap{animation-name:lp-${id}-approve-tap}`);
    if (c.approval.allow) {
      css.push(teaserBeat(id, "allow", 43), teaserTap(id, "allow", 54));
      css.push(`.b-${id}-allow .mock-allow{animation-name:lp-${id}-allow-out}.b-${id}-allow .mock-rule{animation-name:lp-${id}-allow-in}.b-${id}-allow .mock-btn>.mock-tap{animation-name:lp-${id}-allow-tap}`);
    }
  }
  if (c.next) css.push(teaserTyping(id, "t2", 59, 69), teaserBeat(id, "ai2", 69));
  return css.join("\n");
}).join("\n");

const CSS = `
/* --- Tokens (design direction A „Selge leht”, docs/design/direction-a) --- */
:root{color-scheme:light;
--c-bg:#fff;--c-surface:#fff;--c-surface-2:#F4F6F2;--c-surface-3:var(--c-surface-2);
--c-text:#14201A;--c-muted:#4F5B53;--c-primary:#1B5E3B;--c-on-primary:#fff;--c-link:var(--c-primary);
--c-deep:#0F3D25;--c-mint:#A3E0B5;
--c-att:#9A4A00;--c-att-dark:#6B4E00;--c-att-bg:#FFF4D6;--c-att-bd:#F0C36B;
--c-border:#DCE2DA;--c-divider:#E6EAE3;--c-control:#6f7d67;--c-control-2:#4f7a4a;--c-step-todo:#7d8a76;
--c-danger:#B42318;--c-focus:#1f5fd6;--c-pulse:#b07d00;
--lbl-official-bg:#e1f0e3;--lbl-official-fg:#14502a;--lbl-official-bd:#B9DCC2;
--lbl-rule-bg:#fff;--lbl-rule-fg:#1B5E3B;--lbl-rule-bd:#1B5E3B;
--lbl-assistant-bg:#eceee9;--lbl-assistant-fg:#3d4640;--lbl-assistant-bd:#c9cec5;
--lbl-owner-bg:#14201A;--lbl-owner-fg:#fff;--lbl-owner-bd:#14201A;
--lbl-ai-bg:#efe9fb;--lbl-ai-fg:#4c2a85;--lbl-ai-bd:#c9b8ec;--lbl-ai-tint:#f8f5fd;
--lbl-sample-bg:transparent;--lbl-sample-fg:#4F5B53;--lbl-sample-bd:#8A948C;
--lbl-where-bg:var(--c-surface);--lbl-where-fg:var(--c-text);--lbl-where-bd:var(--c-border);
--st-drafted-bg:#eceee9;--st-drafted-fg:#3d4640;
--st-waiting-bg:var(--c-att-bg);--st-waiting-fg:var(--c-att-dark);--st-waiting-bd:var(--c-att-bd);
--st-approved-bg:var(--c-primary);--st-approved-fg:#fff;
--st-sent-bg:#eaf4ec;--st-sent-fg:var(--c-primary);
--st-accepted-bg:#e1f0e3;--st-accepted-fg:#14502a;
--st-rejected-bg:#fbe5e3;--st-rejected-fg:var(--c-danger);
--st-paid-bg:#d9efe9;--st-paid-fg:#0f4f43;
--st-void-bg:#fbe5e3;--st-void-fg:var(--c-danger);
--fs-xs:.8125rem;--fs-sm:.9375rem;--fs-md:1rem;--fs-lg:1.125rem;--fs-xl:1.5rem;--fs-2xl:2rem;
--fs-h1:clamp(1.75rem,5.5vw,2.5rem);--fs-h2:1.25rem;--fs-display:clamp(2.125rem,6.5vw,3.25rem);--fs-amount:2.75rem;
--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-8:32px;--s-12:48px;--s-16:64px;
--r-sm:6px;--r-md:12px;--r-lg:16px;--r-xl:20px;--tap:44px;
/* One px at the default text size, in rem so it grows with text zoom (the root is 17px on phones). */
--px:calc(1rem / 16);
--ease:cubic-bezier(.2,.7,.2,1);--t-fast:160ms;--t-med:200ms}

/* --- Base and shell --- */
*{box-sizing:border-box}
@media (max-width:480px){html{font-size:106.25%}:root{--px:calc(1rem / 17)}}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background:var(--c-bg);color:var(--c-text);line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:640px;margin:auto;padding:var(--s-2) var(--s-4) var(--s-8)}
header.top{display:flex;align-items:center;gap:var(--s-3);min-height:60px;padding:var(--s-2) 0}
.brand{display:inline-flex;align-items:center;gap:10px;min-height:var(--tap);margin-right:auto;color:var(--c-text);text-decoration:none;font-weight:800;font-size:var(--fs-lg);letter-spacing:-.02em;white-space:nowrap}
.mark{position:relative;flex:none;width:24px;height:24px;border-radius:7px;background:var(--c-deep)}
.mark::after{content:"";position:absolute;left:8px;top:4px;width:6px;height:11px;border:solid var(--c-mint);border-width:0 3px 3px 0;transform:rotate(45deg)}
nav.main{display:flex;gap:var(--s-2);margin:0 0 var(--s-4);border-bottom:1px solid var(--c-divider)}
nav.main a{position:relative;flex:1 1 0;display:flex;align-items:center;justify-content:center;min-height:48px;padding:var(--s-2);color:var(--c-muted);font-weight:700;text-decoration:none;transition:color var(--t-fast) var(--ease)}
nav.main a:hover,nav.main a[aria-current="page"]{color:var(--c-text)}
nav.main a[aria-current="page"]::after{content:"";position:absolute;left:var(--s-2);right:var(--s-2);bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:var(--c-primary)}
@media (min-width:600px){nav.main a{flex:0 0 auto;padding:var(--s-2) var(--s-4)}}
.sample-bar{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-1) var(--s-3);margin:0 0 var(--s-6);padding:var(--s-2) var(--s-3);border:1px dashed var(--lbl-sample-bd);border-radius:var(--r-md);color:var(--c-muted);font-size:var(--fs-sm)}
.sample-bar .label-chip--sample{padding:0;border:0;color:var(--c-text);font-weight:800}
.naidis-frame{margin:0 0 var(--s-5)}
.naidis-banner{margin:0 0 var(--s-3);padding:var(--s-3);border:1px solid var(--c-border);border-radius:var(--r-md);background:var(--c-surface-2);font-size:var(--fs-sm)}
.naidis-steps{display:flex;flex-wrap:wrap;gap:var(--s-1);margin:0 0 var(--s-2)}
.naidis-steps a{display:inline-flex;flex:1 1 auto;align-items:center;justify-content:center;min-height:var(--tap);padding:var(--s-2);border-radius:var(--r-sm);font-size:var(--fs-sm);font-weight:700;text-decoration:none;white-space:nowrap}
.naidis-steps a[aria-current="page"]{background:var(--c-deep);color:#fff}
.naidis-note{margin:0;color:var(--c-muted);font-size:var(--fs-sm)}
.naidis-ro{min-width:0;min-inline-size:0;margin:0;padding:0;border:0}
.naidis-ro :disabled{opacity:.55;cursor:not-allowed}
.naidis-ro .row>a{display:inline-flex;align-items:center;min-height:var(--tap)}
.naidis-cta{margin:var(--s-5) 0 0}
footer{display:flex;flex-wrap:wrap;align-items:center;gap:0 var(--s-4);margin-top:var(--s-8);padding-top:var(--s-3);border-top:1px solid var(--c-divider);font-size:var(--fs-sm)}
.guides{display:flex;gap:0 var(--s-4);flex-wrap:wrap;margin:0}.guides a{min-height:var(--tap);display:inline-flex;align-items:center}
footer form{margin-left:auto}
footer form button{width:auto;min-height:var(--tap);margin:0;padding:0 var(--s-2);border-color:transparent;background:none;color:var(--c-primary);font-size:var(--fs-sm);font-weight:650}
footer form button:hover{background:var(--c-surface-2)}
a{color:var(--c-link);text-underline-offset:.15em}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--c-focus);outline-offset:2px}
.badge{display:inline-block;font-size:var(--fs-xs);font-weight:650;padding:3px 9px;border-radius:999px;background:var(--c-surface-2);color:var(--c-text);border:1px solid var(--c-border)}
.badge.amber{background:var(--c-att-bg);color:var(--c-att-dark);border-color:var(--c-att-bd)}

/* --- Type, cards and blocks --- */
h1{font-size:var(--fs-h1);font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:var(--s-1) 0 var(--s-3)}
h2{font-size:var(--fs-h2);font-weight:750;letter-spacing:-.01em;line-height:1.25;margin:var(--s-4) 0 var(--s-2)}
h3{font-size:var(--fs-md);font-weight:750;margin:var(--s-4) 0 var(--s-2)}
.card>h2:first-child,.card>h3:first-child{margin-top:0}
.card{background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--r-lg);padding:var(--s-4);margin:var(--s-3) 0}
.hero{padding:var(--s-5) var(--s-4)}
.company{font-weight:700;color:var(--c-primary);margin:0}
.next{font-size:var(--fs-xl);font-weight:750;letter-spacing:-.02em;line-height:1.25;margin:6px 0 8px;color:var(--c-text)}
.lede{color:var(--c-muted);font-size:var(--fs-lg);margin:0 0 var(--s-2)}
.muted{color:var(--c-muted);font-size:var(--fs-sm)}.small{font-size:var(--fs-sm)}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:12px 18px;border-radius:var(--r-md);border:1px solid var(--c-primary);background:var(--c-primary);color:var(--c-on-primary);font:inherit;font-weight:700;cursor:pointer;text-decoration:none;width:100%;margin:8px 0;transition:background var(--t-fast) var(--ease),transform var(--t-fast) var(--ease)}
button:active,.btn:active{transform:translateY(1px)}
button.secondary,.btn.secondary{background:var(--c-surface);color:var(--c-primary);border-color:var(--c-control-2)}
button.danger{background:var(--c-surface);color:var(--c-danger);border-color:var(--c-danger)}
button.text{width:auto;min-height:var(--tap);padding:8px 12px;border-color:transparent;background:none;color:var(--c-primary);font-size:var(--fs-md)}
button.text.danger{color:var(--c-danger)}
button.text:hover{background:var(--c-surface-2)}
input,select,textarea{font:inherit;min-height:48px;padding:10px 12px;border:1px solid var(--c-control);border-radius:var(--r-md);width:100%;margin:4px 0 12px;background:var(--c-surface);color:var(--c-text)}
textarea{min-height:88px}
[hidden]{display:none!important}
label{font-weight:650;display:block}
details{border:1px solid var(--c-border);border-radius:var(--r-md);padding:10px 14px;margin:10px 0;background:var(--c-surface)}
details>summary{padding:4px 0}
summary{cursor:pointer;font-weight:650;min-height:var(--tap);display:flex;align-items:center;gap:var(--s-2);list-style:none}summary::-webkit-details-marker{display:none}
summary::after{content:"";flex:none;width:8px;height:8px;margin:0 4px 0 auto;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);transition:transform var(--t-fast) var(--ease)}
details[open]>summary::after{transform:rotate(45deg)}
progress{width:100%;height:12px;accent-color:var(--c-primary)}
pre{white-space:pre-wrap;word-break:break-word;background:var(--c-surface-2);border:1px solid var(--c-divider);border-radius:var(--r-md);padding:12px;font-size:.8rem}
code{word-break:normal;overflow-wrap:anywhere}
pre.doc{max-height:55vh;overflow:auto;font-size:.9rem}
dl.facts{margin:8px 0}dl.facts dt{font-size:var(--fs-sm);color:var(--c-muted);margin-top:8px}dl.facts dd{margin:0;font-weight:650;overflow-wrap:anywhere}
.endpoint{background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:var(--r-md);padding:12px;margin:8px 0;font-size:var(--fs-sm)}
.endpoint code{font-weight:650}
.quote{background:var(--c-surface-2);border:1px solid var(--c-divider);border-radius:var(--r-md);padding:4px 12px;margin:8px 0}
.notice{background:var(--c-att-bg);border:1px solid var(--c-att-bd);border-radius:var(--r-md);padding:12px 14px;margin:10px 0}
.notice p{margin:4px 0}
.note{background:var(--c-surface-2);border:1px solid var(--c-divider);border-radius:var(--r-md);padding:10px 12px;margin:10px 0}.note p{margin:2px 0}
.steps{margin:8px 0;padding-left:22px}.steps li{margin:6px 0}
.tabs{display:flex;gap:4px;padding:4px;background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:var(--r-md);margin:10px 0}
.tabs button{flex:1 1 0;width:auto;min-height:48px;margin:0;background:transparent;color:var(--c-text);border-color:transparent}
.tabs button[aria-selected="true"]{background:var(--c-primary);color:var(--c-on-primary);border-color:var(--c-primary)}
.tabpanel{padding:2px 2px 6px}
.row{padding:12px 0;border-bottom:1px solid var(--c-divider)}.row:last-child{border-bottom:0}
.timeline .row{padding-left:14px;position:relative}
.timeline .row::before{content:"";position:absolute;left:0;top:20px;width:7px;height:7px;border-radius:50%;background:var(--c-primary)}
.pill{display:inline-block;font-size:var(--fs-xs);font-weight:650;padding:2px 9px;border-radius:999px;background:var(--c-surface-2);color:var(--c-text);border:1px solid var(--c-divider);margin:2px 4px 2px 0}
.pill.owner{background:var(--c-att-bg);color:var(--c-att-dark);border-color:var(--c-att-bd)}
ul.tight{margin:6px 0;padding-left:20px}ul.tight li{margin:4px 0}
.meta{border-top:1px solid var(--c-divider);margin-top:12px;padding-top:10px}
@media (max-width:380px){.wrap{padding:var(--s-2) var(--s-3) var(--s-8)}.hero{padding:var(--s-4) 14px}.card{padding:14px}.next{font-size:1.4rem}}
input[type=checkbox],input[type=radio]{width:22px;height:22px;min-height:0;margin:0;padding:0;flex:none;accent-color:var(--c-primary)}
label.check{display:flex;align-items:flex-start;gap:var(--s-3);min-height:var(--tap);padding:10px 0;font-weight:600;cursor:pointer}
label.check input{margin-top:1px}
.row button,.row .btn{width:auto;min-height:var(--tap);padding:8px 14px;margin:8px 0 0}
.row,.card,.section,.hero,dd{overflow-wrap:anywhere}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

/* --- Utilities --- */
.vh{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
h1,h2,h3,.link-row-title,.receipt-head{overflow-wrap:anywhere}

/* --- .lang-toggle --- */
.lang-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:var(--tap);min-height:var(--tap);padding:0 10px;border:1px solid var(--c-border);border-radius:var(--r-md);background:var(--c-surface);color:var(--c-text);font-size:var(--fs-sm);font-weight:750;letter-spacing:.04em;text-decoration:none}
.lang-toggle:hover{border-color:var(--c-control)}

/* --- .label-chip (where it came from) and .state-chip (where it is) --- */
.labels{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:var(--s-2) 0}
.label-chip,.state-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:2px 8px;border:1px solid transparent;border-radius:var(--r-sm);font-size:var(--fs-xs);font-weight:650;line-height:1.4;vertical-align:middle}
.label-chip--official{background:var(--lbl-official-bg);color:var(--lbl-official-fg);border-color:var(--lbl-official-bd)}
.label-chip--rule{background:var(--lbl-rule-bg);color:var(--lbl-rule-fg);border-color:var(--lbl-rule-bd)}
.label-chip--assistant{background:var(--lbl-assistant-bg);color:var(--lbl-assistant-fg);border-color:var(--lbl-assistant-bd)}
.label-chip--owner{background:var(--lbl-owner-bg);color:var(--lbl-owner-fg);border-color:var(--lbl-owner-bd)}
.label-chip--ai{background:var(--lbl-ai-bg);color:var(--lbl-ai-fg);border-color:var(--lbl-ai-bd)}
.label-chip--where{background:var(--lbl-where-bg);color:var(--lbl-where-fg);border-color:var(--lbl-where-bd)}
.label-chip--sample{background:var(--lbl-sample-bg);color:var(--lbl-sample-fg);border:1px dashed var(--lbl-sample-bd);text-transform:uppercase;letter-spacing:.05em}
.state-chip{border-radius:999px;padding:2px 10px 2px 8px}
.state-chip::before{content:"";flex:none;width:8px;height:8px;border-radius:50%;background:currentColor}
.state-chip--drafted{background:var(--st-drafted-bg);color:var(--st-drafted-fg)}
.state-chip--waiting{background:var(--st-waiting-bg);color:var(--st-waiting-fg);border-color:var(--st-waiting-bd)}
.state-chip--approved{background:var(--st-approved-bg);color:var(--st-approved-fg)}
.state-chip--sent{background:var(--st-sent-bg);color:var(--st-sent-fg)}
.state-chip--accepted{background:var(--st-accepted-bg);color:var(--st-accepted-fg)}
.state-chip--rejected{background:var(--st-rejected-bg);color:var(--st-rejected-fg)}
.state-chip--paid{background:var(--st-paid-bg);color:var(--st-paid-fg)}
.state-chip--void{background:var(--st-void-bg);color:var(--st-void-fg)}
.state-chip--demo{border:1px dashed currentColor}

/* --- .deadline-row (date first) --- */
.deadlines{list-style:none;margin:0;padding:0}
.deadline-row{display:grid;grid-template-columns:4.75rem minmax(0,1fr);gap:var(--s-3);padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider)}
.deadline-row:last-child{border-bottom:0}
.deadline-date{display:flex;flex-direction:column;align-items:center;align-self:start;padding:8px 4px 10px;border-radius:var(--r-lg);background:var(--c-surface-3);text-align:center;line-height:1.15}
.deadline-day{font-size:var(--fs-2xl);font-weight:800;letter-spacing:-.03em;color:var(--c-primary);font-variant-numeric:tabular-nums}
.deadline-mon{font-size:var(--fs-sm);font-weight:700}
.deadline-wd{margin-top:2px;font-size:var(--fs-xs);color:var(--c-muted)}
.deadline-title{margin:2px 0;font-size:1.0625rem;font-weight:750;line-height:1.3}
.deadline-reason{margin:0;color:var(--c-muted);font-size:.9375rem}
.deadline-cond{margin:2px 0;font-size:.9375rem}
.deadline-meta{display:flex;flex-wrap:wrap;align-items:center;gap:0 var(--s-3);margin-top:2px}
.deadline-row--done .deadline-date{background:var(--lbl-official-bg)}
.tap-link{display:inline-flex;align-items:center;min-height:var(--tap);font-size:var(--fs-sm);font-weight:650}

/* --- .fact-row (key/value on approval and company cards) --- */
.facts{margin:var(--s-3) 0}
.fact-row{display:grid;grid-template-columns:6.25rem minmax(0,1fr);gap:2px var(--s-3);align-items:baseline;padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider)}
.fact-row:first-child{border-top:1px solid var(--c-divider)}
.fact-row dt{font-size:var(--fs-sm);font-weight:600;color:var(--c-muted)}
.fact-row dd{margin:0;font-size:var(--fs-lg);font-weight:650}
.fact-sub{display:block;font-size:var(--fs-sm);font-weight:400;color:var(--c-muted)}
.fact-row--amount dd{font-size:var(--fs-xl);font-weight:800;font-variant-numeric:tabular-nums}
.fact-row--changed{margin:0 calc(-1 * var(--s-3));padding:var(--s-3);border:0;border-radius:var(--r-md);background:var(--st-void-bg)}
.fact-row--changed del{color:var(--c-danger);font-weight:600}
.fact-row--changed ins{text-decoration:none}
.facts--stacked .fact-row{grid-template-columns:minmax(0,1fr)}
.facts--stacked .fact-row dd{font-size:var(--fs-md);font-weight:500}
@media (max-width:340px){.fact-row{grid-template-columns:minmax(0,1fr)}}

/* --- .state-line (action stepper) --- */
.state-line{list-style:none;margin:var(--s-4) 0;padding:0}
.state-step{position:relative;display:flex;align-items:flex-start;gap:var(--s-3);padding-bottom:var(--s-3)}
.state-step:last-child{padding-bottom:0}
.state-step:not(:last-child)::after{content:"";position:absolute;left:11px;top:26px;bottom:0;width:2px;background:var(--c-divider)}
.state-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:2px solid var(--c-step-todo);border-radius:50%;background:var(--c-surface);font-size:.75rem;font-weight:800;line-height:1}
.state-step--done .state-mark{background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary)}
.state-step--demo .state-mark{border-style:dashed;border-color:var(--lbl-sample-fg);color:var(--lbl-sample-fg)}
.state-step--stop .state-mark{background:var(--st-rejected-fg);border-color:var(--st-rejected-fg);color:var(--c-on-primary)}
.state-text{padding-top:1px;font-weight:650}
.state-step--todo .state-text{font-weight:500;color:var(--c-muted)}
.state-note{display:block;font-size:var(--fs-sm);font-weight:400;color:var(--c-muted)}

/* --- .ticket (approval card): state strip, kind, title, amount, facts, letter, decision pinned to the thumb --- */
article.card.ticket{margin:0 0 var(--s-6);padding:0;border-radius:var(--r-xl);box-shadow:0 1px 2px rgba(20,32,26,.04),0 16px 40px -28px rgba(20,32,26,.35);overflow:clip}
.strip{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2) var(--s-3);padding:var(--s-3) var(--s-4);border-bottom:1px solid var(--c-divider);background:var(--c-surface-2);font-size:var(--fs-sm);font-weight:700}
.strip--wait{background:var(--c-att-bg);color:var(--c-att-dark);border-color:var(--c-att-bd)}
.strip--ok{background:var(--c-primary);color:var(--c-on-primary);border-color:var(--c-primary)}
.strip--ok .label-chip--owner{background:#fff;color:var(--c-primary);border-color:#fff}
.strip .dot{flex:none;width:9px;height:9px;border-radius:50%;background:currentColor}
.strip .labels{margin:0}
.ticket .strip h1{margin:0;font-size:inherit;font-weight:750;line-height:1.3;color:inherit}
.stamp{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#fff;color:var(--c-primary)}
.stamp svg{width:16px;height:16px}
.stamp path{stroke-dasharray:24;stroke-dashoffset:0;animation:lp-draw .3s var(--ease) both}
@keyframes lp-draw{from{stroke-dashoffset:24}to{stroke-dashoffset:0}}
.ticket-body{padding:var(--s-4) var(--s-4) 0}
.ticket-foot{padding:var(--s-2) var(--s-4) var(--s-4)}
@media (min-width:600px){.ticket-body{padding:var(--s-6) var(--s-6) 0}.ticket-foot{padding:var(--s-2) var(--s-6) var(--s-6)}}
.kind{margin:0;color:var(--c-muted);font-size:var(--fs-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.kind small{font-size:var(--fs-sm);font-weight:500;letter-spacing:0;text-transform:none}
.ticket h1{margin:var(--s-1) 0 var(--s-3)}
.why{margin:0 0 var(--s-4)}
.amount{display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--s-2) var(--s-4);margin:var(--s-2) 0 var(--s-4);padding:var(--s-3) 0;border-top:1px solid var(--c-divider);border-bottom:1px solid var(--c-divider)}
.amount b{font-size:var(--fs-amount);font-weight:800;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.amount span{color:var(--c-muted);font-size:var(--fs-sm)}
.ticket .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:var(--s-3) var(--s-6);margin:0 0 var(--s-4)}
.ticket .fact-row{display:block;padding:0;border:0;min-width:0}
.ticket .fact-row dt{font-size:var(--fs-xs);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.ticket .fact-row dd{margin-top:2px;line-height:1.3}
.ticket pre.letter{margin:0 0 var(--s-4);padding:var(--s-3) var(--s-4);border:0;border-left:3px solid var(--c-border);border-radius:0 var(--r-md) var(--r-md) 0;line-height:1.5}
.hand{margin:0 0 var(--s-4);color:var(--c-muted);font-size:var(--fs-sm)}
.hand b{color:var(--c-att);font-weight:700}
.decide{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:nowrap;align-items:center;gap:var(--s-2) var(--s-3);margin:0 calc(-1 * var(--s-4));padding:var(--s-3) var(--s-4) max(12px,env(safe-area-inset-bottom));border-top:1px solid var(--c-divider);background:rgba(255,255,255,.94);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.decide button{flex:1 1 auto;min-width:0;min-height:56px;margin:0;font-size:var(--fs-lg)}
.decide button.text{flex:0 0 auto;min-height:var(--tap);font-size:var(--fs-md);white-space:nowrap}
@media (min-width:600px){.decide{margin:0 calc(-1 * var(--s-6));padding-left:var(--s-6);padding-right:var(--s-6)}}
/* Scroll padding = the bar (1px border + 12px top + 56px button + bottom inset) + 8px air, in --px so it grows with text zoom (PR #65).
   It stays one row from 300px (#63 m8): on phones „Keeldu” is a compact text button and a long approve label may take two 1.2-line
   rows inside its 56px button. Under large text, where the card is narrower than 12em, the bar stays in flow and stacks its two buttons at
   full width, so no word of the approve label breaks mid-word (review-polish3-grok: .card sets overflow-wrap:anywhere). */
html:has(.decide){scroll-padding-bottom:calc(77 * var(--px) + max(12 * var(--px), env(safe-area-inset-bottom)))}
.ticket-body{container-type:inline-size}
@container (max-width:12em){.decide{position:static;flex-wrap:wrap}.decide button,.decide button.text{flex:1 1 100%;overflow-wrap:normal}}
@media (max-width:479px){.decide button{padding:6px 12px;line-height:1.2;font-size:var(--fs-md)}}
@media (max-width:379px){.decide{gap:var(--s-2)}.decide button{padding:6px 10px;line-height:1.2}.decide button.text{padding:6px 8px}}
.fine{margin:var(--s-3) 0 0;color:var(--c-muted);font-size:var(--fs-sm)}
.turn{margin:var(--s-1) 0 var(--s-4)}
.turn strong{display:block;margin-bottom:var(--s-2);font-size:var(--fs-h1);font-weight:800;line-height:1.1;letter-spacing:-.025em}
.callout{margin:0 0 var(--s-4);padding:var(--s-3) var(--s-4);border:1px solid var(--c-att-bd);border-radius:var(--r-md);background:var(--c-att-bg)}
.callout p{margin:var(--s-1) 0}
.callout code{padding:0 4px;border:1px solid var(--c-att-bd);border-radius:4px;background:#fff;font:inherit;font-weight:800}
.standing-offer{margin:0 0 var(--s-4);padding:var(--s-4);border:2px solid var(--c-primary);border-radius:var(--r-lg);background:var(--c-surface)}
.standing-offer h2{margin:0 0 var(--s-2)}
.standing-offer .limits{margin:0 0 var(--s-2)}
.standing-offer details{margin:var(--s-1) 0 0;padding:0;border:0;background:none}
.standing-offer summary{color:var(--c-primary)}
.standing-offer summary::after{margin-left:2px}
/* QA M1: with „Muuda piire” open, the field is the cap and its own button submits; the sentence's cap and the outer button step aside. */
:is(.standing-offer,.ho-next):has(details[open]) .cap-now,:is(.standing-offer,.ho-next) form:has(>details[open])>button{display:none}
:is(.standing-offer,.ho-next) details>button{margin-top:var(--s-3)}

/* --- .status-chip (connect, aria-live) --- */
.status-chip{display:flex;align-items:center;gap:var(--s-3);min-height:52px;margin:var(--s-3) 0;padding:var(--s-3) var(--s-4);border:1px solid var(--st-waiting-bd);border-radius:14px;background:var(--st-waiting-bg);color:var(--st-waiting-fg);font-weight:700}
.status-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--c-pulse);animation:lp-pulse 1.6s ease-in-out infinite}
/* Sample workspace: nothing to wait for, so no attention amber and no pulse (QA M2). */
.status-chip[data-state="sample"]{border-color:var(--c-divider);background:var(--c-surface-2);color:var(--c-text);font-weight:600}
.status-chip[data-state="sample"] .status-dot{background:var(--c-muted);animation:none}
.status-chip[data-state="connected"]{border-color:var(--st-approved-bg);background:var(--st-approved-bg);color:var(--st-approved-fg)}
.status-chip[data-state="connected"] .status-dot{width:7px;height:13px;margin:0 3px 3px;border:solid currentColor;border-width:0 3px 3px 0;border-radius:0;background:none;transform:rotate(45deg);animation:none}
@keyframes lp-pulse{50%{opacity:.3}}

/* --- .tech-details (technical truth one tap away) --- */
details.tech-details{margin:var(--s-2) 0 0;padding:0;border:0;background:none}
.tech-details>summary{display:inline-flex;font-size:var(--fs-sm);color:var(--c-muted)}
.tech-details>summary::after{margin-left:2px}
.tech-list{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px var(--s-3);margin:0 0 var(--s-2);padding:10px 12px;border:1px solid var(--c-divider);border-radius:var(--r-md);background:var(--c-surface-2);font-size:var(--fs-sm)}
.tech-list dt{color:var(--c-muted)}
.tech-list dd{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:var(--fs-xs)}
.tech-pre{margin:0 0 var(--s-2);font-size:var(--fs-xs)}

/* --- Connect page parts --- */
.choice{display:flex;gap:4px;margin:var(--s-2) 0;padding:4px;border:1px solid var(--c-border);border-radius:14px;background:var(--c-surface-3)}
.choice a{flex:1 1 0;display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:var(--r-md);color:var(--c-text);font-weight:700;text-decoration:none}
.choice a[aria-current="true"]{background:var(--c-primary);color:var(--c-on-primary)}
.steps-big{list-style:none;margin:var(--s-2) 0 0;padding:0;counter-reset:step}
.steps-big>li{counter-increment:step;position:relative;padding:0 0 var(--s-5) 44px}
.steps-big>li:last-child{padding-bottom:0}
.steps-big>li::before{content:counter(step);position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--c-primary);color:var(--c-on-primary);font-weight:800}
.step-title{margin:3px 0 6px;font-size:var(--fs-lg);font-weight:750;line-height:1.3}
.step-shot{display:block;width:100%;height:auto;margin:var(--s-2) 0;border:1px solid var(--c-border);border-radius:var(--r-lg);background:var(--c-surface-2)}
.qr-card{display:flex;align-items:center;gap:var(--s-4)}
.qr-box{flex:none;width:132px;height:132px;padding:8px;border:1px solid var(--c-border);border-radius:var(--r-lg);background:#fff}
.qr-box svg{display:block;width:100%;height:100%}
@media (max-width:719px){.qr-card{display:none}}

/* --- Lists and cards --- */
.link-row{display:flex;align-items:center;gap:var(--s-3);min-height:56px;padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider);color:inherit;text-decoration:none}
.link-row:last-child{border-bottom:0}
.link-row::after{content:"";flex:none;width:8px;height:8px;margin:0 4px 0 auto;border-top:2px solid var(--c-muted);border-right:2px solid var(--c-muted);transform:rotate(45deg)}
.link-row-title{display:block;font-weight:700;color:var(--c-link);text-decoration:underline}
.ai-block{margin:var(--s-3) 0;padding:var(--s-3) 14px;border:1px solid var(--lbl-ai-bd);border-radius:var(--r-lg);background:var(--lbl-ai-tint)}
.ai-block>.labels:first-child{margin-top:0}
.receipt-head{margin:2px 0 4px;font-size:var(--fs-xl);font-weight:800;line-height:1.2;color:var(--c-primary)}
/* ===== Proposed v2 additions (ux-revisit.md). Two components only. ===== */
/* .today-sum: the three counts on the Täna hero as pills, each a ≥44px anchor; amber only when something needs the owner */
.today-sum{display:flex;flex-wrap:wrap;gap:6px;margin:var(--s-4) 0 var(--s-2)}
.today-sum a{display:inline-flex;align-items:center;gap:5px;min-height:var(--tap);padding:4px 12px 4px 10px;border:1px solid var(--c-border);border-radius:999px;background:var(--c-surface);color:var(--c-text);font-size:var(--fs-sm);font-weight:650;line-height:1.2;text-decoration:none;transition:background var(--t-fast) var(--ease)}
.today-sum a:hover{background:var(--c-surface-2)}
.today-sum b{font-size:var(--fs-md);font-weight:800;font-variant-numeric:tabular-nums}
.today-sum a.needs{border-color:var(--st-waiting-bd);background:var(--st-waiting-bg);color:var(--st-waiting-fg)}
/* .handoff: who does what for one job (deadline row, unmet need, receipt) */
.handoff{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 10px;margin:var(--s-2) 0 var(--s-1);padding:10px 12px;border:1px solid var(--c-divider);border-radius:var(--r-md);background:var(--c-surface-2);font-size:.9375rem;line-height:1.4}
.handoff dt{font-size:var(--fs-sm);font-weight:700;color:var(--c-muted)}
.handoff dd{margin:0}
.handoff dt.me{color:var(--st-waiting-fg)}
.ask-row{padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider)}
.ask-row:last-child{border-bottom:0}
/* --- T3 Täna: one page, sections not cards, one elevated object (.ask) --- */
@media (min-width:960px){.wrap:has(.tana-grid){max-width:1040px}}
.hero:not(.card){padding:var(--s-2) 0 var(--s-4)}
.hero:not(.card) h1{margin:var(--s-1) 0 var(--s-2)}
@media (min-width:600px){.hero:not(.card) .btn{width:auto;padding:12px 32px}}
.section{padding:var(--s-6) 0;border-top:1px solid var(--c-divider)}
.section>h2:first-child{margin-top:0}
.tana-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:0 var(--s-12)}
/* T4: the three sections enter in turn (from direction C); the global reduced-motion rule turns it off and leaves the final state. */
#ootab,#tegi,#tulekul{animation:lp-enter var(--t-med) var(--ease) both}#tegi{animation-delay:60ms}#tulekul{animation-delay:120ms}
@keyframes lp-enter{from{opacity:0;transform:translateY(8px)}}
.tana-grid>.col:first-child>.section:first-child{padding-top:var(--s-2);border-top:0}
@media (min-width:960px){.tana-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.tana-grid>.col>.section:first-child{padding-top:var(--s-2);border-top:0}}
.ask{position:relative;display:flex;align-items:center;gap:var(--s-3);min-height:var(--tap);margin:0 0 var(--s-3);padding:var(--s-4) var(--s-4) var(--s-4) var(--s-6);border:1px solid var(--c-border);border-radius:var(--r-lg);background:var(--c-surface);color:inherit;text-decoration:none;box-shadow:0 1px 2px rgba(20,32,26,.04),0 8px 24px -16px rgba(20,32,26,.25);transition:box-shadow var(--t-fast) var(--ease),transform var(--t-fast) var(--ease)}
.ask::before{content:"";position:absolute;left:0;top:var(--s-3);bottom:var(--s-3);width:4px;border-radius:0 4px 4px 0;background:var(--c-att-bd)}
.ask--note::before{background:var(--c-border)}
a.ask:hover{box-shadow:0 1px 2px rgba(20,32,26,.06),0 12px 28px -14px rgba(20,32,26,.35);transform:translateY(-1px)}
.ask-body{display:block;flex:1 1 auto;min-width:0}
.ask .labels{margin:0 0 var(--s-1)}
.ask-title{display:block;font-size:var(--fs-lg);font-weight:750;line-height:1.3;color:var(--c-text)}
.ask-meta,.ask p{display:block;margin:2px 0 0;color:var(--c-muted);font-size:var(--fs-sm)}
.ask .chev{flex:none;width:10px;height:10px;border-top:2px solid var(--c-muted);border-right:2px solid var(--c-muted);transform:rotate(45deg)}
details.plain,.deadline-row details{margin:var(--s-1) 0 0;padding:0;border:0;border-radius:0;background:none}
details.plain>summary,.deadline-row details>summary{padding:0;font-size:var(--fs-sm)}
details.plain>summary{color:var(--c-muted)}
.deadline-row details>summary{color:var(--c-primary)}
details.plain>summary::after,.deadline-row details>summary::after{margin:0 4px 0 2px}
details.plain>summary>h2{margin:0;font:inherit;color:inherit}
.tana-grid~details.plain{margin-top:var(--s-4)}
/* ===== Issue #21 implementation additions ===== */
pre.letter{max-height:none;margin:var(--s-2) 0;padding:12px 14px;background:var(--c-surface-2);border-color:var(--c-divider);font:inherit;font-size:var(--fs-md);white-space:pre-wrap;overflow-wrap:anywhere}
.connect-hero .btn{margin-top:0;font-size:var(--fs-lg)}
.status-chip a{color:inherit}
.tech-list dd{overflow-wrap:anywhere}
/* ===== Kataloog ===== */
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:var(--s-2) 0 var(--s-3)}
.chips a{display:inline-flex;align-items:center;gap:6px;min-height:var(--tap);padding:6px 14px;border:1px solid var(--c-border);border-radius:999px;background:var(--c-surface);color:var(--c-text);font-size:var(--fs-sm);font-weight:650;text-decoration:none}
.chips a span{color:var(--c-muted);font-variant-numeric:tabular-nums}
.chips a[aria-current="page"]{background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary)}.chips a[aria-current="page"] span{color:inherit}
.svc-group{margin:var(--s-6) 0 var(--s-1)}
.svc h3{margin:0 0 2px;font-size:var(--fs-lg)}
.svc-k{margin:var(--s-2) 0 0;font-size:var(--fs-sm);font-weight:700;color:var(--c-muted)}.svc-v{margin:0}
.svc-facts{margin:var(--s-2) 0 0;font-size:var(--fs-sm)}.svc-facts dt{font-weight:700;color:var(--c-muted);margin-top:6px}.svc-facts dd{margin:0}
.svc--pinned{border-color:var(--c-primary);box-shadow:inset 4px 0 0 var(--c-primary)}
.legend{list-style:none;margin:var(--s-2) 0 0;padding:0;font-size:var(--fs-sm)}.legend li{margin:4px 0}.ico{vertical-align:-3px;flex:none}
/* ===== Landing with the chat teaser (owner request 2026-10-30) ===== */
.wrap:has(.landing){max-width:1040px}
.landing-hero{display:grid;grid-template-areas:"text" "phone" "jobs";gap:var(--s-8);align-items:start;margin:var(--s-5) 0 var(--s-8)}
.landing-hero>div{grid-area:text}.landing-hero>.teaser{grid-area:phone}.landing-hero>.use-cases{grid-area:jobs;min-width:0}
.landing-hero h1{margin:0 0 var(--s-4);font-size:var(--fs-display);font-weight:800;line-height:1.05;letter-spacing:-.03em;color:#12291a}
.landing-hero h1 span{color:var(--c-primary);background:linear-gradient(transparent 68%,#cfe3c6 68%,#cfe3c6 92%,transparent 92%)}
.landing-hero .lede{max-width:34rem;margin:0 0 var(--s-5);font-size:var(--fs-lg);line-height:1.5}
.landing-hero .btn{width:100%;font-size:var(--fs-lg)}
.landing-actions{display:flex;flex-wrap:wrap;align-items:center;gap:0 var(--s-4)}
@media (min-width:880px){.landing-hero{grid-template-areas:"text phone" "jobs phone";grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto 1fr;gap:var(--s-6) 56px;margin-top:var(--s-6)}.landing-hero .btn{width:auto;padding:12px 32px}}
.teaser{position:relative;width:100%;max-width:360px;margin:0 auto}
.teaser::before{content:"";position:absolute;inset:8% 0 4%;z-index:-1;border-radius:50%;background:radial-gradient(closest-side,#c9dcbf,transparent);opacity:.9}
.teaser figcaption{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:var(--s-2);margin-top:var(--s-3)}
.vh-input{position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
.teaser-pause{display:inline-flex;align-items:center;min-height:44px;padding:0 var(--s-3);border:1px solid var(--c-border);border-radius:var(--r-lg);background:#fff;font-size:var(--fs-sm);font-weight:650;color:var(--c-primary);cursor:pointer}
#teaser-pause:focus-visible~figcaption .teaser-pause{outline:3px solid var(--c-focus);outline-offset:2px}
#teaser-pause:checked~figcaption .teaser-pause{background:var(--c-primary);color:#fff}
.tp-resume,#teaser-pause:checked~figcaption .tp-pause{display:none}#teaser-pause:checked~figcaption .tp-resume{display:inline}
#teaser-pause:checked~.teaser-conversation .phone *{animation-play-state:paused!important}
@media (prefers-reduced-motion:reduce){.teaser-pause,.vh-input{display:none}}
/* Fixed phone and chat heights fit every case's longest final frame in ET and EN at 360 px and desktop; switching cases cannot resize the phone. */
.phone{height:672px;padding:10px;border-radius:46px;background:#12291a;box-shadow:0 30px 60px -24px rgba(18,41,26,.55),inset 0 0 0 2px #2c4a35}
@media (max-width:380px){.phone{height:700px}}@media (max-width:359px){.phone{height:772px}}@media (min-width:880px){.phone{height:656px}}
.phone-screen{display:flex;flex-direction:column;height:100%;overflow:hidden;border-radius:36px;background:var(--c-surface-2)}
.phone-bar{display:flex;align-items:center;gap:10px;padding:22px 16px 10px;background:#fff;border-bottom:1px solid var(--c-divider)}
.phone-ava{flex:none;width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a4d2e,#6f9c63)}
.phone-who{line-height:1.25}.phone-who b{display:block;font-size:var(--fs-sm)}.phone-who small{color:var(--c-muted);font-size:.75rem}
.chat{display:flex;flex:1;flex-direction:column;justify-content:flex-end;min-height:540px;overflow:hidden;padding:4px 12px 14px;font-size:.875rem;line-height:1.4}
@media (max-width:380px){.chat{min-height:568px}}@media (max-width:359px){.chat{min-height:640px}}
.beat{display:flex;flex:none;flex-direction:column;overflow:hidden;animation-duration:18s;animation-timing-function:ease-out;animation-iteration-count:infinite}
.beat>*{margin:10px 0 0}.beat--ai+.beat--ai>*{margin-top:4px}
.bubble{max-width:88%;padding:8px 12px;border-radius:18px}
.beat--me .bubble{align-self:flex-end;border-bottom-right-radius:6px;background:var(--c-primary);color:#fff}
.beat--ai .bubble{align-self:flex-start;border:1px solid var(--c-border);border-bottom-left-radius:6px;background:#fff}
.bubble b{color:var(--c-primary)}.bubble .labels{gap:4px;margin:4px 0 0}
.beat--typing{max-height:0;opacity:0}
.typing{display:flex;gap:4px;align-self:flex-start;padding:12px 14px;border:1px solid var(--c-border);border-radius:18px;border-bottom-left-radius:6px;background:#fff}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--c-muted);animation:lp-dot 1s infinite}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes lp-dot{0%,60%,100%{opacity:.35;transform:none}30%{opacity:1;transform:translateY(-3px)}}
.mock-card{padding:12px;border:1px solid var(--c-border);border-radius:var(--r-xl);background:#fff;box-shadow:0 6px 16px -8px rgba(26,36,29,.25)}
.mock-card .labels{margin:0}
.mock-title{margin:8px 0 2px;font-size:var(--fs-md);font-weight:750}
.mock-facts{display:flex;margin:0;flex-wrap:wrap;justify-content:space-between;gap:0 8px;color:var(--c-muted)}.mock-facts b{color:var(--c-text);font-variant-numeric:tabular-nums}
.mock-btn{position:relative;display:grid;margin-top:10px}
.mock-btn>span{grid-area:1/1;display:flex;align-items:center;justify-content:center;min-height:var(--tap);padding:0 10px;border-radius:var(--r-lg);font-weight:750;text-align:center}
.mock-state{display:grid}.mock-state>span{grid-area:1/1;justify-self:start}
.mock-wait,.mock-approve{opacity:0;animation-duration:18s;animation-iteration-count:infinite}
.mock-ok,.mock-done,.mock-rule{animation-duration:18s;animation-iteration-count:infinite}
.mock-allow{opacity:0;animation-duration:18s;animation-iteration-count:infinite}
.mock-approve{background:var(--c-primary);color:#fff}
.mock-allow{border:1px solid var(--c-primary);background:#fff;color:var(--c-primary)}
.mock-done{border:1px dashed var(--st-accepted-fg);background:var(--st-accepted-bg);color:var(--st-accepted-fg)}
.mock-btn>.mock-rule{border-radius:999px;background:var(--lbl-owner-bg);color:var(--lbl-owner-fg);font-size:var(--fs-xs)}
.mock-btn>.mock-tap{position:absolute;top:50%;left:50%;width:46px;height:46px;min-height:0;margin:-23px 0 0 -23px;padding:0;border-radius:50%;background:rgba(255,255,255,.6);box-shadow:0 0 0 3px rgba(255,255,255,.35);opacity:0;animation-duration:18s;animation-iteration-count:infinite}
.beat--allow .mock-btn>.mock-tap{background:rgba(26,77,46,.25);box-shadow:0 0 0 3px rgba(26,77,46,.15)}
${TEASER_CSS}
.landing h2{margin:0 0 var(--s-4);font-size:var(--fs-xl);letter-spacing:-.02em}
.job-track{display:flex;gap:var(--s-3);max-width:100%;margin:0;padding:0;overflow-x:auto;scroll-snap-type:x mandatory;list-style:none}
.job-track:focus-visible{outline:3px solid var(--c-focus);outline-offset:2px}
.job-card{flex:0 0 100%;min-width:0;padding:var(--s-4);scroll-snap-align:start;border:1px solid var(--c-border);border-radius:var(--r-xl);background:#fff}
.job-card--active{border-color:var(--c-primary);box-shadow:inset 0 0 0 1px var(--c-primary)}
.job-card h3{margin:0 0 var(--s-2)}.job-card>p{margin:0 0 var(--s-3)}
.job-activate{width:auto;min-height:var(--tap);margin:0;padding:0;border:0;background:none;color:var(--c-text);font:inherit;font-weight:750;text-align:left}
.job-card>p.job-needs{margin:var(--s-4) 0 0;font-size:var(--fs-sm);font-weight:700;color:var(--c-muted)}
.job-card>p.job-register{margin:var(--s-2) 0 0}
.job-chips{margin:0}.job-chips .label-chip{min-height:var(--tap);padding:6px 14px;border-radius:999px}
.job-pager{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2);margin-top:var(--s-3)}
.job-pager button{width:auto;min-height:var(--tap);margin:0;padding:8px 14px}.job-pager span{font-variant-numeric:tabular-nums}
.use-caption{margin:var(--s-3) 0 0}
@media (min-width:760px){.job-card{flex-basis:calc((100% - var(--s-3))/2)}}
@media (min-width:1100px){.job-card{flex-basis:calc((100% - 2 * var(--s-3))/3)}}
.how{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s-3);margin:0;padding:0;list-style:none;counter-reset:how}
.how li{counter-increment:how;display:flex;align-items:flex-start;gap:var(--s-4);padding:var(--s-4);border:1px solid var(--c-border);border-radius:var(--r-xl);background:#fff;font-size:var(--fs-lg);font-weight:650;line-height:1.35}
.how li>span{min-width:0;overflow-wrap:break-word}
.how-ico{position:relative;flex:none;display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:var(--c-surface-3);color:var(--c-primary)}
.how-ico svg{width:26px;height:26px}
.how-go{display:flex;align-items:center;min-height:var(--tap);color:var(--c-link);text-decoration:underline;text-underline-offset:3px}
.how-cta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2) var(--s-6);margin:var(--s-6) 0 0}.how-cta .btn{margin:0;font-size:var(--fs-lg)}@media (min-width:880px){.how-cta .btn{width:auto;padding:12px 32px}}
.how .how-ico::after{content:counter(how);position:absolute;top:-6px;right:-6px;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--c-primary);color:#fff;font-size:.75rem;font-weight:800}
.trust{display:grid;gap:var(--s-2);margin:var(--s-6) 0;padding:var(--s-4);list-style:none;border-radius:var(--r-xl);background:var(--c-deep);color:#fff}
.trust li{display:flex;align-items:center;gap:var(--s-3);min-height:var(--tap);font-weight:700}
.trust li::before{content:"";flex:none;width:9px;height:16px;margin:0 9px 4px 7px;border:solid var(--c-mint);border-width:0 3px 3px 0;transform:rotate(45deg)}
@media (min-width:760px){.how{grid-template-columns:repeat(4,minmax(0,1fr))}.trust{grid-template-columns:repeat(3,minmax(0,1fr))}.how li{flex-direction:column}.trust{padding:var(--s-4) var(--s-6)}}
.landing-foot{margin:0}
/* --- T5 (#61) „Käest ära”: the handover bar (docs/design/progress). One segment = one job; prefix ho-. --- */
:root{--ho-prep:#3F8A5E}
/* Compact strip: lives in the Täna hero under the three pills. One tappable line + bar. */
.ho-strip{display:block;margin:var(--s-3) 0 0;padding:var(--s-2) 0 var(--s-3);border-top:1px solid var(--c-divider);color:inherit;text-decoration:none}
.ho-strip:hover .ho-line b{text-decoration:underline;text-underline-offset:.15em}
.ho-line{display:flex;align-items:baseline;gap:2px var(--s-3);flex-wrap:wrap;margin:0 0 var(--s-2);font-size:var(--fs-md);line-height:1.35}
.ho-line b{font-weight:750;color:var(--c-primary)}
.ho-line .num{font-weight:800}
.ho-line span{color:var(--c-muted);font-size:var(--fs-sm)}
.ho-line .go{color:var(--c-primary);font-weight:650;font-size:var(--fs-sm)}
/* Phones: the whole strip is the link; the „Vaata →” word goes so the first ask card stays in the first viewport. */
@media (max-width:599px){.ho-line .go{display:none}}
@media (min-width:600px){.ho-line .go{margin-left:auto}}
.ho-bar{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;height:14px;margin:0;padding:0;list-style:none}
.ho-seg{position:relative;border-radius:5px;border:2px solid var(--c-muted);background:#fff}
.ho-seg--prep{border-color:var(--ho-prep);background:var(--ho-prep)}
.ho-seg--done{border-color:var(--c-primary);background:var(--c-primary)}
.ho-seg--other{border-style:dashed;border-color:var(--c-muted);background:repeating-linear-gradient(135deg,transparent 0 4px,var(--c-divider) 4px 8px)}
.ho-seg--wait::after{content:"";position:absolute;right:-3px;top:-6px;width:10px;height:10px;border-radius:50%;background:var(--c-att);border:2px solid #fff}
.ho-bar--lg{height:20px;gap:6px}
.ho-bar--lg .ho-seg{border-radius:6px}

/* Full section (Ühendus → Käest ära). */
.ho h2{margin-bottom:var(--s-1)}
.ho .ho-sum{margin:0 0 var(--s-3);font-size:var(--fs-h2);font-weight:750;line-height:1.3;letter-spacing:-.01em}
.ho .ho-sum .num{font-size:var(--fs-h1);font-weight:800;line-height:1;letter-spacing:-.025em;color:var(--c-primary);font-variant-numeric:tabular-nums}
.ho .ho-sum small{display:block;margin-top:var(--s-1);font-size:var(--fs-md);font-weight:400;color:var(--c-muted)}
.ho-month{margin:var(--s-3) 0 0;font-size:var(--fs-sm);color:var(--c-muted)}
.ho-month b{color:var(--c-text);font-weight:750;font-variant-numeric:tabular-nums}
.ho-legend{display:flex;flex-wrap:wrap;gap:var(--s-2) var(--s-4);margin:var(--s-3) 0 0;padding:0;list-style:none;font-size:var(--fs-xs);color:var(--c-muted)}
.ho-legend li{display:inline-flex;align-items:center;gap:6px}
.ho-legend i{width:14px;height:10px;border-radius:3px;border:2px solid var(--c-muted);background:#fff}
.ho-legend i.ho-seg--prep{border-color:var(--ho-prep);background:var(--ho-prep)}
.ho-legend i.ho-seg--done{border-color:var(--c-primary);background:var(--c-primary)}
.ho-legend i.ho-seg--other{border-style:dashed}

.ho-jobs{list-style:none;margin:var(--s-4) 0 0;padding:0;border-top:1px solid var(--c-divider)}
.ho-job{display:grid;grid-template-columns:28px minmax(0,1fr);gap:var(--s-2) var(--s-3);padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider);color:inherit;text-decoration:none}
.ho-job:hover .ho-title{text-decoration:underline;text-underline-offset:.15em}
.ho-mark{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-top:2px;border:2px solid var(--c-muted);border-radius:50%;background:#fff;color:#fff;font-style:normal;font-weight:800;font-size:.8rem;line-height:1}
.ho-mark--prep{border-color:var(--ho-prep);background:var(--ho-prep)}
.ho-mark--done{border-color:var(--c-primary);background:var(--c-primary)}
.ho-mark--other{border-style:dashed;color:var(--c-muted)}
.ho-mark svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.ho-title{display:block;font-size:var(--fs-lg);font-weight:750;line-height:1.3}
.ho-rung{margin:2px 0 0;font-size:var(--fs-md);font-weight:600}
.ho-rung--done{color:var(--c-primary)}
.ho-rung--prep{color:#2F6E49}
.ho-rung--mine{color:var(--c-muted)}
.ho-ev{margin:2px 0 0;font-size:var(--fs-sm);color:var(--c-muted)}
.ho-ev .num{font-variant-numeric:tabular-nums}
.ho-ev .label-chip{vertical-align:1px;margin-left:4px}
.ho-job .ho-ev .state-chip{margin-top:4px}

/* The one next step: the only elevated object in the section; reuses .ask. */
.ho-next{margin:var(--s-6) 0 0}
.ho-next h3{margin:0 0 var(--s-3);font-size:var(--fs-h2);font-weight:750;letter-spacing:-.01em}
.ho-next .ask{display:block;padding:var(--s-4) var(--s-4) var(--s-4) var(--s-6)}
.ho-next .ask::before{background:var(--c-primary)}
.ho-next .ask .ask-title{margin:0 0 var(--s-1)}
.ho-next h3,.ho-next .ask-title{overflow-wrap:break-word}
.ho-next .ask p{margin:0 0 var(--s-2)}
.ho-next .ask .btn{margin-top:var(--s-3)}
.ho-next .ask .limits{font-size:var(--fs-md)}
.ho-next .ask .limits b{font-weight:750}
.ho-next .quote{margin:var(--s-2) 0 0;padding:var(--s-3) var(--s-4);border-left:3px solid var(--c-border);border-radius:0 var(--r-md) var(--r-md) 0;background:var(--c-surface-2);font-size:var(--fs-md)}
.ho-next .quote span{display:block;color:var(--c-muted);font-size:var(--fs-sm);margin-bottom:2px}
.ho-next .ask .tap-link{margin-top:var(--s-1)}
.ho-note{margin:var(--s-4) 0 0;font-size:var(--fs-sm);color:var(--c-muted)}
.ho-finding{display:flex;gap:var(--s-2);align-items:flex-start;margin:var(--s-4) 0 0;padding:var(--s-3) var(--s-4);border:1px solid var(--c-att-bd);border-radius:var(--r-md);background:var(--c-att-bg);color:var(--c-att-dark);font-size:var(--fs-sm)}
.ho-finding b{font-weight:750}
.ho-finding a{color:inherit;font-weight:650}
.ho-finding .tap-link{display:inline-flex;min-height:var(--tap);align-items:center;margin:-10px 0}

@media (min-width:960px){
  /* Two equal columns, 32 px apart; the next-step title steps down to --fs-md so a long Estonian compound such as
     „raamatupidamisprogramm” fits on one line, and the job titles keep their width (QA M3). */
  .ho-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--s-8);align-items:start}
  .ho-next .ask .ask-title{font-size:var(--fs-md)}
  .ho-grid>.ho-next{margin-top:0;position:sticky;top:var(--s-4)}
}`;

// --- Locale (issue #21): Estonian first, English on request. No framework. ---
export type Lang = "et" | "en";
/** t(et, en) for one language. */
export const tr = (l: Lang) => (et: string, en: string) => (l === "en" ? en : et);
export const parseLang = (v: unknown): Lang | null => (v === "et" || v === "en" ? v : null);

// Times are Europe/Tallinn instants; civil dates (YYYY-MM-DD, YYYY-MM) are
// formatted in UTC so the day never shifts. Never a raw ISO/UTC string.
const TZ = "Europe/Tallinn";
const byLang = <T>(make: (loc: string) => T) => ({ et: make("et-EE"), en: make("en-GB") });
const dtf = (o: Intl.DateTimeFormatOptions) => byLang((loc) => new Intl.DateTimeFormat(loc, o));
const TIME = dtf({ timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = dtf({ timeZone: TZ, day: "numeric", month: "short" });
const C_DAY_MON = dtf({ timeZone: "UTC", day: "numeric", month: "short" });
const C_DAY_MON_YEAR = dtf({ timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const C_WEEKDAY = dtf({ timeZone: "UTC", weekday: "long" });
const C_PERIOD = dtf({ timeZone: "UTC", month: "long", year: "numeric" });
const TODAY = dtf({ timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const EUR = byLang((loc) => new Intl.NumberFormat(loc, { style: "currency", currency: "EUR" }));
const REL = byLang((loc) => new Intl.RelativeTimeFormat(loc, { numeric: "auto" }));
const civil = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)); };
const tallinnYmd = (t: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);
const dayDiff = (from: string, to: string) => Math.round((civil(to).getTime() - civil(from).getTime()) / 86_400_000);
const valid = (iso: string | null | undefined) => !!iso && !Number.isNaN(Date.parse(iso));

export const fmtEur = (cents: number, l: Lang) => EUR[l].format(cents / 100);
/** "2026-10" → "oktoober 2026"; anything else is shown as given. */
export const fmtPeriod = (ym: string, l: Lang) => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) ? C_PERIOD[l].format(civil(`${ym}-01`)) : ym;
export const fmtDeadline = (ymd: string, l: Lang) => `${C_DAY_MON[l].format(civil(ymd))}, ${C_WEEKDAY[l].format(civil(ymd))}`;
export const deadlineParts = (ymd: string, l: Lang) => {
  const p = C_DAY_MON[l].formatToParts(civil(ymd));
  return { day: p.find((x) => x.type === "day")!.value, mon: p.find((x) => x.type === "month")!.value, wd: C_WEEKDAY[l].format(civil(ymd)) };
};
/** Activity and receipts: "täna, 14:31" today (Tallinn), otherwise "3. nov, 14:31". */
export const fmtWhen = (iso: string | null | undefined, l: Lang, now = new Date()) => {
  if (!valid(iso)) return "";
  const d = new Date(iso!), diff = dayDiff(tallinnYmd(now), tallinnYmd(d));
  const time = TIME[l].format(d);
  if (diff === 0) return tr(l)(`täna, ${time}`, `today, ${time}`);
  return `${DAY[l].format(d)}, ${time}`;
};
/** Validity end: "homme kella 14:31-ni" / "14:31 tomorrow". */
const fmtUntil = (iso: string, l: Lang, now = new Date()) => {
  if (!valid(iso)) return "";
  const t = tr(l), d = new Date(iso), diff = dayDiff(tallinnYmd(now), tallinnYmd(d)), time = TIME[l].format(d);
  // U+2011: "-ni" never wraps onto a line of its own.
  if (diff === 0) return t(`täna kella ${time}\u2011ni`, `${time} today`);
  if (diff === 1) return t(`homme kella ${time}\u2011ni`, `${time} tomorrow`);
  return t(`${DAY.et.format(d)} kella ${time}\u2011ni`, `${DAY.en.format(d)}, ${time}`);
};
/** The official source of a rule: the same link on Tulekul and in „Käest ära”. */
const sourceLink = (src: Source, l: Lang) => `<a class="tap-link" href="${esc(src.url)}" rel="noopener noreferrer"><span>${tr(l)("Allikas", "Source")}: <span lang="et">${esc(src.act_et)} ${esc(src.section)}</span><span aria-hidden="true">&nbsp;↗</span></span></a>`;
const timeEl = (iso: string, text: string) => `<time datetime="${esc(iso)}">${esc(text)}</time>`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Chips: one label system (design-spec §2.2–2.3) ---
const labelChip = (kind: "official" | "rule" | "assistant" | "owner" | "ai" | "sample" | "where", text: string) => `<span class="label-chip label-chip--${kind}">${esc(text)}</span>`;
const stateChip = (kind: string, text: string, demo = false) => `<span class="state-chip state-chip--${kind}${demo ? " state-chip--demo" : ""}">${esc(text)}</span>`;
const sampleChip = (l: Lang) => labelChip("sample", tr(l)("Näidis", "Sample"));
const techDetails = (l: Lang, inner: string) => `<details class="tech-details"><summary>${tr(l)("Tehniline info", "Technical details")}</summary>${inner}</details>`;
const techList = (rows: [string, unknown][]) => `<dl class="tech-list">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;

export interface ShellOpts {
  title: string; active: "tana" | "tehtud" | "uhendus" | "none"; body: string;
  /** Owner session CSRF; empty for public pages (no nav, no logout). */
  csrf: string;
  lang?: Lang; sample?: boolean;
  /** Href of the language toggle (current path with the other lang). */
  toggle?: string;
  /** Extra <head> markup (e.g. the /uhenda meta refresh). */
  head?: string;
  /** English-only owner pages declare their own language inside the shell. */
  bodyLang?: Lang;
  /** No owner nav or footer (mid-OAuth consent): nothing invites leaving the flow. */
  bare?: boolean;
}
export function shell(o: ShellOpts): string {
  const l = o.lang ?? "et", t = tr(l), other: Lang = l === "et" ? "en" : "et", owner = o.csrf !== "";
  const nav = [["/", t("Täna", "Today"), "tana"], ["/activity", t("Tehtud", "Done"), "tehtud"], ["/uhenda", t("Ühendus", "Connection"), "uhendus"]] as const;
  const toggle = `<a class="lang-toggle" href="${esc(o.toggle ?? `?lang=${other}`)}" hreflang="${other}" lang="${other}">${other.toUpperCase()}<span class="vh"> · ${other === "en" ? "in English" : "eesti keeles"}</span></a>`;
  // The bare consent page keeps the brand as text: nothing invites leaving the flow.
  const brand = `<span class="mark" aria-hidden="true"></span>${t("AI-hüppelaud", "AI Launchpad")}`;
  const main = o.bodyLang && o.bodyLang !== l ? `<div lang="${o.bodyLang}">${o.body}</div>` : o.body;
  const footer = o.bare ? ""
    : owner
    ? `<footer><nav class="guides" aria-label="${t("Lisad", "Guides")}"><a href="/approvals">${t("Kinnitused", "Approvals")}</a><a href="/connection">${t("Andmed ja õigused", "Data and permissions")}</a><a href="/demand">${t("Avatud soovid", "Open demand")}</a><a href="/playbooks">${t("Mängukavad", "Playbooks")}</a><a href="/kataloog">${t("Kataloog", "Catalogue")}</a><a href="/setup">${t("Abi alustamiseks", "Setup helper")}</a></nav>
<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><button type="submit">${t("Logi välja", "Log out")}</button></form></footer>`
    : `<footer><nav class="guides" aria-label="${t("Lisad", "Guides")}"><a href="/kataloog">${t("Kataloog", "Catalogue")}</a><a href="/demand">${t("Avatud soovid", "Open demand")}</a><a href="/login">${t("Logi sisse", "Sign in")}</a></nav></footer>`;
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${o.head ?? ""}<title>${esc(o.title)} · ${t("AI-hüppelaud", "AI Launchpad")}</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top">${o.bare ? `<span class="brand">${brand}</span>` : `<a class="brand" href="/">${brand}</a>`}${toggle}</header>
${owner && !o.bare ? `<nav class="main" aria-label="${t("Peamenüü", "Main")}">${nav.map(([href, label, key]) => `<a href="${href}"${o.active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>` : ""}
${o.sample ? `<p class="sample-bar">${sampleChip(l)}<span>${t("päriselt midagi ei saadeta", "nothing is really sent")}</span></p>` : ""}
<main>${main}</main>
${footer}
</div></body></html>`;
}

/** Every error a person can hit on the demo path: inside the shell, one sentence, a way back. */
export function errorBody(l: Lang, title: string, message: string, back: { href: string; label: string } = { href: "/", label: tr(l)("Tagasi: Täna", "Back: Today") }): string {
  return `<section class="card" role="alert"><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="btn secondary" href="${esc(back.href)}">${esc(back.label)}</a></section>`;
}

export function loginBody(opts: { lang: Lang; demo: boolean; google: boolean; preauth: string; companies: readonly { key: string; label: string }[]; toConsent?: boolean }): string {
  const t = tr(opts.lang);
  return `<section class="card hero"><h1>${t("Logi sisse", "Sign in")}</h1><p class="lede">${t("Näed, mida sinu assistent sinu eest teeb, mis ootab sinu kinnitust ja mis on tulekul.", "See what your assistant does for you, what waits for your approval and what is coming up.")}</p>
${opts.google ? `<p><a class="btn" href="/auth/login/google${opts.toConsent ? "?return_to=%2Foauth%2Fconsent" : ""}">${t("Jätka Google'iga", "Continue with Google")}</a></p><p class="small muted">${t("Ainult sinu tuvastamiseks (nimi ja e-posti tunnus). Gmaili ega kalendrit ei küsita.", "Identity only (name/email identifier). No Gmail or Calendar access is requested.")}</p>` : `<p class="small muted" role="note">${t("Google'i sisselogimine pole selles serveris veel seadistatud.", "Google sign-in is not configured on this local server yet.")}</p>`}
<p class="small muted">${t("Sisselogimine näitab, kes sa oled. See <strong>ei</strong> tõenda, et võid ettevõtte nimel tegutseda.", "Signing in proves who you are. It does <strong>not</strong> prove you may act for a company.")}</p>
<p class="small"><a href="/demand">${t("Avatud soovid", "Open demand")}</a>: ${t("mida ettevõtjad oma assistendilt palusid, aga mida ükski ühendus veel teha ei oska.", "what businesses asked their assistants for that no connector can do yet.")}</p>
</section>
${opts.demo ? `<section class="card" aria-label="${t("Näidisettevõte", "Synthetic demo")}"><div class="labels">${sampleChip(opts.lang)}</div><h2>${t("Proovi näidisettevõttega", "Try a synthetic business")}</h2><p class="muted">${t("Väljamõeldud ettevõtted näidisandmetega. Päris andmeid, deklaratsioone ega makseid pole.", "Made-up companies with example assessments. No real data, filings or payments.")}</p>${opts.companies.map((c) => `<form method="post" action="/auth/demo"><input type="hidden" name="actor" value="${esc(c.key)}"><input type="hidden" name="preauth" value="${esc(opts.preauth)}"><button type="submit" class="secondary">${t("Ava", "Open")} ${esc(c.label)}</button></form>`).join("")}</section>` : ""}`;
}

/** History times on „Andmed ja õigused” keep their UTC wording, in the page language. */
const fmtUtc = (iso: string | null | undefined, l: Lang): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t), loc = l === "en" ? "en-GB" : "et-EE";
  return `${d.toLocaleDateString(loc, { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString(loc, { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC`;
};

const FIRST_REQUEST = "Use AI Launchpad to review what you know about my business admin. Tell me what is still unknown and recommend one next action that would remove the most work. Do not change any business service.";
const CLAUDE_GUIDE = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";
const CHATGPT_GUIDE = "https://developers.openai.com/api/docs/guides/custom-mcp-server";

/** SQLite may hand back numeric 0/1 even where rows are typed as strings. */
const isFlagged = (v: unknown): boolean => v === 1 || v === "1" || v === true;

function isLocalOrPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1" || h === "::" || h === "0.0.0.0") return true;
  if (!h.includes(".") && !h.includes(":")) return true;
  const parts = h.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    return a === 127 || a === 10 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.includes(":")) return /^(f[cd]|fe[89ab])/.test(h) || h.startsWith("::ffff:");
  return false;
}

function grantState(g: Record<string, unknown>): "Access approved" | "Access revoked" | "Access expired" {
  if (isFlagged(g.revoked)) return "Access revoked";
  const expires = Number(g.expires);
  if (!Number.isFinite(expires) || expires <= Date.now()) return "Access expired";
  return "Access approved";
}
const GRANT_STATE_ET = { "Access approved": "Ligipääs kinnitatud", "Access revoked": "Ligipääs tühistatud", "Access expired": "Ligipääs aegunud" } as const;

function grantClientName(g: Record<string, unknown>, l: Lang): string {
  try {
    const name = (JSON.parse(String(g.metadata ?? "")) as { client_name?: unknown }).client_name;
    return typeof name === "string" && name.trim() ? name : tr(l)("Assistent", "Assistant");
  } catch { return tr(l)("Assistent", "Assistant"); }
}

function grantOrigin(g: Record<string, unknown>, l: Lang): string {
  try { return new URL(String(g.redirect ?? "")).origin; } catch { return tr(l)("pole teada", "not available"); }
}

/** Copy control in the existing view pattern: text lives escaped in a DOM
 * attribute; the one static script below reads it with getAttribute. Nothing
 * user-controlled is interpolated into inline JavaScript. */
function copyBlock(id: string, label: string, text: string, l: Lang): string {
  const t = tr(l);
  return `<button type="button" id="copy-${id}" data-copy-text="${esc(text)}" data-copy-id="${id}">${esc(label)}</button>
<p class="small" id="copy-${id}-ok" role="status" hidden>${t("Kopeeritud.", "Copied.")}</p>
<div id="copy-${id}-fallback" hidden role="status"><p class="small">${t("Kopeerimine ebaõnnestus — vali allolev tekst ja kopeeri see ise.", "Copy failed — select the text below and copy it yourself.")}</p>
<label class="small" for="copy-${id}-text">${t("Kopeeri käsitsi", "Copy manually")}<textarea id="copy-${id}-text" rows="3" readonly></textarea></label></div>`;
}

const GUIDE_SCRIPT = `<script>(function(){var tabs=Array.prototype.slice.call(document.querySelectorAll("[data-guide-tab]"));function show(btn,focus){for(var i=0;i<tabs.length;i++){var on=tabs[i]===btn;tabs[i].setAttribute("aria-selected",on?"true":"false");tabs[i].tabIndex=on?0:-1;var panel=document.getElementById(tabs[i].getAttribute("aria-controls"));if(panel)panel.hidden=!on;}if(focus)btn.focus();}for(var j=0;j<tabs.length;j++){(function(btn,idx){btn.addEventListener("click",function(){show(btn,false);});btn.addEventListener("keydown",function(e){var n=null;if(e.key==="ArrowRight")n=tabs[(idx+1)%tabs.length];else if(e.key==="ArrowLeft")n=tabs[(idx-1+tabs.length)%tabs.length];else if(e.key==="Home")n=tabs[0];else if(e.key==="End")n=tabs[tabs.length-1];else return;e.preventDefault();if(n)show(n,true);});})(tabs[j],j);}})();</script>`;

const COPY_SCRIPT = `<script>(function(){var bs=document.querySelectorAll("[data-copy-text]");for(var i=0;i<bs.length;i++){(function(b){b.addEventListener("click",function(){var t=b.getAttribute("data-copy-text")||"";var id=b.getAttribute("data-copy-id")||"";var ok=function(){var m=document.getElementById("copy-"+id+"-ok");var f=document.getElementById("copy-"+id+"-fallback");if(m)m.hidden=false;if(f)f.hidden=true;};var fail=function(){var m=document.getElementById("copy-"+id+"-ok");var f=document.getElementById("copy-"+id+"-fallback");var a=document.getElementById("copy-"+id+"-text");if(m)m.hidden=true;if(a)a.value=t;if(f)f.hidden=false;if(a){a.focus();a.select();}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fail);}else{fail();}});})(bs[i]);}})();</script>`;

/** Compact retained assistant-history block for the Connection page. Rendered
 * below the main copy/connect action so Copy MCP address stays above the
 * fold. Read-only: never writes, approves, counts or claims live status. */
function milestoneBlock(l: Lang, milestones?: AssistantMilestones): string {
  const t = tr(l), label = t("Assistendi ajalugu", "Assistant history");
  const note = `<p class="small muted">${t("Salvestatud ajalugu, mitte ühenduse kontroll reaalajas", "Saved history, not a live connection check")}</p>`;
  const meaning = `<details><summary>${t("Mida see ajalugu tähendab", "What this history means")}</summary><p class="small muted">${t(
    "Säilitatud tööruumi ajalugu, mitte praegune ühendus ega ligipääs. Salvestatud päring tähendab, et lubatud päring jõudis sellesse tööruumi; see ei tõenda konkreetse teenusepakkuja identiteeti. See ei tõenda, et klient vastuse sai, ega tööd väljaspool AI-hüppelauda. Kviitungite ja aruannete tunnused on siin peidetud. Kõik üksikasjad on lehel <a href=\"/activity\">Tehtud</a>.",
    "Retained workspace history — not current connectivity or access. A recorded request means a permitted request reached this workspace; it is not proof of a named vendor identity. It is not proof the client received a reply, nor proof of work done outside Launchpad. Identifiers for receipts and reports stay hidden here. Full detail lives under <a href=\"/activity\">Activity</a>.")}</p></details>`;
  const head = `<h2>${label}</h2>`, none = `<p class="small">${t("Säilitatud ajaloos pole ühtegi päringut.", "No request recorded in retained history.")}</p>`;
  if (!milestones) return `<section class="card" aria-label="${label}">${head}${none}${note}${meaning}</section>`;
  if (milestones.synthetic) return `<section class="card" aria-label="${label}">${head}<p class="small">${t("Näidistööruum: ainult näidisandmed. Päris assistendi päringut siin pole.", "Synthetic sample workspace — sample data only. No real assistant request is recorded here.")}</p>${note}${meaning}</section>`;
  const last = milestones.lastContact
    ? `<p class="small">${t("Viimane päring saabus", "Last request received")} ${esc(fmtUtc(milestones.lastContact.at, l) ?? milestones.lastContact.at)}</p>`
    : none;
  const saved = milestones.firstSavedAssessment
    ? `<p class="small">${t("Hinnang salvestatud", "Assessment saved")} ${esc(fmtUtc(milestones.firstSavedAssessment.at, l) ?? milestones.firstSavedAssessment.at)} · ${t("assistendi hinnang, sõltumatult kontrollimata.", "assistant judgment, not independently checked.")} <a href="/">${t("Täna", "Status")}</a> · <a href="/activity">${t("Tehtud", "Activity")}</a></p>`
    : "";
  return `<section class="card" aria-label="${label}">${head}${last}${saved}${note}${meaning}</section>`;
}

export function connectionBody(opts: { lang: Lang; csrf: string; baseUrl: string; reportingEnabled: boolean; tokens: Record<string, unknown>[]; grants: Record<string, string>[]; candidates: Record<string, string>[]; milestones?: AssistantMilestones }): string {
  const l = opts.lang, t = tr(l), en = l === "en" ? "" : ' lang="en"', csrf = esc(opts.csrf);
  const example = JSON.stringify({ report_id: "oct-assessment", expected_version: 3, assessment: { assessed_domains: ["money", "customers"], responsibilities: [{ id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "…", access: "…", success_criterion: "…", next_checkpoint: "…", reason: "short reason", evidence_refs: ["provider-object:123"] }], gaps: [], conclusion: "short conclusion", next_action: { title: "…", rationale: "…", uncertainty: "…", needs_owner: true } } }, null, 1);
  const endpoint = `${String(opts.baseUrl ?? "").replace(/\/+$/, "")}/mcp`;
  let parsed: URL | null = null;
  try { parsed = new URL(String(opts.baseUrl ?? "")); } catch { parsed = null; }
  const remoteReady = parsed !== null && parsed.protocol === "https:" && !isLocalOrPrivateHost(parsed.hostname);
  const pasteAddressStep = remoteReady ? t("Kleebi ülal olev MCP-aadress.", "Paste the MCP address above.") : t("Kui avalik HTTPS-aadress on seadistatud, kleebi see siia. Ära kleebi pilves töötavasse assistenti localhost-, loopback- ega privaatvõrgu aadressi.", "Once a public HTTPS address is configured, paste that address here — do not paste a localhost, loopback or private-network address into a cloud assistant.");
  const endpointBlock = remoteReady
    ? `<div class="endpoint">${t("MCP-aadress", "MCP address")}<br><code>${esc(endpoint)}</code></div>
${copyBlock("endpoint", t("Kopeeri MCP-aadress", "Copy MCP address"), endpoint, l)}
<p class="small muted">${t("HTTPS-aadress on seadistatud. Ühilduvust sinu assistendiga pole kontrollitud.", "HTTPS address configured. Compatibility with your assistant has not been verified.")}</p>`
    : `<div class="note"><p><strong>${t("Kohalik seadistus pooleli.", "Local setup pending.")}</strong></p><p class="small">${t("Avalik HTTPS-aadress pole veel seadistatud, seega pilves töötav assistent ei saa seda lehte veel kasutada.", "A public HTTPS address is not configured yet, so a cloud assistant cannot use this page yet.")}</p></div>
<details><summary>${t("Miks, ja kohalik arendus", "Why, and local development")}</summary><p class="small muted">${t("Ära kleebi pilves töötavasse assistenti localhost-, loopback-, privaatvõrgu ega tavalist http-aadressi. Turvaline tunnel võiks kohaliku serveri kättesaadavaks teha, kuid siin pole tunnelit seadistatud.", "Do not paste a localhost, loopback, private-network or plain-http address into a cloud assistant. A secure tunnel could make a local server reachable, but no tunnel is configured here.")}</p><p class="small">${t("Edasijõudnutele: kohalik arendus, ainult selle arvuti kohalikule arenduskliendile:", "Advanced: local development — for a local development client on this machine only:")} <code>${esc(endpoint)}</code></p></details>`;
  const grantRows = opts.grants.map((g) => {
    const state = grantState(g as Record<string, unknown>);
    return `<div class="row"><strong>${esc(grantClientName(g as Record<string, unknown>, l))}</strong><p>${t("Tagasisuunamise aadress", "Return address")}: ${esc(grantOrigin(g as Record<string, unknown>, l))}<br>${t("Õigused", "Permissions")}: ${esc(g.scopes)} · ${t(GRANT_STATE_ET[state], state)}</p>${state === "Access approved" ? `<form method="post" action="/oauth/disconnect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="grant_id" value="${esc(g.id)}"><button class="secondary">${t("Katkesta assistendi ühendus", "Disconnect assistant")}</button></form>` : ""}</div>`;
  }).join("");
  const tokenRows = opts.tokens.map((tk) => {
    const revoked = isFlagged(tk.revoked);
    return `<div class="row"><code>${esc(tk.id)}</code><br><span class="small muted">${t("Õigused", "Scopes")}: ${esc(tk.scopes)} · ${revoked ? t("tühistatud", "revoked") : t("aktiivne", "active")} · ${t("loodud", "created")} ${esc(tk.created_at)}${tk.last_used_at ? ` · ${t("viimati kasutatud", "last used")} ${esc(tk.last_used_at)}` : ""}</span>${revoked ? "" : `<form method="post" action="/tokens/revoke"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="token_id" value="${esc(tk.id)}"><button type="submit" class="secondary">${t("Tühista see võti", "Revoke this token")}</button></form>`}</div>`;
  }).join("");
  return `<h1>${t("Andmed ja õigused", "Connection &amp; data")}</h1>
<section class="card" aria-label="${t("Ühenda oma assistent", "Connect your assistant")}"><h2>${t("Ühenda oma assistent", "Connect your assistant")}</h2>
<h3>${t("1 · Kopeeri aadress", "1 · Copy the address")}</h3>
${endpointBlock}
<p class="small muted">${t("Google'iga sisselogimine tuvastab sinu isiku; see ei ühenda sinu e-posti ega kalendrit ega tõenda, et tohid ettevõtte nimel tegutseda.", "Google sign-in identifies you; it does not connect your email or calendar, and it does not prove you may act for a company.")}</p>
<h3>${t("2 · Lisa see oma assistendis", "2 · Add it in your assistant")}</h3>
<div class="tabs" role="tablist" aria-label="${t("Assistendi seadistusjuhendid", "Assistant setup guides")}"><button type="button" role="tab" id="tab-claude" aria-selected="true" aria-controls="guide-claude" tabindex="0" data-guide-tab>Claude</button><button type="button" role="tab" id="tab-chatgpt" aria-selected="false" aria-controls="guide-chatgpt" tabindex="-1" data-guide-tab>${t("ChatGPT (veeb)", "ChatGPT (web)")}</button></div>
<div class="tabpanel" role="tabpanel" id="guide-claude" aria-labelledby="tab-claude">
<ol class="steps"><li>${t("Ava Customize → Connectors.", "Open Customize → Connectors.")}</li><li>${t("Vali Add custom connector.", "Choose Add custom connector.")}</li><li>${esc(pasteAddressStep)}</li><li>${t("Logi sisse ja vaata ligipääs üle, enne kui selle kinnitad.", "Sign in and review access before you approve it.")}</li></ol>
<p class="small"><a href="${CLAUDE_GUIDE}" rel="noopener noreferrer">${t("Claude'i ametlik juhend kohandatud ühenduse lisamiseks", "Claude's official custom connector guide")}</a></p></div>
<div class="tabpanel" role="tabpanel" id="guide-chatgpt" aria-labelledby="tab-chatgpt" hidden>
<ol class="steps"><li>${t("Ava Plugins ja vali kohandatud MCP-serveri lisamine.", "Open Plugins and choose to add a custom MCP server.")}</li><li>${esc(pasteAddressStep)}</li><li>${t("Lõpeta OAuth-sisselogimine ja vaata ligipääs üle.", "Complete the OAuth sign-in and review access.")}</li><li>${t("Paigalda see ja vali see vestluses.", "Install it, then select it in chat.")}</li></ol>
<p class="small"><a href="${CHATGPT_GUIDE}" rel="noopener noreferrer">${t("OpenAI ametlik juhend kohandatud MCP-serveri lisamiseks", "OpenAI's official custom MCP server guide")}</a></p></div>
<details><summary>${t("Ühenduse üksikasjad", "Connection details")}</summary><p class="small muted">${t("Ekraanid ja kättesaadavus sõltuvad paketist, kontost, keelest ja uuenduste levikust. Järgi oma konto ametlikku juhendit; miski siin ei luba paketi sobivust ega nõua ostu. Vaata OAuth-i ajal küsitud õigused (scopes) üle, enne kui ligipääsu kinnitad.", "Screens and account availability vary by plan, account, language and rollout. Follow the official guide for your account; nothing here promises plan eligibility or requires a purchase. Review the requested permissions (scopes) during OAuth before you approve access.")}</p></details>
<h3>${t("3 · Saada esimene päring", "3 · Send your first request")}</h3>
<div class="quote"${en}><p>${esc(FIRST_REQUEST)}</p></div>
${copyBlock("first-request", t("Kopeeri esimene päring", "Copy first request"), FIRST_REQUEST, l)}
<p class="small muted">${t("Kleebi see oma assistenti, kui ta saab AI-hüppelauda kasutada. Kopeerimine päringut ei käivita.", "Paste this into your assistant once it can use Launchpad. Copying it does not run the request.")}</p>
${GUIDE_SCRIPT}
${COPY_SCRIPT}
</section>
${milestoneBlock(l, opts.milestones)}
<section class="card" aria-label="${t("Assistendi ligipääs", "Assistant access")}"><h2>${t("Assistendi ligipääs", "Assistant access")}</h2>
<p class="small muted">${t("Kinnitatud ligipääs on ainult luba; see ei tõenda, et assistent mõne töö tegi.", "An approved grant is permission only; it is not evidence of a completed assistant task.")}</p>
${grantRows || `<p>${t("Assistendi ligipääsu pole veel kinnitatud.", "No assistant access approved yet.")}</p>`}
<details><summary>${t("Edasijõudnutele: käsitsi võtmed", "Advanced: manual tokens")}</summary><p class="small muted">${t("Ainult arenduseks: klientidele, mis saadavad oma autoriseerimispäise. Võtit näidatakse üks kord väljastamisel ja mitte kunagi sellel lehel.", "Development only — for clients that send a custom authorization header. Tokens are shown once at issue time and never on this page.")}</p>
<form method="post" action="/tokens"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">${t("Väljasta assistendi võti (lugemine + aruanded)", "Issue assistant token (read + report)")}</button></form>
${tokenRows || `<p class="muted">${t("Võtmeid veel pole.", "No tokens yet.")}</p>`}</details>
</section>
<section class="card"><h2>${t("Töö käigu jagamise luba", "Progress sharing permission")}</h2>
<p>${t("Praegu", "Currently")}: <strong>${opts.reportingEnabled ? t("sees", "on") : t("väljas (vaikimisi)", "off (the default)")}</strong>.</p>
<p class="small">${t("Lugemisõigus ja salvestatud aruanded on eraldi: lugemine näitab sinu salvestatud töö käiku, jagamine laseb assistendil siia lühikesi teateid ja oma hinnangu <em>salvestada</em>.", "Read access and saved reports are separate: reading shows your saved progress; sharing lets your assistant <em>save</em> concise updates and its assessment here.")}</p>
<form method="post" action="/reporting"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="enabled" value="${opts.reportingEnabled ? "0" : "1"}"><button type="submit">${opts.reportingEnabled ? t("Lõpeta töö käigu jagamine", "Stop progress sharing") : t("Luba töö käigu jagamine", "Allow progress sharing")}</button></form>
<details><summary>${t("Kuidas jagamine töötab", "How sharing works")}</summary>
<p class="small muted">${t("Üks luba katab mõlemat, mida assistent siia salvestada tohib: lühikesed teated tööde kohta ja tema hinnangu sinu ettevõttele (liigitused, lühikesed põhjendused, lüngad, üks järgmine samm). AI-hüppelaud ei saa sinu vestlusi; see salvestab ainult selle, mida assistent saadab, sealhulgas kinnitustaotluste täpse teksti. See luba ei kinnita kunagi ühtegi äritoimingut.", "One grant covers both things your assistant may save here: concise task updates and its business assessment (classifications, short reasons, gaps, one next action). Launchpad does not receive your conversations; it stores only what your assistant sends it, including the exact text of approval requests. This permission never approves business actions.")}</p>
<p class="small muted">${t("Jagamise väljalülitamine keelab assistendil siia aruandeid salvestada; see ei võta ära lugemisõigust, mille oled juba andnud.", "Turning sharing off blocks your assistant from saving reports here; it does not remove read access you already approved to your saved progress.")}</p>
<p class="small muted">${t("Assistendi hinnang on tema enda otsus ja AI-hüppelaud ei lisa ülevaatust. Miski sellel lehel ei uuene iseenesest: aruanne ilmub ainult siis, kui assistent selle jagamise ajal salvestab. Hinnangut ei pea eraldi heaks kiitma.", "Your assistant's assessment is its own judgment, and Launchpad adds no review step. Nothing on this page updates by itself: a report appears only when your assistant saves one while sharing is on. No manual ratification is required.")}</p>
<p class="small muted">${t("Jagamise lõpetamine ei peata teenusepakkuja enda ajastatud töid ning AI-hüppelaua lahtiühendamine ei tühista assistendi otseühendusi teenusepakkujatega.", "Stopping does not stop a provider's own scheduled jobs, and disconnecting Launchpad does not revoke direct assistant/provider connections.")}</p>
<p class="small muted">${t("Aruandeid säilitatakse kuni 500; kui see piir on täis, uusi aruandeid vastu ei võeta, kuni töö käigu kustutad. Ekspordi või kustuta allpool igal ajal. Jagamise lõpetamist jõustab server iga kirjutamise juures, ka teenusesoovituste puhul.", "Up to 500 reports are retained; once that limit is reached, new reports are refused until you delete progress. Export or delete below at any time. Stopping is enforced on the server for every write, including service nominations.")}</p></details>
<details><summary>${t("Vaata, mida üks aruanne täpselt sisaldab", "See exactly what one report contains")}</summary><pre${en}>${esc(example)}</pre></details></section>
<section class="card"><h2>${t("Sinu teenusesoovitused", "Your service nominations")}</h2>
<p class="muted">${t("Teenused, mida sinu assistent soovitas. Need on nähtavad ainult sinu tööruumis ja ootavad inimese ülevaatust; neid ei avaldata kunagi automaatselt.", "Services your assistant nominated. They are private to your workspace and wait for human moderation — never auto-published.")}</p>
${opts.candidates.map((c) => `<div class="row"><strong>${esc(c.name)}</strong> <span class="pill"${en}>${esc(c.status)}</span><br><span class="small muted">${esc(c.connection)} · ${esc(c.jobs)} · ${esc(c.created_at)}</span><form method="post" action="/candidates/delete"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="candidate_id" value="${esc(c.id)}"><button type="submit" class="secondary">${t("Kustuta see soovitus", "Delete this nomination")}</button></form></div>`).join("") || `<p class="muted">${t("Veel pole.", "None yet.")}</p>`}
</section>
<section class="card"><h2>${t("Sinu minimaalsed andmed", "Your minimal data")}</h2>
<p>${t("AI-hüppelaud salvestab sinu hinnangud, tööde aruanded, tegevused, teenusesoovitused ja võtmed. Samuti salvestab see iga kinnitustaotluse täpse teksti, mille assistent sulle kinnitamiseks saadab (igaüks kuni 4000 märki, koos saaja aadressi, summade ja arvudega), ning isikustamata teksti nendest päringutest, mida assistent teha ei saanud, kuni kustutad oma töö käigu. Sinu vestlusi see kunagi ei saa. Kustutamine tühistab ka võtmed ja logib välja teised seansid, nii et vanad ootel aruanded ei saa andmeid taastada. See ei kustuta ühegi teenusepakkuja kirjeid.", "Launchpad stores your assessments, task reports, activity, service nominations and tokens. It also stores the exact text of every approval request your assistant asks you to approve (up to 4,000 characters each, with the recipient's address, amounts and figures) and the de-identified text of requests your assistant could not do, until you delete your progress. It never receives your conversations. Deleting also revokes tokens and signs out other sessions, so old queued reports cannot recreate it. It does not delete any provider's records.")}</p>
<p><a class="btn secondary" href="/export">${t("Ekspordi minu töö käik (JSON)", "Export my progress (JSON)")}</a></p>
<form method="post" action="/delete" onsubmit="return confirm('${t("Kas kustutada sinu töö käik AI-hüppelaual?", "Delete your Launchpad progress?")}')"><input type="hidden" name="csrf" value="${csrf}"><button type="submit" class="danger">${t("Kustuta minu töö käik", "Delete my progress")}</button></form></section>`;
}

export function tokenOnceBody(raw: string): string {
  return `<section class="card hero"><h1>Your new assistant token</h1>
<p>Shown <strong>once</strong> — copy it now into your MCP client's Authorization header. It is never put in a URL and cannot be shown again; revoke and re-issue if you lose it.</p>
<pre>${esc(raw)}</pre>
<p><a class="btn" href="/connection">Back to Connection</a></p></section>`;
}

// --- Approvals (#18, ux2 change 4): the assistant did the work; the owner's part is one decision. ---
const KIND: Record<string, [string, string]> = { send_message: ["Sõnum", "Message"], send_invoice: ["Arve", "Invoice"], prepare_payment: ["Makse ettevalmistus", "Payment preparation"], prepare_filing: ["Deklaratsiooni ettevalmistus", "Filing preparation"], post_entries: ["Raamatupidamise kanded", "Book entries"] };
const CONTENT_HEAD: Record<string, [string, string]> = { send_message: ["Kiri, täpselt sellisena", "The message, exactly as it will go"], send_invoice: ["Arve, täpselt sellisena", "The invoice, exactly as it will go"], prepare_payment: ["Makse, täpselt sellisena", "The payment, exactly as prepared"], prepare_filing: ["Deklaratsioon, täpselt sellisena", "The filing, exactly as prepared"], post_entries: ["Kanded, täpselt sellisena", "The entries, exactly as they will be posted"] };
interface ApprovalPayload { kind?: string; recipient?: { name?: string; address?: string } | string; amount_cents?: number; period?: string; document?: { title?: string; content?: string }; document_ref?: string; summary?: string; }
interface OutcomeEntry { outcome: string; observed_at?: string; recorded_at?: string }
/** Stored payloads are parsed leniently so earlier synthetic rows still render. */
function approvalView(a: ApprovalRow, l: Lang) {
  const t = tr(l);
  let p: ApprovalPayload = {};
  try { p = JSON.parse(a.payload_json) as ApprovalPayload; } catch { /* unreadable payload renders as unknown */ }
  let outcome: (OutcomeEntry & { history?: OutcomeEntry[] }) | null = null;
  try { outcome = a.outcome_json ? JSON.parse(a.outcome_json) : null; } catch { outcome = null; }
  const recipient = typeof p.recipient === "string" ? { name: p.recipient } : p.recipient ?? {};
  const kindKey = a.kind ?? p.kind ?? "";
  const kind = KIND[kindKey] ? t(...KIND[kindKey]) : t("Varasem näidiskinnitus", "Earlier synthetic approval");
  return { p, recipient, noAddress: approvalAddressMissing(a), kindKey, kind, title: p.document?.title ?? p.document_ref ?? kind, amount: typeof p.amount_cents === "number" ? (kindKey === "post_entries" ? t(`${fmtEur(p.amount_cents, l)} kontrollsumma`, `${fmtEur(p.amount_cents, l)} check total`) : fmtEur(p.amount_cents, l)) : null, outcome, history: outcome?.history ?? (outcome ? [outcome] : []) };
}
/** Per-outcome receipt words: [state-chip kind, ET, EN]. */
const OUTCOME: Record<string, [string, string, string]> = { sent: ["sent", "Saadetud", "Sent"], submitted: ["sent", "Esitatud", "Submitted"], accepted: ["accepted", "Vastu võetud", "Accepted"], rejected: ["rejected", "Tagasi lükatud", "Rejected"], paid: ["paid", "Makstud", "Paid"], posted: ["sent", "Kirjendatud", "Posted"], failed: ["rejected", "Ei õnnestunud", "Failed"] };
const outcomeChip = (o: string, l: Lang, sample: boolean) => { const [k, et, en] = OUTCOME[o] ?? ["drafted", o, o]; const demo = sample && o !== "failed"; return stateChip(k, demo ? tr(l)(`${et}: demo`, `${en}: demo`) : tr(l)(et, en), demo); };

function stateLine(a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang, sample: boolean): string {
  const t = tr(l), seen = (o: string) => v.history.find((h) => h.outcome === o);
  const act: [string, string, string] = v.kindKey === "prepare_payment" ? ["paid", "Makstud", "Paid"] : v.kindKey === "prepare_filing" ? ["submitted", "Esitatud", "Submitted"] : v.kindKey === "post_entries" ? ["posted", "Kirjendatud", "Posted"] : ["sent", "Saadetud", "Sent"];
  const follow: [string, string, string] | null = v.kindKey === "prepare_filing" ? ["accepted", "Vastu võetud", "Accepted"] : v.kindKey === "prepare_payment" || v.kindKey === "post_entries" ? null : ["paid", "Makstud", "Paid"];
  const steps: { cls: string; mark: string; text: string; note?: string }[] = [
    { cls: "done", mark: "✓", text: t("Koostatud", "Drafted"), note: `${t("Assistent", "Your assistant")} · ${fmtWhen(a.created_at, l)}` },
  ];
  const decided = !!a.decided_at && a.state !== "declined";
  steps.push(decided ? { cls: "done", mark: "✓", text: t("Kinnitatud", "Approved"), note: `${a.approved_by_rule ? t("Püsiluba", "Standing approval") : a.owner_confirmation ? t("Sina, assistendis", "You, in your assistant") : t("Sina", "You")} · ${fmtWhen(a.decided_at, l)}` } : { cls: "todo", mark: "", text: t("Kinnitatud: ootab sind", "Approved: waiting for you") });
  const done = seen(act[0]), failed = seen("failed");
  if (failed) steps.push({ cls: "stop", mark: "✕", text: t("Ei õnnestunud", "Failed"), note: `${t("Assistent teatas", "Your assistant reports")} · ${fmtWhen(failed.observed_at, l)}` });
  else if (done) steps.push({ cls: sample ? "demo" : "done", mark: sample ? "–" : "✓", text: sample ? t(`${act[1]}: demo`, `${act[2]}: demo`) : t(act[1], act[2]), note: `${t("Assistent teatas", "Your assistant reports")} · ${fmtWhen(done.observed_at, l)}${sample ? t(" · päriselt ei saadetud", " · nothing really sent") : ""}` });
  else steps.push({ cls: "todo", mark: "", text: t(`${act[1]}: ootab assistendi teadet`, `${act[2]}: waiting for your assistant's report`) });
  if (follow && !failed) {
    // Terminal follow-ups: a filing ends accepted or rejected; a send also ends paid.
    const end = v.history.find((h) => (v.kindKey === "prepare_filing" ? ["accepted", "rejected"] : ["accepted", "rejected", "paid"]).includes(h.outcome));
    if (end?.outcome === "rejected") steps.push({ cls: "stop", mark: "✕", text: t("Tagasi lükatud", "Rejected"), note: `${t("Assistent teatas", "Your assistant reports")} · ${fmtWhen(end.observed_at, l)}` });
    else if (end) steps.push({ cls: "done", mark: "✓", text: t(OUTCOME[end.outcome][1], OUTCOME[end.outcome][2]), note: `${t("Assistent teatas", "Your assistant reports")} · ${fmtWhen(end.observed_at, l)}` });
    else steps.push({ cls: "todo", mark: "", text: t(`${follow[1]}: ootab`, `${follow[2]}: pending`) });
  }
  const current = steps.findIndex((s) => s.cls === "todo");
  return `<ol class="state-line" aria-label="${t("Töö seis", "Where this job is")}">${steps.map((s, i) => `<li class="state-step state-step--${s.cls}"${i === current ? ' aria-current="step"' : ""}><span class="state-mark" aria-hidden="true">${s.mark}</span><span class="state-text">${esc(s.text)}${s.note ? `<span class="state-note">${esc(s.note)}</span>` : ""}</span></li>`).join("")}</ol>`;
}

const NO_ADDRESS = (l: Lang) => tr(l)("Aadress puudub — seda kinnitust ei saa kasutada", "Address missing — this approval cannot be used");
/** Recipient, amount and period. On the pending ticket the amount and period are the hero figure instead (`heroAmount`). */
function approvalFacts(v: ReturnType<typeof approvalView>, l: Lang, heroAmount = false): string {
  const t = tr(l);
  const row = (k: string, val: string | null | undefined, sub?: string | null, cls = "") => val ? `<div class="fact-row${cls}"><dt>${esc(k)}</dt><dd>${esc(val)}${sub ? `<span class="fact-sub">${esc(sub)}</span>` : ""}</dd></div>` : "";
  return `<dl class="facts">${row(t("Saaja", "To"), v.recipient.name, v.noAddress ? NO_ADDRESS(l) : v.recipient.address)}${heroAmount ? "" : `${row(v.kindKey === "post_entries" ? t("Kannete summa (märgita)", "Entries total (unsigned)") : t("Summa", "Amount"), v.amount, v.kindKey === "post_entries" ? t("Kontrollsumma, mitte makse", "A check total, not a payment") : null, " fact-row--amount")}${row(t("Periood", "Period"), v.p.period ? fmtPeriod(v.p.period, l) : null)}`}</dl>`;
}
const amountHero = (v: ReturnType<typeof approvalView>, l: Lang) => v.amount ? `<div class="amount"><b>${esc(v.amount)}</b>${v.p.period ? `<span>${esc(fmtPeriod(v.p.period, l))}</span>` : ""}${v.kindKey === "post_entries" ? `<span>${esc(tr(l)("Kannete summa märgita: kontrollsumma, mitte makse", "Entries total, unsigned: a check total, not a payment"))}</span>` : ""}</div>` : "";

/** Who does what for this approval, as one sentence; the owner's part in bold. */
function handLine(kindKey: string, l: Lang): string {
  const t = tr(l), me = `<b>${t("Sina", "You")}</b>`, ai = t("Assistent", "Your assistant");
  if (kindKey === "prepare_payment") return `<p class="hand">${ai} ${t("valmistab makse ette", "prepares the payment")}; ${me} ${t("maksad oma pangas", "pay in your bank")}.</p>`;
  if (kindKey === "prepare_filing") return `<p class="hand">${ai} ${t("valmistab ette", "prepares it")}; ${me} ${t("esitad e-MTA-s", "file it in e-MTA")}.</p>`;
  if (kindKey === "post_entries") return `<p class="hand">${me} ${t("kontrollid ja kinnitad kanded", "check and approve the entries")}. ${ai} ${t("kirjendab need sinu raamatupidamisprogrammis ja annab siia tulemuse teada", "posts them in your accounting software and reports the result here")}.</p>`;
  return `<p class="hand">${me} ${t("kontrollid ja kinnitad, ainult see", "check and approve, nothing else")}. ${ai} ${t("saadab selle oma tööriistadega ja annab siia tulemuse teada", "sends it with its own tools and reports the result here")}.</p>`;
}

/** Ticket head: the request type („Maksemeeldetuletus: …”) moves to the kind line, so the h1 holds only the object and never breaks mid-word. */
function ticketHead(v: ReturnType<typeof approvalView>, kindExtra = ""): string {
  const m = /^([^:]{1,40}):\s+(\S[\s\S]*)$/.exec(v.title), type = m?.[1], head = m ? m[2][0].toUpperCase() + m[2].slice(1) : v.title;
  return `<p class="kind">${esc(v.kind)}${type ? ` · ${esc(type)}` : ""}${kindExtra}</p>
<h1 id="a-h">${esc(head)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}</h1>`;
}
const STAMP = '<span class="stamp" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg></span>';

/** The owner approved in their own assistant chat: quote their words, as the assistant reported them. */
const confirmedInAssistant = (a: ApprovalRow, l: Lang) => `<p class="small"><strong>${tr(l)("Kinnitasid assistendis", "You approved in your assistant")}: „${esc(a.owner_confirmation ?? "")}”.</strong> ${tr(l)("Siin pole vaja uuesti kinnitada. Sinu sõnad on assistendi teade.", "No need to approve again here. Your words are as your assistant reported them.")}</p>`;

// --- Standing approvals (#45): the owner sets a rule once; matching sends need no new tap. ---
const ruleChip = (l: Lang) => labelChip("owner", tr(l)("Püsiloaga", "Standing approval"));
const ruleOf = (a: ApprovalRow, rules: StandingRule[] = []) => a.approved_by_rule ? rules.find((r) => r.id === a.approved_by_rule) ?? null : null;
const ruleTitle = (a: ApprovalRow, rules: StandingRule[] | undefined, l: Lang) => { const r = ruleOf(a, rules); return r ? standingRuleName(r, l) : tr(l)("püsiluba", "standing approval"); };
const ruleLive = (r: StandingRule, now: Date) => !r.revoked_at && Date.parse(r.expires_at) > now.getTime();
const csrfInput = (csrf: string) => `<input type="hidden" name="csrf" value="${esc(csrf)}">`;
const capEur = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
const ruleLimits = (l: Lang) => tr(l)(`Kuni ${STANDING_DEFAULTS.maxPerDay} päevas · kehtib ${STANDING_DEFAULTS.days} päeva · saad igal ajal lõpetada`, `Up to ${STANDING_DEFAULTS.maxPerDay} a day · valid ${STANDING_DEFAULTS.days} days · end it any time`);
/** Offer on an approved send: approve similar ones automatically from now on (or say a rule already does). */
function standingOffer(a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang, csrf: string, rules: StandingRule[], now: Date, capCents?: number): string {
  if (a.approved_by_rule || !STANDING_KINDS.includes(v.kindKey) || v.noAddress || !v.recipient.address) return "";
  // Follow-ups are approved one by one. A message with no amount cannot be checked against a cap, so it is neither covered nor offered (#96).
  if (a.playbook_id === "customer-follow-ups" || (v.kindKey === "send_message" && typeof v.p.amount_cents !== "number")) return "";
  const t = tr(l), address = normAddress(v.recipient.address), amount = typeof v.p.amount_cents === "number" ? v.p.amount_cents : 0;
  const covering = rules.find((r) => ruleLive(r, now) && r.kind === v.kindKey && r.max_amount_cents >= amount && (standingRecipients(r)?.includes(address) ?? true));
  if (covering) return `<div class="note" id="pusiluba" role="status"><p><strong><span aria-hidden="true">✓ </span>${t("Püsiluba on olemas", "Standing approval is on")}: ${esc(standingRuleName(covering, l))}.</strong></p><p class="small">${t("Järgmised sarnased saadab assistent ilma sinult küsimata.", "Your assistant sends similar ones without asking you.")} <a href="/uhenda#pusiload">${t("Püsiload", "Standing approvals")}</a></p></div>`;
  const cap = capCents ?? offerCapCents(amount), who = v.recipient.name ?? address;
  return `<section class="standing-offer" id="pusiluba" aria-labelledby="so-h"><h2 id="so-h">${esc(t(`Luba edaspidi sarnased automaatselt: ainult ${who}`, `Allow similar ones automatically from now on: only ${who}`))}<span class="cap-now">${esc(t(`, kuni ${capEur(cap)}\u00a0€`, `, up to ${capEur(cap)}\u00a0€`))}</span></h2>
<p class="limits">${esc(ruleLimits(l))}</p>
<p class="small muted">${t("Siis ei pea assistent sinult iga kord küsima. Deklaratsioone ja makseid kinnitad alati ise.", "Then your assistant does not have to ask you every time. You always confirm filings and payments yourself.")}</p>
<form method="post" action="/standing-approvals">${csrfInput(csrf)}<input type="hidden" name="approval_id" value="${esc(a.id)}">
<button type="submit">${t("Luba automaatselt", "Allow automatically")}</button>
<details><summary>${t("Muuda piire", "Change the limits")}</summary>
<div role="radiogroup" aria-label="${t("Kellele", "To whom")}"><label class="check"><input type="radio" name="scope" value="recipient" checked> <span>${esc(t(`Ainult ${who}`, `Only ${who}`))} <span class="small muted">${esc(v.recipient.address)}</span></span></label>
<label class="check"><input type="radio" name="scope" value="any"> <span>${t("Kõik saajad (ka uued)", "Any recipient (including new ones)")}</span></label></div>
<label for="so-max">${t("Summa ülempiir (€)", "Amount cap (€)")}</label><input id="so-max" name="max_eur" inputmode="decimal" autocomplete="off" value="${esc(capEur(cap))}">
<button type="submit">${t("Luba automaatselt", "Allow automatically")}</button>
</details></form></section>`;
}
/** Ühendus → Püsiload: live rules with Lõpeta, and one short form to add a rule. */
function standingSection(l: Lang, o: { csrf: string; rules: StandingRule[] }, now: Date): string {
  const t = tr(l), live = o.rules.filter((r) => ruleLive(r, now));
  const rows = live.map((r) => `<div class="row"><strong>${esc(standingRuleName(r, l))}</strong><br><span class="small muted">${esc(t(`Kuni ${r.max_per_day} päevas · kehtib kuni ${DAY.et.format(new Date(r.expires_at))}`, `Up to ${r.max_per_day} a day · valid until ${DAY.en.format(new Date(r.expires_at))}`))}</span>
<form method="post" action="/standing-approvals/revoke">${csrfInput(o.csrf)}<input type="hidden" name="rule_id" value="${esc(r.id)}"><button type="submit" class="secondary">${t("Lõpeta", "End")}</button></form></div>`).join("");
  return `<section class="card" id="pusiload" aria-labelledby="pl-h"><h2 id="pl-h">${t("Püsiload", "Standing approvals")} (${live.length})</h2>
<p class="small">${t("Püsiluba lubab assistendil sarnaseid kirju ja arveid saata ilma iga kord küsimata, kindlates piirides. Deklaratsioone ja makseid kinnitad alati ise.", "A standing approval lets your assistant send similar messages and invoices without asking every time, within fixed limits. You always confirm filings and payments yourself.")}</p>
${rows || `<p class="muted">${t("Püsiload puuduvad: iga saatmine ootab sinu kinnitust.", "No standing approvals: every send waits for your approval.")}</p>`}
<details><summary>${t("Lisa püsiluba", "Add a standing approval")}</summary><form method="post" action="/standing-approvals">${csrfInput(o.csrf)}
<label for="pl-kind">${t("Mida", "What")}</label><select id="pl-kind" name="kind"><option value="send_message">${t("Sõnumid (nt maksemeeldetuletused)", "Messages (e.g. payment reminders)")}</option><option value="send_invoice">${t("Arved", "Invoices")}</option></select>
<div role="radiogroup" aria-label="${t("Kellele", "To whom")}"><label class="check"><input type="radio" name="scope" value="approved" checked> <span>${t("Ainult saajad, kellele oled juba kinnitanud", "Only recipients you have already approved")}</span></label>
<label class="check"><input type="radio" name="scope" value="any"> <span>${t("Kõik saajad (ka uued)", "Any recipient (including new ones)")}</span></label></div>
<label for="pl-max">${t("Summa ülempiir (€)", "Amount cap (€)")}</label><input id="pl-max" name="max_eur" inputmode="decimal" autocomplete="off" value="${esc(capEur(STANDING_DEFAULTS.maxAmountCents))}">
<p class="small muted">${esc(ruleLimits(l))}</p>
<button type="submit">${t("Lisa püsiluba", "Add standing approval")}</button></form></details></section>`;
}

// --- „Käest ära” (#61): one segment per job; fills only from stored done work or a live rule that fired. ---
const HO_MONTH_IN = ["jaanuaris", "veebruaris", "märtsis", "aprillis", "mais", "juunis", "juulis", "augustis", "septembris", "oktoobris", "novembris", "detsembris"];
const hoMonth = (ym: string, l: Lang) => { const m = Number(ym.slice(5, 7)) - 1; return l === "en" ? `In ${C_PERIOD.en.format(civil(`${ym}-01`)).split(" ")[0]}` : cap(HO_MONTH_IN[m] ?? ""); };
const hoJobTitle = (j: Job, l: Lang) => (l === "en" ? j.title_en : j.title_et);
const hoCount = (h: Handover, l: Lang) => tr(l)(`${h.off} ${h.off === 1 ? "töö" : "tööd"} ${h.total}-st`, `${h.off} of ${h.total} ${h.total === 1 ? "job" : "jobs"}`);
/** „1 ilma sinuta, 1 sinu kinnitusega, 1 teeb keegi teine”: how the counted jobs split. */
function hoSplit(h: Handover, l: Lang): string {
  const t = tr(l), withYou = h.jobs.filter((j) => j.rung === "prep" || (j.rung === "done" && j.ceiling === "law")).length, other = h.jobs.filter((j) => j.rung === "other").length;
  return [h.withoutYou ? t(`${h.withoutYou} ilma sinuta`, `${h.withoutYou} without you`) : "", withYou ? t(`${withYou} sinu kinnitusega`, `${withYou} with your approval`) : "", other ? t(`${other} teeb keegi teine`, `${other} done by someone else`) : ""].filter(Boolean).join(", ");
}
const hoSeg = (j: Job) => `ho-seg${j.rung === "mine" ? "" : ` ho-seg--${j.rung}`}${j.evidence.pending ? " ho-seg--wait" : ""}`;
const HO_RUNG: Record<string, [string, string]> = { mine: ["sinu käes", "yours"], other: ["teeb keegi teine", "done by someone else"], prep: ["assistent valmistab ette, sina kinnitad", "your assistant prepares, you approve"], done: ["assistent teeb ise või lagi käes", "your assistant does it, or at its ceiling"] };
/** Täna hero: the count and the small bar, one tap to the full section on Ühendus. Not a card. */
export function handoverStrip(h: Handover, l: Lang): string {
  const t = tr(l), pending = h.jobs.reduce((n, j) => n + j.evidence.pending, 0);
  const wait = pending ? t(`${pending} ootab sinu kinnitust`, `${pending} waiting for your approval`) : "";
  const sub = h.off ? [hoSplit(h, l), wait].filter(Boolean).join(", ") : wait || t("alusta ühest", "start with one");
  return `<a class="ho-strip" href="/uhenda#kaest-ara" aria-label="${esc(t(`Käest ära: ${hoCount(h, l)}. ${sub}. Vaata lähemalt.`, `Off your plate: ${hoCount(h, l)}. ${sub}. See more.`))}"><p class="ho-line"><b>${t("Käest ära:", "Off your plate:")} <span class="num">${h.off}</span> ${esc(t(`${h.off === 1 ? "töö" : "tööd"} ${h.total}-st`, `of ${h.total}`))}</b><span>${esc(sub)}</span><span class="go">${t("Vaata →", "See →")}</span></p>
<ul class="ho-bar" aria-hidden="true">${h.jobs.map((j) => `<li class="${hoSeg(j)}"></li>`).join("")}</ul></a>`;
}
const HO_CAN: Record<string, [string, string]> = {
  "payment-reminder": ["Assistent oskab: leiab tasumata arved ja koostab kirja; sina kinnitad iga kirja täpselt sellisena.", "Your assistant can find unpaid invoices and draft the letter; you approve each letter exactly as it goes."],
  "vat-return-prep": ["Lagi: esitad alati ise e-MTA-s oma Smart-ID-ga; assistent paneb numbrid valmis.", "Ceiling: you always file in e-MTA with your own Smart-ID; your assistant prepares the figures."],
  "annual-report": ["Lagi: allkirjastad ja esitad ise e-äriregistris; assistent paneb aruande andmed valmis.", "Ceiling: you sign and submit in the e-Business Register; your assistant prepares the figures."],
  invoicing: ["Assistent saab arve ette valmistada ja sinu kinnitusel saata.", "Your assistant can prepare an invoice and send it once you approve."],
};
const HO_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', HO_ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
function handoverRow(j: Job, l: Lang, now: Date, sample: boolean): string {
  const t = tr(l), fx = fixtureText(l, sample), e = j.evidence, assessedChip = labelChip("assistant", t("Assistendi hinnang", "Your assistant's assessment"));
  const mark = j.rung === "done" ? HO_CHECK : j.rung === "prep" ? HO_ARROW : j.rung === "other" ? "R" : "";
  const rung = j.rung === "done" ? (j.ceiling === "rule" ? `${t("Assistent teeb ise", "Your assistant does it")} ${labelChip("owner", t("Sinu püsiluba", "Your standing approval"))}` : `${t("Assistent valmistab ette, sina esitad", "Your assistant prepares, you file")} ${labelChip("official", t("Lagi käes: seadus", "At its ceiling: the law"))}`)
    : j.rung === "prep" ? t("Assistent valmistab ette, sina kinnitad", "Your assistant prepares, you approve")
    : j.rung === "other" ? `${esc(t(`Teeb ${j.assessed?.executor}`, `Done by ${fx.plain(j.assessed?.executor ?? "")}`))} ${assessedChip}` : t("Teed ise", "You do it");
  const verb = j.kind === "post_entries" ? t("kirjendatud", "posted") : j.ceiling === "law" ? t("esitatud", "filed") : t("saadetud", "sent");
  const lines: string[] = [];
  if (e.done) lines.push(`<span class="num">${e.done}</span> ${verb}${e.auto ? t(`, neist <span class="num">${e.auto}</span> ilma sinuta`, `, <span class="num">${e.auto}</span> without you`) : ""}${e.paid ? t(`, <span class="num">${e.paid}</span> makstud`, `, <span class="num">${e.paid}</span> paid`) : ""}${e.last ? ` · ${esc(t("viimati", "last"))} ${esc(fmtWhen(e.last, l, now))}` : ""} ${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}`);
  if (e.rule) lines.push(esc(t(`Püsiluba: ${standingRuleName(e.rule, l)} · aegub ${DAY.et.format(new Date(e.rule.expires_at))}`, `Standing approval: ${standingRuleName(e.rule, l)} · ends ${DAY.en.format(new Date(e.rule.expires_at))}`)));
  if (j.due) lines.push(`${esc(j.due < tallinnDate(now) ? t(`Tähtaeg oli ${C_DAY_MON_YEAR.et.format(civil(j.due))}`, `Was due ${C_DAY_MON_YEAR.en.format(civil(j.due))}`) : t(`Järgmine tähtaeg ${fmtDeadline(j.due, l)}`, `Next deadline ${fmtDeadline(j.due, l)}`))} ${labelChip("rule", t("Arvutatud reeglist", "Calculated by rules"))}${j.dueSource ? ` ${sourceLink(j.dueSource, l)}` : ""}`);
  if (j.source === "assessment" && j.rung !== "other" && j.assessed) lines.push(`„${esc(j.assessed.reason)}” ${assessedChip}`);
  if (j.rung === "mine" && HO_CAN[j.id]) lines.push(esc(t(...HO_CAN[j.id])));
  if (e.pending) lines.push(stateChip("waiting", t(`${e.pending} ootab sinu kinnitust`, `${e.pending} waiting for your approval`)));
  return `<li class="ho-job"><i class="ho-mark${j.rung === "mine" ? "" : ` ho-mark--${j.rung}`}" aria-hidden="true">${mark}</i><div><span class="ho-title">${esc(hoJobTitle(j, l))}</span><p class="ho-rung ho-rung--${j.rung === "other" ? "mine" : j.rung}">${rung}</p>${lines.length ? `<p class="ho-ev">${lines.join("<br>")}</p>` : ""}</div></li>`;
}
const HO_CONNECTOR = (l: Lang) => `<a class="tap-link" href="/kataloog?g=raamatupidamine">${tr(l)("Raamatupidamise ühendused → Kataloog", "Accounting connectors → Catalogue")}</a>`;
const HO_REMINDER_PROMPT: [string, string] = ["Vaata, millised minu arved on tasumata, ja koosta esimesele meeldetuletus. Küsi minult kinnitust enne saatmist.", "Check which of my invoices are unpaid and draft a reminder for the first one. Ask me to approve it before sending."];
/** The one next step, as the section's only elevated object. A standing offer posts to the existing /standing-approvals form. */
function handoverNext(h: Handover, l: Lang, csrf: string): string {
  const t = tr(l), n = h.next;
  const card = (head: string, inner: string) => `<div class="ho-next"><h3>${esc(head)}</h3><div class="ask">${inner}</div></div>`;
  const quote = (text: string) => `<p class="quote"><span>${t("Palu assistendilt:", "Ask your assistant:")}</span>„${esc(text)}”</p>`;
  if (n.type === "standing") {
    const what = hoJobTitle(n.job, l).toLowerCase(), per = n.kind === "send_invoice" ? t("arve kohta", "per invoice") : t("kirja kohta", "per letter");
    const who = n.recipients.length <= 2 ? n.recipients.map((r) => `<b>${esc(r.name)}</b>`).join(t(" ja ", " and ")) : `<b>${esc(t(`${n.recipients.length} senist saajat`, `${n.recipients.length} past recipients`))}</b>`;
    return card(t(`Järgmine samm: anna ${what} täiesti käest ära`, `Next step: take ${what} off your plate completely`), `<span class="labels">${labelChip("owner", t("Sinu püsiluba", "Your standing approval"))}</span>
<span class="ask-title">${esc(t(`Luba edaspidi ${what} automaatselt`, `Allow ${what} automatically from now on`))}</span>
<p class="limits">${t("Ainult", "Only")} ${who}${n.recipients.length <= 2 ? t(" (senised saajad)", " (past recipients)") : ""}<span class="cap-now">, ${t("kuni", "up to")} <b>${esc(capEur(n.capCents))} €</b> ${per}</span>, ${t(`kuni <b>${STANDING_DEFAULTS.maxPerDay}</b> päevas, <b>${STANDING_DEFAULTS.days} päeva</b>. Lõpetad millal tahes.`, `up to <b>${STANDING_DEFAULTS.maxPerDay}</b> a day, <b>${STANDING_DEFAULTS.days} days</b>. End it any time.`)}</p>
<p class="muted small${n.basis.maxCents ? "" : " cap-now"}">${esc(n.basis.maxCents ? t(`Piirid on võetud sinu ${n.basis.count} senisest kinnitusest (suurim ${fmtEur(n.basis.maxCents, l)}). Assistent saadab ise ja annab iga saatmise kohta siia teada.`, `The limits come from your ${n.basis.count} past approvals (largest ${fmtEur(n.basis.maxCents, l)}). Your assistant sends and reports each one here.`) : t(`Senistel kinnitustel summat polnud, seega ülempiir on vaikimisi ${capEur(n.capCents)} €.`, `Your past approvals had no amount, so the cap is the default ${capEur(n.capCents)} €.`))}</p>
<form method="post" action="/standing-approvals">${csrfInput(csrf)}<input type="hidden" name="kind" value="${esc(n.kind)}">
<button type="submit">${t("Luba automaatselt", "Allow automatically")}</button>
<details><summary>${t("Muuda piire", "Change the limits")}</summary>
<div role="radiogroup" aria-label="${t("Kellele", "To whom")}"><label class="check"><input type="radio" name="scope" value="approved" checked> <span>${t("Ainult senised saajad", "Only past recipients")} <span class="small muted">${esc(n.recipients.map((r) => r.address).join(", "))}</span></span></label>
<label class="check"><input type="radio" name="scope" value="any"> <span>${t("Kõik saajad (ka uued)", "Any recipient (including new ones)")}</span></label></div>
<label for="ho-max">${t("Summa ülempiir (€)", "Amount cap (€)")}</label><input id="ho-max" name="max_eur" inputmode="decimal" autocomplete="off" value="${esc(capEur(n.capCents))}">
<button type="submit">${t("Luba automaatselt", "Allow automatically")}</button>
</details></form>`);
  }
  if (n.type === "playbook") {
    const reminder = n.playbookId === "payment-reminder", follow = n.playbookId === "customer-follow-ups", title = hoJobTitle(n.job, l);
    const prompt = follow ? t("Kellele peaksin sel nädalal helistama või kirjutama?", "Who should I call or message this week?") : reminder ? t(...HO_REMINDER_PROMPT) : n.obligation ? t(n.obligation.handoff.prompt_et, n.obligation.handoff.prompt_en) : n.job.kind === "post_entries" ? t(`Valmista ette: ${title}. Küsi minult iga kuu kannete kohta kinnitust enne kirjendamist.`, `Prepare: ${title}. Ask me to approve each month's entries before you post them.`) : t(`Valmista ette: ${title}. Küsi minult kinnitust enne, kui midagi esitan.`, `Prepare: ${title}. Ask me to approve before I file anything.`);
    return card(t("Järgmine samm: anna üks töö ära", "Next step: hand over one job"), `<span class="labels">${labelChip("rule", t("Mängukava", "Playbook"))}</span>
<span class="ask-title">${esc(follow ? t("Lase assistendil öelda, kellele sel nädalal helistada või kirjutada", "Let your assistant tell you who to call or message this week") : reminder ? t("Lase assistendil koostada esimene maksemeeldetuletus", "Let your assistant draft the first payment reminder") : t(`Lase assistendil ette valmistada: ${title}`, `Let your assistant prepare: ${title}`))}</span>
<p class="muted">${esc(follow ? t("Loeb sinu kliendinimekirja või Kliendid lehte ja iga sõnum kinnitatakse ükshaaval.", "It reads your customer list or the Kliendid sheet, and every message is approved one by one.") : reminder ? t("Kõige kiirem võit: see on ainus igakuine töö, mille saab hiljem püsiloaga täiesti käest ära anda. Vajab tasumata arveid: sinu raamatupidamisprogrammi ühendust või faili, mille assistendile jagad.", "The quickest win: the only monthly job a standing approval can later take off your plate completely. It needs your unpaid invoices: your accounting connector or a file you share with your assistant.") : n.job.kind === "post_entries" ? t("Vajab iga kuu pangaliikumisi (LHV ühendus või pangast alla laaditud väljavõte) ja sinu raamatupidamisprogrammi ühendust. Iga kuu kirjendatakse alles pärast sinu kinnitust.", "It needs each month's bank movements (your LHV connector or a statement you download from your bank) and your accounting connector. Each month is posted only after you approve it.") : t("Vajab kuu arveid: sinu raamatupidamisprogrammi ühendust või faile, mille assistendile jagad.", "It needs the period's invoices: your accounting connector or files you share with your assistant."))}</p>
${quote(prompt)}
${follow ? `<a class="tap-link" href="/kataloog?g=kliendid">${t("Ühenda oma kliendinimekiri → Kataloog", "Link your customer list → Catalogue")}</a>` : HO_CONNECTOR(l)}`);
  }
  return card(t("Järgmine samm: ühenda raamatupidamine", "Next step: connect your accounting"), `<span class="ask-title">${t("Ühenda oma raamatupidamisprogramm assistendiga", "Connect your accounting software to your assistant")}</span>
<p>${t("Siis leiab assistent ise arved ja numbrid, mida tööd vajavad.", "Then your assistant finds the invoices and figures the jobs need.")}</p>
${quote(t("Aita mul ühendada minu raamatupidamisprogramm.", "Help me connect my accounting software."))}
${HO_CONNECTOR(l)}`);
}
/** Ühendus → Käest ära: count, bar, one row per job with its evidence, one next step, and the expired-unused finding. */
export function handoverSection(h: Handover, l: Lang, csrf: string, now = new Date(), sample = false): string {
  const t = tr(l), split = hoSplit(h, l), ex = h.findings.expiredUnused;
  const sub = h.off ? `${split}.${h.fromAssessment ? ` ${t(`Assistendi hinnang lisas nimekirja ${h.fromAssessment} ${h.fromAssessment === 1 ? "töö" : "tööd"}.`, `Your assistant's assessment added ${h.fromAssessment} ${h.fromAssessment === 1 ? "job" : "jobs"} to the list.`)}` : ""}` : t("Siia tulevad tööd, mille assistent on päriselt ära teinud, mitte klikid ega lubadused.", "Jobs land here only when your assistant has really done them, not clicks or promises.");
  const month = h.month.done ? `${esc(hoMonth(h.month.ym, l))}: ${t(`<b>${h.month.done}</b> ${h.month.done === 1 ? "töö" : "tööd"} tehtud, <b>${h.month.auto}</b> ilma sinuta.`, `<b>${h.month.done}</b> done, <b>${h.month.auto}</b> without you.`)}` : `${esc(hoMonth(h.month.ym, l))}: ${t("assistent pole veel ühtegi tööd lõpetanud.", "your assistant has not finished a job yet.")}`;
  const finding = ex.count && ex.last ? `<p class="ho-finding"><span aria-hidden="true">!</span><span><b>${esc(t(`${ex.count} ${ex.count === 1 ? "kinnitus aegus" : "kinnitust aegusid"} kasutamata`, `${ex.count} ${ex.count === 1 ? "approval" : "approvals"} expired unused`))}</b> (${esc(DAY[l].format(new Date(ex.last.expires_at)))}). ${t("Palu assistendil pärast sinu kinnitust kohe saata ja tulemus kirja panna.", "Ask your assistant to send right after you approve and record the outcome.")} <a class="tap-link" href="/approvals/${esc(encodeURIComponent(ex.last.id))}">${t("Vaata kinnitust", "See the approval")}</a></span></p>` : "";
  return `<section class="section ho" id="kaest-ara" aria-labelledby="ho-h"><h2 id="ho-h">${t("Käest ära", "Off your plate")}</h2>
<p class="ho-sum"><span class="num">${h.off}</span> ${esc(t(`${h.off === 1 ? "töö" : "tööd"} ${h.total}-st on sinu käest ära`, `of ${h.total} ${h.total === 1 ? "job is" : "jobs are"} off your plate`))}<small>${esc(sub)}</small></p>
<ul class="ho-bar ho-bar--lg" aria-label="${esc(t(`${h.total} tööd`, `${h.total} jobs`))}">${h.jobs.map((j) => `<li class="${hoSeg(j)}"><span class="vh">${esc(`${hoJobTitle(j, l)}: ${t(...HO_RUNG[j.rung] as [string, string])}${j.evidence.pending ? t(`; ${j.evidence.pending} ootab praegu`, `; ${j.evidence.pending} waiting now`) : ""}`)}</span></li>`).join("")}</ul>
<ul class="ho-legend" aria-hidden="true">${(["mine", "prep", "done", "other"] as const).map((r) => `<li><i${r === "mine" ? "" : ` class="ho-seg--${r}"`}></i>${esc(t(...HO_RUNG[r] as [string, string]))}</li>`).join("")}</ul>
<p class="ho-month">${month}</p>
<div class="ho-grid"><div><ul class="ho-jobs">${h.jobs.map((j) => handoverRow(j, l, now, sample)).join("")}</ul>${finding}</div>
${handoverNext(h, l, csrf)}</div>
<details class="plain"><summary>${t("Kuidas see arvutatakse", "How this is calculated")}</summary><div class="boxed small"><p>${t("Üks lahter = üks töö. Lahter täitub ainult salvestatud kinnitusest, mille tulemus on saadetud, esitatud, makstud või kirjendatud (assistendi teade, AI-hüppelaud seda ei kontrollinud), või kehtivast püsiloast, mis on juba korra töötanud. Ootel kinnitused, lugemised ja sisselogimised lahtrit ei täida. „Teeb raamatupidaja” on assistendi hinnang. Protsenti ja säästetud tunde ei näita, sest me neid ei mõõda.", "One cell = one job. A cell fills only from a stored approval whose outcome is sent, filed, paid or posted (your assistant's report, not checked by AI Launchpad), or from a live standing approval that has already worked once. Pending approvals, reads and sign-ins fill nothing. “Done by the accountant” is your assistant's assessment. No percentage and no hours saved, because we don't measure them.")}</p></div></details>
</section>`;
}

const approvalTech = (a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang) => techDetails(l, `${techList([[tr(l)("Räsi (SHA-256)", "Digest (SHA-256)"), a.digest], [tr(l)("Liik", "Kind"), v.kindKey || "—"], ["ID", a.id], [tr(l)("Koostatud", "Created"), a.created_at], [tr(l)("Kehtib kuni", "Valid until"), a.expires_at], ...(a.decided_at ? [[tr(l)("Otsustatud", "Decided"), a.decided_at]] as [string, string][] : [])])}<pre class="tech-pre">${esc(JSON.stringify({ action: v.p, outcome: v.outcome }, null, 1))}</pre>`);

export function approvalCardBody(opts: { csrf: string; a: ApprovalRow; lang: Lang; sample: boolean; now?: Date; rules?: StandingRule[]; capCents?: number; handover?: Handover }): string {
  const { a, lang: l, sample } = opts, t = tr(l), v = approvalView(a, l), now = opts.now ?? new Date(), rules = opts.rules ?? [];
  const content = v.p.document?.content ? `<h2>${esc(t(...(CONTENT_HEAD[v.kindKey] ?? CONTENT_HEAD.send_message)))}</h2><pre class="letter" tabindex="0">${esc(v.p.document.content)}</pre>` : "";
  const what = `${esc(v.title)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}${v.amount ? ` · <b>${esc(v.amount)}</b>` : ""}`;
  const decidedAt = () => esc(fmtWhen(a.decided_at, l, now).replace(/^(täna|today), /, ""));
  const foot = (back = true) => `<div class="ticket-foot">${approvalTech(a, v, l)}${back ? `<a class="btn secondary" href="/">${t("Tagasi: Täna", "Back: Today")}</a>` : ""}</div>`;
  if (a.state === "pending") {
    return `<article class="card ticket" aria-labelledby="a-h">
<div class="strip strip--wait"><span class="dot" aria-hidden="true"></span>${t("Ootab sinu kinnitust", "Waiting for your approval")}</div>
<div class="ticket-body">
${ticketHead(v, `<small> · ${t("Assistent valmistas ette", "Prepared by your assistant")} · ${timeEl(a.created_at, fmtWhen(a.created_at, l, now))}</small>`)}
${v.p.summary ? `<p class="why"><strong>${t("Miks:", "Why:")}</strong> ${esc(v.p.summary)}</p>` : ""}
${amountHero(v, l)}
${approvalFacts(v, l, !!v.amount)}
${content}
${handLine(v.kindKey, l)}
${v.noAddress ? `<div class="notice" role="alert"><p><strong>${esc(NO_ADDRESS(l))}.</strong> ${t("Assistent ei märkinud, kuhu see läheb. Keeldu ja palu assistendil küsida uus kinnitus koos saaja aadressiga.", "Your assistant did not say where this goes. Decline it and ask your assistant for a new approval with the recipient's address.")}</p></div>` : ""}
<form class="decide" method="post" action="/approvals/${esc(encodeURIComponent(a.id))}/decide"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><input type="hidden" name="digest" value="${esc(a.digest)}">${v.noAddress ? "" : `<button name="decision" value="approve">${t("Kinnita täpselt see", "Approve exactly this")}</button>`}<button class="text danger" name="decision" value="decline">${t("Keeldu", "Decline")}</button></form>
<p class="fine">${esc(t(`Kui assistent muudab midagi, küsib ta uue kinnituse. Kehtib 24 tundi, kuni ${fmtUntil(a.expires_at, l, now)}.`, `If your assistant changes anything, it asks again. Valid for 24 hours, until ${fmtUntil(a.expires_at, l, now)}.`))}</p>
<p class="fine">${t("AI-hüppelaud ise ei saada, maksa ega esita midagi; seda teeb sinu assistent oma tööriistadega ja ainult täpselt selle sisuga.", "AI Launchpad itself never sends, pays or files; your assistant does this with its own tools, and only with exactly this content.")}${sample ? ` ${t("Näidis: päriselt ei saadeta.", "Sample: nothing is really sent.")}` : ""}</p>
</div>
${foot(false)}
</article>
<p><a class="tap-link" href="/approvals">${t("Kõik kinnitused", "All approvals")}</a></p>`;
  }
  if (a.state === "approved" && a.approved_by_rule) {
    return `<article class="card ticket" aria-labelledby="a-h">
<div class="strip strip--ok">${STAMP}<h1 class="receipt-head" id="a-h">${t("Kinnitatud püsiloaga", "Approved by standing approval")} ${decidedAt()}</h1>${ruleChip(l)}</div>
<div class="ticket-body">
<p class="why" role="status"><strong>${t("Kinnitatud püsiloaga", "Approved by your standing approval")} „${esc(ruleTitle(a, rules, l))}”.</strong> ${what}</p>
<p class="small">${t("Assistent ei pidanud sinult küsima: ta saadab selle ise ja annab siia tulemuse teada.", "Your assistant did not have to ask you: it sends this itself and reports the result here.")} <a href="/uhenda#pusiload">${t("Püsiload", "Standing approvals")}</a></p>
${stateLine(a, v, l, sample)}
${approvalFacts(v, l)}
${content}
</div>
${foot()}
</article>`;
  }
  if (a.state === "approved") {
    return `<article class="card ticket" aria-labelledby="a-h">
<div class="strip strip--ok">${STAMP}<h1 class="receipt-head" id="a-h">${t("Kinnitatud", "Approved")} ${decidedAt()}</h1>${labelChip("owner", t("Sinu kinnitus", "You approved"))}</div>
<div class="ticket-body">
<p class="turn" role="status"><strong>${t("Nüüd on assistendi kord.", "Now it's your assistant's turn.")}</strong> ${what}</p>
${a.owner_confirmation ? confirmedInAssistant(a, l) : `<div class="callout"><p><strong>${t("Mine tagasi ChatGPT-sse või Claude'i ja kirjuta <code>Kinnitasin</code>.", "Go back to ChatGPT or Claude and write <code>Approved</code> (“Kinnitasin” works too).")}</strong></p><p class="small">${t("Assistent näeb sinu kinnitust alles siis, kui talle kirjutad.", "Your assistant only sees your approval when you write to it.")}</p></div>`}
${standingOffer(a, v, l, opts.csrf, rules, now, opts.capCents)}
${stateLine(a, v, l, sample)}
<p class="fine">${esc(t(`Kui assistent ei teata tulemusest ${fmtUntil(a.expires_at, l, now)}, kinnitus aegub ja ta peab uuesti küsima.`, `If your assistant does not report an outcome by ${fmtUntil(a.expires_at, l, now)}, the approval expires and it must ask again.`))}</p>
</div>
${foot()}
</article>`;
  }
  if (a.state === "consumed" && v.outcome) {
    const last = v.outcome.outcome, ok = last !== "failed" && last !== "rejected";
    const head = ok ? `<span aria-hidden="true">✓ </span>${esc(t(OUTCOME[last]?.[1] ?? last, OUTCOME[last]?.[2] ?? last))}${sample ? ": demo" : ""}` : esc(t(OUTCOME[last]?.[1] ?? last, OUTCOME[last]?.[2] ?? last));
    return `<article class="card ticket" aria-labelledby="a-h">
<div class="strip"><div class="labels">${outcomeChip(last, l, sample)}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}${a.approved_by_rule ? ruleChip(l) : ""}</div></div>
<div class="ticket-body">
<h1 class="receipt-head" id="a-h">${head}</h1>
<p class="why">${[v.recipient.name, v.amount].filter(Boolean).map(esc).join(" · ")}${v.recipient.name || v.amount ? " · " : ""}${esc(v.title)}</p>
${a.approved_by_rule ? `<p class="small"><strong>${t("Kinnitatud püsiloaga", "Approved by your standing approval")} „${esc(ruleTitle(a, rules, l))}”.</strong></p>` : a.owner_confirmation ? confirmedInAssistant(a, l) : ""}
<p class="small"><strong>${esc(t(`Sinu kinnitusi selles töös: ${a.decided_at && !a.approved_by_rule ? 1 : 0}.`, `Your approvals in this job: ${a.decided_at && !a.approved_by_rule ? 1 : 0}.`))}</strong> ${t("Töö tegi assistent; tulemus on tema teade, AI-hüppelaud seda ei kontrollinud.", "Your assistant did the work; the result is its report, not checked by AI Launchpad.")}</p>
${isDone(a) && opts.handover ? handoverStrip(opts.handover, l) : ""}
${stateLine(a, v, l, sample)}
${content ? `<details><summary>${t("Mida sa kinnitasid", "What you approved")}</summary>${approvalFacts(v, l)}${content}</details>` : ""}
</div>
${foot()}
</article>`;
  }
  const status = a.state === "declined"
    ? `${stateChip("rejected", t("Keeldusid", "Declined"))}`
    : stateChip("void", a.state === "expired" ? t("Aegunud", "Expired") : a.state);
  const line = a.state === "declined"
    ? t("Keeldusid. Midagi ei saadetud. Ütle assistendile, mida muuta.", "Declined. Nothing was sent. Tell your assistant what to change.")
    : a.state === "expired" && a.decided_at
      ? t(`Kinnitasid ${fmtWhen(a.decided_at, l, now)}, aga assistent ei teatanud tulemusest enne aegumist. Selle kinnituse alusel ei tohi midagi teha; assistent peab uuesti küsima.`, `You approved ${fmtWhen(a.decided_at, l, now)}, but your assistant reported no outcome before it expired. Nothing may be done under it; your assistant must ask again.`)
      : t(`Aegus ${fmtWhen(a.expires_at, l, now)}. Midagi ei kinnitatud ega saadetud. Palu assistendil uus koostada.`, `Expired ${fmtWhen(a.expires_at, l, now)}. Nothing was approved or sent. Ask your assistant for a new one.`);
  return `<article class="card ticket" aria-labelledby="a-h">
<div class="strip"><div class="labels">${status}</div></div>
<div class="ticket-body">
${ticketHead(v)}
<p class="why" role="status">${esc(line)}</p>
${approvalFacts(v, l)}
${content}
</div>
${foot()}
</article>`;
}

/** Täna's elevated object: one thing that needs the owner, the whole card a link. */
const askLink = (href: string, labels: string, title: string, meta: string) => `<a class="ask" href="${href}"><span class="ask-body"><span class="labels">${labels}</span><span class="ask-title">${title}</span><span class="ask-meta">${meta}</span></span><span class="chev" aria-hidden="true"></span></a>`;

/** Approval as a whole-row link (approvals list), or as an ask card (Täna). */
function approvalLinkRow(a: ApprovalRow, l: Lang, now: Date, sample: boolean, ask = false): string {
  const t = tr(l), v = approvalView(a, l);
  const sub = [v.amount, a.state === "pending" ? t(`kehtib kuni ${fmtUntil(a.expires_at, l, now)}`, `valid until ${fmtUntil(a.expires_at, l, now)}`) : fmtWhen(a.decided_at ?? a.created_at, l, now)].filter(Boolean).join(" · ");
  const chip = a.state === "pending" ? stateChip("waiting", t("Ootab sinu kinnitust", "Waiting for your approval"))
    : a.state === "consumed" && v.outcome ? outcomeChip(v.outcome.outcome, l, sample)
    : a.state === "approved" ? stateChip("approved", t("Kinnitatud", "Approved"))
    : a.state === "declined" ? stateChip("rejected", t("Keeldusid", "Declined"))
    : stateChip("void", t("Aegunud", "Expired"));
  const href = `/approvals/${esc(encodeURIComponent(a.id))}`, labels = `${chip}${a.approved_by_rule ? ruleChip(l) : ""}`, title = `${esc(v.title)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}`;
  return ask ? askLink(href, labels, title, esc(sub)) : `<a class="link-row" href="${href}"><span><span class="labels">${labels}</span><span class="link-row-title">${title}</span><span class="small muted">${esc(sub)}</span></span></a>`;
}

export function approvalsListBody(rows: ApprovalRow[], l: Lang, sample: boolean, now = new Date()): string {
  const t = tr(l), pending = rows.filter((a) => a.state === "pending"), history = rows.filter((a) => a.state !== "pending");
  return `<h1>${t("Kinnitused", "Approvals")}</h1><p class="lede">${t("Tööd, mille jaoks sinu assistent küsis sinu kinnitust. AI-hüppelaud ise ei saada, maksa ega esita midagi.", "Work your assistant asked you to approve. AI Launchpad itself never sends, pays or files.")}</p>
<section class="section" aria-labelledby="ap-w"><h2 id="ap-w">${t("Ootab sinult", "Needs you")} (${pending.length})</h2>${pending.map((a) => approvalLinkRow(a, l, now, sample)).join("") || `<p class="muted">${t("Praegu ei oota sinult midagi.", "Nothing is waiting for you right now.")}</p>`}</section>
<section class="section" aria-labelledby="ap-h"><h2 id="ap-h">${t("Ajalugu", "History")}</h2>${history.map((a) => approvalLinkRow(a, l, now, sample)).join("") || `<p class="muted">${t("Otsustatud kinnitusi veel pole.", "No decided approvals yet.")}</p>`}</section>`;
}

export interface PublicCardViewOpts { topicId: string; locale: string; state: string; output: string | null; replayed: boolean; }
export interface SetupPublicCards { topics: { id: string; label: string }[]; card: PublicCardViewOpts | null; }

const PUBLIC_CARD_STATE_TEXT: Record<string, string> = {
  pending: "This guidance request is unresolved and may have been interrupted. It is not known to be generating now and may never complete. It will not be retried automatically. The steps above still work.",
  blocked: "The requested guidance has not started because another unresolved request is blocking it. Nothing was generated for this topic, and it will not start automatically. The steps above still work.",
  failed: "Guidance generation failed. This card will not be retried automatically. The steps above still work.",
  uncertain: "Guidance generation did not finish cleanly and its result is uncertain; no automatic retry will be made. The steps above still work.",
  exhausted: "The shared guidance budget is exhausted, so no new guidance can be generated. The steps above still work.",
  breach: "Guidance generation was blocked after a provider contract problem. The steps above still work.",
  breach_blocked: "New guidance is blocked after a provider contract problem on an earlier card. The steps above still work.",
  conflict: "This guidance card is unavailable because its saved record does not match the current topic. The steps above still work.",
};

function publicCardBlock(card: PublicCardViewOpts): string {
  if (card.state === "completed" && card.output) {
    return `<section class="card" role="status" aria-label="General guidance card"><p><span class="badge">General guidance · Meta/Baseten</span> <span class="pill">${card.replayed ? "Saved guidance" : "Generated now"}</span></p><p>${esc(card.output)}</p><p class="small muted">General advice — not about your company. Nothing was filed, sent, paid or verified from it.</p></section>`;
  }
  return `<section class="card" role="status" aria-label="General guidance card"><p>${esc(PUBLIC_CARD_STATE_TEXT[card.state] ?? "Guidance is unavailable. The steps above still work.")}</p></section>`;
}

const DETERMINISTIC_SETUP_STEPS = `<section class="card" aria-label="Connect your assistant"><h2>Connect your assistant</h2><ol class="steps"><li>Open the <a href="/connection">Connection page</a> and copy the MCP address shown there.</li><li>Add it as a custom connector / MCP server in your assistant.</li><li>Sign in and review the requested OAuth permissions before you approve.</li><li>Ask your assistant for one read-only assessment of your responsibilities.</li></ol></section>`;

export function setupBody(opts: { csrf: string; result: string | null; publicCards?: SetupPublicCards }): string {
  if (opts.publicCards) {
    const pc = opts.publicCards;
    const topicOpts = pc.topics.map((t, i) => `<option value="${esc(t.id)}"${(pc.card ? t.id === pc.card.topicId : i === 0) ? " selected" : ""}>${esc(t.label)}</option>`).join("");
    const localeOpt = (v: string, label: string) => `<option value="${esc(v)}"${(pc.card ? pc.card.locale === v : v === "en") ? " selected" : ""}>${esc(label)}</option>`;
    return `<h1>Setup helper (temporary)</h1>
<p class="lede">For owners with no assistant yet. Once yours is connected, talk to it — not to this page.</p>
${DETERMINISTIC_SETUP_STEPS}
<section class="card"><p><span class="badge">General guidance · Meta/Baseten</span></p>
<p class="small muted">Get general setup advice. We send only your chosen topic, never your business details.</p>
<form method="post" action="/setup"><input type="hidden" name="csrf" value="${esc(opts.csrf)}">
<label>Topic <select name="topic">${topicOpts}</select></label>
<label>Language <select name="locale">${localeOpt("en", "English")}${localeOpt("et", "Eesti")}</select></label>
<button type="submit">Get guidance</button></form>
${pc.card ? publicCardBlock(pc.card) : ""}</section>`;
  }
  return `<h1>Setup helper (temporary)</h1>
<p class="lede">For owners with no assistant yet. Once yours is connected, talk to it — not to this page.</p>
<section class="card"><p><span class="badge amber">Fixture guidance</span></p>
<p class="small muted">Guidance here is a saved fixture from a deterministic mock. No live model is called (live inference is disabled in this build), and Meta model quality is untested.</p>
<form method="post" action="/setup"><input type="hidden" name="csrf" value="${esc(opts.csrf)}">
<label>Where are you stuck? <select name="topic"><option>adding a connector to my assistant</option><option>choosing an assistant</option><option>first read-only check</option></select></label>
<button type="submit">Get guidance</button></form>
${opts.result ? `<section class="card" role="status"><p>${esc(opts.result)}</p></section>` : ""}</section>`;
}

// --- Kataloog (/kataloog): public research catalogue, ET first, zero JS. ---
type Conn = "hosted_mcp" | "local_mcp" | "self_hosted_mcp" | "ordinary_api";
const CONN: Record<Conn, [string, string]> = { hosted_mcp: ["MCP · pilves", "MCP · cloud"], local_mcp: ["MCP · sinu arvutis", "MCP · on your computer"], self_hosted_mcp: ["MCP · ise majutatud", "MCP · self-hosted"], ordinary_api: ["API", "API"] };
/** Job groups in display order; `sector` (free text in the research data) maps to every group it names, so a compound sector
 * („payments/shipping”, „legal/public data”) is found under each (#52). Õigus comes before the generic data group. */
export const CATALOGUE_GROUPS = [
  { id: "raamatupidamine", et: "Raamatupidamine ja arved", en: "Accounting and invoices", match: /accounting|invoic|payroll/ },
  { id: "pank", et: "Pank ja maksed", en: "Bank and payments", match: /bank|payment/ },
  { id: "epost", et: "E-post ja kalender", en: "Email and calendar", match: /email|calendar|scheduling/ },
  { id: "kullerid", et: "Kullerid", en: "Couriers", match: /courier|logistics|shipping/ },
  { id: "oigus", et: "Õigus", en: "Legal", match: /legal|contract/ },
  { id: "andmed", et: "Avalikud ja äriandmed", en: "Public and business data", match: /public|business data|government|statistics|^procurement$|tax/ },
  { id: "brauser", et: "Brauser ja automaatika", en: "Browser and automation", match: /browser/ },
  { id: "kliendid", et: "Kliendid (CRM)", en: "Customers (CRM)", match: /crm/ },
  { id: "muu", et: "Muu", en: "Other", match: /(?:)/ },
] as const;
export type CatalogueGroup = (typeof CATALOGUE_GROUPS)[number]["id"];
/** Every job group a sector names (Muu only when none does); the first is where the full list shows the service. */
export const catalogueGroups = (sector: string | undefined): CatalogueGroup[] => {
  const hits = CATALOGUE_GROUPS.filter((g) => g.id !== "muu" && g.match.test((sector ?? "").toLowerCase())).map((g) => g.id);
  return hits.length ? hits : ["muu"];
};
export const catalogueGroup = (sector: string | undefined): CatalogueGroup => catalogueGroups(sector)[0];
/** Where a connection works, from its interface class: hosted MCP everywhere, local MCP on a computer, self-hosted MCP on your own server, the rest needs a connector. */
export const whereItWorks = (ic: string | undefined): [string, string] =>
  ic === "hosted_mcp" ? ["Kõikjal · veeb, telefon, arvuti", "Anywhere · web, phone, computer"]
  : ic === "self_hosted_mcp" ? ["Oma serveris · veeb, telefon, arvuti", "Your own server · web, phone, computer"]
  : ic === "local_mcp" ? ["Ainult arvutis", "On a computer only"]
  : ["Vajab ühendust", "Needs a connector"];
const isCatalogueConn = (c: unknown): c is Conn => typeof c === "string" && Object.hasOwn(CONN, c);
const fmtYmd = (ymd: string) => /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd.split("-").reverse().join(".") : ymd;

function serviceCard(r: ServiceRecord, l: Lang): string {
  const t = tr(l), conn = CONN[r.interface_class as Conn];
  // The provider's own connection URL first; research citations only when there is none (#52).
  // A URL template ({id}) is an API pattern, not a page to open: skip it for the next https URL.
  const link = [r.connection, ...(r.sources ?? [])].map(safeHttps).find((u): u is string => !!u && !/\{|%7B/i.test(new URL(u).pathname)) ?? null;
  // Research text is English; mark it so screen readers switch voice on the Estonian page.
  const en = l === "en" ? "" : ' lang="en"';
  return `<article class="card svc" data-service="${esc(r.id)}"><h3>${esc(r.name)}</h3>
<div class="labels">${labelChip("rule", t(conn[0], conn[1]))}${labelChip("where", t(...whereItWorks(r.interface_class)))}${labelChip("assistant", r.runtime_tested ? t("Testitud", "Tested") : t("Uuritud · AI-hüppelauaga pole testitud", "Researched · not tested with AI Launchpad"))}</div>
<p class="svc-k">${t("Mida assistent selle abil teha saab", "What your assistant can do with it")}</p><p class="svc-v"${en}>${esc(r.jobs)}</p>
<dl class="svc-facts"><dt>${t("Ligipääs ja hind", "Access and price")}</dt><dd${en}>${esc(r.access_and_price)}</dd><dt>${t("Peamine piirang", "Key limitation")}</dt><dd${en}>${esc(r.limitations ?? "")}</dd></dl>
${link ? `<a class="tap-link" href="${esc(link)}" rel="noopener noreferrer">${t("Teenusepakkuja leht", "Provider page")}: ${esc(new URL(link).hostname)}</a>` : ""}</article>`;
}

export function catalogueBody(o: { lang: Lang; q: string; g: CatalogueGroup | null; records: ServiceRecord[]; matched: Set<string> | null }): string {
  const l = o.lang, t = tr(l);
  const all = o.records.filter((r) => isCatalogueConn(r.interface_class));
  const mcp = all.filter((r) => r.interface_class !== "ordinary_api").length, api = all.length - mcp;
  const checked = o.records.map((r) => r.checked_on ?? "").filter(Boolean).sort().at(-1) ?? "";
  // Ärikratt is pinned above with what Launchpad actually does with it.
  const listed = all.filter((r) => r.id !== "arikratt" && (!o.matched || o.matched.has(r.id)));
  const href = (g: string | null) => { const p = new URLSearchParams(); if (g) p.set("g", g); if (o.q) p.set("q", o.q); const s = p.toString(); return s ? `/kataloog?${s}` : "/kataloog"; };
  const counts = new Map<string, number>(); for (const r of listed) for (const g of catalogueGroups(r.sector)) counts.set(g, (counts.get(g) ?? 0) + 1);
  const chips = `<nav class="chips" aria-label="${t("Tööde rühmad", "Job groups")}"><a href="${esc(href(null))}"${o.g ? "" : ' aria-current="page"'}>${t("Kõik", "All")}</a>${CATALOGUE_GROUPS.map((g) => `<a href="${esc(href(g.id))}"${o.g === g.id ? ' aria-current="page"' : ""}>${esc(t(g.et, g.en))} <span>${counts.get(g.id) ?? 0}</span></a>`).join("")}</nav>`;
  const sections = CATALOGUE_GROUPS.filter((g) => !o.g || o.g === g.id).map((g) => {
    // A group filter shows every service in the group; the full list shows each service once, under its first group.
    const rows = listed.filter((r) => (o.g ? catalogueGroups(r.sector).includes(g.id) : catalogueGroup(r.sector) === g.id));
    return rows.length ? `<section aria-labelledby="g-${g.id}"><h2 id="g-${g.id}" class="svc-group">${esc(t(g.et, g.en))} <span class="muted">${rows.length}</span></h2>${rows.map((r) => serviceCard(r, l)).join("")}</section>` : "";
  }).join("");
  const kratt = `https://arikratt.ee/${l === "en" ? "en" : "et"}/mcp`;
  // Pinned above the list with what Launchpad does with them; a search hides a card it does not match (#52), as searchServices matches the list.
  const what = { launchpad: ["Näeb sinu ettevõtte tähtaegu koos ametliku allikaga, valmistab töid ette ja küsib enne saatmist või esitamist sinu kinnitust täpselt sellele sisule.", "Sees your company's deadlines with their official sources, prepares the work and asks you to approve the exact content before anything is sent or filed."], arikratt: ["Avalikud ettevõtteandmed äriregistrist ja maksuametist. AI-hüppelaud arvutab nende põhjal sinu tähtajad.", "Public company data from the Business Register and the Tax Board. AI Launchpad computes your deadlines from it."] } as const;
  // Each pinned card's visible strings as language pairs, so the search reads exactly what the card shows, in both languages.
  const MCP_CLOUD: [string, string] = ["MCP · pilves", "MCP · cloud"], WHAT_K: [string, string] = ["Mida assistent selle abil teha saab", "What your assistant can do with it"];
  const card = {
    launchpad: { name: ["AI-hüppelaud", "AI Launchpad"], tested: ["Testitud: ChatGPT 28.10.2026 · Claude 30.10.2026", "Tested: ChatGPT 28 Oct 2026 · Claude 30 Oct 2026"], link: ["Ühenda oma assistent", "Connect your assistant"] },
    arikratt: { name: ["Ärikratt", "Ärikratt"], tested: ["AI-hüppelaud kasutab seda", "Used by AI Launchpad"], link: ["Ärikratti avalik MCP", "Ärikratt public MCP"] },
  } as const;
  const shows = (c: typeof card[keyof typeof card], body: readonly string[]) => !o.q || [...c.name, ...c.tested, ...c.link, ...MCP_CLOUD, ...WHAT_K, ...whereItWorks("hosted_mcp"), ...body].join(" ").toLowerCase().includes(o.q.trim().toLowerCase());
  const pinned = [
    shows(card.launchpad, what.launchpad) ? `<article class="card svc svc--pinned"><h3>${t(...card.launchpad.name)}</h3><div class="labels">${labelChip("rule", t(...MCP_CLOUD))}${labelChip("where", t(...whereItWorks("hosted_mcp")))}${labelChip("official", t(...card.launchpad.tested))}</div>
<p class="svc-k">${t(...WHAT_K)}</p><p class="svc-v">${t(...what.launchpad)}</p>
<a class="tap-link" href="/uhenda">${t(...card.launchpad.link)}</a></article>` : "",
    shows(card.arikratt, what.arikratt) ? `<article class="card svc svc--pinned"><h3>Ärikratt</h3><div class="labels">${labelChip("rule", t(...MCP_CLOUD))}${labelChip("where", t(...whereItWorks("hosted_mcp")))}${labelChip("official", t(...card.arikratt.tested))}</div>
<p class="svc-k">${t(...WHAT_K)}</p><p class="svc-v">${t(...what.arikratt)}</p>
<a class="tap-link" href="${esc(kratt)}" rel="noopener noreferrer">${t(...card.arikratt.link)}: arikratt.ee</a></article>` : "",
  ].filter(Boolean).join("\n");
  const pinnedSection = pinned ? `<section aria-labelledby="pin-h"><h2 id="pin-h" class="svc-group">${t("Alusta siit", "Start here")}</h2>${pinned}</section>` : "";
  return `<section class="card hero"><h1>${t("Teenused, mida sinu AI-assistent saab kasutada", "Services your AI assistant can use")}</h1>
<p class="lede">${t(`<strong>${mcp} MCP-ühendust ja ${api} API-t</strong> (kokku ${o.records.length} uuritud teenusest) Eesti ettevõtja tööde jaoks.`, `<strong>${mcp} MCP connections and ${api} APIs</strong> (out of ${o.records.length} researched services) for the jobs of an Estonian business owner.`)}</p>
<ul class="legend" aria-label="${t("Kus ühendus töötab", "Where a connection works")}"><li><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5 4.75 4.75 0 0 1 17.5 18z"/></svg> <strong>${t(...whereItWorks("hosted_mcp"))}</strong>: ${t("töötab ka assistendi telefonirakenduses: telefonis küsid ja kinnitad liikvel olles.", "also works in the assistant's phone app: ask and approve on the go.")}</li>
<li><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/></svg> <strong>${t(...whereItWorks("local_mcp"))}</strong>: ${t("raskemaks tööks oma failide ja rakendustega (Claude Desktop/Cowork või ChatGPT töölauarakendus).", "for heavier work with your own files and apps (Claude Desktop/Cowork or the ChatGPT desktop app).")}</li>
<li><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/></svg> <strong>${t(...whereItWorks("self_hosted_mcp"))}</strong>: ${t("teenuse paigaldad ise (või IT-partner) oma serverisse; seejärel töötab ka veebis ja telefonis, kui assistent lubab lisada MCP aadressi.", "you (or an IT partner) install it on your own server; then it also works on web and phone if your assistant lets you add an MCP address.")}</li>
<li><svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/></svg> <strong>${t(...whereItWorks("ordinary_api"))}</strong>: ${t("teenusel on API või integratsioon, aga valmis assistendi ühendust veel pole.", "the service has an API or an integration, but no ready assistant connection yet.")}</li></ul>
<p class="small muted">${esc(t(`Iga ühendus laseb sinu assistendil teha rohkem töid sinu eest. Ühendad need oma assistendis ise; AI-hüppelaud neid ei vahenda. Allikas: avalikud dokumendid, kontrollitud ${fmtYmd(checked)}.`, `Each connection lets your assistant take more jobs off you. You connect them in your own assistant; AI Launchpad does not broker them. Source: public documentation, checked ${/^\d{4}-\d{2}-\d{2}$/.test(checked) ? C_DAY_MON_YEAR.en.format(civil(checked)) : checked}.`))}</p></section>
${pinnedSection}
<form method="get" action="/kataloog" role="search" class="search">${o.g ? `<input type="hidden" name="g" value="${esc(o.g)}">` : ""}<label>${t("Otsi nime või töö järgi", "Search by name or job")} <input name="q" value="${esc(o.q)}" maxlength="120"></label><button type="submit">${t("Otsi", "Search")}</button></form>
${chips}
${sections || (o.q && pinned) ? sections : `<p class="card">${o.q ? esc(t(`„${o.q}” kohta ei leidnud midagi.`, `Nothing found for “${o.q}”.`)) : t("Selles rühmas pole teenuseid.", "No services in this group.")} <a class="tap-link" href="/kataloog">${t("Näita kõiki", "Show all")}</a></p>`}`;
}

export function playbooksBody(l: Lang, items: { title: string; title_et: string; summary: string; source: string; source_label: string }[], frictionCards?: (PublicCardViewOpts & { label: string })[]): string {
  const t = tr(l), en = l === "en" ? "" : ' lang="en"', shown = (frictionCards ?? []).filter((c) => c.state !== "none");
  // #68: these card states are terminal, so their line must not read as temporary ("right now" stays only for states that may still change).
  const TERMINAL_CARD_STATES: ReadonlySet<string> = new Set(["blocked", "failed", "breach", "breach_blocked", "exhausted", "conflict", "uncertain"]);
  const friction = frictionCards === undefined ? "" : `<section class="card" aria-label="${t("Soovitused käsitsi töö jaoks", "Manual-work suggestions")}"><h2>${t("Soovitused käsitsi töö jaoks", "Manual-work suggestions")}</h2><p class="small muted">${t("Meta/Baseteni mudeli üldised soovitused levinud käsitsi töö jaoks. Need ei ole sinu ettevõtte hinnang; selle lehe avamine ei kutsu kunagi mudelit.", "General Meta/Baseten suggestions for common manual work. They are not an assessment of your company; opening this page never calls a model.")}</p>${shown.length ? shown.map((c) => `<div class="row"${c.locale !== l ? ` lang="${esc(c.locale)}"` : ""}><strong>${esc(c.label)}</strong> <span class="pill">${esc(c.locale)}</span>${c.state === "completed" && c.output ? `<p>${esc(c.output)}</p><p class="small muted" lang="${l}">${t("Salvestatud juhis. Selle põhjal pole midagi esitatud, saadetud, makstud ega kontrollitud.", "Saved guidance. Nothing was filed, sent, paid or verified from it.")}</p>` : `<p class="small muted" lang="${l}">${esc(TERMINAL_CARD_STATES.has(c.state) ? t("See soovitus ei ole saadaval.", "This suggestion is not available.") : t("See soovitus pole praegu saadaval.", "This suggestion is not available right now."))}</p>`}</div>`).join("") : `<p class="small muted">${t("Ühtegi soovitust pole veel koostatud.", "No manual-work suggestion has been prepared yet.")}</p>`}</section>`;
  return `<h1>${t("Mängukavad", "Playbooks")}</h1><p class="lede">${t("Lühijuhendid, igaüks seotud ametliku allikaga. Ei ole õigus- ega maksunõustamine.", "Short guides, each tied to its official source. Not legal or tax advice.")}</p>${friction}${items.map((p) => `<section class="card"><h2>${esc(t(p.title_et, p.title))}</h2><p${en}>${esc(p.summary)}</p><p class="small">${t("Ametlik allikas", "Official source")}: <a href="${esc(p.source)}" rel="noopener noreferrer">${esc(p.source_label)}</a>. ${t("Kontrolli kehtivaid kuupäevi ja reegleid alati allikast; see leht ei ole õigus- ega maksunõustamine.", "Always check the source for current dates and rules; this page is not legal or tax advice.")}</p></section>`).join("")}`;
}

// --- Unmet needs (#20, ux2 change 7): what's left for the owner, and what the assistant does instead. ---
const NEED_STATE_LABEL: Record<string, [string, string]> = {
  received: ["Vastu võetud", "Received"], classifying: ["Liigitatakse", "Classifying"], classified: ["Valikuline", "Optional"],
  classification_failed: ["Liigitus ebaõnnestus", "Classification failed"], published: ["Avaldatud anonüümselt", "Published anonymously"], kept_private: ["Jäetud privaatseks", "Kept private"],
};
const NEED_STATE_TEXT: Record<string, [string, string]> = {
  received: ["Vastu võetud ja isikuandmetest puhastatud; ootab liigitamist.", "Received and de-identified; waiting to be classified."],
  classifying: ["Liigitatakse praegu.", "Being classified now."],
  classification_failed: ["Liigitus ebaõnnestus. Seda ei proovita automaatselt uuesti ja midagi ei avaldatud.", "Classification failed. It is not retried automatically and nothing was published."],
  published: ["Avaldatud anonüümselt avatud soovide hulgas (ainult liigitus, lühinimi ja kirjeldus).", "Published anonymously on Open demand (category, label and spec only)."],
  kept_private: ["Jäetud privaatseks. Seda ei avaldata kunagi.", "Kept private. It is never published."],
};
const NEED_REASON_TEXT: Record<string, [string, string]> = {
  owner_daily_limit: ["Ootab: sinu päevane liigituste piir (10 päevas) sai täis. See liigitatakse hiljem, kui AI-hüppelaud järgmisena soove töötleb. Mudelit selle jaoks ei kutsutud.", "Waiting: your daily classification limit (10 per day) was reached. It is classified later, when Launchpad next processes requests. No model call was made for it."],
  attempt_in_flight: ["Ootab: üks teine mudelipäring on lõpetamata, seega pole see veel alanud. Mudelit selle jaoks ei kutsutud.", "Waiting: another model request is unresolved, so this one has not started. No model call was made for it."],
  classification_unavailable: ["Ootab: liigitamine pole selles serveris praegu saadaval. Mudelile ei saadetud midagi.", "Waiting: classification is not available on this server right now. Nothing was sent to a model."],
  budget_exhausted: ["Ühine mudelieelarve on otsas, seega liigitada ei saa.", "The shared model budget is exhausted, so no classification can be made."],
  suppressed_after_breach: ["Mudelipäringud on peatatud pärast teenusepakkuja lepingurikkumist.", "Model calls are suspended after a provider contract problem."],
  provider_contract_breach: ["Mudeli pakkuja rikkus selle päringu puhul lepingut; vastus visati ära.", "The model provider broke its contract for this request; the answer was discarded."],
  provider_failed: ["Mudeli pakkuja ei andnud kasutatavat vastust.", "The model provider did not return a usable answer."],
  provider_uncertain: ["Mudelipäring ei lõppenud korrektselt; tulemus on teadmata.", "The model request did not finish cleanly; its result is unknown."],
  interrupted: ["Varasem katse katkes ja selle tulemus on teadmata.", "An earlier attempt was interrupted and its result is unknown."],
  request_conflict: ["Salvestatud mudelikirje ei vasta sellele päringule.", "The saved model record does not match this request."],
  invalid_output: ["Vastus ei olnud korrektne liigitus, seega visati see ära.", "The answer was not valid classification data, so it was discarded."],
  identifiers_in_output: ["Vastuses oli midagi, mis nägi välja nagu tunnus, seega visati see ära.", "The answer contained something that looked like an identifier, so it was discarded."],
  input_too_large: ["Soov oli liigitamiseks liiga pikk.", "The request was too large to classify."],
  unavailable: ["Liigitamine polnud saadaval.", "Classification was unavailable."],
};
const categoryLabel = (c: string | null, l: Lang) => (l === "en" ? CATEGORY_LABELS : CATEGORY_LABELS_ET)[c as Category] ?? c ?? "";
const blockerLabel = (b: string, l: Lang) => (l === "en" ? BLOCKER_LABELS : BLOCKER_LABELS_ET)[b as Blocker] ?? b;
/** The local mock writes English fixture text: derive its label and spec from category and blocker in the page language. Live model output shows as written. */
const isMock = (n: OwnerNeed) => n.classified_by === "mock" && !!n.category;
const needLabel = (n: OwnerNeed, l: Lang) => isMock(n) ? `${categoryLabel(n.category, l)}: ${blockerLabel(n.blocker, l)}` : n.demand_label;
const needSpec = (n: OwnerNeed, l: Lang) => isMock(n) ? tr(l)(`Näidis-liigitus, mitte mudel: teenus valdkonnas „${categoryLabel(n.category, "et")}”, mille takistus täna on: ${blockerLabel(n.blocker, "et")}.`, n.spec ?? "") : n.spec;
const classifierName = (by: string | null, l: Lang) => by === "mock" ? tr(l)("kohalik testliigitaja (näidis, mitte mudel)", "local mock (not a model)") : classifiedByLabel(by);
/** "AI liigitus · Meta Muse Spark Open" only for live model output; the local mock is a sample. */
const classifiedChip = (by: string | null, l: Lang) => by === BASETEN_MODEL ? labelChip("ai", tr(l)("AI liigitus · Meta Muse Spark Open", "AI classification · Meta Muse Spark Open")) : sampleChip(l);

function needRow(n: OwnerNeed, l: Lang): string {
  const t = tr(l), pair = (m: Record<string, [string, string]>, k: string | null) => (k && m[k] ? t(...m[k]) : "");
  const why = [pair(NEED_STATE_TEXT, n.state), n.reason ? pair(NEED_REASON_TEXT, n.reason) || n.reason : ""].filter(Boolean).join(" ");
  return `<div class="row"><div class="labels">${stateChip(n.state === "classification_failed" ? "rejected" : n.state === "published" ? "accepted" : "drafted", pair(NEED_STATE_LABEL, n.state) || n.state)}${n.category ? labelChip("assistant", categoryLabel(n.category, l)) : ""}</div>
<p><strong>${esc(needLabel(n, l) ?? t("Veel liigitamata", "Not classified yet"))}</strong></p><p class="small">${esc(why)}</p><p class="small muted">„${esc(n.need_redacted)}” · ${t("Miks", "Why")}: ${esc(blockerLabel(n.blocker, l))} · ${esc(fmtWhen(n.created_at, l))}</p>
${n.classified_by ? techDetails(l, techList([n.state === "classification_failed" ? [t("Liigitamine", "Classification"), t("liigitamise katse ebaõnnestus", "classification attempt failed")] : [t("Liigitaja", "Classified by"), classifierName(n.classified_by, l)]])) : ""}</div>`;
}

/** The stored text Open demand will show, as written: both classifiers write English. Joining an existing item adds no new spec. */
const publicPreview = (n: OwnerNeed, l: Lang) => `<div class="note"><p class="small"><strong>${tr(l)("Avalikult näidatakse täpselt seda:", "Exactly this will be public:")}</strong></p><div${l !== "en" ? ' lang="en"' : ""}><p><strong>${esc(n.same_as ?? n.demand_label)}</strong></p>${!n.same_as && n.spec ? `<p class="small">${esc(n.spec)}</p>` : ""}</div></div>`;

/** Unmet-need card (Täna). Publishing sends category, label and spec only. */
export function unmetNeedsBody(opts: { csrf: string; needs: OwnerNeed[]; lang: Lang }): string {
  if (!opts.needs.length) return "";
  const l = opts.lang, t = tr(l), csrf = esc(opts.csrf);
  const awaiting = opts.needs.filter((n) => n.state === "classified");
  const open = opts.needs.filter((n) => ["received", "classifying", "classification_failed"].includes(n.state));
  const decided = opts.needs.filter((n) => n.state === "published" || n.state === "kept_private");
  const decide = (n: OwnerNeed, decision: string, label: string, cls: string) => `<form method="post" action="/unmet-needs/decide"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="need_id" value="${esc(n.id)}"><input type="hidden" name="decision" value="${decision}"><button type="submit"${cls ? ` class="${cls}"` : ""}>${label}</button></form>`;
  // Open while an optional decision waits: Ootab sinult links into it.
  return `<details class="plain" id="soovid"${awaiting.length ? " open" : ""}><summary><h2 id="soovid-h">${t("Seda ei saa assistent sinu eest teha", "Your assistant can't do this for you")}</h2></summary>
${awaiting.map((n) => `<div class="row" id="soov-${esc(n.id)}"><div class="labels">${stateChip("waiting", t("Valikuline", "Optional"))}</div>
<p>„${esc(n.need_redacted)}”</p>
<dl class="facts facts--stacked"><div class="fact-row"><dt>${t("Miks:", "Why:")}</dt><dd>${esc(blockerLabel(n.blocker, l))}</dd></div><div class="fact-row"><dt>${t("Mida assistent saab teha:", "What your assistant can do:")}</dt><dd>${esc(BLOCKER_HANDOFF[n.blocker as Blocker] ? t(BLOCKER_HANDOFF[n.blocker as Blocker].et, BLOCKER_HANDOFF[n.blocker as Blocker].en) : "—")}</dd></div></dl>
<div class="${n.classified_by === BASETEN_MODEL ? "ai-block" : "quote"}"><div class="labels">${classifiedChip(n.classified_by, l)}${labelChip("assistant", categoryLabel(n.category, l))}</div><p><strong>${esc(needLabel(n, l))}</strong></p><p class="small">${esc(needSpec(n, l))}</p>${n.same_as ? `<p class="small muted">${t("Sarnane soov on juba avatud soovide hulgas.", "Matches an existing open-demand item.")}</p>` : ""}</div>
<p class="small">${t("Avalda anonüümse soovina (valikuline): kui piisavalt ettevõtjaid seda vajab, ehitatakse ühendus ja assistent saab selle ka sinult ära võtta.", "Publish as anonymous demand (optional): if enough owners need it, a connection gets built and your assistant can take this off you too.")}</p>
${publicPreview(n, l)}
${decide(n, "publish", t("Avalda anonüümselt", "Publish anonymously"), "")}${decide(n, "keep_private", t("Jäta privaatseks", "Keep private"), "secondary")}
<p class="small muted">${t("Avaldamisel jagatakse lehel ", "Publishing shares only the category, label and one-line spec on ")}<a href="/demand">${t("Avatud soovid", "Open demand")}</a>${t(" ainult liigitust, lühinime ja ühe rea kirjeldust — mitte sinu ettevõtet, kontot ega soovi teksti.", " — never your company, your account or the request text.")}</p>
${techDetails(l, techList([[t("Liigitaja", "Classified by"), classifierName(n.classified_by, l)], ["ID", n.id]]))}</div>`).join("")}
${open.map((n) => needRow(n, l)).join("")}
${decided.length ? `<details><summary>${t("Otsustatud soovid", "Decided requests")} (${decided.length})</summary>${decided.map((n) => needRow(n, l)).join("")}</details>` : ""}
</details>`;
}

/** Public, login-free Open demand list. Only aggregated, owner-approved
 * classification fields are rendered, all escaped. */
export function demandBody(items: DemandItem[], l: Lang): string {
  const t = tr(l);
  const by = (i: DemandItem) => [i.live ? `${classifierName(BASETEN_MODEL, l)} × ${i.live}` : "", i.mock ? `${classifierName("mock", l)} × ${i.mock}` : ""].filter(Boolean).join(" · ");
  const how = items.length === 0 ? "" : items.some((i) => i.live > 0) ? t(", liigitanud Meta avatud mudel Muse Spark Open", ", classified by Meta's open model Muse Spark Open") : t(", liigitanud kohalik testliigitaja (näidis)", ", classified by a local test classifier (sample)");
  return `<section class="card hero"><h1>${t("Avatud soovid", "Open demand")}</h1><p class="lede">${t("Mida Eesti ettevõtjad oma AI-assistendilt palusid, aga mida ükski ühendus veel teha ei oska. Anonüümne, omaniku loal", "What Estonian businesses asked their AI assistants to do that no connector can do yet. Anonymous, owner-approved")}${how}.</p>
<p class="small muted">${t("Järjestatud soovide arvu järgi. Iga soov ütleb, kuidas see liigitati: Meta mudel või kohalik testliigitaja (mitte mudel). Arvud on omanike kinnitatud teated, mitte turu suurus.", "Sorted by number of requests. Each item says how it was classified — live by Meta's model or by the local mock (not a model). Counts are owner-approved reports, not market size.")}</p></section>
${items.length ? items.map((i) => `<section class="card"><h2>${esc(i.label)}</h2><div class="labels">${i.live ? labelChip("ai", t("AI liigitus · Meta Muse Spark Open", "AI classification · Meta Muse Spark Open")) : sampleChip(l)}${labelChip("assistant", categoryLabel(i.category, l))}</div>
<p>${esc(i.spec)}</p><p class="small"><strong>${i.count} ${i.count === 1 ? t("soov", "request") : t("soovi", "requests")}</strong></p><p class="small muted">${t("Esimest korda", "First seen")} ${esc(fmtPeriod(i.firstSeen, l))} · ${t("viimati", "last seen")} ${esc(fmtPeriod(i.lastSeen, l))}<br>${t("Liigitaja", "Classified by")}: ${esc(by(i))}</p></section>`).join("") : `<section class="card"><p>${t("Avaldatud soove veel pole.", "No published demand yet.")}</p></section>`}`;
}

// --- Deadlines (#19) with handoffs (ux2 change 2): date first, rule label, source, who does what. ---
export interface DeadlinesView { company: CompanyCard & { unavailable?: string }; obligations: Obligation[]; facts_needed: FactNeeded[] }

function deadlineRow(o: Obligation, l: Lang, opts: { now: Date; prompts: boolean; others?: Record<string, string> }): string {
  const t = tr(l), today = tallinnYmd(opts.now);
  let tile: string, lead = "";
  if (o.effective_due) {
    const p = deadlineParts(o.effective_due, l);
    tile = `<time class="deadline-date" datetime="${esc(o.effective_due)}"><span class="deadline-day">${esc(p.day)}</span><span class="deadline-mon">${esc(p.mon)}</span><span class="deadline-wd">${esc(p.wd)}</span></time>`;
    const days = dayDiff(today, o.effective_due);
    lead = o.kind === "risk" ? t(`Tähtaeg oli ${fmtDeadline(o.effective_due, l)}.`, `It was due ${fmtDeadline(o.effective_due, l)}.`) : days >= 0 ? `${cap(REL[l].format(days, "day"))}.` : "";
  } else {
    tile = `<span class="deadline-date"><span class="deadline-day" aria-hidden="true">${o.kind === "warning" ? "!" : "i"}</span><span class="deadline-mon">${o.kind === "warning" ? t("hoiatus", "warning") : t("teave", "info")}</span></span>`;
  }
  const h = o.handoff;
  const shifted = o.shifted ? ` ${t("Tähtaeg nihkus järgmisele tööpäevale.", "Moved to the next working day.")}` : "";
  // A conditional deadline or risk never reads as definite: the condition sits under the title, the handoff is qualified.
  // Warnings are worded as conditions already; the TSD question handoff is itself the condition check.
  const cond = o.applies === "if" && o.condition_et && o.kind !== "warning" ? t(o.condition_et, o.condition_en ?? o.condition_et) : "";
  const reason = t(o.reason_et, o.reason_en);
  const qualify = cond && o.rule_id !== "tsd-monthly-return" ? t("Kui see kehtib: ", "If this applies: ") : "";
  // #63 m5: when the assistant's assessment says someone else prepares this job, the row says so too, once.
  const other = opts.others?.[o.rule_id];
  const doer = other ? `<dt>${esc(cap(other))}</dt><dd>${t("valmistab ette", "prepares it")} ${labelChip("assistant", t("Assistendi hinnang", "Your assistant's assessment"))}</dd>` : `<dt>${t("Assistent", "Your assistant")}</dt><dd>${esc(t(h.assistant_et, h.assistant_en))}</dd>`;
  return `<li class="deadline-row">${tile}
<div><h3 class="deadline-title">${o.kind === "risk" && cond ? t("Võimalik: ", "Possible: ") : ""}${esc(t(o.title_et, o.title_en))} · ${esc(t(o.period_label_et, o.period_label_en))}</h3>
${cond ? `<p class="deadline-cond"><strong>${esc(cond)}</strong></p>` : ""}<p class="deadline-reason">${lead ? `<strong>${esc(lead)}</strong> ` : ""}${reason !== cond ? esc(reason) : ""}${esc(shifted)}</p>
<div class="deadline-meta">${labelChip("rule", t("Arvutatud reeglist", "Calculated by rule"))}${sourceLink(o.source, l)}</div>
<details><summary>${t("Kes mida teeb", "Who does what")}</summary>${qualify ? `<p class="small"><strong>${qualify.slice(0, -2)}</strong></p>` : ""}<dl class="handoff">${doer}<dt class="me">${t("Sina", "You")}</dt><dd>${esc(t(h.owner_et, h.owner_en))}</dd></dl>
${o.rule_id === "vat-return-kmd" ? `<p class="small muted">${t("Summad arvutab sinu raamatupidamisprogramm, mitte tehisaru.", "Your accounting software calculates the amounts, not AI.")}</p>` : ""}
${opts.prompts && !other ? `<div class="quote"><p class="small"><span class="muted">${t("Palu assistendilt:", "Ask your assistant:")}</span> „${esc(qualify + t(h.prompt_et, h.prompt_en))}”</p></div>` : ""}</details></div></li>`;
}

export function deadlinesList(r: DeadlinesView, l: Lang, opts: { now?: Date; prompts?: boolean; others?: Record<string, string> } = {}): string {
  const now = opts.now ?? new Date();
  if (!r.obligations.length) return `<p class="muted">${tr(l)("Selles vahemikus tähtaegu pole.", "No deadlines in this period.")}</p>`;
  return `<ul class="deadlines">${r.obligations.map((o) => deadlineRow(o, l, { now, prompts: !!opts.prompts, others: opts.others })).join("")}</ul>`;
}

/** Which rule a missing fact can change: a question is shown only when it can change a row on screen. */
const FACT_RULE: Record<string, string> = { vat_registered: "vat-return-kmd", payouts_last_month: "tsd-monthly-return", other_tsd_triggers_last_month: "tsd-monthly-return", fy_end: "annual-report", annual_report: "annual-report", ytd_turnover_this_year: "vat-registration-threshold" };
function questions(r: DeadlinesView, l: Lang): { q: string; then: string }[] {
  const t = tr(l);
  return r.facts_needed.filter((f) => r.obligations.some((o) => o.rule_id.startsWith(FACT_RULE[f.fact] ?? "\u0000") && (!f.period_label_et || o.period_label_et === f.period_label_et))).map((f) => {
    // The TSD row for the same payout period; it goes away only when payouts and other triggers are both "no".
    const tsd = f.period_label_et ? r.obligations.find((o) => o.rule_id === "tsd-monthly-return" && o.period_label_et === f.period_label_et && o.effective_due) : undefined;
    const d = tsd?.effective_due ? civil(tsd.effective_due) : null;
    return { q: t(f.question_et, f.question_en), then: d ? t(`Kui midagi deklareerida polnud, kaob ${d.getUTCDate()}. ${ET_OF[d.getUTCMonth()]} TSD rida.`, `If nothing needed declaring, the ${C_DAY_MON.en.format(d)} TSD row goes away.`) : "" };
  });
}

// --- Public landing: the jobs the assistant takes off the owner, with a pure-CSS chat teaser (owner request 2026-10-30) ---
const icon = (d: string) => `<span class="how-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
const CONNECT_ICON = '<rect x="8" y="2.5" width="8" height="5" rx="1"/><path d="M10 2.5V1M14 2.5V1M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0zM12 16.5V23"/>';
const STEP_ICONS = [
  CONNECT_ICON,
  CONNECT_ICON,
  '<path d="M4 4.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z"/><path d="M7.5 9h9M7.5 12.5h6"/>',
  '<rect x="6.5" y="1.5" width="11" height="21" rx="2.5"/><path d="M9 12l2.2 2.2L15.5 10M10.5 19.5h3"/>',
];

/** After scrolling, preserve the active card when it is wholly in view. */
export function jobCardAfterScroll(active: number, track: { left: number; right: number }, cards: readonly { left: number; right: number }[]): number {
  if (cards[active].left >= track.left - 1 && cards[active].right <= track.right + 1) return active;
  for (let i = 0; i < cards.length; i++) if (cards[i].left >= track.left - 1 && cards[i].right <= track.right + 1) return i;
  let nearest = 0, distance = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const d = Math.abs(cards[i].left - track.left);
    if (d < distance) { distance = d; nearest = i; }
  }
  return nearest;
}

const JOB_CAROUSEL_SCRIPT = `<script>(function(){var jobCardAfterScroll=${jobCardAfterScroll};var track=document.getElementById("job-track");if(!track)return;var prev=document.querySelector("[data-job-prev]"),next=document.querySelector("[data-job-next]"),status=document.querySelector("[data-job-status]");if(!prev||!next||!status)return;var cards=[].slice.call(track.querySelectorAll("[data-job-card]")),conversations=[].slice.call(document.querySelectorAll("[data-job-conversation]"));if(!cards.length)return;var controls=[prev,next,status],active=cards[0];for(var i=0;i<controls.length;i++)controls[i].hidden=false;function activate(card,scroll){if(!card)return;active=card;var id=card.getAttribute("data-job-card"),n=cards.indexOf(card);for(var i=0;i<cards.length;i++){var on=cards[i]===card;cards[i].classList.toggle("job-card--active",on);cards[i].querySelector("[data-job-activate]").setAttribute("aria-pressed",on?"true":"false");}var shown=null,revealed=false;for(var j=0;j<conversations.length;j++){var show=conversations[j].getAttribute("data-job-conversation")===id;if(show){revealed=conversations[j].hidden;shown=conversations[j];}conversations[j].hidden=!show;}var pause=document.getElementById("teaser-pause");if(pause&&pause.checked&&revealed&&shown){var finalMs=14000;var seek=function(){var anims=shown.getAnimations({subtree:true});for(var a=0;a<anims.length;a++)anims[a].currentTime=finalMs;return anims;};Promise.all(seek().map(function(anim){return anim.ready;})).then(function(){if(pause.checked)seek();});}status.textContent=(n+1)+" / "+cards.length;if(scroll)card.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest",inline:"start"});}function nearest(){if(!ownerScroll)return;ownerScroll=false;var box=track.getBoundingClientRect(),rects=cards.map(function(card){var r=card.getBoundingClientRect();return {left:r.left,right:r.right};});activate(cards[jobCardAfterScroll(cards.indexOf(active),{left:box.left,right:box.right},rects)],false);}function go(d){activate(cards[Math.max(0,Math.min(cards.length-1,cards.indexOf(active)+d))],true);}prev.addEventListener("click",function(){go(-1);});next.addEventListener("click",function(){go(1);});for(var k=0;k<cards.length;k++)(function(card){card.querySelector("[data-job-activate]").addEventListener("click",function(){activate(card,true);});})(cards[k]);var ownerScroll=false;function scrolling(){ownerScroll=true;}track.addEventListener("pointerdown",scrolling);track.addEventListener("touchstart",scrolling,{passive:true});track.addEventListener("wheel",scrolling,{passive:true});track.addEventListener("keydown",scrolling);var timer;if("onscrollend" in track)track.addEventListener("scrollend",nearest);else track.addEventListener("scroll",function(){clearTimeout(timer);timer=setTimeout(nearest,120);},{passive:true});activate(active,false);})();</script>`;

export function landingBody(o: { lang: Lang; demo: boolean; rand?: () => number }): string {
  const l = o.lang, t = tr(l);
  const amounts: Record<string, string> = { total: fmtEur(72000, l), cap: fmtEur(50000, l), unpaid: fmtEur(31000, l), purchases: fmtEur(118420, l) };
  const format = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => amounts[k] ?? "");
  const text = (v: LandingText) => format(t(v.et, v.en));
  const rich = (v: LandingCase["answer"]) => {
    const value = text(v), bold = format(t(v.boldEt ?? "", v.boldEn ?? "")), at = bold ? value.indexOf(bold) : -1;
    return at < 0 ? esc(value) : `${esc(value.slice(0, at))}<b>${esc(bold)}</b>${esc(value.slice(at + bold.length))}`;
  };
  const chipText = (chip: LandingChip): string => {
    if (chip.kind === "rule") return t("Arvutatud reeglist", "Calculated by rule");
    if ("source" in chip) {
      const act = chip.source === "kmd" ? t("KMS", "VAT Act") : t("ÄS", "Commercial Code");
      return `${t("Allikas", "Source")}: ${act} ${SRC[chip.source].section}`;
    }
    return t(chip.et, chip.en);
  };
  const chipLabels = (chips: readonly LandingChip[] = []) => chips.length ? `<span class="labels">${chips.map((chip) => labelChip(chip.kind, chipText(chip))).join("")}</span>` : "";
  const connector = (c: LandingConnector) => {
    const href = c.href ?? (c.g ? `/kataloog?g=${c.g}` : null);
    return href ? `<a href="${esc(href)}">${esc(t(c.et, c.en))}</a>` : `<span class="label-chip label-chip--rule">${esc(t(c.et, c.en))}</span>`;
  };
  const subtitle = (job: LandingCase) => {
    const names = job.connectors.filter((c) => !c.launchpad).map((c) => {
      if (c.subtitleEt) return t(c.subtitleEt, c.subtitleEn ?? c.subtitleEt);
      const name = t(c.et, c.en);
      return name.charAt(0).toLocaleLowerCase(l) + name.slice(1);
    });
    names.push(t("AI-hüppelaud", "AI Launchpad"));
    return `${t("ühendatud:", "connected:")} ${names.join(", ")}`;
  };
  const me = (id: string, value: string) => `<div class="beat beat--me b-${id}-me1"><p class="bubble">${esc(value)}</p></div>`;
  const ai = (id: string, k: string, inner: string) => `<div class="beat beat--ai b-${id}-${k}"><div class="bubble">${inner}</div></div>`;
  const typing = (id: string, k: string) => `<div class="beat beat--typing b-${id}-${k}"><span class="typing"><i></i><i></i><i></i></span></div>`;
  const approve = t("Kinnita täpselt see", "Approve exactly this"), done = `✓ ${t("Kinnitatud · Saadetud sinu e-postist: demo", "Approved · Sent from your e-mail: demo")}`;
  const conversation = (job: LandingCase, index: number) => {
    const id = job.id, ask = text(job.ask), answer = text(job.answer), approval = job.approval;
    const chat = [me(id, ask), typing(id, "t1"), ai(id, "ai1", `${rich(job.answer)}${chipLabels(job.chips)}`)];
    const transcript: [string, string][] = [
      [t("Sina", "You"), ask],
      [t("Assistent", "Assistant"), [answer, ...(job.chips ?? []).map(chipText)].join(" · ")],
    ];
    if (approval) {
      const title = text(approval.title), amount = fmtEur(approval.amountCents, l);
      chat.push(`<div class="beat b-${id}-card"><div class="mock-card"><div class="labels mock-state"><span class="mock-wait">${stateChip("waiting", t("Ootab sinu kinnitust", "Waiting for your approval"))}</span><span class="mock-ok">${stateChip("approved", t("Kinnitatud", "Approved"))}</span></div>
<p class="mock-title">${esc(title)}</p><p class="mock-facts"><span>${esc(approval.client)}</span><b>${esc(amount)}</b></p>
<div class="mock-btn"><span class="mock-approve">${esc(approve)}</span><span class="mock-done">${esc(done)}</span><span class="mock-tap"></span></div>
${approval.allow ? `<div class="beat beat--allow b-${id}-allow"><div class="mock-btn"><span class="mock-allow">${esc(text(approval.allow))}</span><span class="mock-rule">${esc(format(t(approval.allow.standingEt, approval.allow.standingEn)))}</span><span class="mock-tap"></span></div></div>` : ""}</div></div>`);
      transcript.push(
        [t("Assistent", "Assistant"), `${t("Kinnitus", "Approval")}: ${title} · ${approval.client} · ${amount}. „${approve}”`],
        [t("Sina", "You"), t("Kinnitatud", "Approved")],
        [t("Assistent", "Assistant"), t("Saadetud sinu e-postist (näidis)", "Sent from your e-mail (sample)")],
      );
      if (approval.allow) {
        const standing = format(t(approval.allow.standingEt, approval.allow.standingEn)), next = job.next ? text(job.next) : "";
        transcript.push([t("Sina", "You"), text(approval.allow)], [t("Assistent", "Assistant"), `${standing}${next ? `. ${next}` : ""}`]);
      }
    }
    if (job.next) chat.push(typing(id, "t2"), ai(id, "ai2", esc(text(job.next))));
    if (job.next && !approval?.allow) transcript.push([t("Assistent", "Assistant"), text(job.next)]);
    return `<div class="teaser-conversation" data-job-conversation="${esc(id)}"${index === 0 ? "" : " hidden"}>
<div class="vh"><p>${t("Näidisvestlus:", "Sample conversation:")}</p><ol>${transcript.map(([who, value]) => `<li>${esc(who)}: ${esc(value)}</li>`).join("")}</ol></div>
<div class="phone" aria-hidden="true"><div class="phone-screen"><div class="phone-bar"><span class="phone-ava"></span><span class="phone-who"><b>${t("Sinu assistent", "Your assistant")}</b><small>${esc(subtitle(job))}</small></span></div>
<div class="chat">${chat.join("\n")}</div></div></div></div>`;
  };
  const jobs = [...LANDING_CARDS], rand = o.rand ?? Math.random;
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  const jobsHeading = t("Mida assistent saab ära teha", "What your assistant can take off you");
  const jobCards = jobs.map((job, index) => `<li class="job-card${index === 0 ? " job-card--active" : ""}" data-job-card="${esc(job.id)}"><h3><button type="button" class="job-activate" aria-pressed="${index === 0}" aria-controls="landing-phone" data-job-activate="${esc(job.id)}">${esc(t(job.et, job.en))}</button></h3><p>${esc(t(job.bodyEt, job.bodyEn))}</p><p class="job-needs">${esc(t("Vajab ühendusi:", "Needs connectors:"))}</p><div class="chips job-chips">${job.connectors.map(connector).join("")}</div>${job.registerData ? `<p class="job-register small muted">${esc(t("Registriandmed: Ärikratt", "Register data: Ärikratt"))}</p>` : ""}</li>`).join("");
  const steps = [
    t("Ühenda oma ChatGPT või Claude", "Connect your ChatGPT or Claude"),
    t("Ühenda ka oma raamatupidamine ja e-post — assistent ütleb, milline ühendus sobib", "Connect your accounting software and e-mail too — your assistant tells you which connector fits"),
    t("Küsi: „Mida saad minu kontoritööst ära teha?”", "Ask: “What office work can you take off me?”"),
    t("Kinnita ühe puudutusega — või luba edaspidi automaatselt", "Approve with one tap — or let it run automatically"),
  ];
  const trust = [
    t("Midagi ei saadeta ilma sinu loata", "Nothing is sent without your permission"),
    t("Smart-ID ja allkiri jäävad sinu kätte", "Smart-ID and signatures stay with you"),
    t("Maksud ja tähtajad arvutab reeglistik, mitte tehisaru", "Taxes and deadlines are calculated by rules, not AI"),
  ];
  return `<div class="landing">
<section class="landing-hero" aria-labelledby="hero-h"><div>
<h1 id="hero-h">${t("Tegele sellega, milles oled hea.", "Focus on what you're good at.")} <span>${t("Kontoritöö teeb sinu AI-assistent.", "Your AI assistant does the office work.")}</span></h1>
<p class="lede">${esc(t("Sinu assistent teeb kontoritöö sinu raamatupidamise, panga ja e-posti ühenduste kaudu. AI-hüppelaud juhib tööd: ütleb, milliseid ühendusi vaja, küsib sinu kinnitust, mõõdab, mis on sinu käest ära, ja kogub tagasisidet. Töötab sinu oma ChatGPT või Claude'iga.", "Your assistant does the office work through your accounting, bank and e-mail connectors. AI Launchpad runs the work: it tells you which connectors you need, asks for your approval, measures what is off your plate and collects feedback. Works with your own ChatGPT or Claude."))}</p>
<div class="landing-actions"><a class="btn" href="/uhenda">${t("Ühenda oma assistent", "Connect your assistant")}</a><a class="tap-link" href="/naidis">${t("Vaata näidist", "See a sample")}</a><a class="tap-link" href="/proovi">${t("Proovi ise", "Try it yourself")}</a></div></div>
<figure class="teaser" id="landing-phone">
<input type="checkbox" id="teaser-pause" class="vh-input">
${jobs.map(conversation).join("\n")}
<figcaption>${sampleChip(l)}<span class="small muted">${t("Vestlus sinu ChatGPT-s või Claude'is", "A conversation in your ChatGPT or Claude")}</span><label class="teaser-pause" for="teaser-pause"><span class="tp-pause">${t("Peata animatsioon", "Pause animation")}</span><span class="tp-resume">${t("Jätka animatsiooni", "Resume animation")}</span></label></figcaption>
</figure>
<section class="use-cases" aria-labelledby="jobs-h"><h2 id="jobs-h">${esc(jobsHeading)}</h2>
<ul class="job-track" id="job-track" role="region" aria-label="${esc(jobsHeading)}" tabindex="0">${jobCards}</ul>
<div class="job-pager"><button type="button" class="secondary" aria-controls="job-track" data-job-prev hidden>${esc(t("‹ Eelmine", "‹ Previous"))}</button><button type="button" class="secondary" aria-controls="job-track" data-job-next hidden>${esc(t("Järgmine ›", "Next ›"))}</button><span class="small muted" aria-live="polite" data-job-status hidden>1 / ${jobs.length}</span></div>
<p class="small muted use-caption">${esc(t("Näited. Raamatupidamise, panga ja e-posti ühendused on nende pakkujate omad — ", "Examples. Accounting, bank and e-mail connectors belong to their providers — "))}<a href="/kataloog">${esc(t("vaata kataloogist", "see the catalogue"))}</a>${esc(t(", mis sinu programmile olemas on.", " for what exists for your software."))} ${esc(t("Ärikratti soovitame tungivalt: sellest tulevad sinu ettevõtte registriandmed.", "We strongly recommend Ärikratt: it supplies your company's register data."))}</p>
${JOB_CAROUSEL_SCRIPT}</section></section>
<section aria-labelledby="how-h"><h2 id="how-h">${esc(t("Kuidas alustada", "How to start"))}</h2>
<ol class="how">${steps.map((s, i) => `<li>${icon(STEP_ICONS[i])}${i === 0 ? `<a class="how-go" href="/uhenda">${esc(s)}</a>` : `<span>${esc(s)}</span>`}</li>`).join("")}</ol>
<p class="how-cta"><a class="btn" href="/uhenda">${t("Ühenda oma assistent", "Connect your assistant")}</a>${o.demo ? `<a class="tap-link" href="/login">${t("Vaata näidisettevõtet", "See the sample company")}</a>` : ""}</p></section>
<ul class="trust" aria-label="${t("Mida me lubame", "What we promise")}">${trust.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p class="small muted landing-foot"><a class="tap-link" href="/demand">${t("Meta Muse Spark Open liigitab anonüümselt, mida ettevõtjad veel vajavad", "Meta Muse Spark Open anonymously classifies what businesses still need")}</a></p>
</div>`;
}

// --- Täna (ux2 change 1): who does the work. Ootab sinult · Assistent tegi · Tulekul. ---
export interface TanaOpts {
  lang: Lang; csrf: string; sample: boolean; label: string;
  assessment: Assessment | null; coverage: Coverage; assessedAt: string | null; exclusions: Exclusion[];
  /** Every pending approval, then the recent approved and consumed ones; each group newest first. */
  approvals: ApprovalRow[];
  progress: { task_id: string; milestone: string; observed_at: string }[];
  /** null: no registry code known; "not_cached": register facts are being fetched; "invalid_code": the assistant's code fails the checksum; "not_found": the register has no company with the code; unavailable_reason: the register lookup failed. */
  deadlines: DeadlinesView | "not_cached" | "invalid_code" | "not_found" | { unavailable_reason: string } | null;
  needs: OwnerNeed[];
  /** Count of the assistant's saved reports (real records). */
  reportCount: number;
  /** The owner's standing approvals, to name the rule behind an auto-approved row. */
  rules?: StandingRule[];
  /** „Käest ära” (#61): the strip under the pills. */
  handover?: Handover;
  now?: Date;
}
/** The register lookup is unavailable: ask the assistant instead, with the plain reason. */
export const deadlinesHint = (l: Lang, reason: string, reasonLang: Lang = "en") => `<p class="small">${tr(l)("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?”", "Deadlines: ask your assistant \"What are my deadlines?\"")} <span class="muted"${reasonLang !== l ? ` lang="${reasonLang}"` : ""}>${esc(reason)}</span></p>`;
const TRY_PROMPT: [string, string] = ["Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?", "What admin do I have this month, and what can you do yourself?"];
/** English Täna on a sample workspace (#63 m13): the fixture labels we wrote show in English (plain);
 * the rest of the assistant's text stays as written and is marked Estonian (html). */
const fixtureText = (l: Lang, sample: boolean) => {
  const on = l === "en" && sample, plain = (s: string) => (on && DEMO_LABELS_EN[s]) || s;
  return { plain, html: (s: string) => (on && !DEMO_LABELS_EN[s] ? `<span lang="et">${esc(s)}</span>` : esc(plain(s))) };
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function tanaBody(o: TanaOpts): string {
  const l = o.lang, t = tr(l), now = o.now ?? new Date(), a = o.assessment, fx = fixtureText(l, o.sample);
  const deadlines = o.deadlines && typeof o.deadlines === "object" && "obligations" in o.deadlines ? o.deadlines : null;
  const pending = o.approvals.filter((x) => x.state === "pending");
  // A failed or rejected outcome is not done work: it needs the owner.
  const failed = o.approvals.filter((x) => x.state === "consumed" && ["failed", "rejected"].includes(approvalView(x, l).outcome?.outcome ?? ""));
  const qs = deadlines ? questions(deadlines, l) : [];
  const next = a?.next_action.needs_owner ? a.next_action : null;
  const optional = o.needs.filter((n) => n.state === "classified");
  const n = pending.length + failed.length + qs.length + (next ? 1 : 0);

  // Ootab sinult
  const askRows = [
    ...pending.map((x) => approvalLinkRow(x, l, now, o.sample, true)),
    ...failed.map((x) => { const v = approvalView(x, l); return askLink(`/approvals/${esc(encodeURIComponent(x.id))}`, `${stateChip("rejected", t("Ei õnnestunud — vaata üle", "Did not work — review it"))}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}`, esc([v.title, v.recipient.name].filter(Boolean).join(" · ")), esc(fmtWhen(v.outcome?.observed_at ?? x.consumed_at, l, now))); }),
    ...qs.map((x) => `<div class="ask ask--note"><div class="ask-body"><span class="ask-title">${t("Vasta assistendile ühele küsimusele:", "Answer one question for your assistant:")}</span><p class="small">„${esc(x.q)}” ${esc(x.then)}</p></div></div>`),
    // Unknowns stay in the main view, before any disclosure; not counted as asks.
    ...(a && (o.coverage.unresolved || a.gaps.length) ? [`<div class="ask-row"><strong>${t("Assistent pole veel kõike hinnanud:", "Your assistant has not assessed everything yet:")}</strong><ul class="tight">${[...(o.coverage.unresolved ? [esc(t(`${o.coverage.unresolved} kohustus(t) on veel lahtised`, `${o.coverage.unresolved} item(s) still unresolved`))] : []), ...a.gaps.map(fx.html)].map((g) => `<li class="small">${g}</li>`).join("")}</ul></div>`] : []),
    // Rationale and any effort estimate are the assistant's words, labelled as such; never in the hero or the counts.
    ...(next ? [`<div class="ask ask--note"><div class="ask-body"><span class="ask-title">${t("Järgmine samm:", "Next step:")} ${fx.html(next.title)}</span><p class="small"><span class="muted">${t("Assistendi hinnang:", "Your assistant's estimate:")}</span> ${[next.rationale, next.estimated_effort_saved?.trim()].filter((x): x is string => !!x).map(fx.html).join(" ")}</p><details class="plain"><summary>${t("Mida assistendile öelda", "What to tell your assistant")}</summary><div class="quote"><p class="small"><span class="muted">${t("Palu assistendilt:", "Ask your assistant:")}</span> „${t(`${esc(`Järgmine samm minu AI-hüppelaua hinnangust: „${next.title}”. Miks: ${next.rationale}`)} Palun aita mul see ära teha või ütle, mida sinult vaja on.`, `Next step from my AI Launchpad assessment: "${fx.html(next.title)}". Why: ${fx.html(next.rationale)} Please help me do this, or tell me what you need from me.`)}”</p></div></details></div></div>`] : []),
    ...optional.map((x) => `<div class="ask ask--note"><div class="ask-body"><a class="tap-link" href="#soov-${esc(x.id)}"><span><strong>${t("Valikuline:", "Optional:")}</strong> ${esc(needLabel(x, l) ?? x.need_redacted)}</span></a><p class="small">${t("Seda ei saa assistent sinu eest teha. Võid soovi anonüümselt avaldada.", "Your assistant can't do this for you. You may publish it anonymously.")}</p></div></div>`),
  ];

  // Assistent tegi: finished or prepared work only, never reads. Approved work still waiting for
  // the assistant's report is listed but not counted.
  const titleOf = (id: string) => fx.html(a?.responsibilities.find((r) => r.id === id)?.label ?? id);
  const doneRows: string[] = [];
  let doneCount = 0;
  for (const x of o.approvals) {
    const v = approvalView(x, l);
    const who = v.recipient.name ? ` · ${esc(v.recipient.name)}` : "";
    if (x.state === "consumed" && v.outcome && ["sent", "paid", "submitted", "accepted", "posted"].includes(v.outcome.outcome)) {
      doneCount++;
      doneRows.push(`<div class="row"><a href="/approvals/${esc(encodeURIComponent(x.id))}"><strong>${esc(v.title)}${who}</strong></a><div class="labels">${outcomeChip(v.outcome.outcome, l, o.sample)}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}${x.approved_by_rule ? ruleChip(l) : ""}</div><span class="small muted">${x.approved_by_rule ? esc(t(`Püsiloaga: ${ruleTitle(x, o.rules, l)}`, `Standing approval: ${ruleTitle(x, o.rules, l)}`)) : t("1 sinu kinnitus", "1 approval from you")} · ${timeEl(v.outcome.observed_at ?? x.consumed_at ?? x.created_at, fmtWhen(v.outcome.observed_at ?? x.consumed_at, l, now))}${v.amount ? ` · ${esc(v.amount)}` : ""}</span></div>`);
    } else if (x.state === "approved") {
      doneRows.push(`<div class="row"><a href="/approvals/${esc(encodeURIComponent(x.id))}"><strong>${esc(v.title)}${who}</strong></a><div class="labels">${x.approved_by_rule ? ruleChip(l) : ""}${stateChip("approved", t("Pooleli · ootab assistendi teadet", "In progress · waiting for your assistant's report"))}</div><span class="small muted">${x.approved_by_rule ? esc(t(`Püsiloaga: ${ruleTitle(x, o.rules, l)}`, `Standing approval: ${ruleTitle(x, o.rules, l)}`)) : t("Sinu kinnitus", "You approved")} · ${esc(fmtWhen(x.decided_at, l, now))}</span></div>`);
    }
  }
  // Work on a row the assistant now marks not applicable stays on Tehtud, not Täna.
  const notApplicable = new Set((a?.responsibilities ?? []).filter((r) => r.applicability === "not_applicable").map((r) => r.id));
  for (const p of o.progress) {
    if (p.milestone !== "draft_prepared" && p.milestone !== "external_completion_reported") continue;
    if (notApplicable.has(p.task_id)) continue;
    const verb = t(...PROGRESS_VERB[p.milestone]);
    doneCount++;
    doneRows.push(`<div class="row"><strong>${verb} ${titleOf(p.task_id)}</strong><div class="labels">${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}</div><span class="small muted">${esc(fmtWhen(p.observed_at, l, now))}</span></div>`);
  }
  const handled = (a?.responsibilities ?? []).filter((r) => !notApplicable.has(r.id) && isHandled(r));
  const handledLine = handled.length ? `<p class="small muted">${handled.map((r) => `${t("Lisaks teeb", "Also handled by")} ${fx.html(r.executor!)}: ${fx.html(r.label)} ${esc(t("(assistendi hinnang).", "(your assistant's assessment)."))}`).join(" ")}</p>` : "";

  // A known unknown is never hidden behind "nothing needs you".
  const open = !!a && (o.coverage.unresolved > 0 || a.gaps.length > 0);
  const upcoming = deadlines?.obligations.length ?? 0;
  const top = pending[0];
  const lede = n
    ? `${[pending.length ? plural(pending.length, t("kinnitus", "approval"), t("kinnitust", "approvals")) : "", failed.length ? plural(failed.length, t("ebaõnnestunud töö", "failed job"), t("ebaõnnestunud tööd", "failed jobs")) : "", qs.length ? plural(qs.length, t("vastus", "answer"), t("vastust", "answers")) : "", next ? t("1 järgmine samm", "1 next step") : ""].filter(Boolean).join(", ").replace(/, ([^,]*)$/, t(" ja $1", " and $1"))}. ${t("Ülejäänu valmistab ette sinu assistent.", "Your assistant prepares the rest.")}`
    : open ? t("Assistent pole veel kõike hinnanud; lahtised küsimused on allpool.", "Your assistant has not assessed everything yet; the open questions are below.")
    : a || o.approvals.length || deadlines ? t("Ülejäänu valmistab ette sinu assistent. Kui midagi vajab sinu kinnitust, näed seda siin.", "Your assistant prepares the rest. When something needs your approval, you see it here.")
      : t(`Ühenda oma assistent ja küsi temalt: „${TRY_PROMPT[0]}”`, `Connect your assistant and ask it: “${TRY_PROMPT[1]}”`);
  const primary = top ? `<a class="btn" href="/approvals/${esc(encodeURIComponent(top.id))}">${t("Vaata kinnitust", "Review approval")}</a>`
    : n ? `<a class="btn" href="#ootab">${t("Vaata, mida sinult vaja on", "See what needs you")}</a>`
    : !a && !o.approvals.length ? `<a class="btn" href="/uhenda">${t("Ühenda oma assistent", "Connect your assistant")}</a>` : "";
  const h1 = n === 0 ? (open ? t("Täna ei oota sinult ükski kinnitus", "No approval is waiting for you today") : t("Täna pole sinult midagi vaja", "Nothing needs you today")) : n === 1 ? t("Sinult on täna vaja üht asja", "You're needed for 1 thing today") : t(`Sinult on täna vaja ${n} asja`, `You're needed for ${n} things today`);

  // One sample marker per page: with the sample bar shown, a synthetic company keeps only its source line here.
  const sourceChip = !deadlines ? "" : deadlines.company.synthetic ? (o.sample ? "" : sampleChip(l)) : labelChip(deadlines.company.provenance === "public_register" ? "official" : "assistant", t(deadlines.company.label_et, deadlines.company.label_en));
  // Rule rows whose job „Käest ära” gives to someone else (e.g. the accountant does the KMD), from the same handover.
  const others = Object.fromEntries((o.handover?.jobs ?? []).filter((j) => j.rung === "other" && j.assessed?.executor)
    .flatMap((j) => (PLAYBOOKS.find((p) => p.id === j.id)?.triggers ?? []).map((rule) => [rule, fx.plain(j.assessed!.executor!)])));
  const tulekul = deadlines ? deadlinesList(deadlines, l, { now, prompts: true, others })
    : o.deadlines === "not_cached" ? `<p class="muted">${t("Registri andmeid laaditakse. Värskenda lehte hetke pärast.", "Register facts are loading. Refresh the page in a moment.")}</p>`
    : o.deadlines === "invalid_code" ? deadlinesHint(l, t("Registrikood ei ole korrektne — palu assistendil see üle kontrollida.", "The registry code is not valid — ask your assistant to check it."), l)
    : o.deadlines === "not_found" ? deadlinesHint(l, t("Registrikoodiga ettevõtet registrist ei leitud — palu assistendil kood üle kontrollida.", "No company with this registry code in the register — ask your assistant to check the code."), l)
    : o.deadlines && "unavailable_reason" in o.deadlines ? deadlinesHint(l, o.deadlines.unavailable_reason)
    : `<p class="muted">${t(`Tähtajad ilmuvad siia, kui assistent teab sinu registrikoodi. Küsi temalt: „${TRY_PROMPT[0]}”`, `Deadlines appear here once your assistant knows your registry code. Ask it: “${TRY_PROMPT[1]}”`)}</p>`;

  const c = o.coverage;
  const how = `<details class="plain"><summary>${t("Kuidas see kokku pandi", "How this was put together")}</summary><div class="note">
<p class="small">${deadlines?.company.synthetic ? t("Tähtajad: reeglistik ja näidisandmed.", "Deadlines: rules and sample data.") : deadlines?.company.provenance === "public_register" ? t("Tähtajad: reeglistik ja avalikud avaandmed (Ärikratt).", "Deadlines: rules and public open data (Ärikratt).") : t("Tähtajad: reeglistik ja sinu assistendi teated.", "Deadlines: rules and your assistant's reports.")} ${esc(t(`Assistendi teated: ${o.reportCount}, AI-hüppelaud neid ei kontrollinud. Allikast kontrollitud tulemusi: ${c.independently_verified_outcomes}.`, `Assistant reports: ${o.reportCount}, not checked by AI Launchpad. Outcomes verified at the source: ${c.independently_verified_outcomes}.`))} ${t("Säästetud aega ei ole mõõdetud, seega me seda ei näita.", "Time saved is not measured, so we don't show it.")}</p>
${a ? `<p class="small">${esc(t(`Assistendi hinnangul on ${c.covered} kohustust ${c.denominator}-st kaardistatust korras${c.percent != null ? ` (${c.percent}%)` : ""}.`, `Your assistant assesses ${c.covered} of ${c.denominator} mapped responsibilities as handled${c.percent != null ? ` (${c.percent}%)` : ""}.`))}${o.assessedAt ? ` ${t("Hinnatud", "Assessed")} ${esc(fmtWhen(o.assessedAt, l, now))}.` : ""}</p>
<p class="small muted">${a.company_label ? t("Ettevõtte nime andis sinu assistent", "Company label supplied by your assistant") : t("Tööruumi nimi", "Workspace label")}${a.company_registry_ref ? ` · ${t("registriviide", "registry ref")} ${esc(a.company_registry_ref)}` : ""} — ${t("seda ei ole avalikust registrist kontrollitud ja see ei tõenda volitust.", "not verified against a public register, and not a mandate.")}</p>
<p class="small">${fx.html(a.conclusion)}</p>
<ul class="tight">${a.responsibilities.map((r) => `<li class="small">${fx.html(r.label)} — ${r.applicability === "not_applicable" ? t("sind ei puuduta", "does not apply to you") : r.is_core ? t("sinu põhitöö", "your core work") : isHandled(r) ? `${t("teeb", "handled by")} ${fx.html(r.executor!)} ${esc(t("(assistendi hinnang)", "(your assistant's assessment)"))}` : r.applicability === "unresolved" ? t("lahtine", "unresolved") : t("teed praegu ise", "you do it yourself now")}<br><span class="muted">${fx.html(r.reason)}</span></li>`).join("")}</ul>` : ""}
${o.exclusions.length ? `<p class="small muted">${t("Varasematest hinnangutest eemaldatud:", "Removed since earlier assessments:")} ${o.exclusions.map((x) => fx.html(x.label)).join(", ")}</p>` : ""}
</div></details>`;

  // T5 (#61) puts its progress strip directly under the pills, before the primary action.
  return `<section class="hero" aria-labelledby="t-h">
<p class="company">${fx.html(a?.company_label ?? deadlines?.company.name ?? o.label)}</p>
<h1 id="t-h">${esc(h1)}</h1>
<p class="lede">${esc(lede)} <span class="small muted">${timeEl(tallinnYmd(now), TODAY[l].format(now))}</span></p>
<nav class="today-sum" aria-label="${t("Kokkuvõte", "Summary")}"><a${n ? ' class="needs"' : ""} href="#ootab"><b>${n}</b><span>${t("ootab sinult", "need you")}</span></a><a href="#tegi"><b>${doneCount}</b><span>${t("assistent tegi", "done for you")}</span></a><a href="#tulekul"><b>${upcoming}</b><span>${t("tulekul", "coming up")}</span></a></nav>
${o.handover ? handoverStrip(o.handover, l) : ""}
${primary}
</section>
<div class="tana-grid"><div class="col">
<section class="section" id="ootab" aria-labelledby="ootab-h"><h2 id="ootab-h">${t("Ootab sinult", "Needs you")} (${n})</h2>
${askRows.join("") || `<p class="muted">${t("Praegu ei oota sinult midagi.", "Nothing is waiting for you right now.")}</p>`}</section>
<section class="section timeline" id="tegi" aria-labelledby="tegi-h"><h2 id="tegi-h">${t("Assistent tegi", "Done for you")} (${doneCount})</h2>
${doneRows.join("") || `<p class="muted">${t(`Veel pole midagi tehtud. Proovi assistendile öelda: „${TRY_PROMPT[0]}”`, `Nothing done yet. Try telling your assistant: “${TRY_PROMPT[1]}”`)}</p>`}
${handledLine}
<a class="tap-link" href="/activity">${t("Kõik tehtud tööd", "Everything done")}</a></section>
</div><div class="col">
<section class="section" id="tulekul" aria-labelledby="tulekul-h"><h2 id="tulekul-h">${t("Tulekul", "Coming up")} (${upcoming})</h2>
${deadlines ? `<div class="labels">${sourceChip}<span class="small muted">${esc([deadlines.company.name, deadlines.company.registry_code].filter(Boolean).join(" · "))}</span></div>` : ""}
${tulekul}
${deadlines ? `<p class="small muted">${t("Tähtajad arvutab reeglistik, mitte tehisaru. Kuupäevad on arvutatud, mitte esitatud ega makstud.", "Deadlines are calculated by rules, not AI. Dates are computed, not filed or paid.")}${deadlines.company.attribution && !deadlines.company.synthetic ? ` ${esc(deadlines.company.attribution)}` : ""}</p>` : ""}</section>
</div></div>
${unmetNeedsBody({ csrf: o.csrf, needs: o.needs, lang: l })}
${how}`;
}

// --- Connect (spec screen 2): the button is the phone path; a public HTTPS page also shows a QR of that same link for a second screen (hidden under 720px) ---
export type ConnectState = { kind: "anon" } | { kind: "sample" } | { kind: "waiting" } | { kind: "connected"; who: string | null; at: string };
// --- Calendar feed (#29): the owner's own calendar is the notifier; read-only, no Launchpad sender. ---
const calendarSetup = (l: Lang) => { const t = tr(l); return `<ul class="small">
<li>${t("iPhone: puuduta linki või ava Kalender → Lisa tellitav kalender ja kleebi aadress.", "iPhone: tap the link, or open Calendar → Add Subscription Calendar and paste the address.")}</li>
<li>${t("Google Calendar: ava see arvutis, vali Muud kalendrid → URL-i kaudu ja kleebi aadress.", "Google Calendar: on a computer, choose Other calendars → From URL and paste the address.")}</li>
<li>${t("Outlook: vali Lisa kalender → Telli veebist ja kleebi aadress.", "Outlook: choose Add calendar → Subscribe from web and paste the address.")}</li></ul>
<p class="small muted">${t("Kalender uueneb mõne tunni jooksul; kinnitada saab ainult assistendi kaudu.", "The calendar updates within a few hours; you approve only through your assistant.")}</p>`; };
function calendarSection(l: Lang, c: { csrf: string; createdAt: string | null }): string {
  const t = tr(l), csrf = `<input type="hidden" name="csrf" value="${esc(c.csrf)}">`;
  const state = c.createdAt
    ? `<p>${t("Kalendri jagamine on sees.", "Calendar sharing is on.")} <span class="small muted">${esc(fmtWhen(c.createdAt, l))}</span></p>
<p class="small muted">${t("Aadressi näidati ainult üks kord. Kui see kadus, lõpeta jagamine ja lisa uus.", "The address was shown only once. If you lost it, stop sharing and add a new one.")}</p>
<form method="post" action="/calendar/feed/revoke">${csrf}<button type="submit" class="secondary">${t("Lõpeta kalendri jagamine", "Stop sharing the calendar")}</button></form>`
    : `<form method="post" action="/calendar/feed">${csrf}<button type="submit">${t("Lisa tähtajad oma kalendrisse", "Add the deadlines to your calendar")}</button></form>`;
  return `<section class="card" aria-labelledby="cal-h"><h2 id="cal-h">${t("Tähtajad sinu kalendris", "Deadlines in your calendar")}</h2>
<p class="small">${t("Sinu kalender tuletab tähtaega meelde nädal ja päev ette ning ütleb, mida assistendile öelda.", "Your calendar reminds you a week and a day ahead and tells you what to say to your assistant.")}</p>
${state}
${calendarSetup(l)}</section>`;
}
export function calendarOnceBody(l: Lang, url: string): string {
  const t = tr(l);
  return `<section class="card hero"><h1>${t("Sinu kalendri aadress", "Your calendar address")}</h1>
<p>${t("Näidatakse <strong>üks kord</strong>. Hoia see enda teada: aadressiga näeb igaüks sinu tähtaegu.", "Shown <strong>once</strong>. Keep it to yourself: anyone with the address can see your deadlines.")}</p>
<div class="endpoint"><code>${esc(url).replace(/\//g, "/<wbr>")}</code></div>
<p><a class="btn" href="${esc(url.replace(/^https:/, "webcals:").replace(/^http:/, "webcal:"))}">${t("Ava kalendris (iPhone)", "Open in Calendar (iPhone)")}</a></p>
${calendarSetup(l)}
<p><a class="tap-link" href="/uhenda">${t("Tagasi: Ühendus", "Back: Connection")}</a></p></section>`;
}

/** Claude web uses Customize; the phone app has no Customize menu (Settings → Connectors → +). */
const CLAUDE_CONNECTOR_STEP: Record<Lang, string> = {
  et: "Arvutis: Customize → Connectors → Add custom connector. Telefoni äpis: Settings → Connectors → + → Add custom connector.",
  en: "On a computer: Customize → Connectors → Add custom connector. In the phone app: Settings → Connectors → + → Add custom connector.",
};

/** Words shared by the connect page and GET /uhenda/ava. The assistant only types them; the person sends. */
export function assistantGuidePrompt(lang: Lang, assistant: "chatgpt" | "claude", endpoint: string): string {
  if (assistant === "claude" && lang === "en") return `Hi! Help me connect AI Launchpad to my Claude. Guide me in plain words, one step at a time, and wait until I say "done".\n1. ${CLAUDE_CONNECTOR_STEP.en}\n2. Name: AI Launchpad. Address: ${endpoint}. Press Continue, then Add. Change nothing else.\n3. Press Connect, sign in and confirm. If asked for tool permission, choose Always allow.\nOnce the connection works, use the AI Launchpad tool get_started.`;
  if (assistant === "chatgpt" && lang === "en") return `Hi! Help me connect AI Launchpad to my ChatGPT. Guide me in plain words, one step at a time, and wait until I say "done".\n1. In settings open connectors (Apps) and add a new connector.\n2. Name: AI Launchpad. Address: ${endpoint}.\n3. Sign in and confirm.\nOnce the connection works, use the AI Launchpad tool get_started.`;
  if (assistant === "claude") return `Tere! Aita mul ühendada AI-hüppelaud oma Claude'iga. Juhenda mind lihtsate sõnadega, üks samm korraga, ja oota, kuni ütlen „tehtud”.\n1. ${CLAUDE_CONNECTOR_STEP.et}\n2. Nimi: AI-hüppelaud. Aadress: ${endpoint}. Vajuta Continue ja siis Add. Ära muuda midagi muud.\n3. Vajuta Connect, logi sisse ja kinnita. Kui küsitakse tööriista luba, vali Always allow.\nKui ühendus töötab, kasuta AI-hüppelaua tööriista get_started.`;
  return `Tere! Aita mul ühendada AI-hüppelaud oma ChatGPT-ga. Juhenda mind lihtsate sõnadega, üks samm korraga, ja oota, kuni ütlen „tehtud”.\n1. Ava seadetes ühendused (Apps) ja lisa uus ühendus.\n2. Nimi: AI-hüppelaud. Aadress: ${endpoint}.\n3. Logi sisse ja kinnita.\nKui ühendus töötab, kasuta AI-hüppelaua tööriista get_started.`;
}

export async function connectBody(o: { lang: Lang; baseUrl: string; assistant: "chatgpt" | "claude"; state: ConnectState; owner: boolean; now?: Date; expanded?: boolean; calendar?: { csrf: string; createdAt: string | null }; standing?: { csrf: string; rules: StandingRule[] }; handover?: Handover }): Promise<string> {
  const l = o.lang, t = tr(l), now = o.now ?? new Date();
  const base = String(o.baseUrl ?? "").replace(/\/+$/, ""), endpoint = `${base}/mcp`;
  const openPath = `/uhenda/ava?a=${o.assistant}&lang=${l}`;
  let parsed: URL | null = null;
  try { parsed = new URL(base); } catch { parsed = null; }
  const remoteReady = parsed !== null && parsed.protocol === "https:" && !isLocalOrPrivateHost(parsed.hostname);
  const name = o.assistant === "claude" ? "Claude" : "ChatGPT";
  const wbr = (u: string) => esc(u).replace(/\//g, "/<wbr>");
  const plan = o.assistant === "claude"
    ? t("Claude lubab kohandatud ühendusi igas paketis (tasuta paketis üks ühendus). Testitud Claude'i tasuta paketis (30.10.2026).", "Claude allows custom connectors on every plan (Free: one connector). Tested on Claude's Free plan (30 Oct 2026).")
    : t("ChatGPT Pro paketis töötavad tähtajad ja juhised (ainult lugemine). Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.", "On ChatGPT Pro, deadlines and guidance work (read-only). Approvals (“Approve exactly this”) need ChatGPT Business.");
  const httpsNote = `<div class="note"><p class="small">${t("Avalik HTTPS-aadress pole selles serveris veel seadistatud, seega pilves töötav assistent ei saa veel ühenduda.", "A public HTTPS address is not configured on this server yet, so a cloud assistant cannot connect yet.")}</p></div>`;
  const address = remoteReady ? `<div class="endpoint"><code>${wbr(endpoint)}</code></div><p class="small muted">${t("Vali aadress ja kopeeri see.", "Select the address and copy it.")}</p>` : httpsNote;
  const prompt = assistantGuidePrompt(l, o.assistant, endpoint);
  const caption = t("Telefonis: suuna kaamera sellele koodile.", "On your phone: point the camera at this code.");
  const qr = remoteReady ? `<figure class="qr-card"><div class="qr-box">${(await QRCode.toString(`${base}${openPath}`, { type: "svg", margin: 1 })).trim().replace("<svg", `<svg role="img" aria-label="${esc(caption)}"`)}</div><figcaption class="small muted">${esc(caption)}</figcaption></figure>` : "";
  const openLabel = t(`Ava ${name} — juhend on juba sees`, `Open ${name} — the guide is already in`);
  const openHint = t(`Vajuta saatmisnuppu ja tee, mida ${name} ütleb. Kui ${name} hoiatab, et tekst tuli lingist, on see tavaline: tekst on meilt.`, `Press the send button and do what ${name} says. If ${name} warns that the text came from a link, that is normal: the text is from us.`);
  // Without a public HTTPS address the open link would hand a localhost URL to a cloud assistant, so the hero is only the note.
  // naita=1 is a link, not <details>: the waiting page reloads every 5s and would close a disclosure.
  const reveal = `/uhenda?a=${o.assistant}&naita=1`;
  const hero = remoteReady
    ? `<a class="btn" href="${openPath}">${esc(openLabel)}</a>
<p class="small">${esc(openHint)}</p>
<p class="small">${esc(plan)}</p>
${qr}
${o.expanded ? `<pre id="tekst">${esc(prompt)}</pre>` : `<p><a class="tap-link" href="${reveal}#tekst">${t("Näita teksti", "Show the text")}</a></p>`}`
    : httpsNote;
  const s = o.state;
  const chip = s.kind === "connected"
    ? (() => { const d = new Date(s.at), time = TIME[l].format(d), sameDay = tallinnYmd(d) === tallinnYmd(now); const who = s.who ?? t("Sinu assistent", "Your assistant"); return `<div class="status-chip" id="connect-status" data-state="connected" role="status"><span class="status-dot" aria-hidden="true"></span><span class="status-text">${esc(t(`Ühendatud · ${who} jõudis kohale ${sameDay ? "" : `${DAY.et.format(d)} `}kell ${time}`, `Connected · ${who} reached AI Launchpad ${sameDay ? "" : `on ${DAY.en.format(d)} `}at ${time}`))}</span></div>`; })()
    : `<div class="status-chip" id="connect-status" data-state="${s.kind === "sample" ? "sample" : "waiting"}" role="status"><span class="status-dot" aria-hidden="true"></span><span class="status-text">${s.kind === "anon" ? `${t("Logi sisse, et näha, kas sinu assistent on ühendatud.", "Sign in to see whether your assistant is connected.")} <a href="/login">${t("Logi sisse", "Sign in")}</a>` : s.kind === "sample" ? t("Näidistööruumis ühenduse olekut ei jälgita.", "Connection status is not tracked in a sample workspace.") : esc(t(`Ootan, et ${name} ühenduks…`, `Waiting for ${name} to connect…`))}</span></div>`;
  // A sample workspace has nothing to set up, so „Käest ära” comes first (QA M2).
  const handover = o.standing && o.handover ? handoverSection(o.handover, l, o.standing.csrf, now, s.kind === "sample") : "", sampleFirst = s.kind === "sample";
  return `<h1>${t("Ühenda oma assistent", "Connect your assistant")}</h1>
<p class="lede">${t("Sinu ChatGPT või Claude näeb sinu tähtaegu ja valmistab töid ette. Sina kinnitad ainult selle, mis sind seob.", "Your ChatGPT or Claude sees your deadlines and prepares work for you. You approve only what binds you.")}</p>
${sampleFirst ? handover : ""}
<p class="small">${esc(t("Lihtsaim algus: Claude — töötab ka tasuta paketis.", "Easiest start: Claude — works on the free plan too."))}</p>
<nav class="choice" aria-label="${t("Vali assistent", "Choose your assistant")}"><a href="/uhenda?a=chatgpt"${o.assistant === "chatgpt" ? ' aria-current="true"' : ""}>ChatGPT</a><a href="/uhenda?a=claude"${o.assistant === "claude" ? ' aria-current="true"' : ""}>Claude</a></nav>
${o.owner ? `<p class="small"><a class="tap-link" href="/setup">${t("Pole veel assistenti? Aitame valida", "No assistant yet? We'll help you choose")}</a></p>` : ""}
<section class="card connect-hero">${hero}</section>
<section class="card" aria-labelledby="st-h"><h2 id="st-h">${t("Ühenduse olek", "Connection status")}</h2>${chip}
${s.kind === "connected" ? `<p>${t("Proovi kohe:", "Try now:")} „${esc(t(TRY_PROMPT[0], TRY_PROMPT[1]))}”</p><p><a class="tap-link" href="/kataloog?g=raamatupidamine">${t("Järgmine samm: ühenda oma raamatupidamine → Kataloog", "Next step: connect your accounting → Catalogue")}</a></p>` : s.kind === "waiting" ? `<p class="small muted">${t("Leht uueneb ise iga 5 sekundi järel.", "This page refreshes itself every 5 seconds.")}</p>` : ""}</section>
${o.expanded ? `<section class="card" id="ise"><h2>${t("Tee ise, ilma juhendita", "Do it yourself, without the guide")}</h2>
<ol class="steps-big">${o.assistant === "claude"
    // Claude steps follow the tested Free-plan run (docs/live-pilot.md, 30 Oct 2026).
    ? `<li><h3 class="step-title">${t(CLAUDE_CONNECTOR_STEP.et, CLAUDE_CONNECTOR_STEP.en)}</h3></li>
<li><h3 class="step-title">${t("Nimi: AI-hüppelaud, aadress:", "Name: AI Launchpad, address:")}</h3>${address}<p><strong>${t("→ Continue → Add. Ära muuda midagi muud.", "→ Continue → Add. Change nothing else.")}</strong></p></li>
<li><h3 class="step-title">${t("Vajuta Connect, logi sisse ja kinnita. Kui Claude küsib tööriista luba, vajuta Allow.", "Press Connect, sign in and confirm. If Claude asks for tool permission, press Allow.")}</h3><p class="small muted">`
    : `<li><h3 class="step-title">${t("Kopeeri aadress", "Copy the address")}</h3>${address}</li>
<li><h3 class="step-title">${t("Ava ChatGPT seadetes ühendused, lisa uus ühendus ja kleebi sinna aadress.", "In ChatGPT settings, open connectors, add a new connector and paste the address.")}</h3></li>
<li><h3 class="step-title">${t("Logi sisse ja vali, mida assistent tohib", "Sign in and choose what your assistant may do")}</h3><p class="small muted">`}${esc(t(`Märgi „Jah: ${name} valmistab ette …”, kui tahad, et ta valmistaks sulle kinnitamiseks kirju, arveid ja deklaratsioone.`, `Tick “Yes: ${name} prepares …” if you want it to prepare messages, invoices and returns for your approval.`))}</p></li></ol>
<p class="small">${t("Kui assistent küsib tööriista luba, vali ‚Always allow' — AI-hüppelaud ise ei saada midagi; sind seob ainult kinnitus või sinu püsiluba.", "If your assistant asks for tool permission, choose ‘Always allow’ — AI Launchpad itself sends nothing; only an approval or your standing approval binds you.")}</p></section>` : `<p><a class="tap-link" href="${reveal}#ise">${t("Tee ise, ilma juhendita", "Do it yourself, without the guide")}</a></p>`}
${o.calendar ? calendarSection(l, o.calendar) : ""}
${sampleFirst ? "" : handover}
${o.standing ? standingSection(l, o.standing, now) : ""}
${techDetails(l, `${techList([[t("MCP-aadress", "MCP address"), endpoint], [t("Sisselogimine", "Sign-in"), "OAuth 2.1 + PKCE"], [t("Õigused", "Scopes"), "progress:read · progress:report (Jah-linnukesega)"], [t("Kliendi nimi", "Client name"), t("kliendi enda antud, kontrollimata", "supplied by the client, not verified")]])}
<p class="small"><a class="tap-link" href="${CHATGPT_GUIDE}" rel="noopener noreferrer">${t("OpenAI juhend", "OpenAI guide")}</a> · <a class="tap-link" href="${CLAUDE_GUIDE}" rel="noopener noreferrer">${t("Claude'i juhend", "Claude guide")}</a>${o.owner ? ` · <a class="tap-link" href="/connection">${t("Käsitsi võtmed", "Manual tokens")}</a>` : ""}</p>`)}
${o.owner ? `<p><a class="tap-link" href="/connection">${t("Andmed ja õigused", "Data and permissions")}</a></p>` : ""}`;
}

/** report_progress milestones as a verb before the job's name, on Täna and Tehtud alike (#63 m12). */
const PROGRESS_VERB: Record<string, [string, string]> = {
  started: ["Alustas:", "Started:"], draft_prepared: ["Valmistas ette:", "Prepared:"], waiting_for_owner: ["Ootab sinu otsust:", "Waiting for you:"],
  blocked: ["Jäi kinni:", "Blocked:"], external_completion_reported: ["Teatas tehtuks:", "Reported done:"],
};
const PROGRESS_SUMMARY = new RegExp(`^(.+): (${Object.keys(PROGRESS_VERB).join("|")}) \\(assistant reported\\)\\.$`);
// --- Tehtud (/activity): finished work in plain verbs; raw log under Tehniline info. ---
const DONE_VERBS: Record<string, [string, string]> = {
  request_approval: ["Assistent valmistas töö ette ja palus sinu kinnitust", "Your assistant prepared work and asked for your approval"],
  record_action_outcome: ["Assistent teatas, mis kinnitatud tööga juhtus", "Your assistant reported what happened with approved work"],
  report_progress: ["Assistent teatas töö käigust", "Your assistant reported progress"],
  report_assessment: ["Assistent salvestas oma hinnangu", "Your assistant saved its assessment"],
  report_unmet_need: ["Assistent teatas tööst, mida ta teha ei saanud", "Your assistant reported a job it could not do"],
  unmet_need_published: ["Sina avaldasid soovi anonüümselt", "You published a request anonymously"],
  unmet_need_kept_private: ["Sina jätsid soovi privaatseks", "You kept a request private"],
  unmet_need_classified: ["Soov liigitati", "A request was classified"],
  demo_fixture_seeded: ["Näidisandmed laaditi", "Sample data loaded"],
  calendar_feed_created: ["Sina lisasid tähtajad oma kalendrisse", "You added the deadlines to your calendar"],
  calendar_feed_revoked: ["Sina lõpetasid kalendri jagamise", "You stopped sharing the calendar"],
  standing_rule_created: ["Sina andsid püsiloa", "You set a standing approval"],
  standing_rule_revoked: ["Sina lõpetasid püsiloa", "You ended a standing approval"],
  standing_auto_approved: ["Püsiluba kinnitas assistendi töö", "Your standing approval approved your assistant's work"],
  approved_in_assistant: ["Sina kinnitasid assistendis", "You approved in your assistant"],
};
export function activityBody(opts: { rows: Record<string, string>[]; receipts: Record<string, string>[]; exclusions: Exclusion[]; lang: Lang; now?: Date; approvals?: ApprovalRow[]; rules?: StandingRule[]; assessment?: Assessment | null; sample?: boolean }): string {
  const l = opts.lang, t = tr(l), now = opts.now ?? new Date(), fx = fixtureText(l, !!opts.sample);
  // Approval rows name their object (title · recipient): the log summary carries the approval id or digest prefix.
  const approvalOf = (summary: string) => (opts.approvals ?? []).find((x) => summary.includes(x.id) || summary.includes(`digest ${x.digest.slice(0, 12)}`));
  const objectOf = (summary: string) => {
    const a = approvalOf(summary);
    if (!a) { const rule = (opts.rules ?? []).find((x) => summary.includes(x.id)); return rule ? standingRuleName(rule, l) : ""; }
    const v = approvalView(a, l);
    return [v.title, v.recipient.name].filter(Boolean).join(" · ");
  };
  const done = opts.rows.flatMap((r) => {
    // A send under a standing approval reads as such (#45).
    const byRule = r.action === "standing_auto_approved" || (r.action === "record_action_outcome" && !!approvalOf(r.summary ?? "")?.approved_by_rule);
    const ruleSent = r.action === "record_action_outcome" && byRule && /^Outcome sent /.test(r.summary ?? "");
    // A progress row names its job by the assessment's label, as Täna does.
    const progress = r.action === "report_progress" ? PROGRESS_SUMMARY.exec(r.summary ?? "") : null;
    const verb = progress ? `${t(...PROGRESS_VERB[progress[2]])} ${fx.plain(opts.assessment?.responsibilities.find((x) => x.id === progress[1])?.label ?? progress[1])}` : ruleSent ? t("Assistent saatis püsiloa alusel:", "Your assistant sent under a standing approval:") : r.action === "approval_decided" ? (r.outcome === "approved" ? t("Sina kinnitasid", "You approved") : r.outcome === "declined" ? t("Sina keeldusid", "You declined") : null) : DONE_VERBS[r.action] ? t(...DONE_VERBS[r.action]) : null;
    if (!verb || (r.outcome !== "ok" && r.action !== "approval_decided")) return [];
    const chip = `${r.actor === "assistant" ? labelChip("assistant", t("Assistent teatas", "Your assistant reports")) : r.action === "approval_decided" && r.outcome === "approved" ? labelChip("owner", t("Sinu kinnitus", "You approved")) : ""}${byRule ? ruleChip(l) : ""}`;
    const object = objectOf(r.summary ?? "");
    return [`<div class="row"><strong>${esc(verb)}</strong>${object ? `<br><span>${esc(object)}</span>` : ""}${chip ? `<div class="labels">${chip}</div>` : "<br>"}<span class="small muted">${timeEl(r.created_at, fmtWhen(r.created_at, l, now))}</span></div>`];
  });
  return `<h1>${t("Tehtud", "Done")}</h1><p class="lede">${t("Mida sinu assistent sinu eest tegi ja mida sina otsustasid.", "What your assistant did for you and what you decided.")}</p>
<div class="note"><p class="small">${t("See pole täielik auditilogi: ebaõnnestunud päringud võivad puududa. Tööd, mida assistent teeb teistes teenustes, siin ei nähta — see paistab ainult assistendi teatena ja on nii ka märgitud.", "Not a complete audit trail: failed requests may be missing. Work your assistant does with other providers is not observed here — it appears only as assistant reports, labelled as such.")}</p></div>
<section class="section timeline" aria-labelledby="done-h"><h2 id="done-h">${t("Viimati tehtud", "Recently done")}</h2>${done.join("") || `<p>${t("Veel pole midagi tehtud.", "Nothing done yet.")}</p>`}</section>
${techDetails(l, `<h2>${t("Kogu logi", "Full log")}</h2>${opts.rows.map((r) => `<div class="row"><code>${esc(r.action)}</code> · ${esc(r.actor)} · ${esc(r.outcome)}<br><span class="small muted">${esc(r.created_at)} · ${esc(r.summary)}</span></div>`).join("") || `<p>${t("Logi on tühi.", "No activity yet.")}</p>`}
<h2>${t("Salvestatud teated (täpselt nagu salvestati)", "Accepted report payloads (exactly as saved)")}</h2>
${opts.receipts.map((r) => `<details><summary>${esc(r.kind)} ${esc(r.report_id)} · ${esc(r.created_at)}</summary><pre>${esc(r.payload_json)}</pre><pre>${esc(r.receipt_json)}</pre></details>`).join("") || `<p>${t("Teateid veel pole.", "No reports yet.")}</p>`}
${opts.exclusions.length ? `<h2>${t("Varasematest hinnangutest eemaldatud", "Exclusions from earlier revisions")}</h2>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">v${esc(x.last_seen_version)} · ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}</span></div>`).join("")}` : ""}`)}`;
}
