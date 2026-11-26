#!/usr/bin/env bash
# One-command release: build all editions, test, then (only if green) copy into the deploy repo.
# Usage: ./release.sh [--zips]     (does NOT git commit or push)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
SRC="$PWD"
DEPLOY=/home/claude/polaris-by-gugui
OUT=/home/claude/out
ZIPS=0; [[ "${1:-}" == "--zips" ]] && ZIPS=1

say(){ printf '\n== %s\n' "$*"; }
SUMMARY=()

say "Building site editions"
python3 build.py
python3 build.py --edition mercury --jumpstart "Website build"
python3 build.py --edition jupiter --jumpstart '*'
python3 build.py --edition gemini --jumpstart '*' --role 'producer and editor'
for d in www www-mercury www-jupiter www-gemini; do
  [[ -f "$d/index.html" ]] || { echo "FAIL: $d/index.html missing"; exit 1; }
done
SUMMARY+=("built: www www-mercury www-jupiter www-gemini")

say "Test 1: parse.test.js"
PARSE_OUT=$(node test/parse.test.js 2>&1) || { echo "$PARSE_OUT"; echo "FAIL: parse.test.js exited non-zero"; exit 1; }
echo "$PARSE_OUT" | tail -5
if echo "$PARSE_OUT" | grep -q "FAIL"; then echo "FAIL: parse.test.js printed FAIL"; exit 1; fi
SUMMARY+=("parse.test.js: pass")

say "Test 2: e2e.py"
PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
sed "s/8765/$PORT/g" test/e2e.py > /tmp/e2e-run.py
mkdir -p /tmp/shots
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$SRC/www" >/tmp/e2e-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1
kill -0 $SERVER_PID || { echo "FAIL: static server did not start"; exit 1; }
E2E_RC=0
E2E_OUT=$(timeout 180 python3 /tmp/e2e-run.py 2>&1) || E2E_RC=$?
kill $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true; trap - EXIT
echo "$E2E_OUT" | tail -8
[[ $E2E_RC -eq 0 ]] || { echo "FAIL: e2e.py exit code $E2E_RC"; exit 1; }
echo "$E2E_OUT" | grep -q "ERRORS: none" || { echo "FAIL: e2e.py did not print 'ERRORS: none'"; exit 1; }
SUMMARY+=("e2e.py (port $PORT): ERRORS: none")

say "Copying into $DEPLOY"
[[ -d "$DEPLOY" ]] || { echo "FAIL: deploy repo missing"; exit 1; }
# site root = www, but keep the edition subfolders
mkdir -p "$DEPLOY/site"
find "$DEPLOY/site" -mindepth 1 -maxdepth 1 ! -name mercury ! -name jupiter ! -name gemini -exec rm -rf {} +
cp -a www/. "$DEPLOY/site/"
for e in mercury jupiter gemini; do
  rm -rf "$DEPLOY/site/$e"; mkdir -p "$DEPLOY/site/$e"
  cp -a "www-$e/." "$DEPLOY/site/$e/"
done
mkdir -p "$DEPLOY/src"
cp src/app.js src/core.js src/style.css "$DEPLOY/src/"
cp build.py "$DEPLOY/build.py"
SUMMARY+=("deploy copy: site/, site/{mercury,jupiter,gemini}/, src/{app,core}.js, src/style.css, build.py")

if [[ $ZIPS -eq 1 ]]; then
  say "Rebuilding named builds + refreshing zips"
  python3 build.py --name Lani
  python3 build.py --edition mercury --name Donny --jumpstart "Website build"
  python3 build.py --edition jupiter --name Jordan --jumpstart '*'
  python3 build.py --edition gemini --name Marcus --jumpstart '*' --role 'producer and editor'
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  for pair in Lani:www-lani Donny:www-mercury-donny Jordan:www-jupiter-jordan Marcus:www-gemini-marcus; do
    n=${pair%%:*}; b=${pair##*:}
    [[ -f "$b/index.html" ]] || { echo "FAIL: $b/index.html missing"; exit 1; }
    Z="$OUT/polaris-for-$n.zip"
    [[ -f "$Z" ]] || { echo "FAIL: $Z missing"; exit 1; }
    W="$TMP/$n"; mkdir -p "$W"
    unzip -q "$Z" -d "$W"
    [[ -d "$W/polaris-for-$n/app" ]] || { echo "FAIL: no app/ in $Z"; exit 1; }
    rm -rf "$W/polaris-for-$n/app"; mkdir -p "$W/polaris-for-$n/app"
    cp -a "$b/." "$W/polaris-for-$n/app/"
    rm -f "$Z"
    (cd "$W" && zip -qr -X "$Z" "polaris-for-$n")
    unzip -tq "$Z" >/dev/null
    echo "refreshed $Z"
  done
  SUMMARY+=("zips refreshed: Lani Donny Jordan Marcus")
fi

say "SUMMARY (all green)"
printf ' - %s\n' "${SUMMARY[@]}"
echo "Deploy repo NOT committed. Review: git -C $DEPLOY status --short"
