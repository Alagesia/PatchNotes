/* Patch Notes - currencies, and the things that drain them.

   The economy only ever looked at one currency: the first item of kind
   'currency' in your item list. That one was money - supply, inflation,
   wealth, the richest-players table, all of it. Everything else you
   authored was a number in a bag. Valour "worked" only by accident:
   the vendor code reached for the first currency that was not the money
   one, so a second currency became a catch-up token because of the
   order you happened to add it in.

   A currency is a design object now. It has a job, it has faucets you
   authored by putting it in rewards, and it has SINKS you author here -
   which is the half that was missing. An economy is not a faucet rate
   and a sink rate, it is a list of specific things that take specific
   currency out of specific pockets, and that list is a design.      */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* What a currency is FOR. The job decides how it behaves: money
     inflates, tokens do not because they are capped and spent. */
  var ROLES = [
    { id: 'money', name: 'Money',
      desc: 'The one prices are quoted in. It accumulates, it inflates, and it is what "wealth" means.',
      inflates: true, capped: false },
    { id: 'token', name: 'Token',
      desc: 'Earned from doing content and spent at a vendor. Capped per week, so it is a schedule rather than a pile.',
      inflates: false, capped: true },
    { id: 'prestige', name: 'Prestige',
      desc: 'Never spent. A number that says what you did - honour, renown, a season score.',
      inflates: false, capped: false },
    { id: 'premium', name: 'Premium',
      desc: 'Bought with real money. Nothing in the world hands it out.',
      inflates: false, capped: false }
  ];
  var ROLE_BY_ID = {};
  ROLES.forEach(function (r) { ROLE_BY_ID[r.id] = r; });

  /* The things that take currency back out of the game. Each one is a
     real behaviour somebody does, so a design can say "repairs are the
     sink" or "housing is the sink" and mean it. */
  /* The things that take currency back out of the game.

     What is NOT here matters as much as what is. "Consumables" was a
     slider for a thing you already author - a potion has a vendor
     price and a recipe, and what people spend on potions is read off
     those. "Vendor goods" was the same mistake: every item carries
     its own price, so the sink is a sum of your own prices rather
     than a dial on top of them.

     What is left is the things that have no object behind them - the
     costs of playing rather than the price of a thing. */
  var SINK_KINDS = [
    { id: 'repair', name: 'Repairs',
      desc: 'Dying costs money. A tax on playing badly, and on playing at all.',
      scale: 'income', hint: 'A share of what a player earned.' },
    { id: 'auctionTax', name: 'Auction cut',
      desc: 'A percentage of every trade, removed from the game.',
      scale: 'trade', hint: 'Only works if people actually trade.' },
    { id: 'respec', name: 'Respeccing',
      desc: 'Changing your build costs.',
      scale: 'income', hint: 'A sink on experimenting, which is a strange thing to tax.' },
    { id: 'travel', name: 'Fast travel',
      desc: 'Getting there quickly costs.',
      scale: 'income', hint: 'Small, constant, and nobody resents it.' },
    { id: 'housing', name: 'Housing',
      desc: 'Somewhere to live, and everything to put in it.',
      scale: 'wealth', hint: 'The classic wealth sink. Bottomless if you let it be.' },
    { id: 'guild', name: 'Guild upkeep',
      desc: 'Halls, perks, banks and tabards.',
      scale: 'wealth', hint: 'Drains the people with the most, through the group.' }
  ];
  var SINK_BY_ID = {};
  SINK_KINDS.forEach(function (s) { SINK_BY_ID[s.id] = s; });

  function newSink(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('snk'),
      kind: opts.kind || 'repair',
      currencyId: opts.currencyId || null,
      /* 0-100. How hard this one pulls. */
      rate: opts.rate === undefined ? 30 : opts.rate,
      enabled: opts.enabled === undefined ? true : !!opts.enabled
    };
  }

  /* A design written before sinks were authorable has none, and a game
     with no sinks at all only goes one way. So the first time anybody
     asks, the old dials are read out into the sinks they always
     described: repairs if you charged for them, an auction cut if you
     set one, and a vendor sink standing in for the wealth tax that
     used to be hard-coded. The numbers are yours from then on. */
  function seedSinks(design) {
    var money = moneyOf(design);
    if (!money) return [];
    var ec = design.economy;
    var made = [];
    if (ec.vendorRepair) {
      made.push(newSink({ kind: 'repair', currencyId: money.id,
        rate: U.clamp(ec.deathRepairCost || 25, 5, 100) }));
    }
    if (ec.auctionHouse && ec.tradingEnabled && (ec.auctionTax || 0) > 0) {
      made.push(newSink({ kind: 'auctionTax', currencyId: money.id,
        rate: U.clamp((ec.auctionTax || 0) * 4, 5, 100) }));
    }
    /* Shopping is priced on the items themselves, so there is no dial
       for it here. Housing stands in as the wealth sink the old
       hard-coded tax used to be, at the rate you had set. */
    made.push(newSink({ kind: 'housing', currencyId: money.id,
      rate: U.clamp(ec.sinkRate === undefined ? 40 : ec.sinkRate, 0, 100) }));
    return made;
  }

  function sinks(design) {
    if (!design.economy) return [];
    if (!design.economy.sinks) design.economy.sinks = seedSinks(design);
    return design.economy.sinks;
  }

  /* Every currency you authored, in order, with its job. */
  var currencies = U.memoDesign(function (design) {
    var out = [];
    (design.items || []).forEach(function (i) {
      if (i.kind !== 'currency') return;
      out.push({
        id: i.id, name: i.name, item: i,
        /* Currencies made before roles existed: the first is money and
           anything else is a token, which is what the simulation was
           already doing by accident. */
        role: i.currencyRole || (out.length === 0 ? 'money' : 'token'),
        capPerWeek: i.capPerWeek === undefined ? 0 : i.capPerWeek
      });
    });
    return out;
  });

  function moneyOf(design) {
    var list = currencies(design);
    for (var i = 0; i < list.length; i++) if (list[i].role === 'money') return list[i];
    return list[0] || null;
  }

  function byId(design, id) {
    var list = currencies(design);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* Which currency a vendor takes. A token beats money, because that is
     what a token is for - but it is now the currency you MARKED as a
     token rather than whichever one you happened to add second. */
  function vendorToken(design) {
    var list = currencies(design);
    for (var i = 0; i < list.length; i++) if (list[i].role === 'token') return list[i];
    return moneyOf(design);
  }

  /* How much of a currency comes out of the world in a week, per player,
     read off where you actually placed it. */
  var faucetOf = U.memoDesign(function (design) {
    var out = {};
    currencies(design).forEach(function (c) { out[c.id] = 0; });
    (design.rewards || []).forEach(function (r) {
      U.keys(r.currencies || {}).forEach(function (cid) {
        if (out[cid] === undefined) return;
        out[cid] += r.currencies[cid];
      });
    });
    (design.lootTables || []).forEach(function (t) {
      var entries = (t.entries || []).concat(t.guaranteed || []);
      var totalW = U.sum(entries, function (e) { return e.weight || 1; }) || 1;
      entries.forEach(function (e) {
        if (out[e.itemId] === undefined) return;
        var qty = ((e.qtyMin || 1) + (e.qtyMax || e.qtyMin || 1)) / 2;
        out[e.itemId] += qty * ((e.weight || 1) / totalW) * (t.rolls || 1);
      });
    });
    return out;
  });

  /* What a currency has draining it, and how hard. Returns the total
     pull 0-1 plus the sinks themselves, so a screen can list them. */
  function drainOf(design, currencyId) {
    var list = sinks(design).filter(function (s) {
      return s.enabled !== false && s.currencyId === currencyId; });
    var byScale = { income: 0, wealth: 0, trade: 0 };
    list.forEach(function (s) {
      var def = SINK_BY_ID[s.kind];
      if (!def) return;
      byScale[def.scale] += (s.rate || 0) / 100;
    });
    /* Shopping is a wealth sink whether or not you set a dial for it,
       because your items have prices. */
    var shopping = shopDrain(design);
    return {
      sinks: list, shopping: shopping,
      /* A share of weekly income, a share of the pile, and a cut of
         trade. Three different shapes, and a design needs some of each
         to hold still. */
      income: U.clamp01(byScale.income * 0.55),
      wealth: U.clamp01(byScale.wealth * 0.045 + shopping * 0.02),
      trade: U.clamp01(byScale.trade * 0.5)
    };
  }

  /* What players spend at vendors in a week, read off the prices you
     put on things rather than off a slider. Every vendorable item is
     a price somebody pays; the only question is how often, and that
     is a function of how much of your catalogue is buyable at all. */
  var shopDrain = U.memoDesign(function (design) {
    var buyable = 0, spend = 0;
    (design.items || []).forEach(function (i) {
      if (!PN.items.isVendorable(i)) return;
      buyable++;
      spend += (i.vendorValue || 0);
    });
    if (!buyable) return 0;
    /* An average purchase, made about once a week by somebody who is
       shopping at all. The breadth of the catalogue decides how many
       of them are. */
    var avg = spend / buyable;
    return U.clamp01(U.saturate(avg, 90) * U.saturate(buyable, 26) * 0.55);
  });

  /* What is wrong with the currencies you wrote. */
  function issues(design) {
    var out = [];
    var list = currencies(design);
    if (!list.length) { out.push('No currency at all - nothing has a price'); return out; }
    var monies = list.filter(function (c) { return c.role === 'money'; });
    if (!monies.length) out.push('No currency is marked as money');
    if (monies.length > 1)
      out.push(monies.length + ' currencies are all marked as money - prices need one');

    var f = faucetOf(design);
    list.forEach(function (c) {
      var d = drainOf(design, c.id);
      var earns = (f[c.id] || 0) > 0;
      if (c.role === 'money' && !d.sinks.length)
        out.push(c.name + ' has no sinks - it can only pile up');
      if (c.role === 'token' && !earns)
        out.push(c.name + ' is a token nothing hands out');
      if (c.role === 'prestige' && d.sinks.length)
        out.push(c.name + ' is prestige, but has sinks draining it');
      if (c.role === 'premium' && earns)
        out.push(c.name + ' is premium, but the world gives it away');
    });
    return out;
  }

  PN.currency = {
    ROLES: ROLES, ROLE_BY_ID: ROLE_BY_ID,
    SINK_KINDS: SINK_KINDS, SINK_BY_ID: SINK_BY_ID,
    newSink: newSink, sinks: sinks, seedSinks: seedSinks,
    currencies: currencies, moneyOf: moneyOf, byId: byId,
    vendorToken: vendorToken, faucetOf: faucetOf, drainOf: drainOf,
    shopDrain: shopDrain,
    issues: issues
  };
})(PN);
