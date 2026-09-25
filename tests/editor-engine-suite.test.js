// ============================================================
//  TESTS / EDITOR-ENGINE-SUITE.TEST.JS
//  Проверка архитектуры и функционала игрового редактора движка:
//  - Регистрация и динамический каталог PropsLibrary
//  - Синтаксис и целостность editor-engine-layout.js и editor.js
//  - Наличие и разметка автономного editor.html
//  - Независимость игрового клиента от модулей редактора
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

module.exports = function (t) {
  const ROOT = path.join(__dirname, '..');

  t.suite('editor-engine: целостность файлов и синтаксис');
  const editorJsPath = path.join(ROOT, 'client/js/editor.js');
  const layoutJsPath = path.join(ROOT, 'client/js/editor-engine-layout.js');
  const propsLibPath = path.join(ROOT, 'client/js/props-library-data.js');
  const editorHtmlPath = path.join(ROOT, 'client/editor.html');

  t.ok(fs.existsSync(editorJsPath), 'client/js/editor.js существует');
  t.ok(fs.existsSync(layoutJsPath), 'client/js/editor-engine-layout.js существует');
  t.ok(fs.existsSync(propsLibPath), 'client/js/props-library-data.js существует');
  t.ok(fs.existsSync(editorHtmlPath), 'client/editor.html существует');

  const PL = require(propsLibPath);
  t.ok(PL && typeof PL.registerProp === 'function', 'PropsLibrary экспортирует registerProp');

  t.suite('editor-engine: динамическая регистрация новых ассетов');
  const initialTotal = PL.getAll().length;
  const testProp = {
    id: 'custom_autotest_statue',
    name: 'Тестовая статуя',
    category: 'custom',
    file: 'autotest_statue.fbx',
    defaultScale: 1.0,
    collisionRadius: 2.0,
    collisionHeight: 4.0
  };
  PL.registerProp(testProp);
  const afterRegister = PL.getById('custom_autotest_statue');
  t.ok(afterRegister != null, 'Зарегистрированный проп находится по id');
  t.eq(afterRegister && afterRegister.nameRu, 'Тестовая статуя', 'Имя пропа сохранено');
  t.eq(afterRegister && afterRegister.category, 'custom', 'Категория custom установлена');
  t.eq(PL.getAll().length, initialTotal + 1, 'Общее количество пропов увеличилось на 1');

  t.suite('editor-engine: автономный editor.html');
  const editorHtmlContent = fs.readFileSync(editorHtmlPath, 'utf8');
  t.ok(editorHtmlContent.includes('window._forceEditorMode = true'), 'editor.html активирует _forceEditorMode');
  t.ok(editorHtmlContent.includes('window.isEditorStandalone = true'), 'editor.html активирует isEditorStandalone');
  t.ok(editorHtmlContent.includes('js/boot.module.js'), 'editor.html загружает boot.module.js');
  t.ok(editorHtmlContent.includes('editor-engine.css'), 'editor.html подключает стили редактора');

  t.suite('editor-engine: хуки и центральный вьюпорт в editor.js');
  const editorJsContent = fs.readFileSync(editorJsPath, 'utf8');
  t.ok(editorJsContent.includes('initEngineEditor(this)'), 'editor.js вызывает initEngineEditor');
  t.ok(editorJsContent.includes('this.engineLayout.style.display'), 'editor.js переключает видимость engineLayout');
  t.ok(editorJsContent.includes('_updateMouseCoords'), 'editor.js использует точный расчет экранных координат _updateMouseCoords');
  t.ok(editorJsContent.includes('#editor-top-bar'), 'editor.js предотвращает клики сквозь док-панели в _isEventOverUI');

  t.suite('editor-engine: независимость игры от файлов редактора');
  const bootContent = fs.readFileSync(path.join(ROOT, 'client/js/boot.module.js'), 'utf8');
  t.ok(bootContent.includes('исключён в релизном билде'), 'boot.module.js игнорирует отсутствие модулей редактора');
  const mainContent = fs.readFileSync(path.join(ROOT, 'client/js/main.js'), 'utf8');
  t.ok(/window\.SceneEditor/.test(mainContent), 'main.js безопасно создает редактор только при наличии window.SceneEditor');
  t.ok(mainContent.includes('__PS_EDITOR_KEY'), 'F2 грузит редактор только с серверным ключом');
  const menuHtml = fs.readFileSync(path.join(ROOT, 'client/menu.html'), 'utf8');
  t.ok(!/href=["']editor\.html["']/.test(menuHtml), 'меню не содержит публичной ссылки на редактор');

  t.suite('editor-engine: модульные окна, чистый инспектор и 3D-иконки');
  const layoutContent = fs.readFileSync(layoutJsPath, 'utf8');
  const cssContent = fs.readFileSync(path.join(ROOT, 'client/css/editor-engine.css'), 'utf8');

  t.ok(layoutContent.includes('assets/props/icons/'), 'Content Browser загружает 3D-иконки из assets/props/icons/');
  t.ok(layoutContent.includes('.webp'), 'Content Browser использует webp-формат превью');
  t.ok(layoutContent.includes('detachEngineToolToWindow'), 'editor-engine-layout предоставляет метод открепления в окно');
  t.ok(layoutContent.includes('ed-mode-tool-host'), 'Панель режимов содержит host-контейнер для активного инструмента');
  t.ok(layoutContent.includes('ed-insp-actor-view'), 'Инспектор разделен на свойства объекта и World Settings');
  t.ok(layoutContent.includes('ed-insp-world-view'), 'Инспектор содержит отдельный блок параметров мира');
  t.ok(cssContent.includes('.ed-floating-window'), 'CSS описывает плавающие окна .ed-floating-window');
  t.ok(cssContent.includes('.ed-asset-img'), 'CSS стилизует 3D-иконки .ed-asset-img');
  t.ok(editorJsContent.includes('if (!this.engineLayout)'), 'editor.js не открывает принудительно окно палитры в engineLayout');

  t.suite('editor-engine: плавное изменение размеров (сплиттеры) и отпускание мыши');
  t.ok(layoutContent.includes("window.addEventListener('mouseup', onMouseUp"), 'bindSplitter регистрирует onMouseUp и не залипает');
  t.ok(layoutContent.includes("window.removeEventListener('mouseup', onMouseUp"), 'bindSplitter снимает слушатель mouseup');
  t.ok(cssContent.includes('.ed-splitter-v::after'), 'Вертикальный сплиттер имеет расширенную зону захвата ::after');
  t.ok(cssContent.includes('.ed-splitter-h::after'), 'Горизонтальный сплиттер имеет расширенную зону захвата ::after');

  t.suite('editor-engine: колесико мыши и скролл окон');
  const cameraJsContent = fs.readFileSync(path.join(ROOT, 'client/js/camera3d.js'), 'utf8');
  t.ok(cameraJsContent.includes('#editor-engine-layout'), 'camera3d.js распознает #editor-engine-layout как интерактивный UI');
  t.ok(cameraJsContent.includes('#editor-left-dock'), 'camera3d.js не перехватывает колесико над левым доком');
  t.ok(cameraJsContent.includes('#editor-right-dock'), 'camera3d.js не перехватывает колесико над инспектором');
  t.ok(cameraJsContent.includes('#editor-bottom-dock'), 'camera3d.js не перехватывает колесико над контент-браузером');
  t.ok(cameraJsContent.includes('#editor-viewport-container'), 'camera3d.js обрабатывает колесико во вьюпорте');

  t.suite('editor-engine: защита от удаления объектов через Backspace');
  t.ok(!/e\.key\s*===\s*['"]Backspace['"]\s*\)\s*&&\s*!this\.zoneEditMode/.test(editorJsContent), 'Backspace больше не удаляет выделенный объект');
  t.ok(editorJsContent.includes("(e.key === 'Delete' || e.code === 'Delete') && !this.zoneEditMode"), 'Удаление объекта привязано только к Delete');
  t.ok(editorJsContent.includes("ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'"), 'Горячие клавиши блокируются при фокусе в любых полях ввода');

  t.suite('editor-engine: управление временем суток и синхронизация (DayNight)');
  t.ok(editorJsContent.includes('dn.setHour(hour)'), 'applyFromSlider мгновенно обновляет локальное время dn.setHour');
  t.ok(editorJsContent.includes('sendThrottledHour'), 'editor.js использует sendThrottledHour для троттлинга отправки по сокету');
  t.ok(editorJsContent.includes('_isDraggingTod'), 'editor.js отслеживает состояние перетаскивания _isDraggingTod');
  t.ok(editorJsContent.includes('pointerdown'), 'editor.js регистрирует pointerdown для ползунка времени');

  t.suite('server: world-time GM авторизация и тихий режим пакета');
  const WT = require(path.join(ROOT, 'shared/world-time.js'));
  const { createWorldTimeHandler } = require(path.join(ROOT, 'server/handlers/world-time-handler.js'));

  const sent = [];
  const mockSend = (target, data) => { sent.push({ target, data }); };
  const wtHandler = createWorldTimeHandler({
    WT,
    send: mockSend,
    TICK_MS: 100,
    players: () => []
  });

  const gmPlayer = { pid: 1, yid: 'yid_gm', name: 'GM_Admin', gm: true, accessLevel: 100 };
  const regularPlayer = { pid: 2, yid: 'yid_reg', name: 'RegularUser', gm: false, accessLevel: 0 };
  const mockIsGM = (p) => !!(p && (p.gm || p.accessLevel >= 50));

  // 1. Не-GM игрок пытается выставить время
  sent.length = 0;
  const regTimeRes = wtHandler.handleTimeMessage(regularPlayer, { t: 'set_time', hour: 12 }, mockIsGM);
  t.eq(regTimeRes, true, 'handleTimeMessage перехватывает set_time');
  t.ok(sent.some(s => s.data && s.data.t === 'err' && s.data.msg.includes('только для GM')), 'не-GM получает отказ на set_time');

  // 2. Не-GM игрок пытается поставить время на паузу
  sent.length = 0;
  const regPauseRes = wtHandler.handleTimeMessage(regularPlayer, { t: 'set_time_pause', paused: true }, mockIsGM);
  t.eq(regPauseRes, true, 'handleTimeMessage перехватывает set_time_pause');
  t.ok(sent.some(s => s.data && s.data.t === 'err' && s.data.msg.includes('только для GM')), 'не-GM получает отказ на set_time_pause');

  // 3. GM игрок (без p.dev) устанавливает время 14:00
  sent.length = 0;
  wtHandler.handleTimeMessage(gmPlayer, { t: 'set_time', hour: 14 }, mockIsGM);
  t.ok(Math.abs(wtHandler.getHour() - 14) < 0.1, 'GM успешно устанавливает время 14:00');
  t.ok(sent.some(s => s.data && s.data.t === 'chat' && s.data.text.includes('Время мира')), 'GM получает сообщение в чат');

  // 4. GM игрок устанавливает время в тихом режиме (silent: true при перетаскивании ползунка)
  sent.length = 0;
  wtHandler.handleTimeMessage(gmPlayer, { t: 'set_time', hour: 20, silent: true }, mockIsGM);
  t.ok(Math.abs(wtHandler.getHour() - 20) < 0.1, 'GM устанавливает время 20:00 в тихом режиме');
  t.ok(!sent.some(s => s.data && s.data.t === 'chat'), 'в тихом режиме системный чат не спамится');

  // 5. GM игрок переключает паузу времени мира
  sent.length = 0;
  wtHandler.handleTimeMessage(gmPlayer, { t: 'set_time_pause', paused: true }, mockIsGM);
  t.eq(wtHandler.isPaused(), true, 'GM успешно включает паузу времени мира');
  t.ok(sent.some(s => s.data && s.data.text && s.data.text.includes('паузе')), 'сообщение о паузе отправлено');

  wtHandler.handleTimeMessage(gmPlayer, { t: 'set_time_pause', paused: false }, mockIsGM);
  t.eq(wtHandler.isPaused(), false, 'GM успешно снимает паузу времени мира');
};

