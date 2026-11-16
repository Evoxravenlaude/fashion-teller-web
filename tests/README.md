# Tests

Three layers. None of them is needed to deploy; they are how the build was checked and how to re-check it after a change.

## 1. Data layer (no browser)

    node tests/store.test.js

80 checks against `assets/js/store.js`, the built-in data layer: accounts, designs and versions, publishing, likes,
remixes, follows, commissions from request to approval, messages, notifications, quotes, orders, payments, delivery,
problems and refunds, reviews, reports, admin, plus hostile input (script tags in specs, other people's ids).

## 2. Backend

    cd backend && python manage.py test

12 tests: the Python rules produce exactly what the site's JavaScript engine produces (143 recorded designs), every
journey through the API, access between accounts, test and live payment paths, and the production guards.

## 3. Browser (Playwright)

    pip install playwright && playwright install chromium
    cd tests/browser && npm install axe-core          # only for the accessibility suites

    python3 serve.py 8787 &                            # the site, built-in mode, with the headers from vercel.json
    sh run_all.sh                                      # every suite, one summary line each

To include the backend, start it with fast sample pacing and a second copy of the site pointed at it:

    cd backend && python manage.py migrate && python manage.py seed
    CORS_ORIGINS=http://localhost:8788 SAMPLE_QUOTE_DELAY=0.3,1.4 SAMPLE_PHASE_SECONDS=2.2 THROTTLE_AUTH=1000/min \
      python manage.py runserver 127.0.0.1:8000 --noreload &
    cd tests/browser && API_BASE=http://127.0.0.1:8000 python3 serve.py 8788 &
    sh run_all.sh backend

| Script | What it does |
|---|---|
| `smoke.py [size]` | Opens all 18 pages; fails on script errors, failed requests or sideways scroll. |
| `flow_customer.py [size]` | A customer designs, sees it in 3D, saves, requests quotes, pays, tracks, confirms delivery, reviews, messages the tailor, publishes, then commissions a designer through to approval (27 checks). |
| `flow_roles.py [size]` | A designer makes an offer and delivers; a tailor quotes, posts a photo update and delivers; an admin verifies, moderates and resolves a problem (25 checks). |
| `matrix.py [size…]` | Every page, signed out and as each role, at one or more sizes: `phone small-phone landscape tablet laptop desktop wide`. |
| `csp.py` | Every page under the content security policy; lists anything the policy blocked. |
| `a11y.py [size] [out\|customer\|designer\|tailor\|admin]` | axe-core (WCAG 2.1 A/AA + best practice) on every page. |
| `a11y_states.py` | The same on open dialogs, popovers, every studio tab and step, and the 3D view. |
| `access_probe.py [api]` | Against a running backend: 81 attempts to read or change another account's things, reach staff routes, or crash the API with bad input. |

Screenshots from the journeys land in `tests/browser/shots/`.

The site forbids `eval` through its content security policy, so waits in these scripts are written as functions
(`e2e_lib.py` wraps plain expressions for you).
