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

## Performance

Phones, tablets, low-core or low-memory devices and data-saver users get a lighter mode (the `lite` class is set in <head>):
no pointer trail or custom cursor, no frosted-glass blur, a 480px video, lower-resolution canvases.
On every device, animations stop when they finish, videos load only near the viewport and pause off screen,
and scroll handlers run at most once per frame. At rest a page does almost no work.

## Editing

- Styles: assets/css/site.css (one file, tokens at the top). Type is Jost throughout.
- Shared motion (loader, page wipe, gold thread, cursor, magnetic buttons, FLIP lists): assets/js/site.js.
- Nav, menu and footer are shared partials: edit _src/partials/, page bodies in _src/pages/,
  then run  python3 _src/build.py  to regenerate the six HTML files.
- Media: assets/media/ (kaftan loop at 720px and 480px with the CapCut mark cropped out, poster, pre-blurred studio backdrop, marks, favicons, OG image).
