"""
Endpoints for email (confirm an address, reset a password), payouts and photoreal try-on.
Same conventions as views.py: one function per endpoint, @route says who may call it.
"""
import json, re
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from . import extras as X
from .api import Fail, access, audit, now, notify, person, profile_of, pub, route, txt, vendor_of
from .models import Design, Mail, Payment, Payout, PayoutAccount, Setting, TryOnJob, User

PICTURE = re.compile(r'^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')


# ───────── what is switched on ─────────
@route(['GET'], auth=False)
def config(request):
    fees = X.platform_fees()
    return {'fee_percent': fees['order'], 'fees': fees, 'payouts': settings.PAYOUTS, 'mail': settings.MAIL_MODE, 'try_on_ai': bool(settings.AI_TRYON_PROVIDER and settings.FASHN_API_KEY),
            'payments_live': settings.PAYMENTS_LIVE, 'sample_mode': settings.SAMPLE_MODE}


# ───────── email ─────────
@route(['POST'], auth=False, throttle='auth')
def forgot(request):
    """Always the same answer, so nobody can use this to find out which addresses have accounts."""
    e = txt(request.data.get('email'), 120).lower()
    if '@' not in e: raise Fail('Enter a valid email address.')
    if settings.MAIL_MODE == 'off': raise Fail('Password reset by email is not set up on this site yet. Please contact us and we will help you back in.', 503)
    u = User.objects.filter(email=e, sample=False, status='active').first()
    if u is not None and u.has_usable_password():
        X.send_reset(u)
    return {'ok': True}


@route(['POST'], auth=False, throttle='auth')
def reset(request):
    u = X.user_for_reset(request.data.get('token')); pw = request.data.get('password')
    try:
        validate_password(pw if isinstance(pw, str) else '')
    except ValidationError:
        raise Fail('Use a new password of at least 8 characters.')
    u.set_password(pw); u.email_verified = True        # the link proves the mailbox is theirs
    u.save(update_fields=['password', 'email_verified']); audit('password:reset', u.id, u)
    return {'email': u.email}


@route(['POST'], auth=False, throttle='auth')
def verify(request):
    u = X.verify_email(request.data.get('token')); audit('email:verified', u.id, u)
    return {'email': u.email}


@route(['POST'], throttle='auth')
def verify_send(request):
    if not request.me.email_verified:
        X.send_verification(request.me)
    return {'ok': True}


@route(['GET'], auth=False)
def dev_mail(request):
    """Development only: the emails sent to one address, newest first, so flows can be tried without a mail server."""
    if not settings.MAIL_DEBUG: raise Fail('Not found.', 404)
    to = txt(request.query_params.get('to'), 120).lower()
    return [{'to': m.to, 'kind': m.kind, 'subject': m.subject, 'text': m.text, 'link': m.link, 'status': m.status, 'at': m.created_at.isoformat()} for m in Mail.objects.filter(to=to)[:20]]


# ───────── payouts ─────────
@route(['GET'])
def banks(request):
    return X.banks()


@route(['GET', 'PUT'], throttle='write')
def payout_account(request):
    u = request.me
    if request.method == 'PUT':
        if not X.confirmed(u): raise Fail('Confirm your email address first. We sent you a link.')
        acc = X.save_account(u, request.data.get('bank_code'), request.data.get('number')); audit('payout:account', u.id, u)
        return X.account_out(acc)
    return X.account_out(PayoutAccount.objects.filter(user=u).first())


@route(['GET'])
def my_earnings(request):
    return X.earnings(request.me)


@route(['GET'], role='admin')
def admin_payouts(request):
    X.tick_payouts()
    accounts = {a.user_id: a for a in PayoutAccount.objects.all()}
    return [{**X.payout_out(p), 'payee': person(p.user), 'account': X.account_out(accounts.get(p.user_id), full=True)} for p in Payout.objects.select_related('user', 'user__designer', 'user__vendor', 'order')[:200]]


@route(['POST'], role='admin')
def admin_payout(request, pk):
    p = Payout.objects.select_for_update().select_related('user').filter(id=pk if str(pk).isdigit() else 0).first()
    if p is None: raise Fail('Payout not found.', 404)
    action = request.data.get('action')
    if action == 'paid':
        if p.status == 'paid': raise Fail('This payout is already marked as sent.')
        if settings.PAYOUTS == 'paystack' and p.status == 'processing': raise Fail('Paystack is sending this one. It updates by itself.')
        p.status, p.paid_at, p.note = 'paid', now(), txt(request.data.get('reference'), 80)
        p.save(update_fields=['status', 'paid_at', 'note']); X.paid_notice(p)
    elif action == 'retry':
        if p.status not in ('failed', 'reversed', 'pending'): raise Fail('Only a failed or waiting payout can be sent again.')
        base = p.reference.split('-r')[0]; n = 1
        while Payout.objects.filter(reference=f'{base}-r{n}').exists(): n += 1
        p.status, p.reference, p.transfer_code, p.note = 'pending', f'{base}-r{n}', '', ''
        p.save(update_fields=['status', 'reference', 'transfer_code', 'note']); X.settle(p.user)
    elif action == 'check':
        if settings.PAYOUTS != 'paystack' or p.status != 'processing': raise Fail('Only a payout that Paystack is sending can be checked.')
        X.reconcile(p)
    else:
        raise Fail('Choose paid or retry.')
    audit('payout:' + action, p.id, request.me)
    return X.payout_out(Payout.objects.select_related('order').get(id=p.id))


# ───────── the platform fee: an admin sets it ─────────
def fees_out():
    f = X.platform_fees()
    own = User.objects.filter(fee_percent__isnull=False, sample=False).order_by('name')
    return {'order': f['order'], 'commission': f['commission'], 'default': settings.PLATFORM_FEE_PERCENT,
            'accounts': [{**person(u), 'email': u.email, 'role': u.role, 'fee_percent': u.fee_percent} for u in own]}


@route(['GET', 'PUT'], role='admin')
def admin_fees(request):
    """GET the rates. PUT {order, commission}: new platform rates, 0 to 50 percent. They apply to quotes and offers made
    from now on; every job already quoted or offered keeps its rate."""
    if request.method == 'PUT':
        if not isinstance(request.data, dict): raise Fail('Enter a fee between 0% and 50%.')
        new = {}
        for k in X.FEE_KINDS:
            if request.data.get(k) not in (None, ''):
                v = X.clean_pct(request.data.get(k))
                if v is None: raise Fail(f'Enter a fee between 0% and 50% for {"tailor orders" if k == "order" else "designer commissions"}.')
                new[k] = v
        if not new: raise Fail('Enter a fee between 0% and 50%.')
        was = X.platform_fees()
        for k, v in new.items():
            Setting.objects.update_or_create(key=f'fee_{k}', defaults={'value': v, 'updated_at': now(), 'updated_by': request.me})
            if v != was[k]: audit(f'fee:{k}', f'{X.pct(was[k])} to {X.pct(v)}', request.me)
    return fees_out()


@route(['POST'], role='admin')
def admin_user_fee(request, pk):
    """{fee_percent}: this account's own rate, or empty to put it back on the platform rate."""
    u = User.objects.filter(id=pk if str(pk).isdigit() else 0, sample=False).first()
    if u is None: raise Fail('Account not found.', 404)
    if not (vendor_of(u) or profile_of(u)): raise Fail('Only tailors and designers pay a platform fee.')
    raw = request.data.get('fee_percent') if isinstance(request.data, dict) else None
    v = None if raw in (None, '') else X.clean_pct(raw)
    if raw not in (None, '') and v is None: raise Fail('Enter a fee between 0% and 50%, or leave it empty for the platform rate.')
    if v != u.fee_percent:
        u.fee_percent = v; u.save(update_fields=['fee_percent']); audit('fee:account', f'{u.email} {X.pct(v) if v is not None else "platform rate"}', request.me)
        rates = {k: X.fee_rate(u, k) for k in X.FEE_KINDS}
        now_pays = X.pct(rates['order' if vendor_of(u) else 'commission'])
        notify(u, 'payout', f'Your platform fee is now {now_pays}', 'It applies to quotes and offers you make from now on. Work you have already quoted or offered keeps the rate it was agreed at.', '/account#payouts')
    return pub(u)


@csrf_exempt
@require_POST
def paystack_webhook(request):
    """Paystack tells us how transfers ended, and about payments whose browser tab was closed before we heard back.
    Only requests signed with our secret key are believed."""
    raw = request.body
    if not X.webhook_signature_ok(raw, request.headers.get('x-paystack-signature', '')):
        return HttpResponse(status=401)
    try:
        body = json.loads(raw or b'{}'); event, data = body.get('event') or '', body.get('data') or {}
    except ValueError:
        return HttpResponse(status=400)
    try:
        with transaction.atomic():
            if event.startswith('transfer.'):
                X.transfer_event(event, data)
            elif event == 'charge.success':
                from .views import complete_payment
                complete_payment(txt(data.get('reference'), 60))
    except Fail as e:                              # already recorded, amount mismatch… nothing Paystack can do about it
        X.log.info('webhook %s ignored: %s', event, e.detail)
    return JsonResponse({'ok': True})              # always 200 once the signature is good, or Paystack keeps retrying


# ───────── photoreal try-on ─────────
def job_out(j):
    return {'id': str(j.id), 'status': j.status, 'image': j.image if j.status == 'done' else '', 'error': j.error}


def tidy_jobs():
    """The member's photo is passed to the service and never stored here. The finished picture is held only long enough
    for the page to collect it; the row stays two days so the daily limit can be counted."""
    TryOnJob.objects.filter(created_at__lt=now() - timedelta(hours=1)).exclude(image='').update(image='')
    TryOnJob.objects.filter(created_at__lt=now() - timedelta(days=2)).delete()


@route(['POST'], throttle='write')
def try_on(request, pk):
    """Body: {image: the person's photo, garment: a picture of the garment, garment_type}. Both pictures are data URLs.
    Answers with a job; ask GET /try-on/{id}/ until its status is done or failed."""
    u = request.me
    d = Design.objects.filter(id=pk if str(pk).isdigit() else 0).first()
    if d is None or access(d, u) is None: raise Fail('Design not found.', 404)
    if not (settings.AI_TRYON_PROVIDER and settings.FASHN_API_KEY):
        raise Fail('Photoreal try-on is not switched on. The live try-on works without it.', 501)
    person_img, garment = request.data.get('image') or '', request.data.get('garment') or ''
    if not (isinstance(person_img, str) and PICTURE.match(person_img)) or not (isinstance(garment, str) and PICTURE.match(garment)): raise Fail('Send the photo and the garment picture as JPG, PNG or WebP.')
    if len(person_img) > 6_000_000 or len(garment) > 3_000_000: raise Fail('That photo is too large. Use a smaller one.', 413)
    if TryOnJob.objects.filter(user=u, created_at__gte=now() - timedelta(days=1)).count() >= settings.AI_TRYON_DAILY_LIMIT:
        raise Fail(f'You have made {settings.AI_TRYON_DAILY_LIMIT} photoreal pictures today. Try again tomorrow.', 429)
    tidy_jobs()
    j = TryOnJob.objects.create(user=u, design=d, provider=settings.AI_TRYON_PROVIDER)
    try:
        j.provider_id = X.tryon_start(person_img, garment, txt(request.data.get('garment_type'), 20))
    except Fail as e:
        j.status, j.error = 'failed', txt(str(e.detail), 200)
    j.save(); audit('tryon', d.id, u)
    return job_out(j)


@route(['GET'])
def try_on_status(request, pk):
    tidy_jobs()
    j = TryOnJob.objects.select_for_update().filter(id=pk if str(pk).isdigit() else 0, user=request.me).first()
    if j is None: raise Fail('Not found.', 404)
    if j.status == 'running':
        if now() - j.created_at > timedelta(minutes=4):
            j.status, j.error = 'failed', 'The picture took too long. Try again in a moment.'
        else:
            try:
                st, img, err = X.tryon_status(j.provider_id)
            except Fail:
                st, img, err = 'running', '', ''   # a blip talking to the service: the next poll tries again
            if st != 'running': j.status, j.image, j.error = st, img, err
        j.save()
    return job_out(j)
