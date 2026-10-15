#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/pokebot/app
cd "$APP_DIR"

id pokebot-data >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin pokebot-data
chown -R pokebot:pokebot /opt/pokebot
mkdir -p data
chown -R pokebot-data:pokebot-data data
runuser -u pokebot -- env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --frozen-lockfile --prod
runuser -u pokebot-data -- node scripts/build-data.js --force

install -m 644 deploy/pokebot.service deploy/pokebot-data.service deploy/pokebot-data.timer /etc/systemd/system/
install -m 755 deploy/refresh-data.sh /usr/local/bin/pokebot-refresh-data
systemctl daemon-reload
systemctl enable --now pokebot-data.timer
systemctl enable pokebot.service
systemctl restart pokebot.service

echo "PokéBot installé et démarré"
