/* Patch Notes - design schema.
   The serialisable object that IS the player's MMO. Saves are just this
   plus simulation state, so designs are shareable as plain JSON.          */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* ------------------------------------------------------------ factories */

  function newClass(name, opts) {
    opts = opts || {};
    return {
      id: U.id('cls'), name: name || 'New Class',
      role: opts.role || 'dps',              /* tank | healer | dps | hybrid   */
      fantasy: opts.fantasy || '',
      armour: opts.armour || 'medium',
      resource: opts.resource || 'mana',
      primaryStat: opts.primaryStat || null,  /* null means derive it from the kit */
      abilities: opts.abilities || [],        /* ability ids                   */
      specs: opts.specs || [{ id: U.id('spc'), name: 'Base', role: opts.role || 'dps', abilities: [] }],
      tuning: opts.tuning === undefined ? 0 : opts.tuning,
      enabled: true
    };
  }

  function newSpec(name, role) {
    return { id: U.id('spc'), name: name || 'New Spec', role: role || 'dps', abilities: [] };
  }

  function newZone(name, opts) {
    opts = opts || {};
    return {
      id: U.id('zon'), name: name || 'New Zone',
      levelLo: opts.levelLo || 1, levelHi: opts.levelHi || 10,
      size: opts.size === undefined ? 50 : opts.size,
      density: opts.density === undefined ? 50 : opts.density,
      artBudget: opts.artBudget === undefined ? 50 : opts.artBudget,
      secrets: opts.secrets === undefined ? 30 : opts.secrets,
      factionId: opts.factionId || null,
      expansionId: opts.expansionId || null,
      biome: opts.biome || 'temperate'
    };
  }

  /* Questlines are now containers: the quests themselves are objects. */
  function newQuestline(name, opts) {
    opts = opts || {};
    return {
      id: U.id('qln'), name: name || 'New Questline',
      zoneId: opts.zoneId || null,
      voiced: opts.voiced === undefined ? false : opts.voiced,
      branching: opts.branching === undefined ? 0 : opts.branching,
      rewardChainId: opts.rewardChainId || null,
      capstoneRewardId: opts.capstoneRewardId || null
    };
  }

  /* Reward chains are staged payoffs. Each stage hands over a real
     reward bundle.                                                      */
  function newRewardChain(name, opts) {
    opts = opts || {};
    return {
      id: U.id('rwc'), name: name || 'New Reward Chain',
      steps: opts.steps || [
        { label: 'Stage 1', rewardId: null, gateWeeks: 0, requirement: 'quest' },
        { label: 'Stage 2', rewardId: null, gateWeeks: 1, requirement: 'dungeon' },
        { label: 'Capstone', rewardId: null, gateWeeks: 2, requirement: 'raid' }
      ],
      pityTimer: opts.pityTimer === undefined ? true : opts.pityTimer,
      catchUp: opts.catchUp === undefined ? 50 : opts.catchUp,
      accountWide: opts.accountWide === undefined ? true : opts.accountWide,
      expires: opts.expires === undefined ? false : opts.expires
    };
  }
  var CHAIN_REQUIREMENTS = [
    { id: 'quest',   name: 'Complete quests' },
    { id: 'dungeon', name: 'Clear dungeons' },
    { id: 'raid',    name: 'Clear raid bosses' },
    { id: 'pvp',     name: 'Win ranked matches' },
    { id: 'craft',   name: 'Craft or gather' },
    { id: 'currency', name: 'Spend currency' },
    { id: 'collect', name: 'Collect a set' }
  ];

  function newBoss(name, opts) {
    opts = opts || {};
    return {
      id: U.id('bos'), name: name || 'New Boss',
      dungeonId: opts.dungeonId || null,
      role: opts.role || 'mid',
      order: opts.order === undefined ? 0 : opts.order,
      phases: opts.phases || [
        { name: 'Phase 1', trigger: 'hp', at: 100, mechanics: ['groundAoe'], damage: 45, addTime: 0 },
        { name: 'Phase 2', trigger: 'hp', at: 50,  mechanics: ['addWaves'],  damage: 60, addTime: 0 }
      ],
      enrage: opts.enrage === undefined ? 480 : opts.enrage,
      spectacleArt: opts.spectacleArt === undefined ? 50 : opts.spectacleArt,
      tuning: opts.tuning === undefined ? 0 : opts.tuning,
      lootTableId: opts.lootTableId || null,
      firstKillRewardId: opts.firstKillRewardId || null,
      healthMult: opts.healthMult === undefined ? 100 : opts.healthMult
    };
  }
  function newPhase(name) {
    return { name: name || 'New Phase', trigger: 'hp', at: 50, mechanics: [], damage: 50, addTime: 0 };
  }

  function newDungeon(name, opts) {
    opts = opts || {};
    return {
      id: U.id('dng'), name: name || 'New Dungeon',
      kind: opts.kind || 'dungeon',           /* dungeon | raid               */
      zoneId: opts.zoneId || null,
      expansionId: opts.expansionId || null,
      groupSize: opts.groupSize || 5,
      lengthMin: opts.lengthMin === undefined ? 30 : opts.lengthMin,
      levelReq: opts.levelReq === undefined ? 1 : opts.levelReq,
      tiers: opts.tiers || ['normal', 'heroic'],
      lockout: opts.lockout || 'none',
      scaling: opts.scaling === undefined ? false : opts.scaling,
      affixes: opts.affixes === undefined ? false : opts.affixes,
      matchmaking: opts.matchmaking === undefined ? true : opts.matchmaking,
      trashLootTableId: opts.trashLootTableId || null,
      completionRewardId: opts.completionRewardId || null
    };
  }
  var DIFFICULTY_TIERS = [
    { id: 'story',   name: 'Story',   mult: 0.45, prestige: 0.1, lootMult: 0.55 },
    { id: 'normal',  name: 'Normal',  mult: 0.80, prestige: 0.3, lootMult: 0.85 },
    { id: 'heroic',  name: 'Heroic',  mult: 1.15, prestige: 0.6, lootMult: 1.15 },
    { id: 'mythic',  name: 'Mythic',  mult: 1.55, prestige: 1.0, lootMult: 1.55 },
    { id: 'ultimate', name: 'Ultimate', mult: 2.05, prestige: 1.5, lootMult: 2.10 }
  ];

  function newShopEntry(catId) {
    var cat = PN.prim.SHOP_BY_ID[catId];
    return { catId: catId, prominence: 40, price: cat ? cat.price : 10, enabled: true };
  }

  function newEngine(engineId, investment) {
    return { id: engineId, enabled: true, investment: investment === undefined ? 60 : investment };
  }

  /* An expansion is a planned content drop that raises the ceiling. */
  function newExpansion(name, opts) {
    opts = opts || {};
    return {
      id: U.id('exp'), name: name || 'New Expansion',
      levelIncrease: opts.levelIncrease === undefined ? 10 : opts.levelIncrease,
      newZones: opts.newZones === undefined ? 3 : opts.newZones,
      newDungeons: opts.newDungeons === undefined ? 3 : opts.newDungeons,
      newRaids: opts.newRaids === undefined ? 1 : opts.newRaids,
      newClasses: opts.newClasses === undefined ? 0 : opts.newClasses,
      gearTiers: opts.gearTiers === undefined ? 2 : opts.gearTiers,
      featureSystem: opts.featureSystem || null,   /* an engine id to add    */
      price: opts.price === undefined ? 39.99 : opts.price,
      announced: false, released: false, releaseWeek: null,
      squish: opts.squish === undefined ? false : opts.squish,
      marketingSpend: opts.marketingSpend === undefined ? 0 : opts.marketingSpend
    };
  }

  /* Battle pass tiers hand out real reward bundles. */
  function newPassTier(level, opts) {
    opts = opts || {};
    return { level: level, freeRewardId: opts.freeRewardId || null,
             premiumRewardId: opts.premiumRewardId || null };
  }

  /* ------------------------------------------------------- default design */

  function newDesign(name) {
    return {
      meta: {
        name: name || 'Untitled Online',
        studio: 'New Studio',
        tagline: '',
        startYear: 2004,
        seed: Math.floor(Math.random() * 1e9)
      },

      identity: {
        setting: 'highFantasy',
        combat: 'tabTarget',
        world: 'zoned',
        camera: 'third',
        deathPenalty: 'corpseRun',
        roleSystem: 'trinity',
        sessionTargetMin: 90,
        productionValue: 50
      },

      factions: {
        count: 2,
        relationship: 'hardLocked',
        crossFactionPlay: false,
        factionContent: 60,
        creatorDepth: 50
      },

      stats: PN.stats.defaultStatSet(),

      /* Time-to-kill is NOT here. It is computed by the combat solver
         from the abilities and gear the player actually authored.       */
      combatMath: {
        gcd: 1.5,
        resourceModel: 'mana',
        diminishingReturns: true,
        verticalStatGrowth: 60
      },

      /* Authored content. Everything points at everything else by id. */
      abilities: [],
      items: PN.items.defaultCatalogue(),
      lootTables: [],
      rewards: [],
      classes: [],
      talents: { branches: [], nodes: [] },   /* only live when characterSystem === 'talent' */
      /* Optional second character axis. Empty is not a broken race list,
         it is a game without races - which is most of them. */
      races: [],
      recipes: [],
      zones: [],
      monsters: [],
      questgivers: [],
      quests: [],
      questlines: [],
      rewardChains: [],
      dungeons: [],
      bosses: [],
      expansions: [],
      /* The live calendar: holidays, anniversaries, world events. */
      events: [],
      pvpMaps: PN.pvp.defaultMaps(),

      progression: {
        model: 'levels',
        levelCap: 60,
        xpShape: 'exponential',
        xpSteepness: 55,
        timeToCapHours: 140,
        verticalRatio: 75,
        catchUp: 35,
        levelScaling: false,
        mentoring: false,
        altFriction: 65,
        prestige: false,
        accountWide: 25,
        respecFriction: 55,
        characterSystem: 'class',   /* class | talent - never both       */
        talentPointsPerLevel: 0.85,
        alternateAdvancement: false
      },

      gearing: {
        resetSeverity: 65,
        lootMode: 'group',
        /* The backpack every character is born with, before any bag
           they earn. Zero is the honest default: carrying space is
           what the bags you author are FOR, and a game that ships no
           bags is a game whose players cannot pick anything up. */
        backpackSlots: 0,
        tradeable: true,
        upgradeTrack: false,
        borrowedPower: false,
        socketing: true,
        setBonuses: true,
        legendaryChains: false
      },

      economy: {
        currencies: 2,
        faucetRate: 50,
        sinkRate: 45,
        tradingEnabled: true,
        auctionHouse: true,
        auctionTax: 5,
        gatheringNodes: 50,
        antiRmtSpend: 30,
        vendorRepair: true,
        deathRepairCost: 25
      },

      /* Ranked PvP with the same depth the raid designer has. */
      pvp: {
        enabled: true,
        arenaBracket: 3,              /* players per team                   */
        seasonWeeks: 12,
        ratingFloor: 1500,
        gearPower: 25,                /* how much gear decides a match      */
        ccDiminishing: true,
        damping: 30,                  /* % player-vs-player damage reduction */
        mapCount: 4,
        objectiveModes: ['deathmatch', 'capture'],
        soloQueue: true,
        titleRewards: true,
        /* What a whole season is worth, once: a bundle, because it is
           a promise you make in advance and keep on a date. */
        seasonRewardId: null,
        /* And what one match pays: a loot table, because it happens
           hundreds of times and what makes that fair is a CHANCE
           rather than a guarantee. A bundle here paid the same thing
           out every single game, which is why the arena could out-earn
           everything else in the design put together. */
        matchLootId: null
      },

      social: {
        guildSize: 100,
        guildPerks: true,
        guildProgression: false,
        guildHalls: false,
        lfgDepth: 30,
        crossRealm: false,
        voiceChat: false,
        mentoring: false,
        communityTools: 35,
        guildFinder: false
      },

      engines: [
        newEngine('professions', 55),
        newEngine('auctionHouse', 60),
        newEngine('achievements', 45),
        newEngine('collections', 40)
      ],

      monetisation: {
        model: 'sub',
        subPrice: 14.99,
        boxPrice: 49.99,
        expansionPrice: 39.99,
        shop: [],
        battlePass: {
          enabled: false,
          seasonWeeks: 12,
          price: 9.99,
          tiers: [],
          grindHoursPerWeek: 6,
          fomo: 50,
          catchUp: 40,
          carryover: false
        },
        regionalPricing: true,
        founderPacks: false
      },

      liveOps: {
        patchCadenceWeeks: 8,
        majorContentWeeks: 26,
        ptrUse: 40,
        hotfixSpeed: 50,
        commsFrequency: 40,
        transparency: 50,
        moderationSpend: 35,
        antiCheatSpend: 30,
        balancePassEffort: 40
      },

      infra: {
        regions: 2,
        capacityHeadroom: 40,
        redundancy: 35,
        serverTech: 50
      }
    };
  }

  /* --------------------------------------------------------- accessors -- */

  function bossesIn(design, dungeon) {
    if (!dungeon) return [];
    return (design.bosses || []).filter(function (b) { return b.dungeonId === dungeon.id; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function dungeonsIn(design, zoneId) {
    return (design.dungeons || []).filter(function (d) { return d.zoneId === zoneId; });
  }
  function engineOf(design, engineId) { return U.byId(design.engines, engineId); }
  function hasEngine(design, engineId) {
    var e = engineOf(design, engineId);
    return !!(e && e.enabled);
  }
  function engineInvestment(design, engineId) {
    var e = engineOf(design, engineId);
    return e && e.enabled ? e.investment / 100 : 0;
  }

  /* Every tag the design carries, weighted. Feeds the coherence engine. */
  function designTags(design) {
    var prim = PN.prim, tags = {};
    function add(list, w) {
      (list || []).forEach(function (t) { tags[t] = (tags[t] || 0) + (w || 1); });
    }
    add(prim.find(prim.SETTINGS, design.identity.setting).tags, 1.0);
    add(prim.find(prim.COMBAT_PARADIGMS, design.identity.combat).tags, 1.6);
    add(prim.find(prim.WORLD_STRUCTURES, design.identity.world).tags, 1.5);
    add(prim.find(prim.DEATH_PENALTIES, design.identity.deathPenalty).tags, 1.0);
    add(prim.find(prim.ROLE_SYSTEMS, design.identity.roleSystem).tags, 1.2);
    add(prim.find(prim.PROGRESSION_MODELS, design.progression.model).tags, 1.4);
    add(prim.find(prim.BUSINESS_MODELS, design.monetisation.model).tags, 1.3);

    design.engines.forEach(function (e) {
      if (!e.enabled) return;
      var def = prim.ENGINE_BY_ID[e.id];
      if (def) add(def.tags, 0.5 + (e.investment / 100));
    });
    (design.monetisation.shop || []).forEach(function (s) {
      if (!s.enabled) return;
      var def = prim.SHOP_BY_ID[s.catId];
      if (def) add(def.tags, 0.3 + (s.prominence / 100) * 0.7);
    });
    design.classes.forEach(function (c) {
      (c.abilities || []).forEach(function (aid) {
        var ab = U.byId(design.abilities || [], aid);
        if (ab) add(PN.abilities.abilityTags(ab), 0.10);
      });
    });
    design.bosses.forEach(function (b) {
      b.phases.forEach(function (p) {
        (p.mechanics || []).forEach(function (mid) {
          var def = prim.MECHANIC_BY_ID[mid];
          if (def) add(def.tags, 0.12);
        });
      });
    });
    if (design.monetisation.battlePass.enabled) add(['seasonal', 'fomo', 'modern'], 1.0);
    if (design.social.lfgDepth > 65) add(['casual-friendly', 'instanced'], 0.8);
    if (design.social.lfgDepth < 20) add(['old-school', 'social-core'], 0.8);
    if (design.social.guildHalls) add(['social-core', 'sticky', 'identity-core'], 0.7);
    if (design.progression.levelScaling) add(['evergreen', 'alt-friendly'], 0.7);
    if (design.economy.tradingEnabled && design.economy.auctionHouse) add(['economy', 'player-driven'], 0.6);
    if (!design.economy.tradingEnabled) add(['instanced', 'rmt-proof'], 0.6);
    if (design.pvp.enabled && design.pvp.soloQueue) add(['competitive-core', 'casual-friendly'], 0.6);
    if (design.pvp.enabled && design.pvp.gearPower > 55) add(['gear-gated', 'pvp-core'], 0.8);
    if ((design.monsters || []).some(function (m) { return m.tameable; })) add(['collection-core', 'pet'], 0.5);
    return tags;
  }

  /* ------------------------------------------------------ playable set --

     Everything downstream - the combat solver, balance, the agent sim -
     wants "the list of things a player can be". Under a class system that
     is the authored classes. Under a talent system it is the compiled
     branches. One seam, so nothing below it has to care which.         */
  function playable(design) {
    if (design.progression && design.progression.characterSystem === 'talent')
      return PN.talents.builds(design);
    return (design.classes || []).filter(function (c) { return c.enabled !== false; });
  }
  function playableById(design, id) { return U.byId(playable(design), id); }

  /* The editable object behind a playable - a class, or the branch a
     compiled build came from. Balance hotfixes need the real thing, not
     the derived copy, or the nerf evaporates on the next recompile. */
  function tunable(design, id) {
    if (design.progression && design.progression.characterSystem === 'talent')
      return PN.talents.branchById(design, id);
    return U.byId(design.classes || [], id);
  }
  function tunables(design) {
    if (design.progression && design.progression.characterSystem === 'talent')
      return PN.talents.branches(design);
    return (design.classes || []).filter(function (c) { return c.enabled !== false; });
  }


  /* ---------------------------------------------------------- duplicate --

     Most authoring is variations on a theme: five pieces of gear that
     differ by one stat, three mobs that differ by a number, a talent you
     want twice at a different magnitude. Copying one and editing the copy
     is far faster than building each from blank.

     A copy is the same object with a new id and a new name, inserted
     straight after the original so it lands where you are looking. */

  /* Which lists can be copied from, and which selection points at them. */
  var DUPLICABLE = {
    ability: { sel: 'abilityId', list: function (d) { return d.abilities; } },
    item:    { sel: 'itemId',    list: function (d) { return d.items; } },
    monster: { sel: 'monsterId', list: function (d) { return d.monsters; } },
    talent:  { sel: 'nodeId',    list: function (d) { return PN.talents.tree(d).nodes; } },
    recipe:  { sel: 'recipeId',  list: function (d) { return PN.crafting.recipes(d); } },
    loot:    { sel: 'lootId',    list: function (d) { return d.lootTables; } },
    quest:   { sel: 'questId',   list: function (d) { return d.quests; } },
    boss:    { sel: 'bossId',    list: function (d) { return d.bosses; } },
    zone:    { sel: 'zoneId',    list: function (d) { return d.zones; } },
    reward:  { sel: 'rewardId',  list: function (d) { return d.rewards; } }
  };

  /* "Iron Sword" becomes "Iron Sword 2", then 3 - rather than
     "Iron Sword copy copy copy". */
  function copyName(list, name) {
    var base = String(name === undefined ? 'Copy' : name).replace(/\s+(\d+)$/, '');
    var taken = {};
    (list || []).forEach(function (x) { if (x && x.name) taken[x.name] = 1; });
    var n = 2;
    while (taken[base + ' ' + n] && n < 999) n++;
    return base + ' ' + n;
  }

  function duplicate(design, what, id) {
    var kind = DUPLICABLE[what];
    if (!kind || !design) return null;
    var list = kind.list(design);
    if (!list) return null;
    var src = U.byId(list, id);
    if (!src) return null;

    var copy = U.clone(src);
    /* Keep the id's prefix so ids stay readable in a save file. */
    var prefix = String(src.id || '').split('_')[0] || 'cp';
    copy.id = U.id(prefix);
    copy.name = copyName(list, src.name);
    /* A copy of a talent is its own talent, not a second member of the
       same either-or choice - you could take both and the choice would
       mean nothing. */
    if (what === 'talent') copy.choiceGroup = null;

    var at = list.indexOf(src);
    if (at >= 0) list.splice(at + 1, 0, copy); else list.push(copy);
    U.bumpDesign(design);
    return copy;
  }
  /* Is the class editor locked right now, and why. */
  function classesLocked(design) {
    return !!(design.progression && design.progression.characterSystem === 'talent');
  }

  PN.schema = {
    newDesign: newDesign,
    newClass: newClass, newSpec: newSpec, newZone: newZone,
    playable: playable, playableById: playableById, classesLocked: classesLocked,
    tunable: tunable, tunables: tunables,
    duplicate: duplicate, DUPLICABLE: DUPLICABLE, copyName: copyName,
    newQuestline: newQuestline, newRewardChain: newRewardChain,
    newBoss: newBoss, newPhase: newPhase, newDungeon: newDungeon,
    newShopEntry: newShopEntry, newEngine: newEngine,
    newExpansion: newExpansion, newPassTier: newPassTier,
    CHAIN_REQUIREMENTS: CHAIN_REQUIREMENTS, DIFFICULTY_TIERS: DIFFICULTY_TIERS,
    bossesIn: bossesIn, dungeonsIn: dungeonsIn,
    /* kept for save compatibility with the first build */
    allBossesIn: function (design, dungeon) { return bossesIn(design, dungeon); },
    engineOf: engineOf, hasEngine: hasEngine,
    engineInvestment: engineInvestment, designTags: designTags,
    tierById: tierById,
    /* Which of the difficulties you ticked is the easy one and which is
       the hard one.

       The simulation runs dungeons on their lowest difficulty and raids
       on their highest, and it used to decide which was which by taking
       the first and last entry of the list - which is the order you
       ticked the boxes in, not an ordering of anything. A raid marked
       "Heroic, Story" was being run on Story every week: the hardest
       tier in the game by the list, the easiest by the only measure
       that matters. */
    easiestTier: function (ids) { return pickTier(ids, false); },
    hardestTier: function (ids) { return pickTier(ids, true); }
  };

  function tierById(id) {
    for (var i = 0; i < DIFFICULTY_TIERS.length; i++)
      if (DIFFICULTY_TIERS[i].id === id) return DIFFICULTY_TIERS[i];
    return DIFFICULTY_TIERS[1];
  }

  function pickTier(ids, hardest) {
    var best = null;
    (ids && ids.length ? ids : ['normal']).forEach(function (id) {
      var t = tierById(id);
      if (!best || (hardest ? t.mult > best.mult : t.mult < best.mult)) best = t;
    });
    return best || DIFFICULTY_TIERS[1];
  }
})(PN);
