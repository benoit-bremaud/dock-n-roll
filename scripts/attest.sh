#!/bin/sh
# Attestations of the local CI on a commit (ADR-0003, ADR-0004; skill local-ci § Attestation).
#
#   attest.sh write gate                 HEAD: signed note on refs/notes/gate, pushed, then commit
#                                        status `gate` = success (REST Statuses API)
#   attest.sh write deploy/staging       HEAD: signed note on refs/notes/deploy, pushed (only after
#                                        the staging QA pass succeeds: `just attest staging`)
#   attest.sh verify gate <commit>       status `gate` success AND a valid signed note
#   attest.sh verify deploy/staging <c>  a valid signed note
#   attest.sh release <tag>              classify (stable only), verify-tag, peel, verify both
#                                        attestations on the commit; prints the commit
#
# A note holds "<kind> <owner/repo> <commit>" and its SSH signature (namespace local-ci), so it
# cannot be moved to another commit or repository. `write` refuses a dirty tree or an unpushed
# HEAD. Signing: gpg.format ssh, user.signingkey a public key file whose private key is in
# ssh-agent (or the private key file itself). Trust store: .github/allowed_signers read from
# origin/main, never from the checkout, so a branch cannot trust its own key; the same file
# verifies release tags. Notes are fetched before use (an absent remote ref means nothing was
# attested yet) and pushed fast-forward. Needs git, ssh-keygen, gh.
set -eu

die() { echo "attest: $*" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

noteref() { case "$1" in gate) echo refs/notes/gate ;; deploy/staging) echo refs/notes/deploy ;; *) die "unknown kind '$1' (gate, deploy/staging)" ;; esac; }
repo() { gh repo view --json nameWithOwner -q .nameWithOwner || die "could not resolve the GitHub repository"; }
fetch_notes() { # exit 2 of ls-remote is "no such ref"; anything else is an error, never "absent"
  rc=0; git ls-remote --exit-code origin "$1" > /dev/null 2>&1 || rc=$?
  case $rc in
    0) git fetch --quiet origin "+$1:$1" ;;
    2) ;;
    *) die "could not read $1 on origin (exit $rc)" ;;
  esac
}
signers() { # the trust store of origin/main
  git fetch --quiet origin main
  git show origin/main:.github/allowed_signers > "$tmp/signers" 2>/dev/null \
    || die "no .github/allowed_signers on origin/main"
}

write() { # write <kind>
  ref=$(noteref "$1")
  sha=$(git rev-parse HEAD)
  [ -z "$(git status --porcelain)" ] || die "the working tree has uncommitted changes: commit them, then run the gate again"
  git fetch --quiet origin
  [ -n "$(git branch -r --contains "$sha")" ] || die "$sha is not pushed: push it, then run the gate again"
  key=$(git config user.signingkey) || die "no user.signingkey: configure SSH signing (skill local-ci § Attestation)"
  [ "$(git config gpg.format)" = ssh ] || die "gpg.format is not ssh: only SSH signing is supported (#213)"
  r=$(repo)
  printf '%s %s %s\n' "$1" "$r" "$sha" > "$tmp/payload"
  ssh-keygen -q -Y sign -n local-ci -f "$key" "$tmp/payload" > /dev/null 2>&1 \
    || die "ssh-keygen could not sign with $key (is its private key in ssh-agent?)"
  fetch_notes "$ref"
  cat "$tmp/payload" "$tmp/payload.sig" | git notes --ref "$ref" add -f -F - "$sha" 2> /dev/null
  git push --quiet origin "$ref" || die "could not push $ref fast-forward: run the command again"
  if [ "$1" = gate ]; then # last, so a green status always has its note
    gh api --silent -X POST "repos/$r/statuses/$sha" -f state=success -f context=gate \
      -f description="just gate passed" || die "could not write the commit status of $sha"
  fi
  echo "attest: $1 recorded on $sha"
}

verify() { # verify <kind> <commit>
  ref=$(noteref "$1")
  sha=$(git rev-parse --verify --quiet "$2^{commit}") || die "unknown commit $2"
  r=$(repo)
  signers
  if [ "$1" = gate ]; then
    state=$(gh api "repos/$r/commits/$sha/status" \
      -q '[.statuses[] | select(.context == "gate")][0].state // "missing"') || die "could not read the commit status of $sha"
    [ "$state" = success ] || die "status gate is $state on $sha: run just gate on it"
  fi
  fetch_notes "$ref"
  git notes --ref "$ref" show "$sha" > "$tmp/note" 2>/dev/null || die "no $1 note on $sha"
  printf '%s %s %s\n' "$1" "$r" "$sha" > "$tmp/payload"
  head -n 1 "$tmp/note" | cmp -s - "$tmp/payload" || die "the $1 note on $sha names another commit or repository"
  sed 1d "$tmp/note" > "$tmp/sig"
  who=$(ssh-keygen -Y find-principals -s "$tmp/sig" -f "$tmp/signers" 2>/dev/null) && [ -n "$who" ] \
    || die "the $1 note on $sha is not signed by a key of the trust store"
  who=$(printf '%s\n' "$who" | head -n 1)
  ssh-keygen -q -Y verify -f "$tmp/signers" -I "$who" -n local-ci -s "$tmp/sig" < "$tmp/payload" > /dev/null 2>&1 \
    || die "bad signature on the $1 note of $sha"
  echo "attest: $1 verified on $sha ($who)"
}

release() { # release <tag>: the checks 1–4 of ADR-0004 before a production deploy
  semver='(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)'
  echo "$1" | grep -Eq "^(.+-)?v$semver\$" || die "$1 is not a stable release tag: only vX.Y.Z reaches production"
  signers
  git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$tmp/signers" verify-tag "$1" > /dev/null 2>&1 \
    || die "tag $1 is not signed by a key of the trust store"
  sha=$(git rev-parse "$1^{commit}")
  verify gate "$sha" >&2
  verify deploy/staging "$sha" >&2
  echo "$sha"
}

case "${1:-}" in
  write) [ $# -eq 2 ] || die "usage: attest.sh write <kind>"; write "$2" ;;
  verify) [ $# -eq 3 ] || die "usage: attest.sh verify <kind> <commit>"; verify "$2" "$3" ;;
  release) [ $# -eq 2 ] || die "usage: attest.sh release <tag>"; release "$2" ;;
  *) die "usage: attest.sh write <kind> | verify <kind> <commit> | release <tag>" ;;
esac
