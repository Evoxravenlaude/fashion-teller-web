"""
The Fashion Teller API. One function per endpoint; core/urls.py is the map and assets/js/api.js is the client.
Every endpoint declares who may call it with @route(...). Rules that are the same in the browser-only build
(assets/js/store.js) are kept the same here, message for message.
"""
import re
from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db.models import Q, Sum
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from . import extras, rules as R
from .api import (PHASES, Fail, access, audit, cards, charge, commission_out, current_version, design_out, designer_out, event, first, followers_of, game_out, get, init_payment,
                  iso, mark_delivered, measurement_out, message_out, mini, money, new_design, notify, now, order_out, person, play, profile_of, pub, queue_reply, quote_out, rate,
                  request_out, review_out, route, say, simulate, simulate_order, simulate_quotes, thread_for, thread_out, today, txt, unread_in, vendor_of, vendor_pub, whole)
from .models import (Application, Audit, Commission, ContactMessage, Design, Designer, Follow, Like, Measurement, Member, Message, Notification, Order, Payment, Payout, Quote, QuoteRequest,
                     Report, Review, Saved, Thread, User, Vendor, Version)

HANDLE = re.compile(r'^[a-z0-9][a-z0-9._]{2,23}$')
PHOTO = re.compile(r'^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$')
DESIGNS = lambda: Design.objects.select_related('user', 'user__designer', 'user__vendor').prefetch_related('versions')


def email_of(v):
    e = txt(v, 120).lower()
    try:
        validate_email(e)
    except ValidationError:
        raise Fail('Enter a valid email address.')
    return e


def password_ok(p):
    try:
        validate_password(p or '')
    except ValidationError:
        raise Fail('Use a password of at least 8 characters.')
    return p


def tokens(u):
    r = RefreshToken.for_user(u)
    return {'user': pub(u), 'access': str(r.access_token), 'refresh': str(r)}


def create_account(d, role='customer'):
    if not txt(d.get('name')): raise Fail('Enter your name.')
    email = email_of(d.get('email'))
    password_ok(d.get('password'))
    if User.objects.filter(email=email).exists(): raise Fail('An account with this email already exists. Sign in instead.', 409)
    u = User.objects.create_user(email, d['password'], name=txt(d['name'], 80), role=role if role in ('customer', 'tailor') else 'customer', phone=txt(d.get('phone'), 30), city=txt(d.get('city'), 60), country=txt(d.get('country'), 60))
    audit('register', u.name, u); extras.send_verification(u)
    return u


# ───────── accounts ─────────
@route(['POST'], auth=False, throttle='auth')
def register(request):
    return Response(tokens(create_account(request.data, request.data.get('role'))), status=201)


@route(['POST'], auth=False, throttle='auth')
def login(request):
    u = User.objects.filter(email=txt(request.data.get('email'), 120).lower()).first()
    if u is None or u.sample or not u.has_usable_password(): raise Fail('No account with that email. Create one to get started.', 401)
    if u.status != 'active': raise Fail('This account has been suspended. Contact support.', 403)
    if not u.check_password(request.data.get('password') or ''): raise Fail('That password is not right.', 401)
    return tokens(u)


@route(['GET', 'PATCH'])
def me(request):
    u = request.me
    if request.method == 'PATCH':
        d = request.data
        for k, n in (('name', 80), ('phone', 30), ('city', 60), ('country', 60)):
            if d.get(k) is not None: setattr(u, k, txt(d[k], n))
        if not u.name: raise Fail('Enter your name.')
        if d.get('email') is not None:
            e = email_of(d['email'])
            if User.objects.filter(email=e).exclude(id=u.id).exists(): raise Fail('That email is already in use.')
            if e != u.email:
                u.email, u.email_verified = e, False; u.save(); extras.send_verification(u)
        if isinstance(d.get('email_prefs'), dict):
            u.email_prefs = {'orders': d['email_prefs'].get('orders') is not False, 'messages': d['email_prefs'].get('messages') is not False}
        u.save()
    return pub(u)


@route(['POST'], throttle='auth')
def password(request):
    u = request.me
    if not u.check_password(request.data.get('current') or ''): raise Fail('Your current password is not right.')
    try:
        validate_password(request.data.get('next') or '')
    except ValidationError:
        raise Fail('Use a new password of at least 8 characters.')
    u.set_password(request.data['next']); u.save()
    return {'ok': True}


@route(['GET'])
def game(request):
    return game_out(request.me)


@route(['GET'])
def unread(request):
    u = request.me
    simulate(u)
    return {'notifications': u.notifications.filter(read=False).count(), 'messages': sum(unread_in(m.thread, m) for m in u.memberships.select_related('thread'))}


@route(['GET'])
def notifications(request):
    simulate(request.me)
    return [{'id': str(n.id), 'kind': n.kind, 'title': n.title, 'body': n.body, 'href': n.href, 'at': iso(n.at), 'read': n.read} for n in request.me.notifications.all()[:40]]


@route(['POST'])
def notifications_read(request):
    ids, q = request.data.get('ids', 'all'), request.me.notifications.filter(read=False)
    if ids != 'all':
        q = q.filter(id__in=[int(i) for i in ids if str(i).isdigit()] if isinstance(ids, list) else [])
    q.update(read=True)
    return {'ok': True}


def save_measurement(u, d, rec=None):
    vals = {}
    for k, v in (d.get('values') if isinstance(d.get('values'), dict) else {}).items():
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if re.match(r'^[a-z]{2,12}$', str(k)) and 0 < n < 400: vals[k] = round(n, 1)
    if not vals.get('chest') or not vals.get('waist'): raise Fail('Chest and waist are the minimum a tailor needs.')
    if rec is None:
        if u.measurements.count() >= 12: raise Fail('You can keep up to 12 measurement profiles.')
        rec = Measurement(user=u)
    rec.label, rec.unit, rec.values = txt(d.get('label'), 40) or 'Me', 'in' if d.get('unit') == 'in' else 'cm', vals
    rec.fit, rec.notes, rec.updated_at = d.get('fit') if d.get('fit') in ('slim', 'regular', 'relaxed') else 'regular', txt(d.get('notes'), 400), now()
    rec.save()
    return measurement_out(rec)


@route(['GET', 'POST'])
def measurements(request):
    if request.method == 'POST':
        return Response(save_measurement(request.me, request.data), status=201)
    return [measurement_out(m) for m in request.me.measurements.order_by('id')]


@route(['PATCH', 'DELETE'])
def measurement(request, pk):
    m = get(Measurement, 'Measurement profile not found.', id=pk, user=request.me)
    if request.method == 'PATCH':
        return save_measurement(request.me, request.data, m)
    if Order.objects.filter(measurement=m, status__in=['active', 'awaiting_payment']).exists(): raise Fail('An order in production uses this profile.')
    m.delete()
    return Response(status=204)


@route(['GET', 'PUT'])
def my_designer(request):
    u, p = request.me, profile_of(request.me)
    if request.method == 'GET':
        return designer_out(p, u) if p else Response(None)
    d = request.data
    handle = txt(d.get('handle') if d.get('handle') is not None else (p.handle if p else ''), 30).lower().lstrip('@')
    if not HANDLE.match(handle): raise Fail('Choose a handle of 3 to 24 letters, numbers, dots or underscores.')
    if Designer.objects.filter(handle=handle).exclude(user=u).exists(): raise Fail('That handle is taken.', 409)
    bio = txt(d.get('bio') if d.get('bio') is not None else (p.bio if p else ''), 400)
    if not bio: raise Fail('Write a line or two about what you design.')
    specs = [txt(s, 30) for s in d['specialties'] if txt(s, 30)][:6] if isinstance(d.get('specialties'), list) else (p.specialties if p else [])
    if not specs: raise Fail('Pick at least one thing you design.')
    fee = whole(d.get('fee_from', p.fee_from if p else 0), 1000, 5000000, 'a starting fee of at least ₦1,000')
    days = whole(d.get('turnaround_days', p.turnaround_days if p else 3), 1, 60, 'a turnaround between 1 and 60 days')
    fresh = p is None
    if fresh:
        p = Designer(user=u); audit('designer:new', u.name, u)
    p.handle, p.bio, p.specialties, p.fee_from, p.turnaround_days = handle, bio, specs, fee, days
    p.open = bool(d['open']) if d.get('open') is not None else (p.open if not fresh else True)
    p.save()
    u.designer = p
    return {**designer_out(p, u), 'fresh': fresh}


# ───────── designs + versions ─────────
def own_design(request, pk, admin=False):
    d = DESIGNS().filter(id=pk if str(pk).isdigit() else 0).first()
    if d is None or not (d.user_id == request.me.id or (admin and request.me.role == 'admin')): raise Fail('Design not found.', 404)
    return d


@route(['GET', 'POST'])
def designs(request):
    u = request.me
    if request.method == 'GET':
        return [design_out(d, u) for d in DESIGNS().filter(user=u).order_by('-updated_at')]
    d = request.data
    if not isinstance(d.get('spec'), dict): raise Fail('Start from a template or describe the garment first.')
    spec = R.normalize(d['spec'])
    tpl = R.TEMPLATES.get(spec['template'] or '')
    design = new_design(u, spec, txt(d.get('title')) or txt(d.get('auto_title'), 90), renamed=bool(txt(d.get('title'))), prompt=txt(d.get('prompt'), 600), source='describe' if txt(d.get('prompt')) else 'builder')
    design.versions.update(instruction=f"Started from {tpl['name']}" if tpl else 'Made from your description' if design.prompt else 'First save')
    reward = play(u, 'create', spec, design)
    return Response({**design_out(DESIGNS().get(id=design.id), u), 'reward': reward}, status=201)


@route(['GET', 'PATCH', 'DELETE'], auth=False)
def design(request, pk):
    u = request.me
    if request.method == 'GET':
        d = DESIGNS().filter(id=pk if str(pk).isdigit() else 0).first()
        if d is None: raise Fail('That design no longer exists.', 404)
        view = access(d, u)
        if not view: raise Fail('This design is private.' if u else 'Sign in to open this design.', 403 if u else 401)
        return design_out(d, u, view)
    if u is None: raise Fail('Sign in to continue.', 401)
    d = own_design(request, pk)
    if request.method == 'PATCH':
        if not txt(request.data.get('title')): raise Fail('Give the design a name.')
        d.title, d.renamed, d.updated_at = txt(request.data['title'], 90), True, now(); d.save()
        return design_out(d, u)
    if Order.objects.filter(design=d).exclude(status='cancelled').exists(): raise Fail('This design has an order. It stays in your library.')
    if any(any(x.get('design_id') == str(d.id) for x in c.deliveries) for c in Commission.objects.filter(designer=u).exclude(status__in=['cancelled', 'declined'])): raise Fail('This design was delivered for a commission. It stays in your library.')
    d.delete()
    return Response(status=204)


@route(['POST'])
def design_versions(request, pk):
    u, d = request.me, own_design(request, pk, admin=True)
    if d.status == 'ordered': raise Fail('This design is in production. Duplicate it to keep designing.')
    spec, label = R.normalize(request.data.get('spec')), txt(request.data.get('label'), 90)
    vs = list(d.versions.all())
    base = next((v for v in vs if v.n == request.data.get('from_n')), None) or next((v for v in vs if v.n == d.current), vs[-1])
    if base.spec == spec and not label: raise Fail('Nothing changed since the last version.')
    if len(vs) >= 60: raise Fail('This design has 60 versions. Duplicate it to keep going.')
    changes = R.diff(base.spec, spec)[:20]
    n = max(v.n for v in vs) + 1
    Version.objects.create(design=d, n=n, instruction=label or (', '.join(changes[:2]) + (f' +{len(changes) - 2} more' if len(changes) > 2 else '')) or 'Changes saved', spec=spec, changes=changes, from_n=base.n)
    d.current, d.updated_at = n, now()
    if not d.renamed: d.title = txt(request.data.get('auto_title'), 90) or R.title(spec)
    d.save()
    d = DESIGNS().get(id=d.id)
    return {**design_out(d, u), 'reward': play(u, 'version', spec, d)}


@route(['POST'])
def design_restore(request, pk):
    u, d = request.me, own_design(request, pk, admin=True)
    v = d.versions.filter(n=whole(request.data.get('n'), 1, None, 'a version number')).first()
    if v is None: raise Fail('That version does not exist.', 404)
    if d.status == 'ordered': raise Fail('This design is in production. Duplicate it to keep designing.')
    if d.current != v.n:
        n = d.versions.count() + 1
        Version.objects.create(design=d, n=n, instruction=f'Back to version {v.n}', spec=v.spec, changes=[f'Restored v{v.n}'], from_n=v.n, restored=v.n)
        d.current, d.updated_at = n, now()
        if not d.renamed: d.title = R.title(v.spec)
        d.save()
    return design_out(DESIGNS().get(id=d.id), u)


@route(['POST'])
def design_duplicate(request, pk):
    u, d = request.me, own_design(request, pk, admin=True)
    cur = current_version(d)
    nd = new_design(u, cur.spec, d.title + ' (copy)', renamed=True, credit=d.credit)
    nd.versions.update(instruction=f'Copied from "{d.title}" v{cur.n}'[:120])
    return Response(design_out(DESIGNS().get(id=nd.id), u), status=201)


@route(['POST'])
def design_publish(request, pk):
    u, d = request.me, own_design(request, pk)
    if d.credit and str(d.credit.get('id')) != str(u.id) and not d.remix_info: raise Fail('This design was made for you by a designer. Ask them before publishing it.')
    tags = request.data.get('tags') or []
    tags = tags if isinstance(tags, list) else re.split(r'[,#\s]+', str(tags))
    fresh = not d.published
    d.caption, d.allow_remix = txt(request.data.get('caption'), 240), bool(request.data.get('allow_remix', True))
    d.tags = list(dict.fromkeys(t for t in (re.sub(r'[^a-z0-9-]', '', txt(t, 24).lower()) for t in tags) if t))[:6]
    d.published, d.published_at, d.updated_at = True, d.published_at or now(), now()
    d.save()
    reward = None
    if fresh:
        reward = play(u, 'publish')
        for f in Follow.objects.filter(target=u).select_related('user'):
            notify(f.user, 'publish', f'{u.name} published a design', d.title, f'/design?id={d.id}')
        audit('publish', d.title, u)
    return {**design_out(d, u), 'reward': reward}


@route(['POST'])
def design_unpublish(request, pk):
    d = own_design(request, pk, admin=True)
    d.published, d.updated_at = False, now(); d.save()
    return design_out(d, request.me)


def public_design(pk):
    return get(Design, 'Design not found.', id=pk if str(pk).isdigit() else 0, published=True)


@route(['POST'])
def design_like(request, pk):
    u, d = request.me, public_design(pk)
    if request.data.get('on', True):
        _, made = Like.objects.get_or_create(user=u, design=d)
        if made and d.user_id != u.id: notify(d.user, 'like', f'{u.name} liked your design', d.title, f'/design?id={d.id}')
    else:
        Like.objects.filter(user=u, design=d).delete()
    return {'likes': d.like_base + d.likes.count(), 'liked': bool(request.data.get('on', True))}


@route(['POST'])
def design_save(request, pk):
    u, d = request.me, public_design(pk)
    Saved.objects.get_or_create(user=u, design=d) if request.data.get('on', True) else Saved.objects.filter(user=u, design=d).delete()
    return {'saved': bool(request.data.get('on', True))}


@route(['POST'])
def design_remix(request, pk):
    u = request.me
    d = DESIGNS().filter(id=pk if str(pk).isdigit() else 0).first()
    if d is None or not access(d, u): raise Fail('Design not found.', 404)
    if d.user_id != u.id and not (d.published and d.allow_remix): raise Fail('The designer has not opened this design for remixing.', 403)
    owner, cur = person(d.user), current_version(d)
    nd = new_design(u, cur.spec, d.title + ' (remix)', renamed=True, remix_of=d, remix_info={'design_id': str(d.id), 'title': d.title, 'by': owner['name'], 'by_id': owner['id']},
                    credit=d.credit or {'id': owner['id'], 'name': owner['name'], 'handle': owner['handle']})
    nd.versions.update(instruction=f'Remixed from "{d.title}" by {owner["name"]}'[:120])
    reward = play(u, 'remix')
    if d.user_id != u.id: notify(d.user, 'remix', f'{u.name} remixed your design', d.title, f'/design?id={d.id}')
    return Response({**design_out(DESIGNS().get(id=nd.id), u), 'reward': reward}, status=201)


@route(['GET'], auth=False)
def discover(request):
    u, q = request.me, request.query_params
    qs = DESIGNS().filter(published=True, user__status='active')
    if q.get('garment') in R.GARMENTS:
        qs = qs.filter(id__in=[d.id for d in qs if current_version(d).spec.get('garment') == q['garment']])
    if q.get('by', '').isdigit(): qs = qs.filter(user_id=q['by'])
    sort = q.get('sort', 'trending')
    if sort in ('following', 'saved'):
        if u is None: return {'items': [], 'total': 0}
        qs = qs.filter(user_id__in=Follow.objects.filter(user=u).values('target_id')) if sort == 'following' else qs.filter(id__in=Saved.objects.filter(user=u).values('design_id'))
    needle = txt(q.get('q'), 60).lower().lstrip('#')
    items = list(qs)
    if needle:
        items = [d for d in items if needle in ' '.join([d.title, d.caption, ' '.join(d.tags), d.user.name, getattr(profile_of(d.user), 'handle', '') or '']).lower()]
    all_cards = {c['id']: c for c in cards(items, u)}
    score = lambda d: all_cards[str(d.id)]['likes'] * 3 + all_cards[str(d.id)]['remixes'] * 12 + max(0.0, 14 - (now() - d.published_at).total_seconds() / 86400) * 30
    items = [d for d in items if str(d.id) in all_cards]
    items.sort(key=score if sort == 'trending' else (lambda d: d.published_at), reverse=True)
    off, lim = whole(q.get('offset', 0), 0, 100000, 'an offset'), whole(q.get('limit', 24), 1, 60, 'a limit')
    return {'items': [all_cards[str(d.id)] for d in items[off:off + lim]], 'total': len(items)}


@route(['POST'])
def reports(request):
    u, d = request.me, request.data
    kind, ref = d.get('kind', 'design'), txt(d.get('id'), 20)
    if kind not in ('design', 'user', 'message') or not ref: raise Fail('Nothing to report.')
    if not txt(d.get('reason')): raise Fail('Choose a reason.')
    if not Report.objects.filter(by=u, kind=kind, ref_id=ref, status='open').exists():
        Report.objects.create(kind=kind, ref_id=ref, reason=txt(d['reason'], 60), note=txt(d.get('note'), 500), by=u)
        audit(f'report:{kind}', ref, u)
    return {'ok': True}


# ───────── designers ─────────
@route(['GET'], auth=False)
def designers(request):
    q, u = request.query_params, request.me
    needle = txt(q.get('q'), 60).lower().lstrip('@')
    out = [designer_out(p, u) for p in Designer.objects.filter(user__status='active').select_related('user')]
    out = [p for p in out if (not q.get('open') or p['open']) and (not q.get('specialty') or q['specialty'] in p['specialties']) and (not needle or needle in ' '.join([p['name'], p['handle'], p['bio'], p['city'], ' '.join(p['specialties'])]).lower())]
    return sorted(out, key=lambda p: (not p['featured'], -p['followers']))


@route(['GET'], auth=False)
def designer(request, key):
    me_, key = request.me, key.lstrip('@')
    p = Designer.objects.filter(handle=key).select_related('user').first() or (Designer.objects.filter(user_id=key).select_related('user').first() if key.isdigit() else None)
    u = p.user if p else (User.objects.filter(id=key).first() if key.isdigit() else None)
    if u is None or u.status != 'active' or u.role == 'admin': raise Fail('That profile does not exist.', 404)
    items = cards(DESIGNS().filter(user=u, published=True).order_by('-published_at'), me_)
    if p:
        return {**designer_out(p, me_), 'is_designer': True, 'items': items, 'review_list': [review_out(r) for r in Review.objects.filter(designer=u).select_related('by', 'order', 'commission').order_by('-created_at')[:12]]}
    return {**person(u), 'user_id': str(u.id), 'is_designer': False, 'bio': '', 'specialties': [], 'open': False, 'followers': followers_of(u.id), 'following': bool(me_) and Follow.objects.filter(user=me_, target=u).exists(),
            'designs': len(items), 'mine': bool(me_) and me_.id == u.id, 'items': items, 'review_list': []}


@route(['POST'])
def follow(request, pk):
    u, t = request.me, get(User, 'You cannot follow this profile.', 400, id=pk if str(pk).isdigit() else 0)
    if t.id == u.id: raise Fail('You cannot follow this profile.')
    if request.data.get('on', True):
        _, made = Follow.objects.get_or_create(user=u, target=t)
        if made: notify(t, 'follow', f'{u.name} followed you', '', f'/designer?id={u.id}')
    else:
        Follow.objects.filter(user=u, target=t).delete()
    p = profile_of(t)
    return {'following': bool(request.data.get('on', True)), 'followers': followers_of(t.id, p.followers_base if p else 0)}


# ───────── commissions ─────────
COMMISSIONS = lambda: Commission.objects.select_related('client', 'designer', 'designer__designer', 'thread', 'ref_design', 'result_design')


def my_commission(request, pk, side=None):
    c = COMMISSIONS().filter(id=pk if str(pk).isdigit() else 0).first()
    u = request.me
    ok = c is not None and ((side in (None, 'client') and c.client_id == u.id) or (side in (None, 'designer') and c.designer_id == u.id) or (side is None and u.role == 'admin'))
    if not ok: raise Fail('Commission not found.', 404)
    return c


@route(['GET', 'POST'])
def commissions(request):
    u = request.me
    if request.method == 'GET':
        simulate(u)
        return [commission_out(c, u) for c in COMMISSIONS().filter(Q(client=u) | Q(designer=u)).order_by('-updated_at')]
    d = request.data
    target = User.objects.filter(id=d.get('designer_id') if str(d.get('designer_id', '')).isdigit() else 0).first()
    p = profile_of(target)
    if p is None or target.status != 'active': raise Fail('That designer does not exist.', 404)
    if target.id == u.id: raise Fail('You cannot commission yourself.')
    if not p.open: raise Fail(f'{first(target)} is not taking commissions right now.')
    if len(txt(d.get('title'))) < 3: raise Fail('Give the commission a short title.')
    if len(txt(d.get('brief'), 2000)) < 20: raise Fail('Describe what you want in a sentence or two, so the designer can price it.')
    budget = whole(d.get('budget') or 0, 0, 50000000, 'a budget')
    if budget and budget < 1000: raise Fail('Enter a budget of at least ₦1,000, or leave it empty.')
    deadline = None
    if d.get('deadline'):
        try:
            deadline = date.fromisoformat(str(d['deadline'])[:10])
        except ValueError:
            raise Fail('Choose a date in the future.')
        if deadline < today(): raise Fail('Choose a date in the future.')
    if Commission.objects.filter(client=u, designer=target, status__in=['requested', 'offered']).count() >= 3: raise Fail('You already have open requests with this designer.')
    ref = Design.objects.filter(id=d.get('ref_design_id') if str(d.get('ref_design_id', '')).isdigit() else 0, user=u).first()
    c = Commission.objects.create(client=u, designer=target, title=txt(d['title'], 90), brief=txt(d['brief'], 2000), garment=d.get('garment') if d.get('garment') in R.GARMENTS else '', occasion=txt(d.get('occasion'), 60), budget=budget, deadline=deadline, ref_design=ref)
    c.thread = thread_for('commission', c.id, [u, target], c.title); c.save()
    say(c.thread, None, f'{first(u)} sent a commission request.')
    notify(target, 'commission', 'New commission request', f'{u.name}: {c.title}', f'/commissions?id={c.id}'); audit('commission:new', c.title, u)
    return Response(commission_out(c, u), status=201)


@route(['GET'])
def commission(request, pk):
    simulate(request.me)
    return commission_out(my_commission(request, pk), request.me)


@route(['POST'])
def commission_offer(request, pk):
    u, c = request.me, my_commission(request, pk, 'designer')
    if c.status not in ('requested', 'offered'): raise Fail('This request is no longer open for an offer.')
    fee, days = whole(request.data.get('fee'), 1000, 5000000, 'a fee of at least ₦1,000'), whole(request.data.get('days'), 1, 60, 'a delivery time between 1 and 60 days')
    c.offer, c.status, c.updated_at = {'fee': fee, 'days': days, 'note': txt(request.data.get('note'), 400), 'at': iso(now())}, 'offered', now(); c.save()
    say(c.thread, None, f"{first(u)} offered {money(fee)}, {days} day{'' if days == 1 else 's'}.")
    notify(c.client, 'commission', f'{first(u)} sent an offer', f'{money(fee)}, {days} days for "{c.title}".', f'/commissions?id={c.id}')
    return commission_out(c, u)


@route(['POST'])
def commission_decline(request, pk):
    u, c = request.me, my_commission(request, pk, 'designer')
    if c.status not in ('requested', 'offered'): raise Fail('Only a request that has not been paid can be declined.')
    c.status, c.updated_at = 'declined', now(); c.save()
    reason = txt(request.data.get('reason'), 200)
    say(c.thread, None, f'{first(u)} declined the request.' + (f' {reason}' if reason else ''))
    notify(c.client, 'commission', f'{first(u)} declined your request', c.title, f'/commissions?id={c.id}')
    return commission_out(c, u)


@route(['POST'])
def commission_pay_init(request, pk):
    c = my_commission(request, pk, 'client')
    if c.status != 'offered' or not c.offer: raise Fail('There is no open offer to pay.')
    return init_payment(request.me, c.offer['fee'], 'commission', commission=c)


@route(['POST'])
def commission_pay(request, pk):
    c = Commission.objects.select_for_update().filter(id=pk if str(pk).isdigit() else 0, client=request.me).first()
    if c is None: raise Fail('Commission not found.', 404)
    return pay_commission(request.me, c, request.data)


def pay_commission(u, c, data):
    if c.status != 'offered' or not c.offer: raise Fail('There is no open offer to pay.')
    p = charge(u, c.offer['fee'], 'commission', data, commission=c)
    c.paid, c.paid_at, c.status, c.updated_at = c.offer['fee'], now(), 'active', now(); c.save()
    c = COMMISSIONS().get(id=c.id)
    say(c.thread, None, f'{first(u)} paid. {money(c.paid)} is held by Fashion Teller until the design is approved.')
    notify(c.designer, 'commission', f'{first(u)} paid for the commission', f'"{c.title}". Deliver within {c.offer["days"]} days.', f'/commissions?id={c.id}'); audit('pay', p.reference, u)
    return {'payment': payment_out(p), 'commission': commission_out(c, u)}


@route(['POST'])
def commission_deliver(request, pk):
    u, c = request.me, my_commission(request, pk, 'designer')
    if c.status not in ('active', 'changes'): raise Fail('You already delivered. Wait for the client to answer.' if c.status == 'delivered' else 'This commission is not waiting on a delivery.')
    d = Design.objects.filter(id=request.data.get('design_id') if str(request.data.get('design_id', '')).isdigit() else 0, user=u).first()
    if d is None: raise Fail('Choose one of your own designs to deliver.')
    c.deliveries = [*c.deliveries, {'at': iso(now()), 'design_id': str(d.id), 'version_n': d.current, 'note': txt(request.data.get('note'), 600)}]
    c.status, c.change_note, c.updated_at = 'delivered', '', now(); c.save()
    say(c.thread, None, f'{first(u)} delivered a design.', d)
    notify(c.client, 'commission', f'{first(u)} delivered your design', f'"{c.title}" is ready to review.', f'/commissions?id={c.id}')
    return commission_out(c, u)


@route(['POST'])
def commission_changes(request, pk):
    u, c = request.me, my_commission(request, pk, 'client')
    if c.status != 'delivered': raise Fail('There is no delivery to answer yet.')
    if c.revisions >= c.max_revisions: raise Fail(f'This commission includes {c.max_revisions} rounds of changes and both are used. Approve it, or message the designer.')
    note = txt(request.data.get('note'), 600)
    if len(note) < 8: raise Fail('Say what you would like changed.')
    c.revisions, c.status, c.change_note, c.updated_at = c.revisions + 1, 'changes', note, now(); c.save()
    say(c.thread, u, note); say(c.thread, None, f'{first(u)} asked for changes ({c.revisions} of {c.max_revisions}).')
    notify(c.designer, 'commission', f'{first(u)} asked for changes', note, f'/commissions?id={c.id}')
    return commission_out(c, u)


@route(['POST'])
def commission_approve(request, pk):
    u = request.me
    Commission.objects.select_for_update().filter(id=pk if str(pk).isdigit() else 0).first()
    c = my_commission(request, pk, 'client')
    if c.status != 'delivered': raise Fail('There is no delivery to approve yet.')
    last = c.deliveries[-1]
    src = Design.objects.filter(id=last['design_id']).first()
    if src is None: raise Fail('The delivered design is no longer available. Message the designer.')
    who = person(c.designer)
    spec = (src.versions.filter(n=last.get('version_n')).first() or current_version(src)).spec
    nd = new_design(u, spec, c.title, renamed=True, credit={'id': who['id'], 'name': who['name'], 'handle': who['handle']}, commission_of=str(c.id))
    nd.versions.update(instruction=f'Designed for you by {who["name"]}'[:120])
    c.result_design, c.status, c.updated_at = nd, 'approved', now(); c.save()
    c.payments.filter(status='paid').update(status='released')
    p = profile_of(c.designer)
    if p: p.completed += 1; p.save(update_fields=['completed'])
    po = extras.payout(c.designer, 'commission', c.title, c.paid, commission=c)
    say(c.thread, None, f'{first(u)} approved the design. {money(c.paid)} released to {first(c.designer)}.')
    notify(c.designer, 'commission', 'Design approved, payment released', f'{money(po.net if po else c.paid)} for "{c.title}"' + (f', after the {settings.PLATFORM_FEE_PERCENT:g}% platform fee.' if po and po.fee else '.'), f'/commissions?id={c.id}')
    if not c.designer.sample: play(c.designer, 'collab')
    return {'commission': commission_out(c, u), 'design': design_out(DESIGNS().get(id=nd.id), u), 'reward': play(u, 'collab')}


@route(['POST'])
def commission_cancel(request, pk):
    u, c = request.me, my_commission(request, pk, 'client')
    if c.status not in ('requested', 'offered', 'active') or c.deliveries: raise Fail('The designer has already delivered work on this commission. Message them, or report a problem.')
    if c.paid:
        c.payments.filter(status='paid').update(status='refunded')
        say(c.thread, None, f'Cancelled. {money(c.paid)} refunded to {first(u)}.'); c.paid = 0
    else:
        say(c.thread, None, f'{first(u)} cancelled the request.')
    c.status, c.updated_at = 'cancelled', now(); c.save()
    notify(c.designer, 'commission', 'Commission cancelled', c.title, f'/commissions?id={c.id}')
    return commission_out(c, u)


# ───────── reviews ─────────
@route(['GET', 'POST'], auth=False)
def reviews(request):
    if request.method == 'GET':
        q = request.query_params
        qs = Review.objects.filter(vendor_id=q['vendor_id']) if q.get('vendor_id', '').isdigit() else Review.objects.filter(designer_id=q['designer_id']) if q.get('designer_id', '').isdigit() else Review.objects.none()
        return [review_out(r) for r in qs.select_related('by', 'order', 'commission').order_by('-created_at')[:20]]
    u, d = request.me, request.data
    if u is None: raise Fail('Sign in to continue.', 401)
    rating = whole(d.get('rating'), 1, 5, '1 to 5 stars')
    if d.get('kind') == 'order':
        o = Order.objects.filter(number=txt(d.get('id'), 12), user=u).select_related('vendor', 'vendor__user').first()
        if o is None or o.status not in ('delivered', 'completed'): raise Fail('You can review an order once it is delivered.')
        if hasattr(o, 'review'): raise Fail('You have already reviewed this.', 409)
        r = Review.objects.create(kind='order', order=o, by=u, vendor=o.vendor, rating=rating, text=txt(d.get('text'), 600))
        rate(o.vendor, rating); notify(o.vendor.user, 'review', f'{first(u)} left a {rating}-star review', r.text, '/workshop')
    elif d.get('kind') == 'commission':
        c = Commission.objects.filter(id=d.get('id') if str(d.get('id', '')).isdigit() else 0, client=u).select_related('designer').first()
        if c is None or c.status != 'approved': raise Fail('You can review a commission once you have approved it.')
        if hasattr(c, 'review'): raise Fail('You have already reviewed this.', 409)
        r = Review.objects.create(kind='commission', commission=c, by=u, designer=c.designer, rating=rating, text=txt(d.get('text'), 600))
        p = profile_of(c.designer)
        if p: rate(p, rating)
        notify(c.designer, 'review', f'{first(u)} left a {rating}-star review', r.text, f'/designer?id={c.designer_id}')
    else:
        raise Fail('Nothing to review.')
    return Response(review_out(r), status=201)


# ───────── messages ─────────
def my_thread(request, pk):
    m = Member.objects.filter(thread_id=pk if str(pk).isdigit() else 0, user=request.me).select_related('thread').first()
    if m is None: raise Fail('Conversation not found.', 404)
    return m


@route(['GET', 'POST'])
def threads(request):
    u = request.me
    if request.method == 'GET':
        simulate(u)
        return [thread_out(m.thread, u) for m in u.memberships.select_related('thread').order_by('-thread__updated_at')]
    d = request.data
    if d.get('order_id'):
        o = Order.objects.filter(number=txt(d['order_id'], 12)).select_related('vendor', 'vendor__user', 'user').first()
        if o is None or u.id not in (o.user_id, o.vendor.user_id): raise Fail('Order not found.', 404)
        if o.status == 'awaiting_payment': raise Fail('You can message the tailor once the order is paid.')
        th = thread_for('order', o.number, [o.user, o.vendor.user], f'Order {o.number}')
    elif d.get('commission_id'):
        c = Commission.objects.filter(id=d['commission_id'] if str(d['commission_id']).isdigit() else 0).select_related('client', 'designer', 'thread').first()
        if c is None or u.id not in (c.client_id, c.designer_id): raise Fail('Commission not found.', 404)
        th = c.thread or thread_for('commission', c.id, [c.client, c.designer], c.title)
    else:
        t = User.objects.filter(id=d.get('user_id') if str(d.get('user_id', '')).isdigit() else 0).first()
        if t is None or t.id == u.id or t.status != 'active' or t.role == 'admin': raise Fail('You cannot message this profile.')
        existing = Thread.objects.filter(kind='direct', members__user=u).filter(members__user=t).exists()
        if not profile_of(t) and not vendor_of(t) and not existing: raise Fail('You can message designers and tailors from their profiles.', 403)
        th = thread_for('direct', '', [u, t])
    return thread_out(th, u)


def thread_full(m, u):
    th = m.thread
    msgs = list(th.messages.select_related('design', 'design__user').order_by('-at', '-id')[:200])[::-1]
    if msgs and m.read_at != msgs[-1].at:
        m.read_at = msgs[-1].at; m.save(update_fields=['read_at'])
    return {**thread_out(th, u), 'messages': [message_out(x, u) for x in msgs]}


@route(['GET'])
def thread(request, pk):
    simulate(request.me)
    return thread_full(my_thread(request, pk), request.me)


@route(['POST'])
def thread_messages(request, pk):
    u, m = request.me, my_thread(request, pk)
    body = txt(request.data.get('text'), 2000)
    d = Design.objects.filter(id=request.data.get('design_id') if str(request.data.get('design_id', '')).isdigit() else 0, user=u).first() if request.data.get('design_id') else None
    if request.data.get('design_id') and d is None: raise Fail('You can only share your own designs.')
    if not body and d is None: raise Fail('Write a message first.')
    if Message.objects.filter(by=u, at__gt=now() - timedelta(seconds=60)).count() >= 20: raise Fail('You are sending messages very quickly. Give it a minute.', 429)
    say(m.thread, u, body or 'Shared a design', d)
    for other in m.thread.members.exclude(user=u).select_related('user'):
        if other.user.sample:
            queue_reply(m.thread, other.user)
        else:
            notify(other.user, 'message', f'{u.name} sent a message', body or 'Shared a design', f'/messages?t={m.thread_id}', f'msg:{m.thread_id}')
    return thread_full(my_thread(request, pk), u)


# ───────── tailors ─────────
@route(['GET'], auth=False)
def vendors(request):
    all_ = request.query_params.get('all') and request.me is not None and request.me.role == 'admin'
    return [vendor_pub(v) for v in (Vendor.objects.all() if all_ else Vendor.objects.filter(status='verified')).order_by('id')]


@route(['GET'], auth=False)
def vendor(request, pk):
    v = get(Vendor, 'Tailor not found.', id=pk if str(pk).isdigit() else 0)
    u = request.me
    if v.status != 'verified' and not (u and (u.role == 'admin' or v.user_id == u.id)): raise Fail('Tailor not found.', 404)
    return {**vendor_pub(v), 'review_list': [review_out(r) for r in Review.objects.filter(vendor=v).select_related('by', 'order', 'commission').order_by('-created_at')[:20]]}


@route(['GET', 'PATCH'], role='tailor')
def my_vendor(request):
    v = vendor_of(request.me)
    if request.method == 'GET':
        return vendor_pub(v) if v else Response(None)
    if v is None: raise Fail('No workshop on this account.', 404)
    d = request.data
    for k, n in (('name', 80), ('city', 60), ('country', 60)):
        if txt(d.get(k)): setattr(v, k, txt(d[k], n))
    if d.get('bio') is not None: v.bio = txt(d['bio'], 500)
    if isinstance(d.get('specialties'), list) and d['specialties']: v.specialties = [txt(s, 30) for s in d['specialties'] if txt(s, 30)][:8]
    if d.get('lead_min'): v.lead_min = whole(d['lead_min'], 2, 60, 'a lead time between 2 and 60 days')
    v.save()
    return vendor_pub(v)


@route(['POST'], auth=False, throttle='auth')
def vendor_apply(request):
    u, d, fresh = request.me, request.data, False
    if not txt(d.get('workshop')): raise Fail('Enter the name of your workshop.')
    if u is None:
        if User.objects.filter(email=txt(d.get('email'), 120).lower()).exists(): raise Fail('An account with this email already exists. Sign in, then apply from your account.', 409)
        u, fresh = create_account(d, 'tailor'), True
    if vendor_of(u): raise Fail('Your workshop is already registered. Check its status in your workshop page.', 409)
    if u.role == 'customer': u.role = 'tailor'; u.save()
    specs = [txt(s, 30) for s in (d.get('specialties') or []) if txt(s, 30)][:8] if isinstance(d.get('specialties'), list) else []
    v = Vendor.objects.create(user=u, name=txt(d['workshop'], 80), city=txt(d.get('city'), 60), country=txt(d.get('country'), 60), specialties=specs, bio=txt(d.get('about'), 500), since=today().year, hue=(u.id * 47) % 360)
    Application.objects.create(user=u, vendor=v, workshop=v.name, name=txt(d.get('name') or u.name, 80), email=u.email, phone=txt(d.get('phone') or u.phone, 30), city=v.city, country=v.country, specialties=specs, about=v.bio)
    audit('apply', v.name, u)
    u.vendor = v
    return Response({'vendor': vendor_pub(v), **(tokens(u) if fresh else {})}, status=201)


def verified_vendor(request):
    v = vendor_of(request.me)
    if v is None or v.status != 'verified': raise Fail('Your workshop must be verified before you can quote.', 403)
    return v


@route(['GET'], role='tailor')
def vendor_requests(request):
    v, u = vendor_of(request.me), request.me
    if v is None or v.status != 'verified': return []
    out = []
    for r in QuoteRequest.objects.filter(status='open').select_related('design', 'design__user', 'user', 'measurement').order_by('-created_at')[:100]:
        spec = next((x.spec for x in r.design.versions.all() if x.n == r.version_n), None) or current_version(r.design).spec
        mine = r.quotes.filter(vendor=v).first()
        s = R.price(spec, v.price_factor, v.speed_factor, v.lead_min)
        out.append({**request_out(r), 'design': design_out(r.design, u, 'party'), 'customer': {'name': r.user.name, 'city': r.user.city, 'country': r.user.country}, 'measurement': measurement_out(r.measurement),
                    'my_quote': quote_out(mine, False) if mine else None, 'suggested': {'price': s['price'], 'delivery_days': s['delivery_days']}, 'quote_count': r.quotes.exclude(status='withdrawn').count()})
    return out


@route(['POST'], role='tailor')
def vendor_quote(request, pk):
    v = verified_vendor(request)
    r = QuoteRequest.objects.filter(id=pk if str(pk).isdigit() else 0, status='open').select_related('design', 'user').first()
    if r is None: raise Fail('This request is no longer open.', 404)
    price, days = whole(request.data.get('price'), 1000, 50000000, 'a price of at least ₦1,000'), whole(request.data.get('delivery_days'), 1, 90, 'a delivery time between 1 and 90 days')
    q, fresh = Quote.objects.get_or_create(request=r, vendor=v, defaults={'design': r.design, 'price': price, 'delivery_days': days})
    q.price, q.delivery_days, q.note, q.includes_fabric = price, days, txt(request.data.get('note'), 400), bool(request.data.get('includes_fabric', True))
    q.status, q.valid_until, q.updated_at = 'offered', now() + timedelta(days=7), now(); q.save()
    notify(r.user, 'quote', f"{v.name} {'sent' if fresh else 'updated'} a quote", f'{money(price)}, {days} days for "{r.design.title}".', f'/studio?design={r.design_id}&step=4')
    return quote_out(q, False)


@route(['GET'], role='tailor')
def vendor_quotes(request):
    v = vendor_of(request.me)
    if v is None: return []
    return [{**quote_out(q, False), 'design': design_out(q.design, request.me, 'party'), 'request': request_out(q.request)} for q in Quote.objects.filter(vendor=v).select_related('design', 'design__user', 'request').order_by('-created_at')[:200]]


ORDERS = lambda: Order.objects.select_related('user', 'vendor', 'vendor__user', 'design', 'design__user', 'measurement')


@route(['GET'], role='tailor')
def vendor_orders(request):
    v = vendor_of(request.me)
    if v is None: return []
    return [order_out(o, request.me) for o in ORDERS().filter(vendor=v).exclude(status='awaiting_payment').order_by('-created_at')]


@route(['POST'], role='tailor')
def vendor_order_events(request, number):
    v, d = vendor_of(request.me), request.data
    o = ORDERS().select_for_update(of=('self',)).filter(number=number, vendor=v).first() if v else None
    if o is None: raise Fail('Order not found.', 404)
    if o.status != 'active': raise Fail('This order was cancelled.' if o.status == 'cancelled' else 'This order is already delivered.')
    phase = d.get('phase') or None
    if phase and phase not in PHASES: raise Fail('Unknown stage.')
    if phase and PHASES.index(phase) < PHASES.index(o.phase): raise Fail('An order cannot move backwards.')
    if not txt(d.get('title')): raise Fail('Give the update a title the customer will understand.')
    photos = [p for p in (d.get('photos') if isinstance(d.get('photos'), list) else []) if isinstance(p, str) and len(p) < 220000 and PHOTO.match(p)][:3]
    if phase: o.phase = phase
    event(o, d['title'], d.get('body'), 'vendor', photos=photos)
    if phase == 'delivered': mark_delivered(o)
    o.save()
    notify(o.user, 'order', f"{txt(d['title'], 90)}: order {o.number}", txt(d.get('body'), 160) or v.name, f'/orders?id={o.number}', f'order:{o.number}')
    return order_out(o, request.me)


# ───────── production requests, quotes, orders ─────────
@route(['POST'])
def design_requests(request, pk):
    u, d = request.me, own_design(request, pk)
    m = Measurement.objects.filter(id=request.data.get('measurement_id') if str(request.data.get('measurement_id', '')).isdigit() else 0, user=u).first()
    if m is None: raise Fail('Choose a measurement profile first.')
    req = d.requests.filter(status='open').first()
    if req and req.version_n == d.current and req.measurement_id == m.id: return request_out(req)
    if req:
        req.status = 'closed'; req.save(); req.quotes.filter(status='offered').update(status='withdrawn')
    deadline = None
    try:
        deadline = date.fromisoformat(str(request.data.get('deadline'))[:10]) if request.data.get('deadline') else None
    except ValueError:
        pass
    req = QuoteRequest.objects.create(design=d, version_n=d.current, user=u, measurement=m, notes=txt(request.data.get('notes'), 600), deadline=deadline)
    if d.status == 'draft': d.status = 'requested'; d.save()
    spec = current_version(d).spec
    for v in Vendor.objects.filter(sample=False, status='verified').select_related('user'):
        if R.SPECIALTY.get(spec.get('garment')) in v.specialties or 'Production runs' in v.specialties: notify(v.user, 'request', 'New request for quotes', d.title, '/workshop')
    return Response(request_out(req), status=201)


@route(['GET'])
def design_request_latest(request, pk):
    d = own_design(request, pk, admin=True)
    r = d.requests.order_by('-created_at').first()
    return request_out(r) if r else Response(None)


@route(['GET'])
def design_quotes(request, pk):
    d = own_design(request, pk)
    req = d.requests.exclude(status='closed').select_related('design', 'user').order_by('-created_at').first()
    if req is None: return []
    if settings.SAMPLE_MODE and req.status == 'open': simulate_quotes(req)
    return [quote_out(q) for q in req.quotes.exclude(status='withdrawn').select_related('vendor').order_by('created_at')]


def my_order(request, number, lock=False):
    qs = ORDERS().select_for_update(of=('self',)) if lock else ORDERS()
    o = qs.filter(number=number, user=request.me).first()
    if o is None: raise Fail('Order not found.', 404)
    return o


def payment_out(p):
    return {'id': str(p.id), 'order_id': p.order.number if p.order_id else None, 'commission_id': str(p.commission_id) if p.commission_id else None, 'user_id': str(p.user_id), 'amount': p.amount, 'kind': p.kind,
            'method': p.method, 'reference': p.reference, 'status': p.status, 'last4': p.last4 or None, 'created_at': iso(p.created_at)}


@route(['GET', 'POST'])
def orders(request):
    u = request.me
    if request.method == 'GET':
        simulate(u)
        return [order_out(o, u) for o in ORDERS().filter(user=u).order_by('-created_at')]
    q = Quote.objects.select_related('request', 'design', 'vendor').filter(id=request.data.get('quote_id') if str(request.data.get('quote_id', '')).isdigit() else 0, status='offered').first()
    if q is None: raise Fail('That quote is no longer available.', 404)
    if q.request.user_id != u.id: raise Fail('That quote is not yours.', 403)
    if q.valid_until and q.valid_until < now(): raise Fail('That quote has expired. Ask for quotes again.')
    plan = 'deposit' if request.data.get('plan') == 'deposit' else 'full'
    o = Order.objects.filter(quote=q, status='awaiting_payment').first()
    if o:
        o.plan = plan; o.save()
        return order_out(ORDERS().get(id=o.id), u)
    import secrets
    number = next(n for n in (f'FT-{secrets.randbelow(900000) + 100000}' for _ in range(50)) if not Order.objects.filter(number=n).exists())
    o = Order(number=number, user=u, vendor=q.vendor, design=q.design, version_n=q.request.version_n, quote=q, request=q.request, measurement=q.request.measurement, total=q.price, plan=plan, delivery_days=q.delivery_days)
    event(o, 'Design approved', f'Version {q.request.version_n} of "{q.design.title}" approved. {q.vendor.name} quoted {money(q.price)}.')
    o.save()
    return Response(order_out(ORDERS().get(id=o.id), u), status=201)


@route(['GET'])
def order(request, number):
    u = request.me
    o = ORDERS().filter(number=number).first()
    if o is None: raise Fail('Order not found.', 404)
    if not (o.user_id == u.id or u.role == 'admin' or o.vendor.user_id == u.id): raise Fail('That order is not yours.', 403)
    if settings.SAMPLE_MODE: simulate_order(o)
    return order_out(o, u)


def due_on(o, kind):
    if o.status not in ('awaiting_payment', 'balance_due'): raise Fail('Nothing is due on this order.')
    kind = 'balance' if o.status == 'balance_due' else 'deposit' if (kind == 'deposit' or (not kind and o.plan == 'deposit')) else 'full'
    amount = o.total if kind == 'full' else int(round(o.total * settings.DEPOSIT_PERCENT / 100)) if kind == 'deposit' else o.total - o.paid
    if amount <= 0: raise Fail('Nothing is due on this order.')
    return kind, amount


@route(['POST'])
def order_pay_init(request, number):
    o = my_order(request, number)
    kind, amount = due_on(o, request.data.get('kind'))
    return init_payment(request.me, amount, kind, order=o)


@route(['POST'])
def order_pay(request, number):
    return pay_order(request.me, my_order(request, number, lock=True), request.data)


def complete_payment(reference):
    """Paystack's webhook: finish a payment we started but never heard the end of (the customer closed the tab)."""
    p = Payment.objects.filter(reference=reference, status='pending').select_related('user').first()
    if p is None: return False
    data = {'method': 'paystack', 'reference': reference, 'kind': p.kind}
    if p.order_id: pay_order(p.user, ORDERS().select_for_update(of=('self',)).get(id=p.order_id), data)
    elif p.commission_id: pay_commission(p.user, Commission.objects.select_for_update().get(id=p.commission_id), data)
    return True


def pay_order(u, o, data):
    kind, amount = due_on(o, data.get('kind'))
    before = o.status
    p = charge(u, amount, kind, data, order=o)
    o.paid += amount
    if before == 'awaiting_payment':
        o.plan, o.status, o.paid_at, o.phase, o.eta = 'deposit' if kind == 'deposit' else 'full', 'active', now(), 'vendor_assigned', now() + timedelta(days=o.delivery_days)
        event(o, f'{o.vendor.name} accepted the order', f"{money(amount)} {'deposit ' if kind == 'deposit' else ''}received and held by Fashion Teller until delivery.")
        if o.quote_id: Quote.objects.filter(id=o.quote_id).update(status='accepted')
        if o.request_id:
            Quote.objects.filter(request_id=o.request_id, status='offered').exclude(id=o.quote_id).update(status='declined'); QuoteRequest.objects.filter(id=o.request_id).update(status='ordered')
        if o.design_id: Design.objects.filter(id=o.design_id).update(status='ordered')
        notify(o.vendor.user, 'order', f'New order {o.number}', f'{u.name} paid {money(amount)} for "{o.design.title if o.design else "a design"}".', '/workshop')
    else:
        o.status = 'delivered'
        event(o, 'Balance paid', f'{money(amount)} received. Confirm you have the garment to release payment to {o.vendor.name}.')
    o.save()
    audit('pay', p.reference, u)
    return {'payment': payment_out(p), 'order': order_out(ORDERS().get(id=o.id), u), 'reward': play(u, 'order') if kind != 'balance' else None}


@route(['POST'])
def order_cancel(request, number):
    u, o = request.me, my_order(request, number, lock=True)
    if o.status not in ('awaiting_payment', 'active') or o.phase in ('tailoring', 'delivered'): raise Fail('This order has started production and cannot be cancelled here. Report a problem instead.')
    event(o, 'Order cancelled', f'{money(o.paid)} will be refunded to the original payment method.' if o.paid else 'No payment was taken.', 'customer')
    if o.paid:
        o.payments.filter(status='paid').update(status='refunded'); o.paid = 0
        notify(o.vendor.user, 'order', f'Order {o.number} was cancelled', 'The customer cancelled before production started.', '/workshop')
    o.status = 'cancelled'; o.save()
    Design.objects.filter(id=o.design_id, status='ordered').update(status='requested'); QuoteRequest.objects.filter(id=o.request_id, status='ordered').update(status='closed')
    return order_out(o, u)


@route(['POST'])
def order_confirm(request, number):
    u, o = request.me, my_order(request, number, lock=True)
    if o.status == 'balance_due': raise Fail('Pay the balance first, then confirm delivery.')
    if o.status != 'delivered': raise Fail('This order has not been delivered yet.')
    if (o.issue or {}).get('status') == 'open': raise Fail('A problem is open on this order. We will be in touch before anything is released.')
    o.status, o.received_at = 'completed', now()
    event(o, 'Received by the customer', f'Payment released to {o.vendor.name}.', 'customer')
    o.save(); o.payments.filter(status='paid').update(status='released')
    Vendor.objects.filter(id=o.vendor_id).update(orders_done=o.vendor.orders_done + 1)
    po = extras.payout(o.vendor.user, 'order', f'Order {o.number}', o.paid, order=o)
    notify(o.vendor.user, 'order', f'Order {o.number} confirmed', f'{first(u)} has the garment. {money(po.net if po else o.paid)} released to you' + (f', after the {settings.PLATFORM_FEE_PERCENT:g}% platform fee.' if po and po.fee else '.'), '/workshop')
    return order_out(ORDERS().get(id=o.id), u)


@route(['POST'])
def order_problem(request, number):
    u, o = request.me, my_order(request, number, lock=True)
    if o.status not in ('active', 'balance_due', 'delivered'): raise Fail('This order is complete. Contact support for help with it.' if o.status == 'completed' else 'There is nothing to report on this order yet.')
    if (o.issue or {}).get('status') == 'open': raise Fail('You have already reported a problem on this order. We are looking into it.', 409)
    reason, body = txt(request.data.get('reason'), 60), txt(request.data.get('body'), 1000)
    if not reason: raise Fail('Choose what went wrong.')
    if len(body) < 10: raise Fail('Tell us what happened in a sentence or two.')
    o.issue = {'reason': reason, 'body': body, 'status': 'open', 'at': iso(now()), 'resolved_at': None, 'resolution': None}
    event(o, 'Problem reported', f'{reason}. Payment stays on hold while Fashion Teller looks into it.', 'customer'); o.save()
    Report.objects.create(kind='order', ref_id=o.number, reason=reason, note=body, by=u)
    notify(o.vendor.user, 'order', f'Problem reported on {o.number}', reason, '/workshop'); audit('issue', o.number, u)
    return order_out(o, u)


@route(['POST'], auth=False, throttle='auth')
def contact(request):
    d = request.data
    if not txt(d.get('message'), 4000): raise Fail('Write your message first.')
    ContactMessage.objects.create(name=txt(d.get('name'), 80), email=email_of(d.get('email')), topic=txt(d.get('topic'), 60), message=txt(d['message'], 4000))
    return Response({'ok': True}, status=201)


# ───────── admin ─────────
@route(['GET'], role='admin')
def admin_stats(request):
    held = Payment.objects.filter(status='paid').aggregate(s=Sum('amount'))['s'] or 0
    gmv = Payment.objects.filter(status__in=['paid', 'released']).aggregate(s=Sum('amount'))['s'] or 0
    week, real = now() - timedelta(days=7), User.objects.filter(sample=False)
    live = Order.objects.exclude(status__in=['cancelled', 'awaiting_payment'])
    return {'users': real.count(), 'customers': real.filter(role='customer').count(), 'tailors': Vendor.objects.filter(status='verified').count(), 'pending_tailors': Vendor.objects.filter(status='pending').count(),
            'designers': Designer.objects.count(), 'designs': Design.objects.count(), 'published': Design.objects.filter(published=True).count(), 'versions': Version.objects.count(), 'orders': Order.objects.count(),
            'active_orders': Order.objects.filter(status__in=['active', 'balance_due', 'delivered']).count(), 'delivered': Order.objects.filter(status__in=['delivered', 'completed']).count(),
            'awaiting_payment': Order.objects.filter(status='awaiting_payment').count(), 'commissions': Commission.objects.count(), 'active_commissions': Commission.objects.filter(status__in=['active', 'delivered', 'changes']).count(),
            'gmv': gmv, 'held': held, 'fees': Payout.objects.aggregate(s=Sum('fee'))['s'] or 0, 'payouts_due': Payout.objects.filter(status__in=['pending', 'failed', 'reversed']).count(), 'new_users7d': real.filter(created_at__gt=week).count(), 'orders7d': Order.objects.filter(created_at__gt=week).count(), 'messages': ContactMessage.objects.filter(status='new').count(),
            'reports': Report.objects.filter(status='open').count(), 'by_phase': [[p, live.filter(phase=p).count()] for p in PHASES]}


@route(['GET'], role='admin')
def admin_users(request):
    return [{**pub(u), 'designs': u.designs.count(), 'orders': u.orders.count(), 'spent': Payment.objects.filter(user=u, status__in=['paid', 'released']).aggregate(s=Sum('amount'))['s'] or 0} for u in User.objects.filter(sample=False).order_by('id')]


@route(['GET'], role='admin')
def admin_vendors(request):
    out = []
    for v in Vendor.objects.select_related('user').order_by('id'):
        a = Application.objects.filter(vendor=v).first()
        out.append({**vendor_pub(v), 'user': pub(v.user), 'quotes': Quote.objects.filter(vendor=v).count(), 'orders': v.orders.count(),
                    'application': {'workshop': a.workshop, 'name': a.name, 'email': a.email, 'phone': a.phone, 'city': a.city, 'country': a.country, 'specialties': a.specialties, 'about': a.about, 'status': a.status, 'created_at': iso(a.created_at)} if a else None})
    return out


@route(['POST'], role='admin')
def admin_vendor_status(request, pk):
    v, status = get(Vendor, 'Tailor not found.', id=pk if str(pk).isdigit() else 0), request.data.get('status')
    if status not in ('verified', 'rejected', 'suspended', 'pending'): raise Fail('Unknown status.')
    v.status, v.verified_at = status, now() if status == 'verified' else v.verified_at; v.save()
    Application.objects.filter(vendor=v).update(status='approved' if status == 'verified' else status)
    notify(v.user, 'workshop', 'Your workshop is verified' if status == 'verified' else f'Workshop status: {status}', 'You can now quote on requests.' if status == 'verified' else 'Open your workshop page for details.', '/workshop')
    audit(f'vendor:{status}', v.name, request.me)
    return vendor_pub(v)


@route(['POST'], role='admin')
def admin_user_status(request, pk):
    u = get(User, 'User not found.', id=pk if str(pk).isdigit() else 0)
    if u.role == 'admin': raise Fail('Admin accounts cannot be suspended here.')
    u.status = 'suspended' if request.data.get('status') == 'suspended' else 'active'; u.save()
    audit(f'user:{u.status}', u.name, request.me)
    return pub(u)


@route(['GET'], role='admin')
def admin_designs(request):
    return [{**design_out(d, request.me), 'quotes': Quote.objects.filter(design=d).exclude(status='withdrawn').count()} for d in DESIGNS().order_by('-updated_at')[:200]]


@route(['GET'], role='admin')
def admin_orders(request):
    simulate(request.me)
    return [order_out(o, request.me) for o in ORDERS().order_by('-created_at')[:500]]


@route(['POST'], role='admin')
def admin_order_phase(request, number):
    o, phase, note = get(Order, 'Order not found.', number=number), request.data.get('phase'), txt(request.data.get('note'), 300)
    o = ORDERS().get(id=o.id)
    if o.status in ('cancelled', 'completed'): raise Fail('This order is closed.')
    if phase == 'cancelled':
        event(o, 'Cancelled by Fashion Teller', note, 'admin'); o.status = 'cancelled'
        if o.paid: o.payments.filter(status='paid').update(status='refunded'); o.paid = 0
    else:
        if phase not in PHASES: raise Fail('Unknown stage.')
        if o.status == 'awaiting_payment': raise Fail('This order has not been paid.')
        if PHASES.index(phase) < PHASES.index(o.phase): raise Fail('An order cannot move backwards.')
        o.phase = phase
        event(o, note or f"Moved to {phase.replace('_', ' ')}", '', 'admin')
        if phase == 'delivered': mark_delivered(o)
    o.save()
    notify(o.user, 'order', f'Order {o.number} updated', 'Cancelled by Fashion Teller.' if phase == 'cancelled' else f"Now: {phase.replace('_', ' ')}.", f'/orders?id={o.number}')
    audit(f'order:{phase}', o.number, request.me)
    return order_out(o, request.me)


@route(['POST'], role='admin')
def admin_order_issue(request, number):
    o = ORDERS().filter(number=number).first()
    if o is None or (o.issue or {}).get('status') != 'open': raise Fail('No open problem on this order.', 404)
    action, note = request.data.get('action'), txt(request.data.get('note'), 300)
    if action not in ('refund', 'release'): raise Fail('Choose refund or release.')
    o.issue = {**o.issue, 'status': 'resolved', 'resolved_at': iso(now()), 'resolution': action}
    if action == 'refund':
        o.payments.filter(status='paid').update(status='refunded')
        event(o, 'Refunded', f'{money(o.paid)} refunded by Fashion Teller. {note}'.strip(), 'admin'); o.paid, o.status = 0, 'cancelled'
    else:
        event(o, 'Problem closed', note or 'Reviewed by Fashion Teller.', 'admin')
    o.save()
    Report.objects.filter(kind='order', ref_id=o.number, status='open').update(status='resolved', resolved_at=now(), resolution=action)
    notify(o.user, 'order', f'Your report on {o.number} was reviewed', 'You have been refunded.' if action == 'refund' else 'The order continues.', f'/orders?id={o.number}')
    notify(o.vendor.user, 'order', f'Report on {o.number} closed', 'The customer was refunded.' if action == 'refund' else 'No action against the order.', '/workshop')
    audit(f'issue:{action}', o.number, request.me)
    return order_out(o, request.me)


@route(['GET'], role='admin')
def admin_payments(request):
    out = []
    for p in Payment.objects.exclude(status='pending').select_related('user', 'order', 'order__vendor', 'commission', 'commission__designer').order_by('-created_at')[:500]:
        out.append({**payment_out(p), 'customer': pub(p.user), 'vendor': vendor_pub(p.order.vendor) if p.order_id else None, 'designer_id': str(p.commission.designer_id) if p.commission_id else None, 'designer': person(p.commission.designer) if p.commission_id else None})
    return out


@route(['POST'], role='admin')
def admin_refund(request, pk):
    p = get(Payment, 'Payment not found.', id=pk if str(pk).isdigit() else 0)
    if p.status != 'paid': raise Fail('Only a payment still held by Fashion Teller can be refunded.')
    p.status = 'refunded'; p.save()
    href = '/orders'
    if p.order_id:
        o = p.order
        o.paid = max(0, o.paid - p.amount); event(o, 'Refund issued', f'{money(p.amount)} refunded by Fashion Teller.', 'admin')
        if o.paid == 0 and o.status in ('active', 'delivered', 'balance_due'): o.status = 'cancelled'
        o.save(); href = f'/orders?id={o.number}'
    if p.commission_id:
        c = p.commission
        c.paid, c.status, c.updated_at = 0, 'cancelled', now(); c.save(); say(c.thread, None, f'Fashion Teller refunded {money(p.amount)} and closed this commission.'); href = f'/commissions?id={c.id}'
    notify(p.user, 'payment', 'Refund issued', f'{money(p.amount)} is on its way back to you.', href); audit('refund', p.reference, request.me)
    return payment_out(p)


@route(['GET'], role='admin')
def admin_commissions(request):
    return [commission_out(c, request.me) for c in Commission.objects.select_related('client', 'designer', 'thread', 'ref_design', 'result_design').order_by('-updated_at')[:300]]


@route(['GET'], role='admin')
def admin_reports(request):
    out = []
    for r in Report.objects.select_related('by').order_by('-created_at')[:300]:
        d = DESIGNS().filter(id=r.ref_id).first() if r.kind == 'design' and r.ref_id.isdigit() else None
        t = User.objects.filter(id=r.ref_id).first() if r.kind == 'user' and r.ref_id.isdigit() else None
        out.append({'id': str(r.id), 'kind': r.kind, 'ref_id': r.ref_id, 'reason': r.reason, 'note': r.note, 'by_id': str(r.by_id), 'status': r.status, 'created_at': iso(r.created_at), 'resolved_at': iso(r.resolved_at),
                    'resolution': r.resolution or None, 'by': person(r.by), 'design': mini(d), 'target': person(t) if t else None})
    return out


@route(['POST'], role='admin')
def admin_report_resolve(request, pk):
    r, action = get(Report, 'Report not found.', id=pk if str(pk).isdigit() else 0), request.data.get('action')
    if r.status != 'open': raise Fail('This report is already closed.')
    if action not in ('dismiss', 'remove'): raise Fail('Choose dismiss or remove.')
    if r.kind == 'order': raise Fail('Order problems are resolved from the order itself.')
    if action == 'remove' and r.kind == 'design' and r.ref_id.isdigit():
        d = Design.objects.filter(id=r.ref_id).select_related('user').first()
        if d:
            d.published = False; d.save()
            notify(d.user, 'moderation', 'A design was taken off Discover', f'"{d.title}" was reported and removed from the public feed. It is still in your library.', f'/design?id={d.id}')
    if action == 'remove' and r.kind == 'user' and r.ref_id.isdigit():
        User.objects.filter(id=r.ref_id).exclude(role='admin').update(status='suspended')
    r.status, r.resolved_at, r.resolution = 'resolved', now(), action; r.save()
    audit(f'report:{action}', r.ref_id, request.me)
    return {'id': str(r.id), 'status': r.status, 'resolution': r.resolution}


@route(['GET'], role='admin')
def admin_messages(request):
    return [{'id': str(m.id), 'name': m.name, 'email': m.email, 'topic': m.topic, 'message': m.message, 'status': m.status, 'created_at': iso(m.created_at)} for m in ContactMessage.objects.order_by('-created_at')[:200]]


@route(['GET'], role='admin')
def admin_applications(request):
    return [{'id': str(a.id), 'vendor_id': str(a.vendor_id), 'workshop': a.workshop, 'name': a.name, 'email': a.email, 'phone': a.phone, 'city': a.city, 'country': a.country, 'specialties': a.specialties, 'about': a.about, 'status': a.status,
             'created_at': iso(a.created_at)} for a in Application.objects.order_by('-created_at')[:200]]


@route(['GET'], role='admin')
def admin_audit(request):
    return [{'at': iso(a.at), 'by': a.by, 'action': a.action, 'target': a.target} for a in Audit.objects.all()[:100]]
