/* Patch Notes - design primitives.
   The composable vocabulary the player authors their MMO out of.
   Nothing here is a "choice from a list of games" - these are parts.       */
(function (PN) {
  'use strict';

  /* ==================================================== COMBAT PARADIGMS ==
     mastery      - skill ceiling this paradigm can support (0-100)
     access       - how easy it is to pick up (0-100)
     spectacle    - how good it looks on a stream (0-100)
     buttonComfort- how many bound abilities feel natural before it bloats
     engCost      - engineering cost multiplier (netcode is not free)
     twitch       - latency/reflex dependence; punishes bad infrastructure  */
  var COMBAT_PARADIGMS = [
    { id: 'tabTarget', name: 'Tab-Target', mastery: 55, access: 75, spectacle: 45,
      buttonComfort: 30, engCost: 1.00, twitch: 0.20,
      tags: ['slow-combat', 'rotation-depth', 'trinity-friendly', 'large-groups'],
      desc: 'Select a target, execute a rotation. Scales to 40-player raids and forgiving pings.' },
    { id: 'softLock', name: 'Action (Soft-Lock)', mastery: 68, access: 62, spectacle: 68,
      buttonComfort: 18, engCost: 1.25, twitch: 0.48,
      tags: ['action-combat', 'positional', 'mid-groups'],
      desc: 'Aim-assisted action. The modern compromise: reactive without being a shooter.' },
    { id: 'fullAction', name: 'Full Action', mastery: 82, access: 44, spectacle: 86,
      buttonComfort: 12, engCost: 1.55, twitch: 0.78,
      tags: ['action-combat', 'positional', 'dodge-roll', 'small-groups', 'high-apm'],
      desc: 'Free aim, dodges, combos. Gorgeous, demanding, and brutal on your netcode budget.' },
    { id: 'shooter', name: 'Twitch Shooter', mastery: 88, access: 40, spectacle: 82,
      buttonComfort: 8, engCost: 1.70, twitch: 0.94,
      tags: ['action-combat', 'aim-skill', 'small-groups', 'low-ttk'],
      desc: 'Aim is the skill. Enormous ceiling, unforgiving floor, and a very specific audience.' },
    { id: 'moba', name: 'MOBA / Lane', mastery: 90, access: 48, spectacle: 90,
      buttonComfort: 7, engCost: 1.20, twitch: 0.62,
      tags: ['session-based', 'competitive-core', 'small-groups', 'match-based', 'no-world'],
      desc: 'Fixed kits, short matches, deep mastery. Barely an MMO. Enormously sticky.' },
    { id: 'tactical', name: 'Tactical / Grid', mastery: 72, access: 58, spectacle: 40,
      buttonComfort: 22, engCost: 0.85, twitch: 0.05,
      tags: ['slow-combat', 'turn-based', 'thinky', 'ping-agnostic'],
      desc: 'Positioning and planning over reflexes. Cheap to run, niche to sell.' },
    { id: 'turnBased', name: 'Turn-Based', mastery: 60, access: 80, spectacle: 35,
      buttonComfort: 26, engCost: 0.70, twitch: 0.00,
      tags: ['turn-based', 'slow-combat', 'ping-agnostic', 'collection-friendly'],
      desc: 'Menus and monsters. The natural home of a creature-collection MMO.' },
    { id: 'autoBattler', name: 'Auto-Battler', mastery: 52, access: 88, spectacle: 44,
      buttonComfort: 4, engCost: 0.60, twitch: 0.00,
      tags: ['idle-friendly', 'collection-friendly', 'session-based', 'mobile-friendly'],
      desc: 'Build the team, watch it fight. Absurdly cheap to operate, monetises itself.' }
  ];

  /* ===================================================== WORLD STRUCTURE ==
     explore   - exploration content yield multiplier
     density   - incidental social contact (chance of meeting strangers)
     engCost   - engineering cost multiplier
     artCost   - art cost multiplier (a seamless world is expensive)
     opsCost   - server cost multiplier                                    */
  var WORLD_STRUCTURES = [
    { id: 'seamless', name: 'Seamless Open World', explore: 1.55, density: 1.25,
      engCost: 1.50, artCost: 1.60, opsCost: 1.45,
      tags: ['open-world', 'immersive', 'exploration-core', 'large-groups'],
      desc: 'One continuous world, no loading screens. The dream, and the budget black hole.' },
    { id: 'zoned', name: 'Zoned Themepark', explore: 1.15, density: 1.10,
      engCost: 1.00, artCost: 1.15, opsCost: 1.00,
      tags: ['themepark', 'open-world', 'guided', 'large-groups'],
      desc: 'Hand-authored zones in a level order. The genre default for a reason.' },
    { id: 'hub', name: 'Instanced Hubs', explore: 0.60, density: 0.85,
      engCost: 0.80, artCost: 0.75, opsCost: 0.80,
      tags: ['instanced', 'themepark', 'mid-groups'],
      desc: 'Social hubs and instanced everything else. Cheap, scalable, a little lonely.' },
    { id: 'sandbox', name: 'Sharded Sandbox', explore: 1.40, density: 1.45,
      engCost: 1.35, artCost: 1.00, opsCost: 1.30,
      tags: ['sandbox', 'open-world', 'player-driven', 'emergent', 'large-groups'],
      desc: 'Players make the content. Glorious when it works, a ghost town when it does not.' },
    { id: 'singleShard', name: 'Single Shard', explore: 1.45, density: 1.80,
      engCost: 1.95, artCost: 1.10, opsCost: 2.10,
      tags: ['sandbox', 'open-world', 'player-driven', 'emergent', 'massive-scale'],
      desc: 'Everyone in one universe. Legendary stories, legendary server bills.' },
    { id: 'session', name: 'Match-Based', explore: 0.20, density: 0.70,
      engCost: 0.75, artCost: 0.55, opsCost: 0.70,
      tags: ['session-based', 'match-based', 'instanced', 'competitive-core', 'no-world'],
      desc: 'Queue, play, leave. Not a world at all - but an extraordinary retention machine.' },
    { id: 'procedural', name: 'Procedural', explore: 1.00, density: 0.80,
      engCost: 1.30, artCost: 0.60, opsCost: 1.05,
      tags: ['procedural', 'open-world', 'infinite-content', 'low-authored'],
      desc: 'Infinite space, finite meaning. Cheap breadth, expensive to make matter.' }
  ];

  /* ==================================================== PROGRESSION MODEL */
  var PROGRESSION_MODELS = [
    { id: 'levels', name: 'Classic Levels', vertical: 0.80,
      tags: ['vertical', 'ladder', 'themepark'],
      desc: 'XP, levels, a cap, and a gear treadmill after it.' },
    { id: 'horizontal', name: 'Horizontal / Levelless', vertical: 0.20,
      tags: ['horizontal', 'evergreen', 'alt-friendly'],
      desc: 'Sideways power. Old content stays relevant; the ladder-chasers get bored.' },
    { id: 'gearScore', name: 'Gear-Score Driven', vertical: 0.95,
      tags: ['vertical', 'grind-core', 'ladder', 'gear-gated'],
      desc: 'Levels are a tutorial. Your item level is your character.' },
    { id: 'mastery', name: 'Use-Based Mastery', vertical: 0.55,
      tags: ['sandbox', 'organic', 'grind-core', 'horizontal'],
      desc: 'You get better at what you do. Beloved, exploitable, hard to balance.' },
    { id: 'rank', name: 'Match Rank', vertical: 0.15,
      tags: ['competitive-core', 'session-based', 'seasonal', 'horizontal'],
      desc: 'Your rating is your progression, and it resets every season.' },
    { id: 'collection', name: 'Collection / Roster', vertical: 0.45,
      tags: ['collection-core', 'horizontal', 'gacha-friendly', 'alt-friendly'],
      desc: 'You do not level up. Your roster does. The creature-collection backbone.' },
    { id: 'hybrid', name: 'Hybrid Vertical + Horizontal', vertical: 0.58,
      tags: ['vertical', 'horizontal', 'themepark'],
      desc: 'A cap to chase and breadth to fill. Hardest to tune, widest appeal.' }
  ];

  /* ======================================================= DEATH PENALTY */
  var DEATH_PENALTIES = [
    { id: 'none', name: 'None', harsh: 0, tags: ['casual-friendly', 'low-stakes'] },
    { id: 'durability', name: 'Repair Cost', harsh: 18, tags: ['gold-sink', 'mild-stakes'] },
    { id: 'corpseRun', name: 'Corpse Run', harsh: 34, tags: ['old-school', 'mild-stakes', 'time-tax'] },
    { id: 'xpLoss', name: 'XP Loss', harsh: 55, tags: ['old-school', 'harsh', 'grind-core'] },
    { id: 'itemDrop', name: 'Item Drop', harsh: 78, tags: ['hardcore', 'harsh', 'pvp-core', 'high-stakes'] },
    { id: 'fullLoot', name: 'Full Loot', harsh: 92, tags: ['hardcore', 'harsh', 'pvp-core', 'sandbox', 'high-stakes'] },
    { id: 'permadeath', name: 'Permadeath Tier', harsh: 100, tags: ['hardcore', 'harsh', 'niche', 'high-stakes'] }
  ];

  /* ========================================================= ROLE SYSTEM */
  var ROLE_SYSTEMS = [
    { id: 'trinity', name: 'Rigid Trinity', groupFriction: 0.75, clarity: 0.90,
      tags: ['trinity-friendly', 'large-groups', 'coordination'],
      desc: 'Tank, healer, damage. Clear, teachable, and permanently short of tanks.' },
    { id: 'flexible', name: 'Flexible Roles', groupFriction: 0.42, clarity: 0.68,
      tags: ['trinity-friendly', 'mid-groups', 'alt-friendly'],
      desc: 'Classes can swap role by spec. Fewer queue problems, muddier identity.' },
    { id: 'softRoles', name: 'Soft Roles', groupFriction: 0.25, clarity: 0.45,
      tags: ['action-combat', 'small-groups', 'emergent'],
      desc: 'Everyone does a bit of everything. Great queues, weak fantasy.' },
    { id: 'roleless', name: 'Roleless', groupFriction: 0.10, clarity: 0.30,
      tags: ['action-combat', 'competitive-core', 'small-groups'],
      desc: 'No roles at all. Instant groups, and nothing to feel irreplaceable about.' }
  ];

  /* ============================================================ SETTINGS */
  var SETTINGS = [
    { id: 'highFantasy', name: 'High Fantasy', reach: 1.00, tags: ['fantasy', 'familiar', 'broad'] },
    { id: 'darkFantasy', name: 'Dark Fantasy', reach: 0.82, tags: ['fantasy', 'mature', 'grim'] },
    { id: 'sciFi', name: 'Science Fiction', reach: 0.78, tags: ['scifi', 'tech'] },
    { id: 'spaceOpera', name: 'Space Opera', reach: 0.86, tags: ['scifi', 'cinematic', 'broad'] },
    { id: 'postApoc', name: 'Post-Apocalyptic', reach: 0.72, tags: ['survival', 'grim', 'sandbox'] },
    { id: 'modernOccult', name: 'Modern Occult', reach: 0.64, tags: ['horror', 'mature', 'mystery'] },
    { id: 'wuxia', name: 'Wuxia / Xianxia', reach: 0.70, tags: ['fantasy', 'action-combat', 'grind-core'] },
    { id: 'creature', name: 'Creature Collection', reach: 0.94, tags: ['collection-core', 'all-ages', 'broad', 'cozy'] },
    { id: 'mythology', name: 'Mythological', reach: 0.74, tags: ['fantasy', 'cultural'] },
    { id: 'superhero', name: 'Superhero', reach: 0.80, tags: ['modern', 'action-combat', 'identity-core'] },
    { id: 'cozy', name: 'Cozy / Pastoral', reach: 0.76, tags: ['cozy', 'all-ages', 'social-core', 'crafting-core'] },
    { id: 'horror', name: 'Survival Horror', reach: 0.58, tags: ['horror', 'mature', 'survival', 'high-stakes'] }
  ];

  /* ================================================= ABILITY PRIMITIVES ==
     Classes are composed from these. Each contributes to derived class
     metrics, costs studio capacity, and carries tags for coherence.

     cx     - complexity added to the rotation
     ceil   - skill ceiling contribution (how much mastery it rewards)
     floor  - skill floor contribution (how much it demands to use at all)
     p{...} - power contributions, 0-10                                   */
  function ab(id, name, cat, cx, ceil, floor, p, tags, desc) {
    return { id: id, name: name, cat: cat, cx: cx, ceil: ceil, floor: floor,
             p: p, tags: tags || [], desc: desc || '' };
  }
  var P = function (o) {
    return {
      burst: o.burst || 0, sustain: o.sustain || 0, aoe: o.aoe || 0,
      heal: o.heal || 0, mitigate: o.mitigate || 0, threat: o.threat || 0,
      control: o.control || 0, mobility: o.mobility || 0, support: o.support || 0,
      fantasy: o.fantasy || 0
    };
  };

  var ABILITY_PRIMITIVES = [
    /* --- damage ------------------------------------------------------- */
    ab('autoAttack', 'Auto-Attack', 'damage', 0, 1, 0, P({ sustain: 3, fantasy: 1 }),
       ['filler'], 'The baseline. Costs nothing, feels like nothing.'),
    ab('strike', 'Basic Strike', 'damage', 1, 2, 1, P({ sustain: 4, fantasy: 2 }),
       ['filler'], 'A reliable button to press between the interesting ones.'),
    ab('heavyStrike', 'Heavy Strike', 'damage', 2, 4, 2, P({ burst: 5, sustain: 2, fantasy: 4 }),
       ['telegraph'], 'Slow, committal, satisfying.'),
    ab('dot', 'Damage Over Time', 'damage', 3, 6, 3, P({ sustain: 6, fantasy: 4 }),
       ['dot', 'rotation-depth', 'maintenance'], 'Track it, refresh it, resent it. Deep rotations live here.'),
    ab('execute', 'Execute', 'damage', 2, 5, 2, P({ burst: 6, fantasy: 6 }),
       ['conditional', 'payoff'], 'Only under 20%. Always feels incredible.'),
    ab('burstWindow', 'Burst Cooldown', 'damage', 3, 7, 3, P({ burst: 9, fantasy: 7 }),
       ['cooldown-major', 'payoff', 'setup'], 'The big one. Line it up or waste it.'),
    ab('channel', 'Channelled Beam', 'damage', 3, 6, 4, P({ sustain: 7, fantasy: 6 }),
       ['channelled', 'immobile', 'telegraph'], 'Enormous damage if nothing makes you move. Something always does.'),
    ab('cleave', 'Cleave', 'damage', 2, 3, 2, P({ aoe: 5, sustain: 3 }),
       ['aoe-small'], 'Hits the thing and its friend.'),
    ab('aoeGround', 'Ground AoE', 'damage', 3, 5, 3, P({ aoe: 8, sustain: 3 }),
       ['aoe-large', 'positional', 'setup'], 'Place it well and it carries the pull.'),
    ab('nova', 'Point-Blank Nova', 'damage', 2, 4, 2, P({ aoe: 7, burst: 3 }),
       ['aoe-large', 'positional', 'risky'], 'Requires standing in the fire you are trying to survive.'),
    ab('ranged', 'Ranged Attack', 'damage', 1, 3, 1, P({ sustain: 4, fantasy: 3 }),
       ['ranged', 'safe'], 'Damage from a comfortable distance.'),
    ab('combo', 'Combo Finisher', 'damage', 5, 9, 5, P({ burst: 7, sustain: 4, fantasy: 8 }),
       ['combo', 'rotation-depth', 'setup', 'payoff'], 'Build resource, spend it. The single best depth-per-button in the toolkit.'),
    ab('proc', 'Proc-Reactive Hit', 'damage', 4, 8, 4, P({ burst: 4, sustain: 5, fantasy: 5 }),
       ['reactive', 'rng', 'rotation-depth'], 'Watch for the glow. Rewards attention, punishes distraction.'),
    ab('stance', 'Stance / Form Swap', 'damage', 6, 9, 6, P({ sustain: 5, fantasy: 9, support: 2 }),
       ['stance', 'rotation-depth', 'identity'], 'Two kits in one class. Gorgeous fantasy, doubled balance work.'),

    /* --- healing ------------------------------------------------------ */
    ab('directHeal', 'Direct Heal', 'heal', 1, 3, 2, P({ heal: 6, fantasy: 3 }),
       ['heal', 'reactive'], 'Big, slow, honest.'),
    ab('flashHeal', 'Flash Heal', 'heal', 2, 5, 3, P({ heal: 5, fantasy: 4 }),
       ['heal', 'reactive', 'resource-hungry'], 'Expensive panic button.'),
    ab('hot', 'Heal Over Time', 'heal', 3, 6, 3, P({ heal: 5, sustain: 2, fantasy: 4 }),
       ['heal', 'hot', 'maintenance', 'proactive'], 'Pre-place it and look like a genius.'),
    ab('shield', 'Absorb Shield', 'heal', 3, 7, 3, P({ heal: 5, mitigate: 4, fantasy: 5 }),
       ['heal', 'shield', 'proactive', 'prediction'], 'Healing before the damage. Rewards knowing the fight cold.'),
    ab('groupHeal', 'Group Heal', 'heal', 2, 5, 3, P({ heal: 7, aoe: 3, fantasy: 5 }),
       ['heal', 'aoe-large'], 'The raid-wide answer.'),
    ab('cooldownHeal', 'Healing Cooldown', 'heal', 2, 6, 2, P({ heal: 9, fantasy: 8 }),
       ['heal', 'cooldown-major', 'payoff'], 'Saves the pull once every three minutes.'),
    ab('dispel', 'Dispel / Cleanse', 'heal', 3, 7, 3, P({ heal: 3, support: 6, fantasy: 3 }),
       ['dispel', 'reactive', 'utility'], 'Invisible, thankless, decides encounters.'),
    ab('resurrect', 'Resurrection', 'heal', 1, 3, 1, P({ heal: 4, support: 5, fantasy: 6 }),
       ['utility', 'ritual'], 'The reason healers get invited.'),

    /* --- tanking ------------------------------------------------------ */
    ab('taunt', 'Taunt', 'tank', 1, 4, 2, P({ threat: 9, fantasy: 5 }),
       ['threat', 'tank-core'], 'Non-negotiable if you have a trinity.'),
    ab('activeMitigation', 'Active Mitigation', 'tank', 5, 9, 5, P({ mitigate: 8, threat: 3, fantasy: 7 }),
       ['tank-core', 'reactive', 'rotation-depth', 'prediction'],
       'Press it right before the hit. Turns tanking from a stat check into a skill.'),
    ab('defensiveCd', 'Defensive Cooldown', 'tank', 2, 6, 2, P({ mitigate: 9, fantasy: 6 }),
       ['cooldown-major', 'reactive', 'survivability'], 'Eat the big one and live.'),
    ab('threatAoe', 'AoE Threat', 'tank', 2, 3, 2, P({ threat: 7, aoe: 4 }),
       ['threat', 'tank-core', 'aoe-large'], 'Hold eight things at once.'),
    ab('blockParry', 'Block / Parry', 'tank', 2, 5, 2, P({ mitigate: 6 }),
       ['passive-ish', 'survivability', 'rng'], 'Avoidance, and the diminishing returns that come with it.'),
    ab('immunity', 'Damage Immunity', 'tank', 2, 7, 2, P({ mitigate: 10, fantasy: 8 }),
       ['cooldown-major', 'immunity', 'balance-risk'], 'Trivialises one mechanic per fight. Designers will hate you.'),

    /* --- control ------------------------------------------------------ */
    ab('stun', 'Stun', 'control', 2, 6, 2, P({ control: 8, fantasy: 5 }),
       ['cc-hard', 'pvp-core', 'balance-risk'], 'The most powerful and most hated verb in PvP.'),
    ab('root', 'Root', 'control', 2, 6, 2, P({ control: 6, fantasy: 4 }),
       ['cc-soft', 'pvp-core'], 'You may act, but you may not leave.'),
    ab('slow', 'Slow', 'control', 1, 4, 1, P({ control: 4, fantasy: 2 }),
       ['cc-soft', 'pvp-core'], 'Kiting fuel.'),
    ab('silence', 'Silence', 'control', 2, 7, 3, P({ control: 7, fantasy: 4 }),
       ['cc-hard', 'pvp-core', 'counterplay'], 'Shuts a caster down. Defines whole matchups.'),
    ab('interrupt', 'Interrupt', 'control', 3, 8, 4, P({ control: 6, support: 4, fantasy: 4 }),
       ['reactive', 'coordination', 'counterplay', 'skill-expression'],
       'Reactive, timed, unmissable. Single best mastery primitive in PvE.'),
    ab('knockback', 'Knockback', 'control', 2, 6, 2, P({ control: 6, fantasy: 6 }),
       ['cc-soft', 'positional', 'chaos'], 'Delightful for you, infuriating for your tank.'),
    ab('fear', 'Fear / Disorient', 'control', 2, 6, 2, P({ control: 7, fantasy: 6 }),
       ['cc-hard', 'chaos', 'pvp-core'], 'Removes someone from the fight and scatters your pull.'),

    /* --- mobility ----------------------------------------------------- */
    ab('sprint', 'Sprint', 'mobility', 1, 3, 1, P({ mobility: 5, fantasy: 3 }),
       ['mobility'], 'Go faster for a bit.'),
    ab('dash', 'Dash / Charge', 'mobility', 2, 6, 2, P({ mobility: 7, fantasy: 6 }),
       ['mobility', 'gap-closer', 'action-friendly'], 'Close the gap and commit.'),
    ab('blink', 'Blink / Teleport', 'mobility', 3, 8, 3, P({ mobility: 9, fantasy: 8 }),
       ['mobility', 'escape', 'skill-expression', 'balance-risk'],
       'Instantly somewhere else. The highest ceiling movement button there is.'),
    ab('dodgeRoll', 'Dodge Roll', 'mobility', 3, 9, 4, P({ mobility: 8, mitigate: 5, fantasy: 7 }),
       ['mobility', 'action-combat', 'i-frames', 'skill-expression'],
       'Active defence through movement. The soul of action combat.'),
    ab('leap', 'Leap', 'mobility', 2, 6, 2, P({ mobility: 7, fantasy: 7 }),
       ['mobility', 'gap-closer', 'traversal'], 'Vertical movement, and a traversal toy out of combat.'),

    /* --- support & utility -------------------------------------------- */
    ab('buff', 'Party Buff', 'support', 1, 3, 1, P({ support: 7, fantasy: 4 }),
       ['buff', 'group-value', 'maintenance'], 'The reason you bring one of each.'),
    ab('debuff', 'Target Debuff', 'support', 2, 5, 2, P({ support: 6, sustain: 2 }),
       ['debuff', 'group-value', 'maintenance'], 'Everyone else hits harder because you are here.'),
    ab('raidCd', 'Raid Cooldown', 'support', 2, 6, 2, P({ support: 9, mitigate: 5, fantasy: 8 }),
       ['cooldown-major', 'group-value', 'coordination'], 'Assign it, call it, survive the phase.'),
    ab('summonPet', 'Permanent Pet', 'support', 5, 7, 4, P({ sustain: 5, support: 4, fantasy: 9 }),
       ['pet', 'identity', 'ai-cost', 'collection-friendly'],
       'A second body to manage. Beloved, and a permanent pathfinding bug.'),
    ab('summonTemp', 'Temporary Summon', 'support', 3, 6, 3, P({ burst: 5, support: 3, fantasy: 8 }),
       ['pet', 'cooldown-major', 'ai-cost'], 'Big cooldown, big friend.'),
    ab('totem', 'Totem / Ward', 'support', 4, 7, 3, P({ support: 7, aoe: 3, fantasy: 7 }),
       ['placeable', 'positional', 'setup'], 'Zone control as a class identity.'),
    ab('stealth', 'Stealth', 'mobility', 4, 8, 4, P({ mobility: 6, control: 4, fantasy: 10 }),
       ['stealth', 'pvp-core', 'balance-risk', 'identity'],
       'Choose when the fight starts. Unbalanceable, unremovable, unforgettable.'),
    ab('portal', 'Portal / Travel', 'support', 1, 2, 1, P({ support: 5, fantasy: 7 }),
       ['utility', 'convenience', 'social-value'], 'A reason for strangers to say thank you.'),
    ab('craftSkill', 'Crafting Synergy', 'support', 2, 4, 2, P({ support: 4, fantasy: 4 }),
       ['crafting-core', 'economy'], 'Ties the class into the economy.'),
    ab('capture', 'Capture / Tame', 'support', 4, 6, 3, P({ support: 4, fantasy: 10 }),
       ['collection-core', 'pet', 'identity'],
       'Turn the monsters into the roster. The creature-collection keystone.')
  ];

  var ABILITY_BY_ID = {};
  ABILITY_PRIMITIVES.forEach(function (a) { ABILITY_BY_ID[a.id] = a; });

  var ABILITY_CATEGORIES = [
    { id: 'damage', name: 'Damage' }, { id: 'heal', name: 'Healing' },
    { id: 'tank', name: 'Tanking' }, { id: 'control', name: 'Control' },
    { id: 'mobility', name: 'Mobility' }, { id: 'support', name: 'Support & Utility' }
  ];

  /* ================================================== BOSS MECHANICS ====
     diff   - raw difficulty contribution
     coord  - how much group coordination it demands
     exec   - how much individual execution it demands
     gear   - how much it is a stat check rather than a skill check
     learn  - pulls needed to learn it
     spec   - spectacle / streamability
     frust  - how much it makes people quit when they fail it
     roles  - extra load placed on {t}ank, {h}ealer, {d}ps               */
  function mech(id, name, diff, coord, exec, gear, learn, spec, frust, roles, tags, desc) {
    return { id: id, name: name, diff: diff, coord: coord, exec: exec, gear: gear,
             learn: learn, spec: spec, frust: frust, roles: roles, tags: tags || [], desc: desc };
  }
  var BOSS_MECHANICS = [
    mech('groundAoe', 'Ground AoE / Don\'t Stand In It', 3, 1, 4, 0, 1, 2, 2,
      { t: 1, h: 1, d: 2 }, ['execution', 'universal'],
      'The foundational mechanic. Everyone understands it. Everyone still stands in it.'),
    mech('tankSwap', 'Tank Swap (Debuff Stacks)', 4, 4, 3, 2, 2, 2, 2,
      { t: 5, h: 2, d: 0 }, ['trinity-required', 'coordination'],
      'Two tanks trading a stacking debuff. Pure trinity design.'),
    mech('addWaves', 'Add Waves', 5, 4, 3, 3, 2, 4, 3,
      { t: 4, h: 3, d: 4 }, ['aoe-required', 'priority', 'coordination'],
      'Target priority under pressure. Punishes tunnel vision.'),
    mech('dpsCheck', 'DPS Check', 5, 2, 2, 8, 1, 3, 5,
      { t: 1, h: 1, d: 5 }, ['gear-check', 'gate'],
      'Not enough damage, not enough kill. The bluntest gate you can build.'),
    mech('healCheck', 'Healing Check', 4, 2, 3, 7, 1, 2, 4,
      { t: 2, h: 6, d: 0 }, ['gear-check', 'gate', 'trinity-required'],
      'Sustained raid damage. Healers feel it; nobody else notices.'),
    mech('interruptRota', 'Interrupt Rotation', 6, 7, 5, 1, 3, 3, 4,
      { t: 2, h: 2, d: 4 }, ['coordination', 'assignment', 'counterplay'],
      'Assigned kicks in order. Superb coordination teaching tool, brutal with pugs.'),
    mech('spreadStack', 'Spread / Stack', 5, 6, 4, 1, 2, 4, 3,
      { t: 2, h: 3, d: 3 }, ['positional', 'coordination', 'universal'],
      'Everybody moves together, or somebody dies alone.'),
    mech('movementPuzzle', 'Movement Puzzle', 6, 5, 7, 0, 4, 6, 5,
      { t: 3, h: 4, d: 4 }, ['execution', 'positional', 'spectacle'],
      'Lasers, tiles, rotating beams. Looks incredible, wipes you for one mistake.'),
    mech('coordPuzzle', 'Coordination Puzzle', 8, 10, 5, 0, 6, 7, 7,
      { t: 4, h: 4, d: 5 }, ['coordination', 'assignment', 'spectacle', 'guild-killer'],
      'Soaks, orbs, colour matching. The mechanic that ends guilds.'),
    mech('rngTarget', 'Random Targeting', 4, 4, 5, 1, 2, 3, 7,
      { t: 2, h: 4, d: 3 }, ['rng', 'frustration', 'unfair-feel'],
      'Fair on average, infuriating in the moment. Use sparingly or not at all.'),
    mech('environmental', 'Environmental Hazard', 4, 3, 5, 0, 2, 5, 3,
      { t: 3, h: 2, d: 3 }, ['positional', 'spectacle', 'arena-design'],
      'The floor is the boss. Shrinking arenas, rising lava, collapsing bridges.'),
    mech('softEnrage', 'Soft Enrage', 5, 3, 3, 6, 2, 4, 3,
      { t: 3, h: 5, d: 3 }, ['gear-check', 'escalation', 'pacing'],
      'Damage ramps until something gives. The honest version of a timer.'),
    mech('hardEnrage', 'Hard Enrage Timer', 6, 2, 2, 9, 1, 3, 6,
      { t: 1, h: 1, d: 6 }, ['gear-check', 'gate', 'harsh'],
      'A wall with a clock on it. Clean, unambiguous, joyless.'),
    mech('roleMechanic', 'Role-Specific Mechanic', 5, 5, 5, 1, 3, 4, 4,
      { t: 4, h: 4, d: 3 }, ['trinity-required', 'assignment', 'spotlight'],
      'One role gets the spotlight and everyone else gets to watch them fail.'),
    mech('raidBurst', 'Raid-Wide Burst', 4, 4, 2, 5, 2, 4, 3,
      { t: 2, h: 6, d: 1 }, ['coordination', 'cooldown-planning', 'trinity-required'],
      'Call the raid cooldown or lose the raid. Planning, not reflexes.'),
    mech('dispelChain', 'Dispel Chain', 5, 6, 4, 2, 3, 2, 4,
      { t: 1, h: 6, d: 2 }, ['coordination', 'assignment', 'trinity-required'],
      'Support gameplay made visible. Only healers will ever know you nailed it.'),
    mech('phaseBurn', 'Phase Transition Burn', 6, 5, 4, 6, 3, 6, 4,
      { t: 3, h: 3, d: 6 }, ['gear-check', 'cooldown-planning', 'spectacle', 'pacing'],
      'Burn the shield before the timer. The best-feeling gear check there is.'),
    mech('positional', 'Positional Requirement', 4, 4, 5, 0, 2, 3, 3,
      { t: 5, h: 1, d: 3 }, ['positional', 'tank-load', 'universal'],
      'Face it away, stand behind it, keep it still.'),
    mech('mindControl', 'Mind Control / Betrayal', 6, 7, 5, 2, 4, 8, 6,
      { t: 4, h: 4, d: 4 }, ['coordination', 'spectacle', 'chaos', 'frustration'],
      'Your own raid becomes the threat. Unforgettable and unforgiving.'),
    mech('platforming', 'Traversal / Platforming', 5, 3, 8, 0, 4, 7, 8,
      { t: 3, h: 3, d: 3 }, ['execution', 'action-required', 'frustration', 'spectacle'],
      'Jumping puzzles in a raid. Spectacular in an action game, hated in a tab-target one.')
  ];
  var MECHANIC_BY_ID = {};
  BOSS_MECHANICS.forEach(function (m) { MECHANIC_BY_ID[m.id] = m; });

  /* ===================================================== CONTENT ENGINES
     Systems that manufacture synthetic hours forever, instead of burning
     down like authored content. Every MMO lives or dies on these.

     rate    - hours/week generated per engaged player at full engagement
     decay   - how fast that yield decays with weeks of exposure (0-1)
     upkeep  - weekly studio capacity cost to keep alive
     build   - one-off build cost {design, art, eng}
     grind   - how much it reads as a chore (hits Value/Fairness)        */
  var CONTENT_ENGINES = [
    { id: 'raidTiers', name: 'Raid Tiers', rate: 6.0, decay: 0.10, grind: 2,
      build: { design: 14, art: 20, eng: 6 }, upkeep: { design: 2.2, art: 2.6, eng: 0.6 },
      cats: ['raid'], tags: ['trinity-required', 'large-groups', 'coordination', 'prestige'],
      desc: 'Weekly lockouts, tiered difficulty, the prestige ladder. Expensive and irreplaceable.' },
    { id: 'keystone', name: 'Scaling Keystone Dungeons', rate: 7.5, decay: 0.06, grind: 3,
      build: { design: 10, art: 4, eng: 9 }, upkeep: { design: 1.4, art: 0.3, eng: 0.9 },
      cats: ['dungeon', 'competitiveLadder'], tags: ['infinite-content', 'small-groups', 'replayable', 'leaderboard'],
      desc: 'Infinite difficulty scaling on content you already built. Best value in the genre.' },
    { id: 'arena', name: 'Ranked Arena', rate: 8.0, decay: 0.04, grind: 2,
      build: { design: 8, art: 3, eng: 10 }, upkeep: { design: 2.0, art: 0.2, eng: 1.4 },
      cats: ['pvpArena', 'competitiveLadder'], tags: ['competitive-core', 'small-groups', 'balance-load', 'seasonal'],
      desc: 'Endless by design. Demands relentless balance work forever.' },
    { id: 'battleground', name: 'Battlegrounds', rate: 6.0, decay: 0.07, grind: 3,
      build: { design: 7, art: 8, eng: 6 }, upkeep: { design: 1.0, art: 0.5, eng: 0.7 },
      cats: ['pvpArena'], tags: ['competitive-core', 'mid-groups', 'casual-friendly'],
      desc: 'Objective PvP. More forgiving than arena, easier to balance, less prestigious.' },
    { id: 'openPvp', name: 'Open-World PvP / Territory', rate: 7.0, decay: 0.05, grind: 4,
      build: { design: 10, art: 6, eng: 12 }, upkeep: { design: 1.6, art: 0.4, eng: 1.6 },
      cats: ['pvpOpen'], tags: ['sandbox', 'emergent', 'large-groups', 'player-driven', 'high-stakes'],
      desc: 'Player-made drama and headlines. Also gankers, and the players who leave because of them.' },
    { id: 'professions', name: 'Professions & Gathering', rate: 4.5, decay: 0.09, grind: 5,
      build: { design: 9, art: 5, eng: 4 }, upkeep: { design: 0.9, art: 0.4, eng: 0.3 },
      cats: ['crafting', 'economy'], tags: ['crafting-core', 'economy', 'solo-friendly', 'alt-friendly'],
      desc: 'A parallel game for people who do not want to fight things.' },
    { id: 'auctionHouse', name: 'Player Economy', rate: 5.0, decay: 0.03, grind: 2,
      build: { design: 6, art: 2, eng: 9 }, upkeep: { design: 1.1, art: 0.1, eng: 0.8 },
      cats: ['economy', 'crafting'], tags: ['economy', 'player-driven', 'emergent', 'rmt-risk'],
      desc: 'The deepest endgame you will never have to write content for. Attracts bots.' },
    { id: 'collections', name: 'Collections (Mounts, Pets, Fashion)', rate: 4.0, decay: 0.08, grind: 4,
      build: { design: 6, art: 12, eng: 3 }, upkeep: { design: 0.7, art: 2.2, eng: 0.2 },
      cats: ['collection', 'cosmetic'], tags: ['collection-core', 'art-led', 'solo-friendly', 'monetisable'],
      desc: 'Art-hungry, endlessly extensible, and the backbone of cosmetic revenue.' },
    { id: 'achievements', name: 'Achievements', rate: 3.0, decay: 0.11, grind: 4,
      build: { design: 5, art: 1, eng: 3 }, upkeep: { design: 0.5, art: 0.1, eng: 0.2 },
      cats: ['achievement'], tags: ['meta-content', 'cheap', 'completionist-bait'],
      desc: 'Points for things players already did. Cheapest retention in the business.' },
    { id: 'reputation', name: 'Reputations & Factions', rate: 3.5, decay: 0.13, grind: 7,
      build: { design: 6, art: 3, eng: 2 }, upkeep: { design: 0.8, art: 0.4, eng: 0.1 },
      cats: ['collection', 'questNarrative'], tags: ['time-gate', 'grind-core', 'daily-driver'],
      desc: 'Time-gated bars. Stretches content brilliantly and reads as a chore just as fast.' },
    { id: 'housing', name: 'Housing & Ownership', rate: 5.5, decay: 0.04, grind: 2,
      build: { design: 10, art: 16, eng: 11 }, upkeep: { design: 1.2, art: 2.4, eng: 0.8 },
      cats: ['housing', 'cosmetic', 'social'], tags: ['identity-core', 'creative', 'social-core', 'monetisable', 'sticky'],
      desc: 'Enormous up-front cost. In exchange, players stop being able to leave.' },
    { id: 'dailies', name: 'Daily / Weekly Systems', rate: 3.2, decay: 0.16, grind: 9,
      build: { design: 4, art: 1, eng: 3 }, upkeep: { design: 0.6, art: 0.2, eng: 0.2 },
      cats: ['levelling', 'collection'], tags: ['time-gate', 'grind-core', 'retention-tool', 'burnout-risk'],
      desc: 'Guaranteed daily logins, guaranteed long-term resentment. Use with a timer.' },
    { id: 'worldBoss', name: 'World Bosses', rate: 2.5, decay: 0.10, grind: 3,
      build: { design: 5, art: 7, eng: 3 }, upkeep: { design: 0.5, art: 0.5, eng: 0.2 },
      cats: ['raid', 'exploration', 'social'], tags: ['large-groups', 'social-core', 'spectacle', 'time-gate'],
      desc: 'A big thing in the world that makes a crowd. Cheap community theatre.' },
    { id: 'roguelike', name: 'Roguelike Mode', rate: 7.0, decay: 0.05, grind: 3,
      build: { design: 12, art: 6, eng: 10 }, upkeep: { design: 1.5, art: 0.6, eng: 0.9 },
      cats: ['dungeon', 'achievement'], tags: ['infinite-content', 'solo-friendly', 'replayable', 'modern'],
      desc: 'Procedural runs with build variety. Modern, cheap to extend, ages well.' },
    { id: 'creatureSystem', name: 'Creature Collection & Battling', rate: 8.0, decay: 0.05, grind: 4,
      build: { design: 16, art: 22, eng: 12 }, upkeep: { design: 2.4, art: 3.4, eng: 0.9 },
      cats: ['creature', 'collection', 'competitiveLadder'], tags: ['collection-core', 'gacha-friendly', 'all-ages', 'monetisable', 'sticky'],
      desc: 'Catch, train, breed, battle. A whole second game bolted on - and it never runs out.' },
    { id: 'guildProgression', name: 'Guild Progression', rate: 3.0, decay: 0.07, grind: 3,
      build: { design: 7, art: 5, eng: 6 }, upkeep: { design: 0.8, art: 0.4, eng: 0.4 },
      cats: ['social'], tags: ['social-core', 'sticky', 'large-groups', 'retention-tool'],
      desc: 'Gives the guild itself something to chase. The strongest anti-churn system there is.' },
    { id: 'seasonalEvents', name: 'Seasonal Events', rate: 2.0, decay: 0.02, grind: 3,
      build: { design: 6, art: 9, eng: 3 }, upkeep: { design: 1.8, art: 2.4, eng: 0.3 },
      cats: ['collection', 'social', 'cosmetic'], tags: ['seasonal', 'fomo', 'art-led', 'returning-player-hook'],
      desc: 'Holidays and anniversaries. Reliably pulls lapsed players back for a fortnight.' }
  ];
  var ENGINE_BY_ID = {};
  CONTENT_ENGINES.forEach(function (e) { ENGINE_BY_ID[e.id] = e; });

  /* ====================================================== BUSINESS MODELS
     arpuBase   - baseline monthly revenue per paying player
     payGate    - how much the model blocks non-payers from playing at all
     fairness   - inherent fairness perception (0-100) before shop contents
     reachMult  - effect on acquisition (free is a powerful word)         */
  var BUSINESS_MODELS = [
    { id: 'sub', name: 'Subscription', arpuBase: 13.0, payGate: 0.95, fairness: 86, reachMult: 0.55,
      tags: ['premium', 'no-shop-pressure', 'predictable'],
      desc: 'Everyone pays the same and nobody buys power. Highest goodwill, smallest funnel.' },
    { id: 'boxExp', name: 'Buy-to-Play + Expansions', arpuBase: 5.5, payGate: 0.85, fairness: 82, reachMult: 0.70,
      tags: ['premium', 'expansion-driven', 'lumpy-revenue'],
      desc: 'One purchase, then paid expansions. Revenue arrives in spikes - budget accordingly.' },
    { id: 'f2pCosmetic', name: 'F2P + Cosmetics Only', arpuBase: 3.8, payGate: 0.05, fairness: 78, reachMult: 1.55,
      tags: ['f2p', 'cosmetic-driven', 'art-hungry', 'wide-funnel'],
      desc: 'Free to play, pay to look good. Needs a big population and a big art team.' },
    { id: 'f2pConvenience', name: 'F2P + Convenience', arpuBase: 6.2, payGate: 0.12, fairness: 58, reachMult: 1.45,
      tags: ['f2p', 'convenience', 'grind-dependent', 'wide-funnel'],
      desc: 'Sell time back to people. Works only if the grind is real - which players notice.' },
    { id: 'f2pPower', name: 'F2P + Power', arpuBase: 14.0, payGate: 0.15, fairness: 22, reachMult: 1.35,
      tags: ['f2p', 'pay-to-win', 'whale-driven', 'reputation-risk'],
      desc: 'Enormous per-whale revenue, catastrophic goodwill. Competitors will not stay.' },
    { id: 'hybrid', name: 'Sub + Cash Shop', arpuBase: 16.5, payGate: 0.90, fairness: 52, reachMult: 0.60,
      tags: ['premium', 'f2p-mechanics', 'double-dip-risk'],
      desc: 'Highest ceiling, and players will tell you daily that they already pay you.' },
    { id: 'seasonal', name: 'F2P + Battle Pass', arpuBase: 7.5, payGate: 0.05, fairness: 70, reachMult: 1.50,
      tags: ['f2p', 'seasonal', 'fomo', 'wide-funnel', 'modern'],
      desc: 'The modern default. Predictable revenue, engineered engagement, FOMO fatigue.' }
  ];
  var MODEL_BY_ID = {};
  BUSINESS_MODELS.forEach(function (m) { MODEL_BY_ID[m.id] = m; });

  /* ================================================= CASH SHOP CATEGORIES
     price     - typical price point
     appeal    - baseline purchase appetite
     fairCost  - Fairness damage per unit of prominence                  */
  var SHOP_CATEGORIES = [
    { id: 'cosmetic', name: 'Cosmetics & Skins', price: 12, appeal: 0.85, fairCost: 2,
      cats: ['cosmetic'], tags: ['art-hungry', 'safe'], desc: 'The safe money. Needs relentless art output.' },
    { id: 'mount', name: 'Mounts & Vanity Pets', price: 22, appeal: 0.72, fairCost: 4,
      cats: ['collection', 'cosmetic'], tags: ['art-hungry', 'safe', 'status'], desc: 'Status symbols. Visible, aspirational, and a reliable earner.' },
    { id: 'storage', name: 'Storage & Slots', price: 9, appeal: 0.60, fairCost: 9,
      cats: [], tags: ['convenience', 'annoyance-tax'], desc: 'Selling relief from a problem you designed.' },
    { id: 'boost', name: 'Level & XP Boosts', price: 32, appeal: 0.48, fairCost: 22,
      cats: [], tags: ['convenience', 'skip-content', 'devalues-content'], desc: 'Lets players skip the content you paid to build.' },
    { id: 'transfer', name: 'Transfers & Renames', price: 24, appeal: 0.35, fairCost: 7,
      cats: [], tags: ['convenience', 'service'], desc: 'Low volume, high margin, mostly forgiven.' },
    { id: 'convenience', name: 'Convenience (Bank, Travel, Repair)', price: 14, appeal: 0.55, fairCost: 14,
      cats: [], tags: ['convenience', 'annoyance-tax'], desc: 'Every one of these is a tax on a friction you chose to keep.' },
    { id: 'power', name: 'Power & Gear', price: 45, appeal: 0.38, fairCost: 62,
      cats: [], tags: ['pay-to-win', 'reputation-risk'], desc: 'The line. Cross it and the competitors leave first.' },
    { id: 'lootbox', name: 'Loot Boxes', price: 18, appeal: 0.65, fairCost: 40,
      cats: ['collection'], tags: ['gambling', 'regulatory-risk', 'whale-driven'], desc: 'Enormous revenue, regulatory exposure, and a permanent asterisk on your reputation.' },
    { id: 'housingDecor', name: 'Housing & Decor', price: 10, appeal: 0.50, fairCost: 3,
      cats: ['housing', 'cosmetic'], tags: ['art-hungry', 'safe', 'sticky'], desc: 'Requires housing to exist. Once it does, it prints quietly forever.' },
    { id: 'creatureGacha', name: 'Creature Summons', price: 20, appeal: 0.70, fairCost: 46,
      cats: ['creature', 'collection'], tags: ['gambling', 'regulatory-risk', 'whale-driven', 'collection-core'],
      desc: 'Gacha for your roster. The highest-revenue system in this list, and the most fraught.' }
  ];
  var SHOP_BY_ID = {};
  SHOP_CATEGORIES.forEach(function (s) { SHOP_BY_ID[s.id] = s; });

  PN.prim = {
    COMBAT_PARADIGMS: COMBAT_PARADIGMS, WORLD_STRUCTURES: WORLD_STRUCTURES,
    PROGRESSION_MODELS: PROGRESSION_MODELS, DEATH_PENALTIES: DEATH_PENALTIES,
    ROLE_SYSTEMS: ROLE_SYSTEMS, SETTINGS: SETTINGS,
    ABILITY_PRIMITIVES: ABILITY_PRIMITIVES, ABILITY_BY_ID: ABILITY_BY_ID,
    ABILITY_CATEGORIES: ABILITY_CATEGORIES,
    BOSS_MECHANICS: BOSS_MECHANICS, MECHANIC_BY_ID: MECHANIC_BY_ID,
    CONTENT_ENGINES: CONTENT_ENGINES, ENGINE_BY_ID: ENGINE_BY_ID,
    BUSINESS_MODELS: BUSINESS_MODELS, MODEL_BY_ID: MODEL_BY_ID,
    SHOP_CATEGORIES: SHOP_CATEGORIES, SHOP_BY_ID: SHOP_BY_ID,
    find: function (list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return list[0];
    }
  };
})(PN);
