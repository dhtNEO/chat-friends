#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 ca-certificates git
systemctl stop docker.service docker.socket
# Disco de dados novo e dedicado, criado pelo Terraform. Não usa discos arbitrários.
disk=/dev/disk/by-id/google-friends-data
for i in $(seq 1 30); do [[ -b "$disk" ]] && break; sleep 1; done
[[ -b "$disk" ]]
if ! blkid "$disk" >/dev/null 2>&1; then mkfs.ext4 -F "$disk"; fi
mkdir -p /srv/chat-friends-data
uuid=$(blkid -s UUID -o value "$disk")
if ! grep -q "UUID=$uuid " /etc/fstab; then printf 'UUID=%s /srv/chat-friends-data ext4 defaults,nofail 0 2
' "$uuid" >> /etc/fstab; fi
mountpoint -q /srv/chat-friends-data || mount /srv/chat-friends-data
mkdir -p /etc/docker
# Máquina dedicada nova: configure o armazenamento antes de iniciar containers.
if [[ ! -f /etc/docker/daemon.json ]]; then printf '{"data-root":"/srv/chat-friends-data/docker","log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
' > /etc/docker/daemon.json; fi
systemctl enable --now docker
mkdir -p /srv/chat-friends
chmod 750 /srv/chat-friends
# Sem checkout privado nem segredos no user-data. Continue docs/GCP_DEPLOY.md.
