"""Rebuild the six HTML pages from _src/partials + _src/pages.  Run:  python3 _src/build.py
Assets under /assets are edited in place and are not touched."""
import shutil, pathlib
R = pathlib.Path(__file__).parent
SRC, OUT = R, R.parent  # _src/ -> site root
PAGES = {
  'index':        dict(page='home',    path='/',             js=['home'],    title='Fashion Teller — Describe it. See it. Have it made.', desc='Describe the clothing you want in plain language. See the design, refine it, and have a verified tailor make and deliver it.'),
  'how-it-works': dict(page='how',     path='/how-it-works', js=['how'],     title='How it works — Fashion Teller', desc='Four phases from a sentence to a finished garment: concept, vendor assigned, tailoring, doorstep delivery.'),
  'studio':       dict(page='studio',  path='/studio',       js=['studio'],  title='Studio — Fashion Teller', desc='Describe a garment, refine the concept in plain language, compare verified tailors and track production.'),
  'tailors':      dict(page='tailors', path='/tailors',      js=['tailors'], title='For tailors — Fashion Teller', desc='Quote on designs from customers beyond your area. See where your quote would rank, then apply to be verified.'),
  'about':        dict(page='about',   path='/about',        js=['about'],   title='About — Fashion Teller', desc='Why Fashion Teller exists, what it does, and where it is going next.'),
  '404':          dict(page='404',     path='/404',          js=[],          title='Page not found — Fashion Teller', desc='This page could not be found.'),
}
head = (SRC / 'partials/head.html').read_text(); foot = (SRC / 'partials/footer.html').read_text()
for name, m in PAGES.items():
    body = (SRC / 'pages' / f'{name}.html').read_text()
    scripts = '\n'.join(f'<script src="/assets/js/{j}.js" defer></script>' for j in m['js'])
    h = head
    for k, v in dict(title=m['title'], desc=m['desc'], path=m['path'], page=m['page'], scripts=scripts).items():
        h = h.replace('{{' + k + '}}', v)
    f = foot if name != 'studio' else '</body>\n</html>\n'   # the studio is full-screen: no footer
    (OUT / f'{name}.html').write_text(h + body + f)
print('built', len(PAGES), 'pages ->', OUT)
