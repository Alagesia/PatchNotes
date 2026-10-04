/* Patch Notes - live events you actually write.

   "Seasonal Events" used to be a slider with an investment percentage,
   which is not an event, it is a promise that one exists. Every real
   MMO's calendar is authored: Hallow's End runs for three weeks every
   October, it puts a headless horseman in four zones, it hands out a
   cache of cosmetics nobody can get the rest of the year, and lapsed
   players come back for a fortnight because of it.

   So an event is a designed object like a zone or a dungeon. It has
   dates, a length, a recurrence, the zones it touches, the monsters it
   adds, the quests it brings and the rewards only it hands out. The
   simulation reads all of that: an event that is running right now adds
   hours, pulls people back, and stops when it stops.

   The thing that makes an event worth building is the same thing that
   makes it annoying to miss: it is not there all year.               */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* How an event comes round again. */
  var SCHEDULES = [
    { id: 'yearly', name: 'Every year',
      desc: 'A holiday. Lands the same weeks every year, and people plan around it.' },
    { id: 'interval', name: 'On a cycle',
      desc: 'Every N weeks, whatever the calendar says. A rotating world event.' },
    { id: 'once', name: 'One time only',
      desc: 'A launch celebration, a crossover, a thing that happened once.' }
  ];
  var SCHEDULE_BY_ID = {};
  SCHEDULES.forEach(function (s) { SCHEDULE_BY_ID[s.id] = s; });

  function newEvent(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('evt'),
      name: opts.name || 'New Event',
      flavour: opts.flavour || '',
      /* When it runs. startWeek is the week OF THE YEAR (0-51) for a
         yearly event, or the week after launch for the other two. */
      schedule: opts.schedule || 'yearly',
      startWeek: opts.startWeek === undefined ? 40 : opts.startWeek,
      weeks: opts.weeks === undefined ? 3 : opts.weeks,
      intervalWeeks: opts.intervalWeeks === undefined ? 12 : opts.intervalWeeks,
      /* What it is made of. All of it points at things you authored. */
      zoneIds: opts.zoneIds || [],
      monsterIds: opts.monsterIds || [],
      questIds: opts.questIds || [],
      rewardId: opts.rewardId || null,
      /* How much art went into it - an event is an art-led thing. */
      artBudget: opts.artBudget === undefined ? 50 : opts.artBudget,
      /* Only obtainable while it runs, which is the whole point. */
      exclusive: opts.exclusive === undefined ? true : !!opts.exclusive,
      enabled: opts.enabled === undefined ? true : !!opts.enabled
    };
  }

  function events(design) { return design.events || (design.events = []); }
  function eventById(design, id) { return U.byId(events(design), id); }

  /* ---------------------------------------------------------- the clock

     Weeks are counted from launch, because a player's calendar starts
     when the game opens, not when the studio was founded.            */

  function weekOfYear(state) {
    var since = Math.max(0, (state.week || 0) - (state.launchWeek || 0));
    return since % 52;
  }

  /* Is this event running in the given week-since-launch? Returns the
     week within the event (0-based), or -1. */
  function weekInto(ev, sinceLaunch) {
    var len = Math.max(1, ev.weeks || 1);
    if (ev.schedule === 'once') {
      var from = ev.startWeek || 0;
      return (sinceLaunch >= from && sinceLaunch < from + len) ? sinceLaunch - from : -1;
    }
    if (ev.schedule === 'interval') {
      var every = Math.max(len, ev.intervalWeeks || 12);
      var into = sinceLaunch % every;
      return into < len ? into : -1;
    }
    /* Yearly: the same weeks of the year, every year, wrapping over the
       new year the way a midwinter festival does. */
    var start = ((ev.startWeek || 0) % 52 + 52) % 52;
    var woy = sinceLaunch % 52;
    var delta = (woy - start + 52) % 52;
    return delta < len ? delta : -1;
  }

  function activeEvents(design, state) {
    var since = Math.max(0, (state.week || 0) - (state.launchWeek || 0));
    return events(design).filter(function (ev) {
      return ev.enabled !== false && weekInto(ev, since) >= 0;
    });
  }

  /* When this event next opens its doors, in weeks from now. Null if it
     never will again. */
  function weeksUntil(ev, sinceLaunch) {
    if (weekInto(ev, sinceLaunch) >= 0) return 0;
    var len = Math.max(1, ev.weeks || 1);
    if (ev.schedule === 'once') {
      var from = ev.startWeek || 0;
      return sinceLaunch < from ? from - sinceLaunch : null;
    }
    if (ev.schedule === 'interval') {
      var every = Math.max(len, ev.intervalWeeks || 12);
      return every - (sinceLaunch % every);
    }
    var start = ((ev.startWeek || 0) % 52 + 52) % 52;
    return (start - (sinceLaunch % 52) + 52) % 52;
  }

  /* ------------------------------------------------------- what it is --

     An event is worth what is in it, like everything else in this game.
     A name and a date with no content behind them is a banner.       */

  function contentOf(design, ev) {
    var mobs = (ev.monsterIds || []).map(function (id) {
      return U.byId(design.monsters || [], id); }).filter(Boolean);
    var quests = (ev.questIds || []).map(function (id) {
      return U.byId(design.quests || [], id); }).filter(Boolean);
    var zones = (ev.zoneIds || []).map(function (id) {
      return U.byId(design.zones || [], id); }).filter(Boolean);
    var reward = ev.rewardId ? PN.items.rewardById(design, ev.rewardId) : null;
    return { monsters: mobs, quests: quests, zones: zones, reward: reward };
  }

  /* Hours of play an event manufactures in each week it is running.
     Scaled by how much of it there is and how much of the world it
     touches - an event in one zone is a sideshow. */
  function eventHours(design, ev, intoWeek) {
    var c = contentOf(design, ev);
    var reach = U.saturate(c.zones.length, 3);
    var body = c.quests.length * 1.7 + c.monsters.length * 0.65;
    var prize = c.reward ? U.saturate(PN.items.rewardValue(design, c.reward), 260) * 5.5 : 0;
    var base = (body + prize) * (0.5 + reach * 0.8);
    /* A holiday is busiest the week it opens - the decorations are new,
       everybody logs in to look, and then it settles into people
       finishing off whatever they still want from it. */
    if (intoWeek === undefined) return base;
    var len = Math.max(1, ev.weeks || 1);
    return base * (1.35 - 0.5 * (U.clamp01(intoWeek / len)));
  }

  /* How hard it pulls somebody who has stopped playing. This is what an
     event is FOR: a dated reason to reinstall. */
  function eventPull(design, ev) {
    var c = contentOf(design, ev);
    if (!c.quests.length && !c.monsters.length && !c.reward) return 0;
    var prize = c.reward ? U.saturate(PN.items.rewardValue(design, c.reward), 300) : 0;
    var art = (ev.artBudget || 0) / 100;
    var scarce = ev.exclusive ? 1 : 0.45;
    return U.clamp01((0.12 + prize * 0.5 + art * 0.2) * scarce);
  }

  function eventCost(design, ev) {
    var c = contentOf(design, ev);
    var pv = (design.identity.productionValue || 50) / 100;
    var art = (ev.artBudget || 0) / 100;
    return {
      design: 2.5 + c.quests.length * 0.5 + c.monsters.length * 0.2,
      art: (3.5 + c.zones.length * 1.4 + c.monsters.length * 0.5) * (0.5 + pv) * (0.4 + art),
      eng: 1.4 + (ev.schedule === 'interval' ? 0.6 : 0),
      qa: 1.1 + c.quests.length * 0.15
    };
  }

  /* What is wrong with it, in the player's own terms. */
  function eventIssues(design, ev) {
    var out = [];
    var c = contentOf(design, ev);
    if (!String(ev.name || '').trim()) out.push('Has no name');
    if (!c.zones.length) out.push('Happens nowhere - give it a zone');
    if (!c.quests.length && !c.monsters.length)
      out.push('Nothing to do in it - add a quest or a monster');
    if (!c.reward) out.push('Hands out nothing - an event with no reward is a decoration');
    if ((ev.weeks || 0) < 1) out.push('Runs for no time at all');
    if (ev.schedule === 'yearly' && (ev.weeks || 0) > 26)
      out.push('Runs for half the year, which is not an event, it is content');
    if (ev.schedule === 'interval' && (ev.intervalWeeks || 0) <= (ev.weeks || 1))
      out.push('Comes round before it has finished - it never stops');
    (ev.monsterIds || []).forEach(function (id) {
      var m = U.byId(design.monsters || [], id);
      if (m && (ev.zoneIds || []).indexOf(m.zoneId) < 0)
        out.push(m.name + ' is not in a zone this event touches');
    });
    return out;
  }

  /* The whole calendar, priced. Used by the inventory and the cost. */
  var summary = U.memoDesign(function (design) {
    var list = events(design).filter(function (e) { return e.enabled !== false; });
    var hours = 0, cost = { design: 0, art: 0, eng: 0, qa: 0 }, weeksCovered = 0;
    list.forEach(function (ev) {
      var c = eventCost(design, ev);
      ['design', 'art', 'eng', 'qa'].forEach(function (k) { cost[k] += c[k]; });
      /* Hours are only manufactured while it runs, so a three-week
         event is worth three weeks of them across a year. */
      var runsPerYear = ev.schedule === 'yearly' ? 1
                      : ev.schedule === 'interval'
                        ? 52 / Math.max(1, ev.intervalWeeks || 12) : 0.25;
      var weeks = Math.min(52, (ev.weeks || 1) * runsPerYear);
      weeksCovered += weeks;
      hours += eventHours(design, ev) * (weeks / 52);
    });
    return { count: list.length, hours: hours, cost: cost,
             weeksCovered: Math.min(52, weeksCovered),
             coverage: U.clamp01(weeksCovered / 52) };
  });

  PN.gameEvents = {
    SCHEDULES: SCHEDULES, SCHEDULE_BY_ID: SCHEDULE_BY_ID,
    newEvent: newEvent, events: events, eventById: eventById,
    weekInto: weekInto, activeEvents: activeEvents, weeksUntil: weeksUntil,
    weekOfYear: weekOfYear, contentOf: contentOf,
    eventHours: eventHours, eventPull: eventPull, eventCost: eventCost,
    eventIssues: eventIssues, summary: summary
  };
})(PN);
