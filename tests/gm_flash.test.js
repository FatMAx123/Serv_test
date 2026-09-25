'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const { SKILLS } = require(path.join(ROOT, 'shared', 'skill-db.js'));
const { META } = require(path.join(ROOT, 'shared', 'l2-skill-meta.js'));

module.exports = function (t) {
  // 1. Skill Database Verification
  t.suite('GM Flash: Shared Database definitions');
  t.ok(SKILLS.gm_flash, 'gm_flash must exist in shared/skill-db.js');
  t.ok(SKILLS.gm_speed, 'gm_speed alias must exist in shared/skill-db.js');
  t.eq(SKILLS.gm_flash.gm, true, 'gm_flash must be flagged as gm: true');
  t.eq(SKILLS.gm_flash.type, 'toggle', 'gm_flash must be a toggle skill');
  t.ok(SKILLS.gm_flash.speedBoost >= 2.0, 'gm_flash must offer high speed boost');
  t.ok(SKILLS.gm_flash.icon, 'gm_flash must have an icon defined');

  // 2. Icon file existence
  t.suite('GM Flash: Icon Assets presence');
  const webpIcon = path.join(ROOT, 'client', 'assets', 'skills', 'special', 'gm_flash.webp');
  const jpgIcon = path.join(ROOT, 'client', 'assets', 'skills', 'special', 'gm_flash.jpg');
  t.ok(fs.existsSync(webpIcon), 'gm_flash.webp must exist');
  t.ok(fs.existsSync(jpgIcon), 'gm_flash.jpg must exist');

  // 3. Metadata Verification
  t.suite('GM Flash: l2-skill-meta.js registration');
  t.ok(META.gm_flash, 'gm_flash must be in l2-skill-meta.js');
  t.ok(META.gm_speed, 'gm_speed must be in l2-skill-meta.js');
  t.eq(META.gm_flash.l2Class, 'Game Master', 'gm_flash must have Game Master class');

  // 4. Client Skill Database & Learning
  t.suite('GM Flash: Client Skills & VFX');
  const skillsFile = fs.readFileSync(path.join(ROOT, 'client', 'js', 'skills.js'), 'utf8');
  t.ok(skillsFile.includes('GM_FLASH'), 'skills.js must define GM_FLASH');

  const vfxFile = fs.readFileSync(path.join(ROOT, 'client', 'js', 'skill-vfx.js'), 'utf8');
  t.ok(vfxFile.includes('playFlashBurst'), 'skill-vfx.js must define playFlashBurst');
  t.ok(vfxFile.includes('updateFlashRunEffects'), 'skill-vfx.js must define updateFlashRunEffects');

  // 5. Server GM Handler & Chat Commands
  t.suite('GM Flash: Server GM Handler & Chat Commands');
  const gmHandlerFile = fs.readFileSync(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'), 'utf8');
  t.ok(gmHandlerFile.includes("cmd === 'flash'"), 'gm-handler.js must handle //flash command');
  t.ok(gmHandlerFile.includes("cmd === 'speed'"), 'gm-handler.js must handle //speed command');
  t.ok(gmHandlerFile.includes('flash_fx'), 'gm-handler.js must broadcast flash_fx on //flash and //speed');

  const serverFile = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(serverFile.includes("skillId === 'gm_flash'"), 'server.js doSkillCast must handle gm_flash');
  t.ok(serverFile.includes('s *= p.gmSpeedMul'), 'server.js speed calculation must respect gmSpeedMul');
  t.ok(serverFile.includes("starters.push('gm_speed')"), 'server.js grantStarterSkills must grant gm_speed');
  t.ok(skillsFile.includes("learnSkill('gm_speed'"), 'skills.js must learn gm_speed');

  // 6. Network WebSocket Synchronization
  t.suite('GM Flash: Client NetWS Synchronization');
  const netWsFile = fs.readFileSync(path.join(ROOT, 'client', 'js', 'net-ws.js'), 'utf8');
  t.ok(netWsFile.includes("case 'flash_fx':"), 'net-ws.js must handle flash_fx packet');
  t.ok(netWsFile.includes('g.player.gmSpeedMul = m.gmSpeedMul'), 'net-ws.js must apply gmSpeedMul on self_sync');
};
