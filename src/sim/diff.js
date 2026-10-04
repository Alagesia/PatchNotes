/* Patch Notes - what changed between two versions of a design.

   Patches used to work backwards. You declared an intent - "two zones,
   a raid, a gear tier" - and shipping it GENERATED that content into
   your game at random. The one thing a patch could not do was describe
   the work you actually did.

   This is the other way round, which is the only way round that makes
   sense in a game about authoring: you edit the design, and when you
   ship, the game reads the difference between what players have and
   what you have built, and writes the notes from that.

   The output is deliberately shaped like real patch notes: added,
   removed, changed, grouped by the part of the game a player would
   recognise.                                                          */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* Every authored list worth diffing, and how to talk about it. A list
     is matched by id; a rename is a change, not an add plus a remove. */
  var LISTS = [
    { k: 'zones',       one: 'zone',        many: 'zones',        group: 'World' },
    { k: 'monsters',    one: 'creature',    many: 'creatures',    group: 'World' },
    { k: 'questgivers', one: 'questgiver',  many: 'questgivers',  group: 'World' },
    { k: 'quests',      one: 'quest',       many: 'quests',       group: 'World' },
    { k: 'questlines',  one: 'questline',   many: 'questlines',   group: 'World' },
    { k: 'dungeons',    one: 'dungeon',     many: 'dungeons',     group: 'Dungeons & Raids' },
    { k: 'bosses',      one: 'boss',        many: 'bosses',       group: 'Dungeons & Raids' },
    { k: 'classes',     one: 'class',       many: 'classes',      group: 'Classes' },
    { k: 'abilities',   one: 'ability',     many: 'abilities',    group: 'Classes' },
    { k: 'items',       one: 'item',        many: 'items',        group: 'Items & Loot' },
    { k: 'lootTables',  one: 'loot table',  many: 'loot tables',  group: 'Items & Loot' },
    { k: 'rewards',     one: 'reward',      many: 'rewards',      group: 'Items & Loot' },
    { k: 'rewardChains', one: 'reward chain', many: 'reward chains', group: 'Items & Loot' },
    { k: 'recipes',     one: 'recipe',      many: 'recipes',      group: 'Crafting' },
    /* The live calendar. Authoring a holiday costs design, art and
       engineering like anything else does - the build cost has always
       counted it - but it was missing from this list, so it never
       appeared in a patch note and a release that was ENTIRELY a new
       world event read as "no player-facing changes". */
    { k: 'events',      one: 'world event', many: 'world events',  group: 'Live calendar' },
    { k: 'expansions',  one: 'expansion',   many: 'expansions',   group: 'Roadmap' }
  ];

  /* Numeric dials a player would notice moving, with the words a real
     patch note would use for them. up/down say which direction is a buff. */
  var DIALS = [
    { path: 'progression.levelCap',        name: 'Level cap',              group: 'Progression', fmt: 'int' },
    { path: 'progression.xpSteepness',     name: 'Levelling curve',        group: 'Progression', invert: true },
    { path: 'progression.timeToCapHours',  name: 'Time to level cap',      group: 'Progression', fmt: 'hours', invert: true },
    { path: 'progression.verticalRatio',   name: 'Power growth per level', group: 'Progression' },
    { path: 'progression.catchUp',         name: 'Catch-up help',          group: 'Progression' },
    { path: 'progression.talentPointsPerLevel', name: 'Talent points per level', group: 'Progression', fmt: 'dec' },
    { path: 'gearing.resetSeverity',       name: 'Tier reset severity',    group: 'Items & Loot', invert: true },
    { path: 'economy.faucetRate',          name: 'Currency income',        group: 'Economy' },
    { path: 'economy.sinkRate',            name: 'Currency sinks',         group: 'Economy', invert: true },
    { path: 'economy.gatheringNodes',      name: 'Gathering density',      group: 'Crafting' },
    { path: 'economy.auctionTax',          name: 'Auction house cut',      group: 'Economy', invert: true },
    { path: 'economy.deathRepairCost',     name: 'Repair costs',           group: 'Economy', invert: true },
    { path: 'pvp.damping',                 name: 'PvP damage reduction',   group: 'PvP' },
    { path: 'pvp.gearPower',               name: 'How much gear decides a match', group: 'PvP', invert: true },
    { path: 'pvp.seasonWeeks',             name: 'PvP season length',      group: 'PvP', fmt: 'int' },
    { path: 'social.lfgDepth',             name: 'Group finder',           group: 'Social' },
    { path: 'infra.serverTech',            name: 'Server technology',      group: 'Infrastructure' },
    { path: 'infra.capacityHeadroom',      name: 'Server headroom',        group: 'Infrastructure' },
    { path: 'stats.critBonus',             name: 'Critical strike damage', group: 'Combat' },
    { path: 'stats.healthPerLevel',        name: 'Health per level',       group: 'Combat' },
    { path: 'stats.powerPerLevel',         name: 'Power per level',        group: 'Combat' },
    { path: 'identity.productionValue',    name: 'Production values',      group: 'Presentation' },
    { path: 'liveOps.hotfixSpeed',         name: 'Hotfix turnaround',      group: 'Live Ops' },
    { path: 'liveOps.balancePassEffort',   name: 'Balance pass effort',    group: 'Live Ops' },
    { path: 'liveOps.moderationSpend',     name: 'Moderation',             group: 'Live Ops' },
    { path: 'liveOps.antiCheatSpend',      name: 'Anti-cheat',             group: 'Live Ops' },
    { path: 'factions.creatorDepth',       name: 'Character creator depth', group: 'Presentation' }
  ];

  /* Switches. On is a buff unless said otherwise. */
  var FLAGS = [
    { path: 'gearing.upgradeTrack',   name: 'Upgrade tracks',        group: 'Items & Loot' },
    { path: 'gearing.borrowedPower',  name: 'Borrowed power',        group: 'Items & Loot' },
    { path: 'gearing.setBonuses',     name: 'Set bonuses',           group: 'Items & Loot' },
    { path: 'gearing.socketing',      name: 'Sockets and enchants',  group: 'Items & Loot' },
    { path: 'gearing.legendaryChains', name: 'Legendary questlines', group: 'Items & Loot' },
    { path: 'gearing.tradeable',      name: 'Gear trading',          group: 'Economy' },
    { path: 'economy.tradingEnabled', name: 'Player trading',        group: 'Economy' },
    { path: 'economy.auctionHouse',   name: 'The auction house',     group: 'Economy' },
    { path: 'economy.vendorRepair',   name: 'Vendor repairs',        group: 'Economy' },
    { path: 'pvp.enabled',            name: 'PvP',                   group: 'PvP' },
    { path: 'pvp.soloQueue',          name: 'Solo queue',            group: 'PvP' },
    { path: 'pvp.ccDiminishing',      name: 'Diminishing returns on control', group: 'PvP' },
    { path: 'social.crossRealm',      name: 'Cross-realm play',      group: 'Social' },
    { path: 'social.guildHalls',      name: 'Guild halls',           group: 'Social' },
    { path: 'social.guildProgression', name: 'Guild progression',    group: 'Social' },
    { path: 'social.guildFinder',     name: 'Guild finder',          group: 'Social' },
    { path: 'social.voiceChat',       name: 'Built-in voice',        group: 'Social' },
    { path: 'progression.mentoring',  name: 'Mentoring',             group: 'Progression' },
    { path: 'progression.levelScaling', name: 'Level scaling',       group: 'Progression' },
    { path: 'progression.prestige',   name: 'Prestige levels',       group: 'Progression' },
    { path: 'progression.alternateAdvancement', name: 'Alternate advancement', group: 'Progression' }
  ];

  function dig(obj, path) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function fmtValue(v, fmt) {
    if (v === undefined || v === null) return '-';
    if (fmt === 'int') return U.fmtInt(v);
    if (fmt === 'dec') return U.round(v, 2);
    if (fmt === 'hours') return U.fmtInt(v) + 'h';
    return U.round(v, 0);
  }

  /* ------------------------------------------------------------ diff -- */

  function listDiff(before, after, def) {
    var was = (before && before[def.k]) || [];
    var now = (after && after[def.k]) || [];
    var byIdWas = {}, byIdNow = {};
    was.forEach(function (x) { if (x && x.id) byIdWas[x.id] = x; });
    now.forEach(function (x) { if (x && x.id) byIdNow[x.id] = x; });

    var added = [], removed = [], renamed = [], retuned = [];
    now.forEach(function (x) {
      if (!x || !x.id) return;
      var old = byIdWas[x.id];
      if (!old) { added.push(x); return; }
      if ((old.name || '') !== (x.name || '')) renamed.push({ from: old.name, to: x.name });
      else if (JSON.stringify(old) !== JSON.stringify(x)) retuned.push(x);
    });
    was.forEach(function (x) {
      if (x && x.id && !byIdNow[x.id]) removed.push(x);
    });
    return { def: def, added: added, removed: removed,
             renamed: renamed, retuned: retuned };
  }

  /* The whole comparison, as data. Rendering is somebody else's job. */
  function compare(before, after) {
    var out = { lists: [], dials: [], flags: [], empty: true };
    if (!after) return out;
    if (!before) {
      /* Nothing shipped yet: everything is new. */
      LISTS.forEach(function (def) {
        var now = after[def.k] || [];
        if (now.length) {
          out.lists.push({ def: def, added: now.slice(), removed: [], renamed: [], retuned: [] });
          out.empty = false;
        }
      });
      return out;
    }

    LISTS.forEach(function (def) {
      var d = listDiff(before, after, def);
      if (d.added.length || d.removed.length || d.renamed.length || d.retuned.length) {
        out.lists.push(d);
        out.empty = false;
      }
    });

    DIALS.forEach(function (def) {
      var a = dig(before, def.path), b = dig(after, def.path);
      if (a === undefined || b === undefined) return;
      if (typeof a !== 'number' || typeof b !== 'number') return;
      if (Math.abs(a - b) < 0.005) return;
      var up = b > a;
      out.dials.push({ def: def, from: a, to: b, up: up,
                       buff: def.invert ? !up : up });
      out.empty = false;
    });

    FLAGS.forEach(function (def) {
      var a = dig(before, def.path), b = dig(after, def.path);
      if (a === undefined || b === undefined) return;
      if (!!a === !!b) return;
      out.flags.push({ def: def, on: !!b });
      out.empty = false;
    });

    return out;
  }

  /* -------------------------------------------------------- rendering -- */

  function nameList(items, limit) {
    var names = items.map(function (x) { return x.name || '(unnamed)'; });
    if (names.length <= limit) return names.join(', ');
    return names.slice(0, limit).join(', ') + ' and ' +
           (names.length - limit) + ' more';
  }

  /* One line per real change, grouped the way a player reads them. */
  function lines(diff) {
    var groups = {};
    function add(group, text) { (groups[group] = groups[group] || []).push(text); }

    diff.lists.forEach(function (d) {
      var def = d.def;
      if (d.added.length) {
        add(def.group, 'Added ' + d.added.length + ' ' +
          (d.added.length === 1 ? def.one : def.many) + ': ' + nameList(d.added, 4) + '.');
      }
      if (d.removed.length) {
        add(def.group, 'Removed ' + d.removed.length + ' ' +
          (d.removed.length === 1 ? def.one : def.many) + ': ' + nameList(d.removed, 4) + '.');
      }
      d.renamed.forEach(function (r) {
        add(def.group, U.titleCase(def.one) + ' "' + r.from + '" is now "' + r.to + '".');
      });
      if (d.retuned.length) {
        add(def.group, 'Retuned ' + d.retuned.length + ' ' +
          (d.retuned.length === 1 ? def.one : def.many) + ': ' + nameList(d.retuned, 4) + '.');
      }
    });

    diff.dials.forEach(function (c) {
      add(c.def.group, c.def.name + ' ' + (c.up ? 'increased' : 'reduced') + ' from ' +
        fmtValue(c.from, c.def.fmt) + ' to ' + fmtValue(c.to, c.def.fmt) + '.');
    });

    diff.flags.forEach(function (c) {
      add(c.def.group, c.def.name + (c.on ? ' is now enabled.' : ' has been turned off.'));
    });

    /* A stable, readable order rather than whatever the objects hash to. */
    var ORDER = ['Progression', 'Classes', 'Combat', 'World', 'Dungeons & Raids',
                 'Items & Loot', 'Crafting', 'PvP', 'Economy', 'Social',
                 'Live Ops', 'Infrastructure', 'Presentation', 'Roadmap'];
    var out = [];
    ORDER.forEach(function (g) {
      if (groups[g] && groups[g].length) out.push({ group: g, items: groups[g] });
    });
    U.keys(groups).forEach(function (g) {
      if (ORDER.indexOf(g) < 0) out.push({ group: g, items: groups[g] });
    });
    return out;
  }

  /* Plain text, for the notes field and the patch history. */
  function toText(diff) {
    var ls = lines(diff);
    if (!ls.length) return 'No player-facing changes.';
    return ls.map(function (g) {
      return g.group.toUpperCase() + '\n' +
        g.items.map(function (t) { return '  - ' + t; }).join('\n');
    }).join('\n\n');
  }

  /* How big this change actually is, which is what decides whether it is
     a patch, a minor release or a major one. A version number that says
     "major" for a tooltip fix is a lie. */
  function weight(diff) {
    var w = 0;
    diff.lists.forEach(function (d) {
      var heavy = d.def.k === 'zones' || d.def.k === 'dungeons' ||
                  d.def.k === 'classes' || d.def.k === 'expansions';
      w += (d.added.length + d.removed.length) * (heavy ? 8 : 1.2);
      w += d.retuned.length * 0.25;
      w += d.renamed.length * 0.1;
    });
    w += diff.dials.length * 0.8;
    w += diff.flags.length * 3;
    return w;
  }

  function suggestKind(diff) {
    var w = weight(diff);
    if (w >= 40) return 'major';
    if (w >= 8) return 'minor';
    return 'patch';
  }

  /* A one-line summary for the roadmap and the history list. */
  function headline(diff) {
    var ls = lines(diff);
    if (!ls.length) return 'No player-facing changes';
    var n = 0;
    ls.forEach(function (g) { n += g.items.length; });
    return n + ' change' + (n === 1 ? '' : 's') + ' across ' +
      ls.length + ' area' + (ls.length === 1 ? '' : 's');
  }

  PN.diff = {
    LISTS: LISTS, DIALS: DIALS, FLAGS: FLAGS,
    compare: compare, lines: lines, toText: toText,
    weight: weight, suggestKind: suggestKind, headline: headline
  };
})(window.PN);
