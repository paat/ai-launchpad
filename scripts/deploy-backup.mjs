#!/usr/bin/env node
// Consistent SQLite backup via better-sqlite3's online backup API (safe with
// WAL; never copy a live .db file). Installed once by root OUTSIDE any
// release dir (/usr/local/lib/launchpad/), run by launchpad-backup.service
// AS the runtime `launchpad` user — never as root. It loads better-sqlite3
// from the current release's node_modules (same ABI as the running
// service), as that unprivileged user.
//
// Each backup is a self-contained snapshot in /var/backups/launchpad plus
// a `<file>.sha256` checksum sidecar. Off-host copies are PULLED from
// there by a separate restricted backup-operator credential; this tool
// deliberately has no push hook and takes no command from the environment.
//
// Backup: node deploy-backup.mjs backup
// Verify: node deploy-backup.mjs verify <backup-file>   (isolated, read-only;
//         checks the checksum sidecar when present and integrity_check)
// Env: LAUNCHPAD_DB_PATH (required), LAUNCHPAD_CURRENT (default
// /opt/launchpad/current), LAUNCHPAD_BACKUP_DIR (default
// /var/backups/launchpad), LAUNCHPAD_BACKUP_KEEP (default 14).
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

const fail = (m) => { console.error(`backup: ${m}`); process.exit(1); };
const current = process.env.LAUNCHPAD_CURRENT ?? "/opt/launchpad/current";
const req = createRequire(join(current, "package.json"));
let Database;
try { Database = req("better-sqlite3"); } catch { fail(`cannot load better-sqlite3 from ${current}/node_modules (no deployed release?)`); }

function integrityOk(path) {
  const db = new Database(path, { readonly: true });
  try {
    const row = db.pragma("integrity_check", { simple: true });
    const tables = db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n;
    return row === "ok" && tables > 0;
  } finally { db.close(); }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "verify") {
  if (!arg || !existsSync(arg)) fail(`verify: file not found: ${arg ?? ""}`);
  if (existsSync(arg + ".sha256")) {
    // Strict binding: exactly "<64-hex>  <basename-of-this-file>".
    const m = readFileSync(arg + ".sha256", "utf8").match(/^([0-9a-f]{64})  ([^/\s]+)\n?$/);
    if (!m || m[2] !== basename(arg)) fail(`verify: checksum sidecar malformed or names another file for ${arg}`);
    if (sha256(arg) !== m[1]) fail(`verify: checksum mismatch for ${arg}`);
  }
  if (!integrityOk(arg)) fail(`verify: integrity_check failed for ${arg}`);
  console.log(`verify ok: ${arg}`);
} else if (cmd === "backup") {
  const dbPath = process.env.LAUNCHPAD_DB_PATH;
  if (!dbPath) fail("LAUNCHPAD_DB_PATH is required");
  if (!existsSync(dbPath)) fail(`database not found: ${dbPath} (refusing to claim a backup of nothing)`);
  const dir = process.env.LAUNCHPAD_BACKUP_DIR ?? "/var/backups/launchpad";
  // The backup directory is PRECREATED by the operator (mode 2750,
  // setgid launchpad-backups) so completed snapshots inherit that
  // group and a separate backup operator can read them. Never chmod,
  // chown or otherwise alter a pre-existing directory; only a directory
  // we had to create ourselves gets the same 2750 mode.
  const dirExisted = existsSync(dir);
  mkdirSync(dir, { recursive: true, mode: 0o2750 });
  if (!dirExisted) chmodSync(dir, 0o2750);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(dir, `launchpad-${stamp}.db`);
  const db = new Database(dbPath, { readonly: true });
  await db.backup(dest);
  db.close();
  // Backups are single self-contained files: fold the WAL away so no
  // -wal/-shm sidecars are needed to read (or verify) them later.
  const out = new Database(dest);
  out.pragma("journal_mode = DELETE");
  out.close();
  if (!integrityOk(dest)) { rmSync(dest, { force: true }); fail("fresh backup failed integrity_check; deleted"); }
  const digest = sha256(dest);
  writeFileSync(dest + ".sha256", `${digest}  ${basename(dest)}\n`);
  // Completed, integrity-verified files only: explicitly 0640 so the
  // setgid group can read them even under a restrictive (0077) umask.
  chmodSync(dest, 0o640);
  chmodSync(dest + ".sha256", 0o640);
  const keep = Math.max(1, Number(process.env.LAUNCHPAD_BACKUP_KEEP ?? 14) || 14);
  const all = readdirSync(dir).filter((f) => f.startsWith("launchpad-") && f.endsWith(".db"))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const old of all.slice(keep)) { rmSync(join(dir, old.f)); rmSync(join(dir, old.f + ".sha256"), { force: true }); }
  console.log(`backup ok: ${dest} sha256=${digest}`);
  // No off-host push here by design: the backup operator PULLS this file
  // and its sidecar, verifies the checksum at the destination, and only
  // then writes the off-host receipt deploy-host.sh checks.
} else {
  console.error("usage: deploy-backup.mjs backup | verify <file>");
  process.exit(2);
}
