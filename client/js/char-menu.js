// ============================================
// CHAR-MENU.JS — L2 C1 «Статус персонажа»
// Одно окно. Иконки-вкладки под заголовком:
//   Статус | Умения | Действия | Квесты
// Инвентарь — ОТДЕЛЬНО (I / кнопка инвентаря), не здесь.
// Рефы: 1/2/3/4/6.png · Alt+T / Alt+K / Alt+C / Alt+U
// ============================================

(function () {
  'use strict';

  /**
   * Вкладки меню статуса (иконки в шапке окна, как в C1).
   * Порядок как на рефах: персонаж → умения → действия → квесты
   */
  var TABS = [
    { id: 'status',  title: 'Статус',   icon: 'assets/hud/icon_status.webp',  hotkey: 'C' },
    { id: 'skills',  title: 'Умения',   icon: 'assets/hud/icon_skills.webp',  hotkey: 'K' },
    { id: 'actions', title: 'Действия', icon: 'assets/hud/icon_quest.webp',   hotkey: 'Alt+C' },
    { id: 'quest',   title: 'Задания',  icon: 'assets/hud/icon_map.webp',     hotkey: 'J' }
  ];

  // ─── Действия: Основные (Basic) — L2 C1 Actions ───
  // Иконки: assets/hud/actions/<id>.png (уникальные, brass frame)
  // DnD на skill bar: как активные скиллы (text/action-id → act:<id>)
  var ACT_ICO = 'assets/hud/actions/';
  var ACTIONS_BASIC = [
    { id: 'sit',       icon: ACT_ICO + 'sit.webp',       name: 'Сесть / Встать', desc: 'Отдых: повышенный реген HP/Пар.' },
    { id: 'run',       icon: ACT_ICO + 'run.webp',       name: 'Бег / Ходьба', desc: 'Переключить бег и ходьбу.' },
    { id: 'attack',    icon: ACT_ICO + 'attack.webp',    name: 'Атаковать', desc: 'Атака текущей цели.' },
    { id: 'pickup',    icon: ACT_ICO + 'pickup.webp',    name: 'Подобрать', desc: 'Подобрать лут рядом (ручной, сервер).' },
    { id: 'assist',    icon: ACT_ICO + 'assist.webp',    name: 'Ассист (цель союзника)', desc: 'Взять цель выбранного союзника.' },
    { id: 'next',      icon: ACT_ICO + 'next.webp',      name: 'Следующая цель', desc: 'Выбрать ближайшего врага.' },
    { id: 'trade',     icon: ACT_ICO + 'trade.webp',     name: 'Сделка с игроком', desc: 'Обмен предметами с игроком.' },
    { id: 'duel',      icon: ACT_ICO + 'attack.webp',    name: 'Дуэль', desc: 'Вызвать игрока на дуэль. Без кармы и дропа.' },
    { id: 'ps_sell',   icon: ACT_ICO + 'ps_sell.webp',   name: 'Личная лавка — продажа', desc: 'Private Store Sell: выставить предметы.' },
    { id: 'ps_buy',    icon: ACT_ICO + 'ps_buy.webp',    name: 'Личная лавка — покупка', desc: 'Private Store Buy: список покупок.' },
    { id: 'recommend', icon: ACT_ICO + 'recommend.webp', name: 'Рекомендовать', desc: 'Рекомендовать игрока.' },
    { id: 'block',     icon: ACT_ICO + 'block.webp',     name: 'Блок / Игнор', desc: 'Заблокировать игрока.' }
  ];

  var ACTIONS_PARTY = [
    { id: 'p_invite',  icon: ACT_ICO + 'p_invite.webp',  name: 'Пригласить в группу', desc: 'Пригласить в партию.' },
    { id: 'p_leave',   icon: ACT_ICO + 'p_leave.webp',   name: 'Покинуть группу', desc: 'Выйти из партии.' },
    { id: 'p_search',  icon: ACT_ICO + 'p_search.webp',  name: 'Поиск партии', desc: 'Поиск группы.' },
    { id: 'p_kick',    icon: ACT_ICO + 'p_kick.webp',    name: 'Исключить из группы', desc: 'Кик участника (лидер).' },
    { id: 'p_leader',  icon: ACT_ICO + 'p_leader.webp',  name: 'Передать лидера', desc: 'Передать лидерство.' },
    { id: 'p_dismiss', icon: ACT_ICO + 'p_dismiss.webp', name: 'Распустить группу', desc: 'Распустить партию.' }
  ];

  var ACTIONS_SOCIAL = [
    { id: 'bow',      icon: ACT_ICO + 'bow.webp',      name: 'Поклон', desc: 'Социальное: поклон.' },
    { id: 'wave',     icon: ACT_ICO + 'wave.webp',     name: 'Помахать', desc: 'Социальное: помахать.' },
    { id: 'laugh',    icon: ACT_ICO + 'laugh.webp',    name: 'Смех', desc: 'Социальное: смех.' },
    { id: 'cry',      icon: ACT_ICO + 'cry.webp',      name: 'Плач', desc: 'Социальное: плач.' },
    { id: 'dance',    icon: ACT_ICO + 'dance.webp',    name: 'Танец', desc: 'Социальное: танец.' },
    { id: 'applause', icon: ACT_ICO + 'applause.webp', name: 'Аплодисменты', desc: 'Социальное: аплодисменты.' },
    { id: 'charge',   icon: ACT_ICO + 'charge.webp',   name: 'Боевой клич', desc: 'Социальное: боевой клич.' },
    { id: 'no',       icon: ACT_ICO + 'no.webp',       name: 'Нет', desc: 'Социальное: нет.' },
    { id: 'yes',      icon: ACT_ICO + 'yes.webp',      name: 'Да', desc: 'Социальное: да.' },
    { id: 'salute',   icon: ACT_ICO + 'salute.webp',   name: 'Салют', desc: 'Социальное: салют.' },
    { id: 'charm',    icon: ACT_ICO + 'charm.webp',    name: 'Очаровать', desc: 'Социальное: очаровать.' },
    { id: 'shy',      icon: ACT_ICO + 'shy.webp',      name: 'Смущение', desc: 'Социальное: смущение.' }
  ];

  var ACTIONS_CLAN = [
    { id: 'clan_info',   icon: ACT_ICO + 'clan_info.webp',   name: 'Инфо клана', desc: 'Информация о клане.' },
    { id: 'clan_invite', icon: ACT_ICO + 'clan_invite.webp', name: 'Пригласить в клан', desc: 'Пригласить в клан.' },
    { id: 'clan_leave',  icon: ACT_ICO + 'clan_leave.webp',  name: 'Покинуть клан', desc: 'Покинуть клан.' },
    { id: 'clan_war',    icon: ACT_ICO + 'clan_war.webp',    name: 'Война кланов', desc: 'Объявить войну клану.' }
  ];

  /** Реестр всех действий (для skill bar / DnD). */
  var ACTION_BY_ID = {};
  [ACTIONS_BASIC, ACTIONS_PARTY, ACTIONS_SOCIAL, ACTIONS_CLAN].forEach(function (list) {
    list.forEach(function (a) { ACTION_BY_ID[a.id] = a; });
  });
  window.L2_ACTIONS = ACTION_BY_ID;
  window.L2_ACTION_PREFIX = 'act:';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /** PNG path → <img>; emoji / short label → <span class="ico"> */
  function skillIcoHtml(icon) {
    if (icon && typeof icon === 'string' &&
        (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
      return '<img class="l2cm-skill-ico" src="' + esc(icon) + '" alt="" draggable="false">';
    }
    return '<span class="ico">' + (icon || '⚙️') + '</span>';
  }

  function player() { return (window.game && window.game.player) || null; }
  function skillMgr() {
    var p = player();
    return (p && p.skillManager) || null;
  }
  function questMgr() { return (window.game && window.game.questManager) || null; }
  function inventory() { return (window.game && window.game.inventory) || null; }

  function statsPack() {
    var p = player();
    if (!p) {
      return {
        name: '—', level: 1, className: 'Оператор',
        hp: 100, maxHp: 100, energy: 50, maxEnergy: 50,
        exp: 0, expToNext: 100, sp: 0,
        pAtk: 10, pDef: 5, cAtk: 6, cDef: 5,
        accuracy: 20, evasion: 15, critRate: 15, speed: 120,
        atkSpd: 300, chargeSpd: 200,
        primary: { STR: 40, DEX: 30, CON: 43, INT: 21, WIT: 11, MEN: 25 },
        karma: 0, pk: 0, pvp: 0, load: 0, loadMax: 100
      };
    }
    var primary = p.primary;
    if (!primary && window.CLASS_SYSTEM && window.CLASS_SYSTEM.primaryAtLevel) {
      primary = window.CLASS_SYSTEM.primaryAtLevel(p.playerClass || 'operator', p.level || 1);
    }
    primary = primary || { STR: 40, DEX: 30, CON: 43, INT: 21, WIT: 11, MEN: 25 };
    var inv = inventory();
    return {
      name: p.name || 'Оператор',
      level: p.level || 1,
      className: p.className || 'Оператор',
      hp: Math.floor(p.hp || 0),
      maxHp: Math.floor(p.maxHp || 1),
      energy: Math.floor(p.energy || 0),
      maxEnergy: Math.floor(p.maxEnergy || 1),
      exp: p.exp || 0,
      expToNext: p.expToNext || (p.levelSystem && p.levelSystem.expToNext) || 100,
      sp: (p.levelSystem && p.levelSystem.sp != null) ? p.levelSystem.sp : (p.sp || 0),
      pAtk: p.pAtk != null ? p.pAtk : (p.attackPower || 10),
      pDef: p.pDef != null ? p.pDef : (p.defense || 5),
      cAtk: p.cAtk != null ? p.cAtk : (p.mAtk || 6),
      cDef: p.cDef != null ? p.cDef : (p.mDef || 5),
      accuracy: p.accuracy != null ? Math.floor(p.accuracy) : 20,
      evasion: p.evasion != null ? Math.floor(p.evasion) : 15,
      critRate: p.critRate != null ? Math.floor(p.critRate) : 44,
      speed: p.speedL2 != null ? Math.floor(p.speedL2) : Math.floor((p.moveSpeed || p.speed || 8) * 16),
      // C1 Atk.Spd from weapon base × DEX (player.atkSpdL2)
      atkSpd: p.atkSpdL2 != null ? Math.floor(p.atkSpdL2)
        : Math.floor(250 + ((primary.DEX || 20) * 4)),
      // Casting Spd (not weapon)
      chargeSpd: p.castingSpd != null ? Math.floor(p.castingSpd)
        : Math.floor(180 + ((primary.WIT || 15) * 3)),
      primary: primary,
      karma: p.karma || 0,
      pk: p.pk || 0,
      pvp: p.pvp || 0,
      load: inv && inv.weight != null ? inv.weight : 0,
      loadMax: inv && inv.maxWeight != null ? inv.maxWeight : 10000
    };
  }

  class CharacterMenu {
    constructor() {
      this.isOpen = false;
      this.activeTab = 'status';
      this.skillSub = 'active';   // active | passive
      this.actSub = 'basic';       // basic | clan
      this.questSub = 'desc';     // desc | item
      this.selectedQuest = null;
      this._drag = null;
      this._walking = false;
      this._build();
      this._bind();
    }

    _build() {
      this.root = document.createElement('div');
      this.root.id = 'l2-char-menu';
      this.root.className = 'l2cm-root';
      this.root.style.left = '36%';
      this.root.style.top = '14%';

      // 4 иконки как на рефе Status/Skills/Actions/Quest (НЕ инвентарь)
      var navHtml = TABS.map(function (t) {
        return '<button type="button" class="l2cm-nav-btn" data-tab="' + t.id + '" title="' +
          esc(t.title) + (t.hotkey ? ' (' + t.hotkey + ')' : '') + '">' +
          '<img src="' + t.icon + '" alt="' + esc(t.title) + '">' +
          '</button>';
      }).join('');

      this.root.innerHTML =
        '<div class="l2cm-titlebar" id="l2cm-titlebar">' +
        '  <span class="l2cm-title-text" id="l2cm-title">Статус</span>' +
        '  <button type="button" class="l2cm-close" id="l2cm-close" title="Закрыть">✕</button>' +
        '</div>' +
        '<div class="l2cm-nav" id="l2cm-nav">' + navHtml + '</div>' +
        '<div class="l2cm-body">' +
        '  <div class="l2cm-panel active" data-panel="status"  id="l2cm-panel-status"></div>' +
        '  <div class="l2cm-panel"        data-panel="skills"  id="l2cm-panel-skills"></div>' +
        '  <div class="l2cm-panel"        data-panel="actions" id="l2cm-panel-actions"></div>' +
        '  <div class="l2cm-panel"        data-panel="quest"   id="l2cm-panel-quest"></div>' +
        '</div>';

      document.body.appendChild(this.root);

      this.tip = document.createElement('div');
      this.tip.className = 'l2cm-tip';
      document.body.appendChild(this.tip);
    }

    _bind() {
      var self = this;
      document.getElementById('l2cm-close').addEventListener('click', function () { self.close(); });
      document.getElementById('l2cm-nav').addEventListener('click', function (e) {
        var btn = e.target.closest('.l2cm-nav-btn');
        if (!btn) return;
        self.open(btn.getAttribute('data-tab'));
      });

      var bar = document.getElementById('l2cm-titlebar');
      if (bar) {
        bar.style.cursor = 'grab';
        var onStart = function (cx, cy, target) {
          if (target.id === 'l2cm-close' || target.closest('button, a, input')) return;
          bar.style.cursor = 'grabbing';
          self._drag = { x: cx - self.root.offsetLeft, y: cy - self.root.offsetTop };
        };
        var onMove = function (cx, cy) {
          if (!self._drag) return;
          var w = window.innerWidth, h = window.innerHeight;
          var ew = self.root.offsetWidth || 280, eh = self.root.offsetHeight || 300;
          var left = Math.max(0, Math.min(w - ew, cx - self._drag.x));
          var top = Math.max(0, Math.min(h - eh, cy - self._drag.y));
          self.root.style.left = left + 'px';
          self.root.style.top = top + 'px';
        };
        var onEnd = function () {
          if (self._drag) {
            self._drag = null;
            bar.style.cursor = 'grab';
          }
        };
        bar.addEventListener('mousedown', function (e) { onStart(e.clientX, e.clientY, e.target); });
        window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
        window.addEventListener('mouseup', onEnd);

        bar.addEventListener('touchstart', function (e) {
          if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }, { passive: true });
        window.addEventListener('touchmove', function (e) {
          if (e.touches && e.touches.length === 1 && self._drag) onMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        window.addEventListener('touchend', onEnd);
      }

      window.addEventListener('keydown', function (e) {
        if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
        if (document.activeElement && document.activeElement.id === 'chat-input') return;
        if (e.key === 'Escape' && self.isOpen) { self.close(); return; }

        // Alt+T / Alt+K / Alt+C / Alt+U — как L2
        if (e.altKey && !e.ctrlKey) {
          var k = e.key.toLowerCase();
          if (k === 't' || k === 'е') { e.preventDefault(); self.toggle('status'); }
          if (k === 'k' || k === 'л') { e.preventDefault(); self.toggle('skills'); }
          if (k === 'c' || k === 'с') { e.preventDefault(); self.toggle('actions'); }
          if (k === 'u' || k === 'г') { e.preventDefault(); self.toggle('quest'); }
          return;
        }
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        var k2 = e.key.toLowerCase();
        // C без Alt = статус (кнопка HUD)
        if (k2 === 'c' || k2 === 'с') { e.preventDefault(); self.toggle('status'); }
        if (k2 === 'k' || k2 === 'л') { e.preventDefault(); self.toggle('skills'); }
        if (k2 === 'j' || k2 === 'о') { e.preventDefault(); self.toggle('quest'); }
      });
    }

    toggle(tab) {
      if (this.isOpen && this.activeTab === (tab || this.activeTab)) this.close();
      else this.open(tab || this.activeTab);
    }

    open(tab) {
      this.activeTab = tab || this.activeTab || 'status';
      this.isOpen = true;
      this.root.classList.add('open');
      this.render();
    }

    close() {
      this.isOpen = false;
      this.root.classList.remove('open');
      this.hideTip();
    }

    _syncNav() {
      var title = 'Статус';
      for (var i = 0; i < TABS.length; i++) {
        if (TABS[i].id === this.activeTab) {
          title = TABS[i].title;
          break;
        }
      }
      // Подписи заголовка: «Умения (Alt+K)» и т.п.
      var suffix = '';
      if (this.activeTab === 'skills') suffix = ' (Alt+K)';
      if (this.activeTab === 'actions') suffix = ' (Alt+C)';
      if (this.activeTab === 'quest') suffix = ' (Alt+U)';
      if (this.activeTab === 'status') suffix = ' (Alt+T)';
      var te = document.getElementById('l2cm-title');
      if (te) te.textContent = title + suffix;

      var self = this;
      this.root.querySelectorAll('.l2cm-nav-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === self.activeTab);
      });
      this.root.querySelectorAll('.l2cm-panel').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-panel') === self.activeTab);
      });
    }

    render() {
      this._syncNav();
      if (this.activeTab === 'status') this.renderStatus();
      else if (this.activeTab === 'skills') this.renderSkills();
      else if (this.activeTab === 'actions') this.renderActions();
      else if (this.activeTab === 'quest') this.renderQuest();
    }

    // ═══════════════════════════════════════
    //  СТАТУС (1.png)
    // ═══════════════════════════════════════
    renderStatus() {
      var el = document.getElementById('l2cm-panel-status');
      if (!el) return;
      var s = statsPack();
      var expPct = Math.min(100, (s.exp / Math.max(1, s.expToNext)) * 100);
      var hpPct = Math.min(100, (s.hp / Math.max(1, s.maxHp)) * 100);
      var mpPct = Math.min(100, (s.energy / Math.max(1, s.maxEnergy)) * 100);
      var loadPct = Math.min(100, (s.load / Math.max(1, s.loadMax)) * 100);
      var pr = s.primary;

      el.innerHTML =
        '<div class="l2cm-name">' + esc(s.name) + '</div>' +
        '<div class="l2cm-line"><span class="muted">Клан</span><span class="val">Нет клана</span></div>' +
        '<div class="l2cm-line"><span>Ур. ' + s.level + ' ' + esc(s.className) + '</span></div>' +
        '<div class="l2cm-bars">' +
        '  <div class="l2cm-bar-row"><span class="l2cm-bar-lab exp">EXP</span>' +
        '    <div class="l2cm-bar-track exp"><div class="l2cm-bar-fill exp" style="width:' + expPct + '%"></div>' +
        '    <span class="l2cm-bar-txt">' + expPct.toFixed(2) + '%</span></div></div>' +
        '  <div class="l2cm-bar-row"><span class="l2cm-bar-lab hp">HP</span>' +
        '    <div class="l2cm-bar-track"><div class="l2cm-bar-fill hp" style="width:' + hpPct + '%"></div>' +
        '    <span class="l2cm-bar-txt">' + s.hp + '/' + s.maxHp + '</span></div></div>' +
        '  <div class="l2cm-bar-row"><span class="l2cm-bar-lab mp">Пар</span>' +
        '    <div class="l2cm-bar-track"><div class="l2cm-bar-fill mp" style="width:' + mpPct + '%"></div>' +
        '    <span class="l2cm-bar-txt">' + s.energy + '/' + s.maxEnergy + '</span></div></div>' +
        '</div>' +
        '<div class="l2cm-line"><span>SP <b class="val">' + s.sp + '</b></span>' +
        '<span>Вес ' + loadPct.toFixed(1) + '%</span></div>' +
        '<div class="l2cm-section"><div class="l2cm-section-title">Бой</div>' +
        '<div class="l2cm-stats-grid">' +
        this._stat('Удар', s.pAtk) + this._stat('Схемы', s.cAtk) +
        this._stat('Броня', s.pDef) + this._stat('Контур', s.cDef) +
        this._stat('Меткость', s.accuracy) + this._stat('Уклон.', s.evasion) +
        this._stat('Крит', s.critRate) + this._stat('Скор.', s.speed) +
        this._stat('Атк.ск.', s.atkSpd) + this._stat('Заряд', s.chargeSpd) +
        '</div></div>' +
        '<div class="l2cm-section"><div class="l2cm-section-title">Базовые</div>' +
        '<div class="l2cm-basic-grid">' +
        this._stat('STR', pr.STR) + this._stat('DEX', pr.DEX) + this._stat('CON', pr.CON) +
        this._stat('INT', pr.INT) + this._stat('WIT', pr.WIT) + this._stat('MEN', pr.MEN) +
        '</div></div>' +
        '<div class="l2cm-section"><div class="l2cm-section-title">Социальные</div>' +
        '<div class="l2cm-line"><span>Карма</span><span class="val">' + s.karma + '</span></div>' +
        '<div class="l2cm-line"><span>PvP/PK</span><span class="val">' + s.pvp + ' / ' + s.pk + '</span></div>' +
        '</div>';
    }

    _stat(label, val) {
      return '<div class="row"><span>' + esc(label) + '</span><b>' + esc(val) + '</b></div>';
    }

    // ═══════════════════════════════════════
    //  УМЕНИЯ — Active | Passive (2.png / 3.png)
    // ═══════════════════════════════════════
    renderSkills() {
      var el = document.getElementById('l2cm-panel-skills');
      if (!el) return;
      var self = this;
      var sm = skillMgr();
      var learned = sm && sm.getLearnedSkills ? sm.getLearnedSkills() : [];
      var isPassive = this.skillSub === 'passive';
      var filtered = learned.filter(function (s) {
        var t = s.type;
        if (isPassive) return t === 'passive' || t === (window.SKILL_TYPES && SKILL_TYPES.PASSIVE);
        return t === 'active' || t === 'toggle' ||
          t === (window.SKILL_TYPES && SKILL_TYPES.ACTIVE) ||
          t === (window.SKILL_TYPES && SKILL_TYPES.TOGGLE);
      });

      var cells = '';
      var total = 48;
      var pl = (typeof player === 'function') ? player() : null;
      for (var i = 0; i < total; i++) {
        var sk = filtered[i];
        if (sk) {
          var tipName = sk.name || '';
          var lvl = sk.currentLevel != null ? sk.currentLevel : 1;
          if (sk.currentLevel != null) {
            tipName += '  Ур.' + sk.currentLevel + '/' + (sk.maxLevel || 1);
          }
          // Пар + радиус (+ подготовка/КД) — всегда в тултипе
          var tipDesc = sk.description || '';
          if (typeof formatSkillStatsLine === 'function') {
            tipDesc = formatSkillStatsLine(sk, lvl, pl, true);
          } else {
            var parts = [];
            if (tipDesc) parts.push(tipDesc);
            if (sk.energyCost != null) parts.push('Пар: ' + sk.energyCost);
            if (sk.range != null) parts.push('Радиус: ' + sk.range + ' м');
            if (sk.cooldown) parts.push('Перезарядка: ' + sk.cooldown + ' с');
            tipDesc = parts.join(' · ');
          }
          cells += '<div class="l2cm-slot filled" draggable="true" data-skill="' + esc(sk.id) +
            '" data-name="' + esc(tipName) + '" data-desc="' + esc(tipDesc) + '">' +
            skillIcoHtml(sk.icon) + '</div>';
        } else {
          cells += '<div class="l2cm-slot empty"></div>';
        }
      }

      el.innerHTML =
        '<div class="l2cm-subtabs">' +
        '  <button type="button" class="l2cm-subtab' + (this.skillSub === 'active' ? ' active' : '') + '" data-sksub="active">Активные</button>' +
        '  <button type="button" class="l2cm-subtab' + (this.skillSub === 'passive' ? ' active' : '') + '" data-sksub="passive">Пассивные</button>' +
        '</div>' +
        '<div class="l2cm-slots l2cm-skill-grid" id="l2cm-skill-grid">' + cells + '</div>' +
        '<div class="l2cm-line muted l2cm-skill-hint">Перетащите на панель 1–0 · двойной клик — в свободный слот</div>';

      el.querySelectorAll('[data-sksub]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.skillSub = b.getAttribute('data-sksub');
          self.renderSkills();
        });
      });
      el.querySelectorAll('[data-skill]').forEach(function (slot) {
        var id = slot.getAttribute('data-skill');
        var name = slot.getAttribute('data-name');
        var desc = slot.getAttribute('data-desc');
        var img = slot.querySelector('img');
        var iconUrl = img ? img.src : '';

        slot.addEventListener('mouseenter', function (e) {
          self.showTip(e, name, desc);
        });
        slot.addEventListener('mouseleave', function () { self.hideTip(); });
        slot.addEventListener('mousemove', function (e) {
          if (!self.tip || !self.tip.classList.contains('show')) return;
          self.tip.style.left = (e.clientX + 12) + 'px';
          self.tip.style.top = (e.clientY + 12) + 'px';
        });

        // Desktop HTML5 dragstart
        slot.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/skill-id', id);
          self.hideTip();
        });

        // Double click / Double tap to auto-place into active row
        slot.addEventListener('dblclick', function () {
          var skillsUI = window.game && window.game.skillsUI;
          var touchControls = window.game && window.game.touchControls;
          if (skillsUI) {
            var activeRow = (touchControls && touchControls.activeMobileBar) || 0;
            var row = skillsUI.bars[activeRow] || [];
            var empty = -1;
            for (var k = 0; k < 4; k++) {
              if (!row[k]) { empty = k; break; }
            }
            if (empty < 0) {
              empty = row.findIndex(function (x) { return !x; });
            }
            if (empty >= 0) {
              skillsUI.assignSkill(activeRow, empty, id);
              if (touchControls) touchControls.updateSkillSlots();
              if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Умение «' + name + '» назначено в слот ' + (empty + 1), 'system');
              }
            }
          }
        });

        // Touch Drag & Tap-to-Equip support
        self._bindSlotTouchDrag(slot, 'skill', id, name, iconUrl);
      });
    }

    // ═══════════════════════════════════════
    //  ДЕЙСТВИЯ — Basic | Clan + Party + Social (4.png)
    // ═══════════════════════════════════════
    renderActions() {
      var el = document.getElementById('l2cm-panel-actions');
      if (!el) return;
      var self = this;

      function grid(list) {
        return list.map(function (a) {
          return '<div class="l2cm-slot filled" draggable="true" data-act="' + a.id +
            '" data-name="' + esc(a.name) + '" data-desc="' + esc(a.desc || '') + '">' +
            skillIcoHtml(a.icon) + '</div>';
        }).join('');
      }

      el.innerHTML =
        '<div class="l2cm-subtabs">' +
        '  <button type="button" class="l2cm-subtab' + (this.actSub === 'basic' ? ' active' : '') + '" data-actsub="basic">Основные</button>' +
        '  <button type="button" class="l2cm-subtab' + (this.actSub === 'clan' ? ' active' : '') + '" data-actsub="clan">Клан</button>' +
        '</div>' +
        (this.actSub === 'basic'
          ? ('<div class="l2cm-act-block"><h4>Основные</h4><div class="l2cm-act-grid">' + grid(ACTIONS_BASIC) + '</div></div>' +
             '<div class="l2cm-act-block"><h4>Группа</h4><div class="l2cm-act-grid">' + grid(ACTIONS_PARTY) + '</div></div>' +
             '<div class="l2cm-act-block"><h4>Социальные</h4><div class="l2cm-act-grid">' + grid(ACTIONS_SOCIAL) + '</div></div>' +
             '<div class="l2cm-line muted l2cm-skill-hint">Перетащите на панель 1–0 · двойной клик — в свободный слот</div>')
          : ('<div class="l2cm-act-block"><h4>Клан</h4>' +
             '<div class="l2cm-line muted">Вступление в клан, склад, война — появится с гильдиями.</div>' +
             '<div class="l2cm-act-grid">' + grid(ACTIONS_CLAN) + '</div>' +
             '<div class="l2cm-line muted l2cm-skill-hint">Перетащите на панель 1–0</div></div>'));

      el.querySelectorAll('[data-actsub]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.actSub = b.getAttribute('data-actsub');
          self.renderActions();
        });
      });
      el.querySelectorAll('[data-act]').forEach(function (slot) {
        var id = slot.getAttribute('data-act');
        var name = slot.getAttribute('data-name');
        var desc = slot.getAttribute('data-desc');
        var img = slot.querySelector('img');
        var iconUrl = img ? img.src : '';

        slot.addEventListener('mouseenter', function (e) {
          self.showTip(e, name, desc);
        });
        slot.addEventListener('mouseleave', function () { self.hideTip(); });
        slot.addEventListener('mousemove', function (e) {
          if (!self.tip || !self.tip.classList.contains('show')) return;
          self.tip.style.left = (e.clientX + 12) + 'px';
          self.tip.style.top = (e.clientY + 12) + 'px';
        });

        // Desktop HTML5 dragstart
        slot.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/action-id', id);
          e.dataTransfer.setData('text/plain', 'act:' + id);
          e.dataTransfer.effectAllowed = 'copy';
          self.hideTip();
        });

        // Double click / Double tap to auto-place into active row
        slot.addEventListener('dblclick', function () {
          var skillsUI = window.game && window.game.skillsUI;
          var touchControls = window.game && window.game.touchControls;
          if (skillsUI) {
            var activeRow = (touchControls && touchControls.activeMobileBar) || 0;
            var row = skillsUI.bars[activeRow] || [];
            var empty = -1;
            for (var k = 0; k < 4; k++) {
              if (!row[k]) { empty = k; break; }
            }
            if (empty < 0) {
              empty = row.findIndex(function (x) { return !x; });
            }
            if (empty >= 0) {
              skillsUI.assignAction(activeRow, empty, id);
              if (touchControls) touchControls.updateSkillSlots();
              if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Действие «' + name + '» назначено в слот ' + (empty + 1), 'system');
              }
            }
          }
        });

        // Touch Drag & Tap-to-Equip support
        self._bindSlotTouchDrag(slot, 'action', id, name, iconUrl);
      });
    }

    _bindSlotTouchDrag(slot, type, id, name, iconUrl) {
      var self = this;
      var isDragging = false;
      var ghost = null;
      var startX = 0, startY = 0;
      var hasMoved = false;

      var onPointerDown = function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        startY = e.clientY;
        hasMoved = false;
        isDragging = true;

        var onPointerMove = function (me) {
          if (!isDragging) return;
          var dist = Math.hypot(me.clientX - startX, me.clientY - startY);
          if (dist > 8) {
            hasMoved = true;
            if (!ghost) {
              ghost = document.createElement('div');
              ghost.className = 'l2-touch-drag-ghost';
              ghost.style.cssText = 'position:fixed;width:48px;height:48px;border-radius:50%;border:2px solid #ffcc66;box-shadow:0 0 16px rgba(255,180,40,0.8);background:#1a140c;pointer-events:none;z-index:100000;display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);overflow:hidden;';
              ghost.innerHTML = iconUrl ? ('<img src="' + iconUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">') : ('<span style="color:#ffcc66;font-size:11px;">' + esc(name) + '</span>');
              document.body.appendChild(ghost);
              document.body.classList.add('l2-dragging-skill');
            }
            ghost.style.left = me.clientX + 'px';
            ghost.style.top = me.clientY + 'px';

            var hovered = document.elementFromPoint(me.clientX, me.clientY);
            var targetSlot = hovered && hovered.closest('.mobile-skill-slot, .l2-skill-slot');
            document.querySelectorAll('.slot-drag-hover').forEach(function (el) { el.classList.remove('slot-drag-hover'); });
            if (targetSlot) targetSlot.classList.add('slot-drag-hover');
          }
        };

        var onPointerUp = function (ue) {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
          document.body.classList.remove('l2-dragging-skill');
          document.querySelectorAll('.slot-drag-hover').forEach(function (el) { el.classList.remove('slot-drag-hover'); });

          if (ghost) {
            ghost.remove();
            ghost = null;
          }

          if (isDragging && hasMoved) {
            var dropElem = document.elementFromPoint(ue.clientX, ue.clientY);
            var mobSlot = dropElem && dropElem.closest('.mobile-skill-slot');
            var deskSlot = dropElem && dropElem.closest('.l2-skill-slot');
            var skillsUI = window.game && window.game.skillsUI;
            var touchControls = window.game && window.game.touchControls;

            if (mobSlot && skillsUI) {
              var slotIdx = parseInt(mobSlot.getAttribute('data-index') || '0', 10);
              var activeRow = (touchControls && touchControls.activeMobileBar) || 0;
              if (type === 'action') skillsUI.assignAction(activeRow, slotIdx, id);
              else skillsUI.assignSkill(activeRow, slotIdx, id);
              if (touchControls) touchControls.updateSkillSlots();
              if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('«' + name + '» назначено в слот ' + (slotIdx + 1), 'system');
              }
            } else if (deskSlot && skillsUI) {
              var dSlotIdx = parseInt(deskSlot.getAttribute('data-index') || '0', 10);
              var dRow = parseInt(deskSlot.getAttribute('data-row') || '0', 10);
              if (type === 'action') skillsUI.assignAction(dRow, dSlotIdx, id);
              else skillsUI.assignSkill(dRow, dSlotIdx, id);
            }
          }
          isDragging = false;
        };

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerUp, { passive: true });
      };

      slot.addEventListener('pointerdown', onPointerDown);

      // Tap-to-Select / Tap-to-Equip support
      slot.addEventListener('click', function (e) {
        if (hasMoved) return;
        var prev = window.touchSelectedSkill;
        if (prev && prev.id === id) {
          window.touchSelectedSkill = null;
          document.querySelectorAll('.l2cm-slot.selected-for-assign').forEach(function (el) { el.classList.remove('selected-for-assign'); });
          document.querySelectorAll('.slot-assign-ready').forEach(function (el) { el.classList.remove('slot-assign-ready'); });
        } else {
          window.touchSelectedSkill = { type: type, id: id, name: name, iconUrl: iconUrl };
          document.querySelectorAll('.l2cm-slot.selected-for-assign').forEach(function (el) { el.classList.remove('selected-for-assign'); });
          slot.classList.add('selected-for-assign');
          document.querySelectorAll('.mobile-skill-slot, .l2-skill-slot').forEach(function (el) { el.classList.add('slot-assign-ready'); });
          if (window.game && window.game.addChatMessage) {
            window.game.addChatMessage('«' + name + '» выбрано — нажмите на любой слот панели, чтобы назначить.', 'system');
          }
        }
      });
    }

    _doAction(id) {
      var g = window.game;
      if (!g) return;
      var p = g.player;
      var msg = g.addChatMessage ? g.addChatMessage.bind(g) : function () {};

      switch (id) {
        case 'attack':
          if (p && p.attack) p.attack();
          break;
        case 'sit':
          if (p && typeof p.toggleSit === 'function') {
            p.toggleSit();
          } else {
            msg('Отдых: реген HP/Пар повышен.', 'system');
          }
          break;
        case 'run':
          this._walking = !this._walking;
          if (p) {
            if (typeof p.setWalkingMode === 'function') {
              p.setWalkingMode(this._walking);
            } else {
              if (p._baseMoveSpeed == null) p._baseMoveSpeed = p.moveSpeed || 8;
              p.isWalking = this._walking;
              p.moveSpeed = this._walking ? p._baseMoveSpeed * 0.55 : p._baseMoveSpeed;
              if (p.isMoving && typeof p.playLocoAnim === 'function') p.playLocoAnim();
            }
          }
          msg(this._walking ? 'Режим: ходьба' : 'Режим: бег', 'system');
          break;
        case 'pickup': {
          // Server-auth pickup for all nearby loot piles in range
          const lm = g.lootManager;
          if (!lm || !g.player || !g.player.mesh) {
            msg('Лут недоступен.', 'system');
            break;
          }
          const pp = g.player.mesh.position;
          const range = (typeof DROP_CONFIG !== 'undefined' && DROP_CONFIG.AUTO_LOOT_RANGE) || 4.5;
          let n = 0;
          (lm.groundItems || []).forEach((gi) => {
            if (!gi || !gi.mesh) return;
            if (gi.mesh.position.distanceTo(pp) <= range) {
              lm.requestPickup(gi);
              n++;
            }
          });
          msg(n ? ('Подбор: запрос на ' + n + ' шт. (сервер)') : 'Рядом нет лута.', 'system');
          break;
        }
        case 'assist':
          msg('Ассист: цель союзника станет вашей целью.', 'system');
          break;
        case 'next':
          this._nextTarget();
          break;
        case 'trade': {
          // Кнопка была заглушкой с подсказкой; обмен появился в 2.2.
          const tt = g.player && g.player.target;
          if (tt && tt.pid != null && g.net && g.net.intentTradeOffer) {
            g.net.intentTradeOffer(tt.pid);
            msg('Предложение обмена отправлено: ' + (tt.name || 'игроку') + '.', 'system');
          } else {
            msg('Сделка: выберите игрока в таргет или введите /trade Имя.', 'system');
          }
          break;
        }
        case 'duel': {
          const td = g.player && g.player.target;
          if (td && td.pid != null && g.net && g.net.intentDuelOffer) {
            g.net.intentDuelOffer(td.pid);
            msg('Вызов на дуэль: ' + (td.name || 'игроку') + '.', 'system');
          } else {
            msg('Дуэль: выберите игрока в таргет или введите /duel Имя.', 'system');
          }
          break;
        }
        // L2 Private Store: Sell / Buy (не NPC-торговец)
        case 'ps_sell':
          if (window.game && window.game.privateStore && window.game.privateStore.openSell) {
            window.game.privateStore.openSell();
          } else {
            msg('Личная лавка (продажа) недоступна.', 'system');
          }
          break;
        case 'ps_buy':
          if (window.game && window.game.privateStore && window.game.privateStore.openBuy) {
            window.game.privateStore.openBuy();
          } else {
            msg('Личная лавка (покупка) недоступна.', 'system');
          }
          break;
        case 'p_invite': {
          const t = g.player && g.player.target;
          if (t && (t.pid != null || t.type === 'p')) {
            if (g.net && t.pid) {
              g.net.intentPartyInvite(t.pid);
              msg('Приглашение в группу отправлено: ' + (t.name || 'игроку') + '.', 'system');
            }
          } else {
            msg('Выберите игрока в таргет или используйте /invite Имя', 'system');
          }
          break;
        }
        case 'p_leave':
          if (g.net && g.net.intentPartyLeave) {
            g.net.intentPartyLeave();
            msg('Вы вышли из группы.', 'system');
          } else {
            msg('Вы не в группе.', 'system');
          }
          break;
        case 'p_search':
          msg('Поиск партии — в разработке.', 'system');
          break;
        case 'p_kick': {
          const t = g.player && g.player.target;
          if (t && t.pid && g.net && g.net.intentPartyKick) {
            g.net.intentPartyKick(t.pid);
          } else {
            msg('Исключить: выберите члена группы в таргет.', 'system');
          }
          break;
        }
        case 'p_leader': {
          const t = g.player && g.player.target;
          if (t && t.pid && g.net && g.net.intentPartyLeader) {
            g.net.intentPartyLeader(t.pid);
          } else {
            msg('Передать лидера: выберите сопартийца в таргет.', 'system');
          }
          break;
        }
        case 'p_dismiss':
          if (g.net && g.net.intentPartyDismiss) g.net.intentPartyDismiss();
          else if (g.net && g.net.intentPartyLeave) g.net.intentPartyLeave();
          break;
        // Social emotes (L2) — сообщение + будущая анимация
        case 'bow':
        case 'wave':
        case 'laugh':
        case 'cry':
        case 'dance':
        case 'applause':
        case 'charge':
        case 'no':
        case 'yes':
        case 'salute':
        case 'charm':
        case 'shy': {
          var act = ACTION_BY_ID[id];
          msg((p && p.name ? p.name : 'Вы') + ': *' + (act ? act.name : id) + '*', 'system');
          break;
        }
        default:
          if (id === 'clan_info') {
            if (g.clanUI && g.clanUI.open) g.clanUI.open();
            else if (g.net && g.net.intentClanInfo) g.net.intentClanInfo();
          } else if (id === 'clan_invite') {
            const t = g.player && g.player.target;
            if (t && t.name && g.net && g.net.intentClanInvite) g.net.intentClanInvite(t.name);
            else msg('Пригласить в клан: выберите игрока в таргет.', 'system');
          } else if (id === 'clan_leave') {
            if (g.net && g.net.intentClanLeave) g.net.intentClanLeave();
          } else if (id === 'clan_war') {
            msg('Война кланов — вне границ 1–20.', 'system');
          } else if (ACTION_BY_ID[id]) msg(ACTION_BY_ID[id].name, 'system');
          else msg('«' + id + '»', 'system');
      }
    }

    _nextTarget() {
      var g = window.game;
      if (!g || !g.player || !g.player.mesh) return;
      var enemies = (g.spawnManager && g.spawnManager.enemies) || [];
      if (!enemies.length && g.net && g.net.remote) {
        // online mobs if any
      }
      var pos = g.player.mesh.position;
      var best = null;
      var bestD = Infinity;
      var cur = g.player.target;
      enemies.forEach(function (e) {
        if (!e || !e.mesh || e.isDying || e.dead) return;
        if (cur && e === cur) return;
        var d = pos.distanceTo(e.mesh.position);
        if (d < bestD && d < 40) { bestD = d; best = e; }
      });
      if (best) {
        g.player.target = best;
        if (g.ui && g.ui.showTargetStatus) g.ui.showTargetStatus(best);
        if (g.addChatMessage) g.addChatMessage('Цель: ' + (best.name || 'враг'), 'system');
      } else if (g.addChatMessage) {
        g.addChatMessage('Нет целей рядом.', 'system');
      }
    }

    // ═══════════════════════════════════════
    //  КВЕСТЫ — список + Описание | Предмет (5/6.png)
    // ═══════════════════════════════════════
    renderQuest() {
      var el = document.getElementById('l2cm-panel-quest');
      if (!el) return;
      var self = this;
      var qm = questMgr();
      var list = [];

      if (qm && qm.quests) {
        Object.keys(qm.quests).forEach(function (id) {
          var q = qm.quests[id];
          if (!q) return;
          var tpl = q.template || (typeof QUEST_DATABASE !== 'undefined' && QUEST_DATABASE[id]) || null;
          // Прогресс приходит с сервера в пакете `quests` — показываем его
          // строкой под описанием (раньше цели вообще не отображались).
          var progress = '';
          if (tpl && Array.isArray(tpl.objectives) && Array.isArray(q.progress)) {
            progress = tpl.objectives.map(function (o, i) {
              return '• ' + (o.description || o.type) + ': ' + (q.progress[i] | 0) + '/' + o.count;
            }).join('\n');
          }
          var doneMark = q.state === 'completable' ? ' ✔' : '';
          list.push({
            id: id,
            name: ((tpl && tpl.name) || q.name || id) + doneMark,
            desc: ((tpl && tpl.description) || q.description || 'Нет описания.') +
              (progress ? ('\n\n' + progress) : ''),
            state: q.state
          });
        });
      }
      if (!list.length) {
        list.push({
          id: '_none',
          name: 'Нет принятых заданий',
          desc: 'Поговорите с NPC в Деревне поющей стали, чтобы взять задание.',
          state: ''
        });
      }
      if (!this.selectedQuest || !list.some(function (x) { return x.id === self.selectedQuest; })) {
        this.selectedQuest = list[0].id;
      }
      var cur = list.filter(function (x) { return x.id === self.selectedQuest; })[0] || list[0];

      var listHtml = list.map(function (q) {
        return '<div class="l2cm-quest-item' + (q.id === self.selectedQuest ? ' active' : '') +
          '" data-qid="' + esc(q.id) + '">' + esc(q.name) + '</div>';
      }).join('');

      var itemCells = '';
      for (var i = 0; i < 24; i++) itemCells += '<div class="l2cm-slot empty"></div>';

      el.innerHTML =
        '<div class="l2cm-section-title">Принятые задания</div>' +
        '<div class="l2cm-quest-list">' + listHtml + '</div>' +
        '<div class="l2cm-subtabs">' +
        '  <button type="button" class="l2cm-subtab' + (this.questSub === 'desc' ? ' active' : '') + '" data-qsub="desc">Описание</button>' +
        '  <button type="button" class="l2cm-subtab' + (this.questSub === 'item' ? ' active' : '') + '" data-qsub="item">Предмет</button>' +
        '</div>' +
        (this.questSub === 'desc'
          ? '<div class="l2cm-quest-desc">' + esc(cur.desc) + '</div>'
          : '<div class="l2cm-slots cols-8">' + itemCells + '</div>');

      el.querySelectorAll('[data-qid]').forEach(function (row) {
        row.addEventListener('click', function () {
          self.selectedQuest = row.getAttribute('data-qid');
          self.renderQuest();
        });
      });
      el.querySelectorAll('[data-qsub]').forEach(function (b) {
        b.addEventListener('click', function () {
          self.questSub = b.getAttribute('data-qsub');
          self.renderQuest();
        });
      });
    }

    showTip(e, name, desc) {
      if (!name) return;
      // formatSkillStatsLine: «описание · Пар: N · Радиус: …»
      var body = desc || '';
      var statsHtml = '';
      var sep = body.indexOf(' · Пар:');
      if (sep < 0) sep = body.indexOf('· Пар:');
      if (sep >= 0) {
        var main = body.slice(0, sep).trim();
        var stats = body.slice(sep).replace(/^\s*·\s*/, '').trim();
        body = main;
        if (stats) statsHtml = '<div class="tip-stats">' + esc(stats) + '</div>';
      }
      this.tip.innerHTML = '<div class="tip-name">' + esc(name) + '</div>' +
        (body ? '<div class="tip-desc">' + esc(body) + '</div>' : '') +
        statsHtml;
      this.tip.classList.add('show');
      this.tip.style.left = (e.clientX + 12) + 'px';
      this.tip.style.top = (e.clientY + 12) + 'px';
    }

    hideTip() {
      this.tip.classList.remove('show');
    }

    update() {
      if (this.isOpen && this.activeTab === 'status') this.renderStatus();
    }
  }

  window.CharacterMenu = CharacterMenu;
})();
