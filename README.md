# Fashion Teller

People design their own clothes the way they build an avatar: start from a template, swap the parts, pick colours from
palettes made for that style and fabric, sketch on it with a finger, and turn it around in 3D. Then they take it
somewhere: publish it, have a tailor make it, or hire a designer to design something for them. Streaks, levels, badges
and a daily challenge bring them back.

This folder holds two things:

- **The site** (everything outside `backend/`): static pages, plain JavaScript, one stylesheet. No build step to deploy.
- **The backend** (`backend/`): a Django REST API with the same rules as the site.

The site runs in two modes, switched by one line in `assets/js/config.js`:

| `apiBaseUrl` | Mode | What it means |
|---|---|---|
| empty (default) | **Built-in** | The whole product runs inside the browser and keeps its data in that browser. Everything works, but only on that one device. For demos and UI work. |
| a URL | **Backend** | Every call goes to the Django API. Real accounts, shared between devices. |

## Pages

    /                 Home
    /how-it-works     The four production phases, FAQ
    /studio           Design → See it (3D, try-on) → Measure → Tailors → Pay → Track
    /discover         Designs people have published: trending, new, following, saved
    /designers        Designers you can hire or follow
    /designer?id=     A designer's profile, work and reviews; start a commission
    /design?id=       The design room: 3D view, versions, spec sheet, publish, share, remix, have it made
    /designs          My studio: streak, level, daily challenge, badges, every design
    /commissions      Commissions, for the client and for the designer
    /messages         Conversations with tailors, designers and clients
    /orders           Orders with live tracking
    /account          Profile, measurements, designer profile, password
    /workshop         The tailor's side: requests, quotes, orders, reviews, profile
    /admin            Operations: tailors, orders, payments, commissions, reports, users, designs, inbox
    /tailors          For tailors: rank simulator and application
    /signin  /about  /404

## What the product does

**Designing.** 19 templates across kaftan, agbada, boubou, dress, suit and shirt; 10 fabrics, 9 patterns, palettes per
fabric and style, collars, sleeves, lengths, fits, embroidery, details and a freehand sketch layer. Every save is a
version with an automatic change list. "Describe it" turns a sentence into a starting design (plain text matching, no
AI service).

**Seeing it.** The 3D view is drawn live in the browser from the design itself: the garment is built from the same
pattern pieces as the flat drawing and put on a mannequin with real fabric texture, lighting and shadow. Drag to turn,
front / back / side, skin tones, snapshot. It needs WebGL; without it the flat front/back view is shown instead.
Try-on places the garment over the customer's own photo by hand; the photo never leaves the device.

**After a design** (the design room, `/design?id=`): rename, duplicate, restore any version, print a spec sheet for a
tailor, share a link, publish to Discover with a caption and tags, allow or forbid remixes, have it made.

**Discover.** Like, save for later, follow the designer, remix into your own studio (the original designer is credited
on the remix), report.

**Designers and commissions.** Anyone can open a designer profile (handle, bio, specialties, starting fee, turnaround).
A client sends a brief → the designer makes an offer (fee and days) → the client pays and the fee is held → the designer
delivers a design made in the same studio → the client approves or asks for changes (two rounds) → on approval the
design lands in the client's studio, credited to the designer, and the fee is released. Either side can message
throughout; the client can review afterwards.

**Tailors and orders.** A design plus a measurement profile goes out as a request; verified tailors quote; the customer
compares and pays (in full, or a deposit with the balance before delivery). The tailor posts updates with photos. The
customer confirms delivery, which releases the payment, or reports a problem, which holds it until an admin refunds or
releases. Reviews follow.

**Messages and notifications.** One conversation per order, per commission, or direct. A bell in the nav with unread
counts.

**Admin.** Verify tailors, move or cancel orders, resolve reported problems, refunds, commissions, content reports
(take a design off Discover, suspend an account), users, contact inbox, audit trail.

## Demo accounts

Shown on `/signin` while `demoAccounts: true` in `assets/js/config.js`. Password for all: `fashion2026`.

| | Email | Starts with |
|---|---|---|
| Customer | `customer@demo.fashionteller` | A design, a 4-day streak, a finished order, a commission ready to review |
| Designer | `designer@demo.fashionteller` | Published work, a new request to answer and a paid commission to deliver |
| Tailor | `tailor@demo.fashionteller` | A verified workshop with an order in tailoring; requests arrive when a customer asks for quotes |
| Admin | `admin@demo.fashionteller` | A tailor application waiting to be verified |

Sample tailors and designers act on their own so every flow can be finished alone: they quote, move orders along, make
offers, deliver designs and reply to messages. Test card: `4084 0840 8408 4081`, any future expiry, any CVV; CVV `000`
is declined.

Built-in mode: `FTStore.reset()` in the browser console starts the data from scratch.

## Run it locally

    npx serve .                          # the site at http://localhost:3000, built-in mode

With the backend:

    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    python manage.py migrate
    python manage.py seed                # demo data and the demo accounts
    python manage.py runserver 127.0.0.1:8000

then open `http://localhost:3000/?api=http://127.0.0.1:8000`. That switch works on localhost only and lasts for the
tab (`?api=` with nothing after it switches back). Nothing needs configuring for local work.

## Go live

**Site (Vercel).** Drag the folder into vercel.com/new or run `npx vercel --prod`. Framework preset: Other; no build
command. `vercel.json` turns on clean URLs and sends the security headers; `.vercelignore` keeps `backend/`, `tests/`,
`_src/` and the docs out of the deployment.

**Backend.** Any host that runs a container or a Python process (`backend/Dockerfile`, `backend/Procfile`). Set, from
`backend/.env.example`:

| Variable | |
|---|---|
| `DJANGO_SECRET_KEY` | Required. A long random string. |
| `ALLOWED_HOSTS` | Required. The API's hostname. |
| `CORS_ORIGINS` | Required. The site's origin(s); only these may call the API from a browser. |
| `DATABASE_URL` | Postgres. Without it the API uses a SQLite file, which most hosts wipe on redeploy. |
| `PAYSTACK_SECRET_KEY` | Turns on real payments; every payment is verified with Paystack before it is recorded. |

Then:

    python manage.py migrate
    python manage.py seed --admin you@example.com      # your admin account; asks for a password

and in `assets/js/config.js` set `apiBaseUrl`, `payments.paystackPublicKey` and `demoAccounts: false`.

On a server the backend is locked down unless you say otherwise: debug is off, the test checkout refuses to take
"payments" (`ALLOW_TEST_PAYMENTS`), the sample tailors and designers are off (`SAMPLE_MODE`), and `seed` will not load
the demo accounts without `--demo`.

**Before real customers**, see "Not built yet" below: three of those items (payouts, password reset, the Paystack live
test) matter on day one.

## Not built yet

- **Payouts.** "Released" is a status. No money is transferred to a tailor or designer; that needs Paystack transfers
  or subaccounts and a decision on the platform's cut. No platform fee is taken anywhere.
- **Email.** No password reset, no email verification, no emailed notifications. Notifications are in-app only.
- **A live Paystack payment has not been run.** The verify path is implemented and tested against a stub. Make one test
  payment with your keys; if the Paystack window is blocked, the browser console names the origin to add to the
  content security policy in `vercel.json`.
- **AI try-on.** `POST /designs/{id}/try-on/` is a marked hook that answers "not connected". The shipped try-on is
  manual placement.
- **Live updates** are polled (about every 6 seconds against the backend), not pushed.
- **Photos** (tailor updates) are stored inline in the database, capped at three small images per update. Move them to
  object storage before volume grows.

## Backend routes

All under `/api/v1/`. JSON in and out, snake_case on the wire (`api.js` converts). Sign-in is a bearer token
(`Authorization: Bearer …`), refreshed once on a 401. Errors are `{"detail": "…"}`.

```
Accounts      POST auth/register|login|refresh
              GET/PATCH me     POST me/password     GET me/game     GET me/unread
              GET me/notifications     POST me/notifications/read
              GET/POST me/measurements     PATCH/DELETE me/measurements/{id}
              GET/PUT me/designer
Designs       GET/POST designs     GET/PATCH/DELETE designs/{id}
              POST designs/{id}/versions|restore|duplicate|publish|unpublish|like|save|remix|try-on
              GET discover?sort=&garment=&q=&by=&limit=&offset=     POST reports
Designers     GET designers     GET designers/{id or @handle}     POST designers/{id}/follow
Commissions   GET/POST commissions     GET commissions/{id}
              POST commissions/{id}/offer|decline|pay|pay/init|deliver|changes|approve|cancel
Reviews       GET/POST reviews
Messages      GET/POST threads     GET threads/{id}     POST threads/{id}/messages
Tailors       GET vendors     GET vendors/{id}     GET/PATCH vendors/me     POST vendors/apply
              GET vendors/requests     POST vendors/requests/{id}/quote     GET vendors/quotes
              GET vendors/orders     POST vendors/orders/{number}/events
Orders        POST designs/{id}/requests     GET designs/{id}/requests/latest     GET designs/{id}/quotes
              GET/POST orders     GET orders/{number}
              POST orders/{number}/pay|pay/init|cancel|confirm|problem
Admin         GET admin/stats|users|vendors|designs|orders|payments|commissions|reports|messages|applications|audit
              POST admin/users/{id}/status     admin/vendors/{id}/status     admin/orders/{number}/phase
                   admin/orders/{number}/issue     admin/payments/{id}/refund     admin/reports/{id}/resolve
Other         POST contact     GET /healthz
```

The server owns the rules: it cleans every design spec against the catalogue, prices, awards XP and streaks, and
decides who may see or change what. `backend/core/rules.py` is a port of the site's engine, and a test holds the two to
identical output on 143 recorded designs. If you change templates, options, pricing or challenges in
`assets/js/engine.js` or `catalog.js`, run `node backend/tools/export_catalog.js` to refresh what the backend reads.

## Where things are

| | |
|---|---|
| `assets/js/config.js` | The one file to edit to go live or tune rendering |
| `assets/js/engine.js`, `catalog.js` | Garment construction and drawing; templates, palettes, options, pricing, challenges |
| `assets/js/viewer3d.js` | The 3D view (three.js, loaded only when opened) |
| `assets/js/store.js` | Built-in data layer |
| `assets/js/api.js` | The single door to data: built-in or backend, same methods |
| `assets/js/account.js` | Sign-in, nav, shared UI (`FTApp`): cards, sheets, checkout, tabs, 3D mount |
| `assets/js/site.js`, `device.js` | Motion, page transitions, per-device quality |
| `assets/js/<page>.js` | One script per page |
| `assets/css/site.css` | All styles; tokens at the top, the app layer in the second half |
| `_src/` | Page bodies and the shared nav/footer. After editing: `python3 _src/build.py` |
| `backend/core/` | `models.py`, `views.py` (endpoints), `api.py` (shared logic), `rules.py`, `tests.py` |
| `tests/` | Data-layer, backend and browser tests (`tests/README.md`) |
| `AUDIT.md` | What was tested, what was found and fixed, what is left |

## Display per device

Every visitor starts on the full experience; `device.js` classes the device before first paint and `site.js` steps the
quality down one level only if that device is dropping frames. People can override it under Graphics in the footer.
Preview any combination with `?render=phone|tablet|laptop|desktop` and `?quality=full|balanced|lite`. Layouts are
fitted for small phones (320px) through large monitors, in both orientations; phones get a bottom tab bar.
