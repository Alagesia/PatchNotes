/* Patch Notes - starting templates.
   Six very different MMOs built from the same authoring vocabulary, each
   fully wired: zones own monsters and questgivers, quests hand out real
   reward bundles, dungeons sit in zones, bosses sit in dungeons and drop
   real loot. Every one has a real weakness the simulation will find.    */
(function (PN) {
  'use strict';
  var U = PN.util, S = PN.schema, W = PN.world, IT = PN.items;

  /* ------------------------------------------------------------ helpers */

  function mkClass(design, name, role, templateIds, fantasy, opts) {
    var c = S.newClass(name, U.merge({ role: role, abilities: [], fantasy: fantasy }, opts || {}));
    design.classes.push(c);
    (templateIds || []).forEach(function (tid) {
      var ab = PN.abilities.fromTemplate(design, tid, { classId: c.id });
      design.abilities.push(ab);
      c.abilities.push(ab.id);
    });
    c.specs = [{ id: U.id('spc'), name: 'Base', role: role, abilities: c.abilities.slice() }];
    return c;
  }

  /* A zone, populated: monsters, questgivers, quests, rewards, drops. */
  function mkZone(design, name, lo, hi, opts) {
    opts = opts || {};
    var z = S.newZone(name, U.merge({ levelLo: lo, levelHi: hi }, opts));
    design.zones.push(z);
    var line = S.newQuestline(name + ' Campaign', { zoneId: z.id, voiced: !!opts.voiced });
    design.questlines.push(line);
    W.applyGenerated(design, W.generateZoneContent(design, z, {
      seed: opts.seed || (lo * 7919 + hi * 104729),
      monsters: opts.monsters === undefined ? 6 : opts.monsters,
      givers: opts.givers === undefined ? 3 : opts.givers,
      quests: opts.quests === undefined ? 10 : opts.quests,
      families: opts.families,
      voiced: !!opts.voiced,
      questlineId: line.id
    }));
    return z;
  }

  /* A tier is one set per primary stat - a mage cannot wear the
     warrior's plate, and the simulation knows it.                  */
  function mkGearTier(design, prefix, ilvl, rarity, primary, seed) {
    var s = PN.stats.statSetOf(design);
    var all = [], main = [];
    s.primaries.forEach(function (p, idx) {
      var made = IT.generateGearSet(design, {
        itemLevel: ilvl, rarity: rarity,
        prefix: prefix + (s.primaries.length > 1 ? ' ' + p.name.slice(0, 3) : ''),
        primary: p.id, seed: (seed || 1) + idx * 977
      });
      made.forEach(function (g) { design.items.push(g); all.push(g); });
      if (p.id === primary || (!primary && idx === 0)) main = made;
    });
    /* Loot tables want a representative spread, not only one armour type. */
    main.exp = all;
    return main.length ? main : all;
  }

  function mkLootFrom(design, name, items, rolls, extra, dropChance) {
    var t = IT.newLootTable({
      name: name, rolls: rolls || 1,
      dropChance: dropChance === undefined ? 70 : dropChance,
      entries: items.map(function (it) {
        return { itemId: it.id, weight: 10, qtyMin: 1, qtyMax: 1 };
      }),
      guaranteed: extra || [],
      badLuckProtection: 30
    });
    design.lootTables.push(t);
    return t;
  }

  /* A dungeon in a zone, with bosses that drop the tier. */
  function mkDungeon(design, name, zone, opts, bossSpecs, tierItems) {
    opts = opts || {};
    var dg = S.newDungeon(name, U.merge({ zoneId: zone ? zone.id : null }, opts));
    design.dungeons.push(dg);

    var gold = IT.itemById(design, 'cur_gold');
    var valor = IT.itemById(design, 'cur_valor');
    if (tierItems && tierItems.length) {
      dg.trashLootTableId = mkLootFrom(design, name + ' trash',
        tierItems.slice(0, 4), 1,
        gold ? [{ itemId: gold.id, qtyMin: 20, qtyMax: 60 }] : [], 18).id;
    }
    var completion = IT.newReward({
      name: name + ' completion',
      xp: Math.round(Math.pow(opts.levelReq || 20, 1.7) * 30),
      currencies: valor ? (function () { var o = {}; o[valor.id] = 15; return o; })() : {}
    });
    design.rewards.push(completion);
    dg.completionRewardId = completion.id;

    (bossSpecs || []).forEach(function (spec, i) {
      var b = S.newBoss(spec.name, {
        dungeonId: dg.id, order: i, phases: spec.phases,
        spectacleArt: spec.art || 55, enrage: spec.enrage,
        role: i === bossSpecs.length - 1 ? 'endBoss' : 'mid'
      });
      if (tierItems && tierItems.length) {
        var slice = tierItems.slice(i * 3, i * 3 + 5);
        if (!slice.length) slice = tierItems.slice(0, 4);
        b.lootTableId = mkLootFrom(design, spec.name + ' loot', slice,
          i === bossSpecs.length - 1 ? 2 : 1,
          valor ? [{ itemId: valor.id, qtyMin: 10, qtyMax: 25 }] : [],
          i === bossSpecs.length - 1 ? 88 : 62).id;
      }
      var first = IT.newReward({
        name: 'First kill: ' + spec.name,
        xp: Math.round(Math.pow(opts.levelReq || 20, 1.75) * 40)
      });
      design.rewards.push(first);
      b.firstKillRewardId = first.id;
      design.bosses.push(b);
    });
    return dg;
  }

  function ph(name, at, mechanics, damage) {
    return { name: name, trigger: 'hp', at: at, mechanics: mechanics, damage: damage || 50, addTime: 0 };
  }

  /* A reward chain whose stages hand over real bundles. */
  function mkChain(design, name, stages, opts) {
    var steps = stages.map(function (st) {
      var r = IT.newReward({ name: name + ' - ' + st.label, xp: st.xp || 0,
        currencies: st.currencies || {}, items: st.items || [] });
      design.rewards.push(r);
      return { label: st.label, rewardId: r.id, gateWeeks: st.gate || 1,
               requirement: st.req || 'quest' };
    });
    var c = S.newRewardChain(name, U.merge({ steps: steps }, opts || {}));
    design.rewardChains.push(c);
    return c;
  }

  function mkPass(design, weeks, tiers, opts) {
    var bp = design.monetisation.battlePass;
    bp.enabled = true;
    bp.seasonWeeks = weeks;
    U.keys(opts || {}).forEach(function (k) { bp[k] = opts[k]; });
    bp.tiers = [];
    var cosmetics = (design.items || []).filter(function (i) {
      return i.kind === 'cosmetic' || i.kind === 'mount';
    });
    var gold = IT.itemById(design, 'cur_gold');
    for (var t = 1; t <= tiers; t++) {
      var free = null;
      if (t % 4 === 0 && gold) {
        free = IT.newReward({ name: 'Pass free tier ' + t,
          currencies: (function () { var o = {}; o[gold.id] = 250; return o; })() });
        design.rewards.push(free);
      }
      var prem = IT.newReward({ name: 'Pass premium tier ' + t,
        xp: 200 * t,
        items: (t % 5 === 0 && cosmetics.length)
          ? [{ itemId: cosmetics[t % cosmetics.length].id, qty: 1, chance: 1 }] : [],
        currencies: gold ? (function () { var o = {}; o[gold.id] = 150; return o; })() : {} });
      design.rewards.push(prem);
      bp.tiers.push(S.newPassTier(t, {
        freeRewardId: free ? free.id : null, premiumRewardId: prem.id }));
    }
    return bp;
  }

  function mkCosmetics(design, names) {
    names.forEach(function (n, i) {
      design.items.push(IT.newItem({ name: n, kind: i % 3 === 0 ? 'mount' : 'cosmetic',
        rarity: i % 4 === 0 ? 'epic' : 'rare', vendorValue: 0, bind: 'account' }));
    });
  }

  function engines(design, list) {
    design.engines = list.map(function (x) { return S.newEngine(x[0], x[1]); });
  }
  function shop(design, list) {
    design.monetisation.shop = list.map(function (x) {
      var e = S.newShopEntry(x[0]); e.prominence = x[1]; return e;
    });
  }
  /* A season ends in a bundle; a match rolls a table.

     Both used to be bundles, which meant every single game paid out
     the same guaranteed honour - hundreds of times a season, against a
     dungeon that pays on a chance. */
  function pvpRewards(design, name) {
    var valor = IT.itemById(design, 'cur_valor');
    var season = IT.newReward({ name: name + ' season reward', xp: 0,
      currencies: valor ? (function () { var o = {}; o[valor.id] = 400; return o; })() : {} });
    design.rewards.push(season);
    design.pvp.seasonRewardId = season.id;

    /* What one match can pay. Mostly the currency, sometimes something
       worth queueing for. */
    var mats = (design.items || []).filter(function (i) { return i.kind === 'material'; });
    var cosm = (design.items || []).filter(function (i) { return i.kind === 'cosmetic'; });
    var entries = [];
    if (valor) entries.push({ itemId: valor.id, weight: 70, qtyMin: 18, qtyMax: 46 });
    if (mats.length) entries.push({ itemId: mats[0].id, weight: 24, qtyMin: 1, qtyMax: 3 });
    if (cosm.length) entries.push({ itemId: cosm[cosm.length - 1].id, weight: 6,
                                    qtyMin: 1, qtyMax: 1 });
    var table = IT.newLootTable({ name: name + ' match spoils', rolls: 1,
      dropChance: 82, entries: entries });
    design.lootTables.push(table);
    design.pvp.matchLootId = table.id;
  }
  function firstOfKind(design, kind) {
    var found = null;
    (design.items || []).forEach(function (i) { if (!found && i.kind === kind) found = i; });
    return found;
  }

  /* ==================================================== 1. THEMEPARK ==== */
  function themepark() {
    var d = S.newDesign('Azuremoor');
    d.meta.studio = 'Keystone Interactive';
    d.meta.tagline = 'A world at war, and a raid on Tuesday.';
    d.meta.startYear = 2004;

    d.identity = U.merge(d.identity, {
      setting: 'highFantasy', combat: 'tabTarget', world: 'zoned',
      deathPenalty: 'corpseRun', roleSystem: 'trinity', sessionTargetMin: 120,
      productionValue: 52
    });
    d.factions = U.merge(d.factions, {
      count: 2, relationship: 'hardLocked', crossFactionPlay: false,
      factionContent: 70, creatorDepth: 45
    });
    d.progression = U.merge(d.progression, {
      model: 'levels', levelCap: 60, xpShape: 'exponential', xpSteepness: 62,
      timeToCapHours: 180, verticalRatio: 82, catchUp: 25, altFriction: 72,
      talentPointsPerLevel: 0.85
    });

    mkClass(d, 'Warrior', 'tank', ['taunt', 'threatAoe', 'defensiveCd', 'blockParry', 'strike', 'heavyStrike', 'execute', 'dash', 'stance'], 'Armoured frontline anchor');
    mkClass(d, 'Paladin', 'healer', ['directHeal', 'groupHeal', 'cooldownHeal', 'dispel', 'resurrect', 'buff', 'shield', 'strike'], 'Holy warrior-healer');
    mkClass(d, 'Rogue', 'dps', ['stealth', 'strike', 'combo', 'execute', 'burstWindow', 'stun', 'dash', 'proc'], 'Stealth burst assassin');
    mkClass(d, 'Mage', 'dps', ['ranged', 'channel', 'aoeGround', 'burstWindow', 'blink', 'root', 'portal', 'proc'], 'Ranged nuker with utility');
    mkClass(d, 'Priest', 'healer', ['directHeal', 'flashHeal', 'hot', 'shield', 'groupHeal', 'dispel', 'resurrect', 'fear'], 'Pure restoration caster');
    mkClass(d, 'Hunter', 'dps', ['ranged', 'summonPet', 'dot', 'slow', 'sprint', 'proc', 'debuff'], 'Ranged pet class');

    mkZone(d, 'Emberfall Vale', 1, 20, { size: 60, density: 60, secrets: 35, artBudget: 55, quests: 12, monsters: 7 });
    var z2 = mkZone(d, 'The Ashen Marches', 20, 40, { size: 70, density: 55, secrets: 45, artBudget: 60, quests: 12, families: ['humanoid', 'undead', 'demon'] });
    var z3 = mkZone(d, 'Crown of Thorns', 40, 60, { size: 80, density: 50, secrets: 55, artBudget: 70, quests: 14, families: ['undead', 'dragon', 'demon'] });

    mkCosmetics(d, ['Thornguard Tabard', 'Ashmane Charger', 'Crown Regalia', 'Emberfall Cloak',
                    'Warden Helm', 'Pale Destrier']);

    var t1 = mkGearTier(d, 'Valorous', 96, 'rare', 'str', 11);
    var t2 = mkGearTier(d, 'Thornguard', 128, 'epic', 'str', 12);

    mkDungeon(d, 'Sunken Keep', z2, { kind: 'dungeon', groupSize: 5, lengthMin: 35,
      levelReq: 35, tiers: ['normal', 'heroic'], lockout: 'daily' }, [
      { name: 'Warden Kessil', art: 45,
        phases: [ph('Opening', 100, ['groundAoe', 'positional'], 40), ph('Enraged', 40, ['addWaves', 'tankSwap'], 62)] }
    ], t1);

    mkDungeon(d, 'The Thorn Cathedral', z3, { kind: 'raid', groupSize: 25, lengthMin: 180,
      levelReq: 60, tiers: ['normal', 'heroic'], lockout: 'weekly' }, [
      { name: 'The Hollow Choir', art: 58,
        phases: [ph('Chorus', 100, ['dispelChain', 'spreadStack'], 50), ph('Dissonance', 55, ['interruptRota', 'raidBurst'], 65)] },
      { name: 'Vharil, the Thorn King', art: 82, enrage: 540,
        phases: [ph('Court', 100, ['groundAoe', 'addWaves'], 45), ph('Blood Rite', 65, ['tankSwap', 'coordPuzzle'], 62), ph('Last Crown', 25, ['phaseBurn', 'raidBurst', 'hardEnrage'], 80)] }
    ], t2);

    mkChain(d, 'Legendary: Kingsbane', [
      { label: 'Fragments', gate: 2, req: 'raid', xp: 5000 },
      { label: 'The Forge', gate: 3, req: 'currency', xp: 9000 },
      { label: 'Quenching', gate: 3, req: 'quest', xp: 12000 },
      { label: 'Kingsbane', gate: 4, req: 'raid', xp: 20000,
        items: t2.length ? [{ itemId: t2[t2.length - 1].id, qty: 1, chance: 1 }] : [] }
    ], { accountWide: false, catchUp: 30 });

    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 3, gearPower: 45, seasonWeeks: 16, damping: 35 });
    pvpRewards(d, 'Azuremoor');

    engines(d, [['raidTiers', 80], ['professions', 60], ['auctionHouse', 65], ['reputation', 55], ['battleground', 50], ['collections', 40], ['achievements', 45], ['worldBoss', 40]]);
    d.social = U.merge(d.social, { guildSize: 200, guildPerks: true, lfgDepth: 15, communityTools: 40 });
    d.gearing = U.merge(d.gearing, { resetSeverity: 72, lootMode: 'group' });
    d.monetisation = U.merge(d.monetisation, { model: 'sub', subPrice: 14.99 });
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 10, majorContentWeeks: 30, balancePassEffort: 45 });
    d.infra = U.merge(d.infra, { regions: 3, capacityHeadroom: 35 });
    d.expansions.push(S.newExpansion('The Frozen Reach', {
      levelIncrease: 10, newZones: 3, newDungeons: 3, newRaids: 1, gearTiers: 2,
      featureSystem: 'keystone', price: 39.99 }));
    return d;
  }

  /* ================================================= 2. LIVING WORLD ==== */
  function livingWorld() {
    var d = S.newDesign('Verdant Compact');
    d.meta.studio = 'Open Field Studio';
    d.meta.tagline = 'No ladder. No subscription. Just the world, and everyone in it.';
    d.meta.startYear = 2012;

    d.identity = U.merge(d.identity, {
      setting: 'highFantasy', combat: 'softLock', world: 'seamless',
      deathPenalty: 'none', roleSystem: 'softRoles', sessionTargetMin: 45,
      productionValue: 72
    });
    d.factions = U.merge(d.factions, { count: 3, relationship: 'threeWay', crossFactionPlay: true, factionContent: 15, creatorDepth: 78 });
    d.progression = U.merge(d.progression, {
      model: 'horizontal', levelCap: 80, xpShape: 'linear', xpSteepness: 30,
      timeToCapHours: 70, verticalRatio: 24, catchUp: 85, levelScaling: true,
      mentoring: true, altFriction: 20, accountWide: 85, respecFriction: 10,
      talentPointsPerLevel: 0.85
    });

    mkClass(d, 'Guardian', 'hybrid', ['blockParry', 'shield', 'groupHeal', 'buff', 'strike', 'dodgeRoll', 'nova', 'raidCd'], 'Protective frontliner');
    mkClass(d, 'Ranger', 'dps', ['ranged', 'summonPet', 'dodgeRoll', 'dash', 'dot', 'slow', 'hot'], 'Mobile pet skirmisher');
    mkClass(d, 'Elementalist', 'hybrid', ['stance', 'aoeGround', 'channel', 'blink', 'groupHeal', 'nova', 'dodgeRoll'], 'Attunement-swapping caster');
    mkClass(d, 'Engineer', 'hybrid', ['totem', 'summonTemp', 'knockback', 'dodgeRoll', 'aoeGround', 'buff', 'debuff'], 'Gadget and turret controller');
    mkClass(d, 'Revenant', 'dps', ['strike', 'stance', 'combo', 'dash', 'dodgeRoll', 'raidCd', 'burstWindow'], 'Legend-channelling duellist');

    mkZone(d, 'The Sundered Coast', 1, 30, { size: 88, density: 78, secrets: 82, artBudget: 80, quests: 14, monsters: 8 });
    var z2 = mkZone(d, 'Thornwild Reach', 30, 60, { size: 92, density: 72, secrets: 88, artBudget: 82, quests: 14, monsters: 8, families: ['beast', 'elemental', 'aberration'] });
    var z3 = mkZone(d, 'The Hollow Sky', 60, 80, { size: 85, density: 68, secrets: 90, artBudget: 88, quests: 16, voiced: true, families: ['elemental', 'dragon', 'construct'] });

    mkCosmetics(d, ['Verdant Wings', 'Skyskiff', 'Coastwalker Garb', 'Hollow Crown',
                    'Thornwild Mantle', 'Driftwood Glider', 'Sunspire Halo']);

    var t1 = mkGearTier(d, 'Ascended', 140, 'epic', 'agi', 21);

    mkDungeon(d, 'Fractured Depths', z2, { kind: 'dungeon', groupSize: 5, lengthMin: 30,
      levelReq: 45, tiers: ['story', 'normal'], lockout: 'none', matchmaking: true }, [
      { name: 'The Shatterhorn', art: 85,
        phases: [ph('Charge', 100, ['environmental', 'movementPuzzle'], 45), ph('Collapse', 45, ['platforming', 'spreadStack'], 58)] }
    ], t1);

    mkDungeon(d, 'The Drowned Chorus', z3, { kind: 'raid', groupSize: 10, lengthMin: 120,
      levelReq: 80, tiers: ['normal'], lockout: 'weekly' }, [
      { name: 'Choir of the Deep', art: 90,
        phases: [ph('Rising', 100, ['spreadStack', 'movementPuzzle'], 48), ph('Drowning', 60, ['coordPuzzle', 'environmental'], 62), ph('Silence', 20, ['phaseBurn', 'softEnrage'], 74)] }
    ], t1);

    mkChain(d, 'Legendary Crafting', [
      { label: 'Gift of Exploration', gate: 2, req: 'quest', xp: 6000 },
      { label: 'Gift of Mastery', gate: 3, req: 'craft', xp: 9000 },
      { label: 'Precursor', gate: 3, req: 'currency', xp: 11000 },
      { label: 'Legendary Skin', gate: 2, req: 'collect', xp: 15000,
        items: (function () { var c = firstOfKind(d, 'cosmetic'); return c ? [{ itemId: c.id, qty: 1, chance: 1 }] : []; })() }
    ], { accountWide: true, catchUp: 70, pityTimer: true });

    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 5, gearPower: 0, seasonWeeks: 8, soloQueue: true, damping: 25 });
    pvpRewards(d, 'Verdant');

    engines(d, [['dailies', 30], ['collections', 78], ['housing', 45], ['professions', 62], ['auctionHouse', 60], ['achievements', 70], ['worldBoss', 72], ['seasonalEvents', 65], ['battleground', 55], ['openPvp', 48]]);
    d.social = U.merge(d.social, { guildSize: 500, guildPerks: true, guildProgression: true, guildHalls: true, guildFinder: true, lfgDepth: 45, crossRealm: true, communityTools: 65, mentoring: true });
    d.gearing = U.merge(d.gearing, { resetSeverity: 8, lootMode: 'personal' });
    d.economy = U.merge(d.economy, { currencies: 4, faucetRate: 48, sinkRate: 52 });
    d.monetisation = U.merge(d.monetisation, { model: 'boxExp', boxPrice: 49.99, expansionPrice: 29.99 });
    shop(d, [['cosmetic', 70], ['mount', 55], ['storage', 45], ['housingDecor', 40], ['convenience', 30]]);
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 2, majorContentWeeks: 12, transparency: 68, commsFrequency: 70 });
    d.infra = U.merge(d.infra, { regions: 3, serverTech: 68, capacityHeadroom: 50 });
    d.expansions.push(S.newExpansion('Tides of the Deep', {
      levelIncrease: 0, newZones: 4, newDungeons: 2, newRaids: 1, gearTiers: 0,
      featureSystem: 'roguelike', price: 29.99 }));
    return d;
  }

  /* ======================================================= 3. ARENA ==== */
  function arena() {
    var d = S.newDesign('Rift Legends');
    d.meta.studio = 'Third Lane';
    d.meta.tagline = 'Twenty-five minutes. Five players. One ladder.';
    d.meta.startYear = 2009;

    d.identity = U.merge(d.identity, {
      setting: 'highFantasy', combat: 'moba', world: 'session',
      deathPenalty: 'none', roleSystem: 'flexible', sessionTargetMin: 28,
      productionValue: 66
    });
    d.factions = U.merge(d.factions, { count: 1, relationship: 'none', factionContent: 0, creatorDepth: 20 });
    d.progression = U.merge(d.progression, {
      model: 'rank', levelCap: 30, timeToCapHours: 25, verticalRatio: 8,
      catchUp: 95, altFriction: 5, accountWide: 100, respecFriction: 0,
      talentPointsPerLevel: 0.85, xpShape: 'flat'
    });
    d.combatMath = U.merge(d.combatMath, { gcd: 0.3 });

    mkClass(d, 'Duelist', 'dps', ['strike', 'dash', 'combo', 'execute', 'dodgeRoll', 'burstWindow'], 'Melee carry');
    mkClass(d, 'Marksman', 'dps', ['ranged', 'proc', 'slow', 'dash', 'execute'], 'Ranged scaling carry');
    mkClass(d, 'Bulwark', 'tank', ['taunt', 'strike', 'knockback', 'defensiveCd', 'dash', 'stun'], 'Engage frontline');
    mkClass(d, 'Oracle', 'healer', ['shield', 'flashHeal', 'root', 'buff', 'blink'], 'Enchanter support');
    mkClass(d, 'Warlock', 'dps', ['bolt', 'aoeGround', 'root', 'silence', 'burstWindow', 'blink'], 'Zone-control mage');
    mkClass(d, 'Shade', 'dps', ['strike', 'stealth', 'blink', 'execute', 'burstWindow', 'silence'], 'Assassin');

    mkCosmetics(d, ['Championship Skin', 'Rift Walker', 'Prestige Aura', 'Victory Banner',
                    'Ranked Ward', 'Golden Duelist', 'Shadow Emote', 'Season Crest']);

    d.pvp = U.merge(d.pvp, {
      enabled: true, arenaBracket: 5, seasonWeeks: 10, gearPower: 0,
      ccDiminishing: true, damping: 42, mapCount: 5, soloQueue: true,
      objectiveModes: ['deathmatch', 'capture', 'koth', 'elimination']
    });
    d.pvpMaps = [
      PN.pvp.newMap('Summoner Hollow', { mode: 'capture', teamSize: 5, size: 78, chokepoints: 70, lineOfSight: 45, matchMinutes: 25 }),
      PN.pvp.newMap('The Proving Ring', { mode: 'deathmatch', teamSize: 3, size: 22, chokepoints: 25, lineOfSight: 65, matchMinutes: 6 }),
      PN.pvp.newMap('Ashen Crucible', { mode: 'elimination', teamSize: 3, size: 28, chokepoints: 60, lineOfSight: 72, healingDampen: 45, matchMinutes: 5 }),
      PN.pvp.newMap('Storm Terrace', { mode: 'koth', teamSize: 5, size: 44, chokepoints: 80, lineOfSight: 35, verticality: 55, matchMinutes: 12 }),
      PN.pvp.newMap('Gale Run', { mode: 'flag', teamSize: 5, size: 82, chokepoints: 35, verticality: 65, matchMinutes: 14 })
    ];
    pvpRewards(d, 'Rift');

    engines(d, [['arena', 95], ['battleground', 60], ['collections', 80], ['achievements', 50], ['seasonalEvents', 70]]);
    d.social = U.merge(d.social, { guildSize: 50, lfgDepth: 92, crossRealm: true, voiceChat: true, communityTools: 55, guildFinder: true });
    d.gearing = U.merge(d.gearing, { resetSeverity: 0, tradeable: false, socketing: false, setBonuses: false });
    d.economy = U.merge(d.economy, { currencies: 2, tradingEnabled: false, auctionHouse: false, gatheringNodes: 0, vendorRepair: false });
    d.monetisation = U.merge(d.monetisation, { model: 'seasonal' });
    mkPass(d, 10, 40, { price: 9.99, grindHoursPerWeek: 5, fomo: 62, catchUp: 55, carryover: true });
    shop(d, [['cosmetic', 92], ['mount', 40], ['lootbox', 35]]);
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 2, majorContentWeeks: 10, balancePassEffort: 88, ptrUse: 70, hotfixSpeed: 80, transparency: 62, commsFrequency: 72, antiCheatSpend: 65 });
    d.infra = U.merge(d.infra, { regions: 5, serverTech: 78, capacityHeadroom: 55, redundancy: 60 });
    return d;
  }

  /* ============================================ 4. CREATURE COLLECTION == */
  function creature() {
    var d = S.newDesign('Wildhaven');
    d.meta.studio = 'Paper Lantern Games';
    d.meta.tagline = 'A world full of things to find, and friends to find them with.';
    d.meta.startYear = 2028;

    d.identity = U.merge(d.identity, {
      setting: 'creature', combat: 'turnBased', world: 'seamless',
      deathPenalty: 'none', roleSystem: 'flexible', sessionTargetMin: 40,
      productionValue: 74
    });
    d.factions = U.merge(d.factions, { count: 3, relationship: 'soft', crossFactionPlay: true, factionContent: 10, creatorDepth: 72 });
    d.progression = U.merge(d.progression, {
      model: 'collection', levelCap: 50, xpShape: 'banded', xpSteepness: 40,
      timeToCapHours: 90, verticalRatio: 45, catchUp: 70, levelScaling: true,
      altFriction: 12, accountWide: 90, respecFriction: 15,
      talentPointsPerLevel: 0.85
    });

    mkClass(d, 'Ranger', 'hybrid', ['capture', 'summonPet', 'buff', 'debuff', 'hot', 'ranged'], 'Tamer and field medic');
    mkClass(d, 'Breeder', 'hybrid', ['capture', 'summonPet', 'craftSkill', 'buff', 'groupHeal'], 'Roster specialist');
    mkClass(d, 'Duellist', 'dps', ['capture', 'summonTemp', 'strike', 'combo', 'debuff', 'proc'], 'Competitive battler');
    mkClass(d, 'Naturalist', 'healer', ['capture', 'hot', 'dispel', 'groupHeal', 'totem', 'craftSkill'], 'Habitat and healing expert');

    mkZone(d, 'Meadowlight', 1, 15, { size: 70, density: 82, secrets: 78, artBudget: 76, quests: 12, monsters: 9, families: ['critter', 'beast'] });
    var z2 = mkZone(d, 'The Glass Wetlands', 15, 32, { size: 78, density: 76, secrets: 85, artBudget: 80, quests: 12, monsters: 9, families: ['critter', 'beast', 'elemental'] });
    var z3 = mkZone(d, 'Stormcrown Peaks', 32, 50, { size: 82, density: 70, secrets: 92, artBudget: 84, quests: 14, monsters: 9, voiced: true, families: ['elemental', 'dragon', 'beast'] });

    /* Everything is tameable here - that is the whole game. */
    d.monsters.forEach(function (m) { m.tameable = true; });

    mkCosmetics(d, ['Meadowlight Satchel', 'Glasswing Mount', 'Stormcrown Cloak', 'Ribbon Set',
                    'Wildhaven Tent', 'Sunhopper Mount', 'Field Journal Skin', 'Companion Bow']);

    var t1 = mkGearTier(d, 'Naturalist', 110, 'rare', 'int', 31);

    mkDungeon(d, 'The Hollow Warren', z2, { kind: 'dungeon', groupSize: 4, lengthMin: 28,
      levelReq: 25, tiers: ['story', 'normal', 'heroic'], lockout: 'none', scaling: true, matchmaking: true }, [
      { name: 'Old Mossback', art: 70,
        phases: [ph('Basking', 100, ['positional', 'groundAoe'], 35), ph('Roused', 50, ['addWaves', 'softEnrage'], 52)] }
    ], t1);

    mkDungeon(d, 'Stormcrown Summit', z3, { kind: 'raid', groupSize: 8, lengthMin: 90,
      levelReq: 50, tiers: ['normal', 'heroic'], lockout: 'weekly' }, [
      { name: 'The Stormcrown', art: 92,
        phases: [ph('Gathering', 100, ['spreadStack', 'environmental'], 42), ph('Tempest', 60, ['movementPuzzle', 'dispelChain'], 58), ph('Eye', 25, ['phaseBurn', 'coordPuzzle'], 68)] }
    ], t1);

    mkChain(d, 'The Complete Compendium', [
      { label: 'First Hundred', gate: 2, req: 'collect', xp: 4000 },
      { label: 'Rare Habitats', gate: 3, req: 'quest', xp: 7000 },
      { label: 'Shiny Variants', gate: 4, req: 'collect', xp: 11000 },
      { label: 'Compendium Complete', gate: 3, req: 'collect', xp: 18000,
        items: (function () { var m = firstOfKind(d, 'mount'); return m ? [{ itemId: m.id, qty: 1, chance: 1 }] : []; })() }
    ], { accountWide: true, catchUp: 80, pityTimer: true });

    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 3, gearPower: 10, seasonWeeks: 13, damping: 30 });
    pvpRewards(d, 'Wildhaven');

    engines(d, [['creatureSystem', 92], ['collections', 85], ['professions', 58], ['auctionHouse', 55], ['achievements', 72], ['housing', 62], ['seasonalEvents', 74], ['worldBoss', 50], ['arena', 55]]);
    d.social = U.merge(d.social, { guildSize: 120, guildPerks: true, guildProgression: true, guildHalls: true, guildFinder: true, lfgDepth: 55, crossRealm: true, communityTools: 70, mentoring: true });
    d.gearing = U.merge(d.gearing, { resetSeverity: 20, lootMode: 'personal' });
    d.economy = U.merge(d.economy, { currencies: 3, faucetRate: 45, sinkRate: 48, antiRmtSpend: 45 });
    d.monetisation = U.merge(d.monetisation, { model: 'f2pCosmetic' });
    mkPass(d, 13, 50, { price: 8.99, grindHoursPerWeek: 4, fomo: 35, catchUp: 70, carryover: true });
    shop(d, [['cosmetic', 78], ['housingDecor', 60], ['mount', 55], ['storage', 40], ['creatureGacha', 28]]);
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 4, majorContentWeeks: 14, transparency: 72, commsFrequency: 68, moderationSpend: 60 });
    d.infra = U.merge(d.infra, { regions: 4, serverTech: 70, capacityHeadroom: 50 });
    d.expansions.push(S.newExpansion('Songs of the Deep Wood', {
      levelIncrease: 10, newZones: 3, newDungeons: 2, newRaids: 1, gearTiers: 1,
      featureSystem: 'housing', price: 29.99 }));
    return d;
  }

  /* ================================================== 5. GRIND SANDBOX == */
  function grindSandbox() {
    var d = S.newDesign('Ashfall Dominion');
    d.meta.studio = 'Black Harbour';
    d.meta.tagline = 'The most beautiful combat in the genre, wrapped around the hardest grind.';
    d.meta.startYear = 2016;

    d.identity = U.merge(d.identity, {
      setting: 'darkFantasy', combat: 'fullAction', world: 'seamless',
      deathPenalty: 'xpLoss', roleSystem: 'softRoles', sessionTargetMin: 150,
      productionValue: 88
    });
    d.factions = U.merge(d.factions, { count: 1, relationship: 'none', factionContent: 0, creatorDepth: 95 });
    d.progression = U.merge(d.progression, {
      model: 'gearScore', levelCap: 65, xpShape: 'exponential', xpSteepness: 92,
      timeToCapHours: 320, verticalRatio: 96, catchUp: 20, altFriction: 78,
      accountWide: 35, respecFriction: 70, characterSystem: 'talent', talentPointsPerLevel: 0.85,
      alternateAdvancement: true
    });
    d.combatMath = U.merge(d.combatMath, { gcd: 0.2 });
    d.stats.critBonus = 165;

    mkClass(d, 'Blademaster', 'dps', ['strike', 'combo', 'dash', 'dodgeRoll', 'execute', 'burstWindow', 'stance', 'knockback'], 'Combo-chaining duellist');
    mkClass(d, 'Warlord', 'tank', ['blockParry', 'activeMitigation', 'knockback', 'dash', 'heavyStrike', 'threatAoe'], 'Immovable frontline');
    mkClass(d, 'Stormcaller', 'dps', ['bolt', 'channel', 'aoeGround', 'blink', 'nova', 'burstWindow', 'dodgeRoll'], 'Glass cannon caster');
    mkClass(d, 'Veilstalker', 'dps', ['strike', 'stealth', 'blink', 'combo', 'execute', 'silence', 'dodgeRoll'], 'Assassin');
    mkClass(d, 'Hearthward', 'healer', ['hot', 'shield', 'groupHeal', 'dispel', 'dodgeRoll', 'totem'], 'Mobile field healer');

    mkZone(d, 'The Ashen Coast', 1, 30, { size: 95, density: 88, secrets: 62, artBudget: 92, quests: 10, monsters: 8, families: ['humanoid', 'beast'] });
    var z2 = mkZone(d, 'Dominion Heartland', 30, 55, { size: 98, density: 84, secrets: 70, artBudget: 94, quests: 10, monsters: 9, families: ['humanoid', 'undead', 'demon'] });
    var z3 = mkZone(d, 'The Scourgelands', 55, 65, { size: 90, density: 92, secrets: 58, artBudget: 90, quests: 8, monsters: 9, families: ['demon', 'aberration', 'dragon'] });

    mkCosmetics(d, ['Ashfall Warhorse', 'Dominion Regalia', 'Scourge Mask', 'Black Harbour Cloak',
                    'Veilstalker Shroud', 'Ember Steed']);

    var t1 = mkGearTier(d, 'Awakened', 180, 'epic', 'str', 41);
    var t2 = mkGearTier(d, 'Sealed', 212, 'legendary', 'str', 42);

    mkDungeon(d, 'Heartland Crucible', z2, { kind: 'dungeon', groupSize: 5, lengthMin: 45,
      levelReq: 50, tiers: ['normal', 'heroic'], lockout: 'daily', scaling: true }, [
      { name: 'The Iron Tithe', art: 72,
        phases: [ph('Toll', 100, ['dpsCheck', 'positional'], 50), ph('Collection', 40, ['addWaves', 'softEnrage'], 68)] }
    ], t1);

    mkDungeon(d, 'The Sealed Vault', z3, { kind: 'raid', groupSize: 20, lengthMin: 90,
      levelReq: 65, tiers: ['normal', 'heroic', 'mythic'], lockout: 'weekly' }, [
      { name: 'Kzarka, the Sealed', art: 95, enrage: 400,
        phases: [ph('Awakening', 100, ['groundAoe', 'movementPuzzle'], 55), ph('Unsealed', 45, ['platforming', 'raidBurst', 'hardEnrage'], 78)] }
    ], t2);

    mkChain(d, 'Awakened Weapon', [
      { label: 'Base Weapon', gate: 2, req: 'currency', xp: 3000 },
      { label: 'Enhancement I-V', gate: 4, req: 'currency', xp: 8000 },
      { label: 'Enhancement VI-XV', gate: 8, req: 'currency', xp: 16000 },
      { label: 'Awakened', gate: 10, req: 'currency', xp: 40000,
        items: t2.length ? [{ itemId: t2[t2.length - 1].id, qty: 1, chance: 1 }] : [] }
    ], { accountWide: false, catchUp: 10, pityTimer: false });

    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 5, gearPower: 85, seasonWeeks: 20, damping: 62 });
    pvpRewards(d, 'Ashfall');

    engines(d, [['professions', 92], ['auctionHouse', 78], ['openPvp', 88], ['dailies', 78], ['collections', 55], ['housing', 58], ['reputation', 62], ['worldBoss', 70]]);
    d.social = U.merge(d.social, { guildSize: 150, guildPerks: true, guildProgression: true, lfgDepth: 8, communityTools: 30 });
    d.gearing = U.merge(d.gearing, { resetSeverity: 45, lootMode: 'personal', socketing: true, tradeable: true });
    d.economy = U.merge(d.economy, { currencies: 3, faucetRate: 72, sinkRate: 68, gatheringNodes: 88, antiRmtSpend: 35, deathRepairCost: 55 });
    d.monetisation = U.merge(d.monetisation, { model: 'f2pConvenience', boxPrice: 9.99 });
    shop(d, [['cosmetic', 88], ['convenience', 72], ['storage', 68], ['boost', 45], ['lootbox', 40], ['mount', 50]]);
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 2, majorContentWeeks: 16, transparency: 28, commsFrequency: 35, balancePassEffort: 55 });
    d.infra = U.merge(d.infra, { regions: 4, serverTech: 82, capacityHeadroom: 45, redundancy: 50 });
    d.expansions.push(S.newExpansion('The Drowned Throne', {
      levelIncrease: 5, newZones: 2, newDungeons: 2, newRaids: 1, gearTiers: 3,
      featureSystem: 'openPvp', price: 0 }));
    return d;
  }

  /* ================================================= 6. STORY THEMEPARK == */
  function storyPark() {
    var d = S.newDesign('Eclipse Directive');
    d.meta.studio = 'Longform Interactive';
    d.meta.tagline = 'Every class is a story. Every choice is voiced.';
    d.meta.startYear = 2011;

    d.identity = U.merge(d.identity, {
      setting: 'spaceOpera', combat: 'tabTarget', world: 'hub',
      deathPenalty: 'durability', roleSystem: 'flexible', sessionTargetMin: 75,
      productionValue: 82
    });
    d.factions = U.merge(d.factions, { count: 2, relationship: 'hardLocked', crossFactionPlay: false, factionContent: 88, creatorDepth: 62 });
    d.progression = U.merge(d.progression, {
      model: 'hybrid', levelCap: 50, xpShape: 'banded', xpSteepness: 48,
      timeToCapHours: 120, verticalRatio: 62, catchUp: 50, altFriction: 45,
      accountWide: 55, respecFriction: 35, talentPointsPerLevel: 0.85
    });

    mkClass(d, 'Vanguard', 'tank', ['taunt', 'threatAoe', 'defensiveCd', 'blockParry', 'dash', 'strike', 'knockback'], 'Shielded trooper');
    mkClass(d, 'Operative', 'healer', ['hot', 'flashHeal', 'shield', 'dispel', 'stealth', 'resurrect'], 'Field medic infiltrator');
    mkClass(d, 'Gunslinger', 'dps', ['ranged', 'burstWindow', 'proc', 'slow', 'sprint', 'execute'], 'Cover-based ranged damage');
    mkClass(d, 'Sentinel', 'dps', ['strike', 'combo', 'dash', 'execute', 'burstWindow', 'stance', 'raidCd'], 'Dual-blade duellist');
    mkClass(d, 'Inquisitor', 'hybrid', ['bolt', 'channel', 'dot', 'stun', 'groupHeal', 'summonTemp', 'blink'], 'Force-wielding hybrid');

    var z1 = mkZone(d, 'Corvus Station', 1, 18, { size: 45, density: 70, secrets: 25, artBudget: 82, quests: 16, givers: 5, monsters: 5, voiced: true, families: ['humanoid', 'construct'] });
    mkZone(d, 'Kestrel Reach', 18, 35, { size: 55, density: 62, secrets: 32, artBudget: 84, quests: 16, givers: 5, monsters: 6, voiced: true, families: ['humanoid', 'construct', 'aberration'] });
    var z3 = mkZone(d, 'The Eclipse Line', 35, 50, { size: 60, density: 58, secrets: 35, artBudget: 88, quests: 18, givers: 5, monsters: 6, voiced: true, families: ['construct', 'aberration'] });

    mkCosmetics(d, ['Directive Dress Uniform', 'Corvus Speeder', 'Eclipse Armour Dye',
                    'Kestrel Flight Jacket', 'Companion Outfit', 'Station Quarters']);

    var t1 = mkGearTier(d, 'Directive', 88, 'rare', 'agi', 51);
    var t2 = mkGearTier(d, 'Eclipse', 116, 'epic', 'agi', 52);

    mkDungeon(d, 'Corvus Blacksite', z1, { kind: 'dungeon', groupSize: 4, lengthMin: 40,
      levelReq: 20, tiers: ['story', 'normal', 'heroic'], lockout: 'daily', matchmaking: true }, [
      { name: 'Overseer Dane', art: 72,
        phases: [ph('Command', 100, ['groundAoe', 'addWaves'], 42), ph('Override', 50, ['interruptRota', 'tankSwap'], 58)] }
    ], t1);

    mkDungeon(d, 'The Eclipse Engine', z3, { kind: 'raid', groupSize: 16, lengthMin: 150,
      levelReq: 50, tiers: ['normal', 'heroic'], lockout: 'weekly' }, [
      { name: 'The Eclipse Engine', art: 90,
        phases: [ph('Ignition', 100, ['spreadStack', 'healCheck'], 48), ph('Cascade', 62, ['coordPuzzle', 'dispelChain'], 62), ph('Collapse', 22, ['phaseBurn', 'raidBurst', 'softEnrage'], 76)] }
    ], t2);

    mkChain(d, 'Companion Loyalty', [
      { label: 'Recruitment', gate: 1, req: 'quest', xp: 3000 },
      { label: 'Personal Quest', gate: 2, req: 'quest', xp: 6000 },
      { label: 'Loyalty Unlocked', gate: 2, req: 'quest', xp: 9000 },
      { label: 'Companion Customisation', gate: 2, req: 'collect', xp: 12000,
        items: (function () { var c = firstOfKind(d, 'cosmetic'); return c ? [{ itemId: c.id, qty: 1, chance: 1 }] : []; })() }
    ], { accountWide: false, catchUp: 55 });

    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 4, gearPower: 55, seasonWeeks: 12, damping: 38 });
    pvpRewards(d, 'Eclipse');

    engines(d, [['raidTiers', 62], ['collections', 58], ['professions', 48], ['auctionHouse', 52], ['achievements', 55], ['battleground', 45], ['reputation', 50], ['seasonalEvents', 50]]);
    d.social = U.merge(d.social, { guildSize: 150, guildPerks: true, lfgDepth: 62, communityTools: 48 });
    d.gearing = U.merge(d.gearing, { resetSeverity: 58, lootMode: 'needGreed' });
    d.monetisation = U.merge(d.monetisation, { model: 'hybrid', subPrice: 12.99, boxPrice: 39.99 });
    shop(d, [['cosmetic', 65], ['lootbox', 55], ['convenience', 48], ['storage', 42], ['boost', 38], ['mount', 45]]);
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 8, majorContentWeeks: 24, transparency: 45, commsFrequency: 50 });
    d.infra = U.merge(d.infra, { regions: 3, serverTech: 58, capacityHeadroom: 40 });
    d.expansions.push(S.newExpansion('Shadow of the Directive', {
      levelIncrease: 10, newZones: 2, newDungeons: 2, newRaids: 1, gearTiers: 2,
      newClasses: 1, price: 39.99 }));
    return d;
  }

  /* ============================================ 7. THE PASSIVE TREE ==

     The one where the character sheet IS the game. A single enormous
     passive tree everyone starts from a different door of, a currency
     economy instead of gold, seasonal leagues that wipe and restart,
     and loot so rare that finding it is the whole point. Free, and
     funded entirely by people buying wings.                          */
  function exileTree() {
    var d = S.newDesign('Grim Covenant');
    d.meta.studio = 'Ninefold';
    d.meta.tagline = 'One tree, ten thousand nodes, and a season that wipes it all every quarter.';
    d.meta.startYear = 2024;

    d.identity = U.merge(d.identity, {
      setting: 'darkFantasy', combat: 'fullAction', world: 'instanced',
      deathPenalty: 'xpLoss', roleSystem: 'softRoles', sessionTargetMin: 90,
      productionValue: 84
    });
    d.factions = U.merge(d.factions, { count: 1, relationship: 'none', factionContent: 0, creatorDepth: 88 });
    /* The tree is the character system, and it is the entire point. */
    d.progression = U.merge(d.progression, {
      model: 'level', levelCap: 100, xpShape: 'exponential', xpSteepness: 96,
      timeToCapHours: 260, verticalRatio: 74, catchUp: 55, altFriction: 30,
      accountWide: 60, respecFriction: 88, characterSystem: 'talent',
      talentPointsPerLevel: 1.25, alternateAdvancement: true, levelScaling: false
    });
    d.combatMath = U.merge(d.combatMath, { gcd: 0.15 });
    d.stats.critBonus = 210;

    mkClass(d, 'Marauder', 'tank', ['heavyStrike', 'blockParry', 'activeMitigation', 'knockback', 'threatAoe', 'burstWindow'], 'Armour and brute force');
    mkClass(d, 'Ranger', 'dps', ['strike', 'dash', 'dodgeRoll', 'combo', 'execute', 'burstWindow'], 'Evasion and speed');
    mkClass(d, 'Witch', 'dps', ['bolt', 'channel', 'aoeGround', 'nova', 'blink', 'burstWindow'], 'Energy shield and minions');
    mkClass(d, 'Templar', 'healer', ['hot', 'shield', 'groupHeal', 'dispel', 'totem', 'heavyStrike'], 'Faith and lightning');
    mkClass(d, 'Shadow', 'dps', ['strike', 'stealth', 'blink', 'combo', 'silence', 'execute'], 'Crit and chaos');
    mkClass(d, 'Duelist', 'dps', ['strike', 'combo', 'dash', 'execute', 'blockParry', 'stance'], 'Armour and evasion both');

    mkZone(d, 'The Drowned Coast', 1, 35, { size: 72, density: 90, secrets: 55, artBudget: 84, quests: 8, monsters: 9, families: ['undead', 'beast'] });
    var z2 = mkZone(d, 'The Blighted Reach', 35, 70, { size: 78, density: 92, secrets: 62, artBudget: 86, quests: 8, monsters: 9, families: ['demon', 'aberration', 'undead'] });
    var z3 = mkZone(d, 'The Atlas', 70, 100, { size: 96, density: 95, secrets: 88, artBudget: 88, quests: 6, monsters: 10, families: ['aberration', 'demon', 'dragon'] });

    mkCosmetics(d, ['Seraph Wings', 'Doomguard Armour', 'Oblivion Portal', 'Celestial Weapon Effect',
                    'Harbinger Cloak', 'Void Hound']);

    var t1 = mkGearTier(d, 'Rare', 176, 'rare', 'agi', 60);
    var t2 = mkGearTier(d, 'Mirrored', 214, 'legendary', 'agi', 62);

    /* Endgame is a procedural map you open yourself, not a raid night. */
    mkDungeon(d, 'Blighted Map', z3, { kind: 'dungeon', groupSize: 1, lengthMin: 12,
      levelReq: 70, tiers: ['normal', 'heroic', 'mythic'], lockout: 'none', scaling: true }, [
      { name: 'The Blight Heart', art: 68,
        phases: [ph('Infestation', 100, ['addWaves', 'groundAoe'], 58), ph('Bloom', 40, ['raidBurst', 'softEnrage'], 74)] }
    ], t1);

    mkDungeon(d, 'The Pinnacle Trial', z3, { kind: 'raid', groupSize: 6, lengthMin: 35,
      levelReq: 100, tiers: ['mythic'], lockout: 'none' }, [
      { name: 'The Exarch', art: 92, enrage: 300,
        phases: [ph('Ascent', 100, ['movementPuzzle', 'dpsCheck'], 70), ph('Judgement', 35, ['platforming', 'hardEnrage', 'raidBurst'], 88)] }
    ], t2);

    mkChain(d, 'The Mirrored Item', [
      { label: 'A base worth keeping', gate: 2, req: 'drop', xp: 4000 },
      { label: 'Affixes that matter', gate: 5, req: 'currency', xp: 12000 },
      { label: 'A perfect roll', gate: 9, req: 'currency', xp: 30000 },
      { label: 'Mirrored', gate: 12, req: 'currency', xp: 80000,
        items: t2.length ? [{ itemId: t2[t2.length - 1].id, qty: 1, chance: 1 }] : [] }
    ], { accountWide: false, catchUp: 5, pityTimer: false });

    /* Duels are a side show here, but a two-second one is not a
       duel. Damped enough that a fight is a fight. */
    d.pvp = U.merge(d.pvp, { enabled: true, arenaBracket: 3, gearPower: 90, seasonWeeks: 13, damping: 64 });
    pvpRewards(d, 'League');

    /* The economy IS the endgame: currencies are crafting materials and
       trade is how anybody gets anything. */
    engines(d, [['auctionHouse', 95], ['professions', 88], ['collections', 72],
                ['dailies', 40], ['worldBoss', 55], ['openPvp', 30], ['reputation', 35]]);
    d.social = U.merge(d.social, { guildSize: 50, guildPerks: false, guildProgression: false, lfgDepth: 4, communityTools: 45 });
    d.gearing = U.merge(d.gearing, { resetSeverity: 92, lootMode: 'personal', socketing: true,
      tradeable: true, upgradeTrack: false, borrowedPower: false, backpackSlots: 24 });
    d.economy = U.merge(d.economy, { currencies: 6, faucetRate: 58, sinkRate: 62,
      gatheringNodes: 40, antiRmtSpend: 72, deathRepairCost: 0 });
    /* Free, and funded entirely by cosmetics. */
    d.monetisation = U.merge(d.monetisation, { model: 'f2pCosmetic', boxPrice: 0,
      subPrice: 0, expansionPrice: 0 });
    shop(d, [['cosmetic', 95], ['storage', 82], ['mount', 60]]);
    /* A season every quarter, which is the whole live-ops model. */
    d.liveOps = U.merge(d.liveOps, { patchCadenceWeeks: 2, majorContentWeeks: 13,
      transparency: 78, commsFrequency: 72, balancePassEffort: 72, ptrUse: 55 });
    d.infra = U.merge(d.infra, { regions: 4, serverTech: 78, capacityHeadroom: 55, redundancy: 55 });
    d.expansions.push(S.newExpansion('The Sundering', {
      levelIncrease: 0, newZones: 2, newDungeons: 3, newRaids: 1, gearTiers: 2,
      featureSystem: 'professions', price: 0 }));
    return d;
  }

  /* Every one of these is an homage. The fictional name is the point:
     you are not running that studio, you are running the one that
     shipped the game next to it - and the year is the year the genre
     actually did this, because what an era forgives is half of what
     decides whether it works. */
  var PRESETS = [
    { id: 'themepark', name: 'Warspire', label: 'Classic Themepark', era: 2004,
      inspired: 'the one everybody else was compared to for twenty years',
      blurb: 'Two factions, a trinity, corpse runs and a 25-player raid on Tuesday. The genre default, with the genre default problems.',
      strength: 'Enormous progression pull and the strongest guild bonds in the genre.',
      weakness: 'Punishing to alts and casuals, and it eats content faster than any studio can make it.',
      build: themepark },
    { id: 'livingWorld', name: 'Covenant', label: 'Living World', era: 2012,
      inspired: 'the horizontal one with no subscription and no treadmill',
      blurb: 'Horizontal progression, no subscription, no gear treadmill. Everyone is always max level and nobody is behind.',
      strength: 'Evergreen content, superb accessibility, unusually low churn among socialites and explorers.',
      weakness: 'Progressors and raiders hit the ceiling in a month and leave for something with a ladder.',
      build: livingWorld },
    { id: 'arena', name: 'Legends of the Rift', label: 'Competitive Arena', era: 2009,
      inspired: 'the five-on-five lane game that ate the decade',
      blurb: 'Not really an MMO. Twenty-five minute matches, fixed kits, a ranked ladder and a battle pass.',
      strength: 'Almost infinite content from five maps. Retention no themepark can match.',
      weakness: 'Zero exploration, zero world, brutal balance workload, and one bad patch enrages everyone at once.',
      build: arena },
    { id: 'story', name: 'Starfall Republic', label: 'Voiced Story Park', era: 2011,
      inspired: 'the one that voiced every line and then ran out of story',
      blurb: 'Every class is a fully voiced personal story across two warring factions.',
      strength: 'Unmatched narrative pull and first-month retention. Reviews love it.',
      weakness: 'Ruinously expensive per hour of content, and it runs dry the moment the story ends.',
      build: storyPark },
    { id: 'grind', name: 'Obsidian Dominion', label: 'Action Grind Sandbox', era: 2016,
      inspired: 'the gorgeous one with the enhancement bar that can go down',
      blurb: 'Gorgeous full-action combat wrapped around a brutal enhancement treadmill and open-world PvP.',
      strength: 'Highest skill ceiling and spectacle here. Whales and hardcore players stay for years.',
      weakness: 'Savage to casuals, an RMT magnet, and the monetisation walks a very fine line.',
      build: grindSandbox },
    { id: 'exile', name: 'Grim Covenant', label: 'Passive Tree ARPG', era: 2024,
      inspired: 'the free one with the thousand-node tree and the currency economy',
      blurb: 'One enormous passive tree, a currency economy instead of gold, and a season that wipes everything every quarter.',
      strength: 'Bottomless build depth, a trading economy that IS the endgame, and the goodwill of genuinely fair free-to-play.',
      weakness: 'Impenetrable to newcomers, and a balance surface so large that every league breaks something.',
      build: exileTree },
    { id: 'creature', name: 'Pocket Beasts Online', label: 'Creature Collection', era: 2028,
      inspired: 'the one with the pocket monsters, if it had ever been an MMO',
      blurb: 'Catch, breed, train and battle. A cosy open world where the roster is the progression.',
      strength: 'Broadest market reach in the genre, exceptional stickiness, monetises cosmetics naturally.',
      weakness: 'Enormous art bill, and the gacha temptation is always one quarter away.',
      build: creature }
  ];

  PN.presets = {
    PRESETS: PRESETS,
    build: function (id) {
      var d = null;
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) { d = PRESETS[i].build(); break; }
      if (!d) d = PN.schema.newDesign();
      /* A talent-system preset still authors classes - they are the raw
         material the tree gets folded out of. */
      if (PN.talents.isTalentMode(d) && !PN.talents.tree(d).branches.length)
        PN.talents.generateFromClasses(d);
      return d;
    }
  };
})(PN);
