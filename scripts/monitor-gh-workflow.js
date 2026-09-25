// ============================================================
//  SCRIPTS / MONITOR-GH-WORKFLOW.JS
//  Мониторинг прогресса выполнения стресс-теста на GitHub Actions
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

function ghGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'GET',
      timeout: 8000,
      headers: {
        'User-Agent': 'Project-Steam-Agent',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

async function monitor() {
  console.log('🔍 [GH_MONITOR] Поиск активного запуска стресс-теста в GitHub Actions...');
  
  // Даем несколько секунд на инициализацию раннера
  let run = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const runsRes = await ghGet(`/repos/${OWNER}/${REPO}/actions/runs?per_page=5`);
    if (runsRes.body && runsRes.body.workflow_runs && runsRes.body.workflow_runs.length > 0) {
      run = runsRes.body.workflow_runs[0];
      const ageSec = (Date.now() - new Date(run.created_at).getTime()) / 1000;
      if (ageSec < 180) { // Создан в течение последних 3 минут
        break;
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!run) {
    console.error('❌ Не удалось найти запущенный workflow.');
    return;
  }

  console.log(`🎯 [RUN #${run.run_number}] ID: ${run.id} | Название: "${run.name}"`);
  console.log(`🔗 Ссылка: ${run.html_url}`);
  console.log(`Статус: ${run.status} | Вывод: ${run.conclusion || 'в процессе'}\n`);

  const startTime = Date.now();
  let lastStatus = '';

  while (true) {
    try {
      const res = await ghGet(`/repos/${OWNER}/${REPO}/actions/runs/${run.id}`);
      const r = res.body;
      if (!r) {
        await new Promise(res => setTimeout(res, 5000));
        continue;
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const statusStr = `[${elapsed}с] Статус: ${(r.status || 'unknown').toUpperCase()} | Заключение: ${r.conclusion || 'ВЫПОЛНЯЕТСЯ'}`;
      
      if (statusStr !== lastStatus) {
        console.log(statusStr);
        lastStatus = statusStr;
      }

      if (r.status === 'completed') {
        console.log('\n============================================================');
        console.log(`🏁 [RUN COMPLETED] Результат: ${r.conclusion === 'success' ? '✅ УСПЕШНО' : '❌ ' + String(r.conclusion).toUpperCase()}`);
        console.log(`⏱️ Полная длительность: ${elapsed} секунд`);
        console.log('============================================================');
        break;
      }
    } catch (e) {
      console.warn('⚠️ Ошибка запроса к GitHub API, повтор через 5с...', e && e.message);
    }

    await new Promise(res => setTimeout(res, 8000));
  }
}

monitor().catch(err => {
  console.error('❌ [MONITOR_ERROR]:', err && err.message);
});
