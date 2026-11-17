"""
Email, payouts and photoreal try-on: the three things that reach outside the API.

  mail      every email goes through send_mail(): it is written to the mail log (Mail) first and sent after the
            request has committed, over SMTP. Nothing here depends on one provider.
  payouts   when a payment is released, payout() records what the tailor or designer is owed (less the platform fee)
            and settle() sends it: Paystack Transfers, by hand (an admin marks it sent), or pretend (test mode).
  try-on    a thin client for the AI service that redraws a photo with the garment on (FASHN). Optional.

All calls to other services are in this file, each behind one small function, so tests can replace them.
"""
import hashlib, hmac, json, logging, threading, urllib.error, urllib.parse, urllib.request
from datetime import timedelta
from html import escape

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.db import connection, transaction
from django.db.models import Q, Sum

from .api import Fail, money, notify, now, txt
from .models import Mail, Payment, Payout, PayoutAccount, Setting, User

log = logging.getLogger('fashionteller')


def after_commit(fn):
    """Run fn once the current request has been saved. On a background thread, unless MAIL_ASYNC is off (tests)."""
    def go():
        if not settings.MAIL_ASYNC:
            return fn()

        def work():
            try:
                fn()
            except Exception:                      # a failed email or transfer must never take the worker down
                log.exception('background task failed')
            finally:
                connection.close()
        threading.Thread(target=work, daemon=True).start()
    transaction.on_commit(go)


# ───────── email ─────────
MAIL_GROUP = {'order': 'orders', 'quote': 'orders', 'commission': 'orders', 'payout': 'orders', 'message': 'messages'}
BUTTON = {'verify': 'Confirm this address', 'reset': 'Choose a new password'}


def wants(user, kind):
    g = MAIL_GROUP.get(kind)
    return bool(g) and (user.email_prefs or {}).get(g, True) is not False


def confirmed(user):
    """Has this member shown the address is theirs? Where no email provider is set up nobody can, so nobody is asked to."""
    return user.email_verified or settings.MAIL_MODE == 'off'


def deliverable(user):
    """Sample and demo accounts have made-up addresses."""
    return not (user.sample or user.email.endswith('.fashionteller') or user.status != 'active')


def html_mail(subject, text, url, button):
    return f'''<!doctype html><html><body style="margin:0;background:#F3F4F5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22252A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F5;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:13px;letter-spacing:.24em;font-weight:600;padding-bottom:22px">FASHION <span style="color:#A8871F">TELLER</span></td></tr>
<tr><td style="font-size:22px;line-height:1.25;font-weight:600;padding-bottom:12px">{escape(subject)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;color:#3A3F46;padding-bottom:24px">{escape(text)}</td></tr>
<tr><td><a href="{escape(url, quote=True)}" style="display:inline-block;background:#D4AF37;color:#22252A;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:.08em;padding:14px 22px;border-radius:12px">{escape(button.upper())}</a></td></tr>
<tr><td style="font-size:12.5px;line-height:1.5;color:#636B73;padding-top:26px">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">{escape(url)}</span></td></tr>
</table>
<p style="font-size:12px;color:#636B73;margin:16px 0 0">You can choose which emails you get in your account, under Emails.</p>
</td></tr></table></body></html>'''


def deliver(mail_id):
    m = Mail.objects.filter(id=mail_id).first()
    if m is None or m.status == 'sent':
        return
    url = settings.SITE_URL + (m.link or '/')
    msg = EmailMultiAlternatives(m.subject, f'{m.text}\n\n{url}\n', settings.DEFAULT_FROM_EMAIL, [m.to])
    msg.attach_alternative(html_mail(m.subject, m.text, url, BUTTON.get(m.kind, 'Open Fashion Teller')), 'text/html')
    m.tries += 1
    try:
        msg.send(fail_silently=False)
        m.status, m.sent_at, m.error = 'sent', now(), ''
    except Exception as e:                         # SMTP down, bad address, wrong credentials
        m.status, m.error = 'failed', str(e)[:300]
        log.warning('email to %s failed: %s', m.to, e)
    m.save(update_fields=['status', 'sent_at', 'error', 'tries'])


def send_mail(user, kind, subject, text, link):
    """Queue one email to a member. Sample and demo addresses are logged but never sent to."""
    m = Mail.objects.create(user=user, to=user.email, kind=kind, subject=txt(subject, 160), text=txt(text, 1000), link=link[:400])
    if deliverable(user) and settings.MAIL_MODE != 'off':
        after_commit(lambda: deliver(m.id))
    else:
        Mail.objects.filter(id=m.id).update(status='sent' if settings.MAIL_MODE != 'off' else 'failed', error='' if settings.MAIL_MODE != 'off' else 'Email is not set up (EMAIL_HOST).', sent_at=now())
    old = list(Mail.objects.filter(user=user).values_list('id', flat=True)[80:])
    if old:
        Mail.objects.filter(id__in=old).delete()
    return m


def notify_mail(user, kind, title, body, href):
    """The email twin of an in-app notification, for the kinds people asked to hear about."""
    if wants(user, kind):
        send_mail(user, kind, title, body, href or '/')


_verify = signing.TimestampSigner(salt='fashionteller.verify')


def send_verification(user):
    token = _verify.sign(f'{user.id}:{user.email}')
    return send_mail(user, 'verify', 'Confirm your email address', f'Hello {user.name.split(" ")[0]}. Confirm this is your address so we can reach you about your orders and payments.', '/signin?verify=' + urllib.parse.quote(token, safe=''))


def verify_email(token):
    try:
        uid, _, email = _verify.unsign(token if isinstance(token, str) else '', max_age=timedelta(days=settings.VERIFY_LINK_DAYS)).partition(':')
    except signing.BadSignature:
        raise Fail('This confirmation link has expired or was already used. Ask for a new one from your account.')
    u = User.objects.filter(id=uid if uid.isdigit() else 0).first()
    if u is None or u.email != email or u.email_verified:
        raise Fail('This confirmation link has expired or was already used. Ask for a new one from your account.')
    u.email_verified = True
    u.save(update_fields=['email_verified'])
    settle(u)
    return u


def send_reset(user):
    return send_mail(user, 'reset', 'Reset your password', f'Hello {user.name.split(" ")[0]}. Use this link to choose a new password. It works once and for one hour. If you did not ask for it, ignore this email.',
                     f'/signin?reset={user.id}.{default_token_generator.make_token(user)}')


def user_for_reset(token):
    uid, _, tok = (token if isinstance(token, str) else '').partition('.')
    u = User.objects.filter(id=uid if uid.isdigit() else 0).first()
    if u is None or u.sample or not default_token_generator.check_token(u, tok):
        raise Fail('This reset link has expired or was already used. Ask for a new one.')
    return u


# ───────── Paystack (payouts) ─────────
BANKS = [('044', 'Access Bank'), ('050', 'Ecobank'), ('070', 'Fidelity Bank'), ('011', 'First Bank'), ('214', 'FCMB'), ('058', 'GTBank'), ('082', 'Keystone Bank'), ('50211', 'Kuda'),
         ('50515', 'Moniepoint'), ('999992', 'OPay'), ('999991', 'PalmPay'), ('076', 'Polaris Bank'), ('101', 'Providus Bank'), ('221', 'Stanbic IBTC'), ('232', 'Sterling Bank'),
         ('032', 'Union Bank'), ('033', 'UBA'), ('035', 'Wema Bank'), ('057', 'Zenith Bank')]


def paystack(method, path, body=None):
    """One call to the Paystack API. Returns the `data` part, or raises Fail with Paystack's own message."""
    req = urllib.request.Request('https://api.paystack.co' + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}', 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            d = json.loads(e.read() or b'{}')
        except ValueError:
            d = {}
        raise Fail(txt(d.get('message') or 'Paystack could not complete that. Try again shortly.', 200), 502)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise Fail('Paystack could not be reached. Try again shortly.', 502)
    if not d.get('status'):
        raise Fail(txt(d.get('message') or 'Paystack could not complete that.', 200), 502)
    return d.get('data')


def banks():
    if settings.PAYOUTS != 'paystack':
        return [{'code': c, 'name': n} for c, n in BANKS]
    got = cache.get('ft.banks')
    if got is None:
        try:
            got = sorted(({'code': str(b['code']), 'name': b['name']} for b in paystack('GET', '/bank?country=nigeria&perPage=200') if b.get('active', True)), key=lambda b: b['name'].lower())
        except Fail:
            return [{'code': c, 'name': n} for c, n in BANKS]
        cache.set('ft.banks', got, 86400)
    return got


def save_account(user, bank_code, number):
    """Check the account with the bank (live), register it as a transfer recipient, and keep it."""
    bank_code, number = txt(bank_code, 12), ''.join(ch for ch in str(number or '') if ch.isdigit())
    bank = next((b for b in banks() if b['code'] == bank_code), None)
    if bank is None: raise Fail('Choose your bank.')
    if len(number) != 10: raise Fail('Enter the 10-digit account number.')
    name, recipient = user.name, ''
    if settings.PAYOUTS == 'paystack':
        name = txt(paystack('GET', f'/bank/resolve?account_number={number}&bank_code={urllib.parse.quote(bank_code)}').get('account_name'), 120) or user.name
        recipient = paystack('POST', '/transferrecipient', {'type': 'nuban', 'name': name, 'account_number': number, 'bank_code': bank_code, 'currency': 'NGN'}).get('recipient_code') or ''
        if not recipient: raise Fail('Paystack did not accept that account. Check the number and bank.', 502)
    acc, _ = PayoutAccount.objects.update_or_create(user=user, defaults={'bank_code': bank_code, 'bank_name': bank['name'], 'account_name': name, 'last4': number[-4:],
                                                                         'number': number if settings.PAYOUTS == 'manual' else '', 'recipient_code': recipient})
    settle(user)
    return acc


def account_out(a, full=False):
    if a is None:
        return None
    d = {'bank_code': a.bank_code, 'bank_name': a.bank_name, 'account_name': a.account_name, 'last4': a.last4}
    if full: d['number'] = a.number
    return d


def payout_out(p):
    return {'id': str(p.id), 'user_id': str(p.user_id), 'kind': p.kind, 'ref_id': p.order.number if p.order_id else str(p.commission_id or ''), 'title': p.title, 'gross': p.gross, 'fee_percent': p.fee_percent, 'fee': p.fee, 'net': p.net,
            'status': p.status, 'reference': p.reference, 'note': p.note, 'created_at': p.created_at.isoformat(), 'sent_at': p.sent_at.isoformat() if p.sent_at else None, 'paid_at': p.paid_at.isoformat() if p.paid_at else None}


# ───────── the platform fee ─────────
FEE_KINDS = ('order', 'commission')          # tailor orders, designer commissions


def clean_pct(v):
    """A fee as typed by an admin: a number from 0 to 50, to two decimals. None if it is not one."""
    if isinstance(v, bool) or v is None or v == '':
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return round(v, 2) if 0 <= v <= 50 else None


def platform_fees():
    """The platform rates now: what an admin set, else PLATFORM_FEE_PERCENT."""
    s = dict(Setting.objects.filter(key__in=[f'fee_{k}' for k in FEE_KINDS]).values_list('key', 'value'))
    return {k: clean_pct(s.get(f'fee_{k}')) if clean_pct(s.get(f'fee_{k}')) is not None else settings.PLATFORM_FEE_PERCENT for k in FEE_KINDS}


def fee_rate(user, kind, fees=None):
    """The rate this person pays on new work of this kind: their own agreed rate, else the platform's."""
    if user is not None and getattr(user, 'fee_percent', None) is not None:
        return user.fee_percent
    return (fees or platform_fees())[kind]


def locked_rate(user, kind, order=None, commission=None):
    """The rate a job is paid at: the one recorded when it was quoted or offered. Jobs from before rates were recorded
    fall back to today's rate."""
    for x in (order, commission):
        if x is not None and x.fee_percent is not None:
            return x.fee_percent
    return fee_rate(user, kind)


def fee_of(gross, rate):
    return int(round(gross * rate / 100))


def pct(v):
    return f'{v:g}%'


def payout(user, kind, title, gross, order=None, commission=None):
    """A payment has been released: record what this person is owed and start sending it."""
    if user is None or gross <= 0:
        return None
    had = Payout.objects.filter(user=user, order=order, commission=commission).first()
    if had is not None:
        return had
    ref = f'ftp-{"o" if order else "c"}{(order or commission).id:08d}-u{user.id:08d}'      # Paystack wants 16-50 lowercase letters, digits, - or _
    rate = locked_rate(user, kind, order, commission); fee = fee_of(gross, rate)
    p = Payout.objects.create(user=user, kind=kind, order=order, commission=commission, title=txt(title, 120), gross=gross, fee_percent=rate, fee=fee, net=gross - fee, reference=ref,
                              status='paid' if user.sample else 'pending', sent_at=now() if user.sample else None, paid_at=now() if user.sample else None)
    if not user.sample:
        settle(user)
    return p


def settle(user):
    """Send everything this person is owed that can be sent now."""
    due = list(Payout.objects.select_for_update().filter(user=user, status='pending'))
    if not due:
        return
    acc = PayoutAccount.objects.filter(user=user).first()
    if acc is None or not confirmed(user):
        notify(user, 'payout', 'Add your bank details to be paid' if acc is None else 'Confirm your email to be paid', f'{money(sum(p.net for p in due))} is waiting for you.', '/account#payouts', key='payout-account')
        return
    if settings.PAYOUTS == 'manual':
        return                                     # an admin pays these from the bank and marks them sent
    for p in due:
        p.status, p.sent_at = 'processing', now()
        p.save(update_fields=['status', 'sent_at'])
        if settings.PAYOUTS == 'paystack':
            after_commit(lambda pid=p.id: transfer(pid))


def transfer(payout_id):
    """Ask Paystack to move the money. The webhook says how it ended."""
    with transaction.atomic():
        p = Payout.objects.select_for_update().select_related('user').filter(id=payout_id, status='processing', transfer_code='').first()
        if p is None:
            return
        acc = PayoutAccount.objects.filter(user=p.user).first()
        try:
            if acc is None or not acc.recipient_code: raise Fail('No bank details on file.')
            d = paystack('POST', '/transfer', {'source': 'balance', 'amount': p.net * 100, 'recipient': acc.recipient_code, 'reference': p.reference, 'reason': p.title[:100]})
        except Fail as e:
            p.status, p.note = 'failed', txt(str(e.detail), 200)
            p.save(update_fields=['status', 'note'])
            log.warning('payout %s failed: %s', p.reference, e.detail)
            return
        p.transfer_code = txt(d.get('transfer_code'), 40)
        if d.get('status') == 'success':
            p.status, p.paid_at = 'paid', now()
        p.save(update_fields=['transfer_code', 'status', 'paid_at'])
    if p.status == 'paid':
        paid_notice(p)


def reconcile(p):
    """A payout that has been on its way too long (the server restarted mid-send, or a webhook never arrived):
    ask Paystack what became of it. If Paystack has never heard of it, it is sent now under the same reference,
    which Paystack accepts only once, so it cannot go out twice."""
    try:
        d = paystack('GET', f'/transfer/verify/{p.reference}')
    except Fail as e:
        if 'not found' not in str(e.detail).lower():
            raise
        Payout.objects.filter(id=p.id, status='processing').update(transfer_code='')
        transfer(p.id)
        return 'sent'
    st = (d or {}).get('status') or ''
    ev = {'reference': p.reference, 'transfer_code': (d or {}).get('transfer_code') or '', 'reason': (d or {}).get('reason') or ''}
    if st == 'success':
        transfer_event('transfer.success', ev)
    elif st in ('failed', 'abandoned', 'reversed'):
        transfer_event('transfer.reversed' if st == 'reversed' else 'transfer.failed', ev)
    elif ev['transfer_code'] and not p.transfer_code:
        Payout.objects.filter(id=p.id).update(transfer_code=txt(ev['transfer_code'], 40))
    return st or 'pending'


def paid_notice(p):
    acc = PayoutAccount.objects.filter(user=p.user).first()
    notify(p.user, 'payout', f'{money(p.net)} sent to your bank', f'{acc.bank_name + " ••" + acc.last4 if acc else "Your account"} · {p.title}', '/account#payouts')


def tick_payouts(user=None):
    """Test mode only: a payout that is 'on its way' arrives after a few seconds."""
    if settings.PAYOUTS != 'test':
        return
    qs = Payout.objects.filter(status='processing', sent_at__lte=now() - timedelta(seconds=settings.TEST_PAYOUT_SECONDS))
    if user is not None:
        qs = qs.filter(user=user)
    for p in qs.select_related('user'):
        if Payout.objects.filter(id=p.id, status='processing').update(status='paid', paid_at=now()):
            paid_notice(p)


def earnings(user):
    tick_payouts(user)
    from .api import vendor_of
    mine = Payout.objects.filter(user=user)
    total = lambda st: mine.filter(status=st).aggregate(s=Sum('net'))['s'] or 0
    v, fees = vendor_of(user), platform_fees()
    jobs = {}                                       # money held per job, so each job's fee is worked out at its own rate
    for p in Payment.objects.filter(status='paid').filter(Q(commission__designer=user) | Q(order__vendor=v) if v else Q(commission__designer=user)).select_related('order', 'commission'):
        key = ('o', p.order_id) if p.order_id else ('c', p.commission_id)
        jobs.setdefault(key, [0, p.order, p.commission])[0] += p.amount
    held = sum(j[0] for j in jobs.values())
    held_net = sum(j[0] - fee_of(j[0], locked_rate(user, 'order' if j[1] else 'commission', j[1], j[2])) for j in jobs.values())
    mine_fees = {k: fee_rate(user, k, fees) for k in FEE_KINDS}
    return {'fee_percent': mine_fees['order' if v else 'commission'], 'fees': mine_fees, 'own_fee': user.fee_percent, 'held': held, 'held_net': held_net,
            'pending': total('pending'), 'processing': total('processing'), 'paid': total('paid'), 'failed': total('failed'),
            'account': account_out(PayoutAccount.objects.filter(user=user).first()), 'payouts': [payout_out(p) for p in mine.select_related('order')[:60]]}


def webhook_signature_ok(raw, signature):
    if not settings.PAYSTACK_SECRET_KEY or not signature:
        return False
    return hmac.compare_digest(hmac.new(settings.PAYSTACK_SECRET_KEY.encode(), raw, hashlib.sha512).hexdigest(), signature)


def transfer_event(event, data):
    """transfer.success | transfer.failed | transfer.reversed from Paystack."""
    ref = txt(data.get('reference'), 60)
    p = Payout.objects.select_for_update().select_related('user').filter(transfer_code=txt(data.get('transfer_code'), 40)).first() if data.get('transfer_code') else None
    if p is None:
        p = Payout.objects.select_for_update().select_related('user').filter(reference=ref).first()
    if p is None:
        return False
    if event == 'transfer.success' and p.status != 'paid':
        p.status, p.paid_at, p.note = 'paid', now(), ''
        p.save(update_fields=['status', 'paid_at', 'note']); paid_notice(p)
    elif event in ('transfer.failed', 'transfer.reversed') and p.status != 'paid' or event == 'transfer.reversed':
        p.status, p.note, p.transfer_code = 'reversed' if event == 'transfer.reversed' else 'failed', txt(data.get('reason') or data.get('gateway_response') or 'The bank returned the transfer.', 200), ''
        p.save(update_fields=['status', 'note', 'transfer_code'])
        notify(p.user, 'payout', 'A payout did not go through', f'{money(p.net)} for {p.title}. Check your bank details; we will send it again.', '/account#payouts')
    return True


# ───────── photoreal try-on (FASHN) ─────────
def fashn(method, path, body=None):
    req = urllib.request.Request(settings.FASHN_API_URL + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {settings.FASHN_API_KEY}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            d = json.loads(e.read() or b'{}')
        except ValueError:
            d = {}
        log.warning('try-on service said %s: %s', e.code, d)
        raise Fail('The try-on service is busy or not set up correctly. Try again in a moment.' if e.code != 429 else 'The try-on service is busy. Try again in a minute.', 502)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise Fail('The try-on service could not be reached. Try again in a moment.', 502)


CATEGORY = {'shirt': 'tops', 'dress': 'one-pieces'}                    # everything else is an outfit: let the service decide
TRYON_ERRORS = {'PoseError': 'No one could be found in that photo. Use one where your body is clearly in view.', 'ImageLoadError': 'That photo could not be read. Try another one.',
                'ContentModerationError': 'That photo cannot be used. Try a different one.', 'NSFWError': 'That photo cannot be used. Try a different one.'}


def tryon_start(person, garment, garment_type):
    d = fashn('POST', '/run', {'model_name': settings.AI_TRYON_MODEL, 'inputs': {'model_image': person, 'garment_image': garment, 'category': CATEGORY.get(garment_type, 'auto'),
                                                                                 'garment_photo_type': 'flat-lay', 'mode': 'balanced', 'output_format': 'jpeg', 'return_base64': True}})
    if not d.get('id'):
        raise Fail(TRYON_ERRORS.get((d.get('error') or {}).get('name') if isinstance(d.get('error'), dict) else '', 'The try-on service did not accept the picture. Try another photo.'), 502)
    return str(d['id'])


def tryon_status(provider_id):
    """(status, image, error): status is running | done | failed."""
    d = fashn('GET', '/status/' + urllib.parse.quote(provider_id, safe=''))
    st = d.get('status')
    if st == 'completed':
        out = d.get('output') or []
        img = out[0] if out else ''
        ok = isinstance(img, str) and (img.startswith('data:image/') or img.startswith('https://'))
        return ('done', img, '') if ok else ('failed', '', 'The picture came back empty. Try again.')
    if st in ('failed', 'canceled', 'time_out'):
        name = (d.get('error') or {}).get('name', '') if isinstance(d.get('error'), dict) else ''
        return 'failed', '', TRYON_ERRORS.get(name, 'The picture could not be made from that photo. Try another one.')
    return 'running', '', ''
