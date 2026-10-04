/* Patch Notes - simulation views.
   Individual players, the economy, the guild graph, rival studios and
   the scenario scoreboard.                                             */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, tax = PN.tax, IT = PN.items, ST = PN.stats;

  function S() { return PN.game.state; }
  /* The DRAFT, which is what these controls edit. */
  function D() { return PN.game.state.design; }

  /* ============================================================ PLAYERS */

  function playersTab() {
    var st = S();
    if (st.phase !== 'live' || !st.agents.length) {
      return ui.panel('Players', ui.empty('No players yet.',
        'Once the game is live, every single player is simulated individually here - their level, their bags, their gear and their opinion of you.'));
    }

    var favs = st.favourites || {};
    var favCount = U.keys(favs).length;

    var filter = PN.app.playerFilter || 'all';
    var pool = st.agents;
    if (filter === 'capped') pool = pool.filter(function (a) {
      return a.lv >= PN.sim.live(st).progression.levelCap; });
    else if (filter === 'new') pool = pool.filter(function (a) { return a.t < 6; });
    else if (filter === 'unhappy') pool = pool.filter(function (a) { return a.sat < 50; });
    else if (filter === 'guilded') pool = pool.filter(function (a) { return !!a.gid; });
    else if (filter === 'followed') pool = pool.filter(function (a) { return !!favs[a.id]; });
    else if (tax.ARCHETYPE_BY_ID[filter]) pool = pool.filter(function (a) { return a.a === filter; });

    /* Followed players first, always. This screen shows sixty of
       several thousand, so somebody you asked to keep track of has to
       be at the top of it or the star does nothing. */
    var sorted = pool.slice().sort(function (a, b) {
      return (favs[b.id] ? 1 : 0) - (favs[a.id] ? 1 : 0) ||
             b.lv - a.lv || b.sat - a.sat;
    });
    var shown = sorted.slice(0, 60);

    var filters = '<div class="row wrap" style="gap:4px;margin-bottom:10px">' +
      [['all', 'Everyone'], ['capped', 'At cap'], ['new', 'New'],
       ['unhappy', 'Unhappy'], ['guilded', 'In a guild']].map(function (f) {
        return '<span class="chip click' + (filter === f[0] ? ' on' : '') +
          '" data-act="player.filter" data-val="' + f[0] + '">' + esc(f[1]) + '</span>';
      }).join('') +
      (favCount
        ? '<span class="chip click' + (filter === 'followed' ? ' on' : '') +
          '" data-act="player.filter" data-val="followed">★ Following ' +
          favCount + '</span>'
        : '') +
      tax.ARCHETYPES.map(function (a) {
        return '<span class="chip click' + (filter === a.id ? ' on' : '') +
          '" data-act="player.filter" data-val="' + a.id + '">' + esc(a.name) + '</span>';
      }).join('') + '</div>';

    var d = PN.sim.live(st);
    var rows = shown.map(function (a) {
      var arch = tax.ARCHETYPE_BY_ID[a.a];
      var bl = buildLabel(d, a);
      var gs = PN.agents.gearScore(d, a);
      var g = a.gid ? PN.guilds.byId(st, a.gid) : null;
      return '<tr' + (favs[a.id] ? ' class="fav"' : '') + '>' +
        '<td class="num">' + ui.favStar(a.id, !!favs[a.id]) + '</td>' +
        '<td class="click" data-act="player.open" data-val="' + a.id + '">' +
          esc(a.nm || ('Player #' + a.id)) + '</td>' +
        '<td>' + esc(arch.name) + ' <span class="faint tiny">' + esc(PN.pop.bandOf(a.b).name) + '</span></td>' +
        '<td class="small muted">' + esc(bl.name) +
          (bl.build ? '<div class="tiny faint">' + esc(bl.build) + '</div>' : '') + '</td>' +
        '<td class="num">' + a.lv + '</td>' +
        '<td class="num">' + Math.round(gs) + '</td>' +
        '<td class="num">' + U.keys(a.g).length + '/16</td>' +
        '<td class="num ' + ui.scoreClass(a.sat) + '">' + Math.round(a.sat) + '</td>' +
        '<td class="num">' + a.t + 'w</td>' +
        '<td class="small muted">' + esc(g ? g.name : '-') + '</td>' +
        '<td class="num">' + U.fmtMoney(a.sp || 0) + '</td></tr>';
    }).join('');

    var levelCap = d.progression.levelCap;
    var buckets = [];
    for (var b = 0; b < 10; b++) buckets.push(0);
    st.agents.forEach(function (a) {
      var i = Math.min(9, Math.floor((a.lv / Math.max(1, levelCap)) * 10));
      buckets[i] += a.w;
    });

    var gearBuckets = [0, 0, 0, 0, 0];
    st.agents.forEach(function (a) {
      gearBuckets[Math.min(4, Math.floor(U.keys(a.g).length / 4))] += a.w;
    });

    return '<div class="grid g-2-1"><div>' +
      ui.panel('Every player', filters +
        '<div class="tablewrap"><table class="data"><tr><th></th><th>Name</th><th>Archetype</th><th>Plays</th><th class="num">Lv</th>' +
        '<th class="num">iLvl</th><th class="num">Gear</th><th class="num">Sat</th><th class="num">Tenure</th>' +
        '<th>Guild</th><th class="num">Spent</th></tr>' + rows + '</table></div>' +
        '<div class="tiny faint" style="margin-top:9px;line-height:1.55">' +
        (sorted.length > 60 ? 'Showing 60 of ' + U.fmtInt(sorted.length) + '. ' : '') +
        'Click a name to open their character sheet. Star somebody to follow them: ' +
        'they stay on this list from week to week, and the community feed will tell ' +
        'you if they quit.</div>',
        { actions: '<button class="sm" data-act="player.random">Open a random player</button>',
          hint: U.fmtInt(st.agents.length) + ' simulated' }) +
      '</div><div>' +
      ui.panel('What people are playing', (function () {
        /* The role economy. An MMO needs tanks and healers, and whether it
           has them is an emergent result of your design, not a setting. */
        var counts = PN.builds.roleCounts(st);
        var demand = PN.builds.groupDemand(d);
        var total = U.sum(PN.builds.ROLES, function (r) { return counts[r.id] || 0; });
        var roleRows = PN.builds.ROLES.map(function (r) {
          var have = total > 0 ? (counts[r.id] || 0) / total : 0;
          var want = demand[r.id] || 0;
          var short = want > 0 ? (want - have) / want : 0;
          return '<div class="rowact narrow" title="' + esc(r.desc) + '">' +
            '<span class="faint tiny rowact-k">' + esc(r.name) + '</span>' +
            '<div class="bar" style="grid-column:2"><i style="width:' +
              (have * 100).toFixed(1) + '%;background:' +
              (short > 0.3 ? 'var(--bad)' : short > 0.1 ? 'var(--warn)' : 'var(--good)') +
              '"></i></div>' +
            '<span class="mono tiny" style="text-align:right">' + U.fmtPct(have * 100, 0) + '</span>' +
            '<span class="faint tiny rowact-s">need ' + U.fmtPct(want * 100, 0) + '</span></div>';
        }).join('');

        /* And the stat spread, which is the other half of a build. */
        var byStat = {};
        st.agents.forEach(function (a) { byStat[a.primaryId] = (byStat[a.primaryId] || 0) + a.w; });
        var s = PN.stats.statSetOf(d);
        var statRows = s.primaries.map(function (p) {
          var share = total > 0 ? (byStat[p.id] || 0) / total : 0;
          return '<div class="rowact narrow">' +
            '<span class="faint tiny rowact-k">' + esc(p.name) + '</span>' +
            '<div class="bar" style="grid-column:2"><i style="width:' +
              (share * 100).toFixed(1) + '%;background:var(--accent)"></i></div>' +
            '<span class="mono tiny" style="text-align:right">' +
              U.fmtPct(share * 100, 0) + '</span><span></span></div>';
        }).join('');

        var worst = null;
        PN.builds.ROLES.forEach(function (r) {
          var have = total > 0 ? (counts[r.id] || 0) / total : 0;
          var want = demand[r.id] || 0;
          if (want <= 0) return;
          var short = (want - have) / want;
          if (!worst || short > worst.short) worst = { r: r, short: short, have: have };
        });

        return '<div class="subhead">Roles</div>' + roleRows +
          '<div class="subhead spaced">Stats they gear for</div>' + statRows +
          '<div class="tiny faint" style="margin-top:10px;line-height:1.6">' +
          (worst && worst.short > 0.25
            ? 'Your group content wants ' + U.fmtPct((demand[worst.r.id] || 0) * 100, 0) +
              ' ' + worst.r.name.toLowerCase() + 's and you have ' +
              U.fmtPct(worst.have * 100, 0) + '. That is a queue. Make the ' +
              worst.r.name.toLowerCase() + ' builds better, or build content that needs fewer.'
            : 'The role mix roughly matches what your group content asks for. ' +
              'Players pick builds they like first and the tier list second, so this is ' +
              'something you shape by design rather than set.') +
          '</div>';
      })()) +
      ui.panel('Level spread',
        PN.chart.bars(buckets.map(function (n, i) {
          return { name: Math.round((i / 10) * levelCap) + '-' + Math.round(((i + 1) / 10) * levelCap),
                   value: n, color: '#5fb3ff' };
        }), { labelW: 70, fmt: U.fmtCompact })) +
      ui.panel('Gear coverage',
        PN.chart.bars(gearBuckets.map(function (n, i) {
          return { name: (i * 4) + '-' + (i * 4 + 3) + ' slots', value: n,
                   color: i >= 3 ? '#5fd6a0' : i >= 2 ? '#ffc861' : '#ff7565' };
        }), { labelW: 84, fmt: U.fmtCompact }) +
        '<div class="tiny faint" style="margin-top:9px;line-height:1.5">How many of the sixteen slots your ' +
        'players have actually filled. If most of them are half-naked, your loot tables do not cover ' +
        'enough slots.</div>') +
      '</div></div>';
  }

  /* What this player actually plays: the class or branch, the role they
     chose to play it as, and the stat they gear for. Three players on the
     same class can be three different characters. */
  function buildLabel(d, a) {
    var cls = PN.schema.playableById(d, a.cls);
    var role = PN.builds.ROLE_BY_ID[a.role || 'dps'];
    var s = PN.stats.statSetOf(d);
    var stat = PN.util.byId(s.primaries, a.primaryId);
    var bits = [];
    if (role) bits.push(role.name);
    if (stat) bits.push(stat.name);
    return {
      name: cls ? cls.name : '-',
      build: bits.join(' · '),
      full: (cls ? cls.name : '-') + (bits.length ? ' · ' + bits.join(' · ') : '')
    };
  }

  /* A small uppercase section label - used enough in these sheets to be
     worth a helper rather than the same inline style twenty times. */
  function sub(label, spaced) {
    return '<div class="subhead' + (spaced ? ' spaced' : '') + '">' + PN.chart.esc(label) + '</div>';
  }

  /* One player's character sheet. */
  function playerModal(id) {
    var st = S();
    var agent = null;
    /* The FIRST match, not the last. Ids are unique now, but a lookup
       that silently prefers whichever copy came last is how a star on
       one player opened a different one. */
    for (var i = 0; i < st.agents.length && !agent; i++) {
      if (st.agents[i].id === id) agent = st.agents[i];
    }
    if (!agent) return;
    var d = PN.sim.live(st);
    var info = PN.agents.describe(st, agent);
    var arch = tax.ARCHETYPE_BY_ID[agent.a];
    var cls = PN.schema.playableById(d, agent.cls);

    var gearRows = info.gear.map(function (g) {
      var rarity = g.item ? (ST.RARITY_BY_ID[g.item.rarity] || ST.RARITY_BY_ID.common) : null;
      return '<tr><td class="small muted">' + esc(g.slot.name) + '</td>' +
        '<td' + (rarity ? ' style="color:' + rarity.colour + '"' : ' class="faint"') + '>' +
          esc(g.item ? g.item.name : 'empty') + '</td>' +
        '<td class="num">' + (g.item ? g.item.itemLevel : '-') + '</td></tr>';
    }).join('');

    var bagRows = info.bag.map(function (b) {
      return '<tr><td>' + esc(b.item.name) + '</td>' +
        '<td class="small muted">' + esc(IT.KIND_BY_ID[b.item.kind].name) + '</td>' +
        '<td class="num">' + U.fmtInt(b.qty) + '</td></tr>';
    }).join('') || '<tr><td class="faint" colspan="3">Empty bags.</td></tr>';

    var purseRows = info.purse.map(function (p) {
      return '<tr><td>' + esc(p.item.name) + '</td><td class="num">' + U.fmtInt(p.qty) + '</td></tr>';
    }).join('') || '<tr><td class="faint" colspan="2">Broke.</td></tr>';

    var axisRows = tax.AXIS_IDS.map(function (aid) {
      var s = agent.axisScores && agent.axisScores[aid];
      if (!s) return '';
      return '<tr><td>' + esc(tax.AXIS_BY_ID[aid].name) + '</td>' +
        '<td class="num faint">' + Math.round(s.ideal) + '</td>' +
        '<td class="num">' + Math.round(s.value) + '</td>' +
        '<td class="num ' + ui.scoreClass(s.score) + '">' + Math.round(s.score) + '</td></tr>';
    }).join('');

    /* Where this player's money actually goes. Spend looked random when
       the game only sold a subscription; it is not random, it is a sum of
       the things you are actually selling, so show the sum - and say so
       when a line is not part of your business model at all.         */
    var M = d.monetisation;
    var parts = agent.spendParts || {};
    var sellsSub = M.model === 'sub' || M.model === 'hybrid';
    var sellsBox = M.model === 'boxExp' || M.model === 'hybrid';
    var shopOn = (M.shop || []).filter(function (s) { return s.enabled; }).length;
    var SPEND_ROWS = [
      ['subscription', 'Subscription', sellsSub
        ? U.fmtCents(M.subPrice) + '/month ÷ 4.33 weeks'
        : 'your model does not charge one'],
      ['box', 'Box & expansions', sellsBox
        ? U.fmtCents(M.expansionPrice) + ' spread over two years'
        : 'your model does not sell one'],
      ['shop', 'Cash shop', shopOn
        ? shopOn + ' categor' + (shopOn === 1 ? 'y' : 'ies') + ' on sale'
        : 'nothing on the shelf'],
      ['pass', 'Battle pass', M.battlePass && M.battlePass.enabled
        ? U.fmtCents(M.battlePass.price) + ' per season' : 'not sold']
    ];
    var perWeek = U.sum(SPEND_ROWS, function (r) { return parts[r[0]] || 0; });
    var spendRows = SPEND_ROWS.map(function (r) {
      var v = parts[r[0]] || 0;
      var share = perWeek > 0 ? (v / perWeek) * 100 : 0;
      /* The pricing rule goes under the name rather than in its own
         column - a three-column sheet has no width to spare. */
      return '<tr' + (v > 0 ? '' : ' class="faint"') + '><td>' + esc(r[1]) +
        '<div class="tiny faint">' + esc(r[2]) + '</div></td>' +
        '<td class="num">' + (v > 0 ? U.fmtCents(v) : '&mdash;') + '</td>' +
        '<td class="num tiny faint">' + (v > 0 ? Math.round(share) + '%' : '') + '</td></tr>';
    }).join('');

    var churn = 0;
    try {
      churn = PN.agents.churnChance(st, agent, {
        world: { design: d }, lastChurnRate: 0, rng: new U.Rng(1)
      });
    } catch (e) {}

    var following = !!(st.favourites && st.favourites[agent.id]);
    ui.modal({
      title: (agent.nm || ('Player #' + agent.id)) + ' — ' + arch.name,
      sub: buildLabel(d, agent).full + ' · level ' + agent.lv + ' · ' +
           agent.t + ' weeks played · ' + U.fmtCents(agent.sp || 0) + ' spent to date',
      wide: true,
      footer: '<div class="row" style="width:100%;align-items:center">' +
        '<span class="favstar' + (following ? ' on' : '') + ' big" ' +
          'data-act="player.fav" data-val="' + agent.id + '">' +
          (following ? '★' : '☆') + '</span>' +
        '<span class="tiny faint">' + (following
          ? 'Following. They will stay on your Players list, and the feed will say if they quit.'
          : 'Follow this player to keep them on your Players list week to week.') + '</span>' +
        '<span class="spacer"></span>' +
        '<button data-act="modal.close">Close</button></div>',
      /* A character sheet is reference material - three columns so the
         whole player fits on one screen instead of scrolling past the
         gear list to find out whether they are about to quit.        */
      body: '<div class="sheet">' +
        '<div class="sheetcol">' +
        sub('Right now') +
        '<div class="grid g2" style="margin-bottom:12px">' +
        ui.stat('Level', agent.lv + '/' + d.progression.levelCap) +
        ui.stat('Item level', Math.round(info.gearScore)) +
        ui.stat('Satisfaction', Math.round(agent.sat), null, ui.scoreClass(agent.sat)) +
        ui.stat('Novelty', Math.round(agent.nov), null, ui.scoreClass(agent.nov)) +
        ui.stat('Hours last week', U.round(agent.hrs || 0, 1)) +
        ui.stat('Leaves this week', U.fmtPct(churn * 100, 1), null, churn > 0.08 ? 'bad' : '') +
        '</div>' +
        /* What this player still has left to do, which is the reason
           they log in again rather than the reason they enjoyed it.
           Only goals they can actually reach are on the list. */
        sub('Still chasing') +
        (function () {
          var cat = PN.goals.catalogue(d);
          var prog = PN.goals.progressOf(d, agent, cat);
          var rows = PN.goals.GOALS.map(function (g) {
            var present = g.id === 'levelCap' ? cat.levelCap > 1
                        : g.id === 'bis' ? cat.bis > 0 : (cat[g.id] || 0) > 0;
            if (!present) return '';
            var want = g.want[agent.a];
            if (want === undefined) want = 0.4;
            if (want < 0.3) return '';
            var done = U.clamp01(prog[g.id] || 0) * 100;
            return '<div class="goalrow"><span>' + esc(g.name) + '</span>' +
              '<div class="bar"><i style="width:' + done.toFixed(0) + '%"></i></div>' +
              '<em class="mono">' + done.toFixed(0) + '%</em></div>';
          }).join('');
          var left = Math.round((agent.chase === undefined ? 1 : agent.chase) * 100);
          return '<div style="margin-bottom:12px">' + rows +
            '<div class="tiny faint" style="margin-top:5px">' + left +
            '% of what they care about is still ahead of them.</div></div>';
        })() +
        sub('Record') +
        '<div class="minibar" style="margin-bottom:12px">' +
        '<span><i>Quests</i>' + U.fmtInt(agent.qd) + '</span>' +
        '<span><i>Boss kills</i>' + U.fmtInt(agent.bk) + '</span>' +
        '<span><i>Dungeons</i>' + U.fmtInt(agent.dr) + '</span>' +
        '</div>' +
        sub('Guild') +
        (info.guild
          ? '<div class="item" data-act="guild.open" data-val="' + info.guild.id + '">' +
            '<div style="min-width:0"><div class="t">' + esc(info.guild.name) + '</div>' +
            '<div class="s">' + esc(PN.guilds.FOCUS_BY_ID[info.guild.focus].name) + ' &middot; ' +
            Math.round(info.guild.size) + ' members &middot; cohesion ' +
            U.fmtPct(info.guild.cohesion * 100, 0) + '</div></div></div>'
          : '<div class="tiny faint">Not in a guild. That makes them far more likely to leave.</div>') +
        '</div>' +

        '<div class="sheetcol">' +
        sub('Equipped') +
        '<table class="data">' + gearRows + '</table>' +
        sub('Currency', true) +
        '<table class="data">' + purseRows + '</table>' +
        sub('Bags', true) +
        /* What they are carrying, out of what they can. A slot is a
           stack rather than an item, and the room comes from the bags
           they own - so a player with none leaves things on the floor. */
        (function () {
          var cap = PN.agents.slotsOf(d, agent);
          var used = U.keys(agent.inv || {}).length;
          var owned = U.keys(agent.bags || {}).map(function (id) {
            var b = IT.itemById(d, id);
            return b ? (agent.bags[id] > 1 ? agent.bags[id] + '× ' : '') + b.name : null;
          }).filter(Boolean);
          return '<div class="tiny" style="margin-bottom:6px;line-height:1.55">' +
            '<span class="mono ' + (cap > 0 && used >= cap ? 'warn' : 'faint') + '">' +
            used + ' / ' + cap + ' slots</span>' +
            (owned.length ? ' <span class="faint">· ' + esc(owned.join(', ')) + '</span>'
             : cap > 0 ? ' <span class="faint">· starting backpack</span>'
             : ' <span class="bad">· no bags, so nothing can be kept</span>') +
            '</div>';
        })() +
        '<table class="data">' + bagRows + '</table>' +
        '</div>' +

        '<div class="sheetcol">' +
        sub('Where their money goes') +
        '<table class="data"><tr><th>Source</th><th class="num">Per week</th>' +
        '<th class="num">Share</th></tr>' + spendRows +
        '<tr><td><b>Total</b></td><td class="num"><b>' + U.fmtCents(perWeek) +
        '</b></td><td></td></tr></table>' +
        '<div class="tiny faint" style="margin-top:8px;line-height:1.55">None of this is a random ' +
        'number. A subscriber pays the monthly price spread across the weeks; shop and pass lines ' +
        'only appear if you are selling them, and scale with how much this particular player wants ' +
        'what is on the shelf.</div>' +
        sub('What they think of your game', true) +
        '<table class="data"><tr><th>Axis</th><th class="num">Wants</th><th class="num">Gets</th>' +
        '<th class="num">Score</th></tr>' + axisRows + '</table>' +
        '</div></div>'
    });
  }
  /* ============================================================= GUILDS */

  function guildModal(gid) {
    var st = S();
    var g = PN.guilds.byId(st, gid);
    if (!g) return;
    var members = st.agents.filter(function (a) { return a.gid === gid; })
      .sort(function (a, b) { return b.lv - a.lv; }).slice(0, 30);
    var d = PN.sim.live(st);

    var rows = members.map(function (a) {
      var cls = PN.schema.playableById(d, a.cls);
      return '<tr class="click" data-act="player.open" data-val="' + a.id + '">' +
        '<td>' + esc(a.nm || ('#' + a.id)) + '</td>' +
        '<td>' + esc(tax.ARCHETYPE_BY_ID[a.a].name) + '</td>' +
        '<td class="small muted">' + esc(cls ? cls.name : '-') + '</td>' +
        '<td class="num">' + a.lv + '</td>' +
        '<td class="num ' + ui.scoreClass(a.sat) + '">' + Math.round(a.sat) + '</td></tr>';
    }).join('');

    var focus = PN.guilds.FOCUS_BY_ID[g.focus];
    ui.modal({
      title: g.name,
      sub: focus.name + ' guild, founded week ' + g.founded,
      body: '<div class="grid g4" style="margin-bottom:12px">' +
        ui.stat('Members', Math.round(g.size), 'peak ' + Math.round(g.peak)) +
        ui.stat('Cohesion', U.fmtPct(g.cohesion * 100, 0), null,
          g.cohesion > 0.55 ? 'good' : g.cohesion > 0.3 ? 'warn' : 'bad') +
        ui.stat('Progress', Math.round(g.progress)) +
        ui.stat('Age', (st.week - g.founded) + 'w') +
        '</div>' +
        '<div class="small muted" style="line-height:1.6;margin-bottom:12px">Cohesion is what keeps these ' +
        'people logging in for each other rather than for the game. When it collapses, they leave together - ' +
        'and the people around them follow.</div>' +
        '<table class="data"><tr><th>Name</th><th>Archetype</th><th>Plays</th><th class="num">Lv</th>' +
        '<th class="num">Sat</th></tr>' + rows + '</table>'
    });
  }

  /* ============================================================ ECONOMY */

  /* The economy screen is where you SET the economy as well as watch it.

     The dials used to live in a design section nobody opened, and the
     copies that were here read off the SHIPPED design while editing the
     draft - so every one of them snapped straight back to where it was
     and the whole panel looked welded shut. They read the draft now,
     which is the thing they edit. */
  /* ---------------------------------------------------- currencies ----

     Every currency you authored, what its job is, and what drains it.
     The economy only ever tracked the first one; everything else was a
     number in a bag that happened to work as a vendor token because of
     the order it was added in. */
  function currencyPanel() {
    var st = S(), d = D();
    var list = PN.currency.currencies(d);
    var faucets = PN.currency.faucetOf(d);
    var issues = PN.currency.issues(d);
    /* Counted now rather than read off the last tick, so a save that
       has just been opened shows what people are holding. */
    var held = {};
    (st.agents || []).forEach(function (a) {
      U.keys(a.cur || {}).forEach(function (cid) {
        held[cid] = (held[cid] || 0) + a.cur[cid] * (a.w || 1); });
    });

    if (!list.length) {
      return ui.panel('Currencies', ui.empty('No currencies.',
        'Add an item of kind "currency" under Items & Rewards. One of them has to be money.'));
    }

    var rows = list.map(function (c) {
      var role = PN.currency.ROLE_BY_ID[c.role] || PN.currency.ROLE_BY_ID.token;
      var drain = PN.currency.drainOf(d, c.id);
      var supply = held[c.id] || 0;
      var sinkNames = drain.sinks.map(function (s) {
        var def = PN.currency.SINK_BY_ID[s.kind];
        return (def ? def.name : s.kind) + ' ' + Math.round(s.rate || 0);
      }).join(', ');
      return '<div style="background:var(--panel-2);border:1px solid var(--line-soft);' +
        'border-radius:8px;padding:10px 12px;margin-bottom:7px">' +
        '<div class="row"><b>' + esc(c.name) + '</b>' +
        '<span class="chip' + (c.role === 'money' ? ' good' : '') + '">' + esc(role.name) + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="tiny faint">' + (supply ? U.fmtCompact(supply) + ' held' : 'none held') +
        '</span></div>' +
        '<div class="tiny faint" style="margin-top:5px;line-height:1.5">' + esc(role.desc) + '</div>' +
        '<div class="row" style="margin-top:7px;gap:10px">' +
        '<span class="tiny">' + (faucets[c.id] > 0
            ? 'earned from ' + U.round(faucets[c.id], 1) + ' points of rewards'
            : '<span class="warn">nothing hands it out</span>') + '</span>' +
        '</div>' +
        '<div class="tiny faint" style="margin-top:4px">' +
        (sinkNames ? 'drained by: ' + esc(sinkNames)
                   : '<span class="warn">nothing drains it</span>') + '</div>' +
        ui.select({ path: 'cur:' + c.id, label: 'Job', value: c.role,
            options: PN.currency.ROLES }) +
        '</div>';
    }).join('');

    return ui.panel('Currencies', rows
      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin-top:4px">' + issues.map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : ''),
      { hint: list.length + (list.length === 1 ? ' currency' : ' currencies') });
  }

  /* The sinks you wrote: the specific things that take currency back out
     of the game. This is the half of an economy that was missing - you
     had a faucet rate and a sink rate and no way to say what the sinks
     actually WERE. */
  function sinkPanel() {
    var d = D();
    var list = PN.currency.sinks(d);
    var curOpts = PN.currency.currencies(d).map(function (c) {
      return { id: c.id, name: c.name }; });
    if (!curOpts.length) return '';

    var rows = list.map(function (s, i) {
      var def = PN.currency.SINK_BY_ID[s.kind] || PN.currency.SINK_KINDS[0];
      var cur = PN.currency.byId(d, s.currencyId);
      return '<div style="background:var(--panel-2);border:1px solid ' +
        (s.enabled === false ? 'var(--line-soft)' : 'var(--accent-dim)') +
        ';border-radius:8px;padding:10px 12px;margin-bottom:7px">' +
        '<div class="row">' +
        '<div class="toggle' + (s.enabled === false ? '' : ' on') +
          '" data-act="sink.toggle" data-val="' + s.id + '">' +
          '<span class="box"></span><span class="lbl">' + esc(def.name) + '</span></div>' +
        '<span class="spacer"></span>' +
        '<span class="tiny faint">' + esc(cur ? cur.name : 'no currency') + '</span>' +
        '<button class="xs ghost" data-act="sink.remove" data-val="' + s.id + '">remove</button>' +
        '</div>' +
        '<div class="tiny faint" style="margin-top:5px;line-height:1.5">' +
          esc(def.desc) + ' ' + esc(def.hint) + '</div>' +
        (s.enabled === false ? '' :
          ui.rangeAct({ label: 'How hard', act: 'sink.rate', val: s.id,
                        value: s.rate, min: 0, max: 100, cls: 'narrow' }) +
          ui.select({ path: 'sinkcur:' + s.id, label: 'Takes', value: s.currencyId || '',
                      options: curOpts })) +
        '</div>';
    }).join('') || ui.empty('No sinks at all.',
      'Everything players earn stays in the game for ever. That is what runaway inflation is.');

    var addOpts = PN.currency.SINK_KINDS.map(function (k) {
      return '<option value="' + k.id + '">' + esc(k.name) + '</option>'; }).join('');

    return ui.panel('Where the money goes', rows
      + '<div class="row" style="margin-top:10px;gap:6px">'
      + '<select id="newsink" style="flex:1">' + addOpts + '</select>'
      + '<button class="sm primary" data-act="sink.add">Add sink</button></div>',
      { hint: list.filter(function (s) { return s.enabled !== false; }).length + ' running' });
  }

  /* The shelf, and why each thing on it costs what it costs.

     Every valuation in the game used to read the vendor price you
     typed, so a reagent you never got round to pricing was worth
     nothing to anybody for ever. What a player will pay is supply
     against demand: how much of it arrives in the world each week,
     against how badly anybody wants one. */
  /* What the market looks like to PLAYERS, which is the shipped design
     rather than the one being edited.

     Repricing an item moved this panel the instant you typed, which is
     not what happens: nobody in your game has the new item until you
     release it. The draft's market is a preview, so it is shown as
     one - what is live, and what changes when you ship. */
  function marketDiff(shipped, draft) {
    if (shipped === draft) return null;
    var a = {}, changed = 0, added = 0;
    PN.market.listing(shipped).forEach(function (r) { a[r.item.id] = r.price; });
    PN.market.listing(draft).forEach(function (r) {
      if (a[r.item.id] === undefined) { added++; return; }
      if (Math.abs(a[r.item.id] - r.price) > 0.05) changed++;
    });
    if (!changed && !added) return null;
    return { changed: changed, added: added };
  }

  function marketPanel() {
    var st = S();
    /* Live games read what players are actually trading in. */
    var d = st.phase === 'live' ? (PN.sim.live(st) || D()) : D();
    var pending = st.phase === 'live' ? marketDiff(d, D()) : null;
    var rows = PN.market.listing(d, 26);
    if (!rows.length) {
      return ui.panel('The market', ui.empty('Nothing can change hands.',
        'Turn on trading, or stop binding everything on pickup, and a market forms here.'));
    }
    var issues = PN.market.issues(d);
    var body = rows.map(function (r) {
      var rar = PN.stats.RARITY_BY_ID[r.item.rarity] || PN.stats.RARITY_BY_ID.common;
      var kind = IT.KIND_BY_ID[r.item.kind];
      return '<tr class="click" data-act="item.select" data-val="' + r.item.id + '">' +
        '<td style="color:' + rar.colour + '">' + esc(r.item.name) + '</td>' +
        '<td class="small muted">' + esc(kind ? kind.name : r.item.kind) + '</td>' +
        '<td class="num mono">' + U.fmtCompact(Math.round(r.price)) + '</td>' +
        '<td class="num">' +
          (r.vendorLocked
            ? '<span class="chip">vendor</span>'
            : '<span class="' + (r.scarcity > 0.6 ? 'good' : r.scarcity > 0.25 ? 'warn' : 'faint') +
              '">' + Math.round(r.scarcity * 100) + '%</span>') + '</td>' +
        '<td class="num faint">' + Math.round(r.demand) + '</td></tr>';
    }).join('');

    return ui.panel('The market', ''
      + '<div class="tablewrap"><table class="data">'
      + '<tr><th>Item</th><th>Kind</th><th class="num">Worth</th>'
      + '<th class="num">Scarcity</th><th class="num">Demand</th></tr>'
      + body + '</table></div>'
      + '<div class="tiny faint" style="margin-top:9px;line-height:1.6">'
      + 'What players pay each other. <b style="color:var(--text)">Scarcity</b> is how little '
      + 'of it arrives each week against everything else - gathering density, every loot table '
      + 'it sits in and how often those get rolled, every reward that hands one over, and '
      + 'whether players can just make more. <b style="color:var(--text)">Demand</b> is how '
      + 'badly it is wanted: reagents by the recipes that eat them, gear by how close to '
      + 'best-in-slot it is, cosmetics and mounts by the part of your playerbase that '
      + 'collects. An item a vendor sells is locked to its shelf price - unlimited stock '
      + 'is a ceiling and a floor at once.</div>'
      + (pending
          ? '<div class="chip warn" style="margin-top:10px;display:block;line-height:1.55">'
            + 'This is the market your players are trading in. Your draft reprices '
            + pending.changed + ' item' + (pending.changed === 1 ? '' : 's')
            + (pending.added ? ' and adds ' + pending.added : '')
            + ' - none of it reaches them until the next release.</div>'
          : '')
      + (issues.length
          ? '<div class="chip warn" style="margin-top:10px;display:block;line-height:1.55">'
            + esc(issues.join(' · ')) + '</div>'
          : ''),
      { hint: PN.market.listing(d).length + ' tradeable' +
              (pending ? ' · live' : '') });
  }

  /* Every currency in the game, and how much of it is in purses.

     A currency's TOTAL is the thing you can act on: it going up every
     week is inflation arriving, it going down is a sink biting. The
     weekly faucet and sink are the derivative of this line, and
     plotting a derivative made a readable trend into noise. */
  var CUR_COLOURS = ['#ffc861', '#5fb3ff', '#5fd6a0', '#c98cff', '#ff9f6b', '#79e0d8'];

  function currencySupplyPanel(hist) {
    var st = S(), d = PN.sim.live(st) || st.design;
    var list = PN.currency.currencies(d);
    if (!list.length || !hist.length) {
      return ui.panel('Currency in circulation',
        ui.empty('No currency yet.', 'Create one in Items and the total will be tracked here.'));
    }
    /* Older saves recorded only the money supply, so anything before
       this was written reads back as the one line it kept. */
    var series = list.map(function (c, i) {
      return { name: c.name, color: CUR_COLOURS[i % CUR_COLOURS.length],
        data: hist.map(function (h) {
          if (h.held && h.held[c.id] !== undefined) return h.held[c.id];
          return i === 0 ? (h.supply || 0) : 0;
        }) };
    }).filter(function (s) {
      return U.sum(s.data, function (v) { return v; }) > 0; });
    if (!series.length) {
      return ui.panel('Currency in circulation',
        ui.empty('Nobody is holding anything yet.'));
    }

    /* Which way it is going, over the last quarter. */
    var money = PN.currency.moneyOf(d);
    var mine = series[0].data;
    var back = Math.max(0, mine.length - 13);
    var then = mine[back] || 0, now = mine[mine.length - 1] || 0;
    var pct = then > 0 ? ((now - then) / then) * 100 : 0;
    var verdict = pct > 18 ? ['bad', 'piling up fast']
                : pct > 4 ? ['warn', 'growing']
                : pct > -4 ? ['good', 'holding steady']
                : ['warn', 'draining away'];

    return ui.panel('Currency in circulation',
      PN.chart.line(series, { height: 160, fill: false, fmt: U.fmtCompact }) +
      '<div class="grid g3" style="margin-top:10px">' +
      ui.stat('In circulation', U.fmtCompact(now), money ? money.name : '') +
      ui.stat('Over a quarter', U.fmtSigned(pct, 1) + '%', null, verdict[0]) +
      ui.stat('Per player', U.fmtCompact(st.population.total > 0
        ? now / st.population.total : 0)) +
      '</div>' +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.55">Every coin in the game is ' +
      'in somebody’s purse, and this is the sum of them - ' + esc(verdict[1]) + '. ' +
      'A line climbing every week is your faucets outrunning your sinks, which is where ' +
      'inflation comes from; a line falling is a sink biting harder than the game pays.</div>');
  }

  function economyTab() {
    var st = S();
    var dials = currencyPanel() + sinkPanel() +
                PN.viewsDesign.economyPanel() + PN.viewsDesign.businessPanels();

    /* Before launch there are no curves to draw, but the rules are still
       yours to write - and writing them is most of what pre-launch is. */
    if (st.phase !== 'live') {
      return '<div class="grid g-2-1"><div>' +
        ui.panel('Economy', ui.empty('The curves start when the game does.',
          'Faucets, sinks and inflation are measured off live players. Write the rules ' +
          'here now, and watch them argue with you here later.')) +
        /* The market does not need live players - it is a reading of
           the design, so it is worth seeing before launch. */
        marketPanel() +
        '</div><div>' + dials + '</div></div>';
    }

    var rep = PN.economy.report(st);
    var live = PN.sim.live(st);
    var hist = rep.history.slice(-140);

    var verdictClass = rep.verdict === 'Stable' ? 'good'
      : rep.verdict === 'Runaway' ? 'bad' : 'warn';

    var gold = null;
    (live.items || []).forEach(function (i) { if (!gold && i.kind === 'currency') gold = i; });
    var goldId = gold ? gold.id : '';
    var richest = st.agents.slice().sort(function (a, b) {
      return ((b.cur[goldId] || 0)) - ((a.cur[goldId] || 0));
    }).slice(0, 8);

    var wealth = st.agents.map(function (a) { return (a.cur[goldId] || 0) * a.w; });
    var giniVal = U.gini(wealth);

    return '<div class="grid g-2-1"><div>' +
      '<div class="grid g4" style="margin-bottom:14px">' +
      ui.stat('Inflation', U.round(rep.inflation, 2) + '×', 'year on year', verdictClass) +
      ui.stat('Currency supply', U.fmtCompact(rep.supply)) +
      ui.stat('Per player', U.fmtCompact(rep.perCapita)) +
      ui.stat('Verdict', rep.verdict, null, verdictClass) +
      '</div>' +
      marketPanel() +
      /* How much of each currency exists, week by week.

         This panel used to plot the weekly faucet against the weekly
         sink, and both are differences - noisy, unreadable, and they
         answer a question nobody asked. What an economy screen is for
         is "is there more gold in the game than there was", and that
         is a total, not a rate. The slope of these lines is the
         faucet-against-sink story, drawn properly. */
      currencySupplyPanel(hist) +
      ui.panel('Inflation', PN.chart.line([
        { name: 'Inflation', data: hist.map(function (h) { return h.inflation; }), color: '#ffc861' }
      ], { height: 130, min: 0 })) +
      ui.panel('Health',
        '<div class="grid g4">' +
        ui.stat('Wealth inequality', U.round(giniVal, 2), 'gini', giniVal > 0.7 ? 'bad' : '') +
        ui.stat('Bot pressure', Math.round(st.runtime.botPressure), null,
          st.runtime.botPressure > 45 ? 'bad' : '') +
        ui.stat('Net flow', U.fmtCompact(rep.netFlow) + '/wk', null,
          rep.netFlow > rep.sink * 0.5 ? 'warn' : 'good') +
        ui.stat('Price index', U.round(rep.priceIndex, 2) + '×') +
        '</div>') +
      ui.panel('Wealthiest players',
        '<table class="data"><tr><th>Name</th><th>Archetype</th><th class="num">Level</th>' +
        '<th class="num">' + esc(gold ? gold.name : 'Currency') + '</th></tr>' +
        richest.map(function (a) {
          return '<tr class="click" data-act="player.open" data-val="' + a.id + '">' +
            '<td>' + esc(a.nm || ('#' + a.id)) + '</td>' +
            '<td>' + esc(tax.ARCHETYPE_BY_ID[a.a].name) + '</td>' +
            '<td class="num">' + a.lv + '</td>' +
            '<td class="num">' + U.fmtInt(a.cur[goldId] || 0) + '</td></tr>';
        }).join('') + '</table>') +
      '</div><div>' + dials + '</div></div>';
  }


  /* ======================================================== COMPETITORS */

  function competitorsPanel() {
    var st = S();
    var rows = PN.competitors.report(st);
    if (!rows.length) return '';
    var live = rows.filter(function (r) { return r.c.status === 'live'; });
    var soon = rows.filter(function (r) { return r.c.status === 'development'; });
    var dead = rows.filter(function (r) { return r.c.status === 'dead'; });

    function row(r) {
      var c = r.c;
      return '<tr><td>' + esc(c.name) + '<div class="tiny faint">' + esc(c.studio) + '</div></td>' +
        '<td class="small muted">' + esc(r.angle.name) + '</td>' +
        '<td class="num">' + Math.round(c.quality) + '</td>' +
        '<td class="num">' + (c.status === 'live' ? U.fmtCompact(c.players) : '-') + '</td>' +
        '<td class="num ' + (r.vsYou > 1.2 ? 'bad' : r.vsYou > 0.6 ? 'warn' : 'good') + '">' +
          (c.status === 'live' ? U.round(r.vsYou, 2) + '×' : '-') + '</td>' +
        '<td class="small muted">' + (c.status === 'live'
          ? (c.momentum > 0.01 ? 'growing' : c.momentum < -0.01 ? 'declining' : 'flat')
          : c.status === 'development' ? 'in development' : 'shut down') + '</td></tr>';
    }

    return ui.panel('Rival studios',
      '<table class="data"><tr><th>Game</th><th>Angle</th><th class="num">Quality</th>' +
      '<th class="num">Players</th><th class="num">vs you</th><th>Status</th></tr>' +
      live.map(row).join('') + soon.map(row).join('') + dead.map(row).join('') + '</table>' +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Market pressure ' +
      U.fmtPct((st.runtime.marketPressure || 0) * 100, 0) + '. A rival aimed at the same archetypes as you ' +
      'takes your players directly; one aimed elsewhere barely registers.</div>',
      { hint: live.length + ' live' });
  }

  /* =========================================================== SCENARIO */

  function scenarioPanel() {
    var st = S();
    if (!st.scenario || st.scenario.free) return '';
    var sc = PN.scenarios.evaluate(st);
    if (!sc) return '';

    var rows = sc.results.map(function (r) {
      return '<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
        '<span class="chip ' + (r.met ? 'good' : 'warn') + '">' + (r.met ? 'done' : 'open') + '</span>' +
        '<div style="flex:1;min-width:0"><div class="small">' + esc(r.obj.label) + '</div>' +
        '<div class="tiny faint">' + esc(r.obj.detail) + '</div></div></div>';
    }).join('');

    var head = sc.outcome === 'won'
      ? '<div class="chip good" style="margin-bottom:10px">Scenario complete</div>'
      : sc.outcome === 'failed'
        ? '<div class="chip bad" style="margin-bottom:10px">Scenario failed</div>'
        : sc.outcome === 'timeout'
          ? '<div class="chip warn" style="margin-bottom:10px">Time is up</div>'
          : sc.weeksLeft !== null
            ? '<div class="row small" style="margin-bottom:10px"><span class="muted">Weeks remaining</span>' +
              '<span class="spacer"></span><span class="mono ' +
              (sc.weeksLeft < 20 ? 'warn' : '') + '">' + sc.weeksLeft + '</span></div>'
            : '';

    return ui.panel(sc.scenario.name, head + rows +
      (sc.scenario.constraint
        ? '<div class="tiny faint" style="margin-top:10px;line-height:1.5">' +
          esc(sc.scenario.constraint) + '</div>' : ''));
  }

  PN.viewsSim = {
    playersTab: playersTab, economyTab: economyTab,
    playerModal: playerModal, guildModal: guildModal,
    competitorsPanel: competitorsPanel,
    scenarioPanel: scenarioPanel
  };
})(PN);
