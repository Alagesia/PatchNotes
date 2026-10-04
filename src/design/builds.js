/* Patch Notes - builds.

   A class is not what a player plays. A build is: a class or talent
   branch, played in a particular role, geared around a particular primary
   stat. The same Warrior kit is a Strength tank or a Strength damage
   build; a kit with heals in it can be played as a healer by someone who
   wants to heal and as damage by someone who does not.

   Two things fall out of taking that seriously.

   First, balance is per build, not per class. "Warriors are fine" is a
   sentence about an average that nobody plays. If the tank build is
   miserable and the damage build is dominant, the class is broken and the
   class-level number hides it.

   Second, players do not all chase the strongest build. Every agent has a
   stable taste - a role they want to play and a stat fantasy they like -
   and how much they let the tier list override that depends on who they
   are. Competitors re-roll for a 2% gain. Roleplayers play the healer
   because they like healing and will do it in a bad patch.            */
(function (PN) {
  'use strict';
  var U = PN.util, AB = PN.abilities, ST = PN.stats;

  var ROLES = [
    { id: 'tank',   name: 'Tank',   scarce: 1.0,
      desc: 'Holds the boss and eats the damage. Always the shortest queue.' },
    { id: 'healer', name: 'Healer', scarce: 0.85,
      desc: 'Keeps the group alive. Thankless, indispensable, always short.' },
    { id: 'dps',    name: 'Damage', scarce: 0.0,
      desc: 'Deals damage. Where everyone goes if you let them.' }
  ];
  var ROLE_BY_ID = {};
  ROLES.forEach(function (r) { ROLE_BY_ID[r.id] = r; });

  /* --------------------------------------------------- role capability --

     Whether a kit can actually do a job, read off the abilities rather
     than off the label the designer typed. A "tank" with no taunt and no
     mitigation is not a tank, whatever the class page says.           */
  function capability(design, playable) {
    var abs = AB.abilitiesOf(design, playable);
    var cap = { tank: 0, healer: 0, dps: 0 };
    abs.forEach(function (ab) {
      (ab.effects || []).forEach(function (e) {
        switch (e.type) {
          case 'taunt': cap.tank += 3; break;
          case 'threat': cap.tank += 2; break;
          case 'mitigate': case 'immunity': case 'avoidance': cap.tank += 1.6; break;
          case 'absorb': cap.tank += 0.8; cap.healer += 1.4; break;
          case 'heal': case 'hot': cap.healer += 2.2; break;
          case 'resurrect': case 'cleanse': cap.healer += 0.7; break;
          case 'damage': case 'dot': case 'execute': cap.dps += 1.4; break;
          case 'summon': cap.dps += 0.8; break;
          default: break;
        }
      });
    });
    return cap;
  }

  /* A role is playable if the kit clears a real bar for it. */
  function rolesFor(design, playable) {
    var cap = capability(design, playable);
    var out = [];
    if (cap.tank >= 4) out.push('tank');
    if (cap.healer >= 4) out.push('healer');
    if (cap.dps >= 4) out.push('dps');
    /* Whatever the kit is best at, it can always do - otherwise a thin
       kit would have no builds at all and its players would vanish. */
    if (!out.length) {
      var best = 'dps', bv = -1;
      U.keys(cap).forEach(function (k) { if (cap[k] > bv) { bv = cap[k]; best = k; } });
      out.push(best);
    }
    /* The authored role is always offered, so a designer's intent is
       never silently discarded. */
    if (playable.role && playable.role !== 'hybrid' && out.indexOf(playable.role) < 0)
      out.push(playable.role);
    return out;
  }

  /* ------------------------------------------------------- stat choices --

     Which primary stats this kit can sensibly gear around. Derived from
     what its abilities scale off, so a custom primary the player invented
     works exactly like Strength does.                                  */
  function statsFor(design, playable, role) {
    var s = ST.statSetOf(design);
    if (!s.primaries.length) return [];
    /* An explicit choice on the class overrides everything. */
    if (playable.primaryStat) {
      var fixed = U.byId(s.primaries, playable.primaryStat);
      if (fixed) return [fixed];
    }
    /* Weight by how much of the kit's output each stat actually drives.
       An ability that names Dexterity credits Dexterity alone; one that
       says only "attack power" credits every attack-power stat, so a kit
       written the loose way still opens both Strength and Dexterity and
       the author can split them apart ability by ability.

       One shadow-school utility button does not make Intellect a viable
       way to gear a rogue, so a stat has to carry a real share of the kit
       before it opens up as a build. Below this the build exists but can
       never be good, which is not a choice - it is a trap. */
    var split = AB.statSplit(design, AB.abilitiesOf(design, playable));
    var MIN_SHARE = 0.40;
    var pool = s.primaries.filter(function (p) {
      if (split.total <= 0) return true;  /* a kit with no scaling gears anyhow */
      return split.shareOf(p) >= MIN_SHARE;
    });
    if (!pool.length) {
      /* Nothing cleared the bar, so take whatever the kit leans on most -
         a class always has somewhere to put its points. */
      var best = -1;
      s.primaries.forEach(function (p) { best = Math.max(best, split.shareOf(p)); });
      pool = s.primaries.filter(function (p) { return split.shareOf(p) >= best - 0.001; });
    }
    if (!pool.length) pool = s.primaries.slice();
    /* Prefer primaries that name this role, but keep any the kit can
       physically use - an off-meta stat build is still a build. */
    var named = pool.filter(function (p) { return (p.roles || []).indexOf(role) >= 0; });
    return named.length ? named : pool;
  }


  /* ------------------------------------------------------- enumeration --

     Every combination the authored design actually supports. This is the
     list the balance table is built from.                             */
  /* Memoised against the design. This clones a playable per build and
     is called from inside per-agent loops - primaryOf, powerOf, the
     consumable ranking - so rebuilding it thousands of times a week
     was most of a tick. */
  var enumerate = U.memoDesign(function (design) {
    var out = [];
    PN.schema.playable(design).forEach(function (p) {
      rolesFor(design, p).forEach(function (role) {
        statsFor(design, p, role).forEach(function (stat) {
          out.push(make(design, p, role, stat));
        });
      });
    });
    return out;
  });

  function buildId(playableId, role, statId) {
    return playableId + '|' + role + '|' + statId;
  }

  /* A build is class-shaped, so the rotation solver, the metrics and the
     agent sim all take it without knowing it is a build. */
  function make(design, playable, role, stat) {
    var b = U.clone(playable);
    b.playableId = playable.id;
    b.id = buildId(playable.id, role, stat.id);
    b.role = role;
    b.primaryStat = stat.id;
    b.buildRole = role;
    b.buildStat = stat.id;
    b.statName = stat.name;
    b.playableName = playable.name;
    b.name = playable.name + ' · ' + (ROLE_BY_ID[role] || {}).name + ' (' + stat.name + ')';
    b.shortName = (ROLE_BY_ID[role] || {}).name + ' ' + stat.name;
    b.isBuild = true;
    return b;
  }

  function byId(design, id) { return U.byId(enumerate(design), id); }

  /* Builds grouped by the thing they are built out of. */
  function groupByPlayable(design) {
    var groups = {};
    enumerate(design).forEach(function (b) {
      (groups[b.playableId] = groups[b.playableId] || []).push(b);
    });
    return groups;
  }

  /* ------------------------------------------------------------- taste --

     A stable per-player preference. Seeded off the agent so it never
     drifts, and strong enough that most players are not playing the best
     build in the game.                                                */

  /* How much each archetype cares about the tier list at all. */
  var META_PULL = {
    competitor: 1.00, raider: 0.85, progressor: 0.55, completionist: 0.50,
    economist: 0.35, explorer: 0.28, drifter: 0.25, creator: 0.22,
    socialite: 0.18, roleplayer: 0.10
  };
  /* And which jobs they are drawn to before power enters the question.
     Somebody has to tank, and it is usually the people who like it. */
  var ROLE_TASTE = {
    progressor:    { tank: 0.9, healer: 0.9, dps: 1.2 },
    raider:        { tank: 1.3, healer: 1.3, dps: 1.0 },
    competitor:    { tank: 0.7, healer: 0.6, dps: 1.5 },
    socialite:     { tank: 0.8, healer: 1.9, dps: 0.8 },
    explorer:      { tank: 0.8, healer: 0.7, dps: 1.2 },
    completionist: { tank: 1.1, healer: 1.1, dps: 1.0 },
    economist:     { tank: 0.6, healer: 0.8, dps: 1.1 },
    roleplayer:    { tank: 1.2, healer: 1.6, dps: 0.9 },
    drifter:       { tank: 0.6, healer: 0.7, dps: 1.4 },
    creator:       { tank: 0.7, healer: 0.8, dps: 1.4 }
  };

  function metaPull(archId) {
    return META_PULL[archId] === undefined ? 0.5 : META_PULL[archId];
  }
  function roleTaste(archId, role) {
    var t = ROLE_TASTE[archId];
    return t && t[role] !== undefined ? t[role] : 1;
  }

  /* Pick a build for one player. Taste first, power second, and how much
     power matters depends on who they are.                            */
  function choose(design, archId, rng, opts) {
    opts = opts || {};
    var list = opts.builds || enumerate(design);
    if (!list.length) return null;
    var scores = opts.scores || null;       /* buildId -> 0..100 power score */
    var shortage = opts.shortage || null;   /* roleId  -> 0..1 how badly needed */
    var pull = metaPull(archId);

    /* A personal stat fantasy: this player just likes Agility. Stable,
       because it is drawn once when they are created. */
    var statBias = {};
    var s = ST.statSetOf(design);
    s.primaries.forEach(function (p) { statBias[p.id] = 0.7 + rng.next() * 0.9; });

    return rng.weighted(list, function (b) {
      var w = roleTaste(archId, b.buildRole) * (statBias[b.buildStat] || 1);

      /* The tier list, as far as this player cares about it. */
      if (scores) {
        var sc = scores[b.id];
        if (sc !== undefined) {
          /* Normalised around 50, so a strong build is a multiplier and a
             weak one is a penalty - scaled by how much they care. */
          w *= 1 + ((sc - 50) / 50) * pull;
        }
      }
      /* Nobody wants to be the tank until the queue is thirty minutes
         long. Group content creates its own pressure. */
      if (shortage && shortage[b.buildRole]) {
        w *= 1 + shortage[b.buildRole] * (0.35 + pull * 0.5);
      }
      return Math.max(0.01, w);
    });
  }

  /* How short the game is of each role, given who is playing right now
     and what group content demands. A 5-player dungeon wanting 1 tank
     and 1 healer means the game needs 20% tanks.                      */
  function roleShortage(design, counts) {
    var want = groupDemand(design);
    var total = 0;
    U.keys(counts).forEach(function (k) { total += counts[k] || 0; });
    var out = { tank: 0, healer: 0, dps: 0 };
    if (total <= 0) return out;
    ROLES.forEach(function (r) {
      var have = (counts[r.id] || 0) / total;
      var need = want[r.id];
      if (need <= 0) return;
      out[r.id] = U.clamp01((need - have) / need);
    });
    return out;
  }

  /* The role mix the authored group content actually asks for.

     Weighted towards the content people run most: a 25-player raid is run
     once a week by a minority, a 5-player dungeon is run constantly by
     everyone, so the dungeon decides what the game needs. Averaging the
     two flat says a game needs 7% tanks, which is not how a queue works. */
  function groupDemand(design) {
    if (design.identity.roles === 'none') return { tank: 0, healer: 0, dps: 1 };
    var dungeons = (design.dungeons || []);
    var small = dungeons.filter(function (d) { return d.kind !== 'raid'; });
    var pool = small.length ? small : dungeons;
    var size = pool.length ? U.avg(pool, function (d) { return d.groupSize || 5; }) : 5;
    size = Math.max(2, Math.round(size));
    /* One tank per group, a healer per five or so, everyone else damage. */
    var tanks = size >= 20 ? 2 : 1;
    var healers = Math.max(1, Math.round(size / 5));
    var dps = Math.max(1, size - tanks - healers);
    var t = tanks + healers + dps;
    return { tank: tanks / t, healer: healers / t, dps: dps / t, size: size };
  }

  /* What the population is actually playing, weighted by agent weight. */
  function roleCounts(state) {
    var out = { tank: 0, healer: 0, dps: 0 };
    (state.agents || []).forEach(function (a) {
      var r = a.role || 'dps';
      out[r] = (out[r] || 0) + a.w;
    });
    return out;
  }

  PN.builds = {
    ROLES: ROLES, ROLE_BY_ID: ROLE_BY_ID,
    META_PULL: META_PULL, ROLE_TASTE: ROLE_TASTE,
    metaPull: metaPull, roleTaste: roleTaste,
    capability: capability, rolesFor: rolesFor, statsFor: statsFor,
    enumerate: enumerate, byId: byId, make: make, buildId: buildId,
    groupByPlayable: groupByPlayable,
    choose: choose, roleShortage: roleShortage, groupDemand: groupDemand,
    roleCounts: roleCounts
  };
})(window.PN);
