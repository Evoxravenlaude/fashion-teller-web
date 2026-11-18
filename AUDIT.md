# Audit

What was checked on this build, what was found and fixed, and what is still open. How to re-run every check is in
`tests/README.md`.

## Result

| Check | Scope | Result |
|---|---|---|
| Data layer | 138 checks on every product flow in built-in mode, including email links, payouts, the adjustable fee and hostile input | 138 pass |
| Backend | 19 tests: rules match the site's engine on 313 recorded designs, every journey, access, payments, production guards, email, Paystack Transfers and its webhook, Photoreal (the last three against stand-ins), fee rates set by an admin and kept per job | 19 pass |
| Customer journey in a browser | Design → 3D → save → into the try-on from the studio and from the design room → quotes → pay → track → confirm → review → message → publish → commission → approve (30 checks) | Pass on desktop and phone (built-in) and against the backend |
| Designer, tailor, admin journeys | Offer (with what the designer receives) and deliver; quote, photo update, deliver; verify, moderate, resolve a problem (26 checks) | Pass built-in and against the backend |
| Email, payouts and the fee in a browser | Confirm an address from the emailed link, forget and reset a password, add bank details, deliver, confirm, payout arrives less the fee; the admin changes the platform rate and gives the tailor an own rate, the tailor sees it (42 checks) | Pass on desktop and phone (built-in) and against the backend |
| Try-on | Photo, video and camera: the garment lands on the body and nowhere else, is shaped to the figure's own outline, forms behind the scan line, shows as light in Hologram view, can be cut for either form; a top leaves the legs alone and trousers start at the waist; every fit control, body points by drag and by keyboard, saved picture and exported video contain the garment, camera switches off ; a photo and a clip with odd dimensions do not freeze the page (37 checks) | Pass at desktop, phone and phone on its side; 42 against the backend with Photoreal |
| Wardrobe | All 13 garment types and 49 templates draw front and back, have a price and build in 3D on both mannequins; the studio's controls fit the garment; the mannequin chosen is kept with the design (12 checks) | Pass on desktop and phone |
| 3D speed handling | The speed-check page; the viewer stepping down on a slow device and remembering it; a hand-picked Graphics level left alone (13 checks) | Pass |
| Every page × every size × every role | 20 pages, signed out and as customer, designer, tailor, admin, at 320, 390, 820, 1366, 1536 and 1920 px wide and a phone on its side: script errors, failed requests, sideways scroll | 0 problems |
| Access between accounts | 123 attempts against the running API: read or change someone else's things, reach tailor or admin routes, change the platform fee or their own rate without being an admin, add bank details without a confirmed email, forge a confirm or reset link, find out which addresses have accounts, post an unsigned payment webhook, crash it with bad input | 123 refused correctly |
| Security headers | Every page under the content security policy, the 3D view and the on-device body tracker included | 0 blocked resources |
| Accessibility | axe-core, WCAG 2.1 A/AA and best practice, every page, tab and role, plus open dialogs, the try-on with a picture up, the speed check, the email-link screens and the bank form with an error | 0 violations, with two accepted exceptions (below) |
| Links | Every link, asset and page path in the 20 pages and the scripts | 0 broken |
| Lint | All 30 site scripts | 0 errors, 0 warnings |
| Django deploy check | `manage.py check --deploy` with production settings | 2 optional HSTS notes (below) |

All browser checks ran in Chromium, with phones and tablets emulated by screen size and touch, and 3D drawn in
software. See "Not covered": the things this round added are exactly the things an emulator says least about.

## Found from the first recording of a real person (seated at a laptop camera)

Until this recording the try-on had only been looked at on a drawn figure standing full length, and on a few
photographs of people standing. A person sitting close to a laptop camera, visible from the head to the waist, is
the most common way anyone will open it, and it had never been tried. The recording was of the build before the last
one; the problems below were in both unless it says otherwise.

1. **The page could freeze for good** (last build only, never live). Asking the body tracker for the person's outline
   stops it dead on a picture whose width is an odd number of pixels, and a stopped tracker never answers again. The
   recording, cut down to the camera picture, happened to be 1181 pixels wide. Pictures are now always an even size,
   and if the tracker ever stops it is started again without the outline and the try-on carries on from the joints
   alone. Both were tested separately; the test suite now includes an odd-sized photo and clip.
2. **The collar stood round the jaw like a neck brace, in torn pieces.** The chest was being tipped towards the camera
   on the tracker's guess at depth, which is a guess outright when the hips are out of the picture. Lean is now
   believed a little when the hips can be seen and not at all when they cannot, and unseen hips are placed where a
   body of ordinary build has them.
3. **Shoulders and neckline sat a hand's breadth too low**, so the wearer's own shoulders showed above the garment.
   The height of everything above the shoulder joints had been set by eye against the drawn figure. On people the
   top of the shoulder is about a sixth of the shoulder width above the joint, and the garment now follows that.
4. **A collar stand was a level ring**, which on a person stands in front of the chin, and the hidden neck was cutting
   into it. It now slopes from the nape to the pit of the throat, is shorter, and only its near half is drawn.
5. **Sleeves and body ballooned** (last build): the wearer's loose clothes were read as a broad body and the garment
   grown to match, up to half as wide again. Narrowing is still believed; widening is limited to about a seventh.
6. **Plain cloth looked like graph paper.** The weave hinted at in the flat drawing is a centimetre across at life
   size. In 3D and on a person it is now drawn several times finer.
7. **A hood stood up behind the head** and **sleeve heads stood above the shoulder line**; both now lie where they do
   on a person.

What this was checked on: the recording itself (in which the old garment is already drawn over the person, so the
body was being read through it), one photograph of a man seated and seen from the waist up, and one of a woman
standing, with shirts, kaftan, T-shirt, hoodie, bomber, joggers and a dress. Neither photograph is part of the project.

## Found and fixed in the round before (wardrobe, mannequins, body-shaped try-on)

Adding trousers, skirts and short tops put parts of the product on show that a long kaftan had always covered. Most
of what follows was found by looking at pictures of the new garments, not by a failing test; the tests were written
afterwards to keep them fixed.

1. **The try-on painted trousers on everyone who tried a top.** The plain trousers a shirt is shown with on the
   mannequin were being drawn on the wearer too, over their own. Only the design is drawn now.
2. **Trousers in 3D looked like briefs worn over leggings.** The seat was a bowl hanging between the legs and each leg
   began with a ledge at the hip. The seat now takes the shape of the two legs as it reaches them, and the mannequin's
   trunk narrows away between the legs instead of ending in a bowl of its own.
3. **A waistband showed its far side inside its near side** on a wearer (two horns at the hips). The waist of trousers
   and skirts is now filled, as it is by the person in them.
4. **The hidden body the garment is fitted round was cutting holes in it**: at the hips of anything close-fitting, and
   beside the neck of anything with a wide neckline. It is narrower in both places.
5. **Sleeve heads stood above the shoulder like pads, and a crease ran across the chest**, most visibly on plain, pale
   garments (T-shirt, hoodie). The try-on draws shoulders lower than the pattern has them; sleeve heads now come down
   with them, and the change in height is a curve, not a corner. In the 3D view a wide sleeve now rests on top of the
   arm with its spare width underneath.
6. **The first cut of the body-shaped fit let the wearer show through.** Where a limb measured wider than the standard
   body, the hidden body grew and the sleeve or trouser leg did not grow enough. Garments are now compared with the
   body in width and in depth, on their tight side, and a width that cannot be read (a chest with the arms against it)
   takes after the ones beside it.
7. **On a phone held sideways the fit controls, now taller, covered the person** and one of the body points. The new
   controls share a row there and the note about the fit is left out.
8. **Hologram view first drew the garment as a flat sheet of light.** It is now see-through cloth with moving lines and
   a rim along every edge.
9. **"Describe it" picked the wrong word** when one garment's name sits inside another's ("shirt" in "sweatshirt"); it
   now takes the longest match.

## Found and fixed in the previous round (try-on, email, payouts, speed)

**Try-on**

1. **The garment trailed the person when they moved.** The body was being found in one camera frame and the garment
   drawn over a later one. Each frame is now captured once, searched, dressed and shown as that same frame.
2. **Cloth tore at the waist in live mode**, and on a slow device it moved in slow motion and hung off to one side.
   The spring that moves loose cloth is now stepped in a way that stays stable at any frame rate, by the real time
   between frames, and swings less the fewer frames there are to show it with.
3. **Thighs came through robes and skirts** in a squat or lunge. Cloth now stays in front of the leg in front and
   behind the leg behind.
4. **The collar floated at chin height.** The mannequin's neck is longer than a person's; the garment now takes its
   neckline from the person.
5. **In a group photo the garment was put on the wrong person.** It dresses whoever fills most of the picture.
6. **With the face hidden, the tracker sometimes swapped front and back for a frame or two and the garment flipped.**
   Nobody turns around between two frames, so a full-width swap is now held off until it lasts.
7. **On a phone held sideways the page was taller than the screen**: the header slid under the site's bar, the fit
   panel ran off the bottom and the garment rail was gone. Landscape now has its own layout, everything in one
   screen, garments down the left and controls down the right.
8. On phones the fit panel covered the picture it was adjusting (now one slider at a time, picked from a row), the
   body points never appeared, and the page content sat off-screen. All three fixed.
9. The download of the body model was sometimes cut off part-way. It is fetched differently now, with a progress bar.
10. **The result sheet said "Nothing was uploaded" under a Photoreal picture**, which is the one case where the photo
    is uploaded. It now says who drew it.

**Email and payouts**

11. **Signing up could fail with a server error** when another account's confirmation email was being logged at the
    same moment (the development database refused the second writer). Writers now queue.
12. **A malformed password-reset request crashed the endpoint** (HTTP 500). Found by the access probe; now a clear
    refusal, with a test.
13. **The development mail log, which lists reset links, could have been switched on in production by one
    setting.** It now cannot exist with debug off, whatever the setting says.
14. **A server with no email provider told members a link was on its way** and would not let a tailor add bank
    details until they clicked it. It now says reset by email is not set up, asks nobody to confirm, and lets bank
    details through.
15. In built-in mode, changing your email address did not pause payouts until the new one was confirmed, as the
    backend does. Aligned.
16. **A payout caught mid-send by a server restart had no safe way out**: sending it again by hand could have paid
    twice. "Check with Paystack" asks Paystack what became of it and sends it only if Paystack never received it,
    under the same reference, which Paystack accepts once.
17. Finished Photoreal pictures were being kept for two days. Now an hour, enough for the page to collect them.

**The platform fee (added after the first delivery of this round)**

18. The fee is now 20% and set by an admin, with an own rate per account. Changing it raised one real risk, now
    closed: if the rate were read at the moment money is released, a tailor who quoted while the hint said "you
    receive ₦48,000" could be paid less after a later increase. Each quote and offer now records its rate, the order
    copies it, and the payout uses it. Tested in both modes, including a change between quote and acceptance.
19. The role journey against the backend failed when run after the payouts journey: it read the timeline of the
    first order in the tailor's list, which was by then a finished one. A test fault, not a product one; the test now
    reads the order it updated.

**Other**

20. A dialog on the try-on skipped a heading level (accessibility). Fixed.
21. The try-on's readout and the speed-check page are new; so is the test media. The tests draw their own stand-in
    figure, so the project ships no photographs of people.

## Found and fixed in the first audit

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
16. Nine unused variables, two settings nothing read at the time (`ai.render3d`, `platformFeePercent`; the fee setting
    is back in this round, now that a fee is taken) and some styles for the
    old turntable removed. The comments in `config.js` described the previous version of the product; rewritten.

## Found and fixed while building the previous version

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

- **Real devices and other browsers.** Nothing was run on an actual phone, in Safari or in Firefox. This matters most
  for what this round added. The live try-on depends on the phone's camera, its graphics chip and how fast it can run
  the body tracker; here it was tested with a pretend camera, at 2 to 7 frames a second in software. It works there,
  which shows the logic is right, not that it is smooth. `/speed` and `?fps=1` exist so that this can be measured on
  real phones in a few minutes; that has not been done.
- **The body-shaped fit on real bodies.** It has been seen on three real people, one of them through an earlier
  garment. Someone in loose clothes is still read as a little broader than they are (the outline is all there is to go
  on); the limits on how far a garment narrows or grows (four fifths to about one and a seventh of the pattern) were
  chosen from those three.
- **Sitting, close to the camera,** is now looked at, on one photograph and one recording. Arms reaching towards the
  camera, leaning far forward, and a phone held at arm's length have not been.
- **The scan and the Hologram view** were judged from still pictures. Their timing and feel in motion on a phone are
  unseen.
- **The new garments in the try-on** were looked at on the stand-in standing, and with joints moved by hand to a raised
  arm, an arm across the body, a stepped leg and a lifted knee. Sitting, turning and walking were not looked at.
- **A real person in front of a real camera.** The automated tests use a drawn stand-in figure. During development the
  try-on was also run on photographs and a video of real people (standing, three-quarter view, squatting, lunging, a
  group), which are not part of the project. It has not been tried across body shapes, loose clothing, headscarves,
  wheelchairs, dim rooms or cluttered backgrounds. The body tracker is Google's; its model card lists where it is
  weaker.
- **Paystack.** No payment, transfer or webhook has touched Paystack. The calls follow Paystack's documentation and
  are tested against stand-ins that return what the documentation says.
- **The email provider.** Messages are built and handed to the mail library in tests; none has been delivered to an
  inbox, so spam placement and how the email looks in Gmail or Outlook are unchecked.
- **The Photoreal service.** The request is built to FASHN's documentation and tested end to end against a stand-in.
  No picture has been made by the real service, so the quality of the result from a flat drawing of the garment is
  unknown.
- **The body-model files** came from a third-party copy, not from Google directly (unreachable from here). See
  `assets/vendor/mediapipe/NOTICE.txt`.
- **Load.** No performance or concurrency testing of the backend. Lists other than Discover return the most recent
  few hundred records rather than pages.
- **Screen readers.** The automated accessibility rules pass; nobody has used the product with VoiceOver or TalkBack.
  The try-on is a visual feature; its controls are labelled and keyboard-operable, the picture itself is not described.

## Open risks to decide on

1. **The platform fee is 20%**, set from the admin dashboard, with an own rate possible for any tailor or designer.
   It has to cover Paystack's charge for taking the payment and for each transfer (about ₦1,100 on a ₦60,000 order,
   of the ₦12,000 kept). Anyone with an admin account can change it, which is one more reason for item 7.
2. **Money held and money paid out are tracked in the database, not in separate bank accounts.** Paystack settles
   takings to your bank by default, while transfers are paid from the Paystack balance. Someone has to keep that
   balance funded, or payouts fail (they show as failed and can be sent again).
3. **A refund after a payout** does not claw the money back from the tailor.
4. **Photoreal sends a customer's photograph to another company.** The page asks first and says so. Their retention
   terms and your privacy notice need to agree before it is switched on.
5. **Sign-in tokens** are kept in the browser's storage and the 30-day refresh token is not revoked on sign-out. The
   content security policy is the main protection. Rotating and revoking refresh tokens is a small backend change.
6. **Built-in mode keeps everything, including password hashes, in the browser.** That is by design for demos; it is
   not a place for real accounts. Set `apiBaseUrl` and `demoAccounts: false` before launch.
7. **Admin accounts have no second factor**, and an admin can now mark payouts as sent.
8. **Emails that fail are logged, not retried.**
