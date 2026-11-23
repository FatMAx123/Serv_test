// ============================================================
//  SHARED / QUEST-DB.JS — квесты 1–20: данные + правила прогресса.
//  UMD: сервер = require, клиент = <script>.
//
//  ЗАЧЕМ: квесты жили ТОЛЬКО в клиенте (client/js/quest.js): прогресс в
//  localStorage, награды через локальные inventory.addItem / player.gainExp.
//  Сервер о них не знал (grep `quest` по server.js = 0), поэтому награды
//  стирались первой же синхронизацией сумки, а цели kill/collect не работали
//  вообще — хуки updateKillProgress/updateCollectProgress не вызывались ниоткуда.
//
//  ОТЛИЧИЯ ОТ КЛИЕНТСКОЙ БАЗЫ (исправленные несоответствия данным проекта):
//   · ключи в нижнем регистре = quest.id (в клиенте были UPPERCASE, из-за чего
//     QUEST_DATABASE[quest.id] всегда возвращал undefined);
//   · collect `copper_parts` → `copper_cable`: copper_parts это валюта (type
//     'adena'), она не лежит в сумке как предмет и не могла быть собрана;
//   · collect `blueprint_steel_plate` → `recipe_steel_plate`, `blueprint_piston`
//     → `recipe_piston`, `blueprint_hydraulic_armor` → `recipe_hydraulic_armor`:
//     первых трёх id нет ни в одной базе предметов;
//   · цели collect привязаны к тем мобам, которые их РЕАЛЬНО дропают
//     (проверено прогоном LR.rollMobLoot);
//   · награды main_04 переведены с C-грейда на D: кап фазы 1 — Top D @20
//     (CONTENT_SCOPE_1_20.md);
//   · levelReq у side_audio_log_01 поднят с 8 до 12 — аудио-лог падает только с
//     repair_drone (12–18 ур.).
// ============================================================
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var api = factory(
    isNode ? function () { return require('./loot-rules.js'); } : function () { return root.LOOT_RULES; },
    isNode ? function () { return require('./item-db.js'); } : function () { return root.ITEM_DB; },
    isNode ? function () { return require('./mob-db.js'); } : function () { return root.MOB_DB; }
  );
  if (isNode) module.exports = api;
  else { root.QUEST_DB = api; }
})(typeof window !== 'undefined' ? window : globalThis, function (getLR, getITEMS, getMOB) {
  'use strict';

  var TYPES = {
    MAIN: 'main', SIDE: 'side', DAILY: 'daily',
    REPEATABLE: 'repeatable', EVENT: 'event', HIDDEN: 'hidden'
  };
  var STATES = {
    NOT_STARTED: 'not_started',
    IN_PROGRESS: 'in_progress',
    COMPLETABLE: 'completable',
    COMPLETED: 'completed'
  };

  /** Максимум активных квестов одновременно (25). */
  var MAX_ACTIVE = 25;

  // ============================================================
  //  ДАННЫЕ. Ключ = id.
  //  objectives: { type: kill|collect|talk, target, count, description }
  //    kill    — target = mobId (mob-db)
  //    collect — target = itemId; проверяется по серверному инвентарю и
  //              СПИСЫВАЕТСЯ при сдаче квеста (quest items уходят NPC)
  //    talk    — target = npcId (world-metrics)
  //  rewards: { exp, sp?, currency, items:[{id,count}], buff?, classChange? }
  // ============================================================
  var QUESTS = {
    // ---- Главная линия: сертификация оператора ----
    main_01_welcome: {
      id: 'main_01_welcome',
      name: 'Добро пожаловать на Остров Стали',
      type: TYPES.MAIN,
      levelReq: 1,
      npc: 'bot_01',
      description: 'Бот-01 провёл первичную диагностику. Нужно доказать, что вы не «биологический мусор».',
      objectives: [
        { type: 'talk', target: 'gilbert', count: 1, description: 'Поговорите с Инспектором Гилбертом' }
      ],
      rewards: {
        exp: 50, currency: 200,
        items: [
          { id: 'synthetic_oil', count: 8 } // MP-банки выведены из экономики — заменены HP-банками
        ]
      },
      nextQuest: 'main_02_perimeter'
    },

    main_02_perimeter: {
      id: 'main_02_perimeter',
      name: 'Зачистка периметра',
      type: TYPES.MAIN,
      levelReq: 1,
      npc: 'gilbert',
      description: 'Гилберт требует доказать, что вы умеете держать ключ не только для вида.',
      objectives: [
        { type: 'kill', target: 'scrapper', count: 10, description: 'Уничтожьте Скрапперов' },
        // quest_perimeter_coal — квестовый дроп Скрапперов (50%, только с активным квестом) —
        // цель выполняется тем же гриндом, а не покупкой у Милли
        { type: 'collect', target: 'quest_perimeter_coal', count: 5, description: 'Добудьте тлеющие брикеты из топок Скрапперов' }
      ],
      rewards: {
        exp: 150, currency: 500,
        items: [
          { id: 'operator_hammer_low', count: 1 },
          { id: 'worker_overalls', count: 1 }
        ]
      },
      nextQuest: 'main_03_machines'
    },

    main_03_machines: {
      id: 'main_03_machines',
      name: 'Язык машин',
      type: TYPES.MAIN,
      levelReq: 5,
      npc: 'biotin',
      description: 'Биотин верит, что в машинах есть «Искра». Нужно собрать данные с поверженных механизмов.',
      objectives: [
        { type: 'kill', target: 'steam_hound', count: 8, description: 'Уничтожьте Паровых Гончих' },
        // rubber_skin и gasket_suede — дроп steam_hound; в магазинах их нет
        { type: 'collect', target: 'quest_hound_reel', count: 8, description: 'Снимите катушки памяти с паровых гончих' }
      ],
      rewards: {
        exp: 400, currency: 1200,
        items: [
          { id: 'pressure_amplifier', count: 3 }, { id: 'armor_pressure_amplifier', count: 3 },
          { id: 'recipe_piston', count: 1 }
        ],
        // Оружие следующего тира (L2: оружие новичка от квеста) — Iron Hammer 32k на 5-м не по карману
        byClass: {
          operator: [{ id: 'iron_hammer', count: 1 }],
          craftsman: [{ id: 'iron_hammer', count: 1 }],
          engineer: [{ id: 'willow_coil', count: 1 }]
        },
        buff: { id: 'spark_blessing', duration: 3600 }
      },
      nextQuest: 'main_05_whisper'
    },

    // ---- Главная линия «Искра» 8–18: сюжет между первыми машинами и сертификацией ----
    // talk-цель каждой главы ведёт к NPC следующей главы.
    main_05_whisper: {
      id: 'main_05_whisper',
      name: 'Шёпот в проводах',
      type: TYPES.MAIN,
      levelReq: 8,
      npc: 'biotin',
      description: 'Биотин расшифровал данные гончих: одичавшие машины слышат один и тот же импульс — ровный, как сердцебиение. Он уверен, что это и есть «Искра». Маяки Холмов Астарда и насосы Междуречья передают сигнал дальше. Заглушите их и расскажите обо всём Инженеру Элиасу — он один помнит, откуда этот ритм.',
      objectives: [
        { type: 'kill', target: 'survey_beacon', count: 12, description: 'Заглушите Маяки-Разведчики' },
        { type: 'kill', target: 'rivulet_pump', count: 10, description: 'Остановите насосы Междуречья' },
        { type: 'talk', target: 'elias', count: 1, description: 'Расскажите об импульсе Инженеру Элиасу' }
      ],
      rewards: {
        exp: 3500, sp: 900, currency: 6000,
        items: [{ id: 'emergency_repair_kit', count: 5 }],
        byClass: {
          operator: [{ id: 'soulshot_no_grade', count: 300 }],
          craftsman: [{ id: 'soulshot_no_grade', count: 300 }],
          engineer: [{ id: 'spiritshot_no_grade', count: 150 }]
        }
      },
      nextQuest: 'main_06_zero_cycle'
    },

    main_06_zero_cycle: {
      id: 'main_06_zero_cycle',
      name: 'Сбой Нулевого Цикла',
      type: TYPES.MAIN,
      levelReq: 12,
      npc: 'elias',
      description: 'Элиас узнал этот ритм: так стучал главный контур в день Сбоя Нулевого Цикла, когда машины острова перестали слушаться людей. Импульс уходит на запад, к Дворам Круны, где Создатели запускали первые станки. Пробейтесь через ржавых часовых Западных земель и краны-малыши Круны и отнесите Архивариусу Скрипу всё, что удастся считать с их блоков памяти.',
      objectives: [
        { type: 'kill', target: 'rust_sentry', count: 12, description: 'Отключите Ржавых Часовых' },
        { type: 'kill', target: 'yard_cranelet', count: 10, description: 'Разберите Кранов-Малышей Круны' },
        { type: 'talk', target: 'archivist_skrip', count: 1, description: 'Передайте блоки памяти Архивариусу Скрипу' }
      ],
      rewards: {
        exp: 12000, sp: 3000, currency: 12000,
        items: [{ id: 'pressure_amplifier', count: 2 }, { id: 'armor_pressure_amplifier', count: 2 }],
        byClass: {
          operator: [{ id: 'soulshot_no_grade', count: 500 }],
          craftsman: [{ id: 'soulshot_no_grade', count: 500 }],
          engineer: [{ id: 'spiritshot_no_grade', count: 250 }]
        }
      },
      nextQuest: 'main_07_field_memory'
    },

    main_07_field_memory: {
      id: 'main_07_field_memory',
      name: 'Память поля',
      type: TYPES.MAIN,
      levelReq: 15,
      npc: 'archivist_skrip',
      description: 'В блоках памяти Скрип нашёл схему: Поле забвения было литейной памяти Создателей — там с людей снимали навыки и заливали их в станки. Выходит, «Искра» — не душа машин, а украденная у людей память. Скрабберы до сих пор стирают её следы на поле, а споттеры полигона передают обрывки дальше. Остановите их и доложите Биотину.',
      objectives: [
        { type: 'kill', target: 'memory_scrubber', count: 12, description: 'Уничтожьте Скрабберов Памяти' },
        { type: 'kill', target: 'range_spotter', count: 12, description: 'Собьите Споттеров полигона' },
        { type: 'talk', target: 'biotin', count: 1, description: 'Доложите Биотину о литейной памяти' }
      ],
      rewards: {
        exp: 23000, sp: 6000, currency: 20000,
        items: [
          { id: 'pressure_amplifier_d', count: 1 }, { id: 'armor_pressure_amplifier_d', count: 1 },
          { id: 'synthetic_oil', count: 20 }
        ],
        byClass: {
          operator: [{ id: 'soulshot_no_grade', count: 700 }],
          craftsman: [{ id: 'soulshot_no_grade', count: 700 }],
          engineer: [{ id: 'spiritshot_no_grade', count: 350 }]
        }
      },
      nextQuest: 'main_08_boiler_voice'
    },

    main_08_boiler_voice: {
      id: 'main_08_boiler_voice',
      name: 'Голос Котла',
      type: TYPES.MAIN,
      levelReq: 18,
      npc: 'biotin',
      description: 'Биотин сопоставил записи: импульс «Искры» идёт из-под Котловых земель, где давление в магистралях растёт с каждым днём. Что-то внизу собирает украденную память воедино — и учится говорить. Расчистите подступы от Чайников-Свистунов и Манометров-Часовых и передайте Инспектору Гилберту: острову пора готовиться.',
      objectives: [
        { type: 'kill', target: 'kettle_stalker', count: 12, description: 'Уничтожьте Чайников-Свистунов' },
        { type: 'kill', target: 'gauge_warden', count: 10, description: 'Сбейте Манометров-Часовых' },
        { type: 'talk', target: 'gilbert', count: 1, description: 'Предупредите Инспектора Гилберта' }
      ],
      rewards: {
        exp: 40000, sp: 10000, currency: 35000,
        items: [
          { id: 'pressure_amplifier_d', count: 2 }, { id: 'armor_pressure_amplifier_d', count: 2 },
          { id: 'crystal_d', count: 5 }
        ],
        byClass: {
          operator: [{ id: 'soulshot_no_grade', count: 1000 }],
          craftsman: [{ id: 'soulshot_no_grade', count: 1000 }],
          engineer: [{ id: 'spiritshot_no_grade', count: 500 }]
        }
      },
      nextQuest: null
    },

    main_04_certification: {
      id: 'main_04_certification',
      name: 'Сертификация',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'gilbert',
      classReq: 'operator',
      // Смена профессии не ждёт сюжет «Искры» (L2: квест профессии отдельно от сюжета)
      requires: 'main_03_machines',
      description: 'Первая смена профессии. Выбор пути: Механик, Разрушитель или Стрелок.',
      objectives: [
        { type: 'kill', target: 'welding_automaton', count: 15, description: 'Уничтожьте Сварочных Автоматов' },
        // quest_certification_seal — квестовый дроп сварочных автоматов (50%)
        { type: 'collect', target: 'quest_certification_seal', count: 10, description: 'Снимите пломбы аттестации со сварочных автоматов' },
        { type: 'talk', target: 'milly', count: 1, description: 'Получите рекомендацию Милли' }
      ],
      rewards: {
        // Кап фазы 1 — D-грейд; сбалансированная награда 1-й профессии по канону L2 C1
        exp: 45000,
        sp: 15000,
        currency: 35000,
        items: [
          { id: 'steam_hammer', count: 1 },
          { id: 'spring_bow', count: 1 },
          { id: 'copper_plate', count: 1 }
        ],
        classChange: true
      },
      nextQuest: null
    },

    main_04_certification_tech: {
      id: 'main_04_certification_tech',
      name: 'Сертификация контура',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'biotin',
      classReq: 'engineer',
      requires: 'main_03_machines',
      description: 'Биотин не отпустит в Конструкторы и Наладчики без полевого отчёта: краны-пауки Тихой заводи «дышат» тем же ритмом, что и Искра, и фильтры их контуров это помнят.',
      objectives: [
        // Соло-цель вместо элитного Дрона-Ремонтника: краны-пауки Тихой заводи
        { type: 'kill', target: 'steam_crane_spider', count: 10, description: 'Остановите кранов-пауков Тихой заводи' },
        { type: 'collect', target: 'quest_contour_filter', count: 8, description: 'Снимите фильтры контура с кранов-пауков' },
        { type: 'talk', target: 'instructor_thorn', count: 1, description: 'Получите допуск у Мастера Торна' }
      ],
      rewards: {
        exp: 45000,
        sp: 15000,
        currency: 35000,
        items: [
          { id: 'mage_staff', count: 1 },
          { id: 'recipe_piston', count: 1 }
        ],
        classChange: true
      },
      nextQuest: null
    },

    // ---- Сюжет «Песнь и порча» (соло, побочная цепочка 3/10/13/16/19) и групповые квесты 12/15/18/20 ----
    story_01_false_note: {
      id: 'story_01_false_note',
      name: 'Фальшивая нота',
      type: 'side',
      levelReq: 3,
      npc: 'bot_01',
      description: 'Бот-01 записал фон Территории: Песнь Стали звучит ровно, но болты и клещи гудят на полтона ниже. У стали появился второй голос. Соберите дребезжащие болты и отнесите их Биотину — он слышит машины лучше всех.',
      objectives: [
        {
          type: 'kill',
          target: 'loose_bolt',
          count: 8,
          description: 'Утихомирьте Сбежавшие Болты'
        },
        {
          type: 'collect',
          target: 'quest_rattling_bolt',
          count: 6,
          description: 'Соберите дребезжащие болты'
        },
        {
          type: 'talk',
          target: 'biotin',
          count: 1,
          description: 'Покажите болты Старшему Технику Биотину'
        }
      ],
      rewards: {
        exp: 800,
        sp: 120,
        currency: 1200
      },
      nextQuest: null
    },
    story_02_scrap_rhythm: {
      id: 'story_02_scrap_rhythm',
      name: 'Чужой ритм в ломе',
      type: 'side',
      levelReq: 10,
      npc: 'trader_vex',
      requires: 'story_01_false_note',
      description: 'Векс давно не был на Свалке, но узнал ритм с первого удара: так стучали станки Создателей в день, когда он ушёл из цеха и основал свой — Свободный. «Машины не сходят с ума, — говорит он. — Они кого-то повторяют». Принесите поющие шестерни и расскажите Элиасу, что ритм дошёл до Свалки.',
      objectives: [
        {
          type: 'kill',
          target: 'junk_magpie',
          count: 10,
          description: 'Разберите Фенов-Испепелителей Свалки'
        },
        {
          type: 'collect',
          target: 'quest_singing_gear',
          count: 6,
          description: 'Соберите поющие шестерни'
        },
        {
          type: 'talk',
          target: 'elias',
          count: 1,
          description: 'Расскажите о ритме Инженеру Элиасу'
        }
      ],
      rewards: {
        exp: 7000,
        sp: 1500,
        currency: 7000
      },
      nextQuest: null
    },
    story_03_monument_list: {
      id: 'story_03_monument_list',
      name: 'Список на Памятнике',
      type: 'side',
      levelReq: 13,
      npc: 'intendant_rid',
      requires: 'story_02_scrap_rhythm',
      description: 'Интендант Рид отправлял на Поле забвения новобранцев и помнит каждого. С Памятника павшим пропадают имена — не сбитые, а стёртые, ровно и аккуратно. Скрабберы памяти стирают не только следы на поле. Верните таблички и доложите Гилберту: у павших Рездика тоже забрали память.',
      objectives: [
        {
          type: 'kill',
          target: 'memory_scrubber',
          count: 12,
          description: 'Остановите Скрабберов Памяти'
        },
        {
          type: 'collect',
          target: 'quest_erased_plate',
          count: 6,
          description: 'Верните стёртые таблички с Памятника'
        },
        {
          type: 'talk',
          target: 'gilbert',
          count: 1,
          description: 'Доложите Инспектору Гилберту'
        }
      ],
      rewards: {
        exp: 15000,
        sp: 3500,
        currency: 12000
      },
      nextQuest: null
    },
    story_04_guard_protocol: {
      id: 'story_04_guard_protocol',
      name: 'Протокол защиты',
      type: 'side',
      levelReq: 16,
      npc: 'biotin',
      requires: 'story_03_monument_list',
      description: 'Биотин боится собственной догадки. В Руинах химзавода контуры повторяют одну команду. Добудьте фрагменты протокола с Выжигателей и отнесите Архивариусу Скрипу: если он прочтёт ленту, станет ясно, что такое Зелёный сбой на самом деле.',
      objectives: [
        {
          type: 'kill',
          target: 'acid_sprayer',
          count: 12,
          description: 'Обезвредьте Выжигателей-Жгучек в Руинах'
        },
        {
          type: 'collect',
          target: 'quest_protocol_fragment',
          count: 6,
          description: 'Добудьте фрагменты протокола'
        },
        {
          type: 'talk',
          target: 'archivist_skrip',
          count: 1,
          description: 'Отдайте ленты Архивариусу Скрипу'
        }
      ],
      rewards: {
        exp: 26000,
        sp: 6500,
        currency: 20000
      },
      nextQuest: null
    },
    story_05_boiler_silence: {
      id: 'story_05_boiler_silence',
      name: 'Тишина перед Котлом',
      type: 'side',
      levelReq: 19,
      npc: 'trader_dora',
      requires: 'story_04_guard_protocol',
      description: 'Скрип прочёл ленты: Зелёный сбой — протокол «сохранить память острова», запущенный Создателями перед уходом. Он не ломает машины — он собирает в них всё, что помнит остров. Дора и Круна готовят Цех к худшему, а клапаны в Котловых землях остывают посреди кипящего пара. Принесите их Капитану Морского Дозора: Котёл начал называть одно имя, и капитан его знает.',
      objectives: [
        {
          type: 'kill',
          target: 'dryer_hound',
          count: 12,
          description: 'Разгоните стаи Сушильных Гончих'
        },
        {
          type: 'collect',
          target: 'quest_cold_boiler_valve',
          count: 6,
          description: 'Снимите остывшие клапаны Котла'
        },
        {
          type: 'talk',
          target: 'captain_sea_watch',
          count: 1,
          description: 'Передайте клапаны Капитану Морского Дозора'
        }
      ],
      rewards: {
        exp: 42000,
        sp: 10000,
        currency: 35000,
        items: [
          {
            id: 'crystal_d',
            count: 5
          }
        ]
      },
      nextQuest: null
    },
    party_01_friendly_fire: {
      id: 'party_01_friendly_fire',
      name: 'Залп по своим',
      type: 'side',
      levelReq: 12,
      npc: 'gilbert',
      party: true,
      description: 'Групповое задание. Гаубицы Восточного полигона кто-то развернул: ночью снаряд лёг у стены Деревни. Расчётов при них нет — стреляют сами. Соберите отряд, заглушите орудия и добудьте прицельные карты: Гилберт хочет знать, кто выбрал цель.',
      objectives: [
        {
          type: 'kill',
          target: 'field_howitzer',
          count: 6,
          description: 'Заглушите полевые гаубицы (группой)'
        },
        {
          type: 'collect',
          target: 'quest_targeting_map',
          count: 3,
          description: 'Добудьте прицельные карты'
        }
      ],
      rewards: {
        exp: 16000,
        sp: 4000,
        currency: 15000,
        items: [
          {
            id: 'pressure_amplifier',
            count: 1
          },
          {
            id: 'armor_pressure_amplifier',
            count: 1
          }
        ]
      },
      nextQuest: null
    },
    party_02_green_fog: {
      id: 'party_02_green_fog',
      name: 'Зелёный туман Руин',
      type: 'side',
      levelReq: 15,
      npc: 'grocer_spark',
      party: true,
      description: 'Групповое задание. Искра видела, как дроны Зелёного сбоя уносят запаянные канистры к Входу в бункер. Внутри — не яд, а голоса. Пробейтесь отрядом через туман, сбейте дронов и сдерживатели и принесите канистры, пока бункер их не принял.',
      objectives: [
        {
          type: 'kill',
          target: 'green_fault_drone',
          count: 10,
          description: 'Сбейте дронов Зелёного сбоя (группой)'
        },
        {
          type: 'kill',
          target: 'spill_containment',
          count: 3,
          description: 'Разрушьте сдерживатели разлива (группой)'
        },
        {
          type: 'collect',
          target: 'quest_memory_canister',
          count: 4,
          description: 'Перехватите канистры памяти'
        }
      ],
      rewards: {
        exp: 30000,
        sp: 7000,
        currency: 25000,
        items: [
          {
            id: 'crystal_d',
            count: 3
          }
        ]
      },
      nextQuest: null
    },
    party_03_boiler_voices: {
      id: 'party_03_boiler_voices',
      name: 'Голоса бойлерной',
      type: 'side',
      levelReq: 18,
      npc: 'biotin',
      party: true,
      requires: 'main_08_boiler_voice',
      description: 'Групповое задание. После разведки Котловых земель Биотин не спит: из бойлерной слышны голоса — дозорных Рездика, что не вернулись с Поля забвения. Элементали и демоны давления держат подступы. Пробейтесь отрядом и добудьте сгустки голоса — Биотин попробует понять, кому они принадлежат.',
      objectives: [
        {
          type: 'kill',
          target: 'boiler_elemental',
          count: 8,
          description: 'Погасите котловых элементалей (группой)'
        },
        {
          type: 'kill',
          target: 'pressure_fiend',
          count: 6,
          description: 'Сбросьте демонов давления (группой)'
        },
        {
          type: 'collect',
          target: 'quest_voice_clot',
          count: 4,
          description: 'Добудьте сгустки голоса'
        }
      ],
      rewards: {
        exp: 50000,
        sp: 12000,
        currency: 40000,
        items: [
          {
            id: 'crystal_d',
            count: 6
          }
        ]
      },
      nextQuest: null
    },
    party_04_fog_beyond: {
      id: 'party_04_fog_beyond',
      name: 'Туман за Пределом',
      type: 'side',
      levelReq: 20,
      npc: 'guard_n',
      party: true,
      requires: 'side_steel_limit',
      description: 'Групповое задание. С крепостных стен Стражи Предела видят огни в тумане — там, где на картах нет ни дорог, ни берега. Тяжёлые заслонщики и котлы-перегрузчики не подпускают дозор к краю. Прорвитесь отрядом к последней башне и передайте Капитану Морского Дозора, что огни движутся.',
      objectives: [
        {
          type: 'kill',
          target: 'fort_enforcer',
          count: 6,
          description: 'Сломите тяжёлых заслонщиков Крепости (группой)'
        },
        {
          type: 'kill',
          target: 'boiler_overpress',
          count: 3,
          description: 'Сбросьте котлы-перегрузчики (группой)'
        },
        {
          type: 'talk',
          target: 'captain_sea_watch',
          count: 1,
          description: 'Доложите Капитану Морского Дозора об огнях'
        }
      ],
      rewards: {
        exp: 60000,
        sp: 20000,
        currency: 60000,
        items: [
          {
            id: 'crystal_d',
            count: 10
          }
        ]
      },
      nextQuest: null
    },

    // ---- Профессии Мастерового (1st @20): Утилизатор / Котловой Кузнец ----
    main_04_certification_craft: {
      id: 'main_04_certification_craft',
      name: 'Аттестация Свободного Цеха',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'trader_dora',
      classReq: 'craftsman',
      requires: 'main_03_machines',
      description: 'Бронник Дора откроет путь в Утилизаторы или Котловые Кузнецы только тому, кто разберёт машину до кости и получит клеймо Крана у горна.',
      objectives: [
        { type: 'kill', target: 'iron_crawler', count: 12, description: 'Разберите Утюгов-Отпаривателей' },
        // quest_branded_drive_bone — квестовый дроп Утюгов-Отпаривателей (60%)
        { type: 'collect', target: 'quest_branded_drive_bone', count: 10, description: 'Соберите клеймёные кости привода' },
        { type: 'talk', target: 'smith_kran', count: 1, description: 'Получите клеймо Кузнеца-Сборщика Крана' }
      ],
      rewards: {
        exp: 45000,
        sp: 15000,
        currency: 35000,
        items: [
          { id: 'steam_hammer', count: 1 },
          { id: 'recipe_steel_plate', count: 1 }
        ],
        classChange: true
      },
      nextQuest: null
    },

    // ---- Профессии Инженера (1st @20 ур, канон L2 C1) ----
    path_to_constructor: {
      id: 'path_to_constructor',
      name: 'Путь Конструктора',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'archivist_skrip',
      classReq: 'engineer',
      requires: 'main_03_machines',
      description: 'Смена профессии: Конструктор (L2 C1 Wizard). Соберите четыре резонансных контура пара и электричества, откалибруйте их у Торна и зарегистрируйте патент.',
      objectives: [
        { type: 'kill', target: 'forge_apprentice', count: 10, description: 'Уничтожьте Электроплит-Шкварок' },
        { type: 'collect', target: 'superheated_core', count: 5, description: 'Добудьте раскаленные ТЭНы (Электроплиты)' },
        { type: 'collect', target: 'pure_condensate', count: 5, description: 'Соберите чистый конденсат (Поливные турели)' },
        { type: 'collect', target: 'kinetic_valve', count: 5, description: 'Добудьте клапаны сверхдавления (Сабвуферы)' },
        { type: 'collect', target: 'spark_resonator', count: 3, description: 'Добудьте искровые резонаторы (краны-пауки Тихой заводи)' },
        { type: 'talk', target: 'instructor_thorn', count: 1, description: 'Откалибруйте контуры в тигле Мастера Торна' }
      ],
      rewards: {
        exp: 45000,
        sp: 15000,
        currency: 35000,
        items: [
          { id: 'mark_of_constructor', count: 1 },
          { id: 'mage_staff', count: 1 }
        ],
        classChange: true
      },
      nextQuest: null
    },

    path_to_technomancer: {
      id: 'path_to_technomancer',
      name: 'Путь Наладчика',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'biotin',
      classReq: 'engineer',
      requires: 'main_03_machines',
      description: 'Смена профессии: Наладчик (L2 C1 Cleric). Восстановите утерянный Протокол Искры, спасите заклинивший компрессор Бонны и примите благословение Машинного Зала.',
      objectives: [
        { type: 'talk', target: 'elias', count: 1, description: 'Расшифруйте сигналы у Инженера Элиаса' },
        { type: 'kill', target: 'steam_crane_spider', count: 8, description: 'Отключите сбоящих кранов-пауков Тихой заводи' },
        { type: 'collect', target: 'protocol_punchcards', count: 6, description: 'Соберите перфокарты Искры (скрапперы и дроны)' },
        { type: 'collect', target: 'quest_adjuster_filter', count: 4, description: 'Снимите фильтры наладчика с кранов-пауков' },
        { type: 'collect', target: 'oil_crystal', count: 1, description: 'Добудьте калибровочный кристалл (дроны)' },
        { type: 'talk', target: 'bonna', count: 1, description: 'Окажите техническую помощь Механику Бонне' }
      ],
      rewards: {
        exp: 45000,
        sp: 15000,
        currency: 35000,
        items: [
          { id: 'mark_of_technomancer', count: 1 },
          { id: 'emergency_repair_kit', count: 10 },
          { id: 'synthetic_oil', count: 15 }
        ],
        buff: { id: 'spark_blessing', duration: 3600 },
        classChange: true
      },
      nextQuest: null
    },

    // ---- Побочные ----
    side_milly_parts: {
      id: 'side_milly_parts',
      name: 'Запчасти для Милли',
      type: TYPES.SIDE,
      levelReq: 3,
      npc: 'milly',
      description: 'Милли нужны детали для починки главного реактора острова.',
      objectives: [
        { type: 'collect', target: 'gear_fragment', count: 20, description: 'Соберите обломки шестерён' },
        // gasket_suede падает с тех же мобов и НЕ продаётся в магазинах:
        // иначе квест закрывался бы покупкой материалов у Милли
        { type: 'collect', target: 'gasket_suede', count: 15, description: 'Принесите прокладки' }
      ],
      rewards: {
        exp: 300, currency: 800,
        items: [
          { id: 'synthetic_oil', count: 30 } // MP-банки выведены из экономики — заменены HP-банками
        ]
      },
      repeatable: true
    },

    side_audio_log_01: {
      id: 'side_audio_log_01',
      name: 'Голос из прошлого',
      type: TYPES.HIDDEN,
      // Аудио-лог падает только с repair_drone (12–18 ур.) — раньше стояло 8
      levelReq: 12,
      npc: 'biotin',
      description: 'Аудио-лог инженера хранит запись о Сбое Нулевого Цикла. Биотин должен это услышать.',
      objectives: [
        { type: 'collect', target: 'audio_log_01', count: 1, description: 'Найдите аудио-лог (ремонтные дроны)' }
      ],
      rewards: {
        // Медная серьга: колец в игре нет (слот занят браслетом-прибором), серьги — пара.
        // Раньше стояли кольцо давления, а до него engine_necklace (C, контент 40+).
        exp: 500, currency: 1500,
        items: [{ id: 'copper_earring', count: 1 }]
      }
    },

    // ---- Сюжетные побочные квесты (Нарративный мост 6–19 ур.) ----
    side_roxy_echo: {
      id: 'side_roxy_echo',
      name: 'Эхо Междуречья',
      type: TYPES.SIDE,
      levelReq: 7,
      npc: 'dispatcher_roxy',
      description: 'Южные маяки телепортации сбоят из-за гидроударов насосов на отмелях Междуречья. Диспетчер Рокси просит заглушить агрегаты и собрать регулировочные паровые клапаны и фильтры для починки передатчика.',
      objectives: [
        { type: 'kill', target: 'rivulet_pump', count: 8, description: 'Заглушите буйные насосы на отмелях' },
        { type: 'collect', target: 'quest_pump_echo_valve', count: 6, description: 'Снимите поющие эхо-клапаны с насосов' }
      ],
      rewards: {
        exp: 650, sp: 200, currency: 1800,
        items: [
          { id: 'emergency_repair_kit', count: 5 },
          { id: 'copper_earring', count: 1 }
        ]
      }
    },

    side_vex_scrap: {
      id: 'side_vex_scrap',
      name: 'Тайны Металлолома',
      type: TYPES.SIDE,
      levelReq: 9,
      npc: 'trader_vex',
      description: 'Оружейник Векс бракует рыхлую руду: для закалки лезвий нужна легированная сталь Создателей. Он отправляет бойца на опасную Свалку за нетронутыми поршневыми кольцами и очищенным ломом.',
      objectives: [
        { type: 'kill', target: 'scrap_picker', count: 10, description: 'Уничтожьте дробильщиков лома' },
        { type: 'collect', target: 'quest_vex_scrap_sample', count: 10, description: 'Соберите образцы лома с клеймом Создателей' }
      ],
      rewards: {
        exp: 1100, sp: 380, currency: 3200,
        items: [
          { id: 'pressure_amplifier', count: 1 }, { id: 'armor_pressure_amplifier', count: 1 },
          { id: 'copper_pipe', count: 1 }
        ]
      }
    },

    side_spark_gardens: {
      id: 'side_spark_gardens',
      name: 'Цветы среди Шестерен',
      type: TYPES.SIDE,
      levelReq: 11,
      npc: 'grocer_spark',
      description: 'Искра очарована природной аномалией: посреди кипящего пара цветут Затерянные Сады и гудит Пасека. Ей нужны образцы поливной эссенции турелей и восковые пломбы ульев для синтеза незамерзающей смазки.',
      objectives: [
        { type: 'kill', target: 'garden_sprinkler', count: 8, description: 'Обезвредьте поливные турели Садов' },
        { type: 'collect', target: 'pure_condensate', count: 5, description: 'Соберите чистый конденсат турелей' },
        { type: 'kill', target: 'apiary_drone_bee', count: 12, description: 'Уничтожьте охранных мех-пчел Пасеки' },
        { type: 'collect', target: 'quest_bee_wax_seal', count: 6, description: 'Добудьте восковые пломбы с пасечных дронов' }
      ],
      rewards: {
        exp: 1800, sp: 650, currency: 5000,
        items: [
          { id: 'recipe_synthetic_oil', count: 1 },
          { id: 'synthetic_oil', count: 15 } // MP-банки выведены из экономики — заменены HP-банками
        ]
      }
    },

    side_gilbert_watch: {
      id: 'side_gilbert_watch',
      name: 'Дозор Рездика',
      type: TYPES.SIDE,
      levelReq: 15,
      npc: 'gilbert',
      description: 'Разведотряд гарнизона сгинул на Поле забвения по пути к Баракам Рездика. Инспектор Гилберт поручает найти обломки бронеплит дозора, покарать тяжелые шагоходы и доставить имена павших в ратушу.',
      objectives: [
        { type: 'kill', target: 'oblivion_walker', count: 10, description: 'Уничтожьте шагоходы-экстракторы' },
        { type: 'collect', target: 'quest_rezdiq_patrol_log', count: 8, description: 'Соберите обрывки журнала дозора Рездика' }
      ],
      rewards: {
        exp: 3800, sp: 1400, currency: 9000,
        items: [
          { id: 'boiler_shield', count: 1 },
          { id: 'pressure_amplifier', count: 2 }, { id: 'armor_pressure_amplifier', count: 2 }
        ]
      }
    },

    // ---- Контракты на устранение рейд-боссов Фазы 1 (Gilbert) ----
    bounty_scrap_tyrant: {
      id: 'bounty_scrap_tyrant',
      name: 'Контракт: Тиран Свалки',
      type: TYPES.SIDE,
      levelReq: 15,
      npc: 'gilbert',
      description: 'В глубинах Свалки пробудился самосборный колосс — Тиран Свалки, погребший под тоннами прессованного чугуна три разведотряда Регуляторов. Инспектор Гилберт объявляет официальный контракт на ликвидацию исполина и извлечение его пульсирующего командного узла.',
      objectives: [
        { type: 'kill', target: 'scrap_tyrant', count: 1, description: 'Уничтожьте Тирана Свалки' },
        { type: 'collect', target: 'scrap_tyrant_core', count: 1, description: 'Добудьте командное ядро Тирана Свалки' }
      ],
      rewards: {
        exp: 8000, sp: 3200, currency: 15000,
        items: [
          { id: 'recipe_piston', count: 1 },
          { id: 'devotion_jacket', count: 1 },
          { id: 'pressure_amplifier_d', count: 3 }, { id: 'armor_pressure_amplifier_d', count: 3 }
        ]
      }
    },

    bounty_press_hammer: {
      id: 'bounty_press_hammer',
      name: 'Контракт: Молот Затишья',
      type: TYPES.SIDE,
      levelReq: 18,
      npc: 'gilbert',
      description: 'В бухте Тихой заводи пришел в движение многотонный Автономный Пресс-Молот. Древний станок штамповки дредноутов крушит прибрежные доки и любые объекты, оказавшиеся в радиусе его датчиков. Инспектор Гилберт требует сокрушить взбесившийся промышленный пресс и доставить его монолитное ядро.',
      objectives: [
        { type: 'kill', target: 'press_hammer', count: 1, description: 'Сокрушите Автономный Пресс-Молот' },
        { type: 'collect', target: 'press_hammer_core', count: 1, description: 'Извлеките тяжелое ядро Пресс-Молота' }
      ],
      rewards: {
        exp: 15000, sp: 6000, currency: 30000,
        items: [
          { id: 'recipe_steel_plate', count: 1 },
          { id: 'hoplon', count: 1 },
          { id: 'crystal_d', count: 5 },
          { id: 'blessed_pressure_amplifier', count: 1 }, { id: 'blessed_armor_pressure_amplifier', count: 1 }
        ]
      }
    },

    bounty_boiler_sovereign: {
      id: 'bounty_boiler_sovereign',
      name: 'Контракт: Суверен Котла',
      type: TYPES.SIDE,
      levelReq: 19,
      npc: 'gilbert',
      description: 'Главный восточный котловой комплекс вышел на запредельные режимы: во главе артерий перегретого пара встал Суверен Котла. Малейший перепад давления грозит детонацией всего острова. Инспектор Гилберт объявляет высший уровень тревоги и снаряжает рейд на усмирение огненного титана.',
      objectives: [
        { type: 'kill', target: 'boiler_sovereign', count: 1, description: 'Остудите и сразите Суверена Котла' },
        { type: 'collect', target: 'boiler_sovereign_core', count: 1, description: 'Доставьте пылающее ядро Суверена' }
      ],
      rewards: {
        exp: 25000, sp: 10000, currency: 50000,
        items: [
          { id: 'title_steam_lord', count: 1 },
          { id: 'copper_plate', count: 1 },
          { id: 'crystal_d', count: 10 },
          { id: 'blessed_pressure_amplifier', count: 2 }, { id: 'blessed_armor_pressure_amplifier', count: 2 }
        ]
      }
    },

    // ---- Ежедневный ----
    daily_scrapper_hunt: {
      id: 'daily_scrapper_hunt',
      name: 'Ежедневная зачистка',
      type: TYPES.DAILY,
      levelReq: 1,
      npc: 'gilbert',
      description: 'Регуляторы платят за уничтожение дефектных механизмов.',
      objectives: [
        { type: 'kill', target: 'scrapper', count: 20, description: 'Уничтожьте Скрапперов' }
      ],
      rewards: {
        exp: 200, currency: 1000,
        items: [{ id: 'pressure_amplifier', count: 2 }, { id: 'armor_pressure_amplifier', count: 2 }]
      },
      repeatable: true,
      daily: true
    },

    // ---- Мировое событие (рейд) ----
    event_pipe_burst: {
      id: 'event_pipe_burst',
      name: 'Прорыв паровой трубы',
      type: TYPES.EVENT,
      levelReq: 16,
      npc: 'gilbert',
      description: 'Из-под земли вырвался Босс-Бур. Все операторы призваны к зачистке.',
      objectives: [
        { type: 'kill', target: 'drill_worm', count: 1, description: 'Уничтожьте Босса-Бура' }
      ],
      rewards: {
        exp: 1000, currency: 5000,
        items: [
          // Ядро рейд-босса — трофей/материал (по CONTENT_SCOPE это штатный
          // дроп фазы 1) + чертёж D-грейда. Раньше выдавался чертёж
          // hydraulic_armor (C-грейд), недоступный до 40 ур.
          { id: 'drill_worm_core', count: 1 },
          { id: 'recipe_steel_plate', count: 1 }
        ]
      },
      repeatable: true,
      daily: true
    },

    // ---- 8 Квестов-Мостиков Фазы 1 (Bridge Quests) ----
    side_harbor_courier: {
      id: 'side_harbor_courier',
      name: 'Посылка в Гавань',
      type: TYPES.SIDE,
      levelReq: 2,
      npc: 'milly',
      description: 'Торговец Милли просит доставить в Гавань посылку со смазкой для Старателя Грога и вернуться в Деревню через аварийный Телепорт-Буй А-2.',
      objectives: [
        { type: 'talk', target: 'harbor_trader', count: 1, description: 'Передайте посылку Старателю Грогу в Гавани' }
      ],
      rewards: {
        exp: 120, currency: 350,
        items: [
          { id: 'synthetic_oil', count: 5 }
        ]
      }
    },

    side_astard_survey: {
      id: 'side_astard_survey',
      name: 'Вешки Геодезиста',
      type: TYPES.SIDE,
      levelReq: 4,
      npc: 'bot_01',
      description: 'Бот-01 просит провести разведку предгорий Астарда, нейтрализовать агрессивных паровых гончих и вернуть геодезические вешки Синдиката.',
      objectives: [
        { type: 'kill', target: 'steam_hound', count: 6, description: 'Уничтожьте Паровых Гончих' },
        { type: 'collect', target: 'astard_survey_token', count: 4, description: 'Соберите вешки геодезистов (гончие)' }
      ],
      rewards: {
        exp: 500, currency: 1000,
        items: [
          { id: 'copper_pipe', count: 1 }
        ]
      }
    },

    side_western_patrol: {
      id: 'side_western_patrol',
      name: 'Западный Дозор',
      type: TYPES.SIDE,
      levelReq: 6,
      npc: 'guard_w',
      description: 'Страж-Автомат W-1 поручает зачистить западный транзитный тракт от одичавших механизмов и прессующих стиралок.',
      objectives: [
        { type: 'kill', target: 'steam_hound', count: 10, description: 'Уничтожьте одичавших гончих на западном тракте' },
        { type: 'kill', target: 'hill_presser', count: 4, description: 'Нейтрализуйте тяжелых стиралок-убийц' }
      ],
      rewards: {
        exp: 1500, sp: 300, currency: 2500,
        items: [
          { id: 'synthetic_oil', count: 5 }
        ]
      }
    },

    side_cruna_forges: {
      id: 'side_cruna_forges',
      name: 'Огни Дворов Круны',
      type: TYPES.SIDE,
      levelReq: 10,
      npc: 'smith_kran',
      description: 'Кузнец-Сборщик Кран просит охладить буйные электроплиты во Дворах Круны и доставить экспериментальные слитки жаропрочного сплава.',
      objectives: [
        { type: 'kill', target: 'forge_apprentice', count: 10, description: 'Уничтожьте Электроплит-Шкварок' },
        { type: 'collect', target: 'cruna_forges_alloy', count: 5, description: 'Добудьте слитки сплава Дворов Круны' }
      ],
      rewards: {
        exp: 6500, sp: 1200, currency: 7000,
        items: [
          { id: 'pressure_amplifier', count: 2 }, { id: 'armor_pressure_amplifier', count: 2 }
        ]
      }
    },

    side_fallen_memory: {
      id: 'side_fallen_memory',
      name: 'Имена на Металле',
      type: TYPES.SIDE,
      levelReq: 13,
      npc: 'elias',
      description: 'Инженер Элиас направляет на Поле забвения: сокрушите тяжелые экстракторы и верните личные жетоны погибших бойцов Рездика.',
      objectives: [
        { type: 'kill', target: 'oblivion_walker', count: 10, description: 'Уничтожьте экстракторы на Поле забвения' },
        { type: 'collect', target: 'fallen_memorial_dogtag', count: 6, description: 'Соберите жетоны павших воинов' }
      ],
      rewards: {
        exp: 15000, sp: 3500, currency: 12000,
        items: [
          { id: 'emergency_repair_kit', count: 5 }
        ]
      }
    },

    side_chem_leak: {
      id: 'side_chem_leak',
      name: 'Зеленая Угроза',
      type: TYPES.SIDE,
      levelReq: 14,
      npc: 'grocer_spark',
      description: 'Кладовщица Искра сообщает о прорыве токсичных магистралей в Руинах химзавода. Обезвредьте кислотных выжигателей и соберите образцы яда.',
      objectives: [
        { type: 'kill', target: 'acid_sprayer', count: 10, description: 'Обезвредьте Выжигателей-Жгучек' },
        { type: 'collect', target: 'chem_toxic_sample', count: 5, description: 'Соберите пробы зеленой порчи' }
      ],
      rewards: {
        exp: 18000, sp: 4500, currency: 15000,
        items: [
          { id: 'antidote', count: 10 }
        ]
      }
    },

    side_rezdiq_orders: {
      id: 'side_rezdiq_orders',
      name: 'Приказ Рездика',
      type: TYPES.SIDE,
      levelReq: 17,
      npc: 'gilbert',
      description: 'Инспектор Гилберт приказывает навести порядок в Бараках Рездика: ликвидируйте взбунтовавшихся штроборезов и сержантов гарнизона.',
      objectives: [
        { type: 'kill', target: 'rezdiq_private', count: 12, description: 'Уничтожьте штроборезов гарнизона Рездика' },
        { type: 'kill', target: 'drill_sergeant', count: 6, description: 'Ликвидируйте цепных бензопил-сержантов' }
      ],
      rewards: {
        exp: 28000, sp: 7000, currency: 22000,
        items: [
          { id: 'pressure_amplifier_d', count: 2 }, { id: 'armor_pressure_amplifier_d', count: 2 }
        ]
      }
    },

    side_steel_limit: {
      id: 'side_steel_limit',
      name: 'На Краю Стали',
      type: TYPES.SIDE,
      levelReq: 17,
      npc: 'guard_n',
      description: 'Страж-Автомат N-1 направляет рейд к Крепости стального предела: прорвите оборону тостеров-заслонщиков и подавите осадные пушки.',
      objectives: [
        { type: 'kill', target: 'limit_guard', count: 12, description: 'Сокрушите тостеров-заслонщиков Крепости' },
        { type: 'kill', target: 'fort_turret', count: 8, description: 'Уничтожьте осадные тепловые пушки' }
      ],
      rewards: {
        exp: 32000, sp: 8000, currency: 25000,
        items: [
          { id: 'crystal_d', count: 10 }
        ]
      }
    },

    // ---- Эпические Квесты Эндгейма Фазы 1 (Капитан Морского Дозора) ----
    epic_seven_cores: {
      id: 'epic_seven_cores',
      name: 'Семь Ядер Хранителей',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'captain_sea_watch',
      description: 'Капитан Морского Дозора в Гавани отказывается выпускать дирижабли: пока Остров объят мятежом исполинов — небо закрыто. Соберите 7 ядер Элитных Хранителей, чтобы выковать Резонансный Ключ Цитадели.',
      objectives: [
        { type: 'collect', target: 'scrap_tyrant_core', count: 1, description: 'Ядро Тирана Свалки (Свалка)' },
        { type: 'collect', target: 'drill_worm_core', count: 1, description: 'Ядро Босса-Бура (Холмы Астарда)' },
        { type: 'collect', target: 'cruna_overseer_core', count: 1, description: 'Ядро Смотрителя Круны (Дворы Круны)' },
        { type: 'collect', target: 'press_hammer_core', count: 1, description: 'Ядро Пресс-Молота (Тихая заводь)' },
        { type: 'collect', target: 'boiler_sovereign_core', count: 1, description: 'Ядро Суверена Котла (Котловые земли)' },
        { type: 'collect', target: 'rezdiq_seal', count: 1, description: 'Печать Полковника Рездика (Бараки Рездика)' },
        { type: 'collect', target: 'green_protocol_core', count: 1, description: 'Ядро Протокола «Зелёный» (Руины химзавода)' }
      ],
      rewards: {
        exp: 50000, sp: 20000, currency: 100000,
        items: [
          { id: 'citadel_resonance_key', count: 1 }
        ]
      },
      nextQuest: 'epic_colossus_slayer'
    },

    epic_colossus_slayer: {
      id: 'epic_colossus_slayer',
      name: 'Падение Колосса',
      type: TYPES.MAIN,
      levelReq: 20,
      npc: 'captain_sea_watch',
      requires: 'epic_seven_cores',
      description: 'Откройте Резонансным Ключом гермоворота Крепости стального предела, сокрушите Стального Колосса Предела и доставьте его Сверхъядро Капитану Морского Дозора, чтобы снять карантин и получить заслуженную награду Ордена Морского Дозора.',
      objectives: [
        { type: 'kill', target: 'steel_colossus', count: 1, description: 'Сокрушите Стального Колосса Предела' },
        { type: 'collect', target: 'steel_colossus_core', count: 1, description: 'Добудьте Сверхъядро Колосса' }
      ],
      rewards: {
        exp: 100000, sp: 40000, currency: 200000
      }
    },

    // ---- Повторяемые экономические квесты (L2 C1 Classic x1 Repeatables) ----
    repeatable_cable_raiders: {
      id: 'repeatable_cable_raiders',
      name: 'Охотники за Медным Кабелем',
      type: TYPES.REPEATABLE,
      repeatable: true,
      levelReq: 6,
      npc: 'gilbert',
      description: 'Медные магистрали окрестностей Деревни расхищаются одичавшими собаками и косилками. Капитан Гилберт выплачивает регулярное вознаграждение за добытые отрезки кабеля.',
      objectives: [
        { type: 'collect', target: 'quest_copper_wire', count: 25, description: 'Соберите отрезки медного кабеля с окрестных механизмов' }
      ],
      rewards: {
        currency: 2500,
        items: [
          { id: 'synthetic_oil', count: 10 },
          { id: 'spark_plug', count: 5 }
        ]
      }
    },

    repeatable_heavy_nodes: {
      id: 'repeatable_heavy_nodes',
      name: 'Тяжелые Узлы Свалки',
      type: TYPES.REPEATABLE,
      repeatable: true,
      levelReq: 10,
      npc: 'trader_vex',
      description: 'Оружейнику Вексу требуются деформированные поршни тяжелых автоматонов и прессовщиков Свалки для переплавки в заготовки оружия.',
      objectives: [
        { type: 'collect', target: 'quest_bent_piston', count: 20, description: 'Добудьте деформированные поршни с автоматонов Свалки' }
      ],
      rewards: {
        currency: 6500,
        items: [
          { id: 'soulshot_no_grade', count: 50 },
          { id: 'piston_ring', count: 2 }
        ]
      }
    },

    repeatable_oblivion_collector: {
      id: 'repeatable_oblivion_collector',
      name: 'Сборщик Поля Забвения',
      type: TYPES.REPEATABLE,
      repeatable: true,
      levelReq: 14,
      npc: 'biotin',
      description: 'Смотритель Биотин исследует причины сбоя протоколов на Поле Забвения. Ему нужны шестерни памяти, кислотные редукторы и поврежденные чипы.',
      objectives: [
        { type: 'collect', target: 'quest_memory_gear', count: 10, description: 'Соберите шестерни памяти с шагоходов' },
        { type: 'collect', target: 'quest_acid_valve', count: 10, description: 'Добудьте кислотные редукторы' },
        { type: 'collect', target: 'quest_corrupted_chip', count: 5, description: 'Найдите чипы протокола сбоя' }
      ],
      rewards: {
        currency: 8500,
        items: [
          { id: 'crystal_d', count: 3 }
        ]
      }
    },

    repeatable_rezdiq_tags: {
      id: 'repeatable_rezdiq_tags',
      name: 'Охота за Жетонами Рездика',
      type: TYPES.REPEATABLE,
      repeatable: true,
      levelReq: 17,
      npc: 'intendant_rid',
      description: 'Интендант Рид ведет строгий учет ликвидации солдат мятежного полковника Рездика. Приносите личные жетоны солдат и сержантов гарнизона.',
      objectives: [
        { type: 'collect', target: 'quest_rezdiq_dogtag', count: 20, description: 'Соберите армейские жетоны солдат Рездика' }
      ],
      rewards: {
        currency: 6500,
        items: [
          { id: 'pressure_amplifier', count: 2 }, { id: 'armor_pressure_amplifier', count: 2 }
        ],
        randomPick: [
          { id: 'recipe_scale_mail_breastplate', count: 1 },
          { id: 'recipe_scale_mail_gaiters', count: 1 },
          { id: 'recipe_knowledge_jacket', count: 1 },
          { id: 'recipe_reinforced_leather_shirt', count: 1 }
        ]
      }
    }
  };

  // Объектный литерал {'__proto__': 1} НЕ создаёт собственное свойство (это
  // установка прототипа), поэтому проверка по hasOwnProperty пропускала бы
  // именно самый опасный ключ.
  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;
  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  function get(questId) {
    if (questId == null) return null;
    var k = String(questId).toLowerCase();
    if (isBadKey(k)) return null;
    return Object.prototype.hasOwnProperty.call(QUESTS, k) ? QUESTS[k] : null;
  }

  function all() {
    return Object.keys(QUESTS).map(function (k) { return QUESTS[k]; });
  }

  /** Квесты, которые выдаёт/принимает NPC. */
  function forNpc(npcId) {
    if (!npcId) return [];
    var id = String(npcId);
    return all().filter(function (q) { return q.npc === id; });
  }

  /** Все id целей типа kill (для быстрого фильтра в onMobDeath). */
  function killTargets() {
    var set = Object.create(null);
    all().forEach(function (q) {
      q.objectives.forEach(function (o) { if (o.type === 'kill') set[o.target] = 1; });
    });
    return Object.keys(set);
  }

  /** Все id предметов, которые нужны цели collect. */
  function collectTargets() {
    var set = Object.create(null);
    all().forEach(function (q) {
      q.objectives.forEach(function (o) { if (o.type === 'collect') set[o.target] = 1; });
    });
    return Object.keys(set);
  }

  // ============================================================
  //  СОСТОЯНИЕ ИГРОКА
  //  { active: { questId: { p: [counts], at: ms } },
  //    done:   { questId: { n: сколько раз, at: ms } } }
  //  Компактно: в профиль пишется как есть.
  // ============================================================
  function emptyState() {
    return { active: Object.create(null), done: Object.create(null) };
  }

  /** Привести состояние из профиля к валидному виду (без прототипа, без мусора). */
  function normalizeState(raw) {
    var st = emptyState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return st;
    var src = raw.active;
    if (src && typeof src === 'object') {
      Object.keys(src).forEach(function (k) {
        if (isBadKey(k)) return;
        var q = get(k);
        if (!q) return;                       // квест удалён из базы
        var e = src[k];
        if (!e || typeof e !== 'object') return;
        var counts = [];
        for (var i = 0; i < q.objectives.length; i++) {
          var v = Array.isArray(e.p) ? Math.floor(+e.p[i]) : 0;
          if (!Number.isFinite(v) || v < 0) v = 0;
          counts.push(Math.min(v, q.objectives[i].count));
        }
        st.active[q.id] = { p: counts, at: Math.max(0, Math.floor(+e.at) || 0) };
      });
    }
    var dn = raw.done;
    if (dn && typeof dn === 'object') {
      Object.keys(dn).forEach(function (k) {
        if (isBadKey(k)) return;
        if (!get(k)) return;
        var e = dn[k];
        var n = (e && typeof e === 'object') ? Math.floor(+e.n) : Math.floor(+e);
        var at = (e && typeof e === 'object') ? Math.floor(+e.at) : 0;
        st.done[String(k).toLowerCase()] = {
          n: Number.isFinite(n) && n > 0 ? n : 1,
          at: Number.isFinite(at) && at > 0 ? at : 0
        };
      });
    }
    return st;
  }

  /** Номер суток по UTC — для сброса daily. */
  function dayIndex(ms) {
    return Math.floor((ms || 0) / 86400000);
  }

  /** Можно ли взять квест снова (repeatable / daily). */
  function canRepeat(q, doneEntry, now) {
    if (!doneEntry) return true;
    if (!q.repeatable) return false;
    if (q.daily) return dayIndex(doneEntry.at) < dayIndex(now == null ? Date.now() : now);
    return true;
  }

  /**
   * Статус квеста для игрока.
   * @param {object} st normalizeState
   * @param {object} q  шаблон
   * @param {number} now
   */
  function stateOf(st, q, now) {
    if (!q) return STATES.NOT_STARTED;
    var a = st.active[q.id];
    if (a) return isComplete(q, a.p) ? STATES.COMPLETABLE : STATES.IN_PROGRESS;
    var d = st.done[q.id];
    if (d && !canRepeat(q, d, now)) return STATES.COMPLETED;
    return STATES.NOT_STARTED;
  }

  function isComplete(q, counts) {
    if (!q || !Array.isArray(counts)) return false;
    for (var i = 0; i < q.objectives.length; i++) {
      if ((counts[i] | 0) < q.objectives[i].count) return false;
    }
    return true;
  }

  /**
   * Можно ли принять квест.
   * @param {string} [cls] текущий класс — для classReq (operator / engineer)
   * @returns {{ok:boolean, reason?:string, need?:number|string}}
   */
  function canAccept(st, q, level, now, cls) {
    if (!q) return { ok: false, reason: 'unknown' };
    if (st.active[q.id]) return { ok: false, reason: 'active' };
    var d = st.done[q.id];
    if (d && !canRepeat(q, d, now)) {
      return { ok: false, reason: q.daily ? 'daily_done' : 'done' };
    }
    if ((level | 0) < q.levelReq) return { ok: false, reason: 'level', need: q.levelReq };
    if (q.classReq && String(cls || '').toLowerCase() !== String(q.classReq).toLowerCase()) {
      return { ok: false, reason: 'class', need: q.classReq };
    }
    if (Object.keys(st.active).length >= MAX_ACTIVE) return { ok: false, reason: 'too_many' };
    // Цепочка: main_02 доступен только после main_01 и т.д.
    var prereq = prerequisiteOf(q.id);
    if (prereq && !st.done[prereq]) return { ok: false, reason: 'prereq', need: prereq };
    return { ok: true };
  }

  /** Кто ведёт к этому квесту через requires или nextQuest (обратный индекс цепочки). */
  var _prereq = null;
  function prerequisiteOf(questId) {
    var k = String(questId || '').toLowerCase();
    var q = get(k);
    if (q && q.requires && get(q.requires)) return String(q.requires).toLowerCase();
    if (!_prereq) {
      _prereq = Object.create(null);
      all().forEach(function (qq) {
        if (qq.nextQuest && get(qq.nextQuest)) _prereq[qq.nextQuest] = qq.id;
      });
    }
    return Object.prototype.hasOwnProperty.call(_prereq, k) ? _prereq[k] : null;
  }

  /** Публичный снапшот для клиента: список активных + завершённых. */
  function snapshot(st, level, now, cls) {
    now = now == null ? Date.now() : now;
    var active = Object.keys(st.active).map(function (id) {
      var q = get(id);
      var a = st.active[id];
      return {
        id: id,
        state: isComplete(q, a.p) ? STATES.COMPLETABLE : STATES.IN_PROGRESS,
        progress: a.p.slice()
      };
    });
    var done = Object.keys(st.done).map(function (id) {
      return { id: id, n: st.done[id].n, at: st.done[id].at };
    });
    var available = all().filter(function (q) {
      return canAccept(st, q, level, now, cls).ok;
    }).map(function (q) { return q.id; });
    return { active: active, done: done, available: available };
  }

  // ============================================================
  //  ВАЛИДАЦИЯ ДАННЫХ (гоняется тестом; ловит опечатки в id)
  // ============================================================
  function validate() {
    var LR = getLR(), ITEMS = getITEMS(), MOB = getMOB();
    var errors = [];
    var itemKnown = function (id) {
      try {
        if (LR && LR.itemById && LR.itemById(id)) return true;
        if (ITEMS && ITEMS.get && ITEMS.get(id)) return true;
      } catch (e) { /* ignore */ }
      return false;
    };
    Object.keys(QUESTS).forEach(function (key) {
      var q = QUESTS[key];
      if (q.id !== key) errors.push(key + ': id != ключ (' + q.id + ')');
      if (!q.objectives || !q.objectives.length) errors.push(q.id + ': нет целей');
      (q.objectives || []).forEach(function (o, i) {
        var where = q.id + '.objectives[' + i + ']';
        if (!(o.count > 0)) errors.push(where + ': count <= 0');
        if (o.type === 'kill') {
          var m = null;
          try { m = MOB && MOB.get ? MOB.get(o.target) : null; } catch (e) { m = null; }
          if (!m) errors.push(where + ': неизвестный моб ' + o.target);
        } else if (o.type === 'collect') {
          if (!itemKnown(o.target)) errors.push(where + ': неизвестный предмет ' + o.target);
          var meta = LR && LR.itemById ? LR.itemById(o.target) : null;
          if (meta && meta.type === 'adena') {
            errors.push(where + ': валюту нельзя собирать как предмет (' + o.target + ')');
          }
        } else if (o.type !== 'talk') {
          errors.push(where + ': неизвестный тип ' + o.type);
        }
      });
      var r = q.rewards || {};
      (r.items || []).forEach(function (it, i) {
        if (!itemKnown(it.id)) errors.push(q.id + '.rewards.items[' + i + ']: неизвестный предмет ' + it.id);
        if (!(it.count > 0)) errors.push(q.id + '.rewards.items[' + i + ']: count <= 0');
      });
      if (r.byClass) {
        Object.keys(r.byClass).forEach(function (cls) {
          if (!/^(operator|engineer|craftsman)$/.test(cls)) errors.push(q.id + '.rewards.byClass: неизвестный класс ' + cls);
          (r.byClass[cls] || []).forEach(function (it, i) {
            if (!itemKnown(it.id)) errors.push(q.id + '.rewards.byClass.' + cls + '[' + i + ']: неизвестный предмет ' + it.id);
            if (!(it.count > 0)) errors.push(q.id + '.rewards.byClass.' + cls + '[' + i + ']: count <= 0');
          });
        });
      }
      (r.randomPick || []).forEach(function (it, i) {
        if (!itemKnown(it.id)) errors.push(q.id + '.rewards.randomPick[' + i + ']: неизвестный предмет ' + it.id);
        if (!(it.count > 0)) errors.push(q.id + '.rewards.randomPick[' + i + ']: count <= 0');
      });
      if (r.choices && Array.isArray(r.choices)) {
        r.choices.forEach(function (choice, ci) {
          (choice.items || []).forEach(function (it, i) {
            if (!itemKnown(it.id)) errors.push(q.id + '.rewards.choices[' + ci + '].items[' + i + ']: неизвестный предмет ' + it.id);
            if (!(it.count > 0)) errors.push(q.id + '.rewards.choices[' + ci + '].items[' + i + ']: count <= 0');
          });
        });
      }
      if (q.nextQuest && !get(q.nextQuest)) errors.push(q.id + ': nextQuest не существует (' + q.nextQuest + ')');
      if (q.requires && !get(q.requires)) errors.push(q.id + ': requires не существует (' + q.requires + ')');
      if (q.classReq && !/^(operator|engineer|craftsman)$/.test(String(q.classReq))) {
        errors.push(q.id + ': classReq должен быть operator|engineer|craftsman (' + q.classReq + ')');
      }
      if (q.daily && !q.repeatable) errors.push(q.id + ': daily без repeatable');
    });
    return errors;
  }

  return {
    TYPES: TYPES,
    STATES: STATES,
    MAX_ACTIVE: MAX_ACTIVE,
    QUESTS: QUESTS,
    get: get,
    all: all,
    forNpc: forNpc,
    killTargets: killTargets,
    collectTargets: collectTargets,
    emptyState: emptyState,
    normalizeState: normalizeState,
    stateOf: stateOf,
    isComplete: isComplete,
    canAccept: canAccept,
    canRepeat: canRepeat,
    prerequisiteOf: prerequisiteOf,
    dayIndex: dayIndex,
    snapshot: snapshot,
    validate: validate
  };
});
