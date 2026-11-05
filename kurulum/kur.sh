#!/usr/bin/env bash
# ============================================================
#  Colonist Kaynak Takibi - macOS / Linux kurulumu (TEK SEFER)
#
#  Kullanim:
#    bash kur.sh            # kur ya da guncelle
#
#  Chrome'a klasoru bir kez tanitiyorsun; sonrasinda bu betigi
#  tekrar calistirmak (ya da cron'a koymak) guncelleme icin yeter.
# ============================================================
set -euo pipefail

REPO="https://github.com/Emoshhh/Colonist-Resource-Tracker"
BRANCH="claude/colonist-opponent-resource-tracker-sgde1g"
DEST="${COLONIST_TRACKER_DIR:-$HOME/.colonist-tracker}"

if ! command -v git >/dev/null 2>&1; then
  echo "[HATA] git kurulu degil." >&2
  exit 1
fi

if [ -d "$DEST/.git" ]; then
  echo "Guncelleniyor: $DEST"
  before=$(git -C "$DEST" rev-parse --short HEAD)
  git -C "$DEST" fetch origin "$BRANCH"
  # DIKKAT: bu klasorde elle degisiklik yapma, asagidaki satir siler.
  git -C "$DEST" reset --hard "origin/$BRANCH"
  after=$(git -C "$DEST" rev-parse --short HEAD)
  if [ "$before" = "$after" ]; then
    echo "Yeni surum yok. ($after)"
  else
    echo "Guncellendi: $before -> $after"
    git -C "$DEST" log --oneline -5
  fi
else
  echo "Indiriliyor: $DEST"
  git clone --branch "$BRANCH" --single-branch --depth 50 "$REPO" "$DEST"
  cat <<EOF

============================================================
 Hazir. Simdi Chrome'da SADECE BIR KEZ:

   1. chrome://extensions adresini ac
   2. "Gelistirici modu"nu ac
   3. "Paketlenmemis ogeyi yukle" (Load unpacked)
   4. Su klasoru sec:

        $DEST/extension

 Saatte bir otomatik guncelleme istersen crontab'a ekle:

   crontab -l 2>/dev/null; echo "0 * * * * bash $DEST/kurulum/kur.sh >/dev/null 2>&1"

 Uzanti yeni surumu gorunce kendini yeniden yukluyor.
============================================================
EOF
fi
