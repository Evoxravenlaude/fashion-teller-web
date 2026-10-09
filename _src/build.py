"""Rebuild the HTML pages from _src/partials + _src/pages.  Run:  python3 _src/build.py
Assets under /assets are edited in place and are not touched."""
import pathlib
R = pathlib.Path(__file__).parent
SRC, OUT = R, R.parent  # _src/ -> site root
PAGES = {
  'index':        dict(page='home',     path='/',             js=['home'],     title='Fashion Teller — Describe it. See it. Have it made.', desc='Describe the clothing you want in plain language. See the design, refine it, and have a verified tailor make and deliver it.'),
  'how-it-works': dict(page='how',      path='/how-it-works', js=['how'],      title='How it works — Fashion Teller', desc='Four phases from a sentence to a finished garment: concept, vendor assigned, tailoring, doorstep delivery.'),
  'studio':       dict(page='studio',   path='/studio',       js=['studio'],   title='Studio — Fashion Teller', desc='Describe a garment, refine it version by version, add your measurements, compare verified tailors, pay in naira and track production.', footer=False),
  'tailors':      dict(page='tailors',  path='/tailors',      js=['tailors'],  title='For tailors — Fashion Teller', desc='Quote on designs from customers beyond your area. See where your quote would rank, then apply to be verified.'),
  'about':        dict(page='about',    path='/about',        js=['about'],    title='About — Fashion Teller', desc='Why Fashion Teller exists, what it does, and where it is going next.'),
  'signin':       dict(page='signin',   path='/signin',       js=['signin'],   title='Sign in — Fashion Teller', desc='Sign in or create a Fashion Teller account to save designs, add measurements and start production.'),
  'designs':      dict(page='designs',  path='/designs',      js=['designs'],  title='My designs — Fashion Teller', desc='Every design you have generated, with all of its versions.'),
  'account':      dict(page='account',  path='/account',      js=['account-page'], title='Account — Fashion Teller', desc='Your profile, password and measurement profiles.'),
  'orders':       dict(page='orders',   path='/orders',       js=['orders'],   title='Orders — Fashion Teller', desc='Track every order from concept to your door.'),
  'workshop':     dict(page='workshop', path='/workshop',     js=['workshop'], title='Workshop — Fashion Teller', desc='For verified tailors: quote on requests, manage orders and update customers.'),
  'admin':        dict(page='admin',    path='/admin',        js=['admin'],    title='Admin — Fashion Teller', desc='Fashion Teller operations dashboard.'),
  '404':          dict(page='404',      path='/404',          js=[],           title='Page not found — Fashion Teller', desc='This page could not be found.'),
}
head = (SRC / 'partials/head.html').read_text(); foot = (SRC / 'partials/footer.html').read_text()
for name, m in PAGES.items():
    body = (SRC / 'pages' / f'{name}.html').read_text()
    scripts = '\n'.join(f'<script src="/assets/js/{j}.js" defer></script>' for j in m['js'])
    h = head
    for k, v in dict(title=m['title'], desc=m['desc'], path=m['path'], page=m['page'], scripts=scripts).items():
        h = h.replace('{{' + k + '}}', v)
    f = foot if m.get('footer', True) else '</body>\n</html>\n'   # the studio is full-screen: no footer
    (OUT / f'{name}.html').write_text(h + body + f)
print('built', len(PAGES), 'pages ->', OUT)
