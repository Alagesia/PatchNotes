/* Patch Notes - watching your players play.

   Everything else in this game is a number that tells you what happened.
   This is the one screen that shows it happening: the zones you authored
   with your players actually in them, levelling through your quests,
   queueing for your dungeons, fighting in your arenas, standing at the
   auction house you decided to have.

   It is driven by the same agents the simulation runs - nothing here is
   decoration. Each dot is a real agent with a real level, a real build
   and a real opinion of you; where it is standing is where the weekly
   simulation says it spent its time. Between weeks the view interpolates
   so there is something to watch rather than a jump.                   */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc;

  function S() { return PN.game.state; }


  /* ------------------------------------------------------------ motion --

     Between weeks nothing is decided, but people still move. Each agent
     gets a stable position inside its venue and drifts a little each
     day, so a busy zone looks busy rather than frozen.                */
  var state = { spots: {}, week: -1 };

  function spotFor(agent) {
    var s = state.spots[agent.id];
    if (!s) {
      var rng = new U.Rng(agent.seed || agent.id || 1);
      s = state.spots[agent.id] = {
        x: rng.next(), y: rng.next(),
        dx: (rng.next() - 0.5) * 0.03, dy: (rng.next() - 0.5) * 0.03
      };
    }
    return s;
  }

  function tickDay(st, day) {
    (st.agents || []).forEach(function (a) {
      var s = spotFor(a);
      s.x += s.dx; s.y += s.dy;
      if (s.x < 0.06 || s.x > 0.94) { s.dx = -s.dx; s.x = U.clamp(s.x, 0.06, 0.94); }
      if (s.y < 0.12 || s.y > 0.88) { s.dy = -s.dy; s.y = U.clamp(s.y, 0.12, 0.88); }
    });
    PN.app.dayOfWeek = day;
  }

  function onWeek(st) {
    /* A new week reshuffles who is where, which is the visible result of
       everything the simulation just decided. */
    state.week = st.week;
  }

  /* ------------------------------------------------------------ render -- */

  var KIND_STYLE = {
    zone:     { c: '#5fd6a0', label: 'Zone' },
    dungeon:  { c: '#5fb3ff', label: 'Dungeon' },
    raid:     { c: '#b79cff', label: 'Raid' },
    pvp:      { c: '#ff7565', label: 'PvP' },
    craft:    { c: '#ffc861', label: 'Crafting' },
    economy:  { c: '#ff9a5f', label: 'Economy' },
    social:   { c: '#8d95a8', label: 'Social' }
  };

  /* An agent's dot colour says what they are: their archetype, which is
     the thing that decides what they want out of your game. */
  function dotColour(a) {
    var arch = PN.tax.ARCHETYPE_BY_ID[a.a];
    return (arch && arch.colour) || '#5fb3ff';
  }

  function venueCard(st, v, agents, heads) {
    var style = KIND_STYLE[v.kind] || KIND_STYLE.zone;
    /* The crowd, spread across the week each of them had, rather than
       every player an agent stands in for piled into whichever room
       that one agent's marker landed in. */
    var pop = heads === undefined
      ? U.sum(agents, function (a) { return a.w; }) : heads;
    var cap = Math.max(1, U.sum(st.agents || [], function (a) { return a.w; }));
    var share = pop / cap;

    /* Draw at most a couple of hundred dots: past that it is a smear
       and the browser suffers for nothing. */
    var shown = agents.length > 220 ? agents.slice(0, 220) : agents;
    var dots = shown.map(function (a) {
      var s = spotFor(a);
      var lvPct = st.design ? U.clamp01(a.lv / Math.max(1, PN.sim.live(st).progression.levelCap)) : 0;
      return '<i class="wdot" style="left:' + (s.x * 100).toFixed(1) + '%;top:' +
        (s.y * 100).toFixed(1) + '%;background:' + dotColour(a) +
        ';opacity:' + (0.35 + lvPct * 0.6).toFixed(2) + '" title="' +
        esc(a.nm) + ' · level ' + a.lv + '"></i>';
    }).join('');

    var sub = v.kind === 'zone' ? (v.hub ? 'levels ' + v.lo + '-' + v.hi + '  ·  the hub' : 'levels ' + v.lo + '-' + v.hi)
            : (KIND_STYLE[v.kind] || {}).label || '';

    return '<div class="venue venue-' + v.kind + '">'
      + '<div class="venue-head">'
      + '<span class="venue-dot" style="background:' + style.c + '"></span>'
      + '<b>' + esc(v.name) + '</b>'
      + '<span class="spacer"></span>'
      + '<span class="mono tiny">' + U.fmtCompact(pop) + '</span>'
      + '</div>'
      + '<div class="venue-sub tiny faint">' + esc(sub) + '</div>'
      + '<div class="venue-floor">' + dots
      + (agents.length > 220
          ? '<span class="venue-more tiny faint">+' + U.fmtInt(agents.length - 220) + '</span>'
          : '')
      + '</div>'
      + '<div class="venue-bar"><i style="width:' + (share * 100).toFixed(1) +
        '%;background:' + style.c + '"></i></div>'
      + '</div>';
  }

  function render() {
    var st = S();
    if (!PN.titles.hasTitle(st) || st.phase !== 'live') {
      return ui.panel('The world', ui.empty('Nothing to watch yet.',
        'Once the game is live this is where you watch people play it.'));
    }
    var vs = PN.places.venues(st);
    var agents = st.agents || [];
    if (!agents.length) {
      return ui.panel('The world', ui.empty('Nobody is online.',
        'Your world is built and empty. That is its own kind of feedback.'));
    }

    /* The census places every marker AND counts every head - and those
       are two different sums once one agent stands in for hundreds of
       players. A marker is one person standing somewhere; a headcount
       is that agent's whole crowd, spread across the week they had. */
    var c = PN.places.census(st);
    var byVenue = c.byVenue;
    var heads = c.population || {};

    /* Busiest first: what your players are actually doing, in order. */
    var ordered = vs.slice().sort(function (a, b) {
      return (heads[b.id] || 0) - (heads[a.id] || 0);
    });

    var cards = ordered.map(function (v) {
      return venueCard(st, v, byVenue[v.id] || [], heads[v.id] || 0);
    }).join('');

    /* A legend, because a field of coloured dots means nothing without
       one and the colours carry the interesting information. */
    var legend = PN.tax.ARCHETYPES.map(function (a) {
      var n = agents.filter(function (x) { return x.a === a.id; }).length;
      if (!n) return '';
      return '<span class="wlegend"><i style="background:' + (a.colour || '#5fb3ff') +
        '"></i>' + esc(a.name) + ' <b>' + U.fmtCompact(n) + '</b></span>';
    }).join('');

    var dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
                   'Saturday', 'Sunday'][PN.app.dayOfWeek || 0];

    return ui.panel('The world', '<div class="worldgrid">' + cards + '</div>'
      + '<div class="row wrap" style="gap:10px;margin-top:11px">' + legend + '</div>'
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">Every dot is one of the '
      + 'players the simulation is running - their level decides how bright they are, their '
      + 'archetype decides the colour, and where they are standing is where the week says they '
      + 'spent their time.</div>',
      { hint: dayName + ' · ' + U.fmtCompact(st.population.total) + ' online' });
  }

  PN.world3d = { render: render, tickDay: tickDay, onWeek: onWeek,
                 venues: function (st) { return PN.places.venues(st); } };
})(PN);
