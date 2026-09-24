const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PROMO_KIT = path.join(ROOT, 'promo_kit');

if (!fs.existsSync(PROMO_KIT)) {
  fs.mkdirSync(PROMO_KIT, { recursive: true });
}

// 1. Копирование лучших баннеров и концепт-артов мира
const filesToPack = [
  {
    src: path.join(ROOT, 'Creating_Lineage_2_game_location_2K_20260911120524.jpeg'),
    dest: '01_Карта_Локаций_Холмы_Сады_Пасека_2K.jpg',
    desc: 'Изометрическая карта локаций: Холмы Астарда, Затерянные Сады, Пасека'
  },
  {
    src: path.join(ROOT, 'Creating_Lineage_2_game_location_2K_20260911120549.jpeg'),
    dest: '02_Панорама_Мира_Руины_и_Стимпанк_2K.jpg',
    desc: 'Панорама мира: древние руины, кристаллы, мост, стимпанк-фабрика'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo', 'art_cover.png'),
    dest: '03_Генплан_Города_с_Кварталами_и_Магазинами.png',
    desc: 'План города: Центральная площадь, кузница, рынок, арена, склады'
  },
  {
    src: path.join(ROOT, 'Пасека_стимпанк_средневековье_ло…_2K_20260911150439.jpeg'),
    dest: '04_Концепт_Стимпанк_Пасеки_и_Пчёл_2K.jpg',
    desc: 'Концепт-арт стимпанк-пасеки и механических пчёл'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'hero_keyart.jpg'),
    dest: '05_Главный_Кейарт_Остров_Стали_1080p.jpg',
    desc: 'Главный кинематографичный арт игры: остров, дирижабли, шторм'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_dora_foundry.jpg'),
    dest: '06_Персонаж_Дора_Плавильный_Горн_16x9.jpg',
    desc: 'Инженер Дора с молотом у плавильного горна'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_roxy_airship.jpg'),
    dest: '07_Персонаж_Рокси_Палуба_Дирижабля_16x9.jpg',
    desc: 'Оператор Рокси на палубе дирижабля на закате'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_centurion_storm.jpg'),
    dest: '08_Персонаж_Центурион_Тяжелый_Танк_16x9.jpg',
    desc: 'Тяжелый танк Центурион во вратах бури'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_thorn_smash.jpg'),
    dest: '09_Персонаж_Торн_Удар_Молота_16x9.jpg',
    desc: 'Инструктор Торн в боевой стойке'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_biotin_clocktower.jpg'),
    dest: '10_Персонаж_Биотин_Крыша_Часов_16x9.jpg',
    desc: 'Стрелок Биотин на часовой башне'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_bonna_cathedral.jpg'),
    dest: '11_Персонаж_Бонна_Паровой_Собор_16x9.jpg',
    desc: 'Бонна в паровом соборе'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_kran_forge.jpg'),
    dest: '12_Персонаж_Кузнец_Кран_Наковальня_16x9.jpg',
    desc: 'Кузнец Кран с раскалённой деталью на наковальне'
  },
  {
    src: path.join(ROOT, 'client', 'assets', 'promo_gen', 'poster_golem_gates.jpg'),
    dest: '13_Монстр_Паровой_Голем_Страж_16x9.jpg',
    desc: 'Паровой голем-котёл у крепостных ворот'
  }
];

// Также добавим свежесгенерированный баннер
const brainDir = 'C:\\Users\\Kulibyaka\\.gemini\\antigravity-ide\\brain\\9ec508f4-e696-48e9-997d-f661903073aa';
const generatedBanner = path.join(brainDir, 'promo_social_banner_1789142687992.jpg');
if (fs.existsSync(generatedBanner)) {
  filesToPack.unshift({
    src: generatedBanner,
    dest: '00_Промо_Баннер_для_Сообществ_16x9.jpg',
    desc: 'Эпический промо-баннер для обложек VK, DTF, Пикабу и Telegram'
  });
}

console.log('📦 Формируем промо-пак в папке promo_kit/ ...');
let copiedCount = 0;

for (const item of filesToPack) {
  if (fs.existsSync(item.src)) {
    const destFull = path.join(PROMO_KIT, item.dest);
    fs.copyFileSync(item.src, destFull);
    console.log(`✓ [${item.dest}] скопирован`);
    copiedCount++;
  } else {
    console.log(`- Пропущен (не найден): ${item.src}`);
  }
}

// Создадим README.md внутри promo_kit
const readmeContent = `# Промо-пак графики «Остров поющей стали: Истоки»

Все изображения готовы для вставки в статьи, посты и превью:
- **DTF** (статьи, обложки подсайтов)
- **Пикабу** (посты сообщества «Игрострой»)
- **VK / Telegram / Discord** (посты, тизеры, превью)
- **Gamedev.ru** (темы разделов «Проекты»)

## Содержимое папки:
${filesToPack.map((f, i) => `${i + 1}. \`${f.dest}\` — ${f.desc}`).join('\n')}

Сайт проекта: https://ostrov-stali.surge.sh/
YouTube: https://www.youtube.com/@AindieGus
`;

fs.writeFileSync(path.join(PROMO_KIT, 'README.md'), readmeContent, 'utf8');
console.log(`🎉 Промо-пак готов! Скопировано файлов: ${copiedCount}`);
