// ============================================================
//  TESTS / ENTRY-GATE.TEST.JS
//  Вход в игру только из меню:
//   - гейт game.html пускает лишь со свежим одноразовым билетом ps_entry (sessionStorage),
//     сразу гасит его; прямой заход, F5, просроченный билет, «вечные» флаги localStorage → menu.html;
//   - страница из bfcache («Назад»/«Вперёд») → menu.html;
//   - выбор персонажа выдаёт билет и открывает игру через location.replace;
//   - в игре есть кнопка выхода в меню, выход идёт через replace и чистит флаги входа.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function gateScript() {
  const html = fs.readFileSync(path.join(ROOT, 'client', 'game.html'), 'utf8');
  const marker = html.indexOf('Гейт: game.html НЕ точка входа');
  const start = html.indexOf('<script>', marker) + '<script>'.length;
  const end = html.indexOf('</script>', start);
  return html.slice(start, end);
}

function makeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m
  };
}

/** Прогон гейта в песочнице: возвращает, куда ушла страница и что осталось в хранилищах. */
function runGate({ session, local, persisted }) {
  const sessionStorage = makeStorage(session);
  const localStorage = makeStorage(local);
  const listeners = {};
  let replacedTo = null;
  const win = {
    sessionStorage, localStorage,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    PS_SERVER: {
      host: '217.179.49.236', sslHost: '217.179.49.236.sslip.io',
      sanitizeHost: (h) => h || '217.179.49.236.sslip.io', isAllowedHost: () => true,
      isLocalEnv: () => false, secureHost: (h) => h, httpScheme: () => 'https:'
    }
  };
  const ctx = {
    window: win, sessionStorage, localStorage,
    location: { protocol: 'https:', search: '', pathname: '/game.html', hash: '', origin: 'https://x', host: 'x', replace: (u) => { replacedTo = u; }, reload: () => { } },
    history: { replaceState: () => { } },
    document: {
      readyState: 'complete', getElementById: () => null, addEventListener: () => { },
      createElement: () => ({ set onerror(_) { } }), head: { appendChild: () => { } }
    },
    fetch: () => new Promise(() => { }),
    AbortController: function () { this.signal = null; this.abort = () => { }; },
    setTimeout: () => 0, clearTimeout: () => { }, console: { log() { }, warn() { }, error() { } },
    Promise, JSON, Date, Number, String, Math, URLSearchParams, decodeURIComponent, Object, Array, Error
  };
  win.window = win;
  vm.runInNewContext(gateScript(), ctx, { timeout: 2000 });
  if (persisted) for (const fn of listeners.pageshow || []) fn({ persisted: true });
  return { replacedTo, entryOk: !!win.__PS_ENTRY_OK, session: sessionStorage._map, local: localStorage._map };
}

module.exports = async function (t) {
  const charJson = JSON.stringify({ id: 'c0', name: 'Tester' });

  t.suite('entry-gate: game.html открывается только из меню');
  {
    const r = runGate({ session: {}, local: {} });
    t.eq(r.replacedTo, 'menu.html', 'прямой заход без билета → menu.html');
    t.ok(!r.entryOk, 'игра не помечена как разрешённая');
  }
  {
    const r = runGate({ session: {}, local: { ps_connect: '1', ps_boot_ticket: '1', ps_selected_char: charJson } });
    t.eq(r.replacedTo, 'menu.html', '«вечные» флаги localStorage (старый обход) больше не пускают');
    t.ok(!r.local.has('ps_connect') && !r.local.has('ps_boot_ticket'), 'старые флаги стёрты');
  }
  {
    const r = runGate({ session: { ps_entry: JSON.stringify({ t: Date.now() - 5 * 60000 }), ps_selected_char: charJson }, local: {} });
    t.eq(r.replacedTo, 'menu.html', 'просроченный билет (5 мин) → menu.html');
  }
  {
    const r = runGate({ session: { ps_entry: JSON.stringify({ t: Date.now() }) }, local: {} });
    t.eq(r.replacedTo, 'menu.html', 'билет без выбранного персонажа → menu.html');
  }
  {
    const r = runGate({ session: { ps_entry: JSON.stringify({ t: Date.now() }), ps_selected_char: charJson }, local: {} });
    t.eq(r.replacedTo, null, 'свежий билет из меню + персонаж → игра грузится');
    t.ok(r.entryOk, 'страница помечена __PS_ENTRY_OK для main.js');
    t.ok(!r.session.has('ps_entry'), 'билет одноразовый: погашен сразу (F5 → меню)');
    // повторная загрузка той же вкладки (F5) — билета уже нет
    const again = runGate({ session: Object.fromEntries(r.session), local: Object.fromEntries(r.local) });
    t.eq(again.replacedTo, 'menu.html', 'F5 после входа → menu.html');
  }
  {
    const r = runGate({ session: { ps_entry: JSON.stringify({ t: Date.now() }), ps_selected_char: charJson }, local: {}, persisted: true });
    t.eq(r.replacedTo, 'menu.html', 'страница из bfcache («Назад»/«Вперёд») → menu.html');
  }

  t.suite('entry-gate: выдача билета, выход и кнопка в игре');
  const cs = fs.readFileSync(path.join(ROOT, 'client', 'js', 'char-select.js'), 'utf8');
  const onStart = cs.slice(cs.indexOf('function onStart()'), cs.indexOf('function onPrev()'));
  t.ok(/sessionStorage\.setItem\('ps_entry'/.test(onStart), 'выбор персонажа выдаёт билет ps_entry в sessionStorage');
  t.ok(!/localStorage\.setItem\('ps_connect'/.test(onStart), 'вечный флаг ps_connect в localStorage больше не ставится');
  t.ok(/location\.replace\('game\.html/.test(onStart), 'игра открывается через replace («Назад» из игры → меню)');
  const mainJs = fs.readFileSync(path.join(ROOT, 'client', 'js', 'main.js'), 'utf8');
  t.ok(/if \(!window\.__PS_ENTRY_OK\)/.test(mainJs), 'main.js без отметки гейта уходит в меню');
  const goTo = mainJs.slice(mainJs.indexOf('goToMenuPage() {'), mainJs.indexOf('_persistSelectedCharStats() {'));
  t.ok(/removeItem\('ps_entry'\)/.test(goTo) && /location\.replace\('menu\.html'\)/.test(goTo), 'выход в меню чистит билет и идёт через replace');
  const gameHtml = fs.readFileSync(path.join(ROOT, 'client', 'game.html'), 'utf8');
  t.ok(/data-action="exit"/.test(gameHtml), 'в системном меню игры есть кнопка выхода');
  const ui = fs.readFileSync(path.join(ROOT, 'client', 'js', 'ui.js'), 'utf8');
  t.ok(/case 'exit':\s*\n\s*this\._confirmExitToMenu\(\)/.test(ui) && /goToMenuPage\(\)/.test(ui), 'кнопка выхода → подтверждение → goToMenuPage');
  const i18n = fs.readFileSync(path.join(ROOT, 'client', 'js', 'i18n.js'), 'utf8');
  t.ok((i18n.match(/sys_exit:/g) || []).length >= 2, 'подпись кнопки выхода переведена (ru/en)');
};
