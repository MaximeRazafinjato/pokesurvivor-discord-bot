#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/pokebot/app

if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

if ! command -v node >/dev/null || ! node --version | grep -q "^v22"; then
  apt-get update -y
  apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable

id pokebot >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/pokebot --shell /usr/sbin/nologin pokebot
mkdir -p "$APP_DIR"
chown -R pokebot:pokebot /opt/pokebot

echo "VM prête : Node $(node --version)"
