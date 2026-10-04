/* Patch Notes - axis scoring.
   Turns a design (plus live runtime state) into the ten need-axis values
   that cohorts judge the game on.

   Every contribution is recorded as a labelled part, so the UI can show
   the player exactly why an axis moved. That traceability is the point.  */
(function (PN) {
  'use strict';
  var U = PN.util, prim = PN.prim, met = PN.metrics, tax = PN.tax;

  function Axis(base, baseLabel) {
    this.parts = [];
    this.value = 0;
    if (base) this.add(baseLabel || 'Baseline', base);
  }
  Axis.prototype.add = function (label, delta) {
    if (!delta || Math.abs(delta) < 0.05) return this;
    this.parts.push({ label: label, delta: delta });
    this.value += delta;
    return this;
  };
  Axis.prototype.done = function () {
    this.parts.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    this.raw = this.value;
    this.value = U.clamp100(this.value);
    return this;
  };

  function compute(design, ctx) {
    ctx = ctx || {};
    var rt = ctx.runtime || {};
    var era = ctx.era || tax.eraForYear(design.meta.startYear);
    var coh = ctx.coherence || PN.coherence.evaluate(design);
    var bal = ctx.balance || met.balanceState(design);
    var inv = ctx.inventory || met.contentInventory(design);
    var eng = ctx.engines || met.engineOutput(design);

    var para = prim.find(prim.COMBAT_PARADIGMS, design.identity.combat);
    var world = prim.find(prim.WORLD_STRUCTURES, design.identity.world);
    var death = prim.find(prim.DEATH_PENALTIES, design.identity.deathPenalty);
    var roleSys = prim.find(prim.ROLE_SYSTEMS, design.identity.roleSystem);
    var progModel = prim.find(prim.PROGRESSION_MODELS, design.progression.model);
    var bizModel = prim.find(prim.BUSINESS_MODELS, design.monetisation.model);

    var P = design.progression, G = design.gearing, S = design.social,
        M = design.monetisation, E = design.economy, L = design.liveOps;

    var classMs = PN.schema.playable(design)
                                .map(function (c) { return met.classMetrics(design, c); });
    var bossMs = design.bosses.map(function (b) { return met.bossMetrics(design, b); });
    var chainMs = design.rewardChains.map(function (c) { return met.rewardChainMetrics(design, c); });

    var hasEngine = function (id) { return PN.schema.hasEngine(design, id); };
    var engInv = function (id) { return PN.schema.engineInvestment(design, id); };

    var craft = PN.crafting.summary(design);
    var A = {};

    /* ------------------------------------------------------ PROGRESSION */
    (function () {
      var a = new Axis(16, 'Baseline');
      a.add('Vertical power growth', P.verticalRatio * 0.26 * progModel.vertical * 1.25);
      if (P.model !== 'rank') a.add('Level cap depth', U.saturate(P.levelCap, 52) * 13);
      else a.add('Ranked ladder', 17);
      if (chainMs.length) a.add('Reward chains', U.avg(chainMs, function (c) { return c.pull; }) * 0.17);
      a.add('Gear treadmill', G.resetSeverity * 0.11 * progModel.vertical);
      if (G.upgradeTrack) a.add('Upgrade tracks', 6);
      if (G.borrowedPower) a.add('Borrowed power systems', 5);
      if (G.legendaryChains) a.add('Legendary questlines', 6);
      if (P.alternateAdvancement) a.add('Alternate advancement', 8);
      if (P.prestige) a.add('Prestige levels', 5);
      a.add('Account-wide progress', P.accountWide * 0.05);
      a.add('Catch-up mechanics', P.catchUp * 0.04);
      /* Rewards that actually exist are the ladder players can see. */
      var questsWithRewards = (design.quests || []).filter(function (q) { return q.rewardId; }).length;
      a.add('Quests that pay out', U.saturate(questsWithRewards, 26) * 13);
      var lootyBosses = (design.bosses || []).filter(function (b) { return b.lootTableId; }).length;
      a.add('Bosses that drop loot', U.saturate(lootyBosses, 8) * 11);
      if (hasEngine('reputation')) a.add('Reputation grinds', engInv('reputation') * 8);
      if (hasEngine('keystone')) a.add('Keystone ladder', engInv('keystone') * 7);
      if (hasEngine('creatureSystem')) a.add('Roster progression', engInv('creatureSystem') * 9);
      /* Crafted gear is a second ladder, but only as high as parity lets
         it climb. Recipes you have to find are a chase in themselves. */
      if (craft.makesGear) {
        a.add('Crafted gear ladder',
              U.saturate(craft.makesGear, 14) * 9 * (0.25 + (craft.parity / 100) * 1.3));
      }
      if (craft.looted) a.add('Recipes worth hunting for', U.saturate(craft.looted, 10) * 7);
      if (P.model === 'horizontal') a.add('Horizontal design (no ladder to climb)', -12);
      A.progression = a.done();
    })();

    /* --------------------------------------------------------- CHALLENGE */
    (function () {
      var a = new Axis(12, 'Baseline');
      if (bossMs.length) {
        var hardest = Math.max.apply(null, bossMs.map(function (b) { return b.difficulty; }).concat([0]));
        a.add('Encounter difficulty', U.avg(bossMs, function (b) { return b.difficulty; }) * 0.22);
        a.add('Hardest encounter', hardest * 0.13);
      }
      var topTier = 0;
      design.dungeons.forEach(function (d) {
        (d.tiers || []).forEach(function (t) { topTier = Math.max(topTier, PN.schema.tierById(t).prestige); });
      });
      a.add('Difficulty tiers offered', topTier * 11);
      a.add('Death penalty', death.harsh * 0.16);
      a.add('Combat skill floor', (100 - para.access) * 0.14);
      if (classMs.length) a.add('Class skill floor', U.avg(classMs, function (c) { return c.skillFloor; }) * 0.10);
      if (hasEngine('openPvp')) a.add('Open-world PvP', engInv('openPvp') * 11);
      if (hasEngine('arena')) a.add('Ranked arena', engInv('arena') * 7);
      if (hasEngine('raidTiers')) a.add('Raid tiers', engInv('raidTiers') * 6);
      if (design.pvp && design.pvp.enabled) {
        var pvpm = PN.pvp.seasonMetrics(design);
        a.add('Ranked PvP season', U.saturate(pvpm.hours, 26) * 9);
      }
      /* Derived from the authored kits, not asserted by a slider. */
      var cm = ctx.combat || PN.combat.derivedCombatMath(design);
      if (!cm.empty && cm.ttkPvp > 0)
        a.add('Time-to-kill pressure (PvP)', U.clamp(25 - cm.ttkPvp, -6, 10) * 0.8);
      if (P.levelScaling) a.add('Level scaling keeps content relevant', 4);
      A.challenge = a.done();
    })();

    /* ----------------------------------------------------- ACCESSIBILITY */
    (function () {
      var a = new Axis(26, 'Baseline');
      a.add('Combat pick-up-and-play', para.access * 0.20);
      a.add('Group finder', S.lfgDepth * 0.20);
      if (S.crossRealm) a.add('Cross-realm play', 6);
      a.add('Catch-up mechanics', P.catchUp * 0.17);
      if (P.levelScaling) a.add('Level scaling', 8);
      if (S.mentoring || P.mentoring) a.add('Mentoring', 5);
      a.add('Death penalty', -death.harsh * 0.24);
      a.add('Alt friction', -P.altFriction * 0.11);
      a.add('Respec friction', -P.respecFriction * 0.05);
      a.add('Session length demand', U.clamp((110 - design.identity.sessionTargetMin) * 0.09, -12, 10));
      a.add('Grind intensity', -eng.grindIntensity * 0.19);
      if (P.model !== 'rank') {
        a.add('Time to reach cap', -U.clamp(U.saturate(P.timeToCapHours, 130) * 17 - 5, -5, 17));
        a.add('XP curve steepness', -P.xpSteepness * 0.055);
      }
      a.add('Role queue friction', -roleSys.groupFriction * 9);
      if (design.factions.count > 1 && !design.factions.crossFactionPlay)
        a.add('Faction-locked grouping', -design.factions.count * 2.2);
      a.add('Era grind tolerance', (era.toleranceGrind - 1) * 16);
      A.accessibility = a.done();
    })();

    /* ---------------------------------------------------------- MASTERY */
    (function () {
      var a = new Axis(8, 'Baseline');
      a.add('Combat paradigm ceiling', para.mastery * 0.32);
      if (classMs.length) {
        a.add('Class skill ceilings', U.avg(classMs, function (c) { return c.skillCeiling; }) * 0.22);
        a.add('Rotation depth', U.avg(classMs, function (c) { return c.rotationDepth; }) * 0.07);
        a.add('Button bloat', -U.avg(classMs, function (c) { return c.bloat; }) * 1.4);
      }
      if (bossMs.length) a.add('Encounter execution demand', U.avg(bossMs, function (b) { return b.execution; }) * 0.13);
      a.add('Balance quality', (bal.quality - 50) * 0.13);
      /* Under a talent system this is measured off the tree you actually
         authored, rather than claimed by a slider. */
      if (PN.talents.isTalentMode(design)) {
        var tm = PN.talents.treeMetrics(design);
        a.add('Meaningful talent choices', (100 - tm.fillerRatio) * 0.055);
        a.add('Builds worth arguing about', tm.diversity * 0.09);
        if (tm.reach > 90) a.add('Tree has no real choices', -6);
      } else {
        a.add('Spec choice per class', U.avg(design.classes, function (c) {
          return Math.min((c.specs || []).length, 4);
        }) * 1.6);
      }
      if (hasEngine('arena')) a.add('Ranked arena', engInv('arena') * 10);
      if (hasEngine('keystone')) a.add('Keystone leaderboards', engInv('keystone') * 6);
      /* Enormous crit bonuses make outcomes swingy, which reads as luck
         rather than skill.                                            */
      /* Professions are a second thing to get good at, if there is enough
         of one to be good at. */
      if (craft.professions > 1) a.add('Professions to master', U.saturate(craft.recipes, 24) * 5);
      var critBonus = PN.stats.statSetOf(design).critBonus;
      if (critBonus > 140) a.add('Swingy crit damage', -(critBonus - 140) * 0.06);
      A.mastery = a.done();
    })();

    /* ----------------------------------------------------------- SOCIAL */
    (function () {
      var a = new Axis(10, 'Baseline');
      a.add('World density', (world.density - 1) * 22 + 8);
      a.add('Guild size', U.saturate(S.guildSize, 60) * 9);
      if (S.guildPerks) a.add('Guild perks', 4);
      if (S.guildProgression || hasEngine('guildProgression')) a.add('Guild progression', 11);
      if (S.voiceChat) a.add('Voice chat', 5);
      a.add('Community tools', S.communityTools * 0.10);
      /* Group finder is a genuine double-edge: convenience up, community down. */
      a.add('Group finder convenience', S.lfgDepth * 0.14);
      if (S.lfgDepth > 65) a.add('Anonymous matchmaking erodes server community', -(S.lfgDepth - 65) * 0.38);
      if (S.crossRealm) a.add('Cross-realm dilutes server identity', -7);
      a.add('Role interdependence', roleSys.clarity * 13);
      a.add('Group content demand', design.dungeons.length ? U.avg(design.dungeons, function (d) { return U.saturate(d.groupSize, 12) * 14; }) : 0);
      if (hasEngine('raidTiers')) a.add('Raid tiers bind guilds together', engInv('raidTiers') * 12);
      if (hasEngine('worldBoss')) a.add('World bosses gather crowds', engInv('worldBoss') * 6);
      if (hasEngine('housing')) a.add('Housing neighbourhoods', engInv('housing') * 5);
      if (hasEngine('openPvp')) a.add('Territory politics', engInv('openPvp') * 7);
      if (S.guildHalls) a.add('Guild halls', 7);
      if (S.guildFinder) a.add('Guild finder', 5);
      /* Questgivers are how a world feels populated rather than empty. */
      a.add('Named NPCs in the world', U.saturate((design.questgivers || []).length, 12) * 6);
      /* Being the person on the server who can make the thing is one of
         the oldest social hooks in the genre - but only if the things
         can change hands. */
      if (craft.recipes && E.tradingEnabled) {
        a.add('Crafters other people need',
              U.saturate(craft.professions, 6) * 7 + U.saturate(craft.looted, 8) * 4);
      } else if (craft.recipes) {
        a.add('Crafting nobody can trade', -4);
      }
      if (design.identity.world === 'session') a.add('Match-based structure', -14);
      A.social = a.done();
    })();

    /* --------------------------------------------------------- IDENTITY */
    (function () {
      var a = new Axis(6, 'Baseline');
      a.add('Character creator depth', design.factions.creatorDepth * 0.25);
      if (classMs.length) a.add('Class fantasy clarity', U.avg(classMs, function (c) { return c.fantasyClarity; }) * 0.17);
      a.add(PN.talents.isTalentMode(design) ? 'Talent branch count' : 'Class count',
            Math.min(PN.schema.playable(design).length, 14) * 1.2);
      if (hasEngine('collections')) a.add('Cosmetic collections', engInv('collections') * 16);
      if (hasEngine('housing')) a.add('Housing', engInv('housing') * 15);
      if (hasEngine('creatureSystem')) a.add('Creature roster identity', engInv('creatureSystem') * 10);
      if (hasEngine('achievements')) a.add('Titles and achievements', engInv('achievements') * 5);
      a.add('Production values', design.identity.productionValue * 0.10);
      /* Cosmetics you actually authored, not a slider claiming they exist. */
      var cosmetics = (design.items || []).filter(function (i) {
        return i.kind === 'cosmetic' || i.kind === 'mount';
      }).length;
      a.add('Authored cosmetics and mounts', U.saturate(cosmetics, 16) * 14);
      if (chainMs.length) {
        var idPayoff = U.sum(chainMs, function (c) { return c.axes.identity || 0; });
        a.add('Identity reward chains', U.saturate(idPayoff, 90) * 9);
      }
      if (P.model === 'rank' || design.identity.world === 'session')
        a.add('Fixed kits limit self-expression', -8);
      A.identity = a.done();
    })();

    /* --------------------------------------------------------- FAIRNESS */
    (function () {
      var a = new Axis(bizModel.fairness, 'Business model: ' + bizModel.name);
      a.add('Balance quality', (bal.quality - 55) * 0.30);
      a.add('Class representation skew', -bal.repGini * 34);

      (M.shop || []).forEach(function (s) {
        if (!s.enabled) return;
        var def = prim.SHOP_BY_ID[s.catId]; if (!def) return;
        a.add('Shop: ' + def.name, -def.fairCost * (0.25 + (s.prominence / 100) * 0.75) * 0.30);
      });
      if (M.battlePass.enabled) {
        var bp = M.battlePass;
        a.add('Battle pass FOMO', -bp.fomo * 0.09);
        /* A free track that hands out nothing is what people mean when
           they say a pass is greedy.                                */
        var freeValue = U.sum(bp.tiers || [], function (t) {
          return PN.items.rewardValue(design, PN.items.rewardById(design, t.freeRewardId));
        });
        a.add('Battle pass free track', U.saturate(freeValue, 260) * 16);
        if (!(bp.tiers || []).length) a.add('Battle pass has no tiers', -18);
        if (bp.grindHoursPerWeek > 8) a.add('Battle pass grind', -(bp.grindHoursPerWeek - 8) * 1.9);
        if (bp.carryover) a.add('Pass carryover', 4);
        if (bp.catchUp > 50) a.add('Pass catch-up', (bp.catchUp - 50) * 0.07);
      }
      /* Bad-luck protection is set per loot table, so the fairness a
         player feels is the average of the tables they farm - not a
         separate global number saying what you wish it were. */
      var blpTables = (design.lootTables || []);
      if (blpTables.length) {
        a.add('Bad-luck protection',
              (U.avg(blpTables, function (t) { return t.badLuckProtection || 0; }) - 40) * 0.09);
      }
      a.add('Anti-cheat investment', L.antiCheatSpend * 0.09);
      a.add('Anti-RMT investment', E.antiRmtSpend * 0.06);
      a.add('Moderation', L.moderationSpend * 0.05);
      if (rt.botPressure) a.add('Bot and gold-seller infestation', -rt.botPressure * 0.30);
      if (rt.exploitPressure) a.add('Unfixed exploits', -rt.exploitPressure * 0.28);
      a.add('Era tolerance for monetisation', (era.monetTolerance - 0.6) * 26);
      if (design.identity.world === 'session' || hasEngine('arena'))
        a.add('Competitive scene raises the bar on fairness', -6);
      if (ctx.economy && ctx.economy.fairness) a.add('Economy imbalance', ctx.economy.fairness);
      /* PvP balance is judged separately and far more harshly. */
      if (design.pvp && design.pvp.enabled) {
        var lad = PN.pvp.ladder(design);
        if (!lad.empty) {
          a.add('PvP ladder balance', (lad.quality - 55) * 0.26);
          if (design.pvp.gearPower > 45)
            a.add('Gear decides PvP matches', -(design.pvp.gearPower - 45) * 0.22);
        }
      }
      A.fairness = a.done();
    })();

    /* -------------------------------------------------------- STABILITY */
    (function () {
      var a = new Axis(92, 'Shipped and running');
      a.add('Bugs', -(rt.bugLoad || 0) * 0.55);
      a.add('Technical debt', -(rt.techDebt || 0) * 0.20);
      a.add('Server load / queues', -(rt.queuePressure || 0) * 0.42);
      a.add('Outages', -(rt.outage || 0) * 0.9);
      a.add('Server technology', (design.infra.serverTech - 50) * 0.10);
      a.add('Redundancy', design.infra.redundancy * 0.055);
      a.add('Capacity headroom', U.saturate(design.infra.capacityHeadroom, 45) * 7);
      a.add('Regional coverage', Math.min(design.infra.regions, 6) * 1.6);
      a.add('Latency sensitivity of combat', -para.twitch * 13 * (1 - design.infra.regions / 8));
      a.add('QA via public test realm', L.ptrUse * 0.06);
      a.add('Hotfix speed', L.hotfixSpeed * 0.05);
      a.add('Era tolerance for jank', (era.toleranceBugs - 1) * 20);
      A.stability = a.done();
    })();

    /* ------------------------------------------------------------ VALUE */
    (function () {
      var a = new Axis(34, 'Baseline');
      /* Monthly cost to a paying player, normalised against era norms. */
      var monthly = M.model === 'sub' ? M.subPrice
                  : M.model === 'hybrid' ? M.subPrice + 4
                  : M.model === 'boxExp' ? 4.5
                  : M.battlePass.enabled ? M.battlePass.price / (M.battlePass.seasonWeeks / 4.3) : 3;
      a.add('Price point', U.clamp((13 - monthly) * 1.7, -20, 14));
      if (bizModel.tags.indexOf('f2p') >= 0) a.add('Free to enter', 13);
      if (M.regionalPricing) a.add('Regional pricing', 4);

      var totalHours = U.sum(tax.CATEGORY_IDS, function (c) { return inv[c] || 0; });
      a.add('Content volume', U.saturate(totalHours, 260) * 22);
      a.add('Repeatable systems', U.saturate(U.sum(tax.CATEGORY_IDS, function (c) { return eng.hours[c] || 0; }), 26) * 15);
      a.add('Grind intensity', -eng.grindIntensity * 0.23);
      a.add('Content cadence', U.clamp((16 - L.majorContentWeeks) * 0.55, -12, 9));

      (M.shop || []).forEach(function (s) {
        if (!s.enabled) return;
        var def = prim.SHOP_BY_ID[s.catId]; if (!def) return;
        if (def.tags.indexOf('annoyance-tax') >= 0 || def.tags.indexOf('skip-content') >= 0)
          a.add('Shop: ' + def.name + ' sells back friction', -(s.prominence / 100) * 9);
      });
      if (M.battlePass.enabled) {
        var bp2 = M.battlePass;
        var totalValue = U.sum(bp2.tiers || [], function (t) {
          return PN.items.rewardValue(design, PN.items.rewardById(design, t.freeRewardId)) +
                 PN.items.rewardValue(design, PN.items.rewardById(design, t.premiumRewardId));
        });
        var perPound = totalValue / Math.max(1, bp2.price);
        a.add('Battle pass value for money', U.clamp((perPound - 40) * 0.12, -10, 12));
      }
      a.add('Transparency', L.transparency * 0.07);
      a.add('Communication', L.commsFrequency * 0.05);
      /* A live economy that has run away is felt as poor value long
         before anyone words it that way.                            */
      if (ctx.economy) a.add('Economy: ' + ctx.economy.note, ctx.economy.value);
      if (G.resetSeverity > 70) a.add('Gear resets invalidate last tier', -(G.resetSeverity - 70) * 0.32);
      a.add('Era expectation of polish', -(era.expectation - design.identity.productionValue) * 0.16);
      A.value = a.done();
    })();

    /* Novelty is per-cohort (it depends what each group has already eaten),
       so the design only supplies the capacity for it.                    */
    A.noveltyCapacity = {
      finiteHours: U.sum(tax.CATEGORY_IDS, function (c) { return inv[c] || 0; }),
      engineHours: U.sum(tax.CATEGORY_IDS, function (c) { return eng.hours[c] || 0; }),
      byCategory: inv, engineByCategory: eng.hours
    };

    /* Coherence lifts or caps every axis: an incoherent game feels worse
       than the sum of its parts, and a focused one feels better.        */
    tax.AXIS_IDS.forEach(function (id) {
      if (!A[id]) return;
      var before = A[id].value;
      var after = U.clamp100(50 + (before - 50) * coh.ceilingMult);
      if (Math.abs(after - before) > 0.05) {
        A[id].parts.push({ label: 'Design coherence (' + Math.round(coh.score) + '/100)', delta: after - before });
        A[id].parts.sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta); });
      }
      A[id].value = after;
    });

    A._ctx = { coherence: coh, balance: bal, inventory: inv, engines: eng, era: era };
    return A;
  }

  /* Flat {axisId: value} view for the maths. */
  function values(A) {
    var out = {};
    tax.AXIS_IDS.forEach(function (id) { out[id] = A[id] ? A[id].value : 50; });
    return out;
  }

  /* How appealing this design is to each archetype, before they play it.
     Drives the acquisition mix - who even tries your game.              */
  function archetypeFit(design, A, era) {
    var weight = era && era.designWeight !== undefined ? era.designWeight : 1;
    var vals = values(A);
    var inv = A.noveltyCapacity.byCategory, engH = A.noveltyCapacity.engineByCategory;
    var out = {};

    tax.ARCHETYPES.forEach(function (arch) {
      /* Half the appeal is "do the axes land near what I want".

         Novelty and stability are left out because neither is knowable
         until a game is live and patching - but the weights were not
         renormalised afterwards, so every archetype was scored out of
         however much of its attention was on the other eight axes.
         An explorer puts 36% of theirs on novelty and stability, a
         competitor 14%, which capped the explorer's score at 64 and
         the competitor's at 86 whatever anybody built. The audiences
         that cared most about the two axes nobody could measure were
         the audiences the game could never satisfy. */
      var axisScore = 0, axisW = 0;
      tax.AXIS_IDS.forEach(function (id) {
        if (id === 'novelty' || id === 'stability') return; /* unknown pre-launch */
        var def = tax.AXIS_BY_ID[id], ideal = arch.ideals[id], v = vals[id];
        var gap = v >= ideal ? (v - ideal) * def.over : (ideal - v) * def.under;
        axisScore += arch.weights[id] * U.clamp100(100 - gap);
        axisW += arch.weights[id];
      });
      axisScore = axisW > 0 ? axisScore / axisW : 0;

      /* The other half is "is there anything here I actually want to do". */
      var contentScore = 0, wTotal = 0;
      tax.CATEGORY_IDS.forEach(function (c) {
        var appeal = arch.appeal[c];
        if (appeal < 0.35) return;
        var hours = (inv[c] || 0) + (engH[c] || 0) * 10;
        contentScore += appeal * U.saturate(hours, 40) * 100;
        wTotal += appeal;
      });
      contentScore = wTotal > 0 ? contentScore / wTotal : 0;

      /* And how much a badly built game costs you this decade. Only
         the downside scales, the same way it does for satisfaction:
         being good draws the same people in any era, and what changes
         is whether being poor is forgiven. */
      var raw = U.clamp100(axisScore * 0.58 + contentScore * 0.42);
      out[arch.id] = U.clamp100(100 - (100 - raw) * weight);
    });
    return out;
  }

  PN.axes = { compute: compute, values: values, archetypeFit: archetypeFit, Axis: Axis };
})(PN);
