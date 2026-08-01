#!/usr/bin/env bash
#
# Build and publish Ideaworks to a self-hosted Caddy vhost.
#
#   ./scripts/deploy.sh
#
# The canonical deploy is GitHub Pages via .github/workflows/pages.yml; this
# script is kept for self-hosting, where precompressed sidecars and cache
# headers are available and Pages' on-the-fly gzip is not. It expects a matching
# vhost in the Caddyfile — see the Deploying section of the README.
#
# Static files only — there is no server-side component. The embedding model is
# vendored into public/models, so the deployed site makes no third-party
# requests and works with no internet connection after first load.
#
# Large assets are precompressed at deploy time rather than compressed per
# request: the ONNX weights and the ORT WebAssembly runtime are ~46 MB combined,
# which drops to ~19 MB with zstd. Caddy's `precompressed` serves the .zst/.gz
# sidecar when the client advertises support, at zero CPU cost per request.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${IDEAWORKS_TARGET:-/srv/ideaworks}"
OWNER="${IDEAWORKS_OWNER:-caddy:caddy}"

cd "$ROOT"

echo "==> Building"
npm run build

echo "==> Precompressing large assets"
# Only worth it above ~1 KB; below that the sidecar can exceed the original.
find dist -type f \
  \( -name '*.wasm' -o -name '*.onnx' -o -name '*.js' -o -name '*.css' \
     -o -name '*.json' -o -name '*.html' -o -name '*.svg' \) \
  -size +1k -print0 |
  while IFS= read -r -d '' f; do
    zstd -19 -T0 -q -f -o "$f.zst" "$f"
    gzip -9 -c "$f" > "$f.gz"
    # A sidecar that is not actually smaller is just wasted disk and a slower path.
    [ "$(stat -c%s "$f.zst")" -lt "$(stat -c%s "$f")" ] || rm -f "$f.zst"
    [ "$(stat -c%s "$f.gz")" -lt "$(stat -c%s "$f")" ] || rm -f "$f.gz"
  done

echo "==> Publishing to $TARGET"
sudo mkdir -p "$TARGET"
sudo rsync -a --delete dist/ "$TARGET/"
sudo chown -R "$OWNER" "$TARGET"
sudo chmod -R a+rX "$TARGET"

echo "==> Reloading Caddy"
sudo systemctl reload caddy

echo
printf '%-52s %10s %10s %10s\n' FILE RAW ZSTD GZIP
find "$TARGET" -type f ! -name '*.zst' ! -name '*.gz' -size +100k |
  sort |
  while read -r f; do
    rel="${f#"$TARGET"/}"
    raw=$(stat -c%s "$f")
    z=$([ -f "$f.zst" ] && stat -c%s "$f.zst" || echo -)
    g=$([ -f "$f.gz" ] && stat -c%s "$f.gz" || echo -)
    printf '%-52s %10s %10s %10s\n' "${rel: -52}" "$raw" "$z" "$g"
  done
echo
echo "Deployed. https://ideaworks.doom.fish/"
