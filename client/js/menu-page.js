// ============================================================
//  MENU-PAGE.JS — title screen (без Three.js / game boot)
//  Без сервера: «недоступен» + пустой рейтинг. «Подключиться» → game.html.
// ============================================================
(function () {
  'use strict';

  var I18N = {
    ru: {
      title: 'ОСТРОВ СТАЛИ',
      subtitle: 'ИСТОКИ',
      connect: 'Подключиться',
      connecting: 'Подключение…',
      options: 'Настройки',
      rank: 'Рейтинг',
      rankClose: 'Скрыть рейтинг',
      back: 'Назад',
      optionsTitle: 'Настройки',
      perfTitle: '⚡ Производительность',
      perfLow: 'Низкие',
      perfMed: 'Средние',
      perfHigh: 'Высокие',
      shadowTitle: 'Динамические тени:',
      shadowOff: 'Выкл',
      shadowLow: 'Низкие (45м)',
      shadowMed: 'L2 Оптимально (75м)',
      shadowHigh: 'Ультра (140м)',
      soundTitle: '🔊 Звук',
      sfxTitle: 'Эффекты',
      bgmTitle: 'Музыка',
      muteLabel: 'Без звука',
      copy: '© Остров Стали. Все права защищены.',
      online: 'Сервер онлайн',
      unavailable: 'Сервер недоступен',
      checking: 'Проверка сервера…',
      board: 'Рейтинг',
      colName: 'Имя',
      colLv: 'Ур.',
      colScore: 'Очки',
      empty: 'Нет данных',
      errOffline: 'Сервер недоступен. Подключение невозможно.',
      keyTitle: 'Вход в игру',
      keyDesc: 'Введите ваш секретный ключ (только английские буквы, цифры и символы):',
      keyPlaceholder: 'Ключ (англ. буквы и символы)',
      keySubmit: 'Войти в игру',
      keyTip: '💡 Только английские буквы, цифры и спецсимволы (без русских букв). Введя ключ на любом ПК или браузере, вы продолжите игру (строго в 1 окно).',
      keySwitch: 'Сменить ключ / Выйти',
      keyDirect: '🔑 Вход по ключу',
      keyErrShort: 'Ключ должен быть не менее 4 символов',
      keyErrChars: 'Только английские буквы, цифры и символы (без русских букв)',
      keySuccessNew: '🎉 Новый аккаунт создан!',
      keySuccessLogin: '✅ Добро пожаловать!',
      keyErrGeneric: 'Ошибка входа по ключу'
    },
    en: {
      title: 'STEEL ISLAND',
      subtitle: 'ORIGINS',
      connect: 'Connect',
      connecting: 'Connecting…',
      options: 'Options',
      rank: 'Ranking',
      rankClose: 'Hide ranking',
      back: 'Back',
      optionsTitle: 'Settings',
      perfTitle: '⚡ Performance',
      perfLow: 'Low',
      perfMed: 'Medium',
      perfHigh: 'High',
      shadowTitle: 'Dynamic Shadows:',
      shadowOff: 'Off',
      shadowLow: 'Low (45m)',
      shadowMed: 'Medium (75m)',
      shadowHigh: 'Ultra (140m)',
      soundTitle: '🔊 Audio',
      sfxTitle: 'SFX Volume',
      bgmTitle: 'Music Volume',
      muteLabel: 'Mute All',
      copy: '© Steel Island. All Rights Reserved.',
      online: 'Server online',
      unavailable: 'Server unavailable',
      checking: 'Checking server…',
      board: 'Ranking',
      colName: 'Name',
      colLv: 'Lv.',
      colScore: 'Score',
      empty: 'No data',
      errOffline: 'Server unavailable. Cannot connect.',
      keyTitle: 'Game Login',
      keyDesc: 'Enter your secret key (English letters, numbers and symbols only):',
      keyPlaceholder: 'Key (English chars & symbols only)',
      keySubmit: 'Enter Game',
      keyTip: '💡 English letters, numbers and symbols only (no Russian letters). Entering it on any PC or browser restores your progress (strictly 1 window).',
      keySwitch: 'Change Key / Logout',
      keyDirect: '🔑 Enter Key',
      keyErrShort: 'Key must be at least 4 characters',
      keyErrChars: 'Only English letters, numbers and symbols allowed (no Russian letters)',
      keySuccessNew: '🎉 New account created!',
      keySuccessLogin: '✅ Welcome back!',
      keyErrGeneric: 'Key login error'
    }
  };

  var lang = localStorage.getItem('ps_menu_lang') === 'en' ? 'en' : 'ru';
  var serverOnline = false;
  var connecting = false;
  var pollTimer = null;
  var boardOpen = false;
  var keyModalOpen = false;

  function t(k) {
    return (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;
  }

  var PROD_HOST = '93.77.168.135';
  var PROD_SSL_HOST = '93.77.168.135.sslip.io';

  function cleanHostStr(h) {
    if (!h) return (location.protocol === 'https:' ? PROD_SSL_HOST : PROD_HOST);
    var str = String(h).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (str.indexOf('localhost:3000') !== -1 || str.indexOf('127.0.0.1:3000') !== -1) return str;
    var cleaned = str.replace(/:\d+$/, '');
    if (location.protocol === 'https:' && (cleaned === PROD_HOST || cleaned === '93.77.168.135')) {
      return PROD_SSL_HOST;
    }
    return cleaned;
  }

  function parseHostQuery() {
    try {
      var s = location.search || '';
      // Support ?server=..., &server=..., ?server-..., &server-..., ?host=...
      var m = s.match(/[?&](?:server|host)[=-]([^&]+)/i);
      if (m && m[1]) return cleanHostStr(decodeURIComponent(m[1]));
      var mIp = s.match(/[?&](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?)/);
      if (mIp && mIp[1]) return cleanHostStr(mIp[1]);
      var q = new URLSearchParams(s).get('server');
      if (q) return cleanHostStr(q);
    } catch (e) {}
    return null;
  }

  var _activeHost = null;

  function gameHost() {
    if (_activeHost) return _activeHost;
    var q = parseHostQuery();
    if (q) {
      q = cleanHostStr(q);
      try {
        sessionStorage.setItem('ps_game_host', q);
        localStorage.setItem('ps_game_host', q);
      } catch (e) {}
      _activeHost = q;
      return q;
    }
    try {
      if (window.STEAM_CONFIG_OVERRIDE && window.STEAM_CONFIG_OVERRIDE.serverHost) {
        return cleanHostStr(window.STEAM_CONFIG_OVERRIDE.serverHost);
      }
    } catch (e) {}
    try {
      var saved = sessionStorage.getItem('ps_game_host') || localStorage.getItem('ps_game_host');
      if (saved) {
        saved = cleanHostStr(saved);
        _activeHost = saved;
        return saved;
      }
    } catch (e) {}
    _activeHost = PROD_HOST;
    return PROD_HOST;
  }

  function apiBase() {
    var host = gameHost();
    var proto = (location.protocol === 'https:') ? 'https:' : 'http:';
    if (proto === 'https:' && (host === PROD_HOST || host === PROD_HOST + ':8080' || host === '93.77.168.135')) {
      host = PROD_SSL_HOST;
    }
    if (host.indexOf('://') !== -1) return host.replace(/\/$/, '');
    return proto + '//' + host;
  }

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var el = $('mm-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function applyLang() {
    var title = t('title');
    var titleEl = $('mm-title');
    if (titleEl) titleEl.textContent = title;
    // текст на дуге свитка
    var pathText = document.getElementById('mm-title-path');
    if (pathText) {
      // textPath: textContent works in modern browsers
      while (pathText.firstChild) pathText.removeChild(pathText.firstChild);
      pathText.appendChild(document.createTextNode(title));
    }
    $('mm-subtitle').textContent = t('subtitle');
    $('mm-copy').textContent = t('copy');
    $('mm-board-title').textContent = t('board');
    $('col-name').textContent = t('colName');
    $('col-lv').textContent = t('colLv');
    $('col-score').textContent = t('colScore');
    $('mm-options-title').textContent = t('optionsTitle');
    if ($('mm-opt-perf-title')) $('mm-opt-perf-title').textContent = t('perfTitle');
    if ($('mm-preset-low')) $('mm-preset-low').textContent = t('perfLow');
    if ($('mm-preset-medium')) $('mm-preset-medium').textContent = t('perfMed');
    if ($('mm-preset-high')) $('mm-preset-high').textContent = t('perfHigh');
    if ($('mm-opt-shadow-title')) $('mm-opt-shadow-title').textContent = t('shadowTitle');
    if ($('mm-opt-sh-off')) $('mm-opt-sh-off').textContent = t('shadowOff');
    if ($('mm-opt-sh-low')) $('mm-opt-sh-low').textContent = t('shadowLow');
    if ($('mm-opt-sh-med')) $('mm-opt-sh-med').textContent = t('shadowMed');
    if ($('mm-opt-sh-high')) $('mm-opt-sh-high').textContent = t('shadowHigh');
    if ($('mm-opt-sound-title')) $('mm-opt-sound-title').textContent = t('soundTitle');
    if ($('mm-opt-sfx-title')) $('mm-opt-sfx-title').textContent = t('sfxTitle');
    if ($('mm-opt-bgm-title')) $('mm-opt-bgm-title').textContent = t('bgmTitle');
    if ($('mm-opt-mute-label')) $('mm-opt-mute-label').textContent = t('muteLabel');
    $('mm-btn-options').textContent = t('options');
    $('mm-btn-back').textContent = t('back');
    $('mm-btn-connect').textContent = connecting ? t('connecting') : t('connect');
    if ($('mm-key-title')) $('mm-key-title').textContent = t('keyTitle');
    if ($('mm-key-desc')) $('mm-key-desc').textContent = t('keyDesc');
    if ($('mm-input-key')) $('mm-input-key').placeholder = t('keyPlaceholder');
    if ($('mm-btn-submit-key')) $('mm-btn-submit-key').textContent = t('keySubmit');
    if ($('mm-key-tip')) $('mm-key-tip').textContent = t('keyTip');
    updateRankButton();
    document.querySelectorAll('.mm-lang-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
    renderStatus();
    var empty = $('mm-board-empty');
    if (empty) empty.textContent = t('empty');
  }

  function updateRankButton() {
    var btn = $('mm-btn-rank');
    if (!btn) return;
    btn.textContent = boardOpen ? t('rankClose') : t('rank');
    btn.classList.toggle('open-rank', boardOpen);
  }

  function setBoardOpen(open) {
    boardOpen = !!open;
    var board = $('mm-board');
    if (board) {
      board.classList.toggle('hidden', !boardOpen);
      board.setAttribute('aria-hidden', boardOpen ? 'false' : 'true');
    }
    updateRankButton();
    if (boardOpen) poll(); // обновить список при открытии
  }

  function toggleBoard() {
    setBoardOpen(!boardOpen);
  }

  function renderStatus() {
    var box = $('mm-server');
    var dot = $('mm-server-dot');
    var label = $('mm-server-label');
    var btn = $('mm-btn-connect');
    if (!box || !dot || !label || !btn) return;

    box.classList.toggle('online', serverOnline);
    box.classList.toggle('down', !serverOnline);
    dot.classList.toggle('online', serverOnline);
    dot.classList.toggle('down', !serverOnline);
    label.textContent = serverOnline ? t('online') : t('unavailable');

    btn.disabled = !serverOnline || connecting;
    btn.textContent = connecting ? t('connecting') : t('connect');
  }

  function renderLeaderboard(rows) {
    var list = $('mm-board-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows || !rows.length) {
      var empty = document.createElement('li');
      empty.className = 'mm-board-empty';
      empty.id = 'mm-board-empty';
      empty.textContent = t('empty');
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (r, i) {
      var li = document.createElement('li');
      if (i === 0) li.className = 'rank-1';
      else if (i === 1) li.className = 'rank-2';
      else if (i === 2) li.className = 'rank-3';
      var rank = i + 1;
      var name = r.name || '—';
      var onDot = r.online ? '<span class="on" title="online"></span>' : '';
      li.innerHTML =
        '<span class="r">' + rank + '</span>' +
        '<span class="n">' + onDot + escapeHtml(name) + '</span>' +
        '<span class="lv">' + (r.level != null ? r.level : '—') + '</span>' +
        '<span class="sc">' + (r.score != null ? r.score : '—') + '</span>';
      list.appendChild(li);
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchJson(path, ms, baseOverride) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 7000) : null;
    try {
      var base = baseOverride || apiBase();
      var res = await fetch(base + path, {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.json();
    } catch (e) {
      if (timer) clearTimeout(timer);
      throw e;
    }
  }

  async function postJson(path, body, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 7000) : null;
    try {
      var res = await fetch(apiBase() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      if (timer) clearTimeout(timer);
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { ok: res.ok, status: res.status, data: data };
    } catch (e) {
      if (timer) clearTimeout(timer);
      throw e;
    }
  }

  function hasSavedKey() {
    return localStorage.getItem('ps_has_key') === 'true' && !!localStorage.getItem('ps_local_id');
  }

  function setKeyModalOpen(open) {
    keyModalOpen = !!open;
    var modal = $('mm-key-modal');
    if (modal) modal.classList.toggle('hidden', !keyModalOpen);
    if (keyModalOpen) {
      var inp = $('mm-input-key');
      if (inp) {
        inp.value = '';
        setTimeout(function () { inp.focus(); }, 60);
      }
    }
  }

  function togglePassVisibility(inputId) {
    var inp = $(inputId);
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  async function doSubmitKey() {
    var inp = $('mm-input-key');
    var val = inp ? inp.value.trim() : '';
    if (!val || val.length < 4) {
      toast(t('keyErrShort'));
      return;
    }
    if (/[\u0400-\u04FF]/.test(val) || !/^[\x20-\x7E]+$/.test(val)) {
      toast(t('keyErrChars'));
      return;
    }
    var btn = $('mm-btn-submit-key');
    if (btn) btn.disabled = true;
    try {
      var prefId = localStorage.getItem('ps_local_id') || sessionStorage.getItem('ps_local_id') || '';
      var r = await postJson('/api/auth/enter-key', {
        key: val,
        preferredLocalId: prefId,
        mode: 'any'
      });
      if (r && r.data && r.data.ok && r.data.localId) {
        localStorage.setItem('ps_local_id', r.data.localId);
        sessionStorage.setItem('ps_local_id', r.data.localId);
        if (r.data.guestToken) {
          localStorage.setItem('ps_guest_token', r.data.guestToken);
          sessionStorage.setItem('ps_guest_token', r.data.guestToken);
        }
        var charsList = Array.isArray(r.data.chars) ? r.data.chars : [];
        localStorage.setItem('ps_characters', JSON.stringify(charsList));
        sessionStorage.setItem('ps_characters', JSON.stringify(charsList));
        // Требование: не сохранять ключ и флаг в кэш клиента
        try {
          localStorage.removeItem('ps_has_key');
          localStorage.removeItem('ps_auth_key');
          sessionStorage.removeItem('ps_has_key');
          sessionStorage.removeItem('ps_auth_key');
        } catch (_) {}

        var msg = r.data.isNew ? (t('keySuccessNew') || 'Новый аккаунт создан!') : (t('keySuccessLogin') || 'Вход выполнен! Персонажи получены с сервера');
        toast(msg);
        setKeyModalOpen(false);
        proceedConnect();
      } else {
        var msg = (r && r.data && r.data.message) || t('keyErrGeneric');
        toast(msg);
      }
    } catch (e) {
      toast(t('errOffline'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function probeOne(base, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, timeoutMs || 3500) : null;
    return fetch(base + '/healthz', {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).then(function (j) {
      if (j && (j.ok || j.online !== false || j.status === 'ok')) return base;
      throw new Error('offline');
    }).catch(function () {
      return fetch(base + '/api/status', {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      }).then(function (j) {
        if (j && j.ok && j.online !== false) return base;
        throw new Error('offline');
      });
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function probeParallel(bases, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var left = bases.length;
      var resolved = false;
      bases.forEach(function (b) {
        probeOne(b, timeoutMs).then(function (winBase) {
          if (!resolved) {
            resolved = true;
            resolve(winBase);
          }
        }).catch(function () {
          left--;
          if (left <= 0 && !resolved) reject(new Error('all down'));
        });
      });
    });
  }

  var _pollFailCount = 0;
  var _polling = false;
  async function poll() {
    if (_polling) return;
    _polling = true;

    var curHost = gameHost();
    var proto = (location.protocol === 'https:') ? 'https:' : 'http:';

    var defHost = (proto === 'https:') ? PROD_SSL_HOST : PROD_HOST;
    var candidateHosts = [];
    if (curHost) candidateHosts.push(cleanHostStr(curHost));
    if (location.host && candidateHosts.indexOf(location.host) === -1) {
      candidateHosts.unshift(location.host);
    }
    if (candidateHosts.indexOf(defHost) === -1) {
      candidateHosts.push(defHost);
    }
    if (proto === 'https:') {
      candidateHosts = candidateHosts.map(function (h) {
        return (h === PROD_HOST || h === '93.77.168.135' || h === '93.77.168.135:8080') ? PROD_SSL_HOST : h;
      }).filter(function (h, i, arr) { return arr.indexOf(h) === i; });
    }

    var candidateBases = candidateHosts.map(function (h) {
      return (h.indexOf('://') !== -1 ? h : (proto + '//' + h)).replace(/\/$/, '');
    });

    try {
      var winningBase = await probeParallel(candidateBases, 3500);
      _pollFailCount = 0;
      serverOnline = true;
      var winningHost = winningBase.replace(/^https?:\/\//, '');
      if (winningHost && winningHost.indexOf('localhost') === -1 && winningHost !== _activeHost) {
        _activeHost = winningHost;
        try {
          sessionStorage.setItem('ps_game_host', winningHost);
          localStorage.setItem('ps_game_host', winningHost);
        } catch (_) {}
      }
    } catch (e) {
      _pollFailCount++;
      if (_pollFailCount >= 2 || !serverOnline) {
        serverOnline = false;
      }
    } finally {
      _polling = false;
      renderStatus();
    }

    if (serverOnline) {
      try {
        var lb = await fetchJson('/api/leaderboard', 3500);
        renderLeaderboard(lb && lb.rows ? lb.rows : []);
      } catch (e) {
        renderLeaderboard([]);
      }
    } else {
      renderLeaderboard([]);
    }
  }

  function goConnect() {
    if (connecting) return;
    if (!serverOnline) {
      toast(t('errOffline'));
      return;
    }
    // Единственная кнопка Подключиться всегда открывает форму ввода ключа
    setKeyModalOpen(true);
  }

  function proceedConnect() {
    if (connecting) return;
    connecting = true;
    renderStatus();
    var host = gameHost();
    try {
      sessionStorage.setItem('ps_menu_lang', lang);
      sessionStorage.setItem('ps_game_host', host);
      localStorage.setItem('ps_game_host', host);
    } catch (e) {}
    location.href = 'character-select.html?server=' + encodeURIComponent(host);
  }

  function bind() {
    document.querySelectorAll('.mm-lang-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        lang = b.getAttribute('data-lang') === 'en' ? 'en' : 'ru';
        try { localStorage.setItem('ps_menu_lang', lang); } catch (e) {}
        applyLang();
      });
    });
    $('mm-btn-connect').addEventListener('click', goConnect);
    $('mm-btn-rank').addEventListener('click', toggleBoard);
    var closeBtn = $('mm-board-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { setBoardOpen(false); });
    $('mm-btn-options').addEventListener('click', function () {
      $('mm-options').classList.remove('hidden');
    });
    $('mm-btn-back').addEventListener('click', function () {
      $('mm-options').classList.add('hidden');
    });

    var optCloseBtn = $('mm-options-close');
    if (optCloseBtn) optCloseBtn.addEventListener('click', function () { $('mm-options').classList.add('hidden'); });
    var optModal = $('mm-options');
    if (optModal) {
      optModal.addEventListener('click', function (e) {
        if (e.target === optModal) optModal.classList.add('hidden');
      });
    }
    var keyCloseBtn = $('mm-key-close');
    if (keyCloseBtn) keyCloseBtn.addEventListener('click', function () { setKeyModalOpen(false); });
    var keyModal = $('mm-key-modal');
    if (keyModal) {
      keyModal.addEventListener('click', function (e) {
        if (e.target === keyModal) setKeyModalOpen(false);
      });
    }
    var togKey = $('mm-toggle-key');
    if (togKey) togKey.addEventListener('click', function () { togglePassVisibility('mm-input-key'); });
    var btnSubmitKey = $('mm-btn-submit-key');
    if (btnSubmitKey) btnSubmitKey.addEventListener('click', doSubmitKey);
    var inpKey = $('mm-input-key');
    if (inpKey) {
      inpKey.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSubmitKey();
        }
      });
      inpKey.addEventListener('input', function () {
        if (/[\u0400-\u04FF]/.test(this.value)) {
          this.value = this.value.replace(/[\u0400-\u04FF]/g, '');
          toast(t('keyErrChars'));
        }
      });
    }

    var boardEl = $('mm-board');
    var boardHead = boardEl ? boardEl.querySelector('.mm-board-head') : null;
    if (boardEl && boardHead) {
      boardHead.style.cursor = 'grab';
      var dragging = false, startX = 0, startY = 0, initL = 0, initT = 0;
      var onStart = function (cx, cy, target) {
        if (target.closest('button, a')) return;
        dragging = true;
        boardHead.style.cursor = 'grabbing';
        var r = boardEl.getBoundingClientRect();
        boardEl.style.left = r.left + 'px';
        boardEl.style.top = r.top + 'px';
        boardEl.style.right = 'auto';
        boardEl.style.bottom = 'auto';
        boardEl.style.transform = 'none';
        startX = cx; startY = cy;
        initL = r.left; initT = r.top;
      };
      var onMove = function (cx, cy) {
        if (!dragging) return;
        var w = window.innerWidth, h = window.innerHeight;
        var ew = boardEl.offsetWidth || 240, eh = boardEl.offsetHeight || 300;
        boardEl.style.left = Math.max(0, Math.min(w - ew, initL + cx - startX)) + 'px';
        boardEl.style.top = Math.max(0, Math.min(h - eh, initT + cy - startY)) + 'px';
      };
      var onEnd = function () {
        if (dragging) {
          dragging = false;
          boardHead.style.cursor = 'grab';
        }
      };
      boardHead.addEventListener('mousedown', function (e) { onStart(e.clientX, e.clientY, e.target); });
      window.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
      window.addEventListener('mouseup', onEnd);
      boardHead.addEventListener('touchstart', function (e) {
        if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
      window.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches.length === 1 && dragging) onMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      window.addEventListener('touchend', onEnd);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        $('mm-options').classList.add('hidden');
        if (keyModalOpen && hasSavedKey()) setKeyModalOpen(false);
        if (boardOpen) setBoardOpen(false);
      }
      if (e.key === 'Enter' && serverOnline && !connecting && !keyModalOpen) goConnect();
    });

    window.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }, { capture: true, passive: false });

    document.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length > 1) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      var scrollable = e.target.closest('.mm-board-list, [data-scrollable]');
      if (!scrollable) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });
  }

  function initOptions() {
    var presetBtns = document.querySelectorAll('.mm-opt-preset-btn');
    var shadowSelect = $('mm-opt-shadow-select');
    var sfxSlider = $('mm-opt-sfx-slider');
    var sfxVal = $('mm-opt-sfx-val');
    var bgmSlider = $('mm-opt-bgm-slider');
    var bgmVal = $('mm-opt-bgm-val');
    var muteCheck = $('mm-opt-mute');

    function syncOptionsFromStorage() {
      // 1. Звук
      var sfx = 70;
      try {
        var savedSfx = localStorage.getItem('ps_game_audio_vol');
        if (savedSfx != null && !isNaN(parseFloat(savedSfx))) sfx = Math.round(parseFloat(savedSfx));
      } catch (_) {}
      if (sfxSlider) sfxSlider.value = sfx;
      if (sfxVal) sfxVal.textContent = sfx + '%';

      var bgm = 45;
      try {
        var savedBgm = localStorage.getItem('ps_game_bgm_vol');
        if (savedBgm != null && !isNaN(parseFloat(savedBgm))) bgm = Math.round(parseFloat(savedBgm));
      } catch (_) {}
      if (bgmSlider) bgmSlider.value = bgm;
      if (bgmVal) bgmVal.textContent = bgm + '%';

      var muted = false;
      try {
        muted = localStorage.getItem('ps_game_audio_mute') === '1';
      } catch (_) {}
      if (muteCheck) muteCheck.checked = muted;

      // 2. Тени
      var sh = 'medium';
      try {
        var savedSh = localStorage.getItem('ps_shadow_quality');
        if (savedSh) sh = savedSh;
      } catch (_) {}
      if (shadowSelect) shadowSelect.value = sh;

      // 3. Пресет производительности
      var preset = 'medium';
      try {
        var savedPr = localStorage.getItem('ps_graphics_preset');
        if (savedPr && (savedPr === 'low' || savedPr === 'medium' || savedPr === 'high')) {
          preset = savedPr;
        } else {
          if (sh === 'off') preset = 'low';
          else if (sh === 'high' || sh === 'ultra') preset = 'high';
          else preset = 'medium';
        }
      } catch (_) {}
      updatePresetUI(preset);
    }

    function updatePresetUI(presetKey) {
      presetBtns.forEach(function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-preset') === presetKey);
      });
    }

    function applyPreset(presetKey) {
      updatePresetUI(presetKey);
      try { localStorage.setItem('ps_graphics_preset', presetKey); } catch (_) {}

      var shMode = 'medium';
      if (presetKey === 'low') shMode = 'off';
      else if (presetKey === 'high') shMode = 'high';
      else shMode = 'medium';

      if (shadowSelect) shadowSelect.value = shMode;
      try { localStorage.setItem('ps_shadow_quality', shMode); } catch (_) {}

      // Синхронизация с настройками видимости и дальности (l2-visibility)
      try {
        var visPreset = null;
        if (presetKey === 'low') {
          visPreset = {
            clippingRange: { actorsMax: 100, actorsMin: 8, nameplate: 35, nameplateFade: 6, foliage: 100, propsMax: 350, buildingsMax: 550, doodadsMax: 120, loot: 60 },
            massPvp: { enabled: true, characterLimit: 30, propsLimit: 150 },
            shadowQuality: 'off',
            streamRadius: 2
          };
        } else if (presetKey === 'medium') {
          visPreset = {
            clippingRange: { actorsMax: 140, actorsMin: 10, nameplate: 40, nameplateFade: 8, foliage: 130, propsMax: 450, buildingsMax: 700, doodadsMax: 160, loot: 80 },
            massPvp: { enabled: true, characterLimit: 45, propsLimit: 220 },
            shadowQuality: 'low',
            streamRadius: 2
          };
        } else if (presetKey === 'high') {
          visPreset = {
            clippingRange: { actorsMax: 180, actorsMin: 10, nameplate: 50, nameplateFade: 10, foliage: 125, propsMax: 550, buildingsMax: 850, doodadsMax: 200, loot: 100 },
            massPvp: { enabled: true, characterLimit: 50, propsLimit: 300 },
            shadowQuality: 'high',
            streamRadius: 2
          };
        }
        if (visPreset) {
          var curRaw = localStorage.getItem('ps_l2_visibility_settings');
          var cur = {};
          if (curRaw) { try { cur = JSON.parse(curRaw) || {}; } catch (_) {} }
          Object.assign(cur, visPreset);
          localStorage.setItem('ps_l2_visibility_settings', JSON.stringify(cur));
        }
      } catch (_) {}
    }

    presetBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pk = btn.getAttribute('data-preset');
        applyPreset(pk);
      });
    });

    if (shadowSelect) {
      shadowSelect.addEventListener('change', function () {
        var shVal = this.value;
        try { localStorage.setItem('ps_shadow_quality', shVal); } catch (_) {}
        try {
          var curRaw = localStorage.getItem('ps_l2_visibility_settings');
          var cur = curRaw ? JSON.parse(curRaw) : {};
          cur.shadowQuality = shVal;
          localStorage.setItem('ps_l2_visibility_settings', JSON.stringify(cur));
        } catch (_) {}

        if (shVal === 'off') updatePresetUI('low');
        else if (shVal === 'high' || shVal === 'ultra') updatePresetUI('high');
        else updatePresetUI('medium');
      });
    }

    if (sfxSlider) {
      sfxSlider.addEventListener('input', function () {
        var v = Math.round(parseFloat(this.value) || 0);
        if (sfxVal) sfxVal.textContent = v + '%';
        try { localStorage.setItem('ps_game_audio_vol', String(v)); } catch (_) {}
      });
    }
    if (bgmSlider) {
      bgmSlider.addEventListener('input', function () {
        var v = Math.round(parseFloat(this.value) || 0);
        if (bgmVal) bgmVal.textContent = v + '%';
        try { localStorage.setItem('ps_game_bgm_vol', String(v)); } catch (_) {}
      });
    }
    if (muteCheck) {
      muteCheck.addEventListener('change', function () {
        try { localStorage.setItem('ps_game_audio_mute', this.checked ? '1' : '0'); } catch (_) {}
      });
    }

    syncOptionsFromStorage();
  }

  function boot() {
    try {
      localStorage.removeItem('ps_has_key');
      localStorage.removeItem('ps_auth_key');
      sessionStorage.removeItem('ps_has_key');
      sessionStorage.removeItem('ps_auth_key');
    } catch (_) {}
    applyLang();
    bind();
    initOptions();
    setBoardOpen(false);
    renderStatus();
    // label «checking» first paint
    $('mm-server-label').textContent = t('checking');
    poll();
    pollTimer = setInterval(poll, 4000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
