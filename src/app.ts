import { LaunchpadOAuth, CONSENT_PATH, connectCookie, touchLastUsed } from "./oauth.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openDb, sha256, newId, nowIso, type Db } from "./db.js";
import { arikratt } from "./arikratt.js";
import { approvalAddressMissing, buildMcpServer, companyObligations, expireApprovals, getApproval, getAssistantMilestones, getState, liveStandingRules, logActivity, normAddress, standingRuleName, STANDING_DEFAULTS, STANDING_KINDS, TOOL_ARG_KEYS, type ApprovalRow, type StandingRule } from "./mcp.js";
import { PLAYBOOKS, searchServices, loadCatalog } from "./catalog.js";
import { computeHandover, handoverObligations, isDone, largestAmount, offerCapCents, standingBasis } from "./handover.js";
import type { Assessment } from "./core.js";
import { runModelJob } from "./model.js";
import { FRICTION_TOPICS, SETUP_TOPICS, PublicCards, findTopic, openExistingPublicLedger, parseLocale, type PublicCardView } from "./model-public-cards.js";
import type { FetchFn } from "./model-quality.js";
import { DEMO_COMPANIES, DEMO_FIXTURES } from "./fixtures.js";
import { ICS_NO_COMPANY, deadlinesCalendar } from "./ics.js";
import { esc, shell, tr, parseLang, errorBody, loginBody, tanaBody, landingBody, connectBody, assistantGuidePrompt, activityBody, connectionBody, tokenOnceBody, calendarOnceBody, approvalsListBody, approvalCardBody, setupBody, catalogueBody, CATALOGUE_GROUPS, playbooksBody, demandBody, type Lang, type ShellOpts, type ConnectState, type DeadlinesView } from "./views.js";
import { UNMET_NEED_RECHECK_MS, UnmetNeedQueue, aggregateDemand, decideNeed, liveClassifier, mockClassifier, ownerNeeds, type NeedClassifier } from "./unmet-needs.js";
import { naidisApproval, naidisBody } from "./naidis.js";

export interface Config { demo: boolean; production: boolean; dbPath: string; baseUrl: string; googleClientId?: string; googleClientSecret?: string; modelMode: string; allowedHosts: string[]; releaseSha?: string | null; trustLoopbackProxy?: boolean; googleAllowedSubjects?: string[]; modelLedgerPath?: string; modelPricingConfirmed?: boolean; basetenApiKey?: string; modelFetchFn?: FetchFn; arikrattApiKey?: string; arikrattMcpUrl?: string; }
// Owner-only pilot allowlist: exact opaque Google `sub` values, never emails.
// Bounded: at most 20 entries, each 1-255 chars (OIDC `sub` max), no
// whitespace/control characters, no comma (the env separator), no '@'
// (email-like), no duplicates. Values are compared exactly as given; they
// are never lowercased or otherwise normalized, and never echoed in errors.
const MAX_ALLOWED_SUBJECTS = 20, MAX_SUBJECT_LENGTH = 255;
function validateGoogleAllowedSubjects(list: unknown): string[] {
  const fail = (): never => { throw new Error("LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS must be a nonempty list of at most 20 exact opaque Google subject (sub) values: each 1-255 characters, no whitespace, control characters, commas or email addresses, and no duplicates."); };
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_ALLOWED_SUBJECTS) fail();
  const seen = new Set<string>();
  for (const entry of list as unknown[]) {
    if (typeof entry !== "string" || entry.length < 1 || entry.length > MAX_SUBJECT_LENGTH || /[\s\u0000-\u001f\u007f-\u009f]/.test(entry) || entry.includes("@") || entry.includes(",") || seen.has(entry)) fail();
    seen.add(entry as string);
  }
  return [...(list as string[])];
}
function googleAllowedSubjectsFromEnv(env: NodeJS.ProcessEnv, production: boolean): string[] | undefined {
  const raw = env.LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS;
  if (raw === undefined || raw === "") {
    if (production) throw new Error("LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS is required in production (owner-only pilot: comma-separated exact opaque Google sub values, never emails); refusing to start without it.");
    return undefined;
  }
  return validateGoogleAllowedSubjects(raw.split(","));
}
export const RELEASE_SHA_RE = /^[0-9a-f]{40}$/;
function releaseShaFromEnv(env: NodeJS.ProcessEnv): string | null {
  const raw = env.LAUNCHPAD_RELEASE_SHA;
  if (raw === undefined || raw === "") return null;
  if (!RELEASE_SHA_RE.test(raw)) throw new Error("LAUNCHPAD_RELEASE_SHA must be exactly 40 lowercase hex characters (or unset); refusing to start with an unverifiable release identity.");
  return raw;
}
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const modelMode = env.MODEL_MODE ?? "test";
  // Public-card secrets/paths are read only in the explicit enabled mode;
  // disabled/test startup never needs or reads the operator key.
  const publicCards = modelMode === "public_cards"
    ? { modelLedgerPath: env.LAUNCHPAD_MODEL_LEDGER_PATH || undefined, modelPricingConfirmed: env.LAUNCHPAD_MODEL_PRICING_CONFIRMED === "1", basetenApiKey: env.BASETEN_API_KEY || undefined }
    : {};
  return { demo: env.LAUNCHPAD_DEMO === "1" && !production, production, dbPath: env.LAUNCHPAD_DB_PATH ?? "./data/launchpad.db", baseUrl: env.LAUNCHPAD_BASE_URL ?? "http://localhost:3000", googleClientId: env.GOOGLE_CLIENT_ID || undefined, googleClientSecret: env.GOOGLE_CLIENT_SECRET || undefined, modelMode, allowedHosts: (env.LAUNCHPAD_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(","), releaseSha: releaseShaFromEnv(env), trustLoopbackProxy: env.LAUNCHPAD_TRUST_LOOPBACK_PROXY === "1", googleAllowedSubjects: googleAllowedSubjectsFromEnv(env, production), arikrattApiKey: env.ARIKRATT_API_KEY || undefined, arikrattMcpUrl: env.ARIKRATT_MCP_URL || undefined, ...publicCards };
}
type Authed = Request & { ownerId: string; csrf: string; ownerKind: string };
const oid = (req: Request) => (req as Authed).ownerId;
const bodyOf = (req: Request) => (req.body ?? {}) as Record<string, string>;
function cookieVal(req: Request, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? "");
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; } // malformed percent-encoding = no credential, never a 500
}
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
/** Locale for this request: ?lang=et|en (persisted by the middleware), else the lang cookie, else Estonian. */
const langOf = (res: Response): Lang => (res.locals.lang as Lang | undefined) ?? "et";
/** The current URL with the other language, for the header toggle. */
function toggleHref(req: Request, l: Lang): string {
  const u = new URL(req.originalUrl, "http://launchpad.invalid");
  u.searchParams.set("lang", l === "et" ? "en" : "et");
  return u.pathname + u.search;
}
const isLoopback = (req: Request) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");

// Calendar feed limit (per process, in memory): 60 fetches per token per
// hour, so a leaked feed URL cannot be used as a lookup proxy.
const FEED_FETCHES_PER_HOUR = 60, FEED_WINDOW_MS = 3600_000;
export function feedLimiter() {
  const fetches = new Map<string, number[]>();
  return (tokenHash: string, now = Date.now()): boolean => {
    const recent = (fetches.get(tokenHash) ?? []).filter((t) => now - t < FEED_WINDOW_MS);
    if (recent.length >= FEED_FETCHES_PER_HOUR) { fetches.set(tokenHash, recent); return false; }
    if (fetches.size > 10_000) for (const [k, v] of fetches) if (!v.some((t) => now - t < FEED_WINDOW_MS)) fetches.delete(k);
    recent.push(now); fetches.set(tokenHash, recent);
    return true;
  };
}
/** Plain Estonian reason for a feed without events when the register gave no facts. */
const REGISTER_GAP_ET: Record<string, string> = {
  not_cached: "Avaliku registri andmeid laaditakse — sündmused ilmuvad kalendri järgmisel uuendamisel",
  not_configured: "Avaliku registri päring pole selles serveris seadistatud",
  invalid_code: "Registrikood ei sobi — palu assistendil kood üle kontrollida",
  not_found: "Registrikoodiga ettevõtet registrist ei leitud — palu assistendil kood üle kontrollida",
};

export function createApp(cfg: Config, db: Db = openDb(cfg.dbPath)) {
  const releaseSha = cfg.releaseSha ?? null;
  if (releaseSha !== null && !RELEASE_SHA_RE.test(releaseSha)) throw new Error("releaseSha must be exactly 40 lowercase hex characters (or null).");
  // Direct Config is validated too, not only the env parser: production
  // without a valid pilot allowlist fails closed at startup. Development
  // with the list omitted keeps the existing local demo; a configured list
  // is enforced in any environment. There is no public-mode bypass.
  const allowedSubjects: Set<string> | null = cfg.googleAllowedSubjects !== undefined
    ? new Set(validateGoogleAllowedSubjects(cfg.googleAllowedSubjects))
    : cfg.production
      ? (() => { throw new Error("googleAllowedSubjects is required in production (owner-only pilot: exact opaque Google sub values, never emails); refusing to start without it."); })()
      : null;
  // Central pilot policy: with a list configured, only a Google owner whose
  // stored subject is exactly `google:<allowed sub>` is allowed. Demo and
  // other non-Google owners get no bypass.
  function ownerAllowed(ownerId: string): boolean {
    if (!allowedSubjects) return true;
    const o = db.prepare("SELECT kind,subject FROM owners WHERE id=?").get(ownerId) as { kind: string; subject: string } | undefined;
    return !!o && o.kind === "google" && o.subject.startsWith("google:") && allowedSubjects.has(o.subject.slice("google:".length));
  }
  // Public cards: explicit opt-in only. An invalid enabled configuration
  // fails closed at startup (env and direct Config alike); it never falls
  // back to test/disabled. Disabled/test modes construct nothing here.
  let publicCards: PublicCards | null = null;
  // Unmet-need classification: live only in this same explicit mode and
  // on the SAME ledger handle; mock in test mode; none when disabled.
  let needClassifier: NeedClassifier | null = cfg.modelMode === "disabled" ? null : mockClassifier;
  if (cfg.modelMode === "public_cards") {
    if (!allowedSubjects) throw new Error("MODEL_MODE=public_cards requires a nonempty Google subject allowlist (LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS); refusing to start.");
    if (cfg.modelPricingConfirmed !== true) throw new Error("MODEL_MODE=public_cards requires LAUNCHPAD_MODEL_PRICING_CONFIRMED=1 (operator confirms current published pricing/credits); refusing to start.");
    if (!cfg.basetenApiKey) throw new Error("MODEL_MODE=public_cards requires BASETEN_API_KEY; refusing to start.");
    if (!cfg.modelLedgerPath) throw new Error("MODEL_MODE=public_cards requires LAUNCHPAD_MODEL_LEDGER_PATH (the exact existing reviewed ledger); refusing to start.");
    const ledger = openExistingPublicLedger(cfg.modelLedgerPath);
    publicCards = new PublicCards({ ledger, apiKey: cfg.basetenApiKey, fetchFn: cfg.modelFetchFn });
    needClassifier = liveClassifier({ ledger, apiKey: cfg.basetenApiKey, fetchFn: cfg.modelFetchFn });
  }
  // Public-register facts: with no key, lookups return not_configured without a network call.
  const register = arikratt(db, { apiKey: cfg.arikrattApiKey, url: cfg.arikrattMcpUrl });
  // Status page never waits for the register: on a cache miss it starts one
  // background fill per code (errors logged once, never thrown) and moves on.
  // A failed fill blocks new fills for that code: not_found for 24 hours, a transient failure for 10 minutes.
  const FILL_RETRY_MS = 10 * 60_000, NOT_FOUND_RETRY_MS = 24 * 3600_000;
  type FillFailure = { unavailable: string; reason: string };
  const fillBlocked = new Map<string, { until: number; reason?: FillFailure }>(); // in flight: until Infinity, no reason
  const fillInBackground = (code: string) => {
    if ((fillBlocked.get(code)?.until ?? 0) > Date.now()) return;
    fillBlocked.set(code, { until: Infinity });
    const failed = (reason: FillFailure) => fillBlocked.set(code, { until: Date.now() + (reason.unavailable === "not_found" ? NOT_FOUND_RETRY_MS : FILL_RETRY_MS), reason });
    void register.lookup(code).then((r) => { if (r.ok) fillBlocked.delete(code); else { failed(r); console.warn(`Status deadlines: register lookup failed (${r.unavailable}).`); } }, (e) => { failed({ unavailable: "error", reason: "The register lookup failed." }); console.warn("Status deadlines: register lookup failed.", e); });
  };
  /** Why a failed fill failed, while it is remembered. */
  const fillFailure = (code: string) => { const b = fillBlocked.get(code); return b?.reason && b.until > Date.now() ? b.reason : undefined; };
  const unmetNeeds = new UnmetNeedQueue(db, needClassifier, (ownerId, action, outcome, summary) => logActivity(db, ownerId, "launchpad", action, outcome, summary));
  unmetNeeds.kick(); // resume any received/interrupted needs after a restart
  // Deferred needs (daily limit, another attempt in flight) retry without a new report or restart.
  setInterval(() => unmetNeeds.kick(), UNMET_NEED_RECHECK_MS).unref();
  const app = express();
  app.disable("x-powered-by");
  // Forwarded addresses are trusted only when explicitly configured, and
  // then only from an exact loopback proxy at hop 0 (e.g. local Caddy that
  // overwrites X-Forwarded-For) — never a blanket `true`.
  if (cfg.trustLoopbackProxy) app.set("trust proxy", (ip: string, i: number) => i === 0 && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip));
  else app.set("trust proxy", false);
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(express.json({ limit: "256kb" }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const hostHeader = req.headers.host ?? "";
    let canonical: URL;
    try { canonical = new URL(cfg.baseUrl); } catch { return res.status(503).send("Server origin is not configured."); }
    if (!["http:", "https:"].includes(canonical.protocol) || canonical.username || canonical.password || canonical.pathname !== "/" || canonical.search || canonical.hash || (cfg.production && canonical.protocol !== "https:") || (!cfg.production && canonical.protocol === "http:" && !["localhost", "127.0.0.1"].includes(canonical.hostname))) return res.status(503).send("Server origin is not configured.");
    if (hostHeader !== canonical.host || !cfg.allowedHosts.includes(canonical.hostname)) return res.status(421).send("Unexpected Host.");
    const origin = req.headers.origin;
    const protocolPath = req.path.replace(/\/+$/, "").toLowerCase();
    const protocolRequest = ["/token", "/register", "/revoke", "/mcp"].includes(protocolPath) || protocolPath.startsWith("/.well-known/oauth-");
    if (origin !== undefined && !protocolRequest) {
      // Exact-origin check (scheme + host + port). "null" (e.g. sandboxed or
      // no-referrer form posts) is always rejected.
      if (origin !== canonical.origin) return res.status(403).send("Unexpected Origin.");
    }
    // same-origin (not no-referrer): real same-origin form POSTs must carry an
    // Origin header, which the exact check above then validates.
    res.set({ "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "cache-control": "no-store" });
    next();
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const asked = parseLang(req.query.lang);
    const naidis = req.path === "/naidis" || req.path.startsWith("/naidis/");
    if (asked && !naidis) res.append("set-cookie", `lang=${asked}; Path=/; Max-Age=31536000; SameSite=Lax${cfg.production ? "; Secure" : ""}`);
    res.locals.lang = asked ?? parseLang(cookieVal(req, "lang")) ?? "et";
    next();
  });

  function ensureOwner(subject: string, email: string | null, kind: string, label: string) {
    let o = db.prepare("SELECT id FROM owners WHERE subject=?").get(subject) as { id: string } | undefined;
    if (!o) {
      const id = newId("own");
      db.transaction(() => {
        db.prepare("INSERT INTO owners(id,subject,email,kind,reporting_enabled,created_at) VALUES(?,?,?,?,0,?)").run(id, subject, email, kind, nowIso());
        db.prepare("INSERT INTO workspaces(owner_id,company_ref,label) VALUES(?,?,?)").run(id, `ws-${id.slice(4)}`, label);
      })();
      o = { id };
    }
    return o.id;
  }
  function seedDemoFixture(ownerId: string, key: string) {
    const fixture = DEMO_FIXTURES[key];
    if (!fixture) return;
    const existing = db.prepare("SELECT count(*) n FROM assessments WHERE owner_id=?").get(ownerId) as { n: number };
    if (existing.n > 0) return;
    const ws = db.prepare("SELECT version FROM workspaces WHERE owner_id=?").get(ownerId) as { version: number };
    const v = ws.version + 1;
    db.transaction(() => {
      db.prepare("INSERT INTO assessments(id,owner_id,version,payload_json,payload_hash,created_at) VALUES(?,?,?,?,?,?)").run(newId("asmt"), ownerId, v, JSON.stringify(fixture), sha256(JSON.stringify(fixture)), nowIso());
      db.prepare("UPDATE workspaces SET version=? WHERE owner_id=?").run(v, ownerId);
    })();
    logActivity(db, ownerId, "launchpad", "demo_fixture_seeded", "ok", "Synthetic demo fixture assessment loaded after explicit demo login (assistant-reported example, not verified).");
  }
  function session(req: Request) {
    const raw = cookieVal(req, "lp_session");
    if (!raw) return null;
    const row = db.prepare("SELECT owner_id,csrf,expires_at FROM sessions WHERE id_hash=?").get(sha256(raw)) as { owner_id: string; csrf: string; expires_at: string } | undefined;
    // ownerAllowed is checked on every lookup, so removing a subject and
    // restarting immediately denies existing browser/consent sessions.
    if (!row || Date.parse(row.expires_at) < Date.now() || !ownerAllowed(row.owner_id)) return null;
    return row;
  }
  function startSession(req: Request, res: Response, ownerId: string) {
    // Rotate: any session the browser already held is invalidated at sign-in.
    const old = cookieVal(req, "lp_session");
    if (old) db.prepare("DELETE FROM sessions WHERE id_hash=?").run(sha256(old));
    db.prepare("DELETE FROM sessions WHERE expires_at<?").run(nowIso());
    const mine = db.prepare("SELECT id_hash FROM sessions WHERE owner_id=? ORDER BY expires_at ASC").all(ownerId) as { id_hash: string }[];
    for (const extra of mine.slice(0, Math.max(0, mine.length - 4))) db.prepare("DELETE FROM sessions WHERE id_hash=?").run(extra.id_hash);
    const raw = randomBytes(32).toString("base64url");
    const csrf = randomBytes(24).toString("base64url");
    db.prepare("INSERT INTO sessions(id_hash,owner_id,csrf,expires_at) VALUES(?,?,?,?)").run(sha256(raw), ownerId, csrf, new Date(Date.now() + 8 * 3600_000).toISOString());
    res.setHeader("set-cookie", `lp_session=${encodeURIComponent(raw)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${cfg.production ? "; Secure" : ""}`);
  }
  const requireOwner = (req: Request, res: Response, next: NextFunction) => {
    const s = session(req);
    if (!s) return res.redirect(req.method === "GET" && req.path === CONSENT_PATH ? `/login?return_to=${encodeURIComponent(CONSENT_PATH)}` : "/login");
    const owner = db.prepare("SELECT kind FROM owners WHERE id=?").get(s.owner_id) as { kind: string } | undefined;
    (req as Authed).ownerId = s.owner_id;
    (req as Authed).csrf = s.csrf;
    (req as Authed).ownerKind = owner?.kind ?? "";
    next();
  };
  const csrfOk = (req: Request, res: Response, next: NextFunction) => {
    const s = session(req);
    const given = String(bodyOf(req).csrf ?? req.headers["x-csrf-token"] ?? "");
    if (!s || !safeEqual(given, s.csrf)) { const t = tr(langOf(res)); return res.status(403).type("html").send(publicPage(req, res, t("Turvakontroll ebaõnnestus", "Security check failed"), errorBody(langOf(res), t("Turvakontroll ebaõnnestus", "Security check failed"), t("CSRF-kontroll ebaõnnestus. Mine tagasi, ava leht uuesti ja proovi uuesti. Midagi ei muudetud.", "CSRF check failed. Go back and try again. Nothing was changed.")))); }
    next();
  };
  const page = (req: Request, res: Response, title: string, active: ShellOpts["active"], body: string, extra: Partial<ShellOpts> = {}) => shell({
    title, active, body, csrf: (req as Authed).csrf ?? "", lang: langOf(res), sample: (req as Authed).ownerKind === "demo", toggle: toggleHref(req, langOf(res)), ...extra,
  });
  /** Public chrome (no nav, no logout) for visitors and error pages. */
  function publicPage(req: Request, res: Response, title: string, body: string, extra: Partial<ShellOpts> = {}) {
    return shell({ title, active: "none", body, csrf: "", lang: langOf(res), toggle: toggleHref(req, langOf(res)), ...extra });
  }
  /** Owner-facing error inside the shell with a way back (never plain text on the demo path). */
  const ownerError = (req: Request, res: Response, status: number, title: string, message: string) => res.status(status).type("html").send(page(req, res, title, "none", errorBody(langOf(res), title, message)));
  /** Every standing approval of the owner (live, ended and expired), to name the rule behind an approval. */
  const ownerRules = (ownerId: string) => db.prepare("SELECT * FROM standing_approvals WHERE owner_id=? ORDER BY created_at DESC").all(ownerId) as StandingRule[];
  // Deadlines: only for a known registry code (assessment ref or synthetic demo company).
  const ownerDeadlines = (assessment: Assessment | null) => { const ref = assessment?.company_registry_ref?.trim(); return ref && /^\d{8}$/.test(ref) ? companyObligations(register, { registryCode: ref, months: 2, cacheOnly: true }) : Promise.resolve(null); };
  // „Käest ära” (#61): once per request, from the stored approvals and rules plus the rule-computed deadlines.
  const ownerHandover = (ownerId: string, assessment: Assessment | null, deadlines: Awaited<ReturnType<typeof ownerDeadlines>>) => {
    expireApprovals(db, ownerId);
    return computeHandover({ assessment, obligations: deadlines?.ok ? handoverObligations(deadlines) : [], approvals: db.prepare("SELECT * FROM approvals WHERE owner_id=?").all(ownerId) as ApprovalRow[], rules: ownerRules(ownerId), now: new Date() });
  };

  const oauth = new LaunchpadOAuth(db, cfg, session, ownerAllowed);
  oauth.install(app, requireOwner, csrfOk);

  // --- pre-auth CSRF for the demo login (bounded, one-time, browser-bound) ---
  const preauth = new Map<string, number>();
  function issuePreauth(res: Response): string {
    const now = Date.now();
    for (const [k, exp] of preauth) if (exp < now) preauth.delete(k);
    while (preauth.size >= 500) preauth.delete(preauth.keys().next().value as string);
    const token = randomBytes(24).toString("base64url");
    preauth.set(sha256(token), now + 600_000);
    res.append("set-cookie", `lp_preauth=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${cfg.production ? "; Secure" : ""}`);
    return token;
  }
  const demoAttempts = new Map<string, number[]>();
  function demoLoginRateOk(req: Request): boolean {
    const ip = req.ip || req.socket.remoteAddress || "?";
    const now = Date.now();
    const recent = (demoAttempts.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 20) { demoAttempts.set(ip, recent); return false; }
    recent.push(now);
    demoAttempts.set(ip, recent);
    if (demoAttempts.size > 1000) demoAttempts.clear();
    return true;
  }

  app.get("/health", (_req, res) => res.json({ ok: true, demo: cfg.demo, model_mode: publicCards ? "public_cards" : cfg.modelMode === "disabled" ? "disabled" : "test", live_inference: publicCards ? "enabled" : "disabled", catalog_size: loadCatalog().length, release_sha: releaseSha }));
  app.get("/login", (req, res) => {
    const token = cfg.demo ? issuePreauth(res) : "";
    res.type("html").send(publicPage(req, res, tr(langOf(res))("Logi sisse", "Sign in"), loginBody({ lang: langOf(res), demo: cfg.demo, google: !!cfg.googleClientId, preauth: token, companies: DEMO_COMPANIES, toConsent: req.query.return_to === CONSENT_PATH })));
  });
  app.post("/auth/demo", (req, res) => {
    if (!cfg.demo) return res.status(403).send("Demo login is disabled. It can only be enabled by server environment in local development, never by a web request.");
    if (!isLoopback(req)) return res.status(403).send("Synthetic demo login is local-only.");
    if (!demoLoginRateOk(req)) return res.status(429).send("Too many demo login attempts. Wait a minute and try again.");
    const given = String(bodyOf(req).preauth ?? "");
    const cookie = cookieVal(req, "lp_preauth") ?? "";
    const stored = preauth.get(sha256(given));
    if (!given || !safeEqual(given, cookie) || !stored || stored < Date.now()) return res.status(403).send("Demo login needs the form from the login page in this browser. Open /login and try again.");
    preauth.delete(sha256(given)); // one-time
    const c = DEMO_COMPANIES.find((x) => x.key === String(bodyOf(req).actor ?? ""));
    if (!c) return res.status(400).send("Unknown synthetic demo company.");
    const ownerId = ensureOwner(`demo-${c.key}`, null, "demo", c.label);
    seedDemoFixture(ownerId, c.key);
    res.setHeader("set-cookie", "lp_preauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    startSession(req, res, ownerId);
    logActivity(db, ownerId, "owner", "demo_login", "ok", "Synthetic demo login.");
    res.redirect(oauth.resume(req));
  });
  app.post("/auth/logout", requireOwner, csrfOk, (req, res) => {
    const raw = cookieVal(req, "lp_session");
    if (raw) db.prepare("DELETE FROM sessions WHERE id_hash=?").run(sha256(raw));
    res.setHeader("set-cookie", "lp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    res.redirect("/login");
  });

  // --- Google OIDC: identity only, browser-bound, one-time, bounded ---
  // `connect` is server-side and browser-bound with the flow: a login that
  // started from a pending authorize resumes that exact request at consent.
  const oidcFlows = new Map<string, { codeVerifier: string; nonce: string; expires: number; bindHash: string; connect: string }>();
  function pruneFlows() {
    const now = Date.now();
    for (const [k, v] of oidcFlows) if (v.expires < now) oidcFlows.delete(k);
    while (oidcFlows.size >= 100) oidcFlows.delete(oidcFlows.keys().next().value as string);
  }
  app.get("/auth/login/google", async (req, res) => {
    if (!cfg.googleClientId || !cfg.googleClientSecret) return res.status(503).send("Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the redirect URI is http://localhost:3000/auth/callback/google.");
    try {
      const oidc = await import("openid-client");
      const config = await oidc.discovery(new URL("https://accounts.google.com"), cfg.googleClientId, cfg.googleClientSecret);
      const codeVerifier = oidc.randomPKCECodeVerifier(); const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
      const state = oidc.randomState(); const nonce = oidc.randomNonce();
      const bind = randomBytes(24).toString("base64url");
      // return_to is never used as a URL: absent or exactly the consent path,
      // and only with this browser's live pending authorize; anything else -> "/".
      const asked = req.query.return_to;
      const connect = (asked === undefined || asked === CONSENT_PATH) && oauth.pending(req) ? connectCookie(req) : "";
      pruneFlows();
      oidcFlows.set(state, { codeVerifier, nonce, expires: Date.now() + 600_000, bindHash: sha256(bind), connect });
      res.setHeader("set-cookie", `lp_oidc=${encodeURIComponent(bind)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${cfg.production ? "; Secure" : ""}`);
      const url = oidc.buildAuthorizationUrl(config, { redirect_uri: `${cfg.baseUrl}/auth/callback/google`, scope: "openid email", code_challenge: codeChallenge, code_challenge_method: "S256", state, nonce });
      res.redirect(url.href);
    } catch {
      res.status(503).send("Google sign-in could not be started. The identity provider may be unreachable — try again later. Nothing was signed in.");
    }
  });
  app.get("/auth/callback/google", async (req, res) => {
    if (!cfg.googleClientId || !cfg.googleClientSecret) return res.status(503).send("Google sign-in is not configured.");
    const state = String(req.query.state ?? "");
    const flow = oidcFlows.get(state);
    const bind = cookieVal(req, "lp_oidc") ?? "";
    // Browser binding is checked BEFORE the flow is consumed: a callback
    // replayed into another browser (or with no cookie) never authenticates.
    if (!flow || flow.expires < Date.now() || !safeEqual(sha256(bind), flow.bindHash)) return res.status(400).send("Sign-in did not start in this browser, or it expired. Start again from /login.");
    oidcFlows.delete(state); // one-time, now that the initiating browser proved itself
    res.setHeader("set-cookie", "lp_oidc=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    try {
      const oidc = await import("openid-client");
      const config = await oidc.discovery(new URL("https://accounts.google.com"), cfg.googleClientId, cfg.googleClientSecret);
      oidc.enableNonRepudiationChecks(config);
      const tokens = await oidc.authorizationCodeGrant(config, new URL(`${cfg.baseUrl}${req.originalUrl}`), { pkceCodeVerifier: flow.codeVerifier, expectedState: state, expectedNonce: flow.nonce });
      const claims = tokens.claims(); // issuer/audience/expiry/signature verified by the library
      if (!claims?.sub) throw new Error("no subject");
      // Pilot allowlist is checked on the verified subject BEFORE any owner,
      // workspace or session is created. Generic 403: no subject/email echo.
      if (allowedSubjects && !allowedSubjects.has(claims.sub)) return res.status(403).send("Access is not available for this account.");
      const ownerId = ensureOwner(`google:${claims.sub}`, typeof claims.email === "string" ? claims.email : null, "google", "My company (name it via your assistant)");
      // Real workspaces are never seeded with synthetic fixtures.
      startSession(req, res, ownerId);
      res.redirect(oauth.continueAfterLogin(res, flow.connect) ? CONSENT_PATH : "/");
    } catch {
      res.status(401).send("Google sign-in could not be verified.");
    }
  });

  // GET /: the public landing for visitors; signed-in owners get "Täna". A
  // browser that still presents a session cookie that is no longer valid is
  // sent to sign in again (unchanged behaviour for authenticated sessions).
  app.get("/", (req, res, next) => {
    if (session(req) || cookieVal(req, "lp_session")) return next();
    res.type("html").send(publicPage(req, res, tr(langOf(res))("Kontoritöö teeb sinu AI-assistent", "Your AI assistant does the office work"), landingBody({ lang: langOf(res), demo: cfg.demo })));
  }, requireOwner, async (req, res, next) => { try {
    const st = getState(db, oid(req));
    const ref = st.assessment?.company_registry_ref?.trim();
    const deadlines = await ownerDeadlines(st.assessment);
    // Any unavailable register lookup renders the one-line hint (with the plain reason unless only not cached yet).
    const unavailable = deadlines?.ok ? deadlines.result.company.unavailable : undefined;
    // A remembered failed fill shows its reason, not "loading".
    const failure = unavailable === "not_cached" ? fillFailure(ref!) : undefined;
    if (unavailable === "not_cached") fillInBackground(ref!);
    expireApprovals(db, oid(req));
    // Every pending approval (request_approval caps them at 20), then the recent approved/consumed slice,
    // then older failed or rejected outcomes (bounded) so they stay in "Ootab sinult".
    const approvals = [...new Map(([
      ...db.prepare("SELECT * FROM approvals WHERE owner_id=? AND state='pending' ORDER BY created_at DESC LIMIT 20").all(oid(req)),
      ...db.prepare("SELECT * FROM approvals WHERE owner_id=? AND state IN ('approved','consumed') ORDER BY created_at DESC LIMIT 50").all(oid(req)),
      ...db.prepare("SELECT * FROM approvals WHERE owner_id=? AND state='consumed' AND json_extract(outcome_json,'$.outcome') IN ('failed','rejected') ORDER BY created_at DESC LIMIT 20").all(oid(req)),
    ] as ApprovalRow[]).map((a) => [a.id, a])).values()];
    const reportCount = (db.prepare("SELECT count(*) n FROM reports WHERE owner_id=?").get(oid(req)) as { n: number }).n;
    const l = langOf(res);
    res.type("html").send(page(req, res, tr(l)("Täna", "Today"), "tana", tanaBody({
      lang: l, csrf: (req as Authed).csrf, sample: (req as Authed).ownerKind === "demo", label: st.ws.label,
      assessment: st.assessment, coverage: st.coverage, assessedAt: st.assessed_at, exclusions: st.exclusions,
      approvals, progress: st.progress as unknown as { task_id: string; milestone: string; observed_at: string }[],
      // A checksum-invalid ref is the only lookup that computes nothing: say so instead of dropping the section.
      deadlines: !deadlines ? null : !deadlines.ok ? "invalid_code" : failure?.unavailable === "not_found" ? "not_found" : failure ? { unavailable_reason: failure.reason } : unavailable === "not_cached" ? "not_cached" : unavailable ? { unavailable_reason: deadlines.result.company.unavailable_reason ?? unavailable } : deadlines.result as DeadlinesView,
      needs: ownerNeeds(db, oid(req)), reportCount, rules: ownerRules(oid(req)), handover: ownerHandover(oid(req), st.assessment, deadlines),
    })));
  } catch (e) { next(e); } });
  app.post("/unmet-needs/decide", requireOwner, csrfOk, (req, res) => {
    const body = bodyOf(req);
    const extra = Object.keys(body).filter((k) => !["csrf", "need_id", "decision"].includes(k));
    const decision = body.decision === "publish" || body.decision === "keep_private" ? body.decision : null;
    const t = tr(langOf(res));
    if (extra.length || !decision || typeof body.need_id !== "string") return ownerError(req, res, 400, t("Vali üks", "Choose one"), t("Vali „Avalda anonüümselt” või „Jäta privaatseks”. Midagi ei muudetud.", "Choose Publish anonymously or Keep private. Unexpected fields are rejected; nothing was changed."));
    const r = decideNeed(db, oid(req), body.need_id, decision);
    if (r === "not_found") return ownerError(req, res, 404, t("Soovi ei leitud", "Request not found"), t("Sellist soovi sinu tööruumis pole. Midagi ei muudetud.", "Request not found. Nothing was changed."));
    if (r === "not_awaiting") return ownerError(req, res, 409, t("Juba otsustatud", "Already decided"), t("See soov ei oota otsust. Midagi ei muudetud.", "This request is not waiting for a decision. Nothing was changed."));
    logActivity(db, oid(req), "owner", decision === "publish" ? "unmet_need_published" : "unmet_need_kept_private", "ok", decision === "publish" ? "Unmet need published anonymously as open demand (category, label and spec only)." : "Unmet need kept private; it is never published.");
    res.redirect("/");
  });
  // Public, login-free synthetic walkthrough. These routes never look up a
  // session or read owner data; the only inputs are the fixed in-code rows.
  for (const [path, step, titleEt, titleEn] of [
    ["/naidis", "tana", "Täna", "Today"],
    ["/naidis/kinnitus", "kinnitus", "Kinnitus", "Approval"],
    ["/naidis/tehtud", "tehtud", "Tehtud", "Done"],
  ] as const) app.get(path, (req, res) => {
    // As on /demand, a language-selecting response is private and sets no cookie here.
    if (!parseLang(req.query.lang)) res.set({ "cache-control": "public, max-age=300", vary: "Cookie" });
    const l = langOf(res);
    res.type("html").send(publicPage(req, res, tr(l)(titleEt, titleEn), naidisBody(step, l), { sample: true }));
  });
  app.get("/naidis/kinnitus/:id", (req, res) => {
    if (!parseLang(req.query.lang)) res.set({ "cache-control": "public, max-age=300", vary: "Cookie" });
    const l = langOf(res), a = naidisApproval(req.params.id);
    if (!a) {
      const title = tr(l)("Kinnitust ei leitud", "Approval not found");
      return res.status(404).type("html").send(publicPage(req, res, title, errorBody(l, title, tr(l)("Seda näidiskinnitust pole.", "This sample approval does not exist."), { href: `/naidis${l === "en" ? "?lang=en" : ""}`, label: tr(l)("Tagasi näidisesse", "Back to the sample") }), { sample: true }));
    }
    res.type("html").send(publicPage(req, res, tr(l)("Kinnitus", "Approval"), naidisBody("kinnitus", l, a), { sample: true }));
  });

  // Public, login-free aggregate of owner-approved demand. Never reads
  // owner, company or request text; briefly cacheable.
  app.get("/demand", (req, res) => {
    // Shared caches may keep it briefly, per language cookie; never a response that sets the cookie.
    if (!parseLang(req.query.lang)) res.set({ "cache-control": "public, max-age=60", vary: "Cookie" });
    res.type("html").send(publicPage(req, res, tr(langOf(res))("Avatud soovid", "Open demand"), demandBody(aggregateDemand(db), langOf(res))));
  });

  app.get("/activity", requireOwner, (req, res) => {
    const rows = db.prepare("SELECT actor,action,outcome,summary,created_at FROM activity WHERE owner_id=? ORDER BY id DESC LIMIT 100").all(oid(req)) as Record<string, string>[];
    const receipts = db.prepare("SELECT kind,report_id,payload_json,receipt_json,created_at FROM reports WHERE owner_id=? ORDER BY created_at DESC LIMIT 20").all(oid(req)) as Record<string, string>[];
    const st = getState(db, oid(req));
    res.type("html").send(page(req, res, tr(langOf(res))("Tehtud", "Done"), "tehtud", activityBody({ rows, receipts, exclusions: st.exclusions, assessment: st.assessment, sample: (req as Authed).ownerKind === "demo", lang: langOf(res), approvals: db.prepare("SELECT * FROM approvals WHERE owner_id=?").all(oid(req)) as ApprovalRow[], rules: ownerRules(oid(req)) })));
  });

  app.get("/playbooks", requireOwner, (req, res) => {
    // Saved friction cards only: this GET never starts inference.
    const friction = publicCards ? publicCards.readFrictionCards().map((c) => ({ ...c, label: findTopic(FRICTION_TOPICS, c.topicId)!.label[c.locale] })) : undefined;
    res.type("html").send(page(req, res, tr(langOf(res))("Mängukavad", "Playbooks"), "none", playbooksBody(langOf(res), PLAYBOOKS, friction)));
  });
  // Public research catalogue (ET first). Signed-in owners keep their nav; never cached (the shell carries their CSRF).
  app.get("/kataloog", (req, res) => {
    const s = session(req), l = langOf(res);
    const q = String(req.query.q ?? "").trim().slice(0, 120);
    const g = CATALOGUE_GROUPS.find((x) => x.id === req.query.g)?.id ?? null;
    const matched = q ? new Set(searchServices(q, Infinity).map((r) => r.id)) : null;
    res.type("html").send(shell({ title: tr(l)("Kataloog", "Catalogue"), active: "none", csrf: s?.csrf ?? "", lang: l, toggle: toggleHref(req, l), body: catalogueBody({ lang: l, q, g, records: loadCatalog(), matched }) }));
  });
  app.get("/services", (req, res) => {
    const p = new URLSearchParams();
    for (const k of ["lang", "g", "q"] as const) { const v = req.query[k]; if (typeof v === "string" && v && (k !== "lang" || parseLang(v))) p.set(k, v.slice(0, 120)); }
    res.redirect(302, p.size ? `/kataloog?${p}` : "/kataloog");
  });

  const setupPublicCards = (card: PublicCardView | null) => ({ topics: SETUP_TOPICS.map((t) => ({ id: t.id, label: t.label.en })), card });
  app.get("/setup", requireOwner, (req, res) => res.type("html").send(page(req, res, "Setup helper", "none", setupBody({ csrf: (req as Authed).csrf, result: null, ...(publicCards ? { publicCards: setupPublicCards(null) } : {}) }), { bodyLang: "en" })));
  app.post("/setup", requireOwner, csrfOk, async (req, res) => {
    if (publicCards) {
      // Explicit fixed-topic generation only: current allowlisted Google
      // (never demo) owner + CSRF (above) before any reservation. The
      // session check already enforces the allowlist; kind is re-checked
      // here so a non-Google owner can never allocate.
      if ((req as Authed).ownerKind !== "google" || !ownerAllowed(oid(req))) return res.status(403).send("Access is not available for this account.");
      const body = bodyOf(req);
      const extra = Object.keys(body).filter((k) => !["csrf", "topic", "locale"].includes(k));
      const topic = findTopic(SETUP_TOPICS, body.topic);
      const locale = parseLocale(body.locale);
      if (extra.length || !topic || !locale) return res.status(400).send("Choose one of the listed topics and languages. Unexpected fields are rejected; nothing was generated.");
      const setupOwnerId = oid(req);
      let card: PublicCardView;
      try { card = await publicCards.generate(topic, locale); }
      catch { return res.status(503).send("Guidance is unavailable right now. The Connection page steps still work."); }
      // Race: /delete during the await clears activity and invalidates this
      // session; resuming must not recreate owner data for a dead session.
      const still = session(req);
      if (!still || still.owner_id !== setupOwnerId) return res.redirect("/login");
      logActivity(db, setupOwnerId, "owner", "setup_guidance_card", card.state === "completed" ? "ok" : card.state, `Generic public setup guidance card (${topic.id}/${locale}): ${card.state}${card.replayed ? ", saved replay" : ""}. No owner data was sent to the model.`);
      return res.type("html").send(page(req, res, "Setup helper", "none", setupBody({ csrf: (req as Authed).csrf, result: null, publicCards: setupPublicCards(card) }), { bodyLang: "en" }));
    }
    const topic = String(bodyOf(req).topic ?? "").slice(0, 100);
    let result: string;
    try {
      // Always the deterministic fixture provider: live inference is disabled
      // in this runtime whatever MODEL_MODE says (runModelJob also enforces).
      const r = await runModelJob({ mode: cfg.modelMode === "disabled" ? "disabled" : "test", job: "setup_guidance", input: topic });
      result = r.output;
    } catch { result = "Setup guidance is unavailable in this configuration. The Connection page steps still work."; }
    logActivity(db, oid(req), "owner", "setup_guidance", "ok", "Setup guidance shown (deterministic mock fixture; no live model called).");
    res.type("html").send(page(req, res, "Setup helper", "none", setupBody({ csrf: (req as Authed).csrf, result }), { bodyLang: "en" }));
  });

  // Calendar feed (#29): the unguessable token in the path is the only
  // credential. Rendered from the cache only, rules only, and only rule
  // output plus the company's public or synthetic name: no approvals, needs
  // or assessment content. A cache miss starts Täna's background fill, so
  // the next calendar refresh has the events.
  const feedAllowed = feedLimiter();
  // The token is in the URL: no shared cache may keep the feed, its refusals or the one-time page.
  const privateNoStore = { "cache-control": "private, no-store" };
  app.get("/calendar/:file", async (req, res, next) => { try {
    res.set(privateNoStore);
    const m = /^([A-Za-z0-9_-]{43})\.ics$/.exec(req.params.file);
    const hash = m ? sha256(m[1]) : "";
    const feed = m ? db.prepare("SELECT owner_id FROM calendar_feeds WHERE token_hash=?").get(hash) as { owner_id: string } | undefined : undefined;
    if (!feed || !ownerAllowed(feed.owner_id)) return res.status(404).end();
    if (!feedAllowed(hash)) return res.status(429).set("retry-after", "3600").end();
    const ref = getState(db, feed.owner_id).assessment?.company_registry_ref?.trim();
    const base = { host: new URL(cfg.baseUrl).hostname, now: new Date(), company: null, obligations: [] };
    let body: string;
    if (!ref || !/^\d{8}$/.test(ref)) body = deadlinesCalendar({ ...base, emptyReason: ICS_NO_COMPANY });
    else {
      const r = await companyObligations(register, { registryCode: ref, months: 3, cacheOnly: true });
      const gap = !r.ok ? r.unavailable ?? "invalid_code" : r.result.company.unavailable;
      // A remembered failed fill gives its reason: not_found as such, anything else "unavailable", not "loading".
      const failure = gap === "not_cached" ? fillFailure(ref) : undefined;
      if (gap === "not_cached") fillInBackground(ref);
      const company = r.ok && r.result.company.name ? { name: r.result.company.name, synthetic: r.result.company.synthetic } : null;
      body = gap || !r.ok
        ? deadlinesCalendar({ ...base, company, emptyReason: `${(failure ? failure.unavailable === "not_found" && REGISTER_GAP_ET.not_found : REGISTER_GAP_ET[gap ?? ""]) || "Avalik register pole praegu kättesaadav"}. Sündmusi ei loodud.` })
        : deadlinesCalendar({ ...base, company, obligations: r.result.obligations.filter((o) => o.effective_due !== null && (o.kind === "risk" || o.effective_due >= r.result.window.from)) });
    }
    res.set("pragma", "no-cache").type("text/calendar; charset=utf-8").send(body);
  } catch (e) { next(e); } });
  app.post("/calendar/feed", requireOwner, csrfOk, (req, res) => {
    const raw = randomBytes(32).toString("base64url");
    db.prepare("INSERT INTO calendar_feeds(owner_id,token_hash,created_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at").run(oid(req), sha256(raw), nowIso());
    logActivity(db, oid(req), "owner", "calendar_feed_created", "ok", "Calendar feed created (one per owner; a new one replaces the old address).");
    // One-time display in this POST response, like manual tokens.
    const l = langOf(res);
    res.set(privateNoStore).type("html").send(page(req, res, tr(l)("Kalendri aadress", "Calendar address"), "uhendus", calendarOnceBody(l, `${cfg.baseUrl.replace(/\/+$/, "")}/calendar/${raw}.ics`)));
  });
  app.post("/calendar/feed/revoke", requireOwner, csrfOk, (req, res) => {
    db.prepare("DELETE FROM calendar_feeds WHERE owner_id=?").run(oid(req));
    logActivity(db, oid(req), "owner", "calendar_feed_revoked", "ok", "Calendar feed stopped; its address now returns 404.");
    res.redirect("/uhenda");
  });

  app.get("/connection", requireOwner, (req, res) => {
    const owner = db.prepare("SELECT reporting_enabled FROM owners WHERE id=?").get(oid(req)) as { reporting_enabled: number };
    const tokens = db.prepare("SELECT id,scopes,revoked,created_at,last_used_at FROM mcp_tokens WHERE owner_id=? ORDER BY created_at DESC").all(oid(req)) as Record<string, unknown>[];
    const candidates = db.prepare("SELECT id,name,connection,jobs,status,created_at FROM candidates WHERE owner_id=? ORDER BY created_at DESC").all(oid(req)) as Record<string, string>[];
    res.type("html").send(page(req, res, tr(langOf(res))("Andmed ja õigused", "Connection & data"), "none", connectionBody({ lang: langOf(res), csrf: (req as Authed).csrf, baseUrl: cfg.baseUrl, reportingEnabled: owner.reporting_enabled === 1, tokens, candidates, milestones: getAssistantMilestones(db, oid(req)), grants: db.prepare("SELECT g.id,g.scopes,g.revoked,g.expires,g.redirect,c.metadata FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.owner_id=? ORDER BY g.rowid DESC").all(oid(req)) as Record<string, string>[] })));
  });
  app.post("/tokens", requireOwner, csrfOk, (req, res) => {
    const owner = db.prepare("SELECT epoch FROM owners WHERE id=?").get(oid(req)) as { epoch: number };
    const active = db.prepare("SELECT id FROM mcp_tokens WHERE owner_id=? AND revoked=0 ORDER BY created_at ASC, rowid ASC").all(oid(req)) as { id: string }[];
    for (const extra of active.slice(0, Math.max(0, active.length - 9))) db.prepare("UPDATE mcp_tokens SET revoked=1 WHERE id=?").run(extra.id);
    const raw = `lp_${randomBytes(32).toString("base64url")}`;
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,?,?,?)").run(newId("tok"), oid(req), sha256(raw), "progress:read,progress:report", owner.epoch, nowIso());
    logActivity(db, oid(req), "owner", "token_issue", "ok", "Assistant token issued (max 10 active; oldest auto-revoked beyond that).");
    // One-time display in this POST response. The raw token never appears in a URL.
    res.type("html").send(page(req, res, "New assistant token", "none", tokenOnceBody(raw), { bodyLang: "en" }));
  });
  app.post("/tokens/revoke", requireOwner, csrfOk, (req, res) => {
    db.prepare("UPDATE mcp_tokens SET revoked=1 WHERE id=? AND owner_id=?").run(String(bodyOf(req).token_id ?? ""), oid(req));
    logActivity(db, oid(req), "owner", "token_revoke", "ok", "Assistant token revoked.");
    res.redirect("/connection");
  });
  app.post("/reporting", requireOwner, csrfOk, (req, res) => {
    db.prepare("UPDATE owners SET reporting_enabled=? WHERE id=?").run(bodyOf(req).enabled === "1" ? 1 : 0, oid(req));
    res.redirect("/connection");
  });
  app.post("/candidates/delete", requireOwner, csrfOk, (req, res) => {
    db.prepare("DELETE FROM candidates WHERE id=? AND owner_id=?").run(String(bodyOf(req).candidate_id ?? ""), oid(req));
    logActivity(db, oid(req), "owner", "candidate_delete", "ok", "Own service nomination deleted.");
    res.redirect("/connection");
  });

  // Approval cards: the owner decides on the exact payload the assistant
  // requested over MCP. Launchpad itself never sends, pays or files.
  app.get("/approvals", requireOwner, (req, res) => {
    expireApprovals(db, oid(req));
    const rows = db.prepare("SELECT * FROM approvals WHERE owner_id=? ORDER BY state='pending' DESC, created_at DESC LIMIT 200").all(oid(req)) as ApprovalRow[];
    res.type("html").send(page(req, res, tr(langOf(res))("Kinnitused", "Approvals"), "none", approvalsListBody(rows, langOf(res), (req as Authed).ownerKind === "demo")));
  });
  app.get("/approvals/:id", requireOwner, async (req, res, next) => { try {
    const t = tr(langOf(res));
    const a = getApproval(db, oid(req), req.params.id);
    if (!a) return ownerError(req, res, 404, t("Kinnitust ei leitud", "Approval not found"), t("Sellist kinnitust sinu tööruumis pole. Midagi ei kinnitatud.", "Approval not found in your workspace. Nothing was approved."));
    // Once the assistant has recorded a done outcome, the receipt shows the owner's „Käest ära” strip (#63).
    const assessment = isDone(a) ? getState(db, oid(req)).assessment : null;
    const handover = isDone(a) ? ownerHandover(oid(req), assessment, await ownerDeadlines(assessment)) : undefined;
    res.type("html").send(page(req, res, t("Kinnitus", "Approval"), "none", approvalCardBody({ csrf: (req as Authed).csrf, a, lang: langOf(res), sample: (req as Authed).ownerKind === "demo", rules: ownerRules(oid(req)), handover,
      // The same default cap as the Ühendus offer, from this send and the owner's past approvals of its job (QA m4).
      capCents: offerCapCents(largestAmount([a, ...standingBasis(db.prepare("SELECT * FROM approvals WHERE owner_id=? AND kind=?").all(oid(req), a.kind ?? "") as ApprovalRow[], a.kind ?? "")])) })));
  } catch (e) { next(e); } });
  app.post("/approvals/:id/decide", requireOwner, csrfOk, (req, res) => {
    const t = tr(langOf(res));
    const decision = bodyOf(req).decision;
    if (decision !== "approve" && decision !== "decline") return ownerError(req, res, 400, t("Vali üks", "Choose one"), t("Vali „Kinnita täpselt see” või „Keeldu”. Midagi ei kinnitatud ega keeldutud.", "Choose Approve exactly this or Decline. Nothing was approved or declined."));
    const a = getApproval(db, oid(req), req.params.id);
    if (!a) return ownerError(req, res, 404, t("Kinnitust ei leitud", "Approval not found"), t("Sellist kinnitust sinu tööruumis pole. Midagi ei kinnitatud ega keeldutud.", "Approval not found in your workspace. Nothing was approved or declined."));
    if (a.state === "expired") return ownerError(req, res, 409, t("Kinnitus on aegunud", "This approval expired"), t("See kinnitus on aegunud. Midagi ei kinnitatud ega keeldutud. Palu assistendil uus koostada.", "This approval expired. Nothing was approved or declined. Ask your assistant for a new one."));
    if (a.state !== "pending") return ownerError(req, res, 409, t("Juba otsustatud", "Already decided"), t("Selle kinnituse kohta on otsus juba tehtud. Midagi ei kinnitatud ega keeldutud; vajadusel palu assistendil uus koostada.", `This approval is already ${a.state}. Nothing was approved or declined; ask your assistant for a new approval if needed.`));
    // A re-rendered card after a change can never approve a different payload.
    if (!safeEqual(String(bodyOf(req).digest ?? ""), a.digest)) return ownerError(req, res, 409, t("Kaart on vananenud", "This card is out of date"), t("Midagi muutus pärast seda, kui kaardi avasid. Midagi ei kinnitatud. Ava kinnitus uuesti.", "Something changed after you opened the card. Nothing was approved. Open the approval again."));
    if (decision === "approve" && approvalAddressMissing(a)) return ownerError(req, res, 409, t("Aadress puudub", "Address missing"), t("Aadress puudub — seda kinnitust ei saa kasutada. Midagi ei kinnitatud. Keeldu ja palu assistendil küsida uus kinnitus koos saaja aadressiga.", "Address missing — this approval cannot be used. Nothing was approved. Decline it and ask your assistant for a new approval with the recipient's address."));
    const state = decision === "approve" ? "approved" : "declined";
    db.prepare("UPDATE approvals SET state=?,decided_at=? WHERE id=? AND owner_id=? AND state='pending'").run(state, nowIso(), a.id, oid(req));
    logActivity(db, oid(req), "owner", "approval_decided", state, `Owner ${state} ${a.kind ?? "action"} (digest ${a.digest.slice(0, 12)}). Launchpad sent, paid and filed nothing.`);
    res.redirect(`/approvals/${encodeURIComponent(a.id)}`);
  });

  // Standing approvals (#45): created from an owner-approved send (its recipient
  // comes from that approval, never the form) or on Ühendus; sends only.
  app.post("/standing-approvals", requireOwner, csrfOk, (req, res) => {
    const t = tr(langOf(res)), body = bodyOf(req);
    const bad = (status: number, message: string) => ownerError(req, res, status, t("Püsiluba ei loodud", "No standing approval was created"), `${message} ${t("Midagi ei muudetud.", "Nothing was changed.")}`);
    const extra = Object.keys(body).filter((k) => !["csrf", "approval_id", "kind", "scope", "max_eur"].includes(k));
    const cents = Math.round(Number(String(body.max_eur ?? "").replace(/[\s\u00a0€]/g, "").replace(",", ".")) * 100);
    if (extra.length || !Number.isSafeInteger(cents) || cents < 100 || cents > 100_000_000) return bad(400, t("Sisesta summa ülempiir eurodes (1 kuni 1 000 000 €).", "Enter an amount cap in euros (€1 to €1,000,000)."));
    let kind: string, recipients: string[] | null, back: string;
    if (body.approval_id !== undefined) {
      const a = getApproval(db, oid(req), String(body.approval_id));
      if (!a || !STANDING_KINDS.includes(a.kind ?? "") || !a.decided_at || a.state === "declined" || a.approved_by_rule || approvalAddressMissing(a)) return bad(404, t("Püsiloa saab luua ainult saatmisest, mille sina kinnitasid.", "A standing approval can only start from a send you approved."));
      if (body.scope !== "recipient" && body.scope !== "any") return bad(400, t("Vali, kellele püsiluba kehtib.", "Choose who the standing approval covers."));
      kind = a.kind!;
      recipients = body.scope === "any" ? null : [normAddress(String((JSON.parse(a.payload_json) as { recipient: { address: string } }).recipient.address))];
      back = `/approvals/${encodeURIComponent(a.id)}#pusiluba`;
    } else {
      if (!STANDING_KINDS.includes(String(body.kind ?? ""))) return bad(400, t("Püsiluba saab anda ainult sõnumitele ja arvetele. Deklaratsioone ja makseid kinnitad alati ise.", "Standing approvals cover only messages and invoices. You always confirm filings and payments yourself."));
      kind = String(body.kind);
      if (body.scope === "any") recipients = null;
      else if (body.scope === "approved") {
        // The recipients the owner has already approved once for this kind.
        const rows = standingBasis(db.prepare("SELECT * FROM approvals WHERE owner_id=? AND kind=?").all(oid(req), kind) as ApprovalRow[], kind);
        recipients = [...new Set(rows.flatMap((r) => { try { const x = (JSON.parse(r.payload_json) as { recipient?: { address?: unknown } }).recipient?.address; return typeof x === "string" && x.trim() ? [normAddress(x)] : []; } catch { return []; } }))];
        if (!recipients.length) return bad(409, t("Sa pole sellist saatmist veel kinnitanud. Vali „Kõik saajad (ka uued)” või kinnita enne üks saatmine.", "You have not approved such a send yet. Choose “Any recipient (including new ones)” or approve one send first."));
      } else return bad(400, t("Vali, kellele püsiluba kehtib.", "Choose who the standing approval covers."));
      back = "/uhenda#pusiload";
    }
    if (liveStandingRules(db, oid(req)).length >= 20 || ownerRules(oid(req)).length >= 100) return bad(409, t("Püsilubasid on liiga palju. Lõpeta mõni, enne kui uue lisad.", "Too many standing approvals. End one before adding another."));
    const rule = { id: newId("rule"), kind, recipients_json: recipients === null ? null : JSON.stringify(recipients), max_amount_cents: cents };
    db.prepare("INSERT INTO standing_approvals(id,owner_id,kind,recipients_json,max_amount_cents,max_per_day,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(rule.id, oid(req), kind, rule.recipients_json, cents, STANDING_DEFAULTS.maxPerDay, new Date(Date.now() + STANDING_DEFAULTS.days * 86_400_000).toISOString(), nowIso());
    logActivity(db, oid(req), "owner", "standing_rule_created", "ok", `Standing approval ${rule.id} set: ${standingRuleName(rule, "en")}, up to ${STANDING_DEFAULTS.maxPerDay} a day, ${STANDING_DEFAULTS.days} days.`);
    res.redirect(back);
  });
  app.post("/standing-approvals/revoke", requireOwner, csrfOk, (req, res) => {
    const id = String(bodyOf(req).rule_id ?? "");
    // Ending a rule also cancels what it approved but the assistant has not yet acted on (state approved = no outcome recorded).
    const ended = db.transaction(() => {
      const r = db.prepare("UPDATE standing_approvals SET revoked_at=? WHERE id=? AND owner_id=? AND revoked_at IS NULL").run(nowIso(), id, oid(req));
      return r.changes ? db.prepare("UPDATE approvals SET state='expired' WHERE owner_id=? AND approved_by_rule=? AND state='approved'").run(oid(req), id).changes : null;
    })();
    if (ended !== null) logActivity(db, oid(req), "owner", "standing_rule_revoked", "ok", `Standing approval ${id} ended; it approves nothing from now on. ${ended} approved, unused approval expired.`);
    res.redirect("/uhenda#pusiload");
  });

  // Opens Claude or ChatGPT with the guide already typed in (not sent). The host is fixed.
  // The phone app takes over the navigation and leaves this tab showing the 302 body.
  app.get("/uhenda/ava", (req, res) => {
    const assistant = req.query.a === "chatgpt" ? "chatgpt" : "claude";
    const l = langOf(res);
    const endpoint = `${String(cfg.baseUrl ?? "").replace(/\/+$/, "")}/mcp`;
    const prompt = assistantGuidePrompt(l, assistant, endpoint);
    const target = `${assistant === "chatgpt" ? "https://chatgpt.com/?q=" : "https://claude.ai/new?q="}${encodeURIComponent(prompt)}`;
    const name = assistant === "claude" ? "Claude" : "ChatGPT";
    // Estonian object case is not a suffix: Claude'i (apostrophe, same as Claude'iga); ChatGPT takes none.
    const openedEt: Record<typeof assistant, string> = { claude: "Claude'i", chatgpt: "ChatGPT" };
    const t = tr(l);
    const s = session(req);
    const opened = t(`Avasin ${openedEt[assistant]}`, `Opened ${name}`);
    const body = `<h1>${esc(opened)}</h1><p>${esc(t(`Kui ${name} ei avanenud,`, `If ${name} did not open,`))} <a class="btn" href="${esc(target)}">${esc(t("vajuta siia", "press here"))}</a>.</p><p><a class="tap-link" href="/uhenda">${esc(t("Tagasi: Ühendus", "Back: Connection"))}</a></p>`;
    res.status(302).location(target).type("html").send(shell({ title: opened, active: s ? "uhendus" : "none", csrf: s?.csrf ?? "", lang: l, toggle: toggleHref(req, l), body }));
  });

  // Connect (spec screen 2): public page; the status chip needs a signed-in owner.
  app.get("/uhenda", async (req, res, next) => { try {
    const s = session(req), l = langOf(res);
    const kind = s ? (db.prepare("SELECT kind FROM owners WHERE id=?").get(s.owner_id) as { kind: string } | undefined)?.kind ?? "" : "";
    let state: ConnectState = { kind: "anon" };
    if (s) {
      if (kind === "demo") state = { kind: "sample" };
      else {
        // Each credential's own last use: an OAuth grant names its client; a manual token stays unnamed.
        const g = db.prepare("SELECT c.metadata, g.last_used_at at FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.owner_id=? AND g.revoked=0 AND g.expires>? AND g.last_used_at IS NOT NULL ORDER BY g.last_used_at DESC LIMIT 1").get(s.owner_id, Date.now()) as { metadata: string; at: string } | undefined;
        const tok = db.prepare("SELECT max(last_used_at) at FROM mcp_tokens WHERE owner_id=? AND revoked=0").get(s.owner_id) as { at: string | null };
        if (tok.at && (!g || tok.at > g.at)) state = { kind: "connected", who: null, at: tok.at };
        else if (g) {
          let who: string | null = null;
          try { const n = (JSON.parse(g.metadata) as { client_name?: unknown }).client_name; who = typeof n === "string" && n.trim() ? n.trim().slice(0, 40) : null; } catch { who = null; }
          state = { kind: "connected", who, at: g.at };
        } else state = { kind: "waiting" };
      }
    }
    const assessment = s ? getState(db, s.owner_id).assessment : null;
    const feed = s ? db.prepare("SELECT created_at FROM calendar_feeds WHERE owner_id=?").get(s.owner_id) as { created_at: string } | undefined : undefined;
    const body = await connectBody({ lang: l, baseUrl: cfg.baseUrl, assistant: req.query.a === "chatgpt" ? "chatgpt" : "claude", state, owner: !!s, expanded: req.query.naita === "1", ...(s ? { calendar: { csrf: s.csrf, createdAt: feed?.created_at ?? null }, standing: { csrf: s.csrf, rules: liveStandingRules(db, s.owner_id) }, handover: ownerHandover(s.owner_id, assessment, await ownerDeadlines(assessment)) } : {}) });
    res.type("html").send(shell({ title: tr(l)("Ühenda", "Connect"), active: s ? "uhendus" : "none", csrf: s?.csrf ?? "", lang: l, sample: kind === "demo", toggle: toggleHref(req, l), body,
      // Zero JS: while an owner waits for the first assistant contact, the page reloads itself.
      head: state.kind === "waiting" ? '<meta http-equiv="refresh" content="5">' : "" }));
  } catch (e) { next(e); } });

  app.get("/export", requireOwner, (req, res) => {
    const data = { workspace: getState(db, oid(req)).ws, assessments: db.prepare("SELECT version,payload_json,created_at FROM assessments WHERE owner_id=?").all(oid(req)), progress: db.prepare("SELECT * FROM progress WHERE owner_id=?").all(oid(req)), candidates: db.prepare("SELECT id,name,connection,jobs,status,created_at FROM candidates WHERE owner_id=?").all(oid(req)), activity: db.prepare("SELECT actor,action,outcome,summary,created_at FROM activity WHERE owner_id=?").all(oid(req)), approvals: db.prepare("SELECT id,kind,report_id,payload_json,digest,state,created_at,expires_at,decided_at,consumed_at,outcome_json,approved_by_rule,playbook_id,owner_confirmation FROM approvals WHERE owner_id=?").all(oid(req)), standing_approvals: db.prepare("SELECT id,kind,recipients_json,max_amount_cents,max_per_day,expires_at,created_at,revoked_at FROM standing_approvals WHERE owner_id=?").all(oid(req)), unmet_needs: db.prepare("SELECT id,report_id,need_redacted,blocker,job_hint_redacted,state,reason,category,demand_label,same_as,spec,classified_by,created_at,updated_at,decided_at FROM unmet_needs WHERE owner_id=?").all(oid(req)) };
    res.setHeader("content-disposition", "attachment; filename=launchpad-export.json");
    res.json(data);
  });
  app.post("/delete", requireOwner, csrfOk, (req, res) => {
    db.transaction(() => {
      oauth.revokeOwner(oid(req));
      db.prepare("DELETE FROM oauth_pending WHERE id=?").run(sha256(connectCookie(req)));
      db.prepare("UPDATE owners SET reporting_enabled=0 WHERE id=?").run(oid(req));
      for (const t of ["assessments", "reports", "progress", "activity", "approvals", "candidates", "unmet_needs", "calendar_feeds", "standing_approvals", "statements_read"]) db.prepare(`DELETE FROM ${t} WHERE owner_id=?`).run(oid(req));
      db.prepare("UPDATE mcp_tokens SET revoked=1,last_used_at=NULL WHERE owner_id=?").run(oid(req));
      db.prepare("UPDATE owners SET epoch=epoch+1 WHERE id=?").run(oid(req));
      db.prepare("UPDATE workspaces SET version=0 WHERE owner_id=?").run(oid(req));
      // Invalidate every session: another browser must not silently keep
      // recreating reports after deletion. A fresh one is started below.
      db.prepare("DELETE FROM sessions WHERE owner_id=?").run(oid(req));
    })();
    startSession(req, res, oid(req));
    res.redirect("/");
  });

  // MCP is bearer-only, never cookie-authenticated. Web clients may use CORS;
  // canonical Host protection still runs before these protocol endpoints.
  app.use("/mcp", (req, res, next) => {
    res.set({ "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "WWW-Authenticate, MCP-Protocol-Version", "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id", "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS" });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  // MCP over Streamable HTTP (stateless), opaque scoped token auth.
  app.post("/mcp", async (req: Request, res: Response) => {
    try {
      const auth = req.headers.authorization ?? "";
      const raw = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      let token = raw ? db.prepare("SELECT * FROM mcp_tokens WHERE token_hash=?").get(sha256(raw)) as { id: string; owner_id: string; scopes: string; epoch: number; revoked: number } | undefined : undefined;
      let oauthGrant = false;
      if (!token && raw) {
        try {
          const info = await oauth.verifyAccessToken(raw);
          oauthGrant = true;
          token = { id: String(info.extra!.grantId), owner_id: String(info.extra!.ownerId), epoch: Number(info.extra!.epoch), scopes: info.scopes.join(","), revoked: 0 };
        } catch { /* Same controlled 401 for expired/revoked OAuth credentials. */ }
      }
      res.set("WWW-Authenticate", `Bearer resource_metadata="${cfg.baseUrl}/.well-known/oauth-protected-resource/mcp", scope="progress:read progress:report"`);
      if (!token || token.revoked) return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthenticated: a valid Launchpad MCP token is required. Google tokens are never accepted here." }, id: null });
      const owner = db.prepare("SELECT epoch,reporting_enabled FROM owners WHERE id=?").get(token.owner_id) as { epoch: number; reporting_enabled: number } | undefined;
      // Manual MCP bearer tokens follow the same current pilot policy as
      // OAuth access tokens (verifyAccessToken checks it via the grant).
      if (!owner || owner.epoch !== token.epoch || !ownerAllowed(token.owner_id)) return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Token no longer valid (data deleted or token rotated)." }, id: null });
      // Reject unexpected top-level tool fields (the SDK would silently strip
      // forged 'verified'/'paid' claims instead of rejecting the report).
      const rpc = req.body as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } | undefined;
      if (rpc?.method === "tools/call" && rpc.params?.name && Object.hasOwn(TOOL_ARG_KEYS, rpc.params.name)) {
        const extra = Object.keys(rpc.params.arguments ?? {}).filter((k) => !TOOL_ARG_KEYS[rpc.params!.name!].includes(k));
        if (extra.length) return res.json({ jsonrpc: "2.0", id: rpc.id ?? null, result: { content: [{ type: "text", text: `Unexpected field(s) rejected: ${extra.join(", ")}. Reports accept only the documented fields; nothing was saved and no state (verified/paid/approved) can be set by a report.` }], isError: true } });
      }
      const ws = db.prepare("SELECT company_ref,label FROM workspaces WHERE owner_id=?").get(token.owner_id) as { company_ref: string; label: string };
      if (!oauthGrant) touchLastUsed(db, "mcp_tokens", token.id);
      const server = buildMcpServer(db, { ownerId: token.owner_id, scopes: token.scopes.split(","), companyRef: ws.company_ref, label: ws.label, reportingEnabled: owner.reporting_enabled === 1, baseUrl: cfg.baseUrl }, register, { onUnmetNeed: () => unmetNeeds.kick() });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error. Nothing was saved." }, id: null });
    }
  });
  app.all("/mcp", (req, res) => {
    if (!req.headers.authorization) return res.set("WWW-Authenticate", `Bearer resource_metadata="${cfg.baseUrl}/.well-known/oauth-protected-resource/mcp"`).status(401).json({ error: "Bearer authorization required." });
    return res.status(405).json({ error: "POST only (stateless Streamable HTTP)." });
  });

  app.use((_req: Request, res: Response) => res.status(404).send("Not found."));
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    // Controlled errors only: never leak stack traces to the browser.
    const status = typeof err.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (!res.headersSent) res.status(status).send(status === 500 ? "Something went wrong on our side. Nothing was saved. Try again." : "The request could not be processed.");
  });
  return { app, db, unmetNeeds };
}
export { esc };
