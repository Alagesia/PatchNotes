/* Patch Notes - guilds.
   A real social graph. Players belong to guilds, guilds have cohesion
   and progress, and when a guild's core leaves the periphery follows.
   This is the strongest retention system in the genre and the hardest
   one to see in a dashboard.                                            */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax;

  var FOCUSES = [
    { id: 'raid',   name: 'Raiding',   archetypes: ['raider', 'progressor', 'creator'], cohesion: 0.62 },
    { id: 'pvp',    name: 'PvP',       archetypes: ['competitor', 'creator'],           cohesion: 0.48 },
    { id: 'social', name: 'Social',    archetypes: ['socialite', 'roleplayer'],         cohesion: 0.78 },
    { id: 'casual', name: 'Casual',    archetypes: ['drifter', 'progressor', 'explorer'], cohesion: 0.40 },
    { id: 'trade',  name: 'Trading',   archetypes: ['economist', 'completionist'],      cohesion: 0.45 }
  ];
  var FOCUS_BY_ID = {};
  FOCUSES.forEach(function (f) { FOCUS_BY_ID[f.id] = f; });

  var NAME_A = ['Iron', 'Ashen', 'Silent', 'Crimson', 'Wandering', 'Gilded', 'Last',
                'Hollow', 'Verdant', 'Storm', 'Midnight', 'Broken'];
  var NAME_B = ['Vanguard', 'Covenant', 'Compact', 'Legion', 'Circle', 'Company',
                'Accord', 'Order', 'Collective', 'Pact', 'Banner', 'Watch'];

  function byId(state, id) { return U.byId(state.guilds || [], id); }

  function create(state, focusId, rng) {
    var focus = FOCUS_BY_ID[focusId] || FOCUSES[3];
    var g = {
      id: U.id('gld'),
      name: rng.pick(NAME_A) + ' ' + rng.pick(NAME_B),
      focus: focus.id,
      cohesion: focus.cohesion * U.clamp(rng.normal(1, 0.15), 0.6, 1.3),
      progress: 0,
      size: 0,
      peak: 0,
      founded: state.week,
      dead: false
    };
    state.guilds.push(g);
    return g;
  }

  /* How much guild infrastructure the design actually provides. */
  function support(design) {
    return U.clamp01(
      0.20 +
      U.saturate(design.social.guildSize, 70) * 0.26 +
      (design.social.guildPerks ? 0.10 : 0) +
      (design.social.guildProgression ? 0.16 : 0) +
      (design.social.guildHalls ? 0.10 : 0) +
      (design.social.guildFinder ? 0.08 : 0) +
      (design.social.voiceChat ? 0.06 : 0) +
      (design.social.communityTools / 100) * 0.14
    );
  }

  /* A new player looks for a guild. Whether they find one depends on
     what the design gives them to find it with.                       */
  function maybeJoin(state, agent, ctx) {
    var d = ctx.world ? ctx.world.design : PN.sim.live(state);
    var arch = tax.ARCHETYPE_BY_ID[agent.a];
    var sup = support(d);
    var appetite = arch.appeal.social * (0.4 + sup) * (d.social.guildFinder ? 1.25 : 1);
    if (!ctx.rng.chance(U.clamp01(appetite * 0.55))) return null;

    /* Prefer a guild whose focus matches the archetype and that has room.

       Room is measured in PLAYERS, and one agent stands for however
       many the roster compacted into them. Checking the cap against a
       headcount of agents while the weekly recount reported players is
       how a hundred-member guild came to report fourteen hundred. */
    var cap = d.social.guildSize;
    var joining = agent.w || 1;
    var candidates = (state.guilds || []).filter(function (g) {
      return !g.dead && g.size + joining <= cap;
    });
    var preferred = candidates.filter(function (g) {
      return FOCUS_BY_ID[g.focus].archetypes.indexOf(agent.a) >= 0;
    });
    var pool = preferred.length ? preferred : candidates;

    var g;
    if (!pool.length || ctx.rng.chance(0.06)) {
      /* Found a new one. */
      var focus = null;
      FOCUSES.forEach(function (f) {
        if (!focus && f.archetypes.indexOf(agent.a) >= 0) focus = f;
      });
      g = create(state, focus ? focus.id : 'casual', ctx.rng);
    } else {
      g = ctx.rng.pick(pool);
    }
    agent.gid = g.id;
    g.size += joining;
    g.peak = Math.max(g.peak, g.size);
    return g;
  }

  function leave(state, agent) {
    var agentWeight = agent.w || 1;
    var g = byId(state, agent.gid);
    agent.gid = null;
    if (!g) return;
    g.size = Math.max(0, g.size - (agentWeight || 1));
    /* Losing people erodes cohesion, which makes losing more people
       easier. This is the contagion.                               */
    if (g.peak > 0) {
      var lossRate = 1 - (g.size / Math.max(1, g.peak));
      g.cohesion = U.clamp01(g.cohesion - 0.012 - lossRate * 0.02);
    }
    if (g.size <= 1) { g.dead = true; g.cohesion = 0; }
  }

  /* Weekly: guilds progress, decay, collapse, and take people with them. */
  function tick(state, ctx) {
    var d = ctx.world.design;
    var sup = support(d);
    var out = { guilds: 0, collapsed: 0, members: 0, avgCohesion: 0 };
    if (!state.guilds) state.guilds = [];
    var cap = Math.max(2, (d.social || {}).guildSize || 100);

    /* Recount membership from the agents themselves - the graph is the
       source of truth, not a cached number.                          */
    var counts = {}, members = {};
    state.agents.forEach(function (a) {
      if (!a.gid) return;
      counts[a.gid] = (counts[a.gid] || 0) + a.w;
      (members[a.gid] = members[a.gid] || []).push(a);
    });

    for (var i = state.guilds.length - 1; i >= 0; i--) {
      var g = state.guilds[i];
      /* The recount is the truth, in players. A guild that has grown
         past what the design allows sheds its newest members rather
         than quietly reporting a number the game said was impossible. */
      g.size = counts[g.id] || 0;
      /* A roster compacts as the population grows, so an agent that
         stood for one player can come to stand for twenty and carry
         a guild past its cap without anybody joining. The overflow
         leaves, newest first, the way a real guild handles it. */
      if ((counts[g.id] || 0) > cap && members[g.id]) {
        var roster = members[g.id].slice().sort(function (x, y) {
          return (x.t || 0) - (y.t || 0);       /* least time played first */
        });
        var over = counts[g.id] - cap;
        for (var ri = 0; ri < roster.length && over > 0; ri++) {
          over -= roster[ri].w || 1;
          counts[g.id] -= roster[ri].w || 1;
          roster[ri].gid = null;
        }
      }
      g.size = Math.min(counts[g.id] || 0, cap);
      if (g.size <= 0) {
        if (state.week - g.founded > 2) {
          state.guilds.splice(i, 1);
          out.collapsed++;
        }
        continue;
      }
      g.peak = Math.max(g.peak, g.size);

      /* Raiding guilds live or die on having content to raid. */
      var focus = FOCUS_BY_ID[g.focus];
      var contentPressure = focus.id === 'raid'
        ? U.clamp(1 - state.runtime.weeksSinceContent / 26, -0.4, 1)
        : focus.id === 'pvp'
          ? U.clamp((ctx.balance ? ctx.balance.quality : 60) / 100, 0.2, 1)
          : 0.6;

      var target = focus.cohesion * (0.55 + sup * 0.75) *
                   (0.55 + contentPressure * 0.55) *
                   (0.7 + (state.runtime.sentiment / 100) * 0.5);
      g.cohesion += (U.clamp01(target) - g.cohesion) * 0.16;

      if (focus.id === 'raid' && state.runtime.weeksSinceContent < 6) g.progress += 1;
      if (g.cohesion < 0.12 && g.size < g.peak * 0.4) {
        g.dead = true;
        out.collapsed++;
      }

      out.guilds++;
      out.members += g.size;
      out.avgCohesion += g.cohesion;
    }
    if (out.guilds > 0) out.avgCohesion /= out.guilds;

    /* A dead guild scatters its remaining members. */
    state.agents.forEach(function (a) {
      if (!a.gid) return;
      var gg = byId(state, a.gid);
      if (!gg || gg.dead) a.gid = null;
    });

    out.guildedShare = state.population.total > 0 ? out.members / state.population.total : 0;
    return out;
  }

  /* The guilds that matter, for the UI. */
  function top(state, n) {
    return (state.guilds || []).filter(function (g) { return !g.dead && g.size > 0; })
      .sort(function (a, b) { return b.size - a.size; })
      .slice(0, n || 12);
  }

  PN.guilds = {
    FOCUSES: FOCUSES, FOCUS_BY_ID: FOCUS_BY_ID,
    byId: byId, create: create, support: support,
    maybeJoin: maybeJoin, leave: leave, tick: tick, top: top
  };
})(PN);
