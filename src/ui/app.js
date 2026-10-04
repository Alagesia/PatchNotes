/* Patch Notes - application shell.
   Routing, state binding, the game loop, saves.                          */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc;

  PN.game = { state: null, _axes: null, _axesKey: '' };
  PN.app = {
    view: 'dashboard', designTab: 'identity', sel: {},
    autoplay: false, speedId: 0, day: 0, dayOfWeek: 0, timer: null
  };
  /* Anything derived from the whole design is cached against a revision
     counter, so every edit has to bump it or the cache keeps answering
     for the design as it was. One place, called by every write path. */
  function invalidate() {
    PN.game._axesKey = '';
    if (PN.game.state) U.bumpDesign(PN.game.state.design);
  }

  var SAVE_KEY = 'patchnotes.save.v1';

  /* Cached axis computation - the views ask for it several times a frame. */
  var realCurrentAxes = PN.sim.currentAxes;
  PN.sim.currentAxes = function (st) {
    var key = st.week + ':' + st.dirty;
    if (PN.game._axesKey === key && PN.game._axes) return PN.game._axes;
    PN.game._axes = realCurrentAxes(st);
    PN.game._axesKey = key;
    return PN.game._axes;
  };

  /* ================================================================ NAV

     Two modes, not one long list.

     Running a studio and designing a game are different jobs done at
     different times, and the rail had grown to fourteen entries across
     four collapsing groups because it was trying to hold both at once.
     So the top bar picks the mode - STUDIO or DESIGN - and the rail
     shows only that mode's screens, grouped.

     Design mode does not exist until there is a game to design.      */

  var MODES = [
    { id: 'studio', name: 'Studio', ico: '⬚',
      blurb: 'The team, the money, the games you are running.' },
    { id: 'design', name: 'Design', ico: '✎', needsTitle: true,
      blurb: 'What the game actually is, system by system.' }
  ];

  var NAV = [
    { id: 'run', mode: 'studio', group: 'Running the studio', items: [
      { id: 'studio', name: 'Studio', ico: '⬚' },
      { id: 'portfolio', name: 'Games', ico: '▤' },
      { id: 'research', name: 'Research', ico: '⚗' },
      { id: 'market', name: 'Market', ico: '◈' }
    ]},
    { id: 'live', mode: 'studio', group: 'Your live game', needsTitle: true, items: [
      { id: 'dashboard', name: 'Dashboard', ico: '◧', needsTitle: true },
      { id: 'livewatch', name: 'The World', ico: '◎', needsTitle: true },
      { id: 'roadmap', name: 'Patches', ico: '✎', needsTitle: true },
      { id: 'telemetry', name: 'Telemetry', ico: '◠', needsTitle: true },
      { id: 'players', name: 'Players', ico: '☰', needsTitle: true },
      { id: 'ladder', name: 'Leaderboard', ico: '♛', needsTitle: true },
      { id: 'economy', name: 'Economy', ico: '◉', needsTitle: true },
      { id: 'community', name: 'Community', ico: '◍', needsTitle: true }
    ]},
    /* The design sections, grouped by what you are actually doing:
       deciding what the game is, filling it with content, or running it
       as a business. */
    { id: 'core', mode: 'design', group: 'Foundations', design: true, needsTitle: true, items: [
      { id: 'identity',   name: 'Identity', ico: '◆' },
      { id: 'progression', name: 'Progression', ico: '↗' },
      { id: 'combat',     name: 'Combat & Stats', ico: '✶' },
      { id: 'abilities',  name: 'Abilities', ico: '✦' },
      { id: 'classes',    name: 'Classes', ico: '⚔' },
      { id: 'races',      name: 'Races', ico: '☘' }
    ]},
    { id: 'content', mode: 'design', group: 'Content', design: true, needsTitle: true, items: [
      { id: 'items',      name: 'Items & Rewards', ico: '⬗' },
      { id: 'world',      name: 'World & Quests', ico: '⬢' },
      { id: 'encounters', name: 'PvE', ico: '☗' },
      { id: 'pvp',        name: 'PvP', ico: '⚑' },
      { id: 'events',     name: 'Live Events', ico: '&#9728;' }
    ]},
    { id: 'sys', mode: 'design', group: 'Systems', design: true, needsTitle: true, items: [
      { id: 'systems',    name: 'Systems', ico: '⚙' }
    ]}
  ];

  /* Nothing on the design side means anything until a game is greenlit,
     so the interface simply does not show it. */
  function hasTitle() {
    return !!(PN.game.state && PN.titles.hasTitle(PN.game.state));
  }

  /* Which mode a screen belongs to. */
  var MODE_OF = {};
  NAV.forEach(function (g) {
    g.items.forEach(function (it) { MODE_OF[it.id] = g.mode; });
  });

  function currentMode() {
    var m = PN.app.mode;
    if (m === 'design' && !hasTitle()) m = 'studio';
    return m || 'studio';
  }

  function navGroups(mode) {
    var has = hasTitle();
    mode = mode || currentMode();
    return NAV.filter(function (g) {
      return g.mode === mode && (has || !g.needsTitle);
    }).map(function (g) {
        var items = g.items.filter(function (it) { return has || !it.needsTitle; });
        return { id: g.id, group: g.group, design: g.design, mode: g.mode, items: items };
      })
      .filter(function (g) { return g.items.length; });
  }

  /* Every screen, whatever mode it is in - for quick find, which should
     reach anything without you switching modes first. */
  function allNavGroups() {
    var has = hasTitle();
    return NAV.filter(function (g) { return has || !g.needsTitle; })
      .map(function (g) {
        var items = g.items.filter(function (it) { return has || !it.needsTitle; });
        return { id: g.id, group: g.group, design: g.design, mode: g.mode, items: items };
      })
      .filter(function (g) { return g.items.length; });
  }

  var GROUP_OF = {};
  NAV.forEach(function (g) {
    g.items.forEach(function (it) { if (g.design) GROUP_OF[it.id] = g.id; });
  });

  /* Jumping to a design section means switching the view AND the tab. */
  /* Jumping to a thing has to land on the tab that thing lives on, or
     quick find drops you on a screen that is not showing what you asked
     for. One map, kept next to goTo so it stays honest. */
  var SUBTAB_OF_SEL = {
    itemId:   ['itemTab', 'items'],   lootId:      ['itemTab', 'loot'],
    rewardId: ['itemTab', 'rewards'], recipeId:    ['itemTab', 'crafting'],
    zoneId:   ['worldTab', 'zones'],  monsterId:   ['worldTab', 'monsters'],
    giverId:  ['worldTab', 'givers'], questId:     ['worldTab', 'quests'],
    questlineId: ['worldTab', 'quests'], chainId: ['worldTab', 'chains']
  };

  function goTo(sectionId, opts) {
    opts = opts || {};
    /* Jumping anywhere puts you in the mode that screen lives in, so
       quick find can reach a design section from the studio and the rail
       follows you rather than the other way round. */
    if (GROUP_OF[sectionId]) {
      PN.app.mode = 'design';
      PN.app.view = 'design';
      PN.app.designTab = sectionId;
      PN.app.navOpen = GROUP_OF[sectionId];
    } else {
      PN.app.mode = MODE_OF[sectionId] || 'studio';
      PN.app.view = sectionId;
      PN.app.navOpen = (function () {
        var groups = navGroups(PN.app.mode);
        for (var i = 0; i < groups.length; i++) {
          for (var j = 0; j < groups[i].items.length; j++) {
            if (groups[i].items[j].id === sectionId) return groups[i].id;
          }
        }
        return groups.length ? groups[0].id : 'run';
      })();
    }
    U.keys(opts.sel || {}).forEach(function (k) {
      PN.app.sel[k] = opts.sel[k];
      var t = SUBTAB_OF_SEL[k];
      if (t) PN.app[t[0]] = t[1];
    });
    render();
  }
  PN.app.goTo = goTo;

  /* Switching mode from the top bar lands you on the first screen of
     that mode, or on the one you were last looking at in it. */
  function setMode(id) {
    if (id === 'design' && !hasTitle()) return;
    PN.app.mode = id;
    PN.app.lastView = PN.app.lastView || {};
    var back = PN.app.lastView[id];
    var groups = navGroups(id);
    if (!groups.length) { render(); return; }
    var valid = false;
    groups.forEach(function (g) {
      g.items.forEach(function (it) { if (it.id === back) valid = true; });
    });
    goTo(valid ? back : groups[0].items[0].id);
  }

  function navLabel(it) {
    /* The character-system fork renames its own section. */
    if (it.id === 'classes' && PN.talents.isTalentMode(PN.game.state.design)) return 'Talents';
    return it.name;
  }

  function currentSection() {
    return PN.app.view === 'design' ? (PN.app.designTab || 'identity') : PN.app.view;
  }

  function renderRail() {
    var st = PN.game.state;
    var cur = currentSection();
    var mode = currentMode();
    /* Remember where you were in each mode so switching back returns
       you to it rather than to the top of the list. */
    PN.app.lastView = PN.app.lastView || {};
    PN.app.lastView[mode] = cur;
    var groups = navGroups(mode);
    var stillThere = groups.some(function (g) {
      return g.id === PN.app.navOpen; });
    if (!stillThere) PN.app.navOpen = groups.length ? groups[0].id : null;

    /* No game, no integrity list - there is nothing authored to be wrong. */
    var probs = st.design ? PN.metrics.integrity(st.design)
                          : { issues: [], bad: 0, warn: 0 };

    var html = '<div class="brand"><h1>Patch Notes</h1><div class="sub">' +
      esc(st.studio.name) + '</div></div>' +
      '<button class="findbtn" data-act="find.open">' +
        '<span class="ico">⌕</span>Jump to anything<span class="kbd">Ctrl K</span></button>' +
      '<nav>';

    /* Two or three groups per mode, all open. Collapsing them was a fix
       for a rail that held every screen in the game at once, and the
       mode buttons above solve that better. */
    groups.forEach(function (g) {
      var count = g.design
        ? probs.issues.filter(function (p) { return groupOfProblem(p) === g.id; }).length : 0;

      html += '<div class="navhead">' + esc(g.group) +
        (count ? '<span class="gbadge">' + count + '</span>' : '') + '</div>';

      g.items.forEach(function (it) {
        var badge = '';
        if (it.id === 'dashboard' && st.pendingEvents.length)
          badge = '<span class="badge">' + st.pendingEvents.length + '</span>';
        html += '<button class="nav' + (it.id === cur ? ' on' : '') +
          '" data-act="nav" data-val="' + it.id + '">' +
          '<span class="ico">' + it.ico + '</span>' + esc(navLabel(it)) + badge + '</button>';
      });
    });

    html += '</nav>' +
      '<div class="railfoot">' +
      '<button class="nav' + (probs.bad ? ' bad' : probs.warn ? ' warn' : '') +
        '" data-act="problems.open"><span class="ico">!</span>Problems' +
        (probs.issues.length ? '<span class="badge' + (probs.bad ? '' : ' soft') + '">' +
          probs.issues.length + '</span>' : '') + '</button>' +
      '<button class="nav" data-act="game.save"><span class="ico">⬇</span>Save</button>' +
      '<button class="nav" data-act="game.saveFile"><span class="ico">&#9603;</span>Save to file</button>' +
      '<button class="nav" data-act="game.loadFile"><span class="ico">&#9601;</span>Load from file</button>' +
      '<button class="nav" data-act="game.export"><span class="ico">⎘</span>Export design</button>' +
      '<button class="nav" data-act="game.new"><span class="ico">✦</span>New game</button>' +
      '</div>';
    document.getElementById('rail').innerHTML = html;
  }

  /* Route a problem to the section that can fix it, so the drawer can
     take you straight there instead of describing where to look. */
  var PROBLEM_ROUTES = [
    [/^Class:|^Talent tree/, 'classes'], [/^Race:/, 'races'],
    [/^Ability:/, 'abilities'],
    [/^Item:|^Loot|^Reward/, 'items'], [/^Zone:|^Quest|^Questgiver|^Monster/, 'world'],
    [/^Boss:|^Dungeon:|^Raid/, 'encounters'], [/^PvP/, 'pvp'],
    [/^Monetisation|^Battle pass|^Shop/, 'business'], [/^Economy/, 'business'],
    [/^Progression|^Gearing/, 'progression'], [/^Stat/, 'combat'],
    [/^Expansion/, 'expansions']
  ];
  function sectionOfProblem(p) {
    var where = (p.where || '') + '';
    for (var i = 0; i < PROBLEM_ROUTES.length; i++)
      if (PROBLEM_ROUTES[i][0].test(where)) return PROBLEM_ROUTES[i][1];
    return 'systems';
  }
  function groupOfProblem(p) { return GROUP_OF[sectionOfProblem(p)] || 'biz'; }

  /* ========================================================= QUICK FIND

     Twelve design sections holding thousands of authored objects is not
     a navigation problem you can solve with tabs. This is: type a few
     letters, get the ability, the boss, the zone or the section, press
     enter, and land on it with the right thing already selected.      */

  function findIndex() {
    var d = PN.game.state.design;
    var out = [];
    /* Screens always; authored objects only once a game exists. */

    /* Quick find reaches every screen, whichever mode it lives in -
       switching modes to look something up defeats the point. */
    allNavGroups().forEach(function (g) {
      g.items.forEach(function (it) {
        out.push({ kind: g.design ? 'Section' : 'Screen', name: navLabel(it),
                   sub: g.group, go: { id: it.id } });
      });
    });

    function push(list, kind, section, selKey, subFn) {
      (list || []).forEach(function (x) {
        var sel = {};
        sel[selKey] = x.id;
        out.push({ kind: kind, name: x.name, sub: subFn ? subFn(x) : '',
                   go: { id: section, sel: sel } });
      });
    }
    if (!d) return out;

    /* Titles are always jumpable - that is how you switch games. */
    (PN.game.state.titles || []).forEach(function (t) {
      out.push({ kind: "Game", name: t.titleName,
                 sub: (PN.titles.PHASE_BY_ID[t.phase] || {}).name || t.phase,
                 go: { id: "portfolio", sel: { titleId: t.id } } });
    });

    if (PN.talents.isTalentMode(d)) {
      push(PN.talents.tree(d).branches, 'Branch', 'classes', 'branchId', function (b) {
        return U.titleCase(b.role) + ' · ' + PN.talents.nodesOf(d, b.id).length + ' nodes'; });
    } else {
      push(d.classes, 'Class', 'classes', 'classId', function (c) {
        return U.titleCase(c.role) + ' · ' + (c.abilities || []).length + ' abilities'; });
    }
    push(d.races || [], 'Race', 'races', 'raceId', function (r) {
      return (r.bonuses || []).length
        ? (r.bonuses || []).map(function (b) {
            return PN.viewsRaces.bonusLabel(d, b); }).join(' · ')
        : 'no bonuses'; });
    push(d.abilities, 'Ability', 'abilities', 'abilityId', function (a) {
      return (a.effects || []).length + ' effects · ' + U.round(a.cooldown || 0, 1) + 's cd'; });
    push(d.items, 'Item', 'items', 'itemId', function (i) {
      return i.kind + (i.itemLevel ? ' · ilvl ' + i.itemLevel : ''); });
    push(d.lootTables, 'Loot table', 'items', 'lootId');
    push(d.rewards, 'Reward', 'items', 'rewardId');
    push(PN.crafting.recipes(d), 'Recipe', 'items', 'recipeId', function (r) {
      var p = PN.crafting.PROFESSION_BY_ID[r.profession];
      return (p ? p.name : r.profession) + ' · ' +
             (r.source === 'looted' ? 'looted' : 'trainer') + ' · lv ' + r.levelReq; });
    push(d.zones, 'Zone', 'world', 'zoneId', function (z) {
      return 'lv ' + z.levelLo + '-' + z.levelHi; });
    push(d.monsters, 'Monster', 'world', 'monsterId', function (m) {
      return 'lv ' + m.level + ' ' + m.family; });
    push(d.questgivers, 'Questgiver', 'world', 'giverId');
    push(d.quests, 'Quest', 'world', 'questId', function (q) {
      return 'lv ' + q.level + ' · ' + PN.world.questLabel(d, q); });
    push(d.questlines, 'Questline', 'world', 'questlineId');
    push(d.rewardChains, 'Reward chain', 'world', 'chainId');
    push(d.dungeons, 'Dungeon', 'encounters', 'dungeonId', function (x) {
      return (x.raid ? 'Raid' : 'Dungeon') + ' · ' + x.groupSize + '-player'; });
    push(d.bosses, 'Boss', 'encounters', 'bossId', function (b) {
      return (b.phases || []).length + ' phases'; });
    push((d.pvp || {}).maps, 'PvP map', 'pvp', 'pvpMapId');
    push(d.expansions, 'Expansion', 'expansions', 'expansionId');
    return out;
  }

  /* Subsequence match, so "hvstrk" finds "Heavy Strike". Score favours
     earlier and tighter matches, which is what typing a name feels like. */
  function fuzzy(needle, hay) {
    var n = needle.toLowerCase(), h = hay.toLowerCase();
    if (!n) return 0;
    var direct = h.indexOf(n);
    if (direct === 0) return 1000;
    if (direct > 0) return 700 - direct;
    var i = 0, j = 0, first = -1, gaps = 0, last = -1;
    while (i < n.length && j < h.length) {
      if (n[i] === h[j]) {
        if (first < 0) first = j;
        if (last >= 0 && j > last + 1) gaps += j - last - 1;
        last = j; i++;
      }
      j++;
    }
    if (i < n.length) return -1;
    return 400 - first * 2 - gaps;
  }

  function findResults(q) {
    var idx = findIndex();
    if (!q) {
      return idx.filter(function (r) { return r.kind === 'Section' || r.kind === 'Screen'; });
    }
    return idx.map(function (r) {
        var s = Math.max(fuzzy(q, r.name), fuzzy(q, r.kind + ' ' + r.name) - 60);
        return { r: r, s: s };
      })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 40)
      .map(function (x) { return x.r; });
  }

  function findRows(rows, active) {
    if (!rows.length) return '<div class="findempty">Nothing matches that.</div>';
    return rows.map(function (r, i) {
      return '<div class="findrow' + (i === active ? ' on' : '') + '" data-fi="' + i + '">' +
        '<span class="fk">' + esc(r.kind) + '</span>' +
        '<span class="fn">' + esc(r.name) + '</span>' +
        '<span class="fs">' + esc(r.sub || '') + '</span></div>';
    }).join('');
  }

  function openFind() {
    var state = { q: '', active: 0, rows: findResults('') };

    var host = ui.modal({
      title: 'Jump to anything',
      sub: 'Sections, classes, abilities, items, zones, quests, bosses - anything you have authored.',
      body: '<input id="findq" type="text" placeholder="Start typing…" autocomplete="off">' +
            '<div id="findlist" class="findlist">' + findRows(state.rows, 0) + '</div>',
      footer: null,
      onMount: function (h) {
        var input = h.querySelector('#findq');
        var list = h.querySelector('#findlist');

        function paint() {
          list.innerHTML = findRows(state.rows, state.active);
          var on = list.querySelector('.findrow.on');
          if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
        }
        function choose() {
          var r = state.rows[state.active];
          if (!r) return;
          ui.closeModal();
          goTo(r.go.id, { sel: r.go.sel });
        }

        input.addEventListener('input', function () {
          state.q = input.value;
          state.rows = findResults(state.q);
          state.active = 0;
          paint();
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown') {
            state.active = Math.min(state.rows.length - 1, state.active + 1); paint(); e.preventDefault();
          } else if (e.key === 'ArrowUp') {
            state.active = Math.max(0, state.active - 1); paint(); e.preventDefault();
          } else if (e.key === 'Enter') { choose(); e.preventDefault(); }
          else if (e.key === 'Escape') { ui.closeModal(); }
        });
        list.addEventListener('click', function (e) {
          var row = e.target.closest ? e.target.closest('.findrow') : null;
          if (!row) return;
          state.active = parseInt(row.getAttribute('data-fi'), 10) || 0;
          choose();
        });
        input.focus();
      }
    });
    return host;
  }

  /* ====================================================== PROBLEMS DRAWER

     The integrity list used to be buried at the bottom of two different
     tabs. It is the most useful screen in the game, so it gets a drawer
     and every row takes you to the thing that is broken.              */
  function openProblems() {
    var d = PN.game.state.design;
    var probs = PN.metrics.integrity(d);
    var body;
    if (!probs.issues.length) {
      body = ui.empty('Nothing is broken.',
        'Every class has abilities, every zone has quests, every boss has loot. Ship it.');
    } else {
      var groups = { bad: [], warn: [] };
      probs.issues.forEach(function (p) { (groups[p.sev] || groups.warn).push(p); });
      body = ['bad', 'warn'].map(function (sev) {
        if (!groups[sev].length) return '';
        return '<div class="probgroup"><div class="probhead ' + sev + '">' +
          (sev === 'bad' ? 'Broken' : 'Worth a look') + ' · ' + groups[sev].length + '</div>' +
          groups[sev].map(function (p) {
            var section = sectionOfProblem(p);
            var label = null;
            PN.viewsDesign.TABS.forEach(function (t) { if (t.id === section) label = t.name; });
            return '<div class="probrow" data-act="problems.go" data-val="' + esc(section) + '">' +
              '<span class="dot ' + sev + '"></span>' +
              '<div style="min-width:0"><div class="pt">' + esc(p.what) + '</div>' +
              '<div class="ps">' + esc(p.where || '') + '</div></div>' +
              '<span class="spacer"></span>' +
              '<span class="chip">' + esc(label || section) + '</span></div>';
          }).join('') + '</div>';
      }).join('');
    }
    ui.modal({
      title: 'Problems',
      sub: probs.issues.length
        ? probs.bad + ' broken, ' + probs.warn + ' worth a look - click any row to go and fix it.'
        : 'A clean integrity pass.',
      body: body, wide: true
    });
  }

  function renderTopbar() {
    var st = PN.game.state;
    var has = PN.titles.hasTitle(st);
    var pf = has ? PN.titles.portfolio(st) : null;
    var live = has && st.phase === 'live';
    var kpis;
    if (!has) {
      /* Before anything is greenlit there is a studio and a runway. */
      var wages = PN.state.weeklyWages(st);
      kpis = [['Cash', U.fmtMoney(st.studio.cash)],
              ['Wages/wk', U.fmtMoney(wages)],
              ['Runway', Math.floor(st.studio.cash / Math.max(1, wages)) + 'w'],
              ['Team', st.studio.staff.length]];
    } else if (live) {
      kpis = [['Players', U.fmtCompact(st.population.total)],
              ['Revenue/wk', U.fmtMoney(pf.revenueWeek || st.finance.revenueWeek)],
              ['Cash', U.fmtMoney(st.studio.cash)],
              ['Sentiment', Math.round(st.runtime.sentiment)]];
    } else {
      kpis = [['Build', U.fmtPct(PN.sim.completion(st).overall * 100, 0)],
              ['Cash', U.fmtMoney(st.studio.cash)],
              ['Hype', Math.round(st.runtime.hype)]];
    }
    /* More than one game means the topbar has to say which one. */
    var titleChip = has && (st.titles || []).length > 1
      ? '<span class="titlechip" data-act="nav" data-val="portfolio" title="Switch game">' +
        esc((PN.titles.active(st) || {}).titleName || '') + '</span>' : '';
    var phase = has ? st.phase : 'studio';
    var mode = currentMode();

    /* The two jobs, as two buttons. Everything else in the rail belongs
       to one of them, which is what keeps the rail short. */
    var modeBtns = '<div class="modes">' + MODES.map(function (m) {
      var locked = m.needsTitle && !has;
      return '<button class="modebtn' + (mode === m.id ? ' on' : '') +
        (locked ? ' locked' : '') + '"' +
        (locked ? ' title="Greenlight a game first"' : ' title="' + esc(m.blurb) + '"') +
        ' data-act="mode" data-val="' + m.id + '">' +
        '<span class="ico">' + m.ico + '</span>' + esc(m.name) + '</button>';
    }).join('') + '</div>';

    document.getElementById('topbar').innerHTML =
      modeBtns +
      '<span class="clock">' +
        esc(U.weekLabel(st.week, st.studio.founded || st.startYear || 2004)) + '</span>' +
      '<span class="phase' + (live ? ' live' : '') + '">' + esc(phase) + '</span>' +
      titleChip +
      '<span class="spacer"></span>' +
      '<div class="kpis">' + kpis.map(function (k) {
        return '<div class="kpi"><div class="k">' + esc(k[0]) + '</div><div class="v">' + k[1] + '</div></div>';
      }).join('') + '</div>' +
      /* The clock. Days pass at the speed you choose; the week lands on
         the seventh. "Next week" skips straight to the end of it. */
      '<div class="clock">' +
      SPEEDS.map(function (s) {
        return '<button class="clockbtn' +
          ((PN.app.speedId || 0) === s.id ? ' on' : '') +
          '" data-act="game.speed" data-val="' + s.id + '" title="' + esc(s.name) + '">' +
          esc(s.ico) + '</button>';
      }).join('') +
      '<span class="clockday mono tiny">' + esc(DAY_NAMES[PN.app.day || 0]) + '</span>' +
      '</div>' +
      '<button class="primary" data-act="game.week">Next week →</button>';
  }

  var LIVE_HEADS = {
    studio:     ['Your studio', 'The team, the money, and what you have in production.'],
    portfolio:  ['Games', 'Every MMO you are running, and who is working on which.'],
    research:   ['Research', 'What the studio cannot build yet, and what it costs to learn.'],
    roadmap:    ['Patches', 'Ship what you have authored. The notes write themselves from your changes.'],
    dashboard:  ['Dashboard', 'This week at a glance, and whatever is on fire.'],
    livewatch:  ['The World', 'Your players, in the zones you built, doing what you gave them.'],
    ladder:     ['Leaderboard', 'Who is winning your arenas, and what they are playing.'],
    telemetry:  ['Telemetry', 'The curves: population, revenue, retention and sentiment over time.'],
    players:    ['Players', 'Every simulated player individually - their build, bags, gear and opinion of you.'],
    economy:    ['Economy', 'Currency supply, faucets, sinks and who is actually holding the gold.'],
    community:  ['Community', 'Guilds, the social graph, and what the forums are saying.'],
    market:     ['Market', 'The competition, the genre mood, and where your players might go instead.']
  };

  function renderView() {
    var st = PN.game.state, html;
    /* The storage panel is only honest if its numbers are this week's. */
    if (PN.app.view === 'studio' && !PN.app.storage) refreshStorage();
    if (PN.app.view === 'design') {
      document.getElementById('view').innerHTML = PN.viewsDesign.render();
      return;
    }
    /* Screens that need a game fall back to the studio until one exists. */
    var needsTitle = { dashboard: 1, roadmap: 1, telemetry: 1, players: 1, economy: 1,
                       community: 1, livewatch: 1, ladder: 1 };
    if (needsTitle[PN.app.view] && !PN.titles.hasTitle(st)) PN.app.view = 'studio';

    switch (PN.app.view) {
      case 'studio': html = PN.viewsStudio.studioTab(); break;
      case 'portfolio': html = PN.viewsStudio.portfolioTab(); break;
      case 'research': html = PN.viewsResearch.render(); break;
      case 'livewatch': html = PN.world3d.render(); break;
      case 'ladder': html = PN.viewsLadder.render(); break;
      case 'roadmap': html = PN.viewsPatches.roadmapTab(); break;
      case 'telemetry': html = PN.viewsLive.telemetry(); break;
      case 'players': html = PN.viewsSim.playersTab(); break;
      case 'economy': html = PN.viewsSim.economyTab(); break;
      case 'community': html = PN.viewsLive.community(); break;
      case 'market': html = PN.viewsLive.market(); break;
      default: html = PN.viewsLive.dashboard();
    }
    var head = LIVE_HEADS[PN.app.view] || LIVE_HEADS.dashboard;
    var subject = PN.titles.hasTitle(st)
      ? esc(st.studio.name) + ' &middot; ' + esc((PN.titles.active(st) || {}).titleName || '')
      : esc(st.studio.name);
    document.getElementById('view').innerHTML =
      '<div class="sectionhead"><div class="sh-t"><h1>' + esc(head[0]) + '</h1>' +
      '<div class="sh-s">' + esc(head[1]) + '</div></div>' +
      '<div class="sh-r"><div class="sh-game">' + subject + ' &middot; ' +
      esc(U.weekLabel(st.week, st.studio.founded || 2004)) + '</div></div></div>' +
      '<div class="sectionbody">' + html + '</div>';
  }


  /* ------------------------------------------------------ keeping place

     Every render replaces the view's innerHTML, which throws away where
     you were scrolled to and which field you were typing in. Editing a
     design is hundreds of small changes in a row, so losing your place on
     each one makes the whole studio unusable.

     Scroll containers are keyed by their position in the layout rather
     than by an id, because the markup is rebuilt from scratch each time
     and nothing survives except structure.                            */
  function scrollKeyFor(el, i) {
    return (el.className || '') + '#' + i;
  }
  function captureView() {
    var view = document.getElementById('view');
    if (!view) return null;
    var snap = { view: view.scrollTop, panes: {}, focus: null };
    var panes = view.querySelectorAll('.sectionbody > .grid > div, .pane, .tablewrap, .findlist');
    for (var i = 0; i < panes.length; i++) {
      if (panes[i].scrollTop) snap.panes[scrollKeyFor(panes[i], i)] = panes[i].scrollTop;
    }
    /* Which control had the caret, so typing survives a re-render. */
    var a = document.activeElement;
    if (a && view.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) {
      snap.focus = {
        act: a.getAttribute('data-act'), bind: a.getAttribute('data-bind'),
        val: a.getAttribute('data-val'), cls: a.className, type: a.type,
        start: a.selectionStart, end: a.selectionEnd
      };
    }
    return snap;
  }
  function restoreView(snap) {
    if (!snap) return;
    var view = document.getElementById('view');
    if (!view) return;
    view.scrollTop = snap.view;
    var panes = view.querySelectorAll('.sectionbody > .grid > div, .pane, .tablewrap, .findlist');
    for (var i = 0; i < panes.length; i++) {
      var k = scrollKeyFor(panes[i], i);
      if (snap.panes[k] !== undefined) panes[i].scrollTop = snap.panes[k];
    }
    var f = snap.focus;
    if (!f) return;
    /* Find the same control again by what it is bound to, not by identity. */
    var sel = f.bind ? '[data-bind="' + f.bind + '"]'
            : f.act ? '[data-act="' + f.act + '"]' + (f.val !== null && f.val !== undefined
                ? '[data-val="' + f.val + '"]' : '')
            : null;
    if (!sel) return;
    var list = view.querySelectorAll(sel);
    var target = null;
    for (var j = 0; j < list.length; j++) {
      if (list[j].className === f.cls) { target = list[j]; break; }
    }
    if (!target) target = list[0];
    if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
    try {
      target.focus();
      if (f.start !== null && f.start !== undefined && target.setSelectionRange &&
          target.type !== 'range' && target.type !== 'number') {
        target.setSelectionRange(f.start, f.end);
      }
    } catch (e) { /* some input types refuse selection ranges */ }
  }

  function render() {
    if (!PN.game.state) return;
    var snap = captureView();
    renderRail(); renderTopbar(); renderView();
    restoreView(snap);
  }
  PN.app.render = render;

  /* ========================================================== BINDINGS */

  /* Resolve a data-bind path to {obj, key}. Special roots point at
     whatever is currently selected in the design studio.              */
  function resolveBind(path) {
    var st = PN.game.state, d = st.design, sel = PN.app.sel;
    var parts = path.split('.'), root = parts[0];
    var base = null;

    if (root === 'design') base = st;
    else if (root === 'runtime') base = st;
    else if (root === 'studio') base = st;
    else if (root === 'branchSel') base = { branchSel: PN.talents.branchById(d, sel.branchId) };
    else if (root === 'research') base = { research: PN.research.ensure(PN.game.state) };
    else if (root === 'planSel') base = { planSel: PN.patches.planById(st, sel.planId) };
    else if (root === 'recipeSel') base = { recipeSel: PN.crafting.recipeById(d, sel.recipeId) };
    else if (root === 'autoSel') base = { autoSel: st.automate };
    else if (root === 'titleSel') base = { titleSel: PN.titles.byId(st, sel.titleId) };
    else if (root === 'classSel') base = { classSel: U.byId(d.classes, sel.classId) };
    else if (root === 'raceSel') base = { raceSel: U.byId(d.races || [], sel.raceId) };
    else if (root === 'zoneSel') base = { zoneSel: U.byId(d.zones, sel.zoneId) };
    else if (root === 'eventSel') base = { eventSel: PN.gameEvents.eventById(d, sel.eventId) };
    /* cur:<itemId> edits a currency's job; sinkcur:<sinkId> edits
       which currency a sink takes. */
    else if (root.indexOf('cur:') === 0) {
      var ci = U.byId(d.items || [], root.slice(4));
      if (ci) {
        if (ci.currencyRole === undefined) ci.currencyRole = PN.currency.currencies(d)[0] &&
          PN.currency.currencies(d)[0].id === ci.id ? 'money' : 'token';
        return { obj: ci, key: 'currencyRole' };
      }
      return null;
    }
    else if (root.indexOf('sinkcur:') === 0) {
      var sk = U.byId(PN.currency.sinks(d), root.slice(8));
      return sk ? { obj: sk, key: 'currencyId' } : null;
    }
    else if (root === 'qlSel') base = { qlSel: U.byId(d.questlines, sel.questlineId) };
    else if (root === 'chainSel') base = { chainSel: U.byId(d.rewardChains, sel.chainId) };
    else if (root === 'bossSel') base = { bossSel: U.byId(d.bosses, sel.bossId) };
    else if (root === 'dngSel') base = { dngSel: U.byId(d.dungeons, sel.dungeonId) };
    else if (root === 'abilitySel') base = { abilitySel: PN.abilities.abilityById(d, sel.abilityId) };
    else if (root === 'itemSel') base = { itemSel: PN.items.itemById(d, sel.itemId) };
    else if (root === 'lootSel') base = { lootSel: PN.items.lootById(d, sel.lootId) };
    else if (root === 'rewardSel') base = { rewardSel: PN.items.rewardById(d, sel.rewardId) };
    else if (root === 'monsterSel') base = { monsterSel: PN.world.monsterById(d, sel.monsterId) };
    else if (root === 'giverSel') base = { giverSel: PN.world.giverById(d, sel.giverId) };
    else if (root === 'questSel') base = { questSel: PN.world.questById(d, sel.questId) };
    else if (root === 'mapSel') base = { mapSel: PN.pvp.mapById(d, sel.mapId) };
    else if (root === 'expSel') base = { expSel: U.byId(d.expansions || [], sel.expansionId) };
    else if (root === 'lineSel') base = { lineSel: U.byId(d.questlines || [], sel.questlineId) };
    else base = st;

    /* A selection root that points at nothing resolves to nothing.

       Walking on would CREATE the missing object below and write the
       edit into it - a real object, held by nobody, thrown away on the
       next render. That is how a panel could look completely normal
       and silently discard every field on it, which is exactly what
       the event editor did whenever it fell back to the first event
       without recording which one it had picked. */
    if (base !== st && base[root] == null) return null;

    /* Walk to the object holding the last key. A missing plain object on
       the way is created rather than failing: a nested group like an
       item's sources may not exist yet on a design written before it
       did, and a toggle that silently does nothing is the worst kind
       of bug to find. */
    var o = base;
    for (var i = 0; i < parts.length - 1; i++) {
      if (o == null) return null;
      if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = {};
      o = o[parts[i]];
    }

    if (o == null) return null;
    return { obj: o, key: parts[parts.length - 1] };
  }

  function applyBind(path, kind, raw) {
    /* A few controls act on a relationship rather than a field. */
    if (RANGE_ACTIONS[path]) {
      RANGE_ACTIONS[path](null, raw);
      PN.game.state.dirty = (PN.game.state.dirty || 0) + 1;
      invalidate();
      return;
    }
    var t = resolveBind(path);
    if (!t) return;
    var v = kind === 'num' ? parseFloat(raw) : kind === 'bool' ? !!raw : raw;
    if (kind === 'num' && isNaN(v)) return;
    t.obj[t.key] = v;
    /* Every slider, toggle and number box in the game lands here, and
       it used to bump the dirty counter and stop - so none of it was
       ever attributed to a release. Half the design could be edited
       without a single change belonging to the patch on screen. */
    touch();
  }

  /* ============================================================ ACTIONS */

  var ACTIONS = {
    'nav': function (v) { goTo(v); },
    'mode': function (v) { setMode(v); },
    'find.open': function () { openFind(); },
    'problems.open': function () { openProblems(); },
    'problems.go': function (v) { ui.closeModal(); goTo(v); },
    'cost.expand': function () {
      ui.modal({ title: 'Build progress',
        sub: 'Capacity spent against what the design you have authored actually costs.',
        body: PN.viewsDesign.costReadout() });
    },

    /* --------------------------------------------------------- crafting */
    'recipe.filter': function (v) { PN.app.recipeFilter = v; render(); },
    'recipe.select': function (v) { PN.app.sel.recipeId = v; render(); },
    'recipe.add': function () {
      var d = PN.game.state.design;
      var r = PN.crafting.newRecipe({ name: 'New Recipe ' +
        (PN.crafting.recipes(d).length + 1) });
      PN.crafting.recipes(d).push(r);
      PN.app.sel.recipeId = r.id;
      touch(); render();
    },
    'recipe.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(PN.crafting.recipes(d), v);
      if (PN.app.sel.recipeId === v) PN.app.sel.recipeId = null;
      touch(); render();
    },
    'recipe.generate': function () {
      var d = PN.game.state.design;
      var made = PN.crafting.generate(d, { rng: PN.state.rngFor(PN.game.state) });
      if (made.length) PN.app.sel.recipeId = made[0].id;
      flash(made.length + ' recipes generated from what you already have.');
      touch(); render();
    },
    /* A reagent is anything that goes in, not only ore. The button
       says which kind it is reaching for so the picker opens on
       something sensible rather than on the first material in the
       list every time. */
    'recipe.addInput': function (v) {
      var d = PN.game.state.design;
      var r = PN.crafting.recipeById(d, PN.app.sel.recipeId);
      if (!r) return;
      var kind = v || 'material';
      var pick = (d.items || []).filter(function (i) { return i.kind === kind; })[0];
      if (!pick) return;
      /* Gold by the stack, gear one at a time. */
      var qty = kind === 'currency' ? 100 : kind === 'gear' ? 1 : 2;
      r.inputs.push({ itemId: pick ? pick.id : null, qty: qty });
      touch(); render();
    },
    'recipe.removeInput': function (v) {
      var r = PN.crafting.recipeById(PN.game.state.design, PN.app.sel.recipeId);
      if (!r) return;
      r.inputs.splice(parseInt(v, 10), 1);
      touch(); render();
    },
    /* A looted recipe needs an item to teach it, so make one that already
       points at the right place rather than making the player wire it. */
    'recipe.makeItem': function (v) {
      var d = PN.game.state.design;
      var r = PN.crafting.recipeById(d, v);
      if (!r) return;
      var out = PN.items.itemById(d, r.outputId);
      var it = PN.items.newItem({
        name: 'Pattern: ' + (out ? out.name : r.name), kind: 'recipe', rarity: 'rare',
        vendorValue: 200,
        desc: 'Teaches how to make ' + (out ? out.name : r.name) + '.'
      });
      d.items.push(it);
      r.recipeItemId = it.id;
      flash('Created "' + it.name + '". Put it in a loot table to make it findable.');
      touch(); render();
    },

    /* Greenlight a game. Until one exists there is nothing to design, and
       the whole design side of the interface stays hidden. */
    /* ---------------------------------------------------------- titles */
    'title.greenlight': function () {
      var st = PN.game.state;
      var slots = PN.titles.titleSlots(st);
      var running = PN.titles.building(st).length;
      var over = running >= slots;
      var suggestion = PN.viewsStudio.suggestTitleName();
      /* Anything already live is something you could make a sequel to.

         The record only learns what the mounted game has been doing
         when it is unmounted, so the game you are actually playing
         still reads as "development" here however long it has been
         shipped - which is exactly the game you would want a sequel
         to. Syncing first is what unmount is for, and it only copies
         the state into its own record. */
      PN.titles.unmount(st);
      var parents = (st.titles || []).filter(function (t) {
        return t.phase === 'live' && t.id !== null;
      });
      ui.modal({
        title: running ? 'Greenlight another MMO' : 'Greenlight your first MMO',
        sub: running
          ? 'You are running ' + running + ' and staffed for ' + slots + '.'
          : 'Name it. You can change everything about it afterwards.',
        body:
          (parents.length
            ? '<div class="subhead">What is it</div>'
              + '<div class="glpick">'
              + '<div class="glcard on" data-gl="new">'
                + '<div class="t">Something new</div>'
                + '<div class="s">Nobody has heard of it. No audience, no goodwill, and every '
                + 'player earned the hard way - but nothing of yours loses anything either.</div>'
              + '</div>'
              + parents.map(function (t) {
                  var leg = PN.titles.legacyOf(st, t);
                  var nm = t.titleName || (t.design && t.design.meta.name) || 'it';
                  return '<div class="glcard" data-gl="' + t.id + '">'
                    + '<div class="t">A sequel to ' + esc(nm) + '</div>'
                    + '<div class="s">Opens at <b>' + Math.round(leg.awareness) + ' awareness</b> and <b>'
                    + Math.round(leg.hype) + ' hype</b> before a line of it exists. When it ships, about <b>'
                    + Math.round(leg.carry * 100) + '%</b> of the ' + U.fmtCompact(leg.pop)
                    + ' people playing ' + esc(nm) + ' move across to it.</div>'
                    + '</div>';
                }).join('')
              + '</div>'
              + '<div class="subhead spaced">Working title</div>'
            : '') +
          '<div class="field"><label><span class="name">' +
          (parents.length ? 'Name' : 'Working title') + '</span></label>' +
          '<input type="text" id="newtitle" value="' + esc(suggestion) + '" maxlength="48"></div>' +
          '<div class="tiny faint" style="line-height:1.6">Production starts this week. Nothing is ' +
          'authored yet - you decide what kind of MMO it is in the Design Studio, and it stays a ' +
          'draft until you ship it.</div>' +
          (over
            ? '<div class="chip warn" style="margin-top:12px">Your team supports ' + slots +
              ' game' + (slots === 1 ? '' : 's') + '. A ' + U.ordinal(running + 1) +
              ' will slow everything down until you hire.</div>'
            : running
              ? '<div class="chip good" style="margin-top:12px">You have the people for this.</div>'
              : ''),
        footer: '<button data-act="modal.close">Cancel</button>' +
                '<button class="primary" id="glgo">Greenlight</button>',
        onMount: function (host) {
          var input = host.querySelector('#newtitle');
          var pick = 'new';
          var cards = host.querySelectorAll('.glcard');
          Array.prototype.forEach.call(cards, function (c) {
            c.addEventListener('click', function () {
              pick = c.getAttribute('data-gl');
              Array.prototype.forEach.call(cards, function (o) { o.classList.remove('on'); });
              c.classList.add('on');
              /* A sequel names itself, unless you have already typed
                 over it. */
              if (pick !== 'new' && !input.dataset.touched) {
                var t = U.byId(PN.game.state.titles || [], pick);
                var nm = t && (t.titleName || (t.design && t.design.meta.name));
                if (nm) input.value = nm + ' II';
              }
            });
          });
          input.addEventListener('input', function () { input.dataset.touched = '1'; });
          function go() {
            var nm = (input.value || '').trim() || suggestion;
            var st2 = PN.game.state;
            var t = PN.state.greenlight(st2,
              pick === 'new' ? { name: nm } : { name: nm, sequelTo: pick });
            PN.pop.ensureCohorts(st2);
            PN.economy.init(st2);
            PN.expansions.initLapsed(st2);
            ui.closeModal();
            PN.app.sel.classId = null;
            PN.app.sel.branchId = null;
            goTo('identity');
          }
          host.querySelector('#glgo').addEventListener('click', go);
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
          input.focus(); input.select();
        }
      });
    },
    'title.select': function (v) {
      PN.titles.activate(PN.game.state, v);
      PN.app.sel = U.merge(PN.app.sel, { classId: null, branchId: null, planId: null });
      invalidate(); render();
    },
    'title.close': function (v) {
      var st = PN.game.state;
      var t = PN.titles.byId(st, v);
      if (!t) return;
      ui.modal({
        title: 'Close ' + t.titleName + '?',
        sub: 'The servers go off. Players do not come back from this.',
        body: '<div class="tiny faint" style="line-height:1.6">' +
          U.fmtInt((t.population && t.population.total) || 0) + ' players are logged into it. ' +
          'Closing frees the whole team for your other games, and it is permanent.</div>',
        footer: '<button data-act="modal.close">Keep it running</button>' +
                '<button class="danger" data-act="title.closeConfirm" data-val="' + v + '">Close it down</button>'
      });
    },
    'title.closeConfirm': function (v) {
      var st = PN.game.state;
      PN.titles.withTitle(st, v, function (t) {
        t.phase = 'dead';
        st.phase = 'dead';
        st.sunsetWeek = st.week;
        st.population.total = 0;
        st.agents = [];
      });
      PN.titles.balanceAllocation(st);
      PN.state.log(st, 'alert', PN.titles.byId(st, v).titleName + ' has shut down',
        'The servers are off. The team is free.');
      ui.closeModal(); touch(); render();
    },
    'title.rename': function (v) {
      var st = PN.game.state;
      var t = PN.titles.byId(st, v);
      if (!t) return;
      ui.modal({
        title: 'Rename', sub: 'What the game is called.',
        body: '<input type="text" id="rn" value="' + esc(t.titleName) + '" maxlength="48">',
        footer: '<button data-act="modal.close">Cancel</button>' +
                '<button class="primary" id="rngo">Rename</button>',
        onMount: function (host) {
          function go() {
            var nm = (host.querySelector('#rn').value || '').trim();
            if (nm) {
              t.titleName = nm;
              t.design.meta.name = nm;
              /* The mounted copy has to learn about it too. */
              PN.titles.syncField(st, 'titleName');
            }
            ui.closeModal(); touch(); render();
          }
          host.querySelector('#rngo').addEventListener('click', go);
          host.querySelector('#rn').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') go();
          });
          host.querySelector('#rn').focus();
        }
      });
    },
    'title.launch': function (v) {
      var st = PN.game.state;
      PN.titles.withTitle(st, v || st.activeTitleId, function () {
        var r = PN.sim.launch(st);
        if (!r.ok) flash(r.reason);
        else flash('Launched at ' + Math.round(r.completion * 100) + '% of scope.');
      });
      touch(); render();
    },

    /* ---------------------------------------------------------- patches */

    'patch.add': function (v) {
      var st = PN.game.state;
      var kind = v || 'minor';
      /* A release you plan joins the END of the roadmap. Dating it off
         today alone put a small update planned after an expansion in
         front of it, which is not what "plan a release" means. */
      var lead = kind === 'major' ? 26 : kind === 'minor' ? 8 : 3;
      var plan = PN.patches.newPlan({
        kind: kind, targetWeek: PN.patches.backWeek(st, lead)
      });
      (st.patchPlan = st.patchPlan || []).push(plan);
      /* Authoring moves to it, so the draft on screen becomes the game
         as it will stand once everything before it has shipped - and
         the first thing you change is measured against THAT. */
      st.dirty = (st.dirty || 0) + 1;
      selectPlan(plan.id);
      render();
    },
    'patch.select': function (v) { selectPlan(v); render(); },
    /* Open one shipped release, and close whichever was open. */
    'release.toggle': function (v) {
      PN.app.openRelease = PN.app.openRelease === v ? null : v;
      render();
    },
    /* Ship this one sooner or later than its neighbour. Order is the
       ship date, so the version numbers follow on their own. */
    'patch.move': function (v) {
      var st = PN.game.state;
      var parts = String(v).split('|');
      if (PN.patches.reorder(st, parts[0], parts[1] === 'up' ? -1 : 1)) {
        /* Each release keeps its own changes; what moved is what they
           are measured against. Re-read the draft rather than writing
           it back, or reordering would silently rewrite the delta of
           whichever release happened to be on screen. */
        st.dirty = (st.dirty || 0) + 1;
        selectPlan(PN.app.sel.planId);
        render();
      }
    },
    'patch.remove': function (v) {
      var st = PN.game.state;
      U.removeById(st.patchPlan, v);
      /* Cancelling a release cancels what it changed - its delta went
         with it - so the draft has to be re-read rather than captured,
         or the work you just cancelled would be written straight back
         into whichever release you landed on. */
      st.dirty = (st.dirty || 0) + 1;
      if (PN.app.sel.planId === v) {
        var next = PN.patches.plansInOrder(st)[0];
        selectPlan(next ? next.id : null);
      } else {
        selectPlan(PN.app.sel.planId);
      }
      render();
    },
    'patch.shipNow': function (v) {
      var st = PN.game.state;
      var plan = PN.patches.planById(st, v);
      if (!plan) return;
      var funded = PN.patches.funded(st, plan);
      if (funded >= 0.999) {
        var r = PN.sim.shipPlan(st, plan);
        flash(r.ok ? r.record.versionText + ' shipped.' : r.reason);
        touch(); render();
        return;
      }
      ui.modal({
        title: 'Ship it unfinished?',
        sub: Math.round(funded * 100) + '% of this release is actually built.',
        body: '<div class="tiny faint" style="line-height:1.6">Shipping now puts in only what is ' +
          'finished, and the rest is dropped. It will arrive buggier, and players will notice the ' +
          'gap between what you announced and what turned up.</div>',
        footer: '<button data-act="modal.close">Wait</button>' +
                '<button class="danger" data-act="patch.shipPartial" data-val="' + v + '">Ship what exists</button>'
      });
    },
    'patch.shipPartial': function (v) {
      var st = PN.game.state;
      var plan = PN.patches.planById(st, v);
      if (!plan) return;
      var r = PN.sim.shipPlan(st, plan, { partial: true });
      flash(r.ok ? r.record.versionText + ' shipped early.' : r.reason);
      ui.closeModal(); touch(); render();
    },
    /* The first release is the launch. It ships as v1.0.0 and lands in the
       patch history like every other release. */
    'patch.launch': function () {
      var st = PN.game.state;
      var c = PN.sim.completion(st);
      function go() {
        var r = PN.sim.launch(st, { notes: PN.app.launchNotes || '' });
        PN.app.launchNotes = '';
        ui.closeModal();
        if (r.ok) flash(st.design.meta.name + ' is live at v1.0.0.');
        else flash(r.reason, true);
        touch(); render();
      }
      if (c.overall >= 0.999) { go(); return; }
      ui.modal({
        title: 'Launch unfinished?',
        sub: Math.round(c.overall * 100) + '% of what you designed is actually built.',
        body: '<div class="tiny faint" style="line-height:1.65">The missing work does not ' +
          'arrive later on its own - it launches as bugs, technical debt and a review score ' +
          'you will be carrying for years. Studios do this all the time, and it shows.</div>',
        footer: '<button data-act="modal.close">Keep building</button>' +
          '<button class="danger" id="launchgo">Launch anyway</button>',
        onMount: function (h) { h.querySelector('#launchgo').addEventListener('click', go); }
      });
    },
    'patch.kind': function (v) {
      /* A div, not a select - so this is a click action, not a range one.
         Registering it as a range action made the size cards inert. */
      var parts = String(v).split('|');
      var plan = PN.patches.planById(PN.game.state, parts[0]);
      if (plan) { plan.kind = parts[1]; touch(); render(); }
    },
    'patch.nameIt': function (v) {
      var plan = PN.patches.planById(PN.game.state, v);
      if (plan) { plan.name = PN.viewsStudio.suggestTitleName(); touch(); render(); }
    },
    'patch.autoNotes': function (v) {
      var st = PN.game.state;
      var plan = PN.patches.planById(st, v);
      if (!plan) return;
      plan.notes = PN.patches.autoNotes(st, plan);
      touch(); render();
    },
    /* ------------------------------------------------------- talent tree */

    /* The one action that changes what kind of game this is. */
    'prog.system': function (v) {
      var d = PN.game.state.design;
      if (d.progression.characterSystem === v) return;
      if (v === 'talent') {
        d.progression.characterSystem = 'talent';
        /* Fold the authored classes into a starting tree the first time,
           then leave whatever the player has edited alone. */
        if (!PN.talents.tree(d).branches.length) PN.talents.generateFromClasses(d);
        PN.app.sel.branchId = (PN.talents.tree(d).branches[0] || {}).id || null;
      } else {
        d.progression.characterSystem = 'class';
      }
      touch(); render();
    },

    'tal.branch': function (v) { PN.app.sel.branchId = v; render(); },
    'tal.node': function (v) { PN.app.sel.nodeId = v; render(); },
    /* Prerequisites and choice groups are both "which other talent",
       so both are toggles rather than dropdowns. */
    'tal.toggleReq': function (v) {
      var parts = String(v).split('|');
      var d = PN.game.state.design;
      var n = PN.talents.nodeById(d, parts[0]);
      if (!n) return;
      n.requires = n.requires || [];
      var i = n.requires.indexOf(parts[1]);
      if (i >= 0) n.requires.splice(i, 1); else n.requires.push(parts[1]);
      touch(); render();
    },
    'tal.toggleChoice': function (v) {
      var parts = String(v).split('|');
      var d = PN.game.state.design;
      var n = PN.talents.nodeById(d, parts[0]);
      var other = PN.talents.nodeById(d, parts[1]);
      if (!n || !other) return;
      if (n.choiceGroup && other.choiceGroup === n.choiceGroup) {
        /* Pull this one out of the group. A group of one is not a group. */
        other.choiceGroup = null;
        var left = PN.talents.tree(d).nodes.filter(function (x) {
          return x.choiceGroup === n.choiceGroup;
        });
        if (left.length < 2) left.forEach(function (x) { x.choiceGroup = null; });
      } else {
        var group = n.choiceGroup || ('choice-' + n.id);
        n.choiceGroup = group;
        other.choiceGroup = group;
      }
      touch(); render();
    },
    'tal.addBranch': function () {
      if (gated('classes')) return;
      var b = PN.talents.addBranch(PN.game.state.design);
      PN.app.sel.branchId = b.id; touch(); render();
    },
    'tal.removeBranch': function (v) {
      var d = PN.game.state.design;
      PN.talents.removeBranch(d, v);
      if (PN.app.sel.branchId === v)
        PN.app.sel.branchId = (PN.talents.tree(d).branches[0] || {}).id || null;
      touch(); render();
    },
    'tal.regen': function () {
      var d = PN.game.state.design;
      PN.talents.generateFromClasses(d);
      PN.app.sel.branchId = (PN.talents.tree(d).branches[0] || {}).id || null;
      touch(); render();
    },
    'tal.sizeToBudget': function () {
      PN.talents.sizeToBudget(PN.game.state.design); touch(); render();
    },
    'tal.addNode': function (v) {
      PN.talents.addNode(PN.game.state.design, v); touch(); render();
    },
    'tal.addNodeTier': function (v) {
      var parts = String(v).split('|');
      PN.talents.addNode(PN.game.state.design, parts[0],
        { tier: parseInt(parts[1], 10) || 1 });
      touch(); render();
    },
    'tal.addTier': function (v) {
      var d = PN.game.state.design;
      var ns = PN.talents.nodesOf(d, v);
      var top = 0;
      ns.forEach(function (n) { top = Math.max(top, n.tier || 1); });
      PN.talents.addNode(d, v, { tier: top + 1 });
      touch(); render();
    },
    'tal.removeNode': function (v) {
      PN.talents.removeNode(PN.game.state.design, v); touch(); render();
    },
    'design.tab': function (v) { goTo(v); },

    /* ------------------------------------------------------- game loop */
    'game.week': function () { step(); },
    'game.speed': function (v) { setSpeed(parseInt(v, 10) || 0); },
    'game.week': function () { stepWeek(); },
    'game.launch': function () { doLaunch(false); },
    'game.launchEarly': function () {
      var c = PN.sim.completion(PN.game.state);
      ui.modal({
        title: 'Launch unfinished?',
        sub: 'The build is ' + U.fmtPct(c.overall * 100) + ' complete.',
        body: '<div class="small muted" style="line-height:1.7">Everything you have not built ships as bugs and ' +
          'technical debt. Your review score takes a direct hit, and review scores are sticky - they gate ' +
          'acquisition for years, long after you have fixed the actual problems.<br><br>' +
          'Studios do this all the time. It is almost never the right call, and it is sometimes the only one.</div>',
        footer: '<button data-act="modal.close">Keep working</button>' +
          '<button class="danger" data-act="game.launchConfirm">Ship it</button>'
      });
    },
    'game.launchConfirm': function () { ui.closeModal(); doLaunch(true); },

    'patch.ship': function () { doShip(false); },
    'patch.shipEarly': function () { doShip(true); },

    'game.save': function () { save(); },
    'game.new': function () {
      if (confirm('Start a new game? Unsaved progress will be lost.')) { showSplash(); }
    },
    'game.export': function () { exportDesign(); },
    'game.saveFile': function () { downloadSave(); },
    'game.loadFile': function () { uploadSave(); },
    /* Ask the browser not to reclaim the save when the disk fills up.
       Chrome decides silently; Firefox asks the user. */
    'storage.persist': function () {
      PN.store.persist(function (granted) {
        flash(granted
          ? 'Your saves will be kept on this device.'
          : 'The browser would not promise to keep them. Export your design to be safe.',
          !granted);
        refreshStorage();
      });
    },

    'modal.close': function () { ui.closeModal(); },

    /* ---------------------------------------------------------- events */
    'event.open': function (v) {
      var st = PN.game.state, e = null;
      st.pendingEvents.forEach(function (x) { if (x.id === v) e = x; });
      if (!e) return;
      ui.modal({
        title: e.title, sub: 'Week ' + e.week,
        dismissable: false, footer: null,
        body: '<div class="small muted" style="line-height:1.7;margin-bottom:16px">' + esc(e.body) + '</div>' +
          e.options.map(function (o, i) {
            return '<div class="choice" data-act="event.choose" data-val="' + e.id + '|' + i + '">' +
              '<div class="t">' + esc(o.label) + '</div><div class="d">' + esc(o.detail) + '</div></div>';
          }).join('')
      });
    },
    'event.choose': function (v) {
      var parts = v.split('|');
      PN.events.resolve(PN.game.state, parts[0], parseInt(parts[1], 10));
      PN.game.state.dirty = (PN.game.state.dirty || 0) + 1;
      invalidate(); ui.closeModal(); render();
    },

    /* ------------------------------------------------------- telemetry */
    'axis.explain': function (v) { PN.viewsLive.axisExplain(v); },
    'cohort.open': function (v) { PN.viewsLive.cohortModal(v); },
    /* Why an audience the game supposedly suits is not in the game. */
    'market.audience': function (v) { PN.viewsLive.audienceModal(v); },

    /* ----------------------------------------------------------- staff */
    /* The roster is a table you open a row of, rather than twenty-five
       cards all shouting at once. */
    'staff.open': function (v) {
      PN.app.openStaff = PN.app.openStaff === v ? null : v;
      render();
    },
    'staff.sort': function (v) { PN.app.staffSort = v; render(); },
    /* Pressing Hire starts a SEARCH. In most decades that search ends
       the same week; in 1999 it does not, and that is what makes
       somebody handing in their notice a decision. */
    'staff.hire': function (v) {
      var st = PN.game.state;
      var r = PN.state.openSearch(st, v);
      if (r && r.opening) {
        flash('Looking for a ' + PN.state.ROLE_BY_ID[v].name.toLowerCase() +
              ' - about ' + r.opening.weeks + ' weeks.');
      }
      touch(); render();
    },
    'staff.cancelSearch': function (v) {
      PN.state.cancelSearch(PN.game.state, v);
      touch(); render();
    },
    'staff.counter': function (v) {
      var r = PN.sim.counterOffer(PN.game.state, v);
      if (!r.ok) { flash(r.reason, true); return; }
      flash(r.took ? 'They withdrew their notice.'
                   : 'They are still leaving. The raise stands anyway.', !r.took);
      touch(); render();
    },
    'staff.raise': function (v) {
      var st = PN.game.state;
      var s = U.byId(st.studio.staff, v);
      if (!s) return;
      var amount = Math.round(s.salary * 0.12);
      s.salary += amount;
      s.morale = U.clamp100(s.morale + 9);
      flash(s.name + ' now on ' + U.fmtMoneyFull(s.salary) + '/mo.');
      touch(); render();
    },
    'staff.fire': function (v) {
      var st = PN.game.state, s = U.byId(st.studio.staff, v);
      if (!s) return;
      U.removeById(st.studio.staff, v);
      st.studio.staff.forEach(function (x) { x.morale = U.clamp100(x.morale - 4); });
      PN.state.log(st, 'staff', s.name + ' let go', 'The rest of the team noticed.');
      render();
    },

    /* --------------------------------------------------------- classes */
    /* ------------------------------------------------------------ research */
    'research.start': function (v) {
      if (PN.research.start(PN.game.state, v)) { touch(); render(); }
    },
    'research.cancel': function () {
      var r = PN.research.ensure(PN.game.state);
      r.activeId = null; r.progress = 0;
      touch(); render();
    },
    'cls.select': function (v) { PN.app.sel.classId = v; render(); },
    /* Copy a thing and select the copy, so the next thing you type lands
       on it. The copying itself lives in the schema, where it can be
       tested without a browser. */
    'dup': function (v) {
      var parts = String(v || '').split('|');
      var what = parts[0], id = parts[1];
      var copy = PN.schema.duplicate(PN.game.state.design, what, id);
      if (!copy) return;
      var kind = PN.schema.DUPLICABLE[what];
      if (kind) PN.app.sel[kind.sel] = copy.id;
      touch(); render();
    },
    /* ------------------------------------------------------------ races */
    'race.select': function (v) { PN.app.sel.raceId = v; render(); },
    'race.add': function () {
      if (gated('races')) return;
      var d = PN.game.state.design;
      d.races = d.races || [];
      /* A new race starts with one bonus rather than none, because an
         empty one reads as broken and the first thing anybody does is
         add a bonus anyway. */
      var s = PN.stats.statSetOf(d);
      var r = PN.races.newRace({
        name: 'New Race',
        bonuses: [{ kind: 'stat', statId: s.primaries[0] ? s.primaries[0].id : null, pct: 5 }]
      });
      d.races.push(r);
      PN.app.sel.raceId = r.id;
      touch(); render();
    },
    'race.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.races || [], v);
      if (PN.app.sel.raceId === v) {
        PN.app.sel.raceId = (d.races && d.races.length) ? d.races[0].id : null;
      }
      touch(); render();
    },
    'race.bonus.add': function (v) {
      var d = PN.game.state.design;
      var r = U.byId(d.races || [], v);
      if (!r) return;
      var s = PN.stats.statSetOf(d);
      r.bonuses.push({ kind: 'stat', statId: s.primaries[0] ? s.primaries[0].id : null, pct: 3 });
      touch(); render();
    },
    'race.bonus.remove': function (v) {
      var d = PN.game.state.design;
      var bits = String(v).split(':');
      var r = U.byId(d.races || [], bits[0]);
      if (!r) return;
      r.bonuses.splice(parseInt(bits[1], 10), 1);
      touch(); render();
    },
    /* Ticking every class is the same thing as ticking none, so the
       list empties itself rather than leaving a restriction that
       restricts nothing. */
    'race.allow': function (v) {
      var d = PN.game.state.design;
      var bits = String(v).split(':');
      var r = U.byId(d.races || [], bits[0]);
      if (!r) return;
      var pid = bits[1];
      r.allow = r.allow || [];
      var at = r.allow.indexOf(pid);
      if (at >= 0) r.allow.splice(at, 1); else r.allow.push(pid);
      if (r.allow.length >= PN.schema.playable(d).length) r.allow = [];
      touch(); render();
    },

    'cls.add': function () {
      if (gated('classes')) return;
      var d = PN.game.state.design;
      var c = PN.schema.newClass('New Class', { abilities: ['strike', 'heavyStrike'] });
      d.classes.push(c); PN.app.sel.classId = c.id; touch(); render();
    },
    'cls.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.classes, v);
      if (PN.app.sel.classId === v) PN.app.sel.classId = d.classes.length ? d.classes[0].id : null;
      touch(); render();
    },
    'cls.ability': function (v) {
      var c = U.byId(PN.game.state.design.classes, PN.app.sel.classId);
      if (!c) return;
      var i = c.abilities.indexOf(v);
      if (i >= 0) c.abilities.splice(i, 1); else c.abilities.push(v);
      touch(); render();
    },
    /* ----------------------------------------------------------- zones */
    /* ---------------------------------------------------- the calendar */

    'event.select': function (v) { PN.app.sel.eventId = v; render(); },
    'event.add': function () {
      var d = PN.game.state.design;
      var list = PN.gameEvents.events(d);
      /* Space a new one away from whatever is already on the calendar,
         so adding two does not put both in the same fortnight. */
      var taken = {};
      list.forEach(function (e) {
        for (var i = 0; i < (e.weeks || 1); i++) taken[((e.startWeek || 0) + i) % 52] = 1;
      });
      var start = 40;
      for (var w = 0; w < 52; w++) {
        var try_ = (40 + w * 7) % 52;
        if (!taken[try_]) { start = try_; break; }
      }
      var ev = PN.gameEvents.newEvent({
        name: 'New Event ' + (list.length + 1), startWeek: start });
      list.push(ev);
      PN.app.sel.eventId = ev.id;
      touch(); render();
    },
    'event.remove': function (v) {
      U.removeById(PN.gameEvents.events(PN.game.state.design), v);
      if (PN.app.sel.eventId === v) PN.app.sel.eventId = null;
      touch(); render();
    },
    /* Toggling a zone, monster or quest in or out of an event. */
    'event.zone': function (v) { toggleEventList(v, 'zoneIds'); },
    'event.mob': function (v) { toggleEventList(v, 'monsterIds'); },
    'event.quest': function (v) { toggleEventList(v, 'questIds'); },

    'zone.select': function (v) {
      PN.app.sel.zoneId = v; PN.app.sel.questlineId = null; PN.app.sel.chainId = null; render();
    },
    'zone.add': function () {
      if (gated('zones')) return;
      var d = PN.game.state.design;
      var last = d.zones[d.zones.length - 1];
      var z = PN.schema.newZone('New Zone ' + (d.zones.length + 1), {
        levelLo: last ? last.levelHi : 1, levelHi: last ? last.levelHi + 10 : 10 });
      d.zones.push(z); PN.app.sel.zoneId = z.id; PN.app.sel.questlineId = null;
      PN.app.sel.chainId = null; touch(); render();
    },
    'zone.remove': function (v) {
      U.removeById(PN.game.state.design.zones, v);
      if (PN.app.sel.zoneId === v) PN.app.sel.zoneId = null;
      touch(); render();
    },

    /* ------------------------------------------------------ questlines */
    'ql.select': function (v) {
      PN.app.sel.questlineId = v; PN.app.sel.zoneId = null; PN.app.sel.chainId = null; render();
    },
    /* From inside a zone, where you are actually looking at the quests
       that are going to go in it. There was an action for this and no
       button anywhere that fired it, so questlines could not be made. */
    /* Putting a quest into a line, and taking it back out. */
    /* ------------------------------------------ currencies & sinks */
    'sink.add': function () {
      var sel2 = document.getElementById('newsink');
      var d = PN.game.state.design;
      var money = PN.currency.moneyOf(d);
      PN.currency.sinks(d).push(PN.currency.newSink({
        kind: sel2 ? sel2.value : 'repair',
        currencyId: money ? money.id : null }));
      touch(); render();
    },
    'sink.remove': function (v) {
      U.removeById(PN.currency.sinks(PN.game.state.design), v);
      touch(); render();
    },
    'sink.toggle': function (v) {
      var s = U.byId(PN.currency.sinks(PN.game.state.design), v);
      if (s) { s.enabled = s.enabled === false; touch(); render(); }
    },
    'ql.take': function (v) {
      var parts = String(v).split('|');
      var q = U.byId(PN.game.state.design.quests || [], parts[1]);
      if (q) { q.questlineId = parts[0]; touch(); render(); }
    },
    'ql.drop': function (v) {
      var q = U.byId(PN.game.state.design.quests || [], v);
      if (q) { q.questlineId = null; touch(); render(); }
    },
    'ql.addTo': function () {
      var d = PN.game.state.design;
      var zid = PN.app.sel.zoneId;
      var q = PN.schema.newQuestline('New Questline ' + (d.questlines.length + 1),
        { zoneId: zid });
      d.questlines.push(q);
      PN.app.sel.questlineId = q.id;
      touch(); render();
    },
    'ql.add': function () {
      var d = PN.game.state.design;
      var q = PN.schema.newQuestline('New Questline ' + (d.questlines.length + 1),
        { zoneId: PN.app.sel.zoneId });
      d.questlines.push(q); PN.app.sel.questlineId = q.id;
      PN.app.sel.zoneId = null; PN.app.sel.chainId = null; touch(); render();
    },
    'ql.remove': function (v) {
      U.removeById(PN.game.state.design.questlines, v);
      if (PN.app.sel.questlineId === v) PN.app.sel.questlineId = null;
      touch(); render();
    },

    /* ---------------------------------------------------- reward chains */
    'chain.select': function (v) {
      PN.app.sel.chainId = v; PN.app.sel.zoneId = null; PN.app.sel.questlineId = null; render();
    },
    'chain.add': function () {
      var d = PN.game.state.design;
      var c = PN.schema.newRewardChain('New Reward Chain ' + (d.rewardChains.length + 1));
      d.rewardChains.push(c); PN.app.sel.chainId = c.id;
      PN.app.sel.zoneId = null; PN.app.sel.questlineId = null; touch(); render();
    },
    'chain.remove': function (v) {
      U.removeById(PN.game.state.design.rewardChains, v);
      if (PN.app.sel.chainId === v) PN.app.sel.chainId = null;
      touch(); render();
    },
    'chain.addStep': function () {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (!c) return;
      c.steps.push({ label: 'Stage ' + (c.steps.length + 1), kind: 'currency', magnitude: 30, gateWeeks: 1 });
      touch(); render();
    },
    'chain.removeStep': function (v) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (!c) return;
      c.steps.splice(parseInt(v, 10), 1); touch(); render();
    },

    /* ---------------------------------------------------------- bosses */
    'boss.select': function (v) { PN.app.sel.bossId = v; PN.app.sel.dungeonId = null; render(); },
    'boss.add': function () {
      var d = PN.game.state.design;
      var b = PN.schema.newBoss('New Boss ' + (d.bosses.length + 1));
      d.bosses.push(b); PN.app.sel.bossId = b.id; PN.app.sel.dungeonId = null; touch(); render();
    },
    'boss.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.bosses, v);
      d.dungeons.forEach(function (dg) {
        var i = dg.bosses.indexOf(v); if (i >= 0) dg.bosses.splice(i, 1);
      });
      if (PN.app.sel.bossId === v) PN.app.sel.bossId = null;
      touch(); render();
    },
    'boss.addPhase': function () {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (!b) return;
      b.phases.push(PN.schema.newPhase('Phase ' + (b.phases.length + 1)));
      touch(); render();
    },
    'boss.removePhase': function (v) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (!b) return;
      b.phases.splice(parseInt(v, 10), 1); touch(); render();
    },
    'boss.mech': function (v) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (!b) return;
      var parts = v.split('|'), p = b.phases[parseInt(parts[0], 10)];
      if (!p) return;
      p.mechanics = p.mechanics || [];
      var i = p.mechanics.indexOf(parts[1]);
      if (i >= 0) p.mechanics.splice(i, 1); else p.mechanics.push(parts[1]);
      touch(); render();
    },

    /* -------------------------------------------------------- dungeons */
    'dng.select': function (v) { PN.app.sel.dungeonId = v; PN.app.sel.bossId = null; render(); },
    'dng.add': function () {
      if (gated('dungeons')) return;
      var d = PN.game.state.design;
      var dg = PN.schema.newDungeon('New Dungeon ' + (d.dungeons.length + 1));
      d.dungeons.push(dg); PN.app.sel.dungeonId = dg.id; PN.app.sel.bossId = null; touch(); render();
    },
    'dng.remove': function (v) {
      U.removeById(PN.game.state.design.dungeons, v);
      if (PN.app.sel.dungeonId === v) PN.app.sel.dungeonId = null;
      touch(); render();
    },
    'dng.tier': function (v) {
      var dg = U.byId(PN.game.state.design.dungeons, PN.app.sel.dungeonId);
      if (!dg) return;
      dg.tiers = dg.tiers || [];
      var i = dg.tiers.indexOf(v);
      if (i >= 0) dg.tiers.splice(i, 1); else dg.tiers.push(v);
      touch(); render();
    },
    'dng.boss': function (v) {
      var dg = U.byId(PN.game.state.design.dungeons, PN.app.sel.dungeonId);
      if (!dg) return;
      var i = dg.bosses.indexOf(v);
      if (i >= 0) dg.bosses.splice(i, 1); else dg.bosses.push(v);
      touch(); render();
    },

    /* --------------------------------------------------------- engines */
    'engine.toggle': function (v) {
      var d = PN.game.state.design, e = PN.schema.engineOf(d, v);
      if (e) e.enabled = !e.enabled;
      else d.engines.push(PN.schema.newEngine(v, 60));
      touch(); render();
    },

    /* ------------------------------------------------------------ shop */
    'shop.toggle': function (v) {
      var d = PN.game.state.design, found = null;
      (d.monetisation.shop || []).forEach(function (x) { if (x.catId === v) found = x; });
      if (found) found.enabled = !found.enabled;
      else d.monetisation.shop.push(PN.schema.newShopEntry(v));
      touch(); render();
    },

    /* ------------------------------------------------------- abilities */
    'abl.select': function (v) { PN.app.sel.abilityId = v; render(); },
    'abl.openFromClass': function (v) {
      PN.app.sel.abilityId = v; PN.app.designTab = 'abilities'; render();
    },
    'abl.add': function () {
      var d = PN.game.state.design;
      var ab = PN.abilities.newAbility({ name: 'New Ability ' + ((d.abilities || []).length + 1) });
      d.abilities.push(ab); PN.app.sel.abilityId = ab.id; touch(); render();
    },
    'abl.fromTemplate': function (v) {
      var d = PN.game.state.design;
      var ab = PN.abilities.fromTemplate(d, v);
      d.abilities.push(ab); PN.app.sel.abilityId = ab.id; touch(); render();
    },
    'abl.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.abilities, v);
      d.classes.forEach(function (c) {
        var i = (c.abilities || []).indexOf(v); if (i >= 0) c.abilities.splice(i, 1);
        (c.specs || []).forEach(function (s) {
          var j = (s.abilities || []).indexOf(v); if (j >= 0) s.abilities.splice(j, 1);
        });
      });
      if (PN.app.sel.abilityId === v) PN.app.sel.abilityId = d.abilities.length ? d.abilities[0].id : null;
      touch(); render();
    },
    'abl.addEffect': function (v) {
      var ab = PN.abilities.abilityById(PN.game.state.design, PN.app.sel.abilityId);
      if (!ab) return;
      ab.effects.push(PN.abilities.newEffect(v)); touch(); render();
    },
    'abl.removeEffect': function (v) {
      var ab = PN.abilities.abilityById(PN.game.state.design, PN.app.sel.abilityId);
      if (!ab) return;
      ab.effects.splice(parseInt(v, 10), 1); touch(); render();
    },
    'abl.paramBool': function (v) {
      var ab = PN.abilities.abilityById(PN.game.state.design, PN.app.sel.abilityId);
      if (!ab) return;
      var parts = v.split('|'), e = ab.effects[parseInt(parts[0], 10)];
      if (e) e[parts[1]] = !e[parts[1]];
      touch(); render();
    },

    /* ------------------------------------------------------ stat set -- */
    'stat.addPrimary': function () {
      if (gated('primaries')) return;
      var s = PN.stats.statSetOf(PN.game.state.design);
      s.primaries.push({ id: U.id('pri'), name: 'New Primary', powers: 'attack', roles: ['dps'] });
      touch(); render();
    },
    'stat.removePrimary': function (v) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.primaries.length > 1) s.primaries.splice(parseInt(v, 10), 1);
      touch(); render();
    },
    'stat.addSec': function () {
      if (gated('secondaries')) return;
      var s = PN.stats.statSetOf(PN.game.state.design);
      s.secondaries.push({ id: U.id('sec'), name: 'New Stat', kind: 'crit', ratingPerPct: 35, cap: 50 });
      touch(); render();
    },
    'stat.removeSec': function (v) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      s.secondaries.splice(parseInt(v, 10), 1); touch(); render();
    },

    /* ---------------------------------------------------------- items */
    'item.tab': function (v) { PN.app.itemTab = v; render(); },
    'item.filter': function (v) { PN.app.itemFilter = v; render(); },
    'item.select': function (v) { PN.app.sel.itemId = v; render(); },
    'item.add': function () {
      var d = PN.game.state.design;
      var it = PN.items.newItem({ name: 'New Item', kind: 'gear', slot: 'chest',
        itemLevel: PN.combat.targetItemLevel(d), rarity: 'rare' });
      d.items.push(it); PN.app.sel.itemId = it.id; touch(); render();
    },
    'item.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.items, v);
      if (PN.app.sel.itemId === v) PN.app.sel.itemId = d.items.length ? d.items[0].id : null;
      touch(); render();
    },
    'item.genTier': function () {
      var d = PN.game.state.design;
      ui.modal({
        title: 'Generate a gear tier',
        sub: 'Sixteen slots at once. Every piece stays fully editable afterwards.',
        body: '<div class="grid g2">' +
          '<div class="field"><label><span class="name">Item level</span></label>' +
          '<input type="number" id="genIlvl" value="' + PN.combat.targetItemLevel(d) + '" min="1" max="1000"></div>' +
          '<div class="field"><label><span class="name">Name prefix</span></label>' +
          '<input type="text" id="genPrefix" value="Tier ' + ((d.items || []).filter(function (i) { return i.kind === 'gear'; }).length / 16 + 1 | 0) + '"></div>' +
          '<div class="field"><label><span class="name">Rarity</span></label>' +
          '<select id="genRarity">' + PN.stats.RARITIES.map(function (r) {
            return '<option value="' + r.id + '"' + (r.id === 'epic' ? ' selected' : '') + '>' + r.name + '</option>';
          }).join('') + '</select></div>' +
          '<div class="field"><label><span class="name">Primary stat</span></label>' +
          '<select id="genPrimary">' + PN.stats.statSetOf(d).primaries.map(function (p) {
            return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('') + '</select></div>' +
          '</div>',
        footer: '<button data-act="modal.close">Cancel</button>' +
          '<button class="primary" id="genGo">Generate 16 pieces</button>',
        onMount: function (host) {
          host.querySelector('#genGo').addEventListener('click', function () {
            var made = PN.items.generateGearSet(d, {
              itemLevel: parseInt(host.querySelector('#genIlvl').value, 10) || 60,
              rarity: host.querySelector('#genRarity').value,
              prefix: host.querySelector('#genPrefix').value || 'Tier',
              primary: host.querySelector('#genPrimary').value
            });
            made.forEach(function (m) { d.items.push(m); });
            PN.app.sel.itemId = made.length ? made[0].id : PN.app.sel.itemId;
            ui.closeModal(); touch(); render();
          });
        }
      });
    },
    'item.autoStat': function () {
      var d = PN.game.state.design, it = PN.items.itemById(d, PN.app.sel.itemId);
      if (!it) return;
      var s = PN.stats.statSetOf(d), w = {};
      var cur = U.keys(it.stats || {}).filter(function (k) { return it.stats[k] > 0; });
      if (cur.length) cur.forEach(function (k) { w[k] = it.stats[k]; });
      else {
        w[s.primaries[0].id] = 2.2; w[s.stamina.id] = 1.6;
        if (s.secondaries[0]) w[s.secondaries[0].id] = 1.0;
        var slot = PN.stats.SLOT_BY_ID[it.slot];
        if (slot && slot.armour) w[s.armour.id] = 3.2;
      }
      PN.stats.autoAllocate(d, it, w); touch(); render();
    },
    'item.addEffect': function (v) {
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it) return;
      /* Start with the values this particular effect takes, not a flat
         amount of 500 on everything including the ones that have no
         amount at all. */
      var def = null;
      PN.items.CONSUMABLE_EFFECTS.forEach(function (c) { if (c.id === v) def = c; });
      var e = { type: v };
      if (def) {
        (def.params || []).forEach(function (p) {
          var dv = (def.defaults || {})[p];
          e[p] = dv === undefined ? (p === 'stat' || p === 'lootTableId' ? null : 0) : dv;
        });
      }
      it.effects.push(e); touch(); render();
    },
    'item.removeEffect': function (v) {
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it) return;
      it.effects.splice(parseInt(v, 10), 1); touch(); render();
    },

    /* ----------------------------------------------------- loot tables */
    'loot.select': function (v) { PN.app.sel.lootId = v; render(); },
    'loot.add': function () {
      var d = PN.game.state.design;
      var t = PN.items.newLootTable({ name: 'Loot Table ' + ((d.lootTables || []).length + 1) });
      d.lootTables.push(t); PN.app.sel.lootId = t.id; touch(); render();
    },
    'loot.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.lootTables, v);
      if (PN.app.sel.lootId === v) PN.app.sel.lootId = d.lootTables.length ? d.lootTables[0].id : null;
      touch(); render();
    },
    'loot.addEntryGo': function () {
      var d = PN.game.state.design, t = PN.items.lootById(d, PN.app.sel.lootId);
      if (!t) return;
      var picker = document.querySelector('[data-act="loot.addEntry"]');
      var itemId = picker ? picker.value : (d.items[0] && d.items[0].id);
      if (!itemId) return;
      t.entries.push({ itemId: itemId, weight: 20, qtyMin: 1, qtyMax: 1 });
      touch(); render();
    },
    'loot.removeEntry': function (v) {
      var t = PN.items.lootById(PN.game.state.design, PN.app.sel.lootId);
      if (!t) return;
      t.entries.splice(parseInt(v, 10), 1); touch(); render();
    },

    /* --------------------------------------------------------- rewards */
    'reward.select': function (v) { PN.app.sel.rewardId = v; render(); },
    'reward.add': function () {
      var d = PN.game.state.design;
      var r = PN.items.newReward({ name: 'Reward ' + ((d.rewards || []).length + 1) });
      d.rewards.push(r); PN.app.sel.rewardId = r.id; touch(); render();
    },
    'reward.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.rewards, v);
      if (PN.app.sel.rewardId === v) PN.app.sel.rewardId = d.rewards.length ? d.rewards[0].id : null;
      touch(); render();
    },
    'reward.addItem': function () {
      var d = PN.game.state.design, r = PN.items.rewardById(d, PN.app.sel.rewardId);
      if (!r) return;
      var picker = document.querySelector('[data-act="reward.pickItem"]');
      var itemId = picker ? picker.value : (d.items[0] && d.items[0].id);
      if (!itemId) return;
      r.items.push({ itemId: itemId, qty: 1, chance: 1 }); touch(); render();
    },
    'reward.removeItem': function (v) {
      var r = PN.items.rewardById(PN.game.state.design, PN.app.sel.rewardId);
      if (!r) return;
      r.items.splice(parseInt(v, 10), 1); touch(); render();
    },

    /* ------------------------------------------- class <-> ability ---- */
    'cls.assign': function (v) {
      var c = U.byId(PN.game.state.design.classes, PN.app.sel.classId);
      if (!c) return;
      if (c.abilities.indexOf(v) < 0) c.abilities.push(v);
      touch(); render();
    },
    'cls.unassign': function (v) {
      var c = U.byId(PN.game.state.design.classes, PN.app.sel.classId);
      if (!c) return;
      var i = c.abilities.indexOf(v); if (i >= 0) c.abilities.splice(i, 1);
      touch(); render();
    },
    'cls.addTemplate': function (v) {
      var d = PN.game.state.design;
      var c = U.byId(d.classes, PN.app.sel.classId);
      if (!c) return;
      var ab = PN.abilities.fromTemplate(d, v, { classId: c.id });
      d.abilities.push(ab); c.abilities.push(ab.id);
      touch(); render();
    },

    /* ----------------------------------------------------------- world */
    'world.tab': function (v) { PN.app.worldTab = v; render(); },
    'quest.filter': function (v) { PN.app.questZone = v; render(); },

    'zone.populate': function () {
      var d = PN.game.state.design;
      var z = U.byId(d.zones, PN.app.sel.zoneId);
      if (!z) return;
      ui.modal({
        title: 'Generate content for ' + z.name,
        sub: 'Monsters, questgivers, quests, loot tables and reward bundles. Everything stays editable.',
        body: '<div class="grid g2">' +
          '<div class="field"><label><span class="name">Monsters</span></label>' +
          '<input type="number" id="genMobs" value="6" min="0" max="30"></div>' +
          '<div class="field"><label><span class="name">Questgivers</span></label>' +
          '<input type="number" id="genGivers" value="3" min="0" max="12"></div>' +
          '<div class="field"><label><span class="name">Quests</span></label>' +
          '<input type="number" id="genQuests" value="10" min="0" max="40"></div>' +
          '<div class="field"><label><span class="name">Voiced</span></label>' +
          '<select id="genVoiced"><option value="0">No</option><option value="1">Yes</option></select></div>' +
          '</div>',
        footer: '<button data-act="modal.close">Cancel</button>' +
          '<button class="primary" id="genGo">Generate</button>',
        onMount: function (host) {
          host.querySelector('#genGo').addEventListener('click', function () {
            PN.world.applyGenerated(d, PN.world.generateZoneContent(d, z, {
              seed: Math.floor(Math.random() * 1e9),
              monsters: parseInt(host.querySelector('#genMobs').value, 10) || 0,
              givers: parseInt(host.querySelector('#genGivers').value, 10) || 0,
              quests: parseInt(host.querySelector('#genQuests').value, 10) || 0,
              voiced: host.querySelector('#genVoiced').value === '1'
            }));
            ui.closeModal(); touch(); render();
          });
        }
      });
    },

    'monster.select': function (v) { PN.app.sel.monsterId = v; render(); },
    'monster.open': function (v) {
      PN.app.sel.monsterId = v; PN.app.worldTab = 'monsters'; render();
    },
    'monster.add': function () {
      var d = PN.game.state.design;
      var m = PN.world.newMonster({ name: 'New Monster', zoneId: PN.app.sel.zoneId || null });
      d.monsters.push(m); PN.app.sel.monsterId = m.id; touch(); render();
    },
    'monster.addTo': function () {
      var d = PN.game.state.design;
      var z = U.byId(d.zones, PN.app.sel.zoneId);
      var m = PN.world.newMonster({ name: 'New Monster', zoneId: z ? z.id : null,
        level: z ? z.levelHi : 10 });
      d.monsters.push(m); PN.app.sel.monsterId = m.id;
      PN.app.worldTab = 'monsters'; touch(); render();
    },
    'monster.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.monsters, v);
      (d.quests || []).forEach(function (q) {
        (q.objectives || []).forEach(function (o) { if (o.targetId === v) o.targetId = null; });
      });
      if (PN.app.sel.monsterId === v) PN.app.sel.monsterId = null;
      touch(); render();
    },

    'giver.select': function (v) { PN.app.sel.giverId = v; render(); },
    'giver.open': function (v) { PN.app.sel.giverId = v; PN.app.worldTab = 'givers'; render(); },
    'giver.add': function () {
      var d = PN.game.state.design;
      var g = PN.world.newQuestgiver({ name: 'New Questgiver', zoneId: PN.app.sel.zoneId || null });
      d.questgivers.push(g); PN.app.sel.giverId = g.id; touch(); render();
    },
    'giver.addTo': function () {
      var d = PN.game.state.design;
      var g = PN.world.newQuestgiver({ name: 'New Questgiver', zoneId: PN.app.sel.zoneId || null });
      d.questgivers.push(g); PN.app.sel.giverId = g.id;
      PN.app.worldTab = 'givers'; touch(); render();
    },
    'giver.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.questgivers, v);
      (d.quests || []).forEach(function (q) { if (q.giverId === v) q.giverId = null; });
      if (PN.app.sel.giverId === v) PN.app.sel.giverId = null;
      touch(); render();
    },

    'quest.select': function (v) { PN.app.sel.questId = v; render(); },
    'quest.open': function (v) { PN.app.sel.questId = v; PN.app.worldTab = 'quests'; render(); },
    'quest.add': function () {
      var d = PN.game.state.design;
      var q = PN.world.newQuest({ name: 'New Quest', zoneId: PN.app.sel.zoneId || null });
      d.quests.push(q); PN.app.sel.questId = q.id; touch(); render();
    },
    'quest.addTo': function () {
      var d = PN.game.state.design;
      var z = U.byId(d.zones, PN.app.sel.zoneId);
      var givers = z ? PN.world.giversIn(d, z.id) : [];
      var q = PN.world.newQuest({ name: 'New Quest', zoneId: z ? z.id : null,
        level: z ? Math.round((z.levelLo + z.levelHi) / 2) : 10,
        giverId: givers.length ? givers[0].id : null });
      d.quests.push(q); PN.app.sel.questId = q.id;
      PN.app.worldTab = 'quests'; touch(); render();
    },
    'quest.addForGiver': function () {
      var d = PN.game.state.design;
      var g = PN.world.giverById(d, PN.app.sel.giverId);
      if (!g) return;
      var z = U.byId(d.zones, g.zoneId);
      var q = PN.world.newQuest({ name: 'New Quest', zoneId: g.zoneId, giverId: g.id,
        level: z ? Math.round((z.levelLo + z.levelHi) / 2) : 10 });
      d.quests.push(q); PN.app.sel.questId = q.id;
      PN.app.worldTab = 'quests'; touch(); render();
    },
    'quest.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.quests, v);
      if (PN.app.sel.questId === v) PN.app.sel.questId = null;
      touch(); render();
    },
    'quest.addObj': function () {
      var q = PN.world.questById(PN.game.state.design, PN.app.sel.questId);
      if (!q) return;
      q.objectives.push({ kind: 'kill', targetId: null, count: PN.world.DEFAULT_OBJECTIVE_COUNT });
      touch(); render();
    },
    'quest.removeObj': function (v) {
      var q = PN.world.questById(PN.game.state.design, PN.app.sel.questId);
      if (!q) return;
      q.objectives.splice(parseInt(v, 10), 1); touch(); render();
    },
    'quest.newReward': function () {
      var d = PN.game.state.design;
      var q = PN.world.questById(d, PN.app.sel.questId);
      if (!q) return;
      var gold = null;
      (d.items || []).forEach(function (i) { if (!gold && i.kind === 'currency') gold = i; });
      var r = PN.items.newReward({
        name: 'Reward: ' + q.name,
        xp: Math.round(Math.pow(Math.max(1, q.level), 1.75) * 12),
        currencies: gold ? (function () { var o = {}; o[gold.id] = q.level * 6 + 20; return o; })() : {}
      });
      d.rewards.push(r); q.rewardId = r.id; touch(); render();
    },

    'line.open': function (v) {
      PN.app.sel.questlineId = v; PN.app.sel.chainId = null; render();
    },

    /* ------------------------------------------------------------- PvE */
    'dng.open': function (v) {
      PN.app.sel.dungeonId = v; PN.app.sel.bossId = null;
      PN.app.designTab = 'encounters'; render();
    },
    'boss.addTo': function () {
      var d = PN.game.state.design;
      var dg = U.byId(d.dungeons, PN.app.sel.dungeonId);
      if (!dg) return;
      var b = PN.schema.newBoss('New Boss', { dungeonId: dg.id,
        order: PN.schema.bossesIn(d, dg).length });
      d.bosses.push(b); PN.app.sel.bossId = b.id; touch(); render();
    },

    /* ------------------------------------------------------------- PvP */
    'map.select': function (v) { PN.app.sel.mapId = v; render(); },
    'map.add': function () {
      if (gated('arenas')) return;
      var d = PN.game.state.design;
      if (!d.pvpMaps) d.pvpMaps = [];
      var m = PN.pvp.newMap('New Arena ' + (d.pvpMaps.length + 1));
      d.pvpMaps.push(m); PN.app.sel.mapId = m.id; touch(); render();
    },
    'map.remove': function (v) {
      var d = PN.game.state.design;
      U.removeById(d.pvpMaps, v);
      if (PN.app.sel.mapId === v) PN.app.sel.mapId = null;
      touch(); render();
    },
    'cls.openFromPvp': function (v) {
      /* The id is a class id or a branch id depending on the system - the
         section is the same slot either way. */
      goTo('classes', { sel: PN.talents.isTalentMode(PN.game.state.design)
        ? { branchId: v } : { classId: v } });
    },

    /* ------------------------------------------------------ battle pass */
    'pass.page': function (v) { PN.app.passPage = parseInt(v, 10) || 0; render(); },
    'pass.addTier': function () {
      var bp = PN.game.state.design.monetisation.battlePass;
      bp.tiers = bp.tiers || [];
      bp.tiers.push(PN.schema.newPassTier(bp.tiers.length + 1, {}));
      touch(); render();
    },
    'pass.clear': function () {
      PN.game.state.design.monetisation.battlePass.tiers = [];
      touch(); render();
    },
    'pass.generate': function () {
      var d = PN.game.state.design;
      var bp = d.monetisation.battlePass;
      bp.tiers = [];
      var gold = null;
      (d.items || []).forEach(function (i) { if (!gold && i.kind === 'currency') gold = i; });
      var cosmetics = (d.items || []).filter(function (i) {
        return i.kind === 'cosmetic' || i.kind === 'mount';
      });
      for (var t = 1; t <= 30; t++) {
        var free = null;
        if (t % 4 === 0 && gold) {
          free = PN.items.newReward({ name: 'Pass free tier ' + t,
            currencies: (function () { var o = {}; o[gold.id] = 250; return o; })() });
          d.rewards.push(free);
        }
        var prem = PN.items.newReward({ name: 'Pass premium tier ' + t,
          xp: 200 * t,
          items: (t % 5 === 0 && cosmetics.length)
            ? [{ itemId: cosmetics[t % cosmetics.length].id, qty: 1, chance: 1 }] : [],
          currencies: gold ? (function () { var o = {}; o[gold.id] = 150; return o; })() : {} });
        d.rewards.push(prem);
        bp.tiers.push(PN.schema.newPassTier(t, {
          freeRewardId: free ? free.id : null, premiumRewardId: prem.id }));
      }
      touch(); render();
    },

    /* ----------------------------------------------- reward chain extras */
    'chain.autoRewards': function () {
      var d = PN.game.state.design;
      var c = U.byId(d.rewardChains, PN.app.sel.chainId);
      if (!c) return;
      (c.steps || []).forEach(function (s, i) {
        if (s.rewardId) return;
        var r = PN.items.newReward({ name: c.name + ' - ' + s.label,
          xp: 2000 * (i + 1) });
        d.rewards.push(r); s.rewardId = r.id;
      });
      touch(); render();
    },

    /* ---------------------------------------------------- player inspector */
    'player.open': function (v) { PN.viewsSim.playerModal(parseInt(v, 10)); },
    'player.random': function () {
      var st = PN.game.state;
      if (!st.agents.length) return;
      var a = st.agents[Math.floor(Math.random() * st.agents.length)];
      PN.viewsSim.playerModal(a.id);
    },
    'guild.open': function (v) { PN.viewsSim.guildModal(v); },
    'player.filter': function (v) { PN.app.playerFilter = v; render(); },
    /* Follow one player. They stay on the roster from now on, they are
       pinned to the top of the Players screen, and the community feed
       tells you if they quit. */
    'player.fav': function (v) {
      var st = PN.game.state;
      var id = parseInt(v, 10);
      if (!st.favourites) st.favourites = {};
      if (st.favourites[id]) delete st.favourites[id];
      else st.favourites[id] = 1;
      touch();
      /* The star can be pressed from inside the character sheet, so
         redraw that too rather than leaving a stale one open. */
      if (document.querySelector('.modalwrap')) PN.viewsSim.playerModal(id);
      render();
    },
    'ladder.tab': function (v) { PN.app.ladderTab = v; render(); },
    /* --------------------------------------------------------- presets */
    'splash.mode': function (v) { PN.app.splashMode = v; showSplash(); },
    'splash.year': function (v) {
      PN.app.newStudio.year = parseInt(v, 10) || 2004; showSplash();
    },
    'splash.reroll': function () {
      PN.app.newStudio.name = suggestStudioName(); showSplash();
    },
    'splash.found': function () { foundStudio(PN.app.newStudio); },
    'splash.preset': function (v) { startGame(PN.presets.build(v)); },
    'splash.blank': function () { startGame(PN.schema.newDesign('Untitled Online')); },
    'splash.import': function () { importDesign(); },
  };


  /* Research caps what the design may hold. An editor that offers a
     button and then silently does nothing is worse than one that says
     why, so every gated action routes through here and the refusal
     lands in the notice bar with the reason. */
  function gated(what) {
    var st = PN.game.state;
    if (!st || !st.design) return false;
    if (PN.research.canAdd(st, st.design, what)) return false;
    flash(PN.research.blockedReason(st, st.design, what), true);
    return true;
  }
  function touch() {
    var st = PN.game.state;
    st.dirty = (st.dirty || 0) + 1;
    assignToPlan(st);
    invalidate();
  }

  /* Which release the thing you just changed is FOR. The rule itself
     lives in PN.patches, where it can be tested; this is only the
     screen keeping up with it. */
  function assignToPlan(st) {
    var plan = PN.patches.assign(st, PN.app.sel.planId);
    if (plan) PN.app.sel.planId = plan.id;
  }

  /* Whichever release the studio is building is the one you are
     authoring when a game opens: the front of the queue. */
  function selectFrontPlan(st) {
    if (!st || st.phase !== 'live' || !PN.app.sel) return;
    var front = PN.patches.plansInOrder(st)[0];
    PN.app.sel.planId = front ? front.id : null;
    if (front) PN.patches.mountPlan(st, front.id);
  }

  /* Move the draft to a different release on the board.

     Everything the editors bind to is `state.design`, so switching
     which release you are authoring is switching what that object is:
     the game as it will stand when this release ships. Pass nothing to
     author no release at all, which shows the whole roadmap played out
     and makes the next change plan something new. */
  function selectPlan(id) {
    var st = PN.game.state;
    var P = PN.patches;
    var plan = id ? P.planById(st, id) : null;
    if (plan && plan.status !== 'planned') plan = null;
    PN.app.sel.planId = plan ? plan.id : null;
    if (st && st.phase === 'live') P.mountPlan(st, plan ? plan.id : null);
    invalidate();
  }

  /* Range inputs inside editors that carry data-act rather than data-bind. */
  var RANGE_ACTIONS = {
    /* ----------------------------------------------------- patch planning */
    /* -------------------------------------------------------- crafting -- */
    'recipe.inputItem': function (v, val) {
      var r = PN.crafting.recipeById(PN.game.state.design, PN.app.sel.recipeId);
      if (r && r.inputs[v]) r.inputs[v].itemId = val || null;
    },
    'recipe.inputQty': function (v, val) {
      var r = PN.crafting.recipeById(PN.game.state.design, PN.app.sel.recipeId);
      if (r && r.inputs[v]) r.inputs[v].qty = Math.max(1, parseInt(val, 10) || 1);
    },
    'patch.launchNotes': function (v, val) { PN.app.launchNotes = val; },
    'patch.notes': function (v, val) {
      var plan = PN.patches.planById(PN.game.state, v);
      if (plan) plan.notes = val;
    },
    'title.alloc': function (v, val) {
      PN.titles.setAllocation(PN.game.state, v, parseFloat(val) || 0);
    },
    /* How hard one of your money sinks pulls. This lived in the CLICK
       table, which a slider never reaches - so repairs, the auction cut
       and housing all drew a handle that could not be moved. */
    'sink.rate': function (v, val) {
      var s = U.byId(PN.currency.sinks(PN.game.state.design), v);
      if (s) s.rate = U.clamp(parseFloat(val) || 0, 0, 100);
    },
    /* Experience written as a share of a level, which is the unit
       anybody writing a quest is actually thinking in. */
    'reward.xpShare': function (v, val) {
      var d = PN.game.state.design;
      var r = PN.items.rewardById(d, v);
      if (!r) return;
      var lv = PN.viewsCombat.referenceLevel(d, r);
      r.xp = Math.round(PN.agents.xpForLevel(d, lv) * (parseFloat(val) || 0) / 100);
    },
    'tal.nodeKind': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (!n) return;
      n.kind = val;
      /* A node only ever carries the payload its kind uses. */
      if (val !== 'ability') n.abilityId = null;
      if (val !== 'stat') n.statId = null;
      if (val === 'passive' && !n.passiveId) n.passiveId = 'damage';
      /* dispatcher renders */
    },
    'tal.nodeAbility': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (!n) return;
      n.abilityId = val || null;
      /* Naming a node after the button it gives is what players expect. */
      var ab = val ? PN.abilities.abilityById(PN.game.state.design, val) : null;
      if (ab && /^(New Talent|Talent \d+)$/.test(n.name)) n.name = ab.name;
      /* dispatcher renders */
    },
    'tal.nodeStat': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.statId = val || null;
    },
    'tal.nodePassive': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.passiveId = val;
    },
    /* ------------------------------------------------------ talent nodes */
    'tal.nodeName': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.name = val;
    },
    'tal.nodeMag': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.magnitude = U.clamp(parseFloat(val) || 0, 0, 100);
    },
    'tal.nodeRanks': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.ranks = Math.max(1, parseInt(val, 10) || 1);
    },
    'tal.nodeCost': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.cost = Math.max(1, parseInt(val, 10) || 1);
    },
    'tal.nodeTier': function (v, val) {
      var n = PN.talents.nodeById(PN.game.state.design, v);
      if (n) n.tier = Math.max(1, parseInt(val, 10) || 1);
    },
    'engine.invest': function (v, val) {
      var e = PN.schema.engineOf(PN.game.state.design, v);
      if (e) e.investment = parseInt(val, 10);
    },
    'shop.prom': function (v, val) {
      (PN.game.state.design.monetisation.shop || []).forEach(function (x) {
        if (x.catId === v) x.prominence = parseInt(val, 10);
      });
    },
    'chain.mag': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].magnitude = parseInt(val, 10);
    },
    'chain.gate': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].gateWeeks = parseInt(val, 10);
    },
    'chain.label': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].label = val;
    },
    'chain.kind': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].kind = val;
    },
    'boss.damage': function (v, val) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (b && b.phases[v]) b.phases[v].damage = parseInt(val, 10);
    },
    'boss.at': function (v, val) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (b && b.phases[v]) b.phases[v].at = parseInt(val, 10);
    },
    'boss.phaseName': function (v, val) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (b && b.phases[v]) b.phases[v].name = val;
    },
    'boss.trigger': function (v, val) {
      var b = U.byId(PN.game.state.design.bosses, PN.app.sel.bossId);
      if (b && b.phases[v]) b.phases[v].trigger = val;
    },
    /* ------------------------------------------------ quest objectives - */
    'quest.objKind': function (v, val) {
      var q = PN.world.questById(PN.game.state.design, PN.app.sel.questId);
      if (!q || !q.objectives[v]) return;
      var o = q.objectives[v];
      o.kind = val;
      o.targetId = null;
      /* Countable beats get the house baseline; one-shot beats lose the
         count entirely rather than carrying a meaningless 10 around. */
      var def = PN.world.OBJECTIVE_BY_ID[val];
      if (def && def.countable) o.count = o.count || PN.world.DEFAULT_OBJECTIVE_COUNT;
      else delete o.count;
    },
    'quest.objTarget': function (v, val) {
      var q = PN.world.questById(PN.game.state.design, PN.app.sel.questId);
      if (q && q.objectives[v]) q.objectives[v].targetId = val || null;
    },
    'quest.objCount': function (v, val) {
      var q = PN.world.questById(PN.game.state.design, PN.app.sel.questId);
      if (q && q.objectives[v]) q.objectives[v].count = Math.max(1, parseInt(val, 10) || 1);
    },

    /* ------------------------------------------------- chain stages ---- */
    'chain.req': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].requirement = val;
    },
    'chain.reward': function (v, val) {
      var c = U.byId(PN.game.state.design.rewardChains, PN.app.sel.chainId);
      if (c && c.steps[v]) c.steps[v].rewardId = val || null;
    },

    /* ------------------------------------------------- battle pass ----- */
    'pass.reward': function (v, val) {
      var parts = String(v).split('|');
      var bp = PN.game.state.design.monetisation.battlePass;
      var t = (bp.tiers || [])[parseInt(parts[0], 10)];
      if (!t) return;
      if (parts[1] === 'free') t.freeRewardId = val || null;
      else t.premiumRewardId = val || null;
    },

    /* ---------------------------------------------- ability effects --- */
    'abl.param': function (v, val) {
      var ab = PN.abilities.abilityById(PN.game.state.design, PN.app.sel.abilityId);
      if (!ab) return;
      var parts = v.split('|'), e = ab.effects[parseInt(parts[0], 10)];
      if (!e) return;
      var def = PN.abilities.EFFECT_BY_ID[e.type];
      var pdef = null;
      if (def) def.params.forEach(function (pp) { if (pp.k === parts[1]) pdef = pp; });
      e[parts[1]] = pdef && pdef.type === 'num' ? parseFloat(val) : val;
    },
    /* ------------------------------------------------------ stat set -- */
    'stat.primaryName': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.primaries[v]) s.primaries[v].name = val;
    },
    'stat.primaryPower': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.primaries[v]) s.primaries[v].powers = val;
    },
    'stat.secName': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.secondaries[v]) s.secondaries[v].name = val;
    },
    'stat.secKind': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.secondaries[v]) s.secondaries[v].kind = val;
    },
    'stat.secRating': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.secondaries[v]) s.secondaries[v].ratingPerPct = parseInt(val, 10);
    },
    'stat.secCap': function (v, val) {
      var s = PN.stats.statSetOf(PN.game.state.design);
      if (s.secondaries[v]) s.secondaries[v].cap = parseInt(val, 10);
    },

    /* ---------------------------------------------------------- items */
    'item.stat': function (v, val) {
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it) return;
      it.stats = it.stats || {};
      var n = parseInt(val, 10) || 0;
      if (n <= 0) delete it.stats[v]; else it.stats[v] = n;
    },
    /* One handler for every numeric parameter an effect declares. */
    'item.effectParam': function (v, val) {
      var parts = String(v).split('|');
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it || !it.effects[parts[0]]) return;
      it.effects[parts[0]][parts[1]] = Math.max(0, parseFloat(val) || 0);
      touch();
    },
    'item.effectStat': function (v, val) {
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it || !it.effects[v]) return;
      it.effects[v].stat = val || null; touch(); render();
    },
    'item.effectLoot': function (v, val) {
      var it = PN.items.itemById(PN.game.state.design, PN.app.sel.itemId);
      if (!it || !it.effects[v]) return;
      it.effects[v].lootTableId = val || null; touch(); render();
    },

    /* ----------------------------------------------------- loot tables */
    'loot.weight': function (v, val) {
      var t = PN.items.lootById(PN.game.state.design, PN.app.sel.lootId);
      if (t && t.entries[v]) t.entries[v].weight = parseInt(val, 10) || 1;
    },
    'loot.qtyMin': function (v, val) {
      var t = PN.items.lootById(PN.game.state.design, PN.app.sel.lootId);
      if (t && t.entries[v]) t.entries[v].qtyMin = Math.max(1, parseInt(val, 10) || 1);
    },
    'loot.qtyMax': function (v, val) {
      var t = PN.items.lootById(PN.game.state.design, PN.app.sel.lootId);
      if (t && t.entries[v]) t.entries[v].qtyMax = Math.max(1, parseInt(val, 10) || 1);
    },

    /* --------------------------------------------------------- rewards */
    'reward.qty': function (v, val) {
      var r = PN.items.rewardById(PN.game.state.design, PN.app.sel.rewardId);
      if (r && r.items[v]) r.items[v].qty = Math.max(1, parseInt(val, 10) || 1);
    },
    'reward.chance': function (v, val) {
      var r = PN.items.rewardById(PN.game.state.design, PN.app.sel.rewardId);
      if (r && r.items[v]) r.items[v].chance = U.clamp01((parseInt(val, 10) || 100) / 100);
    },
    'reward.currency': function (v, val) {
      var r = PN.items.rewardById(PN.game.state.design, PN.app.sel.rewardId);
      if (!r) return;
      r.currencies = r.currencies || {};
      var n = parseInt(val, 10) || 0;
      if (n <= 0) delete r.currencies[v]; else r.currencies[v] = n;
    },

    /* Reassigning an ability to a different class. */
    'classAssign': function (v, val) {
      var d = PN.game.state.design, abId = PN.app.sel.abilityId;
      if (!abId) return;
      d.classes.forEach(function (c) {
        var i = (c.abilities || []).indexOf(abId);
        if (i >= 0) c.abilities.splice(i, 1);
      });
      var target = U.byId(d.classes, val);
      if (target) target.abilities.push(abId);
      var ab = PN.abilities.abilityById(d, abId);
      if (ab) ab.classId = target ? target.id : null;
    }
  };
  /* ========================================================= GAME LOOP

     The simulation is weekly - balance, economy, churn and the rest are
     all computed a week at a time, and that is the right grain for them.
     But a week is a big jump to watch, and watching is most of the point
     of having built the thing.

     So the clock runs in DAYS. Six days out of seven are presentation:
     the world advances an hour at a time, players move between zones and
     activities, and you can see it happening. On the seventh the real
     week is simulated and everything lands at once. Pause, 1x, 2x and 4x
     are how fast the days go by; 4x is roughly the old Auto speed.   */

  var SPEEDS = [
    { id: 0, name: 'Pause', ico: '‖', ms: 0 },
    { id: 1, name: '1x', ico: '▶', ms: 620 },
    { id: 2, name: '2x', ico: '▶▶', ms: 300 },
    { id: 4, name: '4x', ico: '▶▶▶', ms: 130 }
  ];
  var DAYS_PER_WEEK = 7;
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function speedDef(id) {
    for (var i = 0; i < SPEEDS.length; i++) if (SPEEDS[i].id === id) return SPEEDS[i];
    return SPEEDS[0];
  }

  function setSpeed(id) {
    PN.app.speedId = id;
    PN.app.autoplay = id > 0;
    clearTimeout(PN.app.timer);
    if (id > 0) tickLoop();
    render();
  }

  /* One day. Six of them are the world being watched; the seventh runs
     the week the rest of the game is built on. */
  function stepDay() {
    var st = PN.game.state;
    if (!st || st.phase === 'dead') return;
    PN.app.day = (PN.app.day || 0) + 1;
    if (PN.app.day < DAYS_PER_WEEK) {
      /* A day inside the week: nothing is decided, but the world moves
         and the live view has something to show. */
      PN.world3d.tickDay(st, PN.app.day);
      render();
      return;
    }
    PN.app.day = 0;
    step();
  }

  function step() {
    var st = PN.game.state;
    if (st.phase === 'dead') return;
    PN.sim.advance(st);
    PN.world3d.onWeek(st);
    invalidate();

    if (st.studio.cash < -2000000 && st.phase === 'live') {
      st.phase = 'dead';
      setSpeed(0);
      PN.state.log(st, 'alert', 'The studio has run out of money', 'The servers go dark at the end of the month.');
    }
    /* Stop the clock when something needs a human. */
    if (st.pendingEvents.length && PN.app.autoplay) {
      PN.app.speedId = 0;
      PN.app.autoplay = false;
      clearTimeout(PN.app.timer);
    }
    render();
  }

  /* Skip the presentation and land on the next week boundary. */
  function stepWeek() {
    PN.app.day = 0;
    step();
  }

  function tickLoop() {
    if (!PN.app.autoplay) return;
    stepDay();
    if (PN.app.autoplay) {
      PN.app.timer = setTimeout(tickLoop, speedDef(PN.app.speedId).ms);
    }
  }


  function doLaunch(force) {
    var st = PN.game.state;
    var r = PN.sim.launch(st, { force: force });
    invalidate();
    if (r.ok) {
      ui.modal({
        title: st.design.meta.name + ' is live',
        sub: 'Launched at ' + U.fmtPct(r.completion * 100) + ' of planned scope',
        body: '<div class="grid g2" style="margin-bottom:14px">' +
          ui.stat('Review score', Math.round(r.review), null, ui.scoreClass(r.review)) +
          ui.stat('Awareness', U.fmtPct(st.runtime.awareness, 0)) + '</div>' +
          '<div class="small muted" style="line-height:1.7">Reviews are sticky. They will gate how many people ' +
          'even try your game for years, long after you have fixed whatever they were complaining about.<br><br>' +
          'From here, everything you author in the Design Studio is a <b>draft</b> until you build it and ship it ' +
          'as a patch.</div>'
      });
    }
    render();
  }

  /* Chips on the event editor toggle membership of one of its lists.
     The value arrives as 'eventId|thingId'. */
  function toggleEventList(v, key) {
    var parts = String(v).split('|');
    var ev = PN.gameEvents.eventById(PN.game.state.design, parts[0]);
    if (!ev) return;
    var list = ev[key] || (ev[key] = []);
    var i = list.indexOf(parts[1]);
    if (i >= 0) list.splice(i, 1); else list.push(parts[1]);
    /* Dropping a zone drops whatever lived only in it. */
    if (key === 'zoneIds') {
      var d = PN.game.state.design;
      ev.monsterIds = (ev.monsterIds || []).filter(function (id) {
        var m = U.byId(d.monsters || [], id);
        return m && ev.zoneIds.indexOf(m.zoneId) >= 0; });
      ev.questIds = (ev.questIds || []).filter(function (id) {
        var q = U.byId(d.quests || [], id);
        return q && ev.zoneIds.indexOf(q.zoneId) >= 0; });
    }
    touch(); render();
  }

  function doShip(force) {
    var st = PN.game.state;
    var r = PN.sim.ship(st, { force: force });
    invalidate();
    if (!r.ok) alert(r.reason);
    render();
  }

  /* ============================================================= SAVES */

  /* Agents carry a lot of per-tick derived state that never needs
     saving. Stripping it roughly halves the save.

     Every title keeps its own roster, and those were being written out
     fat while only the mounted one got slimmed - which on a two-thousand
     player save was nearly four megabytes of derived numbers nobody
     ever reads back.                                                */
  function slimAgents(list) {
    return (list || []).map(PN.agents.slim);
  }
  function serialise(state) {
    var slim = {};
    U.keys(state).forEach(function (k) { if (k !== 'agents' && k !== 'titles') slim[k] = state[k]; });
    slim.agents = slimAgents(state.agents);
    slim.titles = (state.titles || []).map(function (t) {
      var copy = {};
      U.keys(t).forEach(function (k) { if (k !== 'agents') copy[k] = t[k]; });
      copy.agents = slimAgents(t.agents);
      return copy;
    });
    return JSON.stringify(slim);
  }

  /* The save the page was opened with, read once at boot. Storage is
     asynchronous now, and the splash screen is not. */
  var savedRaw = null;

  function save() {
    var json;
    try { json = serialise(PN.game.state); }
    catch (e) { return flash('Could not prepare the save: ' + e.message, true); }
    savedRaw = json;
    PN.store.set(SAVE_KEY, json, function (r) {
      if (r.ok) {
        flash('Saved. (' + U.fmtBytes(r.bytes) + ', ' +
          (r.backend === 'indexeddb' ? 'browser database' : 'browser storage') + ')');
        PN.app.storage = null;
        return;
      }
      if (r.quota || r.backend === 'localstorage') {
        flash('This game is ' + U.fmtBytes(r.bytes) + ' and will not fit in ' +
          'the browser\'s small store. Open Studio > Storage to move it.', true);
      } else {
        flash('Could not save: ' + (r.reason || 'unknown error'), true);
      }
    });
  }
  function load() {
    if (!savedRaw) return null;
    try { return JSON.parse(savedRaw); } catch (e) { return null; }
  }

  /* What the storage panel reads. Recomputed rather than cached, because
     a save that has doubled in size is exactly what you want to see. */
  function refreshStorage() {
    PN.store.estimate(function (info) {
      info.backend = PN.store.backend();
      try { info.saveBytes = PN.game.state ? serialise(PN.game.state).length : 0; }
      catch (e) { info.saveBytes = 0; }
      PN.app.storage = info;
      if (PN.game.state && PN.app.view === 'studio') render();
    });
  }

  /* ------------------------------------------------- saves as a file --

     A save lives in the browser's own database now, which is exactly
     where you want it and exactly the wrong place to get it out of.
     These two put it on disk and take it back, so a game can be backed
     up, moved between machines and browsers, or handed to somebody who
     needs to look at what went wrong.                                */
  function downloadSave() {
    var st = PN.game.state;
    if (!st) return flash('No game to export.', true);
    var json;
    try { json = serialise(st); }
    catch (e) { return flash('Could not prepare the save: ' + e.message, true); }
    var name = ((st.design && st.design.meta && st.design.meta.name) || 'patchnotes')
      .replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var file = name + '-w' + (st.week || 0) + '.pnsave.json';
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = file;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      flash('Saved to ' + file + ' (' + U.fmtBytes(json.length) + ')');
    } catch (e) {
      flash('This browser would not write the file: ' + e.message, true);
    }
  }

  function uploadSave() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || '');
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) { return flash('That file is not a Patch Notes save.', true); }
        if (!parsed || !parsed.design || parsed.week === undefined) {
          return flash('That looks like a design, not a save. Use Import design.', true);
        }
        if (PN.game.state && !confirm('Load this save? The game you have open will be replaced.')) return;
        savedRaw = raw;
        PN.store.set(SAVE_KEY, raw, function () {});
        resumeFrom(parsed);
        flash('Loaded ' + f.name + ' (' + U.fmtBytes(raw.length) + ')');
      };
      reader.onerror = function () { flash('Could not read that file.', true); };
      reader.readAsText(f);
    });
    input.click();
  }

  function exportDesign() {
    var d = PN.game.state.design;
    var json = JSON.stringify(d, null, 2);
    ui.modal({
      title: 'Export design',
      sub: 'This is your entire MMO as plain JSON. Copy it, share it, paste it back in.',
      body: '<textarea style="width:100%;height:340px;font-family:var(--mono);font-size:11px">' +
        esc(json) + '</textarea>',
      footer: '<button data-act="modal.close">Close</button>'
    });
  }

  function importDesign() {
    ui.modal({
      title: 'Import design',
      sub: 'Paste an exported design JSON.',
      body: '<textarea id="importbox" style="width:100%;height:300px;font-family:var(--mono);font-size:11px" ' +
        'placeholder="Paste design JSON here..."></textarea>',
      footer: '<button data-act="modal.close">Cancel</button>' +
        '<button class="primary" id="importgo">Start with this design</button>',
      onMount: function (host) {
        host.querySelector('#importgo').addEventListener('click', function () {
          try {
            var d = JSON.parse(host.querySelector('#importbox').value);
            if (!d || !d.identity || !d.progression) throw new Error('That does not look like a Patch Notes design.');
            ui.closeModal();
            startGame(d);
          } catch (e) { alert('Could not read that design: ' + e.message); }
        });
      }
    });
  }

  var flashEl = null;
  function flash(msg, bad) {
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);' +
        'background:var(--panel-3);border:1px solid var(--line);border-radius:8px;padding:9px 16px;' +
        'font-size:13px;z-index:400;box-shadow:0 10px 30px rgba(0,0,0,.5)';
      document.body.appendChild(flashEl);
    }
    flashEl.textContent = msg;
    flashEl.style.color = bad ? 'var(--bad)' : 'var(--text)';
    flashEl.style.display = 'block';
    clearTimeout(flashEl._t);
    flashEl._t = setTimeout(function () { flashEl.style.display = 'none'; }, 1900);
  }

  /* ============================================================ SPLASH */

  /* ============================================================== SPLASH

     You found a studio, not a game. Name it, pick the year to start in -
     which is the difficulty setting, and a real one - and then decide
     what to build once you are inside.                              */

  var STUDIO_NAME_A = ['Keystone', 'Northlight', 'Ironvale', 'Redshift', 'Greyfall',
                       'Bluecrown', 'Anvil', 'Farsight', 'Lanternhouse', 'Tidewake',
                       'Copperfield', 'Halcyon', 'Meridian', 'Blackpine', 'Quicksilver'];
  var STUDIO_NAME_B = ['Interactive', 'Studios', 'Games', 'Entertainment', 'Digital',
                       'Works', 'Collective', 'Softworks', 'Labs', 'Foundry'];

  function suggestStudioName() {
    var rng = new U.Rng(Math.floor(Math.random() * 1e9));
    return rng.pick(STUDIO_NAME_A) + ' ' + rng.pick(STUDIO_NAME_B);
  }

  /* ================================================== THE FRONT PAGE

     This is the first screen anybody sees, and for a long time it was a
     paragraph of grey text with six identical boxes under it. Every
     decision on it is interesting - which decade you start in IS the
     difficulty, and the difficulty is the game - and none of that was
     visible. The difficulty word sat in eight-point type in the corner
     of a card. A returning player's save was a naked button wedged
     above a tab strip.

     So it is built around the three things somebody arrives wanting:
     carry on where I left off, start a studio, or take over a game
     that already exists. Everything else is support for one of those. */

  /* The timeline is the shape of the decision: it is literally a year
     axis, so it is drawn as one. */
  function difficultyTone(word) {
    switch (word) {
      case 'Forgiving': return 'good';
      case 'Fair': return 'good';
      case 'Demanding': return 'warn';
      case 'Hard': return 'warn';
      default: return 'bad';           /* Punishing, Brutal */
    }
  }

  function heroPitch() {
    return '<div class="pitchrow">' +
      '<div class="pitch"><b>You write the game.</b>Abilities, quests, loot tables, ' +
      'boss phases, the price of a bag. Not buildings - systems.</div>' +
      '<div class="pitch"><b>Then it gets played.</b>A few thousand simulated people ' +
      'level up, chase gear, get bored, and tell each other about it.</div>' +
      '<div class="pitch"><b>And they answer back.</b>Balance, burnout, rivals, the ' +
      'economy and your own staff all have opinions about what you shipped.</div>' +
      '</div>';
  }

  function showSplash() {
    clearTimeout(PN.app.timer);
    PN.app.autoplay = false;
    var saved = load();
    var mode = PN.app.splashMode || 'found';
    if (!PN.app.newStudio) {
      PN.app.newStudio = { name: suggestStudioName(), year: 2004 };
    }
    var ns = PN.app.newStudio;

    /* ---------------------------------------------------- the timeline */
    var yearCards = PN.state.START_YEARS.map(function (y) {
      var era = PN.tax.eraForYear(y.year);
      var on = ns.year === y.year;
      return '<button class="yearcard' + (on ? ' on' : '') +
        '" data-act="splash.year" data-val="' + y.year + '">' +
        '<span class="tick"></span>' +
        '<span class="yr">' + y.year + '</span>' +
        '<span class="nm">' + esc(era.name) + '</span>' +
        '<span class="diff ' + difficultyTone(y.difficulty) + '">' + esc(y.difficulty) + '</span>' +
        '</button>';
    }).join('');

    var yd = PN.state.startYearFor(ns.year);
    var era = PN.tax.eraForYear(ns.year);
    var pool = PN.tax.marketPool ? PN.tax.marketPool(era) : 0;

    /* What picking that year actually costs and buys, at full size
       rather than as a footnote. */
    var eraPanel =
      '<div class="erahead">' +
        '<div class="eh-l">' +
          '<div class="eh-yr">' + ns.year + '</div>' +
          '<div><div class="eh-nm">' + esc(era.name) + '</div>' +
          '<div class="eh-lb">' + esc(yd.label) + '</div></div>' +
        '</div>' +
        '<div class="eh-diff ' + difficultyTone(yd.difficulty) + '">' +
          esc(yd.difficulty) + '</div>' +
      '</div>' +
      '<div class="erastats">' +
        '<div class="es"><span class="k">In the bank</span><b>' + U.fmtMoney(yd.cash) + '</b></div>' +
        '<div class="es"><span class="k">On the payroll</span><b>' + yd.staff + '</b></div>' +
        '<div class="es"><span class="k">Until the publisher asks</span><b>' +
          (Math.round(yd.deadline / 52 * 10) / 10) + ' yrs</b></div>' +
        (pool ? '<div class="es"><span class="k">People who play MMOs</span><b>' +
          U.fmtCompact(pool) + '</b></div>' : '') +
      '</div>' +
      '<div class="erasw">' +
        '<div class="sw good"><i>&#9650;</i><span>' + esc(yd.good) + '</span></div>' +
        '<div class="sw bad"><i>&#9660;</i><span>' + esc(yd.bad) + '</span></div>' +
      '</div>' +
      '<div class="eranote">' + esc(era.note) + '</div>';

    var foundBody =
      '<div class="timeline">' + yearCards + '</div>' +
      '<div class="timehint">The year you start in is the difficulty, and it is a real one: ' +
      'it sets how big the market is, what players forgive, how normal free-to-play is, ' +
      'and how much it costs to look competent.</div>' +
      '<div class="erapanel">' + eraPanel + '</div>' +
      '<div class="namerow">' +
        '<label class="namefield"><span>Studio name</span>' +
        '<input type="text" id="studioname" value="' + esc(ns.name) + '" maxlength="40" ' +
        'spellcheck="false" autocomplete="off"></label>' +
        '<button class="reroll" data-act="splash.reroll" title="Suggest another">&#8635;</button>' +
        '<button class="go" data-act="splash.found">Found the studio &rarr;</button>' +
      '</div>' +
      '<div class="gohint">Nothing is in production yet. You decide what to build once you ' +
      'are inside, and you can change any of it afterwards.</div>';

    /* -------------------------------------------- or a finished game */
    var presetCards = PN.presets.PRESETS.map(function (pr) {
      return '<button class="presetcard" data-act="splash.preset" data-val="' + pr.id + '">' +
        '<span class="era">' + pr.era + ' &middot; ' +
          esc(PN.tax.eraForYear(pr.era).name) + '</span>' +
        '<span class="nm">' + esc(pr.name) + '</span>' +
        (pr.label ? '<span class="kind">' + esc(pr.label) +
          (pr.inspired ? ' &middot; after ' + esc(pr.inspired) : '') + '</span>' : '') +
        '<span class="bl">' + esc(pr.blurb) + '</span>' +
        '<span class="sw good">&#9650; ' + esc(pr.strength) + '</span>' +
        '<span class="sw bad">&#9660; ' + esc(pr.weakness) + '</span>' +
        '</button>';
    }).join('');

    var sandboxBody =
      '<div class="timehint" style="margin-top:0">Skip the studio and take over a game that ' +
      'already ships. Every one of these is a real design with a real weakness in it, and ' +
      'every part of it is yours to change.</div>' +
      '<div class="presetgrid">' + presetCards + '</div>' +
      '<div class="altrow">' +
        '<button data-act="splash.blank">Start from a blank design</button>' +
        '<button data-act="splash.import">Import a design file</button>' +
      '</div>';

    /* ------------------------------------------------------- assemble */
    var el = document.getElementById('splash');
    el.style.display = 'block';
    el.innerHTML =
      '<div class="sky"><i></i><i></i><i></i></div>' +
      '<div class="inner">' +
      '<header class="mast">' +
        '<div class="lock">' +
          '<h1>Patch<span>Notes</span></h1>' +
          '<div class="tag">An MMORPG design and management tycoon</div>' +
        '</div>' +
      '</header>' +
      heroPitch() +
      (saved
        ? '<button class="resume" id="continuebtn">' +
          '<span class="ri">&#9654;</span>' +
          '<span class="rt"><b>Continue</b><i>' + esc(savedLabel(saved)) + '</i></span>' +
          '<span class="rk">Enter</span>' +
          '</button>'
        : '') +
      '<div class="modes">' +
        '<button class="modecard' + (mode === 'found' ? ' on' : '') +
          '" data-act="splash.mode" data-val="found">' +
          '<span class="mt">Found a studio</span>' +
          '<span class="ms">Six people, a deadline and an empty design document.</span>' +
        '</button>' +
        '<button class="modecard' + (mode === 'sandbox' ? ' on' : '') +
          '" data-act="splash.mode" data-val="sandbox">' +
          '<span class="mt">Take over a finished MMO</span>' +
          '<span class="ms">A game that already ships, with players and problems.</span>' +
        '</button>' +
      '</div>' +
      '<div class="modebody">' + (mode === 'sandbox' ? sandboxBody : foundBody) + '</div>' +
      '<footer class="splashfoot">Everything is simulated locally. Nothing is uploaded, ' +
      'and your save lives in this browser until you export it.</footer>' +
      '</div>';

    if (mode === 'found') {
      var input = document.getElementById('studioname');
      if (input) {
        input.addEventListener('input', function () { ns.name = input.value; });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { ns.name = input.value; ACTIONS['splash.found'](); }
        });
      }
    }

    if (saved) {
      document.getElementById('continuebtn').addEventListener('click', function () {
        resumeFrom(saved);
      });
      /* Enter anywhere but the name field carries on where you were,
         which is what a returning player came here to do. */
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.id !== 'studioname') resumeFrom(saved);
      });
    }
  }

  /* Mount a state that came from anywhere - the store, or a file. */
  function resumeFrom(state) {
    PN.game.state = migrate(state);
    /* The draft on screen is one release's design, so opening a save
       has to say which - the one at the front of the roadmap, because
       that is the one the studio is building this week. */
    selectFrontPlan(PN.game.state);
    var el = document.getElementById('splash');
    if (el) el.style.display = 'none';
    PN.app.storage = null;
    invalidate(); render();
  }

  function savedLabel(s) {
    var studio = (s.studio && s.studio.name) || 'a studio';
    var titles = (s.titles || []).length;
    if (!titles) return studio + ', week ' + s.week + ', nothing in production';
    var nm = (s.titles[0].titleName) || (s.titles[0].design && s.titles[0].design.meta.name) || 'untitled';
    return studio + ' — ' + nm + (titles > 1 ? ' +' + (titles - 1) + ' more' : '') +
           ', week ' + s.week;
  }

  /* Old saves were a single game living directly on the state. Fold them
     into a one-title portfolio rather than throwing them away. */
  function migrate(s) {
    if (!s.titles) {
      var t = PN.titles.newTitle({ design: s.design, name: s.design.meta.name });
      PN.titles.TITLE_FIELDS.forEach(function (k) {
        if (s[k] !== undefined) t[k] = s[k];
      });
      t.titleName = s.design.meta.name;
      t.design = s.design;
      t.shipped = s.shipped || null;
      t.progress = (s.studio && s.studio.progress) || t.progress;
      t.version = s.version && s.version.major !== undefined ? s.version : { major: 1, minor: 0, patch: 0 };
      s.titles = [t];
      s.activeTitleId = t.id;
      PN.titles.mount(s, t.id);
    }
    (s.titles || []).forEach(function (t) {
      if (!t.patchPlan) t.patchPlan = [];
      if (!t.released) t.released = [];
      if (!t.automate) t.automate = { enabled: false, cadenceWeeks: 8, ambition: 50, notes: true };
      if (!t.version || t.version.major === undefined) t.version = { major: 1, minor: 0, patch: 0 };
      if (t.allocation === undefined) t.allocation = 100;
    });
    if (!s.agents) s.agents = [];
    if (!s.guilds) s.guilds = [];
    if (!s.favourites) s.favourites = {};
    /* A save writes the mounted game TWICE - once as state.design,
       state.agents, state.patchPlan and the rest, and once inside its
       title record - and JSON hands them back as two separate copies
       of what is one game in memory. The sim reads the state's copy
       and anything walking the portfolio reads the record's, so a
       repair applied to one leaves the other broken: every player in
       the stored roster looked like a clash with themselves, and a
       release repaired on the record was not the release the roadmap
       was showing. Put them back together before anything reads one. */
    if (s.activeTitleId) {
      var act = U.byId(s.titles || [], s.activeTitleId);
      if (act) PN.titles.TITLE_FIELDS.forEach(function (k) {
        if (s[k] !== undefined) act[k] = s[k];
        else if (act[k] !== undefined) s[k] = act[k];
      });
    }
    /* Player ids used to restart at one every time the page opened, so
       any save of a decent age is carrying two different people under
       the same number. Repair them before anything reads one. */
    PN.agents.ensureIds(s);

    /* Bags carry inventory now, and a design written before they did
       has none - so applying the rule as written would empty every
       player's bags in a live game the moment it was opened. An
       existing game keeps the carrying space it has always had, as a
       SETTING you can see and lower rather than as content nobody
       authored. New designs start at zero, where bags matter. */
    (s.titles || []).forEach(function (t) {
      var d = t.design;
      if (!d || !d.gearing || d.gearing.backpackSlots !== undefined) return;
      var hasBags = (d.items || []).some(function (i) { return i.kind === 'container'; });
      d.gearing.backpackSlots = hasBags ? 0 : 16;
      if (t.shipped && t.shipped.gearing) {
        t.shipped.gearing.backpackSlots = d.gearing.backpackSlots;
      }
    });
    if (s.design && s.design.gearing && s.design.gearing.backpackSlots === undefined) {
      var anyBags = (s.design.items || []).some(function (i) { return i.kind === 'container'; });
      s.design.gearing.backpackSlots = anyBags ? 0 : 16;
      if (s.shipped && s.shipped.gearing) {
        s.shipped.gearing.backpackSlots = s.design.gearing.backpackSlots;
      }
    }
    /* And everybody already playing gets whatever a new character would
       turn up with, so a live roster is not suddenly holding nothing. */
    (s.agents || []).forEach(function (a) {
      if (!a.bags) a.bags = PN.agents.starterBagsFor(s.shipped || s.design);
    });

    /* A bag written when containers opened loot tables still carries
       the effects and the table it used to open. It is not a thing you
       use any more - it is a thing you carry - so the leftovers come
       off and it gets the two numbers a bag actually has. */
    [s.design].concat((s.titles || []).map(function (t) { return t.design; }),
                      [s.shipped], (s.titles || []).map(function (t) { return t.shipped; }))
      .forEach(function (dd) {
        if (!dd || !dd.items) return;
        dd.items.forEach(function (i) {
          if (i.kind !== 'container') return;
          if (i.effects && i.effects.length) i.effects = [];
          i.lootTableId = null;
          if (i.slots === undefined) i.slots = 8;
          if (i.maxCarried === undefined) i.maxCarried = 4;
        });
      });
    if (s.population && !s.population.cohorts.length) PN.pop.ensureCohorts(s);

    /* Research arrived after these saves were written. A game already in
       progress was built without any of these caps, so gating it now
       would retroactively make half of it illegal. Existing saves start
       with everything unlocked; new studios start at the beginning. */
    if (s.studio && !s.studio.research) {
      PN.research.unlockAll(s);
      s.studio.research.allocation = 20;
      s.studio.research.grandfathered = true;
    }
    /* Staff predate traits, notice periods and the rest of the card. */
    (s.studio && s.studio.staff ? s.studio.staff : []).forEach(function (st) {
      if (!st.traits) st.traits = [];
      if (st.noticeWeeks === undefined) st.noticeWeeks = 0;
      if (st.hiredWeek === undefined) st.hiredWeek = Math.max(0, (s.week || 0) - (st.weeks || 0));
      if (st.delivered === undefined) st.delivered = 0;
      if (st.shipped === undefined) st.shipped = 0;
      if (!st.from) st.from = 'another studio';
    });
    /* Patch plans used to carry a content intent that generated things.
       Drop it: what a release contains is now read off the design. */
    (s.titles || []).forEach(function (t) {
      (t.patchPlan || []).forEach(function (p) {
        if (p.content) delete p.content;
        if (p.feature) delete p.feature;
        if (p.tuningOnly === undefined) p.tuningOnly = false;
      });
    });

    /* A release holds its own changes and its own banked work now, so
       a save that predates that has to be adopted into it. The rule is
       in PN.patches, where it is tested against real saves. */
    (s.titles || []).forEach(function (t) { PN.patches.adopt(t, s.week); });
    /* Rings and trinkets are authored as one slot now, not two. An item
       written for the second finger is the same item as one written for
       the first, so fold them together - the character still wears two. */
    (s.titles || []).forEach(function (t) {
      var designs = [t.design, t.shipped];
      designs.forEach(function (d2) {
        if (!d2) return;
        (d2.items || []).forEach(function (it) {
          if (it.slot === 'ring1' || it.slot === 'ring2') it.slot = 'ring';
          else if (it.slot === 'trinket1' || it.slot === 'trinket2') it.slot = 'trinket';
        });
      });
    });
    /* A season ends in a bundle and a match rolls a table. Both used
       to be bundles, so a save carries a per-match REWARD where a loot
       table belongs. Turn it into one: the same items, at the same
       value, as a chance rather than a guarantee. */
    (s.titles || []).forEach(function (t) {
      [t.design, t.shipped].forEach(function (d) {
        if (!d || !d.pvp || d.pvp.matchLootId) return;
        var old = d.pvp.vendorRewardId ? U.byId(d.rewards || [], d.pvp.vendorRewardId) : null;
        delete d.pvp.vendorRewardId;
        if (!old) return;
        var entries = (old.items || []).map(function (e) {
          return { itemId: e.itemId, weight: Math.max(1, Math.round((e.chance || 1) * 60)),
                   qtyMin: e.qty || 1, qtyMax: e.qty || 1 };
        });
        U.keys(old.currencies || {}).forEach(function (cid) {
          var q = old.currencies[cid];
          entries.push({ itemId: cid, weight: 70,
                         qtyMin: Math.max(1, Math.round(q * 0.6)),
                         qtyMax: Math.max(1, Math.round(q * 1.5)) });
        });
        if (!entries.length) return;
        var table = PN.items.newLootTable({ name: old.name + ' (match spoils)',
          rolls: 1, dropChance: 82, entries: entries });
        (d.lootTables || (d.lootTables = [])).push(table);
        d.pvp.matchLootId = table.id;
      });
    });
    /* Hiring takes time in some decades, and a search is a real thing
       on the books. */
    if (s.studio && !s.studio.openings) s.studio.openings = [];

    /* Races are new, and a save written before them has no field for
       them. An empty list is a game without races, which is exactly
       what those saves are. Every design in the state needs it, not
       just the mounted one. */
    function ensureRaces(d) { if (d && !d.races) d.races = []; }
    ensureRaces(s.design);
    ensureRaces(s.shipped);
    (s.titles || []).forEach(function (t) {
      ensureRaces(t.design); ensureRaces(t.shipped);
      (t.released || []).forEach(function (r) { ensureRaces(r.design); });
    });
    (s.released || []).forEach(function (r) { ensureRaces(r.design); });

    if (!s.portfolio) s.portfolio = PN.titles.portfolio(s);
    return s;
  }

  /* Found the studio and drop the player into it with nothing built. */
  function foundStudio(opts) {
    var st = PN.state.newStudio({
      studio: (opts.name || 'New Studio').trim() || 'New Studio',
      year: opts.year || 2004
    });
    PN.game.state = st;
    PN.competitors.init(st);
    st.scenario = { id: 'sandbox', free: true };
    PN.app.view = 'studio';
    PN.app.navOpen = 'run';
    PN.app.sel = blankSel();
    document.getElementById('splash').style.display = 'none';
    invalidate(); render();
  }

  function blankSel() {
    return {
      classId: null, branchId: null, abilityId: null, itemId: null, zoneId: null,
      dungeonId: null, mapId: null, expansionId: null, bossId: null,
      questlineId: null, chainId: null, monsterId: null, giverId: null,
      questId: null, lootId: null, rewardId: null, planId: null, titleId: null,
      nodeId: null, recipeId: null
    };
  }

  function startGame(design, scenarioId) {
    var st = PN.state.newGame({ design: design });
    PN.pop.ensureCohorts(st);
    PN.game.state = st;
    PN.competitors.init(st);
    PN.expansions.initLapsed(st);
    PN.economy.init(st);

    /* A scenario sets the starting position and the bar to clear. */
    var sc = scenarioId && PN.scenarios.BY_ID[scenarioId];
    if (sc) {
      try { sc.setup(st); }
      catch (e) { if (typeof console !== 'undefined') console.error('scenario setup', e); }
    } else {
      st.scenario = { id: 'sandbox', free: true };
    }

    PN.app.view = 'dashboard';
    PN.app.designTab = 'identity';
    PN.app.worldTab = 'zones';
    PN.app.itemTab = 'items';
    PN.app.sel = U.merge(blankSel(), {
      classId: design.classes.length ? design.classes[0].id : null,
      abilityId: design.abilities && design.abilities.length ? design.abilities[0].id : null,
      itemId: design.items && design.items.length ? design.items[0].id : null,
      zoneId: design.zones && design.zones.length ? design.zones[0].id : null,
      dungeonId: design.dungeons && design.dungeons.length ? design.dungeons[0].id : null,
      mapId: design.pvpMaps && design.pvpMaps.length ? design.pvpMaps[0].id : null
    });
    document.getElementById('splash').style.display = 'none';
    invalidate(); render();
  }


  /* ========================================================== TOOLTIPS */

  function tipFor(spec) {
    var parts = spec.split(':'), kind = parts[0], id = parts[1];
    if (kind === 'ability') {
      var a = PN.prim.ABILITY_BY_ID[id]; if (!a) return '';
      var stats = [['Complexity', a.cx], ['Ceiling', a.ceil], ['Floor', a.floor]];
      var power = U.keys(a.p).filter(function (k) { return a.p[k] > 0; })
        .map(function (k) { return U.titleCase(k) + ' ' + a.p[k]; }).join(' · ');
      return '<div class="th">' + esc(a.name) + '</div>' +
        '<div style="color:var(--dim);margin-bottom:7px">' + esc(a.desc) + '</div>' +
        stats.map(function (s) {
          return '<div class="tr2"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>'; }).join('') +
        (power ? '<div style="margin-top:6px;color:var(--faint);font-size:11px">' + esc(power) + '</div>' : '');
    }
    if (kind === 'mech') {
      var m = PN.prim.MECHANIC_BY_ID[id]; if (!m) return '';
      return '<div class="th">' + esc(m.name) + '</div>' +
        '<div style="color:var(--dim);margin-bottom:7px">' + esc(m.desc) + '</div>' +
        [['Difficulty', m.diff], ['Coordination', m.coord], ['Execution', m.exec],
         ['Gear check', m.gear], ['Spectacle', m.spec], ['Frustration', m.frust]]
        .map(function (s) { return '<div class="tr2"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>'; }).join('');
    }
    if (kind === 'objective') {
      var q = PN.world.OBJECTIVE_BY_ID[id]; if (!q) return '';
      return '<div class="th">' + esc(q.name) + '</div>' +
        '<div style="color:var(--dim);margin-bottom:7px">' + esc(q.desc) + '</div>' +
        '<div class="tr2"><span>Content</span><b>' + U.round(q.hours, 2) + ' h ' +
          (q.countable ? 'each' : 'flat') + '</b></div>' +
        '<div class="tr2"><span>Joy</span><b>' + q.joy + '/10</b></div>';
    }
    return '';
  }

  /* ============================================================== WIRE */

  function init() {
    var root = document.body;

    /* One delegated click handler for every action in the game. */
    root.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== root) {
        if (t.getAttribute) {
          var act = t.getAttribute('data-act');
          if (act && ACTIONS[act] && t.tagName !== 'INPUT' && t.tagName !== 'SELECT') {
            e.preventDefault();
            ACTIONS[act](t.getAttribute('data-val'));
            return;
          }
          /* Toggles bind directly. */
          if (t.classList && t.classList.contains('toggle') && t.getAttribute('data-bind')) {
            var path = t.getAttribute('data-bind');
            var cur = resolveBind(path);
            if (cur) { applyBind(path, 'bool', !cur.obj[cur.key]); render(); }
            return;
          }
        }
        t = t.parentNode;
      }
    });

    /* Live value readouts while dragging, full re-render on release. */
    root.addEventListener('input', function (e) {
      var el = e.target;
      if (!el.getAttribute) return;
      var bind = el.getAttribute('data-bind');
      if (bind && (el.type === 'range' || el.classList.contains('valnum'))) {
        applyBind(bind, 'num', el.value);
        /* Keep the slider and its number box showing the same thing while
           the user is still dragging or typing. A full re-render waits
           for the change event so typing does not steal focus.        */
        var field = el.closest ? el.closest('.field') : null;
        if (field) {
          var range = field.querySelector('input[type=range]');
          var num = field.querySelector('.valnum');
          if (el.type === 'range' && num) num.value = el.step && parseFloat(el.step) < 1
            ? U.round(parseFloat(el.value), 2) : Math.round(parseFloat(el.value));
          if (el !== range && range && el.value !== '') range.value = el.value;
          var old = field.querySelector('.val');
          if (old) old.textContent = el.value;
        }
        return;
      }
      var act = el.getAttribute('data-act');
      if (act && RANGE_ACTIONS[act]) {
        RANGE_ACTIONS[act](el.getAttribute('data-val'), el.value);
        touch();
        /* Mirror the value into whichever half of the pair the user is
           not currently touching, without re-rendering under them. */
        var row = el.closest ? el.closest('.rowact') : null;
        if (row) {
          var r2 = row.querySelector('input[type=range]');
          var n2 = row.querySelector('.valnum');
          if (el === r2 && n2) n2.value = el.value;
          else if (el === n2 && r2 && el.value !== '') r2.value = el.value;
        } else {
          var sib = el.nextElementSibling;
          if (sib && sib.classList.contains('mono')) sib.textContent = el.value;
        }
      }
    });

    root.addEventListener('change', function (e) {
      var el = e.target;
      if (!el.getAttribute) return;
      var bind = el.getAttribute('data-bind');
      if (bind) {
        applyBind(bind, el.getAttribute('data-kind') || 'str',
          el.type === 'checkbox' ? el.checked : el.value);
        render();
        return;
      }
      var act = el.getAttribute('data-act');
      if (act && RANGE_ACTIONS[act]) {
        RANGE_ACTIONS[act](el.getAttribute('data-val'), el.value);
        touch(); render();
      }
    });

    /* Tooltips. */
    root.addEventListener('mouseover', function (e) {
      var t = e.target;
      if (!t.getAttribute) return;
      var spec = t.getAttribute('data-tip');
      if (spec) {
        var html = tipFor(spec);
        if (html) ui.showTip(html, e.clientX, e.clientY);
      }
    });
    root.addEventListener('mouseout', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-tip')) ui.hideTip();
    });

    /* Keyboard. */
    document.addEventListener('keydown', function (e) {
      if (!PN.game.state) return;
      /* Quick find has to work from anywhere, including out of a text
         field - that is the whole point of it. */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); openFind(); return;
      }
      var typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
                   e.target.tagName === 'SELECT';
      if (e.key === 'Escape') { ui.closeModal(); return; }
      if (typing) return;
      if (e.key === ' ') { e.preventDefault(); step(); }
      else if (e.key === '/') { e.preventDefault(); openFind(); }
      else if (e.key === '!') { openProblems(); }
      else if (e.key >= '1' && e.key <= '8') {
        var ids = ['dashboard', 'telemetry', 'players', 'economy', 'community', 'studio', 'market', 'design'];
        goTo(ids[parseInt(e.key, 10) - 1]);
      }
    });

    /* Reading the save is asynchronous now, so the splash waits for it
       rather than deciding there is nothing to continue. */
    var splashEl = document.getElementById('splash');
    if (splashEl) {
      /* The same block layout the front page itself uses - it is one
         screen, and the first frame of it should not be a different
         one. */
      splashEl.style.display = 'block';
      splashEl.innerHTML = '<div class="sky"><i></i><i></i><i></i></div>' +
        '<div class="inner"><header class="mast"><div class="lock">' +
        '<h1>Patch<span>Notes</span></h1>' +
        '<div class="tag">Opening your saves…</div>' +
        '</div></header></div>';
    }
    PN.store.get(SAVE_KEY, function (raw) {
      savedRaw = raw || null;
      showSplash();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  PN.appApi = { render: render, step: step, startGame: startGame, showSplash: showSplash };
})(PN);
