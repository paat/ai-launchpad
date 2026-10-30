import type { Assessment, Coverage } from "./core.js";
import { isHandled } from "./core.js";
import { approvalAddressMissing, normAddress, standingRecipients, standingRuleName, STANDING_DEFAULTS, STANDING_KINDS, type ApprovalRow, type AssistantMilestones, type Exclusion, type StandingRule } from "./mcp.js";
import type { CompanyCard, CompanyMatch } from "./arikratt.js";
import { ET_OF, type FactNeeded, type Obligation } from "./obligations.js";
import { BASETEN_MODEL } from "./model-quality.js";
import { BLOCKER_HANDOFF, BLOCKER_LABELS, BLOCKER_LABELS_ET, CATEGORY_LABELS, CATEGORY_LABELS_ET, classifiedByLabel, type Blocker, type Category, type DemandItem, type OwnerNeed } from "./unmet-needs.js";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const CSS = `
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;background:#eceee6;color:#1a241d;line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:680px;margin:auto;padding:14px 16px 36px}
header.top{display:flex;align-items:center;gap:8px;min-height:32px}
.mark{width:14px;height:14px;border-radius:4px;background:#1a4d2e;flex:none}
.brand{font-weight:750;font-size:1.05rem;letter-spacing:-.02em;margin-right:auto}
.badge{display:inline-block;font-size:.75rem;font-weight:650;padding:3px 9px;border-radius:999px;background:#e3e9d8;color:#33472a;border:1px solid #c3d0ab}
.badge.amber{background:#fdf3d7;color:#6b4e00;border-color:#e3c878}
nav.main{display:flex;gap:4px;margin:10px 0 16px;padding:4px;background:#fff;border:1px solid #d9ded2;border-radius:14px}
nav.main a{flex:1 1 0;text-align:center;min-height:44px;display:flex;align-items:center;justify-content:center;padding:8px 6px;border-radius:10px;color:#33402f;text-decoration:none;font-weight:650;font-size:.95rem}
nav.main a[aria-current="page"]{background:#1a4d2e;color:#fff}
a{color:#155e33}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}
.card{background:#fff;border:1px solid #d9ded2;border-radius:16px;padding:18px;margin:12px 0;box-shadow:0 1px 2px rgba(26,36,29,.05)}
.hero{padding:22px 18px}.hero h1{font-size:1.3rem;margin:2px 0 6px}
.company{font-weight:700;color:#1a4d2e;margin:0}
.next{font-size:1.55rem;font-weight:750;letter-spacing:-.02em;line-height:1.25;margin:6px 0 8px;color:#12291a}
.lede{color:#46523f;margin:0 0 4px}
.muted{color:#4d5a48;font-size:.94rem}.small{font-size:.86rem}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:12px 18px;border-radius:12px;border:1px solid #1a4d2e;background:#1a4d2e;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;width:100%;margin:8px 0}
button.secondary,.btn.secondary{background:#fff;color:#1a4d2e;border-color:#9db894}
button.danger{background:#fff;color:#8f1d1d;border-color:#8f1d1d}
input,select,textarea{font:inherit;min-height:48px;padding:10px 12px;border:1px solid #93a187;border-radius:10px;width:100%;margin:4px 0 12px;background:#fff;color:#1a241d}
textarea{min-height:88px}
[hidden]{display:none!important}
label{font-weight:650;display:block}
details{border:1px solid #d9ded2;border-radius:12px;padding:10px 14px;margin:10px 0;background:#fff}
details>summary{padding:4px 0}
h1{font-size:1.5rem;font-weight:750;letter-spacing:-.02em;line-height:1.2;margin:4px 0 8px}
h2{font-size:1.05rem;font-weight:750;letter-spacing:-.01em;margin:16px 0 6px}h3{font-size:.98rem;font-weight:750;margin:18px 0 6px}
.card>h2:first-child,.card>h3:first-child{margin-top:0}
summary{cursor:pointer;font-weight:650;min-height:44px;display:flex;align-items:center}
progress{width:100%;height:12px;accent-color:#1a4d2e}
pre{white-space:pre-wrap;word-break:break-word;background:#eef1e7;border:1px solid #dde3d2;border-radius:10px;padding:12px;font-size:.8rem}
code{word-break:break-all}
pre.doc{max-height:55vh;overflow:auto;font-size:.9rem}
dl.facts{margin:8px 0}dl.facts dt{font-size:.86rem;color:#4d5a48;margin-top:8px}dl.facts dd{margin:0;font-weight:650;overflow-wrap:anywhere}
.endpoint{background:#eef1e7;border:1px solid #ccd6bc;border-radius:10px;padding:12px;margin:8px 0;font-size:.92rem}
.endpoint code{font-weight:650}
.quote{background:#f6f7f1;border:1px solid #dde3d2;border-radius:10px;padding:4px 12px;margin:8px 0}
.notice{background:#fdf3d7;border:1px solid #e3c878;border-radius:12px;padding:12px 14px;margin:10px 0}
.notice p{margin:4px 0}
.note{background:#f6f7f1;border:1px solid #dde3d2;border-radius:10px;padding:10px 12px;margin:10px 0}.note p{margin:2px 0}
.steps{margin:8px 0;padding-left:22px}.steps li{margin:6px 0}
.tabs{display:flex;gap:4px;padding:4px;background:#eef1e7;border:1px solid #d9ded2;border-radius:12px;margin:10px 0}
.tabs button{flex:1 1 0;width:auto;min-height:48px;margin:0;background:transparent;color:#33402f;border-color:transparent}
.tabs button[aria-selected="true"]{background:#1a4d2e;color:#fff;border-color:#1a4d2e}
.tabpanel{padding:2px 2px 6px}
.row{padding:12px 0;border-bottom:1px solid #e7ebdd}.row:last-child{border-bottom:0}
.timeline .row{padding-left:14px;position:relative}
.timeline .row::before{content:"";position:absolute;left:0;top:20px;width:7px;height:7px;border-radius:50%;background:#1a4d2e}
.pill{display:inline-block;font-size:.76rem;font-weight:650;padding:2px 9px;border-radius:999px;background:#eef2e0;color:#33472a;margin:2px 4px 2px 0}
.pill.owner{background:#fdf3d7;color:#6b4e00;border:1px solid #e3c878}
footer{margin-top:24px}footer form button{width:auto;min-height:48px}
.guides{display:flex;gap:8px 16px;flex-wrap:wrap;margin:8px 0}.guides a{min-height:44px;display:inline-flex;align-items:center}
ul.tight{margin:6px 0;padding-left:20px}ul.tight li{margin:4px 0}
.meta{border-top:1px solid #e7ebdd;margin-top:12px;padding-top:10px}
@media (max-width:380px){.wrap{padding:12px 12px 32px}.hero{padding:18px 14px}.card{padding:15px 14px}.next{font-size:1.4rem}h1{font-size:1.35rem}}
/* ===== AI-hüppelaud UI additions v1 (design-spec.md). Append to the CSS constant in src/views.ts. ===== */
/* --- Tokens --- */
:root{color-scheme:light;
--c-bg:#eceee6;--c-surface:#fff;--c-surface-2:#f6f7f1;--c-surface-3:#eef1e7;
--c-text:#1a241d;--c-muted:#4d5a48;--c-primary:#1a4d2e;--c-on-primary:#fff;--c-link:#155e33;
--c-border:#d9ded2;--c-divider:#e7ebdd;--c-control:#6f7d67;--c-control-2:#4f7a4a;--c-step-todo:#7d8a76;
--c-danger:#8f1d1d;--c-focus:#1f5fd6;--c-pulse:#b07d00;
--lbl-official-bg:#e1f0e3;--lbl-official-fg:#14502a;--lbl-official-bd:#a9d1b2;
--lbl-rule-bg:#fff;--lbl-rule-fg:#1a4d2e;--lbl-rule-bd:#1a4d2e;
--lbl-assistant-bg:#eceee9;--lbl-assistant-fg:#3d4640;--lbl-assistant-bd:#c9cec5;
--lbl-owner-bg:#1a4d2e;--lbl-owner-fg:#fff;--lbl-owner-bd:#1a4d2e;
--lbl-ai-bg:#efe9fb;--lbl-ai-fg:#4c2a85;--lbl-ai-bd:#c9b8ec;--lbl-ai-tint:#f8f5fd;
--lbl-sample-bg:#fdf3d7;--lbl-sample-fg:#6b4e00;--lbl-sample-bd:#b08a1e;
--st-drafted-bg:#eceee9;--st-drafted-fg:#3d4640;
--st-waiting-bg:#fdf3d7;--st-waiting-fg:#6b4e00;--st-waiting-bd:#e3c878;
--st-approved-bg:#1a4d2e;--st-approved-fg:#fff;
--st-sent-bg:#e3ecf9;--st-sent-fg:#1d4580;
--st-accepted-bg:#e1f0e3;--st-accepted-fg:#14502a;
--st-rejected-bg:#fbe5e3;--st-rejected-fg:#8f1d1d;
--st-paid-bg:#d9efe9;--st-paid-fg:#0f4f43;
--st-void-bg:#fbe5e3;--st-void-fg:#8f1d1d;
--fs-xs:.8125rem;--fs-sm:.875rem;--fs-md:1rem;--fs-lg:1.125rem;--fs-xl:1.5rem;--fs-2xl:2rem;
--s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:20px;--s-6:24px;--s-8:32px;
--r-sm:6px;--r-md:10px;--r-lg:12px;--r-xl:16px;--tap:44px}

/* --- Replacements of existing rules (R1-R9) --- */
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--c-focus);outline-offset:2px}
input,select,textarea{border-color:var(--c-control)}
button.secondary,.btn.secondary{border-color:var(--c-control-2)}
input[type=checkbox],input[type=radio]{width:22px;height:22px;min-height:0;margin:0;padding:0;flex:none;accent-color:var(--c-primary)}
label.check{display:flex;align-items:flex-start;gap:var(--s-3);min-height:var(--tap);padding:10px 0;font-weight:600;cursor:pointer}
label.check input{margin-top:1px}
.row button,.row .btn{width:auto;min-height:var(--tap);padding:8px 14px;margin:8px 0 0}
code{word-break:normal;overflow-wrap:anywhere}
.row,.card,dd{overflow-wrap:anywhere}
header.top{min-height:var(--tap)}.brand{white-space:nowrap}
.hero h1{font-size:var(--fs-xl)}h2{font-size:var(--fs-lg)}
summary{list-style:none;gap:var(--s-2)}summary::-webkit-details-marker{display:none}
summary::after{content:"";flex:none;width:8px;height:8px;margin:0 4px 0 auto;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg)}
details[open]>summary::after{transform:rotate(45deg)}
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
.state-step{position:relative;display:flex;align-items:flex-start;gap:var(--s-3);padding-bottom:var(--s-4)}
.state-step:last-child{padding-bottom:0}
.state-step:not(:last-child)::after{content:"";position:absolute;left:11px;top:26px;bottom:2px;width:2px;background:var(--c-border)}
.state-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:2px solid var(--c-step-todo);border-radius:50%;background:var(--c-surface);font-size:.75rem;font-weight:800;line-height:1}
.state-step--done .state-mark{background:var(--c-primary);border-color:var(--c-primary);color:var(--c-on-primary)}
.state-step--demo .state-mark{border-style:dashed;border-color:var(--lbl-sample-fg);color:var(--lbl-sample-fg)}
.state-step--stop .state-mark{background:var(--st-rejected-fg);border-color:var(--st-rejected-fg);color:var(--c-on-primary)}
.state-text{padding-top:1px;font-weight:650}
.state-step--todo .state-text{font-weight:500;color:var(--c-muted)}
.state-note{display:block;font-size:var(--fs-sm);font-weight:400;color:var(--c-muted)}

/* --- .status-chip (connect, aria-live) --- */
.status-chip{display:flex;align-items:center;gap:var(--s-3);min-height:52px;margin:var(--s-3) 0;padding:var(--s-3) var(--s-4);border:1px solid var(--st-waiting-bd);border-radius:14px;background:var(--st-waiting-bg);color:var(--st-waiting-fg);font-weight:700}
.status-dot{flex:none;width:12px;height:12px;border-radius:50%;background:var(--c-pulse);animation:lp-pulse 1.6s ease-in-out infinite}
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
/* .today-sum: the three counts on the Täna hero, each a ≥44px anchor */
.today-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:var(--s-3) 0 var(--s-2)}
.today-sum a{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-height:64px;padding:8px 10px;border:1px solid var(--c-border);border-radius:var(--r-lg);background:var(--c-surface-2);color:var(--c-text);text-decoration:none;line-height:1.2}
.today-sum b{font-size:var(--fs-xl);font-weight:800;font-variant-numeric:tabular-nums}
.today-sum span{font-size:var(--fs-sm);font-weight:650;color:var(--c-muted)}
.today-sum a.needs{border-color:var(--st-waiting-bd);background:var(--st-waiting-bg)}
.today-sum a.needs b,.today-sum a.needs span{color:var(--st-waiting-fg)}
/* .handoff: who does what for one job (deadline row, unmet need, receipt) */
.handoff{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 10px;margin:var(--s-2) 0 var(--s-1);padding:10px 12px;border:1px solid var(--c-divider);border-radius:var(--r-md);background:var(--c-surface-2);font-size:.9375rem;line-height:1.4}
.handoff dt{font-size:var(--fs-sm);font-weight:700;color:var(--c-muted)}
.handoff dd{margin:0}
.handoff dt.me{color:var(--st-waiting-fg)}
.deadline-row>.handoff,.deadline-row>.deadline-offer{grid-column:1/-1;margin-top:0}
.ask-row{padding:var(--s-3) 0;border-bottom:1px solid var(--c-divider)}
.ask-row:last-child{border-bottom:0}
/* ===== Issue #21 implementation additions ===== */
pre.letter{max-height:none;margin:var(--s-2) 0;padding:12px 14px;background:var(--c-surface-2);border-color:var(--c-divider);font:inherit;font-size:var(--fs-md);white-space:pre-wrap;overflow-wrap:anywhere}
.big-url{margin:var(--s-2) 0;font-size:var(--fs-lg);font-weight:750;overflow-wrap:anywhere}
.big-url a{color:var(--c-text);text-decoration:none}
.search{display:flex;flex-wrap:wrap;gap:0 8px;align-items:flex-end}.search label{flex:1 1 220px}.search button{flex:1 1 140px;width:auto;margin:4px 0 12px}
.status-chip a{color:inherit}
.tech-list dd{overflow-wrap:anywhere}`;

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
const timeEl = (iso: string, text: string) => `<time datetime="${esc(iso)}">${esc(text)}</time>`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- Chips: one label system (design-spec §2.2–2.3) ---
const labelChip = (kind: "official" | "rule" | "assistant" | "owner" | "ai" | "sample", text: string) => `<span class="label-chip label-chip--${kind}">${esc(text)}</span>`;
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
  const main = o.bodyLang && o.bodyLang !== l ? `<div lang="${o.bodyLang}">${o.body}</div>` : o.body;
  const footer = o.bare ? ""
    : owner
    ? `<footer><details><summary>${t("Abi ja lisad", "Help and resources")}</summary><nav class="guides" aria-label="${t("Lisad", "Guides")}"><a href="/approvals">${t("Kinnitused", "Approvals")}</a><a href="/connection">${t("Andmed ja õigused", "Data and permissions")}</a><a href="/demand">${t("Avatud soovid", "Open demand")}</a><a href="/playbooks">Playbooks</a><a href="/services">${t("Teenuste kataloog", "Service catalog")}</a><a href="/setup">${t("Abi alustamiseks", "Setup helper")}</a></nav></details>
<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><button type="submit" class="secondary">${t("Logi välja", "Log out")}</button></form></footer>`
    : `<footer><nav class="guides" aria-label="${t("Lisad", "Guides")}"><a href="/demand">${t("Avatud soovid", "Open demand")}</a><a href="/login">${t("Logi sisse", "Sign in")}</a></nav></footer>`;
  return `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${o.head ?? ""}<title>${esc(o.title)} · ${t("AI-hüppelaud", "AI Launchpad")}</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="mark" aria-hidden="true"></span><span class="brand">${t("AI-hüppelaud", "AI Launchpad")}</span>${o.sample ? sampleChip(l) : ""}${toggle}</header>
${owner && !o.bare ? `<nav class="main" aria-label="${t("Peamenüü", "Main")}">${nav.map(([href, label, key]) => `<a href="${href}"${o.active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>` : ""}
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

/** Connection page (English management page) keeps its UTC history wording. */
const fmtUtc = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC`;
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

function grantClientName(g: Record<string, unknown>): string {
  try {
    const name = (JSON.parse(String(g.metadata ?? "")) as { client_name?: unknown }).client_name;
    return typeof name === "string" && name.trim() ? name : "Assistant";
  } catch { return "Assistant"; }
}

function grantOrigin(g: Record<string, unknown>): string {
  try { return new URL(String(g.redirect ?? "")).origin; } catch { return "not available"; }
}

/** Copy control in the existing view pattern: text lives escaped in a DOM
 * attribute; the one static script below reads it with getAttribute. Nothing
 * user-controlled is interpolated into inline JavaScript. */
function copyBlock(id: string, label: string, text: string): string {
  return `<button type="button" id="copy-${id}" data-copy-text="${esc(text)}" data-copy-id="${id}">${esc(label)}</button>
<p class="small" id="copy-${id}-ok" role="status" hidden>Copied.</p>
<div id="copy-${id}-fallback" hidden role="status"><p class="small">Copy failed — select the text below and copy it yourself.</p>
<label class="small" for="copy-${id}-text">Copy manually<textarea id="copy-${id}-text" rows="3" readonly></textarea></label></div>`;
}

const GUIDE_SCRIPT = `<script>(function(){var tabs=Array.prototype.slice.call(document.querySelectorAll("[data-guide-tab]"));function show(btn,focus){for(var i=0;i<tabs.length;i++){var on=tabs[i]===btn;tabs[i].setAttribute("aria-selected",on?"true":"false");tabs[i].tabIndex=on?0:-1;var panel=document.getElementById(tabs[i].getAttribute("aria-controls"));if(panel)panel.hidden=!on;}if(focus)btn.focus();}for(var j=0;j<tabs.length;j++){(function(btn,idx){btn.addEventListener("click",function(){show(btn,false);});btn.addEventListener("keydown",function(e){var n=null;if(e.key==="ArrowRight")n=tabs[(idx+1)%tabs.length];else if(e.key==="ArrowLeft")n=tabs[(idx-1+tabs.length)%tabs.length];else if(e.key==="Home")n=tabs[0];else if(e.key==="End")n=tabs[tabs.length-1];else return;e.preventDefault();if(n)show(n,true);});})(tabs[j],j);}})();</script>`;

const COPY_SCRIPT = `<script>(function(){var bs=document.querySelectorAll("[data-copy-text]");for(var i=0;i<bs.length;i++){(function(b){b.addEventListener("click",function(){var t=b.getAttribute("data-copy-text")||"";var id=b.getAttribute("data-copy-id")||"";var ok=function(){var m=document.getElementById("copy-"+id+"-ok");var f=document.getElementById("copy-"+id+"-fallback");if(m)m.hidden=false;if(f)f.hidden=true;};var fail=function(){var m=document.getElementById("copy-"+id+"-ok");var f=document.getElementById("copy-"+id+"-fallback");var a=document.getElementById("copy-"+id+"-text");if(m)m.hidden=true;if(a)a.value=t;if(f)f.hidden=false;if(a){a.focus();a.select();}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fail);}else{fail();}});})(bs[i]);}})();</script>`;

/** Compact retained assistant-history block for the Connection page. Rendered
 * below the main copy/connect action so Copy MCP address stays above the
 * fold. Read-only: never writes, approves, counts or claims live status. */
function milestoneBlock(milestones?: AssistantMilestones): string {
  const note = `<p class="small muted">Saved history, not a live connection check</p>`;
  const meaning = `<details><summary>What this history means</summary><p class="small muted">Retained workspace history — not current connectivity or access. A recorded request means a permitted request reached this workspace; it is not proof of a named vendor identity. It is not proof the client received a reply, nor proof of work done outside Launchpad. Identifiers for receipts and reports stay hidden here. Full detail lives under <a href="/activity">Activity</a>.</p></details>`;
  const head = `<h2>Assistant history</h2>`;
  if (!milestones) return `<section class="card" aria-label="Assistant history">${head}<p class="small">No request recorded in retained history.</p>${note}${meaning}</section>`;
  if (milestones.synthetic) return `<section class="card" aria-label="Assistant history">${head}<p class="small">Synthetic sample workspace — sample data only. No real assistant request is recorded here.</p>${note}${meaning}</section>`;
  const last = milestones.lastContact
    ? `<p class="small">Last request received ${esc(fmtUtc(milestones.lastContact.at) ?? milestones.lastContact.at)}</p>`
    : `<p class="small">No request recorded in retained history.</p>`;
  const saved = milestones.firstSavedAssessment
    ? `<p class="small">Assessment saved ${esc(fmtUtc(milestones.firstSavedAssessment.at) ?? milestones.firstSavedAssessment.at)} · assistant judgment, not independently checked. <a href="/">Status</a> · <a href="/activity">Activity</a></p>`
    : "";
  return `<section class="card" aria-label="Assistant history">${head}${last}${saved}${note}${meaning}</section>`;
}

export function connectionBody(opts: { csrf: string; baseUrl: string; reportingEnabled: boolean; tokens: Record<string, unknown>[]; grants: Record<string, string>[]; candidates: Record<string, string>[]; milestones?: AssistantMilestones }): string {
  const csrf = esc(opts.csrf);
  const example = JSON.stringify({ report_id: "oct-assessment", expected_version: 3, assessment: { assessed_domains: ["money", "customers"], responsibilities: [{ id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "…", access: "…", success_criterion: "…", next_checkpoint: "…", reason: "short reason", evidence_refs: ["provider-object:123"] }], gaps: [], conclusion: "short conclusion", next_action: { title: "…", rationale: "…", uncertainty: "…", needs_owner: true } } }, null, 1);
  const endpoint = `${String(opts.baseUrl ?? "").replace(/\/+$/, "")}/mcp`;
  let parsed: URL | null = null;
  try { parsed = new URL(String(opts.baseUrl ?? "")); } catch { parsed = null; }
  const remoteReady = parsed !== null && parsed.protocol === "https:" && !isLocalOrPrivateHost(parsed.hostname);
  const pasteAddressStep = remoteReady ? "Paste the MCP address above." : "Once a public HTTPS address is configured, paste that address here — do not paste a localhost, loopback or private-network address into a cloud assistant.";
  const endpointBlock = remoteReady
    ? `<div class="endpoint">MCP address<br><code>${esc(endpoint)}</code></div>
${copyBlock("endpoint", "Copy MCP address", endpoint)}
<p class="small muted">HTTPS address configured. Compatibility with your assistant has not been verified.</p>`
    : `<div class="notice"><p><strong>Local setup pending.</strong></p><p class="small">A public HTTPS address is not configured yet, so a cloud assistant cannot use this page yet.</p></div>
<details><summary>Why, and local development</summary><p class="small muted">Do not paste a localhost, loopback, private-network or plain-http address into a cloud assistant. A secure tunnel could make a local server reachable, but no tunnel is configured here.</p><p class="small">Advanced: local development — for a local development client on this machine only: <code>${esc(endpoint)}</code></p></details>`;
  const grantRows = opts.grants.map((g) => {
    const state = grantState(g as Record<string, unknown>);
    return `<div class="row"><strong>${esc(grantClientName(g as Record<string, unknown>))}</strong><p>Return address: ${esc(grantOrigin(g as Record<string, unknown>))}<br>Permissions: ${esc(g.scopes)} · ${state}</p>${state === "Access approved" ? `<form method="post" action="/oauth/disconnect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="grant_id" value="${esc(g.id)}"><button class="secondary">Disconnect assistant</button></form>` : ""}</div>`;
  }).join("");
  const tokenRows = opts.tokens.map((t) => {
    const revoked = isFlagged(t.revoked);
    return `<div class="row"><code>${esc(t.id)}</code><br><span class="small muted">Scopes: ${esc(t.scopes)} · ${revoked ? "revoked" : "active"} · created ${esc(t.created_at)}${t.last_used_at ? ` · last used ${esc(t.last_used_at)}` : ""}</span>${revoked ? "" : `<form method="post" action="/tokens/revoke"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="token_id" value="${esc(t.id)}"><button type="submit" class="secondary">Revoke this token</button></form>`}</div>`;
  }).join("");
  return `<h1>Connection &amp; data</h1>
<section class="card" aria-label="Connect your assistant"><h2>Connect your assistant</h2>
<h3>1 · Copy the address</h3>
${endpointBlock}
<p class="small muted">Google sign-in identifies you; it does not connect your email or calendar, and it does not prove you may act for a company.</p>
<h3>2 · Add it in your assistant</h3>
<div class="tabs" role="tablist" aria-label="Assistant setup guides"><button type="button" role="tab" id="tab-claude" aria-selected="true" aria-controls="guide-claude" tabindex="0" data-guide-tab>Claude</button><button type="button" role="tab" id="tab-chatgpt" aria-selected="false" aria-controls="guide-chatgpt" tabindex="-1" data-guide-tab>ChatGPT (web)</button></div>
<div class="tabpanel" role="tabpanel" id="guide-claude" aria-labelledby="tab-claude">
<ol class="steps"><li>Open Customize → Connectors.</li><li>Choose Add custom connector.</li><li>${esc(pasteAddressStep)}</li><li>Sign in and review access before you approve it.</li></ol>
<p class="small"><a href="${CLAUDE_GUIDE}" rel="noopener noreferrer">Claude's official custom connector guide</a></p></div>
<div class="tabpanel" role="tabpanel" id="guide-chatgpt" aria-labelledby="tab-chatgpt" hidden>
<ol class="steps"><li>Open Plugins and choose to add a custom MCP server.</li><li>${esc(pasteAddressStep)}</li><li>Complete the OAuth sign-in and review access.</li><li>Install it, then select it in chat.</li></ol>
<p class="small"><a href="${CHATGPT_GUIDE}" rel="noopener noreferrer">OpenAI's official custom MCP server guide</a></p></div>
<details><summary>Connection details</summary><p class="small muted">Screens and account availability vary by plan, account, language and rollout. Follow the official guide for your account; nothing here promises plan eligibility or requires a purchase. Review the requested permissions (scopes) during OAuth before you approve access.</p></details>
<h3>3 · Send your first request</h3>
<div class="quote"><p>${esc(FIRST_REQUEST)}</p></div>
${copyBlock("first-request", "Copy first request", FIRST_REQUEST)}
<p class="small muted">Paste this into your assistant once it can use Launchpad. Copying it does not run the request.</p>
${GUIDE_SCRIPT}
${COPY_SCRIPT}
</section>
${milestoneBlock(opts.milestones)}
<section class="card" aria-label="Assistant access"><h2>Assistant access</h2>
<p class="small muted">An approved grant is permission only; it is not evidence of a completed assistant task.</p>
${grantRows || "<p>No assistant access approved yet.</p>"}
<details><summary>Advanced: manual tokens</summary><p class="small muted">Development only — for clients that send a custom authorization header. Tokens are shown once at issue time and never on this page.</p>
<form method="post" action="/tokens"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Issue assistant token (read + report)</button></form>
${tokenRows || "<p class=\"muted\">No tokens yet.</p>"}</details>
</section>
<section class="card"><h2>Progress sharing permission</h2>
<p>Currently: <strong>${opts.reportingEnabled ? "on" : "off (the default)"}</strong>.</p>
<p class="small">Read access and saved reports are separate: reading shows your saved progress; sharing lets your assistant <em>save</em> concise updates and its assessment here.</p>
<form method="post" action="/reporting"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="enabled" value="${opts.reportingEnabled ? "0" : "1"}"><button type="submit">${opts.reportingEnabled ? "Stop progress sharing" : "Allow progress sharing"}</button></form>
<details><summary>How sharing works</summary>
<p class="small muted">One grant covers both things your assistant may save here: concise task updates and its business assessment (classifications, short reasons, gaps, one next action). Launchpad does not receive your conversations; it stores only what your assistant sends it, including the exact text of approval requests. This permission never approves business actions.</p>
<p class="small muted">Turning sharing off blocks your assistant from saving reports here; it does not remove read access you already approved to your saved progress.</p>
<p class="small muted">Your assistant's assessment is its own judgment, and Launchpad adds no review step. Nothing on this page updates by itself: a report appears only when your assistant saves one while sharing is on. No manual ratification is required.</p>
<p class="small muted">Stopping does not stop a provider's own scheduled jobs, and disconnecting Launchpad does not revoke direct assistant/provider connections.</p>
<p class="small muted">Up to 500 reports are retained until you delete progress; new reports are then refused. Export or delete below at any time. Stopping is enforced on the server for every write, including service nominations.</p></details>
<details><summary>See exactly what one report contains</summary><pre>${esc(example)}</pre></details></section>
<section class="card"><h2>Your service nominations</h2>
<p class="muted">Services your assistant nominated. They are private to your workspace and wait for human moderation — never auto-published.</p>
${opts.candidates.map((c) => `<div class="row"><strong>${esc(c.name)}</strong> <span class="pill">${esc(c.status)}</span><br><span class="small muted">${esc(c.connection)} · ${esc(c.jobs)} · ${esc(c.created_at)}</span><form method="post" action="/candidates/delete"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="candidate_id" value="${esc(c.id)}"><button type="submit" class="secondary">Delete this nomination</button></form></div>`).join("") || "<p class=\"muted\">None yet.</p>"}
</section>
<section class="card"><h2>Your minimal data</h2>
<p>Launchpad stores your assessments, task reports, activity, service nominations and tokens. It also stores the exact text of every approval request your assistant asks you to approve (up to 4,000 characters each, with the recipient's address, amounts and figures) and the de-identified text of requests your assistant could not do, until you delete your progress. It never receives your conversations. Deleting also revokes tokens and signs out other sessions, so old queued reports cannot recreate it. It does not delete any provider's records.</p>
<p><a class="btn secondary" href="/export">Export my progress (JSON)</a></p>
<form method="post" action="/delete" onsubmit="return confirm('Delete your Launchpad progress?')"><input type="hidden" name="csrf" value="${csrf}"><button type="submit" class="danger">Delete my progress</button></form></section>`;
}

export function tokenOnceBody(raw: string): string {
  return `<section class="card hero"><h1>Your new assistant token</h1>
<p>Shown <strong>once</strong> — copy it now into your MCP client's Authorization header. It is never put in a URL and cannot be shown again; revoke and re-issue if you lose it.</p>
<pre>${esc(raw)}</pre>
<p><a class="btn" href="/connection">Back to Connection</a></p></section>`;
}

// --- Approvals (#18, ux2 change 4): the assistant did the work; the owner's part is one decision. ---
const KIND: Record<string, [string, string]> = { send_message: ["Sõnum", "Message"], send_invoice: ["Arve", "Invoice"], prepare_payment: ["Makse ettevalmistus", "Payment preparation"], prepare_filing: ["Deklaratsiooni ettevalmistus", "Filing preparation"] };
const CONTENT_HEAD: Record<string, [string, string]> = { send_message: ["Kiri, täpselt sellisena", "The message, exactly as it will go"], send_invoice: ["Arve, täpselt sellisena", "The invoice, exactly as it will go"], prepare_payment: ["Makse, täpselt sellisena", "The payment, exactly as prepared"], prepare_filing: ["Deklaratsioon, täpselt sellisena", "The filing, exactly as prepared"] };
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
  return { p, recipient, noAddress: approvalAddressMissing(a), kindKey, kind, title: p.document?.title ?? p.document_ref ?? kind, amount: typeof p.amount_cents === "number" ? fmtEur(p.amount_cents, l) : null, outcome, history: outcome?.history ?? (outcome ? [outcome] : []) };
}
/** Per-outcome receipt words: [state-chip kind, ET, EN]. */
const OUTCOME: Record<string, [string, string, string]> = { sent: ["sent", "Saadetud", "Sent"], submitted: ["sent", "Esitatud", "Submitted"], accepted: ["accepted", "Vastu võetud", "Accepted"], rejected: ["rejected", "Tagasi lükatud", "Rejected"], paid: ["paid", "Makstud", "Paid"], failed: ["rejected", "Ei õnnestunud", "Failed"] };
const outcomeChip = (o: string, l: Lang, sample: boolean) => { const [k, et, en] = OUTCOME[o] ?? ["drafted", o, o]; const demo = sample && o !== "failed"; return stateChip(k, demo ? tr(l)(`${et}: demo`, `${en}: demo`) : tr(l)(et, en), demo); };

function stateLine(a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang, sample: boolean): string {
  const t = tr(l), seen = (o: string) => v.history.find((h) => h.outcome === o);
  const act: [string, string, string] = v.kindKey === "prepare_payment" ? ["paid", "Makstud", "Paid"] : v.kindKey === "prepare_filing" ? ["submitted", "Esitatud", "Submitted"] : ["sent", "Saadetud", "Sent"];
  const follow: [string, string, string] | null = v.kindKey === "prepare_filing" ? ["accepted", "Vastu võetud", "Accepted"] : v.kindKey === "prepare_payment" ? null : ["paid", "Makstud", "Paid"];
  const steps: { cls: string; mark: string; text: string; note?: string }[] = [
    { cls: "done", mark: "✓", text: t("Koostatud", "Drafted"), note: `${t("Assistent", "Your assistant")} · ${fmtWhen(a.created_at, l)}` },
  ];
  const decided = !!a.decided_at && a.state !== "declined";
  steps.push(decided ? { cls: "done", mark: "✓", text: t("Kinnitatud", "Approved"), note: `${a.approved_by_rule ? t("Püsiluba", "Standing approval") : t("Sina", "You")} · ${fmtWhen(a.decided_at, l)}` } : { cls: "todo", mark: "", text: t("Kinnitatud: ootab sind", "Approved: waiting for you") });
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
function approvalFacts(v: ReturnType<typeof approvalView>, l: Lang): string {
  const t = tr(l);
  const row = (k: string, val: string | null | undefined, sub?: string | null, cls = "") => val ? `<div class="fact-row${cls}"><dt>${esc(k)}</dt><dd>${esc(val)}${sub ? `<span class="fact-sub">${esc(sub)}</span>` : ""}</dd></div>` : "";
  return `<dl class="facts">${row(t("Saaja", "To"), v.recipient.name, v.noAddress ? NO_ADDRESS(l) : v.recipient.address)}${row(t("Summa", "Amount"), v.amount, null, " fact-row--amount")}${row(t("Periood", "Period"), v.p.period ? fmtPeriod(v.p.period, l) : null)}</dl>`;
}

function handoffBox(kindKey: string, l: Lang): string {
  const t = tr(l), me = t("Sina", "You"), ai = t("Assistent", "Your assistant");
  if (kindKey === "prepare_payment") return `<dl class="handoff"><dt>${ai}</dt><dd>${t("valmistab makse ette", "prepares the payment")}</dd><dt class="me">${me}</dt><dd>${t("maksad oma pangas", "pay in your bank")}</dd></dl>`;
  if (kindKey === "prepare_filing") return `<dl class="handoff"><dt>${ai}</dt><dd>${t("valmistab ette", "prepares it")}</dd><dt class="me">${me}</dt><dd>${t("esitad e-MTA-s", "file it in e-MTA")}</dd></dl>`;
  return `<dl class="handoff"><dt class="me">${me}</dt><dd>${t("kontrollid ja kinnitad, ainult see", "check and approve, nothing else")}</dd><dt>${ai}</dt><dd>${t("saadab selle oma tööriistadega ja annab siia tulemuse teada", "sends it with its own tools and reports the result here")}</dd></dl>`;
}

// --- Standing approvals (#45): the owner sets a rule once; matching sends need no new tap. ---
const ruleChip = (l: Lang) => labelChip("owner", tr(l)("Püsiloaga", "Standing approval"));
const ruleOf = (a: ApprovalRow, rules: StandingRule[] = []) => a.approved_by_rule ? rules.find((r) => r.id === a.approved_by_rule) ?? null : null;
const ruleTitle = (a: ApprovalRow, rules: StandingRule[] | undefined, l: Lang) => { const r = ruleOf(a, rules); return r ? standingRuleName(r, l) : tr(l)("püsiluba", "standing approval"); };
const ruleLive = (r: StandingRule, now: Date) => !r.revoked_at && Date.parse(r.expires_at) > now.getTime();
const csrfInput = (csrf: string) => `<input type="hidden" name="csrf" value="${esc(csrf)}">`;
const capEur = (cents: number) => (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100));
const ruleLimits = (l: Lang) => tr(l)(`Kuni ${STANDING_DEFAULTS.maxPerDay} päevas · kehtib ${STANDING_DEFAULTS.days} päeva · saad igal ajal lõpetada`, `Up to ${STANDING_DEFAULTS.maxPerDay} a day · valid ${STANDING_DEFAULTS.days} days · end it any time`);
/** Offer on an approved send: approve similar ones automatically from now on (or say a rule already does). */
function standingOffer(a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang, csrf: string, rules: StandingRule[], now: Date): string {
  if (a.approved_by_rule || !STANDING_KINDS.includes(v.kindKey) || v.noAddress || !v.recipient.address) return "";
  const t = tr(l), address = normAddress(v.recipient.address), amount = typeof v.p.amount_cents === "number" ? v.p.amount_cents : 0;
  const covering = rules.find((r) => ruleLive(r, now) && r.kind === v.kindKey && r.max_amount_cents >= amount && (standingRecipients(r)?.includes(address) ?? true));
  if (covering) return `<div class="note" id="pusiluba" role="status"><p><strong><span aria-hidden="true">✓ </span>${t("Püsiluba on olemas", "Standing approval is on")}: ${esc(standingRuleName(covering, l))}.</strong></p><p class="small">${t("Järgmised sarnased saadab assistent ilma sinult küsimata.", "Your assistant sends similar ones without asking you.")} <a href="/uhenda#pusiload">${t("Püsiload", "Standing approvals")}</a></p></div>`;
  const cap = Math.max(STANDING_DEFAULTS.maxAmountCents, amount);
  return `<section class="standing-offer" id="pusiluba" aria-labelledby="so-h"><h2 id="so-h">${t("Luba edaspidi sarnased automaatselt", "Allow similar ones automatically from now on")}</h2>
<p class="small">${t("Siis ei pea assistent sinult iga kord küsima. Deklaratsioone ja makseid kinnitad alati ise.", "Then your assistant does not have to ask you every time. You always confirm filings and payments yourself.")}</p>
<form method="post" action="/standing-approvals">${csrfInput(csrf)}<input type="hidden" name="approval_id" value="${esc(a.id)}">
<div role="radiogroup" aria-label="${t("Kellele", "To whom")}"><label class="check"><input type="radio" name="scope" value="recipient" checked> <span>${esc(t(`Ainult ${v.recipient.name ?? address}`, `Only ${v.recipient.name ?? address}`))} <span class="small muted">${esc(v.recipient.address)}</span></span></label>
<label class="check"><input type="radio" name="scope" value="any"> <span>${t("Kõik saajad (ka uued)", "Any recipient (including new ones)")}</span></label></div>
<label for="so-max">${t("Summa ülempiir (€)", "Amount cap (€)")}</label><input id="so-max" name="max_eur" inputmode="decimal" autocomplete="off" value="${esc(capEur(cap))}">
<p class="small muted">${esc(ruleLimits(l))}</p>
<button type="submit">${t("Luba automaatselt", "Allow automatically")}</button></form></section>`;
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

const approvalTech = (a: ApprovalRow, v: ReturnType<typeof approvalView>, l: Lang) => techDetails(l, `${techList([[tr(l)("Räsi (SHA-256)", "Digest (SHA-256)"), a.digest], [tr(l)("Liik", "Kind"), v.kindKey || "—"], ["ID", a.id], [tr(l)("Koostatud", "Created"), a.created_at], [tr(l)("Kehtib kuni", "Valid until"), a.expires_at], ...(a.decided_at ? [[tr(l)("Otsustatud", "Decided"), a.decided_at]] as [string, string][] : [])])}<pre class="tech-pre">${esc(JSON.stringify({ action: v.p, outcome: v.outcome }, null, 1))}</pre>`);

export function approvalCardBody(opts: { csrf: string; a: ApprovalRow; lang: Lang; sample: boolean; now?: Date; rules?: StandingRule[] }): string {
  const { a, lang: l, sample } = opts, t = tr(l), v = approvalView(a, l), now = opts.now ?? new Date(), rules = opts.rules ?? [];
  const content = v.p.document?.content ? `<h2>${esc(t(...(CONTENT_HEAD[v.kindKey] ?? CONTENT_HEAD.send_message)))}</h2><pre class="letter" tabindex="0">${esc(v.p.document.content)}</pre>` : "";
  const back = `<a class="btn secondary" href="/">${t("Tagasi: Täna", "Back: Today")}</a>`;
  const sampleC = sample ? sampleChip(l) : "";
  if (a.state === "pending") {
    return `<article class="card" aria-labelledby="a-h">
<div class="labels">${stateChip("waiting", t("Ootab sinu kinnitust", "Waiting for your approval"))}${labelChip("assistant", v.kind)}${sampleC}</div>
<p class="small muted">${t("Assistent valmistas ette", "Prepared by your assistant")} · ${timeEl(a.created_at, fmtWhen(a.created_at, l, now))}</p>
<h1 id="a-h">${esc(v.title)}</h1>
${v.p.summary ? `<p><strong>${t("Miks:", "Why:")}</strong> ${esc(v.p.summary)}</p>` : ""}
${approvalFacts(v, l)}
${content}
${handoffBox(v.kindKey, l)}
<form method="post" action="/approvals/${esc(encodeURIComponent(a.id))}/decide"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><input type="hidden" name="digest" value="${esc(a.digest)}">
${v.noAddress ? `<div class="notice" role="alert"><p><strong>${esc(NO_ADDRESS(l))}.</strong> ${t("Assistent ei märkinud, kuhu see läheb. Keeldu ja palu assistendil küsida uus kinnitus koos saaja aadressiga.", "Your assistant did not say where this goes. Decline it and ask your assistant for a new approval with the recipient's address.")}</p></div>` : `<button name="decision" value="approve">${t("Kinnita täpselt see", "Approve exactly this")}</button>`}<button class="secondary" name="decision" value="decline">${t("Keeldu", "Decline")}</button></form>
<p class="small muted">${esc(t(`Kui assistent muudab midagi, küsib ta uue kinnituse. Kehtib 24 tundi, kuni ${fmtUntil(a.expires_at, l, now)}.`, `If your assistant changes anything, it asks again. Valid for 24 hours, until ${fmtUntil(a.expires_at, l, now)}.`))}</p>
<p class="small muted">${t("AI-hüppelaud ise ei saada, maksa ega esita midagi; seda teeb sinu assistent oma tööriistadega ja ainult täpselt selle sisuga.", "AI Launchpad itself never sends, pays or files; your assistant does this with its own tools, and only with exactly this content.")}${sample ? ` ${t("Näidis: päriselt ei saadeta.", "Sample: nothing is really sent.")}` : ""}</p>
${approvalTech(a, v, l)}
</article>
<p><a class="tap-link" href="/approvals">${t("Kõik kinnitused", "All approvals")}</a></p>`;
  }
  if (a.state === "approved" && a.approved_by_rule) {
    return `<article class="card" aria-labelledby="a-h">
<div class="labels">${ruleChip(l)}${sampleC}</div>
<h1 class="receipt-head" id="a-h"><span aria-hidden="true">✓ </span>${t("Kinnitatud püsiloaga", "Approved by standing approval")} ${esc(fmtWhen(a.decided_at, l, now).replace(/^(täna|today), /, ""))}</h1>
<p role="status"><strong>${t("Kinnitatud püsiloaga", "Approved by your standing approval")} „${esc(ruleTitle(a, rules, l))}”.</strong> ${esc(v.title)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}${v.amount ? ` · ${esc(v.amount)}` : ""}</p>
<p class="small">${t("Assistent ei pidanud sinult küsima: ta saadab selle ise ja annab siia tulemuse teada.", "Your assistant did not have to ask you: it sends this itself and reports the result here.")} <a href="/uhenda#pusiload">${t("Püsiload", "Standing approvals")}</a></p>
${stateLine(a, v, l, sample)}
${approvalFacts(v, l)}
${content}
${approvalTech(a, v, l)}
${back}
</article>`;
  }
  if (a.state === "approved") {
    return `<article class="card" aria-labelledby="a-h">
<div class="labels">${labelChip("owner", t("Sinu kinnitus", "You approved"))}${sampleC}</div>
<h1 class="receipt-head" id="a-h"><span aria-hidden="true">✓ </span>${t("Kinnitatud", "Approved")} ${esc(fmtWhen(a.decided_at, l, now).replace(/^(täna|today), /, ""))}</h1>
<p role="status"><strong>${t("Nüüd on assistendi kord.", "Now it's your assistant's turn.")}</strong> ${esc(v.title)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}${v.amount ? ` · ${esc(v.amount)}` : ""}</p>
<div class="notice"><p><strong>${t("Mine tagasi ChatGPT-sse või Claude'i ja kirjuta „<code>Kinnitasin</code>”.", "Go back to ChatGPT or Claude and write “<code>Approved</code>” (“Kinnitasin” works too).")}</strong></p><p class="small">${t("Assistent näeb sinu kinnitust alles siis, kui talle kirjutad.", "Your assistant only sees your approval when you write to it.")}</p></div>
${standingOffer(a, v, l, opts.csrf, rules, now)}
${stateLine(a, v, l, sample)}
<p class="small muted">${esc(t(`Kui assistent ei teata tulemusest ${fmtUntil(a.expires_at, l, now)}, kinnitus aegub ja ta peab uuesti küsima.`, `If your assistant does not report an outcome by ${fmtUntil(a.expires_at, l, now)}, the approval expires and it must ask again.`))}</p>
${approvalTech(a, v, l)}
${back}
</article>`;
  }
  if (a.state === "consumed" && v.outcome) {
    const last = v.outcome.outcome, ok = last !== "failed" && last !== "rejected";
    const head = ok ? `<span aria-hidden="true">✓ </span>${esc(t(OUTCOME[last]?.[1] ?? last, OUTCOME[last]?.[2] ?? last))}${sample ? ": demo" : ""}` : esc(t(OUTCOME[last]?.[1] ?? last, OUTCOME[last]?.[2] ?? last));
    return `<article class="card" aria-labelledby="a-h">
<div class="labels">${outcomeChip(last, l, sample)}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}${a.approved_by_rule ? ruleChip(l) : ""}${sampleC}</div>
<h1 class="receipt-head" id="a-h">${head}</h1>
<p>${[v.recipient.name, v.amount].filter(Boolean).map(esc).join(" · ")}${v.recipient.name || v.amount ? " · " : ""}${esc(v.title)}</p>
${a.approved_by_rule ? `<p class="small"><strong>${t("Kinnitatud püsiloaga", "Approved by your standing approval")} „${esc(ruleTitle(a, rules, l))}”.</strong></p>` : ""}
<p class="small"><strong>${esc(t(`Sinu kinnitusi selles töös: ${a.decided_at && !a.approved_by_rule ? 1 : 0}.`, `Your approvals in this job: ${a.decided_at && !a.approved_by_rule ? 1 : 0}.`))}</strong> ${t("Töö tegi assistent; tulemus on tema teade, AI-hüppelaud seda ei kontrollinud.", "Your assistant did the work; the result is its report, not checked by AI Launchpad.")}</p>
${stateLine(a, v, l, sample)}
${content ? `<details><summary>${t("Mida sa kinnitasid", "What you approved")}</summary>${approvalFacts(v, l)}${content}</details>` : ""}
${approvalTech(a, v, l)}
${back}
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
  return `<article class="card" aria-labelledby="a-h">
<div class="labels">${status}${labelChip("assistant", v.kind)}${sampleC}</div>
<h1 id="a-h">${esc(v.title)}</h1>
<p role="status">${esc(line)}</p>
${approvalFacts(v, l)}
${content}
${approvalTech(a, v, l)}
${back}
</article>`;
}

/** Pending approval as a whole-row link (Täna, approvals list). */
function approvalLinkRow(a: ApprovalRow, l: Lang, now: Date, sample: boolean): string {
  const t = tr(l), v = approvalView(a, l);
  const sub = [v.amount, a.state === "pending" ? t(`kehtib kuni ${fmtUntil(a.expires_at, l, now)}`, `valid until ${fmtUntil(a.expires_at, l, now)}`) : fmtWhen(a.decided_at ?? a.created_at, l, now)].filter(Boolean).join(" · ");
  const chip = a.state === "pending" ? stateChip("waiting", t("Ootab sinu kinnitust", "Waiting for your approval"))
    : a.state === "consumed" && v.outcome ? outcomeChip(v.outcome.outcome, l, sample)
    : a.state === "approved" ? stateChip("approved", t("Kinnitatud", "Approved"))
    : a.state === "declined" ? stateChip("rejected", t("Keeldusid", "Declined"))
    : stateChip("void", t("Aegunud", "Expired"));
  return `<a class="link-row" href="/approvals/${esc(encodeURIComponent(a.id))}"><span><span class="labels">${chip}${a.approved_by_rule ? ruleChip(l) : ""}</span><span class="link-row-title">${esc(v.title)}${v.recipient.name ? ` · ${esc(v.recipient.name)}` : ""}</span><span class="small muted">${esc(sub)}</span></span></a>`;
}

export function approvalsListBody(rows: ApprovalRow[], l: Lang, sample: boolean, now = new Date()): string {
  const t = tr(l), pending = rows.filter((a) => a.state === "pending"), history = rows.filter((a) => a.state !== "pending");
  return `<h1>${t("Kinnitused", "Approvals")}</h1><p class="lede">${t("Tööd, mille jaoks sinu assistent küsis sinu kinnitust. AI-hüppelaud ise ei saada, maksa ega esita midagi.", "Work your assistant asked you to approve. AI Launchpad itself never sends, pays or files.")}</p>
<section class="card" aria-labelledby="ap-w"><h2 id="ap-w">${t("Ootab sinult", "Needs you")} (${pending.length})</h2>${pending.map((a) => approvalLinkRow(a, l, now, sample)).join("") || `<p class="muted">${t("Praegu ei oota sinult midagi.", "Nothing is waiting for you right now.")}</p>`}</section>
<section class="card" aria-labelledby="ap-h"><h2 id="ap-h">${t("Ajalugu", "History")}</h2>${history.map((a) => approvalLinkRow(a, l, now, sample)).join("") || `<p class="muted">${t("Otsustatud kinnitusi veel pole.", "No decided approvals yet.")}</p>`}</section>`;
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

export interface ServiceView { name: string; jobs: string; interface_class: string; evidence_status: string; limitations: string; connection: string; connection_url: string | null; access_and_price: string; checked_on: string; sources: string[]; }
export function servicesBody(opts: { q: string; total: number; results: ServiceView[] }): string {
  return `<h1>Service catalog</h1>
<p class="lede">${opts.total} researched records. Connect a service inside your own assistant — Launchpad does not fetch or broker these connections.</p>
<div class="note"><p class="small"><strong>None were runtime-tested by Launchpad;</strong> treat them as documented leads and check each entry's checked date.</p></div>
<form method="get" role="search"><label>Search <input name="q" value="${esc(opts.q)}" maxlength="120"></label><button type="submit">Search</button></form>
${opts.results.map((r) => `<section class="card"><h2>${esc(r.name)}</h2><p>${esc(r.jobs)}</p>
<p class="small">Interface: ${esc(r.interface_class)} · Evidence: ${esc(r.evidence_status)} · Checked: ${esc(r.checked_on)} · Runtime verified: no</p>
<p class="small">Connection: ${r.connection_url ? `<a href="${esc(r.connection_url)}" rel="noopener noreferrer">${esc(r.connection)}</a>` : esc(r.connection)}${r.access_and_price ? `<br>Access &amp; price: ${esc(r.access_and_price)}` : ""}</p>
${r.sources.length ? `<p class="small">Primary sources: ${r.sources.map((s) => `<a href="${esc(s)}" rel="noopener noreferrer">${esc(s)}</a>`).join(" · ")}</p>` : ""}
<p class="small muted">${esc(r.limitations)}</p></section>`).join("")}`;
}

export function playbooksBody(items: { title: string; summary: string; source: string; source_label: string }[], frictionCards?: (PublicCardViewOpts & { label: string })[]): string {
  const shown = (frictionCards ?? []).filter((c) => c.state !== "none");
  const friction = frictionCards === undefined ? "" : `<section class="card" aria-label="Manual-work suggestions"><h2>Manual-work suggestions</h2><p class="small muted">General Meta/Baseten suggestions for common manual work. They are not an assessment of your company; opening this page never calls a model.</p>${shown.length ? shown.map((c) => `<div class="row"><strong>${esc(c.label)}</strong> <span class="pill">${esc(c.locale)}</span>${c.state === "completed" && c.output ? `<p>${esc(c.output)}</p><p class="small muted">Saved guidance. Nothing was filed, sent, paid or verified from it.</p>` : `<p class="small muted">${esc(PUBLIC_CARD_STATE_TEXT[c.state] ?? "This suggestion is unavailable.")}</p>`}</div>`).join("") : `<p class="small muted">No manual-work suggestion has been prepared yet.</p>`}</section>`;
  return `<h1>Playbooks</h1><p class="lede">Short guides, each tied to its official source. Not legal or tax advice.</p>${friction}${items.map((p) => `<section class="card"><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p><p class="small">Official source: <a href="${esc(p.source)}" rel="noopener noreferrer">${esc(p.source_label)}</a>. Always check the source for current dates and rules; this page is not legal or tax advice.</p></section>`).join("")}`;
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
  return `<section class="card" id="soovid" aria-labelledby="soovid-h"><h2 id="soovid-h">${t("Seda ei saa assistent sinu eest teha", "Your assistant can't do this for you")}</h2>
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
</section>`;
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

function deadlineRow(o: Obligation, l: Lang, opts: { now: Date; prompts: boolean }): string {
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
  return `<li class="deadline-row">${tile}
<div><h3 class="deadline-title">${o.kind === "risk" && cond ? t("Võimalik: ", "Possible: ") : ""}${esc(t(o.title_et, o.title_en))} · ${esc(t(o.period_label_et, o.period_label_en))}</h3>
${cond ? `<p class="deadline-cond"><strong>${esc(cond)}</strong></p>` : ""}<p class="deadline-reason">${lead ? `<strong>${esc(lead)}</strong> ` : ""}${reason !== cond ? esc(reason) : ""}${esc(shifted)}</p>
<div class="deadline-meta">${labelChip("rule", t("Arvutatud reeglist", "Calculated by rule"))}<a class="tap-link" href="${esc(o.source.url)}" rel="noopener noreferrer"><span>${t("Allikas", "Source")}: <span lang="et">${esc(o.source.act_et)} ${esc(o.source.section)}</span><span aria-hidden="true">&nbsp;↗</span></span></a></div></div>
<div class="deadline-offer">${qualify ? `<p class="small"><strong>${qualify.slice(0, -2)}</strong></p>` : ""}<dl class="handoff"><dt>${t("Assistent", "Your assistant")}</dt><dd>${esc(t(h.assistant_et, h.assistant_en))}</dd><dt class="me">${t("Sina", "You")}</dt><dd>${esc(t(h.owner_et, h.owner_en))}</dd></dl>
${o.rule_id === "vat-return-kmd" ? `<p class="small muted">${t("Summad arvutab sinu raamatupidamisprogramm, mitte tehisaru.", "Your accounting software calculates the amounts, not AI.")}</p>` : ""}
${opts.prompts ? `<div class="quote"><p class="small"><span class="muted">${t("Palu assistendilt:", "Ask your assistant:")}</span> „${esc(qualify + t(h.prompt_et, h.prompt_en))}”</p></div>` : ""}</div></li>`;
}

export function deadlinesList(r: DeadlinesView, l: Lang, opts: { now?: Date; prompts?: boolean } = {}): string {
  const now = opts.now ?? new Date();
  if (!r.obligations.length) return `<p class="muted">${tr(l)("Selles vahemikus tähtaegu pole.", "No deadlines in this period.")}</p>`;
  return `<ul class="deadlines">${r.obligations.map((o) => deadlineRow(o, l, { now, prompts: !!opts.prompts })).join("")}</ul>`;
}

/** Which rule a missing fact can change: a question is shown only when it can change a row on screen. */
const FACT_RULE: Record<string, string> = { vat_registered: "vat-return-kmd", payouts_last_month: "tsd-monthly-return", other_tsd_triggers_last_month: "tsd-monthly-return", fy_end: "annual-report", annual_report: "annual-report", ytd_turnover_this_year: "vat-registration-threshold" };
function questions(r: DeadlinesView, l: Lang): { q: string; then: string }[] {
  const t = tr(l);
  return r.facts_needed.filter((f) => r.obligations.some((o) => o.rule_id.startsWith(FACT_RULE[f.fact] ?? "\u0000") && (!f.period_label_et || o.period_label_et === f.period_label_et))).map((f) => {
    // The TSD row for the same payout period; it goes away only when payouts and other triggers are both "no".
    const tsd = f.period_label_et ? r.obligations.find((o) => o.rule_id === "tsd-monthly-return" && o.period_label_et === f.period_label_et && o.effective_due) : undefined;
    const d = tsd?.effective_due ? civil(tsd.effective_due) : null;
    return { q: t(f.question_et, f.question_en), then: d ? t(`Kui ei maksnud ega olnud töötajat, kaob ${d.getUTCDate()}. ${ET_OF[d.getUTCMonth()]} TSD rida.`, `If you made no payouts and had no employee, the ${C_DAY_MON.en.format(d)} TSD row goes away.`) : "" };
  });
}

function companyCard(c: DeadlinesView["company"], l: Lang): string {
  const t = tr(l);
  const chip = c.synthetic ? `${sampleChip(l)}<span class="small muted">${t("väljamõeldud ettevõte", "made-up company")}</span>` : c.provenance === "public_register" ? labelChip("official", t(c.label_et, c.label_en)) : labelChip("assistant", t(c.label_et, c.label_en));
  return `<section class="card" aria-labelledby="co-h"><h2 id="co-h">${esc(c.name ?? t("Ettevõte", "Company"))}</h2>
<dl class="facts facts--stacked"><div class="fact-row"><dt>${t("Registrikood", "Registry code")}</dt><dd>${esc(c.registry_code)}</dd></div></dl>
<div class="labels">${chip}</div>${c.attribution && !c.synthetic ? `<p class="small muted">${esc(c.attribution)}</p>` : ""}</section>`;
}

// --- Public landing (spec screen 1, ux2 change 2) ---
export type LandingState =
  | { kind: "empty" }
  | { kind: "result"; result: DeadlinesView }
  | { kind: "choose"; matches: CompanyMatch[] }
  | { kind: "message"; code: LandingMessage };
export type LandingMessage = "not_configured" | "invalid_code" | "not_found" | "unavailable" | "no_match" | "ip_limit" | "day_limit";
const LANDING_MSG: Record<LandingMessage, [string, string]> = {
  not_configured: ["Avaliku registri päring pole veel seadistatud — proovi näidisettevõtet „Mari Disain”.", "Public-register lookup is not configured yet — try the sample company “Mari Disain”."],
  invalid_code: ["See ei ole kehtiv Eesti registrikood (8 numbrit, õige kontrollnumbriga). Kontrolli koodi.", "This is not a valid Estonian registry code (8 digits with a valid check digit). Check the code."],
  not_found: ["Avalikus registris sellise koodiga ettevõtet ei ole.", "The public register has no company with this code."],
  unavailable: ["Avalik register ei vastanud. Proovi hiljem uuesti. Midagi ei arvutatud.", "The public register did not answer. Try again later. Nothing was calculated."],
  no_match: ["Ei leidnud. Proovi registrikoodiga.", "Not found. Try the registry code."],
  ip_limit: ["Sellelt aadressilt on viimase 10 minuti jooksul tehtud liiga palju registripäringuid (piir 30). Proovi mõne minuti pärast uuesti. Näidisettevõte „Mari Disain” töötab alati.", "Too many register lookups from this address in the last 10 minutes (limit 30). Try again in a few minutes. The sample company “Mari Disain” always works."],
  day_limit: ["Tänane avalike registripäringute piir (500) on täis. Proovi homme uuesti. Näidisettevõte „Mari Disain” töötab alati.", "Today's limit of public register lookups (500) is used up. Try again tomorrow. The sample company “Mari Disain” always works."],
};

export function landingBody(o: { lang: Lang; q: string; state: LandingState; now?: Date }): string {
  const l = o.lang, t = tr(l), now = o.now ?? new Date();
  const sampleLink = `<a class="tap-link" href="/?q=${encodeURIComponent("Mari Disain")}">${t("Proovi näidisettevõttega: Mari Disain", "Try the sample company: Mari Disain")}</a>`;
  const form = `<form class="search" method="get" action="/" role="search"><label>${t("Ettevõtte nimi või registrikood", "Company name or registry code")}<input name="q" value="${esc(o.q)}" maxlength="120" autocomplete="organization" placeholder="${t("nt Mari Disain või 1xxxxxxx", "e.g. Mari Disain or 1xxxxxxx")}"></label><button type="submit">${t("Näita tähtaegu", "Show deadlines")}</button></form>`;
  let result = "";
  const s = o.state;
  if (s.kind === "message") result = `<section class="card" role="status"><p>${esc(t(...LANDING_MSG[s.code]))}</p>${s.code === "not_configured" || s.code === "ip_limit" || s.code === "day_limit" ? `<p>${sampleLink}</p>` : ""}</section>`;
  else if (s.kind === "choose") result = `<section class="card" aria-labelledby="ch-h"><h2 id="ch-h">${t("Vali ettevõte", "Choose the company")}</h2>${s.matches.map((m) => `<a class="link-row" href="/?q=${esc(encodeURIComponent(m.registry_code))}"><span><span class="link-row-title">${esc(m.name)}</span><span class="small muted">${esc(m.registry_code)}</span></span></a>`).join("")}</section>`;
  else if (s.kind === "result") {
    const qs = questions(s.result, l);
    result = `${companyCard(s.result.company, l)}
<section class="card" aria-labelledby="dl-h"><h2 id="dl-h">${t("Järgmised tähtajad", "Upcoming deadlines")}</h2>
${deadlinesList(s.result, l, { now })}
${qs.length ? `<h3>${t("Assistent küsiks sinult", "Your assistant would ask you")}</h3><ul class="tight">${qs.map((x) => `<li class="small">„${esc(x.q)}” ${esc(x.then)}</li>`).join("")}</ul>` : ""}
<p class="small"><strong>${t("Tähtajad arvutab reeglistik, mitte tehisaru.", "Deadlines are calculated by rules, not AI.")}</strong> ${t("Kuupäevad on arvutatud, mitte esitatud ega makstud. See ei ole õigus- ega maksunõu; kontrolli iga rea allikat.", "Dates are computed, not filed or paid. Not legal or tax advice; check each row's source.")}</p></section>
<section class="card" aria-labelledby="cta-h"><h2 id="cta-h">${t("Lase oma assistendil see töö enda peale võtta. Sina kinnitad ainult selle, mis sind seob.", "Let your assistant take this work on. You approve only what binds you.")}</h2>
<a class="btn" href="/uhenda">${t("Ühenda oma assistent", "Connect your assistant")}</a>
<p class="small muted">${t("Midagi ei esitata, maksta ega saadeta ilma sinu kinnituseta.", "Nothing is filed, paid or sent without your approval.")}</p></section>`;
  }
  return `<section class="card hero"><h1>${t("Sinu ettevõtte tähtajad ühe otsinguga", "Your company's deadlines in one search")}</h1>
<p class="lede">${t("Ei parooli, isikukoodi ega vormi. Loeme ainult avalikke registreid.", "No password, ID code or forms. We read public registers only.")}</p>
${form}${s.kind === "empty" ? `<p class="small">${sampleLink}</p>` : ""}</section>
${result}`;
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
  now?: Date;
}
/** The register lookup is unavailable: ask the assistant instead, with the plain reason. */
export const deadlinesHint = (l: Lang, reason: string, reasonLang: Lang = "en") => `<p class="small">${tr(l)("Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?”", "Deadlines: ask your assistant \"What are my deadlines?\"")} <span class="muted"${reasonLang !== l ? ` lang="${reasonLang}"` : ""}>${esc(reason)}</span></p>`;
const TRY_PROMPT: [string, string] = ["Mis mul sel kuul adminis ees on ja mida saad sa ise ära teha?", "What admin do I have this month, and what can you do yourself?"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function tanaBody(o: TanaOpts): string {
  const l = o.lang, t = tr(l), now = o.now ?? new Date(), a = o.assessment;
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
    ...pending.map((x) => approvalLinkRow(x, l, now, o.sample)),
    ...failed.map((x) => { const v = approvalView(x, l); return `<a class="link-row" href="/approvals/${esc(encodeURIComponent(x.id))}"><span><span class="labels">${stateChip("rejected", t("Ei õnnestunud — vaata üle", "Did not work — review it"))}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}</span><span class="link-row-title">${esc([v.title, v.recipient.name].filter(Boolean).join(" · "))}</span><span class="small muted">${esc(fmtWhen(v.outcome?.observed_at ?? x.consumed_at, l, now))}</span></span></a>`; }),
    ...qs.map((x) => `<div class="ask-row"><strong>${t("Vasta assistendile ühele küsimusele:", "Answer one question for your assistant:")}</strong><p class="small">„${esc(x.q)}” ${esc(x.then)}</p></div>`),
    // Rationale and any effort estimate are the assistant's words, labelled as such; never in the hero or the counts.
    ...(next ? [`<div class="ask-row"><strong>${t("Järgmine samm:", "Next step:")} ${esc(next.title)}</strong><p class="small"><span class="muted">${t("Assistendi hinnang:", "Your assistant's estimate:")}</span> ${esc([next.rationale, next.estimated_effort_saved?.trim()].filter(Boolean).join(" "))}</p><div class="quote"><p class="small"><span class="muted">${t("Palu assistendilt:", "Ask your assistant:")}</span> „${esc(t(`Järgmine samm minu AI-hüppelaua hinnangust: „${next.title}”. Miks: ${next.rationale} Palun aita mul see ära teha või ütle, mida sinult vaja on.`, `Next step from my AI Launchpad assessment: "${next.title}". Why: ${next.rationale} Please help me do this, or tell me what you need from me.`))}”</p></div></div>`] : []),
    // Unknowns stay in the main view (never only behind a disclosure); not counted as asks.
    ...(a && (o.coverage.unresolved || a.gaps.length) ? [`<div class="ask-row"><strong>${t("Assistent pole veel kõike hinnanud:", "Your assistant has not assessed everything yet:")}</strong><ul class="tight">${[...(o.coverage.unresolved ? [t(`${o.coverage.unresolved} kohustus(t) on veel lahtised`, `${o.coverage.unresolved} item(s) still unresolved`)] : []), ...a.gaps].map((g) => `<li class="small">${esc(g)}</li>`).join("")}</ul></div>`] : []),
    ...optional.map((x) => `<div class="ask-row"><a class="tap-link" href="#soov-${esc(x.id)}"><strong>${t("Valikuline:", "Optional:")}</strong> ${esc(needLabel(x, l) ?? x.need_redacted)}</a><p class="small muted">${t("Seda ei saa assistent sinu eest teha. Võid soovi anonüümselt avaldada.", "Your assistant can't do this for you. You may publish it anonymously.")}</p></div>`),
  ];

  // Assistent tegi: finished or prepared work only, never reads. Approved work still waiting for
  // the assistant's report is listed but not counted.
  const titleOf = (id: string) => a?.responsibilities.find((r) => r.id === id)?.label ?? id;
  const doneRows: string[] = [];
  let doneCount = 0;
  for (const x of o.approvals) {
    const v = approvalView(x, l);
    const who = v.recipient.name ? ` · ${esc(v.recipient.name)}` : "";
    if (x.state === "consumed" && v.outcome && ["sent", "paid", "submitted", "accepted"].includes(v.outcome.outcome)) {
      doneCount++;
      doneRows.push(`<div class="row"><a href="/approvals/${esc(encodeURIComponent(x.id))}"><strong>${esc(v.title)}${who}</strong></a><div class="labels">${outcomeChip(v.outcome.outcome, l, o.sample)}${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}${x.approved_by_rule ? ruleChip(l) : ""}</div><span class="small muted">${x.approved_by_rule ? esc(t(`Püsiloaga: ${ruleTitle(x, o.rules, l)}`, `Standing approval: ${ruleTitle(x, o.rules, l)}`)) : t("1 sinu kinnitus", "1 approval from you")} · ${timeEl(v.outcome.observed_at ?? x.consumed_at ?? x.created_at, fmtWhen(v.outcome.observed_at ?? x.consumed_at, l, now))}${v.amount ? ` · ${esc(v.amount)}` : ""}</span></div>`);
    } else if (x.state === "approved") {
      doneRows.push(`<div class="row"><a href="/approvals/${esc(encodeURIComponent(x.id))}"><strong>${esc(v.title)}${who}</strong></a><div class="labels">${x.approved_by_rule ? ruleChip(l) : ""}${stateChip("approved", t("Pooleli · ootab assistendi teadet", "In progress · waiting for your assistant's report"))}</div><span class="small muted">${x.approved_by_rule ? esc(t(`Püsiloaga: ${ruleTitle(x, o.rules, l)}`, `Standing approval: ${ruleTitle(x, o.rules, l)}`)) : t("Sinu kinnitus", "You approved")} · ${esc(fmtWhen(x.decided_at, l, now))}</span></div>`);
    }
  }
  for (const p of o.progress) {
    if (p.milestone !== "draft_prepared" && p.milestone !== "external_completion_reported") continue;
    const verb = p.milestone === "draft_prepared" ? t("Valmistas ette:", "Prepared:") : t("Teatas tehtuks:", "Reported done:");
    doneCount++;
    doneRows.push(`<div class="row"><strong>${verb} ${esc(titleOf(p.task_id))}</strong><div class="labels">${labelChip("assistant", t("Assistent teatas", "Your assistant reports"))}</div><span class="small muted">${esc(fmtWhen(p.observed_at, l, now))}</span></div>`);
  }
  const handled = (a?.responsibilities ?? []).filter(isHandled);
  const handledLine = handled.length ? `<p class="small muted">${handled.map((r) => esc(t(`Lisaks teeb ${r.executor}: ${r.label} (assistendi hinnang).`, `Also handled by ${r.executor}: ${r.label} (your assistant's assessment).`))).join(" ")}</p>` : "";

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

  const tulekul = deadlines ? deadlinesList(deadlines, l, { now, prompts: true })
    : o.deadlines === "not_cached" ? `<p class="muted">${t("Registri andmeid laaditakse. Värskenda lehte hetke pärast.", "Register facts are loading. Refresh the page in a moment.")}</p>`
    : o.deadlines === "invalid_code" ? deadlinesHint(l, t("Registrikood ei ole korrektne — palu assistendil see üle kontrollida.", "The registry code is not valid — ask your assistant to check it."), l)
    : o.deadlines === "not_found" ? deadlinesHint(l, t("Registrikoodiga ettevõtet registrist ei leitud — palu assistendil kood üle kontrollida.", "No company with this registry code in the register — ask your assistant to check the code."), l)
    : o.deadlines && "unavailable_reason" in o.deadlines ? deadlinesHint(l, o.deadlines.unavailable_reason)
    : `<p class="muted">${t(`Tähtajad ilmuvad siia, kui assistent teab sinu registrikoodi. Küsi temalt: „${TRY_PROMPT[0]}”`, `Deadlines appear here once your assistant knows your registry code. Ask it: “${TRY_PROMPT[1]}”`)}</p>`;

  const c = o.coverage;
  const how = `<details><summary>${t("Kuidas see kokku pandi", "How this was put together")}</summary>
<p class="small">${deadlines?.company.synthetic ? t("Tähtajad: reeglistik ja näidisandmed.", "Deadlines: rules and sample data.") : deadlines?.company.provenance === "public_register" ? t("Tähtajad: reeglistik ja avalikud avaandmed (Ärikratt).", "Deadlines: rules and public open data (Ärikratt).") : t("Tähtajad: reeglistik ja sinu assistendi teated.", "Deadlines: rules and your assistant's reports.")} ${esc(t(`Assistendi teated: ${o.reportCount}, AI-hüppelaud neid ei kontrollinud. Allikast kontrollitud tulemusi: ${c.independently_verified_outcomes}.`, `Assistant reports: ${o.reportCount}, not checked by AI Launchpad. Outcomes verified at the source: ${c.independently_verified_outcomes}.`))} ${t("Säästetud aega ei ole mõõdetud, seega me seda ei näita.", "Time saved is not measured, so we don't show it.")}</p>
${a ? `<p class="small">${esc(t(`Assistendi hinnangul on ${c.covered} kohustust ${c.denominator}-st kaardistatust korras${c.percent != null ? ` (${c.percent}%)` : ""}.`, `Your assistant assesses ${c.covered} of ${c.denominator} mapped responsibilities as handled${c.percent != null ? ` (${c.percent}%)` : ""}.`))}${o.assessedAt ? ` ${t("Hinnatud", "Assessed")} ${esc(fmtWhen(o.assessedAt, l, now))}.` : ""}</p>
<p class="small muted">${a.company_label ? t("Ettevõtte nime andis sinu assistent", "Company label supplied by your assistant") : t("Tööruumi nimi", "Workspace label")}${a.company_registry_ref ? ` · ${t("registriviide", "registry ref")} ${esc(a.company_registry_ref)}` : ""} — ${t("seda ei ole avalikust registrist kontrollitud ja see ei tõenda volitust.", "not verified against a public register, and not a mandate.")}</p>
<p class="small">${esc(a.conclusion)}</p>
<ul class="tight">${a.responsibilities.map((r) => `<li class="small">${esc(r.label)} — ${r.is_core ? t("sinu põhitöö", "your core work") : isHandled(r) ? esc(t(`teeb ${r.executor} (assistendi hinnang)`, `handled by ${r.executor} (your assistant's assessment)`)) : r.applicability === "unresolved" ? t("lahtine", "unresolved") : t("teed praegu ise", "you do it yourself now")}<br><span class="muted">${esc(r.reason)}</span></li>`).join("")}</ul>` : ""}
${o.exclusions.length ? `<p class="small muted">${t("Varasematest hinnangutest eemaldatud:", "Removed since earlier assessments:")} ${o.exclusions.map((x) => esc(x.label)).join(", ")}</p>` : ""}
</details>`;

  return `<section class="card hero" aria-labelledby="t-h">
<p class="company">${esc(a?.company_label ?? deadlines?.company.name ?? o.label)}</p>
<h1 id="t-h">${esc(h1)}</h1>
<p class="lede">${esc(lede)} <span class="small muted">${timeEl(tallinnYmd(now), TODAY[l].format(now))}</span></p>
<nav class="today-sum" aria-label="${t("Kokkuvõte", "Summary")}"><a${n ? ' class="needs"' : ""} href="#ootab"><b>${n}</b><span>${t("ootab sinult", "need you")}</span></a><a href="#tegi"><b>${doneCount}</b><span>${t("assistent tegi", "done for you")}</span></a><a href="#tulekul"><b>${upcoming}</b><span>${t("tulekul", "coming up")}</span></a></nav>
${primary}
</section>
<section class="card" id="ootab" aria-labelledby="ootab-h"><h2 id="ootab-h">${t("Ootab sinult", "Needs you")} (${n})</h2>
${askRows.join("") || `<p class="muted">${t("Praegu ei oota sinult midagi.", "Nothing is waiting for you right now.")}</p>`}</section>
<section class="card timeline" id="tegi" aria-labelledby="tegi-h"><h2 id="tegi-h">${t("Assistent tegi", "Done for you")} (${doneCount})</h2>
${doneRows.join("") || `<p class="muted">${t(`Veel pole midagi tehtud. Proovi assistendile öelda: „${TRY_PROMPT[0]}”`, `Nothing done yet. Try telling your assistant: “${TRY_PROMPT[1]}”`)}</p>`}
${handledLine}
<a class="tap-link" href="/activity">${t("Kõik tehtud tööd", "Everything done")}</a></section>
<section class="card" id="tulekul" aria-labelledby="tulekul-h"><h2 id="tulekul-h">${t("Tulekul", "Coming up")} (${upcoming})</h2>
${deadlines ? `<div class="labels">${deadlines.company.synthetic ? sampleChip(l) : deadlines.company.provenance === "public_register" ? labelChip("official", t(deadlines.company.label_et, deadlines.company.label_en)) : labelChip("assistant", t(deadlines.company.label_et, deadlines.company.label_en))}<span class="small muted">${esc([deadlines.company.name, deadlines.company.registry_code].filter(Boolean).join(" · "))}</span></div>` : ""}
${tulekul}
${deadlines ? `<p class="small muted">${t("Tähtajad arvutab reeglistik, mitte tehisaru. Kuupäevad on arvutatud, mitte esitatud ega makstud.", "Deadlines are calculated by rules, not AI. Dates are computed, not filed or paid.")}${deadlines.company.attribution && !deadlines.company.synthetic ? ` ${esc(deadlines.company.attribution)}` : ""}</p>` : ""}</section>
${unmetNeedsBody({ csrf: o.csrf, needs: o.needs, lang: l })}
${how}`;
}

// --- Connect (spec screen 2, simplified per ux2: no QR) ---
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

export function connectBody(o: { lang: Lang; baseUrl: string; assistant: "chatgpt" | "claude"; state: ConnectState; owner: boolean; now?: Date; calendar?: { csrf: string; createdAt: string | null }; standing?: { csrf: string; rules: StandingRule[] } }): string {
  const l = o.lang, t = tr(l), now = o.now ?? new Date();
  const base = String(o.baseUrl ?? "").replace(/\/+$/, ""), endpoint = `${base}/mcp`, here = `${base}/uhenda?a=${o.assistant}`;
  let parsed: URL | null = null;
  try { parsed = new URL(base); } catch { parsed = null; }
  const remoteReady = parsed !== null && parsed.protocol === "https:" && !isLocalOrPrivateHost(parsed.hostname);
  const name = o.assistant === "claude" ? "Claude" : "ChatGPT";
  const wbr = (u: string) => esc(u).replace(/\//g, "/<wbr>");
  const plan = o.assistant === "claude"
    ? t("Claude lubab kohandatud ühendusi igas paketis (tasuta paketis üks ühendus). Testitud Claude'i tasuta paketis (30.10.2026).", "Claude allows custom connectors on every plan (Free: one connector). Tested on Claude's Free plan (30 Oct 2026).")
    : t("Tähtajad töötavad igas ChatGPT paketis. Kinnitused („Kinnita täpselt see”) vajavad ChatGPT Business paketti.", "Deadlines work on every ChatGPT plan. Approvals (“Approve exactly this”) need ChatGPT Business.");
  const address = remoteReady ? `<div class="endpoint"><code>${wbr(endpoint)}</code></div><p class="small muted">${t("Vali aadress ja kopeeri see.", "Select the address and copy it.")}</p>`
    : `<div class="notice"><p class="small">${t("Avalik HTTPS-aadress pole selles serveris veel seadistatud, seega pilves töötav assistent ei saa veel ühenduda.", "A public HTTPS address is not configured on this server yet, so a cloud assistant cannot connect yet.")}</p></div>`;
  const s = o.state;
  const chip = s.kind === "connected"
    ? (() => { const d = new Date(s.at), time = TIME[l].format(d), sameDay = tallinnYmd(d) === tallinnYmd(now); const who = s.who ?? t("Sinu assistent", "Your assistant"); return `<div class="status-chip" id="connect-status" data-state="connected" role="status"><span class="status-dot" aria-hidden="true"></span><span class="status-text">${esc(t(`Ühendatud · ${who} jõudis kohale ${sameDay ? "" : `${DAY.et.format(d)} `}kell ${time}`, `Connected · ${who} reached AI Launchpad ${sameDay ? "" : `on ${DAY.en.format(d)} `}at ${time}`))}</span></div>`; })()
    : `<div class="status-chip" id="connect-status" data-state="waiting" role="status"><span class="status-dot" aria-hidden="true"></span><span class="status-text">${s.kind === "anon" ? `${t("Logi sisse, et näha, kas sinu assistent on ühendatud.", "Sign in to see whether your assistant is connected.")} <a href="/login">${t("Logi sisse", "Sign in")}</a>` : s.kind === "sample" ? t("Näidistööruumis ühenduse olekut ei jälgita.", "Connection status is not tracked in a sample workspace.") : esc(t(`Ootan, et ${name} ühenduks…`, `Waiting for ${name} to connect…`))}</span></div>`;
  return `<h1>${t("Ühenda oma assistent", "Connect your assistant")}</h1>
<p class="lede">${t("Sinu ChatGPT või Claude näeb sinu tähtaegu ja valmistab töid ette. Sina kinnitad ainult selle, mis sind seob.", "Your ChatGPT or Claude sees your deadlines and prepares work for you. You approve only what binds you.")}</p>
<nav class="choice" aria-label="${t("Vali assistent", "Choose your assistant")}"><a href="/uhenda?a=chatgpt"${o.assistant === "chatgpt" ? ' aria-current="true"' : ""}>ChatGPT</a><a href="/uhenda?a=claude"${o.assistant === "claude" ? ' aria-current="true"' : ""}>Claude</a></nav>
<p class="small">${esc(plan)}</p>
${o.owner ? `<p class="small"><a class="tap-link" href="/setup">${t("Pole veel assistenti? Aitame valida", "No assistant yet? We'll help you choose")}</a></p>` : ""}
<section class="card" aria-labelledby="steps-h"><h2 id="steps-h">${t("Kolm sammu", "Three steps")}</h2>
<ol class="steps-big">${o.assistant === "claude"
    // Claude steps follow the tested Free-plan run (docs/live-pilot.md, 30 Oct 2026).
    ? `<li><h3 class="step-title">${t("Ava Claude'is Customize → Connectors → Add custom connector", "In Claude open Customize → Connectors → Add custom connector")}</h3></li>
<li><h3 class="step-title">${t("Nimi: AI-hüppelaud, aadress:", "Name: AI Launchpad, address:")}</h3>${address}<p><strong>${t("→ Continue → Add. Ära muuda midagi muud.", "→ Continue → Add. Change nothing else.")}</strong></p></li>
<li><h3 class="step-title">${t("Vajuta Connect, logi sisse ja kinnita. Kui Claude küsib tööriista luba, vajuta Allow.", "Press Connect, sign in and confirm. If Claude asks for tool permission, press Allow.")}</h3><p class="small muted">`
    : `<li><h3 class="step-title">${t("Kopeeri aadress", "Copy the address")}</h3>${address}</li>
<li><h3 class="step-title">${t("Ava ChatGPT seadetes ühendused, lisa uus ühendus ja kleebi sinna aadress.", "In ChatGPT settings, open connectors, add a new connector and paste the address.")}</h3></li>
<li><h3 class="step-title">${t("Logi sisse ja vali, mida assistent tohib", "Sign in and choose what your assistant may do")}</h3><p class="small muted">`}${esc(t(`Märgi „Jah: ${name} valmistab ette …”, kui tahad, et ta valmistaks sulle kinnitamiseks kirju, arveid ja deklaratsioone.`, `Tick “Yes: ${name} prepares …” if you want it to prepare messages, invoices and returns for your approval.`))}</p></li></ol>
<p class="small">${t("Kui assistent küsib tööriista luba, vali ‚Always allow' — AI-hüppelaud ise ei saada midagi; sind seob ainult kinnitus või sinu püsiluba.", "If your assistant asks for tool permission, choose ‘Always allow’ — AI Launchpad itself sends nothing; only an approval or your standing approval binds you.")}</p></section>
<section class="card" aria-labelledby="st-h"><h2 id="st-h">${t("Ühenduse olek", "Connection status")}</h2>${chip}
${s.kind === "connected" ? `<p>${t("Proovi kohe:", "Try now:")} „${esc(t(TRY_PROMPT[0], TRY_PROMPT[1]))}”</p>` : s.kind === "waiting" ? `<p class="small muted">${t("Leht uueneb ise iga 5 sekundi järel.", "This page refreshes itself every 5 seconds.")}</p>` : ""}</section>
${o.calendar ? calendarSection(l, o.calendar) : ""}
${o.standing ? standingSection(l, o.standing, now) : ""}
${remoteReady ? `<section class="card" aria-labelledby="phone-h"><h2 id="phone-h">${t("Jätka telefonis", "Continue on your phone")}</h2><p class="small muted">${t("Ava see aadress oma telefonis:", "Open this address on your phone:")}</p><p class="big-url">${wbr(here)}</p></section>` : ""}
${techDetails(l, `${techList([[t("MCP-aadress", "MCP address"), endpoint], [t("Sisselogimine", "Sign-in"), "OAuth 2.1 + PKCE"], [t("Õigused", "Scopes"), "progress:read · progress:report (Jah-linnukesega)"], [t("Kliendi nimi", "Client name"), t("kliendi enda antud, kontrollimata", "supplied by the client, not verified")]])}
<p class="small"><a class="tap-link" href="${CHATGPT_GUIDE}" rel="noopener noreferrer">${t("OpenAI juhend", "OpenAI guide")}</a> · <a class="tap-link" href="${CLAUDE_GUIDE}" rel="noopener noreferrer">${t("Claude'i juhend", "Claude guide")}</a>${o.owner ? ` · <a class="tap-link" href="/connection">${t("Käsitsi võtmed", "Manual tokens")}</a>` : ""}</p>`)}
${o.owner ? `<p><a class="tap-link" href="/connection">${t("Andmed ja õigused", "Data and permissions")}</a></p>` : ""}`;
}

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
};
export function activityBody(opts: { rows: Record<string, string>[]; receipts: Record<string, string>[]; exclusions: Exclusion[]; lang: Lang; now?: Date; approvals?: ApprovalRow[]; rules?: StandingRule[] }): string {
  const l = opts.lang, t = tr(l), now = opts.now ?? new Date();
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
    const verb = ruleSent ? t("Assistent saatis püsiloa alusel:", "Your assistant sent under a standing approval:") : r.action === "approval_decided" ? (r.outcome === "approved" ? t("Sina kinnitasid", "You approved") : r.outcome === "declined" ? t("Sina keeldusid", "You declined") : null) : DONE_VERBS[r.action] ? t(...DONE_VERBS[r.action]) : null;
    if (!verb || (r.outcome !== "ok" && r.action !== "approval_decided")) return [];
    const chip = `${r.actor === "assistant" ? labelChip("assistant", t("Assistent teatas", "Your assistant reports")) : r.action === "approval_decided" && r.outcome === "approved" ? labelChip("owner", t("Sinu kinnitus", "You approved")) : ""}${byRule ? ruleChip(l) : ""}`;
    const object = objectOf(r.summary ?? "");
    return [`<div class="row"><strong>${esc(verb)}</strong>${object ? `<br><span>${esc(object)}</span>` : ""}${chip ? `<div class="labels">${chip}</div>` : "<br>"}<span class="small muted">${timeEl(r.created_at, fmtWhen(r.created_at, l, now))}</span></div>`];
  });
  return `<h1>${t("Tehtud", "Done")}</h1><p class="lede">${t("Mida sinu assistent sinu eest tegi ja mida sina otsustasid.", "What your assistant did for you and what you decided.")}</p>
<div class="note"><p class="small">${t("See pole täielik auditilogi: ebaõnnestunud päringud võivad puududa. Tööd, mida assistent teeb teistes teenustes, siin ei nähta — see paistab ainult assistendi teatena ja on nii ka märgitud.", "Not a complete audit trail: failed requests may be missing. Work your assistant does with other providers is not observed here — it appears only as assistant reports, labelled as such.")}</p></div>
<section class="card timeline" aria-labelledby="done-h"><h2 id="done-h">${t("Viimati tehtud", "Recently done")}</h2>${done.join("") || `<p>${t("Veel pole midagi tehtud.", "Nothing done yet.")}</p>`}</section>
${techDetails(l, `<h2>${t("Kogu logi", "Full log")}</h2>${opts.rows.map((r) => `<div class="row"><code>${esc(r.action)}</code> · ${esc(r.actor)} · ${esc(r.outcome)}<br><span class="small muted">${esc(r.created_at)} · ${esc(r.summary)}</span></div>`).join("") || `<p>${t("Logi on tühi.", "No activity yet.")}</p>`}
<h2>${t("Salvestatud teated (täpselt nagu salvestati)", "Accepted report payloads (exactly as saved)")}</h2>
${opts.receipts.map((r) => `<details><summary>${esc(r.kind)} ${esc(r.report_id)} · ${esc(r.created_at)}</summary><pre>${esc(r.payload_json)}</pre><pre>${esc(r.receipt_json)}</pre></details>`).join("") || `<p>${t("Teateid veel pole.", "No reports yet.")}</p>`}
${opts.exclusions.length ? `<h2>${t("Varasematest hinnangutest eemaldatud", "Exclusions from earlier revisions")}</h2>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">v${esc(x.last_seen_version)} · ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}</span></div>`).join("")}` : ""}`)}`;
}
