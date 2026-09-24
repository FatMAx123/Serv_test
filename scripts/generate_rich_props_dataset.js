const fs = require('fs');
const path = require('path');

// World metrics
const WORLD = {
  MIN_X: -1892.61,
  MAX_X: 1838.18,
  MIN_Z: -1918.20,
  MAX_Z: 1827.11,
  WIDTH: 3730.79,
  HEIGHT: 3745.31,
  SEA_LEVEL: -35.0
};

function uvToWorld(u, v, y = -15.0) {
  const x = WORLD.MIN_X + u * WORLD.WIDTH;
  const z = WORLD.MIN_Z + v * WORLD.HEIGHT;
  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
    z: Number(z.toFixed(1))
  };
}

// 22 Locations with UV boundaries & complete rich prop registries
const LOCATIONS = [
  {
    id: "village",
    nameRu: "Деревня поющей стали",
    uv: [0.388, 0.384, 0.566, 0.568],
    dialogue: "«Слышишь этот гул в полу? Это остров стонет под весом ржавчины...» (Инспектор Гилберт, main_02_perimeter)",
    props: [
      { id: "prop_vil_townhall", model: "house_engineer_01.fbx", u: 0.4762, v: 0.4673, y: -15.0, yaw: "180°", size: "14x12x16 м, Box", vfx: "Дым из трубы, 50 Гц гул", quest: "main_02_perimeter, gilbert", desc: "Ратуша Инспектората Гилберта" },
      { id: "prop_vil_kettle_monument", model: "monument_central.fbx", u: 0.4783, v: 0.4769, y: -15.0, yaw: "0°", size: "8x8x12 м, Cylinder", vfx: "Вечный факел пара, гул", quest: "main_01_welcome, bot_01", desc: "Центральный монумент Первого Котла" },
      { id: "prop_vil_tp_roxy", model: "tp_zone.fbx", u: 0.4762, v: 0.4780, y: -15.0, yaw: "90°", size: "6x6x4 м, Cylinder", vfx: "Лазурный маяк, вспышки", quest: "side_roxy_echo, roxy", desc: "Эфирный постамент телепорта Рокси" },
      { id: "prop_vil_gate_n", model: "sh1.fbx", u: 0.4750, v: 0.4000, y: -15.0, yaw: "0°", size: "16x6x10 м, Box", vfx: "Свист гидравлики решеток", quest: "side_steel_limit, guard_n", desc: "Северные Бастионные Ворота N-1" },
      { id: "prop_vil_gate_s", model: "sh1.fbx", u: 0.4750, v: 0.4900, y: -15.0, yaw: "180°", size: "16x6x10 м, Box", vfx: "Желтые сигнальные фонари", quest: "side_astard_survey, guard_s", desc: "Южные Бастионные Ворота S-1" },
      { id: "prop_vil_gate_w", model: "sh1.fbx", u: 0.4000, v: 0.4450, y: -15.0, yaw: "270°", size: "16x6x10 м, Box", vfx: "Сброс давления из клапанов", quest: "side_western_patrol, guard_w", desc: "Западные Бастионные Ворота W-1" },
      { id: "prop_vil_gate_e", model: "sh1.fbx", u: 0.5500, v: 0.4450, y: -15.0, yaw: "90°", size: "16x6x10 м, Box", vfx: "Медные распределители пара", quest: "guard_e", desc: "Восточные Бастионные Ворота E-1" },
      { id: "prop_vil_shop_milly", model: "grocery_shop.fbx", u: 0.4698, v: 0.4855, y: -15.0, yaw: "45°", size: "8x8x7 м, Box", vfx: "Бочки с маслом, ящики соулшотов", quest: "side_milly_parts, milly", desc: "Лавка Бакалеи Милли" },
      { id: "prop_vil_stall_spark", model: "market_stall_01.fbx", u: 0.4826, v: 0.4855, y: -15.0, yaw: "315°", size: "5x4x4 м, Box", vfx: "Катушки, перфокарты, чертежи", quest: "side_spark_gardens, spark", desc: "Лавка Редких Схем Искры" },
      { id: "prop_vil_shop_vex", model: "warrior_shop_large.fbx", u: 0.4703, v: 0.4705, y: -15.0, yaw: "135°", size: "10x10x8 м, Box", vfx: "Оружейные витрины, стойки", quest: "side_vex_scrap, vex", desc: "Оружейная Мастерская Векса" },
      { id: "prop_vil_forge_kran", model: "forge_01.fbx", u: 0.4655, v: 0.4705, y: -15.0, yaw: "90°", size: "8x8x6 м, Box", vfx: "Огонь горна, наковальня", quest: "side_cruna_forges, kran", desc: "Кузница-Мастерская Крана" },
      { id: "prop_vil_house_skrip", model: "house_engineer_02.fbx", u: 0.4821, v: 0.4705, y: -15.0, yaw: "225°", size: "9x9x8 м, Box", vfx: "Шкафы с патентами и схемами", quest: "path_to_constructor, skrip", desc: "Архив Патентов Скрипа" },
      { id: "prop_vil_lab_biotin", model: "boiler_room.fbx", u: 0.4826, v: 0.4673, y: -15.0, yaw: "270°", size: "10x8x7 м, Box", vfx: "Маятники, осциллографы", quest: "main_03_machines, biotin", desc: "Машинный Зал Биотина" },
      { id: "prop_vil_memorial_elias", model: "monument_wheel.fbx", u: 0.4666, v: 0.4652, y: -15.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Латунное кольцо шестерни", quest: "side_fallen_memory, elias", desc: "Стела Книги Памяти Элиаса" },
      { id: "prop_vil_pvp_arena", model: "tp_zone.fbx", u: 0.4934, v: 0.4956, y: -15.0, yaw: "0°", size: "20x20x1 м, Trigger", vfx: "Факелы на чугунных столбах", quest: "arena_kettle", desc: "Чугунный ринг Арены Котла" },
      { id: "prop_vil_fountain", model: "monument_central.fbx", u: 0.4720, v: 0.4790, y: -15.0, yaw: "0°", size: "5x5x3 м, Cylinder", vfx: "Каскад термальной воды", quest: "decor_square", desc: "Городской фонтан охлаждения" },
      { id: "prop_vil_steam_pipe_hub", model: "boiler.fbx", u: 0.4600, v: 0.4600, y: -15.0, yaw: "45°", size: "6x6x5 м, Box", vfx: "Клубы пара, свист клапанов", quest: "decor_infrastructure", desc: "Центральный узел распределения пара" },
      { id: "prop_vil_market_square", model: "medieval_market.fbx", u: 0.4780, v: 0.4920, y: -15.0, yaw: "0°", size: "14x10x6 м, Box", vfx: "Навесы, прилавки, бочки", quest: "decor_market", desc: "Крытые торговые ряды площади" }
    ]
  },
  {
    id: "operators_yard",
    nameRu: "Территория Операторов",
    uv: [0.520, 0.440, 0.560, 0.490],
    dialogue: "«Сначала стой. Потом бей. Потом чини» — девиз силовой ветки на чугунной арке плаца.",
    props: [
      { id: "prop_op_arch", model: "sh1.fbx", u: 0.5250, v: 0.4650, y: -10.0, yaw: "90°", size: "8x3x6 м, Box", vfx: "Литые буквы девиза", quest: "Девиз Операторов", desc: "Входная арка плаца с девизом" },
      { id: "prop_op_dummies", model: "monument_wheel.fbx", u: 0.5350, v: 0.4600, y: -10.0, yaw: "0°", size: "6x4x3 м, Box", vfx: "Звон металла при ударах", quest: "main_01_welcome", desc: "Манекены на рессорах" },
      { id: "prop_op_press_stand", model: "boiler.fbx", u: 0.5450, v: 0.4550, y: -10.0, yaw: "45°", size: "5x5x6 м, Box", vfx: "Поршень под давлением 50 атм", quest: "Проверка бронеплит", desc: "Гидравлический пресс брони" },
      { id: "prop_op_armory", model: "warehouse_01.fbx", u: 0.5500, v: 0.4750, y: -10.0, yaw: "270°", size: "12x10x8 м, Box", vfx: "Пирамиды молотов и наручей", quest: "intendant_rid", desc: "Склад снабжения Рида" },
      { id: "prop_op_barriers", model: "SM_RP_Rock_2m_0.fbx", u: 0.5300, v: 0.4700, y: -10.0, yaw: "0°", size: "6x2x2 м, Box", vfx: "Чугунный настил", quest: "Ограждение плаца", desc: "Заградительные брустверы" },
      { id: "prop_op_heating_boiler", model: "boiler.fbx", u: 0.5550, v: 0.4600, y: -10.0, yaw: "180°", size: "4x4x5 м, Box", vfx: "Дым из трубы, тепловой пар", quest: "Обогрев казарм", desc: "Бойлер обогрева казарм" },
      { id: "prop_op_weapon_racks", model: "Plank.fbx", u: 0.5380, v: 0.4680, y: -10.0, yaw: "90°", size: "4x1x2 м, Box", vfx: "Стойки с учебными алебардами", quest: "combat_training", desc: "Оружейные пирамиды плаца" },
      { id: "prop_op_whistle_mast", model: "airship_mooring_mast.fbx", u: 0.5280, v: 0.4480, y: -10.0, yaw: "0°", size: "3x3x12 м, Box", vfx: "Паровой ревун общей тревоги", quest: "alarm_system", desc: "Сигнальная мачта с паровым свистком" },
      { id: "prop_op_fuel_depot", model: "warehouse_03.fbx", u: 0.5520, v: 0.4850, y: -10.0, yaw: "180°", size: "8x6x5 м, Box", vfx: "Штабели бочек со смазкой", quest: "fuel_logistics", desc: "Склад мазута и гидравлического масла" },
      { id: "prop_op_hurdles", model: "Log_1.fbx", u: 0.5400, v: 0.4480, y: -10.0, yaw: "45°", size: "8x2x1.5 м, Box", vfx: "Окованные сталью бревна", quest: "obstacle_course", desc: "Полоса препятствий штурмовиков" },
      { id: "prop_op_inspection_podium", model: "tent_01.fbx", u: 0.5320, v: 0.4820, y: -10.0, yaw: "0°", size: "6x5x4 м, Box", vfx: "Штабной навес с картой рубежей", quest: "rid_tactics", desc: "Трибуна инструктора Рида" },
      { id: "prop_op_lantern_post", model: "monument_central.fbx", u: 0.5220, v: 0.4550, y: -10.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Газовый дуговой фонарь плаца", quest: "lighting", desc: "Осветительный столб плаца" }
    ]
  },
  {
    id: "engineers_school",
    nameRu: "Школа Инженеров",
    uv: [0.400, 0.420, 0.440, 0.470],
    dialogue: "«Пар без ума — взрыв. Ум без пара — тишина» — правило контурной школы инженеров.",
    props: [
      { id: "prop_eng_hall", model: "house_engineer_03.fbx", u: 0.4150, v: 0.4450, y: -12.0, yaw: "90°", size: "14x10x9 м, Box", vfx: "Шины заземления на стенах", quest: "magister_baulro", desc: "Корпус Магистра Болро" },
      { id: "prop_eng_crucible", model: "boiler.fbx", u: 0.4250, v: 0.4350, y: -12.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Раскаленный янтарь тигля", quest: "path_to_constructor, skrip", desc: "Калибровочный тигель Торна" },
      { id: "prop_eng_tesla", model: "airship_mooring_mast.fbx", u: 0.4100, v: 0.4300, y: -12.0, yaw: "0°", size: "3x3x8 м, Box", vfx: "Электрические синие дуги", quest: "path_to_technomancer", desc: "Катушка Теслы с разрядниками" },
      { id: "prop_eng_benches", model: "tent_01.fbx", u: 0.4300, v: 0.4600, y: -12.0, yaw: "180°", size: "6x6x4 м, Box", vfx: "Паяльные столы, вытяжки", quest: "biotin", desc: "Верстаки пайки нано-браслетов" },
      { id: "prop_eng_gauges", model: "boiler_room.fbx", u: 0.4050, v: 0.4500, y: -12.0, yaw: "45°", size: "5x3x4 м, Box", vfx: "Стрелки манометров контура", quest: "Настройка частоты", desc: "Щит контурных приборов" },
      { id: "prop_eng_grounding", model: "monument_wheel.fbx", u: 0.4200, v: 0.4650, y: -12.0, yaw: "0°", size: "4x4x2 м, Trigger", vfx: "Медный блеск пластин в земле", quest: "Защита от статики", desc: "Шины контурного заземления" },
      { id: "prop_eng_cistern", model: "boiler.fbx", u: 0.4350, v: 0.4250, y: -12.0, yaw: "90°", size: "5x5x5 м, Cylinder", vfx: "Трубки с голубым хладагентом", quest: "cooling_loop", desc: "Резервуар жидкого диэлектрика" },
      { id: "prop_eng_drawing_tent", model: "tent_02.fbx", u: 0.4180, v: 0.4250, y: -12.0, yaw: "135°", size: "5x5x3.5 м, Box", vfx: "Чертежные столы, кульманы", quest: "blueprints_craft", desc: "Павильон проектирования схем" },
      { id: "prop_eng_parts_rack", model: "warehouse_04.fbx", u: 0.4320, v: 0.4480, y: -12.0, yaw: "270°", size: "8x6x5 м, Box", vfx: "Ячейки с радиолампами и кварцем", quest: "components_store", desc: "Стеллажный модуль микрокомпонентов" },
      { id: "prop_eng_arc_lamp", model: "monument_central.fbx", u: 0.4120, v: 0.4580, y: -12.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Фиолетовое дуговое свечение", quest: "lighting", desc: "Фонарь дуговой подсветки двора" },
      { id: "prop_eng_copper_pipes", model: "Log_2.fbx", u: 0.4220, v: 0.4400, y: -12.0, yaw: "0°", size: "6x1x1 м, Box", vfx: "Трубопровод подачи сжатого воздуха", quest: "pneumo_lines", desc: "Эстакада пневматической почты" },
      { id: "prop_eng_waste_bin", model: "PieceOfWood.fbx", u: 0.4280, v: 0.4320, y: -12.0, yaw: "30°", size: "3x2x1.5 м, Box", vfx: "Обрезки медных шин и изоляции", quest: "scrap_recycle", desc: "Бункер сбора медной стружки" }
    ]
  },
  {
    id: "astard_hills",
    nameRu: "Холмы Астарда",
    uv: [0.440, 0.570, 0.580, 0.680],
    dialogue: "«Геодезическая сеть Синдиката на Холмах Астарда сбоит. Сигнальные маячки утащили паровые кофемашины-гончие...» (Бот-01, side_astard_survey)",
    props: [
      { id: "prop_astard_stakes", model: "monument_wheel.fbx", u: 0.4800, v: 0.6100, y: 15.0, yaw: "45°", size: "2x2x3 м, Cylinder", vfx: "Латунные призмы на треногах", quest: "side_astard_survey, bot_01", desc: "Геодезические вешки Астарда" },
      { id: "prop_astard_crater", model: "SM_RP_Rock_8m_0.fbx", u: 0.5100, v: 0.6300, y: -5.0, yaw: "0°", size: "24x24x6 м, Box", vfx: "Воронка с разорванными трубами", quest: "event_pipe_burst", desc: "Карьерная выемка грунта" },
      { id: "prop_astard_geysers", model: "boiler.fbx", u: 0.5150, v: 0.6350, y: -5.0, yaw: "0°", size: "4x4x6 м, Box", vfx: "Фонтаны кипятка и пара", quest: "event_pipe_burst", desc: "Свищи разорванного паропровода" },
      { id: "prop_astard_cart", model: "PieceOfWood.fbx", u: 0.4600, v: 0.5900, y: 10.0, yaw: "110°", size: "4x3x2 м, Box", vfx: "Остов разбитой повозки", quest: "side_astard_survey", desc: "Разбитая геодезическая тележка" },
      { id: "prop_astard_sign", model: "monument_central.fbx", u: 0.4750, v: 0.6000, y: 12.0, yaw: "180°", size: "1.5x1.5x5 м, Cylinder", vfx: "Указатель Южного Тракта", quest: "Навигация к Гавани", desc: "Путевой межевой столб" },
      { id: "prop_astard_stumps", model: "Stump_1.fbx", u: 0.4900, v: 0.5800, y: 14.0, yaw: "65°", size: "2x2x1.5 м, Cylinder", vfx: "Следы дисковых пил на пнях", quest: "Срезанные деревья", desc: "Пни вырубки просеки тракта" },
      { id: "prop_astard_warning_board", model: "Plank.fbx", u: 0.4500, v: 0.6150, y: 11.0, yaw: "90°", size: "3x1x2.5 м, Box", vfx: "Знак «Осторожно, высокое давление»", quest: "danger_signs", desc: "Предупредительный щит Синдиката" },
      { id: "prop_astard_manifold", model: "boiler_room.fbx", u: 0.5300, v: 0.6200, y: 5.0, yaw: "270°", size: "7x6x5 м, Box", vfx: "Маховики вентилей магистрали", quest: "pipe_repair", desc: "Регулировочная станция Южного контура" },
      { id: "prop_astard_ore_cart", model: "PieceOfWood.fbx", u: 0.5500, v: 0.6500, y: -2.0, yaw: "35°", size: "3.5x2x1.8 м, Box", vfx: "Ржавая вагонетка с железняком", quest: "mining_lore", desc: "Опрокинутая карьерная вагонетка" },
      { id: "prop_astard_scree_cliff", model: "SM_RP_Rock_4m_0.fbx", u: 0.5650, v: 0.6650, y: 8.0, yaw: "120°", size: "8x6x5 м, Box", vfx: "Осыпи базальтового щебня", quest: "terrain_feature", desc: "Скальный уступ перевала" },
      { id: "prop_astard_surveyor_tent", model: "tent_03.fbx", u: 0.4680, v: 0.5850, y: 13.0, yaw: "180°", size: "5x4x3 м, Box", vfx: "Полевая палатка картографов", quest: "survey_camp", desc: "Заброшенный лагерь изыскателей" },
      { id: "prop_astard_trail_lantern", model: "monument_central.fbx", u: 0.4950, v: 0.6400, y: 3.0, yaw: "0°", size: "1.5x1.5x4.5 м, Cylinder", vfx: "Керосиновый фонарь на чугунном шесте", quest: "night_trail", desc: "Трассовый фонарный столб" },
      { id: "prop_astard_retaining_wall", model: "SM_RP_Rock_2m_1.fbx", u: 0.4850, v: 0.6600, y: -4.0, yaw: "90°", size: "10x2x3 м, Box", vfx: "Кладка из дикого камня с анкерами", quest: "erosion_control", desc: "Подпорная стенка откоса дороги" },
      { id: "prop_astard_severed_pipe", model: "Log_3.fbx", u: 0.5220, v: 0.6420, y: -3.0, yaw: "15°", size: "8x1.5x1.5 м, Cylinder", vfx: "Разорванная клепаная труба 1.5м", quest: "event_pipe_burst", desc: "Отрезок магистрального паропровода" }
    ]
  },
  {
    id: "riverspan",
    nameRu: "Междуречье",
    uv: [0.400, 0.650, 0.520, 0.760],
    dialogue: "«На отмелях Междуречья взбесились насосные станции. Их поршни молотят вразнобой, порождая гидроудары в магистралях...» (Диспетчер Рокси, side_roxy_echo)",
    props: [
      { id: "prop_riv_pumps", model: "boiler.fbx", u: 0.4500, v: 0.7000, y: -30.0, yaw: "0°", size: "8x6x8 м, Box", vfx: "Чугунные поршни, бьющие в воду", quest: "side_roxy_echo, roxy", desc: "Насосные станции на сваях" },
      { id: "prop_riv_filters", model: "boiler_room.fbx", u: 0.4300, v: 0.7200, y: -33.0, yaw: "215°", size: "4x4x3 м, Box", vfx: "Масляные радужные пятна", quest: "side_roxy_echo", desc: "Затопленные масляные фильтры" },
      { id: "prop_riv_barrier", model: "tent_02.fbx", u: 0.4800, v: 0.6800, y: -25.0, yaw: "90°", size: "8x4x4 м, Box", vfx: "Подъемный чугунный брус", quest: "Контроль прохода", desc: "Шлагбаум сборщиков пошлины" },
      { id: "prop_riv_pilings", model: "Log_1.fbx", u: 0.4600, v: 0.6900, y: -32.0, yaw: "0°", size: "1x1x6 м, Cylinder", vfx: "Опоры старого моста в воде", quest: "Лор переправы", desc: "Сваи со стальными хомутами" },
      { id: "prop_riv_rocks", model: "SM_RP_Rock_4m_0.fbx", u: 0.4200, v: 0.6900, y: -32.0, yaw: "30°", size: "6x6x4 м, Box", vfx: "Бурлящие буруны воды вокруг", quest: "Природная преграда", desc: "Речные валуны-волноломы" },
      { id: "prop_riv_buoy", model: "monument_central.fbx", u: 0.4400, v: 0.7400, y: -34.0, yaw: "0°", size: "1.5x1.5x4 м, Cylinder", vfx: "Керосиново-паровой фонарь", quest: "Навигация фарватера", desc: "Сигнальный буй протоки" },
      { id: "prop_riv_sluice_gate", model: "sh1.fbx", u: 0.4700, v: 0.7250, y: -28.0, yaw: "180°", size: "10x4x7 м, Box", vfx: "Шандорные затворы водосброса", quest: "water_control", desc: "Шлюзовая заслонка протоки" },
      { id: "prop_riv_footbridge", model: "Plank.fbx", u: 0.4550, v: 0.6750, y: -26.0, yaw: "45°", size: "12x2x0.5 м, Box", vfx: "Скрипучий дощатый настил", quest: "bridge_crossing", desc: "Мостки через илистую протоку" },
      { id: "prop_riv_flood_gauge", model: "monument_wheel.fbx", u: 0.4350, v: 0.7050, y: -31.0, yaw: "0°", size: "1x1x5 м, Cylinder", vfx: "Мерная рейка паводковых вод", quest: "flood_monitoring", desc: "Водомерный столб гидропоста" },
      { id: "prop_riv_relief_pipe", model: "boiler.fbx", u: 0.4950, v: 0.7350, y: -27.0, yaw: "90°", size: "5x4x4 м, Box", vfx: "Фонтан пены при гидроударе", quest: "side_roxy_echo", desc: "Перепускной клапан гидроудара" },
      { id: "prop_riv_boat_wreck", model: "PieceOfWood.fbx", u: 0.4150, v: 0.7300, y: -34.5, yaw: "135°", size: "6x3x1.5 м, Box", vfx: "Полузатопленный остов баркаса", quest: "river_lore", desc: "Разбитый служебный баркас" },
      { id: "prop_riv_mooring_cleats", model: "SM_RP_Rock_2m_2.fbx", u: 0.4650, v: 0.7450, y: -30.0, yaw: "0°", size: "2x2x2 м, Box", vfx: "Чугунный кнехт с тросами", quest: "river_transport", desc: "Причальная тумба переправы" }
    ]
  },
  {
    id: "scrapyard",
    nameRu: "Свалка",
    uv: [0.260, 0.400, 0.380, 0.500],
    dialogue: "«В глубинах Свалки ожил чудовищный агрегат — Тиран Свалки. Это многотонный самосборный колосс...» (Инспектор Гилберт, bounty_scrap_tyrant)",
    props: [
      { id: "prop_scr_crater", model: "SM_RP_Rock_8m_1.fbx", u: 0.3100, v: 0.4500, y: -10.0, yaw: "0°", size: "30x30x8 м, Box", vfx: "Свистящие струи пара из щелей", quest: "bounty_scrap_tyrant", desc: "Кратер Самосборки металла" },
      { id: "prop_scr_crane", model: "airship_mooring_mast.fbx", u: 0.3400, v: 0.4300, y: -5.0, yaw: "135°", size: "6x18x8 м, Box", vfx: "Зависший электромагнит", quest: "side_vex_scrap", desc: "Опрокинутый козловой кран" },
      { id: "prop_scr_bunker", model: "warehouse_03.fbx", u: 0.3600, v: 0.4700, y: -8.0, yaw: "270°", size: "12x8x6 м, Box", vfx: "Черные россыпи антрацита", quest: "side_vex_scrap, vex", desc: "Сортировочный бункер угля" },
      { id: "prop_scr_press", model: "boiler_room.fbx", u: 0.3300, v: 0.4600, y: -9.0, yaw: "45°", size: "8x8x6 м, Box", vfx: "Скрежет гидравлических плит", quest: "Лор пакетирования", desc: "Прессовочные клети для жести" },
      { id: "prop_scr_heaps", model: "SM_RP_Rock_4m_2.fbx", u: 0.2900, v: 0.4200, y: -2.0, yaw: "60°", size: "14x14x6 м, Box", vfx: "Прессованные кубы металлолома", quest: "Укрытие в бою", desc: "Террикон пакетированного лома" },
      { id: "prop_scr_welding_post", model: "tent_01.fbx", u: 0.3500, v: 0.4150, y: -4.0, yaw: "180°", size: "6x4x3 м, Box", vfx: "Ацетиленовые баллоны, экраны", quest: "Разделка конструкций", desc: "Сварочный пост разборщиков" },
      { id: "prop_scr_minecarts", model: "PieceOfWood.fbx", u: 0.3250, v: 0.4750, y: -8.0, yaw: "90°", size: "6x2x2 м, Box", vfx: "Сошедшие с рельсов вагонетки", quest: "scrap_rail", desc: "Узкоколейный состав ломовозов" },
      { id: "prop_scr_slag_wall", model: "SM_RP_Rock_4m_5.fbx", u: 0.2750, v: 0.4400, y: -3.0, yaw: "0°", size: "12x4x5 м, Box", vfx: "Застывшая стекловидная масса шлака", quest: "slag_barrier", desc: "Бруствер шлакового отвала" },
      { id: "prop_scr_gear_heap", model: "monument_wheel.fbx", u: 0.3000, v: 0.4850, y: -7.0, yaw: "75°", size: "6x6x3 м, Cylinder", vfx: "Зубчатые венцы 3-метровых колес", quest: "salvage_parts", desc: "Куча списанных шестерен приводов" },
      { id: "prop_scr_barrel_barrier", model: "boiler.fbx", u: 0.3650, v: 0.4450, y: -6.0, yaw: "0°", size: "5x2x3 м, Box", vfx: "Пробитые бочки с дегтем", quest: "toxic_waste", desc: "Завал из бочек отработанных масел" },
      { id: "prop_scr_shredder", model: "boiler_room.fbx", u: 0.3180, v: 0.4350, y: -6.0, yaw: "180°", size: "7x6x5 м, Box", vfx: "Вращающиеся зубчатые барабаны", quest: "crusher_mechanics", desc: "Стационарный дробитель стружки" },
      { id: "prop_scr_warning_skull", model: "Plank.fbx", u: 0.3720, v: 0.4880, y: -7.0, yaw: "270°", size: "2x0.5x3 м, Box", vfx: "Знак черепа и шестерни: «Свалка»", quest: "zone_boundary", desc: "Предупреждающий щит на границе" },
      { id: "prop_scr_magnet_mast", model: "airship_mooring_mast.fbx", u: 0.2850, v: 0.4650, y: -5.0, yaw: "45°", size: "4x4x16 м, Box", vfx: "Искрящий кабельный барабан", quest: "magnet_salvage", desc: "Опорная колонна кабельной дороги" },
      { id: "prop_scr_scrap_gate", model: "sh1.fbx", u: 0.3750, v: 0.4050, y: -3.0, yaw: "90°", size: "10x4x8 м, Box", vfx: "Ворота из сваренных бронелистов", quest: "scrap_access", desc: "Входные створки Свалки N-2" }
    ]
  },
  {
    id: "western_lands",
    nameRu: "Западные земли",
    uv: [0.180, 0.400, 0.280, 0.520],
    dialogue: "«Западный транзитный каньон штормит ржавой пылью. Одичавшие гончие сбиваются в стаи...» (Страж-Автомат W-1, side_western_patrol)",
    props: [
      { id: "prop_wst_flags", model: "monument_central.fbx", u: 0.2400, v: 0.4600, y: 5.0, yaw: "0°", size: "1.5x1.5x6 м, Cylinder", vfx: "Жестяные флажки на кольях", quest: "side_western_patrol, guard_w", desc: "Сигнальные вымпелы тракта" },
      { id: "prop_wst_washers", model: "boiler.fbx", u: 0.2100, v: 0.4400, y: 8.0, yaw: "80°", size: "6x6x4 м, Box", vfx: "Смятые чугунные барабаны", quest: "side_western_patrol", desc: "Обломки стиралок-убийц" },
      { id: "prop_wst_boundary", model: "monument_wheel.fbx", u: 0.2600, v: 0.4900, y: 2.0, yaw: "180°", size: "3x3x4 м, Cylinder", vfx: "Высеченный венец Круны", quest: "Граница запада", desc: "Межевой столб Круны" },
      { id: "prop_wst_canyon", model: "SM_RP_Rock_4m_3.fbx", u: 0.1900, v: 0.4800, y: 12.0, yaw: "290°", size: "16x8x8 м, Box", vfx: "Базальтовые карнизы каньона", quest: "Защита от пыли", desc: "Скальный карниз укрытия" },
      { id: "prop_wst_watchpost", model: "sh1.fbx", u: 0.2300, v: 0.4200, y: 6.0, yaw: "45°", size: "6x6x5 м, Box", vfx: "Заколоченные амбразуры", quest: "Дозор тракта", desc: "Заброшенная сторожевая будка" },
      { id: "prop_wst_trestle", model: "SM_RP_Rock_8m_0.fbx", u: 0.2200, v: 0.4700, y: 7.0, yaw: "0°", size: "8x8x10 м, Box", vfx: "Чугунные балки в грунте", quest: "Лор разрушения", desc: "Опоры паровой эстакады" },
      { id: "prop_wst_pipe_arch", model: "boiler.fbx", u: 0.2500, v: 0.4300, y: 4.0, yaw: "90°", size: "8x3x7 м, Box", vfx: "Компенсационная петля паропровода", quest: "steam_infrastructure", desc: "Арочный переход трубы над трактом" },
      { id: "prop_wst_lantern_post", model: "monument_central.fbx", u: 0.2650, v: 0.4500, y: 3.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Керосиновый фонарь в чугунном кожухе", quest: "trail_lighting", desc: "Путевой фонарь Западного Тракта" },
      { id: "prop_wst_trailer_wreck", model: "PieceOfWood.fbx", u: 0.2050, v: 0.4950, y: 9.0, yaw: "160°", size: "5x3x2.5 м, Box", vfx: "Сломанная ось тяжелого прицепа", quest: "patrol_lore", desc: "Разбитый колесный прицеп снабжения" },
      { id: "prop_wst_rockfall", model: "SM_RP_Rock_4m_7.fbx", u: 0.1850, v: 0.4350, y: 14.0, yaw: "40°", size: "10x6x4 м, Box", vfx: "Каменный завал на повороте ущелья", quest: "canyon_hazard", desc: "Обвал базальтовых глыб каньона" },
      { id: "prop_wst_checkpoint_gate", model: "tent_02.fbx", u: 0.2700, v: 0.4100, y: 1.0, yaw: "180°", size: "7x4x4 м, Box", vfx: "Шлагбаум и навес досмотровой группы", quest: "border_control", desc: "Западный заградительный КПП" },
      { id: "prop_wst_telegraph_pole", model: "monument_wheel.fbx", u: 0.2250, v: 0.5100, y: 6.0, yaw: "0°", size: "1.5x1.5x7 м, Cylinder", vfx: "Оборванные медные провода", quest: "comms_line", desc: "Столб проводного телеграфа" }
    ]
  },
  {
    id: "lost_gardens",
    nameRu: "Затерянные Сады",
    uv: [0.520, 0.700, 0.620, 0.780],
    dialogue: "«Среди ядовитых испарений и горячего железа цветут гигантские папоротники, а в кронах гудит древняя Пасека...» (Кладовщица Искра, side_spark_gardens)",
    props: [
      { id: "prop_grd_sprinklers", model: "boiler.fbx", u: 0.5600, v: 0.7400, y: -15.0, yaw: "0°", size: "4x4x6 м, Cylinder", vfx: "Водяная пыль дистиллята", quest: "side_spark_gardens, spark", desc: "Поливные турели-спринклеры" },
      { id: "prop_grd_greenhouse", model: "sh1.fbx", u: 0.5800, v: 0.7300, y: -12.0, yaw: "45°", size: "18x12x8 м, Box", vfx: "Остов витражей, побеги плюща", quest: "side_spark_gardens", desc: "Заброшенная арочная оранжерея" },
      { id: "prop_grd_ivy_cables", model: "monument_wheel.fbx", u: 0.5400, v: 0.7200, y: -18.0, yaw: "120°", size: "6x6x4 м, Box", vfx: "Силовые кабели в древесных лозах", quest: "Аномальный биотех", desc: "Корневые сплетения кабелей" },
      { id: "prop_grd_pool", model: "tp_zone.fbx", u: 0.5700, v: 0.7600, y: -20.0, yaw: "0°", size: "10x10x1 м, Trigger", vfx: "Латунные поплавковые вентили", quest: "Сбор воды", desc: "Бассейн сбора дистиллята" },
      { id: "prop_grd_aerator", model: "boiler_room.fbx", u: 0.5900, v: 0.7500, y: -16.0, yaw: "270°", size: "6x6x5 м, Box", vfx: "Бульканье воздушных форсунок", quest: "Аэрация клумб", desc: "Паровые аэраторы почвы" },
      { id: "prop_grd_fountain", model: "monument_central.fbx", u: 0.5500, v: 0.7500, y: -17.0, yaw: "0°", size: "4x4x3 м, Cylinder", vfx: "Замшелый гранитный каскад", quest: "Декор парка", desc: "Гранитная чаша фонтана" },
      { id: "prop_grd_relic_tree", model: "tree_rt_4.fbx", u: 0.5350, v: 0.7100, y: -16.0, yaw: "0°", size: "8x8x20 м, Cylinder", vfx: "Биолюминесцентные споры в кроне", quest: "botanical_wonder", desc: "Реликтовое исполинское древо Садов" },
      { id: "prop_grd_pergola", model: "sh1.fbx", u: 0.5750, v: 0.7150, y: -14.0, yaw: "90°", size: "10x4x5 м, Box", vfx: "Кованые решетки с вьющимися розами", quest: "garden_architecture", desc: "Ажурная кованая пергола аллеи" },
      { id: "prop_grd_specimen_bench", model: "tent_01.fbx", u: 0.6050, v: 0.7350, y: -15.0, yaw: "180°", size: "5x4x3 м, Box", vfx: "Колбы, гербарии, сушильные прессы", quest: "side_spark_gardens", desc: "Полевой ботанический верстак" },
      { id: "prop_grd_manifold", model: "boiler.fbx", u: 0.5450, v: 0.7650, y: -19.0, yaw: "315°", size: "4x4x4 м, Box", vfx: "Разводка медных оросительных трубок", quest: "irrigation_system", desc: "Распределительный коллектор полива" },
      { id: "prop_grd_stone_bench", model: "SM_RP_Rock_2m_4.fbx", u: 0.5650, v: 0.7250, y: -15.0, yaw: "45°", size: "3x1x1 м, Box", vfx: "Резная каменная скамья с орнаментом", quest: "park_amenity", desc: "Парковая скамья Создателей" },
      { id: "prop_grd_lantern", model: "monument_central.fbx", u: 0.6000, v: 0.7700, y: -18.0, yaw: "0°", size: "1.5x1.5x4.5 м, Cylinder", vfx: "Зеленоватый свет масляного пламени", quest: "garden_lights", desc: "Фонарный столб Садовой аллеи" }
    ]
  },
  {
    id: "apiary",
    nameRu: "Пасека",
    uv: [0.580, 0.760, 0.660, 0.840],
    dialogue: "«Мех-пчёлы герметизируют соты уникальным органическим воском. Это чудо не должно погибнуть от замыкания...» (Кладовщица Искра, side_spark_gardens)",
    props: [
      { id: "prop_api_hives", model: "boiler.fbx", u: 0.6200, v: 0.8000, y: -22.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Автоклавы с сотовыми сетками", quest: "side_spark_gardens, spark", desc: "Котловые Ульи на треногах" },
      { id: "prop_api_press", model: "boiler_room.fbx", u: 0.6000, v: 0.7800, y: -20.0, yaw: "90°", size: "8x8x6 м, Box", vfx: "Поддоны с желтым восковым лаком", quest: "side_spark_gardens", desc: "Воскоотделительный пресс" },
      { id: "prop_api_pier", model: "tent_01.fbx", u: 0.6400, v: 0.8200, y: -33.0, yaw: "180°", size: "6x10x3 м, Box", vfx: "Бочки с медовым дистиллятом", quest: "Погрузка воска", desc: "Причал лодочника" },
      { id: "prop_api_racks", model: "warehouse_01.fbx", u: 0.6100, v: 0.7900, y: -21.0, yaw: "45°", size: "10x6x4 м, Box", vfx: "Стеллажи для сушки пластин", quest: "Производство изоляторов", desc: "Стеллажи сушки воска" },
      { id: "prop_api_stump", model: "StumpWithMushroom.fbx", u: 0.6100, v: 0.7700, y: -18.0, yaw: "35°", size: "2x2x2 м, Cylinder", vfx: "Колония грибов-трутовиков", quest: "Ориентир тропы", desc: "Замшелый пень у развилки" },
      { id: "prop_api_bollards", model: "monument_central.fbx", u: 0.6350, v: 0.8150, y: -32.0, yaw: "0°", size: "1x1x2 м, Cylinder", vfx: "Чугунные швартовые кнехты", quest: "Фиксация лодок", desc: "Причальные тумбы пирса" },
      { id: "prop_api_smoker_tower", model: "airship_mooring_mast.fbx", u: 0.5900, v: 0.7950, y: -20.0, yaw: "0°", size: "3x3x10 м, Box", vfx: "Травяной густой дым окуривания", quest: "bee_handling", desc: "Паровая дымокурня усмирения роя" },
      { id: "prop_api_wax_cistern", model: "boiler.fbx", u: 0.6300, v: 0.7850, y: -23.0, yaw: "120°", size: "5x5x4 м, Cylinder", vfx: "Подогреваемый чан расплавленного воска", quest: "wax_processing", desc: "Бак термоизоляционного компаунда" },
      { id: "prop_api_honeycombs", model: "Plank.fbx", u: 0.6150, v: 0.8100, y: -24.0, yaw: "90°", size: "4x1x2 м, Box", vfx: "Шестигранные латунные сотовые рамки", quest: "side_spark_gardens", desc: "Кассеты сбора медовых сот" },
      { id: "prop_api_fence_gate", model: "sh1.fbx", u: 0.5950, v: 0.7650, y: -19.0, yaw: "135°", size: "8x2x5 м, Box", vfx: "Деревянная ограда с проволочной сеткой", quest: "apiary_perimeter", desc: "Защитные ворота Пасеки" },
      { id: "prop_api_shed", model: "house_01.fbx", u: 0.6450, v: 0.7950, y: -26.0, yaw: "270°", size: "8x7x6 м, Box", vfx: "Склад инвентаря и защитных сеток", quest: "beekeeper_tools", desc: "Хижина старшего пасечника" },
      { id: "prop_api_water_trough", model: "PieceOfWood.fbx", u: 0.6050, v: 0.8250, y: -28.0, yaw: "0°", size: "4x1.5x1 м, Box", vfx: "Корыто со свежей водой для пчел", quest: "bee_watering", desc: "Поилка с поплавковыми плотиками" }
    ]
  },
  {
    id: "cruna_yards",
    nameRu: "Дворы Круны",
    uv: [0.100, 0.320, 0.180, 0.420],
    dialogue: "«Слышишь этот треск с востока? Во Дворах Круны взбесились кухонные электроплиты-шкварки...» (Кузнец Кран, side_cruna_forges)",
    props: [
      { id: "prop_cru_stoves", model: "forge_02.fbx", u: 0.1400, v: 0.3600, y: 25.0, yaw: "0°", size: "5x5x4 м, Box", vfx: "Раскаленные спирали ТЭНов", quest: "side_cruna_forges, kran", desc: "Электроплиты-шкварки" },
      { id: "prop_cru_terrace", model: "SM_RP_Rock_8m_3.fbx", u: 0.1200, v: 0.3400, y: 35.0, yaw: "90°", size: "20x20x8 м, Box", vfx: "Каменная терраса Смотрителя", quest: "epic_seven_cores", desc: "Терраса Смотрителя Круны" },
      { id: "prop_cru_crane", model: "airship_mooring_mast.fbx", u: 0.1150, v: 0.3350, y: 37.0, yaw: "45°", size: "4x4x14 м, Box", vfx: "Подъемный кран на террасе", quest: "Подача руды", desc: "Стационарный поворотный кран" },
      { id: "prop_cru_storage", model: "warehouse_04.fbx", u: 0.1600, v: 0.3800, y: 20.0, yaw: "180°", size: "14x10x7 м, Box", vfx: "Склады листовой жаропрочной стали", quest: "side_cruna_forges", desc: "Склады сортовой стали" },
      { id: "prop_cru_furnace", model: "forge_03.fbx", u: 0.1300, v: 0.3800, y: 22.0, yaw: "270°", size: "6x6x7 м, Box", vfx: "Пламя на антраците, кокс", quest: "Выплавка D-сплавов", desc: "Уличный кузнечный горн" },
      { id: "prop_cru_quenching", model: "boiler.fbx", u: 0.1500, v: 0.3700, y: 23.0, yaw: "0°", size: "4x6x3 м, Box", vfx: "Масляные ванны для закалки", quest: "Оружейное ремесло", desc: "Закалочные ванны клинков" },
      { id: "prop_cru_ingot_stacks", model: "Plank.fbx", u: 0.1450, v: 0.3950, y: 21.0, yaw: "90°", size: "5x3x2 м, Box", vfx: "Штабели титановых и стальных чушек", quest: "side_cruna_forges", desc: "Склад слитков редкого сплава" },
      { id: "prop_cru_shear_press", model: "boiler_room.fbx", u: 0.1650, v: 0.3550, y: 26.0, yaw: "180°", size: "7x6x5 м, Box", vfx: "Тяжелые гильотинные ножи по металлу", quest: "metal_cutting", desc: "Гильотинные ножницы раскроя листов" },
      { id: "prop_cru_smelt_chimney", model: "airship_mooring_mast.fbx", u: 0.1250, v: 0.3900, y: 24.0, yaw: "0°", size: "3x3x16 м, Cylinder", vfx: "Оранжевый сноп искр из трубы", quest: "smelting_complex", desc: "Труба главного плавильного горна" },
      { id: "prop_cru_master_anvil", model: "monument_wheel.fbx", u: 0.1350, v: 0.3450, y: 30.0, yaw: "45°", size: "3x3x2 м, Box", vfx: "Трехтонная наковальня на дубовом кряже", quest: "master_smith", desc: "Центральная наковальня Дворов" },
      { id: "prop_cru_yard_gate", model: "sh1.fbx", u: 0.1700, v: 0.3300, y: 28.0, yaw: "270°", size: "12x4x8 м, Box", vfx: "Кованые ворота с гербом Круны", quest: "cruna_access", desc: "Ворота Нижнего Двора" },
      { id: "prop_cru_slag_trough", model: "PieceOfWood.fbx", u: 0.1550, v: 0.4050, y: 19.0, yaw: "60°", size: "8x2x1.5 м, Box", vfx: "Каменный желоб слива шлака", quest: "slag_disposal", desc: "Канал отвода горячего шлака" },
      { id: "prop_cru_hoist_gantry", model: "airship_mooring_mast.fbx", u: 0.1080, v: 0.3600, y: 32.0, yaw: "90°", size: "4x8x10 м, Box", vfx: "Цепные тали для тиглей", quest: "crucible_lift", desc: "Тельферная балка подачи кокса" },
      { id: "prop_cru_water_vat", model: "boiler.fbx", u: 0.1380, v: 0.3750, y: 23.0, yaw: "0°", size: "4x4x3 м, Cylinder", vfx: "Клубы пара при опускании раскала", quest: "water_quench", desc: "Чан водяного охлаждения поковок" }
    ]
  },
  {
    id: "quiet_backwater",
    nameRu: "Тихая заводь",
    uv: [0.080, 0.750, 0.200, 0.880],
    dialogue: "«В Тихой заводи береговой цех дал сбой и на волю вырвался Автономный Пресс-Молот...» (Инспектор Гилберт, bounty_press_hammer)",
    props: [
      { id: "prop_bkw_dock", model: "boiler_room.fbx", u: 0.1400, v: 0.8200, y: -30.0, yaw: "0°", size: "26x18x12 м, Box", vfx: "Стапель с титановым штоком", quest: "bounty_press_hammer", desc: "Главный Сухой Док штамповки" },
      { id: "prop_bkw_dreadnought", model: "warehouse_05.fbx", u: 0.1100, v: 0.8000, y: -34.0, yaw: "320°", size: "35x12x10 м, Box", vfx: "Затопленный корпус корабля", quest: "Лор военной верфи", desc: "Остов дредноута «Титан Реки»" },
      { id: "prop_bkw_cranes", model: "airship_mooring_mast.fbx", u: 0.1700, v: 0.8400, y: -25.0, yaw: "90°", size: "8x8x16 м, Box", vfx: "Портальные фермы эстакады", quest: "Погрузочные механизмы", desc: "Краны-пауки доковой эстакады" },
      { id: "prop_bkw_beacon", model: "monument_central.fbx", u: 0.1500, v: 0.7700, y: -28.0, yaw: "0°", size: "3x3x8 м, Cylinder", vfx: "Зеленый створный огонь", quest: "Навигация бухты", desc: "Прибрежный маяк швартовки" },
      { id: "prop_bkw_slipways", model: "PieceOfWood.fbx", u: 0.1300, v: 0.8100, y: -32.0, yaw: "115°", size: "12x4x2 м, Box", vfx: "Прогнившие кильблоки стапелей", quest: "Лор верфи", desc: "Разрушенные стапели" },
      { id: "prop_bkw_chains", model: "SM_RP_Rock_4m_4.fbx", u: 0.1600, v: 0.8300, y: -27.0, yaw: "45°", size: "5x5x3 м, Box", vfx: "Швартовые тумбы и цепи", quest: "Крепление судов", desc: "Якорные цепи и тумбы" },
      { id: "prop_bkw_diver_rig", model: "boiler.fbx", u: 0.1250, v: 0.8400, y: -33.0, yaw: "180°", size: "4x4x4 м, Box", vfx: "Воздушные шланги водолазов", quest: "underwater_salvage", desc: "Водолазная станция откачки трюмов" },
      { id: "prop_bkw_floodgate", model: "sh1.fbx", u: 0.1800, v: 0.7900, y: -29.0, yaw: "270°", size: "14x4x8 м, Box", vfx: "Ворота батопорта дока", quest: "drydock_gate", desc: "Затвор шлюзовой камеры" },
      { id: "prop_bkw_fog_bell", model: "monument_wheel.fbx", u: 0.0950, v: 0.7750, y: -31.0, yaw: "0°", size: "2x2x5 м, Cylinder", vfx: "Бронзовый туманный колокол", quest: "fog_signaling", desc: "Колокольня туманного оповещения" },
      { id: "prop_bkw_timber_raft", model: "Log_1.fbx", u: 0.1450, v: 0.8600, y: -34.8, yaw: "30°", size: "10x6x1 м, Box", vfx: "Связанные бревна лиственницы", quest: "shipbuilding_wood", desc: "Плот судостроительного леса" },
      { id: "prop_bkw_pump_house", model: "boiler_room.fbx", u: 0.1650, v: 0.8100, y: -28.0, yaw: "90°", size: "8x6x5 м, Box", vfx: "Трубы откачки морской воды", quest: "dock_drainage", desc: "Насосная станция осушения дока" },
      { id: "prop_bkw_bollard_row", model: "SM_RP_Rock_2m_5.fbx", u: 0.1150, v: 0.8350, y: -32.5, yaw: "0°", size: "2x2x2 м, Box", vfx: "Литые тумбы со звеньями якорных цепей", quest: "harbor_dressing", desc: "Ряд швартовных тумб набережной" }
    ]
  },
  {
    id: "field_of_oblivion",
    nameRu: "Поле забвения",
    uv: [0.300, 0.180, 0.480, 0.320],
    dialogue: "«Разведывательный дозор капитана Рездика перестал выходить на связь по пути к передовым Баракам...» (Инспектор Гилберт, side_gilbert_watch)",
    props: [
      { id: "prop_obl_gears", model: "monument_wheel.fbx", u: 0.3800, v: 0.2400, y: 10.0, yaw: "45°", size: "10x10x3 м, Cylinder", vfx: "Вросшие зубчатые колеса в траве", quest: "Лор великой битвы", desc: "Шестерни в десять шагов" },
      { id: "prop_obl_walkers", model: "boiler.fbx", u: 0.3500, v: 0.2600, y: 8.0, yaw: "110°", size: "8x8x7 м, Box", vfx: "Раздробленные буровые лапы", quest: "side_gilbert_watch", desc: "Остовы шагоходов-экстракторов" },
      { id: "prop_obl_crater", model: "SM_RP_Rock_8m_4.fbx", u: 0.4200, v: 0.2200, y: 5.0, yaw: "0°", size: "20x20x5 м, Box", vfx: "Оплавленные кромки разрыва", quest: "Взрыв паропровода", desc: "Воронка детонации котла" },
      { id: "prop_obl_trench", model: "Log_2.fbx", u: 0.4400, v: 0.2800, y: 12.0, yaw: "85°", size: "25x3x2 м, Box", vfx: "Обгоревшие бревна настила", quest: "Окопы Синдиката", desc: "Стрелковый окоп рубежа" },
      { id: "prop_obl_obelisk", model: "monument_central.fbx", u: 0.3300, v: 0.2000, y: 14.0, yaw: "0°", size: "3x3x10 м, Cylinder", vfx: "Плиты с именами павших бойцов", quest: "side_fallen_memory", desc: "Стела разведчикам Рездика" },
      { id: "prop_obl_fence", model: "SM_RP_Rock_2m_3.fbx", u: 0.4600, v: 0.2500, y: 9.0, yaw: "0°", size: "12x2x2 м, Box", vfx: "Ржавая колючая проволока", quest: "Барьеры поля", desc: "Линия противопехотных ежей" },
      { id: "prop_obl_burned_wagon", model: "PieceOfWood.fbx", u: 0.3950, v: 0.2900, y: 7.0, yaw: "140°", size: "5x3x2.5 м, Box", vfx: "Обгоревший кузов обозного фургона", quest: "side_gilbert_watch", desc: "Сгоревший обоз снабжения" },
      { id: "prop_obl_shrapnel_rock", model: "SM_RP_Rock_4m_8.fbx", u: 0.3200, v: 0.2700, y: 9.0, yaw: "25°", size: "6x5x4 м, Box", vfx: "Глыба, иссеченная осколками снарядов", quest: "battle_debris", desc: "Иссеченная шрапнелью скала" },
      { id: "prop_obl_minefield_sign", model: "Plank.fbx", u: 0.4100, v: 0.1950, y: 11.0, yaw: "0°", size: "2x0.5x2.5 м, Box", vfx: "Предупреждение о фугасах", quest: "danger_zone", desc: "Щит минного заграждения" },
      { id: "prop_obl_standards", model: "monument_wheel.fbx", u: 0.3600, v: 0.2200, y: 12.0, yaw: "180°", size: "2x2x6 м, Cylinder", vfx: "Изодранные штандарты на чугунных пиках", quest: "fallen_legion", desc: "Сломанный стяг 4-й роты" },
      { id: "prop_obl_track_links", model: "Log_4.fbx", u: 0.3400, v: 0.3000, y: 6.0, yaw: "60°", size: "8x2x1 м, Box", vfx: "Разорванная гусеничная лента танкетки", quest: "machine_wreck", desc: "Гусеница тяжелого бронехода" },
      { id: "prop_obl_ammo_boxes", model: "warehouse_01.fbx", u: 0.4500, v: 0.2100, y: 10.0, yaw: "270°", size: "6x4x3 м, Box", vfx: "Вскрытые цинки со снарядами", quest: "ammo_dump", desc: "Полевой артиллерийский погреб" },
      { id: "prop_obl_signal_flare", model: "monument_central.fbx", u: 0.4700, v: 0.3000, y: 8.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Ржавая сигнальная мортирка", quest: "last_signal", desc: "Одиночный сигнальный стакан" },
      { id: "prop_obl_armor_plate", model: "Plank.fbx", u: 0.3700, v: 0.2750, y: 8.5, yaw: "115°", size: "4x2x0.5 м, Box", vfx: "Пробитый бронелист 80мм", quest: "side_gilbert_watch", desc: "Бронеплита с эмблемой Синдиката" }
    ]
  },
  {
    id: "fallen_monument",
    nameRu: "Памятник павшим",
    uv: [0.480, 0.150, 0.600, 0.260],
    dialogue: "«В Книге Памяти три тысячи фамилий...» (Архивист Элиас, side_fallen_memory)",
    props: [
      { id: "prop_fal_monument", model: "monument_wheel.fbx", u: 0.5400, v: 0.2000, y: 22.0, yaw: "0°", size: "14x14x16 м, Cylinder", vfx: "Золоченые зубья Колеса Памяти", quest: "side_fallen_memory, elias", desc: "Великое Колесо Памяти Павших" },
      { id: "prop_fal_flame", model: "boiler.fbx", u: 0.5350, v: 0.2050, y: 22.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Голубой факел сгорающего газа", quest: "Вечный огонь", desc: "Котловой Вечный Огонь" },
      { id: "prop_fal_arches", model: "sh1.fbx", u: 0.5200, v: 0.1800, y: 20.0, yaw: "90°", size: "18x6x12 м, Box", vfx: "Барельефы солдат и инженеров", quest: "Триумф Синдиката", desc: "Триумфальная Портальная Арка" },
      { id: "prop_fal_slabs", model: "monument_central.fbx", u: 0.5550, v: 0.2200, y: 21.0, yaw: "45°", size: "2x8x4 м, Box", vfx: "Гравированные списки дивизий", quest: "side_fallen_memory", desc: "Мемориальные чугунные плиты" },
      { id: "prop_fal_urns", model: "boiler_room.fbx", u: 0.5100, v: 0.2300, y: 19.0, yaw: "0°", size: "3x3x4 м, Cylinder", vfx: "Аромат кедрового масла", quest: "Обряд памяти", desc: "Жертвенные чаши Синдиката" },
      { id: "prop_fal_benches", model: "Plank.fbx", u: 0.5700, v: 0.1700, y: 18.0, yaw: "135°", size: "6x2x1 м, Box", vfx: "Полированные гранитные плиты", quest: "Место покоя", desc: "Каменные скамьи ветеранов" },
      { id: "prop_fal_flagpole_avenue", model: "airship_mooring_mast.fbx", u: 0.5050, v: 0.1700, y: 18.0, yaw: "0°", size: "3x3x18 м, Box", vfx: "Траурные знамена Синдиката", quest: "memorial_avenue", desc: "Флагшток Парадной Аллеи" },
      { id: "prop_fal_bell_canopy", model: "chapel.fbx", u: 0.5650, v: 0.2350, y: 20.0, yaw: "180°", size: "8x8x12 м, Box", vfx: "Медленный погребальный звон", quest: "bell_of_sorrow", desc: "Колокольня Скорби" },
      { id: "prop_fal_braziers", model: "forge_01.fbx", u: 0.5250, v: 0.2150, y: 21.0, yaw: "90°", size: "3x3x4 м, Box", vfx: "Жаровни с тлеющим ладаном и углями", quest: "vigil_fires", desc: "Поминальная жаровня эспланады" },
      { id: "prop_fal_stele_7th", model: "monument_central.fbx", u: 0.5480, v: 0.1650, y: 19.0, yaw: "0°", size: "2x2x6 м, Cylinder", vfx: "Барельеф 7-го механизированного полка", quest: "regiment_7", desc: "Обелиск славы 7-го полка" },
      { id: "prop_fal_wreath_podium", model: "SM_RP_Rock_2m_0.fbx", u: 0.5380, v: 0.1900, y: 21.5, yaw: "0°", size: "4x4x1 м, Box", vfx: "Бронзовые венки с шестернями", quest: "wreath_ceremony", desc: "Постамент возложения венков" },
      { id: "prop_fal_perimeter_wall", model: "SM_RP_Rock_4m_1.fbx", u: 0.5850, v: 0.2450, y: 17.0, yaw: "45°", size: "12x3x3 м, Box", vfx: "Гранитный парапет мемориального парка", quest: "park_boundary", desc: "Ограждающая стена мемориала" }
    ]
  },
  {
    id: "rezdiq_barracks",
    nameRu: "Бараки Рездика",
    uv: [0.320, 0.080, 0.480, 0.180],
    dialogue: "«Если броня дала трещину — вари намертво прямо на бойце...» (Капитан Рездик, side_rezdik_iron)",
    props: [
      { id: "prop_rez_hq", model: "house_engineer_04.fbx", u: 0.4000, v: 0.1200, y: 35.0, yaw: "180°", size: "16x12x10 м, Box", vfx: "Стальные жалюзи, трубы отопления", quest: "side_rezdik_iron, rezdik", desc: "Штабной Бункер Рездика" },
      { id: "prop_rez_armory", model: "warehouse_04.fbx", u: 0.4300, v: 0.1400, y: 32.0, yaw: "90°", size: "14x8x7 м, Box", vfx: "Ящики с затворами и патронами", quest: "Снабжение гарнизона", desc: "Фронтовой склад боеприпасов" },
      { id: "prop_rez_boiler", model: "boiler.fbx", u: 0.3800, v: 0.1100, y: 36.0, yaw: "0°", size: "6x6x8 м, Cylinder", vfx: "Перегретый пар, вой свистка", quest: "Обогрев высоты", desc: "Главный Котёл цитадели Рездика" },
      { id: "prop_rez_gate", model: "sh1.fbx", u: 0.4100, v: 0.1600, y: 28.0, yaw: "0°", size: "14x4x9 м, Box", vfx: "Двойная решетка на цепях", quest: "Штурмовой рубеж", desc: "Баррикадные ворота Бараков" },
      { id: "prop_rez_tower", model: "airship_mooring_mast.fbx", u: 0.4500, v: 0.1000, y: 40.0, yaw: "45°", size: "4x4x18 м, Box", vfx: "Паровой прожектор на мачте", quest: "Дозор севера", desc: "Вышка оптического дозора" },
      { id: "prop_rez_barricades", model: "SM_RP_Rock_4m_1.fbx", u: 0.3600, v: 0.1500, y: 30.0, yaw: "120°", size: "10x4x4 м, Box", vfx: "Сваренные рельсы, мешки с песком", quest: "Оборона Рездика", desc: "Противоштурмовой вал" },
      { id: "prop_rez_barracks_dorm", model: "house_05.fbx", u: 0.3700, v: 0.1350, y: 34.0, yaw: "90°", size: "12x8x7 м, Box", vfx: "Двухъярусные койки, печки-буржуйки", quest: "soldier_quarters", desc: "Казарма стрелкового батальона" },
      { id: "prop_rez_repair_forge", model: "forge_02.fbx", u: 0.4200, v: 0.1150, y: 36.0, yaw: "270°", size: "8x8x6 м, Box", vfx: "Электросварка, искры заклепочников", quest: "side_rezdik_iron", desc: "Полевая ремонтная кузница" },
      { id: "prop_rez_coal_bunker", model: "warehouse_03.fbx", u: 0.3900, v: 0.0950, y: 38.0, yaw: "0°", size: "10x6x5 м, Box", vfx: "Горы черного кардиффского антрацита", quest: "coal_supply", desc: "Угольный бункер котлов" },
      { id: "prop_rez_mess_tent", model: "tent_04.fbx", u: 0.4400, v: 0.1300, y: 33.0, yaw: "180°", size: "8x6x4 м, Box", vfx: "Полевые кухни, термосы с чаем", quest: "garrison_mess", desc: "Столовая палатка гарнизона" },
      { id: "prop_rez_signal_mortar", model: "monument_central.fbx", u: 0.4600, v: 0.1150, y: 37.0, yaw: "0°", size: "2x2x4 м, Cylinder", vfx: "Тяжелая сигнальная мортира связи", quest: "cliff_comms", desc: "Мортира связи с Утёсом Стали" },
      { id: "prop_rez_trench_vent", model: "boiler_room.fbx", u: 0.3500, v: 0.1250, y: 32.0, yaw: "45°", size: "5x4x4 м, Box", vfx: "Теплый пар из вентиляционной шахты", quest: "bunker_vent", desc: "Шахта вентиляции подземных складов" },
      { id: "prop_rez_perimeter_wire", model: "Log_3.fbx", u: 0.3400, v: 0.1650, y: 27.0, yaw: "15°", size: "15x2x2 м, Box", vfx: "Колья с натянутой колючей проволокой", quest: "perimeter_defense", desc: "Внешнее проволочное заграждение" },
      { id: "prop_rez_officer_post", model: "sh1.fbx", u: 0.4250, v: 0.1550, y: 29.0, yaw: "0°", size: "6x5x5 м, Box", vfx: "Караульное помещение дежурного офицера", quest: "sentry_duty", desc: "Караульный пост №1" }
    ]
  },
  {
    id: "steel_limit_fort",
    nameRu: "Крепость стального предела",
    uv: [0.600, 0.300, 0.750, 0.450],
    dialogue: "«Ворота Предела закрыты со времён Великого Разлома. Шестерни заклинило намертво...» (Страж Бастиона, side_steel_limit)",
    props: [
      { id: "prop_lim_keep", model: "house_engineer_06.fbx", u: 0.6800, v: 0.3800, y: 28.0, yaw: "0°", size: "24x20x18 м, Box", vfx: "Зубчатые парапеты, бронеколпаки", quest: "side_steel_limit", desc: "Цитадель Стального Предела" },
      { id: "prop_lim_gate", model: "sh1.fbx", u: 0.6300, v: 0.3500, y: 22.0, yaw: "90°", size: "18x6x12 м, Box", vfx: "Многотонная гермоплита на шестернях", quest: "side_steel_limit", desc: "Великие Бастионные Ворота" },
      { id: "prop_lim_catapult", model: "airship_mooring_mast.fbx", u: 0.7100, v: 0.4000, y: 32.0, yaw: "315°", size: "10x6x12 м, Box", vfx: "Противовесы и стальные тросы", quest: "Осадная артиллерия", desc: "Паровой тяжелый баллистический кран" },
      { id: "prop_lim_walls", model: "SM_RP_Rock_8m_0.fbx", u: 0.6500, v: 0.3200, y: 25.0, yaw: "0°", size: "30x6x10 м, Box", vfx: "Титановые пластины на кладке", quest: "Стены Предела", desc: "Бастионная стена Восточного рубежа" },
      { id: "prop_lim_forge", model: "forge_01.fbx", u: 0.7000, v: 0.3600, y: 26.0, yaw: "180°", size: "10x8x7 м, Box", vfx: "Ремонт осадных щитов", quest: "Гарнизон Предела", desc: "Арсенальная кузница цитадели" },
      { id: "prop_lim_bunker_shaft", model: "boiler_room.fbx", u: 0.6700, v: 0.4200, y: 25.0, yaw: "45°", size: "8x8x6 м, Box", vfx: "Гул глубинных турбин из шахты", quest: "Тайны Предела", desc: "Нисходящий ствол Бункера" },
      { id: "prop_lim_searchlight", model: "airship_mooring_mast.fbx", u: 0.6200, v: 0.3300, y: 24.0, yaw: "45°", size: "4x4x16 м, Box", vfx: "Мощный луч дугового прожектора", quest: "night_watch", desc: "Угловая дозорная башня с прожектором" },
      { id: "prop_lim_generator", model: "boiler.fbx", u: 0.7300, v: 0.3900, y: 30.0, yaw: "90°", size: "7x6x6 м, Box", vfx: "Гул генератора высокого напряжения", quest: "power_grid", desc: "Турбогенераторная подстанция" },
      { id: "prop_lim_outer_abatis", model: "Log_1.fbx", u: 0.6100, v: 0.3700, y: 20.0, yaw: "120°", size: "14x3x2 м, Box", vfx: "Заостренные бревна с железными шипами", quest: "perimeter_defense", desc: "Засека перед главным рвом" },
      { id: "prop_lim_cistern", model: "boiler.fbx", u: 0.6900, v: 0.3400, y: 27.0, yaw: "0°", size: "6x6x7 м, Cylinder", vfx: "Запас пресной воды на случай осады", quest: "siege_supplies", desc: "Крепостной резервуар воды" },
      { id: "prop_lim_weapon_lockers", model: "warehouse_04.fbx", u: 0.6600, v: 0.3900, y: 26.0, yaw: "270°", size: "8x6x5 м, Box", vfx: "Шкафы с тяжелыми осадными арбалетами", quest: "armory_vault", desc: "Оружейный склад бастиона" },
      { id: "prop_lim_checkpoint_shack", model: "house_01.fbx", u: 0.6150, v: 0.3450, y: 21.0, yaw: "90°", size: "6x5x5 м, Box", vfx: "Помещение коменданта внешнего дозора", quest: "outer_checkpoint", desc: "Внешний досмотровый пост" },
      { id: "prop_lim_signal_horn", model: "monument_central.fbx", u: 0.6400, v: 0.4300, y: 27.0, yaw: "0°", size: "2x2x6 м, Cylinder", vfx: "Бронзовый паровой горн тревоги", quest: "alert_horn", desc: "Башенный сигнальный горн" },
      { id: "prop_lim_moat_rocks", model: "SM_RP_Rock_4m_2.fbx", u: 0.6250, v: 0.3800, y: 18.0, yaw: "30°", size: "12x6x4 м, Box", vfx: "Отвесные скальные стенки сухого рва", quest: "moat_defense", desc: "Эскарп крепостного рва" }
    ]
  },
  {
    id: "eastern_range",
    nameRu: "Восточный полигон",
    uv: [0.560, 0.440, 0.700, 0.580],
    dialogue: "«Здесь испытывали новые бронебойные снаряды калибра 152 миллиметра...» (Инспектор Гилберт, main_02_perimeter)",
    props: [
      { id: "prop_eas_targets", model: "SM_RP_Rock_4m_2.fbx", u: 0.6400, v: 0.5200, y: 0.0, yaw: "45°", size: "12x6x5 м, Box", vfx: "Пробитые титановые мишени", quest: "Испытание орудий", desc: "Мишенные бронещиты Полигона" },
      { id: "prop_eas_hangar", model: "warehouse_05.fbx", u: 0.5900, v: 0.4700, y: -5.0, yaw: "90°", size: "16x12x8 м, Box", vfx: "Ящики со снарядами, лебедки", quest: "Снаряжение орудий", desc: "Артиллерийский склад полигона" },
      { id: "prop_eas_rig", model: "boiler_room.fbx", u: 0.6700, v: 0.5000, y: 2.0, yaw: "0°", size: "10x8x6 м, Box", vfx: "Гидравлические демпферы отката", quest: "Станок 152-мм", desc: "Стенд испытания лафетов" },
      { id: "prop_eas_vault", model: "sh1.fbx", u: 0.6100, v: 0.5500, y: -2.0, yaw: "180°", size: "14x10x6 м, Box", vfx: "Толстые бетонные своды", quest: "Хранилище пороха", desc: "Пороховой погреб особой защиты" },
      { id: "prop_eas_milestones", model: "monument_central.fbx", u: 0.6200, v: 0.4900, y: -3.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Отметки дистанции: 500, 1000м", quest: "Баллистика", desc: "Мерные столбы дистанции стрельбы" },
      { id: "prop_eas_shelter", model: "tent_03.fbx", u: 0.5800, v: 0.5100, y: -7.0, yaw: "270°", size: "6x4x3 м, Box", vfx: "Смотровые щели с бронестеклом", quest: "Безопасность", desc: "Блиндаж наблюдателей стрельб" },
      { id: "prop_eas_firing_bench", model: "Plank.fbx", u: 0.6000, v: 0.4600, y: -6.0, yaw: "90°", size: "8x2x1.2 м, Box", vfx: "Упоры для станковых пулеметов", quest: "small_arms_test", desc: "Стрелковый стол стрелкового тира" },
      { id: "prop_eas_penetration_slab", model: "SM_RP_Rock_8m_1.fbx", u: 0.6600, v: 0.5400, y: 4.0, yaw: "0°", size: "10x4x8 м, Box", vfx: "Оплавленные кумулятивные воронки", quest: "armor_pierce_test", desc: "Плита замера глубины пробития" },
      { id: "prop_eas_shell_dump", model: "PieceOfWood.fbx", u: 0.6250, v: 0.4750, y: -4.0, yaw: "135°", size: "5x4x2 м, Box", vfx: "Латунные гильзы полуметровой длины", quest: "spent_casings", desc: "Отвал стреляных гильз калибра 152мм" },
      { id: "prop_eas_warning_flags", model: "monument_wheel.fbx", u: 0.5700, v: 0.4500, y: -8.0, yaw: "0°", size: "1.5x1.5x6 м, Cylinder", vfx: "Красные флаги боевой стрельбы", quest: "range_safety", desc: "Мачта предупредительных флагов" },
      { id: "prop_eas_chronograph_tower", model: "airship_mooring_mast.fbx", u: 0.6500, v: 0.4850, y: 1.0, yaw: "45°", size: "3x3x12 м, Box", vfx: "Оптические фотостворы замера скорости", quest: "ballistic_chrono", desc: "Баллистическая вышка хронографа" },
      { id: "prop_eas_field_telephone", model: "monument_central.fbx", u: 0.5900, v: 0.5300, y: -5.0, yaw: "0°", size: "1x1x3 м, Cylinder", vfx: "Чугунный ящик полевого телефона", quest: "range_comms", desc: "Телефонная будка связи с позициями" }
    ]
  },
  {
    id: "chem_ruins",
    nameRu: "Руины химзавода",
    uv: [0.620, 0.580, 0.760, 0.720],
    dialogue: "«Насосы химзавода треснули сорок лет назад. Кислота выжгла всю траву до самого берега...» (Кладовщица Искра, side_spark_gardens)",
    props: [
      { id: "prop_chm_reactor", model: "boiler.fbx", u: 0.6900, v: 0.6500, y: -18.0, yaw: "45°", size: "12x12x14 м, Cylinder", vfx: "Зеленый едкий дым, подтеки серы", quest: "side_spark_gardens", desc: "Разрушенный Главный Реактор" },
      { id: "prop_chm_pipes", model: "boiler_room.fbx", u: 0.6600, v: 0.6200, y: -20.0, yaw: "180°", size: "18x6x6 м, Box", vfx: "Свистящие свищи серной кислоты", quest: "Химическая магистраль", desc: "Трубопровод агрессивных сред" },
      { id: "prop_chm_tanks", model: "boiler.fbx", u: 0.7200, v: 0.6700, y: -15.0, yaw: "0°", size: "8x8x10 м, Cylinder", vfx: "Ржавые заклепки, ядовитые испарения", quest: "Склад реагентов", desc: "Баки-хранилища катализатора" },
      { id: "prop_chm_sump", model: "tp_zone.fbx", u: 0.6800, v: 0.6900, y: -25.0, yaw: "0°", size: "14x14x1 м, Trigger", vfx: "Флуоресцирующая изумрудная жижа", quest: "Кислотный отстойник", desc: "Бассейн нейтрализации стоков" },
      { id: "prop_chm_lab", model: "house_engineer_05.fbx", u: 0.6400, v: 0.6000, y: -16.0, yaw: "90°", size: "14x10x8 м, Box", vfx: "Разбитые колбы, обугленные стены", quest: "Лаборатория синтеза", desc: "Корпус аналитических лабораторий" },
      { id: "prop_chm_culvert", model: "SM_RP_Rock_4m_0.fbx", u: 0.7400, v: 0.6400, y: -22.0, yaw: "270°", size: "10x6x4 м, Box", vfx: "Желтые наплывы кристаллической серы", quest: "Сбросной канал", desc: "Сбросной коллектор в залив" },
      { id: "prop_chm_barrels", model: "PieceOfWood.fbx", u: 0.6700, v: 0.6350, y: -19.0, yaw: "60°", size: "5x3x2 м, Box", vfx: "Разъеденные кислотой бочки с маркировкой", quest: "toxic_spill", desc: "Штабель протекших емкостей с реагентом" },
      { id: "prop_chm_neutralizer", model: "boiler_room.fbx", u: 0.7050, v: 0.6300, y: -17.0, yaw: "180°", size: "7x6x5 м, Box", vfx: "Белая известковая пыль дозаторов", quest: "neutralizer_station", desc: "Узел дозирования гашеной извести" },
      { id: "prop_chm_vent_stacks", model: "airship_mooring_mast.fbx", u: 0.7150, v: 0.6950, y: -16.0, yaw: "0°", size: "3x3x16 м, Cylinder", vfx: "Ржавая вытяжная труба с дефлектором", quest: "acid_fumes", desc: "Вытяжная вентиляционная колонна" },
      { id: "prop_chm_gantry_walkway", model: "Plank.fbx", u: 0.6550, v: 0.6650, y: -18.0, yaw: "90°", size: "12x2x4 м, Box", vfx: "Проржавевшие решетчатые переходы", quest: "overhead_walkway", desc: "Эстакада обслуживания емкостей" },
      { id: "prop_chm_decon_shower", model: "sh1.fbx", u: 0.6350, v: 0.6450, y: -18.0, yaw: "0°", size: "4x4x4 м, Box", vfx: "Сломанный душ экстренной промывки глаз", quest: "safety_shower", desc: "Пост дезактивации персонала" },
      { id: "prop_chm_siren_mast", model: "monument_central.fbx", u: 0.6850, v: 0.6100, y: -15.0, yaw: "0°", size: "2x2x8 м, Cylinder", vfx: "Рупор химической тревоги", quest: "chem_alarm", desc: "Мачта аварийного оповещения" },
      { id: "prop_chm_storage_hangar", model: "warehouse_03.fbx", u: 0.7350, v: 0.6150, y: -14.0, yaw: "270°", size: "12x8x6 м, Box", vfx: "Стены, покрытые желтым налетом серы", quest: "raw_chemicals", desc: "Склад сырьевых реактивов" },
      { id: "prop_chm_carboy_pile", model: "SM_RP_Rock_2m_1.fbx", u: 0.6600, v: 0.6900, y: -22.0, yaw: "120°", size: "6x4x2 м, Box", vfx: "Осколки толстых стеклянных бутылей в корзинах", quest: "broken_glass", desc: "Свалка битой химической посуды" }
    ]
  },
  {
    id: "bunker_gate",
    nameRu: "Вход в бункер",
    uv: [0.680, 0.650, 0.820, 0.780],
    dialogue: "«За этой титановой дверью спит Сердце Острова. Ни один ключ не поворачивался в замке три века...» (Архивист Элиас, epic_seven_cores)",
    props: [
      { id: "prop_bnk_portal", model: "sh1.fbx", u: 0.7500, v: 0.7200, y: -10.0, yaw: "180°", size: "20x8x14 м, Box", vfx: "Шлюзовая плита толщиной 2 метра", quest: "epic_seven_cores", desc: "Главный Портал Бункера Создателей" },
      { id: "prop_bnk_pistons", model: "boiler.fbx", u: 0.7400, v: 0.7100, y: -10.0, yaw: "90°", size: "6x6x8 м, Box", vfx: "Гидравлические запорные штанги", quest: "Механизм шлюза", desc: "Запорные цилиндры шлюза" },
      { id: "prop_bnk_console", model: "monument_wheel.fbx", u: 0.7550, v: 0.7250, y: -10.0, yaw: "0°", size: "2x2x3 м, Box", vfx: "Гнезда под Семь Ядер Эфира", quest: "epic_seven_cores", desc: "Консоль активации замка" },
      { id: "prop_bnk_filters", model: "boiler_room.fbx", u: 0.7100, v: 0.6800, y: -8.0, yaw: "45°", size: "10x8x6 м, Box", vfx: "Гул циклонов очистки воздуха", quest: "Жизнеобеспечение", desc: "Венткомплекс глубокой фильтрации" },
      { id: "prop_bnk_turret", model: "monument_central.fbx", u: 0.7700, v: 0.7000, y: -6.0, yaw: "270°", size: "4x4x6 м, Cylinder", vfx: "Сдвоенный автоклав лазерной защиты", quest: "Охрана Бункера", desc: "Автоматическая турель периметра" },
      { id: "prop_bnk_airlock", model: "tent_02.fbx", u: 0.7300, v: 0.7400, y: -12.0, yaw: "0°", size: "8x6x4 м, Box", vfx: "Форсунки дегазации при входе", quest: "Санитарный контур", desc: "Дегазационный шлюз персонала" },
      { id: "prop_bnk_perimeter_fence", model: "SM_RP_Rock_4m_3.fbx", u: 0.7000, v: 0.7600, y: -12.0, yaw: "90°", size: "16x3x4 м, Box", vfx: "Бронеплиты с изоляторами высокого напряжения", quest: "bunker_security", desc: "Защитный периметр Входа" },
      { id: "prop_bnk_substation", model: "warehouse_04.fbx", u: 0.7850, v: 0.6750, y: -5.0, yaw: "180°", size: "10x8x6 м, Box", vfx: "Масляные трансформаторы, треск коронного разряда", quest: "power_substation", desc: "Трансформаторная подстанция шлюза" },
      { id: "prop_bnk_warning_post", model: "monument_central.fbx", u: 0.7200, v: 0.7500, y: -11.0, yaw: "0°", size: "1.5x1.5x5 м, Cylinder", vfx: "Табличка «Сектор Альфа. Вход запрещен»", quest: "restricted_zone", desc: "Предупредительный столб допуска" },
      { id: "prop_bnk_sentry_box", model: "house_01.fbx", u: 0.7650, v: 0.7550, y: -9.0, yaw: "225°", size: "5x5x5 м, Box", vfx: "Бронированная караульная будка", quest: "guard_checkpoint", desc: "Бронеколпак внешнего караула" },
      { id: "prop_bnk_cable_trench", model: "Log_2.fbx", u: 0.7450, v: 0.6700, y: -8.0, yaw: "30°", size: "12x2x1 м, Box", vfx: "Жгут бронированных силовых кабелей", quest: "high_voltage_feed", desc: "Открытый кабельный лоток питания" },
      { id: "prop_bnk_vent_grate", model: "SM_RP_Rock_2m_3.fbx", u: 0.7950, v: 0.7300, y: -7.0, yaw: "0°", size: "5x5x2 м, Box", vfx: "Восходящий поток теплого озонированного воздуха", quest: "exhaust_grate", desc: "Решетка вытяжного ствола Бункера" }
    ]
  },
  {
    id: "boiler_lands",
    nameRu: "Котловые земли",
    uv: [0.720, 0.750, 0.880, 0.900],
    dialogue: "«Земля здесь дышит через свищи. Одно неловкое движение — и струя перегретого пара на 400 градусов срежет плоть до костей...» (Инспектор Гилберт, event_pipe_burst)",
    props: [
      { id: "prop_boi_central", model: "boiler.fbx", u: 0.8000, v: 0.8200, y: -5.0, yaw: "0°", size: "22x22x24 м, Cylinder", vfx: "Белое облако пара, гул 100 дБ", quest: "Сердце давления", desc: "Центральный Сверхвысокий Котёл" },
      { id: "prop_boi_stack", model: "airship_mooring_mast.fbx", u: 0.8300, v: 0.8000, y: 0.0, yaw: "0°", size: "4x4x24 м, Cylinder", vfx: "Сноп перегретого сухого пара", quest: "Сброс пара", desc: "Главная сбросная дымовая труба" },
      { id: "prop_boi_cooling", model: "boiler_room.fbx", u: 0.7600, v: 0.8500, y: -10.0, yaw: "90°", size: "16x16x14 м, Box", vfx: "Капли конденсата, водяной туман", quest: "Охлаждение контура", desc: "Градирня охлаждения конденсата" },
      { id: "prop_boi_header", model: "boiler.fbx", u: 0.7900, v: 0.7800, y: -8.0, yaw: "45°", size: "12x6x6 м, Box", vfx: "Красные манометры на 200 атм", quest: "event_pipe_burst", desc: "Коллектор пара высокого давления" },
      { id: "prop_boi_wellhead", model: "monument_wheel.fbx", u: 0.8400, v: 0.8600, y: -2.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Скважина в магматический разлом", quest: "Геотермальная энергия", desc: "Устье геотермальной скважины" },
      { id: "prop_boi_whistle", model: "monument_central.fbx", u: 0.7700, v: 0.7900, y: -6.0, yaw: "0°", size: "2x2x8 м, Cylinder", vfx: "Свист каждые 15 минут", quest: "Сигнал продувки", desc: "Паровой аварийный ревун продувки" },
      { id: "prop_boi_slag_chute", model: "PieceOfWood.fbx", u: 0.8150, v: 0.8750, y: -4.0, yaw: "110°", size: "10x3x2.5 м, Box", vfx: "Раскаленные шлаковые гранулы", quest: "slag_drain", desc: "Желоб гидросмыва шлака и золы" },
      { id: "prop_boi_regulator_vault", model: "warehouse_01.fbx", u: 0.7450, v: 0.8250, y: -8.0, yaw: "180°", size: "9x7x5 м, Box", vfx: "Сервоприводы регулировочных клапанов", quest: "pressure_regulation", desc: "Павильон дроссельных клапанов" },
      { id: "prop_boi_expansion_loop", model: "boiler.fbx", u: 0.8250, v: 0.7700, y: -3.0, yaw: "90°", size: "8x4x6 м, Box", vfx: "Тепловое расширение чугунных дуг", quest: "thermal_expansion", desc: "Омега-образный компенсатор трубы" },
      { id: "prop_boi_catch_basin", model: "tp_zone.fbx", u: 0.7800, v: 0.8700, y: -12.0, yaw: "0°", size: "12x12x1 м, Trigger", vfx: "Горячая вода с температурой 95°C", quest: "hot_well", desc: "Бассейн горячего конденсата" },
      { id: "prop_boi_coal_conveyor", model: "airship_mooring_mast.fbx", u: 0.8550, v: 0.8300, y: 3.0, yaw: "30°", size: "5x15x10 м, Box", vfx: "Наклонная галерея ленточного транспортера", quest: "fuel_feed", desc: "Эстакада углеподачи в топки" },
      { id: "prop_boi_repair_shop", model: "forge_03.fbx", u: 0.7350, v: 0.7700, y: -10.0, yaw: "270°", size: "10x8x6 м, Box", vfx: "Пневмомолоты для клепки котлов", quest: "boiler_repair", desc: "Цех ремонта котельного оборудования" },
      { id: "prop_boi_vent_gate", model: "sh1.fbx", u: 0.8650, v: 0.8800, y: 0.0, yaw: "45°", size: "12x4x8 м, Box", vfx: "Шлюзовая задвижка продувки поля", quest: "blowdown_gate", desc: "Заслонка восточного сбросного канала" },
      { id: "prop_boi_heat_shield", model: "SM_RP_Rock_4m_4.fbx", u: 0.7550, v: 0.8850, y: -11.0, yaw: "135°", size: "14x3x5 м, Box", vfx: "Отражающие базальтовые термоэкраны", quest: "heat_protection", desc: "Термозащитная экранирующая стенка" }
    ]
  },
  {
    id: "port",
    nameRu: "Порт / Гавань",
    uv: [0.420, 0.820, 0.560, 0.960],
    dialogue: "«Если ищешь запчасти с материка — иди в Гавань. Контрабандисты везут поршни даже в трюмах с соленой рыбой...» (Торговец Гавани, side_milly_parts)",
    props: [
      { id: "prop_prt_customs", model: "house_engineer_02.fbx", u: 0.4800, v: 0.8600, y: -30.0, yaw: "180°", size: "12x10x8 м, Box", vfx: "Флаг Синдиката, весы для пошлин", quest: "harbor_trader", desc: "Здание Таможни и Фактории" },
      { id: "prop_prt_crane", model: "airship_mooring_mast.fbx", u: 0.5100, v: 0.8900, y: -28.0, yaw: "45°", size: "8x8x22 м, Box", vfx: "Подъем 20-тонных контейнеров", quest: "Разгрузка барж", desc: "Главный портальный портовый кран" },
      { id: "prop_prt_mast", model: "airship_mooring_mast.fbx", u: 0.4600, v: 0.8400, y: -25.0, yaw: "0°", size: "6x6x24 м, Box", vfx: "Причал воздушных дирижаблей", quest: "Воздушное сообщение", desc: "Причальная Мачта Дирижаблей" },
      { id: "prop_prt_wharf", model: "warehouse_01.fbx", u: 0.4900, v: 0.9100, y: -33.0, yaw: "90°", size: "24x10x6 м, Box", vfx: "Швартовые кнехты, канаты", quest: "Морской причал", desc: "Грузовой пакгауз Главного Пирса" },
      { id: "prop_prt_lighthouse", model: "monument_central.fbx", u: 0.5400, v: 0.9400, y: -25.0, yaw: "0°", size: "6x6x18 м, Cylinder", vfx: "Вращающийся луч линзы Френеля", quest: "Морской маяк", desc: "Маяк Южного Фарватера" },
      { id: "prop_prt_tavern", model: "house_03.fbx", u: 0.4700, v: 0.8750, y: -29.0, yaw: "270°", size: "10x8x7 м, Box", vfx: "Вывеска «Пар и Якорь», звон кружек", quest: "side_milly_parts", desc: "Портовая таверна моряков" },
      { id: "prop_prt_drydock", model: "boiler_room.fbx", u: 0.5250, v: 0.8700, y: -32.0, yaw: "0°", size: "18x12x8 м, Box", vfx: "Кильблоки для ремонта шхун", quest: "ship_repair", desc: "Судоремонтный эллинг Гавани" },
      { id: "prop_prt_cargo_crates", model: "PieceOfWood.fbx", u: 0.5000, v: 0.8800, y: -31.0, yaw: "15°", size: "6x4x3 м, Box", vfx: "Штабели ящиков с маркировкой 'Синдикат'", quest: "cargo_logistics", desc: "Штабель колониальных грузов" },
      { id: "prop_prt_fish_smokehouse", model: "forge_01.fbx", u: 0.4450, v: 0.8900, y: -33.0, yaw: "90°", size: "6x5x5 м, Box", vfx: "Ольховый дым коптилен, сушеная треска", quest: "fishery_lore", desc: "Коптильня прибрежной артели" },
      { id: "prop_prt_breakwater", model: "SM_RP_Rock_8m_0.fbx", u: 0.5500, v: 0.9200, y: -34.0, yaw: "60°", size: "20x8x6 м, Box", vfx: "Разбивающиеся о мол морские волны", quest: "harbor_defense", desc: "Защитный волнолом бухты" },
      { id: "prop_prt_anchor_monument", model: "monument_wheel.fbx", u: 0.4850, v: 0.8500, y: -28.0, yaw: "0°", size: "4x4x5 м, Cylinder", vfx: "Десятитонный адмиралтейский якорь", quest: "sailor_memorial", desc: "Памятник первопроходцам моря" },
      { id: "prop_prt_gate_barrier", model: "sh1.fbx", u: 0.4750, v: 0.8350, y: -26.0, yaw: "180°", size: "12x4x6 м, Box", vfx: "Ворота таможенной зоны с фонарями", quest: "port_access", desc: "Входные ворота портовой зоны" },
      { id: "prop_prt_fuel_tanks", model: "boiler.fbx", u: 0.5300, v: 0.8500, y: -29.0, yaw: "0°", size: "8x8x8 м, Cylinder", vfx: "Заправка бункеров пароходов мазутом", quest: "bunkering_station", desc: "Бункеровочная станция флота" },
      { id: "prop_prt_mooring_cleats", model: "SM_RP_Rock_2m_4.fbx", u: 0.4950, v: 0.9300, y: -34.0, yaw: "0°", size: "2x2x2 м, Box", vfx: "Чугунные швартовные тумбы с канатами", quest: "pier_cleats", desc: "Причальный пал восточной стенки" },
      { id: "prop_prt_harbormaster_tower", model: "house_engineer_01.fbx", u: 0.4550, v: 0.8650, y: -28.0, yaw: "90°", size: "9x9x12 м, Box", vfx: "Подзорные трубы, сигнальные шары", quest: "harbormaster", desc: "Диспетчерская вышка капитана порта" },
      { id: "prop_prt_boat_launch", model: "Plank.fbx", u: 0.4350, v: 0.9150, y: -34.5, yaw: "135°", size: "10x4x0.5 м, Box", vfx: "Наклонный слип спуска шлюпок", quest: "lifeboat_launch", desc: "Деревянный лодочный спуск" }
    ]
  },
  {
    id: "steel_cliff",
    nameRu: "Утёс Стали",
    uv: [0.350, 0.020, 0.520, 0.100],
    dialogue: "«На вершине Утёса ветер ревёт так, что срывает обшивку с дирижаблей. Там стоит старый ретранслятор Создателей...» (Капитан Рездик, side_rezdik_iron)",
    props: [
      { id: "prop_clf_precipice", model: "SM_RP_Rock_8m_5.fbx", u: 0.4400, v: 0.0400, y: 75.0, yaw: "0°", size: "35x20x15 м, Box", vfx: "Отвесный обрыв в океан, свист ветра", quest: "Край острова", desc: "Главный базальтовый пик Утёса" },
      { id: "prop_clf_airship_wreck", model: "airship.fbx", u: 0.4100, v: 0.0600, y: 68.0, yaw: "75°", size: "30x10x12 м, Box", vfx: "Разорванный дюралевый каркас цеппелина", quest: "Катастрофа «Авроры»", desc: "Обломки дирижабля «Аврора-7»" },
      { id: "prop_clf_mast", model: "airship_mooring_mast.fbx", u: 0.4700, v: 0.0500, y: 80.0, yaw: "0°", size: "4x4x24 м, Box", vfx: "Анемометры, флюгера, громоотвод", quest: "Метеостанция", desc: "Высотная метеорологическая вышка" },
      { id: "prop_clf_winch", model: "boiler_room.fbx", u: 0.3900, v: 0.0800, y: 60.0, yaw: "135°", size: "8x8x6 м, Box", vfx: "Стальной трос фуникулера в долину", quest: "Подъем грузов", desc: "Тяговая лебедка скального подъёмника" },
      { id: "prop_clf_platform", model: "sh1.fbx", u: 0.4500, v: 0.0700, y: 70.0, yaw: "180°", size: "12x8x6 м, Box", vfx: "Ограждения над полукилометровой пропастью", quest: "Смотровой пункт", desc: "Панорамная смотровая галерея" },
      { id: "prop_clf_cables", model: "monument_wheel.fbx", u: 0.4800, v: 0.0800, y: 62.0, yaw: "45°", size: "6x6x4 м, Cylinder", vfx: "Натяжные талрепы вантовых растяжек", quest: "Крепление мачты", desc: "Якорный узел вантовых тросов" },
      { id: "prop_clf_lighthouse", model: "monument_central.fbx", u: 0.4950, v: 0.0350, y: 78.0, yaw: "0°", size: "4x4x14 м, Cylinder", vfx: "Вспышки красного аэронавигационного огня", quest: "aero_beacon", desc: "Аэронавигационный высотный маяк" },
      { id: "prop_clf_guard_wall", model: "SM_RP_Rock_4m_3.fbx", u: 0.3800, v: 0.0700, y: 63.0, yaw: "90°", size: "10x3x4 м, Box", vfx: "Каменная стенка защиты тропы от камнепада", quest: "trail_safety", desc: "Камнезащитная подпорная стена" },
      { id: "prop_clf_zephyr_altar", model: "chapel.fbx", u: 0.4600, v: 0.0300, y: 76.0, yaw: "180°", size: "8x8x10 м, Box", vfx: "Гудение ветра в полых трубах алтаря", quest: "wind_altar_lore", desc: "Святилище Ветров Создателей" },
      { id: "prop_clf_scree_slope", model: "SM_RP_Rock_8m_3.fbx", u: 0.3650, v: 0.0900, y: 55.0, yaw: "30°", size: "16x10x6 м, Box", vfx: "Опасная осыпь черного сланца", quest: "scree_hazard", desc: "Сланцевая осыпь горного серпантина" },
      { id: "prop_clf_danger_sign", model: "Plank.fbx", u: 0.4250, v: 0.0850, y: 62.0, yaw: "180°", size: "2x0.5x2.5 м, Box", vfx: "Знак «Осторожно! Порывистый ветер до 40 м/с»", quest: "cliff_warning", desc: "Предупреждающий аншлаг перевала" },
      { id: "prop_clf_wind_turbine", model: "airship_mooring_mast.fbx", u: 0.5050, v: 0.0650, y: 72.0, yaw: "270°", size: "4x4x16 м, Box", vfx: "Бешеный свист трехлопастного ветрогенератора", quest: "wind_power", desc: "Ветросиловая установка станции" },
      { id: "prop_clf_trail_cairn", model: "SM_RP_Rock_2m_2.fbx", u: 0.4000, v: 0.0950, y: 58.0, yaw: "0°", size: "2x2x2.5 м, Cylinder", vfx: "Пирамида из камней с деревянным шестом", quest: "trail_marker", desc: "Навигационный тур тропы альпинистов" },
      { id: "prop_clf_stanchions", model: "monument_wheel.fbx", u: 0.4350, v: 0.0550, y: 72.0, yaw: "90°", size: "1.5x1.5x3 м, Box", vfx: "Окованные столбики с натянутыми страховочными цепями", quest: "safety_railing", desc: "Страховочные леера вдоль обрыва" }
    ]
  },
  {
    id: "cruna_tower",
    nameRu: "Башня Круны",
    uv: [0.050, 0.200, 0.150, 0.320],
    dialogue: "«Шпиль Круны пронзает облака. В его недрах сокрыт Контур Равновесия — механизм, удерживающий остров на плаву над океаном магмы...» (Магистр Болро, path_to_technomancer)",
    props: [
      { id: "prop_tow_citadel", model: "house_engineer_06.fbx", u: 0.0900, v: 0.2500, y: 85.0, yaw: "0°", size: "28x28x45 м, Box", vfx: "Вращающиеся кольца гироскопа на вершине", quest: "path_to_technomancer", desc: "Великая Башня Круны (Цитадель)" },
      { id: "prop_tow_spire", model: "airship_mooring_mast.fbx", u: 0.0900, v: 0.2500, y: 130.0, yaw: "0°", size: "3x3x30 м, Cylinder", vfx: "Ионизированное синее сияние, молнии", quest: "Контур Равновесия", desc: "Эфирный громоотвод шпиля" },
      { id: "prop_tow_astrolabe", model: "monument_wheel.fbx", u: 0.1100, v: 0.2700, y: 80.0, yaw: "35°", size: "12x12x10 м, Cylinder", vfx: "Медленное вращение армиллярных сфер", quest: "epic_seven_cores", desc: "Астролябия Создателей на террасе" },
      { id: "prop_tow_conduit", model: "boiler.fbx", u: 0.0700, v: 0.2300, y: 78.0, yaw: "90°", size: "8x8x12 м, Box", vfx: "Сверхперегретый пар бирюзового цвета", quest: "Магистраль Башни", desc: "Главный энергетический коллектор" },
      { id: "prop_tow_skybridge", model: "sh1.fbx", u: 0.1300, v: 0.2900, y: 65.0, yaw: "45°", size: "22x6x8 м, Box", vfx: "Арочный мост над пропастью", quest: "Путь к Цитадели", desc: "Виадук Парящего Моста" },
      { id: "prop_tow_gate", model: "sh1.fbx", u: 0.1200, v: 0.2800, y: 70.0, yaw: "225°", size: "14x6x10 м, Box", vfx: "Золоченые барельефы шестерней и солнца", quest: "Вход в Башню", desc: "Портал Семи Ключей Круны" },
      { id: "prop_tow_resonator", model: "monument_central.fbx", u: 0.0800, v: 0.2850, y: 75.0, yaw: "0°", size: "3x3x10 м, Cylinder", vfx: "Гул низкой частоты 12 Гц, вибрация пола", quest: "resonator_pylon", desc: "Резонаторный пилон стабилизации" },
      { id: "prop_tow_bastion_wall", model: "SM_RP_Rock_8m_4.fbx", u: 0.0600, v: 0.2200, y: 82.0, yaw: "135°", size: "20x6x8 м, Box", vfx: "Базальтовая кладка с адамантовой обшивкой", quest: "outer_curtain", desc: "Крепостная стена Верхней Террасы" },
      { id: "prop_tow_archive_annex", model: "house_engineer_03.fbx", u: 0.1150, v: 0.2350, y: 82.0, yaw: "180°", size: "12x10x8 м, Box", vfx: "Свинцовые переплеты окон, стеллажи манускриптов", quest: "secret_archives", desc: "Флигель Тайных Архивов Круны" },
      { id: "prop_tow_core_conduit", model: "boiler_room.fbx", u: 0.0750, v: 0.2600, y: 84.0, yaw: "270°", size: "10x8x6 м, Box", vfx: "Свечение кварцевых экранов реактора", quest: "balance_core", desc: "Камера ввода эфирных кабелей" },
      { id: "prop_tow_gargoyle_vents", model: "monument_central.fbx", u: 0.1050, v: 0.2950, y: 72.0, yaw: "0°", size: "2x2x5 м, Cylinder", vfx: "Паровые гаргульи с факелами пара из пастей", quest: "steam_gargoyles", desc: "Декоративный паровыпускной пилон" },
      { id: "prop_tow_skybarge_ring", model: "monument_wheel.fbx", u: 0.0650, v: 0.2900, y: 76.0, yaw: "90°", size: "6x6x6 м, Box", vfx: "Кованые причальные кольца для небесных барж", quest: "skybarge_dock", desc: "Причальный пилон воздушного флота" },
      { id: "prop_tow_terrace_rocks", model: "SM_RP_Rock_4m_9.fbx", u: 0.1350, v: 0.2650, y: 74.0, yaw: "60°", size: "10x6x5 м, Box", vfx: "Монолитные гранитные утесы террасы", quest: "crag_foundation", desc: "Скальный фундамент Южного бастиона" },
      { id: "prop_tow_sentry_pod", model: "house_01.fbx", u: 0.1250, v: 0.3050, y: 66.0, yaw: "45°", size: "5x5x5 м, Box", vfx: "Бронебойная амбразура охраны моста", quest: "bridge_guard", desc: "Караульный пикет мостового перехода" }
    ]
  }
];

// Validation
let totalProps = 0;
let errors = [];

LOCATIONS.forEach(loc => {
  const [minU, minV, maxU, maxV] = loc.uv;
  loc.props.forEach(p => {
    totalProps++;
    // check UV bounds
    if (p.u < minU || p.u > maxU || p.v < minV || p.v > maxV) {
      errors.push(`Prop ${p.id} in ${loc.id} out of bounds: u=${p.u} (allowed [${minU}, ${maxU}]), v=${p.v} (allowed [${minV}, ${maxV}])`);
    }
    // calculate world coords
    const world = uvToWorld(p.u, p.v, p.y);
    p.world = world;
  });
});

console.log(`Verified ${totalProps} props across ${LOCATIONS.length} locations.`);
if (errors.length > 0) {
  console.error('Errors found:', errors);
  process.exit(1);
} else {
  console.log('ALL PROPS 100% VALID! ZERO BOUNDARY ERRORS!');
}

// Export dataset for markdown and html generation
module.exports = {
  WORLD,
  LOCATIONS,
  uvToWorld
};
