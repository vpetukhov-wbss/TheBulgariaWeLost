#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
set -a
. "$repository_root/.dev/compose.env"
set +a

check() {
  name=$1
  url=$2
  if curl --fail --silent --show-error "$url" >/dev/null; then
    printf '%-18s %s\n' "$name" ok
  else
    printf '%-18s %s\n' "$name" failed >&2
    exit 1
  fi
}

check 'Angular' 'http://127.0.0.1:4200/healthz'
check 'NestJS + MongoDB' 'http://127.0.0.1:3000/api/v1/health'
check '.NET Media' 'http://127.0.0.1:5088/media/health/live'
check 'Mailpit' 'http://127.0.0.1:8025/readyz'

status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header "Authorization: Bearer $MEDIA_PROBE_TOKEN" \
  'http://127.0.0.1:5088/internal/media/v1/storage/archive/probe')
if [ "$status" != '204' ]; then
  echo "SFTP write/read/delete probe failed with HTTP $status" >&2
  exit 1
fi
printf '%-18s %s\n' 'SFTP round trip' ok
