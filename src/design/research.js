/* Patch Notes - research.

   A studio does not know how to build everything on day one. Research is
   the gate: the level cap, how many classes you may ship, how many stats
   your combat model supports, which rarities exist, how many zones and
   dungeons and arenas you can have live at once, how good your servers
   get, and what your people cost.

   The point is not to slow the player down. It is that an MMO is built
   in an order, and the order is a decision: raise the cap and ship a
   levelling patch, or widen the stat model and ship a systems patch, or
   drive the wage bill down and survive longer. Research competes for the
   same capacity that builds the game, so every point spent here is a
   week of content not made.                                            */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* ------------------------------------------------------------ nodes --

     Each node unlocks one thing, costs capacity-weeks, and may require
     others first. `grants` is read by limits() below; nothing else in
     the game knows what a node means, which keeps the list editable. */

  var NODES = [
    /* ---- the level ceiling ------------------------------------------ */
    { id: 'cap30', name: 'Levels 21-30', tier: 1, cost: 40,
      grants: { levelCap: 10 },
      desc: 'Ten more levels, and everything below them worth a little less.' },
    { id: 'cap40', name: 'Levels 31-40', tier: 2, cost: 70, needs: ['cap30'],
      grants: { levelCap: 10 },
      desc: 'Ten more. The middle of a levelling curve is the part players remember least, so there had better be a zone in it.' },
    { id: 'cap50', name: 'Levels 41-50', tier: 3, cost: 110, needs: ['cap40'],
      grants: { levelCap: 10 },
      desc: 'A fifty cap is where an MMO stops being a demo. It is also two more zones of content you now owe.' },
    { id: 'cap60', name: 'Levels 51-60', tier: 3, cost: 150, needs: ['cap50'],
      grants: { levelCap: 10 },
      desc: 'The classic ceiling. Long enough that reaching it is an achievement, short enough that people do.' },
    { id: 'cap70', name: 'Levels 61-70', tier: 4, cost: 200, needs: ['cap60'],
      grants: { levelCap: 10 },
      desc: 'Expansion territory. Raising the cap devalues every item below it, which is the point and the problem.' },
    { id: 'cap80', name: 'Levels 71-80', tier: 4, cost: 260, needs: ['cap70'],
      grants: { levelCap: 10 },
      desc: 'Eighty levels is a second full game. Nobody new will walk it without catch-up.' },

    /* ---- who players can be ----------------------------------------- */
    { id: 'classes4', name: 'Class Framework II', tier: 1, cost: 55,
      grants: { classes: 2 },
      desc: 'Two more classes, or two more talent branches in a classless game.' },
    { id: 'classes6', name: 'Class Framework III', tier: 2, cost: 95, needs: ['classes4'],
      grants: { classes: 2 },
      desc: 'Two more. Six playables is where a group finder starts having real choices to make.' },
    { id: 'classes8', name: 'Class Framework IV', tier: 3, cost: 150, needs: ['classes6'],
      grants: { classes: 2 },
      desc: 'Two more. Every class you add is a balance pass you owe for ever, not once.' },
    { id: 'classes10', name: 'Class Framework V', tier: 4, cost: 220, needs: ['classes8'],
      grants: { classes: 2 },
      desc: 'Ten playables. The roster of a genre leader, and the balance workload of one.' },

    /* ---- the combat model ------------------------------------------- */
    /* ---- a second character axis ------------------------------------ */
    { id: 'races', name: 'Playable Races', tier: 1, cost: 60,
      grants: { races: 4 },
      desc: 'A second thing to pick on the character screen. Every race is a ' +
            'few percent, and players will argue about those percentages for ' +
            'the life of the game.' },
    { id: 'races8', name: 'Race Framework II', tier: 3, cost: 130, needs: ['races'],
      grants: { races: 4 },
      desc: 'Four more. The eighth one has to justify a starting zone.' },

    { id: 'primary3', name: 'Third Primary Stat', tier: 1, cost: 45,
      grants: { primaries: 1 },
      desc: 'Room for one more primary stat in the character model.' },
    { id: 'primary4', name: 'Fourth Primary Stat', tier: 3, cost: 120, needs: ['primary3'],
      grants: { primaries: 1 },
      desc: 'A fourth primary. More ways to build, and one more stat your loot has to be sorted by.' },
    { id: 'primary5', name: 'Fifth Primary Stat', tier: 4, cost: 200, needs: ['primary4'],
      grants: { primaries: 1 },
      desc: 'A fifth. Past this the itemisation gets thin: every drop has to serve somebody.' },
    { id: 'secondary3', name: 'Third Secondary Stat', tier: 1, cost: 45,
      grants: { secondaries: 1 },
      desc: 'Crit, haste, mastery, versatility - one more of them.' },
    { id: 'secondary4', name: 'Fourth Secondary Stat', tier: 2, cost: 80, needs: ['secondary3'],
      grants: { secondaries: 1 },
      desc: 'One more secondary. Secondaries are what make two pieces of the same item level feel different.' },
    { id: 'secondary5', name: 'Fifth Secondary Stat', tier: 3, cost: 130, needs: ['secondary4'],
      grants: { secondaries: 1 },
      desc: 'One more. The stat priority spreadsheets your players write get a column.' },
    { id: 'secondary6', name: 'Sixth Secondary Stat', tier: 4, cost: 190, needs: ['secondary5'],
      grants: { secondaries: 1 },
      desc: 'One more. Six secondaries is a deep model - and a hard one to keep from having a single correct answer.' },

    /* ---- rarity ------------------------------------------------------ */
    { id: 'rarityPoor', name: 'Junk Items', tier: 1, cost: 25,
      grants: { rarities: ['poor'] },
      desc: 'Grey drops. Worthless by design, and the reason a green feels good.' },
    { id: 'rarityLegendary', name: 'Legendary Items', tier: 3, cost: 140,
      grants: { rarities: ['legendary'] },
      desc: 'One orange drop is worth more headlines than a whole raid tier.' },
    { id: 'rarityMythic', name: 'Mythic Items', tier: 4, cost: 240, needs: ['rarityLegendary'],
      grants: { rarities: ['mythic'] },
      desc: 'Above legendary. Runs the risk of making legendary feel ordinary.' },
    { id: 'rarityArtifact', name: 'Artifacts', tier: 4, cost: 320, needs: ['rarityMythic'],
      grants: { rarities: ['artifact'] },
      desc: 'One per account, ever. The item that becomes the expansion.' },

    /* ---- the world --------------------------------------------------- */
    { id: 'zones5', name: 'World Streaming I', tier: 1, cost: 50,
      grants: { zones: 2 },
      desc: 'Two more zones the client can hold without falling over.' },
    { id: 'zones7', name: 'World Streaming II', tier: 2, cost: 85, needs: ['zones5'],
      grants: { zones: 2 },
      desc: 'Two more zones. Levelling wants roughly one zone per ten levels, or players run out of somewhere to be.' },
    { id: 'zones9', name: 'World Streaming III', tier: 3, cost: 130, needs: ['zones7'],
      grants: { zones: 2 },
      desc: 'Two more. Nine zones is a world rather than a corridor, and gives your explorers somewhere to go.' },
    { id: 'zones11', name: 'World Streaming IV', tier: 4, cost: 190, needs: ['zones9'],
      grants: { zones: 2 },
      desc: 'Two more. At this size the problem stops being space and starts being how to fill it.' },

    /* ---- group content ----------------------------------------------- */
    { id: 'instancing2', name: 'Instancing II', tier: 1, cost: 60,
      grants: { dungeons: 2 },
      desc: 'Two more dungeons or raids running at once.' },
    { id: 'instancing3', name: 'Instancing III', tier: 2, cost: 100, needs: ['instancing2'],
      grants: { dungeons: 2 },
      desc: 'Two more instances. A dungeon rotation of four is where the daily stops feeling like the same dungeon.' },
    { id: 'instancing4', name: 'Instancing IV', tier: 3, cost: 160, needs: ['instancing3'],
      grants: { dungeons: 2 },
      desc: 'Two more. Enough for a raid tier and a dungeon set in the same patch.' },
    { id: 'instancing5', name: 'Instancing V', tier: 4, cost: 230, needs: ['instancing4'],
      grants: { dungeons: 2 },
      desc: 'Two more. Ten instances live at once, each one needing its own tuning pass every patch.' },
    { id: 'arena2', name: 'Arena Netcode II', tier: 2, cost: 75,
      grants: { arenas: 2 },
      desc: 'Two more PvP maps. Every one needs its own balance pass.' },
    { id: 'arena3', name: 'Arena Netcode III', tier: 3, cost: 125, needs: ['arena2'],
      grants: { arenas: 2 },
      desc: 'Two more maps. A map pool that rotates is the cheapest way to keep a ladder from going stale.' },
    { id: 'arena4', name: 'Arena Netcode IV', tier: 4, cost: 185, needs: ['arena3'],
      grants: { arenas: 2 },
      desc: 'Two more. Six maps is a real pool - and six sets of terrain your class balance has to survive.' },

    /* ---- crafting ---------------------------------------------------- */
    { id: 'prof6', name: 'Profession Suite II', tier: 1, cost: 45,
      grants: { professions: 3 },
      desc: 'Three more professions players can level.' },
    { id: 'prof9', name: 'Profession Suite III', tier: 2, cost: 80, needs: ['prof6'],
      grants: { professions: 3 },
      desc: 'Three more. A profession with no recipes behind it produces nothing, so these are a promise to write some.' },
    { id: 'prof12', name: 'Profession Suite IV', tier: 3, cost: 135, needs: ['prof9'],
      grants: { professions: 3 },
      desc: 'Three more. Twelve professions is a player economy with specialists in it rather than generalists.' },

    /* ---- infrastructure ---------------------------------------------- */
    { id: 'server1', name: 'Server Tech I', tier: 1, cost: 50,
      grants: { serverTech: 20, serverEfficiency: 0.10 },
      desc: 'Raises how far you can push the hardware, and cuts what it costs to run.' },
    { id: 'server2', name: 'Server Tech II', tier: 2, cost: 90, needs: ['server1'],
      grants: { serverTech: 20, serverEfficiency: 0.10 },
      desc: 'Twenty more points of headroom and another tenth off the hosting bill. Login queues are a capacity problem before they are anything else.' },
    { id: 'server3', name: 'Server Tech III', tier: 3, cost: 145, needs: ['server2'],
      grants: { serverTech: 20, serverEfficiency: 0.10 },
      desc: 'More headroom, cheaper to run. This is what lets a launch spike be a good week instead of an outage.' },
    { id: 'server4', name: 'Server Tech IV', tier: 4, cost: 210, needs: ['server3'],
      grants: { serverTech: 20, serverEfficiency: 0.10 },
      desc: 'The last of it. A hundred points of server tech and four tenths off the bill, for ever.' },

    /* ---- the wage bill ------------------------------------------------ */
    { id: 'pipeline1', name: 'Production Pipeline I', tier: 2, cost: 85,
      grants: { wageCut: 0.05 },
      desc: 'Better tooling and less rework. Five percent off the wage bill.' },
    { id: 'pipeline2', name: 'Production Pipeline II', tier: 3, cost: 150, needs: ['pipeline1'],
      grants: { wageCut: 0.05 },
      desc: 'Another five percent off payroll, every week, for as long as the studio exists.' },
    { id: 'pipeline3', name: 'Production Pipeline III', tier: 4, cost: 240, needs: ['pipeline2'],
      grants: { wageCut: 0.05 },
      desc: 'The last five percent. Fifteen off the wage bill is a whole extra department you did not have to raise money for.' }
  ];
  var NODE_BY_ID = {};
  NODES.forEach(function (n) { NODE_BY_ID[n.id] = n; });

  /* ------------------------------------------------------------ tiers --

     A studio cannot learn something the industry has not worked out
     yet. Each tier is gated on the calendar: the techniques in it
     become available when the genre gets there, which is what makes
     the year you start in a real decision rather than a difficulty
     label. Start in 1999 and you will spend years unable to build
     things a 2016 studio takes for granted; start in 2022 and the
     whole tree is open on day one, against players who expect all of
     it.                                                              */
  var TIERS = [
    { t: 1, name: 'Foundations', year: 1999, era: 'The Frontier',
      desc: 'What you need before the game is a game.' },
    { t: 2, name: 'Expansion', year: 2004, era: 'The Gold Rush',
      desc: 'Room to grow in every direction at once.' },
    { t: 3, name: 'Maturity', year: 2010, era: 'The Themepark Wars',
      desc: 'The systems a long-running MMO is expected to have.' },
    { t: 4, name: 'Frontier', year: 2016, era: 'The Long Tail',
      desc: 'Expensive, and the reason anyone stays for year five.' }
  ];
  var TIER_BY_T = {};
  TIERS.forEach(function (t) { TIER_BY_T[t.t] = t; });

  /* ------------------------------------------------------------ state --

     Studio-wide, because a studio learns once and every title it runs
     benefits.                                                          */
  function ensure(state) {
    var s = state.studio || (state.studio = {});
    if (!s.research) {
      s.research = { done: {}, activeId: null, progress: 0, allocation: 20 };
    }
    if (!s.research.done) s.research.done = {};
    if (s.research.allocation === undefined) s.research.allocation = 20;
    return s.research;
  }

  function isDone(state, id) { return !!ensure(state).done[id]; }

  /* What year it is in the studio's own calendar. */
  function currentYear(state) {
    if (!state) return 2004;
    var founded = (state.studio && state.studio.founded) || state.startYear || 2004;
    return founded + Math.floor((state.week || 0) / 52);
  }

  /* Whether the industry has worked this tier out yet. */
  function tierOpen(state, t) {
    var tier = TIER_BY_T[t];
    if (!tier) return true;
    return currentYear(state) >= tier.year;
  }

  /* How long until it has. Zero once the tier is open. */
  function yearsToTier(state, t) {
    var tier = TIER_BY_T[t];
    if (!tier) return 0;
    return Math.max(0, tier.year - currentYear(state));
  }

  function available(state, node) {
    if (isDone(state, node.id)) return false;
    /* A studio cannot learn something the industry has not worked out
       yet, which is what makes the year you start in a decision. */
    if (!tierOpen(state, node.tier)) return false;
    return (node.needs || []).every(function (n) { return isDone(state, n); });
  }

  /* Everything the design is allowed to contain right now. */
  var BASE = {
    levelCap: 20,
    classes: 4,
    /* Zero on purpose: a game has no races until you research them,
       and a game with no races is a complete game. */
    races: 0,
    primaries: 2,
    secondaries: 2,
    rarities: ['common', 'uncommon', 'rare', 'epic'],
    zones: 3,
    dungeons: 2,
    arenas: 2,
    professions: 3,
    serverTech: 40,
    serverEfficiency: 0,
    wageCut: 0
  };

  function limits(state) {
    var r = ensure(state);
    var out = {
      levelCap: BASE.levelCap, classes: BASE.classes,
      primaries: BASE.primaries, secondaries: BASE.secondaries,
      races: BASE.races,
      rarities: BASE.rarities.slice(),
      zones: BASE.zones, dungeons: BASE.dungeons, arenas: BASE.arenas,
      professions: BASE.professions, serverTech: BASE.serverTech,
      serverEfficiency: 0, wageCut: 0
    };
    NODES.forEach(function (n) {
      if (!r.done[n.id]) return;
      var g = n.grants || {};
      if (g.levelCap) out.levelCap += g.levelCap;
      if (g.classes) out.classes += g.classes;
      if (g.races) out.races += g.races;
      if (g.primaries) out.primaries += g.primaries;
      if (g.secondaries) out.secondaries += g.secondaries;
      if (g.zones) out.zones += g.zones;
      if (g.dungeons) out.dungeons += g.dungeons;
      if (g.arenas) out.arenas += g.arenas;
      if (g.professions) out.professions += g.professions;
      if (g.serverTech) out.serverTech += g.serverTech;
      if (g.serverEfficiency) out.serverEfficiency += g.serverEfficiency;
      if (g.wageCut) out.wageCut += g.wageCut;
      (g.rarities || []).forEach(function (x) {
        if (out.rarities.indexOf(x) < 0) out.rarities.push(x);
      });
    });
    out.serverTech = Math.min(100, out.serverTech);
    return out;
  }

  /* A limit and what is currently against it, for the editors. */
  function countOf(design, what) {
    if (!design) return 0;
    switch (what) {
      case 'classes':
        return PN.talents.isTalentMode(design)
          ? PN.talents.branches(design).length
          : (design.classes || []).length;
      case 'races':       return (design.races || []).length;
      case 'primaries':   return (PN.stats.statSetOf(design).primaries || []).length;
      case 'secondaries': return (PN.stats.statSetOf(design).secondaries || []).length;
      case 'zones':       return (design.zones || []).length;
      case 'dungeons':    return (design.dungeons || []).length;
      case 'arenas':      return (design.pvpMaps || []).length;
      case 'professions': return U.keys((function () {
        var o = {};
        PN.crafting.recipes(design).forEach(function (r) { o[r.profession] = 1; });
        return o;
      })()).length;
      default: return 0;
    }
  }

  /* Can the design add one more of this? The editors ask before they
     offer the button, and the action asks again before it acts. */
  function canAdd(state, design, what) {
    if (!state || !state.studio) return true;
    var lim = limits(state);
    if (lim[what] === undefined) return true;
    return countOf(design, what) < lim[what];
  }

  function blockedReason(state, design, what) {
    var lim = limits(state);
    var names = { classes: 'classes', primaries: 'primary stats',
                  secondaries: 'secondary stats', zones: 'zones',
                  dungeons: 'dungeons and raids', arenas: 'PvP maps',
                  professions: 'professions', races: 'races' };
    var noun = names[what] || what;
    /* A cap of zero is not a cap, it is a system the studio has not
       built yet - and "capped at 0 races" reads like a bug rather than
       a thing to go and research. */
    if (!lim[what]) {
      return 'Your game has no ' + noun + ' yet. Research them first, in the Research screen.';
    }
    return 'Research caps you at ' + lim[what] + ' ' + noun +
           '. Unlock more in the Research screen.';
  }

  /* Which rarities the item editor may offer. */
  function raritiesFor(state) {
    var allowed = limits(state).rarities;
    return PN.stats.RARITIES.filter(function (r) { return allowed.indexOf(r.id) >= 0; });
  }

  /* ---------------------------------------------------------- progress --

     Research eats the same design and engineering capacity that builds
     the game. Allocation is the share of it that goes here instead.  */
  function weeklyPoints(state, cap) {
    var r = ensure(state);
    var share = U.clamp01((r.allocation || 0) / 100);
    if (!cap) return 0;
    return (cap.design * 0.45 + cap.eng * 0.75) * share;
  }

  function start(state, id) {
    var r = ensure(state);
    var node = NODE_BY_ID[id];
    if (!node || !available(state, node)) return false;
    if (r.activeId !== id) { r.activeId = id; r.progress = 0; }
    return true;
  }

  /* One week of work. Returns the node if it finished this week. */
  function tick(state, cap) {
    var r = ensure(state);
    if (!r.activeId) return null;
    var node = NODE_BY_ID[r.activeId];
    if (!node) { r.activeId = null; return null; }
    r.progress += weeklyPoints(state, cap);
    if (r.progress < node.cost) return null;
    r.done[node.id] = 1;
    r.activeId = null;
    r.progress = 0;
    return node;
  }

  function weeksLeft(state, cap) {
    var r = ensure(state);
    if (!r.activeId) return 0;
    var node = NODE_BY_ID[r.activeId];
    if (!node) return 0;
    var per = weeklyPoints(state, cap);
    if (per <= 0) return Infinity;
    return Math.ceil((node.cost - r.progress) / per);
  }

  function unlockAll(state) {
    var r = ensure(state);
    NODES.forEach(function (n) { r.done[n.id] = 1; });
    r.activeId = null; r.progress = 0;
    return r;
  }

  function summary(state) {
    var r = ensure(state);
    var done = NODES.filter(function (n) { return r.done[n.id]; }).length;
    return { done: done, total: NODES.length,
             activeId: r.activeId, progress: r.progress,
             pct: NODES.length ? done / NODES.length : 0 };
  }

  PN.research = {
    NODES: NODES, NODE_BY_ID: NODE_BY_ID, TIERS: TIERS, TIER_BY_T: TIER_BY_T,
    BASE: BASE,
    currentYear: currentYear, tierOpen: tierOpen, yearsToTier: yearsToTier,
    ensure: ensure, isDone: isDone, available: available, limits: limits,
    countOf: countOf, canAdd: canAdd, blockedReason: blockedReason,
    raritiesFor: raritiesFor, weeklyPoints: weeklyPoints,
    start: start, tick: tick, weeksLeft: weeksLeft,
    unlockAll: unlockAll, summary: summary
  };
})(window.PN);
