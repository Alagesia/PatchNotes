/* Patch Notes - races.

   A class is what you do. A race is who you are while you do it, and in
   this genre that has always meant a small percentage nobody can see and
   everybody argues about.

   Races are OPTIONAL. A design with none behaves exactly as it did
   before this file existed: one character choice, no second axis, no
   extra column in the balance table. Author one and it turns on.

   What a race gives is a handful of percentages - a stat, movement,
   damage taken - and those percentages land on the SAME profile fields a
   talent branch lands on. That is the whole trick: the combat solver
   already knows how to read "this character has +5% Strength", so it
   does not need to learn what a race is. A Human Archer and a Dwarf
   Archer are two profiles, not two systems.

   ------------------------------------------------------------------
   The part that matters for balance

   Combining R races with B builds gives R x B playable combinations, and
   most of them are bad on purpose. A Strength race handed to an
   Intellect caster does nothing at all; a movement-speed race is wasted
   on a tank who stands still. If every combination went into the spread,
   the measured balance of the game would be dominated by combinations no
   informed player would ever roll, and adding a fourth race would look
   like a balance regression.

   That is not how anybody talks about balance. The question is never
   "how does the worst Dwarf Paladin compare to the best Human Paladin" -
   it is "how does a Paladin compare to a Warrior, assuming both players
   picked sensibly". So each BUILD is measured at its BEST race, and the
   spread is between those. A race that suits nothing is a dead option,
   not an imbalance; a race that is mandatory for one class and useless
   for the rest is exactly the thing this model is built to show.      */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* ------------------------------------------------------------ bonuses

     Every one of these is a percentage, and every one of them maps onto
     a field the solver already honours - which is why a race needs no
     special case anywhere in combat.js. */
  var BONUS_KINDS = [
    { id: 'stat', name: 'Primary stat', needsStat: true, mod: null,
      lo: -10, hi: 15,
      desc: 'A percentage on one stat. Worth everything to a build that ' +
            'gears that stat and nothing at all to one that does not.' },
    { id: 'dmg', name: 'Damage done', mod: 'dmg', lo: -6, hi: 8,
      desc: 'Flat damage, to everyone, always. The least interesting and ' +
            'the hardest to ignore.' },
    { id: 'heal', name: 'Healing done', mod: 'heal', lo: -6, hi: 8,
      desc: 'Only healers notice, and they notice immediately.' },
    { id: 'dmgTaken', name: 'Damage taken', mod: 'mit', invert: true,
      lo: -8, hi: 6,
      desc: 'Negative is tougher. Tanks feel this more than anyone, which ' +
            'is how a race ends up mandatory for one job.' },
    { id: 'hp', name: 'Maximum health', mod: 'hp', lo: -8, hi: 10,
      desc: 'A bigger health bar. Reads as survivability everywhere and ' +
            'matters most where healing is scarce.' },
    { id: 'res', name: 'Resource economy', mod: 'res', lo: -8, hi: 12,
      desc: 'More casts before you run dry. Changes a rotation more than ' +
            'damage does.' },
    { id: 'cdr', name: 'Cooldown recovery', mod: 'cdr', lo: -6, hi: 8,
      desc: 'Your buttons come back sooner. Quietly the strongest thing ' +
            'on this list.' },
    { id: 'threat', name: 'Threat', mod: 'threat', lo: -15, hi: 20,
      desc: 'Only a tank cares, and a tank cares a lot.' },
    { id: 'move', name: 'Movement speed', mod: 'move', lo: -5, hi: 8,
      desc: 'Everywhere outside a boss fight, and in about a third of them. ' +
            'Players value this far above what it tests as.' }
  ];
  var BONUS_BY_ID = {};
  BONUS_KINDS.forEach(function (k) { BONUS_BY_ID[k.id] = k; });

  /* ------------------------------------------------------------ a race */

  function newRace(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('race'),
      name: opts.name || 'New Race',
      blurb: opts.blurb || '',
      /* [{ kind, statId?, pct }] */
      bonuses: opts.bonuses ? U.clone(opts.bonuses) : [],
      /* Which classes or branches may pick it. Empty means all of them,
         which is the sane default - a restriction should be something
         the author went out of their way to write. */
      allow: opts.allow ? opts.allow.slice() : []
    };
  }

  function racesOf(design) { return (design && design.races) || []; }
  function raceById(design, id) { return U.byId(racesOf(design), id); }

  /* Authored at least one? Then the game has races. */
  function enabled(design) { return racesOf(design).length > 0; }

  /* ------------------------------------------------- who may play what

     A race with no allow list is open to everybody. One with a list is
     open to exactly that list - which is the "not every race works with
     every class" case, written down rather than implied. */
  function allows(race, playableId) {
    if (!race) return true;
    if (!race.allow || !race.allow.length) return true;
    return race.allow.indexOf(playableId) >= 0;
  }

  /* Every race a given build could legally roll. */
  function legalFor(design, build) {
    if (!enabled(design)) return [];
    var pid = build && (build.playableId || build.id);
    return racesOf(design).filter(function (r) { return allows(r, pid); });
  }

  /* ------------------------------------------------ folding one in

     The bonuses land on talentStats and talentMods, which is where a
     compiled talent branch already puts its percentages - so the solver
     reads a race and a talent build through the same two fields and
     cannot tell them apart. That is deliberate: a race IS a small talent
     branch you did not choose. */
  function applyTo(design, build, race) {
    if (!race || !build) return build;
    var b = U.clone(build);
    b.talentStats = U.merge({}, b.talentStats || {});
    b.talentMods = U.merge({}, b.talentMods || {});
    (race.bonuses || []).forEach(function (bn) {
      var kind = BONUS_BY_ID[bn.kind];
      if (!kind || !bn.pct) return;
      if (kind.needsStat) {
        if (!bn.statId) return;
        b.talentStats[bn.statId] = (b.talentStats[bn.statId] || 0) + bn.pct;
        return;
      }
      /* "Damage taken -2%" is "mitigation +2%" to the solver. */
      var v = kind.invert ? -bn.pct : bn.pct;
      b.talentMods[kind.mod] = (b.talentMods[kind.mod] || 0) + v;
    });
    b.raceId = race.id;
    b.raceName = race.name;
    b.name = race.name + ' ' + (build.name || '');
    return b;
  }

  /* ------------------------------------------------- which one is best

     Picking the best race by running the full combat solver once per
     race per build is the honest way and about five times too slow: the
     balance table is rebuilt every week of every save. So the CHOICE is
     made on a cheap model of what each bonus is worth to this particular
     build, and only the winner is then evaluated for real.

     The cheap model does not have to be exactly right. It has to put the
     right race first, and the bonuses are small enough and few enough
     that a weighting per role does that.                              */

  /* How much a build actually gears a given stat, 0..1. A race's stat
     bonus is worth that share of its face value. */
  function statShare(design, build, statId) {
    if (build.buildStat === statId || build.primaryStat === statId) return 1;
    try {
      var split = PN.abilities.statSplit(design, PN.abilities.abilitiesOf(design, build));
      if (split.total <= 0) return 0.25;
      var s = PN.stats.statSetOf(design);
      var st = U.byId(s.primaries, statId);
      /* A stat the kit uses but does not gear is worth something, but
         not much - you are not wearing it. */
      return st ? U.clamp01(split.shareOf(st)) * 0.45 : 0.1;
    } catch (e) { return 0.2; }
  }

  /* What one percentage point of each bonus is worth to each job.
     Mirrors the weights pveScore uses, because that is the number a
     player is ultimately being ranked by. */
  var WORTH = {
    tank:   { stat: 0.55, dmg: 0.14, heal: 0.02, dmgTaken: 1.30, hp: 1.05,
              res: 0.16, cdr: 0.55, threat: 0.30, move: 0.10 },
    healer: { stat: 0.85, dmg: 0.04, heal: 1.15, dmgTaken: 0.22, hp: 0.18,
              res: 0.70, cdr: 0.60, threat: 0.00, move: 0.12 },
    dps:    { stat: 0.95, dmg: 1.20, heal: 0.02, dmgTaken: 0.10, hp: 0.08,
              res: 0.35, cdr: 0.65, threat: -0.05, move: 0.14 },
    hybrid: { stat: 0.80, dmg: 0.55, heal: 0.45, dmgTaken: 0.30, hp: 0.25,
              res: 0.45, cdr: 0.60, threat: 0.05, move: 0.14 }
  };

  /* A single number: how much better this build is for taking this race.
     Zero means the race does nothing for them. */
  function scoreFor(design, build, race) {
    if (!race) return 0;
    var role = build.buildRole || build.role || 'dps';
    var w = WORTH[role] || WORTH.dps;
    var total = 0;
    (race.bonuses || []).forEach(function (bn) {
      var kind = BONUS_BY_ID[bn.kind];
      if (!kind || !bn.pct) return;
      var worth = w[bn.kind] === undefined ? 0.3 : w[bn.kind];
      /* Damage taken is written negative-is-good, so flip it into
         "how much this helps" before weighting. */
      var v = kind.invert ? -bn.pct : bn.pct;
      if (kind.needsStat) v = bn.pct * statShare(design, build, bn.statId);
      total += v * worth;
    });
    return total;
  }

  /* The race this build wants, or null when the game has no races. */
  function bestFor(design, build) {
    var pool = legalFor(design, build);
    if (!pool.length) return null;
    var best = null, bestScore = -Infinity;
    pool.forEach(function (r) {
      var sc = scoreFor(design, build, r);
      /* Ties go to the first authored, so the table is stable between
         weeks rather than flickering on a coin toss. */
      if (sc > bestScore + 1e-9) { bestScore = sc; best = r; }
    });
    return best;
  }

  /* Best race folded in, ready for the solver. The identity when the
     design has no races, which is what keeps this file free. */
  function bestBuild(design, build) {
    var r = bestFor(design, build);
    return r ? applyTo(design, build, r) : build;
  }

  /* ------------------------------------------------------ for the UI

     Every race ranked for one build, so the editor can show which
     classes a race is for without the author working it out. */
  function rankFor(design, build) {
    return legalFor(design, build).map(function (r) {
      return { race: r, score: scoreFor(design, build, r) };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* And the other direction: which builds want this race most. */
  function suitedTo(design, race) {
    var out = [];
    PN.builds.enumerate(design).forEach(function (b) {
      if (!allows(race, b.playableId)) return;
      out.push({ build: b, score: scoreFor(design, b, race) });
    });
    return out.sort(function (a, b) { return b.score - a.score; });
  }

  /* How lopsided the race list is. A set where one race wins every job
     is a set with one race in it, whatever the character screen says. */
  function diversity(design) {
    if (!enabled(design)) return { races: 0, used: 0, share: 0, dominant: null };
    var builds = PN.builds.enumerate(design);
    if (!builds.length) return { races: racesOf(design).length, used: 0, share: 0, dominant: null };
    var counts = {};
    builds.forEach(function (b) {
      var r = bestFor(design, b);
      if (r) counts[r.id] = (counts[r.id] || 0) + 1;
    });
    var ids = U.keys(counts), top = null, topN = 0;
    ids.forEach(function (id) { if (counts[id] > topN) { topN = counts[id]; top = id; } });
    return {
      races: racesOf(design).length,
      used: ids.length,
      share: builds.length ? topN / builds.length : 0,
      dominant: top ? raceById(design, top) : null,
      counts: counts
    };
  }

  /* --------------------------------------------------- what an agent is

     A player is not a spreadsheet. How closely they chase the optimal
     race is the same question as how closely they chase the optimal
     build, so it uses the same pull - a competitor rolls the right race,
     a roleplayer rolls the one they like the look of. */
  function chooseFor(design, build, archId, rng) {
    var pool = legalFor(design, build);
    if (!pool.length) return null;
    var pull = PN.builds.metaPull ? PN.builds.metaPull(archId) : 0.5;
    var scores = pool.map(function (r) { return scoreFor(design, build, r); });
    var best = Math.max.apply(null, scores.concat([0.001]));
    return rng.weighted(pool, function (r, i) {
      var rel = best > 0 ? scores[i] / best : 1;
      /* At full pull the best race is several times likelier; at no
         pull every race is a coin toss. */
      return Math.max(0.02, 1 + (rel - 0.5) * 2.4 * pull);
    });
  }

  PN.races = {
    BONUS_KINDS: BONUS_KINDS, BONUS_BY_ID: BONUS_BY_ID,
    newRace: newRace, racesOf: racesOf, raceById: raceById,
    enabled: enabled, allows: allows, legalFor: legalFor,
    applyTo: applyTo, scoreFor: scoreFor, bestFor: bestFor,
    bestBuild: bestBuild, rankFor: rankFor, suitedTo: suitedTo,
    diversity: diversity, chooseFor: chooseFor
  };
})(window.PN);
