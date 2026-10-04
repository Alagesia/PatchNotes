/* Patch Notes - the Design Studio.
   Everything the player authors lives here.                              */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc, prim = PN.prim,
      S = PN.schema, met = PN.metrics;

  var TABS = [
    { id: 'identity',   name: 'Identity' },
    { id: 'progression', name: 'Progression' },
    { id: 'combat',     name: 'Combat & Stats' },
    { id: 'abilities',  name: 'Abilities' },
    { id: 'classes',    name: 'Classes' },
    { id: 'races',      name: 'Races' },
    { id: 'items',      name: 'Items & Rewards' },
    { id: 'world',      name: 'World & Quests' },
    { id: 'encounters', name: 'PvE' },
    { id: 'pvp',        name: 'PvP' },
    { id: 'events',     name: 'Live Events' },
    { id: 'systems',    name: 'Systems' }
  ];

  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  /* ==================================================== shared fragments */

  /* =============================================================== entry */

  /* One line per section, shown under the title so you always know what
     the screen in front of you is for. */
  var BLURB = {
    identity: 'What kind of MMO this is, and who it is for.',
    progression: 'How a character grows, and whether they grow into a class or a build.',
    combat: 'The stat set and the combat maths every ability is measured against.',
    abilities: 'Author the actual buttons. Damage, cooldowns, control, everything.',
    classes: 'Assemble kits from your abilities, and balance them against each other.',
    races: 'An optional second thing to pick on the character screen, worth a few percent each.',
    items: 'Gear, currencies, loot tables and the reward bundles content hands over.',
    world: 'Zones, the monsters in them, questgivers, quests and reward chains.',
    encounters: 'Dungeons and raids, their bosses, and the phases that kill people.',
    pvp: 'Maps, modes, and whether gear or skill decides a match.',
    events: 'The calendar. Holidays, anniversaries and the things only on in October.',
    systems: 'The engines that manufacture hours forever, and what they hand out.'
  };

  /* Build cost as a compact strip, so it stops eating a third of the
     header on every single screen. */
  function costStrip() {
    var st = PN.game.state;
    /* What is being BUILT: the game itself before launch, and after it
       the release at the front of the roadmap with its own banked
       work. It used to read the whole design against a pool that a
       live game no longer fills, so every live save showed 0%. */
    var c = PN.sim.completion(st);
    var pools = [
      { k: 'design', n: 'Des' }, { k: 'art', n: 'Art' },
      { k: 'eng', n: 'Eng' }, { k: 'qa', n: 'QA' }
    ];
    return '<div class="coststrip" data-act="cost.expand" title="Build progress on the release being built">' +
      pools.map(function (p) {
        var pct = (c.per[p.k] || 0) * 100;
        return '<div class="cs"><span class="k">' + p.n + '</span>' +
          '<div class="bar"><i style="width:' + pct.toFixed(1) + '%;background:' +
          (pct >= 100 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
          '<span class="v mono">' + Math.round(pct) + '%</span></div>';
      }).join('') +
      '<div class="cs total"><span class="k">Built</span><span class="v mono ' +
        ui.scoreClass(c.overall * 100) + '">' + U.fmtPct(c.overall * 100, 0) + '</span></div>' +
      '</div>';
  }

  /* The full four-pool readout, for when the strip is not enough. */
  function costReadout() {
    var st = PN.game.state;
    var c = PN.sim.completion(st);
    var banked = PN.patches.progressOf(st,
      st.phase === 'live' ? PN.patches.nextPlan(st) : null);
    var pools = [
      { k: 'design', n: 'Design' }, { k: 'art', n: 'Art' },
      { k: 'eng', n: 'Engineering' }, { k: 'qa', n: 'QA' }
    ];
    var rows = pools.map(function (p) {
      var done = banked[p.k] || 0, need = c.cost[p.k];
      var pct = (c.per[p.k] || 0) * 100;
      return '<div style="display:grid;grid-template-columns:82px minmax(0,1fr) 104px;gap:10px;align-items:center;padding:3px 0">' +
        '<div class="small muted">' + p.n + '</div>' +
        '<div class="bar"><i style="width:' + pct.toFixed(1) + '%;background:' +
          (pct >= 100 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
        '<div class="mono tiny right ' + (pct >= 100 ? 'good' : 'muted') + '">' +
          U.round(done, 0) + ' / ' + U.round(need, 0) + '</div></div>';
    }).join('');
    return rows + '<div class="row small" style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line-soft)">' +
      '<span class="muted">Build complete</span><span class="spacer"></span>' +
      '<span class="mono ' + ui.scoreClass(c.overall * 100) + '">' + U.fmtPct(c.overall * 100) + '</span></div>';
  }


  function coherencePanel() {
    var coh = PN.coherence.evaluate(D());
    var body =
      '<div class="row" style="margin-bottom:12px">' +
        '<div style="font:600 30px var(--mono);color:' + ui.scoreColour(coh.score) + '">' +
          Math.round(coh.score) + '</div>' +
        '<div class="small muted" style="line-height:1.45">Design coherence<br>' +
          '<span class="tiny faint">Does this game know what it is?</span></div></div>' +
      '<div class="row wrap" style="gap:5px;margin-bottom:13px">' +
        coh.topTags.slice(0, 8).map(function (t) { return ui.chip(t.tag); }).join('') + '</div>';

    if (coh.negatives.length) {
      body += '<div class="tiny faint" style="margin:11px 0 6px;letter-spacing:.08em;text-transform:uppercase">Pulling apart</div>';
      body += coh.negatives.slice(0, 4).map(function (h) {
        return '<div style="margin-bottom:9px">' +
          '<div class="small"><span class="chip bad">' + esc(h.a) + '</span> ' +
          '<span class="faint">vs</span> <span class="chip bad">' + esc(h.b) + '</span></div>' +
          '<div class="tiny faint" style="margin-top:3px;line-height:1.5">' + esc(h.note) + '</div></div>';
      }).join('');
    }
    if (coh.positives.length) {
      body += '<div class="tiny faint" style="margin:13px 0 6px;letter-spacing:.08em;text-transform:uppercase">Working together</div>';
      body += coh.positives.slice(0, 3).map(function (h) {
        return '<div style="margin-bottom:9px">' +
          '<div class="small"><span class="chip good">' + esc(h.a) + '</span> ' +
          '<span class="faint">+</span> <span class="chip good">' + esc(h.b) + '</span></div>' +
          '<div class="tiny faint" style="margin-top:3px;line-height:1.5">' + esc(h.note) + '</div></div>';
      }).join('');
    }
    return ui.panel('Coherence', body);
  }

  function audiencePanel() {
    var d = D(), st = PN.game.state;
    var ax = PN.axes.compute(d, { era: st.era });
    var fit = PN.axes.archetypeFit(d, ax, PN.game.state.era);
    var items = PN.tax.ARCHETYPES.map(function (a) {
      return { name: a.name, value: fit[a.id],
               color: fit[a.id] >= 62 ? '#5fd6a0' : fit[a.id] >= 45 ? '#ffc861' : '#ff7565' };
    }).sort(function (x, y) { return y.value - x.value; });
    return ui.panel('Who this game is for',
      PN.chart.bars(items, { max: 100, labelW: 104, fmt: function (v) { return Math.round(v); } }) +
      '<div class="tiny faint" style="margin-top:10px;line-height:1.5">Appeal per archetype, before they play it. ' +
      'This decides who even tries your game - and therefore who you have to keep happy.</div>',
      { hint: PN.tax.eraForYear(d.meta.startYear).name });
  }

  /* ============================================================ IDENTITY */

  function identityTab() {
    var d = D();
    var left =
      ui.panel('The game', ''
        + ui.text({ path: 'design.meta.name', label: 'Title', value: d.meta.name })
        + ui.text({ path: 'design.meta.studio', label: 'Studio', value: d.meta.studio })
        + ui.text({ path: 'design.meta.tagline', label: 'Tagline', value: d.meta.tagline,
            desc: 'One line. If you cannot write it, the design is not focused yet.' })
        + ui.select({ path: 'design.identity.setting', label: 'Setting',
            value: d.identity.setting, options: prim.SETTINGS })
        + ui.slider({ path: 'design.identity.productionValue', label: 'Production values',
            value: d.identity.productionValue,
            desc: 'Art, audio, animation, polish. Measured against what your era expects - and that bar keeps rising.' })
      )
      + ui.panel('Core pillars', ''
        + ui.select({ path: 'design.identity.combat', label: 'Combat paradigm',
            value: d.identity.combat, options: prim.COMBAT_PARADIGMS })
        + ui.select({ path: 'design.identity.world', label: 'World structure',
            value: d.identity.world, options: prim.WORLD_STRUCTURES })
        + ui.select({ path: 'design.identity.roleSystem', label: 'Role system',
            value: d.identity.roleSystem, options: prim.ROLE_SYSTEMS })
        + ui.select({ path: 'design.identity.deathPenalty', label: 'Death penalty',
            value: d.identity.deathPenalty,
            options: prim.DEATH_PENALTIES.map(function (x) {
              return { id: x.id, name: x.name, desc: 'Harshness ' + x.harsh + '/100' }; }) })
        + ui.slider({ path: 'design.identity.sessionTargetMin', label: 'Designed session length',
            value: d.identity.sessionTargetMin, min: 15, max: 240, step: 5,
            fmt: function (v) { return v + ' min'; },
            desc: 'What one satisfying sitting looks like. Raid nights and bus journeys are different games.' })
      )
      ;

    var right =
      ui.panel('Factions & identity', ''
        + ui.select({ path: 'design.factions.relationship', label: 'Faction structure',
            value: d.factions.relationship, options: [
              { id: 'none', name: 'No factions', desc: 'One playerbase. Simplest to build and to balance.' },
              { id: 'soft', name: 'Soft factions', desc: 'Flavour and reputation, no hard division.' },
              { id: 'hardLocked', name: 'Two locked factions', desc: 'Classic war. Doubles content cost, halves your grouping pool, creates identity nothing else can.' },
              { id: 'threeWay', name: 'Three-way war', desc: 'Self-balancing PvP - the two losers gang up on the winner.' }] })
        + ui.number({ path: 'design.factions.count', label: 'Faction count', value: d.factions.count, min: 1, max: 4 })
        + ui.toggle({ path: 'design.factions.crossFactionPlay', label: 'Cross-faction grouping',
            value: d.factions.crossFactionPlay,
            desc: 'Fixes queue times. Costs the war some of its meaning.' })
        + ui.slider({ path: 'design.factions.factionContent', label: 'Faction-exclusive content',
            value: d.factions.factionContent,
            desc: 'Percentage of content built twice. Great for replay, brutal on budget.' })
        + ui.slider({ path: 'design.factions.creatorDepth', label: 'Character creator depth',
            value: d.factions.creatorDepth,
            desc: 'Roleplayers and completionists care about this more than any combat change you will ever ship.' })
      )
      + coherencePanel();

    return '<div class="grid g-1-2"><div>' + right + '</div><div>' + left + '</div></div>';
  }

  /* ========================================================= PROGRESSION */

  function progressionTab() {
    var d = D(), P = d.progression;
    var isRank = P.model === 'rank';

    var left = ui.panel('Progression model', ''
      + ui.select({ path: 'design.progression.model', label: 'Model',
          value: P.model, options: prim.PROGRESSION_MODELS })
      + (isRank ? '' :
          ui.number({ path: 'design.progression.levelCap', label: 'Level cap', value: P.levelCap,
            min: 1, max: PN.research.limits(PN.game.state).levelCap,
            desc: 'Research raises this ceiling ten levels at a time.' })
        + ui.select({ path: 'design.progression.xpShape', label: 'XP curve', value: P.xpShape, options: [
            { id: 'linear', name: 'Linear', desc: 'Every level costs the same. Predictable, a little flat.' },
            { id: 'exponential', name: 'Exponential', desc: 'Each level costs more. The classic wall at the end.' },
            { id: 'banded', name: 'Banded', desc: 'Cost steps up per tier. Easiest to tune around content.' },
            { id: 'flat', name: 'Flat / trivial', desc: 'Levelling is a tutorial, not a journey.' }] })
        + ui.slider({ path: 'design.progression.xpSteepness', label: 'Curve steepness', value: P.xpSteepness })
        + ui.slider({ path: 'design.progression.timeToCapHours', label: 'Time to cap',
            value: P.timeToCapHours, min: 5, max: 500, step: 5,
            fmt: function (v) { return v + ' h'; },
            desc: 'How long the journey to endgame takes. This is authored content that burns down exactly once per character.' }))
      + ui.slider({ path: 'design.progression.verticalRatio', label: 'Vertical vs horizontal power',
          value: P.verticalRatio,
          fmt: function (v) { return v > 70 ? 'Mostly vertical' : v > 40 ? 'Mixed' : 'Mostly horizontal'; },
          desc: 'The dial that separates a gear treadmill from an evergreen world. Vertical keeps progressors; horizontal keeps everyone else.' })
    );

    var mid = ui.panel('Friction & catch-up', ''
      + ui.slider({ path: 'design.progression.catchUp', label: 'Catch-up mechanics', value: P.catchUp,
          desc: 'Lets returning and late players reach the current tier. Veterans will call it a participation trophy.' })
      + ui.slider({ path: 'design.progression.altFriction', label: 'Alt friction', value: P.altFriction,
          desc: 'How painful a second character is. High friction protects your main-character fantasy and murders your alt-friendly audience.' })
      + ui.slider({ path: 'design.progression.respecFriction', label: 'Respec friction', value: P.respecFriction })
      + ui.slider({ path: 'design.progression.accountWide', label: 'Account-wide progress', value: P.accountWide })
      + ui.toggle({ path: 'design.progression.levelScaling', label: 'Level scaling', value: P.levelScaling,
          desc: 'Old zones stay relevant. Enormous value from content you already built.' })
      + ui.toggle({ path: 'design.progression.mentoring', label: 'Mentoring / sidekicking', value: P.mentoring })
      + ui.toggle({ path: 'design.progression.prestige', label: 'Prestige levels', value: P.prestige })
      + ui.toggle({ path: 'design.progression.alternateAdvancement', label: 'Alternate advancement',
          value: P.alternateAdvancement,
          desc: 'A parallel ladder that never ends. Keeps progressors at the cap for years.' })
    );

    /* The single biggest fork in the design: does a player pick a class,
       or build one? Everything downstream reads whichever answer this
       gives, so the two systems are genuinely exclusive.               */
    var isTalent = PN.talents.isTalentMode(d);
    var tm = isTalent ? PN.talents.treeMetrics(d) : null;

    var sysBody = ''
      + '<div class="syspick">'
      + '<div class="syscard' + (isTalent ? '' : ' on') + '" data-act="prog.system" data-val="class">'
      +   '<div class="t">Class-based</div>'
      +   '<div class="s">Players pick one of the classes you author. You control '
      +     'exactly what every character can do, and you own the balance of it.</div>'
      +   '<div class="tiny faint" style="margin-top:7px">'
      +     d.classes.length + ' class' + (d.classes.length === 1 ? '' : 'es') + ' authored</div>'
      + '</div>'
      + '<div class="syscard' + (isTalent ? ' on' : '') + '" data-act="prog.system" data-val="talent">'
      +   '<div class="t">Talent-based</div>'
      +   '<div class="s">No classes. Players spend points in a tree you design, and '
      +     'their build is whatever they climbed. Freedom for them, balance work for you.</div>'
      +   '<div class="tiny faint" style="margin-top:7px">'
      +     (tm ? tm.branches + ' branches, ' + tm.nodes + ' nodes' : 'not built yet') + '</div>'
      + '</div>'
      + '</div>'
      + (isTalent
          ? ui.slider({ path: 'design.progression.talentPointsPerLevel', label: 'Talent points per level',
              value: P.talentPointsPerLevel, min: 0.1, max: 3, step: 0.05,
              fmt: function () { return PN.talents.pointsBudget(d) + ' pts at cap'; },
              desc: 'The budget is the balance. Too few and nobody feels powerful; too many and every build takes everything.' })
          + '<div class="grid g3" style="margin-top:10px">'
          + ui.stat('Tree quality', Math.round(tm.quality), null, ui.scoreClass(tm.quality))
          + ui.stat('Reach at cap', Math.round(tm.reach) + '%',
              tm.reach > 85 ? 'no real choice' : 'of all nodes')
          + ui.stat('Build diversity', Math.round(tm.diversity) + '%', null,
              ui.scoreClass(tm.diversity))
          + '</div>'
          + '<div class="row" style="margin-top:10px"><button class="sm" data-act="design.tab" data-val="classes">'
          + 'Open the talent designer</button></div>'
          : '<div class="tiny faint" style="margin-top:10px;line-height:1.55">'
          + 'Switching to talents folds your classes into a starting tree, and locks the '
          + 'class editor. Switching back restores them.</div>');

    var right = ui.panel('Character system', sysBody) + audiencePanel();

    return '<div class="grid g3"><div>' + left + xpPanel() + '</div><div>' + mid +
           '</div><div>' + right + '</div></div>';
  }

  /* What the four sliders above actually produced.

     Curve shape, steepness, cap and time-to-cap all feed one number
     nothing ever showed: what a level costs. So writing a quest meant
     guessing whether fifty experience or fifty thousand was the right
     award, and the two are four orders of magnitude apart. */
  function xpPanel() {
    var d = D(), P = d.progression;
    if (P.model === 'rank' || P.levelCap < 2) return '';
    var plan = PN.agents.xpPlan(d);
    if (!plan.perLevel.length) return '';

    /* The curve itself, thinned so a ninety-level game still draws. */
    var step = Math.max(1, Math.round(plan.perLevel.length / 40));
    var series = [];
    for (var i = 0; i < plan.perLevel.length; i += step) series.push(plan.perLevel[i].xp);

    /* A handful of levels, and what one costs there. */
    var marks = [1, Math.round(P.levelCap * 0.25), Math.round(P.levelCap * 0.5),
                 Math.max(1, P.levelCap - 1)];
    var seen = {};
    var markRows = marks.filter(function (l) {
      if (l < 1 || l >= P.levelCap || seen[l]) return false;
      seen[l] = 1; return true;
    }).map(function (l) {
      var cost = PN.agents.xpForLevel(d, l);
      return '<tr><td class="mono">' + l + '&nbsp;&rarr;&nbsp;' + (l + 1) + '</td>' +
        '<td class="num mono">' + U.fmtCompact(cost) + '</td>' +
        '<td class="num faint">' + U.fmtCompact(Math.round(cost / 20)) + '</td></tr>';
    }).join('');

    /* What questing alone would have to be worth. This is the number
       somebody writing a quest is actually looking for. */
    var per = plan.perQuest;
    var advice = plan.quests > 0
      ? 'You have ' + U.fmtInt(plan.quests) + ' quest' + (plan.quests === 1 ? '' : 's') +
        '. Carrying one character from 1 to ' + P.levelCap + ' on questing alone means about ' +
        '<b style="color:var(--text)">' + U.fmtCompact(Math.round(per)) + '</b> experience each. ' +
        'Award less and the gaps are filled by grinding; award much more and the zones you ' +
        'built go past in a blur.'
      : 'No quests authored yet. When you write one, the experience it awards is measured ' +
        'against these numbers.';

    return ui.panel('The levelling curve', ''
      + '<div class="grid g3">'
      + ui.stat('Total to cap', U.fmtCompact(Math.round(plan.total)), 'experience')
      + ui.stat('First level', U.fmtCompact(Math.round(plan.first)))
      + ui.stat('Last level', U.fmtCompact(Math.round(plan.last)))
      + '</div>'
      + PN.chart.line([{ name: 'XP per level', data: series, color: '#5fb3ff' }],
          { height: 96 })
      + '<table class="data" style="margin-top:8px">'
      + '<tr><th>Level</th><th class="num">Costs</th><th class="num">5% of it</th></tr>'
      + markRows + '</table>'
      + '<div class="tiny faint" style="margin-top:9px;line-height:1.6">' + advice + '</div>',
      { hint: U.round(P.timeToCapHours, 0) + 'h of content authored' });
  }

  /* ============================================================= CLASSES */

  function classesTab() {
    var d = D();
    var bal = met.balanceState(d);
    var evals = PN.combat.evaluateAll(d);
    var current = sel().classId ? U.byId(d.classes, sel().classId) : d.classes[0];
    if (current) sel().classId = current.id;

    var list = d.classes.map(function (c) {
      var ev = evals.byId[c.id];
      var per = null;
      bal.perClass.forEach(function (p) { if (p.cls.id === c.id) per = p; });
      var dev = per && per.pveDev !== undefined ? per.pveDev : 0;
      var flag = Math.abs(dev) > 0.16
        ? '<span class="chip ' + (dev > 0 ? 'bad' : 'warn') + '">' + U.fmtSigned(dev * 100, 0) + '%</span>' : '';
      return '<div class="item' + (current && c.id === current.id ? ' on' : '') +
        '" data-act="cls.select" data-val="' + c.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(c.name) + '</div>' +
        '<div class="s">' + U.titleCase(c.role) + ' &middot; ' + (c.abilities || []).length + ' abilities' +
        (ev ? ' &middot; PvE ' + Math.round(ev.pveScore) + ' / PvP ' + Math.round(ev.pvpScore) : '') +
        '</div></div><span class="spacer"></span>' + flag + '</div>';
    }).join('') || ui.empty('No classes yet.', 'A game with no classes has nothing for anyone to be.');

    /* The balance table the player actually tunes against. */
    /* Every build is scored at the race a player would actually roll
       it as, so the table has to say which - otherwise the numbers
       move when you edit a race and nothing on screen explains it. */
    var raced = PN.races.enabled(d);
    var balTable = evals.list.length
      ? '<table class="data"><tr><th>Class</th><th>Role</th>' +
        (raced ? '<th>Race</th>' : '') +
        '<th class="num">DPS</th>' +
        '<th class="num">HPS</th><th class="num">EHP</th><th class="num">PvE</th><th class="num">PvP</th></tr>' +
        evals.list.slice().sort(function (a, b) { return b.pveScore - a.pveScore; })
        .map(function (r) {
          return '<tr class="click" data-act="cls.select" data-val="' + r.cls.id + '">' +
            '<td>' + esc(r.cls.name) + (r.resourceStarved ? ' <span class="chip warn">starved</span>' : '') + '</td>' +
            '<td class="small muted">' + U.titleCase(r.cls.role) + '</td>' +
            (raced ? '<td class="small accent">' + esc(r.raceName || '-') + '</td>' : '') +
            '<td class="num">' + U.fmtCompact(r.dps) + '</td>' +
            '<td class="num">' + (r.hps > 1 ? U.fmtCompact(r.hps) : '-') + '</td>' +
            '<td class="num">' + U.fmtCompact(r.ehp) + '</td>' +
            '<td class="num ' + ui.scoreClass(r.pveScore) + '">' + Math.round(r.pveScore) + '</td>' +
            '<td class="num ' + ui.scoreClass(r.pvpScore) + '">' + Math.round(r.pvpScore) + '</td></tr>';
        }).join('') + '</table>' +
        '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Scores are relative to the other classes ' +
        'in your own game - balance is always relative. 50 is the middle of your roster.' +
        (raced ? ' Each build is measured at the race that suits it best, because that is ' +
          'the one an informed player rolls - a race that suits nothing is a dead option, ' +
          'not an imbalance.' : '') + '</div>'
      : ui.empty('No classes to compare.');

    var balBody =
      '<div class="row" style="margin-bottom:10px">' +
        '<div style="font:600 26px var(--mono);color:' + ui.scoreColour(bal.quality) + '">' +
          Math.round(bal.quality) + '</div>' +
        '<div class="small muted">Balance quality<br><span class="tiny faint">Spread ' +
          U.fmtPct(bal.spread) + ' within role</span></div></div>';
    if (bal.perClass.length) {
      balBody += PN.chart.bars(bal.perClass.map(function (p) {
        return { name: p.cls.name, value: p.representation * 100,
                 color: p.representation > 1.6 / Math.max(1, bal.perClass.length) ? '#ff7565' : '#5fb3ff' };
      }), { labelW: 88, fmt: function (v) { return U.fmtPct(v, 0); } });
      balBody += '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Projected representation. ' +
        'Players flock to whatever is strongest, then complain everyone plays the same thing.</div>';
    }

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Classes', list, {
        actions: '<button class="sm" data-act="cls.add">Add class</button>',
        hint: d.classes.length + ' total' }) +
      ui.panel('Balance', balBody) +
      '</div><div>' +
      (current ? classEditor(current, evals.byId[current.id]) : ui.panel('Editor', ui.empty('Select a class.'))) +
      ui.panel('Balance table', balTable) +
      '</div></div>';
  }

  /* Why this kit gears the way it does. Which stat a class ends up on is
     the single most confusing derived number in the design, because it
     comes out of the abilities rather than out of a field - so show the
     working rather than making the author guess. */
  function statExplainer(d, playable) {
    var split = PN.abilities.statSplit(d, PN.abilities.abilitiesOf(d, playable));
    var opens = {};
    PN.builds.statsFor(d, playable, playable.role).forEach(function (p) { opens[p.id] = 1; });
    var prims = PN.stats.statSetOf(d).primaries;

    if (split.total <= 0) {
      return '<div class="tiny faint" style="margin-top:8px;line-height:1.55">Nothing in this '
        + 'kit scales off a primary stat yet, so every stat is still open.</div>';
    }

    /* One row per stat, because the power classes behind them are not the
       thing the author named their stats after. */
    var rows = prims.map(function (p) {
      var share = split.shareOf(p);
      var pinned = split.byStat[p.id] || 0;
      var on = !!opens[p.id];
      return '<div class="statrow' + (on ? ' on' : '') + '">'
        + '<span class="sr-n">' + esc(p.name) + '</span>'
        + '<span class="sr-bar"><span style="width:' + U.round(share * 100, 1) + '%"></span></span>'
        + '<span class="sr-v mono">' + U.round(share * 100, 0) + '%</span>'
        + '<span class="sr-t tiny faint">' + (pinned > 0
            ? U.round(pinned / split.total * 100, 0) + '% named it'
            : (p.powers === 'both' ? 'either power'
               : p.powers === 'spell' ? 'spell power' : 'attack power')) + '</span></div>';
    }).join('');

    var namedShare = 0;
    U.keys(split.byStat).forEach(function (k) { namedShare += split.byStat[k]; });
    namedShare = namedShare / split.total;

    return '<div style="margin-top:9px">' + rows
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">'
      + 'A stat opens as a build once it drives 40% of this kit\'s output, weighted by '
      + 'coefficient rather than by button count. '
      + (namedShare >= 0.999
          ? 'Every ability here names the stat it scales off.'
          : U.round((1 - namedShare) * 100, 0) + '% of the output only says "attack power" '
            + 'or "spell power", so it counts for every stat of that class at once. Set '
            + '<i>Scales off</i> on those abilities to a stat by name to tell them apart.')
      + '</div></div>';
  }

  function classEditor(c, ev) {
    var d = D(), m = met.classMetrics(d, c);
    var para = prim.find(prim.COMBAT_PARADIGMS, d.identity.combat);
    var AB = PN.abilities;

    var owned = AB.abilitiesOf(d, c);
    var ownedHtml = owned.map(function (ab) {
      var bits = [];
      if (ab.cooldown > 0) bits.push(ab.cooldown + 's cd');
      if (ab.castTime > 0) bits.push(ab.castTime + 's cast');
      if (ab.resourceCost > 0) bits.push(ab.resourceCost + ' cost');
      return '<div class="item" data-act="abl.openFromClass" data-val="' + ab.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(ab.name) + '</div>' +
        '<div class="s">' + esc(bits.join(' · ') || 'instant, free') + '</div></div>' +
        '<span class="spacer"></span>' +
        '<button class="xs ghost" data-act="cls.unassign" data-val="' + ab.id + '">remove</button></div>';
    }).join('') || ui.empty('No abilities.', 'Add one from a template below, or write one in the Abilities tab.');

    var unassigned = (d.abilities || []).filter(function (ab) {
      var taken = false;
      d.classes.forEach(function (x) { if ((x.abilities || []).indexOf(ab.id) >= 0) taken = true; });
      return !taken;
    });
    var pool = unassigned.length
      ? '<div class="tiny faint" style="margin:10px 0 5px;letter-spacing:.08em;text-transform:uppercase">Unassigned abilities</div>' +
        '<div class="row wrap" style="gap:4px">' + unassigned.map(function (ab) {
          return '<span class="chip click" data-act="cls.assign" data-val="' + ab.id + '">+ ' +
            esc(ab.name) + '</span>'; }).join('') + '</div>'
      : '';

    var quickAdd = '<div class="tiny faint" style="margin:12px 0 5px;letter-spacing:.08em;text-transform:uppercase">Add from template</div>' +
      AB.TEMPLATE_GROUPS.map(function (g) {
        return '<div style="margin-bottom:7px"><div class="tiny faint" style="margin-bottom:3px">' + esc(g.name) + '</div>' +
          '<div class="row wrap" style="gap:4px">' +
          AB.TEMPLATES.filter(function (t) { return t.group === g.id; }).map(function (t) {
            return '<span class="chip click" data-act="cls.addTemplate" data-val="' + t.id + '">+ ' +
              esc(t.name) + '</span>'; }).join('') + '</div></div>';
      }).join('');

    var verdict = ev
      ? '<div class="grid g3" style="margin-top:12px">' +
        ui.stat('PvE score', Math.round(ev.pveScore), 'vs your roster', ui.scoreClass(ev.pveScore)) +
        ui.stat('PvP score', Math.round(ev.pvpScore), 'vs your roster', ui.scoreClass(ev.pvpScore)) +
        ui.stat('DPS', U.fmtCompact(ev.dps), 'single target') +
        ui.stat('AoE DPS', U.fmtCompact(ev.aoeDps)) +
        ui.stat('HPS', ev.hps > 1 ? U.fmtCompact(ev.hps) : '-') +
        ui.stat('Effective HP', U.fmtCompact(ev.ehp)) +
        '</div>' +
        '<div class="grid g2" style="margin-top:10px">' +
        ui.stat('Kills an elite in', U.round(ev.ttkSolo, 1) + 's') +
        ui.stat('Kills a player in', isFinite(ev.ttkPvp) ? U.round(ev.ttkPvp, 1) + 's' : '-') +
        '</div>'
      : '';

    var rotation = ev && ev.single.casts.length
      ? '<div class="tiny faint" style="margin:14px 0 6px;letter-spacing:.08em;text-transform:uppercase">Solved rotation (2 minutes)</div>' +
        '<table class="data"><tr><th>Ability</th><th class="num">Casts</th><th class="num">Share of damage</th></tr>' +
        ev.single.casts.slice(0, 8).map(function (e) {
          var share = ev.single.dps > 0 ? (e.v.damage * e.casts) / (ev.single.dps * 120) * 100 : 0;
          return '<tr><td>' + esc(e.ab.name) + '</td><td class="num">' + e.casts + '</td>' +
            '<td class="num">' + U.fmtPct(share, 1) + '</td></tr>';
        }).join('') + '</table>'
      : '';

    var metricRows = [
      ['Skill floor', m.skillFloor, 'How much the class demands before it works at all'],
      ['Skill ceiling', m.skillCeiling, 'How much it rewards mastery'],
      ['Rotation depth', m.rotationDepth, 'How much there is to think about'],
      ['Fantasy clarity', m.fantasyClarity, 'Does it read as one distinct thing'],
      ['Role fitness', m.roleFitness, 'Does it actually do its job']
    ].map(function (r) {
      return '<div class="axisrow" style="grid-template-columns:minmax(0,104px) minmax(0,1fr) 42px" title="' + esc(r[2]) + '">' +
        '<div class="nm">' + r[0] + '</div>' +
        '<div class="track"><i style="width:' + U.clamp(r[1], 0, 100).toFixed(1) +
          '%;background:var(--accent)"></i></div>' +
        '<div class="num">' + Math.round(r[1]) + '</div></div>';
    }).join('');

    var warn = '';
    if (m.bloat > 0) warn += '<div class="chip bad">' + m.bloat +
      ' buttons over what ' + para.name + ' comfortably supports</div> ';
    if (m.roleFitness < 45) warn += '<div class="chip warn">This ' + c.role +
      ' cannot really do its job yet</div> ';
    if (ev && ev.resourceStarved) warn += '<div class="chip warn">Kit costs more resource than regen supports</div> ';
    if (ev && ev.gcdFill < 0.75) warn += '<div class="chip warn">Only ' +
      U.fmtPct(ev.gcdFill * 100, 0) + ' of the rotation is filled - add a filler</div> ';
    if (m.paradigmFriction > 35) warn += '<div class="chip warn">Fights its own combat paradigm</div>';

    return ui.panel('Editing: ' + c.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'classSel.name', label: 'Name', value: c.name })
      + ui.select({ path: 'classSel.role', label: 'Role', value: c.role, options: [
          { id: 'tank', name: 'Tank' }, { id: 'healer', name: 'Healer' },
          { id: 'dps', name: 'Damage' }, { id: 'hybrid', name: 'Hybrid' }] })
      + '</div><div>'
      + ui.text({ path: 'classSel.fantasy', label: 'Fantasy', value: c.fantasy,
          desc: 'One phrase. What is the player pretending to be?' })
      + ui.select({ path: 'classSel.primaryStat', label: 'Primary stat',
          value: c.primaryStat || '',
          options: [{ id: '', name: 'Derive from the kit (' +
            (PN.combat.primaryFor(d, c) || { name: '-' }).name + ')' }].concat(
            PN.stats.statSetOf(d).primaries.map(function (p) {
              return { id: p.id, name: p.name }; })),
          desc: 'Which stat this class gears for. Derived from what its abilities actually scale off unless you pin it here.' })
      + PN.viewsDesign.statExplainer(d, c)
      + ui.slider({ path: 'classSel.tuning', label: 'Global tuning', value: c.tuning || 0,
          min: -40, max: 40, fmt: function (v) { return U.fmtSigned(v, 0) + '%'; },
          desc: 'A blunt multiplier for hotfixes. Real balance happens in the ability numbers.' })
      + '</div></div>'
      + '<div class="tiny faint" style="margin:10px 0 6px;letter-spacing:.08em;text-transform:uppercase">Ability kit</div>'
      + ownedHtml + pool + quickAdd
      + (warn ? '<div class="row wrap" style="gap:5px;margin-top:12px">' + warn + '</div>' : '')
      + verdict + rotation
      + '<div style="margin-top:12px">' + metricRows + '</div>',
      { actions: '<button class="sm danger" data-act="cls.remove" data-val="' + c.id + '">Delete</button>',
        hint: m.buttons + ' abilities · comfort ' + para.buttonComfort });
  }

  /* ============================================================= SYSTEMS */

  function systemsTab() {
    var d = D();
    var eng = met.engineOutput(d);

    var engineCards = prim.CONTENT_ENGINES.map(function (def) {
      var e = S.engineOf(d, def.id);
      var on = !!(e && e.enabled);
      return '<div style="background:var(--panel-2);border:1px solid ' +
        (on ? 'var(--accent-dim)' : 'var(--line-soft)') + ';border-radius:8px;padding:11px 13px;margin-bottom:8px">' +
        '<div class="row"><div class="toggle' + (on ? ' on' : '') + '" data-act="engine.toggle" data-val="' + def.id + '">' +
        '<span class="box"></span><span class="lbl">' + esc(def.name) + '</span></div>' +
        '<span class="spacer"></span>' +
        (on ? '<span class="mono tiny accent">' + U.round(def.rate * (0.35 + e.investment / 100 * 0.9), 1) +
              ' h/wk</span>' : '') + '</div>' +
        '<div class="tiny faint" style="margin-top:5px;line-height:1.5">' + esc(def.desc) + '</div>' +
        (on ? ui.rangeAct({ label: 'Investment', act: 'engine.invest', val: def.id,
                            value: e.investment, min: 10, max: 100, cls: 'narrow' }) : '') +
        '</div>';
    }).join('');

    /* Bad-luck protection, crafted parity, item-level bands and rarity
       tiers all used to be sliders here. Every one of them is now read
       off what you authored - the loot tables, the recipes, the items -
       so the panel only carries the decisions that are not written down
       anywhere else. */
    var craftSum = PN.crafting.summary(d);
    var blpAvg = (d.lootTables || []).length
      ? U.avg(d.lootTables, function (t) { return t.badLuckProtection || 0; }) : 0;
    var gearItems = (d.items || []).filter(function (i) { return i.kind === 'gear'; });
    var gearCount = gearItems.length;
    var gearLo = gearCount ? Math.min.apply(null, gearItems.map(function (i) {
      return i.itemLevel || 0; })) : 0;
    var gearHi = gearCount ? Math.max.apply(null, gearItems.map(function (i) {
      return i.itemLevel || 0; })) : 0;
    /* Carrying space, which is the sum of the bags a player owns plus
       whatever the backpack gives everybody. A game with no bags and
       no backpack is a game whose players cannot pick anything up. */
    var bags = (d.items || []).filter(function (i) { return i.kind === 'container'; });
    var backpack = (d.gearing || {}).backpackSlots || 0;
    var bagMost = 0;
    bags.forEach(function (b) {
      bagMost += Math.max(0, b.slots || 0) *
                 Math.max(0, b.maxCarried === undefined ? 4 : b.maxCarried);
    });
    var carry = ui.panel('Carrying space', ''
      + ui.number({ path: 'design.gearing.backpackSlots', label: 'Starting backpack',
          value: backpack, min: 0, max: 40,
          desc: 'What every character can carry before they own a single bag. Zero makes the first bag the best item in your game.' })
      + '<div class="grid g2" style="margin-top:8px">'
      + ui.stat('Bags authored', bags.length, bags.length ? null : 'nobody can carry anything',
          bags.length ? '' : 'bad')
      + ui.stat('Most slots possible', backpack + bagMost, 'backpack plus every bag')
      + '</div>'
      + '<div class="tiny faint" style="margin-top:9px;line-height:1.6">'
      + 'One slot holds one kind of thing; identical items stack. A player with no room '
      + 'still equips gear that is an upgrade and still vendors what is not - they just '
      + 'cannot keep a reagent, a flask or a scroll, which takes your crafting economy '
      + 'with it.</div>'
      + (!bags.length && !backpack
          ? '<div class="chip bad" style="margin-top:9px;display:block;line-height:1.55">'
            + 'Nobody in your game can carry anything. Author a bag, or give everybody a '
            + 'starting backpack.</div>'
          : ''));

    var gearing = ui.panel('Gearing & loot', ''
      + ui.slider({ path: 'design.gearing.resetSeverity', label: 'Tier reset severity',
          value: d.gearing.resetSeverity,
          desc: 'How hard each new tier invalidates the last. The treadmill, and the resentment, both live here.' })
      + ui.select({ path: 'design.gearing.lootMode', label: 'Loot mode', value: d.gearing.lootMode, options: [
          { id: 'personal', name: 'Personal loot', desc: 'No arguments, no trading, no drama. Some would say no community.' },
          { id: 'group', name: 'Group loot' },
          { id: 'needGreed', name: 'Need before greed' },
          { id: 'master', name: 'Master looter', desc: 'Maximum guild control. Maximum guild drama.' }] })
      + ui.toggle({ path: 'design.gearing.upgradeTrack', label: 'Upgrade tracks', value: d.gearing.upgradeTrack })
      + ui.toggle({ path: 'design.gearing.borrowedPower', label: 'Borrowed power systems', value: d.gearing.borrowedPower,
          desc: 'Power that gets taken away next expansion. Fills a patch, empties the goodwill.' })
      + ui.toggle({ path: 'design.gearing.setBonuses', label: 'Set bonuses', value: d.gearing.setBonuses })
      + ui.toggle({ path: 'design.gearing.socketing', label: 'Sockets & enchants', value: d.gearing.socketing })
      + ui.toggle({ path: 'design.gearing.legendaryChains', label: 'Legendary questlines', value: d.gearing.legendaryChains })
      + ui.toggle({ path: 'design.gearing.tradeable', label: 'Gear is tradeable', value: d.gearing.tradeable })
      + '<div class="subhead spaced">Measured, not set</div>'
      + '<div class="grid g3">'
      + ui.stat('Bad-luck protection', U.round(blpAvg, 0) + '%',
          (d.lootTables || []).length + ' loot tables')
      + ui.stat('Crafted vs dropped',
          craftSum.makesGear ? U.round(craftSum.parity, 0) + '%' : '-',
          craftSum.makesGear ? craftSum.competitive + ' of ' + craftSum.makesGear + ' compete'
                             : 'no gear recipes')
      + ui.stat('Gear pieces', U.fmtInt(gearCount), 'ilvl ' + gearLo + '-' + gearHi)
      + '</div>'
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">These were sliders. '
      + 'They are now read off your loot tables, your recipes and your items, so they cannot '
      + 'disagree with the game.</div>'
    );



    var engineSummary = '<div class="grid g2" style="margin-bottom:12px">' +
      ui.stat('Repeatable hours', U.round(U.sum(PN.tax.CATEGORY_IDS, function (c) { return eng.hours[c] || 0; }), 1) + ' /wk',
        'before diminishing returns') +
      ui.stat('Grind intensity', Math.round(eng.grindIntensity), null,
        eng.grindIntensity > 60 ? 'bad' : eng.grindIntensity > 38 ? 'warn' : 'good') +
      '</div>' +
      '<div class="tiny faint" style="margin-bottom:12px;line-height:1.5">Content engines manufacture hours forever ' +
      'instead of burning down. They are the only thing standing between you and a permanent drought - but bolting on ' +
      'a tenth grind does not give players a tenth more to do, it gives them another chore.</div>';

    /* How you run the game week to week is a systems decision - a patch
       cadence, a hotfix speed, how much of a test realm you keep. It
       lived on the roadmap beside the releases it describes, which is
       where you read it, not where you set it. */
    return '<div class="grid g-1-2"><div>' +
      ui.panel('Content engines', engineSummary + engineCards) +
      liveOpsPanel() +
      '</div><div>' + gearing + carry + '</div></div>';
  }

  /* ------------------------------------------ the money and the people

     These are design decisions, and they read off the DRAFT like every
     other design decision - but they belong beside the screens that
     show you what they did, not in a menu of their own. The Economy
     screen carries the economy; the Community screen carries the
     social graph; the money model sits with the money.            */

  function economyPanel() {
    var d = D();
    return ui.panel('Economy', ''
      + ui.number({ path: 'design.economy.currencies', label: 'Currencies', value: d.economy.currencies, min: 1, max: 12 })
      + ui.slider({ path: 'design.economy.faucetRate', label: 'Currency faucets', value: d.economy.faucetRate })
      + ui.slider({ path: 'design.economy.sinkRate', label: 'Currency sinks', value: d.economy.sinkRate,
          desc: 'Faucets above sinks means inflation. Inflation prices out every new player you acquire.' })
      + (d.economy.faucetRate - d.economy.sinkRate > 14
          ? '<div class="chip bad" style="margin-bottom:10px">Inflationary by ' +
            U.round(d.economy.faucetRate - d.economy.sinkRate, 1) + ' points</div>' : '')
      + ui.slider({ path: 'design.economy.gatheringNodes', label: 'Gathering density',
          value: d.economy.gatheringNodes,
          desc: 'How thick the ore and herbs are on the ground. Sets how fast reagents come in, and so how fast anything gets crafted.' })
      + ui.slider({ path: 'design.economy.antiRmtSpend', label: 'Anti-RMT investment', value: d.economy.antiRmtSpend })
      + ui.toggle({ path: 'design.economy.tradingEnabled', label: 'Player trading', value: d.economy.tradingEnabled })
      + ui.toggle({ path: 'design.economy.auctionHouse', label: 'Auction house', value: d.economy.auctionHouse })
    );
  }

  /* Live operations. How you run the game week to week - a patch
     cadence and a hotfix speed are not economics, so this sits with
     the patches it describes. */
  function liveOpsPanel() {
    var d = D();
    return ui.panel('Live operations', ''
      + ui.slider({ path: 'design.liveOps.majorContentWeeks', label: 'Major content cadence',
          value: d.liveOps.majorContentWeeks, min: 4, max: 78, fmt: function (v) { return 'every ' + v + ' weeks'; },
          desc: 'Your target. Whether you hit it is a matter for your capacity, not your intentions.' })
      + ui.slider({ path: 'design.liveOps.ptrUse', label: 'Public test realm use', value: d.liveOps.ptrUse,
          desc: 'Catches bugs before players do. Also spoils every surprise you were saving.' })
      + ui.slider({ path: 'design.liveOps.hotfixSpeed', label: 'Hotfix speed', value: d.liveOps.hotfixSpeed })
      + ui.slider({ path: 'design.liveOps.balancePassEffort', label: 'Balance effort', value: d.liveOps.balancePassEffort })
      + ui.slider({ path: 'design.liveOps.transparency', label: 'Transparency', value: d.liveOps.transparency })
      + ui.slider({ path: 'design.liveOps.commsFrequency', label: 'Communication frequency', value: d.liveOps.commsFrequency })
      + ui.slider({ path: 'design.liveOps.moderationSpend', label: 'Moderation', value: d.liveOps.moderationSpend })
      + ui.slider({ path: 'design.liveOps.antiCheatSpend', label: 'Anti-cheat', value: d.liveOps.antiCheatSpend })
    );
  }

  /* The servers. Sits on the dashboard, where the queues and outages
     they cause are already being reported. */
  function infraPanel() {
    var d = D();
    var room = PN.infra.capacity(d);
    var marg = PN.infra.marginal(d);
    var here = PN.game.state && PN.game.state.population
             ? PN.game.state.population.total : 0;
    return ui.panel('Infrastructure', ''
      + '<div class="grid g3">'
      + ui.stat('Room for', U.fmtCompact(room) + ' players',
          here ? U.fmtCompact(here) + ' are here' : 'before anyone arrives',
          here > room ? 'bad' : here > room * 0.85 ? 'warn' : 'good')
      + ui.stat('Another realm', '+' + U.fmtCompact(marg.region), 'players')
      + ui.stat('Weekly bill', U.fmtMoney(PN.infra.upkeep(d)))
      + '</div>'
      + (here > room
          ? '<div class="chip bad" style="margin:10px 0">' + U.fmtCompact(here - room) +
            ' players are queueing. Open ' + Math.ceil((here - room) / Math.max(1, marg.region)) +
            ' more realm' + (Math.ceil((here - room) / Math.max(1, marg.region)) === 1 ? '' : 's') +
            ' or raise your headroom.</div>' : '')
      + ui.number({ path: 'design.infra.regions', label: 'Regions', value: d.infra.regions, min: 1, max: 40 })
      + ui.slider({ path: 'design.infra.capacityHeadroom', label: 'Capacity headroom', value: d.infra.capacityHeadroom,
          desc: 'Over-provision for launch day, or explain the four-hour queues.' })
      + ui.slider({ path: 'design.infra.redundancy', label: 'Redundancy', value: d.infra.redundancy })
      + ui.slider({ path: 'design.infra.serverTech', label: 'Server technology',
          value: d.infra.serverTech, min: 0, max: PN.research.limits(PN.game.state).serverTech,
          desc: 'How far you can push the hardware. Research raises the ceiling and cuts the bill.' })
    );
  }

  function socialPanel() {
    var d = D();
    return ui.panel('Social', ''
      + ui.number({ path: 'design.social.guildSize', label: 'Guild size cap', value: d.social.guildSize, min: 5, max: 1000, step: 5 })
      + ui.slider({ path: 'design.social.lfgDepth', label: 'Group finder depth', value: d.social.lfgDepth,
          desc: 'Convenience up, community down. Past about 65 it starts dissolving the server identity that keeps people here.' })
      + ui.slider({ path: 'design.social.communityTools', label: 'Community tools', value: d.social.communityTools })
      + ui.toggle({ path: 'design.social.guildPerks', label: 'Guild perks', value: d.social.guildPerks })
      + ui.toggle({ path: 'design.social.guildProgression', label: 'Guild progression', value: d.social.guildProgression,
          desc: 'Gives the guild itself something to chase. The strongest anti-churn system you can build.' })
      + ui.toggle({ path: 'design.social.guildFinder', label: 'Guild finder', value: d.social.guildFinder })
      + ui.toggle({ path: 'design.social.crossRealm', label: 'Cross-realm play', value: d.social.crossRealm })
      + ui.toggle({ path: 'design.social.voiceChat', label: 'Built-in voice', value: d.social.voiceChat })
      + ui.toggle({ path: 'design.social.mentoring', label: 'Mentoring', value: d.social.mentoring })
    );
  }

  /* ============================================================ BUSINESS */

  /* The money model. It lives on the Economy screen now, beside the
     inflation curve it argues with. */
  function businessPanels() {
    var d = D(), M = d.monetisation;
    var model = prim.find(prim.BUSINESS_MODELS, M.model);

    var shopRows = prim.SHOP_CATEGORIES.map(function (cat) {
      var e = null;
      (M.shop || []).forEach(function (x) { if (x.catId === cat.id) e = x; });
      var on = !!(e && e.enabled);
      return '<div style="background:var(--panel-2);border:1px solid ' +
        (on ? 'var(--accent-dim)' : 'var(--line-soft)') + ';border-radius:8px;padding:10px 12px;margin-bottom:7px">' +
        '<div class="row"><div class="toggle' + (on ? ' on' : '') + '" data-act="shop.toggle" data-val="' + cat.id + '">' +
        '<span class="box"></span><span class="lbl">' + esc(cat.name) + '</span></div>' +
        '<span class="spacer"></span>' +
        '<span class="chip ' + (cat.fairCost > 35 ? 'bad' : cat.fairCost > 12 ? 'warn' : 'good') + '">fairness −' +
          cat.fairCost + '</span></div>' +
        '<div class="tiny faint" style="margin-top:5px;line-height:1.5">' + esc(cat.desc) + '</div>' +
        (on ? ui.rangeAct({ label: 'Prominence', act: 'shop.prom', val: cat.id,
                            value: e.prominence, min: 5, max: 100, cls: 'narrow' }) : '') +
        '</div>';
    }).join('');

    var bp = M.battlePass;
    var passBody = ui.toggle({ path: 'design.monetisation.battlePass.enabled', label: 'Battle pass', value: bp.enabled });
    if (bp.enabled) {
      var tiers = bp.tiers || [];
      var freeVal = U.sum(tiers, function (t) {
        return PN.items.rewardValue(d, PN.items.rewardById(d, t.freeRewardId)); });
      var premVal = U.sum(tiers, function (t) {
        return PN.items.rewardValue(d, PN.items.rewardById(d, t.premiumRewardId)); });
      var rewardOpts = [{ id: '', name: '(nothing)' }].concat((d.rewards || []).map(function (r) {
        return { id: r.id, name: r.name + '  (' + Math.round(PN.items.rewardValue(d, r)) + ')' }; }));

      /* Only render a window of tiers - a 100-tier pass is a lot of rows. */
      var page = PN.app.passPage || 0;
      var perPage = 12;
      var slice = tiers.slice(page * perPage, page * perPage + perPage);
      var rows = slice.map(function (t) {
        var idx = tiers.indexOf(t);
        function pick(kind, val) {
          return '<select data-act="pass.reward" data-val="' + idx + '|' + kind + '" style="flex:1">' +
            rewardOpts.map(function (o) {
              return '<option value="' + o.id + '"' + (o.id === (val || '') ? ' selected' : '') + '>' +
                esc(o.name) + '</option>'; }).join('') + '</select>';
        }
        return '<div class="row small" style="background:var(--panel-2);border-radius:6px;padding:7px 9px;margin-bottom:5px">' +
          '<span class="mono tiny" style="width:34px">T' + t.level + '</span>' +
          '<span class="faint tiny" style="width:42px">free</span>' + pick('free', t.freeRewardId) +
          '<span class="faint tiny" style="width:58px">premium</span>' + pick('prem', t.premiumRewardId) +
          '</div>';
      }).join('') || '<div class="tiny faint">No tiers yet.</div>';

      var pager = tiers.length > perPage
        ? '<div class="row" style="gap:6px;margin-bottom:8px">' +
          '<button class="xs" data-act="pass.page" data-val="' + Math.max(0, page - 1) + '">prev</button>' +
          '<span class="tiny faint">tiers ' + (page * perPage + 1) + '-' +
            Math.min(tiers.length, page * perPage + perPage) + ' of ' + tiers.length + '</span>' +
          '<button class="xs" data-act="pass.page" data-val="' +
            Math.min(Math.floor((tiers.length - 1) / perPage), page + 1) + '">next</button></div>'
        : '';

      passBody += ui.slider({ path: 'design.monetisation.battlePass.seasonWeeks', label: 'Season length',
          value: bp.seasonWeeks, min: 4, max: 26, fmt: function (v) { return v + ' weeks'; } })
        + ui.number({ path: 'design.monetisation.battlePass.price', label: 'Price', value: bp.price, min: 0, max: 60, step: 0.5 })
        + ui.slider({ path: 'design.monetisation.battlePass.grindHoursPerWeek', label: 'Hours to complete per week',
            value: bp.grindHoursPerWeek, min: 1, max: 25, fmt: function (v) { return v + ' h'; },
            desc: 'Past about eight hours a week the pass stops being a reward and starts being a second job.' })
        + ui.slider({ path: 'design.monetisation.battlePass.fomo', label: 'FOMO intensity', value: bp.fomo,
            desc: 'Exclusivity, countdowns, "never again" rewards. Works. Costs you trust every season.' })
        + ui.slider({ path: 'design.monetisation.battlePass.catchUp', label: 'Catch-up', value: bp.catchUp })
        + ui.toggle({ path: 'design.monetisation.battlePass.carryover', label: 'Currency carries over', value: bp.carryover })
        + '<div class="tiny faint" style="margin:14px 0 6px;letter-spacing:.08em;text-transform:uppercase">Reward track</div>'
        + '<div class="row" style="gap:6px;margin-bottom:8px">'
        + '<button class="sm" data-act="pass.addTier">Add tier</button>'
        + '<button class="sm" data-act="pass.generate">Generate 30 tiers</button>'
        + (tiers.length ? '<button class="xs ghost" data-act="pass.clear">Clear</button>' : '')
        + '</div>'
        + pager + rows
        + '<div class="grid g3" style="margin-top:12px">'
        + ui.stat('Tiers', tiers.length, null, tiers.length ? '' : 'bad')
        + ui.stat('Free track value', Math.round(freeVal))
        + ui.stat('Premium value', Math.round(premVal))
        + '</div>'
        + (tiers.length === 0
            ? '<div class="chip bad" style="margin-top:8px">A pass with no tiers hands out nothing</div>' : '');
    }



    var priceFields = '';
    if (M.model === 'sub' || M.model === 'hybrid')
      priceFields += ui.number({ path: 'design.monetisation.subPrice', label: 'Monthly subscription', value: M.subPrice, min: 0, max: 40, step: 0.5 });
    if (M.model === 'boxExp' || M.model === 'hybrid')
      priceFields += ui.number({ path: 'design.monetisation.boxPrice', label: 'Box price', value: M.boxPrice, min: 0, max: 120, step: 1 });
    priceFields += ui.number({ path: 'design.monetisation.expansionPrice', label: 'Expansion price', value: M.expansionPrice, min: 0, max: 120, step: 1 });

    return [
      ui.panel('Business model',
        ui.select({ path: 'design.monetisation.model', label: 'Model', value: M.model, options: prim.BUSINESS_MODELS }) +
        priceFields +
        ui.toggle({ path: 'design.monetisation.regionalPricing', label: 'Regional pricing', value: M.regionalPricing }) +
        '<div class="grid g2" style="margin-top:10px">' +
          ui.stat('Base fairness', model.fairness, null, ui.scoreClass(model.fairness)) +
          ui.stat('Reach', U.round(model.reachMult, 2) + '×') + '</div>'),
      ui.panel('Cash shop', shopRows),
      ui.panel('Battle pass', passBody),
      /* Live operations moved to Patches and infrastructure to the
         Dashboard. What is left on this screen is the money. */
      audiencePanel()
    ].join('');
  }

  /* =============================================================== entry */

  function render() {
    var tab = PN.app.designTab || 'identity';
    var body =
      tab === 'identity' ? identityTab() :
      tab === 'progression' ? progressionTab() :
      tab === 'combat' ? PN.viewsCombat.combatTab() :
      tab === 'abilities' ? PN.viewsCombat.abilitiesTab() :
      tab === 'items' ? PN.viewsCombat.itemsTab() :
      tab === 'classes' ? (PN.talents.isTalentMode(D()) ? PN.viewsTalents.talentsTab() : classesTab()) :
      tab === 'races' ? PN.viewsRaces.racesTab() :
      tab === 'world' ? PN.viewsWorld.worldTab() :
      tab === 'encounters' ? PN.viewsWorld.pveTab() :
      tab === 'pvp' ? PN.viewsWorld.pvpTab() :
      tab === 'events' ? PN.viewsEvents.render() :
      systemsTab();
    var d = D();
    var title = null;
    TABS.forEach(function (t) { if (t.id === tab) title = t.name; });
    if (tab === 'classes' && PN.talents.isTalentMode(d)) title = 'Talents';

    /* A sticky section header: what you are looking at, what game it
       belongs to, and how built it is. No tab strip - the rail is the
       navigation now, so this never wraps or clips. */
    var head = '<div class="sectionhead">' +
      '<div class="sh-t"><h1>' + esc(title || 'Design Studio') + '</h1>' +
      '<div class="sh-s">' + esc(BLURB[tab] || '') + '</div></div>' +
      '<div class="sh-r">' +
        '<div class="sh-game">' + esc(d.meta.name) +
        (d.meta.tagline ? '<span class="tiny faint"> — ' + esc(d.meta.tagline) + '</span>' : '') +
        '</div>' + costStrip() +
      '</div></div>';

    return head + '<div class="sectionbody">' + body + '</div>';
  }

  /* The money and the people are still yours to set - they are just
     set on the screens where you watch them happen, rather than in a
     design section nobody had a reason to open. */
  PN.viewsDesign = { render: render, TABS: TABS, BLURB: BLURB, costReadout: costReadout,
                     economyPanel: economyPanel, socialPanel: socialPanel,
                     liveOpsPanel: liveOpsPanel, infraPanel: infraPanel,
                     businessPanels: businessPanels,
                     statExplainer: statExplainer };
})(PN);
