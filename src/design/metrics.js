/* Patch Notes - derived design metrics.
   Turns authored content into the numbers the simulation reasons about.
   Nothing here is random: same design in, same metrics out.               */
(function (PN) {
  'use strict';
  var U = PN.util, prim = PN.prim, schema = PN.schema;

  /* ====================================================== CLASS METRICS ==
     Everything here is derived from the abilities the player authored
     and the combat solver's verdict on them.                            */
  function classMetrics(design, cls) {
    var para = prim.find(prim.COMBAT_PARADIGMS, design.identity.combat);
    var AB = PN.abilities;
    var abilities = AB.abilitiesOf(design, cls);
    var shapes = abilities.map(AB.shape);

    var m = {
      buttons: abilities.length, complexity: 0, ceilRaw: 0, floorRaw: 0,
      burst: 0, sustain: 0, aoe: 0, heal: 0, mitigate: 0, threat: 0,
      control: 0, mobility: 0, support: 0, fantasy: 0
    };

    abilities.forEach(function (ab, i) {
      var sh = shapes[i];
      m.complexity += sh.complexity;
      m.ceilRaw += sh.complexity * 1.5 + (ab.cooldown > 0 ? 1.2 : 0) +
                   (AB.hasEffect(ab, 'interrupt') ? 3 : 0) +
                   (AB.hasEffect(ab, 'dot') ? 2 : 0);
      m.floorRaw += 1 + (ab.castTime > 0 ? 0.6 : 0) + (ab.resourceCost > 0 ? 0.5 : 0);

      AB.effectsOfType(ab, 'damage').forEach(function (e) {
        var burstish = ab.cooldown >= 30 ? 1 : 0.35;
        m.burst += (e.base || 0) / 40 * burstish;
        m.sustain += (e.base || 0) / 55 * (ab.cooldown === 0 ? 1.2 : 0.5);
      });
      AB.effectsOfType(ab, 'dot').forEach(function (e) {
        m.sustain += ((e.base || 0) * Math.max(1, (e.duration || 0) / Math.max(0.5, e.interval || 1))) / 90;
      });
      if (sh.aoe) m.aoe += 3 + (ab.maxTargets || 1) * 0.6;
      AB.effectsOfType(ab, 'heal').concat(AB.effectsOfType(ab, 'hot'))
        .concat(AB.effectsOfType(ab, 'absorb')).forEach(function (e) {
          m.heal += (e.base || 0) / 45;
        });
      m.mitigate += sh.mitigationValue * 0.55;
      m.threat += sh.threatValue;
      m.control += sh.hardControlSeconds * 1.4 + sh.controlSeconds * 0.7;
      m.mobility += sh.mobilityValue * 0.55;
      m.support += sh.supportValue * 0.6;
      m.fantasy += (sh.isSummon ? 6 : 0) + (AB.hasEffect(ab, 'stealth') ? 7 : 0) +
                   (ab.cooldown >= 120 ? 4 : 0) + (sh.isMobility ? 2 : 0) + 1;
    });

    var ev = abilities.length ? PN.combat.evaluate(design, cls) : null;
    m.evaluation = ev;
    m.dps = ev ? ev.dps : 0;
    m.hps = ev ? ev.hps : 0;
    m.ehp = ev ? ev.ehp : 0;
    m.ttkSolo = ev ? ev.ttkSolo : 0;
    m.ttkPvp = ev ? ev.ttkPvp : 0;
    m.resourceStarved = ev ? ev.resourceStarved : false;
    m.gcdFill = ev ? ev.gcdFill : 0;

    var bloat = Math.max(0, m.buttons - para.buttonComfort);
    m.bloat = bloat;

    m.skillCeiling = U.clamp100(
      U.saturate(m.ceilRaw, 34) * 72 * (0.55 + para.mastery / 100 * 0.62) + bloat * 0.4
    );
    m.skillFloor = U.clamp100(
      U.saturate(m.floorRaw, 26) * 46 + bloat * 2.6 + (100 - para.access) * 0.28
    );
    m.rotationDepth = U.clamp100(U.saturate(m.complexity, 22) * 100);

    var pillars = [m.burst, m.sustain, m.aoe, m.heal, m.mitigate, m.control, m.mobility, m.support];
    var peak = Math.max.apply(null, pillars.concat([0.001]));
    var spread = U.sum(pillars) / (peak * pillars.length);
    m.fantasyClarity = U.clamp100(
      (m.fantasy / Math.max(1, m.buttons)) * 11 + (1 - spread) * 46 + (cls.fantasy ? 8 : 0)
    );

    var roleNeed = {
      tank:   { mitigate: 0.34, threat: 0.34, sustain: 0.10, control: 0.12, mobility: 0.10 },
      healer: { heal: 0.62, support: 0.20, mobility: 0.08, control: 0.10 },
      dps:    { burst: 0.28, sustain: 0.34, aoe: 0.20, mobility: 0.10, control: 0.08 },
      hybrid: { burst: 0.16, sustain: 0.20, heal: 0.22, mitigate: 0.14, support: 0.16, mobility: 0.12 }
    }[cls.role] || {};
    var fit = 0, need = 0;
    for (var k2 in roleNeed) { fit += Math.min(m[k2], 22) * roleNeed[k2]; need += 22 * roleNeed[k2]; }
    m.roleFitness = U.clamp100(need > 0 ? (fit / need) * 100 : 0);

    m.paradigmFriction = U.clamp100(
      bloat * 3.2 +
      (para.twitch > 0.6 && m.complexity > 16 ? (m.complexity - 16) * 2.4 : 0) +
      (para.twitch < 0.25 && m.mobility > 16 ? (m.mobility - 16) * 1.2 : 0)
    );
    return m;
  }

  /* ======================================================= BOSS METRICS == */
  function bossMetrics(design, boss) {
    var para = prim.find(prim.COMBAT_PARADIGMS, design.identity.combat);
    var roleSys = prim.find(prim.ROLE_SYSTEMS, design.identity.roleSystem);
    var phases = boss.phases || [];
    var m = { diff: 0, coord: 0, exec: 0, gear: 0, learn: 0, spec: 0, frust: 0,
              mechCount: 0, phases: phases.length, tankLoad: 0, healLoad: 0, dpsLoad: 0,
              uniqueMechanics: 0 };

    var seen = {};
    phases.forEach(function (p, i) {
      var w = 1 + i * 0.22;
      (p.mechanics || []).forEach(function (mid) {
        var d = prim.MECHANIC_BY_ID[mid]; if (!d) return;
        m.mechCount++;
        if (!seen[mid]) { seen[mid] = 1; m.uniqueMechanics++; }
        m.diff += d.diff * w; m.coord += d.coord * w; m.exec += d.exec * w;
        m.gear += d.gear * w; m.learn += d.learn * w;
        m.spec += d.spec * w; m.frust += d.frust * w;
        m.tankLoad += d.roles.t * w; m.healLoad += d.roles.h * w; m.dpsLoad += d.roles.d * w;
        if (d.tags.indexOf('trinity-required') >= 0 && roleSys.clarity < 0.5) m.frust += 2.5 * w;
        if (d.tags.indexOf('action-required') >= 0 && para.twitch < 0.35) m.frust += 4.0 * w;
      });
      m.diff += (p.damage || 0) * 0.035 * w;
      m.gear += (p.damage || 0) * 0.022 * w;
    });

    var enrageTight = U.clamp01((520 - (boss.enrage || 480)) / 420);
    m.gear += enrageTight * 14;
    m.frust += enrageTight * 6;
    m.learn += Math.max(0, phases.length - 1) * 1.6;
    m.spec += Math.max(0, phases.length - 1) * 2.2;

    var tune = (boss.tuning || 0);
    m.difficulty  = U.clamp100(U.saturate(m.diff, 20) * 88 + tune);
    m.coordination = U.clamp100(U.saturate(m.coord, 18) * 100);
    m.execution   = U.clamp100(U.saturate(m.exec, 18) * 100);
    m.gearCheck   = U.clamp100(U.saturate(m.gear, 20) * 100);
    m.learnTime   = U.clamp100(U.saturate(m.learn, 12) * 100);
    m.spectacle   = U.clamp100(U.saturate(m.spec, 16) * 74 +
                               (boss.spectacleArt || 50) * 0.26 +
                               design.identity.productionValue * 0.16);
    m.frustration = U.clamp100(U.saturate(m.frust, 16) * 92);

    if (m.mechCount === 0) {
      m.difficulty = Math.min(m.difficulty, 14);
      m.spectacle = Math.min(m.spectacle, 20);
      m.dummy = true;
    }
    m.mechanicVariety = m.mechCount > 0 ? m.uniqueMechanics / m.mechCount : 0;
    m.lootValue = PN.items.lootValue(design, PN.items.lootById(design, boss.lootTableId));
    return m;
  }

  /* Probability a group at a given skill and gear level clears this boss
     on a given difficulty tier, within a week of attempts.               */
  function clearChance(bm, tierMult, skill, gearRatio, coordination) {
    if (bm.dummy) return 0.99;
    var demand = bm.difficulty * 0.55 + bm.execution * 0.25 + bm.coordination * 0.20;
    demand *= 0.72 + 0.28 * tierMult;
    var supply = skill * 100 * (0.70 + coordination * 0.45) + gearRatio * 28;
    var gearPenalty = Math.max(0, bm.gearCheck * tierMult * 0.6 - gearRatio * 100) * 0.045;
    var edge = (supply - demand) * 0.075 - gearPenalty - bm.learnTime * 0.004;
    return U.clamp01(U.sigmoid(edge, 0, 1.0));
  }

  /* ==================================================== DUNGEON METRICS == */
  function dungeonMetrics(design, dungeon) {
    var bosses = schema.bossesIn(design, dungeon).map(function (b) { return bossMetrics(design, b); });
    var m = {
      bossCount: bosses.length,
      difficulty: U.avg(bosses, function (b) { return b.difficulty; }),
      spectacle: U.avg(bosses, function (b) { return b.spectacle; }),
      frustration: U.avg(bosses, function (b) { return b.frustration; }),
      coordination: U.avg(bosses, function (b) { return b.coordination; }),
      learnTime: U.sum(bosses, function (b) { return b.learnTime; }),
      gearCheck: U.avg(bosses, function (b) { return b.gearCheck; }),
      bosses: bosses
    };
    var tierCount = Math.max(1, (dungeon.tiers || []).length);
    var runHours = (dungeon.lengthMin || 30) / 60;

    m.finiteHours = runHours * (1 + m.bossCount * 0.55) * tierCount * (1 + m.learnTime / 160);
    m.replayFactor = 1
      + (dungeon.scaling ? 2.6 : 0)
      + (dungeon.affixes ? 1.4 : 0)
      + (dungeon.lockout === 'weekly' ? 0.5 : dungeon.lockout === 'daily' ? 0.9 : 0.2)
      + (dungeon.matchmaking ? 0.5 : 0)
      + (tierCount - 1) * 0.4;

    /* Loot is what makes a run worth repeating. */
    var lootPerRun = U.sum(bosses, function (b) { return b.lootValue; }) +
      PN.items.lootValue(design, PN.items.lootById(design, dungeon.trashLootTableId)) +
      PN.items.rewardValue(design, PN.items.rewardById(design, dungeon.completionRewardId));
    m.lootPerRun = lootPerRun;
    m.replayFactor *= 0.65 + U.saturate(lootPerRun, 90) * 0.75;

    m.totalHours = m.finiteHours * m.replayFactor;
    m.category = dungeon.kind === 'raid' ? 'raid' : 'dungeon';
    m.orphaned = !dungeon.zoneId;
    return m;
  }

  /* =================================================== QUESTLINE METRICS */
  function questlineMetrics(design, ql) {
    var quests = PN.world.questsOfLine(design, ql.id);
    var m = { hours: 0, joy: 0, cost: { design: 0, art: 0, eng: 0 }, count: quests.length, cats: {} };
    quests.forEach(function (q) {
      var qm = PN.world.questMetrics(design, q);
      m.hours += qm.hours;
      m.joy += qm.joy;
      m.cost.design += qm.cost.design;
      m.cost.art += qm.cost.art;
      m.cost.eng += qm.cost.eng;
      qm.cats.forEach(function (c) { m.cats[c] = (m.cats[c] || 0) + qm.hours / qm.cats.length; });
    });
    var branchMult = 1 + (ql.branching || 0) / 220;
    m.hours *= branchMult;
    m.joy = quests.length ? (m.joy / quests.length) * branchMult : 0;
    m.joy = U.clamp100(m.joy);
    var cap = PN.items.rewardById(design, ql.capstoneRewardId);
    if (cap) m.joy = U.clamp100(m.joy + U.saturate(PN.items.rewardValue(design, cap), 120) * 14);
    m.cost.design *= branchMult; m.cost.art *= branchMult;
    U.keys(m.cats).forEach(function (c) { m.cats[c] *= branchMult; });
    return m;
  }

  /* ================================================ REWARD CHAIN METRICS
     Chain shape is the whole point: where the payoff sits decides
     whether people start it, finish it, or resent it.                  */
  function rewardChainMetrics(design, chain) {
    var steps = chain.steps || [];
    if (!steps.length) return { pull: 0, totalWeeks: 0, shape: 'empty', frustration: 0,
                                payoff: 0, steps: 0, axes: {}, com: 0.5 };

    var vals = steps.map(function (s) {
      return PN.items.rewardValue(design, PN.items.rewardById(design, s.rewardId));
    });
    var total = U.sum(vals);
    var weeks = U.sum(steps, function (s) { return s.gateWeeks || 0; });
    var n = steps.length;

    var com = total > 0 ? U.sum(vals, function (v, i) {
      return v * (n === 1 ? 0.5 : i / (n - 1));
    }) / total : 0.5;
    var shape = com < 0.34 ? 'front-loaded' : com > 0.66 ? 'back-loaded' : 'steady';

    var magnitudeScore = U.saturate(total, 220) * 100;
    var lengthPenalty = weeks > 14 ? (weeks - 14) * 1.6 : 0;
    var pull = U.clamp100(
      magnitudeScore * (shape === 'back-loaded' ? 1.14 : shape === 'steady' ? 1.0 : 0.84)
      - lengthPenalty
      + (chain.pityTimer ? 6 : 0)
      + (chain.accountWide ? 5 : 0)
      + (chain.catchUp || 0) * 0.10
    );

    var emptySteps = steps.filter(function (s) { return !s.rewardId; }).length;
    var frustration = U.clamp100(
      (chain.expires ? 22 : 0)
      + (chain.pityTimer ? 0 : 14)
      + (weeks > 10 ? (weeks - 10) * 2.4 : 0)
      + (shape === 'back-loaded' ? 12 : 0)
      + emptySteps * 10
      - (chain.catchUp || 0) * 0.14
      - (chain.accountWide ? 8 : 0)
    );

    var axes = {};
    steps.forEach(function (s) {
      var r = PN.items.rewardById(design, s.rewardId);
      if (!r) return;
      var a = PN.items.rewardAxes(design, r);
      U.keys(a).forEach(function (k) { axes[k] = (axes[k] || 0) + a[k]; });
    });

    return { pull: pull, totalWeeks: weeks, shape: shape, frustration: frustration,
             payoff: total, steps: n, axes: axes, com: com, emptySteps: emptySteps };
  }

  /* ================================================== CONTENT INVENTORY == */
  function contentInventory(design) {
    var world = prim.find(prim.WORLD_STRUCTURES, design.identity.world);
    var inv = {};
    PN.tax.CATEGORY_IDS.forEach(function (c) { inv[c] = 0; });


    /* The kit is content too, and it used to count for nothing at all.

       Every class is a character somebody levels from one again; every
       ability is a button to learn, and a reason to reroll; every talent
       branch is a build to try. That is where alt-friendly games get
       their years from, and pricing it at zero is why a game with six
       classes and a hundred abilities read as having no more to do than
       one with two. */
    var playables = PN.schema.playable(design).length;
    var abilityCount = (design.abilities || []).length;
    if (playables > 0) {
      /* Rolling an alt replays the levelling game, but not at full price -
         you know where everything is the second time. */
      inv.levelling += U.saturate(playables - 1, 8) * 22;
      inv.achievement += U.saturate(playables, 10) * 9;
    }
    /* Learning a kit well is achievement-shaped content: it is the part
       of an MMO people get good at rather than finish. */
    inv.achievement += U.saturate(abilityCount, 60) * 16;

    if (PN.talents.isTalentMode(design)) {
      var tm = PN.talents.treeMetrics(design);
      /* A tree you cannot take everything in is a tree worth respeccing. */
      inv.achievement += U.saturate(tm.nodes || 0, 90) * 18 +
                     U.saturate(100 - (tm.reach || 0), 60) * 6;
    } else {
      var specs = U.sum(design.classes || [], function (c) {
        return Math.max(0, (c.specs || []).length - 1);
      });
      inv.achievement += U.saturate(specs, 12) * 11;
    }
    /* Levelling hours come from the quests and monsters that exist. */
    var questHours = 0;
    (design.quests || []).forEach(function (q) {
      var qm = PN.world.questMetrics(design, q);
      /* A quest is read, travelled to, done and handed back. The old
         number priced only the doing. */
      questHours += qm.hours * 1.6;
      qm.cats.forEach(function (c) { inv[c] = (inv[c] || 0) + qm.hours / qm.cats.length; });
    });

    /* If the design has barely any authored quests, the stated
       time-to-cap still represents grinding to the cap.             */
    var stated = design.progression.model === 'rank' ? 4 : design.progression.timeToCapHours;
    inv.levelling += Math.max(stated * 0.35, questHours * 0.5) *
                     (1 + (design.factions.factionContent / 100) * (design.factions.count > 1 ? 0.35 : 0));

    /* Monsters make a zone worth walking through. */
    (design.zones || []).forEach(function (z) {
      var mobs = PN.world.monstersIn(design, z.id);
      var base = (z.size / 100) * 11 + (z.secrets / 100) * 14;
      inv.exploration += base * world.explore * (1 + U.saturate(mobs.length, 8) * 0.9);
      /* Every creature you author is somewhere to go and something to
         kill, and a zone full of them is a zone worth being in. */
      inv.levelling += (z.density / 100) * 5.5 + U.saturate(mobs.length, 10) * 9;
      var tameable = mobs.filter(function (m) { return m.tameable; }).length;
      if (tameable) inv.creature += U.saturate(tameable, 6) * 8;
    });

    design.dungeons.forEach(function (d) {
      var dm = dungeonMetrics(design, d);
      /* An instance is run over and over, not once. */
      inv[dm.category] += dm.totalHours * 1.8;
    });

    inv.cosmetic += (design.factions.creatorDepth / 100) * 9;

    /* Ranked PvP depth. */
    if (design.pvp.enabled) {
      inv.pvpArena += Math.max(design.pvp.mapCount, (design.pvpMaps || []).length) * 3.4 +
                      design.pvp.objectiveModes.length * 4;
      inv.competitiveLadder += 11;
    }

    /* Collectable items are content in themselves. */
    var cosmetics = (design.items || []).filter(function (i) {
      return i.kind === 'cosmetic' || i.kind === 'mount';
    }).length;
    inv.collection += U.saturate(cosmetics, 20) * 26;

    /* Crafting is content, and it is the recipes you authored that decide
       how much. Gathering the reagents is most of the hours a profession
       actually costs a player, and how thick the nodes are on the ground
       stretches or shortens that; a recipe locked behind a drop adds the
       hunt for the page on top. */
    var craftSum = PN.crafting.summary(design);
    if (craftSum.recipes) {
      inv.crafting += craftSum.hours * 1.7 *
        (0.6 + (design.economy.gatheringNodes / 100) * 0.8);
      /* Crafted gear is a second ladder to the same place, so it feeds
         progression too - as far as the gear it makes can compete. */
      inv.progression += craftSum.competitive * 2.4;
      /* Materials are traded, which is most of what an auction house is
         actually for - and only the ones that are not soulbound. */
      if (design.economy.tradingEnabled) {
        inv.economy += craftSum.recipes * 0.5 * (design.economy.auctionHouse ? 1.6 : 1) *
                       PN.items.tradeableShare(design);
      }
    }

    /* The live calendar. Averaged across the year, because an event
       that runs for three weeks is not three weeks of content every
       week - it is three weeks of content, once. */
    var evs = PN.gameEvents.summary(design);
    if (evs.hours > 0) {
      inv.collection += evs.hours * 0.45;
      inv.social += evs.hours * 0.25;
      inv.cosmetic += evs.hours * 0.30;
    }

    /* Questlines. A quest that is the fourth chapter of something is
       worth more than the same quest standing on its own: you come
       back for the next one. The bonus goes to every quest in the
       line and grows with how long the line is, so a ten-quest
       campaign is worth half an hour more per quest than ten
       unrelated errands. */
    var lineBonus = 0;
    (design.questlines || []).forEach(function (line) {
      var inLine = (design.quests || []).filter(function (q) {
        return q.questlineId === line.id; }).length;
      if (inLine < 2) return;          /* one quest is not a story */
      lineBonus += inLine * (inLine * 0.05);
    });
    if (lineBonus > 0) {
      inv.questNarrative += lineBonus * 0.7;
      inv.levelling += lineBonus * 0.3;
    }

    return inv;
  }

  /* Synthetic hours per engaged player per week, by category. */
  function engineOutput(design) {
    var out = {}, meta = {};
    PN.tax.CATEGORY_IDS.forEach(function (c) { out[c] = 0; });
    var grind = 0, grindWeight = 0;

    /* An engine is a promise the rest of the design has to keep. The
       professions engine turning out four hours a week of crafting when
       nobody authored a recipe is the slider lying, so scale it by what
       is actually there. Everything else an engine yields is systemic
       and needs no content behind it. */
    var craftSum = PN.crafting.summary(design);
    var recipeGate = U.clamp(0.15 + U.clamp01(craftSum.viable / 12) * 0.95, 0.15, 1.1);

    design.engines.forEach(function (e) {
      if (!e.enabled) return;
      var def = prim.ENGINE_BY_ID[e.id]; if (!def) return;
      var inv = e.investment / 100;
      var gate = e.id === 'professions' ? recipeGate : 1;
      var yield_ = def.rate * (0.35 + inv * 0.9) * gate;
      def.cats.forEach(function (c) { out[c] = (out[c] || 0) + yield_ / def.cats.length; });
      grind += def.grind * inv; grindWeight += inv;
      meta[e.id] = { yield: yield_, decay: def.decay, inv: inv, gate: gate };
    });

    design.dungeons.forEach(function (d) {
      var dm = dungeonMetrics(design, d);
      if (d.lockout !== 'none' || d.scaling) {
        out[dm.category] += (d.scaling ? 2.2 : 0.9) * Math.max(1, dm.bossCount) * 0.35;
      }
    });

    /* Repeatable quests are an engine too. */
    var dailies = (design.quests || []).filter(function (q) { return q.repeatable !== 'none'; }).length;
    if (dailies) {
      out.levelling += U.saturate(dailies, 12) * 3.2;
      grind += 7 * U.clamp01(dailies / 12); grindWeight += U.clamp01(dailies / 12);
    }

    if (design.pvp.enabled) {
      out.pvpArena += 3.5 + design.pvp.mapCount * 0.4;
      out.competitiveLadder += 3.0;
    }

    return { hours: out, meta: meta,
             grindIntensity: U.clamp100((grindWeight > 0 ? grind / grindWeight : 0) * 11) };
  }

  /* ====================================================== BALANCE STATE ==
     Measured per build. A class whose damage build is dominant and whose
     tank build is unplayable is a broken class, and a class-level average
     says it is fine.                                                    */
  function balanceState(design) {
    var active = PN.builds.enumerate(design);
    if (active.length < 2) {
      return { spread: 0, pvpSpread: 0, quality: active.length ? 70 : 40,
               outliers: [], repGini: 0, perClass: [], perBuild: [], byPlayable: {} };
    }
    var evals = PN.combat.evaluateAll(design);
    var per = active.map(function (c) {
      var ev = evals.byId[c.id];
      return { cls: c, ev: ev, pve: ev ? ev.pveScore : 0, pvp: ev ? ev.pvpScore : 0 };
    });

    /* Builds are only comparable against the same job. A tank doing less
       damage than a damage build is the design working. */
    var byRole = {};
    per.forEach(function (p) { (byRole[p.cls.role] = byRole[p.cls.role] || []).push(p); });

    var devSum = 0, devCount = 0;
    U.keys(byRole).forEach(function (role) {
      var group = byRole[role];
      if (group.length < 2) return;
      var mean = U.avg(group, function (g) { return g.pve; });
      group.forEach(function (g) {
        g.pveDev = mean > 0 ? (g.pve - mean) / mean : 0;
        devSum += Math.abs(g.pveDev); devCount++;
      });
    });
    per.forEach(function (p) { if (p.pveDev === undefined) p.pveDev = 0; });

    var pvpMean = U.avg(per, function (p) { return p.pvp; });
    per.forEach(function (p) { p.pvpDev = pvpMean > 0 ? (p.pvp - pvpMean) / pvpMean : 0; });

    var spread = devCount > 0 ? (devSum / devCount) * 100 : 0;
    var pvpSpread = U.stdev(per, function (p) { return p.pvpDev; }) * 100;

    per.forEach(function (p) {
      p.representation = Math.exp((p.pveDev * 2.3) + (p.pvpDev * 0.8));
    });
    var repTotal = U.sum(per, function (p) { return p.representation; });
    per.forEach(function (p) { p.representation = repTotal > 0 ? p.representation / repTotal : 0; });
    var repGini = U.gini(per.map(function (p) { return p.representation; }));

    var outliers = per.filter(function (p) { return Math.abs(p.pveDev) > 0.16 || Math.abs(p.pvpDev) > 0.22; })
                      .sort(function (a, b) { return Math.abs(b.pveDev) - Math.abs(a.pveDev); });

    /* Rolled up per class as well, because "is the Warrior all right"
       is still a question a designer asks. */
    var byPlayable = {};
    per.forEach(function (p) {
      var pid = p.cls.playableId || p.cls.id;
      var g = byPlayable[pid] || (byPlayable[pid] = {
        id: pid, name: p.cls.playableName || p.cls.name, builds: [],
        best: null, worst: null
      });
      g.builds.push(p);
      if (!g.best || p.pve > g.best.pve) g.best = p;
      if (!g.worst || p.pve < g.worst.pve) g.worst = p;
    });
    U.keys(byPlayable).forEach(function (k) {
      var g = byPlayable[k];
      g.pve = U.avg(g.builds, function (b) { return b.pve; });
      g.pvp = U.avg(g.builds, function (b) { return b.pvp; });
      g.representation = U.sum(g.builds, function (b) { return b.representation; });
      /* The gap between a class's best and worst build is the number that
         tells you whether it really has options. */
      g.internalSpread = g.best && g.worst && g.best.pve > 0
        ? (g.best.pve - g.worst.pve) / g.best.pve : 0;
    });

    var effort = design.liveOps.balancePassEffort / 100;
    /* A class with one viable build out of three is a balance problem even
       if every build is individually near its role average. */
    var deadBuilds = per.filter(function (p) { return p.pveDev < -0.28; }).length;
    var quality = U.clamp100(100 - spread * 1.35 - pvpSpread * 0.85 - repGini * 55
                             - deadBuilds * 2.2 + effort * 16);

    return { spread: spread, pvpSpread: pvpSpread, quality: quality,
             outliers: outliers, repGini: repGini,
             perClass: per, perBuild: per, byPlayable: byPlayable,
             deadBuilds: deadBuilds };
  }


  /* ================================================= STUDIO BUILD COSTS ==

     Priced off the whole design, and asked for constantly: a roadmap
     with three releases on it wants the bill for six designs on every
     frame - what each release costs is the difference between the game
     before it and the game after it. So it is cached like everything
     else that walks the design. */
  var buildCost = U.memoDesign(function (design) {
    var cost = { design: 0, art: 0, eng: 0, qa: 0 };
    var para = prim.find(prim.COMBAT_PARADIGMS, design.identity.combat);
    var world = prim.find(prim.WORLD_STRUCTURES, design.identity.world);
    var pv = design.identity.productionValue / 100;

    cost.eng += 40 * para.engCost * world.engCost;
    cost.design += 26;
    cost.art += 30 * world.artCost * (0.5 + pv);

    /* Abilities are the biggest design and art line item there is. */
    (design.abilities || []).forEach(function (ab) {
      var sh = PN.abilities.shape(ab);
      cost.design += 0.55 + sh.complexity * 0.30;
      cost.art += (0.75 + sh.complexity * 0.22) * (0.55 + pv);
      cost.eng += 0.18 + (sh.isSummon ? 0.9 : 0) + (ab.channel > 0 ? 0.2 : 0);
    });
    /* Classes are only a cost when you authored them. A talent game pays
       for its tree instead, node by node. */
    if (!PN.talents.isTalentMode(design)) {
      design.classes.forEach(function (c) {
        cost.design += 3.0;
        cost.art += 2.2 * (0.55 + pv);
        cost.design += Math.max(0, (c.specs || []).length - 1) * 2.4;
      });
    } else {
      var tt = PN.talents.tree(design);
      tt.branches.forEach(function () { cost.design += 2.2; cost.art += 1.4 * (0.55 + pv); });
      tt.nodes.forEach(function (n) {
        cost.design += n.kind === 'ability' ? 0.55 : 0.22;
        cost.art += n.kind === 'ability' ? 0.30 * (0.55 + pv) : 0.10;
        cost.eng += n.kind === 'passive' ? 0.18 : 0.04;
      });
    }

    cost.design += design.progression.levelCap * 0.10 +
                   (design.progression.alternateAdvancement ? 8 : 0);

    /* The live calendar. An event is art-led and cheap to engineer,
       which is exactly why studios reach for one. */
    var evc = PN.gameEvents.summary(design).cost;
    ['design', 'art', 'eng', 'qa'].forEach(function (k) { cost[k] += evc[k]; });

    /* Zones, and everything that lives in them. */
    design.zones.forEach(function (z) {
      cost.art += ((z.size / 100) * 9 + (z.artBudget / 100) * 11) * world.artCost * (0.5 + pv);
      cost.design += (z.size / 100) * 3.5 + (z.secrets / 100) * 2.4;
    });
    (design.monsters || []).forEach(function (m) {
      var role = PN.world.ROLE_BY_ID[m.role] || PN.world.ROLE_BY_ID.trash;
      cost.art += (0.9 + (role.xp > 5 ? 1.8 : 0)) * (0.5 + pv);
      cost.design += 0.35 + (m.abilities || []).length * 0.25;
    });
    (design.questgivers || []).forEach(function (g) {
      /* Voicing is decided per quest, where it is actually recorded.
         Charging for it again on the questgiver was a second bill for
         the same line of dialogue. */
      cost.art += 0.5 * (0.5 + pv);
      cost.design += 0.4;
    });
    (design.quests || []).forEach(function (q) {
      var qm = PN.world.questMetrics(design, q);
      cost.design += qm.cost.design; cost.art += qm.cost.art * (0.5 + pv); cost.eng += qm.cost.eng;
    });

    /* Items and loot. */
    (design.items || []).forEach(function (i) {
      cost.art += (i.kind === 'gear' || i.kind === 'cosmetic' || i.kind === 'mount' ? 0.55 : 0.12) * (0.5 + pv);
      cost.design += 0.10;
    });
    (design.lootTables || []).forEach(function () { cost.design += 0.25; });
    (design.rewards || []).forEach(function () { cost.design += 0.20; });

    /* Recipes are design work: a cost curve, a reagent list, and a place
       to learn it. Ones behind a drop need the loot wiring on top. */
    PN.crafting.recipes(design).forEach(function (r) {
      if (r.enabled === false) return;
      cost.design += 0.45 + (r.inputs || []).length * 0.12;
      cost.eng += r.source === 'looted' ? 0.20 : 0.05;
    });
    var profCount = U.keys((function () {
      var o = {};
      PN.crafting.recipes(design).forEach(function (r) { o[r.profession] = 1; });
      return o;
    })()).length;
    cost.eng += profCount * 1.8;
    cost.art += profCount * 1.2 * (0.5 + pv);

    /* Encounters. */
    design.dungeons.forEach(function (d) {
      cost.design += 4 + (d.lengthMin / 30) * 2.5 + (d.tiers.length - 1) * 2.2 +
                     (d.scaling ? 5 : 0) + (d.affixes ? 4 : 0);
      cost.art += (7 + (d.lengthMin / 30) * 4) * (0.5 + pv) * world.artCost;
      cost.eng += (d.matchmaking ? 3 : 0) + (d.scaling ? 4 : 0);
    });
    design.bosses.forEach(function (b) {
      var bm = bossMetrics(design, b);
      cost.design += 2.5 + bm.mechCount * 0.85 + bm.phases * 1.5;
      cost.art += (3 + (b.spectacleArt / 100) * 7 + bm.phases * 1.2) * (0.5 + pv);
      cost.eng += 1.0 + bm.mechCount * 0.35;
    });

    design.engines.forEach(function (e) {
      if (!e.enabled) return;
      var def = prim.ENGINE_BY_ID[e.id]; if (!def) return;
      var inv = 0.4 + (e.investment / 100) * 0.8;
      cost.design += def.build.design * inv;
      cost.art += def.build.art * inv * (0.5 + pv);
      cost.eng += def.build.eng * inv;
    });

    /* PvP is a whole second game to build and balance. */
    if (design.pvp.enabled) {
      cost.design += 8 + design.pvp.objectiveModes.length * 3;
      cost.art += design.pvp.mapCount * 5 * (0.5 + pv) * world.artCost;
      cost.eng += 10 + (design.pvp.soloQueue ? 5 : 0) + (design.pvp.ccDiminishing ? 3 : 0);
    }

    cost.eng += (design.social.lfgDepth / 100) * 12 + (design.social.crossRealm ? 9 : 0) +
                (design.social.voiceChat ? 7 : 0) + (design.social.guildProgression ? 6 : 0) +
                (design.social.guildFinder ? 4 : 0);
    cost.art += (design.social.guildHalls ? 14 : 0) * (0.5 + pv);
    cost.eng += (design.economy.auctionHouse ? 8 : 0) + (design.economy.gatheringNodes / 100) * 6;
    cost.eng += design.infra.regions * 2.5 + (design.infra.redundancy / 100) * 10 +
                (design.infra.serverTech / 100) * 14;
    cost.eng += (design.monetisation.shop || []).length * 1.1 +
                (design.monetisation.battlePass.enabled ? 7 : 0);
    cost.art += (design.monetisation.shop || []).reduce(function (t, s) {
      var def = prim.SHOP_BY_ID[s.catId];
      return t + (def && def.tags.indexOf('art-hungry') >= 0 ? 6 * (s.prominence / 100) : 1);
    }, 0);
    cost.art += (design.factions.creatorDepth / 100) * 22;

    cost.qa = (cost.design + cost.eng) * 0.30 * (0.8 + para.twitch * 0.5);
    return cost;
  });

  /* ============================================== DESIGN INTEGRITY ======
     Dangling pointers and unfinished wiring, surfaced as a checklist.  */
  function integrity(design) {
    var issues = [];
    function add(sev, what, where) { issues.push({ sev: sev, what: what, where: where }); }

    (design.quests || []).forEach(function (q) {
      PN.world.questIssues(design, q).forEach(function (t) { add('warn', t, 'Quest: ' + q.name); });
    });
    (design.dungeons || []).forEach(function (d) {
      if (!d.zoneId) add('warn', 'Not attached to a zone', 'Dungeon: ' + d.name);
      if (!schema.bossesIn(design, d).length) add('bad', 'Has no bosses', 'Dungeon: ' + d.name);
    });
    (design.bosses || []).forEach(function (b) {
      if (!b.dungeonId) add('bad', 'Not attached to a dungeon - unreachable', 'Boss: ' + b.name);
      if (!b.lootTableId) add('warn', 'Drops nothing', 'Boss: ' + b.name);
      if (!(b.phases || []).length) add('bad', 'Has no phases', 'Boss: ' + b.name);
    });
    /* Races fail quietly in two ways, and both look fine on the
       character screen: a bonus pointing at a stat that has since been
       deleted does nothing at all, and a race that is nobody's best
       pick is a choice with a correct answer that is never it. */
    if ((design.races || []).length) {
      var statIds = {};
      var ss = PN.stats.statSetOf(design);
      ss.primaries.concat(ss.secondaries || []).forEach(function (x) { statIds[x.id] = true; });
      var bestCount = {};
      PN.builds.enumerate(design).forEach(function (b) {
        var r = PN.races.bestFor(design, b);
        if (r) bestCount[r.id] = (bestCount[r.id] || 0) + 1;
      });
      design.races.forEach(function (r) {
        if (!(r.bonuses || []).length) {
          add('warn', 'Has no bonuses - it is a costume', 'Race: ' + r.name);
        }
        (r.bonuses || []).forEach(function (bn) {
          var kind = PN.races.BONUS_BY_ID[bn.kind];
          if (kind && kind.needsStat && !statIds[bn.statId]) {
            add('bad', 'Boosts a stat that no longer exists', 'Race: ' + r.name);
          }
          if (!bn.pct) add('warn', 'A bonus set to zero percent', 'Race: ' + r.name);
        });
        if ((r.bonuses || []).length && !bestCount[r.id]) {
          add('warn', 'No build wants it - nobody informed will roll it', 'Race: ' + r.name);
        }
        if ((r.allow || []).length && !schema.playable(design).filter(function (pl) {
          return r.allow.indexOf(pl.id) >= 0;
        }).length) {
          add('bad', 'Restricted to classes that no longer exist - unplayable',
              'Race: ' + r.name);
        }
      });
    }

    (design.rewardChains || []).forEach(function (c) {
      (c.steps || []).forEach(function (s, i) {
        if (!s.rewardId) add('warn', 'Stage ' + (i + 1) + ' hands out nothing', 'Chain: ' + c.name);
      });
    });
    (design.zones || []).forEach(function (z) {
      if (!PN.world.monstersIn(design, z.id).length) add('warn', 'Has no monsters', 'Zone: ' + z.name);
      if (!PN.world.questsIn(design, z.id).length) add('warn', 'Has no quests', 'Zone: ' + z.name);
    });
    if (design.monetisation.battlePass.enabled &&
        !(design.monetisation.battlePass.tiers || []).length)
      add('bad', 'Battle pass has no tiers', 'Monetisation');

    /* Crafting: a recipe that points at nothing, or one whose page can
       never be found, is a dead tab in the player's profession window. */
    PN.crafting.recipes(design).forEach(function (r) {
      if (r.enabled === false) return;
      PN.crafting.recipeIssues(design, r).forEach(function (t) {
        add(/no longer exists|Makes nothing|Costs nothing|points at it/i.test(t) ? 'bad' : 'warn',
            t, 'Recipe: ' + r.name);
      });
    });

    /* A stat with no gear behind it. Characters gearing for it wear
       whatever the tier offers and the solver stands the stat in, but no
       player can actually chase it - which is what an author who invented
       a stat and has not authored items for it needs told. */
    (function () {
      var prims = PN.stats.statSetOf(design).primaries || [];
      if (prims.length < 2) return;
      var used = {};
      (design.items || []).forEach(function (i) {
        if (i.kind !== 'gear') return;
        prims.forEach(function (p) { if ((i.stats || {})[p.id] > 0) used[p.id] = 1; });
      });
      var geared = PN.builds.enumerate(design);
      prims.forEach(function (p) {
        if (used[p.id]) return;
        var wanted = geared.some(function (b) { return b.buildStat === p.id; });
        add(wanted ? 'bad' : 'warn',
            'No gear in the catalogue carries it' +
            (wanted ? ' - builds gear for it and cannot' : ''),
            'Stat: ' + p.name);
      });
    })();

    /* An item nothing gives out is content you paid to make and no
       player will ever see. Gear you deliberately keep off the vendor is
       fine - as long as it drops, or is crafted, or is a quest reward
       somewhere. */
    (design.items || []).forEach(function (it) {
      if (!PN.items.isOrphan(design, it)) return;
      add(it.kind === 'gear' ? 'bad' : 'warn',
          'Nothing gives this to anyone - no drop, reward, recipe or vendor',
          'Item: ' + it.name);
    });
    PN.crafting.orphanRecipeItems(design).forEach(function (it) {
      add('warn', 'A recipe item nothing teaches - it drops and does nothing',
          'Item: ' + it.name);
    });
    if (PN.talents.isTalentMode(design)) {
      PN.talents.treeIssues(design).forEach(function (t) { add('bad', t, 'Talent tree'); });
    } else {
      (design.classes || []).forEach(function (c) {
        if (!(c.abilities || []).length) add('bad', 'Has no abilities', 'Class: ' + c.name);
      });
    }

    return {
      issues: issues,
      bad: issues.filter(function (i) { return i.sev === 'bad'; }).length,
      warn: issues.filter(function (i) { return i.sev === 'warn'; }).length
    };
  }

  PN.metrics = {
    classMetrics: classMetrics, bossMetrics: bossMetrics, clearChance: clearChance,
    dungeonMetrics: dungeonMetrics, questlineMetrics: questlineMetrics,
    rewardChainMetrics: rewardChainMetrics, contentInventory: contentInventory,
    engineOutput: engineOutput, balanceState: balanceState, buildCost: buildCost,
    integrity: integrity
  };
})(PN);
