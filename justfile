# Local CI (#115, skill local-ci): four tiers, one recipe each, no GitHub and no AI agent needed.
# GitHub Actions runs nothing: it is reserved for a future `prod.yml` publishing the .deb on a
# signed release tag (agents-skills ADR-0004, local-first CI/CD). Tools come from mise.toml
# (`just setup`); run through `mise x -- just <tier>` when the shell does not activate mise (the
# git hooks do).
#
#   L0 fast     pre-commit hook                        staged files only                       < 10 s
#   L1 check    pre-push hook, review-local --push     lint + test + security + secrets        < 3 min
#   L2 gate     review-local § 2b, on the pushed head  check + Sonar + .deb + E2E smoke,       5–15 min
#               before every merge                     then the attestation
#   L3 nightly  systemd user timer                     check + Trivy fs + TruffleHog + mise outdated
#
# Then: `just merge <pr>` (refuses without the gate attestation on the head SHA). Nothing deploys:
# the product is the .deb the owner builds (`pnpm dist`) and installs; a release is a signed tag
# plus the CHANGELOG notes (skill release-tag).

set shell := ["sh", "-eu", "-c"]

semgrep := "uvx semgrep@1.182.1" # via uv, not mise: a mise pipx install needs a mise-managed Python

# L1 by default
default: check

# Once per clone: the pinned toolchain, the dependencies and the git hooks
setup:
    mise install
    mise x -- pnpm install --frozen-lockfile
    mise x -- lefthook install

# L0 — the pre-commit checks on the staged files (< 10 s)
fast:
    lefthook run pre-commit

# Fail fast outside the .nvmrc Node major: an nvm or system Node in a non-interactive shell would
# run the whole suite on the wrong runtime. Fix: `mise x -- just <recipe>`.
[private]
node-guard:
    @node -e 'const want=require("fs").readFileSync(".nvmrc","utf8").trim().split(".")[0]; const v=process.versions.node; if (v.split(".")[0] !== want) { console.error("Node " + v + " found, Node " + want + " required (.nvmrc). Run: mise x -- just <recipe>"); process.exit(1) }'

# eslint, tsc, typos, the shell scripts, the hooks
lint: node-guard
    pnpm lint
    pnpm typecheck
    typos
    shellcheck --severity=warning scripts/*.sh
    lefthook validate

# Coverage floor of vitest.config.ts (ADR-0007), then the local CI wiring tests.
# Unit suites (main process in Node, renderer in happy-dom) + coverage + wiring tests
test: node-guard
    pnpm test:coverage
    sh scripts/test-local-ci.sh
    sh scripts/test-attest.sh

# SAST (Semgrep Community Edition, named registry rulesets: `--config auto` would send the project
# URL; no p/secrets, which prints the matched value, gitleaks redacts it) on the shipped code, the
# smoke and the scripts, then known vulnerabilities in every dependency, dev ones included, HIGH and
# above (the former dependency-audit workflow).
# EIO_BACKEND=posix: semgrep-core otherwise opens io_uring rings, charged to the user's
# RLIMIT_MEMLOCK together with every Electron/Node process, and dies intermittently.
# SAST (Semgrep CE on src, e2e, scripts) + pnpm audit HIGH and above
security:
    EIO_BACKEND=posix {{semgrep}} scan --config p/javascript --config p/typescript --config p/react --error --metrics=off --quiet -j 4 src e2e scripts
    pnpm audit --audit-level=high

# Secrets in the whole git history (the former gitleaks workflow)
secrets:
    gitleaks git --redact --no-banner .

# L1 — pre-push (< 3 min)
check: lint test security secrets

# L2 — pre-merge, called by review-local § 2b (base: the branch to integrate into), 5–15 min.
# Ends with the gate attestation (agents-skills ADR-0003): commit status `gate` + signed note on
# HEAD, which must already be pushed, so it runs on the pushed head only.
# L2 — pre-merge on the pushed head: check + Sonar + .deb + smoke, then the attestation (5–15 min)
gate base="origin/main":
    #!/bin/sh
    set -eu
    # `check` runs from the body, not as a dependency, so the HEAD it checked is the one attested.
    start=$(git rev-parse HEAD)
    just check
    # The full-history gitleaks scan of `check` already covers base..HEAD.
    base={{quote(base)}}
    case "$base" in origin/*) git fetch --quiet origin "${base#origin/}" ;; esac
    just sonar
    just smoke
    [ "$(git rev-parse HEAD)" = "$start" ] || { echo "gate: HEAD moved during the gate ($start checked), run it again" >&2; exit 1; }
    sh scripts/attest.sh write gate

# SonarQube analysis on the shared self-hosted instance with the machine's global analysis token
# (never a per-project one; skill infra-accounts), waiting for the quality gate. It uploads
# coverage/lcov.info, so it refuses a report older than the sources: `just test` writes it first.
# SonarQube analysis with quality-gate wait (step of gate; global analysis token)
sonar:
    #!/bin/sh
    set -eu
    command -v sonar-scanner > /dev/null || { echo "sonar: sonar-scanner not on PATH (system tool, skill local-ci rule 2)" >&2; exit 1; }
    [ -f coverage/lcov.info ] || { echo "sonar: run just test first (coverage/lcov.info missing)" >&2; exit 1; }
    stale=$(find src -newer coverage/lcov.info -type f -print -quit)
    [ -z "$stale" ] || { echo "sonar: coverage/lcov.info is older than $stale; run just test" >&2; exit 1; }
    SONAR_TOKEN="${SONAR_TOKEN:-$(cat "$HOME/.config/sonarqube/analysis-token" 2>/dev/null || true)}"
    [ -n "$SONAR_TOKEN" ] || { echo "sonar: no token in SONAR_TOKEN or ~/.config/sonarqube/analysis-token" >&2; exit 1; }
    SONAR_TOKEN="$SONAR_TOKEN" sonar-scanner -Dsonar.host.url="${SONAR_HOST_URL:-http://localhost:9000}" -Dsonar.qualitygate.wait=true

# Build the .deb the owner installs (ADR-0006) and run the E2E smoke of the unpacked build over CDP
# (ADR-0010) under Xvfb, forced to X11 so no window reaches the owner's Wayland desktop. The former
# CI `package` job. Docker may be absent, the app copes. Needs xvfb-run (system tool).
# Build the .deb and run the E2E smoke of the unpacked build under Xvfb (step of gate)
smoke: node-guard
    #!/bin/sh
    set -eu
    command -v xvfb-run > /dev/null || { echo "smoke: xvfb-run not on PATH (apt install xvfb)" >&2; exit 1; }
    pnpm dist
    tmp=$(mktemp -d /tmp/dnr-smoke.XXXXXX) # short: a long scratch path breaks Chromium's singleton socket
    trap 'rm -rf "$tmp"' EXIT
    env -u WAYLAND_DISPLAY TMPDIR="$tmp" XDG_SESSION_TYPE=x11 GDK_BACKEND=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 \
      xvfb-run -a pnpm e2e:smoke
    ls dist/*.deb

# Merge a PR only when its exact head SHA carries the gate attestation (agents-skills ADR-0003)
merge pr:
    #!/bin/sh
    set -eu
    sha=$(gh pr view {{quote(pr)}} --json headRefOid -q .headRefOid)
    git fetch --quiet origin "$sha"
    sh scripts/attest.sh verify gate "$sha"
    gh pr merge {{quote(pr)}} --squash --match-head-commit "$sha"

# L3 — nightly, systemd user timer (no time budget): new CVEs against the unchanged lockfile, deep
# secret history, toolchain drift (`--bump`: without it exact pins report nothing).
# L3 — nightly (systemd timer): check + Trivy fs + TruffleHog + mise outdated
nightly: check
    trivy fs --exit-code 1 --severity HIGH,CRITICAL --skip-dirs node_modules,dist,out,coverage .
    trufflehog git "file://$PWD" --no-verification --fail --no-update
    mise outdated --bump
