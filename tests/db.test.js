// ============================================================
//  TESTS / DB.TEST.JS — атомарность и сериализация записи профиля.
//  Регресс: tmp-файл был один на yid, и два параллельных save() портили
//  и профиль, и .bak (10/15 раундов), а load() по дизайну бросает на битом
//  JSON → close(4010) и игрок заблокирован навсегда.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB = require(path.join(ROOT, 'server', 'db.js'));

const PREFIX = 'dbtest_';

function makeProfile(sizeKb, tag) {
  const filler = [];
  const n = Math.max(1, Math.floor(sizeKb * 1024 / 40));
  for (let i = 0; i < n; i++) filler.push({ id: 'item_' + i, n: i, tag: tag });
  return { name: 'DbTest', level: 20, tag: tag, inv: { copper_parts: 12345 }, filler: filler };
}

function readRaw(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function cleanup() {
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.indexOf(PREFIX) === 0) { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (_) {} }
  }
}

module.exports = async function (t) {
  cleanup();

  t.suite('db: конкурентная запись одного профиля');
  // Разный размер A и B критичен: одинаковые буферы маскировали баг.
  for (const kb of [1, 195, 586]) {
    const yid = PREFIX + kb + 'kb';
    const file = path.join(DATA_DIR, yid + '.json');
    let mainBad = 0, bakBad = 0, loadBad = 0, wrongOrder = 0;
    const ROUNDS = 10;
    for (let r = 0; r < ROUNDS; r++) {
      await Promise.all([
        DB.save(yid, makeProfile(kb, 'A')),
        DB.save(yid, makeProfile(Math.max(1, Math.floor(kb / 4)), 'B'))
      ]);
      const main = readRaw(file);
      if (!main) mainBad++;
      else if (main.tag !== 'B') wrongOrder++;  // последний в очереди должен победить
      if (fs.existsSync(file + '.bak') && !readRaw(file + '.bak')) bakBad++;
      try { await DB.load(yid); } catch (e) { loadBad++; }
    }
    const strays = fs.readdirSync(DATA_DIR).filter(f => f.indexOf(yid + '.json.tmp') === 0).length;
    t.eq([mainBad, bakBad, loadBad, wrongOrder, strays], [0, 0, 0, 0, 0],
      kb + ' KB: профиль/бэкап целы, порядок записи сохранён, tmp не остались');
  }

  t.suite('db: пачка одновременных сейвов');
  const burstYid = PREFIX + 'burst';
  const burstFile = path.join(DATA_DIR, burstYid + '.json');
  let burstBad = 0;
  for (let r = 0; r < 5; r++) {
    const jobs = [];
    for (let i = 0; i < 20; i++) jobs.push(DB.save(burstYid, makeProfile(60, 'S' + i)));
    await Promise.all(jobs);
    if (!readRaw(burstFile)) burstBad++;
  }
  const burstStrays = fs.readdirSync(DATA_DIR).filter(f => f.indexOf(burstYid + '.json.tmp') === 0).length;
  t.eq([burstBad, burstStrays], [0, 0], '20 параллельных сейвов × 5 раундов: файл цел, tmp не остались');

  t.suite('db: load и восстановление');
  const newYid = PREFIX + 'absent';
  t.eq(await DB.load(newYid), null, 'нет файла → null (новый игрок), а не исключение');

  const corruptYid = PREFIX + 'corrupt';
  const corruptFile = path.join(DATA_DIR, corruptYid + '.json');
  await DB.save(corruptYid, { name: 'Good', level: 7 });   // создаёт .json
  await DB.save(corruptYid, { name: 'Good2', level: 8 });  // предыдущий уходит в .bak
  fs.writeFileSync(corruptFile, '{"broken":', 'utf8');
  const restored = await DB.load(corruptYid);
  t.eq(restored && restored.name, 'Good', 'битый профиль восстановлен из .bak');

  fs.writeFileSync(corruptFile, '{"broken":', 'utf8');
  fs.writeFileSync(corruptFile + '.bak', 'also broken', 'utf8');
  let threw = false;
  try { await DB.load(corruptYid); } catch (e) { threw = /corrupted/.test(String(e && e.message)); }
  t.ok(threw, 'битые и профиль, и бэкап → исключение (не выдаём нового персонажа)');

  t.suite('db: ошибка записи пробрасывается');
  // Имя с разделителем пути безопасно (safeName заменит), поэтому ломаем через
  // подмену каталога: создаём файл там, где ожидается директория data/<yid>/
  let saveThrew = false;
  const busyYid = PREFIX + 'busy';
  const busyPath = path.join(DATA_DIR, busyYid + '.json');
  try {
    fs.mkdirSync(busyPath, { recursive: true }); // rename в каталог не пройдёт
    try { await DB.save(busyYid, { name: 'X' }); } catch (e) { saveThrew = true; }
  } finally {
    try { fs.rmSync(busyPath, { recursive: true, force: true }); } catch (_) {}
  }
  t.ok(saveThrew, 'save пробрасывает ошибку наверх, а не глотает её');

  t.suite('db: устойчивость к EBUSY на .bak (P1.3)');
  const origCopyFile = fs.promises.copyFile;
  let copyAttempts = 0;
  const ebusyYid = PREFIX + 'ebusy_bak';
  await DB.save(ebusyYid, { name: 'Initial', level: 1 });

  // 1) Постоянный EBUSY на .bak: retry и продолжение основного сейва
  fs.promises.copyFile = async function (...args) {
    copyAttempts++;
    const err = new Error('resource busy or locked');
    err.code = 'EBUSY';
    throw err;
  };

  try {
    await DB.save(ebusyYid, { name: 'Updated', level: 2 });
    const saved = await DB.load(ebusyYid);
    t.ok(copyAttempts > 1, 'copyFile сделал retry при EBUSY (' + copyAttempts + ' раз)');
    t.eq(saved && saved.name, 'Updated', 'профиль успешно сохранён несмотря на EBUSY на .bak');
  } finally {
    fs.promises.copyFile = origCopyFile;
  }

  // 2) Временный EBUSY: восстанавливается на retry
  let transientAttempts = 0;
  fs.promises.copyFile = async function (...args) {
    transientAttempts++;
    if (transientAttempts === 1) {
      const err = new Error('resource busy or locked');
      err.code = 'EBUSY';
      throw err;
    }
    return origCopyFile.apply(this, args);
  };
  try {
    await DB.save(ebusyYid, { name: 'UpdatedTwice', level: 3 });
    const loaded = await DB.load(ebusyYid);
    t.ok(transientAttempts >= 2 && transientAttempts <= 4, 'transient EBUSY восстановился после retry (' + transientAttempts + ')');
    t.eq(loaded && loaded.name, 'UpdatedTwice', 'профиль сохранён после retry');
  } finally {
    fs.promises.copyFile = origCopyFile;
  }

  t.ok(typeof DB.flush === 'function', 'DB.flush есть (нужен graceful shutdown)');
  await DB.flush();

  t.suite('db: слоты yid:charId');
  const yMain = PREFIX + 'slots';
  await DB.save(yMain, { name: 'Main', level: 7, tag: 'c0' });
  await DB.save(yMain, { name: 'Alt', level: 3, tag: 'alt' }, 'c_alt');
  const mainFile = path.join(DATA_DIR, yMain + '.json');
  const altFile = path.join(DATA_DIR, yMain + '.c_alt.json');
  t.ok(fs.existsSync(mainFile), 'c0 пишется в data/<yid>.json — старый путь цел');
  t.ok(fs.existsSync(altFile), 'второй слот — data/<yid>.<charId>.json');
  t.eq((await DB.load(yMain)).tag, 'c0', 'load(yid) без charId = c0');
  t.eq((await DB.load(yMain, 'c0')).tag, 'c0', 'load(yid, c0) тот же файл');
  t.eq((await DB.load(yMain, 'c_alt')).tag, 'alt', 'второй слот изолирован');
  t.eq((await DB.load(yMain, 'c_alt')).name, 'Alt', 'имя второго слота своё');
  const listed = await DB.listChars(yMain);
  t.eq(listed.length, 2, 'listChars видит оба слота');
  t.ok(listed.some((c) => c.id === 'c0' && c.name === 'Main') &&
    listed.some((c) => c.id === 'c_alt' && c.name === 'Alt'),
    'в списке c0 и c_alt с разными именами');
  await DB.removeChar(yMain, 'c_alt');
  t.eq(await DB.load(yMain, 'c_alt'), null, 'removeChar убирает доп. слот');
  t.eq((await DB.load(yMain)).tag, 'c0', 'c0 после удаления второго слота цел');

  cleanup();
};
