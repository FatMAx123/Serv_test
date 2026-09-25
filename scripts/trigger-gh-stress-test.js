// ============================================================
//  SCRIPTS / TRIGGER-GH-STRESS-TEST.JS
//  Запуск GitHub Actions стресс-теста до 5000 CCU через REST API
// ============================================================
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || (() => {
  try {
    const p = path.join(__dirname, '..', '.gh_token');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  } catch (_) {}
  return '';
})();
const OWNER = 'FatMAx123';
const REPO = 'Serv_test';
const WORKFLOW_ID = 'stress-test.yml';

const payload = {
  ref: 'main',
  inputs: {
    test_mode: 'stepped',
    host: '93.77.168.135',
    port: '80',
    start_ccu: '1000',
    max_ccu: '5000',
    step_size: '1000',
    duration: '60',
    town_bots: '250',
    workers: '4'
  }
};

console.log('🚀 [GH_TRIGGER] Отправка запроса на запуск стресс-теста до 5000 CCU в GitHub Actions...');
console.log('Параметры запуска:', JSON.stringify(payload.inputs, null, 2));

const data = JSON.stringify(payload);

function sendTrigger(attempt = 1) {
  const req = https.request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`,
    method: 'POST',
    headers: {
      'User-Agent': 'Project-Steam-Agent',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  }, (res) => {
    console.log(`📡 [GH_STATUS] Код ответа GitHub API: ${res.statusCode} ${res.statusMessage}`);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      if (res.statusCode === 204) {
        console.log('✅ [GH_SUCCESS] Workflow успешно запущен на раннерах GitHub Actions!');
        console.log(`🔗 Ссылка на мониторинг: https://github.com/${OWNER}/${REPO}/actions`);
      } else {
        console.error('❌ [GH_ERROR] Ошибка запуска workflow:', body);
      }
    });
  });

  req.on('error', (err) => {
    console.warn(`⚠️ Попытка #${attempt} не удалась (${err && err.message}), повтор через 3с...`);
    if (attempt < 5) {
      setTimeout(() => sendTrigger(attempt + 1), 3000);
    } else {
      console.error('❌ Все попытки исчерпаны.');
    }
  });

  req.write(data);
  req.end();
}

sendTrigger();
