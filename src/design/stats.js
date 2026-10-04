/* Patch Notes - the stat system.
   The player defines their own stat set. Everything downstream - gear
   budgets, ability scaling, character power, time-to-kill - is computed
   from it rather than asserted by a slider.                              */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Secondary stats the combat solver understands. The player names them
     and chooses which exist; these are the mechanical hooks.            */
  var SECONDARY_KINDS = [
    { id: 'crit',        name: 'Critical Strike', desc: 'Chance to deal bonus damage or healing.' },
    { id: 'haste',       name: 'Haste',           desc: 'Faster casts, faster attacks, faster resource regen.' },
    { id: 'mastery',     name: 'Mastery',         desc: 'A flat multiplier on the class fantasy. Cheap depth.' },
    { id: 'versatility', name: 'Versatility',     desc: 'Damage and healing up, damage taken down. The boring safe one.' },
    { id: 'leech',       name: 'Leech',           desc: 'Heal for a share of damage dealt.' },
    { id: 'avoidance',   name: 'Avoidance',       desc: 'Dodge and parry. Swingy for tanks.' },
    { id: 'regen',       name: 'Resource Regen',  desc: 'Sustain in long fights.' }
  ];
  var SECONDARY_BY_KIND = {};
  SECONDARY_KINDS.forEach(function (s) { SECONDARY_BY_KIND[s.id] = s; });

  /* How a primary stat converts into offensive power. */
  var POWER_KINDS = [
    { id: 'attack', name: 'Attack Power' },
    { id: 'spell',  name: 'Spell Power' },
    { id: 'both',   name: 'Attack & Spell Power' }
  ];

  /* Equipment slots. budget is the share of a full stat budget the slot
     carries - a chest piece is worth far more than a ring.             */
  var GEAR_SLOTS = [
    { id: 'head',     name: 'Head',      budget: 1.00, armour: true },
    { id: 'neck',     name: 'Neck',      budget: 0.56, armour: false },
    { id: 'shoulder', name: 'Shoulders', budget: 0.75, armour: true },
    { id: 'back',     name: 'Back',      budget: 0.56, armour: true },
    { id: 'chest',    name: 'Chest',     budget: 1.00, armour: true },
    { id: 'wrist',    name: 'Wrists',    budget: 0.56, armour: true },
    { id: 'hands',    name: 'Hands',     budget: 0.75, armour: true },
    { id: 'waist',    name: 'Waist',     budget: 0.75, armour: true },
    { id: 'legs',     name: 'Legs',      budget: 1.00, armour: true },
    { id: 'feet',     name: 'Feet',      budget: 0.75, armour: true },
    { id: 'ring1',    name: 'Ring',      budget: 0.56, armour: false, family: 'ring' },
    { id: 'ring2',    name: 'Ring',      budget: 0.56, armour: false, family: 'ring' },
    { id: 'trinket1', name: 'Trinket',   budget: 0.70, armour: false, family: 'trinket' },
    { id: 'trinket2', name: 'Trinket',   budget: 0.70, armour: false, family: 'trinket' },
    { id: 'mainHand', name: 'Main Hand', budget: 1.00, armour: false, weapon: true },
    { id: 'offHand',  name: 'Off Hand',  budget: 0.56, armour: false, weapon: true }
  ];
  var SLOT_BY_ID = {};
  GEAR_SLOTS.forEach(function (s) { SLOT_BY_ID[s.id] = s; });

  /* A character wears two rings and two trinkets, but a ring is a ring:
     you author one and it goes in whichever finger is free. So an item's
     slot may name a FAMILY (ring, trinket) as well as a physical slot,
     and the two ring slots both accept it.

     The slots a player actually has are still the sixteen below - it is
     only authoring that collapses the pairs. */
  var SLOT_FAMILIES = [
    { id: 'ring',    name: 'Ring',    slots: ['ring1', 'ring2'], budget: 0.56 },
    { id: 'trinket', name: 'Trinket', slots: ['trinket1', 'trinket2'], budget: 0.70 }
  ];
  var FAMILY_BY_ID = {};
  SLOT_FAMILIES.forEach(function (f) { FAMILY_BY_ID[f.id] = f; });

  /* The list an item editor should offer: physical slots, with each
     paired set collapsed to the one choice that matters. */
  var AUTHOR_SLOTS = (function () {
    var seen = {}, out = [];
    GEAR_SLOTS.forEach(function (s) {
      if (s.family) {
        if (seen[s.family]) return;
        seen[s.family] = 1;
        out.push(FAMILY_BY_ID[s.family]);
        return;
      }
      out.push(s);
    });
    return out;
  })();

  /* Which physical slots this item can go in. */
  function slotsFor(slotId) {
    if (FAMILY_BY_ID[slotId]) return FAMILY_BY_ID[slotId].slots.slice();
    return SLOT_BY_ID[slotId] ? [slotId] : [];
  }
  /* Can this item be worn in that physical slot? */
  function fitsSlot(item, slotId) {
    if (!item || !item.slot) return false;
    return slotsFor(item.slot).indexOf(slotId) >= 0;
  }
  /* What to call the slot an item is for. */
  function slotName(slotId) {
    var f = FAMILY_BY_ID[slotId];
    if (f) return f.name;
    return SLOT_BY_ID[slotId] ? SLOT_BY_ID[slotId].name : slotId;
  }
  /* The budget share a slot carries, family or physical. */
  function slotBudget(slotId) {
    var f = FAMILY_BY_ID[slotId];
    if (f) return f.budget;
    return SLOT_BY_ID[slotId] ? SLOT_BY_ID[slotId].budget : 0.56;
  }
  var TOTAL_SLOT_BUDGET = U.sum(GEAR_SLOTS, function (s) { return s.budget; });

  /* Rarity multiplies the budget and gates how many secondary stats an
     item may carry.                                                     */
  var RARITIES = [
    { id: 'poor',      name: 'Poor',      mult: 0.55, maxSecondary: 0, colour: '#8d95a8' },
    { id: 'common',    name: 'Common',    mult: 0.75, maxSecondary: 1, colour: '#e2e6ef' },
    { id: 'uncommon',  name: 'Uncommon',  mult: 0.88, maxSecondary: 1, colour: '#5fd6a0' },
    { id: 'rare',      name: 'Rare',      mult: 1.00, maxSecondary: 2, colour: '#5fb3ff' },
    { id: 'epic',      name: 'Epic',      mult: 1.12, maxSecondary: 3, colour: '#b79cff' },
    { id: 'legendary', name: 'Legendary', mult: 1.30, maxSecondary: 4, colour: '#ffc861' },
    { id: 'mythic',    name: 'Mythic',    mult: 1.48, maxSecondary: 4, colour: '#ff8fd0' },
    { id: 'artifact',  name: 'Artifact',  mult: 1.70, maxSecondary: 5, colour: '#ff6f4d' }
  ];
  var RARITY_BY_ID = {};
  RARITIES.forEach(function (r) { RARITY_BY_ID[r.id] = r; });

  /* What a point of each stat costs against the item budget. */
  var COST = { primary: 1.00, stamina: 0.68, secondary: 1.00, armour: 0.22 };

  /* ------------------------------------------------------- default set */

  function defaultStatSet() {
    return {
      primaries: [
        { id: 'str', name: 'Strength',  powers: 'attack', roles: ['tank', 'dps'] },
        { id: 'agi', name: 'Agility',   powers: 'attack', roles: ['dps'] },
        { id: 'int', name: 'Intellect', powers: 'spell',  roles: ['healer', 'dps'] }
      ],
      stamina:   { id: 'sta', name: 'Stamina', healthPerPoint: 11 },
      secondaries: [
        { id: 'crit',  name: 'Critical Strike', kind: 'crit',        ratingPerPct: 34, cap: 60 },
        { id: 'haste', name: 'Haste',           kind: 'haste',       ratingPerPct: 36, cap: 50 },
        { id: 'mast',  name: 'Mastery',         kind: 'mastery',     ratingPerPct: 36, cap: 70 },
        { id: 'vers',  name: 'Versatility',     kind: 'versatility', ratingPerPct: 42, cap: 45 }
      ],
      armour:    { id: 'arm', name: 'Armour', mitigationK: 38 },
      /* Power per point of primary stat, and ability scaling. */
      powerPerPrimary: 1.0,
      /* Base character values at level 1, before gear. */
      baseHealth: 60,
      healthPerLevel: 22,
      basePower: 8,
      powerPerLevel: 3.2,
      critBonus: 100,           /* % extra damage on a crit               */
      /* How steeply item budgets grow with item level.                  */
      budgetExponent: 1.45,
      budgetScale: 0.42
    };
  }

  function statSetOf(design) {
    if (!design.stats) design.stats = defaultStatSet();
    return design.stats;
  }

  /* Every stat id the design knows about, with its cost class. */
  function allStats(design) {
    var s = statSetOf(design), out = [];
    s.primaries.forEach(function (p) {
      out.push({ id: p.id, name: p.name, cls: 'primary', def: p });
    });
    out.push({ id: s.stamina.id, name: s.stamina.name, cls: 'stamina', def: s.stamina });
    s.secondaries.forEach(function (x) {
      out.push({ id: x.id, name: x.name, cls: 'secondary', def: x });
    });
    out.push({ id: s.armour.id, name: s.armour.name, cls: 'armour', def: s.armour });
    return out;
  }
  function statById(design, id) {
    var list = allStats(design);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------------------------------------------------------- budgets */

  /* Total stat points an item of this level/rarity/slot may carry. */
  function itemBudget(design, itemLevel, rarityId, slotId) {
    var s = statSetOf(design);
    var rarity = RARITY_BY_ID[rarityId] || RARITY_BY_ID.rare;
    /* A slot id may name a family (ring, trinket) as well as a physical
       slot; both carry the same budget share. */
    var share = slotBudget(slotId);
    return Math.pow(Math.max(1, itemLevel), s.budgetExponent) * s.budgetScale * rarity.mult * share;
  }

  /* Points an item actually spends. */
  function budgetUsed(design, item) {
    var total = 0;
    U.keys(item.stats || {}).forEach(function (id) {
      var st = statById(design, id);
      if (!st) return;
      total += (item.stats[id] || 0) * (COST[st.cls] || 1);
    });
    return total;
  }

  /* Spread a budget across chosen stats, respecting cost weights. */
  function autoAllocate(design, item, weights) {
    var cap = itemBudget(design, item.itemLevel, item.rarity, item.slot);
    var ids = U.keys(weights).filter(function (k) { return weights[k] > 0; });
    if (!ids.length) { item.stats = {}; return item; }
    var wTotal = U.sum(ids, function (k) { return weights[k]; });
    var stats = {};
    ids.forEach(function (id) {
      var st = statById(design, id);
      if (!st) return;
      var points = (cap * (weights[id] / wTotal)) / (COST[st.cls] || 1);
      stats[id] = Math.max(1, Math.round(points));
    });
    item.stats = stats;
    return item;
  }

  /* ------------------------------------------------- rating conversion */

  /* Diminishing returns keep any single secondary from running away. */
  function ratingToPct(design, secondaryDef, rating, level) {
    if (!secondaryDef || rating <= 0) return 0;
    var perPct = secondaryDef.ratingPerPct * (1 + (level || 60) / 90);
    var raw = rating / Math.max(1, perPct);
    var cap = secondaryDef.cap || 60;
    /* Soft cap: approaches `cap` asymptotically. */
    return cap * (1 - Math.exp(-raw / (cap * 0.72)));
  }

  /* Armour to damage reduction. */
  function armourToReduction(design, armour, level) {
    var s = statSetOf(design);
    var k = s.armour.mitigationK * (level || 60) * 1.6;
    return U.clamp01(armour / Math.max(1, armour + k)) * 0.82;
  }

  PN.stats = {
    SECONDARY_KINDS: SECONDARY_KINDS, SECONDARY_BY_KIND: SECONDARY_BY_KIND,
    POWER_KINDS: POWER_KINDS,
    GEAR_SLOTS: GEAR_SLOTS, SLOT_BY_ID: SLOT_BY_ID, TOTAL_SLOT_BUDGET: TOTAL_SLOT_BUDGET,
    SLOT_FAMILIES: SLOT_FAMILIES, FAMILY_BY_ID: FAMILY_BY_ID, AUTHOR_SLOTS: AUTHOR_SLOTS,
    slotsFor: slotsFor, fitsSlot: fitsSlot, slotName: slotName, slotBudget: slotBudget,
    RARITIES: RARITIES, RARITY_BY_ID: RARITY_BY_ID, COST: COST,
    defaultStatSet: defaultStatSet, statSetOf: statSetOf,
    allStats: allStats, statById: statById,
    itemBudget: itemBudget, budgetUsed: budgetUsed, autoAllocate: autoAllocate,
    ratingToPct: ratingToPct, armourToReduction: armourToReduction
  };
})(PN);
