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
    /try-on           See a design on yourself: live through the camera, on a photo, in a video
    /discover         Designs people have published: trending, new, following, saved
    /designers        Designers you can hire or follow
    /designer?id=     A designer's profile, work and reviews; start a commission
    /design?id=       The design room: 3D view, versions, spec sheet, publish, share, remix, have it made
    /designs          My studio: streak, level, daily challenge, badges, every design
    /commissions      Commissions, for the client and for the designer
    /messages         Conversations with tailors, designers and clients
    /orders           Orders with live tracking
    /account          Profile, emails, measurements, designer profile, payouts, password
    /workshop         The tailor's side: requests, quotes, orders, reviews, profile
    /admin            Operations: tailors, orders, payments, payouts, commissions, reports, users, designs, inbox
    /tailors          For tailors: rank simulator and application
    /signin           Sign in, create an account, forgot password; also where emailed links land
    /speed            Speed check: times the 3D view on the device in hand (not linked from the site)
    /about  /404

## What the product does

**Designing.** 13 garment types and 49 templates: kaftan, agbada, boubou, dress, suit, shirt, T-shirt (and polo and
tank), hoodie (and sweatshirt), bomber jacket, kimono, joggers (and shorts), trousers (chinos, jeans, wide-leg,
shorts) and skirt. Styles from elsewhere start from the cut they share: kurta, sherwani, thobe and abaya from the
kaftan; the qipao from the dress (with its side closing and knot buttons); yukata and haori from the kimono; kilt,
sarong and iro wrapper from the skirt; guayabera and aloha shirt from the shirt. 13 fabrics (jersey, denim and nylon
are new), 9 patterns, palettes per fabric and style, collars (or a waist, for trousers and skirts), sleeves, lengths,
fits, embroidery, details and a freehand sketch layer. Sari and hanbok are not built: neither is close enough to an
existing cut to be honest about. Every save is a
version with an automatic change list. "Describe it" turns a sentence into a starting design (plain text matching, no
AI service).

**Seeing it.** The 3D view is drawn live in the browser from the design itself: the garment is built from the same
pattern pieces as the flat drawing and put on a mannequin with real fabric texture, lighting and shadow. There is a
woman's form and a man's form; a design starts on the one that suits it (a dress on the woman's, a kaftan on the
man's), the switch is beside the skin tones, and the choice is saved with the design. Cloth has a weave you can see
(knit for jersey, twill for denim), creases that depend on the fabric, and shading in the folds and under the arms.
Drag to turn, front / back / side, skin tones, snapshot. It needs WebGL; without it the flat front/back view is shown instead.
The viewer times its own frames and steps the picture down on a device that cannot keep up (see "3D speed").

**Trying it on** (`/try-on`, opened from the studio or a design's page). The same 3D garment, worn by the customer:

- **Live.** They switch the camera on and the garment sits on their shoulders, bends at the elbows, hips and knees,
  turns when they turn and sways when they move. Take a picture or record a clip; both have the garment in them.
- **A photo.** Upload a picture; the person in it is found and dressed. In a group it dresses whoever fills most of
  the picture.
- **A video.** Upload a clip; the garment follows the person through it. Export saves a new video with the garment in.
- **Fitted to the person, not to a standard body.** The body tracker also returns the person's outline. From it the
  try-on reads seven widths (chest, waist, hips, upper arm, forearm, thigh, calf) and shapes the garment to them: it
  narrows on a slim build, and grows as far as it must to cover a broad one or loose clothes, and no further. It reads
  them when the person faces the camera with their arms a little away from their sides, and says in the fit controls
  how much it could read.
- **The scan.** When the person is found, a line of light travels down them and the garment forms behind it; changing
  garment replays a short version. With Hologram view on, the garment is drawn as light (see-through, with a rim along
  every edge) so the body can be seen inside it. Both are drawn into the picture, so a saved photo or clip has them.
  People who ask their device for less motion get neither the scan nor the moving light.
- **Movement.** Joints are steadied, a joint that goes out of view is carried by the one above it, frames are drawn on
  an even beat (every refresh, or every second one on a slower device, never a mix), a soft shadow sits where the
  garment meets the body, the garment takes the colour and direction of the light in the room, and a change to a
  slider or to the garment glides into place.
- **Fitting it by hand.** Width, snug-to-loose, length, up/down and left/right sliders, a switch between the woman's
  and the man's form inside the garment, and (on photos) twelve body points that can be dragged or moved with the
  arrow keys when the automatic fit is off. Any saved design or template can be swapped in from the rail.
- **Only the design is drawn.** The trousers a shirt is shown with on the mannequin are styling, not part of the
  design, so the person keeps their own; a two-piece set (kaftan and trousers) is drawn whole.

All of that happens on the device. The body is found by a model that runs in the browser (Google MediaPipe, shipped
in `assets/vendor/mediapipe/`, 20 to 24 MB before compression, downloaded once and cached); no picture, video or
camera frame is uploaded.
The camera needs `https` (or `localhost`), like every site. Limits worth knowing are under "Known limits".

**Photoreal** is the one optional AI feature: on a photo, a button sends that photo and a picture of the garment to an
AI service that redraws the person wearing it. It is off until the backend has a key (see "Photoreal try-on").

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

**Getting paid.** When a customer confirms delivery or approves a commission, the money is released to the tailor or
designer less the platform fee (20% to start; see "The platform fee"). They add a bank account under Account →
Payouts, see what is held, on its way and paid, and every price they enter shows what they will receive after the fee.

**Messages and notifications.** One conversation per order, per commission, or direct. A bell in the nav with unread
counts. Order, quote, commission and payout news is also emailed, and so is one email per conversation with something
unread; each member chooses which under Account → Emails.

**Accounts.** New accounts confirm their email from a link. "Forgot password?" emails a link that works once, for an
hour. Changing the address asks for confirmation again.

**Admin.** Verify tailors, move or cancel orders, resolve reported problems, refunds, commissions, content reports
(take a design off Discover, suspend an account), users, contact inbox, audit trail, payouts (what is owed, sent and
failed; mark as sent or send again) and the platform fees earned.

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

Built-in mode: `FTStore.reset()` in the browser console starts the data from scratch. Built-in mode sends no real email
and moves no real money: emails land in a demo mailbox (linked from `/signin` and the account page) and payouts
"arrive" a few seconds after they are sent.

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
| `PAYSTACK_SECRET_KEY` | Turns on real payments; every payment is verified with Paystack before it is recorded. Also turns on automatic payouts (below). |
| `SITE_URL` | The site's address. Links in emails point here. |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | Turns on email (below). Without them no email is sent, so password reset and address confirmation do not work. |
| `PLATFORM_FEE_PERCENT` | The starting platform fee, 20 by default. After launch an admin changes it in the dashboard. |
| `FASHN_API_KEY` | Optional. Turns on Photoreal try-on (below). |

Then:

    python manage.py migrate
    python manage.py seed --admin you@example.com      # your admin account; asks for a password

and in `assets/js/config.js` set `apiBaseUrl`, `payments.paystackPublicKey` and `demoAccounts: false`. (The fee in
`config.js` only matters in built-in mode; with the backend connected the site shows the backend's rates.)

On a server the backend is locked down unless you say otherwise: debug is off, the test checkout refuses to take
"payments" (`ALLOW_TEST_PAYMENTS`), the sample tailors and designers are off (`SAMPLE_MODE`), and `seed` will not load
the demo accounts without `--demo`.

**Before real customers**, do the four checks under "Check with the real services": none of the outside services
(Paystack, the email provider, the AI service) could be reached from where this was built.

### Email

Any provider that offers SMTP works; nothing in the code is tied to one. **Resend** is the pick: the quickest to set
up, free for 3,000 emails a month (no more than 100 in a day), then $20 a month for 50,000.

1. Create the account, add your sending domain and put the DNS records it shows you (SPF, DKIM) on the domain. Without
   them mail goes to spam.
2. On the backend set `EMAIL_HOST=smtp.resend.com`, `EMAIL_PORT=587`, `EMAIL_HOST_USER=resend`,
   `EMAIL_HOST_PASSWORD=<the API key>`, `DEFAULT_FROM_EMAIL=Fashion Teller <hello@yourdomain>` and `SITE_URL`.

Postmark and Amazon SES work the same way with their own host, user and password (`backend/.env.example` has them).
Until those settings are there, a server sends nothing and the site says so: "Forgot password?" answers that reset
by email is not set up yet, nobody is asked to confirm an address, and bank details can be added without it. Set
email up before launch; without it a member who forgets their password needs you to reset it for them.
Emails go out after the request has answered, so a slow mail server never slows the site; every email is logged in
the `Mail` table with whether it was sent. Sample and demo accounts have made-up addresses and are never sent to. In
development, with no `EMAIL_HOST`, emails are printed to the console and listed at `/api/v1/dev/mail/`; that route
does not exist with debug off.

### The platform fee

Fashion Teller keeps **20%** of each payment when it is released to the tailor or designer. It is set in the admin
dashboard, under **Admin → Payouts → Platform fee**, with no code change or redeploy:

- **Two rates:** one for tailor orders, one for designer commissions, each from 0% to 50% (half points allowed). The
  box shows what each side receives on a ₦60,000 job as you type.
- **An account's own rate:** "Give an account its own rate", or the Fee button beside a tailor or designer under
  Admin → Users. Use it for a founding tailor, a promotion, a high-volume workshop. Clear it to put them back on the
  platform rate. They get a notification (and an email) saying what their rate now is.
- **Agreed work keeps its rate.** A quote or an offer records the rate when it is made, and that job is paid at that
  rate even if the fee changes before the customer accepts or before delivery. Tailors and designers see the rate
  while they quote ("You receive ₦48,000 after the 20% platform fee"), so what they see is what they get.
- Every change is in the audit trail. Customers never see the fee; their price is the tailor's price.

`PLATFORM_FEE_PERCENT` on the backend (and `payments.platformFeePercent` in `config.js` for built-in mode) is only the
starting rate, used until an admin saves one.

### Payouts

The customer pays Fashion Teller; the money is held; when the customer confirms delivery (or approves a commission)
it is released: a payout is created for the total less the platform fee at that job's rate. What happens next depends
on the setup:

| Setup | What happens to a payout |
|---|---|
| `PAYSTACK_SECRET_KEY` set | Sent automatically with Paystack Transfers to the member's bank account. Paystack's webhook reports success or failure. |
| `PAYSTACK_TRANSFERS=0`, or no key on a server | Listed under Admin → Payouts with the bank account; you pay it from your bank and mark it as sent. |
| No key, development | Pretend: marked paid a few seconds later. No money moves. |

A payout waits until the member has confirmed their email and added a bank account, then goes out at once. With
Paystack, the account number is checked with the bank when it is added and the name on the account is shown back.

To turn automatic payouts on, in the Paystack dashboard:

1. Add `https://<your-api-host>/api/v1/webhooks/paystack/` as the webhook URL. Every event is checked against
   Paystack's signature.
2. Switch off "Confirm transfers before sending" (the OTP step), or every transfer will wait for a code.
3. Keep money in the Paystack balance. Transfers are paid from that balance, and by default Paystack settles your
   takings to your bank account instead, so either top the balance up or change the settlement arrangement.

Paystack charges you for each transfer (₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above, plus ₦50 stamp duty from
₦10,000), on top of its charge for taking the payment (1.5% + ₦100, capped at ₦2,000, for local cards). The member
receives the full amount after the platform fee; those charges come out of the fee. On a ₦60,000 order at 20% the
platform keeps ₦12,000 and pays about ₦1,100 of it to Paystack.

A failed transfer (closed account, wrong number) shows as failed for the member and the admin; "Send again" retries
it after the member fixes the account. A payout still "on its way" after ten minutes gets a "Check with Paystack"
button, for the case where the server restarted mid-send or a webhook never arrived. The same webhook also completes
a customer's payment if they closed the tab before the site heard back from Paystack.

### Photoreal try-on (optional)

The pick is **FASHN** (fashn.ai): built for exactly this, about $0.075 a picture. Set `FASHN_API_KEY` on the backend
and a Photoreal button appears on photos in the try-on, for signed-in members on a saved design. They are told the
photo is sent to an AI partner and asked first. `AI_TRYON_DAILY_LIMIT` (default 10) caps pictures per member per day,
because each one costs money. The result is a likeness, not a fitting, and the page says so.

What is kept: the backend passes the member's photo to the service and does not store it. The finished picture is
held for up to an hour so the page can collect it, and is cleared on the next Photoreal request after that. What the
service itself keeps is governed by its terms: read FASHN's data retention terms before switching this on, and name
the service in your privacy notice.

It cannot be live. No such service redraws a person in real time on a phone; the live mode is the tracked 3D garment.

### 3D speed

Phones differ by a factor of twenty in graphics power, so the 3D view measures instead of guessing: while the model
is turning it times its frames, and if they are slow it steps down (fewer pixels, then no cast shadow, then a coarser
mesh) and remembers that for a week. A step that buys no speed is undone, since then something else is holding the
screen back (battery savers cap phones at 30 frames a second). A Graphics level chosen by hand is never overridden.
The try-on does the same for its garment layer.

To see what a real phone does:

- Open **`/speed`** on it and press Run. It times every picture setting, says which one the site will use there, and
  has a Copy button for the numbers.
- Add **`?fps=1`** to any address for a live readout on the 3D view and the try-on (frames a second, time to find the
  body, time to dress and draw). `?fps=0` switches it off.

### Check with the real services

1. **A payment.** Make one test payment with your Paystack keys. If the Paystack window is blocked, the browser
   console names the origin to add to the content security policy in `vercel.json`.
2. **A payout.** With test keys, confirm a delivery as a customer and watch the payout go from "On its way" to
   "Paid" for the tailor. This exercises the transfer call and the webhook, which were tested against stand-ins only.
3. **An email.** Create an account with a real address; the confirmation should arrive within a minute and not in
   spam. Then try "Forgot password?".
4. **Photoreal**, if you switch it on: one picture. The garment picture sent is the site's flat drawing of the design,
   not a product photograph, and how faithfully the service reproduces pattern and embroidery from a drawing is the
   thing to judge.

Also replace or verify the two body-model files as described in `assets/vendor/mediapipe/NOTICE.txt`, and run `/speed`
and the live try-on on the cheapest phone your customers are likely to have.

## Known limits

- **The try-on is a fitting-room mirror, not a photograph.** The garment is drawn over the person, so their own
  clothes show wherever the garment does not reach: sleeves below a T-shirt, a collar inside a wider neckline, trousers
  under a skirt. The garment widens to cover loose clothes, which also means someone in a baggy top is read as broader
  than they are. Photoreal is the only thing that takes the old clothes away. It is at its best on someone facing the
  camera, upper body or full length, in fitted clothes.
- "Hologram" is an effect on the screen. Nothing is projected.
- The cloth is moved by the body and given follow-through; it is not a cloth simulation. A tight skirt on legs set
  wide apart, for example, shows the legs through it.
- A hood is drawn down, as a cowl in the garment's colour: the pattern is not carried onto it.
- Nothing here has been tried on a real phone, camera or person. It was tested on a drawn stand-in figure in a
  desktop browser without a graphics card.
- Extreme poses look rough: the hem of a robe in a deep squat, an agbada with both arms raised in front. With the
  face hidden (turned away, fully covered) the body tracker can lose which way the person faces; the garment holds
  its last position through a brief loss.
- One person is dressed per picture or frame.
- Video export runs at the speed of the video (a 20-second clip takes 20 seconds) and keeps the sound only where the
  browser allows it. Recording from the camera stops at 60 seconds.
- **Refunds after a payout.** Once money has gone to a tailor's bank, refunding the customer does not pull it back;
  that is settled between the platform and the tailor by hand.
- **Live updates** are polled (about every 6 seconds against the backend), not pushed.
- **Photos** (tailor updates) are stored inline in the database, capped at three small images per update. Move them to
  object storage before volume grows.
- The backend's default database is a SQLite file, fine for development. Use Postgres (`DATABASE_URL`) on a server.

## Backend routes

All under `/api/v1/`. JSON in and out, snake_case on the wire (`api.js` converts). Sign-in is a bearer token
(`Authorization: Bearer …`), refreshed once on a 401. Errors are `{"detail": "…"}`.

```
Accounts      POST auth/register|login|refresh|forgot|reset|verify
              GET/PATCH me     POST me/password     POST me/verify/send     GET me/game     GET me/unread
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
Payouts       GET payouts/banks     GET/PUT me/payout-account     GET me/earnings
Fees          GET/PUT admin/fees   (the two platform rates)     POST admin/users/{id}/fee   (an account's own rate)
              POST webhooks/paystack   (called by Paystack; signature checked)
Try-on        POST designs/{id}/try-on   (Photoreal: start a job)     GET try-on/{id}   (its status and result)
Admin         GET admin/stats|users|vendors|designs|orders|payments|payouts|commissions|reports|messages|applications|audit
              POST admin/users/{id}/status     admin/vendors/{id}/status     admin/orders/{number}/phase
                   admin/orders/{number}/issue     admin/payments/{id}/refund     admin/reports/{id}/resolve
                   admin/payouts/{id}   (mark as sent, or send again)
Other         GET config   (fee, and which of email, payouts and Photoreal are on)     POST contact     GET /healthz
              GET dev/mail   (development only)
```

The server owns the rules: it cleans every design spec against the catalogue, prices, awards XP and streaks, and
decides who may see or change what. `backend/core/rules.py` is a port of the site's engine, and a test holds the two to
identical output on 313 recorded designs. If you change templates, options, pricing or challenges in
`assets/js/engine.js` or `catalog.js`, run `node backend/tools/export_catalog.js` to refresh what the backend reads.

## Where things are

| | |
|---|---|
| `assets/js/config.js` | The one file to edit to go live or tune rendering |
| `assets/js/engine.js`, `catalog.js` | Garment construction and drawing; templates, palettes, options, pricing, challenges |
| `assets/js/viewer3d.js` | The 3D view (three.js, loaded only when opened): the two mannequins, the cloth, and the garment the try-on wears |
| `assets/js/fit.js` | The try-on engine: finds the body and its outline, measures it, shapes and poses the garment on it, moves the cloth |
| `assets/js/tryon.js` | The try-on page: camera, photo, video, fit controls, saving |
| `assets/vendor/` | three.js (a trimmed build) and the MediaPipe library and body models, each with its licence |
| `assets/js/store.js` | Built-in data layer |
| `assets/js/api.js` | The single door to data: built-in or backend, same methods |
| `assets/js/account.js` | Sign-in, nav, shared UI (`FTApp`): cards, sheets, checkout, tabs, 3D mount |
| `assets/js/site.js`, `device.js` | Motion, page transitions, per-device quality |
| `assets/js/<page>.js` | One script per page |
| `assets/css/site.css` | All styles; tokens at the top, the app layer in the second half |
| `_src/` | Page bodies and the shared nav/footer. After editing: `python3 _src/build.py` |
| `backend/core/` | `models.py`, `views.py` (endpoints), `api.py` (shared logic), `rules.py`, `tests.py`; email, payouts and Photoreal are in `extras.py` and `views_extra.py` |
| `tests/` | Data-layer, backend and browser tests (`tests/README.md`) |
| `AUDIT.md` | What was tested, what was found and fixed, what is left |

## Display per device

Every visitor starts on the full experience; `device.js` classes the device before first paint and `site.js` steps the
quality down one level only if that device is dropping frames. People can override it under Graphics in the footer.
Preview any combination with `?render=phone|tablet|laptop|desktop` and `?quality=full|balanced|lite`. Layouts are
fitted for small phones (320px) through large monitors, in both orientations; phones get a bottom tab bar.
