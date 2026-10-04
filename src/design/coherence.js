/* Patch Notes - coherence engine.
   Every design element carries tags. Tags pull with or against each other.
   A design that knows what it is scores high; a design that wants to be
   everything scores low - and pays for it in marketing, cost and ceiling. */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* w > 0 synergy, w < 0 conflict. note is shown to the player verbatim,
     so it has to explain the WHY, not just flag the pair.               */
  function pair(a, b, w, note) { return { a: a, b: b, w: w, note: note }; }

  var PAIRS = [
    /* ---------------------------------------------------- conflicts ---- */
    pair('action-combat', 'rotation-depth', -0.60,
      'Action combat asks for your hands; deep rotations ask for your head. Doing both at once just means people drop buttons.'),
    pair('action-combat', 'large-groups', -0.55,
      'Forty people dodging in real time is unreadable on screen and brutal on your netcode.'),
    pair('high-apm', 'large-groups', -0.50,
      'High actions-per-minute stops being skill and starts being noise once the raid is this big.'),
    pair('action-combat', 'trinity-friendly', -0.30,
      'Threat tables and free-aim dodging pull in opposite directions. Tanks stop being able to hold anything.'),
    pair('no-world', 'exploration-core', -1.00,
      'You cannot explore a lobby. These two cannot coexist at any investment level.'),
    pair('session-based', 'open-world', -0.85,
      'Queue-and-leave design fights persistent-world design at every turn.'),
    pair('session-based', 'exploration-core', -0.75,
      'Nobody explores a map they will leave in twenty minutes.'),
    pair('match-based', 'sandbox', -0.80,
      'Player-driven emergence needs persistence. Matches reset it every round.'),
    pair('hardcore', 'casual-friendly', -0.90,
      'Punishing systems and low-friction onboarding are a direct contradiction. Pick your audience.'),
    pair('harsh', 'casual-friendly', -0.75,
      'Harsh penalties read as respect to one audience and as contempt to the other.'),
    pair('harsh', 'all-ages', -0.70,
      'Steep punishment and a broad-appeal presentation send opposite signals in every screenshot.'),
    pair('grind-core', 'casual-friendly', -0.55,
      'Grind is a time tax. Casual players are the ones with no time to pay it.'),
    pair('high-stakes', 'casual-friendly', -0.70,
      'The threat of real loss is the single fastest way to lose low-commitment players.'),
    pair('pay-to-win', 'competitive-core', -0.95,
      'Competitors will not stay in a game where the ladder can be bought. This is the most expensive conflict in the matrix.'),
    pair('pay-to-win', 'premium', -0.60,
      'Charging up front and then selling power reads as double-dipping, and players say so loudly.'),
    pair('gambling', 'premium', -0.50,
      'Paying customers treat loot boxes as a betrayal in a way free players do not.'),
    pair('gambling', 'cozy', -0.55,
      'Gambling mechanics curdle a warm, low-pressure presentation.'),
    pair('fomo', 'cozy', -0.45,
      'Expiring timers are the opposite of relaxing.'),
    pair('immersive', 'instanced', -0.55,
      'Every loading screen and every queue button is a small hole in the illusion.'),
    pair('old-school', 'modern', -0.70,
      'Deliberate friction and modern convenience cancel out. You get the complaints from both audiences.'),
    pair('procedural', 'narrative', -0.60,
      'Generated space struggles to carry authored meaning. Story needs a hand on it.'),
    pair('low-authored', 'exploration-core', -0.50,
      'Exploration rewards intent. Generated terrain gives you space without anything to find in it.'),
    pair('competitive-core', 'rng', -0.65,
      'Randomness that decides matches is the fastest way to lose a competitive playerbase.'),
    pair('mobile-friendly', 'high-apm', -0.70,
      'You cannot execute a high-APM kit on a touchscreen.'),
    pair('idle-friendly', 'skill-expression', -0.60,
      'A game that plays itself cannot also reward playing it well.'),
    pair('pvp-core', 'cozy', -0.60,
      'Open aggression and a comfortable, low-threat mood do not mix.'),
    pair('time-gate', 'session-based', -0.35,
      'Telling drop-in players to come back tomorrow is how you stop them coming back at all.'),
    pair('burnout-risk', 'sticky', -0.30,
      'Systems that compel daily logins buy retention now and spend it later.'),
    pair('collection-core', 'hardcore', -0.40,
      'Collecting is a completion fantasy. Punishing loss undermines it.'),
    pair('rmt-risk', 'competitive-core', -0.45,
      'A tradeable economy next to a ranked ladder is an invitation to buy your way up it.'),
    pair('no-world', 'social-core', -0.35,
      'Communities form in shared spaces. Matchmaking queues are not one.'),

    /* ---------------------------------------------------- synergies ---- */
    pair('tab-target', 'large-groups', 0.70,
      'Tab-target scales cleanly to big raids - that is exactly why the genre standardised on it.'),
    pair('slow-combat', 'large-groups', 0.65,
      'Slower combat stays readable when there are forty people on screen.'),
    pair('trinity-friendly', 'coordination', 0.65,
      'Defined roles give coordination something to coordinate. Assignments become teachable.'),
    pair('trinity-friendly', 'large-groups', 0.55,
      'Roles are how you give forty people distinct jobs instead of forty health bars.'),
    pair('action-combat', 'small-groups', 0.65,
      'Small groups keep action combat legible, and let individual skill actually show.'),
    pair('action-combat', 'spectacle', 0.55,
      'Dodges, leaps and impact frames are what make combat worth watching.'),
    pair('action-combat', 'positional', 0.60,
      'If movement is the skill, position should be the answer.'),
    pair('open-world', 'exploration-core', 0.90,
      'A continuous world is the only thing that makes exploration pay off.'),
    pair('open-world', 'immersive', 0.70,
      'No seams, no queues, no reminders you are playing a game.'),
    pair('sandbox', 'player-driven', 0.90,
      'Give players the tools and the persistence and they will write your content for you.'),
    pair('sandbox', 'emergent', 0.80,
      'Systems that interact produce stories nobody designed. This is the whole pitch.'),
    pair('economy', 'player-driven', 0.75,
      'A real market is the deepest endgame you never have to author.'),
    pair('economy', 'crafting-core', 0.70,
      'Crafters need buyers, markets need supply. Each makes the other matter.'),
    pair('competitive-core', 'session-based', 0.80,
      'Short, self-contained matches are the natural shape of competition.'),
    pair('competitive-core', 'leaderboard', 0.75,
      'Rank is the reward. Show it.'),
    pair('competitive-core', 'skill-expression', 0.70,
      'Competition is only worth it if skill is what decides it.'),
    pair('collection-core', 'gacha-friendly', 0.55,
      'Collections monetise themselves. That is a fact, not an endorsement.'),
    pair('collection-core', 'all-ages', 0.55,
      'Collecting travels across every age bracket better than combat does.'),
    pair('collection-core', 'turn-based', 0.65,
      'Turn-based combat lets a big roster stay readable and strategic.'),
    pair('collection-core', 'alt-friendly', 0.50,
      'If the roster is the progression, breadth is the point.'),
    pair('cozy', 'social-core', 0.70,
      'Low-pressure worlds are where people stay to talk.'),
    pair('cozy', 'crafting-core', 0.60,
      'Making things is the core verb of a comfortable game.'),
    pair('identity-core', 'creative', 0.70,
      'Give people expression tools and they build their own reason to log in.'),
    pair('identity-core', 'sticky', 0.60,
      'Nobody abandons a character they made.'),
    pair('f2p', 'wide-funnel', 0.65,
      'Free removes the single biggest barrier to trying your game.'),
    pair('f2p', 'cosmetic-driven', 0.60,
      'A large free population is the market that cosmetic revenue needs.'),
    pair('seasonal', 'fomo', 0.50,
      'Seasons give urgency a legible shape. Handle with care.'),
    pair('modern', 'seasonal', 0.55,
      'Seasonal structure is what current players expect a live game to look like.'),
    pair('old-school', 'harsh', 0.60,
      'Deliberate friction is the point, and the audience that wants it knows why.'),
    pair('old-school', 'social-core', 0.55,
      'When the systems do not help you, other players have to. That is how communities form.'),
    pair('horror', 'high-stakes', 0.65,
      'Fear needs consequence. Without loss there is no dread.'),
    pair('prestige', 'coordination', 0.55,
      'Hard group content is the only prestige that cannot be bought.'),
    pair('art-hungry', 'cosmetic-driven', 0.65,
      'If you are selling looks, you need a pipeline that produces them relentlessly.'),
    pair('social-core', 'sticky', 0.70,
      'People leave games. They do not leave their friends.'),
    pair('large-groups', 'social-core', 0.55,
      'Content that needs forty people manufactures the community that plays it.'),
    pair('infinite-content', 'replayable', 0.65,
      'Scaling difficulty on existing content is the best value per pound in the genre.'),
    pair('ping-agnostic', 'massive-scale', 0.55,
      'If reflexes do not matter, your server can hold far more people in one place.'),
    pair('instanced', 'casual-friendly', 0.50,
      'Instances are how you guarantee a player gets to do the thing they logged in for.'),
    pair('pvp-core', 'high-stakes', 0.60,
      'Risk is what makes open-world PvP mean anything.'),
    pair('narrative', 'voice-cost', 0.40,
      'If story is the pillar, presentation has to carry it.')
  ];

  /* Index for fast lookup. */
  var INDEX = {};
  PAIRS.forEach(function (p) {
    (INDEX[p.a] = INDEX[p.a] || []).push(p);
    (INDEX[p.b] = INDEX[p.b] || []).push({ a: p.b, b: p.a, w: p.w, note: p.note });
  });

  function evaluate(design) {
    var tags = PN.schema.designTags(design);
    var hits = [], pos = 0, neg = 0;
    var seen = {};

    PAIRS.forEach(function (p) {
      var wa = tags[p.a], wb = tags[p.b];
      if (!wa || !wb) return;
      var key = p.a + '|' + p.b;
      if (seen[key]) return; seen[key] = 1;
      /* Strength is bounded by the weaker of the two tags: a faint trace
         of a tag should not trigger a full conflict.                    */
      var strength = Math.min(wa, wb, 3) / 3;
      var score = p.w * strength;
      hits.push({ a: p.a, b: p.b, w: p.w, note: p.note, strength: strength, score: score });
      if (score > 0) pos += score; else neg += score;
    });

    hits.sort(function (x, y) { return Math.abs(y.score) - Math.abs(x.score); });

    /* Focus: a design with a few loud tags reads more clearly than one
       with a long tail of faint ones.                                   */
    var tagList = U.keys(tags).map(function (t) { return tags[t]; });
    var focus = tagList.length ? U.gini(tagList) : 0;

    var raw = pos * 9.0 + neg * 11.0;       /* conflicts hurt more than synergies help */
    var score = U.clamp100(52 + raw + focus * 22);

    var top = U.keys(tags).map(function (t) { return { tag: t, w: tags[t] }; })
               .sort(function (x, y) { return y.w - x.w; }).slice(0, 10);

    return {
      score: score,
      positives: hits.filter(function (h) { return h.score > 0; }).slice(0, 12),
      negatives: hits.filter(function (h) { return h.score < 0; }).slice(0, 12),
      tags: tags, topTags: top, focus: focus,
      posTotal: pos, negTotal: neg,
      /* Multipliers the rest of the sim consumes. */
      marketingMult: 0.62 + (score / 100) * 0.76,
      costMult: 1.30 - (score / 100) * 0.42,
      ceilingMult: 0.72 + (score / 100) * 0.36
    };
  }

  PN.coherence = { evaluate: evaluate, PAIRS: PAIRS, INDEX: INDEX };
})(PN);
