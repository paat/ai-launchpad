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
label{font-weight:600;display:block}
details{border:1px solid #dfe3da;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fff}
summary{cursor:pointer;font-weight:600;min-height:40px}
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
<footer><nav class="guides" aria-label="Guides"><a href="/playbooks">Playbooks</a><a href="/services">Service catalog</a><a href="/setup">Setup helper</a>${o.demo ? `<a href="/demo/approvals">Synthetic approval demo</a>` : ""}</nav>
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

export function statusBody(opts: { label: string; demo: boolean; assessment: Assessment | null; coverage: Coverage; assessedAt: string | null; exclusions: Exclusion[]; historyCount: number; reportingEnabled: boolean }): string {
  const { assessment: a, coverage: c } = opts;
  if (!a) {
    return `<section class="card hero" aria-label="Status"><h1>Let's get your first assessment</h1>
<p><strong>${esc(opts.label)}</strong></p>
<p>Nothing has been assessed yet${opts.demo ? "" : " for your workspace"}, and Launchpad does no background monitoring.</p>
<h2>Your first step</h2>
<p class="next">Ask your assistant to assess your business responsibilities</p>
<ol><li>On the <a href="/connection">Connection page</a>, allow progress sharing and issue an assistant token.</li>
<li>Add the Launchpad MCP endpoint to a header-capable MCP client. <strong>Honest limit:</strong> consumer Claude/ChatGPT connector OAuth is not built yet, so there is no one-tap consumer connection today.</li>
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
  return `<section class="card hero" aria-label="Status"><p><strong>${esc(opts.label)}</strong>${a.company_label ? `<br><span class="small muted">Assistant-supplied company label: ${esc(a.company_label)}${a.company_registry_ref ? ` · registry ref ${esc(a.company_registry_ref)}` : ""} — not verified against a public register, and not a mandate.</span>` : ""}</p>
<h1>${c.needs_owner ? "One thing needs you" : "Nothing needs you right now"}</h1>
<p class="next">${esc(c.next_action)}</p>
<p>${esc(a.next_action.rationale)}</p>
${a.next_action.estimated_effort_saved ? `<p class="small">${a.next_action.savings_basis === "observed" ? "Observed saving" : "Estimated saving"}: ${esc(a.next_action.estimated_effort_saved)}<br>Uncertainty: ${esc(a.next_action.uncertainty)}</p>` : `<p class="small">Uncertainty: ${esc(a.next_action.uncertainty)}</p>`}
<p>${esc(c.label)}${c.percent != null ? ` (${c.percent}%)` : ""}<br><span class="small muted">Agent-assessed: ${c.agent_assessed_covered} of ${c.denominator}. Independently verified outcomes: ${c.independently_verified_outcomes} (no verifier exists yet — reported is not verified).</span></p>
${unknowns.length ? `<h2>Still unknown</h2><ul class="tight">${unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
<p class="small muted"><em>Your assistant's assessment</em>${opts.demo ? " (synthetic fixture, reported not verified)" : ""} · ${esc(opts.assessedAt)}<br>${esc(a.conclusion)}</p>
${a.assumptions?.length ? `<p class="small muted">Assumptions: ${a.assumptions.map(esc).join("; ")}</p>` : ""}
</section>
<details><summary>Responsibilities &amp; evidence (${a.responsibilities.length})</summary>${handledRows}<p class="small muted">${esc(c.note)}</p></details>
${opts.exclusions.length ? `<details><summary>Removed since earlier assessments (${opts.exclusions.length})</summary>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">last seen in assessment v${x.last_seen_version} · was ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}. It stays listed here so unfinished work never disappears silently.</span></div>`).join("")}</details>` : ""}
<p class="small muted">Assessment revisions so far: ${opts.historyCount}. Detail is on the Activity page.</p>`;
}

export function activityBody(opts: { rows: Record<string, string>[]; receipts: Record<string, string>[]; exclusions: Exclusion[] }): string {
  return `<h1>Activity &amp; evidence</h1><p class="muted">Recent saved reports and recorded actions for your workspace. Failed requests and protocol calls are not a complete audit trail. Calls your assistant makes directly to other providers are not observed here — they appear only as assistant reports, labelled as such.</p>
<section class="card">${opts.rows.map((r) => `<div class="row"><strong>${esc(r.action)}</strong> <span class="pill">${esc(r.actor)}</span><span class="pill">${esc(r.outcome)}</span><br><span class="small muted">${esc(r.created_at)} · ${esc(r.summary)}</span></div>`).join("") || "<p>No activity yet.</p>"}</section>
<h2>Accepted report payloads (yours)</h2>
${opts.receipts.map((r) => `<details><summary>${esc(r.kind)} ${esc(r.report_id)} · ${esc(r.created_at)}</summary><h3 class="small">Accepted payload (exactly as saved)</h3><pre>${esc(r.payload_json)}</pre><h3 class="small">Receipt</h3><pre>${esc(r.receipt_json)}</pre></details>`).join("") || "<p>No reports yet.</p>"}
${opts.exclusions.length ? `<h2>Exclusions from earlier revisions</h2>${opts.exclusions.map((x) => `<div class="row"><strong>${esc(x.label)}</strong> <span class="small muted">last seen v${x.last_seen_version} · ${esc(x.last_applicability)} / ${esc(x.last_arrangement)}</span></div>`).join("")}` : ""}`;
}

export function connectionBody(opts: { csrf: string; baseUrl: string; reportingEnabled: boolean; tokens: Record<string, unknown>[]; candidates: Record<string, string>[] }): string {
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
<p>MCP endpoint: <code>${esc(opts.baseUrl)}/mcp</code><br>Authentication: a scoped Launchpad token (below) as a Bearer [REDACTED]</p>
<p class="small muted"><strong>Limitation, honestly:</strong> consumer assistants (Claude/ChatGPT apps) usually expect OAuth connector flows, not pasted Bearer [REDACTED] That client OAuth is <strong>not built</strong>, so this is not one-tap ready and we won't pretend otherwise. The token works with MCP clients that support custom headers, as our tests use. A Google access token is never accepted here.</p>
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
