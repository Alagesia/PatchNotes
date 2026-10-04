/* Patch Notes - how fresh a game feels, and for how long.

   Shared by the per-player simulation and the cohort model above it, so
   a game cannot feel one way to an agent and another to the population
   curve.

   Three things feed it, and the middle one is the important one:

     FRESH     hours spent on content this player has not seen. Burns
               down as they consume it, and always did.

     CHASE     how much of your game they still have left to FINISH.
               This is the evergreen term, and it is the difference
               between a treadmill and a live game. It does not fall
               when content is consumed, only when it is completed - so
               a two percent drop they have not had yet keeps pulling
               for months, because it is still on the list.

     RECENCY   the goodwill a release buys. A patch does not start
               wearing off the day it ships; it holds, and then fades.

   The old model was 62% fresh, 30% repeatable systems and a recency
   term that hit zero after nine weeks, which meant every design decayed
   to the same floor no matter how much was in it.                     */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* How long a release holds before it starts wearing off at all, and
     how slowly it fades once it does. A major update is a bigger event
     than a hotfix and is remembered for longer. */
  var HOLD_WEEKS = { patch: 4, minor: 9, major: 16 };
  var FADE_WEEKS = { patch: 10, minor: 26, major: 44 };
  var PEAK = { patch: 9, minor: 20, major: 30 };

  /* The goodwill still owed from the last release. */
  function recency(state) {
    var rt = state.runtime || {};
    var weeks = rt.weeksSinceContent || 0;
    var kind = rt.lastReleaseKind || 'minor';
    var hold = HOLD_WEEKS[kind] === undefined ? HOLD_WEEKS.minor : HOLD_WEEKS[kind];
    var fade = FADE_WEEKS[kind] === undefined ? FADE_WEEKS.minor : FADE_WEEKS[kind];
    var peak = PEAK[kind] === undefined ? PEAK.minor : PEAK[kind];
    if (weeks <= hold) return peak;
    return peak * U.clamp01(1 - (weeks - hold) / fade);
  }

  /* The whole number, 0-100.

     chase      0-1, how much this player still has to finish
     freshRatio 0-1, share of their week spent on unseen content
     engineRat  0-1, share spent on repeatable systems              */
  function novelty(state, chase, freshRatio, engineRat) {
    var fresh = 34 * U.saturate(freshRatio || 0, 0.55);
    /* The evergreen floor. A game with a deep, reachable list of things
       to finish sits here and stays there; a game you can exhaust in a
       month falls through it however new it was last week. */
    var chaseTerm = 48 * U.clamp01(chase || 0);
    var engine = 22 * U.saturate(engineRat || 0, 0.70);
    return U.clamp100(fresh + chaseTerm + engine + recency(state));
  }

  PN.novelty = { novelty: novelty, recency: recency,
                 HOLD_WEEKS: HOLD_WEEKS, FADE_WEEKS: FADE_WEEKS, PEAK: PEAK };
})(window.PN);
