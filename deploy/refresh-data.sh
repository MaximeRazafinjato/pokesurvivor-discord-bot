#!/usr/bin/env bash
set -euo pipefail

cd /opt/pokebot/app
before=$(sha256sum data/game.json | cut -d " " -f 1)
runuser -u pokebot -- node scripts/build-data.js
after=$(sha256sum data/game.json | cut -d " " -f 1)

if [ "$before" != "$after" ]; then
  systemctl restart pokebot.service
  echo "Nouvelles données du jeu : bot redémarré"
else
  echo "Données du jeu inchangées"
fi
