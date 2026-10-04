/* Patch Notes - why this is happening to you.

   The old crisis system fired from a fixed list of thirty incidents with
   fixed prose. "A duplication exploit is spreading" is a thing that
   happens in an MMO, but it was not a thing that happened in YOUR MMO:
   nothing in it knew what you had authored, so the same sentence
   arrived whether you had a locked-down bind-on-pickup economy or a
   free-trade one with no anti-RMT spend at all.

   This is the other half. A cause reads your design and your live state
   together and returns the specific thing that is wrong, with the names
   of the objects that caused it - the material that has no sink, the
   build that owns the ladder, the profession that is a dead end. The
   events are then written out of that, so the crisis you get is caused
   by something you did and says so.

   A cause knows three things: how bad it is, why it is happening, and
   what could be done about it. That is enough to write an event.     */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items;

  /* ------------------------------------------------------------ helpers */

  function live(state) { return PN.sim.live(state) || state.design; }

  function cause(id, o) {
    return {
      id: id,
      kind: o.kind || 'crisis',
      /* 0-1. How loudly this is going wrong right now. */
      severity: U.clamp01(o.severity || 0),
      title: o.title,
      body: o.body,
      /* The actual reasons, in the player's own nouns. */
      why: o.why || [],
      /* What the design objects involved are, so an option can act on
         them by id rather than by nudging a global dial. */
      subjects: o.subjects || []
    };
  }

  function nameList(names, max) {
    max = max || 3;
    var shown = names.slice(0, max);
    var rest = names.length - shown.length;
    var s = shown.join(', ');
    return rest > 0 ? s + ' and ' + rest + ' more' : s;
  }

  /* ---------------------------------------------------------- the readers

     Each one answers: is this going wrong, and because of what?     */

  var READERS = [];

  /* --- an economy with a hole in it ----------------------------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var e = state.economy;
    if (!e || !d.economy) return null;
    var gap = (d.economy.faucetRate || 0) - (d.economy.sinkRate || 0);
    var inflation = e.inflation || 1;
    if (inflation < 1.35 && gap < 20) return null;

    var why = [];
    if (gap > 0) why.push('faucets are ' + Math.round(gap) + ' points above sinks');
    if (!d.economy.vendorRepair) why.push('nothing charges for repairs');
    if ((d.economy.auctionTax || 0) < 5) why.push('the auction tax is ' +
      Math.round(d.economy.auctionTax || 0) + '%');

    /* Which currency is drowning, by name. */
    var gold = null;
    (d.items || []).forEach(function (i) { if (!gold && i.kind === 'currency') gold = i; });

    return cause('inflation', {
      kind: 'economy',
      severity: U.clamp01((inflation - 1.25) * 0.8 + (gap > 0 ? gap / 160 : 0)),
      title: (gold ? gold.name : 'The currency') + ' is worth ' +
             U.round(1 / Math.max(0.2, inflation), 2) + ' of what it was',
      body: 'Prices have run away from anybody who started this year. ' +
            (why.length ? 'Your design says why: ' + nameList(why, 3) + '.' : ''),
      why: why,
      subjects: gold ? [{ kind: 'currency', id: gold.id, name: gold.name }] : []
    });
  });

  /* --- gold sellers, and the reason they are worth doing -------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var bots = state.runtime.botPressure || 0;
    if (bots < 30) return null;
    var why = [];
    if (d.economy.tradingEnabled) why.push('gold can change hands');
    if ((d.economy.antiRmtSpend || 0) < 45)
      why.push('anti-RMT spend is at ' + Math.round(d.economy.antiRmtSpend || 0));
    var grind = ctx && ctx.engines ? ctx.engines.grindIntensity : 40;
    if (grind > 50) why.push('the grind is at ' + Math.round(grind));

    /* Which nodes they are farming. */
    var mats = IT.gatherPool(d).slice(0, 3).map(function (m) { return m.name; });
    if (mats.length) why.push(mats[0] + ' nodes are worth camping');

    return cause('goldSellers', {
      kind: 'economy',
      severity: U.clamp01((bots - 30) / 55),
      title: 'Bot trains on every ' + (mats[0] || 'gathering') + ' node',
      body: 'Whisper spam in every city and a third-party market for your currency ' +
            'with better uptime than your own auction house.',
      why: why,
      subjects: mats.map(function (n, i) {
        return { kind: 'material', id: IT.gatherPool(d)[i].id, name: n }; })
    });
  });

  /* --- one build owning the game -------------------------------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var bal = ctx && ctx.balance ? ctx.balance : PN.metrics.balanceState(d);
    if (!bal || !bal.perBuild || !bal.perBuild.length) return null;
    var sorted = bal.perBuild.slice().sort(function (a, b) { return b.pveDev - a.pveDev; });
    var top = sorted[0], bottom = sorted[sorted.length - 1];
    if (!top || top.pveDev < 0.15) return null;

    return cause('balance', {
      kind: 'community',
      severity: U.clamp01((top.pveDev - 0.12) * 2.4),
      title: top.cls.name + ' is ' + Math.round(top.pveDev * 100) + '% ahead of everything else',
      body: 'The spreadsheet sites have it at the top and the guilds have noticed. ' +
            bottom.cls.name + ' is ' + Math.round(Math.abs(bottom.pveDev) * 100) +
            '% behind and nobody is taking one.',
      why: [top.cls.name + ' is ' + Math.round(top.pveDev * 100) + '% above the mean',
            bottom.cls.name + ' is ' + Math.round(bottom.pveDev * 100) + '%'],
      subjects: [
        { kind: 'build', id: top.cls.id, name: top.cls.name,
          playableId: top.cls.playableId, dir: 'down' },
        { kind: 'build', id: bottom.cls.id, name: bottom.cls.name,
          playableId: bottom.cls.playableId, dir: 'up' }
      ]
    });
  });

  /* --- a profession that goes nowhere --------------------------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var cat = PN.goals.catalogue(d);
    var by = cat.recipesByProfession || {};
    var all = {};
    PN.crafting.recipes(d).forEach(function (r) {
      if (r.enabled === false) return;
      all[r.profession] = (all[r.profession] || 0) + 1;
    });
    var dead = U.keys(all).filter(function (k) { return (by[k] || 0) < 2; });
    if (!dead.length) return null;
    var names = dead.map(function (k) {
      var p = PN.crafting.PROFESSION_BY_ID[k];
      return p ? p.name : k;
    });

    return cause('deadProfession', {
      kind: 'community',
      severity: U.clamp01(dead.length * 0.28),
      title: nameList(names, 2) + ' cannot be levelled',
      body: 'Players took the profession, hit a recipe whose reagents do not exist ' +
            'anywhere in the world, and posted about it.',
      why: names.map(function (n) { return n + ' has nothing makeable in it'; }),
      subjects: dead.map(function (k, i) {
        return { kind: 'profession', id: k, name: names[i] }; })
    });
  });

  /* --- gear nobody can reach ------------------------------------------ */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var orphans = (d.items || []).filter(function (i) {
      return i.kind === 'gear' && IT.isOrphan(d, i); });
    if (orphans.length < 3) return null;
    var names = orphans.map(function (i) { return i.name; });

    return cause('unreachableLoot', {
      kind: 'community',
      severity: U.clamp01(orphans.length / 18),
      title: orphans.length + ' items exist that nobody can get',
      body: 'Somebody datamined the item table. ' + nameList(names, 3) +
            ' are in the build and drop from nothing, are sold by nobody and ' +
            'are crafted by no recipe.',
      why: [nameList(names, 4) + ' have no source at all'],
      subjects: orphans.slice(0, 6).map(function (i) {
        return { kind: 'item', id: i.id, name: i.name }; })
    });
  });

  /* --- the servers ---------------------------------------------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var q = state.runtime.queuePressure || 0;
    /* The actual sum, so the crisis can say how short you are
       rather than that you are short. */
    var room = PN.infra ? PN.infra.capacity(d) : 0;
    var over = Math.max(0, (state.population.total || 0) - room);
    if (q < 25) return null;
    return cause('queues', {
      kind: 'ops',
      severity: U.clamp01((q - 20) / 60),
      title: 'Queues on every realm: room for ' + U.fmtCompact(room) +
             ', ' + U.fmtCompact(state.population.total) + ' trying to play',
      body: U.fmtCompact(over) + ' more people are trying to log in than you built room for. ' + 'Every realm you open and every point of headroom you buy raises that number.',
      why: [d.infra.regions + ' regions holding ' + U.fmtCompact(room),
            Math.round(d.infra.capacityHeadroom) + '% headroom',
            U.fmtCompact(state.population.total) + ' players'],
      subjects: [{ kind: 'infra', id: 'capacityHeadroom', name: 'capacity headroom' }]
    });
  });

  /* --- nothing has shipped for a long time ---------------------------- */
  READERS.push(function (state, ctx) {
    var weeks = state.runtime.weeksSinceContent || 0;
    if (weeks < 14) return null;
    var d = live(state);
    var cat = PN.goals.catalogue(d);
    var last = (state.released || [])[0];
    return cause('drought', {
      kind: 'community',
      severity: U.clamp01((weeks - 12) / 26),
      title: weeks + ' weeks since anything new',
      body: 'The last thing you shipped was ' +
            (last ? last.versionText + (last.name ? ' (' + last.name + ')' : '') : 'the launch') +
            '. People have finished what is in front of them.',
      why: [cat.raids + ' raids and ' + cat.dungeons + ' dungeons, all of them old',
            weeks + ' weeks of nothing'],
      subjects: []
    });
  });

  /* --- one class owning the ladder ------------------------------------ */
  READERS.push(function (state, ctx) {
    var d = live(state);
    if (!d.pvp || !d.pvp.enabled) return null;
    var th = PN.ladder.topHeavy(state, 100);
    if (!th.total || th.total < 20) return null;
    var worst = th.byPlayable[0];
    var share = worst ? worst.n / th.total : 0;
    if (share < 0.45) return null;
    return cause('ladderDominance', {
      kind: 'community',
      severity: U.clamp01((share - 0.4) * 2.2),
      title: worst.name + ' holds ' + Math.round(share * 100) + '% of the ladder',
      body: 'The top of your arena is one class wearing different names. ' +
            'Everybody else has stopped queueing.',
      why: [worst.name + ' is ' + Math.round(share * 100) + '% of the top ' + th.total,
            'gear decides ' + Math.round(d.pvp.gearPower) + '% of a match'],
      subjects: [{ kind: 'playable', id: worst.id, name: worst.name, dir: 'down' }]
    });
  });

  /* --- bugs ------------------------------------------------------------ */
  READERS.push(function (state, ctx) {
    var d = live(state);
    var bugs = state.runtime.bugLoad || 0;
    if (bugs < 38) return null;
    var last = (state.released || [])[0];
    var why = [Math.round(bugs) + ' open bugs'];
    if (last) why.push(last.versionText + ' shipped ' + Math.round(last.funded * 100) + '% built');
    if ((d.liveOps.ptrUse || 0) < 40) why.push('PTR use is at ' + Math.round(d.liveOps.ptrUse));

    return cause('bugs', {
      kind: 'ops',
      severity: U.clamp01((bugs - 34) / 60),
      title: 'The bug list is longer than the patch notes',
      body: last
        ? last.versionText + ' went out with more in it than your QA covered, and ' +
          'players are finding it for you.'
        : 'Players are finding things faster than the team is fixing them.',
      why: why,
      subjects: [{ kind: 'liveOps', id: 'ptrUse', name: 'PTR use' }]
    });
  });

  /* --- a material with no sink, piling up ----------------------------- */
  READERS.push(function (state, ctx) {
    var d = live(state);
    if (!state.agents || state.agents.length < 40) return null;
    var pool = IT.gatherPool(d);
    if (pool.length < 3) return null;
    /* Consumed by any recipe? */
    var consumed = {};
    PN.crafting.recipes(d).forEach(function (r) {
      if (r.enabled === false) return;
      (r.inputs || []).forEach(function (i) { consumed[i.itemId] = 1; });
    });
    var held = {};
    state.agents.forEach(function (a) {
      pool.forEach(function (m) { held[m.id] = (held[m.id] || 0) + (((a.inv || {})[m.id]) || 0); });
    });
    var n = state.agents.length;
    var glut = pool.filter(function (m) {
      return !consumed[m.id] && (held[m.id] / n) > 25; });
    if (!glut.length) return null;
    var names = glut.map(function (m) { return m.name; });

    return cause('materialGlut', {
      kind: 'economy',
      severity: U.clamp01(glut.length * 0.3),
      title: nameList(names, 2) + ' is worthless',
      body: 'Everybody has hundreds of it, nothing consumes it, and the auction ' +
            'house has it listed at vendor price.',
      why: names.map(function (nm) { return nm + ' is gathered by everyone and used by nothing'; }),
      subjects: glut.map(function (m) {
        return { kind: 'material', id: m.id, name: m.name }; })
    });
  });

  /* ------------------------------------------------------------- find --

     Everything currently going wrong, worst first. */
  function find(state, ctx) {
    var out = [];
    READERS.forEach(function (r) {
      var c = null;
      try { c = r(state, ctx); } catch (e) { c = null; }
      if (c && c.severity > 0.02) out.push(c);
    });
    out.sort(function (a, b) { return b.severity - a.severity; });
    return out;
  }

  /* The single worst thing, for screens that only have room for one. */
  function worst(state, ctx) {
    var all = find(state, ctx);
    return all.length ? all[0] : null;
  }

  PN.causes = { find: find, worst: worst, READERS: READERS };
})(PN);
