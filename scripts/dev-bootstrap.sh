#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
key_directory="$repository_root/.dev/sftp"
environment_file="$repository_root/.dev/compose.env"

random_hex() {
  od -An -N 32 -tx1 /dev/urandom | tr -d ' \n'
}

ensure_value() {
  key=$1
  value=$2
  if ! grep -q "^${key}=" "$environment_file" 2>/dev/null; then
    printf '%s=%s\n' "$key" "$value" >> "$environment_file"
  fi
}

command -v ssh-keygen >/dev/null 2>&1 || {
  echo 'ssh-keygen is required to create the isolated local SFTP keys.' >&2
  exit 1
}

umask 077
mkdir -p "$key_directory"

if [ ! -f "$key_directory/media_ed25519" ]; then
  ssh-keygen -q -t ed25519 -N '' -C 'the-bulgaria-we-lost-local-media' \
    -f "$key_directory/media_ed25519"
fi

if [ ! -f "$key_directory/ssh_host_ed25519_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -C 'the-bulgaria-we-lost-local-sftp' \
    -f "$key_directory/ssh_host_ed25519_key"
fi

fingerprint=$(ssh-keygen -l -E sha256 -f "$key_directory/ssh_host_ed25519_key.pub" | awk '{print $2}')
touch "$environment_file"
temporary_file="$environment_file.tmp"
grep -v '^SFTP_HOST_KEY_SHA256=' "$environment_file" > "$temporary_file" || true
mv "$temporary_file" "$environment_file"
printf 'SFTP_HOST_KEY_SHA256=%s\n' "$fingerprint" >> "$environment_file"

ensure_value AUTH_JWT_SECRET "$(random_hex)"
ensure_value AUTH_REFRESH_SECRET "$(random_hex)"
ensure_value AUTH_FORGOT_SECRET "$(random_hex)"
ensure_value AUTH_CONFIRM_EMAIL_SECRET "$(random_hex)"
ensure_value MEDIA_SERVICE_TOKEN "$(random_hex)"
ensure_value MEDIA_PROBE_TOKEN "$(random_hex)"
ensure_value SEED_PASSWORD "Local-$(random_hex)"
chmod 600 "$environment_file" "$key_directory/media_ed25519" "$key_directory/ssh_host_ed25519_key"

echo "Local SFTP keys and development-only secrets are ready in $repository_root/.dev"
