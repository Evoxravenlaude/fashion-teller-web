/**
 * Fashion Teller site configuration. The only file you edit to go live or to tune rendering.
 *
 * apiBaseUrl   empty  -> the whole product runs in the browser: accounts, designs, versions, measurements,
 *                        verified tailors, quotes, orders, payments, tracking and the admin dashboard are
 *                        kept in this browser's storage (see assets/js/store.js). Nothing leaves the device.
 *              set    -> e.g. "https://api.fashionteller.com"; every call goes to the Django backend
 *                        (routes in README.md). The backend must allow this site's origin in CORS.
 * formEndpoint empty  -> contact messages and tailor applications are kept in the browser (and shown in Admin)
 *              set    -> any endpoint that accepts a JSON POST; they are also sent there
 * currency     Prices are quoted and paid in Nigerian naira.
 * payments     paystackPublicKey empty -> the built-in test checkout (card or bank transfer) completes payments
 *              in the browser. Set a Paystack public key (pk_test_… or pk_live_…) to take real payments with
 *              Paystack inline; the backend verifies the reference (see README).
 * ai           Optional AI services on the backend: render3d (photoreal 3D of a design) and tryOn (fits the design to
 *              the user's photo). Without a backend the studio uses its live 3D turntable and a manual try-on fit.
 * demoAccounts true   -> the sign-in page offers one-tap demo accounts (customer, tailor, admin). Set false in production.
 * sample       Pace of the built-in simulation while apiBaseUrl is empty: how quickly verified tailors
 *              quote on a new request, and how fast a sample tailor moves an order through production.
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
  payments: { paystackPublicKey: '', depositPercent: 50, platformFeePercent: 0 },
  ai: { render3d: true, tryOn: true },
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
