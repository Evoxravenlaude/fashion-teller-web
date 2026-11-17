/**
 * Fashion Teller site configuration. The only file you edit to go live or to tune rendering.
 *
 * apiBaseUrl   empty  -> built-in mode: the whole product runs in this browser (assets/js/store.js). Accounts,
 *                        designs, Discover, designers, commissions, messages, tailors, quotes, orders, payments,
 *                        tracking and admin all work, kept in this browser's storage. Nothing leaves the device,
 *                        so two people on two phones do not see each other. Good for demos and for building UI.
 *              set    -> e.g. "https://api.fashionteller.com": every call goes to the Django backend in /backend
 *                        (setup in README.md). The backend must list this site's origin in CORS_ORIGINS.
 *                        On localhost you can also try a backend without editing this file: open any page
 *                        with ?api=http://127.0.0.1:8000 (kept for the tab; ?api= clears it).
 * formEndpoint empty  -> contact messages and tailor applications are kept with the rest of the data (shown in Admin)
 *              set    -> any endpoint that accepts a JSON POST; they are also sent there
 * currency     Prices are quoted and paid in Nigerian naira.
 * payments     paystackPublicKey empty -> the built-in test checkout (test card or bank transfer) completes payments
 *              without moving money. Set a Paystack public key (pk_test_… or pk_live_…) to pay with Paystack;
 *              the backend then verifies every payment with Paystack before recording it (PAYSTACK_SECRET_KEY).
 *              depositPercent is the share paid up front on a tailoring order; the rest is due before delivery.
 *              platformFeePercent is what Fashion Teller keeps when a payment is released to a tailor or designer:
 *              the starting rate. An admin changes it in the dashboard (Admin → Payouts), with separate rates for
 *              tailor orders and designer commissions and an own rate for any account. This number applies in
 *              built-in mode; with the backend connected, the backend's rates are used (PLATFORM_FEE_PERCENT there).
 * tryOn        Try it on (/try-on) finds the body on the device itself, so nothing is uploaded and there is nothing
 *              to switch on. model: 'lite' is quicker, 'full' is steadier, 'auto' picks lite on phones and tablets.
 *              delegate: 'GPU' (falls back by itself) or 'CPU'. Photoreal try-on is separate: it appears by itself
 *              when the backend has an AI service connected (README: Photoreal try-on).
 *              The 3D view needs no service either: it is drawn live in the browser from the design itself.
 * demoAccounts true   -> the sign-in page offers one-tap demo accounts (customer, designer, tailor, admin).
 *                        Set false before launch.
 * sample       Pace of the built-in sample tailors and designers while apiBaseUrl is empty: how quickly they quote
 *              on a new request, and how fast an order moves through production. (The backend has its own
 *              SAMPLE_MODE settings.)
 *
 * render       Display and rendering settings per device type. The device is detected before the
 *              page draws (see assets/js/device.js): phone / tablet / laptop / desktop; weak hardware starts one
 *              quality level lower. To preview a profile on any device open the site with ?render=phone
 *              (or tablet, laptop, desktop); it sticks for the tab. ?render=auto clears it.
 *
 *              Profiles set the starting quality; `quality` holds the three levels (full, balanced,
 *              lite); `monitor` steps a device down a level when it drops frames. Preview any level
 *              on any device with ?quality=lite (or balanced, full); ?quality=auto clears it.
 */
window.FT_CONFIG = {
  apiBaseUrl: '',
  apiPrefix: '/api/v1',
  formEndpoint: '',

  currency: { code: 'NGN', symbol: '₦', locale: 'en-NG' },
  payments: { paystackPublicKey: '', depositPercent: 50, platformFeePercent: 20 },
  tryOn: { model: 'auto', delegate: 'GPU' },
  demoAccounts: true,
  sample: { quoteDelayMs: [1800, 9000], orderPhaseMs: 30000 },

  render: {
    /* Breakpoints used to tell device types apart (CSS pixels, viewport width). Touch screens
       narrower than `phoneMax` are phones; wider touch screens are tablets. Mouse-driven screens
       narrower than `laptopMax` are laptops; wider are desktops. */
    phoneMax: 768,
    laptopMax: 1440,

    /* One profile per device type. Every device starts on the quality named here; the frame monitor
       in site.js watches real frame times on the actual hardware and steps down a level only if
       frames are being dropped (remembered per device type). People can override under Graphics
       in the menu. `video: 'auto'` picks the 720 or 480 encode from the size the video is drawn at. */
    profiles: {
      phone:   { quality: 'full', video: 'auto', canvasDpr: 1.5, sparks: 80,  linger: 1800, stageVideoReveal: 'fade' },
      tablet:  { quality: 'full', video: 'auto', canvasDpr: 1.5, sparks: 100, linger: 2200, stageVideoReveal: 'clip' },
      laptop:  { quality: 'full', video: 720,    canvasDpr: 1.5, sparks: 100, linger: 2200, stageVideoReveal: 'clip' },
      desktop: { quality: 'full', video: 720,    canvasDpr: 2,   sparks: 140, linger: 2800, stageVideoReveal: 'clip' },
    },

    /* Quality levels, applied on top of the device profile. `full` is the complete experience.
       Keys: loader, wipe, thread, reveals, marquee (true/false); trail ('idle' draws itself over the
       hero when nothing moves, 'pointer' follows a mouse only, false); cursor, magnetic (mouse only);
       blur (frosted-glass nav); shadows ('full'|'light'); canvasDpr, sparks, linger; video (720|480|'auto');
       stageVideoReveal ('clip'|'fade'). */
    quality: {
      full:     { loader: true, wipe: true, thread: true, reveals: true, marquee: true, trail: 'idle', cursor: true, magnetic: true, blur: true, shadows: 'full' },
      balanced: { loader: true, wipe: true, thread: true, reveals: true, marquee: true, trail: 'pointer', cursor: true, magnetic: true, blur: false, shadows: 'light', canvasDpr: 1.25, sparks: 50, linger: 1000, stageVideoReveal: 'fade' },
      lite:     { loader: true, wipe: true, thread: true, reveals: true, marquee: true, trail: false, cursor: false, magnetic: false, blur: false, shadows: 'light', canvasDpr: 1, sparks: 24, linger: 500, video: 480, stageVideoReveal: 'fade' },
    },

    /* Frame monitor. It samples frame times during the first seconds and on every scroll; when more
       than `dropRatio` of frames take over `dropFactor` × the display's own frame time, or the display
       cannot hold 40fps, the quality steps down one level. Set enabled:false to keep profiles fixed. */
    monitor: { enabled: true, dropRatio: 0.18, dropFactor: 2.4 },
  },
};
