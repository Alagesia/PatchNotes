/* Patch Notes - scenarios.
   Sandbox is a toy. A scenario is a problem: a starting position, a
   constraint that hurts, and a bar you have to clear.                   */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Each objective is a predicate over the run, checked every week. */
  function obj(id, label, detail, test) {
    return { id: id, label: label, detail: detail, test: test };
  }

  var SCENARIOS = [
    {
      id: 'sandbox',
      name: 'Sandbox',
      blurb: 'No deadline, no publisher, no failure state. Build the thing you want to build and watch what happens.',
      preset: null,
      weeks: 0,
      setup: function (state) { state.scenario = { id: 'sandbox', free: true }; },
      objectives: [],
      failure: null
    },
    {
      id: 'goldRush',
      name: 'The Gold Rush',
      year: 2004,
      preset: 'themepark',
      weeks: 260,
      blurb: 'It is 2004. Subscriptions are normal, nobody questions a 200-hour grind, and the genre is about to explode. Build the game that defines it.',
      constraint: 'Five years. Subscription model locked.',
      setup: function (state) {
        state.design.meta.startYear = 2004;
        state.design.monetisation.model = 'sub';
        state.studio.cash = 900000;
        state.scenario = { id: 'goldRush', lockModel: 'sub' };
      },
      objectives: [
        obj('pop', 'Reach 6,000 concurrent players', 'The market is small. Six thousand is a hit.',
          function (s) { return s.population.peak >= 6000; }),
        obj('profit', 'Bank $3M', 'Prove a subscription MMO can pay for itself.',
          function (s) { return s.studio.cash >= 3000000; }),
        obj('review', 'Hold a review score of 75+', 'Reviews gate everything for years.',
          function (s) { return s.runtime.reviewScore >= 75; })
      ],
      failure: function (s) { return s.studio.cash < -400000; }
    },
    {
      id: 'rescue',
      name: 'Save a Dying Game',
      year: 2016,
      preset: 'story',
      weeks: 156,
      blurb: 'You have inherited a game three years past its peak. Sentiment is in the gutter, the raid team left, and the publisher wants a reason not to sunset it.',
      constraint: 'Starts live, bleeding, and in debt.',
      setup: function (state) {
        state.phase = 'live';
        state.shipped = U.clone(state.design);
        state.launchWeek = 0;
        state.studio.cash = 320000;
        state.runtime.sentiment = 26;
        state.runtime.reviewScore = 44;
        state.runtime.awareness = 34;
        state.runtime.bugLoad = 48;
        state.runtime.techDebt = 92;
        state.runtime.weeksSinceContent = 34;
        state.studio.reputation = 28;
        state.studio.staff.forEach(function (st) { st.morale = 42; });
        /* A wounded but real playerbase. */
        var rng = PN.state.rngFor(state);
        var ctx = { rng: rng, world: PN.agents.buildWorldCache(state) };
        PN.tax.ARCHETYPES.forEach(function (a) {
          PN.agents.admit(state, a.id, Math.round(1400 * a.share), ctx);
        });
        state.agents.forEach(function (ag) {
          ag.t = rng.int(30, 140);
          ag.lv = state.design.progression.levelCap;
          ag.sat = rng.range(30, 52);
        });
        state.population.total = U.sum(state.agents, function (ag) { return ag.w; });
        state.population.peak = state.population.total;
        PN.expansions.initLapsed(state);
        PN.tax.ARCHETYPES.forEach(function (a) {
          state.lapsed[a.id] = 2600 * a.share;
        });
        PN.state.saveRng(state, rng);
        state.scenario = { id: 'rescue' };
      },
      objectives: [
        obj('sentiment', 'Get sentiment back above 62', 'Win the room back.',
          function (s) { return s.runtime.sentiment >= 62; }),
        obj('growth', 'Grow the playerbase past 3,500', 'Not just stop the bleeding - reverse it.',
          function (s) { return s.population.total >= 3500; }),
        obj('debt', 'Cut technical debt below 40', 'Stop shipping on top of the rot.',
          function (s) { return s.runtime.techDebt < 40; })
      ],
      failure: function (s) { return s.studio.cash < -250000 || s.population.total < 300; }
    },
    {
      id: 'goFree',
      name: 'Go Free-to-Play Without a Riot',
      year: 2012,
      preset: 'story',
      weeks: 130,
      blurb: 'Subscriptions are drying up. The board has decided you are going free-to-play. Your existing players have decided this is a betrayal.',
      constraint: 'Must ship a free-to-play conversion within 40 weeks.',
      setup: function (state) {
        state.phase = 'live';
        state.shipped = U.clone(state.design);
        state.launchWeek = 0;
        state.studio.cash = 480000;
        state.runtime.sentiment = 51;
        state.runtime.reviewScore = 66;
        state.runtime.awareness = 46;
        var rng = PN.state.rngFor(state);
        var ctx = { rng: rng, world: PN.agents.buildWorldCache(state) };
        PN.tax.ARCHETYPES.forEach(function (a) {
          PN.agents.admit(state, a.id, Math.round(2200 * a.share), ctx);
        });
        state.agents.forEach(function (ag) { ag.t = rng.int(20, 90); });
        state.population.total = U.sum(state.agents, function (ag) { return ag.w; });
        state.population.peak = state.population.total;
        PN.state.saveRng(state, rng);
        state.scenario = { id: 'goFree', deadline: 40, requireF2P: true };
      },
      objectives: [
        obj('f2p', 'Convert to a free-to-play model', 'Within 40 weeks, as instructed.',
          function (s) {
            var m = PN.sim.live(s).monetisation.model;
            return m === 'f2pCosmetic' || m === 'f2pConvenience' || m === 'seasonal' || m === 'f2pPower';
          }),
        obj('keep', 'Keep sentiment above 48 through the conversion', 'Do it without a riot.',
          function (s) { return s.runtime.sentiment >= 48; }),
        obj('revenue', 'Beat $60,000 a week in revenue', 'Prove the model change worked.',
          function (s) { return s.finance.revenueWeek >= 60000; })
      ],
      failure: function (s) { return s.runtime.sentiment < 18 || s.studio.cash < -300000; }
    },
    {
      id: 'sixMonths',
      name: 'Ship an Expansion in Six Months',
      year: 2018,
      preset: 'creature',
      weeks: 104,
      blurb: 'Marketing already announced the date. The team has not started. You have twenty-six weeks and a roadmap somebody else wrote.',
      constraint: 'An expansion must be live by week 26.',
      setup: function (state) {
        state.phase = 'live';
        state.shipped = U.clone(state.design);
        state.launchWeek = 0;
        state.studio.cash = 700000;
        state.runtime.sentiment = 58;
        state.runtime.reviewScore = 72;
        state.runtime.awareness = 40;
        var rng = PN.state.rngFor(state);
        var ctx = { rng: rng, world: PN.agents.buildWorldCache(state) };
        PN.tax.ARCHETYPES.forEach(function (a) {
          PN.agents.admit(state, a.id, Math.round(2800 * a.share), ctx);
        });
        state.population.total = U.sum(state.agents, function (ag) { return ag.w; });
        state.population.peak = state.population.total;
        var exp = PN.schema.newExpansion('The Promised Isles', {
          levelIncrease: 10, newZones: 3, newDungeons: 3, newRaids: 1, gearTiers: 2
        });
        exp.announced = true; exp.announcedWeek = 0;
        state.design.expansions.push(exp);
        PN.state.saveRng(state, rng);
        state.scenario = { id: 'sixMonths', deadline: 26, expansionId: exp.id };
      },
      objectives: [
        obj('ship', 'Release the expansion by week 26', 'The date is already public.',
          function (s) {
            var e = (PN.sim.live(s).expansions || [])[0];
            return !!(e && e.released && e.releaseWeek <= 26);
          }),
        obj('quality', 'Do it without wrecking stability', 'Bug load under 35 at week 30.',
          function (s) { return s.week >= 30 && s.runtime.bugLoad < 35; }),
        obj('morale', 'Keep the team above 45 morale', 'Crunch has a price.',
          function (s) { return s.studio.morale >= 45; })
      ],
      failure: function (s) {
        var e = (PN.sim.live(s).expansions || [])[0];
        return (s.week > 26 && !(e && e.released)) || s.studio.cash < -250000;
      }
    },
    {
      id: 'giant',
      name: 'Compete With a Giant',
      year: 2010,
      preset: 'livingWorld',
      weeks: 208,
      blurb: 'There is a ten-million-player incumbent and everybody says you are its killer. You are not. Find the audience it does not serve.',
      constraint: 'A dominant rival owns most of the market from day one.',
      setup: function (state) {
        state.studio.cash = 1400000;
        PN.competitors.init(state);
        var rng = PN.state.rngFor(state);
        var giant = PN.competitors.report(state)[0];
        if (giant) {
          giant.c.name = 'Everfall';
          giant.c.studio = 'Meridian';
          giant.c.quality = 88;
          giant.c.players = Math.round(PN.tax.poolFor(state) * 0.42);
          giant.c.peak = giant.c.players;
          giant.c.angle = 'themepark';
          giant.c.momentum = 0.005;
        }
        PN.state.saveRng(state, rng);
        state.scenario = { id: 'giant' };
      },
      objectives: [
        obj('niche', 'Reach 4,000 players without going head-on', 'Serve somebody they do not.',
          function (s) { return s.population.total >= 4000; }),
        obj('coherence', 'Hold design coherence above 80', 'Being different only works if you are consistent.',
          function (s) {
            return PN.coherence.evaluate(PN.sim.live(s)).score >= 80;
          }),
        obj('survive', 'Still be running after four years', 'Outlast the discourse.',
          function (s) { return s.week >= 208 && s.phase === 'live'; })
      ],
      failure: function (s) { return s.studio.cash < -400000; }
    }
  ];

  var BY_ID = {};
  SCENARIOS.forEach(function (s) { BY_ID[s.id] = s; });

  /* Check every objective and the failure condition. */
  function evaluate(state) {
    var sc = state.scenario && BY_ID[state.scenario.id];
    if (!sc || sc.id === 'sandbox') return null;
    var results = sc.objectives.map(function (o) {
      var met = false;
      try { met = !!o.test(state); } catch (e) { met = false; }
      /* Objectives latch: once achieved, they stay achieved. */
      state.scenario.met = state.scenario.met || {};
      if (met) state.scenario.met[o.id] = true;
      return { obj: o, met: !!state.scenario.met[o.id], now: met };
    });
    var failed = false;
    try { failed = sc.failure ? !!sc.failure(state) : false; } catch (e) {}
    var complete = results.every(function (r) { return r.met; });
    var expired = sc.weeks > 0 && state.week >= sc.weeks;
    return {
      scenario: sc, results: results, complete: complete,
      failed: failed, expired: expired,
      weeksLeft: sc.weeks > 0 ? Math.max(0, sc.weeks - state.week) : null,
      outcome: failed ? 'failed' : complete ? 'won' : expired ? 'timeout' : 'running'
    };
  }

  PN.scenarios = { SCENARIOS: SCENARIOS, BY_ID: BY_ID, evaluate: evaluate };
})(PN);
