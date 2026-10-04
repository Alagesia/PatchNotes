/* Patch Notes - ability authoring.
   Abilities are real objects with cooldowns, numbers and effects. The
   combat solver reads them; time-to-kill, class balance and PvE/PvP
   scores are computed from them rather than declared by a slider.       */
(function (PN) {
  'use strict';
  var U = PN.util;

  var SCHOOLS = [
    { id: 'physical', name: 'Physical', power: 'attack', mitigatedBy: 'armour' },
    { id: 'fire',     name: 'Fire',     power: 'spell',  mitigatedBy: 'resist' },
    { id: 'frost',    name: 'Frost',    power: 'spell',  mitigatedBy: 'resist' },
    { id: 'nature',   name: 'Nature',   power: 'spell',  mitigatedBy: 'resist' },
    { id: 'shadow',   name: 'Shadow',   power: 'spell',  mitigatedBy: 'resist' },
    { id: 'holy',     name: 'Holy',     power: 'spell',  mitigatedBy: 'resist' },
    { id: 'arcane',   name: 'Arcane',   power: 'spell',  mitigatedBy: 'resist' }
  ];
  var SCHOOL_BY_ID = {};
  SCHOOLS.forEach(function (s) { SCHOOL_BY_ID[s.id] = s; });

  /* What an ability's numbers scale off.

     The school says what the damage IS - fire, shadow, physical - which is
     what resistances and armour care about. Which stat drives the numbers
     is a different question, and it has to be answerable by NAME, not by
     power class. Attack power is not a stat: Strength and Dexterity are,
     and a design with both needs a dagger that scales off Dexterity and a
     greatsword that scales off Strength. Saying only "attack power" makes
     those two identical and the choice between them decoration.

     So scalesOff accepts:
       'auto'            follow the school, then the character's own stat
       'attack'/'spell'  any stat of that power class - the loose form
       <a primary id>    that exact stat, whatever the author called it   */
  var POWER_CLASSES = [
    { id: 'auto',   name: 'Match the school' },
    { id: 'attack', name: 'Any attack-power stat' },
    { id: 'spell',  name: 'Any spell-power stat' }
  ];

  /* Resolve what an ability asks for, without needing a character.
     Returns { stat: id } for a named stat, or { power: 'attack'|'spell' }
     for the loose form. */
  function scalingRef(design, ab) {
    var so = ab && ab.scalesOff;
    if (so && so !== 'auto' && so !== 'attack' && so !== 'spell') {
      /* A named stat. If the author renamed or deleted it the ability
         falls back to its school rather than silently scaling off zero. */
      var prims = design ? (PN.stats.statSetOf(design).primaries || []) : [];
      for (var i = 0; i < prims.length; i++) {
        if (prims[i].id === so) return { stat: so };
      }
    }
    if (so === 'attack' || so === 'spell') return { power: so };
    var school = SCHOOL_BY_ID[ab && ab.school] || SCHOOL_BY_ID.physical;
    return { power: school.power };
  }

  /* Which power class an ability ends up on, for the things that still
     think in attack-versus-spell - armour, resistance, weapon damage. */
  function powerKind(design, ab) {
    var ref = scalingRef(design, ab);
    if (ref.power) return ref.power;
    var p = U.byId(PN.stats.statSetOf(design).primaries, ref.stat);
    return p && p.powers === 'spell' ? 'spell' : 'attack';
  }

  /* How much output an ability actually carries. Counting buttons instead
     of output is how a class with one big spell and six small physical
     utilities got called physical. */
  function abilityWeight(ab) {
    var weight = 0;
    ((ab && ab.effects) || []).forEach(function (e) {
      if (e.type === 'damage' || e.type === 'dot' || e.type === 'heal' ||
          e.type === 'hot' || e.type === 'absorb') {
        weight += (e.coef || 0) + (e.base || 0) / 400;
      }
    });
    return weight;
  }

  /* The breakdown a kit's gearing is decided from. Abilities that name a
     stat land in byStat and credit only that stat; abilities using the
     loose form land in byPower and credit every stat of that class. */
  function statSplit(design, abilities) {
    var byStat = {}, byPower = { attack: 0, spell: 0 }, total = 0;
    (abilities || []).forEach(function (ab) {
      if (!ab) return;
      var w = abilityWeight(ab);
      if (w <= 0) return;          /* pure utility scales off nothing */
      total += w;
      var ref = scalingRef(design, ab);
      if (ref.stat) byStat[ref.stat] = (byStat[ref.stat] || 0) + w;
      else byPower[ref.power] += w;
    });

    /* What share of the kit a given primary stat actually drives. */
    function shareOf(p) {
      if (!p || total <= 0) return 0;
      var w = byStat[p.id] || 0;
      var powers = p.powers || 'both';
      if (powers === 'both') w += byPower.attack + byPower.spell;
      else w += byPower[powers] || 0;
      return w / total;
    }
    var attack = byPower.attack, spell = byPower.spell;
    (PN.stats.statSetOf(design).primaries || []).forEach(function (p) {
      var w = byStat[p.id] || 0;
      if (!w) return;
      if ((p.powers || 'both') === 'spell') spell += w; else attack += w;
    });
    return {
      byStat: byStat, byPower: byPower, total: total, shareOf: shareOf,
      /* Rolled up to power classes, for the readouts that show one bar. */
      attack: attack, spell: spell,
      attackShare: total > 0 ? attack / total : 0,
      spellShare: total > 0 ? spell / total : 0
    };
  }

  var TARGETING = [
    { id: 'enemy',  name: 'Single Enemy' },
    { id: 'ally',   name: 'Single Ally' },
    { id: 'self',   name: 'Self' },
    { id: 'party',  name: 'Party / Raid' },
    { id: 'area',   name: 'Ground Area' },
    { id: 'cone',   name: 'Cone' },
    { id: 'line',   name: 'Line' }
  ];

  /* ======================================================= EFFECT TYPES
     The verbs an ability can perform. Every one of these is read by the
     combat solver and by the PvE/PvP scoring.                          */
  function p(k, label, type, def, extra) {
    return U.merge({ k: k, label: label, type: type, def: def }, extra || {});
  }

  var EFFECT_TYPES = [
    /* --- offense --------------------------------------------------- */
    { id: 'damage', name: 'Direct Damage', cat: 'offense',
      desc: 'Instant damage on hit. Scales with attack or spell power by school.',
      params: [p('base', 'Base amount', 'num', 100, { min: 0, max: 100000, step: 5 }),
               p('coef', 'Power coefficient', 'num', 1.0, { min: 0, max: 8, step: 0.05 })] },
    { id: 'dot', name: 'Damage Over Time', cat: 'offense',
      desc: 'Ticking damage. Deep rotations live here, and so does target swapping pain.',
      params: [p('base', 'Damage per tick', 'num', 40, { min: 0, max: 50000, step: 5 }),
               p('coef', 'Power coefficient', 'num', 0.35, { min: 0, max: 8, step: 0.05 }),
               p('duration', 'Duration (s)', 'num', 12, { min: 1, max: 60, step: 1 }),
               p('interval', 'Tick every (s)', 'num', 3, { min: 0.5, max: 10, step: 0.5 })] },
    { id: 'execute', name: 'Execute Bonus', cat: 'offense',
      desc: 'Extra damage below a health threshold. Always feels incredible.',
      params: [p('threshold', 'Below HP %', 'num', 20, { min: 5, max: 50, step: 1 }),
               p('bonusPct', 'Damage bonus %', 'num', 100, { min: 10, max: 400, step: 10 })] },

    /* --- healing --------------------------------------------------- */
    { id: 'heal', name: 'Direct Heal', cat: 'support',
      desc: 'Instant healing on a friendly target.',
      params: [p('base', 'Base amount', 'num', 150, { min: 0, max: 100000, step: 5 }),
               p('coef', 'Power coefficient', 'num', 1.2, { min: 0, max: 8, step: 0.05 })] },
    { id: 'hot', name: 'Heal Over Time', cat: 'support',
      desc: 'Ticking healing. Pre-place it and look like a genius.',
      params: [p('base', 'Healing per tick', 'num', 50, { min: 0, max: 50000, step: 5 }),
               p('coef', 'Power coefficient', 'num', 0.35, { min: 0, max: 8, step: 0.05 }),
               p('duration', 'Duration (s)', 'num', 12, { min: 1, max: 60, step: 1 }),
               p('interval', 'Tick every (s)', 'num', 3, { min: 0.5, max: 10, step: 0.5 })] },
    { id: 'absorb', name: 'Absorb Shield', cat: 'support',
      desc: 'Healing before the damage arrives. Rewards knowing the fight.',
      params: [p('base', 'Shield amount', 'num', 200, { min: 0, max: 100000, step: 5 }),
               p('coef', 'Power coefficient', 'num', 1.0, { min: 0, max: 8, step: 0.05 }),
               p('duration', 'Duration (s)', 'num', 15, { min: 1, max: 60, step: 1 })] },
    { id: 'resurrect', name: 'Resurrect', cat: 'support',
      desc: 'Brings a dead player back. The reason healers get invited.',
      params: [p('combat', 'Usable in combat', 'bool', false)] },

    /* --- defense ---------------------------------------------------- */
    { id: 'mitigate', name: 'Protect / Mitigate', cat: 'defense',
      desc: 'Reduce damage taken, on yourself or an ally.',
      params: [p('pct', 'Reduction %', 'num', 30, { min: 1, max: 99, step: 1 }),
               p('duration', 'Duration (s)', 'num', 8, { min: 1, max: 60, step: 1 }),
               p('target', 'Applies to', 'select', 'self',
                 { options: [{ id: 'self', name: 'Self' }, { id: 'ally', name: 'One ally' },
                             { id: 'party', name: 'Whole group' }] })] },
    { id: 'immunity', name: 'Immunity', cat: 'defense',
      desc: 'Total invulnerability. Trivialises one mechanic per fight; designers will hate you.',
      params: [p('duration', 'Duration (s)', 'num', 5, { min: 1, max: 20, step: 1 })] },
    { id: 'avoidance', name: 'Avoidance Boost', cat: 'defense',
      desc: 'Temporary dodge and parry.',
      params: [p('pct', 'Avoidance %', 'num', 25, { min: 1, max: 100, step: 1 }),
               p('duration', 'Duration (s)', 'num', 10, { min: 1, max: 60, step: 1 })] },

    /* --- threat ----------------------------------------------------- */
    { id: 'taunt', name: 'Taunt', cat: 'threat',
      desc: 'Forces the target to attack you. Non-negotiable if you have a trinity.',
      params: [p('duration', 'Forced duration (s)', 'num', 3, { min: 1, max: 15, step: 1 })] },
    { id: 'threat', name: 'Threat Modifier', cat: 'threat',
      desc: 'Multiplies threat generated by this ability.',
      params: [p('mult', 'Threat multiplier', 'num', 3, { min: 0, max: 20, step: 0.5 })] },

    /* --- control ---------------------------------------------------- */
    { id: 'stun', name: 'Stun', cat: 'control',
      desc: 'Target cannot act. The most powerful and most hated verb in PvP.',
      params: [p('duration', 'Duration (s)', 'num', 4, { min: 0.5, max: 15, step: 0.5 })] },
    { id: 'root', name: 'Root', cat: 'control',
      desc: 'Target may act but may not move.',
      params: [p('duration', 'Duration (s)', 'num', 6, { min: 0.5, max: 20, step: 0.5 })] },
    { id: 'slow', name: 'Slow', cat: 'control',
      desc: 'Reduces movement speed. Kiting fuel.',
      params: [p('pct', 'Slow %', 'num', 50, { min: 5, max: 99, step: 5 }),
               p('duration', 'Duration (s)', 'num', 8, { min: 1, max: 30, step: 1 })] },
    { id: 'silence', name: 'Silence', cat: 'control',
      desc: 'No casting. Defines whole matchups.',
      params: [p('duration', 'Duration (s)', 'num', 4, { min: 0.5, max: 12, step: 0.5 })] },
    { id: 'fear', name: 'Fear / Disorient', cat: 'control',
      desc: 'Removes someone from the fight and scatters your pull.',
      params: [p('duration', 'Duration (s)', 'num', 6, { min: 1, max: 20, step: 1 })] },
    { id: 'interrupt', name: 'Interrupt', cat: 'control',
      desc: 'Stops a cast and locks that school. Best mastery primitive in PvE.',
      params: [p('lockout', 'Lockout (s)', 'num', 4, { min: 1, max: 12, step: 1 })] },
    { id: 'knockback', name: 'Knockback', cat: 'control',
      desc: 'Delightful for you, infuriating for your tank.',
      params: [p('distance', 'Distance (yd)', 'num', 15, { min: 3, max: 50, step: 1 })] },

    /* --- cleanse ---------------------------------------------------- */
    { id: 'cleanse', name: 'Cleanse / Dispel', cat: 'support',
      desc: 'Removes harmful effects. Invisible, thankless, decides encounters.',
      params: [p('count', 'Effects removed', 'num', 1, { min: 1, max: 5, step: 1 }),
               p('friendly', 'On allies', 'bool', true)] },

    /* --- mobility ---------------------------------------------------- */
    { id: 'mobility', name: 'Mobility', cat: 'mobility',
      desc: 'Movement as a button. The soul of action combat.',
      params: [p('style', 'Style', 'select', 'dash',
                 { options: [{ id: 'sprint', name: 'Sprint' }, { id: 'dash', name: 'Dash / Charge' },
                             { id: 'blink', name: 'Blink / Teleport' }, { id: 'leap', name: 'Leap' },
                             { id: 'roll', name: 'Dodge Roll' }] }),
               p('distance', 'Distance (yd)', 'num', 20, { min: 0, max: 60, step: 1 }),
               p('speedPct', 'Speed bonus %', 'num', 0, { min: 0, max: 200, step: 5 }),
               p('duration', 'Duration (s)', 'num', 0, { min: 0, max: 30, step: 1 }),
               p('iframes', 'Invulnerable during', 'bool', false)] },
    { id: 'stealth', name: 'Stealth', cat: 'mobility',
      desc: 'Choose when the fight starts. Unbalanceable, unremovable, unforgettable.',
      params: [p('duration', 'Duration (s)', 'num', 0, { min: 0, max: 600, step: 5 })] },

    /* --- buffs and debuffs ------------------------------------------- */
    { id: 'buffStat', name: 'Buff Stat', cat: 'support',
      desc: 'Raises a stat on allies. The reason you bring one of each.',
      params: [p('stat', 'Stat', 'stat', null),
               p('amount', 'Amount', 'num', 100, { min: 0, max: 100000, step: 10 }),
               p('duration', 'Duration (s)', 'num', 30, { min: 1, max: 3600, step: 5 }),
               p('target', 'Applies to', 'select', 'party',
                 { options: [{ id: 'self', name: 'Self' }, { id: 'party', name: 'Group' }] })] },
    { id: 'buffDamage', name: 'Buff Damage Done', cat: 'support',
      desc: 'A straight damage multiplier. The classic raid cooldown.',
      params: [p('pct', 'Damage bonus %', 'num', 20, { min: 1, max: 200, step: 1 }),
               p('duration', 'Duration (s)', 'num', 15, { min: 1, max: 120, step: 1 }),
               p('target', 'Applies to', 'select', 'self',
                 { options: [{ id: 'self', name: 'Self' }, { id: 'party', name: 'Group' }] })] },
    { id: 'debuffDamage', name: 'Debuff Damage Taken', cat: 'support',
      desc: 'Everyone else hits harder because you are here.',
      params: [p('pct', 'Damage taken +%', 'num', 5, { min: 1, max: 100, step: 1 }),
               p('duration', 'Duration (s)', 'num', 20, { min: 1, max: 120, step: 1 })] },
    { id: 'debuffStat', name: 'Debuff Stat', cat: 'support',
      desc: 'Weakens the enemy.',
      params: [p('stat', 'Stat', 'stat', null),
               p('amount', 'Amount', 'num', 100, { min: 0, max: 100000, step: 10 }),
               p('duration', 'Duration (s)', 'num', 20, { min: 1, max: 120, step: 1 })] },

    /* --- summons ----------------------------------------------------- */
    { id: 'summon', name: 'Summon', cat: 'summon',
      desc: 'A second body to manage. Beloved, and a permanent pathfinding bug.',
      params: [p('style', 'Kind', 'select', 'pet',
                 { options: [{ id: 'pet', name: 'Permanent Pet' }, { id: 'guardian', name: 'Temporary Guardian' },
                             { id: 'totem', name: 'Totem / Ward' }] }),
               p('power', 'Share of your power %', 'num', 40, { min: 1, max: 200, step: 5 }),
               p('duration', 'Duration (s)', 'num', 0, { min: 0, max: 600, step: 5 },
                 { desc: '0 means permanent.' })] },

    /* --- resource ----------------------------------------------------- */
    { id: 'resource', name: 'Resource Gain', cat: 'utility',
      desc: 'Generates resource so the rest of the kit can be spent.',
      params: [p('amount', 'Amount', 'num', 20, { min: 0, max: 1000, step: 5 })] },
    { id: 'utility', name: 'Utility', cat: 'utility',
      desc: 'Portals, travel, conveniences. A reason for strangers to say thank you.',
      params: [p('note', 'What it does', 'text', 'Travel')] }
  ];
  var EFFECT_BY_ID = {};
  EFFECT_TYPES.forEach(function (e) { EFFECT_BY_ID[e.id] = e; });

  var EFFECT_CATS = [
    { id: 'offense', name: 'Damage' }, { id: 'support', name: 'Healing & Support' },
    { id: 'defense', name: 'Defence' }, { id: 'threat', name: 'Threat' },
    { id: 'control', name: 'Control' }, { id: 'mobility', name: 'Mobility' },
    { id: 'summon', name: 'Summons' }, { id: 'utility', name: 'Utility' }
  ];

  /* Build an effect with defaults filled in. */
  function newEffect(typeId, over) {
    var def = EFFECT_BY_ID[typeId];
    var e = { type: typeId };
    if (def) def.params.forEach(function (pp) { e[pp.k] = pp.def; });
    return U.merge(e, over || {});
  }

  /* ========================================================== ABILITIES */

  function newAbility(opts) {
    opts = opts || {};
    return {
      id: opts.id || U.id('abl'),
      name: opts.name || 'New Ability',
      classId: opts.classId || null,
      school: opts.school || 'physical',
      /* 'auto' follows the school; 'attack' or 'spell' overrides it. */
      scalesOff: opts.scalesOff || 'auto',
      targeting: opts.targeting || 'enemy',
      range: opts.range === undefined ? 5 : opts.range,      /* 0-5 = melee   */
      radius: opts.radius === undefined ? 0 : opts.radius,   /* 0 = single    */
      maxTargets: opts.maxTargets === undefined ? 1 : opts.maxTargets,
      castTime: opts.castTime === undefined ? 0 : opts.castTime,
      channel: opts.channel === undefined ? 0 : opts.channel,
      cooldown: opts.cooldown === undefined ? 0 : opts.cooldown,
      charges: opts.charges === undefined ? 1 : opts.charges,
      onGcd: opts.onGcd === undefined ? true : opts.onGcd,
      resourceCost: opts.resourceCost === undefined ? 0 : opts.resourceCost,
      resourceGain: opts.resourceGain === undefined ? 0 : opts.resourceGain,
      effects: opts.effects || [],
      flavour: opts.flavour || '',
      tags: opts.tags || []
    };
  }

  function abilityById(design, id) { return U.byId(design.abilities || [], id); }
  function abilitiesOf(design, cls) {
    if (!cls) return [];
    return (cls.abilities || []).map(function (id) { return abilityById(design, id); })
                                .filter(Boolean);
  }

  function effectsOfType(ab, typeId) {
    return (ab.effects || []).filter(function (e) { return e.type === typeId; });
  }
  function hasEffect(ab, typeId) { return effectsOfType(ab, typeId).length > 0; }

  /* Shape metrics that need no character stats: what the ability IS. */
  function shape(ab) {
    var s = {
      isDamage: false, isHeal: false, isTank: false, isControl: false,
      isMobility: false, isSupport: false, isSummon: false,
      controlSeconds: 0, hardControlSeconds: 0, mobilityValue: 0,
      mitigationValue: 0, supportValue: 0, threatValue: 0,
      aoe: (ab.maxTargets || 1) > 1 || (ab.radius || 0) > 0,
      ranged: (ab.range || 0) > 8,
      complexity: 0
    };
    (ab.effects || []).forEach(function (e) {
      var def = EFFECT_BY_ID[e.type];
      if (!def) return;
      s.complexity += 1;
      switch (e.type) {
        case 'damage': s.isDamage = true; break;
        case 'dot': s.isDamage = true; s.complexity += 1.2; break;
        case 'execute': s.isDamage = true; s.complexity += 0.8; break;
        case 'heal': case 'hot': case 'absorb': s.isHeal = true; s.isSupport = true; break;
        case 'resurrect': s.isSupport = true; s.supportValue += 6; break;
        case 'mitigate': s.isTank = true;
          s.mitigationValue += (e.pct || 0) * (e.duration || 0) / 100 *
                               (e.target === 'party' ? 2.4 : e.target === 'ally' ? 1.3 : 1); break;
        case 'immunity': s.isTank = true; s.mitigationValue += (e.duration || 0) * 9; break;
        case 'avoidance': s.isTank = true; s.mitigationValue += (e.pct || 0) * (e.duration || 0) / 140; break;
        case 'taunt': s.isTank = true; s.threatValue += 9; break;
        case 'threat': s.isTank = true; s.threatValue += (e.mult || 1) * 1.4; break;
        case 'stun': s.isControl = true; s.hardControlSeconds += e.duration || 0; break;
        case 'silence': s.isControl = true; s.hardControlSeconds += (e.duration || 0) * 0.8; break;
        case 'fear': s.isControl = true; s.hardControlSeconds += (e.duration || 0) * 0.9; break;
        case 'root': s.isControl = true; s.controlSeconds += (e.duration || 0) * 0.65; break;
        case 'slow': s.isControl = true; s.controlSeconds += (e.duration || 0) * (e.pct || 0) / 220; break;
        case 'knockback': s.isControl = true; s.controlSeconds += 1.5; break;
        case 'interrupt': s.isControl = true; s.controlSeconds += (e.lockout || 0) * 0.5; s.complexity += 1.5; break;
        case 'cleanse': s.isSupport = true; s.supportValue += (e.count || 1) * 4; s.complexity += 1; break;
        case 'mobility': s.isMobility = true;
          s.mobilityValue += (e.distance || 0) * 0.35 + (e.speedPct || 0) * (e.duration || 0) / 60 +
                             (e.iframes ? 12 : 0);
          if (e.style === 'blink' || e.style === 'roll') s.complexity += 1.2; break;
        case 'stealth': s.isMobility = true; s.mobilityValue += 14; s.complexity += 1.5; break;
        case 'buffStat': case 'buffDamage': s.isSupport = true;
          s.supportValue += (e.pct || (e.amount || 0) / 40) * (e.target === 'party' ? 2.2 : 1) *
                            U.saturate(e.duration || 1, 25); break;
        case 'debuffDamage': s.isSupport = true; s.supportValue += (e.pct || 0) * 1.6; break;
        case 'debuffStat': s.isSupport = true; s.supportValue += (e.amount || 0) / 60; break;
        case 'summon': s.isSummon = true; s.isDamage = true; s.complexity += 2.2; break;
        case 'resource': s.complexity += 0.5; break;
        case 'utility': s.isSupport = true; s.supportValue += 3; break;
      }
    });
    if (ab.channel > 0) s.complexity += 1;
    if (ab.charges > 1) s.complexity += 0.6;
    if (!ab.onGcd) s.complexity += 0.4;
    return s;
  }

  /* Tags for the coherence engine, derived from what the ability does. */
  function abilityTags(ab) {
    var s = shape(ab), t = [];
    if (s.aoe) t.push('aoe-large');
    if (s.ranged) t.push('ranged'); else t.push('melee');
    if (s.hardControlSeconds > 0) t.push('cc-hard', 'pvp-core');
    if (s.controlSeconds > 0) t.push('cc-soft');
    if (s.isMobility) t.push('mobility');
    if (s.isSummon) t.push('pet', 'ai-cost');
    if (s.isTank) t.push('tank-core');
    if (s.isHeal) t.push('heal');
    if (hasEffect(ab, 'stealth')) t.push('stealth', 'identity', 'balance-risk');
    if (hasEffect(ab, 'immunity')) t.push('immunity', 'balance-risk');
    if (hasEffect(ab, 'interrupt')) t.push('counterplay', 'skill-expression', 'coordination');
    if (hasEffect(ab, 'dot')) t.push('dot', 'rotation-depth', 'maintenance');
    if (ab.channel > 0) t.push('channelled', 'immobile');
    if (ab.cooldown >= 90) t.push('cooldown-major', 'payoff');
    if (ab.cooldown === 0 && s.isDamage) t.push('filler');
    if (s.complexity >= 4) t.push('rotation-depth');
    return t.concat(ab.tags || []);
  }

  /* ============================================================ LIBRARY
     Templates instantiate a fully-authored ability the player can then
     edit. Authoring forty buttons from an empty form is data entry;
     starting from a real one and changing the numbers is design.       */
  function tpl(id, name, group, base, effects, tags) {
    return { id: id, name: name, group: group, base: base, effects: effects, tags: tags || [] };
  }

  var TEMPLATES = [
    /* --- damage ---------------------------------------------------- */
    tpl('strike', 'Basic Strike', 'damage',
      { school: 'physical', range: 5, resourceGain: 12 },
      [['damage', { base: 70, coef: 0.85 }]]),
    tpl('heavyStrike', 'Heavy Strike', 'damage',
      { school: 'physical', range: 5, castTime: 0, cooldown: 8, resourceCost: 30 },
      [['damage', { base: 190, coef: 1.9 }]]),
    tpl('ranged', 'Ranged Attack', 'damage',
      { school: 'physical', range: 35, castTime: 0, resourceGain: 10 },
      [['damage', { base: 65, coef: 0.8 }]]),
    tpl('bolt', 'Arcane Bolt', 'damage',
      { school: 'arcane', range: 35, castTime: 1.8, resourceCost: 18 },
      [['damage', { base: 120, coef: 1.5 }]]),
    tpl('dot', 'Corruption', 'damage',
      { school: 'shadow', range: 35, resourceCost: 14 },
      [['dot', { base: 46, coef: 0.32, duration: 18, interval: 3 }]]),
    tpl('execute', 'Execute', 'damage',
      { school: 'physical', range: 5, cooldown: 0, resourceCost: 35 },
      [['damage', { base: 150, coef: 1.4 }], ['execute', { threshold: 20, bonusPct: 160 }]]),
    tpl('burstWindow', 'Burst Cooldown', 'damage',
      { school: 'physical', range: 0, targeting: 'self', cooldown: 180, onGcd: false },
      [['buffDamage', { pct: 35, duration: 20, target: 'self' }]]),
    tpl('channel', 'Channelled Beam', 'damage',
      { school: 'arcane', range: 30, channel: 4, resourceCost: 40 },
      [['dot', { base: 130, coef: 1.1, duration: 4, interval: 1 }]]),
    tpl('cleave', 'Cleave', 'damage',
      { school: 'physical', range: 5, radius: 8, maxTargets: 3, resourceCost: 22 },
      [['damage', { base: 85, coef: 0.9 }]]),
    tpl('aoeGround', 'Ground AoE', 'damage',
      { school: 'fire', range: 30, targeting: 'area', radius: 8, maxTargets: 8,
        castTime: 1.5, cooldown: 12, resourceCost: 45 },
      [['dot', { base: 60, coef: 0.5, duration: 8, interval: 1 }]]),
    tpl('nova', 'Point-Blank Nova', 'damage',
      { school: 'frost', range: 0, targeting: 'area', radius: 10, maxTargets: 8,
        cooldown: 25, resourceCost: 35 },
      [['damage', { base: 110, coef: 1.0 }], ['root', { duration: 4 }]]),
    tpl('combo', 'Combo Finisher', 'damage',
      { school: 'physical', range: 5, resourceCost: 55 },
      [['damage', { base: 260, coef: 2.4 }]]),
    tpl('proc', 'Proc-Reactive Hit', 'damage',
      { school: 'nature', range: 8, cooldown: 6 },
      [['damage', { base: 130, coef: 1.25 }]]),
    tpl('stance', 'Stance / Form Swap', 'damage',
      { school: 'physical', targeting: 'self', range: 0, cooldown: 6, onGcd: false },
      [['buffDamage', { pct: 15, duration: 30, target: 'self' }],
       ['resource', { amount: 25 }]],
      ['stance', 'identity', 'rotation-depth']),

    /* --- healing ---------------------------------------------------- */
    tpl('directHeal', 'Healing Wave', 'heal',
      { school: 'holy', targeting: 'ally', range: 35, castTime: 2.4, resourceCost: 30 },
      [['heal', { base: 280, coef: 2.0 }]]),
    tpl('flashHeal', 'Flash Heal', 'heal',
      { school: 'holy', targeting: 'ally', range: 35, castTime: 1.3, resourceCost: 52 },
      [['heal', { base: 200, coef: 1.5 }]]),
    tpl('hot', 'Renew', 'heal',
      { school: 'nature', targeting: 'ally', range: 35, resourceCost: 22 },
      [['hot', { base: 58, coef: 0.42, duration: 15, interval: 3 }]]),
    tpl('shield', 'Absorb Shield', 'heal',
      { school: 'holy', targeting: 'ally', range: 35, cooldown: 8, resourceCost: 38 },
      [['absorb', { base: 320, coef: 1.7, duration: 15 }]]),
    tpl('groupHeal', 'Group Heal', 'heal',
      { school: 'holy', targeting: 'party', range: 30, radius: 12, maxTargets: 5,
        castTime: 2.6, resourceCost: 60 },
      [['heal', { base: 180, coef: 1.2 }]]),
    tpl('cooldownHeal', 'Healing Cooldown', 'heal',
      { school: 'holy', targeting: 'party', range: 30, radius: 30, maxTargets: 20,
        cooldown: 180, resourceCost: 20 },
      [['heal', { base: 420, coef: 2.2 }], ['hot', { base: 90, coef: 0.5, duration: 10, interval: 2 }]]),
    tpl('dispel', 'Cleanse', 'heal',
      { school: 'holy', targeting: 'ally', range: 35, cooldown: 8, resourceCost: 16 },
      [['cleanse', { count: 1, friendly: true }]]),
    tpl('resurrect', 'Resurrection', 'heal',
      { school: 'holy', targeting: 'ally', range: 30, castTime: 8, resourceCost: 60 },
      [['resurrect', { combat: false }]]),

    /* --- tanking ----------------------------------------------------- */
    tpl('taunt', 'Taunt', 'tank',
      { school: 'physical', range: 30, cooldown: 8, onGcd: false },
      [['taunt', { duration: 3 }], ['threat', { mult: 6 }]]),
    tpl('threatAoe', 'AoE Threat', 'tank',
      { school: 'physical', range: 0, targeting: 'area', radius: 10, maxTargets: 8,
        cooldown: 8, resourceCost: 20 },
      [['damage', { base: 55, coef: 0.6 }], ['threat', { mult: 5 }]]),
    tpl('activeMitigation', 'Active Mitigation', 'tank',
      { school: 'physical', targeting: 'self', range: 0, cooldown: 0, resourceCost: 40, charges: 2 },
      [['mitigate', { pct: 35, duration: 6, target: 'self' }]]),
    tpl('defensiveCd', 'Defensive Cooldown', 'tank',
      { school: 'physical', targeting: 'self', range: 0, cooldown: 120, onGcd: false },
      [['mitigate', { pct: 50, duration: 12, target: 'self' }]]),
    tpl('blockParry', 'Shield Block', 'tank',
      { school: 'physical', targeting: 'self', range: 0, cooldown: 16, resourceCost: 25 },
      [['avoidance', { pct: 30, duration: 10 }]]),
    tpl('immunity', 'Damage Immunity', 'tank',
      { school: 'holy', targeting: 'self', range: 0, cooldown: 300, onGcd: false },
      [['immunity', { duration: 8 }]]),
    tpl('raidCd', 'Raid Cooldown', 'tank',
      { school: 'holy', targeting: 'party', range: 40, radius: 40, maxTargets: 20, cooldown: 180 },
      [['mitigate', { pct: 25, duration: 10, target: 'party' }]]),

    /* --- control ------------------------------------------------------ */
    tpl('stun', 'Stun', 'control',
      { school: 'physical', range: 5, cooldown: 30, resourceCost: 15 },
      [['stun', { duration: 4 }]]),
    tpl('root', 'Root', 'control',
      { school: 'frost', range: 30, cooldown: 20, resourceCost: 18 },
      [['root', { duration: 8 }]]),
    tpl('slow', 'Slow', 'control',
      { school: 'frost', range: 30, resourceCost: 12 },
      [['slow', { pct: 50, duration: 10 }]]),
    tpl('silence', 'Silence', 'control',
      { school: 'shadow', range: 30, cooldown: 45 },
      [['silence', { duration: 4 }]]),
    tpl('interrupt', 'Interrupt', 'control',
      { school: 'physical', range: 25, cooldown: 15, onGcd: false },
      [['interrupt', { lockout: 4 }]]),
    tpl('knockback', 'Knockback', 'control',
      { school: 'nature', range: 0, targeting: 'area', radius: 10, maxTargets: 6, cooldown: 30 },
      [['knockback', { distance: 18 }], ['damage', { base: 40, coef: 0.4 }]]),
    tpl('fear', 'Fear', 'control',
      { school: 'shadow', range: 25, castTime: 1.5, cooldown: 30, resourceCost: 20 },
      [['fear', { duration: 8 }]]),

    /* --- mobility ------------------------------------------------------ */
    tpl('sprint', 'Sprint', 'mobility',
      { targeting: 'self', range: 0, cooldown: 60, onGcd: false },
      [['mobility', { style: 'sprint', distance: 0, speedPct: 70, duration: 8 }]]),
    tpl('dash', 'Charge', 'mobility',
      { targeting: 'self', range: 25, cooldown: 20 },
      [['mobility', { style: 'dash', distance: 25 }]]),
    tpl('blink', 'Blink', 'mobility',
      { targeting: 'self', range: 20, cooldown: 15, onGcd: false },
      [['mobility', { style: 'blink', distance: 20 }]]),
    tpl('dodgeRoll', 'Dodge Roll', 'mobility',
      { targeting: 'self', range: 8, cooldown: 3, charges: 2, onGcd: false },
      [['mobility', { style: 'roll', distance: 8, iframes: true }]]),
    tpl('leap', 'Leap', 'mobility',
      { targeting: 'self', range: 30, cooldown: 45 },
      [['mobility', { style: 'leap', distance: 30 }]]),
    tpl('stealth', 'Stealth', 'mobility',
      { targeting: 'self', range: 0, cooldown: 20 },
      [['stealth', { duration: 0 }]]),

    /* --- support -------------------------------------------------------- */
    tpl('buff', 'Party Buff', 'support',
      { school: 'holy', targeting: 'party', range: 40, radius: 40, maxTargets: 20, cooldown: 0 },
      [['buffStat', { stat: null, amount: 240, duration: 3600, target: 'party' }]]),
    tpl('debuff', 'Target Debuff', 'support',
      { school: 'shadow', range: 30, resourceCost: 10 },
      [['debuffDamage', { pct: 5, duration: 30 }]]),
    tpl('summonPet', 'Summon Companion', 'support',
      { school: 'nature', targeting: 'self', range: 0, castTime: 2.5, cooldown: 10, resourceCost: 30 },
      [['summon', { style: 'pet', power: 45, duration: 0 }]]),
    tpl('summonTemp', 'Summon Guardian', 'support',
      { school: 'shadow', targeting: 'self', range: 0, cooldown: 180 },
      [['summon', { style: 'guardian', power: 90, duration: 30 }]]),
    tpl('totem', 'Ward', 'support',
      { school: 'nature', targeting: 'area', range: 20, radius: 10, cooldown: 30, resourceCost: 25 },
      [['summon', { style: 'totem', power: 25, duration: 30 }],
       ['buffStat', { stat: null, amount: 120, duration: 30, target: 'party' }]]),
    tpl('portal', 'Portal', 'support',
      { targeting: 'self', range: 0, castTime: 3, cooldown: 60 },
      [['utility', { note: 'Group teleport to a capital city' }]]),
    tpl('craftSkill', 'Crafting Synergy', 'support',
      { targeting: 'self', range: 0, cooldown: 0 },
      [['utility', { note: 'Improves crafting outcomes' }]]),
    tpl('capture', 'Tame Creature', 'support',
      { school: 'nature', range: 30, castTime: 5, cooldown: 20 },
      [['summon', { style: 'pet', power: 50, duration: 0 }],
       ['utility', { note: 'Adds the creature to your roster' }]]),
    tpl('autoAttack', 'Auto-Attack', 'damage',
      { school: 'physical', range: 5, onGcd: false, cooldown: 2.4 },
      [['damage', { base: 35, coef: 0.4 }]])
  ];
  var TEMPLATE_BY_ID = {};
  TEMPLATES.forEach(function (t) { TEMPLATE_BY_ID[t.id] = t; });

  var TEMPLATE_GROUPS = [
    { id: 'damage', name: 'Damage' }, { id: 'heal', name: 'Healing' },
    { id: 'tank', name: 'Tanking' }, { id: 'control', name: 'Control' },
    { id: 'mobility', name: 'Mobility' }, { id: 'support', name: 'Support' }
  ];

  /* Instantiate a template into a real, editable ability. Numbers are
     scaled to the design's level cap so a level-80 game does not ship
     level-60 damage values.                                           */
  function fromTemplate(design, templateId, opts) {
    opts = opts || {};
    var t = TEMPLATE_BY_ID[templateId];
    if (!t) return newAbility({ name: 'New Ability' });
    var cap = Math.max(1, (design.progression && design.progression.levelCap) || 60);
    var scale = Math.pow(cap / 60, 1.55);
    var s = PN.stats.statSetOf(design);

    var effects = t.effects.map(function (pair) {
      var e = newEffect(pair[0], pair[1]);
      if (e.base !== undefined) e.base = Math.round(e.base * scale);
      if (e.amount !== undefined && (e.type === 'buffStat' || e.type === 'debuffStat'))
        e.amount = Math.round(e.amount * scale);
      if (e.stat === null && s.primaries.length) e.stat = s.primaries[0].id;
      return e;
    });

    var ab = newAbility(U.merge({
      name: opts.name || t.name,
      classId: opts.classId || null,
      effects: effects,
      tags: t.tags
    }, t.base));
    if (opts.school) ab.school = opts.school;
    return ab;
  }

  PN.abilities = {
    SCHOOLS: SCHOOLS, SCHOOL_BY_ID: SCHOOL_BY_ID, TARGETING: TARGETING,
    POWER_CLASSES: POWER_CLASSES, powerKind: powerKind, scalingRef: scalingRef,
    statSplit: statSplit, abilityWeight: abilityWeight,
    EFFECT_TYPES: EFFECT_TYPES, EFFECT_BY_ID: EFFECT_BY_ID, EFFECT_CATS: EFFECT_CATS,
    TEMPLATES: TEMPLATES, TEMPLATE_BY_ID: TEMPLATE_BY_ID, TEMPLATE_GROUPS: TEMPLATE_GROUPS,
    newAbility: newAbility, newEffect: newEffect, fromTemplate: fromTemplate,
    abilityById: abilityById, abilitiesOf: abilitiesOf,
    effectsOfType: effectsOfType, hasEffect: hasEffect,
    shape: shape, abilityTags: abilityTags
  };
})(PN);
