// ============================================================
//  TESTS / TICK-TIMING.TEST.JS
//  Тестирование игрового цикла, высокоточного монотонного тайминга,
//  компенсации дрейфа и сторожевого контроля бюджета тика (Tick Budget).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

module.exports = async function (t) {
  t.suite('tick-timing: инварианты монотонного тайминга и формулы компенсации дрейфа');

  const TICK_HZ = 10;
  const TICK_MS = 1000 / TICK_HZ; // 100 ms
  const TICK_NS = BigInt(Math.round(TICK_MS)) * 1_000_000n; // 100_000_000n
  const TICK_BUDGET_MS = 80;

  t.eq(TICK_MS, 100, 'TICK_MS равен 100 мс (10 Hz)');
  t.ok(TICK_NS === 100_000_000n, 'TICK_NS равен 100,000,000 наносекунд');
  t.eq(TICK_BUDGET_MS, 80, 'TICK_BUDGET_MS равен 80 мс');

  // 1. Моделирование планировщика scheduleNextTick без дрейфа
  {
    let nextTickNs = 0n;
    let overruns = 0;

    function calcNextDelay(simulatedNowNs, currentTargetNs) {
      const nextTarget = currentTargetNs + TICK_NS;
      let delayMs = Number((nextTarget - simulatedNowNs) / 1_000_000n);

      if (delayMs < -200) {
        overruns++;
        return { delayMs: Math.round(TICK_MS), targetNs: simulatedNowNs + TICK_NS, overruns };
      } else if (delayMs < 2) {
        delayMs = 2;
      }
      return { delayMs, targetNs: nextTarget, overruns };
    }

    // Симуляция: тик завершился через 15 мс
    // simulatedNowNs = 15_000_000n, target was 0n
    const step1 = calcNextDelay(15_000_000n, 0n);
    t.eq(step1.delayMs, 85, 'при выполнении за 15 мс задержка до следующего тика составляет 85 мс');
    t.eq(step1.overruns, 0, 'оверранов нет');

    // Симуляция: тик завершился через 99 мс (почти исчерпал)
    const step2 = calcNextDelay(99_000_000n, 0n);
    t.eq(step2.delayMs, 2, 'при отставании до 1 мс применяется защитный порог 2 мс для I/O сокетов');

    // Симуляция: тяжелый спайк GC или I/O (задержка 350 мс > 200 мс)
    const stepLag = calcNextDelay(350_000_000n, 0n);
    t.eq(stepLag.delayMs, 100, 'при критическом отставании (>200 мс) задержка сбрасывается на стандартный тик 100 мс');
    t.eq(stepLag.overruns, 1, 'зафиксирован оверран');
    t.ok(stepLag.targetNs === 350_000_000n + TICK_NS, 'целевое время сдвинуто вперед для предотвращения лавины тиков');
  }

  // 2. Сторожевой контроль бюджета тика (Tick Budget Watchdog)
  t.suite('tick-timing: сторожевой контроль бюджета тика (Tick Budget Watchdog)');
  {
    let tickBudgetDeferred = 0;
    let secondaryTasksExecuted = 0;

    function simulateTickExecution(simulatedElapsedMs) {
      const budgetExceeded = simulatedElapsedMs >= TICK_BUDGET_MS;
      if (budgetExceeded) {
        tickBudgetDeferred++;
      } else {
        secondaryTasksExecuted++;
      }
    }

    // Нормальный тик: 30 мс (< 80 мс)
    simulateTickExecution(30);
    t.eq(secondaryTasksExecuted, 1, 'вторичные задачи выполнены при запасе бюджета');
    t.eq(tickBudgetDeferred, 0, 'откладываний нет');

    // Пиковый тик: 85 мс (>= 80 мс)
    simulateTickExecution(85);
    t.eq(secondaryTasksExecuted, 1, 'вторичные задачи НЕ выполнялись при исчерпании бюджета');
    t.eq(tickBudgetDeferred, 1, 'счетчик tickBudgetDeferred увеличен');

    // Еще один нормальный тик: 45 мс
    simulateTickExecution(45);
    t.eq(secondaryTasksExecuted, 2, 'вторичные задачи возобновились после возврата в бюджет');
    t.eq(tickBudgetDeferred, 1, 'счетчик откладываний остался прежним');
  }

  // 3. Статический аудит кода server.js
  t.suite('tick-timing: проверка исходного кода server.js');
  {
    const serverCode = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');

    t.ok(serverCode.includes('const TICK_HZ = 10;'), 'TICK_HZ определен как 10');
    t.ok(serverCode.includes('const TICK_BUDGET_MS = 80;'), 'TICK_BUDGET_MS определен как 80');
    t.ok(serverCode.includes('const TICK_NS = BigInt(Math.round(TICK_MS)) * 1_000_000n;'), 'TICK_NS вычисляется через BigInt');
    t.ok(serverCode.includes('function scheduleNextTick()'), 'функция scheduleNextTick реализована');
    t.ok(serverCode.includes('function startTickLoop()'), 'функция startTickLoop реализована');
    t.ok(serverCode.includes('function stopTickLoop()'), 'функция stopTickLoop реализована');
    t.ok(serverCode.includes('tickBudgetDeferred'), 'переменная tickBudgetDeferred присутствует');
    t.ok(serverCode.includes('tickOverruns'), 'переменная tickOverruns присутствует');
    t.ok(serverCode.includes('tickRateActual'), 'переменная tickRateActual присутствует');

    // Проверка метрик
    t.ok(/tickHz:\s*tickRateActual/.test(serverCode), 'metricsPayload экспортирует tickHz');
    t.ok(/tickOverruns:\s*tickOverruns/.test(serverCode), 'metricsPayload экспортирует tickOverruns');
    t.ok(/tickBudgetDeferred:\s*tickBudgetDeferred/.test(serverCode), 'metricsPayload экспортирует tickBudgetDeferred');

    // Проверка предотвращения лавины тиков
    t.ok(serverCode.includes('delayMs < -200'), 'проверка порога отставания 200 мс в scheduleNextTick');
    t.ok(serverCode.includes('delayMs < 2'), 'гарантия минимального окна 2 мс для сетевого I/O');
  }

  // 4. Реальный таймерный тест с process.hrtime.bigint()
  t.suite('tick-timing: реальный микро-прогон монотонного планировщика');
  {
    const intervalMs = 20; // ускоренный интервал для быстрого теста
    const intervalNs = BigInt(intervalMs) * 1_000_000n;
    let targetNs = process.hrtime.bigint() + intervalNs;
    const tickDeltas = [];
    let prevTickNs = process.hrtime.bigint();

    await new Promise((resolve) => {
      let count = 0;
      function testTick() {
        const nowNs = process.hrtime.bigint();
        const deltaMs = Number((nowNs - prevTickNs) / 1_000_000n);
        prevTickNs = nowNs;
        if (count > 0) tickDeltas.push(deltaMs);

        count++;
        if (count >= 5) {
          resolve();
          return;
        }

        targetNs += intervalNs;
        let delay = Number((targetNs - nowNs) / 1_000_000n);
        if (delay < 2) delay = 2;
        setTimeout(testTick, delay);
      }
      setTimeout(testTick, intervalMs);
    });

    t.eq(tickDeltas.length, 4, 'собрано 4 интервала между тиками');
    for (let i = 0; i < tickDeltas.length; i++) {
      // Допуск ±12 мс для шедулера Node.js в тестовой среде
      t.near(tickDeltas[i], intervalMs, 12, `интервал тика #${i + 1} (${tickDeltas[i]} мс) близок к целевому ${intervalMs} мс`);
    }
  }
};
