(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $ } = FT;
    /* statement lights up word by word as it scrolls through the viewport */
    const st = $('#statement');
    st.innerHTML = st.textContent.split(/(\s+)/).map(w => (/^\s+$/.test(w) ? w : `<span class="dim">${FT.esc(w)}</span>`)).join('');
    const words = [...st.querySelectorAll('.dim')];
    const upd = () => {
      const r = st.getBoundingClientRect(), vh = innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle('lit', i < n));
    };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();

    const form = $('#contactForm');
    FT.form(form, {
      kind: 'contact-messages',
      rules: {
        name: v => (v?.trim() ? '' : 'Enter your name.'),
        email: v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '') ? '' : 'Enter an email we can reply to.'),
        message: v => (v?.trim()?.length >= 10 ? '' : 'Write a little more so we can help.'),
      },
      done: () => { form.hidden = true; $('#contactDone').classList.add('on'); },
    });
  });
})();
