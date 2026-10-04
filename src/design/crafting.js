/* Patch Notes - crafting.

   A recipe turns materials into an item. That is the whole of it, and it
   is enough: the interesting decisions are which items are only obtainable
   this way, how rare the recipe is, and whether crafted gear competes with
   what drops.

   Two ways a player knows a recipe. Either everybody knows it - a trainer
   recipe, learned by existing - or it has to be looted, which makes the
   recipe itself a drop worth chasing and turns a crafter into someone
   other players need.                                                  */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items;

  /* What kind of crafting this is. Professions are flavour plus a gate:
     a player practises one or two, not all of them.                    */
  var PROFESSIONS = [
    { id: 'smithing',    name: 'Smithing',    makes: ['gear'],
      desc: 'Plate and mail, weapons, the heavy end of the gear table.' },
    { id: 'leatherwork', name: 'Leatherworking', makes: ['gear'],
      desc: 'Light and medium armour, bags, and the odd trinket.' },
    { id: 'tailoring',   name: 'Tailoring',   makes: ['gear', 'cosmetic'],
      desc: 'Cloth gear and most of what ends up in a cosmetic tab.' },
    { id: 'alchemy',     name: 'Alchemy',     makes: ['consumable'],
      desc: 'Potions and flasks. Consumed forever, so demand never ends.' },
    { id: 'enchanting',  name: 'Enchanting',  makes: ['consumable', 'gear'],
      desc: 'Upgrades applied to gear somebody else made.' },
    { id: 'cooking',     name: 'Cooking',     makes: ['consumable'],
      desc: 'Cheap, universal, and the first profession anyone levels.' },
    { id: 'engineering', name: 'Engineering', makes: ['consumable', 'gear'],
      desc: 'Gadgets. Beloved by a small number of people, forever.' },
    { id: 'jewelcraft',  name: 'Jewelcrafting', makes: ['gear'],
      desc: 'Gems and rings. Lives or dies on whether you ship socketing.' }
  ];
  var PROFESSION_BY_ID = {};
  PROFESSIONS.forEach(function (p) { PROFESSION_BY_ID[p.id] = p; });

  /* What a player needs before they can make this.

     Two things can stand in the way and they are different things: the
     KNOWLEDGE, which is a recipe page they have to find, and a
     PREREQUISITE they have to be carrying - the quest item that proves
     they did the questline the recipe belongs to. A recipe can want
     either, both, or neither. */
  var SOURCES = [
    { id: 'known', name: 'Craftable by everyone', needsRecipe: false, needsQuest: false,
      desc: 'Learned from a trainer. Reliable, unexciting, and the backbone of a profession.' },
    { id: 'looted', name: 'Recipe required', needsRecipe: true, needsQuest: false,
      desc: 'The recipe is an item that drops. Makes the crafter someone other players need, and makes the recipe worth farming.' },
    { id: 'quest', name: 'Quest item required', needsRecipe: false, needsQuest: true,
      desc: 'Anyone can make it, but only while carrying something a questline gave them. Gates the recipe behind story rather than luck.' },
    { id: 'both', name: 'Recipe & quest item required', needsRecipe: true, needsQuest: true,
      desc: 'Both gates at once. The deepest thing a profession can hold, and the easiest to make nobody bother with.' }
  ];
  var SOURCE_BY_ID = {};
  SOURCES.forEach(function (s) { SOURCE_BY_ID[s.id] = s; });

  function newRecipe(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('rcp'),
      name: opts.name || 'New Recipe',
      profession: opts.profession || 'smithing',
      /* What it makes, and how many. */
      outputId: opts.outputId || null,
      outputQty: opts.outputQty === undefined ? 1 : opts.outputQty,
      /* What it costs: [{itemId, qty}] */
      inputs: opts.inputs || [],
      /* 'known' or 'looted'. A looted recipe points at a recipe item that
         has to be in somebody's bags before they can make this. */
      source: opts.source || 'known',
      recipeItemId: opts.recipeItemId || null,
      /* The thing they must be carrying, for a recipe gated on a
         questline rather than on a drop. */
      questItemId: opts.questItemId || null,
      /* The level a player has to be to use it at all. */
      levelReq: opts.levelReq === undefined ? 1 : opts.levelReq,
      /* How long one craft takes, in hours of play. */
      craftHours: opts.craftHours === undefined ? 0.05 : opts.craftHours,
      enabled: opts.enabled === undefined ? true : opts.enabled
    };
  }

  function recipes(design) { return design.recipes || (design.recipes = []); }
  function recipeById(design, id) { return U.byId(recipes(design), id); }
  function recipesFor(design, profId) {
    return recipes(design).filter(function (r) { return r.profession === profId; });
  }

  /* ------------------------------------------------------------- value --

     What a recipe is worth making. A recipe that costs more than the thing
     it makes is one nobody will ever use, and the game should say so
     rather than letting it sit there looking like content.            */
  function recipeMetrics(design, recipe) {
    var out = IT.itemById(design, recipe.outputId);
    var outValue = out ? IT.itemDesire(design, out) * (recipe.outputQty || 1) : 0;
    var inValue = 0, missing = [];
    (recipe.inputs || []).forEach(function (i) {
      var it = IT.itemById(design, i.itemId);
      if (!it) { missing.push(i.itemId); return; }
      inValue += IT.itemDesire(design, it) * (i.qty || 1);
    });
    /* Is the thing it makes better than what simply drops at the level it
       is for? Comparing a levelling recipe against endgame gear marks
       every one of them as junk, which is not the question being asked.

       Crafted-gear parity used to be a slider you set. It is not a claim
       any more - it is measured off the item the recipe actually makes. */
    var cap = Math.max(1, (design.progression || {}).levelCap || 60);
    var atLevel = U.clamp01((recipe.levelReq || 1) / cap);
    var expected = PN.combat.targetItemLevel(design) * Math.max(0.12, atLevel);
    var parity = out && out.kind === 'gear' && expected > 0
      ? U.clamp100(((out.itemLevel || 0) / expected) * 100) : 0;
    var competitive = out && out.kind === 'gear' ? parity >= 75 : true;
    return {
      outValue: outValue, inValue: inValue,
      margin: outValue - inValue,
      ratio: inValue > 0 ? outValue / inValue : (outValue > 0 ? Infinity : 0),
      competitive: competitive, parity: parity,
      missing: missing
    };
  }

  function recipeIssues(design, recipe) {
    var out = [];
    var m = recipeMetrics(design, recipe);
    if (!recipe.outputId) out.push('Makes nothing');
    else if (!IT.itemById(design, recipe.outputId)) out.push('Makes an item that no longer exists');
    if (!(recipe.inputs || []).length) out.push('Costs nothing - free items are not crafting');
    m.missing.forEach(function () { out.push('Needs a material that no longer exists'); });
    var src = SOURCE_BY_ID[recipe.source] || SOURCE_BY_ID.known;
    if (src.needsRecipe && !recipe.recipeItemId)
      out.push('Needs a recipe, but no recipe item points at it');
    if (src.needsQuest && !recipe.questItemId)
      out.push('Needs a quest item, but none is chosen - nobody can make it');
    /* "Costs more than it makes" is a gold sum, and gold is not why
       anybody crafts. A step in a chain is meant to lose money - Nightscale
       is worth making because of the armour on the far side of it, not
       because a vendor pays for it - and gear is made to be worn. So only
       complain when the thing really is a dead end: a trade good nothing
       else consumes. */
    var outItem = IT.itemById(design, recipe.outputId);
    var feedsSomething = (consumersOf(design)[recipe.outputId] || []).length > 0;
    var isGear = outItem && outItem.kind === 'gear';
    /* A bag is CARRIED, like gear. Nothing consumes one and a vendor
       pays less for one than the leather costs, which is true of every
       bag in every MMO ever made - and that is not a fault, it is what
       a bag is. Judging it on its gold margin marked every bag recipe
       in the game as a dead end. */
    var isCarried = isGear || (outItem && outItem.kind === 'container');
    if (m.inValue > 0 && m.ratio < 0.9 && !feedsSomething && !isCarried)
      out.push('Costs more than it makes and nothing uses it - a dead end');
    if (isGear && !m.competitive)
      out.push('Makes gear well below what drops at this level');
    /* What DOES make a bag recipe pointless: a bag with no room in it,
       or one nobody is allowed to carry.

       NOT "it is no bigger than one on the vendor". Every bag has its
       own carry limit, so a second three-slot bag is three more slots
       to somebody already carrying the most of the first one that the
       game allows - which is exactly why a game ships two of them. */
    if (outItem && outItem.kind === 'container') {
      var carry = outItem.maxCarried === undefined ? 4 : outItem.maxCarried;
      if ((outItem.slots || 0) <= 0)
        out.push('Makes a bag with no room in it');
      if (carry <= 0)
        out.push('Nobody may carry this bag - its carry limit is zero');
    }
    return out;
  }

  /* Which recipe items exist but teach nothing - the other half of the
     dangling-pointer problem. */
  function orphanRecipeItems(design) {
    var taught = {};
    recipes(design).forEach(function (r) { if (r.recipeItemId) taught[r.recipeItemId] = 1; });
    return (design.items || []).filter(function (i) {
      return i.kind === 'recipe' && !taught[i.id];
    });
  }

  /* --------------------------------------------------------- the player --

     What one player can actually make this week. A recipe is usable if
     they are high enough level, they know it, and their bags hold the
     materials.                                                        */
  function knows(agent, recipe) {
    var src = SOURCE_BY_ID[recipe.source] || SOURCE_BY_ID.known;
    if (src.needsRecipe) {
      if (!recipe.recipeItemId) return false;
      var hasPage = (agent.inv && agent.inv[recipe.recipeItemId] > 0) ||
                    (agent.known && agent.known[recipe.id]);
      if (!hasPage) return false;
    }
    /* A quest item is CARRIED rather than learned - putting it down
       means you cannot make the thing any more, which is exactly what
       makes it a different gate from a recipe page. */
    if (src.needsQuest) {
      if (!recipe.questItemId) return false;
      if (!(agent.inv && agent.inv[recipe.questItemId] > 0)) return false;
    }
    return true;
  }

  function canAfford(agent, recipe) {
    var inputs = recipe.inputs || [];
    if (!inputs.length) return false;
    for (var i = 0; i < inputs.length; i++) {
      var have = (agent.inv && agent.inv[inputs[i].itemId]) || 0;
      if (have < (inputs[i].qty || 1)) return false;
    }
    return true;
  }

  /* Spend the materials and return what was made. */
  function craft(design, agent, recipe) {
    if (!canAfford(agent, recipe)) return null;
    (recipe.inputs || []).forEach(function (i) {
      agent.inv[i.itemId] -= (i.qty || 1);
      if (agent.inv[i.itemId] <= 0) delete agent.inv[i.itemId];
    });
    /* Learning a looted recipe consumes the page. */
    if (recipe.source === 'looted' && recipe.recipeItemId &&
        agent.inv[recipe.recipeItemId] > 0) {
      agent.known = agent.known || {};
      if (!agent.known[recipe.id]) {
        agent.known[recipe.id] = 1;
        agent.inv[recipe.recipeItemId] -= 1;
        if (agent.inv[recipe.recipeItemId] <= 0) delete agent.inv[recipe.recipeItemId];
      }
    }
    return { itemId: recipe.outputId, qty: recipe.outputQty || 1 };
  }

  /* --------------------------------------------------- what to make ----

     Ranking recipes by gold margin alone is why nobody would craft the
     best item in the game. A crafter is not a merchant: the reason to
     make a chest piece is to WEAR it, and the reason to make an
     intermediate reagent is that it is the only road to the chest piece.
     Two things were missing.

     First, upgrade value. If the output is gear that beats what this
     player has in that slot, that is worth far more than the few gold
     the recipe loses, and a best-in-slot piece that drops nowhere is
     worth making at any price.

     Second, chain value. Scale and Nightshade make Nightscale; Nightscale
     makes the best armour in the game. Priced as a trade good Nightscale
     is worth twenty, so a merchant sells it - but its worth to a crafter
     is what it unlocks. Materials inherit value from the best thing they
     are a reagent for, one step at a time, so a chain of any depth
     resolves without recursion.                                       */

  /* Every recipe that consumes a given item, built once per design. */
  var consumersOf = U.memoDesign(function (design) {
    var out = {};
    recipes(design).forEach(function (r) {
      if (r.enabled === false) return;
      (r.inputs || []).forEach(function (i) {
        (out[i.itemId] = out[i.itemId] || []).push(r);
      });
    });
    return out;
  });

  /* Everything a loot table can hand out, so the chain knows which items
     have to be crafted because they exist nowhere else. */
  var dropsSomewhere = U.memoDesign(function (design) {
    var out = {};
    (design.lootTables || []).forEach(function (t) {
      (t.entries || []).forEach(function (e) { out[e.itemId] = 1; });
      (t.guaranteed || []).forEach(function (g) {
        out[g.itemId !== undefined ? g.itemId : g] = 1; });
    });
    (design.rewards || []).forEach(function (r) {
      (r.items || []).forEach(function (e) {
        out[e.itemId !== undefined ? e.itemId : e] = 1; });
    });
    return out;
  });

  /* What each item is worth to somebody who crafts, as opposed to what a
     vendor pays for it.

     Gear is the reason crafting exists, and its vendor price is a bad
     proxy for that: the best chest in the game is worth having whatever
     the sticker says, and one that drops nowhere is worth having at
     almost any cost, because crafting is the only way to hold it. Then
     reagents inherit from what they make, one link at a time, so Scale
     and Nightshade are worth what Nightscale is worth, and Nightscale is
     worth a share of the armour it is the only road to.               */
  var craftValue = U.memoDesign(function (design) {
    var val = {}, drops = dropsSomewhere(design);
    var topIlvl = 1;
    (design.items || []).forEach(function (it) {
      if (it.kind === 'gear') topIlvl = Math.max(topIlvl, it.itemLevel || 0);
    });
    (design.items || []).forEach(function (it) {
      var base = IT.itemDesire(design, it);
      if (it.kind === 'gear') {
        /* How near the top of the ladder it sits, and whether anything
           else in the game can give it to you. */
        var tier = U.clamp01((it.itemLevel || 0) / Math.max(1, topIlvl));
        base *= (1 + tier * 2.5) * (drops[it.id] ? 1 : 2.2);
      }
      val[it.id] = base;
    });

    var list = recipes(design).filter(function (r) {
      return r.enabled !== false && r.outputId;
    });
    /* One pass per link in the longest possible chain. Recipe counts are
       small and this runs once per design revision. */
    var rounds = Math.min(8, Math.max(1, list.length));
    for (var pass = 0; pass < rounds; pass++) {
      var moved = false;
      list.forEach(function (r) {
        var outVal = (val[r.outputId] || 0) * (r.outputQty || 1);
        if (outVal <= 0) return;
        var inputs = r.inputs || [];
        if (!inputs.length) return;
        /* Split what the output is worth back across its reagents, less a
           margin so making the thing is still a gain rather than a wash. */
        inputs.forEach(function (i) {
          var qty = Math.max(1, i.qty || 1);
          var share = (outVal * 0.85) / inputs.length / qty;
          if (share > (val[i.itemId] || 0) + 0.001) {
            val[i.itemId] = share; moved = true;
          }
        });
      });
      if (!moved) break;
    }
    return val;
  });

  /* What making this recipe is worth to one particular player, in the
     only units that matter to them: is the thing on the other side
     better than what they have? */
  function craftAppeal(design, agent, recipe, opts) {
    opts = opts || {};
    var out = IT.itemById(design, recipe.outputId);
    if (!out) return -1;
    var cv = craftValue(design);
    var inValue = 0;
    (recipe.inputs || []).forEach(function (i) {
      inValue += (cv[i.itemId] || 0) * (i.qty || 1);
    });
    var outValue = (cv[out.id] || 0) * (recipe.outputQty || 1);

    /* Gear is judged by what it replaces, not by its price. */
    if (out.kind === 'gear' && out.slot) {
      var fit = opts.gearFit ? opts.gearFit(design, agent, out) : 1;
      var cur = agent.g ? IT.itemById(design, agent.g[out.slot]) : null;
      var curLv = cur ? (cur.itemLevel || 0) * (opts.gearFit ? opts.gearFit(design, agent, cur) : 1) : 0;
      var mineLv = (out.itemLevel || 0) * fit;
      if (mineLv > curLv) {
        /* An upgrade is worth making even at a loss. How much of one it
           is decides how far ahead of everything else it ranks. */
        return 1000 + (mineLv - curLv);
      }
      /* Not an upgrade for them - back to being a trade good. */
      return outValue - inValue;
    }
    /* A bag is judged like gear: by what it does for THIS player.

       Room in your bags helps whatever you are doing, so somebody
       short of it will make one at a loss - and somebody already
       carrying the most of that bag the game allows will not make
       another at any price. Treating a bag as a trade good meant the
       only people who ever made one were the ones who could sell it. */
    if (out.kind === 'container' && (out.slots || 0) > 0) {
      var cap = Math.max(0, out.maxCarried === undefined ? 4 : out.maxCarried);
      var have = (agent.bags && agent.bags[out.id]) || 0;
      /* No room for another of THIS one - back to being a trade good. */
      if (have >= cap) return outValue - inValue;
      /* What making one actually gains them: this bag's slots, on top
         of everything they already carry.

         Every bag has its OWN carry limit, so a second KIND of bag is
         more room even when it is no bigger than the first - which is
         the entire reason a game ships two different three-slot bags,
         and which the old reading missed. And three slots is a third
         of a nine-slot inventory and nothing at all on a ninety-slot
         one, so it is worth what it adds rather than what it is. */
      var gain = out.slots || 0;
      var room = opts.slotsOf ? opts.slotsOf(design, agent) : 0;
      var need = opts.wantsBags ? opts.wantsBags(design, agent) : 0.5;
      return 1000 + (gain / Math.max(gain, room)) * 300 * (0.4 + need);
    }
    /* Reagents and consumables: worth what they unlock, minus what they
       cost, which is what the chain values above are for. */
    return outValue - inValue;
  }

  /* Everything this player could make right now.

     The shortlist is computed once a week because pricing the whole
     design inside a sort comparator - per craft, per player - made a
     long campaign take minutes. What each player picks off that
     shortlist is decided per player, because an upgrade is an upgrade
     for them and nobody else.                                        */
  function rankRecipes(design) {
    var cv = craftValue(design);
    return recipes(design).filter(function (r) {
      return r.enabled !== false && r.outputId;
    }).map(function (r) {
      var inValue = 0;
      (r.inputs || []).forEach(function (i) {
        inValue += (cv[i.itemId] || 0) * (i.qty || 1);
      });
      var out = IT.itemById(design, r.outputId);
      var outValue = (cv[r.outputId] || 0) * (r.outputQty || 1);
      /* Gear sorts ahead of trade goods at the same margin, because the
         reason to craft gear is to wear it. Who it is an upgrade for is
         settled per player in bestAvailable. */
      var bias = out && out.kind === 'gear' ? (out.itemLevel || 0) : 0;
      return { r: r, score: (outValue - inValue) + bias };
    }).sort(function (a, b) { return b.score - a.score; })
      .map(function (x) { return x.r; });
  }

  function usable(design, agent, r) {
    if ((agent.lv || 1) < (r.levelReq || 1)) return false;
    if (!knows(agent, r)) return false;
    return canAfford(agent, r);
  }

  function available(design, agent, ranked) {
    var list = ranked || rankRecipes(design);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (usable(design, agent, list[i])) out.push(list[i]);
    }
    return out;
  }

  /* The single best thing this player can make. Scored for them: gear
     they would actually wear beats gold every time, and a reagent is
     worth what it is a step towards. */
  function bestAvailable(design, agent, ranked, opts) {
    var list = ranked || rankRecipes(design);
    var best = null, bestScore = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!usable(design, agent, r)) continue;
      var score = craftAppeal(design, agent, r, opts);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  /* ------------------------------------------------------------- design --

     How much crafting this design actually has, for the need axes and the
     content inventory.                                                 */
  var summary = U.memoDesign(function (design) {
    var list = recipes(design).filter(function (r) { return r.enabled !== false; });
    var profs = {};
    list.forEach(function (r) { profs[r.profession] = (profs[r.profession] || 0) + 1; });
    var looted = list.filter(function (r) { return r.source === 'looted'; }).length;
    var gearRecipes = list.filter(function (r) {
      var it = IT.itemById(design, r.outputId);
      return it && it.kind === 'gear';
    });
    var viable = list.filter(function (r) { return !recipeIssues(design, r).length; }).length;
    /* How close crafted gear actually gets to what drops. This used to be
       a slider called craftParity; it is now read off the recipes, so a
       design claiming crafted gear matters has to author gear that does. */
    var parity = gearRecipes.length
      ? U.avg(gearRecipes, function (r) { return recipeMetrics(design, r).parity; }) : 0;
    return {
      recipes: list.length, professions: U.keys(profs).length, byProfession: profs,
      looted: looted, makesGear: gearRecipes.length, viable: viable, parity: parity,
      competitive: gearRecipes.filter(function (r) {
        return recipeMetrics(design, r).competitive; }).length,
      /* Hours of content crafting represents. Gathering and making are
         both real time, and a looted recipe adds a hunt on top. */
      hours: list.length * 0.9 + looted * 1.6 + gearRecipes.length * 0.7
    };
  });

  /* Seed a believable starter set from whatever materials exist, so the
     tab is not a blank page on a design that already has an economy. */
  function generate(design, opts) {
    opts = opts || {};
    var rng = opts.rng || new U.Rng(design.seed || 7);
    var mats = (design.items || []).filter(function (i) { return i.kind === 'material'; });
    var gear = (design.items || []).filter(function (i) { return i.kind === 'gear'; })
      .sort(function (a, b) { return a.itemLevel - b.itemLevel; });
    var levelCap = Math.max(1, (design.progression || {}).levelCap || 60);
    var topIlvl = gear.length ? Math.max(1, gear[gear.length - 1].itemLevel || 1) : 1;
    var cons = (design.items || []).filter(function (i) { return i.kind === 'consumable'; });
    if (!mats.length) return [];
    var made = [];

    /* Reagent counts come from what the result is worth, never a fixed
       number - a flat "two of something" is free money on a cheap herb
       and a losing trade on a raid reagent.

       Dividing a total quantity between reagents and rounding each share
       overshot the budget badly on small numbers (three units split two
       ways came out as four), which is how a generated recipe ended up
       costing more than it made. So the reagents are dealt out one at a
       time against the real running cost, cheapest first, and the loop
       stops at the budget rather than near it. */
    /* What a reagent is worth FOR SIZING A RECIPE, which is not the
       same question as what it is worth on the market.

       The market prices a reagent by what consumes it, and at this
       moment nothing does - these are the recipes being written. Asking
       the market here gets zero for every reagent in the list, the
       floor of 0.4 takes over, and a healing potion comes out costing
       a hundred and ninety-one units of ore. A reagent's tier is the
       honest basis before anything consumes it: tier-five ore is worth
       more than tier-one ore whatever the recipe book says. */
    var topTier = 1;
    (design.items || []).forEach(function (i) {
      if (i.kind === 'material') topTier = Math.max(topTier, i.itemLevel || 0); });
    function unitWorth(m) {
      var byTier = 1.5 + (Math.max(0, m.itemLevel || 0) / topTier) * 14;
      return Math.max(byTier, IT.itemDesire(design, m));
    }
    /* Nobody writes a recipe that wants forty of anything. If the
       arithmetic says otherwise the reagent is too cheap for the thing
       it is making, and the answer is fewer of a better one. */
    var MAX_QTY = 24;
    function sizeInputs(worth, kinds, frac) {
      var budget = Math.max(1, worth * frac);
      var inputs = kinds.map(function (m) { return { itemId: m.id, qty: 1 }; });
      var cost = U.sum(kinds, unitWorth);
      /* One reagent at a time, always the cheapest that still fits. */
      for (var guard = 0; guard < 400; guard++) {
        var best = -1, bestUnit = Infinity;
        for (var k = 0; k < kinds.length; k++) {
          if (inputs[k].qty >= MAX_QTY) continue;
          var unit = unitWorth(kinds[k]);
          if (cost + unit <= budget && unit < bestUnit) { best = k; bestUnit = unit; }
        }
        if (best < 0) break;
        inputs[best].qty += 1;
        cost += bestUnit;
      }
      return inputs;
    }
    /* And pick reagents the result can actually afford, so a starter
       potion is not asking for a raid reagent. */
    function affordable(pool, worth, frac, want) {
      var ceiling = Math.max(1, worth * frac) / Math.max(1, want);
      var fits = pool.filter(function (m) { return unitWorth(m) <= ceiling; });
      if (fits.length >= want) return rng.shuffle(fits).slice(0, want);
      var cheapest = pool.slice().sort(function (a, b) {
        return unitWorth(a) - unitWorth(b); });
      return cheapest.slice(0, Math.max(1, Math.min(want, cheapest.length)));
    }

    /* A few consumable recipes everyone knows. */
    cons.slice(0, 3).forEach(function (c, i) {
      var qty = 2;
      var worth = IT.itemDesire(design, c) * qty;
      var kinds = affordable(mats, worth, 0.62, 1);
      made.push(newRecipe({
        name: c.name, profession: i % 2 ? 'cooking' : 'alchemy',
        outputId: c.id, outputQty: qty,
        inputs: sizeInputs(worth, kinds, 0.62),
        source: 'known', levelReq: 1, craftHours: 0.04
      }));
    });

    /* And some gear, the best of it behind a looted recipe - which is what
       makes a crafter worth knowing. Reagent counts are derived from what
       the result is actually worth, so a generated recipe is worth making
       by construction rather than by luck. */
    var picks = gear.filter(function (g, i) { return i % Math.max(1, Math.floor(gear.length / 6)) === 0; })
      .slice(0, 6);
    picks.forEach(function (g, i) {
      var rare = i >= picks.length - 2;
      var rec = null;
      if (rare) {
        rec = IT.newItem({
          name: 'Pattern: ' + g.name, kind: 'recipe', rarity: 'rare',
          vendorValue: 200, desc: 'Teaches how to make ' + g.name + '.'
        });
        design.items.push(rec);
      }
      /* Aim for reagents costing about two thirds of the result, so there
         is a real margin without making crafting free money. */
      var frac = rare ? 0.60 : 0.68;
      var worth = IT.itemDesire(design, g);
      var kinds = affordable(mats, worth, frac, rare ? 3 : 2);
      var inputs = sizeInputs(worth, kinds, frac);
      made.push(newRecipe({
        name: g.name, profession: g.slot === 'mainHand' || g.slot === 'offHand'
          ? 'smithing' : rng.pick(['smithing', 'leatherwork', 'tailoring', 'jewelcraft']),
        outputId: g.id, outputQty: 1,
        inputs: inputs,
        source: rare ? 'looted' : 'known',
        recipeItemId: rec ? rec.id : null,
        /* Item level and character level are different scales. Mapping one
           straight onto the other put level-102 requirements in a game
           whose level cap is 60. */
        levelReq: Math.max(1, Math.round(levelCap * U.clamp01((g.itemLevel || 10) / topIlvl))),
        craftHours: rare ? 0.2 : 0.08
      }));
    });


    made.forEach(function (r) { recipes(design).push(r); });
    return made;
  }

  PN.crafting = {
    PROFESSIONS: PROFESSIONS, PROFESSION_BY_ID: PROFESSION_BY_ID,
    SOURCES: SOURCES, SOURCE_BY_ID: SOURCE_BY_ID,
    newRecipe: newRecipe, recipes: recipes, recipeById: recipeById, recipesFor: recipesFor,
    recipeMetrics: recipeMetrics, recipeIssues: recipeIssues,
    orphanRecipeItems: orphanRecipeItems,
    knows: knows, canAfford: canAfford, craft: craft, available: available,
    rankRecipes: rankRecipes, bestAvailable: bestAvailable, craftAppeal: craftAppeal,
    craftValue: craftValue, consumersOf: consumersOf, usable: usable,
    dropsSomewhere: dropsSomewhere,
    summary: summary, generate: generate
  };
})(window.PN);
