import { describe, test, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, statSync, symlinkSync, utimesSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const ROOT = process.cwd();
const HOST = join(ROOT, "scripts/deploy-host.sh");
const PUSH = join(ROOT, "scripts/deploy-push.sh");
const FORCED = join(ROOT, "deploy/ssh/forced-command.sh");
const BACKUP = join(ROOT, "scripts/deploy-backup.mjs");

function tmp() { return mkdtempSync(join(tmpdir(), "lp-deploy-")); }
function sha(n: number) { return String(n).padStart(40, "a").slice(0, 40); }
const hash = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");
const healthyFor = (s: string, extra: object = {}) =>
  JSON.stringify({ ok: true, demo: false, model_mode: "disabled", live_inference: "disabled", catalog_size: 3, release_sha: s, ...extra });
type ReleaseMode = "legacy" | "disabled" | "public_cards";
const healthyForMode = (s: string, mode: ReleaseMode, extra: object = {}) =>
  JSON.stringify({ ok: true, demo: false, model_mode: mode === "public_cards" ? "public_cards" : "disabled", live_inference: mode === "public_cards" ? "enabled" : "disabled", catalog_size: 3, release_sha: s, ...extra });
const releaseEnvFor = (s: string, mode: ReleaseMode) =>
  mode === "legacy" ? `LAUNCHPAD_RELEASE_SHA=${s}\n` : `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=${mode}\n`;

function makeArtifact(dir: string, gitSha: string, opts: { symlink?: boolean; traverse?: boolean; unlisted?: boolean; ghost?: boolean; releaseEnv?: string | null; releaseMode?: ReleaseMode } = {}) {
  const stage = mkdtempSync(join(dir, "stage-"));
  const files: Record<string, string> = {
    "dist/server.js": "console.log('ok');\n",
    "docs/research/catalog/estonian-business-services.json": JSON.stringify({ services: [] }),
    "package.json": JSON.stringify({ name: "ai-launchpad", type: "module" }),
    "node_modules/better-sqlite3/package.json": JSON.stringify({ name: "better-sqlite3" }),
  };
  // Manifest-bound identity, included in manifest hash coverage (tests
  // can supply a wrong file whose manifest hash still matches it).
  if (opts.releaseEnv !== null) files["release.env"] = opts.releaseEnv ?? releaseEnvFor(gitSha, opts.releaseMode ?? "legacy");
  const manifestFiles: Record<string, string> = {};
  for (const [rel, content] of Object.entries(files)) {
    const p = join(stage, rel); mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content); manifestFiles[rel] = hash(content);
  }
  if (opts.ghost) manifestFiles["dist/ghost.js"] = hash("not in tree");
  writeFileSync(join(stage, "RELEASE-MANIFEST.json"), JSON.stringify({ git_sha: gitSha, node: process.version, platform: "x", files: manifestFiles }));
  if (opts.unlisted) writeFileSync(join(stage, "dist/unlisted.js"), "export const x=1;\n");
  if (opts.symlink) symlinkSync("/etc/passwd", join(stage, "dist/escape"));
  const out = join(dir, `launchpad-${gitSha}.tar.gz`);
  if (opts.traverse) {
    writeFileSync(join(dir, "evil.txt"), "x");
    execFileSync("tar", ["-czf", out, "-C", dir, "--transform", "s|evil.txt|../evil.txt|", "evil.txt"]);
  } else {
    execFileSync("tar", ["-czf", out, "-C", stage, "."]);
  }
  return { tar: out, hash: hash(readFileSync(out)) };
}

function fakes(dir: string) {
  const log = join(dir, "systemctl.log"); writeFileSync(log, "");
  const health = join(dir, "health.json"); writeFileSync(health, healthyFor(sha(1)));
  const systemctl = join(dir, "fake-systemctl");
  writeFileSync(systemctl, `#!/bin/bash
cur="\$(basename "\$(readlink "\$LAUNCHPAD_ROOT/current" 2>/dev/null)" 2>/dev/null)"
echo "\$* current=\${cur:-none}" >> "${log}"
if [[ "\${1:-} \${2:-}" == "start launchpad-backup.service" ]]; then
  [[ -f "${dir}/backup-fails" ]] && exit 1
  [[ -f "${dir}/backup-noop" ]] && exit 0
  mkdir -p "$LAUNCHPAD_BACKUP_DIR"
  f="launchpad-$(date +%s%N).db"
  printf 'snapshot-%s' "$f" > "$LAUNCHPAD_BACKUP_DIR/$f"
  ( cd "$LAUNCHPAD_BACKUP_DIR" && sha256sum "$f" > "$f.sha256" )
  exit 0
fi
if [[ "\${1:-}" == "stop" ]]; then
  [[ -f "${dir}/stop-fails" ]] && exit 1
  if [[ -f "${dir}/stop-fails-once" ]]; then rm -f "${dir}/stop-fails-once"; exit 1; fi
  c=\$(( \$(cat "${dir}/stop-count" 2>/dev/null || echo 0) + 1 )); echo "\$c" > "${dir}/stop-count"
  if [[ -f "${dir}/stop-fails-on-second" && "\$c" -ge 2 ]]; then exit 1; fi
fi
if [[ "\${1:-}" == "restart" ]]; then
  if [[ -f "${dir}/restart-fails-once" ]]; then rm -f "${dir}/restart-fails-once"; exit 1; fi
  c=\$(( \$(cat "${dir}/restart-count" 2>/dev/null || echo 0) + 1 )); echo "\$c" > "${dir}/restart-count"
  if [[ -f "${dir}/restart-fails-on-second" && "\$c" -ge 2 ]]; then exit 1; fi
fi
exit 0
`, { mode: 0o755 });
  const curl = join(dir, "fake-curl");
  writeFileSync(curl, `#!/bin/sh\ncat "${health}" 2>/dev/null || exit 7\n`, { mode: 0o755 });
  return { log, health, systemctl, curl };
}
const setHealth = (f: ReturnType<typeof fakes>, s: string, extra: object = {}) => writeFileSync(f.health, healthyFor(s, extra));

function hostEnv(dir: string, f: ReturnType<typeof fakes>) {
  return { ...process.env, LAUNCHPAD_ROOT: join(dir, "root"), LAUNCHPAD_SYSTEMCTL: f.systemctl, LAUNCHPAD_CURL: f.curl, LAUNCHPAD_NODE: process.execPath, LAUNCHPAD_HEALTH_TRIES: "2", LAUNCHPAD_DB_PATH: join(dir, "live.db"), LAUNCHPAD_BACKUP_DIR: join(dir, "backups"), LAUNCHPAD_OFFHOST_RECEIPT: join(dir, "receipt/receipt.json") };
}
function runHost(env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync("bash", [HOST, ...args], { env, encoding: "utf8" });
}
const currentOf = (dir: string) => existsSync(join(dir, "root/current")) ? readlinkSync(join(dir, "root/current")).split("/").pop() : undefined;

// After a first (bootstrap) deploy, an existing-release deploy needs a DB,
// a fresh backup (the fake backup service creates it) and a recent
// off-host receipt from the (separate) backup operator.
function prepareExistingState(dir: string, opts: { receiptAgeSec?: number } = {}) {
  writeFileSync(join(dir, "live.db"), "pretend-db");
  const bdir = join(dir, "backups"); mkdirSync(bdir, { recursive: true });
  const name = "launchpad-seed.db", content = "seed-snapshot";
  writeFileSync(join(bdir, name), content);
  mkdirSync(join(dir, "receipt"), { recursive: true });
  writeFileSync(join(dir, "receipt/receipt.json"), JSON.stringify({
    backup_file: name, backup_sha256: hash(content),
    verified_at_epoch: Math.floor(Date.now() / 1000) - (opts.receiptAgeSec ?? 0),
  }));
}
function applyOk(dir: string, f: ReturnType<typeof fakes>, s: string, mode: ReleaseMode = "legacy") {
  const a = makeArtifact(dir, s, { releaseMode: mode });
  writeFileSync(f.health, healthyForMode(s, mode));
  const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
  expect(r.status, r.stderr).toBe(0);
  return a;
}
// Fake curl that answers from the CURRENT pointer's release.env, so one
// apply can verify the new tuple and (on failure) the previous tuple.
// A `missing-prereq` flag makes public_cards never-ready (curl exit 7),
// simulating absent private prerequisites.
function installDynamicHealth(dir: string, f: ReturnType<typeof fakes>) {
  writeFileSync(f.curl, `#!/bin/sh
cur="$(readlink "$LAUNCHPAD_ROOT/current" 2>/dev/null)" || exit 7
ef="$LAUNCHPAD_ROOT/$cur/release.env"
[ -f "$ef" ] || exit 7
s="$(sed -n 's/^LAUNCHPAD_RELEASE_SHA=//p' "$ef")"
m="$(sed -n 's/^MODEL_MODE=//p' "$ef")"
[ -n "$m" ] || m="disabled"
if [ "$m" = "public_cards" ] && [ -f "${dir}/missing-prereq" ]; then exit 7; fi
if [ "$m" = "public_cards" ]; then live="enabled"; else live="disabled"; fi
printf '{"ok":true,"demo":false,"model_mode":"%s","live_inference":"%s","catalog_size":3,"release_sha":"%s"}' "$m" "$live" "$s"
`, { mode: 0o755 });
}
const envShaOf = (dir: string) => readFileSync(join(dir, "root/current/release.env"), "utf8"); // via the single current pointer
const stagesOf = (dir: string) => existsSync(join(dir, "root/releases")) ? readdirSync(join(dir, "root/releases")).filter((x) => x.startsWith(".tmp-")) : [];
const restartCount = (f: ReturnType<typeof fakes>) => (readFileSync(f.log, "utf8").match(/restart launchpad\.service/g) ?? []).length;
const stopCountLog = (f: ReturnType<typeof fakes>) => (readFileSync(f.log, "utf8").match(/stop launchpad\.service/g) ?? []).length;
const realReleases = (dir: string) => readdirSync(join(dir, "root/releases")).filter((x) => /^[0-9a-f]{40}$/.test(x));
const resetCounts = (dir: string) => { writeFileSync(join(dir, "stop-count"), "0"); writeFileSync(join(dir, "restart-count"), "0"); };
// PATH-injected mv that fails once when the destination (last argument)
// has the given basename — a rename-boundary failure after preparation.
function envWithMvFail(dir: string, f: ReturnType<typeof fakes>, destBase: string) {
  const bin = join(dir, "mvbin"); mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "mv"), `#!/bin/bash
for last; do :; done
if [[ "$(basename "$last")" == "${destBase}" && -f "${dir}/mv-fails-once" ]]; then rm -f "${dir}/mv-fails-once"; exit 1; fi
exec /bin/mv "$@"
`, { mode: 0o755 });
  writeFileSync(join(dir, "mv-fails-once"), "1");
  return { ...hostEnv(dir, f), PATH: `${bin}:${process.env.PATH ?? ""}` };
}
// mv that fails on the Nth rename whose destination basename matches.
function envWithMvFailNth(dir: string, f: ReturnType<typeof fakes>, destBase: string, nth: number) {
  const bin = join(dir, "mvbin2"); mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "mv"), `#!/bin/bash
for last; do :; done
if [[ "$(basename "$last")" == "${destBase}" ]]; then
  c=$(( $(cat "${dir}/mv-count" 2>/dev/null || echo 0) + 1 )); echo "$c" > "${dir}/mv-count"
  [[ "$c" -eq ${nth} ]] && exit 1
fi
exec /bin/mv "$@"
`, { mode: 0o755 });
  writeFileSync(join(dir, "mv-count"), "0");
  return { ...hostEnv(dir, f), PATH: `${bin}:${process.env.PATH ?? ""}` };
}
describe("deployment scripts", () => {
  test("shell scripts parse and workflow stays manual/main-only with pinned actions", () => {
    for (const s of ["scripts/deploy-host.sh", "scripts/deploy-push.sh", "deploy/ssh/forced-command.sh"])
      execFileSync("bash", ["-n", join(ROOT, s)]);
    const yml = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    expect(yml).toContain("workflow_dispatch");
    expect(yml).not.toMatch(/^\s*push:/m);
    expect(yml).toContain("environment: production");
    expect(yml.match(/github\.ref == 'refs\/heads\/main'/g)).toHaveLength(2);
    expect(yml).toContain("merge-base --is-ancestor");
    expect(yml).toContain("npm run test:probes");
    expect(yml).toContain("npm run test:browser");
    expect(yml).toContain("trap 'rm -f ~/.ssh/deploy_key");
    expect(yml).toContain("ref: ${{ github.sha }}"); // control script from trusted workflow SHA
    for (const line of yml.match(/uses: actions\/[^\s]+/g) ?? [])
      expect(line, line).toMatch(/@[0-9a-f]{40}$/); // immutable commit pins only
    const push = readFileSync(PUSH, "utf8");
    expect(push).toContain("StrictHostKeyChecking=yes");
    expect(push).not.toContain("StrictHostKeyChecking=no");
    expect(push).not.toMatch(/\bscp\b/);
  });

  test("privilege contract: sudoers, units, caddy, forced key are exactly as documented", () => {
    const sudo = readFileSync(join(ROOT, "deploy/ssh/sudoers.example"), "utf8");
    const grants = sudo.split("\n").filter((l) => l.startsWith("launchpad-deploy "));
    expect(grants).toHaveLength(1);
    expect(grants[0].match(/systemctl/g)).toHaveLength(3);
    expect(grants[0]).toContain("systemctl restart launchpad.service");
    expect(grants[0]).toContain("systemctl stop launchpad.service");
    expect(grants[0]).toContain("systemctl start launchpad-backup.service");
    const keys = readFileSync(join(ROOT, "deploy/ssh/authorized_keys.example"), "utf8");
    expect(keys).toContain("restrict,command=\"/usr/local/lib/launchpad/forced-command.sh\"");
    const unit = readFileSync(join(ROOT, "deploy/systemd/launchpad.service"), "utf8");
    for (const s of ["MemoryHigh=512M", "MemoryMax=1G", "MemorySwapMax=0", "CPUQuota=50%", "TasksMax=128",
      "User=launchpad", "EnvironmentFile=/opt/launchpad/current/release.env", "ReadWritePaths=/var/lib/launchpad", "UMask=0077"])
      expect(unit, s).toContain(s);
    expect(unit).not.toContain("current-release.env");
    expect(unit).not.toContain("EnvironmentFile=-");
    const hostSrc = readFileSync(HOST, "utf8");
    expect(hostSrc).not.toContain("prepare_pair"); expect(hostSrc).not.toContain("restore_pair");
    const envEx = readFileSync(join(ROOT, "deploy/launchpad.env.example"), "utf8");
    expect(readFileSync(join(ROOT, "deploy/release-mode"), "utf8")).toBe("public_cards\n");
    expect(envEx).toMatch(/^MODEL_MODE=disabled$/m);
    for (const k of ["BASETEN_API_KEY", "LAUNCHPAD_MODEL_LEDGER_PATH", "LAUNCHPAD_MODEL_PRICING_CONFIRMED"])
      expect(envEx, k).toMatch(new RegExp(`^${k}=$`, "m"));
    expect(envEx).toMatch(/^LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS=$/m);
    expect(envEx).toContain("never email"); expect(envEx).not.toMatch(/LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS=\S/);
    expect(unit).not.toContain("/var/backups");
    const bunit = readFileSync(join(ROOT, "deploy/systemd/launchpad-backup.service"), "utf8");
    expect(bunit).toContain("User=launchpad");
    expect(bunit).toContain("LAUNCHPAD_BACKUP_DIR=/var/backups/launchpad");
    expect(bunit).toContain("UMask=0027");
    expect(bunit).toContain("ReadWritePaths=/var/lib/launchpad /var/backups/launchpad");
    const caddy = readFileSync(join(ROOT, "deploy/caddy/huppelaud.arikratt.ee.caddy"), "utf8");
    expect(caddy).toContain("header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}");
    expect(caddy).toContain("import /etc/caddy/launchpad.caddy");
    // No arbitrary-command backup/offhost hooks anywhere in deploy scripts
    for (const p of [HOST, BACKUP, FORCED]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toContain("LAUNCHPAD_BACKUP_CMD");
      expect(src, p).not.toContain("LAUNCHPAD_OFFHOST_CMD");
      expect(src, p).not.toMatch(/\bscp\b|\bsftp\b/);
    }
  });

  test("apply deploys (explicit bootstrap), switches current atomically, restarts fake service", () => {
    const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
    setHealth(f, s);
    const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("BOOTSTRAP");
    expect(currentOf(dir)).toBe(s);
    expect(envShaOf(dir)).toBe(`LAUNCHPAD_RELEASE_SHA=${s}\n`);
    expect(readFileSync(join(dir, "root/releases", s, "release.env"), "utf8")).toBe(`LAUNCHPAD_RELEASE_SHA=${s}\n`);
    expect(existsSync(join(dir, "root/current-release.env"))).toBe(false);
    // Stop (checked, still showing old/no pointer) completes before the
    // flip; restart is the first event showing the new pointer.
    const lines = readFileSync(f.log, "utf8").trim().split("\n");
    expect(lines[0]).toBe("stop launchpad.service current=none");
    expect(lines[1]).toBe(`restart launchpad.service current=${s}`);
    for (const l of lines) expect(l).toMatch(/^(stop|restart) launchpad\.service |^start launchpad-backup\.service /);
  });

  test("default systemctl command is 'sudo -n /usr/bin/systemctl' (fake sudo, never real)", () => {
    const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
    setHealth(f, s);
    // Fake sudo comes first on PATH and only records its arguments; it never
    // executes the command, so neither real sudo nor real systemctl runs.
    const bin = join(dir, "bin"); mkdirSync(bin, { recursive: true });
    const sudoLog = join(dir, "sudo.log"); writeFileSync(sudoLog, "");
    writeFileSync(join(bin, "sudo"), `#!/bin/sh\necho "$*" >> "${sudoLog}"\nexit 0\n`, { mode: 0o755 });
    const env = hostEnv(dir, f);
    delete env.LAUNCHPAD_SYSTEMCTL; // exercise the built-in default
    env.PATH = `${bin}:${process.env.PATH ?? ""}`;
    const r = runHost(env, ["apply", a.tar, s, a.hash]);
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(sudoLog, "utf8").trim().split("\n")).toEqual([
      "-n /usr/bin/systemctl stop launchpad.service",
      "-n /usr/bin/systemctl restart launchpad.service",
    ]);
    expect(readFileSync(f.log, "utf8")).toBe(""); // explicit fake systemctl not used
    expect(currentOf(dir)).toBe(s);
  });

  // Double-negative health: new check (2 tries x 1s sleep) + rollback check
  // (2 tries x 1s sleep) + overhead exceeds the default 5s timeout.
  test("failed health flips back to previous release; unverifiable old health is reported honestly (no false rolled-back claim)", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    const a2 = makeArtifact(dir, s2);
    setHealth(f, s2, { demo: true }); // neither new nor old SHA can verify
    const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(currentOf(dir)).toBe(s1);
    expect(r.stderr).toContain("rollback_health_failed_operator_needed");
    expect(r.stderr).not.toContain("rolled back");
  }, 30000);

  test("health release_sha mismatch (old process still healthy) rolls back", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    const a2 = makeArtifact(dir, s2);
    setHealth(f, s1); // old process answers; new SHA never actually served
    const stopsBefore = stopCountLog(f);
    const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(currentOf(dir)).toBe(s1);
    expect(r.stderr).toContain(`rolled back to ${s1} (verified)`);
    expect(stopCountLog(f)).toBe(stopsBefore + 2); // pre-activation stop + checked rollback stop
  });

  test("systemctl restart failure routes through rollback to previous release", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    const a2 = makeArtifact(dir, s2);
    setHealth(f, s1);
    writeFileSync(join(dir, "restart-fails-once"), "1");
    const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("systemctl restart failed");
    expect(currentOf(dir)).toBe(s1);
  });

  test("first-release restart failure stops service and clears current", () => {
    const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
    setHealth(f, s);
    writeFileSync(join(dir, "restart-fails-once"), "1");
    const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("first_deploy_cleared_stopped");
    expect(existsSync(join(dir, "root/current"))).toBe(false);
    expect(existsSync(join(dir, "root/current-release.env"))).toBe(false);
    expect(stopCountLog(f)).toBe(2); // pre-activation stop + checked stop before clearing
  });

  test("explicit rollback to retained release works", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir); applyOk(dir, f, s2);
    setHealth(f, s1);
    const r = runHost(hostEnv(dir, f), ["rollback", s1]);
    expect(r.status, r.stderr).toBe(0);
    expect(currentOf(dir)).toBe(s1);
    expect(envShaOf(dir)).toBe(`LAUNCHPAD_RELEASE_SHA=${s1}\n`);
    expect(existsSync(join(dir, "root/current-release.env"))).toBe(false);
  });

  test("rejects hash mismatch, symlink tar and traversal tar without switching", () => {
    const dir = tmp(), f = fakes(dir), s = sha(3), a = makeArtifact(dir, s);
    expect(runHost(hostEnv(dir, f), ["apply", a.tar, s, "0".repeat(64)]).status).not.toBe(0);
    const dir2 = tmp(), f2 = fakes(dir2), evil = makeArtifact(dir2, s, { symlink: true });
    expect(runHost(hostEnv(dir2, f2), ["apply", evil.tar, s, evil.hash]).status).not.toBe(0);
    const dir3 = tmp(), f3 = fakes(dir3), trav = makeArtifact(dir3, s, { traverse: true });
    expect(runHost(hostEnv(dir3, f3), ["apply", trav.tar, s, trav.hash]).status).not.toBe(0);
    expect(existsSync(join(dir3, "root/current"))).toBe(false);
    expect(existsSync(join(dir3, "evil.txt"))).toBe(true); // only the fixture, never extracted elsewhere
  });

  test("rejects bad SHA shape and manifest for another SHA", () => {
    const dir = tmp(), f = fakes(dir), s = sha(4), a = makeArtifact(dir, s);
    expect(runHost(hostEnv(dir, f), ["apply", a.tar, "notasha", a.hash]).status).not.toBe(0);
    expect(runHost(hostEnv(dir, f), ["apply", a.tar, sha(9), a.hash]).status).not.toBe(0);
    expect(existsSync(join(dir, "root/current"))).toBe(false);
  });

  test("backup gate: existing state + failing fixed backup service = refuse deploy", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    writeFileSync(join(dir, "backup-fails"), "1");
    const a2 = makeArtifact(dir, s2); setHealth(f, s2);
    const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("pre-deploy backup service");
    expect(currentOf(dir)).toBe(s1);
  });

  test("backup gate: absent or stale (>24h) off-host receipt = refuse deploy", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1);
    writeFileSync(join(dir, "live.db"), "pretend-db"); // DB exists, NO receipt seeded
    const a2 = makeArtifact(dir, s2); setHealth(f, s2);
    let r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("off-host receipt absent");
    prepareExistingState(dir, { receiptAgeSec: 25 * 3600 });
    r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("stale");
    expect(currentOf(dir)).toBe(s1);
  });

  test("manifest must cover the extracted tree exactly; failed checks clean staging", () => {
    for (const opts of [{ unlisted: true }, { ghost: true }]) {
      const dir = tmp(), f = fakes(dir), s = sha(5), a = makeArtifact(dir, s, opts);
      setHealth(f, s);
      const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
      expect(r.status, r.stderr).not.toBe(0);
      expect(r.stderr).toContain("manifest verification failed");
      expect(stagesOf(dir)).toEqual([]);
      expect(existsSync(join(dir, "root/current"))).toBe(false);
    }
    // Wrong-manifest-SHA extraction also leaves no staging behind.
    const dir = tmp(), f = fakes(dir), a = makeArtifact(dir, sha(5));
    expect(runHost(hostEnv(dir, f), ["apply", a.tar, sha(9), a.hash]).status).not.toBe(0);
    expect(stagesOf(dir)).toEqual([]);
  });

  test("retention: failed candidates + invalid stage never prune the previous good release", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    const old = new Date(Date.now() - 60_000);
    utimesSync(join(dir, "root/releases", s1), old, old);
    // Two well-formed candidates fail health (old release still answers).
    for (const s of [sha(3), sha(4)]) {
      const a = makeArtifact(dir, s); setHealth(f, s1);
      expect(runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]).status).not.toBe(0);
      expect(currentOf(dir)).toBe(s1);
    }
    // One invalid archive fails manifest verification (staging cleaned).
    const bad = makeArtifact(dir, sha(6), { unlisted: true });
    expect(runHost(hostEnv(dir, f), ["apply", bad.tar, sha(6), bad.hash]).status).not.toBe(0);
    expect(stagesOf(dir)).toEqual([]);
    // A stray non-release dir must not count as a release either.
    mkdirSync(join(dir, "root/releases/not-a-release"), { recursive: true });
    applyOk(dir, f, s2);
    // Total budget is exactly 3 INCLUDING current (s2) + previous (s1).
    expect(realReleases(dir).sort()).toHaveLength(3);
    expect(realReleases(dir)).toContain(s1); expect(realReleases(dir)).toContain(s2);
    expect(existsSync(join(dir, "root/releases", s1))).toBe(true); // previous good preserved
    setHealth(f, s1);
    const rb = runHost(hostEnv(dir, f), ["rollback", s1]);
    expect(rb.status, rb.stderr).toBe(0);
    expect(currentOf(dir)).toBe(s1);
  }, 30000);

  test("activation prepare failure (temp link blocked) leaves pointer untouched and does not stop/restart (existing + first)", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    mkdirSync(join(dir, "root/.current.tmp")); // temp link path blocked by a directory
    const a2 = makeArtifact(dir, s2); setHealth(f, s2);
    const before = restartCount(f), stopsBefore = stopCountLog(f);
    const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("prepare_failed_current_unchanged");
    expect(currentOf(dir)).toBe(s1);
    expect(envShaOf(dir)).toBe(`LAUNCHPAD_RELEASE_SHA=${s1}\n`); // identity follows the one pointer
    expect(restartCount(f)).toBe(before); expect(stopCountLog(f)).toBe(stopsBefore);

    const dir2 = tmp(), f2 = fakes(dir2), a = makeArtifact(dir2, s1);
    mkdirSync(join(dir2, "root/.current.tmp"), { recursive: true });
    setHealth(f2, s1);
    const r2 = runHost(hostEnv(dir2, f2), ["apply", a.tar, s1, a.hash]);
    expect(r2.status).not.toBe(0);
    expect(existsSync(join(dir2, "root/current"))).toBe(false);
    expect(existsSync(join(dir2, "root/current-release.env"))).toBe(false);
    expect(readFileSync(f2.log, "utf8")).toBe(""); // no service mutation at all
  });

  test("initial stop failure aborts with pointer untouched; initial flip failure leaves old pointer, stopped, no restart and no old/new identity pairing", () => {
    // Stop failure: no flip at all.
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    writeFileSync(join(dir, "stop-fails"), "1");
    const a2 = makeArtifact(dir, s2); setHealth(f, s2);
    const before = restartCount(f);
    let r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("stop_failed_current_unchanged");
    expect(currentOf(dir)).toBe(s1); expect(envShaOf(dir)).toBe(`LAUNCHPAD_RELEASE_SHA=${s1}\n`);
    expect(restartCount(f)).toBe(before);

    // Flip failure after a successful stop: old pointer remains (so code
    // and release.env are necessarily the old pair), service stopped.
    const dirF = tmp(), fF = fakes(dirF);
    applyOk(dirF, fF, s1); prepareExistingState(dirF);
    const aF = makeArtifact(dirF, s2); setHealth(fF, s2);
    const beforeF = restartCount(fF);
    r = runHost(envWithMvFail(dirF, fF, "current"), ["apply", aF.tar, s2, aF.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("flip_failed_stopped_operator_needed");
    expect(currentOf(dirF)).toBe(s1); expect(envShaOf(dirF)).toBe(`LAUNCHPAD_RELEASE_SHA=${s1}\n`);
    expect(restartCount(fF)).toBe(beforeF);
    expect(r.stderr).not.toContain("rolled back");

    // First deploy flip failure: no pointer, no global env, no restart.
    const dir1 = tmp(), f1 = fakes(dir1), a1 = makeArtifact(dir1, s1);
    setHealth(f1, s1);
    r = runHost(envWithMvFail(dir1, f1, "current"), ["apply", a1.tar, s1, a1.hash]);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(dir1, "root/current"))).toBe(false);
    expect(existsSync(join(dir1, "root/current-release.env"))).toBe(false);
    expect(restartCount(f1)).toBe(0); expect(stopCountLog(f1)).toBe(1);
  });

  test("rollback stop/flip/restart failures are honest: no forbidden flip or restart, no false rolled-back claim", () => {
    const s1 = sha(1), s2 = sha(2);
    // (a) Rollback stop fails -> pointer stays on the FAILED release, no extra restart.
    {
      const dir = tmp(), f = fakes(dir);
      applyOk(dir, f, s1); prepareExistingState(dir);
      resetCounts(dir); writeFileSync(join(dir, "stop-fails-on-second"), "1");
      const a2 = makeArtifact(dir, s2); setHealth(f, s1); // new health fails
      const before = restartCount(f);
      const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("rollback_stop_failed_operator_needed");
      expect(currentOf(dir)).toBe(s2); // NOT flipped
      expect(restartCount(f)).toBe(before + 1); // only the failed new restart
      expect(r.stderr).not.toContain("rolled back");
    }
    // (b) Rollback flip fails -> stopped, no restart of wrong release.
    {
      const dir = tmp(), f = fakes(dir);
      applyOk(dir, f, s1); prepareExistingState(dir);
      const a2 = makeArtifact(dir, s2); setHealth(f, s1);
      const before = restartCount(f);
      const r = runHost(envWithMvFailNth(dir, f, "current", 2), ["apply", a2.tar, s2, a2.hash]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("rollback_flip_failed_stopped_operator_needed");
      expect(currentOf(dir)).toBe(s2);
      expect(restartCount(f)).toBe(before + 1);
      expect(r.stderr).not.toContain("rolled back");
    }
    // (c) Old restart fails after flip back -> operator needed, not rolled back.
    {
      const dir = tmp(), f = fakes(dir);
      applyOk(dir, f, s1); prepareExistingState(dir);
      resetCounts(dir); writeFileSync(join(dir, "restart-fails-on-second"), "1");
      const a2 = makeArtifact(dir, s2); setHealth(f, s1); // new health fails, old restart is 2nd
      const r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("rollback_restart_failed_operator_needed");
      expect(currentOf(dir)).toBe(s1);
      expect(r.stderr).not.toContain("rolled back");
    }
  }, 30000);

  test("manifest-bound release.env: missing/wrong/extra-line/injection rejected even with matching manifest hash, before any stop", () => {
    const s = sha(5);
    const variants: Record<string, string | null> = {
      missing: null,
      wrongSha: `LAUNCHPAD_RELEASE_SHA=${sha(9)}\n`,
      extraLine: `LAUNCHPAD_RELEASE_SHA=${s}\nEXTRA=1\n`,
      duplicateInjection: `LAUNCHPAD_RELEASE_SHA=${s}\nLAUNCHPAD_RELEASE_SHA=${sha(9)}\n`,
      noNewline: `LAUNCHPAD_RELEASE_SHA=${s}`,
    };
    for (const [name, content] of Object.entries(variants)) {
      const dir = tmp(), f = fakes(dir), a = makeArtifact(dir, s, { releaseEnv: content });
      setHealth(f, s);
      const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
      expect(r.status, `${name}: ${r.stderr}`).not.toBe(0);
      expect(r.stderr, name).toContain("manifest verification failed");
      expect(existsSync(join(dir, "root/current")), name).toBe(false);
      expect(readFileSync(f.log, "utf8"), name).toBe(""); // fails before stop/restart
      expect(stagesOf(dir), name).toEqual([]);
    }
  });

  test("fail-closed bootstrap: malformed/orphan state rejected before any service mutation", () => {
    const sNew = sha(1), sOld = sha(7);
    const cases: Record<string, (dir: string) => void> = {
      "regular-file current": (dir) => { mkdirSync(join(dir, "root"), { recursive: true }); writeFileSync(join(dir, "root/current"), "x"); },
      "dangling current": (dir) => { mkdirSync(join(dir, "root/releases"), { recursive: true }); symlinkSync(`releases/${sOld}`, join(dir, "root/current")); },
      "stale global env": (dir) => { mkdirSync(join(dir, "root"), { recursive: true }); writeFileSync(join(dir, "root/current-release.env"), `LAUNCHPAD_RELEASE_SHA=${sOld}\n`); },
      "stale global env dangling link": (dir) => { mkdirSync(join(dir, "root"), { recursive: true }); symlinkSync("missing.env", join(dir, "root/current-release.env")); },
      "current to unverifiable release": (dir) => { mkdirSync(join(dir, `root/releases/${sOld}`), { recursive: true }); symlinkSync(`releases/${sOld}`, join(dir, "root/current")); },
      "database directory": (dir) => { mkdirSync(join(dir, "live.db")); },
      "database dangling link": (dir) => { symlinkSync(join(dir, "missing.db"), join(dir, "live.db")); },
      "orphan database": (dir) => { writeFileSync(join(dir, "live.db"), "pretend-db"); },
    };
    for (const [name, setup] of Object.entries(cases)) {
      const dir = tmp(), f = fakes(dir), a = makeArtifact(dir, sNew);
      setup(dir); setHealth(f, sNew);
      const r = runHost(hostEnv(dir, f), ["apply", a.tar, sNew, a.hash]);
      expect(r.status, `${name}: ${r.stderr}`).not.toBe(0);
      expect(r.stderr, name).not.toContain("BOOTSTRAP");
      expect(readFileSync(f.log, "utf8"), name).toBe(""); // rejected before backup/restart/stop
    }
    // Legitimate first deploy with a prepared empty releases dir still works.
    const dir = tmp(), f = fakes(dir), a = makeArtifact(dir, sNew);
    mkdirSync(join(dir, "root/releases"), { recursive: true });
    setHealth(f, sNew);
    const r = runHost(hostEnv(dir, f), ["apply", a.tar, sNew, a.hash]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain("BOOTSTRAP");
  });

  test("backup gate: sidecar must strictly name and match the selected newest snapshot", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir);
    writeFileSync(join(dir, "backup-noop"), "1"); // fake service creates nothing new
    const bdir = join(dir, "backups");
    writeFileSync(join(bdir, "launchpad-seed.db.sha256"), `${hash("seed-snapshot")}  launchpad-seed.db\n`);
    const newer = "launchpad-newer.db"; writeFileSync(join(bdir, newer), "corrupt-newest");
    const tOld = new Date(Date.now() - 20_000), tNow = new Date();
    utimesSync(join(bdir, "launchpad-seed.db"), tOld, tOld);
    utimesSync(join(bdir, newer), tNow, tNow);
    // Wrong target: newest sidecar copies the older seed sidecar verbatim.
    writeFileSync(join(bdir, newer + ".sha256"), `${hash("seed-snapshot")}  launchpad-seed.db\n`);
    const a2 = makeArtifact(dir, s2); setHealth(f, s2);
    let r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("does not strictly name");
    expect(currentOf(dir)).toBe(s1);
    // Corruption: sidecar names the newest file but with a wrong digest.
    writeFileSync(join(bdir, newer + ".sha256"), `${"0".repeat(64)}  ${newer}\n`);
    r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("checksum verification failed");
    // Correct binding passes the gate and the deploy succeeds.
    writeFileSync(join(bdir, newer + ".sha256"), `${hash("corrupt-newest")}  ${newer}\n`);
    r = runHost(hostEnv(dir, f), ["apply", a2.tar, s2, a2.hash]);
    expect(r.status, r.stderr).toBe(0);
    expect(currentOf(dir)).toBe(s2);
  });

  test("packaging: only generated JS/map dist outputs are packaged, nested outputs retained", () => {
    const dir = tmp(), repo = join(dir, "repo");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    cpSync(join(ROOT, "scripts/deploy-package.mjs"), join(repo, "scripts/deploy-package.mjs"));
    const put = (rel: string, content: string) => { const p = join(repo, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, content); };
    put("dist/server.js", "console.log('ok');\n");
    put("dist/nested/mod.js", "export {};\n");
    put("dist/nested/mod.js.map", "{}");
    put("dist/.env", "SECRET=1"); put("dist/probe.db", "db"); put("dist/private.key", "key"); put("dist/nested/notes.txt", "x");
    put("docs/research/catalog/estonian-business-services.json", "{}");
    put("package.json", "{}"); put("package-lock.json", "{}");
    const bin = join(dir, "bin"); mkdirSync(bin);
    const s = sha(1);
    writeFileSync(join(bin, "git"), `#!/bin/sh\nif [ "$1" = "show" ]; then printf 'disabled\\n'; exit 0; fi\necho ${s}\n`, { mode: 0o755 });
    writeFileSync(join(bin, "npm"), `#!/bin/sh\nmkdir -p node_modules/better-sqlite3\nprintf '{}' > node_modules/better-sqlite3/package.json\n`, { mode: 0o755 });
    const r = spawnSync(process.execPath, [join(repo, "scripts/deploy-package.mjs"), s, "release/test.tgz"],
      { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const names = execFileSync("tar", ["-tzf", join(repo, "release/test.tgz")], { encoding: "utf8" });
    expect(names).toContain("dist/server.js");
    expect(names).toContain("dist/nested/mod.js");
    expect(names).toContain("dist/nested/mod.js.map");
    expect(names).toContain("release.env");
    // release.env is exact and manifest-hash-covered.
    const extract = join(dir, "extract"); mkdirSync(extract);
    execFileSync("tar", ["-xzf", join(repo, "release/test.tgz"), "-C", extract]);
    expect(readFileSync(join(extract, "release.env"), "utf8")).toBe(`LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled\n`);
    const manifest = JSON.parse(readFileSync(join(extract, "RELEASE-MANIFEST.json"), "utf8"));
    expect(manifest.files["release.env"]).toBe(hash(`LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled\n`));
    for (const bad of ["dist/.env", "probe.db", "private.key", "notes.txt"]) expect(names).not.toContain(bad);
  });

  test("chain legacy -> new disabled -> public_cards, then direct rollback enabled -> legacy (exact tuples)", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2), s3 = sha(3);
    installDynamicHealth(dir, f);
    applyOk(dir, f, s1, "legacy"); prepareExistingState(dir);
    expect(envShaOf(dir)).toBe(releaseEnvFor(s1, "legacy"));
    applyOk(dir, f, s2, "disabled");
    expect(currentOf(dir)).toBe(s2); expect(envShaOf(dir)).toBe(releaseEnvFor(s2, "disabled"));
    applyOk(dir, f, s3, "public_cards");
    expect(currentOf(dir)).toBe(s3); expect(envShaOf(dir)).toBe(releaseEnvFor(s3, "public_cards"));
    // Direct public_cards -> legacy rollback: legacy planned tuple is disabled.
    let r = runHost(hostEnv(dir, f), ["rollback", s1]);
    expect(r.status, r.stderr).toBe(0); expect(currentOf(dir)).toBe(s1);
    // And back forward through explicit rollback to the enabled release.
    r = runHost(hostEnv(dir, f), ["rollback", s3]);
    expect(r.status, r.stderr).toBe(0); expect(currentOf(dir)).toBe(s3);
    r = runHost(hostEnv(dir, f), ["rollback", s2]);
    expect(r.status, r.stderr).toBe(0); expect(currentOf(dir)).toBe(s2);
  }, 30000);

  test("wrong model_mode, wrong live flag, and stale SHA health are all rejected for a public_cards target", () => {
    const s1 = sha(1), s2 = sha(2);
    const variants: Record<string, object> = {
      wrongMode: { model_mode: "disabled", live_inference: "enabled" },
      wrongLive: { model_mode: "public_cards", live_inference: "disabled" },
      wrongBothDisabled: { model_mode: "disabled", live_inference: "disabled" },
    };
    for (const [name, extra] of Object.entries(variants)) {
      const dir = tmp(), f = fakes(dir);
      applyOk(dir, f, s1, "disabled"); prepareExistingState(dir);
      const a = makeArtifact(dir, s2, { releaseMode: "public_cards" });
      writeFileSync(f.health, healthyForMode(s2, "public_cards", extra));
      const r = runHost(hostEnv(dir, f), ["apply", a.tar, s2, a.hash]);
      expect(r.status, `${name}: ${r.stderr}`).not.toBe(0);
      expect(currentOf(dir), name).toBe(s1); // flipped back, never claimed deployed
      expect(r.stderr, name).toContain("health check failed");
    }
    // Stale process: enabled tuple but OLD release_sha.
    const dir = tmp(), f = fakes(dir);
    applyOk(dir, f, s1, "disabled"); prepareExistingState(dir);
    const a = makeArtifact(dir, s2, { releaseMode: "public_cards" });
    writeFileSync(f.health, healthyForMode(s1, "public_cards"));
    const r = runHost(hostEnv(dir, f), ["apply", a.tar, s2, a.hash]);
    expect(r.status, r.stderr).not.toBe(0); expect(currentOf(dir)).toBe(s1);
  }, 30000);

  test("never-ready public_cards (missing private prereq) rolls back to verified disabled previous release", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    installDynamicHealth(dir, f);
    applyOk(dir, f, s1, "disabled"); prepareExistingState(dir);
    writeFileSync(join(dir, "missing-prereq"), "1");
    const a = makeArtifact(dir, s2, { releaseMode: "public_cards" });
    const r = runHost(hostEnv(dir, f), ["apply", a.tar, s2, a.hash]);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain(`rolled back to ${s1} (verified)`);
    expect(currentOf(dir)).toBe(s1);
    expect(envShaOf(dir)).toBe(releaseEnvFor(s1, "disabled"));
  });

  test("same-SHA conflicting mode / v1-vs-v2 shape / invalid incoming manifest rejected before stop, existing release unchanged; identical reapply works", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1);
    installDynamicHealth(dir, f);
    applyOk(dir, f, s1, "legacy"); prepareExistingState(dir);
    const releaseDir = join(dir, "root/releases", s1);
    const beforeEnv = readFileSync(join(releaseDir, "release.env"), "utf8");
    const beforeManifest = readFileSync(join(releaseDir, "RELEASE-MANIFEST.json"), "utf8");
    const stopsBefore = stopCountLog(f);
    // (a) Same SHA, self-consistent artifact, different mode.
    let bad = makeArtifact(dir, s1, { releaseMode: "public_cards" });
    let r = runHost(hostEnv(dir, f), ["apply", bad.tar, s1, bad.hash]);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("same-SHA release.env conflict");
    // (b) Same SHA, same planned mode but v2-vs-v1 exact shape differs.
    bad = makeArtifact(dir, s1, { releaseMode: "disabled" });
    r = runHost(hostEnv(dir, f), ["apply", bad.tar, s1, bad.hash]);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("same-SHA release.env conflict");
    // (c) Same SHA, self-consistent hashes but invalid manifest coverage.
    bad = makeArtifact(dir, s1, { unlisted: true });
    r = runHost(hostEnv(dir, f), ["apply", bad.tar, s1, bad.hash]);
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toContain("manifest verification failed");
    // All rejected BEFORE any service stop, existing release byte-identical.
    expect(stopCountLog(f)).toBe(stopsBefore);
    expect(readFileSync(join(releaseDir, "release.env"), "utf8")).toBe(beforeEnv);
    expect(readFileSync(join(releaseDir, "RELEASE-MANIFEST.json"), "utf8")).toBe(beforeManifest);
    expect(currentOf(dir)).toBe(s1);
    expect(stagesOf(dir)).toEqual([]);
    // (d) Identical reapply is idempotent.
    const again = makeArtifact(dir, s1, { releaseMode: "legacy" });
    r = runHost(hostEnv(dir, f), ["apply", again.tar, s1, again.hash]);
    expect(r.status, r.stderr).toBe(0);
    expect(currentOf(dir)).toBe(s1);
    expect(readFileSync(join(releaseDir, "release.env"), "utf8")).toBe(beforeEnv);
  }, 30000);

  test("exact release.env shapes: only v1 and v2 disabled/public_cards accepted, all else rejected before stop", () => {
    const s = sha(5);
    const badVariants: Record<string, string> = {
      reordered: `MODEL_MODE=disabled\nLAUNCHPAD_RELEASE_SHA=${s}\n`,
      unknownMode: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=enabled\n`,
      extraAfterMode: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled\nEXTRA=1\n`,
      duplicateMode: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled\nMODEL_MODE=public_cards\n`,
      blankLine: `LAUNCHPAD_RELEASE_SHA=${s}\n\nMODEL_MODE=disabled\n`,
      leadingSpace: ` LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled\n`,
      trailingSpace: `LAUNCHPAD_RELEASE_SHA=${s} \nMODEL_MODE=disabled\n`,
      crlf: `LAUNCHPAD_RELEASE_SHA=${s}\r\nMODEL_MODE=disabled\r\n`,
      modeNoNewline: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=disabled`,
      shellInjection: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE=$(id)\n`,
      quotedMode: `LAUNCHPAD_RELEASE_SHA=${s}\nMODEL_MODE="disabled"\n`,
    };
    for (const [name, content] of Object.entries(badVariants)) {
      const dir = tmp(), f = fakes(dir), a = makeArtifact(dir, s, { releaseEnv: content });
      writeFileSync(f.health, healthyForMode(s, "disabled"));
      const r = runHost(hostEnv(dir, f), ["apply", a.tar, s, a.hash]);
      expect(r.status, `${name}: ${r.stderr}`).not.toBe(0);
      expect(r.stderr, name).toContain("manifest verification failed");
      expect(readFileSync(f.log, "utf8"), name).toBe("");
      expect(existsSync(join(dir, "root/current")), name).toBe(false);
    }
    // The two valid v2 shapes deploy (v1 is covered across the suite).
    for (const mode of ["disabled", "public_cards"] as const) {
      const dir = tmp(), f = fakes(dir);
      const a = applyOk(dir, f, s, mode);
      expect(a).toBeTruthy(); expect(currentOf(dir)).toBe(s);
      const names = execFileSync("tar", ["-tzf", a.tar], { encoding: "utf8" });
      for (const secretish of ["BASETEN", "LEDGER", "dist/.env", "launchpad.env\n"]) expect(names).not.toContain(secretish);
    }
  }, 30000);

  test("packager policy provenance: committed git object only — env/dirty file cannot change mode; new policy commit changes SHA+mode; missing/invalid rejected", () => {
    const dir = tmp(), repo = join(dir, "repo");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    cpSync(join(ROOT, "scripts/deploy-package.mjs"), join(repo, "scripts/deploy-package.mjs"));
    const put = (rel: string, content: string) => { const p = join(repo, rel); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, content); };
    put("dist/server.js", "console.log('ok');\n");
    put("dist/.env", "SECRET=1");
    put("docs/research/catalog/estonian-business-services.json", "{}");
    put("package.json", "{}"); put("package-lock.json", "{}");
    const bin = join(dir, "bin"); mkdirSync(bin);
    writeFileSync(join(bin, "npm"), `#!/bin/sh\nmkdir -p node_modules/better-sqlite3\nprintf '{}' > node_modules/better-sqlite3/package.json\n`, { mode: 0o755 });
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t");
    const commitAll = (msg: string) => { git("add", "-A"); git("commit", "-qm", msg); return git("rev-parse", "HEAD"); };
    const pkgEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, MODEL_MODE: "public_cards" };
    const pack = (headSha: string, out: string) =>
      spawnSync(process.execPath, [join(repo, "scripts/deploy-package.mjs"), headSha, out], { cwd: repo, env: pkgEnv, encoding: "utf8" });
    const packagedEnv = (out: string) => {
      const ex = mkdtempSync(join(dir, "ex-")); execFileSync("tar", ["-xzf", join(repo, out), "-C", ex]);
      return { env: readFileSync(join(ex, "release.env"), "utf8"), names: execFileSync("tar", ["-tzf", join(repo, out)], { encoding: "utf8" }) };
    };
    // Missing committed policy: fail closed (no default fallback).
    let head = commitAll("no policy");
    let r = pack(head, "release/a.tgz");
    expect(r.status, r.stderr).not.toBe(0); expect(r.stderr).toContain("missing committed deploy/release-mode");
    // Invalid committed policy (bad value, then missing newline).
    put("deploy/release-mode", "enabled\n"); head = commitAll("bad policy");
    r = pack(head, "release/a.tgz"); expect(r.status, r.stderr).not.toBe(0); expect(r.stderr).toContain("invalid committed");
    put("deploy/release-mode", "disabled"); head = commitAll("no newline");
    r = pack(head, "release/a.tgz"); expect(r.status, r.stderr).not.toBe(0); expect(r.stderr).toContain("invalid committed");
    // Committed disabled; dirty worktree + env claim public_cards: artifact stays disabled.
    put("deploy/release-mode", "disabled\n"); head = commitAll("disabled policy");
    put("deploy/release-mode", "public_cards\n"); // dirty, uncommitted
    r = pack(head, "release/a.tgz");
    expect(r.status, r.stderr).toBe(0);
    let got = packagedEnv("release/a.tgz");
    expect(got.env).toBe(`LAUNCHPAD_RELEASE_SHA=${head}\nMODEL_MODE=disabled\n`);
    expect(got.names).not.toContain("dist/.env"); expect(got.names).not.toContain("SECRET");
    // Committing the policy change yields a NEW SHA whose artifact is public_cards.
    const head2 = commitAll("public_cards policy");
    expect(head2).not.toBe(head);
    r = pack(head2, "release/b.tgz");
    expect(r.status, r.stderr).toBe(0);
    got = packagedEnv("release/b.tgz");
    expect(got.env).toBe(`LAUNCHPAD_RELEASE_SHA=${head2}\nMODEL_MODE=public_cards\n`);
  }, 30000);
});
describe("SSH forced-command contract (fake ssh + forced command + host helper together)", () => {
  function forcedEnv(dir: string, f: ReturnType<typeof fakes>, extra: NodeJS.ProcessEnv = {}) {
    return { ...hostEnv(dir, f), LAUNCHPAD_INCOMING: join(dir, "root/incoming"), LAUNCHPAD_HOST_CMD: HOST, ...extra };
  }
  function runForced(env: NodeJS.ProcessEnv, command: string, input?: Buffer) {
    return spawnSync("bash", [FORCED], { env: { ...env, SSH_ORIGINAL_COMMAND: command }, input, encoding: "utf8" });
  }
  function makeFakeSsh(dir: string) {
    const p = join(dir, "fake-ssh");
    writeFileSync(p, `#!/bin/bash
echo "$*" >> "${dir}/ssh.log"
while [[ $# -gt 0 ]]; do case "$1" in -i|-o) shift 2;; *@*) shift; break;; *) shift;; esac; done
export SSH_ORIGINAL_COMMAND="$*"
exec bash "$FAKE_FORCED_COMMAND"
`, { mode: 0o755 });
    return p;
  }
  const incomingOf = (dir: string) => existsSync(join(dir, "root/incoming")) ? readdirSync(join(dir, "root/incoming")) : [];

  test("exact grammar: shells, extra tokens/lines, scp and bad shapes never reach the host helper", () => {
    const dir = tmp(), f = fakes(dir);
    const recorder = join(dir, "host-recorder"), rlog = join(dir, "host.log");
    writeFileSync(recorder, `#!/bin/bash\necho "$*" >> "${rlog}"\n`, { mode: 0o755 });
    writeFileSync(rlog, "");
    const env = forcedEnv(dir, f, { LAUNCHPAD_HOST_CMD: recorder });
    const s = sha(1), h = "b".repeat(64);
    const bad = ["", "deploy", `deploy ${s}`, `deploy ${s} ${h} extra`, `deploy ${s} ${h}\ncurrent`,
      `deploy ${s.toUpperCase()} ${h}`, `deploy ../${s} ${h}`, "current extra", "current; rm -rf /",
      "scp -t /opt/launchpad/incoming", "sftp", "/bin/bash", "apply x y z", `rollback ${s} extra`];
    for (const cmd of bad) {
      const r = runForced(env, cmd);
      expect(r.status, cmd).toBe(2);
    }
    expect(readFileSync(rlog, "utf8")).toBe("");
    // ... while the three legal commands do reach it (deploy needs stdin).
    expect(runForced(env, "current").status).toBe(0);
    expect(runForced(env, `rollback ${s}`).status).toBe(0);
    expect(readFileSync(rlog, "utf8")).toContain(`rollback ${s}`);
  });

  test("end-to-end stdin upload via fake ssh through deploy-push deploys and cleans incoming", () => {
    const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
    setHealth(f, s);
    const env = { ...forcedEnv(dir, f), FAKE_FORCED_COMMAND: FORCED,
      DEPLOY_HOST: "testhost", DEPLOY_USER: "launchpad-deploy",
      DEPLOY_SSH_KEY_FILE: join(dir, "key"), DEPLOY_KNOWN_HOSTS_FILE: join(dir, "kh"),
      DEPLOY_SSH_BIN: makeFakeSsh(dir) };
    writeFileSync(join(dir, "key"), "k"); writeFileSync(join(dir, "kh"), "h");
    const r = spawnSync("bash", [PUSH, a.tar, s, a.hash], { env, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`verified deployed SHA: ${s}`);
    // Both SSH calls (upload and `current` readback) must carry the fixed
    // authenticated host-key alias the pinned known_hosts is keyed by.
    const sshLog = readFileSync(join(dir, "ssh.log"), "utf8");
    expect(sshLog.match(/HostKeyAlias=launchpad-prod/g)).toHaveLength(2);
    expect(sshLog).toContain("StrictHostKeyChecking=yes");
    expect(currentOf(dir)).toBe(s);
    expect(incomingOf(dir)).toEqual([]); // spooled upload removed
  });

  test("truncated, oversize and empty uploads are rejected and spooled files removed", () => {
    const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
    const bytes = readFileSync(a.tar);
    const trunc = runForced(forcedEnv(dir, f), `deploy ${s} ${a.hash}`, bytes.subarray(0, 40));
    expect(trunc.status).not.toBe(0);
    expect(trunc.stderr).toContain("sha256 mismatch");
    const over = runForced(forcedEnv(dir, f, { LAUNCHPAD_MAX_ARTIFACT_BYTES: "64" }), `deploy ${s} ${a.hash}`, bytes);
    expect(over.status).not.toBe(0);
    expect(over.stderr).toContain("outside fixed bounds");
    const empty = runForced(forcedEnv(dir, f), `deploy ${s} ${a.hash}`, Buffer.alloc(0));
    expect(empty.status).not.toBe(0);
    expect(incomingOf(dir)).toEqual([]);
    expect(existsSync(join(dir, "root/current"))).toBe(false);
  });

  test("transport preflight: missing/invalid key or known-hosts files fail before any SSH call", () => {
    for (const broken of ["key-absent", "kh-absent", "key-directory", "kh-directory"]) {
      const dir = tmp(), f = fakes(dir), s = sha(1), a = makeArtifact(dir, s);
      const env = { ...forcedEnv(dir, f), FAKE_FORCED_COMMAND: FORCED,
        DEPLOY_HOST: "testhost", DEPLOY_USER: "launchpad-deploy",
        DEPLOY_SSH_KEY_FILE: join(dir, "key"), DEPLOY_KNOWN_HOSTS_FILE: join(dir, "kh"),
        DEPLOY_SSH_BIN: makeFakeSsh(dir) };
      if (broken !== "key-absent") { if (broken === "key-directory") mkdirSync(join(dir, "key")); else writeFileSync(join(dir, "key"), "k"); }
      if (broken !== "kh-absent") { if (broken === "kh-directory") mkdirSync(join(dir, "kh")); else writeFileSync(join(dir, "kh"), "h"); }
      const r = spawnSync("bash", [PUSH, a.tar, s, a.hash], { env, encoding: "utf8" });
      expect(r.status, broken).not.toBe(0);
      expect(r.stderr, broken).toContain("not a readable regular file");
      expect(existsSync(join(dir, "ssh.log")), broken).toBe(false); // zero SSH calls
    }
  });

  test("rollback and current work through the forced command against the real host helper", () => {
    const dir = tmp(), f = fakes(dir), s1 = sha(1), s2 = sha(2);
    applyOk(dir, f, s1); prepareExistingState(dir); applyOk(dir, f, s2);
    const env = forcedEnv(dir, f);
    setHealth(f, s1);
    const rb = runForced(env, `rollback ${s1}`);
    expect(rb.status, rb.stderr).toBe(0);
    expect(runForced(env, "current").stdout.trim()).toBe(s1);
  });
});

describe("sqlite backup/restore", () => {
  function setup() {
    const dir = tmp();
    const current = join(dir, "current"); mkdirSync(current);
    writeFileSync(join(current, "package.json"), JSON.stringify({ name: "ai-launchpad" }));
    symlinkSync(join(ROOT, "node_modules"), join(current, "node_modules"), "dir");
    const dbPath = join(dir, "live.db");
    const db = new Database(dbPath); db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE t(x TEXT)"); db.prepare("INSERT INTO t VALUES('one')").run(); db.close();
    return { dir, dbPath, env: { ...process.env, LAUNCHPAD_CURRENT: current, LAUNCHPAD_DB_PATH: dbPath, LAUNCHPAD_BACKUP_DIR: join(dir, "backups") } };
  }

  test("online backup is a consistent, checksummed snapshot; a restored copy holds representative data", () => {
    const { dir, dbPath, env } = setup();
    const r = spawnSync(process.execPath, [BACKUP, "backup"], { env, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const dbs = readdirSync(join(dir, "backups")).filter((x) => x.endsWith(".db"));
    expect(dbs).toHaveLength(1);
    const bak = join(dir, "backups", dbs[0]);
    expect(readFileSync(bak + ".sha256", "utf8")).toContain(hash(readFileSync(bak)));
    const db = new Database(dbPath); db.prepare("INSERT INTO t VALUES('two')").run(); db.close();
    // Isolated restore: copy the snapshot to a fresh location (what an
    // off-host pull + restore drill does) and read the actual persisted row.
    const restored = join(dir, "restored.db"); cpSync(bak, restored);
    const copy = new Database(restored, { readonly: true });
    expect(copy.prepare("SELECT x FROM t").all()).toEqual([{ x: "one" }]); // snapshot, not live state
    copy.close();
    const v = spawnSync(process.execPath, [BACKUP, "verify", bak], { env, encoding: "utf8" });
    expect(v.status, v.stderr).toBe(0);
  });

  test("backup under umask 0077 into a precreated setgid 2750 dir yields 0640 snapshot+sidecar with the dir group, restorable", () => {
    const { dir, env } = setup();
    const bdir = join(dir, "backups"); mkdirSync(bdir, { recursive: true });
    chmodSync(bdir, 0o2750);
    const before = statSync(bdir);
    expect(before.mode & 0o7777).toBe(0o2750);
    // Actual child process with a more restrictive umask than the service's 0027.
    const r = spawnSync("bash", ["-c", `umask 0077; exec "${process.execPath}" "${BACKUP}" backup`], { env, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const bakName = readdirSync(bdir).find((x) => x.endsWith(".db"))!;
    const bak = join(bdir, bakName), side = bak + ".sha256";
    expect(statSync(bak).mode & 0o7777).toBe(0o640);
    expect(statSync(side).mode & 0o7777).toBe(0o640);
    expect(statSync(bak).gid).toBe(before.gid); // setgid inheritance
    expect(statSync(side).gid).toBe(before.gid);
    expect(statSync(bdir).mode & 0o7777).toBe(0o2750); // precreated dir untouched
    expect(statSync(bdir).gid).toBe(before.gid);
    // Checksum + restore evidence against the group-readable snapshot.
    expect(readFileSync(side, "utf8")).toBe(`${hash(readFileSync(bak))}  ${bakName}\n`);
    const restored = join(dir, "restored.db"); cpSync(bak, restored);
    const copy = new Database(restored, { readonly: true });
    expect(copy.prepare("SELECT x FROM t").all()).toEqual([{ x: "one" }]);
    copy.close();
    // A sidecar naming a different file fails strict verification.
    writeFileSync(side, `${hash(readFileSync(bak))}  some-older.db\n`);
    const v = spawnSync(process.execPath, [BACKUP, "verify", bak], { env, encoding: "utf8" });
    expect(v.status).not.toBe(0);
    expect(v.stderr).toContain("names another file");
  });

  test("missing DB fails and a tampered backup fails checksum verification", () => {
    const { dir, env } = setup();
    const missing = spawnSync(process.execPath, [BACKUP, "backup"], { env: { ...env, LAUNCHPAD_DB_PATH: "/nonexistent/x.db" }, encoding: "utf8" });
    expect(missing.status).not.toBe(0);
    expect(spawnSync(process.execPath, [BACKUP, "backup"], { env, encoding: "utf8" }).status).toBe(0);
    const bak = join(dir, "backups", readdirSync(join(dir, "backups")).find((x) => x.endsWith(".db"))!);
    writeFileSync(bak, Buffer.concat([readFileSync(bak), Buffer.from("x")]));
    const v = spawnSync(process.execPath, [BACKUP, "verify", bak], { env, encoding: "utf8" });
    expect(v.status).not.toBe(0);
    expect(v.stderr).toContain("checksum mismatch");
  });
});
