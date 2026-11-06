#!/bin/bash
# LiveShop POS — macOS installer for the unsigned desktop cashier build.
#
#   curl -fsSL https://raw.githubusercontent.com/merenkoff/tiktok-live/main/pos/scripts/install-macos.sh | bash
#
# The build is not code-signed or notarized yet, so a browser download would be
# quarantined and refused by Gatekeeper. curl does not set com.apple.quarantine,
# so fetching the bundle here sidesteps that entirely — no xattr surgery, no
# "Open Anyway" trip through System Settings. Only the first install needs this:
# afterwards the app updates itself from "Обладнання" (it downloads the same way,
# so Gatekeeper never sees a quarantined file). Pass a tag to pin a version:
#
#   ... | bash -s -- pos-v1.0.8
set -euo pipefail

REPO="merenkoff/tiktok-live"
# The bundle's name since 2.8.0; up to 2.7.x it was Cloth.POS_universal.app.tar.gz
# (pass such a tag and this script fails to download — install a current one).
ASSET="LiveShop.POS_universal.app.tar.gz"
# The till's name up to 2.7.x: quit and removed too, so one install replaces it.
LEGACY_NAME="Cloth POS.app"
DEST="${DEST:-/Applications}"

say()  { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Скрипт только для macOS."

tag="${1:-}"
if [ -z "${tag}" ]; then
  say "Ищу последний релиз кассы…"
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=30" \
         | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"pos-v[^"]*"' \
         | head -1 | sed 's/.*"\(pos-v[^"]*\)"$/\1/')"
  [ -n "${tag}" ] || fail "Не нашёл ни одного релиза pos-v* — проверь сеть."
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

say "Скачиваю ${tag}…"
curl -fL --progress-bar -o "${tmp}/app.tar.gz" \
  "https://github.com/${REPO}/releases/download/${tag}/${ASSET}" \
  || fail "Не смог скачать ${ASSET} для ${tag}."

tar -xzf "${tmp}/app.tar.gz" -C "${tmp}"
app="$(find "${tmp}" -maxdepth 1 -name '*.app' -print -quit)"
[ -n "${app}" ] || fail "В архиве нет .app — сборка релиза сломана?"
name="$(basename "${app}")"

# A running copy cannot be replaced cleanly — the old name's either.
for running in "${name}" "${LEGACY_NAME}"; do
  osascript -e "quit app \"${running%.app}\"" >/dev/null 2>&1 || true
done

sudo=""
[ -w "${DEST}" ] || { say "Для записи в ${DEST} нужен пароль администратора."; sudo="sudo"; }

# The old name goes too: its data was copied under the new identifier on the
# new till's first start (legacy_profile.rs), and two tills on one Mac would
# confuse whoever opens «Программы».
for previous in "${name}" "${LEGACY_NAME}"; do
  if [ -e "${DEST}/${previous}" ]; then
    say "Удаляю прежнюю версию ${DEST}/${previous}…"
    ${sudo} rm -rf "${DEST:?}/${previous}"
  fi
done

say "Устанавливаю в ${DEST}/${name}…"
${sudo} ditto "${app}" "${DEST}/${name}"

# ditto under sudo leaves the bundle root-owned, and the in-app updater cannot
# elevate — it would see a read-only app and hide the update button. Hand the
# bundle back to whoever will actually run it.
if [ -n "${sudo}" ]; then
  ${sudo} chown -R "$(id -un):$(id -gn)" "${DEST}/${name}"
fi

# Belt and braces: strips quarantine if the bundle ever picks it up (e.g. the
# user re-runs this over a copy that came from a browser).
${sudo} xattr -dr com.apple.quarantine "${DEST}/${name}" 2>/dev/null || true

say "Готово. Запуск: open \"${DEST}/${name}\""
open "${DEST}/${name}"
