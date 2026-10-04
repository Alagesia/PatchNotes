/* Patch Notes - talent trees.

   A game either has classes or it has a talent tree. Classes hand you a
   finished character; a tree hands you a budget and lets you build one.
   Both end up feeding the same combat solver, because what the solver
   needs is a list of abilities and a role - it does not care whether a
   designer stapled them together or a player did.

   So a talent branch is compiled down into a class-shaped "build", and
   everything downstream (balance, time-to-kill, the agent sim) carries
   on working without knowing which system is switched on.              */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* ------------------------------------------------------------- kinds */

  /* What a single node can hand a player. Three kinds is enough: the
     interesting one is 'ability', and a tree made only of the other two
     is exactly the filler tree every player complains about.           */
  var NODE_KINDS = [
    { id: 'ability', name: 'Grants an ability',
      desc: 'A new button. The only node type players screenshot.' },
    { id: 'stat', name: 'Stat bonus',
      desc: 'A percentage on a stat. Necessary glue - deadly in bulk.' },
    { id: 'passive', name: 'Passive modifier',
      desc: 'Changes how your existing kit behaves. Cheap to build, reads as power.' }
  ];
  var NODE_KIND_BY_ID = {};
  NODE_KINDS.forEach(function (k) { NODE_KIND_BY_ID[k.id] = k; });

  /* Passive levers, and how each one lands on the character profile. */
  var PASSIVES = [
    { id: 'damage',   name: 'Damage done',     field: 'dmg',   cap: 40, joy: 4 },
    { id: 'healing',  name: 'Healing done',    field: 'heal',  cap: 40, joy: 4 },
    { id: 'mitigation', name: 'Damage taken',  field: 'mit',   cap: 35, joy: 5,
      desc: 'Reduces incoming damage. Tanks live and die on these.' },
    { id: 'health',   name: 'Maximum health',  field: 'hp',    cap: 35, joy: 3 },
    { id: 'resource', name: 'Resource economy', field: 'res',  cap: 50, joy: 6,
      desc: 'More casts before you run dry. Changes a rotation more than damage does.' },
    { id: 'cooldown', name: 'Cooldown recovery', field: 'cdr', cap: 30, joy: 8,
      desc: 'The most exciting talent stat in the genre, and the hardest to balance.' },
    { id: 'threat',   name: 'Threat generated', field: 'threat', cap: 90, joy: 2 },
    { id: 'mobility', name: 'Movement speed',  field: 'move',  cap: 30, joy: 7 }
  ];
  var PASSIVE_BY_ID = {};
  PASSIVES.forEach(function (p) { PASSIVE_BY_ID[p.id] = p; });

  /* ------------------------------------------------------- factories -- */

  function newBranch(name, opts) {
    opts = opts || {};
    return {
      id: U.id('brn'), name: name || 'New Branch',
      role: opts.role || 'dps',              /* tank | healer | dps | hybrid */
      fantasy: opts.fantasy || '',
      armour: opts.armour || 'medium',
      resource: opts.resource || 'mana',
      primaryStat: opts.primaryStat || null,
      /* Points that must be spent in this branch before each tier opens.
         Five is the genre default and the reason a deep talent costs you
         the whole branch above it. */
      pointsPerTier: opts.pointsPerTier === undefined ? 5 : opts.pointsPerTier,
      tuning: opts.tuning === undefined ? 0 : opts.tuning,
      enabled: true
    };
  }

  function newNode(name, opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('tln'), name: name || 'New Talent',
      branchId: opts.branchId || null,
      /* Row in the tree. A tier is gated on points already spent in this
         branch, which is what makes a tree a climb rather than a menu. */
      tier: opts.tier === undefined ? 1 : opts.tier,
      kind: opts.kind || 'ability',
      abilityId: opts.abilityId || null,               /* kind === 'ability'  */
      statId: opts.statId || null,                     /* kind === 'stat'     */
      passiveId: opts.passiveId || 'damage',           /* kind === 'passive'  */
      magnitude: opts.magnitude === undefined ? 5 : opts.magnitude,  /* % per rank */
      ranks: opts.ranks === undefined ? 1 : opts.ranks,
      cost: opts.cost === undefined ? 1 : opts.cost,   /* points per rank */
      /* Specific talents that must already be taken. This is the line
         drawn between two nodes in the tree. */
      requires: opts.requires || [],
      /* Nodes sharing a choice group are alternatives: you take exactly
         one of them, however many there are. Replaces the old pairwise
         exclusiveWith, which could only ever express a choice of two. */
      choiceGroup: opts.choiceGroup || null,
      desc: opts.desc || ''
    };
  }

  function newTree() { return { branches: [], nodes: [] }; }

  /* ---------------------------------------------------------- lookups -- */

  function tree(design) {
    if (!design.talents) design.talents = newTree();
    if (!design.talents.branches) design.talents.branches = [];
    if (!design.talents.nodes) design.talents.nodes = [];
    /* Old trees used a pairwise exclusiveWith tag. A choice group says the
       same thing and can hold more than two, so fold them forward. */
    design.talents.nodes.forEach(function (n) {
      if (n.exclusiveWith && !n.choiceGroup) n.choiceGroup = n.exclusiveWith;
      if (!n.requires) n.requires = [];
    });
    design.talents.branches.forEach(function (b) {
      if (b.pointsPerTier === undefined) b.pointsPerTier = 5;
    });
    return design.talents;
  }
  function branches(design) {
    return tree(design).branches.filter(function (b) { return b.enabled !== false; });
  }
  function branchById(design, id) { return U.byId(tree(design).branches, id); }
  function nodeById(design, id) { return U.byId(tree(design).nodes, id); }
  function nodesOf(design, branchId) {
    return tree(design).nodes
      .filter(function (n) { return n.branchId === branchId; })
      .sort(function (a, b) { return a.tier - b.tier; });
  }
  function tiersOf(design, branchId) {
    var t = {};
    nodesOf(design, branchId).forEach(function (n) { t[n.tier] = (t[n.tier] || []).concat([n]); });
    return t;
  }

  function isTalentMode(design) {
    return (design.progression || {}).characterSystem === 'talent';
  }

  /* Points a player has to spend by the level cap. This is the budget the
     whole system balances against - a 90-node tree with 20 points is a
     build game, the same tree with 90 points is a checklist.            */
  function pointsBudget(design) {
    var P = design.progression || {};
    var per = P.talentPointsPerLevel === undefined ? 1 : P.talentPointsPerLevel;
    var cap = P.levelCap || 60;
    return Math.max(1, Math.round(cap * per));
  }
  function nodeCost(n) { return Math.max(1, n.cost || 1) * Math.max(1, n.ranks || 1); }

  /* ------------------------------------------------------ compilation --

     A branch becomes a playable build by spending the point budget down
     it, cheapest tier first, the way a player reading a guide would. Any
     points left over splash into the next branch, which is why a big
     budget quietly homogenises every build in the game.                 */

  /* Can this node be taken right now? Three gates, and they are the three
     things that make a tree a tree rather than a shopping list:
       - the tier is open, which costs points spent in this branch
       - every prerequisite is already taken
       - no sibling in its choice group has been taken instead          */
  function nodeAvailable(design, node, state) {
    if (state.taken[node.id]) return false;
    var branch = branchById(design, node.branchId);
    var per = branch && branch.pointsPerTier !== undefined ? branch.pointsPerTier : 5;
    var need = Math.max(0, ((node.tier || 1) - 1)) * per;
    if ((state.inBranch[node.branchId] || 0) < need) return false;
    var reqs = node.requires || [];
    for (var i = 0; i < reqs.length; i++) if (!state.taken[reqs[i]]) return false;
    if (node.choiceGroup && state.chosen[node.choiceGroup]) return false;
    return true;
  }

  /* How much a player following a guide wants this node.

     This used to be role-blind and kind-blind: every stat node scored
     "1 plus a bit", so a tank branch spent its points on damage passives
     and a thirty-percent armour talent was the last thing anybody took.
     An armour talent works - it multiplies the armour on your gear and
     the mitigation shows up in effective health - but nothing in the
     simulation would ever buy it, so authoring one looked like it did
     nothing at all.

     What a talent is worth depends on the job the branch does. Armour
     and stamina are what a tank is for; the damage stat is what a damage
     build is for; a healer wants throughput and the resource to sustain
     it.                                                               */
  var ROLE_PASSIVE_WEIGHT = {
    tank:   { mit: 2.2, hp: 2.0, threat: 1.6, dmg: 0.7, heal: 0.5, res: 1.0, cdr: 1.2, move: 0.8 },
    healer: { heal: 2.2, res: 1.9, mit: 0.9, hp: 1.0, dmg: 0.4, threat: 0.2, cdr: 1.3, move: 0.9 },
    dps:    { dmg: 2.2, cdr: 1.4, res: 1.1, mit: 0.7, hp: 0.7, heal: 0.4, threat: 0.2, move: 0.9 },
    hybrid: { dmg: 1.4, heal: 1.3, mit: 1.1, hp: 1.0, res: 1.2, cdr: 1.3, threat: 0.6, move: 0.9 }
  };

  /* Which stats a role actually gears for, beyond its primary. */
  function statWeightFor(design, role, statId) {
    var s = PN.stats.statSetOf(design);
    if (statId === s.armour.id) return role === 'tank' ? 2.2 : 0.8;
    if (statId === s.stamina.id) return role === 'tank' ? 1.8 : 0.9;
    for (var i = 0; i < s.primaries.length; i++) {
      if (s.primaries[i].id === statId) return 1.9;
    }
    return 1.2;                     /* a secondary - always worth something */
  }

  function nodeAppeal(node, role, design) {
    if (node.kind === 'ability') return 10;
    var total = (node.magnitude || 0) * (node.ranks || 1);
    if (node.kind === 'passive') {
      var p = PASSIVE_BY_ID[node.passiveId];
      if (!p) return 2;
      var w = (ROLE_PASSIVE_WEIGHT[role] || ROLE_PASSIVE_WEIGHT.dps)[p.field];
      if (w === undefined) w = 1;
      return (2 + p.joy * 0.6 + total * 0.10) * w;
    }
    if (node.kind === 'stat') {
      var sw = design ? statWeightFor(design, role, node.statId) : 1.2;
      return (1.2 + total * 0.14) * sw;
    }
    return 1 + total * 0.05;
  }

  /* Climb a branch: repeatedly take the best node that is actually open,
     paying the tier gates as you go. A greedy climb is what a player
     following a guide does, and it is the only way the gates mean
     anything - spending down a flat list ignores them entirely.      */
  function spendDown(design, list, budget, acc, state, role) {
    var spent = 0;
    var guard = 0;
    while (spent < budget && guard++ < 500) {
      var best = null, bestScore = -1;
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (!nodeAvailable(design, n, state)) continue;
        var c = nodeCost(n);
        if (spent + c > budget) continue;
        var score = nodeAppeal(n, role || 'dps', design) / Math.max(1, c);
        if (score > bestScore) { bestScore = score; best = n; }
      }
      if (!best) break;
      var cost = nodeCost(best);
      spent += cost;
      state.taken[best.id] = 1;
      state.inBranch[best.branchId] = (state.inBranch[best.branchId] || 0) + cost;
      if (best.choiceGroup) state.chosen[best.choiceGroup] = best.id;
      acc.taken.push(best);
      if (best.kind === 'ability' && best.abilityId) {
        if (acc.abilities.indexOf(best.abilityId) < 0) acc.abilities.push(best.abilityId);
      } else if (best.kind === 'stat' && best.statId) {
        acc.stats[best.statId] = (acc.stats[best.statId] || 0) +
          best.magnitude * (best.ranks || 1);
      } else if (best.kind === 'passive') {
        var p = PASSIVE_BY_ID[best.passiveId];
        if (p) acc.mods[p.field] = (acc.mods[p.field] || 0) + best.magnitude * (best.ranks || 1);
      }
    }
    return spent;
  }

  /* Passives are percentages, and percentages stack into nonsense if you
     let them. Everything lands on a soft cap.                           */
  function capMods(mods) {
    var out = {};
    PASSIVES.forEach(function (p) {
      var v = mods[p.field] || 0;
      if (!v) return;
      out[p.field] = p.cap * (1 - Math.exp(-v / p.cap));
    });
    return out;
  }

  /* Who a build splashes into. Players pick one other branch and commit -
     they do not sprinkle single points across the whole tree. Same role
     first, because that is where the power that helps them lives.      */
  function splashTarget(design, branch) {
    var others = branches(design).filter(function (b) { return b.id !== branch.id; });
    if (!others.length) return null;
    var sameRole = others.filter(function (b) { return b.role === branch.role; });
    var pool = sameRole.length ? sameRole : others;
    /* Deterministic, and stable as the tree is edited. */
    var i = 0, all = branches(design);
    all.forEach(function (b, ix) { if (b.id === branch.id) i = ix; });
    return pool[i % pool.length];
  }

  function buildFor(design, branch) {
    var budget = pointsBudget(design);
    var acc = { abilities: [], stats: {}, mods: {}, taken: [] };
    /* One climb, carried across both branches: what you took, how much you
       have spent in each branch, and which choice groups you have used. */
    var state = { taken: {}, inBranch: {}, chosen: {} };

    /* Your own branch gets the whole budget first. Whatever it cannot
       absorb - because you ran out of tree, or the next tier is still
       locked, or you hit a choice you already made - is what goes
       somewhere else. That leftover is the honest measure of whether the
       budget is too big for the tree you authored.                    */
    var spent = spendDown(design, nodesOf(design, branch.id), budget, acc, state, branch.role);

    var rest = budget - spent;
    var splash = rest > 0 ? splashTarget(design, branch) : null;
    if (splash) spent += spendDown(design, nodesOf(design, splash.id), rest, acc, state, branch.role);

    return {
      id: branch.id, name: branch.name,
      role: branch.role, fantasy: branch.fantasy,
      armour: branch.armour, resource: branch.resource,
      primaryStat: branch.primaryStat,
      abilities: acc.abilities,
      specs: [{ id: branch.id + '-spc', name: branch.name, role: branch.role,
                abilities: acc.abilities }],
      tuning: branch.tuning || 0, enabled: true,
      derived: true, branchId: branch.id,
      talentStats: acc.stats,
      talentMods: capMods(acc.mods),
      pointsSpent: spent, pointsBudget: budget,
      splashedInto: splash ? splash.name : null,
      /* The nodes this build actually took, in the order it took them. */
      taken: acc.taken,
      nodesTaken: acc.taken.length
    };
  }

  function builds(design) {
    return branches(design).map(function (b) { return buildFor(design, b); });
  }

  /* ------------------------------------------------------ tree health --

     The old build had a "filler node ratio" slider, which is backwards:
     filler is not something you dial in, it is something you can measure
     in a tree once you have authored it.                               */

  function isFiller(n) {
    if (n.kind === 'ability') return false;
    var total = (n.magnitude || 0) * (n.ranks || 1);
    /* A stat node used to be filler by definition, which is why a thirty
       percent armour talent was labelled the same as a two percent one.
       Size is the thing that decides: a small number on any lever is
       filler, a big one is a reason to go down this branch. */
    if (n.kind === 'stat') return total < 15;
    var p = PASSIVE_BY_ID[n.passiveId];
    /* A tiny percentage on a boring lever is filler. A big one, or one on
       cooldowns or mobility, changes how you play. */
    if (!p) return true;
    return p.joy <= 4 && total < 12;
  }

  /* The most points anybody can actually spend: every node that is not
     in a choice group, plus the dearest member of each group that is,
     because taking one locks out the rest. */
  function spendableCost(design) {
    var ns = tree(design).nodes;
    var total = 0, groups = {};
    ns.forEach(function (n) {
      var c = nodeCost(n);
      if (!n.choiceGroup) { total += c; return; }
      groups[n.choiceGroup] = Math.max(groups[n.choiceGroup] || 0, c);
    });
    U.keys(groups).forEach(function (g) { total += groups[g]; });
    return total;
  }

  function treeMetrics(design) {
    var t = tree(design);
    var ns = t.nodes;
    var bs = branches(design);
    var budget = pointsBudget(design);
    /* What the tree costs to own, which is not what its nodes add up
       to. You can take exactly one member of a choice group, so a
       twenty-four point tree where everything is a choice is twelve
       points to finish - and reading the raw sum made it look like
       there was twice as much tree left as there was. */
    var totalCost = spendableCost(design);
    var fillerCount = ns.filter(isFiller).length;
    var abilityNodes = ns.filter(function (n) { return n.kind === 'ability'; }).length;
    var choiceNodes = ns.filter(function (n) { return !!n.choiceGroup; }).length;
    /* What the nodes add up to if you could take all of them, which
       you cannot - kept so a screen can show both numbers. */
    var rawCost = U.sum(ns, nodeCost);

    /* How much of the tree you can actually own at cap. Near 1 means
       there is no build to make - you just take everything. */
    var reach = totalCost > 0 ? U.clamp(budget / totalCost, 0, 1) : 1;

    var maxTier = 0;
    ns.forEach(function (n) { maxTier = Math.max(maxTier, n.tier || 1); });

    /* Do the compiled builds actually differ from one another? */
    var bl = builds(design);
    var diversity = 0;
    if (bl.length > 1) {
      var pairs = 0, sumDiff = 0;
      for (var i = 0; i < bl.length; i++) {
        for (var j = i + 1; j < bl.length; j++) {
          var a = bl[i].abilities, b = bl[j].abilities;
          var shared = a.filter(function (x) { return b.indexOf(x) >= 0; }).length;
          var union = U.keys(a.concat(b).reduce(function (o, x) { o[x] = 1; return o; }, {})).length;
          sumDiff += union ? 1 - shared / union : 0;
          pairs++;
        }
      }
      diversity = pairs ? sumDiff / pairs : 0;
    }

    var fillerRatio = ns.length ? (fillerCount / ns.length) * 100 : 0;

    /* One score for "is this a good tree", built out of the things that
       actually make talent trees good. */
    var quality = 50
      + (1 - reach) * 26                       /* real choices to make     */
      - Math.max(0, fillerRatio - 35) * 0.42   /* filler past a point      */
      + Math.min(abilityNodes, 24) * 0.9       /* new buttons              */
      + Math.min(choiceNodes, 16) * 0.7        /* authored either/or       */
      + diversity * 22                         /* builds that differ       */
      + Math.min(maxTier, 9) * 1.1             /* depth to climb           */
      - Math.max(0, bs.length - 8) * 3;        /* too many branches to tune */

    return {
      branches: bs.length, nodes: ns.length, abilityNodes: abilityNodes,
      choiceNodes: choiceNodes, fillerCount: fillerCount, fillerRatio: fillerRatio,
      totalCost: totalCost, rawCost: rawCost, budget: budget, reach: reach * 100,
      maxTier: maxTier, diversity: diversity * 100,
      quality: U.clamp100(quality)
    };
  }

  function treeIssues(design) {
    var out = [];
    var t = tree(design);
    if (!branches(design).length) { out.push('No branches - there is nothing to build'); return out; }
    var m = treeMetrics(design);
    if (!m.abilityNodes) out.push('No node grants an ability - every build has an empty bar');
    if (m.reach > 92) out.push('Players can take almost the whole tree - there is no choice to make');
    if (m.fillerRatio > 65) out.push(Math.round(m.fillerRatio) + '% of nodes are filler');
    if (m.diversity < 12 && m.branches > 1) out.push('Every branch compiles to nearly the same build');
    branches(design).forEach(function (b) {
      var ns = nodesOf(design, b.id);
      if (!ns.length) out.push(b.name + ' has no talents in it');
      else if (!ns.some(function (n) { return n.kind === 'ability' && n.abilityId; }))
        out.push(b.name + ' grants no abilities');
    });
    t.nodes.forEach(function (n) {
      if (n.kind === 'ability' && !n.abilityId) out.push(n.name + ' grants no ability');
      if (n.kind === 'stat' && !n.statId) out.push(n.name + ' points at no stat');
    });
    return out;
  }

  /* ---------------------------------------------------------- editing -- */

  function addBranch(design, name) {
    var t = tree(design);
    var b = newBranch(name || 'Branch ' + (t.branches.length + 1));
    t.branches.push(b);
    U.bumpDesign(design);
    return b;
  }
  function removeBranch(design, id) {
    var t = tree(design);
    U.removeById(t.branches, id);
    t.nodes = t.nodes.filter(function (n) { return n.branchId !== id; });
    U.bumpDesign(design);
  }
  function addNode(design, branchId, opts) {
    var t = tree(design);
    var existing = nodesOf(design, branchId);
    var tier = 1;
    existing.forEach(function (n) { tier = Math.max(tier, n.tier || 1); });
    var n = newNode((opts && opts.name) || 'Talent ' + (existing.length + 1),
      U.merge({ branchId: branchId, tier: tier }, opts || {}));
    t.nodes.push(n);
    /* Anything memoised against this design - the build list, the
       content inventory, the goal catalogue - has to be told. */
    U.bumpDesign(design);
    return n;
  }
  function removeNode(design, id) {
    var t = tree(design);
    var gone = nodeById(design, id);
    U.removeById(t.nodes, id);
    U.bumpDesign(design);
    if (!gone) return;
    /* A choice of one is not a choice, so a group that drops below two
       members stops being one. */
    if (gone.choiceGroup) {
      var left = t.nodes.filter(function (x) { return x.choiceGroup === gone.choiceGroup; });
      if (left.length < 2) left.forEach(function (x) { x.choiceGroup = null; });
    }
    /* And nothing may require a talent that no longer exists. */
    t.nodes.forEach(function (n) {
      if (!n.requires || !n.requires.length) return;
      n.requires = n.requires.filter(function (r) { return r !== id; });
    });
  }

  /* -------------------------------------------------------- generation --

     Switching a finished game from classes to talents should not hand the
     player a blank screen. Fold what they already authored into a tree so
     there is something to edit on the first frame.                      */
  function generateFromClasses(design, opts) {
    opts = opts || {};
    var s = PN.stats.statSetOf(design);
    var t = tree(design);
    t.branches = []; t.nodes = [];

    var src = (design.classes || []).filter(function (c) { return c.enabled !== false; });
    if (!src.length) src = [{ name: 'Offence', role: 'dps', abilities: [], armour: 'medium', resource: 'mana' }];

    /* Each role leans on different passives and different secondaries, so
       branches do not all compile to the same three percentages. A tank
       branch that reads identically to a mage branch is the failure mode
       of every generated talent tree.                                  */
    var LEAN = {
      tank:   ['mitigation', 'threat', 'health', 'cooldown'],
      healer: ['healing', 'resource', 'cooldown', 'health'],
      dps:    ['damage', 'cooldown', 'mobility', 'resource'],
      hybrid: ['damage', 'healing', 'mitigation', 'resource']
    };
    var SEC_LEAN = {
      tank:   ['avoidance', 'versatility', 'mastery'],
      healer: ['haste', 'regen', 'crit'],
      dps:    ['crit', 'haste', 'mastery'],
      hybrid: ['versatility', 'haste', 'crit']
    };

    /* Pick a secondary stat by the kind a role wants, falling back to
       whatever the authored stat set actually has. */
    function secFor(role, n) {
      var want = SEC_LEAN[role] || SEC_LEAN.dps;
      for (var k = 0; k < want.length; k++) {
        var kind = want[(n + k) % want.length];
        for (var i = 0; i < s.secondaries.length; i++)
          if (s.secondaries[i].kind === kind) return s.secondaries[i];
      }
      return s.secondaries[n % Math.max(1, s.secondaries.length)] || null;
    }

    src.forEach(function (c, ci) {
      var b = newBranch(c.name, { role: c.role, fantasy: c.fantasy, armour: c.armour,
                                  resource: c.resource, primaryStat: c.primaryStat,
                                  pointsPerTier: 5 });
      t.branches.push(b);

      var lean = LEAN[c.role] || LEAN.dps;
      var abs = (c.abilities || []).slice();
      var tier = 1;
      /* The last ability node placed, so the next tier can be chained off
         it - that chain is the line drawn between two talents. */
      var prev = null;

      abs.forEach(function (abId, i) {
        var ab = PN.abilities.abilityById(design, abId);
        var node = newNode(ab ? ab.name : 'Ability', {
          branchId: b.id, tier: tier, kind: 'ability', abilityId: abId, cost: 1, ranks: 1,
          /* Each new button hangs off the one before it. */
          requires: prev ? [prev] : [],
          desc: 'Unlocks ' + (ab ? ab.name : 'an ability') + '.'
        });
        t.nodes.push(node);
        prev = node.id;

        /* Between buttons, the small nodes that make a tree feel like a
           climb. These are free-standing: they are the points you spend
           to open the next tier. */
        if (i % 2 === 1) {
          var sec = secFor(c.role, i + ci);
          if (sec) t.nodes.push(newNode(sec.name + ' Training', {
            branchId: b.id, tier: tier, kind: 'stat', statId: sec.id,
            magnitude: 3, ranks: 3, cost: 1
          }));
          var p = PASSIVE_BY_ID[lean[(i + ci) % lean.length]] || PASSIVES[0];
          t.nodes.push(newNode(p.name, {
            branchId: b.id, tier: tier, kind: 'passive', passiveId: p.id,
            magnitude: 4, ranks: 2, cost: 1
          }));
          tier++;
        }
      });

      /* Cap every branch with a real choice of three, because that is the
         node players argue about for a decade. One of them, not all. */
      if (abs.length >= 2) {
        var group = 'choice-' + b.id;
        var picks = [
          { p: PASSIVE_BY_ID[lean[1]] || PASSIVE_BY_ID.cooldown, mag: 12,
            why: 'The interesting one. Changes how the rotation feels.' },
          { p: PASSIVE_BY_ID[lean[0]] || PASSIVE_BY_ID.damage, mag: 15,
            why: 'Raw throughput instead. The safe pick, and the boring one.' },
          { p: PASSIVE_BY_ID[lean[2]] || PASSIVE_BY_ID.mobility, mag: 13,
            why: 'The one a minority swear by and nobody else takes.' }
        ];
        picks.forEach(function (pick) {
          if (!pick.p) return;
          t.nodes.push(newNode(c.name + ': ' + pick.p.name, {
            branchId: b.id, tier: tier + 1, kind: 'passive', passiveId: pick.p.id,
            magnitude: pick.mag, ranks: 1, cost: 2,
            choiceGroup: group,
            requires: prev ? [prev] : [],
            desc: pick.why
          }));
        });
      }
    });
    /* A generated tree has to be sized against the point budget, or the
       first frame either gives everyone everything or nothing. Aim for a
       branch costing a little more than one budget: you can nearly fill
       your own path, and the leftovers buy a short dip into a second.  */
    sizeToBudget(design);
    return t;
  }

  /* Scale node costs so the average branch costs ~1.15 budgets. */
  function sizeToBudget(design) {
    var t = tree(design);
    var bs = branches(design);
    if (!bs.length || !t.nodes.length) return;
    var budget = pointsBudget(design);
    var per = bs.map(function (b) { return U.sum(nodesOf(design, b.id), nodeCost); });
    var avg = U.avg(per);
    if (avg <= 0) return;
    var want = budget * 1.15;
    var scale = want / avg;
    /* Costs are whole points, so nudge ranks when scaling up and cost
       when scaling down - both read naturally in the editor. */
    t.nodes.forEach(function (n) {
      var target = Math.max(1, Math.round(nodeCost(n) * scale));
      var ranks = Math.max(1, n.ranks || 1);
      n.cost = Math.max(1, Math.round(target / ranks));
    });
  }

  PN.talents = {
    NODE_KINDS: NODE_KINDS, NODE_KIND_BY_ID: NODE_KIND_BY_ID,
    PASSIVES: PASSIVES, PASSIVE_BY_ID: PASSIVE_BY_ID,
    newBranch: newBranch, newNode: newNode, newTree: newTree,
    tree: tree, branches: branches, branchById: branchById, nodeById: nodeById,
    nodesOf: nodesOf, tiersOf: tiersOf,
    isTalentMode: isTalentMode, pointsBudget: pointsBudget, nodeCost: nodeCost,
    buildFor: buildFor, builds: builds,
    isFiller: isFiller, treeMetrics: treeMetrics, treeIssues: treeIssues,
    nodeAvailable: nodeAvailable, nodeAppeal: nodeAppeal, statWeightFor: statWeightFor,
    addBranch: addBranch, removeBranch: removeBranch, spendableCost: spendableCost,
    addNode: addNode, removeNode: removeNode,
    splashTarget: splashTarget, sizeToBudget: sizeToBudget,
    generateFromClasses: generateFromClasses
  };
})(window.PN);
