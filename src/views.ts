import type { Assessment, Coverage } from "./core.js";
import { isHandled } from "./core.js";
import type { ApprovalRow, AssistantMilestones, Exclusion } from "./mcp.js";
import type { CompanyCard } from "./arikratt.js";
import type { FactNeeded, Obligation } from "./obligations.js";
import { BASETEN_MODEL } from "./model-quality.js";
import { BLOCKER_LABELS, CATEGORY_LABELS, classifiedByLabel, type Blocker, type Category, type DemandItem, type OwnerNeed } from "./unmet-needs.js";

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
.attention{background:#fdf3d7;border:1px solid #e3c878;border-radius:12px;padding:12px 14px;margin:12px 0}
.attention h2{margin-top:0}
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
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;

export interface ShellOpts { title: string; active: "status" | "activity" | "connection" | "none"; badge: string; csrf: string; body: string; demo: boolean; }
export function shell(o: ShellOpts): string {
  const nav = [["/", "Status", "status"], ["/activity", "Activity", "activity"], ["/connection", "Connection", "connection"]] as const;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)} · AI Launchpad</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="mark" aria-hidden="true"></span><span class="brand">AI Launchpad</span><span class="badge" role="status">${esc(o.badge)}</span></header>
<nav class="main" aria-label="Main">${nav.map(([href, label, key]) => `<a href="${href}"${o.active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
<main>${o.body}</main>
<footer><details><summary>Help and resources</summary><nav class="guides" aria-label="Guides"><a href="/playbooks">Playbooks</a><a href="/services">Service catalog</a><a href="/setup">Setup helper</a><a href="/approvals">Approvals</a><a href="/demand">Open demand</a></nav></details>
<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><button type="submit" class="secondary">Log out</button></form></footer>
</div></body></html>`;
}

export function loginPage(opts: { demo: boolean; google: boolean; preauth: string; companies: readonly { key: string; label: string }[] }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Log in · AI Launchpad</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="mark" aria-hidden="true"></span><span class="brand">AI Launchpad</span>${opts.demo ? `<span class="badge amber" role="status">Local synthetic demo</span>` : ""}</header>
<main><section class="card hero"><h1>Is my admin handled?</h1><p class="lede">The calm companion for the assistant you already have — what it assesses as handled, what still needs you, and your one next step.</p>
${opts.google ? `<p><a class="btn" href="/auth/login/google">Continue with Google</a></p><p class="small muted">Identity only (name/email identifier). No Gmail or Calendar access is requested.</p>` : `<p class="small muted" role="note">Google sign-in is not configured on this local server yet.</p>`}
<p class="small muted">Signing in proves who you are. It does <strong>not</strong> prove you may act for a company.</p>
<p class="small"><a href="/demand">Open demand</a>: what businesses asked their assistants for that no connector can do yet.</p>
</section>
${opts.demo ? `<section class="card" aria-label="Synthetic demo"><h2>Try a synthetic business</h2><p class="muted">Made-up companies with example assessments. No real data, filings or payments.</p>${opts.companies.map((c) => `<form method="post" action="/auth/demo"><input type="hidden" name="actor" value="${esc(c.key)}"><input type="hidden" name="preauth" value="${esc(opts.preauth)}"><button type="submit" class="secondary">Open ${esc(c.label)}</button></form>`).join("")}</section>` : ""}</main>
</div></body></html>`;
}

export interface LatestProgress { task_id: string; milestone: string; observed_at: string; }

const MILESTONE_LABELS: Record<string, string> = {
  started: "Work started",
  draft_prepared: "Draft prepared",
  waiting_for_owner: "Waiting for you",
  blocked: "Blocked — needs attention",
  external_completion_reported: "Assistant reports outside work done",
};

/** Human-readable UTC timestamp, so owners never see a raw ISO string. */
const fmtWhen = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC`;
};

/** Observed savings are an assistant-supplied assertion, never a Launchpad
 * measurement. Unknown stays unknown — never rendered as a main-view claim. */
function savingsLine(a: Assessment): string {
  const raw = (a.next_action.estimated_effort_saved ?? "").trim();
  if (!raw || a.next_action.savings_basis === "unknown" || /unknown|unmeasured/i.test(raw)) return "Savings not measured yet.";
  const prefix = a.next_action.savings_basis === "observed" ? "Assistant-reported saving" : "Estimated saving";
  return `${prefix}: ${raw}`;
}

/** Calendar date in Europe/Tallinn: "20. nov, reede" / "Fri 20 Nov". */
const fmtDue = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`), f = (l: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l, { timeZone: "Europe/Tallinn", ...o }).format(d);
  return { et: `${f("et-EE", { day: "numeric", month: "short" })}, ${f("et-EE", { weekday: "long" })}`, en: f("en-GB", { weekday: "short", day: "numeric", month: "short" }) };
};
/** Next deadlines: rules-computed rows, date first, each with its official source. */
export function deadlinesCard(r: { company: CompanyCard; obligations: Obligation[]; facts_needed: FactNeeded[] }): string {
  const c = r.company;
  const sample = c.synthetic ? `<span class="pill owner">Näidis · Sample</span>` : "";
  const rows = r.obligations.map((o) => {
    const when = o.effective_due ? fmtDue(o.effective_due) : null;
    const head = when ? (o.kind === "risk" ? `Tähtaeg oli ${when.et}` : when.et) : o.period_label_et;
    const sub = when ? (o.kind === "risk" ? `Was due ${when.en}` : when.en) : o.period_label_en;
    return `<div class="row"><strong>${esc(head)}</strong> <span class="small muted">${esc(sub)}</span><br><strong>${esc(o.title_et)}</strong> · ${esc(o.period_label_et)} <span class="small muted">${esc(o.title_en)}</span>
<p class="small">${esc(o.reason_et)}</p>
<span class="pill">Arvutatud reeglist · Calculated by rule</span>${sample} <a class="small" href="${esc(o.source.url)}" rel="noopener noreferrer">Allikas: ${esc(o.source.act_et)} ${esc(o.source.section)} ↗</a></div>`;
  }).join("");
  return `<section class="card" aria-label="Next deadlines"><h2>Järgmised tähtajad <span class="small muted">· Next deadlines</span></h2>
<p class="small">${esc(c.name ?? "Ettevõte")}${c.registry_code ? ` · ${esc(c.registry_code)}` : ""} · ${c.synthetic ? sample : `<span class="pill">${esc(c.label_et)}</span>`}</p>
${rows || `<p class="muted">Selles vahemikus tähtaegu pole. <span class="small">No deadlines in this period.</span></p>`}
${r.facts_needed.length ? `<details><summary>Assistent küsib (${r.facts_needed.length}) · Your assistant may ask</summary><ul class="tight">${r.facts_needed.map((n) => `<li class="small">${esc(n.question_et)}</li>`).join("")}</ul></details>` : ""}
<p class="small muted">Tähtajad arvutab reeglistik, mitte tehisaru. Calculated by rules, not AI: computed dates, not filings or payments.${c.attribution && !c.synthetic ? ` ${esc(c.attribution)}` : ""}</p></section>`;
}

/** Register facts not cached yet (the Status page does not wait for them) or unavailable (with the plain reason). */
export const deadlinesHint = (reason?: string) => `<section class="card" aria-label="Next deadlines"><p class="small">Tähtajad: küsi oma assistendilt „Mis on minu tähtajad?” <span class="muted">Deadlines: ask your assistant "What are my deadlines?"</span>${reason ? ` <span class="muted">${esc(reason)}</span>` : ""}</p></section>`;

export function statusBody(opts: { label: string; demo: boolean; assessment: Assessment | null; coverage: Coverage; assessedAt: string | null; exclusions: Exclusion[]; historyCount: number; reportingEnabled: boolean; latestProgress?: LatestProgress | null; deadlines?: string }): string {
  const { assessment: a, coverage: c } = opts;
  if (!a) {
    return `<section class="card hero" aria-label="Status"><p class="company">${esc(opts.label)}</p><h1>Let's get your first assessment</h1>
<p class="next">Ask your assistant to assess your business responsibilities</p>
<p>Nothing has been assessed yet${opts.demo ? "" : " for your workspace"}. Launchpad does no background monitoring.</p>
<p><a class="btn" href="/connection">Connect your assistant</a></p>
<p class="small muted">Then ask it: “Assess my responsibilities and tell me the one action that removes the most of my work.” Review its requested permissions before you approve.</p>
<details><summary>Connection limits</summary><p class="small muted">Standard OAuth supports local SDK clients. ChatGPT was tested with one owner. Claude and broader plan compatibility are not yet verified. Signing in here never proves a company mandate.</p></details>
<p class="small muted">No assistant yet? The temporary <a href="/setup">setup helper</a> gives setup guidance.</p></section>`;
  }
  const unknowns: string[] = [
    ...(c.unresolved ? [`${c.unresolved} item(s) still unresolved`] : []),
    ...(c.gaps ? a.gaps : []),
    ...(c.percent == null && !c.unresolved && !c.gaps ? ["Assessment incomplete — not all areas assessed yet"] : []),
  ];
  const handledRows = a.responsibilities.map((r) => `<div class="row"><strong>${esc(r.label)}</strong>
<span class="pill">${esc(r.domain)}</span><span class="pill">${r.is_core ? "core work (yours)" : esc(r.applicability)}</span><span class="pill">${isHandled(r) ? "assessed as handled (agent judgment)" : esc(r.arrangement)}</span>
<p class="small muted">${esc(r.reason)}<br>Evidence refs: ${esc(r.evidence_refs.join(", ") || "none")}${r.executor ? `<br>Executor: ${esc(r.executor)} · Access: ${esc(r.access ?? "")}<br>Success looks like: ${esc(r.success_criterion ?? "")} · Next checkpoint: ${esc(r.next_checkpoint ?? "")}` : ""}</p></div>`).join("");
  const when = fmtWhen(opts.assessedAt);
  // Short plain prompt for the owner's own assistant, built from the assessed
  // title + rationale. Rendered escaped into a data attribute (never into
  // inline JavaScript); the static script below only moves it through the DOM
  // via getAttribute/value, so hidden copies never disturb text queries.
  const copyPrompt = `Next step from my AI Launchpad assessment: "${a.next_action.title}". Why this matters: ${a.next_action.rationale} Please help me do this, or tell me what you need from me.`;
  const lp = opts.latestProgress;
  const progressLine = lp
    ? `<h2>Latest accepted report</h2><p><strong>${esc(MILESTONE_LABELS[lp.milestone] ?? lp.milestone)}</strong> · ${esc(lp.task_id)}<br><span class="small muted">${esc(fmtWhen(lp.observed_at) ?? lp.observed_at)} · assistant report, not independently checked</span></p>`
    : "";
  return `<section class="card hero" aria-label="Status"><p class="company">${esc(a.company_label ?? opts.label)}</p>
<h1>Your next step</h1>
<p class="next">${esc(c.next_action)}</p>
<p>${esc(a.next_action.rationale)}</p>
${a.next_action.needs_owner ? `<p><span class="pill owner">Needs you</span></p>` : ""}
<button type="button" id="copy-next" data-prompt="${esc(copyPrompt)}">Copy next step</button>
<p class="small muted">Paste into your assistant.</p>
<p class="small" id="copy-next-ok" role="status" hidden>Copied — paste it into your assistant.</p>
<div id="copy-next-fallback" hidden role="status"><p class="small">Copy failed — select the text below and copy it yourself.</p>
<label class="small" for="copy-next-text">Copy manually<textarea id="copy-next-text" rows="4" readonly></textarea></label></div>
<script>(function(){var b=document.getElementById("copy-next");if(!b)return;b.addEventListener("click",function(){var t=b.getAttribute("data-prompt")||"";var ok=function(){var m=document.getElementById("copy-next-ok");var f=document.getElementById("copy-next-fallback");if(m)m.hidden=false;if(f)f.hidden=true;};var fail=function(){var m=document.getElementById("copy-next-ok");var f=document.getElementById("copy-next-fallback");var a=document.getElementById("copy-next-text");if(m)m.hidden=true;if(a)a.value=t;if(f)f.hidden=false;if(a){a.focus();a.select();}};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fail);}else{fail();}});})();</script>
</section>
${opts.deadlines ?? ""}
<section class="card" aria-label="Coverage"><h2>Coverage</h2>
<p>${esc(c.label)}${c.percent != null ? ` (${c.percent}%)` : ""}</p>
${c.percent != null ? `<progress value="${c.percent}" max="100" aria-label="${esc(c.label)}">${c.percent}%</progress>` : ""}
${unknowns.length ? `<div class="attention"><h2>Needs attention</h2><ul class="tight">${unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>` : `<p class="muted">No open questions reported.</p>`}
${progressLine}
<div class="meta"><p class="small muted">Your assistant's assessment · not independently checked · Independently verified: ${c.independently_verified_outcomes}.</p>
${when ? `<p class="small muted">Assessed ${esc(when)}</p>` : ""}</div>
</section>
<details><summary>Assessment details</summary>
<p class="small muted">${a.company_label ? "Company label supplied by your assistant" : "Workspace label"}${a.company_registry_ref ? ` · registry ref ${esc(a.company_registry_ref)}` : ""} — not verified against a public register, and not a mandate.</p>
<h2>Conclusion &amp; assumptions</h2><p>${esc(a.conclusion)}</p>${a.assumptions?.length ? `<p class="small muted">Assumptions: ${a.assumptions.map(esc).join("; ")}</p>` : `<p class="small muted">No assumptions recorded.</p>`}
<h2>About this recommendation</h2><p class="small">${esc(savingsLine(a))}<br>Uncertainty: ${esc(a.next_action.uncertainty)}</p>
<h2>Responsibilities &amp; evidence (${a.responsibilities.length})</h2>${handledRows}<p class="small muted">${esc(c.note)}</p>
${when ? `<p class="small muted">Assessed ${esc(when)} · Independently verified outcomes: ${c.independently_verified_outcomes}.</p>` : `<p class="small muted">Independently verified outcomes: ${c.independently_verified_outcomes}.</p>`}
</details>
${opts.exclusions.length ? `<details><summary>Removed since earlier assessments (${opts.exclusions.length})</summary>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">last seen in assessment v${x.last_seen_version} · was ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}. It stays listed here so unfinished work never disappears silently.</span></div>`).join("")}</details>` : ""}
<p class="small muted">Assessment revisions so far: ${opts.historyCount}. <a href="/activity">Activity &amp; evidence</a> has the full history.</p>`;
}

export function activityBody(opts: { rows: Record<string, string>[]; receipts: Record<string, string>[]; exclusions: Exclusion[] }): string {
  return `<h1>Activity &amp; evidence</h1><p class="lede">Saved reports and recorded actions for your workspace.</p>
<div class="note"><p class="small">Not a complete audit trail: failed requests and protocol calls may be missing. Work your assistant does with other providers is not observed here — it appears only as assistant reports, labelled as such.</p></div>
<section class="card timeline" aria-label="Recent activity"><h2>Recent activity</h2>${opts.rows.map((r) => `<div class="row"><strong>${esc(r.action)}</strong> <span class="pill">${esc(r.actor)}</span><span class="pill">${esc(r.outcome)}</span><br><span class="small muted">${esc(r.created_at)} · ${esc(r.summary)}</span></div>`).join("") || "<p>No activity yet.</p>"}</section>
<h2>Accepted report payloads (yours)</h2>
${opts.receipts.map((r) => `<details><summary>${esc(r.kind)} ${esc(r.report_id)} · ${esc(r.created_at)}</summary><h3 class="small">Accepted payload (exactly as saved)</h3><pre>${esc(r.payload_json)}</pre><h3 class="small">Receipt</h3><pre>${esc(r.receipt_json)}</pre></details>`).join("") || "<p>No reports yet.</p>"}
${opts.exclusions.length ? `<h2>Exclusions from earlier revisions</h2>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">last seen v${x.last_seen_version} · ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}</span></div>`).join("")}` : ""}`;
}

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
    ? `<p class="small">Last request received ${esc(fmtWhen(milestones.lastContact.at) ?? milestones.lastContact.at)}</p>`
    : `<p class="small">No request recorded in retained history.</p>`;
  const saved = milestones.firstSavedAssessment
    ? `<p class="small">Assessment saved ${esc(fmtWhen(milestones.firstSavedAssessment.at) ?? milestones.firstSavedAssessment.at)} · assistant judgment, not independently checked. <a href="/">Status</a> · <a href="/activity">Activity</a></p>`
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
<p class="small muted">One grant covers both things your assistant may save here: concise task updates and its business assessment (classifications, short reasons, gaps, one next action). Launchpad does not receive your conversations or documents, and this permission never approves business actions.</p>
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
<p>Launchpad stores your assessments, task reports, approvals, activity, nominations and tokens — no conversations or documents. Deleting also revokes tokens and signs out other sessions, so old queued reports cannot recreate it. It does not delete any provider's records.</p>
<p><a class="btn secondary" href="/export">Export my progress (JSON)</a></p>
<form method="post" action="/delete" onsubmit="return confirm('Delete your Launchpad progress?')"><input type="hidden" name="csrf" value="${csrf}"><button type="submit" class="danger">Delete my progress</button></form></section>`;
}

export function tokenOnceBody(raw: string): string {
  return `<section class="card hero"><h1>Your new assistant token</h1>
<p>Shown <strong>once</strong> — copy it now into your MCP client's Authorization header. It is never put in a URL and cannot be shown again; revoke and re-issue if you lose it.</p>
<pre>${esc(raw)}</pre>
<p><a class="btn" href="/connection">Back to Connection</a></p></section>`;
}

const APPROVAL_KINDS: Record<string, string> = { send_message: "Send a message", send_invoice: "Send an invoice", prepare_payment: "Prepare a payment", prepare_filing: "Prepare a filing" };
const APPROVAL_STATES: Record<string, string> = { pending: "Waiting for you", approved: "Approved", declined: "Declined", expired: "Expired", consumed: "Used — your assistant reported an outcome" };
const eur = (cents: unknown) => typeof cents === "number" ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100) : null;
interface ApprovalView { kind?: string; recipient?: { name?: string; address?: string } | string; amount_cents?: number; period?: string; document?: { title?: string; content?: string }; document_ref?: string; summary?: string; }
/** Stored payloads are parsed leniently so earlier synthetic rows still render. */
function approvalView(a: ApprovalRow) {
  let p: ApprovalView = {};
  try { p = JSON.parse(a.payload_json) as ApprovalView; } catch { /* unreadable payload renders as unknown */ }
  const recipient = typeof p.recipient === "string" ? { name: p.recipient } : p.recipient ?? {};
  return { p, recipient, kind: APPROVAL_KINDS[a.kind ?? p.kind ?? ""] ?? "Earlier synthetic approval", amount: eur(p.amount_cents), state: APPROVAL_STATES[a.state] ?? a.state };
}
function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return "Expired";
  const min = Math.ceil(ms / 60_000);
  return `Expires in ${Math.floor(min / 60)} h ${min % 60} min`;
}

export function approvalsAttention(pending: number): string {
  return pending ? `<section class="attention" aria-label="Approvals waiting"><h2>${pending} approval${pending === 1 ? "" : "s"} waiting for you</h2><p class="small">Your assistant asked before it acts. Nothing happens unless you approve the exact content.</p><a class="btn" href="/approvals">Review approvals</a></section>` : "";
}

export function approvalsListBody(rows: ApprovalRow[]): string {
  const item = (a: ApprovalRow) => {
    const v = approvalView(a);
    return `<div class="row"><a href="/approvals/${esc(encodeURIComponent(a.id))}"><strong>${esc(v.kind)}</strong> · ${esc(v.recipient.name ?? "unknown recipient")}${v.amount ? ` · ${esc(v.amount)}` : ""}</a><br><span class="pill${a.state === "pending" ? " owner" : ""}">${esc(v.state)}</span><span class="small muted">${esc(fmtWhen(a.created_at) ?? a.created_at)}</span></div>`;
  };
  const pending = rows.filter((a) => a.state === "pending"), history = rows.filter((a) => a.state !== "pending");
  return `<h1>Approvals</h1><p class="lede">Actions your assistant asked you to approve. Launchpad never sends, pays or files.</p>
<section class="card" aria-label="Waiting for you"><h2>Waiting for you (${pending.length})</h2>${pending.map(item).join("") || `<p class="muted">Nothing is waiting for you.</p>`}</section>
<section class="card" aria-label="History"><h2>History</h2>${history.map(item).join("") || `<p class="muted">No decided approvals yet.</p>`}</section>`;
}

export function approvalCardBody(opts: { csrf: string; a: ApprovalRow }): string {
  const { a } = opts, v = approvalView(a);
  let outcome: { outcome?: string; observed_at?: string } | null = null;
  try { outcome = a.outcome_json ? JSON.parse(a.outcome_json) : null; } catch { outcome = null; }
  const fact = (label: string, value: string | null | undefined) => value ? `<dt>${label}</dt><dd>${esc(value)}</dd>` : "";
  const decision = a.state === "pending"
    ? `<p class="small muted">${esc(timeLeft(a.expires_at))}</p>
<form method="post" action="/approvals/${esc(encodeURIComponent(a.id))}/decide"><input type="hidden" name="csrf" value="${esc(opts.csrf)}"><input type="hidden" name="digest" value="${esc(a.digest)}">
<button name="decision" value="approve">Approve exactly this</button><button class="secondary" name="decision" value="decline">Decline</button></form>`
    : `<p role="status"><span class="pill">${esc(v.state)}</span> ${[a.decided_at ? `Decided ${esc(fmtWhen(a.decided_at) ?? a.decided_at)}` : "", a.state === "expired" ? `Expired ${esc(fmtWhen(a.expires_at) ?? a.expires_at)}${a.decided_at ? " before your assistant reported an outcome; it must ask again" : ""}` : ""].filter(Boolean).join(" · ")}</p>
${outcome?.outcome ? `<p class="small">Your assistant reported: <strong>${esc(outcome.outcome)}</strong>${outcome.observed_at ? ` (${esc(fmtWhen(outcome.observed_at) ?? outcome.observed_at)})` : ""} · assistant reported, not verified by Launchpad.</p>` : ""}`;
  return `<section class="card hero" aria-label="Approval"><p class="company">Approval request</p><h1>${esc(v.kind)}</h1>
${v.p.summary ? `<p class="lede">${esc(v.p.summary)}</p>` : ""}
<dl class="facts">${fact("To", v.recipient.name)}${fact("Address", v.recipient.address)}${fact("Amount", v.amount)}${fact("Period", v.p.period)}${fact("Document", v.p.document?.title ?? v.p.document_ref)}</dl>
${v.p.document?.content ? `<h2>Exact content</h2><pre class="doc" tabindex="0">${esc(v.p.document.content)}</pre>` : ""}
<p class="small muted">Digest <code>${esc(a.digest.slice(0, 12))}</code></p>
<div class="note"><p class="small">Launchpad never sends, pays or files. After you approve, your assistant does this with its own tools, and only for exactly this content.</p></div>
${decision}</section>
<p><a href="/approvals">All approvals</a></p>`;
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

const NEED_STATE_LABEL: Record<string, string> = {
  received: "Received", classifying: "Classifying", classified: "Needs your decision",
  classification_failed: "Classification failed", published: "Published anonymously", kept_private: "Kept private",
};
const NEED_STATE_TEXT: Record<string, string> = {
  received: "Received and de-identified; waiting to be classified.",
  classifying: "Being classified now.",
  classification_failed: "Classification failed. It is not retried automatically and nothing was published.",
  published: "Published anonymously on Open demand (category, label and spec only).",
  kept_private: "Kept private. It is never published.",
};
const NEED_REASON_TEXT: Record<string, string> = {
  owner_daily_limit: "Waiting: your daily classification limit (10 per day) was reached. It is classified later, when Launchpad next processes requests. No model call was made for it.",
  attempt_in_flight: "Waiting: another model request is unresolved, so this one has not started. No model call was made for it.",
  classification_unavailable: "Waiting: classification is not available on this server right now. Nothing was sent to a model.",
  budget_exhausted: "The shared model budget is exhausted, so no classification can be made.",
  suppressed_after_breach: "Model calls are suspended after a provider contract problem.",
  provider_contract_breach: "The model provider broke its contract for this request; the answer was discarded.",
  provider_failed: "The model provider did not return a usable answer.",
  provider_uncertain: "The model request did not finish cleanly; its result is unknown.",
  interrupted: "An earlier attempt was interrupted and its result is unknown.",
  request_conflict: "The saved model record does not match this request.",
  invalid_output: "The answer was not valid classification data, so it was discarded.",
  identifiers_in_output: "The answer contained something that looked like an identifier, so it was discarded.",
  input_too_large: "The request was too large to classify.",
  unavailable: "Classification was unavailable.",
};
const categoryLabel = (c: string | null) => CATEGORY_LABELS[c as Category] ?? c ?? "";

function needRow(n: OwnerNeed): string {
  const why = [NEED_STATE_TEXT[n.state], n.reason ? NEED_REASON_TEXT[n.reason] ?? n.reason : ""].filter(Boolean).join(" ");
  return `<div class="row"><strong>${esc(n.demand_label ?? "Not classified yet")}</strong> <span class="pill">${esc(NEED_STATE_LABEL[n.state] ?? n.state)}</span>${n.category ? `<span class="pill">${esc(categoryLabel(n.category))}</span>` : ""}
<p class="small">${esc(why)}</p><p class="small muted">${esc(n.need_redacted)}<br>Blocker: ${esc(BLOCKER_LABELS[n.blocker as Blocker] ?? n.blocker)} · ${esc(fmtWhen(n.created_at) ?? n.created_at)}${n.classified_by ? ` · classified by ${esc(classifiedByLabel(n.classified_by))}` : ""}</p></div>`;
}

/** Owner review of unmet requests (Status page). Only rendered when the
 * owner has at least one. Publishing sends category, label and spec only. */
export function unmetNeedsBody(opts: { csrf: string; needs: OwnerNeed[] }): string {
  if (!opts.needs.length) return "";
  const csrf = esc(opts.csrf);
  const awaiting = opts.needs.filter((n) => n.state === "classified");
  const open = opts.needs.filter((n) => ["received", "classifying", "classification_failed"].includes(n.state));
  const decided = opts.needs.filter((n) => n.state === "published" || n.state === "kept_private");
  const decide = (n: OwnerNeed, decision: string, label: string, cls: string) => `<form method="post" action="/unmet-needs/decide"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="need_id" value="${esc(n.id)}"><input type="hidden" name="decision" value="${decision}"><button type="submit"${cls ? ` class="${cls}"` : ""}>${label}</button></form>`;
  return `<section class="card" aria-label="Requests your assistant could not do"><h2>Requests your assistant could not do</h2>
<p class="small muted">Stored de-identified. Publishing shares only the category, label and one-line spec on <a href="/demand">Open demand</a> — never your company, your account or the request text.</p>
${awaiting.map((n) => `<div class="row"><p><span class="pill owner">Needs your decision</span><span class="pill">${esc(categoryLabel(n.category))}</span></p>
<p><strong>${esc(n.demand_label)}</strong></p><p>${esc(n.spec)}</p>
<p class="small muted">Your request (de-identified, stays private): ${esc(n.need_redacted)}</p>
<p class="small muted">Classified by ${esc(classifiedByLabel(n.classified_by))}${n.same_as ? " · matches an existing open-demand item" : ""}</p>
${decide(n, "publish", "Publish anonymously", "")}${decide(n, "keep_private", "Keep private", "secondary")}</div>`).join("")}
${open.map(needRow).join("")}
${decided.length ? `<details><summary>Decided requests (${decided.length})</summary>${decided.map(needRow).join("")}</details>` : ""}
</section>`;
}

/** Public, login-free Open demand list. Only aggregated, owner-approved
 * classification fields are rendered, all escaped. */
export function demandPage(items: DemandItem[]): string {
  const by = (i: DemandItem) => [i.live ? `${classifiedByLabel(BASETEN_MODEL)} × ${i.live}` : "", i.mock ? `${classifiedByLabel("mock")} × ${i.mock}` : ""].filter(Boolean).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open demand · AI Launchpad</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="mark" aria-hidden="true"></span><span class="brand">AI Launchpad</span></header>
<main><section class="card hero"><h1>Open demand</h1><p class="lede">What Estonian businesses asked their AI assistants to do that no connector can do yet. Anonymous, owner-approved${items.length === 0 ? "" : items.some((i) => i.live > 0) ? ", classified by Meta's open model Muse Spark Open" : ", classified by a local test classifier (sample)"}.</p>
<p class="small muted">Sorted by number of requests. Each item says how it was classified — live by Meta's model or by the local mock (not a model). Counts are owner-approved reports, not market size.</p></section>
${items.length ? items.map((i) => `<section class="card"><h2>${esc(i.label)}</h2><p><span class="pill">${esc(categoryLabel(i.category))}</span><span class="pill">${i.count} ${i.count === 1 ? "request" : "requests"}</span></p>
<p>${esc(i.spec)}</p><p class="small muted">First seen ${esc(i.firstSeen)} · last seen ${esc(i.lastSeen)}<br>Classified by ${esc(by(i))}</p></section>`).join("") : `<section class="card"><p>No published demand yet.</p></section>`}
<p class="small"><a href="/login">AI Launchpad</a></p></main>
</div></body></html>`;
}
