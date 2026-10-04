/* Patch Notes - the combat solver.
   Given the abilities the player actually wrote and the gear they
   actually designed, work out damage, healing, survivability, and how
   long anything takes to kill. Time-to-kill is an output here, never an
   input.                                                                */
(function (PN) {
  'use strict';
  var U = PN.util, AB = PN.abilities, ST = PN.stats, IT = PN.items;

  /* ==================================================== CHARACTER STATS */

  /* The gear a representative player of this class is wearing. If the
     design has authored gear, use the best piece per slot; otherwise
     synthesise a set at the design's target item level.               */
  /* Best authored item per slot, ignoring absurd outliers so one silly
     piece cannot drag the whole balance model with it.               */
  function bestPerSlot(design, primaryId) {
    var s = ST.statSetOf(design);
    var allPrimaries = s.primaries.map(function (p) { return p.id; });
    var authored = (design.items || []).filter(function (i) {
      if (i.kind !== 'gear' || !i.slot) return false;
      if (!primaryId) return true;
      /* A class can only wear gear carrying its own primary stat - or
         gear that carries none at all, like a neck or a trinket.    */
      var hasMine = (i.stats || {})[primaryId] > 0;
      var hasOther = allPrimaries.some(function (p) {
        return p !== primaryId && (i.stats || {})[p] > 0;
      });
      return hasMine || !hasOther;
    });
    if (!authored.length) return { bySlot: {}, median: 0, covered: 0 };

    function pick(list) {
      var out = {};
      list.forEach(function (i) {
        /* A ring fills either finger, so an item authored for a family
           is offered to every physical slot in that family. */
        ST.slotsFor(i.slot).forEach(function (slotId) {
          var cur = out[slotId];
          if (!cur || i.itemLevel > cur.itemLevel ||
              (i.itemLevel === cur.itemLevel &&
               ST.budgetUsed(design, i) > ST.budgetUsed(design, cur))) out[slotId] = i;
        });
      });
      return out;
    }
    function medianOf(map) {
      var lv = U.keys(map).map(function (k) { return map[k].itemLevel; })
        .sort(function (a, b) { return a - b; });
      return lv.length ? lv[Math.floor(lv.length / 2)] : 0;
    }

    var first = pick(authored);
    var med = medianOf(first);
    /* Second pass: anything more than 2.5x the median is not a tier,
       it is a mistake or a joke item.                              */
    var sane = authored.filter(function (i) { return med <= 0 || i.itemLevel <= med * 2.5; });
    var bySlot = pick(sane);
    return { bySlot: bySlot, median: medianOf(bySlot), covered: U.keys(bySlot).length };
  }

  function referenceGear(design, opts) {
    opts = opts || {};
    var cap = (design.progression && design.progression.levelCap) || 60;
    var ilvl = opts.itemLevel || targetItemLevel(design);
    var bySlot = bestPerSlot(design, opts.primary).bySlot;

    var stats = {}, filled = 0, unstatted = 0;
    var s = ST.statSetOf(design);
    var primary = (opts.primary || (s.primaries[0] || {}).id);
    ST.GEAR_SLOTS.forEach(function (slot) {
      var item = bySlot[slot.id];
      if (item) {
        filled++;
        U.keys(item.stats || {}).forEach(function (k) {
          stats[k] = (stats[k] || 0) + item.stats[k];
        });
        /* The catalogue may have nothing in this slot carrying this
           build's stat - most often because the author invented a stat
           and has not authored gear for it yet. A player in that position
           does not walk around with no main stat; they wear whatever the
           tier offers. So stand in the primary this slot would carry,
           and count it, so the design can be told the gear is missing.

           On a catalogue where every piece carries a primary this never
           fires, so no existing design's numbers move. */
        if (primary && !((item.stats || {})[primary] > 0)) {
          var b = ST.itemBudget(design, ilvl, item.rarity || 'epic', slot.id);
          stats[primary] = (stats[primary] || 0) + b * 0.38 / ST.COST.primary;
          unstatted++;
        }
      } else {
        /* Synthetic placeholder at the target item level. */
        var budget = ST.itemBudget(design, ilvl, 'epic', slot.id);
        stats[primary] = (stats[primary] || 0) + budget * 0.38 / ST.COST.primary;
        stats[s.stamina.id] = (stats[s.stamina.id] || 0) + budget * 0.30 / ST.COST.stamina;
        var per = s.secondaries.length ? (budget * 0.32) / s.secondaries.length : 0;
        s.secondaries.forEach(function (x) { stats[x.id] = (stats[x.id] || 0) + per; });
        if (slot.armour) stats[s.armour.id] = (stats[s.armour.id] || 0) + budget * 0.9 / ST.COST.armour;
      }
    });
    return { stats: stats, itemLevel: ilvl, authoredSlots: filled,
             /* Slots where the catalogue had nothing carrying this stat. */
             slotsWithoutStat: unstatted, level: cap };
  }

  /* Where the gear treadmill currently sits. If the design has authored
     a real tier, that IS the current tier - the formula below is only a
     fallback for a design with no gear in it yet, and it works off the
     level cap rather than the ilvlBands number it used to read, which
     was a second way of saying the same thing. */
  function targetItemLevel(design) {
    var best = bestPerSlot(design);
    if (best.covered >= 8 && best.median > 0) return best.median;
    var cap = (design.progression && design.progression.levelCap) || 60;
    return Math.round(cap * 2.3);
  }

  /* Which primary stat a class actually wants. The author can set it
     explicitly; otherwise it is derived from the kit they wrote.

     Every stat is scored on the share of the kit's output it actually
     drives - an ability naming Dexterity credits Dexterity and nothing
     else, an ability saying only "attack power" credits every
     attack-power stat. Ties go to the stat whose role list names this
     class most specifically, which is how Strength ends up on the tank
     and Dexterity on the rogue when both could serve. */
  function primaryFor(design, cls) {
    var s = ST.statSetOf(design);
    if (!s.primaries.length) return null;
    if (cls && cls.primaryStat) {
      for (var i = 0; i < s.primaries.length; i++)
        if (s.primaries[i].id === cls.primaryStat) return s.primaries[i];
    }
    var split = AB.statSplit(design, AB.abilitiesOf(design, cls));
    var role = cls ? cls.role : 'dps';
    var scored = s.primaries.map(function (p) {
      return { p: p, share: split.shareOf(p),
               named: (p.roles || []).indexOf(role) >= 0 ? 1 : 0,
               spread: (p.roles || []).length };
    });
    scored.sort(function (a, b) {
      if (Math.abs(a.share - b.share) > 0.001) return b.share - a.share;
      if (a.named !== b.named) return b.named - a.named;
      return a.spread - b.spread;
    });
    return scored[0].p;
  }

  /* Aggregate a playable character: stats, power, health, percentages. */
  function characterProfile(design, cls, opts) {
    opts = opts || {};
    var s = ST.statSetOf(design);
    var level = (design.progression && design.progression.levelCap) || 60;

    var primary = primaryFor(design, cls);
    var gear = referenceGear(design, U.merge({ primary: primary.id }, opts));
    var st = gear.stats;

    /* A compiled talent build carries percentage bonuses onto stats. They
       land on the gear-derived numbers, so authoring a fat stat branch
       really does show up in the solver's damage.                      */
    var tStats = (cls && cls.talentStats) || {};
    U.keys(tStats).forEach(function (k) {
      if (st[k] !== undefined) st[k] = st[k] * (1 + tStats[k] / 100);
    });
    var mods = (cls && cls.talentMods) || {};

    /* Power from EVERY primary stat, not just the one this build gears.

       An ability names the stat it scales off, so a Dexterity dagger in a
       Strength character's hands has to actually be worse - and with two
       attack-power stats in the set, "attack power" alone cannot tell
       them apart. How much worse is the gear they are not wearing.

       You still get something off a stat you did not stack: your level
       curve, plus the generic power sitting on the gear you do wear. The
       0.38 there reproduces the flat 0.42 off-stat multiplier this used
       to apply, so balance in existing designs does not move - but it is
       now per character and per stat rather than one hidden constant. */
    var OFF_STAT_GEAR = 0.38;
    var baseCurve = s.basePower + s.powerPerLevel * level;
    var primaryGear = st[primary.id] || 0;
    var statPower = {};
    s.primaries.forEach(function (p) {
      var own = st[p.id] || 0;
      var borrowed = p.id === primary.id ? 0 : primaryGear * OFF_STAT_GEAR;
      statPower[p.id] = (baseCurve + own + borrowed) * s.powerPerPrimary;
    });

    /* The loose form - "any attack-power stat" - takes the best this
       character actually has, which is their own stat when it matches. */
    function bestPower(kind) {
      var best = 0;
      s.primaries.forEach(function (p) {
        var pw = p.powers || 'both';
        if (pw === kind || pw === 'both') best = Math.max(best, statPower[p.id]);
      });
      return best || baseCurve * s.powerPerPrimary;
    }
    var attackPower = bestPower('attack');
    var spellPower = bestPower('spell');

    var health = s.baseHealth + s.healthPerLevel * level +
                 (st[s.stamina.id] || 0) * s.stamina.healthPerPoint;
    health *= 1 + (mods.hp || 0) / 100;

    var pct = {};
    s.secondaries.forEach(function (x) {
      pct[x.kind] = ST.ratingToPct(design, x, st[x.id] || 0, level);
    });
    var armourReduction = ST.armourToReduction(design, st[s.armour.id] || 0, level);
    /* Mitigation talents read as extra armour, because that is what a
       player sees when the incoming numbers get smaller. */
    armourReduction = 1 - (1 - armourReduction) * (1 - (mods.mit || 0) / 100);

    return {
      level: level, primary: primary, stats: st, itemLevel: gear.itemLevel,
      authoredSlots: gear.authoredSlots, slotsWithoutStat: gear.slotsWithoutStat,
      attackPower: attackPower, spellPower: spellPower, statPower: statPower,
      health: health,
      crit: (pct.crit || 0) / 100,
      haste: (pct.haste || 0) / 100,
      mastery: (pct.mastery || 0) / 100,
      versatility: (pct.versatility || 0) / 100,
      leech: (pct.leech || 0) / 100,
      avoidance: (pct.avoidance || 0) / 100,
      regen: (pct.regen || 0) / 100,
      armourReduction: armourReduction,
      critBonus: s.critBonus / 100,
      /* Passed through so the solver can apply them where they belong. */
      dmgMod: 1 + (mods.dmg || 0) / 100,
      healMod: 1 + (mods.heal || 0) / 100,
      resMod: 1 + (mods.res || 0) / 100,
      cdrMod: 1 / (1 + (mods.cdr || 0) / 100),
      threatMod: 1 + (mods.threat || 0) / 100,
      moveMod: 1 + (mods.move || 0) / 100
    };
  }

  /* ========================================================== TARGETS */

  /* ttk is the SECONDS a notional baseline character is meant to need.
     Real time-to-kill comes out of the solver and will be shorter or
     longer depending on how good the authored kit actually is - that
     feedback is the whole point.                                      */
  var TARGET_KINDS = [
    { id: 'trash',  name: 'Trash mob',  ttk: 4,   dmg: 0.55, armour: 0.75, group: false },
    { id: 'elite',  name: 'Elite',      ttk: 20,  dmg: 1.15, armour: 1.00, group: false },
    { id: 'rare',   name: 'Rare',       ttk: 38,  dmg: 1.30, armour: 1.05, group: false },
    { id: 'dungeonBoss', name: 'Dungeon boss', ttk: 95,  dmg: 2.20, armour: 1.15, group: true },
    { id: 'raidBoss',    name: 'Raid boss',    ttk: 330, dmg: 3.40, armour: 1.25, group: true },
    { id: 'player', name: 'Player',     ttk: 18,  dmg: 1.0,  armour: 1.0,  group: false }
  ];
  var TARGET_BY_ID = {};
  TARGET_KINDS.forEach(function (t) { TARGET_BY_ID[t.id] = t; });

  /* The power a baseline character has at this level and gear tier,
     independent of what abilities the player wrote. Monster health is
     pinned to this, so authoring a stronger kit really does kill things
     faster.                                                           */
  function referencePower(design, level) {
    var s = ST.statSetOf(design);
    var ilvl = targetItemLevel(design);
    var budget = 0;
    ST.GEAR_SLOTS.forEach(function (slot) {
      budget += ST.itemBudget(design, ilvl, 'epic', slot.id);
    });
    var primary = (budget * 0.38) / ST.COST.primary;
    return (primary + s.basePower + s.powerPerLevel * level) * s.powerPerPrimary;
  }
  function referenceDps(design, level) { return referencePower(design, level) * 1.2; }

  function targetProfile(design, opts) {
    opts = opts || {};
    var kind = TARGET_BY_ID[opts.kind] || TARGET_BY_ID.elite;
    var level = opts.level || (design.progression && design.progression.levelCap) || 60;
    var groupSize = opts.groupSize || 1;
    var refDps = referenceDps(design, level);

    /* Group content is tuned against the damage share of the group it
       is built for, not against one player.                          */
    var share = kind.group ? Math.max(1, groupSize * 0.66) : 1;
    var hp = refDps * kind.ttk * share;

    return {
      kind: kind.id, name: kind.name, level: level,
      health: hp,
      damage: refDps * 0.16 * kind.dmg,
      armourReduction: U.clamp01(0.28 * kind.armour),
      groupSize: groupSize, referenceDps: refDps
    };
  }


  /* How much power this character brings to this particular ability.

     An ability may name one of the design's own primary stats, in which
     case that stat and no other decides the number - which is the whole
     point of being able to have both Strength and Dexterity. The loose
     forms fall back to the best stat of that power class. */
  function statPowerFor(design, ab, profile) {
    var ref = AB.scalingRef(design, ab);
    if (ref.stat && profile.statPower && profile.statPower[ref.stat] !== undefined) {
      return profile.statPower[ref.stat];
    }
    if (ref.stat) return profile.attackPower;   /* stat vanished under us */
    return ref.power === 'spell' ? profile.spellPower : profile.attackPower;
  }

  /* ===================================================== ABILITY VALUES
     What one cast is worth against a given target, with this profile. */
  function castValue(design, ab, profile, target, mode) {
    var school = AB.SCHOOL_BY_ID[ab.school] || AB.SCHOOL_BY_ID.physical;
    /* The school decides what mitigates this - armour or resistance. Which
       stat drives the number is a separate question the ability answers by
       name, so a Dexterity dagger and a Strength greatsword are different
       weapons on the same character rather than the same one twice. */
    var power = statPowerFor(design, ab, profile);
    var mitig = school.mitigatedBy === 'armour' ? (target ? target.armourReduction : 0) : 0;
    var critMult = 1 + profile.crit * profile.critBonus;
    var versMult = 1 + profile.versatility * 0.5;
    var targets = Math.max(1, Math.min(ab.maxTargets || 1, mode === 'aoe' ? (ab.maxTargets || 1) : 1));

    var v = { damage: 0, healing: 0, threat: 0, absorb: 0, mitigationValue: 0,
              controlSeconds: 0, hardControl: 0, mobility: 0, support: 0, summonDps: 0 };
    var threatMult = 1;

    (ab.effects || []).forEach(function (e) {
      switch (e.type) {
        case 'damage': {
          var d = ((e.base || 0) + (e.coef || 0) * power) * critMult * versMult * (1 - mitig);
          v.damage += d * targets;
          break;
        }
        case 'dot': {
          var ticks = Math.max(1, Math.floor((e.duration || 0) / Math.max(0.5, e.interval || 1)));
          var dt = ((e.base || 0) + (e.coef || 0) * power) * critMult * versMult * (1 - mitig);
          v.damage += dt * ticks * targets;
          break;
        }
        case 'execute':
          /* Only live for part of the fight; worth roughly threshold share. */
          v.damage *= 1 + ((e.bonusPct || 0) / 100) * ((e.threshold || 20) / 100);
          break;
        case 'heal':
          v.healing += ((e.base || 0) + (e.coef || 0) * power) * critMult * versMult * targets;
          break;
        case 'hot': {
          var ht = Math.max(1, Math.floor((e.duration || 0) / Math.max(0.5, e.interval || 1)));
          v.healing += ((e.base || 0) + (e.coef || 0) * power) * critMult * versMult * ht * targets;
          break;
        }
        case 'absorb':
          v.absorb += ((e.base || 0) + (e.coef || 0) * power) * versMult * targets;
          v.healing += ((e.base || 0) + (e.coef || 0) * power) * versMult * targets * 0.9;
          break;
        case 'threat': threatMult = Math.max(threatMult, e.mult || 1); break;
        case 'taunt': v.threat += 1; break;
        case 'mitigate':
          v.mitigationValue += ((e.pct || 0) / 100) * (e.duration || 0) *
                               (e.target === 'party' ? 3.2 : e.target === 'ally' ? 1.4 : 1);
          break;
        case 'immunity': v.mitigationValue += (e.duration || 0) * 1.0; break;
        case 'avoidance': v.mitigationValue += ((e.pct || 0) / 100) * (e.duration || 0) * 0.6; break;
        case 'stun': case 'fear': v.hardControl += e.duration || 0; break;
        case 'silence': v.hardControl += (e.duration || 0) * 0.8; break;
        case 'root': v.controlSeconds += (e.duration || 0) * 0.7; break;
        case 'slow': v.controlSeconds += (e.duration || 0) * ((e.pct || 0) / 100) * 0.5; break;
        case 'interrupt': v.controlSeconds += (e.lockout || 0) * 0.6; break;
        case 'knockback': v.controlSeconds += 1.5; break;
        case 'mobility':
          v.mobility += (e.distance || 0) * 0.4 + ((e.speedPct || 0) / 100) * (e.duration || 0) * 1.2 +
                        (e.iframes ? 10 : 0);
          break;
        case 'stealth': v.mobility += 12; break;
        case 'cleanse': v.support += (e.count || 1) * 8; break;
        case 'buffDamage':
          v.support += ((e.pct || 0) / 100) * (e.duration || 0) *
                       (e.target === 'party' ? 22 : 8);
          break;
        case 'debuffDamage': v.support += ((e.pct || 0) / 100) * 90; break;
        case 'buffStat': case 'debuffStat':
          v.support += U.saturate(e.amount || 0, 500) * 9 * (e.target === 'party' ? 2 : 1);
          break;
        case 'summon': {
          /* A summon contributes damage over its lifetime. */
          var share = (e.power || 0) / 100;
          var dur = (e.duration || 0) === 0 ? 60 : e.duration;
          v.summonDps += power * 0.55 * share;
          v.damage += power * 0.55 * share * Math.min(dur, 60) * 0.25;
          break;
        }
        case 'resurrect': v.support += 14; break;
        case 'utility': v.support += 5; break;
      }
    });
    /* Talent passives land here, at the end, on the finished numbers. */
    v.damage *= profile.dmgMod === undefined ? 1 : profile.dmgMod;
    v.healing *= profile.healMod === undefined ? 1 : profile.healMod;
    v.absorb *= profile.healMod === undefined ? 1 : profile.healMod;
    v.summonDps *= profile.dmgMod === undefined ? 1 : profile.dmgMod;
    v.mobility *= profile.moveMod === undefined ? 1 : profile.moveMod;
    v.threat = (v.damage * threatMult + v.threat * 4000) *
               (profile.threatMod === undefined ? 1 : profile.threatMod);
    return v;
  }

  /* Time one cast occupies. */
  function execTime(design, ab, profile) {
    var gcd = Math.max(0.75, (design.combatMath.gcd || 1.5) / (1 + profile.haste));
    var cast = Math.max(ab.castTime || 0, ab.channel || 0) / (1 + profile.haste);
    if (!ab.onGcd) return cast;           /* off-GCD: only its own cast time */
    return Math.max(gcd, cast);
  }

  /* ====================================================== THE ROTATION
     A priority solver: fill the available global-cooldown budget with
     the highest value-per-second abilities their cooldowns allow, then
     fill the rest with whatever has no cooldown.                      */
  function solve(design, cls, opts) {
    opts = opts || {};
    var profile = opts.profile || characterProfile(design, cls);
    var target = opts.target || targetProfile(design, { kind: 'elite' });
    var T = opts.window || 120;
    var mode = opts.mode || 'single';
    var metric = opts.metric || 'damage';

    var abs = AB.abilitiesOf(design, cls);
    if (!abs.length) {
      return { dps: 0, hps: 0, tps: 0, casts: [], gcdUsed: 0, gcdTotal: T,
               resourceStarved: false, profile: profile, target: target, empty: true };
    }

    var s = ST.statSetOf(design);
    /* Resource available across the window. Pool and regen scale with
       level so a level-80 kit is not starved by level-10 numbers.    */
    var lvl = profile.level || 60;
    var regenPerSec = (8 + lvl * 0.45) * (1 + profile.regen) * (1 + profile.haste * 0.3);
    var resourcePool = ((100 + lvl * 8) + regenPerSec * T) *
                       (profile.resMod === undefined ? 1 : profile.resMod);

    var entries = abs.map(function (ab) {
      var v = castValue(design, ab, profile, target, mode);
      var t = execTime(design, ab, profile);
      /* Cooldown-recovery talents buy extra casts of the big buttons,
         which is exactly why they are the hardest node to balance. */
      var cd = ab.cooldown * (profile.cdrMod === undefined ? 1 : profile.cdrMod);
      var maxCasts = ab.cooldown > 0
        ? Math.max(1, Math.floor(T / Math.max(0.5, cd)) + (ab.charges || 1) - 1)
        : Infinity;
      var score = metric === 'healing' ? v.healing : v.damage;
      /* Buffs and cooldowns that raise damage are valued via support. */
      var effective = score + v.support * 6 + v.summonDps * 12;
      return {
        ab: ab, v: v, time: t, maxCasts: maxCasts,
        rate: t > 0 ? effective / t : effective * 100,   /* off-GCD is free */
        cost: ab.resourceCost || 0, gain: ab.resourceGain || 0,
        casts: 0, free: t <= 0.001
      };
    });

    /* Off-GCD, zero-cast abilities cost no rotation time. */
    entries.filter(function (e) { return e.free; }).forEach(function (e) {
      e.casts = e.maxCasts === Infinity ? Math.floor(T / 6) : e.maxCasts;
    });

    var pool = T;
    var onGcd = entries.filter(function (e) { return !e.free; })
      .sort(function (a, b) { return b.rate - a.rate; });

    /* Cooldown-limited abilities first, best rate first. */
    onGcd.forEach(function (e) {
      if (e.maxCasts === Infinity) return;
      var want = e.maxCasts;
      var can = Math.floor(pool / e.time);
      e.casts = Math.max(0, Math.min(want, can));
      pool -= e.casts * e.time;
    });

    /* Fillers take whatever is left, best first. */
    var fillers = onGcd.filter(function (e) { return e.maxCasts === Infinity; });
    if (fillers.length && pool > 0) {
      var best = fillers[0];
      best.casts = Math.floor(pool / best.time);
      pool -= best.casts * best.time;
    }

    /* Resource check: if the plan overspends, trim the worst spenders. */
    function spend() {
      return U.sum(entries, function (e) { return e.casts * (e.cost - e.gain); });
    }
    var starved = false, guard = 0;
    while (spend() > resourcePool && guard++ < 200) {
      starved = true;
      var worst = null;
      entries.forEach(function (e) {
        if (e.casts <= 0 || e.cost <= 0) return;
        if (!worst || e.rate < worst.rate) worst = e;
      });
      if (!worst) break;
      worst.casts--;
      pool += worst.time;
    }
    /* Spend any freed time on a cheap filler. */
    if (starved && fillers.length) {
      var cheap = fillers.slice().sort(function (a, b) { return a.cost - b.cost; })[0];
      if (cheap && cheap.cost <= 0) cheap.casts += Math.floor(pool / cheap.time);
    }

    var totalDamage = 0, totalHealing = 0, totalThreat = 0, mitigation = 0,
        control = 0, hardControl = 0, mobility = 0, support = 0, absorb = 0;
    entries.forEach(function (e) {
      totalDamage += e.v.damage * e.casts;
      totalHealing += e.v.healing * e.casts;
      totalThreat += e.v.threat * e.casts;
      absorb += e.v.absorb * e.casts;
      mitigation += e.v.mitigationValue * e.casts;
      control += e.v.controlSeconds * e.casts;
      hardControl += e.v.hardControl * e.casts;
      mobility += e.v.mobility * e.casts;
      support += e.v.support * e.casts;
    });

    return {
      dps: totalDamage / T, hps: totalHealing / T, tps: totalThreat / T,
      absorbPs: absorb / T,
      mitigationUptime: U.clamp01(mitigation / T),
      controlUptime: U.clamp01((control + hardControl) / T),
      hardControlUptime: U.clamp01(hardControl / T),
      mobilityScore: mobility, supportScore: support,
      casts: entries.filter(function (e) { return e.casts > 0; })
        .sort(function (a, b) { return b.casts * b.v.damage - a.casts * a.v.damage; }),
      gcdUsed: T - pool, gcdTotal: T,
      resourceStarved: starved,
      profile: profile, target: target, empty: false
    };
  }

  /* ================================================== CLASS EVALUATION */

  function effectiveHealth(design, cls, profile, sol) {
    var mitig = profile.armourReduction * (cls && cls.role === 'tank' ? 1 : 0.72);
    var active = sol ? sol.mitigationUptime * 0.35 : 0;
    var avoid = profile.avoidance * 0.8;
    var total = U.clamp01(mitig + active + avoid);
    return profile.health / Math.max(0.12, 1 - total);
  }

  /* Everything the balance view and the simulation need about one class. */
  function evaluate(design, cls) {
    var profile = characterProfile(design, cls);
    var elite = targetProfile(design, { kind: 'elite' });
    var raid = targetProfile(design, { kind: 'raidBoss', groupSize: raidSize(design) });
    var player = targetProfile(design, { kind: 'player' });

    var single = solve(design, cls, { profile: profile, target: elite, window: 120 });
    var aoe = solve(design, cls, { profile: profile, target: elite, window: 120, mode: 'aoe' });
    var healSol = solve(design, cls, { profile: profile, target: elite, window: 120, metric: 'healing' });
    /* PvP is a short window: what can you do in one opener? */
    var burst = solve(design, cls, { profile: profile, target: player, window: 12 });

    var ehp = effectiveHealth(design, cls, profile, single);

    /* Against another player, armour matters far less and nobody sits
       in their defensive cooldowns for the whole fight. Twitchier
       combat paradigms also kill faster - that is what they are for. */
    var para = PN.prim.find(PN.prim.COMBAT_PARADIGMS, design.identity.combat);
    var pvpMitigation = U.clamp(profile.armourReduction * 0.40 + profile.avoidance * 0.45 +
                                burst.mitigationUptime * 0.18, 0, 0.28);
    var pvpEhp = profile.health / (1 - pvpMitigation) * (1 - para.twitch * 0.35);

    /* Time to kill things. These are outputs. */
    var ttkSolo = single.dps > 0 ? elite.health / single.dps : Infinity;
    /* Every PvP game in the genre ships a damping knob - resilience,
       expertise, a stat template - because burst that is thrilling
       against a boss is a two-second death against a person.        */
    var damping = 1 - U.clamp((design.pvp && design.pvp.damping) || 0, 0, 85) / 100;
    var ttkPvp = burst.dps > 0 ? pvpEhp / (burst.dps * damping) : Infinity;

    return {
      cls: cls, profile: profile,
      single: single, aoe: aoe, heal: healSol, burst: burst,
      dps: single.dps, aoeDps: aoe.dps, hps: healSol.hps, tps: single.tps,
      ehp: ehp, pvpEhp: pvpEhp, ttkSolo: ttkSolo, ttkPvp: ttkPvp,
      buttons: (cls.abilities || []).length,
      complexity: U.sum(AB.abilitiesOf(design, cls), function (a) { return AB.shape(a).complexity; }),
      mitigationUptime: single.mitigationUptime,
      controlUptime: burst.controlUptime,
      hardControlUptime: burst.hardControlUptime,
      mobility: single.mobilityScore,
      support: single.supportScore,
      resourceStarved: single.resourceStarved,
      gcdFill: single.gcdTotal > 0 ? single.gcdUsed / single.gcdTotal : 0,
      raidTarget: raid
    };
  }

  function raidSize(design) {
    var biggest = 5;
    (design.dungeons || []).forEach(function (d) {
      if (d.kind === 'raid') biggest = Math.max(biggest, d.groupSize || 5);
    });
    return biggest;
  }

  /* Evaluate every class and normalise into comparable 0-100 scores.
     Normalising within the design is the point: balance is relative.  */
  /* Balance is measured per BUILD, not per class. "Warriors are fine" is a
     sentence about an average nobody plays: if the tank build is
     miserable and the damage build dominates, the class-level number
     hides a broken class. */
  function evaluateAll(design) {
    var classes = PN.builds.enumerate(design);
    /* A build is measured at the race a player would actually roll it
       as.

       Races multiply the combination count, and most of the new
       combinations are bad on purpose - a Strength race on an Intellect
       caster does nothing. Putting all of them in the spread would mean
       adding a fourth race reads as a balance regression, which is not
       how anybody has ever talked about balance. The question is how a
       Paladin compares to a Warrior when both players picked sensibly,
       so each build is evaluated at its best race and the spread is
       between those.

       With no races authored this is the identity and costs nothing. */
    var raw = classes.map(function (c) {
      var best = PN.races ? PN.races.bestBuild(design, c) : c;
      var ev = evaluate(design, best === c ? c : best);
      /* The table is keyed on the BUILD, not the race-and-build, so the
         rest of the game carries on addressing builds by id. */
      ev.cls = c;
      ev.raced = best !== c ? best : null;
      ev.raceId = best !== c ? best.raceId : null;
      ev.raceName = best !== c ? best.raceName : null;
      return ev;
    });
    if (!raw.length) return { list: [], byId: {} };

    function norm(vals, v) {
      var mean = U.avg(vals);
      if (mean <= 0) return 50;
      return U.clamp100(50 * (v / mean));
    }
    var dpsVals = raw.map(function (r) { return r.dps; });
    var aoeVals = raw.map(function (r) { return r.aoeDps; });
    var hpsVals = raw.map(function (r) { return r.hps; });
    var ehpVals = raw.map(function (r) { return r.ehp; });
    var tpsVals = raw.map(function (r) { return r.tps; });
    var supVals = raw.map(function (r) { return r.support; });
    var mobVals = raw.map(function (r) { return r.mobility; });

    raw.forEach(function (r) {
      var role = r.cls.role;
      var dps = norm(dpsVals, r.dps), aoe = norm(aoeVals, r.aoeDps);
      var hps = norm(hpsVals, r.hps), ehp = norm(ehpVals, r.ehp);
      var tps = norm(tpsVals, r.tps), sup = norm(supVals, r.support);
      var mob = norm(mobVals, r.mobility);

      /* PvE score: how much this build contributes to group content in
         the job it claims to do.

         A damage build is judged on damage. Support used to be worth
         sixteen percent of it, which is enough that a healing tree
         played as damage - all that support, none of the damage - came
         out ahead of every real damage tree in the game while doing
         half their DPS. Utility still counts, because a damage player
         who brings something is worth more than one who does not, but
         it cannot outweigh the thing the role is named after. */
      r.pveScore = U.clamp100(
        role === 'tank'   ? ehp * 0.42 + tps * 0.26 + r.mitigationUptime * 100 * 0.14 + dps * 0.10 + sup * 0.08 :
        role === 'healer' ? hps * 0.58 + sup * 0.18 + ehp * 0.10 + (r.resourceStarved ? -12 : 6) + 6 :
        role === 'hybrid' ? dps * 0.30 + hps * 0.24 + ehp * 0.16 + sup * 0.20 + aoe * 0.10 :
                            dps * 0.66 + aoe * 0.20 + sup * 0.07 + mob * 0.04 + ehp * 0.03
      );

      /* PvP score: burst inside a control window, plus the ability to
         survive one and to leave.                                    */
      var burstDps = norm(dpsVals, r.burst.dps);
      r.pvpScore = U.clamp100(
        burstDps * 0.30 +
        r.hardControlUptime * 100 * 0.22 +
        r.controlUptime * 100 * 0.10 +
        U.saturate(r.mobility, 45) * 100 * 0.16 +
        ehp * 0.14 +
        (role === 'healer' ? hps * 0.14 : sup * 0.08)
      );
      r.scores = { dps: dps, aoe: aoe, hps: hps, ehp: ehp, tps: tps, support: sup, mobility: mob };
    });

    var byId = {};
    raw.forEach(function (r) { byId[r.cls.id] = r; });
    return { list: raw, byId: byId };
  }

  /* Design-level readouts that used to be sliders. */
  function derivedCombatMath(design) {
    var all = evaluateAll(design);
    if (!all.list.length) {
      return { ttkPve: 0, ttkPvp: 0, raidClearSeconds: 0, groupDps: 0, empty: true };
    }
    var dpsers = all.list.filter(function (r) { return r.cls.role === 'dps' || r.cls.role === 'hybrid'; });
    var avgDps = dpsers.length ? U.avg(dpsers, function (r) { return r.dps; })
                               : U.avg(all.list, function (r) { return r.dps; });
    var elite = targetProfile(design, { kind: 'elite' });
    var size = raidSize(design);
    var raid = targetProfile(design, { kind: 'raidBoss', groupSize: size });

    /* A raid is mostly damage dealers. */
    var damageShare = Math.max(1, Math.round(size * 0.66));
    var groupDps = avgDps * damageShare;

    /* How long a duel lasts is a question about the people who can win
       one. Averaging a healer's inability to kill anybody into it was
       hiding how fast the actual fights were.                        */
    var duellists = all.list.filter(function (r) { return r.cls.role !== 'healer'; });
    if (!duellists.length) duellists = all.list;
    var pvpTtks = duellists.map(function (r) { return r.ttkPvp; })
      .filter(function (v) { return isFinite(v) && v > 0; })
      .sort(function (a, b) { return a - b; });
    /* Median, so one unkillable tank does not define the whole game. */
    var pvpMedian = pvpTtks.length
      ? (pvpTtks.length % 2 ? pvpTtks[(pvpTtks.length - 1) / 2]
         : (pvpTtks[pvpTtks.length / 2 - 1] + pvpTtks[pvpTtks.length / 2]) / 2)
      : 0;

    return {
      ttkPve: avgDps > 0 ? elite.health / avgDps : 0,
      ttkPvp: pvpMedian,
      groupDps: groupDps,
      raidBossHealth: raid.health,
      raidClearSeconds: groupDps > 0 ? raid.health / groupDps : 0,
      raidSize: size,
      avgDps: avgDps,
      empty: false,
      evaluations: all
    };
  }

  PN.combat = {
    TARGET_KINDS: TARGET_KINDS, TARGET_BY_ID: TARGET_BY_ID,
    referenceGear: referenceGear, targetItemLevel: targetItemLevel, bestPerSlot: bestPerSlot,
    primaryFor: primaryFor,
    characterProfile: characterProfile, targetProfile: targetProfile,
    castValue: castValue, execTime: execTime, solve: solve,
    effectiveHealth: effectiveHealth, evaluate: evaluate, evaluateAll: evaluateAll,
    derivedCombatMath: derivedCombatMath, raidSize: raidSize
  };
})(PN);
