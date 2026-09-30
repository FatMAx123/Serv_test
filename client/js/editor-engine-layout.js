// ============================================================
//  CLIENT / JS / EDITOR-ENGINE-LAYOUT.JS
//  Современный полноэкранный интерфейс редактора сцены
//  в стиле Unreal Engine 5 и Godot 4:
//  - Центральный 3D-вьюпорт с оверлеем статистики и режимов
//  - Левый док: Scene Outliner (иерархия, поиск, категории, 👁️) + Place Actors + Modes
//  - Правый док: Details / Inspector (только свойства выбранного объекта либо World Settings)
//  - Нижний док: Content Browser (библиотека с реальными 3D webp-иконками)
//  - Модульная система окон: открепление любого инструмента в плавающее окно (⧉)
//  - Drag-and-Drop: перетаскивание файлов из ОС и спавн моделей во вьюпорт
//  - Режим симуляции (Play in Editor)
// ============================================================
(function (global) {
  'use strict';

  function initEngineEditor(editor) {
    if (!editor || editor._engineLayoutInitialized) return;
    editor._engineLayoutInitialized = true;

    // 1. Подключение CSS-стилей редактора
    if (!document.getElementById('editor-engine-css')) {
      const link = document.createElement('link');
      link.id = 'editor-engine-css';
      link.rel = 'stylesheet';
      link.href = 'css/editor-engine.css?v=ue-godot-7';
      document.head.appendChild(link);
    }

    // 2. Создание каркаса #engine-editor-layout
    let layout = document.getElementById('engine-editor-layout');
    if (!layout) {
      layout = document.createElement('div');
      layout.id = 'engine-editor-layout';
      layout.style.display = 'none';
      layout.innerHTML = `
        <!-- ВЕРХНИЙ ТУЛБАР (UNREAL / GODOT HEADER) -->
        <header id="editor-top-bar">
          <div class="ed-top-left">
            <div class="ed-app-badge">⚙️ ENGINE STUDIO</div>
            <div class="ed-menu-group">
              <button class="ed-menu-btn" id="ed-menu-file">Файл</button>
              <button class="ed-menu-btn" id="ed-menu-edit">Правка</button>
              <button class="ed-menu-btn" id="ed-menu-modes">Режимы</button>
              <button class="ed-menu-btn" id="ed-menu-view">Вид</button>
            </div>
            <div class="ed-divider"></div>
            <!-- Режимы трансформации Gizmo W, E, R -->
            <button class="ed-btn-tool" id="ed-top-mode-q" title="Q — режим выбора">🖱 Выбор</button>
            <button class="ed-btn-tool active" id="ed-top-mode-w" title="W — перемещение (Translate)">W: Сдвиг</button>
            <button class="ed-btn-tool" id="ed-top-mode-e" title="E — вращение (Rotate)">E: Поворот</button>
            <button class="ed-btn-tool" id="ed-top-mode-r" title="R — масштабирование (Scale)">R: Масштаб</button>
          </div>

          <div class="ed-top-center">
            <!-- Координаты & Привязки -->
            <div class="ed-snap-group">
              <span>Сетка:</span>
              <select id="ed-top-grid-snap" class="ed-select-compact">
                <option value="0">Выкл</option>
                <option value="0.25">0.25 м</option>
                <option value="0.5">0.5 м</option>
                <option value="1.0" selected>1.0 м</option>
                <option value="2.0">2.0 м</option>
                <option value="5.0">5.0 м</option>
              </select>
            </div>
            <div class="ed-snap-group">
              <span>Угол:</span>
              <select id="ed-top-angle-snap" class="ed-select-compact">
                <option value="0">Выкл</option>
                <option value="15" selected>15°</option>
                <option value="45">45°</option>
                <option value="90">90°</option>
              </select>
            </div>
            <div class="ed-snap-group">
              <span>Камера:</span>
              <select id="ed-top-cam-speed" class="ed-select-compact">
                <option value="0.5">0.5×</option>
                <option value="1.0" selected>1.0×</option>
                <option value="2.0">2.0×</option>
                <option value="4.0">4.0×</option>
              </select>
            </div>
          </div>

          <div class="ed-top-right">
            <!-- Симуляция / Сохранение / Выход -->
            <button class="ed-btn-play" id="ed-top-btn-play" title="Запустить симуляцию персонажа во вьюпорте (Esc — возврат)">▶ Играть</button>
            <button class="ed-btn-save" id="ed-top-btn-save" title="Сохранить мир на сервер (Ctrl+S)">💾 Сохранить</button>
            <button class="ed-btn-close" id="ed-top-btn-close" title="Закрыть редактор (F2)">✕</button>
          </div>

          <!-- Выпадающие меню тулбара -->
          <div class="ed-menu-dropdown" id="ed-dropdown-file">
            <div class="ed-menu-item" id="ed-mi-save"><span>💾 Сохранить сцену</span><span class="ed-menu-item-shortcut">Ctrl+S</span></div>
            <div class="ed-menu-item" id="ed-mi-reload"><span>🔄 Перезагрузить мир</span></div>
            <div class="ed-menu-item" id="ed-mi-upload"><span>📤 Загрузить файлы в библиотеку…</span></div>
            <div class="ed-menu-sep"></div>
            <div class="ed-menu-item" id="ed-mi-close"><span>✕ Закрыть редактор</span><span class="ed-menu-item-shortcut">F2</span></div>
          </div>

          <div class="ed-menu-dropdown" id="ed-dropdown-edit">
            <div class="ed-menu-item" id="ed-mi-undo"><span>↩️ Отменить</span><span class="ed-menu-item-shortcut">Ctrl+Z</span></div>
            <div class="ed-menu-item" id="ed-mi-redo"><span>↪️ Повторить</span><span class="ed-menu-item-shortcut">Ctrl+Y</span></div>
            <div class="ed-menu-sep"></div>
            <div class="ed-menu-item" id="ed-mi-dup"><span>📋 Дублировать объект</span><span class="ed-menu-item-shortcut">Ctrl+D</span></div>
            <div class="ed-menu-item" id="ed-mi-del"><span>🗑️ Удалить объект</span><span class="ed-menu-item-shortcut">Del</span></div>
            <div class="ed-menu-item" id="ed-mi-focus"><span>🎯 Фокус камеры</span><span class="ed-menu-item-shortcut">F</span></div>
            <div class="ed-menu-item" id="ed-mi-snap"><span>📌 Опустить на землю</span><span class="ed-menu-item-shortcut">Y</span></div>
          </div>

          <div class="ed-menu-dropdown" id="ed-dropdown-modes">
            <div class="ed-menu-item" id="ed-mi-m-select"><span>🖱️ Выбор & трансформация</span><span class="ed-menu-item-shortcut">Q</span></div>
            <div class="ed-menu-item" id="ed-mi-m-foliage"><span>🌿 Кисть растительности</span></div>
            <div class="ed-menu-item" id="ed-mi-m-paint"><span>🎨 Кисть террейна</span></div>
            <div class="ed-menu-item" id="ed-mi-m-bsp"><span>🧱 CSG BSP Геометрия</span></div>
            <div class="ed-menu-item" id="ed-mi-m-collision"><span>🛡️ Блоки коллизий</span></div>
            <div class="ed-menu-item" id="ed-mi-m-zones"><span>⚔️ Зоны & Споты</span></div>
            <div class="ed-menu-item" id="ed-mi-m-ground"><span>🛤️ Дороги & Земля</span></div>
            <div class="ed-menu-item" id="ed-mi-m-weapon"><span>🗡️ Хват оружия</span></div>
          </div>

          <div class="ed-menu-dropdown" id="ed-dropdown-view">
            <div class="ed-menu-item" id="ed-mi-v-outliner"><span>🌲 Иерархия (Outliner)</span></div>
            <div class="ed-menu-item" id="ed-mi-v-place"><span>➕ Создать (Place)</span></div>
            <div class="ed-menu-item" id="ed-mi-v-modes"><span>🛠️ Панель режимов</span></div>
            <div class="ed-menu-sep"></div>
            <div class="ed-menu-item" id="ed-mi-win-foliage"><span>⧉ Открыть окно: Растительность</span></div>
            <div class="ed-menu-item" id="ed-mi-win-paint"><span>⧉ Открыть окно: Кисть террейна</span></div>
            <div class="ed-menu-item" id="ed-mi-win-bsp"><span>⧉ Открыть окно: BSP Геометрия</span></div>
            <div class="ed-menu-item" id="ed-mi-win-collision"><span>⧉ Открыть окно: Блоки коллизий</span></div>
            <div class="ed-menu-item" id="ed-mi-win-zones"><span>⧉ Открыть окно: Зоны охоты</span></div>
            <div class="ed-menu-item" id="ed-mi-win-weapon"><span>⧉ Открыть окно: Хват оружия</span></div>
          </div>
        </header>

        <!-- ГЛАВНАЯ РАБОЧАЯ ОБЛАСТЬ (WORKSPACE) -->
        <div id="editor-workspace">
          <!-- ЛЕВЫЙ ДОК: OUTLINER & PLACE ACTORS & MODES -->
          <aside id="editor-left-dock" class="ed-dock-panel">
            <div class="ed-panel-tabs">
              <button class="ed-panel-tab active" data-tab="outliner">🌲 Иерархия (Outliner)</button>
              <button class="ed-panel-tab" data-tab="place">➕ Создать (Place)</button>
              <button class="ed-panel-tab" data-tab="modes">🛠️ Режимы</button>
            </div>

            <!-- Вкладка 1: Иерархия сцены (Outliner) -->
            <div class="ed-panel-body" id="ed-tab-outliner">
              <div class="ed-search-bar">
                <input type="text" id="ed-outliner-search" class="ed-search-input" placeholder="🔍 Поиск объекта по имени/ID...">
              </div>
              <div class="ed-filter-chips" id="ed-outliner-chips">
                <span class="ed-filter-chip active" data-cat="all">Все</span>
                <span class="ed-filter-chip" data-cat="props">Пропы</span>
                <span class="ed-filter-chip" data-cat="foliage">Растительность</span>
                <span class="ed-filter-chip" data-cat="buildings">Здания</span>
                <span class="ed-filter-chip" data-cat="npcs">NPC</span>
                <span class="ed-filter-chip" data-cat="mobs">Мобы</span>
                <span class="ed-filter-chip" data-cat="lights">Свет</span>
                <span class="ed-filter-chip" data-cat="collision">Коллизии</span>
                <span class="ed-filter-chip" data-cat="bsp">BSP</span>
              </div>
              <div class="ed-tree-container" id="ed-outliner-tree"></div>
            </div>

            <!-- Вкладка 2: Палитра создания объектов (Place Actors) -->
            <div class="ed-panel-body" id="ed-tab-place" style="display:none; padding:10px; gap:8px;">
              <div style="font-weight:bold; color:var(--ed-accent-primary); font-size:11px; margin-bottom:4px;">БЫСТРАЯ ВСТАВКА В МИР:</div>
              <button class="ed-btn-tool" id="ed-place-prop" style="justify-content:flex-start; padding:8px;">📦 3D-модель (из библиотеки)</button>
              <button class="ed-btn-tool" id="ed-place-barrier" style="justify-content:flex-start; padding:8px;">🛡️ Физ. блок коллизии (Box)</button>
              <button class="ed-btn-tool" id="ed-place-spot" style="justify-content:flex-start; padding:8px;">⚔️ Спот мобов (Mob Spawn)</button>
              <button class="ed-btn-tool" id="ed-place-npc" style="justify-content:flex-start; padding:8px;">🧙 Городской NPC (Базовый)</button>
              <button class="ed-btn-tool" id="ed-place-light" style="justify-content:flex-start; padding:8px;">💡 Источник света (Point Light)</button>
              <button class="ed-btn-tool" id="ed-place-bsp" style="justify-content:flex-start; padding:8px;">🧱 BSP-куб (Геометрия)</button>
              <button class="ed-btn-tool" id="ed-place-tree" style="justify-content:flex-start; padding:8px;">🌲 Сосна / Дерево</button>
              <button class="ed-btn-tool" id="ed-place-house" style="justify-content:flex-start; padding:8px;">🏠 Жилой дом (House 01)</button>
            </div>

            <!-- Вкладка 3: Панель активных режимов -->
            <div class="ed-panel-body" id="ed-tab-modes" style="display:none; padding:10px; gap:6px;">
              <div style="font-weight:bold; color:var(--ed-accent-primary); font-size:11px; margin-bottom:4px;">РЕЖИМЫ РАБОТЫ (MODES):</div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin-bottom:8px;">
                <button class="ed-btn-tool active" id="ed-mode-btn-select" style="font-size:10.5px; justify-content:center;">🖱️ Выбор (Q)</button>
                <button class="ed-btn-tool" id="ed-mode-btn-foliage" style="font-size:10.5px; justify-content:center;">🌿 Зелень</button>
                <button class="ed-btn-tool" id="ed-mode-btn-paint" style="font-size:10.5px; justify-content:center;">🎨 Террейн</button>
                <button class="ed-btn-tool" id="ed-mode-btn-bsp" style="font-size:10.5px; justify-content:center;">🧱 BSP CSG</button>
                <button class="ed-btn-tool" id="ed-mode-btn-collision" style="font-size:10.5px; justify-content:center;">🛡️ Коллизии</button>
                <button class="ed-btn-tool" id="ed-mode-btn-zones" style="font-size:10.5px; justify-content:center;">⚔️ Зоны</button>
                <button class="ed-btn-tool" id="ed-mode-btn-ground" style="font-size:10.5px; justify-content:center;">🛤️ Земля</button>
                <button class="ed-btn-tool" id="ed-mode-btn-weapon" style="font-size:10.5px; justify-content:center;">🗡️ Оружие</button>
              </div>

              <!-- Заголовок активного режима с кнопкой открепления в отдельное окно -->
              <div class="ed-mode-tool-header" id="ed-mode-tool-header">
                <span class="ed-mode-tool-title" id="ed-mode-tool-title">🖱️ Режим: Выбор</span>
                <button class="ed-btn-detach" id="ed-mode-btn-detach" title="Открыть инструмент в отдельном окне поверх вьюпорта">⧉ В окно</button>
              </div>

              <!-- Контейнер для инструментов активного режима -->
              <div id="ed-mode-tool-host"></div>
            </div>

            <div class="ed-splitter-v" id="ed-split-left"></div>
          </aside>

          <!-- ЦЕНТРАЛЬНОЕ 3D-ОКНО (VIEWPORT) -->
          <main id="editor-center-viewport-wrapper">
            <div id="editor-viewport-container"></div>

            <!-- Оверлей информации вьюпорта -->
            <div id="editor-viewport-overlay">
              <div class="ed-vp-badge-box">
                <span id="ed-stat-fps">FPS: --</span>
                <span>·</span>
                <span id="ed-stat-cam">Cam: [0, 0, 0]</span>
                <span>·</span>
                <span id="ed-stat-sel" style="color:var(--ed-accent-primary);">Выделено: Нет</span>
              </div>
              <div class="ed-vp-tools">
                <button class="ed-vp-tool-btn" id="ed-btn-view-lit" title="Режим освещения">💡 Lit</button>
                <button class="ed-vp-tool-btn" id="ed-btn-view-wire" title="Каркасная сетка (Wireframe)">🕸️ Wire</button>
                <button class="ed-vp-tool-btn" id="ed-btn-view-grid" title="Сетка координат">📏 Grid</button>
                <button class="ed-vp-tool-btn" id="ed-btn-focus-cam" title="Центрировать камеру на объекте (F)">🎯 Фокус (F)</button>
              </div>
            </div>

            <!-- Зона подсветки при переносе модели во вьюпорт -->
            <div class="ed-viewport-drop-hint" id="ed-viewport-drop-hint">
              <span>✨ Отпустите мышь, чтобы разместить объект в мире</span>
            </div>
          </main>

          <!-- ПРАВЫЙ ДОК: DETAILS / INSPECTOR -->
          <aside id="editor-right-dock" class="ed-dock-panel">
            <div class="ed-splitter-v" id="ed-split-right"></div>
            <div class="ed-panel-tabs">
              <button class="ed-panel-tab active">📋 Свойства (Inspector)</button>
            </div>
            <div class="ed-panel-body" id="ed-inspector-scroll">
              <div class="ed-inspector-header">
                <div class="ed-actor-title" id="ed-inspector-actor-title">
                  <span>📦</span>
                  <span id="ed-inspector-actor-name">Объект не выбран</span>
                </div>
                <div style="display:flex; gap:4px;">
                  <button class="ed-btn-tool" id="ed-insp-btn-dup" title="Дублировать (Ctrl+D)" style="padding:2px 6px;">📋</button>
                  <button class="ed-btn-tool" id="ed-insp-btn-del" title="Удалить (Del)" style="padding:2px 6px; color:#ff8888;">🗑️</button>
                </div>
              </div>

              <!-- Контейнер свойств объекта или мира -->
              <div id="ed-inspector-slot" style="padding:8px;">
                <!-- Вариант А: Выбран актер сцены -->
                <div id="ed-insp-actor-view" style="display:none;">
                  <div class="ed-insp-quick-actions">
                    <button class="ed-btn-tool" id="ed-insp-act-dup" title="Дублировать объект (Ctrl+D)">📋 Дубликат</button>
                    <button class="ed-btn-tool" id="ed-insp-act-snap" title="Опустить на землю (Y)">📌 На землю</button>
                    <button class="ed-btn-tool" id="ed-insp-act-focus" title="Камера к объекту (F)">🎯 Фокус</button>
                    <button class="ed-btn-tool" id="ed-insp-act-del" title="Удалить (Del)" style="color:#ff8888;">🗑️ Удалить</button>
                  </div>
                  <div id="ed-selected-info-host"></div>
                </div>

                <!-- Вариант Б: Ничего не выбрано — World Settings -->
                <div id="ed-insp-world-view" class="ed-world-settings-card">
                  <div class="ed-world-title">☀️ Параметры мира & Окружение</div>
                  <div id="ed-daynight-host"></div>

                  <div style="background:rgba(0,0,0,0.3); border:1px solid var(--ed-border); border-radius:4px; padding:6px;">
                    <div style="color:var(--ed-accent-primary); font-weight:bold; font-size:10px; margin-bottom:4px;">ПРИВЯЗКИ:</div>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin-bottom:4px; font-size:10.5px;">
                      <input type="checkbox" id="ed-world-chk-terrain-snap" />
                      <span>📌 Привязка к ландшафту (Terrain Y)</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:10.5px;">
                      <input type="checkbox" id="ed-world-chk-grid-snap" />
                      <span>📏 Сетка 0.5м (при перемещении)</span>
                    </label>
                  </div>

                  <div>
                    <div style="color:var(--ed-text-muted); font-size:10px; margin-bottom:4px; font-weight:600;">ОБЪЕКТЫ В МИРЕ:</div>
                    <div class="ed-stats-pill-grid">
                      <div class="ed-stat-pill">
                        <span class="ed-stat-pill-label">Всего</span>
                        <span class="ed-stat-pill-value" id="ed-stat-world-total">0</span>
                      </div>
                      <div class="ed-stat-pill">
                        <span class="ed-stat-pill-label">Пропы</span>
                        <span class="ed-stat-pill-value" id="ed-stat-world-props">0</span>
                      </div>
                      <div class="ed-stat-pill">
                        <span class="ed-stat-pill-label">Коллизии</span>
                        <span class="ed-stat-pill-value" id="ed-stat-world-col">0</span>
                      </div>
                      <div class="ed-stat-pill">
                        <span class="ed-stat-pill-label">NPC & Мобы</span>
                        <span class="ed-stat-pill-value" id="ed-stat-world-actors">0</span>
                      </div>
                    </div>
                  </div>

                  <div style="padding:6px; text-align:center; color:var(--ed-text-dim); font-size:10px; border-top:1px solid var(--ed-border);">
                    💡 Кликните любой объект в мире или в Outliner для редактирования Transform
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <!-- НИЖНИЙ ДОК: CONTENT BROWSER (GODOT / UNREAL DRAWER) -->
        <footer id="editor-bottom-dock">
          <div class="ed-splitter-h" id="ed-split-bottom"></div>
          <div class="ed-cb-header">
            <div class="ed-cb-breadcrumbs" id="ed-cb-breadcrumbs">
              <span class="ed-cb-crumb" data-folder="all">📁 Content</span>
              <span>/</span>
              <span id="ed-cb-current-folder" style="color:var(--ed-text-main); font-weight:600;">Props</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="text" id="ed-cb-search" class="ed-search-input" placeholder="🔍 Поиск ассетов..." style="width:160px; padding:3px 6px;">
              <label class="ed-btn-tool" style="cursor:pointer; margin:0;" title="Загрузить 3D модель или текстуру с компьютера">
                📤 Загрузить файлы
                <input type="file" id="ed-file-upload-input" multiple accept=".fbx,.glb,.gltf,.obj,.png,.webp,.jpg,.jpeg" style="display:none;">
              </label>
              <button class="ed-menu-btn" id="ed-cb-toggle-btn" title="Свернуть / развернуть панель">▼</button>
            </div>
          </div>
          <div class="ed-cb-body">
            <!-- Дерево папок слева -->
            <div class="ed-cb-folders" id="ed-cb-folders">
              <div class="ed-cb-folder-item active" data-folder="all">📦 Все ассеты</div>
              <div class="ed-cb-folder-item" data-folder="trees">🌲 Деревья & Лес</div>
              <div class="ed-cb-folder-item" data-folder="bushes">🌿 Кусты & Растения</div>
              <div class="ed-cb-folder-item" data-folder="houses">🏠 Здания & Дома</div>
              <div class="ed-cb-folder-item" data-folder="engineer_houses">⚙️ Дома инженеров</div>
              <div class="ed-cb-folder-item" data-folder="forges">🔨 Кузницы</div>
              <div class="ed-cb-folder-item" data-folder="shops_stalls">🏪 Магазины & Лавки</div>
              <div class="ed-cb-folder-item" data-folder="steampunk">🏭 Оборудование & Пар</div>
              <div class="ed-cb-folder-item" data-folder="monuments">🏛️ Монументы</div>
              <div class="ed-cb-folder-item" data-folder="textures">🎨 Текстуры</div>
              <div class="ed-cb-folder-item" data-folder="custom">✨ Загруженные (Custom)</div>
            </div>
            <!-- Сетка карточек ассетов справа -->
            <div class="ed-cb-asset-grid" id="ed-cb-asset-grid"></div>
            <!-- Дропзона при перетаскивании файлов из ОС -->
            <div class="ed-cb-dropzone" id="ed-cb-dropzone">
              <span>📥 Перетащите файлы (.fbx, .glb, .png, .webp) сюда для загрузки в библиотеку</span>
            </div>
          </div>
        </footer>

        <!-- ВСПЛЫВАЮЩЕЕ УВЕДОМЛЕНИЕ (TOAST) -->
        <div class="ed-toast" id="editor-engine-toast"></div>
      `;
      document.body.appendChild(layout);
    }

    editor.engineLayout = layout;

    // 3. Распределяем компоненты legacy-панели по нужным окнам и докам
    distributeEditorPanels(editor, layout);

    // 4. Привязка обработчиков тулбара и верхних меню
    setupToolbarEvents(editor, layout);

    // 5. Настройка вкладок левого дока (Outliner, Place, Modes)
    setupLeftDockTabs(editor, layout);

    // 6. Настройка Outliner и Content Browser
    setupOutliner(editor, layout);
    setupContentBrowser(editor, layout);

    // 7. Настройка Drag & Drop (из ОС в браузер и из браузера во вьюпорт)
    setupDragAndDrop(editor, layout);

    // 8. Настройка сплиттеров изменения размеров панелей
    setupSplitters(editor, layout);
  }

  // ============================================================
  //  РАСПРЕДЕЛЕНИЕ ПАНЕЛЕЙ ПО ОКНАМ И ИНСПЕКТОРУ
  // ============================================================
  function distributeEditorPanels(editor, layout) {
    if (!editor.panel) return;
    // Старая монолитная панель со свалкой скрывается
    editor.panel.style.display = 'none';

    // 1. Переносим подробности выбранного объекта в Инспектор
    const selInfo = editor.panel.querySelector('#ed-selected-info');
    const selHost = layout.querySelector('#ed-selected-info-host');
    if (selInfo && selHost && selInfo.parentNode !== selHost) {
      selInfo.style.background = 'transparent';
      selInfo.style.border = 'none';
      selInfo.style.padding = '0';
      selHost.appendChild(selInfo);
    }

    // 2. Переносим время суток/солнце в World Settings инспектора
    const dayNight = editor.panel.querySelector('#ed-daynight-box');
    const dayHost = layout.querySelector('#ed-daynight-host');
    if (dayNight && dayHost && dayNight.parentNode !== dayHost) {
      dayNight.style.background = 'transparent';
      dayNight.style.border = 'none';
      dayNight.style.padding = '0';
      dayHost.appendChild(dayNight);
    }

    // 3. Реестр инструментов режимов
    const tools = {
      foliage: { el: editor.panel.querySelector('#ed-foliage-panel'), title: 'Кисть растительности & Лес', icon: '🌿' },
      paint: { el: editor.panel.querySelector('#ed-paint-panel'), title: 'Кисть террейна (Landscape)', icon: '🎨' },
      bsp: { el: editor.panel.querySelector('#ed-bsp-panel'), title: 'BSP CSG Геометрия', icon: '🧱' },
      collision: { el: editor.panel.querySelector('#ed-collision-panel'), title: 'Блоки физ. коллизий', icon: '🛡️' },
      zones: { el: editor.panel.querySelector('#ed-zones-box'), title: 'Зоны охоты & Спавны', icon: '⚔️', extra: [editor.panel.querySelector('#ed-sites-box')] },
      ground: { el: editor.panel.querySelector('#ed-ground-box'), title: 'Земля & Дороги террейна', icon: '🛤️' },
      weapon: { el: editor.panel.querySelector('#ed-weapon-grip-box'), title: 'Хват оружия (RightHand)', icon: '🗡️' }
    };

    // Настраиваем логику режимов и плавающих окон
    setupModesAndFloatingWindows(editor, layout, tools);

    // Настраиваем чистое поведение инспектора (Actor vs World Settings)
    setupInspector(editor, layout);
  }

  // ============================================================
  //  СИСТЕМА РЕЖИМОВ И ПЛАВАЮЩИХ ОКОН (FLOATING DETACHED WINDOWS)
  // ============================================================
  const floatingWindows = new Map();
  let currentActiveMode = 'select';

  function setupModesAndFloatingWindows(editor, layout, tools) {
    const host = layout.querySelector('#ed-mode-tool-host');
    const titleEl = layout.querySelector('#ed-mode-tool-title');
    const detachBtn = layout.querySelector('#ed-mode-btn-detach');

    function dockTool(modeId) {
      const tool = tools[modeId];
      if (!tool) return;
      const win = floatingWindows.get(modeId);
      if (win) {
        win.style.display = 'none';
      }
      tool._detached = false;
      if (currentActiveMode === modeId) {
        showActiveTool(modeId);
      }
      showToast(editor, `Инструмент «${tool.title}» закреплён в панели`);
    }

    function detachTool(modeId) {
      const tool = tools[modeId];
      if (!tool || !tool.el) return;
      tool._detached = true;

      let win = floatingWindows.get(modeId);
      if (!win) {
        win = document.createElement('div');
        win.className = 'ed-floating-window';
        win.id = `ed-float-win-${modeId}`;
        const offset = (floatingWindows.size * 28) % 240;
        win.style.left = `${Math.max(260, Math.min(window.innerWidth - 440, 280 + offset))}px`;
        win.style.top = `${80 + offset}px`;
        win.innerHTML = `
          <div class="ed-floating-header">
            <div class="ed-floating-title">
              <span>${tool.icon}</span>
              <span>${tool.title}</span>
            </div>
            <div class="ed-floating-actions">
              <button class="ed-floating-btn btn-dock" title="Закрепить инструмент обратно в левую панель">⇲ Закрепить</button>
              <button class="ed-floating-btn btn-close" title="Закрыть окно">✕</button>
            </div>
          </div>
          <div class="ed-floating-body"></div>
        `;
        document.body.appendChild(win);
        setupFloatingDrag(win);

        win.querySelector('.btn-dock').onclick = () => dockTool(modeId);
        win.querySelector('.btn-close').onclick = () => dockTool(modeId);
        floatingWindows.set(modeId, win);
      }

      const body = win.querySelector('.ed-floating-body');
      tool.el.style.display = 'block';
      body.appendChild(tool.el);
      if (tool.extra) {
        tool.extra.forEach(ex => { if (ex) { ex.style.display = 'block'; body.appendChild(ex); } });
      }
      win.style.display = 'flex';
      document.querySelectorAll('.ed-floating-window').forEach(w => w.classList.remove('active-focus'));
      win.classList.add('active-focus');

      if (currentActiveMode === modeId) {
        showActiveTool(modeId);
      }
      showToast(editor, `Инструмент «${tool.title}» открыт в отдельном окне`);
    }

    function showActiveTool(modeId) {
      if (!host) return;
      const tool = tools[modeId];

      if (modeId === 'select') {
        if (titleEl) titleEl.innerHTML = '<span>🖱️</span><span>Режим: Выбор и пивот</span>';
        if (detachBtn) detachBtn.style.display = 'none';
        host.innerHTML = `
          <div style="padding:12px; color:var(--ed-text-muted); line-height:1.5; font-size:11px; background:rgba(0,0,0,0.2); border-radius:6px; border:1px solid var(--ed-border);">
            <div style="font-weight:bold; color:var(--ed-accent-primary); margin-bottom:6px;">🖱️ Режим выбора объектов</div>
            <div>• <b>ЛКМ</b> по объекту во вьюпорте или Outliner — выбрать.</div>
            <div>• <b>W</b> — Сдвиг (Translate Gizmo)</div>
            <div>• <b>E</b> — Вращение (Rotate Gizmo)</div>
            <div>• <b>R</b> — Масштаб (Scale Gizmo)</div>
            <div>• <b>Ctrl+D</b> — Дублировать выбранное</div>
            <div>• <b>Del</b> — Удалить выбранное</div>
            <div>• <b>F</b> — Центрировать камеру</div>
          </div>
        `;
        return;
      }

      if (!tool || !tool.el) {
        host.innerHTML = `<div style="padding:16px; color:var(--ed-text-dim); text-align:center;">Режим ${modeId} активен</div>`;
        return;
      }

      if (titleEl) titleEl.innerHTML = `<span>${tool.icon}</span><span>${tool.title}</span>`;
      if (detachBtn) {
        detachBtn.style.display = 'flex';
        detachBtn.textContent = tool._detached ? '⇲ Закрепить' : '⧉ В окно';
        detachBtn.onclick = () => {
          if (tool._detached) dockTool(modeId);
          else detachTool(modeId);
        };
      }

      if (tool._detached) {
        host.innerHTML = `
          <div style="padding:20px 10px; text-align:center; color:var(--ed-text-muted); font-size:11px; background:rgba(0,0,0,0.2); border-radius:6px; border:1px solid var(--ed-border);">
            <div style="font-size:24px; margin-bottom:6px;">${tool.icon}</div>
            <div style="font-weight:bold; color:var(--ed-accent-primary); margin-bottom:4px;">${tool.title}</div>
            <div>Инструмент открыт в отдельном окне поверх 3D вьюпорта.</div>
            <button class="ed-btn-tool" style="margin:12px auto 0; justify-content:center; width:fit-content;" id="btn-dock-inline-${modeId}">⇲ Вернуть в панель</button>
          </div>
        `;
        const inlineBtn = host.querySelector(`#btn-dock-inline-${modeId}`);
        if (inlineBtn) inlineBtn.onclick = () => dockTool(modeId);
      } else {
        host.innerHTML = '';
        tool.el.style.display = 'block';
        host.appendChild(tool.el);
        if (tool.extra) {
          tool.extra.forEach(ex => { if (ex) { ex.style.display = 'block'; host.appendChild(ex); } });
        }
      }
    }

    function switchMode(modeId) {
      currentActiveMode = modeId;
      if (modeId !== 'select') {
        activateLeftDockTab(layout, 'modes');
      }
      layout.querySelectorAll('#ed-tab-modes .ed-btn-tool').forEach(btn => {
        btn.classList.toggle('active', btn.id === `ed-mode-btn-${modeId}`);
      });
      showActiveTool(modeId);
      if (typeof editor.setWorkspaceMode === 'function') {
        editor.setWorkspaceMode(modeId);
      }
    }

    editor.switchActiveEngineMode = switchMode;
    editor.detachEngineToolToWindow = detachTool;
    editor.dockEngineTool = dockTool;

    // Кнопки сетки режимов
    const modeMap = {
      '#ed-mode-btn-select': 'select',
      '#ed-mode-btn-foliage': 'foliage',
      '#ed-mode-btn-paint': 'paint',
      '#ed-mode-btn-bsp': 'bsp',
      '#ed-mode-btn-collision': 'collision',
      '#ed-mode-btn-zones': 'zones',
      '#ed-mode-btn-ground': 'ground',
      '#ed-mode-btn-weapon': 'weapon'
    };
    Object.entries(modeMap).forEach(([sel, m]) => {
      const b = layout.querySelector(sel);
      if (b) b.onclick = () => switchMode(m);
    });

    switchMode('select');
  }

  function setupFloatingDrag(win) {
    const header = win.querySelector('.ed-floating-header');
    if (!header) return;
    let isDrag = false;
    let startX = 0, startY = 0, initLeft = 0, initTop = 0;

    header.onmousedown = (e) => {
      if (e.target.closest('button')) return;
      isDrag = true;
      startX = e.clientX;
      startY = e.clientY;
      initLeft = win.offsetLeft;
      initTop = win.offsetTop;
      document.querySelectorAll('.ed-floating-window').forEach(w => w.classList.remove('active-focus'));
      win.classList.add('active-focus');
      win.style.zIndex = 970;

      const onMove = (ev) => {
        if (!isDrag) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        win.style.left = Math.max(10, Math.min(window.innerWidth - win.offsetWidth - 10, initLeft + dx)) + 'px';
        win.style.top = Math.max(46, Math.min(window.innerHeight - 80, initTop + dy)) + 'px';
      };
      const onUp = () => {
        isDrag = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    win.onmousedown = () => {
      document.querySelectorAll('.ed-floating-window').forEach(w => w.classList.remove('active-focus'));
      win.classList.add('active-focus');
    };
  }

  // ============================================================
  //  ЧИСТЫЙ ИНСПЕКТОР (DETAILS VS WORLD SETTINGS)
  // ============================================================
  function setupInspector(editor, layout) {
    const actorView = layout.querySelector('#ed-insp-actor-view');
    const worldView = layout.querySelector('#ed-insp-world-view');
    const titleName = layout.querySelector('#ed-inspector-actor-name');

    const doDup = () => {
      if (editor.duplicateObject) editor.duplicateObject();
      else {
        const btn = document.querySelector('#ed-btn-duplicate');
        if (btn) btn.click();
      }
      if (editor.refreshOutliner) editor.refreshOutliner();
    };
    const doDel = () => {
      if (editor.deleteSelectedObject) editor.deleteSelectedObject();
      else {
        const btn = document.querySelector('#ed-btn-delete');
        if (btn) btn.click();
      }
      if (editor.refreshOutliner) editor.refreshOutliner();
    };
    const doSnap = () => {
      if (editor.snapSelectedToGround) editor.snapSelectedToGround();
      else {
        const btn = document.querySelector('#ed-btn-snap-ground');
        if (btn) btn.click();
      }
    };
    const doFocus = () => {
      if (editor.selectedObject) focusCameraOnObject(editor, editor.selectedObject);
    };

    // Привязка кнопок действий над объектом
    const actDup = layout.querySelector('#ed-insp-act-dup');
    const actDel = layout.querySelector('#ed-insp-act-del');
    const actSnap = layout.querySelector('#ed-insp-act-snap');
    const actFocus = layout.querySelector('#ed-insp-act-focus');
    if (actDup) actDup.onclick = doDup;
    if (actDel) actDel.onclick = doDel;
    if (actSnap) actSnap.onclick = doSnap;
    if (actFocus) actFocus.onclick = doFocus;

    const topDup = layout.querySelector('#ed-insp-btn-dup');
    const topDel = layout.querySelector('#ed-insp-btn-del');
    if (topDup) topDup.onclick = doDup;
    if (topDel) topDel.onclick = doDel;

    // Синхронизация чекбоксов привязок
    const chkTerr = layout.querySelector('#ed-world-chk-terrain-snap');
    const chkGrid = layout.querySelector('#ed-world-chk-grid-snap');
    const origTerr = document.querySelector('#ed-chk-terrain-snap');
    const origGrid = document.querySelector('#ed-chk-grid-snap');

    if (chkTerr) {
      if (origTerr) chkTerr.checked = origTerr.checked;
      chkTerr.onchange = () => {
        if (origTerr) {
          origTerr.checked = chkTerr.checked;
          origTerr.dispatchEvent(new Event('change'));
        }
      };
    }
    if (chkGrid) {
      if (origGrid) chkGrid.checked = origGrid.checked;
      chkGrid.onchange = () => {
        if (origGrid) {
          origGrid.checked = chkGrid.checked;
          origGrid.dispatchEvent(new Event('change'));
        }
      };
    }

    function refreshInspector() {
      const sel = editor.selectedObject;
      if (sel) {
        if (actorView) actorView.style.display = 'block';
        if (worldView) worldView.style.display = 'none';
        if (titleName) titleName.textContent = sel.name || sel.id || 'Выбранный объект';

        // Быстрый переход к хвату оружия, если выбран спавн игрока
        const isPl = sel.type === 'player' || sel.id === 'player_spawn' || (sel.targetData && sel.targetData === editor.game.player);
        let wpnCard = layout.querySelector('#ed-insp-player-weapon-card');
        if (isPl) {
          if (!wpnCard) {
            wpnCard = document.createElement('div');
            wpnCard.id = 'ed-insp-player-weapon-card';
            wpnCard.style.cssText = 'margin:10px 0; padding:10px; background:rgba(60,40,20,0.55); border:1px solid #aa7744; border-radius:6px;';
            wpnCard.innerHTML = `
              <div style="font-weight:bold; color:#ffcc88; font-size:11px; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <span>🗡️</span><span>Хват оружия (RightHand)</span>
              </div>
              <div style="font-size:10px; color:var(--ed-text-muted); margin-bottom:8px; line-height:1.4;">
                Настроить положение (X/Y/Z), вращение и длину оружия в правой руке:
              </div>
              <button type="button" class="ed-btn-tool" id="ed-btn-open-weapon-mode" style="width:100%; justify-content:center; background:#44331b; color:#ffe066; border:1px solid #8b6e3a; font-weight:bold; padding:7px; cursor:pointer;">
                🗡️ Настроить хват оружия
              </button>
            `;
            const host = layout.querySelector('#ed-selected-info-host');
            if (host && host.parentNode) host.parentNode.insertBefore(wpnCard, host.nextSibling);
            const btn = wpnCard.querySelector('#ed-btn-open-weapon-mode');
            if (btn) {
              btn.onclick = () => {
                if (typeof editor.switchActiveEngineMode === 'function') editor.switchActiveEngineMode('weapon');
                else {
                  const b = document.querySelector('#ed-mode-btn-weapon');
                  if (b) b.click();
                }
              };
            }
          } else {
            wpnCard.style.display = 'block';
          }
        } else if (wpnCard) {
          wpnCard.style.display = 'none';
        }
      } else {
        if (actorView) actorView.style.display = 'none';
        if (worldView) worldView.style.display = 'flex';
        if (titleName) titleName.textContent = 'Объект не выбран';
        const wpnCard = layout.querySelector('#ed-insp-player-weapon-card');
        if (wpnCard) wpnCard.style.display = 'none';

        const actors = collectSceneActors(editor);
        const totalEl = layout.querySelector('#ed-stat-world-total');
        const propsEl = layout.querySelector('#ed-stat-world-props');
        const colEl = layout.querySelector('#ed-stat-world-col');
        const actEl = layout.querySelector('#ed-stat-world-actors');

        if (totalEl) totalEl.textContent = actors.length;
        if (propsEl) propsEl.textContent = actors.filter(a => a.category === 'props' || a.category === 'foliage' || a.category === 'buildings').length;
        if (colEl) colEl.textContent = actors.filter(a => a.category === 'collision').length;
        if (actEl) actEl.textContent = actors.filter(a => a.category === 'npcs' || a.category === 'mobs').length;
      }
    }

    editor._refreshInspector = refreshInspector;

    let lastSel = undefined;
    setInterval(() => {
      if (!editor.enabled) return;
      if (editor.selectedObject !== lastSel) {
        lastSel = editor.selectedObject;
        refreshInspector();
      }
    }, 150);

    refreshInspector();
  }

  // ============================================================
  //  ТУЛБАР И ВЫПАДАЮЩИЕ МЕНЮ
  // ============================================================
  function setupToolbarEvents(editor, layout) {
    const btnW = layout.querySelector('#ed-top-mode-w');
    const btnE = layout.querySelector('#ed-top-mode-e');
    const btnR = layout.querySelector('#ed-top-mode-r');
    const btnQ = layout.querySelector('#ed-top-mode-q');

    function setActiveGizmo(m) {
      if (btnW) btnW.classList.toggle('active', m === 'translate');
      if (btnE) btnE.classList.toggle('active', m === 'rotate');
      if (btnR) btnR.classList.toggle('active', m === 'scale');
      if (btnQ) btnQ.classList.toggle('active', m === 'select');
    }

    if (btnW) btnW.onclick = () => { editor.setMode('translate'); setActiveGizmo('translate'); };
    if (btnE) btnE.onclick = () => { editor.setMode('rotate'); setActiveGizmo('rotate'); };
    if (btnR) btnR.onclick = () => { editor.setMode('scale'); setActiveGizmo('scale'); };
    if (btnQ) btnQ.onclick = () => { editor.setWorkspaceMode('select'); setActiveGizmo('select'); };

    // Выпадающие меню тулбара
    function bindMenuDropdown(btnSel, dropSel) {
      const btn = layout.querySelector(btnSel);
      const drop = layout.querySelector(dropSel);
      if (!btn || !drop) return;
      btn.onclick = (e) => {
        e.stopPropagation();
        const wasOpen = drop.classList.contains('open');
        layout.querySelectorAll('.ed-menu-dropdown').forEach(d => d.classList.remove('open'));
        layout.querySelectorAll('.ed-menu-btn').forEach(b => b.classList.remove('active'));
        if (!wasOpen) {
          drop.classList.add('open');
          btn.classList.add('active');
          const rect = btn.getBoundingClientRect();
          drop.style.left = `${rect.left}px`;
          drop.style.top = `${rect.bottom + 4}px`;
        }
      };
    }

    bindMenuDropdown('#ed-menu-file', '#ed-dropdown-file');
    bindMenuDropdown('#ed-menu-edit', '#ed-dropdown-edit');
    bindMenuDropdown('#ed-menu-modes', '#ed-dropdown-modes');
    bindMenuDropdown('#ed-menu-view', '#ed-dropdown-view');

    window.addEventListener('click', () => {
      layout.querySelectorAll('.ed-menu-dropdown').forEach(d => d.classList.remove('open'));
      layout.querySelectorAll('.ed-menu-btn').forEach(b => b.classList.remove('active'));
    });

    // Обработчики пунктов меню File
    const miSave = layout.querySelector('#ed-mi-save');
    const miReload = layout.querySelector('#ed-mi-reload');
    const miUpload = layout.querySelector('#ed-mi-upload');
    const miClose = layout.querySelector('#ed-mi-close');

    if (miSave) miSave.onclick = () => layout.querySelector('#ed-top-btn-save').click();
    if (miReload) miReload.onclick = () => window.location.reload();
    if (miUpload) miUpload.onclick = () => layout.querySelector('#ed-file-upload-input').click();
    if (miClose) miClose.onclick = () => editor.toggle(false);

    // Обработчики пунктов меню Edit
    const miUndo = layout.querySelector('#ed-mi-undo');
    const miRedo = layout.querySelector('#ed-mi-redo');
    const miDup = layout.querySelector('#ed-mi-dup');
    const miDel = layout.querySelector('#ed-mi-del');
    const miFocus = layout.querySelector('#ed-mi-focus');
    const miSnap = layout.querySelector('#ed-mi-snap');

    if (miUndo) miUndo.onclick = () => { const b = document.querySelector('#ed-btn-undo'); if (b) b.click(); };
    if (miRedo) miRedo.onclick = () => { const b = document.querySelector('#ed-btn-redo'); if (b) b.click(); };
    if (miDup) miDup.onclick = () => { const b = document.querySelector('#ed-btn-duplicate'); if (b) b.click(); };
    if (miDel) miDel.onclick = () => { const b = document.querySelector('#ed-btn-delete'); if (b) b.click(); };
    if (miFocus) miFocus.onclick = () => { if (editor.selectedObject) focusCameraOnObject(editor, editor.selectedObject); };
    if (miSnap) miSnap.onclick = () => { const b = document.querySelector('#ed-btn-snap-ground'); if (b) b.click(); };

    // Обработчики пунктов меню Modes
    const modeItems = {
      '#ed-mi-m-select': 'select',
      '#ed-mi-m-foliage': 'foliage',
      '#ed-mi-m-paint': 'paint',
      '#ed-mi-m-bsp': 'bsp',
      '#ed-mi-m-collision': 'collision',
      '#ed-mi-m-zones': 'zones',
      '#ed-mi-m-ground': 'ground',
      '#ed-mi-m-weapon': 'weapon'
    };
    Object.entries(modeItems).forEach(([sel, m]) => {
      const item = layout.querySelector(sel);
      if (item) {
        item.onclick = () => {
          activateLeftDockTab(layout, 'modes');
          if (typeof editor.switchActiveEngineMode === 'function') editor.switchActiveEngineMode(m);
        };
      }
    });

    // Обработчики пунктов меню View (открытие плавающих окон)
    const viewWinItems = {
      '#ed-mi-win-foliage': 'foliage',
      '#ed-mi-win-paint': 'paint',
      '#ed-mi-win-bsp': 'bsp',
      '#ed-mi-win-collision': 'collision',
      '#ed-mi-win-zones': 'zones',
      '#ed-mi-win-weapon': 'weapon'
    };
    Object.entries(viewWinItems).forEach(([sel, m]) => {
      const item = layout.querySelector(sel);
      if (item) {
        item.onclick = () => {
          if (typeof editor.detachEngineToolToWindow === 'function') {
            editor.detachEngineToolToWindow(m);
          }
        };
      }
    });

    const miVOutliner = layout.querySelector('#ed-mi-v-outliner');
    const miVPlace = layout.querySelector('#ed-mi-v-place');
    const miVModes = layout.querySelector('#ed-mi-v-modes');
    if (miVOutliner) miVOutliner.onclick = () => activateLeftDockTab(layout, 'outliner');
    if (miVPlace) miVPlace.onclick = () => activateLeftDockTab(layout, 'place');
    if (miVModes) miVModes.onclick = () => activateLeftDockTab(layout, 'modes');

    // Grid snap
    const gridSel = layout.querySelector('#ed-top-grid-snap');
    if (gridSel) {
      gridSel.onchange = (e) => {
        editor.gridSnap = parseFloat(e.target.value) || 0;
        showToast(editor, editor.gridSnap > 0 ? `Привязка к сетке: ${editor.gridSnap} м` : 'Привязка к сетке выключена');
      };
    }

    // Angle snap
    const angleSel = layout.querySelector('#ed-top-angle-snap');
    if (angleSel) {
      angleSel.onchange = (e) => {
        editor.angleSnapDeg = parseFloat(e.target.value) || 0;
        showToast(editor, editor.angleSnapDeg > 0 ? `Привязка угла: ${editor.angleSnapDeg}°` : 'Привязка угла выключена');
      };
    }

    // Cam speed
    const camSel = layout.querySelector('#ed-top-cam-speed');
    if (camSel) {
      camSel.onchange = (e) => {
        const factor = parseFloat(e.target.value) || 1.0;
        if (editor.game && editor.game.cameraRig) {
          editor.game.cameraRig.flySpeed = (editor._baseFlySpeed || 25.0) * factor;
        }
        showToast(editor, `Скорость камеры: ${factor}×`);
      };
    }

    // Save
    const saveBtn = layout.querySelector('#ed-top-btn-save');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        saveBtn.textContent = '⏳ Сохранение…';
        saveBtn.disabled = true;
        try {
          await editor.saveToServer(false);
          showToast(editor, '✅ Сцена успешно сохранена на диск!');
        } catch (err) {
          showToast(editor, '❌ Ошибка сохранения: ' + (err.message || err));
        } finally {
          saveBtn.textContent = '💾 Сохранить';
          saveBtn.disabled = false;
        }
      };
    }

    // Close
    const closeBtn = layout.querySelector('#ed-top-btn-close');
    if (closeBtn) closeBtn.onclick = () => editor.toggle(false);

    // Play / Simulate mode toggle
    const playBtn = layout.querySelector('#ed-top-btn-play');
    if (playBtn) {
      playBtn.onclick = () => togglePlaySimulation(editor, playBtn);
    }

    // Viewport tools
    const btnWire = layout.querySelector('#ed-btn-view-wire');
    if (btnWire) {
      let wireOn = false;
      btnWire.onclick = () => {
        wireOn = !wireOn;
        btnWire.style.background = wireOn ? '#234d7d' : '';
        if (editor.scene) {
          editor.scene.traverse(o => {
            if (o.isMesh && o.material && !o.name.startsWith('_gizmo')) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach(m => { m.wireframe = wireOn; });
            }
          });
        }
        showToast(editor, wireOn ? 'Каркасный режим: ВКЛ' : 'Каркасный режим: ВЫКЛ');
      };
    }

    const btnFocus = layout.querySelector('#ed-btn-focus-cam');
    if (btnFocus) {
      btnFocus.onclick = () => {
        if (editor.selectedObject) {
          focusCameraOnObject(editor, editor.selectedObject);
        } else {
          showToast(editor, 'Выберите объект для центрирования камеры');
        }
      };
    }
  }

  function activateLeftDockTab(layout, targetTab) {
    const tabs = layout.querySelectorAll('#editor-left-dock .ed-panel-tab');
    tabs.forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === targetTab);
    });
    const bodyOutliner = layout.querySelector('#ed-tab-outliner');
    const bodyPlace = layout.querySelector('#ed-tab-place');
    const bodyModes = layout.querySelector('#ed-tab-modes');

    if (bodyOutliner) bodyOutliner.style.display = (targetTab === 'outliner') ? '' : 'none';
    if (bodyPlace) bodyPlace.style.display = (targetTab === 'place') ? '' : 'none';
    if (bodyModes) bodyModes.style.display = (targetTab === 'modes') ? '' : 'none';
  }

  // ============================================================
  //  ВКЛАДКИ ЛЕВОГО ДОКА
  // ============================================================
  function setupLeftDockTabs(editor, layout) {
    const tabs = layout.querySelectorAll('#editor-left-dock .ed-panel-tab');
    tabs.forEach(t => {
      t.onclick = () => {
        const targetTab = t.getAttribute('data-tab');
        activateLeftDockTab(layout, targetTab);
      };
    });

    // Быстрая вставка из палитры
    const placeActions = {
      '#ed-place-prop': () => editor.showPropsLibraryModal && editor.showPropsLibraryModal(),
      '#ed-place-barrier': () => { editor.spawnCollisionBarrier && editor.spawnCollisionBarrier(); if (editor.refreshOutliner) editor.refreshOutliner(); },
      '#ed-place-spot': () => { editor.spawnMobSpot && editor.spawnMobSpot(); if (editor.refreshOutliner) editor.refreshOutliner(); },
      '#ed-place-npc': () => { editor.spawnNPC && editor.spawnNPC(); if (editor.refreshOutliner) editor.refreshOutliner(); },
      '#ed-place-bsp': () => {
        activateLeftDockTab(layout, 'modes');
        if (typeof editor.switchActiveEngineMode === 'function') editor.switchActiveEngineMode('bsp');
        showToast(editor, 'Режим BSP: кликните и потяните во вьюпорте');
      },
      '#ed-place-tree': () => spawnQuickModel(editor, 'tree01.fbx', 'Сосна'),
      '#ed-place-house': () => spawnQuickModel(editor, 'house_01.fbx', 'Жилой дом')
    };

    Object.entries(placeActions).forEach(([sel, action]) => {
      const btn = layout.querySelector(sel);
      if (btn) btn.onclick = action;
    });
  }

  // ============================================================
  //  SCENE OUTLINER (ИЕРАРХИЯ ОБЪЕКТОВ)
  // ============================================================
  function setupOutliner(editor, layout) {
    const searchInput = layout.querySelector('#ed-outliner-search');
    const chips = layout.querySelectorAll('#ed-outliner-chips .ed-filter-chip');

    let currentCat = 'all';
    let searchQuery = '';

    if (searchInput) {
      searchInput.oninput = () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderOutlinerList(editor, currentCat, searchQuery);
      };
    }

    chips.forEach(chip => {
      chip.onclick = () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentCat = chip.getAttribute('data-cat') || 'all';
        renderOutlinerList(editor, currentCat, searchQuery);
      };
    });

    editor.refreshOutliner = () => renderOutlinerList(editor, currentCat, searchQuery);
  }

  function renderOutlinerList(editor, cat, query) {
    const container = document.querySelector('#ed-outliner-tree');
    if (!container) return;
    container.innerHTML = '';

    const items = collectSceneActors(editor);
    const q = String(query || '').trim().toLowerCase();
    const filtered = items.filter(it => {
      if (!it) return false;
      if (cat !== 'all' && it.category !== cat) return false;
      if (q) {
        const name = String(it.name || '').toLowerCase();
        const id = String(it.id || '').toLowerCase();
        if (!name.includes(q) && !id.includes(q)) return false;
      }
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div style="padding:12px; color:var(--ed-text-dim); text-align:center;">Объекты не найдены</div>';
      return;
    }

    filtered.slice(0, 300).forEach(item => {
      const row = document.createElement('div');
      row.className = 'ed-tree-item';
      if (editor.selectedObject && (editor.selectedObject.id === item.id || editor.selectedObject.targetId === item.id)) {
        row.classList.add('selected');
      }

      row.innerHTML = `
        <div class="ed-tree-item-left" title="${item.name} (${item.id})">
          <span class="ed-tree-item-icon">${item.icon}</span>
          <span class="ed-tree-item-name">${item.name}</span>
        </div>
        <div class="ed-tree-item-actions">
          <button class="ed-tree-action-btn btn-vis" title="Скрыть / Показать">👁️</button>
          <button class="ed-tree-action-btn btn-focus" title="Центрировать камеру">🎯</button>
        </div>
      `;

      row.onclick = (e) => {
        if (e.target.closest('.ed-tree-action-btn')) return;
        if (item.isWeapon) {
          if (typeof editor.selectPlayerSpawn === 'function') editor.selectPlayerSpawn();
          if (typeof editor.switchActiveEngineMode === 'function') editor.switchActiveEngineMode('weapon');
          else {
            const b = document.querySelector('#ed-mode-btn-weapon');
            if (b) b.click();
          }
          const sel = document.querySelector('#ed-wpn-id');
          if (sel && item.weaponId) {
            sel.value = item.weaponId;
            if (typeof editor._loadWeaponGripToUI === 'function') editor._loadWeaponGripToUI();
          }
          if (typeof editor.showToast === 'function') editor.showToast('Хват оружия: ' + (item.weaponId || 'RightHand'));
        } else if (item.isPlayer) {
          if (typeof editor.selectPlayerSpawn === 'function') editor.selectPlayerSpawn();
        } else if (typeof editor.selectObjectById === 'function') {
          editor.selectObjectById(item.id);
        } else if (typeof editor.selectObject === 'function') {
          editor.selectObject(item.id);
        }

        container.querySelectorAll('.ed-tree-item').forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');
        if (typeof editor._refreshInspector === 'function') editor._refreshInspector();
      };

      row.ondblclick = () => {
        focusCameraOnActorItem(editor, item);
      };

      const btnVis = row.querySelector('.btn-vis');
      if (btnVis) {
        btnVis.onclick = (e) => {
          e.stopPropagation();
          item.visible = !item.visible;
          if (item.mesh) item.mesh.visible = item.visible;
          btnVis.textContent = item.visible ? '👁️' : '🙈';
          btnVis.style.opacity = item.visible ? '1' : '0.4';
        };
      }

      const btnFocus = row.querySelector('.btn-focus');
      if (btnFocus) {
        btnFocus.onclick = (e) => {
          e.stopPropagation();
          focusCameraOnActorItem(editor, item);
        };
      }

      container.appendChild(row);
    });
  }

  function collectSceneActors(editor) {
    const list = [];
    const WM = window.WorldMetrics;

    // 0. Персонаж игрока и экипированное оружие
    if (editor.game && editor.game.player && editor.game.player.mesh) {
      const pl = editor.game.player;
      const pos = pl.mesh.position || { x: 0, y: 0, z: 0 };
      list.push({
        id: 'player_spawn',
        name: 'Персонаж игрока (Spawn / Player)',
        icon: '👤',
        category: 'props',
        position: pos,
        mesh: pl.mesh,
        visible: pl.mesh.visible !== false,
        isPlayer: true
      });

      let wpnId = null;
      if (typeof pl._equippedWeaponVisualId === 'function') wpnId = pl._equippedWeaponVisualId();
      if (!wpnId && typeof editor._currentWeaponGripId === 'function') wpnId = editor._currentWeaponGripId();
      if (!wpnId) wpnId = 'apprentice_wand';
      const wpnLabel = (typeof editor._weaponDisplayName === 'function') ? editor._weaponDisplayName(wpnId) : wpnId;

      list.push({
        id: 'equipped_weapon_' + wpnId,
        name: 'Оружие в руке: ' + wpnLabel + ' (RightHand)',
        icon: '🗡️',
        category: 'props',
        position: pos,
        visible: true,
        isWeapon: true,
        weaponId: wpnId
      });
    }

    // 1. Custom Props из WorldMetrics
    if (WM && WM.CUSTOM_PROPS) {
      WM.CUSTOM_PROPS.forEach(p => {
        if (!p || !p.id) return;
        const fName = String(p.modelFile || p.modelId || p.meshType || '').toLowerCase();
        let icon = '📦';
        let cat = 'props';

        if (/tree|spruce|pine/i.test(fName)) { icon = '🌲'; cat = 'foliage'; }
        else if (/bush|flower|poppy|pratia|grass/i.test(fName)) { icon = '🌿'; cat = 'foliage'; }
        else if (/house|forge|warehouse|stall|tent|chapel|building/i.test(fName)) { icon = '🏠'; cat = 'buildings'; }
        else if (p.meshType === 'collision_box' || p.isCollisionBarrier) { icon = '🛡️'; cat = 'collision'; }

        const mesh = editor.customPropMeshes ? editor.customPropMeshes.get(p.id) : null;
        list.push({
          id: p.id,
          name: p.name || p.id,
          icon: icon,
          category: cat,
          position: p.position || (mesh && mesh.position) || { x: 0, y: 0, z: 0 },
          mesh: mesh,
          visible: mesh ? mesh.visible !== false : true
        });
      });
    }

    // 2. Споты мобов
    if (WM && WM.MOB_SPOTS) {
      WM.MOB_SPOTS.forEach(s => {
        list.push({
          id: s.id,
          name: 'Спот: ' + (s.mobType || s.name || s.id),
          icon: '⚔️',
          category: 'mobs',
          position: s.position || { x: 0, y: 0, z: 0 },
          visible: true
        });
      });
    }

    // 3. NPC
    if (WM && typeof WM.buildCityNPCs === 'function') {
      const npcs = WM.buildCityNPCs();
      npcs.forEach(n => {
        list.push({
          id: n.id,
          name: 'NPC: ' + (n.name || n.title || n.id),
          icon: '🧙',
          category: 'npcs',
          position: n.position || { x: 0, y: 0, z: 0 },
          visible: true
        });
      });
    }

    // 4. BSP Brushes
    if (window.BspBrushes && window.BspBrushes.brushes) {
      window.BspBrushes.brushes.forEach(b => {
        list.push({
          id: b.id,
          name: 'BSP: ' + (b.name || b.shape || b.id),
          icon: '🧱',
          category: 'bsp',
          position: b.position || { x: 0, y: 0, z: 0 },
          visible: true
        });
      });
    }

    return list;
  }

  function focusCameraOnActorItem(editor, item) {
    if (!item || !item.position || !editor.game || !editor.game.camera) return;
    const cam = editor.game.camera;
    const pos = item.position;
    cam.position.set(pos.x + 10, (pos.y || 0) + 8, pos.z + 10);
    cam.lookAt(pos.x, (pos.y || 0) + 1.5, pos.z);
    if (editor.game.cameraRig && editor.game.cameraRig.flyPos) {
      editor.game.cameraRig.flyPos.copy(cam.position);
    }
    showToast(editor, `Камера на: ${item.name || item.id}`);
  }

  function focusCameraOnObject(editor, obj) {
    if (!obj || !editor.game || !editor.game.camera) return;
    const cam = editor.game.camera;
    const pos = obj.position;
    cam.position.set(pos.x + 12, (pos.y || 0) + 8, pos.z + 12);
    cam.lookAt(pos.x, (pos.y || 0) + 1.5, pos.z);
    if (editor.game.cameraRig && editor.game.cameraRig.flyPos) {
      editor.game.cameraRig.flyPos.copy(cam.position);
    }
    showToast(editor, `Фокус на объекте`);
  }

  // ============================================================
  //  CONTENT BROWSER С РЕАЛЬНЫМИ 3D WEBP ИКОНКАМИ
  // ============================================================
  function setupContentBrowser(editor, layout) {
    const folders = layout.querySelectorAll('#ed-cb-folders .ed-cb-folder-item');
    const searchInput = layout.querySelector('#ed-cb-search');
    const toggleBtn = layout.querySelector('#ed-cb-toggle-btn');
    const bottomDock = layout.querySelector('#editor-bottom-dock');
    const currentFolderLabel = layout.querySelector('#ed-cb-current-folder');

    let activeFolder = 'all';
    let searchQuery = '';

    folders.forEach(f => {
      f.onclick = () => {
        folders.forEach(o => o.classList.remove('active'));
        f.classList.add('active');
        activeFolder = f.getAttribute('data-folder') || 'all';
        if (currentFolderLabel) currentFolderLabel.textContent = f.textContent.trim();
        renderAssetGrid(editor, activeFolder, searchQuery);
      };
    });

    if (searchInput) {
      searchInput.oninput = () => {
        searchQuery = searchInput.value.trim().toLowerCase();
        renderAssetGrid(editor, activeFolder, searchQuery);
      };
    }

    if (toggleBtn && bottomDock) {
      let collapsed = false;
      toggleBtn.onclick = () => {
        collapsed = !collapsed;
        bottomDock.classList.toggle('collapsed', collapsed);
        toggleBtn.textContent = collapsed ? '▲' : '▼';
        if (editor.game && typeof editor.game.onResize === 'function') {
          setTimeout(() => editor.game.onResize(), 220);
        }
      };
    }

    editor.refreshContentBrowser = () => renderAssetGrid(editor, activeFolder, searchQuery);
  }

  function renderAssetGrid(editor, folder, query) {
    const grid = document.querySelector('#ed-cb-asset-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Режим текстур
    if (folder === 'textures') {
      renderTexturesGrid(editor, grid, query);
      return;
    }

    const lib = window.PropsLibrary;
    if (!lib) {
      grid.innerHTML = '<div style="padding:14px; color:var(--ed-text-dim);">PropsLibrary недоступна</div>';
      return;
    }

    let items = lib.search(query, folder);
    if (!items || !items.length) {
      grid.innerHTML = '<div style="padding:14px; color:var(--ed-text-dim); grid-column:1/-1; text-align:center;">Ассеты не найдены</div>';
      return;
    }

    items.slice(0, 160).forEach(item => {
      const card = document.createElement('div');
      card.className = 'ed-asset-card';
      card.setAttribute('draggable', 'true');

      let fallbackIcon = '📦';
      if (/tree/i.test(item.file || item.id)) fallbackIcon = '🌲';
      else if (/bush|flower|poppy|pratia/i.test(item.file || item.id)) fallbackIcon = '🌿';
      else if (/house|forge|warehouse|stall|tent/i.test(item.file || item.id)) fallbackIcon = '🏠';

      const format = (item.file && item.file.endsWith('.glb')) ? 'GLB' : 'FBX';
      const baseFile = (item.file || item.id || '').replace(/\.[^.]+$/, '');
      const rawBase = baseFile.replace(/_(winter|summer|fall|spring\d*)$/i, '');

      // Список вариантов пути к иконке
      const candidatePaths = [
        `assets/props/icons/${baseFile}.webp?v=ico-7`,
        `assets/props/icons/${item.id}.webp?v=ico-7`,
        `assets/props/icons/${baseFile.toLowerCase()}.webp?v=ico-7`,
        `assets/props/icons/${item.id.toLowerCase()}.webp?v=ico-7`,
        `assets/props/icons/${rawBase}.webp?v=ico-7`,
        `assets/props/icons/${rawBase.toLowerCase()}.webp?v=ico-7`
      ];
      const uniquePaths = Array.from(new Set(candidatePaths));

      const thumb = document.createElement('div');
      thumb.className = 'ed-asset-thumb';

      const fallbackDiv = document.createElement('div');
      fallbackDiv.className = 'ed-asset-fallback-icon';
      fallbackDiv.style.display = 'none';
      fallbackDiv.textContent = fallbackIcon;

      const img = document.createElement('img');
      img.className = 'ed-asset-img';
      img.alt = item.nameRu || item.id;
      img.loading = 'lazy';

      let candIdx = 0;
      img.src = uniquePaths[0];
      img.onerror = () => {
        candIdx++;
        if (candIdx < uniquePaths.length) {
          img.src = uniquePaths[candIdx];
        } else {
          img.style.display = 'none';
          fallbackDiv.style.display = 'flex';
        }
      };

      thumb.appendChild(img);
      thumb.appendChild(fallbackDiv);

      card.innerHTML = `
        <div class="ed-asset-badge">${format}</div>
        <div class="ed-asset-name" title="${item.nameRu || item.id}">${item.nameRu || item.id}</div>
      `;
      card.insertBefore(thumb, card.querySelector('.ed-asset-name'));

      // Drag & Drop: перенос ассета из Content Browser во вьюпорт
      card.ondragstart = (e) => {
        e.dataTransfer.setData('application/json', JSON.stringify(item));
        e.dataTransfer.setData('text/plain', item.file || item.id);
        const dropHint = document.querySelector('#ed-viewport-drop-hint');
        if (dropHint) dropHint.classList.add('active');
      };

      card.ondragend = () => {
        const dropHint = document.querySelector('#ed-viewport-drop-hint');
        if (dropHint) dropHint.classList.remove('active');
      };

      card.ondblclick = () => {
        spawnQuickModel(editor, item.file, item.nameRu || item.id);
      };

      grid.appendChild(card);
    });
  }

  function renderTexturesGrid(editor, grid, query) {
    const texturesMap = window._SHARED_PROP_TEXTURES_MAP || window.PROP_TEXTURES_DATA;
    if (!texturesMap) {
      grid.innerHTML = '<div style="padding:14px; color:var(--ed-text-dim);">Текстуры не загружены</div>';
      return;
    }

    const keys = Array.from(texturesMap.keys ? texturesMap.keys() : Object.keys(texturesMap))
      .filter(k => /\.(png|webp|jpg|jpeg)$/i.test(k));

    const filtered = keys.filter(k => !query || k.toLowerCase().includes(query)).slice(0, 100);

    if (!filtered.length) {
      grid.innerHTML = '<div style="padding:14px; color:var(--ed-text-dim); grid-column:1/-1; text-align:center;">Текстуры не найдены</div>';
      return;
    }

    filtered.forEach(texFile => {
      const card = document.createElement('div');
      card.className = 'ed-asset-card';
      const ext = texFile.split('.').pop().toUpperCase();
      card.innerHTML = `
        <div class="ed-asset-badge">${ext}</div>
        <div class="ed-asset-thumb">
          <img class="ed-asset-img" src="assets/props/textures/${texFile}" alt="${texFile}" loading="lazy" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';" />
          <div class="ed-asset-fallback-icon" style="display:none;">🎨</div>
        </div>
        <div class="ed-asset-name" title="${texFile}">${texFile}</div>
      `;
      grid.appendChild(card);
    });
  }

  // ============================================================
  //  DRAG & DROP: ИЗ ОС В БИБЛИОТЕКУ И ИЗ БИБЛИОТЕКИ ВО ВЬЮПОРТ
  // ============================================================
  function setupDragAndDrop(editor, layout) {
    // 1. Дроп файлов из проводника Windows в Content Browser
    const cbDock = layout.querySelector('#editor-bottom-dock');
    const cbDropzone = layout.querySelector('#ed-cb-dropzone');
    const fileInput = layout.querySelector('#ed-file-upload-input');

    if (cbDock && cbDropzone) {
      cbDock.ondragover = (e) => {
        if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          cbDropzone.classList.add('active');
        }
      };

      cbDock.ondragleave = (e) => {
        if (!cbDock.contains(e.relatedTarget)) {
          cbDropzone.classList.remove('active');
        }
      };

      cbDock.ondrop = (e) => {
        cbDropzone.classList.remove('active');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          e.preventDefault();
          handleUploadedFiles(editor, e.dataTransfer.files);
        }
      };
    }

    if (fileInput) {
      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length) {
          handleUploadedFiles(editor, e.target.files);
        }
      };
    }

    // 2. Дроп модели из Content Browser в центральный 3D-вьюпорт
    const vpWrapper = layout.querySelector('#editor-center-viewport-wrapper');
    const vpDropHint = layout.querySelector('#ed-viewport-drop-hint');

    if (vpWrapper) {
      vpWrapper.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (vpDropHint) vpDropHint.classList.add('active');
      };

      vpWrapper.ondragleave = (e) => {
        if (!vpWrapper.contains(e.relatedTarget) && vpDropHint) {
          vpDropHint.classList.remove('active');
        }
      };

      vpWrapper.ondrop = (e) => {
        e.preventDefault();
        if (vpDropHint) vpDropHint.classList.remove('active');

        const rawData = e.dataTransfer.getData('application/json');
        if (!rawData) return;

        try {
          const assetItem = JSON.parse(rawData);
          const camera = (editor.game && editor.game.camera) || editor.camera;
          const canvas = (editor.game && editor.game.renderer && editor.game.renderer.domElement) || document.querySelector('canvas');
          if (!camera) return;

          let spawnPos = new THREE.Vector3();
          let hitFound = false;

          // 1. Попытка через штатный метод editor._raycastGround (высокоточный raycast по террейну)
          if (typeof editor._raycastGround === 'function') {
            const pt = editor._raycastGround(e.clientX, e.clientY);
            if (pt && typeof pt.x === 'number' && typeof pt.z === 'number') {
              spawnPos.set(pt.x, (typeof pt.y === 'number' ? pt.y : 0), pt.z);
              hitFound = true;
            }
          }

          // 2. Если _raycastGround не дал попадания, рассчитываем NDC по canvas и бросаем луч
          if (!hitFound && canvas) {
            const rect = canvas.getBoundingClientRect();
            const mouseX = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
            const mouseY = -((e.clientY - rect.top) / (rect.height || 1)) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

            const sceneTargets = [];
            if (window.Terrain && window.Terrain.mesh) {
              sceneTargets.push(window.Terrain.mesh);
            }
            if (editor.scene) {
              editor.scene.traverse(o => {
                if (o.isMesh && o.visible && !o.name.startsWith('_') && !o.name.includes('gizmo') && !o.name.includes('helper') && !o.name.includes('Wire')) {
                  sceneTargets.push(o);
                }
              });
            }

            const hits = raycaster.intersectObjects(sceneTargets, true);
            if (hits.length > 0) {
              let best = hits[0];
              for (const h of hits) {
                const ny = (h.face && h.face.normal) ? h.face.normal.y : 1;
                if (ny > 0.05) {
                  best = h;
                  break;
                }
              }
              spawnPos.copy(best.point);
              hitFound = true;
            } else {
              // Пересечение с плоскостью на высоте террейна камеры
              const estY = (window.Terrain && typeof window.Terrain.heightAt === 'function')
                ? window.Terrain.heightAt(camera.position.x, camera.position.z)
                : 0;
              const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -estY);
              raycaster.ray.intersectPlane(plane, spawnPos);
            }
          }

          // 3. Строгая валидация высоты: объект НИКОГДА не должен спавниться под землей
          const terrainH = (window.Terrain && typeof window.Terrain.heightAt === 'function')
            ? window.Terrain.heightAt(spawnPos.x, spawnPos.z)
            : ((window.TerrainHeight && typeof window.TerrainHeight.standYAt === 'function')
              ? window.TerrainHeight.standYAt(spawnPos.x, spawnPos.z)
              : null);

          if (typeof terrainH === 'number' && !isNaN(terrainH)) {
            if (!hitFound || spawnPos.y < terrainH) {
              spawnPos.y = terrainH;
            }
          }

          spawnActorFromAsset(editor, assetItem, spawnPos);
        } catch (err) {
          console.error('[Editor] Drop spawn error:', err);
        }
      };
    }
  }

  // Загрузка файлов ассетов на сервер и регистрация в библиотеке
  async function handleUploadedFiles(editor, fileList) {
    const files = Array.from(fileList);
    showToast(editor, `Загрузка ${files.length} файлов…`);

    for (const file of files) {
      try {
        const base64 = await readFileAsBase64(file);
        const res = await fetch('/api/editor/upload-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            dataUrl: base64
          })
        });

        if (res.ok) {
          const result = await res.json();
          const ext = file.name.split('.').pop().toLowerCase();
          const isModel = ['fbx', 'glb', 'gltf', 'obj'].includes(ext);

          if (isModel && window.PropsLibrary && typeof window.PropsLibrary.registerProp === 'function') {
            window.PropsLibrary.registerProp({
              id: file.name.replace(/\.[^.]+$/, ''),
              file: file.name,
              category: 'custom',
              nameRu: file.name.replace(/\.[^.]+$/, '')
            });
          }

          showToast(editor, `✅ Файл ${file.name} успешно добавлен в библиотеку!`);
        } else {
          showToast(editor, `❌ Ошибка загрузки ${file.name}`);
        }
      } catch (err) {
        console.error('[Editor] Upload error:', err);
        showToast(editor, `❌ Ошибка: ${err.message}`);
      }
    }

    if (editor.refreshContentBrowser) editor.refreshContentBrowser();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Спавн 3D-модели по координатам террейна
  function spawnActorFromAsset(editor, assetItem, pos) {
    const WM = window.WorldMetrics;
    if (!WM || !WM.CUSTOM_PROPS) return;

    // Вычисляем высоту ландшафта в точке дропа
    let groundY = pos.y;
    if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
      const gh = window.Terrain.heightAt(pos.x, pos.z);
      if (typeof gh === 'number' && !isNaN(gh)) {
        if (groundY < gh || Math.abs(groundY - gh) < 1.0) {
          groundY = gh;
        }
      }
    } else if (window.TerrainHeight && typeof window.TerrainHeight.standYAt === 'function') {
      const gh = window.TerrainHeight.standYAt(pos.x, pos.z);
      if (typeof gh === 'number' && !isNaN(gh)) {
        if (groundY < gh || Math.abs(groundY - gh) < 1.0) {
          groundY = gh;
        }
      }
    }

    const id = 'prop_' + (assetItem.id || 'asset') + '_' + Date.now();
    const propData = {
      id: id,
      meshType: 'fbx',
      modelFile: assetItem.file,
      modelId: assetItem.id,
      name: assetItem.nameRu || assetItem.name || assetItem.id,
      type: 'prop',
      category: assetItem.category || 'props',
      position: { x: pos.x, y: groundY, z: pos.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: assetItem.defaultScale || 1, y: assetItem.defaultScale || 1, z: assetItem.defaultScale || 1 },
      collision: assetItem.collision !== false,
      collisionShape: assetItem.collisionShape || 'box',
      collisionSize: assetItem.collisionSize || { x: 3, y: 3, z: 3 }
    };

    if (editor._foliageInstancer && editor._foliageInstancer.isFoliageProp(propData)) {
      propData.isFoliage = true;
    }

    WM.CUSTOM_PROPS.push(propData);

    let spawnedGroup = null;
    if (typeof editor.spawnCustomPropMesh === 'function') {
      spawnedGroup = editor.spawnCustomPropMesh(propData);
    } else if (editor.game && editor.game.worldContent) {
      if (propData.isFoliage && editor.game.worldContent.foliageInstancer) {
        editor.game.worldContent.foliageInstancer.addInstance(propData);
      } else {
        spawnedGroup = editor.game.worldContent.spawnCustomPropMesh(propData);
      }
    }

    if (window.PropsCollision && typeof window.PropsCollision.invalidate === 'function') {
      window.PropsCollision.invalidate();
    }

    if (typeof editor.populateObjectDropdown === 'function') {
      try { editor.populateObjectDropdown('prop'); } catch (e) {}
    }
    if (typeof editor.selectObjectById === 'function') {
      try { editor.selectObjectById('prop:' + id); } catch (e) {}
    }
    // Автоматическая привязка к земле с учетом пивота
    if (typeof editor.snapSelectedToGround === 'function') {
      try { editor.snapSelectedToGround(); } catch (e) {}
    }
    if (typeof editor.refreshOutliner === 'function') {
      try { editor.refreshOutliner(); } catch (e) {}
    }
    if (typeof editor.saveToLocalStorage === 'function') {
      try { editor.saveToLocalStorage(); } catch (e) {}
    }
    if (typeof editor.saveToServer === 'function') {
      try { editor.saveToServer(true); } catch (e) {}
    }

    showToast(editor, `✅ Объект «${propData.name}» размещен на террейне!`);
  }

  function spawnQuickModel(editor, fileName, label) {
    if (!editor.game || !editor.game.camera) return;
    const cam = editor.game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const target = cam.position.clone().add(dir.multiplyScalar(15.0));

    let gh = 0;
    if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
      gh = window.Terrain.heightAt(target.x, target.z) || 0;
    }
    target.y = gh;

    spawnActorFromAsset(editor, {
      id: fileName.replace(/\.[^.]+$/, ''),
      file: fileName,
      nameRu: label || fileName,
      defaultScale: 1.0
    }, target);
  }

  // ============================================================
  //  РЕЖИМ СИМУЛЯЦИИ (PLAY IN EDITOR)
  // ============================================================
  function togglePlaySimulation(editor, playBtn) {
    editor.isSimulating = !editor.isSimulating;

    if (editor.isSimulating) {
      playBtn.textContent = '⏹ Стоп';
      playBtn.classList.add('playing');
      editor._ensureEditorFly(false);
      if (editor.gizmoGroup) editor.gizmoGroup.visible = false;
      if (editor.selectionBox) editor.selectionBox.visible = false;
      showToast(editor, '▶ Режим симуляции: WASD + мышь (Нажмите [Стоп] для возврата)');
    } else {
      playBtn.textContent = '▶ Играть';
      playBtn.classList.remove('playing');
      editor._ensureEditorFly(true);
      if (editor.selectedObject) {
        if (editor.gizmoGroup) editor.gizmoGroup.visible = true;
        if (editor.selectionBox) editor.selectionBox.visible = true;
      }
      showToast(editor, '⏹ Режим редактора: свободная камера F3/V и пивот W/E/R');
    }
  }

  // ============================================================
  //  СПЛИТТЕРЫ ИЗМЕНЕНИЯ РАЗМЕРОВ ПАНЕЛЕЙ
  // ============================================================
  function setupSplitters(editor, layout) {
    // Левый сплиттер (ширина Outliner)
    const splitLeft = layout.querySelector('#ed-split-left');
    const leftDock = layout.querySelector('#editor-left-dock');
    if (splitLeft && leftDock) {
      bindSplitter(splitLeft, 'x', (dx) => {
        const minW = 200;
        const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.48));
        const w = Math.max(minW, Math.min(maxW, leftDock.offsetWidth + dx));
        leftDock.style.width = w + 'px';
        if (editor.game && typeof editor.game.onResize === 'function') editor.game.onResize();
      });
    }

    // Правый сплиттер (ширина Inspector)
    const splitRight = layout.querySelector('#ed-split-right');
    const rightDock = layout.querySelector('#editor-right-dock');
    if (splitRight && rightDock) {
      bindSplitter(splitRight, 'x', (dx) => {
        const minW = 240;
        const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.5));
        const w = Math.max(minW, Math.min(maxW, rightDock.offsetWidth - dx));
        rightDock.style.width = w + 'px';
        if (editor.game && typeof editor.game.onResize === 'function') editor.game.onResize();
      });
    }

    // Нижний сплиттер (высота Content Browser)
    const splitBottom = layout.querySelector('#ed-split-bottom');
    const bottomDock = layout.querySelector('#editor-bottom-dock');
    if (splitBottom && bottomDock) {
      bindSplitter(splitBottom, 'y', (dy) => {
        const minH = 40;
        const maxH = Math.max(minH, Math.floor(window.innerHeight * 0.75));
        const h = Math.max(minH, Math.min(maxH, bottomDock.offsetHeight - dy));
        bottomDock.style.height = h + 'px';
        if (editor.game && typeof editor.game.onResize === 'function') editor.game.onResize();
      });
    }
  }

  function bindSplitter(el, axis, onDelta) {
    let active = false;
    let startVal = 0;

    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      el.classList.add('active');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
      startVal = axis === 'x' ? e.clientX : e.clientY;

      const onMouseMove = (ev) => {
        if (!active) return;
        const currentVal = axis === 'x' ? ev.clientX : ev.clientY;
        const delta = currentVal - startVal;
        startVal = currentVal;
        onDelta(delta);
      };

      const onMouseUp = () => {
        if (!active) return;
        active = false;
        el.classList.remove('active');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
      };

      window.addEventListener('mousemove', onMouseMove, true);
      window.addEventListener('mouseup', onMouseUp, true);
    };
  }

  // ============================================================
  //  ТОСТ-УВЕДОМЛЕНИЯ
  // ============================================================
  function showToast(editor, message) {
    const toast = document.querySelector('#editor-engine-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  global.initEngineEditor = initEngineEditor;
})(typeof window !== 'undefined' ? window : globalThis);
