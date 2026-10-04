/* Patch Notes - the player economy.
   Currency is counted, not estimated. Every coin in the game is in
   somebody's purse, faucets add to that pool and sinks remove from it,
   and the gap between them is inflation that new players actually feel. */
(function (PN) {
  'use strict';
  var U = PN.util;

  function init(state) {
    if (state.economy) return state.economy;
    state.economy = {
      supply: 0, perCapita: 0, basePerCapita: 0, normalised: 0, baseNormalised: 0,
      faucetWeek: 0, sinkWeek: 0,
      inflation: 1, priceIndex: 1,
      rmtVolume: 0, botShare: 0,
      history: []
    };
    return state.economy;
  }

  /* Total currency held by the playerbase right now, plus a
     level-normalised figure. A level-60 player is supposed to be richer
     than a level-5 one, so raw per-capita is a useless inflation
     measure in a game whose population is still levelling.          */
  function measureSupply(state) {
    var d = PN.sim.live(state);
    var money = PN.currency.moneyOf(d);
    if (!money) return { supply: 0, gold: null, normalised: 0, byCurrency: {} };
    /* Every currency is counted, not only the one prices are quoted
       in - a token you cannot see the supply of is a token you
       cannot tune. Inflation still reads off money, because that is
       the only one prices are in. */
    var all = PN.currency.currencies(d);
    var by = {};
    all.forEach(function (c) { by[c.id] = 0; });
    var total = 0, levelWeight = 0;
    state.agents.forEach(function (a) {
      all.forEach(function (c) { by[c.id] += ((a.cur || {})[c.id] || 0) * a.w; });
      levelWeight += Math.pow(Math.max(1, a.lv), 1.5) * a.w;
    });
    total = by[money.id] || 0;
    return { supply: total, gold: money.item, byCurrency: by,
             normalised: levelWeight > 0 ? total / levelWeight : 0 };
  }

  /* Weekly settlement. ctx carries what the agent tick actually moved. */
  /* Mild inflation is the healthy band: enough that money keeps
     moving, not so much that a new player can never catch up. */
  var HEALTHY_INFLATION = 1.12;

  function tick(state, ctx) {
    var e = init(state);
    var d = ctx.world.design;
    var measured = measureSupply(state);
    var prevSupply = e.supply;

    e.supply = measured.supply;
    var pop = Math.max(1, state.population.total);
    e.perCapita = e.supply / pop;
    /* Every currency, so a token can be tuned by somebody who can see
       how much of it is out there. */
    e.byCurrency = measured.byCurrency || {};

    /* Faucets are everything agents earned; sinks are what the design
       took back. Anything the design does not sink stays in the pool. */
    e.faucetWeek = Math.max(0, e.supply - prevSupply) + (ctx.goldSunk || 0);
    e.sinkWeek = ctx.goldSunk || 0;

    /* The sinks you authored. Each one is a specific thing that takes
       a specific currency out of a specific pocket, which is what an
       economy actually is - the faucet and sink dials are only the
       overall pressure on top of them. */
    var extraSink = 0;
    var money2 = PN.currency.moneyOf(d);
    if (money2) {
      var drain = PN.currency.drainOf(d, money2.id);
      /* A share of what everybody earned this week. */
      extraSink += (e.faucetWeek || 0) * drain.income;
      /* A share of the pile, which is the only sink that can ever
         catch a runaway economy. */
      extraSink += e.supply * drain.wealth;
      /* And a cut of whatever actually changes hands. */
      if (drain.trade > 0 && d.economy.auctionHouse && d.economy.tradingEnabled) {
        /* How much changes hands depends on what is worth trading, and
           that is the market's answer rather than a count of recipes.
           A game whose tradeable goods are all worth nothing has a busy
           auction house and no volume on it. */
        var depth = PN.market.tradeDepth(d);
        var tradeVolume = e.supply * 0.06 * (0.35 + depth * 1.3) *
          PN.items.tradeableShare(d);
        e.tradeVolume = tradeVolume;
        extraSink += tradeVolume * drain.trade;
      } else {
        e.tradeVolume = 0;
      }
    }
    extraSink *= 0.5 + (d.economy.sinkRate / 100) * 1.4;
    e.supply = Math.max(0, e.supply - extraSink);
    e.sinkWeek += extraSink;

    /* Remove the drained amount from purses so the books balance. */
    if (extraSink > 0 && measured.gold && e.supply > 0) {
      var factor = e.supply / Math.max(1, measured.supply);
      state.agents.forEach(function (a) {
        if (a.cur[measured.gold.id]) a.cur[measured.gold.id] *= factor;
      });
    }
    e.perCapita = e.supply / pop;

    /* Inflation is a RATE, not a lifetime total: currency per unit of
       expected wealth now, against the same figure a year ago. That is
       immune to the population's level mix drifting, which a fixed
       launch baseline is not.                                       */
    e.normalised = measured.normalised;
    var lookback = 52;
    var hist = e.history;
    var past = hist.length > lookback ? hist[hist.length - lookback]
             : (hist.length > 8 ? hist[0] : null);
    if (past && past.normalised > 0 && e.normalised > 0) {
      var target = U.clamp(e.normalised / past.normalised, 0.1, 6);
      e.inflation += (target - e.inflation) * 0.22;
    } else {
      e.inflation += (1 - e.inflation) * 0.2;
    }

    /* An economy analyst is somebody watching the faucets, and what
       that buys is the correction landing sooner. Nobody listens to
       them until it is too late, so what they actually do is pull a
       drifting currency back towards a healthy band before it becomes
       the crisis that prices out every new player.

       This was in the role table and wired to nothing: a two-thousand
       a month salary that changed no number in the game. */
    var analyst = (ctx && ctx.effects && ctx.effects.economy) || 0;
    if (analyst > 0 && e.inflation > 0) {
      var pull = U.clamp01(U.saturate(analyst, 2.2) * 0.32);
      e.inflation += (HEALTHY_INFLATION - e.inflation) * pull;
    }
    if (!e.baseNormalised && e.normalised > 0) e.baseNormalised = e.normalised;
    /* Prices follow supply with a lag; new players feel this first. */
    e.priceIndex += (e.inflation - e.priceIndex) * 0.18;

    /* What draws a gold seller is not how much currency exists, it is
       how WORTH FARMING it is. An hour of farming is worth something
       real when prices are rising faster than the faucet, when the
       grind is long enough that people will pay to skip it, and when
       the gold can actually change hands at the other end.

       That is why inflation and botting arrive together: the same
       conditions that make gold easy to earn make it worth selling. */
    var grind = ctx.engines ? ctx.engines.grindIntensity : 40;
    var worthFarming = U.clamp(e.inflation, 0.4, 3);
    var attract = (d.economy.tradingEnabled ? 1 : 0.15) *
                  (1 + grind / 110) * U.saturate(pop, 600) *
                  worthFarming *
                  /* Anti-RMT spend is the thing that fights it. */
                  (1 - U.clamp01((d.economy.antiRmtSpend || 0) / 100) * 0.7);
    e.rmtVolume = attract * 100;
    e.botShare = U.clamp01(state.runtime.botPressure / 140);

    /* Every currency's total, not only the one prices are quoted in.
       "Is there more gold in the game this month than last" is the
       question an economy screen exists to answer, and it could not
       be asked of a history that only kept one number. */
    e.history.push({ week: state.week, supply: e.supply, perCapita: e.perCapita,
                     normalised: e.normalised, held: U.clone(e.byCurrency || {}),
                     inflation: e.inflation, faucet: e.faucetWeek, sink: e.sinkWeek });
    if (e.history.length > 400) e.history.shift();
    return e;
  }

  /* How the economy's state feeds the need axes. */
  function axisEffects(state) {
    var e = state.economy;
    if (!e || !e.baseNormalised) return { value: 0, fairness: 0, note: 'Economy settling' };
    var infl = e.inflation;
    var out = { value: 0, fairness: 0, growth: 0, note: '' };

    /* Controlled inflation is the healthy state of an MMO economy: it
       is what lets somebody who started this month catch up with
       somebody who stopped playing last year. It only becomes a
       problem at the two ends.

       Too high and gold is worth farming for its own sake, which is
       what a bot is; and the people holding the most watch it
       evaporate. Too low and the pile wins - which suits everybody
       who already has one and gives a new player no way in. */
    if (infl > 1.65) {
      out.value = -U.clamp((infl - 1.65) * 16, 0, 24);
      out.fairness = -U.clamp((infl - 1.65) * 9, 0, 16);
      out.growth = -U.clamp((infl - 1.65) * 0.25, 0, 0.35);
      out.note = 'Runaway inflation - prices have left new players behind';
    } else if (infl > 1.3) {
      out.value = -U.clamp((infl - 1.3) * 8, 0, 7);
      out.note = 'Inflation running hot';
    } else if (infl >= 0.98) {
      /* The healthy band. Newer players gain on the pile. */
      out.value = 4;
      out.growth = 0.05;
      out.note = infl > 1.04 ? 'Healthy inflation - newer players are catching up'
                             : 'Stable';
    } else if (infl > 0.82) {
      out.value = 1;
      out.note = 'Flat - the pile is holding its value';
    } else {
      /* Deflation suits whoever already has money and nobody else. */
      out.value = -U.clamp((0.82 - infl) * 14, 0, 14);
      out.growth = -U.clamp((0.82 - infl) * 0.5, 0, 0.4);
      out.note = 'Deflation - the rich are fine, nobody new can get started';
    }
    return out;
  }

  /* A readable snapshot for the economy view. */
  function report(state) {
    var e = init(state);
    var flow = e.faucetWeek - e.sinkWeek;
    return {
      supply: e.supply, perCapita: e.perCapita, inflation: e.inflation,
      priceIndex: e.priceIndex, faucet: e.faucetWeek, sink: e.sinkWeek,
      netFlow: flow,
      verdict: e.inflation > 1.6 ? 'Runaway' : e.inflation > 1.2 ? 'Inflating'
             : e.inflation < 0.55 ? 'Deflating' : 'Stable',
      history: e.history
    };
  }

  PN.economy = { init: init, tick: tick, measureSupply: measureSupply,
                 axisEffects: axisEffects, report: report };
})(PN);
