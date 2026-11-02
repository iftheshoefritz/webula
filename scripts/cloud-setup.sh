#!/bin/bash
#
# Setup script for Claude Code web (cloud) sessions.
#
# Point the environment's setup script at this file, e.g.:
#   bash scripts/cloud-setup.sh
#
# Runs as root in the sandbox. If your environment runs it unprivileged,
# prefix the find/rm/apt-get lines with sudo.

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

# --- apt: drop PPAs the sandbox proxy 403s on -------------------------------
# The Ubuntu noble base image registers deadsnakes + ondrej/php. Neither is
# used by this project (no Python/PHP deps), and ppa.launchpadcontent.net is
# blocked by the egress proxy, which makes `apt-get update` exit 100 and kill
# the whole setup script.
find /etc/apt/sources.list.d -type f \( -name '*.list' -o -name '*.sources' \) \
  -exec grep -lE 'launchpadcontent\.net|ppa\.launchpad\.net' {} + \
  | xargs -r rm -f

apt-get update

# gh ships preinstalled and pre-authenticated in the sandbox; installing from
# apt would replace the authenticated binary with an unconfigured one.
command -v gh >/dev/null || apt-get install -y gh

# --- project deps -----------------------------------------------------------
# .tool-versions pins nodejs 24.2.0 / yarn 1.22.19
corepack enable 2>/dev/null || true
yarn install --frozen-lockfile

# Browser verification is mandatory for agent PRs (see AGENTS.md).
# Must run after the PPA cleanup — `--with-deps` shells out to apt itself.
npx playwright install --with-deps chromium

# --- egress probe (non-fatal) ----------------------------------------------
# Deck sharing stores each share in Upstash Redis (src/lib/shareStore.ts).
# The route reads its URL from the env vars the Vercel integration sets, and
# the tests mock the store, so nothing here needs to reach Upstash.

# scripts/copy_card_data.sh and scripts/copy_images.sh download the card data
# and images from raw.githubusercontent.com (eberlems/startrek2e).
echo -n "raw.githubusercontent.com reachability: "
curl -sS -o /dev/null -w '%{http_code}\n' --max-time 10 \
  https://raw.githubusercontent.com/eberlems/startrek2e/playable/updatelist.txt \
  || echo "UNREACHABLE — add raw.githubusercontent.com to the environment egress allowlist"
