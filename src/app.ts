import { LaunchpadOAuth, connectCookie } from "./oauth.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { openDb, sha256, newId, nowIso, type Db } from "./db.js";
import { buildMcpServer, getAssistantMilestones, getState, logActivity, TOOL_ARG_KEYS } from "./mcp.js";
import { PLAYBOOKS, searchServices, loadCatalog } from "./catalog.js";
import { runModelJob } from "./model.js";
import { DEMO_COMPANIES, DEMO_FIXTURES } from "./fixtures.js";
import { esc, shell, loginPage, statusBody, activityBody, connectionBody, tokenOnceBody, approvalsBody, setupBody, servicesBody, playbooksBody } from "./views.js";

export interface Config { demo: boolean; production: boolean; dbPath: string; baseUrl: string; googleClientId?: string; googleClientSecret?: string; modelMode: string; allowedHosts: string[]; releaseSha?: string | null; trustLoopbackProxy?: boolean; googleAllowedSubjects?: string[]; }
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
  return { demo: env.LAUNCHPAD_DEMO === "1" && !production, production, dbPath: env.LAUNCHPAD_DB_PATH ?? "./data/launchpad.db", baseUrl: env.LAUNCHPAD_BASE_URL ?? "http://localhost:3000", googleClientId: env.GOOGLE_CLIENT_ID || undefined, googleClientSecret: env.GOOGLE_CLIENT_SECRET || undefined, modelMode: env.MODEL_MODE ?? "test", allowedHosts: (env.LAUNCHPAD_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(","), releaseSha: releaseShaFromEnv(env), trustLoopbackProxy: env.LAUNCHPAD_TRUST_LOOPBACK_PROXY === "1", googleAllowedSubjects: googleAllowedSubjectsFromEnv(env, production) };
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
function parseAmountCents(v: unknown): number | null {
  const t = String(v ?? "").trim();
  if (!/^\d{1,12}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
const isLoopback = (req: Request) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");

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
    if (!s) return res.redirect("/login");
    const owner = db.prepare("SELECT kind FROM owners WHERE id=?").get(s.owner_id) as { kind: string } | undefined;
    (req as Authed).ownerId = s.owner_id;
    (req as Authed).csrf = s.csrf;
    (req as Authed).ownerKind = owner?.kind ?? "";
    next();
  };
  const csrfOk = (req: Request, res: Response, next: NextFunction) => {
    const s = session(req);
    const given = String(bodyOf(req).csrf ?? req.headers["x-csrf-token"] ?? "");
    if (!s || !safeEqual(given, s.csrf)) return res.status(403).send("CSRF check failed. Go back and try again.");
    next();
  };
  const page = (req: Request, title: string, active: "status" | "activity" | "connection" | "none", body: string) => shell({
    title, active, body, csrf: (req as Authed).csrf ?? "", demo: cfg.demo,
    badge: (req as Authed).ownerKind === "demo" ? "Synthetic demo · mock data" : cfg.production ? "Private pilot" : "Development preview",
  });

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
    res.setHeader("set-cookie", `lp_preauth=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${cfg.production ? "; Secure" : ""}`);
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

  app.get("/health", (_req, res) => res.json({ ok: true, demo: cfg.demo, model_mode: cfg.modelMode === "disabled" ? "disabled" : "test", live_inference: "disabled", catalog_size: loadCatalog().length, release_sha: releaseSha }));
  app.get("/login", (_req, res) => {
    const token = cfg.demo ? issuePreauth(res) : "";
    res.type("html").send(loginPage({ demo: cfg.demo, google: !!cfg.googleClientId, preauth: token, companies: DEMO_COMPANIES }));
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
  const oidcFlows = new Map<string, { codeVerifier: string; nonce: string; expires: number; bindHash: string; continuation: string }>();
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
      pruneFlows();
      oidcFlows.set(state, { codeVerifier, nonce, expires: Date.now() + 600_000, bindHash: sha256(bind), continuation: connectCookie(req) });
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
      res.redirect(flow.continuation === connectCookie(req) ? oauth.resume(req) : "/");
    } catch {
      res.status(401).send("Google sign-in could not be verified.");
    }
  });

  app.get("/", requireOwner, (req, res) => {
    const st = getState(db, oid(req));
    const owner = db.prepare("SELECT reporting_enabled FROM owners WHERE id=?").get(oid(req)) as { reporting_enabled: number };
    res.type("html").send(page(req, "Is my admin handled?", "status", statusBody({ label: st.ws.label, demo: (req as Authed).ownerKind === "demo", assessment: st.assessment, coverage: st.coverage, assessedAt: st.assessed_at, exclusions: st.exclusions, historyCount: st.history.length, reportingEnabled: owner.reporting_enabled === 1, latestProgress: (st.progress[0] as unknown as { task_id: string; milestone: string; observed_at: string } | undefined) ?? null })));
  });

  app.get("/activity", requireOwner, (req, res) => {
    const rows = db.prepare("SELECT actor,action,outcome,summary,created_at FROM activity WHERE owner_id=? ORDER BY id DESC LIMIT 100").all(oid(req)) as Record<string, string>[];
    const receipts = db.prepare("SELECT kind,report_id,payload_json,receipt_json,created_at FROM reports WHERE owner_id=? ORDER BY created_at DESC LIMIT 20").all(oid(req)) as Record<string, string>[];
    res.type("html").send(page(req, "Activity & evidence", "activity", activityBody({ rows, receipts, exclusions: getState(db, oid(req)).exclusions })));
  });

  app.get("/playbooks", requireOwner, (req, res) => res.type("html").send(page(req, "Playbooks", "none", playbooksBody(PLAYBOOKS))));
  app.get("/services", requireOwner, (req, res) => {
    const q = String(req.query.q ?? "").slice(0, 120);
    res.type("html").send(page(req, "Service catalog", "none", servicesBody({ q, total: loadCatalog().length, results: q ? searchServices(q, 10) : [] })));
  });

  app.get("/setup", requireOwner, (req, res) => res.type("html").send(page(req, "Setup helper", "none", setupBody({ csrf: (req as Authed).csrf, result: null }))));
  app.post("/setup", requireOwner, csrfOk, async (req, res) => {
    const topic = String(bodyOf(req).topic ?? "").slice(0, 100);
    let result: string;
    try {
      // Always the deterministic fixture provider: live inference is disabled
      // in this runtime whatever MODEL_MODE says (runModelJob also enforces).
      const r = await runModelJob({ mode: cfg.modelMode === "disabled" ? "disabled" : "test", job: "setup_guidance", input: topic });
      result = r.output;
    } catch { result = "Setup guidance is unavailable in this configuration. The Connection page steps still work."; }
    logActivity(db, oid(req), "owner", "setup_guidance", "ok", "Setup guidance shown (deterministic mock fixture; no live model called).");
    res.type("html").send(page(req, "Setup helper", "none", setupBody({ csrf: (req as Authed).csrf, result })));
  });

  app.get("/connection", requireOwner, (req, res) => {
    const owner = db.prepare("SELECT reporting_enabled FROM owners WHERE id=?").get(oid(req)) as { reporting_enabled: number };
    const tokens = db.prepare("SELECT id,scopes,revoked,created_at,last_used_at FROM mcp_tokens WHERE owner_id=? ORDER BY created_at DESC").all(oid(req)) as Record<string, unknown>[];
    const candidates = db.prepare("SELECT id,name,connection,jobs,status,created_at FROM candidates WHERE owner_id=? ORDER BY created_at DESC").all(oid(req)) as Record<string, string>[];
    res.type("html").send(page(req, "Connection & data", "connection", connectionBody({ csrf: (req as Authed).csrf, baseUrl: cfg.baseUrl, reportingEnabled: owner.reporting_enabled === 1, tokens, candidates, milestones: getAssistantMilestones(db, oid(req)), grants: db.prepare("SELECT g.id,g.scopes,g.revoked,g.expires,g.redirect,c.metadata FROM oauth_grants g JOIN oauth_clients c ON c.id=g.client_id WHERE g.owner_id=? ORDER BY g.rowid DESC").all(oid(req)) as Record<string, string>[] })));
  });
  app.post("/tokens", requireOwner, csrfOk, (req, res) => {
    const owner = db.prepare("SELECT epoch FROM owners WHERE id=?").get(oid(req)) as { epoch: number };
    const active = db.prepare("SELECT id FROM mcp_tokens WHERE owner_id=? AND revoked=0 ORDER BY created_at ASC, rowid ASC").all(oid(req)) as { id: string }[];
    for (const extra of active.slice(0, Math.max(0, active.length - 9))) db.prepare("UPDATE mcp_tokens SET revoked=1 WHERE id=?").run(extra.id);
    const raw = `lp_${randomBytes(32).toString("base64url")}`;
    db.prepare("INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES(?,?,?,?,?,?)").run(newId("tok"), oid(req), sha256(raw), "progress:read,progress:report", owner.epoch, nowIso());
    logActivity(db, oid(req), "owner", "token_issue", "ok", "Assistant token issued (max 10 active; oldest auto-revoked beyond that).");
    // One-time display in this POST response. The raw token never appears in a URL.
    res.type("html").send(page(req, "New assistant token", "connection", tokenOnceBody(raw)));
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

  // Synthetic approval mechanics: demo transport only, never in the main flow.
  app.get("/demo/approvals", requireOwner, (req, res) => {
    if (!cfg.demo) return res.status(404).send("Not found.");
    const approvals = db.prepare("SELECT id,payload_json,digest,state,expires_at FROM approvals WHERE owner_id=? ORDER BY created_at DESC LIMIT 5").all(oid(req)) as Record<string, string>[];
    res.type("html").send(page(req, "Synthetic approval demo", "none", approvalsBody({ csrf: (req as Authed).csrf, approvals })));
  });
  app.post("/approvals", requireOwner, csrfOk, (req, res) => {
    if (!cfg.demo) return res.status(404).send("Not found.");
    const b = bodyOf(req);
    const amount = parseAmountCents(b.amount_cents);
    const recipient = String(b.recipient ?? "").trim().slice(0, 80);
    const period = String(b.period ?? "").trim().slice(0, 20);
    const documentRef = String(b.document_ref ?? "").trim().slice(0, 80);
    if (amount === null || !recipient || !period || !documentRef) return res.status(400).send("Invalid approval request: amount must be a positive whole number of cents and recipient, period and document are required. Nothing was created.");
    const payload = { recipient, amount_cents: amount, period, document_ref: documentRef, synthetic: true };
    db.prepare("INSERT INTO approvals(id,owner_id,payload_json,digest,expires_at,created_at) VALUES(?,?,?,?,?,?)").run(newId("appr"), oid(req), JSON.stringify(payload), sha256(JSON.stringify(payload)), new Date(Date.now() + 15 * 60_000).toISOString(), nowIso());
    res.redirect("/demo/approvals");
  });
  app.post("/approvals/approve", requireOwner, csrfOk, (req, res) => {
    if (!cfg.demo) return res.status(404).send("Not found.");
    const b = bodyOf(req);
    const amount = parseAmountCents(b.amount_cents);
    if (amount === null) return res.status(400).send("Invalid amount: enter the exact whole number of cents. Nothing was approved.");
    const row = db.prepare("SELECT * FROM approvals WHERE id=? AND owner_id=?").get(String(b.approval_id ?? ""), oid(req)) as { payload_json: string; digest: string; state: string; expires_at: string } | undefined;
    if (!row) return res.status(404).send("Approval not found.");
    if (row.state !== "pending") return res.status(409).send("This approval was already used or closed. Approvals are one-use.");
    if (Date.parse(row.expires_at) < Date.now()) { db.prepare("UPDATE approvals SET state='expired' WHERE id=?").run(b.approval_id); return res.status(409).send("Approval expired."); }
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
    if (sha256(JSON.stringify({ ...payload, amount_cents: amount })) !== row.digest) return res.status(409).send("Payload changed: the amount does not match the approved digest. Nothing was approved.");
    db.prepare("UPDATE approvals SET state='approved_consumed',consumed_at=? WHERE id=?").run(nowIso(), b.approval_id);
    logActivity(db, oid(req), "owner", "approval_consumed", "ok", "Synthetic approval consumed (nothing sent or paid).");
    res.type("html").send(page(req, "Approved (synthetic)", "none", `<section class="card"><p>Exact payload approved and recorded. This demo sends, files and pays <strong>nothing</strong>. Receipt state: approved_consumed.</p><p><a href="/demo/approvals">Back</a></p></section>`));
  });

  app.get("/export", requireOwner, (req, res) => {
    const data = { workspace: getState(db, oid(req)).ws, assessments: db.prepare("SELECT version,payload_json,created_at FROM assessments WHERE owner_id=?").all(oid(req)), progress: db.prepare("SELECT * FROM progress WHERE owner_id=?").all(oid(req)), candidates: db.prepare("SELECT id,name,connection,jobs,status,created_at FROM candidates WHERE owner_id=?").all(oid(req)), activity: db.prepare("SELECT actor,action,outcome,summary,created_at FROM activity WHERE owner_id=?").all(oid(req)) };
    res.setHeader("content-disposition", "attachment; filename=launchpad-export.json");
    res.json(data);
  });
  app.post("/delete", requireOwner, csrfOk, (req, res) => {
    db.transaction(() => {
      oauth.revokeOwner(oid(req));
      db.prepare("DELETE FROM oauth_pending WHERE id=?").run(sha256(connectCookie(req)));
      db.prepare("UPDATE owners SET reporting_enabled=0 WHERE id=?").run(oid(req));
      for (const t of ["assessments", "reports", "progress", "activity", "approvals", "candidates"]) db.prepare(`DELETE FROM ${t} WHERE owner_id=?`).run(oid(req));
      db.prepare("UPDATE mcp_tokens SET revoked=1 WHERE owner_id=?").run(oid(req));
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
      if (!token && raw) {
        try {
          const info = await oauth.verifyAccessToken(raw);
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
      db.prepare("UPDATE mcp_tokens SET last_used_at=? WHERE id=?").run(nowIso(), token.id);
      const server = buildMcpServer(db, { ownerId: token.owner_id, scopes: token.scopes.split(","), companyRef: ws.company_ref, label: ws.label, reportingEnabled: owner.reporting_enabled === 1 });
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
  return { app, db };
}
export { esc };
