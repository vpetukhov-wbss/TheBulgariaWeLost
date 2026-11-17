#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$repository_root/scripts/dev-bootstrap.sh"
cd "$repository_root"

compose() {
  docker compose --env-file "$repository_root/.dev/compose.env" "$@"
}

diagnose_failure() {
  exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ]; then
    compose ps --all || true
    compose logs --no-color --tail 200 || true
  fi
  exit "$exit_code"
}
trap diagnose_failure EXIT

compose up --build --detach --wait
compose --profile tools run --rm seed
"$repository_root/scripts/dev-check.sh"

trap - EXIT
echo 'Development stack is ready at http://127.0.0.1:4200'
effective_seed_password=${SEED_PASSWORD:-$(sed -n 's/^SEED_PASSWORD=//p' .dev/compose.env)}
echo "Synthetic account password for this local checkout: $effective_seed_password"
