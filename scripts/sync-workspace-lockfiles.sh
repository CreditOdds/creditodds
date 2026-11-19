#!/usr/bin/env bash
# Keep the standalone workspace lockfiles in sync with their package.json.
#
# The monorepo installs from the ROOT workspace lockfile, but two workspaces
# also commit their own package-lock.json for their deploys:
#
#   apps/api        SAM build root (template.yml sets no CodeUri, so every
#                   Lambda builds from apps/api)
#   apps/functions  Firebase Functions source (firebase.json)
#
# Dependabot is configured for the root directory only, so when it bumps a
# dependency of either workspace it updates that package.json and the root
# lock but leaves the workspace's own lock behind. #2404 did exactly that to
# both (firebase-admin 14.5.0 -> 14.5.1); the API lock was fixed by hand
# before merge and the functions lock was missed.
#
# npm can't regenerate those locks in place: inside the workspace it resolves
# against the root. So each package.json + lock pair is copied into an empty
# temp dir outside the repo and npm runs there as if it were standalone.
#
# Usage:
#   scripts/sync-workspace-lockfiles.sh           regenerate any lock that drifted
#   scripts/sync-workspace-lockfiles.sh --check   exit 1 if any drifted, change nothing
#
# "Drifted" is decided by `npm ci --dry-run`, the same in-sync test `npm ci`
# applies, not by a byte diff: different npm versions format a lock slightly
# differently, and that alone must not count as drift. An in-sync lock is
# never rewritten.
set -euo pipefail

DIRS=(apps/api apps/functions)

MODE=write
case "${1:-}" in
  "") ;;
  --check) MODE=check ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NPM_FLAGS=(--ignore-scripts --no-audit --no-fund)

# apps/api/package.json pins @firebase/app exactly (0.16.3 needs Node >=24.12;
# Lambdas run nodejs22.x). Make sure a lock really carries the pinned version.
assert_pins() {
  node -e '
    const pkg = require("./package.json");
    const lock = require("./package-lock.json");
    const want = (pkg.dependencies || {})["@firebase/app"];
    if (!want) process.exit(0);
    const got = (lock.packages["node_modules/@firebase/app"] || {}).version;
    if (got !== want) {
      console.error(`  @firebase/app is ${got} in the lock, expected the pinned ${want}.`);
      process.exit(1);
    }
  '
}

# Prints the result for one workspace. Returns 0 if in sync, 1 if it drifted
# (after fixing it in write mode), 2 on a hard error.
sync_dir() {
  local dir="$1" tmp
  # Called from an `||` list, where set -e is off: check each step by hand.
  tmp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/lock-sync.XXXXXX")" || return 2
  cp "$ROOT/$dir/package.json" "$ROOT/$dir/package-lock.json" "$tmp/" || return 2
  (
    cd "$tmp"
    if npm ci --dry-run "${NPM_FLAGS[@]}" >ci.log 2>&1; then
      assert_pins || exit 2
      echo "$dir/package-lock.json: in sync."
      exit 0
    fi

    echo "$dir/package-lock.json: OUT OF SYNC with $dir/package.json"
    grep -E '^npm error (Invalid|Missing)' ci.log | sed 's/^npm error /  /' || cat ci.log
    [ "$MODE" = check ] && exit 1

    npm install --package-lock-only "${NPM_FLAGS[@]}" >install.log 2>&1 || { cat install.log; exit 2; }
    if ! npm ci --dry-run "${NPM_FLAGS[@]}" >ci.log 2>&1; then
      echo "  Regenerated lock still fails npm ci --dry-run:"
      cat ci.log
      exit 2
    fi
    assert_pins || exit 2
    cp package-lock.json "$ROOT/$dir/package-lock.json"
    echo "  Regenerated $dir/package-lock.json."
    exit 1
  )
  local rc=$?
  rm -rf "$tmp"
  return $rc
}

drifted=0
for dir in "${DIRS[@]}"; do
  rc=0
  sync_dir "$dir" || rc=$?
  case $rc in
    0) ;;
    1) drifted=1 ;;
    *) exit 1 ;;
  esac
done

if [ "$drifted" = 1 ] && [ "$MODE" = check ]; then
  echo
  echo "Fix: run scripts/sync-workspace-lockfiles.sh and commit the regenerated lock(s)."
  exit 1
fi
exit 0
