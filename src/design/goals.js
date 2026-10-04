/* Patch Notes - what a player still has left to chase.

   Novelty used to be a treadmill: it came almost entirely from hours
   spent on content a player had NOT SEEN BEFORE. Once they had seen your
   dungeon, running it again fed them nothing, so every game decayed no
   matter how well it was designed and the only cure was to keep shipping.

   That is not how the genre works. People stay for years in a game whose
   content they have seen, because what holds them is not novelty - it is
   an unfinished list. Hit the cap. Do every quest. Clear the raid. Get
   the drop that has not dropped yet. A two percent chance keeps somebody
   logging in for months precisely BECAUSE they have not got it.

   So this module answers one question: given everything you have built,
   what does this player still have left to want? Two rules make the
   answer honest:

     - Only content they can actually reach counts. A sword that exists
       in the design but drops nowhere, is on no vendor and is in no
       recipe is not a goal, it is a row in your items list.
     - Not everybody wants everything. A raider chases the raid; a
       socialite does not. The archetype decides which parts of the list
       are theirs, and people still leave with the list unfinished.    */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items;

  /* The things an MMO gives people to finish, and who cares about each.
     Weights are how much of THIS player's reason to log in that goal is
     worth; they are normalised per archetype, so a raider with no raids
     to run is genuinely short of things to do.                        */
  var GOALS = [
    { id: 'levelCap', name: 'Reach the level cap',
      want: { progressor: 1.0, raider: 0.85, completionist: 0.9, competitor: 0.7,
              explorer: 0.45, socialite: 0.35, economist: 0.4, roleplayer: 0.4,
              drifter: 0.55, creator: 0.3 } },
    { id: 'quests', name: 'Finish the quests',
      want: { progressor: 0.7, raider: 0.25, completionist: 1.0, competitor: 0.1,
              explorer: 0.85, socialite: 0.35, economist: 0.2, roleplayer: 0.9,
              drifter: 0.4, creator: 0.35 } },
    { id: 'dungeons', name: 'Clear every dungeon',
      want: { progressor: 0.6, raider: 0.75, completionist: 0.95, competitor: 0.35,
              explorer: 0.5, socialite: 0.6, economist: 0.2, roleplayer: 0.3,
              drifter: 0.35, creator: 0.15 } },
    { id: 'raids', name: 'Clear every raid',
      want: { progressor: 0.45, raider: 1.0, completionist: 0.9, competitor: 0.3,
              explorer: 0.2, socialite: 0.5, economist: 0.15, roleplayer: 0.2,
              drifter: 0.15, creator: 0.1 } },
    { id: 'bis', name: 'Get best in slot',
      want: { progressor: 0.9, raider: 1.0, completionist: 0.8, competitor: 0.85,
              explorer: 0.25, socialite: 0.2, economist: 0.45, roleplayer: 0.25,
              drifter: 0.3, creator: 0.1 } },
    { id: 'professions', name: 'Level the professions',
      want: { progressor: 0.35, raider: 0.2, completionist: 0.85, competitor: 0.1,
              explorer: 0.45, socialite: 0.35, economist: 1.0, roleplayer: 0.5,
              drifter: 0.3, creator: 0.45 } },
    { id: 'collection', name: 'Collect the cosmetics',
      want: { progressor: 0.3, raider: 0.25, completionist: 1.0, competitor: 0.15,
              explorer: 0.55, socialite: 0.7, economist: 0.35, roleplayer: 0.95,
              drifter: 0.3, creator: 0.8 } },
    { id: 'talents', name: 'Try the other builds',
      want: { progressor: 0.45, raider: 0.55, completionist: 0.6, competitor: 0.9,
              explorer: 0.35, socialite: 0.2, economist: 0.15, roleplayer: 0.55,
              drifter: 0.35, creator: 0.5 } },
    { id: 'pvp', name: 'Climb the ladder',
      want: { progressor: 0.2, raider: 0.25, completionist: 0.4, competitor: 1.0,
              explorer: 0.1, socialite: 0.3, economist: 0.1, roleplayer: 0.15,
              drifter: 0.25, creator: 0.1 } }
  ];
  var GOAL_BY_ID = {};
  GOALS.forEach(function (g) { GOAL_BY_ID[g.id] = g; });

  /* ------------------------------------------------------ the catalogue --

     How much of each goal your design actually contains, counting only
     what a player can reach. Memoised against the design, because it is
     read once per player per week. */
  var catalogue = U.memoDesign(function (design) {
    var out = {
      levelCap: (design.progression && design.progression.levelCap) || 1,
      quests: (design.quests || []).length,
      dungeons: 0, raids: 0,
      /* Bosses, not instances. "Clear every raid" is a question about
         what is in the raid, and a flat six-per-raid could not answer
         it for a two-boss one. */
      dungeonBosses: 0, raidBosses: 0, dungeonRuns: 0,
      bis: 0, bisTotal: 0,
      professions: 0,
      collection: 0,
      talents: 0,
      pvp: 0
    };

    (design.dungeons || []).forEach(function (dg) {
      /* An instance with no bosses is not something anyone can clear. */
      if (!PN.schema.bossesIn(design, dg).length) return;
      var bosses = PN.schema.bossesIn(design, dg).length;
      /* Harder tiers are more to clear, because clearing one is not
         clearing the other. */
      var tiers = Math.max(1, (dg.tiers || []).length);
      if (dg.kind === 'raid') { out.raids++; out.raidBosses += bosses * tiers; }
      else {
        out.dungeons++;
        out.dungeonBosses += bosses * tiers;
        out.dungeonRuns += tiers * 3;
      }
    });

    /* Best in slot only counts gear somebody can get their hands on.
       This is the rule that makes a rare drop worth chasing and an
       unplaced item worth nothing. */
    /* A slot family like "ring" is two physical slots, and you cannot
       wear the same ring twice - so the second one wants the SECOND
       best. Telling a fully geared player to go and equip a duplicate
       of what they are already wearing is why this goal never
       finished. */
    var bySlot = {}, perSlot = {};
    (design.items || []).forEach(function (it) {
      if (it.kind !== 'gear' || !it.slot) return;
      out.bisTotal++;
      if (IT.isOrphan(design, it)) return;
      PN.stats.slotsFor(it.slot).forEach(function (s) {
        (perSlot[s] = perSlot[s] || []).push(it);
      });
    });
    U.keys(perSlot).forEach(function (s) {
      perSlot[s].sort(function (a, b) {
        return IT.itemDesire(design, b) - IT.itemDesire(design, a); });
    });
    /* Walk the families so the second ring gets the runner-up. */
    var used = {};
    U.keys(perSlot).sort().forEach(function (s) {
      var list = perSlot[s];
      for (var k = 0; k < list.length; k++) {
        if (used[list[k].id]) continue;
        bySlot[s] = list[k];
        used[list[k].id] = 1;
        return;
      }
      if (list.length) bySlot[s] = list[0];   /* only one exists */
    });
    out.bis = U.keys(bySlot).length;
    out.bisBySlot = bySlot;

    /* A profession is only something to level if there is something in
       it worth making. One broken recipe under a heading is a heading,
       not a profession - so a recipe only counts when it makes a real
       item out of real reagents that the player can get.

       Counting empty headings was telling players to go and level a
       trade that does not exist. */
    var profs = {};
    PN.crafting.recipes(design).forEach(function (r) {
      if (r.enabled === false) return;
      if (PN.crafting.recipeIssues(design, r).length) return;
      var made = IT.itemById(design, r.outputId);
      if (!made) return;
      /* And the reagents have to be gettable, or the recipe is a wall. */
      var reachable = (r.inputs || []).every(function (i) {
        var mat = IT.itemById(design, i.itemId);
        return mat && !IT.isOrphan(design, mat);
      });
      if (!reachable) return;
      profs[r.profession] = (profs[r.profession] || 0) + 1;
    });
    /* Two or three makeable things is a profession; one is a novelty. */
    out.professions = U.keys(profs).filter(function (k) {
      return profs[k] >= 2; }).length;
    out.recipesByProfession = profs;
    /* What "levelled" means, scaled to how much there is to make. A
       trade with four recipes is not the same job as one with forty,
       and a flat thirty crafts per profession meant nobody ever
       finished this goal in a small game or noticed it in a big one. */
    out.craftTarget = 0;
    U.keys(profs).forEach(function (k) {
      if (profs[k] >= 2) out.craftTarget += 4 + profs[k] * 2.5;
    });

    out.collection = (design.items || []).filter(function (i) {
      return (i.kind === 'cosmetic' || i.kind === 'mount') && !IT.isOrphan(design, i);
    }).length;

    if (PN.talents.isTalentMode(design)) {
      out.talents = PN.talents.branches(design).length;
    } else {
      out.talents = U.sum(design.classes || [], function (c) {
        return Math.max(1, (c.specs || []).length);
      });
    }

    out.pvp = design.pvp && design.pvp.enabled ? Math.max(1, (design.pvpMaps || []).length) : 0;

    /* How much there is to chase at all, in one number, so the design
       screens can say whether a game has an endgame. */
    out.depth = out.quests * 0.9 + out.dungeons * 9 + out.raids * 22 +
                out.bis * 3.2 + out.professions * 6 + out.collection * 1.4 +
                out.talents * 5 + out.pvp * 7 + out.levelCap * 0.8;
    return out;
  });

  /* --------------------------------------------------- a player's list --

     How far through each goal this player is, 0 to 1. Anything they have
     finished stops pulling; anything they have not is a reason to log in
     again. */
  function progressOf(design, agent, cat) {
    cat = cat || catalogue(design);
    var p = {};
    var cap = Math.max(1, cat.levelCap);

    p.levelCap = U.clamp01((agent.lv || 1) / cap);
    p.quests = cat.quests > 0 ? U.clamp01((agent.qd || 0) / cat.quests) : 1;

    /* Clearing the instances you built, measured against the instances
       you actually built. "A few clears each" used to be a flat six per
       raid whatever was in it, so a game with one two-boss raid asked
       for six kills and then stopped at eighty-three percent because
       the player had five. It now counts the bosses, on the hardest
       tier you offer, which is what "cleared it" means. */
    /* Dungeon runs, against the dungeons you built AND the difficulties
       you put on them - a couple of clears of each tier. Counting two
       runs per dungeon regardless of tiers made a deep game finish as
       fast as a shallow one, which is the opposite of the point. */
    p.dungeons = cat.dungeonRuns > 0
      ? U.clamp01((agent.dr || 0) / cat.dungeonRuns) : 1;
    p.raids = cat.raidBosses > 0
      ? U.clamp01((agent.bk || 0) / cat.raidBosses) : 1;

    /* Best in slot.

       This used to compare the worn item's ID against one item the
       catalogue had picked for the slot, so a player in a full set of
       equally good gear read as having none of it: every tie went to
       whichever item happened to be first, and the second ring and
       second trinket were told to go and wear a duplicate of the first,
       which is not a thing anybody can do.

       What it measures now is whether you are wearing something as good
       as the best you could be wearing, judged by what it is worth to
       YOU - which is the question the goal was always asking. */
    if (cat.bis > 0) {
      var have = 0;
      U.keys(cat.bisBySlot).forEach(function (slotId) {
        var want = cat.bisBySlot[slotId];
        var wornId = agent.g ? agent.g[slotId] : null;
        if (!wornId) return;
        var worn = IT.itemById(design, wornId);
        if (!worn) return;
        if (wornId === want.id) { have++; return; }
        /* As good as, rather than identical to. */
        var mine = IT.itemDesire(design, worn);
        var best = IT.itemDesire(design, want);
        if (best <= 0 || mine >= best * 0.97) have++;
      });
      p.bis = U.clamp01(have / cat.bis);
    } else p.bis = 1;

    /* Levelling a profession is making things in it. What "levelled"
       means is scaled to how much there is to make: a trade with four
       recipes is not the same job as one with forty. */
    p.professions = cat.craftTarget > 0
      ? U.clamp01((agent.cr || 0) / cat.craftTarget) : 1;

    p.collection = cat.collection > 0
      ? U.clamp01(U.keys(agent.inv || {}).length / cat.collection) : 1;
    /* Trying other builds is a function of time played, not of an item. */
    p.talents = cat.talents > 0
      ? U.clamp01((agent.t || 0) / (cat.talents * 14)) : 1;

    /* Climbing the ladder is a question about the ladder.

       It was reading agent.sp - which is MONEY SPENT - divided by nine
       hundred, so "climb the ladder" was quietly measuring the player's
       wallet and the rank one player sat at fourteen percent because
       they had spent a hundred and twenty-six pounds. It now reads the
       two things climbing actually consists of: showing up, and winning
       once you are there. */
    if (cat.pvp > 0) {
      var games = (agent.pvpWins || 0) + (agent.pvpLosses || 0);
      var played = U.clamp01((agent.pvpWeeks || 0) / 10);
      var winning = games >= 12
        ? U.clamp01(((agent.pvpWins || 0) / games - 0.42) / 0.28) : 0;
      p.pvp = U.clamp01(played * 0.45 + winning * 0.55);
    } else p.pvp = 1;
    return p;
  }

  /* What this player still has to want, 0 to 1, weighted by who they are.

     This is the evergreen number. It does not burn down when content is
     consumed - it burns down when content is FINISHED, which is a much
     slower thing and is exactly what keeps people subscribed. */
  /* pre is a progress object the caller has already worked out. The
     weekly tick computes one per player for the reward model and then
     asked for another one here, which is the same fourteen microseconds
     twice for every player in the game. */
  function outstanding(design, agent, cat, pre) {
    cat = cat || catalogue(design);
    var arch = agent.a || 'progressor';
    var p = pre || progressOf(design, agent, cat);
    var num = 0, den = 0;
    GOALS.forEach(function (g) {
      var w = g.want[arch];
      if (w === undefined) w = 0.4;
      /* A goal your design does not contain is not a goal they can miss;
         it simply is not on their list. */
      var present = g.id === 'levelCap' ? cat.levelCap > 1
                  : g.id === 'bis' ? cat.bis > 0
                  : (cat[g.id] || 0) > 0;
      if (!present) return;
      den += w;
      num += w * (1 - U.clamp01(p[g.id]));
    });
    if (den <= 0) return 0;
    return U.clamp01(num / den);
  }

  /* The same question for a whole cohort rather than one player, for the
     population model that runs before there are agents. */
  function outstandingFor(design, archId, levelPct, tenureWeeks) {
    var cat = catalogue(design);
    var fake = {
      a: archId,
      lv: Math.max(1, Math.round(cat.levelCap * U.clamp01(levelPct))),
      qd: cat.quests * U.clamp01(levelPct * 0.8),
      dr: cat.dungeons * 4 * U.clamp01((tenureWeeks || 0) / 30),
      bk: cat.raids * 6 * U.clamp01((tenureWeeks || 0) / 45),
      cr: cat.professions * 30 * U.clamp01((tenureWeeks || 0) / 40),
      t: tenureWeeks || 0, sp: 0, g: {}, inv: {}
    };
    return outstanding(design, fake, cat);
  }

  /* What is unreachable, for the design screens. An item nobody can get
     is not just wasted work - it is a goal your players cannot chase. */
  function unreachable(design) {
    return (design.items || []).filter(function (i) {
      return i.kind === 'gear' && i.slot && IT.isOrphan(design, i);
    });
  }

  PN.goals = {
    GOALS: GOALS, GOAL_BY_ID: GOAL_BY_ID,
    catalogue: catalogue, progressOf: progressOf,
    outstanding: outstanding, outstandingFor: outstandingFor,
    unreachable: unreachable
  };
})(window.PN);
