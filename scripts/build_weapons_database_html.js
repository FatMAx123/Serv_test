// SCRIPTS / BUILD_WEAPONS_DATABASE_HTML.JS
const fs = require('fs');
const path = require('path');

const weaponsData = require('../data/weapons_db.json');
const shieldsData = require('../data/shields_db.json');

// Enrich weapons with L2 C1 combat canon metrics
weaponsData.forEach(w => {
  if (!w.critRate) {
    if (w.weaponClass === 'dagger' || w.weaponClass === 'bow') w.critRate = 120;
    else if (w.weaponClass === '1h_sword' || w.weaponClass === 'sword') w.critRate = 80;
    else w.critRate = 40;
  }
  if (!w.randomDmg) {
    if (w.weaponClass === 'dagger') w.randomDmg = '±5%';
    else if (w.weaponClass === '1h_sword' || w.weaponClass === 'sword') w.randomDmg = '±10%';
    else if (w.weaponClass === 'bow') w.randomDmg = '±10%';
    else w.randomDmg = '±20%';
  }
});

const weaponsJsonStr = JSON.stringify(weaponsData);
const shieldsJsonStr = JSON.stringify(shieldsData);

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>База Оружия и Щитов: Оператор и Инженер | Project Steam</title>
  <meta name="description" content="Официальная техническая база данных оружия и щитов рангов No-Grade и D-Grade Project Steam: канонические статы L2 C1 для Оператора (Human Fighter) и Инженера. Мечи, молоты, кинжалы, луки и резонаторы.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚔️</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
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
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px 20px;
      position: relative;
      z-index: 1;
    }

    header {
      text-align: center;
      margin-bottom: 26px;
      padding: 28px 20px 22px;
      background: rgba(15, 21, 30, 0.75);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-card);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .header-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(229, 179, 82, 0.12);
      border: 1px solid rgba(229, 179, 82, 0.4);
      color: var(--accent-gold);
      padding: 4px 14px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    h1 {
      font-family: 'Cinzel', serif;
      font-size: 2.2rem;
      font-weight: 900;
      letter-spacing: 2px;
      background: linear-gradient(135deg, #fff7d6 0%, #e5b352 50%, #b87333 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .header-sub {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 960px;
      margin: 0 auto 18px;
      line-height: 1.6;
    }
    .header-links {
      display: flex;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn-header {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(229, 179, 82, 0.3);
      color: var(--text-main);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .btn-header:hover {
      background: rgba(229, 179, 82, 0.18);
      border-color: var(--accent-gold);
      color: #fff;
      transform: translateY(-1px);
    }
    .btn-header.active {
      color: var(--accent-gold);
      border-color: var(--accent-gold);
      background: rgba(229, 179, 82, 0.18);
      box-shadow: 0 0 14px rgba(229, 179, 82, 0.25);
    }

    /* Tabs Navigation */
    .tabs-nav {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid rgba(255,255,255,0.08);
      margin-bottom: 22px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 12px 18px;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      border-radius: 8px 8px 0 0;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      white-space: nowrap;
      position: relative;
    }
    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255,255,255,0.03);
    }
    .tab-btn.active {
      color: var(--accent-gold);
      background: rgba(229, 179, 82, 0.08);
    }
    .tab-btn.active::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 0;
      width: 100%;
      height: 3px;
      background: var(--accent-gold);
      border-radius: 3px 3px 0 0;
      box-shadow: 0 -1px 8px var(--accent-gold);
    }

    /* Controls Bar */
    .controls-bar {
      background: rgba(18, 24, 34, 0.7);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .search-row {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .search-box {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .search-box input {
      width: 100%;
      background: rgba(10, 14, 20, 0.8);
      border: 1px solid rgba(229, 179, 82, 0.35);
      border-radius: 8px;
      padding: 10px 14px 10px 38px;
      color: var(--text-main);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-box input:focus {
      border-color: var(--accent-gold);
      box-shadow: 0 0 10px rgba(229, 179, 82, 0.2);
    }
    .search-icon {
      position: absolute;
      left: 12px;
      color: var(--accent-gold);
      font-size: 1rem;
      pointer-events: none;
    }
    .chips-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 0.85rem;
    }
    .chips-label {
      color: var(--text-muted);
      font-weight: 600;
      margin-right: 4px;
      min-width: 65px;
    }
    .chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-sub);
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .chip:hover {
      background: rgba(229, 179, 82, 0.12);
      border-color: rgba(229, 179, 82, 0.35);
      color: #fff;
    }
    .chip.active {
      background: rgba(229, 179, 82, 0.2);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      font-weight: 600;
    }
    .chip.chip-op.active { border-color: #ef4444; color: #fca5a5; background: rgba(239, 68, 68, 0.18); }
    .chip.chip-eng.active { border-color: #38bdf8; color: #7dd3fc; background: rgba(56, 189, 248, 0.18); }
    .chip.grade-ng.active { border-color: var(--grade-ng); color: #fff; background: rgba(148, 163, 184, 0.2); }
    .chip.grade-d.active { border-color: var(--grade-d); color: #fff; background: rgba(56, 189, 248, 0.2); }

    /* Weapon Cards Grid */
    .weapons-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(370px, 1fr));
      gap: 20px;
    }
    .weapon-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      transition: all 0.25s ease;
    }
    .weapon-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-card-hover);
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), var(--shadow-glow);
    }
    .weapon-card.grade-d {
      border-color: rgba(56, 189, 248, 0.35);
    }
    .weapon-card.grade-d:hover {
      border-color: rgba(56, 189, 248, 0.7);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 25px rgba(56, 189, 248, 0.2);
    }
    .weapon-card.role-operator {
      border-top: 3px solid #ef4444;
    }
    .weapon-card.role-engineer {
      border-top: 3px solid #38bdf8;
    }

    .weapon-card-header {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .weapon-icon-wrap {
      width: 60px;
      height: 60px;
      border-radius: 10px;
      background: #090d14;
      border: 1px solid rgba(229, 179, 82, 0.35);
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
      position: relative;
    }
    .weapon-icon-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .weapon-icon-wrap .icon-glyph {
      font-size: 1.8rem;
    }
    .weapon-info {
      flex: 1;
      min-width: 0;
    }
    .weapon-name {
      font-family: 'Cinzel', serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.3;
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .weapon-tags-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .badge-role {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-role.role-op { background: rgba(239, 68, 68, 0.18); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.5); }
    .badge-role.role-eng { background: rgba(56, 189, 248, 0.18); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.5); }

    .badge-grade {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-grade.no_grade { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.4); }
    .badge-grade.d { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.5); }
    .badge-type {
      font-size: 0.7rem;
      color: var(--text-muted);
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 7px;
      border-radius: 4px;
    }
    .badge-grip {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .badge-grip.grip-1h { color: #34d399; border-color: rgba(52, 211, 153, 0.3); background: rgba(52, 211, 153, 0.08); }
    .badge-grip.grip-2h { color: #fb923c; border-color: rgba(251, 146, 60, 0.3); background: rgba(251, 146, 60, 0.08); }

    .weapon-stats-box {
      background: rgba(10, 14, 22, 0.6);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 10px 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 14px;
    }
    .stat-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }
    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-main);
    }
    .stat-val.highlight-patk { color: #f87171; }
    .stat-val.highlight-catk { color: #38bdf8; }
    .stat-val.highlight-spd  { color: #e5b352; }
    .stat-val.highlight-crit { color: #fbbf24; }

    .stat-bar-track {
      height: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 3px;
    }
    .stat-bar-fill { height: 100%; border-radius: 2px; }
    .stat-bar-fill.patk { background: linear-gradient(90deg, #f87171, #ef4444); }
    .stat-bar-fill.catk { background: linear-gradient(90deg, #38bdf8, #0284c7); }

    .specs-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      font-size: 0.78rem;
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 10px;
    }
    .spec-row { display: flex; justify-content: space-between; color: var(--text-muted); }
    .spec-row strong { color: var(--text-sub); font-family: 'JetBrains Mono', monospace; }

    .weapon-desc {
      font-size: 0.8rem;
      color: var(--text-muted);
      line-height: 1.45;
      font-style: italic;
      background: rgba(0,0,0,0.18);
      padding: 8px 10px;
      border-radius: 6px;
      border-left: 2px solid rgba(229, 179, 82, 0.4);
    }

    /* Table Styles */
    .table-container {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      overflow-x: auto;
      box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.84rem;
    }
    thead {
      background: rgba(12, 17, 26, 0.95);
      border-bottom: 2px solid rgba(229, 179, 82, 0.3);
    }
    th {
      padding: 12px 14px;
      color: var(--accent-gold);
      font-weight: 700;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      cursor: pointer;
    }
    th:hover { color: #fff; }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: var(--text-sub);
      vertical-align: middle;
    }
    tbody tr:hover { background: rgba(255, 255, 255, 0.03); }

    .td-weapon-cell {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      color: var(--text-main);
    }
    .td-icon-mini {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: #090d14;
      border: 1px solid rgba(229, 179, 82, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .td-icon-mini img { width: 100%; height: 100%; object-fit: cover; }
    .td-icon-mini .glyph { font-size: 1.1rem; }

    /* Formulas & Mechanics */
    .formula-section {
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .formula-title {
      font-family: 'Cinzel', serif;
      font-size: 1.25rem;
      color: var(--accent-gold);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .formula-desc {
      color: var(--text-sub);
      font-size: 0.9rem;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .formula-code {
      background: #07090d;
      border: 1px solid rgba(229, 179, 82, 0.25);
      border-radius: 8px;
      padding: 14px 18px;
      font-family: 'JetBrains Mono', monospace;
      color: #38bdf8;
      font-size: 0.88rem;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .stat-badge-box {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .stat-badge-box.op { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .stat-badge-box.eng { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); }

    @media (max-width: 768px) {
      .weapons-grid { grid-template-columns: 1fr; }
      h1 { font-size: 1.7rem; }
      .tab-btn { font-size: 0.85rem; padding: 10px 12px; }
    }
  </style>
</head>
<body>
  <div class="bg-deco"></div>

  <div class="container">
    <header>
      <div class="header-badge">⚔️ База Знаний • Project Steam</div>
      <h1>ТЕХНИЧЕСКИЙ АРСЕНАЛ: ОПЕРАТОР И ИНЖЕНЕР (NO-GRADE И D-GRADE)</h1>
      <p class="header-sub">Официальная техническая база данных оружия и тактических щитов Фазы 1 (1–20 ур.) и рангов No-Grade и D-Grade по каноническому эталону <strong>Lineage 2 C1</strong>: боевые мечи, тяжелые молоты, кинжалы, луки/пистолеты <strong>Оператора (Воина)</strong> и резонансные булавы/контуры <strong>Инженера</strong>.</p>
      <div class="header-links">
        <a href="database.html" class="btn-header">📖 Интро</a>
        <a href="weapons-database.html" class="btn-header active">⚔️ Оружие</a>
        <a href="armor-database.html" class="btn-header">🥋 Броня</a>
        <a href="crafting-database.html" class="btn-header">🔨 Крафт</a>
        <a href="mobs-database.html" class="btn-header">👾 Мобы</a>
        <a href="skills-database.html" class="btn-header">⚡ Скилы</a>
        <a href="index.html" class="btn-header">🎮 В Игру</a>
        <a href="menu.html" class="btn-header">📋 Главное Меню</a>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="tabs-nav">
      <button type="button" class="tab-btn active" data-tab="cards" onclick="switchTab('cards')">
        <span>⚔️</span> Карточки Оружия (33)
      </button>
      <button type="button" class="tab-btn" data-tab="table" onclick="switchTab('table')">
        <span>📊</span> Сводная Таблица (33)
      </button>
      <button type="button" class="tab-btn" data-tab="shields" onclick="switchTab('shields')">
        <span>🛡️</span> Тактические Щиты (14)
      </button>
      <button type="button" class="tab-btn" data-tab="mechanics" onclick="switchTab('mechanics')">
        <span>📐</span> Боевые Механики L2 C1
      </button>
    </nav>

    <!-- Controls Bar -->
    <div class="controls-bar" id="controlsBar">
      <div class="search-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="searchInput" placeholder="Поиск по названию, ID, классу, типу оружия, грейду или описанию..." oninput="filterWeapons()">
        </div>
      </div>

      <!-- Archetype Filter Chips -->
      <div class="chips-row" id="roleChipsRow">
        <span class="chips-label">Класс:</span>
        <button type="button" class="chip active" data-role="all" onclick="setRole('all')">Все классы (33)</button>
        <button type="button" class="chip chip-op" data-role="operator" onclick="setRole('operator')">⚙️ Оператор / Воин (16)</button>
        <button type="button" class="chip chip-eng" data-role="engineer" onclick="setRole('engineer')">🔧 Инженер / Контур (17)</button>
      </div>

      <!-- Grade Filter Chips -->
      <div class="chips-row" id="gradeChipsRow">
        <span class="chips-label">Ранг:</span>
        <button type="button" class="chip active" data-grade="all" onclick="setGrade('all')">Все ранги (33)</button>
        <button type="button" class="chip grade-ng" data-grade="no_grade" onclick="setGrade('no_grade')">No-Grade (18)</button>
        <button type="button" class="chip grade-d" data-grade="d" onclick="setGrade('d')">D-Ранг (15)</button>
      </div>

      <!-- Weapon Class Filter Chips -->
      <div class="chips-row" id="classChipsRow">
        <span class="chips-label">Тип:</span>
        <button type="button" class="chip active" data-class="all" onclick="setClass('all')">Все типы (33)</button>
        <button type="button" class="chip" data-class="1h_sword" onclick="setClass('1h_sword')">⚔️ Мечи 1H (4)</button>
        <button type="button" class="chip" data-class="1h_blunt" onclick="setClass('1h_blunt')">🔨 Молоты/Булавы 1H (13)</button>
        <button type="button" class="chip" data-class="2h_blunt" onclick="setClass('2h_blunt')">🔨 Двуручные 2H (9)</button>
        <button type="button" class="chip" data-class="dagger" onclick="setClass('dagger')">🗡️ Кинжалы (4)</button>
        <button type="button" class="chip" data-class="bow" onclick="setClass('bow')">🏹 Луки / Огнестрел (3)</button>
      </div>
    </div>

    <!-- TAB 1: Weapon Cards View -->
    <div id="tabCards" class="tab-content">
      <div class="weapons-grid" id="weaponsGrid"></div>
    </div>

    <!-- TAB 2: Spreadsheet Table View -->
    <div id="tabTable" class="tab-content" style="display: none;">
      <div class="table-container">
        <table id="weaponsTable">
          <thead>
            <tr>
              <th onclick="sortTable('name')">Оружие ⇅</th>
              <th onclick="sortTable('isOperatorWeapon')">Класс ⇅</th>
              <th onclick="sortTable('grade')">Ранг ⇅</th>
              <th onclick="sortTable('weaponClass')">Тип ⇅</th>
              <th onclick="sortTable('twoHanded')">Хват ⇅</th>
              <th onclick="sortTable('attack')">P.Atk ⇅</th>
              <th onclick="sortTable('cAtk')">C.Atk ⇅</th>
              <th onclick="sortTable('baseAtkSpd')">Скорость ⇅</th>
              <th onclick="sortTable('critRate')">Крит ⇅</th>
              <th onclick="sortTable('weight')">Вес ⇅</th>
              <th onclick="sortTable('levelReq')">Уровень ⇅</th>
              <th onclick="sortTable('price')">Цена ⇅</th>
              <th onclick="sortTable('crystalCount')">Кристаллы ⇅</th>
            </tr>
          </thead>
          <tbody id="weaponsTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: Shields View -->
    <div id="tabShields" class="tab-content" style="display: none;">
      <div class="weapons-grid" id="shieldsGrid"></div>
    </div>

    <!-- TAB 4: Mechanics View -->
    <div id="tabMechanics" class="tab-content" style="display: none;">
      <div class="formula-section">
        <div class="formula-title">⚙️ Эталон Боевой Модели Lineage 2 C1 (Физический и Контурный Урон)</div>
        <p class="formula-desc">Расчёт физического урона Оператора и контурного урона Инженера строго выверен по каноническим формулам L2 C1 с учётом соулшотов и спиритшотов.</p>
        <div class="formula-code">
// 1. ФИЗИЧЕСКИЙ УРОН (P.Atk vs P.Def):
Dmg = (70 * P.Atk / P.Def) * LevelMod * SkillPower * SoulshotMod * RandomMod
- Soulshot Multiplier: 2.0x (+100% урона при расходе соулшота)
- LevelMod: 1.0 + (Level - 1) * 0.02
- Критический удар (Critical Hit): x2.0 базовый множитель

// 2. БАЗОВЫЙ КРИТИЧЕСКИЙ ШАНС (Crit Rate) ПО КЛАССАМ ОРУЖИЯ:
- Кинжалы (Daggers): 120 (12.0% базовый шанс)
- Луки и Стрелковое (Bows): 120 (12.0% базовый шанс)
- Мечи 1H (Swords): 80 (8.0% базовый шанс)
- Булавы и Молоты 1H/2H (Blunts): 40 (4.0% базовый шанс)

// 3. СКОРОСТЬ АТАКИ (Atk.Spd) И ВРЕМЯ ЗАМАХА:
- Кинжалы (Dagger): 333 (Очень быстрая, замах 0.75 сек)
- Луки (Bow): 293 (Быстрая прицельная стрельба)
- Булавы 1H (1H Blunt): 275 (Быстрая)
- Мечи 1H (1H Sword): 247 (Средняя)
- Молоты 2H (2H Blunt): 190 (Медленная, сокрушительная)

// 4. ДИСПЕРСИЯ УРОНА (Random Damage Spread):
- Кинжалы: ±5% (Максимальная точность и стабильность)
- Мечи: ±10% (Сбалансированный урон)
- Луки: ±10% (Стабильный дальний бой)
- Молоты и Булавы: ±20% (Высокий разброс, экстремальные сокрушительные пики)

// 5. КРИСТАЛЛИЗАЦИЯ LOW D (20 ур.):
- Базовая стоимость Low D оружия: 409,000 деталей
- Стоимость кристалла D-грейда: 500 деталей
- Выход кристаллов: 409,000 / 500 = 818 Crystal: D
        </div>
      </div>
    </div>

  </div>

  <script>
    const WEAPONS = ${weaponsJsonStr};
    const SHIELDS = ${shieldsJsonStr};

    let currentTab = 'cards';
    let currentRole = 'all';
    let currentGrade = 'all';
    let currentClass = 'all';
    let currentSearch = '';
    let sortColumn = 'attack';
    let sortAsc = false;

    function formatNumber(n) {
      if (n == null) return '0';
      return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ");
    }

    function handleIconError(img) {
      img.style.display = 'none';
      if (img.nextElementSibling) {
        img.nextElementSibling.style.display = 'inline-block';
      }
    }

    function renderIcon(iconUrl, fallbackGlyph, isMini) {
      const cls = isMini ? 'glyph' : 'icon-glyph';
      const safeGlyph = fallbackGlyph || '⚔️';
      if (iconUrl && iconUrl.startsWith('assets/')) {
        return '<img src="' + iconUrl + '" alt="" onerror="handleIconError(this)"><span class="' + cls + '" style="display:none;">' + safeGlyph + '</span>';
      }
      return '<span class="' + cls + '">' + (iconUrl || safeGlyph) + '</span>';
    }

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });
      document.getElementById('tabCards').style.display = (tabId === 'cards') ? 'block' : 'none';
      document.getElementById('tabTable').style.display = (tabId === 'table') ? 'block' : 'none';
      document.getElementById('tabShields').style.display = (tabId === 'shields') ? 'block' : 'none';
      document.getElementById('tabMechanics').style.display = (tabId === 'mechanics') ? 'block' : 'none';

      const controlsBar = document.getElementById('controlsBar');
      if (tabId === 'mechanics') {
        controlsBar.style.display = 'none';
      } else {
        controlsBar.style.display = 'flex';
        const roleRow = document.getElementById('roleChipsRow');
        const classRow = document.getElementById('classChipsRow');
        if (roleRow) roleRow.style.display = (tabId === 'shields') ? 'none' : 'flex';
        if (classRow) classRow.style.display = (tabId === 'shields') ? 'none' : 'flex';
      }

      render();
    }

    function setRole(role) {
      currentRole = role;
      document.querySelectorAll('.chips-row button[data-role]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.role === role);
      });
      render();
    }

    function setGrade(grade) {
      currentGrade = grade;
      document.querySelectorAll('.chips-row button[data-grade]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.grade === grade);
      });
      render();
    }

    function setClass(cls) {
      currentClass = cls;
      document.querySelectorAll('.chips-row button[data-class]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.class === cls);
      });
      render();
    }

    function filterWeapons() {
      currentSearch = (document.getElementById('searchInput').value || '').trim().toLowerCase();
      render();
    }

    function getFilteredWeapons() {
      return WEAPONS.filter(w => {
        if (currentRole === 'operator' && !w.isOperatorWeapon) return false;
        if (currentRole === 'engineer' && w.isOperatorWeapon) return false;

        if (currentGrade !== 'all' && w.grade !== currentGrade) return false;
        if (currentClass !== 'all' && w.weaponClass !== currentClass) return false;

        if (currentSearch) {
          const match = (w.name && w.name.toLowerCase().includes(currentSearch)) ||
                        (w.id && w.id.toLowerCase().includes(currentSearch)) ||
                        (w.classRu && w.classRu.toLowerCase().includes(currentSearch)) ||
                        (w.gradeRu && w.gradeRu.toLowerCase().includes(currentSearch)) ||
                        (w.description && w.description.toLowerCase().includes(currentSearch));
          if (!match) return false;
        }
        return true;
      });
    }

    function getFilteredShields() {
      return SHIELDS.filter(s => {
        if (currentGrade !== 'all' && s.grade !== currentGrade) return false;
        if (currentSearch) {
          const match = (s.name && s.name.toLowerCase().includes(currentSearch)) ||
                        (s.id && s.id.toLowerCase().includes(currentSearch)) ||
                        (s.gradeRu && s.gradeRu.toLowerCase().includes(currentSearch)) ||
                        (s.description && s.description.toLowerCase().includes(currentSearch));
          if (!match) return false;
        }
        return true;
      });
    }

    function renderCards() {
      const list = getFilteredWeapons();
      const grid = document.getElementById('weaponsGrid');
      if (!list.length) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted); font-size: 1.1rem;">Оружие по заданным фильтрам не найдено</div>';
        return;
      }

      grid.innerHTML = list.map(w => {
        const gradeClass = 'grade-' + w.grade;
        const roleClass = w.isOperatorWeapon ? 'role-operator' : 'role-engineer';
        const roleBadge = w.isOperatorWeapon 
          ? '<span class="badge-role role-op">⚙️ Оператор</span>' 
          : '<span class="badge-role role-eng">🔧 Инженер</span>';
        const gripClass = w.twoHanded ? 'grip-2h' : 'grip-1h';
        const gripText = w.twoHanded ? '2H Двуручное' : '1H Одноручное';
        const maxPatk = 75;
        const maxCatk = 80;
        const patkPct = Math.min(100, Math.round((w.attack / maxPatk) * 100));
        const catkPct = Math.min(100, Math.round(((w.cAtk || 0) / maxCatk) * 100));
        const iconMarkup = renderIcon(w.icon, w.iconGlyph, false);

        return \`
          <div class="weapon-card \${gradeClass} \${roleClass}">
            <div class="weapon-card-header">
              <div class="weapon-icon-wrap">
                \${iconMarkup}
              </div>
              <div class="weapon-info">
                <div class="weapon-name">\${w.name}</div>
                <div class="weapon-tags-row">
                  \${roleBadge}
                  <span class="badge-grade \${w.grade}">\${w.grade === 'no_grade' ? 'NO-GRADE' : 'D-GRADE'}</span>
                  <span class="badge-grip \${gripClass}">\${gripText}</span>
                  <span class="badge-type">\${w.classRu}</span>
                </div>
              </div>
            </div>

            <div class="weapon-stats-box">
              <div class="stat-item">
                <div class="stat-label">
                  <span>Физ. атака (P.Atk)</span>
                  <span class="stat-val highlight-patk">\${w.attack}</span>
                </div>
                <div class="stat-bar-track"><div class="stat-bar-fill patk" style="width: \${patkPct}%"></div></div>
              </div>

              <div class="stat-item">
                <div class="stat-label">
                  <span>Контур (C.Atk)</span>
                  <span class="stat-val highlight-catk">\${w.cAtk || 0}</span>
                </div>
                <div class="stat-bar-track"><div class="stat-bar-fill catk" style="width: \${catkPct}%"></div></div>
              </div>

              <div class="stat-item">
                <div class="stat-label">Базовая скорость</div>
                <div class="stat-val highlight-spd">\${w.baseAtkSpd} <small style="font-size:0.7rem;color:var(--text-muted)">(\${w.atkSpdGrade})</small></div>
              </div>

              <div class="stat-item">
                <div class="stat-label">Шанс крита (L2)</div>
                <div class="stat-val highlight-crit">\${w.critRate} <small style="font-size:0.7rem;color:var(--text-muted)">(\${w.critRate / 10}%)</small></div>
              </div>
            </div>

            <div class="specs-list">
              <div class="spec-row"><span>Требуемый уровень:</span> <strong>Ур. \${w.levelReq}+</strong></div>
              <div class="spec-row"><span>Разброс урона:</span> <strong>\${w.randomDmg}</strong></div>
              <div class="spec-row"><span>Вес / Нагрузка:</span> <strong>\${formatNumber(w.weight)} ед.</strong></div>
              <div class="spec-row"><span>Расход сосок (D/M):</span> <strong>\${w.soulshotUse} / \${w.spiritshotUse}</strong></div>
              <div class="spec-row"><span>Стоимость у NPC:</span> <strong style="color:var(--accent-gold)">\${formatNumber(w.price)} дет.</strong></div>
              <div class="spec-row"><span>Кристаллизация:</span> <strong style="color:#c084fc">\${w.crystalCount ? formatNumber(w.crystalCount) + ' шт. (D)' : 'Нет (NG)'}</strong></div>
            </div>

            <div class="weapon-desc">\${w.description}</div>
          </div>
        \`;
      }).join('');
    }

    function sortTable(col) {
      if (sortColumn === col) {
        sortAsc = !sortAsc;
      } else {
        sortColumn = col;
        sortAsc = (col === 'name');
      }
      renderTable();
    }

    function renderTable() {
      let list = [...getFilteredWeapons()];
      list.sort((a, b) => {
        let va = a[sortColumn];
        let vb = b[sortColumn];
        if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortAsc ? (va - vb) : (vb - va);
      });

      const tbody = document.getElementById('weaponsTableBody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="13" style="text-align:center; padding: 30px; color: var(--text-muted);">Ни одного орудия не найдено</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(w => {
        const iconMarkup = renderIcon(w.icon, w.iconGlyph, true);
        const gripText = w.twoHanded ? '2H (Двуруч)' : '1H (Одноруч)';
        const gradeBadge = w.grade === 'no_grade' 
          ? '<span class="badge-grade no_grade">NG</span>' 
          : '<span class="badge-grade d">D</span>';
        const roleBadge = w.isOperatorWeapon
          ? '<span class="stat-badge-box op">⚙️ Оператор</span>'
          : '<span class="stat-badge-box eng">🔧 Инженер</span>';

        return \`
          <tr>
            <td>
              <div class="td-weapon-cell">
                <div class="td-icon-mini">\${iconMarkup}</div>
                <div>
                  <div>\${w.name}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted)">\${w.id}</div>
                </div>
              </div>
            </td>
            <td>\${roleBadge}</td>
            <td>\${gradeBadge}</td>
            <td>\${w.classRu}</td>
            <td>\${gripText}</td>
            <td style="color:#f87171; font-weight:700">\${w.attack}</td>
            <td style="color:#38bdf8; font-weight:700">\${w.cAtk || 0}</td>
            <td style="color:#e5b352">\${w.baseAtkSpd}</td>
            <td style="color:#fbbf24">\${w.critRate} (\${w.critRate/10}%)</td>
            <td>\${formatNumber(w.weight)}</td>
            <td>Ур. \${w.levelReq}+</td>
            <td style="color:var(--accent-gold); font-weight:600">\${formatNumber(w.price)}</td>
            <td style="color:#c084fc">\${w.crystalCount ? formatNumber(w.crystalCount) + ' (D)' : '-'}</td>
          </tr>
        \`;
      }).join('');
    }

    function renderShields() {
      const list = getFilteredShields();
      const grid = document.getElementById('shieldsGrid');
      if (!list.length) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-muted); font-size: 1.1rem;">Щиты по заданным фильтрам не найдены</div>';
        return;
      }

      grid.innerHTML = list.map(s => {
        const gradeClass = 'grade-' + s.grade;
        const iconMarkup = renderIcon(s.icon, s.iconGlyph, false);

        return \`
          <div class="weapon-card \${gradeClass}">
            <div class="weapon-card-header">
              <div class="weapon-icon-wrap">
                \${iconMarkup}
              </div>
              <div class="weapon-info">
                <div class="weapon-name">\${s.name}</div>
                <div class="weapon-tags-row">
                  <span class="badge-grade \${s.grade}">\${s.grade === 'no_grade' ? 'NO-GRADE' : 'D-GRADE'}</span>
                  <span class="badge-grip grip-1h">ЩИТ (1H Левая Рука)</span>
                </div>
              </div>
            </div>

            <div class="weapon-stats-box">
              <div class="stat-item">
                <div class="stat-label">Защита щита (P.Def)</div>
                <div class="stat-val highlight-patk">\${s.defense || s.pDef || 0}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Шанс блока</div>
                <div class="stat-val highlight-spd">20%</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Вес / Нагрузка</div>
                <div class="stat-val">\${formatNumber(s.weight)} <small style="font-size:0.7rem;color:var(--text-muted)">ед.</small></div>
              </div>
              <div class="stat-item">
                <div class="stat-label">Требуемый уровень</div>
                <div class="stat-val">Ур. \${s.levelReq}+</div>
              </div>
            </div>

            <div class="specs-list" style="grid-template-columns: 1fr;">
              <div class="spec-row"><span>Стоимость снабжения:</span> <strong style="color:var(--accent-gold)">\${formatNumber(s.price)} деталей</strong></div>
              <div class="spec-row"><span>Кристаллизация:</span> <strong style="color:#c084fc">\${s.crystalCount ? formatNumber(s.crystalCount) + ' шт. (D)' : 'Нет (No-Grade)'}</strong></div>
            </div>

            <div class="weapon-desc">\${s.description || 'Тактический защитный щит для поглощения кинетических и паровых ударов.'}</div>
          </div>
        \`;
      }).join('');
    }

    function render() {
      if (currentTab === 'cards') renderCards();
      else if (currentTab === 'table') renderTable();
      else if (currentTab === 'shields') renderShields();
    }

    document.addEventListener('DOMContentLoaded', () => {
      render();
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../client/weapons-database.html'), html, 'utf8');
console.log('Successfully generated standalone weapons database: client/weapons-database.html (' + html.length + ' bytes)');
