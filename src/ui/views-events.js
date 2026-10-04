/* Patch Notes - the live calendar.

   Where you write a holiday. Everything on this screen points at things
   you already authored: the zones it takes over, the monsters it puts
   in them, the quests it brings, and the one reward table nobody can
   reach in March.                                                   */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, EV = PN.gameEvents;

  function S() { return PN.game.state; }
  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  function current() {
    var d = D();
    var list = EV.events(d);
    var ev = U.byId(list, sel().eventId) || list[0] || null;
    /* Say which one, out loud. Falling back to the first event without
       recording the choice drew the whole editor for it while the
       selection was still empty - and every field on that panel binds
       through the selection, so the reward, the name, the schedule and
       the art budget all wrote into nothing. The panel looked normal
       and quietly discarded everything typed into it. */
    sel().eventId = ev ? ev.id : null;
    return ev;
  }

  /* How far away it is, in words somebody can act on. */
  function whenText(ev) {
    var st = S();
    if (st.phase !== 'live') {
      return EV.SCHEDULE_BY_ID[ev.schedule].name.toLowerCase();
    }
    var since = Math.max(0, (st.week || 0) - (st.launchWeek || 0));
    var into = EV.weekInto(ev, since);
    if (into >= 0) {
      var left = Math.max(1, (ev.weeks || 1) - into);
      return 'running now &middot; ' + left + ' week' + (left === 1 ? '' : 's') + ' left';
    }
    var away = EV.weeksUntil(ev, since);
    if (away === null) return 'has been and gone';
    return 'in ' + away + ' week' + (away === 1 ? '' : 's');
  }

  function listPanel() {
    var d = D(), st = S(), cur = current();
    var list = EV.events(d);
    var since = Math.max(0, (st.week || 0) - (st.launchWeek || 0));

    var rows = list.map(function (ev) {
      var issues = EV.eventIssues(d, ev);
      var on = st.phase === 'live' && EV.weekInto(ev, since) >= 0;
      return '<div class="item' + (cur && ev.id === cur.id ? ' on' : '') +
        '" data-act="event.select" data-val="' + ev.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(ev.name) +
          (on ? ' <span class="chip good">live</span>' : '') +
          (ev.enabled === false ? ' <span class="chip">off</span>' : '') +
          (issues.length ? ' <span class="chip warn">' + issues.length + '</span>' : '') +
        '</div>' +
        '<div class="s">' + (ev.weeks || 1) + ' week' + ((ev.weeks || 1) === 1 ? '' : 's') +
          ' &middot; ' + whenText(ev) + '</div></div></div>';
    }).join('') || ui.empty('No events.',
      'A holiday, an anniversary, a world boss weekend. Something dated that people come back for.');

    return ui.panel('The calendar', rows, {
      actions: '<button class="sm" data-act="event.add">Add event</button>',
      hint: list.length ? U.round(EV.summary(d).coverage * 100, 0) + '% of the year covered' : '' });
  }

  /* A year at a glance, so you can see the gaps you left. */
  function yearPanel() {
    var d = D();
    var list = EV.events(d).filter(function (e) { return e.enabled !== false; });
    if (!list.length) return '';
    var cells = [];
    for (var w = 0; w < 52; w++) {
      var on = null;
      for (var i = 0; i < list.length && !on; i++) {
        if (EV.weekInto(list[i], w) >= 0) on = list[i];
      }
      cells.push('<div class="calweek' + (on ? ' on' : '') + '"' +
        (on ? ' title="' + esc(on.name) + '"' : '') + '></div>');
    }
    var covered = EV.summary(d).coverage;
    return ui.panel('A year of it',
      '<div class="calyear">' + cells.join('') + '</div>' +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.55">' +
      'Every week of a year after launch. ' + Math.round(covered * 100) + '% of it has ' +
      'something running. A calendar with no gaps is not a calendar - the quiet ' +
      'months are what make the loud ones work.</div>');
  }

  function editor(ev) {
    if (!ev) return ui.panel('Editor', ui.empty('Select an event, or add one.'));
    var d = D(), st = S();
    var c = EV.contentOf(d, ev);
    var issues = EV.eventIssues(d, ev);
    var cost = EV.eventCost(d, ev);
    var sched = EV.SCHEDULE_BY_ID[ev.schedule] || EV.SCHEDULE_BY_ID.yearly;

    /* Which zones it takes over. */
    var zoneChips = (d.zones || []).map(function (z) {
      var on = (ev.zoneIds || []).indexOf(z.id) >= 0;
      return '<span class="chip click' + (on ? ' good' : '') +
        '" data-act="event.zone" data-val="' + ev.id + '|' + z.id + '">' +
        esc(z.name) + '</span>';
    }).join('') || '<span class="tiny faint">No zones authored yet.</span>';

    /* Monsters, limited to the zones it touches - an event monster in a
       zone the event does not reach is nowhere. */
    var pool = (d.monsters || []).filter(function (m) {
      return (ev.zoneIds || []).indexOf(m.zoneId) >= 0; });
    var mobChips = pool.map(function (m) {
      var on = (ev.monsterIds || []).indexOf(m.id) >= 0;
      return '<span class="chip click' + (on ? ' good' : '') +
        '" data-act="event.mob" data-val="' + ev.id + '|' + m.id + '">' +
        esc(m.name) + '</span>';
    }).join('') || '<span class="tiny faint">Pick a zone first; its monsters appear here.</span>';

    var questPool = (d.quests || []).filter(function (q) {
      return (ev.zoneIds || []).indexOf(q.zoneId) >= 0; });
    var questChips = questPool.map(function (q) {
      var on = (ev.questIds || []).indexOf(q.id) >= 0;
      return '<span class="chip click' + (on ? ' good' : '') +
        '" data-act="event.quest" data-val="' + ev.id + '|' + q.id + '">' +
        esc(q.name) + '</span>';
    }).join('') || '<span class="tiny faint">No quests in those zones yet.</span>';

    var rewardOpts = [{ id: '', name: '(nothing)' }].concat((d.rewards || []).map(function (r) {
      return { id: r.id, name: r.name + '  (' + Math.round(PN.items.rewardValue(d, r)) + ')' }; }));

    var timing = ev.schedule === 'yearly'
      ? ui.number({ path: 'eventSel.startWeek', label: 'Starts in week of the year',
          value: ev.startWeek, min: 0, max: 51,
          desc: 'Week 0 is the week you launched. Week 40 is roughly October.' })
      : ev.schedule === 'interval'
        ? ui.number({ path: 'eventSel.intervalWeeks', label: 'Comes round every',
            value: ev.intervalWeeks, min: 2, max: 52 })
        : ui.number({ path: 'eventSel.startWeek', label: 'Weeks after launch',
            value: ev.startWeek, min: 0, max: 520 });

    return ui.panel('Event: ' + ev.name, ''
      + ui.text({ path: 'eventSel.name', label: 'Name', value: ev.name })
      + ui.select({ path: 'eventSel.schedule', label: 'Runs', value: ev.schedule,
          options: EV.SCHEDULES })
      + '<div class="tiny faint" style="margin:-4px 0 10px;line-height:1.5">' +
        esc(sched.desc) + '</div>'
      + '<div class="grid g2"><div>'
      + ui.number({ path: 'eventSel.weeks', label: 'Runs for (weeks)', value: ev.weeks, min: 1, max: 52 })
      + '</div><div>' + timing + '</div></div>'

      + '<div class="subhead spaced">Where it happens</div>'
      + '<div class="row wrap" style="gap:4px">' + zoneChips + '</div>'

      + '<div class="subhead spaced">What turns up</div>'
      + '<div class="row wrap" style="gap:4px">' + mobChips + '</div>'

      + '<div class="subhead spaced">What there is to do</div>'
      + '<div class="row wrap" style="gap:4px">' + questChips + '</div>'

      + '<div class="subhead spaced">What it hands out</div>'
      + ui.select({ path: 'eventSel.rewardId', label: 'Reward', value: ev.rewardId || '',
          options: rewardOpts })
      + ui.toggle({ path: 'eventSel.exclusive', label: 'Only available while it runs',
          value: ev.exclusive,
          desc: 'The whole point of a holiday. Turn this off and it is just content with a date on it.' })
      + ui.slider({ path: 'eventSel.artBudget', label: 'Art budget', value: ev.artBudget,
          desc: 'Events are art-led. The decorations are most of why anybody logs in for one.' })
      + ui.toggle({ path: 'eventSel.enabled', label: 'On the calendar', value: ev.enabled !== false })

      + '<div class="subhead spaced">What it is worth</div>'
      + '<div class="grid g3">'
      + ui.stat('Hours a week', U.round(EV.eventHours(d, ev), 1), 'while it runs')
      + ui.stat('Pulls back', U.fmtPct(EV.eventPull(d, ev) * 100, 0), 'of the lapsed')
      + ui.stat('Costs', U.round(cost.design + cost.art + cost.eng + cost.qa, 1) + ' cap-wks')
      + '</div>'

      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin-top:11px">' + issues.map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : '<div class="chip good" style="margin-top:11px">Ready to run</div>')

      + '<div class="row" style="margin-top:12px">'
      + '<span class="spacer"></span>'
      + '<button class="sm danger ghost" data-act="event.remove" data-val="' + ev.id +
        '">Delete this event</button></div>',
      { hint: st.phase === 'live' ? whenText(ev) : sched.name });
  }

  function render() {
    return '<div class="grid g-1-2"><div>'
      + listPanel() + yearPanel()
      + '</div><div>' + editor(current()) + '</div></div>';
  }

  PN.viewsEvents = { render: render };
})(PN);
