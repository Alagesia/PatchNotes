/* Patch Notes - taxonomy.
   Need axes, player archetypes, spend tiers, content categories, eras.
   This file defines what simulated players WANT. Everything the player
   authors is ultimately scored against it.                                  */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* =========================================================== NEED AXES ==
     Every cohort scores the game weekly on these ten axes.

     ideal            - default target value (0-100) for a generic player
     under / over     - penalty per point of shortfall / excess.
                        over === 0 means "you cannot have too much of this".
     Opposed axes (challenge vs accessibility, novelty vs stability) are what
     make a design a set of trade-offs rather than a checklist.            */
  var AXES = [
    { id: 'progression', name: 'Progression', ideal: 70, under: 1.00, over: 0.10,
      desc: 'Am I advancing? Is there a visible next step?' },
    { id: 'challenge',   name: 'Challenge',   ideal: 50, under: 0.70, over: 0.90,
      desc: 'Does the game ask enough of me — without asking too much?' },
    { id: 'accessibility', name: 'Accessibility', ideal: 55, under: 0.90, over: 0.40,
      desc: 'Can I get in, catch up, and play on my schedule?' },
    { id: 'mastery',     name: 'Mastery',     ideal: 55, under: 0.80, over: 0.15,
      desc: 'Does skill matter, and can I get visibly better?' },
    { id: 'novelty',     name: 'Novelty',     ideal: 70, under: 1.20, over: 0.00,
      desc: 'Is there something new to do? The drought axis.' },
    { id: 'social',      name: 'Social',      ideal: 55, under: 0.80, over: 0.10,
      desc: 'Do I have people here, and tools to find them?' },
    { id: 'identity',    name: 'Identity',    ideal: 50, under: 0.70, over: 0.00,
      desc: 'Do I look and feel like someone in particular?' },
    { id: 'fairness',    name: 'Fairness',    ideal: 75, under: 1.30, over: 0.00,
      desc: 'Is it balanced, honest, and not pay-to-win?' },
    { id: 'stability',   name: 'Stability',   ideal: 80, under: 1.40, over: 0.00,
      desc: 'Does it work? Bugs, lag, downtime, queues.' },
    { id: 'value',       name: 'Value',       ideal: 65, under: 1.10, over: 0.00,
      desc: 'Is my time and money respected?' }
  ];

  var AXIS_IDS = AXES.map(function (a) { return a.id; });
  var AXIS_BY_ID = {};
  AXES.forEach(function (a) { AXIS_BY_ID[a.id] = a; });

  /* ==================================================== CONTENT CATEGORIES
     Finite content and content engines are both tagged with these. Cohorts
     only consume what their archetype actually cares about.               */
  var CONTENT_CATEGORIES = [
    { id: 'levelling',       name: 'Levelling' },
    { id: 'questNarrative',  name: 'Story & Quests' },
    { id: 'exploration',     name: 'Exploration' },
    { id: 'dungeon',         name: 'Dungeons' },
    { id: 'raid',            name: 'Raids' },
    { id: 'pvpArena',        name: 'Instanced PvP' },
    { id: 'pvpOpen',         name: 'Open-World PvP' },
    { id: 'crafting',        name: 'Crafting & Gathering' },
    { id: 'economy',         name: 'Trading & Markets' },
    { id: 'collection',      name: 'Collections' },
    { id: 'cosmetic',        name: 'Cosmetics & Fashion' },
    { id: 'housing',         name: 'Housing & Ownership' },
    { id: 'social',          name: 'Guilds & Community' },
    { id: 'achievement',     name: 'Achievements' },
    { id: 'competitiveLadder', name: 'Ranked Ladders' },
    { id: 'creature',        name: 'Creature Collection' }
  ];
  var CATEGORY_IDS = CONTENT_CATEGORIES.map(function (c) { return c.id; });

  /* ========================================================= SPEND TIERS ==
     Overlaid on every archetype. mult is spend relative to a baseline.    */
  var SPEND_TIERS = [
    { id: 'free',    name: 'Freeloader', mult: 0.00, priceSensitivity: 1.60 },
    { id: 'minnow',  name: 'Minnow',     mult: 0.55, priceSensitivity: 1.25 },
    { id: 'dolphin', name: 'Dolphin',    mult: 3.20, priceSensitivity: 0.75 },
    { id: 'whale',   name: 'Whale',      mult: 26.0, priceSensitivity: 0.25 }
  ];

  /* Skill bands. Determines who can actually clear what you built. */
  var SKILL_BANDS = [
    { id: 'casual',  name: 'Casual',     skill: 0.28, share: 0.55 },
    { id: 'core',    name: 'Core',       skill: 0.56, share: 0.34 },
    { id: 'elite',   name: 'Elite',      skill: 0.86, share: 0.11 }
  ];

  /* ========================================================== ARCHETYPES ==
     weights  - relative importance of each need axis (normalised on load)
     ideals   - overrides of the default axis ideal for this archetype
     appeal   - 0..1 interest in each content category
     time     - mean playable hours per week
     churn    - baseline weekly churn at neutral (50) satisfaction
     social   - how strongly this group drags others out when it leaves
     evangel  - word-of-mouth acquisition multiplier                       */
  /* One colour per archetype, so a field of dots in the live world view
     reads as "who is playing" rather than as confetti. */
  var ARCH_COLOUR = {
    progressor: '#5fb3ff', raider: '#b79cff', competitor: '#ff7565',
    socialite: '#5fd6a0', explorer: '#7fe3d4', completionist: '#ffc861',
    economist: '#ff9a5f', roleplayer: '#ff8fd0', drifter: '#8d95a8',
    creator: '#c9f06a'
  };
  var ARCHETYPES = [
    {
      id: 'progressor', name: 'Progressor', share: 0.18,
      blurb: 'Wants a ladder and a number that goes up. The backbone of any themepark.',
      weights: { progression: 30, challenge: 8, accessibility: 12, mastery: 6, novelty: 14,
                 social: 8, identity: 4, fairness: 6, stability: 8, value: 4 },
      ideals:  { progression: 85, challenge: 45, accessibility: 60, mastery: 40 },
      appeal:  { levelling: 1.0, questNarrative: 0.7, exploration: 0.5, dungeon: 0.8,
                 raid: 0.4, pvpArena: 0.3, pvpOpen: 0.2, crafting: 0.4, economy: 0.3,
                 collection: 0.5, cosmetic: 0.3, housing: 0.2, social: 0.4,
                 achievement: 0.6, competitiveLadder: 0.2, creature: 0.5 },
      time: 18, timeSd: 6, churn: 0.052, social: 0.9, evangel: 1.0
    },
    {
      id: 'raider', name: 'Raider', share: 0.08,
      blurb: 'Organised, scheduled, relentless. Clears your hardest content and then asks for more.',
      weights: { progression: 16, challenge: 22, accessibility: 3, mastery: 16, novelty: 16,
                 social: 12, identity: 3, fairness: 6, stability: 4, value: 2 },
      ideals:  { progression: 80, challenge: 82, accessibility: 30, mastery: 85, novelty: 80,
                 social: 80 },
      appeal:  { levelling: 0.4, questNarrative: 0.3, exploration: 0.2, dungeon: 0.9,
                 raid: 1.0, pvpArena: 0.3, pvpOpen: 0.2, crafting: 0.4, economy: 0.4,
                 collection: 0.4, cosmetic: 0.4, housing: 0.1, social: 0.8,
                 achievement: 0.7, competitiveLadder: 0.5, creature: 0.2 },
      time: 26, timeSd: 8, churn: 0.036, social: 1.6, evangel: 1.3
    },
    {
      id: 'competitor', name: 'Competitor', share: 0.10,
      blurb: 'Here for the ladder and the duel. Will forgive no balance patch, ever.',
      weights: { progression: 7, challenge: 16, accessibility: 5, mastery: 24, novelty: 8,
                 social: 7, identity: 4, fairness: 21, stability: 6, value: 2 },
      ideals:  { progression: 45, challenge: 78, accessibility: 45, mastery: 92,
                 fairness: 92, stability: 90 },
      appeal:  { levelling: 0.2, questNarrative: 0.1, exploration: 0.1, dungeon: 0.3,
                 raid: 0.2, pvpArena: 1.0, pvpOpen: 0.7, crafting: 0.2, economy: 0.2,
                 collection: 0.3, cosmetic: 0.4, housing: 0.1, social: 0.5,
                 achievement: 0.4, competitiveLadder: 1.0, creature: 0.3 },
      time: 21, timeSd: 7, churn: 0.058, social: 1.1, evangel: 1.2
    },
    {
      id: 'socialite', name: 'Socialite', share: 0.12,
      blurb: 'Logs in for the people. Content is just an excuse to be in the room.',
      weights: { progression: 9, challenge: 4, accessibility: 14, mastery: 3, novelty: 10,
                 social: 34, identity: 9, fairness: 5, stability: 8, value: 4 },
      ideals:  { progression: 55, challenge: 32, accessibility: 75, mastery: 30, social: 95 },
      appeal:  { levelling: 0.5, questNarrative: 0.5, exploration: 0.4, dungeon: 0.6,
                 raid: 0.4, pvpArena: 0.3, pvpOpen: 0.3, crafting: 0.5, economy: 0.4,
                 collection: 0.5, cosmetic: 0.6, housing: 0.7, social: 1.0,
                 achievement: 0.4, competitiveLadder: 0.2, creature: 0.5 },
      time: 15, timeSd: 6, churn: 0.055, social: 2.4, evangel: 1.8
    },
    {
      id: 'explorer', name: 'Explorer', share: 0.09,
      blurb: 'Wants a world, not a lobby. Finds the seams in everything you build.',
      weights: { progression: 9, challenge: 8, accessibility: 9, mastery: 6, novelty: 26,
                 social: 7, identity: 11, fairness: 6, stability: 10, value: 8 },
      ideals:  { progression: 55, challenge: 48, accessibility: 55, novelty: 88, identity: 70 },
      appeal:  { levelling: 0.7, questNarrative: 0.9, exploration: 1.0, dungeon: 0.5,
                 raid: 0.3, pvpArena: 0.1, pvpOpen: 0.4, crafting: 0.6, economy: 0.3,
                 collection: 0.7, cosmetic: 0.5, housing: 0.6, social: 0.4,
                 achievement: 0.6, competitiveLadder: 0.1, creature: 0.8 },
      time: 17, timeSd: 7, churn: 0.062, social: 0.8, evangel: 1.1
    },
    {
      id: 'completionist', name: 'Completionist', share: 0.09,
      blurb: 'Will do all of it. Every mount, every tab, every percentage point.',
      weights: { progression: 22, challenge: 8, accessibility: 9, mastery: 6, novelty: 21,
                 social: 5, identity: 13, fairness: 6, stability: 6, value: 4 },
      ideals:  { progression: 88, challenge: 52, accessibility: 55, novelty: 85, identity: 78 },
      appeal:  { levelling: 0.8, questNarrative: 0.8, exploration: 0.9, dungeon: 0.8,
                 raid: 0.6, pvpArena: 0.4, pvpOpen: 0.3, crafting: 0.8, economy: 0.5,
                 collection: 1.0, cosmetic: 0.9, housing: 0.7, social: 0.4,
                 achievement: 1.0, competitiveLadder: 0.3, creature: 1.0 },
      time: 23, timeSd: 8, churn: 0.044, social: 0.7, evangel: 1.1
    },
    {
      id: 'economist', name: 'Economist', share: 0.05,
      blurb: 'Plays the auction house. Your economy IS their endgame.',
      weights: { progression: 10, challenge: 5, accessibility: 7, mastery: 12, novelty: 9,
                 social: 8, identity: 4, fairness: 22, stability: 9, value: 14 },
      ideals:  { progression: 55, challenge: 42, mastery: 70, fairness: 88, value: 80 },
      appeal:  { levelling: 0.4, questNarrative: 0.2, exploration: 0.4, dungeon: 0.4,
                 raid: 0.3, pvpArena: 0.2, pvpOpen: 0.3, crafting: 1.0, economy: 1.0,
                 collection: 0.5, cosmetic: 0.3, housing: 0.5, social: 0.5,
                 achievement: 0.4, competitiveLadder: 0.2, creature: 0.4 },
      time: 16, timeSd: 6, churn: 0.048, social: 0.9, evangel: 0.9
    },
    {
      id: 'roleplayer', name: 'Roleplayer', share: 0.06,
      blurb: 'Here for who they are, not what they kill. Stickiest players you will ever have.',
      weights: { progression: 6, challenge: 3, accessibility: 13, mastery: 3, novelty: 10,
                 social: 22, identity: 30, fairness: 4, stability: 6, value: 3 },
      ideals:  { progression: 45, challenge: 28, accessibility: 72, identity: 96, social: 85 },
      appeal:  { levelling: 0.4, questNarrative: 0.9, exploration: 0.7, dungeon: 0.3,
                 raid: 0.2, pvpArena: 0.1, pvpOpen: 0.2, crafting: 0.6, economy: 0.4,
                 collection: 0.7, cosmetic: 1.0, housing: 1.0, social: 0.9,
                 achievement: 0.3, competitiveLadder: 0.1, creature: 0.6 },
      time: 14, timeSd: 6, churn: 0.030, social: 1.7, evangel: 1.2
    },
    {
      id: 'drifter', name: 'Drifter', share: 0.19,
      blurb: 'Two evenings a week, maybe. The biggest slice of the market and the leakiest bucket.',
      weights: { progression: 15, challenge: 4, accessibility: 27, mastery: 3, novelty: 15,
                 social: 8, identity: 6, fairness: 7, stability: 8, value: 7 },
      ideals:  { progression: 62, challenge: 26, accessibility: 92, mastery: 25 },
      appeal:  { levelling: 0.9, questNarrative: 0.7, exploration: 0.5, dungeon: 0.6,
                 raid: 0.2, pvpArena: 0.4, pvpOpen: 0.2, crafting: 0.3, economy: 0.2,
                 collection: 0.4, cosmetic: 0.5, housing: 0.3, social: 0.5,
                 achievement: 0.3, competitiveLadder: 0.3, creature: 0.7 },
      time: 6, timeSd: 3, churn: 0.165, social: 0.5, evangel: 0.8
    },
    {
      id: 'creator', name: 'Creator', share: 0.04,
      blurb: 'Streams it, clips it, reviews it. Your cheapest marketing and your loudest critic.',
      weights: { progression: 8, challenge: 13, accessibility: 6, mastery: 15, novelty: 26,
                 social: 10, identity: 8, fairness: 8, stability: 4, value: 2 },
      ideals:  { progression: 65, challenge: 72, mastery: 82, novelty: 95, identity: 72 },
      appeal:  { levelling: 0.6, questNarrative: 0.6, exploration: 0.7, dungeon: 0.7,
                 raid: 0.9, pvpArena: 0.8, pvpOpen: 0.6, crafting: 0.4, economy: 0.4,
                 collection: 0.6, cosmetic: 0.7, housing: 0.4, social: 0.7,
                 achievement: 0.6, competitiveLadder: 0.9, creature: 0.7 },
      time: 32, timeSd: 10, churn: 0.095, social: 1.4, evangel: 9.0
    }
  ];

  /* Normalise weights to sum 1 and fill in default ideals / appeals. */
  ARCHETYPES.forEach(function (a) {
    var total = 0;
    AXIS_IDS.forEach(function (ax) { a.weights[ax] = a.weights[ax] || 0; total += a.weights[ax]; });
    AXIS_IDS.forEach(function (ax) { a.weights[ax] = total > 0 ? a.weights[ax] / total : 0.1; });
    a.ideals = a.ideals || {};
    AXIS_IDS.forEach(function (ax) {
      if (a.ideals[ax] === undefined) a.ideals[ax] = AXIS_BY_ID[ax].ideal;
    });
    a.appeal = a.appeal || {};
    CATEGORY_IDS.forEach(function (c) {
      if (a.appeal[c] === undefined) a.appeal[c] = 0.3;
    });
  });

  var ARCHETYPE_BY_ID = {};
  ARCHETYPES.forEach(function (a) { ARCHETYPE_BY_ID[a.id] = a; a.colour = ARCH_COLOUR[a.id] || "#5fb3ff"; });

  /* =============================================================== ERAS ==
     The genre moves. What shipped in 2004 fails in 2024 — and the sim knows.
     marketSize      - addressable MMO players worldwide (millions)
     expectation     - baseline production-value/polish expected (0-100)
     toleranceGrind  - how much grind the era forgives (higher = more)
     toleranceBugs   - how much jank the era forgives
     f2pNorm         - how normalised free-to-play is (0-1)
     monetTolerance  - how much aggressive monetisation the era forgives
     archetypeShift  - era-specific multipliers on archetype market share  */
  /* An era is not flavour text. Each one is a different game to play:
     how many people are out there, how much your design decides what
     they think of it, whether anybody else is even making MMOs, what
     being free is worth, and how much being GOOD is worth.

       rivals        - is anybody else making one yet
       designWeight  - how far your design moves how people feel. Low is
                       a forgiving decade: build it wrong and they stay,
                       because there is nowhere else to go. High is a
                       decade where the sliders decide everything.
       freeEdge      - what the genre thinks of a game with no price on
                       it. In 2004 free meant a scam; by 2016 free is
                       simply how an MMO opens and a box price is a wall.
       shareMult     - how much of the market any one game can hold. A
                       bigger market that everybody is splitting five
                       ways is not a bigger game.
       qualityEdge   - what being very good, or not, is worth. Applies
                       to rivals exactly as it applies to you.
       declinePerYear- the genre shrinking under everybody.            */
  var ERAS = [
    { year: 1999, name: 'The Frontier', marketSize: 2.8, expectation: 22,
      toleranceGrind: 1.65, toleranceBugs: 1.55, f2pNorm: 0.02, monetTolerance: 0.35,
      rivals: false, designWeight: 0.35, freeEdge: 0.38, shareMult: 1, hireWeeks: 6,
      archetypeShift: { explorer: 1.7, socialite: 1.5, economist: 1.6, drifter: 0.35, creator: 0.1 },
      note: 'Nobody knows what an MMO is supposed to be. A tiny market, no competition, ' +
            'and players who will forgive you anything because there is nothing else like it.' },
    { year: 2004, name: 'The Gold Rush', marketSize: 14, expectation: 42,
      toleranceGrind: 1.30, toleranceBugs: 1.30, f2pNorm: 0.08, monetTolerance: 0.45,
      rivals: true, designWeight: 0.70, freeEdge: 0.38, shareMult: 1,
      archetypeShift: { progressor: 1.35, raider: 1.5, socialite: 1.25, drifter: 0.6, creator: 0.3 },
      note: 'The genre explodes and everyone wants in. Subscriptions are normal, nobody ' +
            'questions a 200-hour grind, and for the first time you are not the only one.' },
    { year: 2010, name: 'The Themepark Wars', marketSize: 28, expectation: 58,
      toleranceGrind: 1.05, toleranceBugs: 1.05, f2pNorm: 0.38, monetTolerance: 0.60,
      rivals: true, designWeight: 1.00, freeEdge: 0.42, shareMult: 1,
      qualityEdge: { top: 92, par: 74, gain: 0.04, bite: 0.30, floor: 0.70 },
      archetypeShift: { progressor: 1.15, drifter: 0.9, competitor: 1.2, creator: 0.7 },
      note: 'Every publisher wants one. Players have alternatives and have learned to leave - ' +
            'a game that is not fun to play is now a game people stop playing.' },
    { year: 2016, name: 'The Long Tail', marketSize: 28, expectation: 72,
      toleranceGrind: 0.88, toleranceBugs: 0.85, f2pNorm: 0.68, monetTolerance: 0.78,
      rivals: true, designWeight: 1.05, freeEdge: 0.71, shareMult: 0.95,
      qualityEdge: { top: 92, par: 74, gain: 0.04, bite: 0.30, floor: 0.70 },
      archetypeShift: { drifter: 1.25, creator: 1.8, competitor: 1.25, raider: 0.85 },
      note: 'F2P is the default and a box price is a wall. Streaming decides what lives. ' +
            'A game with no price on it reaches about twice as many people as one with.' },
    { year: 2022, name: 'The Attention Economy', marketSize: 56, expectation: 84,
      toleranceGrind: 0.72, toleranceBugs: 0.70, f2pNorm: 0.82, monetTolerance: 0.70,
      rivals: true, designWeight: 1.35, freeEdge: 0.78, shareMult: 0.55,
      qualityEdge: { top: 90, par: 80, gain: 0.10, bite: 0.75, floor: 0.45 },
      archetypeShift: { drifter: 1.45, creator: 2.6, socialite: 1.15, raider: 0.72, progressor: 0.88 },
      note: 'Twice as many people play MMOs and they all play five of them. Being very good ' +
            'is the only thing that scales; being fine is a slow death.' },
    { year: 2028, name: 'The Reckoning', marketSize: 56, expectation: 92,
      toleranceGrind: 0.62, toleranceBugs: 0.58, f2pNorm: 0.86, monetTolerance: 0.52,
      rivals: true, designWeight: 1.50, freeEdge: 0.80, shareMult: 0.50,
      qualityEdge: { top: 90, par: 80, gain: 0.10, bite: 0.85, floor: 0.40 },
      declinePerYear: 0.07,
      archetypeShift: { drifter: 1.5, creator: 2.9, roleplayer: 1.3, competitor: 1.1 },
      note: 'Regulators woke up, players got cynical, production costs did not come down, ' +
            'and the genre is shrinking every year. The question is how long you last in it.' }
  ];

  /* The whole game is scaled down from the real genre so that every
     single player can be simulated individually. A hit here is
     thousands of players, not millions - and costs scale to match.

     Turning this number changes what the MARKET reads and nothing
     about how many people are in your game: intake and saturation are
     both measured against the size of the pool, so population.js
     divides the scale back out of each. A bigger number is a smaller
     world and a penetration figure you can feel moving - which is the
     whole point of the column. Printing the real genre's forty-four
     million beside a playerbase counted in the scaled one gave a
     market nobody could ever dent and a penetration pinned at
     nought-point-one per cent. */
  var MARKET_SCALE = 240;

  /* Read back through the export, so the scale is ONE number rather
     than two that can drift apart - which is exactly how the Market
     screen ended up a hundred times out from the simulation it was
     describing. */
  function scaleNow() {
    var v = PN.tax && PN.tax.MARKET_SCALE;
    return v > 0 ? v : MARKET_SCALE;
  }
  function marketPool(era) { return (era.marketSize * 1e6) / scaleNow(); }

  function eraForYear(year) {
    var best = ERAS[0];
    for (var i = 0; i < ERAS.length; i++) if (ERAS[i].year <= year) best = ERAS[i];
    return best;
  }
  function eraBefore(era) {
    var prev = null;
    for (var i = 0; i < ERAS.length; i++) {
      if (ERAS[i].year < era.year && (!prev || ERAS[i].year > prev.year)) prev = ERAS[i];
    }
    return prev;
  }

  /* What year it is in this game, and how far into the current era. */
  function yearOf(state) {
    var start = (state.design && state.design.meta && state.design.meta.startYear) ||
                state.startYear || (state.era && state.era.year) || ERAS[0].year;
    return start + Math.floor((state.week || 0) / 52);
  }
  function weeksIntoEra(state) {
    var era = state.era || ERAS[0];
    var start = (state.design && state.design.meta && state.design.meta.startYear) ||
                state.startYear || era.year;
    /* Weeks since the era began, counted from this game's own clock. A
       game that STARTED in an era is already in the middle of it. */
    return Math.max(0, (state.week || 0) - Math.max(0, (era.year - start) * 52));
  }

  /* The market as it actually is this week.

     Two things the flat table cannot say. A genre does not double on a
     Tuesday - the Attention Economy arrives over about half a year -
     and a genre in decline keeps declining, which is the whole shape of
     The Reckoning: not another market shift, the market going away. */
  var EASE_WEEKS = 26;

  function poolFor(state) {
    var era = (state && state.era) || ERAS[0];
    var here = marketPool(era);
    if (!state) return here;
    var w = weeksIntoEra(state);
    var start = (state.design && state.design.meta && state.design.meta.startYear) ||
                state.startYear || era.year;
    /* Only a game that LIVED THROUGH the change watches the market
       move. One that started here found the genre already like this. */
    var prev = start < era.year ? eraBefore(era) : null;
    var eased = prev
      ? marketPool(prev) + (here - marketPool(prev)) * U.clamp01(w / EASE_WEEKS)
      : here;
    /* The decline is not a transition - it is the era itself, and it
       runs from the year the era began however you got here. */
    var shrink = era.declinePerYear
      ? Math.pow(1 - era.declinePerYear, Math.max(0, w / 52)) : 1;
    return Math.max(1, eased * shrink);
  }

  /* What the genre does to a game of this quality.

     In a crowded attention market being very good is the only thing
     that scales and being fine is a slow death; in 1999 nobody had
     anything to compare you to. Rivals are rated on the same scale and
     read through the same curve, because the genre does not care whose
     game it is. */
  function qualityEdge(era, quality) {
    var g = era && era.qualityEdge;
    if (!g) return 1;
    var q = U.clamp(quality, 0, 100);
    if (q >= g.top) return 1 + g.gain;
    if (q >= g.par) return 1 + g.gain * (q - g.par) / Math.max(1, g.top - g.par);
    return Math.max(g.floor, 1 - ((g.par - q) / Math.max(1, g.par)) * g.bite);
  }

  /* Is this a game you can simply start playing? The genre's opinion of
     that is era.freeEdge; this is the fact of it. */
  function isFreeToPlay(design) {
    var m = (design && design.monetisation) || {};
    return !((m.subPrice || 0) > 0) && !((m.expansionPrice || 0) > 0);
  }

  /* Market share of each archetype, adjusted for the era, renormalised. */
  function marketMix(era) {
    var shift = (era && era.archetypeShift) || {};
    var raw = ARCHETYPES.map(function (a) {
      return { id: a.id, w: a.share * (shift[a.id] === undefined ? 1 : shift[a.id]) };
    });
    var total = U.sum(raw, function (r) { return r.w; });
    var out = {};
    raw.forEach(function (r) { out[r.id] = total > 0 ? r.w / total : 0; });
    return out;
  }

  PN.tax = {
    AXES: AXES, AXIS_IDS: AXIS_IDS, AXIS_BY_ID: AXIS_BY_ID,
    CONTENT_CATEGORIES: CONTENT_CATEGORIES, CATEGORY_IDS: CATEGORY_IDS,
    SPEND_TIERS: SPEND_TIERS, SKILL_BANDS: SKILL_BANDS,
    ARCHETYPES: ARCHETYPES, ARCHETYPE_BY_ID: ARCHETYPE_BY_ID,
    ERAS: ERAS, eraForYear: eraForYear, eraBefore: eraBefore, marketMix: marketMix,
    yearOf: yearOf, weeksIntoEra: weeksIntoEra, poolFor: poolFor,
    qualityEdge: qualityEdge, isFreeToPlay: isFreeToPlay,
    MARKET_SCALE: MARKET_SCALE, marketPool: marketPool
  };
})(PN);
