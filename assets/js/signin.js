/**
 * Sign in, create an account, and the three things that arrive by email link:
 *   /signin?forgot=you@example.com   ask for a password reset link
 *   /signin?reset=TOKEN              choose a new password
 *   /signin?verify=TOKEN             confirm an email address
 * In built-in mode there is no mail server; the emails are shown in a demo mailbox instead (FTApp.mailbox).
 */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, esc = FT.esc;
    const qs = new URLSearchParams(location.search);
    const next = qs.get('next') || '';
    const safeNext = /^\/[a-z][a-z0-9\-/?=&%#._]*$/i.test(next) && !next.startsWith('//') ? next : '';
    const home = u => safeNext || (u.role === 'tailor' ? '/workshop' : u.role === 'admin' ? '/admin' : u.designer ? '/commissions' : '/studio');
    const card = $('#authCard');
    const box = () => (A.local ? '<p class="muted" style="font-size:13.5px;margin:14px 0 0">Built-in mode has no mail server. <button class="linkbtn" type="button" data-mailbox>Open the demo mailbox</button> to see the email.</p>' : '');
    card.addEventListener('click', e => { if (e.target.closest('[data-mailbox]')) App.mailbox(); });

    /* confirm an email address */
    if (qs.has('verify')) {
      card.innerHTML = '<div class="signed"><div class="loading"><span class="spin"></span></div></div>';
      try { const r = await A.verifyEmail(qs.get('verify')); const u = A.me(); card.innerHTML = `<div class="signed"><h2 class="h3">Email confirmed</h2><p class="muted">${esc(r.email || '')} is now confirmed. Thank you.</p><div class="row-btns"><a class="btn gold" href="${u ? home(u) : '/signin'}">${u ? 'Continue' : 'Sign in'}</a></div></div>`; }
      catch (x) { card.innerHTML = `<div class="signed"><h2 class="h3">That link did not work</h2><p class="muted">${esc(x.message)}</p><div class="row-btns"><a class="btn gold" href="${A.me() ? '/account' : '/signin'}">${A.me() ? 'Go to your account' : 'Sign in'}</a></div></div>`; }
      return;
    }
    /* choose a new password */
    if (qs.has('reset')) {
      card.innerHTML = `<form class="form auth-form" data-mode="in" id="resetForm" novalidate style="grid-template-columns:1fr"><h2 class="h3" style="margin:0">Choose a new password</h2>
        <div class="field"><label for="rs-new">New password</label><input id="rs-new" name="next" type="password" autocomplete="new-password" minlength="8" maxlength="128"><small class="tip" style="display:block">At least 8 characters.</small></div>
        <div class="field"><label for="rs-new2">Repeat it</label><input id="rs-new2" name="next2" type="password" autocomplete="new-password" maxlength="128"></div>
        <p class="err" role="alert"></p><div class="row-btns"><button class="btn gold" type="submit">Save new password</button></div></form>`;
      const f = $('#resetForm');
      f.addEventListener('submit', async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(f)), err = $('.err', f), btn = $('button[type="submit"]', f); err.textContent = '';
        if (!d.next || d.next.length < 8) { err.textContent = 'Use a password of at least 8 characters.'; return; }
        if (d.next !== d.next2) { err.textContent = 'The two passwords do not match.'; return; }
        btn.disabled = true;
        try { const r = await A.resetPassword(qs.get('reset'), d.next); await A.logout(); card.innerHTML = `<div class="signed"><h2 class="h3">Password changed</h2><p class="muted">Sign in with your new password.</p><div class="row-btns"><a class="btn gold" href="/signin${r.email ? '?email=' + encodeURIComponent(r.email) : ''}">Sign in</a></div></div>`; }
        catch (x) { err.innerHTML = `${esc(x.message)} <a href="/signin?forgot=">Ask for a new link</a>`; btn.disabled = false; }
      });
      FT.ready.then(() => $('#rs-new')?.focus({ preventScroll: true }));
      return;
    }
    /* ask for a reset link */
    if (qs.has('forgot')) {
      card.innerHTML = `<form class="form auth-form" data-mode="in" id="forgotForm" novalidate style="grid-template-columns:1fr"><h2 class="h3" style="margin:0">Reset your password</h2><p class="muted" style="margin:0">Enter the email you signed up with and we will send a link to choose a new one.</p>
        <div class="field"><label for="fg-email">Email</label><input id="fg-email" name="email" type="email" autocomplete="username" inputmode="email" maxlength="120" value="${esc(qs.get('forgot') || '')}"></div>
        <p class="err" role="alert"></p><div class="row-btns"><button class="btn gold" type="submit">Send the link</button><a class="btn ghost" href="/signin">Back to sign in</a></div></form>`;
      const f = $('#forgotForm');
      f.addEventListener('submit', async e => {
        e.preventDefault(); const em = $('#fg-email').value.trim(), err = $('.err', f), btn = $('button[type="submit"]', f); err.textContent = ''; btn.disabled = true;
        try { await A.forgotPassword(em); card.innerHTML = `<div class="signed"><h2 class="h3">Check your inbox</h2><p class="muted">If ${esc(em)} has an account, a link to choose a new password is on its way. It works once, for one hour.</p>${box()}<div class="row-btns"><a class="btn ghost" href="/signin">Back to sign in</a></div></div>`; }
        catch (x) { err.textContent = x.message; btn.disabled = false; }
      });
      FT.ready.then(() => $('#fg-email')?.focus({ preventScroll: true }));
      return;
    }

    const u = A.me();
    if (u) {
      card.innerHTML = `<div class="signed"><h2 class="h3">Signed in as ${esc(u.name)}</h2><p class="muted">${esc(u.email)} · ${esc(u.role)}</p><div class="row-btns"><a class="btn gold" href="${home(u)}">Continue</a><button class="btn ghost" type="button" data-signout>Sign out</button></div></div>`;
      return;
    }
    const mode = qs.get('mode') === 'up' ? 'up' : 'in', role = qs.get('role') === 'tailor' ? 'tailor' : 'customer';
    card.innerHTML = Acc.formHtml({ mode, role, standalone: true });
    Acc.bindForm(card, { mode, role, onDone: user => FT.go(home(user)) });
    if (qs.get('email')) $('#au-email').value = qs.get('email');
    FT.ready.then(() => (qs.get('email') ? $('#au-pass') : $('#au-email'))?.focus({ preventScroll: true }));
  });
})();
