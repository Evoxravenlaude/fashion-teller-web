"""Rebuild the HTML pages from _src/partials + _src/pages.  Run:  python3 _src/build.py
Assets under /assets are edited in place and are not touched."""
import pathlib
R = pathlib.Path(__file__).parent
SRC, OUT = R, R.parent  # _src/ -> site root
PAGES = {
  'index':        dict(page='home',     path='/',             js=['home'],     title='Fashion Teller — Design it. See it on you. Have it made.', desc='Design your own clothes from templates, colours and your own sketch. See them in 3D, share them, hire a designer, and have a verified tailor make and deliver them.'),
  'how-it-works': dict(page='how',      path='/how-it-works', js=['how'],      title='How it works — Fashion Teller', desc='Four phases from your design to a finished garment: design approved, tailor assigned, tailoring, delivered to your door.'),
  'studio':       dict(page='studio',   path='/studio',       js=['studio'],   title='Studio — Fashion Teller', desc='Design a garment from templates, colours and your own sketch, see it in 3D, add your measurements, compare verified tailors, pay in naira and track production.', footer=False),
  'tailors':      dict(page='tailors',  path='/tailors',      js=['tailors'],  title='For tailors — Fashion Teller', desc='Quote on designs from customers beyond your area. See where your quote would rank, then apply to be verified.'),
  'about':        dict(page='about',    path='/about',        js=['about'],    title='About — Fashion Teller', desc='Why Fashion Teller exists, what it does, and where it is going next.'),
  'signin':       dict(page='signin',   path='/signin',       js=['signin'],   title='Sign in — Fashion Teller', desc='Sign in or create a Fashion Teller account to save designs, add measurements and start production.'),
  'discover':     dict(page='discover', path='/discover',     js=['discover'], title='Discover — Fashion Teller', desc='Designs people made in the Fashion Teller studio. Like them, remix them into your own, or have one made.'),
  'designers':    dict(page='designers', path='/designers',   js=['designers'], title='Designers — Fashion Teller', desc='Hire a designer to design something for you, or follow the ones whose work you like.'),
  'designer':     dict(page='designer', path='/designer',     js=['designer'], title='Designer — Fashion Teller', desc='A designer on Fashion Teller: published designs, reviews and commissions.'),
  'design':       dict(page='design',   path='/design',       js=['design'],   title='Design — Fashion Teller', desc='A design made in the Fashion Teller studio, in 3D.', footer=False),
  'try-on':       dict(page='tryon',    path='/try-on',       js=['viewer3d', 'fit', 'tryon'], title='Try it on — Fashion Teller', desc='See a design on yourself: live through your camera, on a photo or in a video. It all happens on your device.', footer=False),
  'commissions':  dict(page='commissions', path='/commissions', js=['commissions'], title='Commissions — Fashion Teller', desc='Designs made for you by a designer, and designs you are making for clients.'),
  'messages':     dict(page='messages', path='/messages',     js=['messages'], title='Messages — Fashion Teller', desc='Conversations with designers and tailors.', footer=False),
  'designs':      dict(page='designs',  path='/designs',      js=['designs'],  title='My studio — Fashion Teller', desc='Every design you have saved, with all of its versions, your streak and your badges.'),
  'account':      dict(page='account',  path='/account',      js=['account-page'], title='Account — Fashion Teller', desc='Your profile, password and measurement profiles.'),
  'orders':       dict(page='orders',   path='/orders',       js=['orders'],   title='Orders — Fashion Teller', desc='Track every order from the tailor to your door.'),
  'workshop':     dict(page='workshop', path='/workshop',     js=['workshop'], title='Workshop — Fashion Teller', desc='For verified tailors: quote on requests, manage orders and update customers.'),
  'admin':        dict(page='admin',    path='/admin',        js=['admin'],    title='Admin — Fashion Teller', desc='Fashion Teller operations dashboard.'),
  'speed':        dict(page='speed',    path='/speed',        js=['speed'],    title='Speed check — Fashion Teller', desc='Measure how smoothly this device draws the 3D view.'),
  '404':          dict(page='404',      path='/404',          js=['notfound'],           title='Page not found — Fashion Teller', desc='This page could not be found.'),
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
