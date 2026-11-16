"""Static server for the tests: clean URLs and the same response headers as vercel.json (so the content security policy is exercised).
Usage: python3 serve.py [port=8787].  API_BASE=http://127.0.0.1:8000 python3 serve.py 8788 serves the same site pointed at the Django backend."""
import http.server, os, sys, socketserver
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); TEST = HERE
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
API = os.environ.get('API_BASE', '')
import json
SITE_HEADERS = [(h['key'], h['value']) for blk in json.load(open(os.path.join(ROOT, 'vercel.json')))['headers'] if blk['source'] == '/(.*)' for h in blk['headers']]
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?')[0].split('#')[0]
        if p.startswith('/__test/'): return os.path.join(TEST, p[len('/__test/'):])
        if p == '/': p = '/index.html'
        f = os.path.join(ROOT, p.lstrip('/'))
        if not os.path.exists(f) and os.path.exists(f + '.html'): f += '.html'
        if not os.path.exists(f) or os.path.isdir(f): self._nf = True; return os.path.join(ROOT, '404.html')
        return f
    def do_GET(self):
        self._nf = False
        if API and self.path.split('?')[0] == '/assets/js/config.js':
            body = open(os.path.join(ROOT, 'assets/js/config.js')).read().replace("apiBaseUrl: ''", "apiBaseUrl: '%s'" % API).encode()
            self.send_response(200); self.send_header('Content-Type', 'text/javascript'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()
    def send_response(self, code, message=None):
        if getattr(self, '_nf', False) and code == 200: code = 404
        super().send_response(code, message)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        for k, val in SITE_HEADERS: self.send_header(k, val)
        super().end_headers()
    def log_message(self, *a): pass
H.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript'})
class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True
S(('127.0.0.1', PORT), H).serve_forever()
