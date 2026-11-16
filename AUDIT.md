# Audit

What was checked on this build, what was found and fixed, and what is still open. How to re-run every check is in
`tests/README.md`.

## Result

| Check | Scope | Result |
|---|---|---|
| Data layer | 80 checks on every product flow in built-in mode, including hostile input | 80 pass |
| Backend | 12 tests: rules match the site's engine on 143 recorded designs, every journey, access, payments, production guards | 12 pass |
| Customer journey in a browser | Design → 3D → save → quotes → pay → track → confirm → review → message → publish → commission → approve (27 checks) | Pass on desktop and phone (built-in) and against the backend |
| Designer, tailor, admin journeys | Offer and deliver; quote, photo update, deliver; verify, moderate, resolve a problem (25 checks) | Pass built-in and against the backend |
| Every page × every size × every role | 18 pages, signed out and as customer, designer, tailor, admin, at 320, 390, 820, 1366, 1536 and 1920 px wide and a phone on its side: script errors, failed requests, sideways scroll | 0 problems |
| Access between accounts | 81 attempts against the running API to read or change someone else's designs, measurements, orders, commissions and conversations, reach tailor or admin routes, or crash it with bad input | 81 refused correctly |
| Security headers | Every page under the content security policy, 3D view included | 0 blocked resources; injected inline script and event handlers are blocked |
| Accessibility | axe-core, WCAG 2.1 A/AA and best practice, every page, every tab and every role, plus open dialogs, popovers, every studio tab and step | 0 violations, with two accepted exceptions (below) |
| Links | Every link, asset and page path in the 18 pages and in the scripts | 0 broken |
| Lint | All site scripts: undefined names, duplicate keys, unreachable code, unused variables | 0 errors, 0 warnings |
| Django deploy check | `manage.py check --deploy` with production settings | 2 optional HSTS notes (below) |

All browser checks ran in Chromium, with phones and tablets emulated by screen size and touch. See "Not covered".

## Found and fixed in the audit

**Backend**

1. **A request body that was a list instead of an object crashed the endpoint** (HTTP 500). Every write endpoint now
   refuses it with a clear 400. Test added.
2. **An upload over the size limit came back as an HTML error page** the site could not read. It is now a JSON 413
   with a message the customer sees. Test added.
3. **Unsafe defaults if deployed without configuration.** Debug mode defaulted to on; with no Paystack key the test
   checkout would have marked real orders as paid; `seed` would have put the demo accounts, including an admin with a
   published password, into a live database; the sample tailors and designers were on. On a server all four are now
   off unless turned on by name (`DJANGO_DEBUG`, `ALLOW_TEST_PAYMENTS`, `seed --demo`, `SAMPLE_MODE`). Local work is
   unchanged. Tests added for the payment and seed guards.
4. The API did not send a clickjacking header. Added.
5. The demo data the backend loads had drifted from the site's (one colour name, payment states on finished orders).
   Re-exported.

**Site: security**

6. **No content security policy.** The site builds most of its interface from data, so a single missed escape would
   have been enough to run injected script. `vercel.json` now sends a policy that allows scripts only from the site
   itself and Paystack, plus `X-Frame-Options` and a permissions policy. The last inline script (404 page) moved to a
   file so the policy needs no exceptions. Checked by injecting an inline script and an `onerror` handler into a live
   page: both were blocked.
7. Links carried inside notifications are now restricted to paths within the site.
8. A scan of the scripts for user-written text placed on the page without escaping found none. Uploaded photos are accepted
   only as JPEG, PNG or WebP data and are re-checked when shown.

**Site: accessibility**

9. The sign-in form carried a tab attribute that is invalid on a form (axe: critical).
10. **Muted text was below the contrast minimum** on tinted backgrounds (4.2:1 against a 4.5:1 minimum; 69
    places on the public pages alone). The muted colour is slightly darker now (4.9:1). Chat timestamps, the count on a liked
    heart and badges not yet earned (2.2:1) had the same problem.
11. Like buttons, design cards and the notification bell announced a name that left out the number shown on them.
    They now read, for example, "Like Ivory grand agbada, 377 likes" and "Notifications, 3 unread". The picture link
    on a card duplicated the title link and is now skipped by screen readers and the Tab key.
12. Headings skipped levels on most pages (footer, design cards, list pages, empty states, workshop, admin). The studio, and an
    open conversation on a phone, had no main heading. Fixed throughout.
13. With reduced motion on, the statement on About stayed grey until scrolled. It now shows in full straight away.

**Site: behaviour**

14. **Admin had nine tabs and four of them (Reports, Users, Designs, Inbox) were off the edge of the screen on
    desktop with nothing to show they existed.** The tabs now have their own row. Any tab strip that has to scroll on
    a small screen fades at the edge with more, and keeps the selected tab in view.
15. **A link to another tab of the page you were already on did nothing** (for example account menu → Designer
    profile while on Account). Tabs now follow the link.
16. Nine unused variables, two settings nothing read (`ai.render3d`, `platformFeePercent`) and some styles for the
    old turntable removed. The comments in `config.js` described the previous version of the product; rewritten.

## Found and fixed while building this version

Listed because each was a visible bug at some point and has a test or a check behind it now.

- 3D: arms showing through wide garments, holes at trouser seams, one sleeve rendered inside out, shirts shown with no
  trousers, hand-drawn fold lines carried into 3D, silk that read as plastic, feet hidden behind the controls.
- A commission delivery ignored a change request when the wish matched a default (for example "long sleeves").
- Unread counts included system lines; every action sent a separate notification. Notifications about the same thing
  now fold into one.
- Every chat bubble re-animated on each refresh.
- In the workshop, adding a photo wiped the update the tailor had typed.
- An admin saw the customer navigation and streak chip.
- Finished sample orders counted as money still held.
- Against the backend, new quotes took 20 seconds to appear (now about 6).
- After "Ask for changes" or paying, a commission page could briefly show the old Approve button.
- Initials sat off-centre in avatars; one seeded design used a colour name the engine did not know.

## Accepted, not changed

- **The gold "Teller" in the wordmark** is below text contrast on white. Logos are exempt from the contrast rule and
  the colour is the brand's.
- **The statement on About** starts grey and lights up word by word as you scroll. It is a reveal, it ends at full
  contrast, and it is shown in full when reduced motion is on.
- **HSTS for subdomains and preload** (the two deploy-check notes) are left off: they affect every subdomain of your
  domain and are yours to switch on.

## Not covered

- **Real devices and other browsers.** Nothing was run on an actual phone, in Safari or in Firefox. Layout was checked
  at phone and tablet sizes in Chromium only. The 3D view was tested on a software renderer, so its speed on low-end
  phones is unmeasured; it falls back to the flat view where WebGL is missing, not where it is slow.
- **A live Paystack payment.** The verification path is tested against a stub, not Paystack. The content security
  policy allows Paystack's script and frame origins as documented; one real test payment will confirm it.
- **Load.** No performance or concurrency testing of the backend. Lists other than Discover return the most recent
  few hundred records rather than pages.
- **Screen readers.** The automated accessibility rules pass; nobody has used the product with VoiceOver or TalkBack.

## Open risks to decide on

1. **Sign-in tokens** are kept in the browser's storage and the 30-day refresh token is not revoked on sign-out. The
   content security policy is the main protection. Rotating and revoking refresh tokens is a small backend change.
2. **No password reset and no email verification.** Anyone can register with any address, and a forgotten password
   needs an admin. This needs an email provider.
3. **No payouts.** Releasing a payment changes a status; it does not move money to the tailor or designer.
4. **Built-in mode keeps everything, including password hashes, in the browser.** That is by design for demos; it is
   not a place for real accounts. Set `apiBaseUrl` and `demoAccounts: false` before launch.
5. **Admin accounts have no second factor.**
