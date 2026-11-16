#!/bin/sh
# Runs every browser suite and prints one summary line per suite.
# Needs the two test servers (see ../README.md):
#   python3 serve.py 8787                                   the site in built-in mode
#   API_BASE=http://127.0.0.1:8000 python3 serve.py 8788    the same site pointed at the Django backend (optional)
# Usage: sh run_all.sh            built-in mode only
#        sh run_all.sh backend    also the journeys and the access probe against the backend on 127.0.0.1:8000
cd "$(dirname "$0")" || exit 1
AXE_JS="${AXE_JS:-node_modules/axe-core/axe.min.js}"; export AXE_JS
line() { printf '%-34s %s\n' "$1" "$2"; }
last() { tail -n 1 | cut -c1-110; }

line "smoke (18 pages)"            "$(python3 smoke.py desktop 2>&1 | grep -c '^OK') ok, $(python3 smoke.py phone 2>&1 | grep -c '^FAIL') failing on phone"
line "customer journey, desktop"   "$(python3 flow_customer.py desktop 2>&1 | last)"
line "customer journey, phone"     "$(python3 flow_customer.py phone 2>&1 | last)"
line "designer/tailor/admin"       "$(python3 flow_roles.py desktop 2>&1 | last)"
for size in phone small-phone landscape tablet laptop desktop wide; do
  line "every page, $size"         "$(python3 matrix.py $size 2>&1 | last)"
done
line "security headers (CSP)"      "$(python3 csp.py desktop 2>&1 | last)"
if [ -f "$AXE_JS" ]; then
  line "accessibility, signed out"   "$(python3 a11y.py phone out 2>&1 | last)"
  for who in customer designer tailor admin; do line "accessibility, $who" "$(python3 a11y.py phone $who 2>&1 | last)"; done
  line "accessibility, desktop"      "$(python3 a11y.py desktop out 2>&1 | last)"
  line "accessibility, open states"  "$(python3 a11y_states.py phone 2>&1 | last)"
else
  line "accessibility"               "skipped: npm install axe-core (in tests/browser)"
fi
if [ "$1" = "backend" ]; then
  line "backend: customer journey"   "$(FT_BASE=http://localhost:8788 FT_REMOTE=1 python3 flow_customer.py desktop 2>&1 | last)"
  line "backend: other roles"        "$(FT_BASE=http://localhost:8788 FT_REMOTE=1 python3 flow_roles.py desktop 2>&1 | last)"
  line "backend: access probe"       "$(python3 access_probe.py http://127.0.0.1:8000 2>&1 | last)"
fi
