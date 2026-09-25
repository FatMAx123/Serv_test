// ============================================================
//  TESTS / PERSISTENCE-WORKER.TEST.JS
//  Verifies Worker Thread offloading on vCPU 2 & fallback.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { PersistenceClient, defaultClient } = require('../server/workers/persistence-client.js');

const TEST_DIR = path.join(__dirname, '..', 'data', 'test_worker_tmp');

module.exports = async function (t) {
  t.suite('persistence-worker: инициализация и ping-pong');
  await fs.promises.mkdir(TEST_DIR, { recursive: true });

  const resPing = await defaultClient.ping();
  t.ok(resPing.ok, 'Ping к фоновому клиенту выполнен успешно');
  if (defaultClient.isWorkerActive()) {
    t.ok(resPing.pong === true, 'Worker Thread ответил pong на запрос');
    t.ok(typeof resPing.threadId === 'number', 'threadId является числом');
  }

  t.suite('persistence-worker: writeAtomic с объектом и ротацией .bak');
  const filePath = path.join(TEST_DIR, 'worker_save_test.json');
  const payload1 = { id: 101, name: 'KrunMechanic', level: 20, adena: 550000 };

  // Первый сейв
  const res1 = await defaultClient.writeAtomic(filePath, {
    payload: payload1,
    label: 'test_save_1',
    makeBak: true
  });
  t.ok(res1.ok, 'Первая запись выполнена успешно');

  const content1 = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
  t.eq(content1, payload1, 'Данные первого сохранения совпадают');

  // Второй сейв (создание .bak)
  const payload2 = { id: 101, name: 'KrunMechanic', level: 21, adena: 600000 };
  const res2 = await defaultClient.writeAtomic(filePath, {
    payload: payload2,
    label: 'test_save_2',
    makeBak: true
  });
  t.ok(res2.ok, 'Вторая запись выполнена успешно');

  const content2 = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
  t.eq(content2, payload2, 'Данные второго сохранения обновлены');

  const bakExists = fs.existsSync(filePath + '.bak');
  t.ok(bakExists, 'Файл архивной копии .bak успешно создан');
  const bakContent = JSON.parse(await fs.promises.readFile(filePath + '.bak', 'utf8'));
  t.eq(bakContent, payload1, 'Содержимое .bak совпадает с предыдущей версией');

  t.suite('persistence-worker: writeAtomic с готовым json');
  const rawPath = path.join(TEST_DIR, 'worker_raw_json.json');
  const rawJson = JSON.stringify({ item: 'iron_hammer', enchant: 7 });

  const resRaw = await defaultClient.writeAtomic(rawPath, {
    json: rawJson,
    label: 'test_raw_json'
  });
  t.ok(resRaw.ok, 'Запись готовой JSON строки успешна');
  const readBack = await fs.promises.readFile(rawPath, 'utf8');
  t.eq(readBack, rawJson, 'Прочитанный файл в точности равен исходной строке');

  t.suite('persistence-worker: unlink очищает файл и .bak');
  const unlinkPath = path.join(TEST_DIR, 'worker_to_unlink.json');
  await defaultClient.writeAtomic(unlinkPath, { payload: { a: 1 } });
  await defaultClient.writeAtomic(unlinkPath, { payload: { a: 2 }, makeBak: true });

  t.ok(fs.existsSync(unlinkPath), 'Целевой файл существует перед удалением');
  t.ok(fs.existsSync(unlinkPath + '.bak'), 'Бэкап файл существует перед удалением');

  const resUnlink = await defaultClient.unlink(unlinkPath, { makeBak: true });
  t.ok(resUnlink.ok, 'unlink запрос вернул ok');
  t.ok(!fs.existsSync(unlinkPath), 'Целевой файл удалён');
  t.ok(!fs.existsSync(unlinkPath + '.bak'), 'Бэкап файл удалён');

  t.suite('persistence-worker: graceful fallback при отключении воркера');
  const fallbackClient = new PersistenceClient({ disabled: true });
  t.eq(fallbackClient.isWorkerActive(), false, 'Воркер не активен в fallback режиме');

  const fbPath = path.join(TEST_DIR, 'fallback_test.json');
  const fbPayload = { mode: 'fallback_mode', safe: true };

  const resFb = await fallbackClient.writeAtomic(fbPath, { payload: fbPayload, label: 'fallback_save' });
  t.ok(resFb.ok, 'Запись в fallback режиме успешна');
  t.eq(resFb.inline, true, 'Флаг inline === true');

  const fbRead = JSON.parse(await fs.promises.readFile(fbPath, 'utf8'));
  t.eq(fbRead, fbPayload, 'Данные в fallback режиме сохранены корректно');
  await fallbackClient.terminate();

  // Чистка временных файлов
  try {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  } catch (_) {}
};
