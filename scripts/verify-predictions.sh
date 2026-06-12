#!/usr/bin/env bash
# Quick smoke test for /api/predictions — run while `npm run dev` is up.
set -euo pipefail
BASE="${1:-http://localhost:8888}"

echo "Testing predictions API at $BASE"

code=$(curl -s -o /tmp/pred-get.json -w "%{http_code}" "$BASE/api/predictions")
test "$code" = "200"
python3 -c "import json; d=json.load(open('/tmp/pred-get.json')); assert 'picks' in d, d"

code=$(curl -s -o /tmp/pred-post.json -w "%{http_code}" -X POST "$BASE/api/predictions" \
  -H "Content-Type: application/json" \
  -d '{"player":"Jen","matchIdx":10,"pick":"draw","scoreH":1,"scoreA":1}')
test "$code" = "200"
python3 -c "import json; d=json.load(open('/tmp/pred-post.json')); assert d.get('ok')"

code=$(curl -s -o /tmp/pred-bad.json -w "%{http_code}" -X POST "$BASE/api/predictions" \
  -H "Content-Type: application/json" \
  -d '{"player":"Jen","matchIdx":0,"pick":"home","scoreH":2,"scoreA":0}')
test "$code" = "403"

echo "All prediction API checks passed."
