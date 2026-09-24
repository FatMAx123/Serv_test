// SCRIPTS / EMBED_DB_DATA.JS
const fs = require('fs');
const path = require('path');

const engData = fs.readFileSync(path.join(__dirname, '../data/engineer_skills_db.json'), 'utf8');
const jsEng = `// SHARED / ENGINEER-SKILLS-DB.JS
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ENGINEER_SKILLS_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var DATA = ${engData};

  function getSkill(id) {
    if (!id || !DATA.skills) return null;
    var norm = String(id).toLowerCase();
    for (var i = 0; i < DATA.skills.length; i++) {
      var s = DATA.skills[i];
      if (s.id.toLowerCase() === norm || (s.l2Name && s.l2Name.toLowerCase() === norm)) return s;
    }
    return null;
  }

  function getSkillsByCategory(cat) {
    if (!cat || !DATA.skills) return [];
    var out = [];
    for (var i = 0; i < DATA.skills.length; i++) {
      if (DATA.skills[i].category === cat) out.push(DATA.skills[i]);
    }
    return out;
  }

  function getSkillsByLevel(level) {
    level = level | 0;
    if (!DATA.skills) return [];
    var out = [];
    for (var i = 0; i < DATA.skills.length; i++) {
      if ((DATA.skills[i].levelReq | 0) <= level) out.push(DATA.skills[i]);
    }
    return out;
  }

  return {
    META: DATA.meta,
    SKILLS: DATA.skills,
    getSkill: getSkill,
    getSkillsByCategory: getSkillsByCategory,
    getSkillsByLevel: getSkillsByLevel
  };
});
`;

fs.writeFileSync(path.join(__dirname, '../shared/engineer-skills-db.js'), jsEng, 'utf8');
console.log('Successfully updated shared/engineer-skills-db.js with embedded data.');

const itemData = fs.readFileSync(path.join(__dirname, '../data/item_buffs_db.json'), 'utf8');
const jsItem = `// SHARED / ITEM-BUFFS-DB.JS
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ITEM_BUFFS_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var DATA = ${itemData};

  function findItem(id) {
    if (!id) return null;
    var norm = String(id).toLowerCase();
    var list = DATA.project_steam_items || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id.toLowerCase() === norm) return list[i];
    }
    var refList = DATA.tactical_manuals_and_consumables || [];
    for (var j = 0; j < refList.length; j++) {
      if (refList[j].id.toLowerCase() === norm) return refList[j];
    }
    return null;
  }

  function getElixirs() {
    return (DATA.project_steam_items || []).filter(function (it) {
      return it.type === 'elixir';
    });
  }

  function getShots() {
    return (DATA.project_steam_items || []).filter(function (it) {
      return it.type === 'shot';
    });
  }

  return {
    META: DATA.meta,
    PROJECT_STEAM_ITEMS: DATA.project_steam_items,
    TACTICAL_MANUALS: DATA.tactical_manuals_and_consumables,
    findItem: findItem,
    getElixirs: getElixirs,
    getShots: getShots
  };
});
`;

fs.writeFileSync(path.join(__dirname, '../shared/item-buffs-db.js'), jsItem, 'utf8');
console.log('Successfully updated shared/item-buffs-db.js with embedded data.');
