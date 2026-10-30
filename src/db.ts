import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newId = (p: string) => `${p}_${randomBytes(9).toString("base64url")}`;
export const nowIso = () => new Date().toISOString();

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_clients(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_pending(id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE, params TEXT NOT NULL, owner_id TEXT, epoch INTEGER, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_grants(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, epoch INTEGER NOT NULL, client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE, scopes TEXT NOT NULL, resource TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL, redirect TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_codes(hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE, challenge TEXT NOT NULL, redirect TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS oauth_credentials(hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES oauth_grants(id) ON DELETE CASCADE, kind TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, email TEXT, kind TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, reporting_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspaces(owner_id TEXT PRIMARY KEY REFERENCES owners(id), company_ref TEXT NOT NULL, label TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mcp_tokens(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL, epoch INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT);
  CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reports(owner_id TEXT NOT NULL, report_id TEXT NOT NULL, kind TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', receipt_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id, kind, report_id));
  CREATE TABLE IF NOT EXISTS progress(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, task_id TEXT NOT NULL, milestone TEXT NOT NULL, evidence_label TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, observed_at TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, norm_key TEXT NOT NULL, name TEXT NOT NULL, connection TEXT NOT NULL, jobs TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_moderation', created_at TEXT NOT NULL, UNIQUE(owner_id, norm_key));
  CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS company_facts(registry_code TEXT PRIMARY KEY, facts_json TEXT NOT NULL, snapshot_id TEXT, as_of TEXT, fetched_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT);
  `);
  // Backward-safe: created on fresh and existing databases alike.
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_oauth_pending_client ON oauth_pending(client_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_pending_owner ON oauth_pending(owner_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_pending_expires ON oauth_pending(expires);
  CREATE INDEX IF NOT EXISTS idx_oauth_grants_client ON oauth_grants(client_id);
  CREATE INDEX IF NOT EXISTS idx_oauth_clients_expires ON oauth_clients(expires);
  `);
  // Backward-safe: approval card columns are added to an existing table in place.
  const approvalCols = new Set((db.prepare("PRAGMA table_info(approvals)").all() as { name: string }[]).map((c) => c.name));
  for (const col of ["kind", "report_id", "decided_at", "outcome_json"]) if (!approvalCols.has(col)) db.exec(`ALTER TABLE approvals ADD COLUMN ${col} TEXT`);
  // Which OAuth grant last reached the MCP endpoint, so /uhenda names the client that actually made contact.
  if (!(db.prepare("PRAGMA table_info(oauth_grants)").all() as { name: string }[]).some((c) => c.name === "last_used_at")) db.exec("ALTER TABLE oauth_grants ADD COLUMN last_used_at TEXT");
  // Friction loop (#20): owner-scoped unmet needs. Only de-identified text
  // is stored; the raw request is never kept.
  db.exec(`
  CREATE TABLE IF NOT EXISTS unmet_needs(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, report_id TEXT NOT NULL, payload_hash TEXT NOT NULL, need_redacted TEXT NOT NULL, blocker TEXT NOT NULL, job_hint_redacted TEXT, state TEXT NOT NULL, reason TEXT, model_input TEXT, classify_started_at TEXT, classified_by TEXT, category TEXT, demand_label TEXT, same_as TEXT, spec TEXT, decided_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id, report_id));
  CREATE INDEX IF NOT EXISTS idx_unmet_needs_state ON unmet_needs(state);
  `);
  return db;
}
export type Db = ReturnType<typeof openDb>;
