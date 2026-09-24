// SCRIPTS / BUILD_ARMOR_DATABASE_HTML.JS
// Generates client/armor-database.html with complete Operator + Engineer Armor & Set Knowledge Base.
// Strictly authentic Steampunk Russian names (canonical L2 C1 balance).
const fs = require('fs');
const path = require('path');

const engSetsRaw = require('../data/engineer_sets_db.json');
const opSetsRaw = require('../data/operator_sets_db.json');
const engArmorsRaw = require('../data/engineer_armor_db.json');
const opArmorsRaw = require('../data/operator_armor_db.json');

// Normalize Sets
const opSets = opSetsRaw.map(s => {
  const isHeavy = ['wooden', 'bronze_ng', 'ring_mail', 'scale_mail'].includes(s.id);
  return Object.assign({}, s, {
    class: 'operator',
    classLabel: 'Оператор',
    armorType: isHeavy ? 'heavy' : 'light',
    armorTypeLabel: isHeavy ? 'Тяжелая броня' : 'Легкая броня'
  });
});

const engSets = engSetsRaw.map(s => {
  return Object.assign({}, s, {
    class: 'engineer',
    classLabel: 'Инженер',
    armorType: 'robe',
    armorTypeLabel: 'Магическая роба'
  });
});

const allSets = [...opSets, ...engSets];

// Normalize Items
const seenArmorIds = new Set();
const allArmors = [];

opArmorsRaw.forEach(a => {
  if (!seenArmorIds.has(a.id)) {
    seenArmorIds.add(a.id);
    allArmors.push(Object.assign({}, a, {
      class: a.slot === 'head' || a.slot === 'boots' || a.slot === 'gloves' ? 'all' : 'operator',
      classLabel: a.slot === 'head' || a.slot === 'boots' || a.slot === 'gloves' ? 'Общее / Оператор' : 'Оператор'
    }));
  }
});

engArmorsRaw.forEach(a => {
  if (!seenArmorIds.has(a.id)) {
    seenArmorIds.add(a.id);
    const isCommon = ['goggles', 'leather_cap', 'leather_gloves', 'work_boots', 'steam_helmet', 'steam_boots', 'copper_plate'].includes(a.id);
    allArmors.push(Object.assign({}, a, {
      class: isCommon ? 'all' : 'engineer',
      classLabel: isCommon ? 'Общее' : 'Инженер',
      armorType: a.armorType || (a.slot === 'chest' || a.slot === 'legs' ? 'robe' : 'light'),
      armorTypeLabel: a.armorTypeLabel || (a.armorType === 'heavy' ? 'Тяжелая броня' : a.armorType === 'robe' ? 'Магическая роба' : 'Легкая броня')
    }));
  }
});

const setsJson = JSON.stringify(allSets);
const armorsJson = JSON.stringify(allArmors);

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>База Брони и Комплектов (Оператор + Инженер) | Project Steam</title>
  <meta name="description" content="Официальная техническая база данных защитной экипировки и комплектов Project Steam (Оператор и Инженер): тяжелая, легкая броня и контурные робы, 11 комплектов сетов, бонусы защиты, HP и скорости модуляции.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🥋</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #0c0f14;
      --bg-card: rgba(22, 28, 38, 0.88);
      --bg-card-hover: rgba(30, 40, 56, 0.98);
      --border-card: rgba(218, 165, 32, 0.28);
      --border-card-hover: rgba(230, 180, 50, 0.65);
      --accent-gold: #e5b352;
      --accent-copper: #c87a3e;
      --accent-cyan: #38bdf8;
      --accent-emerald: #34d399;
      --accent-ruby: #f87171;
      --accent-purple: #c084fc;
      --grade-ng: #94a3b8;
      --grade-d: #38bdf8;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --text-sub: #cbd5e1;
      --shadow-glow: 0 0 25px rgba(229, 179, 82, 0.18);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 50% 10%, #17212e 0%, #090c10 80%);
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      line-height: 1.5;
      padding-bottom: 60px;
    }

    .bg-deco {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none;
      background-image: 
        radial-gradient(circle at 15% 25%, rgba(200, 122, 62, 0.06) 0%, transparent 45%),
        radial-gradient(circle at 85% 75%, rgba(56, 189, 248, 0.05) 0%, transparent 45%);
      z-index: 0;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px 20px;
      position: relative;
      z-index: 1;
    }

    /* HEADER */
    header {
      text-align: center;
      margin-bottom: 28px;
      padding-bottom: 24px;
      border-bottom: 1px solid rgba(218, 165, 32, 0.2);
    }

    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(229, 179, 82, 0.12);
      border: 1px solid rgba(229, 179, 82, 0.35);
      color: var(--accent-gold);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
    }

    h1 {
      font-family: 'Cinzel', serif;
      font-size: clamp(1.8rem, 3.8vw, 2.6rem);
      font-weight: 900;
      background: linear-gradient(135deg, #fff 20%, #e5b352 60%, #c87a3e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
      letter-spacing: 0.04em;
    }

    .header-sub {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 900px;
      margin: 0 auto 18px;
      line-height: 1.6;
    }

    .header-links {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .btn-header {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      color: var(--text-sub);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .btn-header:hover {
      background: rgba(229, 179, 82, 0.15);
      border-color: rgba(229, 179, 82, 0.4);
      color: #fff;
    }
    .btn-header.active {
      background: rgba(229, 179, 82, 0.22);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      font-weight: 600;
    }

    /* TABS */
    .tabs-nav {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 22px;
      background: rgba(18, 24, 34, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      color: var(--text-muted);
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .tab-btn:hover {
      background: rgba(28, 38, 54, 0.9);
      color: var(--text-main);
      border-color: rgba(229, 179, 82, 0.3);
    }
    .tab-btn.active {
      background: linear-gradient(135deg, rgba(229, 179, 82, 0.22), rgba(200, 122, 62, 0.15));
      border-color: var(--accent-gold);
      color: #fff;
      box-shadow: 0 0 20px rgba(229, 179, 82, 0.2);
    }

    /* CONTROLS BAR */
    .controls-bar {
      background: rgba(18, 24, 34, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 26px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .search-row {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .search-box {
      flex: 1;
      position: relative;
    }
    .search-box input {
      width: 100%;
      background: rgba(10, 14, 20, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 11px 16px 11px 42px;
      color: #fff;
      font-size: 0.92rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-box input:focus {
      border-color: var(--accent-gold);
    }
    .search-icon {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
    }

    .chips-row {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .chips-label {
      font-size: 0.82rem;
      color: var(--text-muted);
      font-weight: 600;
      margin-right: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .chip {
      padding: 6px 13px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      font-size: 0.82rem;
      color: var(--text-sub);
      cursor: pointer;
      transition: all 0.2s;
    }
    .chip:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    .chip.active {
      background: rgba(229, 179, 82, 0.2);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      font-weight: 600;
    }
    .chip.grade-ng.active {
      background: rgba(148, 163, 184, 0.2);
      border-color: var(--grade-ng);
      color: var(--grade-ng);
    }
    .chip.grade-d.active {
      background: rgba(56, 189, 248, 0.2);
      border-color: var(--grade-d);
      color: var(--grade-d);
    }

    /* SETS VIEW */
    .sets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(620px, 1fr));
      gap: 22px;
    }
    @media (max-width: 768px) {
      .sets-grid { grid-template-columns: 1fr; }
    }

    .set-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }
    .set-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent-gold), var(--accent-copper));
      opacity: 0.8;
    }
    .set-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-card-hover);
      box-shadow: var(--shadow-glow);
      transform: translateY(-2px);
    }

    .set-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }
    .set-titles h3 {
      font-family: 'Cinzel', serif;
      font-size: 1.35rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .set-level-info {
      font-size: 0.84rem;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .set-badges-top {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .grade-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .grade-badge.no_grade {
      background: rgba(148, 163, 184, 0.15);
      border: 1px solid rgba(148, 163, 184, 0.4);
      color: #cbd5e1;
    }
    .grade-badge.d {
      background: rgba(56, 189, 248, 0.18);
      border: 1px solid rgba(56, 189, 248, 0.45);
      color: #38bdf8;
    }

    .class-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      letter-spacing: 0.04em;
    }
    .class-badge.operator {
      background: rgba(229, 179, 82, 0.15);
      border: 1px solid rgba(229, 179, 82, 0.4);
      color: var(--accent-gold);
    }
    .class-badge.engineer {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
    }

    .type-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: var(--text-sub);
    }

    .pieces-req-badge {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(229, 179, 82, 0.15);
      border: 1px solid rgba(229, 179, 82, 0.35);
      color: var(--accent-gold);
    }

    /* Bonus Banner */
    .set-bonus-banner {
      background: linear-gradient(135deg, rgba(229, 179, 82, 0.12), rgba(200, 122, 62, 0.08));
      border: 1px solid rgba(229, 179, 82, 0.35);
      border-radius: 10px;
      padding: 14px 16px;
    }
    .bonus-tag {
      display: inline-block;
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--accent-gold);
      margin-bottom: 4px;
    }
    .bonus-desc {
      font-size: 0.86rem;
      color: var(--text-sub);
      line-height: 1.45;
    }

    /* Subgrid of pieces */
    .set-pieces-subgrid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }
    .set-piece-mini {
      background: rgba(10, 14, 20, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .set-piece-icon {
      width: 44px;
      height: 44px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }
    .set-piece-icon img {
      width: 36px;
      height: 36px;
      object-fit: contain;
    }
    .set-piece-info {
      flex: 1;
      min-width: 0;
    }
    .set-piece-name {
      font-size: 0.84rem;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .set-piece-meta {
      font-size: 0.74rem;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      margin-top: 2px;
    }

    /* Summary Bar */
    .set-summary-bar {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      background: rgba(10, 14, 20, 0.4);
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px dashed rgba(255, 255, 255, 0.1);
      font-size: 0.82rem;
      color: var(--text-muted);
    }
    .set-summary-bar strong {
      color: var(--text-main);
    }

    .set-lore {
      font-size: 0.84rem;
      color: var(--text-muted);
      font-style: italic;
      line-height: 1.5;
      border-left: 2px solid var(--accent-copper);
      padding-left: 12px;
    }

    /* ARMORS GRID VIEW */
    .armors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
      gap: 18px;
    }

    .armor-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: all 0.2s ease;
      position: relative;
    }
    .armor-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-card-hover);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    .armor-card-top {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .armor-card-icon {
      width: 54px;
      height: 54px;
      background: rgba(15, 21, 30, 0.9);
      border: 1px solid rgba(229, 179, 82, 0.35);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .armor-card-icon img {
      width: 44px;
      height: 44px;
      object-fit: contain;
    }
    .armor-card-meta {
      flex: 1;
      min-width: 0;
    }
    .armor-card-name {
      font-size: 1rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .armor-card-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .set-tag-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(229, 179, 82, 0.12);
      border: 1px solid rgba(229, 179, 82, 0.3);
      color: var(--accent-gold);
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
    }
    .set-tag-badge:hover {
      background: rgba(229, 179, 82, 0.22);
    }

    .slot-tag-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-sub);
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .armor-stats-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.84rem;
    }
    .armor-stats-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .armor-stats-table tr:last-child {
      border-bottom: none;
    }
    .armor-stats-table td {
      padding: 5px 0;
    }
    .armor-stats-table td:first-child {
      color: var(--text-muted);
    }
    .armor-stats-table td:last-child {
      text-align: right;
      font-weight: 600;
      color: var(--text-main);
    }

    .stat-def-highlight {
      color: var(--accent-cyan) !important;
      font-size: 0.95rem;
    }

    .armor-card-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.45;
      background: rgba(10, 14, 20, 0.4);
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    /* TABLE VIEW */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.86rem;
    }
    th {
      background: rgba(15, 21, 30, 0.9);
      color: var(--accent-gold);
      padding: 14px 16px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      border-bottom: 1px solid rgba(218, 165, 32, 0.25);
    }
    th:hover {
      background: rgba(28, 38, 54, 0.9);
    }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      color: var(--text-sub);
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.03);
      color: #fff;
    }
    .table-icon-cell {
      width: 44px;
      padding: 8px 12px;
    }
    .table-icon {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    /* FOOTER */
    footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 24px;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    footer a {
      color: var(--accent-gold);
      text-decoration: none;
    }
    footer a:hover {
      text-decoration: underline;
    }

    .count-indicator {
      font-size: 0.88rem;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .count-indicator strong {
      color: var(--accent-gold);
    }
  </style>
</head>
<body>
  <div class="bg-deco"></div>

  <div class="container">
    <header>
      <div class="header-badge">🛡️ База Данных Экипировки • Project Steam</div>
      <h1>БАЗА БРОНИ И КОМПЛЕКТОВ</h1>
      <p class="header-sub">Официальная техническая база данных защитной экипировки классов <strong>Оператор</strong> и <strong>Инженер</strong> (Фаза 1: 1–20 ур., No-Grade и Low D): тяжелые латы, легкая броня и контурные робы, 11 комплектов сетов с точными бонусами защиты (P.Def), запаса здоровья и скорости модуляции.</p>
      <div class="header-links">
        <a href="database.html" class="btn-header">📖 Интро</a>
        <a href="weapons-database.html" class="btn-header">⚔️ Оружие</a>
        <a href="armor-database.html" class="btn-header active">🥋 Броня</a>
        <a href="crafting-database.html" class="btn-header">🔨 Крафт</a>
        <a href="mobs-database.html" class="btn-header">👾 Мобы</a>
        <a href="skills-database.html" class="btn-header">⚡ Скилы</a>
        <a href="index.html" class="btn-header">🎮 В Игру</a>
        <a href="menu.html" class="btn-header">📋 Главное Меню</a>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="tabs-nav">
      <button type="button" class="tab-btn active" data-tab="sets" onclick="switchTab('sets')">
        <span>🧩</span> Комплекты Сетов (<span id="totalSetsCount">11</span>)
      </button>
      <button type="button" class="tab-btn" data-tab="armors" onclick="switchTab('armors')">
        <span>🥋</span> Элементы Брони (<span id="totalArmorsCount">37</span>)
      </button>
      <button type="button" class="tab-btn" data-tab="table" onclick="switchTab('table')">
        <span>📊</span> Сводная Таблица
      </button>
    </nav>

    <!-- Sets Controls Bar -->
    <div class="controls-bar" id="setsControlsBar">
      <div class="chips-row">
        <span class="chips-label">Класс:</span>
        <button type="button" class="chip active" data-set-class="all" onclick="setSetClassFilter('all')">Все комплекты (11)</button>
        <button type="button" class="chip" data-set-class="operator" onclick="setSetClassFilter('operator')">🛡️ Оператор (7)</button>
        <button type="button" class="chip" data-set-class="engineer" onclick="setSetClassFilter('engineer')">⚡ Инженер (4)</button>
      </div>
      <div class="chips-row">
        <span class="chips-label">Тип брони:</span>
        <button type="button" class="chip active" data-set-type="all" onclick="setSetTypeFilter('all')">Все типы</button>
        <button type="button" class="chip" data-set-type="heavy" onclick="setSetTypeFilter('heavy')">🛡️ Тяжелая</button>
        <button type="button" class="chip" data-set-type="light" onclick="setSetTypeFilter('light')">🥾 Легкая</button>
        <button type="button" class="chip" data-set-type="robe" onclick="setSetTypeFilter('robe')">🔮 Роба</button>
      </div>
      <div class="chips-row">
        <span class="chips-label">Ранг:</span>
        <button type="button" class="chip active" data-set-grade="all" onclick="setSetGradeFilter('all')">Все ранги</button>
        <button type="button" class="chip grade-ng" data-set-grade="no_grade" onclick="setSetGradeFilter('no_grade')">No-Grade</button>
        <button type="button" class="chip grade-d" data-set-grade="d" onclick="setSetGradeFilter('d')">Low D-Ранг</button>
      </div>
    </div>

    <!-- Controls Bar (Active for Armors and Table) -->
    <div class="controls-bar" id="controlsBar" style="display: none;">
      <div class="search-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="searchInput" placeholder="Поиск по названию, слоту, сету или описанию..." oninput="handleSearch()">
        </div>
      </div>

      <div class="chips-row">
        <span class="chips-label">Класс:</span>
        <button type="button" class="chip active" data-class="all" onclick="setClassFilter('all')">Все классы</button>
        <button type="button" class="chip" data-class="operator" onclick="setClassFilter('operator')">🛡️ Оператор</button>
        <button type="button" class="chip" data-class="engineer" onclick="setClassFilter('engineer')">⚡ Инженер</button>
      </div>

      <div class="chips-row">
        <span class="chips-label">Тип брони:</span>
        <button type="button" class="chip active" data-armor-type="all" onclick="setArmorTypeFilter('all')">Все типы</button>
        <button type="button" class="chip" data-armor-type="heavy" onclick="setArmorTypeFilter('heavy')">🛡️ Тяжелая</button>
        <button type="button" class="chip" data-armor-type="light" onclick="setArmorTypeFilter('light')">🥾 Легкая</button>
        <button type="button" class="chip" data-armor-type="robe" onclick="setArmorTypeFilter('robe')">🔮 Роба</button>
      </div>

      <div class="chips-row">
        <span class="chips-label">Ранг:</span>
        <button type="button" class="chip active" data-grade="all" onclick="setGradeFilter('all')">Все</button>
        <button type="button" class="chip grade-ng" data-grade="no_grade" onclick="setGradeFilter('no_grade')">No-Grade</button>
        <button type="button" class="chip grade-d" data-grade="d" onclick="setGradeFilter('d')">D-Ранг</button>
      </div>

      <div class="chips-row">
        <span class="chips-label">Слот:</span>
        <button type="button" class="chip active" data-slot="all" onclick="setSlotFilter('all')">Все слоты</button>
        <button type="button" class="chip" data-slot="chest" onclick="setSlotFilter('chest')">Верх (Тело)</button>
        <button type="button" class="chip" data-slot="legs" onclick="setSlotFilter('legs')">Низ (Ноги)</button>
        <button type="button" class="chip" data-slot="gloves" onclick="setSlotFilter('gloves')">Перчатки</button>
        <button type="button" class="chip" data-slot="boots" onclick="setSlotFilter('boots')">Обувь</button>
        <button type="button" class="chip" data-slot="head" onclick="setSlotFilter('head')">Голова</button>
        <button type="button" class="chip" data-slot="shield" onclick="setSlotFilter('shield')">Щит</button>
      </div>
    </div>

    <!-- TAB 1: SETS -->
    <div id="tabSets" class="tab-content">
      <div class="count-indicator" id="setsCountIndicator">Отображено комплектов: <strong>11</strong> из 11</div>
      <div class="sets-grid" id="setsGrid"></div>
    </div>

    <!-- TAB 2: ARMORS CARDS -->
    <div id="tabArmors" class="tab-content" style="display: none;">
      <div class="count-indicator" id="armorsCountIndicator">Отображено элементов: <strong>37</strong> из 37</div>
      <div class="armors-grid" id="armorsGrid"></div>
    </div>

    <!-- TAB 3: TABLE -->
    <div id="tabTable" class="tab-content" style="display: none;">
      <div class="count-indicator" id="tableCountIndicator">Элементов в таблице: <strong>37</strong></div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th class="table-icon-cell"></th>
              <th onclick="sortTable('name')">Название</th>
              <th onclick="sortTable('slotLabel')">Слот</th>
              <th onclick="sortTable('classLabel')">Класс</th>
              <th onclick="sortTable('armorTypeLabel')">Тип</th>
              <th onclick="sortTable('grade')">Ранг</th>
              <th onclick="sortTable('defense')">Защита (P.Def) ⬍</th>
              <th onclick="sortTable('setName')">Сет</th>
              <th onclick="sortTable('weight')">Вес ⬍</th>
              <th onclick="sortTable('price')">Цена (Медь) ⬍</th>
              <th onclick="sortTable('crystalCount')">Кристаллы D ⬍</th>
              <th onclick="sortTable('levelReq')">Мин. Ур.</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
    </div>

    <footer>
      <p>© Project Steam • Остров Поющей Стали. Разработка и девлоги: <a href="promo.html">YouTube @AindieGus</a></p>
    </footer>
  </div>

  <script>
    const SETS_DATA = ${setsJson};
    const ARMORS_DATA = ${armorsJson};

    document.getElementById('totalSetsCount').textContent = SETS_DATA.length;
    document.getElementById('totalArmorsCount').textContent = ARMORS_DATA.length;

    let currentTab = 'sets';
    let currentSetClass = 'all';
    let currentSetType = 'all';
    let currentSetGrade = 'all';

    let currentClass = 'all';
    let currentArmorType = 'all';
    let currentGrade = 'all';
    let currentSlot = 'all';
    let searchQuery = '';
    let sortColumn = 'defense';
    let sortAsc = false;

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });

      document.getElementById('tabSets').style.display = tabId === 'sets' ? 'block' : 'none';
      document.getElementById('tabArmors').style.display = tabId === 'armors' ? 'block' : 'none';
      document.getElementById('tabTable').style.display = tabId === 'table' ? 'block' : 'none';

      document.getElementById('setsControlsBar').style.display = tabId === 'sets' ? 'flex' : 'none';
      document.getElementById('controlsBar').style.display = tabId === 'sets' ? 'none' : 'flex';

      if (tabId === 'sets') renderSets();
      if (tabId === 'armors') renderArmors();
      if (tabId === 'table') renderTable();
    }

    // Set filters
    function setSetClassFilter(cls) {
      currentSetClass = cls;
      document.querySelectorAll('[data-set-class]').forEach(b => b.classList.toggle('active', b.dataset.setClass === cls));
      renderSets();
    }

    function setSetTypeFilter(type) {
      currentSetType = type;
      document.querySelectorAll('[data-set-type]').forEach(b => b.classList.toggle('active', b.dataset.setType === type));
      renderSets();
    }

    function setSetGradeFilter(gr) {
      currentSetGrade = gr;
      document.querySelectorAll('[data-set-grade]').forEach(b => b.classList.toggle('active', b.dataset.setGrade === gr));
      renderSets();
    }

    function renderSets() {
      const filtered = SETS_DATA.filter(s => {
        if (currentSetClass !== 'all' && s.class !== currentSetClass) return false;
        if (currentSetType !== 'all' && s.armorType !== currentSetType) return false;
        if (currentSetGrade !== 'all' && s.grade !== currentSetGrade) return false;
        return true;
      });

      document.getElementById('setsCountIndicator').innerHTML = \`Отображено комплектов: <strong>\${filtered.length}</strong> из \${SETS_DATA.length}\`;
      const container = document.getElementById('setsGrid');

      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Комплекты не найдены по заданным фильтрам.</div>';
        return;
      }

      container.innerHTML = filtered.map(set => {
        const piecesHtml = set.pieces.map(p => {
          return \`
            <div class="set-piece-mini">
              <div class="set-piece-icon">
                <img src="\${p.icon}" alt="\${p.name}" loading="lazy" onerror="this.src='assets/inventar/icons/engineer_jacket_low.webp'">
              </div>
              <div class="set-piece-info">
                <div class="set-piece-name" title="\${p.name}">\${p.name}</div>
                <div class="set-piece-meta">
                  <span>\${p.slotLabel}</span>
                  <span style="color:var(--accent-cyan);">Def \${p.def}</span>
                </div>
              </div>
            </div>
          \`;
        }).join('');

        const crystalsHtml = set.crystalCount > 0 
          ? \`<div class="summary-stat">Кристаллы D: <strong>\${set.crystalCount}</strong></div>\`
          : '';

        return \`
          <div class="set-card">
            <div class="set-header">
              <div class="set-titles">
                <h3>\${set.name}</h3>
                <div class="set-level-info">
                  <span>Требуемый уровень: \${set.levelReq}+</span>
                  \${set.l2Ref ? \`<span style="color:var(--accent-gold); opacity:0.8;">• L2: \${set.l2Ref}</span>\` : ''}
                </div>
              </div>
              <div class="set-badges-top">
                <span class="class-badge \${set.class}">\${set.classLabel}</span>
                <span class="type-badge">\${set.armorTypeLabel}</span>
                <span class="grade-badge \${set.grade}">\${set.gradeLabel}</span>
                <span class="pieces-req-badge">\${set.requiredPieces} части</span>
              </div>
            </div>

            <div class="set-bonus-banner">
              <div class="bonus-tag">\${set.bonusBadge}</div>
              <div class="bonus-desc">\${set.bonusDescription}</div>
            </div>

            <div class="set-pieces-subgrid">
              \${piecesHtml}
            </div>

            <div class="set-summary-bar">
              <div class="summary-stat">Суммарная защита: <strong>\${set.totalDef} P.Def</strong></div>
              <div class="summary-stat">Общий вес: <strong>\${set.totalWeight}</strong></div>
              <div class="summary-stat">Стоимость: <strong>\${set.totalPrice.toLocaleString('ru-RU')}</strong></div>
              \${crystalsHtml}
            </div>

            <div class="set-lore">
              "\${set.lore}"
            </div>
          </div>
        \`;
      }).join('');
    }

    // Armor filters
    function setClassFilter(cls) {
      currentClass = cls;
      document.querySelectorAll('[data-class]').forEach(b => b.classList.toggle('active', b.dataset.class === cls));
      renderArmors();
      if (currentTab === 'table') renderTable();
    }

    function setArmorTypeFilter(type) {
      currentArmorType = type;
      document.querySelectorAll('[data-armor-type]').forEach(b => b.classList.toggle('active', b.dataset.armorType === type));
      renderArmors();
      if (currentTab === 'table') renderTable();
    }

    function setGradeFilter(gr) {
      currentGrade = gr;
      document.querySelectorAll('[data-grade]').forEach(b => b.classList.toggle('active', b.dataset.grade === gr));
      renderArmors();
      if (currentTab === 'table') renderTable();
    }

    function setSlotFilter(slot) {
      currentSlot = slot;
      document.querySelectorAll('[data-slot]').forEach(b => b.classList.toggle('active', b.dataset.slot === slot));
      renderArmors();
      if (currentTab === 'table') renderTable();
    }

    function handleSearch() {
      searchQuery = document.getElementById('searchInput').value.trim();
      renderArmors();
      if (currentTab === 'table') renderTable();
    }

    function filterArmorsList() {
      return ARMORS_DATA.filter(item => {
        if (currentClass !== 'all') {
          if (currentClass === 'operator' && item.class !== 'operator' && item.class !== 'all') return false;
          if (currentClass === 'engineer' && item.class !== 'engineer' && item.class !== 'all') return false;
        }
        if (currentArmorType !== 'all' && item.armorType !== currentArmorType) return false;
        if (currentGrade !== 'all' && item.grade !== currentGrade) return false;
        if (currentSlot !== 'all') {
          if (currentSlot === 'chest' && item.slot !== 'chest') return false;
          if (currentSlot === 'legs' && item.slot !== 'legs') return false;
          if (currentSlot === 'gloves' && item.slot !== 'gloves') return false;
          if (currentSlot === 'head' && item.slot !== 'head') return false;
          if (currentSlot === 'boots' && item.slot !== 'boots') return false;
          if (currentSlot === 'shield' && item.slot !== 'shield') return false;
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchName = (item.name || '').toLowerCase().includes(q);
          const matchSet = (item.setName || '').toLowerCase().includes(q);
          const matchDesc = (item.description || '').toLowerCase().includes(q);
          const matchSlot = (item.slotLabel || '').toLowerCase().includes(q);
          const matchClass = (item.classLabel || '').toLowerCase().includes(q);
          if (!matchName && !matchSet && !matchDesc && !matchSlot && !matchClass) return false;
        }
        return true;
      });
    }

    function renderArmors() {
      const items = filterArmorsList();
      document.getElementById('armorsCountIndicator').innerHTML = \`Отображено элементов: <strong>\${items.length}</strong> из \${ARMORS_DATA.length}\`;
      const container = document.getElementById('armorsGrid');

      if (items.length === 0) {
        container.innerHTML = \`<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Ничего не найдено по заданным фильтрам.</div>\`;
        return;
      }

      container.innerHTML = items.map(a => {
        const setBadgeHtml = a.setName 
          ? \`<span class="set-tag-badge" onclick="selectSetDirectly('\${a.setId}')" title="Нажмите, чтобы открыть комплект">\${a.setName}</span>\`
          : '';

        const crystalRowHtml = a.crystalCount > 0
          ? \`<tr><td>Кристаллы D:</td><td>\${a.crystalCount} шт.</td></tr>\`
          : '';

        return \`
          <div class="armor-card">
            <div class="armor-card-top">
              <div class="armor-card-icon">
                <img src="\${a.icon}" alt="\${a.name}" loading="lazy" onerror="this.src='assets/inventar/icons/engineer_jacket_low.webp'">
              </div>
              <div class="armor-card-meta">
                <div class="armor-card-name">\${a.name}</div>
                <div class="armor-card-badges">
                  <span class="grade-badge \${a.grade}">\${a.gradeLabel}</span>
                  <span class="slot-tag-badge">\${a.slotLabel}</span>
                  \${setBadgeHtml}
                </div>
              </div>
            </div>

            <table class="armor-stats-table">
              <tr>
                <td>Физ. Защита (P.Def):</td>
                <td class="stat-def-highlight">\${a.defense}</td>
              </tr>
              <tr>
                <td>Класс / Назначение:</td>
                <td>\${a.classLabel || 'Общее'}</td>
              </tr>
              <tr>
                <td>Тип экипировки:</td>
                <td>\${a.armorTypeLabel || 'Броня'}</td>
              </tr>
              <tr>
                <td>Вес:</td>
                <td>\${a.weight}</td>
              </tr>
              <tr>
                <td>Цена в лавке:</td>
                <td>\${a.price.toLocaleString('ru-RU')} медных</td>
              </tr>
              <tr>
                <td>Мин. уровень:</td>
                <td>\${a.levelReq}+</td>
              </tr>
              \${crystalRowHtml}
            </table>

            <div class="armor-card-desc">
              \${a.description || 'Надежное защитное снаряжение Project Steam.'}
            </div>
          </div>
        \`;
      }).join('');
    }

    function selectSetDirectly(setId) {
      switchTab('sets');
      setSetClassFilter('all');
      setSetTypeFilter('all');
      setSetGradeFilter('all');
      setTimeout(() => {
        const matched = SETS_DATA.find(s => s.id === setId);
        if (matched) {
          const cards = document.querySelectorAll('.set-card');
          cards.forEach(c => {
            if (c.innerHTML.includes(matched.name)) {
              c.scrollIntoView({ behavior: 'smooth', block: 'center' });
              c.style.outline = '2px solid var(--accent-gold)';
              setTimeout(() => c.style.outline = 'none', 2500);
            }
          });
        }
      }, 50);
    }

    function sortTable(column) {
      if (sortColumn === column) {
        sortAsc = !sortAsc;
      } else {
        sortColumn = column;
        sortAsc = (column === 'name' || column === 'slotLabel' || column === 'classLabel');
      }
      renderTable();
    }

    function renderTable() {
      const items = filterArmorsList();
      document.getElementById('tableCountIndicator').innerHTML = \`Элементов в таблице: <strong>\${items.length}</strong> из \${ARMORS_DATA.length}\`;

      items.sort((a, b) => {
        let valA = a[sortColumn];
        let valB = b[sortColumn];

        if (valA == null) valA = '';
        if (valB == null) valB = '';

        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB, 'ru') : valB.localeCompare(valA, 'ru');
        }
        return sortAsc ? valA - valB : valB - valA;
      });

      const tbody = document.getElementById('tableBody');
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 30px; color: var(--text-muted);">Ничего не найдено.</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(a => {
        return \`
          <tr>
            <td class="table-icon-cell">
              <img src="\${a.icon}" alt="\${a.name}" class="table-icon" loading="lazy" onerror="this.src='assets/inventar/icons/engineer_jacket_low.webp'">
            </td>
            <td style="font-weight: 600; color: #fff;">\${a.name}</td>
            <td>\${a.slotLabel}</td>
            <td>\${a.classLabel || 'Общее'}</td>
            <td>\${a.armorTypeLabel || 'Броня'}</td>
            <td><span class="grade-badge \${a.grade}">\${a.gradeLabel}</span></td>
            <td style="font-weight: 700; color: var(--accent-cyan);">\${a.defense}</td>
            <td>\${a.setName || '—'}</td>
            <td>\${a.weight}</td>
            <td>\${a.price.toLocaleString('ru-RU')}</td>
            <td>\${a.crystalCount > 0 ? a.crystalCount : '—'}</td>
            <td>\${a.levelReq}+</td>
          </tr>
        \`;
      }).join('');
    }

    // Init
    renderSets();
  </script>
</body>
</html>
`;

const outputPath = path.join(__dirname, '../client/armor-database.html');
fs.writeFileSync(outputPath, htmlContent, 'utf-8');
console.log(`Successfully generated ${outputPath} with ${allSets.length} sets and ${allArmors.length} armor items.`);
