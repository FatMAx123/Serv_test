# Глубокий Технический Аудит Игрового Кода (Client, Shared, Server)
**Project Steam: Origins — MMORPG Lineage 2 C1 Steampunk Conversion**
*Дата проведения: 21 сентября 2026 г.*  
*Статус: DRAFT / IN_REVIEW*  
*Охват: 74 клиентских файла (`client/js/`), 36 общих модулей (`shared/`), 32 серверных файла (`server/`)*

---

## 1. Введение и Методология

В отличие от концептуальных и дизайнерских документов, настоящий аудит базируется **исключительно на анализе исполняемого кода игры** («от первой буквы до последней строки»):
1. **Клиентский WebGL / Three.js движок** (`client/js/main.js`, `render-setup.js`, `spawn.js`, `loot.js`, `drop-models.js`, `char-model.js`, `camera3d.js`).
2. **Жизненный цикл ресурсов и памяти** (GPU VRAM, BufferGeometry, Material, Texture disposal, event listener leaks).
3. **Аудиосистема и интеграция с платформой** (`client/js/audio.js`, Яндекс Игры SDK v2: реклама, глушение звука, ярлыки, отзывы).
4. **Сетевой транспорт и синхронизация** (`client/js/net-ws.js`, `server/net-transport.js`, `shared/net-pack-binary.js`).
5. **Боевые формулы и разделяемая логика** (`shared/l2-combat.js`, `shared/mob-db.js`, `shared/geo-pathfind.js`).

Все выявленные дефекты ранжированы по степени критичности: **P0 (Критический / Блокер релиза)**, **P1 (Высокий / Утечка ресурсов)**, **P2 (Средний / Оптимизация)**.

---

## 2. Сводный Реестр Дефектов Игрового Кода (Code Defects)

| ID | Область / Файлы | Описание дефекта в коде | Критичность | Влияние на игру |
|:---|:---|:---|:---:|:---|
| **CODE-01** | `client/js/loot.js`<br>`client/js/drop-models.js` | **Утечка WebGL VRAM при подборе лута:** `scene.remove(this.mesh)` отвязывает меш от графа, но геометрии и материалы (`MeshStandardMaterial`) не вызывают `.dispose()`. | **P1** | Непрерывный рост видеопамяти при фарме. Краш вкладки браузера на смартфонах (OOM WebGL). |
| **CODE-02** | `client/js/spawn.js`<br>`client/js/npc.js` | **Утечка ресурсов при деспавне мобов и снарядов:** Метод `ZoneEnemy.destroy()` диспозит только ауру, оставляя в памяти GPU геометрии и материалы тела моба, тени и снарядов (`projectiles`). | **P1** | Утечка GPU-памяти в зонах с высокой плотностью респавна мобов. |
| **CODE-03** | `client/js/audio.js` | **Отсутствие хуков глушения звука для рекламы (Блокер модерации Яндекса):** `GameAudio` не имеет методов `muteForAd()` / `unmuteAfterAd()`. При показе рекламы звук игры продолжает играть на фоне ролика. | **P0** | **100% реджект модерацией Яндекс Игр** (грубое нарушение пункта об утечке аудио во время рекламы). |
| **CODE-04** | `client/js/main.js` | **Отсутствие обработки сброса WebGL-контекста:** На `renderer.domElement` нет слушателей `webglcontextlost` и `webglcontextrestored`. | **P1** | При сворачивании браузера или показе полноэкранного баннера экран становится черным без восстановления. |
| **CODE-05** | `client/js/` (вся папка)<br>`client/js/main.js` | **Полное отсутствие вызовов Yandex SDK v2 Ads в коде:** В кодовой базе отсутствуют вызовы `showFullscreenAdv`, `showRewardedVideo`, `shortcut.showPrompt`, `feedback.requestReview`, `getLeaderboards`. | **P0** | Невозможность монетизации и несоответствие требованиям платформы Яндекс Игры. |
| **CODE-06** | `client/js/char-select.js`<br>`client/js/menu-page.js` | **Утечка глобальных слушателей событий `window`:** Множественные `window.addEventListener('keydown'/'resize')` добавляются без отвязки при переходе меню $\leftrightarrow$ игра. | **P2** | Дублирование вызовов хоткеев, деградация производительности UI. |
| **CODE-07** | `shared/mob-db.js`<br>`client/js/spawn.js` | **Процедурный рендеринг боссов через Canvas вместо WebP:** 37 мобов (включая боссов `drill_worm`, `scrap_tyrant`, `press_hammer`) не имеют `visual.sheets` и рисуются в рантайме на Canvas. | **P2** | Падение FPS при спавне боссов, отсутствие качественной анимации движения и ударов. |

---

## 3. Детальный Анализ Каждого Дефекта

### 3.1. CODE-01: Утечка WebGL VRAM в `loot.js` и `drop-models.js`
* **Файлы:** [`client/js/loot.js:L854-867`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/loot.js#L854-L867), [`client/js/drop-models.js:L17-35`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/drop-models.js#L17-L35).
* **Суть дефекта в коде:**
  ```javascript
  // client/js/loot.js
  destroy() {
      this.scene.remove(this.mesh);
      if (this.glow) this.scene.remove(this.glow);
      if (this.beam) this.scene.remove(this.beam);
  }
  ```
  В Three.js метод `scene.remove()` **не освобождает память GPU**. Для каждого упавшего предмета функция `drop-models.js` создает группы мешей с новыми `MeshStandardMaterial` (`new THREE.MeshStandardMaterial(...)`).
  Когда игрок выбивает и подбирает 200 предметов, в видеопамяти остаются 200+ скомпилированных шейдеров и буферов вершин.
* **Необходимое исправление:**
  Реализовать рекурсивный метод очистки:
  ```javascript
  function disposeHierarchy(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  ```

---

### 3.2. CODE-02: Утечка ресурсов при деспавне мобов (`spawn.js`)
* **Файл:** [`client/js/spawn.js:L1704-1718`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/spawn.js#L1704-L1718).
* **Суть дефекта в коде:**
  ```javascript
  destroy() {
      this.scene.remove(this.mesh);
      this.scene.remove(this.shadow);
      if (this.rankAura) {
          this.scene.remove(this.rankAura);
          if (this.rankAura.material) {
              if (this.rankAura.material.map) this.rankAura.material.map.dispose();
              this.rankAura.material.dispose();
          }
          this.rankAura = null;
      }
      this.projectiles.forEach(p => this.scene.remove(p));
      this.projectiles = [];
  }
  ```
  Разработчик освободил память только для `rankAura`, но `this.mesh.geometry`, `this.mesh.material`, `this.shadow.geometry`, `this.shadow.material` и меши снарядов `projectiles` просто удалены из сцены без `.dispose()`.
* **Необходимое исправление:**
  Добавить вызов `.dispose()` для геометрии и материала `mesh`, `shadow` и каждого снаряда в `projectiles`.

---

### 3.3. CODE-03: Отсутствие хуков глушения звука для рекламы в `audio.js`
* **Файл:** [`client/js/audio.js:L52-105`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/audio.js#L52-L105).
* **Суть дефекта в коде:**
  Класс `GameAudio` управляет шинами `sfxBus` и `bgmBus`, но в нем отсутствуют специализированные методы `muteForAd()` и `unmuteAfterAd()`.
  При вызове `ysdk.adv.showFullscreenAdv()` или `ysdk.adv.showRewardedVideo()` игра не заглушает AudioContext.
  **Регламент модерации Яндекс Игр (п. 1.2):** *«Во время показа рекламы любые звуки из игры должны быть полностью отключены. Проигрывание игрового звука поверх рекламы является критической ошибкой, игра отклоняется.»*
* **Необходимое исправление:**
  ```javascript
  GameAudio.prototype.muteForAd = function () {
    this._preAdMuted = this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(0, this.ctx.currentTime);
      if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    }
  };
  GameAudio.prototype.unmuteAfterAd = function () {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this._applyGains();
  };
  ```

---

### 3.4. CODE-04: Отсутствие обработки `webglcontextlost`
* **Файл:** [`client/js/main.js:L34-40`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/main.js#L34-L40).
* **Суть дефекта в коде:**
  Canvas рендерера не слушает системные события WebGL:
  ```javascript
  this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  this.renderer.setSize(innerWidth, innerHeight);
  this.renderer.setPixelRatio(1.0);
  this.renderer.shadowMap.enabled = true;
  document.body.appendChild(this.renderer.domElement);
  ```
  При переключении вкладок мобильного браузера или показе полноэкранного рекламного видео WebGL контекст теряется (`webglcontextlost`). Без вызова `event.preventDefault()` Three.js не может восстановить контекст, и игра зависает намертво.
* **Необходимое исправление:**
  Добавить обработку:
  ```javascript
  this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    this._contextLost = true;
    console.warn('[WebGL] Context lost, rendering paused');
  }, false);
  this.renderer.domElement.addEventListener('webglcontextrestored', () => {
    this._contextLost = false;
    console.info('[WebGL] Context restored');
  }, false);
  ```

---

### 3.5. CODE-05: Интеграция с Yandex Games SDK v2
* **Файлы:** [`client/js/net-ws.js`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/net-ws.js), [`client/js/main.js`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/main.js).
* **Суть дефекта в коде:**
  Поиск по кодовой базе показал 0 вызовов `showFullscreenAdv` и `showRewardedVideo`.
  Проект готов по сетевому протоколу и серверу, но в клиентской части нет платформенного слоя для Яндекс Игр.
* **Необходимое исправление:**
  Создать модуль `client/js/yandex-platform.js` со следующими возможностями:
  1. `showFullscreen(onClosed)` — показ межстраничной рекламы при смерти/респавне в городе и телепортациях.
  2. `showRewarded(onRewarded, onClosed)` — награда за видео (воскрешение на месте с 50% HP/MP, бафф на 20 мин).
  3. `promptShortcut()` — запрос на добавление ярлыка игры на рабочий стол.
  4. `requestReview()` — предложение оценить игру при взятии 10/20 уровня.
  5. `submitLeaderboardScore(score)` — отправка рекордов в таблицу лидеров.

---

### 3.6. CODE-06: Утечка слушателей событий при навигации меню $\leftrightarrow$ игра
* **Файлы:** [`client/js/char-select.js`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/char-select.js), [`client/js/menu-page.js`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/menu-page.js).
* **Суть дефекта в коде:**
  Слушатели `window.addEventListener` добавляются анонимными функциями в конструкторах или функциях инициализации без сохранения ссылки. При повторном открытии меню слушатели дублируются.
* **Необходимое исправление:**
  Использовать именованные обработчики и вызывать `window.removeEventListener` при уничтожении или переключении экранов.

---

### 3.7. CODE-07: Процедурный Canvas-рендеринг боссов вместо WebP спрайтов
* **Файлы:** [`shared/mob-db.js:L1837-1857`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/shared/mob-db.js#L1837-L1857), [`client/js/spawn.js:L940-970`](file:///d:/games/yandex/%D0%BB%D0%B0%D0%B9%D0%BD%D1%8D%D0%B9%D0%B4%D0%B6/project-steam1/client/js/spawn.js#L940-L970).
* **Суть дефекта в коде:**
  Боссы (`drill_worm`, `scrap_tyrant`, `press_hammer`, `boiler_sovereign`) не имеют блока `visual.sheets`. При их появлении клиент генерирует процедурный спрайт через Canvas 2D API (`_buildProceduralTexture`).
  Это не только ухудшает внешний вид боссов (вместо стимпанк-арта игрок видит цветной геометрический овал), но и приводит к синхронной генерации Canvas-текстуры в главном потоке.
* **Необходимое исправление:**
  Сформировать оптимизированные WebP спрайт-листы и прописать `visual.sheets` в `shared/mob-db.js`.

---

## 4. План Устранения Дефектов (Рекомендованный порядок)

1. **Этап 1 (Критический): Платформа и Модерация**
   - Добавить хуки `muteForAd` / `unmuteAfterAd` в `client/js/audio.js`.
   - Создать `client/js/yandex-platform.js` с вызовами `showFullscreenAdv`, `showRewardedVideo`, `promptShortcut`, `requestReview`.
2. **Этап 2 (Стабильность и Память): Ликвидация Утечек WebGL VRAM**
   - Внедрить рекурсивный `dispose` в `client/js/loot.js` и `client/js/drop-models.js`.
   - Добавить `dispose` геометрий и материалов в `client/js/spawn.js` (`destroy()`) и `client/js/npc.js`.
   - Добавить обработчики `webglcontextlost` и `webglcontextrestored` в `client/js/main.js`.
3. **Этап 3 (Визуал и Производительность): Спрайт-листы боссов**
   - Нарезать и конвертировать ассеты боссов (`drill_worm` и др.) в оптимизированный формат WebP.
   - Зарегистрировать `visual.sheets` в `shared/mob-db.js`.
