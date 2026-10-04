/* Patch Notes - items, loot tables and reward bundles.
   Real objects. A quest reward, a boss drop and a battle pass tier all
   hand out the same item records, and simulated players keep them.      */
(function (PN) {
  'use strict';
  var U = PN.util, ST = PN.stats;

  var ITEM_KINDS = [
    { id: 'gear',       name: 'Gear',        stack: 1,      desc: 'Equippable. Carries stats and an item level.' },
    { id: 'currency',   name: 'Currency',    stack: 999999, desc: 'Gold, tokens, marks. Gates vendors and upgrades.' },
    { id: 'consumable', name: 'Consumable',  stack: 200,    desc: 'Potions, food, scrolls. Used up on use.' },
    { id: 'material',   name: 'Material',    stack: 1000,   desc: 'Crafting reagents. The economy runs on these.' },
    { id: 'recipe',     name: 'Recipe',      stack: 1,      desc: 'Teaches a crafted item.' },
    { id: 'scroll',     name: 'Scroll',      stack: 100,
      desc: 'A permanent stat bonus applied to a piece of gear. What an enchanter actually makes.' },
    { id: 'cosmetic',   name: 'Cosmetic',    stack: 1,      desc: 'Appearance only. The safest thing you can sell.' },
    { id: 'mount',      name: 'Mount / Pet', stack: 1,      desc: 'Status symbol. Collectors will grind for years.' },
    { id: 'questItem',  name: 'Quest Item',  stack: 20,     desc: 'Only meaningful inside a questline.' },
    { id: 'container',  name: 'Bag',         stack: 50,
      desc: 'Carrying space. How many of a player’s inventory slots they have is the sum of the bags they own.' }
  ];
  var KIND_BY_ID = {};
  ITEM_KINDS.forEach(function (k) { KIND_BY_ID[k.id] = k; });

  var BIND_TYPES = [
    { id: 'none',    name: 'Not bound',      tradeable: true,  desc: 'Freely tradeable. Feeds the economy and the gold sellers.' },
    { id: 'equip',   name: 'Bind on equip',  tradeable: true,  desc: 'Tradeable until worn. The auction house favourite.' },
    { id: 'pickup',  name: 'Bind on pickup', tradeable: false, desc: 'Yours the moment it drops. Kills trade drama, kills trade.' },
    { id: 'account', name: 'Account bound',  tradeable: false, desc: 'Shareable between your own characters. Alt-friendly.' }
  ];

  /* What a consumable can do. Same vocabulary the ability system uses. */
  /* What a consumable can do, and what each one needs filling in. The
     params are read by the editor - an effect that declares a stat
     gets a stat picker - and by the simulation, which is why an
     unfilled one does nothing. */
  var CONSUMABLE_EFFECTS = [
    { id: 'restoreHealth',   name: 'Restore Health',   params: ['amount'],
      defaults: { amount: 400 },
      desc: 'Heals for a flat amount. Worth the same to everybody.' },
    { id: 'restoreResource', name: 'Restore Resource', params: ['amount'],
      defaults: { amount: 300 },
      desc: 'Only worth anything to a kit that actually spends a resource.' },
    { id: 'buffStat',        name: 'Buff Stat',        params: ['stat', 'amount', 'duration'],
      defaults: { amount: 40, duration: 3600 },
      desc: 'Raises one stat. Players only drink it if it is the stat they gear around.' },
    { id: 'buffPower',       name: 'Buff Power',       params: ['amount', 'duration'],
      defaults: { amount: 30, duration: 1800 },
      desc: 'Raises damage and healing directly, whatever the build.' },
    { id: 'removeDebuff',    name: 'Remove Debuff',    params: ['count'],
      defaults: { count: 1 },
      desc: 'Clears what is on you. Worth more the more your bosses apply.' },
    { id: 'teleport',        name: 'Teleport',         params: [],
      desc: 'Somewhere else, immediately. A convenience, and a travel sink you do not get to charge for.' },
    { id: 'grantXp',         name: 'Grant Experience', params: ['amount'],
      defaults: { amount: 2000 },
      desc: 'Levels somebody up faster. Worth nothing at the cap.' },
    { id: 'openLoot',        name: 'Open Loot Table',  params: ['lootTableId'],
      desc: 'Opens one of your loot tables. A container in a bottle.' }
  ];

  /* ------------------------------------------------------------ items */

  function newItem(opts) {
    opts = opts || {};
    var kind = opts.kind || 'gear';
    return {
      id: opts.id || U.id('itm'),
      name: opts.name || 'New Item',
      kind: kind,
      slot: opts.slot || (kind === 'gear' ? 'chest' : null),
      rarity: opts.rarity || 'common',
      itemLevel: opts.itemLevel === undefined ? 1 : opts.itemLevel,
      stats: opts.stats || {},
      effects: opts.effects || [],
      stackMax: opts.stackMax || (KIND_BY_ID[kind] ? KIND_BY_ID[kind].stack : 1),
      bind: opts.bind || (kind === 'gear' ? 'pickup' : 'none'),
      /* Where players can get this, beyond wherever you placed it.
         An empty object means only where you placed it. */
      sources: opts.sources || (kind === 'gear' ? { vendor: true }
               : kind === 'material' ? { gather: true } : {}),
      vendorValue: opts.vendorValue === undefined ? 0 : opts.vendorValue,
      lootTableId: opts.lootTableId || null,
      /* Bags. How much carrying space one gives, and how many of them
         a single player is allowed to own - which is the dial that
         makes bag space something to chase rather than something you
         solve once and forget. */
      slots: opts.slots === undefined ? (kind === 'container' ? 8 : 0) : opts.slots,
      maxCarried: opts.maxCarried === undefined
        ? (kind === 'container' ? 4 : 0) : opts.maxCarried,
      /* Which slots a scroll may be applied to. Scrolls only. */
      scrollScope: opts.scrollScope || (kind === 'scroll' ? 'any' : null),
      flavour: opts.flavour || '',
      tags: opts.tags || []
    };
  }
  var topItemLevel = U.memoDesign(function (design) {
    var top = 1;
    (design.items || []).forEach(function (i) {
      if (i.kind === 'gear' && (i.itemLevel || 0) > top) top = i.itemLevel;
    });
    return top;
  });

  function itemById(design, id) { return U.byId(design.items || [], id); }

  /* What a player gets for handing one over.

     A vendor that STOCKS an item has a price on the counter, and that
     is the price. A vendor that does not still buys junk off you, and
     what it pays for junk is a fraction of what the thing is worth to
     other players - which is the market's answer, not a number typed
     on an item nobody sells. */
  function sellValue(design, item) {
    if (!item) return 0;
    if (isVendorable(item)) return item.vendorValue || 0;
    return PN.market ? PN.market.priceOf(design, item).price : 0;
  }
  var BIND_BY_ID = U.byIdMap ? U.byIdMap(BIND_TYPES) : (function () {
    var o = {}; BIND_TYPES.forEach(function (b) { o[b.id] = b; }); return o;
  })();

  /* ---------------------------------------------------- how you get it --

     Where an item comes from used to be nowhere and everywhere at once.
     Two paths handed players things you never placed:

       - the currency vendor sold EVERY piece of gear in the design,
         whether or not you had put it on a vendor, in a loot table, or
         anywhere else;
       - gathering picked a random material out of the whole catalogue,
         so a reagent you wrote for one recipe turned up in bags all over
         the world.

     Vendor value had nothing to do with either, which is why an item
     priced at zero still appeared. Now availability is a decision you
     make per item, and an item you have not placed anywhere is a problem
     the game reports rather than a thing that quietly exists. */

  var SOURCES = [
    { id: 'drop',   name: 'Found',      desc: 'Only from the loot tables and rewards you put it in.' },
    { id: 'vendor', name: 'Sold',       desc: 'A vendor will sell it for currency, as well as wherever you placed it.' },
    { id: 'gather', name: 'Gathered',   desc: 'Players pick it up out in the world. Materials only.' }
  ];

  function sourcesOf(item) {
    if (!item) return {};
    /* Older saves have no sources. Read the old behaviour off the item
       so nothing silently disappears from a live game: gear was on the
       vendor and materials were gatherable, because that is what the
       code did. */
    if (!item.sources) {
      return { vendor: item.kind === 'gear',
               gather: item.kind === 'material' };
    }
    return item.sources;
  }
  function isVendorable(item) { return !!sourcesOf(item).vendor; }
  function isGatherable(item) {
    return item.kind === 'material' && !!sourcesOf(item).gather;
  }

  /* Everything a vendor will sell. */
  function vendorStock(design) {
    return (design.items || []).filter(function (i) {
      return i.kind === 'gear' && i.slot && isVendorable(i);
    });
  }
  /* Everything that can be picked up out in the world. */
  function gatherPool(design) {
    return (design.items || []).filter(isGatherable);
  }

  /* Is this item reachable at all? An item nothing gives out is content
     you paid to make and nobody will ever see. */
  function placements(design, item) {
    var out = [];
    if (isVendorable(item)) out.push('sold by a vendor');
    if (isGatherable(item)) out.push('gathered');
    var inTable = (design.lootTables || []).some(function (t) {
      return (t.entries || []).some(function (e) { return e.itemId === item.id; }) ||
             (t.guaranteed || []).some(function (g) { return g.itemId === item.id; });
    });
    if (inTable) out.push('dropped');
    var inReward = (design.rewards || []).some(function (r) {
      return (r.items || []).some(function (e) { return e.itemId === item.id; });
    });
    if (inReward) out.push('a quest or reward');
    var crafted = PN.crafting.recipes(design).some(function (r) {
      return r.outputId === item.id;
    });
    if (crafted) out.push('crafted');
    return out;
  }
  function isOrphan(design, item) {
    if (item.kind === 'currency') return false;
    return placements(design, item).length === 0;
  }
  /* Can this item change hands? Binding is authored per item, and it is
     what decides whether an item is economy content or just loot. The
     design used to carry a bindOnPickup slider claiming the same thing
     from the other direction, and nothing read it. */
  function isTradeable(design, item) {
    if (!item) return false;
    if (design && design.economy && !design.economy.tradingEnabled) return false;
    if (design && design.gearing && design.gearing.tradeable === false &&
        item.kind === 'gear') return false;
    var b = BIND_BY_ID[item.bind || 'none'];
    return b ? b.tradeable : true;
  }

  /* What share of the catalogue can reach the auction house at all. */
  var tradeableShare = U.memoDesign(function (design) {
    var list = (design.items || []).filter(function (i) { return i.kind !== 'currency'; });
    if (!list.length) return 1;
    var n = 0;
    list.forEach(function (i) { if (isTradeable(design, i)) n++; });
    return n / list.length;
  });

  /* How much a player wants this item.

     Gear is priced off the stat budget it spends, which is authored. So is
     everything else now: a material is worth what you priced it at, at the
     tier you put it on. It used to be a flat 12 for every material and
     every consumable in the game no matter what you set, which made the
     vendor value and the tier decorative and made crafting maths lie. */
  function tierFactor(design, item) {
    /* Item level on a non-gear item is its TIER: tier-one ore against
       tier-five ore. Relative to the gear ladder, so it scales with the
       game rather than with an absolute number. */
    var top = topItemLevel(design);
    var lv = Math.max(0, item.itemLevel || 0);
    return 0.55 + U.clamp01(lv / Math.max(1, top)) * 1.15;
  }

  /* What an item is worth on its own terms: the stats on it, or the
     price you put on it. This is the half of "desire" that does not
     depend on anybody else, which is exactly why the market is built
     on top of it rather than tangled into it - the market needs an
     answer to "how badly is this wanted" that does not already contain
     the market's own answer. */
  function intrinsicDesire(design, item, depth) {
    if (!item) return 0;
    var rarity = ST.RARITY_BY_ID[item.rarity] || ST.RARITY_BY_ID.common;
    var base = 0;
    if (item.kind === 'gear') {
      base = U.saturate(ST.budgetUsed(design, item), 220) * 70;
    } else {
      /* What you priced it at, at the tier you gave it.

         Only if a vendor actually sells it. A price on an item no shop
         stocks is a number with nothing behind it - there is no counter
         anybody can walk up to and pay it - so it does not set the
         item's worth. What that item is worth is what another player
         will pay, which is the market's answer. */
      base = isVendorable(item)
        ? U.saturate(item.vendorValue || 0, 55) * 60 * tierFactor(design, item)
        : 0;
      if (item.kind === 'currency') {
        /* A currency is worth what it buys, and that is the whole economy
           rather than a shelf price. */
        base = Math.max(base, 14);
      } else if (item.kind === 'container') {
        /* A bag is worth the room it gives you, measured against the
           room players already have. Nothing else in a player's bags
           is worth anything if there is nowhere to put it, which is
           why the first bag is the best item in the game and the fifth
           is a rounding error - and why the same bag is worth far more
           in a game that starts you with nothing than in one that
           hands you forty slots on your first quest.

           Priced flat, a bag was always worth less than the leather it
           took, so every bag recipe in the game read as a dead end and
           nothing that priced against the economy - the auction house,
           what a crafter bothers to make - ever valued one. */
        var pack = Math.max(0, (design.gearing || {}).backpackSlots || 0);
        var scarce = 1 + 22 / (12 + pack);
        base = Math.max(base, U.saturate(item.slots || 0, 10) * 62 * scarce * 0.62);
      } else if (item.kind === 'recipe' && (depth || 0) < 2) {
        /* A recipe page is worth what it teaches you to make. */
        var taught = null;
        (design.recipes || []).forEach(function (r) {
          if (r.recipeItemId === item.id) taught = r;
        });
        if (taught) {
          var out = itemById(design, taught.outputId);
          if (out) base = Math.max(base, intrinsicDesire(design, out, (depth || 0) + 1) * 0.7);
        }
      }
    }
    return U.clamp100(base * (0.6 + rarity.mult * 0.55));
  }

  /* What an item is worth to a player, which is the higher of what it
     is worth on its own terms and what somebody will pay for it.

     A reagent you never got round to pricing used to be worth exactly
     nothing - to the crafting economy, to the auction house, and to
     anybody holding a bag of them. It is worth what it is worth on the
     market, and the market is supply against demand rather than a
     number you typed. A vendor-sold item keeps its shelf price,
     because a shop with unlimited stock is a ceiling and a floor at
     once. */
  function itemDesire(design, item, depth) {
    var own = intrinsicDesire(design, item, depth);
    if (!item || !PN.market) return own;
    /* While the market is settling its own prices it must be told what
       things are worth on their own terms, or pricing a bag of flasks
       would ask what the flasks are worth, which asks what the bag is
       worth, for ever. */
    if (PN.market.busy()) return own;
    /* Gear is priced by its stats; the market does not get to tell you
       a chestpiece is better than it is. */
    if (item.kind === 'gear' || item.kind === 'currency') return own;
    if (isVendorable(item)) return own;
    var p = PN.market.priceOf(design, item);
    return U.clamp100(Math.max(own, p.price || 0));
  }

  /* Which need axis this item feeds. Rewards are how design reaches
     players, so every item has to land on the satisfaction model.      */
  function itemAxis(item) {
    if (!item) return 'progression';
    if (item.kind === 'cosmetic' || item.kind === 'mount') return 'identity';
    if (item.kind === 'gear') return 'progression';
    if (item.kind === 'currency' || item.kind === 'material') return 'progression';
    if (item.kind === 'container') return 'novelty';
    return 'progression';
  }

  /* ------------------------------------------------------ loot tables */

  function newLootTable(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('loot'),
      name: opts.name || 'New Loot Table',
      rolls: opts.rolls === undefined ? 1 : opts.rolls,   /* draws per open   */
      /* The chance a draw yields anything at all. Without this every roll
         always produced an item, so a boss with one roll handed every
         player a drop on every kill and the world filled up with gear. */
      dropChance: opts.dropChance === undefined ? 100 : opts.dropChance,
      entries: opts.entries || [],  /* {itemId, weight, qtyMin, qtyMax}       */
      guaranteed: opts.guaranteed || [], /* {itemId, qtyMin, qtyMax}          */
      badLuckProtection: opts.badLuckProtection === undefined ? 0 : opts.badLuckProtection
    };
  }

  function lootById(design, id) { return U.byId(design.lootTables || [], id); }

  /* ------------------------------------------------------------ loot mode

     Who a drop belongs to. Personal loot means every player rolls their
     own table; every other mode means the table drops once for the group
     and one person gets it, so an individual's share is a fraction of it.
     This setting existed in the designer and did nothing at all until
     now, which is why players ended up with far more gear than the tables
     said they should.                                                   */
  function lootShare(design, groupSize) {
    var mode = (design.gearing || {}).lootMode || 'personal';
    var n = Math.max(1, groupSize || 1);
    if (mode === 'personal') return 1;
    /* Need before greed puts drops in usable hands slightly more often,
       master looter concentrates them without changing the total. */
    var bias = mode === 'needGreed' ? 1.15 : 1;
    return Math.min(1, bias / n);
  }

  /* Expected items from one open, for the designer to read. */
  function expectedDrops(design, table, groupSize) {
    if (!table) return 0;
    var share = lootShare(design, groupSize);
    var per = (table.entries || []).length
      ? (table.rolls || 1) * U.clamp01((table.dropChance === undefined ? 100 : table.dropChance) / 100)
      : 0;
    return (table.guaranteed || []).length * share + per * share;
  }

  /* Actually roll it. Used by the per-player simulation.
     opts.share scales how much of the table this one player receives. */
  function rollLoot(design, table, rng, pity, opts) {
    var out = [];
    if (!table) return out;
    opts = opts || {};
    var share = opts.share === undefined ? 1 : opts.share;
    (table.guaranteed || []).forEach(function (g) {
      if (share < 1 && !rng.chance(share)) return;
      var qty = g.qtyMin === g.qtyMax ? g.qtyMin : rng.int(g.qtyMin, g.qtyMax);
      if (qty > 0) out.push({ itemId: g.itemId, qty: qty });
    });
    var entries = table.entries || [];
    if (!entries.length) return out;
    var rolls = table.rolls || 1;
    var chance = U.clamp01((table.dropChance === undefined ? 100 : table.dropChance) / 100) * share;
    for (var r = 0; r < rolls; r++) {
      /* Most opens of most tables give you nothing, which is what makes
         the ones that do give you something worth opening. */
      if (chance < 1 && !rng.chance(chance)) continue;
      /* Personal loot is smart loot, which is what the phrase has meant
         in this genre since it was invented: the game picks from the
         table with your character in mind. A gear entry carrying the
         stat this player scales with is likelier to be the one that
         drops. Every other loot mode rolls the table straight, because
         under group loot the drop belongs to the boss, not to you.

         opts.prefer carries the stat; nothing else about the player
         reaches down here. */
      var pool = entries;
      if (opts.prefer && (design.gearing || {}).lootMode === 'personal') {
        var mine = opts.prefer;
        var prims = (ST.statSetOf(design).primaries || []);
        pool = entries.map(function (e) {
          var it = itemById(design, e.itemId);
          var w = e.weight || 1;
          if (it && it.kind === 'gear') {
            var stats = it.stats || {};
            if (stats[mine] > 0) w *= 3;
            else if (prims.some(function (p) { return p.id !== mine && stats[p.id] > 0; })) w *= 0.4;
          }
          return { e: e, w: w };
        });
      }
      /* Bad-luck protection nudges towards the rarest entry over time. */
      var boost = U.clamp01((pity || 0) * (table.badLuckProtection || 0) / 100 / 40);
      var pick;
      if (boost > 0 && rng.chance(boost)) {
        pick = entries.slice().sort(function (a, b) { return (a.weight || 1) - (b.weight || 1); })[0];
      } else if (pool === entries) {
        pick = rng.weighted(entries, function (e) { return e.weight || 1; });
      } else {
        var chosen = rng.weighted(pool, function (x) { return x.w; });
        pick = chosen ? chosen.e : null;
      }
      var q = pick.qtyMin === pick.qtyMax ? pick.qtyMin : rng.int(pick.qtyMin || 1, pick.qtyMax || 1);
      if (q > 0) out.push({ itemId: pick.itemId, qty: q });
    }
    return out;
  }

  /* Expected value of one open, in desire points. Drives how good a
     dungeon or boss actually feels to run.                             */
  function lootValue(design, table, depth) {
    if (!table) return 0;
    var v = 0;
    (table.guaranteed || []).forEach(function (g) {
      var it = itemById(design, g.itemId);
      v += itemDesire(design, it, depth) * ((g.qtyMin + g.qtyMax) / 2 > 1 ? 1.15 : 1);
    });
    var wTotal = U.sum(table.entries || [], function (e) { return e.weight || 1; });
    if (wTotal > 0) {
      (table.entries || []).forEach(function (e) {
        var it = itemById(design, e.itemId);
        v += itemDesire(design, it, depth) * ((e.weight || 1) / wTotal) * (table.rolls || 1) *
             U.clamp01((table.dropChance === undefined ? 100 : table.dropChance) / 100);
      });
    }
    return v;
  }

  /* --------------------------------------------------- reward bundles */

  /* What a quest, a boss, a chain stage or a pass tier actually hands
     over. One shared shape so every reward in the game is the same
     kind of object.                                                    */
  function newReward(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('rwd'),
      name: opts.name || 'New Reward',
      xp: opts.xp === undefined ? 0 : opts.xp,
      items: opts.items || [],        /* {itemId, qty, chance 0-1}            */
      currencies: opts.currencies || {},  /* {itemId(currency): amount}       */
      reputation: opts.reputation || 0,
      lootTableId: opts.lootTableId || null,
      unlocks: opts.unlocks || []     /* free-text system unlocks             */
    };
  }

  function rewardById(design, id) { return U.byId(design.rewards || [], id); }

  /* Total desire value of a reward bundle. */
  /* The level a reward bundle is FOR: the middle of the content that
     hands it out, or the middle of the curve if nothing does yet. A
     thousand experience is a fortune at level three and a rounding
     error at fifty, so nothing about experience can be priced without
     knowing which of those this is. */
  function rewardLevel(design, reward) {
    var cap = (design.progression || {}).levelCap || 60;
    var levels = [];
    (design.quests || []).forEach(function (q) {
      if (q.rewardId === reward.id) levels.push(q.level || 1); });
    (design.dungeons || []).forEach(function (dg) {
      if (dg.completionRewardId === reward.id) levels.push(dg.levelReq || cap); });
    (design.bosses || []).forEach(function (b) {
      if (b.firstKillRewardId !== reward.id) return;
      var dg = U.byId(design.dungeons || [], b.dungeonId);
      levels.push(dg ? (dg.levelReq || cap) : cap);
    });
    levels.sort(function (a, b) { return a - b; });
    var lv = levels.length ? levels[Math.floor(levels.length / 2)] : Math.round(cap / 2);
    return U.clamp(Math.round(lv), 1, Math.max(1, cap - 1));
  }

  /* What experience is worth, in the only unit it HAS a worth in.

     This used to be a flat multiplier - experience times 0.012 - with
     no ceiling and no reference to the levelling curve, so ten thousand
     experience scored a hundred and twenty whether that was eight
     levels or a tenth of one. It scored higher than a raid bundle with
     eight pieces of best-in-slot in it, and a designer reading the
     number would have concluded the raid was the worse reward.

     A level of progress is the unit. A full level is worth roughly
     half a guaranteed best-in-slot drop, and it saturates, because
     four levels handed over at once is not forty. */
  function xpDesire(design, xp, level) {
    if (!xp || xp <= 0) return 0;
    if (!PN.agents || !PN.agents.xpForLevel) return 0;
    var perLevel = PN.agents.xpForLevel(design, level);
    if (!(perLevel > 0)) return 0;
    return U.clamp(xp / perLevel, 0, 4) * 26;
  }

  function rewardValue(design, reward) {
    if (!reward) return 0;
    var v = xpDesire(design, reward.xp, rewardLevel(design, reward)) +
            reward.reputation * 0.05 + (reward.unlocks || []).length * 18;
    (reward.items || []).forEach(function (r) {
      var it = itemById(design, r.itemId);
      v += itemDesire(design, it) * (r.chance === undefined ? 1 : r.chance) *
           (r.qty > 1 ? 1 + U.saturate(r.qty, 8) * 0.4 : 1);
    });
    U.keys(reward.currencies || {}).forEach(function (cid) {
      var it = itemById(design, cid);
      v += itemDesire(design, it) * U.saturate(reward.currencies[cid], 120) * 1.4;
    });
    if (reward.lootTableId) v += lootValue(design, lootById(design, reward.lootTableId));
    return v;
  }

  /* Which need axes a reward bundle feeds, and how strongly. */
  function rewardAxes(design, reward) {
    var axes = {};
    function add(axis, amt) { axes[axis] = (axes[axis] || 0) + amt; }
    if (!reward) return axes;
    if (reward.xp) add('progression', xpDesire(design, reward.xp, rewardLevel(design, reward)));
    if (reward.reputation) add('progression', reward.reputation * 0.05);
    (reward.unlocks || []).forEach(function () { add('novelty', 18); });
    (reward.items || []).forEach(function (r) {
      var it = itemById(design, r.itemId);
      add(itemAxis(it), itemDesire(design, it) * (r.chance === undefined ? 1 : r.chance));
    });
    U.keys(reward.currencies || {}).forEach(function (cid) {
      add('progression', itemDesire(design, itemById(design, cid)) * 0.8);
    });
    if (reward.lootTableId) {
      var t = lootById(design, reward.lootTableId);
      (t ? t.entries.concat(t.guaranteed || []) : []).forEach(function (e) {
        var it = itemById(design, e.itemId);
        add(itemAxis(it), itemDesire(design, it) * 0.25);
      });
    }
    return axes;
  }

  /* --------------------------------------------------- generators ---- */

  var GEAR_WORDS = {
    head: ['Helm', 'Crown', 'Hood', 'Casque'], neck: ['Pendant', 'Choker', 'Amulet'],
    shoulder: ['Pauldrons', 'Mantle', 'Spaulders'], back: ['Cloak', 'Drape', 'Cape'],
    chest: ['Breastplate', 'Robe', 'Chestguard'], wrist: ['Bracers', 'Wristguards'],
    hands: ['Gauntlets', 'Gloves', 'Grips'], waist: ['Girdle', 'Belt', 'Cord'],
    legs: ['Legplates', 'Leggings', 'Greaves'], feet: ['Sabatons', 'Boots', 'Treads'],
    ring1: ['Band', 'Signet', 'Loop'], ring2: ['Ring', 'Seal', 'Circle'],
    trinket1: ['Idol', 'Talisman', 'Charm'], trinket2: ['Relic', 'Sigil', 'Totem'],
    mainHand: ['Blade', 'Hammer', 'Staff', 'Axe'], offHand: ['Shield', 'Orb', 'Dagger']
  };

  /* Build a full set of gear for one tier. Authoring sixteen slots by
     hand is not design work, it is data entry - so generate, then let
     the player edit any piece.                                         */
  function generateGearSet(design, opts) {
    opts = opts || {};
    var rng = new U.Rng(opts.seed || Math.floor(Math.random() * 1e9));
    var ilvl = opts.itemLevel || 60;
    var rarity = opts.rarity || 'rare';
    var prefix = opts.prefix || 'Tier';
    var slots = opts.slots || ST.GEAR_SLOTS.map(function (s) { return s.id; });
    var s = ST.statSetOf(design);
    var made = [];

    slots.forEach(function (slotId) {
      var slot = ST.SLOT_BY_ID[slotId];
      var words = GEAR_WORDS[slotId] || ['Piece'];
      var weights = {};
      /* The primary stat has to dominate, or a generated set ends up
         weaker than the budget it was given - stats are not equal.   */
      var primary = opts.primary || s.primaries[0].id;
      weights[primary] = 4.5;
      weights[s.stamina.id] = 2.0;
      var secs = s.secondaries.slice();
      var maxSec = ST.RARITY_BY_ID[rarity].maxSecondary;
      rng.shuffle(secs).slice(0, Math.max(1, maxSec)).forEach(function (x) {
        weights[x.id] = 0.8 + rng.next() * 0.5;
      });
      if (slot && slot.armour) weights[s.armour.id] = 1.5;

      var item = newItem({
        name: prefix + ' ' + rng.pick(words),
        kind: 'gear', slot: slotId, rarity: rarity, itemLevel: ilvl,
        bind: opts.bind || 'pickup',
        vendorValue: Math.round(ilvl * 1.8)
      });
      ST.autoAllocate(design, item, weights);
      made.push(item);
    });
    return made;
  }

  /* The starter catalogue every new design begins with, so nothing in
     the game is pointing at an empty list.                            */
  function defaultCatalogue(design) {
    var items = [];
    items.push(newItem({ id: 'cur_gold', name: 'Gold', kind: 'currency',
      rarity: 'common', flavour: 'The main currency. Everything else is priced against it.' }));
    items.push(newItem({ id: 'cur_valor', name: 'Valour', kind: 'currency',
      rarity: 'rare', flavour: 'Earned from group content, spent at a vendor. Your catch-up lever.' }));
    items.push(newItem({ id: 'con_health', name: 'Healing Potion', kind: 'consumable',
      rarity: 'common', itemLevel: 5, vendorValue: 12,
      effects: [{ type: 'restoreHealth', amount: 800 }] }));
    items.push(newItem({ id: 'mat_ore', name: 'Iron Ore', kind: 'material',
      rarity: 'common', itemLevel: 5, vendorValue: 8 }));
    items.push(newItem({ id: 'mat_hide', name: 'Rugged Hide', kind: 'material',
      rarity: 'common', itemLevel: 5, vendorValue: 8 }));
    items.push(newItem({ id: 'cos_tabard', name: 'Embroidered Tabard', kind: 'cosmetic',
      rarity: 'uncommon', vendorValue: 40 }));
    /* Somewhere to put all of that.

       Carrying space is the sum of the bags a player owns, so a design
       with no bags in it is a design whose players cannot pick anything
       up - no reagents, no flasks, and therefore no crafting economy.
       A starting catalogue needs one for the same reason it needs a
       currency. */
    items.push(newItem({ id: 'bag_starter', name: 'Traveller’s Satchel',
      kind: 'container', rarity: 'common', itemLevel: 1,
      slots: 6, maxCarried: 4, vendorValue: 25,
      sources: { vendor: true },
      flavour: 'Six slots. Four of them is most of what anybody needs for a while.' }));
    items.push(newItem({ id: 'bag_large', name: 'Reinforced Pack',
      kind: 'container', rarity: 'uncommon', itemLevel: 20,
      slots: 12, maxCarried: 4,
      flavour: 'Twice the room, and something for a crafter to want.' }));
    return items;
  }

  /* Readable tooltip for any item. */
  function describe(design, item) {
    if (!item) return '';
    var parts = [];
    var rarity = ST.RARITY_BY_ID[item.rarity] || ST.RARITY_BY_ID.common;
    if (item.kind === 'gear') {
      parts.push(ST.SLOT_BY_ID[item.slot] ? ST.SLOT_BY_ID[item.slot].name : item.slot);
      parts.push('ilvl ' + item.itemLevel);
    }
    U.keys(item.stats || {}).forEach(function (id) {
      var st = ST.statById(design, id);
      if (st) parts.push('+' + U.fmtInt(item.stats[id]) + ' ' + st.name);
    });
    (item.effects || []).forEach(function (e) {
      var def = null;
      CONSUMABLE_EFFECTS.forEach(function (c) { if (c.id === e.type) def = c; });
      parts.push((def ? def.name : e.type) + (e.amount ? ' ' + U.fmtInt(e.amount) : ''));
    });
    return { rarityColour: rarity.colour, lines: parts };
  }

  PN.items = {
    ITEM_KINDS: ITEM_KINDS, KIND_BY_ID: KIND_BY_ID, BIND_TYPES: BIND_TYPES,
    CONSUMABLE_EFFECTS: CONSUMABLE_EFFECTS,
    newItem: newItem, itemById: itemById, itemDesire: itemDesire, sellValue: sellValue,
    intrinsicDesire: intrinsicDesire, itemAxis: itemAxis,
    newLootTable: newLootTable, lootById: lootById, lootValue: lootValue, rollLoot: rollLoot,
    lootShare: lootShare, expectedDrops: expectedDrops,
    isTradeable: isTradeable, tradeableShare: tradeableShare, BIND_BY_ID: BIND_BY_ID,
    SOURCES: SOURCES, sourcesOf: sourcesOf, isVendorable: isVendorable,
    isGatherable: isGatherable, vendorStock: vendorStock, gatherPool: gatherPool,
    placements: placements, isOrphan: isOrphan,
    newReward: newReward, rewardById: rewardById, rewardValue: rewardValue, rewardAxes: rewardAxes,
    rewardLevel: rewardLevel, xpDesire: xpDesire,
    generateGearSet: generateGearSet, defaultCatalogue: defaultCatalogue, describe: describe
  };
})(PN);
