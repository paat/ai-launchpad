# Deployment: isolated pilot on the existing systemd/Caddy host

Status: **package implemented, not yet provisioned.** Nothing in this repo
claims the production host, DNS, TLS, SSH keys or off-host backup exist yet.
Remote-operation facts still pending are listed at the end. No production
operation is performed by CI until the operator completes the bootstrap and
fills the `production` GitHub environment.

Design in one line: GitHub-hosted CI builds and tests an exact reviewed git
SHA, packages it as one immutable tarball with a hash manifest, and an
operator pinned host-side command verifies, extracts, atomically switches a
symlink, health-checks through loopback, and rolls back on failure.
Production never downloads source, runs npm, or builds.

## Shape

```text
GitHub (public repo)
  CI build job      ubuntu-24.04, Node 22.23.3, NO secrets
  CI deploy job     environment: production (secrets only here)
        | ONE SSH session, archive on stdin, forced command on host
        | (pinned host key via HostKeyAlias=launchpad-prod; strict
        | checking; no file-transfer subsystem anywhere — no SCP, no SFTP)
        v
Host (Ubuntu 24.04, Node 22, systemd, Caddy, no Docker)
  /opt/launchpad/releases/<git-sha>/     immutable, extracted artifacts
  /opt/launchpad/current -> releases/<git-sha>   THE activation pointer
  /opt/launchpad/releases/<git-sha>/release.env  manifest-bound SHA
  /opt/launchpad/incoming/               forced-command spool dir only
  /var/lib/launchpad/launchpad.db        SQLite (WAL); dir 0710
                                           launchpad:launchpad-deploy
  /var/backups/launchpad/                checksummed online snapshots;
                                           dir operator-precreated 2750
                                           launchpad:launchpad-backups
  /var/lib/launchpad-offhost/receipt.json  off-host operator receipt
  /etc/launchpad/launchpad.env           root-installed, mode 0600
  /usr/local/lib/launchpad/              root-owned control scripts
  Caddy: huppelaud.arikratt.ee -> 127.0.0.1:4310 and
         launchpad.arikratt.ee -> 302 huppelaud.arikratt.ee{path}?lang=en via
    import /etc/caddy/launchpad.caddy  (additive vhost only)
```

Artifact contents (`scripts/deploy-package.mjs`): `dist/` (built entrypoint
`dist/server.js`; only generated `.js`/`.js.map` build outputs are
packaged from `dist/` — any other file there, hidden or not, is kept
out), `docs/research/catalog/estonian-business-services.json`
at the path `dist/catalog.js` resolves, production `node_modules/` built on
ubuntu-24.04/Node 22 so the `better-sqlite3` native binary matches the
host ABI, `package.json`/`package-lock.json`, and `RELEASE-MANIFEST.json`
(git SHA + SHA-256 of every file). The packager reads the release
policy only from the requested commit's git object `deploy/release-mode`
(exactly `disabled\n` or `public_cards\n`; missing/invalid fails closed —
no argv/env/dirty-worktree input, so a policy change needs a new commit
and SHA) and writes `release.env` (v2: `LAUNCHPAD_RELEASE_SHA=<sha>\n`
then `MODEL_MODE=<policy>\n`) into the staged release **before** the
manifest inventory, so it is hash-covered. The host verifier accepts
exactly that v2 shape or the legacy v1 one-line SHA shape (planned mode
`disabled`), checks exact bytes against the independently expected SHA,
and never shell-sources the file. No secrets, paths or ledger data are
in the artifact. `node_modules/.bin` is removed during
packaging so the host extractor can reject **all** symlinks.

## First-time bootstrap (operator, root, once)

1. Confirm host facts (see "Pending" below): Node binary path is the
   confirmed production pin `/usr/bin/node` (Node 22.23.3, via
   `command -v node` and readlink as root — re-verify it still resolves
   there before installing any unit), `systemctl` path, free loopback
   port (4310), Caddy config layout, how the colocated service is
   protected from restarts.
2. Create users/dirs: `launchpad` (runtime service user) and
   `launchpad-deploy` (SSH-only, no shell beyond the forced command)
   system users. `launchpad-deploy` owns `/opt/launchpad` (releases,
   `current` symlink, `incoming`, lock). Root owns
   the controllers in `/usr/local/lib/launchpad/`, the systemd units and
   `/etc/launchpad/` config. The runtime `launchpad` user gets read-only
   access to the release tree and writes only `/var/lib/launchpad`
   (owner `launchpad`, group `launchpad-deploy`, mode 0710: the deploy
   user gets directory traversal/stat for database existence only, never
   business-data read; the runtime unit's `UMask=0077` keeps the
   DB/WAL/SHM and new files private). The operator precreates
   `/var/backups/launchpad` as owner `launchpad`, group
   `launchpad-backups`, mode 2750 (setgid), writable only via the backup
   unit (`UMask=0027`; completed snapshots and sidecars are explicitly
   chmod 0640, so the separate backup operator reads them through that
   group — the runtime user's primary group does not change, and the app
   never chowns or alters the precreated directory). `launchpad-deploy`
   is a member of `launchpad-backups` alongside the restricted backup
   reader (setup: `usermod -aG launchpad-backups launchpad-deploy`):
   the deploy backup gate runs as `launchpad-deploy` and must read/hash
   the snapshots and sidecars, otherwise deploys abort. Snapshots
   contain business data. The live DB/WAL/SHM stay private 0600 and the
   0710 directory gives traversal/stat only. The separate
   restricted off-host backup operator owns the write path for
   `/var/lib/launchpad-offhost/receipt.json` once provisioned (below).
3. Install root-owned control scripts (a deployment can never replace
   them): `scripts/deploy-host.sh`, `scripts/deploy-backup.mjs` and
   `deploy/ssh/forced-command.sh` into `/usr/local/lib/launchpad/`, mode
   0755, owner root. No command hooks are configured: there is no
   arbitrary backup/off-host command and no push hook anywhere (paths
   are fixed defaults in the scripts).
4. Install `deploy/ssh/sudoers.example` as `/etc/sudoers.d/launchpad-deploy`
   after confirming the systemctl path (`visudo -c` must pass). It grants
   exactly three fixed commands: `systemctl restart launchpad.service`,
   `systemctl stop launchpad.service` and
   `systemctl start launchpad-backup.service` — no arbitrary sudo or
   shell. `deploy-host.sh` runs unprivileged, so its built-in default is
   itself `sudo -n /usr/bin/systemctl`; the test-only env override is
   never set on the host, and the SSH caller can pass no commands.
5. Install units from `deploy/systemd/` (`launchpad.service`,
   `launchpad-backup.service`, `launchpad-backup.timer`); both units
   already pin `ExecStart` to the confirmed production `/usr/bin/node`
   (Node 22.23.3) — re-verify the path (step 1) before installing,
   without changing it unless the host binary moved.
   `launchpad.service` bounds: MemoryHigh=512M, MemoryMax=1G,
   MemorySwapMax=0, CPUQuota=50%, TasksMax=128, NoNewPrivileges,
   `ProtectSystem=strict`, writable only `/var/lib/launchpad`, journal
   rate limits. Do **not** enable `launchpad.service` until the first
   release is deployed.
6. Install `deploy/launchpad.env.example` as
   `/etc/launchpad/launchpad.env` (0600). Required exact values:
   `NODE_ENV=production`, `PORT=4310`, `LAUNCHPAD_DEMO=0`,
   `LAUNCHPAD_BASE_URL=https://huppelaud.arikratt.ee`,
   `LAUNCHPAD_ALLOWED_HOSTS=huppelaud.arikratt.ee`,
   `MODEL_MODE=disabled`, absolute `LAUNCHPAD_DB_PATH`,
   `LAUNCHPAD_TRUST_LOOPBACK_PROXY=1`. `LAUNCHPAD_RELEASE_SHA` is never
   set here; it comes only from the manifest-bound
   `/opt/launchpad/current/release.env` (the unit's required
   `EnvironmentFile=/opt/launchpad/current/release.env`).
   `LAUNCHPAD_GOOGLE_ALLOWED_SUBJECTS` is required by the production app:
   a comma-separated list of exact opaque Google `sub` values (never
   emails); missing/empty fails startup. The operator supplies values
   only in the private installed env file — the public example carries
   an empty placeholder only. Google's app "Testing" status is not an
   access control; identity-only scopes remain.
   Google keys only when identity sign-in is provisioned (callback must be
   exactly `https://huppelaud.arikratt.ee/auth/callback/google`).
7. DNS: point `huppelaud.arikratt.ee` at the host. Install
   `deploy/caddy/huppelaud.arikratt.ee.caddy` as
   `/etc/caddy/launchpad.caddy` and add exactly one line,
   `import /etc/caddy/launchpad.caddy`, to the main Caddyfile (never
   rewrite the existing Caddy hosts); `caddy validate`, then reload.
   The same file also holds the English alias `launchpad.arikratt.ee`: a
   302 redirect to `https://huppelaud.arikratt.ee{path}?lang=en`, never a
   second origin (the app accepts only `LAUNCHPAD_BASE_URL`, and OAuth and
   the MCP address stay on `huppelaud`). It needs its own DNS record
   pointing at the host, proxied through Cloudflare like `huppelaud`.
   TLS issuance is Caddy's normal ACME once DNS resolves. The origin
   accepts Cloudflare traffic only (operator-owned firewall), and the
   vhost overwrites `X-Forwarded-For` with the Cloudflare
   `CF-Connecting-IP` header (never passing a client-supplied value
   through); the app trusts it only from this loopback proxy under
   `LAUNCHPAD_TRUST_LOOPBACK_PROXY=1`. **First bootstrap stays private:**
   no public Caddy exposure until the off-host copy and an isolated
   actual restore of it have both succeeded (below).
8. SSH: create the dedicated deployment keypair; private half goes only
   into the GitHub `production` environment secret. Public half into the
   deploy user's `authorized_keys` using
   `deploy/ssh/authorized_keys.example` (`restrict` + forced command, no
   PTY/forwarding, no shell, no file-transfer subsystem). The only
   upload path is the archive bytes on stdin of one SSH session
   (`deploy <40-hex-sha> <64-hex-sha256>`); there is no SCP and no SFTP.
9. GitHub `production` environment: main-only deployment branch policy,
   **no required reviewer by default** (the explicit manual dispatch from
   `main` is the gate). Secrets `DEPLOY_HOST`, `DEPLOY_USER`,
   `DEPLOY_SSH_PRIVATE_KEY`, `DEPLOY_KNOWN_HOSTS` (pinned host-key line
   keyed by the fixed `launchpad-prod` host-key alias, obtained
   out-of-band from the operator — never trust-on-first-use in CI, and
   the production host address itself is not in this repo). Regular CI
   and PRs never see these.

## Subsequent deploys (manual promotion)

1. Merge the change to `main` only after review, tribunal and CI
   (`.github/workflows/ci.yml`) are green. Promotion is manual and
   main-only; there is no automatic deploy on push.
2. Actions → “Deploy (manual promotion)” → enter the exact 40-hex SHA.
   Every job is gated on `github.ref == 'refs/heads/main'`.
3. Build job (no secrets): proves the SHA is an ancestor of `origin/main`
   (PR head / arbitrary refs are refused), typechecks, unit tests,
   probes, browser tests, builds, packages, records the artifact SHA-256.
4. Deploy job (production environment): re-verifies the artifact hash,
   then `scripts/deploy-push.sh` opens one SSH session
   (`-o HostKeyAlias=launchpad-prod`, strict host-key checking against
   the pinned key) and streams the archive on stdin of the exact forced
   command `deploy <40-hex-sha> <64-hex-artifact-sha256>`. It then reads
   back `current` over SSH and fails unless it equals the requested SHA.
5. Host forced command: spools stdin into `/opt/launchpad/incoming`
   under fixed bounds (1 byte–256 MiB, 300 s deadline), verifies the
   SHA-256, and always removes the spool. `deploy-host.sh` then:
   `flock` serializes; re-verifies the artifact hash; pre-deploy backup
   gate (below); rejects tar entries that are symlinks/hardlinks/devices
   or escape paths; verifies the manifest (git SHA + every file hash,
   and the manifest must cover the extracted tree exactly — unlisted
   or missing files are refused);
   `node --check` — all verification happens **before** any disruption.
   Then, because the single `current` symlink selects code and the
   manifest-bound `release.env` together: prepares a temp symlink,
   `sudo -n /usr/bin/systemctl stop launchpad.service` (**checked**; on
   failure the deploy aborts with `current` unchanged — brief pilot
   downtime is accepted), atomically renames the temp symlink over
   `current`, restarts via the fixed restart command, and probes
   `GET http://127.0.0.1:4310/health` with
   `Host: huppelaud.arikratt.ee`, parsing the body as JSON and asserting
   exactly `ok:true`, `demo:false`, `model_mode`/`live_inference` equal
   to the target release's verified planned tuple (`disabled`/`disabled`
   or `public_cards`/`enabled` — derived from its manifest-bound
   `release.env`, never inferred from health) and `release_sha` equal to
   the deployed SHA. The incoming archive is always extracted and
   verified even when `releases/<sha>` already exists; a same-SHA
   artifact whose exact `release.env`/planned mode differs from the
   existing release is rejected before any stop and the existing release
   is left unchanged (same-mode reapply is idempotent). If the initial flip fails, the old pointer remains and the
   service is left stopped with an operator-needed report. A failed
   restart **or** health check stops the service (checked) **before**
   flipping back to the previous release, then restarts and verifies
   its exact health; "rolled back" is claimed only after that passes.
   If the rollback stop fails, nothing is flipped; if the restore flip
   fails, the confirmed-stopped service stays stopped — both report an
   unresolved operator-needed state. On first-release failure there is
   nothing to roll back to: after a checked stop, `current` is cleared
   and the empty/stopped state is reported. Failed
   extraction/manifest checks always remove their staging directory.
   Retention is a **total** budget (default 3) that includes the active
   release and the previous known-good release; both are always
   preserved even if the budget is set below 2 (effective minimum 2),
   and remaining slots keep the newest other releases
   (only `releases/<40-lowercase-hex>` directories count). Malformed
   or orphaned deployed state (non-symlink or dangling `current`, any
   stale global `current-release.env` file or link, a database path
   that is a directory, dangling link or present with no deployed
   release) is refused before any service mutation; the only bootstrap
   state is no `current`, no stale global env and no database (a
   prepared empty `releases/` dir is allowed). There is no production
   release on the old contract, so no legacy migration exists.

Verifying what is live: `deploy-host.sh current` on the host, the
workflow log's “verified deployed SHA”, `/opt/launchpad/current/release.env`,
and `curl https://huppelaud.arikratt.ee/health` — the JSON health body
carries `release_sha`, which the deploy health gate already asserts
against the deployed SHA. Health-200 alone is still not integration
proof (real client compatibility is a separate gate).

## Rollback, backup, recovery

- Code rollback: `deploy-host.sh rollback <previous-sha>` (operator on
  host, or the exact SSH forced command `rollback <40-hex-sha>` to an
  already-extracted release). Same manifest + JSON health verification
  against each release's own planned tuple, and a failed rollback
  restart/health check returns to the release that was live before it.
  Rollback is atomic for code **and mode**: the one `current` pointer
  restores the target's `release.env` too (legacy v1 releases inherit
  the private `disabled`; their artifacts are never rewritten).
  **Never touches the database** — schema/data rollback is a separate,
  deliberate restore.
- Release-mode activation order (no step here claims production is
  deployed or activated): root first upgrades the root-owned host
  controller to the v1+v2 verifier; then promote a new commit whose
  committed `deploy/release-mode` is still `disabled` and prove
  rollback to the legacy release; only after the separate private
  validator and product gates pass may a later policy commit select
  `public_cards`. The private `MODEL_MODE=disabled` is never flipped.
- Model spending ledger (if ever provisioned): exactly one existing
  ledger is authoritative and used exclusively; it is never created,
  reset, refreshed or copied by a deploy, and neither release rollback
  nor an app-database restore restores or refunds it. App DB backups
  above are a separate concern. Its canonical path/permissions are
  root-owned decisions, not specified here.
- Backup: the fixed root-installed `launchpad-backup.service` runs
  `deploy-backup.mjs backup` as `launchpad`. It produces an online,
  WAL-consistent, checksummed SQLite snapshot in
  `/var/backups/launchpad/` (better-sqlite3 online backup API; copying a
  live `.db` file is forbidden), verifies `integrity_check` on the
  result, writes a `<file>.sha256` sidecar (mode 0640 like the snapshot
  itself, in the operator-precreated 2750 setgid directory), keeps the
  newest 14. The deploy gate hashes the selected newest regular
  snapshot itself and requires its sidecar to strictly name exactly
  that file. The
  shipped `launchpad-backup.timer` unit runs it daily once the operator
  installs/enables it, and `deploy-host.sh` starts the same fixed
  service immediately before every non-bootstrap deploy. The gate then
  requires the newest snapshot to be fresh (≤ 900 s old) **and** its
  checksum to verify. The only no-backup path is the explicit bootstrap
  (no current release and no database at the fixed path).
- Off-host: **pull only, externally provisioned, still pending.** A
  separate restricted backup-operator account (not `launchpad`, not
  `launchpad-deploy`) pulls snapshots from `/var/backups/launchpad`,
  verifies the checksum at the off-host destination, and only then
  writes `/var/lib/launchpad-offhost/receipt.json` — a path only that
  operator may write. The receipt has exactly three keys:
  `backup_file`, `backup_sha256`, `verified_at_epoch`. Every
  non-bootstrap deploy refuses to proceed unless the receipt is present,
  names a snapshot still on the host with a matching checksum, and is
  at most 24 h old. No push hook exists in this repo. The operator
  account, its credential/keys and its pull scheduler are external
  operator provisioning that is **still pending** — nothing here claims
  they have been created.
- First bootstrap is private: no public Caddy exposure until the
  operator has taken the first backup, pulled a verified off-host copy,
  and completed an isolated actual restore of it (drill below).
- Restore drill (isolated, do regularly):
  `node deploy-backup.mjs verify /var/backups/launchpad/launchpad-<ts>.db`
  opens read-only and checks integrity without touching the live DB.
  Full restore test, in an isolated throwaway directory: use an OLD
  synthetic DB with its own matching leftover WAL/SHM (journal if
  present); stop its writers; quarantine that OLD DB plus sidecars
  together under original basenames; confirm target DB and sidecar paths
  are empty; copy ONLY the verified standalone snapshot to the clean
  target; start a throwaway instance on a spare port and check integrity
  plus known restored state, keeping the old sidecars quarantined. See
  actual restore steps below; never pair a snapshot with unrelated
  sidecars.
- Actual restore (operator procedure; requires explicit owner approval —
  never automated). Hold or exclude deployments during recovery:
  1. Preserve evidence: never delete originals and never restore over
     newly written data.
  2. Record whether the backup timer was active; stop the runtime and the
     backup timer/service; verify all have stopped and that no
     admin/manual SQLite connections or deployment processes can
     write/open the DB.
  3. Quarantine the live set together: move the DB plus whichever of
     `-wal`, `-shm`, `-journal` exist — under their ORIGINAL basenames —
     into one protected quarantine directory (mode 0700), only after all
     writers stopped. Absent sidecars are not fabricated; never mismatch
     or rename the DB independently of its sidecars. Journals must stay
     paired with their database: SQLite documents that pairing a
     database file with an unrelated hot journal corrupts it (see
     [mispairing database files and hot journals](https://sqlite.org/howtocorrupt.html#_mispairing_database_files_and_hot_journals_)).
  4. Ensure the original target DB and sidecar paths are clear, then
     install a COPY of the checksum- plus integrity-verified snapshot at
     the clean target path (runtime ownership, mode 0600; parent
     directory permissions follow the existing layout). Never overwrite
     the quarantine set or the original backup.
  5. As the runtime user, validate the restored database before start
     (`integrity_check` / read-only verify); start the runtime and check
     health/`release_sha` plus meaningful restored state. Return the
     backup timer to its prior active/inactive state only after
     successful validation. On failure, stop writers and preserve the
     failed restore as another set before any retry; never silently
     overwrite new writes.

## Hard rules baked in

- No synthetic demo login in production: `LAUNCHPAD_DEMO=0` *and* the app
  ignores it under `NODE_ENV=production`; the health probe fails the
  deploy if `demo:false` is not reported.
- Private model default: `MODEL_MODE=disabled` in the private env file,
  never flipped globally; a release may override it only through its
  committed, manifest-bound `release.env` policy, and the health probe
  asserts the exact planned tuple.
- No secrets in git, artifacts, or the build job; environment file lives
  outside the repo and outside release dirs.
- Forwarded headers: the origin accepts Cloudflare traffic only, Caddy
  **overwrites** `X-Forwarded-For` with `CF-Connecting-IP` (and strips
  that header), and the app trusts it only from the loopback proxy under
  `LAUNCHPAD_TRUST_LOOPBACK_PROXY=1`. Changing either side alone is
  forbidden; never trust an arbitrary client-supplied `X-Forwarded-For`.
- Caddy site logs no cookies, headers or bodies (access log off, request
  cap 1 MB, streaming flush for MCP/SSE), and no proxy cache is
  configured for this site.

## Pending remote/operator configuration (blocks first real deploy)

- Confirm: loopback port 4310 free; re-verify the confirmed production
  Node pin `/usr/bin/node` (Node 22.23.3, via `command -v node` and
  readlink as root) still resolves there before installing any unit;
  `systemctl` path; host SSH host-key material for `DEPLOY_KNOWN_HOSTS`,
  keyed by the `launchpad-prod` alias.
- Values for `DEPLOY_HOST`/`DEPLOY_USER` (kept out of this repo) and
  deploy keypair creation.
- DNS record + a Caddy reload window that cannot disturb the colocated
  service; confirmation the existing Caddy setup accepts the explicit
  `import /etc/caddy/launchpad.caddy` site file.
- External off-host operator provisioning is pending: the restricted
  pull account, its credential/keys, its pull scheduler, the off-host
  destination, and write ownership of
  `/var/lib/launchpad-offhost/receipt.json`. None of these are claimed
  created; the private first bootstrap (backup → off-host pull +
  receipt → isolated actual restore) must complete before any public
  Caddy exposure.
- GitHub `production` environment with a main-only deployment branch
  policy and **no required reviewer by default**; release branch stays
  `main` (the workflow hard-allows only `main`).
- Issue #7 (OAuth registration capacity) must be resolved before live
  exposure; Google client provisioning is optional and separate.
