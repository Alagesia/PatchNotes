/* Patch Notes - rival studios.
   Other people are making MMOs too. They launch, they take your
   audience, they run out of content, and some of them die. The market
   is shared, and that is the point.                                     */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax;

  var NAME_A = ['Aether', 'Iron', 'Nova', 'Umbra', 'Vale', 'Zenith', 'Hollow', 'Crimson',
                'Astral', 'Ember', 'Nether', 'Solstice'];
  var NAME_B = ['fall', 'reach', 'bound', 'gate', 'spire', 'watch', 'rift', 'crown',
                'haven', 'mark', 'wake', 'forge'];
  var STUDIOS = ['Northlight', 'Broadsword', 'Ninth Circle', 'Halcyon', 'Redshift',
                 'Foundry 7', 'Blue Meridian', 'Kestrel', 'Oxbow', 'Tessellate'];

  /* Each rival specialises. That is what makes them dangerous to some
     of your players and irrelevant to others.                         */
  var ANGLES = [
    { id: 'themepark',  name: 'themepark',        targets: ['progressor', 'raider', 'socialite'] },
    { id: 'sandbox',    name: 'sandbox',          targets: ['explorer', 'economist', 'roleplayer'] },
    { id: 'competitive', name: 'competitive',     targets: ['competitor', 'creator'] },
    { id: 'casual',     name: 'casual',           targets: ['drifter', 'socialite'] },
    { id: 'collection', name: 'creature-collection', targets: ['completionist', 'explorer', 'drifter'] },
    { id: 'hardcore',   name: 'hardcore',         targets: ['raider', 'competitor'] }
  ];

  function init(state) {
    state.competitors = state.competitors || [];
    /* In 1999 nobody else is making one. That is most of what The
       Frontier IS: a tiny market with no competition in it, which is
       what buys you the room to build the thing wrong and survive.

       The genre arrives in The Gold Rush and never leaves, so the
       incumbents are seeded the first time an era that HAS rivals
       comes round - whether you started in it or lived to see it. */
    if (!state.era || state.era.rivals === false) return state.competitors;
    if (state.rivalsSeeded) return state.competitors;
    state.rivalsSeeded = true;
    var rng = PN.state.rngFor(state);
    var n = state.era.year >= 2010 ? 3 : 2;
    for (var i = 0; i < n; i++) {
      var c = make(state, rng, { live: true, age: rng.int(20, 160) });
      state.competitors.push(c);
    }
    if (state.week > 0) {
      PN.state.log(state, 'market', 'Other studios have noticed',
        n + ' rival MMOs are live. Until now you were the only game of your kind; ' +
        'from here you are sharing an audience with people who want it as much as you do.');
    }
    PN.state.saveRng(state, rng);
    return state.competitors;
  }

  function make(state, rng, opts) {
    opts = opts || {};
    var angle = rng.pick(ANGLES);
    return {
      id: U.id('cmp'),
      name: rng.pick(NAME_A) + rng.pick(NAME_B),
      studio: rng.pick(STUDIOS),
      angle: angle.id,
      quality: U.clamp(rng.normal(62, 13), 25, 95),
      budget: U.clamp(rng.normal(1, 0.35), 0.3, 2.2),
      players: opts.live ? Math.round(rng.range(400, 3200)) : 0,
      peak: 0,
      momentum: opts.live ? rng.range(-0.02, 0.02) : 0,
      status: opts.live ? 'live' : 'development',
      launchWeek: opts.live ? -(opts.age || 40) : null,
      announcedWeek: null,
      weeksSinceContent: opts.live ? rng.int(0, 20) : 0,
      contentCadence: rng.int(18, 44),
      age: opts.age || 0
    };
  }

  function angleOf(id) {
    for (var i = 0; i < ANGLES.length; i++) if (ANGLES[i].id === id) return ANGLES[i];
    return ANGLES[0];
  }

  /* ====================================== WHAT A RIVAL CAN HOLD ======

     Rivals used to run on a MOMENTUM: a number added to when they
     shipped content and subtracted from every week in between. The
     subtraction, summed across an eighteen-to-forty-four week cadence,
     came to four to six times the addition - so momentum pinned itself
     to its floor of -12% a week and stayed there, and every rival
     decayed to nothing in about twenty-five weeks. Quality only bought
     three of those weeks. The best game in the market was as doomed as
     the worst, which is not a market: it is a graveyard with a release
     schedule, and it is why a world of rivals felt empty.

     A rival holds a population the same way your game does: an
     equilibrium between what it earns and what it loses, which it
     moves towards rather than compounding a rate away from. Quality is
     most of it, because quality is most of it in the real genre.   */

  /* How much of the market this rival's angle even addresses. */
  function reachOf(state, comp) {
    var angle = angleOf(comp.angle);
    var mix = tax.marketMix(state.era);
    var reach = 0;
    angle.targets.forEach(function (t) { reach += mix[t] || 0; });
    return reach;
  }

  /* The share of the audience it addresses that a rival of this
     quality can hold at its best. Tuned so a good game is a real
     presence in the market and a mediocre one is a footnote. */
  var RIVAL_SHARE = 0.34;

  /* What "everybody is playing it" is worth. It is not a bigger number
     of the same kind - it is a different market. */
  var PHENOMENON_PULL = 2.6;

  function ceilingFor(state, comp, marketPool, mine) {
    /* Quality is the whole game. Thirty is something people try once,
       ninety is something they organise their week around. */
    var q = U.clamp01((comp.quality - 30) / 60);
    var hold = Math.pow(q, 1.9);
    /* A content drought costs them exactly what it costs you. */
    var stale = U.clamp01(comp.weeksSinceContent /
                          Math.max(10, comp.contentCadence * 1.5));
    /* And a better game on the same audience takes the difference.
       This is the only place the player pushes back on a rival, and
       without it the market is weather rather than competition. */
    var beaten = 1;
    if (mine && mine.quality > 0) {
      beaten = U.clamp(1 - (mine.quality - comp.quality) / 120 * mine.overlap, 0.45, 1.25);
    }
    /* And the decade, exactly as it applies to you: how much of the
       market any one game can hold, and what being very good is worth
       in it. The Attention Economy is not kinder to rivals than it is
       to the player. */
    var era = state.era || {};
    var share = era.shareMult === undefined ? 1 : era.shareMult;
    /* Once in a generation a game stops being a game and becomes
       something people who do not play games have heard of. It reaches
       past the audience its genre has, because half the people playing
       it are not there for the genre at all. */
    var famous = comp.phenomenon ? PHENOMENON_PULL : 1;
    return marketPool * reachOf(state, comp) * hold * RIVAL_SHARE *
           comp.budget * (1 - stale * 0.5) * beaten * share *
           tax.qualityEdge(era, comp.quality) * famous;
  }

  /* How good the player's own game looks to the same audience, on the
     same 0-100 scale rivals are rated on. */
  function ownQuality(state) {
    var rt = state.runtime || {};
    if (state.phase !== 'live') return 0;
    var review = rt.reviewScore > 0 ? rt.reviewScore : 55;
    return U.clamp(review * 0.6 + rt.sentiment * 0.4, 0, 100);
  }

  /* How much this rival overlaps with what you are building. */
  function overlap(design, comp, fit) {
    var angle = angleOf(comp.angle);
    var shared = 0, total = 0;
    tax.ARCHETYPES.forEach(function (a) {
      var mine = (fit[a.id] || 0) / 100;
      total += mine;
      if (angle.targets.indexOf(a.id) >= 0) shared += mine;
    });
    return total > 0 ? shared / total : 0;
  }

  /* ============================================================== TICK */

  function tick(state, ctx) {
    init(state);
    var rng = ctx.rng;
    var d = ctx.world.design;
    var out = { pressure: 0, events: [], totalRivalPlayers: 0, live: 0 };
    var marketPool = tax.poolFor(state);
    /* What the player's game is worth to the same audiences, worked
       out once rather than per rival. */
    var mine = { quality: ownQuality(state), overlap: 1 };

    /* Someone new starts building roughly every couple of years - once
       there is a genre for them to start building in. */
    if (state.era.rivals !== false && rng.chance(0.012) && state.competitors.length < 8) {
      var nc = make(state, rng, {});
      nc.announcedWeek = state.week;
      state.competitors.push(nc);
      PN.state.log(state, 'market', nc.studio + ' announced ' + nc.name,
        'A new ' + angleOf(nc.angle).name + ' MMO, targeting ' +
        angleOf(nc.angle).targets.slice(0, 2).join(' and ') + ' players. Years away, but the pitch is landing.');
      out.events.push({ kind: 'announce', comp: nc });
    }

    state.competitors.forEach(function (c) {
      c.age++;
      if (c.status === 'development') {
        /* Two to four years in the oven. */
        if (c.announcedWeek !== null && state.week - c.announcedWeek > rng.int(70, 150)) {
          c.status = 'live';
          c.launchWeek = state.week;
          /* They open somewhere under what their game can hold and
             climb into it, the way a launch actually goes. */
          c.players = Math.round(ceilingFor(state, c, marketPool, mine) * 0.45);
          c.momentum = 0.06;
          out.events.push({ kind: 'launch', comp: c });
          PN.state.log(state, 'market', c.name + ' has launched',
            c.studio + ' shipped their ' + angleOf(c.angle).name + ' MMO. Review scores around ' +
            Math.round(c.quality) + '. Your players are trying it this weekend.');
        }
        return;
      }
      if (c.status === 'dead') return;

      out.live++;
      c.weeksSinceContent++;
      /* They have the same content problem you do. */
      if (c.weeksSinceContent > c.contentCadence) {
        c.weeksSinceContent = 0;
        /* Shipping is also how a studio gets better or worse at this. */
        c.quality = U.clamp(c.quality + rng.range(-2.5, 3.2), 20, 97);
        if (rng.chance(0.35)) {
          out.events.push({ kind: 'content', comp: c });
          PN.state.log(state, 'market', c.name + ' shipped an expansion',
            'Their population is climbing again. Expect a quiet few weeks on your raid nights.');
        }
      }

      /* Towards what a game of theirs can hold, rather than away from
         wherever they happen to be. Growing is slower than falling,
         because winning somebody over takes longer than losing them. */
      var target = ceilingFor(state, c, marketPool, mine);
      var was = c.players;
      var pull = c.players < target ? 0.055 : 0.085;
      c.players = Math.max(0, c.players + (target - c.players) * pull);
      /* Momentum is now a READING rather than a driver: what their
         population actually did this week, which is what the Market
         screen was always trying to show. */
      c.momentum = was > 0 ? U.clamp((c.players - was) / was, -0.5, 0.5) : 0;
      c.target = target;
      c.peak = Math.max(c.peak, c.players);

      /* They shut down when there is nothing holding them up - a game
         nobody rates, or one whose publisher has run out of patience -
         rather than on a timer every rival is on regardless. */
      var doomed = target < 140 && c.players < 220 && c.age > 80;
      if (doomed && rng.chance(0.06)) {
        c.status = 'dead';
        out.events.push({ kind: 'death', comp: c });
        PN.state.log(state, 'market', c.name + ' is shutting down',
          c.studio + ' announced sunset after ' + Math.round(c.age / 52) + ' years. ' +
          'Review scores settled around ' + Math.round(c.quality) +
          ' and the population never recovered. Their remaining players are looking ' +
          'for somewhere to go.');
        /* Their refugees enter the lapsed pool as potential recruits. */
        var angle = angleOf(c.angle);
        angle.targets.forEach(function (t) {
          PN.expansions.addLapsed(state, t, c.peak * 0.12 / angle.targets.length);
        });
      }
      out.totalRivalPlayers += c.players;
    });

    /* Market pressure: how much of the audience is already busy. */
    var saturation = U.clamp01(out.totalRivalPlayers / Math.max(1, marketPool));
    var fit = ctx.fit || {};
    var weighted = 0;
    state.competitors.forEach(function (c) {
      if (c.status !== 'live') return;
      weighted += (c.players / Math.max(1, marketPool)) * overlap(d, c, fit) * (c.quality / 70);
    });
    out.pressure = U.clamp01(weighted);
    out.saturation = saturation;
    state.runtime.marketPressure = out.pressure;
    return out;
  }

  /* A rival launch pulls at the archetypes it targets.

     It used to do it all in one tick: a third of every targeted
     archetype removed from the game in the week the rival shipped.
     That is the same "population fell off a cliff on a Tuesday" shape
     that makes a churn graph unreadable, and it meant a launch was an
     event you survived rather than a rival you competed with.

     A launch is a REASON to leave that hangs around for a couple of
     months. People go and try the new thing; the ones who were happy
     where they were mostly come back or never go. So it raises churn
     among those archetypes and then fades, which is both the honest
     shape and one you can watch happening. */
  var PULL_WEEKS = 10;

  function launchShock(state, comp, ctx) {
    var angle = angleOf(comp.angle);
    var pull = U.clamp01((comp.quality / 100) * 0.85 *
      (1 - (state.runtime.sentiment / 100) * 0.5));
    state.rivalPull = state.rivalPull || {};
    angle.targets.forEach(function (t) {
      state.rivalPull[t] = Math.max(state.rivalPull[t] || 0, pull);
    });
    PN.state.log(state, 'alert', comp.name + ' is taking your players',
      'Mostly ' + angle.targets.slice(0, 2).map(function (t) {
        return tax.ARCHETYPE_BY_ID[t].name.toLowerCase() + 's'; }).join(' and ') +
      '. Expect a couple of months of people trying it. The ones who are happy ' +
      'here will come back; the ones who were not, will not.');
    return 0;
  }

  /* How much harder it is to keep each archetype this week, because
     somebody else just launched something for them. */
  function pullOn(state) { return state.rivalPull || {}; }

  function fadePull(state) {
    if (!state.rivalPull) return;
    var k = Math.pow(0.5, 1 / Math.max(1, PULL_WEEKS / 2));
    U.keys(state.rivalPull).forEach(function (t) {
      state.rivalPull[t] *= k;
      if (state.rivalPull[t] < 0.01) delete state.rivalPull[t];
    });
  }

  function report(state) {
    init(state);
    var marketPool = tax.poolFor(state);
    return (state.competitors || []).map(function (c) {
      return {
        c: c, angle: angleOf(c.angle),
        share: marketPool > 0 ? c.players / marketPool : 0,
        vsYou: state.population.total > 0 ? c.players / state.population.total : 0
      };
    }).sort(function (a, b) { return b.c.players - a.c.players; });
  }

  /* ---------------------------------------------------- what happens

     A market where nothing ever happens to anybody else is scenery.
     These are the two things that actually change a rival: their next
     release lands better or worse than the last one, and - once, if
     ever - one of them stops being an MMO and becomes a thing people
     who do not play MMOs have heard of. */

  /* Everybody live, best first. */
  function liveRivals(state) {
    return (state.competitors || []).filter(function (c) { return c.status === 'live'; })
      .sort(function (a, b) { return b.quality - a.quality; });
  }

  function anyPhenomenon(state) {
    return (state.competitors || []).some(function (c) { return c.phenomenon; });
  }

  /* One rival's reputation moves. Small, and in either direction. */
  function driftQuality(state, rng) {
    var live = liveRivals(state);
    if (!live.length) return null;
    var c = rng.pick(live);
    var up = rng.chance(0.5);
    var move = rng.range(3, 9) * (up ? 1 : -1);
    var was = c.quality;
    c.quality = U.clamp(c.quality + move, 20, 97);
    return { comp: c, was: was, up: up, move: c.quality - was };
  }

  /* And the once-in-a-save one. Only a game that is already very good
     can become this, and only one ever does. */
  function makePhenomenon(state, rng) {
    if (anyPhenomenon(state)) return null;
    var able = liveRivals(state).filter(function (c) { return c.quality >= 80; });
    if (!able.length) return null;
    var c = able[0];
    c.phenomenon = true;
    c.phenomenonWeek = state.week;
    c.quality = U.clamp(c.quality + 3, 20, 99);
    return c;
  }

  PN.competitors = {
    ANGLES: ANGLES, init: init, tick: tick, launchShock: launchShock,
    liveRivals: liveRivals, anyPhenomenon: anyPhenomenon,
    driftQuality: driftQuality, makePhenomenon: makePhenomenon,
    PHENOMENON_PULL: PHENOMENON_PULL,
    pullOn: pullOn, fadePull: fadePull,
    report: report, angleOf: angleOf, overlap: overlap
  };
})(PN);
