import { afterEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../src/db.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const dropped = ["approved_by_rule", "check_state", "check_json", "check_by", "check_at"];
const clean = ["id", "owner_id", "payload_json", "digest", "state", "expires_at", "created_at", "consumed_at", "kind", "report_id", "decided_at", "outcome_json", "playbook_id", "owner_confirmation"];
const removedActions = ["request_approval", "record_action_outcome", "approval_decided", "approved_in_assistant", "standing_rule_created", "standing_rule_revoked", "standing_auto_approved"];
const keptTables = ["owners", "workspaces", "assessments", "progress", "company_facts", "mcp_tokens"];
const snapshot = (db: Db, tables: string[]) => Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));

function fixture(standing: boolean, columns: string[]) {
  const dir = mkdtempSync(join(tmpdir(), "launchpad-approval-migration-")); dirs.push(dir);
  const path = join(dir, "test.sqlite");
  const db = new Database(path);
  db.exec(`
    CREATE TABLE approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, payload_json TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT NOT NULL, consumed_at TEXT, kind TEXT, report_id TEXT, decided_at TEXT, outcome_json TEXT, playbook_id TEXT, owner_confirmation TEXT);
    CREATE TABLE reports(owner_id TEXT NOT NULL, report_id TEXT NOT NULL, kind TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', receipt_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(owner_id, kind, report_id));
    CREATE TABLE activity(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, outcome TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE owners(id TEXT PRIMARY KEY, subject TEXT UNIQUE NOT NULL, email TEXT, kind TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, reporting_enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE workspaces(owner_id TEXT PRIMARY KEY REFERENCES owners(id), company_ref TEXT NOT NULL, label TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE assessments(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE progress(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, task_id TEXT NOT NULL, milestone TEXT NOT NULL, evidence_label TEXT NOT NULL, evidence_refs_json TEXT NOT NULL, observed_at TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE company_facts(registry_code TEXT PRIMARY KEY, facts_json TEXT NOT NULL, snapshot_id TEXT, as_of TEXT, fetched_at TEXT NOT NULL);
    CREATE TABLE mcp_tokens(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL, epoch INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT);
  `);
  for (const col of columns) db.exec(`ALTER TABLE approvals ADD COLUMN ${col} TEXT`);
  if (standing) db.exec(`
    CREATE TABLE standing_approvals(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, recipients_json TEXT, max_amount_cents INTEGER NOT NULL, max_per_day INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, revoked_at TEXT);
    CREATE INDEX idx_standing_approvals_owner ON standing_approvals(owner_id);
    INSERT INTO standing_approvals VALUES('rule-test','owner-test','send_message',NULL,100,1,'2099-01-01','2026-11-02',NULL);
  `);
  db.exec(`
    INSERT INTO owners(id,subject,kind,created_at) VALUES('owner-test','synthetic-owner','google','2026-11-02');
    INSERT INTO workspaces VALUES('owner-test','19990001','Synthetic workspace',3);
    INSERT INTO assessments VALUES('assessment-test','owner-test',3,'{}','hash','2026-11-02');
    INSERT INTO progress VALUES('progress-test','owner-test','task-test','started','assistant_reported','[]','2026-11-02',3,'2026-11-02');
    INSERT INTO company_facts VALUES('19990001','{}','snapshot-test','2026-11-02','2026-11-02');
    INSERT INTO mcp_tokens(id,owner_id,token_hash,scopes,epoch,created_at) VALUES('token-test','owner-test','synthetic-hash','progress:read',1,'2026-11-02');
  `);
  seedLog(db, "old");
  const kept = snapshot(db, keptTables);
  db.close();
  return { path, kept };
}

function seedLog(db: Db, id: string) {
  db.prepare("INSERT INTO approvals(id,owner_id,payload_json,digest,state,expires_at,created_at) VALUES(?,'owner-test','{}','hash','consumed','2099-01-01','2026-11-02')").run(id);
  for (const kind of ["approval", "outcome", "assessment", "progress"]) {
    db.prepare("INSERT INTO reports(owner_id,report_id,kind,payload_hash,receipt_json,created_at) VALUES('owner-test',?,?,'hash','{}','2026-11-02')").run(id, kind);
  }
  for (const action of [...removedActions, "report_assessment", "report_progress", "token_issue"]) {
    db.prepare("INSERT INTO activity(owner_id,actor,action,outcome,summary,created_at) VALUES('owner-test','assistant',?,'ok','Synthetic','2026-11-02')").run(action);
  }
}

const cases = [
  { name: "full old schema", standing: true, columns: dropped },
  { name: "standing table alone", standing: true, columns: [] },
  ...dropped.map((column) => ({ name: `${column} alone`, standing: false, columns: [column] })),
];
test.each(cases)("resets $name once and preserves unrelated data", ({ standing, columns }) => {
  const { path, kept } = fixture(standing, columns);
  let db = openDb(path);
  try {
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('standing_approvals','idx_standing_approvals_owner')").all()).toEqual([]);
    expect((db.prepare("PRAGMA table_info(approvals)").all() as { name: string }[]).map((c) => c.name).sort()).toEqual([...clean].sort());
    expect(db.prepare("SELECT * FROM approvals").all()).toEqual([]);
    expect(db.prepare("SELECT kind FROM reports ORDER BY kind").all()).toEqual([{ kind: "assessment" }, { kind: "progress" }]);
    expect(db.prepare("SELECT action FROM activity ORDER BY action").all()).toEqual([{ action: "report_assessment" }, { action: "report_progress" }, { action: "token_issue" }]);
    expect(snapshot(db, keptTables)).toEqual(kept);
    // New action history must survive the next boot, including the same receipt kinds/actions.
    seedLog(db, "new");
    const beforeReopen = snapshot(db, [...keptTables, "approvals", "reports", "activity"]);
    db.close(); db = openDb(path);
    expect(snapshot(db, [...keptTables, "approvals", "reports", "activity"])).toEqual(beforeReopen);
  } finally { db.close(); }
});

test("fresh databases have clean columns and never reset their action log", () => {
  const dir = mkdtempSync(join(tmpdir(), "launchpad-approval-fresh-")); dirs.push(dir);
  const path = join(dir, "test.sqlite");
  let db = openDb(path);
  try {
    expect((db.prepare("PRAGMA table_info(approvals)").all() as { name: string }[]).map((c) => c.name).sort()).toEqual([...clean].sort());
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='standing_approvals'").all()).toEqual([]);
    seedLog(db, "fresh");
    const beforeReopen = snapshot(db, ["approvals", "reports", "activity"]);
    db.close(); db = openDb(path);
    expect(snapshot(db, ["approvals", "reports", "activity"])).toEqual(beforeReopen);
  } finally { db.close(); }
});
