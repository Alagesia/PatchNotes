/* Patch Notes - scrolls, and what Enchanting is actually for.

   Enchanting was a profession that made "consumables and gear", which
   is to say it made whatever the other professions made and had no
   reason to exist. What an enchanter really does is improve somebody
   else's work: a small permanent bonus applied to a piece of gear that
   was already good.

   A scroll is that. It is an item like any other - it drops, it is
   crafted, it trades, it has a market price - and it carries a little
   pile of stats that go onto one equipped piece. The interesting part
   is not the numbers on it, it is that every player in your game has
   sixteen slots and will put the best scroll they can find on each of
   them, judged by the job their build actually does. Scroll a tank's
   chest with critical strike and they will not use it; the same scroll
   is the best thing a damage build has seen all week.

   Which means a scroll table is a second, quieter itemisation pass over
   your whole game, and it is priced and chased exactly like the first
   one.                                                                */
(function (PN) {
  'use strict';
  var U = PN.util, IT = PN.items, ST = PN.stats;

  /* Which slots a scroll may be applied to. Most enchants in the genre
     are restricted - a weapon enchant is not a boot enchant - and the
     restriction is what stops one scroll being the answer everywhere. */
  var SCOPES = [
    { id: 'any',     name: 'Any slot',
      desc: 'Goes on anything. Simple, and one good scroll then covers the whole character.' },
    { id: 'weapon',  name: 'Weapons',      slots: ['mainHand', 'offHand'],
      desc: 'The slot people care most about, so the most valuable to get right.' },
    { id: 'armour',  name: 'Armour',       slots: ['head', 'shoulder', 'chest', 'wrist',
                                                   'hands', 'waist', 'legs', 'feet'],
      desc: 'The eight pieces somebody is always replacing.' },
    { id: 'jewelry', name: 'Jewellery',    slots: ['neck', 'ring1', 'ring2',
                                                   'trinket1', 'trinket2'],
      desc: 'Rings, necks and trinkets. Rarely replaced, so an enchant here lasts.' },
    { id: 'back',    name: 'Cloaks',       slots: ['back'],
      desc: 'One slot. A scroll nobody competes for.' }
  ];
  var SCOPE_BY_ID = {};
  SCOPES.forEach(function (s) { SCOPE_BY_ID[s.id] = s; });

  function isScroll(item) { return !!item && item.kind === 'scroll'; }

  /* Every scroll in the design, with its stats resolved. */
  var scrolls = U.memoDesign(function (design) {
    var out = [];
    (design.items || []).forEach(function (it) {
      if (it.kind !== 'scroll') return;
      var stats = it.stats || {};
      var any = false;
      U.keys(stats).forEach(function (k) { if (stats[k] > 0) any = true; });
      /* A scroll with nothing on it does nothing, and offering it to a
         player would be offering them a blank piece of paper. */
      if (!any) return;
      out.push({ id: it.id, item: it, stats: stats,
                 scope: SCOPE_BY_ID[it.scrollScope || 'any'] || SCOPE_BY_ID.any });
    });
    return out;
  });

  function fitsSlot(scroll, slot) {
    var sc = scroll.scope || SCOPE_BY_ID.any;
    if (!sc.slots) return true;
    return sc.slots.indexOf(slot) >= 0;
  }

  /* How much a secondary stat is worth to somebody doing a given job.
     This is the whole reason a scroll table is interesting: the same
     numbers are excellent for one build and dead weight for another. */
  var SECONDARY_ROLE = {
    crit:        { dps: 1.00, healer: 0.80, tank: 0.45 },
    haste:       { dps: 0.95, healer: 0.90, tank: 0.55 },
    mastery:     { dps: 0.90, healer: 0.85, tank: 0.80 },
    versatility: { dps: 0.75, healer: 0.75, tank: 0.85 },
    leech:       { dps: 0.45, healer: 0.35, tank: 0.80 },
    avoidance:   { dps: 0.10, healer: 0.10, tank: 1.00 },
    regen:       { dps: 0.40, healer: 0.95, tank: 0.35 }
  };

  /* What one scroll is worth to one player.

     Their own primary is the point of the thing. Stamina and armour
     keep a tank alive and are close to wasted on anybody else.
     Everything else is judged against the job they do, which is what
     makes a scroll table a set of decisions rather than a ladder. */
  function worthTo(design, agent, scroll, primaryId, role) {
    var set = ST.statSetOf(design);
    var mine = primaryId;
    var job = role || 'dps';
    var v = 0;
    U.keys(scroll.stats).forEach(function (sid) {
      var amt = scroll.stats[sid] || 0;
      if (amt <= 0) return;
      var mult;
      if (sid === mine) mult = 1;
      else if (set.stamina && sid === set.stamina.id) mult = job === 'tank' ? 0.9 : 0.3;
      else if (set.armour && sid === set.armour.id) mult = job === 'tank' ? 0.85 : 0.15;
      else {
        var sec = null;
        (set.secondaries || []).forEach(function (s) { if (s.id === sid) sec = s; });
        if (sec) {
          var row = SECONDARY_ROLE[sec.kind] || SECONDARY_ROLE.mastery;
          mult = row[job] === undefined ? 0.6 : row[job];
        } else {
          /* Somebody else's primary. Almost nothing. */
          mult = 0.05;
        }
      }
      v += amt * mult;
    });
    return v;
  }

  /* The best scroll this player can put in this slot, out of what the
     design offers. Players do not hoard enchants - they use the best
     one they can get - so this is a straight pick. */
  function bestFor(design, slot, primaryId, role, pool) {
    var list = pool || scrolls(design);
    var best = null, bestV = 0;
    for (var i = 0; i < list.length; i++) {
      if (!fitsSlot(list[i], slot)) continue;
      var v = worthTo(design, null, list[i], primaryId, role);
      if (v > bestV) { bestV = v; best = list[i]; }
    }
    return best ? { scroll: best, worth: bestV } : null;
  }

  /* How much power a player's scrolls are actually adding, as a share
     of a full stat budget at their item level. Enchants are meant to be
     a percentage on top of gear, not a second set of gear - if this
     comes out large, your scrolls are the gear. */
  function scrollBudget(design, ilvl) {
    return Math.max(1, ST.budgetForLevel ? ST.budgetForLevel(design, ilvl)
                                         : Math.max(1, ilvl) * 2.4);
  }

  /* What is wrong with the scrolls you wrote. */
  function issues(design) {
    var out = [];
    var list = scrolls(design);
    var hasEnchanting = PN.crafting.recipes(design).some(function (r) {
      return r.profession === 'enchanting'; });
    if (!list.length) {
      if (hasEnchanting) out.push('Enchanting makes nothing that goes on gear - write a scroll');
      return out;
    }
    /* A scroll nobody can get is a scroll nobody uses. */
    var orphans = list.filter(function (s) {
      return IT.isOrphan(design, s.item); });
    if (orphans.length) {
      out.push(orphans.length + ' scroll' + (orphans.length === 1 ? '' : 's') +
        ' nothing in the game hands out');
    }
    /* One scroll that goes anywhere and beats everything is not a
       decision, it is a checkbox. */
    var anySlot = list.filter(function (s) { return !s.scope.slots; });
    if (anySlot.length === list.length && list.length > 2) {
      out.push('Every scroll goes in every slot - nobody has a choice to make');
    }
    /* A scroll worth more than the gear it goes on is not a finishing
       touch, it is the item. The simulation caps what one can add, so
       past this point the extra numbers do nothing at all - which is
       worse than them being too strong, because they look like they
       work. Measured against typical gear at the top of your ladder. */
    var topIlvl = 1;
    (design.items || []).forEach(function (i) {
      if (i.kind === 'gear') topIlvl = Math.max(topIlvl, i.itemLevel || 0); });
    var typical = Math.max(1, ST.itemBudget(design, topIlvl, 'rare', 'chest'));
    var overblown = list.filter(function (s) {
      var big = 0;
      U.keys(s.stats).forEach(function (k) { big += s.stats[k] || 0; });
      return big > typical;
    });
    if (overblown.length) {
      out.push(overblown.length + ' scroll' + (overblown.length === 1 ? ' is' : 's are') +
        ' worth more than the gear they go on - everything past that is wasted');
    }
    var roles = ['tank', 'healer', 'dps'];
    var prims = (ST.statSetOf(design).primaries || []).map(function (p) { return p.id; });
    var served = {};
    roles.forEach(function (job) {
      prims.forEach(function (p) {
        if (bestFor(design, 'chest', p, job, list)) served[job] = 1;
      });
    });
    roles.forEach(function (job) {
      if (!served[job]) out.push('No scroll is worth anything to a ' + job);
    });
    return out;
  }

  /* A readable summary for the crafting screen. */
  function summary(design) {
    var list = scrolls(design);
    var byScope = {};
    list.forEach(function (s) {
      byScope[s.scope.id] = (byScope[s.scope.id] || 0) + 1; });
    return { count: list.length, byScope: byScope, issues: issues(design) };
  }

  PN.scrolls = {
    SCOPES: SCOPES, SCOPE_BY_ID: SCOPE_BY_ID, SECONDARY_ROLE: SECONDARY_ROLE,
    isScroll: isScroll, scrolls: scrolls, fitsSlot: fitsSlot,
    worthTo: worthTo, bestFor: bestFor, scrollBudget: scrollBudget,
    issues: issues, summary: summary
  };
})(PN);
