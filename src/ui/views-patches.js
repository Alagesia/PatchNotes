/* Patch Notes - the roadmap.

   The screen the game is named after. A release is a date and a promise:
   you pick its size, name it if it is an expansion, and say when it
   ships. What goes IN it is simply everything you have authored since
   the last release - so the notes are read off your own work rather
   than declared in advance and generated at random.                   */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, P = PN.patches;

  function S() { return PN.game.state; }
  function sel() { return PN.app.sel; }

  /* ---------------------------------------------------------- the plan -- */

  function planRow(plan, current, versions, first, last) {
    var st = S();
    var kind = P.KIND_BY_ID[plan.kind] || P.KIND_BY_ID.minor;
    var funded = P.funded(st, plan);
    var away = plan.targetWeek - st.week;
    var work = (function(){ var c = P.planCost(st, plan); return c.design+c.art+c.eng+c.qa; })();
    /* Read down the roadmap, not worked out card by card. Three planned
       minor updates are not three copies of the same version number. */
    var ver = P.versionString((versions || {})[plan.id] ||
                              P.nextVersion(st.version, plan.kind));
    return '<div class="item' + (current && plan.id === current.id ? ' on' : '') + '">' +
      '<div class="reorder">' +
      '<button class="xs ghost" data-act="patch.move" data-val="' + plan.id + '|up"' +
        (first ? ' disabled' : '') + ' title="Ship this one sooner">▲</button>' +
      '<button class="xs ghost" data-act="patch.move" data-val="' + plan.id + '|down"' +
        (last ? ' disabled' : '') + ' title="Ship this one later">▼</button>' +
      '</div>' +
      '<div style="min-width:0;flex:1;cursor:pointer" data-act="patch.select" data-val="' +
        plan.id + '">' +
      '<div class="t"><span class="mono">' + ver + '</span>' +
        (plan.name ? ' · ' + esc(plan.name) : '') +
        (plan.auto ? ' <span class="chip">auto</span>' : '') + '</div>' +
      '<div class="s">' + esc(kind.name) + ' · ' + Math.round(work) + ' cap-weeks · ' +
        (away > 0 ? 'in ' + away + ' week' + (away === 1 ? '' : 's')
         : away === 0 ? 'this week' : Math.abs(away) + ' weeks overdue') +
      '</div></div><span class="spacer"></span>' +
      '<span class="chip ' + (funded >= 0.999 ? 'good' : funded > 0.6 ? 'warn' : 'bad') + '">' +
        Math.round(funded * 100) + '%</span></div>';
  }

  /* The changelog, rendered the way a player would read it. */
  function changelogHtml(lines, limit) {
    if (!lines.length) {
      return '<div class="tiny faint">Nothing has changed since the last release. '
        + 'Edit the design and this fills itself in.</div>';
    }
    var shown = limit ? lines.slice(0, limit) : lines;
    var html = shown.map(function (g) {
      return '<div class="cl-group"><div class="cl-head">' + esc(g.group) + '</div>' +
        g.items.map(function (t) {
          return '<div class="cl-line">' + esc(t) + '</div>'; }).join('') + '</div>';
    }).join('');
    if (limit && lines.length > limit) {
      html += '<div class="tiny faint" style="margin-top:6px">and ' +
        (lines.length - limit) + ' more area' + (lines.length - limit === 1 ? '' : 's') + '</div>';
    }
    return '<div class="changelog">' + html + '</div>';
  }

  function planEditor(plan) {
    var st = S();
    var kind = P.KIND_BY_ID[plan.kind] || P.KIND_BY_ID.minor;
    var cost = P.planCost(st, plan);
    var content = P.planContent(st, plan);
    var over = P.releaseOverhead(st, kind);
    var overTotal = over.design + over.art + over.eng + over.qa;
    var founded = st.studio.founded || st.startYear || 2004;
    var work = cost.design + cost.art + cost.eng + cost.qa;
    var funded = P.funded(st, plan);
    var issues = P.planIssues(st, plan);
    var ver = P.versionString(P.projectedVersions(st)[plan.id] ||
                              P.nextVersion(st.version, plan.kind));
    var diff = P.planDiff(st, plan);
    var lines = PN.diff.lines(diff);
    var suggested = PN.diff.suggestKind(diff);

    /* What the outstanding work costs, pool by pool, against what is banked. */
    var banked = P.progressOf(st, plan);
    var poolRows = ['design', 'art', 'eng', 'qa'].map(function (k) {
      var need = cost[k], have = banked[k] || 0;
      var pct = need > 0 ? U.clamp01(have / need) * 100 : 100;
      return '<div class="rowact"><span class="faint tiny rowact-k">' +
        (k === 'eng' ? 'Engineering' : k === 'qa' ? 'QA' : U.titleCase(k)) + '</span>' +
        '<div class="bar" style="grid-column:2"><i style="width:' + pct.toFixed(1) +
          '%;background:' + (pct >= 100 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
        '<span class="mono tiny" style="text-align:right">' + Math.round(have) + '/' +
          Math.round(need) + '</span></div>';
    }).join('');

    return ui.panel(ver + (plan.name ? ' · ' + plan.name : ''), ''
      /* --- what size of release is this ---------------------------- */
      + '<div class="kindpick">'
      + P.KINDS.map(function (k) {
          return '<div class="kindcard' + (plan.kind === k.id ? ' on' : '') +
            '" data-act="patch.kind" data-val="' + plan.id + '|' + k.id + '">' +
            '<div class="t">' + esc(k.name) +
              (k.id === suggested && !diff.empty
                ? ' <span class="chip good">fits</span>' : '') + '</div>' +
            '<div class="v mono">' + esc(k.example) + '</div>' +
            '<div class="s">' + esc(k.desc) + '</div></div>';
        }).join('')
      + '</div>'

      + (kind.needsName || plan.name
          ? ui.text({ path: 'planSel.name', label: kind.needsName
              ? 'Expansion name (required)' : 'Release name (optional)', value: plan.name })
          : '<div class="row" style="margin:10px 0"><button class="xs ghost" data-act="patch.nameIt" data-val="' +
            plan.id + '">Give this release a name</button></div>')

      + ui.number({ path: 'planSel.targetWeek',
          label: 'Ship in ' + U.weekLabel(plan.targetWeek, founded),
          value: plan.targetWeek, min: st.week, max: st.week + 260,
          desc: 'Today is ' + U.weekLabel(st.week, founded) + '. The number is the ' +
                'campaign week; the date beside it is when that actually falls.' })
      + ui.toggle({ path: 'planSel.shipWhenReady', label: 'Ship as soon as it is finished',
          value: plan.shipWhenReady,
          desc: 'Otherwise it waits for the date, which is how you hold a release for a marketing beat.' })

      /* --- what is actually in it ---------------------------------- */
      + '<div class="subhead spaced">What this release adds</div>'
      + '<div class="tiny faint" style="margin-bottom:8px;line-height:1.5">What is marked for '
      + '<b style="color:var(--text)">this</b> release, measured against the one before it on '
      + 'the board rather than against what players have - a second planned patch used to open '
      + 'with a copy of the first one’s list. Read off your design: you do not declare it, '
      + 'you build it. While this release is selected, anything new you author is marked for it, '
      + 'so you can write a quest now and ship it three patches from now.</div>'
      + changelogHtml(lines, 6)
      + (function () {
          var prev = P.previousPlan(st, plan);
          var held = P.heldBack(st, plan);
          return (prev
            ? '<div class="tiny faint" style="margin-top:8px;line-height:1.55">It also carries '
              + 'everything in ' + esc(P.versionString(
                  P.projectedVersions(st)[prev.id] || st.version))
              + (prev.name ? ' · ' + esc(prev.name) : '')
              + ', because a release cannot ship without what came before it.</div>'
            : '')
          + (held
            ? '<div class="chip" style="margin-top:8px;display:block;line-height:1.55">'
              + held + ' authored thing' + (held === 1 ? '' : 's') + ' held back for a '
              + 'later release. Nothing here ships them.</div>'
            : '');
        })()

      /* --- the notes ------------------------------------------------ */
      + '<div class="subhead spaced">Patch notes</div>'
      + '<textarea data-act="patch.notes" data-val="' + plan.id +
        '" rows="5" placeholder="What are you telling players this release is?">' +
        esc(plan.notes || '') + '</textarea>'
      + '<div class="row" style="margin-top:6px">'
      + '<button class="xs ghost" data-act="patch.autoNotes" data-val="' + plan.id +
        '">Write them from my changes</button>'
      + '<span class="tiny faint">Leave them empty and the game does this for you when it ships.'
      + '</span></div>'

      /* --- the bill ------------------------------------------------- */
      + '<div class="subhead spaced">What it costs to build</div>'
      + '<div class="tiny faint" style="margin-bottom:8px;line-height:1.5">'
      + Math.round(content) + ' cap-weeks of new content, plus ' + Math.round(overTotal)
      + ' to ship it at all - the build, the pass over everything it touches, and the '
      + 'regression testing a live game this size needs. Every release banks its own '
      + 'work: the team builds the one at the front of the roadmap, and whatever it '
      + 'no longer needs flows to the next one down.</div>'
      + poolRows
      + '<div class="grid g3" style="margin-top:10px">'
      + ui.stat('Outstanding work', Math.round(work) + ' cap-wks',
          Math.round(content) + ' content + ' + Math.round(overTotal) + ' shipping')
      + ui.stat('Built', Math.round(funded * 100) + '%', null,
          funded >= 0.999 ? 'good' : funded > 0.6 ? 'warn' : 'bad')
      + ui.stat('Ships as', ver)
      + '</div>'

      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin-top:11px">' + issues.map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : '<div class="chip good" style="margin-top:11px">Ready to ship</div>')

      + '<div class="row" style="margin-top:12px">'
      + '<button class="primary sm" data-act="patch.shipNow" data-val="' + plan.id + '">'
      + (funded >= 0.999 ? 'Ship it now' : 'Ship it early') + '</button>'
      + '<span class="spacer"></span>'
      + '<button class="sm danger ghost" data-act="patch.remove" data-val="' + plan.id +
        '">Cancel this release</button>'
      + '</div>',
      { hint: esc(kind.name) });
  }

  /* ------------------------------------------------------------ history */

  /* Every release you have shipped, most recent first.

     This used to print every patch in full, so a game three years old
     was a wall of changelog you had to scroll past to find anything.
     A release is one line until you ask for it: its version, its name
     if it had one, and the first sentence of its notes - which is the
     sentence you wrote to tell players what the patch was.            */
  function firstSentence(text) {
    var t = String(text || '').trim();
    if (!t) return '';
    /* The generated notes open with a headline line and then the
       changelog, so a line break ends the sentence as surely as a
       full stop does. */
    var stop = t.length;
    ['\n', '. ', '! ', '? '].forEach(function (mark) {
      var at = t.indexOf(mark);
      if (at > 0 && at < stop) stop = at + (mark === '\n' ? 0 : 1);
    });
    var out = t.slice(0, stop).trim();
    if (out.length > 120) out = out.slice(0, 117).replace(/\s+\S*$/, '') + '\u2026';
    return out;
  }

  function historyPanel() {
    var st = S();
    var open = PN.app.openRelease;
    var list = (st.released || []);
    var rows = list.map(function (r, i) {
      var kind = P.KIND_BY_ID[r.kind] || P.KIND_BY_ID.minor;
      var id = r.id || (r.versionText + '|' + r.week);
      var isOpen = open === id;
      var head = '<div class="rel-head" data-act="release.toggle" data-val="' + esc(id) + '">' +
        '<span class="rel-caret">' + (isOpen ? '\u25be' : '\u25b8') + '</span>' +
        '<span class="mono relver">' + esc(r.versionText) + '</span>' +
        (r.name ? '<b class="rel-name">' + esc(r.name) + '</b>' : '') +
        (isOpen ? '' : '<span class="rel-gist">' + esc(firstSentence(r.notes)) + '</span>') +
        '<span class="spacer"></span>' +
        (kind.id === 'major' ? '<span class="chip good">' + esc(kind.name) + '</span>' : '') +
        '<span class="tiny faint">wk ' + r.week + '</span></div>';
      if (!isOpen) return '<div class="release collapsed">' + head + '</div>';
      return '<div class="release">' + head +
        '<div class="tiny" style="margin-top:6px;line-height:1.55;color:var(--dim);white-space:pre-wrap">' +
          esc(r.notes) + '</div>' +
        ((r.changes || []).length
          ? '<div style="margin-top:6px">' + changelogHtml(r.changes, 0) + '</div>'
          : '') +
        (r.returned > 0 || r.revenue > 0
          ? '<div class="minibar" style="margin-top:5px">' +
            (r.returned > 0 ? '<span><i>Returned</i>' + U.fmtInt(r.returned) + '</span>' : '') +
            (r.revenue > 0 ? '<span><i>Box sales</i>' + U.fmtMoney(r.revenue) + '</span>' : '') +
            '<span><i>Work</i>' + Math.round(r.work) + '</span>' +
            (r.funded < 0.999
              ? '<span><i>Shipped at</i><b class="warn">' + Math.round(r.funded * 100) + '%</b></span>'
              : '') +
            '</div>'
          : '') +
        (r.tuningOnly ? '<div class="tiny faint" style="margin-top:3px">automatic tuning pass</div>'
         : r.notesGenerated ? '<div class="tiny faint" style="margin-top:3px">notes written by the game</div>' : '') +
        '</div>';
    }).join('') || ui.empty('Nothing shipped yet.',
      'Every release you ship lands here, with the notes you wrote for it.');
    return ui.panel('Release history', rows +
      (list.length > 1
        ? '<div class="tiny faint" style="margin-top:9px">Click any release to read it in full.</div>'
        : ''),
      { hint: list.length + ' shipped \u00b7 now on ' + P.versionString(st.version) });
  }

  /* --------------------------------------------------------- automation */
  function automationPanel() {
    var st = S();
    var a = st.automate || { enabled: false, cadenceWeeks: 8, ambition: 50, notes: true };
    var diff = P.pendingDiff(st);
    return ui.panel('Automatic patches', ''
      + ui.toggle({ path: 'autoSel.enabled', label: 'Plan and ship releases for me',
          value: a.enabled,
          desc: 'The roadmap keeps running whether or not you are still authoring.' })
      + (a.enabled
          ? ui.slider({ path: 'autoSel.cadenceWeeks', label: 'Release every',
              value: a.cadenceWeeks, min: 2, max: 26, step: 1,
              fmt: function (v) { return v + ' weeks'; },
              desc: 'How often a new release goes on the board.' })
            + '<div class="tiny faint" style="margin-top:9px;line-height:1.6">'
            + 'Automation schedules releases and runs tuning passes - small stat nudges, the kind '
            + 'a real maintenance patch carries. It will never author content for you and never '
            + 'touch a setting you own: a system inventing zones behind your back is not a game '
            + 'about design.<br><br>'
            + (diff.empty
                ? 'You have not authored anything since the last release, so the next automatic '
                  + 'one will be a small update that buffs a few numbers.'
                : 'You have authored ' + esc(PN.diff.headline(diff)) + ' since the last release. '
                  + 'The next automatic release will carry it, sized to fit.')
            + '</div>'
          : ''));
  }

  /* -------------------------------------------------------- the launch --

     The first release is the launch, and it is v1.0.0. Before that there
     is nothing to patch, so this screen is about getting the thing out of
     the door rather than about a roadmap.                             */

  function launchPanel() {
    var st = S();
    var c = PN.sim.completion(st);
    var cost = PN.metrics.buildCost(st.design);
    var probs = PN.metrics.integrity(st.design);
    var ready = c.overall >= 0.999;

    var poolRows = ['design', 'art', 'eng', 'qa'].map(function (k) {
      var pct = (c.per[k] || 0) * 100;
      return '<div class="rowact"><span class="faint tiny rowact-k">' +
        (k === 'eng' ? 'Engineering' : k === 'qa' ? 'QA' : U.titleCase(k)) + '</span>' +
        '<div class="bar" style="grid-column:2"><i style="width:' + Math.min(100, pct).toFixed(1) +
          '%;background:' + (pct >= 100 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
        '<span class="mono tiny" style="text-align:right">' +
          Math.round((st.progress || {})[k] || 0) + '/' + Math.round(cost[k]) + '</span></div>';
    }).join('');

    var weeksLeft = (function () {
      var cap = PN.state.capacity(st);
      var share = U.clamp01((st.allocation === undefined ? 100 : st.allocation) / 100);
      var spread = PN.titles.spreadPenalty(st);
      var worst = 0;
      ['design', 'art', 'eng', 'qa'].forEach(function (k) {
        var need = Math.max(0, cost[k] - ((st.progress || {})[k] || 0));
        var rate = cap[k] * share * spread;
        if (rate > 0) worst = Math.max(worst, need / rate);
      });
      return Math.ceil(worst);
    })();

    return ui.panel('Launch ' + st.design.meta.name, ''
      + '<div class="tiny faint" style="line-height:1.6;margin-bottom:12px">'
      + 'Your first release is the launch, and it ships as <b>v1.0.0</b>. Everything you have '
      + 'authored in the Design Studio goes live at once; after that you patch it.</div>'
      + '<div class="grid g3" style="margin-bottom:12px">'
      + ui.stat('Built', U.fmtPct(c.overall * 100, 0), null,
          ready ? 'good' : c.overall > 0.8 ? 'warn' : 'bad')
      + ui.stat('Ships as', 'v1.0.0')
      + ui.stat(ready ? 'Ready' : 'Finished in',
          ready ? 'now' : (weeksLeft > 400 ? 'never at this rate' : weeksLeft + ' weeks'))
      + '</div>'
      + poolRows
      + '<div class="subhead spaced">Launch notes</div>'
      + '<textarea data-act="patch.launchNotes" rows="4" '
      + 'placeholder="What are you telling players this game is?">'
      + esc(PN.app.launchNotes || '') + '</textarea>'
      + (probs.bad
          ? '<div class="chip bad" style="margin-top:11px">' + probs.bad +
            ' things are broken. Launching with them is a decision, not an accident.</div>'
          : '<div class="chip good" style="margin-top:11px">Nothing is obviously broken</div>')
      + '<div class="row" style="margin-top:12px">'
      + '<button class="' + (ready ? 'primary' : 'danger') + '" data-act="patch.launch">'
      + (ready ? 'Launch as v1.0.0' : 'Launch unfinished (' + U.fmtPct(c.overall * 100, 0) + ')')
      + '</button>'
      + '<span class="tiny faint">' + (ready
          ? 'Everything you planned is built.'
          : 'Shipping early costs review score, bugs and technical debt - permanently.')
      + '</span></div>',
      { hint: 'week ' + st.week });
  }

  /* What you are looking at when no release is selected. It is not an
     empty screen - it is the end of the roadmap, and saying so is the
     difference between "nothing to edit" and "edit this and it becomes
     a new release". */
  function noPlanPanel(plans) {
    var st = S();
    return ui.panel('Authoring no release', ''
      + '<div class="tiny faint" style="line-height:1.65">'
      + 'Every design screen is showing the game as it will stand once '
      + (plans.length
          ? 'all ' + plans.length + ' planned release' + (plans.length === 1 ? '' : 's') +
            ' have shipped'
          : 'you have shipped what players already have')
      + '. Change anything and a small update is planned at the back of the roadmap to '
      + 'carry it, so no work is quietly folded into a release you did not choose.</div>'
      + (plans.length
          ? '<div class="tiny faint" style="margin-top:10px;line-height:1.65">Pick a '
            + 'release on the left to author that one instead - what you change there is '
            + 'written to it and to nothing else, and the ones after it already have it.</div>'
          : '')
      + '<div class="row" style="margin-top:12px">'
      + '<button class="sm" data-act="patch.add" data-val="minor">Plan a release now</button>'
      + '</div>',
      { hint: 'week ' + st.week });
  }

  /* =============================================================== entry */

  function roadmapTab() {
    var st = S();
    if (!PN.titles.hasTitle(st)) {
      return ui.panel('Patches', ui.empty('No game to patch.',
        'Greenlight an MMO first.'));
    }
    /* Before launch there is no roadmap - there is a game to get out of
       the door, and it ships as v1.0.0. */
    if (st.phase !== 'live') {
      return '<div class="grid g-1-2"><div>' + launchPanel() + '</div><div>' +
        ui.panel('After launch', ''
          + '<div class="tiny faint" style="line-height:1.65">Once you are live this screen '
          + 'becomes the roadmap: plan small updates, content patches and expansions weeks '
          + 'ahead, write their notes, and watch whether your team finishes them in time. '
          + 'You can also hand the whole thing to automation and let it keep the game alive '
          + 'while you work on something else.</div>')
        /* Live operations moved to Design > Systems: a patch cadence is
           a systems decision, and this screen is where you read it. */
        + historyPanel() + '</div></div>';
    }

    var plans = P.plansInOrder(st);
    /* Only a release that has not shipped yet can be edited, so a plan
       that went out this week drops out of the editor rather than sitting
       there looking editable. */
    /* Only a release still on the board can be authored. Authoring
       NOTHING is also a position: the design screens then show the
       game as it will stand once the whole roadmap is out, and the
       next thing you change plans a release at the back to carry it. */
    var current = sel().planId ? U.byId(plans, sel().planId) : null;
    if (sel().planId && !current) sel().planId = null;

    var next = plans[0];
    var head = ''
      + '<div class="grid g4" style="margin-bottom:14px">'
      + ui.stat('Now on', P.versionString(st.version),
          (st.released || []).length + ' releases shipped')
      + ui.stat('Weeks since content', st.runtime.weeksSinceContent,
          st.runtime.weeksSinceContent > 10 ? 'players have noticed' : null,
          st.runtime.weeksSinceContent > 12 ? 'bad' : st.runtime.weeksSinceContent > 8 ? 'warn' : '')
      + ui.stat('Next release', next
          ? P.versionString(P.nextVersion(st.version, next.kind)) : '—',
          next ? U.weekLabel(next.targetWeek, st.studio.founded || st.startYear || 2004)
               : 'nothing planned')
      + ui.stat('Hype', Math.round(st.runtime.hype), null, ui.scoreClass(st.runtime.hype))
      + '</div>';

    var versions = P.projectedVersions(st);
    var rail = ui.panel('Planned', plans.map(function (p, i) {
        return planRow(p, current, versions, i === 0, i === plans.length - 1); }).join('')
        + '<div class="item' + (current ? '' : ' on') + '" style="cursor:pointer" '
        + 'data-act="patch.select" data-val="">'
        + '<div style="min-width:0;flex:1"><div class="t">No release selected</div>'
        + '<div class="s">Design screens show the game after the whole roadmap. '
        + 'Changing anything plans a release at the back to carry it.</div></div></div>'
        + (plans.length > 1
            ? '<div class="tiny faint" style="margin-top:8px;line-height:1.55">'
              + 'Use the arrows to change the order they ship in - the version numbers '
              + 'follow. Work banked past what a release needed carries to the next one '
              + 'on this list rather than evaporating.</div>'
            : '')
        || ui.empty('Nothing planned.', 'A live game with no roadmap is a game people drift away from.'),
      { actions: '<button class="sm" data-act="patch.add" data-val="minor">Plan a release</button>',
        hint: plans.length + ' queued' })
      + automationPanel();

    return head + '<div class="grid g-1-2"><div>' + rail + '</div><div>'
      + (current ? planEditor(current) : noPlanPanel(plans))
      + historyPanel()
      + '</div></div>';
  }

  PN.viewsPatches = { roadmapTab: roadmapTab, historyPanel: historyPanel };
})(PN);
