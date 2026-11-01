import { randomBytes } from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { mcpAuthRouter, createOAuthMetadata } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError, InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { sha256, newId, type Db } from "./db.js";
import { esc, errorBody, shell, tr, type Lang } from "./views.js";
import type { Config } from "./app.js";

const SCOPES = ["progress:read", "progress:report"];
// Pilot admission bounds (issue 7): finite pools, not a DDoS proof.
// CLIENT_UNUSED (100) is a NEW-REGISTRATION admission target, not a standing
// invariant: denying/expiring a pending flow returns its client to unused, so
// unused can transiently read 101 until the next registration reconciles it.
// CLIENT_TOTAL (500) is the persistent hard limit. Active clients (live
// pending flow or retained grant) are never evicted; saturation with only
// active clients fails openly. client_id_issued_at has second resolution, so
// eligibility adds a 1s margin: every client keeps at least the full grace
// from its actual registration moment.
const PENDING_TOTAL = 100, PENDING_ANON = 70, PENDING_PER_OWNER = 2;
const CLIENT_TOTAL = 500, CLIENT_UNUSED = 100, UNUSED_TTL_MS = 15 * 60_000, UNUSED_GRACE_MS = 2 * 60_000, UNUSED_GRACE_MARGIN_MS = 1000;
const opaque = () => randomBytes(32).toString("base64url");
// Last use is coarse (5 min) and written only when stale: read-only tool calls stay read-only.
export const touchLastUsed = (db: Db, table: "oauth_grants" | "mcp_tokens", id: string) => {
  const now = Date.now();
  db.prepare(`UPDATE ${table} SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)`).run(new Date(now).toISOString(), id, new Date(now - 5 * 60_000).toISOString());
};
type Session = { owner_id: string; csrf: string };
type Pending = { id: string; client_id: string; params: string; owner_id: string | null; epoch: number | null; expires: number };
type Grant = { id: string; owner_id: string; epoch: number; client_id: string; scopes: string; resource: string; revoked: number; expires: number };
type Credential = { hash: string; grant_id: string; kind: string; used: number; expires: number };
type Code = { hash: string; grant_id: string; challenge: string; redirect: string; expires: number };
// The only place a login may return to: never a URL taken from the request.
export const CONSENT_PATH = "/oauth/consent";
export function connectCookie(req: Request): string {
  return /(?:^|;\s*)lp_connect=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "";
}
export class LaunchpadOAuth implements OAuthServerProvider {
  // ownerAllowed defaults to unrestricted so standalone unit use keeps its
  // old behavior; createApp always injects its current pilot policy.
  constructor(private db: Db, private cfg: Config, private session: (req: Request) => Session | null, private ownerAllowed: (ownerId: string) => boolean = () => true) {}
  get resource() { return `${new URL(this.cfg.baseUrl).origin}/mcp`; }
  private scopes(scopes: string[]) {
    if (!scopes.length || scopes.length > 2 || new Set(scopes).size !== scopes.length || scopes.some(s => !SCOPES.includes(s))) throw new InvalidRequestError("Choose progress:read and/or progress:report.");
    return scopes;
  }
  private prune(now = Date.now()) {
    this.db.prepare("DELETE FROM oauth_pending WHERE expires<=?").run(now);
    this.db.prepare("DELETE FROM oauth_codes WHERE expires<=?").run(now);
    // Expired grants go first (cascading their codes/credentials, so used
    // refresh replay evidence lives exactly as long as the grant is valid).
    this.db.prepare("DELETE FROM oauth_grants WHERE expires<=?").run(now);
    // Grant-safe: never cascade-delete a client a live pending flow or any
    // retained (unexpired) grant still references.
    this.db.prepare(`DELETE FROM oauth_clients WHERE expires<=?
      AND NOT EXISTS (SELECT 1 FROM oauth_pending p WHERE p.client_id=oauth_clients.id)
      AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id=oauth_clients.id)`).run(now);
  }
  private clientBacked(id: string, now: number) {
    return this.count("oauth_pending", "WHERE client_id=? AND expires>?", [id, now]) > 0
      || this.count("oauth_grants", "WHERE client_id=? AND revoked=0 AND expires>?", [id, now]) > 0;
  }
  private unusedClients() {
    const rows = this.db.prepare(`SELECT c.id,c.metadata FROM oauth_clients c
      WHERE NOT EXISTS (SELECT 1 FROM oauth_pending p WHERE p.client_id=c.id)
      AND NOT EXISTS (SELECT 1 FROM oauth_grants g WHERE g.client_id=c.id)`).all() as { id: string; metadata: string }[];
    return rows.map(r => { let issued = 0; try { issued = (JSON.parse(r.metadata).client_id_issued_at ?? 0) * 1000; } catch { /* treat as oldest */ } return { id: r.id, issued }; })
      .sort((a, b) => a.issued - b.issued);
  }
  private count(table: string, where = "", values: unknown[] = []) { return (this.db.prepare(`SELECT count(*) n FROM ${table} ${where}`).get(...values) as { n: number }).n; }
  readonly clientsStore = {
    getClient: (id: string): OAuthClientInformationFull | undefined => {
      const now = Date.now();
      const row = this.db.prepare("SELECT metadata,expires FROM oauth_clients WHERE id=?").get(id) as { metadata: string; expires: number } | undefined;
      // An expired registration stays resolvable while a live pending flow or
      // a valid unrevoked grant needs it (token exchange/refresh/revoke).
      if (!row || (row.expires <= now && !this.clientBacked(id, now))) return undefined;
      return JSON.parse(row.metadata);
    },
    registerClient: (input: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">): OAuthClientInformationFull => this.db.transaction(() => {
      const now = Date.now();
      this.prune(now);
      if (input.token_endpoint_auth_method !== "none" || input.client_secret || !input.redirect_uris.length || input.redirect_uris.length > 5 || (input.client_name?.length ?? 0) > 100 || JSON.stringify(input).length > 8192) throw new InvalidClientMetadataError("Public clients only; at most 5 redirects and a 100-character name.");
      for (const uri of input.redirect_uris) {
        let u: URL; try { u = new URL(uri); } catch { throw new InvalidClientMetadataError("Invalid redirect."); }
        if (uri.length > 2048 || u.username || u.password || uri.includes("#") || !(u.protocol === "https:" || (!this.cfg.production && u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)))) throw new InvalidClientMetadataError("Redirects require HTTPS (local DEV loopback HTTP allowed), without userinfo or fragments.");
      }
      if (input.grant_types?.some(g => !["authorization_code", "refresh_token"].includes(g)) || input.response_types?.some(r => r !== "code")) throw new InvalidClientMetadataError("Only authorization code and refresh grants are supported.");
      if (input.scope) this.scopes(input.scope.split(" "));
      // Bounded unused pool + hard total: reclaim only the oldest unused
      // registrations past the conservative grace boundary (grace + 1s
      // margin for second-resolution issuance); never a client with a live
      // pending flow or retained grant. Active-only saturation fails openly.
      // 100 unused is the admission target reconciled here, not an
      // invariant: deny/expiry may leave 101 unused until this runs.
      const unused = this.unusedClients();
      const need = Math.max(this.count("oauth_clients") - (CLIENT_TOTAL - 1), unused.length - (CLIENT_UNUSED - 1), 0);
      if (need > 0) {
        const eligible = unused.filter(u => now - u.issued >= UNUSED_GRACE_MS + UNUSED_GRACE_MARGIN_MS);
        if (eligible.length < need) throw new InvalidClientMetadataError("Registration capacity reached; retry shortly.");
        for (const victim of eligible.slice(0, need)) this.db.prepare("DELETE FROM oauth_clients WHERE id=?").run(victim.id);
      }
      // Persist only the fields used here. No client metadata URLs are fetched.
      const client: OAuthClientInformationFull = { client_id: newId("client"), client_id_issued_at: Math.floor(now/1000), client_name: input.client_name || "Unnamed assistant", redirect_uris: input.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: input.scope ?? SCOPES.join(" ") };
      // Never-used registrations expire quickly; authorize/consent extend a
      // client only to its pending/grant lifetime (see clientBacked).
      this.db.prepare("INSERT INTO oauth_clients VALUES(?,?,?)").run(client.client_id, JSON.stringify(client), now + UNUSED_TTL_MS);
      return client;
    })()
  };
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    if (!client.redirect_uris.includes(params.redirectUri)) { res.status(400).send("Exact registered redirect required."); return; }
    const scopes = this.scopes(params.scopes?.length ? params.scopes : ["progress:read"]);
    if (scopes.some(s => !client.scope?.split(" ").includes(s)) || params.resource?.href !== this.resource || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge) || (params.state?.length ?? 0) > 512) throw new InvalidRequestError("Invalid scopes, resource, state or S256 challenge.");
    const raw = opaque(), sessionRow = this.session(res.req), s = sessionRow && this.ownerAllowed(sessionRow.owner_id) ? sessionRow : null;
    const epoch = s ? (this.db.prepare("SELECT epoch FROM owners WHERE id=?").get(s.owner_id) as { epoch: number }).epoch : null;
    const previous = connectCookie(res.req);
    // Transactional replacement: this browser's own live flow frees its slot
    // for its replacement, and a failed admission rolls back with the prior
    // flow intact. Anonymous and authenticated-owner pools are separate:
    // at most 70 anonymous + 30 owner reserve of the total 100, max 2/owner.
    // Epoch is intentionally NOT checked here: a valid current session may
    // start a fresh authorization replacing the same owner's stale-epoch flow
    // left by a concurrent deletion (recovery); the fresh row takes the
    // current epoch, scopes, PKCE and request. The stale consent itself stays
    // rejected at consent time (owner/epoch mismatch), and replacing another
    // owner's flow stays rejected above.
    this.db.transaction(() => {
      const now = Date.now();
      this.prune(now);
      const prev = previous ? this.db.prepare("SELECT * FROM oauth_pending WHERE id=?").get(sha256(previous)) as Pending | undefined : undefined;
      if (prev?.owner_id && prev.owner_id !== (s?.owner_id ?? null)) throw new InvalidRequestError("Connection request belongs to another account; start again in your assistant.");
      const total = this.count("oauth_pending") - (prev ? 1 : 0);
      const anon = this.count("oauth_pending", "WHERE owner_id IS NULL") - (prev && !prev.owner_id ? 1 : 0);
      const owned = s ? this.count("oauth_pending", "WHERE owner_id=?", [s.owner_id]) - (prev?.owner_id === s.owner_id ? 1 : 0) : 0;
      if (total >= PENDING_TOTAL || (s ? owned >= PENDING_PER_OWNER : anon >= PENDING_ANON)) throw new InvalidRequestError("Too many pending connections; retry later.");
      if (prev) this.db.prepare("DELETE FROM oauth_pending WHERE id=?").run(prev.id);
      const pendingExpires = now + 600_000;
      this.db.prepare("INSERT INTO oauth_pending VALUES(?,?,?,?,?,?)").run(sha256(raw), client.client_id, JSON.stringify({ ...params, scopes }), s?.owner_id ?? null, epoch, pendingExpires);
      this.db.prepare("UPDATE oauth_clients SET expires=MAX(expires,?) WHERE id=?").run(pendingExpires, client.client_id);
    })();
    res.append("set-cookie", this.connectSetCookie(raw));
    res.redirect(CONSENT_PATH);
  }
  pending(req: Request): Pending | undefined { return this.pendingFor(connectCookie(req)); }
  private pendingFor(raw: string): Pending | undefined {
    return this.db.prepare("SELECT * FROM oauth_pending WHERE id=? AND expires>?").get(sha256(raw), Date.now()) as Pending | undefined;
  }
  resume(req: Request) { return this.pending(req) ? CONSENT_PATH : "/"; }
  // After a Google round-trip: re-issue this browser's connect cookie from its
  // own browser-bound login flow, so consent finds the pending request even if
  // the cookie did not survive the trip. False when the request is gone.
  continueAfterLogin(res: Response, raw: string): boolean {
    if (!raw || !this.pendingFor(raw)) return false;
    res.append("set-cookie", this.connectSetCookie(raw));
    return true;
  }
  private connectSetCookie(raw: string) { return `lp_connect=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${this.cfg.production ? "; Secure" : ""}`; }
  private grant(id: string): Grant {
    const g = this.db.prepare("SELECT g.* FROM oauth_grants g JOIN owners o ON o.id=g.owner_id AND o.epoch=g.epoch WHERE g.id=? AND g.revoked=0 AND g.expires>?").get(id, Date.now()) as Grant | undefined;
    // Current pilot policy is re-checked here, so code exchange, refresh and
    // access verification all deny old persisted grants after removal.
    if (!g || !this.ownerAllowed(g.owner_id)) throw new InvalidGrantError("Connection expired or revoked.");
    return g;
  }
  private code(client: OAuthClientInformationFull, raw: string) {
    const c = this.db.prepare("SELECT * FROM oauth_codes WHERE hash=? AND expires>?").get(sha256(raw), Date.now()) as Code | undefined;
    if (!c || this.grant(c.grant_id).client_id !== client.client_id) throw new InvalidGrantError("Invalid authorization code.");
    return c;
  }
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, raw: string) { return this.code(client, raw).challenge; }
  private issue(g: Grant): OAuthTokens {
    if (this.count("oauth_credentials", "WHERE grant_id=?", [g.id]) >= 1000) throw new InvalidGrantError("Connection rotation limit reached; reconnect.");
    const access = opaque(), refresh = opaque();
    const insert = this.db.prepare("INSERT INTO oauth_credentials VALUES(?,?,?,?,?)");
    insert.run(sha256(access), g.id, "access", 0, Math.min(g.expires, Date.now()+3600_000));
    insert.run(sha256(refresh), g.id, "refresh", 0, g.expires);
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: Math.floor((Math.min(g.expires, Date.now()+3600_000)-Date.now())/1000), scope: g.scopes };
  }
  async exchangeAuthorizationCode(client: OAuthClientInformationFull, raw: string, _verifier?: string, redirect?: string, resource?: URL) {
    return this.db.transaction(() => {
      const c = this.code(client, raw), g = this.grant(c.grant_id);
      if (redirect !== c.redirect || resource?.href !== g.resource) throw new InvalidGrantError("Code binding mismatch.");
      if (this.db.prepare("DELETE FROM oauth_codes WHERE hash=?").run(c.hash).changes !== 1) throw new InvalidGrantError("Code already consumed.");
      return this.issue(g);
    })();
  }
  async exchangeRefreshToken(client: OAuthClientInformationFull, raw: string, scopes?: string[], resource?: URL) {
    // Return an error from the transaction, then throw outside: reuse revocation MUST commit.
    const result = this.db.transaction(() => {
      const c = this.db.prepare("SELECT * FROM oauth_credentials WHERE hash=? AND kind='refresh'").get(sha256(raw)) as Credential | undefined;
      if (!c) throw new InvalidGrantError("Invalid refresh token.");
      const g = this.grant(c.grant_id);
      if (g.client_id !== client.client_id || resource?.href !== g.resource || c.expires <= Date.now()) throw new InvalidGrantError("Refresh binding mismatch.");
      if (c.used) { this.db.prepare("UPDATE oauth_grants SET revoked=1 WHERE id=?").run(g.id); return null; }
      if (scopes) {
        this.scopes(scopes);
        if (scopes.some(s => !g.scopes.split(" ").includes(s))) throw new InvalidGrantError("Scope escalation refused.");
        g.scopes = scopes.join(" ");
        this.db.prepare("UPDATE oauth_grants SET scopes=? WHERE id=?").run(g.scopes, g.id);
      }
      this.db.prepare("UPDATE oauth_credentials SET used=1 WHERE hash=?").run(c.hash);
      this.db.prepare("DELETE FROM oauth_credentials WHERE grant_id=? AND kind='access'").run(g.id);
      return this.issue(g);
    })();
    if (!result) throw new InvalidGrantError("Refresh reuse detected; connection revoked. Reconnect.");
    return result;
  }
  async verifyAccessToken(raw: string): Promise<AuthInfo> {
    const c = this.db.prepare("SELECT * FROM oauth_credentials WHERE hash=? AND kind='access' AND expires>?").get(sha256(raw), Date.now()) as Credential | undefined;
    if (!c) throw new InvalidTokenError("Invalid access token.");
    const g = this.grant(c.grant_id);
    touchLastUsed(this.db, "oauth_grants", g.id);
    return { token: raw, clientId: g.client_id, scopes: g.scopes.split(" "), expiresAt: Math.floor(c.expires/1000), resource: new URL(g.resource), extra: { ownerId: g.owner_id, epoch: g.epoch, grantId: g.id } };
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    this.db.transaction(() => {
      const g = this.db.prepare("SELECT g.id,g.owner_id FROM oauth_grants g JOIN oauth_credentials c ON c.grant_id=g.id WHERE g.client_id=? AND c.hash=?").get(client.client_id, sha256(request.token)) as { id: string; owner_id: string } | undefined;
      if (!g) return;
      this.db.prepare("UPDATE oauth_grants SET revoked=1 WHERE id=?").run(g.id);
      this.db.prepare("DELETE FROM oauth_pending WHERE owner_id=? AND client_id=?").run(g.owner_id, client.client_id);
    })();
  }
  revokeOwner(ownerId: string) {
    this.db.prepare("UPDATE oauth_grants SET revoked=1,last_used_at=NULL WHERE owner_id=?").run(ownerId);
    this.db.prepare("DELETE FROM oauth_pending WHERE owner_id=?").run(ownerId);
  }
  install(app: Express, requireOwner: RequestHandler, csrfOk: RequestHandler) {
    const router = mcpAuthRouter({ provider: this, issuerUrl: new URL(this.cfg.baseUrl), resourceServerUrl: new URL(this.resource), scopesSupported: SCOPES });
    app.use((req, res, next) => {
      // Enforce exact redirects before SDK error redirects (its native-app default
      // relaxes loopback ports). Invalid requests must never redirect elsewhere.
      const path = req.path.replace(/\/+$/, "").toLowerCase();
      if (path === "/authorize") {
        const fields = req.method === "POST" ? req.body : req.query;
        if (req.originalUrl.length > 8192 || (typeof fields.state === "string" && fields.state.length > 512)) return res.status(400).send("Authorization request too long.");
        const client = typeof fields.client_id === "string" ? this.clientsStore.getClient(fields.client_id) : undefined;
        if (client && fields.redirect_uri !== undefined && !client.redirect_uris.includes(fields.redirect_uri)) return res.status(400).send("Exact registered redirect required.");
      }
      // SDK defaults also advertise confidential clients; this provider is public-only.
      if (path === "/.well-known/oauth-authorization-server") {
        res.set("Access-Control-Allow-Origin", "*").json({ ...createOAuthMetadata({ provider: this, issuerUrl: new URL(this.cfg.baseUrl), scopesSupported: SCOPES }), token_endpoint_auth_methods_supported: ["none"], revocation_endpoint_auth_methods_supported: ["none"] }); return;
      }
      if (path === "/.well-known/oauth-protected-resource/mcp") {
        res.set("Access-Control-Allow-Origin", "*").json({ resource: this.resource, authorization_servers: [new URL(this.cfg.baseUrl).href], scopes_supported: SCOPES }); return;
      }
      router(req, res, next);
    });
    const consent = (req: Request) => {
      const p = this.pending(req), s = this.session(req);
      if (!p || !s || !this.ownerAllowed(s.owner_id)) return undefined;
      const epoch = (this.db.prepare("SELECT epoch FROM owners WHERE id=?").get(s.owner_id) as { epoch: number }).epoch;
      if (p.owner_id && (p.owner_id !== s.owner_id || p.epoch !== epoch)) return undefined;
      if (!p.owner_id) {
        // Login-to-consent bind: respect the per-owner cap atomically, and
        // never delete another owner's (or this owner's) existing flows.
        const bound = this.db.transaction(() => {
          // Expired rows for this owner must not block binding; only this
          // owner's expired rows are pruned here, live/other flows stay.
          this.db.prepare("DELETE FROM oauth_pending WHERE owner_id=? AND expires<=?").run(s.owner_id, Date.now());
          if (this.count("oauth_pending", "WHERE owner_id=? AND id!=?", [s.owner_id, p.id]) >= PENDING_PER_OWNER) return false;
          return this.db.prepare("UPDATE oauth_pending SET owner_id=?,epoch=? WHERE id=? AND owner_id IS NULL").run(s.owner_id, epoch, p.id).changes === 1;
        })();
        if (!bound) return undefined;
        p.owner_id = s.owner_id; p.epoch = epoch;
      }
      return { p, s, params: JSON.parse(p.params) as AuthorizationParams };
    };
    // Consent errors render in the shell (lang, a way back), never bare text.
    const consentError = (res: Response, status: number, et: string, en: string) => {
      const l: Lang = res.locals.lang === "en" ? "en" : "et", t = tr(l);
      res.status(status).type("html").send(shell({ title: t("Ühendamine katkes", "Connection stopped"), active: "none", lang: l, csrf: "", bare: true, body: errorBody(l, t("Ühendamine katkes", "Connection stopped"), t(et, en), { href: "/uhenda", label: t("Tagasi: Ühendus", "Back: Connection") }) }));
    };
    app.get("/oauth/consent", requireOwner, (req, res) => {
      const c = consent(req); if (!c) return consentError(res, 400, "Ühendamise taotlus on aegunud või kuulub teisele brauserile või kontole. Alusta uuesti oma assistendis.", "Connection request expired or belongs to another browser/account. Start again in your assistant.");
      const client = this.clientsStore.getClient(c.p.client_id); if (!client) return consentError(res, 400, "Assistendi registreering on aegunud. Alusta uuesti oma assistendis.", "Client expired. Start again in your assistant.");
      // Same-origin (not no-referrer) on this same-origin form page, so a
      // genuine browser POST carries a real Origin for the strict exact check.
      // The outgoing callback redirect below still uses no-referrer.
      const l: Lang = res.locals.lang === "en" ? "en" : "et", t = tr(l);
      const name = esc(client.client_name ?? t("assistent", "assistant")), back = new URL(c.params.redirectUri);
      // Copy follows the requested scopes: read abilities only when asked for; storage only when reporting is offered.
      const read = c.params.scopes!.includes("progress:read"), report = c.params.scopes!.includes("progress:report");
      res.set({ "content-security-policy": "frame-ancestors 'none'", "referrer-policy": "same-origin" }).type("html").send(shell({ title: t("Ühenda assistent", "Connect assistant"), active: "none", lang: l, csrf: c.s.csrf, bare: true, body: `<section class="card" aria-labelledby="k-h"><h1 id="k-h">${t(`Ühenda ${name} AI-hüppelauaga?`, `Connect ${name} to AI Launchpad?`)}</h1>
<p class="small muted">${t("Tagasi", "Returns to")}: <strong>${esc(back.host)}</strong></p>
<h2>${t(`${name} saab alati`, `${name} can always`)}</h2><ul class="tight">${read ? `<li>${t("näha sinu ettevõtte tähtaegu ja tööde seisu", "see your company's deadlines and work status")}</li>` : ""}<li>${t("öelda, mida ta saab sinu eest ära teha", "tell you what it can take off your hands")}</li></ul>
<form method="post" action="/oauth/consent"><input type="hidden" name="csrf" value="${esc(c.s.csrf)}"><input type="hidden" name="flow" value="${esc(c.p.id)}">${report ? `<h2>${t("Kas lased tal töid ette valmistada?", "Let it prepare work for you?")}</h2>
<label class="check"><input type="checkbox" name="updates" value="1"><span>${t(`Jah: ${name} valmistab ette kirjad, arved ja deklaratsioonid ning küsib iga kord sinult kinnitust`, `Yes: ${name} prepares messages, invoices and returns, and asks you every time before anything goes out`)}</span></label>
<p class="small muted">${read ? t(`Ilma selleta saab ${name} ainult lugeda. Kirju ega arveid ta sinu eest ette valmistada ei saa. Hiljem lisamiseks tuleb ${name} uuesti ühendada.`, `Without it, ${name} can only read. It can't prepare messages or invoices for you. To add this later, reconnect ${name}.`) : t(`${name} küsib ainult töid ette valmistada. Ilma linnukeseta ühendust ei looda ja ${name} saab teate, et keeldusid.`, `${name} asks only to prepare work. Without the tick, no connection is made and ${name} is told you declined.`)}</p>
<p class="small muted">${t("Kui lubad töid ette valmistada, salvestame tööde seisu, assistendi hinnangu, kinnitamiseks esitatud tekstid, privaatsed teenusesoovitused, anonüümseks muudetud soovid ja loetud pangaväljavõtete kokkuvõtte (pank, konto neli viimast numbrit, periood ja lõppsaldo), kuni sa need kustutad. Sinu vestlusi ega faile AI-hüppelaud ei saa.", "If you allow preparing work, we store work status, your assistant's assessment, texts sent for your approval, private service nominations, anonymised requests and a summary of each bank statement your assistant read (bank, the account's last four digits, period and closing balance) until you delete them. AI Launchpad never receives your conversations or files.")}</p>` : ""}
<h2>${t(`AI-hüppelaua kaudu ei saa ${name} kunagi`, `Through AI Launchpad, ${name} can never`)}</h2><ul class="tight"><li>${t("ise maksta, deklaratsioone esitada ega allkirjastada", "pay, file returns or sign on its own")}</li></ul>
${report ? "" : `<p class="small muted">${t("Sinu vestlusi ega faile AI-hüppelaud ei saa.", "AI Launchpad never receives your conversations or files.")}</p>`}
<button name="decision" value="allow">${t("Ühenda", "Connect")}</button><button class="secondary" name="decision" value="reject">${t("Ära ühenda", "Don't connect")}</button></form>
<details class="tech-details"><summary>${t("Tehniline info", "Technical details")}</summary><dl class="tech-list"><dt>${t("Kliendi nimi", "Client name")}</dt><dd>${name} — ${t("kliendi enda antud, see ei ole kontrollitud identiteet", "supplied by the requesting client; it is not a verified identity")}</dd><dt>${t("Tagasi", "Return address")}</dt><dd>${esc(back.origin)}</dd><dt>${t("Küsitud õigused", "Requested scopes")}</dt><dd>${esc(c.params.scopes!.join(" "))}</dd></dl>
<div lang="en"><p>progress:read lets the assistant see your business and workspace details and your saved progress and sharing state: your workspace label, assessment, tasks, evidence references and activity. Getting-started guidance excludes your workspace details and sharing state unless you grant read permission. All connected assistants can search the public service catalogue. progress:report saves concise assessments, task updates and private service nominations, and which bank statements your assistant read (bank, the account's last four digits, period and closing balance). It can also ask you to approve a specific message, invoice, payment or filing; nothing happens unless you approve that exact content. Launchpad stores the exact text of each approval request (up to 4,000 characters; it can include a customer's e-mail address, amounts and figures) until you delete your progress. No conversations, files or Google tokens are shared. This never authorizes payments, filings or signatures.</p><p class="small muted">progress:report is the “Yes” box above. Scopes are fixed at consent: adding it later needs a new connection</p></div></details></section>` }));
    });
    app.post("/oauth/consent", requireOwner, csrfOk, (req, res) => {
      const c = consent(req); if (!c || req.body.flow !== c.p.id || !["allow", "reject"].includes(req.body.decision)) return consentError(res, 400, "Ühendamise taotlus on aegunud või juba kasutatud. Alusta uuesti oma assistendis.", "Connection request expired or already used. Start again in your assistant.");
      const url = new URL(c.params.redirectUri);
      if (c.params.state) url.searchParams.set("state", c.params.state);
      const scopes = c.params.scopes!.filter(s => s !== "progress:report" || req.body.updates === "1");
      if (req.body.decision === "reject" || !scopes.length) {
        this.db.prepare("DELETE FROM oauth_pending WHERE id=?").run(c.p.id); url.searchParams.set("error", "access_denied");
      } else {
        if (this.count("oauth_grants", "WHERE owner_id=?", [c.s.owner_id]) >= 100 || this.count("oauth_grants", "WHERE owner_id=? AND revoked=0", [c.s.owner_id]) >= 10) return consentError(res, 409, "Ühenduste piir on täis. Eemalda mõni olemasolev assistendi ühendus.", "Connection limit reached. Revoke an existing assistant connection.");
        const code = opaque(), id = newId("grant"), grantExpires = Date.now()+30*86400_000;
        this.db.transaction(() => {
          if (this.db.prepare("DELETE FROM oauth_pending WHERE id=?").run(c.p.id).changes !== 1) throw new Error("Consumed consent");
          this.db.prepare("UPDATE oauth_clients SET expires=MAX(expires,?) WHERE id=?").run(grantExpires, c.p.client_id);
          this.db.prepare("INSERT INTO oauth_grants(id,owner_id,epoch,client_id,scopes,resource,revoked,expires,redirect) VALUES(?,?,?,?,?,?,0,?,?)").run(id, c.s.owner_id, c.p.epoch, c.p.client_id, scopes.join(" "), this.resource, grantExpires, c.params.redirectUri);
          this.db.prepare("INSERT INTO oauth_codes VALUES(?,?,?,?,?)").run(sha256(code), id, c.params.codeChallenge, c.params.redirectUri, Date.now()+60_000);
          if (scopes.includes("progress:report")) this.db.prepare("UPDATE owners SET reporting_enabled=1 WHERE id=?").run(c.s.owner_id);
        })();
        url.searchParams.set("code", code);
      }
      res.append("set-cookie", `lp_connect=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${this.cfg.production ? "; Secure" : ""}`);
      res.set("referrer-policy", "no-referrer").redirect(url.href);
    });
    app.post("/oauth/disconnect", requireOwner, csrfOk, (req, res) => {
      const s = this.session(req)!;
      const g = this.db.prepare("SELECT client_id FROM oauth_grants WHERE id=? AND owner_id=?").get(String(req.body.grant_id ?? ""), s.owner_id) as {client_id: string} | undefined;
      if (g) {
        this.db.prepare("UPDATE oauth_grants SET revoked=1 WHERE id=? AND owner_id=?").run(req.body.grant_id, s.owner_id);
        this.db.prepare("DELETE FROM oauth_pending WHERE owner_id=? AND client_id=?").run(s.owner_id, g.client_id);
      }
      res.redirect("/connection");
    });
  }
}
