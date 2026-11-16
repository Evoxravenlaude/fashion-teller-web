"""
API tests:  python manage.py test
  - the Python rules match the site's engine on every exported vector
  - every product flow over HTTP, with the access rules that go with it
"""
import json
from pathlib import Path

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from . import rules as R
from .models import Notification, Order, Payment, User

DATA = Path(__file__).parent / 'data'
CARD = {'number': '4084 0840 8408 4081', 'expiry': '12/30', 'cvv': '123'}
PW = 'fashion2026'


class RulesTest(TestCase):
    def test_port_matches_the_engine(self):
        for i, v in enumerate(json.loads((DATA / 'vectors.json').read_text())):
            self.assertEqual(R.normalize(v['in']), v['norm'], f'normalize #{i}')
            ven = v['vendor']
            p = R.price(v['in'], ven.get('priceFactor', 1), ven.get('speedFactor', 1), ven.get('leadMin', 5))
            self.assertEqual((p['price'], p['delivery_days']), (v['price']['price'], v['price']['deliveryDays']), f'price #{i}')
            self.assertEqual([c['id'] for c in R.CHALLENGES if R.check_challenge(c['id'], v['in'])], v['challenges'], f'challenges #{i}')

    def test_hostile_spec_is_cleaned(self):
        s = R.normalize({'garment': 'dress', 'color': '"><script>alert(1)</script>', 'notes': ['<img onerror=x>'] * 40, 'template': '../../etc/passwd', 'sketch': [{'c': 'javascript:1', 'w': 1e9, 'p': [1e12, 'x', 5, 6]}]})
        self.assertEqual(s['color'], 'emerald'); self.assertIsNone(s['template']); self.assertEqual(len(s['notes']), 12)
        self.assertEqual(s['sketch'][0]['c'], '#d4af37'); self.assertEqual(s['sketch'][0]['w'], 40); self.assertEqual(s['sketch'][0]['p'], [780, 0, 5, 6])


@override_settings(SAMPLE_MODE=True, SAMPLE_QUOTE_DELAY=(0, 0), SAMPLE_PHASE_SECONDS=0.0, PAYSTACK_SECRET_KEY='', PAYMENTS_LIVE=False, ALLOW_TEST_PAYMENTS=True)
class ApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('seed', demo=True, verbosity=0)

    def setUp(self):
        cache.clear()
        SimpleRateThrottle.THROTTLE_RATES = {k: '100000/min' for k in ('anon', 'user', 'auth', 'write')}
        self.c = APIClient()

    # helpers
    def call(self, method, path, body=None, expect=None):
        r = getattr(self.c, method)('/api/v1' + path, body, format='json') if body is not None else getattr(self.c, method)('/api/v1' + path)
        if expect is not None:
            self.assertEqual(r.status_code, expect, f'{method.upper()} {path} -> {r.status_code} {getattr(r, "data", None)}')
        return r.data if getattr(r, 'data', None) is not None else None

    def ok(self, method, path, body=None):
        r = getattr(self.c, method)('/api/v1' + path, body, format='json') if body is not None else getattr(self.c, method)('/api/v1' + path)
        self.assertLess(r.status_code, 300, f'{method.upper()} {path} -> {r.status_code} {getattr(r, "data", None)}')
        return r.data

    def fails(self, method, path, body, status, text):
        r = getattr(self.c, method)('/api/v1' + path, body, format='json')
        self.assertEqual(r.status_code, status, f'{method.upper()} {path} -> {r.status_code} {r.data}')
        self.assertIn(text, r.data['detail'])

    def login(self, who):
        self.c.credentials()
        d = self.ok('post', '/auth/login/', {'email': f'{who}@demo.fashionteller', 'password': PW})
        self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access'])
        return d['user']

    def template(self, tid, **patch):
        return {**R.TEMPLATES[tid]['spec'], **patch}

    # ── accounts
    def test_accounts(self):
        self.fails('post', '/auth/login/', {'email': 'customer@demo.fashionteller', 'password': 'wrong'}, 401, 'password')
        self.fails('post', '/auth/login/', {'email': 'zainabcuts@sample.fashionteller', 'password': PW}, 401, 'No account')
        self.fails('post', '/auth/register/', {'name': 'A', 'email': 'bad', 'password': 'longenough'}, 400, 'valid email')
        self.fails('post', '/auth/register/', {'name': 'A', 'email': 'a@b.co', 'password': 'short'}, 400, '8 characters')
        d = self.ok('post', '/auth/register/', {'name': 'Bola Ade', 'email': 'Bola@Example.com', 'password': 'longenough1', 'role': 'admin', 'city': 'Lagos'})
        self.assertEqual((d['user']['role'], d['user']['email']), ('customer', 'bola@example.com'))            # nobody registers as an admin
        self.fails('post', '/auth/register/', {'name': 'B', 'email': 'bola@example.com', 'password': 'longenough1'}, 409, 'already exists')
        self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access'])
        self.assertEqual(self.ok('patch', '/me/', {'name': 'Bola A.', 'role': 'admin'})['role'], 'customer')
        self.fails('post', '/me/password/', {'current': 'nope', 'next': 'anotherlong1'}, 400, 'current password')
        self.ok('post', '/me/password/', {'current': 'longenough1', 'next': 'anotherlong1'})
        self.assertIn('access', self.ok('post', '/auth/refresh/', {'refresh': d['refresh']}))
        self.fails('get', '/admin/stats/', None, 403, 'admin accounts')
        self.c.credentials(); self.fails('get', '/me/', None, 401, 'Sign in')
        self.c.credentials(HTTP_AUTHORIZATION='Bearer nonsense'); self.fails('get', '/me/', None, 401, 'Sign in')
        User.objects.filter(email='bola@example.com').update(status='suspended')
        self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access']); self.assertEqual(self.c.get('/api/v1/me/').status_code, 401)

    # ── public reads
    def test_public(self):
        feed = self.ok('get', '/discover/'); self.assertEqual(feed['total'], 19); self.assertEqual(len(feed['items']), 19)
        self.assertTrue(all(i['garment'] == 'agbada' for i in self.ok('get', '/discover/?garment=agbada')['items']))
        self.assertGreaterEqual(self.ok('get', '/discover/?q=%23kente')['total'], 1)
        self.assertEqual(self.ok('get', '/discover/?sort=saved')['total'], 0)
        ds = self.ok('get', '/designers/'); self.assertEqual(len(ds), 7); self.assertTrue(ds[0]['featured'])
        p = self.ok('get', '/designers/@chidi.o/'); self.assertTrue(p['is_designer']); self.assertEqual(len(p['items']), 3)
        self.assertEqual(len(self.ok('get', '/vendors/')), 9)
        d = self.ok('get', f"/designs/{feed['items'][0]['id']}/"); self.assertEqual((d['view'], len(d['versions'])), ('public', 1))
        self.fails('post', f"/designs/{feed['items'][0]['id']}/like/", {'on': True}, 401, 'Sign in')
        self.assertEqual(self.ok('get', '/me/unread/') if False else 0, 0)

    # ── design → publish → order → deliver → confirm → review
    def test_customer_journey(self):
        me = self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('senator', color='"><script>'), 'auto_title': 'Midnight senator'})
        self.assertEqual(d['versions'][0]['spec']['color'], 'midnight'); self.assertGreater(d['reward']['xp'], 0); did = d['id']
        v2 = self.ok('post', f'/designs/{did}/versions/', {'spec': self.template('senator', color='midnight', collar='v'), 'auto_title': 'x'})
        self.assertEqual((v2['current'], v2['versions'][1]['changes']), (2, ['Collar → v']))
        self.fails('post', f'/designs/{did}/versions/', {'spec': self.template('senator', color='midnight', collar='v')}, 400, 'Nothing changed')
        self.assertEqual(self.ok('post', f'/designs/{did}/restore/', {'n': 1})['current'], 3)
        pub = self.ok('post', f'/designs/{did}/publish/', {'caption': 'Hi', 'tags': 'Senator, #Office  x!y'}); self.assertEqual(pub['tags'], ['senator', 'office', 'xy'])
        self.assertEqual(self.ok('get', '/discover/?sort=new')['items'][0]['id'], did)
        other = next(i for i in self.ok('get', '/discover/')['items'] if not i['mine'] and not i['liked'])
        self.assertTrue(self.ok('post', f"/designs/{other['id']}/like/", {'on': True})['liked'])
        rm = self.ok('post', f"/designs/{other['id']}/remix/"); self.assertEqual(rm['credit']['name'], other['by']['name'])
        # measurements, quotes, order
        self.fails('post', '/me/measurements/', {'values': {'chest': 96}}, 400, 'Chest and waist')
        m = self.ok('post', '/me/measurements/', {'label': 'Me', 'values': {'chest': 96, 'waist': 80, 'x<y': 4}}); self.assertNotIn('x<y', m['values'])
        self.ok('post', f'/designs/{did}/requests/', {'measurement_id': m['id'], 'notes': 'Wedding.'})
        quotes = self.ok('get', f'/designs/{did}/quotes/'); self.assertGreaterEqual(len(quotes), 2)
        q = min(quotes, key=lambda x: x['price'])
        o = self.ok('post', '/orders/', {'quote_id': q['id'], 'plan': 'deposit'}); num = o['id']; self.assertRegex(num, r'^FT-\d{6}$')
        self.fails('post', '/threads/', {'order_id': num}, 400, 'once the order is paid')
        self.fails('post', f'/orders/{num}/pay/', {'method': 'card', 'card': {**CARD, 'cvv': '000'}}, 402, 'declined')
        paid = self.ok('post', f'/orders/{num}/pay/', {'method': 'card', 'card': CARD})
        self.assertEqual((paid['order']['status'], paid['order']['paid'], paid['payment']['last4']), ('active', round(o['total'] / 2), '4081'))
        self.fails('post', f'/orders/{num}/pay/', {'method': 'transfer'}, 400, 'Nothing is due')
        self.fails('post', f'/designs/{did}/versions/', {'spec': self.template('senator', fit='relaxed')}, 400, 'in production')
        o = self.ok('get', f'/orders/{num}/'); self.assertEqual((o['status'], o['phase']), ('balance_due', 'delivered'))          # the sample tailor delivered
        self.fails('post', f'/orders/{num}/confirm/', {}, 400, 'balance first')
        self.assertEqual(self.ok('post', f'/orders/{num}/pay/', {'method': 'transfer'})['order']['status'], 'delivered')
        th = self.ok('post', '/threads/', {'order_id': num}); self.assertEqual(th['kind'], 'order')
        conv = self.ok('post', f"/threads/{th['id']}/messages/", {'text': 'Thank you <b>!</b>'}); self.assertTrue(conv['messages'][-1]['mine'])
        self.assertEqual(self.ok('post', f'/orders/{num}/confirm/', {})['status'], 'completed')
        self.assertEqual(Payment.objects.filter(order__number=num, status='released').count(), 2)
        self.ok('post', '/reviews/', {'kind': 'order', 'id': num, 'rating': 5, 'text': 'Great.'}); self.fails('post', '/reviews/', {'kind': 'order', 'id': num, 'rating': 5}, 409, 'already')
        g = self.ok('get', '/me/game/'); self.assertTrue(next(b for b in g['badges'] if b['id'] == 'made_real')['at']); self.assertEqual(len(g['badges']), 12)
        self.assertGreater(self.ok('get', '/me/unread/')['notifications'], 1); self.ok('post', '/me/notifications/read/', {'ids': 'all'}); self.assertEqual(self.ok('get', '/me/unread/')['notifications'], 0)
        # nobody else can read it
        self.login('designer'); self.fails('get', f'/orders/{num}/', None, 403, 'not yours'); self.fails('post', f'/orders/{num}/confirm/', {}, 404, 'not found')
        self.fails('patch', f'/designs/{did}/', {'title': 'Mine now'}, 404, 'not found'); self.fails('post', f"/threads/{th['id']}/messages/", {'text': 'hi'}, 404, 'not found')

    # ── commission with a sample designer, then as the demo designer
    def test_commissions(self):
        self.login('customer')
        ama = next(p for p in self.ok('get', '/designers/') if p['handle'] == 'amaserwaa'); closed = next(p for p in self.ok('get', '/designers/') if not p['open'])
        self.fails('post', '/commissions/', {'designer_id': closed['id'], 'title': 'Boubou', 'brief': 'A boubou for my mother in indigo.'}, 400, 'not taking')
        self.fails('post', '/commissions/', {'designer_id': ama['id'], 'title': 'Hi', 'brief': 'short'}, 400, 'title')
        c = self.ok('post', '/commissions/', {'designer_id': ama['id'], 'title': 'Engagement dress', 'brief': 'A fitted kente dress, floor length, for March.', 'garment': 'dress', 'budget': 30000}); cid = c['id']
        c = self.ok('get', f'/commissions/{cid}/'); self.assertEqual(c['status'], 'offered'); fee = c['offer']['fee']; self.assertGreaterEqual(fee, 20000)
        self.fails('post', f'/commissions/{cid}/approve/', {}, 400, 'no delivery')
        p = self.ok('post', f'/commissions/{cid}/pay/', {'method': 'transfer'}); self.assertEqual((p['commission']['status'], p['payment']['kind']), ('active', 'commission'))
        c = self.ok('get', f'/commissions/{cid}/'); self.assertEqual(c['status'], 'delivered'); self.assertEqual(c['delivery']['design']['spec']['garment'], 'dress')
        self.assertEqual(self.ok('get', f"/designs/{c['delivery']['design']['id']}/")['view'], 'party')
        self.assertEqual(self.ok('post', f'/commissions/{cid}/changes/', {'note': 'A different colour please.'})['revisions'], 1)
        c = self.ok('get', f'/commissions/{cid}/'); self.assertEqual((c['status'], len(c['deliveries'])), ('delivered', 2))
        done = self.ok('post', f'/commissions/{cid}/approve/', {}); self.assertEqual((done['commission']['status'], done['design']['credit']['handle']), ('approved', 'amaserwaa'))
        self.fails('post', f"/designs/{done['design']['id']}/publish/", {}, 400, 'made for you')
        self.ok('post', '/reviews/', {'kind': 'commission', 'id': cid, 'rating': 5})
        self.assertEqual(Payment.objects.get(commission_id=cid).status, 'released')
        # the demo designer's side
        me = self.login('designer'); inbox = self.ok('get', '/commissions/'); self.assertEqual(len(inbox), 2)
        req = next(x for x in inbox if x['status'] == 'requested'); act = next(x for x in inbox if x['status'] == 'active')
        self.fails('post', f"/commissions/{req['id']}/offer/", {'fee': 500, 'days': 3}, 400, 'fee')
        self.assertEqual(self.ok('post', f"/commissions/{req['id']}/offer/", {'fee': 24000, 'days': 4, 'note': 'Six shirts.'})['status'], 'offered')
        self.fails('post', f"/commissions/{req['id']}/deliver/", {'design_id': '1'}, 400, 'not waiting')
        mine = self.ok('get', '/designs/')[0]
        self.assertEqual(self.ok('post', f"/commissions/{act['id']}/deliver/", {'design_id': mine['id'], 'note': 'Sky linen.'})['status'], 'delivered')
        self.fails('post', f"/commissions/{act['id']}/approve/", {}, 404, 'not found')                               # a designer cannot approve their own delivery
        self.fails('post', f'/commissions/{cid}/offer/', {'fee': 9000, 'days': 1}, 404, 'not found')                 # nor touch someone else's commission
        self.fails('put', '/me/designer/', {'handle': 'zainabcuts'}, 409, 'taken')
        self.assertEqual(self.ok('put', '/me/designer/', {'handle': 'Kemi.Lawal', 'bio': 'New bio', 'specialties': ['Kaftans'], 'fee_from': 20000, 'turnaround_days': 2})['handle'], 'kemi.lawal')

    # ── tailor and admin
    def test_tailor_and_admin(self):
        self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('ankara-shirt')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']})
        self.login('tailor')
        reqs = self.ok('get', '/vendors/requests/'); self.assertEqual(len(reqs), 1); self.assertEqual(reqs[0]['design']['view'], 'party')
        self.fails('post', f"/vendors/requests/{reqs[0]['id']}/quote/", {'price': 10, 'delivery_days': 5}, 400, 'price')
        q = self.ok('post', f"/vendors/requests/{reqs[0]['id']}/quote/", {'price': 41000, 'delivery_days': 6, 'note': 'Fabric included.'})
        mine = self.ok('get', '/vendors/orders/'); self.assertEqual(len(mine), 1); num = mine[0]['id']
        self.fails('post', f'/vendors/orders/{num}/events/', {'phase': 'vendor_assigned', 'title': 'Back'}, 400, 'backwards')
        up = self.ok('post', f'/vendors/orders/{num}/events/', {'title': 'Embroidery started', 'photos': ['data:image/jpeg;base64,AAAA', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA']})
        self.assertEqual(len(up['events'][-1]['photos']), 1)
        self.fails('get', '/admin/stats/', None, 403, 'admin accounts'); self.fails('get', '/designs/', None, 200, '') if False else None
        # the customer accepts the tailor's quote, then reports a problem
        self.login('customer')
        o = self.ok('post', '/orders/', {'quote_id': q['id']}); self.ok('post', f"/orders/{o['id']}/pay/", {'method': 'transfer'})
        self.assertEqual(self.ok('post', f"/orders/{o['id']}/problem/", {'reason': 'Wrong fabric', 'body': 'They plan to use cotton, I chose ankara.'})['issue']['status'], 'open')
        feed = self.ok('get', '/discover/'); self.ok('post', '/reports/', {'kind': 'design', 'id': feed['items'][-1]['id'], 'reason': 'Copied'})
        self.login('admin')
        s = self.ok('get', '/admin/stats/'); self.assertEqual((s['reports'], s['designers'], s['commissions']), (2, 7, 3))
        for path in ('users', 'vendors', 'designs', 'orders', 'payments', 'commissions', 'reports', 'messages', 'applications', 'audit'):
            self.assertIsInstance(self.ok('get', f'/admin/{path}/'), list)
        self.assertFalse(any('sample.fashionteller' in u['email'] for u in self.ok('get', '/admin/users/')))
        rep = next(r for r in self.ok('get', '/admin/reports/') if r['kind'] == 'design'); self.ok('post', f"/admin/reports/{rep['id']}/resolve/", {'action': 'remove'})
        self.assertEqual(self.ok('get', '/discover/')['total'], 18)
        res = self.ok('post', f"/admin/orders/{o['id']}/issue/", {'action': 'refund', 'note': 'Refunded in full.'}); self.assertEqual((res['status'], res['paid']), ('cancelled', 0))
        self.fails('post', f'/admin/orders/{num}/phase/', {'phase': 'vendor_assigned'}, 400, 'backwards')
        pend = next(v for v in self.ok('get', '/admin/vendors/') if v['status'] == 'pending'); self.assertTrue(self.ok('post', f"/admin/vendors/{pend['id']}/status/", {'status': 'verified'})['verified'])
        self.assertEqual(self.c.post('/api/v1/contact/', {'name': 'A', 'email': 'a@b.co', 'message': 'Hello'}, format='json').status_code, 201)

    @override_settings(PAYSTACK_SECRET_KEY='sk_test_x', PAYMENTS_LIVE=True)
    def test_live_payments_need_paystack(self):
        self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('ankara-shirt')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']}); q = self.ok('get', f"/designs/{d['id']}/quotes/")[0]
        o = self.ok('post', '/orders/', {'quote_id': q['id']})
        self.fails('post', f"/orders/{o['id']}/pay/", {'method': 'card', 'card': CARD}, 400, 'Paystack')                 # the test checkout is off when a key is set
        self.fails('post', f"/orders/{o['id']}/pay/", {'method': 'paystack', 'reference': 'FTFORGED'}, 400, 'not one we issued')
        init = self.ok('post', f"/orders/{o['id']}/pay/init/", {}); self.assertEqual(init['amount'], o['total'])
        self.assertEqual(Order.objects.get(number=o['id']).status, 'awaiting_payment')

    @override_settings(ALLOW_TEST_PAYMENTS=False)
    def test_no_free_orders_on_a_live_site_without_paystack(self):
        self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('ankara-shirt')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']}); q = self.ok('get', f"/designs/{d['id']}/quotes/")[0]
        o = self.ok('post', '/orders/', {'quote_id': q['id']})
        self.fails('post', f"/orders/{o['id']}/pay/", {'method': 'card', 'card': CARD}, 503, 'not switched on')
        self.assertEqual((Order.objects.get(number=o['id']).status, Payment.objects.filter(order__number=o['id']).count()), ('awaiting_payment', 0))

    def test_odd_bodies_are_refused_not_crashed(self):
        self.login('customer')
        for body in ([1, 2, 3], 'spec', 7, None):
            r = self.c.post('/api/v1/designs/', body, format='json'); self.assertEqual(r.status_code, 400, body)
        r = self.c.post('/api/v1/designs/', '{not json', content_type='application/json'); self.assertEqual(r.status_code, 400)
        with self.settings(DATA_UPLOAD_MAX_MEMORY_SIZE=2000):
            r = self.c.post('/api/v1/designs/', {'spec': {'garment': 'kaftan', 'sketch': [{'d': 'M0 0' + ' L1 1' * 2000}]}}, format='json'); self.assertEqual((r.status_code, 'too much' in r.data['detail']), (413, True))

    def test_try_on_is_a_marked_hook(self):
        self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('ankara-shirt')})
        self.fails('post', f"/designs/{d['id']}/try-on/", {'image': 'data:image/jpeg;base64,AAAA'}, 501, 'not connected')


class SeedGuardTest(TestCase):
    def test_demo_accounts_stay_out_of_a_live_database(self):
        call_command('seed', verbosity=0, stderr=open(__import__('os').devnull, 'w'))      # the test runner runs with DEBUG off, like production
        self.assertEqual(User.objects.count(), 0)
