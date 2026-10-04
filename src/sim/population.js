/* Patch Notes - the simulated playerbase.
   Cohorts are archetype x skill-band groups. Each week they spend their
   time budget on whatever content they care about, judge the game on ten
   axes, and decide whether to stay, spend, recruit, or leave.             */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax;

  /* Spending propensity by archetype. Collectors and roleplayers buy
     cosmetics; competitors and economists resent being sold anything.   */
  var SPEND_INDEX = {
    progressor: 1.00, raider: 1.15, competitor: 0.85, socialite: 0.95,
    explorer: 0.80, completionist: 1.60, economist: 0.70, roleplayer: 1.45,
    drifter: 0.55, creator: 1.20
  };

  function cohortKey(archId, bandId) { return archId + ':' + bandId; }

  function newCohort(archId, bandId) {
    var consumed = {};
    tax.CATEGORY_IDS.forEach(function (c) { consumed[c] = 0; });
    return {
      key: cohortKey(archId, bandId),
      arch: archId, band: bandId,
      size: 0, tenure: 0, weeksAtCap: 0,
      consumed: consumed,
      levelPct: 0, gearRatio: 0,
      satisfaction: 50, axisScores: {}, novelty: 60,
      lastChurn: 0, lastJoin: 0, fed: 1, spendWeek: 0
    };
  }

  function ensureCohorts(state) {
    if (state.population.cohorts.length) return state.population.cohorts;
    var list = [];
    tax.ARCHETYPES.forEach(function (a) {
      tax.SKILL_BANDS.forEach(function (b) { list.push(newCohort(a.id, b.id)); });
    });
    state.population.cohorts = list;
    return list;
  }

  function bandOf(id) {
    for (var i = 0; i < tax.SKILL_BANDS.length; i++)
      if (tax.SKILL_BANDS[i].id === id) return tax.SKILL_BANDS[i];
    return tax.SKILL_BANDS[1];
  }

  /* ===================================================== CONTENT BURN ====
     A cohort spends its weekly hours on categories it cares about, taking
     finite content first (it is more satisfying), then falling back on
     repeatable systems. Returns how well-fed it was.                    */
  function consume(state, co, inv, engineHours, engineDecay) {
    var arch = tax.ARCHETYPE_BY_ID[co.arch];
    var band = bandOf(co.band);
    var budget = arch.time * (0.75 + band.skill * 0.35);
    var spent = 0, freshSpent = 0, supply = 0;
    var perCat = {};

    /* Engine yield fades as a cohort grinds the same systems for months. */
    var fatigue = 0.22 + 0.78 * Math.exp(-co.weeksAtCap * (engineDecay || 0.08));

    /* How much is even on the table this week. */
    var offers = [], engineRaw = 0, freshAvail = 0;
    tax.CATEGORY_IDS.forEach(function (c) {
      var appeal = arch.appeal[c];
      if (appeal < 0.12) return;
      var finiteLeft = Math.max(0, (inv[c] || 0) * appeal - (co.consumed[c] || 0));
      var engine = (engineHours[c] || 0) * appeal * fatigue;
      if (finiteLeft + engine <= 0.01) return;
      offers.push({ cat: c, appeal: appeal, finiteLeft: finiteLeft, engine: engine });
      engineRaw += engine; freshAvail += finiteLeft;
    });

    /* Repeatable systems have hard diminishing returns in aggregate.
       Bolting on a tenth grind does not give a player a tenth more to do
       - it gives them another chore competing for the same evening.    */
    var ENGINE_CAP = 12;
    var engineScale = engineRaw > 0
      ? (ENGINE_CAP * U.saturate(engineRaw, ENGINE_CAP)) / engineRaw : 0;
    var engineAvail = 0;
    offers.forEach(function (o) {
      o.engine *= engineScale;
      o.avail = o.finiteLeft + o.engine;
      engineAvail += o.engine;
      supply += o.avail;
    });

    /* Allocate the time budget by appeal, capped by what exists. */
    var wTotal = U.sum(offers, function (o) { return o.appeal; });
    offers.forEach(function (o) {
      var want = wTotal > 0 ? budget * (o.appeal / wTotal) : 0;
      var take = Math.min(want, o.avail);
      var fresh = Math.min(take, o.finiteLeft);
      co.consumed[o.cat] = (co.consumed[o.cat] || 0) + fresh;
      spent += take; freshSpent += fresh;
      perCat[o.cat] = take;
    });

    /* Anything left over is time the player had and could not use. */
    co.fed = budget > 0 ? U.clamp01(spent / budget) : 1;
    co.freshRatio = spent > 0 ? freshSpent / spent : 0;
    co.supplyRatio = budget > 0 ? supply / budget : 0;
    co.freshSupply = budget > 0 ? freshAvail / budget : 0;
    co.engineSupply = budget > 0 ? engineAvail / budget : 0;
    co.hoursPlayed = spent;
    co.budget = budget;
    co.perCat = perCat;
    return co;
  }

  /* Novelty is the drought axis, and it runs on the same model the
     per-player simulation uses so the curve and the agents cannot
     disagree: unseen content, plus what this cohort still has left to
     finish, plus the goodwill the last release still owes.

     The middle term is the evergreen one. A cohort deep into a game
     with plenty still on its list stays put; one that has finished
     everything you built leaves however recent the patch was.      */
  function noveltyFor(state, co) {
    var d = PN.sim.live(state) || state.design;
    var chase = 0;
    if (d && PN.goals) {
      /* The cohort already tracks how far up the ladder it is and
         how long it has been here; both are what decide how much of
         your game it has got through. */
      chase = PN.goals.outstandingFor(d, co.arch, co.levelPct || 0, co.tenure || 0);
    }
    return PN.novelty.novelty(state, chase, co.freshSupply || 0, co.engineSupply || 0);
  }

  /* ================================================== COHORT SATISFACTION */
  function scoreCohort(state, co, axisVals) {
    var arch = tax.ARCHETYPE_BY_ID[co.arch];
    var band = bandOf(co.band);
    var v = {};
    tax.AXIS_IDS.forEach(function (id) { v[id] = axisVals[id]; });

    /* --- personalise the axes to this cohort ------------------------- */

    /* Skill changes what the game feels like. Elite players find your
       content easier and your systems more accessible.                */
    var skillDelta = (band.skill - 0.5);
    v.challenge = U.clamp100(v.challenge * (1 - skillDelta * 0.52));
    v.accessibility = U.clamp100(v.accessibility + skillDelta * 16);
    v.mastery = U.clamp100(v.mastery * (0.78 + band.skill * 0.44));

    /* Progression collapses when you run out of ladder. */
    var gearHeadroom = U.clamp01(1 - co.gearRatio);
    var progMult = co.levelPct < 0.995 ? 1.0 : (0.38 + 0.62 * gearHeadroom);
    v.progression = U.clamp100(v.progression * progMult);

    /* Drought. */
    v.novelty = co.novelty;

    /* Social needs other people actually being there. */
    var popFactor = U.clamp(U.saturate(state.population.total, 45000) * 1.25, 0.25, 1.15);
    v.social = U.clamp100(v.social * popFactor);

    /* --- score each axis against this archetype's ideal --------------- */
    var total = 0, detail = {};
    tax.AXIS_IDS.forEach(function (id) {
      var def = tax.AXIS_BY_ID[id], ideal = arch.ideals[id], val = v[id];
      var gap = val >= ideal ? (val - ideal) * def.over : (ideal - val) * def.under;
      var s = U.clamp100(100 - gap);
      detail[id] = { value: val, ideal: ideal, score: s, weight: arch.weights[id],
                     contribution: s * arch.weights[id] };
      total += s * arch.weights[id];
    });

    co.axisScores = detail;
    co.axisValues = v;
    co.satisfaction = U.clamp100(total);
    return co.satisfaction;
  }

  /* ============================================================= CHURN == */
  function churnFor(state, co, globalChurnRate) {
    var arch = tax.ARCHETYPE_BY_ID[co.arch];
    var d = state.design;

    /* Satisfaction drives churn on an S-curve, not a straight line.
       "Fine, I suppose" (around 70) is not a healthy game - it is a game
       people drift away from. The curve is steep through the middle and
       flattens at both ends, and it never reaches zero, because real
       life happens to people who are having a lovely time.             */
    var satMult = U.clamp(0.30 + 2.60 * (1 - U.sigmoid(co.satisfaction, 62, 12)), 0.30, 3.40);
    var rate = arch.churn * satMult;

    /* Tenure: new players leak, veterans stick. */
    var tenureMult = 1.85 * Math.exp(-co.tenure / 11) + 0.62;
    rate *= tenureMult;

    /* Social contagion: when people leave, they take friends with them.
       Guild systems and dense worlds amplify this in both directions.  */
    var socialBinding = (d.social.guildProgression ? 0.22 : 0) +
                        (d.social.guildPerks ? 0.08 : 0) +
                        U.saturate(d.social.guildSize, 70) * 0.18 +
                        (PN.schema.hasEngine(d, 'guildProgression') ? 0.16 : 0) +
                        (PN.schema.hasEngine(d, 'housing') ? 0.14 : 0);
    rate *= (1 - U.clamp(socialBinding, 0, 0.42));
    rate += globalChurnRate * arch.social * 0.30;

    /* Total drought is its own cliff, on top of the axis score. */
    if (co.supplyRatio < 0.45) rate *= 1 + (0.45 - co.supplyRatio) * 1.5;

    return U.clamp(rate, 0.002, 0.62);
  }

  /* ========================================================== ACQUISITION */
  /* How much of anybody's decision to try a game is NOT about whether
     it was built for THEM.

     Fit is steep on purpose - a game that suits somebody converts them
     far better than one that nearly does - but on its own it says a
     game which is 30% right for roleplayers gets essentially none,
     ever, and an audience that can never be in the game is an audience
     the player can never do anything about. Every real MMO has people
     in it who are not the people it was built for: the raid guild's
     partner who only fishes, the friend who came for the people.

     So every archetype converts at least this share of what the
     BEST-SERVED audience in the same game converts - a share of that
     game's own ceiling, not a flat floor. A flat one would have been a
     subsidy for bad games: a thin game with nothing to do in it would
     have ridden on it exactly as hard as a good one, and what you
     build would have stopped deciding how many people you hold. */
  var BASE_PULL = 0.20;

  /* How much of the market a perfect fit converts in a week.

     It is a calibration, not a law: fit itself changed when the axis
     weights were renormalised - every archetype's score went up,
     because several of them had been scored out of less than a hundred
     - and a floor under conversion raised it again. Both of those are
     about who joins RELATIVE to whom, and neither is a reason for
     every game ever built to suddenly acquire twice the players. This
     puts the absolute rate back where the rest of the game is tuned,
     measured against the themepark preset - and it is quoted at the
     market scale it was tuned at, then adjusted to whatever scale the
     genre is currently shrunk by. */
  var TUNED_AT_SCALE = 100;
  var CONVERSION_AT_TUNING = 0.0134;

  /* How hard "everybody who was going to try it already has" bites,
     again at the tuning scale. */
  var SATURATION_AT_TUNING = 2.6;

  /* Both numbers above are read against the SIZE of the market, so the
     scale the genre is shrunk by cancels straight out of them: a pool
     half the size converts at twice the rate and saturates at half the
     pace, and exactly the same people end up in the game. Deriving
     them rather than writing the scale down twice is what keeps
     MARKET_SCALE a dial about what the screen reads, and stops it
     quietly becoming a dial about balance. */
  function scaleAdj() {
    return (tax.MARKET_SCALE || TUNED_AT_SCALE) / TUNED_AT_SCALE;
  }

  /* How good this game looks to somebody choosing between games, on the
     same 0-100 scale rivals are rated on. */
  function standingOf(state) {
    var rt = state.runtime || {};
    var review = rt.reviewScore > 0 ? rt.reviewScore : 55;
    return U.clamp(review * 0.6 + (rt.sentiment === undefined ? 55 : rt.sentiment) * 0.4, 0, 100);
  }

  function acquire(state, fit, coherence) {
    var d = state.design, rt = state.runtime, era = state.era;
    var mix = tax.marketMix(era);
    var bizModel = PN.prim.find(PN.prim.BUSINESS_MODELS, d.monetisation.model);
    var setting = PN.prim.find(PN.prim.SETTINGS, d.identity.setting);

    /* The market as it actually is this week - eased across an era
       change, and shrinking if the genre is in decline. */
    var marketPool = tax.poolFor(state);

    /* What the genre thinks of a game with no price on it. The business
       model's own funnel is what KIND of game it is; this is the decade
       talking. In 2004 free meant a scam or an import nobody's friends
       played; by 2016 free is simply how an MMO opens. */
    var freeEdge = tax.isFreeToPlay(d)
      ? (era.freeEdge === undefined ? 1 : era.freeEdge) : 1;

    var reach = Math.pow(U.clamp01(rt.awareness / 100), 1.25) *
                coherence.marketingMult * bizModel.reachMult * setting.reach * freeEdge;

    /* Saturation: you cannot keep selling to people who already tried it.
       This is what turns a launch spike into a curve with a peak on it. */
    var tried = state.population.lifetimeAccounts / Math.max(1, marketPool);
    var saturation = Math.max(0.015,
      Math.exp(-tried * (SATURATION_AT_TUNING / scaleAdj())));

    /* Sentiment and review score gate conversion hard. */
    var sentimentMult = 0.35 + (rt.sentiment / 100) * 1.25;
    var reviewMult = rt.reviewScore > 0 ? (0.42 + (rt.reviewScore / 100) * 1.15) : 1;

    /* And how much of the market any ONE game can hold this decade. A
       market twice the size that everybody splits five ways is not a
       bigger game - which is the whole shape of the Attention Economy,
       and why being very good in it is worth so much more than being
       fine. Rivals read the same two numbers. */
    var share = era.shareMult === undefined ? 1 : era.shareMult;
    var edge = tax.qualityEdge(era, standingOf(state));

    /* What the audience this game serves best converts. The floor is a
       share of that, so it rises and falls with the game. */
    var ceiling = 0;
    tax.ARCHETYPES.forEach(function (arch) {
      ceiling = Math.max(ceiling, Math.pow(U.clamp01(fit[arch.id] / 100), 2.4));
    });
    var floor = ceiling * BASE_PULL;

    var out = {}, totalNew = 0;
    tax.ARCHETYPES.forEach(function (arch) {
      var f = U.clamp01(fit[arch.id] / 100);
      var conv = Math.max(Math.pow(f, 2.4), floor) * CONVERSION_AT_TUNING * scaleAdj();
      var n = marketPool * mix[arch.id] * reach * conv * saturation *
              sentimentMult * reviewMult * share * edge;
      out[arch.id] = n;
      totalNew += n;
    });
    return { byArchetype: out, total: totalNew, saturation: saturation };
  }

  /* ============================================================= REVENUE */
  function revenue(state, co) {
    var d = state.design, M = d.monetisation;
    var arch = tax.ARCHETYPE_BY_ID[co.arch];
    var bizModel = PN.prim.find(PN.prim.BUSINESS_MODELS, M.model);
    var era = state.era;

    var idx = SPEND_INDEX[co.arch] || 1;
    var base = bizModel.arpuBase / 4.33;

    /* Happy players spend more, but only in models that let them. */
    var satMult = 0.45 + (co.satisfaction / 100) * 1.05;

    /* Shop breadth and prominence. */
    var shopPower = 0;
    (M.shop || []).forEach(function (s) {
      if (!s.enabled) return;
      var def = PN.prim.SHOP_BY_ID[s.catId]; if (!def) return;
      var catAppeal = def.cats.length
        ? U.avg(def.cats, function (c) { return arch.appeal[c]; })
        : 0.5;
      shopPower += def.appeal * (0.3 + (s.prominence / 100) * 0.9) * (0.45 + catAppeal * 0.9);
    });
    var shopMult = bizModel.tags.indexOf('premium') >= 0 && M.model !== 'hybrid'
      ? 0.12 + U.saturate(shopPower, 3.4) * 0.5
      : 0.25 + U.saturate(shopPower, 3.0) * 1.15;

    var passMult = 1;
    if (M.battlePass.enabled) {
      var bp = M.battlePass;
      var quality = U.clamp01((bp.premiumRewards / 55) * 0.6 + (bp.fomo / 100) * 0.4);
      passMult = 1 + quality * 0.42;
    }

    /* Subscriptions are the floor; everything else is elastic. */
    var subPart = 0;
    if (M.model === 'sub' || M.model === 'hybrid') {
      var churnRisk = co.satisfaction < 38 ? 0.55 : 1;
      subPart = (M.subPrice / 4.33) * churnRisk;
    } else if (M.model === 'boxExp') {
      subPart = 0.75;   /* amortised expansion revenue */
    }

    var elastic = base * idx * satMult * shopMult * passMult * (0.6 + era.f2pNorm * 0.7);
    var perPlayer = subPart + elastic * (M.model === 'sub' ? 0.25 : 1);

    co.spendWeek = perPlayer;
    return perPlayer * co.size;
  }

  PN.pop = {
    SPEND_INDEX: SPEND_INDEX,
    ensureCohorts: ensureCohorts, newCohort: newCohort, bandOf: bandOf,
    consume: consume, noveltyFor: noveltyFor, scoreCohort: scoreCohort,
    churnFor: churnFor, acquire: acquire, revenue: revenue, standingOf: standingOf
  };
})(PN);
