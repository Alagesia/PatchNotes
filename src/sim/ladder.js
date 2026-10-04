/* Patch Notes - the PvP ladder.

   Who is actually good at your PvP, and why. Rating is not a dice roll
   attached to a name: it comes out of the same numbers the balance
   solver uses, so a player at the top of your ladder is there because
   the build they play and the gear they are wearing beat the build and
   gear of everyone below them - in the PvP model YOU authored, with your
   damping, your healing reduction and your gear-power dial.

   That makes the leaderboard a reading of your balance work rather than
   a scoreboard. If one class owns the top hundred, that is your class
   balance telling you so with names attached.

   A season wipes it, because that is what a season is for.            */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Which season we are in, and how far through it. */
  function seasonOf(state) {
    var d = PN.sim.live(state) || state.design;
    var weeks = Math.max(1, ((d.pvp || {}).seasonWeeks) || 12);
    /* Seasons run from LAUNCH. Counting from the week the studio was
       founded meant a game that spent three years in development
       opened its doors in the middle of season nine. */
    var wk = Math.max(0, (state.week || 0) - (state.launchWeek || 0));
    return { index: Math.floor(wk / weeks), week: wk % weeks, length: weeks };
  }

  /* How strong this player is in a fight, from their build and their
     gear. Both halves are authored: the build comes out of the combat
     solver's PvP score, the gear out of what they are actually wearing. */
  /* Cached per player per week. Working out somebody's PvP power means
     walking every slot they are wearing and pricing it, and the week
     asks for it at least twice for everybody - once to price the field
     and once for each match resolved. */
  function powerOf(state, agent) {
    var wk = state.week || 0;
    if (state.__pwWeek !== wk) { state.__pwWeek = wk; state.__pw = {}; }
    var key = agent.id;
    if (key !== undefined && state.__pw[key] !== undefined) return state.__pw[key];
    var v = powerOfRaw(state, agent);
    if (key !== undefined) state.__pw[key] = v;
    return v;
  }

  function powerOfRaw(state, agent) {
    var d = PN.sim.live(state) || state.design;
    var builds = (state.__ladderBuilds = state.__ladderBuilds || {});
    var key = agent.bld || agent.cls || 'none';
    if (builds[key] === undefined) {
      var build = agent.bld ? U.byId(PN.builds.enumerate(d), agent.bld) : null;
      if (!build) build = PN.schema.playableById(d, agent.cls);
      var ev = build ? PN.combat.evaluate(d, build) : null;
      builds[key] = ev ? ev.pvpScore || ev.burst && ev.burst.dps || 0 : 0;
    }
    var buildPower = builds[key];

    /* Gear, measured the way the rest of the game measures it, and
       weighted by how much your design lets gear decide a match. */
    var gearLv = 0, worn = 0;
    U.keys(agent.g || {}).forEach(function (slot) {
      var it = PN.items.itemById(d, agent.g[slot]);
      if (!it) return;
      gearLv += it.itemLevel || 0; worn++;
    });
    var avgIlvl = worn ? gearLv / worn : 0;
    var target = Math.max(1, PN.combat.targetItemLevel(d));
    var gearPart = U.clamp01(avgIlvl / target);
    var gearWeight = U.clamp01(((d.pvp || {}).gearPower || 25) / 100);

    /* Levels below the cap are a flat disadvantage - a level 30 in a
       level 60 bracket is not competing. */
    var cap = (d.progression || {}).levelCap || 60;
    var levelPart = U.clamp01((agent.lv || 1) / cap);

    var normBuild = U.clamp01(buildPower / 3000);
    return U.clamp01(
      (normBuild * (1 - gearWeight * 0.55) + gearPart * gearWeight * 0.9) *
      (0.35 + levelPart * 0.65)
    );
  }

  /* How strong the field is. PvP is zero-sum: for somebody to win a
     match somebody else has to lose it, so what decides a win rate is
     not how strong you are, it is how strong you are COMPARED TO the
     people queueing beside you. Averaged over the population that has
     to come out at fifty percent, and it did not: everybody was rated
     against a fixed number and so everybody won seventy percent of
     their games, which is not a thing that can happen. */
  function fieldPower(state) {
    var agents = state.agents || [];
    var sum = 0, n = 0;
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      if (!(a.pvpWeeks > 0) && a.lastAct !== 'pvp') continue;
      var w = a.w || 1;
      sum += powerOf(state, a) * w; n += w;
    }
    return n > 0 ? sum / n : 0.5;
  }

  /* The chance this player beats whoever the queue puts in front of
     them. Even against the field is a coin toss; the spread either
     side of that is how much your design lets power decide a match. */
  function winChance(state, agent, field) {
    var d = PN.sim.live(state) || state.design;
    if (field === undefined) field = fieldPower(state);
    var edge = powerOf(state, agent) - field;
    /* A game where gear decides matches spreads win rates wider; one
       where it does not keeps everybody nearer the coin toss. */
    var spread = 1.6 + U.clamp01(((d.pvp || {}).gearPower || 25) / 100) * 1.4;
    return U.clamp(0.5 + edge * spread, 0.08, 0.92);
  }

  /* Everybody who actually plays your PvP, rated.

     Only players who have spent real time in it are on the ladder -
     a leaderboard of people who queued once is not a leaderboard. */
  function standings(state, opts) {
    opts = opts || {};
    var d = PN.sim.live(state) || state.design;
    if (!d.pvp || !d.pvp.enabled) return { season: seasonOf(state), rows: [], empty: true };
    var season = seasonOf(state);
    var floor = (d.pvp.ratingFloor === undefined ? 1500 : d.pvp.ratingFloor);

    state.__ladderBuilds = {};
    var rows = [];
    (state.agents || []).forEach(function (a) {
      var played = a.pvpWeeks || 0;
      if (played < 1) return;
      var power = powerOf(state, a);
      /* Rating is power plus the time they have put in this season, with
         a little noise that is stable per player rather than reshuffled
         every time you open the screen. */
      var rng = new U.Rng((a.seed || a.id || 1) + season.index * 7919);
      var luck = (rng.next() - 0.5) * 0.10;
      var grind = U.clamp01(played / Math.max(2, season.length * 0.7));
      var rating = floor + (power + luck) * 1400 + grind * 320;
      rows.push({
        agent: a, rating: Math.round(rating), power: power,
        weeks: played, wins: a.pvpWins || 0, losses: a.pvpLosses || 0
      });
    });
    rows.sort(function (x, y) { return y.rating - x.rating; });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    /* How many are on the ladder at all, counted before any limit -
       asking for the top one should not report a ladder of one. */
    var total = rows.length;
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return { season: season, rows: rows, empty: total === 0,
             floor: floor, total: total };
  }

  /* What the ladder says about your balance: if one playable owns the
     top of it, that is a balance problem with names attached. */
  function topHeavy(state, n) {
    var s = standings(state, { limit: n || 100 });
    var by = {};
    s.rows.forEach(function (r) {
      var k = r.agent.cls || 'unknown';
      by[k] = (by[k] || 0) + 1;
    });
    var out = U.keys(by).map(function (k) {
      var p = PN.schema.playableById(PN.sim.live(state) || state.design, k);
      return { id: k, name: p ? (p.playableName || p.name) : 'Unknown', n: by[k] };
    }).sort(function (a, b) { return b.n - a.n; });
    return { total: s.rows.length, byPlayable: out };
  }

  /* Season rollover: the board is wiped and last season's top is kept as
     a record. Called from the weekly tick. */
  function tickSeason(state) {
    var d = PN.sim.live(state) || state.design;
    if (!d.pvp || !d.pvp.enabled) return null;
    var season = seasonOf(state);
    if (state.ladderSeason === season.index) return null;
    var ending = state.ladderSeason;
    state.ladderSeason = season.index;
    if (ending === undefined) return null;

    /* Record who won it before wiping. */
    var final = standings(state, {});
    state.ladderHistory = state.ladderHistory || [];
    state.ladderHistory.unshift({
      season: ending, week: state.week,
      ranked: final.rows.length,
      top: final.rows.slice(0, 10).map(function (r) {
        return { name: r.agent.nm, cls: r.agent.cls, rating: r.rating };
      })
    });
    if (state.ladderHistory.length > 20) state.ladderHistory.length = 20;

    /* Who comes back.

       A wiped ladder used to be repopulated by whoever happened to
       queue most in the following weeks, so the board was a different
       set of strangers every season and nothing carried. That is not
       how a ladder works: the people who finished near the top of one
       season are the people who turn up for the next one. They are
       invested, and they know they can do it.

       So the top half of a finishing board becomes a regular. Being a
       regular is an appetite for queueing, not a rating - they come
       back and play, and where they land is still decided by what
       they are playing and how they are geared. Anybody who does not
       make the top half loses a season of standing, which is how the
       board turns over and a newcomer gets in. And a regular can
       still quit: nothing here stops them churning out of the game
       like everybody else. */
    var half = Math.ceil(final.rows.length / 2);
    var returning = {};
    final.rows.slice(0, half).forEach(function (r) {
      var a = r.agent;
      returning[a.id] = 1;
      a.ladderVet = Math.min(6, (a.ladderVet || 0) + 1);
      a.ladderBest = Math.min(a.ladderBest || 1e9, r.rank);
    });
    (state.agents || []).forEach(function (a) {
      if (!returning[a.id] && a.ladderVet) a.ladderVet = Math.max(0, a.ladderVet - 1);
      a.pvpWeeks = 0; a.pvpWins = 0; a.pvpLosses = 0;
    });
    state.ladderReturning = U.keys(returning).length;

    return { season: ending, top: final.rows[0] || null,
             ranked: final.rows.length, returning: state.ladderReturning };
  }

  /* How much of a ladder regular somebody is, 0-1. Read by the weekly
     tick, which turns it into an appetite for queueing. */
  function regularity(agent) {
    return U.clamp01((agent.ladderVet || 0) / 4);
  }

  PN.ladder = { seasonOf: seasonOf, powerOf: powerOf, standings: standings,
                fieldPower: fieldPower, winChance: winChance,
                topHeavy: topHeavy, tickSeason: tickSeason,
                regularity: regularity };
})(PN);
