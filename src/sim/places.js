/* Patch Notes - where a player is, and why.

   The live world view draws players standing in the places you built.
   Which place each one is standing in is not a drawing decision - it is
   what the weekly simulation already decided they did with their time,
   read back out. So it lives here with the simulation rather than in the
   view, and can be tested without a browser.

   Two rules run this file, and both used to be wrong.

   THE JOURNEY. A player goes where their LEVEL lets them go. In week one
   everybody is level one and everybody is in the starting zone; the
   endgame zone is empty because nobody can reach it yet. A capital only
   forms once there are people standing around at the top of the ladder,
   and until then the busiest place in your game is wherever the new
   players are. The world should read like a game filling up, not like a
   finished one on day one.

   THE REWARDS. Players do not go raiding because they are "raiders".
   They go where the thing they want comes from. If the best gear in the
   game drops in a dungeon then everybody who wants gear runs dungeons,
   whatever archetype they are; if your best reagents come out of arenas
   then your economists queue for arenas. Sorting people by personality
   alone produced a world where only raiders raided and only competitors
   fought, which is not a world, it is a filing system.                 */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items;

  /* ------------------------------------------------------- what pays what

     Which activities actually hand out which kinds of reward, read off
     the loot tables and rewards you authored. This is the map between
     "what a player wants" and "where they have to go to get it".      */
  var REWARD_KINDS = ['gear', 'materials', 'currency', 'cosmetic'];

  function kindOfItem(it) {
    if (!it) return null;
    if (it.kind === 'gear') return 'gear';
    if (it.kind === 'material') return 'materials';
    if (it.kind === 'currency') return 'currency';
    if (it.kind === 'cosmetic' || it.kind === 'mount') return 'cosmetic';
    /* Flasks and recipe pages are crafting-economy goods: they are
       made out of reagents, they are consumed, and the people who want
       them are the people who want reagents. They used to count as
       nothing at all, so a loot table full of best-in-slot consumables
       read as an empty table. */
    if (it.kind === 'consumable' || it.kind === 'recipe') return 'materials';
    return null;
  }

  function blankPay() {
    return { gear: 0, materials: 0, currency: 0, cosmetic: 0, top: 0, level: 0 };
  }

  /* What one loot table is worth, per kind of reward. Weighted by how
     likely each entry is, so a two percent legendary counts for what it
     is rather than for how often it lands. */
  function tableValue(design, table) {
    var out = blankPay();
    if (!table) return out;
    var entries = (table.entries || []).concat(table.guaranteed || []);
    var totalW = U.sum(entries, function (e) { return e.weight || 1; }) || 1;
    entries.forEach(function (e) {
      var it = IT.itemById(design, e.itemId);
      var k = kindOfItem(it);
      if (!k) return;
      var share = (e.weight || 1) / totalW;
      out[k] += IT.itemDesire(design, it) * share;
      if (k === 'gear') out.top = Math.max(out.top, it.itemLevel || 0);
    });
    return out;
  }

  /* What a reward bundle hands over, on the same scale a loot table is
     measured on.

     A loot table has always been read as an expected value - every
     entry weighted by how likely it is. A reward bundle was read as a
     catalogue: every item in it counted at full value whether it
     dropped one time in a hundred or every time. So the arena's season
     rewards, eight items in a bundle, outscored a dungeon boss's whole
     loot table several times over - and eighty percent of a playerbase
     went and queued, which is exactly what the numbers told them to do. */
  function rewardValue(design, rewardId) {
    var r = rewardId ? IT.rewardById(design, rewardId) : null;
    if (!r) return null;
    var out = blankPay();
    (r.items || []).forEach(function (e) {
      var it = IT.itemById(design, e.itemId);
      var k = kindOfItem(it);
      if (!k) return;
      var chance = e.chance === undefined ? 1 : e.chance;
      out[k] += IT.itemDesire(design, it) * chance * Math.max(1, e.qty || 1);
      if (k === 'gear') out.top = Math.max(out.top, it.itemLevel || 0);
    });
    if (r.lootTableId) {
      addPay(out, tableValue(design, IT.lootById(design, r.lootTableId)));
    }
    return out;
  }

  function addPay(into, from, mult) {
    REWARD_KINDS.forEach(function (k) { into[k] += (from[k] || 0) * (mult === undefined ? 1 : mult); });
    into.top = Math.max(into.top, from.top || 0);
  }

  /* Every activity in the design, and what it pays. Memoised: this walks
     every loot table and is read once per player per week. */
  var payouts = U.memoDesign(function (design) {
    var out = {};

    /* Instances pay what their bosses drop. */
    (design.dungeons || []).forEach(function (dg) {
      var acc = blankPay();
      PN.schema.bossesIn(design, dg).forEach(function (b) {
        addPay(acc, tableValue(design, IT.lootById(design, b.lootTableId)));
      });
      if (dg.trashLootTableId) {
        addPay(acc, tableValue(design, IT.lootById(design, dg.trashLootTableId)), 0.35);
      }
      acc.level = dg.level || (design.progression || {}).levelCap || 60;
      out[dg.id] = acc;
    });

    /* Questing and grinding pay what the monsters and quest rewards in
       each zone give out. */
    (design.zones || []).forEach(function (z) {
      var acc = blankPay();
      PN.world.monstersIn(design, z.id).forEach(function (m) {
        if (m.lootTableId) addPay(acc, tableValue(design, IT.lootById(design, m.lootTableId)), 0.5);
      });
      /* What ONE quest here hands over, not what all of them put
         together ever will. A zone with forty quests in it is not
         forty times better than a zone with one - it lasts forty times
         longer, which is a different thing and is counted as content
         hours elsewhere. */
      var quests = PN.world.questsIn(design, z.id);
      var qAcc = blankPay(), qN = 0;
      quests.forEach(function (q) {
        var rv = rewardValue(design, q.rewardId);
        if (!rv) return;
        addPay(qAcc, rv);
        qN++;
      });
      if (qN > 0) addPay(acc, qAcc, 1 / qN);
      acc.level = z.levelHi || 0;
      out[z.id] = acc;
    });

    /* PvP pays its season and vendor rewards. */
    var pvpAcc = blankPay();
    if (design.pvp && design.pvp.enabled) {
      /* The season bundle, once a season - so it is spread down to
         what a month of it is worth. Comparing a whole season against
         one dungeon run is how eighty percent of a playerbase ended up
         in the arena. */
      var srv = rewardValue(design, design.pvp.seasonRewardId);
      if (srv) addPay(pvpAcc, srv);
      var sr = IT.rewardById(design, design.pvp.seasonRewardId);
      if (sr) {
        U.keys(sr.currencies || {}).forEach(function (cid) {
          pvpAcc.currency += sr.currencies[cid] * 0.05;
        });
      }
      var weeks = Math.max(4, (design.pvp.seasonWeeks || 12));
      REWARD_KINDS.forEach(function (k) { pvpAcc[k] /= Math.max(1, weeks / 4); });

      /* And what one MATCH pays, which is a table rather than a
         bundle. That is already a per-visit expected value - the same
         shape as a dungeon run - so it is added after the season has
         been spread out rather than divided by a season it has nothing
         to do with. */
      addPay(pvpAcc, tableValue(design, IT.lootById(design, design.pvp.matchLootId)));
    }
    out.__pvp = pvpAcc;

    /* Crafting pays what the recipes make; gathering pays materials.
       The BEST thing you can make, because a crafter makes the thing
       they want rather than one of everything in the book. */
    var craftAcc = blankPay();
    PN.crafting.recipes(design).forEach(function (r) {
      if (r.enabled === false) return;
      var made = IT.itemById(design, r.outputId);
      var k = kindOfItem(made);
      if (!k) return;
      craftAcc[k] = Math.max(craftAcc[k], IT.itemDesire(design, made) * 0.85);
      if (k === 'gear') craftAcc.top = Math.max(craftAcc.top, made.itemLevel || 0);
    });
    craftAcc.materials = Math.max(craftAcc.materials, IT.gatherPool(design).length * 1.5);
    out.__craft = craftAcc;

    /* The auction house is a shelf holding whatever other players are
       willing to part with. What it pays is the best tradeable piece in
       each slot, discounted because you have to buy it rather than win
       it - which is exactly why it is a road for the rich and a
       shop window for everybody else.

       It is priced on the same scale as a loot table on purpose. The
       old version multiplied an item LEVEL by a constant, which put it
       on no scale at all and meant a free-trade economy still looked
       like the worst place in the game to get gear. */
    var ahAcc = blankPay();
    if (design.economy && design.economy.auctionHouse && design.economy.tradingEnabled) {
      /* What is actually ON the shelf, priced by the market rather
         than guessed at.

         The old version counted the best tradeable piece in each gear
         slot and then added a constant per gatherable reagent, which
         meant the materials half of an auction house was the same
         number whether those reagents were the backbone of every
         recipe in the game or litter nobody had priced. A market that
         cannot tell copper from a best-in-slot weapon is not a market.

         Every tradeable thing is on the shelf now, at what somebody
         will pay for it - and what somebody will pay is how badly it
         is wanted against how much of it arrives. */
      var bySlot = {};
      (design.items || []).forEach(function (it) {
        if (IT.isOrphan(design, it) || !IT.isTradeable(design, it)) return;
        var worth = PN.market.marketValue(design, it);
        if (worth <= 0) return;
        var k = kindOfItem(it);
        if (!k) return;
        if (k === 'gear') {
          /* Gear competes slot by slot: a shelf with nine chestpieces
             on it is still one chestpiece to whoever is shopping. */
          var slot = it.slot || 'chest';
          if (!bySlot[slot] || worth > bySlot[slot].v) {
            bySlot[slot] = { v: worth, il: it.itemLevel || 0 };
          }
        } else {
          /* Everything else is bought by the stack, so a deep market
             really is a better place to get reagents - but measured
             against the best thing on the shelf rather than the sum of
             everything on it. */
          ahAcc[k] = Math.max(ahAcc[k], worth * 0.55);
        }
      });
      /* One shopping trip buys one thing. Summing the best piece in
         every slot priced a whole wardrobe against one dungeon run,
         which is the same mistake the arena was making from the other
         direction. Discounted, because you have to BUY it rather than
         win it - which is exactly why the auction house is a road for
         the rich and a shop window for everybody else. */
      U.keys(bySlot).forEach(function (slot) {
        ahAcc.gear = Math.max(ahAcc.gear, bySlot[slot].v * 0.55);
        ahAcc.top = Math.max(ahAcc.top, bySlot[slot].il);
      });
    }
    out.__ah = ahAcc;

    /* The best payout of each kind anywhere in the design.

       What a player wants to know is not "is this a good payout" but
       "is this where the best one is" - so everything downstream
       compares against these rather than against an absolute. An
       absolute scale saturated: a dungeon dropping sixty-nine points
       of gear and an arena dropping a thousand both came out as "lots",
       so nothing ever pulled anybody anywhere. */
    var best = { gear: 0, materials: 0, currency: 0, cosmetic: 0 };
    U.keys(out).forEach(function (k) {
      REWARD_KINDS.forEach(function (r) {
        best[r] = Math.max(best[r], out[k][r] || 0);
      });
    });
    out.__best = best;

    return out;
  });

  /* ------------------------------------------------------- the journey --

     Which zones a player of this level would actually be in. A level-one
     character is not in your level 50-60 zone, whatever else is true. */
  function zonesFor(design, level) {
    var zones = (design.zones || []).slice().sort(function (a, b) {
      return (a.levelLo || 0) - (b.levelLo || 0);
    });
    if (!zones.length) return [];
    var open = zones.filter(function (z) {
      /* You can push into a zone a couple of levels early, and you keep
         using it for a while after you have outgrown it. */
      return level >= (z.levelLo || 1) - 2 && level <= (z.levelHi || 99) + 6;
    });
    if (open.length) return open;
    return level < (zones[0].levelLo || 1) ? [zones[0]] : [zones[zones.length - 1]];
  }

  /* The zone a player of this level calls home: the highest one they have
     properly grown into. */
  function homeZone(design, level) {
    var open = zonesFor(design, level);
    if (!open.length) return null;
    var best = open[0];
    open.forEach(function (z) {
      if ((z.levelLo || 0) <= level && (z.levelLo || 0) >= (best.levelLo || 0)) best = z;
    });
    return best;
  }

  /* Instances a player of this level can actually run. */
  function instancesFor(design, level, raid) {
    return (design.dungeons || []).filter(function (dg) {
      if (raid !== undefined && (dg.kind === 'raid') !== raid) return false;
      if (!PN.schema.bossesIn(design, dg).length) return false;
      var lv = dg.level || (design.progression || {}).levelCap || 60;
      return level >= lv - 4;
    });
  }

  /* ----------------------------------------------------------- the hub --

     A capital is not a room the designer drew, it is wherever the people
     who have run out of levelling end up standing. So it only exists once
     somebody is at the top, and it is the top zone of your world.      */
  function hubZone(design, state) {
    var zones = design.zones || [];
    if (!zones.length) return null;
    var cap = (design.progression && design.progression.levelCap) || 60;

    /* Nobody near the cap means no hub: everybody is still out levelling
       and the crowd is wherever the new players are. */
    if (state && state.agents && state.agents.length) {
      var atCap = 0, total = 0;
      state.agents.forEach(function (a) {
        total += a.w || 1;
        if ((a.lv || 1) >= cap - 4) atCap += a.w || 1;
      });
      if (total > 0 && atCap / total < 0.06) return null;
    }

    var best = null, bestScore = -Infinity;
    zones.forEach(function (z) {
      var givers = (design.questgivers || []).filter(function (g) {
        return g.zoneId === z.id; }).length;
      var quests = (design.quests || []).filter(function (q) {
        return q.zoneId === z.id; }).length;
      var dungeons = (design.dungeons || []).filter(function (dg) {
        return dg.zoneId === z.id; }).length;
      /* The top of the ladder dominates; what is in the zone decides
         between zones at the same tier. */
      var score = (z.levelHi || 0) * 100 + givers * 6 + dungeons * 9 +
                  quests * 1.5 + (z.size || 0) * 0.05;
      if (score > bestScore) { bestScore = score; best = z; }
    });
    return best;
  }

  /* --------------------------------------------------------- the venues */

  function venues(state) {
    var d = PN.sim.live(state) || state.design;
    if (!d) return [];
    var hub = hubZone(d, state);
    var out = (d.zones || []).map(function (z) {
      return { id: z.id, name: z.name, kind: 'zone', lo: z.levelLo, hi: z.levelHi,
               hub: !!(hub && hub.id === z.id) };
    });
    (d.dungeons || []).forEach(function (dg) {
      out.push({ id: dg.id, name: dg.name,
                 kind: dg.kind === 'raid' ? 'raid' : 'dungeon',
                 level: dg.level || (d.progression || {}).levelCap });
    });
    if (d.pvp && d.pvp.enabled) {
      var maps = d.pvpMaps || [];
      if (maps.length) {
        maps.forEach(function (m) { out.push({ id: m.id, name: m.name, kind: 'pvp' }); });
      } else {
        out.push({ id: '__pvp', name: 'Unnamed Arena', kind: 'pvp' });
      }
    }
    if (PN.crafting.recipes(d).length || PN.schema.hasEngine(d, 'professions')) {
      out.push({ id: '__craft', name: 'Workshops', kind: 'craft' });
    }
    if (d.economy && d.economy.auctionHouse) {
      out.push({ id: '__ah', name: 'Auction House', kind: 'economy' });
    }
    return out;
  }

  /* Where people mill about when they are not doing anything in
     particular. Before anybody is at the cap that is the starting zone,
     not the endgame one nobody can reach. */
  function hubId(state) {
    var d = PN.sim.live(state) || state.design;
    if (!d) return null;
    var hub = hubZone(d, state);
    if (hub) return hub.id;
    var zones = (d.zones || []).slice().sort(function (a, b) {
      return (a.levelLo || 0) - (b.levelLo || 0); });
    return zones.length ? zones[0].id : null;
  }

  /* What is actually in each zone, which is what decides whether
     anybody has a reason to stand in it. Counted once per design. */
  var zoneDraw = U.memoDesign(function (design) {
    var out = {};
    (design.zones || []).forEach(function (z) {
      out[z.id] = { givers: 0, quests: 0, instances: 0, size: z.size || 40 };
    });
    (design.questgivers || []).forEach(function (g) {
      if (out[g.zoneId]) out[g.zoneId].givers++; });
    (design.quests || []).forEach(function (q) {
      if (out[q.zoneId]) out[q.zoneId].quests++; });
    (design.dungeons || []).forEach(function (dg) {
      if (out[dg.zoneId] && PN.schema.bossesIn(design, dg).length) out[dg.zoneId].instances++; });
    return out;
  });

  /* How much of a draw one zone is for somebody of this level.

     Two things decide it. Whether the zone was built for them - inside
     its band is home, a little above is somewhere they have outgrown,
     a little below is somewhere they are pushing into early. And what
     is in it: a zone with questgivers, quests and an instance holds
     people, and an empty one on the map does not. */
  function zoneDrawFor(d, z, lv) {
    var lo = z.levelLo || 1, hi = z.levelHi || 99;
    /* Never somewhere they have not reached. zonesFor lets somebody
       push into a zone a couple of levels early, which is fine for
       deciding what is available to them and wrong for deciding where
       to draw them: a level nine standing in the level-ten zone reads
       as a bug whatever the rule behind it was. */
    if (lv < lo) return 0;
    var fit = lv <= hi ? 1 : U.clamp01(1 - (lv - hi) / 14) * 0.45;
    if (fit <= 0) return 0;
    var c = zoneDraw(d)[z.id] || { givers: 0, quests: 0, instances: 0, size: 40 };
    return fit * (0.6 + c.givers * 0.45 + c.quests * 0.12 +
                  c.instances * 1.2 + U.clamp01(c.size / 80) * 0.8);
  }

  /* Somewhere to stand, spread across everywhere that suits them.

     This used to return ONE zone: the highest level band the player
     qualified for, and when two zones shared a band, whichever of them
     came later in the list. So the week a second max-level zone
     shipped, every capped player in the game moved into it and the
     previous expansion's zone went to exactly zero - not "fewer", zero,
     decided by array order. Meanwhile the dungeon inside that zone
     carried on filling up, because instances are placed by their own
     level and never look at the zone they sit in.

     Now the zones that suit a player share them out, in proportion to
     how well each one fits and how much is in it. The pick is stable
     per player: somebody stays in the zone they were in last week
     rather than teleporting around the map. */
  function spreadZone(d, state, lv, agent) {
    var open = zonesFor(d, lv);
    if (!open.length) return null;
    if (open.length === 1) return open[0].id;
    var weights = [], total = 0;
    for (var i = 0; i < open.length; i++) {
      var w = zoneDrawFor(d, open[i], lv);
      weights.push(w); total += w;
    }
    if (total <= 0) { var h = homeZone(d, lv); return h ? h.id : open[0].id; }
    /* A stable number per player, stirred so consecutive ids - which
       arrive together - do not land together. Offset from the one the
       activity pick uses, or everybody who draws the same activity
       would draw the same zone with it. */
    var r = hash32(((agent && (agent.seed || agent.id)) || 1) ^ 0x5bf03635) * total;
    for (var j = 0; j < open.length; j++) {
      r -= weights[j];
      if (r <= 0) return open[j].id;
    }
    return open[open.length - 1].id;
  }

  function fallback(d, state, lv, agent) {
    if (agent) {
      var spread = spreadZone(d, state, lv, agent);
      if (spread) return spread;
    }
    var home = homeZone(d, lv);
    if (home) return home.id;
    var h = hubId(state);
    if (h) return h;
    var zones = d.zones || [];
    return zones.length ? zones[0].id : null;
  }

  /* --------------------------------------------------- where this player is

     Their week's biggest activity says what they did; their level says
     where they could possibly have done it.                          */
  /* Which of the week's activities to draw this player doing.

     Their biggest block is the obvious answer and the wrong one. A
     mature game offers eight or nine things worth doing, a week splits
     across most of them, and the winner is often ahead by a nose - so
     reading only the winner turns "thirteen percent dungeons" into
     "everybody is in the dungeons" for the whole population at once.

     One player is in one place, so the choice is still a single
     activity; it is just made in proportion to how they actually spent
     the week, and made the same way every time it is asked so nobody
     flickers between rooms. */
  /* A stable number per player, spread evenly.

     Multiplying a seed by a big constant and taking a remainder looks
     like a hash and is not one: a seed in the billions times a
     constant in the billions is past the range a double holds exactly,
     so the low bits - the only ones a remainder reads - are rounding
     noise. It clustered badly enough to put forty percent of a
     playerbase in the raid that nine percent of their hours went to.
     This is an xorshift, which stays inside 32 bits throughout. */
  function hash32(n) {
    var x = (n | 0) || 0x9e3779b9;
    x ^= x << 13; x |= 0;
    x ^= x >>> 17;
    x ^= x << 5; x |= 0;
    return (x >>> 0) / 4294967296;
  }

  function actOf(agent) {
    var hrs = agent.actHrs;
    if (!hrs) return agent.lastAct;
    var keys = U.keys(hrs), total = 0;
    for (var i = 0; i < keys.length; i++) total += hrs[keys[i]] || 0;
    if (total <= 0) return agent.lastAct;
    var r = hash32(agent.seed || agent.id || 1) * total;
    for (var j = 0; j < keys.length; j++) {
      r -= hrs[keys[j]] || 0;
      if (r <= 0) return keys[j];
    }
    return agent.lastAct;
  }

  function venueFor(state, agent, vs) {
    vs = vs || venues(state);
    var d = PN.sim.live(state) || state.design;
    var act = actOf(agent);
    var lv = agent.lv || 1;

    if (act === 'raid' || act === 'dungeon') {
      var runs = instancesFor(d, lv, act === 'raid');
      if (runs.length) return runs[Math.abs(agent.id || 0) % runs.length].id;
      var any = instancesFor(d, lv);
      if (any.length) return any[Math.abs(agent.id || 0) % any.length].id;
      return fallback(d, state, lv, agent);
    }
    if (act === 'pvp') {
      var arenas = [];
      for (var p = 0; p < vs.length; p++) if (vs[p].kind === 'pvp') arenas.push(vs[p]);
      if (arenas.length) return arenas[Math.abs(agent.id || 0) % arenas.length].id;
      return fallback(d, state, lv, agent);
    }
    if (act === 'craft') return U.byId(vs, '__craft') ? '__craft' : fallback(d, state, lv, agent);
    /* Collecting covers mounts, achievements, fashion and shopping, and
       all of it was being drawn as "everybody is at the auction house" -
       which is how a game of nine thousand came to have fifteen
       thousand players standing in one room.

       The auction house is where you go to BUY the thing. Somebody who
       can afford to is there; everybody else is out in the world
       farming it, which is the same activity and a different place. */
    if (act === 'collect') {
      if ((agent.rich || 0) > 0.5 && U.byId(vs, '__ah')) return '__ah';
      return fallback(d, state, lv, agent);
    }

    /* Standing around happens somewhere their level makes sense: a capped
       player is in the capital, a levelling one is out in the zone they
       are working through. */
    if (act === 'social' || act === 'idle' || !act) {
      var cap = (d.progression && d.progression.levelCap) || 60;
      if (lv >= cap - 4) {
        var h = hubId(state);
        if (h) return h;
      }
      return fallback(d, state, lv, agent);
    }
    return fallback(d, state, lv, agent);
  }

  /* Everybody, grouped by where they are. */
  function census(state) {
    var vs = venues(state);
    var by = {}, pop = {};
    vs.forEach(function (v) { by[v.id] = []; pop[v.id] = 0; });
    var hub = hubId(state);
    function land(id) {
      if (by[id]) return id;
      if (hub && by[hub]) return hub;
      return vs.length ? vs[0].id : null;
    }
    (state.agents || []).forEach(function (a) {
      /* One agent is drawn in one place, because one marker is one
         person standing somewhere. */
      var id = land(venueFor(state, a, vs));
      if (id) by[id].push(a);

      /* But the HEADCOUNT is a different question. Past the roster cap
         one agent stands in for hundreds of players, and those players
         did not all spend the week doing the same thing - so counting
         the whole crowd wherever their one marker happens to stand put
         half a world in whichever room a handful of heavy agents drew.
         A crowd is spread across the week it actually had. */
      var w = a.w || 1;
      var hrs = a.actHrs, total = 0;
      if (hrs) U.keys(hrs).forEach(function (k) { total += hrs[k] || 0; });
      if (!hrs || total <= 0) {
        if (id) pop[id] += w;
        return;
      }
      var wasHrs = a.actHrs, wasAct = a.lastAct;
      U.keys(hrs).forEach(function (k) {
        var share = (hrs[k] || 0) / total;
        if (share <= 0) return;
        /* Ask where this player would be doing THIS, using the same
           placement rule the marker used. */
        a.actHrs = null; a.lastAct = k;
        var vid = land(venueFor(state, a, vs));
        if (vid) pop[vid] += w * share;
      });
      a.actHrs = wasHrs; a.lastAct = wasAct;
    });
    return { venues: vs, byVenue: by, population: pop, hubId: hub };
  }

  PN.places = { venues: venues, venueFor: venueFor, actOf: actOf, census: census,
                hubZone: hubZone, hubId: hubId,
                zonesFor: zonesFor, homeZone: homeZone, instancesFor: instancesFor,
                payouts: payouts, tableValue: tableValue, REWARD_KINDS: REWARD_KINDS };
})(PN);
