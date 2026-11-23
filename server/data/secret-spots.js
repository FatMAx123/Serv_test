// ============================================================
//  SERVER / DATA / SECRET-SPOTS.JS — Координаты скрытых боссов (только сервер)
// ============================================================
'use strict';

/**
 * Скрытые Italian brainrot-боссы: фиксированные UV на краях/мысах.
 * Не включаются в клиентскую сборку, чтобы координаты не светились в JS.
 */
const SECRET_SPOTS = [
  // южный край Школы инженерии (тихий уступ, не центр)
  { np: [0.342, 0.808], r: 0.0075, n: 1, mob: 'tralalero_toasterino', lvl: [7, 7],
    boss: true, secret: true, zone: '※ Secret · School ledge', region: 'secret_tralalero' },
  // паро-унитаз: берег Междуречья (не на дороге)
  { np: [0.575, 0.742], r: 0.0075, n: 1, mob: 'skibidi_steamino', lvl: [9, 9],
    boss: true, secret: true, zone: '※ Secret · River bend', region: 'secret_skibidi' },
  // западный мыс Западных земель
  { np: [0.068, 0.662], r: 0.0075, n: 1, mob: 'bombardiro_blendodilo', lvl: [11, 11],
    boss: true, secret: true, zone: '※ Secret · West cape', region: 'secret_bombardiro' },
  // дальний SW угол Тихой заводи
  { np: [0.198, 0.848], r: 0.0075, n: 1, mob: 'tung_tung_vacuumer', lvl: [14, 14],
    boss: true, secret: true, zone: '※ Secret · Backwater tip', region: 'secret_tung' },
  // восток химруин у «озера» (край полигона)
  { np: [0.892, 0.490], r: 0.0075, n: 1, mob: 'ballerina_cappuccino', lvl: [17, 17],
    boss: true, secret: true, zone: '※ Secret · Chem shore', region: 'secret_ballerina' },
  // ─── пасхалки-приборы (этап 6) ───
  // пульт от телевизора: SE-край Междуречья — «всё это время лежал в диване»
  { np: [0.664, 0.744], r: 0.0075, n: 1, mob: 'tv_remote_lost', lvl: [9, 9],
    boss: true, secret: true, zone: '※ Secret · River sofa', region: 'secret_remote' },
  // банкомат «Наличных нет»: западный край Дворов Круны
  { np: [0.088, 0.490], r: 0.0075, n: 1, mob: 'atm_greedy', lvl: [13, 13],
    boss: true, secret: true, zone: '※ Secret · Cruna ATM', region: 'secret_atm' },
  // 8-битная приставка: северный край Памятника павшим
  { np: [0.440, 0.062], r: 0.0075, n: 1, mob: 'retro_console', lvl: [17, 17],
    boss: true, secret: true, zone: '※ Secret · Monument cartridge', region: 'secret_console' }
];

module.exports = { SECRET_SPOTS };

