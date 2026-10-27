import type { Assessment, Coverage } from "./core.js";
import { isHandled } from "./core.js";
import type { Exclusion } from "./mcp.js";

export const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const CSS = `
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f5f6f3;color:#1b2430;line-height:1.55}
.wrap{max-width:720px;margin:auto;padding:20px 16px 40px}
header.top{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:6px}
.brand{font-weight:700;font-size:1.15rem;letter-spacing:-.01em}
.badge{display:inline-block;font-size:.78rem;padding:3px 10px;border-radius:999px;background:#e8eddf;color:#3c4b2a;border:1px solid #c9d4b2}
nav.main{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 20px}
nav.main a{flex:1 1 0;text-align:center;min-height:48px;display:flex;align-items:center;justify-content:center;padding:10px 8px;border-radius:12px;background:#fff;border:1px solid #d8dce2;color:#1b2430;text-decoration:none;font-weight:600}
nav.main a[aria-current="page"]{background:#14532d;color:#fff;border-color:#14532d}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}
.card{background:#fff;border:1px solid #dfe3da;border-radius:16px;padding:20px;margin:14px 0}
.hero{padding:24px 20px}.hero h1{font-size:1.45rem;line-height:1.25;margin:0 0 8px}
.next{font-size:1.2rem;font-weight:700;line-height:1.35;margin:6px 0}
.muted{color:#55606e;font-size:.94rem}.small{font-size:.86rem}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:12px;border:0;background:#14532d;color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;width:100%;margin:6px 0}
button.secondary,.btn.secondary{background:#fff;color:#14532d;border:1px solid #14532d}
button.danger{background:#fff;color:#8f1d1d;border:1px solid #8f1d1d}
input,select{font:inherit;min-height:48px;padding:10px 12px;border:1px solid #aab3bd;border-radius:10px;width:100%;margin:4px 0 12px;background:#fff}
textarea{font:inherit;min-height:96px;padding:10px 12px;border:1px solid #aab3bd;border-radius:10px;width:100%;margin:4px 0 12px;background:#fff}
[hidden]{display:none!important}
label{font-weight:600;display:block}
details{border:1px solid #dfe3da;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fff}
h1{font-size:1.35rem;line-height:1.25;margin:0 0 8px}h2{font-size:1.05rem;margin:18px 0 6px}
summary{cursor:pointer;font-weight:600;min-height:44px}
progress{width:100%;height:12px;accent-color:#14532d}
pre{white-space:pre-wrap;word-break:break-word;background:#f2f4ee;border-radius:10px;padding:12px;font-size:.82rem}
code{word-break:break-all}.row{padding:12px 0;border-bottom:1px solid #eef0ea}.row:last-child{border-bottom:0}
.pill{display:inline-block;font-size:.78rem;padding:2px 9px;border-radius:999px;background:#eef2e4;margin:2px 4px 2px 0}
footer{margin-top:28px}.guides{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0}
ul.tight{margin:8px 0;padding-left:20px}
@media (max-width:380px){.wrap{padding:14px 12px 32px}.hero{padding:18px 14px}.card{padding:16px 14px}}`;

export interface ShellOpts { title: string; active: "status" | "activity" | "connection" | "none"; badge: string; csrf: string; body: string; demo: boolean; }
export function shell(o: ShellOpts): string {
  const nav = [["/", "Status", "status"], ["/activity", "Activity", "activity"], ["/connection", "Connection", "connection"]] as const;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)} · AI Launchpad</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="brand">AI Launchpad</span><span class="badge" role="status">${esc(o.badge)}</span></header>
<nav class="main" aria-label="Main">${nav.map(([href, label, key]) => `<a href="${href}"${o.active === key ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
<main>${o.body}</main>
<footer><details><summary>Help and resources</summary><nav class="guides" aria-label="Guides"><a href="/playbooks">Playbooks</a><a href="/services">Service catalog</a><a href="/setup">Setup helper</a>${o.demo ? `<a href="/demo/approvals">Synthetic approval demo</a>` : ""}</nav></details>
<form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><button type="submit" class="secondary">Log out</button></form></footer>
</div></body></html>`;
}

export function loginPage(opts: { demo: boolean; google: boolean; preauth: string; companies: readonly { key: string; label: string }[] }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Log in · AI Launchpad</title><style>${CSS}</style></head><body><div class="wrap">
<header class="top"><span class="brand">AI Launchpad</span>${opts.demo ? `<span class="badge" role="status">Local synthetic demo</span>` : ""}</header>
<section class="card hero"><h1>Is my admin handled?</h1><p>The calm companion for the AI assistant you already have. It shows what your assistant assesses as handled, what still needs you, and the one next step that removes the most work.</p>
<p class="muted">Signing in proves who you are. It does <strong>not</strong> prove you may act for a company.</p>
${opts.google ? `<p><a class="btn" href="/auth/login/google">Continue with Google</a></p><p class="small muted">Identity only (name/email identifier). No Gmail or Calendar access is requested.</p>` : `<p class="small muted" role="note">Google sign-in is not configured on this local server yet.</p>`}
</section>
${opts.demo ? `<section class="card"><h2>Try a synthetic business</h2><p class="muted">Made-up companies with example assessments. No real data, filings or payments.</p>${opts.companies.map((c) => `<form method="post" action="/auth/demo"><input type="hidden" name="actor" value="${esc(c.key)}"><input type="hidden" name="preauth" value="${esc(opts.preauth)}"><button type="submit">Open ${esc(c.label)}</button></form>`).join("")}</section>` : ""}
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

export function statusBody(opts: { label: string; demo: boolean; assessment: Assessment | null; coverage: Coverage; assessedAt: string | null; exclusions: Exclusion[]; historyCount: number; reportingEnabled: boolean; latestProgress?: LatestProgress | null }): string {
  const { assessment: a, coverage: c } = opts;
  if (!a) {
    return `<section class="card hero" aria-label="Status"><h1>Let's get your first assessment</h1>
<p><strong>${esc(opts.label)}</strong></p>
<p>Nothing has been assessed yet${opts.demo ? "" : " for your workspace"}, and Launchpad does no background monitoring.</p>
<h2>Your first step</h2>
<p class="next">Ask your assistant to assess your business responsibilities</p>
<ol><li>Open the <a href="/connection">Connection page</a> for the MCP address, then connect from your assistant and review its requested permissions.</li>
<li>Standard OAuth supports local SDK clients. Claude/ChatGPT remote connection remains unverified until public hosting is tested.</li>
<li>Ask your assistant: “Assess my responsibilities and tell me the one action that removes the most of my work.”</li></ol>
<p class="muted">No assistant yet? The temporary <a href="/setup">setup helper</a> gives fixture guidance. Signing in here never proves a company mandate.</p></section>`;
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
  return `<section class="card hero" aria-label="Status"><p><strong>${esc(a.company_label ?? opts.label)}</strong></p>
<h1>Your next step</h1>
<p class="next">${esc(c.next_action)}</p>
<p>${esc(a.next_action.rationale)}</p>
${a.next_action.needs_owner ? `<p><span class="pill">Needs you</span></p>` : ""}
<button type="button" id="copy-next" data-prompt="${esc(copyPrompt)}">Copy next step</button>
<p class="small muted">Paste into your assistant.</p>
<p class="small" id="copy-next-ok" role="status" hidden>Copied — paste it into your assistant.</p>
<div id="copy-next-fallback" hidden><p class="small">Copy failed — select the text below and copy it yourself.</p>
<label class="small" for="copy-next-text">Copy manually<textarea id="copy-next-text" rows="4" readonly></textarea></label></div>
<script>(function(){var b=document.getElementById("copy-next");if(!b)return;b.addEventListener("click",function(){var t=b.getAttribute("data-prompt")||"";var ok=function(){var m=document.getElementById("copy-next-ok");var f=document.getElementById("copy-next-fallback");if(m)m.hidden=false;if(f)f.hidden=true;};var fail=function(){var m=document.getElementById("copy-next-ok");var f=document.getElementById("copy-next-fallback");var a=document.getElementById("copy-next-text");if(m)m.hidden=true;if(a)a.value=t;if(f)f.hidden=false;};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(ok,fail);}else{fail();}});})();</script>
</section>
<section class="card" aria-label="Coverage"><h2>Coverage</h2>
<p>${esc(c.label)}${c.percent != null ? ` (${c.percent}%)` : ""}</p>
${c.percent != null ? `<progress value="${c.percent}" max="100" aria-label="${esc(c.label)}">${c.percent}%</progress>` : ""}
${unknowns.length ? `<h2>Needs attention</h2><ul class="tight">${unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : `<p class="muted">No open questions reported.</p>`}
${progressLine}
<p class="small muted">Your assistant's assessment · not independently checked · Independently verified: ${c.independently_verified_outcomes}.</p>
${when ? `<p class="small muted">Assessed ${esc(when)}</p>` : ""}
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
  return `<h1>Activity &amp; evidence</h1><p class="muted">Recent saved reports and recorded actions for your workspace. Failed requests and protocol calls are not a complete audit trail. Calls your assistant makes directly to other providers are not observed here — they appear only as assistant reports, labelled as such.</p>
<section class="card">${opts.rows.map((r) => `<div class="row"><strong>${esc(r.action)}</strong> <span class="pill">${esc(r.actor)}</span><span class="pill">${esc(r.outcome)}</span><br><span class="small muted">${esc(r.created_at)} · ${esc(r.summary)}</span></div>`).join("") || "<p>No activity yet.</p>"}</section>
<h2>Accepted report payloads (yours)</h2>
${opts.receipts.map((r) => `<details><summary>${esc(r.kind)} ${esc(r.report_id)} · ${esc(r.created_at)}</summary><h3 class="small">Accepted payload (exactly as saved)</h3><pre>${esc(r.payload_json)}</pre><h3 class="small">Receipt</h3><pre>${esc(r.receipt_json)}</pre></details>`).join("") || "<p>No reports yet.</p>"}
${opts.exclusions.length ? `<h2>Exclusions from earlier revisions</h2>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">last seen v${x.last_seen_version} · ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}</span></div>`).join("")}` : ""}`;
}

export function connectionBody(opts: { csrf: string; baseUrl: string; reportingEnabled: boolean; tokens: Record<string, unknown>[]; grants: Record<string, string>[]; candidates: Record<string, string>[] }): string {
  const csrf = esc(opts.csrf);
  const example = JSON.stringify({ report_id: "oct-assessment", expected_version: 3, assessment: { assessed_domains: ["money", "customers"], responsibilities: [{ id: "invoicing", domain: "money", label: "Sales invoicing", applicability: "applicable", is_core: false, arrangement: "assistant_assessed", executor: "…", access: "…", success_criterion: "…", next_checkpoint: "…", reason: "short reason", evidence_refs: ["provider-object:123"] }], gaps: [], conclusion: "short conclusion", next_action: { title: "…", rationale: "…", uncertainty: "…", needs_owner: true } } }, null, 1);
  return `<h1>Connection &amp; data</h1>
<section class="card"><h2>Progress sharing permission</h2>
<p>Currently: <strong>${opts.reportingEnabled ? "on" : "off (the default)"}</strong>.</p>
<p>One grant covers both things your assistant may save here: concise task updates and its business assessment (classifications, short reasons, gaps, one next action). Launchpad does not receive your conversations or documents, and this permission never approves business actions.</p>
<details><summary>See exactly what one report contains</summary><pre>${esc(example)}</pre><p class="small muted">Up to 500 reports are retained until you delete progress; new reports are then refused. Export or delete below at any time. Stopping is enforced on the server for every write, including service nominations.</p></details>
<form method="post" action="/reporting"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="enabled" value="${opts.reportingEnabled ? "0" : "1"}"><button type="submit">${opts.reportingEnabled ? "Stop progress sharing" : "Allow progress sharing"}</button></form>
<p class="small muted">Stopping does not stop a provider's own scheduled jobs, and disconnecting Launchpad does not revoke direct assistant/provider connections.</p></section>
<section class="card"><h2>Connect your assistant</h2>
<p>MCP endpoint: <code>${esc(opts.baseUrl)}/mcp</code>. Add this address in your assistant, sign in to Launchpad, and review the connection permission.</p>
<p class="small muted">Standard OAuth with PKCE. Local SDK validated; Claude/ChatGPT remote connection not verified. Public hosting is still required for remote consumers. Google tokens are never accepted as MCP credentials.</p>
<h3>Connected assistants</h3>
${opts.grants.map(g => `<div class="row"><strong>${esc(JSON.parse(g.metadata).client_name)}</strong><p>Return address: ${esc(new URL(g.redirect).origin)}<br>Permissions: ${esc(g.scopes)} · ${g.revoked ? "disconnected" : Number(g.expires) <= Date.now() ? "expired" : "connected"}</p>${g.revoked || Number(g.expires) <= Date.now() ? "" : `<form method="post" action="/oauth/disconnect"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="grant_id" value="${esc(g.id)}"><button class="secondary">Disconnect assistant</button></form>`}</div>`).join("") || "<p>No assistant connections yet.</p>"}
<h3>Advanced: manual token</h3><p>For development clients that send a custom authorization header. Tokens are shown once at issue time and never on this page.</p>
<form method="post" action="/tokens"><input type="hidden" name="csrf" value="${csrf}"><button type="submit">Issue assistant token (read + report)</button></form>
${opts.tokens.map((t) => `<div class="row"><code>${esc(t.id)}</code><br><span class="small muted">Scopes: ${esc(t.scopes)} · ${t.revoked ? "revoked" : "active"} · created ${esc(t.created_at)}${t.last_used_at ? ` · last used ${esc(t.last_used_at)}` : ""}</span>${t.revoked ? "" : `<form method="post" action="/tokens/revoke"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="token_id" value="${esc(t.id)}"><button type="submit" class="secondary">Revoke this token</button></form>`}</div>`).join("") || "<p class=\"muted\">No tokens yet.</p>"}
</section>
<section class="card"><h2>Your service nominations</h2>
<p class="muted">Services your assistant nominated. They are private to your workspace and wait for human moderation — never auto-published.</p>
${opts.candidates.map((c) => `<div class="row"><strong>${esc(c.name)}</strong> <span class="pill">${esc(c.status)}</span><br><span class="small muted">${esc(c.connection)} · ${esc(c.jobs)} · ${esc(c.created_at)}</span><form method="post" action="/candidates/delete"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="candidate_id" value="${esc(c.id)}"><button type="submit" class="secondary">Delete this nomination</button></form></div>`).join("") || "<p class=\"muted\">None yet.</p>"}
</section>
<section class="card"><h2>Your minimal data</h2>
<p>Launchpad stores your assessments, task reports, activity, nominations and tokens — no conversations or documents. Deleting also revokes tokens and signs out other sessions, so old queued reports cannot recreate it. It does not delete any provider's records.</p>
<p><a class="btn secondary" href="/export">Export my progress (JSON)</a></p>
<form method="post" action="/delete" onsubmit="return confirm('Delete your Launchpad progress?')"><input type="hidden" name="csrf" value="${csrf}"><button type="submit" class="danger">Delete my progress</button></form></section>`;
}

export function tokenOnceBody(raw: string): string {
  return `<section class="card hero"><h1>Your new assistant token</h1>
<p>Shown <strong>once</strong> — copy it now into your MCP client's Authorization header. It is never put in a URL and cannot be shown again; revoke and re-issue if you lose it.</p>
<pre>${esc(raw)}</pre>
<p><a class="btn" href="/connection">Back to Connection</a></p></section>`;
}

export function approvalsBody(opts: { csrf: string; approvals: Record<string, string>[] }): string {
  const csrf = esc(opts.csrf);
  return `<section class="card hero"><h1>Synthetic approval demo</h1>
<p><span class="badge">Demo only</span></p>
<p>This page exists only to test the exact-payload approval rule with fake data. An approval binds recipient, amount, period and document by digest; any change invalidates it. Approving here sends, files, signs and pays <strong>nothing</strong>. There is no real approval product behind this.</p>
<form method="post" action="/approvals"><input type="hidden" name="csrf" value="${csrf}">
<label>Recipient <input name="recipient" value="Demo Supplier OÜ" maxlength="80" required></label>
<label>Amount (cents, whole number) <input name="amount_cents" inputmode="numeric" value="1200" required></label>
<label>Period <input name="period" value="2026-10" maxlength="20" required></label>
<label>Document ref <input name="document_ref" value="demo-invoice-1" maxlength="80" required></label>
<button type="submit">Create approval request</button></form>
${opts.approvals.map((a) => `<div class="row"><code>${esc(a.id)}</code> · ${esc(a.state)} · expires ${esc(a.expires_at)}<br><span class="small">${esc(a.payload_json)}<br>digest ${esc(a.digest)}</span>${a.state === "pending" ? `<form method="post" action="/approvals/approve"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="approval_id" value="${esc(a.id)}"><label>Re-enter amount (cents) to approve exactly <input name="amount_cents" inputmode="numeric" required></label><button type="submit">Approve exact payload</button></form>` : ""}</div>`).join("")}
</section>`;
}

export function setupBody(opts: { csrf: string; result: string | null }): string {
  return `<h1>Setup helper (temporary)</h1>
<section class="card"><p>For owners with no assistant yet. Once yours is connected, talk to it — not to this page.</p>
<p class="small muted">Guidance here is a saved fixture from a deterministic mock. No live model is called (live inference is disabled in this build), and Meta model quality is untested.</p>
<form method="post" action="/setup"><input type="hidden" name="csrf" value="${esc(opts.csrf)}">
<label>Where are you stuck? <select name="topic"><option>adding a connector to my assistant</option><option>choosing an assistant</option><option>first read-only check</option></select></label>
<button type="submit">Get guidance</button></form>
${opts.result ? `<section class="card" role="status"><p>${esc(opts.result)}</p></section>` : ""}</section>`;
}

export interface ServiceView { name: string; jobs: string; interface_class: string; evidence_status: string; limitations: string; connection: string; connection_url: string | null; access_and_price: string; checked_on: string; sources: string[]; }
export function servicesBody(opts: { q: string; total: number; results: ServiceView[] }): string {
  return `<h1>Service catalog</h1>
<p class="muted">${opts.total} researched records (27 Oct 2026). <strong>None were runtime-tested by Launchpad;</strong> treat them as documented leads. Connect a service inside your own assistant — Launchpad does not fetch or broker these connections.</p>
<form method="get" role="search"><label>Search <input name="q" value="${esc(opts.q)}" maxlength="120"></label><button type="submit">Search</button></form>
${opts.results.map((r) => `<section class="card"><h2>${esc(r.name)}</h2><p>${esc(r.jobs)}</p>
<p class="small">Interface: ${esc(r.interface_class)} · Evidence: ${esc(r.evidence_status)} · Checked: ${esc(r.checked_on)} · Runtime verified: no</p>
<p class="small">Connection: ${r.connection_url ? `<a href="${esc(r.connection_url)}" rel="noopener noreferrer">${esc(r.connection)}</a>` : esc(r.connection)}${r.access_and_price ? `<br>Access &amp; price: ${esc(r.access_and_price)}` : ""}</p>
${r.sources.length ? `<p class="small">Primary sources: ${r.sources.map((s) => `<a href="${esc(s)}" rel="noopener noreferrer">${esc(s)}</a>`).join(" · ")}</p>` : ""}
<p class="small muted">${esc(r.limitations)}</p></section>`).join("")}`;
}

export function playbooksBody(items: { title: string; summary: string; source: string; source_label: string }[]): string {
  return `<h1>Playbooks</h1>${items.map((p) => `<section class="card"><h2>${esc(p.title)}</h2><p>${esc(p.summary)}</p><p class="small">Official source: <a href="${esc(p.source)}" rel="noopener noreferrer">${esc(p.source_label)}</a>. Always check the source for current dates and rules; this page is not legal or tax advice.</p></section>`).join("")}`;
}
