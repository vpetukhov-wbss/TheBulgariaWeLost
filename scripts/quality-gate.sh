#!/usr/bin/env bash
# Explicit, non-destructive quality checks for a single .NET solution/project.
# Usage: bash scripts/quality-gate.sh [path/to/solution.slnx|solution.sln|project.csproj]
set -uo pipefail
if ! command -v dotnet >/dev/null 2>&1; then
  echo 'SKIPPED: dotnet SDK not installed'; exit 3
fi
if [[ $# -gt 0 ]]; then
  target="$1"
else
  mapfile -t found < <(find . -maxdepth 3 \( -name '*.sln' -o -name '*.slnx' \) -type f -not -path '*/obj/*' -not -path '*/bin/*' | sort)
  if [[ ${#found[@]} -eq 0 ]]; then
    mapfile -t found < <(find . -maxdepth 3 -name '*.csproj' -type f -not -path '*/obj/*' -not -path '*/bin/*' | sort)
  fi
  if [[ ${#found[@]} -ne 1 ]]; then
    echo "SKIPPED: expected one solution/project but found ${#found[@]}; pass explicit target"; exit 3
  fi
  target="${found[0]}"
fi
if [[ ! -f "$target" ]]; then echo "ERROR: target not found: $target"; exit 2; fi
printf 'Checking %s\n' "$target"
set -e
dotnet restore "$target"
dotnet build "$target" --configuration Release --no-restore
dotnet test "$target" --configuration Release --no-build --no-restore
if [[ "${QUALITY_GATE_FORMAT:-0}" == "1" ]]; then
  dotnet format "$target" --verify-no-changes --no-restore
else
  echo 'FORMAT CHECK NOT RUN (set QUALITY_GATE_FORMAT=1 to enable)'
fi
echo 'PASS: specified checks completed. This is not a substitute for security/integration/architecture/device/release checks.'
