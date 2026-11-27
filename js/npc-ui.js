// ============================================
// PROJECT STEAM: ORIGINS - NPC-UI.JS
// Окно NPC по схеме «приветствие → кнопки → порционный текст».
//   · Приветствие — одна короткая фраза при открытии (NPC_GREETINGS).
//   · «Поговорить» — idle-реплики NPC по одной, кнопкой «Далее».
//   · Квесты — кнопки квестов; реплики выдачи/хода/сдачи идут порциями,
//     последняя реплика показывается вместе с карточкой задания.
//   · Торговец — «Торговать» → окно лавки (покупка/продажа, иконки, цены,
//     количество). Учитель — «Изучить навыки» → окно умений.
// Одно окно #npc-window с режимами dialog / shop / trainer: внешние проверки
// (#npc-window.open, #npc-shop, #npc-trainer, isOpen, _shopNpcId) не меняются.
// Стиль — своя «паровая бронза»: L2 — эталон по духу, не копия, ассеты L2 не
// используются. Рамка рисуется CSS, без растянутой текстуры с нарисованной
// полосой прокрутки (из-за неё прокрутка «дублировалась»).
// ============================================

/** Короткие приветствия. Реплики «Поговорить» берутся из dialogue.idle и не повторяют приветствие. */
const NPC_GREETINGS = {
    guard_n: 'Стой. Пост северных ворот. Назови цель — или проходи, не задерживай поток.',
    guard_s: 'Южный пост. Проходи, оператор, только не толпись у створа.',
    guard_w: 'Западный пост на связи. Говори коротко — шагоходы за стеной ждать не станут.',
    guard_e: 'Пост восточного сектора. Датчики отметили тебя как дружественную единицу. Пока.',
    gilbert: 'Оператор. Встань ровно, когда говоришь с Инспекторатом.',
    bot_01: 'Бип! Биосигнал опознан. Дрон-помощник к вашим услугам.',
    guide_k9: 'Справочный терминал К-9 к вашим услугам. Выберите раздел.',
    smith_kran: 'Горн разогрет. С чем пришёл — с железом или с чертежом?',
    trader_vex: 'Заходи, не стой на сквозняке. Сталь любит тепло — и покупателей.',
    trader_dora: 'Без брони за ворота? Не при мне. Подходи, подберём по росту.',
    milly: 'Заходи-заходи! Осторожно, тут провода под ногами.',
    grocer_spark: 'Добро пожаловать в лавку инженеров. Руками ничего не крутить!',
    intendant_rid: 'Снабжение операторов. Подпись в ведомости — и получай положенное.',
    archivist_skrip: 'Тсс... Здесь говорят шёпотом — чертежи не любят шума.',
    instructor_thorn: 'Спину ровно, ключ крепче. Пришёл учиться — или поглазеть?',
    magister_baulro: 'Ученик? Говори, но взвешивай каждое слово — здесь считают даже паузы.',
    biotin: 'Подходи ближе. Машины сегодня особенно разговорчивы.',
    warehouse_w7: 'Терминал W-7 на связи. Ожидаю команду.',
    dispatcher_roxy: 'Привет-привет! Эфир сегодня чистый — лови момент.',
    darn: 'Работы — непочатый край. Хочешь заработать честную медь?',
    elias: 'Записи, записи... Ты по делу? Говори, пока лента крутится.',
    bonna: 'А, это ты. Присаживайся, если не боишься масляных пятен.',
    issue_window: '(За мутным стеклом окна выдачи что-то щёлкает и затихает.)',
    krist: 'Дзынь! Бар-автомат Крист к вашим услугам. Стаканы протёрты, краны прогреты.',
    arena_kettle: 'Ещё один претендент? Трибуны любят новые лица.',
    harbor_trader: 'Добро пожаловать на причал. Последняя лавка перед дикими скалами.',
    harbor_teleport: 'Буй А-2 на связи. Лампа мигает зелёным. Обычно это хороший знак.',
    captain_sea_watch: 'Смирно! Причал Морского Дозора. Докладывай коротко.'
};

const NPCW_QUEST_TYPES = {
    main: 'Основное', side: 'Побочное', daily: 'Ежедневное',
    repeatable: 'Повторяемое', event: 'Событие'
};

const NPCW_ITEM_TYPES = {
    weapon: 'Оружие', armor: 'Броня', shield: 'Щит', accessory: 'Бижутерия', jewelry: 'Бижутерия',
    consumable: 'Расходник', material: 'Материал', recipe: 'Чертёж', crystal: 'Кристалл',
    enchant: 'Усилитель давления', quest: 'Квестовый предмет', ammo: 'Боеприпас', arrow: 'Боеприпас'
};

const NPCW_FONT_HREF = 'https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@500;700&family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&display=swap';

/** Порция текста на одну страницу диалога (символов). */
const NPCW_PAGE_CHARS = 240;

function npcwEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function npcwFmt(n) {
    return (Math.floor(+n || 0)).toLocaleString('ru-RU');
}

/** Делит длинную реплику на порции по предложениям (≤ max символов). */
function npcwChunk(text, max) {
    max = max || NPCW_PAGE_CHARS;
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    if (s.length <= max) return [s];
    const parts = s.match(/[^.!?…]+(?:[.!?…]+["»”)\]]*)?\s*/g) || [s];
    // Ровные порции: целевая длина = весь текст / число страниц; предложение
    // уходит на следующую страницу, если его середина перешла бы за цель.
    // Хвост короче 1,2 страницы не дробим.
    const target = s.length / Math.ceil(s.length / max);
    const out = [];
    let cur = '';
    let rest = s.length;
    parts.forEach((p) => {
        const tailFits = cur.length + rest <= max * 1.2;
        if (cur && !tailFits && (cur.length + p.length / 2 > target || cur.length + p.length > max * 1.2)) {
            out.push(cur.trim());
            cur = p;
        } else {
            cur += p;
        }
        rest -= p.length;
    });
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/** SVG-орнаменты рамки (свои, рисуются кодом). */
function npcwSvgUrl(svg) {
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}

function npcwCornerSvg(flipX, flipY) {
    const tf = 'matrix(' + (flipX ? -1 : 1) + ' 0 0 ' + (flipY ? -1 : 1) + ' ' + (flipX ? 40 : 0) + ' ' + (flipY ? 40 : 0) + ')';
    return "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>" +
        "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
        "<stop offset='0' stop-color='#f7dc98'/><stop offset='.45' stop-color='#b8863f'/><stop offset='1' stop-color='#4e331a'/>" +
        "</linearGradient></defs><g transform='" + tf + "'>" +
        "<path d='M2.5 36V11Q2.5 2.5 11 2.5h25' fill='none' stroke='url(#g)' stroke-width='2.2'/>" +
        "<path d='M8 27V14q0-6 6-6h13' fill='none' stroke='url(#g)' stroke-width='1.1' opacity='.75'/>" +
        "<path d='M7.5 2 13 7.5 7.5 13 2 7.5z' fill='url(#g)' stroke='#2a1a0b' stroke-width='.8'/>" +
        "<circle cx='36' cy='2.5' r='1.7' fill='#e9c983'/><circle cx='2.5' cy='36' r='1.7' fill='#e9c983'/>" +
        "<circle cx='14' cy='14' r='2.2' fill='#d9a95a' stroke='#3a2410' stroke-width='.8'/>" +
        '</g></svg>';
}

function npcwGearSvg() {
    let teeth = '';
    for (let i = 0; i < 8; i++) {
        teeth += "<rect x='14.5' y='1.5' width='5' height='7' rx='1' transform='rotate(" + (i * 45) + " 17 17)'/>";
    }
    return "<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'>" +
        "<defs><linearGradient id='b' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#f5d892'/><stop offset='1' stop-color='#7a5226'/></linearGradient>" +
        "<radialGradient id='c' cx='.4' cy='.35' r='.7'><stop offset='0' stop-color='#ffe9a8'/><stop offset='.5' stop-color='#e0902a'/><stop offset='1' stop-color='#6a2c08'/></radialGradient></defs>" +
        "<g fill='url(#b)' stroke='#2a1a0b' stroke-width='.8'>" + teeth + "<circle cx='17' cy='17' r='11'/></g>" +
        "<circle cx='17' cy='17' r='6' fill='url(#c)' stroke='#2a1a0b' stroke-width='.8'/></svg>";
}

function npcwRuleSvg(flip) {
    const tf = flip ? "transform='matrix(-1 0 0 1 44 0)'" : '';
    return "<svg xmlns='http://www.w3.org/2000/svg' width='44' height='10' viewBox='0 0 44 10'><g " + tf + ">" +
        "<defs><linearGradient id='l' x1='0' x2='1'><stop offset='0' stop-color='#a37a43' stop-opacity='0'/><stop offset='1' stop-color='#d9b46c'/></linearGradient></defs>" +
        "<rect x='0' y='4.5' width='34' height='1' fill='url(#l)'/>" +
        "<path d='M39 1 43 5 39 9 35 5z' fill='#d9b46c' stroke='#3a2410' stroke-width='.6'/></g></svg>";
}

class NPCUI {
    constructor() {
        this.currentNPC = null;
        this.mode = 'dialog';        // dialog | shop | trainer
        this.view = 'greet';         // greet | seq | quest | sub
        this._seq = null;
        this._questCard = null;
        this._pendingTurnin = null;
        this._rewardChoice = 0;
        this._dragState = null;
        this._dragged = false;

        this._shopNpcId = null;
        this._shopSellRate = 0.4;
        this._shopItems = null;
        this._shopTab = 'buy';
        this._shopSel = null;
        this._shopQty = 1;
        this._shopCurrency = null;

        this._trFilter = 'avail';
        this._trSel = null;

        this.ensureFonts();
        this.injectStyles();
        this.createDOM();
        this.bindEvents();
        this.initDrag();

        if (window.i18n && window.i18n.subscribe) {
            window.i18n.subscribe(() => {
                if (this.isOpen()) this.refresh(true);
            });
        }
    }

    t(key, params = {}) {
        if (window.i18n && window.i18n.t) {
            return window.i18n.t(key, params);
        }
        return key;
    }

    /** Перевод с запасным текстом: i18n.t возвращает сам ключ, если перевода нет. */
    tf(key, fallback, params) {
        const v = this.t(key, params || {});
        return (v && v !== key) ? v : fallback;
    }

    $(id) {
        return document.getElementById(id);
    }

    isOpen() {
        return !!(this.container && this.container.classList.contains('open'));
    }

    // ------------------------------------------------------------------
    // DOM / стили
    // ------------------------------------------------------------------
    ensureFonts() {
        if (document.getElementById('npcw-fonts')) return;
        const l = document.createElement('link');
        l.id = 'npcw-fonts';
        l.rel = 'stylesheet';
        l.href = NPCW_FONT_HREF;
        document.head.appendChild(l);
    }

    createDOM() {
        ['npc-window', 'dialogue-box'].forEach((id) => {
            const old = document.getElementById(id);
            if (old) old.remove();
        });

        const c = document.createElement('div');
        c.id = 'npc-window';
        c.className = 'l2-ref-dialog-window npcw npcw--dialog';
        c.setAttribute('role', 'dialog');
        c.setAttribute('aria-modal', 'false');
        c.innerHTML = `
            <div class="npcw-corners" aria-hidden="true"></div>
            <div class="npcw-crest" aria-hidden="true"></div>
            <div class="npcw-titlebar" id="npc-titlebar">
                <span class="npcw-title" id="npc-titlebar-name"></span>
                <button type="button" id="npc-close" class="npcw-close" aria-label="Закрыть">×</button>
            </div>
            <div class="npcw-speaker" id="npc-speaker-card">
                <div class="npcw-portrait">
                    <img id="npc-portrait-img" alt="" draggable="false" />
                    <div class="npcw-portrait-ini hidden" id="npc-portrait-ini"></div>
                </div>
                <div class="npcw-speaker-meta">
                    <div class="npcw-speaker-name" id="npc-speaker-name"></div>
                    <div class="npcw-speaker-title" id="npc-speaker-title"></div>
                </div>
            </div>
            <div class="npcw-body l2-ref-content" id="npc-content-area">
                <div class="npcw-who hidden" id="npc-speech-who"></div>
                <div class="npcw-speech" id="npc-speech-text"></div>
                <div class="npcw-pager hidden" id="npc-pager"></div>
                <div class="npcw-qcard hidden" id="npc-quest-card"></div>
                <div class="npcw-options hidden" id="npc-options"></div>

                <div id="npc-buffs" class="npc-subview hidden">
                    <div class="npcw-subhead"><span id="heading-buffs"></span><span class="npcw-wallet-sm"><i class="npcw-coin"></i> <b id="buff-currency">0</b></span></div>
                    <div id="buff-list" class="npcw-sublist"></div>
                </div>

                <div id="npc-teleports" class="npc-subview hidden">
                    <div class="npcw-subhead"><span id="heading-teleport"></span><span class="npcw-wallet-sm"><i class="npcw-coin"></i> <b id="teleport-currency">0</b></span></div>
                    <div id="teleport-list" class="npcw-sublist"></div>
                </div>

                <div id="npc-warehouse" class="npc-subview hidden">
                    <div class="npcw-subhead">
                        <span id="heading-warehouse"></span>
                        <span class="npcw-wallet-sm"><i class="npcw-coin"></i> <b id="wh-currency">0</b></span>
                    </div>
                    <div class="l2-wh-cols">
                        <div class="l2-wh-col">
                            <div class="l2-wh-col-title">
                                <span id="wh-bag-title"></span>
                                <span class="l2-wh-slots" id="wh-bag-slots"></span>
                            </div>
                            <div id="wh-bag-list" class="l2-wh-list"></div>
                        </div>
                        <div class="l2-wh-col">
                            <div class="l2-wh-col-title">
                                <span id="wh-store-title"></span>
                                <span class="l2-wh-slots" id="wh-store-slots"></span>
                            </div>
                            <div id="wh-store-list" class="l2-wh-list"></div>
                        </div>
                    </div>
                    <div class="l2-wh-note" id="wh-note"></div>
                </div>
            </div>

            <div id="npc-shop" class="npcw-pane hidden">
                <div class="npcw-tabs">
                    <button type="button" class="npcw-tab on" data-shop-tab="buy"></button>
                    <button type="button" class="npcw-tab" data-shop-tab="sell"></button>
                    <div class="npcw-wallet"><i class="npcw-coin"></i> <b id="shop-currency">0</b></div>
                </div>
                <div class="npcw-thead npcw-grid-shop">
                    <span></span><span id="shop-col-name"></span><span id="shop-col-own"></span><span id="shop-col-price"></span>
                </div>
                <div class="npcw-list" id="shop-items" data-scrollable="1"></div>
                <div class="npcw-detail" id="shop-detail"></div>
            </div>

            <div id="npc-trainer" class="npcw-pane hidden">
                <div class="npcw-tabs">
                    <button type="button" class="npcw-tab on" data-tr-tab="avail"></button>
                    <button type="button" class="npcw-tab" data-tr-tab="all"></button>
                    <div class="npcw-wallet" id="trainer-sp"></div>
                </div>
                <div class="npcw-thead npcw-grid-tr">
                    <span></span><span id="tr-col-name"></span><span id="tr-col-rank"></span><span id="tr-col-lvl"></span><span>SP</span>
                </div>
                <div class="npcw-list" id="trainer-skills" data-scrollable="1"></div>
                <div class="npcw-detail npcw-detail-tr" id="trainer-detail"></div>
                <div class="npcw-hint hidden" id="trainer-hint"></div>
            </div>

            <div class="npcw-footer" id="npc-footer"></div>
        `;
        document.body.appendChild(c);
        this.container = c;
    }

    injectStyles() {
        const oldStyle = document.getElementById('l2-ref-dialog-styles');
        if (oldStyle) oldStyle.remove();

        const corners = [
            npcwSvgUrl(npcwCornerSvg(false, false)) + ' left top',
            npcwSvgUrl(npcwCornerSvg(true, false)) + ' right top',
            npcwSvgUrl(npcwCornerSvg(false, true)) + ' left bottom',
            npcwSvgUrl(npcwCornerSvg(true, true)) + ' right bottom'
        ].join(', ');
        const gear = npcwSvgUrl(npcwGearSvg());
        const ruleL = npcwSvgUrl(npcwRuleSvg(false));
        const ruleR = npcwSvgUrl(npcwRuleSvg(true));

        const style = document.createElement('style');
        style.id = 'l2-ref-dialog-styles';
        style.textContent = `
            .hidden { display: none !important; }
            .npc-subview.hidden { display: none !important; }

            /* ===================== Окно ===================== */
            #npc-window.npcw {
                --npcw-gold: #ecc979;
                --npcw-gold-hi: #ffe7a6;
                --npcw-bronze: #a37a43;
                --npcw-line: rgba(163, 122, 67, 0.38);
                --npcw-ink: #f0e6d0;
                --npcw-ink-dim: #bcac8e;
                --npcw-ink-mute: #918470;
                --npcw-ok: #96dc9b;
                --npcw-bad: #f2907c;
                --npcw-warn: #f1b860;
                --npcw-f-head: 'Alegreya SC', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
                --npcw-f-body: 'Alegreya', 'Palatino Linotype', 'Book Antiqua', Georgia, serif;
                /* Окно привязано к верхнему краю: при смене содержимого растёт
                   только вниз, кнопки не «прыгают» вверх-вниз между репликами. */
                --npcw-top: max(24px, calc(50vh - 330px));
                position: fixed;
                top: var(--npcw-top);
                left: 50%;
                transform: translateX(-50%);
                width: min(540px, calc(100vw - 24px));
                max-height: min(700px, calc(100vh - var(--npcw-top) - 14px));
                z-index: 540;
                display: none;
                flex-direction: column;
                box-sizing: border-box;
                padding: 10px 16px 14px;
                color: var(--npcw-ink);
                font-family: var(--npcw-f-body);
                font-size: 15.5px;
                line-height: 1.55;
                font-variant-numeric: lining-nums;
                -webkit-font-smoothing: antialiased;
                user-select: none;
                border-radius: 7px;
                border: 1px solid #0b0806;
                background:
                    radial-gradient(130% 70% at 50% -10%, rgba(176, 122, 58, 0.20), transparent 55%),
                    radial-gradient(90% 60% at 50% 115%, rgba(0, 0, 0, 0.55), transparent 70%),
                    repeating-linear-gradient(115deg, rgba(255, 240, 210, 0.018) 0 1px, transparent 1px 4px),
                    linear-gradient(180deg, #241b14 0%, #17120d 45%, #110d0a 100%);
                box-shadow:
                    0 0 0 1px #24180c,
                    0 0 0 3px #9c7240,
                    0 0 0 4px #d9b46c,
                    0 0 0 5px #3b2812,
                    0 0 0 6px #0a0705,
                    0 26px 70px rgba(0, 0, 0, 0.85),
                    inset 0 1px 0 rgba(255, 230, 170, 0.08),
                    inset 0 0 50px rgba(0, 0, 0, 0.5);
            }
            #npc-window.npcw.open { display: flex !important; animation: npcwIn 0.16s ease-out; }
            @keyframes npcwIn { from { opacity: 0; } to { opacity: 1; } }

            #npc-window.npcw--wide { width: min(660px, calc(100vw - 20px)); }
            #npc-window.npcw--shop,
            #npc-window.npcw--trainer {
                width: min(720px, calc(100vw - 20px));
                height: min(640px, calc(100vh - var(--npcw-top) - 14px));
                max-height: none;
            }

            .npcw-corners {
                position: absolute;
                inset: 5px;
                pointer-events: none;
                background: ${corners};
                background-repeat: no-repeat;
                background-size: 40px 40px;
                z-index: 0;
            }
            .npcw-crest {
                position: absolute;
                top: -18px;
                left: 50%;
                width: 34px;
                height: 34px;
                margin-left: -17px;
                background: ${gear} center / contain no-repeat;
                filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.85));
                pointer-events: none;
                z-index: 2;
            }
            .npcw-titlebar, .npcw-speaker, .npcw-body, .npcw-pane, .npcw-footer {
                position: relative;
                z-index: 1;
            }

            /* ---- Заголовок ---- */
            .npcw-titlebar {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                padding: 6px 40px 8px;
                margin: 0 0 8px;
                cursor: grab;
                border-bottom: 1px solid var(--npcw-line);
            }
            .npcw-title {
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: 100%;
                font: 700 16px/1.2 var(--npcw-f-head);
                letter-spacing: 0.08em;
                color: var(--npcw-gold);
                text-shadow: 0 1px 0 #000, 0 0 14px rgba(236, 201, 121, 0.35);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                pointer-events: none;
            }
            .npcw-title::before, .npcw-title::after {
                content: '';
                flex: 0 0 44px;
                height: 10px;
                background: ${ruleL} center / 44px 10px no-repeat;
            }
            .npcw-title::after { background-image: ${ruleR}; }
            .npcw-close {
                position: absolute;
                right: 0;
                top: 2px;
                width: 30px;
                height: 30px;
                padding: 0;
                border-radius: 4px;
                border: 1px solid #6e4f2a;
                background: linear-gradient(180deg, #3a2a19, #1a120b);
                color: #e2c58a;
                font: 700 20px/1 var(--npcw-f-body);
                cursor: pointer;
                box-shadow: inset 0 1px 0 rgba(255, 220, 160, 0.15), 0 1px 3px rgba(0, 0, 0, 0.7);
                transition: color 0.12s, border-color 0.12s, box-shadow 0.12s;
            }
            .npcw-close:hover {
                color: #fff6da;
                border-color: var(--npcw-gold);
                box-shadow: 0 0 10px rgba(236, 190, 100, 0.45), inset 0 1px 0 rgba(255, 220, 160, 0.2);
            }

            /* ---- Говорящий ---- */
            .npcw-speaker {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 2px 4px 10px;
            }
            .npcw-portrait {
                position: relative;
                width: 58px;
                height: 58px;
                flex: 0 0 58px;
                padding: 2px;
                box-sizing: border-box;
                border-radius: 6px;
                background: linear-gradient(145deg, #f1d28b, #7b5527 55%, #3a2610);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
            }
            .npcw-portrait img, .npcw-portrait-ini {
                width: 100%;
                height: 100%;
                border-radius: 4px;
                display: block;
                object-fit: cover;
                background: #120e0a;
            }
            .npcw-portrait-ini {
                display: grid;
                place-items: center;
                font: 700 28px/1 var(--npcw-f-head);
                color: #fbe7b4;
                text-shadow: 0 2px 3px #000;
                background:
                    radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.22), transparent 58%),
                    var(--npc-col, #6a5233);
                box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.75);
            }
            .npcw-speaker-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
            .npcw-speaker-name {
                font: 700 19px/1.15 var(--npcw-f-head);
                letter-spacing: 0.02em;
                color: var(--npcw-gold-hi);
                text-shadow: 0 1px 2px #000, 0 0 10px rgba(255, 210, 130, 0.25);
            }
            .npcw-speaker-title {
                font: italic 14px/1.3 var(--npcw-f-body);
                color: var(--npcw-ink-dim);
            }

            /* ---- Поле текста (единственная прокрутка диалога) ---- */
            .npcw-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                overscroll-behavior: contain;
                padding: 12px 10px 12px 12px;
                border-radius: 4px;
                background: linear-gradient(180deg, rgba(8, 6, 4, 0.55), rgba(8, 6, 4, 0.32));
                box-shadow: inset 0 0 0 1px rgba(163, 122, 67, 0.28), inset 0 2px 10px rgba(0, 0, 0, 0.6);
            }

            #npc-window ::-webkit-scrollbar { width: 10px; height: 10px; }
            #npc-window ::-webkit-scrollbar-track {
                background: linear-gradient(90deg, #0c0907, #1a140e 50%, #0c0907);
                border-radius: 6px;
                box-shadow: inset 0 0 0 1px #33250f;
            }
            #npc-window ::-webkit-scrollbar-thumb {
                min-height: 36px;
                border-radius: 6px;
                border: 2px solid transparent;
                background: linear-gradient(90deg, #5e4423, #c59a55 50%, #5e4423) padding-box;
            }
            #npc-window ::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(90deg, #7a5a2e, #e5bd72 50%, #7a5a2e) padding-box;
            }
            #npc-window ::-webkit-scrollbar-corner { background: transparent; }
            @supports (-moz-appearance: none) {
                #npc-window * { scrollbar-width: thin; scrollbar-color: #b48a4a #120e0a; }
            }

            .npcw-who {
                margin: 0 0 4px 30px;
                font: 700 14px/1.2 var(--npcw-f-head);
                letter-spacing: 0.05em;
                color: var(--npcw-gold);
            }
            .npcw-speech {
                position: relative;
                padding: 0 4px 0 30px;
                font-size: 16.5px;
                line-height: 1.6;
                color: var(--npcw-ink);
                text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
                white-space: pre-line;
                user-select: text;
            }
            .npcw-speech::before {
                content: '\\201C';
                position: absolute;
                left: 0;
                top: -6px;
                font: 400 40px/1 Georgia, serif;
                color: rgba(236, 201, 121, 0.5);
            }
            .npcw-fade { animation: npcwFade 0.22s ease-out; }
            @keyframes npcwFade { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }

            .npcw-pager {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 7px;
                margin-top: 12px;
            }
            .npcw-pager i {
                width: 7px;
                height: 7px;
                transform: rotate(45deg);
                background: #3c2c19;
                border: 1px solid #7a5a30;
            }
            .npcw-pager i.on { background: var(--npcw-gold); box-shadow: 0 0 6px rgba(236, 201, 121, 0.7); }
            .npcw-pager span { margin-left: 4px; font-size: 13px; color: var(--npcw-ink-mute); }

            /* ---- Кнопки выбора (под приветствием) ---- */
            .npcw-options {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 14px;
                padding-top: 12px;
                border-top: 1px solid var(--npcw-line);
            }
            .npcw-opt {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                min-height: 40px;
                box-sizing: border-box;
                padding: 6px 12px 6px 8px;
                text-align: left;
                border: 1px solid #5b4224;
                border-radius: 4px;
                background: linear-gradient(180deg, rgba(64, 46, 26, 0.55), rgba(30, 22, 14, 0.78));
                box-shadow: inset 0 1px 0 rgba(255, 222, 160, 0.08), 0 1px 2px rgba(0, 0, 0, 0.6);
                color: #ecdcb8;
                font: 500 15.5px/1.25 var(--npcw-f-body);
                cursor: pointer;
                transition: border-color 0.12s, background 0.12s, box-shadow 0.12s, color 0.12s;
            }
            .npcw-opt:hover, .npcw-opt:focus-visible {
                outline: none;
                border-color: #c99a4b;
                color: #fff3d2;
                background: linear-gradient(180deg, rgba(110, 78, 40, 0.62), rgba(48, 34, 20, 0.88));
                box-shadow: 0 0 12px rgba(232, 180, 90, 0.22), inset 0 1px 0 rgba(255, 222, 160, 0.12);
            }
            .npcw-opt::after { content: '\\203A'; margin-left: 6px; font-size: 20px; line-height: 1; color: #b78c4c; }
            .npcw-opt-ico {
                flex: 0 0 26px;
                width: 26px;
                height: 26px;
                border-radius: 50%;
                display: grid;
                place-items: center;
                font: 700 14px/1 var(--npcw-f-head);
                color: #2a1a0a;
                background: radial-gradient(circle at 35% 30%, #f6dc9a, #a8773a 60%, #4d3218);
                box-shadow: 0 0 0 1px #2a1c0f, 0 0 6px rgba(0, 0, 0, 0.6);
            }
            .npcw-opt-label { flex: 1 1 auto; min-width: 0; }
            .npcw-opt-sub {
                flex: 0 0 auto;
                font: italic 13.5px/1.2 var(--npcw-f-body);
                color: var(--npcw-ink-dim);
            }
            .npcw-opt.q-avail .npcw-opt-ico {
                color: #3a1d00;
                background: radial-gradient(circle at 35% 30%, #fff1b8, #f0b43c 58%, #7a4a0c);
                box-shadow: 0 0 0 1px #2a1c0f, 0 0 10px rgba(255, 190, 60, 0.55);
            }
            .npcw-opt.q-done .npcw-opt-ico {
                color: #0b2a0e;
                background: radial-gradient(circle at 35% 30%, #e2ffd8, #6cc46f 58%, #1f5a24);
                box-shadow: 0 0 0 1px #10240f, 0 0 10px rgba(120, 220, 120, 0.5);
            }
            .npcw-opt.q-done .npcw-opt-sub { color: var(--npcw-ok); font-style: normal; font-weight: 700; }
            .npcw-opt.q-prog .npcw-opt-ico {
                color: #e8dcc4;
                background: radial-gradient(circle at 35% 30%, #8d8577, #4b453c 60%, #211d18);
            }
            .npcw-opt.lore .npcw-opt-ico {
                color: #e9f3ff;
                background: radial-gradient(circle at 35% 30%, #cfe6ff, #5a8fc4 58%, #1d3550);
            }

            /* ---- Карточка задания ---- */
            .npcw-qcard {
                margin-top: 14px;
                padding: 10px 12px 12px;
                border: 1px solid rgba(163, 122, 67, 0.5);
                border-radius: 5px;
                background: linear-gradient(180deg, rgba(58, 42, 24, 0.45), rgba(20, 15, 10, 0.62));
                box-shadow: inset 0 1px 0 rgba(255, 225, 160, 0.06);
            }
            .npcw-qhead {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 4px 12px;
                flex-wrap: wrap;
                padding-bottom: 6px;
                border-bottom: 1px solid var(--npcw-line);
            }
            .npcw-qname { font: 700 17.5px/1.25 var(--npcw-f-head); color: var(--npcw-gold-hi); }
            .npcw-qmeta { font: italic 14px/1.3 var(--npcw-f-body); color: var(--npcw-ink-dim); }
            .npcw-qsec {
                margin: 10px 0 5px;
                font: 700 14px/1.2 var(--npcw-f-head);
                letter-spacing: 0.08em;
                color: var(--npcw-gold);
            }
            .npcw-qobj { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
            .npcw-qobj li { display: flex; align-items: baseline; gap: 8px; font-size: 15px; line-height: 1.4; }
            .npcw-qobj .mk { flex: 0 0 12px; font-size: 11px; color: #b78c4c; }
            .npcw-qobj li.ok { color: var(--npcw-ok); }
            .npcw-qobj li.ok .mk { color: var(--npcw-ok); }
            .npcw-qobj b {
                margin-left: auto;
                padding-left: 8px;
                font-weight: 700;
                color: var(--npcw-gold);
                white-space: nowrap;
                font-variant-numeric: lining-nums tabular-nums;
            }
            .npcw-qobj li.ok b { color: var(--npcw-ok); }
            .npcw-qrew { display: flex; flex-wrap: wrap; gap: 6px; }
            .npcw-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                max-width: 100%;
                box-sizing: border-box;
                padding: 3px 10px 3px 4px;
                border: 1px solid #5b4224;
                border-radius: 15px;
                background: rgba(18, 13, 9, 0.78);
                font-size: 14.5px;
                line-height: 1.3;
                color: var(--npcw-ink);
            }
            .npcw-chip .ci {
                flex: 0 0 24px;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                display: grid;
                place-items: center;
                overflow: hidden;
                background: #0e0b08;
                box-shadow: 0 0 0 1px #6e4f2a;
                font: 700 11px/1 var(--npcw-f-head);
                color: var(--npcw-gold);
            }
            .npcw-chip .ci img { width: 100%; height: 100%; object-fit: cover; }
            .npcw-chip b { color: var(--npcw-gold-hi); font-variant-numeric: lining-nums tabular-nums; }
            .npcw-qchoices { display: flex; flex-direction: column; gap: 5px; }
            .npcw-qchoice {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                text-align: left;
                padding: 6px 10px;
                border: 1px solid #5b4224;
                border-radius: 4px;
                background: rgba(18, 13, 9, 0.7);
                color: var(--npcw-ink);
                font: 15px/1.3 var(--npcw-f-body);
                cursor: pointer;
            }
            .npcw-qchoice::before {
                content: '';
                flex: 0 0 12px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 1px solid #b78c4c;
                background: #0c0907;
            }
            .npcw-qchoice.on { border-color: var(--npcw-gold); background: rgba(110, 78, 40, 0.45); }
            .npcw-qchoice.on::before { background: radial-gradient(circle, var(--npcw-gold-hi) 45%, #0c0907 50%); }

            .npcw-coin {
                display: inline-block;
                width: 13px;
                height: 13px;
                border-radius: 50%;
                vertical-align: -1px;
                background: radial-gradient(circle at 35% 30%, #ffe3a1, #c98b3c 55%, #6b3e14);
                box-shadow: 0 0 0 1px #2a1808, inset 0 0 0 2px rgba(0, 0, 0, 0.15);
            }
            .npcw-chip .ci .npcw-coin { width: 16px; height: 16px; }

            /* ---- Нижние кнопки (9-slice бронзовой таблички) ---- */
            .npcw-footer {
                display: flex;
                justify-content: center;
                flex-wrap: wrap;
                gap: 10px 14px;
                padding-top: 12px;
            }
            .npcw-footer:empty { display: none; }
            .npcw-btn {
                min-width: 132px;
                height: 40px;
                box-sizing: border-box;
                padding: 0 12px;
                border-style: solid;
                border-width: 9px 16px;
                border-image: url('assets/menu/ui/l2_gold_button.webp') 105 210 fill / 9px 16px stretch;
                background: none;
                color: #f3e2b8;
                font: 700 15px/1 var(--npcw-f-head);
                letter-spacing: 0.05em;
                text-shadow: 0 1px 2px #000;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                white-space: nowrap;
                transition: filter 0.12s, transform 0.12s;
            }
            .npcw-btn:hover { filter: brightness(1.18) drop-shadow(0 0 6px rgba(236, 190, 100, 0.45)); color: #fff6da; }
            .npcw-btn:active { transform: translateY(1px); filter: brightness(0.92); }
            .npcw-btn.primary { color: var(--npcw-gold-hi); text-shadow: 0 0 8px rgba(255, 200, 100, 0.55), 0 1px 2px #000; }
            .npcw-btn:disabled { filter: grayscale(0.85) brightness(0.65); cursor: not-allowed; transform: none; }

            /* ===================== Лавка / Обучение ===================== */
            .npcw-pane {
                flex: 1 1 auto;
                min-height: 0;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border-radius: 4px;
                background: rgba(8, 6, 4, 0.5);
                box-shadow: inset 0 0 0 1px rgba(163, 122, 67, 0.3);
            }
            .npcw-tabs {
                display: flex;
                align-items: flex-end;
                gap: 4px;
                padding: 8px 10px 0;
                border-bottom: 1px solid #6e4f2a;
                background: linear-gradient(180deg, rgba(40, 30, 19, 0.6), rgba(20, 15, 10, 0.2));
            }
            .npcw-tab {
                margin-bottom: -1px;
                padding: 7px 18px 6px;
                border: 1px solid #5b4224;
                border-bottom: none;
                border-radius: 5px 5px 0 0;
                background: linear-gradient(180deg, #2a2016, #17110c);
                color: var(--npcw-ink-dim);
                font: 700 15px/1.2 var(--npcw-f-head);
                letter-spacing: 0.04em;
                cursor: pointer;
            }
            .npcw-tab:hover { color: var(--npcw-ink); }
            .npcw-tab.on {
                color: var(--npcw-gold-hi);
                border-color: #a37a43;
                background: linear-gradient(180deg, #4a3520, #1d150e);
                box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.15);
            }
            .npcw-wallet {
                margin-left: auto;
                align-self: center;
                padding: 0 4px 6px;
                font-size: 15px;
                color: var(--npcw-ink-dim);
                white-space: nowrap;
            }
            .npcw-wallet b, .npcw-wallet-sm b {
                color: var(--npcw-gold-hi);
                font-variant-numeric: lining-nums tabular-nums;
            }
            .npcw-wallet-sm { font: 14.5px var(--npcw-f-body); color: var(--npcw-ink-dim); letter-spacing: 0; }

            .npcw-thead {
                padding: 6px 20px 6px 10px;
                font: 700 13px/1.2 var(--npcw-f-head);
                letter-spacing: 0.05em;
                color: var(--npcw-ink-mute);
                border-bottom: 1px solid rgba(110, 79, 42, 0.5);
                background: rgba(0, 0, 0, 0.25);
            }
            .npcw-grid-shop { display: grid; grid-template-columns: 40px minmax(0, 1fr) 72px 104px; gap: 10px; align-items: center; }
            .npcw-grid-tr { display: grid; grid-template-columns: 40px minmax(0, 1fr) 70px 78px 84px; gap: 10px; align-items: center; }
            .npcw-thead > span:nth-child(n+3) { text-align: right; }

            .npcw-list {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                overscroll-behavior: contain;
                scrollbar-gutter: stable;
            }
            .npcw-row {
                min-height: 50px;
                box-sizing: border-box;
                padding: 5px 10px 5px 10px;
                border-bottom: 1px solid rgba(110, 79, 42, 0.22);
                cursor: pointer;
                transition: background 0.1s;
            }
            .npcw-row:nth-child(odd) { background: rgba(255, 230, 180, 0.025); }
            .npcw-row:hover { background: rgba(201, 154, 75, 0.13); }
            .npcw-row.sel {
                background: linear-gradient(90deg, rgba(201, 154, 75, 0.3), rgba(201, 154, 75, 0.08));
                box-shadow: inset 3px 0 0 var(--npcw-gold);
            }
            .npcw-row.dim { opacity: 0.6; }
            .npcw-row > span:nth-child(n+3) { text-align: right; }
            .npcw-ico {
                width: 38px;
                height: 38px;
                box-sizing: border-box;
                display: grid;
                place-items: center;
                overflow: hidden;
                border: 1px solid #6e4f2a;
                border-radius: 3px;
                background: radial-gradient(circle at 50% 35%, #2b2219, #0e0b08);
                box-shadow: inset 0 0 6px #000;
                font-size: 20px;
                line-height: 1;
            }
            .npcw-ico img { width: 100%; height: 100%; object-fit: cover; display: block; }
            .npcw-ico.big { width: 50px; height: 50px; font-size: 26px; border-color: #a37a43; }
            .npcw-nm {
                display: block;
                font: 700 15.5px/1.25 var(--npcw-f-body);
                color: var(--npcw-ink);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .npcw-sub {
                display: block;
                font: 13.5px/1.3 var(--npcw-f-body);
                color: var(--npcw-ink-dim);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .npcw-num { font: 600 14.5px/1.2 var(--npcw-f-body); color: var(--npcw-ink-dim); font-variant-numeric: lining-nums tabular-nums; }
            .npcw-price { font: 700 15.5px/1.2 var(--npcw-f-body); color: #f3d184; white-space: nowrap; font-variant-numeric: lining-nums tabular-nums; }
            .npcw-price.bad, .npcw-num.bad { color: var(--npcw-bad); }
            .npcw-num.ok { color: var(--npcw-ok); }
            .npcw-grade {
                display: inline-block;
                margin-right: 6px;
                padding: 1px 5px;
                border: 1px solid #6d8fb8;
                border-radius: 3px;
                font: 700 12px/1.2 var(--npcw-f-head);
                color: #b9d3f2;
                vertical-align: 1px;
            }
            .npcw-empty {
                padding: 28px 18px;
                text-align: center;
                font-style: italic;
                font-size: 15px;
                color: var(--npcw-ink-dim);
            }

            .npcw-detail {
                flex: 0 0 auto;
                display: grid;
                grid-template-columns: 52px minmax(0, 1fr) auto;
                gap: 4px 14px;
                align-items: center;
                min-height: 88px;
                box-sizing: border-box;
                padding: 10px 14px;
                border-top: 1px solid #8a6233;
                background: linear-gradient(180deg, rgba(52, 38, 22, 0.88), rgba(20, 15, 10, 0.94));
            }
            .npcw-detail.empty { display: flex; justify-content: center; font-style: italic; color: var(--npcw-ink-dim); }
            .npcw-d-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
            .npcw-d-name { font: 700 17px/1.2 var(--npcw-f-head); color: var(--npcw-gold-hi); }
            .npcw-d-meta { font: 13.5px/1.35 var(--npcw-f-body); color: var(--npcw-ink-dim); }
            .npcw-d-desc {
                font: 14.5px/1.4 var(--npcw-f-body);
                color: var(--npcw-ink);
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .npcw-detail-tr .npcw-d-desc { -webkit-line-clamp: 3; }
            .npcw-d-act { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
            .npcw-d-act .npcw-btn { min-width: 128px; height: 38px; }
            .npcw-qty { display: flex; align-items: center; gap: 4px; }
            .npcw-qty button {
                height: 30px;
                min-width: 30px;
                padding: 0 6px;
                border: 1px solid #6e4f2a;
                border-radius: 3px;
                background: linear-gradient(180deg, #3a2a19, #1a120b);
                color: var(--npcw-gold);
                font: 700 16px/1 var(--npcw-f-body);
                cursor: pointer;
            }
            .npcw-qty button.max { font: 700 13px/1 var(--npcw-f-head); letter-spacing: 0.04em; }
            .npcw-qty button:hover { border-color: var(--npcw-gold); color: #fff3d2; }
            .npcw-qty input {
                width: 66px;
                height: 30px;
                box-sizing: border-box;
                text-align: center;
                border: 1px solid #6e4f2a;
                border-radius: 3px;
                background: #0d0a07;
                color: var(--npcw-ink);
                font: 700 15px var(--npcw-f-body);
                font-variant-numeric: lining-nums tabular-nums;
                user-select: text;
            }
            .npcw-qty input:focus { outline: none; border-color: var(--npcw-gold); }
            .npcw-total { font-size: 14.5px; color: var(--npcw-ink-dim); white-space: nowrap; }
            .npcw-total b { font-size: 16px; color: var(--npcw-gold-hi); font-variant-numeric: lining-nums tabular-nums; }
            .npcw-total.bad b { color: var(--npcw-bad); }
            .npcw-req { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
            .npcw-req span {
                padding: 1px 8px;
                border: 1px solid;
                border-radius: 10px;
                font: 13.5px/1.4 var(--npcw-f-body);
            }
            .npcw-req .ok { color: var(--npcw-ok); border-color: rgba(150, 220, 155, 0.4); background: rgba(150, 220, 155, 0.08); }
            .npcw-req .no { color: var(--npcw-bad); border-color: rgba(242, 144, 124, 0.45); background: rgba(242, 144, 124, 0.08); }
            .npcw-hint {
                padding: 8px 14px 9px;
                font: italic 14.5px/1.45 var(--npcw-f-body);
                color: var(--npcw-ink-dim);
                border-top: 1px solid rgba(110, 79, 42, 0.45);
                background: rgba(0, 0, 0, 0.2);
            }

            /* ===================== Баффы / телепорт / склад ===================== */
            .npcw-subhead {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 10px;
                margin: 14px 0 7px;
                padding-top: 10px;
                border-top: 1px solid var(--npcw-line);
                font: 700 15px/1.2 var(--npcw-f-head);
                letter-spacing: 0.05em;
                color: var(--npcw-gold);
            }
            .npcw-sublist { display: flex; flex-direction: column; gap: 6px; }
            .npcw-srow {
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                box-sizing: border-box;
                text-align: left;
                padding: 8px 12px;
                border: 1px solid #5b4224;
                border-radius: 4px;
                background: linear-gradient(180deg, rgba(64, 46, 26, 0.5), rgba(30, 22, 14, 0.75));
                color: var(--npcw-ink);
                font: 15px/1.3 var(--npcw-f-body);
                cursor: pointer;
            }
            .npcw-srow:hover { border-color: #c99a4b; background: linear-gradient(180deg, rgba(110, 78, 40, 0.6), rgba(48, 34, 20, 0.88)); }
            .npcw-srow .tx { flex: 1 1 auto; min-width: 0; }
            .npcw-srow .nm { display: block; font-weight: 700; color: var(--npcw-gold-hi); }
            .npcw-srow .ds { display: block; font-size: 14px; color: var(--npcw-ink-dim); }
            .npcw-srow .pr { flex: 0 0 auto; white-space: nowrap; font-weight: 700; color: #f3d184; }
            .npcw-note { padding: 8px 4px; color: var(--npcw-ink-dim); font-style: italic; }
            .npcw-note.bad { color: var(--npcw-bad); }

            .l2-wh-cols { display: flex; gap: 10px; align-items: stretch; }
            .l2-wh-col { flex: 1 1 0; min-width: 0; }
            .l2-wh-col-title {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 6px;
                margin-bottom: 5px;
                font: 700 14px var(--npcw-f-head);
                color: var(--npcw-ink-dim);
            }
            .l2-wh-slots { color: var(--npcw-gold-hi); font-family: var(--npcw-f-body); font-variant-numeric: lining-nums tabular-nums; }
            .l2-wh-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-height: 230px;
                overflow-y: auto;
                padding: 5px;
                border: 1px solid #4a3620;
                border-radius: 4px;
                background: rgba(8, 6, 4, 0.6);
            }
            .l2-wh-row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 5px 8px;
                border: 1px solid #4a3620;
                border-radius: 3px;
                background: rgba(30, 22, 14, 0.7);
                font: 14.5px/1.25 var(--npcw-f-body);
                color: var(--npcw-ink);
                cursor: pointer;
            }
            .l2-wh-row:hover { border-color: #c99a4b; background: rgba(80, 58, 32, 0.7); }
            .l2-wh-row-blocked { opacity: 0.45; cursor: not-allowed; }
            .l2-wh-row-blocked:hover { border-color: #4a3620; background: rgba(30, 22, 14, 0.7); }
            .l2-wh-row-ico { flex: 0 0 24px; width: 24px; height: 24px; display: grid; place-items: center; font-size: 17px; line-height: 1; }
            .l2-wh-row-ico img { width: 24px; height: 24px; display: block; object-fit: cover; }
            .l2-wh-row-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .l2-wh-row-count { flex: 0 0 auto; color: var(--npcw-gold-hi); font-variant-numeric: lining-nums tabular-nums; }
            .l2-wh-row-plus { flex: 0 0 auto; color: var(--npcw-ok); }
            .l2-wh-note { margin-top: 8px; font: italic 13.5px/1.4 var(--npcw-f-body); color: var(--npcw-ink-dim); }

            /* ===================== Узкие и низкие экраны ===================== */
            @media (max-height: 640px) {
                #npc-window.npcw { padding: 8px 14px 10px; }
                .npcw-titlebar { min-height: 30px; padding: 4px 40px 6px; margin-bottom: 6px; }
                .npcw-speaker { padding-bottom: 8px; }
                .npcw-portrait { width: 50px; height: 50px; flex-basis: 50px; }
                .npcw-footer { padding-top: 10px; }
                .npcw-btn { height: 38px; }
                .npcw-row { min-height: 46px; }
                .npcw-detail { min-height: 78px; padding: 8px 12px; }
                .npcw-hint { padding: 6px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            }
            @media (max-width: 600px) {
                .npcw-grid-shop { grid-template-columns: 36px minmax(0, 1fr) 52px 86px; gap: 8px; }
                .npcw-grid-tr { grid-template-columns: 36px minmax(0, 1fr) 54px 62px 70px; gap: 6px; }
                .npcw-ico { width: 34px; height: 34px; }
                .npcw-detail { grid-template-columns: 46px minmax(0, 1fr); }
                .npcw-d-act { grid-column: 1 / -1; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; }
                .npcw-btn { min-width: 110px; }
                .npcw-tab { padding: 6px 12px 5px; }
                .l2-wh-cols { flex-direction: column; }
            }
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        const closeBtn = this.$('npc-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        this.container.querySelectorAll('[data-shop-tab]').forEach((b) => {
            b.addEventListener('click', () => {
                const tab = b.getAttribute('data-shop-tab');
                if (tab === this._shopTab) return;
                this._shopTab = tab;
                this._shopSel = null;
                this._shopQty = 1;
                this._renderShop();
            });
        });
        this.container.querySelectorAll('[data-tr-tab]').forEach((b) => {
            b.addEventListener('click', () => {
                const tab = b.getAttribute('data-tr-tab');
                if (tab === this._trFilter) return;
                this._trFilter = tab;
                this._renderTrainer();
            });
        });
    }

    initDrag() {
        const titlebar = this.$('npc-titlebar');
        if (!titlebar || !this.container) return;

        const onStart = (cx, cy, target) => {
            if (target.closest('#npc-close, button, a, input')) return;
            titlebar.style.cursor = 'grabbing';
            const rect = this.container.getBoundingClientRect();
            this._dragState = { startX: cx, startY: cy, winX: rect.left, winY: rect.top };
            this._dragged = true;
            this.container.style.transform = 'none';
            this.container.style.left = rect.left + 'px';
            this.container.style.top = rect.top + 'px';
        };
        const onMove = (cx, cy) => {
            if (!this._dragState || !this.container) return;
            const winW = this.container.offsetWidth || 540;
            const winH = this.container.offsetHeight || 480;
            const newX = Math.max(0, Math.min(window.innerWidth - winW, this._dragState.winX + cx - this._dragState.startX));
            const newY = Math.max(0, Math.min(window.innerHeight - winH, this._dragState.winY + cy - this._dragState.startY));
            this.container.style.left = newX + 'px';
            this.container.style.top = newY + 'px';
        };
        const onEnd = () => {
            if (this._dragState) {
                this._dragState = null;
                titlebar.style.cursor = '';
            }
        };

        titlebar.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e.target));
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);
        titlebar.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length === 1 && this._dragState) onMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        window.addEventListener('touchend', onEnd);
    }

    _centerWindow() {
        this._dragged = false;
        this.container.style.transform = '';
        this.container.style.left = '';
        this.container.style.top = '';
    }

    /** После смены размера (диалог ↔ лавка) перетащенное окно не должно уйти за экран. */
    _clampWindow() {
        if (!this._dragged || !this.isOpen()) return;
        const c = this.container;
        const w = c.offsetWidth;
        const h = c.offsetHeight;
        const x = Math.max(0, Math.min(window.innerWidth - w, parseFloat(c.style.left) || 0));
        const y = Math.max(0, Math.min(window.innerHeight - h, parseFloat(c.style.top) || 0));
        c.style.left = x + 'px';
        c.style.top = y + 'px';
    }

    // ------------------------------------------------------------------
    // Общие помощники
    // ------------------------------------------------------------------
    _tpl() {
        return (this.currentNPC && this.currentNPC.template) || {};
    }

    _npcId() {
        const t = this._tpl();
        return t.id || null;
    }

    _npcName() {
        const npc = this.currentNPC;
        if (!npc) return this._seqSpeaker || '';
        const t = npc.template || {};
        const key = 'npc_' + (t.id || '') + '_name';
        const v = this.t(key);
        if (t.id && v && v !== key) return v;
        return this.t(npc.name) || npc.name || 'NPC';
    }

    _npcTitle() {
        const npc = this.currentNPC;
        if (!npc) return '';
        const t = npc.template || {};
        const key = 'npc_' + (t.id || '') + '_title';
        const v = this.t(key);
        if (t.id && v && v !== key) return v;
        return npc.title ? (this.t(npc.title) || npc.title) : '';
    }

    _clean(text) {
        return String(text == null ? '' : text).replace(/\\"/g, '"').replace(/[ \t]+/g, ' ').trim();
    }

    /** «Имя: «реплика»» → «реплика»: имя уже стоит в шапке окна. */
    _stripSpeaker(text) {
        const s = this._clean(text);
        const m = s.match(/^[^:«"“\n]{2,48}:\s*[«"“]([\s\S]+)[»"”]\s*$/);
        return m ? m[1].trim() : s;
    }

    _isSelfName(who) {
        const nm = String(this._npcName() || '').toLowerCase();
        const w = String(who || '').toLowerCase().trim();
        if (!nm || !w) return false;
        return nm === w || nm.indexOf(w) >= 0 || w.indexOf(nm) >= 0;
    }

    _setTitle(text) {
        const el = this.$('npc-titlebar-name');
        if (el) el.textContent = text || '';
    }

    getPortraitUrl(npc) {
        const t = (npc && npc.template) || {};
        if (t.portrait) return t.portrait;
        if (t.sheet && t.sheet.portrait) return t.sheet.portrait;
        return null;
    }

    _renderSpeaker() {
        const npc = this.currentNPC;
        const img = this.$('npc-portrait-img');
        const ini = this.$('npc-portrait-ini');
        const url = this.getPortraitUrl(npc);
        const name = this._npcName();
        if (url) {
            img.src = url;
            img.classList.remove('hidden');
            ini.classList.add('hidden');
        } else {
            img.removeAttribute('src');
            img.classList.add('hidden');
            const words = String(name || '?').split(/\s+/).filter((w) => /^[A-Za-zА-Яа-яЁё]/.test(w));
            const pick = words.length ? words[words.length - 1] : (name || '?');
            ini.textContent = pick.charAt(0).toUpperCase();
            const t = (npc && npc.template) || {};
            const col = (t.sprite && t.sprite.body) || '#6a5233';
            ini.style.setProperty('--npc-col', col);
            ini.classList.remove('hidden');
        }
        this.$('npc-speaker-name').textContent = name;
        const title = this._npcTitle();
        const tEl = this.$('npc-speaker-title');
        tEl.textContent = title;
        tEl.classList.toggle('hidden', !title);
    }

    _setMode(mode, wide) {
        this.mode = mode;
        const c = this.container;
        c.classList.remove('npcw--dialog', 'npcw--shop', 'npcw--trainer', 'npcw--wide');
        c.classList.add('npcw--' + mode);
        if (wide) c.classList.add('npcw--wide');
        this.$('npc-content-area').classList.toggle('hidden', mode !== 'dialog');
        this.$('npc-shop').classList.toggle('hidden', mode !== 'shop');
        this.$('npc-trainer').classList.toggle('hidden', mode !== 'trainer');
        this.$('npc-speaker-card').classList.toggle('hidden', mode !== 'dialog');
        this._hideItemTooltip();
        if (this._dragged) requestAnimationFrame(() => this._clampWindow());
    }

    _resetDialogParts() {
        ['npc-speech-who', 'npc-pager', 'npc-quest-card', 'npc-options'].forEach((id) => {
            const el = this.$(id);
            if (el) el.classList.add('hidden');
        });
        this.hideSubviews();
        const body = this.$('npc-content-area');
        if (body) body.scrollTop = 0;
    }

    hideSubviews() {
        if (!this.container) return;
        this.container.querySelectorAll('.npc-subview').forEach((el) => el.classList.add('hidden'));
    }

    _say(text, who) {
        const sp = this.$('npc-speech-text');
        const clean = this._clean(text);
        sp.textContent = clean;
        sp.classList.toggle('hidden', !clean);
        sp.classList.remove('npcw-fade');
        void sp.offsetWidth;
        sp.classList.add('npcw-fade');
        const w = this.$('npc-speech-who');
        const showWho = !!(who && this.currentNPC && !this._isSelfName(who));
        w.textContent = showWho ? who : '';
        w.classList.toggle('hidden', !showWho);
    }

    _footer(btns) {
        const f = this.$('npc-footer');
        f.innerHTML = '';
        (btns || []).forEach((b) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'npcw-btn' + (b.primary ? ' primary' : '');
            el.textContent = b.label;
            if (b.disabled) el.disabled = true;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (!el.disabled && b.onClick) b.onClick();
            });
            f.appendChild(el);
        });
    }

    _backBtn(fn) {
        return { label: '‹ ' + this.tf('back', 'Назад'), onClick: fn || (() => this.showGreeting()) };
    }

    _closeBtn() {
        return { label: this.tf('close', 'Закрыть'), onClick: () => this.close() };
    }

    _itemTpl(id) {
        if (!id) return null;
        try {
            if (typeof window.ensureItemTemplate === 'function') {
                const t = window.ensureItemTemplate(id);
                if (t) return t;
            }
        } catch (e) { /* ignore */ }
        return (window.ITEM_DATABASE || {})[id] || null;
    }

    _itemIconHtml(tpl) {
        if (typeof getItemIconHtml === 'function') return getItemIconHtml(tpl || { icon: '📦' });
        const raw = tpl && tpl.icon;
        if (raw && /\//.test(raw)) return '<img src="' + npcwEsc(raw) + '" alt="" draggable="false">';
        return npcwEsc(raw || '📦');
    }

    _showItemTooltip(tpl, e) {
        const invUI = window.game && window.game.inventoryUI;
        if (tpl && invUI && invUI.showTooltip) invUI.showTooltip(tpl, e);
    }

    _hideItemTooltip() {
        const invUI = window.game && window.game.inventoryUI;
        if (invUI && invUI.hideTooltip) invUI.hideTooltip();
    }

    _currency() {
        if (this._shopCurrency != null) return this._shopCurrency | 0;
        const g = window.game;
        return (g && g.inventory) ? (g.inventory.currency | 0) : 0;
    }

    _chat(text) {
        const g = window.game;
        if (g && g.addChatMessage) g.addChatMessage(text, 'system');
    }

    // ------------------------------------------------------------------
    // Открытие / закрытие
    // ------------------------------------------------------------------
    showNPC(npc) {
        this.currentNPC = npc;
        this._seqSpeaker = null;
        this._pendingTurnin = null;
        this._shopCurrency = null;
        this._centerWindow();
        this.container.classList.add('open');
        this.showGreeting();
    }

    close() {
        this._hideItemTooltip();
        if (this.container) this.container.classList.remove('open');
        this.currentNPC = null;
        this._seq = null;
        this._seqSpeaker = null;
        this._questCard = null;
        this._pendingTurnin = null;
        this.mode = 'dialog';
        this.view = 'greet';
        this._shopItems = null;
        this._shopSel = null;
        this._shopCurrency = null;
        this._trSel = null;
        this._whNpcId = null;
        this._whKind = null;
        this._whEquip = null;
        this._whInv = null;
        this._whMap = null;
        this._whInvPlus = null;
        this._whPlus = null;
    }

    /** Совместимость: quest.js зовёт после пакета `quests`. */
    renderMainDialogue() {
        this.refresh(false);
    }

    /** Совместимость: старое «все задания» — теперь задания кнопками в приветствии. */
    showQuestsView() {
        this.showGreeting();
    }

    /**
     * Обновить открытое окно после изменения данных (квесты, инвентарь, язык),
     * не сбрасывая просмотр: идущий разговор не прерывается.
     */
    refresh(full) {
        if (!this.isOpen()) return;
        if (this.mode === 'shop') { this._renderShop(true); return; }
        if (this.mode === 'trainer') { this._renderTrainer(); return; }
        if (this.view === 'greet' && this.currentNPC) {
            if (full) this.showGreeting();
            else this._renderOptions();
            return;
        }
        if (this.view === 'quest' && this._questCard) {
            const qc = this._questCard;
            const st = this._questState(qc.qId);
            const S = window.QUEST_STATES || {};
            const done = S.COMPLETABLE || 'completable';
            const prog = S.IN_PROGRESS || 'in_progress';
            if (qc.kind === 'offer' && st !== 'available') { this.showGreeting(); return; }
            if (qc.kind === 'turnin' && st !== done) {
                // Ждём реплики сдачи (quest_complete_ok → showCompleteDialogue).
                if (this._pendingTurnin === qc.qId && this._questLines(qc.qId, 'complete').length) return;
                this._pendingTurnin = null;
                this.showGreeting();
                return;
            }
            if (qc.kind === 'progress' && st !== prog) { this.showGreeting(); return; }
            this._showQuestCard(qc.qId, qc.kind, qc.page, true);
        }
    }

    // ------------------------------------------------------------------
    // Приветствие и кнопки
    // ------------------------------------------------------------------
    _greetingText() {
        const t = this._tpl();
        const fb = NPC_GREETINGS[t.id];
        if (fb) return this._clean(this.tf('npc_' + t.id + '_greet', fb));
        const idle = (t.dialogue && Array.isArray(t.dialogue.idle)) ? t.dialogue.idle : [];
        if (idle.length) return this._clean(this.t(idle[0]) || idle[0]);
        return this._clean(this.tf('welcome_default', 'Приветствую тебя на Острове Поющей Стали.'));
    }

    _talkLines() {
        const t = this._tpl();
        const idle = (t.dialogue && Array.isArray(t.dialogue.idle)) ? t.dialogue.idle : [];
        const greet = this._greetingText();
        return idle
            .map((l) => this._clean(this.t(l) || l))
            .filter((l) => l && l !== greet);
    }

    showGreeting() {
        if (!this.currentNPC) { this.close(); return; }
        this._seq = null;
        this._questCard = null;
        this.view = 'greet';
        this._setMode('dialog');
        this._resetDialogParts();
        this._setTitle(this.tf('dialogue', 'Диалог'));
        this._renderSpeaker();
        this._say(this._greetingText());
        this._renderOptions();
        this._footer([this._closeBtn()]);
    }

    _isTrainer() {
        const t = this._tpl();
        return t.type === 'trainer' || t.id === 'instructor_thorn' ||
            (Array.isArray(t.trainerClasses) && t.trainerClasses.length > 0);
    }

    _collectOptions() {
        const t = this._tpl();
        const out = [];

        if (this._talkLines().length) {
            out.push({ icon: '…', label: this.tf('talk', 'Поговорить'), onClick: () => this.startTalk() });
        }
        if (t.id === 'biotin') {
            out.push({
                icon: '❖', cls: 'lore',
                label: this._clean(this.tf('biotin_lore_ask', 'Спросить: «Откуда на острове обезумевшая техника?»')),
                onClick: () => this._startLore()
            });
        }
        this._questTalkTopics().forEach((o) => out.push(o));
        this._questEntries().forEach((o) => out.push(o));

        if (t.type === 'shop' || t.shop) {
            out.push({ icon: '⚖︎', label: this.tf('trade', 'Торговать'), onClick: () => this.showShopView() });
        }
        if (this._isTrainer()) {
            out.push({ icon: '✦', label: this.tf('learn_skills', 'Изучить навыки'), onClick: () => this.showTrainerView() });
        }
        if (t.type === 'buff' || t.buffs) {
            out.push({ icon: '✚', label: this.tf('buffs_subtitle', 'Техобслуживание'), onClick: () => this.showBuffsView() });
        }
        if (t.type === 'teleport' || (t.teleports && t.teleports.length)) {
            out.push({ icon: '➶︎', label: this.tf('teleport_go', 'Телепортироваться'), onClick: () => this.showTeleportView() });
        }
        if (t.forge) {
            out.push({
                icon: '♨︎', label: this.tf('forge_subtitle', 'Паровой Горн'),
                onClick: () => {
                    const cu = window.game && window.game.craftUI;
                    if (cu && typeof cu.openForge === 'function') {
                        cu.openForge(t.id);
                        this.close();
                    }
                }
            });
        }
        if (t.type === 'warehouse') {
            out.push({ icon: '▣', label: this.tf('warehouse_subtitle', 'Персональный склад'), onClick: () => this.showWarehouseView('personal') });
            const net = window.game && window.game.net;
            if (net && net.clan) {
                out.push({ icon: '▣', label: this.tf('clan_warehouse', 'Клан-склад'), onClick: () => this.showWarehouseView('clan') });
            }
        }
        if (t.id === 'biotin') {
            out.push({
                icon: '⚙︎', label: this.tf('biotin_trophy_turnin_btn', 'Сдать трофеи и детали Смотрителю'),
                onClick: () => {
                    const net = window.game && window.game.net;
                    if (net && typeof net.send === 'function') net.send({ t: 'biotin_trophy_turnin', npcId: 'biotin' });
                }
            });
        }
        return out;
    }

    _renderOptions() {
        const box = this.$('npc-options');
        if (!box) return;
        box.innerHTML = '';
        const opts = this._collectOptions();
        opts.forEach((o) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'npcw-opt' + (o.cls ? ' ' + o.cls : '');
            b.innerHTML = '<span class="npcw-opt-ico">' + npcwEsc(o.icon) + '</span>' +
                '<span class="npcw-opt-label"></span>' +
                (o.sub ? '<span class="npcw-opt-sub"></span>' : '');
            b.querySelector('.npcw-opt-label').textContent = o.label;
            if (o.sub) b.querySelector('.npcw-opt-sub').textContent = o.sub;
            b.addEventListener('click', (e) => { e.preventDefault(); o.onClick(); });
            box.appendChild(b);
        });
        box.classList.toggle('hidden', !opts.length);
    }

    // ------------------------------------------------------------------
    // Порционный текст
    // ------------------------------------------------------------------
    _pagesFrom(lines) {
        const out = [];
        (lines || []).forEach((ln) => {
            if (!ln) return;
            const who = (typeof ln === 'object') ? (ln.speaker ? (this.t(ln.speaker) || ln.speaker) : null) : null;
            const raw = (typeof ln === 'object') ? (ln.text || '') : ln;
            const txt = this._clean(this.t(raw) || raw);
            npcwChunk(txt).forEach((part) => out.push({ who, text: part }));
        });
        return out;
    }

    startTalk() {
        this.startSequence(this._pagesFrom(this._talkLines()), {
            doneLabel: this.tf('talk_done', 'Понятно'),
            title: this.tf('dialogue', 'Диалог')
        });
    }

    _startLore() {
        const keys = ['biotin_lore_seq_1', 'biotin_lore_seq_2', 'biotin_lore_seq_3', 'biotin_lore_seq_4'];
        const lines = keys.map((k) => this.t(k)).filter((v, i) => v && v !== keys[i]);
        this.startSequence(this._pagesFrom(lines), {
            doneLabel: this.tf('talk_done', 'Понятно'),
            title: this.tf('dialogue', 'Диалог')
        });
    }

    /**
     * Показать реплики по одной. opts: done(), doneLabel, back(), title.
     */
    startSequence(pages, opts) {
        opts = opts || {};
        const list = (pages || []).filter((p) => p && p.text);
        const done = opts.done || (() => { if (this.currentNPC) this.showGreeting(); else this.close(); });
        if (!list.length) { done(); return; }
        this._seq = {
            pages: list,
            index: 0,
            done,
            doneLabel: opts.doneLabel || this.tf('talk_done', 'Понятно'),
            back: opts.back || null,
            title: opts.title || null
        };
        this._renderSeq();
    }

    _renderSeq() {
        const s = this._seq;
        if (!s) return;
        this.view = 'seq';
        this._setMode('dialog');
        this._resetDialogParts();
        if (this.currentNPC) this._renderSpeaker();
        if (s.title) this._setTitle(s.title);
        const pg = s.pages[s.index];
        this._say(pg.text, pg.who);
        this._renderPager(s.index, s.pages.length);
        const last = s.index >= s.pages.length - 1;
        this._footer([
            this._backBtn(() => {
                if (s.index > 0) { s.index--; this._renderSeq(); }
                else if (s.back) s.back();
                else if (this.currentNPC) this.showGreeting();
                else this.close();
            }),
            {
                label: last ? s.doneLabel : (this.tf('next', 'Далее') + ' ›'),
                primary: true,
                onClick: () => {
                    if (!last) { s.index++; this._renderSeq(); return; }
                    this._seq = null;
                    s.done();
                }
            }
        ]);
    }

    _renderPager(index, total) {
        const el = this.$('npc-pager');
        if (!el) return;
        if (total <= 1) { el.classList.add('hidden'); el.innerHTML = ''; return; }
        let h = '';
        if (total <= 12) {
            for (let i = 0; i < total; i++) h += '<i class="' + (i === index ? 'on' : '') + '"></i>';
        }
        h += '<span>' + (index + 1) + ' / ' + total + '</span>';
        el.innerHTML = h;
        el.classList.remove('hidden');
    }

    /** Внешний вход: quest.js (реплики сдачи) и старый код. Элементы {speaker, text} или строки. */
    showDialogue(dialogueList) {
        if (!dialogueList || (Array.isArray(dialogueList) && !dialogueList.length)) return;
        const list = Array.isArray(dialogueList) ? dialogueList : [dialogueList];
        this._pendingTurnin = null;
        if (!this.isOpen()) {
            this._centerWindow();
            this.container.classList.add('open');
        }
        if (!this.currentNPC) {
            const first = list[0];
            this._seqSpeaker = (first && typeof first === 'object' && first.speaker) ? first.speaker : 'NPC';
            this.$('npc-speaker-name').textContent = this._seqSpeaker;
            this.$('npc-speaker-title').classList.add('hidden');
            this.$('npc-portrait-img').classList.add('hidden');
            const ini = this.$('npc-portrait-ini');
            ini.textContent = String(this._seqSpeaker).charAt(0).toUpperCase();
            ini.classList.remove('hidden');
        }
        this.startSequence(this._pagesFrom(list), {
            doneLabel: this.tf('talk_done', 'Понятно'),
            title: this.tf('dialogue', 'Диалог')
        });
    }

    // ------------------------------------------------------------------
    // Квесты
    // ------------------------------------------------------------------
    _qm() {
        return window.game && window.game.questManager;
    }

    _questTpl(qId) {
        const qm = this._qm();
        const q = qm && qm.quests ? qm.quests[qId] : null;
        return (q && q.template) || (window.QUEST_DATABASE ? window.QUEST_DATABASE[qId] : null) || null;
    }

    _questName(qId) {
        const key = 'quest_' + qId + '_name';
        const v = this.t(key);
        if (v && v !== key) return v;
        const tpl = this._questTpl(qId);
        return (tpl && tpl.name) || qId;
    }

    _questDesc(qId) {
        const key = 'quest_' + qId + '_desc';
        const v = this.t(key);
        if (v && v !== key) return v;
        const tpl = this._questTpl(qId);
        return (tpl && tpl.description) || '';
    }

    _questLines(qId, part) {
        const d = (window.QUEST_DIALOGUES || {})[qId];
        return (d && Array.isArray(d[part])) ? d[part] : [];
    }

    /** 'available' | состояние из QuestManager. */
    _questState(qId) {
        const qm = this._qm();
        if (!qm) return null;
        const st = qm.stateOf(qId);
        const S = window.QUEST_STATES || {};
        if ((st === (S.NOT_STARTED || 'not_started') || !st) && qm.isAvailable(qId)) return 'available';
        if (st === (S.COMPLETED || 'completed') && qm.isAvailable(qId)) return 'available'; // повторяемые
        return st;
    }

    _questEntries() {
        const t = this._tpl();
        const qm = this._qm();
        if (!qm || !Array.isArray(t.quests)) return [];
        const S = window.QUEST_STATES || {};
        const done = [], avail = [], prog = [];
        t.quests.forEach((qId) => {
            const st = this._questState(qId);
            const name = this._questName(qId);
            const tpl = this._questTpl(qId) || {};
            if (st === (S.COMPLETABLE || 'completable')) {
                done.push({ icon: '?', cls: 'q-done', label: name, sub: this.tf('quest_ready_tag', 'сдать'),
                    onClick: () => this._runQuest(qId, 'turnin') });
            } else if (st === 'available') {
                avail.push({ icon: '!', cls: 'q-avail', label: name, sub: NPCW_QUEST_TYPES[tpl.type] || '',
                    onClick: () => this._runQuest(qId, 'offer') });
            } else if (st === (S.IN_PROGRESS || 'in_progress')) {
                prog.push({ icon: '…', cls: 'q-prog', label: name, sub: this.tf('quest_in_progress_tag', 'в процессе'),
                    onClick: () => this._runQuest(qId, 'progress') });
            }
        });
        return done.concat(avail, prog);
    }

    /** talk-цели активных заданий, которые ведут к этому NPC (поле line в quest-db). */
    _questTalkTopics() {
        const qm = this._qm();
        const id = this._npcId();
        if (!qm || !id || !qm.quests) return [];
        const out = [];
        Object.keys(qm.quests).forEach((qId) => {
            const tpl = this._questTpl(qId);
            if (!tpl || !Array.isArray(tpl.objectives)) return;
            tpl.objectives.forEach((o) => {
                if (o && o.type === 'talk' && o.target === id && o.line) {
                    out.push({
                        icon: '❖', cls: 'lore',
                        label: '«' + this._questName(qId) + '»: ' + this.tf('quest_ask', 'расспросить'),
                        onClick: () => this.startSequence(this._pagesFrom([o.line]), {
                            doneLabel: this.tf('talk_done', 'Понятно'),
                            title: this.tf('quest', 'Задание')
                        })
                    });
                }
            });
        });
        return out;
    }

    /**
     * Квест по шагам: реплики выдачи/хода по одной, последняя — вместе с
     * карточкой задания (цели, награда) и кнопками «Принять / Отказаться».
     */
    _runQuest(qId, kind) {
        let pages;
        if (kind === 'offer') {
            const st = this._questLines(qId, 'start');
            pages = st.length ? this._pagesFrom(st) : this._pagesFrom([this._questDesc(qId)]);
        } else if (kind === 'progress') {
            const pr = this._questLines(qId, 'progress');
            pages = pr.length ? this._pagesFrom(pr)
                : [{ text: this.tf('quest_progress_default', 'Задание ещё не выполнено. Возвращайся, когда закончишь начатое.') }];
        } else {
            pages = [{ text: this.tf('quest_turnin_prompt', 'Вижу, дело сделано. Отчитайся — и получишь положенное.') }];
        }
        if (!pages.length) pages = [{ text: '' }];
        const lastPage = pages[pages.length - 1];
        const head = pages.slice(0, -1);
        this._rewardChoice = 0;
        const showCard = () => this._showQuestCard(qId, kind, lastPage);
        if (head.length) {
            this.startSequence(head, { done: showCard, doneLabel: this.tf('next', 'Далее') + ' ›', title: this.tf('quest', 'Задание') });
        } else {
            showCard();
        }
    }

    _showQuestCard(qId, kind, page, keepScroll) {
        const body = this.$('npc-content-area');
        const sc = keepScroll && body ? body.scrollTop : 0;
        this._questCard = { qId, kind, page };
        this.view = 'quest';
        this._setMode('dialog');
        this._resetDialogParts();
        this._renderSpeaker();
        this._setTitle(this.tf('quest', 'Задание'));
        if (!keepScroll) this._say(page ? page.text : '', page ? page.who : null);
        const card = this.$('npc-quest-card');
        card.innerHTML = this._questCardHtml(qId, kind);
        card.classList.remove('hidden');
        card.querySelectorAll('[data-choice]').forEach((el) => {
            el.addEventListener('click', () => {
                this._rewardChoice = +el.getAttribute('data-choice') || 0;
                card.querySelectorAll('[data-choice]').forEach((x) => x.classList.toggle('on', x === el));
            });
        });
        if (keepScroll && body) body.scrollTop = sc;

        if (kind === 'offer') {
            this._footer([
                { label: this.tf('decline', 'Отказаться'), onClick: () => this.showGreeting() },
                {
                    label: this.tf('accept', 'Принять'), primary: true,
                    onClick: () => {
                        const qm = this._qm();
                        if (qm) qm.startQuest(qId);
                        this.showGreeting();
                    }
                }
            ]);
        } else if (kind === 'turnin') {
            const waiting = this._pendingTurnin === qId;
            this._footer([
                { label: this.tf('later', 'Позже'), onClick: () => { this._pendingTurnin = null; this.showGreeting(); } },
                {
                    label: waiting ? '…' : this.tf('quest_turnin_btn', 'Сдать задание'), primary: true, disabled: waiting,
                    onClick: () => {
                        const qm = this._qm();
                        if (!qm) return;
                        const tpl = this._questTpl(qId) || {};
                        const hasChoice = tpl.rewards && Array.isArray(tpl.rewards.choices) && tpl.rewards.choices.length;
                        this._pendingTurnin = qId;
                        qm.completeQuest(qId, hasChoice ? this._rewardChoice : undefined);
                        this._showQuestCard(qId, kind, page, true);
                        // Отказ сервера (полная сумка и т.п.) приходит сообщением в чат —
                        // через 3 с кнопка снова активна.
                        setTimeout(() => {
                            if (this._pendingTurnin === qId && this.view === 'quest') {
                                this._pendingTurnin = null;
                                this._showQuestCard(qId, kind, page, true);
                            }
                        }, 3000);
                    }
                }
            ]);
        } else {
            this._footer([this._backBtn(), this._closeBtn()]);
        }
    }

    _questCardHtml(qId, kind) {
        const tpl = this._questTpl(qId) || {};
        const qm = this._qm();
        const q = qm && qm.quests ? qm.quests[qId] : null;
        const prog = (kind !== 'offer' && q && Array.isArray(q.progress)) ? q.progress : null;
        const meta = [];
        if (NPCW_QUEST_TYPES[tpl.type]) meta.push(NPCW_QUEST_TYPES[tpl.type]);
        if (tpl.party) meta.push(this.tf('quest_party', 'групповое'));
        if (tpl.levelReq) meta.push(this.tf('level_short', 'ур.') + ' ' + tpl.levelReq + '+');

        let h = '<div class="npcw-qhead"><span class="npcw-qname">' + npcwEsc(this._questName(qId)) + '</span>' +
            '<span class="npcw-qmeta">' + npcwEsc(meta.join(' · ')) + '</span></div>';

        const objs = Array.isArray(tpl.objectives) ? tpl.objectives : [];
        if (objs.length) {
            h += '<div class="npcw-qsec">' + npcwEsc(this.tf('objectives_title', 'Цели')) + '</div><ul class="npcw-qobj">';
            objs.forEach((o, i) => {
                const need = o.count | 0;
                const cur = prog ? Math.min(prog[i] | 0, need) : null;
                const ok = cur != null && need > 0 && cur >= need;
                let num = '';
                if (cur != null) num = cur + '/' + need;
                else if (!(o.type === 'talk' && need <= 1)) num = '×' + need;
                h += '<li class="' + (ok ? 'ok' : '') + '"><span class="mk">' + (ok ? '✔' : '◆') + '</span>' +
                    '<span>' + npcwEsc(o.description || o.target) + '</span>' + (num ? '<b>' + num + '</b>' : '') + '</li>';
            });
            h += '</ul>';
        }

        const r = tpl.rewards || {};
        const chips = [];
        if (r.currency > 0) chips.push('<span class="npcw-chip"><span class="ci"><i class="npcw-coin"></i></span><b>' + npcwFmt(r.currency) + '</b> ' + npcwEsc(this.tf('copper_word', 'меди')) + '</span>');
        if (r.exp > 0) chips.push('<span class="npcw-chip"><span class="ci">✦</span><b>' + npcwFmt(r.exp) + '</b> ' + npcwEsc(this.tf('xp', 'опыта')) + '</span>');
        if (r.sp > 0) chips.push('<span class="npcw-chip"><span class="ci">SP</span><b>' + npcwFmt(r.sp) + '</b> SP</span>');
        const itemChip = (it) => {
            const itpl = this._itemTpl(it.id);
            const nm = (itpl && itpl.name) || it.id;
            return '<span class="npcw-chip" title="' + npcwEsc(nm) + '"><span class="ci">' + this._itemIconHtml(itpl) + '</span>' +
                npcwEsc(nm) + ((it.count | 0) > 1 ? ' <b>×' + npcwFmt(it.count) + '</b>' : '') + '</span>';
        };
        (Array.isArray(r.items) ? r.items : []).forEach((it) => chips.push(itemChip(it)));
        if (r.byClass && typeof r.byClass === 'object') {
            const p = window.game && window.game.player;
            const cls = (p && (p.playerClass || p.classId)) || 'operator';
            const root = (window.CLASS_SYSTEM && typeof window.CLASS_SYSTEM.rootClass === 'function')
                ? window.CLASS_SYSTEM.rootClass(cls) : cls;
            const list = r.byClass[cls] || r.byClass[root] || [];
            list.forEach((it) => chips.push(itemChip(it)));
        }
        if (r.buff && r.buff.id) {
            const mins = Math.round((r.buff.duration || 0) / 60);
            chips.push('<span class="npcw-chip"><span class="ci">✚</span>' + npcwEsc(this.tf('quest_buff_word', 'Усиление')) +
                (mins ? ' <b>' + mins + ' ' + npcwEsc(this.tf('min', 'мин')) + '</b>' : '') + '</span>');
        }
        if (r.classChange || tpl.classChange) {
            chips.push('<span class="npcw-chip"><span class="ci">★</span>' + npcwEsc(this.tf('quest_class_change', 'Смена профессии')) + '</span>');
        }
        if (chips.length) {
            h += '<div class="npcw-qsec">' + npcwEsc(this.tf('reward_title', 'Награда')) + '</div><div class="npcw-qrew">' + chips.join('') + '</div>';
        }
        if (Array.isArray(r.choices) && r.choices.length) {
            h += '<div class="npcw-qsec">' + npcwEsc(this.tf('reward_choice', 'Награда на выбор')) + '</div><div class="npcw-qchoices">';
            r.choices.forEach((c, i) => {
                const items = Array.isArray(c.items) ? c.items : [];
                const nm = c.name || items.map((it) => {
                    const itpl = this._itemTpl(it.id);
                    return ((itpl && itpl.name) || it.id) + ((it.count | 0) > 1 ? ' ×' + it.count : '');
                }).join(', ') || ('#' + (i + 1));
                h += '<button type="button" class="npcw-qchoice' + (i === this._rewardChoice ? ' on' : '') + '" data-choice="' + i + '">' +
                    npcwEsc(nm) + '</button>';
            });
            h += '</div>';
        }
        return h;
    }

    // ------------------------------------------------------------------
    // Лавка (покупка / продажа)
    // ------------------------------------------------------------------
    showShopView() {
        const npcId = this._npcId();
        if (!npcId) return;
        this._shopNpcId = npcId;
        this._shopTab = 'buy';
        this._shopSel = null;
        this._shopQty = 1;
        this._shopItems = null;
        this._shopOffline = false;
        this._setMode('shop');
        this._setTitle(this.tf('shop_title', 'Лавка') + ' · ' + this._npcName());
        this._footer([this._backBtn(), this._closeBtn()]);
        const net = window.game && window.game.net;
        if (net && typeof net.intentShopOpen === 'function') net.intentShopOpen(npcId);
        else this._shopOffline = true;
        this._renderShop();
    }

    /** Каталог из пакета shop_open (цены — серверные). */
    applyShopCatalog(m) {
        if (!m || !this.isOpen()) return;
        const npcId = this._npcId();
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._shopNpcId = m.npcId || npcId;
        this._shopSellRate = m.sellRate != null ? m.sellRate : 0.4;
        this._shopItems = Array.isArray(m.items) ? m.items : [];
        if (m.currency != null) this._shopCurrency = m.currency;
        if (this.mode === 'shop') this._renderShop(true);
    }

    /** Баланс после покупки/продажи/баффа. Без аргумента — из локального инвентаря. */
    refreshShopCurrency(value) {
        if (value != null) this._shopCurrency = value;
        const cur = this._currency();
        ['shop-currency', 'buff-currency', 'teleport-currency', 'wh-currency'].forEach((id) => {
            const el = this.$(id);
            if (el && (id === 'shop-currency' || value != null)) el.textContent = npcwFmt(cur);
        });
        if (this.isOpen() && this.mode === 'shop') this._renderShop(true);
    }

    _bagCounts() {
        const inv = window.game && window.game.inventory;
        const map = Object.create(null);
        if (inv && Array.isArray(inv.slots)) {
            inv.slots.forEach((it) => {
                if (!it || it.isEquipped) return;
                const id = String(it.templateId || (it.template && it.template.id) || '').toLowerCase();
                if (!id) return;
                map[id] = (map[id] || 0) + Math.max(1, it.count | 0);
            });
        }
        return map;
    }

    _shopRows() {
        const bag = this._bagCounts();
        if (this._shopTab === 'sell') {
            const NP = window.NPCS;
            const rows = [];
            Object.keys(bag).forEach((id) => {
                if (id === 'copper_parts') return;
                if (NP && typeof NP.npcBuys === 'function' && !NP.npcBuys(id)) return;
                const unit = (NP && typeof NP.sellPrice === 'function') ? NP.sellPrice(id) : 0;
                const tpl = this._itemTpl(id);
                rows.push({
                    id, tpl, name: (tpl && tpl.name) || id, price: unit, owned: bag[id],
                    grade: (tpl && tpl.grade) || 'no_grade', type: (tpl && tpl.type) || '',
                    stackable: true, maxQty: bag[id]
                });
            });
            rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            return rows;
        }
        return (this._shopItems || []).map((e) => {
            const tpl = this._itemTpl(e.itemId);
            const NP = window.NPCS;
            const cap = Math.min((NP && NP.MAX_BUY_COUNT) || 999, e.maxStack || 999);
            return {
                id: e.itemId, tpl, name: (tpl && tpl.name) || e.name || e.itemId, price: e.price | 0,
                owned: bag[e.itemId] || 0, grade: e.grade || (tpl && tpl.grade) || 'no_grade',
                type: e.type || (tpl && tpl.type) || '', stackable: !!e.stackable,
                maxQty: e.stackable ? cap : 1
            };
        });
    }

    _gradeBadge(grade) {
        const g = String(grade || '').toLowerCase();
        if (!g || g === 'no_grade' || g === 'none' || g === 'ng') return '';
        return '<span class="npcw-grade">' + npcwEsc(g.toUpperCase()) + '</span>';
    }

    _renderShop(keepScroll) {
        const tabs = this.container.querySelectorAll('[data-shop-tab]');
        tabs.forEach((b) => {
            const tab = b.getAttribute('data-shop-tab');
            b.classList.toggle('on', tab === this._shopTab);
            b.textContent = tab === 'buy' ? this.tf('shop_tab_buy', 'Купить') : this.tf('shop_tab_sell', 'Продать');
        });
        this.$('shop-currency').textContent = npcwFmt(this._currency());
        this.$('shop-col-name').textContent = this._shopTab === 'buy' ? this.tf('shop_col_item', 'Товар') : this.tf('shop_col_bag', 'Предмет из сумки');
        this.$('shop-col-own').textContent = this.tf('shop_col_own', 'В сумке');
        this.$('shop-col-price').textContent = this._shopTab === 'buy' ? this.tf('shop_col_price', 'Цена') : this.tf('shop_col_offer', 'Выкуп');

        const list = this.$('shop-items');
        const sc = keepScroll ? list.scrollTop : 0;
        this._hideItemTooltip();
        list.innerHTML = '';

        if (this._shopTab === 'buy' && this._shopItems == null) {
            list.innerHTML = '<div class="npcw-empty">' + npcwEsc(this._shopOffline
                ? this.tf('offline', 'Нет связи с сервером.')
                : this.tf('loading', 'Загрузка…')) + '</div>';
            this._renderShopDetail(null);
            return;
        }
        const rows = this._shopRows();
        this._shopRowsCache = rows;
        if (!rows.length) {
            list.innerHTML = '<div class="npcw-empty">' + npcwEsc(this._shopTab === 'buy'
                ? this.tf('shop_empty', 'Товаров нет.')
                : this.tf('shop_sell_empty', 'В сумке нет того, что купит торговец.')) + '</div>';
            this._shopSel = null;
            this._renderShopDetail(null);
            return;
        }
        if (!rows.some((r) => r.id === this._shopSel)) {
            this._shopSel = rows[0].id;
            this._shopQty = 1;
        }
        const cur = this._currency();
        rows.forEach((r) => {
            const el = document.createElement('div');
            el.className = 'npcw-row npcw-grid-shop' + (r.id === this._shopSel ? ' sel' : '');
            const typeLbl = NPCW_ITEM_TYPES[String(r.type).toLowerCase()] || '';
            const poor = this._shopTab === 'buy' && r.price > cur;
            el.innerHTML =
                '<span class="npcw-ico">' + this._itemIconHtml(r.tpl) + '</span>' +
                '<span style="min-width:0"><span class="npcw-nm"></span><span class="npcw-sub">' + this._gradeBadge(r.grade) + npcwEsc(typeLbl) + '</span></span>' +
                '<span class="npcw-num">' + (r.owned ? npcwFmt(r.owned) : '—') + '</span>' +
                '<span class="npcw-price' + (poor ? ' bad' : '') + '">' + npcwFmt(r.price) + ' <i class="npcw-coin"></i></span>';
            el.querySelector('.npcw-nm').textContent = r.name;
            el.addEventListener('click', () => {
                if (this._shopSel !== r.id) {
                    this._shopSel = r.id;
                    this._shopQty = 1;
                    list.querySelectorAll('.npcw-row.sel').forEach((x) => x.classList.remove('sel'));
                    el.classList.add('sel');
                    this._renderShopDetail(r);
                }
            });
            el.addEventListener('dblclick', () => { this._shopQty = 1; this._shopDo(r, 1); });
            if (r.tpl) {
                el.addEventListener('mouseenter', (e) => this._showItemTooltip(r.tpl, e));
                el.addEventListener('mouseleave', () => this._hideItemTooltip());
            }
            list.appendChild(el);
        });
        list.scrollTop = sc;
        this._renderShopDetail(rows.find((r) => r.id === this._shopSel) || null);
    }

    _itemStatsLine(tpl) {
        if (!tpl) return '';
        const parts = [];
        if (tpl.attack) parts.push(this.tf('stat_patk', 'Физ. Атк') + ' ' + tpl.attack);
        if (tpl.cAtk) parts.push(this.tf('stat_catk', 'Схем. Атк') + ' ' + tpl.cAtk);
        if (tpl.defense) parts.push((tpl.slot === 'shield' || tpl.isShield ? this.tf('stat_shield', 'Защ. щита') : this.tf('stat_pdef', 'Физ. Защ')) + ' ' + tpl.defense);
        if (tpl.cDef) parts.push(this.tf('stat_cdef', 'Контур. Защ') + ' ' + tpl.cDef);
        if ((tpl.levelReq | 0) > 1) parts.push(this.tf('level_from', 'с ур.') + ' ' + tpl.levelReq);
        if (tpl.weight) parts.push(this.tf('stat_weight', 'вес') + ' ' + tpl.weight);
        return parts.join(' · ');
    }

    _renderShopDetail(r) {
        const box = this.$('shop-detail');
        box.innerHTML = '';
        if (!r) {
            box.className = 'npcw-detail empty';
            box.textContent = this._shopTab === 'buy'
                ? this.tf('shop_pick_hint', 'Выберите товар в списке.')
                : this.tf('shop_pick_sell_hint', 'Выберите предмет для продажи.');
            return;
        }
        box.className = 'npcw-detail';
        const buying = this._shopTab === 'buy';
        const cur = this._currency();
        let maxQty = r.maxQty || 1;
        if (buying && r.price > 0) maxQty = Math.min(maxQty, Math.floor(cur / r.price));
        maxQty = Math.max(0, maxQty);
        const qty = Math.max(1, Math.min(Math.max(1, maxQty), this._shopQty | 0 || 1));
        this._shopQty = qty;
        const total = qty * r.price;
        const cantAfford = buying && (maxQty < 1);
        const typeLbl = NPCW_ITEM_TYPES[String(r.type).toLowerCase()] || '';
        const stats = this._itemStatsLine(r.tpl);
        const desc = (r.tpl && r.tpl.description) ? this._clean(r.tpl.description) : '';
        const showQty = (r.maxQty || 1) > 1;

        box.innerHTML =
            '<span class="npcw-ico big">' + this._itemIconHtml(r.tpl) + '</span>' +
            '<div class="npcw-d-main">' +
                '<div class="npcw-d-name"></div>' +
                '<div class="npcw-d-meta">' + this._gradeBadge(r.grade) + npcwEsc([typeLbl, stats].filter(Boolean).join(' · ')) + '</div>' +
                (desc ? '<div class="npcw-d-desc"></div>' : '') +
            '</div>' +
            '<div class="npcw-d-act">' +
                (showQty ? '<div class="npcw-qty"><button type="button" data-q="-">−</button>' +
                    '<input type="text" inputmode="numeric" value="' + qty + '" aria-label="Количество">' +
                    '<button type="button" data-q="+">+</button>' +
                    '<button type="button" class="max" data-q="max">' + npcwEsc(this.tf('qty_max', 'Макс')) + '</button></div>' : '') +
                '<div class="npcw-total' + (cantAfford ? ' bad' : '') + '">' + npcwEsc(this.tf('total', 'Итого')) + ': <b>' + npcwFmt(total) + '</b> <i class="npcw-coin"></i></div>' +
            '</div>';
        box.querySelector('.npcw-d-name').textContent = r.name;
        const dEl = box.querySelector('.npcw-d-desc');
        if (dEl) { dEl.textContent = desc; dEl.title = desc; }

        const act = box.querySelector('.npcw-d-act');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'npcw-btn primary';
        btn.textContent = cantAfford
            ? this.tf('shop_no_money', 'Не хватает меди')
            : (buying ? this.tf('shop_buy', 'Купить') : this.tf('shop_sell', 'Продать'));
        btn.disabled = cantAfford;
        btn.addEventListener('click', () => this._shopDo(r, this._shopQty));
        act.appendChild(btn);

        if (showQty) {
            const input = box.querySelector('.npcw-qty input');
            const cap = Math.max(1, maxQty);
            const setQty = (n) => {
                this._shopQty = Math.max(1, Math.min(cap, Math.floor(+n) || 1));
                this._renderShopDetail(r);
            };
            box.querySelectorAll('[data-q]').forEach((b) => {
                b.addEventListener('click', () => {
                    const k = b.getAttribute('data-q');
                    if (k === '-') setQty(this._shopQty - 1);
                    else if (k === '+') setQty(this._shopQty + 1);
                    else setQty(cap);
                });
            });
            // Цифры в поле не должны жать скиллы на панели (обработчики висят на window).
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); setQty(input.value); this._shopDo(r, this._shopQty); }
            });
            input.addEventListener('keyup', (e) => e.stopPropagation());
            input.addEventListener('change', () => setQty(input.value));
        }
    }

    _shopDo(r, n) {
        if (!r) return;
        const count = Math.max(1, n | 0);
        if (this._shopTab === 'buy') {
            if (r.price * count > this._currency()) {
                this._chat(this.tf('shop_no_money_chat', 'Магазин: не хватает меди.'));
                return;
            }
            this.buyItem(r.id, count);
        } else {
            this.sellItem(r.id, Math.min(count, r.owned || count));
        }
        this._shopQty = 1;
    }

    /**
     * Покупка = ЗАПРОС. Цену не передаём: сервер берёт её из каталога,
     * проверяет дистанцию до NPC, валюту и место в сумке, потом присылает
     * shop_buy_ok с новым инвентарём (net-ws.js применит его через applyInv).
     */
    buyItem(itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._shopNpcId || this._npcId();
        if (!net || typeof net.intentNpcBuy !== 'function' || !npcId) {
            this._chat(this.tf('offline', 'Нет связи с сервером.'));
            return;
        }
        net.intentNpcBuy(npcId, itemId, count != null ? count : 1);
    }

    /** Продажа торговцу: запрос, авторитет цены и списания — на сервере. */
    sellItem(itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._shopNpcId || this._npcId();
        if (!net || typeof net.intentNpcSell !== 'function' || !npcId) {
            this._chat(this.tf('offline', 'Нет связи с сервером.'));
            return;
        }
        net.intentNpcSell(npcId, itemId, count != null ? count : 1);
    }

    // ------------------------------------------------------------------
    // Обучение умениям
    // ------------------------------------------------------------------
    _trainerContext() {
        const p = window.game && window.game.player;
        const tpl = this._tpl();
        const npcId = tpl.id || 'instructor_thorn';
        const NP = window.NPCS;
        const globalTpl = (NP && typeof NP.getNpc === 'function') ? NP.getNpc(npcId) : null;
        const trainerClasses = tpl.trainerClasses || (globalTpl && globalTpl.trainerClasses) || null;
        const playerClass = (p && (p.playerClass || p.classId || p.class)) || 'operator';
        const rootClass = (window.CLASS_SYSTEM && typeof window.CLASS_SYSTEM.rootClass === 'function')
            ? window.CLASS_SYSTEM.rootClass(playerClass)
            : (String(playerClass).startsWith('engineer') ? 'engineer' : 'operator');
        let canTrain = true;
        if (Array.isArray(trainerClasses)) {
            canTrain = trainerClasses.includes(playerClass) || trainerClasses.includes(rootClass);
        }
        const sp = p ? (p.levelSystem && p.levelSystem.sp != null ? p.levelSystem.sp | 0 : p.sp | 0) : 0;
        const level = (p && p.levelSystem ? p.levelSystem.level : (p && p.level ? p.level : 1)) | 0;
        return { p, npcId, playerClass, rootClass, canTrain, sp, level };
    }

    _trainerRefusal(ctx) {
        const isFighter = ctx.rootClass === 'operator' || ['operator', 'mechanic', 'destroyer', 'gunner'].includes(ctx.playerClass);
        const isCrafter = ctx.rootClass === 'craftsman';
        let raw;
        if (ctx.npcId === 'trader_vex') {
            raw = this.tf('trainer_reject_at_guild', 'Свободный Цех учит только своих — тех, кто вскрывает корпуса и собирает по чертежам. Бойцов наставляет Мастер Торн, инженеров — Магистр Баульро.');
        } else if (isCrafter) {
            raw = this.tf('trainer_reject_craftsman', 'Молот, чертежи и сумка, набитая деталями... Ты из Свободного Цеха. Мастеровых учит Оружейник Векс у кузниц — ступай к нему.');
        } else if (isFighter) {
            raw = this.tf('trainer_reject_operator_at_engineer', 'Тяжёлые латы и паровая смазка на рукавах... Ты боец с передовой. Моя кафедра наставляет лишь инженеров. Ступай на Боевой плац к Мастеру Торну.');
        } else {
            raw = this.tf('trainer_reject_engineer_at_fighter', 'В твоих руках чертежи и схемы, а в глазах искры резонатора. Я тренирую бойцов ближнего боя. Твой путь — в Машинный Зал к Магистру Баульро.');
        }
        return this._stripSpeaker(raw);
    }

    showTrainerView() {
        const ctx = this._trainerContext();
        if (!ctx.canTrain) {
            this.startSequence(this._pagesFrom([this._trainerRefusal(ctx)]), {
                doneLabel: this.tf('talk_done', 'Понятно'),
                title: this.tf('trainer_title', 'Обучение')
            });
            return;
        }
        this._trNpcId = ctx.npcId;
        this._trSel = null;
        this._setMode('trainer');
        this._setTitle(this.tf('trainer_title', 'Обучение') + ' · ' + this._npcName());
        this._footer([this._backBtn(), this._closeBtn()]);
        this._renderTrainer();
    }

    /** Совместимость с net-ws (learn_skill_ok): перерисовать открытый список умений. */
    showTrainer() {
        if (this.isOpen() && this.mode === 'trainer') this._renderTrainer();
    }

    _deviceLock(s, nextRank, p) {
        if (!s.deviceReq || !p) return null;
        const dType = s.deviceReq.type;
        const f = (name) => (typeof p[name] === 'function' ? p[name].bind(p) : null);
        if (dType === 'compressor') {
            const has = f('hasCompressorEquipped') ? f('hasCompressorEquipped')() : false;
            const have = f('getValveLevel') ? f('getValveLevel')() : (f('getCircuitLevel') ? f('getCircuitLevel')() : 0);
            const need = f('resonatorReqForSkill') ? f('resonatorReqForSkill')(s, nextRank) : 1;
            return { label: this.tf('dev_compressor', 'Нагнетатель'), ok: !!(has && have >= need), have, need, slot: this.tf('slot_neck', 'Шея') };
        }
        if (dType === 'bracers') {
            const has = f('hasOperatorBracersEquipped') ? f('hasOperatorBracersEquipped')() : false;
            const have = f('getWristLevel') ? f('getWristLevel')() : (f('getNanoLevel') ? f('getNanoLevel')() : 0);
            const need = f('nanoReqForSkill') ? f('nanoReqForSkill')(s, nextRank) : 1;
            return { label: this.tf('dev_bracers', 'Наручи'), ok: !!(has && have >= need), have, need, slot: this.tf('slot_wrist', 'Запястье') };
        }
        if (dType === 'resonator') {
            const has = f('hasCircuitResonatorEquipped') ? f('hasCircuitResonatorEquipped')() : false;
            const have = f('getCircuitLevel') ? f('getCircuitLevel')() : 0;
            const need = f('resonatorReqForSkill') ? f('resonatorReqForSkill')(s, nextRank) : 1;
            return { label: this.tf('dev_resonator', 'Резонатор'), ok: !!(has && have >= need), have, need, slot: this.tf('slot_neck', 'Шея') };
        }
        if (dType === 'bracelet') {
            const has = f('hasNanoBraceletEquipped') ? f('hasNanoBraceletEquipped')() : false;
            const have = f('getNanoLevel') ? f('getNanoLevel')() : 0;
            const need = f('nanoReqForSkill') ? f('nanoReqForSkill')(s, nextRank) : 1;
            return { label: this.tf('dev_bracelet', 'Нано-браслет'), ok: !!(has && have >= need), have, need, slot: this.tf('slot_wrist', 'Запястье') };
        }
        return null;
    }

    _trainerEntries(ctx) {
        const p = ctx.p;
        const db = (typeof SKILL_DATABASE !== 'undefined' && SKILL_DATABASE)
            ? Object.values(SKILL_DATABASE)
            : (window.SKILL_DB ? window.SKILL_DB.list() : []);
        const sm = p && p.skillManager;
        const valid = db.filter((s) => {
            if (!s || !s.id) return false;
            if (s.meme === true || s.id.startsWith('br_') || s.id.startsWith('gm_') || s.id.startsWith('test_')) return false;
            if (s.class === 'any' || s.class === '*' || s.class === 'all') return false;
            let allowed;
            if (sm && typeof sm._skillAllowedForClass === 'function') {
                allowed = sm._skillAllowedForClass(s.class);
            } else {
                allowed = (s.class === ctx.playerClass || s.class === ctx.rootClass);
                if (!allowed && window.CLASS_SYSTEM && typeof window.CLASS_SYSTEM.classLineage === 'function') {
                    allowed = window.CLASS_SYSTEM.classLineage(ctx.playerClass).includes(s.class);
                }
            }
            if (!allowed) return false;
            // Фаза 1: умения начального этапа (требование уровня ≤ 20)
            return (s.levelReq || s.level || 1) <= 20;
        });

        const entries = valid.map((s) => {
            const learned = sm && sm.learnedSkills ? sm.learnedSkills[s.id] : null;
            const curRank = learned ? (learned.level | 0) : 0;
            const maxRank = (s.ranks && s.ranks.length) ? s.ranks.length : (s.maxLevel || 1);
            const isMaxed = curRank >= maxRank;
            const nextRank = curRank + 1;
            const needLv = (typeof skillLevelReqForRank === 'function') ? skillLevelReqForRank(s, nextRank) : (s.levelReq || 1);
            const cost = isMaxed ? 0 : (
                (sm && typeof sm.getUpgradeSpCost === 'function')
                    ? sm.getUpgradeSpCost(s.id)
                    : ((typeof skillSpCost === 'function') ? skillSpCost(s, nextRank) : (s.spCost || 50))
            );
            const levelMet = ctx.level >= needLv;
            const spMet = isMaxed || ctx.sp >= cost;
            const deviceLock = isMaxed ? null : this._deviceLock(s, nextRank, p);
            // 0 — можно сейчас; 1 — уровень есть, не хватает SP/прибора; 2 — рано по уровню; 3 — изучено
            let group = 0;
            if (isMaxed) group = 3;
            else if (!levelMet) group = 2;
            else if (!spMet || (deviceLock && !deviceLock.ok)) group = 1;
            return { s, curRank, maxRank, isMaxed, nextRank, needLv, cost, levelMet, spMet, deviceLock, group };
        });
        entries.sort((a, b) => (a.group - b.group) || (a.needLv - b.needLv) || (a.cost - b.cost));
        return entries;
    }

    _skillIcon(s, size) {
        const sui = window.game && window.game.skillsUI;
        if (sui && typeof sui._skillIconHtml === 'function') return sui._skillIconHtml(s.icon, size || 34);
        if (s.icon && /\/|\.(png|webp|jpe?g)$/i.test(s.icon)) return '<img src="' + npcwEsc(s.icon) + '" alt="" draggable="false">';
        return npcwEsc(s.icon || (s.type === 'passive' ? '🛡️' : '⚔️'));
    }

    _skillTypeLabel(s) {
        if (s.type === 'passive') return this.tf('passive', 'Пассивное');
        if (s.type === 'toggle') return this.tf('toggle', 'Переключаемое');
        return this.tf('active', 'Активное');
    }

    _renderTrainer() {
        const ctx = this._trainerContext();
        const entries = this._trainerEntries(ctx);
        this.container.querySelectorAll('[data-tr-tab]').forEach((b) => {
            const tab = b.getAttribute('data-tr-tab');
            b.classList.toggle('on', tab === this._trFilter);
            b.textContent = tab === 'avail' ? this.tf('trainer_tab_avail', 'Доступные') : this.tf('trainer_tab_all', 'Все умения');
        });
        this.$('trainer-sp').innerHTML = npcwEsc(this.tf('level_short_cap', 'Ур.')) + ' <b>' + ctx.level + '</b> &nbsp;·&nbsp; SP <b>' + npcwFmt(ctx.sp) + '</b>';
        this.$('tr-col-name').textContent = this.tf('trainer_col_skill', 'Умение');
        this.$('tr-col-rank').textContent = this.tf('trainer_col_rank', 'Ранг');
        this.$('tr-col-lvl').textContent = this.tf('trainer_col_req', 'Треб. ур.');

        const list = this.$('trainer-skills');
        const sc = list.scrollTop;
        list.innerHTML = '';
        const shown = entries.filter((e) => this._trFilter === 'all' || e.group <= 1);

        // Подсказка наставника (dialogue.trainer) — одна строка внизу окна
        const hintEl = this.$('trainer-hint');
        const tl = (this._tpl().dialogue && Array.isArray(this._tpl().dialogue.trainer)) ? this._tpl().dialogue.trainer : [];
        const needSp = entries.some((e) => e.group === 1 && !e.spMet);
        const hint = tl.length ? this._clean(this.t(tl[needSp && tl[1] ? 1 : 0]) || '') : '';
        hintEl.textContent = hint;
        hintEl.title = hint;
        hintEl.classList.toggle('hidden', !hint);

        if (!shown.length) {
            const next = entries.filter((e) => e.group === 2).map((e) => e.needLv);
            const msg = entries.length
                ? (next.length
                    ? this.tf('trainer_none_now', 'Сейчас учиться нечему. Ближайшее умение откроется на {lv} уровне.').replace('{lv}', Math.min.apply(null, next))
                    : this.tf('trainer_all_done', 'Все доступные умения изучены до предела.'))
                : this.tf('no_skills', 'Нет умений для изучения.');
            list.innerHTML = '<div class="npcw-empty">' + npcwEsc(msg) + '</div>';
            this._renderTrainerDetail(null, ctx);
            return;
        }
        if (!shown.some((e) => e.s.id === this._trSel)) this._trSel = shown[0].s.id;

        shown.forEach((e) => {
            const el = document.createElement('div');
            el.className = 'npcw-row npcw-grid-tr' + (e.s.id === this._trSel ? ' sel' : '') + (e.group >= 2 ? ' dim' : '');
            const rank = e.isMaxed ? 'MAX' : (e.curRank + ' → ' + e.nextRank);
            const name = this.t(e.s.name) || e.s.name || e.s.id;
            el.innerHTML =
                '<span class="npcw-ico">' + this._skillIcon(e.s, 34) + '</span>' +
                '<span style="min-width:0"><span class="npcw-nm"></span><span class="npcw-sub">' + npcwEsc(this._skillTypeLabel(e.s)) +
                    (e.deviceLock ? ' · ' + npcwEsc(e.deviceLock.label) + (e.deviceLock.ok ? ' ✓' : ' ✗') : '') + '</span></span>' +
                '<span class="npcw-num">' + npcwEsc(rank) + '</span>' +
                '<span class="npcw-num ' + (e.isMaxed ? '' : (e.levelMet ? 'ok' : 'bad')) + '">' + (e.isMaxed ? '—' : e.needLv) + '</span>' +
                '<span class="npcw-price' + (!e.isMaxed && !e.spMet ? ' bad' : '') + '">' + (e.isMaxed ? '—' : npcwFmt(e.cost)) + '</span>';
            el.querySelector('.npcw-nm').textContent = name;
            el.addEventListener('click', () => {
                if (this._trSel === e.s.id) return;
                this._trSel = e.s.id;
                list.querySelectorAll('.npcw-row.sel').forEach((x) => x.classList.remove('sel'));
                el.classList.add('sel');
                this._renderTrainerDetail(e, ctx);
            });
            el.addEventListener('dblclick', () => { if (e.group === 0) this._learn(e, ctx); });
            list.appendChild(el);
        });
        list.scrollTop = sc;
        this._renderTrainerDetail(shown.find((e) => e.s.id === this._trSel) || null, ctx);
    }

    _renderTrainerDetail(e, ctx) {
        const box = this.$('trainer-detail');
        box.innerHTML = '';
        if (!e) {
            box.className = 'npcw-detail npcw-detail-tr empty';
            box.textContent = this.tf('trainer_pick_hint', 'Выберите умение в списке.');
            return;
        }
        box.className = 'npcw-detail npcw-detail-tr';
        const s = e.s;
        const name = this.t(s.name) || s.name || s.id;
        const desc = this._clean(this.t(s.description) || s.description || '');
        const rankTxt = e.isMaxed
            ? this.tf('trainer_maxed', 'Изучено полностью') + ' (' + e.maxRank + '/' + e.maxRank + ')'
            : this.tf('skill_rank', 'Ранг') + ' ' + e.curRank + ' → ' + e.nextRank + ' ' + this.tf('of_word', 'из') + ' ' + e.maxRank;
        let req = '';
        if (!e.isMaxed) {
            req += '<span class="' + (e.levelMet ? 'ok' : 'no') + '">' + npcwEsc(this.tf('level_short_cap', 'Ур.')) + ' ' + e.needLv + '</span>';
            req += '<span class="' + (e.spMet ? 'ok' : 'no') + '">' + npcwFmt(e.cost) + ' SP</span>';
            if (e.deviceLock) {
                req += '<span class="' + (e.deviceLock.ok ? 'ok' : 'no') + '">' + npcwEsc(e.deviceLock.label) + ' ' +
                    npcwEsc(this.tf('level_short', 'ур.')) + ' ' + e.deviceLock.have + '/' + e.deviceLock.need + '</span>';
            }
        }
        box.innerHTML =
            '<span class="npcw-ico big">' + this._skillIcon(s, 48) + '</span>' +
            '<div class="npcw-d-main">' +
                '<div class="npcw-d-name"></div>' +
                '<div class="npcw-d-meta">' + npcwEsc(this._skillTypeLabel(s) + ' · ' + rankTxt) + '</div>' +
                (desc ? '<div class="npcw-d-desc"></div>' : '') +
                (req ? '<div class="npcw-req">' + req + '</div>' : '') +
            '</div>' +
            '<div class="npcw-d-act"></div>';
        box.querySelector('.npcw-d-name').textContent = name;
        const dEl = box.querySelector('.npcw-d-desc');
        if (dEl) { dEl.textContent = desc; dEl.title = desc; }
        if (!e.isMaxed) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'npcw-btn primary';
            btn.textContent = this.tf('trainer_learn', 'Изучить');
            btn.disabled = e.group !== 0;
            btn.addEventListener('click', () => this._learn(e, ctx));
            box.querySelector('.npcw-d-act').appendChild(btn);
        }
    }

    _learn(e, ctx) {
        const p = ctx.p;
        if (!p || !p.skillManager || e.isMaxed) return;
        const name = this.t(e.s.name) || e.s.name || e.s.id;
        if (!e.levelMet) {
            this._chat('Для изучения умения «' + name + '» требуется уровень ' + e.needLv + '.');
            return;
        }
        if (e.deviceLock && !e.deviceLock.ok) {
            this._chat('Требуется экипировать ' + e.deviceLock.label + ' (' + (e.deviceLock.slot || 'слот') + '), чтобы изучить «' + name + '».');
            return;
        }
        if (!e.spMet) {
            this._chat('Недостаточно SP для «' + name + '». Требуется: ' + e.cost + ', у вас: ' + ctx.sp + '.');
            return;
        }
        // Ответ learn_skill_ok перерисует окно через showTrainer() (net-ws.js).
        p.skillManager.learnSkill(e.s.id, false, false, ctx.npcId);
    }

    // ------------------------------------------------------------------
    // Баффы / телепорт / склад (внутри окна диалога)
    // ------------------------------------------------------------------
    _showSubview(id, title, hint, wide) {
        this._seq = null;
        this._questCard = null;
        this.view = 'sub';
        this._setMode('dialog', wide);
        this._resetDialogParts();
        this._renderSpeaker();
        this._setTitle(title);
        this._say(hint);
        const el = this.$(id);
        if (el) el.classList.remove('hidden');
        this._footer([this._backBtn(), this._closeBtn()]);
    }

    showBuffsView() {
        this._showSubview('npc-buffs', this.tf('buffs_subtitle', 'Техобслуживание'),
            this.tf('buffs_hint', 'Выберите усиление механизма:'));
        this.$('heading-buffs').textContent = this.tf('buffs_list', 'Прейскурант');
        this.$('buff-currency').textContent = npcwFmt(this._currency());
        const list = this.$('buff-list');
        const npcId = this._npcId();
        if (!npcId) return;
        const net = window.game && window.game.net;
        if (net && typeof net.intentBuffList === 'function') {
            list.innerHTML = '<div class="npcw-note">' + npcwEsc(this.tf('loading', 'Загрузка…')) + '</div>';
            this._buffNpcId = npcId;
            net.intentBuffList(npcId);
        } else {
            list.innerHTML = '<div class="npcw-note bad">' + npcwEsc(this.tf('offline', 'Нет связи с сервером.')) + '</div>';
        }
    }

    /** Список баффов из пакета npc_buff_list. */
    applyBuffList(m) {
        if (!m || !this.isOpen()) return;
        const npcId = this._npcId();
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._buffNpcId = m.npcId || npcId;
        if (m.currency != null) this.$('buff-currency').textContent = npcwFmt(m.currency);
        const list = this.$('buff-list');
        if (!list) return;
        list.innerHTML = '';
        const buffs = Array.isArray(m.buffs) ? m.buffs : [];
        if (!buffs.length) {
            list.innerHTML = '<div class="npcw-note">' + npcwEsc(this.tf('shop_empty', 'Нет предложений.')) + '</div>';
            return;
        }
        buffs.forEach((buff) => {
            const it = document.createElement('button');
            it.type = 'button';
            it.className = 'npcw-srow';
            const mins = Math.round((buff.duration || 0) / 60);
            it.innerHTML = '<span class="npcw-opt-ico">✚</span><span class="tx"><span class="nm"></span><span class="ds"></span></span>' +
                '<span class="pr">' + npcwFmt(buff.cost) + ' <i class="npcw-coin"></i></span>';
            it.querySelector('.nm').textContent = this.t(buff.name) || buff.name;
            const bdesc = this.t(buff.description) || buff.description || '';
            // Длительность дописываем, только если описание её не называет («на 30 мин»).
            it.querySelector('.ds').textContent = (/мин|час|сек|min|hour/i.test(bdesc) || !mins)
                ? bdesc
                : (bdesc ? bdesc + ' · ' : '') + mins + ' ' + this.tf('min', 'мин');
            it.addEventListener('click', () => {
                const net = window.game && window.game.net;
                if (!net || typeof net.intentNpcBuff !== 'function') {
                    this._chat(this.tf('offline', 'Нет связи с сервером.'));
                    return;
                }
                net.intentNpcBuff(this._buffNpcId, buff.id);
            });
            list.appendChild(it);
        });
    }

    /** Меню телепорта. Точки и цены — серверные (teleport_list). */
    showTeleportView() {
        this._showSubview('npc-teleports', this.tf('teleport', 'Телепорт'),
            this.tf('teleport_hint', 'Куда отправляемся?'));
        this.$('heading-teleport').textContent = this.tf('teleport_points', 'Пункты назначения');
        this.$('teleport-currency').textContent = npcwFmt(this._currency());
        const list = this.$('teleport-list');
        const npcId = this._npcId();
        if (!list || !npcId) return;
        const net = window.game && window.game.net;
        if (net && typeof net.intentTeleportList === 'function') {
            list.innerHTML = '<div class="npcw-note">' + npcwEsc(this.tf('loading', 'Загрузка…')) + '</div>';
            this._tpNpcId = npcId;
            net.intentTeleportList(npcId);
        } else {
            list.innerHTML = '<div class="npcw-note bad">' + npcwEsc(this.tf('offline', 'Нет связи с сервером.')) + '</div>';
        }
    }

    /** Точки телепорта из пакета teleport_list. */
    applyTeleportList(m) {
        if (!m || !this.isOpen()) return;
        const npcId = this._npcId();
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._tpNpcId = m.npcId || npcId;
        const bal = this.$('teleport-currency');
        if (bal && m.currency != null) bal.textContent = npcwFmt(m.currency);
        const list = this.$('teleport-list');
        if (!list) return;
        list.innerHTML = '';
        const points = Array.isArray(m.points) ? m.points : [];
        if (!points.length) {
            list.innerHTML = '<div class="npcw-note">' + npcwEsc(this.tf('teleport_empty', 'Направлений нет.')) + '</div>';
            return;
        }
        const cur = m.currency != null ? m.currency : this._currency();
        points.forEach((pt) => {
            const it = document.createElement('button');
            it.type = 'button';
            it.className = 'npcw-srow';
            it.innerHTML = '<span class="npcw-opt-ico">➶︎</span><span class="tx"><span class="nm"></span></span>' +
                '<span class="pr' + ((pt.cost | 0) > cur ? ' bad' : '') + '">' + npcwFmt(pt.cost) + ' <i class="npcw-coin"></i></span>';
            it.querySelector('.nm').textContent = pt.name;
            it.addEventListener('click', () => {
                const net = window.game && window.game.net;
                if (!net || typeof net.intentTeleport !== 'function') {
                    this._chat(this.tf('offline', 'Нет связи с сервером.'));
                    return;
                }
                net.intentTeleport(this._tpNpcId, pt.index);
            });
            list.appendChild(it);
        });
    }

    // ---- Персональный склад (NPC type 'warehouse') ----
    /** Открыть склад. Содержимое, ёмкость и плату присылает сервер (wh_open / cwh_open). */
    showWarehouseView(kind) {
        this._whKind = kind === 'clan' ? 'clan' : 'personal';
        const title = this._whKind === 'clan'
            ? this.tf('clan_warehouse', 'Клан-склад')
            : this.tf('warehouse_subtitle', 'Персональный склад');
        this._showSubview('npc-warehouse', title, this.tf('warehouse_hint', 'Что сдаём на хранение?'), true);
        this.$('heading-warehouse').textContent = this.tf('wh_cells', 'Ячейки хранения');
        this.$('wh-bag-title').textContent = this.tf('wh_bag', 'Сумка');
        this.$('wh-store-title').textContent = this.tf('wh_store', 'Склад');

        const bag = this.$('wh-bag-list');
        const store = this.$('wh-store-list');
        const npcId = this._npcId();
        const net = window.game && window.game.net;
        if (!npcId || !net || (this._whKind === 'clan'
            ? typeof net.intentCwhOpen !== 'function'
            : typeof net.intentWhOpen !== 'function')) {
            if (bag) bag.innerHTML = '<div class="npcw-note bad">' + npcwEsc(this.tf('offline', 'Нет связи с сервером.')) + '</div>';
            if (store) store.innerHTML = '';
            return;
        }
        const loading = '<div class="npcw-note">' + npcwEsc(this.tf('loading', 'Загрузка…')) + '</div>';
        if (bag) bag.innerHTML = loading;
        if (store) store.innerHTML = loading;
        this._whNpcId = npcId;
        if (this._whKind === 'clan') net.intentCwhOpen(npcId);
        else net.intentWhOpen(npcId);
    }

    /** Отрисовать склад из пакета wh_open / wh_ok. Обе карты — серверные. */
    applyWarehouse(m) {
        if (!m || !this.isOpen()) return;
        const view = this.$('npc-warehouse');
        if (!view || view.classList.contains('hidden')) return;
        const npcId = this._npcId();
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._whNpcId = m.npcId || npcId;
        const NP = window.NPCS;
        const cap = m.cap != null ? m.cap : (NP ? NP.MAX_WH_SLOTS : 80);
        this._whFee = m.fee != null ? m.fee : 30;

        const cur = this.$('wh-currency');
        if (cur) cur.textContent = npcwFmt(m.currency || 0);

        const inv = m.inv || {};
        const wh = m.wh || {};
        this._whInv = inv;
        this._whMap = wh;
        this._whInvPlus = m.invPlus || {};
        this._whPlus = m.whPlus || {};
        this._whEquip = m.equip || {};
        this._renderWhColumn('wh-bag-list', inv, m.invPlus || null, 'put');
        this._renderWhColumn('wh-store-list', wh, m.whPlus || null, 'take');

        const bagSlots = this.$('wh-bag-slots');
        if (bagSlots) {
            const used = NP ? NP.invSlotsUsed(inv) : Object.keys(inv).length;
            const meCls = window.game && window.game.player && window.game.player.playerClass;
            const bagCap = (window.CLASS_SYSTEM && window.CLASS_SYSTEM.inventorySlots && meCls)
                ? window.CLASS_SYSTEM.inventorySlots(meCls)
                : (NP ? NP.MAX_INV_SLOTS : 80);
            bagSlots.textContent = used + '/' + bagCap;
        }
        const whSlots = this.$('wh-store-slots');
        if (whSlots) {
            const used = m.slots != null ? m.slots : (NP ? NP.invSlotsUsed(wh) : Object.keys(wh).length);
            whSlots.textContent = used + '/' + cap;
        }
        const note = this.$('wh-note');
        if (note) note.textContent = this.tf('wh_note', 'Клик — одна штука, Shift — весь стак. Вклад: ' + this._whFee + ' меди за стак, выдача бесплатна.', { fee: this._whFee });
    }

    /** Надетые копии templateId и их plus — третья ёмкость рядом с сумкой. */
    _whEquipStat(id) {
        const eq = this._whEquip;
        let n = 0, plus = 0;
        if (!eq) return { n: 0, plus: 0 };
        const want = String(id || '').toLowerCase();
        Object.keys(eq).forEach((s) => {
            const e = eq[s];
            const tid = e && String(e.templateId || e.id || '').toLowerCase();
            if (tid === want) { n++; plus = Math.max(plus, e.plus | 0); }
        });
        return { n, plus };
    }

    /**
     * Колонка склада: строка на предмет. Клик — одна штука, Shift — весь стак.
     * Заточенный стак уходит целиком даже без Shift: сервер иначе ответит
     * enchanted (реестр plus один на templateId).
     */
    _renderWhColumn(elId, map, plusMap, op) {
        const el = this.$(elId);
        if (!el) return;
        el.innerHTML = '';
        const NP = window.NPCS;
        const nameOf = (id) => {
            const tpl = (window.ITEM_DATABASE || {})[id];
            if (tpl && tpl.name) return tpl.name;
            const meta = (NP && NP.itemMeta) ? NP.itemMeta(id) : null;
            return (meta && meta.name) || id;
        };
        const ids = Object.keys(map).filter((id) => {
            if (!(map[id] > 0)) return false;
            // Валюту и квестовые вещи склад не принимает — не показываем их в колонке сумки.
            if (op === 'put' && NP && NP.whStorable) return NP.whStorable(id).ok;
            return true;
        });
        if (!ids.length) {
            el.innerHTML = '<div class="npcw-note">' + npcwEsc(this.tf('wh_empty', 'Пусто.')) + '</div>';
            return;
        }
        ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        ids.forEach((id) => {
            const count = map[id] | 0;
            const plus = (plusMap && plusMap[id]) ? (plusMap[id] | 0) : 0;
            const tpl = this._itemTpl(id);
            const ico = this._itemIconHtml(tpl || { icon: '📦' });
            const eq = this._whEquipStat(id);
            const toCounts = op === 'put' ? (this._whMap || {}) : (this._whInv || {});
            const toPlus = op === 'put' ? (this._whPlus || {}) : (this._whInvPlus || {});
            const opts = op === 'put'
                ? { fromLocked: eq.n, fromExtraPlus: eq.plus }
                : { toLocked: eq.n, toExtraPlus: eq.plus };
            const blocked = !!(NP && NP.plusMoveOk) &&
                !NP.plusMoveOk(map, plusMap || {}, toCounts, toPlus, id, count, opts);
            const row = document.createElement('div');
            row.className = 'l2-wh-row' + (blocked ? ' l2-wh-row-blocked' : '');
            row.innerHTML =
                '<span class="l2-wh-row-ico">' + ico + '</span>' +
                '<span class="l2-wh-row-name"></span>' +
                (plus > 0 ? '<span class="l2-wh-row-plus">+' + plus + '</span>' : '') +
                (count > 1 ? '<span class="l2-wh-row-count">×' + npcwFmt(count) + '</span>' : '');
            row.querySelector('.l2-wh-row-name').textContent = nameOf(id);
            const fee = (op === 'put' && NP && NP.whDepositFee) ? NP.whDepositFee(id, count) : 0;
            row.title = blocked
                ? this.tf('wh_enchanted', 'Заточенную вещь можно переносить только целиком и когда второй копии нет')
                : (op === 'put'
                    ? (this.tf('wh_store', 'Склад') + ' ← ' + nameOf(id) + (fee ? (' (' + fee + ' меди)') : ''))
                    : (this.tf('wh_bag', 'Сумка') + ' ← ' + nameOf(id)));
            if (tpl) {
                row.addEventListener('mouseenter', (e) => this._showItemTooltip(tpl, e));
                row.addEventListener('mouseleave', () => this._hideItemTooltip());
            }
            row.addEventListener('click', (e) => {
                if (blocked) {
                    this._chat('Склад: ' + this.tf('wh_enchanted', 'заточенную вещь можно переносить только целиком и когда второй копии нет'));
                    return;
                }
                const n = (plus > 0 || (e && e.shiftKey)) ? count : 1;
                if (op === 'put') this.whPut(id, n);
                else this.whTake(id, n);
            });
            el.appendChild(row);
        });
    }

    /** Положить на склад: перенос, плату и ёмкость считает сервер. */
    whPut(itemId, count) {
        this._whIntent('intentWhPut', itemId, count);
    }

    /** Забрать со склада (бесплатно). */
    whTake(itemId, count) {
        this._whIntent('intentWhTake', itemId, count);
    }

    _whIntent(method, itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._whNpcId || this._npcId();
        const fn = (this._whKind === 'clan')
            ? (method === 'intentWhPut' ? 'intentCwhPut' : 'intentCwhTake')
            : method;
        if (!net || !npcId || typeof net[fn] !== 'function') {
            this._chat(this.tf('offline', 'Нет связи с сервером.'));
            return;
        }
        net[fn](npcId, itemId, count != null ? count : 1);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.NPCUI = NPCUI;
window.NPC_GREETINGS = NPC_GREETINGS;
