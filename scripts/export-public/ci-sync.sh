#!/usr/bin/env bash
# The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
# Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
# Commercial use requires a separate agreement: mer.sergei@gmail.com

# Runs `export.mjs sync` from CI (TechDocs/POS_OPENCORE.md §11). The mirror is
# written with a deploy key that can push to that one repository and nothing
# else: PUBLIC_EXPORT_KEY is its private half, kept as an Actions secret of the
# SOURCE repository. A push made with a deploy key starts the mirror's own
# workflows (its CI, and the installers' build on a `pos-v*` tag) — a push made
# with GITHUB_TOKEN would not.
#
# The host key is pinned rather than trusted on first use: the value below is
# GitHub's published ed25519 key (docs.github.com → "GitHub's SSH key
# fingerprints"), checked against `ssh-keyscan github.com` on 2026-11-10. If
# GitHub rotates it the export stops with a host-key error — update it here.

set -euo pipefail

: "${PUBLIC_EXPORT_KEY:?PUBLIC_EXPORT_KEY is not set — the deploy key of the public mirror (Actions secret of the source repository)}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

printf '%s\n' "$PUBLIC_EXPORT_KEY" > "$work/key"
chmod 600 "$work/key"
printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$work/known_hosts"

export GIT_SSH_COMMAND="ssh -i $work/key -o IdentitiesOnly=yes -o UserKnownHostsFile=$work/known_hosts -o StrictHostKeyChecking=yes"

node "$(dirname "$0")/export.mjs" sync "$@"
