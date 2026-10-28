#!/usr/bin/env bash
# Builds updates/SocialMediaBell.zip and writes updates/latest.json (last, so the
# feed never points at a half-written zip). Run by the release workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/check-errors.sh
version=$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')
notes=$(cat RELEASE_NOTES.txt 2>/dev/null || true)
stage=$(mktemp -d)
mkdir "$stage/SocialMediaBell"
cp -R manifest.json src app icons LICENSE README.md "$stage/SocialMediaBell/"
mkdir -p updates
rm -f updates/SocialMediaBell.zip
(cd "$stage" && zip -qr -X - SocialMediaBell) > updates/SocialMediaBell.zip
python3 - "$version" "$notes" > updates/latest.json <<'PY'
import json, sys
print(json.dumps({"version": sys.argv[1], "url": "SocialMediaBell.zip", "notes": sys.argv[2].strip()}, indent=2))
PY
echo "Built SocialMediaBell v$version"
