/* Patch Notes - the portfolio.

   A studio is not a game. It has a name, a bank balance, a team and a
   founding year, and it can be running several MMOs at once - a flagship,
   a struggling second title, a sequel that is eating its own parent.

   The whole simulation below this file was written against a single game
   living directly on `state` (state.design, state.agents, state.economy
   and so on). Rewriting every one of those call sites would have been a
   thousand-line edit with a thousand chances to mix two games' players
   together. Instead exactly one title is ever MOUNTED on the state at a
   time: its fields sit where they always did, and the others wait as
   plain records in `state.titles`. The weekly tick mounts each title in
   turn, advances it, and dismounts it.

   That makes TITLE_FIELDS the most important list in the file. A field
   that belongs to a game but is missing from it would leak across every
   title in the portfolio, so it is defined once and used for both
   directions of the swap.                                              */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Everything that belongs to one game rather than to the studio. */
  var TITLE_FIELDS = [
    'design', 'shipped', 'phase',
    'runtime', 'agents', 'guilds', 'economy', 'lapsed', 'population',
    'finance', 'history', 'progress',
    'patchPlan', 'released', 'version',
    'launchWeek', 'launchCompletion', 'founded', 'sunsetWeek',
    'titleName', 'allocation', 'automate',
    /* Which game this one is a sequel to, and whether it has already
       collected on that. Both belong to the title, not the studio. */
    'sequelTo', 'sequelOf', 'cannibalised'
  ];

  /* Studio-level fields, listed only so the self-tests can assert that
     the two sets do not overlap. */
  var STUDIO_FIELDS = [
    'studio', 'week', 'era', 'competitors', 'log', 'pendingEvents',
    'titles', 'activeTitleId', 'portfolio', 'scenario', 'seed', 'version'
  ];

  /* --------------------------------------------------------- lifecycle -- */

  var PHASES = [
    { id: 'concept',     name: 'Concept',     desc: 'Named, not yet in production.' },
    { id: 'development', name: 'In development', desc: 'Burning capacity, earning nothing.' },
    { id: 'beta',        name: 'Beta',        desc: 'Players in, money not yet.' },
    { id: 'live',        name: 'Live',        desc: 'Running, earning, and judging you weekly.' },
    { id: 'sunset',      name: 'Sunset',      desc: 'Servers up, nobody building.' },
    { id: 'dead',        name: 'Closed',      desc: 'Servers off.' }
  ];
  var PHASE_BY_ID = {};
  PHASES.forEach(function (p) { PHASE_BY_ID[p.id] = p; });

  function newTitle(opts) {
    opts = opts || {};
    var design = opts.design || PN.schema.newDesign(opts.name);
    if (opts.name) design.meta.name = opts.name;
    return {
      id: opts.id || U.id('ttl'),
      titleName: design.meta.name,
      design: design,
      shipped: null,
      phase: 'development',
      /* Semantic versioning is the player's own language for their patch
         history, so it lives on the title, not in a log line. */
      version: { major: 0, minor: 1, patch: 0 },
      progress: { design: 0, art: 0, eng: 0, qa: 0 },
      /* Share of studio capacity pointed at this title. Normalised across
         live titles every tick, so a portfolio always spends 100%. */
      allocation: opts.allocation === undefined ? 100 : opts.allocation,
      automate: {
        enabled: false,
        cadenceWeeks: 8,
        ambition: 50,          /* how much content each auto-patch adds   */
        notes: true            /* write the notes for you as well         */
      },
      runtime: {
        bugLoad: 12, techDebt: 8, queuePressure: 0, outage: 0,
        botPressure: 0, exploitPressure: 0,
        sentiment: 50, awareness: 4, hype: 12, reviewScore: 0,
        weeksSinceContent: 0, marketingSpend: 0,
        /* The size of the last release, which decides how long its
           goodwill lasts. A launch is the biggest one there is. */
        lastReleaseKind: 'major'
      },
      agents: [], guilds: [], economy: null, lapsed: null,
      population: { total: 0, cohorts: [], peak: 0, lifetimeAccounts: 0 },
      finance: { revenueWeek: 0, costWeek: 0, revenueTotal: 0, costTotal: 0, arpuWeek: 0 },
      history: [],
      patchPlan: [],
      released: [],
      launchWeek: null,
      launchCompletion: 0,
      sunsetWeek: null,
      founded: opts.founded === undefined ? 0 : opts.founded
    };
  }

  /* ------------------------------------------------------- mount/unmount */

  function byId(state, id) { return U.byId(state.titles || [], id); }

  function active(state) {
    if (!state.titles || !state.titles.length) return null;
    return byId(state, state.activeTitleId) || state.titles[0];
  }

  /* Copy the mounted game's fields back into its record. */
  function unmount(state) {
    var t = byId(state, state.activeTitleId);
    if (!t) return null;
    TITLE_FIELDS.forEach(function (k) {
      if (state[k] !== undefined) t[k] = state[k];
    });
    return t;
  }

  /* Put a title's fields onto the state where the whole sim expects them. */
  function mount(state, id) {
    var t = byId(state, id);
    if (!t) return null;
    TITLE_FIELDS.forEach(function (k) { state[k] = t[k]; });
    state.activeTitleId = t.id;
    return t;
  }

  /* Switch which title the player is looking at and the sim is acting on.
     Always unmount first or the outgoing game loses the week it just
     played. */
  function activate(state, id) {
    if (state.activeTitleId === id && state.design) return byId(state, id);
    unmount(state);
    return mount(state, id);
  }

  /* Run fn with `id` mounted, then restore whatever was mounted before.
     This is how the tick touches every title without the caller having to
     remember to put things back. */
  function withTitle(state, id, fn) {
    var was = state.activeTitleId;
    if (was === id) return fn(byId(state, id));
    unmount(state);
    var t = mount(state, id);
    var out;
    try { out = fn(t); } finally {
      unmount(state);
      if (was) mount(state, was);
    }
    return out;
  }

  /* Every title, in portfolio order, each mounted while fn runs. */
  function forEachTitle(state, fn) {
    var was = state.activeTitleId;
    unmount(state);
    (state.titles || []).forEach(function (rec) {
      var t = mount(state, rec.id);
      if (t) fn(t);
      unmount(state);
    });
    if (was) mount(state, was);
  }

  /* ---------------------------------------------------------- portfolio -- */

  /* ====================================================== SEQUELS =======

     A second MMO is one of two quite different decisions.

     A STANDALONE starts with nothing: no audience, no name, no
     goodwill, and it earns every player the hard way. A SEQUEL starts
     with the audience its predecessor built - they already know the
     name, they already trust the studio, and a good share of them will
     move across on day one.

     Which is also its cost, and the reason this is a decision rather
     than a free bonus: the people who move across move AWAY from the
     game they were playing, and that game is yours too. A sequel to a
     healthy MMO is a studio competing with itself.                  */

  /* How much a predecessor is worth to a sequel: its size, how well it
     is thought of, and how much of a name it has. */
  function legacyOf(state, parent) {
    if (!parent) return null;
    var pop = (parent.population && parent.population.total) || 0;
    var rt = parent.runtime || {};
    var standing = U.clamp01(((rt.reviewScore > 0 ? rt.reviewScore : 55) * 0.6 +
                              (rt.sentiment === undefined ? 55 : rt.sentiment) * 0.4) / 100);
    var reach = U.clamp01((rt.awareness || 0) / 100);
    var released = (parent.released || []).length;
    /* Years of patch notes are a reputation in themselves. */
    var history = U.clamp01(released / 30);
    return {
      pop: pop, standing: standing, reach: reach, history: history,
      /* What share of the predecessor's players follow you across. A
         beloved game hands over most of a third; one people are sick
         of hands over very little, because they left for a reason. */
      carry: U.clamp(0.12 + standing * 0.30 + history * 0.06, 0.05, 0.45),
      /* And the head start in awareness and hype that a known name is. */
      awareness: U.clamp(18 + standing * 45 + reach * 22, 0, 82),
      hype: U.clamp(12 + standing * 38 + history * 18, 0, 70)
    };
  }

  function add(state, opts) {
    opts = opts || {};
    opts.founded = state.week;
    var parent = opts.sequelTo ? byId(state, opts.sequelTo) : null;
    var t = newTitle(opts);
    /* A second game does not inherit the first one's era-appropriate
       defaults by accident - it is designed now, for now. */
    t.design.meta.startYear = (state.era && state.era.year) || t.design.meta.startYear;
    t.design.meta.studio = state.studio.name;

    if (parent) {
      var leg = legacyOf(state, parent);
      t.sequelTo = parent.id;
      t.sequelOf = parent.titleName || (parent.design && parent.design.meta.name) || 'it';
      /* Banked before a line of it exists: people already know the
         name, and a good share of them have already decided. */
      t.runtime.awareness = Math.max(t.runtime.awareness || 0, leg.awareness);
      t.runtime.hype = Math.max(t.runtime.hype || 0, leg.hype);
      t.runtime.reviewScore = 0;
      /* Setting, faction structure and monetisation carry over: a
         sequel is recognisably the same game. Everything else is a
         blank page, because that is what makes it a sequel and not a
         patch. */
      var pd = parent.design || {};
      if (pd.identity) {
        t.design.identity.setting = pd.identity.setting;
        t.design.identity.combat = pd.identity.combat;
      }
      if (pd.monetisation) {
        t.design.monetisation.model = pd.monetisation.model;
        t.design.monetisation.subPrice = pd.monetisation.subPrice;
      }
      t.design.meta.tagline = 'The sequel to ' + t.sequelOf + '.';
    }

    unmount(state);
    state.titles.push(t);
    mount(state, t.id);
    balanceAllocation(state);
    return t;
  }

  /* The other half of the bargain, paid on the day it ships.

     Called once, when a sequel launches: the share of the predecessor's
     players who were only ever going to follow the studio move across.
     They do not vanish from the world - they are YOUR players, in your
     other game, and the predecessor feels it immediately. */
  function cannibalise(state, title) {
    if (!title || !title.sequelTo || title.cannibalised) return null;
    var parent = byId(state, title.sequelTo);
    if (!parent) return null;
    var leg = legacyOf(state, parent);
    title.cannibalised = true;
    var moved = 0;
    var rng = PN.state.rngFor(state);
    /* Done on the record rather than the mounted copy, because the
       predecessor is not the game being played this instant. */
    var was = (parent.population && parent.population.total) || 0;
    if (parent.agents && parent.agents.length) {
      for (var i = parent.agents.length - 1; i >= 0; i--) {
        var a = parent.agents[i];
        /* Somebody happy where they are is harder to move, which is
           why a sequel to a beloved game costs you less than a sequel
           to a tired one - up to a point. */
        var stick = U.clamp01((a.sat || 50) / 140);
        if (rng.chance(leg.carry * (1 - stick))) {
          moved += a.w;
          parent.agents.splice(i, 1);
        }
      }
      if (parent.population) {
        parent.population.total = Math.max(0, was - moved);
      }
    } else if (parent.population) {
      moved = was * leg.carry;
      parent.population.total = Math.max(0, was - moved);
    }
    PN.state.saveRng(state, rng);
    return { moved: moved, from: parent, carry: leg.carry };
  }

  function remove(state, id) {
    if ((state.titles || []).length <= 1) return false;
    var wasActive = state.activeTitleId === id;
    if (wasActive) unmount(state);
    U.removeById(state.titles, id);
    if (wasActive) mount(state, state.titles[0].id);
    balanceAllocation(state);
    return true;
  }

  /* Titles that still want capacity spent on them. */
  function building(state) {
    return (state.titles || []).filter(function (t) {
      return t.phase !== 'dead' && t.phase !== 'sunset';
    });
  }

  /* Anything that edits title RECORDS while one of them is mounted has to
     push that change onto the mounted copy, or the next unmount will
     overwrite it with the stale mounted value.

     It syncs ONE named field deliberately. A blanket copy of every field
     would clobber whatever else the mounted title has changed but not yet
     written back - which is exactly the bug that made a second title
     silently refuse to launch. */
  function syncField(state, key) {
    var t = byId(state, state.activeTitleId);
    if (t && TITLE_FIELDS.indexOf(key) >= 0) state[key] = t[key];
  }

  /* And the other direction. syncField exists because the RECORD was
     edited while a copy of it was mounted; this exists because the
     MOUNTED copy was replaced outright rather than edited in place -
     switching which release you are authoring swaps state.design for a
     different object - and the record has to learn about it before the
     next save writes the one it still remembers. */
  function stowField(state, key) {
    var t = byId(state, state.activeTitleId);
    if (t && TITLE_FIELDS.indexOf(key) >= 0 && state[key] !== undefined) {
      t[key] = state[key];
    }
  }

  /* Allocation is a share, so it has to add to 100 across the titles that
     are actually being worked on. Both of these edit title records, so
     both sync the mounted copy afterwards. */
  function balanceAllocation(state) {
    var live = building(state);
    if (!live.length) return;
    /* A mounted title's live allocation is the authority, not its stale
       record - read it in before normalising. */
    var mounted = byId(state, state.activeTitleId);
    if (mounted && state.allocation !== undefined) mounted.allocation = state.allocation;

    var total = U.sum(live, function (t) { return Math.max(0, t.allocation || 0); });
    if (total <= 0) {
      live.forEach(function (t) { t.allocation = 100 / live.length; });
    } else {
      live.forEach(function (t) {
        t.allocation = (Math.max(0, t.allocation || 0) / total) * 100;
      });
    }
    /* Sunset and closed titles keep no claim on the team. */
    (state.titles || []).forEach(function (t) {
      if (t.phase === 'dead' || t.phase === 'sunset') t.allocation = 0;
    });
    syncField(state, 'allocation');
  }

  /* Set one title's share and push the difference onto the others, which
     is what a producer actually does when they move people. */
  function setAllocation(state, id, pct) {
    var live = building(state);
    var me = byId(state, id);
    if (!me) return;
    if (live.length < 2) { me.allocation = 100; syncField(state, 'allocation'); return; }
    var want = U.clamp(pct, 0, 100);
    var others = live.filter(function (t) { return t.id !== id; });
    var otherTotal = U.sum(others, function (t) { return Math.max(0, t.allocation || 0); });
    var rest = 100 - want;
    me.allocation = want;
    if (otherTotal <= 0) {
      others.forEach(function (t) { t.allocation = rest / others.length; });
    } else {
      others.forEach(function (t) {
        t.allocation = (Math.max(0, t.allocation || 0) / otherTotal) * rest;
      });
    }
    syncField(state, 'allocation');
  }

  /* ------------------------------------------------------- staff capacity

     How many games a studio can actually run at once. This is the gate the
     player feels: a second title is not a menu option, it is a hiring
     problem. Running more games than the team supports does not fail - it
     spreads everyone thin and the quality shows.                        */
  function titleSlots(state) {
    var heads = (state.studio.staff || []).length;
    /* Roughly one team per dozen people, plus the one you always get. */
    return Math.max(1, Math.floor(heads / 12) + 1);
  }
  function overExtended(state) {
    return Math.max(0, building(state).length - titleSlots(state));
  }
  /* Spreading a team across too many games costs everyone throughput. */
  function spreadPenalty(state) {
    var n = building(state).length;
    if (n <= 1) return 1;
    var over = overExtended(state);
    /* Context-switching is real even when you are staffed for it. */
    return U.clamp(1 - (n - 1) * 0.06 - over * 0.18, 0.35, 1);
  }

  /* Roll the portfolio up for the studio-level readouts. */
  function portfolio(state) {
    var out = {
      titles: (state.titles || []).length,
      liveTitles: 0, players: 0, peak: 0,
      revenueWeek: 0, costWeek: 0, revenueTotal: 0, costTotal: 0,
      /* Wages are a studio bill, paid once however many games you run. */
      wages: PN.state.weeklyWages(state),
      slots: titleSlots(state), over: overExtended(state),
      spread: spreadPenalty(state)
    };
    (state.titles || []).forEach(function (t) {
      if (t.phase === 'live' || t.phase === 'beta') out.liveTitles++;
      out.players += (t.population && t.population.total) || 0;
      out.peak += (t.population && t.population.peak) || 0;
      if (t.finance) {
        out.revenueWeek += t.finance.revenueWeek || 0;
        out.costWeek += t.finance.costWeek || 0;
        out.revenueTotal += t.finance.revenueTotal || 0;
        out.costTotal += t.finance.costTotal || 0;
      }
    });
    return out;
  }

  /* Does this studio have anything to design yet? The whole interface is
     gated on this - a studio with no title has nothing to author. */
  function hasTitle(state) { return !!(state.titles && state.titles.length); }

  PN.titles = {
    TITLE_FIELDS: TITLE_FIELDS, STUDIO_FIELDS: STUDIO_FIELDS,
    PHASES: PHASES, PHASE_BY_ID: PHASE_BY_ID,
    newTitle: newTitle, byId: byId, active: active,
    legacyOf: legacyOf, cannibalise: cannibalise,
    mount: mount, unmount: unmount, activate: activate,
    syncField: syncField, stowField: stowField,
    withTitle: withTitle, forEachTitle: forEachTitle,
    add: add, remove: remove, building: building,
    balanceAllocation: balanceAllocation, setAllocation: setAllocation,
    titleSlots: titleSlots, overExtended: overExtended, spreadPenalty: spreadPenalty,
    portfolio: portfolio, hasTitle: hasTitle
  };
})(window.PN);
