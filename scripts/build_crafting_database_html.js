// SCRIPTS / BUILD_CRAFTING_DATABASE_HTML.JS
// Generates client/crafting-database.html with complete Engineer Crafting & Materials Knowledge Base.
// Strictly authentic Steampunk Russian names (no Lineage 2 names, no English subtitles).
const fs = require('fs');
const path = require('path');

const recipesData = require('../data/crafting_recipes_db.json');
const materialsData = require('../data/crafting_materials_db.json');

const recipesJson = JSON.stringify(recipesData);
const materialsJson = JSON.stringify(materialsData);

const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>База Крафта и Схем Инженера | Project Steam</title>
  <meta name="description" content="Официальная инженерная база знаний по крафту, схемам и материалам Project Steam: производство расходников, боевых зарядов, брони, щитов, заготовок сплавов, очистка гидравлики и интерактивный калькулятор ресурсов.">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔨</text></svg>">
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
      max-width: 860px;
      margin: 0 auto 18px;
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
      padding: 10px 22px;
      background: rgba(20, 26, 36, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: var(--text-muted);
      font-family: 'Inter', sans-serif;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
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

    /* FILTER BAR */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      background: rgba(18, 24, 34, 0.7);
      padding: 14px 18px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 6px 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .filter-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
    }
    .filter-btn.active {
      background: rgba(229, 179, 82, 0.2);
      border-color: var(--accent-gold);
      color: var(--accent-gold);
      font-weight: 600;
    }

    .search-box {
      position: relative;
      min-width: 240px;
    }
    .search-box input {
      width: 100%;
      padding: 8px 14px 8px 34px;
      background: rgba(10, 14, 20, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.85rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-box input:focus {
      border-color: var(--accent-gold);
    }
    .search-box::before {
      content: '🔍';
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.8rem;
      opacity: 0.6;
    }

    /* RECIPE CARDS GRID */
    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 20px;
    }

    .recipe-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
    .recipe-card:hover {
      transform: translateY(-3px);
      border-color: var(--border-card-hover);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .badges-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .badge {
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-ng { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); }
    .badge-d  { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); }
    .badge-c  { background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.35); }
    .badge-cat { background: rgba(229, 179, 82, 0.12); color: var(--accent-gold); border: 1px solid rgba(229, 179, 82, 0.25); }

    .chance-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(52, 211, 153, 0.15);
      border: 1px solid rgba(52, 211, 153, 0.4);
      color: #34d399;
      white-space: nowrap;
    }
    .chance-pill.med {
      background: rgba(229, 179, 82, 0.15);
      border-color: rgba(229, 179, 82, 0.4);
      color: var(--accent-gold);
    }
    .chance-pill.low {
      background: rgba(248, 113, 113, 0.15);
      border-color: rgba(248, 113, 113, 0.4);
      color: #f87171;
    }

    /* RESULT ITEM DISPLAY */
    .result-display {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(10, 14, 20, 0.6);
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .item-icon-box {
      position: relative;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
      background: #090c10;
      border: 1px solid rgba(218, 165, 32, 0.4);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .item-icon-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .item-count-tag {
      position: absolute;
      bottom: 2px;
      right: 3px;
      background: rgba(0, 0, 0, 0.85);
      color: var(--accent-gold);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 1px 4px;
      border-radius: 4px;
      line-height: 1;
    }

    .result-info {
      flex: 1;
      min-width: 0;
    }
    .result-name {
      font-family: 'Cinzel', serif;
      font-size: 1.05rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 2px;
    }
    .recipe-title {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .recipe-desc {
      font-size: 0.85rem;
      color: var(--text-sub);
      line-height: 1.45;
    }

    /* BLUEPRINT SOURCE BOX */
    .blueprint-box {
      background: rgba(200, 122, 62, 0.08);
      border-left: 3px solid var(--accent-copper);
      border-radius: 0 6px 6px 0;
      padding: 8px 12px;
      font-size: 0.8rem;
      color: #cbd5e1;
    }
    .blueprint-box strong {
      color: var(--accent-copper);
    }

    /* MATERIALS SECTION */
    .materials-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .materials-heading {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
    }

    .materials-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }

    .mat-item {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(10, 14, 20, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 6px 10px;
    }
    .mat-icon {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      object-fit: cover;
      flex-shrink: 0;
    }
    .mat-details {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .mat-name {
      font-size: 0.75rem;
      color: var(--text-sub);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mat-qty {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--accent-gold);
    }

    .card-actions {
      margin-top: auto;
      padding-top: 6px;
    }
    .btn-calc-jump {
      width: 100%;
      padding: 8px 12px;
      background: rgba(229, 179, 82, 0.1);
      border: 1px solid rgba(229, 179, 82, 0.3);
      border-radius: 8px;
      color: var(--accent-gold);
      font-family: 'Inter', sans-serif;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.2s ease;
    }
    .btn-calc-jump:hover {
      background: rgba(229, 179, 82, 0.2);
      border-color: var(--accent-gold);
      color: #fff;
    }

    /* MATERIALS TAB STYLING */
    .materials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 18px;
    }

    .material-card {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .material-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-card-hover);
    }

    .mat-card-header {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .mat-big-icon {
      width: 46px;
      height: 46px;
      border-radius: 8px;
      border: 1px solid rgba(218, 165, 32, 0.35);
      object-fit: cover;
      background: #090c10;
      flex-shrink: 0;
    }
    .mat-card-title {
      flex: 1;
      min-width: 0;
    }
    .mat-card-name {
      font-family: 'Cinzel', serif;
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 2px;
    }

    .mat-stats-bar {
      display: flex;
      gap: 14px;
      background: rgba(10, 14, 20, 0.6);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.78rem;
      color: var(--text-muted);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .mat-stats-bar span {
      color: var(--text-main);
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
    }

    .mat-source-box {
      font-size: 0.8rem;
      color: #cbd5e1;
      background: rgba(56, 189, 248, 0.06);
      border-left: 3px solid var(--accent-cyan);
      padding: 6px 10px;
      border-radius: 0 6px 6px 0;
    }
    .mat-source-box strong {
      color: var(--accent-cyan);
    }

    .mat-desc-text {
      font-size: 0.82rem;
      color: var(--text-sub);
      line-height: 1.4;
    }

    /* CALCULATOR TAB */
    .calculator-layout {
      display: grid;
      grid-template-columns: 1fr 1.3fr;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 900px) {
      .calculator-layout {
        grid-template-columns: 1fr;
      }
    }

    .calc-panel {
      background: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: 14px;
      padding: 24px;
      backdrop-filter: blur(10px);
    }

    .calc-title {
      font-family: 'Cinzel', serif;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--accent-gold);
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .calc-subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 18px;
    }
    .form-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-sub);
      margin-bottom: 8px;
    }

    .calc-select {
      width: 100%;
      padding: 10px 14px;
      background: rgba(10, 14, 20, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: #fff;
      font-family: 'Inter', sans-serif;
      font-size: 0.92rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .calc-select:focus {
      border-color: var(--accent-gold);
    }

    .amount-control {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 10px;
    }
    .amount-input {
      flex: 1;
      padding: 10px 14px;
      background: rgba(10, 14, 20, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      color: var(--accent-gold);
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 700;
      outline: none;
      text-align: center;
    }
    .amount-input:focus {
      border-color: var(--accent-gold);
    }

    .quick-amounts {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn-quick {
      padding: 5px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: var(--text-sub);
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-quick:hover {
      background: rgba(229, 179, 82, 0.15);
      border-color: var(--accent-gold);
      color: #fff;
    }

    /* CALC RESULT SUMMARY */
    .calc-yield-box {
      background: rgba(10, 14, 20, 0.8);
      border: 1px solid rgba(229, 179, 82, 0.3);
      border-radius: 10px;
      padding: 16px;
      margin-top: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .calc-yield-icon {
      width: 54px;
      height: 54px;
      border-radius: 10px;
      border: 1px solid var(--accent-gold);
      object-fit: cover;
      background: #090c10;
    }
    .calc-yield-title {
      font-family: 'Cinzel', serif;
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 2px;
    }
    .calc-yield-amount {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1rem;
      color: var(--accent-gold);
      font-weight: 700;
    }

    /* CALC METRICS CARDS */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 18px;
    }
    .metric-card {
      background: rgba(10, 14, 20, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }
    .metric-label {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .metric-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.95rem;
      font-weight: 700;
      color: #fff;
    }

    /* CALC BREAKDOWN TABLE */
    .calc-table-wrap {
      overflow-x: auto;
      margin-top: 14px;
    }
    .calc-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .calc-table th {
      background: rgba(10, 14, 20, 0.85);
      color: var(--text-muted);
      text-align: left;
      padding: 10px 12px;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .calc-table td {
      padding: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
    }
    .calc-table tr:hover td {
      background: rgba(255, 255, 255, 0.03);
    }
    .td-mat-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .td-mat-icon {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      object-fit: cover;
    }
    .td-mono {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 600;
    }
    .td-gold {
      color: var(--accent-gold);
    }

    /* FOOTER */
    footer {
      text-align: center;
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="bg-deco"></div>

  <div class="container">
    <header>
      <div class="header-badge">⚙️ База Знаний Project Steam</div>
      <h1>База Крафта и Схем Инженера</h1>
      <p class="header-sub">
        Официальный цеховой реестр схем, чертежей и сырья. Полный цикл производства: синтез масел, компрессия боевых зарядов, штамповка защитных пластин, литьё щитов и очистка гидравлики.
      </p>

      <div class="header-links">
        <a href="database.html" class="btn-header">📖 Интро</a>
        <a href="weapons-database.html" class="btn-header">⚔️ Оружие</a>
        <a href="armor-database.html" class="btn-header">🥋 Броня</a>
        <a href="crafting-database.html" class="btn-header active">🔨 Крафт</a>
        <a href="mobs-database.html" class="btn-header">👾 Мобы</a>
        <a href="skills-database.html" class="btn-header">⚡ Скилы</a>
        <a href="index.html" class="btn-header">🎮 В Игру</a>
        <a href="menu.html" class="btn-header">📋 Главное Меню</a>
      </div>
    </header>

    <!-- TABS NAVIGATION -->
    <div class="tabs-nav">
      <button class="tab-btn active" id="tabBtnRecipes" onclick="switchMainTab('recipes')">
        <span>📜</span> Рецепты и Схемы (11)
      </button>
      <button class="tab-btn" id="tabBtnMaterials" onclick="switchMainTab('materials')">
        <span>⚙️</span> Компоненты и Сырьё (24)
      </button>
      <button class="tab-btn" id="tabBtnCalc" onclick="switchMainTab('calc')">
        <span>🧮</span> Калькулятор Ресурсов
      </button>
    </div>

    <!-- TAB 1: RECIPES -->
    <section id="tabRecipes">
      <div class="filter-bar">
        <div class="filter-group" id="recipesFilterGroup">
          <button class="filter-btn active" onclick="filterRecipes('all', this)">Все (11)</button>
          <button class="filter-btn" onclick="filterRecipes('Расходники', this)">Расходники (2)</button>
          <button class="filter-btn" onclick="filterRecipes('Боевые Заряды', this)">Боевые Заряды (2)</button>
          <button class="filter-btn" onclick="filterRecipes('Экипировка и Щиты', this)">Экипировка и Щиты (4)</button>
          <button class="filter-btn" onclick="filterRecipes('Заготовки и Сплавы', this)">Заготовки и Сплавы (3)</button>
        </div>
        <div class="search-box">
          <input type="text" id="recipeSearch" placeholder="Поиск рецепта или сырья..." oninput="onRecipeSearch()">
        </div>
      </div>

      <div class="recipes-grid" id="recipesContainer"></div>
    </section>

    <!-- TAB 2: MATERIALS -->
    <section id="tabMaterials" class="hidden">
      <div class="filter-bar">
        <div class="filter-group" id="materialsFilterGroup">
          <button class="filter-btn active" onclick="filterMaterials('all', this)">Все (24)</button>
          <button class="filter-btn" onclick="filterMaterials('Металлы и Проводники', this)">Металлы и Проводники (6)</button>
          <button class="filter-btn" onclick="filterMaterials('Механика и Клапаны', this)">Механика и Клапаны (7)</button>
          <button class="filter-btn" onclick="filterMaterials('Изоляция и Кристаллы', this)">Изоляция и Кристаллы (7)</button>
          <button class="filter-btn" onclick="filterMaterials('Ядра Боссов', this)">Ядра Боссов (4)</button>
        </div>
        <div class="search-box">
          <input type="text" id="materialSearch" placeholder="Поиск сырья или источника..." oninput="onMaterialSearch()">
        </div>
      </div>

      <div class="materials-grid" id="materialsContainer"></div>
    </section>

    <!-- TAB 3: CALCULATOR -->
    <section id="tabCalc" class="hidden">
      <div class="calculator-layout">
        <!-- LEFT: SELECTION & CONTROLS -->
        <div class="calc-panel">
          <div class="calc-title"><span>🧮</span> Параметры Крафта</div>
          <div class="calc-subtitle">Выберите схему и требуемое количество партий для расчета сырья</div>

          <div class="form-group">
            <label class="form-label" for="calcRecipeSelect">Схема / Чертеж:</label>
            <select id="calcRecipeSelect" class="calc-select" onchange="recalc()"></select>
          </div>

          <div class="form-group">
            <label class="form-label" for="calcBatchCount">Число партий крафта:</label>
            <div class="amount-control">
              <input type="number" id="calcBatchCount" class="amount-input" value="1" min="1" max="9999" oninput="recalc()">
            </div>
            <div class="quick-amounts">
              <button class="btn-quick" onclick="setBatchCount(1)">x1</button>
              <button class="btn-quick" onclick="setBatchCount(5)">x5</button>
              <button class="btn-quick" onclick="setBatchCount(10)">x10</button>
              <button class="btn-quick" onclick="setBatchCount(25)">x25</button>
              <button class="btn-quick" onclick="setBatchCount(50)">x50</button>
              <button class="btn-quick" onclick="setBatchCount(100)">x100</button>
            </div>
          </div>

          <!-- YIELD PREVIEW -->
          <div class="calc-yield-box" id="calcYieldBox">
            <img src="" alt="" id="calcYieldIcon" class="calc-yield-icon">
            <div>
              <div class="calc-yield-title" id="calcYieldTitle"></div>
              <div class="calc-yield-amount" id="calcYieldAmount"></div>
            </div>
          </div>

          <!-- SUMMARY METRICS -->
          <div class="metrics-row">
            <div class="metric-card">
              <div class="metric-label">Партий</div>
              <div class="metric-val" id="metricBatches">1</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Шанс успеха</div>
              <div class="metric-val" id="metricChance" style="color: #34d399;">100%</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">Сумма в меди</div>
              <div class="metric-val td-gold" id="metricCost">0 🪙</div>
            </div>
          </div>
        </div>

        <!-- RIGHT: REQUIRED MATERIALS TABLE -->
        <div class="calc-panel">
          <div class="calc-title"><span>⚙️</span> Необходимые Ресурсы</div>
          <div class="calc-subtitle">Сводная ведомость сырья, компонентов и кристаллов</div>

          <div class="calc-table-wrap">
            <table class="calc-table">
              <thead>
                <tr>
                  <th>Материал</th>
                  <th>На 1 крафт</th>
                  <th>Всего нужно</th>
                  <th>Стоимость</th>
                </tr>
              </thead>
              <tbody id="calcMaterialsTbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <footer>
      Project Steam &copy; 2026. Автономная база данных инженерного крафта. Все права защищены.
    </footer>
  </div>

  <script>
    // Embedded Knowledge Data
    const RECIPES = ${recipesJson};
    const MATERIALS = ${materialsJson};

    // Material Map by ID
    const MAT_MAP = {};
    MATERIALS.forEach(m => { MAT_MAP[m.id] = m; });

    let currentRecipeCategory = 'all';
    let currentMaterialCategory = 'all';

    // TAB SWITCHING
    function switchMainTab(tab) {
      document.getElementById('tabRecipes').classList.toggle('hidden', tab !== 'recipes');
      document.getElementById('tabMaterials').classList.toggle('hidden', tab !== 'materials');
      document.getElementById('tabCalc').classList.toggle('hidden', tab !== 'calc');

      document.getElementById('tabBtnRecipes').classList.toggle('active', tab === 'recipes');
      document.getElementById('tabBtnMaterials').classList.toggle('active', tab === 'materials');
      document.getElementById('tabBtnCalc').classList.toggle('active', tab === 'calc');

      if (tab === 'calc') {
        recalc();
      }
    }

    // Jump to calculator with selected recipe
    function jumpToCalc(recipeId) {
      switchMainTab('calc');
      const select = document.getElementById('calcRecipeSelect');
      if (select) {
        select.value = recipeId;
        recalc();
      }
      window.scrollTo({ top: 350, behavior: 'smooth' });
    }

    // RENDER RECIPES
    function renderRecipes() {
      const container = document.getElementById('recipesContainer');
      const q = (document.getElementById('recipeSearch').value || '').toLowerCase().trim();

      const filtered = RECIPES.filter(r => {
        if (currentRecipeCategory !== 'all' && r.category !== currentRecipeCategory) return false;
        if (q) {
          const matchName = r.name.toLowerCase().includes(q);
          const matchResult = r.result.name.toLowerCase().includes(q);
          const matchDesc = r.description.toLowerCase().includes(q);
          const matchMats = r.materials.some(m => m.name.toLowerCase().includes(q));
          if (!matchName && !matchResult && !matchDesc && !matchMats) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Рецепты не найдены по заданным критериям</div>';
        return;
      }

      container.innerHTML = filtered.map(r => {
        let chanceClass = '';
        if (r.chance === 100) chanceClass = '';
        else if (r.chance >= 70) chanceClass = 'med';
        else chanceClass = 'low';

        const matsHtml = r.materials.map(m => \`
          <div class="mat-item">
            <img src="\${m.icon}" alt="\${m.name}" class="mat-icon" onerror="this.src='assets/inventar/icons/gear_fragment.webp'">
            <div class="mat-details">
              <span class="mat-name" title="\${m.name}">\${m.name}</span>
              <span class="mat-qty">\${m.count} шт.</span>
            </div>
          </div>
        \`).join('');

        return \`
          <div class="recipe-card">
            <div class="card-top">
              <div class="badges-row">
                <span class="badge badge-\${r.gradeClass}">\${r.grade}</span>
                <span class="badge badge-cat">\${r.category}</span>
              </div>
              <span class="chance-pill \${chanceClass}">\${r.chance}% Успех</span>
            </div>

            <div class="result-display">
              <div class="item-icon-box">
                <img src="\${r.result.icon}" alt="\${r.result.name}" onerror="this.src='assets/inventar/icons/gear_fragment.webp'">
                <span class="item-count-tag">x\${r.result.count}</span>
              </div>
              <div class="result-info">
                <div class="result-name">\${r.result.name}</div>
                <div class="recipe-title">\${r.name}</div>
              </div>
            </div>

            <div class="recipe-desc">\${r.description}</div>

            <div class="blueprint-box">
              <strong>📜 Источник чертежа:</strong> \${r.blueprintSource}
            </div>

            <div class="materials-box">
              <div class="materials-heading">
                <span>Требуемые компоненты:</span>
                <span>На 1 партию</span>
              </div>
              <div class="materials-list">
                \${matsHtml}
              </div>
            </div>

            <div class="card-actions">
              <button class="btn-calc-jump" onclick="jumpToCalc('\${r.id}')">
                <span>🧮</span> Рассчитать в калькуляторе
              </button>
            </div>
          </div>
        \`;
      }).join('');
    }

    function filterRecipes(cat, btn) {
      currentRecipeCategory = cat;
      const group = document.getElementById('recipesFilterGroup');
      group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRecipes();
    }

    function onRecipeSearch() {
      renderRecipes();
    }

    // RENDER MATERIALS
    function renderMaterials() {
      const container = document.getElementById('materialsContainer');
      const q = (document.getElementById('materialSearch').value || '').toLowerCase().trim();

      const filtered = MATERIALS.filter(m => {
        if (currentMaterialCategory !== 'all' && m.category !== currentMaterialCategory) return false;
        if (q) {
          const matchName = m.name.toLowerCase().includes(q);
          const matchSource = m.source.toLowerCase().includes(q);
          const matchDesc = m.description.toLowerCase().includes(q);
          if (!matchName && !matchSource && !matchDesc) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Материалы не найдены</div>';
        return;
      }

      container.innerHTML = filtered.map(m => {
        return \`
          <div class="material-card">
            <div class="mat-card-header">
              <img src="\${m.icon}" alt="\${m.name}" class="mat-big-icon" onerror="this.src='assets/inventar/icons/gear_fragment.webp'">
              <div class="mat-card-title">
                <div class="mat-card-name">\${m.name}</div>
                <div class="badges-row">
                  <span class="badge badge-\${m.gradeClass}">\${m.grade}</span>
                  <span class="badge badge-cat">\${m.category}</span>
                </div>
              </div>
            </div>

            <div class="mat-stats-bar">
              <div>Вес: <span>\${m.weight} г</span></div>
              <div>Базовая цена: <span>\${m.price} 🪙</span></div>
            </div>

            <div class="mat-source-box">
              <strong>🏭 Источник:</strong> \${m.source}
            </div>

            <div class="mat-desc-text">\${m.description}</div>
          </div>
        \`;
      }).join('');
    }

    function filterMaterials(cat, btn) {
      currentMaterialCategory = cat;
      const group = document.getElementById('materialsFilterGroup');
      group.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMaterials();
    }

    function onMaterialSearch() {
      renderMaterials();
    }

    // CALCULATOR LOGIC
    function initCalcSelect() {
      const select = document.getElementById('calcRecipeSelect');
      select.innerHTML = RECIPES.map(r => \`
        <option value="\${r.id}">\${r.result.name} (x\${r.result.count} шт.) [\${r.category}]</option>
      \`).join('');
    }

    function setBatchCount(val) {
      document.getElementById('calcBatchCount').value = val;
      recalc();
    }

    function recalc() {
      const recipeId = document.getElementById('calcRecipeSelect').value || (RECIPES[0] && RECIPES[0].id);
      const recipe = RECIPES.find(r => r.id === recipeId) || RECIPES[0];
      if (!recipe) return;

      let batches = parseInt(document.getElementById('calcBatchCount').value, 10);
      if (isNaN(batches) || batches < 1) batches = 1;

      // Update yield preview
      const totalYield = recipe.result.count * batches;
      document.getElementById('calcYieldIcon').src = recipe.result.icon;
      document.getElementById('calcYieldTitle').textContent = recipe.result.name;
      document.getElementById('calcYieldAmount').textContent = 'Итого: ' + totalYield + ' шт. (' + batches + ' партий)';

      document.getElementById('metricBatches').textContent = batches;
      document.getElementById('metricChance').textContent = recipe.chance + '%';

      // Calculate materials
      let totalCost = 0;
      const tbody = document.getElementById('calcMaterialsTbody');

      tbody.innerHTML = recipe.materials.map(m => {
        const perCraft = m.count;
        const totalCount = perCraft * batches;
        const matData = MAT_MAP[m.id];
        const unitPrice = matData ? matData.price : 10;
        const matCost = unitPrice * totalCount;
        totalCost += matCost;

        return \`
          <tr>
            <td>
              <div class="td-mat-info">
                <img src="\${m.icon}" alt="\${m.name}" class="td-mat-icon" onerror="this.src='assets/inventar/icons/gear_fragment.webp'">
                <span>\${m.name}</span>
              </div>
            </td>
            <td class="td-mono">\${perCraft} шт.</td>
            <td class="td-mono td-gold">\${totalCount} шт.</td>
            <td class="td-mono">\${matCost.toLocaleString('ru-RU')} 🪙</td>
          </tr>
        \`;
      }).join('');

      document.getElementById('metricCost').textContent = totalCost.toLocaleString('ru-RU') + ' 🪙';
    }

    // INITIALIZATION
    document.addEventListener('DOMContentLoaded', () => {
      initCalcSelect();
      renderRecipes();
      renderMaterials();
      recalc();
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../client/crafting-database.html'), htmlContent, 'utf8');
console.log('Successfully generated client/crafting-database.html');
