(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $ } = FT, A = window.FTApi, Acc = window.FTAccount;
    const qs = new URLSearchParams(location.search);
    const next = qs.get('next') || '';
    const safeNext = /^\/[a-z][a-z0-9\-/?=&%#._]*$/i.test(next) && !next.startsWith('//') ? next : '';
    const home = u => safeNext || (u.role === 'tailor' ? '/workshop' : u.role === 'admin' ? '/admin' : u.designer ? '/commissions' : '/studio');
    const card = $('#authCard');
    const u = A.me();
    if (u) {
      card.innerHTML = `<div class="signed"><h3>Signed in as ${FT.esc(u.name)}</h3><p class="muted">${FT.esc(u.email)} · ${FT.esc(u.role)}</p><div class="row-btns"><a class="btn gold" href="${home(u)}">Continue</a><button class="btn ghost" type="button" data-signout>Sign out</button></div></div>`;
      return;
    }
    card.innerHTML = Acc.formHtml({ mode: qs.get('mode') === 'up' ? 'up' : 'in', role: qs.get('role') === 'tailor' ? 'tailor' : 'customer', standalone: true });
    Acc.bindForm(card, { mode: qs.get('mode') === 'up' ? 'up' : 'in', role: qs.get('role') === 'tailor' ? 'tailor' : 'customer', onDone: user => FT.go(home(user)) });
    FT.ready.then(() => $('#au-email')?.focus({ preventScroll: true }));
  });
})();
