/** Messages: conversations with designers and tailors. Each one is tied to a person, an order or a commission. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#mgRoot');
    const guard = document.createElement('div'); root.innerHTML = ''; root.appendChild(guard); guard.className = 'wrap'; guard.style.padding = '60px var(--pad)';
    const u = await Acc.require(guard, { title: 'Sign in to see your messages', message: 'Talk to designers and tailors about your designs, commissions and orders.' }); if (!u) return;
    let threads = [], cur = new URLSearchParams(location.search).get('t'), conv = null, timer = null, sending = false; const shown = new Set();
    const KIND = { order: 'Order', commission: 'Commission', direct: '' };
    root.innerHTML = `<h1 class="sr">Messages</h1><div class="msgs${cur ? ' open' : ''}"><aside class="tlist" aria-label="Conversations"><div class="tlist-h"><h2>Messages</h2></div><div id="tRows"><div class="loading sm"><span class="spin"></span></div></div></aside><section class="thread" id="thread" aria-label="Conversation"></section></div>`;
    const rows = $('#tRows'), pane = $('#thread'), shell = $('.msgs');

    function renderList() {
      if (!threads.length) { rows.innerHTML = `<div style="padding:22px 18px"><p class="muted" style="margin:0 0 14px">No conversations yet. Message a designer from their profile, or a tailor from one of your orders.</p><a class="btn ink sm" href="/designers">Find a designer</a></div>`; return; }
      rows.innerHTML = threads.map(t => `<button type="button" class="trow" data-t="${esc(t.id)}" aria-current="${t.id === cur}">${App.avatar(t.other, 44)}<span style="min-width:0">${KIND[t.kind] ? `<span class="k">${KIND[t.kind]}</span>` : ''}<b>${esc(t.kind === 'direct' ? t.other.name : t.title)}</b><small>${t.last ? (t.last.mine ? 'You: ' : '') + esc(t.last.text) : esc(t.other.name)}</small></span><span class="end">${t.last ? App.ago(t.last.at).replace(' ago', '') : ''}${t.unread ? `<span class="n">${t.unread}</span>` : ''}</span></button>`).join('');
    }
    async function loadList() { try { threads = await A.listThreads(); } catch { threads = []; } renderList(); }

    const dayKey = t => new Date(t).toDateString();
    function renderThread(scroll = true) {
      if (!conv) { pane.innerHTML = `<div class="thread-e"><div><div class="ic" style="width:56px;height:56px;border-radius:16px;background:var(--mist);display:grid;place-items:center;margin:0 auto 12px;color:var(--gold-deep)">${App.ICON.chat}</div><p>Choose a conversation.</p></div></div>`; return; }
      const list = $('#chat'), atEnd = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      const draft = $('#cmp')?.value || '', hadFocus = document.activeElement?.id === 'cmp';
      let last = '';
      const items = conv.messages.map(m => { const k = dayKey(m.at), head = k !== last ? `<li class="day">${k === new Date().toDateString() ? 'Today' : App.date(m.at)}</li>` : ''; last = k; return head + (m.system ? `<li class="sys">${esc(m.text)}${m.design ? ` <a class="linkbtn" href="/design?id=${enc(m.design.id)}">View it</a>` : ''}</li>` : `<li class="${m.mine ? 'mine' : ''}${shown.size && !shown.has(m.id) ? ' in' : ''}">${esc(m.text)}${m.design ? `<a class="shared" href="/design?id=${enc(m.design.id)}"><span class="tile-art">${App.art(m.design.spec, { crop: 'template' })}</span><span>${esc(m.design.title)}</span></a>` : ''}<time datetime="${esc(m.at)}">${new Date(m.at).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}</time></li>`); }).join('');
      pane.innerHTML = `<header class="thread-h"><button class="iconbtn plain back" type="button" data-back aria-label="Back to conversations"><svg viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>${App.avatar(conv.other, 40)}<div class="who"><b>${esc(conv.other.name)}</b><small>${conv.kind === 'direct' ? esc([conv.other.city, conv.other.country].filter(Boolean).join(', ')) : esc(conv.title)}</small></div><a class="btn ghost sm" href="${esc(conv.href)}">${conv.kind === 'order' ? 'Order' : conv.kind === 'commission' ? 'Commission' : 'Profile'}</a></header>
        <ol class="chat" id="chat" aria-live="polite">${items || '<li class="sys">Say hello. Keep payments on Fashion Teller so they stay protected.</li>'}</ol>
        <form class="composer" id="composer"><button class="iconbtn plain" type="button" data-attach aria-label="Share one of your designs">${App.ICON.design}</button><label class="sr" for="cmp">Message</label><textarea id="cmp" rows="1" maxlength="2000" placeholder="Write a message"></textarea><button class="send" type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12h13M12 6l6 6-6 6" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>`;
      conv.messages.forEach(m => shown.add(m.id));
      const ta = $('#cmp'); ta.value = draft; if (hadFocus) ta.focus();
      const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight + 2) + 'px'; }; ta.addEventListener('input', grow); grow();
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); $('#composer').requestSubmit(); } });
      const nl = $('#chat'); if (scroll || atEnd) nl.scrollTop = nl.scrollHeight;
    }
    async function open(id, { quiet = false } = {}) {
      if (!id) return;
      let next; try { next = await A.getThread(id); } catch (e) { if (!quiet) { conv = null; cur = null; shell.classList.remove('open'); renderThread(); FT.toast(e.message); } return; }
      const fresh = !conv || conv.id !== next.id, changed = fresh || next.messages.length !== conv.messages.length;
      if (fresh) shown.clear();
      cur = id; conv = next; shell.classList.add('open');
      if (changed) { renderThread(fresh || next.messages[next.messages.length - 1]?.mine); if (!fresh && !quiet) { /* nothing */ } }
      if (fresh) { try { history.replaceState(null, '', '/messages?t=' + enc(id)); } catch {} $$('.trow', rows).forEach(r => r.setAttribute('aria-current', r.dataset.t === id)); }
      if (changed) { loadList(); App.refreshCounts(); }
    }
    rows.addEventListener('click', e => { const r = e.target.closest('[data-t]'); if (r) open(r.dataset.t); });
    pane.addEventListener('click', async e => {
      if (e.target.closest('[data-back]')) { shell.classList.remove('open'); cur = null; conv = null; try { history.replaceState(null, '', '/messages'); } catch {} renderList(); return; }
      if (!e.target.closest('[data-attach]') || !conv) return;
      let mine = []; try { mine = await A.listDesigns(); } catch {}
      if (!mine.length) { FT.toast('Save a design in the studio first, then you can share it here.'); return; }
      const s = App.sheet(`<h3>Share a design</h3><p class="muted">${esc(conv.other.name.split(' ')[0])} will be able to open it.</p><div class="pick">${mine.slice(0, 40).map(d => `<button type="button" data-pick="${esc(d.id)}"><span class="tile-art">${App.art(App.version(d).spec, { crop: 'template' })}</span>${esc(d.title)}</button>`).join('')}</div>`, { wide: true });
      s.addEventListener('click', async ev => { const p = ev.target.closest('[data-pick]'); if (!p) return; App.closeSheet(); try { conv = await A.sendMessage(conv.id, { text: $('#cmp')?.value || '', designId: p.dataset.pick }); const ta = $('#cmp'); if (ta) ta.value = ''; renderThread(true); loadList(); } catch (x) { FT.toast(x.message); } });
    });
    pane.addEventListener('submit', async e => {
      e.preventDefault(); if (sending || !conv) return; const ta = $('#cmp'), text = ta.value.trim(); if (!text) return;
      sending = true; $('.send', pane).disabled = true;
      try { conv = await A.sendMessage(conv.id, { text }); ta.value = ''; renderThread(true); $('#cmp').focus(); loadList(); } catch (x) { FT.toast(x.message); }
      finally { sending = false; const b = $('.send', pane); if (b) b.disabled = false; }
    });
    timer = setInterval(() => { if (document.hidden) return; if (cur) open(cur, { quiet: true }); else loadList(); }, A.pollMs);
    addEventListener('pagehide', () => clearInterval(timer));
    await loadList();
    if (cur) await open(cur); else { renderThread(); if (threads.length && matchMedia('(min-width: 761px)').matches) open(threads[0].id); }
  });
})();
