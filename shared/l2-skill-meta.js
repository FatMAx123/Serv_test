// SHARED / L2-SKILL-META.JS
// Полная карта канонических имен и base SP (1-й ранг) для Project Steam skills (шкала C1).
// Источник SP: шкала C1 (Human Fighter / Mystic → 1st → 2nd).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.L2_SKILL_META = api; root.SKILL_META = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /**
   * id → { l2Name, spCost, l2Class?, note? }
   * spCost = SP за 1-й ранг (как у skill trainer C1).
   */
  var META = {
    // ─── Human Fighter → Operator (1–19) ───
    op_power_strike:     { l2Name: 'Power Strike',       spCost: 50,   l2Class: 'Human Fighter', levelReq: 1 },
    op_mortal_blow:      { l2Name: 'Mortal Blow',        spCost: 50,   l2Class: 'Human Fighter', levelReq: 5 },
    op_power_shot:       { l2Name: 'Power Shot',         spCost: 50,   l2Class: 'Human Fighter', levelReq: 5 },
    op_weapon_mastery:   { l2Name: 'Weapon Mastery',     spCost: 70,   l2Class: 'Human Fighter', levelReq: 5 },
    op_armor_mastery:    { l2Name: 'Armor Mastery',      spCost: 400,  l2Class: 'Human Fighter', levelReq: 5 },
    op_sturdy_frame:     { l2Name: 'Tough Body',         spCost: 140,  l2Class: 'Human Fighter', levelReq: 3 },
    op_iron_punch:       { l2Name: 'Iron Punch',         spCost: 320,  l2Class: 'Human Fighter', levelReq: 5 },
    op_steam_vent:       { l2Name: 'Whirlwind',          spCost: 1100, l2Class: 'Human Fighter', levelReq: 8 },
    op_oil_slick:        { l2Name: 'Poison',             spCost: 1600, l2Class: 'Human Fighter', levelReq: 10 },
    op_tough_frame:      { l2Name: 'Vital Force',        spCost: 1800, l2Class: 'Human Fighter', levelReq: 10 },
    op_emergency_repair: { l2Name: 'Battle Heal',        spCost: 2400, l2Class: 'Human Fighter', levelReq: 12 },
    op_overclock:        { l2Name: 'Might',              spCost: 3200, l2Class: 'Human Fighter', levelReq: 14 },
    op_quick_hands:      { l2Name: 'Quick Step',         spCost: 3800, l2Class: 'Human Fighter', levelReq: 15 },
    op_scrap_collect:    { l2Name: 'Spoil',              spCost: 4500, l2Class: 'Human Fighter', levelReq: 16 },
    op_relax:            { l2Name: 'Relax',              spCost: 160,  l2Class: 'Human Fighter', levelReq: 5 },
    op_expertise_d:      { l2Name: 'Expertise D',        spCost: 0,    l2Class: 'Human Fighter', levelReq: 20 },
    eng_expertise_d:     { l2Name: 'Expertise D',        spCost: 0,    l2Class: 'Human Mystic', levelReq: 20 },
    op_create_item:      { l2Name: 'Create Common Item', spCost: 0,    l2Class: 'Human Fighter', levelReq: 1 },
    op_common_craft:     { l2Name: 'Common Craft',       spCost: 0,    l2Class: 'Human Fighter', levelReq: 1 },

    // ─── Human Mystic → Engineer (1–19) ───
    eng_lucky:           { l2Name: 'Lucky',              spCost: 0,    l2Class: 'Human Mystic', levelReq: 1 },
    eng_expert_tune:     { l2Name: 'Expert Casting',     spCost: 0,    l2Class: 'Human Mystic', levelReq: 1 },
    eng_robe_step:       { l2Name: 'Magician Movement',  spCost: 0,    l2Class: 'Human Mystic', levelReq: 1 },
    eng_coolant_mind:    { l2Name: 'Mana Recovery',      spCost: 0,    l2Class: 'Human Mystic', levelReq: 1 },
    eng_pressure_bolt:   { l2Name: 'Wind Strike',        spCost: 50,   l2Class: 'Human Mystic', levelReq: 1 },
    eng_self_repair:     { l2Name: 'Self Heal',          spCost: 0,    l2Class: 'Human Mystic', levelReq: 1 },
    eng_weapon_mastery:  { l2Name: 'Weapon Mastery',     spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_armor_mastery:   { l2Name: 'Armor Mastery',      spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_circuit_mastery: { l2Name: 'Anti Magic',         spCost: 240,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_pressure_seal:   { l2Name: 'Ice Bolt',           spCost: 240,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_field_repair:    { l2Name: 'Heal',               spCost: 160,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_might:           { l2Name: 'Might',              spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_shield:          { l2Name: 'Shield',             spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_cure_toxin:      { l2Name: 'Cure Poison',        spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_curse_corrode:   { l2Name: 'Curse: Poison',      spCost: 470,  l2Class: 'Human Mystic', levelReq: 7 },
    eng_pressure_drain:  { l2Name: 'Vampiric Touch',     spCost: 1100, l2Class: 'Human Mystic', levelReq: 14 },
    eng_battle_repair:   { l2Name: 'Battle Heal',        spCost: 700,  l2Class: 'Human Mystic', levelReq: 14 },
    eng_group_repair:    { l2Name: 'Group Heal',         spCost: 700,  l2Class: 'Human Mystic', levelReq: 14 },
    eng_curse_weak:      { l2Name: 'Curse: Weakness',    spCost: 2100, l2Class: 'Human Mystic', levelReq: 14 },

    // ─── 1st Class Human Fighters (Knight, Warrior, Rogue) (20–39) ───
    mech_aggression:       { l2Name: 'Aggression',           spCost: 3300,  l2Class: 'Knight', levelReq: 20 },
    mech_shield_bash:      { l2Name: 'Shield Stun',          spCost: 1500,  l2Class: 'Knight', levelReq: 20 },
    mech_reinforced_armor: { l2Name: 'Heavy Armor Mastery',  spCost: 1500,  l2Class: 'Knight', levelReq: 20 },
    mech_defense_aura:     { l2Name: 'Defense Aura',         spCost: 4700,  l2Class: 'Knight', levelReq: 20 },
    mech_shield_mastery:   { l2Name: 'Shield Mastery',       spCost: 4700,  l2Class: 'Knight', levelReq: 20 },
    mech_steam_wall:       { l2Name: 'Ultimate Defense',     spCost: 4700,  l2Class: 'Knight', levelReq: 20 },
    mech_steam_reserve:    { l2Name: 'Focus Mind',           spCost: 39000, l2Class: 'Knight', levelReq: 36 },
    mech_repair_beam:      { l2Name: 'Divine Heal',          spCost: 4000,  l2Class: 'Knight', levelReq: 28 },
    mech_reinforced_edge:  { l2Name: 'Holy Blade',           spCost: 18000, l2Class: 'Knight', levelReq: 28 },
    mech_threat_generator: { l2Name: 'Hate Aura',            spCost: 20000, l2Class: 'Knight', levelReq: 28 },
    mech_pressure_aura:    { l2Name: 'Majesty',              spCost: 4700,  l2Class: 'Knight', levelReq: 20 },
    mech_hydraulic_slam:   { l2Name: 'Shield Slam',          spCost: 34000, l2Class: 'Knight', levelReq: 32 },
    mech_last_stand:       { l2Name: 'Ultimate Defense',     spCost: 48000, l2Class: 'Knight', levelReq: 35 },
    mech_emergency_shutdown:{ l2Name: 'Arrest',              spCost: 55000, l2Class: 'Knight', levelReq: 36 },
    mech_deflect_arrow:    { l2Name: 'Deflect Arrow',        spCost: 10000, l2Class: 'Knight', levelReq: 24 },
    mech_magic_res:        { l2Name: 'Magic Resistance',     spCost: 2300,  l2Class: 'Knight', levelReq: 20 },

    dest_power_smash:      { l2Name: 'Power Smash',          spCost: 1200,  l2Class: 'Warrior', levelReq: 20 },
    dest_demolish:         { l2Name: 'Fatal Strike',         spCost: 11000, l2Class: 'Warrior', levelReq: 20 },
    dest_heavy_strikes:    { l2Name: 'Sword / Blunt Mastery', spCost: 3700,  l2Class: 'Warrior', levelReq: 20 },
    dest_stun_attack:      { l2Name: 'Stun Attack',          spCost: 1200,  l2Class: 'Warrior', levelReq: 20 },
    dest_war_cry:          { l2Name: 'War Cry',              spCost: 3700,  l2Class: 'Warrior', levelReq: 20 },
    dest_critical_mass:    { l2Name: 'Critical Chance',      spCost: 11000, l2Class: 'Warrior', levelReq: 28 },
    dest_berserker_steam:  { l2Name: 'Berserker Spirit',     spCost: 16000, l2Class: 'Warrior', levelReq: 26 },
    dest_frag_grenade:     { l2Name: 'Whirlwind',            spCost: 19000, l2Class: 'Warrior', levelReq: 28 },
    dest_vicious_stance:   { l2Name: 'Vicious Stance',       spCost: 3700,  l2Class: 'Warrior', levelReq: 20 },
    dest_explosive_expert: { l2Name: 'Boost HP',             spCost: 3700,  l2Class: 'Warrior', levelReq: 20 },
    dest_crushing_blow:    { l2Name: 'Hammer Crush',         spCost: 42000, l2Class: 'Warrior', levelReq: 34 },
    dest_adrenaline:       { l2Name: 'Adrenaline',           spCost: 50000, l2Class: 'Warrior', levelReq: 35 },
    dest_chain_detonation: { l2Name: 'Thunder Storm',        spCost: 58000, l2Class: 'Warrior', levelReq: 36 },
    dest_wild_sweep:       { l2Name: 'Wild Sweep',           spCost: 1200,  l2Class: 'Warrior', levelReq: 20 },
    dest_polearm_mastery:  { l2Name: 'Polearm Mastery',      spCost: 3700,  l2Class: 'Warrior', levelReq: 20 },
    dest_fast_hp_rec:      { l2Name: 'Fast HP Recovery',     spCost: 6400,  l2Class: 'Warrior', levelReq: 24 },
    dest_lionheart:        { l2Name: 'Lionheart',            spCost: 31000, l2Class: 'Warrior', levelReq: 36 },
    dest_battle_roar:      { l2Name: 'Battle Roar',          spCost: 12000, l2Class: 'Warrior', levelReq: 28 },
    dest_detect_insect:    { l2Name: 'Detect Insect Weakness', spCost: 18000, l2Class: 'Warrior', levelReq: 32 },

    gun_mortal_blow:       { l2Name: 'Mortal Blow',          spCost: 1400,  l2Class: 'Rogue', levelReq: 20 },
    gun_precision_shot:    { l2Name: 'Power Shot',           spCost: 1400,  l2Class: 'Rogue', levelReq: 20 },
    gun_eagle_eye:         { l2Name: 'Rapid Shot',           spCost: 18000, l2Class: 'Rogue', levelReq: 32 },
    gun_dash:              { l2Name: 'Dash',                 spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_rapid_fire:        { l2Name: 'Double Shot',          spCost: 11000, l2Class: 'Rogue', levelReq: 24 },
    gun_deadly_aim:        { l2Name: 'Critical Chance',      spCost: 11000, l2Class: 'Rogue', levelReq: 28 },
    gun_piercing_round:    { l2Name: 'Bleed',                spCost: 5900,  l2Class: 'Rogue', levelReq: 24 },
    gun_smoke_screen:      { l2Name: 'Veil',                 spCost: 16000, l2Class: 'Rogue', levelReq: 26 },
    gun_ultimate_evasion:  { l2Name: 'Ultimate Evasion',     spCost: 11000, l2Class: 'Rogue', levelReq: 28 },
    gun_evasion_protocol:  { l2Name: 'Light Armor Mastery',  spCost: 1700,  l2Class: 'Rogue', levelReq: 20 },
    gun_explosive_trap:    { l2Name: 'Blinding Blow',        spCost: 36000, l2Class: 'Rogue', levelReq: 32 },
    gun_sniper_mode:       { l2Name: 'Snipe',                spCost: 45000, l2Class: 'Rogue', levelReq: 34 },
    gun_overcharge:        { l2Name: 'Bow Mastery',          spCost: 1100,  l2Class: 'Rogue', levelReq: 20 },
    gun_bullet_storm:      { l2Name: 'Burst Shot',           spCost: 70000, l2Class: 'Rogue', levelReq: 38 },
    gun_unlock:            { l2Name: 'Unlock',               spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_stunning_shot:     { l2Name: 'Stunning Shot',        spCost: 10000, l2Class: 'Rogue', levelReq: 36 },
    gun_long_shot:         { l2Name: 'Long Shot',            spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_boost_atk_spd:     { l2Name: 'Boost Attack Speed',   spCost: 31000, l2Class: 'Rogue', levelReq: 36 },
    gun_esprit:            { l2Name: 'Esprit',               spCost: 31000, l2Class: 'Rogue', levelReq: 36 },
    gun_acrobatics:        { l2Name: 'Acrobatics',           spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_critical_power:    { l2Name: 'Critical Power',       spCost: 5900,  l2Class: 'Rogue', levelReq: 24 },
    gun_breath_boost:      { l2Name: 'Breath Boost',         spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_boost_evasion:     { l2Name: 'Boost Evasion',        spCost: 5900,  l2Class: 'Rogue', levelReq: 24 },
    gun_dagger_mastery:    { l2Name: 'Dagger Mastery',       spCost: 3400,  l2Class: 'Rogue', levelReq: 20 },
    gun_acrobatic_move:    { l2Name: 'Acrobatic Move',       spCost: 11000, l2Class: 'Rogue', levelReq: 28 },
    gun_accuracy:          { l2Name: 'Accuracy',             spCost: 5900,  l2Class: 'Rogue', levelReq: 24 },

    // ─── 1st Class Human Mystics (Wizard, Cleric) (20–39) ───
    con_overload:          { l2Name: 'Prominence',           spCost: 16000, l2Class: 'Wizard', levelReq: 40 },
    con_quick_charge:      { l2Name: 'Quick Recovery',       spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },
    con_coolant_bolt:      { l2Name: 'Ice Bolt',             spCost: 1400,  l2Class: 'Wizard', levelReq: 20 },
    con_focus_protocol:    { l2Name: 'Concentration',        spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },
    con_steam_nova:        { l2Name: 'Blaze',                spCost: 1400,  l2Class: 'Wizard', levelReq: 20 },
    con_high_pressure:     { l2Name: 'Empower',              spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },
    con_surge:             { l2Name: 'Aura Burn',            spCost: 1400,  l2Class: 'Wizard', levelReq: 20 },
    con_fast_casting:      { l2Name: 'Fast Spell Casting',   spCost: 5500,  l2Class: 'Wizard', levelReq: 25 },
    con_fast_mana_rec:     { l2Name: 'Fast Mana Recovery',   spCost: 5500,  l2Class: 'Wizard', levelReq: 25 },
    con_robe_mastery:      { l2Name: 'Robe Mastery',         spCost: 1400,  l2Class: 'Wizard', levelReq: 20 },
    con_higher_mana:       { l2Name: 'Higher Mana Gain',     spCost: 1400,  l2Class: 'Wizard', levelReq: 20 },
    con_sleep:             { l2Name: 'Sleep',                spCost: 1800,  l2Class: 'Wizard', levelReq: 25 },
    con_surrender_fire:    { l2Name: 'Surrender To Fire',    spCost: 5500,  l2Class: 'Wizard', levelReq: 25 },
    con_flame_strike:      { l2Name: 'Flame Strike',         spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },
    con_slow:              { l2Name: 'Slow',                 spCost: 18000, l2Class: 'Wizard', levelReq: 35 },
    con_energy_bolt:       { l2Name: 'Energy Bolt',          spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },

    do_deploy_drone:       { l2Name: 'Summon Kat the Cat',   spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },
    do_servitor_recharge:  { l2Name: 'Servitor Recharge',    spCost: 2800,  l2Class: 'Wizard', levelReq: 25 },
    do_servitor_heal:      { l2Name: 'Servitor Heal',        spCost: 960,   l2Class: 'Wizard', levelReq: 20 },
    do_servitor_speed:     { l2Name: 'Servitor Wind Walk',   spCost: 18000, l2Class: 'Wizard', levelReq: 35 },
    do_summon_mew:         { l2Name: 'Summon Mew the Cat',   spCost: 2900,  l2Class: 'Wizard', levelReq: 20 },

    cc_life_drain:         { l2Name: 'Corpse Life Drain',    spCost: 11000, l2Class: 'Wizard', levelReq: 30 },
    cc_body_to_mind:       { l2Name: 'Body To Mind',         spCost: 5500,  l2Class: 'Wizard', levelReq: 25 },
    cc_poison_cloud:       { l2Name: 'Poisonous Cloud',      spCost: 5500,  l2Class: 'Wizard', levelReq: 25 },
    cc_curse_chaos:        { l2Name: 'Curse Chaos',          spCost: 18000, l2Class: 'Wizard', levelReq: 35 },

    tec_repair:            { l2Name: 'Heal',                 spCost: 1100,  l2Class: 'Cleric', levelReq: 20 },
    tec_might:             { l2Name: 'Might',                spCost: 3300,  l2Class: 'Cleric', levelReq: 20 },
    tec_quick_recovery:    { l2Name: 'Fast HP Recovery',     spCost: 21000, l2Class: 'Cleric', levelReq: 35 },
    tec_shield:            { l2Name: 'Shield',               spCost: 6900,  l2Class: 'Cleric', levelReq: 25 },
    tec_group_overhaul:    { l2Name: 'Group Heal',           spCost: 1100,  l2Class: 'Cleric', levelReq: 20 },
    tec_protocol_bless:    { l2Name: 'Bless the Body',       spCost: 12000, l2Class: 'Cleric', levelReq: 25 },
    tec_servo_boost:       { l2Name: 'Wind Walk',            spCost: 3300,  l2Class: 'Cleric', levelReq: 20 },
    tec_protocol_buff:     { l2Name: 'Bless the Soul',       spCost: 20000, l2Class: 'Cleric', levelReq: 25 },
    tec_resist_corrosion:  { l2Name: 'Resist Poison',        spCost: 20000, l2Class: 'Cleric', levelReq: 25 },
    tec_battle_repair:     { l2Name: 'Greater Battle Heal',  spCost: 36000, l2Class: 'Cleric', levelReq: 35 },
    tec_robe_mastery:      { l2Name: 'Robe Mastery',         spCost: 1600,  l2Class: 'Cleric', levelReq: 20 },
    tec_light_armor_mastery:{ l2Name: 'Light Armor Mastery', spCost: 1600,  l2Class: 'Cleric', levelReq: 20 },
    tec_disrupt_undead:    { l2Name: 'Disrupt Undead',       spCost: 1600,  l2Class: 'Cleric', levelReq: 20 },
    tec_mental_shield:     { l2Name: 'Mental Shield',        spCost: 6900,  l2Class: 'Cleric', levelReq: 25 },
    tec_holy_weapon:       { l2Name: 'Holy Weapon',          spCost: 6900,  l2Class: 'Cleric', levelReq: 25 },
    tec_regeneration:      { l2Name: 'Regeneration',         spCost: 21000, l2Class: 'Cleric', levelReq: 35 },
    tec_berserker_spirit:  { l2Name: 'Berserker Spirit',     spCost: 21000, l2Class: 'Cleric', levelReq: 35 },
    tec_kiss_of_eva:       { l2Name: 'Kiss of Eva',          spCost: 3300,  l2Class: 'Cleric', levelReq: 20 },
    tec_peace:             { l2Name: 'Peace',                spCost: 21000, l2Class: 'Cleric', levelReq: 35 },
    tec_focus:             { l2Name: 'Focus',                spCost: 6900,  l2Class: 'Cleric', levelReq: 25 },
    tec_acumen:            { l2Name: 'Acumen',               spCost: 3300,  l2Class: 'Cleric', levelReq: 20 },
    tec_resist_fire:       { l2Name: 'Resist Fire',          spCost: 13000, l2Class: 'Cleric', levelReq: 30 },
    tec_dryad_root:        { l2Name: 'Dryad Root',           spCost: 2300,  l2Class: 'Cleric', levelReq: 25 },

    // ─── 2nd & 3rd Class Humans (Stored in DB for Updates, lvl 40+) ───
    re_mass_repair:        { l2Name: 'Greater Group Heal',   spCost: 120000, l2Class: 'Paladin', levelReq: 40 },
    re_fortress_plate:     { l2Name: 'Holy Armor',           spCost: 110000, l2Class: 'Paladin', levelReq: 40 },
    bg_iron_will:          { l2Name: 'Iron Will',            spCost: 115000, l2Class: 'Dark Avenger', levelReq: 40 },
    bg_drain_strike:       { l2Name: 'Drain Health',         spCost: 125000, l2Class: 'Dark Avenger', levelReq: 40 },
    dem_whirlwind:         { l2Name: 'Whirlwind',            spCost: 130000, l2Class: 'Warlord', levelReq: 40 },
    sb_triple_slash:       { l2Name: 'Triple Slash',         spCost: 11000,  l2Class: 'Gladiator', levelReq: 40 },
    sb_double_sonic:       { l2Name: 'Double Sonic Slash',   spCost: 14000,  l2Class: 'Gladiator', levelReq: 49 },
    sb_sonic_blaster:      { l2Name: 'Sonic Blaster',        spCost: 11000,  l2Class: 'Gladiator', levelReq: 43 },
    sb_sonic_storm:        { l2Name: 'Sonic Storm',          spCost: 22000,  l2Class: 'Gladiator', levelReq: 49 },
    sb_sonic_focus:        { l2Name: 'Sonic Focus',          spCost: 33000,  l2Class: 'Gladiator', levelReq: 40 },
    sb_sonic_buster:       { l2Name: 'Sonic Buster',         spCost: 12000,  l2Class: 'Gladiator', levelReq: 43 },
    sb_dual_mastery:       { l2Name: 'Dual Weapon Mastery',  spCost: 11000,  l2Class: 'Gladiator', levelReq: 40 },
    ps_double_shot:        { l2Name: 'Double Shot',          spCost: 125000, l2Class: 'Hawkeye', levelReq: 40 },
    ps_snipe:              { l2Name: 'Snipe',                spCost: 130000, l2Class: 'Hawkeye', levelReq: 40 },
    ae_mortar:             { l2Name: 'Burst Shot',           spCost: 130000, l2Class: 'Hawkeye', levelReq: 40 },
    th_backstab:           { l2Name: 'Backstab',             spCost: 120000, l2Class: 'Treasure Hunter', levelReq: 40 },
    pm_pressure_storm:     { l2Name: 'Blazing Circle',       spCost: 16000,  l2Class: 'Sorcerer', levelReq: 40 },
    pm_prominence:         { l2Name: 'Prominence',           spCost: 16000,  l2Class: 'Sorcerer', levelReq: 40 },
    pm_aura_flare:         { l2Name: 'Aura Flare',           spCost: 16000,  l2Class: 'Sorcerer', levelReq: 40 },
    pm_cancellation:       { l2Name: 'Cancellation',         spCost: 63000,  l2Class: 'Sorcerer', levelReq: 48 },
    pm_sleeping_cloud:     { l2Name: 'Sleeping Cloud',       spCost: 41000,  l2Class: 'Sorcerer', levelReq: 44 },
    pm_surrender_wind:     { l2Name: 'Surrender To Wind',    spCost: 32000,  l2Class: 'Sorcerer', levelReq: 40 },
    pm_rain_of_fire:       { l2Name: 'Rain of Fire',         spCost: 140000, l2Class: 'Sorcerer', levelReq: 58 },
    pm_fire_vortex:        { l2Name: 'Fire Vortex',          spCost: 310000, l2Class: 'Sorcerer', levelReq: 76 },
    pm_volcano:            { l2Name: 'Volcano',              spCost: 500000, l2Class: 'Sorcerer', levelReq: 77 },
    do_deploy_drone:       { l2Name: 'Summon Kat the Cat',   spCost: 135000, l2Class: 'Warlock', levelReq: 40 },
    do_summon_kai:         { l2Name: 'Summon Kai the Cat',   spCost: 140000, l2Class: 'Warlock', levelReq: 40 },
    do_binding_cubic:      { l2Name: 'Summon Binding Cubic', spCost: 135000, l2Class: 'Warlock', levelReq: 40 },
    do_servitor_empower:   { l2Name: 'Servitor Empower',     spCost: 120000, l2Class: 'Warlock', levelReq: 40 },
    do_heroic_cat:         { l2Name: 'Heroic Cat',           spCost: 500000, l2Class: 'Arcana Lord', levelReq: 77 },
    cc_corrode:            { l2Name: 'Curse: Poison',        spCost: 135000, l2Class: 'Necromancer', levelReq: 40 },
    cc_corpse_burst:       { l2Name: 'Corpse Burst',         spCost: 140000, l2Class: 'Necromancer', levelReq: 40 },
    cc_curse_gloom:        { l2Name: 'Curse Gloom',          spCost: 135000, l2Class: 'Necromancer', levelReq: 40 },
    cc_curse_disease:      { l2Name: 'Curse Disease',        spCost: 135000, l2Class: 'Necromancer', levelReq: 40 },
    cc_anchor:             { l2Name: 'Anchor',               spCost: 150000, l2Class: 'Necromancer', levelReq: 44 },
    cc_summon_reanimated:  { l2Name: 'Summon Reanimated Man',spCost: 140000, l2Class: 'Necromancer', levelReq: 40 },
    cc_curse_fear:         { l2Name: 'Curse Fear',           spCost: 32000,  l2Class: 'Necromancer', levelReq: 40 },
    cc_day_of_doom:        { l2Name: 'Day of Doom',          spCost: 500000, l2Class: 'Soultaker', levelReq: 77 },
    om_reboot:             { l2Name: 'Resurrection',         spCost: 150000, l2Class: 'Bishop', levelReq: 40 },
    om_major_heal:         { l2Name: 'Major Heal',           spCost: 140000, l2Class: 'Bishop', levelReq: 40 },
    om_greater_group:      { l2Name: 'Greater Group Heal',   spCost: 150000, l2Class: 'Bishop', levelReq: 40 },
    om_vitalize:           { l2Name: 'Vitalize',             spCost: 140000, l2Class: 'Bishop', levelReq: 40 },
    om_balance_heal:       { l2Name: 'Balance Heal',         spCost: 160000, l2Class: 'Bishop', levelReq: 40 },
    om_salvation:          { l2Name: 'Salvation',            spCost: 500000, l2Class: 'Cardinal', levelReq: 77 },
    pd_party_protocol:     { l2Name: 'Prophecy of Fire',     spCost: 140000, l2Class: 'Prophet', levelReq: 40 },
    pd_haste:              { l2Name: 'Haste',                spCost: 140000, l2Class: 'Prophet', levelReq: 40 },
    pd_death_whisper:      { l2Name: 'Death Whisper',        spCost: 140000, l2Class: 'Prophet', levelReq: 40 },
    pd_guidance:           { l2Name: 'Guidance',             spCost: 135000, l2Class: 'Prophet', levelReq: 40 },
    pd_bless_body:         { l2Name: 'Bless the Body',       spCost: 135000, l2Class: 'Prophet', levelReq: 40 },
    pd_bless_soul:         { l2Name: 'Bless the Soul',       spCost: 135000, l2Class: 'Prophet', levelReq: 40 },
    gm_oneshot:            { l2Name: 'GM One-Shot',          spCost: 0,      l2Class: 'Game Master', levelReq: 1 },
    gm_resurrect:          { l2Name: 'Blessed Resurrection (GM)', spCost: 0, l2Class: 'Game Master', levelReq: 1 },
    gm_flash:              { l2Name: 'Flash Speed (GM)',     spCost: 0,      l2Class: 'Game Master', levelReq: 1 },
    gm_speed:              { l2Name: 'Flash Speed (GM)',     spCost: 0,      l2Class: 'Game Master', levelReq: 1 }
  };

  /** C1-like default SP if skill not in META (fallback). */
  function defaultSpCost(levelReq, type) {
    levelReq = Math.max(1, levelReq | 0);
    // curve fitted to C1 early/mid/late
    var sp;
    if (levelReq <= 1) sp = 60;
    else if (levelReq <= 5) sp = 80 + levelReq * 55;
    else if (levelReq <= 10) sp = 200 + levelReq * 140;
    else if (levelReq <= 19) sp = 400 + levelReq * 200;
    else if (levelReq <= 29) sp = 2000 + (levelReq - 20) * 2200;
    else if (levelReq < 40) sp = 22000 + (levelReq - 30) * 4500;
    else sp = 120000;
    if (type === 'passive') sp = Math.floor(sp * 0.88);
    if (type === 'toggle') sp = Math.floor(sp * 1.08);
    return Math.floor(sp);
  }

  function get(skillId) {
    if (!skillId) return null;
    return META[skillId] || META[String(skillId).toLowerCase()] || null;
  }

  function applyToSkill(skill) {
    if (!skill || !skill.id) return skill;
    var m = get(skill.id);
    if (m) {
      if (m.l2Name) skill.l2Name = m.l2Name;
      if (m.spCost != null) skill.spCost = m.spCost;
      if (m.l2Class) skill.l2Class = m.l2Class;
      if (m.levelReq != null && skill.levelReq == null) skill.levelReq = m.levelReq;
    } else {
      if (!skill.l2Name) skill.l2Name = skill.name || skill.id;
      if (skill.spCost == null) skill.spCost = defaultSpCost(skill.levelReq || 1, skill.type);
    }
    if ((skill.levelReq || 1) > 20) {
      skill.futureUpdate = true;
    }
    return skill;
  }

  function applyAll(skillsMap) {
    if (!skillsMap) return skillsMap;
    Object.keys(skillsMap).forEach(function (id) {
      applyToSkill(skillsMap[id]);
    });
    return skillsMap;
  }

  function coverage(skillsList) {
    var total = 0, named = 0, priced = 0;
    (skillsList || []).forEach(function (s) {
      if (!s || !s.id) return;
      total++;
      var m = get(s.id);
      if (m && m.l2Name) named++;
      if (m && m.spCost != null) priced++;
    });
    return { total: total, withL2Name: named, withSp: priced };
  }

  return {
    META: META,
    get: get,
    defaultSpCost: defaultSpCost,
    applyToSkill: applyToSkill,
    applyAll: applyAll,
    coverage: coverage
  };
});
