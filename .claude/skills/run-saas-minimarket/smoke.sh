#!/usr/bin/env bash
# Driver/smoke test for the SaaS MiniMarket full-stack app (FastAPI + Vite/React).
# Usage: bash .claude/skills/run-saas-minimarket/smoke.sh
# Run from the repo root ("SaaS MiniMarket/"). Assumes backend on :8000 and
# frontend dev server on :5173 are already running (see SKILL.md "Run" section).
set -uo pipefail

BACKEND="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND="${FRONTEND_URL:-http://localhost:5173}"
EMAIL="${SMOKE_EMAIL:-ypachano@gmail.com}"
PASSWORD="${SMOKE_PASSWORD:-Minimarket2026}"

fail=0
step() { echo "== $1 =="; }

step "Backend /docs reachable"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/docs")
echo "  -> HTTP $code"
[ "$code" = "200" ] || { echo "  FAIL: backend not responding on $BACKEND"; fail=1; }

step "Login (JSON body, NOT OAuth2 form — see Gotchas)"
LOGIN_JSON=$(curl -s -X POST "$BACKEND/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
echo "  -> $LOGIN_JSON"
TOKEN=$(echo "$LOGIN_JSON" | python -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
[ -n "$TOKEN" ] || { echo "  FAIL: no access_token in login response"; fail=1; }

if [ -n "$TOKEN" ]; then
  step "Authenticated request: GET /api/v1/empresa/mi-config"
  CONFIG_JSON=$(curl -s "$BACKEND/api/v1/empresa/mi-config" -H "Authorization: Bearer $TOKEN")
  echo "  -> $CONFIG_JSON"
  echo "$CONFIG_JSON" | grep -q '"modulos_habilitados"' || { echo "  FAIL: unexpected response shape"; fail=1; }
fi

step "Frontend dev server reachable"
fcode=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND/")
echo "  -> HTTP $fcode"
[ "$fcode" = "200" ] || { echo "  FAIL: frontend not responding on $FRONTEND"; fail=1; }

if [ "$fail" = "0" ]; then
  echo "SMOKE OK: login + authenticated API call + frontend load all succeeded."
else
  echo "SMOKE FAILED: see FAIL lines above."
fi
exit "$fail"
