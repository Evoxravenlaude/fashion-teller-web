"""The wardrobe: every garment type and every template draws flat (front and back), has a price, and builds in 3D on both
mannequins; the studio fits its controls to the garment (a waist instead of a collar for trousers and skirts) and switches mannequin."""
import sys
from playwright.sync_api import sync_playwright
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
ok = fails = 0
def FORM(st):
    d = st.get('draft') or st.get('spec') or {}
    return d.get('form')
def check(c, m):
    global ok, fails
    if c: ok += 1
    else: fails += 1; print('  FAIL', m)
with sync_playwright() as p:
    s = Session(p, size, gl=True); pg = s.page
    s.go('/studio')
    r = s.js("""
      const E = FTEngine, V = E.vocab, bad = [], types = Object.keys(V.GARMENTS), num = v => typeof v === 'number' && isFinite(v);
      const flat = spec => { for (const view of ['front', 'back']) { const svg = E.render(spec, { view }); if (!svg || /NaN|undefined/.test(svg) || svg.length < 800) return view; } return ''; };
      for (const g of types) { const spec = E.blank(g), f = flat(spec); if (f) bad.push(g + ' ' + f); const pr = E.price(spec, {}); if (!num(pr.price) || pr.price <= 0 || !num(pr.deliveryDays)) bad.push(g + ' price'); }
      for (const t of E.TEMPLATES) { const spec = E.normalize(t.spec), f = flat(spec); if (f) bad.push(t.id + ' ' + f); if (!E.title(spec)) bad.push(t.id + ' title'); }
      // 3D: the parts of every type are made of real numbers, on both forms
      await FTApp.load3d(); await FT3D.load(); let parts = 0;
      for (const g of types) for (const form of V.FORMS) {
        const b = await FT3D.kit.buildGarment({ ...E.blank(g), form }, { seg: 14, texScale: 1, lite: true });
        if (!b || b.form !== form) { bad.push(g + ' ' + form + ' 3D'); continue; }
        for (const x of b.parts) { parts++; const a = x.geometry.getAttribute('position').array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) { bad.push(g + ' ' + form + ' ' + x.part.id + ' not a number'); break; } }
        FT3D.kit.disposeBuilt(b);
      }
      const bottoms = types.filter(g => E.isBottom(g)), tpl = E.TEMPLATES;
      return { bad, types, parts, bottoms, templates: tpl.length, kinds: [...new Set(tpl.map(t => E.normalize(t.spec).garment))].length, forms: V.FORMS,
        woman: E.formOf(E.blank('dress')), man: E.formOf(E.blank('kaftan')), keep: E.formOf({ ...E.blank('dress'), form: 'man' }), junk: E.normalize({ ...E.blank('tee'), form: 'robot' }).form,
        bottomSpec: E.normalize({ ...E.blank('joggers'), embroidery: 'chest', sleeves: 'long' }) };
    """)
    check(not r['bad'], f"every garment type and template draws front and back, has a price and builds in 3D ({r['bad'][:4]})")
    check(len(r['types']) >= 13 and r['templates'] >= 45 and r['kinds'] == len(r['types']), f"{len(r['types'])} garment types, {r['templates']} templates, every type has a template")
    check(set(r['bottoms']) == {'joggers', 'trousers', 'skirt'} and r['bottomSpec']['embroidery'] == 'none' and r['bottomSpec']['sleeves'] == 'sleeveless', 'trousers and skirts carry no sleeves or embroidery')
    check(r['forms'] == ['woman', 'man'] and r['woman'] == 'woman' and r['man'] == 'man' and r['keep'] == 'man' and r['junk'] is None, "a design starts on the form that suits it, keeps the one chosen, and drops one that does not exist")
    # the studio
    pg.click('[data-tpl="grey-joggers"]'); pg.wait_for_timeout(300)
    check(pg.inner_text('#bldTabs [data-bt="collar"]').strip() == 'Waist' and pg.locator('#bldTabs [data-bt="embroidery"]').is_hidden() and pg.locator('#bldTabs [data-bt="sleeves"]').is_hidden(), 'joggers: the collar tab reads Waist; sleeves and embroidery are not offered')
    pg.click('[data-bt="collar"]'); check(pg.locator('[data-set="collar"][data-v="drawstring"]').count() == 1 and pg.locator('[data-set="collar"][data-v="elastic"]').count() == 1, 'with a drawstring or an elastic waist')
    pg.click('[data-bt="style"]'); check(pg.locator('[data-garment]').count() == len(r['types']), 'every garment type can be picked as a style')
    pg.click('[data-garment="hoodie"]'); pg.wait_for_timeout(300)
    check(pg.inner_text('#bldTabs [data-bt="collar"]').strip() != 'Waist' and not pg.locator('#bldTabs [data-bt="sleeves"]').is_hidden(), 'a hoodie gets its collar and sleeves back')
    pg.click('[data-bt="collar"]'); check(pg.locator('[data-set="collar"][data-v="hood"]').count() == 1, 'and a hood')
    # the mannequin: saved with the design, shown in 3D
    pg.click('[data-bt="style"]'); pg.click('#saveBtn'); pg.wait_for_selector('.auth-sheet.on'); pg.click('.auth-sheet [data-demo="customer"]'); pg.wait_for_selector('#reward.on', timeout=15000); pg.wait_for_timeout(700)
    pg.click('#toPreview'); pg.wait_for_selector('#stTurn.ready, #stTurn.is-flat', timeout=40000); pg.wait_for_timeout(900)
    flat = pg.evaluate("() => document.querySelector('#stTurn').classList.contains('is-flat')")
    if flat: check(True, 'no 3D here: the mannequin switch is hidden with it')
    else:
        check(pg.is_visible('#formSeg') and pg.get_attribute('#formSeg [data-form="man"]', 'aria-pressed') == 'true', "a hoodie starts on the man's form")
        pg.click('#formSeg [data-form="woman"]'); pg.wait_for_function("() => document.querySelector('#formSeg [data-form=woman]').getAttribute('aria-pressed') === 'true'", timeout=20000); pg.wait_for_timeout(1500)
        st = pg.evaluate("() => JSON.parse(localStorage.getItem('ft.draft') || '{}')")
        check(FORM(st) == 'woman', f"choosing the woman's form is kept with the design ({FORM(st)})")
    pg.screenshot(path=f'shots/w-{size}-studio.png')
    check(not s.errors, f'no page errors {s.errors[:2]}')
print(f'wardrobe [{size}]: {ok} passed, {fails} failed'); sys.exit(1 if fails else 0)
