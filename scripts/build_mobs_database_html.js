// SCRIPTS / BUILD_MOBS_DATABASE_HTML.JS
// Generates client/mobs-database.html with complete live mobs bestiary and drop tables.
// Dark luxury steampunk aesthetic, full mobile responsiveness, 6-tab navigation.

const fs = require('fs');
const path = require('path');

const mobsData = require('../data/mobs_database_db.json');
const mobsJson = JSON.stringify(mobsData);

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Бестиарий и Таблицы Дропа | Project Steam</title>
  <meta name="description" content="Полная официальная база мобов, автоматонов, рейд-боссов и таблиц дропа Project Steam: характеристики, локации, шансы выпадения ресурсов, чертежей и спойла.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👾</text></svg>">
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
      --grade-c: #c084fc;
      --grade-b: #f59e0b;
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

    /* TOP ACTION BAR */
    .top-action-bar {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-bottom: 16px;
    }
    .action-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: rgba(22, 28, 38, 0.85);
      border: 1px solid rgba(218, 165, 32, 0.35);
      border-radius: 8px;
      color: var(--accent-gold);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 600;
      transition: all 0.2s;
    }
    .action-link:hover {
      background: rgba(229, 179, 82, 0.15);
      border-color: var(--accent-gold);
      transform: translateY(-1px);
    }

    /* HEADER */
    header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 20px;
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
      color: #fff;
      text-shadow: 0 0 30px rgba(229, 179, 82, 0.3);
      letter-spacing: 0.04em;
      margin-bottom: 8px;
    }

    .header-subtitle {
      color: var(--text-muted);
      font-size: 0.95rem;
      max-width: 820px;
      margin: 0 auto 18px;
    }

    /* SUMMARY STATS BAR */
    .stats-summary-row {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-top: 14px;
    }
    .summary-chip {
      background: rgba(18, 24, 34, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 20px;
      padding: 5px 14px;
      font-size: 0.82rem;
      color: var(--text-sub);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .summary-chip strong {
      color: var(--accent-gold);
      font-family: 'JetBrains Mono', monospace;
    }

    /* UNIFIED 6 TABS NAV */
    .tabs-nav {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .tab-btn {
      padding: 10px 20px;
      background: rgba(20, 26, 36, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: var(--text-muted);
      font-family: 'Inter', sans-serif;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .tab-btn:hover {
      background: rgba(30, 40, 56, 0.95);
      color: #fff;
      border-color: rgba(229, 179, 82, 0.35);
    }
    .tab-btn.active {
      background: linear-gradient(135deg, rgba(229, 179, 82, 0.2) 0%, rgba(200, 122, 62, 0.15) 100%);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      box-shadow: 0 0 15px rgba(229, 179, 82, 0.2);
    }

    /* SEARCH & FILTER CONTROLS */
    .controls-panel {
      background: rgba(18, 24, 34, 0.8);
      border: 1px solid rgba(218, 165, 32, 0.2);
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 28px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .search-row {
      display: flex;
      gap: 14px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-input-wrapper {
      position: relative;
      flex: 1;
      min-width: 280px;
    }
    .search-input-wrapper input {
      width: 100%;
      padding: 12px 16px 12px 42px;
      background: rgba(10, 14, 20, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 10px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.92rem;
      outline: none;
      transition: all 0.2s;
    }
    .search-input-wrapper input:focus {
      border-color: var(--accent-gold);
      box-shadow: 0 0 12px rgba(229, 179, 82, 0.25);
    }
    .search-input-wrapper::before {
      content: '🔍';
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 1rem;
      opacity: 0.6;
    }

    .select-wrapper {
      min-width: 220px;
    }
    .select-wrapper select {
      width: 100%;
      padding: 12px 14px;
      background: rgba(10, 14, 20, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 10px;
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      font-size: 0.88rem;
      outline: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    .select-wrapper select:focus {
      border-color: var(--accent-gold);
    }

    .filter-chips-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tier-chips {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tier-chip {
      padding: 6px 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.18s;
    }
    .tier-chip:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .tier-chip.active {
      background: rgba(229, 179, 82, 0.2);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      font-weight: 600;
    }

    .extra-toggles {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--text-sub);
      cursor: pointer;
      user-select: none;
    }
    .toggle-label input {
      cursor: pointer;
      accent-color: var(--accent-gold);
    }

    /* MOBS COUNT & ACTIVE FILTER INFO */
    .filter-status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
      color: var(--text-muted);
      font-size: 0.88rem;
    }
    .filter-status-bar strong {
      color: var(--accent-gold);
    }

    /* MOBS GRID */
    .mobs-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(440px, 1fr));
      gap: 22px;
    }

    @media (max-width: 540px) {
      .mobs-grid {
        grid-template-columns: 1fr;
      }
    }

    /* MOB CARD */
    .mob-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 20px;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: all 0.25s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }
    .mob-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-card-hover);
      transform: translateY(-2px);
      box-shadow: var(--shadow-glow);
    }
    .mob-card.raid-boss {
      border-color: rgba(248, 113, 113, 0.5);
      background: linear-gradient(180deg, rgba(35, 18, 24, 0.9) 0%, rgba(22, 28, 38, 0.9) 100%);
    }
    .mob-card.raid-boss:hover {
      border-color: var(--accent-ruby);
      box-shadow: 0 0 25px rgba(248, 113, 113, 0.3);
    }

    /* CARD HEADER */
    .mob-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .mob-title-box {
      flex: 1;
    }
    .mob-name {
      font-family: 'Cinzel', serif;
      font-size: 1.25rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
      line-height: 1.3;
    }
    .mob-card.raid-boss .mob-name {
      color: #fca5a5;
    }
    .mob-subtitle {
      font-size: 0.78rem;
      color: var(--accent-ruby);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .mob-badges {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .badge-level {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      padding: 3px 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
    }
    .badge-role {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .badge-role.raid {
      background: rgba(248, 113, 113, 0.2);
      border: 1px solid var(--accent-ruby);
      color: var(--accent-ruby);
    }
    .badge-role.boss {
      background: rgba(192, 132, 252, 0.2);
      border: 1px solid var(--accent-purple);
      color: var(--accent-purple);
    }
    .badge-role.secret {
      background: rgba(229, 179, 82, 0.2);
      border: 1px solid var(--accent-gold);
      color: var(--accent-gold);
    }
    .badge-role.aggressive {
      background: rgba(249, 115, 22, 0.2);
      border: 1px solid #f97316;
      color: #fdba74;
    }
    .badge-role.passive {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
    }

    /* FLAVOR LORE */
    .mob-flavor {
      font-size: 0.83rem;
      color: var(--text-muted);
      font-style: italic;
      background: rgba(10, 14, 20, 0.5);
      border-left: 3px solid rgba(218, 165, 32, 0.4);
      padding: 8px 12px;
      border-radius: 0 8px 8px 0;
      line-height: 1.45;
    }

    /* ZONES & SPAWNS */
    .mob-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      font-size: 0.8rem;
    }
    .mob-zones-list {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .zone-tag {
      background: rgba(200, 122, 62, 0.15);
      border: 1px solid rgba(200, 122, 62, 0.35);
      color: #fed7aa;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.76rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .zone-tag:hover {
      background: rgba(200, 122, 62, 0.3);
      color: #fff;
    }
    .mob-spawns-count {
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
    }

    /* STATS GRID */
    .mob-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      background: rgba(10, 14, 20, 0.6);
      padding: 10px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .stat-box {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .stat-label {
      font-size: 0.68rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.88rem;
      font-weight: 700;
      color: #fff;
    }
    .stat-val.hp-val {
      color: var(--accent-ruby);
    }
    .stat-val.patk-val {
      color: #fca5a5;
    }
    .stat-val.pdef-val {
      color: #93c5fd;
    }
    .stat-val.exp-val {
      color: var(--accent-gold);
    }

    /* SKILLS MINI SECTION */
    .mob-skills-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.78rem;
    }
    .skills-header {
      font-weight: 600;
      color: var(--text-muted);
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .skills-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .skill-chip {
      background: rgba(56, 189, 248, 0.08);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 6px;
      padding: 3px 8px;
      color: var(--text-sub);
      font-size: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: help;
    }

    /* LOOT SECTION */
    .mob-loot-section {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .loot-category-title {
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent-gold);
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .loot-category-title.spoil-title {
      color: var(--accent-emerald);
    }

    .loot-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    .loot-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      transition: background 0.15s;
    }
    .loot-table tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .loot-table td {
      padding: 6px 4px;
      vertical-align: middle;
    }
    .loot-item-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .loot-icon {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      object-fit: cover;
      background: #090c10;
      border: 1px solid rgba(255, 255, 255, 0.15);
      flex-shrink: 0;
    }
    .loot-name {
      color: #fff;
      font-weight: 500;
      line-height: 1.2;
    }
    .loot-count {
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      text-align: center;
      white-space: nowrap;
    }
    .loot-chance {
      text-align: right;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
      white-space: nowrap;
      color: var(--accent-gold);
    }
    .spoil-row .loot-chance {
      color: var(--accent-emerald);
    }
    .loot-grade-badge {
      font-size: 0.65rem;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: uppercase;
      margin-left: 6px;
    }
    .loot-grade-badge.ng { background: rgba(148, 163, 184, 0.2); color: var(--grade-ng); }
    .loot-grade-badge.d { background: rgba(56, 189, 248, 0.2); color: var(--grade-d); }
    .loot-grade-badge.c { background: rgba(192, 132, 252, 0.2); color: var(--grade-c); }

    .copper-banner {
      background: rgba(229, 179, 82, 0.08);
      border: 1px solid rgba(229, 179, 82, 0.2);
      border-radius: 8px;
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
    }
    .copper-label {
      color: var(--text-sub);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .copper-val {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: var(--accent-gold);
    }

    .spoil-block {
      background: rgba(52, 211, 153, 0.05);
      border: 1px solid rgba(52, 211, 153, 0.2);
      border-radius: 8px;
      padding: 8px 12px;
    }

    /* HIGHLIGHT MATCHED ITEMS IN SEARCH */
    .matched-drop-row {
      background: rgba(229, 179, 82, 0.12) !important;
      border-left: 3px solid var(--accent-gold);
    }

    /* EMPTY RESULTS */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      background: var(--bg-card);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      color: var(--text-muted);
      display: none;
    }
    .empty-state h3 {
      color: var(--accent-gold);
      font-family: 'Cinzel', serif;
      font-size: 1.3rem;
      margin-bottom: 8px;
    }
  </style>
</head>
<body>
  <div class="bg-deco"></div>

  <div class="container">
    <!-- TOP ACTION BAR -->
    <div class="top-action-bar">
      <a href="index.html" class="action-link">🎮 Войти в игру</a>
      <a href="menu.html" class="action-link">🏠 Главное меню</a>
    </div>

    <!-- HEADER -->
    <header>
      <div class="header-badge">⚙️ Энциклопедия Механизмов &amp; Дропа</div>
      <h1>Бестиарий и Таблицы Дропа</h1>
      <p class="header-subtitle">
        Официальный реестр всех 56 активных механизмов, автоматонов и рейд-боссов Project Steam. Точные характеристики, локации обитания, спавны и шансы выпадения трофеев, чертежей и спойла.
      </p>

      <!-- STATS SUMMARY ROW -->
      <div class="stats-summary-row">
        <div class="summary-chip">🤖 Всего мобов: <strong>56</strong></div>
        <div class="summary-chip">👑 Рейд-боссов: <strong>4</strong></div>
        <div class="summary-chip">📍 Зон обитания: <strong>27</strong></div>
        <div class="summary-chip">⛏️ Шанс присвоения: <strong>до 70%</strong></div>
      </div>
    </header>

    <!-- UNIFIED 6 TABS NAV -->
    <nav class="tabs-nav" aria-label="Разделы Базы Знаний">
      <a href="database.html" class="tab-btn">📖 Интро</a>
      <a href="weapons-database.html" class="tab-btn">⚔️ Оружие</a>
      <a href="armor-database.html" class="tab-btn">🥋 Броня</a>
      <a href="crafting-database.html" class="tab-btn">🔨 Крафт</a>
      <a href="mobs-database.html" class="tab-btn active">👾 Мобы</a>
      <a href="skills-database.html" class="tab-btn">⚡ Скилы</a>
    </nav>

    <!-- SEARCH & CONTROLS PANEL -->
    <section class="controls-panel">
      <div class="search-row">
        <div class="search-input-wrapper">
          <input type="text" id="mobsSearch" placeholder="Поиск по мобу, зоне или выпадающему предмету (например: 'Котловая пластина', 'Манометр', 'Свалка')..." autocomplete="off">
        </div>
        <div class="select-wrapper">
          <select id="zoneSelect">
            <option value="">Все локации (27)</option>
          </select>
        </div>
        <div class="select-wrapper">
          <select id="sortSelect">
            <option value="lvl-asc">Сортировка: По уровню (1 ➔ 22)</option>
            <option value="lvl-desc">Сортировка: По уровню (22 ➔ 1)</option>
            <option value="hp-desc">Сортировка: По запасу HP</option>
            <option value="spawns-desc">Сортировка: По количеству спавнов</option>
            <option value="name-asc">Сортировка: По названию (А-Я)</option>
          </select>
        </div>
      </div>

      <div class="filter-chips-row">
        <div class="tier-chips" id="tierFilters">
          <button class="tier-chip active" data-tier="all">Все (56)</button>
          <button class="tier-chip" data-tier="boss">Рейд-боссы (4)</button>
          <button class="tier-chip" data-tier="starter">Начальные (1–10 ур.)</button>
          <button class="tier-chip" data-tier="mid">Средние (11–16 ур.)</button>
          <button class="tier-chip" data-tier="high">Высокие (17–22 ур.)</button>
          <button class="tier-chip" data-tier="secret">Секретные (5)</button>
        </div>

        <div class="extra-toggles">
          <label class="toggle-label">
            <input type="checkbox" id="toggleAggro"> Только агрессивные
          </label>
          <label class="toggle-label">
            <input type="checkbox" id="toggleSpoil"> Есть спойл
          </label>
        </div>
      </div>
    </section>

    <!-- STATUS BAR -->
    <div class="filter-status-bar">
      <div>Показано мобов: <strong id="visibleCount">56</strong> из 56</div>
      <div id="searchHint" style="display:none; color:var(--accent-gold); font-size:0.82rem;"></div>
    </div>

    <!-- MOBS GRID -->
    <main class="mobs-grid" id="mobsGrid">
      <!-- Generated dynamically -->
    </main>

    <!-- EMPTY STATE -->
    <div class="empty-state" id="emptyState">
      <h3>Механизмы не найдены</h3>
      <p>По вашему запросу не найдено ни одного моба или предмета. Попробуйте изменить параметры поиска или сбросить фильтры.</p>
    </div>
  </div>

  <script>
    const MOBS = ${mobsJson};

    // Populate zones dropdown
    const zoneSelect = document.getElementById('zoneSelect');
    const allZonesSet = new Set();
    MOBS.forEach(m => m.zones.forEach(z => allZonesSet.add(z)));
    const sortedZones = Array.from(allZonesSet).sort((a, b) => a.localeCompare(b, 'ru'));
    sortedZones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      zoneSelect.appendChild(opt);
    });

    let currentTier = 'all';
    let currentZone = '';
    let currentSort = 'lvl-asc';
    let searchQuery = '';
    let onlyAggro = false;
    let onlySpoil = false;

    const mobsGrid = document.getElementById('mobsGrid');
    const emptyState = document.getElementById('emptyState');
    const visibleCountEl = document.getElementById('visibleCount');
    const searchHintEl = document.getElementById('searchHint');

    function formatNumber(num) {
      return num.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g, " ");
    }

    function renderLootTable(items, query, isSpoil = false) {
      if (!items || !items.length) return '';
      return \`
        <table class="loot-table">
          <tbody>
            \${items.map(it => {
              const matchesSearch = query && (
                it.name.toLowerCase().includes(query) ||
                it.id.toLowerCase().includes(query)
              );
              const highlightClass = matchesSearch ? 'matched-drop-row' : (isSpoil ? 'spoil-row' : '');
              const countStr = it.min === it.max ? \`×\${it.min}\` : \`×\${it.min}–\${it.max}\`;
              const gradeBadge = it.gradeClass !== 'ng' ? \`<span class="loot-grade-badge \${it.gradeClass}">\${it.grade}</span>\` : '';
              return \`
                <tr class="\${highlightClass}">
                  <td class="loot-item-cell">
                    <img src="\${it.icon}" alt="\${it.name}" class="loot-icon" onerror="this.src='assets/inventar/icons/gear_fragment.webp'">
                    <span class="loot-name">\${it.name}\${gradeBadge}</span>
                  </td>
                  <td class="loot-count">\${countStr}</td>
                  <td class="loot-chance">\${it.chanceStr}</td>
                </tr>
              \`;
            }).join('')}
          </tbody>
        </table>
      \`;
    }

    function renderMobCard(m, query) {
      const isRaidClass = m.isRaid ? 'raid-boss' : '';
      const raidTitle = m.title ? \`<div class="mob-subtitle">\${m.title}</div>\` : '';

      // Zones tags
      const zonesHtml = m.zones.map(z => \`<span class="zone-tag" onclick="filterByZone('\${z}')">📍 \${z}</span>\`).join('');

      // Skills chips
      let skillsHtml = '';
      if (m.skills && m.skills.length) {
        skillsHtml = \`
          <div class="mob-skills-box">
            <div class="skills-header">⚡ Навыки механизма (\${m.skills.length})</div>
            <div class="skills-chips">
              \${m.skills.map(sk => \`<span class="skill-chip" title="\${sk.desc}">\${sk.name}</span>\`).join('')}
            </div>
          </div>
        \`;
      }

      // Copper currency
      let copperHtml = '';
      if (m.loot.adena) {
        copperHtml = \`
          <div class="copper-banner">
            <span class="copper-label">💰 Медь</span>
            <span class="copper-val">\${m.loot.adena.min}–\${m.loot.adena.max} меди (\${m.loot.adena.chanceStr})</span>
          </div>
        \`;
      }

      // Materials & Consumables
      let matsHtml = '';
      if (m.loot.materials.length) {
        matsHtml = \`
          <div>
            <div class="loot-category-title">📦 Материалы и детали (\${m.loot.materials.length})</div>
            \${renderLootTable(m.loot.materials, query)}
          </div>
        \`;
      }

      // Equipment
      let equipHtml = '';
      if (m.loot.equipment.length) {
        equipHtml = \`
          <div>
            <div class="loot-category-title">⚔️ Снаряжение и оружие (\${m.loot.equipment.length})</div>
            \${renderLootTable(m.loot.equipment, query)}
          </div>
        \`;
      }

      // Recipes
      let recipesHtml = '';
      if (m.loot.recipes.length) {
        recipesHtml = \`
          <div>
            <div class="loot-category-title">📜 Чертежи и схемы (\${m.loot.recipes.length})</div>
            \${renderLootTable(m.loot.recipes, query)}
          </div>
        \`;
      }

      // Rare drops / Boss cores
      let rareHtml = '';
      if (m.loot.rare.length) {
        rareHtml = \`
          <div>
            <div class="loot-category-title">💎 Редкие трофеи и ядра (\${m.loot.rare.length})</div>
            \${renderLootTable(m.loot.rare, query)}
          </div>
        \`;
      }

      // Spoil
      let spoilHtml = '';
      if (m.loot.spoil.length) {
        spoilHtml = \`
          <div class="spoil-block">
            <div class="loot-category-title spoil-title">⛏️ Присвоение (Спойл) · Базовый шанс ~70%</div>
            \${renderLootTable(m.loot.spoil, query, true)}
          </div>
        \`;
      }

      return \`
        <article class="mob-card \${isRaidClass}" data-id="\${m.id}">
          <div class="mob-card-header">
            <div class="mob-title-box">
              <h2 class="mob-name">\${m.name}</h2>
              \${raidTitle}
            </div>
            <div class="mob-badges">
              <span class="badge-level">\${m.levelStr}</span>
              <span class="badge-role \${m.roleClass}">\${m.roleLabel}</span>
            </div>
          </div>

          <div class="mob-flavor">«\${m.flavor}»</div>

          <div class="mob-meta-row">
            <div class="mob-zones-list">\${zonesHtml}</div>
            <div class="mob-spawns-count">\${m.spawns} спавнов</div>
          </div>

          <!-- STATS -->
          <div class="mob-stats-grid">
            <div class="stat-box">
              <span class="stat-label">❤️ Здоровье</span>
              <span class="stat-val hp-val">\${formatNumber(m.stats.hp)}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">⚔️ Физ. Атк</span>
              <span class="stat-val patk-val">\${m.stats.pAtk}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">🛡️ Физ. Защ</span>
              <span class="stat-val pdef-val">\${m.stats.pDef}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">✨ Опыт</span>
              <span class="stat-val exp-val">\${formatNumber(m.stats.exp)}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">⚡ Контур Атк</span>
              <span class="stat-val">\${m.stats.cAtk}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">🔮 Контур Защ</span>
              <span class="stat-val">\${m.stats.cDef}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">💠 SP</span>
              <span class="stat-val">\${formatNumber(m.stats.sp)}</span>
            </div>
            <div class="stat-box">
              <span class="stat-label">⏱️ Скорость</span>
              <span class="stat-val">\${m.stats.speed}</span>
            </div>
          </div>

          \${skillsHtml}

          <!-- LOOT TABLE -->
          <div class="mob-loot-section">
            \${copperHtml}
            \${matsHtml}
            \${equipHtml}
            \${recipesHtml}
            \${rareHtml}
            \${spoilHtml}
          </div>
        </article>
      \`;
    }

    function checkItemMatch(mob, q) {
      if (!q) return false;
      const allDrops = [
        ...mob.loot.materials,
        ...mob.loot.equipment,
        ...mob.loot.recipes,
        ...mob.loot.rare,
        ...mob.loot.spoil
      ];
      return allDrops.some(it => 
        it.name.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
      );
    }

    function updateView() {
      const q = searchQuery.trim().toLowerCase();

      let filtered = MOBS.filter(m => {
        // Tier filter
        if (currentTier === 'boss' && !m.isRaid) return false;
        if (currentTier === 'secret' && !m.isSecret) return false;
        if (currentTier === 'starter' && (m.levelTier !== 'starter' || m.isRaid)) return false;
        if (currentTier === 'mid' && (m.levelTier !== 'mid' || m.isRaid)) return false;
        if (currentTier === 'high' && (m.levelTier !== 'high' || m.isRaid)) return false;

        // Zone filter
        if (currentZone && !m.zones.includes(currentZone)) return false;

        // Extra toggles
        if (onlyAggro && !m.isAggressive) return false;
        if (onlySpoil && (!m.loot.spoil || !m.loot.spoil.length)) return false;

        // Search query (mob name, id, zone, flavor, OR drop item name!)
        if (q) {
          const matchName = m.name.toLowerCase().includes(q);
          const matchId = m.id.toLowerCase().includes(q);
          const matchZone = m.zones.some(z => z.toLowerCase().includes(q));
          const matchFlavor = m.flavor.toLowerCase().includes(q);
          const matchDrop = checkItemMatch(m, q);

          if (!matchName && !matchId && !matchZone && !matchFlavor && !matchDrop) {
            return false;
          }
        }

        return true;
      });

      // Sort
      filtered.sort((a, b) => {
        if (currentSort === 'lvl-asc') {
          if (a.minLvl !== b.minLvl) return a.minLvl - b.minLvl;
          return a.name.localeCompare(b.name, 'ru');
        }
        if (currentSort === 'lvl-desc') {
          if (a.maxLvl !== b.maxLvl) return b.maxLvl - a.maxLvl;
          return b.name.localeCompare(a.name, 'ru');
        }
        if (currentSort === 'hp-desc') {
          return b.stats.hp - a.stats.hp;
        }
        if (currentSort === 'spawns-desc') {
          return b.spawns - a.spawns;
        }
        if (currentSort === 'name-asc') {
          return a.name.localeCompare(b.name, 'ru');
        }
        return 0;
      });

      // Update counter
      visibleCountEl.textContent = filtered.length;

      if (q) {
        searchHintEl.style.display = 'block';
        searchHintEl.textContent = \`Поиск по: "\${searchQuery}"\`;
      } else {
        searchHintEl.style.display = 'none';
      }

      if (filtered.length === 0) {
        mobsGrid.innerHTML = '';
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
        mobsGrid.innerHTML = filtered.map(m => renderMobCard(m, q)).join('');
      }
    }

    // Global helper for zone tag clicks
    window.filterByZone = function(zoneName) {
      zoneSelect.value = zoneName;
      currentZone = zoneName;
      updateView();
      window.scrollTo({ top: 320, behavior: 'smooth' });
    };

    // Events
    document.getElementById('mobsSearch').addEventListener('input', (e) => {
      searchQuery = e.target.value;
      updateView();
    });

    zoneSelect.addEventListener('change', (e) => {
      currentZone = e.target.value;
      updateView();
    });

    document.getElementById('sortSelect').addEventListener('change', (e) => {
      currentSort = e.target.value;
      updateView();
    });

    document.getElementById('tierFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.tier-chip');
      if (!btn) return;
      document.querySelectorAll('.tier-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      currentTier = btn.dataset.tier;
      updateView();
    });

    document.getElementById('toggleAggro').addEventListener('change', (e) => {
      onlyAggro = e.target.checked;
      updateView();
    });

    document.getElementById('toggleSpoil').addEventListener('change', (e) => {
      onlySpoil = e.target.checked;
      updateView();
    });

    // Initial render
    updateView();
  </script>
</body>
</html>`;

const outputPath = path.join(__dirname, '../client/mobs-database.html');
fs.writeFileSync(outputPath, htmlContent, 'utf8');
console.log('Successfully generated client/mobs-database.html');
