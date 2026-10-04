/* Patch Notes - competitive PvP.
   Arenas and battlegrounds authored with the same depth as raid
   encounters: real maps with real parameters, class affinities derived
   from the kits you wrote, and a ladder that shows you exactly which
   class is ruining the season.                                         */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Objective modes change what a team actually has to do, and
     therefore which classes matter.                                  */
  var MODES = [
    { id: 'deathmatch', name: 'Deathmatch', teamPlay: 0.55, burst: 1.25, control: 1.20,
      mobility: 0.85, sustain: 1.15, aoe: 0.70,
      desc: 'Kill the other team. The purest test, and the least forgiving of a bad comp.' },
    { id: 'capture', name: 'Capture Points', teamPlay: 0.80, burst: 0.85, control: 1.15,
      mobility: 1.20, sustain: 1.25, aoe: 1.20,
      desc: 'Hold ground. Rewards area denial, sustain and rotation discipline.' },
    { id: 'flag', name: 'Capture the Flag', teamPlay: 0.85, burst: 0.90, control: 1.30,
      mobility: 1.55, sustain: 1.05, aoe: 0.80,
      desc: 'Mobility is king and speed boosts decide games. Flag carriers need peeling.' },
    { id: 'payload', name: 'Escort', teamPlay: 0.90, burst: 0.80, control: 1.10,
      mobility: 0.75, sustain: 1.35, aoe: 1.30,
      desc: 'A slow grind around a moving objective. Attrition and area damage win it.' },
    { id: 'koth', name: 'King of the Hill', teamPlay: 0.75, burst: 1.05, control: 1.35,
      mobility: 0.95, sustain: 1.25, aoe: 1.35,
      desc: 'One contested circle. Crowd control and area damage decide every fight.' },
    { id: 'elimination', name: 'Elimination', teamPlay: 0.95, burst: 1.35, control: 1.40,
      mobility: 1.10, sustain: 1.30, aoe: 0.55,
      desc: 'No respawns. One mistake ends the round. The most skill-expressive and the most brutal.' }
  ];
  var MODE_BY_ID = {};
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });

  function newMap(name, opts) {
    opts = opts || {};
    return {
      id: U.id('map'), name: name || 'New Arena',
      mode: opts.mode || 'deathmatch',
      teamSize: opts.teamSize === undefined ? 3 : opts.teamSize,
      size: opts.size === undefined ? 50 : opts.size,            /* small .. sprawling   */
      chokepoints: opts.chokepoints === undefined ? 50 : opts.chokepoints,
      verticality: opts.verticality === undefined ? 30 : opts.verticality,
      lineOfSight: opts.lineOfSight === undefined ? 50 : opts.lineOfSight, /* pillars    */
      healingDampen: opts.healingDampen === undefined ? 0 : opts.healingDampen,
      matchMinutes: opts.matchMinutes === undefined ? 8 : opts.matchMinutes,
      respawnSeconds: opts.respawnSeconds === undefined ? 20 : opts.respawnSeconds,
      hazards: opts.hazards === undefined ? 0 : opts.hazards
    };
  }
  function mapById(design, id) { return U.byId(design.pvpMaps || [], id); }

  /* What a map asks for, on the same axes a class can supply. */
  function mapDemands(map) {
    var mode = MODE_BY_ID[map.mode] || MODES[0];
    var big = map.size / 100;
    return {
      burst: mode.burst * (1 + (1 - big) * 0.35),
      sustain: mode.sustain * (1 + big * 0.20) * (1 - map.healingDampen / 180),
      control: mode.control * (1 + (map.chokepoints / 100) * 0.35),
      mobility: mode.mobility * (1 + big * 0.55 + (map.verticality / 100) * 0.45),
      ranged: 0.7 + (map.size / 100) * 0.9 - (map.lineOfSight / 100) * 0.5,
      melee: 1.3 - (map.size / 100) * 0.7 + (map.lineOfSight / 100) * 0.45,
      aoe: mode.aoe * (1 + (map.chokepoints / 100) * 0.45),
      survivability: 1 + (map.hazards / 100) * 0.3 + (mode.id === 'elimination' ? 0.3 : 0),
      teamPlay: mode.teamPlay
    };
  }

  /* How well one authored class suits one authored map. */
  function classAffinity(design, cls, map, ev) {
    if (!ev) return 50;
    var d = mapDemands(map);
    var AB = PN.abilities;
    var abs = AB.abilitiesOf(design, cls);
    if (!abs.length) return 0;

    var rangedShare = 0, meleeShare = 0, aoeCount = 0;
    abs.forEach(function (ab) {
      var sh = AB.shape(ab);
      if (sh.isDamage || sh.isHeal) {
        if (sh.ranged) rangedShare++; else meleeShare++;
      }
      if (sh.aoe) aoeCount++;
    });
    var total = Math.max(1, rangedShare + meleeShare);
    rangedShare /= total; meleeShare /= total;

    var burst = U.clamp01(ev.burst.dps / Math.max(1, ev.dps * 1.4));
    var sustain = U.clamp01(ev.dps / Math.max(1, ev.burst.dps * 1.4));
    var control = ev.hardControlUptime * 0.7 + ev.controlUptime * 0.3;
    var mobility = U.saturate(ev.mobility, 45);
    var surv = U.clamp01(ev.pvpEhp ? ev.pvpEhp / (ev.profile.health * 1.6) : 0.6);
    var aoe = U.clamp01(aoeCount / Math.max(1, abs.length) * 2.2);

    var score =
      burst * d.burst * 20 +
      sustain * d.sustain * 16 +
      control * d.control * 26 +
      mobility * d.mobility * 20 +
      aoe * d.aoe * 8 +
      surv * d.survivability * 14 +
      (rangedShare * d.ranged + meleeShare * d.melee) * 12;

    /* Healers are worth more the more the mode rewards coordination. */
    if (cls.role === 'healer') score += ev.hps > 0 ? d.teamPlay * 26 : 0;
    if (cls.role === 'tank') score += d.control * 8 - 6;

    return U.clamp100(score);
  }

  /* The whole ladder: which class wins, on which map, and how badly. */
  function ladder(design) {
    var maps = design.pvpMaps || [];
    var evals = PN.combat.evaluateAll(design);
    var classes = evals.list;
    if (!classes.length || !maps.length) {
      return { rows: [], maps: maps, spread: 0, quality: maps.length ? 60 : 40,
               outliers: [], empty: true };
    }

    var rows = classes.map(function (ev) {
      var per = maps.map(function (m) {
        return { map: m, affinity: classAffinity(design, ev.cls, m, ev) };
      });
      var mean = U.avg(per, function (p) { return p.affinity; });
      return {
        cls: ev.cls, ev: ev, per: per, overall: mean,
        best: per.slice().sort(function (a, b) { return b.affinity - a.affinity; })[0],
        worst: per.slice().sort(function (a, b) { return a.affinity - b.affinity; })[0]
      };
    });

    var overallMean = U.avg(rows, function (r) { return r.overall; });
    rows.forEach(function (r) {
      r.dev = overallMean > 0 ? (r.overall - overallMean) / overallMean : 0;
      /* Representation at the top of the ladder is exponential in
         strength - the best class eats the bracket.                */
      r.topShare = Math.exp(r.dev * 3.4);
    });
    var shareTotal = U.sum(rows, function (r) { return r.topShare; });
    rows.forEach(function (r) { r.topShare = shareTotal > 0 ? r.topShare / shareTotal : 0; });

    var spread = U.stdev(rows, function (r) { return r.dev; }) * 100;
    var gini = U.gini(rows.map(function (r) { return r.topShare; }));

    /* Gear deciding matches is its own fairness problem. */
    var gearPenalty = (design.pvp.gearPower / 100) * 22;
    var ccPenalty = design.pvp.ccDiminishing ? 0 : 14;
    var quality = U.clamp100(100 - spread * 1.6 - gini * 60 - gearPenalty - ccPenalty +
      (design.liveOps.balancePassEffort / 100) * 18);

    var outliers = rows.filter(function (r) { return Math.abs(r.dev) > 0.15; })
      .sort(function (a, b) { return Math.abs(b.dev) - Math.abs(a.dev); });

    return { rows: rows.sort(function (a, b) { return b.overall - a.overall; }),
             maps: maps, spread: spread, gini: gini, quality: quality,
             outliers: outliers, empty: false };
  }

  /* Season structure: how much there is to climb, and what you get. */
  function seasonMetrics(design) {
    var p = design.pvp;
    if (!p.enabled) return { hours: 0, pull: 0, note: 'PvP is switched off.' };
    var maps = (design.pvpMaps || []).length;
    var modes = {};
    (design.pvpMaps || []).forEach(function (m) { modes[m.mode] = 1; });
    var modeCount = U.keys(modes).length;

    var hours = maps * 2.4 + modeCount * 3.2 + (p.soloQueue ? 4 : 0) +
                U.saturate(p.seasonWeeks, 12) * 6;
    var reward = PN.items.rewardValue(design, PN.items.rewardById(design, p.seasonRewardId));
    /* A loot table's value is already its EXPECTED value - what one
       match pays on average - which is the number to compare a dungeon
       run against. */
    var vendor = PN.items.lootValue(design, PN.items.lootById(design, p.matchLootId));
    var pull = U.clamp100(
      U.saturate(hours, 26) * 46 +
      U.saturate(reward, 120) * 28 +
      U.saturate(vendor, 90) * 14 +
      (p.titleRewards ? 8 : 0) +
      (p.soloQueue ? 8 : 0)
    );
    return {
      hours: hours, pull: pull, maps: maps, modes: modeCount,
      seasonReward: reward, matchLoot: vendor, vendorReward: vendor,
      note: maps === 0 ? 'No maps authored - there is nothing to queue for.'
          : modeCount < 2 ? 'One objective mode. The meta will go stale fast.'
          : 'Healthy variety.'
    };
  }

  /* A starting set so PvP is not an empty tab. */
  function defaultMaps(design) {
    return [
      newMap('The Proving Ring', { mode: 'deathmatch', teamSize: 3, size: 25,
        chokepoints: 30, lineOfSight: 60, verticality: 10, matchMinutes: 6 }),
      newMap('Sunken Causeway', { mode: 'capture', teamSize: 10, size: 70,
        chokepoints: 65, lineOfSight: 40, verticality: 35, matchMinutes: 15 }),
      newMap('Gale Spire', { mode: 'flag', teamSize: 10, size: 85,
        chokepoints: 40, lineOfSight: 30, verticality: 70, matchMinutes: 18 }),
      newMap('The Crucible', { mode: 'elimination', teamSize: 3, size: 30,
        chokepoints: 55, lineOfSight: 70, verticality: 20, matchMinutes: 5,
        healingDampen: 40 })
    ];
  }

  PN.pvp = {
    MODES: MODES, MODE_BY_ID: MODE_BY_ID,
    newMap: newMap, mapById: mapById, mapDemands: mapDemands,
    classAffinity: classAffinity, ladder: ladder, seasonMetrics: seasonMetrics,
    defaultMaps: defaultMaps
  };
})(PN);
