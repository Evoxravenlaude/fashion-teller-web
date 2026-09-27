# Fashion Teller — website

Static multi-page site. No framework, no build step needed to deploy.

    /                 Home: loader, hero with live prompt, phases, tailor comparison demo
    /how-it-works     Scroll story through the four production phases, FAQ
    /studio           The product: describe → generate → refine → choose tailor → track
    /tailors          For tailors: live rank simulator, application form
    /about            Mission, roadmap, contact form
    /404              Not found

## Deploy on Vercel

Drag this folder into vercel.com/new, or from this folder run:

    npx vercel         # preview
    npx vercel --prod  # production

Framework preset: Other. Build command: none. Output directory: the default (this folder).
vercel.json turns on clean URLs (/studio serves studio.html); 404.html is picked up automatically.
.vercelignore keeps _src/ and this README out of the deployment.

Preview locally with clean URLs:  npx serve .

## Going live with the backend

Edit assets/js/config.js only.

- apiBaseUrl empty: the studio runs on sample data (five sample tailors; the order advances one phase every 12s).
- apiBaseUrl set: the studio talks to the Django backend. It asks for sign-in (POST account/login/, SimpleJWT)
  before generating or approving, then uses the routes in the mobile app's docs/API_CONTRACT.md:
  GET design/{id}/, POST design/{id}/refinements/, GET design/{id}/quotes/, POST order/, GET order/{id}/ (polled every 30s).
- One route the contract does not have yet: POST design/ with {"prompt": "..."}, returning the design object.
  The studio's Generate button calls it.
- The backend must allow the Vercel domain in CORS (django-cors-headers, CORS_ALLOWED_ORIGINS).
- formEndpoint empty: tailor applications and contact messages are kept in the visitor's browser only.
  Set it to any JSON POST endpoint (your API, Formspree, a Vercel function) to receive them. The payload includes "kind".

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

Layout is fitted per screen shape: narrow phones, landscape phones (split-screen studio, slim nav),
portrait and landscape tablets (two-column studio from 760px), laptops, and large monitors (bigger type
and spacing from 1800px). Videos load only near the viewport and pause off screen; animations stop when finished.

## Editing

- Styles: assets/css/site.css (one file, tokens at the top). Type is Jost throughout.
- Shared motion (loader, page wipe, gold thread, cursor, magnetic buttons, FLIP lists): assets/js/site.js.
- Nav, menu and footer are shared partials: edit _src/partials/, page bodies in _src/pages/,
  then run  python3 _src/build.py  to regenerate the six HTML files.
- Media: assets/media/ (kaftan loop at 720px and 480px with the CapCut mark cropped out, poster, pre-blurred studio backdrop, marks, favicons, OG image).
