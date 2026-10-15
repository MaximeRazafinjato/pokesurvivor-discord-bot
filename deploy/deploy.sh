#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
tar czf - package.json pnpm-lock.yaml src scripts assets data deploy \
  | ssh pokebot-vm "sudo tar xzf - -C /opt/pokebot/app && sudo bash /opt/pokebot/app/deploy/install-app.sh"
ssh pokebot-vm "sleep 5 && sudo journalctl -u pokebot.service -n 3 --no-pager -o cat"
