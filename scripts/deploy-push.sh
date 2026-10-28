#!/usr/bin/env bash
# CI-side push over ONE SSH session: the archive travels on stdin of
#   ssh <deploy-user@host> deploy <40-hex-sha> <64-hex-sha256>  < artifact
# and the host's root-owned forced command spools, hash-verifies and applies
# it. There is no file-transfer subsystem anywhere in this design. A second read-only SSH
# call (`current`) verifies what the host reports as live.
#
# Required env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY_FILE,
#               DEPLOY_KNOWN_HOSTS_FILE (pinned host key; never generated
#               by trust-on-first-use in CI)
# Optional env: DEPLOY_SSH_BIN (default ssh; tests inject a fake)
# Usage: deploy-push.sh <artifact.tar.gz> <40-hex-git-sha> <artifact-sha256>
set -euo pipefail
die() { echo "deploy-push: $*" >&2; exit 1; }
tar="${1:-}"; sha="${2:-}"; hash="${3:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "git SHA must be 40 lowercase hex"
[[ "$hash" =~ ^[0-9a-f]{64}$ ]] || die "artifact hash must be 64 lowercase hex"
[[ -f "$tar" ]] || die "artifact not found: $tar"
for v in DEPLOY_HOST DEPLOY_USER DEPLOY_SSH_KEY_FILE DEPLOY_KNOWN_HOSTS_FILE; do
  [[ -n "${!v:-}" ]] || die "$v unset — production environment is not configured; failing closed"
done
# Transport preflight: both supplied credential files must be readable
# regular files BEFORE any SSH invocation.
[[ -f "$DEPLOY_SSH_KEY_FILE" && -r "$DEPLOY_SSH_KEY_FILE" ]] \
  || die "DEPLOY_SSH_KEY_FILE is not a readable regular file: $DEPLOY_SSH_KEY_FILE"
[[ -f "$DEPLOY_KNOWN_HOSTS_FILE" && -r "$DEPLOY_KNOWN_HOSTS_FILE" ]] \
  || die "DEPLOY_KNOWN_HOSTS_FILE is not a readable regular file: $DEPLOY_KNOWN_HOSTS_FILE"
[[ "$(sha256sum "$tar" | cut -d' ' -f1)" == "$hash" ]] || die "local artifact sha256 mismatch"

SSH_BIN="${DEPLOY_SSH_BIN:-ssh}"
# The pinned known_hosts entry is keyed by the fixed authenticated alias
# `launchpad-prod` (never the host address); both SSH calls below use it.
SSH_OPTS=(-i "$DEPLOY_SSH_KEY_FILE" -o IdentitiesOnly=yes -o BatchMode=yes
  -o StrictHostKeyChecking=yes -o HostKeyAlias=launchpad-prod
  -o UserKnownHostsFile="$DEPLOY_KNOWN_HOSTS_FILE"
  -o GlobalKnownHostsFile=/dev/null -o ConnectTimeout=15)
# Fixed remote command shape; the forced-command wrapper re-validates the
# exact grammar host-side. No filename or path is sent to the host.
"$SSH_BIN" "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" deploy "$sha" "$hash" < "$tar"
deployed="$("$SSH_BIN" "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" current)"
[[ "$deployed" == "$sha" ]] || die "host reports current=$deployed, expected $sha"
echo "verified deployed SHA: $deployed"
