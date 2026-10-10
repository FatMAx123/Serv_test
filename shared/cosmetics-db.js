// ============================================================
//  SHARED / COSMETICS-DB.JS — титулы, цвет ника, ауры (L2-like)
//  Видимые «внешки» с Italian brainrot / easter боссов.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.COSMETICS_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Титулы (над ником) */
  var TITLES = {
    tralalero: {
      id: 'tralalero',
      name: 'Tralalero Toasterino',
      color: '#ff88cc',
      desc: 'Пасхалка: Тостер-Тралалеро. «Tralalero tralala…»'
    },
    bombardiro: {
      id: 'bombardiro',
      name: 'Bombardiro Blendodilo',
      color: '#ff8844',
      desc: 'Пасхалка: Блендер-Бомбардиро. Воздушная поддержка смузи.'
    },
    tung_tung: {
      id: 'tung_tung',
      name: 'Tung Tung Vacuum Sahur',
      color: '#aa88ff',
      desc: 'Пасхалка: Пылесос Тунг-Тунг. Sahur mode: ON.'
    },
    ballerina_cap: {
      id: 'ballerina_cap',
      name: 'Ballerina Cappuccino',
      color: '#ffd700',
      desc: 'Пасхалка: Капучино-Балерина. En pointe, 14 bar.'
    },
    skibidi_steam: {
      id: 'skibidi_steam',
      name: 'Skibidi Steamino',
      color: '#66ffaa',
      desc: 'Пасхалка: Скибиди-Пар. Ohio factory certified.'
    }
  };

  /** Именованные краски ника */
  var NAME_COLORS = {
    pink_brainrot: { id: 'pink_brainrot', hex: '#ff44aa', name: 'Мем-розовый' },
    fire_blend: { id: 'fire_blend', hex: '#ff6622', name: 'Блендер-огненный' },
    vacuum_violet: { id: 'vacuum_violet', hex: '#9966ff', name: 'Пылесос-фиолет' },
    cappuccino_gold: { id: 'cappuccino_gold', hex: '#ffcc44', name: 'Капучино-золото' },
    skibidi_green: { id: 'skibidi_green', hex: '#44ff88', name: 'Скибиди-зелёный' },
    wifi_cyan: { id: 'wifi_cyan', hex: '#44ddff', name: 'Wi-Fi циан' },
    gm_cyan: { id: 'gm_cyan', hex: '#00f0ff', name: 'Сияющий циан GM (L2)' },
    gm_gold: { id: 'gm_gold', hex: '#ffd700', name: 'Имперское золото GM' }
  };

  /** Ауры (видимый glow у корпуса, аутентичный Hero / Champion) */
  var AURAS = {
    gm_champion: {
      id: 'gm_champion',
      name: 'Аура Чемпиона (Паровой Сапфир)',
      color: 0x00d4ff,
      hex: '#00d4ff',
      innerHex: '#ffffff',
      desc: 'Сияющая лазурная аура Парового Чемпиона: столбы света за спиной, орбитальные кольца вокруг тела и 4-лучевые звезды.'
    },
    champion_blue: {
      id: 'champion_blue',
      name: 'Синий Чемпион (Сапфир)',
      color: 0x00d4ff,
      hex: '#00d4ff',
      innerHex: '#ffffff',
      desc: 'Лазурно-сапфировая аура элитного Парового Чемпиона.'
    },
    champion_red: {
      id: 'champion_red',
      name: 'Красный Чемпион (Рубин)',
      color: 0xff2a14,
      hex: '#ff2a14',
      innerHex: '#ffd566',
      desc: 'Огненно-багровая аура грозного Парового Чемпиона.'
    },
    champion_gold: {
      id: 'champion_gold',
      name: 'Золотой Чемпион (Янтарь)',
      color: 0xffb700,
      hex: '#ffb700',
      innerHex: '#ffffff',
      desc: 'Золотое сияние верховного Парового Чемпиона.'
    },
    hero_aura: {
      id: 'hero_aura',
      name: 'Аура Героя (Hero Glow)',
      color: 0xffea88,
      hex: '#ffd700',
      innerHex: '#ffffff',
      desc: 'Легендарное золотое сияние Чемпиона Паровой Арены: восходящие столбы света за спиной, наклонные орбитальные кольца и 4-лучевые звезды.'
    },
    skibidi_steam: {
      id: 'skibidi_steam',
      name: 'Аура Скибиди-Пара',
      color: 0x00ff99,
      hex: '#00ff99',
      innerHex: '#e0fffa',
      desc: 'Изумрудный эфирный столб и мерцающие кристаллы пара рейдового босса Skibidi.'
    },
    tralala_neon: {
      id: 'tralala_neon',
      name: 'Неон Tralala',
      color: 0xff2299,
      hex: '#ff2299',
      innerHex: '#ffffff',
      desc: 'Электрический неоново-розовый ореол рейдового босса Toasterino: струящийся столб эфирного света, руническая печать на земле и 4-лучевые сияющие искры.'
    },
    bombardiro_fire: {
      id: 'bombardiro_fire',
      name: 'Реактивный смузи',
      color: 0xff6600,
      hex: '#ff6600',
      innerHex: '#fff2a0',
      desc: 'Пламенный янтарно-огненный ореол рейдового босса Blendodilo.'
    },
    vacuum_void: {
      id: 'vacuum_void',
      name: 'Вакуумная бездна',
      color: 0xa833ff,
      hex: '#a833ff',
      innerHex: '#f2e6ff',
      desc: 'Фиолетовая вакуумная аура перегрузки паровых турбин рейдового босса Vacuum Sahur.'
    },
    cappuccino_gold: {
      id: 'cappuccino_gold',
      name: 'Золотая пенка',
      color: 0xffcc22,
      hex: '#ffcc22',
      innerHex: '#ffffff',
      desc: 'Ослепительная золотая аура примы Ballerina Cappuccino.'
    }
  };

  function emptyCosmetics() {
    return {
      titles: [],
      title: null,
      nameColors: [],
      nameColor: null,
      auras: [],
      aura: null
    };
  }

  function normalize(raw) {
    var c = emptyCosmetics();
    if (!raw || typeof raw !== 'object') return c;
    if (Array.isArray(raw.titles)) c.titles = raw.titles.filter(function (t) { return !!TITLES[t]; });
    if (raw.title && TITLES[raw.title]) c.title = raw.title;
    if (Array.isArray(raw.nameColors)) {
      c.nameColors = raw.nameColors.filter(function (id) {
        return !!NAME_COLORS[id] || /^#[0-9a-fA-F]{6}$/.test(id);
      });
    }
    if (raw.nameColor) {
      if (NAME_COLORS[raw.nameColor]) c.nameColor = NAME_COLORS[raw.nameColor].hex;
      else if (/^#[0-9a-fA-F]{6}$/.test(raw.nameColor)) c.nameColor = raw.nameColor;
    }
    if (Array.isArray(raw.auras)) c.auras = raw.auras.filter(function (a) { return !!AURAS[a]; });
    if (raw.aura && AURAS[raw.aura]) c.aura = raw.aura;
    return c;
  }

  // ============================================================
  //  ВНЕШНОСТЬ ПЕРСОНАЖА (appearance)
  //  Каталоги-зеркала client/js/char-model.js: HAIR_STYLES, FACE_STYLES,
  //  WEAPON_VISUALS. Держатся здесь, потому что сервер обязан валидировать
  //  appearance (он уходит в профиль и в AOI-снапшот всем рядом), а char-model
  //  — ES-модуль браузера и на сервере не грузится.
  //  ПРИ ДОБАВЛЕНИИ причёски/лица в char-model.js — добавить id и сюда.
  // ============================================================
  var HAIR_IDS = ['none', 'hair1'];
  var FACE_IDS = ['face1', 'face2', 'face3'];
  var WEAPON_VISUAL_IDS = ['apprentice_wand', 'magic_mace'];
  /** 5 красок из char-select.js HAIR_COLOR_HEX */
  var HAIR_COLOR_HEX = ['#121014', '#6b3210', '#e03a12', '#f2d060', '#c4c4d0'];
  var DEFAULT_APPEARANCE = { hairId: 'none', hairColor: '#121014', faceId: 'face1', weaponId: null };

  function inList(list, v) {
    return typeof v === 'string' && list.indexOf(v) >= 0;
  }

  /**
   * Приводит appearance к четырём известным полям. Строится с нуля (allow-list),
   * поэтому лишние ключи, вложенные объекты, `__proto__` и мегабайтные строки
   * физически не проходят: раньше сервер писал произвольный JSON любого размера
   * в профиль и рассылал его всем в AOI.
   * Невалидное значение → дефолт, а не отказ: appearance приходит из
   * localStorage и мигрирует между версиями клиента.
   * @returns {{hairId:string, hairColor:string, faceId:string, weaponId:string|null}}
   */
  function normalizeAppearance(raw) {
    var a = {
      hairId: DEFAULT_APPEARANCE.hairId,
      hairColor: DEFAULT_APPEARANCE.hairColor,
      faceId: DEFAULT_APPEARANCE.faceId,
      weaponId: null
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return a;
    if (inList(HAIR_IDS, raw.hairId)) a.hairId = raw.hairId;
    if (typeof raw.hairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.hairColor)) {
      a.hairColor = raw.hairColor.toLowerCase();
    }
    if (inList(FACE_IDS, raw.faceId)) a.faceId = raw.faceId;
    if (inList(WEAPON_VISUAL_IDS, raw.weaponId)) a.weaponId = raw.weaponId;
    return a;
  }

  function titleLabel(titleId) {
    var t = TITLES[titleId];
    return t ? t.name : null;
  }

  function titleColor(titleId) {
    var t = TITLES[titleId];
    return t ? t.color : '#c9a227';
  }

  function resolveNameColor(idOrHex) {
    if (!idOrHex) return '#ffffff';
    if (NAME_COLORS[idOrHex]) return NAME_COLORS[idOrHex].hex;
    if (/^#[0-9a-fA-F]{6}$/.test(idOrHex)) return idOrHex;
    return '#ffffff';
  }

  /**
   * Нарисовать nameplate на canvas (L2-style: title + name + Lv).
   * @returns {{ w:number, h:number }}
   */
  function paintNameplate(canvas, opts) {
    opts = opts || {};
    var w = canvas.width || 1024;
    var h = canvas.height || 256;
    canvas.width = w;
    canvas.height = h;
    var ctx = (opts && opts.ctx) || (canvas && canvas.getContext ? canvas.getContext('2d') : null);
    if (!ctx) return { w: w, h: h };
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    try { ctx.textRendering = 'geometricPrecision'; } catch (e) {}
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    var sc = h / 96;
    var isGm = !!opts.gm || (opts.accessLevel != null && opts.accessLevel >= 50);
    var name = String(opts.name || '?').slice(0, 20);
    var defaultGmTitle = 'GM';
    var title = (opts.titleName !== undefined ? opts.titleName : (opts.titleId ? titleLabel(opts.titleId) : (isGm ? defaultGmTitle : null)));
    if (isGm && (!title || title === '[Administrator]' || title === '[Game Master]')) {
      title = 'GM';
    }
    
    // Цвет ника: для GM по умолчанию яркий неоновый циан (#00f0ff), классический GM стиль
    var col;
    if (opts.flagged) {
      col = '#ff4444';
    } else if (opts.nameColor || opts.color) {
      col = resolveNameColor(opts.nameColor || opts.color);
    } else if (isGm) {
      col = '#00f0ff'; // Classic GM Cyan
    } else {
      col = '#ffffff';
    }

    var titleCol = opts.titleColor || (opts.titleId ? titleColor(opts.titleId) : (isGm ? '#ffd700' : '#c9a227'));
    var clanName = opts.clanName ? String(opts.clanName).slice(0, 16) : '';
    var crest = opts.crestImage || null;

    var hasHeader = !!(title || clanName);
    var nameY = hasHeader ? Math.round(h * 0.70) : Math.round(h * 0.52);
    var headerY = Math.round(h * 0.32);
    var textX = Math.round(w / 2);

    if (crest && crest.width && ctx.putImageData) {
      try {
        var cw = crest.width, ch = crest.height;
        var crestScale = Math.max(2, Math.round(2.6 * sc));
        var dx = Math.round(18 * sc), dy = Math.max(8, (h - ch * crestScale) / 2);
        ctx.imageSmoothingEnabled = false;
        var tmp = document.createElement('canvas');
        tmp.width = cw; tmp.height = ch;
        tmp.getContext('2d').putImageData(crest, 0, 0);
        ctx.drawImage(tmp, dx, dy, cw * crestScale, ch * crestScale);
        ctx.imageSmoothingEnabled = true;
        textX = Math.round(w / 2 + 10 * sc);
      } catch (e) { /* ignore */ }
    }

    if (clanName && !title) {
      var clanFont = Math.round(18 * sc);
      var clanStroke = Math.max(2, Math.round(2.4 * sc));
      ctx.font = 'bold ' + clanFont + 'px Tahoma, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
      ctx.lineWidth = clanStroke;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = '#c9a227';
      ctx.shadowBlur = 0;
      ctx.strokeText('[' + clanName + ']', textX, headerY);
      ctx.fillText('[' + clanName + ']', textX, headerY);
    } else if (title) {
      var titleFont = Math.round(18 * sc);
      var titleStroke = Math.max(2, Math.round(2.4 * sc));
      ctx.font = 'bold ' + titleFont + 'px Tahoma, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
      ctx.lineWidth = titleStroke;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeStyle = '#000000';
      ctx.fillStyle = titleCol;
      ctx.shadowBlur = 0;
      ctx.strokeText(title, textX, headerY);
      ctx.fillText(title, textX, headerY);
    }

    var nameFont = Math.round(25 * sc);
    var nameStroke = Math.max(3, Math.round(3.2 * sc));
    ctx.font = 'bold ' + nameFont + 'px Tahoma, "Trebuchet MS", "Segoe UI", Arial, sans-serif';
    ctx.lineWidth = nameStroke;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = col;
    ctx.shadowBlur = 0;
    ctx.strokeText(name, textX, nameY);
    ctx.fillText(name, textX, nameY);

    return { w: w, h: h };
  }

  /**
   * Эффект предмета-косметики / свитка.
   * Возвращает { ok, cosmetics, grantSkill, msg, consumed }
   */
  function applyItemEffect(cosmetics, effect) {
    var c = normalize(cosmetics);
    var msg = [];
    var grantSkill = null;
    var changed = false;

    if (effect.titleId && TITLES[effect.titleId]) {
      if (c.titles.indexOf(effect.titleId) < 0) {
        c.titles.push(effect.titleId);
        msg.push('Титул разблокирован: ' + TITLES[effect.titleId].name);
      } else {
        msg.push('Титул уже есть: ' + TITLES[effect.titleId].name);
      }
      c.title = effect.titleId;
      changed = true;
    }

    if (effect.nameColorId && NAME_COLORS[effect.nameColorId]) {
      var nc = NAME_COLORS[effect.nameColorId];
      if (c.nameColors.indexOf(effect.nameColorId) < 0) {
        c.nameColors.push(effect.nameColorId);
        msg.push('Цвет ника: ' + nc.name);
      }
      c.nameColor = nc.hex;
      changed = true;
    } else if (effect.nameColor && /^#[0-9a-fA-F]{6}$/.test(effect.nameColor)) {
      if (c.nameColors.indexOf(effect.nameColor) < 0) c.nameColors.push(effect.nameColor);
      c.nameColor = effect.nameColor;
      msg.push('Цвет ника изменён');
      changed = true;
    }

    if (effect.auraId && AURAS[effect.auraId]) {
      if (c.auras.indexOf(effect.auraId) < 0) {
        c.auras.push(effect.auraId);
        msg.push('Аура: ' + AURAS[effect.auraId].name);
      }
      c.aura = effect.auraId;
      changed = true;
    }

    if (effect.grantSkill) {
      grantSkill = effect.grantSkill;
      msg.push('Мем-умение: ' + effect.grantSkill);
      changed = true;
    }

    return {
      ok: changed || !!grantSkill,
      cosmetics: c,
      grantSkill: grantSkill,
      msg: msg.join(' · ') || 'OK',
      consumed: true
    };
  }

  /** Карта itemId → effect (для сервера CONSUMABLES / use). Титулы теперь в экипировке. */
  var ITEM_EFFECTS = {
    // name dyes
    dye_pink_brainrot: { nameColorId: 'pink_brainrot' },
    dye_fire_blend: { nameColorId: 'fire_blend' },
    dye_vacuum_violet: { nameColorId: 'vacuum_violet' },
    dye_cappuccino_gold: { nameColorId: 'cappuccino_gold' },
    dye_skibidi_green: { nameColorId: 'skibidi_green' },
    // auras
    aura_skibidi_steam: { auraId: 'skibidi_steam' },
    aura_tralala_neon: { auraId: 'tralala_neon' },
    aura_bombardiro_fire: { auraId: 'bombardiro_fire' },
    aura_vacuum_void: { auraId: 'vacuum_void' },
    aura_cappuccino_gold: { auraId: 'cappuccino_gold' },
    // skill scrolls
    scroll_br_skibidi_slam: { grantSkill: 'br_skibidi_slam' },
    scroll_br_tralala_wave: { grantSkill: 'br_tralala_wave' },
    scroll_br_bombardiro_dive: { grantSkill: 'br_bombardiro_dive' },
    scroll_br_tung_suction: { grantSkill: 'br_tung_suction' },
    scroll_br_cappuccino_spin: { grantSkill: 'br_cappuccino_spin' }
  };

  return {
    TITLES: TITLES,
    NAME_COLORS: NAME_COLORS,
    AURAS: AURAS,
    ITEM_EFFECTS: ITEM_EFFECTS,
    HAIR_IDS: HAIR_IDS,
    FACE_IDS: FACE_IDS,
    WEAPON_VISUAL_IDS: WEAPON_VISUAL_IDS,
    HAIR_COLOR_HEX: HAIR_COLOR_HEX,
    DEFAULT_APPEARANCE: DEFAULT_APPEARANCE,
    normalizeAppearance: normalizeAppearance,
    emptyCosmetics: emptyCosmetics,
    normalize: normalize,
    titleLabel: titleLabel,
    titleColor: titleColor,
    resolveNameColor: resolveNameColor,
    paintNameplate: paintNameplate,
    applyItemEffect: applyItemEffect
  };
});
