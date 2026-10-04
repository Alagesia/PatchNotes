/* Patch Notes - expansions and the campaign arc.
   One lifecycle is a game. Three lifecycles is the genre. An expansion
   raises the ceiling, resets the treadmill, drags lapsed players back,
   and starts the whole content race again from a higher baseline.       */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax;

  /* Optional headline features an expansion can ship. */
  var FEATURES = [
    { id: 'housing',        name: 'Player Housing' },
    { id: 'keystone',       name: 'Keystone Dungeons' },
    { id: 'roguelike',      name: 'Roguelike Mode' },
    { id: 'creatureSystem', name: 'Creature Collection' },
    { id: 'guildProgression', name: 'Guild Progression' },
    { id: 'openPvp',        name: 'Open-World PvP' },
    { id: 'professions',    name: 'Profession Overhaul' },
    { id: 'seasonalEvents', name: 'Seasonal Events' }
  ];

  /* ------------------------------------------------------------ lapsed */

  /* Former players do not vanish. They sit in a pool, forget slowly, and
     can be pulled back by something big enough.                        */
  function initLapsed(state) {
    if (!state.lapsed) {
      state.lapsed = {};
      tax.ARCHETYPES.forEach(function (a) { state.lapsed[a.id] = 0; });
    }
    return state.lapsed;
  }
  function addLapsed(state, archId, n) {
    initLapsed(state);
    state.lapsed[archId] = (state.lapsed[archId] || 0) + n;
  }
  function decayLapsed(state) {
    initLapsed(state);
    /* Goodwill has a half-life of about a year and a half. */
    tax.ARCHETYPES.forEach(function (a) {
      state.lapsed[a.id] *= 0.991;
    });
  }
  function totalLapsed(state) {
    initLapsed(state);
    return U.sum(tax.ARCHETYPES, function (a) { return state.lapsed[a.id]; });
  }

  /* -------------------------------------------------------- lifecycle -- */

  /* ==================================================== CONTENT MAKERS ==

     These are the shared hands that build real content. A major patch is
     an expansion, so both go through exactly these functions - there is
     no second code path where an expansion means "some sliders moved".  */

  var ZONE_WORD_A = ['Ashen', 'Sunken', 'Gilded', 'Hollow', 'Weeping', 'Ember', 'Frost',
                     'Thorn', 'Storm', 'Pale', 'Bitter', 'Amber', 'Riven', 'Silent'];
  var ZONE_WORD_B = ['Reach', 'Expanse', 'Marches', 'Hollows', 'Wastes', 'Coast', 'Spires',
                     'Basin', 'Steppe', 'Verge', 'Deeps', 'Wilds', 'Fields', 'Drift'];
  var DUNGEON_WORD = ['Keep', 'Vault', 'Crypt', 'Halls', 'Warrens', 'Foundry', 'Catacombs',
                      'Spire', 'Hollow', 'Sepulchre', 'Bastion', 'Mine'];
  var RAID_WORD = ['Sanctum', 'Citadel', 'Throne', 'Cathedral', 'Nexus', 'Crucible',
                   'Observatory', 'Menagerie', 'Vault of Ages'];

  function zoneName(rng) { return 'The ' + rng.pick(ZONE_WORD_A) + ' ' + rng.pick(ZONE_WORD_B); }
  function dungeonName(rng) { return rng.pick(ZONE_WORD_A) + ' ' + rng.pick(DUNGEON_WORD); }
  function raidName(rng) { return 'The ' + rng.pick(RAID_WORD); }

  /* A zone is not a zone until it has monsters, questgivers and quests in
     it, so this always populates what it creates. */
  function addZone(design, opts) {
    opts = opts || {};
    var rng = opts.rng || new U.Rng(1);
    var zone = PN.schema.newZone(opts.name || zoneName(rng), {
      levelLo: opts.levelLo || Math.max(1, design.progression.levelCap - 9),
      levelHi: opts.levelHi || design.progression.levelCap,
      size: 55 + rng.int(0, 25), density: 50 + rng.int(0, 25),
      secrets: 40 + rng.int(0, 30), artBudget: 55 + rng.int(0, 25),
      biome: opts.biome || rng.pick(['temperate', 'arid', 'frozen', 'volcanic', 'swamp', 'coastal'])
    });
    if (opts.expansionId) zone.expansionId = opts.expansionId;
    design.zones.push(zone); U.bumpDesign(design);
    var line = null;
    if (opts.questline !== false) {
      line = PN.schema.newQuestline((opts.label || zone.name) + ' story', { zoneId: zone.id });
      design.questlines.push(line);
    }
    PN.world.applyGenerated(design, PN.world.generateZoneContent(design, zone, {
      seed: rng.int(1, 1e9),
      monsters: opts.monsters === undefined ? 7 : opts.monsters,
      givers: opts.givers === undefined ? 3 : opts.givers,
      quests: opts.quests === undefined ? 11 : opts.quests,
      questlineId: line ? line.id : null,
      voiced: design.identity.productionValue > 65
    }));
    return zone;
  }

  /* One step of the treadmill: a full gear set per primary stat, above
     whatever already exists. Returns the items so a boss can drop them. */
  function addGearTier(design, opts) {
    opts = opts || {};
    var rng = opts.rng || new U.Rng(1);
    var s = PN.stats.statSetOf(design);
    var ilvl = opts.itemLevel || Math.round(PN.combat.targetItemLevel(design) * 1.16 + 8);
    var prefix = opts.prefix || 'Tier';
    var made = [];
    s.primaries.forEach(function (pr, pi) {
      PN.items.generateGearSet(design, {
        itemLevel: ilvl,
        rarity: opts.rarity || 'rare',
        prefix: prefix + ' ' + pr.name.slice(0, 3),
        primary: pr.id,
        seed: rng.int(1, 1e9) + pi
      }).forEach(function (g) { design.items.push(g); made.push(g); });
    });
    U.bumpDesign(design);
    return made;
  }

  /* Bosses with real phases, and loot tables pointing at real items. */
  function addBosses(d, dungeon, n, rng, opts) {
    opts = opts || {};
    var pool = PN.prim.BOSS_MECHANICS.map(function (m) { return m.id; });
    /* Prefer the newest gear, whatever made it. */
    var candidates = (opts.lootItems && opts.lootItems.length) ? opts.lootItems
      : (d.items || []).filter(function (it) { return it.kind === 'gear'; })
          .sort(function (a, b) { return b.itemLevel - a.itemLevel; })
          .slice(0, 40);
    for (var i = 0; i < n; i++) {
      var last = i === n - 1;
      var phases = [];
      var phaseCount = last ? 3 : 2;
      for (var p = 0; p < phaseCount; p++) {
        phases.push({
          name: 'Phase ' + (p + 1), trigger: 'hp',
          at: Math.round(100 - p * (100 / phaseCount)),
          mechanics: rng.shuffle(pool).slice(0, last ? 2 + p : 1 + p),
          damage: 40 + p * 14 + (last ? 10 : 0), addTime: 0
        });
      }
      var boss = PN.schema.newBoss(dungeon.name + (last ? ' - Final' : ' - Guardian ' + (i + 1)), {
        dungeonId: dungeon.id, order: i, phases: phases,
        spectacleArt: last ? 80 : 55, role: last ? 'endBoss' : 'mid'
      });
      var lt = PN.items.newLootTable({
        name: boss.name + ' loot', rolls: last ? 2 : 1,
        /* A boss is generous by comparison, and the last one more so. */
        dropChance: last ? 90 : 65,
        entries: rng.shuffle(candidates).slice(0, 6).map(function (it) {
          return { itemId: it.id, weight: 10, qtyMin: 1, qtyMax: 1 };
        })
      });
      if (lt.entries.length) { d.lootTables.push(lt); boss.lootTableId = lt.id; }
      d.bosses.push(boss);
    }
  }

  function addDungeon(design, opts) {
    opts = opts || {};
    var rng = opts.rng || new U.Rng(1);
    var raid = !!opts.raid;
    var zones = (design.zones || []);
    var host = opts.zoneId ? U.byId(zones, opts.zoneId)
      : (zones.length ? zones[zones.length - 1] : null);
    var dg = PN.schema.newDungeon(opts.name || (raid ? raidName(rng) : dungeonName(rng)), {
      kind: raid ? 'raid' : 'dungeon',
      zoneId: host ? host.id : null,
      groupSize: raid ? PN.combat.raidSize(design) : 5,
      lengthMin: raid ? 150 : 30,
      levelReq: opts.level || design.progression.levelCap,
      tiers: raid ? ['normal', 'heroic', 'mythic'] : ['normal', 'heroic'],
      lockout: raid ? 'weekly' : 'daily'
    });
    if (opts.expansionId) dg.expansionId = opts.expansionId;
    design.dungeons.push(dg); U.bumpDesign(design);
    addBosses(design, dg, raid ? (3 + rng.int(0, 2)) : (2 + rng.int(0, 1)), rng, opts);
    return dg;
  }

  /* A new thing to play: a class under a class system, a talent branch
     under a talent system. Same call either way. */
  function addPlayable(design, opts) {
    opts = opts || {};
    var rng = opts.rng || new U.Rng(1);
    var roles = ['dps', 'tank', 'healer'];
    var role = opts.role || roles[(opts.index || 0) % roles.length];
    var kit = role === 'tank'
        ? ['taunt', 'threatAoe', 'activeMitigation', 'defensiveCd', 'strike', 'heavyStrike']
      : role === 'healer'
        ? ['directHeal', 'hot', 'shield', 'groupHeal', 'dispel', 'resurrect']
        : ['strike', 'heavyStrike', 'execute', 'burstWindow', 'dash', 'proc'];
    var label = opts.name || 'New Path';

    if (PN.talents.isTalentMode(design)) {
      var br = PN.talents.addBranch(design, label);
      br.role = role;
      kit.forEach(function (tid, ki) {
        var tab = PN.abilities.fromTemplate(design, tid, {});
        design.abilities.push(tab);
        PN.talents.addNode(design, br.id, {
          name: tab.name, tier: 1 + Math.floor(ki / 2),
          kind: 'ability', abilityId: tab.id
        });
      });
      PN.talents.addNode(design, br.id, {
        name: label + ' Mastery', tier: 1 + Math.ceil(kit.length / 2),
        kind: 'passive',
        passiveId: role === 'healer' ? 'healing' : role === 'tank' ? 'mitigation' : 'damage',
        magnitude: 10, ranks: 1, cost: 2
      });
      PN.talents.sizeToBudget(design);
      return br;
    }
    var cls = PN.schema.newClass(label, { role: role });
    design.classes.push(cls);
    kit.forEach(function (tid) {
      var ab = PN.abilities.fromTemplate(design, tid, { classId: cls.id });
      design.abilities.push(ab); cls.abilities.push(ab.id);
    });
    if (rng) rng.next();
    return cls;
  }

  /* ---------------------------------------------------------- the era -- */

  /* The calendar moves and the genre's expectations move with it. */
  function advanceEra(state) {
    var year = state.design.meta.startYear + Math.floor(state.week / 52);
    var era = tax.eraForYear(year);
    if (era.year !== state.era.year) {
      var old = state.era;
      state.era = era;
      PN.state.log(state, 'market', 'The genre has moved on: ' + era.name,
        era.note + ' Expectations are now ' + Math.round(era.expectation) +
        '/100 where they were ' + Math.round(old.expectation) + '.',
        { era: era.year });
      return true;
    }
    return false;
  }

  /* What the player should be told about their roadmap. Expansions are
     major releases now, so this reads the release history rather than a
     separate list of expansion objects. */
  function status(state) {
    var released = (state.released || []);
    var majors = released.filter(function (r) { return r.kind === 'major'; });
    var last = majors.length ? majors[majors.length - 1] : null;
    var planned = PN.patches.plansInOrder({ patchPlan: state.patchPlan || [] });
    return {
      majors: majors, planned: planned,
      next: planned.length ? planned[0] : null,
      last: last,
      weeksSinceExpansion: last ? state.week - last.week : null,
      lapsed: totalLapsed(state)
    };
  }

  PN.expansions = {
    FEATURES: FEATURES,
    /* Content makers, shared by the patch pipeline. */
    zoneName: zoneName, dungeonName: dungeonName, raidName: raidName,
    addZone: addZone, addGearTier: addGearTier, addDungeon: addDungeon,
    addBosses: addBosses, addPlayable: addPlayable,
    /* Lapsed players and the calendar. */
    addLapsed: addLapsed, decayLapsed: decayLapsed, totalLapsed: totalLapsed,
    initLapsed: initLapsed, advanceEra: advanceEra, status: status
  };
})(PN);
