"""The try-on page: a photo, a video and the camera, the fit controls, the body points, and what gets saved.

No photos of people are needed. The test draws its own stand-in (the site's mannequin in a shirt, in front of a plain
wall), and the on-device body tracker finds it the way it finds a person. From that one picture it also makes a short
video and the feed for Chromium's pretend camera.

  python3 tryon.py [phone|desktop]
  FT_BASE=http://localhost:8788 FT_REMOTE=1 FT_API=http://127.0.0.1:8000 python3 tryon.py     also checks Photoreal, against a
      stand-in for the AI service that this test starts on port 8799. Start the backend with
      FASHN_API_KEY=test FASHN_API_URL=http://127.0.0.1:8799 for that part; without them it is skipped."""
import sys, os, json, base64, threading, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from playwright.sync_api import sync_playwright
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
REMOTE = os.environ.get('FT_REMOTE') == '1'; API = os.environ.get('FT_API', 'http://127.0.0.1:8000')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'); os.makedirs(OUT, exist_ok=True)
QUIET = IGNORE + ('XNNPACK', 'willReadFrequently')
DRAFT = {'spec': {'garment': 'kaftan', 'color': 'emerald', 'fabric': 'cotton', 'length': 'knee', 'sleeves': 'long', 'embroidery': 'none'}}   # plain green: nothing else in the picture is green
passed = failed = 0
def check(ok, label):
    global passed, failed
    if ok: passed += 1
    else: failed += 1; print('  FAIL', label)

def open_browser(p, cam=None):
    w, h, touch = SIZES[size]
    args = GL + ['--autoplay-policy=no-user-gesture-required'] + (['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', f'--use-file-for-fake-video-capture={cam}'] if cam else [])
    b = p.chromium.launch(args=args); ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch and w < 900, device_scale_factor=1, permissions=['camera'] if cam else [])
    ctx.add_init_script("try{sessionStorage.setItem('ft.seen','1');localStorage.setItem('ft.draft'," + json.dumps(json.dumps(DRAFT)) + ")}catch(e){}")
    pg = ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' and not any(x in m.text for x in QUIET) else None)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:300]))
    return b, pg, errs
js = lambda pg, body: pg.evaluate('async () => { ' + body + ' }')

# ── the stand-in, drawn by the site itself
MAKE = """
  const host = document.createElement('div'); host.className = 'v3d'; host.style.cssText = 'position:fixed;left:0;top:0;width:480px;height:640px;z-index:99'; document.body.appendChild(host);
  const t = FTEngine.TEMPLATES.find(x => x.id === 'classic-shirt'), v = await FT3D.mount(host, { yaw: 0, adapt: false, spec: FTEngine.normalize(t.spec || t) });
  v.setTone(1); await new Promise(r => setTimeout(r, 400)); const bare = new Image(); bare.src = v.snapshot(); await bare.decode(); v.dispose(); host.remove();
  // the mannequin's head is a plain egg, and a body tracker tells front from back by the face: draw one on
  const fig = document.createElement('canvas'); fig.width = 960; fig.height = 1280; { const x = fig.getContext('2d'); x.drawImage(bare, 0, 0, 960, 1280); x.translate(480, 158);
    x.fillStyle = '#f4efe6'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 17, -8, 8, 5, 0, 0, 7); x.fill(); }
    x.fillStyle = '#1a1210'; for (const s of [-1, 1]) { x.beginPath(); x.arc(s * 17, -8, 3.6, 0, 7); x.fill(); x.fillRect(s * 17 - 10, -20, 20, 3.5); }
    x.strokeStyle = '#3a211a'; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, -4); x.lineTo(-4, 14); x.lineTo(3, 15); x.stroke();
    x.strokeStyle = '#7a2f2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(-13, 32); x.quadraticCurveTo(0, 39, 13, 32); x.stroke();
    x.fillStyle = '#4a2c20'; for (const s of [-1, 1]) { x.beginPath(); x.ellipse(s * 42, 0, 5, 12, 0, 0, 7); x.fill(); } }
  const wall = (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#cfd6dd'); g.addColorStop(0.72, '#b9c0c8'); g.addColorStop(0.73, '#8d8478'); g.addColorStop(1, '#7c7468'); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  const pic = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); wall(x, w, h); if (draw) draw(x); return c; };
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
  const photo = pic(720, 960, x => x.drawImage(fig, 0, 0, 720, 960)), empty = pic(720, 960);
  // a short video: the figure drifts a little from side to side
  const vc = pic(480, 640), vx = vc.getContext('2d'), rec = new MediaRecorder(vc.captureStream(15), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 1500000 }), parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data); rec.start(200); const t0 = performance.now();
  await new Promise(done => { const step = now => { const k = (now - t0) / 2600; wall(vx, 480, 640); vx.drawImage(fig, Math.sin(k * Math.PI * 2) * 22, 0, 480, 640); if (k < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  await new Promise(r => { rec.onstop = r; rec.stop(); });
  // camera frames (640×480, raw YUV), the same drift
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const c = pic(640, 480, x => x.drawImage(fig, 140 + (f - 2.5) * 9, 0, 360, 480)), d = c.getContext('2d').getImageData(0, 0, 640, 480).data, out = new Uint8Array(640 * 480 * 1.5); let u = 640 * 480, w = u + u / 4;
    for (let y = 0; y < 480; y++) for (let x = 0; x < 640; x++) { const i = (y * 640 + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; out[y * 640 + x] = 0.299 * r + 0.587 * g + 0.114 * b; if (!(y & 1) && !(x & 1)) { out[u++] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b; out[w++] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b; } }
    frames.push(b64(out));
  }
  return { photo: photo.toDataURL('image/jpeg', 0.9).split(',')[1], empty: empty.toDataURL('image/jpeg', 0.9).split(',')[1], video: b64(new Uint8Array(await new Blob(parts).arrayBuffer())), frames };
"""
# green cloth in a part of the picture; the first row of the picture that has any
GREEN = """
  const view = document.querySelector('#toView'), W = view.width, H = view.height;
  const data = (x0, y0, x1, y1) => view.getContext('2d').getImageData(Math.round(x0 * W), Math.round(y0 * H), Math.round((x1 - x0) * W), Math.round((y1 - y0) * H));
  const isG = (d, i) => d[i + 1] > d[i] + 22 && d[i + 1] > d[i + 2] + 8;
  const green = (x0, y0, x1, y1) => { const im = data(x0, y0, x1, y1), d = im.data; let n = 0; for (let i = 0; i < d.length; i += 4) if (isG(d, i)) n++; return n / (im.width * im.height); };
  const top = () => { const im = data(0, 0, 1, 1), d = im.data; for (let y = 0; y < im.height; y++) { let n = 0; for (let x = 0; x < im.width; x++) if (isG(d, (y * im.width + x) * 4)) n++; if (n > 12) return y; } return -1; };
  const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
"""
on_photo = "() => window.FTTryOn && FTTryOn.src === 'photo' && FTTryOn.fit && FTTryOn.fit.has && !document.querySelector('#toView').hidden && document.querySelector('#toLoad').hidden"

class FakeAI(BaseHTTPRequestHandler):
    """Stands in for the AI service: takes a job, says 'processing' once, then hands back the garment picture it was sent."""
    seen = {'runs': [], 'polls': 0}
    def log_message(self, *a): pass
    def reply(self, body):
        raw = json.dumps(body).encode(); self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(raw))); self.end_headers(); self.wfile.write(raw)
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}'); FakeAI.seen['runs'].append({'auth': self.headers.get('Authorization'), 'body': body}); self.reply({'id': 'job-1', 'error': None})
    def do_GET(self):
        FakeAI.seen['polls'] += 1
        self.reply({'id': 'job-1', 'status': 'processing'} if FakeAI.seen['polls'] < 2 else {'id': 'job-1', 'status': 'completed', 'output': [FakeAI.seen['runs'][-1]['body']['inputs']['garment_image']]})

with sync_playwright() as p:
    b, pg, errs = open_browser(p)
    pg.goto(BASE + '/try-on?draft=1&delegate=cpu&model=lite', wait_until='domcontentloaded'); pg.wait_for_function('() => window.FTTryOn && window.FT3D && window.FTFit', timeout=30000)
    check(pg.is_visible('#toStart') and 'kaftan' in pg.inner_text('#toName').lower(), 'opens on the garment from the studio')
    m = js(pg, MAKE); files = {}
    for name, key in (('standin.jpg', 'photo'), ('empty.jpg', 'empty'), ('standin.webm', 'video')):
        files[name] = os.path.join(OUT, name); open(files[name], 'wb').write(base64.b64decode(m[key]))
    cam = os.path.join(OUT, 'standin.y4m')
    with open(cam, 'wb') as f:
        f.write(b'YUV4MPEG2 W640 H480 F12:1 Ip A1:1 C420jpeg\n')
        for i in [0, 1, 2, 3, 4, 5, 4, 3, 2, 1] * 3: f.write(b'FRAME\n' + base64.b64decode(m['frames'][i]))
    check(len(m['video']) > 20000, 'the stand-in video was made')

    # ── a photo
    pg.set_input_files('#toFile', files['standin.jpg']); pg.wait_for_function(on_photo, timeout=90000); pg.wait_for_timeout(500)
    check('No body' not in pg.inner_text('#toMsg'), f"the figure in the photo is found ({pg.inner_text('#toMsg')[:60]})")
    g = js(pg, GREEN + "return { chest: green(.42, .32, .58, .42), wall: green(.02, .05, .2, .3), head: green(.44, .08, .56, .16), top: top(), row: green(.2, .34, .8, .36), w: W, h: H };")
    check(g['chest'] > 0.9 and g['wall'] == 0 and g['head'] < 0.02, f"the garment sits on the body and nowhere else (chest {g['chest']:.2f}, wall {g['wall']:.2f}, head {g['head']:.2f})")
    check(0.18 * g['h'] < g['top'] < 0.3 * g['h'], f"the collar is at the neck, not on the face (row {g['top']} of {g['h']})")
    pg.screenshot(path=f'{OUT}/tryon-{size}-photo.png')
    if not pg.is_visible('#toPanel'): pg.click('#toAdjust'); pg.wait_for_timeout(350)
    check(pg.is_visible('#toPanel'), 'the fit controls open')
    a = js(pg, GREEN + "set('adjWidth', 125); await new Promise(r => setTimeout(r, 150)); const wide = green(.2, .34, .8, .36); set('adjWidth', 100); set('adjDy', -12); await new Promise(r => setTimeout(r, 150)); const up = top(); set('adjDy', 12); await new Promise(r => setTimeout(r, 150)); const down = top(); set('adjDy', 0); set('adjLength', 118); await new Promise(r => setTimeout(r, 150)); const long = green(0, 0, 1, 1); set('adjLength', 86); await new Promise(r => setTimeout(r, 150)); const short = green(0, 0, 1, 1); return { wide, up, down, long, short };")
    check(a['wide'] > g['row'] * 1.08, f"Width makes it wider ({g['row']:.3f} to {a['wide']:.3f})")
    check(a['up'] != a['down'] and abs(a['up'] - a['down']) > 6, f"Up/down moves it ({a['up']} and {a['down']})")
    check(a['long'] > a['short'] * 1.03, f"Length makes it longer ({a['short']:.3f} to {a['long']:.3f})")
    pg.click('#toReset'); pg.wait_for_timeout(200); r = js(pg, GREEN + "return { row: green(.2, .34, .8, .36), top: top() };")
    check(abs(r['row'] - g['row']) < 0.01 and abs(r['top'] - g['top']) <= 2, 'Reset puts the fit back')
    # body points
    pg.click('#toPoints'); pg.wait_for_selector('#toPts circle', state='attached'); n = pg.locator('#toPts circle').count(); check(n >= 12, f'the body points show ({n})')
    k = pg.evaluate("() => document.querySelector('#toPts circle').dataset.k"); j0 = pg.evaluate(f"() => FTTryOn.fit.joints()['{k}']")
    pg.focus(f'#toPts circle[data-k="{k}"]')
    for _ in range(4): pg.keyboard.press('Shift+ArrowRight')
    j1 = pg.evaluate(f"() => FTTryOn.fit.joints()['{k}']"); check(j1[0] > j0[0] + 10, f'a point moves with the arrow keys ({j0[0]:.0f} to {j1[0]:.0f})')
    box = pg.locator(f'#toPts circle[data-k="{k}"]').bounding_box(); pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.mouse.down(); pg.mouse.move(box['x'] - 30, box['y'] + 4, steps=5); pg.mouse.up()
    j2 = pg.evaluate(f"() => FTTryOn.fit.joints()['{k}']"); check(j2[0] < j1[0] - 10, f'and by dragging ({j1[0]:.0f} to {j2[0]:.0f})')
    pg.screenshot(path=f'{OUT}/tryon-{size}-points.png'); pg.click('#toPoints')
    # what gets saved has the garment in it
    pg.click('#toShot'); pg.wait_for_selector('.app-sheet .to-result img', timeout=10000)
    shot = js(pg, "const im = document.querySelector('.app-sheet .to-result img'); await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(Math.round(c.width * .42), Math.round(c.height * .32), Math.round(c.width * .16), Math.round(c.height * .1)).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 22 && d[i + 1] > d[i + 2] + 8) n++; return { w: c.width, h: c.height, green: n / (d.length / 4), name: document.querySelector('.app-sheet a[download]').download, pts: 0 };")
    check(shot['w'] == g['w'] and shot['green'] > 0.9 and shot['name'].endswith('.jpg'), f"the saved picture is full size with the garment in it ({shot['w']}×{shot['h']}, {shot['name']})")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(700)
    # another garment from the rail
    before = pg.evaluate("() => JSON.stringify(FTTryOn.spec)"); pg.click('#toWard .to-g:nth-child(4)'); pg.wait_for_function(f"() => JSON.stringify(FTTryOn.spec) !== {json.dumps(before)} && FTTryOn.fit.has", timeout=20000)
    check(pg.get_attribute('#toWard .to-g:nth-child(4)', 'aria-pressed') == 'true' and pg.get_attribute('#toWard .to-g:nth-child(1)', 'aria-pressed') == 'false', 'another garment can be picked from the rail')
    pg.click('#toWard .to-g:nth-child(1)'); pg.wait_for_function(f"() => JSON.stringify(FTTryOn.spec) === {json.dumps(before)}", timeout=20000); pg.wait_for_timeout(500)
    # a picture with nobody in it
    pg.set_input_files('#toFile', files['empty.jpg']); pg.wait_for_function("() => /No body was found/.test(document.querySelector('#toMsg').textContent)", timeout=30000)
    check(pg.locator('#toPts circle').count() >= 12 and pg.evaluate('() => FTTryOn.fit.has'), 'with nobody found, the points appear so the garment can be placed by hand')
    ov = pg.evaluate("() => document.documentElement.scrollWidth - document.documentElement.clientWidth"); check(ov <= 1, f'the page fits the screen ({ov})')
    check(not pg.is_visible('#toReal') or REMOTE, 'Photoreal is not offered where it is not switched on')

    # ── a video
    pg.set_input_files('#toVFile', files['standin.webm']); pg.wait_for_function("() => FTTryOn.src === 'video' && FTTryOn.fit.has && FTTryOn.frames > 3", timeout=60000); pg.wait_for_timeout(900)
    v = js(pg, GREEN + "const a = FTTryOn.frames; await new Promise(r => setTimeout(r, 1200)); return { chest: green(.42, .32, .58, .42), wall: green(.02, .05, .15, .3), moved: FTTryOn.frames - a, ms: FTTryOn.detectMs };")
    check(v['chest'] > 0.85 and v['wall'] == 0 and v['moved'] > 1, f"the garment stays on the figure as the video plays (chest {v['chest']:.2f}, finding the body takes {v['ms']:.0f} ms here)")
    pg.screenshot(path=f'{OUT}/tryon-{size}-video.png')
    pg.click('#toPlay'); pg.wait_for_timeout(300); check(pg.evaluate("() => document.querySelector('#toVideo').paused"), 'the video pauses')
    pg.click('#toExport'); pg.wait_for_selector('.app-sheet .to-result video', timeout=60000)
    ex = js(pg, "const v = document.querySelector('.app-sheet .to-result video'), blob = await (await fetch(v.src)).blob(); await new Promise(r => { if (v.readyState >= 1) r(); else v.onloadedmetadata = r; }); return { bytes: blob.size, type: blob.type, w: v.videoWidth, name: document.querySelector('.app-sheet a[download]').download };")
    check(ex['bytes'] > 20000 and ex['type'].startswith('video/') and ex['w'] > 0, f"the video is saved with the garment in it ({ex['bytes'] // 1024} KB, {ex['type']})")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(600); check(not errs, f'no page errors {errs[:2]}'); b.close()

    # ── the camera (Chromium's pretend camera plays the stand-in)
    b, pg, errs = open_browser(p, cam)
    pg.goto(BASE + '/try-on?draft=1&src=camera&delegate=cpu&model=lite&fps=1', wait_until='domcontentloaded')
    pg.wait_for_function("() => window.FTTryOn && FTTryOn.src === 'camera' && FTTryOn.fit && FTTryOn.fit.has && FTTryOn.frames > 3", timeout=90000); pg.wait_for_timeout(1500)
    c = js(pg, GREEN + "let best = 0; for (let x = .1; x < .8; x += .05) best = Math.max(best, green(x, .34, x + .1, .44)); return { best, mirror: FTTryOn.mirror, w: W, h: H, msg: document.querySelector('#toMsg').textContent, meter: document.querySelector('.v3d-meter')?.textContent || '' };")
    check(c['best'] > 0.85 and c['mirror'] and 'Step back' not in c['msg'], f"live: the garment is on the figure, mirrored like a mirror ({c['w']}×{c['h']}, {c['best']:.2f})")
    check('fps' in c['meter'] and 'find the body' in c['meter'], 'the speed readout shows with ?fps=1')
    pg.screenshot(path=f'{OUT}/tryon-{size}-camera.png')
    pg.click('#toRec'); pg.wait_for_timeout(2400); dot = pg.is_visible('#toRecDot'); pg.click('#toRec'); pg.wait_for_selector('.app-sheet .to-result video', timeout=20000)
    rc = js(pg, "const v = document.querySelector('.app-sheet .to-result video'), blob = await (await fetch(v.src)).blob(); return { bytes: blob.size, type: blob.type };")
    check(dot and rc['bytes'] > 15000 and rc['type'].startswith('video/'), f"a recording is made ({rc['bytes'] // 1024} KB)")
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    tracks = pg.evaluate_handle("() => FTTryOn.stream.getTracks()"); pg.set_input_files('#toFile', files['standin.jpg']); pg.wait_for_function(on_photo, timeout=60000)
    check(pg.evaluate("t => t.length > 0 && t.every(x => x.readyState === 'ended')", tracks) and pg.evaluate("() => !FTTryOn.stream && !document.querySelector('#toVideo').srcObject"), 'choosing a photo switches the camera off')
    check(not errs, f'no page errors {errs[:2]}'); b.close()

    # ── Photoreal, through the backend, with a stand-in for the AI service
    if REMOTE:
        on = json.loads(urllib.request.urlopen(API + '/api/v1/config/', timeout=10).read()).get('try_on_ai')
        if not on: print('  skipped Photoreal: the backend was not started with FASHN_API_KEY=test FASHN_API_URL=http://127.0.0.1:8799')
        else:
            srv = HTTPServer(('127.0.0.1', 8799), FakeAI); threading.Thread(target=srv.serve_forever, daemon=True).start()
            b, pg, errs = open_browser(p)
            pg.goto(BASE + '/signin', wait_until='domcontentloaded'); pg.click('[data-demo="customer"]'); pg.wait_for_url(lambda u: '/signin' not in u, timeout=15000); pg.wait_for_timeout(500)
            did = js(pg, "const t = FTEngine.TEMPLATES.find(x => x.id === 'ankara-flare'); return (await FTApi.createDesign({ spec: FTEngine.normalize(t.spec || t), title: 'Photoreal test dress' })).id")
            pg.goto(BASE + f'/try-on?design={did}&delegate=cpu&model=lite', wait_until='domcontentloaded'); pg.wait_for_function('() => window.FTTryOn && FTTryOn.spec', timeout=30000)
            pg.set_input_files('#toFile', files['standin.jpg']); pg.wait_for_function(on_photo, timeout=90000)
            check(pg.is_visible('#toReal'), 'Photoreal is offered on a photo when the backend has it switched on')
            pg.click('#toReal'); pg.wait_for_selector('.app-sheet', timeout=8000); said = pg.inner_text('.app-sheet'); check('AI partner' in said and 'never leaves your device' in said, 'it asks before the photo is sent anywhere')
            pg.click('.app-sheet [data-ok], .app-sheet .btn.ink, .app-sheet .btn.gold'); pg.wait_for_selector('.app-sheet .to-result img', timeout=40000)
            run = FakeAI.seen['runs'][-1] if FakeAI.seen['runs'] else {'body': {'inputs': {}}, 'auth': ''}; i = run['body'].get('inputs', {})
            check(run['auth'] == 'Bearer test' and run['body'].get('model_name') and i.get('category') == 'one-pieces' and i.get('model_image', '').startswith('data:image/jpeg;base64,') and i.get('garment_image', '').startswith('data:image/jpeg;base64,'), f"the service is sent the photo and the garment picture ({i.get('category')})")
            dims = js(pg, "const im = document.querySelector('.app-sheet .to-result img'); await im.decode(); return [im.naturalWidth, im.naturalHeight, document.querySelector('.app-sheet a[download]').download]"); check(dims[0] > 100, f'the picture that comes back is shown and can be saved ({dims[0]}×{dims[1]})')
            pg.screenshot(path=f'{OUT}/tryon-{size}-photoreal.png'); check(not errs, f'no page errors {errs[:2]}'); b.close(); srv.shutdown()
print(f'try-on [{size}{" backend" if REMOTE else ""}]: {passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
