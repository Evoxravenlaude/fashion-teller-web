"""The 3D viewer's speed handling: the speed-check page, the automatic step-down on a slow device, and the rule that
a person's own Graphics choice is left alone. Slowness is produced with Chromium's CPU throttle.
Note: these browsers draw 3D in software, so the frame rates printed here say nothing about a real phone. /speed does."""
import sys, json
from playwright.sync_api import sync_playwright
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'phone'
passed = failed = 0
def check(ok, label):
    global passed, failed
    if ok: passed += 1
    else: failed += 1; print('  FAIL', label)

MOUNT = """
  const host = document.createElement('div'); host.id = 'spTest'; host.className = 'v3d'; host.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:400px;z-index:99';
  document.body.appendChild(host); const t = FTEngine.TEMPLATES.find(x => x.id === 'grand-agbada');
  window.__v = await FT3D.mount(host, { spin: true, spec: FTEngine.normalize(t.spec || t) }); return __v.info();
"""
with sync_playwright() as p:
    # 1. the speed-check page
    s = Session(p, size, gl=True); pg = s.page
    s.go('/speed', 1500); pg.wait_for_selector('#spView.ready', timeout=60000)
    pg.click('#spRun'); pg.wait_for_function('() => window.FTSpeed', timeout=90000)
    r = s.js('return FTSpeed.result'); st = r['steps']
    check(len(st) == 4 and all(x['frames'] >= 3 and x['fps'] > 0 for x in st), 'every setting is timed')
    check(all(a['width'] > b['width'] for a, b in zip(st, st[1:])), 'each setting draws fewer pixels than the one before')
    check(st[0]['shadows'] and not st[-1]['shadows'], 'the lighter settings drop the cast shadow')
    check(pg.is_visible('.speed-verdict') and len(pg.inner_text('.speed-verdict')) > 20 and pg.is_visible('#spCopy'), 'a plain verdict and a copy button are shown')
    check('Setting 4' in s.js('return FTSpeed.report') and 'Graphics chip' in s.js('return FTSpeed.report'), 'the report lists every setting and the device')
    check(not s.overflow()['bad'], 'the page fits the screen'); check(not s.errors, f'no page errors {s.errors[:2]}')
    pg.screenshot(path=f'shots/speed-{size}.png'); print('  measured here (software drawing):', ', '.join(f"{x['width']}x{x['height']} {x['fps']} fps" for x in st))
    s.close()

    # 2. a device that cannot keep up: the viewer steps down by itself and remembers it
    s = Session(p, size, gl=True); pg = s.page; s.go('/speed', 800)
    cdp = pg.context.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 3})
    i0 = s.js(MOUNT); check(i0['step'] == 0 and not i0['fixed'], 'starts at full quality')
    try: pg.wait_for_function('() => { const i = __v.info(); return i.step > 0 && localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith("ft.3d.step.")) || "x"); }', timeout=60000); stepped = True
    except Exception: stepped = False
    i1 = s.js('return __v.info()'); kept = s.js('const k = Object.keys(localStorage).find(k => k.startsWith("ft.3d.step.")); return k ? JSON.parse(localStorage.getItem(k)) : null')
    check(stepped and i1['pixelRatio'] < i0['pixelRatio'], f"a slow device steps the picture down ({i0['pixelRatio']} to {i1['pixelRatio']}, {i1['ms']} ms a frame)")
    check(bool(kept) and kept['t'] >= 1, 'the step is remembered for this kind of device')
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1})
    s.go('/speed', 800); i2 = s.js(MOUNT); check(i2['step'] == (kept or {}).get('t'), 'the next visit starts from the remembered step')
    # 3. a person's own Graphics choice is left alone
    s.js("localStorage.setItem('ft.quality', 'full')"); s.go('/speed', 800); cdp = pg.context.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 3})
    i3 = s.js(MOUNT); pg.wait_for_timeout(9000); i4 = s.js('return __v.info()')
    check(i3['step'] == 0 and i4['step'] == 0 and i4['fixed'], 'a Graphics level chosen by hand is never overridden')
    check(not s.errors, f'no page errors {s.errors[:2]}')
    s.close()
print(f'3D speed [{size}]: {passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
