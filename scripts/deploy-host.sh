#!/usr/bin/env bash
# Host-side deploy helper. Installed ONCE by root, root-owned, at
# /usr/local/lib/launchpad/deploy-host.sh. EXECUTED AS the unprivileged
# launchpad-deploy user (via the SSH forced command, or by the operator
# locally) — never as root, and it never loads/executes release JavaScript
# (node is used only for fixed inline JSON parsing and `node --check`).
# launchpad-deploy owns only /opt/launchpad (incoming, releases, current
# symlink, lock) and cannot edit this script, the
# units, or /etc/launchpad/*. Its only sudo grants are the three fixed
# systemctl commands in deploy/ssh/sudoers.example.
#
# Usage:
#   deploy-host.sh apply    <artifact.tar.gz> <40-hex-git-sha> <artifact-sha256>
#   deploy-host.sh rollback <40-hex-git-sha>     (to an already-extracted release)
#   deploy-host.sh current                      (prints current release SHA)
# No downloads, no npm, no builds, no arbitrary commands from the caller.
# Fails closed on any mismatch.
set -euo pipefail
umask 022

ROOT="${LAUNCHPAD_ROOT:-/opt/launchpad}"
PORT="${LAUNCHPAD_DEPLOY_PORT:-4310}"
HOST_HEADER="${LAUNCHPAD_DEPLOY_HOST:-huppelaud.arikratt.ee}"
# Fixed unit names: these exact strings are what sudoers grants.
SERVICE="launchpad.service"
BACKUP_SERVICE="launchpad-backup.service"
NODE="${LAUNCHPAD_NODE:-node}"
CURL="${LAUNCHPAD_CURL:-curl}"
HEALTH_TRIES="${LAUNCHPAD_HEALTH_TRIES:-15}"
KEEP_RELEASES="${LAUNCHPAD_KEEP_RELEASES:-3}"
# Fixed production locations (env overrides exist for tests only; the SSH
# caller cannot set them — the forced command passes no environment).
DB_PATH="${LAUNCHPAD_DB_PATH:-/var/lib/launchpad/launchpad.db}"
BACKUP_DIR="${LAUNCHPAD_BACKUP_DIR:-/var/backups/launchpad}"
# Off-host receipt: written ONLY by the backup-operator account (not the
# runtime launchpad user, not launchpad-deploy) after it has pulled and
# hash-verified a snapshot off-host. See docs/deployment.md.
OFFHOST_RECEIPT="${LAUNCHPAD_OFFHOST_RECEIPT:-/var/lib/launchpad-offhost/receipt.json}"
BACKUP_MAX_AGE_SEC="${LAUNCHPAD_BACKUP_MAX_AGE_SEC:-900}"     # fresh local backup
RECEIPT_MAX_AGE_SEC="${LAUNCHPAD_RECEIPT_MAX_AGE_SEC:-86400}" # 24h, per contract
# This script runs unprivileged; the commands below only work through the
# narrow sudoers grant for exactly these fixed invocations. The default
# must itself be the sudo form (a bare `systemctl` fails unprivileged);
# LAUNCHPAD_SYSTEMCTL is a test-only override, never SSH-caller input.
read -r -a SYSTEMCTL <<< "${LAUNCHPAD_SYSTEMCTL:-sudo -n /usr/bin/systemctl}"
RELEASES="$ROOT/releases"; CURRENT="$ROOT/current"; STALE_GLOBAL_ENV="$ROOT/current-release.env"
die() { echo "deploy-host: $*" >&2; exit 1; }
# Temporary extraction staging is cleaned on EVERY exit path (invalid
# archive, manifest/check failure, success after the atomic rename).
STAGE_TMP=""
cleanup_stage() { if [[ -n "${STAGE_TMP:-}" && -d "$STAGE_TMP" ]]; then rm -rf "$STAGE_TMP"; fi; }
trap cleanup_stage EXIT

valid_sha() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

check_node() {
  local v; v="$("$NODE" --version 2>/dev/null || true)"
  [[ "$v" =~ ^v22\. ]] || die "Node 22 required on host, got '${v:-not found}' ($NODE)"
}

health_ok() { # <expected-release-sha>
  # /health sits behind the app's canonical-Host middleware, so the probe
  # must carry the canonical Host over loopback. The body is parsed as JSON
  # and every field asserted exactly — including release_sha, so a still-
  # running OLD process can never pass for the new release.
  local want="$1" body i
  for ((i=1; i<=HEALTH_TRIES; i++)); do
    body="$("$CURL" -fsS --max-time 3 -H "Host: $HOST_HEADER" "http://127.0.0.1:$PORT/health" 2>/dev/null || true)"
    if [[ -n "$body" ]] && printf '%s' "$body" | "$NODE" -e '
      let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
        try {
          const j=JSON.parse(d), want=process.argv[1];
          if (typeof j.release_sha!=="string" || !/^[0-9a-f]{40}$/.test(j.release_sha)) process.exit(1);
          process.exit(j.ok===true && j.demo===false && j.model_mode==="disabled"
            && j.live_inference==="disabled" && j.release_sha===want ? 0 : 1);
        } catch { process.exit(1); }
      });' "$want"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

current_sha() {
  if [[ -L "$CURRENT" ]]; then
    local t; t="$(readlink "$CURRENT")"
    if [[ "$t" =~ ^releases/([0-9a-f]{40})$ ]]; then echo "${BASH_REMATCH[1]}"; else echo ""; fi
  else echo ""; fi
}

# Single activation pointer: the `current` symlink selects code AND the
# manifest-bound releases/<sha>/release.env identity together (the unit
# reads /opt/launchpad/current/release.env). There is no second pointer.
ACT_STATE=""
prepare_link() { # <sha> <link-tmp>
  [[ ! -d "$2" ]] || return 1
  rm -f "$2" || return 1
  ln -s "releases/$1" "$2"
}
stop_service() { "${SYSTEMCTL[@]}" stop "$SERVICE"; }

# Verify already happened before this is called. Prepare the temp link,
# stop (checked) BEFORE the flip so no automatic restart can read across
# activation, flip atomically, restart and verify exact health. On
# restart/health failure: stop (checked) before flipping back, then
# restart+verify the old release. ACT_STATE records the honest outcome;
# "rolled_back_verified" is set only after old health passes.
activate_and_verify() { # <new-sha> <previous-sha-or-empty>
  local new="$1" prev="${2:-}" lt="$ROOT/.current.tmp"
  ACT_STATE=""
  prepare_link "$new" "$lt" || { ACT_STATE="prepare_failed_current_unchanged"; echo "deploy-host: activation prepare failed for $new; current left untouched, service not stopped" >&2; return 1; }
  if ! stop_service; then
    rm -f "$lt"; ACT_STATE="stop_failed_current_unchanged"
    echo "deploy-host: systemctl stop failed before activation of $new; aborting with current unchanged (service NOT confirmed stopped)" >&2; return 1
  fi
  if ! mv -Tf "$lt" "$CURRENT"; then
    rm -f "$lt"; ACT_STATE="flip_failed_stopped_operator_needed"
    echo "deploy-host: current flip failed for $new; previous pointer remains, service left stopped; operator needed" >&2; return 1
  fi
  if ! "${SYSTEMCTL[@]}" restart "$SERVICE"; then echo "deploy-host: systemctl restart failed for $new" >&2
  elif health_ok "$new"; then ACT_STATE="deployed_verified"; return 0
  else echo "deploy-host: health check failed for $new" >&2; fi
  # Rollback path (or first-deploy cleanup): checked stop first.
  if ! stop_service; then
    ACT_STATE="rollback_stop_failed_operator_needed"
    echo "deploy-host: rollback stop failed; NOT flipping current (still $new); unresolved state, operator needed" >&2; return 1
  fi
  if [[ -z "$prev" ]]; then
    if rm -f "$CURRENT"; then ACT_STATE="first_deploy_cleared_stopped"; echo "deploy-host: first deploy failed; current cleared and service confirmed stopped" >&2
    else ACT_STATE="first_deploy_clear_failed_stopped_operator_needed"; echo "deploy-host: first deploy failed and clearing current failed; service stopped; operator needed" >&2; fi
    return 1
  fi
  if ! prepare_link "$prev" "$lt" || ! mv -Tf "$lt" "$CURRENT"; then
    rm -f "$lt"; ACT_STATE="rollback_flip_failed_stopped_operator_needed"
    echo "deploy-host: restoring previous current failed; service left stopped (not restarting wrong release); operator needed" >&2; return 1
  fi
  if ! "${SYSTEMCTL[@]}" restart "$SERVICE"; then
    ACT_STATE="rollback_restart_failed_operator_needed"
    echo "deploy-host: previous release $prev restart failed after flip back; operator needed" >&2; return 1
  fi
  if ! health_ok "$prev"; then
    ACT_STATE="rollback_health_failed_operator_needed"
    echo "deploy-host: previous release $prev health check failed after flip back; operator needed" >&2; return 1
  fi
  ACT_STATE="rolled_back_verified"
  echo "deploy-host: rolled back to $prev and verified exact health (database untouched)" >&2
  return 1
}

prune_releases() { # <current-sha> <previous-good-sha-or-empty>
  # Total budget: KEEP_RELEASES (default 3) INCLUDES the active current
  # and the previous known-good release. Both protected releases are
  # always preserved even if the budget is set below 2 (effective
  # minimum 2 when both exist); remaining slots keep the newest other
  # real 40-hex dirs. Staging dirs are removed and never counted.
  local cur="$1" prevgood="${2:-}" d name count=0 budget protected=0 remaining
  budget="$KEEP_RELEASES"; [[ "$budget" =~ ^[0-9]+$ ]] || budget=3
  [[ -d "$RELEASES/$cur" ]] && protected=$((protected+1))
  [[ -n "$prevgood" && "$prevgood" != "$cur" && -d "$RELEASES/$prevgood" ]] && protected=$((protected+1))
  remaining=$((budget - protected)); (( remaining < 0 )) && remaining=0
  find "$RELEASES" -mindepth 1 -maxdepth 1 -name '.tmp-*' -exec rm -rf {} + 2>/dev/null || true
  while IFS= read -r d; do
    name="$(basename "$d")"
    valid_sha "$name" || continue
    [[ "$name" == "$cur" || "$name" == "$prevgood" ]] && continue
    count=$((count+1))
    if (( count > remaining )); then rm -rf "$d"; fi
  done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)
}

# Fail-closed deployed-state validation. Runs before any service
# mutation. Sets STATE_PREV to the validated current SHA ("" only for a
# true first state: no current, no stale global env and — for apply —
# no DB; a prepared empty releases dir is allowed). The old global
# current-release.env contract never shipped: any such file/link,
# including dangling, is stale state and refused. Identity now lives
# only in releases/<sha>/release.env, checked by verify_manifest.
STATE_PREV=""
validate_state() { # <apply|rollback>
  local mode="$1" has_cur=0 has_db=0 cur_sha=""
  if [[ -e "$STALE_GLOBAL_ENV" || -L "$STALE_GLOBAL_ENV" ]]; then
    die "stale deployed state: $STALE_GLOBAL_ENV exists (old global release env is not supported); refusing"
  fi
  [[ -e "$CURRENT" || -L "$CURRENT" ]] && has_cur=1
  if (( has_cur )); then
    [[ -L "$CURRENT" ]] || die "malformed deployed state: $CURRENT is not a symlink; refusing"
    local target; target="$(readlink "$CURRENT")"
    [[ "$target" =~ ^releases/([0-9a-f]{40})$ ]] || die "malformed deployed state: current points at '$target', not releases/<40-hex>; refusing"
    cur_sha="${BASH_REMATCH[1]}"
    [[ -d "$RELEASES/$cur_sha" && ! -L "$RELEASES/$cur_sha" ]] || die "malformed deployed state: current is a dangling link to missing release $cur_sha; refusing"
  fi
  if [[ "$mode" == "apply" ]]; then
    if [[ -e "$DB_PATH" || -L "$DB_PATH" ]]; then
      [[ -f "$DB_PATH" && ! -L "$DB_PATH" ]] || die "malformed deployed state: database path $DB_PATH is not a regular file; refusing"
      has_db=1
    fi
    if (( ! has_cur && has_db )); then
      die "orphan deployed state: database exists at $DB_PATH but no release is deployed; refusing (not a bootstrap)"
    fi
    if (( has_cur && ! has_db )); then
      die "current release exists but database missing at fixed path $DB_PATH; refusing to deploy"
    fi
  fi
  STATE_PREV="$cur_sha"
  # The release current points at must itself verify against its SHA.
  if (( has_cur )); then verify_manifest "$RELEASES/$cur_sha" "$cur_sha"; fi
}

verify_manifest() { # <release-dir> <expected-sha>
  # Fixed inline node program: it READS release files as data and hashes
  # them; it does not require()/execute any release code.
  "$NODE" -e '
    const fs=require("fs"),crypto=require("crypto"),path=require("path");
    const [dir,sha]=process.argv.slice(1);
    const m=JSON.parse(fs.readFileSync(path.join(dir,"RELEASE-MANIFEST.json"),"utf8"));
    if(m.git_sha!==sha){console.error("manifest git_sha mismatch");process.exit(1)}
    if(!m.files||typeof m.files!=="object"||Array.isArray(m.files)){console.error("manifest files not an object");process.exit(1)}
    for(const req of ["dist/server.js","docs/research/catalog/estonian-business-services.json","package.json","node_modules/better-sqlite3/package.json","release.env"])
      if(!(req in m.files)){console.error("manifest missing "+req);process.exit(1)}
    // Manifest-bound identity: exact bytes only, checked against the
    // independently expected SHA — re-hashing a wrong file cannot pass.
    const rp=path.join(dir,"release.env");
    if(!fs.existsSync(rp)||fs.lstatSync(rp).isSymbolicLink()||!fs.lstatSync(rp).isFile()){console.error("release.env missing/symlink/non-file");process.exit(1)}
    if(fs.readFileSync(rp,"utf8")!=="LAUNCHPAD_RELEASE_SHA="+sha+"\n"){console.error("release.env content mismatch");process.exit(1)}
    for(const [f,hash] of Object.entries(m.files)){
      if(f.startsWith("/")||f.split("/").includes("..")||f.split("/").includes("")){console.error("bad manifest path "+f);process.exit(1)}
      if(!/^[0-9a-f]{64}$/.test(hash)){console.error("bad manifest hash "+f);process.exit(1)}
      const p=path.join(dir,f);
      if(!fs.existsSync(p)||fs.lstatSync(p).isSymbolicLink()||!fs.lstatSync(p).isFile()){console.error("missing/symlink/non-file "+f);process.exit(1)}
      const h=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      if(h!==hash){console.error("hash mismatch "+f);process.exit(1)}
    }
    // Complete coverage: recursively inventory every regular extracted
    // file and require exact manifest coverage (excluding the manifest
    // itself). Unlisted files and non-regular entries are refused.
    const actual=[];
    (function walk(d,pre){
      for(const name of fs.readdirSync(d)){
        const p=path.join(d,name), rel=pre?pre+"/"+name:name, st=fs.lstatSync(p);
        if(st.isSymbolicLink()){console.error("symlink in tree "+rel);process.exit(1)}
        if(st.isDirectory())walk(p,rel);
        else if(st.isFile()){if(rel!=="RELEASE-MANIFEST.json")actual.push(rel)}
        else{console.error("non-regular file in tree "+rel);process.exit(1)}
      }
    })(dir,"");
    const listed=new Set(Object.keys(m.files));
    for(const f of actual)if(!listed.has(f)){console.error("unlisted file in tree "+f);process.exit(1)}
    if(actual.length!==listed.size){console.error("manifest/tree file count mismatch");process.exit(1)}' "$1" "$2" || die "release manifest verification failed"
}

safe_extract() { # <tar> <dest>
  local tar="$1" dest="$2" listing
  listing="$(tar -tvzf "$tar")" || die "cannot list artifact"
  # Reject symlinks (l), hardlinks (h), devices/fifos (c,b,p) by type char,
  # and absolute / parent-escaping paths. Allowed: - (file), d (dir).
  while IFS= read -r line; do
    case "${line:0:1}" in -|d) ;; *) die "forbidden tar entry type: $line";; esac
  done <<< "$listing"
  tar -tzf "$tar" | while IFS= read -r p; do
    case "$p" in /*|../*|*/../*|*/..|..) die "forbidden tar path: $p";; esac
  done
  mkdir -p "$dest"
  tar -xzf "$tar" -C "$dest" --no-same-owner
  [[ -z "$(find "$dest" -type l -print -quit)" ]] || die "symlink present after extract"
}

verify_offhost_receipt() {
  [[ -f "$OFFHOST_RECEIPT" ]] || die "off-host receipt absent ($OFFHOST_RECEIPT); refusing to deploy without a verified off-host backup"
  local parsed rfile rhash repoch
  parsed="$("$NODE" -e '
    const fs=require("fs");
    const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    const keys=Object.keys(j).sort().join(",");
    if(keys!=="backup_file,backup_sha256,verified_at_epoch")process.exit(1);
    if(!/^launchpad-[A-Za-z0-9._-]+\.db$/.test(j.backup_file))process.exit(1);
    if(!/^[0-9a-f]{64}$/.test(j.backup_sha256))process.exit(1);
    if(!Number.isInteger(j.verified_at_epoch))process.exit(1);
    console.log(j.backup_file+" "+j.backup_sha256+" "+j.verified_at_epoch);' "$OFFHOST_RECEIPT")" \
    || die "off-host receipt is malformed; refusing to deploy"
  read -r rfile rhash repoch <<< "$parsed"
  [[ -f "$BACKUP_DIR/$rfile" ]] || die "off-host receipt names a backup not present locally ($rfile); refusing to deploy"
  [[ "$(sha256sum "$BACKUP_DIR/$rfile" | cut -d' ' -f1)" == "$rhash" ]] \
    || die "off-host receipt checksum does not match $rfile; refusing to deploy"
  local now age; now="$(date +%s)"; age=$((now - repoch))
  (( age >= -300 && age <= RECEIPT_MAX_AGE_SEC )) \
    || die "off-host receipt is stale (age ${age}s > ${RECEIPT_MAX_AGE_SEC}s); refusing to deploy"
}

backup_gate() { # <previous-sha-or-empty> (state already validated)
  local prev="${1:-}"
  if [[ -z "$prev" ]]; then
    # Explicit bootstrap: validate_state proved current, stale global
    # env AND database are all absent (no dangling links, no malformed
    # types). This is the ONLY no-backup path. The operator still owes
    # the backup -> off-host copy -> isolated-restore drill before any
    # public Caddy exposure (docs/deployment.md).
    echo "deploy-host: BOOTSTRAP first deploy (no current release, no database at $DB_PATH); backup gate not applicable" >&2
    return 0
  fi
  [[ -f "$DB_PATH" ]] || die "current release exists but database missing at fixed path $DB_PATH; refusing to deploy"
  # Pre-deploy backup runs ONLY the fixed root-installed backup service
  # (oneshot; `systemctl start` waits for it). No command comes from SSH.
  "${SYSTEMCTL[@]}" start "$BACKUP_SERVICE" || die "pre-deploy backup service ($BACKUP_SERVICE) failed; refusing to deploy"
  # Situated freshness: newest regular snapshot is fresh AND the digest
  # of THAT selected file matches its own strictly-bound sidecar. The
  # sidecar is parsed here and must name exactly the selected file —
  # never `sha256sum -c` on sidecar-chosen paths.
  local newest base mtime now age
  newest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'launchpad-*.db' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2- || true)"
  [[ -n "$newest" && -f "$newest" && ! -L "$newest" ]] || die "backup service reported success but no snapshot exists in $BACKUP_DIR; refusing to deploy"
  base="$(basename "$newest")"
  [[ -f "$BACKUP_DIR/$base.sha256" && ! -L "$BACKUP_DIR/$base.sha256" ]] || die "fresh backup $base has no checksum sidecar; refusing to deploy"
  local side_content side_hash side_name side_extra actual
  side_content="$(cat "$BACKUP_DIR/$base.sha256")"
  [[ "$side_content" != *$'\n'* ]] || die "fresh backup $base checksum sidecar is malformed; refusing to deploy"
  read -r side_hash side_name side_extra <<< "$side_content"
  [[ "$side_hash" =~ ^[0-9a-f]{64}$ && "$side_name" == "$base" && -z "${side_extra:-}" ]] \
    || die "fresh backup $base checksum sidecar does not strictly name the selected snapshot; refusing to deploy"
  actual="$(sha256sum "$newest" | cut -d' ' -f1)"
  [[ "$actual" == "$side_hash" ]] || die "fresh backup $base checksum verification failed; refusing to deploy"
  mtime="$(stat -c%Y "$newest")"; now="$(date +%s)"; age=$((now - mtime))
  (( age >= -300 && age <= BACKUP_MAX_AGE_SEC )) || die "newest backup $base is not fresh (age ${age}s > ${BACKUP_MAX_AGE_SEC}s); refusing to deploy"
  verify_offhost_receipt
}

cmd_apply() {
  local tar="$1" sha="$2" want_hash="$3"
  valid_sha "$sha" || die "git SHA must be 40 lowercase hex"
  [[ "$want_hash" =~ ^[0-9a-f]{64}$ ]] || die "artifact hash must be 64 lowercase hex"
  [[ -f "$tar" ]] || die "artifact not found: $tar"
  check_node
  mkdir -p "$RELEASES"
  exec 9>"$ROOT/.deploy.lock"; flock -n 9 || die "another deployment is in progress"
  local got_hash; got_hash="$(sha256sum "$tar" | cut -d' ' -f1)"
  [[ "$got_hash" == "$want_hash" ]] || die "artifact sha256 mismatch"
  validate_state apply
  local prev="$STATE_PREV"
  backup_gate "$prev"
  local dest="$RELEASES/$sha"
  if [[ -d "$dest" ]]; then
    [[ ! -L "$dest" ]] || die "release $sha is a symlink; refusing"
    verify_manifest "$dest" "$sha"   # idempotent re-deploy of same SHA
  else
    local tmp="$RELEASES/.tmp-$sha-$$"
    STAGE_TMP="$tmp"
    rm -rf "$tmp"; safe_extract "$tar" "$tmp"
    verify_manifest "$tmp" "$sha"
    "$NODE" --check "$tmp/dist/server.js" >/dev/null || die "dist/server.js fails node --check"
    mv "$tmp" "$dest"
    STAGE_TMP=""
  fi
  if activate_and_verify "$sha" "$prev"; then
    echo "deployed $sha (previous: ${prev:-none})"
    prune_releases "$sha" "$prev"
  elif [[ "$ACT_STATE" == "rolled_back_verified" ]]; then
    die "deployment of $sha failed; rolled back to $prev (verified)"
  else
    die "deployment of $sha failed; state=$ACT_STATE (see above; not claiming rollback or availability)"
  fi
}

cmd_rollback() {
  local sha="$1"; valid_sha "$sha" || die "git SHA must be 40 lowercase hex"
  check_node
  mkdir -p "$RELEASES"
  exec 9>"$ROOT/.deploy.lock"; flock -n 9 || die "another deployment is in progress"
  [[ -d "$RELEASES/$sha" && ! -L "$RELEASES/$sha" ]] || die "release $sha not present on host"
  verify_manifest "$RELEASES/$sha" "$sha"
  validate_state rollback
  local prev="$STATE_PREV"
  # Rollback never touches the database; DB restore is a separate operator act.
  if activate_and_verify "$sha" "$prev"; then
    echo "rolled back to $sha (database untouched)"
  elif [[ "$ACT_STATE" == "rolled_back_verified" ]]; then
    die "rollback to $sha failed; returned to $prev (verified, database untouched)"
  else
    die "rollback to $sha failed; state=$ACT_STATE (see above; not claiming rollback or availability)"
  fi
}

case "${1:-}" in
  apply)    [[ $# -eq 4 ]] || die "usage: apply <tar> <sha> <artifact-sha256>"; cmd_apply "$2" "$3" "$4";;
  rollback) [[ $# -eq 2 ]] || die "usage: rollback <sha>"; cmd_rollback "$2";;
  current)  current_sha;;
  *) echo "usage: deploy-host.sh apply|rollback|current" >&2; exit 2;;
esac
