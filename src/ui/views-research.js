/* Patch Notes - the research screen.

   Everything the studio does not know how to build yet, and what it
   would cost to learn. Research runs on the same design and engineering
   capacity that builds the game, so the allocation at the top is the
   only real decision here: how much of this week goes into being able
   to build more, instead of into building.                            */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, R = PN.research;

  function S() { return PN.game.state; }

  /* What the design is allowed to hold right now, against what it holds. */
  function limitsPanel() {
    var st = S();
    var d = st.design;
    var lim = R.limits(st);

    var ROWS = [
      { k: 'levelCap', name: 'Level cap',
        have: d ? d.progression.levelCap : 0, max: lim.levelCap, hard: true },
      { k: 'classes', name: PN.talents && d && PN.talents.isTalentMode(d)
          ? 'Talent branches' : 'Classes',
        have: d ? R.countOf(d, 'classes') : 0, max: lim.classes },
      { k: 'primaries', name: 'Primary stats',
        have: d ? R.countOf(d, 'primaries') : 0, max: lim.primaries },
      { k: 'secondaries', name: 'Secondary stats',
        have: d ? R.countOf(d, 'secondaries') : 0, max: lim.secondaries },
      { k: 'zones', name: 'Zones',
        have: d ? R.countOf(d, 'zones') : 0, max: lim.zones },
      { k: 'dungeons', name: 'Dungeons & raids',
        have: d ? R.countOf(d, 'dungeons') : 0, max: lim.dungeons },
      { k: 'arenas', name: 'PvP maps',
        have: d ? R.countOf(d, 'arenas') : 0, max: lim.arenas },
      { k: 'professions', name: 'Professions',
        have: d ? R.countOf(d, 'professions') : 0, max: lim.professions }
    ];

    var rows = ROWS.map(function (r) {
      var full = r.have >= r.max;
      var pct = r.max > 0 ? U.clamp01(r.have / r.max) * 100 : 0;
      return '<div class="rowact"><span class="faint tiny rowact-k">' + esc(r.name) + '</span>' +
        '<div class="bar" style="grid-column:2"><i style="width:' + pct.toFixed(1) +
          '%;background:' + (full ? 'var(--warn)' : 'var(--accent)') + '"></i></div>' +
        '<span class="mono tiny" style="text-align:right">' +
          (r.hard ? r.max : r.have + '/' + r.max) + '</span></div>';
    }).join('');

    var rarityChips = PN.stats.RARITIES.map(function (rr) {
      var on = lim.rarities.indexOf(rr.id) >= 0;
      return '<span class="chip' + (on ? ' good' : '') + '"' +
        (on ? ' style="border-color:' + rr.colour + '"' : '') + '>' +
        esc(rr.name) + '</span>';
    }).join(' ');

    return ui.panel('What you can build', rows
      + '<div class="subhead spaced">Item rarities</div>'
      + '<div class="row wrap" style="gap:5px">' + rarityChips + '</div>'
      + '<div class="subhead spaced">Studio</div>'
      + '<div class="grid g3">'
      + ui.stat('Server tech cap', Math.round(lim.serverTech))
      + ui.stat('Server bill', '-' + Math.round(lim.serverEfficiency * 100) + '%')
      + ui.stat('Wage bill', '-' + Math.round(lim.wageCut * 100) + '%')
      + '</div>',
      { hint: 'caps, not suggestions' });
  }

  function activePanel() {
    var st = S();
    var r = R.ensure(st);
    var cap = PN.state.capacity(st);
    var per = R.weeklyPoints(st, cap);
    var node = r.activeId ? R.NODE_BY_ID[r.activeId] : null;

    var body = ui.slider({ path: 'research.allocation', label: 'Capacity on research',
      value: r.allocation, min: 0, max: 60,
      desc: 'Research draws on design and engineering. Every point here is a point not spent building this week\'s content.' })
      + '<div class="tiny faint" style="margin:6px 0 10px;line-height:1.55">'
      + U.round(per, 1) + ' research per week at this allocation.</div>';

    if (node) {
      var pct = U.clamp01(r.progress / node.cost) * 100;
      var left = R.weeksLeft(st, cap);
      body += '<div class="subhead spaced">In progress</div>'
        + '<div class="rowact"><span class="faint tiny rowact-k">' + esc(node.name) + '</span>'
        + '<div class="bar" style="grid-column:2"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
        + '<span class="mono tiny" style="text-align:right">' + Math.round(r.progress) + '/'
        + node.cost + '</span></div>'
        + '<div class="tiny faint" style="margin-top:5px">'
        + (left === Infinity ? 'Nothing allocated - this will never finish.'
           : left + ' week' + (left === 1 ? '' : 's') + ' left.') + '</div>'
        + '<div class="row" style="margin-top:9px">'
        + '<button class="sm ghost danger" data-act="research.cancel">Stop this project</button></div>';
    } else {
      body += ui.empty('Nothing being researched.',
        'Pick something below and the studio starts on it this week.');
    }
    var sum = R.summary(st);
    return ui.panel('Research', body,
      { hint: sum.done + ' of ' + sum.total + ' complete' });
  }

  function nodeCard(node) {
    var st = S();
    var r = R.ensure(st);
    var done = !!r.done[node.id];
    var open = R.available(st, node);
    var active = r.activeId === node.id;
    var tooEarly = !done && !R.tierOpen(st, node.tier);
    var blockedBy = (node.needs || []).filter(function (n) { return !r.done[n]; })
      .map(function (n) { return (R.NODE_BY_ID[n] || {}).name || n; });

    var cls = done ? 'rnode done' : active ? 'rnode active' : open ? 'rnode' : 'rnode locked';
    return '<div class="' + cls + '"' +
      (open && !active ? ' data-act="research.start" data-val="' + node.id + '"' : '') + '>' +
      '<div class="row"><b style="min-width:0">' + esc(node.name) + '</b>' +
      '<span class="spacer"></span>' +
      (done ? '<span class="chip good">done</span>'
       : active ? '<span class="chip">in progress</span>'
       : '<span class="mono tiny faint">' + node.cost + '</span>') +
      '</div>' +
      (node.desc ? '<div class="tiny faint" style="margin-top:4px;line-height:1.5">' +
        esc(node.desc) + '</div>' : '') +
      (tooEarly
        ? '<div class="tiny warn" style="margin-top:4px">Nobody has worked this out yet - ' +
          (R.TIER_BY_T[node.tier] || {}).year + '</div>'
        : blockedBy.length
        ? '<div class="tiny warn" style="margin-top:4px">Needs ' +
          esc(U.listJoin(blockedBy)) + '</div>'
        : '') +
      '</div>';
  }

  /* The tree, tier by tier - and a tier is a moment in the genre's
     history rather than a rung on a ladder. A studio cannot research
     something the industry has not worked out yet, which is what makes
     the year you started in matter for the whole run. */
  function treePanel() {
    var st = S();
    var year = R.currentYear(st);
    var body = R.TIERS.map(function (t) {
      var nodes = R.NODES.filter(function (n) { return n.tier === t.t; });
      if (!nodes.length) return '';
      var open = R.tierOpen(st, t.t);
      var away = R.yearsToTier(st, t.t);
      return '<div class="rtier' + (open ? '' : ' locked') + '">'
        + '<div class="rtier-head"><b>' + esc(t.name) + '</b>'
        + '<span class="tiny faint"> · ' + esc(t.desc) + '</span>'
        + '<span class="spacer"></span>'
        + (open
            ? '<span class="chip good">' + t.year + ' · ' + esc(t.era) + '</span>'
            : '<span class="chip warn">' + t.year + ' · ' + away +
              (away === 1 ? ' year away' : ' years away') + '</span>')
        + '</div>'
        + (open ? '' :
            '<div class="tiny faint" style="margin:2px 0 8px;line-height:1.5">' +
            'Nobody in the genre has solved these yet. They open in ' + t.year +
            ', when ' + esc(t.era) + ' begins.</div>')
        + '<div class="rgrid">' + nodes.map(nodeCard).join('') + '</div></div>';
    }).join('');
    return ui.panel('Projects', body, { hint: 'it is ' + year });
  }

  function render() {
    return '<div class="grid g-1-2"><div>'
      + activePanel() + limitsPanel()
      + '</div><div>' + treePanel() + '</div></div>';
  }

  PN.viewsResearch = { render: render };
})(PN);
