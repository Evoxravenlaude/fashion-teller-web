/**
 * Fashion Teller catalogue: the parts people design with, and the words and prices that go with a design.
 *
 *   FTEngine.TEMPLATES / template(id)      starting points, drawn to the real garment
 *   FTEngine.palettes(garment, fabric)     colour palettes made for each fabric and each style
 *   FTEngine.OPTIONS                       the choices on every builder tab
 *   FTEngine.CHALLENGES / challengeFor()   the rotating daily challenge
 *   FTEngine.title / summary / diff        how a design reads to people (and to the tailor)
 *   FTEngine.price / estimate              naira pricing from garment x fabric x work
 *   FTEngine.parse(text)                   optional "Describe it": a sentence sets the parts
 *
 * Loaded after engine.js. The backend keeps the same prices and challenge rules (backend/core/rules.py).
 */
(() => {
  const E = window.FTEngine, { GARMENTS, FABRICS, COLORS, ACCENTS, LENGTHS, SLEEVES, PATTERNS, COLLAR_LABEL, EMB_LABEL, COLLAR_FOR, DETAILS_FOR } = E.vocab;
  const isBottom = g => GARMENTS[g] && GARMENTS[g].kind === 'bottom';
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ───────── templates ───────── */
  const T = (id, name, tag, garment, o, blurb) => ({ id, name, tag, garment, blurb, spec: E.normalize({ ...E.blank(garment), ...(o.fabric && !o.pattern ? { pattern: 'plain' } : {}), ...o, template: id }) });
  E.TEMPLATES = [
    T('senator', 'Senator set', 'Everyday', 'kaftan', { fabric: 'cotton', color: '#1b2a4a', collar: 'mandarin', embroidery: 'neck', density: 1, length: 'knee', fit: 'regular', pockets: true }, 'Knee-length tunic with a band collar and matching trousers.'),
    T('royal-kaftan', 'Embroidered kaftan', 'Owambe', 'kaftan', { fabric: 'silk', color: 'midnight', accent: 'gold', embroidery: 'chest', density: 3, length: 'ankle', fit: 'regular' }, 'Ankle-length kaftan with a worked placket in gold thread.'),
    T('linen-kaftan', 'Linen kaftan', 'Weekend', 'kaftan', { fabric: 'linen', color: '#f6f6f2', accent: 'bronze', embroidery: 'neck', density: 1, sleeves: 'three-quarter', length: 'midi', collar: 'v', fit: 'relaxed' }, 'Loose, cool and easy, with a V neck.'),
    T('dashiki', 'Dashiki top', 'Casual', 'kaftan', { fabric: 'ankara', pattern: 'ankara', color: 'mustard', accent: 'crimson', collar: 'v', length: 'hip', sleeves: 'three-quarter', embroidery: 'chest', density: 2, fit: 'relaxed' }, 'Hip-length print top with an embroidered V.'),
    T('jalabiya', 'Jalabiya', 'Friday', 'kaftan', { fabric: 'cotton', color: 'white', accent: 'silver', collar: 'round', length: 'full', embroidery: 'chest', density: 1, buttons: true, fit: 'relaxed' }, 'Full-length, light and loose, with a buttoned placket.'),
    T('grand-agbada', 'Grand agbada', 'Owambe', 'agbada', { fabric: 'aso-oke', color: 'ivory', accent: 'gold', embroidery: 'chest-hem', density: 3, pattern: 'stripe' }, 'The full robe over a tunic and trousers, heavy with embroidery.'),
    T('wine-agbada', 'Wine agbada', 'Wedding', 'agbada', { fabric: 'brocade', color: 'wine', accent: 'champagne', embroidery: 'chest', density: 2, pattern: 'brocade' }, 'Brocade robe in wine with champagne thread.'),
    T('flow-boubou', 'Flowing boubou', 'Everyday', 'boubou', { fabric: 'ankara', color: 'royal blue', accent: 'gold', pattern: 'ankara', embroidery: 'neck', collar: 'v' }, 'Wide, floor-sweeping gown with a batwing sleeve.'),
    T('adire-boubou', 'Adire boubou', 'Heritage', 'boubou', { fabric: 'cotton', color: '#2f3e8f', accent: 'white', pattern: 'adire', embroidery: 'none', collar: 'round' }, 'Indigo tie-dye rings on soft cotton.'),
    T('ankara-flare', 'Ankara flare dress', 'Party', 'dress', { fabric: 'ankara', color: 'emerald', accent: 'gold', pattern: 'ankara', puff: true, sleeves: 'short', length: 'knee', fit: 'relaxed' }, 'Fitted bodice, puff sleeves, and a full skirt.'),
    T('evening-gown', 'Evening gown', 'Gala', 'dress', { fabric: 'velvet', color: 'burgundy', accent: 'gold', collar: 'sweetheart', sleeves: 'sleeveless', length: 'full', fit: 'fitted', embroidery: 'none' }, 'Floor-length mermaid cut with a sweetheart neckline.'),
    T('lace-bride', 'Lace bridal gown', 'Bridal', 'dress', { fabric: 'lace', color: 'ivory', accent: 'pearl', pattern: 'lace', collar: 'off-shoulder', sleeves: 'long', length: 'full', fit: 'fitted', embroidery: 'none' }, 'Off-the-shoulder lace to the floor.'),
    T('kente-midi', 'Kente midi dress', 'Heritage', 'dress', { fabric: 'cotton', color: '#d9a520', accent: 'emerald', pattern: 'kente', collar: 'square', sleeves: 'short', length: 'midi', belt: true, fit: 'regular' }, 'A-line midi in kente with a belt.'),
    T('shift-dress', 'Office shift dress', 'Office', 'dress', { fabric: 'wool', color: 'navy', accent: 'gold', collar: 'round', sleeves: 'three-quarter', length: 'knee', fit: 'fitted', embroidery: 'none' }, 'Clean knee-length shift with darts.'),
    T('sharp-suit', 'Two-piece suit', 'Office', 'suit', { fabric: 'wool', color: 'charcoal', accent: 'crimson', collar: 'notch' }, 'Notch lapel, two buttons, flap pockets, pressed trousers.'),
    T('shawl-tux', 'Shawl tuxedo', 'Gala', 'suit', { fabric: 'velvet', color: 'black', accent: 'black', collar: 'shawl', pockets: false }, 'Shawl lapel dinner suit.'),
    T('classic-shirt', 'Classic shirt', 'Office', 'shirt', { fabric: 'cotton', color: 'white', collar: 'classic', pockets: true }, 'Point collar, placket, barrel cuffs, shirt-tail hem.'),
    T('ankara-shirt', 'Ankara short-sleeve shirt', 'Weekend', 'shirt', { fabric: 'ankara', color: 'orange', accent: 'navy', pattern: 'ankara', sleeves: 'short', collar: 'classic', pockets: true, fit: 'relaxed' }, 'Relaxed print shirt for the weekend.'),
    T('band-shirt', 'Band-collar linen shirt', 'Weekend', 'shirt', { fabric: 'linen', color: 'sage', collar: 'mandarin', sleeves: 'long' }, 'Collarless linen shirt.'),
    /* street */
    T('classic-tee', 'Classic tee', 'Street', 'tee', { fabric: 'jersey', color: 'white' }, 'Crew neck, short sleeves, straight hem.'),
    T('motif-tee', 'Embroidered tee', 'Street', 'tee', { fabric: 'jersey', color: 'black', accent: 'gold', embroidery: 'chest', density: 1, fit: 'relaxed' }, 'Boxy black tee with a gold chest motif.'),
    T('ankara-polo', 'Ankara polo', 'Weekend', 'tee', { fabric: 'ankara', pattern: 'ankara', color: 'teal', accent: 'gold', collar: 'polo' }, 'Polo collar and three buttons in wax print.'),
    T('tank', 'Tank top', 'Gym', 'tee', { fabric: 'jersey', color: 'charcoal', sleeves: 'sleeveless', fit: 'fitted' }, 'Sleeveless and close to the body.'),
    T('grey-hoodie', 'Pullover hoodie', 'Street', 'hoodie', { fabric: 'jersey', color: 'grey' }, 'Hood, drawcords, pouch pocket, ribbed cuffs and hem.'),
    T('adire-hoodie', 'Adire hoodie', 'Street', 'hoodie', { fabric: 'jersey', color: '#2f3e8f', accent: 'white', pattern: 'adire' }, 'Indigo tie-dye rings on a heavyweight hoodie.'),
    T('crew-sweat', 'Crewneck sweatshirt', 'Street', 'hoodie', { fabric: 'jersey', color: 'forest', accent: 'ivory', collar: 'round', pockets: false, embroidery: 'chest', density: 1 }, 'No hood. Stitched chest motif.'),
    T('olive-bomber', 'Bomber jacket', 'Street', 'bomber', { fabric: 'nylon', color: 'olive', accent: 'orange' }, 'Zip front, ribbed collar, cuffs and hem, slant pockets.'),
    T('kente-bomber', 'Kente bomber', 'Street', 'bomber', { fabric: 'cotton', color: '#d9a520', accent: 'emerald', pattern: 'kente' }, 'The bomber cut in woven kente.'),
    T('denim-jacket', 'Denim jacket', 'Weekend', 'bomber', { fabric: 'denim', color: 'indigo', accent: 'bronze', collar: 'classic' }, 'Trucker jacket: shirt collar, button front, chest pockets.'),
    T('grey-joggers', 'Joggers', 'Street', 'joggers', { fabric: 'jersey', color: 'grey' }, 'Drawstring waist, tapered leg, ribbed cuffs.'),
    T('sweat-shorts', 'Jogger shorts', 'Gym', 'joggers', { fabric: 'jersey', color: 'black', length: 'knee' }, 'Above the knee, drawstring waist.'),
    T('chinos', 'Chinos', 'Everyday', 'trousers', { fabric: 'cotton', color: 'khaki' }, 'Flat front, straight leg, slant pockets.'),
    T('jeans', 'Straight jeans', 'Everyday', 'trousers', { fabric: 'denim', color: 'indigo' }, 'Five-pocket denim.'),
    T('wide-leg', 'Wide-leg trousers', 'Office', 'trousers', { fabric: 'linen', color: 'ivory', fit: 'relaxed', collar: 'pleated', length: 'full' }, 'Pleated front, full leg to the floor.'),
    T('ankara-shorts', 'Ankara shorts', 'Weekend', 'trousers', { fabric: 'ankara', pattern: 'ankara', color: 'orange', accent: 'navy', length: 'knee' }, 'Tailored shorts in wax print.'),
    T('pencil-skirt', 'Pencil skirt', 'Office', 'skirt', { fabric: 'wool', color: 'charcoal', fit: 'fitted', length: 'knee' }, 'Close through the hip, to the knee.'),
    /* around the world */
    T('iro-wrapper', 'Iro wrapper', 'West Africa', 'skirt', { fabric: 'aso-oke', pattern: 'stripe', color: 'wine', accent: 'gold', collar: 'tie', length: 'ankle' }, 'A wrapped and tied skirt in aso-oke.'),
    T('kurta', 'Kurta set', 'South Asia', 'kaftan', { fabric: 'cotton', color: 'cream', accent: 'gold', collar: 'mandarin', length: 'knee', buttons: true, embroidery: 'neck', density: 1 }, 'Knee-length tunic with a band collar, over slim trousers.'),
    T('sherwani', 'Sherwani', 'South Asia', 'kaftan', { fabric: 'brocade', pattern: 'brocade', color: 'ivory', accent: 'gold', collar: 'mandarin', length: 'midi', fit: 'fitted', buttons: true, embroidery: 'chest', density: 2 }, 'Long, close-cut wedding coat in brocade.'),
    T('thobe', 'Thobe', 'Gulf', 'kaftan', { fabric: 'cotton', color: 'white', accent: 'silver', collar: 'classic', length: 'full', buttons: true, pockets: true, embroidery: 'none' }, 'Full-length robe with a shirt collar.'),
    T('abaya', 'Abaya', 'Gulf', 'kaftan', { fabric: 'chiffon', color: 'black', accent: 'gold', collar: 'round', length: 'full', fit: 'relaxed', embroidery: 'full', density: 1 }, 'Flowing full-length robe, gold at the neck, cuffs and hem.'),
    T('qipao', 'Qipao', 'China', 'dress', { fabric: 'silk', color: 'crimson', accent: 'gold', collar: 'mandarin', sleeves: 'short', length: 'midi', fit: 'fitted', pattern: 'floral', embroidery: 'none' }, 'Band collar, diagonal front with knot buttons, side slit.'),
    T('silk-kimono', 'Silk kimono', 'Japan', 'kimono', { fabric: 'silk', color: 'crimson', accent: 'gold', pattern: 'floral' }, 'Wrap front, wide sleeves, obi sash.'),
    T('yukata', 'Indigo yukata', 'Japan', 'kimono', { fabric: 'cotton', color: '#2f3e8f', accent: 'white' }, 'The cotton summer kimono.'),
    T('haori', 'Haori jacket', 'Japan', 'kimono', { fabric: 'linen', color: 'charcoal', accent: 'silver', length: 'knee', belt: false }, 'Open, knee-length kimono jacket.'),
    T('kilt', 'Tartan kilt', 'Scotland', 'skirt', { fabric: 'wool', color: 'forest', accent: 'crimson', pattern: 'check', fit: 'relaxed', length: 'knee', belt: true }, 'Pleated wool tartan to the knee.'),
    T('sarong', 'Batik sarong', 'Southeast Asia', 'skirt', { fabric: 'cotton', color: 'teal', accent: 'gold', pattern: 'floral', collar: 'tie', length: 'ankle' }, 'Wrapped and tied at the hip.'),
    T('guayabera', 'Guayabera', 'Caribbean', 'shirt', { fabric: 'linen', color: 'white', sleeves: 'short', pockets: true, fit: 'relaxed' }, 'The linen shirt of Havana and Veracruz.'),
    T('aloha-shirt', 'Aloha shirt', 'Hawaii', 'shirt', { fabric: 'cotton', color: 'sky', accent: 'coral', pattern: 'floral', sleeves: 'short', fit: 'relaxed' }, 'Short sleeves, floral print.'),
  ];
  E.template = id => E.TEMPLATES.find(t => t.id === id);

  /* ───────── palettes: each fabric texture has its own, and each style adds one on top ───────── */
  const P = (id, name, base, accents) => ({ id, name, base, accents });
  const FABRIC_PALETTES = {
    silk: [P('jewel', 'Jewel Silk', ['#101B3F', '#1F6B4E', '#5E1A2A', '#2546A8', '#5A2A4F', '#E9D7A7'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#EDEAE0']), P('sunset', 'Sunset Silk', ['#E8705E', '#D97A1F', '#F3C1A3', '#B3261E', '#D9A520', '#F2C6CF'], ['#D4AF37', '#5E1A2A', '#FFFFFF', '#16181C'])],
    ankara: [P('lagos', 'Lagos Market', ['#D97A1F', '#2E7D4F', '#B3261E', '#2546A8', '#E8C547', '#5B2E91'], ['#E8C547', '#16181C', '#FFFFFF', '#1F6B4E']), P('calabar', 'Calabar Carnival', ['#C7308F', '#2AA8A8', '#E8C547', '#E8705E', '#9BC53D', '#1B2A4A'], ['#FFFFFF', '#D4AF37', '#16181C', '#E8C547'])],
    'aso-oke': [P('owambe', 'Royal Owambe', ['#F1EAD6', '#5E1A2A', '#1F6F78', '#D4AF37', '#6B1F3A', '#2546A8'], ['#D4AF37', '#C9CDD2', '#5E1A2A', '#E9D7A7']), P('ileya', 'Ileya Earth', ['#EDE3C8', '#9AAB8A', '#B98B5A', '#4A2C1A', '#E9D7A7', '#6B7B3A'], ['#B0803C', '#4A2C1A', '#D4AF37', '#F1EAD6'])],
    linen: [P('earth', 'Earth Linen', ['#F6F6F2', '#D6C39A', '#9AAB8A', '#C9A27A', '#7FB2E5', '#8A8F98'], ['#B0803C', '#1B2A4A', '#FFFFFF', '#6B4423'])],
    cotton: [P('everyday', 'Everyday Cotton', ['#F6F6F2', '#1B2A4A', '#7FB2E5', '#B3261E', '#2E7D4F', '#16181C'], ['#D4AF37', '#FFFFFF', '#16181C', '#B3261E']), P('indigo', 'Indigo Dye', ['#2F3E8F', '#1B2A4A', '#A9C8E8', '#5B6FB5', '#F6F6F2', '#101B3F'], ['#FFFFFF', '#E8C547', '#A9C8E8', '#16181C'])],
    wool: [P('tailoring', 'Tailoring Greys', ['#3A3E45', '#1B2A4A', '#16181C', '#6B4423', '#8A8F98', '#1E4D33'], ['#C9CDD2', '#D4AF37', '#5E1A2A', '#F6F6F2'])],
    lace: [P('bridal', 'Bridal Lace', ['#F6F6F2', '#F1EAD6', '#F2C6CF', '#E9D7A7', '#C4B2E6', '#A9C8E8'], ['#EDEAE0', '#D4AF37', '#C9CDD2', '#E9D7A7'])],
    velvet: [P('evening', 'Evening Velvet', ['#5E1A2A', '#1E4D33', '#101B3F', '#5B2E91', '#16181C', '#B0338A'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#16181C'])],
    brocade: [P('damask', 'Damask Court', ['#6B1F3A', '#1F6F78', '#D4AF37', '#101B3F', '#F1EAD6', '#4A2C1A'], ['#E9D7A7', '#D4AF37', '#C9CDD2', '#16181C'])],
    jersey: [P('street', 'Street Basics', ['#F6F6F2', '#8A8F98', '#16181C', '#1B2A4A', '#1E4D33', '#B3261E'], ['#F6F6F2', '#16181C', '#D4AF37', '#D97A1F']), P('washed', 'Washed Out', ['#C9A27A', '#9AAB8A', '#A9C8E8', '#F2C6CF', '#C4B2E6', '#EDE3C8'], ['#FFFFFF', '#16181C', '#B0803C', '#1B2A4A'])],
    denim: [P('denim', 'Denim Washes', ['#2F4A7A', '#1B2A4A', '#7FB2E5', '#16181C', '#A9C8E8', '#F6F6F2'], ['#B0803C', '#D4AF37', '#F6F6F2', '#B3261E'])],
    nylon: [P('flight', 'Flight Deck', ['#6B7B3A', '#16181C', '#1B2A4A', '#5E1A2A', '#C0C4C8', '#D97A1F'], ['#D97A1F', '#C9CDD2', '#16181C', '#F6F6F2'])],
    chiffon: [P('pastel', 'Soft Chiffon', ['#F2C6CF', '#A9C8E8', '#C4B2E6', '#9FD8C0', '#F3C1A3', '#F6F6F2'], ['#D4AF37', '#C9CDD2', '#FFFFFF', '#5A2A4F'])],
  };
  const GARMENT_PALETTES = {
    kaftan: P('senator', 'Senator Classics', ['#1B2A4A', '#3A3E45', '#F6F6F2', '#6B4423', '#1E4D33', '#101B3F'], ['#D4AF37', '#C9CDD2', '#F6F6F2', '#16181C']),
    agbada: P('grand', 'Grand Occasion', ['#F1EAD6', '#2546A8', '#5E1A2A', '#1F6B4E', '#D4AF37', '#16181C'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#16181C']),
    boubou: P('dakar', 'Dakar Breeze', ['#2546A8', '#2AA8A8', '#E8C547', '#F6F6F2', '#C7308F', '#D97A1F'], ['#D4AF37', '#FFFFFF', '#16181C', '#C9CDD2']),
    dress: P('party', 'Party Night', ['#1F6B4E', '#B0338A', '#16181C', '#E8705E', '#5B2E91', '#D4AF37'], ['#D4AF37', '#FFFFFF', '#16181C', '#C9CDD2']),
    suit: P('boardroom', 'Boardroom', ['#3A3E45', '#1B2A4A', '#16181C', '#8A8F98', '#4A2C1A', '#5E1A2A'], ['#C9CDD2', '#D4AF37', '#8E1F2B', '#16181C']),
    tee: P('tees', 'Tee Drawer', ['#F6F6F2', '#16181C', '#8A8F98', '#B3261E', '#2546A8', '#E8C547'], ['#16181C', '#FFFFFF', '#D4AF37', '#B3261E']),
    hoodie: P('campus', 'Campus', ['#8A8F98', '#16181C', '#1E4D33', '#5E1A2A', '#1B2A4A', '#EDE3C8'], ['#F6F6F2', '#16181C', '#D4AF37', '#D97A1F']),
    bomber: P('varsity', 'Varsity', ['#6B7B3A', '#16181C', '#1B2A4A', '#5E1A2A', '#D9A520', '#2F4A7A'], ['#D97A1F', '#F6F6F2', '#D4AF37', '#16181C']),
    kimono: P('kyoto', 'Kyoto Seasons', ['#8E1F2B', '#2F3E8F', '#16181C', '#F1EAD6', '#1F6B4E', '#F2C6CF'], ['#D4AF37', '#F6F6F2', '#8E1F2B', '#16181C']),
    joggers: P('track', 'Track Day', ['#3A3E45', '#8A8F98', '#16181C', '#1B2A4A', '#1E4D33', '#EDE3C8'], ['#F6F6F2', '#16181C', '#B3261E', '#D4AF37']),
    trousers: P('trouser', 'Trouser Rail', ['#1B2A4A', '#C9A27A', '#3A3E45', '#F1EAD6', '#2F4A7A', '#6B7B3A'], ['#6B4423', '#16181C', '#D4AF37', '#C9CDD2']),
    skirt: P('market', 'Market Day', ['#1F6B4E', '#6B1F3A', '#D9A520', '#2546A8', '#16181C', '#E8705E'], ['#D4AF37', '#FFFFFF', '#16181C', '#8E1F2B']),
    shirt: P('crisp', 'Crisp Shirts', ['#F6F6F2', '#A9C8E8', '#F2C6CF', '#1B2A4A', '#9AAB8A', '#16181C'], ['#16181C', '#FFFFFF', '#D4AF37', '#1B2A4A']),
  };
  E.palettes = (garment, fabric) => [...(FABRIC_PALETTES[fabric] || FABRIC_PALETTES.cotton), GARMENT_PALETTES[garment] || GARMENT_PALETTES.kaftan];

  /* ───────── option groups for each builder tab ───────── */
  E.OPTIONS = {
    collar: [['round', 'Round'], ['v', 'V-neck'], ['mandarin', 'Band collar'], ['classic', 'Shirt collar'], ['square', 'Square'], ['sweetheart', 'Sweetheart'], ['off-shoulder', 'Off-shoulder'], ['notch', 'Notch lapel'], ['shawl', 'Shawl lapel'], ['polo', 'Polo'], ['hood', 'Hood'], ['rib', 'Ribbed'], ['wrap', 'Wrap'], ['drawstring', 'Drawstring'], ['elastic', 'Elastic'], ['waistband', 'Flat front'], ['pleated', 'Pleated'], ['tie', 'Wrap and tie']],
    collarFor: COLLAR_FOR, detailsFor: DETAILS_FOR,
    sleeves: [['sleeveless', 'Sleeveless'], ['short', 'Short'], ['three-quarter', '¾'], ['long', 'Long']],
    length: [['hip', 'Hip'], ['knee', 'Knee'], ['midi', 'Midi'], ['ankle', 'Ankle'], ['full', 'Floor']],
    lengthFor: { kaftan: LENGTHS, agbada: ['midi', 'ankle', 'full'], boubou: ['midi', 'ankle', 'full'], dress: LENGTHS, suit: [], shirt: [], tee: [], hoodie: [], bomber: [], kimono: ['knee', 'midi', 'ankle', 'full'], joggers: ['knee', 'midi', 'ankle'], trousers: ['knee', 'midi', 'ankle', 'full'], skirt: ['knee', 'midi', 'ankle', 'full'] },
    sleevesFor: { kaftan: SLEEVES, agbada: [], boubou: [], dress: SLEEVES, suit: [], shirt: ['short', 'three-quarter', 'long'], tee: SLEEVES, hoodie: ['short', 'long'], bomber: [], kimono: [], joggers: [], trousers: [], skirt: [] },
    fit: [['fitted', 'Fitted'], ['regular', 'Regular'], ['relaxed', 'Relaxed']],
    fitFor: { kaftan: true, agbada: false, boubou: false, dress: true, suit: true, shirt: true, tee: true, hoodie: true, bomber: true, kimono: false, joggers: true, trousers: true, skirt: true },
    /* what the collar tab is called (the waist, for trousers and skirts), and which styles take embroidery */
    collarTitle: g => (isBottom(g) ? 'Waist' : 'Collar'), embFor: g => !isBottom(g),
    form: [['woman', 'Woman'], ['man', 'Man']],
    embroidery: [['none', 'None'], ['neck', 'Neckline'], ['chest', 'Chest'], ['chest-hem', 'Chest + hem'], ['full', 'All over']],
    fabric: Object.keys(FABRICS).map(k => [k, cap(FABRICS[k].label)]),
    pattern: [['plain', 'Plain'], ['ankara', 'Ankara'], ['kente', 'Kente'], ['adire', 'Adire'], ['stripe', 'Aso-oke stripe'], ['lace', 'Lace'], ['brocade', 'Brocade'], ['check', 'Check'], ['floral', 'Floral']],
    garment: Object.keys(GARMENTS).map(k => [k, GARMENTS[k].label]),
  };
  /* Switch garment while keeping the user's colours, fabric, pattern and sketch. */
  E.switchGarment = (spec, garment) => {
    const b = E.blank(garment);
    return E.normalize({ ...b, color: spec.color, accent: spec.accent, fabric: spec.fabric, pattern: spec.pattern, embroidery: GARMENTS[garment] && GARMENTS[garment].noEmb ? 'none' : spec.embroidery, density: spec.density, form: spec.form, sketch: spec.sketch, sketchClip: spec.sketchClip, notes: spec.notes, palette: spec.palette, customColor: spec.customColor, collar: COLLAR_FOR[garment].includes(spec.collar) ? spec.collar : b.collar, template: null });
  };
  E.shuffle = (spec, rnd = Math.random) => {
    const pick = a => a[Math.floor(rnd() * a.length)], g = spec.garment;
    const pal = pick(E.palettes(g, spec.fabric));
    const next = { ...spec, color: pick(pal.base), accent: pick(pal.accents), collar: pick(COLLAR_FOR[g]), embroidery: GARMENTS[g].noEmb ? 'none' : pick(E.OPTIONS.embroidery)[0], density: 1 + Math.floor(rnd() * 3), pattern: pick(PATTERNS), palette: pal.id, customColor: false, template: null };
    if (E.OPTIONS.sleevesFor[g].length) next.sleeves = pick(E.OPTIONS.sleevesFor[g]);
    if (E.OPTIONS.lengthFor[g].length) next.length = pick(E.OPTIONS.lengthFor[g].filter(l => l !== 'hip'));
    return E.normalize(next);
  };
  /* Which crop to use when previewing a group, so the difference is visible at thumbnail size. */
  E.CROP = { collar: '190 180 340 270', embroidery: '110 190 500 640', sleeves: '40 210 640 500', length: '50 200 620 940', fabric: '270 420 180 180', pattern: '270 420 180 180', template: '40 196 640 950', garment: '40 196 640 950', fit: '90 210 540 740', card: '60 200 600 700' };

  /* ───────── names ───────── */
  E.colorName = c => {
    if (typeof c !== 'string') return 'midnight';
    if (c[0] !== '#') return COLORS[c] || ACCENTS[c] ? c : 'midnight';
    const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; let best = 'midnight', bd = 1e9;
    for (const [k, v] of Object.entries(COLORS)) { if (k === 'gray') continue; const m = parseInt(v.slice(1), 16), d = (r - (m >> 16)) ** 2 * 2 + (g - ((m >> 8) & 255)) ** 2 * 4 + (b - (m & 255)) ** 2 * 3; if (d < bd) { bd = d; best = k; } }
    return best;
  };
  const TPL_WORD = { senator: 'senator set', dashiki: 'dashiki', jalabiya: 'jalabiya', kurta: 'kurta', sherwani: 'sherwani', thobe: 'thobe', abaya: 'abaya', qipao: 'qipao', kilt: 'kilt', sarong: 'sarong', 'iro-wrapper': 'wrapper', guayabera: 'guayabera', 'aloha-shirt': 'aloha shirt', haori: 'haori', yukata: 'yukata', jeans: 'jeans', chinos: 'chinos', 'denim-jacket': 'jacket' };
  const garmentWord = s => {
    const t = s.template && E.template(s.template), g = s.garment; if (t && t.garment === g && TPL_WORD[t.id]) return TPL_WORD[t.id];
    if (g === 'tee') return s.collar === 'polo' ? 'polo shirt' : s.sleeves === 'sleeveless' ? 'tank top' : 'T-shirt';
    if (g === 'hoodie' && s.collar !== 'hood') return 'sweatshirt';
    if (g === 'bomber' && s.collar !== 'rib') return 'jacket';
    if ((g === 'trousers' || g === 'joggers') && s.length === 'knee') return g === 'joggers' ? 'jogger shorts' : 'shorts';
    return GARMENTS[g].label.toLowerCase();
  };
  E.title = spec => {
    const s = E.normalize(spec), F = FABRICS[s.fabric];
    const pat = s.pattern && !['plain', 'ankara', 'stripe', 'lace', 'brocade'].includes(s.pattern) ? ' ' + s.pattern : '';
    let t = `${cap(E.colorName(s.color))}${pat} ${F.label} ${garmentWord(s)}`;
    if (s.embroidery !== 'none') t += ` with ${E.colorName(s.accent)} embroidery`;
    return t;
  };
  E.summary = spec => {
    const s = E.normalize(spec), g = s.garment, has = k => DETAILS_FOR[g].includes(k) && s[k];
    return [
      E.OPTIONS.fitFor[g] ? (s.fit === 'fitted' ? 'Fitted' : `${cap(s.fit)} fit`) : null,
      E.OPTIONS.sleevesFor[g].length ? `${s.sleeves === 'sleeveless' ? 'Sleeveless' : cap(s.sleeves) + ' sleeves'}${s.puff && g !== 'suit' && s.sleeves !== 'sleeveless' ? ' (puff)' : ''}` : null,
      E.OPTIONS.lengthFor[g].length ? `${cap(s.length === 'full' ? 'floor' : s.length)} length` : null,
      cap(COLLAR_LABEL[s.collar]), s.embroidery !== 'none' ? cap(EMB_LABEL[s.embroidery]) : null,
      s.pattern !== 'plain' ? cap(s.pattern) + ' pattern' : null, s.sketch.length ? `Hand sketch (${s.sketch.length} stroke${s.sketch.length === 1 ? '' : 's'})` : null,
      has('pockets') ? 'Pockets' : null, has('belt') ? 'Belt' : null, has('buttons') ? 'Buttons' : null,
      D_SET[g] || null,
    ].filter(Boolean);
  };
  const D_SET = { kaftan: 'With trousers', agbada: 'Three-piece set', suit: 'Jacket and trousers' };
  E.isBottom = isBottom;

  /* Readable change list between two specs, for the version history ("Collar → mandarin"). */
  E.diff = (a0, b0) => {
    if (!a0) return [];
    const a = E.normalize(a0), b = E.normalize(b0), out = [], L = { garment: 'Style', form: 'Mannequin', fabric: 'Fabric', color: 'Colour', accent: 'Accent', length: 'Length', sleeves: 'Sleeves', collar: 'Collar', fit: 'Fit', embroidery: 'Embroidery', density: 'Embroidery weight', pattern: 'Pattern' };
    for (const k of Object.keys(L)) if (a[k] !== b[k]) out.push(`${L[k]} → ${k === 'color' || k === 'accent' ? E.colorName(b[k]) : k === 'embroidery' ? EMB_LABEL[b[k]].replace('embroidery ', '').replace('no embroidery', 'none') : k === 'density' ? ['', 'light', 'medium', 'heavy'][b[k]] : k === 'form' ? E.formOf(b) : String(b[k]).replace('-', ' ')}`);
    for (const k of ['puff', 'pockets', 'buttons', 'belt']) if (a[k] !== b[k]) out.push(`${cap(k === 'puff' ? 'puff sleeves' : k)} ${b[k] ? 'added' : 'removed'}`);
    const sa = a.sketch.length, sb = b.sketch.length;
    if (sb > sa) out.push(`Sketch +${sb - sa} stroke${sb - sa === 1 ? '' : 's'}`); else if (sb < sa) out.push(sb ? `Sketch −${sa - sb}` : 'Sketch cleared'); else if (sb && JSON.stringify(a.sketch) !== JSON.stringify(b.sketch)) out.push('Sketch edited');
    if (JSON.stringify(a.notes) !== JSON.stringify(b.notes)) out.push(b.notes.length > a.notes.length ? 'Tailor note added' : 'Tailor notes changed');
    if (a.sketchClip !== b.sketchClip) out.push('Sketch area changed');
    return out;
  };

  /* ───────── pricing in naira ───────── */
  const EMB_COST = { none: 0, neck: 6000, chest: 14000, 'chest-hem': 24000, full: 36000 };
  E.price = (spec, vendor = {}) => {
    const s = E.normalize(spec), G = GARMENTS[s.garment], F = FABRICS[s.fabric];
    const base = Math.round(G.base * F.x);
    const emb = Math.round(EMB_COST[s.embroidery] * (0.7 + s.density * 0.3));
    const has = k => DETAILS_FOR[s.garment].includes(k) && s[k];
    const extras = (s.sketch.length ? Math.min(15000, 3000 + s.sketch.length * 400) : 0) + (has('pockets') ? 2500 : 0) + (has('belt') ? 3000 : 0) + (s.puff ? 2000 : 0) + (s.length === 'full' ? 4000 : 0);
    const labour = Math.round(base * 0.12), factor = vendor.priceFactor || 1;
    const price = Math.round(((base + emb + extras + labour) * factor) / 500) * 500;
    const complexity = 1 + (s.embroidery === 'none' ? 0 : s.density * 0.6) + (G.complex || 0) + (s.sketch.length ? 0.6 : 0);
    const deliveryDays = Math.max(3, Math.round((vendor.leadMin || 5) + complexity * (vendor.speedFactor || 1)));
    return { price, deliveryDays, breakdown: { fabric: base, embroidery: emb, extras, labour, factor } };
  };
  /** What a design is likely to cost to make, as a range across verified tailors. */
  E.estimate = spec => { const lo = E.price(spec, { priceFactor: 0.82, leadMin: 3, speedFactor: 0.7 }), hi = E.price(spec, { priceFactor: 1.22, leadMin: 10, speedFactor: 1.5 }); return { low: lo.price, high: hi.price, daysLow: lo.deliveryDays, daysHigh: hi.deliveryDays }; };

  /* ───────── daily challenges: one per day for everyone, rotating ───────── */
  const light = c => E.lum(E.colorHex(c)) > 0.75;
  E.CHALLENGES = [
    { id: 'owambe-agbada', title: 'Owambe ready', text: 'Design an agbada with embroidery on the chest.', template: 'grand-agbada', tab: 'embroidery', check: s => s.garment === 'agbada' && ['chest', 'chest-hem', 'full'].includes(s.embroidery) },
    { id: 'sketch-motif', title: 'Hand-drawn', text: 'Sketch your own motif on any design (3 strokes or more).', tab: 'sketch', check: s => s.sketch.length >= 3 },
    { id: 'puff-dress', title: 'Puff it up', text: 'Make a dress with puff sleeves.', template: 'ankara-flare', tab: 'sleeves', check: s => s.garment === 'dress' && s.puff && s.sleeves !== 'sleeveless' },
    { id: 'mandarin-kaftan', title: 'Stand tall', text: 'A kaftan with a band collar.', template: 'senator', tab: 'collar', check: s => s.garment === 'kaftan' && s.collar === 'mandarin' },
    { id: 'all-white', title: 'All white', text: 'Design something light: white, ivory or cream.', template: 'linen-kaftan', tab: 'colours', check: s => light(s.color) },
    { id: 'kente-anything', title: 'Kente day', text: 'Use the Kente pattern on any garment.', template: 'kente-midi', tab: 'fabric', check: s => s.pattern === 'kente' },
    { id: 'shawl-suit', title: 'Black tie', text: 'A suit with a shawl lapel.', template: 'shawl-tux', tab: 'collar', check: s => s.garment === 'suit' && s.collar === 'shawl' },
    { id: 'floor-gown', title: 'Red carpet', text: 'A floor-length dress.', template: 'evening-gown', tab: 'length', check: s => s.garment === 'dress' && s.length === 'full' },
    { id: 'custom-colour', title: 'Your own colour', text: 'Pick a custom colour with the colour picker.', tab: 'colours', check: s => s.customColor === true },
    { id: 'adire-boubou', title: 'Adire Sunday', text: 'Put the Adire pattern on a boubou.', template: 'adire-boubou', tab: 'fabric', check: s => s.garment === 'boubou' && s.pattern === 'adire' },
    { id: 'pocket-shirt', title: 'Utility', text: 'A short-sleeve shirt with a pocket.', template: 'ankara-shirt', tab: 'details', check: s => s.garment === 'shirt' && s.sleeves === 'short' && s.pockets },
    { id: 'belted', title: 'Cinched', text: 'Add a belt to a dress, kaftan or boubou.', template: 'kente-midi', tab: 'details', check: s => s.belt && DETAILS_FOR[s.garment].includes('belt') },
    { id: 'mirror-sketch', title: 'Symmetry', text: 'Draw a mirrored sketch stroke.', tab: 'sketch', check: s => s.sketch.some(k => k.m) },
    { id: 'all-over', title: 'Go big', text: 'Embroidery all over, heaviest weight.', template: 'royal-kaftan', tab: 'embroidery', check: s => s.embroidery === 'full' && s.density === 3 },
  ];
  E.dayIndex = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  E.dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  E.challengeFor = (d = new Date()) => E.CHALLENGES[E.dayIndex(d) % E.CHALLENGES.length];
  E.checkChallenge = (ch, spec) => { try { return !!ch.check(E.normalize(spec)); } catch { return false; } };

  /* ───────── "Describe it" (optional): a sentence sets the parts ───────── */
  const has = (t, w) => new RegExp('(^|[^a-z])' + w.replace(/[-\s]/g, '[-\\s]?') + '(s|es)?([^a-z]|$)', 'i').test(t);
  const findKey = (t, table) => { let best = null, n = 0; for (const [k, v] of Object.entries(table)) for (const w of v.words) if (w.length > n && has(t, w)) { best = k; n = w.length; } return best; };
  const COLOR_NAMES = Object.keys(COLORS).sort((a, b) => b.length - a.length), ACCENT_NAMES = Object.keys(ACCENTS).sort((a, b) => b.length - a.length);
  E.parse = (prompt = '', hints = {}) => {
    const t = ' ' + String(prompt).toLowerCase().slice(0, 600) + ' ';
    const garment = findKey(t, GARMENTS) || (GARMENTS[String(hints.garment || '').toLowerCase()] ? String(hints.garment).toLowerCase() : 'kaftan');
    const s = E.blank(garment), G = GARMENTS[garment];
    const fabric = findKey(t, FABRICS); if (fabric) { s.fabric = fabric; s.pattern = fabric === 'ankara' ? 'ankara' : fabric === 'aso-oke' ? 'stripe' : fabric === 'lace' ? 'lace' : fabric === 'brocade' ? 'brocade' : 'plain'; }
    const accentCtx = /(embroider|thread|trim|piping|accent|detail|button|stitch|lining|border|beading|bead)/;
    for (const c of COLOR_NAMES) {
      const m = new RegExp('(^|[^a-z])' + c.replace(' ', '[-\\s]?') + '([^a-z]|$)', 'i').exec(t); if (!m) continue;
      const after = t.slice(m.index, m.index + c.length + 32), before = t.slice(Math.max(0, m.index - 28), m.index);
      const isAccent = accentCtx.test(after) || /\b(with|and)\s+(deep|bright|fine|subtle|heavy|thin)?\s*$/.test(before);
      if (isAccent && ACCENTS[c.split(' ')[0]]) { s.accent = c.split(' ')[0]; continue; }
      if (s.color === G.color && !isAccent) s.color = c;
    }
    for (const a of ACCENT_NAMES) if (has(t, a + ' (embroider|thread|trim|piping|accent|button|beading|stitch)')) s.accent = a;
    if (/sleeveless|no sleeves|without sleeves/.test(t)) s.sleeves = 'sleeveless'; else if (/three[-\s]?quarter|3\/4|elbow[-\s]length/.test(t)) s.sleeves = 'three-quarter'; else if (/short sleeve|cap sleeve/.test(t)) s.sleeves = 'short'; else if (/long sleeve|full sleeve|to the wrist|wrist[-\s]length/.test(t)) s.sleeves = 'long';
    if (/puff(ed|y)? sleeve|balloon sleeve|bishop sleeve/.test(t)) s.puff = true;
    if (garment === 'tee') { if (/polo/.test(t)) s.collar = 'polo'; if (/tank|singlet|vest top/.test(t)) s.sleeves = 'sleeveless'; }
    if (garment === 'hoodie' && /sweatshirt|crew ?neck|no hood|without a hood/.test(t)) { s.collar = 'round'; s.pockets = false; }
    if (garment === 'bomber' && /denim|coach|trucker/.test(t)) s.collar = 'classic';
    if (isBottom(garment)) { if (/shorts/.test(t)) s.length = 'knee'; if (/wide[-\s]?leg|palazzo|culottes/.test(t)) s.fit = 'relaxed'; if (/pleat/.test(t) && garment === 'trousers') s.collar = 'pleated'; if (/elastic/.test(t) && garment === 'joggers') s.collar = 'elastic'; if (/wrapper|iro|sarong|lungi|wrap/.test(t) && garment === 'skirt') s.collar = 'tie'; if (/kilt|tartan/.test(t)) { s.pattern = 'check'; s.fit = 'relaxed'; s.length = 'knee'; } if (/pencil/.test(t)) s.fit = 'fitted'; }
    if (/\b(women'?s|woman|ladies|female|for her)\b/.test(t)) s.form = 'woman'; else if (/\b(men'?s|man|gents|male|for him)\b/.test(t)) s.form = 'man';
    if (/floor[-\s]length|full[-\s]length|to the floor|maxi/.test(t)) s.length = 'full'; else if (/ankle/.test(t)) s.length = 'ankle'; else if (/midi|mid[-\s]calf|tea[-\s]length/.test(t)) s.length = 'midi'; else if (/knee/.test(t)) s.length = 'knee'; else if (/hip[-\s]length|cropped|mini/.test(t)) s.length = 'hip';
    if (/mandarin|band collar|standing collar|nehru/.test(t)) s.collar = 'mandarin'; else if (/shawl/.test(t)) s.collar = 'shawl'; else if (/notch/.test(t)) s.collar = 'notch'; else if (/v[-\s]?neck|deep neck/.test(t)) s.collar = 'v'; else if (/sweetheart/.test(t)) s.collar = 'sweetheart'; else if (/square neck/.test(t)) s.collar = 'square'; else if (/off[-\s](the[-\s])?shoulder|bardot/.test(t)) s.collar = 'off-shoulder'; else if (/round neck|crew neck|scoop/.test(t)) s.collar = 'round'; else if (/shirt collar|classic collar|point collar/.test(t)) s.collar = 'classic';
    if (/fitted|slim|body[-\s]?con|snug|tight/.test(t)) s.fit = 'fitted'; else if (/relaxed|loose|flowing|oversized|roomy/.test(t)) s.fit = 'relaxed';
    const emb = /embroider|thread ?work|motif|beading|bead|sequin/.test(t);
    if (/no embroidery|without embroidery|plain,? no/.test(t)) s.embroidery = 'none'; else if (/to the hem|chest (and|&) hem|hem(line)? (and|&) chest/.test(t)) s.embroidery = 'chest-hem'; else if (/all over|everywhere|heavily embroidered/.test(t) || (emb && /cuff/.test(t))) s.embroidery = 'full'; else if (emb && /chest/.test(t)) s.embroidery = 'chest'; else if (emb && /neck|collar/.test(t)) s.embroidery = 'neck'; else if (emb && s.embroidery === 'none') s.embroidery = 'chest';
    if (/heavy|heavier|dense|rich|bold/.test(t)) s.density = 3; else if (/light|fine|subtle|minimal/.test(t)) s.density = 1;
    if (/pocket/.test(t) && !/no pocket/.test(t)) s.pockets = true;
    if (/button/.test(t) && !/no button/.test(t)) s.buttons = true;
    if (/belt|sash|cinched/.test(t) && !/no belt/.test(t)) s.belt = true;
    for (const p of ['kente', 'adire', 'floral', 'check']) if (has(t, p)) s.pattern = p;
    if (/stripe/.test(t)) s.pattern = 'stripe';
    return E.normalize(s);
  };
  E._clone = clone;
})();
