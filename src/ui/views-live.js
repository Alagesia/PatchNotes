/* Patch Notes - live service views.
   Dashboard, telemetry, community, studio and market.                    */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, tax = PN.tax, met = PN.metrics;

  function S() { return PN.game.state; }
  function hist(key, n) {
    var h = S().history;
    var from = Math.max(0, h.length - (n || 120));
    return h.slice(from).map(function (x) { return x[key] || 0; });
  }

  /* ============================================================ DASHBOARD */

  function dashboard() {
    var st = S(), rt = st.runtime, d = PN.sim.live(st);
    var live = st.phase === 'live';
    var last = st.history[st.history.length - 1];
    var prev = st.history[st.history.length - 2];

    if (!live) return preLaunchDashboard();

    var dPop = last && prev ? last.total - prev.total : 0;
    var kpis = '<div class="grid g4" style="margin-bottom:14px">' +
      ui.stat('Active players', U.fmtCompact(st.population.total),
        (dPop >= 0 ? '<span class="good">▲ ' : '<span class="bad">▼ ') + U.fmtCompact(Math.abs(dPop)) +
        ' this week</span> ' + PN.chart.spark(hist('total', 60))) +
      ui.stat('Weekly revenue', U.fmtMoney(st.finance.revenueWeek),
        'ARPU ' + U.fmtMoney(st.finance.arpuWeek) + ' ' + PN.chart.spark(hist('revenue', 60))) +
      ui.stat('Sentiment', Math.round(rt.sentiment),
        'Reviews ' + Math.round(rt.reviewScore) + '/100 ' + PN.chart.spark(hist('sentiment', 60)),
        ui.scoreClass(rt.sentiment)) +
      ui.stat('Cash', U.fmtMoney(st.studio.cash),
        (st.finance.revenueWeek - st.finance.costWeek >= 0 ? '<span class="good">+' : '<span class="bad">') +
        U.fmtMoney(st.finance.revenueWeek - st.finance.costWeek) + '/wk</span>',
        st.studio.cash < 0 ? 'bad' : '') +
      '</div>';

    /* Alerts: the things the player should look at right now. */
    var alerts = [];
    if (st.pendingEvents.length)
      alerts.push({ c: 'bad', t: st.pendingEvents.length + ' decision' +
        (st.pendingEvents.length > 1 ? 's' : '') + ' waiting', a: 'open the queue below' });
    if (rt.weeksSinceContent > 12)
      alerts.push({ c: 'warn', t: rt.weeksSinceContent + ' weeks since new content',
        a: 'novelty is draining across every cohort' });
    if (rt.bugLoad > 40) alerts.push({ c: 'bad', t: 'Bug load at ' + Math.round(rt.bugLoad), a: 'stability is bleeding' });
    if (rt.queuePressure > 25) alerts.push({ c: 'bad', t: 'Login queues', a: 'capacity is short' });
    if (rt.botPressure > 45) alerts.push({ c: 'warn', t: 'Bots and gold sellers', a: 'fairness is taking damage' });
    if (rt.techDebt > 80) alerts.push({ c: 'bad', t: 'Technical debt critical', a: 'everything costs more now' });
    if (st.studio.cash < 600000) alerts.push({ c: 'bad', t: 'Cash running out', a: U.fmtMoney(st.studio.cash) + ' left' });
    if (st.studio.morale < 48) alerts.push({ c: 'warn', t: 'Team morale low', a: 'attrition risk rising' });
    var bal = met.balanceState(d);
    if (bal.outliers.length)
      alerts.push({ c: 'warn', t: bal.outliers[0].cls.name + ' is an outlier',
        a: U.fmtSigned(bal.outliers[0].pveDev * 100, 0) + '% against its role' });

    var alertHtml = alerts.length
      ? alerts.map(function (a) {
          return '<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
            '<span class="chip ' + a.c + '">' + esc(a.t) + '</span>' +
            '<span class="small faint">' + esc(a.a) + '</span></div>';
        }).join('')
      : '<div class="small good">Nothing on fire. Enjoy it.</div>';

    /* Pending decisions. */
    var decisions = st.pendingEvents.map(function (e) {
      return '<div class="choice" data-act="event.open" data-val="' + e.id + '">' +
        '<div class="t">' + esc(e.title) + '</div>' +
        '<div class="d">' + esc(e.body) + '</div>' +
        '<div class="tiny faint" style="margin-top:7px">Resolves itself in ' +
          Math.max(0, e.expires - st.week) + ' week(s) if you do not decide.</div></div>';
    }).join('');

    var ax = PN.sim.currentAxes(st);
    var vals = PN.axes.values(ax);
    var axisRows = tax.AXIS_IDS.map(function (id) {
      return ui.axisRow(id, id === 'novelty'
        ? U.weightedAvg(st.population.cohorts, function (c) { return c.novelty; }, function (c) { return c.size + 1; })
        : vals[id], undefined, { act: 'axis.explain' });
    }).join('');

    var logHtml = st.log.slice(0, 14).map(logEntry).join('') || ui.empty('Nothing logged yet.');

    return '<div class="grid g-2-1"><div>' +
      kpis +
      ui.panel('Population', PN.chart.line([
        { name: 'Players', data: hist('total', 160), color: '#5fb3ff' }
      ], { height: 200, xLabels: function (i) { return 'w' + (st.history.length - Math.min(160, st.history.length) + i); } }),
        { hint: 'peak ' + U.fmtCompact(st.population.peak) }) +
      ui.panel('Joins vs leavers', PN.chart.line([
        { name: 'Joined', data: hist('joined', 120), color: '#5fd6a0' },
        { name: 'Left', data: hist('left', 120), color: '#ff7565' }
      ], { height: 150, fill: false })) +
      (decisions ? ui.panel('Decisions waiting', decisions) : '') +
      ui.panel('The week', logHtml) +
      '</div><div>' +
      (PN.viewsSim ? PN.viewsSim.scenarioPanel() : '') +
      ui.panel('Attention', alertHtml) +
      /* The servers, beside the outages and queues they explain. */
      PN.viewsDesign.infraPanel() +
      ui.panel('Need axes', axisRows + '<div class="tiny faint" style="margin-top:9px;line-height:1.5">' +
        'Click any axis to see exactly which design decisions are moving it.</div>') +
      ui.panel('Design health',
        '<div class="grid g2">' +
        ui.stat('Coherence', Math.round(ax._ctx.coherence.score), null, ui.scoreClass(ax._ctx.coherence.score)) +
        ui.stat('Balance', Math.round(bal.quality), null, ui.scoreClass(bal.quality)) +
        ui.stat('Bugs', Math.round(rt.bugLoad), null, rt.bugLoad > 35 ? 'bad' : '') +
        ui.stat('Tech debt', Math.round(rt.techDebt), null, rt.techDebt > 70 ? 'bad' : '') +
        '</div>') +
      '</div></div>';
  }

  function preLaunchDashboard() {
    var st = S(), c = PN.sim.completion(st);
    var cap = PN.state.capacity(st);
    var costs = PN.sim.payroll(st);
    var runway = costs.total > 0 ? st.studio.cash / costs.total : 999;

    var ready = c.overall >= 1;
    var pools = ['design', 'art', 'eng', 'qa'];
    var bottleneck = pools.slice().sort(function (a, b) { return c.per[a] - c.per[b]; })[0];

    return '<div class="grid g-2-1"><div>' +
      '<div class="grid g4" style="margin-bottom:14px">' +
      ui.stat('Week', st.week, 'in development') +
      ui.stat('Build complete', U.fmtPct(c.overall * 100), null, ui.scoreClass(c.overall * 100)) +
      ui.stat('Cash', U.fmtMoney(st.studio.cash),
        U.round(runway, 0) + ' weeks of runway', runway < 12 ? 'bad' : '') +
      ui.stat('Hype', Math.round(st.runtime.hype), 'awareness ' + Math.round(st.runtime.awareness) + '%') +
      '</div>' +
      ui.panel('Production',
        '<div class="grid g2"><div>' +
        pools.map(function (p) {
          var pct = c.per[p] * 100;
          return '<div class="axisrow" style="grid-template-columns:92px minmax(0,1fr) 52px">' +
            '<div class="nm">' + U.titleCase(p) + '</div>' +
            '<div class="track"><i style="width:' + Math.min(100, pct).toFixed(1) + '%;background:' +
              (pct >= 100 ? 'var(--good)' : p === bottleneck ? 'var(--warn)' : 'var(--accent)') + '"></i></div>' +
            '<div class="num">' + U.fmtPct(pct, 0) + '</div></div>';
        }).join('') +
        '</div><div>' +
        '<div class="small muted" style="line-height:1.6">Weekly capacity<br>' +
        '<span class="mono">design ' + U.round(cap.design, 1) + ' · art ' + U.round(cap.art, 1) +
        ' · eng ' + U.round(cap.eng, 1) + ' · qa ' + U.round(cap.qa, 1) + '</span></div>' +
        '<div class="tiny faint" style="margin-top:10px;line-height:1.6">Bottleneck: <b>' +
          U.titleCase(bottleneck) + '</b>. Hire for it, cut scope, or accept a later launch.</div>' +
        '</div></div>') +
      ui.panel('Launch', ready
        ? '<div class="small good" style="margin-bottom:11px">The build is complete. You can ship.</div>' +
          '<button class="primary" data-act="game.launch">Launch ' + esc(PN.game.state.design.meta.name) + '</button>'
        : '<div class="small muted" style="margin-bottom:11px">The build is ' + U.fmtPct(c.overall * 100) +
          ' complete. Launching now ships the missing ' + U.fmtPct((1 - c.overall) * 100) +
          ' as bugs, technical debt and a review-score penalty you will carry for years.</div>' +
          '<button class="danger" data-act="game.launchEarly">Launch anyway</button>') +
      ui.panel('The week', st.log.slice(0, 10).map(logEntry).join('') || ui.empty('Nothing yet.')) +
      '</div><div>' +
      ui.panel('Marketing',
        ui.slider({ path: 'runtime.marketingSpend', label: 'Weekly marketing spend',
          value: st.runtime.marketingSpend, min: 0, max: 4000, step: 100,
          fmt: function (v) { return U.fmtMoney(v); },
          desc: 'Builds hype before launch. Hype converts to awareness the day you ship, and awareness is the only thing that turns into players.' }) +
        '<div class="grid g2" style="margin-top:8px">' +
        ui.stat('Hype', Math.round(st.runtime.hype)) +
        ui.stat('Awareness', U.fmtPct(st.runtime.awareness, 0)) + '</div>') +
      staffPanelCompact() +
      '</div></div>';
  }

  function logEntry(l) {
    var col = { launch: 'var(--good)', patch: 'var(--accent)', crisis: 'var(--bad)',
                alert: 'var(--bad)', warn: 'var(--warn)', community: 'var(--purple)',
                staff: 'var(--pink)', market: 'var(--teal)', balance: 'var(--warn)',
                economy: 'var(--warn)', business: 'var(--teal)', decision: 'var(--dim)',
                player: 'var(--pink)' }[l.kind] || 'var(--faint)';
    return '<div class="logentry"><div class="wk">W' + l.week + '</div>' +
      '<div class="dot" style="background:' + col + '"></div>' +
      '<div style="flex:1"><div class="t">' + esc(l.title) + '</div>' +
      (l.body ? '<div class="b">' + esc(l.body) + '</div>' : '') + '</div></div>';
  }

  /* ============================================================ TELEMETRY */

  function telemetry() {
    var st = S();
    if (st.phase !== 'live') return ui.panel('Telemetry', ui.empty('No telemetry until the game is live.'));

    var ax = PN.sim.currentAxes(st);
    var vals = PN.axes.values(ax);

    /* Cohort table, sorted by size. */
    var cohorts = st.population.cohorts.filter(function (c) { return c.size > 1; })
      .sort(function (a, b) { return b.size - a.size; });
    var rows = cohorts.map(function (c) {
      var arch = tax.ARCHETYPE_BY_ID[c.arch];
      var churnPct = c.size > 0 ? (c.lastChurn / c.size) * 100 : 0;
      return '<tr class="click" data-act="cohort.open" data-val="' + c.key + '">' +
        '<td>' + esc(arch.name) + ' <span class="faint tiny">' + esc(PN.pop.bandOf(c.band).name) + '</span></td>' +
        '<td class="num">' + U.fmtCompact(c.size) + '</td>' +
        '<td class="num ' + ui.scoreClass(c.satisfaction) + '">' + Math.round(c.satisfaction) + '</td>' +
        '<td class="num ' + ui.scoreClass(c.novelty) + '">' + Math.round(c.novelty) + '</td>' +
        '<td class="num">' + U.round(c.hoursPlayed || 0, 1) + '</td>' +
        '<td class="num ' + (churnPct > 6 ? 'bad' : churnPct > 3 ? 'warn' : '') + '">' + U.fmtPct(churnPct, 1) + '</td>' +
        '<td class="num">' + U.fmtMoney(c.spendWeek || 0) + '</td></tr>';
    }).join('');

    /* Population composition by archetype. */
    var byArch = tax.ARCHETYPES.map(function (a, i) {
      var size = U.sum(st.population.cohorts.filter(function (c) { return c.arch === a.id; }),
                       function (c) { return c.size; });
      return { name: a.name, value: size, color: PN.chart.PALETTE[i % PN.chart.PALETTE.length] };
    }).sort(function (x, y) { return y.value - x.value; });

    var axisRows = tax.AXIS_IDS.map(function (id) {
      return ui.axisRow(id, id === 'novelty'
        ? U.weightedAvg(st.population.cohorts, function (c) { return c.novelty; }, function (c) { return c.size + 1; })
        : vals[id], undefined, { act: 'axis.explain' });
    }).join('');

    return '<div class="grid g-2-1"><div>' +
      ui.panel('Population and revenue', PN.chart.line([
        { name: 'Players', data: hist('total', 160), color: '#5fb3ff' }
      ], { height: 170 }) +
      PN.chart.line([
        { name: 'Revenue', data: hist('revenue', 160), color: '#5fd6a0' },
        { name: 'Cost', data: hist('cost', 160), color: '#ff7565' }
      ], { height: 140, fill: false, fmt: U.fmtMoney })) +
      ui.panel('Satisfaction and sentiment', PN.chart.line([
        { name: 'Satisfaction', data: hist('satisfaction', 160), color: '#b79cff' },
        { name: 'Sentiment', data: hist('sentiment', 160), color: '#ffc861' }
      ], { height: 150, fill: false, max: 100, min: 0 })) +
      ui.panel('Cohorts',
        '<table class="data"><tr><th>Cohort</th><th class="num">Players</th><th class="num">Sat</th>' +
        '<th class="num">Novelty</th><th class="num">Hrs/wk</th><th class="num">Churn</th><th class="num">Spend</th></tr>' +
        rows + '</table>' +
        '<div class="tiny faint" style="margin-top:9px">Click a cohort to see what it thinks of your game, axis by axis.</div>') +
      '</div><div>' +
      ui.panel('Need axes', axisRows) +
      ui.panel('Who is playing',
        PN.chart.stack(byArch, { height: 11 }) +
        '<div style="margin-top:11px">' + PN.chart.bars(byArch.filter(function (x) { return x.value > 0; }),
          { labelW: 102, fmt: U.fmtCompact }) + '</div>') +
      ui.panel('Operations',
        '<div class="grid g2">' +
        ui.stat('Bug load', Math.round(st.runtime.bugLoad), null, st.runtime.bugLoad > 35 ? 'bad' : '') +
        ui.stat('Tech debt', Math.round(st.runtime.techDebt), null, st.runtime.techDebt > 70 ? 'bad' : '') +
        ui.stat('Queues', Math.round(st.runtime.queuePressure), null, st.runtime.queuePressure > 20 ? 'bad' : '') +
        ui.stat('Bots', Math.round(st.runtime.botPressure), null, st.runtime.botPressure > 45 ? 'bad' : '') +
        '</div>') +
      '</div></div>';
  }

  /* The causal chain: why is this axis where it is? */
  function axisExplain(axisId) {
    var st = S(), ax = PN.sim.currentAxes(st);
    var def = tax.AXIS_BY_ID[axisId];

    if (axisId === 'novelty') {
      var rows = st.population.cohorts.filter(function (c) { return c.size > 1; })
        .sort(function (a, b) { return a.novelty - b.novelty; }).slice(0, 10)
        .map(function (c) {
          return '<tr><td>' + esc(tax.ARCHETYPE_BY_ID[c.arch].name) + ' <span class="faint tiny">' +
            esc(PN.pop.bandOf(c.band).name) + '</span></td>' +
            '<td class="num ' + ui.scoreClass(c.novelty) + '">' + Math.round(c.novelty) + '</td>' +
            '<td class="num">' + U.round(c.freshSupply || 0, 2) + '</td>' +
            '<td class="num">' + U.round(c.engineSupply || 0, 2) + '</td></tr>';
        }).join('');
      return ui.modal({
        title: 'Novelty', sub: def.desc,
        body: '<div class="small muted" style="margin-bottom:12px;line-height:1.6">Novelty is the only axis scored per cohort, ' +
          'because it depends on what each group has already eaten. It has been <b>' + st.runtime.weeksSinceContent +
          '</b> week(s) since your last content drop.</div>' +
          '<table class="data"><tr><th>Cohort</th><th class="num">Novelty</th>' +
          '<th class="num">Fresh supply</th><th class="num">Repeatable supply</th></tr>' + rows + '</table>' +
          '<div class="tiny faint" style="margin-top:11px;line-height:1.6">Supply figures are multiples of that cohort\'s ' +
          'weekly play time. Below 1.0 they are running out of things to do.</div>'
      });
    }

    var a = ax[axisId];
    if (!a) return;
    var archRows = tax.ARCHETYPES.map(function (arch) {
      var v = a.value, ideal = arch.ideals[axisId];
      var gap = v >= ideal ? (v - ideal) * def.over : (ideal - v) * def.under;
      var score = U.clamp100(100 - gap);
      return { arch: arch, score: score, ideal: ideal, weight: arch.weights[axisId] };
    }).sort(function (x, y) { return (x.score * x.weight) - (y.score * y.weight); });

    return ui.modal({
      title: def.name, sub: def.desc,
      wide: true,
      body: '<div class="grid g2"><div>' +
        '<div class="row" style="margin-bottom:12px">' +
        '<div style="font:600 34px var(--mono);color:' + ui.scoreColour(a.value) + '">' + Math.round(a.value) + '</div>' +
        '<div class="small muted">out of 100</div></div>' +
        '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px">What is moving it</div>' +
        ui.parts(a.parts, 14) +
        '</div><div>' +
        '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px">Who this is hurting</div>' +
        '<table class="data"><tr><th>Archetype</th><th class="num">Wants</th><th class="num">Scores</th><th class="num">Weight</th></tr>' +
        archRows.map(function (r) {
          return '<tr><td>' + esc(r.arch.name) + '</td>' +
            '<td class="num faint">' + Math.round(r.ideal) + '</td>' +
            '<td class="num ' + ui.scoreClass(r.score) + '">' + Math.round(r.score) + '</td>' +
            '<td class="num faint">' + U.fmtPct(r.weight * 100, 0) + '</td></tr>';
        }).join('') + '</table>' +
        '<div class="tiny faint" style="margin-top:11px;line-height:1.6">Weight is how much this archetype cares. ' +
        'A low score on an axis nobody weights is not a problem; a mediocre score on one they all weight is.</div>' +
        '</div></div>'
    });
  }

  function cohortModal(key) {
    var st = S(), co = null;
    st.population.cohorts.forEach(function (c) { if (c.key === key) co = c; });
    if (!co) return;
    var arch = tax.ARCHETYPE_BY_ID[co.arch], band = PN.pop.bandOf(co.band);

    var rows = tax.AXIS_IDS.map(function (id) {
      var s = co.axisScores[id];
      if (!s) return '';
      return '<tr><td>' + esc(tax.AXIS_BY_ID[id].name) + '</td>' +
        '<td class="num faint">' + Math.round(s.ideal) + '</td>' +
        '<td class="num">' + Math.round(s.value) + '</td>' +
        '<td class="num ' + ui.scoreClass(s.score) + '">' + Math.round(s.score) + '</td>' +
        '<td class="num faint">' + U.fmtPct(s.weight * 100, 0) + '</td></tr>';
    }).join('');

    var vals = {}, ideals = {};
    tax.AXIS_IDS.forEach(function (id) {
      vals[id] = co.axisScores[id] ? co.axisScores[id].value : 50;
      ideals[id] = arch.ideals[id];
    });

    return ui.modal({
      title: arch.name + ' · ' + band.name, wide: true,
      sub: arch.blurb,
      body: '<div class="grid g2"><div>' +
        '<div class="grid g2" style="margin-bottom:12px">' +
        ui.stat('Players', U.fmtCompact(co.size)) +
        ui.stat('Satisfaction', Math.round(co.satisfaction), null, ui.scoreClass(co.satisfaction)) +
        ui.stat('Hours/week', U.round(co.hoursPlayed || 0, 1), 'of ' + U.round(co.budget || 0, 1) + ' available') +
        ui.stat('Weekly spend', U.fmtMoney(co.spendWeek || 0)) +
        '</div>' +
        PN.chart.radar(tax.AXIS_IDS, vals, ideals, { size: 270 }) +
        '<div class="tiny faint center" style="margin-top:6px">Blue is your game. Pink dashes are what this group wants.</div>' +
        '</div><div>' +
        '<table class="data"><tr><th>Axis</th><th class="num">Wants</th><th class="num">Gets</th>' +
        '<th class="num">Score</th><th class="num">Weight</th></tr>' + rows + '</table>' +
        '</div></div>'
    });
  }

  /* What one audience wants, what this game gives them, and which
     dial is the one to move.

     "Why do I have no economists" is a question the game can answer
     exactly, because fit is computed from two things: how near the
     axes land to what that audience wants, and whether there is
     anything here they want to DO. Both are readable. */
  function audienceModal(archId) {
    var st = S(), d = PN.sim.live(st);
    var arch = tax.ARCHETYPE_BY_ID[archId];
    if (!arch) return;
    var ax = PN.sim.currentAxes(st);
    var vals = PN.axes.values(ax);
    var fit = PN.axes.archetypeFit(d, ax, st.era);
    var inv = ax.noveltyCapacity.byCategory, engH = ax.noveltyCapacity.engineByCategory;

    /* Axis by axis, weighted by how much this audience cares. */
    var axisRows = tax.AXIS_IDS.map(function (id) {
      var def = tax.AXIS_BY_ID[id], ideal = arch.ideals[id], v = vals[id];
      var gap = v >= ideal ? (v - ideal) * def.over : (ideal - v) * def.under;
      var score = U.clamp100(100 - gap);
      return { id: id, name: def.name, desc: def.desc, ideal: ideal, value: v,
               score: score, weight: arch.weights[id],
               cost: (100 - score) * arch.weights[id],
               unknown: id === 'novelty' || id === 'stability' };
    }).sort(function (a, b) { return b.weight - a.weight; });

    /* And what there is for them to do. */
    var contentRows = tax.CONTENT_CATEGORIES.map(function (c) {
      var hours = (inv[c.id] || 0) + (engH[c.id] || 0) * 10;
      return { name: c.name, appeal: arch.appeal[c.id], hours: hours };
    }).filter(function (r) { return r.appeal >= 0.35; })
      .sort(function (a, b) { return b.appeal - a.appeal; });

    var thin = contentRows.filter(function (r) { return r.hours < 12; });
    var worst = axisRows.slice().sort(function (a, b) { return b.cost - a.cost; })
      .filter(function (r) { return r.cost > 0.8; }).slice(0, 3);

    return ui.modal({
      title: arch.name, wide: true, sub: arch.blurb,
      body: '<div class="grid g2"><div>'
        + '<div class="grid g2" style="margin-bottom:12px">'
        + ui.stat('Fit', Math.round(fit[archId]), null, ui.scoreClass(fit[archId]))
        + ui.stat('Share of the market', U.fmtPct(tax.marketMix(st.era)[archId] * 100, 1))
        + ui.stat('Hours a week each', arch.time, 'give or take ' + arch.timeSd)
        + ui.stat('Leaves per week', U.fmtPct(arch.churn * 100, 1),
            arch.churn > 0.05 ? 'a leaky bucket' : 'sticky')
        + '</div>'
        + '<div class="subhead">What they weigh, and what you are giving them</div>'
        + '<table class="data"><tr><th>Axis</th><th class="num">Cares</th>'
        + '<th class="num">Wants</th><th class="num">Gets</th><th class="num">Score</th></tr>'
        + axisRows.map(function (r) {
            return '<tr><td>' + esc(r.name) +
              (r.unknown ? ' <span class="tiny faint">(not counted until live)</span>' : '') +
              '</td>' +
              '<td class="num faint">' + U.fmtPct(r.weight * 100, 0) + '</td>' +
              '<td class="num faint">' + Math.round(r.ideal) + '</td>' +
              '<td class="num">' + Math.round(r.value) + '</td>' +
              '<td class="num ' + ui.scoreClass(r.score) + '">' + Math.round(r.score) + '</td></tr>';
          }).join('') + '</table>'
        + '</div><div>'
        + '<div class="subhead">What they would be here to do</div>'
        + '<table class="data"><tr><th>Content</th><th class="num">Draw</th>'
        + '<th class="num">Hours you built</th></tr>'
        + contentRows.map(function (r) {
            return '<tr><td>' + esc(r.name) + '</td>' +
              '<td class="num faint">' + U.fmtPct(r.appeal * 100, 0) + '</td>' +
              '<td class="num ' + (r.hours < 12 ? 'bad' : r.hours < 30 ? 'warn' : 'good') + '">' +
              U.round(r.hours, 1) + '</td></tr>';
          }).join('') + '</table>'
        + '<div class="subhead spaced">To have more of them</div>'
        + '<div class="tiny faint" style="line-height:1.65">'
        + (worst.length
            ? 'They weigh ' + U.listJoin(worst.map(function (r) {
                return '<b style="color:var(--text)">' + esc(r.name.toLowerCase()) + '</b> at ' +
                  U.fmtPct(r.weight * 100, 0) + ' and you read ' + Math.round(r.value) +
                  ' against the ' + Math.round(r.ideal) + ' they want'; })) + '. '
            : 'The axes already land where they want them. ')
        + (thin.length
            ? 'And there is little here for them to do: ' +
              U.listJoin(thin.slice(0, 3).map(function (r) {
                return esc(r.name.toLowerCase()) + ' is ' + U.round(r.hours, 1) + ' hours'; })) +
              '. Half of what a game is worth to somebody is whether it has the thing they came for.'
            : 'And there is plenty here they want to do.')
        + '</div>'
        + '<div class="tiny faint" style="margin-top:10px;line-height:1.65">'
        + 'Appeal is only half of it. They leave at ' + U.fmtPct(arch.churn * 100, 1)
        + ' a week whatever you do, so what you settle at is roughly what joins divided by '
        + 'that - which is why a sticky audience can outnumber one you suit better.</div>'
        + '</div></div>'
    });
  }

  /* What the genre is like right now, and what it is about to be like.

     An era is not flavour text: it moves the market, what players
     forgive, what they expect, and which kinds of player there are
     more of. A game does not change on the week the genre does - the
     world does, underneath it - and that is worth being able to read
     before it happens rather than after. */
  function eraPanel(era, d, mix) {
    var st = S();
    var all = tax.ERAS || [];
    var next = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].year > era.year && (!next || all[i].year < next.year)) next = all[i];
    }
    var year = (st.design && st.design.meta && st.design.meta.startYear
                ? st.design.meta.startYear : st.startYear || era.year) +
               Math.floor(st.week / 52);
    var away = next ? Math.max(0, (next.year - year) * 52 - (st.week % 52)) : null;

    function delta(label, now, then, fmt, higherIsKinder) {
      var f = fmt || function (v) { return U.round(v, 2); };
      var move = (then === null || then === undefined) ? null : then - now;
      var cls = move === null || Math.abs(move) < 0.001 ? ''
              : (move > 0) === !!higherIsKinder ? 'good' : 'bad';
      var shown = move === null ? '—'
        : (move > 0 ? '+' : move < 0 ? '&minus;' : '') + f(Math.abs(move));
      return '<tr><td>' + esc(label) + '</td>' +
        '<td class="num">' + f(now) + '</td>' +
        '<td class="num ' + cls + '">' + shown + '</td></tr>';
    }

    /* Which kinds of player the genre is making more and fewer of. */
    var shiftRows = [];
    if (next) {
      var here = tax.marketMix(era), there = tax.marketMix(next);
      shiftRows = tax.ARCHETYPES.map(function (a) {
        return { a: a, from: here[a.id], to: there[a.id],
                 move: (there[a.id] - here[a.id]) / Math.max(1e-9, here[a.id]) };
      }).sort(function (x, y) { return y.move - x.move; });
    }

    return ui.panel('The genre, right now', ''
      + '<div class="tiny faint" style="line-height:1.6;margin-bottom:10px">'
      + '<b style="color:var(--text)">' + esc(era.name) + '</b> &middot; ' + era.year + '+. '
      + esc(era.note) + '</div>'
      + '<table class="data"><tr><th>What the genre is like</th><th class="num">Now</th>'
      + '<th class="num">' + (next ? 'In ' + esc(next.name) : 'Next') + '</th></tr>'
      + delta('Players looking for an MMO', tax.poolFor(st),
          next ? tax.marketPool(next) : null,
          function (v) { return U.fmtCompact(v); }, true)
      + delta('Polish expected', era.expectation, next ? next.expectation : null,
          function (v) { return Math.round(v); }, false)
      + delta('Grind forgiven', era.toleranceGrind, next ? next.toleranceGrind : null, null, true)
      + delta('Jank forgiven', era.toleranceBugs, next ? next.toleranceBugs : null, null, true)
      + delta('Monetisation forgiven', era.monetTolerance,
          next ? next.monetTolerance : null, null, true)
      + delta('Free-to-play is normal', era.f2pNorm, next ? next.f2pNorm : null,
          function (v) { return U.fmtPct(v * 100, 0); }, true)
      + '</table>'
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">You ship '
      + Math.round(d.identity.productionValue) + ' production value against the '
      + Math.round(era.expectation) + ' this era expects'
      + (d.identity.productionValue < era.expectation - 10
          ? ' — <b class="bad">under it</b>, and that is a standing cost on review score.'
          : '.') + '</div>'
      + (next
          ? '<div class="subhead spaced">' + esc(next.name) + ', in ' +
              (away > 52 ? U.round(away / 52, 1) + ' years' : away + ' weeks') + '</div>'
            + '<div class="tiny faint" style="line-height:1.6;margin-bottom:8px">'
            + esc(next.note) + '</div>'
            + '<div class="tiny faint" style="line-height:1.6">The genre will be making '
            + 'more of some kinds of player and fewer of others. Nothing about your game '
            + 'changes; the people arriving do.</div>'
            + '<table class="data" style="margin-top:6px">'
            + shiftRows.slice(0, 3).map(function (r) {
                return '<tr><td>' + esc(r.a.name) + 's</td><td class="num good">+' +
                  Math.round(r.move * 100) + '%</td></tr>'; }).join('')
            + shiftRows.slice(-3).map(function (r) {
                return '<tr><td>' + esc(r.a.name) + 's</td><td class="num bad">' +
                  Math.round(r.move * 100) + '%</td></tr>'; }).join('')
            + '</table>'
          : '<div class="tiny faint" style="margin-top:10px">This is where the genre ends up. '
            + 'Nothing after this is written yet.</div>'),
      { hint: era.year + '+' });
  }

  /* ============================================================ COMMUNITY */

  function community() {
    var st = S(), rt = st.runtime;
    var feed = st.log.slice(0, 60).map(logEntry).join('') || ui.empty('Nothing yet.');

    var topComplaints = [];
    var totalPop = st.population.total || 1;
    tax.AXIS_IDS.forEach(function (id) {
      var pain = 0;
      st.population.cohorts.forEach(function (c) {
        var s = c.axisScores[id];
        if (!s || c.size < 1) return;
        pain += (100 - s.score) * s.weight * c.size;
      });
      topComplaints.push({ name: tax.AXIS_BY_ID[id].name, value: pain / totalPop, id: id });
    });
    topComplaints.sort(function (a, b) { return b.value - a.value; });

    return '<div class="grid g-2-1"><div>' +
      ui.panel('Community feed', feed) +
      '</div><div>' +
      ui.panel('Mood',
        '<div class="grid g2">' +
        ui.stat('Sentiment', Math.round(rt.sentiment), null, ui.scoreClass(rt.sentiment)) +
        ui.stat('Review score', Math.round(rt.reviewScore), null, ui.scoreClass(rt.reviewScore)) +
        ui.stat('Awareness', U.fmtPct(rt.awareness, 0)) +
        ui.stat('Studio reputation', Math.round(st.studio.reputation), null, ui.scoreClass(st.studio.reputation)) +
        '</div>' +
        PN.chart.line([{ name: 'Sentiment', data: hist('sentiment', 120), color: '#ffc861' }],
          { height: 110, max: 100, min: 0 })) +
      /* The guild table used to sit here. A ranking of guilds is a
         leaderboard, so it lives on the Leaderboard screen next to the
         other one; this is the screen where you read the forums. */
      ui.panel('Guilds',
        (function () {
          var n = (st.guilds || []).filter(function (g) { return !g.dead && g.size > 0; }).length;
          var guilded = U.sum(st.agents.filter(function (a) { return !!a.gid; }),
            function (a) { return a.w; });
          var share = st.population.total > 0 ? guilded / st.population.total : 0;
          return '<div class="grid g2">'
            + ui.stat('Guilds', n)
            + ui.stat('In a guild', U.fmtPct(share * 100, 0), 'of your players',
                share > 0.5 ? 'good' : share > 0.25 ? 'warn' : 'bad')
            + '</div>'
            + '<button class="sm" style="margin-top:10px" data-act="nav" data-val="ladder">'
            + 'Open the guild leaderboard</button>';
        })()) +
      ui.panel('What they are complaining about',
        PN.chart.bars(topComplaints.slice(0, 8).map(function (t) {
          return { name: t.name, value: t.value, color: '#ff7565' };
        }), { labelW: 104, fmt: function (v) { return U.round(v, 1); } }) +
        '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Population-weighted pain per axis. ' +
        'This is the order the forums will shout in.</div>') +
      /* The social graph is authored here, next to the people it is
         a graph of, rather than in a design menu of settings. */
      PN.viewsDesign.socialPanel() +
      '</div></div>';
  }

  /* =============================================================== STUDIO */

  function staffPanelCompact() {
    var st = S(), cap = PN.state.capacity(st);
    return ui.panel('Team',
      '<div class="grid g2" style="margin-bottom:10px">' +
      ui.stat('Headcount', st.studio.staff.length) +
      ui.stat('Morale', Math.round(st.studio.morale), null, ui.scoreClass(st.studio.morale)) +
      '</div>' +
      '<div class="small muted mono">design ' + U.round(cap.design, 1) + ' · art ' + U.round(cap.art, 1) +
      ' · eng ' + U.round(cap.eng, 1) + ' · qa ' + U.round(cap.qa, 1) + '</div>' +
      '<button class="sm" style="margin-top:10px" data-act="nav" data-val="studio">Open studio</button>');
  }

  function studio() {
    var st = S(), cap = PN.state.capacity(st), costs = PN.sim.payroll(st);
    var c = PN.sim.completion(st);

    var roleGroups = {};
    st.studio.staff.forEach(function (s) { (roleGroups[s.role] = roleGroups[s.role] || []).push(s); });

    var staffRows = st.studio.staff.slice().sort(function (a, b) {
      return a.role === b.role ? b.skill - a.skill : a.role < b.role ? -1 : 1;
    }).map(function (s) {
      var role = PN.state.ROLE_BY_ID[s.role];
      return '<tr><td>' + esc(s.name) + '</td>' +
        '<td class="small muted">' + esc(role.name) + '</td>' +
        '<td class="num">' + U.round(s.skill, 2) + '</td>' +
        '<td class="num ' + (s.morale < 45 ? 'bad' : s.morale < 62 ? 'warn' : '') + '">' + Math.round(s.morale) + '</td>' +
        '<td class="num ' + (s.burnout > 55 ? 'bad' : '') + '">' + Math.round(s.burnout) + '</td>' +
        '<td class="num">' + U.fmtMoneyFull(s.salary) + '</td>' +
        '<td class="num"><button class="xs ghost" data-act="staff.fire" data-val="' + s.id + '">let go</button></td></tr>';
    }).join('');

    var hireCards = PN.state.STAFF_ROLES.map(function (r) {
      var n = (roleGroups[r.id] || []).length;
      return '<div style="background:var(--panel-2);border-radius:7px;padding:9px 11px;margin-bottom:6px">' +
        '<div class="row"><div><div class="small">' + esc(r.name) +
        (n ? ' <span class="faint tiny">×' + n + '</span>' : '') + '</div>' +
        '<div class="tiny faint">' + U.fmtMoneyFull(r.salary) + '/mo</div></div>' +
        '<span class="spacer"></span>' +
        '<button class="xs" data-act="staff.hire" data-val="' + r.id + '">Hire</button></div>' +
        '<div class="tiny faint" style="margin-top:4px;line-height:1.45">' + esc(r.desc) + '</div></div>';
    }).join('');

    var shipReady = c.overall >= 1;
    var patchPanel = st.phase === 'live'
      ? ui.panel('Shipping',
          '<div class="small muted" style="line-height:1.6;margin-bottom:11px">Everything you author in the Design Studio is a ' +
          '<b>draft</b>. It only reaches players when you ship a patch, and it only ships when the team has built it.</div>' +
          costBars(c) +
          '<div class="row" style="margin-top:12px">' +
          (shipReady
            ? '<button class="primary" data-act="patch.ship">Ship patch</button>'
            : '<button class="danger" data-act="patch.shipEarly">Ship unfinished (' +
              U.fmtPct(c.overall * 100, 0) + ')</button>') +
          '<span class="small faint">' + st.runtime.weeksSinceContent + ' weeks since last drop</span></div>')
      : '';

    return '<div class="grid g-2-1"><div>' +
      '<div class="grid g4" style="margin-bottom:14px">' +
      ui.stat('Headcount', st.studio.staff.length) +
      ui.stat('Morale', Math.round(st.studio.morale), null, ui.scoreClass(st.studio.morale)) +
      ui.stat('Weekly cost', U.fmtMoney(costs.total),
        'wages ' + U.fmtMoney(costs.wages) + ' · servers ' + U.fmtMoney(costs.servers)) +
      ui.stat('Tech debt', Math.round(st.runtime.techDebt), null, st.runtime.techDebt > 70 ? 'bad' : '') +
      '</div>' +
      patchPanel +
      ui.panel('Team',
        '<table class="data"><tr><th>Name</th><th>Role</th><th class="num">Skill</th><th class="num">Morale</th>' +
        '<th class="num">Burnout</th><th class="num">Salary</th><th></th></tr>' + staffRows + '</table>') +
      '</div><div>' +
      ui.panel('Capacity',
        '<div class="grid g2">' +
        ui.stat('Design', U.round(cap.design, 1)) + ui.stat('Art', U.round(cap.art, 1)) +
        ui.stat('Engineering', U.round(cap.eng, 1)) + ui.stat('QA', U.round(cap.qa, 1)) +
        '</div>' +
        '<div class="tiny faint" style="margin-top:10px;line-height:1.5">Tools engineers and producers multiply everyone ' +
        'else (×' + U.round(cap.mult, 2) + '). Technical debt taxes everyone (×' + U.round(cap.debtTax, 2) + ').</div>') +
      ui.panel('Crunch',
        ui.slider({ path: 'studio.crunch', label: 'Crunch level', value: st.studio.crunch,
          desc: 'Buys throughput now. Pays for it in morale, bugs, technical debt and the people who leave.' }) +
        (st.studio.crunch > 45 ? '<div class="chip bad">Sustained crunch is how studios lose their seniors</div>' : '')) +
      ui.panel('Hire', hireCards) +
      '</div></div>';
  }

  function costBars(c) {
    var st = S();
    return ['design', 'art', 'eng', 'qa'].map(function (p) {
      var pct = c.per[p] * 100;
      return '<div class="axisrow" style="grid-template-columns:92px minmax(0,1fr) 52px">' +
        '<div class="nm">' + U.titleCase(p) + '</div>' +
        '<div class="track"><i style="width:' + Math.min(100, pct).toFixed(1) + '%;background:' +
          (pct >= 100 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
        '<div class="num">' + U.fmtPct(pct, 0) + '</div></div>';
    }).join('');
  }

  /* =============================================================== MARKET */

  function market() {
    var st = S(), era = st.era, d = PN.sim.live(st);
    var ax = PN.sim.currentAxes(st);
    var fit = PN.axes.archetypeFit(d, ax, era);
    var mix = tax.marketMix(era);

    /* Fit is what the game is worth to somebody. Penetration is what
       fit has managed to CONVERT, over years, against a churn rate -
       so the two do not have to agree, and when they disagree wildly
       the interesting number is the one in between: how many of each
       audience are turning up this week. Without it the screen said
       "you appeal equally to five audiences" beside "you have none of
       four of them" and left the player to guess which was lying. */
    var acq = PN.pop.acquire(st, fit, PN.sim.currentAxes(st)._ctx.coherence);
    var rows = tax.ARCHETYPES.map(function (a) {
      var have = U.sum(st.population.cohorts.filter(function (c) { return c.arch === a.id; }),
                       function (c) { return c.size; });
      /* The market this game is actually playing in. The whole genre
         is scaled down so every player can be simulated as a person,
         and the sim has always acquired out of the scaled pool - but
         this screen printed the real-world figure beside a playerbase
         counted in the scaled one. Forty-four million against twenty
         thousand: a market nobody could ever make a dent in, and a
         penetration column pinned at nought-point-one per cent for
         the same reason, a hundred times over. */
      var pool = tax.poolFor(st) * mix[a.id];
      return { a: a, fit: fit[a.id], have: have, pool: pool,
               join: acq.byArchetype[a.id] || 0,
               churn: a.churn,
               pen: pool > 0 ? have / pool : 0 };
    }).sort(function (x, y) { return y.fit - x.fit; });

    return '<div class="grid g-2-1"><div>' +
      ui.panel('The market',
        '<div class="grid g4" style="margin-bottom:14px">' +
        ui.stat('Era', era.name, era.year + '+') +
        ui.stat('Addressable', U.fmtCompact(tax.poolFor(st)), 'players looking for an MMO') +
        ui.stat('Awareness', U.fmtPct(st.runtime.awareness, 0)) +
        ui.stat('Lifetime accounts', U.fmtCompact(st.population.lifetimeAccounts)) +
        '</div>' +
        '<div class="small muted" style="line-height:1.6">' + esc(era.note) + '</div>') +
      (PN.viewsSim ? PN.viewsSim.competitorsPanel() : '') +
      ui.panel('Audience fit and penetration',
        '<div class="tiny faint" style="margin-bottom:9px;line-height:1.55">'
        + '<b style="color:var(--text)">Fit</b> is how much this game is worth to somebody of that '
        + 'kind. <b style="color:var(--text)">Joining</b> is how many of them that is actually '
        + 'converting each week, out of a market that size. '
        + '<b style="color:var(--text)">Penetration</b> is what years of that have added up to '
        + 'against a churn rate - so an audience that leaves twice as fast settles at half the '
        + 'share on the same appeal. Click a row for what they want and what they are getting.</div>'
        + '<table class="data"><tr><th>Archetype</th><th class="num">Fit</th><th class="num">Market</th>' +
        '<th class="num">Joining/wk</th><th class="num">Leaves/wk</th>' +
        '<th class="num">You have</th><th class="num">Penetration</th></tr>' +
        rows.map(function (r) {
          return '<tr class="click" data-act="market.audience" data-val="' + r.a.id + '">' +
            '<td>' + esc(r.a.name) + '<div class="tiny faint">' + esc(r.a.blurb) + '</div></td>' +
            '<td class="num ' + ui.scoreClass(r.fit) + '">' + Math.round(r.fit) + '</td>' +
            '<td class="num faint">' + U.fmtCompact(r.pool) + '</td>' +
            '<td class="num">' + U.fmtInt(Math.round(r.join)) + '</td>' +
            '<td class="num faint">' + U.fmtPct(r.churn * 100, 1) + '</td>' +
            '<td class="num">' + U.fmtCompact(r.have) + '</td>' +
            '<td class="num">' + U.fmtPct(r.pen * 100, 1) + '</td></tr>';
        }).join('') + '</table>') +
      '</div><div>' +
      ui.panel('Marketing',
        ui.slider({ path: 'runtime.marketingSpend', label: 'Weekly spend',
          value: st.runtime.marketingSpend, min: 0, max: 4000, step: 100,
          fmt: function (v) { return U.fmtMoney(v); } }) +
        '<div class="tiny faint" style="line-height:1.5">Marketing buys awareness. Awareness only converts if the ' +
        'design actually fits someone, and if sentiment is not in the gutter.</div>') +
      eraPanel(era, d, mix) +
      '</div></div>';
  }

  PN.viewsLive = {
    dashboard: dashboard, telemetry: telemetry, community: community,
    studio: studio, market: market, axisExplain: axisExplain, cohortModal: cohortModal,
    audienceModal: audienceModal
  };
})(PN);
