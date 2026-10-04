/* Patch Notes - individual player simulation.
   Every player in the game is a real agent with a level, a bag, a set of
   currencies and sixteen gear slots. They pick up quests, run dungeons,
   roll on loot, equip upgrades, join guilds, judge the game, and leave.

   The whole game is scaled down roughly 100x from a mass-market MMO so
   this is affordable: a successful game here has thousands of players,
   not millions.                                                          */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax, IT = PN.items, ST = PN.stats, W = PN.world;

  /* Above this, one agent stands in for several players. In practice a
     healthy game at this scale stays well under it.                    */
  /* How many players get a row of their own. Past this the roster stops
     growing and each agent stands in for several, which is what the
     weight is for. Games hold far more players than they used to, and
     no screen shows more than a few dozen at a time, so this is about
     keeping a week fast enough to watch at 4x. */
  var MAX_AGENTS = 3500;

  var ACTIVITIES = [
    { id: 'quest',   name: 'Questing',    cats: ['levelling', 'questNarrative'] },
    { id: 'explore', name: 'Exploring',   cats: ['exploration'] },
    { id: 'grind',   name: 'Grinding',    cats: ['levelling'] },
    { id: 'dungeon', name: 'Dungeons',    cats: ['dungeon'] },
    { id: 'raid',    name: 'Raiding',     cats: ['raid'] },
    { id: 'pvp',     name: 'PvP',         cats: ['pvpArena', 'competitiveLadder'] },
    { id: 'craft',   name: 'Crafting',    cats: ['crafting', 'economy'] },
    { id: 'collect', name: 'Collecting',  cats: ['collection', 'cosmetic', 'achievement'] },
    { id: 'social',  name: 'Socialising', cats: ['social', 'housing'] },
    { id: 'event',   name: 'The event',   cats: ['collection', 'cosmetic', 'social'] }
  ];

  /* ============================================================ SPAWNING */

  /* Player ids, and why they have to live on the state.

     This counter used to be a variable in this file starting at one,
     which meant it started at one again every time the page was
     opened. Load a save whose roster runs to forty thousand and the
     next person who signs up is given id 1 - already taken. From then
     on the game held two different people under one number: starring
     a capped veteran starred a five-week newcomer as well, and opening
     one of them opened whichever the lookup found last.

     The counter is part of the save now, so an id issued in one
     session is never issued again in the next. */
  function allocId(state) {
    if (!state.nextAgentId) state.nextAgentId = highestId(state) + 1;
    return state.nextAgentId++;
  }

  function highestId(state) {
    var max = 0;
    function scan(list) {
      (list || []).forEach(function (a) { if (a.id > max) max = a.id; });
    }
    scan(state.agents);
    (state.titles || []).forEach(function (t) { scan(t.agents); });
    return max;
  }

  /* Saves written before the counter was persisted already contain
     collisions, so loading one has to repair them. The first holder of
     a number keeps it and every later claimant is renumbered, which is
     the right way round: the first holder is the longest-standing
     player, and the one a star put on that number. */
  function ensureIds(state) {
    state.nextAgentId = highestId(state) + 1;
    var seen = {}, fixed = 0;
    function pass(list) {
      (list || []).forEach(function (a) {
        if (a.id === undefined || a.id === null || seen[a.id]) {
          a.id = allocId(state);
          fixed++;
        }
        seen[a.id] = 1;
      });
    }
    /* The mounted title's roster and state.agents are the same players.
       In memory they are the same array; read back from a save they are
       two copies of it, and walking both would renumber every player in
       the stored copy for clashing with themselves. */
    pass(state.agents);
    (state.titles || []).forEach(function (t) {
      if (t.id === state.activeTitleId || t.agents === state.agents) return;
      pass(t.agents);
    });
    return fixed;
  }

  function spawn(state, archId, bandId, rng, ctx) {
    var consumed = {};
    var d = ctx && ctx.world ? ctx.world.design : PN.sim.live(state);
    var s = ST.statSetOf(d);

    /* What this player chooses to play. Not the strongest build - their
       build. Taste comes first, the tier list second, and how much the
       tier list matters depends on the archetype: a competitor re-rolls
       for two percent, a roleplayer heals because they like healing. */
    var build = null;
    var list = (ctx && ctx.builds) ? ctx.builds : PN.builds.enumerate(d);
    if (list.length) {
      build = PN.builds.choose(d, archId, rng, {
        builds: list,
        scores: ctx ? ctx.buildScores : null,
        shortage: ctx ? ctx.roleShortage : null
      }) || rng.pick(list);
    }
    var primary = build
      ? (U.byId(s.primaries, build.buildStat) || s.primaries[0])
      : s.primaries[0];

    /* And which race, when the game has any. Same rule as the build:
       a competitor rolls the one the spreadsheet says, a roleplayer
       rolls the one they like the look of - so race popularity is a
       readout of how strongly the design pushes people around, which
       is the interesting number. Null in a game with no races. */
    var race = (build && PN.races && PN.races.enabled(d))
      ? PN.races.chooseFor(d, build, archId, rng) : null;

    return {
      id: allocId(state),
      nm: makeName(rng, nameStyleFor(d)),
      a: archId, b: bandId,
      /* The playable they belong to, and the build they actually play. */
      cls: build ? (build.playableId || build.id) : null,
      bld: build ? build.id : null,
      role: build ? build.buildRole : 'dps',
      rc: race ? race.id : null,
      primaryId: primary ? primary.id : null,
      lv: 1, xp: 0,
      /* Bags a new character buys in their first hour. Anything a
         vendor stocks is a shopping trip rather than a drop, and
         nobody plays an MMO for ten minutes without buying bags -
         so a design that sells one starts everybody with it, and a
         design that does not makes bag space something to find. */
      g: {}, inv: {}, bags: U.clone(starterBags(d)), cur: {},
      gid: null,
      t: 0, wc: 0,
      sat: 55, nov: 70,
      con: consumed,
      qd: 0, bk: 0, dr: 0,          /* quests done, boss kills, dungeon runs */
      pity: 0,
      sp: 0,
      sub: true,
      hrs: 0,
      w: 1,
      seed: rng ? rng.int(1, 1e9) : 1
    };
  }

  /* --------------------------------------------------------- progression */

  /* XP required to go from `level` to the next one. */
  function xpForLevel(design, level) {
    var P = design.progression;
    var steep = 0.6 + (P.xpSteepness / 100) * 1.8;
    var base = 120;
    switch (P.xpShape) {
      case 'linear': return base * level * (1 + steep * 0.4);
      case 'flat': return base * 6;
      case 'banded': return base * Math.pow(Math.ceil(level / 10) * 10, 1.3) * (0.5 + steep * 0.4);
      default: return base * Math.pow(level, 1.15 + steep * 0.42);
    }
  }
  function totalXpToCap(design) {
    var t = 0;
    for (var l = 1; l < design.progression.levelCap; l++) t += xpForLevel(design, l);
    return t;
  }

  /* The levelling curve, in the units somebody writing a quest actually
     thinks in.

     Four sliders decided how much experience a level costs and nothing
     ever said what the number was, so "award 50 XP" and "award 50,000
     XP" looked equally plausible when writing a quest - and one of them
     is the whole first level and the other is a rounding error. This
     turns the curve into the two facts you need: what a level costs
     here, and how many of a thing it takes to earn one. */
  var xpPlan = U.memoDesign(function (design) {
    var cap = design.progression.levelCap || 1;
    var perLevel = [];
    for (var l = 1; l < cap; l++) perLevel.push({ level: l, xp: xpForLevel(design, l) });
    var total = U.sum(perLevel, function (p) { return p.xp; });
    /* Quests that exist, and what each would have to be worth to carry
       a character the whole way on questing alone. */
    var quests = (design.quests || []).length;
    return {
      cap: cap,
      perLevel: perLevel,
      total: total,
      first: perLevel.length ? perLevel[0].xp : 0,
      last: perLevel.length ? perLevel[perLevel.length - 1].xp : 0,
      median: perLevel.length ? perLevel[Math.floor(perLevel.length / 2)].xp : 0,
      quests: quests,
      perQuest: quests > 0 ? total / quests : 0
    };
  });

  /* What an award is worth at a given level: the share of that level it
     covers, and how many of it a level takes. */
  function xpWorth(design, xp, level) {
    var one = xpForLevel(design, U.clamp(level || 1, 1,
      Math.max(1, (design.progression.levelCap || 1) - 1)));
    return { levelCost: one, share: one > 0 ? xp / one : 0,
             perLevel: xp > 0 ? one / xp : Infinity };
  }
  /* --------------------------------------------------------------- gear */

  /* Which primary stat this player's build actually wants. Older saves
     predate the field, so fall back to the build they play. */
  function primaryOf(design, agent) {
    if (agent.primaryId) return agent.primaryId;
    var prims = ST.statSetOf(design).primaries || [];
    var build = agent.bld ? U.byId(PN.builds.enumerate(design), agent.bld) : null;
    if (build && build.buildStat) { agent.primaryId = build.buildStat; return agent.primaryId; }
    agent.primaryId = prims.length ? prims[0].id : null;
    return agent.primaryId;
  }

  /* What a piece of gear is worth TO THIS PLAYER.

     Item level alone is not the answer. A Dexterity character handed a
     higher-level Strength chest gains almost nothing from it: the stat
     budget on it is spent on a stat they do not scale with. They would
     keep wearing their own piece and sell that one, and the simulation
     has to do the same or every player ends up in whatever dropped last
     rather than in gear for the build they are playing.

     Pieces carrying no primary at all - necks, some trinkets - are worth
     nearly full value to everybody, which is exactly why those slots are
     the ones players stop caring about.                              */
  var GEAR_FIT = { mine: 1, neutral: 0.85, theirs: 0.4 };
  function gearFit(design, agent, it) {
    var mine = primaryOf(design, agent);
    var stats = it.stats || {};
    if (mine && stats[mine] > 0) return GEAR_FIT.mine;
    var prims = ST.statSetOf(design).primaries || [];
    for (var i = 0; i < prims.length; i++) {
      if (prims[i].id !== mine && stats[prims[i].id] > 0) return GEAR_FIT.theirs;
    }
    return GEAR_FIT.neutral;
  }

  /* Crafting asks "would I wear this?", which needs the same fit rule
     equipping uses. Handed in so the design layer stays free of the
     simulation.                                                     */
  var CRAFT_OPTS = { gearFit: gearFit,
                     wantsBags: function (d, a) { return wantsBags(d, a); },
                     /* How much room they have already, so a bag is
                        worth what it ADDS rather than what it is. */
                     slotsOf: function (d, a) { return slotsOf(d, a); } };
  function itemValueFor(design, agent, it) {
    return (it.itemLevel || 0) * gearFit(design, agent, it);
  }

  function gearScore(design, agent) {
    var total = 0;
    U.keys(agent.g).forEach(function (slot) {
      var it = IT.itemById(design, agent.g[slot]);
      if (!it) return;
      total += it.itemLevel;
    });
    /* Empty slots count as zero - a half-geared player is half-geared. */
    var base = ST.GEAR_SLOTS.length > 0 ? total / ST.GEAR_SLOTS.length : 0;
    return base * (1 + enchantBonus(design, agent));
  }

  /* --------------------------------------------------------- scrolls --

     An enchanter improves somebody else's work: a small permanent bonus
     on a piece of gear that was already good. Every player has sixteen
     slots and will put the best scroll they can get on each of them -
     and "best" is decided by the job their build does, which is what
     makes a scroll table a set of decisions rather than a ladder.

     A tank scrolled with critical strike is a tank who did not bother.  */

  /* Who this player has their scrolls on, and what they are. Recomputed
     when their gear or the design changes, because a new scroll in a
     patch is something everybody re-does that week. */
  function reScroll(design, agent) {
    var pool = PN.scrolls.scrolls(design);
    if (!pool.length) { agent.ench = null; return; }
    var mine = primaryOf(design, agent);
    var job = agent.role || 'dps';
    var out = {};
    U.keys(agent.g).forEach(function (slot) {
      if (!agent.g[slot]) return;
      var pick = PN.scrolls.bestFor(design, slot, mine, job, pool);
      if (pick) out[slot] = pick.scroll.id;
    });
    agent.ench = out;
  }

  /* What those scrolls are adding, as a share of the character's power.

     Deliberately a percentage rather than raw stats: an enchant is a
     few percent on top of an item, and if it were priced as stats it
     would quietly become a second set of gear. */
  function enchantBonus(design, agent) {
    if (!agent.ench) return 0;
    var pool = PN.scrolls.scrolls(design);
    if (!pool.length) return 0;
    var byId = {};
    pool.forEach(function (s) { byId[s.id] = s; });
    var mine = primaryOf(design, agent);
    var job = agent.role || 'dps';
    var total = 0, slots = 0;
    U.keys(agent.ench).forEach(function (slot) {
      var s = byId[agent.ench[slot]];
      if (!s) return;
      var gearItem = IT.itemById(design, agent.g[slot]);
      if (!gearItem) return;
      /* Against the stat budget of the piece it is on, so a scroll is
         worth less on a raid weapon than on a levelling one - which is
         exactly how enchants age out. */
      var budget = Math.max(1, ST.budgetUsed(design, gearItem));
      total += U.clamp01(PN.scrolls.worthTo(design, agent, s, mine, job) / budget);
      slots++;
    });
    if (!slots) return 0;
    /* Averaged across every slot they are wearing - an unenchanted
       slot is a slot with no enchant on it, not a slot that does not
       count - and then held to single digits.

       Enchanting is a finishing touch on a character, not a second
       character. A fully scrolled raider should be a few percent ahead
       of an unscrolled one: enough that doing it matters, not so much
       that skipping it puts you out of the raid. */
    return U.clamp(total / Math.max(1, U.keys(agent.g).length) * 0.18, 0, 0.08);
  }

  /* Equip anything better than what is already in that slot, judged by
     what it is worth to this build rather than by its item level. */
  function equipFrom(design, agent, itemId) {
    var it = IT.itemById(design, itemId);
    if (!it || it.kind !== 'gear' || !it.slot) return false;
    /* A ring goes on whichever finger is free, and failing that it
       replaces the worse of the two. Anything else has one slot. */
    var slots = ST.slotsFor(it.slot);
    if (!slots.length) return false;
    var worst = null, worstVal = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var cur = IT.itemById(design, agent.g[slots[i]]);
      /* Never wear two copies of the same item. */
      if (cur && cur.id === it.id) return false;
      var v = cur ? itemValueFor(design, agent, cur) : -1;
      if (v < worstVal) { worstVal = v; worst = slots[i]; }
    }
    if (worstVal < itemValueFor(design, agent, it)) {
      agent.g[worst] = it.id;
      return true;
    }
    return false;
  }

  function addItem(design, agent, itemId, qty) {
    var it = IT.itemById(design, itemId);
    if (!it) return;
    if (it.kind === 'currency') {
      agent.cur[itemId] = (agent.cur[itemId] || 0) + qty;
      agent.earnedGold = (agent.earnedGold || 0) + qty;
      return;
    }
    if (it.kind === 'gear') {
      if (equipFrom(design, agent, itemId)) return;
      /* Not an upgrade: vendor it rather than hoarding forever. Vendors
         pay a fraction of the sticker price, or every dungeon run
         becomes a money printer.                                    */
      var gold = firstCurrency(design);
      if (gold) {
        var paid = Math.max(1, Math.round(Math.max(1, IT.sellValue(design, it)) * 0.15));
        agent.cur[gold.id] = (agent.cur[gold.id] || 0) + paid;
        agent.earnedGold = (agent.earnedGold || 0) + paid;
      }
      return;
    }
    /* A bag is not carried IN your bags. */
    if (it.kind === 'container') {
      agent.bags = agent.bags || {};
      var cap = Math.max(0, it.maxCarried === undefined ? 4 : it.maxCarried);
      agent.bags[itemId] = Math.min(cap, (agent.bags[itemId] || 0) + qty);
      return;
    }

    /* Everything else needs somewhere to go.

       Carrying space is the sum of the bags a player owns, and nothing
       else. A game that ships no bags is a game whose players cannot
       pick anything up - which is the point of the item type and is
       reported as a problem rather than left as a mystery. Gear is
       exempt: it was either an upgrade and is now worn, or it was
       vendored on the spot, and neither needs a slot. */
    var have = (agent.inv[itemId] || 0);
    if (!have && U.keys(agent.inv).length >= slotsOf(design, agent)) {
      /* Full. Make room only if this is worth more than the worst
         thing already in there - otherwise it is left on the floor,
         which is what a full bag means. */
      var keys = U.keys(agent.inv);
      var worst = null, worstVal = Infinity;
      keys.forEach(function (k) {
        var v = IT.itemDesire(design, IT.itemById(design, k));
        if (v < worstVal) { worstVal = v; worst = k; }
      });
      if (worst === null || IT.itemDesire(design, it) <= worstVal) return;
      delete agent.inv[worst];
    }
    agent.inv[itemId] = have + qty;
  }

  /* The bags anybody can simply go and buy, which is what a new
     character turns up with. Cheapest first, because that is what
     somebody with no money can afford. */
  var starterBags = U.memoDesign(function (design) {
    var sold = (design.items || []).filter(function (i) {
      return i.kind === 'container' && (i.slots || 0) > 0 && IT.isVendorable(i);
    }).sort(function (a, b) { return (a.vendorValue || 0) - (b.vendorValue || 0); });
    if (!sold.length) return {};
    var out = {};
    var b = sold[0];
    out[b.id] = Math.max(1, b.maxCarried === undefined ? 4 : b.maxCarried);
    return out;
  });

  /* How many stacks this player can carry. Identical items stack, so a
     slot is a KIND of thing rather than a thing. */
  function slotsOf(design, agent) {
    var base = ((design.gearing || {}).backpackSlots) || 0;
    var bags = agent.bags;
    if (!bags) return base;
    var total = base;
    U.keys(bags).forEach(function (id) {
      var it = IT.itemById(design, id);
      if (!it || it.kind !== 'container') return;
      var cap = Math.max(0, it.maxCarried === undefined ? 4 : it.maxCarried);
      total += Math.min(cap, bags[id] || 0) * Math.max(0, it.slots || 0);
    });
    return total;
  }

  /* Would another bag help? A player at the limit with things they
     want to keep is a player in the market for one. */
  function wantsBags(design, agent) {
    var cap = slotsOf(design, agent);
    var used = U.keys(agent.inv || {}).length;
    return cap <= 0 ? 1 : U.clamp01((used + 1) / Math.max(1, cap));
  }

  /* Every bag in the design, biggest first. */
  var bagCatalogue = U.memoDesign(function (design) {
    return (design.items || []).filter(function (i) {
      return i.kind === 'container' && (i.slots || 0) > 0 &&
             (i.maxCarried === undefined || i.maxCarried > 0);
    }).sort(function (a, b) { return (b.slots || 0) - (a.slots || 0); });
  });

  /* Buying bags, which is the quietest thing every MMO player does.

     Room in your bags is the one upgrade that helps whatever you are
     doing, so anybody who can afford more of it buys more of it -
     and keeps buying until they are carrying the most of every bag
     the game will let them. Nothing made that happen: everybody
     turned up with the cheapest bag on the shelf and died with it,
     so bag space was a number on a design screen rather than
     something players chased.

     Biggest first, because a player fills their bag slots with the
     best bag they can reach and only then considers the next one
     down. Vendor bags cost money; anything else has to be found or
     made, and turns up through addItem like any other drop. */
  function buyBags(design, agent) {
    var list = bagCatalogue(design);
    if (!list.length) return 0;
    var gold = firstCurrency(design);
    if (!gold) return 0;
    var purse = agent.cur[gold.id] || 0;
    agent.bags = agent.bags || {};
    var bought = 0;

    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!IT.isVendorable(b)) continue;          /* has to be found */
      var cap = Math.max(0, b.maxCarried === undefined ? 4 : b.maxCarried);
      var have = agent.bags[b.id] || 0;
      if (have >= cap) continue;
      var price = Math.max(1, b.vendorValue || 0);
      /* Nobody spends their last coin on a bag. Space is worth
         chasing hardest when there is none left, which is what makes
         a small starting bag a real pressure rather than a nuisance. */
      var keen = 0.25 + wantsBags(design, agent) * 0.75;
      var afford = purse * keen;
      var want = Math.min(cap - have, Math.floor(afford / price));
      if (want <= 0) continue;
      agent.bags[b.id] = have + want;
      purse -= want * price;
      bought += want * price;
    }

    if (bought > 0) agent.cur[gold.id] = purse;
    /* What it cost, so the caller can book it as a sink: money spent
       at a vendor leaves the game, which is the point of one. */
    return bought;
  }

  /* The currency prices are quoted in - the one you marked as money,
     rather than whichever currency happened to be first in the list. */
  function firstCurrency(design) {
    var m = PN.currency.moneyOf(design);
    return m ? m.item : null;
  }

  function grantReward(design, agent, rewardId, rng) {
    var r = IT.rewardById(design, rewardId);
    if (!r) return 0;
    agent.xp += r.xp || 0;
    (r.items || []).forEach(function (e) {
      if (e.chance === undefined || rng.chance(e.chance)) addItem(design, agent, e.itemId, e.qty || 1);
    });
    U.keys(r.currencies || {}).forEach(function (cid) {
      addItem(design, agent, cid, r.currencies[cid]);
    });
    if (r.lootTableId) {
      IT.rollLoot(design, IT.lootById(design, r.lootTableId), rng, agent.pity, { prefer: primaryOf(design, agent) })
        .forEach(function (d) { addItem(design, agent, d.itemId, d.qty); });
    }
    return IT.rewardValue(design, r);
  }


  /* ========================================================= BATTLE PASS

     A pass has two tracks. Everybody who plays climbs the free one; the
     people who paid get the premium track as well, on the same tiers.
     The old code priced the pass and took the money, but nothing was
     ever handed out - so the free track was unreachable, the premium
     track was unreachable, and the tiers the author wrote were worth
     exactly nothing to anybody.

     Progress is hours played against the grind the author set, which is
     what makes grindHoursPerWeek a real decision: set it high and only
     the heaviest players finish, set it low and the pass is over by
     week three.                                                       */
  function passSeasonOf(state, bp) {
    var weeks = Math.max(1, bp.seasonWeeks || 12);
    return Math.floor((state.week || 0) / weeks);
  }

  function tickBattlePass(state, design, agent, rng) {
    var bp = (design.monetisation || {}).battlePass;
    if (!bp || !bp.enabled) return 0;
    var tiers = bp.tiers || [];
    if (!tiers.length) return 0;

    /* A new season resets everybody's progress, and whether they bought
       in is decided once per season rather than every week. */
    var season = passSeasonOf(state, bp);
    if (agent.passSeason !== season) {
      agent.passSeason = season;
      /* Carryover keeps a slice of last season's progress, which is the
         whole point of the setting. */
      agent.passProg = bp.carryover ? (agent.passProg || 0) * 0.25 : 0;
      agent.passTier = Math.floor(agent.passProg);
      agent.passOwned = false;
    }

    /* Hours this week against the pace the author asked for. Progress is
       kept as a fraction: rounding it off every week threw away most of
       what a player earned and nobody ever finished a pass. Catch-up
       gives late joiners a shove so the season is not hopeless by
       week eight. */
    var need = Math.max(0.5, bp.grindHoursPerWeek || 5);
    var weeks = Math.max(1, bp.seasonWeeks || 12);
    var weekInSeason = (state.week || 0) % weeks;
    var catchUp = 1 + (bp.catchUp / 100) * U.clamp01(weekInSeason / weeks) * 1.2;
    agent.passProg = (agent.passProg || 0) + ((agent.hrs || 0) / need) * catchUp;
    var from = agent.passTier || 0;
    var to = Math.min(tiers.length, Math.floor(agent.passProg));
    if (to <= from) return 0;
    agent.passTier = to;

    /* Everyone gets the free track. The premium track needs the pass. */
    var value = 0;
    for (var i = from; i < to; i++) {
      var t = tiers[i];
      if (!t) continue;
      value += grantReward(design, agent, t.freeRewardId, rng);
      if (agent.passOwned) value += grantReward(design, agent, t.premiumRewardId, rng);
    }
    return value;
  }
  /* ======================================================= WORLD CACHE ==
     Built once per tick, not once per agent.                           */
  function buildWorldCache(state) {
    var d = PN.sim.live(state);
    var quests = (d.quests || []).slice().sort(function (a, b) { return a.level - b.level; });
    var monsters = (d.monsters || []).slice().sort(function (a, b) { return a.level - b.level; });
    var dungeons = (d.dungeons || []).filter(function (x) { return x.kind === 'dungeon'; })
      .sort(function (a, b) { return (a.levelReq || 1) - (b.levelReq || 1); });
    var raids = (d.dungeons || []).filter(function (x) { return x.kind === 'raid'; });

    var dungeonInfo = dungeons.concat(raids).map(function (dg) {
      var bosses = PN.schema.bossesIn(d, dg);
      return {
        dg: dg,
        bosses: bosses.map(function (b) {
          return { b: b, m: PN.metrics.bossMetrics(d, b) };
        }),
        metrics: PN.metrics.dungeonMetrics(d, dg)
      };
    });

    return {
      design: d, quests: quests, monsters: monsters,
      dungeons: dungeonInfo.filter(function (x) { return x.dg.kind === 'dungeon'; }),
      raids: dungeonInfo.filter(function (x) { return x.dg.kind === 'raid'; }),
      totalXpToCap: totalXpToCap(d),
      /* The builds this design supports, enumerated once per week. */
      builds: PN.builds.enumerate(d),
      /* Recipes and the materials they want, resolved once per week. */
      /* Ranked once per week, because pricing a recipe prices the whole
         design and doing that inside a sort was costing minutes. */
      recipes: PN.crafting.rankRecipes(d),
      /* What there is to finish in this design, priced once a week. */
      goalCat: PN.goals.catalogue(d),
      /* How strong the average person in the arena queue is. Priced
         once a week, because it is a property of the population
         rather than of whoever is being ticked. */
      pvpField: PN.ladder.fieldPower(state),
      /* What every activity in this design actually pays out. */
      payouts: PN.places.payouts(d),
      /* Only what players can actually pick up out in the world. */
      materials: IT.gatherPool(d),
      groupDemand: PN.builds.groupDemand(d),
      /* Whatever is running on the calendar RIGHT NOW. An event is
         only content while it is on, which is the whole reason
         anybody comes back for one. */
      liveEvents: PN.gameEvents.activeEvents(d, state),
      eventWeek: Math.max(0, (state.week || 0) - (state.launchWeek || 0)),
      inventory: PN.metrics.contentInventory(d),
      engines: PN.metrics.engineOutput(d),
      targetIlvl: PN.combat.targetItemLevel(d),
      firstCurrency: firstCurrency(d),
      /* What the typical player is holding, so "rich" can mean rich
         compared to the rest of the game rather than rich compared to
         a number somebody picked. */
      /* Everybody's purse, sorted, so a player can be placed on the
         wealth ladder rather than against a number. A multiple of the
         median does not work: in a mature game wealth is bunched, and
         twice the median is a figure literally nobody reaches. Where
         you STAND always spreads people out. */
      purseLadder: (function () {
        var m = PN.currency.moneyOf(d);
        if (!m || !state.agents || !state.agents.length) return null;
        var held = [];
        state.agents.forEach(function (a) { held.push((a.cur || {})[m.id] || 0); });
        held.sort(function (x, y) { return x - y; });
        return held;
      })(),
      typicalPurse: (function () {
        var m = PN.currency.moneyOf(d);
        if (!m || !state.agents || !state.agents.length) return 0;
        var held = [];
        state.agents.forEach(function (a) { held.push((a.cur || {})[m.id] || 0); });
        held.sort(function (x, y) { return x - y; });
        return held[Math.floor(held.length / 2)] || 0;
      })(),
      /* What your authored sinks pull, priced once a week. */
      money: (function () {
        var m = PN.currency.moneyOf(d);
        return m ? PN.currency.drainOf(d, m.id) : null;
      })(),
      /* Only what you actually put on a vendor. This used to be the
         whole catalogue, so every piece of gear in the game was for
         sale whether you meant it to be or not. */
      vendorGear: IT.vendorStock(d)
        .sort(function (a, b) { return a.itemLevel - b.itemLevel; })
    };
  }

  /* ============================================================ ONE WEEK */

  function tickAgent(state, agent, ctx) {
    var d = ctx.world.design, arch = tax.ARCHETYPE_BY_ID[agent.a];
    var band = PN.pop.bandOf(agent.b);
    var rng = ctx.rng;
    var cap = d.progression.levelCap;
    var atCap = agent.lv >= cap;

    /* Last week's income, kept before this week's counter is
       cleared. It is how the game knows who is rich: a purse is
       only large relative to what its owner earns. */
    agent.income = agent.earnedGold || 0;
    agent.earnedGold = 0;
    var budget = arch.time * (0.75 + band.skill * 0.35) * U.clamp(rng.normal(1, 0.22), 0.35, 1.8);
    var remaining = budget;
    agent.hrs = 0;

    var gs = gearScore(d, agent);
    var gearRatio = U.clamp01(gs / Math.max(1, ctx.world.targetIlvl));
    var rewardValue = 0, freshHours = 0, engineHours = 0;

    /* --- what is even available to this player right now -------------- */
    var offers = [], availableHours = 0;
    function offer(id, hours, fresh, weight) {
      if (hours <= 0.01 || weight <= 0) return;
      offers.push({ id: id, hours: hours, fresh: fresh, weight: weight });
      /* What is on the table, whether or not they get round to it. This
         is what "running out of things to do" actually means.       */
      availableHours += hours;
    }

    /* --- what this player is here FOR --------------------------------- */

    /* Taste says what somebody enjoys; rewards say where they have to go
       to get what they want. Both are real, and the second one was
       missing entirely - which is why only raiders raided and only
       competitors fought, however good the loot elsewhere was.

       So every activity gets a second weight: how much of what THIS
       player is still chasing it actually pays out. If your best gear
       drops in a dungeon, everybody who wants gear runs dungeons. If
       your best reagents come out of arenas, your crafters queue. */
    var pay = ctx.world.payouts || {};
    var goalCat = ctx.world.goalCat;
    var prog = PN.goals.progressOf(d, agent, goalCat);

    /* What this player still wants, per kind of reward, 0-1. */
    var wants = {
      /* Gear they have not got yet, and the room left above what they
         are wearing. */
      gear: U.clamp01((1 - (prog.bis || 0)) * 0.75 +
                      (1 - U.clamp01(agent.gearRatio || 0)) * 0.45),
      /* Reagents matter to whoever still has professions to level, and
         to anyone whose best gear is crafted. */
      materials: U.clamp01((1 - (prog.professions || 0)) *
                           (goalCat && goalCat.professions ? 0.9 : 0)),
      /* Currency is the universal solvent: it buys the rest, if your
         game lets people buy things. */
      currency: U.clamp01(0.35 + (1 - (prog.bis || 0)) * 0.4),
      cosmetic: U.clamp01(1 - (prog.collection || 0))
    };
    /* Archetype decides how much somebody cares about each KIND of
       reward, not which activity they are allowed to do. These are
       the same weights the goal list uses, because wanting the gear
       and chasing best-in-slot are the same appetite.

       Note the appeal table is keyed by CONTENT CATEGORY - levelling,
       raid, crafting - and has no 'progression' entry, which is what
       this read before and why the gear appetite came out as NaN and
       pulled nobody anywhere. */
    function goalWant(id) {
      var g = PN.goals.GOAL_BY_ID[id];
      var w = g ? g.want[agent.a] : undefined;
      return w === undefined ? 0.4 : w;
    }
    wants.gear *= 0.3 + goalWant('bis') * 0.85;
    wants.materials *= 0.2 + goalWant('professions') * 1.0;
    wants.cosmetic *= 0.15 + goalWant('collection') * 1.1;
    wants.currency *= 0.3 + (arch.appeal.economy || 0) * 1.0;
    /* Kept on the agent for the rest of the week. What somebody wants
       is what decides whether a container in their bags is treasure or
       clutter, and working it out costs a goal-progress pass that
       must not run once per consumable per player. */
    agent.__wants = wants;

    /* How strongly a payout pulls this player. Scaled so a rich payout
       roughly doubles an activity's appeal rather than swamping taste. */
    function pullOf(key, levelGate) {
      var p = pay[key];
      if (!p) return 0;
      if (levelGate && p.level && agent.lv < p.level - 4) return 0;
      /* Relative to the best payout of that kind anywhere in the
         game: what pulls a player is not a big number, it is the
         biggest one. */
      var best = pay.__best || {};
      var v = 0;
      PN.places.REWARD_KINDS.forEach(function (k) {
        var ceiling = best[k] || 0;
        if (ceiling <= 0) return;
        /* Being the best source of something the game barely hands
           out at all is not a reason to go anywhere. Relative
           position decides WHERE; the absolute size decides whether
           it is worth crossing the room for. */
        var matters = U.saturate(ceiling, 30);
        v += U.clamp01((p[k] || 0) / ceiling) * (wants[k] || 0) * matters;
      });
      return U.clamp01(v);
    }
    /* The best payout of a set of places, since a player goes to the one
       that pays, not to all of them. */
    function bestPull(list, key) {
      var best = 0;
      (list || []).forEach(function (x) {
        var id = key ? x[key] : x;
        best = Math.max(best, pullOf(id, true));
      });
      return best;
    }
    /* Taste decides how much somebody ENJOYS an activity; the reward
       decides how much they NEED it. Both matter, and they are added
       rather than multiplied: a player with no taste for arenas still
       turns up when that is where their gear is, just less often than
       a competitor does. Multiplying them meant an archetype with zero
       appeal for something never went, however good the loot was. */
    function appeal(taste, pull) {
      return taste * (0.6 + pull * 0.9) + pull * (0.22 + taste * 0.5);
    }

    /* How much of the game this character has actually unlocked.

       Professions, the auction house and the arena are things a
       max-level character fills a week with. They were being offered
       in full to somebody on their third quest: eight and a half
       hours of crafting, four and a half at the auction house and
       nine of arena against the two hours of quests that exist at
       level five. So the levelling zones stood empty not because
       nobody was levelling, but because everybody levelling was
       standing in the workshops instead.

       The systemic engines ramp with the climb. What you wrote for a
       level range is what somebody in that level range has most of,
       which is the levelling loop doing its job. */
    var climbed = U.clamp01((agent.lv - 1) / Math.max(1, cap - 1));
    var unlocked = 0.12 + Math.pow(climbed, 0.7) * 0.88;

    /* Questing: quests at or below their level they have not done. */
    var eligible = 0, questPool = [];
    for (var qi = 0; qi < ctx.world.quests.length; qi++) {
      var q = ctx.world.quests[qi];
      if (q.level > agent.lv + 3) break;
      if (q.level < agent.lv - 8 && q.repeatable === 'none') continue;
      eligible++; questPool.push(q);
    }
    var questHoursLeft = Math.max(0, (eligible * 0.22) - (agent.con.levelling || 0) * 0.05);
    var homeZ = PN.places.homeZone(d, agent.lv);
    var zonePull = homeZ ? pullOf(homeZ.id) : 0;

    /* Getting to the cap IS the reward, until you get there.

       A levelling character was being asked to compare their zone's
       loot against the best payout anywhere in the game - and every
       crown jewel in an MMO is at the top, so a level five reading
       that board correctly concluded the best thing they could do
       with the week was go and craft. Which is not what a level five
       does. While the cap is ahead of them the climb outranks the
       loot table, and it stops mattering as they arrive. */
    var levelPull = atCap ? 0 : U.clamp01(0.45 + (1 - climbed) * 0.55);
    offer('quest', questHoursLeft, true,
      appeal(arch.appeal.questNarrative + arch.appeal.levelling,
             Math.max(zonePull, levelPull)));

    /* Grinding monsters: always available, never satisfying. */
    offer('grind', atCap ? 1.5 : 8, false,
      appeal(arch.appeal.levelling * 0.55, Math.max(zonePull * 0.6, levelPull * 0.7)));

    /* Exploration scales with the zones that exist. */
    offer('explore', Math.max(0, (ctx.world.inventory.exploration || 0) * 0.15 -
      (agent.con.exploration || 0) * 0.1), true, arch.appeal.exploration);

    /* Dungeons the player can enter - and how good their loot is. */
    var openDungeons = ctx.world.dungeons.filter(function (x) {
      return (x.dg.levelReq || 1) <= agent.lv && x.bosses.length;
    });
    /* A week is a week however much you built.

       Instance hours used to scale straight off the number of
       instances, so a game with seven dungeons offered fifteen hours
       of them - more than most people play in total - and running
       dungeons became the biggest single block of nearly everybody's
       week by arithmetic rather than by appeal. Breadth is worth
       something, but it is worth variety and novelty rather than
       hours: the fourth dungeon gives you somewhere else to go, not
       another evening in the day. */
    offer('dungeon', 2.2 + U.saturate(Math.max(0, openDungeons.length - 1), 2.2) * 6.5,
      agent.dr < openDungeons.length * 3,
      appeal(arch.appeal.dungeon, bestPull(openDungeons.map(function (x) {
        return x.dg.id; }))));

    /* Raids, at cap only. */
    var openRaids = atCap ? ctx.world.raids.filter(function (x) { return x.bosses.length; }) : [];
    offer('raid', openRaids.length ? 4.5 + U.saturate(openRaids.length - 1, 1.6) * 4 : 0, true,
      atCap ? appeal(arch.appeal.raid, bestPull(openRaids.map(function (x) {
        return x.dg.id; }))) : 0);

    if (d.pvp.enabled) {
      /* Low brackets exist, so this one ramps gently - but a level
         four is not filling nine hours a week with arena either. */
      /* Somebody who finished near the top of last season comes back
         for the next one. That is what a ladder regular is, and it is
         why the names on a leaderboard carry across a wipe instead of
         being a fresh set of strangers every season. */
      var regular = PN.ladder.regularity(agent);
      offer('pvp', 9 * (0.35 + climbed * 0.65) * (1 + regular * 0.6), false,
        appeal(arch.appeal.pvpArena + regular * 0.5, pullOf('__pvp')));
    }
    offer('craft', ((ctx.world.engines.hours.crafting || 0) +
      (ctx.world.engines.hours.economy || 0)) * unlocked,
      false, appeal(arch.appeal.crafting, pullOf('__craft')));
    /* The auction house is a road to your goal only if you can
       afford to walk it. Somebody holding a season of income buys
       the thing off another player; somebody living hand to mouth
       goes and farms it themselves. */
    var goldCur = ctx.world.firstCurrency;
    var purse = goldCur ? (agent.cur[goldCur.id] || 0) : 0;
    /* Rich compared to WHO.

       Measuring a purse against a fixed multiple of its owner's own
       income made more than half of a mature game "rich" at once:
       everybody had a year of income banked, the gate sat wide open,
       and the auction house became the largest room in the world.

       Wealth is relative. Buying your way to the top is what the
       people with the most money do, and there are only ever a few
       of those however much currency is in circulation. */
    var richness = wealthRank(ctx.world.purseLadder, purse);
    /* Kept on the agent so the world view can put them somewhere true:
       collecting is one activity, but a collector who can afford to
       buy is standing at the auction house and a collector who cannot
       is out in the world farming the thing themselves. */
    agent.rich = richness;
    offer('collect', ((ctx.world.engines.hours.collection || 0) +
      (ctx.world.engines.hours.cosmetic || 0)) * unlocked, false,
      appeal(arch.appeal.collection, pullOf('__ah') * (0.2 + richness * 0.95)));
    /* Anything running on the calendar. Fresh every time it comes
       round, because a holiday you did last year is still a holiday. */
    var live = ctx.world.liveEvents || [];
    if (live.length) {
      var evHours = 0, evTaste = 0, evPull = 0;
      live.forEach(function (ev) {
        evHours += PN.gameEvents.eventHours(d, ev,
          PN.gameEvents.weekInto(ev, ctx.world.eventWeek || 0));
        /* The reward is only here while the event is, which is exactly
           what makes somebody drop what they were doing for it. */
        evPull = Math.max(evPull, PN.gameEvents.eventPull(d, ev) *
          (0.45 + (wants.cosmetic || 0) * 0.8 + (wants.gear || 0) * 0.4));
        evTaste += (arch.appeal.collection + arch.appeal.social +
                    arch.appeal.cosmetic + arch.appeal.exploration) / 4;
      });
      offer('event', evHours, true,
        appeal(evTaste / live.length, U.clamp01(evPull)));
    }
    offer('social', (ctx.world.engines.hours.social || 0) + (agent.gid ? 3 : 0.5),
      false, arch.appeal.social);

    /* --- spend the week ----------------------------------------------- */
    var wTotal = U.sum(offers, function (o) { return o.weight; });
    var done = { xp: 0, loot: 0, currency: 0 };
    agent.lastActHours = 0;
    agent.actHrs = {};

    offers.sort(function (a, b) { return b.weight - a.weight; });
    offers.forEach(function (o) {
      if (remaining <= 0.05) return;
      var want = wTotal > 0 ? budget * (o.weight / wTotal) : 0;
      var spent = Math.min(want, o.hours, remaining);
      if (spent <= 0.02) return;
      remaining -= spent;
      agent.hrs += spent;
      if (o.fresh) freshHours += spent; else engineHours += spent;
      /* Remember where most of the week went, so the live world view can
         show this player somewhere that is true rather than somewhere
         invented. The first offer taken is the biggest by construction. */
      if (!agent.lastAct || spent > (agent.lastActHours || 0)) {
        agent.lastAct = o.id;
        agent.lastActHours = spent;
      }
      /* And the whole week, not only its biggest block.

         A mature game offers eight or nine things worth doing and
         somebody's week splits across most of them - fifteen percent
         here, thirteen there. Reading only the winner turns a
         well-spread week into "everybody is in the dungeons", because
         the same activity edges it for everybody by a nose. The world
         view places people in proportion to this instead. */
      agent.actHrs[o.id] = (agent.actHrs[o.id] || 0) + spent;

      var act = null;
      ACTIVITIES.forEach(function (A) { if (A.id === o.id) act = A; });
      if (act) act.cats.forEach(function (c) {
        agent.con[c] = (agent.con[c] || 0) + spent / act.cats.length;
      });

      /* --- resolve the activity --------------------------------------- */
      if (o.id === 'quest' && questPool.length) {
        var n = Math.min(questPool.length, Math.max(1, Math.round(spent / 0.22)));
        for (var k = 0; k < n; k++) {
          var pick = questPool[Math.min(questPool.length - 1,
            Math.floor(rng.next() * questPool.length))];
          rewardValue += grantReward(d, agent, pick.rewardId, rng);
          agent.qd++;
        }
      } else if (o.id === 'grind') {
        /* Kill things near your level for xp and pocket change. */
        var near = ctx.world.monsters.filter(function (m) {
          return Math.abs(m.level - agent.lv) <= 6;
        });
        if (near.length) {
          var kills = Math.round(spent * 26);
          var mob = near[Math.floor(rng.next() * near.length)];
          agent.xp += W.monsterXp(d, mob) * kills;
          /* Only roll loot a few times - the rest is vendor trash. */
          var rolls = Math.min(4, Math.round(kills / 12));
          for (var r = 0; r < rolls; r++) {
            IT.rollLoot(d, IT.lootById(d, mob.lootTableId), rng, 0, { share: 1, prefer: primaryOf(d, agent) })
              .forEach(function (x) { addItem(d, agent, x.itemId, x.qty); });
          }
        } else {
          agent.xp += Math.pow(agent.lv, 1.6) * 3.2 * spent * 18;
        }
      } else if (o.id === 'dungeon' && openDungeons.length) {
        var runs = Math.max(1, Math.round(spent / 0.8));
        for (var rn = 0; rn < runs && rn < 8; rn++) {
          var dd = openDungeons[Math.floor(rng.next() * openDungeons.length)];
          agent.dr++;
          var tier = PN.schema.easiestTier(dd.dg.tiers);
          var prepped = drinkUp(d, agent, spent, 1);
          dd.bosses.forEach(function (bi) {
            var chance = PN.metrics.clearChance(bi.m, tier.mult, band.skill, gearRatio,
              agent.gid ? 0.75 : 0.45) * (0.88 + prepped * 0.2);
            if (rng.chance(chance)) {
              agent.bk++;
              agent.xp += Math.pow(agent.lv, 1.7) * 9;
              agent.pity++;
              IT.rollLoot(d, IT.lootById(d, bi.b.lootTableId), rng, agent.pity,
                { share: IT.lootShare(d, dd.dg.groupSize), prefer: primaryOf(d, agent) })
                .forEach(function (x) {
                  if (addItemTracked(d, agent, x.itemId, x.qty)) agent.pity = 0;
                });
              rewardValue += grantReward(d, agent, bi.b.firstKillRewardId, rng) * 0.15;
            }
          });
          IT.rollLoot(d, IT.lootById(d, dd.dg.trashLootTableId), rng, 0,
            { share: IT.lootShare(d, dd.dg.groupSize), prefer: primaryOf(d, agent) })
            .forEach(function (x) { addItem(d, agent, x.itemId, x.qty); });
          rewardValue += grantReward(d, agent, dd.dg.completionRewardId, rng);
        }
      } else if (o.id === 'raid' && openRaids.length) {
        var rr = openRaids[Math.floor(rng.next() * openRaids.length)];
        var rtier = PN.schema.hardestTier(rr.dg.tiers);
        var rprep = drinkUp(d, agent, spent, 1.5);
        rr.bosses.forEach(function (bi) {
          var chance = PN.metrics.clearChance(bi.m, rtier.mult, band.skill, gearRatio,
            agent.gid ? 0.85 : 0.35) * (0.82 + rprep * 0.3);
          if (rng.chance(chance * U.clamp01(spent / 3))) {
            agent.bk++; agent.pity++;
            agent.xp += Math.pow(agent.lv, 1.7) * 14;
            IT.rollLoot(d, IT.lootById(d, bi.b.lootTableId), rng, agent.pity,
              { share: IT.lootShare(d, rr.dg.groupSize), prefer: primaryOf(d, agent) })
              .forEach(function (x) {
                if (addItemTracked(d, agent, x.itemId, x.qty)) agent.pity = 0;
              });
            rewardValue += grantReward(d, agent, bi.b.firstKillRewardId, rng) * 0.2;
          }
        });
        rewardValue += grantReward(d, agent, rr.dg.completionRewardId, rng);
      } else if (o.id === 'pvp') {
        /* One match pays a roll on the match table, not a guaranteed
           bundle. Hours in the arena become draws, the same way hours
           in a dungeon do. */
        var pvpTable = IT.lootById(d, d.pvp.matchLootId);
        if (pvpTable) {
          var draws = Math.max(1, Math.round(spent / 1.2));
          for (var pd = 0; pd < draws; pd++) {
            IT.rollLoot(d, pvpTable, rng, agent.pity, { prefer: primaryOf(d, agent) })
              .forEach(function (x) {
                rewardValue += (IT.itemDesire(d, IT.itemById(d, x.itemId)) || 0) * x.qty;
                addItemTracked(d, agent, x.itemId, x.qty);
              });
          }
        }
        agent.xp += Math.pow(agent.lv, 1.6) * 4 * spent;
        /* Time on the ladder this season, and how it went. Rating is
           read off their build and gear rather than stored, but who
           actually queued is something only this loop knows. */
        var pprep = drinkUp(d, agent, spent, 0.8);
        agent.pvpWeeks = (agent.pvpWeeks || 0) + spent / 9;
        /* Zero-sum. Your odds are your power against the field queueing
           beside you, so the population averages out at a coin toss
           instead of everybody somehow winning seven in ten. */
        var odds = U.clamp(PN.ladder.winChance(state, agent, ctx.world.pvpField)
                   + (pprep - 0.35) * 0.09, 0.05, 0.95);
        var games = Math.round(spent * 2.2);
        var won = 0;
        for (var gi = 0; gi < games; gi++) { if (rng.chance(odds)) won++; }
        agent.pvpWins = (agent.pvpWins || 0) + won;
        agent.pvpLosses = (agent.pvpLosses || 0) + (games - won);
      } else if (o.id === 'event') {
        /* The whole point of a holiday: the thing you can only get
           while it is on. */
        (ctx.world.liveEvents || []).forEach(function (ev) {
          rewardValue += grantReward(d, agent, ev.rewardId, rng) *
                         U.clamp01(spent / 4);
        });
        agent.xp += Math.pow(agent.lv, 1.6) * 3 * spent;
      } else if (o.id === 'craft') {
        /* Gathering pays whatever happens - that is the floor of the
           profession. What you do with the materials is the recipe. */
        var goldC = ctx.world.firstCurrency;
        if (goldC) addItem(d, agent, goldC.id, Math.round(spent * agent.lv * 3 *
          (1 + d.economy.gatheringNodes / 120)));

        var recipes = ctx.world.recipes || [];
        if (recipes.length) {
          /* Gather the reagents this design actually asks for, at a rate
             set by how thick the nodes are on the ground. */
          var mats = ctx.world.materials || [];
          if (mats.length) {
            var gathered = Math.max(1, Math.round(spent * 2.5 * (0.5 + d.economy.gatheringNodes / 110)));
            for (var gi = 0; gi < gathered; gi++) {
              var m = mats[Math.floor(rng.next() * mats.length)];
              addItem(d, agent, m.id, 1 + Math.floor(rng.next() * 2));
            }
          }
          /* Then make whatever is worth making and affordable. The ranked
             list comes from the weekly cache, so this is a scan rather
             than a re-pricing of the entire design per craft. */
          var crafts = Math.min(12, Math.max(0, Math.round(spent / 0.35)));
          for (var ci = 0; ci < crafts; ci++) {
            var rec = PN.crafting.bestAvailable(d, agent, recipes, CRAFT_OPTS);
            if (!rec) break;
            var got = PN.crafting.craft(d, agent, rec);
            if (!got) break;
            addItem(d, agent, got.itemId, got.qty);
            agent.cr = (agent.cr || 0) + 1;
          }
        }
      }
    });

    /* --- the bags ----------------------------------------------------- */
    /* Whatever they are carrying that is worth opening. This happens
       every week regardless of what they did with it, because opening
       a container is not an activity - it is a decision about
       something already in your bags. */
    openBags(d, agent, rng);

    /* Somewhere to put the next thing. Bought before the week's
       upkeep, because room in your bags is the upgrade that helps
       whatever you were going to do with the week. */
    ctx.goldSunk = (ctx.goldSunk || 0) + buyBags(d, agent) * (agent.w || 1);

    /* And whatever they have scrolled onto it. Re-picked every week
       because gear changes every week, and because a scroll that
       shipped in a patch is something everybody re-does. */
    reScroll(d, agent);

    /* --- levelling ---------------------------------------------------- */
    /* Catch-up as a speed rather than a teleport.

       Somebody levelling through content that stopped being current
       years ago goes through it fast - the gear they find is far
       ahead of the monsters, the quests hand out more than they used
       to, and everybody they meet is trying to help them. The further
       behind the current tier they are, the faster they move.

       So the early zones have people in them - just not many, and not
       for long, which is exactly what the low zones of a mature MMO
       look like. */
    var catchUp = (d.progression.catchUp || 0) / 100;
    if (catchUp > 0 && agent.lv < cap) {
      /* How far behind the top they are, 0 to 1. */
      var behind = U.clamp01(1 - (agent.lv - 1) / Math.max(1, cap - 1));
      /* Gently. Too much and they blow through the middle of the curve
         so fast that only the first zone and the cap have anybody in
         them, which is the same empty world the other way round. */
      agent.xp += agent.xp * catchUp * Math.pow(behind, 0.8) * 1.15;
    }

    /* How far anybody can climb in one week.

       The guard on this loop was forty, which is not a pace, it is a
       teleport: a new player crossed the entire middle of the curve
       inside a single tick, so every zone between the first one and
       the cap was empty on every screen that showed where people
       were. Nobody was in them because nobody was ever in them for
       longer than it takes to render a frame.

       A few levels a week is a levelling curve. Catch-up buys more of
       them, which is what catch-up is for. */
    var maxLevels = Math.max(2, Math.round(3 + catchUp * 6));
    var guard = 0;
    while (agent.lv < cap && agent.xp >= xpForLevel(d, agent.lv) &&
           guard++ < maxLevels) {
      agent.xp -= xpForLevel(d, agent.lv);
      agent.lv++;
    }
    if (agent.lv >= cap) { agent.wc++; agent.xp = Math.min(agent.xp, xpForLevel(d, cap)); }

    /* --- upkeep: repairs, consumables, vendors, auction tax ----------- */
    var gold = ctx.world.firstCurrency;
    if (gold) {
      var held = agent.cur[gold.id] || 0;
      /* The share of a week's earnings your income sinks take -
         repairs, consumables, respeccing, fast travel. Which of those
         exist, and how hard they pull, is a list you authored. */
      var sinkFraction = U.clamp01((ctx.world.money ? ctx.world.money.income : 0) *
        (0.6 + (d.economy.sinkRate / 100) * 0.9));
      var earned = agent.earnedGold || 0;
      var drain = earned * sinkFraction;
      /* What your own sinks take out of this player. Repairs and
         consumables come out of what they earned; vendor goods,
         housing and guild upkeep come out of the pile they are
         sitting on. Both are things you authored on the Economy
         screen rather than constants hidden in here. */
      var money = ctx.world.money;
      var wealthTax = money ? money.wealth : 0;
      /* Repairs used to be added again here on top of the sink rate,
         which double-charged for the same behaviour. They are one of
         the income sinks now, so this is where the pile gets taxed
         and nothing else. */
      drain += held * wealthTax;
      drain = Math.min(held, drain);
      agent.cur[gold.id] = Math.max(0, held - drain);
      ctx.goldSunk += drain * agent.w;
    }

    /* --- spend currency at the vendor, which is how catch-up gear
           actually reaches people                                    */
    buyUpgrade(d, agent, ctx);

    /* --- how did that feel? ------------------------------------------- */
    var supplyRatio = budget > 0 ? availableHours / budget : 1;
    var freshRatio = budget > 0 ? freshHours / budget : 0;
    /* What they still have left to finish - the evergreen half of how
       fresh the game feels. Unlike consumed hours this does not burn
       down when they play, only when they complete something, which is
       why a rare drop they have not had yet keeps pulling. */
    agent.chase = PN.goals.outstanding(d, agent, ctx.world.goalCat, prog);
    agent.nov = PN.novelty.novelty(state, agent.chase, freshRatio,
                                   engineHours / Math.max(0.1, budget));

    agent.gearRatio = gearRatio;
    agent.rewardValue = rewardValue;
    agent.supplyRatio = supplyRatio;
    agent.fed = budget > 0 ? U.clamp01(agent.hrs / budget) : 1;
    agent.unusedHours = Math.max(0, remaining);

    scoreAgent(state, agent, ctx);
    return agent;
  }

  /* Currency vendors are the catch-up path and the biggest sink in the
     game: they turn tokens into the gear slot nobody has dropped yet. */
  function buyUpgrade(design, agent, ctx) {
    var currencies = U.keys(agent.cur).filter(function (c) { return agent.cur[c] > 0; });
    if (!currencies.length) return false;
    /* Vendors take the currency you marked as a token. It used to be
       whichever currency was not the first one, so a second currency
       became a vendor token by accident of the order you added it. */
    var tokenCur = PN.currency.vendorToken(design);
    var token = tokenCur && agent.cur[tokenCur.id] > 0 ? tokenCur.id : null;
    if (!token) token = currencies[0];

    var pool = ctx.world.vendorGear;
    if (!pool || !pool.length) return false;
    /* Find the slot they are weakest in, judged the same way equipping is:
       a slot filled with another build's gear is a weak slot, however
       high its item level. */
    var worstSlot = null, worstVal = Infinity;
    ST.GEAR_SLOTS.forEach(function (slot) {
      var it = IT.itemById(design, agent.g[slot.id]);
      var v = it ? itemValueFor(design, agent, it) : 0;
      if (v < worstVal) { worstVal = v; worstSlot = slot.id; }
    });
    if (!worstSlot) return false;

    var mine = primaryOf(design, agent);
    var candidates = pool.filter(function (i) {
      return ST.fitsSlot(i, worstSlot) && (i.stats || {})[mine] > 0 &&
             itemValueFor(design, agent, i) > worstVal;
    });
    if (!candidates.length) return false;
    var want = candidates[0];
    var price = Math.round(want.itemLevel * 2.2);
    if ((agent.cur[token] || 0) < price) return false;

    agent.cur[token] -= price;
    ctx.goldSunk += price * agent.w * 0.2;
    equipFrom(design, agent, want.id);
    return true;
  }

  /* Returns true when the item was an actual gear upgrade. */
  function addItemTracked(design, agent, itemId, qty) {
    var it = IT.itemById(design, itemId);
    if (it && it.kind === 'gear') {
      var was = agent.g[it.slot];
      addItem(design, agent, itemId, qty);
      return agent.g[it.slot] !== was;
    }
    addItem(design, agent, itemId, qty);
    return false;
  }

  /* ------------------------------------------------------- satisfaction */
  function scoreAgent(state, agent, ctx) {
    var arch = tax.ARCHETYPE_BY_ID[agent.a];
    var band = PN.pop.bandOf(agent.b);
    var d = ctx.world.design;
    var v = {};
    tax.AXIS_IDS.forEach(function (id) { v[id] = ctx.vals[id]; });

    var skillDelta = (band.skill - 0.5);
    v.challenge = U.clamp100(v.challenge * (1 - skillDelta * 0.52));
    v.accessibility = U.clamp100(v.accessibility + skillDelta * 16);
    v.mastery = U.clamp100(v.mastery * (0.78 + band.skill * 0.44));

    /* Progression is personal: it depends on this player's own ladder. */
    var atCap = agent.lv >= d.progression.levelCap;
    var gearHeadroom = U.clamp01(1 - (agent.gearRatio || 0));
    var progMult = !atCap ? 1.0 : (0.38 + 0.62 * gearHeadroom);
    /* Rewards actually received this week feed progression directly. */
    var rewardBoost = U.saturate(agent.rewardValue || 0, 120) * 18;
    v.progression = U.clamp100(v.progression * progMult + rewardBoost);

    v.novelty = agent.nov;

    var popFactor = U.clamp(U.saturate(state.population.total, 900) * 1.25, 0.25, 1.15);
    v.social = U.clamp100(v.social * popFactor * (agent.gid ? 1.25 : 0.82));

    /* An empty bag and no gold is its own kind of unfair. */
    var gold = ctx.world.firstCurrency;
    if (gold && (agent.cur[gold.id] || 0) <= 0 && agent.lv > 5) {
      v.value = U.clamp100(v.value - 10);
    }

    /* How inflation feels, which depends entirely on who you are.

       A single population-wide penalty was wrong in both directions.
       Mild inflation is HEALTHY: it means what somebody earns this week
       buys more of what it used to, which is a newer player catching up
       on somebody who stopped playing and is sitting on a pile. The
       person it costs is the one with the pile.

       So: a player poor relative to the rest of the game likes mild
       inflation and hates deflation, because deflation is the pile
       winning. A rich player is the mirror of that. Runaway inflation
       is bad for everybody - at that point nobody can price anything
       and the new player cannot afford a repair bill either. */
    var infl = (state.economy && state.economy.inflation) || 1;
    var moneyCur = ctx.world.firstCurrency;
    if (moneyCur && state.economy) {
      var purse = (agent.cur[moneyCur.id] || 0);
      var typical = Math.max(1, state.economy.perCapita || 1);
      /* Where this player sits against the rest of the game. 0 is broke,
         0.5 is typical, 1 is sitting on several times the average. */
      var standing = U.clamp01(purse / (typical * 2));

      /* Mild inflation - up to about a quarter a year - is the healthy
         band. Past that it stops being catch-up and starts being a
         currency nobody trusts. */
      var healthy = U.clamp(1 - Math.abs(infl - 1.12) / 0.34, -1, 1);
      var runaway = Math.max(0, infl - 1.55);
      var deflating = Math.max(0, 0.9 - infl);

      /* The healthy band is worth something to the poor and costs the
         rich a little; runaway costs everybody and the rich most. */
      var feel =
        healthy * (1 - standing) * 7 -
        healthy * standing * 2 -
        runaway * (9 + standing * 14) -
        deflating * (14 * (1 - standing) - 5 * standing);

      v.value = U.clamp100(v.value + feel);
      v.fairness = U.clamp100(v.fairness - runaway * 10);
      agent.inflFeel = feel;
    }

    var total = 0, detail = {};
    tax.AXIS_IDS.forEach(function (id) {
      var def = tax.AXIS_BY_ID[id], ideal = arch.ideals[id], val = v[id];
      var gap = val >= ideal ? (val - ideal) * def.over : (ideal - val) * def.under;
      var s = U.clamp100(100 - gap);
      detail[id] = { value: val, ideal: ideal, score: s, weight: arch.weights[id],
                     contribution: s * arch.weights[id] };
      total += s * arch.weights[id];
    });
    agent.axisScores = detail;
    /* How much a badly built game COSTS you, which is not the same in
       every decade. In 1999 an MMO was the only MMO anybody had: you
       could build it wrong and people stayed, because there was
       nowhere else to go. By 2010 they had alternatives and had
       learned to leave, and by 2028 they leave for almost nothing.

       Only the downside scales. Building something good is worth the
       same in any decade - what changes is whether building it badly
       costs you anything, which is the thing a forgiving era forgives. */
    var era = state.era || {};
    var weight = era.designWeight === undefined ? 1 : era.designWeight;
    agent.sat = U.clamp100(100 - (100 - total) * weight);
    return agent.sat;
  }

  /* -------------------------------------------------------------- churn */
  function churnChance(state, agent, ctx) {
    var arch = tax.ARCHETYPE_BY_ID[agent.a];
    var d = ctx.world.design;
    var satMult = U.clamp(0.30 + 2.60 * (1 - U.sigmoid(agent.sat, 62, 12)), 0.30, 3.40);
    var rate = arch.churn * satMult;
    var tenureMult = 1.85 * Math.exp(-agent.t / 11) + 0.62;
    rate *= tenureMult;

    /* Guilds are the strongest retention system in the genre. */
    if (agent.gid) {
      var g = PN.guilds.byId(state, agent.gid);
      if (g) rate *= U.clamp(1 - g.cohesion * 0.45, 0.4, 1);
    }
    rate += ctx.lastChurnRate * arch.social * 0.30;
    /* Somebody else launched a game for people like them, and it is
       still new. This is what a rival launch costs you now - a couple
       of months of people trying it - rather than a third of them
       deleted in the tick it shipped. */
    rate *= 1 + (ctx.rivalPull ? (ctx.rivalPull[agent.a] || 0) : 0) * 0.85;
    if (agent.supplyRatio < 0.45) rate *= 1 + (0.45 - agent.supplyRatio) * 1.5;
    return U.clamp(rate, 0.002, 0.62);
  }

  /* Where this purse sits on the wealth ladder, 0 to 1, squared so
     that being merely above average is not the same as being one of
     the people who can simply buy whatever they want. */
  function wealthRank(ladder, purse) {
    if (!ladder || ladder.length < 4) return 0;
    var lo = 0, hi = ladder.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (ladder[mid] < purse) lo = mid + 1; else hi = mid;
    }
    var pct = lo / (ladder.length - 1);
    return U.clamp01(pct * pct);
  }

  /* ------------------------------------------------------ consumables --

     A potion that is never drunk is not a consumable, it is a souvenir.
     Nothing in the simulation ever opened a player's bags, so every
     flask anybody looted or crafted sat there forever: no benefit to
     carrying them, no reason to make them, and no sink for the reagents
     that go into them. Alchemy was a profession that produced litter.

     So: before hard content, a player drinks what they have. Being
     prepared makes the pull go better and feels like competence;
     turning up to a raid with an empty bag does not, and that is what
     makes somebody go and buy a flask off the auction house.        */

  /* What a consumable is worth to somebody about to do something hard.
     Priced off the effect the player authored, not off a tag. */
  /* Every consumable, broken into what it actually does - so a player
     can be asked whether THIS one is any use to THEM.

     The old version added up the effect magnitudes and stopped there, so
     an Intellect flask was exactly as good to a Strength build as a
     Strength flask was. A potion is only worth drinking if it buffs the
     stat you gear around, restores the resource your kit spends, or
     heals - and healing is the one thing that is worth the same to
     everybody. */
  var consumablesOf = U.memoDesign(function (design) {
    var out = [];
    (design.items || []).forEach(function (it) {
      if (it.kind !== 'consumable') return;
      var univ = 0;                 /* worth the same to anybody */
      var byStat = {};              /* worth something only to some builds */
      var resource = 0;             /* only if your kit spends one */
      /* What a container pays out, by the kind of thing it pays out
         in. A bag of ore is worth a great deal to somebody levelling
         a profession and nothing at all to a raider who buys their
         materials; a bag that opens the raid table is the other way
         round. Neither was worth anything to anybody before, because
         opening a loot table was not read here at all. */
      var byKind = { gear: 0, materials: 0, currency: 0, cosmetic: 0 };
      var opens = [];
      var xp = 0;
      (it.effects || []).forEach(function (e) {
        if (e.type === 'restoreHealth') univ += U.saturate(e.amount || 0, 400) * 1.0;
        else if (e.type === 'removeDebuff') univ += 0.5;
        else if (e.type === 'teleport') univ += 0.3;
        else if (e.type === 'buffPower') univ += U.saturate(e.amount || 0, 60) * 1.3;
        else if (e.type === 'restoreResource') resource += U.saturate(e.amount || 0, 400) * 0.9;
        else if (e.type === 'grantXp') xp += e.amount || 0;
        else if (e.type === 'openLoot') {
          var table = PN.items.lootById(design, e.lootTableId);
          if (!table) return;          /* a container with nothing in it */
          opens.push(e.lootTableId);
          var pay = PN.places.tableValue(design, table);
          PN.places.REWARD_KINDS.forEach(function (k) {
            byKind[k] += pay[k] || 0; });
          byKind.top = Math.max(byKind.top || 0, pay.top || 0);
        }
        else if (e.type === 'buffStat') {
          var amount = U.saturate(e.amount || 0, 60) * 1.4;
          if (e.stat) byStat[e.stat] = (byStat[e.stat] || 0) + amount;
          /* A buff with no stat chosen is a buff to nothing. */
        }
      });
      var container = opens.length > 0 || xp > 0;
      if (univ <= 0 && resource <= 0 && !U.keys(byStat).length && !container) return;
      out.push({ id: it.id, item: it, universal: U.clamp01(univ),
                 byStat: byStat, resource: U.clamp01(resource),
                 /* A container is opened when somebody wants what is
                    in it, not drunk before a boss pull. */
                 byKind: byKind, opens: opens, xp: xp, container: container });
    });
    return out;
  });

  /* Does this build spend a resource at all? A cooldown kit does not,
     so a mana potion is a vendor item to them. */
  function usesResource(design, agent) {
    var build = agent.bld ? U.byId(PN.builds.enumerate(design), agent.bld) : null;
    var res = build && build.resource ? build.resource
            : (design.combatMath || {}).resourceModel;
    return !!res && res !== 'none' && res !== 'cooldown';
  }

  /* What this particular consumable is worth to this particular player.
     0 to 1. An Intellect flask in a Strength build's bag is a souvenir. */
  function worthTo(design, agent, c) {
    var mine = primaryOf(design, agent);
    var stat = 0;
    U.keys(c.byStat).forEach(function (s) {
      /* Your own primary is the whole point of the flask. Stamina keeps
         everybody alive, so it is worth something to anyone. */
      if (s === mine) stat += c.byStat[s];
      else if (s === ((design.stats || {}).stamina || {}).id) stat += c.byStat[s] * 0.45;
      else if (s === ((design.stats || {}).armour || {}).id) stat += c.byStat[s] * 0.30;
      else stat += c.byStat[s] * 0.04;     /* somebody else's stat */
    });
    var res = (agent.__usesRes === undefined
      ? (agent.__usesRes = usesResource(design, agent))
      : agent.__usesRes) ? c.resource : c.resource * 0.05;
    return U.clamp01(c.universal + stat + res);
  }

  /* What a CONTAINER is worth to this player - a bag of ore, a cache
     that opens the raid table, a tome of experience.

     This is a different question from what a flask is worth. A flask
     is worth what it does to your character for the next hour; a bag
     is worth what is inside it TO YOU. Somebody levelling a profession
     wants the ore and would not cross the road for the gear; somebody
     chasing best-in-slot is the exact opposite; and a tome of
     experience is worth nothing at all at the cap. */
  function containerWorth(design, agent, c) {
    if (!c.container) return 0;
    var wants = agent.__wants;
    if (!wants) return 0;
    var v = 0;
    PN.places.REWARD_KINDS.forEach(function (k) {
      var payout = c.byKind[k] || 0;
      if (payout <= 0) return;
      /* How good a drop this is, on the same 0-100 scale every single
         item in the game is priced on.

         The obvious yardstick - the richest ACTIVITY that pays in this
         kind - is the wrong one: that is a whole week of a dungeon's
         output, and one bag against a week of raiding reads as
         nothing however good the bag is. A container is one drop, so
         it is measured against what one good drop is worth. */
      v += U.clamp01(payout / 70) * (wants[k] || 0);
    });
    /* Experience, worth what is left of the climb. */
    if (c.xp > 0) {
      var cap = design.progression.levelCap || 1;
      var left = U.clamp01(1 - ((agent.lv || 1) - 1) / Math.max(1, cap - 1));
      var oneLevel = xpForLevel(design, U.clamp(agent.lv || 1, 1, Math.max(1, cap - 1)));
      v += U.clamp01(c.xp / Math.max(1, oneLevel)) * left * 0.9;
    }
    return U.clamp01(v);
  }

  /* Open the containers somebody actually wants opened.

     A bag of materials is not something you drink before a boss pull,
     which is the only moment the old code ever reached into a player's
     bags - so a crafter carried their ore around for ever. A container
     is opened when the person holding it wants what is in it, in the
     week they decide that, and what falls out goes into their bags
     like any other drop. */
  function openBags(design, agent, rng) {
    var pool = consumablesOf(design);
    if (!pool.length) return 0;
    var opened = 0;
    for (var i = 0; i < pool.length; i++) {
      var c = pool[i];
      if (!c.container) continue;
      var have = (agent.inv || {})[c.id] || 0;
      if (have <= 0) continue;
      var worth = containerWorth(design, agent, c);
      /* Nobody opens a bag of somebody else's reagents. They sell it,
         which is what the auction house is for. */
      if (worth < 0.12) continue;
      /* The keener they are, the more of the stack they get through. */
      var take = Math.max(1, Math.min(have, Math.round(have * (0.25 + worth * 0.75))));
      agent.inv[c.id] -= take;
      if (agent.inv[c.id] <= 0) delete agent.inv[c.id];
      for (var n = 0; n < take && n < 12; n++) {
        c.opens.forEach(function (tid) {
          PN.items.rollLoot(design, PN.items.lootById(design, tid), rng, 0,
            { prefer: primaryOf(design, agent) })
            .forEach(function (x) { addItem(design, agent, x.itemId, x.qty); });
        });
        if (c.xp > 0 && (agent.lv || 1) < (design.progression.levelCap || 1)) {
          agent.xp = (agent.xp || 0) + c.xp;
        }
      }
      agent.drank = (agent.drank || 0) + take;
      opened += take;
    }
    return opened;
  }

  /* Drink what the bag holds, best first - and "best" means best FOR
     THEM. Returns how well supplied this player was, 0 to 1. */
  function drinkUp(d, agent, hours, demand) {
    var pool = consumablesOf(d);
    if (!pool.length || hours <= 0) return 0;
    /* Roughly one consumable per hour of hard content, scaled by how
       demanding your design says that content is. */
    var want = Math.max(1, Math.round(hours * 0.5 * demand));

    /* Rank this player's own bag, not a global list. */
    var mine = [];
    for (var p = 0; p < pool.length; p++) {
      /* A container is not preparation. Opening a bag of ore on the
         way into a raid does nothing for the pull, and treating one as
         a flask meant the only players who ever opened anything were
         the ones about to fight a boss. They are handled in openBags. */
      if (pool[p].container) continue;
      var have = (agent.inv || {})[pool[p].id] || 0;
      if (have <= 0) continue;
      var w = worthTo(d, agent, pool[p]);
      /* Nobody drinks somebody else's stat flask before a raid. */
      if (w < 0.08) continue;
      mine.push({ id: pool[p].id, worth: w, have: have });
    }
    if (!mine.length) return 0;
    mine.sort(function (a, b) { return b.worth - a.worth; });

    var got = 0, quality = 0;
    for (var i = 0; i < mine.length && got < want; i++) {
      var take = Math.min(mine[i].have, want - got);
      agent.inv[mine[i].id] -= take;
      if (agent.inv[mine[i].id] <= 0) delete agent.inv[mine[i].id];
      quality += mine[i].worth * take;
      got += take;
    }
    if (!got) return 0;
    agent.drank = (agent.drank || 0) + got;
    return U.clamp01((got / want) * (quality / got));
  }

  /* ------------------------------------------------------------- spend
     Itemised, so every penny is explainable. A subscription-only game
     with no cash shop charges exactly the subscription and nothing
     else - there is no mystery elastic term.                       */
  function spendFor(state, agent, ctx) {
    var d = ctx.world.design, M = d.monetisation;
    var arch = tax.ARCHETYPE_BY_ID[agent.a];
    var bizModel = PN.prim.find(PN.prim.BUSINESS_MODELS, M.model);
    var idx = PN.pop.SPEND_INDEX[agent.a] || 1;
    var satMult = 0.45 + (agent.sat / 100) * 1.05;
    var parts = { subscription: 0, box: 0, shop: 0, pass: 0 };

    /* 1. Subscription. Exact. In a subscription game an unhappy player
          does not pay less - they unsubscribe, which is churn.      */
    if (M.model === 'sub' || M.model === 'hybrid') {
      var onTrial = agent.t < 2 && state.era.f2pNorm > 0.3;
      if (!onTrial) parts.subscription = M.subPrice / 4.33;
    }

    /* 2. Box and expansion sales, amortised across the two years the
          average player owns them.                                  */
    if (M.model === 'boxExp' || M.model === 'hybrid') {
      /* The box itself, amortised across the two years the average
         player owns it. Expansions are charged separately, below,
         when one actually goes on sale. */
      parts.box = (M.boxPrice || 0) / 104;
    }

    /* 2b. The expansion on the shelf.

          An expansion is bought once, by a player who decides for
          themselves, and then it is theirs. The studio used to book the
          whole box take into the bank the week it shipped without a
          single account being charged, which is why the player screen
          showed nobody paying for a thing everybody apparently bought.

          Who buys: people still enjoying the game, mostly. Somebody on
          their way out does not buy the next expansion, and that is the
          honest reason an expansion sells badly into a soured playerbase.

          The charge is spread the way the battle pass is, so one week of
          revenue does not spike on a purchase people made once. */
    var sale = state.expansionSale;
    if (sale && sale.price > 0) {
      if (agent.expSeen !== sale.id) {
        agent.expSeen = sale.id;
        /* Brand-new players are buying the current game, not last
           month's expansion - they are already counted in the box. */
        if ((agent.t || 0) >= 2) {
          var keen = U.clamp01(
            0.30 + (agent.sat - 45) / 110 +
            (arch.appeal.raid + arch.appeal.levelling) * 0.18
          ) * idx;
          if (ctx.rng ? ctx.rng.chance(keen) : Math.random() < keen) {
            agent.expOwed = sale.price;
            agent.expWeeksLeft = 8;
            agent.expOwned = (agent.expOwned || 0) + 1;
          }
        }
      }
      if (agent.expOwed > 0 && agent.expWeeksLeft > 0) {
        var expPay = Math.min(agent.expOwed, sale.price / 8);
        parts.box += expPay;
        agent.expOwed -= expPay;
        agent.expWeeksLeft--;
      }
    }

    /* 3. Cash shop. Zero if you do not have one. Otherwise it is the
          chance this player buys each category this week, times its
          price.                                                     */
    var premium = bizModel.tags.indexOf('premium') >= 0;
    var shopDrive = 0;
    (M.shop || []).forEach(function (s) {
      if (!s.enabled) return;
      var def = PN.prim.SHOP_BY_ID[s.catId]; if (!def) return;
      var catAppeal = def.cats.length
        ? U.avg(def.cats, function (c) { return arch.appeal[c]; }) : 0.5;
      var weeklyChance = def.appeal * (0.15 + (s.prominence / 100) * 0.85) *
                         (0.35 + catAppeal) * 0.02;
      shopDrive += weeklyChance * (s.price || def.price || 10);
    });
    shopDrive *= idx * satMult * (0.55 + state.era.f2pNorm * 0.9);
    /* People who already pay a subscription buy far less from a shop. */
    if (premium) shopDrive *= 0.45;
    parts.shop = shopDrive;
    /* 4. Battle pass. Whether this player bought in is decided once per
          season and then remembered, because owning the pass is what
          entitles them to the premium track - a rate spread over the
          weeks bought nobody anything.

          What makes it worth buying is what the premium track adds OVER
          the free one. A pass whose free track already gives you most of
          it is a pass nobody needs.                                  */
    if (M.battlePass.enabled && (M.battlePass.tiers || []).length) {
      var premium = 0, free = 0;
      M.battlePass.tiers.forEach(function (t) {
        premium += IT.rewardValue(d, IT.rewardById(d, t.premiumRewardId));
        free += IT.rewardValue(d, IT.rewardById(d, t.freeRewardId));
      });
      var uplift = Math.max(0, premium - free * 0.35);
      var attractive = U.clamp01(uplift / 700) * 0.5 + (M.battlePass.fomo / 100) * 0.25;
      var buyRate = U.clamp01((0.10 + attractive) * idx * satMult * 0.9);
      /* One decision per season: they either buy in or they do not, and
         owning it is what entitles them to the premium track.

         The CHARGE is then spread across the season rather than landing
         in one week. A pass is bought once, but showing its whole price
         as a single week's spend makes a player look like a whale for
         one week and a free rider for eleven, and makes weekly revenue
         spike on nothing. Amortised, it reads the way a subscription
         does and totals to exactly the same money. */
      var seasonWeeks = Math.max(1, M.battlePass.seasonWeeks || 12);
      if (!agent.passOwned && agent.passDecided !== agent.passSeason &&
          agent.passSeason !== undefined) {
        agent.passDecided = agent.passSeason;
        if (ctx.rng ? ctx.rng.chance(buyRate) : Math.random() < buyRate) {
          agent.passOwned = true;
          agent.passOwed = M.battlePass.price;
          agent.passWeeksLeft = seasonWeeks;
        }
      }
      if (agent.passOwed > 0 && agent.passWeeksLeft > 0) {
        var instalment = Math.min(agent.passOwed, M.battlePass.price / seasonWeeks);
        parts.pass = instalment;
        agent.passOwed -= instalment;
        agent.passWeeksLeft--;
      }
    }


    var per = parts.subscription + parts.box + parts.shop + parts.pass;
    agent.sp += per;
    agent.spendParts = parts;
    return per;
  }

  /* ============================================================== NAMES
     Simulated players get names because a spreadsheet row is not a
     person and a character sheet needs one at the top.             */
  var NAME_PARTS = {
    fantasy: {
      a: ['Aer', 'Bel', 'Cor', 'Dun', 'Eld', 'Fen', 'Gor', 'Hal', 'Ith', 'Kael',
          'Lor', 'Mor', 'Nyx', 'Oro', 'Per', 'Quen', 'Rho', 'Syl', 'Thal', 'Vor'],
      b: ['an', 'ric', 'wyn', 'dor', 'iel', 'mir', 'grim', 'thas', 'ana', 'oth',
          'ara', 'ion', 'ysse', 'ok', 'ella', 'ux'],
      tags: ['thebold', 'xX', 'shadow', 'the3rd', 'ofthevale', '99', 'pls', 'main']
    },
    scifi: {
      a: ['Ax', 'Bry', 'Cy', 'Dex', 'Eko', 'Fly', 'Gav', 'Hex', 'Ion', 'Jax',
          'Kes', 'Lux', 'Mav', 'Nyx', 'Orb', 'Pax', 'Quill', 'Riv', 'Syn', 'Vex'],
      b: ['ir', 'on', 'ex', 'ara', 'os', 'ik', 'ell', 'yn', 'ova', 'ax',
          'ide', 'ur', 'een', 'is'],
      tags: ['prime', '_01', 'actual', 'dot', 'zero', 'ttv', 'x', 'vii']
    },
    cosy: {
      a: ['Bram', 'Clover', 'Dill', 'Fig', 'Hazel', 'Juni', 'Kip', 'Lark',
          'Mossy', 'Nutmeg', 'Olive', 'Pip', 'Quill', 'Rye', 'Sage', 'Tilly'],
      b: ['berry', 'bug', 'foot', 'whisker', 'bloom', 'patch', 'thistle', 'down',
          'puff', 'leaf', 'sprout', 'bell'],
      tags: ['uwu', 'zzz', 'plz', 'cosy', 'nap', 'tea', 'bee', 'moo']
    }
  };

  function nameStyleFor(design) {
    var setting = design.identity ? design.identity.setting : 'highFantasy';
    if (setting === 'sciFi' || setting === 'spaceOpera' || setting === 'postApoc' ||
        setting === 'superhero' || setting === 'modernOccult') return 'scifi';
    if (setting === 'creature' || setting === 'cozy') return 'cosy';
    return 'fantasy';
  }

  function makeName(rng, style) {
    var p = NAME_PARTS[style] || NAME_PARTS.fantasy;
    var name = rng.pick(p.a) + rng.pick(p.b);
    /* Not everybody picks a tasteful name. */
    var roll = rng.next();
    if (roll < 0.12) name += rng.pick(p.tags);
    else if (roll < 0.18) name = name + rng.int(2, 99);
    else if (roll < 0.21) name = name.toLowerCase();
    return name;
  }

  /* ============================================================ THE TICK */

  function tickAll(state, ctx) {
    var agents = state.agents;
    var out = { left: 0, revenue: 0, hours: 0, questsDone: 0, bossKills: 0,
                satSum: 0, satW: 0, dungeonRuns: 0 };
    ctx.goldSunk = 0;
    ctx.goldMade = 0;

    for (var i = agents.length - 1; i >= 0; i--) {
      var a = agents[i];
      tickAgent(state, a, ctx);
      out.hours += a.hrs * a.w;
      out.questsDone += a.qd * 0;   /* qd is cumulative; weekly delta tracked below */
      out.satSum += a.sat * a.w; out.satW += a.w;
      out.bossKills += 0;
      out.dungeonRuns += 0;

      var rate = churnChance(state, a, ctx);

      /* A row is not a player. Past the roster cap it stands for as
         many as its weight says - hundreds, in a game of sixty
         thousand - and rolling ONE coin for the whole crowd meant an
         unlucky roll took three hundred people out of the game at
         once. A handful of those in the same week is a playerbase
         falling off a cliff with nothing on any screen to explain it:
         satisfaction steady, sentiment steady, and half the game gone
         between one Tuesday and the next.

         So a crowd churns at its rate. The share of it that leaves
         leaves, the row stays for the rest, and the week's losses come
         out smooth - which is what a churn rate means. The last player
         in a row is still a coin flip, because at that point the row
         IS one player. */
      var quit = a.w * rate;
      var whole = Math.floor(quit);
      if (ctx.rng.chance(quit - whole)) whole += 1;
      if (whole > 0 && whole < a.w - 1e-6) {
        PN.expansions.addLapsed(state, a.a, whole);
        a.w -= whole;
        out.left += whole;
      } else if (whole > 0) {
        if (a.gid) PN.guilds.leave(state, a);
        /* Nobody vanishes. They lapse, and can be won back. */
        PN.expansions.addLapsed(state, a.a, a.w);
        /* Somebody you were following leaving is news, and the whole
           point of following them. A favourite can quit like anybody
           else - being watched is not protection from a bad patch. */
        if (state.favourites && state.favourites[a.id]) {
          delete state.favourites[a.id];
          PN.state.log(state, 'player',
            (a.nm || 'A player you followed') + ' has quit',
            'After ' + a.t + ' week' + (a.t === 1 ? '' : 's') + ' at level ' + a.lv +
            ', satisfaction ' + Math.round(a.sat || 0) + '. ' +
            (a.gid ? 'They were in a guild. ' : 'They were never in a guild. ') +
            'Removed from your followed players.',
            { agent: a.id });
        }
        agents.splice(i, 1);
        out.left += a.w;
        continue;
      }
      a.t++;
      /* The pass pays out before the spend decision, so a player who is
         about to buy has already seen what the free track gave them. */
      out.passValue = (out.passValue || 0) +
        tickBattlePass(state, ctx.world.design, a, ctx.rng) * a.w;
      a.lastSpend = spendFor(state, a, ctx);
      out.revenue += a.lastSpend * a.w;
    }
    out.meanSat = out.satW > 0 ? out.satSum / out.satW : 50;
    return out;
  }

  /* Keep the roster bounded, and keep it stable.

     This used to keep a RANDOM sample past the cap, which meant the
     people you were following were silently swapped for different people
     every time the population grew - you would open the Players screen
     and none of last week's names were there. Nobody had quit; the
     sample had been reshuffled underneath you.

     Now the roster is stable: the same names come back week to week,
     the overflow is whoever arrived most recently, and a name leaves
     the list when that player churns out and at no other time. What
     the roster is a sample OF is the question below.               */

  /* Rows are worth nothing to an audience with nobody in it, and a
     small audience rounded to zero rows disappears from every screen in
     the game. So every archetype with players in it gets at least this
     share of the roster, if it has that many people. */
  var MIN_ARCH_ROWS = 0.015;

  function compact(state, rng) {
    var agents = state.agents;
    if (agents.length <= MAX_AGENTS) return 0;
    var before = agents.length;
    var total = U.sum(agents, function (a) { return a.w; });
    if (total <= 0) return 0;

    var cap = (state.design && state.design.progression &&
               state.design.progression.levelCap) || 60;
    var live = PN.sim.live(state);
    if (live && live.progression) cap = live.progression.levelCap || cap;
    var favs = state.favourites || {};

    /* ---------------------------------------------- who the sample is of

       The roster used to be stratified by LEVEL and ranked by tenure,
       and then every survivor's weight was scaled up by one number to
       put the missing population back. Both halves of that are a
       sampler with an opinion: a raider plays twenty-six hours a week
       and is at the cap within a month, a drifter plays six and may
       never get there - so week after week the drifters were the rows
       that got dropped, and their players were handed to the raiders
       who stayed.

       Nothing about the game caused it. Admitting the exact market mix
       and doing nothing else turned an audience that was 12% raiders
       into one that was 54% raiders inside forty compactions, and
       drifters - the biggest slice of the real market - went to zero.
       That is what was behind a game reading as 63% progressors while
       the Market screen said its appeal was near enough even, and
       behind a playerbase that could fall off a cliff when a handful
       of thousand-player rows happened to roll the same way.

       So the roster is sampled PER ARCHETYPE, and each archetype's
       survivors carry that archetype's players. The sample then has
       the same people in it as the population, in the same
       proportions, which is the only thing a sample is for.        */
    var groups = {}, order = [];
    agents.forEach(function (a) {
      var g = groups[a.a];
      if (!g) { g = groups[a.a] = { id: a.a, rows: [], w: 0 }; order.push(g); }
      g.rows.push(a); g.w += a.w;
    });

    /* Rows in proportion to players, with a floor for the small
       audiences and never more rows than an audience has people. */
    var floorRows = Math.max(1, Math.round(MAX_AGENTS * MIN_ARCH_ROWS));
    var claimed = 0;
    order.forEach(function (g) {
      var want = Math.round(MAX_AGENTS * (g.w / total));
      g.rows_ = Math.min(g.rows.length, Math.ceil(g.w),
                         Math.max(want, floorRows));
      claimed += g.rows_;
    });
    /* Floors and rounding will not add up to the roster. Settle the
       difference against the biggest audiences, where one row stands
       for the fewest extra people. */
    var slack = MAX_AGENTS - claimed;
    var bySize = order.slice().sort(function (a, b) { return b.w - a.w; });
    for (var pass = 0; pass < 4 && Math.abs(slack) > 0; pass++) {
      for (var gi = 0; gi < bySize.length && slack !== 0; gi++) {
        var g2 = bySize[gi];
        if (slack > 0) {
          var room = Math.min(slack, g2.rows.length - g2.rows_);
          g2.rows_ += room; slack -= room;
        } else if (g2.rows_ > floorRows) {
          var take = Math.min(-slack, g2.rows_ - floorRows);
          g2.rows_ -= take; slack += take;
        }
      }
    }

    var kept = [];
    order.forEach(function (g) {
      var keep = pickRoster(g.rows, g.rows_, cap, favs);
      var keptW = U.sum(keep, function (a) { return a.w; });
      /* This archetype's players ride on this archetype's rows. */
      if (keptW > 0) {
        var scale = g.w / keptW;
        keep.forEach(function (a) { a.w *= scale; });
      }
      kept = kept.concat(keep);
    });
    if (!kept.length) return 0;
    state.agents = kept;
    return before - kept.length;
  }

  /* Which rows of one audience stay on the roster.

     Most of it is the established population, longest tenured first,
     and a reserved share is whoever is still on their way up - sampled
     across the levelling curve so every band of it has somebody
     standing in it, because a game whose low zones are empty on every
     screen is a game whose low zones look abandoned. Favourites and
     ladder regulars are never dropped to make room: somebody you asked
     to follow has to still be there next week, and a regular has to be
     there for the season they are about to queue for. They can still
     quit - churn does not care who is watching. */
  function pickRoster(rows, want, cap, favs) {
    if (rows.length <= want) return rows.slice();
    var pinned = [], levelling = [], settled = [];
    rows.forEach(function (a) {
      if (favs[a.id] || (a.ladderVet || 0) > 0) { pinned.push(a); return; }
      if ((a.lv || 1) < cap) levelling.push(a); else settled.push(a);
    });
    if (pinned.length > want) {
      pinned.sort(function (a, b) {
        return (favs[b.id] ? 1 : 0) - (favs[a.id] ? 1 : 0) ||
               (b.ladderVet || 0) - (a.ladderVet || 0) ||
               (a.ladderBest || 1e9) - (b.ladderBest || 1e9);
      });
      pinned.length = want;
      return pinned;
    }

    var total = U.sum(rows, function (a) { return a.w; });
    var levW = U.sum(levelling, function (a) { return a.w; });
    /* Share of the population understates how much of the roster the
       climb needs - a new player weighs one and a veteran weighs
       fifteen - so heads count too, and it is a FLOOR rather than a
       ceiling: a game whose players are mostly still on their way up
       has no settled population to fill the rest with. */
    var byHead = rows.length > 0 ? levelling.length / rows.length : 0;
    var byWeight = total > 0 ? levW / total : 0;
    var share = U.clamp(Math.max(byWeight, byHead * 0.6), 0.12, 0.5);
    var budget = Math.max(0, want - pinned.length);
    var levSlots = Math.min(levelling.length,
      Math.max(Math.round(budget * share), budget - settled.length));

    /* Spread those slots across the levelling curve BY BAND. Sampling
       the sorted list evenly does not work: almost everybody still
       levelling is in the first few levels, because that is where the
       intake arrives, so an even sample is almost entirely beginners
       and every zone above the first stays empty. */
    var BANDS = 8;
    var buckets = [];
    for (var bi = 0; bi < BANDS; bi++) buckets.push([]);
    levelling.forEach(function (a) {
      var f = U.clamp01(((a.lv || 1) - 1) / Math.max(1, cap - 1));
      buckets[Math.min(BANDS - 1, Math.floor(f * BANDS))].push(a);
    });
    /* One from each band in turn until the slots run out, taking each
       band's people in the order they were already in - so the same
       names come back week after week and a newcomer waits behind the
       people already on the list rather than replacing one. */
    var keptLev = [], seat = [];
    for (var z = 0; z < BANDS; z++) seat.push(0);
    var dealt = true;
    while (keptLev.length < levSlots && dealt) {
      dealt = false;
      for (var bj = 0; bj < BANDS && keptLev.length < levSlots; bj++) {
        var b2 = buckets[bj];
        if (seat[bj] < b2.length) { keptLev.push(b2[seat[bj]++]); dealt = true; }
      }
    }

    var ranked = settled.slice().sort(function (a, b) {
      return (b.t || 0) - (a.t || 0) || (b.lv || 0) - (a.lv || 0) || a.id - b.id;
    });
    return pinned.concat(keptLev,
      ranked.slice(0, Math.max(0, budget - keptLev.length)));
  }

  /* The other direction.

     Once a game has been over the cap, its agents carry more than one
     player each - and they went on carrying it long after the population
     came back down, so a game of three thousand was still being shown
     through agents standing in for two people apiece.

     When there is room on the roster again, the heaviest agents split
     back into individuals. The player who splits off is a new person
     with their own name, at the same level and tenure as the crowd they
     came out of - which is exactly what they were: somebody who had been
     playing all along without a row of their own.                    */
  function individuate(state, rng) {
    var agents = state.agents;
    var room = MAX_AGENTS - agents.length;
    if (room <= 0) return 0;
    /* A little at a time: this is presentation catching up with the
       simulation, not an event. */
    var budget = Math.min(room, 120);
    var made = 0;
    var d = PN.sim.live(state) || state.design;
    /* Heaviest first. Walking the list in order split whichever rows
       happened to come early, so the rows carrying a thousand players
       each were never the ones that got broken up - and those are
       exactly the rows worth breaking up, because a row that heavy is
       both the least readable thing on the Players screen and the one
       whose luck moves the population most. */
    var heavy = agents.filter(function (a) { return a.w >= 1.85; })
      .sort(function (a, b) { return b.w - a.w; });
    for (var i = 0; i < heavy.length && budget > 0; i++) {
      var a = heavy[i];
      var half = a.w / 2;
      var b = U.clone(a);
      b.id = allocId(state);
      b.nm = makeName(rng, nameStyleFor(d));
      b.seed = rng.int(1, 1e9);
      a.w = half; b.w = half;
      agents.push(b);
      budget--; made++;
    }
    return made;
  }

  /* Everything on an agent that is recomputed every tick and therefore
     never needs saving.                                             */
  function slim(a) {
    return { id: a.id, nm: a.nm, a: a.a, b: a.b, cls: a.cls, bld: a.bld, role: a.role, primaryId: a.primaryId,
             lastAct: a.lastAct,
             lv: a.lv, xp: a.xp, g: a.g, inv: a.inv, bags: a.bags, cur: a.cur, gid: a.gid,
             t: a.t, wc: a.wc, sat: a.sat, nov: a.nov, con: a.con,
             qd: a.qd, bk: a.bk, dr: a.dr, cr: a.cr, known: a.known, pity: a.pity, sp: a.sp,
             /* How the week actually split, so the world view can place
                somebody in proportion rather than by their biggest block. */
             actHrs: a.actHrs,
             /* Which scroll is on which piece. */
             ench: a.ench,
             sub: a.sub, w: a.w, seed: a.seed,
             /* Things a player EARNED. These were being thrown away on
                every save, which wiped the whole PvP ladder, re-charged
                everybody for an expansion they already owned, and lost
                the income figure the auction house reads wealth from. */
             pvpWeeks: a.pvpWeeks, pvpWins: a.pvpWins, pvpLosses: a.pvpLosses,
             /* How many seasons running they finished in the top half,
                and the best rank they ever held. This is what makes a
                leaderboard have regulars on it. */
             ladderVet: a.ladderVet, ladderBest: a.ladderBest,
             income: a.income, drank: a.drank, rich: a.rich,
             expSeen: a.expSeen, expOwned: a.expOwned,
             expOwed: a.expOwed, expWeeksLeft: a.expWeeksLeft,
             passSeason: a.passSeason, passOwned: a.passOwned,
             passDecided: a.passDecided, passOwed: a.passOwed,
             passWeeksLeft: a.passWeeksLeft };
  }

  /* New arrivals become real agents. */
  function admit(state, archId, count, ctx) {
    var added = 0;
    var weight = 1;
    var projected = state.agents.length + count;
    if (projected > MAX_AGENTS) weight = Math.max(1, Math.ceil(projected / MAX_AGENTS));

    var n = Math.round(count / weight);
    for (var i = 0; i < n; i++) {
      var band = ctx.rng.weighted(tax.SKILL_BANDS, function (b) { return b.share; });
      var a = spawn(state, archId, band.id, ctx.rng, ctx);
      a.w = weight;
      /* Catch-up used to TELEPORT a new player most of the way up the
         levelling curve, so in any game with it turned on the early
         zones you built stood empty for ever: nobody was ever in them
         because nobody ever started there.

         Catch-up is not a level, it is a SPEED. A new player starts at
         level one like everybody did, and moves through the content
         that is no longer current much faster than the people who were
         there at the time - which is what catch-up means in a real MMO
         and what makes the low zones quiet rather than deserted. */
      state.agents.push(a);
      PN.guilds.maybeJoin(state, a, ctx);
      added += weight;
    }
    return added;
  }

  /* --------------------------------------------------- UI aggregation -- */

  /* Roll agents back up into archetype x band cohorts for the existing
     telemetry views.                                                   */
  function aggregate(state) {
    var map = {};
    tax.ARCHETYPES.forEach(function (a) {
      tax.SKILL_BANDS.forEach(function (b) {
        map[a.id + ':' + b.id] = {
          key: a.id + ':' + b.id, arch: a.id, band: b.id,
          size: 0, satisfaction: 0, novelty: 0, hoursPlayed: 0, spendWeek: 0,
          level: 0, gearRatio: 0, lastChurn: 0, tenure: 0, supplyRatio: 0,
          axisScores: {}, budget: 0, _w: 0
        };
      });
    });
    state.agents.forEach(function (a) {
      var c = map[a.a + ':' + a.b];
      if (!c) return;
      var w = a.w;
      c.size += w; c._w += w;
      c.satisfaction += a.sat * w;
      c.novelty += a.nov * w;
      c.hoursPlayed += a.hrs * w;
      c.spendWeek += (a.lastSpend || 0) * w;
      c.level += a.lv * w;
      c.gearRatio += (a.gearRatio || 0) * w;
      c.tenure += a.t * w;
      c.supplyRatio += (a.supplyRatio || 0) * w;
      if (a.axisScores && !U.keys(c.axisScores).length) c.axisScores = a.axisScores;
    });
    var list = [];
    U.keys(map).forEach(function (k) {
      var c = map[k];
      if (c._w > 0) {
        c.satisfaction /= c._w; c.novelty /= c._w; c.hoursPlayed /= c._w;
        c.spendWeek /= c._w; c.level /= c._w; c.gearRatio /= c._w;
        c.tenure /= c._w; c.supplyRatio /= c._w;
      } else { c.satisfaction = 50; c.novelty = 60; }
      list.push(c);
    });
    return list;
  }

  /* A readable snapshot of one player, for the inspector. */
  function describe(state, agent) {
    var d = PN.sim.live(state);
    var gear = ST.GEAR_SLOTS.map(function (slot) {
      var it = IT.itemById(d, agent.g[slot.id]);
      return { slot: slot, item: it };
    });
    var bag = U.keys(agent.inv).map(function (id) {
      return { item: IT.itemById(d, id), qty: agent.inv[id] };
    }).filter(function (x) { return x.item; });
    var purse = U.keys(agent.cur).map(function (id) {
      return { item: IT.itemById(d, id), qty: Math.round(agent.cur[id]) };
    }).filter(function (x) { return x.item; });
    return { agent: agent, gear: gear, bag: bag, purse: purse,
             gearScore: gearScore(d, agent),
             guild: agent.gid ? PN.guilds.byId(state, agent.gid) : null };
  }

  PN.agents = {
    MAX_AGENTS: MAX_AGENTS, ACTIVITIES: ACTIVITIES,
    spawn: spawn, tickAgent: tickAgent, tickAll: tickAll, admit: admit,
    allocId: allocId, ensureIds: ensureIds, highestId: highestId,
    compact: compact, individuate: individuate, slim: slim, makeName: makeName, nameStyleFor: nameStyleFor,
    buildWorldCache: buildWorldCache, aggregate: aggregate, describe: describe,
    xpForLevel: xpForLevel, totalXpToCap: totalXpToCap,
    xpPlan: xpPlan, xpWorth: xpWorth,
    gearScore: gearScore, grantReward: grantReward, addItem: addItem,
    slotsOf: slotsOf, wantsBags: wantsBags, buyBags: buyBags, bagCatalogue: bagCatalogue,
    starterBagsFor: function (d) { return U.clone(starterBags(d)); },
    reScroll: reScroll, enchantBonus: enchantBonus,
    equipFrom: equipFrom, gearFit: gearFit, itemValueFor: itemValueFor,
    tickBattlePass: tickBattlePass, primaryOf: primaryOf,
    churnChance: churnChance, scoreAgent: scoreAgent,
    spendFor: spendFor, consumablesOf: consumablesOf, drinkUp: drinkUp,
    worthTo: worthTo, containerWorth: containerWorth, openBags: openBags,
    usesResource: usesResource
  };
})(PN);
