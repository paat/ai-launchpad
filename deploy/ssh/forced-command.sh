#!/usr/bin/env bash
# SSH forced command for the dedicated deployment key. Root-installed,
# root-owned at /usr/local/lib/launchpad/forced-command.sh and pinned in the
# deploy user's authorized_keys with `restrict`. There is NO file-transfer subsystem or shell:
# the single upload path is the archive bytes on stdin of one SSH session.
#
# Exact accepted grammar (the whole SSH_ORIGINAL_COMMAND, nothing else):
#   deploy   <40-hex-git-sha> <64-hex-artifact-sha256>   (archive on stdin)
#   rollback <40-hex-git-sha>                            (retained release)
#   current
# Extra tokens, extra lines, paths, filenames from the client, shells and
# file-transfer subsystem requests never reach a shell and are refused.
set -uo pipefail
umask 077

INCOMING="${LAUNCHPAD_INCOMING:-/opt/launchpad/incoming}"
HOST_CMD="${LAUNCHPAD_HOST_CMD:-/usr/local/lib/launchpad/deploy-host.sh}"
# Fixed host-side upload bounds (operator-set at install time, never taken
# from the client): at most 256 MiB, at most 300 s of stdin.
MAX_BYTES="${LAUNCHPAD_MAX_ARTIFACT_BYTES:-268435456}"
DEADLINE_SEC="${LAUNCHPAD_UPLOAD_DEADLINE_SEC:-300}"
[[ "$MAX_BYTES" =~ ^[0-9]+$ && "$DEADLINE_SEC" =~ ^[0-9]+$ ]] || exit 2

cmd="${SSH_ORIGINAL_COMMAND:-}"
# Reject embedded line breaks outright: exactly one line, exact tokens.
case "$cmd" in *$'\n'*|*$'\r'*) echo "refused" >&2; exit 2;; esac

if [[ "$cmd" =~ ^deploy\ ([0-9a-f]{40})\ ([0-9a-f]{64})$ ]]; then
  sha="${BASH_REMATCH[1]}"; want_hash="${BASH_REMATCH[2]}"
  mkdir -p "$INCOMING"
  tmp="$(mktemp "$INCOMING/.upload.XXXXXXXX")" || exit 1
  # The spooled file is removed on every path (success, reject, failure).
  trap 'rm -f "$tmp"' EXIT
  # Bounded, deadline-limited read: at most MAX+1 bytes ever touch disk, so
  # an oversize or never-ending upload cannot fill the filesystem.
  if ! timeout "$DEADLINE_SEC" head -c $((MAX_BYTES + 1)) > "$tmp"; then
    echo "upload: stdin read failed or exceeded ${DEADLINE_SEC}s deadline" >&2; exit 1
  fi
  size="$(stat -c%s "$tmp")"
  if (( size == 0 || size > MAX_BYTES )); then
    echo "upload: artifact size $size outside fixed bounds (1..$MAX_BYTES bytes)" >&2; exit 1
  fi
  got_hash="$(sha256sum "$tmp" | cut -d' ' -f1)"
  if [[ "$got_hash" != "$want_hash" ]]; then
    echo "upload: sha256 mismatch (truncated or wrong artifact)" >&2; exit 1
  fi
  # No client-chosen filename/path is ever passed on: only our own spool
  # file inside the fixed incoming dir, the SHA and the verified hash.
  "$HOST_CMD" apply "$tmp" "$sha" "$want_hash"
  exit $?
elif [[ "$cmd" =~ ^rollback\ ([0-9a-f]{40})$ ]]; then
  exec "$HOST_CMD" rollback "${BASH_REMATCH[1]}"
elif [[ "$cmd" == "current" ]]; then
  exec "$HOST_CMD" current
else
  echo "refused" >&2; exit 2
fi
