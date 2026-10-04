/* Patch Notes - the world.
   Monsters that live in zones, questgivers who stand in them, and
   quests that are individual objects with objectives and real rewards.  */
(function (PN) {
  'use strict';
  var U = PN.util;

  var MONSTER_FAMILIES = [
    { id: 'beast',     name: 'Beast',      tags: ['nature'] },
    { id: 'humanoid',  name: 'Humanoid',   tags: ['faction'] },
    { id: 'undead',    name: 'Undead',     tags: ['grim'] },
    { id: 'elemental', name: 'Elemental',  tags: ['magic'] },
    { id: 'demon',     name: 'Demon',      tags: ['grim', 'magic'] },
    { id: 'dragon',    name: 'Dragonkin',  tags: ['prestige'] },
    { id: 'construct', name: 'Construct',  tags: ['tech'] },
    { id: 'aberration', name: 'Aberration', tags: ['horror'] },
    { id: 'critter',   name: 'Critter',    tags: ['cozy', 'collectable'] }
  ];
  var FAMILY_BY_ID = {};
  MONSTER_FAMILIES.forEach(function (f) { FAMILY_BY_ID[f.id] = f; });

  /* Roles map onto the combat solver's target kinds. */
  var MONSTER_ROLES = [
    { id: 'trash',     name: 'Trash',       target: 'trash',       xp: 1.0,  density: 1.0 },
    { id: 'elite',     name: 'Elite',       target: 'elite',       xp: 3.2,  density: 0.25 },
    { id: 'rare',      name: 'Rare spawn',  target: 'rare',        xp: 6.0,  density: 0.05 },
    { id: 'worldBoss', name: 'World boss',  target: 'dungeonBoss', xp: 20.0, density: 0.01 }
  ];
  var ROLE_BY_ID = {};
  MONSTER_ROLES.forEach(function (r) { ROLE_BY_ID[r.id] = r; });

  /* ========================================================== MONSTERS */

  function newMonster(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('mob'),
      name: opts.name || 'New Monster',
      zoneId: opts.zoneId || null,
      family: opts.family || 'beast',
      role: opts.role || 'trash',
      level: opts.level === undefined ? 10 : opts.level,
      healthMult: opts.healthMult === undefined ? 100 : opts.healthMult,   /* % of baseline */
      damageMult: opts.damageMult === undefined ? 100 : opts.damageMult,
      armourMult: opts.armourMult === undefined ? 100 : opts.armourMult,
      abilities: opts.abilities || [],
      lootTableId: opts.lootTableId || null,
      xpMult: opts.xpMult === undefined ? 100 : opts.xpMult,
      density: opts.density === undefined ? 50 : opts.density,  /* how common in the zone */
      aggressive: opts.aggressive === undefined ? true : opts.aggressive,
      tameable: opts.tameable === undefined ? false : opts.tameable
    };
  }

  function monsterById(design, id) { return U.byId(design.monsters || [], id); }
  function monstersIn(design, zoneId) {
    return (design.monsters || []).filter(function (m) { return m.zoneId === zoneId; });
  }

  /* A monster as the combat solver sees it. */
  function monsterProfile(design, monster) {
    var role = ROLE_BY_ID[monster.role] || ROLE_BY_ID.trash;
    var base = PN.combat.targetProfile(design, { kind: role.target, level: monster.level });
    return {
      kind: role.target, name: monster.name, level: monster.level,
      health: base.health * (monster.healthMult / 100),
      damage: base.damage * (monster.damageMult / 100),
      armourReduction: U.clamp01(base.armourReduction * (monster.armourMult / 100)),
      groupSize: 1, referenceDps: base.referenceDps
    };
  }

  /* Experience awarded for one kill. */
  function monsterXp(design, monster) {
    var role = ROLE_BY_ID[monster.role] || ROLE_BY_ID.trash;
    return Math.round(Math.pow(monster.level, 1.6) * 3.2 * role.xp * (monster.xpMult / 100));
  }

  /* How dangerous it is relative to a geared player of its level. */
  function monsterThreat(design, monster) {
    var prof = monsterProfile(design, monster);
    var ref = prof.referenceDps;
    return U.clamp100(U.saturate(prof.health / Math.max(1, ref), 40) * 55 +
                      U.saturate(prof.damage / Math.max(1, ref * 0.2), 3) * 45);
  }

  /* ======================================================= QUESTGIVERS */

  var GIVER_PERSONALITIES = [
    { id: 'earnest',   name: 'Earnest',   joy: 1.0 },
    { id: 'gruff',     name: 'Gruff',     joy: 1.05 },
    { id: 'comic',     name: 'Comic',     joy: 1.15 },
    { id: 'tragic',    name: 'Tragic',    joy: 1.20 },
    { id: 'sinister',  name: 'Sinister',  joy: 1.12 },
    { id: 'bureaucrat', name: 'Bureaucratic', joy: 0.82 }
  ];

  function newQuestgiver(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('npc'),
      name: opts.name || 'New Questgiver',
      title: opts.title || '',
      zoneId: opts.zoneId || null,
      personality: opts.personality || 'earnest',
      voiced: opts.voiced === undefined ? false : opts.voiced,
      factionId: opts.factionId || null,
      flavour: opts.flavour || ''
    };
  }
  function giverById(design, id) { return U.byId(design.questgivers || [], id); }
  function giversIn(design, zoneId) {
    return (design.questgivers || []).filter(function (g) { return g.zoneId === zoneId; });
  }

  /* ============================================================ QUESTS */

  /* countable - does "x10" mean anything? You slay ten wolves; you do
     not escort ten people. Everything else is a single beat, and its
     length comes from the kind of thing it is.
     hours     - baseline length of one beat, before counts.
     joy       - how much players enjoy doing it, out of 10.            */
  var OBJECTIVE_KINDS = [
    { id: 'kill',    name: 'Slay',          needsTarget: 'monster', countable: true,
      hours: 0.035, joy: 3, cats: ['levelling'],
      desc: 'The genre default. Cheap, endless, and everybody knows it.' },
    { id: 'collect', name: 'Collect',       needsTarget: 'item', countable: true,
      hours: 0.040, joy: 2, cats: ['levelling'],
      desc: 'Ten boar livers from six boars. An in-joke for a reason.' },
    { id: 'tame',    name: 'Tame',          needsTarget: 'monster', countable: true,
      hours: 0.070, joy: 8, cats: ['creature', 'collection'],
      desc: 'Find it, weaken it, keep it. The creature-collection loop.' },
    { id: 'talk',    name: 'Speak to',      needsTarget: 'giver', countable: false,
      hours: 0.20, joy: 6, cats: ['questNarrative'],
      desc: 'Actual writing and actual choices. Expensive per minute, memorable per hour.' },
    { id: 'escort',  name: 'Escort',        needsTarget: 'giver', countable: false,
      hours: 0.30, joy: 1, cats: ['questNarrative'],
      desc: 'Pathfinding NPC at walking pace. Universally hated. Still shipped.' },
    { id: 'explore', name: 'Discover',      needsTarget: null, countable: false,
      hours: 0.28, joy: 7, cats: ['exploration'],
      desc: 'Go there and look at it. Art carries this one entirely.' },
    { id: 'use',     name: 'Use object',    needsTarget: null, countable: false,
      hours: 0.15, joy: 4, cats: ['levelling'],
      desc: 'Pull the lever, light the brazier, read the tome.' },
    { id: 'puzzle',  name: 'Solve a puzzle', needsTarget: null, countable: false,
      hours: 0.35, joy: 6, cats: ['exploration', 'questNarrative'],
      desc: 'Great once. Worthless after the wiki gets it.' },
    { id: 'timed',   name: 'Beat the clock', needsTarget: null, countable: false,
      hours: 0.22, joy: 4, cats: ['achievement'],
      desc: 'A clock and a leaderboard. Cheap replayability.' },
    { id: 'deliver', name: 'Deliver',       needsTarget: 'giver', countable: false,
      hours: 0.10, joy: 1, cats: ['levelling'],
      desc: 'Walk across the zone to talk to a man. Pure padding.' },
    { id: 'clear',   name: 'Clear a dungeon', needsTarget: 'dungeon', countable: false,
      hours: 0.60, joy: 8, cats: ['dungeon'],
      desc: 'Sends players into group content. The best on-ramp there is.' },
    { id: 'event',   name: 'Join a world event', needsTarget: null, countable: false,
      hours: 0.45, joy: 8, cats: ['exploration', 'social'],
      desc: 'Strangers fighting the same thing. Manufactured community, and it works.' }
  ];
  var OBJECTIVE_BY_ID = {};
  OBJECTIVE_KINDS.forEach(function (o) { OBJECTIVE_BY_ID[o.id] = o; });

  /* Ten is the baseline for anything you do more than once. */
  var DEFAULT_COUNT = 10;

  function newQuest(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('qst'),
      name: opts.name || 'New Quest',
      zoneId: opts.zoneId || null,
      giverId: opts.giverId || null,
      questlineId: opts.questlineId || null,
      level: opts.level === undefined ? 10 : opts.level,
      objectives: opts.objectives || [{ kind: 'kill', targetId: null, count: DEFAULT_COUNT }],
      rewardId: opts.rewardId || null,
      requiresQuestId: opts.requiresQuestId || null,
      repeatable: opts.repeatable || 'none',   /* none | daily | weekly */
      voiced: opts.voiced === undefined ? false : opts.voiced,
      flavour: opts.flavour || ''
    };
  }
  function questById(design, id) { return U.byId(design.quests || [], id); }
  function questsIn(design, zoneId) {
    return (design.quests || []).filter(function (q) { return q.zoneId === zoneId; });
  }
  function questsOfLine(design, questlineId) {
    return (design.quests || []).filter(function (q) { return q.questlineId === questlineId; });
  }
  function questsOfGiver(design, giverId) {
    return (design.quests || []).filter(function (q) { return q.giverId === giverId; });
  }

  /* Hours, enjoyment and cost for one authored quest, derived entirely
     from its objectives. There is no quest "type" any more - what a
     quest IS is what it asks you to do.                              */
  function questMetrics(design, quest) {
    var objs = (quest.objectives || []);
    var hours = 0, joySum = 0, cats = {}, objCount = 0;
    var cost = { design: 0, art: 0, eng: 0 };

    objs.forEach(function (o) {
      var def = OBJECTIVE_BY_ID[o.kind];
      if (!def) return;
      var count = def.countable ? Math.max(1, o.count || DEFAULT_COUNT) : 1;
      objCount += count;
      var h = def.hours * count;
      hours += h;
      joySum += def.joy;
      def.cats.forEach(function (c) { cats[c] = (cats[c] || 0) + h / def.cats.length; });

      /* Repeating the same objective is cheap; a new kind of beat is not. */
      cost.design += 0.45 + (def.countable ? count * 0.010 : 0.55);
      cost.art += 0.12 + (def.cats.indexOf('exploration') >= 0 ? 0.55 : 0.08);
      cost.eng += def.id === 'escort' ? 0.65 : def.id === 'puzzle' ? 0.45
                : def.id === 'event' ? 1.10 : def.id === 'timed' ? 0.30 : 0.02;
    });

    var giver = giverById(design, quest.giverId);
    var pers = null;
    GIVER_PERSONALITIES.forEach(function (p) { if (giver && p.id === giver.personality) pers = p; });

    var joy = objs.length ? (joySum / objs.length) * 10 : 0;
    /* A quest that mixes beats reads better than ten of the same thing. */
    var kinds = {};
    objs.forEach(function (o) { kinds[o.kind] = 1; });
    joy *= 1 + Math.min(0.25, (U.keys(kinds).length - 1) * 0.12);
    joy *= (quest.voiced ? 1.28 : 1) * (pers ? pers.joy : 1) * (quest.giverId ? 1.08 : 0.86);

    var reward = PN.items.rewardById(design, quest.rewardId);
    if (reward) joy += U.saturate(PN.items.rewardValue(design, reward), 90) * 22;

    if (quest.voiced) { cost.art *= 2.2; cost.design *= 1.25; }

    return { hours: hours, joy: U.clamp100(joy), cost: cost,
             cats: U.keys(cats), catHours: cats, objCount: objCount,
             kinds: U.keys(kinds).length };
  }

  /* A short human label for a quest, since it no longer has a type. */
  function questLabel(design, quest) {
    var objs = (quest.objectives || []);
    if (!objs.length) return 'no objectives';
    return objs.slice(0, 2).map(function (o) {
      var def = OBJECTIVE_BY_ID[o.kind];
      if (!def) return o.kind;
      return def.name + (def.countable ? ' ×' + (o.count || DEFAULT_COUNT) : '');
    }).join(', ') + (objs.length > 2 ? ' +' + (objs.length - 2) : '');
  }

  /* Is this quest actually completable with what exists in the world? */
  function questIssues(design, quest) {
    var issues = [];
    if (!quest.giverId) issues.push('No questgiver - players cannot pick it up');
    if (!quest.zoneId) issues.push('Not placed in a zone');
    if (!(quest.objectives || []).length) issues.push('No objectives');
    (quest.objectives || []).forEach(function (o) {
      var def = OBJECTIVE_BY_ID[o.kind];
      if (!def || !def.needsTarget) return;
      if (!o.targetId) { issues.push(def.name + ' objective has no target'); return; }
      if (def.needsTarget === 'monster' && !monsterById(design, o.targetId))
        issues.push(def.name + ' points at a monster that no longer exists');
      if (def.needsTarget === 'item' && !PN.items.itemById(design, o.targetId))
        issues.push(def.name + ' points at an item that no longer exists');
      if (def.needsTarget === 'dungeon' && !U.byId(design.dungeons || [], o.targetId))
        issues.push(def.name + ' points at a dungeon that no longer exists');
    });
    if (!quest.rewardId) issues.push('No reward attached');
    return issues;
  }

  /* ========================================================= GENERATORS
     Hand-authoring sixty quests is data entry, not design. Generate a
     believable zone, then edit anything in it.                        */

  var MOB_PREFIX = ['Feral', 'Ashen', 'Hollow', 'Gilded', 'Rotting', 'Storm', 'Thorn',
                    'Grim', 'Pale', 'Blighted', 'Emberclad', 'Frost'];
  var MOB_NOUN = {
    beast: ['Wolf', 'Bear', 'Raptor', 'Boar', 'Stalker'],
    humanoid: ['Raider', 'Cultist', 'Deserter', 'Marauder', 'Warden'],
    undead: ['Ghoul', 'Revenant', 'Wight', 'Shade', 'Skeleton'],
    elemental: ['Ember', 'Tide', 'Gale', 'Shard', 'Cinder'],
    demon: ['Imp', 'Fiend', 'Tormentor', 'Hound', 'Warlock'],
    dragon: ['Drake', 'Wyrmling', 'Serpent', 'Wyvern'],
    construct: ['Sentinel', 'Automaton', 'Golem', 'Engine'],
    aberration: ['Horror', 'Gazer', 'Devourer', 'Thing'],
    critter: ['Hopper', 'Sprite', 'Puffling', 'Nibbler']
  };
  var GIVER_FIRST = ['Aldric', 'Bryn', 'Corin', 'Dela', 'Ewan', 'Fira', 'Gorm', 'Hala',
                     'Ivar', 'Jora', 'Kell', 'Lys', 'Marek', 'Nessa', 'Oren', 'Pia'];
  var GIVER_TITLE = ['the Quartermaster', 'the Scout', 'the Archivist', 'the Smith',
                     'the Watcher', 'the Herbalist', 'the Captain', 'the Wanderer'];
  var QUEST_VERB = ['Culling', 'Gathering', 'Vigil', 'Errand', 'Hunt', 'Reckoning',
                    'Salvage', 'Pilgrimage', 'Warning', 'Bargain'];

  /* Fill a zone with monsters, questgivers, quests and a loot table. */
  function generateZoneContent(design, zone, opts) {
    opts = opts || {};
    var rng = new U.Rng(opts.seed || Math.floor(Math.random() * 1e9));
    var made = { monsters: [], givers: [], quests: [], lootTables: [], rewards: [], items: [] };
    var lo = zone.levelLo, hi = Math.max(zone.levelLo, zone.levelHi);
    var families = opts.families || ['beast', 'humanoid', 'undead'];
    var mobCount = opts.monsters === undefined ? 6 : opts.monsters;
    var giverCount = opts.givers === undefined ? 3 : opts.givers;
    var questCount = opts.quests === undefined ? 10 : opts.quests;
    var gold = PN.items.itemById(design, 'cur_gold');

    /* --- a junk drop item so collect quests have something to collect */
    var junk = PN.items.newItem({
      name: zone.name.split(' ')[0] + ' Trophy', kind: 'questItem',
      rarity: 'common', itemLevel: hi,
      vendorValue: Math.max(1, Math.round(hi * 0.4))
    });
    made.items.push(junk);

    /* Reagents are tiered by the zone that drops them, so a level-60
       reagent is worth more than a level-10 one to both players and
       recipes. Tier is what item level means on a non-gear item. */
    var mat = PN.items.newItem({
      name: zone.name.split(' ')[0] + ' Reagent', kind: 'material',
      rarity: 'common', itemLevel: hi,
      vendorValue: Math.max(1, Math.round(hi * 0.6))
    });
    made.items.push(mat);

    /* --- gear for the level band this zone covers --------------------
       Without this, levelling players find nothing to wear and only
       the endgame has a gearing curve at all.                       */
    var zoneGear = [];
    if (opts.gear !== false) {
      var s = PN.stats.statSetOf(design);
      var allSlots = PN.stats.GEAR_SLOTS.map(function (sl) { return sl.id; });
      s.primaries.forEach(function (pr, pi) {
        var slots = rng.shuffle(allSlots).slice(0, opts.gearSlots || 6);
        PN.items.generateGearSet(design, {
          itemLevel: Math.max(1, Math.round(hi * 1.6)),
          rarity: i2Rarity(rng),
          prefix: zone.name.split(' ')[0] + ' ' + pr.name.slice(0, 3),
          primary: pr.id,
          slots: slots,
          seed: (opts.seed || 1) + 4241 + pi
        }).forEach(function (g) { made.items.push(g); zoneGear.push(g); });
      });
    }
    function i2Rarity(r) { return r.next() < 0.65 ? 'uncommon' : 'rare'; }

    /* --- monsters --------------------------------------------------- */
    for (var i = 0; i < mobCount; i++) {
      var fam = rng.pick(families);
      var role = i === mobCount - 1 ? 'rare' : i >= mobCount - 3 ? 'elite' : 'trash';
      var lvl = Math.round(U.lerp(lo, hi, mobCount > 1 ? i / (mobCount - 1) : 0.5));
      var m = newMonster({
        name: rng.pick(MOB_PREFIX) + ' ' + rng.pick(MOB_NOUN[fam] || ['Thing']),
        zoneId: zone.id, family: fam, role: role, level: Math.max(1, lvl),
        density: role === 'trash' ? rng.int(55, 90) : role === 'elite' ? rng.int(20, 40) : rng.int(3, 10),
        tameable: fam === 'beast' || fam === 'critter'
      });
      /* Each monster drops something - mostly junk, occasionally gear. */
      var entries = [
        { itemId: junk.id, weight: 45, qtyMin: 1, qtyMax: 1 },
        { itemId: mat.id, weight: 30, qtyMin: 1, qtyMax: 2 }
      ];
      var gearChance = role === 'trash' ? 2 : role === 'elite' ? 6 : 14;
      rng.shuffle(zoneGear).slice(0, 4).forEach(function (g) {
        entries.push({ itemId: g.id, weight: gearChance, qtyMin: 1, qtyMax: 1 });
      });
      var lt = PN.items.newLootTable({
        name: m.name + ' drops', rolls: 1,
        /* A trash mob mostly drops pocket change, not gear. */
        dropChance: 22,
        badLuckProtection: 20,
        guaranteed: gold ? [{ itemId: gold.id, qtyMin: Math.max(1, lvl), qtyMax: Math.max(2, lvl * 3) }] : [],
        entries: entries
      });
      made.lootTables.push(lt);
      m.lootTableId = lt.id;
      made.monsters.push(m);
    }

    /* --- questgivers ------------------------------------------------- */
    for (var g = 0; g < giverCount; g++) {
      made.givers.push(newQuestgiver({
        name: rng.pick(GIVER_FIRST), title: rng.pick(GIVER_TITLE),
        zoneId: zone.id,
        personality: rng.pick(GIVER_PERSONALITIES).id,
        voiced: !!opts.voiced
      }));
    }

    /* --- quests ------------------------------------------------------- */
    var questlineId = opts.questlineId || null;
    for (var q = 0; q < questCount; q++) {
      var giver = rng.pick(made.givers);
      var qlvl = Math.round(U.lerp(lo, hi, questCount > 1 ? q / (questCount - 1) : 0.5));
      /* A believable zone is mostly kill/collect with the occasional beat
         that breaks the rhythm. Shape is a generator concept only - the
         quest itself is defined purely by the objectives it ends up with. */
      var shape = q % 5 === 0 ? 'chain' : q % 4 === 0 ? 'dialogue'
                : q % 3 === 0 ? 'collect' : q % 7 === 0 ? 'exploration' : 'kill';
      var objectives;
      if (shape === 'collect') {
        objectives = [{ kind: 'collect', targetId: junk.id, count: DEFAULT_COUNT }];
      } else if (shape === 'dialogue') {
        objectives = [{ kind: 'talk', targetId: rng.pick(made.givers).id }];
      } else if (shape === 'exploration') {
        objectives = [{ kind: 'explore', targetId: null }];
      } else {
        objectives = [{ kind: 'kill', targetId: rng.pick(made.monsters).id, count: DEFAULT_COUNT }];
      }
      /* Chain finales ask for two things, which is what makes them read
         as a payoff rather than another errand. */
      if (shape === 'chain') {
        objectives.push({ kind: 'collect', targetId: junk.id, count: DEFAULT_COUNT });
      }

      /* Every quest gets a real reward bundle, and roughly every third
         one hands over a piece of gear - that is the levelling curve. */
      var rwItems = shape === 'chain' ? [{ itemId: mat.id, qty: 3, chance: 1 }] : [];
      if (zoneGear.length && (q % 3 === 0 || shape === 'chain')) {
        rwItems.push({ itemId: rng.pick(zoneGear).id, qty: 1, chance: 1 });
      }
      var rw = PN.items.newReward({
        name: 'Reward: ' + zone.name + ' ' + (q + 1),
        xp: Math.round(Math.pow(qlvl, 1.75) * 12),
        currencies: gold ? (function () { var o = {}; o[gold.id] = Math.round(qlvl * 6 + 20); return o; })() : {},
        items: rwItems
      });
      made.rewards.push(rw);

      made.quests.push(newQuest({
        name: 'The ' + rng.pick(QUEST_VERB), zoneId: zone.id,
        giverId: giver.id, questlineId: questlineId, level: Math.max(1, qlvl),
        objectives: objectives, rewardId: rw.id, voiced: !!opts.voiced
      }));
    }

    return made;
  }

  /* Commit a generated bundle into the design. */
  function applyGenerated(design, made) {
    (made.items || []).forEach(function (x) { design.items.push(x); });
    (made.lootTables || []).forEach(function (x) { design.lootTables.push(x); });
    (made.rewards || []).forEach(function (x) { design.rewards.push(x); });
    (made.monsters || []).forEach(function (x) { design.monsters.push(x); });
    (made.givers || []).forEach(function (x) { design.questgivers.push(x); });
    (made.quests || []).forEach(function (x) { design.quests.push(x); });
    return made;
  }

  /* Removing something should not leave dangling pointers behind. */
  function removeZone(design, zoneId) {
    U.removeById(design.zones, zoneId);
    (design.monsters || []).filter(function (m) { return m.zoneId === zoneId; })
      .forEach(function (m) { U.removeById(design.monsters, m.id); });
    (design.questgivers || []).filter(function (g) { return g.zoneId === zoneId; })
      .forEach(function (g) { U.removeById(design.questgivers, g.id); });
    (design.quests || []).filter(function (q) { return q.zoneId === zoneId; })
      .forEach(function (q) { U.removeById(design.quests, q.id); });
    (design.dungeons || []).forEach(function (d) { if (d.zoneId === zoneId) d.zoneId = null; });
    (design.questlines || []).forEach(function (l) { if (l.zoneId === zoneId) l.zoneId = null; });
  }

  PN.world = {
    MONSTER_FAMILIES: MONSTER_FAMILIES, FAMILY_BY_ID: FAMILY_BY_ID,
    MONSTER_ROLES: MONSTER_ROLES, ROLE_BY_ID: ROLE_BY_ID,
    GIVER_PERSONALITIES: GIVER_PERSONALITIES,
    OBJECTIVE_KINDS: OBJECTIVE_KINDS, OBJECTIVE_BY_ID: OBJECTIVE_BY_ID,
    newMonster: newMonster, monsterById: monsterById, monstersIn: monstersIn,
    monsterProfile: monsterProfile, monsterXp: monsterXp, monsterThreat: monsterThreat,
    newQuestgiver: newQuestgiver, giverById: giverById, giversIn: giversIn,
    newQuest: newQuest, questById: questById, questsIn: questsIn,
    questsOfLine: questsOfLine, questsOfGiver: questsOfGiver,
    questMetrics: questMetrics, questLabel: questLabel, questIssues: questIssues,
    DEFAULT_OBJECTIVE_COUNT: DEFAULT_COUNT,
    generateZoneContent: generateZoneContent, applyGenerated: applyGenerated,
    removeZone: removeZone
  };
})(PN);
