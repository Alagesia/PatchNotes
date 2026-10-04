/* Patch Notes - the PvP leaderboard.

   Who is winning your arenas, and what they are playing. Every rating on
   this board is read off the same numbers the balance solver uses, so
   the board is a reading of your class balance with names attached: if
   one class owns the top hundred, this screen is where you find out.  */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc;

  function S() { return PN.game.state; }
  function D() { return PN.sim.live(S()) || S().design; }
  /* The draft, which is what a slider on this screen edits. Reading a
     control off the SHIPPED design meant every change snapped back to
     whatever players are currently running - the edit had landed, the
     number just refused to show it until the next patch. */
  function Draft() { return S().design; }

  function rankClass(rank) {
    if (rank === 1) return ' gold';
    if (rank <= 3) return ' silver';
    if (rank <= 10) return ' bronze';
    return '';
  }

  function seasonPanel() {
    var st = S(), d = D(), draft = Draft();
    var season = PN.ladder.seasonOf(st);
    var s = PN.ladder.standings(st, { limit: 1 });
    var left = season.length - season.week;

    return ui.panel('The season', ''
      + '<div class="grid g3">'
      + ui.stat('Season', season.index + 1)
      + ui.stat('Week', season.week + ' of ' + season.length)
      + ui.stat('Ends in', left + (left === 1 ? ' week' : ' weeks'))
      + '</div>'
      + '<div class="bar" style="margin-top:10px"><i style="width:'
      + ((season.week / Math.max(1, season.length)) * 100).toFixed(1) + '%"></i></div>'
      + ui.slider({ path: 'design.pvp.seasonWeeks', label: 'Season length',
          value: draft.pvp.seasonWeeks, min: 4, max: 26, step: 1,
          fmt: function (v) { return v + ' weeks'; },
          desc: 'How long a ladder runs before it is wiped and everybody starts again. Short seasons keep the board moving; long ones make the top of it mean something.' })
      + ui.number({ path: 'design.pvp.ratingFloor', label: 'Starting rating',
          value: draft.pvp.ratingFloor, min: 0, max: 3000, step: 50 })
      + (draft.pvp.seasonWeeks !== d.pvp.seasonWeeks ||
         draft.pvp.ratingFloor !== d.pvp.ratingFloor
          ? '<div class="chip warn" style="margin-top:9px">Players are still on ' +
            d.pvp.seasonWeeks + '-week seasons. Your change reaches them in the ' +
            'next release.</div>' : '')
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">Rating comes out of '
      + 'the build somebody plays and the gear they are wearing, judged in the PvP model you '
      + 'authored - your damping, your healing reduction, and how much you let gear decide a '
      + 'match. Nothing here is a dice roll with a name on it.</div>',
      { hint: s.empty ? 'nobody queueing' : U.fmtInt(s.total) + ' ranked' });
  }

  function boardPanel() {
    var st = S(), d = D();
    if (!d.pvp || !d.pvp.enabled) {
      return ui.panel('Leaderboard', ui.empty('PvP is switched off.',
        'Turn it on in the PvP section and a ladder will form here.'));
    }
    var s = PN.ladder.standings(st, { limit: 60 });
    if (s.empty) {
      return ui.panel('Leaderboard', ui.empty('Nobody is queueing yet.',
        'Once players start spending real time in your arenas they will appear here, ranked.'));
    }
    var cap = d.progression.levelCap;
    var favs = st.favourites || {};
    var returning = 0;

    var rows = s.rows.map(function (r) {
      var a = r.agent;
      var build = a.bld ? U.byId(PN.builds.enumerate(d), a.bld) : null;
      var cls = (PN.schema.playableById(d, a.cls) || {});
      var clsName = cls.playableName || cls.name || a.cls;
      var what = build ? clsName + ' · ' + (build.shortName || '')
               : clsName || '-';
      var games = r.wins + r.losses;
      var winRate = games ? (r.wins / games) * 100 : 0;
      /* Somebody who has finished near the top before. This is the
         thing that was missing: a ladder whose names carry across a
         season wipe instead of being new strangers every time. */
      var vet = a.ladderVet || 0;
      if (vet > 0) returning++;
      return '<tr' + (favs[a.id] ? ' class="fav"' : '') + '>' +
        '<td class="num">' + ui.favStar(a.id, !!favs[a.id]) + '</td>' +
        '<td class="num"><span class="rank' + rankClass(r.rank) + '">' + r.rank + '</span></td>' +
        '<td class="click" data-act="player.open" data-val="' + a.id + '">' + esc(a.nm) +
          (vet > 0
            ? ' <span class="vet" title="' + vet + ' season' + (vet === 1 ? '' : 's') +
              ' running in the top half' + (a.ladderBest ? '; best finish #' + a.ladderBest : '') +
              '">↺' + vet + '</span>'
            : '') + '</td>' +
        '<td class="small muted">' + esc(what) + '</td>' +
        '<td class="num">' + (a.lv >= cap ? cap : a.lv) + '</td>' +
        '<td class="num mono">' + U.fmtInt(r.rating) + '</td>' +
        '<td class="num">' + U.fmtInt(r.wins) + '&thinsp;/&thinsp;' + U.fmtInt(r.losses) + '</td>' +
        '<td class="num ' + (winRate >= 55 ? 'good' : winRate < 45 ? 'bad' : '') + '">' +
          U.fmtPct(winRate, 0) + '</td></tr>';
    }).join('');

    return ui.panel('Leaderboard',
      '<div class="tablewrap"><table class="data">' +
      '<tr><th></th><th class="num">#</th><th>Player</th><th>Playing</th>' +
      '<th class="num">Level</th><th class="num">Rating</th>' +
      '<th class="num">W/L</th><th class="num">Win rate</th></tr>' +
      rows + '</table></div>' +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.55">' +
      (returning
        ? '<b style="color:var(--text)">↺</b> marks a regular: somebody who ' +
          'finished in the top half of a previous season and came back for this one. ' +
          returning + ' of the ' + s.rows.length + ' shown. '
        : 'Nobody here has a previous season behind them yet. ') +
      'Star a player to follow them across the weeks.</div>',
      { hint: 'top ' + s.rows.length + ' of ' + U.fmtInt(s.total) });
  }

  /* The guild board. This lived on the Community screen, which is where
     you read the forums - a ranking of guilds is a leaderboard, and it
     belongs next to the other one. */
  function guildBoard() {
    var st = S();
    var all = (st.guilds || []).filter(function (g) { return !g.dead && g.size > 0; });
    if (!all.length) {
      return ui.panel('Guild leaderboard', ui.empty('No guilds yet.',
        'Guilds form on their own once enough people have somewhere to belong. ' +
        'Guild halls, perks and a finder all make it happen sooner.'));
    }
    var d = PN.sim.live(st);
    var ranked = PN.guilds.top(st, 40);
    var support = PN.guilds.support(d);
    var guilded = U.sum(st.agents.filter(function (a) { return !!a.gid; }),
      function (a) { return a.w; });
    var share = st.population.total > 0 ? guilded / st.population.total : 0;

    var rows = ranked.map(function (g, i) {
      return '<tr class="click" data-act="guild.open" data-val="' + g.id + '">' +
        '<td class="num"><span class="rank' + rankClass(i + 1) + '">' + (i + 1) + '</span></td>' +
        '<td>' + esc(g.name) + '</td>' +
        '<td class="small muted">' + esc(PN.guilds.FOCUS_BY_ID[g.focus].name) + '</td>' +
        '<td class="num">' + Math.round(g.size) + '</td>' +
        '<td class="num ' + (g.cohesion > 0.55 ? 'good' : g.cohesion > 0.3 ? 'warn' : 'bad') + '">' +
          U.fmtPct(g.cohesion * 100, 0) + '</td>' +
        '<td class="num faint">' + (st.week - g.founded) + 'w</td></tr>';
    }).join('');

    return ui.panel('Guild leaderboard',
      '<div class="grid g3" style="margin-bottom:12px">' +
      ui.stat('Guilds', all.length) +
      ui.stat('In a guild', U.fmtPct(share * 100, 0), 'of your players',
        share > 0.5 ? 'good' : share > 0.25 ? 'warn' : 'bad') +
      ui.stat('Guild support', U.fmtPct(support * 100, 0), 'from your design') +
      '</div>' +
      '<div class="tablewrap"><table class="data">' +
      '<tr><th class="num">#</th><th>Guild</th><th>Focus</th><th class="num">Members</th>' +
      '<th class="num">Cohesion</th><th class="num">Age</th></tr>' + rows + '</table></div>' +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Guilded players churn far ' +
      'more slowly. Guild halls, perks, progression and a finder all raise the share of your ' +
      'playerbase that has somewhere to belong.</div>',
      { hint: ranked.length + ' of ' + all.length });
  }

  /* The board as a balance reading: who is actually winning, by class. */
  function balancePanel() {
    var st = S(), d = D();
    if (!d.pvp || !d.pvp.enabled) return '';
    var th = PN.ladder.topHeavy(st, 100);
    if (!th.total) return '';
    var playables = PN.schema.playable(d).length || 1;
    var evenShare = th.total / playables;

    var bars = th.byPlayable.map(function (p) {
      var over = p.n > evenShare * 1.8;
      return { name: p.name, value: p.n,
               color: over ? '#ff7565' : '#5fb3ff' };
    });

    var worst = th.byPlayable[0];
    var dominated = worst && worst.n > evenShare * 1.8;

    return ui.panel('Who is winning', PN.chart.bars(bars, {
        labelW: 96, fmt: function (v) { return Math.round(v); } })
      + '<div class="tiny faint" style="margin-top:9px;line-height:1.55">'
      + 'The top ' + th.total + ' of your ladder, by what they play. '
      + (dominated
          ? '<b class="warn">' + esc(worst.name) + ' holds ' +
            Math.round(worst.n / th.total * 100) + '% of it.</b> That is a balance '
            + 'problem with names attached, and your competitive players will say so first.'
          : 'No class owns the board, which is what a balanced ladder looks like.')
      + '</div>');
  }

  function historyPanel() {
    var st = S();
    var hist = st.ladderHistory || [];
    if (!hist.length) return '';
    var rows = hist.slice(0, 6).map(function (h) {
      var top = (h.top || [])[0];
      return '<div class="release">'
        + '<div class="row"><b>Season ' + (h.season + 1) + '</b>'
        + '<span class="spacer"></span>'
        + '<span class="tiny faint">wk ' + h.week + '</span></div>'
        + (top
            ? '<div class="tiny" style="margin-top:4px;color:var(--dim)">' +
              esc(top.name) + ' finished first at ' + U.fmtInt(top.rating) +
              (h.ranked ? ', out of ' + U.fmtInt(h.ranked) + ' ranked' : '') + '.</div>'
            : '<div class="tiny faint" style="margin-top:4px">Nobody ranked.</div>')
        + '</div>';
    }).join('');
    return ui.panel('Past seasons', rows
      + (S().ladderReturning
          ? '<div class="tiny faint" style="margin-top:9px;line-height:1.55">'
            + U.fmtInt(S().ladderReturning) + ' players finished the last season in the '
            + 'top half. Those are the ones who come back and queue again - the rest '
            + 'lose a season of standing, which is how a newcomer gets in.</div>'
          : ''));
  }

  function render() {
    var st = S();
    if (!PN.titles.hasTitle(st) || st.phase !== 'live') {
      return ui.panel('Leaderboard', ui.empty('Nothing to rank yet.',
        'Once the game is live and people are queueing, the ladder forms here.'));
    }
    var tab = PN.app.ladderTab || 'players';
    var nav = ui.tabs([
      { id: 'players', name: 'Players' },
      { id: 'guilds', name: 'Guilds',
        badge: String((st.guilds || []).filter(function (g) {
          return !g.dead && g.size > 0; }).length) }
    ], tab, 'ladder.tab');

    if (tab === 'guilds') {
      return nav + '<div class="grid g-2-1"><div>' + guildBoard()
        + '</div><div>' + PN.viewsDesign.socialPanel() + '</div></div>';
    }
    return nav + '<div class="grid g-2-1"><div>'
      + boardPanel()
      + '</div><div>' + seasonPanel() + balancePanel() + historyPanel()
      + '</div></div>';
  }

  PN.viewsLadder = { render: render, guildBoard: guildBoard };
})(PN);
