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
  CREATE TABLE IF NOT EXISTS owners(id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, email TEXT, kind TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, reporting_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS workspaces(owner_id TEXT PRIMARY KEY REFERENCES owners(id), company_ref TEXT NOT NULL, label TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mcp_tokens(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL, epoch INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT);
  CREATE TABLE IF NOT EXISTS assessments(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reports(owner_id TEXT NOT NULL, report_id TEXT NOT NULL, kind TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', receipt_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id, kind, report_id));
  CREATE TABLE IF NOT EXISTS progress(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, task_id TEXT NOT NULL, milestone TEXT NOT NULL, evidence_label TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, observed_at TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, norm_key TEXT NOT NULL, name TEXT NOT NULL, connection TEXT NOT NULL, jobs TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_moderation', created_at TEXT NOT NULL, UNIQUE(owner_id, norm_key));
  CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT);
  `);
  return db;
}
export type Db = ReturnType<typeof openDb>;
