/* Patch Notes - how many people your servers hold.

   Queues were a crisis that arrived with no arithmetic attached. The
   number that causes them lived in one line of the weekly tick, the
   dial that fixes it was capped below what a loaded save already had,
   and nothing anywhere told you what your capacity was or what buying
   a region would do to it. "Login queues" became a permanent condition
   with no visible lever.

   So the sum lives here, once, and the tick, the crisis and the screen
   all quote the same number.                                        */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Players your infrastructure holds at once. */
  function capacity(design) {
    var i = design.infra || {};
    return 260 * (i.regions || 1) *
           (0.6 + (i.serverTech || 0) / 100) *
           (1 + (i.capacityHeadroom || 0) / 100);
  }

  /* What one more of each thing would buy you, so the screen can say
     "another realm holds 400 more people" instead of showing a slider. */
  function marginal(design) {
    var base = capacity(design);
    function withChange(fn) {
      var copy = { infra: U.clone(design.infra || {}) };
      fn(copy.infra);
      return capacity(copy) - base;
    }
    return {
      region: withChange(function (i) { i.regions = (i.regions || 1) + 1; }),
      headroom: withChange(function (i) {
        i.capacityHeadroom = Math.min(100, (i.capacityHeadroom || 0) + 10); }),
      tech: withChange(function (i) {
        i.serverTech = Math.min(100, (i.serverTech || 0) + 10); })
    };
  }

  /* How full you are. Over 1 is a queue. */
  function load(state) {
    var d = PN.sim.live(state) || state.design;
    var room = capacity(d);
    var pop = (state.population && state.population.total) || 0;
    return {
      room: room, players: pop,
      ratio: room > 0 ? pop / room : 0,
      over: Math.max(0, pop - room),
      queueing: pop > room
    };
  }

  /* What it costs to run it, per week. Bigger is not free. */
  function upkeep(design) {
    var i = design.infra || {};
    return (i.regions || 1) * 1800 *
           (1 + (i.capacityHeadroom || 0) / 140) *
           (1 + (i.redundancy || 0) / 200);
  }

  PN.infra = { capacity: capacity, marginal: marginal, load: load, upkeep: upkeep };
})(PN);
