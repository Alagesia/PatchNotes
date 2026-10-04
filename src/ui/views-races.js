/* Patch Notes - the races screen.

   Two questions, and the screen is built around them rather than around
   the data structure.

   "What does this race do?" - a short list of percentages, each one
   authored on a row you can read out loud.

   "Who is it for?" - which builds want it most, and by how much. That
   second one is the whole reason races are interesting and the thing a
   spreadsheet of percentages will never tell you: +5% Strength is not a
   number, it is a sentence about Warriors.                            */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.ui.esc;
  var RC = PN.races;

  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  /* What one bonus reads as on a character screen. */
  function bonusLabel(design, bn) {
    var kind = RC.BONUS_BY_ID[bn.kind];
    if (!kind) return '';
    var pct = U.fmtSigned(bn.pct, bn.pct % 1 === 0 ? 0 : 1) + '%';
    if (kind.needsStat) {
      var s = PN.stats.statSetOf(design);
      var st = U.byId(s.primaries, bn.statId) || U.byId(s.secondaries || [], bn.statId);
      return pct + ' ' + (st ? st.name : 'a stat you deleted');
    }
    return pct + ' ' + kind.name.toLowerCase();
  }

  /* Good or bad depends on the kind: less damage taken is a good thing
     written with a minus in front of it. */
  function bonusTone(bn) {
    var kind = RC.BONUS_BY_ID[bn.kind];
    if (!kind || !bn.pct) return '';
    var helps = kind.invert ? bn.pct < 0 : bn.pct > 0;
    return helps ? 'good' : 'bad';
  }

  /* ------------------------------------------------------------- the list */

  function raceRows(d, current) {
    if (!d.races.length) {
      return ui.empty('No races yet.',
        'A game without races is a complete game - most of the genre shipped ' +
        'that way. Add one and the character screen grows a second question.');
    }
    return d.races.map(function (r) {
      var suited = RC.suitedTo(d, r);
      var top = suited.length && suited[0].score > 0 ? suited[0].build : null;
      return '<div class="item' + (current && r.id === current.id ? ' on' : '') +
        '" data-act="race.select" data-val="' + r.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(r.name) + '</div>' +
        '<div class="s">' + (r.bonuses.length
          ? r.bonuses.map(function (b) { return esc(bonusLabel(d, b)); }).join(' &middot; ')
          : 'No bonuses - cosmetic only') +
        '</div></div><span class="spacer"></span>' +
        /* Which build it is FOR, specifically. Just the class name put
           "Warrior" beside four different races, which told the author
           nothing - the job is the half that differs. */
        (top ? '<span class="chip">' + esc((top.playableName || top.name) + ' ' +
          String(top.buildRole || '').replace('dps', 'damage')) + '</span>' : '') +
        '</div>';
    }).join('');
  }

  /* ------------------------------------------------------ the editor pane */

  function bonusRows(d, race) {
    var s = PN.stats.statSetOf(d);
    var statOpts = s.primaries.concat(s.secondaries || []);
    return race.bonuses.map(function (bn, i) {
      var kind = RC.BONUS_BY_ID[bn.kind] || RC.BONUS_KINDS[0];
      return '<div class="bonusrow">' +
        '<select data-bind="raceSel.bonuses.' + i + '.kind">' +
          RC.BONUS_KINDS.map(function (k) {
            return '<option value="' + k.id + '"' + (k.id === bn.kind ? ' selected' : '') +
              '>' + esc(k.name) + '</option>';
          }).join('') +
        '</select>' +
        (kind.needsStat
          ? '<select data-bind="raceSel.bonuses.' + i + '.statId">' +
              statOpts.map(function (st) {
                return '<option value="' + st.id + '"' + (st.id === bn.statId ? ' selected' : '') +
                  '>' + esc(st.name) + '</option>';
              }).join('') +
            '</select>'
          : '<span class="bonusgap"></span>') +
        '<input type="number" step="1" min="' + kind.lo + '" max="' + kind.hi + '" ' +
          'data-kind="num" value="' + bn.pct + '" ' +
          'data-bind="raceSel.bonuses.' + i + '.pct">' +
        '<span class="pctmark">%</span>' +
        '<span class="bonusread ' + bonusTone(bn) + '">' + esc(bonusLabel(d, bn)) + '</span>' +
        '<button class="xs ghost danger" data-act="race.bonus.remove" ' +
          'data-val="' + race.id + ':' + i + '">&times;</button>' +
        '</div>';
    }).join('') || '<div class="tiny faint" style="padding:4px 0">No bonuses. This race is ' +
      'a costume, which is a legitimate thing to ship - but nobody will argue about it.</div>';
  }

  /* Which builds this race is actually for. The answer the percentages
     are hiding. */
  function suitedPanel(d, race) {
    var suited = RC.suitedTo(d, race);
    if (!suited.length) {
      return ui.empty('No builds to compare.', 'Author a class or a talent branch first.');
    }
    var best = Math.max.apply(null, suited.map(function (x) { return Math.abs(x.score); }).concat([0.001]));
    var rows = suited.slice(0, 10).map(function (x) {
      var pct = best > 0 ? Math.abs(x.score) / best * 100 : 0;
      var good = x.score > 0.05, bad = x.score < -0.05;
      return '<div class="suitrow">' +
        '<div class="sn">' + esc(x.build.name) + '</div>' +
        '<div class="bar"><i style="width:' + Math.round(U.clamp(pct, 0, 100)) + '%;background:' +
          (good ? 'var(--good)' : bad ? 'var(--bad)' : 'var(--line)') + '"></i></div>' +
        '<div class="sv ' + (good ? 'good' : bad ? 'bad' : 'faint') + '">' +
          (Math.abs(x.score) < 0.05 ? 'nothing' : U.fmtSigned(x.score, 1)) + '</div>' +
        '</div>';
    }).join('');
    var dead = suited.filter(function (x) { return x.score <= 0.05; }).length;
    return rows +
      '<div class="tiny faint" style="margin-top:10px;line-height:1.55">Relative worth, not a ' +
      'power level. ' + (dead
        ? dead + ' of ' + suited.length + ' builds get nothing out of this race - which is ' +
          'fine. A race that suits everyone equally is a race nobody chooses for a reason.'
        : 'Every build gets something out of this one, which makes it the safe pick and ' +
          'the boring one.') + '</div>';
  }

  /* Who may roll it. Empty means everybody, and that is the default. */
  function allowPanel(d, race) {
    var playables = PN.schema.playable(d);
    if (!playables.length) return ui.empty('Nothing to restrict yet.');
    var open = !race.allow || !race.allow.length;
    return '<div class="tiny faint" style="margin-bottom:9px;line-height:1.55">' +
      (open
        ? 'Open to everybody. Tick nothing and it stays that way - a restriction ' +
          'should be something you meant.'
        : 'Restricted. ' + race.allow.length + ' of ' + playables.length +
          ' can roll it, and the rest cannot see it on the character screen.') +
      '</div>' +
      /* Chips rather than checkboxes: the delegated click handler
         deliberately ignores data-act on an input, so that typing in a
         bound field cannot fire an action. A chip is also a better
         target and reads as a filter, which is what this is. */
      '<div class="allowgrid">' + playables.map(function (p) {
        var on = !open && race.allow.indexOf(p.id) >= 0;
        return '<button class="allowchk' + (on ? ' on' : '') + '"' +
          ' data-act="race.allow" data-val="' + race.id + ':' + p.id + '">' +
          '<i>' + (on ? '&#10003;' : '&nbsp;') + '</i>' +
          '<span>' + esc(p.name) + '</span></button>';
      }).join('') + '</div>';
  }

  /* ---------------------------------------------- how the set reads overall */

  function healthPanel(d) {
    var div = RC.diversity(d);
    if (!div.races) {
      return '<div class="tiny faint" style="line-height:1.6">Races are off. Everything on ' +
        'this screen is optional, and a game that ships without them is not missing ' +
        'anything it needed.</div>';
    }
    var sharePct = Math.round(div.share * 100);
    var verdict, tone;
    if (div.used <= 1) {
      verdict = 'One race is the correct answer for every build in the game. That is not a ' +
        'choice, it is a tax on anybody who picks wrong.';
      tone = 'bad';
    } else if (div.share > 0.6) {
      verdict = (div.dominant ? div.dominant.name : 'One race') + ' is the right answer for ' +
        sharePct + '% of builds. Expect it on most of the ladder.';
      tone = 'warn';
    } else {
      verdict = 'Different builds want different races, which is the whole point. ' +
        'No single race is right more than ' + sharePct + '% of the time.';
      tone = 'good';
    }
    return '<div class="row" style="margin-bottom:10px;gap:14px">' +
      '<div style="font:600 26px var(--mono);color:var(--' + tone + ')">' + div.used + '</div>' +
      '<div class="small muted">of ' + div.races + ' races are somebody’s best pick' +
      '<br><span class="tiny faint">Top race suits ' + sharePct + '% of builds</span></div></div>' +
      '<div class="tiny" style="line-height:1.6;color:var(--dim)">' + esc(verdict) + '</div>';
  }

  /* What the population actually rolled, when there is one. */
  function popularityPanel(d) {
    var st = PN.game.state;
    var agents = (st && st.agents) || [];
    if (!agents.length || !RC.enabled(d)) return null;
    var counts = {}, total = 0;
    agents.forEach(function (a) {
      if (!a.rc) return;
      counts[a.rc] = (counts[a.rc] || 0) + a.w; total += a.w;
    });
    if (total <= 0) return null;
    return PN.chart.bars(d.races.map(function (r) {
      return { name: r.name, value: (counts[r.id] || 0) / total * 100 };
    }).sort(function (a, b) { return b.value - a.value; }),
      { labelW: 88, fmt: function (v) { return U.fmtPct(v, 0); } }) +
      '<div class="tiny faint" style="margin-top:9px;line-height:1.5">What your live ' +
      'players actually rolled. Competitive players chase the right race; everybody ' +
      'else rolls the one they like.</div>';
  }

  /* ================================================================ entry */

  function racesTab() {
    var d = D();
    d.races = d.races || [];
    var st = PN.game.state;
    var cap = PN.research.limits(st).races;
    var current = sel().raceId ? U.byId(d.races, sel().raceId) : d.races[0];
    if (current) sel().raceId = current.id;

    var left =
      ui.panel('Races', raceRows(d, current), {
        actions: '<button class="sm" data-act="race.add">Add race</button>',
        hint: d.races.length + ' of ' + cap
      }) +
      ui.panel('The set', healthPanel(d));
    var pop = popularityPanel(d);
    if (pop) left += ui.panel('What players rolled', pop);

    if (!current) {
      return '<div class="grid g-1-2"><div>' + left + '</div><div>' +
        ui.panel('No race selected',
          ui.empty('Nothing to edit.',
            cap > 0
              ? 'Add a race and it appears on the character screen beside the class.'
              : 'Races are not researched yet. They are a tier one node - a decision ' +
                'you make early or not at all.')) +
        '</div></div>';
    }

    var right =
      ui.panel('Identity',
        '<div class="field"><label><span class="name">Name</span></label>' +
        '<input type="text" maxlength="28" value="' + esc(current.name) + '" ' +
        'data-bind="raceSel.name"></div>' +
        '<div class="field"><label><span class="name">Flavour</span></label>' +
        '<input type="text" maxlength="90" value="' + esc(current.blurb || '') + '" ' +
        'placeholder="One line. It is the only lore most players will read." ' +
        'data-bind="raceSel.blurb"></div>', {
          actions: '<button class="xs ghost danger" data-act="race.remove" data-val="' +
                   current.id + '">Delete</button>'
        }) +
      ui.panel('Bonuses', bonusRows(d, current), {
        actions: '<button class="sm" data-act="race.bonus.add" data-val="' + current.id +
                 '">Add bonus</button>',
        hint: current.bonuses.length + ' on this race'
      }) +
      ui.panel('Who it is for', suitedPanel(d, current)) +
      ui.panel('Who may roll it', allowPanel(d, current));

    return '<div class="grid g-1-2"><div>' + left + '</div><div>' + right + '</div></div>';
  }

  PN.viewsRaces = { racesTab: racesTab, bonusLabel: bonusLabel };
})(PN);
