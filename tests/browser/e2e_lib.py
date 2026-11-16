"""Shared bits for the browser tests."""
from playwright.sync_api import sync_playwright
import os
HERE = os.path.dirname(os.path.abspath(__file__)); os.chdir(HERE); os.makedirs('shots', exist_ok=True)
BASE = os.environ.get('FT_BASE', 'http://localhost:8787')
REMOTE = bool(os.environ.get('FT_REMOTE'))
GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SIZES = {'phone': (390, 844, True), 'small-phone': (320, 568, True), 'landscape': (844, 390, True), 'tablet': (820, 1180, True), 'laptop': (1366, 768, False), 'desktop': (1536, 864, False), 'wide': (1920, 1080, False)}
IGNORE = ('status of 400', 'status of 401', 'status of 402', 'status of 403', 'status of 404', 'status of 409', 'GL Driver Message', 'GPU stall', 'fonts.googleapis', 'fonts.gstatic', 'net::ERR_', 'Failed to load resource', 'PCFSoftShadowMap')
class Session:
    def __init__(self, p, size='desktop', gl=False, seen=True, fast=True):
        w, h, touch = SIZES[size]
        self.browser = p.chromium.launch(args=GL if gl else [])
        self.ctx = self.browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch and w < 900, device_scale_factor=1)
        if seen: self.ctx.add_init_script("try{sessionStorage.setItem('ft.seen','1')}catch(e){}")
        # sample tailors and designers act quickly in tests
        if fast: self.ctx.add_init_script("(()=>{let c;Object.defineProperty(window,'FT_CONFIG',{configurable:true,get(){return c},set(v){v.sample={quoteDelayMs:[300,1400],orderPhaseMs:2200};c=v}})})()")
        self.page = self.ctx.new_page(); self.errors = []
        # the site forbids eval (content security policy), so plain-expression waits are wrapped as functions
        _wf = self.page.wait_for_function
        self.page.wait_for_function = lambda expr, *a, **k: _wf(expr if expr.lstrip().startswith(('(', 'function', 'async')) and '=>' in expr or expr.lstrip().startswith('function') else '() => (' + expr + ')', *a, **k)
        self.page.on('console', lambda m: self.errors.append(f'console.{m.type}: {m.text[:300]}') if m.type == 'error' and not any(s in m.text for s in IGNORE) else None)
        self.page.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)[:400]))
        self.page.on('requestfailed', lambda r: self.errors.append('requestfailed: ' + r.url) if r.url.startswith(BASE) else None)
        self.page.on('response', lambda r: self.errors.append(f'http {r.status}: {r.url}') if r.url.startswith(BASE) and r.status >= 400 and '/nope' not in r.url else None)
    def go(self, path, wait=600):
        self.page.goto(BASE + path, wait_until='domcontentloaded'); self.page.wait_for_timeout(wait); return self.page
    def js(self, expr):
        return self.page.evaluate('async () => { ' + expr + ' }')
    def login(self, who='customer'):
        self.go('/signin'); self.page.click(f'[data-demo="{who}"]'); self.page.wait_for_url(lambda u: '/signin' not in u, timeout=15000); self.page.wait_for_timeout(500)
    def overflow(self):
        return self.page.evaluate("() => { const w = document.documentElement.clientWidth; const bad = []; if (document.documentElement.scrollWidth > w + 1) { for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.strip,.chips,.tabs,.bld-tabs,.vrail,.seg,.marquee,.st-versions,.menu,.filters')) { bad.push(el.tagName + '.' + String(el.className).slice(0, 40) + ' ' + Math.round(r.right)); if (bad.length > 4) break; } } } return { sw: document.documentElement.scrollWidth, w, bad }; }")
    def close(self): self.browser.close()
