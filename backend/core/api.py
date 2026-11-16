"""
What the views share: the route decorator (who may call what), errors people can read, the JSON shapes sent to the
site, notifications, the streak game, payments, and the sample tailors and designers that act on their own.

The JSON here is snake_case; the site's client (assets/js/api.js) converts it to the camelCase records its pages use.
"""
import json, secrets, urllib.request, zlib
from datetime import date, datetime, timedelta
from functools import wraps

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.exceptions import APIException, AuthenticationFailed, NotAuthenticated, Throttled
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, UserRateThrottle
from rest_framework.views import exception_handler

from . import rules as R
from .models import (Audit, Commission, Design, Designer, Follow, Game, Like, Member, Message, Notification, Order, Outbox, Payment, Quote,
                     QuoteRequest, Review, Saved, Thread, User, Vendor, Version)

now = timezone.now
PHASES = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered']


# ───────── errors and access ─────────
class Fail(APIException):
    def __init__(self, detail, status=400):
        self.status_code = status
        self.detail = detail


def on_error(exc, ctx):
    if isinstance(exc, Fail):
        return Response({'detail': exc.detail}, status=exc.status_code)
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return Response({'detail': 'Sign in to continue.'}, status=401)
    if isinstance(exc, Throttled):
        return Response({'detail': 'Too many requests. Give it a minute.'}, status=429)
    if isinstance(exc, RequestDataTooBig):
        return Response({'detail': 'That is too much to send at once. Try a smaller photo or a simpler sketch.'}, status=413)
    r = exception_handler(exc, ctx)
    if r is not None and isinstance(r.data, dict) and 'detail' in r.data:
        r.data = {'detail': str(r.data['detail'])}
    return r


class AuthThrottle(ScopedRateThrottle):
    scope = 'auth'

    def allow_request(self, request, view):
        view.throttle_scope = 'auth'
        return super().allow_request(request, view)


class WriteThrottle(UserRateThrottle):
    scope = 'write'

    def allow_request(self, request, view):
        return True if request.method in ('GET', 'HEAD', 'OPTIONS') else super().allow_request(request, view)


def route(methods, auth=True, role=None, throttle=None):
    """Declare an endpoint: its methods, whether it needs a signed-in account, and which role. Each call is one transaction."""
    def deco(fn):
        @api_view(methods)
        @throttle_classes([AuthThrottle] if throttle == 'auth' else [WriteThrottle])
        @wraps(fn)
        def view(request, *a, **kw):
            u = request.user if getattr(request, 'user', None) is not None else None
            if u is not None and u.status != 'active':
                raise Fail('This account has been suspended. Contact support.', 403)
            if auth and u is None:
                raise Fail('Sign in to continue.', 401)
            if role and u.role != role and u.role != 'admin':
                raise Fail(f'This area is for {role} accounts.', 403)
            if request.method in ('POST', 'PATCH', 'PUT') and not isinstance(request.data, dict):
                raise Fail('Send the details as a JSON object.', 400)      # a list or a bare value would otherwise crash every d.get(...)
            request.me = u
            with transaction.atomic():
                out = fn(request, *a, **kw)
            return out if isinstance(out, Response) else Response(out)
        return view
    return deco


def txt(v, limit=400):
    s = '' if v is None else str(v)
    return ''.join(ch for ch in s if ch in '\n\t' or ord(ch) >= 32).strip()[:limit]


def whole(v, lo=None, hi=None, what='a number'):
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        raise Fail(f'Enter {what}.')
    if (lo is not None and n < lo) or (hi is not None and n > hi):
        raise Fail(f'Enter {what}.')
    return n


def get(model, message, status=404, **where):
    try:
        return model.objects.get(**where)
    except (model.DoesNotExist, ValueError, TypeError):
        raise Fail(message, status)


def audit(action, target, by='system'):
    Audit.objects.create(by=str(getattr(by, 'name', by))[:80], action=action[:40], target=str(target)[:120])


def money(n):
    return '₦' + format(int(round(n)), ',')


def iso(t):
    return t.isoformat().replace('+00:00', 'Z') if isinstance(t, datetime) else (t.isoformat() if t else None)


def stable(*parts):
    return zlib.crc32(':'.join(str(p) for p in parts).encode())


# ───────── shapes ─────────
def hue(user_id):
    return (int(user_id) * 47) % 360


def profile_of(u):
    return getattr(u, 'designer', None) if u is not None and hasattr(u, 'designer') else None


def vendor_of(u):
    return getattr(u, 'vendor', None) if u is not None and hasattr(u, 'vendor') else None


def pub(u):
    p, v = profile_of(u), vendor_of(u)
    return {'id': str(u.id), 'email': u.email, 'name': u.name, 'role': u.role, 'phone': u.phone, 'city': u.city, 'country': u.country, 'vendor_id': str(v.id) if v else None,
            'status': u.status, 'created_at': iso(u.created_at), 'demo': u.demo, 'designer': bool(p), 'handle': p.handle if p else None, 'hue': hue(u.id)}


def person(u):
    if u is None:
        return {'id': '', 'name': 'Former member', 'handle': None, 'hue': 0, 'city': '', 'country': '', 'designer': False, 'vendor_id': None}
    p, v = profile_of(u), vendor_of(u)
    return {'id': str(u.id), 'name': v.name if (v and u.sample) else u.name, 'handle': p.handle if p else None, 'hue': hue(u.id), 'city': u.city, 'country': u.country, 'designer': bool(p), 'vendor_id': str(v.id) if v else None}


def vendor_pub(v):
    if v is None:
        return None
    return {'id': str(v.id), 'name': v.name, 'city': v.city, 'country': v.country, 'specialties': v.specialties, 'bio': v.bio, 'rating': v.rating, 'reviews': v.reviews, 'orders_done': v.orders_done,
            'verified': v.status == 'verified', 'status': v.status, 'since': v.since, 'sample': v.sample, 'hue': v.hue, 'lead_min': v.lead_min, 'verified_at': iso(v.verified_at), 'created_at': iso(v.created_at), 'user_id': str(v.user_id)}


def version_out(v):
    return {'n': v.n, 'instruction': v.instruction, 'spec': v.spec, 'changes': v.changes, 'from': v.from_n, 'restored': v.restored, 'created_at': iso(v.created_at)}


def current_version(d):
    vs = list(d.versions.all())
    return next((v for v in vs if v.n == d.current), vs[-1])


def likes_of(d):
    return d.like_base + d.likes.count()


def design_out(d, me, view='owner'):
    vs = list(d.versions.all())
    base = {'id': str(d.id), 'user_id': str(d.user_id), 'title': d.title, 'status': d.status, 'current': d.current, 'created_at': iso(d.created_at), 'updated_at': iso(d.updated_at),
            'published': d.published, 'published_at': iso(d.published_at), 'caption': d.caption, 'tags': d.tags, 'allow_remix': d.allow_remix, 'remix_of': d.remix_info, 'credit': d.credit,
            'commission_of': d.commission_of or None, 'owner': person(d.user), 'likes': likes_of(d), 'remixes': d.remixes.count(),
            'liked': bool(me) and Like.objects.filter(user=me, design=d).exists(), 'saved': bool(me) and Saved.objects.filter(user=me, design=d).exists(), 'view': view}
    if view == 'public':
        cur = next((v for v in vs if v.n == d.current), vs[-1])
        return {**base, 'versions': [version_out(cur)], 'prompt': ''}
    return {**base, 'versions': [version_out(v) for v in vs], 'prompt': d.prompt, 'source': d.source}


def cards(designs, me):
    """Feed cards for a list of designs, with likes, remixes and the viewer's own likes and saves loaded in bulk."""
    designs = list(designs)
    ids = [d.id for d in designs]
    if not ids:
        return []
    cur = {}
    for v in Version.objects.filter(design_id__in=ids).order_by('n'):
        d = next(x for x in designs if x.id == v.design_id)
        if v.n == d.current or v.design_id not in cur:
            cur[v.design_id] = v
    n_likes = dict(Like.objects.filter(design_id__in=ids).values_list('design_id').annotate(n=Count('id')))
    n_remix = dict(Design.objects.filter(remix_of_id__in=ids).values_list('remix_of_id').annotate(n=Count('id')))
    liked = set(Like.objects.filter(user=me, design_id__in=ids).values_list('design_id', flat=True)) if me else set()
    saved = set(Saved.objects.filter(user=me, design_id__in=ids).values_list('design_id', flat=True)) if me else set()
    return [{'id': str(d.id), 'title': d.title, 'garment': cur[d.id].spec.get('garment'), 'spec': cur[d.id].spec, 'caption': d.caption, 'tags': d.tags, 'by': person(d.user),
             'likes': d.like_base + n_likes.get(d.id, 0), 'remixes': n_remix.get(d.id, 0), 'liked': d.id in liked, 'saved': d.id in saved, 'published_at': iso(d.published_at),
             'allow_remix': d.allow_remix, 'mine': bool(me) and d.user_id == me.id} for d in designs if d.id in cur]


def mini(d):
    return {'id': str(d.id), 'title': d.title, 'spec': current_version(d).spec, 'by': person(d.user)} if d else None


def followers_of(user_id, base=0):
    return base + Follow.objects.filter(target_id=user_id).count()


def designer_out(p, me):
    u = p.user
    return {'id': str(u.id), 'user_id': str(u.id), 'handle': p.handle, 'name': u.name, 'bio': p.bio, 'specialties': p.specialties, 'open': p.open, 'fee_from': p.fee_from, 'turnaround_days': p.turnaround_days,
            'hue': hue(u.id), 'city': u.city, 'country': u.country, 'rating': p.rating, 'reviews': p.reviews, 'completed': p.completed, 'featured': p.featured, 'sample': p.sample,
            'followers': followers_of(u.id, p.followers_base), 'following': bool(me) and Follow.objects.filter(user=me, target=u).exists(),
            'designs': Design.objects.filter(user=u, published=True).count(), 'mine': bool(me) and me.id == u.id, 'created_at': iso(p.created_at)}


def review_out(r):
    return {'id': str(r.id), 'kind': r.kind, 'ref_id': (r.order.number if r.order_id else str(r.commission_id) if r.commission_id else 'seed'), 'by_id': str(r.by_id), 'vendor_id': str(r.vendor_id) if r.vendor_id else None,
            'designer_id': str(r.designer_id) if r.designer_id else None, 'rating': r.rating, 'text': r.text, 'created_at': iso(r.created_at), 'by': person(r.by)}


def measurement_out(m):
    return {'id': str(m.id), 'label': m.label, 'unit': m.unit, 'values': m.values, 'fit': m.fit, 'notes': m.notes, 'created_at': iso(m.created_at), 'updated_at': iso(m.updated_at)} if m else None


def request_out(r):
    return {'id': str(r.id), 'design_id': str(r.design_id), 'version_n': r.version_n, 'user_id': str(r.user_id), 'measurement_id': str(r.measurement_id) if r.measurement_id else None,
            'notes': r.notes, 'deadline': iso(r.deadline), 'status': r.status, 'created_at': iso(r.created_at)} if r else None


def quote_out(q, vendor=True):
    out = {'id': str(q.id), 'request_id': str(q.request_id), 'design_id': str(q.design_id), 'vendor_id': str(q.vendor_id), 'price': q.price, 'delivery_days': q.delivery_days, 'note': q.note,
           'includes_fabric': q.includes_fabric, 'status': q.status, 'created_at': iso(q.created_at), 'valid_until': iso(q.valid_until)}
    if vendor:
        out['vendor'] = vendor_pub(q.vendor)
    return out


def order_out(o, me):
    d, c, rv = o.design, o.user, getattr(o, 'review', None)
    mine = bool(me) and (o.user_id == me.id or me.role == 'admin')
    return {'id': o.number, 'user_id': str(o.user_id), 'vendor_id': str(o.vendor_id), 'design_id': str(o.design_id) if o.design_id else None, 'version_n': o.version_n,
            'quote_id': str(o.quote_id) if o.quote_id else None, 'request_id': str(o.request_id) if o.request_id else None, 'measurement_id': str(o.measurement_id) if o.measurement_id else None,
            'total': o.total, 'paid': o.paid, 'plan': o.plan, 'phase': o.phase, 'status': o.status, 'created_at': iso(o.created_at), 'paid_at': iso(o.paid_at), 'eta': iso(o.eta),
            'delivered_at': iso(o.delivered_at), 'received_at': iso(o.received_at), 'issue': o.issue, 'review_id': str(rv.id) if rv else None, 'events': o.events,
            'vendor': vendor_pub(o.vendor), 'design': design_out(d, me, 'owner' if mine else 'party') if d else None,
            'customer': {'id': str(c.id), 'name': c.name, 'city': c.city, 'country': c.country, 'phone': c.phone}, 'measurement': measurement_out(o.measurement),
            'delivery_days': o.delivery_days, 'balance': o.total - o.paid, 'review': review_out(rv) if rv else None}


def commission_out(c, me):
    last = c.deliveries[-1] if c.deliveries else None
    dd = Design.objects.filter(id=last['design_id']).first() if last else None
    p, rv = profile_of(c.designer), getattr(c, 'review', None)
    return {'id': str(c.id), 'client_id': str(c.client_id), 'designer_id': str(c.designer_id), 'title': c.title, 'brief': c.brief, 'garment': c.garment, 'occasion': c.occasion, 'budget': c.budget,
            'deadline': iso(c.deadline), 'ref_design_id': str(c.ref_design_id) if c.ref_design_id else None, 'status': c.status, 'offer': c.offer, 'paid': c.paid, 'paid_at': iso(c.paid_at),
            'revisions': c.revisions, 'max_revisions': c.max_revisions, 'deliveries': c.deliveries, 'result_design_id': str(c.result_design_id) if c.result_design_id else None,
            'review_id': str(rv.id) if rv else None, 'thread_id': str(c.thread_id) if c.thread_id else None, 'change_note': c.change_note or None, 'created_at': iso(c.created_at), 'updated_at': iso(c.updated_at),
            'client': person(c.client), 'designer': {**person(c.designer), 'fee_from': p.fee_from if p else 0, 'turnaround_days': p.turnaround_days if p else 3, 'rating': p.rating if p else 0},
            'role': 'designer' if (me and me.id == c.designer_id) else 'client', 'delivery': {**last, 'design': mini(dd)} if last else None, 'reference': mini(c.ref_design), 'result': mini(c.result_design),
            'can_revise': c.revisions < c.max_revisions, 'review': review_out(rv) if rv else None}


def unread_in(th, member):
    q = th.messages.exclude(by=None).exclude(by_id=member.user_id)
    return (q.filter(at__gt=member.read_at) if member.read_at else q).count()


def thread_out(th, me):
    members = list(th.members.select_related('user', 'user__designer', 'user__vendor'))
    mine = next(m for m in members if m.user_id == me.id)
    other = next((m.user for m in members if m.user_id != me.id), me)
    last = th.messages.last()
    return {'id': str(th.id), 'kind': th.kind, 'ref_id': th.ref_id or None, 'title': person(other)['name'] if th.kind == 'direct' else th.title, 'other': person(other),
            'last': {'text': last.text, 'at': iso(last.at), 'mine': last.by_id == me.id, 'system': last.by_id is None} if last else None, 'unread': unread_in(th, mine), 'updated_at': iso(th.updated_at),
            'href': f'/orders?id={th.ref_id}' if th.kind == 'order' else f'/commissions?id={th.ref_id}' if th.kind == 'commission' else f'/designer?id={other.id}'}


def message_out(m, me):
    return {'id': str(m.id), 'by': str(m.by_id) if m.by_id else 'system', 'mine': m.by_id == me.id, 'system': m.by_id is None, 'text': m.text, 'at': iso(m.at), 'design': mini(m.design) if m.design_id else None}


# ───────── notifications, threads ─────────
def notify(user, kind, title, body, href, key=''):
    """Tell someone something happened. `key` folds a burst into one line that keeps updating."""
    if user is None or user.sample:
        return
    if key:
        Notification.objects.filter(user=user, key=key, read=False).delete()
    Notification.objects.create(user=user, kind=kind, title=txt(title, 120), body=txt(body, 200), href=href, key=key)
    old = list(Notification.objects.filter(user=user).values_list('id', flat=True)[60:])
    if old:
        Notification.objects.filter(id__in=old).delete()


def say(thread, by, text, design=None):
    if thread is None:
        return
    at = now()
    Message.objects.create(thread=thread, by=by, text=txt(text, 2000), design=design, at=at)
    Thread.objects.filter(id=thread.id).update(updated_at=at)
    if by is not None:
        Member.objects.filter(thread=thread, user=by).update(read_at=at)


def thread_for(kind, ref_id, users, title=''):
    th = None
    if kind == 'direct':
        a, b = users
        th = Thread.objects.filter(kind='direct', members__user=a).filter(members__user=b).first()
    else:
        th = Thread.objects.filter(kind=kind, ref_id=str(ref_id)).first()
    if th is None:
        th = Thread.objects.create(kind=kind, ref_id=str(ref_id or ''), title=txt(title, 120))
        for u in users:
            Member.objects.get_or_create(thread=th, user=u)
    return th


def first(u):
    return (u.name or '').split(' ')[0]


# ───────── streaks, XP, badges ─────────
def today():
    return timezone.localdate()


def game_of(user):
    g, _ = Game.objects.get_or_create(user=user, defaults={'data': {}})
    for k, v in {'xp': 0, 'streak': 0, 'best': 0, 'last_day': None, 'days': [], 'badges': {}, 'challenges': {}, 'palettes': [], 'garments': [], 'today_versions': 0, 'today_key': None}.items():
        g.data.setdefault(k, v)
    return g


def play(user, kind, spec=None, design=None):
    """Score an action. A day counts towards the streak when the user saves at least one design or version that day."""
    game = game_of(user)
    g, day, yesterday = game.data, today().isoformat(), (today() - timedelta(days=1)).isoformat()
    before = R.level_of(g['xp'])['level']
    r = {'xp': 0, 'lines': [], 'badges': [], 'streak': g['streak'], 'streak_up': False, 'challenge': None, 'level_up': None}

    def add(n, why):
        g['xp'] += n; r['xp'] += n; r['lines'].append(f'+{n} {why}')

    def badge(bid):
        if g['badges'].get(bid):
            return
        g['badges'][bid] = iso(now())
        name = next(b[1] for b in R.BADGES if b[0] == bid)
        r['badges'].append(name); add(25, name)

    if g['today_key'] != day:
        g['today_key'], g['today_versions'] = day, 0
    if kind in ('create', 'version'):
        if g['last_day'] != day:
            g['streak'] = g['streak'] + 1 if g['last_day'] == yesterday else 1
            g['last_day'], g['best'] = day, max(g['best'], g['streak'])
            g['days'] = ([day] + [x for x in g['days'] if x != day])[:60]
            r['streak_up'] = True; add(15, f"{g['streak']}-day streak")
        r['streak'] = g['streak']
        if kind == 'create':
            add(20, 'new design'); badge('first_design')
        elif g['today_versions'] < 15:
            add(10, 'new version'); g['today_versions'] += 1
        if spec:
            if spec.get('sketch'): badge('sketcher')
            if spec.get('palette') and spec['palette'] not in g['palettes']: g['palettes'].append(spec['palette'])
            if spec['garment'] not in g['garments']: g['garments'].append(spec['garment'])
        if len(g['palettes']) >= 5: badge('palette_explorer')
        if len(g['garments']) >= 6: badge('all_styles')
        if design is not None and design.versions.count() >= 10: badge('iterator')
        for n in (3, 7, 30):
            if g['streak'] >= n: badge(f'streak_{n}')
        ch = R.challenge_for(today())
        if spec and not g['challenges'].get(day) and R.check_challenge(ch['id'], spec):
            g['challenges'][day] = ch['id']; r['challenge'] = ch['title']; add(50, f"challenge: {ch['title']}")
        if len(g['challenges']) >= 3: badge('challenger')
    elif kind == 'publish':
        fresh = not g['badges'].get('published'); badge('published')
        if not fresh: add(15, 'published')
    elif kind == 'remix':
        add(10, 'remix')
    elif kind == 'collab':
        fresh = not g['badges'].get('collab'); badge('collab'); add(60 if fresh else 40, 'commission completed')
    elif kind == 'order':
        fresh = not g['badges'].get('made_real'); badge('made_real'); add(100 if fresh else 40, 'order placed')
    after = R.level_of(g['xp'])
    if after['level'] > before:
        r['level_up'] = after['title']
    game.save()
    return r


def game_out(user):
    g = game_of(user).data
    day, t = today().isoformat(), today()
    yesterday = (t - timedelta(days=1)).isoformat()
    ch = R.challenge_for(t)
    week = []
    for i in range(6, -1, -1):
        d = t - timedelta(days=i)
        week.append({'key': d.isoformat(), 'label': 'MTWTFSS'[d.weekday()], 'done': d.isoformat() in g['days'], 'today': i == 0})
    return {'xp': g['xp'], 'streak': g['streak'] if g['last_day'] in (day, yesterday) else 0, 'best': g['best'], 'done_today': g['last_day'] == day, 'at_risk': g['last_day'] == yesterday,
            **R.level_of(g['xp']), 'week': week, 'badges': [{'id': b[0], 'name': b[1], 'desc': b[2], 'at': g['badges'].get(b[0])} for b in R.BADGES],
            'challenge': {'id': ch['id'], 'title': ch['title'], 'text': ch['text'], 'template': ch.get('template'), 'tab': ch.get('tab'), 'done': bool(g['challenges'].get(day))},
            'challenges_done': len(g['challenges']), 'garments': len(g['garments']), 'palettes': len(g['palettes'])}


# ───────── payments ─────────
def new_reference(prefix='FT'):
    return prefix + secrets.token_hex(6).upper()


def paystack_verify(reference):
    """Ask Paystack what really happened to a transaction. Returns (amount in naira, currency) or raises."""
    req = urllib.request.Request(f'https://api.paystack.co/transaction/verify/{urllib.request.quote(reference, safe="")}', headers={'Authorization': f'Bearer {settings.PAYSTACK_SECRET_KEY}', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            data = json.loads(res.read().decode()).get('data') or {}
    except Exception:
        raise Fail('We could not confirm this payment with Paystack yet. If you were charged, it will be matched shortly; otherwise try again.', 502)
    if data.get('status') != 'success':
        raise Fail('Paystack did not complete this payment. You have not been charged.', 402)
    return data.get('amount', 0) / 100, data.get('currency')


def charge(user, amount, kind, data, order=None, commission=None):
    """Take a payment and record it as held. Live: verified with Paystack. Test mode: the built-in test checkout."""
    method, reference = data.get('method') or 'card', txt(data.get('reference'), 60)
    if settings.PAYMENTS_LIVE:
        if method != 'paystack' or not reference:
            raise Fail('Pay with Paystack to continue.')
        p = Payment.objects.select_for_update().filter(reference=reference, user=user, order=order, commission=commission).first()
        if p is None:
            raise Fail('That payment reference is not one we issued.', 400)
        if p.status != 'pending':
            raise Fail('This payment was already recorded.', 409)
        paid, currency = paystack_verify(reference)
        if currency != 'NGN' or int(round(paid)) != int(amount):
            raise Fail('The amount paid does not match what is due. Contact support with your payment reference.', 409)
        p.status, p.amount, p.kind, p.method = 'paid', amount, kind, 'paystack'
        p.save()
        return p
    if not settings.ALLOW_TEST_PAYMENTS:
        raise Fail('Payments are not switched on yet. Please try again later.', 503)
    if method not in ('card', 'transfer'):
        raise Fail('Choose card or bank transfer.')
    last4 = ''
    if method == 'card':                      # the test checkout: any valid test card; CVV 000 is declined
        card = data.get('card') if isinstance(data.get('card'), dict) else {}
        number = ''.join(ch for ch in str(card.get('number') or '') if ch.isdigit())
        if len(number) < 16 or not R.luhn(number): raise Fail('Check the card number.')
        expiry = str(card.get('expiry') or '')
        try:
            mm, yy = int(expiry[:2]), int(expiry[3:5])
            assert len(expiry) == 5 and expiry[2] == '/' and 1 <= mm <= 12
        except (ValueError, AssertionError):
            raise Fail('Enter the expiry as MM/YY.')
        if date(2000 + yy + (mm == 12), mm % 12 + 1, 1) <= today(): raise Fail('This card has expired.')
        cvv = str(card.get('cvv') or '')
        if not (cvv.isdigit() and len(cvv) in (3, 4)): raise Fail('Enter the 3-digit CVV.')
        if cvv == '000': raise Fail('The bank declined this card. Try another card or bank transfer.', 402)
        last4 = number[-4:]
    return Payment.objects.create(order=order, commission=commission, user=user, amount=amount, kind=kind, method=method, reference=new_reference('FT' if order else 'FTC'), status='paid', last4=last4)


def init_payment(user, amount, kind, order=None, commission=None):
    Payment.objects.filter(user=user, order=order, commission=commission, status='pending').delete()
    p = Payment.objects.create(order=order, commission=commission, user=user, amount=amount, kind=kind, method='paystack', reference=new_reference(), status='pending')
    return {'reference': p.reference, 'amount': amount, 'email': user.email}


def rate(target, rating):
    """Fold a new review into a tailor's or designer's running average."""
    target.rating = round((target.rating * target.reviews + rating) / (target.reviews + 1), 1)
    target.reviews += 1
    target.save(update_fields=['rating', 'reviews'])


def mark_delivered(o):
    o.phase, o.delivered_at = 'delivered', now()
    o.status = 'balance_due' if o.paid < o.total else 'delivered'


def event(o, title, body='', by='system', phase=None, photos=None):
    e = {'at': iso(now()), 'phase': phase or o.phase, 'title': txt(title, 90), 'body': txt(body, 600), 'by': by}
    if photos:
        e['photos'] = photos
    o.events = [*o.events, e]


def new_design(user, spec, title=None, **extra):
    d = Design.objects.create(user=user, title=txt(title, 90) or R.title(spec), **extra)
    Version.objects.create(design=d, n=1, instruction='First save', spec=spec)
    return d


def access(d, u):
    """Who may open a design, and how much of it: 'owner', 'party' (a tailor quoting or making it, or the other side of a commission), 'public', or None."""
    if u is not None and (d.user_id == u.id or u.role == 'admin'):
        return 'owner'
    if u is not None:
        v = vendor_of(u)
        if v and (Order.objects.filter(design=d, vendor=v).exists() or Quote.objects.filter(design=d, vendor=v).exists() or (v.status == 'verified' and QuoteRequest.objects.filter(design=d, status='open').exists())):
            return 'party'
        for c in Commission.objects.filter(Q(client=u) | Q(designer=u)):
            if c.ref_design_id == d.id or any(x.get('design_id') == str(d.id) for x in c.deliveries):
                return 'party'
    return 'public' if d.published else None


# ───────── sample tailors and designers (SAMPLE_MODE) ─────────
def matches(v, spec):
    return R.SPECIALTY.get(spec.get('garment')) in v.specialties or 'Production runs' in v.specialties


QUOTE_NOTES = ['Fabric included. Two fittings by video.', 'Price includes fabric and delivery within Nigeria.', 'Can start this week. Fabric sourced locally or send yours.', 'Embroidery done by hand. Fabric included.', 'Includes fabric; add 2 days for delivery outside Lagos.']
REPLIES = {
    'order': ['Noted, thank you. I will post a photo when the next stage is done.', 'Yes, that is fine. We allow a little ease so it sits well.', 'Thanks for the message. It is on the table this week.'],
    'commission': ['Good to know, that helps. I will work it in.', 'Understood. Leave it with me.', 'Yes, I can do that within the same fee.'],
    'direct': ['Thanks for reaching out! Send a commission request from my profile with the occasion and your budget, and I will reply with an offer.', 'Hello! Happy to help. What is the occasion?', 'Thank you. I reply fastest to commission requests, but ask me anything here.'],
}
SWAP = ['emerald', 'burgundy', 'navy', 'ivory', 'charcoal', 'royal blue', 'sand', 'wine']


def simulate_quotes(req):
    design = req.design
    spec = next((v.spec for v in design.versions.all() if v.n == req.version_n), None) or current_version(design).spec
    lo, hi = settings.SAMPLE_QUOTE_DELAY
    have = set(req.quotes.values_list('vendor_id', flat=True))
    for v in Vendor.objects.filter(sample=True, status='verified').exclude(id__in=have):
        h = stable(req.id, v.id, 'q')
        if (not matches(v, spec) and h % 100 < 70) or h % 100 >= 88:
            continue
        due = req.created_at + timedelta(seconds=lo + (h % 1000) / 1000 * max(0.0, hi - lo))
        if now() < due:
            continue
        p = R.price(spec, v.price_factor, v.speed_factor, v.lead_min)
        amount = int(R.jsround((p['price'] * (1 + ((h % 9) - 4) / 100)) / 500) * 500)
        Quote.objects.create(request=req, design=design, vendor=v, price=amount, delivery_days=p['delivery_days'], note=QUOTE_NOTES[h % len(QUOTE_NOTES)], valid_until=now() + timedelta(days=7), created_at=due)
        n = req.quotes.filter(status='offered').count()
        notify(req.user, 'quote', f'{n} quotes for "{design.title}"' if n > 1 else f'{v.name} sent a quote', f"Latest: {v.name}, {money(amount)}, {p['delivery_days']} days." if n > 1 else f"{money(amount)}, {p['delivery_days']} days for \"{design.title}\".", f'/studio?design={design.id}&step=4', f'quote:{req.id}')


ORDER_STEPS = [(1.0, 'tailoring', 'Fabric sourced', '{v} sourced the fabric and started cutting.'), (1.7, 'tailoring', 'Sewing in progress', 'Body and sleeves assembled; finishing is next.'),
               (2.4, 'tailoring', 'Finishing', 'Details complete. Pressing and quality check.'), (3.0, 'tailoring', 'Dispatched', 'Quality checked and handed to the courier.'),
               (3.6, 'delivered', 'Delivered', 'Delivered to your door. Confirm you have it so the tailor can be paid.')]


def simulate_order(o):
    if not o.vendor.sample or o.status != 'active' or not o.paid_at or (o.issue or {}).get('status') == 'open':
        return
    elapsed, pace, changed = (now() - o.paid_at).total_seconds(), settings.SAMPLE_PHASE_SECONDS, False
    titles = {e['title'] for e in o.events}
    for k, phase, title, body in ORDER_STEPS:
        if elapsed < k * pace or title in titles:
            continue
        o.phase = phase
        event(o, title, body.format(v=o.vendor.name), 'vendor', phase)
        if phase == 'delivered':
            mark_delivered(o)
        notify(o.user, 'order', f'{title}: order {o.number}', body.format(v=o.vendor.name), f'/orders?id={o.number}', f'order:{o.number}')
        changed = True
    if changed:
        o.save()


def simulate_commission(c):
    d, p = c.designer, profile_of(c.designer)
    if not d.sample or p is None:
        return
    age, pace = (now() - c.updated_at).total_seconds(), settings.SAMPLE_PHASE_SECONDS / 3
    href = f'/commissions?id={c.id}'
    if c.status == 'requested' and age > pace * 0.6:
        if not p.open:
            c.status = 'declined'
            say(c.thread, None, f'{first(d)} is not taking commissions right now.'); notify(c.client, 'commission', f'{first(d)} declined your request', c.title, href)
        else:
            fee = max(p.fee_from, int(round(min(c.budget or p.fee_from, p.fee_from * 2) / 1000) * 1000))
            c.offer = {'fee': fee, 'days': p.turnaround_days, 'note': 'One design, built for your measurements and the occasion. Two rounds of changes included.', 'at': iso(now())}
            c.status = 'offered'
            say(c.thread, d, 'Thank you for the brief. I would love to do this. I have sent my offer; once it is paid I start straight away.'); say(c.thread, None, f'{first(d)} offered {money(fee)}, {p.turnaround_days} days.')
            notify(c.client, 'commission', f'{first(d)} sent an offer', f'{money(fee)}, {p.turnaround_days} days for "{c.title}".', href)
        c.updated_at = now(); c.save()
    elif c.status in ('active', 'changes') and age > pace:
        prev = Design.objects.filter(id=c.deliveries[-1]['design_id']).first() if c.deliveries else None
        if prev is not None:                                   # a revision: the same design, visibly changed
            spec = dict(current_version(prev).spec)
            spec['color'] = next(x for x in SWAP[stable(c.id, c.revisions) % len(SWAP):] + SWAP if x != spec.get('color'))
            spec = R.normalize(spec)
            n = prev.versions.count() + 1
            Version.objects.create(design=prev, n=n, instruction='Changes for the client', spec=spec, changes=['Colour changed'], from_n=prev.current)
            prev.current, prev.updated_at = n, now(); prev.save()
            design, note = prev, 'Changed as you asked. Have a look at it in 3D and tell me what you think.'
        else:
            pool = [t for t in R.TEMPLATES.values() if t['garment'] == (c.garment or 'kaftan')] or list(R.TEMPLATES.values())
            spec = R.normalize({**pool[stable(c.id) % len(pool)]['spec'], 'template': None})
            design = new_design(d, spec, c.title, allow_remix=False)
            note = f'Here is my design for you: {R.title(spec).lower()}.'
        c.deliveries = [*c.deliveries, {'at': iso(now()), 'design_id': str(design.id), 'version_n': design.current, 'note': note}]
        c.status, c.change_note, c.updated_at = 'delivered', '', now()
        c.save()
        say(c.thread, d, note); say(c.thread, None, f'{first(d)} delivered a design.', design)
        notify(c.client, 'commission', f'{first(d)} delivered your design', f'"{c.title}" is ready to review.', href)


def simulate(user):
    """Let the sample tailors and designers take their turn on everything this user is waiting for."""
    if not settings.SAMPLE_MODE or user is None:
        return
    for req in QuoteRequest.objects.filter(user=user, status='open').select_related('design', 'user'):
        simulate_quotes(req)
    orders = Order.objects.filter(status='active').select_related('vendor', 'user')
    for o in (orders if user.role == 'admin' else orders.filter(user=user)):
        simulate_order(o)
    for c in Commission.objects.filter(client=user, status__in=['requested', 'active', 'changes']).select_related('designer', 'client', 'thread'):
        simulate_commission(c)
    for job in Outbox.objects.filter(due_at__lte=now(), thread__members__user=user).select_related('thread', 'by'):
        say(job.thread, job.by, job.text)
        for m in job.thread.members.exclude(user=job.by).select_related('user'):
            notify(m.user, 'message', f"{person(job.by)['name']} replied", job.text, f'/messages?t={job.thread_id}', f'msg:{job.thread_id}')
        job.delete()


def queue_reply(thread, sample_user):
    if not settings.SAMPLE_MODE or Outbox.objects.filter(thread=thread).exists():
        return
    replies = REPLIES.get(thread.kind, REPLIES['direct'])
    n = thread.messages.count()
    Outbox.objects.create(thread=thread, by=sample_user, text=replies[stable(thread.id, n) % len(replies)], due_at=now() + timedelta(seconds=2.5 + (stable(thread.id, n, 'd') % 35) / 10))
