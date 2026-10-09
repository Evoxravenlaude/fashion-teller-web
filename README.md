# Fashion Teller — website + product

Static multi-page site. No framework, no build step needed to deploy. The whole MVP runs in the browser
until the Django backend is connected; the same pages then talk to the API without changes.

**Product principle:** the customer designs the garment themselves, the way you build an avatar on Snapchat:
start from a template, swap parts, pick colours from palettes made for that style and fabric, and sketch details with a
finger. AI is optional and only helps you *see* the design: a 3D render and fitting it to your own photo (plus an
optional "Describe it" assist). Streaks, XP, levels, badges and a daily challenge bring people back every day.

    /                 Home: loader, hero with live prompt, phases, tailor comparison demo
    /how-it-works     Scroll story through the four production phases, FAQ
    /studio           The product: Design → See it (3D + try-on) → Measure → Tailors → Pay → Track
    /signin           Sign in / create account (customer or tailor), demo accounts
    /designs          My studio: streak, level, daily challenge, badges, and every design with all its versions
    /orders           Orders list and order detail with live tracker and tailor updates
    /account          Profile, measurement profiles, password
    /workshop         The tailor's dashboard: requests to quote, quotes sent, orders to run, profile
    /admin            Operations: stats, tailor verification, orders, payments, users, designs, inbox
    /tailors          For tailors: live rank simulator, application form (creates the tailor account)
    /about            Mission, roadmap, contact form
    /404              Not found

## What is built (MVP)

| System | Where | Notes |
|---|---|---|
| User accounts | `account.js`, `/signin`, `/account` | Sign up / sign in / sign out, roles customer · tailor · admin, profile, password change. Passwords salted + PBKDF2-hashed before storage. Account menu in the nav on every page. |
| Design builder | `engine.js`, studio step 1 | 15 templates across kaftan, agbada, boubou, dress, suit and shirt. Tabs for Style, Colours, Fabric (10 textures + 9 patterns incl. Ankara, Kente, Adire, aso-oke stripe), Collar (per style), Sleeves (+ puff), Length, Fit, Embroidery (placement, weight, thread colour), Details (pockets, buttons, belt, notes for the tailor). Every option is a live thumbnail of *your* design with that option. Undo / redo, "Surprise me". |
| Colour palettes | `engine.js` `E.palettes` | Each fabric texture has its own palettes (e.g. Lagos Market for Ankara, Royal Owambe for aso-oke, Bridal Lace) and each style adds one (Senator Classics, Grand Occasion…). Main colour + accent swatches, plus a custom colour picker. |
| Sketch layer | studio → Sketch tab | Draw on the garment with a finger or mouse; thread colours from the palette, three brush sizes, Mirror (draws both sides), Stay on the garment (clips to the garment), undo stroke, clear. Strokes are saved in the version and shown to the tailor. |
| See it (AI optional) | studio step 2 | **3D view**: drag-to-turn turnaround with a real back view, front/back/spin. **Try it on**: upload a photo or take a selfie, drag / pinch / tilt the garment onto you, save or share the look as a PNG. The photo never leaves the device in built-in mode. With the backend, "Photoreal 3D render" and "Fit to my body" call the AI service. |
| Describe it (AI assist) | studio builder bar | Optional: a sentence sets the parts, which the user then adjusts. |
| Streaks + rewards | `store.js` game, nav chip, My studio | A day counts when you save a design or version. XP for new designs (+20), versions (+10, capped daily), streak days (+15), daily challenge (+50), badges (+25), orders (+100). 7 levels from Apprentice to Couturier, 10 badges, 7-day strip, streak-at-risk pulse in the nav. 14 rotating daily challenges that load a template or open the right tab. |
| Design saving | Save button, `/designs` | Designing works signed-out; saving asks for a free account. Rename, duplicate, delete (orders keep their design). Unsaved work survives a reload. |
| Design versions | Stage strip, See it → Versions | Every save is a version with an automatic change list ("Collar → mandarin, Sketch +3 strokes"). Tap any version to keep designing from it. Editing a design that is in production saves a new design. |
| User measurements | Studio step 3, `/account#measurements` | Named profiles (Me, Dad…), cm/inch with conversion, size presets S–XL, per-field measuring tips, fit preference, notes. Chest + waist required. |
| Vendor profiles | Quote cards, workshop | Workshop name, city, specialties, bio, rating, orders made, since-year, verification date. Profile sheet from any quote. |
| Vendor verification | `/tailors#apply` → `/admin#tailors` | Application creates a tailor account + workshop in `pending`. Admin verifies / rejects / suspends. Only verified workshops see requests and can quote. |
| Quote comparison | Studio step 4 | Production request goes to verified tailors; quotes arrive live (polled), sort by best match / price / fastest / rating, tags, tailor note, profile. |
| Production request | Studio step 3 | Design version + measurement profile + notes + optional deadline. Re-requesting withdraws old quotes. |
| Basic order tracking | Studio step 6, `/orders` | Four phases (Design created → Vendor assigned → Tailoring → Delivered) + a dated feed of tailor updates. Customer, tailor and admin all see the same order. |
| Admin dashboard | `/admin` | KPIs, orders by phase, audit trail, tailor verification, order phase override / cancel, refunds, user suspension, designs, contact messages + applications. |
| Naira pricing | `api.js` `money()` | Everything is quoted, paid and reported in ₦. The engine prices from garment × fabric × embroidery × workshop factor. |
| Basic payment flow | Studio step 5 | Pay in full or 50% deposit with the balance on delivery. Card (formatted, Luhn-checked) or bank transfer; Paystack inline when a public key is set. Payment is held and released on delivery. |

Tailor side: `/workshop` lists open requests with the concept, version history, measurements and customer notes, a suggested
price, and a quote form. Accepted quotes become orders the tailor advances (start tailoring, post updates, mark delivered).

Two tabs in the same browser see each other live (customer in one, tailor in the other) — the built-in data layer
mirrors itself across tabs.

## Demo accounts (built-in mode)

Available on `/signin` while `demoAccounts: true` in `assets/js/config.js`. Password for all three: `fashion2026`.

- Customer — `customer@demo.fashionteller`
- Tailor — `tailor@demo.fashionteller` (verified workshop "Bakare Atelier"; its quotes are the ones you write yourself)
- Admin — `admin@demo.fashionteller` (one tailor application is waiting to be verified)

The demo customer has a 4-day streak that is "at risk" (save something to keep it), a level and some badges.

Sample tailors (Luxe Ankara Hubs, Kano Embroidery Works, …) quote automatically a few seconds after a request and move
orders through production on a timer (`sample.orderPhaseMs`). Test card: any Luhn-valid number, e.g. `4084 0840 8408 4081`;
CVV `000` simulates a decline.

To start the built-in data from scratch, run `FTStore.reset()` in the browser console (or clear site data).

## Deploy on Vercel

Drag this folder into vercel.com/new, or from this folder run:

    npx vercel         # preview
    npx vercel --prod  # production

Framework preset: Other. Build command: none. Output directory: the default (this folder).
vercel.json turns on clean URLs (/studio serves studio.html); 404.html is picked up automatically.
.vercelignore keeps _src/ and this README out of the deployment.

Preview locally with clean URLs:  npx serve .

## Going live with the backend

Edit `assets/js/config.js` only.

- `apiBaseUrl` empty: everything runs in the browser (`assets/js/store.js`). Set it (e.g. `https://api.fashionteller.com`)
  and every call in `assets/js/api.js` goes to the Django backend with SimpleJWT (bearer token, one refresh on 401).
  The backend must allow this site's origin in CORS (django-cors-headers, `CORS_ALLOWED_ORIGINS`).
- `payments.paystackPublicKey`: set a Paystack key to take real payments. The studio opens Paystack inline with the
  reference from `POST order/{id}/payments/init/`; on success it calls `POST order/{id}/payments/` with that reference
  and the backend verifies it with Paystack before recording the payment.
- `formEndpoint`: optional JSON POST endpoint that also receives contact messages and tailor applications.
- `ai.render3d` / `ai.tryOn`: turn the optional AI buttons on or off once the backend serves those routes.
- `demoAccounts: false` in production.

### Routes the pages call (prefix `/api/v1`)

Wire shapes are snake_case; `api.js` adapts them. Routes from the mobile app's `docs/API_CONTRACT.md` are kept;
the rest are the additions the MVP needs.

```
Accounts
POST account/register/            {name,email,password,role,phone,city,country} -> {access,refresh,user}
POST account/login/               {email,password} -> {access,refresh,user}
POST account/token/refresh/       {refresh} -> {access}
GET  account/me/   PATCH account/me/   POST account/password/ {current_password,new_password}
GET/POST account/measurements/    PATCH/DELETE account/measurements/{id}/
                                  {label,unit,values:{chest,waist,...},fit,notes}
Designs + versions
POST design/                      {spec,title,source:'builder'|'ai',prompt?,hints?} -> design (+ reward)
POST design/{id}/versions/        {spec,label,from_version} -> design at its new version (+ reward)
GET  account/game/                {xp,level,title,from,to,streak,best,doneToday,atRisk,week[],badges[],challenge{id,title,text,done}}
POST design/{id}/render-3d/       AI (optional) -> {video_url|image_url} or queued
POST design/{id}/try-on/          AI (optional) {image: data URL} -> {x,y,width,rotation} (placement, % of frame) or {image_url}
  spec = {garment,fabric,pattern,color,accent,palette,customColor,collar,sleeves,puff,length,fit,embroidery,density,
          pockets,buttons,belt,notes[],sketch:[{c,w,p:[x,y,…],m}],sketchClip,template}   (sketch points in a 720×1150 frame)
  reward = {xp,lines[],streak,streakUp,challenge,badges[],levelUp}   — the server owns XP/streak rules in production
GET  design/                      list for the signed-in user
GET  design/{id}/  PATCH design/{id}/ {title}  DELETE design/{id}/
POST design/{id}/refinements/     {instruction,spec,changes,noted} -> design at its new version
POST design/{id}/versions/{n}/restore/   POST design/{id}/duplicate/
  design = {id,user_id,title,prompt,hints,current_version,status,versions:[{n,instruction,spec,changes,noted,from_version,created_at}]}
  (a design with only `refinements:[{instruction}]` from the v1 contract is rebuilt into versions client-side)
Requests + quotes
POST design/{id}/requests/        {measurement_id,notes,deadline} -> request
GET  design/{id}/requests/latest/
GET  design/{id}/quotes/          [{id,request_id,design_id,vendor_id,vendor,price,delivery_days,note,includes_fabric,status,valid_until}]
Vendors
GET  vendor/  GET vendor/{id}/  GET vendor/me/  PATCH vendor/me/
POST vendor/apply/                application form (+password when not signed in) -> {vendor,access?,refresh?,user?}
GET  vendor/requests/             open requests for the signed-in verified tailor (design, customer, measurement, suggested, my_quote)
POST vendor/requests/{id}/quote/  {price,delivery_days,note,includes_fabric}
GET  vendor/quotes/   GET vendor/orders/   POST vendor/orders/{id}/events/ {phase?,title,body}
Orders + payments
POST order/                       {quote_id,plan:'full'|'deposit'} -> order (status awaiting_payment)
GET  order/   GET order/{id}/   POST order/{id}/cancel/
POST order/{id}/payments/init/    {kind} -> {reference,amount}
POST order/{id}/payments/         {method,kind,reference} -> {payment,order}
  order = {id,user_id,vendor_id,vendor,design_id,design,version,quote_id,measurement_id,measurement,total,paid,plan,
           phase: concept_generated|vendor_assigned|tailoring|delivered, status: awaiting_payment|active|balance_due|delivered|cancelled,
           events:[{created_at,phase,title,body,by}],eta,delivery_days,created_at,paid_at,delivered_at}
Admin (staff only)
GET admin/stats/  admin/users/  admin/vendors/  admin/designs/  admin/orders/  admin/payments/  admin/messages/  admin/applications/  admin/audit/
POST admin/vendors/{id}/status/ {status}   POST admin/users/{id}/status/ {status}
POST admin/orders/{id}/phase/ {phase|'cancelled',note}   POST admin/payments/{id}/refund/
Contact
POST contact/                     {name,email,topic,message}
```

## Display and rendering per device

Every visitor starts on the full experience. Before the first paint, `assets/js/device.js` classes the
device (phone / tablet / laptop / desktop, from touch and screen size) and sets `html[data-device]`,
`html[data-quality]` and feature-flag classes. Then `site.js` measures real frame times on that device
(first seconds, then on every scroll) and steps the quality down one level, once, only if frames are
being dropped. The result is remembered per device type. There are three levels:

- full: everything (frosted-glass nav, gold cursor, magnetic buttons, self-drawing thread over the hero, full shadows)
- balanced: solid nav, thread follows a mouse only, lighter shadows, smaller canvases
- lite: no cursor/thread/magnetic effects, 480px video, cheapest canvases

People can override under Graphics (menu on phones, footer everywhere): Auto / Full / Balanced / Lite.
All of it is tuned in `assets/js/config.js` -> `render` (profiles, quality levels, monitor thresholds).

Preview any combination in the browser: `?render=phone|tablet|laptop|desktop` and `?quality=full|balanced|lite`
(each sticks for the tab; `=auto` clears it).

Layout is fitted per screen shape: narrow phones (stepper collapses to numbers, forms go single-column, tables become
stacked cards), landscape phones (split-screen studio, slim nav), portrait and landscape tablets (two-column studio from
760px), laptops, and large monitors (bigger type and spacing from 1800px). Concepts are SVG so they stay sharp at any
pixel density. Touch targets grow on coarse pointers. Videos load only near the viewport and pause off screen.

## Editing

- Styles: `assets/css/site.css` (one file, tokens at the top; product systems in the second half). Type is Jost throughout.
- Shared motion (loader, page wipe, gold thread, cursor, magnetic buttons, FLIP lists): `assets/js/site.js`.
- Accounts, route guards, shared sheets and helpers (`FTAccount`, `FTApp`): `assets/js/account.js`.
- Design engine and builder catalogue (render, templates, palettes, options, sketch, challenges, pricing, optional prompt parsing): `assets/js/engine.js`. Add a template or palette there and it appears in the builder.
- Built-in data layer: `assets/js/store.js`. API facade: `assets/js/api.js`.
- Nav, menu and footer are shared partials: edit `_src/partials/`, page bodies in `_src/pages/`,
  then run `python3 _src/build.py` to regenerate the HTML files.
- Media: `assets/media/` (kaftan loop at 720px and 480px, poster, pre-blurred studio backdrop, marks, favicons, OG image).
