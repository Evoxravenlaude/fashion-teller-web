"""Access-control probe against the running Django API: one user must never read or change another user's things."""
import json, sys, time, urllib.request, urllib.error, random
API = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000') + '/api/v1'
def call(method, path, body=None, token=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return r.status, json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw or 'null')
        except Exception: return e.code, raw[:200].decode('utf8', 'replace')
passed = failed = 0
def expect(label, got, allowed):
    global passed, failed
    ok = got[0] in allowed
    passed += ok; failed += (not ok)
    if not ok: print(f'  FAIL {label}: got {got[0]} {str(got[1])[:160]} (wanted one of {allowed})')
def user(tag):
    email = f'{tag}{random.randrange(10**9)}@probe.test'
    s, d = call('POST', '/auth/register/', {'name': tag.title() + ' Probe', 'email': email, 'password': 'probe-pass-123'})
    assert s < 300, (s, d); return d['access'], d['user']
def login(email):
    s, d = call('POST', '/auth/login/', {'email': email, 'password': 'fashion2026'}); assert s < 300, (s, d); return d['access']

A, ua = user('alice'); B, ub = user('bob')
spec = {'garment': 'kaftan', 'fabric': 'silk', 'color': '#0A1128'}
s, d = call('POST', '/designs/', {'spec': spec}, A); assert s == 201, (s, d); did = d['id']
s, m = call('POST', '/me/measurements/', {'label': 'Me', 'values': {'chest': 96, 'waist': 80, 'hip': 98, 'height': 172}}, A); assert s == 201, (s, m); mid = m['id']
s, r = call('POST', f'/designs/{did}/requests/', {'measurement_id': mid}, A); assert s < 300, (s, r)
quotes = []
for _ in range(30):
    s, quotes = call('GET', f'/designs/{did}/quotes/', token=A)
    if s == 200 and quotes: break
    time.sleep(0.5)
assert quotes, 'no quotes arrived'
s, o = call('POST', '/orders/', {'quote_id': quotes[0]['id']}, A); assert s < 300, (s, o); num = o['id']
s, designers = call('GET', '/designers/'); des = designers[0] if isinstance(designers, list) else designers['items'][0]
s, c = call('POST', '/commissions/', {'designer_id': des['id'], 'title': 'Probe brief', 'brief': 'A dress for a wedding in December, emerald, long sleeves.', 'budget': 40000}, A); assert s < 300, (s, c); cid = c['id']
s, t = call('POST', '/threads/', {'commission_id': cid}, A); assert s < 300, (s, t); tid = t['id']

# 1. signed out: nothing private
for meth, path in [('GET', '/me/'), ('GET', '/designs/'), ('GET', f'/designs/{did}/'), ('GET', '/orders/'), ('GET', f'/orders/{num}/'), ('GET', '/commissions/'), ('GET', f'/commissions/{cid}/'), ('GET', '/threads/'), ('GET', f'/threads/{tid}/'),
                   ('GET', '/me/measurements/'), ('GET', '/admin/stats/'), ('GET', '/admin/users/'), ('GET', '/vendors/orders/'), ('POST', f'/orders/{num}/pay/'), ('POST', '/designs/'),
                   ('GET', '/me/earnings/'), ('GET', '/me/payout-account/'), ('PUT', '/me/payout-account/'), ('GET', '/payouts/banks/'), ('GET', '/admin/payouts/'), ('POST', '/admin/payouts/1/'), ('POST', '/me/verify/send/'),
                   ('POST', f'/designs/{did}/try-on/'), ('GET', '/try-on/1/')]:
    expect(f'signed out {meth} {path}', call(meth, path, {} if meth != 'GET' else None), (401, 403, 404))

# 2. another customer: cannot see or touch Alice's things
card = {'method': 'card', 'card': {'number': '4084084084084081', 'expiry': '12/30', 'cvv': '123'}}
for meth, path, body in [('GET', f'/designs/{did}/', None), ('PATCH', f'/designs/{did}/', {'title': 'Mine now'}), ('DELETE', f'/designs/{did}/', None), ('POST', f'/designs/{did}/versions/', {'spec': spec}), ('POST', f'/designs/{did}/restore/', {'n': 1}),
                         ('POST', f'/designs/{did}/duplicate/', {}), ('POST', f'/designs/{did}/publish/', {}), ('POST', f'/designs/{did}/remix/', {}), ('POST', f'/designs/{did}/like/', {'on': True}), ('POST', f'/designs/{did}/requests/', {'measurement_id': mid}),
                         ('GET', f'/designs/{did}/quotes/', None), ('POST', f'/designs/{did}/try-on/', {'image': 'x'}),
                         ('PATCH', f'/me/measurements/{mid}/', {'label': 'x'}), ('DELETE', f'/me/measurements/{mid}/', None),
                         ('GET', f'/orders/{num}/', None), ('POST', f'/orders/{num}/pay/', card), ('POST', f'/orders/{num}/pay/init/', {}), ('POST', f'/orders/{num}/cancel/', {}), ('POST', f'/orders/{num}/confirm/', {}), ('POST', f'/orders/{num}/problem/', {'reason': 'x' * 30}),
                         ('POST', '/orders/', {'quote_id': quotes[0]['id']}),
                         ('GET', f'/commissions/{cid}/', None), ('POST', f'/commissions/{cid}/offer/', {'fee': 1000, 'days': 3}), ('POST', f'/commissions/{cid}/pay/', card), ('POST', f'/commissions/{cid}/approve/', {}), ('POST', f'/commissions/{cid}/cancel/', {}), ('POST', f'/commissions/{cid}/deliver/', {'design_id': did}),
                         ('GET', f'/threads/{tid}/', None), ('POST', f'/threads/{tid}/messages/', {'text': 'hello'}), ('POST', '/threads/', {'commission_id': cid}), ('POST', '/threads/', {'order_id': num})]:
    expect(f'other customer {meth} {path}', call(meth, path, body, B), (403, 404))
s, d2 = call('GET', f'/designs/{did}/', token=A); expect('owner still has the design untouched', (200 if s == 200 and d2['title'] != 'Mine now' else 500, d2), (200,))
s, lists = call('GET', '/orders/', token=B); expect('other customer sees no orders', (200 if lists == [] else 500, lists), (200,))

# 3. a customer is not a tailor, designer or admin
for meth, path, body in [('GET', '/vendors/me/', None), ('GET', '/vendors/requests/', None), ('GET', '/vendors/orders/', None), ('POST', f'/vendors/orders/{num}/events/', {'title': 'x', 'phase': 'tailoring'}), ('GET', '/vendors/quotes/', None),
                         ('GET', '/admin/stats/', None), ('GET', '/admin/users/', None), ('GET', '/admin/orders/', None), ('GET', '/admin/payments/', None), ('GET', '/admin/payouts/', None), ('POST', '/admin/payouts/1/', {'action': 'paid'}), ('GET', '/admin/audit/', None), ('GET', '/admin/reports/', None), ('GET', '/admin/messages/', None),
                         ('POST', f"/admin/users/{ua['id']}/status/", {'status': 'suspended'}), ('POST', f'/admin/orders/{num}/phase/', {'phase': 'delivered'}), ('POST', f'/admin/orders/{num}/issue/', {'action': 'refund'}),
                         ('PATCH', '/me/', {'role': 'admin'})]:
    got = call(meth, path, body, B)
    if path == '/me/': expect('cannot make yourself admin', (200 if got[1].get('role') == 'customer' else 500, got[1]), (200,))
    else: expect(f'customer on staff route {meth} {path}', got, (403, 404))

# 4. a tailor who did not win the order cannot post to it; a designer cannot act on someone else's commission
T = login('tailor@demo.fashionteller'); D = login('designer@demo.fashionteller')
s, mine = call('GET', '/vendors/me/', token=T)
if quotes[0]['vendor']['id'] != mine.get('id'):
    expect('other tailor posts an update', call('POST', f'/vendors/orders/{num}/events/', {'title': 'Cutting', 'phase': 'tailoring'}, T), (403, 404))
    expect('other tailor reads the order', call('GET', f'/orders/{num}/', token=T), (403, 404))
if des.get('userId', des.get('user_id')) != None:
    pass
s, me_d = call('GET', '/me/designer/', token=D)
if str(me_d.get('id')) != str(des['id']):
    expect('other designer offers on the commission', call('POST', f'/commissions/{cid}/offer/', {'fee': 1000, 'days': 3}, D), (403, 404))
    expect('other designer reads the commission', call('GET', f'/commissions/{cid}/', token=D), (403, 404))
expect('tailor on admin route', call('GET', '/admin/users/', token=T), (403, 404))
expect('tailor cannot mark own payout as sent', call('POST', '/admin/payouts/1/', {'action': 'paid'}, T), (403, 404)); expect('designer cannot list payouts', call('GET', '/admin/payouts/', token=D), (403, 404))

# 4b. money and email: no bank details before the address is confirmed, no forged links, no way to learn who has an account, no unsigned webhooks
expect('bank details before the email is confirmed', call('PUT', '/me/payout-account/', {'bank_code': '058', 'number': '0123456789'}, B), (400,))
expect('forged confirm link', call('POST', '/auth/verify/', {'token': f"{ua['id']}:{ua['email']}:1abcde:forged"}), (400,))
expect('forged reset link', call('POST', '/auth/reset/', {'token': f"{ua['id']}.c0ffee-0123456789abcdef0123456789abcdef", 'password': 'taken-over-123'}), (400,))
known = call('POST', '/auth/forgot/', {'email': ua['email']}); unknown = call('POST', '/auth/forgot/', {'email': 'nobody-at-all@probe.test'})
expect('forgot password answers the same for any address', (200 if known == unknown and known[0] == 200 else 500, (known, unknown)), (200,))
expect('Alice can still sign in with her own password', call('POST', '/auth/login/', {'email': ua['email'], 'password': 'probe-pass-123'}), (200,))
expect('unsigned payment webhook', call('POST', '/webhooks/paystack/', {'event': 'transfer.success', 'data': {'reference': 'ftp-o00000001-u00000001'}}), (401,))
expect('unsigned charge webhook', call('POST', '/webhooks/paystack/', {'event': 'charge.success', 'data': {'reference': 'FT-anything'}}), (401,))
s0, mine_e = call('GET', '/me/earnings/', token=B); expect('a customer has no earnings of someone else', (200 if s0 == 200 and mine_e.get('payouts') == [] and not mine_e.get('paid') else 500, mine_e), (200,))

# 5. bad input never becomes a 500
for meth, path, body in [('POST', '/designs/', {'spec': 'not a spec'}), ('POST', '/designs/', {'spec': {'garment': '<script>', 'sketch': [{'d': 'x' * 100000}] * 500}}), ('POST', '/me/measurements/', {'values': {'chest': 'wide'}}), ('POST', '/orders/', {'quote_id': 'nope'}),
                         ('POST', '/commissions/', {'designer_id': 'nope', 'brief': 'x'}), ('POST', '/threads/', {'user_id': 'nope'}), ('POST', '/reviews/', {'kind': 'vendor', 'id': 'x', 'rating': 99}), ('GET', '/designs/not-a-uuid/', None), ('GET', '/discover/?limit=abc&offset=-5&sort=%00', None),
                         ('POST', '/reports/', {'kind': 'design', 'id': did, 'reason': ''}), ('POST', '/designs/', [1, 2, 3]), ('PATCH', '/me/', {'name': None, 'email': 5}),
                         ('PUT', '/me/payout-account/', {'bank_code': ['x'], 'number': {'a': 1}}), ('PUT', '/me/payout-account/', 'text'), ('POST', '/auth/forgot/', {'email': ['a']}), ('POST', '/auth/reset/', {'token': 5, 'password': None}),
                         ('POST', '/auth/verify/', [1]), ('POST', '/auth/verify/', {'token': {'a': 1}}), ('PATCH', '/me/', {'email_prefs': 'yes'}), ('PATCH', '/me/', {'email_prefs': {'orders': 'maybe', 'x': [1]}}), ('GET', '/try-on/not-a-number/', None),
                         ('POST', '/admin/payouts/abc/', {'action': 'paid'}), ('GET', '/dev/mail/?to=%00&limit=abc', None)]:
    got = call(meth, path, body, B)
    expect(f'bad input {meth} {path}', (got[0] if got[0] < 500 else 500, got[1]), tuple(range(200, 500)))
print(f'access probe: {passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
