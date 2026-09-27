(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT;
    const PH = ['AI Concept Generated', 'Vendor Assigned', 'Fabric Sourcing & Tailoring', 'Doorstep Quality Delivery'];
    const trk = $('#phoneTrk');
    const renderTrk = p => {
      trk.innerHTML = PH.map((l, i) => `<div class="p"><div class="r"><i class="${i === 0 ? 'x' : ''} ${i <= p ? 'on' : ''}"></i><b class="${i === p ? 'now' : ''}"><s class="${i <= p ? 'on' : ''}"></s></b><i class="${i === PH.length - 1 ? 'x' : ''} ${i < p ? 'on' : ''}"></i></div><small class="${i <= p ? 'on' : ''}">${l}</small></div>`).join('');
    };
    let cur = -1, th = null;
    const set = p => {
      if (p === cur) return; cur = p;
      renderTrk(p);
      $$('.ov>div').forEach(d => d.classList.toggle('on', +d.dataset.ov === p));
      if (p === 0) { th?.clear(); th = FT.thread($('#phoneThread'), { paths: FT.PATH_EMB, duration: 1800, width: 1.6 }); }
      else if (th) { th.clear(); th = null; }
    };
    set(0);
    await FT.ready;
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) set(+e.target.dataset.phase); }), { rootMargin: '-45% 0px -45% 0px' });
    $$('.hs').forEach(s => io.observe(s));
  });
})();
