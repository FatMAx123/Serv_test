// SCRIPTS / BUILD_SKILLS_DATABASE_HTML.JS
const fs = require('fs');
const path = require('path');

const engSkillsData = require('../data/engineer_skills_db.json');
const itemBuffsData = require('../data/item_buffs_db.json');

const engJson = JSON.stringify(engSkillsData);
const itemJson = JSON.stringify(itemBuffsData);

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>База Знаний: Программы, Бафы и Расходники | Project Steam</title>
  <meta name="description" content="Официальная техническая база данных программ и бафов Project Steam: программы класса Инженер, эликсиры аур боссов, усилители оружия, полевые масла и тактические инструкции.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
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

    header {
      text-align: center;
      margin-bottom: 30px;
      padding: 26px 16px 22px;
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
      font-size: 2.3rem;
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
      max-width: 880px;
      margin: 0 auto 18px;
    }
    .header-links {
      display: flex;
      justify-content: center;
      gap: 12px;
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
      margin-bottom: 24px;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 12px 20px;
      font-size: 0.95rem;
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
      margin-bottom: 26px;
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

    /* Skills Grid & Cards */
    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 20px;
    }
    .skill-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35);
      transition: all 0.25s ease;
    }
    .skill-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-card-hover);
      transform: translateY(-3px);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5), var(--shadow-glow);
    }
    .skill-card-header {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .skill-icon-wrap {
      width: 58px;
      height: 58px;
      border-radius: 10px;
      background: #090d14;
      border: 1px solid rgba(229, 179, 82, 0.4);
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .skill-icon-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .skill-info {
      flex: 1;
      min-width: 0;
    }
    .skill-name {
      font-family: 'Cinzel', serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      line-height: 1.3;
      margin-bottom: 4px;
    }
    .skill-meta {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .badge-cat {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge-attack { background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
    .badge-heal { background: rgba(52, 211, 153, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
    .badge-buff { background: rgba(229, 179, 82, 0.15); color: #e5b352; border: 1px solid rgba(229, 179, 82, 0.3); }
    .badge-debuff { background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3); }
    .badge-utility { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }

    .skill-desc {
      font-size: 0.85rem;
      color: var(--text-sub);
      line-height: 1.45;
    }
    .device-notice {
      background: rgba(229, 179, 82, 0.08);
      border: 1px dashed rgba(229, 179, 82, 0.3);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 0.78rem;
      color: var(--accent-gold);
    }
    .skill-specs {
      background: rgba(10, 14, 22, 0.6);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 10px 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 12px;
      font-size: 0.78rem;
    }
    .spec-item {
      display: flex;
      justify-content: space-between;
      color: var(--text-muted);
    }
    .spec-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-main);
      font-weight: 600;
    }

    .ranks-toggle {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: var(--text-sub);
      padding: 6px 10px;
      font-size: 0.75rem;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }
    .ranks-toggle:hover {
      background: rgba(229, 179, 82, 0.12);
      border-color: rgba(229, 179, 82, 0.3);
      color: #fff;
    }
    .ranks-ladder {
      display: none;
      margin-top: 4px;
      background: rgba(0,0,0,0.3);
      border-radius: 6px;
      overflow: hidden;
    }
    .ranks-ladder table {
      width: 100%;
      font-size: 0.75rem;
      border-collapse: collapse;
    }
    .ranks-ladder th {
      background: rgba(229, 179, 82, 0.1);
      color: var(--accent-gold);
      padding: 5px 8px;
      text-align: left;
    }
    .ranks-ladder td {
      padding: 4px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
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
    }
    td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: var(--text-sub);
      vertical-align: middle;
    }
    tbody tr:hover { background: rgba(255, 255, 255, 0.03); }

    /* Buffs & Consumables View */
    .buffs-section-title {
      font-family: 'Cinzel', serif;
      font-size: 1.3rem;
      color: var(--accent-gold);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .buff-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    .buff-card {
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .buff-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    .buff-card.aura_tralala_neon { border-color: #38bdf8; box-shadow: 0 0 18px rgba(56, 189, 248, 0.2); }
    .buff-card.aura_bombardiro_fire { border-color: #f97316; box-shadow: 0 0 18px rgba(249, 115, 22, 0.2); }
    .buff-card.aura_vacuum_void { border-color: #a855f7; box-shadow: 0 0 18px rgba(168, 85, 247, 0.2); }
    .buff-card.aura_cappuccino_gold { border-color: #eab308; box-shadow: 0 0 18px rgba(234, 179, 8, 0.2); }
    .buff-card.aura_skibidi_steam { border-color: #10b981; box-shadow: 0 0 18px rgba(16, 185, 129, 0.2); }

    .buff-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 2px;
    }
    .buff-icon-wrap {
      width: 52px;
      height: 52px;
      border-radius: 10px;
      background: #090d14;
      border: 1px solid rgba(229, 179, 82, 0.4);
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .buff-icon-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .buff-info {
      flex: 1;
      min-width: 0;
    }
    .buff-name {
      font-family: 'Cinzel', serif;
      font-size: 1.05rem;
      font-weight: 700;
      color: #fff;
      margin: 3px 0 0 0;
      line-height: 1.25;
    }
    .buff-desc {
      font-size: 0.84rem;
      color: var(--text-sub);
      line-height: 1.45;
    }
    .buff-stats-box {
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.06);
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--accent-cyan);
      font-weight: 600;
      margin-top: auto;
    }
    .buff-meta-tag {
      display: inline-block;
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      background: rgba(255,255,255,0.08);
      margin-bottom: 4px;
    }

    /* Formulas View */
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

    @media (max-width: 768px) {
      .skills-grid { grid-template-columns: 1fr; }
      h1 { font-size: 1.7rem; }
      .tab-btn { font-size: 0.85rem; padding: 10px 14px; }
    }
  </style>
</head>
<body>
  <div class="bg-deco"></div>

  <div class="container">
    <header>
      <div class="header-badge">⚡ База Знаний • Project Steam</div>
      <h1>ПРОГРАММЫ, БАФЫ И РАСХОДНИКИ</h1>
      <p class="header-sub">Официальная инженерно-техническая база данных: программы и модули класса <strong>Инженер</strong> (уровни 1–20), эликсиры аур боссов, усилители оружия, полевые масла и тактические инструкции.</p>
      <div class="header-links">
        <a href="database.html" class="btn-header">📖 Интро</a>
        <a href="weapons-database.html" class="btn-header">⚔️ Оружие</a>
        <a href="armor-database.html" class="btn-header">🥋 Броня</a>
        <a href="crafting-database.html" class="btn-header">🔨 Крафт</a>
        <a href="mobs-database.html" class="btn-header">👾 Мобы</a>
        <a href="skills-database.html" class="btn-header active">⚡ Скилы</a>
        <a href="index.html" class="btn-header">🎮 В Игру</a>
        <a href="menu.html" class="btn-header">📋 Главное Меню</a>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav class="tabs-nav">
      <button type="button" class="tab-btn active" data-tab="skillsCards" onclick="switchTab('skillsCards')">
        <span>⚙️</span> Программы (Карточки)
      </button>
      <button type="button" class="tab-btn" data-tab="skillsTable" onclick="switchTab('skillsTable')">
        <span>📊</span> Таблица Программ
      </button>
      <button type="button" class="tab-btn" data-tab="buffs" onclick="switchTab('buffs')">
        <span>🧪</span> Расходники и Инструкции
      </button>
      
    </nav>

    <!-- Controls Bar -->
    <div class="controls-bar" id="controlsBar">
      <div class="search-row">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="searchInput" placeholder="Поиск по названию, эффекту, прибору или типу..." oninput="handleSearch()">
        </div>
      </div>

      <!-- Chips: Category for Skills -->
      <div class="chips-row" id="skillChipsRow">
        <span class="chips-label">Категория:</span>
        <button type="button" class="chip active" data-cat="all" onclick="setSkillCategory('all')">Все (20)</button>
        <button type="button" class="chip" data-cat="attack" onclick="setSkillCategory('attack')">Атака (2)</button>
        <button type="button" class="chip" data-cat="heal" onclick="setSkillCategory('heal')">Ремонт (4)</button>
        <button type="button" class="chip" data-cat="buff" onclick="setSkillCategory('buff')">Усиления (7)</button>
        <button type="button" class="chip" data-cat="debuff" onclick="setSkillCategory('debuff')">Помехи и Дебаффы (3)</button>
        <button type="button" class="chip" data-cat="utility" onclick="setSkillCategory('utility')">Спец. системы (4)</button>
      </div>
    </div>

    <!-- TAB 1: Skills Cards View -->
    <div id="tabSkillsCards" class="tab-content">
      <div class="skills-grid" id="skillsGrid"></div>
    </div>

    <!-- TAB 2: Skills Table View -->
    <div id="tabSkillsTable" class="tab-content" style="display: none;">
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Программа</th>
              <th>Категория</th>
              <th>Тип</th>
              <th>Среда</th>
              <th>Уровень</th>
              <th>Рангов</th>
              <th>Модуляция / Откат</th>
              <th>Дистанция</th>
              <th>Расход пара</th>
              <th>Сила (Ранг 1)</th>
              <th>Прибор</th>
            </tr>
          </thead>
          <tbody id="skillsTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- TAB 3: Item Buffs & Consumables View -->
    <div id="tabBuffs" class="tab-content" style="display: none;">
      <h3 class="buffs-section-title">👑 Эликсиры Аур Боссов (20 минут, сохраняются при гибели)</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
        Принадлежат стак-группе <code>aura_elixir</code>. Новый эликсир заменяет предыдущий. Параметр <code>persistOnDeath: true</code> сохраняет эффект при аварийном отключении персонажа.
      </p>
      <div class="buff-cards-grid" id="bossElixirsGrid"></div>

      <h3 class="buffs-section-title" style="margin-top: 40px;">⚡ Усилители Контура и Пневмо-усилители</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
        Технические заряды для оружия: двойной клик или ПКМ активирует автоматическую подачу. Срабатывает 1 заряд на удар или активацию программы.
      </p>
      <div class="buff-cards-grid" id="shotsGrid"></div>

      <h3 class="buffs-section-title" style="margin-top: 40px;">🧪 Полевые Масла и Восстановители</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
        Ремонтные эмульсии, баллоны высокого давления, энергетики и амулеты для быстрого восстановления корпуса и форсирования систем в полевых условиях.
      </p>
      <div class="buff-cards-grid" id="potionsGrid"></div>

      <h3 class="buffs-section-title" style="margin-top: 40px;">📜 Тактические Инструкции (Свитки Баффов на 20 минут)</h3>
      <p style="color: var(--text-muted); margin-bottom: 16px; font-size: 0.9rem;">
        Чертежи и инструкции оперативной настройки экзоскелета: форсирование марша, усиление брони, разгон катушек модуляции и прецизионная оптика.
      </p>
      <div class="buff-cards-grid" id="manualsGrid"></div>
    </div>

    </div>

  <!-- EMBEDDED DATA -->
  <script>
    const EMBEDDED_ENGINEER_SKILLS = ${engJson};
    const EMBEDDED_ITEM_BUFFS = ${itemJson};

    let currentTab = 'skillsCards';
    let currentSkillCat = 'all';

    let skillsData = EMBEDDED_ENGINEER_SKILLS.skills || [];
    let itemsData = EMBEDDED_ITEM_BUFFS || { project_steam_items: [], tactical_manuals_and_consumables: [] };

    document.addEventListener('DOMContentLoaded', () => {
      renderSkillCards();
      renderSkillTable();
      renderItemBuffs();
    });

    function handleIconError(img) {
      img.style.display = 'none';
      if (img.nextElementSibling) {
        img.nextElementSibling.style.display = 'flex';
      }
    }

    function formatNumber(n) {
      if (n == null) return '0';
      return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ");
    }

    function switchTab(tabId) {
      currentTab = tabId;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));

      document.getElementById('tabSkillsCards').style.display = (tabId === 'skillsCards') ? 'block' : 'none';
      document.getElementById('tabSkillsTable').style.display = (tabId === 'skillsTable') ? 'block' : 'none';
      document.getElementById('tabBuffs').style.display = (tabId === 'buffs') ? 'block' : 'none';
      

      const controls = document.getElementById('controlsBar');
      if (tabId === 'skillsCards' || tabId === 'skillsTable') {
        controls.style.display = 'flex';
      } else {
        controls.style.display = 'none';
      }

      handleSearch();
    }

    function handleSearch() {
      const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();
      if (currentTab === 'skillsCards' || currentTab === 'skillsTable') {
        filterSkills(q);
      }
    }

    function setSkillCategory(cat) {
      currentSkillCat = cat;
      document.querySelectorAll('#skillChipsRow .chip').forEach(c => c.classList.toggle('active', c.dataset.cat === cat));
      handleSearch();
    }

    function filterSkills(q) {
      const filtered = skillsData.filter(s => {
        const matchesCat = currentSkillCat === 'all' || s.category === currentSkillCat;
        const matchesQ = !q || 
          s.nameRu.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.description && s.description.toLowerCase().includes(q));
        return matchesCat && matchesQ;
      });

      renderSkillCards(filtered);
      renderSkillTable(filtered);
    }

    function renderSkillCards(data = skillsData) {
      const grid = document.getElementById('skillsGrid');
      if (!data.length) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">Ни одной программы не найдено</div>';
        return;
      }

      grid.innerHTML = data.map(s => {
        const r1 = (s.ranks && s.ranks[0]) || {};
        const isPass = s.type === 'passive';
        const pwr = s.skillPower || s.healPower || r1.power || r1.healPower || r1.dotDamage || (r1.slowPercent ? '-20% бег' : '') || (r1.attackBoost ? '+8% P.Atk' : '') || (r1.defenseBoost ? '+8% P.Def' : '') || (r1.pDefFlat ? '+' + r1.pDefFlat + ' P.Def' : '') || (r1.cDefFlat ? '+' + r1.cDefFlat + ' C.Def' : '') || (r1.chargeSpeed ? 'x2.0 Модуляция' : '') || '-';
        const mpStr = r1.mpCostTotal != null ? (r1.mpInitialConsume || 0) + ' + ' + (r1.mpConsume || 0) + ' = ' + r1.mpCostTotal : '-';
        const badgeClass = 'badge-' + (s.category || 'utility');

        let ranksTable = '';
        if (s.ranks && s.ranks.length > 1) {
          ranksTable = 
            '<button type=\"button\" class=\"ranks-toggle\" onclick=\"toggleRanks(\\'ranks_' + s.id + '\\')\">📊 Показать все ранги (1–' + s.ranks.length + ')</button>' +
            '<div class=\"ranks-ladder\" id=\"ranks_' + s.id + '\">' +
              '<table>' +
                '<thead><tr><th>Ранг</th><th>Ур.</th><th>SP</th><th>Пар</th><th>Сила</th></tr></thead>' +
                '<tbody>' +
                  s.ranks.map(r => 
                    '<tr>' +
                      '<td><strong>' + r.rank + '</strong></td>' +
                      '<td>' + (r.charLevelReq || '-') + '</td>' +
                      '<td>' + (r.spCost != null ? r.spCost : '-') + '</td>' +
                      '<td>' + (r.mpCostTotal != null ? r.mpCostTotal : '-') + '</td>' +
                      '<td>' + (r.power || r.healPower || r.dotDamage || (r.slowPercent ? '-20%' : '') || (r.attackBoost ? '+' + Math.round(r.attackBoost*100) + '%' : '') || (r.defenseBoost ? '+' + Math.round(r.defenseBoost*100) + '%' : '') || (r.pDefFlat ? '+' + r.pDefFlat : '') || (r.cDefFlat ? '+' + r.cDefFlat : '') || '-') + '</td>' +
                    '</tr>'
                  ).join('') +
                '</tbody>' +
              '</table>' +
            '</div>';
        }

        return \`
          <div class="skill-card">
            <div class="skill-card-header">
              <div class="skill-icon-wrap">
                <img src="\${s.icon}" alt="\${s.nameRu}" onerror="handleIconError(this)">
                <div class="icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.8rem; background:#111827;">⚙️</div>
              </div>
              <div class="skill-info">
                <div class="skill-name">\${s.nameRu}</div>
                <div class="skill-meta">
                  <span class="badge-cat \${badgeClass}">\${s.category}</span>
                  <span>Ур. \${s.levelReq}+</span>
                  <span>• Рангов: \${s.maxLevel}</span>
                </div>
              </div>
            </div>

            <div class="skill-desc">\${s.description}</div>

            \${s.deviceReq ? \`
              <div class="device-notice">
                <span>⚙️ Прибор: <strong>\${s.deviceReq.name}</strong> (ур. \${s.deviceReq.minLevel}+)</span>
              </div>
            \` : ''}

            <div class="skill-specs">
              <div class="spec-item"><span>Тип:</span> <span class="spec-val">\${isPass ? 'Пассивный' : 'Активный'}</span></div>
              <div class="spec-item"><span>Среда:</span> <span class="spec-val">\${s.element || 'Технический'}</span></div>
              \${!isPass ? \`
                <div class="spec-item"><span>Модуляция:</span> <span class="spec-val">\${s.castTimeBaseSec != null ? s.castTimeBaseSec + 'с' : '-'}</span></div>
                <div class="spec-item"><span>Откат:</span> <span class="spec-val">\${s.cooldownBaseSec != null ? s.cooldownBaseSec + 'с' : '-'}</span></div>
                <div class="spec-item"><span>Дистанция:</span> <span class="spec-val">\${s.rangeGame ? s.rangeGame + 'м' : '-'}</span></div>
                <div class="spec-item"><span>Расход пара:</span> <span class="spec-val">\${mpStr}</span></div>
              \` : ''}
              <div class="spec-item"><span>Сила (р.1):</span> <span class="spec-val" style="color:var(--accent-gold)">\${pwr}</span></div>
            </div>

            \${ranksTable}
          </div>
        \`;
      }).join('');
    }

    function renderSkillTable(data = skillsData) {
      const tbody = document.getElementById('skillsTableBody');
      tbody.innerHTML = data.map(s => {
        const r1 = (s.ranks && s.ranks[0]) || {};
        const isPass = s.type === 'passive';
        const pwr = s.skillPower || s.healPower || r1.power || r1.healPower || r1.dotDamage || (r1.slowPercent ? '-20% бег' : '') || (r1.attackBoost ? '+8% P.Atk' : '') || (r1.defenseBoost ? '+8% P.Def' : '') || (r1.pDefFlat ? '+' + r1.pDefFlat + ' P.Def' : '') || (r1.cDefFlat ? '+' + r1.cDefFlat + ' C.Def' : '') || (r1.chargeSpeed ? 'x2.0 Модуляция' : '') || '-';
        const mpStr = r1.mpCostTotal != null ? (r1.mpInitialConsume || 0) + ' + ' + (r1.mpConsume || 0) + ' = ' + r1.mpCostTotal : '-';
        const badgeClass = 'badge-' + (s.category || 'utility');

        return \`
          <tr>
            <td>
              <div style="display:flex; align-items:center; gap:10px;">
                <img src="\${s.icon}" width="32" height="32" style="border-radius:6px; border:1px solid rgba(229, 179, 82, 0.3);" onerror="handleIconError(this)">
                <span class="icon-fallback" style="display:none; font-size:1.4rem;">⚙️</span>
                <div>
                  <strong>\${s.nameRu}</strong>
                  <div style="font-size:0.75rem; color:var(--text-muted)">\${s.id}</div>
                </div>
              </div>
            </td>
            <td><span class="badge-cat \${badgeClass}">\${s.category}</span></td>
            <td>\${isPass ? 'Пассив' : 'Актив'}</td>
            <td>\${s.element || 'Технический'}</td>
            <td>\${s.levelReq}+</td>
            <td>\${s.maxLevel}</td>
            <td>\${isPass ? '-' : (s.castTimeBaseSec != null ? s.castTimeBaseSec + 'с' : '-') + ' / ' + (s.cooldownBaseSec != null ? s.cooldownBaseSec + 'с' : '-')}</td>
            <td>\${s.rangeGame ? s.rangeGame + 'м' : '-'}</td>
            <td>\${isPass ? '-' : mpStr}</td>
            <td style="color:var(--accent-gold); font-weight:600">\${pwr}</td>
            <td style="font-size:0.8rem">\${s.deviceReq ? s.deviceReq.name + ' (ур. ' + s.deviceReq.minLevel + '+)' : 'Любой'}</td>
          </tr>
        \`;
      }).join('');
    }

    function toggleRanks(id) {
      const el = document.getElementById(id);
      if (el) el.style.display = (el.style.display === 'block') ? 'none' : 'block';
    }

    /* Buffs & Consumables render */
    function renderItemBuffs() {
      const pItems = itemsData.project_steam_items || [];
      const manuals = itemsData.tactical_manuals_and_consumables || [];

      // Boss Elixirs
      const elixirs = pItems.filter(i => i.type === 'elixir' || (i.buff && i.buff.stackGroup === 'aura_elixir'));
      document.getElementById('bossElixirsGrid').innerHTML = elixirs.map(e => {
        let fx = [];
        if (e.buff) {
          if (e.buff.attackMult) fx.push('Физ. атака x' + e.buff.attackMult);
          if (e.buff.defenseMult) fx.push('Физ. защита x' + e.buff.defenseMult);
          if (e.buff.atkSpdMult) fx.push('Скор. атаки x' + e.buff.atkSpdMult);
          if (e.buff.critDamageBoost) fx.push('Сила крита +' + Math.round(e.buff.critDamageBoost * 100) + '%');
          if (e.buff.speedMult) fx.push('Скорость x' + e.buff.speedMult);
          if (e.buff.speedFlat) fx.push('Скорость +' + e.buff.speedFlat);
          if (e.buff.vampiric) fx.push('Вампиризм ' + Math.round(e.buff.vampiric * 100) + '%');
          if (e.buff.stunResist) fx.push('Защита от шока +' + Math.round(e.buff.stunResist * 100) + '%');
          if (e.buff.maxEnergyBonus) fx.push('Макс. пар +' + e.buff.maxEnergyBonus);
          if (e.buff.hpRegenFlat) fx.push('Реген HP +' + e.buff.hpRegenFlat + '/с');
          if (e.buff.energyRegenMult) fx.push('Реген пара x' + e.buff.energyRegenMult);
          if (e.buff.energyRegenFlat) fx.push('Реген пара +' + e.buff.energyRegenFlat + '/с');
          if (e.buff.dropPartsMult) fx.push('Добыча деталей x' + e.buff.dropPartsMult);
          if (e.buff.dropMult) fx.push('Шанс дропа x' + e.buff.dropMult);
        }

        const iconPath = e.icon || (e.buff && e.buff.icon) || 'assets/hud/debuffs/elixir_vacuum.webp';

        return \`
          <div class="buff-card \${e.id}">
            <div class="buff-card-header">
              <div class="buff-icon-wrap">
                <img src="\${iconPath}" alt="\${e.nameRu}" onerror="handleIconError(this)">
                <div class="icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.8rem; background:#111827;">🧪</div>
              </div>
              <div class="buff-info">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span class="buff-meta-tag" style="color:var(--accent-gold); border:1px solid rgba(229,179,82,0.3)">20 МИНУТ</span>
                  <span class="buff-meta-tag" style="color:var(--accent-emerald)">СОХРАНЯЕТСЯ ПРИ ГИБЕЛИ</span>
                </div>
                <div class="buff-name">\${e.nameRu}</div>
              </div>
            </div>
            <div class="buff-desc">\${e.description}</div>
            \${fx.length ? \`<div class="buff-stats-box">\${fx.join(' • ')}</div>\` : ''}
          </div>
        \`;
      }).join('');

      // Shots
      const shots = pItems.filter(i => i.type === 'shot' || (i.mechanics && i.mechanics.shotKind));
      document.getElementById('shotsGrid').innerHTML = shots.map(s => {
        const mult = (s.mechanics && s.mechanics.multiplier) ? 'x' + s.mechanics.multiplier + ' урона' : '+100%';
        const iconPath = s.icon || 'assets/inventar/icons/pressure_amplifier.webp';
        return \`
          <div class="buff-card">
            <div class="buff-card-header">
              <div class="buff-icon-wrap">
                <img src="\${iconPath}" alt="\${s.nameRu}" onerror="handleIconError(this)">
                <div class="icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.8rem; background:#111827;">⚡</div>
              </div>
              <div class="buff-info">
                <span class="buff-meta-tag" style="color:var(--accent-cyan)">УСИЛИТЕЛЬ ОРУЖИЯ</span>
                <div class="buff-name">\${s.nameRu}</div>
              </div>
            </div>
            <div class="buff-desc">\${s.description}</div>
            <div style="color:var(--accent-gold); font-weight:600; font-size:0.85rem; margin-top:auto; padding-top:4px;">
              Эффект: \${mult} (\${s.mechanics ? s.mechanics.shotKind.toUpperCase() : 'УДАР'})
            </div>
          </div>
        \`;
      }).join('');

      // Consumables & Field Tonics (All recovery items & drinks)
      const consumables = pItems.filter(i => i.type === 'consumable');
      document.getElementById('potionsGrid').innerHTML = consumables.map(p => {
        let ef = [];
        if (p.effects && p.effects.healHpInstant) ef.push('+' + p.effects.healHpInstant + ' HP');
        if (p.effects && p.effects.healEnergyInstant) ef.push('+' + p.effects.healEnergyInstant + ' пара');
        if (p.buff && p.buff.attackMult) ef.push('Урон x' + p.buff.attackMult);
        const iconPath = p.icon || (p.buff && p.buff.icon) || 'assets/inventar/icons/synthetic_oil.webp';
        const durText = p.buff && p.buff.durationSec ? (p.buff.durationSec + ' СЕК') : 'МГНОВЕННО';

        return \`
          <div class="buff-card">
            <div class="buff-card-header">
              <div class="buff-icon-wrap">
                <img src="\${iconPath}" alt="\${p.nameRu}" onerror="handleIconError(this)">
                <div class="icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.8rem; background:#111827;">🔧</div>
              </div>
              <div class="buff-info">
                <span class="buff-meta-tag" style="color:var(--accent-emerald)">\${durText}</span>
                <div class="buff-name">\${p.nameRu}</div>
              </div>
            </div>
            <div class="buff-desc">\${p.description}</div>
            \${ef.length ? \`<div style="color:var(--accent-emerald); font-weight:600; font-size:0.85rem; margin-top:auto; padding-top:4px;">Эффект: \${ef.join(', ')}</div>\` : ''}
          </div>
        \`;
      }).join('');

      // Manuals
      document.getElementById('manualsGrid').innerHTML = manuals.map(m => {
        const iconPath = m.icon || 'assets/skills/technomancer/tec_might.webp';
        return \`
          <div class="buff-card">
            <div class="buff-card-header">
              <div class="buff-icon-wrap">
                <img src="\${iconPath}" alt="\${m.nameRu}" onerror="handleIconError(this)">
                <div class="icon-fallback" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-size:1.8rem; background:#111827;">📜</div>
              </div>
              <div class="buff-info">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span class="buff-meta-tag" style="color:var(--accent-gold)">ИНСТРУКЦИЯ</span>
                  <span class="buff-meta-tag">\${m.durationSec ? (m.durationSec/60) + ' МИН' : 'МГНОВЕННО'}</span>
                </div>
                <div class="buff-name">\${m.nameRu}</div>
              </div>
            </div>
            <div class="buff-desc">\${m.effect}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:auto; padding-top:4px;">Стак-группа: <code>\${m.buff ? m.buff.stackGroup : '-'}</code></div>
          </div>
        \`;
      }).join('');
    }
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../client/skills-database.html'), htmlContent, 'utf8');
console.log('Successfully generated clean standalone Skills DB: client/skills-database.html (' + htmlContent.length + ' bytes)');
