// ============================================================
//  TESTS / ANTI-ROLLBACK.TEST.JS
//  Автоматизированный тест соблюдения анти-откатных инвариантов
// ============================================================
'use strict';

const { execSync } = require('child_process');
const path = require('path');

module.exports = function (t) {
  t.suite('anti-rollback: проверка архитектурных инвариантов');

  t.noThrow(() => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'guard-anti-rollback.js');
    execSync(`node "${scriptPath}"`, { stdio: 'pipe' });
  }, 'все 22 инварианта Zero Rollback Policy строго соблюдены (guard-anti-rollback.js)');
};
