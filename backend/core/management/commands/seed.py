"""
Load the demo world: the same tailors, designers, published designs, orders, commissions and demo accounts the site
shows in built-in mode (exported from assets/js/store.js by backend/tools/export_catalog.js).

    python manage.py seed            # only if the database is empty
    python manage.py seed --reset    # wipe everything first

Demo accounts (password fashion2026): customer@ / designer@ / tailor@ / admin@demo.fashionteller
For a real launch create your own admin instead:  python manage.py seed --admin you@example.com
"""
import getpass, json, re
from datetime import date, datetime, timedelta
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from core import rules as R
from core.models import (Application, Commission, Design, Designer, Follow, Game, Like, Measurement, Member, Message, Notification, Order, Payment, Quote, QuoteRequest, Review, Saved,
                         Thread, User, Vendor, Version)

DATA = Path(__file__).resolve().parents[2] / 'data' / 'seed.json'


class Command(BaseCommand):
    help = 'Load the Fashion Teller demo data, or create an admin account.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='delete all data first')
        parser.add_argument('--demo', action='store_true', help='allow the demo data (accounts with a published password) outside development')
        parser.add_argument('--admin', metavar='EMAIL', help='create (or promote) an admin account and stop; asks for a password')

    @transaction.atomic
    def handle(self, *args, reset=False, admin=None, demo=False, **kw):
        if admin:
            u = User.objects.filter(email=admin.lower()).first()
            if u is None:
                pw = getpass.getpass('Password (8+ characters): ')
                if len(pw) < 8:
                    self.stderr.write('Too short.'); return
                u = User.objects.create_user(admin, pw, name='Fashion Teller Admin')
            u.role, u.status = 'admin', 'active'; u.save()
            self.stdout.write(self.style.SUCCESS(f'{u.email} is an admin.')); return
        if not settings.DEBUG and not demo:
            self.stderr.write('The demo data includes accounts with a published password, so it is not loaded outside development.\n'
                              'For a live site create your admin with:  python manage.py seed --admin you@example.com\n'
                              'To load the demo data anyway (staging):   python manage.py seed --demo'); return
        if reset:
            for m in reversed(list(apps.get_app_config('core').get_models())):
                m.objects.all().delete()
        elif User.objects.exists():
            self.stdout.write('The database already has accounts. Use --reset to start over.'); return
        data = json.loads(DATA.read_text()); db = data['db']
        demo = {d['email']: d['password'] for d in data['demo']}
        then = datetime.fromisoformat(db['seededAt'].replace('Z', '+00:00'))
        shift, day_shift = timezone.now() - then, (timezone.localdate() - then.date()).days
        T = lambda s: (datetime.fromisoformat(s.replace('Z', '+00:00')) + shift) if s else None
        D = lambda s: (date.fromisoformat(s[:10]) + timedelta(days=day_shift)) if s else None
        ids = {}
        iso = lambda s: T(s).isoformat().replace('+00:00', 'Z') if s else None

        users = {}
        for u in db['users']:
            obj = User(email=u['email'], name=u['name'], role=u['role'], phone=u.get('phone', ''), city=u.get('city', ''), country=u.get('country', ''), status=u['status'], sample=bool(u.get('sample')), demo=bool(u.get('demo')), created_at=T(u['createdAt']))
            obj.set_password(demo[u['email']]) if u['email'] in demo else obj.set_unusable_password()
            obj.save(); users[u['id']] = obj; ids[u['id']] = str(obj.id)
        vendors = {}
        for v in db['vendors']:
            vendors[v['id']] = Vendor.objects.create(user=users[v['userId']], name=v['name'], city=v['city'], country=v['country'], specialties=v['specialties'], bio=v['bio'], rating=v['rating'], reviews=v['reviews'], orders_done=v['ordersDone'],
                                                     price_factor=v['priceFactor'], speed_factor=v['speedFactor'], lead_min=v['leadMin'], since=v['since'], status=v['verified'], verified_at=T(v.get('verifiedAt')), sample=bool(v.get('sample')), hue=v['hue'], created_at=T(v['createdAt']))
            ids[v['id']] = str(vendors[v['id']].id)
        for a in db['applications']:
            Application.objects.create(user=users[a['userId']], vendor=vendors[a['vendorId']], workshop=a['workshop'], name=a['name'], email=a['email'], phone=a.get('phone', ''), city=a.get('city', ''), country=a.get('country', ''), specialties=a.get('specialties', []), about=a.get('about', ''), status=a['status'], created_at=T(a['createdAt']))
        for p in db['designers']:
            Designer.objects.create(user=users[p['userId']], handle=p['handle'], bio=p['bio'], specialties=p['specialties'], open=p['open'], fee_from=p['feeFrom'], turnaround_days=p['turnaroundDays'], rating=p['rating'], reviews=p['reviews'], completed=p['completed'],
                                    featured=p['featured'], followers_base=p.get('followersBase', 0), sample=bool(p.get('sample')), created_at=T(p['createdAt']))
        designs = {}
        for d in db['designs']:
            obj = Design.objects.create(user=users[d['userId']], title=d['title'], prompt=d.get('prompt', ''), source=d.get('source', 'builder'), status=d['status'], current=d['current'], published=bool(d.get('published')), published_at=T(d.get('publishedAt')),
                                        caption=d.get('caption', ''), tags=d.get('tags', []), allow_remix=d.get('allowRemix', True), like_base=d.get('likeBase', 0), created_at=T(d['createdAt']), updated_at=T(d['updatedAt']))
            for v in d['versions']:
                Version.objects.create(design=obj, n=v['n'], instruction=v.get('instruction') or '', spec=R.normalize(v['spec']), changes=v.get('changes', []), from_n=v.get('from'), created_at=T(v['createdAt']))
            designs[d['id']] = obj; ids[d['id']] = str(obj.id)
        for x in db['likes']: Like.objects.create(user=users[x['u']], design=designs[x['d']], at=T(x['at']))
        for x in db['saves']: Saved.objects.create(user=users[x['u']], design=designs[x['d']], at=T(x['at']))
        for x in db['follows']: Follow.objects.create(user=users[x['u']], target=users[x['t']], at=T(x['at']))
        meas = {m['id']: Measurement.objects.create(user=users[m['userId']], label=m['label'], unit=m['unit'], values=m['values'], fit=m['fit'], notes=m.get('notes', ''), created_at=T(m['createdAt']), updated_at=T(m['updatedAt'])) for m in db['measurements']}
        reqs = {r['id']: QuoteRequest.objects.create(design=designs[r['designId']], version_n=r['versionN'], user=users[r['userId']], measurement=meas.get(r['measurementId']), notes=r.get('notes', ''), status=r['status'], created_at=T(r['createdAt'])) for r in db['requests']}
        quotes = {q['id']: Quote.objects.create(request=reqs[q['requestId']], design=designs[q['designId']], vendor=vendors[q['vendorId']], price=q['price'], delivery_days=q['deliveryDays'], note=q.get('note', ''), status=q['status'], valid_until=T(q.get('validUntil')), created_at=T(q['createdAt'])) for q in db['quotes']}
        orders = {}
        for o in db['orders']:
            q = quotes.get(o['quoteId'])
            orders[o['id']] = Order.objects.create(number=o['id'], user=users[o['userId']], vendor=vendors[o['vendorId']], design=designs.get(o['designId']), version_n=o['versionN'], quote=q, request=reqs.get(o['requestId']), measurement=meas.get(o['measurementId']),
                                                   total=o['total'], paid=o['paid'], plan=o['plan'], phase=o['phase'], status=o['status'], delivery_days=q.delivery_days if q else 7, paid_at=T(o.get('paidAt')), eta=T(o.get('eta')), delivered_at=T(o.get('deliveredAt')),
                                                   received_at=T(o.get('receivedAt')), events=[{**e, 'at': iso(e['at'])} for e in o['events']], created_at=T(o['createdAt']))
        threads = {}
        for t in db['threads']:
            ref = t['refId'] if t['kind'] == 'order' else ''
            th = Thread.objects.create(kind=t['kind'], ref_id=ref or '', title=t.get('title', ''), created_at=T(t['createdAt']), updated_at=T(t['updatedAt']))
            for m in t['members']:
                Member.objects.create(thread=th, user=users[m], read_at=T(t.get('read', {}).get(m)))
            threads[t['id']] = th; ids[t['id']] = str(th.id)
        comms = {}
        for c in db['commissions']:
            offer = {**c['offer'], 'at': iso(c['offer']['at'])} if c.get('offer') else None
            obj = Commission.objects.create(client=users[c['clientId']], designer=users[c['designerId']], title=c['title'], brief=c['brief'], garment=c.get('garment', ''), occasion=c.get('occasion', ''), budget=c.get('budget', 0), deadline=D(c.get('deadline')),
                                            status=c['status'], offer=offer, paid=c['paid'], paid_at=T(c.get('paidAt')), revisions=c['revisions'], max_revisions=c['maxRevisions'], thread=threads.get(c.get('threadId')),
                                            deliveries=[{'at': iso(x['at']), 'design_id': ids[x['designId']], 'version_n': x['versionN'], 'note': x.get('note', '')} for x in c['deliveries']], created_at=T(c['createdAt']), updated_at=T(c['updatedAt']))
            comms[c['id']] = obj; ids[c['id']] = str(obj.id)
            if obj.thread_id:
                Thread.objects.filter(id=obj.thread_id).update(ref_id=str(obj.id))
        for k in db['chat']:
            Message.objects.create(thread=threads[k['threadId']], by=users.get(k['by']), text=k['text'], design=designs.get(k.get('designId')), at=T(k['at']))
        for p in db['payments']:
            Payment.objects.create(order=orders.get(p.get('orderId')), commission=comms.get(p.get('commissionId')), user=users[p['userId']], amount=p['amount'], kind=p['kind'], method=p['method'], reference=p['reference'], status=p['status'], last4=p.get('last4') or '', created_at=T(p['createdAt']))
        for r in db['reviews']:
            Review.objects.create(kind=r['kind'], order=orders.get(r['refId']), commission=comms.get(r['refId']), by=users[r['byId']], vendor=vendors.get(r.get('vendorId')), designer=users.get(r.get('designerId')), rating=r['rating'], text=r.get('text', ''), created_at=T(r['createdAt']))
        fix = lambda href: re.sub(r'(id|t)=([A-Za-z0-9_]+)', lambda m: f'{m.group(1)}={ids.get(m.group(2), m.group(2))}', href or '')
        for n in db['notifications']:
            Notification.objects.create(user=users[n['userId']], kind=n['kind'], title=n['title'], body=n.get('body', ''), href=fix(n.get('href')), read=n['read'], at=T(n['at']))
        day = lambda s: (date.fromisoformat(s) + timedelta(days=day_shift)).isoformat() if s else None
        for uid, g in db['games'].items():
            Game.objects.create(user=users[uid], data={'xp': g['xp'], 'streak': g['streak'], 'best': g['best'], 'last_day': day(g['lastDay']), 'days': [day(x) for x in g['days']], 'badges': {k: iso(v) for k, v in g['badges'].items()},
                                                      'challenges': {day(k): v for k, v in g['challenges'].items()}, 'palettes': g['palettes'], 'garments': g['garments'], 'today_versions': 0, 'today_key': day(g['todayKey'])})
        self.stdout.write(self.style.SUCCESS(f'Seeded {len(users)} accounts, {len(vendors)} tailors, {len(db["designers"])} designers, {len(designs)} designs, {len(orders)} orders, {len(comms)} commissions.'))
        self.stdout.write('Demo accounts (password fashion2026): ' + ', '.join(demo))
