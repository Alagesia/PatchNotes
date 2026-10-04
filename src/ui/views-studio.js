/* Patch Notes - the studio, the portfolio, and the roadmap.

   The three screens that exist before any game does. A studio with no
   title has a name, a bank balance and a team, and exactly one useful
   button: greenlight something.                                      */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, T = PN.titles, P = PN.patches;

  function S() { return PN.game.state; }

  /* =============================================================== names */

  var TITLE_A = ['Aether', 'Ember', 'Frost', 'Iron', 'Star', 'Storm', 'Sun', 'Moon',
                 'Thorn', 'Tide', 'Dusk', 'Dawn', 'Grave', 'Wyrm', 'Rune', 'Shadow'];
  var TITLE_B = ['fall', 'reach', 'bound', 'gate', 'spire', 'hollow', 'mark', 'wake',
                 'crown', 'song', 'forge', 'watch', 'rift', 'haven'];
  var TITLE_C = ['Online', 'Online', 'Online', ': Ascension', ': Legends', ': Reborn',
                 ' Chronicles', ' Saga', ''];
  function suggestTitleName() {
    var rng = new U.Rng(Math.floor(Math.random() * 1e9));
    return rng.pick(TITLE_A) + rng.pick(TITLE_B) + rng.pick(TITLE_C);
  }

  /* ============================================================== STUDIO */

  /* --------------------------------------------------------- storage --

     A finished game is megabytes. The browser keeps two drawers: a small
     one every page gets (about 5MB, and no permission makes it bigger)
     and a large one it hands out from the disk. This panel says which
     one your save is in, how big the save has got, and lets you ask the
     browser not to throw it away.                                    */
  function storagePanel() {
    var info = PN.app.storage || null;
    var body;
    if (!info) {
      body = ui.empty('Checking storage...', 'One moment.');
    } else {
      var quota = info.quota || 0, usage = info.usage || 0;
      var save = info.saveBytes || 0;
      var small = PN.store.LIMITS.localStorage;
      var big = info.backend === 'indexeddb';
      body = '<div class="grid g3">'
        + ui.stat('This save', U.fmtBytes(save),
            save > small ? 'too big for the small drawer' : 'comfortable',
            save > small && !big ? 'bad' : '')
        + ui.stat('Room here', quota ? U.fmtBytes(quota) : 'unknown',
            big ? 'browser database' : 'small store only')
        + ui.stat('Kept safe', info.persisted ? 'Yes' : 'Not yet',
            info.persisted ? 'will not be evicted' : 'can be cleared',
            info.persisted ? 'good' : '')
        + '</div>'
        + '<div class="bar" style="margin-top:11px"><i style="width:'
        + (quota ? U.clamp01(usage / quota) * 100 : 0).toFixed(2) + '%"></i></div>'
        + '<div class="tiny faint" style="margin-top:5px">'
        + U.fmtBytes(usage) + ' used of ' + (quota ? U.fmtBytes(quota) : 'an unknown amount')
        + '</div>';

      if (!big) {
        body += '<div class="chip bad" style="margin-top:12px">Saves are going to the '
          + 'small store, which caps out near ' + U.fmtBytes(small) + '. A game this size '
          + 'will not fit. Opening the page over http rather than from a file usually '
          + 'lets the browser open the larger database.</div>';
      }
      if (!info.persisted) {
        body += '<div class="tiny faint" style="margin-top:12px;line-height:1.6">'
          + 'Browsers reclaim page storage when the disk fills up. Asking to keep it '
          + 'does not make the drawer bigger - it stops anything emptying it.</div>'
          + '<div class="row" style="margin-top:9px">'
          + '<button class="primary sm" data-act="storage.persist">Keep my saves on this device</button>'
          + '</div>';
      }
      body += '<div class="tiny faint" style="margin-top:12px;line-height:1.6">'
        + 'Your design is always exportable as plain JSON, whatever happens to the save.</div>'
        + '<div class="row" style="margin-top:9px">'
        + '<button class="sm" data-act="game.save">Save now</button>'
        + '<button class="sm ghost" data-act="game.export">Export design</button>'
        + '</div>';
    }
    return ui.panel('Storage', body,
      { hint: info ? (info.backend === 'indexeddb' ? 'browser database'
              : info.backend === 'localstorage' ? 'small store' : 'unavailable') : '' });
  }

  function marketMood() {
    var st = S();
    var era = st.era || {};
    return '<div class="tiny faint" style="line-height:1.65">'
      + '<b style="color:var(--text)">' + esc(era.name || '') + '</b> &middot; '
      + esc(era.note || '') + '</div>'
      + '<div class="grid g2" style="margin-top:11px">'
      + ui.stat('Market', U.fmtCompact(PN.tax.poolFor(S())), 'players looking')
      + ui.stat('Expectation', Math.round(era.expectation || 0), 'production value')
      + ui.stat('Grind tolerance', U.round(era.toleranceGrind || 1, 2) + '×')
      + ui.stat('F2P is normal', U.fmtPct((era.f2pNorm || 0) * 100, 0))
      + '</div>';
  }

  /* ------------------------------------------------------------- staff --

     Hiring, firing and crunch. This is the only place in the game where
     you spend money on people rather than on content, and it is the lever
     behind every other number: capacity, quality, and how many games you
     can run at once.                                                   */

  /* One card per person. A table row tells you a name and five numbers;
     a card tells you who somebody is, what they are good at, whether
     they are about to walk, and what you can do about it. */

  function moraleWord(m) {
    return m >= 78 ? 'thriving' : m >= 62 ? 'happy' : m >= 45 ? 'coping'
         : m >= 30 ? 'unhappy' : 'miserable';
  }
  function burnWord(b) {
    return b >= 70 ? 'burnt out' : b >= 50 ? 'running hot' : b >= 28 ? 'tired' : 'rested';
  }
  function senWord(s) {
    return s >= 0.8 ? 'Principal' : s >= 0.6 ? 'Senior' : s >= 0.38 ? 'Mid' : 'Junior';
  }
  /* Capitalise a sentence, not every word in it: "Burnt out and
     underpaid", never "Burnt Out And Underpaid". */
  function sentence(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ============================================================ THE STUDIO

     What was wrong with this screen, specifically:

       - seven identical stat tiles spent the entire first viewport
         conveying seven numbers, so nothing you could act on was on
         screen until you scrolled;
       - every panel carried the same weight, so a crunch slider looked
         exactly as important as twenty-five people;
       - the two-column split put the roster in the NARROW column and
         Hire in the other one, which is the one action the roster is
         about - you read a summary, fell into a long list of cramped
         cards, then scrolled back up to find the button;
       - each of those cards packed a name, a role, trait chips, two
         labelled bars, two rows of uppercase micro-labels, a line of
         flavour and two buttons into about a hundred and eighty
         pixels, so nothing in it was legible at a glance;
       - and there was no way to scan: no sort, no grouping, no way to
         answer "who is about to quit" without reading all of them.

     So: a vitals strip that reads in one line, the roster as a dense
     sortable table with the detail behind a click, and Hire beside the
     thing it changes. Nothing has been dropped - the card's contents
     are all still here, in the row it belongs to or the drawer under
     it.                                                              */

  /* Which pool a role mostly feeds, which is how a games studio is
     actually organised. The ones that feed no pool at all are still a
     discipline - they multiply everybody else. */
  function disciplineOf(role) {
    if ((role.effect || {}).throughput) return 'production';
    var best = null, bestV = 0;
    U.keys(role.pools || {}).forEach(function (k) {
      if (role.pools[k] > bestV) { bestV = role.pools[k]; best = k; }
    });
    return best || 'production';
  }
  var DISCIPLINES = [
    { id: 'design', name: 'Design', colour: 'var(--accent)' },
    { id: 'art', name: 'Art', colour: 'var(--pink)' },
    { id: 'eng', name: 'Engineering', colour: 'var(--teal)' },
    { id: 'qa', name: 'QA', colour: 'var(--warn)' },
    { id: 'production', name: 'Production & Live', colour: 'var(--purple)' }
  ];
  var DISC_BY_ID = {};
  DISCIPLINES.forEach(function (d) { DISC_BY_ID[d.id] = d; });

  /* What one person actually adds to the week, after morale, burnout,
     their traits, and whether they have one foot out of the door. */
  function outputOf(s) {
    var leaving = s.noticeWeeks > 0;
    var moraleMult = 0.55 + (s.morale / 100) * 0.62;
    var burnMult = 1 - (s.burnout / 100) * 0.45;
    return s.skill * moraleMult * burnMult * PN.state.traitOutput(s) * (leaving ? 0.55 : 1);
  }
  function contribOf(s) {
    var role = PN.state.ROLE_BY_ID[s.role] || { pools: {} };
    var out = outputOf(s), total = 0;
    U.keys(role.pools || {}).forEach(function (p) { total += role.pools[p] * out; });
    return total;
  }
  function marketRate(s) {
    var role = PN.state.ROLE_BY_ID[s.role] || { salary: 0 };
    return Math.round(role.salary * (0.65 + s.seniority * 0.95));
  }

  /* ------------------------------------------------------------ vitals

     The numbers you steer by, in one band rather than seven tiles. */
  function vitals() {
    var st = S();
    var pf = T.portfolio(st);
    var wages = PN.state.weeklyWages(st);
    var net = pf.revenueWeek - wages - pf.costWeek;
    var burn = Math.max(1, -net);
    var runway = net >= 0 ? null : Math.floor(st.studio.cash / burn);
    var has = T.hasTitle(st);

    function cell(k, v, sub, cls) {
      return '<div class="vt"><div class="vt-k">' + esc(k) + '</div>' +
        '<div class="vt-v' + (cls ? ' ' + cls : '') + '">' + v + '</div>' +
        (sub ? '<div class="vt-s">' + sub + '</div>' : '') + '</div>';
    }
    function meter(k, v, cls) {
      return '<div class="vt"><div class="vt-k">' + esc(k) + '</div>' +
        '<div class="vt-meter"><i style="width:' + Math.round(U.clamp(v, 0, 100)) +
          '%;background:var(--' + cls + ')"></i></div>' +
        '<div class="vt-v sm ' + cls + '">' + Math.round(v) + '</div></div>';
    }
    function tone(v) { return v >= 72 ? 'good' : v >= 48 ? 'warn' : 'bad'; }

    return '<div class="vitals">'
      + cell('Cash', U.fmtMoney(st.studio.cash),
          (net >= 0 ? '<span class="good">+' : '<span class="bad">') +
          U.fmtMoney(net) + '/wk</span>' +
          (runway !== null ? ' &middot; ' + runway + 'w runway' : ''))
      + cell('Team', st.studio.staff.length,
          ((st.studio.openings || []).length
            ? (st.studio.openings.length + ' being hired &middot; ')
            : '') + U.fmtMoney(wages) + '/wk in wages')
      + (has ? cell('Players', U.fmtCompact(pf.players),
            pf.titles + ' game' + (pf.titles === 1 ? '' : 's') + ', ' + pf.liveTitles + ' live')
             : cell('In production', 'nothing', 'founded ' + st.studio.founded))
      + meter('Morale', st.studio.morale, tone(st.studio.morale))
      + meter('Reputation', st.studio.reputation, tone(st.studio.reputation))
      + cell('Throughput', pf.over > 0 ? Math.round(pf.spread * 100) + '%' : '100%',
          pf.over > 0 ? 'spread across ' + T.building(st).length + ' games'
                      : 'focused', pf.over > 0 ? 'bad' : 'good')
      + '</div>'
      + (pf.over > 0
          ? '<div class="sc-alert">Running ' + T.building(st).length +
            ' games on a team staffed for ' + pf.slots + '. Hire, or close something.</div>'
          : '');
  }

  /* -------------------------------------------------------- the roster */

  function sortKey() { return PN.app.staffSort || 'discipline'; }

  function sortedStaff(st) {
    var list = st.studio.staff.slice();
    var by = sortKey();
    list.sort(function (a, b) {
      /* Anybody leaving comes first whatever else is asked for - it is
         the thing that has a deadline on it. */
      if ((b.noticeWeeks > 0) !== (a.noticeWeeks > 0)) return b.noticeWeeks > 0 ? 1 : -1;
      if (by === 'name') return a.name < b.name ? -1 : 1;
      if (by === 'output') return contribOf(b) - contribOf(a);
      if (by === 'salary') return b.salary - a.salary;
      if (by === 'morale') return a.morale - b.morale;
      if (by === 'tenure') return (b.weeks || 0) - (a.weeks || 0);
      /* discipline, then role, then the strongest first */
      var ra = PN.state.ROLE_BY_ID[a.role] || { pools: {} };
      var rb = PN.state.ROLE_BY_ID[b.role] || { pools: {} };
      var da = disciplineOf(ra), db = disciplineOf(rb);
      if (da !== db) {
        var ia = 0, ib = 0;
        DISCIPLINES.forEach(function (d, i) { if (d.id === da) ia = i; if (d.id === db) ib = i; });
        return ia - ib;
      }
      if (a.role !== b.role) return a.role < b.role ? -1 : 1;
      return b.skill - a.skill;
    });
    return list;
  }

  function staffRow(s) {
    var st = S();
    var role = PN.state.ROLE_BY_ID[s.role] ||
               { name: s.role, salary: 0, pools: {}, effect: {} };
    var disc = DISC_BY_ID[disciplineOf(role)] || DISCIPLINES[0];
    var leaving = s.noticeWeeks > 0;
    var risk = PN.sim.attritionRisk(st, s);
    var open = PN.app.openStaff === s.id;
    var market = marketRate(s);
    var underpaid = s.salary < market * 0.92;

    var status = leaving
      ? '<span class="chip bad">' + s.noticeWeeks + 'w notice</span>'
      : risk > 0.02 ? '<span class="chip warn">flight risk</span>'
      : underpaid ? '<span class="chip">under market</span>'
      : s.burnout >= 55 ? '<span class="chip warn">burnt out</span>'
      : '';

    var head = '<div class="sr' + (open ? ' open' : '') + (leaving ? ' leaving' : '') +
        '" data-act="staff.open" data-val="' + s.id + '">'
      + '<i class="sr-dot" style="background:' + disc.colour + '"></i>'
      + '<div class="sr-who"><div class="sr-name">' + esc(s.name) + '</div>'
      + '<div class="sr-role">' + esc(senWord(s.seniority)) + ' ' + esc(role.name) + '</div></div>'
      + '<div class="sr-meters">'
      + '<span class="sr-meter" title="Morale: ' + esc(moraleWord(s.morale)) + '">'
        + '<b>M</b><span class="bar"><i style="width:' + Math.round(s.morale) + '%;background:'
        + (s.morale < 45 ? 'var(--bad)' : s.morale < 62 ? 'var(--warn)' : 'var(--good)')
        + '"></i></span></span>'
      + '<span class="sr-meter" title="Burnout: ' + esc(burnWord(s.burnout)) + '">'
        + '<b>B</b><span class="bar"><i style="width:' + Math.round(s.burnout) + '%;background:'
        + (s.burnout > 55 ? 'var(--bad)' : s.burnout > 30 ? 'var(--warn)' : 'var(--dim)')
        + '"></i></span></span>'
      + '</div>'
      + '<div class="sr-num" title="Capacity-weeks this person adds every week">'
        + U.round(contribOf(s), 2) + '</div>'
      + '<div class="sr-num money' + (underpaid ? ' warn' : '') + '">'
        + U.fmtMoneyFull(s.salary) + '</div>'
      + '<div class="sr-status">' + status + '</div>'
      + '<span class="sr-caret">' + (open ? '&#9662;' : '&#9656;') + '</span>'
      + '</div>';

    if (!open) return head;

    /* --- the drawer: everything the old card crammed into the row --- */
    var traitChips = (s.traits || []).map(function (t) {
      var def = PN.state.TRAIT_BY_ID[t];
      if (!def) return '';
      return '<span class="chip tiny" title="' + esc(def.desc) + '">' + esc(def.name) + '</span>';
    }).join(' ');
    var out = outputOf(s);
    var pools = U.keys(role.pools || {}).map(function (p) {
      return '<span class="sd-pool"><i>' +
        (p === 'eng' ? 'Engineering' : p === 'qa' ? 'QA' : U.titleCase(p)) + '</i>' +
        U.round(role.pools[p] * out, 2) + '</span>';
    }).join('') ||
      '<span class="faint tiny">Multiplies everyone else rather than filling a pool.</span>';
    var tenure = Math.max(0, s.weeks || 0);

    return head + '<div class="sdrawer">'
      + '<div class="sd-grid">'
      + '<div><div class="sd-k">Discipline</div><div class="sd-v">' + esc(disc.name) + '</div></div>'
      + '<div><div class="sd-k">Skill</div><div class="sd-v mono">' + U.round(s.skill, 2) + '</div></div>'
      + '<div><div class="sd-k">Morale</div><div class="sd-v">' + esc(moraleWord(s.morale)) + '</div></div>'
      + '<div><div class="sd-k">Burnout</div><div class="sd-v">' + esc(burnWord(s.burnout)) + '</div></div>'
      + '<div><div class="sd-k">Here</div><div class="sd-v">' + (tenure >= 52
          ? U.round(tenure / 52, 1) + ' years' : tenure + ' weeks') + '</div></div>'
      + '<div><div class="sd-k">Market rate</div><div class="sd-v mono' +
          (underpaid ? ' warn' : '') + '">' + U.fmtMoneyFull(market) + '/mo</div></div>'
      + '</div>'
      + '<div class="sd-line"><span class="sd-k">Adds every week</span>' + pools + '</div>'
      + (traitChips ? '<div class="row wrap" style="gap:4px;margin-top:8px">' + traitChips + '</div>' : '')
      + '<div class="tiny faint" style="margin-top:8px">' + esc(role.desc) +
        ' Came out of ' + esc(s.from || 'the trade') + '.</div>'
      + (leaving
          ? '<div class="sc-notice"><b>Resigning.</b> '
            + esc(sentence(U.listJoin(s.noticeReasons || ['leaving'])))
            + '. Working ' + s.noticeWeeks + ' more week'
            + (s.noticeWeeks === 1 ? '' : 's') + ' at reduced output.'
            + '<div class="row" style="margin-top:6px">'
            + (s.counterOffered
                ? '<span class="tiny faint">You have already made an offer.</span>'
                : '<button class="xs" data-act="staff.counter" data-val="' + s.id +
                  '">Counter-offer (+18%)</button>')
            + '</div></div>'
          : '')
      + '<div class="row" style="margin-top:10px">'
      + (leaving ? '' : '<button class="xs ghost" data-act="staff.raise" data-val="' + s.id +
          '">Give a raise</button>')
      + '<span class="spacer"></span>'
      + '<button class="xs ghost danger" data-act="staff.fire" data-val="' + s.id +
        '">Let go</button>'
      + '</div></div>';
  }

  /* Anybody you are looking for but have not got yet. In a decade
     where hiring is instant this is always empty and never drawn. */
  function searchRows() {
    var st = S();
    var list = (st.studio.openings || []);
    if (!list.length) return '';
    return '<div class="searchlist">' + list.map(function (op) {
      var role = PN.state.ROLE_BY_ID[op.role] || { name: op.role };
      var done = Math.max(0, op.weeks - op.left);
      var pct = op.weeks > 0 ? (done / op.weeks) * 100 : 100;
      return '<div class="srch">'
        + '<div class="srch-who"><div class="srch-name">Looking for a ' +
          esc(role.name.toLowerCase()) + '</div>'
        + '<div class="srch-sub">' + done + ' of ' + op.weeks + ' weeks &middot; ' +
          (op.left === 1 ? 'arrives next week' : op.left + ' to go') + '</div></div>'
        + '<div class="bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
        + '<button class="xs ghost danger" data-act="staff.cancelSearch" data-val="' +
          op.id + '">Call it off</button>'
        + '</div>';
    }).join('') + '</div>';
  }

  function staffPanel() {
    var st = S();
    var staff = sortedStaff(st);
    var leaving = PN.sim.leaving(st);
    var by = sortKey();

    var sorts = [['discipline', 'Discipline'], ['name', 'Name'], ['output', 'Output'],
                 ['salary', 'Salary'], ['morale', 'Morale'], ['tenure', 'Tenure']];
    var controls = '<div class="sortbar">' + sorts.map(function (o) {
      return '<button class="xs' + (by === o[0] ? '' : ' ghost') +
        '" data-act="staff.sort" data-val="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';

    var warn = leaving.length
      ? '<div class="sc-alert">' + leaving.length + ' ' +
        (leaving.length === 1 ? 'person has' : 'people have') + ' handed in ' +
        (leaving.length === 1 ? 'their notice' : 'notice') + '. Soonest leaves in ' +
        leaving[0].noticeWeeks + ' week' + (leaving[0].noticeWeeks === 1 ? '' : 's') +
        '. Open them to counter.</div>'
      : '';

    var rows = '';
    if (!staff.length) {
      rows = ui.empty('Nobody on the payroll.',
        'Hire somebody before you try to build anything.');
    } else {
      var head = '<div class="sr head"><i class="sr-dot" style="background:transparent"></i>' +
        '<div class="sr-who">Person</div>' +
        '<div class="sr-meters">Morale &middot; burnout</div>' +
        '<div class="sr-num">Adds</div>' +
        '<div class="sr-num money">Salary</div>' +
        '<div class="sr-status"></div><span class="sr-caret"></span></div>';
      var lastDisc = null, body = '';
      staff.forEach(function (s) {
        if (by === 'discipline') {
          var role = PN.state.ROLE_BY_ID[s.role] || { pools: {} };
          var d = disciplineOf(role);
          if (d !== lastDisc && s.noticeWeeks <= 0) {
            lastDisc = d;
            var def = DISC_BY_ID[d] || DISCIPLINES[0];
            var n = staff.filter(function (x) {
              return disciplineOf(PN.state.ROLE_BY_ID[x.role] || { pools: {} }) === d; }).length;
            var adds = U.sum(staff.filter(function (x) {
              return disciplineOf(PN.state.ROLE_BY_ID[x.role] || { pools: {} }) === d; }), contribOf);
            body += '<div class="sgroup"><i style="background:' + def.colour + '"></i>' +
              esc(def.name) + '<span class="spacer"></span><span class="faint">' + n +
              ' &middot; ' + U.round(adds, 1) + ' cap-wks</span></div>';
          }
        }
        body += staffRow(s);
      });
      rows = head + body;
    }

    return ui.panel('The team', warn + searchRows() + controls +
      '<div class="stafflist">' + rows + '</div>',
      { hint: st.studio.staff.length + ' people, supports ' + T.titleSlots(st) +
              ' game' + (T.titleSlots(st) === 1 ? '' : 's') });
  }

  /* ----------------------------------------------------------- hiring */

  function hirePanel() {
    var st = S();
    var groups = {};
    st.studio.staff.forEach(function (s) { (groups[s.role] = groups[s.role] || []).push(s); });
    var cash = st.studio.cash;

    /* Grouped the way the roster is, so "we are thin on art" is one
       glance rather than a count. */
    var body = DISCIPLINES.map(function (disc) {
      var roles = PN.state.STAFF_ROLES.filter(function (r) {
        return disciplineOf(r) === disc.id; });
      if (!roles.length) return '';
      var have = 0;
      roles.forEach(function (r) { have += (groups[r.id] || []).length; });
      return '<div class="hgroup"><i style="background:' + disc.colour + '"></i>' +
        esc(disc.name) + '<span class="spacer"></span><span class="faint">' + have +
        ' on staff</span></div>' +
        roles.map(function (r) {
          var n = (groups[r.id] || []).length;
          var afford = cash > r.salary * 3;
          return '<div class="hrow' + (afford ? '' : ' thin') + '">'
            + '<div style="min-width:0">'
            + '<div class="hr-name">' + esc(r.name) +
              (n ? ' <span class="faint">&times;' + n + '</span>' : '') + '</div>'
            + '<div class="hr-desc">' + esc(r.desc) + '</div></div>'
            + '<div class="hr-cost mono">' + U.fmtMoneyFull(r.salary) + '<i>/mo</i></div>'
            + '<button class="xs' + (afford ? '' : ' ghost') + '" data-act="staff.hire" data-val="'
            + r.id + '"' + (afford ? '' : ' title="Thin runway for another salary"')
            + '>Hire</button></div>';
        }).join('');
    }).join('');

    var wait = PN.state.hireWeeksFor(st);
    return ui.panel('Hire',
      (wait > 0
        ? '<div class="tiny faint" style="margin-bottom:10px;line-height:1.55">'
          + 'Nobody has made an MMO before, so there is no industry to hire out of. '
          + 'A search takes about <b style="color:var(--text)">' + wait + ' weeks</b> '
          + 'before anybody starts - which is why somebody handing in their notice '
          + 'is a decision rather than a formality.</div>'
        : '') + body,
      { hint: wait > 0 ? wait + '-week searches' :
              U.fmtMoney(PN.state.weeklyWages(st)) + '/wk now' });
  }

  /* ------------------------------------------------- what it all buys */

  function capacityPanel() {
    var st = S();
    var cap = PN.state.capacity(st);
    var rows = [['design', 'Design'], ['art', 'Art'], ['eng', 'Engineering'], ['qa', 'QA']];
    var top = 0;
    rows.forEach(function (r) { top = Math.max(top, cap[r[0]] || 0); });
    return ui.panel('Capacity',
      '<div class="caprows">' + rows.map(function (r) {
        var disc = DISC_BY_ID[r[0]] || DISCIPLINES[0];
        var v = cap[r[0]] || 0;
        return '<div class="caprow"><span class="cap-k">' + r[1] + '</span>' +
          '<span class="bar"><i style="width:' + (top > 0 ? (v / top) * 100 : 0).toFixed(1) +
            '%;background:' + disc.colour + '"></i></span>' +
          '<span class="cap-v mono">' + U.round(v, 1) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="tiny faint" style="margin-top:10px;line-height:1.5">Capacity-weeks per week. ' +
      'Tools engineers and producers multiply everyone else (&times;' + U.round(cap.mult, 2) +
      '). Technical debt taxes everyone (&times;' + U.round(cap.debtTax, 2) + ').' +
      (T.building(st).length > 1
        ? ' Split across ' + T.building(st).length + ' games at ' +
          Math.round(T.spreadPenalty(st) * 100) + '% throughput.'
        : '') + '</div>' +
      '<div class="subhead spaced">Crunch</div>' +
      ui.slider({ path: 'studio.crunch', label: 'Crunch level', value: st.studio.crunch,
        desc: 'Buys throughput now. Pays for it in morale, bugs, technical debt and the people who leave.' }) +
      (st.studio.crunch > 45
        ? '<div class="chip bad">Sustained crunch is how studios lose their seniors</div>' : ''));
  }

  function studioTab() {
    var st = S();
    var has = T.hasTitle(st);

    if (!has) {
      return vitals()
        + '<div class="grid g-2-1"><div>'
        + staffPanel()
        + '</div><div>'
        + ui.panel('Nothing is in production', ''
          + '<div class="tiny faint" style="line-height:1.65;margin-bottom:14px">'
          + 'You have a team and a bank balance and no game. Greenlight one and the '
          + 'Design Studio opens up: you will write its abilities, its quests, its loot '
          + 'tables and its boss phases, then ship it and find out what a few thousand '
          + 'simulated players make of you.</div>'
          + '<button class="primary" data-act="title.greenlight">Greenlight your first MMO</button>'
          + '<div class="tiny faint" style="margin-top:16px;line-height:1.6">'
          + 'It is ' + (st.era ? st.era.year : '') + '. ' + esc(st.era ? st.era.note : '')
          + '</div>')
        + hirePanel()
        + capacityPanel()
        + ui.panel('The market', marketMood())
        + storagePanel()
        + '</div></div>';
    }

    return vitals()
      + '<div class="grid g-2-1"><div>'
      + staffPanel()
      + portfolioPanel(true)
      + '</div><div>'
      + hirePanel()
      + capacityPanel()
      + ui.panel('The market', marketMood())
      + storagePanel()
      + '</div></div>';
  }

  /* =========================================================== PORTFOLIO */

  function titleRow(t, compact) {
    var st = S();
    var active = st.activeTitleId === t.id;
    var phase = T.PHASE_BY_ID[t.phase] || { name: t.phase };
    var pop = (t.population && t.population.total) || 0;
    var rev = (t.finance && t.finance.revenueWeek) || 0;
    var ver = P.versionString(t.version);
    return '<div class="titlecard' + (active ? ' on' : '') + '">' +
      '<div class="row" data-act="title.select" data-val="' + t.id + '" style="cursor:pointer">' +
      '<div style="min-width:0">' +
        '<div class="t">' + esc(t.titleName) +
        ' <span class="mono tiny faint">' + ver + '</span></div>' +
        '<div class="s">' + esc(phase.name) +
        (t.phase === 'live' ? ' &middot; ' + U.fmtCompact(pop) + ' players &middot; ' +
          U.fmtMoney(rev) + '/wk' : '') +
        '</div>' +
      '</div><span class="spacer"></span>' +
      (active ? '<span class="chip good">open</span>' : '<span class="chip">switch</span>') +
      '</div>' +
      (compact ? '' :
        '<div class="rowact narrow" style="margin-top:8px">' +
        '<span class="faint tiny rowact-k">Team share</span>' +
        '<input type="range" min="0" max="100" step="1" value="' + Math.round(t.allocation || 0) +
          '" data-act="title.alloc" data-val="' + t.id + '">' +
        '<input class="valnum" type="number" min="0" max="100" value="' +
          Math.round(t.allocation || 0) + '" data-act="title.alloc" data-val="' + t.id + '">' +
        '<span class="faint tiny rowact-s">%</span></div>' +
        '<div class="row" style="margin-top:8px;gap:5px">' +
        '<button class="xs ghost" data-act="title.rename" data-val="' + t.id + '">rename</button>' +
        (t.phase !== 'live' && t.phase !== 'dead'
          ? '<button class="xs" data-act="title.launch" data-val="' + t.id + '">launch</button>' : '') +
        '<span class="spacer"></span>' +
        (t.phase !== 'dead'
          ? '<button class="xs ghost danger" data-act="title.close" data-val="' + t.id +
            '">close</button>' : '<span class="chip bad">closed</span>') +
        '</div>') +
      '</div>';
  }

  function portfolioPanel(compact) {
    var st = S();
    var rows = (st.titles || []).map(function (t) { return titleRow(t, compact); }).join('')
      || ui.empty('No games yet.');
    var slots = T.titleSlots(st);
    var running = T.building(st).length;
    return ui.panel('Games', rows +
      '<div class="row" style="margin-top:10px">' +
      '<button class="sm" data-act="title.greenlight">Greenlight another MMO</button>' +
      '</div>' +
      (running >= slots
        ? '<div class="tiny faint" style="margin-top:8px;line-height:1.55">Your team of ' +
          st.studio.staff.length + ' supports about ' + slots + ' game' +
          (slots === 1 ? '' : 's') + ' at once. Another one now would slow everything ' +
          'down until you hire.</div>'
        : '<div class="tiny faint" style="margin-top:8px">Room for ' + (slots - running) +
          ' more with the team you have.</div>'),
      { hint: running + ' in production · ' + slots + ' supported' });
  }

  function portfolioTab() {
    var st = S();
    var pf = T.portfolio(st);
    var rows = (st.titles || []).map(function (t) {
      var pop = (t.population && t.population.total) || 0;
      var rev = (t.finance && t.finance.revenueWeek) || 0;
      var sent = (t.runtime && t.runtime.sentiment) || 0;
      var phase = T.PHASE_BY_ID[t.phase] || { name: t.phase };
      return '<tr class="click" data-act="title.select" data-val="' + t.id + '">' +
        '<td>' + esc(t.titleName) + (st.activeTitleId === t.id
          ? ' <span class="chip good">open</span>' : '') + '</td>' +
        '<td class="mono tiny">' + P.versionString(t.version) + '</td>' +
        '<td class="small muted">' + esc(phase.name) + '</td>' +
        '<td class="num">' + (t.phase === 'live' ? U.fmtCompact(pop) : '—') + '</td>' +
        '<td class="num">' + (t.phase === 'live' ? U.fmtMoney(rev) : '—') + '</td>' +
        '<td class="num ' + ui.scoreClass(sent) + '">' +
          (t.phase === 'live' ? Math.round(sent) : '—') + '</td>' +
        '<td class="num">' + Math.round(t.allocation || 0) + '%</td>' +
        '<td class="num">' + ((t.released || []).length) + '</td></tr>';
    }).join('');

    return '<div class="grid g-2-1"><div>'
      + ui.panel('The portfolio',
          '<table class="data"><tr><th>Game</th><th>Version</th><th>Phase</th>' +
          '<th class="num">Players</th><th class="num">Revenue</th><th class="num">Mood</th>' +
          '<th class="num">Team</th><th class="num">Patches</th></tr>' + rows + '</table>' +
          '<div class="tiny faint" style="margin-top:10px">Click a row to switch which game the ' +
          'Design Studio and the live screens are pointed at.</div>',
          { actions: '<button class="sm" data-act="title.greenlight">Greenlight another</button>',
            hint: pf.titles + ' games · ' + U.fmtCompact(pf.players) + ' players' })
      + ui.panel('Team allocation',
          (st.titles || []).filter(function (t) {
            return t.phase !== 'dead' && t.phase !== 'sunset';
          }).map(function (t) {
            return ui.rangeAct({ label: t.titleName, act: 'title.alloc', val: t.id,
                                 value: Math.round(t.allocation || 0), min: 0, max: 100,
                                 suffix: '%' });
          }).join('') +
          '<div class="tiny faint" style="margin-top:10px;line-height:1.55">Shares always add up ' +
          'to a hundred: moving people onto one game moves them off another. Running more games ' +
          'than the team supports costs everyone throughput on top of that.</div>')
      + '</div><div>'
      + ui.panel('Capacity', ''
        + '<div class="grid g2">'
        + ui.stat('Games running', T.building(st).length)
        + ui.stat('Team supports', pf.slots)
        + ui.stat('Throughput', Math.round(pf.spread * 100) + '%', null,
            pf.spread > 0.9 ? 'good' : pf.spread > 0.7 ? 'warn' : 'bad')
        + ui.stat('Wages', U.fmtMoney(PN.state.weeklyWages(st)) + '/wk')
        + '</div>'
        + '<div class="tiny faint" style="margin-top:11px;line-height:1.6">A team runs about one '
        + 'game per dozen people. Beyond that everything still moves, just slower - which is how '
        + 'a studio ends up with three mediocre games instead of one good one.</div>')
      + ui.panel('Portfolio finance', ''
        + '<div class="grid g2">'
        + ui.stat('Revenue', U.fmtMoney(pf.revenueWeek) + '/wk')
        + ui.stat('Costs', U.fmtMoney(pf.costWeek) + '/wk')
        + ui.stat('Net', U.fmtMoney(pf.revenueWeek - pf.costWeek) + '/wk', null,
            pf.revenueWeek - pf.costWeek >= 0 ? 'good' : 'bad')
        + ui.stat('Lifetime', U.fmtMoney(pf.revenueTotal))
        + '</div>')
      + '</div></div>';
  }

  PN.viewsStudio = {
    studioTab: studioTab, portfolioTab: portfolioTab,
    portfolioPanel: portfolioPanel, suggestTitleName: suggestTitleName
  };
})(PN);
