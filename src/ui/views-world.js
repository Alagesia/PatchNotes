/* Patch Notes - world, PvE, PvP and expansion authoring.
   Zones own monsters, questgivers and quests. Dungeons sit in zones,
   bosses sit in dungeons, and everything hands out real rewards.       */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc,
      W = PN.world, IT = PN.items, S = PN.schema, met = PN.metrics;

  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  /* Shared: a picker of reward bundles. */
  function rewardPicker(design, path, value, label) {
    var opts = [{ id: '', name: '(none)' }].concat((design.rewards || []).map(function (r) {
      return { id: r.id, name: r.name + '  (' + Math.round(IT.rewardValue(design, r)) + ')' };
    }));
    return ui.select({ path: path, label: label || 'Reward', value: value || '', options: opts });
  }
  function lootPicker(design, path, value, label) {
    var opts = [{ id: '', name: '(none)' }].concat((design.lootTables || []).map(function (t) {
      return { id: t.id, name: t.name + '  (' + Math.round(IT.lootValue(design, t)) + ')' };
    }));
    return ui.select({ path: path, label: label || 'Loot table', value: value || '', options: opts });
  }

  /* ============================================================== WORLD */

  var WORLD_SUBTABS = [
    { id: 'zones', name: 'Zones' },
    { id: 'monsters', name: 'Monsters' },
    { id: 'givers', name: 'Questgivers' },
    { id: 'quests', name: 'Quests' },
    { id: 'chains', name: 'Reward Chains' }
  ];

  function worldTab() {
    var sub = PN.app.worldTab || 'zones';
    var body = sub === 'monsters' ? monsterSection()
             : sub === 'givers' ? giverSection()
             : sub === 'quests' ? questSection()
             : sub === 'chains' ? chainSection()
             : zoneSection();
    return ui.tabs(WORLD_SUBTABS, sub, 'world.tab') + body;
  }

  /* ---------------------------------------------------------- zones --- */

  function zoneSection() {
    var d = D();
    var current = sel().zoneId ? U.byId(d.zones, sel().zoneId) : d.zones[0];
    if (current) sel().zoneId = current.id;

    var list = d.zones.map(function (z) {
      var mobs = W.monstersIn(d, z.id).length;
      var qs = W.questsIn(d, z.id).length;
      var npcs = W.giversIn(d, z.id).length;
      var dungeons = S.dungeonsIn(d, z.id).length;
      var thin = mobs === 0 || qs === 0;
      return '<div class="item' + (current && z.id === current.id ? ' on' : '') +
        '" data-act="zone.select" data-val="' + z.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(z.name) +
          (thin ? ' <span class="chip warn">empty</span>' : '') + '</div>' +
        '<div class="s">Level ' + z.levelLo + '-' + z.levelHi + ' &middot; ' + mobs + ' monsters &middot; ' +
        npcs + ' NPCs &middot; ' + qs + ' quests &middot; ' + dungeons + ' dungeons</div></div></div>';
    }).join('') || ui.empty('No zones.', 'Zones are where monsters, questgivers and quests live.');

    var line = U.byId(d.questlines || [], sel().questlineId);
    return '<div class="grid g-1-2"><div>' +
      ui.panel('Zones', list, {
        actions: '<button class="sm" data-act="zone.add">Add zone</button>',
        hint: d.zones.length + ' zones' }) +
      '</div><div>' +
      /* A questline selected in the rail takes the editor, because
         that is what you clicked on. */
      (line ? questlineEditor(line)
        : current ? zoneEditor(current)
        : ui.panel('Editor', ui.empty('Select a zone or a questline.'))) +
      '</div></div>';
  }

  /* ------------------------------------------------------- questlines --

     A series of quests in order. There was a data structure, a dropdown
     on every quest pointing at it, and no way anywhere to make one - so
     the dropdown was always empty and the concept did not exist.

     What it buys: a quest that is chapter four of something is worth
     more than the same quest standing on its own, because you come back
     for chapter five. The bonus grows with the length of the line. */
  function questlineEditor(line) {
    var d = D();
    var mine = (d.quests || []).filter(function (q) { return q.questlineId === line.id; })
      .sort(function (a, b) { return (a.level || 0) - (b.level || 0); });
    var zone = U.byId(d.zones || [], line.zoneId);
    var loose = (d.quests || []).filter(function (q) {
      return !q.questlineId && (!line.zoneId || q.zoneId === line.zoneId); });

    var perQuest = mine.length >= 2 ? mine.length * 0.05 : 0;

    var chapters = mine.length
      ? mine.map(function (q, i) {
          return '<div class="row small" style="background:var(--panel-2);border-radius:6px;' +
            'padding:7px 9px;margin-bottom:5px">' +
            '<span class="mono tiny" style="width:28px">' + (i + 1) + '</span>' +
            '<span class="click" data-act="quest.open" data-val="' + q.id + '">' +
              esc(q.name) + '</span>' +
            '<span class="spacer"></span>' +
            '<span class="tiny faint">lv ' + (q.level || 1) + '</span>' +
            '<button class="xs ghost" data-act="ql.drop" data-val="' + q.id + '">remove</button>' +
            '</div>';
        }).join('')
      : '<div class="tiny faint">No quests in this line yet. A line of one is not a story.</div>';

    var addable = loose.length
      ? '<div class="row wrap" style="gap:4px;margin-top:8px">' + loose.slice(0, 16).map(function (q) {
          return '<span class="chip click" data-act="ql.take" data-val="' + line.id + '|' + q.id +
            '">+ ' + esc(q.name) + '</span>'; }).join('') + '</div>'
      : '<div class="tiny faint" style="margin-top:8px">Every quest ' +
        (zone ? 'in ' + esc(zone.name) : 'here') + ' is already in a line.</div>';

    var zoneOpts = [{ id: '', name: '(anywhere)' }].concat((d.zones || []).map(function (z) {
      return { id: z.id, name: z.name }; }));
    var rewardOpts = [{ id: '', name: '(nothing)' }].concat((d.rewards || []).map(function (r) {
      return { id: r.id, name: r.name }; }));

    return ui.panel('Questline: ' + line.name, ''
      + ui.text({ path: 'lineSel.name', label: 'Name', value: line.name })
      + ui.select({ path: 'lineSel.zoneId', label: 'Zone', value: line.zoneId || '',
          options: zoneOpts })
      + ui.select({ path: 'lineSel.capstoneRewardId', label: 'Reward for finishing it',
          value: line.capstoneRewardId || '', options: rewardOpts,
          desc: 'What the last chapter hands over. A campaign that ends on a copper piece is not a campaign.' })
      + ui.slider({ path: 'lineSel.branching', label: 'Branching', value: line.branching,
          desc: 'How much the line forks. Choices players remember, and quests you have to write twice.' })

      + '<div class="subhead spaced">Chapters, in order</div>'
      + chapters

      + '<div class="subhead spaced">Add a quest to it</div>'
      + addable

      + '<div class="subhead spaced">What it is worth</div>'
      + '<div class="grid g3">'
      + ui.stat('Chapters', mine.length)
      + ui.stat('Per quest', '+' + U.round(perQuest, 2) + 'h',
          mine.length < 2 ? 'needs two' : 'over a standalone quest')
      + ui.stat('In total', '+' + U.round(perQuest * mine.length, 1) + 'h')
      + '</div>'
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.55">A quest that is '
      + 'chapter four of something is worth more than the same quest on its own, because '
      + 'people come back for chapter five. The longer the line, the more each chapter in '
      + 'it is worth.</div>'

      + '<div class="row" style="margin-top:12px"><span class="spacer"></span>'
      + '<button class="sm danger ghost" data-act="ql.remove" data-val="' + line.id +
        '">Delete this questline</button></div>',
      { hint: mine.length + ' chapters' });
  }

  function zoneEditor(z) {
    var d = D();
    var mobs = W.monstersIn(d, z.id);
    var npcs = W.giversIn(d, z.id);
    var quests = W.questsIn(d, z.id);
    var dungeons = S.dungeonsIn(d, z.id);
    var lines = (d.questlines || []).filter(function (l) { return l.zoneId === z.id; });

    function chipList(items, act, empty) {
      return items.length
        ? '<div class="row wrap" style="gap:4px">' + items.map(function (x) {
            return '<span class="chip click" data-act="' + act + '" data-val="' + x.id + '">' +
              esc(x.name) + '</span>'; }).join('') + '</div>'
        : '<div class="tiny faint">' + esc(empty) + '</div>';
    }

    return ui.panel('Zone: ' + z.name, ''
      + ui.text({ path: 'zoneSel.name', label: 'Name', value: z.name })
      + '<div class="grid g2"><div>'
      + ui.number({ path: 'zoneSel.levelLo', label: 'Level from', value: z.levelLo, min: 1, max: 200 })
      + '</div><div>'
      + ui.number({ path: 'zoneSel.levelHi', label: 'Level to', value: z.levelHi, min: 1, max: 200 })
      + '</div></div>'
      + ui.slider({ path: 'zoneSel.size', label: 'Size', value: z.size })
      + ui.slider({ path: 'zoneSel.density', label: 'Content density', value: z.density,
          desc: 'How much is packed into the space. Sparse worlds feel vast and empty in equal measure.' })
      + ui.slider({ path: 'zoneSel.secrets', label: 'Secrets & discovery', value: z.secrets })
      + ui.slider({ path: 'zoneSel.artBudget', label: 'Art budget', value: z.artBudget })
      + '<div class="tiny faint" style="margin:14px 0 6px;letter-spacing:.08em;text-transform:uppercase">Monsters in this zone</div>'
      + chipList(mobs, 'monster.open', 'No monsters here. Nothing to fight and nothing to kill for quests.')
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Questgivers</div>'
      + chipList(npcs, 'giver.open', 'Nobody to talk to.')
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Quests</div>'
      + chipList(quests.slice(0, 24), 'quest.open', 'No quests. Players will grind mobs instead.')
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Dungeons</div>'
      + chipList(dungeons, 'dng.open', 'No dungeons set in this zone.')
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Questlines</div>'
      + chipList(lines, 'line.open', 'No questline groups this zone.')
      + '<div class="row" style="margin-top:14px;gap:6px">'
      + '<button class="sm primary" data-act="zone.populate">Generate content</button>'
      + '<button class="sm" data-act="monster.addTo">Add monster</button>'
      + '<button class="sm" data-act="giver.addTo">Add questgiver</button>'
      + '<button class="sm" data-act="quest.addTo">Add quest</button>'
      + '<button class="sm" data-act="ql.addTo">Add questline</button>'
      + '</div>',
      { actions: '<button class="sm danger" data-act="zone.remove" data-val="' + z.id + '">Delete</button>',
        hint: quests.length + ' quests' });
  }

  /* -------------------------------------------------------- monsters --- */

  function monsterSection() {
    var d = D();
    var current = sel().monsterId ? W.monsterById(d, sel().monsterId) : (d.monsters || [])[0];
    if (current) sel().monsterId = current.id;

    var byZone = {};
    (d.monsters || []).forEach(function (m) {
      (byZone[m.zoneId || 'none'] = byZone[m.zoneId || 'none'] || []).push(m);
    });
    var list = '';
    d.zones.forEach(function (z) {
      if (!byZone[z.id]) return;
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">' +
        esc(z.name) + '</div>' + byZone[z.id].map(row).join('');
    });
    if (byZone.none) {
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">Unplaced</div>' +
        byZone.none.map(row).join('');
    }
    function row(m) {
      var role = W.ROLE_BY_ID[m.role];
      return '<div class="item' + (current && m.id === current.id ? ' on' : '') +
        '" data-act="monster.select" data-val="' + m.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(m.name) + '</div>' +
        '<div class="s">Level ' + m.level + ' &middot; ' + esc(role ? role.name : m.role) +
        ' &middot; ' + esc(W.FAMILY_BY_ID[m.family] ? W.FAMILY_BY_ID[m.family].name : m.family) +
        (m.tameable ? ' &middot; tameable' : '') + '</div></div></div>';
    }
    if (!list) list = ui.empty('No monsters.', 'A world with nothing in it is a walking simulator.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Monsters', list, {
        actions: '<button class="sm" data-act="monster.add">Add monster</button>',
        hint: (d.monsters || []).length + ' total' }) +
      '</div><div>' +
      (current ? monsterEditor(current) : ui.panel('Editor', ui.empty('Select a monster.'))) +
      '</div></div>';
  }

  function monsterEditor(m) {
    var d = D();
    var prof = W.monsterProfile(d, m);
    var threat = W.monsterThreat(d, m);
    var xp = W.monsterXp(d, m);
    var zoneOpts = [{ id: '', name: '(unplaced)' }].concat(d.zones.map(function (z) {
      return { id: z.id, name: z.name + ' (' + z.levelLo + '-' + z.levelHi + ')' }; }));

    /* How long a geared player of this level takes to kill it. */
    var evals = PN.combat.evaluateAll(d);
    var avgDps = evals.list.length ? U.avg(evals.list, function (r) { return r.dps; }) : 0;
    var ttk = avgDps > 0 ? prof.health / avgDps : 0;

    return ui.panel('Monster: ' + m.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'monsterSel.name', label: 'Name', value: m.name })
      + ui.select({ path: 'monsterSel.zoneId', label: 'Zone', value: m.zoneId || '', options: zoneOpts })
      + ui.select({ path: 'monsterSel.family', label: 'Family', value: m.family,
          options: W.MONSTER_FAMILIES })
      + '</div><div>'
      + ui.select({ path: 'monsterSel.role', label: 'Role', value: m.role,
          options: W.MONSTER_ROLES.map(function (r) {
            return { id: r.id, name: r.name, desc: r.xp + 'x experience, ' +
              (r.density * 100) + '% spawn density' }; }) })
      + ui.number({ path: 'monsterSel.level', label: 'Level', value: m.level, min: 1, max: 200 })
      + ui.slider({ path: 'monsterSel.density', label: 'Spawn density', value: m.density })
      + '</div></div>'
      + ui.slider({ path: 'monsterSel.healthMult', label: 'Health', value: m.healthMult,
          min: 10, max: 400, fmt: function (v) { return v + '%'; } })
      + ui.slider({ path: 'monsterSel.damageMult', label: 'Damage', value: m.damageMult,
          min: 10, max: 400, fmt: function (v) { return v + '%'; } })
      + ui.slider({ path: 'monsterSel.armourMult', label: 'Armour', value: m.armourMult,
          min: 0, max: 300, fmt: function (v) { return v + '%'; } })
      + ui.slider({ path: 'monsterSel.xpMult', label: 'Experience', value: m.xpMult,
          min: 10, max: 400, fmt: function (v) { return v + '%'; } })
      + ui.toggle({ path: 'monsterSel.tameable', label: 'Tameable', value: m.tameable,
          desc: 'Turns this monster into roster content. The creature-collection keystone.' })
      + ui.toggle({ path: 'monsterSel.aggressive', label: 'Aggressive', value: m.aggressive })
      + lootPicker(d, 'monsterSel.lootTableId', m.lootTableId, 'Drops')
      + '<div class="grid g3" style="margin-top:12px">'
      + ui.stat('Health', U.fmtCompact(prof.health))
      + ui.stat('Kills in', ttk > 0 ? U.round(ttk, 1) + 's' : '-', 'for an average player')
      + ui.stat('Experience', U.fmtCompact(xp))
      + ui.stat('Threat', Math.round(threat), null, threat > 70 ? 'bad' : '')
      + ui.stat('Loot value', Math.round(IT.lootValue(d, IT.lootById(d, m.lootTableId))))
      + ui.stat('Used by', (d.quests || []).filter(function (q) {
          return (q.objectives || []).some(function (o) { return o.targetId === m.id; });
        }).length + ' quests')
      + '</div>',
      { actions: '<button class="sm ghost" data-act="dup" data-val="monster|' + m.id + '">Duplicate</button> ' +
                 '<button class="sm danger" data-act="monster.remove" data-val="' + m.id + '">Delete</button>' });
  }

  /* ------------------------------------------------------ questgivers -- */

  function giverSection() {
    var d = D();
    var current = sel().giverId ? W.giverById(d, sel().giverId) : (d.questgivers || [])[0];
    if (current) sel().giverId = current.id;

    var list = (d.questgivers || []).map(function (g) {
      var zone = U.byId(d.zones, g.zoneId);
      var qs = W.questsOfGiver(d, g.id).length;
      return '<div class="item' + (current && g.id === current.id ? ' on' : '') +
        '" data-act="giver.select" data-val="' + g.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(g.name) +
          (g.title ? ' <span class="faint">' + esc(g.title) + '</span>' : '') + '</div>' +
        '<div class="s">' + esc(zone ? zone.name : 'unplaced') + ' &middot; ' + qs + ' quests' +
        (g.voiced ? ' &middot; voiced' : '') + '</div></div></div>';
    }).join('') || ui.empty('No questgivers.',
      'Quests handed out by nobody are just a list. A named NPC is what makes a world feel inhabited.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Questgivers', list, {
        actions: '<button class="sm" data-act="giver.add">Add questgiver</button>' }) +
      '</div><div>' +
      (current ? giverEditor(current) : ui.panel('Editor', ui.empty('Select a questgiver.'))) +
      '</div></div>';
  }

  function giverEditor(g) {
    var d = D();
    var quests = W.questsOfGiver(d, g.id);
    var zoneOpts = [{ id: '', name: '(unplaced)' }].concat(d.zones.map(function (z) {
      return { id: z.id, name: z.name }; }));

    return ui.panel('Questgiver: ' + g.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'giverSel.name', label: 'Name', value: g.name })
      + ui.text({ path: 'giverSel.title', label: 'Title', value: g.title,
          desc: 'the Quartermaster, the Scout, the one who never explains anything.' })
      + '</div><div>'
      + ui.select({ path: 'giverSel.zoneId', label: 'Zone', value: g.zoneId || '', options: zoneOpts })
      + ui.select({ path: 'giverSel.personality', label: 'Personality', value: g.personality,
          options: W.GIVER_PERSONALITIES.map(function (p) {
            return { id: p.id, name: p.name, desc: 'Quest enjoyment x' + p.joy }; }) })
      + '</div></div>'
      + ui.text({ path: 'giverSel.flavour', label: 'Flavour', value: g.flavour })
      + '<div class="tiny faint" style="margin:14px 0 6px;letter-spacing:.08em;text-transform:uppercase">Quests offered</div>'
      + (quests.length
          ? '<div class="row wrap" style="gap:4px">' + quests.map(function (q) {
              return '<span class="chip click" data-act="quest.open" data-val="' + q.id + '">' +
                esc(q.name) + '</span>'; }).join('') + '</div>'
          : '<div class="tiny faint">Hands out nothing. Players will walk past.</div>')
      + '<div style="margin-top:12px"><button class="sm" data-act="quest.addForGiver">Add a quest for them</button></div>',
      { actions: '<button class="sm danger" data-act="giver.remove" data-val="' + g.id + '">Delete</button>' });
  }

  /* ---------------------------------------------------------- quests --- */

  function questSection() {
    var d = D();
    var current = sel().questId ? W.questById(d, sel().questId) : (d.quests || [])[0];
    if (current) sel().questId = current.id;

    var filterZone = PN.app.questZone || 'all';
    var quests = (d.quests || []).filter(function (q) {
      return filterZone === 'all' || q.zoneId === filterZone;
    }).sort(function (a, b) { return a.level - b.level; });

    var filters = '<div class="row wrap" style="gap:4px;margin-bottom:10px">' +
      '<span class="chip click' + (filterZone === 'all' ? ' on' : '') +
        '" data-act="quest.filter" data-val="all">All</span>' +
      d.zones.map(function (z) {
        return '<span class="chip click' + (filterZone === z.id ? ' on' : '') +
          '" data-act="quest.filter" data-val="' + z.id + '">' + esc(z.name) + '</span>';
      }).join('') + '</div>';

    var list = quests.slice(0, 120).map(function (q) {
      var issues = W.questIssues(d, q);
      var giver = W.giverById(d, q.giverId);
      return '<div class="item' + (current && q.id === current.id ? ' on' : '') +
        '" data-act="quest.select" data-val="' + q.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(q.name) +
          (issues.length ? ' <span class="chip warn">' + issues.length + '</span>' : '') + '</div>' +
        '<div class="s">Lv ' + q.level + ' &middot; ' + esc(W.questLabel(d, q)) +
        (giver ? ' &middot; ' + esc(giver.name) : ' &middot; no giver') + '</div></div></div>';
    }).join('') || ui.empty('No quests here.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Quests', filters + list, {
        actions: '<button class="sm" data-act="quest.add">Add quest</button>',
        hint: (d.quests || []).length + ' total' }) +
      '</div><div>' +
      (current ? questEditor(current) : ui.panel('Editor', ui.empty('Select a quest.'))) +
      '</div></div>';
  }

  function questEditor(q) {
    var d = D();
    var qm = W.questMetrics(d, q);
    var issues = W.questIssues(d, q);
    var zoneOpts = [{ id: '', name: '(unplaced)' }].concat(d.zones.map(function (z) {
      return { id: z.id, name: z.name }; }));
    var giverOpts = [{ id: '', name: '(nobody)' }].concat((d.questgivers || []).map(function (g) {
      return { id: g.id, name: g.name + (g.title ? ' ' + g.title : '') }; }));
    var lineOpts = [{ id: '', name: '(none)' }].concat((d.questlines || []).map(function (l) {
      return { id: l.id, name: l.name }; }));

    var objectives = (q.objectives || []).map(function (o, i) {
      var def = W.OBJECTIVE_BY_ID[o.kind];
      var targetOpts = [{ id: '', name: '(none)' }];
      if (def && def.needsTarget === 'monster')
        targetOpts = targetOpts.concat((d.monsters || []).map(function (m) {
          return { id: m.id, name: m.name + ' (lv ' + m.level + ')' }; }));
      else if (def && def.needsTarget === 'item')
        targetOpts = targetOpts.concat((d.items || []).map(function (m) {
          return { id: m.id, name: m.name }; }));
      else if (def && def.needsTarget === 'giver')
        targetOpts = targetOpts.concat((d.questgivers || []).map(function (m) {
          return { id: m.id, name: m.name }; }));
      else if (def && def.needsTarget === 'dungeon')
        targetOpts = targetOpts.concat((d.dungeons || []).map(function (m) {
          return { id: m.id, name: m.name }; }));

      return '<div class="objrow">' +
        '<div class="row">' +
        '<select data-act="quest.objKind" data-val="' + i + '" style="width:150px">' +
          W.OBJECTIVE_KINDS.map(function (k) {
            return '<option value="' + k.id + '"' + (k.id === o.kind ? ' selected' : '') + '>' +
              esc(k.name) + '</option>'; }).join('') + '</select>' +
        (def && def.needsTarget
          ? '<select data-act="quest.objTarget" data-val="' + i + '" style="flex:1;min-width:0">' +
            targetOpts.map(function (t) {
              return '<option value="' + t.id + '"' + (t.id === o.targetId ? ' selected' : '') + '>' +
                esc(t.name) + '</option>'; }).join('') + '</select>'
          : '<span class="tiny faint" style="flex:1;min-width:0">no target needed</span>') +
        /* Only repeatable beats take a count. Nobody escorts a man ten times. */
        (def && def.countable
          ? '<span class="tiny faint">&times;</span><input type="number" value="' +
            (o.count || W.DEFAULT_OBJECTIVE_COUNT) + '" min="1" max="999" style="width:64px" ' +
            'data-act="quest.objCount" data-val="' + i + '">'
          : '<span class="tiny faint" title="This objective happens once">once</span>') +
        '<button class="xs ghost" data-act="quest.removeObj" data-val="' + i + '">remove</button>' +
        '</div>' +
        (def && def.desc ? '<div class="tiny faint" style="margin-top:5px">' + esc(def.desc) + '</div>' : '') +
        '</div>';
    }).join('') || ui.empty('No objectives.');

    return ui.panel('Quest: ' + q.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'questSel.name', label: 'Name', value: q.name })
      + ui.select({ path: 'questSel.zoneId', label: 'Zone', value: q.zoneId || '', options: zoneOpts })
      + '</div><div>'
      + ui.select({ path: 'questSel.giverId', label: 'Given by', value: q.giverId || '', options: giverOpts })
      + ui.number({ path: 'questSel.level', label: 'Level', value: q.level, min: 1, max: 200 })
      + ui.select({ path: 'questSel.questlineId', label: 'Questline', value: q.questlineId || '', options: lineOpts })
      + '</div></div>'
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Objectives</div>'
      + objectives
      + '<button class="sm" data-act="quest.addObj" style="margin-bottom:12px">Add objective</button>'
      + rewardPicker(d, 'questSel.rewardId', q.rewardId, 'Reward on completion')
      + '<div class="row" style="margin:-6px 0 12px"><button class="xs" data-act="quest.newReward">Create a reward for this quest</button></div>'
      + ui.select({ path: 'questSel.repeatable', label: 'Repeatable', value: q.repeatable, options: [
          { id: 'none', name: 'One-off' },
          { id: 'daily', name: 'Daily', desc: 'Guaranteed logins, guaranteed long-term resentment.' },
          { id: 'weekly', name: 'Weekly' }] })
      + ui.toggle({ path: 'questSel.voiced', label: 'Voiced', value: q.voiced })
      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin-top:10px">' + issues.map(function (t) {
              return '<span class="chip warn">' + esc(t) + '</span>'; }).join('') + '</div>'
          : '<div class="chip good" style="margin-top:10px">Completable</div>')
      + '<div class="grid g3" style="margin-top:12px">'
      + ui.stat('Content', U.round(qm.hours, 2) + 'h')
      + ui.stat('Enjoyment', Math.round(qm.joy), null, ui.scoreClass(qm.joy))
      + ui.stat('Build cost', U.round(qm.cost.design + qm.cost.art + qm.cost.eng, 1))
      + '</div>',
      { actions: '<button class="sm danger" data-act="quest.remove" data-val="' + q.id + '">Delete</button>' });
  }

  /* --------------------------------------------------- reward chains --- */

  function chainSection() {
    var d = D();
    var current = sel().chainId ? U.byId(d.rewardChains, sel().chainId) : d.rewardChains[0];
    if (current) sel().chainId = current.id;

    var list = d.rewardChains.map(function (ch) {
      var cm = met.rewardChainMetrics(d, ch);
      return '<div class="item' + (current && ch.id === current.id ? ' on' : '') +
        '" data-act="chain.select" data-val="' + ch.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(ch.name) +
          (cm.emptySteps ? ' <span class="chip warn">' + cm.emptySteps + ' empty</span>' : '') + '</div>' +
        '<div class="s">' + cm.steps + ' stages &middot; ' + cm.shape + ' &middot; pull ' +
        Math.round(cm.pull) + '</div></div></div>';
    }).join('') || ui.empty('No reward chains.',
      'A reward chain is a multi-week payoff structure. It is the deepest retention tool you can author.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Reward chains', list, {
        actions: '<button class="sm" data-act="chain.add">Add chain</button>' }) +
      '</div><div>' +
      (current ? chainEditor(current) : ui.panel('Editor', ui.empty('Select a reward chain.'))) +
      '</div></div>';
  }

  function chainEditor(ch) {
    var d = D(), cm = met.rewardChainMetrics(d, ch);
    var rewardOpts = [{ id: '', name: '(nothing)' }].concat((d.rewards || []).map(function (r) {
      return { id: r.id, name: r.name + '  (' + Math.round(IT.rewardValue(d, r)) + ')' }; }));

    var steps = (ch.steps || []).map(function (s, i) {
      var r = IT.rewardById(d, s.rewardId);
      return '<div style="background:var(--panel-2);border-radius:7px;padding:10px 12px;margin-bottom:7px">' +
        '<div class="row" style="margin-bottom:8px">' +
        '<input type="text" value="' + esc(s.label) + '" data-act="chain.label" data-val="' + i + '" style="flex:1">' +
        '<button class="xs ghost" data-act="chain.removeStep" data-val="' + i + '">remove</button></div>' +
        '<div class="row small" style="margin-bottom:6px">' +
        '<span class="faint tiny" style="width:64px">Unlocked by</span>' +
        '<select data-act="chain.req" data-val="' + i + '" style="flex:1">' +
          S.CHAIN_REQUIREMENTS.map(function (rq) {
            return '<option value="' + rq.id + '"' + (rq.id === s.requirement ? ' selected' : '') + '>' +
              esc(rq.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="row small" style="margin-bottom:6px">' +
        '<span class="faint tiny" style="width:64px">Hands over</span>' +
        '<select data-act="chain.reward" data-val="' + i + '" style="flex:1">' +
          rewardOpts.map(function (o) {
            return '<option value="' + o.id + '"' + (o.id === (s.rewardId || '') ? ' selected' : '') + '>' +
              esc(o.name) + '</option>'; }).join('') + '</select></div>' +
        ui.rangeAct({ label: 'Gate', act: 'chain.gate', val: i,
                      value: s.gateWeeks, min: 0, max: 12, suffix: 'w', cls: 'narrow' }) +
        (r ? '' : '<div class="chip warn" style="margin-top:6px">This stage hands over nothing</div>') +
        '</div>';
    }).join('');

    var shapeNote = {
      'front-loaded': 'Hooks people immediately and loses them once the good part is behind them.',
      'steady': 'Reliable week-to-week pull. The safe shape.',
      'back-loaded': 'Pulls hardest of all - and sheds everyone who does not believe they will finish.'
    }[cm.shape] || '';

    return ui.panel('Reward chain: ' + ch.name, ''
      + ui.text({ path: 'chainSel.name', label: 'Name', value: ch.name })
      + steps
      + '<div class="row" style="margin-bottom:14px;gap:6px">'
      + '<button class="sm" data-act="chain.addStep">Add stage</button>'
      + '<button class="sm" data-act="chain.autoRewards">Create rewards for empty stages</button></div>'
      + ui.toggle({ path: 'chainSel.pityTimer', label: 'Pity timer', value: ch.pityTimer,
          desc: 'Guarantees the reward eventually. Removes the worst outcome, which is the one people post about.' })
      + ui.toggle({ path: 'chainSel.accountWide', label: 'Account-wide', value: ch.accountWide })
      + ui.toggle({ path: 'chainSel.expires', label: 'Expires at season end', value: ch.expires,
          desc: 'Manufactures urgency. Also manufactures resentment.' })
      + ui.slider({ path: 'chainSel.catchUp', label: 'Catch-up', value: ch.catchUp })
      + '<div class="grid g4" style="margin-top:12px">'
      + ui.stat('Shape', cm.shape)
      + ui.stat('Pull', Math.round(cm.pull), null, ui.scoreClass(cm.pull))
      + ui.stat('Length', cm.totalWeeks + 'w')
      + ui.stat('Frustration', Math.round(cm.frustration), null, cm.frustration > 45 ? 'bad' : '')
      + '</div>'
      + '<div class="tiny faint" style="margin-top:10px;line-height:1.5">' + esc(shapeNote) + '</div>',
      { actions: '<button class="sm danger" data-act="chain.remove" data-val="' + ch.id + '">Delete</button>' });
  }

  /* ================================================================ PvE */

  function pveTab() {
    var d = D();
    var current = sel().dungeonId ? U.byId(d.dungeons, sel().dungeonId) : d.dungeons[0];
    if (current) sel().dungeonId = current.id;

    var byZone = {};
    d.dungeons.forEach(function (dg) {
      (byZone[dg.zoneId || 'none'] = byZone[dg.zoneId || 'none'] || []).push(dg);
    });
    function row(dg) {
      var dm = met.dungeonMetrics(d, dg);
      return '<div class="item' + (current && dg.id === current.id ? ' on' : '') +
        '" data-act="dng.select" data-val="' + dg.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(dg.name) +
          ' <span class="chip">' + esc(dg.kind) + '</span>' +
          (dm.bossCount === 0 ? ' <span class="chip bad">no bosses</span>' : '') + '</div>' +
        '<div class="s">' + dg.groupSize + '-player &middot; ' + dm.bossCount + ' bosses &middot; lv ' +
        dg.levelReq + ' &middot; ' + U.round(dm.totalHours, 0) + 'h</div></div></div>';
    }
    var list = '';
    d.zones.forEach(function (z) {
      if (!byZone[z.id]) return;
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">' +
        esc(z.name) + '</div>' + byZone[z.id].map(row).join('');
    });
    if (byZone.none) {
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">' +
        'Not in any zone</div>' + byZone.none.map(row).join('');
    }
    if (!list) list = ui.empty('No dungeons or raids.');

    var bossList = (d.bosses || []).map(function (b) {
      var bm = met.bossMetrics(d, b);
      var dg = U.byId(d.dungeons, b.dungeonId);
      return '<div class="item' + (sel().bossId === b.id ? ' on' : '') +
        '" data-act="boss.select" data-val="' + b.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(b.name) +
          (!dg ? ' <span class="chip bad">unreachable</span>' : '') + '</div>' +
        '<div class="s">' + esc(dg ? dg.name : 'no dungeon') + ' &middot; ' + bm.phases +
        ' phases &middot; difficulty ' + Math.round(bm.difficulty) +
        (bm.dummy ? ' &middot; <span class="bad">no mechanics</span>' : '') + '</div></div></div>';
    }).join('') || ui.empty('No bosses.');

    var editor = sel().bossId && U.byId(d.bosses, sel().bossId)
      ? bossEditor(U.byId(d.bosses, sel().bossId))
      : current ? dungeonEditor(current)
      : ui.panel('Editor', ui.empty('Select a dungeon or a boss.'));

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Dungeons & raids', list, {
        actions: '<button class="sm" data-act="dng.add">Add</button>' }) +
      ui.panel('Bosses', bossList, {
        actions: '<button class="sm" data-act="boss.add">Add boss</button>' }) +
      '</div><div>' + editor + '</div></div>';
  }

  function dungeonEditor(dg) {
    var d = D(), dm = met.dungeonMetrics(d, dg);
    var bosses = S.bossesIn(d, dg);
    var zoneOpts = [{ id: '', name: '(not in a zone)' }].concat(d.zones.map(function (z) {
      return { id: z.id, name: z.name + ' (' + z.levelLo + '-' + z.levelHi + ')' }; }));

    var tierChips = S.DIFFICULTY_TIERS.map(function (t) {
      var on = (dg.tiers || []).indexOf(t.id) >= 0;
      return '<span class="chip click' + (on ? ' on' : '') + '" data-act="dng.tier" data-val="' + t.id + '">' +
        esc(t.name) + '</span>';
    }).join('');

    var bossChips = bosses.length
      ? '<div class="row wrap" style="gap:4px">' + bosses.map(function (b) {
          return '<span class="chip click on" data-act="boss.select" data-val="' + b.id + '">' +
            esc(b.name) + '</span>'; }).join('') + '</div>'
      : '<div class="tiny faint">No bosses. This is a corridor.</div>';

    return ui.panel('Dungeon: ' + dg.name, ''
      + ui.text({ path: 'dngSel.name', label: 'Name', value: dg.name })
      + '<div class="grid g2"><div>'
      + ui.select({ path: 'dngSel.kind', label: 'Type', value: dg.kind,
          options: [{ id: 'dungeon', name: 'Dungeon' }, { id: 'raid', name: 'Raid' }] })
      + ui.select({ path: 'dngSel.zoneId', label: 'Zone', value: dg.zoneId || '', options: zoneOpts })
      + ui.number({ path: 'dngSel.groupSize', label: 'Group size', value: dg.groupSize, min: 1, max: 40 })
      + '</div><div>'
      + ui.number({ path: 'dngSel.levelReq', label: 'Level requirement', value: dg.levelReq, min: 1, max: 200 })
      + ui.number({ path: 'dngSel.lengthMin', label: 'Length (minutes)', value: dg.lengthMin, min: 5, max: 300, step: 5 })
      + ui.select({ path: 'dngSel.lockout', label: 'Lockout', value: dg.lockout, options: [
          { id: 'none', name: 'None', desc: 'Spam it forever. Burns out fast.' },
          { id: 'daily', name: 'Daily' },
          { id: 'weekly', name: 'Weekly', desc: 'Paces consumption and creates a weekly ritual.' }] })
      + '</div></div>'
      + '<div class="tiny faint" style="margin:6px 0 6px;letter-spacing:.08em;text-transform:uppercase">Difficulty tiers</div>'
      + '<div class="row wrap" style="gap:5px;margin-bottom:12px">' + tierChips + '</div>'
      + '<div class="tiny faint" style="margin:6px 0 6px;letter-spacing:.08em;text-transform:uppercase">Bosses</div>'
      + bossChips
      + '<div style="margin:8px 0 12px"><button class="sm" data-act="boss.addTo">Add a boss to this dungeon</button></div>'
      + lootPicker(d, 'dngSel.trashLootTableId', dg.trashLootTableId, 'Trash drops')
      + rewardPicker(d, 'dngSel.completionRewardId', dg.completionRewardId, 'Completion reward')
      + ui.toggle({ path: 'dngSel.scaling', label: 'Infinite difficulty scaling', value: dg.scaling,
          desc: 'Keystone-style. The best content-hours-per-pound in the entire genre.' })
      + ui.toggle({ path: 'dngSel.affixes', label: 'Rotating affixes', value: dg.affixes })
      + ui.toggle({ path: 'dngSel.matchmaking', label: 'Automatic matchmaking', value: dg.matchmaking })
      + '<div class="grid g4" style="margin-top:12px">'
      + ui.stat('Content', U.round(dm.totalHours, 0) + 'h')
      + ui.stat('Replay', U.round(dm.replayFactor, 1) + '×')
      + ui.stat('Loot per run', Math.round(dm.lootPerRun), null,
          dm.lootPerRun < 20 ? 'warn' : 'good')
      + ui.stat('Difficulty', Math.round(dm.difficulty || 0))
      + '</div>'
      + (dm.orphaned ? '<div class="chip warn" style="margin-top:10px">Not attached to a zone - players will not find it naturally</div>' : ''),
      { actions: '<button class="sm danger" data-act="dng.remove" data-val="' + dg.id + '">Delete</button>' });
  }

  function bossEditor(b) {
    var d = D(), bm = met.bossMetrics(d, b);
    var dgOpts = [{ id: '', name: '(unreachable)' }].concat(d.dungeons.map(function (x) {
      return { id: x.id, name: x.name }; }));
    var dungeon = U.byId(d.dungeons, b.dungeonId);

    var phases = (b.phases || []).map(function (p, i) {
      var chips = PN.prim.BOSS_MECHANICS.map(function (mch) {
        var on = (p.mechanics || []).indexOf(mch.id) >= 0;
        return '<span class="chip click' + (on ? ' on' : '') + '" data-act="boss.mech" data-val="' +
          i + '|' + mch.id + '" data-tip="mech:' + mch.id + '">' + esc(mch.name) + '</span>';
      }).join('');
      return '<div style="background:var(--panel-2);border-radius:8px;padding:11px 13px;margin-bottom:9px">' +
        '<div class="row" style="margin-bottom:9px">' +
        '<input type="text" value="' + esc(p.name) + '" data-act="boss.phaseName" data-val="' + i + '" style="flex:1">' +
        '<select data-act="boss.trigger" data-val="' + i + '" style="width:118px">' +
          ['hp', 'timer', 'adds', 'action'].map(function (t) {
            return '<option value="' + t + '"' + (t === p.trigger ? ' selected' : '') + '>' +
              (t === 'hp' ? 'At HP %' : t === 'timer' ? 'On timer' : t === 'adds' ? 'Adds dead' : 'Player action') +
              '</option>'; }).join('') + '</select>' +
        '<input type="number" value="' + p.at + '" min="0" max="100" style="width:62px" data-act="boss.at" data-val="' + i + '">' +
        '<button class="xs ghost" data-act="boss.removePhase" data-val="' + i + '">remove</button></div>' +
        ui.rangeAct({ label: 'Damage', act: 'boss.damage', val: i,
                      value: p.damage, min: 0, max: 100, cls: 'narrow' }) +
        '<div class="row wrap" style="gap:4px">' + chips + '</div></div>';
    }).join('');

    var tiers = dungeon ? (dungeon.tiers || ['normal']) : ['normal', 'heroic'];
    var clearTable = '<table class="data"><tr><th>Difficulty</th>' +
      PN.tax.SKILL_BANDS.map(function (s) { return '<th class="num">' + esc(s.name) + '</th>'; }).join('') +
      '</tr>' + tiers.map(function (tid) {
        var t = S.tierById(tid);
        return '<tr><td>' + esc(t.name) + '</td>' + PN.tax.SKILL_BANDS.map(function (band) {
          var coordination = band.skill * 0.85 + 0.1;
          var gear = 0.35 + band.skill * 0.5;
          var ch = met.clearChance(bm, t.mult, band.skill, gear, coordination);
          var cls = ch > 0.6 ? 'good' : ch > 0.22 ? 'warn' : 'bad';
          return '<td class="num ' + cls + '">' + U.fmtPct(ch * 100, 0) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</table>';

    var metricsGrid = [
      ['Difficulty', bm.difficulty], ['Coordination', bm.coordination],
      ['Execution', bm.execution], ['Gear check', bm.gearCheck],
      ['Learn time', bm.learnTime], ['Spectacle', bm.spectacle],
      ['Frustration', bm.frustration]
    ].map(function (r) {
      var bad = r[0] === 'Frustration';
      return '<div class="axisrow" style="grid-template-columns:minmax(0,94px) minmax(0,1fr) 38px">' +
        '<div class="nm">' + r[0] + '</div>' +
        '<div class="track"><i style="width:' + U.clamp(r[1], 0, 100).toFixed(1) + '%;background:' +
          (bad ? (r[1] > 45 ? 'var(--bad)' : 'var(--warn)') : 'var(--accent)') + '"></i></div>' +
        '<div class="num">' + Math.round(r[1]) + '</div></div>';
    }).join('');

    var warnings = '';
    if (!dungeon) warnings += '<div class="chip bad">Not in a dungeon - players can never reach it</div> ';
    if (bm.dummy) warnings += '<div class="chip bad">No mechanics - a training dummy with a health bar</div> ';
    if (!b.lootTableId) warnings += '<div class="chip warn">Drops nothing</div> ';
    if (bm.frustration > 55) warnings += '<div class="chip bad">Frustrating enough to end guilds</div> ';
    if (bm.mechanicVariety < 0.55 && bm.mechCount > 3) warnings += '<div class="chip warn">Repeats the same mechanics</div> ';

    return ui.panel('Boss: ' + b.name, ''
      + ui.text({ path: 'bossSel.name', label: 'Name', value: b.name })
      + ui.select({ path: 'bossSel.dungeonId', label: 'In dungeon', value: b.dungeonId || '', options: dgOpts })
      + '<div class="grid g2"><div>'
      + ui.slider({ path: 'bossSel.enrage', label: 'Enrage timer', value: b.enrage, min: 120, max: 900, step: 15,
          fmt: function (v) { return Math.floor(v / 60) + 'm ' + (v % 60) + 's'; } })
      + '</div><div>'
      + ui.slider({ path: 'bossSel.spectacleArt', label: 'Art & spectacle budget', value: b.spectacleArt })
      + '</div></div>'
      + ui.slider({ path: 'bossSel.tuning', label: 'Tuning', value: b.tuning || 0, min: -25, max: 25,
          fmt: function (v) { return U.fmtSigned(v, 0); } })
      + ui.slider({ path: 'bossSel.healthMult', label: 'Health', value: b.healthMult, min: 25, max: 300,
          fmt: function (v) { return v + '%'; } })
      + lootPicker(d, 'bossSel.lootTableId', b.lootTableId, 'Drops')
      + rewardPicker(d, 'bossSel.firstKillRewardId', b.firstKillRewardId, 'First-kill reward')
      + '<div class="tiny faint" style="margin:14px 0 8px;letter-spacing:.08em;text-transform:uppercase">Phases</div>'
      + phases
      + '<button class="sm" data-act="boss.addPhase">Add phase</button>'
      + (warnings ? '<div class="row wrap" style="gap:5px;margin-top:12px">' + warnings + '</div>' : '')
      + '<div class="grid g2" style="margin-top:14px"><div>' + metricsGrid + '</div><div>'
      + '<div class="tiny faint" style="margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase">Projected weekly clear rate</div>'
      + clearTable
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.5">If your elite players clear it week one, raiders leave. '
      + 'If nobody clears it, everyone leaves. The gap between those is the whole job.</div>'
      + '</div></div>',
      { actions: '<button class="sm danger" data-act="boss.remove" data-val="' + b.id + '">Delete</button>' });
  }

  /* ================================================================ PvP */

  function pvpTab() {
    var d = D();
    var lad = PN.pvp.ladder(d);
    var sm = PN.pvp.seasonMetrics(d);
    var current = sel().mapId ? PN.pvp.mapById(d, sel().mapId) : (d.pvpMaps || [])[0];
    if (current) sel().mapId = current.id;

    if (!d.pvp.enabled) {
      return ui.panel('Competitive PvP',
        ui.toggle({ path: 'design.pvp.enabled', label: 'Enable PvP', value: false,
          desc: 'A whole second game to build and balance forever. Skip it and the competitor archetype never arrives.' }));
    }

    var mapList = (d.pvpMaps || []).map(function (m) {
      var mode = PN.pvp.MODE_BY_ID[m.mode];
      return '<div class="item' + (current && m.id === current.id ? ' on' : '') +
        '" data-act="map.select" data-val="' + m.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(m.name) + '</div>' +
        '<div class="s">' + esc(mode ? mode.name : m.mode) + ' &middot; ' + m.teamSize + 'v' + m.teamSize +
        ' &middot; ' + m.matchMinutes + ' min</div></div></div>';
    }).join('') || ui.empty('No maps.', 'There is nothing to queue for.');

    var ladderTable = lad.empty
      ? ui.empty('Author classes and maps to see the ladder.')
      : '<table class="data"><tr><th>' + (PN.talents.isTalentMode(d) ? 'Build' : 'Class') + '</th><th class="num">Overall</th>' +
        '<th>Best map</th><th>Worst map</th><th class="num">Top share</th></tr>' +
        lad.rows.map(function (r) {
          return '<tr class="click" data-act="cls.openFromPvp" data-val="' + r.cls.id + '">' +
            '<td>' + esc(r.cls.name) + '</td>' +
            '<td class="num ' + ui.scoreClass(r.overall) + '">' + Math.round(r.overall) + '</td>' +
            '<td class="small muted">' + esc(r.best.map.name) + '</td>' +
            '<td class="small muted">' + esc(r.worst.map.name) + '</td>' +
            '<td class="num ' + (r.topShare > 2.2 / Math.max(1, lad.rows.length) ? 'bad' : '') + '">' +
              U.fmtPct(r.topShare * 100, 0) + '</td></tr>';
        }).join('') + '</table>' +
        '<div class="tiny faint" style="margin-top:9px;line-height:1.5">Top share is who you will actually ' +
        'meet at high rating. When one class owns the bracket, the competitors leave - and they are the ' +
        'loudest audience you have.</div>';

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Arena maps', mapList, {
        actions: '<button class="sm" data-act="map.add">Add map</button>' }) +
      ui.panel('The ladder', ladderTable, {
        hint: lad.empty ? '' : 'balance ' + Math.round(lad.quality) + '/100' }) +
      '</div><div>' +
      (current ? mapEditor(current, lad) : '') +
      ui.panel('Season',
        ui.slider({ path: 'design.pvp.seasonWeeks', label: 'Season length', value: d.pvp.seasonWeeks,
          min: 4, max: 26, fmt: function (v) { return v + ' weeks'; } }) +
        ui.number({ path: 'design.pvp.arenaBracket', label: 'Ranked team size', value: d.pvp.arenaBracket, min: 1, max: 10 }) +
        ui.number({ path: 'design.pvp.ratingFloor', label: 'Starting rating', value: d.pvp.ratingFloor,
          min: 0, max: 3000, step: 50,
          desc: 'Where everybody sits on the leaderboard the day a season opens.' }) +
        ui.slider({ path: 'design.pvp.gearPower', label: 'How much gear decides a match',
          value: d.pvp.gearPower,
          desc: 'Above about 45 the ladder stops being a test of skill and competitors say so, loudly.' }) +
        ui.toggle({ path: 'design.pvp.ccDiminishing', label: 'Diminishing returns on control',
          value: d.pvp.ccDiminishing,
          desc: 'Without it, chain crowd control means one player never gets to act.' }) +
        ui.toggle({ path: 'design.pvp.soloQueue', label: 'Solo queue', value: d.pvp.soloQueue }) +
        ui.toggle({ path: 'design.pvp.titleRewards', label: 'Titles and rank rewards', value: d.pvp.titleRewards }) +
        rewardPicker(d, 'design.pvp.seasonRewardId', d.pvp.seasonRewardId, 'End-of-season reward') +
        lootPicker(d, 'design.pvp.matchLootId', d.pvp.matchLootId, 'Per-match loot table') +
        '<div class="tiny faint" style="margin:-6px 0 10px;line-height:1.5">A season ' +
        'is a promise you keep on a date, so it pays a bundle. A match happens hundreds ' +
        'of times, so it rolls a table - what makes that fair is a chance rather than a ' +
        'guarantee.</div>' +
        '<div class="grid g3" style="margin-top:10px">' +
        ui.stat('Season content', U.round(sm.hours, 0) + 'h') +
        ui.stat('Pull', Math.round(sm.pull), null, ui.scoreClass(sm.pull)) +
        ui.stat('Modes', sm.modes) +
        '</div>' +
        '<div class="tiny faint" style="margin-top:9px">' + esc(sm.note) + '</div>') +
      '</div></div>';
  }

  function mapEditor(m, lad) {
    var d = D();
    var mode = PN.pvp.MODE_BY_ID[m.mode];
    var affinities = lad && !lad.empty ? lad.rows.map(function (r) {
      var per = null;
      r.per.forEach(function (p) { if (p.map.id === m.id) per = p; });
      return { name: r.cls.name, value: per ? per.affinity : 0 };
    }).sort(function (a, b) { return b.value - a.value; }) : [];

    /* What the sliders add up to, and how close this map is to the
       nearest other one you built. */
    var dem = PN.pvp.mapDemands(m);
    var DEMAND_ORDER = [['burst','Burst'], ['sustain','Sustain'],
      ['control','Control'], ['mobility','Mobility'], ['ranged','Ranged'],
      ['melee','Melee'], ['aoe','Area damage'],
      ['survivability','Survivability'], ['teamPlay','Team play']];
    var demandBars = DEMAND_ORDER.map(function (k) {
      return { name: k[1], value: dem[k[0]] || 0,
               color: (dem[k[0]] || 0) >= 1.25 ? '#5fd6a0'
                    : (dem[k[0]] || 0) <= 0.75 ? '#ff7565' : '#5fb3ff' };
    });
    /* How alike two maps are: the demands are the map. */
    var sibling = null, sameness = 0;
    (d.pvpMaps || []).forEach(function (other) {
      if (other.id === m.id) return;
      var od = PN.pvp.mapDemands(other);
      var diff = 0, n = 0;
      DEMAND_ORDER.forEach(function (k) {
        diff += Math.abs((dem[k[0]] || 0) - (od[k[0]] || 0)); n++;
      });
      var like = U.clamp01(1 - (diff / Math.max(1, n)) / 0.8);
      if (like > sameness) { sameness = like; sibling = other; }
    });

    return ui.panel('Map: ' + m.name, ''
      + ui.text({ path: 'mapSel.name', label: 'Name', value: m.name })
      + ui.select({ path: 'mapSel.mode', label: 'Objective mode', value: m.mode,
          options: PN.pvp.MODES })
      + '<div class="grid g2"><div>'
      + ui.number({ path: 'mapSel.teamSize', label: 'Team size', value: m.teamSize, min: 1, max: 20 })
      + ui.number({ path: 'mapSel.matchMinutes', label: 'Match length', value: m.matchMinutes, min: 2, max: 60 })
      + '</div><div>'
      + ui.number({ path: 'mapSel.respawnSeconds', label: 'Respawn (s)', value: m.respawnSeconds, min: 0, max: 120, step: 5 })
      + ui.slider({ path: 'mapSel.healingDampen', label: 'Healing dampening', value: m.healingDampen })
      + '</div></div>'
      + ui.slider({ path: 'mapSel.size', label: 'Size', value: m.size,
          fmt: function (v) { return v < 30 ? 'Tight arena' : v < 60 ? 'Mid' : 'Sprawling'; },
          desc: 'Big maps favour ranged damage and mobility. Small ones favour melee and burst.' })
      + ui.slider({ path: 'mapSel.chokepoints', label: 'Chokepoints', value: m.chokepoints,
          desc: 'Corridors reward area damage and crowd control.' })
      + ui.slider({ path: 'mapSel.lineOfSight', label: 'Line-of-sight cover', value: m.lineOfSight,
          desc: 'Pillars let melee close the gap and let casters be kited.' })
      + ui.slider({ path: 'mapSel.verticality', label: 'Verticality',
          value: m.verticality,
          desc: 'Levels, ledges and drops. Rewards mobility - a kit that can reposition uses a vertical map and a kit that cannot is stuck on one floor of it.' })
      + ui.slider({ path: 'mapSel.hazards', label: 'Environmental hazards',
          value: m.hazards,
          desc: 'Lava, spikes, the pit in the middle. Rewards survivability, because the map is doing some of the killing.' })
      + '<div class="tiny faint" style="margin:10px 0 6px;line-height:1.5">' +
        esc(mode ? mode.desc : '') + '</div>'

      /* What the sliders above actually ASK FOR.

         Every slider feeds one or more demands, and a build is scored
         against those demands - but none of that was visible, so two
         maps set a few points apart looked different and played
         identically, and there was no way to tell why. */
      + '<div class="subhead spaced">What this map asks for</div>'
      + PN.chart.bars(demandBars, { labelW: 104, max: 2,
          fmt: function (v) { return U.round(v, 2) + '×'; } })
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.6">'
      + '<b style="color:var(--text)">Size</b> trades melee for ranged and asks for mobility. '
      + '<b style="color:var(--text)">Line-of-sight cover</b> trades it back - pillars let melee '
      + 'close and let casters be kited. '
      + '<b style="color:var(--text)">Chokepoints</b> raise control and area damage. '
      + '<b style="color:var(--text)">Verticality</b> raises mobility. '
      + '<b style="color:var(--text)">Hazards</b> raise survivability. '
      + '<b style="color:var(--text)">Healing dampening</b> cuts sustain. '
      + 'The mode sets the baseline for all of them.</div>'
      + (sibling
          ? '<div class="chip ' + (sameness > 0.86 ? 'warn' : '') + '" style="margin-top:10px">'
            + 'Closest to ' + esc(sibling.name) + ': ' + Math.round(sameness * 100) + '% the same'
            + (sameness > 0.86 ? ' - these two will play alike' : '') + '</div>'
          : '')

      + (affinities.length
          ? '<div class="subhead spaced">Who suits it</div>' +
            PN.chart.bars(affinities, { labelW: 92, max: 100, fmt: function (v) { return Math.round(v); } })
          : ''),
      { actions: '<button class="sm danger" data-act="map.remove" data-val="' + m.id + '">Delete</button>' });
  }

  PN.viewsWorld = {
    worldTab: worldTab, pveTab: pveTab, pvpTab: pvpTab,
    rewardPicker: rewardPicker, lootPicker: lootPicker
  };
})(PN);
