/**
 * Speed check (/speed): times the 3D view on the device in hand, at every picture setting the viewer can step down to,
 * and says which one the site settles on. The numbers can be copied and sent on.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => FT.ready.then(async () => {
    const { $ } = FT, App = window.FTApp, E = window.FTEngine, esc = FT.esc, R = window.FT_RENDER || {};
    const run = $('#spRun'), copy = $('#spCopy'), out = $('#spOut'), err = $('#spErr');
    const t = E.TEMPLATES.find(x => x.id === 'grand-agbada') || E.TEMPLATES[0], spec = E.normalize(t.spec || t);    // the agbada has the most cloth to draw
    let viewer = null, report = '';
    const device = () => [
      ['Device', `${R.device || 'unknown'}${R.lowPower ? ', low-power hardware' : ''}`],
      ['Site graphics level', `${R.quality || 'full'}${R.userChoice ? ' (chosen by hand)' : ''}`],
      ['Screen', `${screen.width}×${screen.height} at ${(devicePixelRatio || 1).toFixed(2)}×`],
      ['Processor cores', navigator.hardwareConcurrency || 'not reported'],
      ['Memory', navigator.deviceMemory ? `${navigator.deviceMemory} GB or more` : 'not reported'],
    ];
    const table = rows => `<div class="kv">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div>`;
    out.innerHTML = table(device());
    try { viewer = await App.viewer($('#spView'), spec, {}); } catch { viewer = null; }
    if (!viewer || viewer.flat) { run.disabled = true; err.textContent = 'This browser cannot show the 3D view, so the site shows the flat drawing here instead. There is nothing to time.'; return; }

    run.addEventListener('click', async () => {
      run.disabled = true; copy.hidden = true; err.textContent = ''; run.textContent = 'Measuring…';
      try {
        const b0 = performance.now(); await viewer.setSpec(spec); const build = Math.round(performance.now() - b0);
        const r = await viewer.benchmark(3), ok = r.steps.find(s => s.ms && s.ms <= r.slow), best = r.steps[0];
        const verdict = !ok ? `Too slow for smooth turning even at the lightest setting (${r.steps[r.steps.length - 1].fps} frames a second). The view still works: it only redraws when it is touched.`
          : ok.step === 1 ? `Smooth at full quality: ${best.fps} frames a second.`
          : `Full quality runs at ${best.fps} frames a second here, so the site steps down to setting ${ok.step} of ${r.steps.length} (${ok.fps} frames a second).`;
        const flat = r.steps.length > 1 && r.steps.every(s => Math.abs(s.ms - best.ms) < best.ms * 0.12) && best.ms > 20;
        const note = flat ? `Every setting ran at about ${best.fps} frames a second, so the picture is not what limits this device. A battery saver holds many phones to 30 frames a second: switch it off and run the check again.` : '';
        const dev = [...device(), ['Graphics chip', r.gpu || 'not reported'], ['Model drawn', `${t.name}: ${(r.triangles / 1000).toFixed(1)}k triangles in ${r.calls} draws`], ['Time to build the garment', `${build} ms`]];
        out.innerHTML = `<p class="speed-verdict">${esc(verdict)}</p>${note ? `<p class="body">${esc(note)}</p>` : ''}
          <div class="table" style="--cols:4"><div class="tr th"><span>Setting</span><span>Picture</span><span>Frames a second</span><span>Slowest frames</span></div>
          ${r.steps.map(s => `<div class="tr"><span data-l="Setting">${s.step} of ${r.steps.length}${ok && s.step === ok.step ? ' <span class="badge ok">used here</span>' : ''}</span><span data-l="Picture">${s.width}×${s.height}, shadow ${s.shadows ? 'on' : 'off'}</span><span data-l="Frames a second">${s.fps} <small class="muted">(${s.ms} ms each)</small></span><span data-l="Slowest frames">${s.p90} ms</span></div>`).join('')}</div>
          ${table(dev)}`;
        report = ['Fashion Teller speed check', new Date().toISOString(), location.origin, navigator.userAgent, '', verdict, note, '',
          ...r.steps.map(s => `Setting ${s.step}: ${s.width}x${s.height}, shadow ${s.shadows ? 'on' : 'off'}: ${s.fps} fps, ${s.ms} ms median, ${s.p90} ms slowest tenth, ${s.frames} frames`), '',
          ...dev.map(([k, v]) => `${k}: ${v}`)].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
        window.FTSpeed = { result: r, report }; copy.hidden = false;
      } catch (e) { console.warn('Fashion Teller speed check:', e); err.textContent = 'The check could not finish on this device.'; }
      run.disabled = false; run.textContent = 'Run it again';
    });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(report); FT.toast ? FT.toast('Results copied') : (copy.textContent = 'Copied'); }
      catch { const ta = document.createElement('textarea'); ta.value = report; ta.className = 'speed-raw'; ta.readOnly = true; ta.setAttribute('aria-label', 'Results'); out.appendChild(ta); ta.focus(); ta.select(); }
    });
  }));
})();
