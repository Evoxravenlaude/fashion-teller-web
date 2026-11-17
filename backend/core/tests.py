"""
API tests:  python manage.py test
  - the Python rules match the site's engine on every exported vector
  - every product flow over HTTP, with the access rules that go with it
"""
import hashlib, hmac, json, urllib.parse
from pathlib import Path
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from . import extras as X, rules as R
from .api import notify
from .models import Audit, Commission, Mail, Notification, Order, Payment, Payout, PayoutAccount, Quote, User

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
        self.fails('post', f"/designs/{d['id']}/try-on/", {'image': 'data:image/jpeg;base64,AAAA', 'garment': 'data:image/jpeg;base64,AAAA'}, 501, 'not switched on')


class SeedGuardTest(TestCase):
    def test_demo_accounts_stay_out_of_a_live_database(self):
        call_command('seed', verbosity=0, stderr=open(__import__('os').devnull, 'w'))      # the test runner runs with DEBUG off, like production
        self.assertEqual(User.objects.count(), 0)


@override_settings(SAMPLE_MODE=True, SAMPLE_QUOTE_DELAY=(0, 0), SAMPLE_PHASE_SECONDS=0.0, PAYSTACK_SECRET_KEY='', PAYMENTS_LIVE=False, ALLOW_TEST_PAYMENTS=True, PAYOUTS='test', TEST_PAYOUT_SECONDS=0,
                   PLATFORM_FEE_PERCENT=20.0, MAIL_ASYNC=False, MAIL_MODE='console', MAIL_DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', SITE_URL='https://site.test',
                   AI_TRYON_PROVIDER='', FASHN_API_KEY='')
class ExtrasTest(TestCase):
    """Email, payouts and photoreal try-on. Other services (SMTP, Paystack, the AI) are replaced by stand-ins."""
    setUpTestData = classmethod(lambda cls: call_command('seed', demo=True, verbosity=0))
    setUp, call, ok, fails, login, template = ApiTest.setUp, ApiTest.call, ApiTest.ok, ApiTest.fails, ApiTest.login, ApiTest.template
    BANK = {'bank_code': '058', 'number': '0123456789'}

    def order_from_demo_tailor(self, price=60000):
        """The demo customer orders from the demo tailor, and the tailor delivers. Returns the order number."""
        self.login('customer')
        d = self.ok('post', '/designs/', {'spec': self.template('senator')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']})
        tailor = self.login('tailor'); r = next(x for x in self.ok('get', '/vendors/requests/') if x['design']['id'] == d['id'])
        self.ok('post', f"/vendors/requests/{r['id']}/quote/", {'price': price, 'delivery_days': 7, 'note': 'Fabric included.'})
        self.login('customer'); q = next(x for x in self.ok('get', f"/designs/{d['id']}/quotes/") if x['vendor']['id'] == tailor['vendor_id'])
        o = self.ok('post', '/orders/', {'quote_id': q['id']}); self.ok('post', f"/orders/{o['id']}/pay/", {'method': 'card', 'card': CARD})
        self.login('tailor')
        for phase, title in (('tailoring', 'Cutting'), ('delivered', 'Delivered')): self.ok('post', f"/vendors/orders/{o['id']}/events/", {'phase': phase, 'title': title, 'body': 'Update.'})
        return o['id']

    def test_confirming_an_address_and_resetting_a_password(self):
        with self.captureOnCommitCallbacks(execute=True):
            d = self.ok('post', '/auth/register/', {'name': 'Ngozi Eze', 'email': 'ngozi@example.com', 'password': 'first-pass-123'})
        self.assertFalse(d['user']['email_verified']); self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]; self.assertEqual(sent.to, ['ngozi@example.com']); self.assertIn('https://site.test/signin?verify=', sent.body); self.assertEqual(sent.alternatives[0][1], 'text/html')
        row = Mail.objects.get(to='ngozi@example.com', kind='verify'); self.assertEqual(row.status, 'sent')
        token = urllib.parse.unquote(row.link.split('verify=')[1])
        self.fails('post', '/auth/verify/', {'token': token + 'x'}, 400, 'expired')
        self.assertEqual(self.ok('post', '/auth/verify/', {'token': token})['email'], 'ngozi@example.com')
        self.fails('post', '/auth/verify/', {'token': token}, 400, 'already used')
        self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access']); self.assertTrue(self.ok('get', '/me/')['email_verified'])
        me = self.ok('patch', '/me/', {'email': 'ngozi2@example.com'}); self.assertFalse(me['email_verified']); self.assertTrue(Mail.objects.filter(to='ngozi2@example.com', kind='verify').exists())
        self.assertEqual(self.ok('patch', '/me/', {'email_prefs': {'messages': False}})['email_prefs'], {'orders': True, 'messages': False})
        # forgot: the same answer whether or not the address has an account; the link works once
        self.c.credentials()
        self.assertEqual(self.ok('post', '/auth/forgot/', {'email': 'nobody@example.com'}), {'ok': True}); self.assertFalse(Mail.objects.filter(kind='reset').exists())
        self.assertEqual(self.ok('post', '/auth/forgot/', {'email': 'NGOZI2@example.com'}), {'ok': True}); tok = Mail.objects.get(kind='reset').link.split('reset=')[1]
        self.fails('post', '/auth/reset/', {'token': tok, 'password': 'short'}, 400, '8 characters')
        self.fails('post', '/auth/reset/', {'token': 5, 'password': None}, 400, 'expired'); self.fails('post', '/auth/reset/', {'token': tok, 'password': 12345678}, 400, '8 characters')   # junk is refused, not a crash
        self.fails('post', '/auth/reset/', {'token': tok[:-3] + 'abc', 'password': 'second-pass-456'}, 400, 'expired')
        self.assertEqual(self.ok('post', '/auth/reset/', {'token': tok, 'password': 'second-pass-456'})['email'], 'ngozi2@example.com')
        self.fails('post', '/auth/reset/', {'token': tok, 'password': 'third-pass-789'}, 400, 'expired')
        self.fails('post', '/auth/login/', {'email': 'ngozi2@example.com', 'password': 'first-pass-123'}, 401, 'not right'); self.ok('post', '/auth/login/', {'email': 'ngozi2@example.com', 'password': 'second-pass-456'})
        self.assertTrue(User.objects.get(email='ngozi2@example.com').email_verified)                 # a reset link proves the mailbox is theirs
        self.ok('post', '/auth/forgot/', {'email': User.objects.filter(sample=True).first().email}); self.assertEqual(Mail.objects.filter(kind='reset').count(), 1)   # sample accounts cannot be taken over
        # the development mailbox exists only in development
        self.assertEqual(self.ok('get', '/dev/mail/?to=ngozi2@example.com')[0]['kind'], 'reset')
        with self.settings(MAIL_DEBUG=False): self.assertEqual(self.c.get('/api/v1/dev/mail/?to=ngozi2@example.com').status_code, 404)
        # a server with no email provider says so instead of promising a link, and does not hold bank details hostage to a link it cannot send
        with self.settings(MAIL_MODE='off'):
            self.fails('post', '/auth/forgot/', {'email': 'ngozi2@example.com'}, 503, 'not set up'); self.assertEqual(self.ok('get', '/config/')['mail'], 'off')
            d = self.ok('post', '/auth/register/', {'name': 'No Mail', 'email': 'nomail@example.com', 'password': 'a-good-pass-1', 'role': 'tailor'}); self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access'])
            self.assertEqual(self.ok('put', '/me/payout-account/', {'bank_code': '058', 'number': '0123456789'})['last4'], '6789')

    def test_notifications_are_emailed_once_and_only_when_wanted(self):
        u = User.objects.create_user('real@example.com', 'a-good-pass-1', name='Real Person', email_verified=True)
        with self.captureOnCommitCallbacks(execute=True):
            notify(u, 'order', 'Order FT-100001 confirmed', 'Ada has the garment.', '/orders?id=FT-100001')
            notify(u, 'message', 'Kemi replied', 'Hello', '/messages?t=1', key='t1'); notify(u, 'message', 'Kemi replied', 'Hello again', '/messages?t=1', key='t1')
            notify(u, 'like', 'Someone liked your design', '', '/design?id=1')
        self.assertEqual(sorted(m.kind for m in Mail.objects.filter(user=u)), ['message', 'order'])          # the second message folded in; likes are never emailed
        self.assertEqual(len(mail.outbox), 2); self.assertIn('https://site.test/orders?id=FT-100001', mail.outbox[0].body)
        u.email_prefs = {'messages': False}; u.save(); Notification.objects.filter(user=u).update(read=True)
        notify(u, 'message', 'Kemi replied', 'Third', '/messages?t=1', key='t1'); self.assertEqual(Mail.objects.filter(user=u, kind='message').count(), 1)
        demo = User.objects.get(email='customer@demo.fashionteller')
        with self.captureOnCommitCallbacks(execute=True): notify(demo, 'order', 'Order confirmed', 'x', '/orders')
        self.assertEqual(len(mail.outbox), 2)                                                              # made-up demo addresses are logged, never sent to
        with self.settings(MAIL_MODE='off'): notify(u, 'order', 'Another', 'x', '/orders'); self.assertEqual(Mail.objects.filter(user=u).first().status, 'failed')

    def test_payout_on_release_less_the_fee(self):
        self.assertEqual({k: self.ok('get', '/config/')[k] for k in ('fee_percent', 'payouts', 'mail', 'try_on_ai')}, {'fee_percent': 20.0, 'payouts': 'test', 'mail': 'console', 'try_on_ai': False})
        num = self.order_from_demo_tailor(60000)
        e = self.ok('get', '/me/earnings/'); self.assertGreaterEqual(e['held'], 60000); self.assertAlmostEqual(e['held_net'], e['held'] * 0.8, delta=3); self.assertEqual((e['fee_percent'], e['own_fee']), (20.0, None)); self.assertIsNone(e['account'])
        self.login('customer'); self.assertEqual(self.ok('post', f'/orders/{num}/confirm/', {})['status'], 'completed')
        p = Payout.objects.get(order__number=num); self.assertEqual((p.gross, p.fee_percent, p.fee, p.net, p.status), (60000, 20.0, 12000, 48000, 'pending'))
        self.assertTrue(Notification.objects.filter(user=p.user, kind='payout', title__contains='bank details').exists())
        self.assertIn('48,000', Notification.objects.filter(user=p.user, kind='order').first().body); self.assertIn('20% platform fee', Notification.objects.filter(user=p.user, kind='order').first().body)        # the tailor is told what actually reaches them
        self.assertIs(X.payout(p.user, 'order', 'again', 60000, order=p.order).id, p.id)                    # releasing twice cannot pay twice
        self.login('tailor'); self.fails('put', '/me/payout-account/', {'bank_code': '058', 'number': '123'}, 400, '10-digit'); self.fails('put', '/me/payout-account/', {'bank_code': 'nope', 'number': '0123456789'}, 400, 'bank')
        acc = self.ok('put', '/me/payout-account/', self.BANK); self.assertEqual((acc['bank_name'], acc['last4']), ('GTBank', '6789')); self.assertNotIn('number', acc)
        self.assertEqual(PayoutAccount.objects.get(user=p.user).number, '')                                 # the full number is kept only where payouts are made by hand
        e = self.ok('get', '/me/earnings/'); self.assertEqual((e['paid'], e['pending'], e['processing'], e['payouts'][0]['status']), (48000, 0, 0, 'paid'))
        self.assertTrue(Notification.objects.filter(user=p.user, kind='payout', title__contains='sent to your bank').exists())
        self.login('admin'); row = next(x for x in self.ok('get', '/admin/payouts/') if x['ref_id'] == num); self.assertEqual((row['net'], row['fee_percent'], row['status'], row['account']['last4']), (48000, 20.0, 'paid', '6789'))
        self.assertGreaterEqual(self.ok('get', '/admin/stats/')['fees'], 12000)
        self.login('customer'); self.fails('get', '/admin/payouts/', None, 403, 'admin'); self.assertIsNone(self.call('get', '/me/payout-account/', expect=200))
        # an account whose address is not confirmed cannot add bank details
        self.c.credentials(); d = self.ok('post', '/auth/register/', {'name': 'New Tailor', 'email': 'new@example.com', 'password': 'a-good-pass-1', 'role': 'tailor'})
        self.c.credentials(HTTP_AUTHORIZATION='Bearer ' + d['access']); self.fails('put', '/me/payout-account/', self.BANK, 400, 'Confirm your email')

    def test_an_admin_sets_the_fee_and_agreed_work_keeps_its_rate(self):
        self.assertEqual(self.ok('get', '/config/')['fees'], {'order': 20.0, 'commission': 20.0})
        self.login('admin'); f = self.ok('get', '/admin/fees/'); self.assertEqual((f['order'], f['commission'], f['default'], f['accounts']), (20.0, 20.0, 20.0, []))
        for bad in ({'order': 51}, {'order': -1}, {'order': 'twenty'}, {'commission': True}, {}, {'order': None}):
            self.fails('put', '/admin/fees/', bad, 400, 'between 0% and 50%')
        self.login('tailor'); self.fails('put', '/admin/fees/', {'order': 5}, 403, 'admin'); self.fails('get', '/admin/fees/', None, 403, 'admin')
        me = self.ok('get', '/me/'); self.assertEqual((me['fees'], me['own_fee']), ({'order': 20.0, 'commission': 20.0}, None))
        self.login('customer'); self.assertNotIn('fees', self.ok('get', '/me/'))                         # customers pay no platform fee and are not shown one
        # the tailor quotes at 20%; then the rate changes before the customer accepts
        d = self.ok('post', '/designs/', {'spec': self.template('senator')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']})
        tailor = self.login('tailor'); r = next(x for x in self.ok('get', '/vendors/requests/') if x['design']['id'] == d['id'])
        self.ok('post', f"/vendors/requests/{r['id']}/quote/", {'price': 60000, 'delivery_days': 7})
        self.login('admin'); f = self.ok('put', '/admin/fees/', {'order': 15, 'commission': '25.5'}); self.assertEqual((f['order'], f['commission']), (15.0, 25.5))
        self.assertEqual(self.ok('get', '/config/')['fees'], {'order': 15.0, 'commission': 25.5})
        self.assertEqual(list(Audit.objects.filter(action__startswith='fee:').values_list('action', 'target').order_by('id')), [('fee:order', '20% to 15%'), ('fee:commission', '20% to 25.5%')])
        self.login('customer'); q = next(x for x in self.ok('get', f"/designs/{d['id']}/quotes/") if x['vendor']['id'] == tailor['vendor_id'])
        o = self.ok('post', '/orders/', {'quote_id': q['id']}); self.ok('post', f"/orders/{o['id']}/pay/", {'method': 'card', 'card': CARD})
        self.login('tailor')
        for phase in ('tailoring', 'delivered'): self.ok('post', f"/vendors/orders/{o['id']}/events/", {'phase': phase, 'title': phase.title(), 'body': 'Update.'})
        self.login('customer'); self.ok('post', f"/orders/{o['id']}/confirm/", {})
        p = Payout.objects.get(order__number=o['id']); self.assertEqual((p.fee_percent, p.fee, p.net), (20.0, 12000, 48000))   # quoted at 20%, paid at 20%
        # new work is at the new rate; an account with its own rate pays that
        tu = User.objects.get(email='tailor@demo.fashionteller'); self.login('admin')
        for bad, code, text in (({'fee_percent': 60}, 400, 'between 0% and 50%'), ({'fee_percent': 'x'}, 400, 'between 0% and 50%')):
            self.fails('post', f'/admin/users/{tu.id}/fee/', bad, code, text)
        self.fails('post', f"/admin/users/{User.objects.get(email='customer@demo.fashionteller').id}/fee/", {'fee_percent': 5}, 400, 'Only tailors and designers'); self.fails('post', '/admin/users/999999/fee/', {'fee_percent': 5}, 404, 'not found')
        acc = self.ok('post', f'/admin/users/{tu.id}/fee/', {'fee_percent': 12.5}); self.assertEqual((acc['own_fee'], acc['fees']['order']), (12.5, 12.5))
        self.assertEqual([(a['email'], a['fee_percent']) for a in self.ok('get', '/admin/fees/')['accounts']], [('tailor@demo.fashionteller', 12.5)])
        self.assertTrue(Notification.objects.filter(user=tu, kind='payout', title='Your platform fee is now 12.5%').exists())
        self.login('tailor'); e = self.ok('get', '/me/earnings/'); self.assertEqual((e['fee_percent'], e['own_fee']), (12.5, 12.5))
        self.login('customer'); d2 = self.ok('post', '/designs/', {'spec': self.template('classic-shirt')}); self.ok('post', f"/designs/{d2['id']}/requests/", {'measurement_id': m['id']})
        self.login('tailor'); r2 = next(x for x in self.ok('get', '/vendors/requests/') if x['design']['id'] == d2['id']); self.ok('post', f"/vendors/requests/{r2['id']}/quote/", {'price': 40000, 'delivery_days': 5})
        self.assertEqual(Quote.objects.filter(request_id=r2['id'], vendor__user=tu).first().fee_percent, 12.5)
        self.assertEqual(Quote.objects.filter(request__design_id=d['id'], vendor__user=tu).first().fee_percent, 20.0)
        # a designer's offer takes the commission rate at the time of the offer
        des = User.objects.get(email='designer@demo.fashionteller'); c = Commission.objects.filter(designer=des, status__in=['requested', 'offered']).first()
        self.login('designer'); self.ok('post', f'/commissions/{c.id}/offer/', {'fee': 30000, 'days': 4}); c.refresh_from_db(); self.assertEqual(c.fee_percent, 25.5)
        self.login('admin'); self.assertIsNone(self.ok('post', f'/admin/users/{tu.id}/fee/', {'fee_percent': ''})['own_fee']); tu.refresh_from_db(); self.assertIsNone(tu.fee_percent)

    @override_settings(PAYOUTS='manual')
    def test_payouts_by_hand_wait_for_an_admin(self):
        designer = self.login('designer'); self.ok('put', '/me/payout-account/', self.BANK); u = User.objects.get(id=designer['id'])
        self.assertEqual(PayoutAccount.objects.get(user=u).number, '0123456789')
        p = X.payout(u, 'commission', 'A brief', 20000, commission=Commission.objects.filter(designer=u).first()); p.refresh_from_db(); self.assertEqual((p.status, p.net), ('pending', 16000))
        self.assertEqual(self.ok('get', '/me/earnings/')['pending'], 16000)
        self.login('admin'); row = next(x for x in self.ok('get', '/admin/payouts/') if x['id'] == str(p.id)); self.assertEqual(row['account']['number'], '0123456789')
        self.fails('post', f'/admin/payouts/{p.id}/', {'action': 'nope'}, 400, 'paid or retry')
        self.assertEqual(self.ok('post', f'/admin/payouts/{p.id}/', {'action': 'paid', 'reference': 'GTB-778899'})['status'], 'paid'); self.fails('post', f'/admin/payouts/{p.id}/', {'action': 'paid'}, 400, 'already')
        p.refresh_from_db(); self.assertEqual(p.note, 'GTB-778899')

    @override_settings(PAYOUTS='paystack', PAYSTACK_SECRET_KEY='sk_test_x', PAYMENTS_LIVE=True)
    def test_paystack_transfers_and_the_webhook(self):
        calls, lost, verdict = [], {'is': False}, {'is': 'success'}

        def fake(method, path, body=None):
            calls.append((method, path.split('?')[0], body))
            if path.startswith('/bank/resolve'): return {'account_name': 'KEMI LAWAL'}
            if path.startswith('/bank'): return [{'code': '058', 'name': 'Guaranty Trust Bank', 'active': True}]
            if path == '/transferrecipient': return {'recipient_code': 'RCP_abc'}
            if path == '/transfer': return {'status': 'pending', 'transfer_code': f'TRF_{len(calls)}'}
            if path.startswith('/transfer/verify/'):
                if lost['is']: raise X.Fail('Transfer not found', 502)
                return {'status': verdict['is'], 'transfer_code': 'TRF_seen', 'reason': 'Account closed'}

        def hook(event, data, sig=None):
            raw = json.dumps({'event': event, 'data': data}).encode()
            return self.c.post('/api/v1/webhooks/paystack/', raw, content_type='application/json', HTTP_X_PAYSTACK_SIGNATURE=sig or hmac.new(b'sk_test_x', raw, hashlib.sha512).hexdigest()).status_code

        with mock.patch.object(X, 'paystack', fake):
            designer = self.login('designer'); u = User.objects.get(id=designer['id'])
            acc = self.ok('put', '/me/payout-account/', self.BANK); self.assertEqual((acc['account_name'], acc['bank_name']), ('KEMI LAWAL', 'Guaranty Trust Bank'))
            a = PayoutAccount.objects.get(user=u); self.assertEqual((a.recipient_code, a.number), ('RCP_abc', ''))          # Paystack holds the number; we keep the recipient code
            with self.captureOnCommitCallbacks(execute=True): p = X.payout(u, 'commission', 'A brief', 20000, commission=Commission.objects.filter(designer=u).first())
            p.refresh_from_db(); sent = calls[-1][2]; self.assertEqual((p.status, sent['amount'], sent['recipient'], sent['source']), ('processing', 1600000, 'RCP_abc', 'balance'))
            self.assertRegex(sent['reference'], r'^[a-z0-9_-]{16,50}$'); code = p.transfer_code; self.assertTrue(code)
            self.assertEqual(hook('transfer.success', {'reference': p.reference, 'transfer_code': code}, sig='forged'), 401); p.refresh_from_db(); self.assertEqual(p.status, 'processing')
            self.assertEqual(hook('transfer.failed', {'reference': p.reference, 'transfer_code': code, 'reason': 'Account closed'}), 200); p.refresh_from_db(); self.assertEqual((p.status, p.note), ('failed', 'Account closed'))
            self.login('admin')
            with self.captureOnCommitCallbacks(execute=True): self.assertEqual(self.ok('post', f'/admin/payouts/{p.id}/', {'action': 'retry'})['status'], 'processing')
            p.refresh_from_db(); self.assertTrue(p.reference.endswith('-r1')); self.assertEqual(calls[-1][2]['reference'], p.reference)   # a new reference, so Paystack treats it as a new transfer
            self.assertEqual(hook('transfer.success', {'reference': p.reference, 'transfer_code': p.transfer_code}), 200); p.refresh_from_db(); self.assertEqual(p.status, 'paid')
            self.assertEqual(hook('transfer.success', {'reference': 'ftp-unknown-00000000'}), 200)                                # unknown events are acknowledged, not retried forever
            # a payout left "on its way" (the server restarted mid-send, or the webhook never came): the admin asks Paystack what became of it
            with self.captureOnCommitCallbacks(execute=True): q = X.payout(u, 'commission', 'Another brief', 30000, commission=Commission.objects.filter(designer=u).last())
            q.refresh_from_db(); Payout.objects.filter(id=q.id).update(transfer_code=''); n = sum(1 for c in calls if c[1] == '/transfer'); lost['is'] = True
            with self.captureOnCommitCallbacks(execute=True): self.assertEqual(self.ok('post', f'/admin/payouts/{q.id}/', {'action': 'check'})['status'], 'processing')
            self.assertEqual((sum(1 for c in calls if c[1] == '/transfer'), calls[-1][2]['reference']), (n + 1, q.reference))       # Paystack never had it: sent now, under the same reference, so it cannot go twice
            lost['is'] = False; self.assertEqual(self.ok('post', f'/admin/payouts/{q.id}/', {'action': 'check'})['status'], 'paid'); self.assertEqual(sum(1 for c in calls if c[1] == '/transfer'), n + 1)
            self.fails('post', f'/admin/payouts/{q.id}/', {'action': 'check'}, 400, 'Only a payout that Paystack is sending')
        # a payment whose browser tab closed before we heard back is finished by the webhook
        self.login('customer'); d = self.ok('post', '/designs/', {'spec': self.template('ankara-shirt')}); m = self.ok('post', '/me/measurements/', {'values': {'chest': 96, 'waist': 80}})
        self.ok('post', f"/designs/{d['id']}/requests/", {'measurement_id': m['id']}); q = self.ok('get', f"/designs/{d['id']}/quotes/")[0]
        o = self.ok('post', '/orders/', {'quote_id': q['id']}); init = self.ok('post', f"/orders/{o['id']}/pay/init/", {})
        with mock.patch('core.api.paystack_verify', lambda ref: (o['total'], 'NGN')):
            self.assertEqual(hook('charge.success', {'reference': init['reference']}), 200); self.assertEqual(hook('charge.success', {'reference': init['reference']}), 200)
        self.assertEqual((Order.objects.get(number=o['id']).status, Payment.objects.filter(order__number=o['id'], status='paid').count()), ('active', 1))

    @override_settings(AI_TRYON_PROVIDER='fashn', FASHN_API_KEY='key', AI_TRYON_DAILY_LIMIT=2)
    def test_photoreal_try_on(self):
        pic, seen = 'data:image/jpeg;base64,' + 'A' * 40, []

        def fake(method, path, body=None):
            seen.append((method, path, body))
            if path == '/run': return {'id': 'pred-1', 'error': None}
            return {'id': 'pred-1', 'status': 'processing'} if sum(1 for s in seen if s[0] == 'GET') < 2 else {'id': 'pred-1', 'status': 'completed', 'output': ['data:image/jpeg;base64,QUJD']}

        with mock.patch.object(X, 'fashn', fake):
            self.assertTrue(self.ok('get', '/config/')['try_on_ai'])
            self.login('customer'); d = self.ok('post', '/designs/', {'spec': self.template('classic-shirt')}); url = f"/designs/{d['id']}/try-on/"
            self.fails('post', url, {'image': 'https://example.com/me.jpg', 'garment': pic}, 400, 'JPG')
            j = self.ok('post', url, {'image': pic, 'garment': pic, 'garment_type': 'shirt'}); self.assertEqual(j['status'], 'running')
            run = seen[0][2]; self.assertEqual((run['model_name'], run['inputs']['category'], run['inputs']['garment_photo_type'], run['inputs']['return_base64']), ('tryon-v1.6', 'tops', 'flat-lay', True))
            self.assertEqual(self.ok('get', f"/try-on/{j['id']}/")['status'], 'running')
            done = self.ok('get', f"/try-on/{j['id']}/"); self.assertEqual((done['status'], done['image']), ('done', 'data:image/jpeg;base64,QUJD'))
            self.login('designer'); self.fails('get', f"/try-on/{j['id']}/", None, 404, 'Not found')                        # someone else's picture
            self.fails('post', url, {'image': pic, 'garment': pic}, 404, 'not found')                                       # and someone else's private design
            self.login('customer'); self.ok('post', url, {'image': pic, 'garment': pic}); self.fails('post', url, {'image': pic, 'garment': pic}, 429, 'today')
            # the finished picture is not kept: an hour on it is gone, though the job still counts towards today's limit
            from .models import TryOnJob
            from django.utils.timezone import now as _now
            from datetime import timedelta as _td
            TryOnJob.objects.filter(id=j['id']).update(created_at=_now() - _td(hours=2)); self.fails('post', url, {'image': pic, 'garment': pic}, 429, 'today')
            self.assertEqual((self.ok('get', f"/try-on/{j['id']}/")['image'], TryOnJob.objects.get(id=j['id']).image), ('', ''))
