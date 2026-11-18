# Tests

Three layers. None of them is needed to deploy; they are how the build was checked and how to re-check it after a change.

## 1. Data layer (no browser)

    node tests/store.test.js

138 checks against `assets/js/store.js`, the built-in data layer: accounts, designs and versions, publishing, likes,
remixes, follows, commissions from request to approval, messages, notifications, quotes, orders, payments, delivery,
problems and refunds, reviews, reports, admin, confirming an email address, resetting a password, which
notifications are emailed, bank details and payouts less the fee, the fee set by an admin (platform rates, an
account's own rate, and each job keeping the rate it was quoted at), plus hostile input (script tags in specs, other
people's ids).

## 2. Backend

    cd backend && python manage.py test

19 tests: the Python rules produce exactly what the site's JavaScript engine produces (313 recorded designs), every
journey through the API, access between accounts, test and live payment paths, the production guards, and the three
things that reach outside services, each against a stand-in: email (real messages built and "sent" to an in-memory
outbox), Paystack Transfers and its signed webhook, and the Photoreal service; and the platform fee set by an admin.

## 3. Browser (Playwright)

    pip install playwright && playwright install chromium
    cd tests/browser && npm install axe-core          # only for the accessibility suites

    python3 serve.py 8787 &                            # the site, built-in mode, with the headers from vercel.json
    sh run_all.sh                                      # every suite, one summary line each

To include the backend, start it with fast sample pacing and a second copy of the site pointed at it. The last two
settings point Photoreal at a stand-in for the AI service, which `tryon.py` starts itself on port 8799; leave them out
and that one part is skipped.

    cd backend && python manage.py migrate && python manage.py seed
    CORS_ORIGINS=http://localhost:8788 SITE_URL=http://localhost:8788 SAMPLE_QUOTE_DELAY=0.3,1.4 SAMPLE_PHASE_SECONDS=2.2 \
      THROTTLE_AUTH=1000/min TEST_PAYOUT_SECONDS=3 FASHN_API_KEY=test FASHN_API_URL=http://127.0.0.1:8799 \
      python manage.py runserver 127.0.0.1:8000 --noreload &
    cd tests/browser && API_BASE=http://127.0.0.1:8000 python3 serve.py 8788 &
    sh run_all.sh backend

The customer and role journeys use up some of the demo data (a commission gets delivered, an order completed), so
against the backend start each full run from a freshly seeded database (`SQLITE_PATH=/tmp/ft.sqlite3`, delete the file,
then `migrate` and `seed`). The email and payouts journey can be repeated on the same database.

| Script | What it does |
|---|---|
| `smoke.py [size]` | Opens every page (and the states emailed links land on); fails on script errors, failed requests or sideways scroll. |
| `flow_customer.py [size]` | A customer designs, sees it in 3D, saves, requests quotes, pays, tracks, confirms delivery, reviews, messages the tailor, publishes, then commissions a designer through to approval (27 checks). |
| `flow_roles.py [size]` | A designer makes an offer and delivers; a tailor quotes, posts a photo update and delivers; an admin verifies, moderates and resolves a problem; the offer form shows what the designer receives (26 checks). |
| `flow_extras.py [size]` | A new member confirms their email from the link, forgets and resets their password; a tailor adds bank details, delivers, the customer confirms, and the payout arrives less the fee; the admin sees it, changes the platform rate (a bad value refused, the example following what is typed) and gives the tailor an own rate, which the tailor sees (42 checks; 41 against the backend). Built-in mode reads the links from the demo mailbox, backend mode from the development mail log. |
| `tryon.py [size]` | The try-on on a photo, a video and the camera: the garment lands on the body and nowhere else, every fit control does what it says, body points move by dragging and by keyboard, the saved picture and video have the garment in them, the camera switches off, the readout shows; the garment is shaped to the figure's outline, forms behind the scan line, shows as light in Hologram view and can be cut for either form; a top leaves the legs alone and trousers start at the waist; a photo and a clip with odd dimensions, which once stopped the tracker, are dressed without freezing (37 checks; 42 against the backend, with Photoreal end to end). |
| `wardrobe.py [size]` | Every garment type and all 49 templates draw front and back, have a price, and build in 3D on both mannequins with no bad numbers; trousers and skirts carry no sleeves or embroidery; the studio relabels Collar as Waist for them, offers every type as a style, and keeps the mannequin chosen with the design. |
| `speed.py [size]` | The speed-check page, the viewer stepping its picture down on a slow device and remembering it, and a Graphics level chosen by hand being left alone (13 checks). |
| `matrix.py [size…]` | Every page, signed out and as each role, at one or more sizes: `phone small-phone landscape tablet laptop desktop wide`. |
| `csp.py` | Every page under the content security policy; lists anything the policy blocked. |
| `a11y.py [size] [out\|customer\|designer\|tailor\|admin]` | axe-core (WCAG 2.1 A/AA + best practice) on every page. |
| `a11y_states.py` | The same on open dialogs, popovers, every studio tab and step, the 3D view, the try-on with a picture up and its controls open, the speed check's results, the password and email-link screens, the demo mailbox, and the bank details form with an error showing. |
| `access_probe.py [api]` | Against a running backend: 123 attempts to read or change another account's things, reach staff routes, add bank details without a confirmed email, change the platform fee or their own rate without being an admin, forge a confirm or reset link, learn which addresses have accounts, post an unsigned payment webhook, or crash the API with bad input. |

Screenshots from the journeys land in `tests/browser/shots/`.

**No photos of people are used or needed.** `tryon.py` draws its own stand-in: the site's mannequin in a shirt, with
a face drawn on, in front of a plain wall. The body tracker finds it the way it finds a person. From that picture
the test also makes a short video and the feed for Chromium's pretend camera. (The face matters: with the head left
blank, the tracker could not tell the figure's front from its back in live mode.)

**What these cannot tell you.** The browsers here draw 3D in software, at 2 to 7 frames a second, so nothing in the
suite measures speed on a real device, and a stand-in figure is not a person in a bedroom mirror. Before launch, open
`/speed` and the live try-on (`/try-on?…&fps=1`) on real phones; see the main README.

The site forbids `eval` through its content security policy, so waits in these scripts are written as functions
(`e2e_lib.py` wraps plain expressions for you).
