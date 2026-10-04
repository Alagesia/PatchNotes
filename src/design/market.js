/* Patch Notes - the player market.

   What an item is WORTH was a number you typed on it. Every valuation
   in the game read `vendorValue`, so a reagent you never got round to
   pricing was worth nothing, to everybody, for ever - which is why a
   bag of ore was clutter, why the crafting economy had no floor under
   it, and why the auction house could not tell a stack of copper from
   a best-in-slot weapon.

   A vendor price is a real thing, but it only covers items a vendor
   sells. Those are worth exactly what the vendor charges, because a
   shop with unlimited stock is a price ceiling and a price floor at
   once - nobody pays a player more than the vendor wants, and nobody
   sells to a player for less. Everything else is worth what somebody
   will pay for it, and that is supply and demand.

   SUPPLY is how much of it arrives in the world each week. Gathering
   density, how many loot tables it is in and how often those tables
   get rolled, every reward bundle that hands one over, and whether
   players can simply make more of it. A rare drop off one boss still
   contributes - it is just a small contribution.

   DEMAND is how much of it anybody actually wants. Reagents are wanted
   by whoever is levelling a profession and by every recipe that eats
   them; recipes are wanted for what they teach; consumables for what
   they do; gear for how close to best-in-slot it is. Cosmetics and
   mounts are wanted too, but by the part of your playerbase that
   collects things rather than by everybody.

   The price is the ratio, and the ratio is the whole point: an item
   nobody can get and everybody wants is expensive, and an item raining
   out of every chest is cheap however good it is.                   */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items, ST = PN.stats;

  /* Working out a price means asking what things are worth, and what
     things are worth now includes the market price - so a bag that
     opens a loot table full of flasks would ask the market what the
     flasks are worth, which would ask what the bag is worth, for ever.

     While the market is working out its own answer, everything it asks
     gets the INTRINSIC answer instead: the stats on the item, or the
     price you typed on it. The market is built on top of that, and
     nothing built on top of something may be an ingredient of it. */
  var computing = false;
  function busy() { return computing; }
  function settling(fn) {
    if (computing) return fn();
    computing = true;
    try { return fn(); } finally { computing = false; }
  }

  /* How much of everything arrives in the world in a week, per item.

     Measured in "units per thousand player-weeks" and then normalised,
     because the absolute number means nothing - what prices an item is
     how it compares to everything else on the same shelf. */
  var supplyOf = U.memoDesign(function (design) {
    var out = {};
    function add(id, n) {
      if (!id || !(n > 0)) return;
      out[id] = (out[id] || 0) + n;
    }

    /* Gathering. Density is a design dial, and a node nobody placed
       thickly is a node nobody finds. */
    var density = ((design.economy || {}).gatheringNodes === undefined
      ? 40 : design.economy.gatheringNodes) / 100;
    IT.gatherPool(design).forEach(function (it) {
      /* Spread across however many things share the ground. A world
         with forty reagents in it yields less of each than a world
         with four. */
      add(it.id, 24 * (0.25 + density * 1.6));
    });

    /* Loot tables. Every entry contributes its share of every roll,
       and how often a table is rolled at all depends on what it is
       attached to - a trash table turns over far more than a raid
       boss's. */
    var runs = tableRuns(design);
    (design.lootTables || []).forEach(function (t) {
      var entries = (t.entries || []);
      var totalW = U.sum(entries, function (e) { return e.weight || 1; }) || 1;
      var rolls = (t.rolls || 1) * (runs[t.id] || 1);
      entries.forEach(function (e) {
        var qty = ((e.qtyMin || 1) + (e.qtyMax || e.qtyMin || 1)) / 2;
        add(e.itemId, qty * ((e.weight || 1) / totalW) * rolls);
      });
      (t.guaranteed || []).forEach(function (g) {
        var q = ((g.qtyMin || 1) + (g.qtyMax || g.qtyMin || 1)) / 2;
        add(g.itemId, q * rolls);
      });
    });

    /* Reward bundles. A quest hands one over every time somebody does
       it, and a repeatable quest hands one over for ever. */
    var repeat = rewardRepeats(design);
    (design.rewards || []).forEach(function (r) {
      var mult = repeat[r.id] || 1;
      (r.items || []).forEach(function (e) {
        add(e.itemId, (e.qty || 1) * (e.chance === undefined ? 1 : e.chance) * 6 * mult);
      });
    });

    /* Crafting. Anything players can make has an elastic supply: if
       the price goes up somebody makes more, which is exactly what
       stops a craftable being worth a fortune. */
    PN.crafting.recipes(design).forEach(function (r) {
      add(r.outputId, (r.outputQty || 1) * 10);
    });

    return out;
  });

  /* How often each loot table actually gets opened, relative to each
     other. A dungeon on a weekly lockout turns over less than its own
     trash; a container players open whenever they like turns over most
     of all. */
  function tableRuns(design) {
    var runs = {};
    function set(id, n) { if (id) runs[id] = Math.max(runs[id] || 0, n); }
    (design.dungeons || []).forEach(function (dg) {
      var lock = dg.lockout === 'none' ? 6 : dg.lockout === 'daily' ? 4 : 1.4;
      var raid = dg.kind === 'raid' ? 0.5 : 1;
      PN.schema.bossesIn(design, dg).forEach(function (b) {
        set(b.lootTableId, lock * raid);
      });
      set(dg.trashLootTableId, lock * raid * 5);
    });
    /* Anything not attached to an instance - container bags, event
       tables - is opened at will. */
    (design.lootTables || []).forEach(function (t) { if (!runs[t.id]) runs[t.id] = 3; });
    return runs;
  }

  /* A reward handed out by a repeatable quest arrives over and over. */
  function rewardRepeats(design) {
    var out = {};
    (design.quests || []).forEach(function (q) {
      if (!q.rewardId) return;
      var n = q.repeatable && q.repeatable !== 'none' ? 8 : 1;
      out[q.rewardId] = Math.max(out[q.rewardId] || 0, n);
    });
    return out;
  }

  /* What eats each material, and how good what it makes is. A reagent
     with three recipes behind it is wanted three times over. */
  var craftDemand = U.memoDesign(function (design) {
    var out = {};
    PN.crafting.recipes(design).forEach(function (r) {
      var made = IT.itemById(design, r.outputId);
      /* A recipe that makes something nobody wants does not make its
         inputs valuable either. */
      var pull = made ? U.clamp01(IT.intrinsicDesire(design, made) / 70) : 0.15;
      (r.inputs || []).forEach(function (i) {
        out[i.itemId] = (out[i.itemId] || 0) + (i.qty || 1) * (0.35 + pull);
      });
    });
    return out;
  });

  /* How much of your playerbase collects things for their own sake.
     Cosmetics and mounts are worth a great deal to them and nothing at
     all to everybody else, which is a different shape of demand from a
     reagent and has to be priced as one. */
  function collectorShare(design) {
    var mix = PN.tax.marketMix(PN.tax.eraForYear((design.meta || {}).startYear || 2004));
    return U.clamp01((mix.completionist || 0) + (mix.collector || 0) +
                     (mix.roleplayer || 0) * 0.6 + (mix.socialite || 0) * 0.3 +
                     (mix.explorer || 0) * 0.3);
  }

  /* How much anybody wants one, 0 upward. Unlike supply this is not a
     rate - it is how badly the thing is wanted when it is on the
     shelf. */
  var demandOf = U.memoDesign(function (design) {
    return settling(function () { return demandInner(design); });
  });

  function demandInner(design) {
    var out = {};
    var eats = craftDemand(design);
    var collectors = collectorShare(design);
    var topIlvl = 1;
    (design.items || []).forEach(function (i) {
      if (i.kind === 'gear') topIlvl = Math.max(topIlvl, i.itemLevel || 0);
    });

    (design.items || []).forEach(function (it) {
      var d = 0;
      switch (it.kind) {
        case 'gear':
          /* Gear is wanted in proportion to how close it is to the
             best there is. An item level behind the curve is wanted by
             nobody, which is what makes last tier's raid gear
             worthless the week a new tier lands. */
          var near = U.clamp01((it.itemLevel || 0) / Math.max(1, topIlvl));
          d = Math.pow(near, 2.4) * 100;
          break;
        case 'material':
          /* Wanted by what it makes, and by anyone still levelling the
             profession that uses it. A reagent is a means to an end,
             so it tops out well below the thing it is used to make -
             otherwise the ore is worth the sword. */
          d = U.clamp(eats[it.id] || 0, 0, 6) * 7.5;
          break;
        case 'recipe':
          /* Worth what it teaches. */
          var taught = null;
          PN.crafting.recipes(design).forEach(function (r) {
            if (r.recipeItemId === it.id) taught = r; });
          var made = taught ? IT.itemById(design, taught.outputId) : null;
          d = made ? U.clamp(IT.intrinsicDesire(design, made) * 0.5, 0, 55) : 10;
          break;
        case 'consumable':
          /* What it actually does. A flask that buffs the stat half
             your playerbase gears around is wanted before every pull;
             a potion with nothing filled in is wanted by nobody. */
          d = consumableDemand(design, it);
          break;
        case 'cosmetic':
        case 'mount':
          /* Wanted intensely, by a slice of the population - which is
             what keeps a mount from being priced like a weapon
             everybody needs. */
          d = 62 * (0.25 + collectors * 1.25);
          break;
        case 'container':
          /* Room to put things in. Wanted by everybody, and wanted
             most when there is little of it about - a game whose
             bags are small has a bag market, and a game handing out
             forty slots does not. */
          d = U.clamp(U.saturate(it.slots || 0, 9) * 70, 0, 75);
          break;
        case 'currency':
          d = 45;
          break;
        default:
          d = 4;                                    /* quest items */
      }
      /* Rarity is a promise about how good something is, and players
         read it as one. */
      var rar = ST.RARITY_BY_ID[it.rarity] || ST.RARITY_BY_ID.common;
      out[it.id] = U.clamp(d * (0.7 + rar.mult * 0.4), 0, 120);
    });
    return out;
  }

  /* A consumable is wanted for what it does, priced on the same scale
     as everything else on the shelf. */
  /* Read straight off the effects rather than asking the agent layer
     what it makes of them. The agents' own reading is market-aware -
     a bag is worth what is in it at today's prices - and asking it
     here would make the market an ingredient of itself. */
  function consumableDemand(design, it) {
    var universal = 0, stat = 0, resource = 0, bag = 0, xp = 0;
    (it.effects || []).forEach(function (e) {
      if (e.type === 'restoreHealth') universal += U.saturate(e.amount || 0, 400);
      else if (e.type === 'removeDebuff') universal += 0.5;
      else if (e.type === 'teleport') universal += 0.3;
      else if (e.type === 'buffPower') universal += U.saturate(e.amount || 0, 60) * 1.3;
      else if (e.type === 'restoreResource') resource += U.saturate(e.amount || 0, 400) * 0.9;
      else if (e.type === 'grantXp') xp += e.amount || 0;
      else if (e.type === 'buffStat' && e.stat) {
        stat = Math.max(stat, U.saturate(e.amount || 0, 60) * 1.4);
      } else if (e.type === 'openLoot') {
        var t = IT.lootById(design, e.lootTableId);
        if (t) bag += IT.lootValue(design, t, 1);
      }
    });
    return U.clamp(
      (U.clamp01(universal) * 55) +          /* everybody drinks it */
      (U.clamp01(stat) * 46) +               /* the right build does */
      (U.clamp01(resource) * 30) +
      (U.clamp01(bag / 90) * 85) +           /* a bag is worth its table */
      (xp > 0 ? 26 : 0), 0, 130);
  }

  /* What one is worth.

     A vendor-sold item is worth what the vendor charges and nothing
     else: with unlimited stock on the shelf, no player pays more and
     no player accepts less. Everything else is priced off the ratio
     of how badly it is wanted to how much of it there is. */
  var priceTable = U.memoDesign(function (design) {
    return settling(function () { return priceInner(design); });
  });

  function priceInner(design) {
    var sup = supplyOf(design), dem = demandOf(design);
    /* The typical item's supply, so scarcity means "scarce compared to
       everything else here" rather than compared to a constant. */
    var rates = [];
    (design.items || []).forEach(function (i) {
      if (i.kind === 'currency') return;
      rates.push(sup[i.id] || 0);
    });
    rates.sort(function (a, b) { return a - b; });
    var typical = rates.length ? Math.max(0.6, rates[Math.floor(rates.length / 2)]) : 1;

    var out = {};
    (design.items || []).forEach(function (it) {
      var demand = dem[it.id] || 0;
      var supply = sup[it.id] || 0;
      if (IT.isVendorable(it)) {
        out[it.id] = { price: it.vendorValue || 0, demand: demand, supply: supply,
                       scarcity: 0, vendorLocked: true,
                       why: 'A vendor sells it, so the shelf price is the price.' };
        return;
      }
      /* Scarcity: 1 when nothing produces it, falling away as supply
         rises past what a typical item gets. Nothing reaches zero -
         even a common reagent is worth the trouble of not gathering
         it yourself. */
      var scarcity = 1 / (1 + (supply / typical));
      /* An item literally nothing hands out cannot be traded at all,
         so it has no market price however wanted it is. */
      if (supply <= 0 && !IT.isTradeable(design, it)) scarcity = 0;
      /* Scarcity moves the price around what it is wanted for rather
         than multiplying it: an item of ordinary rarity trades at
         roughly what it is worth, a hoarded one at a premium, and one
         pouring out of every chest at a fraction. */
      var price = demand * (0.25 + scarcity * 1.05);
      out[it.id] = {
        price: Math.round(price * 10) / 10,
        demand: demand, supply: supply,
        scarcity: U.round(scarcity, 3),
        vendorLocked: false,
        why: describe(demand, supply, scarcity, typical)
      };
    });
    return out;
  }

  function describe(demand, supply, scarcity, typical) {
    var want = demand > 70 ? 'Everybody wants one'
             : demand > 35 ? 'Steady demand'
             : demand > 12 ? 'Some demand'
             : 'Hardly anybody wants one';
    var have = supply <= 0 ? 'and nothing in the game produces one'
             : supply < typical * 0.4 ? 'and very little of it arrives'
             : supply < typical * 1.5 ? 'and it arrives at the usual rate'
             : 'and it pours out of everything';
    return want + ' ' + have + '.';
  }

  function priceOf(design, item) {
    if (!item) return { price: 0, demand: 0, supply: 0, scarcity: 0,
                        vendorLocked: false, why: '' };
    return priceTable(design)[item.id] ||
      { price: 0, demand: 0, supply: 0, scarcity: 0, vendorLocked: false, why: '' };
  }

  /* What an item is worth on the auction house specifically: nothing,
     if it cannot change hands. */
  function marketValue(design, item) {
    if (!item) return 0;
    var p = priceOf(design, item);
    if (p.vendorLocked) return p.price;
    return IT.isTradeable(design, item) ? p.price : 0;
  }

  /* The shelf, most valuable first, for the screen that shows it. */
  function listing(design, limit) {
    var rows = [];
    (design.items || []).forEach(function (it) {
      if (it.kind === 'currency') return;
      var p = priceOf(design, it);
      if (!IT.isTradeable(design, it) && !p.vendorLocked) return;
      rows.push({ item: it, price: p.price, demand: p.demand, supply: p.supply,
                  scarcity: p.scarcity, vendorLocked: p.vendorLocked, why: p.why });
    });
    rows.sort(function (a, b) { return b.price - a.price; });
    return limit ? rows.slice(0, limit) : rows;
  }

  /* How much of a market there is to tax, 0 to 1. A shelf of things
     nobody wants generates no volume however many of them there are. */
  var tradeDepth = U.memoDesign(function (design) {
    var rows = listing(design).filter(function (r) { return !r.vendorLocked; });
    if (!rows.length) return 0;
    var worth = U.sum(rows, function (r) { return r.price; });
    /* Both halves matter: a deep catalogue of cheap goods and a thin
       one of expensive goods are both thin markets. */
    return U.clamp01(U.saturate(worth, 900) * U.saturate(rows.length, 22));
  });

  /* What is wrong with the market you wrote. */
  function issues(design) {
    var out = [];
    var rows = listing(design);
    if (!rows.length) {
      out.push('Nothing in your game can change hands - there is no market');
      return out;
    }
    var free = rows.filter(function (r) { return !r.vendorLocked; });
    var worthless = free.filter(function (r) { return r.price < 1; });
    if (worthless.length > free.length * 0.6 && free.length > 6) {
      out.push(Math.round(worthless.length / free.length * 100) +
               '% of what players can trade is worth nothing - supply far outruns demand');
    }
    var flooded = free.filter(function (r) { return r.scarcity < 0.12; });
    if (flooded.length > 3) {
      out.push(flooded.length + ' tradeable items pour out of too many sources at once');
    }
    var unreachable = rows.filter(function (r) { return r.supply <= 0 && !r.vendorLocked; });
    if (unreachable.length) {
      out.push(unreachable.length + ' tradeable item' +
        (unreachable.length === 1 ? '' : 's') + ' nothing in the game produces');
    }
    /* A reagent no recipe eats is worth nothing however much of it
       there is, and no amount of gathering density will change that.
       This is the most common thing wrong with a crafting economy and
       the hardest to see, because the item looks fine on its own. */
    var eats = craftDemand(design);
    var idle = (design.items || []).filter(function (i) {
      return i.kind === 'material' && !(eats[i.id] > 0);
    });
    if (idle.length) {
      out.push(idle.length + ' reagent' + (idle.length === 1 ? '' : 's') +
        ' no recipe uses: ' + idle.slice(0, 4).map(function (i) { return i.name; }).join(', ') +
        (idle.length > 4 ? ' and ' + (idle.length - 4) + ' more' : ''));
    }
    return out;
  }

  PN.market = {
    supplyOf: supplyOf, demandOf: demandOf, priceOf: priceOf,
    marketValue: marketValue, listing: listing, issues: issues, busy: busy,
    tradeDepth: tradeDepth,
    collectorShare: collectorShare
  };
})(PN);
