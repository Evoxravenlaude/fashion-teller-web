/**
 * Device detection + graphics quality. Runs synchronously in <head>, before any styling, so the right
 * profile is in place for the first paint.
 *
 * Result on <html>: data-device="phone|tablet|laptop|desktop", data-quality="full|balanced|lite",
 * .lowpower when the hardware looks weak, one flag class per switched-off feature (no-blur, no-cursor, ...),
 * and window.FT_RENDER with the merged settings.
 *
 * Quality is chosen in this order:
 *   1. a person's choice  (localStorage ft.quality: full | balanced | lite)
 *   2. what the frame monitor in site.js settled on last time on this device (ft.quality.auto.<device>)
 *   3. the device profile's `quality`, dropped one level on low-power hardware
 * window.FT_RENDER_APPLY(level) re-merges at runtime (used by the monitor and the Graphics control).
 */
(function (h) {
  h.classList.add('js');
  var C = (window.FT_CONFIG && window.FT_CONFIG.render) || {}, P = C.profiles || {}, Q = C.quality || {};
  var LEVELS = ['lite', 'balanced', 'full'];
  var nav = navigator, conn = nav.connection || {};
  var coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  var shortSide = Math.min(screen.width || 9999, screen.height || 9999, window.innerWidth || 9999, window.innerHeight || 9999);
  var w = Math.min(window.innerWidth || 9999, screen.width || 9999);
  var type = coarse ? (shortSide < (C.phoneMax || 768) ? 'phone' : 'tablet') : (w < (C.laptopMax || 1440) ? 'laptop' : 'desktop');
  var low = (nav.hardwareConcurrency || 8) <= 4 || (nav.deviceMemory || 8) <= 4 || !!conn.saveData;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ?render=phone|tablet|laptop|desktop forces a device profile for this tab; ?render=auto clears it.
  // ?quality=full|balanced|lite previews a level for this tab; ?quality=auto clears it.
  var forced = null, forcedQ = null;
  try {
    var qs = new URLSearchParams(location.search);
    var q = qs.get('render');
    if (q === 'auto') sessionStorage.removeItem('ft.render'); else if (q && P[q]) sessionStorage.setItem('ft.render', q);
    forced = sessionStorage.getItem('ft.render');
    var ql = qs.get('quality');
    if (ql === 'auto') sessionStorage.removeItem('ft.quality.preview'); else if (ql && Q[ql]) sessionStorage.setItem('ft.quality.preview', ql);
    forcedQ = sessionStorage.getItem('ft.quality.preview');
  } catch (e) {}
  if (forced && P[forced]) { type = forced; low = false; }

  function pick() {
    var user = null, auto = null;
    try { user = localStorage.getItem('ft.quality'); auto = localStorage.getItem('ft.quality.auto.' + type); } catch (e) {}
    if (forcedQ) return forcedQ;
    if (user && Q[user]) return user;
    if (auto && Q[auto]) return auto;
    var base = (P[type] && P[type].quality) || 'full';
    if (low) base = LEVELS[Math.max(0, LEVELS.indexOf(base) - 1)];
    return base;
  }

  function apply(level) {
    var R = {}, k;
    for (k in (P[type] || {})) R[k] = P[type][k];
    for (k in (Q[level] || {})) R[k] = Q[level][k];
    if (reduced) { R.thread = false; R.trail = false; R.magnetic = false; R.loader = false; R.wipe = false; R.reveals = false; R.marquee = false; R.cursor = false; }
    R.device = type; R.quality = level; R.lowPower = low; R.forced = !!forced; R.userChoice = false;
    try { R.userChoice = !!localStorage.getItem('ft.quality'); } catch (e) {}
    window.FT_RENDER = R;

    h.setAttribute('data-device', type); h.setAttribute('data-quality', level);
    h.classList.toggle('lowpower', low);
    ['blur', 'cursor', 'trail', 'magnetic', 'loader', 'wipe', 'reveals', 'marquee', 'thread'].forEach(function (f) { h.classList.toggle('no-' + f, R[f] === false); });
    h.classList.toggle('light-shadows', R.shadows === 'light');
    h.classList.toggle('fade-video', R.stageVideoReveal === 'fade');
    return R;
  }
  window.FT_RENDER_APPLY = apply;
  window.FT_QUALITY_LEVELS = LEVELS;
  apply(pick());
  try { if (sessionStorage.getItem('ft.seen') || window.FT_RENDER.loader === false) h.classList.add('seen'); if (sessionStorage.getItem('ft.wipe')) h.classList.add('wiping'); } catch (e) {}
})(document.documentElement);
