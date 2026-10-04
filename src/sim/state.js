/* Patch Notes - game state and the studio.
   One serialisable object holds the whole run: design, studio, runtime,
   population and history. Saves are JSON.                                 */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax;

  /* ========================================================= STAFF ROLES ==
     pools  - weekly capacity contributed at skill 1.0
     effect - non-capacity effects applied per head                       */
  var STAFF_ROLES = [
    { id: 'systemsDesigner', name: 'Systems Designer', salary: 1900, pools: { design: 1.0 },
      effect: { balance: 0.9 }, desc: 'Owns the maths. Class balance lives or dies here.' },
    { id: 'contentDesigner', name: 'Content Designer', salary: 1650, pools: { design: 1.1 },
      effect: {}, desc: 'Quests, zones, reward chains. Volume production.' },
    { id: 'encounterDesigner', name: 'Encounter Designer', salary: 1850, pools: { design: 0.9 },
      effect: { encounter: 1.0 }, desc: 'Bosses and phases. Expensive, irreplaceable.' },
    { id: 'narrative', name: 'Narrative Designer', salary: 1600, pools: { design: 0.7, art: 0.2 },
      effect: { story: 1.0 }, desc: 'Writing and story structure.' },
    { id: 'engineerServer', name: 'Server Engineer', salary: 2400, pools: { eng: 1.1 },
      effect: { stability: 1.1 }, desc: 'Keeps it up under load. You notice them only when they are gone.' },
    { id: 'engineerClient', name: 'Client Engineer', salary: 2300, pools: { eng: 1.0 },
      effect: { polish: 0.8 }, desc: 'Combat feel, UI, rendering.' },
    { id: 'engineerTools', name: 'Tools Engineer', salary: 2200, pools: { eng: 0.6 },
      effect: { throughput: 1.6 }, desc: 'Makes everyone else faster. Always the first cut, always a mistake.' },
    { id: 'artistChar', name: 'Character Artist', salary: 1800, pools: { art: 1.1 },
      effect: {}, desc: 'Armour, creatures, cosmetics. Feeds the shop.' },
    { id: 'artistEnv', name: 'Environment Artist', salary: 1750, pools: { art: 1.1 },
      effect: {}, desc: 'Zones and dungeons. The bulk of world cost.' },
    { id: 'artistVfx', name: 'VFX Artist', salary: 1900, pools: { art: 0.8 },
      effect: { spectacle: 1.2 }, desc: 'Makes the abilities feel like they hit.' },
    { id: 'qa', name: 'QA Engineer', salary: 1300, pools: { qa: 1.3 },
      effect: { bugCatch: 1.0 }, desc: 'Finds it before the forums do.' },
    { id: 'sre', name: 'Live Ops / SRE', salary: 2300, pools: { eng: 0.3 },
      effect: { uptime: 1.5 }, desc: 'Launch day is their whole career in one afternoon.' },
    { id: 'community', name: 'Community Manager', salary: 1200, pools: {},
      effect: { sentiment: 1.3 }, desc: 'The difference between a bad patch and a riot.' },
    { id: 'economist', name: 'Economy Analyst', salary: 2000, pools: {},
      effect: { economy: 1.4 }, desc: 'Watches the faucets. Nobody listens until it is too late.' },
    { id: 'dataScientist', name: 'Data Scientist', salary: 2200, pools: {},
      effect: { telemetry: 1.0 }, desc: 'Turns churn into a reason. Sharpens every other decision.' },
    { id: 'producer', name: 'Producer', salary: 2100, pools: {},
      effect: { throughput: 1.0, morale: 0.6 }, desc: 'Keeps eleven plates spinning and takes the blame for all of them.' }
  ];
  var ROLE_BY_ID = {};
  STAFF_ROLES.forEach(function (r) { ROLE_BY_ID[r.id] = r; });

  var FIRST_NAMES = ['Aya', 'Bram', 'Cass', 'Dev', 'Esen', 'Fen', 'Gio', 'Hale', 'Ines', 'Jun',
    'Kit', 'Lior', 'Mo', 'Nix', 'Oona', 'Pax', 'Quin', 'Rhea', 'Sol', 'Tam', 'Uma', 'Vik',
    'Wren', 'Xan', 'Yuki', 'Zane', 'Noor', 'Rafa', 'Sanne', 'Tobi'];
  var LAST_NAMES = ['Ainsley', 'Barros', 'Chen', 'Dorsey', 'Eriksen', 'Farrow', 'Gil', 'Haddad',
    'Ibarra', 'Jansen', 'Kovac', 'Lund', 'Mbeki', 'Nakamura', 'Okafor', 'Petrov', 'Quist',
    'Rossi', 'Saito', 'Tavares', 'Ueda', 'Vance', 'Wolfe', 'Ximenes', 'Yates', 'Zubiri'];

  /* A few words that make somebody a person rather than a capacity
     number. Traits are mechanical: they bend output, burnout, loyalty or
     salary, and the studio screen says which. */
  var TRAITS = [
    { id: 'fast',       name: 'Fast',        desc: 'Ships more, polishes less.', out: 1.18 },
    { id: 'meticulous', name: 'Meticulous',  desc: 'Slower, and right the first time.', out: 0.88 },
    { id: 'mentor',     name: 'Mentor',      desc: 'Everyone around them gets better.',
      teamOut: 0.03, teamMorale: 2.5 },
    { id: 'steady',     name: 'Steady',      desc: 'Crunch lands softer on them.', burnout: 0.55 },
    { id: 'brittle',    name: 'Brittle',     desc: 'Burns out fast under pressure.', burnout: 1.7 },
    { id: 'cheap',      name: 'Good value',  desc: 'Paid under the market and does not mind.',
      salary: 0.82 },
    { id: 'star',       name: 'Star',        desc: 'Worth it. Knows it.', out: 1.3, salary: 1.35 },
    { id: 'loyal',      name: 'Loyal',       desc: 'Hard to poach.', stay: 0.45 },
    { id: 'restless',   name: 'Restless',    desc: 'Always half-listening to recruiters.', stay: 1.8 },
    { id: 'specialist', name: 'Specialist',  desc: 'Brilliant at their own job, no use outside it.',
      out: 1.22 }
  ];
  var TRAIT_BY_ID = {};
  TRAITS.forEach(function (t) { TRAIT_BY_ID[t.id] = t; });

  /* Where somebody learned the job. Each string carries its own article
     so the card can just say "Came out of X". */
  var SCHOOLS = ['being self-taught', 'the modding scene', 'a games degree',
                 'tabletop design', 'the QA floor', 'another studio', 'academia',
                 'the film industry', 'a guild that raided too much'];

  function makeStaff(rng, roleId, seniorityBias) {
    var role = ROLE_BY_ID[roleId];
    var sen = U.clamp01(rng.normal(0.45 + (seniorityBias || 0), 0.22));
    var skill = U.clamp(rng.normal(0.45 + sen * 0.55, 0.14), 0.15, 1.35);
    /* One trait usually, two sometimes - two is what makes somebody
       memorable rather than a row in a table. */
    var traits = [rng.pick(TRAITS).id];
    if (rng.chance(0.35)) {
      var second = rng.pick(TRAITS.filter(function (t) { return t.id !== traits[0]; }));
      if (second) traits.push(second.id);
    }
    var salaryMult = 1;
    traits.forEach(function (t) { salaryMult *= (TRAIT_BY_ID[t].salary || 1); });
    return {
      id: U.id('stf'),
      name: rng.pick(FIRST_NAMES) + ' ' + rng.pick(LAST_NAMES),
      role: roleId,
      skill: U.round(skill, 3),
      seniority: U.round(sen, 3),
      salary: Math.round(role.salary * (0.65 + sen * 0.95) * (0.85 + skill * 0.35) * salaryMult),
      morale: 72,
      burnout: 0,
      weeks: 0,
      traits: traits,
      from: rng.pick(SCHOOLS),
      /* Set when they hand in their notice. */
      noticeWeeks: 0,
      noticeReasons: null,
      counterOffered: false
    };
  }

  /* What this person's traits do to their own numbers. */
  function traitMult(st, key, fallback) {
    var m = fallback === undefined ? 1 : fallback;
    (st && st.traits ? st.traits : []).forEach(function (t) {
      var def = TRAIT_BY_ID[t];
      if (def && def[key]) m *= def[key];
    });
    return m;
  }
  function traitOutput(st) { return traitMult(st, 'out'); }
  function traitBurnout(st) { return traitMult(st, 'burnout'); }
  function traitStay(st) { return traitMult(st, 'stay'); }

  /* Weekly capacity by pool, after morale, burnout, traits, tools and
     producers. */
  function capacity(state) {
    var pools = { design: 0, art: 0, eng: 0, qa: 0 };
    var eff = { balance: 0, encounter: 0, story: 0, stability: 0, polish: 0, throughput: 0,
                spectacle: 0, bugCatch: 0, uptime: 0, sentiment: 0, economy: 0, telemetry: 0, morale: 0 };

    /* Mentors lift the people around them - the one trait whose value is
       not on the person who has it. */
    var mentorBonus = 0, mentorMorale = 0;
    state.studio.staff.forEach(function (s) {
      (s.traits || []).forEach(function (t) {
        var def = TRAIT_BY_ID[t];
        if (!def) return;
        if (def.teamOut) mentorBonus += def.teamOut;
        if (def.teamMorale) mentorMorale += def.teamMorale;
      });
    });

    state.studio.staff.forEach(function (s) {
      var role = ROLE_BY_ID[s.role]; if (!role) return;
      var moraleMult = 0.55 + (s.morale / 100) * 0.62;
      var burnMult = 1 - (s.burnout / 100) * 0.45;
      /* Somebody working a notice period is already half gone: handovers,
         exit interviews, and work they will not be here to finish. */
      var noticeMult = s.noticeWeeks > 0 ? 0.55 : 1;
      var out = s.skill * moraleMult * burnMult * traitOutput(s) * noticeMult;
      U.keys(role.pools).forEach(function (p) { pools[p] += role.pools[p] * out; });
      U.keys(role.effect).forEach(function (k) { eff[k] += role.effect[k] * out; });
    });
    eff.morale += mentorMorale;
    var mentorMult = 1 + U.saturate(mentorBonus, 0.3) * 0.18;

    /* Tools and producers multiply everyone else. Diminishing, of course. */
    var mult = 1 + U.saturate(eff.throughput, 4.5) * 0.34;
    /* Technical debt is a tax on every pool. It belongs to a game, not to
       the studio, so a studio running several pays the worst of them -
       one rotten codebase slows the people who have to touch it. */
    var debt = 0;
    if (state.titles && state.titles.length) {
      state.titles.forEach(function (t) {
        if (t.runtime) debt = Math.max(debt, t.runtime.techDebt || 0);
      });
    } else if (state.runtime) {
      debt = state.runtime.techDebt || 0;
    }
    var debtTax = 1 - U.clamp01(debt / 220);
    U.keys(pools).forEach(function (p) { pools[p] *= mult * mentorMult * debtTax; });

    pools.mult = mult; pools.debtTax = debtTax; pools.effects = eff;
    pools.total = pools.design + pools.art + pools.eng + pools.qa;
    return pools;
  }

  /* The wage bill, after whatever the studio has learned about running a
     production pipeline. Research is the only thing that moves it. */
  function weeklyWages(state) {
    var gross = U.sum(state.studio.staff, function (s) { return s.salary; }) / 4.33;
    var cut = PN.research ? (PN.research.limits(state).wageCut || 0) : 0;
    return gross * (1 - U.clamp01(cut));
  }

  function serverCost(state) {
    var d = state.design;
    var world = PN.prim.find(PN.prim.WORLD_STRUCTURES, d.identity.world);
    var pop = state.population.total || 0;
    /* Scaled for the 100x smaller world: a modest fixed bill per region
       plus a real per-player cost.                                   */
    var base = 150 * d.infra.regions;
    var perPlayer = 0.34 * world.opsCost *
                    (1 + d.infra.redundancy / 160) *
                    (1 + d.infra.capacityHeadroom / 220);
    /* Better server technology pays for itself in the running bill. */
    var eff = PN.research ? (PN.research.limits(state).serverEfficiency || 0) : 0;
    return (base + pop * perPlayer) * (1 - U.clamp01(eff));
  }

  /* ====================================================== STARTING YEARS ==

     The year you found the studio in is the difficulty setting, and it is
     a real one rather than a multiplier: it decides the size of the
     market, what players will forgive, how normal free-to-play is, and
     how much money it takes to look competent. 2004 is generous and
     small; 2028 is enormous and merciless.                            */
  var START_YEARS = [
    { year: 1999, cash: 700000, staff: 6, deadline: 130,
      label: 'Before anyone agreed what an MMO was',
      good: 'Enormous tolerance for grind and jank. No competition worth the name.',
      bad: 'A market of sixteen thousand people and no money in it.',
      difficulty: 'Punishing' },
    { year: 2004, cash: 1500000, staff: 9, deadline: 104,
      label: 'Everyone wants a subscription',
      good: 'Subscriptions are normal, 200-hour grinds are normal, and the market is exploding.',
      bad: 'You are competing with the genre-defining game, and players compare you to it daily.',
      difficulty: 'Forgiving' },
    { year: 2010, cash: 2600000, staff: 12, deadline: 104,
      label: 'Everyone has one, and players compare',
      good: 'Real budget, real audience, and the playbook is well understood.',
      bad: 'Every publisher wants one. Players have alternatives and have learned to leave.',
      difficulty: 'Fair' },
    { year: 2016, cash: 3800000, staff: 14, deadline: 91,
      label: 'Niche games can survive now',
      good: 'Free-to-play is normal, so a niche game can survive on a small crowd who love it.',
      bad: 'Streaming decides what lives. Production expectations have doubled.',
      difficulty: 'Demanding' },
    { year: 2022, cash: 5200000, staff: 16, deadline: 78,
      label: 'Seasons, passes, and five games at once',
      good: 'The biggest market the genre has ever had, and passes print money.',
      bad: 'Everyone plays five games. Goodwill is measured in hours and spent instantly.',
      difficulty: 'Hard' },
    { year: 2028, cash: 6500000, staff: 18, deadline: 78,
      label: 'Cynical players, expensive production',
      good: 'Vast audience, mature tools, and rivals who have all made the same mistakes.',
      bad: 'Regulators woke up, players got cynical, and costs never came down.',
      difficulty: 'Brutal' }
  ];
  var YEAR_BY_YEAR = {};
  START_YEARS.forEach(function (y) { YEAR_BY_YEAR[y.year] = y; });

  function startYearFor(year) {
    var best = START_YEARS[0];
    START_YEARS.forEach(function (y) { if (y.year <= year) best = y; });
    return best;
  }

  /* ======================================================== NEW STUDIO ==

     A studio is not a game. You found it, you name it, you hire, and then
     you decide what to build - which is why the interface shows nothing
     but the studio until the first title exists.                       */
  function newStudio(opts) {
    opts = opts || {};
    var year = opts.year || 2004;
    var yd = startYearFor(year);
    var seed = opts.seed || Math.floor(Math.random() * 1e9);
    var rng = new U.Rng(seed);

    var state = {
      version: PN.version,
      seed: seed,
      week: 0,
      era: tax.eraForYear(year),
      startYear: year,

      studio: {
        name: opts.studio || 'New Studio',
        founded: year,
        cash: opts.cash === undefined ? yd.cash : opts.cash,
        staff: [],
        morale: 72,
        reputation: 45,
        crunch: 0,
        publisherDeadlineWeek: opts.deadline || yd.deadline
      },

      /* The portfolio. Empty until the player greenlights something. */
      titles: [],
      activeTitleId: null,
      portfolio: null,

      competitors: null,
      scenario: null,
      /* Players you asked to be kept track of. A favourite is never
         dropped from the roster to make room for somebody else, so
         you can follow one person week to week - and if they quit,
         the community feed says so. */
      favourites: {},
      log: [],
      pendingEvents: [],
      history: [],
      rngState: seed
    };

    /* A small team, hired before there is anything for them to build -
       which is exactly how this goes in real life.

       The ORDER matters more than anything else in this file. A game is
       finished when its slowest pool is finished, so a founding team
       missing a discipline cannot finish anything at all: the old order
       put QA ninth, and a six-person 1999 studio therefore had no QA
       capacity, an infinite build time, and no way to discover why.
       Every one of the first four covers a different pool. */
    var roster = opts.startingStaff || [
      'artistEnv', 'systemsDesigner', 'engineerServer', 'qa',
      'artistChar', 'contentDesigner', 'engineerClient', 'producer',
      'encounterDesigner', 'narrative', 'artistVfx', 'engineerTools',
      'community', 'sre', 'dataScientist', 'economist',
      'contentDesigner', 'artistEnv'
    ];
    var heads = opts.staffCount === undefined ? yd.staff : opts.staffCount;
    roster.slice(0, heads).forEach(function (r) {
      if (ROLE_BY_ID[r]) state.studio.staff.push(makeStaff(rng, r, 0));
    });

    state.rngState = rng.s;
    log(state, 'studio', state.studio.name + ' is founded',
      'It is ' + year + '. ' + tax.eraForYear(year).note + ' You have ' +
      U.fmtMoney(state.studio.cash) + ' and ' + state.studio.staff.length +
      ' people. Nothing is in production yet.');
    return state;
  }

  /* ====================================================== HIRING =======

     Pressing Hire is not the same as somebody turning up.

     In 1999 there are no MMO developers, because nobody has made one.
     You are not picking from a market, you are finding somebody who
     has never done this and convincing them to move cities for it -
     which takes weeks, and which is what makes "they have handed in
     their notice" a decision rather than a formality. Later decades
     have an industry to hire out of and the search is immediate.

     A search is a real thing on the books: it occupies the slot, it
     shows on the Studio screen, and it can be called off.            */
  function hireWeeksFor(state) {
    var era = state && state.era;
    return (era && era.hireWeeks) || 0;
  }

  /* Start looking. Returns the opening, or the person if the decade
     hands them over on the spot. */
  function openSearch(state, roleId) {
    var role = ROLE_BY_ID[roleId];
    if (!role) return null;
    var weeks = hireWeeksFor(state);
    if (weeks <= 0) {
      var rng0 = rngFor(state);
      var hired = makeStaff(rng0, roleId, 0);
      saveRng(state, rng0);
      state.studio.staff.push(hired);
      log(state, 'staff', 'Hired ' + hired.name,
        role.name + ', skill ' + U.round(hired.skill, 2) + ', ' +
        U.fmtMoneyFull(hired.salary) + '/month.', { staffId: hired.id });
      return { hired: hired };
    }
    state.studio.openings = state.studio.openings || [];
    var op = { id: U.id('opn'), role: roleId, weeks: weeks, left: weeks,
               opened: state.week || 0 };
    state.studio.openings.push(op);
    log(state, 'staff', 'Looking for a ' + role.name.toLowerCase(),
      'Nobody has made one of these before. Expect about ' + weeks +
      ' weeks to find somebody, and nothing from them until they arrive.',
      { opening: op.id });
    return { opening: op };
  }

  function cancelSearch(state, openingId) {
    var list = (state.studio && state.studio.openings) || [];
    var op = U.byId(list, openingId);
    if (!op) return false;
    U.removeById(list, openingId);
    log(state, 'staff', 'Called off the search',
      'You are no longer looking for a ' +
      (ROLE_BY_ID[op.role] || { name: op.role }).name.toLowerCase() + '.');
    return true;
  }

  /* A week of looking. Anybody found this week starts on Monday. */
  function tickHiring(state) {
    var list = (state.studio && state.studio.openings) || [];
    if (!list.length) return [];
    var rng = rngFor(state);
    var arrived = [];
    for (var i = list.length - 1; i >= 0; i--) {
      var op = list[i];
      op.left--;
      if (op.left > 0) continue;
      var s = makeStaff(rng, op.role, 0);
      state.studio.staff.push(s);
      list.splice(i, 1);
      arrived.push(s);
      log(state, 'staff', s.name + ' starts on Monday',
        (ROLE_BY_ID[op.role] || { name: op.role }).name + ', skill ' +
        U.round(s.skill, 2) + ', ' + U.fmtMoneyFull(s.salary) + '/month. ' +
        'That search took ' + op.weeks + ' weeks.', { staffId: s.id });
    }
    saveRng(state, rng);
    return arrived;
  }

  /* Greenlight the studio's first - or fifth - MMO. */
  function greenlight(state, opts) {
    opts = opts || {};
    var t = PN.titles.add(state, opts);
    log(state, 'studio', t.titleName + ' is greenlit',
      t.sequelTo
        ? 'A sequel to ' + t.sequelOf + '. It opens with ' +
          Math.round(t.runtime.awareness) + ' awareness and ' +
          Math.round(t.runtime.hype) + ' hype before a line of it exists - ' +
          'and when it ships, a share of the people playing ' + t.sequelOf +
          ' will move across to it.'
        : 'Production starts this week. ' +
          (state.titles.length > 1
            ? 'That is ' + state.titles.length + ' games running at once.'
            : 'Everything the studio has goes into it.'));
    return t;
  }

  /* ------------------------------------------------------- compatibility

     newGame() built a studio and a game in one step. Keep it: presets,
     scenarios and every existing save go through here.               */
  function newGame(opts) {
    opts = opts || {};
    var design = opts.design || PN.schema.newDesign(opts.name);
    var year = design.meta.startYear || 2004;
    var state = newStudio({
      studio: design.meta.studio, year: year, seed: opts.seed || design.meta.seed,
      cash: opts.cash, deadline: opts.deadline, startingStaff: opts.startingStaff,
      staffCount: opts.staffCount
    });
    /* The preset's own staffing list wins when one was given. */
    if (opts.startingStaff) {
      state.studio.staff = [];
      var rng = rngFor(state);
      opts.startingStaff.forEach(function (r) {
        if (ROLE_BY_ID[r]) state.studio.staff.push(makeStaff(rng, r, 0));
      });
      saveRng(state, rng);
    }
    PN.titles.add(state, { design: design, name: design.meta.name });
    return state;
  }


  function log(state, kind, title, body, data) {
    state.log.unshift({
      week: state.week, kind: kind, title: title, body: body || '',
      data: data || null, id: U.id('log')
    });
    if (state.log.length > 400) state.log.length = 400;
  }

  function rngFor(state) {
    var r = new U.Rng(state.rngState);
    return r;
  }
  function saveRng(state, rng) { state.rngState = rng.s; }

  PN.state = {
    STAFF_ROLES: STAFF_ROLES, ROLE_BY_ID: ROLE_BY_ID,
    TRAITS: TRAITS, TRAIT_BY_ID: TRAIT_BY_ID, SCHOOLS: SCHOOLS,
    traitOutput: traitOutput, traitBurnout: traitBurnout, traitStay: traitStay,
    START_YEARS: START_YEARS, YEAR_BY_YEAR: YEAR_BY_YEAR, startYearFor: startYearFor,
    newStudio: newStudio, greenlight: greenlight,
    newGame: newGame, makeStaff: makeStaff, capacity: capacity,
    hireWeeksFor: hireWeeksFor, openSearch: openSearch,
    cancelSearch: cancelSearch, tickHiring: tickHiring,
    weeklyWages: weeklyWages, serverCost: serverCost,
    log: log, rngFor: rngFor, saveRng: saveRng
  };
})(PN);
