/* Patch Notes - the talent tree designer.
   Stands in for the Classes tab whenever the game is classless. Left
   rail is the branch list, middle is the tree itself laid out in tiers,
   right is the compiled builds - because the only honest way to judge a
   talent tree is to look at what players actually end up playing.      */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc,
      T = PN.talents, AB = PN.abilities, ST = PN.stats;

  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  var ROLE_OPTS = [
    { id: 'dps', name: 'Damage', desc: 'The default, and the one everyone plays.' },
    { id: 'tank', name: 'Tank', desc: 'Holds threat and eats damage. Always in short supply.' },
    { id: 'healer', name: 'Healer', desc: 'Keeps the group up. Always in shorter supply.' },
    { id: 'hybrid', name: 'Hybrid', desc: 'Does two jobs adequately. Hardest thing in the genre to balance.' }
  ];

  /* --------------------------------------------------------- branch rail */

  function branchRail(current) {
    var d = D();
    var t = T.tree(d);
    var budget = T.pointsBudget(d);

    var rows = t.branches.map(function (b) {
      var ns = T.nodesOf(d, b.id);
      var cost = U.sum(ns, T.nodeCost);
      var abil = ns.filter(function (n) { return n.kind === 'ability' && n.abilityId; }).length;
      /* How much of this branch one player can afford. Over 100% means
         there is nothing to choose. */
      var afford = cost > 0 ? Math.min(100, (budget / cost) * 100) : 100;
      return '<div class="item' + (current && b.id === current.id ? ' on' : '') +
        '" data-act="tal.branch" data-val="' + b.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(b.name) + '</div>' +
        '<div class="s">' + U.titleCase(b.role) + ' &middot; ' + ns.length + ' nodes &middot; ' +
          abil + ' abilit' + (abil === 1 ? 'y' : 'ies') + ' &middot; ' + cost + ' pts</div></div>' +
        '<span class="spacer"></span>' +
        '<span class="chip ' + (afford > 99 ? 'bad' : afford > 78 ? 'warn' : 'good') + '">' +
          Math.round(afford) + '%</span></div>';
    }).join('') || ui.empty('No branches yet.',
      'A talent tree with no branches gives players nothing to build towards. Add one.');

    return ui.panel('Branches', rows +
      '<div class="row" style="margin-top:10px">' +
      '<button class="sm ghost" data-act="tal.regen" ' +
      'title="Fold the classes you authored into a fresh tree">Rebuild from classes</button>' +
      '</div>', {
      actions: '<button class="sm" data-act="tal.addBranch">Add branch</button>',
      hint: t.branches.length + ' paths · ' + budget + ' pts'
    });
  }

  /* ---------------------------------------------------------- node editor */
  /* ---------------------------------------------------------- the tree --

     A talent tree has to look like one. Tiers are rows, each gated on
     points spent in the branch; a talent that requires another sits under
     it with a line drawn between them; alternatives sit inside one box
     and you take exactly one. Clicking a node opens it for editing
     underneath rather than rendering forty editors at once.           */

  function nodeChip(d, n, opts) {
    opts = opts || {};
    var sel = PN.app.sel.nodeId === n.id;
    var kindDef = T.NODE_KIND_BY_ID[n.kind] || T.NODE_KINDS[0];
    var filler = T.isFiller(n);
    var label = '';
    if (n.kind === 'ability') {
      var ab = n.abilityId ? AB.abilityById(d, n.abilityId) : null;
      label = ab ? ab.name : 'no ability';
    } else if (n.kind === 'stat') {
      var s = PN.util.byId(ST.statSetOf(d).secondaries.concat(ST.statSetOf(d).primaries), n.statId);
      label = (s ? s.name : 'no stat') + ' +' + (n.magnitude * (n.ranks || 1)) + '%';
    } else {
      var p = T.PASSIVE_BY_ID[n.passiveId];
      label = (p ? p.name : n.passiveId) + ' +' + (n.magnitude * (n.ranks || 1)) + '%';
    }
    var missing = (n.kind === 'ability' && !n.abilityId) || (n.kind === 'stat' && !n.statId);
    return '<div class="tnode k-' + esc(n.kind) + (sel ? ' on' : '') +
      (filler ? ' filler' : '') + (missing ? ' broken' : '') +
      '" data-act="tal.node" data-val="' + n.id + '" title="' + esc(kindDef.desc) + '">' +
      '<div class="tn-name">' + esc(n.name) + '</div>' +
      '<div class="tn-what">' + esc(label) + '</div>' +
      '<div class="tn-foot"><span class="tn-cost">' + T.nodeCost(n) + ' pt' +
        (T.nodeCost(n) === 1 ? '' : 's') + '</span>' +
      ((n.ranks || 1) > 1 ? '<span class="tn-rank">' + n.ranks + ' ranks</span>' : '') +
      ((n.requires || []).length ? '<span class="tn-req" title="Requires another talent">&#8593;</span>' : '') +
      '</div></div>';
  }

  function treeGrid(branch) {
    var d = D();
    var tiers = T.tiersOf(d, branch.id);
    var keys = U.keys(tiers).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) {
      return ui.empty('This branch is empty.',
        'Add a talent, then another that requires it. That chain is the tree.');
    }
    var per = branch.pointsPerTier === undefined ? 5 : branch.pointsPerTier;

    return '<div class="ttree">' + keys.map(function (k) {
      var row = tiers[k];
      var gate = Math.max(0, (k - 1)) * per;
      /* Alternatives sit together in one box. Everything else is its own. */
      var groups = {}, singles = [];
      row.forEach(function (n) {
        if (n.choiceGroup) (groups[n.choiceGroup] = groups[n.choiceGroup] || []).push(n);
        else singles.push(n);
      });
      var cells = singles.map(function (n) { return nodeChip(d, n); });
      U.keys(groups).forEach(function (g) {
        var members = groups[g];
        cells.push('<div class="tchoice" title="Take exactly one of these">' +
          '<div class="tchoice-lbl">choose one</div>' +
          members.map(function (n) { return nodeChip(d, n); }).join('') +
          '</div>');
      });
      return '<div class="ttier">' +
        '<div class="ttier-gate">' +
          '<div class="tg-n">Tier ' + k + '</div>' +
          '<div class="tg-p">' + (gate > 0 ? gate + ' pts' : 'open') + '</div>' +
        '</div>' +
        '<div class="ttier-row">' + cells.join('') + '</div>' +
        '<div class="ttier-add">' +
          '<button class="xs ghost" data-act="tal.addNodeTier" data-val="' +
            branch.id + '|' + k + '">+</button>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* One node, opened for editing under the tree. */
  function nodeEditor(branch, n) {
    var d = D();
    var filler = T.isFiller(n);
    var siblings = T.nodesOf(d, branch.id).filter(function (x) { return x.id !== n.id; });

    var payload = '';
    if (n.kind === 'ability') {
      var abOpts = [{ id: '', name: '(pick an ability)' }].concat(
        (d.abilities || []).map(function (a) { return { id: a.id, name: a.name }; }));
      payload = '<div class="rowact"><span class="faint tiny rowact-k">Grants</span>' +
        '<select data-act="tal.nodeAbility" data-val="' + n.id + '" style="grid-column:2/span 3">' +
        abOpts.map(function (o) {
          return '<option value="' + o.id + '"' + (o.id === (n.abilityId || '') ? ' selected' : '') +
            '>' + esc(o.name) + '</option>'; }).join('') + '</select></div>';
    } else if (n.kind === 'stat') {
      var stOpts = [{ id: '', name: '(pick a stat)' }].concat(
        ST.allStats(d).map(function (s) { return { id: s.id, name: s.name }; }));
      payload = '<div class="rowact"><span class="faint tiny rowact-k">Stat</span>' +
        '<select data-act="tal.nodeStat" data-val="' + n.id + '" style="grid-column:2/span 3">' +
        stOpts.map(function (o) {
          return '<option value="' + o.id + '"' + (o.id === (n.statId || '') ? ' selected' : '') +
            '>' + esc(o.name) + '</option>'; }).join('') + '</select></div>' +
        ui.rangeAct({ label: 'Per rank', act: 'tal.nodeMag', val: n.id,
                      value: n.magnitude, min: 1, max: 40, suffix: '%' });
    } else {
      var pDef = T.PASSIVE_BY_ID[n.passiveId] || T.PASSIVES[0];
      payload = '<div class="rowact"><span class="faint tiny rowact-k">Modifies</span>' +
        '<select data-act="tal.nodePassive" data-val="' + n.id + '" style="grid-column:2/span 3">' +
        T.PASSIVES.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === n.passiveId ? ' selected' : '') +
            '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
        ui.rangeAct({ label: 'Per rank', act: 'tal.nodeMag', val: n.id,
                      value: n.magnitude, min: 1, max: 40, suffix: '%' }) +
        '<div class="tiny faint" style="margin-top:4px">Soft caps at ' + pDef.cap + '%.' +
        (pDef.desc ? ' ' + esc(pDef.desc) : '') + '</div>';
    }

    /* Prerequisites: which talents must already be taken. Only talents in
       the same branch at a lower or equal tier can be required, or the
       tree would contain a loop. */
    var reqCandidates = siblings.filter(function (x) { return (x.tier || 1) <= (n.tier || 1); });
    var reqRows = reqCandidates.length
      ? '<div class="row wrap" style="gap:5px">' + reqCandidates.map(function (x) {
          var on = (n.requires || []).indexOf(x.id) >= 0;
          return '<span class="chip click' + (on ? ' on' : '') +
            '" data-act="tal.toggleReq" data-val="' + n.id + '|' + x.id + '">' +
            esc(x.name) + '</span>';
        }).join('') + '</div>'
      : '<div class="tiny faint">Nothing above this to require yet.</div>';

    /* Choice groups: any number of alternatives, one of which gets taken. */
    var groupMembers = n.choiceGroup
      ? T.nodesOf(d, branch.id).filter(function (x) { return x.choiceGroup === n.choiceGroup; })
      : [];
    var sameTier = siblings.filter(function (x) { return (x.tier || 1) === (n.tier || 1); });
    var choiceRows = sameTier.length
      ? '<div class="row wrap" style="gap:5px">' + sameTier.map(function (x) {
          var on = n.choiceGroup && x.choiceGroup === n.choiceGroup;
          return '<span class="chip click' + (on ? ' on' : '') +
            '" data-act="tal.toggleChoice" data-val="' + n.id + '|' + x.id + '">' +
            esc(x.name) + '</span>';
        }).join('') + '</div>'
      : '<div class="tiny faint">Nothing else in this tier to choose between.</div>';

    return ui.panel('Talent: ' + n.name, ''
      + '<div class="grid g2"><div>'
      + '<div class="field"><label><span class="name">Name</span></label>'
      + '<input type="text" value="' + esc(n.name) + '" data-act="tal.nodeName" data-val="' + n.id + '">'
      + '</div></div><div>'
      + '<div class="field"><label><span class="name">Kind</span></label>'
      + '<select data-act="tal.nodeKind" data-val="' + n.id + '">'
      + T.NODE_KINDS.map(function (k) {
          return '<option value="' + k.id + '"' + (k.id === n.kind ? ' selected' : '') + '>' +
            esc(k.name) + '</option>'; }).join('') + '</select></div>'
      + '</div></div>'
      + payload
      + ui.rangeAct({ label: 'Ranks', act: 'tal.nodeRanks', val: n.id,
                      value: n.ranks, min: 1, max: 5, cls: 'narrow' })
      + ui.rangeAct({ label: 'Cost per rank', act: 'tal.nodeCost', val: n.id,
                      value: n.cost, min: 1, max: 10, suffix: 'pt', cls: 'narrow' })
      + ui.rangeAct({ label: 'Tier', act: 'tal.nodeTier', val: n.id,
                      value: n.tier, min: 1, max: 12, cls: 'narrow' })

      + '<div class="subhead spaced">Requires</div>'
      + '<div class="tiny faint" style="margin-bottom:6px;line-height:1.5">Talents that must '
      + 'already be taken before this one can be. This is the line drawn between two nodes.</div>'
      + reqRows

      + '<div class="subhead spaced">One of these, not all</div>'
      + '<div class="tiny faint" style="margin-bottom:6px;line-height:1.5">Put talents in the '
      + 'same tier into a choice and players take exactly one of them. Three or four options '
      + 'is where a tier gets interesting.</div>'
      + choiceRows
      + (groupMembers.length > 1
          ? '<div class="chip good" style="margin-top:7px">A choice of ' +
            groupMembers.length + '</div>'
          : '')

      + '<div class="row small" style="margin-top:12px">'
      + '<span class="mono tiny faint">' + T.nodeCost(n) + ' pts total</span>'
      + '<span class="spacer"></span>'
      + (filler ? '<span class="chip warn">filler</span>'
                : '<span class="chip good">a real choice</span>')
      + '</div>',
      { actions: '<button class="sm ghost" data-act="dup" data-val="talent|' + n.id +
                 '">Duplicate</button> ' +
                 '<button class="sm danger ghost" data-act="tal.removeNode" data-val="' + n.id +
                 '">Delete talent</button>' });
  }

  function treeEditor(branch) {
    var d = D();
    if (!branch) return ui.panel('Tree', ui.empty('Select a branch.',
      'Each branch is one path a player can commit to.'));

    var issues = T.treeIssues(d).filter(function (s) { return s.indexOf(branch.name) === 0; });
    var nodes = T.nodesOf(d, branch.id);
    var current = PN.app.sel.nodeId ? U.byId(nodes, PN.app.sel.nodeId) : null;
    if (!current && nodes.length) { current = null; }

    return ui.panel('Branch: ' + branch.name, ''
      + '<div class="grid g2">'
      + '<div>' + ui.text({ path: 'branchSel.name', label: 'Name', value: branch.name })
      + ui.select({ path: 'branchSel.role', label: 'Role', value: branch.role, options: ROLE_OPTS })
      + '</div><div>'
      + ui.select({ path: 'branchSel.armour', label: 'Armour', value: branch.armour, options: [
          { id: 'light', name: 'Light' }, { id: 'medium', name: 'Medium' },
          { id: 'heavy', name: 'Heavy' }, { id: 'plate', name: 'Plate' }] })
      + ui.select({ path: 'branchSel.primaryStat', label: 'Primary stat',
          value: branch.primaryStat || '',
          options: [{ id: '', name: 'Derive from the talents (' +
            ((PN.combat.primaryFor(d, T.buildFor(d, branch)) || {}).name || '-') + ')' }].concat(
            PN.stats.statSetOf(d).primaries.map(function (p) {
              return { id: p.id, name: p.name }; })),
          desc: 'Which stat a character down this branch gears for. Derived from what the talents you granted actually scale off, unless you say otherwise.' })
      + PN.viewsDesign.statExplainer(d, T.buildFor(d, branch))
      + ui.select({ path: 'branchSel.resource', label: 'Resource', value: branch.resource, options: [
          { id: 'mana', name: 'Mana' }, { id: 'rage', name: 'Rage' },
          { id: 'energy', name: 'Energy' }, { id: 'focus', name: 'Focus' },
          { id: 'none', name: 'No resource' }] })
      + '</div></div>'
      + ui.slider({ path: 'branchSel.pointsPerTier', label: 'Points to open each tier',
          value: branch.pointsPerTier === undefined ? 5 : branch.pointsPerTier, min: 0, max: 15,
          desc: 'How much of this branch you must buy before the next row unlocks. Zero makes the tree a flat menu; five is the genre default.' })
      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin:10px 0">' + issues.map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : '')
      + '<div class="subhead spaced">The tree</div>'
      + treeGrid(branch)
      + '<div class="row" style="margin-top:10px">'
      + '<button class="sm" data-act="tal.addNode" data-val="' + branch.id + '">Add talent</button>'
      + '<button class="sm ghost" data-act="tal.addTier" data-val="' + branch.id + '">Add a tier</button>'
      + '</div>',
      { actions: '<button class="sm danger" data-act="tal.removeBranch" data-val="' + branch.id +
                 '">Delete branch</button>' })
      + (current ? nodeEditor(branch, current)
         : ui.panel('Talent', ui.empty('Click a talent in the tree to edit it.',
             'Nodes show what they grant, what they cost, and whether anything has to be taken first.')));
  }

  /* ------------------------------------------------------ compiled builds */

  function buildsPanel() {
    var d = D();
    var tm = T.treeMetrics(d);
    var evals = PN.combat.evaluateAll(d);
    var bal = PN.metrics.balanceState(d);

    var rows = T.builds(d).map(function (b) {
      var ev = evals.byId[b.id];
      var per = null;
      bal.perClass.forEach(function (p) { if (p.cls.id === b.id) per = p; });
      var dev = per && per.pveDev !== undefined ? per.pveDev : 0;
      var flag = Math.abs(dev) > 0.16
        ? '<span class="chip ' + (dev > 0 ? 'bad' : 'warn') + '">' + U.fmtSigned(dev * 100, 0) + '%</span>' : '';
      var mods = U.keys(b.talentMods || {}).map(function (k) {
        var p = null;
        T.PASSIVES.forEach(function (x) { if (x.field === k) p = x; });
        return (p ? p.name : k) + ' +' + Math.round(b.talentMods[k]) + '%';
      }).join(', ');
      return '<div class="buildrow">' +
        '<div class="row"><b style="min-width:0">' + esc(b.name) + '</b>' +
        '<span class="chip">' + U.titleCase(b.role) + '</span>' +
        /* Which race this branch is scored at, when the game has any. */
        (ev && ev.raceName ? '<span class="chip accent">' + esc(ev.raceName) + '</span>' : '') +
        '<span class="spacer"></span>' + flag + '</div>' +
        '<div class="tiny faint" style="margin-top:4px">' +
          b.abilities.length + ' abilities &middot; ' + b.nodesTaken + ' nodes &middot; ' +
          b.pointsSpent + '/' + b.pointsBudget + ' pts' +
          (b.splashedInto ? ' &middot; splashes into ' + esc(b.splashedInto) : '') +
        '</div>' +
        (mods ? '<div class="tiny accent" style="margin-top:3px">' + esc(mods) + '</div>' : '') +
        (ev ? '<div class="minibar">' +
          '<span><i>DPS</i>' + U.fmtInt(ev.dps) + '</span>' +
          '<span><i>PvE</i><b class="' + ui.scoreClass(ev.pveScore) + '">' +
            Math.round(ev.pveScore) + '</b></span>' +
          '<span><i>PvP</i><b class="' + ui.scoreClass(ev.pvpScore) + '">' +
            Math.round(ev.pvpScore) + '</b></span>' +
          '<span><i>TTK</i>' + U.round(ev.ttkSolo, 1) + 's</span>' +
          '</div>' : '') +
        '</div>';
    }).join('') || ui.empty('Nothing compiles yet.');

    return ui.panel('What players actually end up playing', ''
      + '<div class="tiny faint" style="margin-bottom:9px;line-height:1.55">'
      + 'Every branch is spent down with the full point budget, then whatever is '
      + 'left over dips into one other branch. These are the characters your '
      + 'balance numbers are measured against.</div>'
      + rows,
      { hint: Math.round(tm.diversity) + '% distinct' })
      + ui.panel('Tree health', ''
      + '<div class="grid g2">'
      + ui.stat('Quality', Math.round(tm.quality), null, ui.scoreClass(tm.quality))
      + ui.stat('Nodes', tm.nodes, tm.abilityNodes + ' grant abilities')
      + ui.stat('Filler', Math.round(tm.fillerRatio) + '%', null,
          ui.scoreClass(100 - tm.fillerRatio))
      + ui.stat('Either/or nodes', tm.choiceNodes)
      + ui.stat('Reach at cap', Math.round(tm.reach) + '%',
          tm.reach > 85 ? 'take everything' : 'must choose')
      + ui.stat('Depth', tm.maxTier + ' tiers')
      + '</div>'
      + '<div class="row" style="margin-top:11px">'
      + '<button class="sm ghost" data-act="tal.sizeToBudget" '
      + 'title="Rescale every node cost so one branch is worth about one budget">'
      + 'Rescale costs to the budget</button></div>'
      + (T.treeIssues(d).length
          ? '<div class="row wrap" style="gap:5px;margin-top:10px">' + T.treeIssues(d).map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : '<div class="chip good" style="margin-top:10px">Tree is coherent</div>'));
  }

  /* =============================================================== entry */

  function talentsTab() {
    var d = D();
    var t = T.tree(d);
    var current = sel().branchId ? T.branchById(d, sel().branchId) : t.branches[0];
    if (current) sel().branchId = current.id;

    return '<div class="grid g-tal">'
      + '<div>' + branchRail(current) + '</div>'
      + '<div>' + treeEditor(current) + '</div>'
      + '<div>' + buildsPanel() + '</div>'
      + '</div>';
  }

  PN.viewsTalents = { talentsTab: talentsTab };
})(PN);
