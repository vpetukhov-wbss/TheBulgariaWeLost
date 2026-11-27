#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"
set -a
. "$repository_root/.dev/compose.env"
set +a

compose() {
  docker compose --env-file "$repository_root/.dev/compose.env" "$@"
}

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
check 'OpenSearch API' 'http://127.0.0.1:3000/api/v1/archive/search?q=archive'

status=$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST \
  --header "Authorization: Bearer $MEDIA_PROBE_TOKEN" \
  'http://127.0.0.1:5088/internal/media/v1/storage/archive/probe')
if [ "$status" != '204' ]; then
  echo "SFTP write/read/delete probe failed with HTTP $status" >&2
  exit 1
fi
printf '%-18s %s\n' 'SFTP round trip' ok

before=$(compose exec -T sftp sh -c \
  "find /home/media/archive -maxdepth 1 -type f ! -name '*.part' | wc -l")
quarantine_before=$(compose exec -T media sh -c \
  "find /var/lib/media-quarantine -maxdepth 1 -type f -name '*.upload' | wc -l")
node "$repository_root/scripts/dev-media-acceptance.mjs"
after=$(compose exec -T sftp sh -c \
  "find /home/media/archive -maxdepth 1 -type f ! -name '*.part' | wc -l")
quarantine_after=$(compose exec -T media sh -c \
  "find /var/lib/media-quarantine -maxdepth 1 -type f -name '*.upload' | wc -l")
if [ "$after" -ne $((before + 4)) ]; then
  echo "Expected image/PDF originals and previews, found before=$before after=$after" >&2
  exit 1
fi
if [ "$quarantine_after" -lt $((quarantine_before + 1)) ]; then
  echo "Expected evidence of the interrupted quarantine attempt" >&2
  exit 1
fi

report="$repository_root/.dev/media-vertical-slice-acceptance.json"
image_id=$(node -e \
  "const r=require(process.argv[1]); process.stdout.write(r.flows[0].uploadId)" "$report")
image_correlation=$(node -e \
  "const r=require(process.argv[1]); process.stdout.write(r.flows[0].correlationId)" "$report")
pdf_id=$(node -e \
  "const r=require(process.argv[1]); process.stdout.write(r.flows[1].uploadId)" "$report")
pdf_correlation=$(node -e \
  "const r=require(process.argv[1]); process.stdout.write(r.flows[1].correlationId)" "$report")

metadata_count=$(compose exec -T mongo mongosh --quiet \
  'mongodb://127.0.0.1:27017/bulgaria_archive_dev?replicaSet=rs0&directConnection=true' \
  --eval "db.mediaUploads.countDocuments({
    _id: { \$in: ['$image_id', '$pdf_id'] },
    status: 'Completed',
    schemaVersion: 3,
    completedAttemptId: { \$type: 'string' },
    inspectionAttemptCount: { \$gte: 1 },
    inspectionAttempts: { \$elemMatch: { workerId: { \$type: 'string' }, outcome: 'inspected' } },
    \$or: [
      { _id: '$image_id', correlationId: '$image_correlation' },
      { _id: '$pdf_id', correlationId: '$pdf_correlation' }
    ]
  })")
if [ "$metadata_count" -ne 2 ]; then
  echo "Expected two completed, correlated MongoDB media records, found $metadata_count" >&2
  exit 1
fi

image_compact=$(printf '%s' "$image_id" | tr -d '-')
interrupted_attempt=$(compose exec -T media sh -c \
  "find /var/lib/media-quarantine -maxdepth 1 -type f -name '${image_compact}.*.upload' -print" \
  | sed -n 's/.*\.\([0-9a-f]*\)\.upload$/\1/p' | head -n 1)
completed_attempt=$(compose exec -T mongo mongosh --quiet \
  'mongodb://127.0.0.1:27017/bulgaria_archive_dev?replicaSet=rs0&directConnection=true' \
  --eval "db.mediaUploads.findOne({_id: '$image_id'}).completedAttemptId" | tr -d '-')
if [ -z "$interrupted_attempt" ] || [ "$interrupted_attempt" = "$completed_attempt" ]; then
  echo "Expected completion by a new attempt after the interrupted lease" >&2
  exit 1
fi

printf '%-18s %s\n' 'Vertical slice' ok
printf '%-18s %s\n' 'Protocol report' "$report"
