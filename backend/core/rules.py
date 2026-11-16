"""
The design rules the API enforces, ported from the site's engine (assets/js/engine.js and catalog.js):
  normalize  whitelist every field of a design spec; nothing a client sends is stored or priced unchecked
  price      a tailor's suggested price and delivery time, in naira
  CHECKS     the daily challenges
  LEVELS, BADGES and the streak maths

The vocabulary comes from core/data/catalog.json, exported from the engine by backend/tools/export_catalog.js.
core/tests.py checks this port against the engine's own answers (core/data/vectors.json), so the two cannot drift.
"""
import json, math, re
from datetime import date
from pathlib import Path

C = json.loads((Path(__file__).parent / 'data' / 'catalog.json').read_text())
GARMENTS, FABRICS, COLORS, ACCENTS = C['garments'], C['fabrics'], C['colors'], C['accents']
TEMPLATES = {t['id']: t for t in C['templates']}
CHALLENGES = C['challenges']
W, H = 720, 1150
HEX = re.compile(r'^#[0-9a-f]{6}$', re.I)
SLUG40, SLUG30 = re.compile(r'^[a-z0-9-]{1,40}$'), re.compile(r'^[a-z0-9-]{1,30}$')
EMB_COST = {'none': 0, 'neck': 6000, 'chest': 14000, 'chest-hem': 24000, 'full': 36000}
SPECIALTY = {'kaftan': 'Kaftans', 'agbada': 'Agbada', 'boubou': 'Dresses', 'dress': 'Dresses', 'suit': 'Suits', 'shirt': 'Shirts'}

jsround = lambda x: math.floor(x + 0.5)                      # JavaScript's Math.round
clamp = lambda n, lo, hi: max(lo, min(hi, n))


def num(v, default=0):
    """JavaScript's Number(v) || default, for the values JSON can carry."""
    if isinstance(v, bool):
        n = 1.0 if v else 0.0
    elif isinstance(v, (int, float)):
        n = float(v)
    elif isinstance(v, str):
        try:
            n = float(v.strip() or 0)
        except ValueError:
            return default
    elif v is None or v == []:
        n = 0.0
    else:
        return default
    return default if (n == 0 or n != n) else n


def truthy(v):
    return not (v is None or v is False or v == '' or (isinstance(v, (int, float)) and not isinstance(v, bool) and (v == 0 or v != v)))


def clean_color(c, fallback, table=COLORS):
    if not isinstance(c, str):
        return fallback
    c = c.strip().lower()
    return c if (HEX.match(c) or c in table or c in COLORS) else fallback


def color_hex(c, table=COLORS):
    return c if isinstance(c, str) and HEX.match(c) else table.get(c) or COLORS.get(c) or '#101B3F'


def blank(garment='kaftan'):
    g = garment if isinstance(garment, str) and garment in GARMENTS else 'kaftan'
    G = GARMENTS[g]
    return {'garment': g, 'fabric': G['fabric'], 'color': G['color'], 'accent': 'gold', 'length': G['length'], 'sleeves': G['sleeves'], 'collar': G['collar'], 'fit': G['fit'],
            'embroidery': G['emb'], 'density': 2, 'buttons': g in ('shirt', 'suit'), 'pockets': g == 'suit', 'puff': False, 'belt': False,
            'pattern': 'ankara' if G['fabric'] == 'ankara' else 'stripe' if G['fabric'] == 'aso-oke' else 'plain', 'notes': [], 'sketch': [], 'sketchClip': True, 'customColor': False, 'template': None, 'palette': None}


def clean_sketch(sk):
    out = []
    for k in (sk if isinstance(sk, list) else [])[:300]:
        if not isinstance(k, dict) or not isinstance(k.get('p'), list):
            continue
        p = [int(clamp(jsround(num(v)), -60, (H if i % 2 else W) + 60)) for i, v in enumerate(k['p'][:800])]
        if len(p) % 2:
            p.pop()
        if len(p) < 2:
            continue
        out.append({'c': color_hex(clean_color(k.get('c'), '#d4af37', ACCENTS), ACCENTS), 'w': int(clamp(jsround(num(k.get('w'), 8)), 1, 40)), 'm': truthy(k.get('m')), 'p': p})
    return out


def normalize(raw):
    """A spec with every field checked. Unknown values fall back to the style's defaults; unknown fields are dropped."""
    s = raw if isinstance(raw, dict) else {}
    out = blank(s.get('garment'))
    g = out['garment']
    if isinstance(s.get('fabric'), str) and s['fabric'] in FABRICS: out['fabric'] = s['fabric']
    if s.get('length') in C['lengths']: out['length'] = s['length']
    if s.get('sleeves') in C['sleeves']: out['sleeves'] = s['sleeves']
    if s.get('fit') in C['fits']: out['fit'] = s['fit']
    if isinstance(s.get('embroidery'), str) and s['embroidery'] in C['embroidery']: out['embroidery'] = s['embroidery']
    out['pattern'] = s['pattern'] if isinstance(s.get('pattern'), str) and s['pattern'] in C['patterns'] else 'plain'
    if isinstance(s.get('collar'), str) and s['collar'] in C['collarFor'][g]: out['collar'] = s['collar']
    out['color'] = clean_color(s.get('color'), out['color'])
    out['accent'] = clean_color(s.get('accent'), 'gold', ACCENTS)
    out['density'] = int(clamp(jsround(num(s.get('density'), 2)), 1, 3))
    for k in ('buttons', 'pockets', 'puff', 'belt', 'customColor'):
        out[k] = truthy(s.get(k))
    if g in ('shirt', 'suit'): out['buttons'] = True
    out['sketchClip'] = s.get('sketchClip') is not False
    out['notes'] = [n.strip()[:160] for n in [n for n in (s.get('notes') if isinstance(s.get('notes'), list) else []) if isinstance(n, str) and n.strip()][:12]]
    out['sketch'] = clean_sketch(s.get('sketch'))
    out['template'] = s['template'] if isinstance(s.get('template'), str) and SLUG40.match(s['template']) else None
    out['palette'] = s['palette'] if isinstance(s.get('palette'), str) and SLUG30.match(s['palette']) else None
    return out


def price(spec, price_factor=1.0, speed_factor=1.0, lead_min=5):
    s = normalize(spec)
    g = s['garment']
    base = jsround(GARMENTS[g]['base'] * FABRICS[s['fabric']]['x'])
    emb = jsround(EMB_COST[s['embroidery']] * (0.7 + s['density'] * 0.3))
    has = lambda k: k in C['detailsFor'][g] and s[k]
    extras = (min(15000, 3000 + len(s['sketch']) * 400) if s['sketch'] else 0) + (2500 if has('pockets') else 0) + (3000 if has('belt') else 0) + (2000 if s['puff'] else 0) + (4000 if s['length'] == 'full' else 0)
    labour = jsround(base * 0.12)
    total = jsround(((base + emb + extras + labour) * (price_factor or 1)) / 500) * 500
    complexity = 1 + (0 if s['embroidery'] == 'none' else s['density'] * 0.6) + (1.5 if g in ('agbada', 'suit') else 0) + (0.6 if s['sketch'] else 0)
    days = max(3, jsround((lead_min or 5) + complexity * (speed_factor or 1)))
    return {'price': int(total), 'delivery_days': int(days), 'breakdown': {'fabric': int(base), 'embroidery': int(emb), 'extras': int(extras), 'labour': int(labour), 'factor': price_factor or 1}}


def color_name(c):
    """The nearest named colour to a hex value, as the site shows it."""
    if not isinstance(c, str) or not HEX.match(c):
        return c if c in COLORS or c in ACCENTS else 'midnight'
    n = int(c[1:], 16)
    r, g, b = n >> 16, (n >> 8) & 255, n & 255
    best, far = 'midnight', 1e12
    for k, v in COLORS.items():
        if k == 'gray':
            continue
        m = int(v[1:], 16)
        d = (r - (m >> 16)) ** 2 * 2 + (g - ((m >> 8) & 255)) ** 2 * 4 + (b - (m & 255)) ** 2 * 3
        if d < far:
            far, best = d, k
    return best


def title(spec):
    s = normalize(spec)
    name = color_name(s['color'])
    t = f"{name.capitalize()} {FABRICS[s['fabric']]['label']} {GARMENTS[s['garment']]['label'].lower()}"
    return t + (f" with {color_name(s['accent'])} embroidery" if s['embroidery'] != 'none' else '')


LABELS = {'garment': 'Style', 'fabric': 'Fabric', 'color': 'Colour', 'accent': 'Accent', 'length': 'Length', 'sleeves': 'Sleeves', 'collar': 'Collar', 'fit': 'Fit', 'embroidery': 'Embroidery', 'density': 'Embroidery weight', 'pattern': 'Pattern'}


def diff(a, b):
    """A readable change list between two specs, for the version history ("Collar → mandarin")."""
    a, b, out = normalize(a), normalize(b), []
    for k, label in LABELS.items():
        if a[k] != b[k]:
            out.append(f"{label} → {['', 'light', 'medium', 'heavy'][b[k]] if k == 'density' else color_name(b[k]) if k in ('color', 'accent') else str(b[k]).replace('-', ' ')}")
    for k in ('puff', 'pockets', 'buttons', 'belt'):
        if a[k] != b[k]:
            out.append(f"{'Puff sleeves' if k == 'puff' else k.capitalize()} {'added' if b[k] else 'removed'}")
    sa, sb = len(a['sketch']), len(b['sketch'])
    if sb > sa: out.append(f"Sketch +{sb - sa} stroke{'' if sb - sa == 1 else 's'}")
    elif sb < sa: out.append(f'Sketch −{sa - sb}' if sb else 'Sketch cleared')
    elif a['sketch'] != b['sketch']: out.append('Sketch edited')
    if a['notes'] != b['notes']: out.append('Tailor note added' if len(b['notes']) > len(a['notes']) else 'Tailor notes changed')
    if a['sketchClip'] != b['sketchClip']: out.append('Sketch area changed')
    return out


def lum(h):
    n = int(h[1:], 16)
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255


light = lambda c: lum(color_hex(c)) > 0.75
CHECKS = {
    'owambe-agbada': lambda s: s['garment'] == 'agbada' and s['embroidery'] in ('chest', 'chest-hem', 'full'),
    'sketch-motif': lambda s: len(s['sketch']) >= 3,
    'puff-dress': lambda s: s['garment'] == 'dress' and s['puff'] and s['sleeves'] != 'sleeveless',
    'mandarin-kaftan': lambda s: s['garment'] == 'kaftan' and s['collar'] == 'mandarin',
    'all-white': lambda s: light(s['color']),
    'kente-anything': lambda s: s['pattern'] == 'kente',
    'shawl-suit': lambda s: s['garment'] == 'suit' and s['collar'] == 'shawl',
    'floor-gown': lambda s: s['garment'] == 'dress' and s['length'] == 'full',
    'custom-colour': lambda s: s['customColor'] is True,
    'adire-boubou': lambda s: s['garment'] == 'boubou' and s['pattern'] == 'adire',
    'pocket-shirt': lambda s: s['garment'] == 'shirt' and s['sleeves'] == 'short' and s['pockets'],
    'belted': lambda s: s['belt'] and 'belt' in C['detailsFor'][s['garment']],
    'mirror-sketch': lambda s: any(k['m'] for k in s['sketch']),
    'all-over': lambda s: s['embroidery'] == 'full' and s['density'] == 3,
}


def check_challenge(ch_id, spec):
    try:
        return bool(CHECKS[ch_id](normalize(spec)))
    except Exception:
        return False


def challenge_for(day: date):
    return CHALLENGES[(day.toordinal() - date(1970, 1, 1).toordinal()) % len(CHALLENGES)]


BADGES = [
    ('first_design', 'First design', 'Saved your first design'), ('sketcher', 'Sketch artist', 'Added your own hand sketch'),
    ('palette_explorer', 'Colour theory', 'Used 5 different palettes'), ('all_styles', 'Wardrobe', 'Designed all six styles'),
    ('iterator', 'Perfectionist', '10 versions of one design'), ('streak_3', 'On a roll', '3-day streak'), ('streak_7', 'Week of style', '7-day streak'),
    ('streak_30', 'Couture habit', '30-day streak'), ('challenger', 'Challenger', 'Completed 3 daily challenges'), ('published', 'Runway debut', 'Published a design'),
    ('collab', 'Collaborator', 'Completed a commission'), ('made_real', 'Made for real', 'Ordered a design from a tailor'),
]
LEVELS = [(0, 'Apprentice'), (150, 'Pattern cutter'), (400, 'Stylist'), (800, 'Tailor'), (1400, 'Master tailor'), (2200, 'Designer'), (3500, 'Couturier')]


def level_of(xp):
    i = 0
    while i + 1 < len(LEVELS) and xp >= LEVELS[i + 1][0]:
        i += 1
    return {'level': i + 1, 'title': LEVELS[i][1], 'from': LEVELS[i][0], 'to': LEVELS[i + 1][0] if i + 1 < len(LEVELS) else None}


def luhn(n):
    s, alt = 0, False
    for ch in reversed(n):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9: d -= 9
        s += d
        alt = not alt
    return len(n) >= 12 and s % 10 == 0
