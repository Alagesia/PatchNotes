/* Patch Notes - combat, ability and item authoring views.
   The three tabs where the player writes the actual game.               */
(function (PN) {
  'use strict';
  var U = PN.util, ui = PN.ui, esc = PN.chart.esc,
      AB = PN.abilities, ST = PN.stats, IT = PN.items, CB = PN.combat;

  function D() { return PN.game.state.design; }
  function sel() { return PN.app.sel; }

  /* ============================================================= COMBAT */

  function combatTab() {
    var d = D(), s = ST.statSetOf(d);
    var cm = CB.derivedCombatMath(d);

    /* --- derived readouts: these used to be sliders ----------------- */
    var readouts = cm.empty
      ? ui.empty('No classes with abilities yet.',
          'Time-to-kill is computed from the abilities you write. Author a class and it will appear here.')
      : '<div class="grid g3" style="margin-bottom:12px">' +
        ui.stat('Time to kill (elite)', U.round(cm.ttkPve, 1) + 's',
          cm.ttkPve < 8 ? 'Very fast' : cm.ttkPve < 25 ? 'Comfortable' : 'Slow and grindy',
          cm.ttkPve < 6 || cm.ttkPve > 40 ? 'warn' : 'good') +
        ui.stat('Time to kill (player)', U.round(cm.ttkPvp, 1) + 's',
          cm.ttkPvp < 6 ? 'Global-cooldown deaths' : cm.ttkPvp < 25 ? 'Readable' : 'Attrition',
          cm.ttkPvp < 5 || cm.ttkPvp > 35 ? 'warn' : 'good') +
        ui.stat('Raid clear', U.round(cm.raidClearSeconds / 60, 1) + ' min',
          cm.raidSize + '-player boss',
          cm.raidClearSeconds < 90 || cm.raidClearSeconds > 900 ? 'warn' : 'good') +
        ui.stat('Average DPS', U.fmtCompact(cm.avgDps), 'per damage dealer') +
        ui.stat('Group DPS', U.fmtCompact(cm.groupDps), cm.raidSize + '-player raid') +
        ui.stat('Boss health', U.fmtCompact(cm.raidBossHealth)) +
        '</div>' +
        '<div class="tiny faint" style="line-height:1.6">These are <b>outputs</b>. Change an ability\'s damage, ' +
        'cooldown or cost, or change the gear budget, and every number here moves. Monster health is pinned to a ' +
        'baseline power curve, so a stronger kit really does kill things faster.</div>';

    /* --- stat set editor -------------------------------------------- */
    var primaries = s.primaries.map(function (pr, i) {
      return '<div class="item" style="cursor:default">' +
        '<input type="text" value="' + esc(pr.name) + '" data-act="stat.primaryName" data-val="' + i +
          '" style="flex:1">' +
        '<select data-act="stat.primaryPower" data-val="' + i + '" style="width:130px">' +
          ST.POWER_KINDS.map(function (k) {
            return '<option value="' + k.id + '"' + (k.id === pr.powers ? ' selected' : '') + '>' +
              esc(k.name) + '</option>'; }).join('') + '</select>' +
        '<button class="xs ghost" data-act="stat.removePrimary" data-val="' + i + '">remove</button></div>';
    }).join('');

    var secondaries = s.secondaries.map(function (x, i) {
      var kind = ST.SECONDARY_BY_KIND[x.kind];
      return '<div style="background:var(--panel-2);border-radius:7px;padding:10px 12px;margin-bottom:7px">' +
        '<div class="row">' +
        '<input type="text" value="' + esc(x.name) + '" data-act="stat.secName" data-val="' + i + '" style="flex:1">' +
        '<select data-act="stat.secKind" data-val="' + i + '" style="width:140px">' +
          ST.SECONDARY_KINDS.map(function (k) {
            return '<option value="' + k.id + '"' + (k.id === x.kind ? ' selected' : '') + '>' +
              esc(k.name) + '</option>'; }).join('') + '</select>' +
        '<button class="xs ghost" data-act="stat.removeSec" data-val="' + i + '">remove</button></div>' +
        '<div class="tiny faint" style="margin-top:5px">' + esc(kind ? kind.desc : '') + '</div>' +
        ui.rangeAct({ label: 'Rating per 1%', act: 'stat.secRating', val: i,
                      value: x.ratingPerPct, min: 4, max: 120, cls: 'narrow' }) +
        ui.rangeAct({ label: 'Soft cap %', act: 'stat.secCap', val: i,
                      value: x.cap, min: 10, max: 100, cls: 'narrow' }) +
        '</div>';
    }).join('');

    var sample = CB.characterProfile(d, d.classes[0] || null);
    var charPanel = ui.panel('Reference character',
      '<div class="grid g3" style="margin-bottom:10px">' +
      ui.stat('Level', sample.level) +
      ui.stat('Item level', sample.itemLevel, sample.authoredSlots + ' of 16 slots authored') +
      ui.stat('Health', U.fmtCompact(sample.health)) +
      ui.stat('Power', U.fmtCompact(sample.attackPower)) +
      ui.stat('Crit', U.fmtPct(sample.crit * 100, 1)) +
      ui.stat('Haste', U.fmtPct(sample.haste * 100, 1)) +
      '</div>' +
      '<div class="tiny faint" style="line-height:1.5">What a geared player looks like at your level cap. ' +
      'Authoring real gear in the Items tab replaces the synthetic placeholders slot by slot.</div>');

    return '<div class="grid g-2-1"><div>' +
      ui.panel('Derived combat maths', readouts, { hint: 'computed, not set' }) +
      ui.panel('Primary stats', primaries || ui.empty('No primaries.'), {
        actions: '<button class="sm" data-act="stat.addPrimary">Add primary</button>',
        hint: 'drive attack and spell power' }) +
      ui.panel('Secondary stats', secondaries || ui.empty('No secondaries.'), {
        actions: '<button class="sm" data-act="stat.addSec">Add secondary</button>' }) +
      '</div><div>' +
      ui.panel('Global dials',
        ui.slider({ path: 'design.combatMath.gcd', label: 'Global cooldown', value: d.combatMath.gcd,
          min: 0.2, max: 3, step: 0.1, fmt: function (v) { return U.round(v, 1) + 's'; },
          desc: 'The minimum time between any two casts, even when everything is off cooldown. The one genuine global dial in combat.' }) +
        ui.select({ path: 'design.combatMath.resourceModel', label: 'Resource model',
          value: d.combatMath.resourceModel, options: [
            { id: 'mana', name: 'Mana', desc: 'A pool that runs out. Rewards efficiency.' },
            { id: 'rage', name: 'Rage', desc: 'Built in combat. Slow starts, explosive finishes.' },
            { id: 'energy', name: 'Energy', desc: 'Fast regen, low ceiling. Steady pacing.' },
            { id: 'combo', name: 'Builder / Spender', desc: 'Two resources. The deepest rotations live here.' },
            { id: 'cooldown', name: 'Cooldowns only', desc: 'No resource at all. Simple and very readable.' }] }) +
        ui.toggle({ path: 'design.combatMath.diminishingReturns', label: 'Diminishing returns on control',
          value: d.combatMath.diminishingReturns,
          desc: 'Repeated stuns last less. Without this, chain crowd control decides every PvP match.' }) +
        ui.slider({ path: 'design.stats.critBonus', label: 'Critical strike damage',
          value: s.critBonus, min: 25, max: 300, step: 5,
          fmt: function (v) { return '+' + v + '%'; },
          desc: 'Above about 140% outcomes start reading as luck rather than skill.' }) +
        ui.slider({ path: 'design.stats.healthPerLevel', label: 'Health per level',
          value: s.healthPerLevel, min: 2, max: 80 }) +
        ui.slider({ path: 'design.stats.powerPerLevel', label: 'Power per level',
          value: s.powerPerLevel, min: 0.5, max: 20, step: 0.1 })) +
      ui.panel('Gear budget curve',
        ui.slider({ path: 'design.stats.budgetExponent', label: 'Budget exponent',
          value: s.budgetExponent, min: 1.0, max: 2.2, step: 0.05,
          desc: 'How steeply an item point-budget grows with item level. Steeper means each tier obsoletes the last faster.' }) +
        ui.slider({ path: 'design.stats.budgetScale', label: 'Budget scale',
          value: s.budgetScale, min: 0.05, max: 2, step: 0.01 }) +
        '<div class="tiny faint" style="margin-top:6px">A rare chest at item level ' +
          CB.targetItemLevel(d) + ' carries <b>' +
          U.fmtInt(ST.itemBudget(d, CB.targetItemLevel(d), 'rare', 'chest')) +
          '</b> stat points.</div>') +
      charPanel +
      '</div></div>';
  }

  /* ========================================================== ABILITIES */

  function abilitiesTab() {
    var d = D();
    var current = sel().abilityId ? AB.abilityById(d, sel().abilityId) : (d.abilities || [])[0];
    if (current) sel().abilityId = current.id;

    /* Group the list by owning class. */
    var byClass = {}, orphans = [];
    (d.abilities || []).forEach(function (ab) {
      var owner = null;
      d.classes.forEach(function (c) { if ((c.abilities || []).indexOf(ab.id) >= 0) owner = c; });
      if (owner) (byClass[owner.id] = byClass[owner.id] || []).push(ab);
      else orphans.push(ab);
    });

    function abRow(ab) {
      var sh = AB.shape(ab);
      var bits = [];
      if (ab.cooldown > 0) bits.push(ab.cooldown + 's cd');
      if (ab.castTime > 0) bits.push(ab.castTime + 's cast');
      if (ab.channel > 0) bits.push(ab.channel + 's channel');
      if (ab.resourceCost > 0) bits.push(ab.resourceCost + ' cost');
      if (sh.aoe) bits.push('aoe');
      return '<div class="item' + (current && ab.id === current.id ? ' on' : '') +
        '" data-act="abl.select" data-val="' + ab.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(ab.name) + '</div>' +
        '<div class="s">' + esc(bits.join(' · ') || 'instant, free') + '</div></div>' +
        '<span class="spacer"></span>' +
        '<span class="chip tiny">' + esc((ab.effects || []).length) + '</span></div>';
    }

    var list = '';
    d.classes.forEach(function (c) {
      if (!byClass[c.id]) return;
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">' +
        esc(c.name) + '</div>' + byClass[c.id].map(abRow).join('');
    });
    if (orphans.length) {
      list += '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin:10px 0 5px">' +
        'Unassigned</div>' + orphans.map(abRow).join('');
    }
    if (!list) list = ui.empty('No abilities yet.', 'Start from a template, then change every number on it.');

    var templates = AB.TEMPLATE_GROUPS.map(function (g) {
      var items = AB.TEMPLATES.filter(function (t) { return t.group === g.id; });
      return '<div style="margin-bottom:10px">' +
        '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">' +
          esc(g.name) + '</div>' +
        '<div class="row wrap" style="gap:4px">' + items.map(function (t) {
          return '<span class="chip click" data-act="abl.fromTemplate" data-val="' + t.id + '">+ ' +
            esc(t.name) + '</span>';
        }).join('') + '</div></div>';
    }).join('');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Abilities', list, {
        actions: '<button class="sm" data-act="abl.add">Blank</button>',
        hint: (d.abilities || []).length + ' authored' }) +
      ui.panel('Start from a template', templates,
        { hint: 'then edit anything' }) +
      '</div><div>' +
      (current ? abilityEditor(current) : ui.panel('Editor', ui.empty('Select an ability.'))) +
      '</div></div>';
  }

  function abilityEditor(ab) {
    var d = D();
    var sh = AB.shape(ab);
    var owner = null;
    d.classes.forEach(function (c) { if ((c.abilities || []).indexOf(ab.id) >= 0) owner = c; });

    /* What one cast is worth, against a standard target. */
    var profile = CB.characterProfile(d, owner);
    var target = CB.targetProfile(d, { kind: 'elite' });
    var v = CB.castValue(d, ab, profile, target, 'single');
    var t = CB.execTime(d, ab, profile);
    var perSecond = ab.cooldown > 0 ? v.damage / Math.max(ab.cooldown, t) : (t > 0 ? v.damage / t : 0);

    var effects = (ab.effects || []).map(function (e, i) {
      var def = AB.EFFECT_BY_ID[e.type];
      if (!def) return '';
      var params = def.params.map(function (pp) {
        var val = e[pp.k];
        if (pp.type === 'num') {
          return ui.rangeAct({ label: pp.label, act: 'abl.param', val: i + '|' + pp.k,
                               value: val, min: pp.min || 0,
                               max: pp.max === undefined ? 100 : pp.max,
                               step: pp.step || 1 });
        }
        if (pp.type === 'bool') {
          return '<div class="row small" style="margin-top:5px">' +
            '<div class="toggle' + (val ? ' on' : '') + '" data-act="abl.paramBool" data-val="' + i + '|' + pp.k + '">' +
            '<span class="box"></span><span class="lbl tiny">' + esc(pp.label) + '</span></div></div>';
        }
        if (pp.type === 'select') {
          return '<div class="row small" style="margin-top:5px">' +
            '<span class="faint tiny" style="width:118px">' + esc(pp.label) + '</span>' +
            '<select data-act="abl.param" data-val="' + i + '|' + pp.k + '" style="flex:1">' +
              pp.options.map(function (o) {
                return '<option value="' + o.id + '"' + (o.id === val ? ' selected' : '') + '>' +
                  esc(o.name) + '</option>'; }).join('') + '</select></div>';
        }
        if (pp.type === 'stat') {
          return '<div class="row small" style="margin-top:5px">' +
            '<span class="faint tiny" style="width:118px">' + esc(pp.label) + '</span>' +
            '<select data-act="abl.param" data-val="' + i + '|' + pp.k + '" style="flex:1">' +
              ST.allStats(d).map(function (o) {
                return '<option value="' + o.id + '"' + (o.id === val ? ' selected' : '') + '>' +
                  esc(o.name) + '</option>'; }).join('') + '</select></div>';
        }
        return '<div class="row small" style="margin-top:5px">' +
          '<span class="faint tiny" style="width:118px">' + esc(pp.label) + '</span>' +
          '<input type="text" value="' + esc(val || '') + '" data-act="abl.param" data-val="' +
            i + '|' + pp.k + '" style="flex:1"></div>';
      }).join('');

      return '<div style="background:var(--panel-2);border-radius:8px;padding:11px 13px;margin-bottom:8px">' +
        '<div class="row"><span class="chip on">' + esc(def.name) + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="xs ghost" data-act="abl.removeEffect" data-val="' + i + '">remove</button></div>' +
        '<div class="tiny faint" style="margin-top:5px;line-height:1.45">' + esc(def.desc) + '</div>' +
        params + '</div>';
    }).join('');

    var adders = AB.EFFECT_CATS.map(function (cat) {
      var list = AB.EFFECT_TYPES.filter(function (e) { return e.cat === cat.id; });
      return '<div style="margin-bottom:8px">' +
        '<div class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">' +
          esc(cat.name) + '</div>' +
        '<div class="row wrap" style="gap:4px">' + list.map(function (e) {
          return '<span class="chip click" data-act="abl.addEffect" data-val="' + e.id + '">+ ' +
            esc(e.name) + '</span>'; }).join('') + '</div></div>';
    }).join('');

    var classOpts = [{ id: '', name: '(unassigned)' }].concat(d.classes.map(function (c) {
      return { id: c.id, name: c.name }; }));

    var readout = '<div class="grid g3">' +
      ui.stat('Per cast', U.fmtCompact(v.damage || v.healing), v.damage ? 'damage' : 'healing') +
      ui.stat('Cast time', U.round(t, 2) + 's', ab.onGcd ? 'on GCD' : 'off GCD') +
      ui.stat('Sustained', U.fmtCompact(perSecond) + '/s', 'if spammed on cooldown') +
      '</div>';

    var warn = '';
    if (!(ab.effects || []).length)
      warn += '<div class="chip bad">No effects - this button does nothing</div> ';
    if (sh.hardControlSeconds > 6 && ab.cooldown < 25)
      warn += '<div class="chip bad">' + U.round(sh.hardControlSeconds, 1) +
        's of hard control on a ' + ab.cooldown + 's cooldown</div> ';
    if (ab.cooldown === 0 && v.damage > 0 && ab.resourceCost === 0 && ab.onGcd)
      warn += '<div class="chip warn">Free, instant, no cooldown - this will be the whole rotation</div> ';
    if (ab.castTime > 0 && sh.isMobility)
      warn += '<div class="chip warn">A mobility button with a cast time rarely gets used</div> ';

    return ui.panel('Editing: ' + ab.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'abilitySel.name', label: 'Name', value: ab.name })
      + ui.select({ path: 'abilitySel.school', label: 'School', value: ab.school,
          options: AB.SCHOOLS.map(function (s) {
            return { id: s.id, name: s.name, desc: 'Damage type. ' +
              (s.mitigatedBy === 'armour' ? 'Reduced by armour.' : 'Reduced by resistance.') }; }),
          desc: 'What the damage is, which decides what reduces it.' })
      + ui.select({ path: 'abilitySel.scalesOff', label: 'Scales off',
          value: ab.scalesOff || 'auto',
          options: AB.POWER_CLASSES.map(function (p) {
            return { id: p.id, name: p.id === 'auto'
              ? 'Match the school (' + ((AB.SCHOOL_BY_ID[ab.school] || {}).power === 'spell'
                  ? 'any spell-power stat' : 'any attack-power stat') + ')'
              : p.name,
              desc: p.id === 'auto' ? 'Whatever the damage school implies.'
                  : 'The best stat of that class the character has.' };
          }).concat(ST.statSetOf(D()).primaries.map(function (p) {
            return { id: p.id, name: p.name,
              desc: 'This stat and no other. ' + p.name + ' runs on ' +
                (p.powers === 'both' ? 'attack and spell power'
                 : p.powers === 'spell' ? 'spell power' : 'attack power') + '.' };
          })),
          desc: 'Which of your stats drives the numbers. Naming one is how two attack-power stats stop being the same stat: a character geared for the other gets the off-stat curve instead.' })
      + ui.select({ path: 'abilitySel.targeting', label: 'Targeting', value: ab.targeting,
          options: AB.TARGETING })
      + ui.select({ path: 'classAssign', label: 'Belongs to', value: owner ? owner.id : '',
          options: classOpts })
      + '</div><div>'
      + ui.slider({ path: 'abilitySel.range', label: 'Range', value: ab.range, min: 0, max: 45,
          fmt: function (v2) { return v2 <= 5 ? 'Melee (' + v2 + 'yd)' : v2 + ' yd'; } })
      + ui.slider({ path: 'abilitySel.radius', label: 'Radius', value: ab.radius, min: 0, max: 40,
          fmt: function (v2) { return v2 === 0 ? 'Single target' : v2 + ' yd'; } })
      + ui.slider({ path: 'abilitySel.maxTargets', label: 'Max targets', value: ab.maxTargets, min: 1, max: 40 })
      + '</div></div>'
      + '<div class="grid g3" style="margin-top:4px"><div>'
      + ui.slider({ path: 'abilitySel.castTime', label: 'Cast time', value: ab.castTime,
          min: 0, max: 10, step: 0.1, fmt: function (v2) { return v2 === 0 ? 'Instant' : U.round(v2, 1) + 's'; } })
      + ui.slider({ path: 'abilitySel.channel', label: 'Channel', value: ab.channel,
          min: 0, max: 12, step: 0.5, fmt: function (v2) { return v2 === 0 ? 'None' : U.round(v2, 1) + 's'; } })
      + '</div><div>'
      + ui.slider({ path: 'abilitySel.cooldown', label: 'Cooldown', value: ab.cooldown,
          min: 0, max: 600, step: 1,
          fmt: function (v2) { return v2 === 0 ? 'None' : v2 >= 60 ? U.round(v2 / 60, 1) + 'm' : v2 + 's'; } })
      + ui.slider({ path: 'abilitySel.charges', label: 'Charges', value: ab.charges, min: 1, max: 6 })
      + '</div><div>'
      + ui.slider({ path: 'abilitySel.resourceCost', label: 'Resource cost', value: ab.resourceCost, min: 0, max: 200, step: 5 })
      + ui.slider({ path: 'abilitySel.resourceGain', label: 'Resource gain', value: ab.resourceGain, min: 0, max: 200, step: 5 })
      + '</div></div>'
      + ui.toggle({ path: 'abilitySel.onGcd', label: 'Respects the global cooldown', value: ab.onGcd,
          desc: 'Off-GCD abilities can be used without giving up a rotation slot. Powerful, and easy to overdo.' })
      + '<div class="tiny faint" style="margin:14px 0 8px;letter-spacing:.08em;text-transform:uppercase">Effects</div>'
      + (effects || ui.empty('No effects yet.', 'An ability with no effects is a button that does nothing.'))
      + '<div style="margin-top:10px">' + adders + '</div>'
      + (warn ? '<div class="row wrap" style="gap:5px;margin:10px 0">' + warn + '</div>' : '')
      + readout
      + '<div class="row wrap" style="gap:4px;margin-top:10px">' +
        AB.abilityTags(ab).slice(0, 10).map(function (tg) { return ui.chip(tg); }).join('') + '</div>',
      { actions: '<button class="sm ghost" data-act="dup" data-val="ability|' + ab.id + '">Duplicate</button> ' +
                 '<button class="sm danger" data-act="abl.remove" data-val="' + ab.id + '">Delete</button>' });
  }

  /* ============================================================== ITEMS */

  var ITEM_SUBTABS = [
    { id: 'items', name: 'Items & Gear' },
    { id: 'loot', name: 'Loot Tables' },
    { id: 'rewards', name: 'Reward Bundles' },
    { id: 'crafting', name: 'Crafting' }
  ];

  /* ============================================================ CRAFTING

     A recipe turns materials into an item. The interesting part is not the
     recipe, it is whether anybody would bother: if the reagents cost more
     than the result is worth, nobody crafts it, and the editor says so. */

  function craftSection() {
    var d = D();
    var CR = PN.crafting;
    var list = CR.recipes(d);
    var filter = PN.app.recipeFilter || 'all';
    var shown = list.filter(function (r) {
      return filter === 'all' || r.profession === filter;
    });
    var current = sel().recipeId ? CR.recipeById(d, sel().recipeId) : shown[0];
    if (current) sel().recipeId = current.id;

    var used = {};
    list.forEach(function (r) { used[r.profession] = (used[r.profession] || 0) + 1; });
    var filters = '<div class="row wrap" style="gap:4px;margin-bottom:10px">' +
      [{ id: 'all', name: 'All' }].concat(CR.PROFESSIONS.filter(function (p) {
        return used[p.id];
      })).map(function (p) {
        return '<span class="chip click' + (filter === p.id ? ' on' : '') +
          '" data-act="recipe.filter" data-val="' + p.id + '">' + esc(p.name) +
          (used[p.id] ? ' <span class="faint">' + used[p.id] + '</span>' : '') + '</span>';
      }).join('') + '</div>';

    var rows = shown.map(function (r) {
      var out = IT.itemById(d, r.outputId);
      var m = CR.recipeMetrics(d, r);
      var issues = CR.recipeIssues(d, r);
      var prof = CR.PROFESSION_BY_ID[r.profession];
      return '<div class="item' + (current && r.id === current.id ? ' on' : '') +
        '" data-act="recipe.select" data-val="' + r.id + '">' +
        '<div style="min-width:0"><div class="t">' + esc(r.name) +
          (issues.length ? ' <span class="chip warn">' + issues.length + '</span>' : '') + '</div>' +
        '<div class="s">' + esc(prof ? prof.name : r.profession) + ' &middot; ' +
          (r.inputs || []).length + ' reagent' + ((r.inputs || []).length === 1 ? '' : 's') +
          ' &middot; ' + (r.source === 'looted' ? 'looted' : 'trainer') +
          (out ? ' &middot; makes ' + esc(out.name) : '') +
        '</div></div><span class="spacer"></span>' +
        '<span class="chip ' + (m.ratio >= 1.4 ? 'good' : m.ratio >= 0.9 ? '' : 'bad') + '">' +
          (m.ratio === Infinity ? 'free' : U.round(m.ratio, 1) + '×') + '</span></div>';
    }).join('') || ui.empty('No recipes yet.',
      'Crafting turns the materials your monsters drop into things players actually want.');

    var sum = CR.summary(d);
    var orphans = CR.orphanRecipeItems(d);

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Recipes', filters + rows, {
        actions: '<button class="sm" data-act="recipe.add">Add recipe</button>' +
                 '<button class="sm ghost" data-act="recipe.generate" ' +
                 'title="Build a starter set from the materials and gear you already have">Generate a set</button>',
        hint: sum.recipes + ' recipes · ' + sum.professions + ' professions'
      }) +
      ui.panel('Crafting as content', ''
        + '<div class="grid g2">'
        + ui.stat('Recipes', sum.recipes, sum.viable + ' worth making')
        + ui.stat('Behind a drop', sum.looted, 'recipe has to be found')
        + ui.stat('Makes gear', sum.makesGear)
        + ui.stat('Content', U.round(sum.hours, 1) + 'h')
        + '</div>'
        + '<div class="tiny faint" style="margin-top:10px;line-height:1.6">'
        + 'Whether a crafter is useful or decorative is not a dial - it is '
        + 'whether the gear these recipes make keeps up with what drops. '
        + (sum.makesGear
            ? 'Right now crafted gear sits at <b>' + Math.round(sum.parity) + '%</b> of the '
              + 'current tier, and ' + sum.competitive + ' of ' + sum.makesGear +
              ' gear recipes are worth wearing.'
            : 'No recipe here makes gear yet.') + '</div>'
        + (orphans.length
            ? '<div class="chip warn" style="margin-top:10px">' + orphans.length +
              ' recipe item' + (orphans.length === 1 ? '' : 's') + ' teach nothing</div>'
            : '')) +
      '</div><div>' +
      (current ? recipeEditor(current)
       : ui.panel('Editor', ui.empty('Select a recipe.'))) +
      '</div></div>';
  }

  function recipeEditor(r) {
    var d = D();
    var CR = PN.crafting;
    var m = CR.recipeMetrics(d, r);
    var issues = CR.recipeIssues(d, r);

    var craftable = (d.items || []).filter(function (i) {
      return i.kind !== 'currency' && i.kind !== 'recipe';
    });
    var outOpts = [{ id: '', name: '(makes nothing)' }].concat(craftable.map(function (i) {
      return { id: i.id, name: i.name + (i.itemLevel ? ' (ilvl ' + i.itemLevel + ')' : '') };
    }));
    /* Anything can be a reagent.

       A recipe is "these things become that thing", and the things
       going in are not always ore. A weapon upgrade eats the weapon;
       a gem socket eats a gem; almost everything worth making eats
       gold. The picker used to offer materials, consumables and
       currency only, so half of what a designer wants to write could
       not be written. */
    /* Each row offers what its OWN kind offers. A reagent row lists
       reagents, a currency row lists currencies, a gear row lists
       gear - which is what having a button per kind is for. One
       picker listing the whole catalogue made the buttons pointless. */
    function optsOfKind(kind) {
      return (d.items || []).filter(function (i) { return i.kind === kind; })
        .map(function (i) { return { id: i.id, name: i.name }; });
    }
    function rowOpts(inp) {
      var it = IT.itemById(d, inp.itemId);
      var kind = it ? it.kind : 'material';
      var list = optsOfKind(kind);
      /* A reagent pointing at something that no longer exists still
         needs to show what it is pointing at. */
      if (it && !list.some(function (o) { return o.id === it.id; })) {
        list = list.concat([{ id: it.id, name: it.name }]);
      }
      return list.length ? list : [{ id: '', name: '(nothing of this kind)' }];
    }
    var recipeItems = [{ id: '', name: '(none)' }].concat(
      (d.items || []).filter(function (i) { return i.kind === 'recipe'; })
        .map(function (i) { return { id: i.id, name: i.name }; }));
    var questItems = [{ id: '', name: '(none)' }].concat(
      (d.items || []).filter(function (i) { return i.kind === 'questItem'; })
        .map(function (i) { return { id: i.id, name: i.name }; }));

    var inputRows = (r.inputs || []).map(function (inp, i) {
      var it = IT.itemById(d, inp.itemId);
      return '<div class="objrow"><div class="row">' +
        '<select data-act="recipe.inputItem" data-val="' + i + '" style="flex:1;min-width:0">' +
        rowOpts(inp).map(function (o) {
          return '<option value="' + o.id + '"' + (o.id === inp.itemId ? ' selected' : '') + '>' +
            esc(o.name) + '</option>'; }).join('') + '</select>' +
        '<span class="tiny faint">&times;</span>' +
        '<input type="number" value="' + (inp.qty || 1) + '" min="1" max="999" style="width:66px" ' +
          'data-act="recipe.inputQty" data-val="' + i + '">' +
        '<button class="xs ghost" data-act="recipe.removeInput" data-val="' + i + '">remove</button>' +
        '</div>' +
        (it ? '<div class="tiny faint" style="margin-top:4px">' +
          esc(IT.KIND_BY_ID[it.kind] ? IT.KIND_BY_ID[it.kind].name : it.kind) +
          ' &middot; worth ' + Math.round(IT.itemDesire(d, it)) + ' each</div>' : '') +
        '</div>';
    }).join('') || ui.empty('No reagents. A recipe that costs nothing is not crafting.');

    return ui.panel('Recipe: ' + r.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'recipeSel.name', label: 'Name', value: r.name })
      + ui.select({ path: 'recipeSel.profession', label: 'Profession',
          value: r.profession,
          options: PN.crafting.PROFESSIONS.slice(0, PN.research.limits(PN.game.state).professions) })
      + '</div><div>'
      + ui.select({ path: 'recipeSel.outputId', label: 'Makes', value: r.outputId || '',
          options: outOpts })
      + ui.number({ path: 'recipeSel.outputQty', label: 'How many', value: r.outputQty,
          min: 1, max: 99 })
      + '</div></div>'

      + '<div class="subhead spaced">Who can make it</div>'
      + ui.select({ path: 'recipeSel.source', label: 'Requires', value: r.source,
          options: PN.crafting.SOURCES })
      + (function () {
          var src = PN.crafting.SOURCE_BY_ID[r.source] || PN.crafting.SOURCE_BY_ID.known;
          var html = '';
          if (src.needsRecipe) {
            html += ui.select({ path: 'recipeSel.recipeItemId',
                      label: 'Taught by which recipe item',
                      value: r.recipeItemId || '', options: recipeItems })
              + '<div class="row" style="margin:-6px 0 12px">'
              + '<button class="xs" data-act="recipe.makeItem" data-val="' + r.id
              + '">Create a recipe item for this</button></div>';
          }
          if (src.needsQuest) {
            html += ui.select({ path: 'recipeSel.questItemId',
                      label: 'Must be carrying', value: r.questItemId || '',
                      options: questItems })
              + '<div class="tiny faint" style="margin:-6px 0 12px;line-height:1.55">'
              + 'Carried, not learned: putting it down means they cannot make this any '
              + 'more. That is what makes it a different gate from a recipe page.</div>';
          }
          return html;
        })()
      + ui.number({ path: 'recipeSel.levelReq', label: 'Level required', value: r.levelReq,
          min: 1, max: 200 })

      + '<div class="subhead spaced">Reagents</div>'
      + inputRows
      + '<div class="row wrap" style="gap:5px;margin-bottom:12px">'
      + [['material', 'Add reagent'], ['currency', 'Add currency'],
         ['gear', 'Add gear'], ['consumable', 'Add consumable']]
          .filter(function (b) {
            return (d.items || []).some(function (i) { return i.kind === b[0]; }); })
          .map(function (b) {
            return '<button class="sm" data-act="recipe.addInput" data-val="' + b[0] + '">'
              + esc(b[1]) + '</button>'; }).join('')
      + '</div>'

      + '<div class="grid g3">'
      + ui.stat('Reagents cost', Math.round(m.inValue))
      + ui.stat('Result worth', Math.round(m.outValue))
      + ui.stat('Margin', (m.margin >= 0 ? '+' : '') + Math.round(m.margin), null,
          m.margin > 0 ? 'good' : 'bad')
      + '</div>'
      + (issues.length
          ? '<div class="row wrap" style="gap:5px;margin-top:11px">' + issues.map(function (s) {
              return '<span class="chip warn">' + esc(s) + '</span>'; }).join('') + '</div>'
          : '<div class="chip good" style="margin-top:11px">Worth crafting</div>'),
      { actions: '<button class="sm danger" data-act="recipe.remove" data-val="' + r.id +
                 '">Delete</button>' });
  }

  function itemsTab() {
    var sub = PN.app.itemTab || 'items';
    var body = sub === 'loot' ? lootSection() : sub === 'rewards' ? rewardSection()
             : sub === 'crafting' ? craftSection() : itemSection();
    return ui.tabs(ITEM_SUBTABS, sub, 'item.tab') + body;
  }

  function itemSection() {
    var d = D();
    var filter = PN.app.itemFilter || 'all';
    var items = (d.items || []).filter(function (i) {
      return filter === 'all' || i.kind === filter;
    });
    var current = sel().itemId ? IT.itemById(d, sel().itemId) : items[0];
    if (current) sel().itemId = current.id;

    var filters = '<div class="row wrap" style="gap:4px;margin-bottom:10px">' +
      [{ id: 'all', name: 'All' }].concat(IT.ITEM_KINDS).map(function (k) {
        return '<span class="chip click' + (filter === k.id ? ' on' : '') +
          '" data-act="item.filter" data-val="' + k.id + '">' + esc(k.name) + '</span>';
      }).join('') + '</div>';

    var list = items.map(function (it) {
      var rarity = ST.RARITY_BY_ID[it.rarity] || ST.RARITY_BY_ID.common;
      var sub = it.kind === 'gear'
        ? (ST.SLOT_BY_ID[it.slot] ? ST.SLOT_BY_ID[it.slot].name : it.slot) + ' · ilvl ' + it.itemLevel
        : IT.KIND_BY_ID[it.kind].name;
      return '<div class="item' + (current && it.id === current.id ? ' on' : '') +
        '" data-act="item.select" data-val="' + it.id + '">' +
        '<div style="min-width:0"><div class="t" style="color:' + rarity.colour + '">' + esc(it.name) + '</div>' +
        '<div class="s">' + esc(sub) + '</div></div></div>';
    }).join('') || ui.empty('No items of this kind.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Catalogue', filters + list, {
        actions: '<button class="sm" data-act="item.add">New item</button>' +
                 ' <button class="sm" data-act="item.genTier">Generate tier</button>',
        hint: (d.items || []).length + ' items' }) +
      '</div><div>' +
      (current ? itemEditor(current) : ui.panel('Editor', ui.empty('Select an item.'))) +
      '</div></div>';
  }

  /* A scroll's own half of the editor: which slots it may go on, and
     who in your game would actually want it.

     The last part is the point. The same numbers are the best thing a
     damage build has seen all week and dead weight on a tank, so the
     editor says so while you are writing it rather than leaving you to
     find out from a leaderboard six months later. */
  function scrollBlock(d, it, statRows) {
    var SC = PN.scrolls;
    var set = ST.statSetOf(d);
    var scroll = { id: it.id, item: it, stats: it.stats || {},
                   scope: SC.SCOPE_BY_ID[it.scrollScope || 'any'] || SC.SCOPE_BY_ID.any };
    var rows = [];
    ['tank', 'healer', 'dps'].forEach(function (job) {
      (set.primaries || []).forEach(function (p) {
        if ((p.roles || []).indexOf(job) < 0) return;
        rows.push({ name: U.titleCase(job) + ' · ' + p.name,
                    value: SC.worthTo(d, null, scroll, p.id, job) });
      });
    });
    var top = 0;
    rows.forEach(function (r) { top = Math.max(top, r.value); });
    var dead = rows.filter(function (r) { return r.value < top * 0.3; }).length;

    return '<div class="row" style="margin:12px 0 6px">'
      + '<span class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase">'
      + 'What it grants</span></div>'
      + statRows
      + ui.select({ path: 'itemSel.scrollScope', label: 'Goes on',
          value: it.scrollScope || 'any', options: SC.SCOPES })
      + '<div class="subhead spaced">Who would use it</div>'
      + (rows.length
          ? PN.chart.bars(rows.map(function (r) {
              return { name: r.name, value: r.value,
                       color: r.value >= top * 0.75 ? '#5fd6a0'
                            : r.value >= top * 0.3 ? '#ffc861' : '#4a5160' };
            }), { labelW: 118, fmt: function (v) { return U.round(v, 0); } })
          : '<div class="tiny faint">Put some stats on it and this fills in.</div>')
      + '<div class="tiny faint" style="margin-top:8px;line-height:1.6">'
      + 'A player puts the best scroll they can get on every slot, and "best" is '
      + 'decided by the job their build does. '
      + (top <= 0
          ? 'This one is worth nothing to anybody yet.'
          : dead === 0
            ? 'This is worth having to everyone, which means it is the answer everywhere '
              + 'and nobody has a decision to make.'
            : dead + ' of these ' + rows.length + ' builds would leave it in the bank.')
      + '</div>';
  }

  /* A bag is carrying space, and carrying space is the quietest
     progression system in the genre. How much room one gives and how
     many a player may own are the two numbers that decide whether bag
     space is something to chase or something you solve once. */
  function bagBlock(d, it) {
    var slots = Math.max(0, it.slots || 0);
    var cap = Math.max(0, it.maxCarried === undefined ? 4 : it.maxCarried);
    var base = (d.gearing || {}).backpackSlots || 0;
    var most = base + slots * cap;
    return '<div class="subhead spaced">Carrying space</div>'
      + ui.number({ path: 'itemSel.slots', label: 'Slots it gives',
          value: slots, min: 0, max: 40,
          desc: 'One slot holds one KIND of thing. Identical items stack, so a slot is a stack rather than an item.' })
      + ui.number({ path: 'itemSel.maxCarried', label: 'How many a player may own',
          value: cap, min: 0, max: 12,
          desc: 'The dial that stops bag space being solved once. Four of a ten-slot bag is forty slots and the end of the problem.' })
      + '<div class="tiny faint" style="margin-top:6px;line-height:1.6">'
      + 'Somebody carrying the most of these they are allowed has '
      + '<b style="color:var(--text)">' + most + ' slots</b>'
      + (base ? ' (' + base + ' of them from the backpack every character starts with)' : '')
      + '. A player with no room leaves things on the floor - they still equip gear that '
      + 'is an upgrade, and they still vendor what is not, but they cannot keep a reagent '
      + 'or a flask.</div>';
  }

  function itemEditor(it) {
    var d = D();
    var isGear = it.kind === 'gear';
    var cap = isGear ? ST.itemBudget(d, it.itemLevel, it.rarity, it.slot) : 0;
    var used = ST.budgetUsed(d, it);
    var pct = cap > 0 ? (used / cap) * 100 : 0;

    /* A scroll carries stats too - a small pile of them that goes on
       top of a piece of gear. It has no item level and no budget of its
       own, because it is not a piece of gear: it is a few percent on
       one somebody already owns. */
    var isScroll = it.kind === 'scroll';
    var statRows = (isGear || isScroll) ? ST.allStats(d).map(function (st) {
      var val = (it.stats || {})[st.id] || 0;
      return ui.rangeAct({ label: st.name, act: 'item.stat', val: st.id,
                           value: Math.round(val), min: 0,
                           max: isScroll ? 120
                              : Math.max(50, Math.round(cap / (ST.COST[st.cls] || 1) * 1.1)) });
    }).join('') : '';

    var budgetBar = isGear
      ? '<div style="margin:12px 0">' +
        '<div class="row small" style="margin-bottom:5px"><span class="muted">Stat budget</span>' +
        '<span class="spacer"></span><span class="mono ' +
          (pct > 105 ? 'bad' : pct > 95 ? 'good' : 'warn') + '">' +
          U.fmtInt(used) + ' / ' + U.fmtInt(cap) + ' (' + U.fmtPct(pct, 0) + ')</span></div>' +
        '<div class="bar"><i style="width:' + Math.min(100, pct).toFixed(1) + '%;background:' +
          (pct > 105 ? 'var(--bad)' : pct > 95 ? 'var(--good)' : 'var(--accent)') + '"></i></div>' +
        '<div class="tiny faint" style="margin-top:6px;line-height:1.5">' +
          (pct > 105 ? 'Over budget. This item is stronger than its item level says, and players will notice which piece is best in slot.'
           : pct < 80 ? 'Under budget. This piece will be skipped.'
           : 'Roughly on budget.') + '</div></div>'
      : '';

    /* Every parameter an effect declares, rendered.

       This used to draw one number box labelled nothing, wired to
       "amount", for every effect regardless of what that effect takes -
       so Buff Stat had no stat, Open Loot Table had no table, Remove
       Debuff had no count, and half the options in the list did nothing
       whatever you typed. The simulation reads these fields; there was
       simply no way to fill them in. */
    /* Consumables only. A bag is not drunk, opened or used up - it is
       carried, and being carried is the whole of what it does. */
    var effects = it.kind === 'consumable'
      ? '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Use effects</div>' +
        (it.effects || []).map(function (e, i) {
          var def = null;
          IT.CONSUMABLE_EFFECTS.forEach(function (c) { if (c.id === e.type) def = c; });
          var params = (def && def.params) || [];
          var fields = params.map(function (p) {
            if (p === 'stat') {
              var stats = ST.statSetOf(d);
              var opts = [{ id: '', name: '(pick a stat)' }]
                .concat((stats.primaries || []).map(function (s) {
                  return { id: s.id, name: s.name }; }));
              if (stats.stamina) opts.push({ id: stats.stamina.id, name: stats.stamina.name });
              if (stats.armour) opts.push({ id: stats.armour.id, name: stats.armour.name });
              (stats.secondaries || []).forEach(function (s) {
                opts.push({ id: s.id, name: s.name }); });
              return '<label class="tiny faint" style="display:block;margin-top:6px">Stat' +
                '<select data-act="item.effectStat" data-val="' + i + '" style="width:100%">' +
                opts.map(function (o) {
                  return '<option value="' + o.id + '"' +
                    (o.id === (e.stat || '') ? ' selected' : '') + '>' +
                    esc(o.name) + '</option>'; }).join('') + '</select></label>';
            }
            if (p === 'lootTableId') {
              var tables = [{ id: '', name: '(pick a table)' }]
                .concat((d.lootTables || []).map(function (t) {
                  return { id: t.id, name: t.name }; }));
              return '<label class="tiny faint" style="display:block;margin-top:6px">Loot table' +
                '<select data-act="item.effectLoot" data-val="' + i + '" style="width:100%">' +
                tables.map(function (o) {
                  return '<option value="' + o.id + '"' +
                    (o.id === (e.lootTableId || '') ? ' selected' : '') + '>' +
                    esc(o.name) + '</option>'; }).join('') + '</select></label>';
            }
            var label = p === 'duration' ? 'Duration (seconds)'
                      : p === 'count' ? 'How many'
                      : p === 'amount' ? (e.type === 'grantXp' ? 'Experience'
                                        : e.type === 'buffStat' ? 'Stat points'
                                        : e.type === 'buffPower' ? 'Power'
                                        : 'Amount')
                      : U.titleCase(p);
            var val = e[p] === undefined ? '' : e[p];
            return '<label class="tiny faint" style="display:block;margin-top:6px">' +
              esc(label) +
              '<input type="number" value="' + val + '" min="0" ' +
              'data-act="item.effectParam" data-val="' + i + '|' + p +
              '" style="width:100%"></label>';
          }).join('');

          var issue = null;
          if (e.type === 'buffStat' && !e.stat) issue = 'No stat chosen - this does nothing';
          if (e.type === 'openLoot' && !e.lootTableId) issue = 'No table chosen - this opens nothing';
          if (params.indexOf('amount') >= 0 && !(e.amount > 0)) issue = 'Amount is zero';

          return '<div style="background:var(--panel-2);border:1px solid ' +
            (issue ? 'var(--warn)' : 'var(--line-soft)') +
            ';border-radius:6px;padding:8px 10px;margin-bottom:6px">' +
            '<div class="row"><span class="chip on">' + esc(def ? def.name : e.type) + '</span>' +
            '<span class="spacer"></span>' +
            '<button class="xs ghost" data-act="item.removeEffect" data-val="' + i +
              '">remove</button></div>' +
            (def && def.desc
              ? '<div class="tiny faint" style="margin-top:4px;line-height:1.45">' +
                esc(def.desc) + '</div>' : '') +
            fields +
            (issue ? '<div class="chip warn" style="margin-top:7px">' + esc(issue) + '</div>' : '') +
            '</div>';
        }).join('') +
        '<div class="row wrap" style="gap:4px">' + IT.CONSUMABLE_EFFECTS.map(function (c) {
          return '<span class="chip click" data-act="item.addEffect" data-val="' + c.id + '" ' +
            'title="' + esc(c.desc || '') + '">+ ' + esc(c.name) + '</span>'; }).join('') + '</div>'
      : '';

    return ui.panel('Editing: ' + it.name, ''
      + '<div class="grid g2"><div>'
      + ui.text({ path: 'itemSel.name', label: 'Name', value: it.name })
      + ui.select({ path: 'itemSel.kind', label: 'Kind', value: it.kind, options: IT.ITEM_KINDS })
      + (isGear ? ui.select({ path: 'itemSel.slot', label: 'Slot', value: it.slot,
          options: ST.AUTHOR_SLOTS }) : '')
      + '</div><div>'
      + ui.select({ path: 'itemSel.rarity', label: 'Rarity', value: it.rarity,
          options: PN.research.raritiesFor(PN.game.state).map(function (r) {
            return { id: r.id, name: r.name, desc: 'Budget x' + r.mult + ', up to ' +
              r.maxSecondary + ' secondary stats' }; }) })
      + (isGear
          ? ui.number({ path: 'itemSel.itemLevel', label: 'Item level',
              value: it.itemLevel, min: 1, max: 1000 })
          : ui.number({ path: 'itemSel.itemLevel', label: 'Tier',
              value: it.itemLevel, min: 0, max: 1000,
              desc: 'Which tier of the ladder this belongs to - tier-one ore against tier-five ore. Higher tiers are worth more to players and to recipes.' }))
      + ui.select({ path: 'itemSel.bind', label: 'Binding', value: it.bind, options: IT.BIND_TYPES })

      /* Where players get it. An item is only ever available where you
         put it - a loot table, a quest reward, a recipe - plus these two
         switches. They used to be on for everything, which is how gear
         you never placed turned up in a vendor's window and a reagent
         you wrote for one recipe turned up in everybody's bags. */
      + '<div class="subhead spaced">Where players get it</div>'
      + ui.toggle({ path: 'itemSel.sources.vendor', label: 'A vendor sells it',
          value: !!IT.sourcesOf(it).vendor,
          desc: it.kind === 'gear'
            ? 'Buyable for currency. Off keeps it to whatever you placed it in.'
            : 'Only gear is sold at the catch-up vendor.' })
      + (it.kind === 'material'
          ? ui.toggle({ path: 'itemSel.sources.gather', label: 'Players gather it',
              value: !!IT.sourcesOf(it).gather,
              desc: 'Picked up out in the world. Off means the only way to get it is where you placed it.' })
          : '')
      + (function () {
          var where = IT.placements(D(), it);
          return where.length
            ? '<div class="tiny faint" style="margin-top:6px;line-height:1.5">Players get this by: '
              + esc(U.listJoin(where)) + '.</div>'
            : '<div class="chip bad" style="margin-top:7px">Nothing gives this to anyone</div>';
        })()
      + '</div></div>'
      + budgetBar
      + (isGear ? '<div class="row" style="margin-bottom:6px"><span class="tiny faint" style="letter-spacing:.08em;text-transform:uppercase">Stats</span>' +
          '<span class="spacer"></span><button class="xs" data-act="item.autoStat">Fill to budget</button></div>' +
          statRows : '')
      + (isScroll ? scrollBlock(d, it, statRows) : '')
      + (it.kind === 'container' ? bagBlock(d, it) : '')
      + effects
      /* A price only exists where there is a counter to pay it at.

         Every item used to carry a vendor value whether or not any
         vendor stocked it, and every valuation in the game read that
         number - so an item nobody sold was worth whatever you had
         typed, and a reagent you never got round to pricing was worth
         nothing at all. If a vendor sells it, the shelf price IS the
         price. If not, it is worth what another player will pay. */
      + (function () {
          var p = PN.market.priceOf(d, it);
          if (IT.isVendorable(it)) {
            return ui.number({ path: 'itemSel.vendorValue', label: 'Vendor price',
                     value: it.vendorValue, min: 0, max: 100000 })
              + '<div class="tiny faint" style="margin:-2px 0 8px;line-height:1.55">'
              + 'A vendor stocks this, so this is what it is worth. Unlimited stock on '
              + 'a shelf is a ceiling and a floor at once: no player pays more, and no '
              + 'player accepts less.</div>';
          }
          return '<div class="rowact"><span class="faint tiny rowact-k">Worth</span>'
            + '<span class="mono" style="grid-column:2">' + U.fmtCompact(Math.round(p.price))
            + '</span><span class="faint tiny rowact-s">on the market</span></div>'
            + '<div class="tiny faint" style="margin:2px 0 8px;line-height:1.55">'
            + esc(p.why) + ' No vendor stocks this, so there is no shelf price to set - '
            + 'what it is worth is what another player will pay. Tick '
            + '<b style="color:var(--text)">Sold</b> above to price it yourself.</div>';
        })()
      + '<div class="grid g2" style="margin-top:10px">'
      + ui.stat('Desirability', Math.round(IT.itemDesire(d, it)), 'how much players want it')
      + ui.stat('Feeds', U.titleCase(IT.itemAxis(it)), 'need axis')
      + '</div>',
      { actions: '<button class="sm ghost" data-act="dup" data-val="item|' + it.id + '">Duplicate</button> ' +
                 '<button class="sm danger" data-act="item.remove" data-val="' + it.id + '">Delete</button>' });
  }

  /* --------------------------------------------------------- loot ---- */

  function lootSection() {
    var d = D();
    var current = sel().lootId ? IT.lootById(d, sel().lootId) : (d.lootTables || [])[0];
    if (current) sel().lootId = current.id;

    var list = (d.lootTables || []).map(function (t) {
      return '<div class="item' + (current && t.id === current.id ? ' on' : '') +
        '" data-act="loot.select" data-val="' + t.id + '">' +
        '<div><div class="t">' + esc(t.name) + '</div>' +
        '<div class="s">' + (t.entries || []).length + ' entries · value ' +
          Math.round(IT.lootValue(d, t)) + '</div></div></div>';
    }).join('') || ui.empty('No loot tables.', 'Loot tables are what dungeons, bosses and containers actually drop.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Loot tables', list, {
        actions: '<button class="sm" data-act="loot.add">New table</button>' }) +
      '</div><div>' +
      (current ? lootEditor(current) : ui.panel('Editor', ui.empty('Select a loot table.'))) +
      '</div></div>';
  }

  function lootEditor(t) {
    var d = D();
    var wTotal = U.sum(t.entries || [], function (e) { return e.weight || 1; });

    function itemPicker(act, val) {
      return '<select data-act="' + act + '" data-val="' + val + '" style="flex:1">' +
        (d.items || []).map(function (i) {
          return '<option value="' + i.id + '">' + esc(i.name) + '</option>'; }).join('') + '</select>';
    }

    var entries = (t.entries || []).map(function (e, i) {
      var it = IT.itemById(d, e.itemId);
      var rarity = it ? (ST.RARITY_BY_ID[it.rarity] || ST.RARITY_BY_ID.common) : null;
      var chance = wTotal > 0 ? ((e.weight || 1) / wTotal) * 100 : 0;
      return '<div style="background:var(--panel-2);border-radius:7px;padding:9px 11px;margin-bottom:6px">' +
        '<div class="row">' +
        '<span class="t" style="flex:1;color:' + (rarity ? rarity.colour : 'var(--text)') + '">' +
          esc(it ? it.name : '(missing item)') + '</span>' +
        '<span class="mono tiny">' + U.fmtPct(chance, 1) + '</span>' +
        '<button class="xs ghost" data-act="loot.removeEntry" data-val="' + i + '">remove</button></div>' +
        ui.rangeAct({ label: 'Weight', act: 'loot.weight', val: i,
                      value: e.weight || 1, min: 1, max: 200, cls: 'narrow' }) +
        '<div class="row small" style="margin-top:4px">' +
        '<span class="faint tiny" style="width:56px">Quantity</span>' +
        '<input type="number" value="' + (e.qtyMin || 1) + '" min="1" style="width:64px" data-act="loot.qtyMin" data-val="' + i + '">' +
        '<span class="faint tiny">to</span>' +
        '<input type="number" value="' + (e.qtyMax || 1) + '" min="1" style="width:64px" data-act="loot.qtyMax" data-val="' + i + '">' +
        '</div></div>';
    }).join('') || ui.empty('No entries.');

    /* Who this table drops for, and how many items one player actually
       walks away with. Without these two numbers on screen it is
       impossible to tell why players have more gear than you expected. */
    var mode = (d.gearing || {}).lootMode || 'personal';
    var usedBy = [];
    (d.dungeons || []).forEach(function (dg) {
      if (dg.trashLootTableId === t.id) usedBy.push({ n: dg.name + ' trash', size: dg.groupSize });
    });
    (d.bosses || []).forEach(function (b) {
      if (b.lootTableId !== t.id) return;
      var dg = U.byId(d.dungeons || [], b.dungeonId);
      usedBy.push({ n: b.name, size: dg ? dg.groupSize : 1 });
    });
    (d.monsters || []).forEach(function (m) {
      if (m.lootTableId === t.id) usedBy.push({ n: m.name, size: 1 });
    });
    var groupSize = usedBy.length ? usedBy[0].size : 1;
    var share = IT.lootShare(d, groupSize);
    var perOpen = IT.expectedDrops(d, t, groupSize);

    return ui.panel('Loot table: ' + t.name, ''
      + ui.text({ path: 'lootSel.name', label: 'Name', value: t.name })
      + ui.slider({ path: 'lootSel.rolls', label: 'Draws per open', value: t.rolls, min: 1, max: 10 })
      + ui.slider({ path: 'lootSel.dropChance', label: 'Chance a draw drops anything',
          value: t.dropChance === undefined ? 100 : t.dropChance,
          desc: 'At 100% every draw produces an item, so every kill hands out gear. Most tables in the genre sit far lower - that is what makes the drops that do happen worth anything.' })
      + ui.slider({ path: 'lootSel.badLuckProtection', label: 'Bad-luck protection',
          value: t.badLuckProtection,
          desc: 'Nobody remembers the drops they got. Everybody remembers the eighty runs without one.' })
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Weighted entries</div>'
      + entries
      + '<div class="row" style="margin-top:8px">' + itemPicker('loot.addEntry', '0') +
        '<button class="sm" data-act="loot.addEntryGo">Add</button></div>'
      + '<div class="grid g3" style="margin-top:12px">'
      + ui.stat('Items per open', U.round(perOpen, 2), 'for one player', perOpen > 1.6 ? 'warn' : '')
      + ui.stat('Expected value', Math.round(IT.lootValue(d, t)), 'desirability per open')
      + ui.stat('Entries', (t.entries || []).length)
      + '</div>'
      + '<div class="tiny faint" style="margin-top:10px;line-height:1.6">'
      + (usedBy.length
          ? 'Opened by ' + esc(usedBy.slice(0, 3).map(function (u) { return u.n; }).join(', ')) +
            (usedBy.length > 3 ? ' and ' + (usedBy.length - 3) + ' more' : '') + '. '
          : 'Nothing opens this table yet. ')
      + (mode === 'personal'
          ? 'Loot mode is <b>personal</b>, so every player rolls the whole table themselves.'
          : 'Loot mode is <b>' + esc(mode === 'needGreed' ? 'need before greed' :
              mode === 'master' ? 'master looter' : 'group') + '</b>, so it drops once for a group of ' +
            groupSize + ' and each player\'s share is ' + U.fmtPct(share * 100, 0) + ' of it.')
      + '</div>',
      { actions: '<button class="sm danger" data-act="loot.remove" data-val="' + t.id + '">Delete</button>' });
  }

  /* ------------------------------------------------------- rewards ---- */

  function rewardSection() {
    var d = D();
    var current = sel().rewardId ? IT.rewardById(d, sel().rewardId) : (d.rewards || [])[0];
    if (current) sel().rewardId = current.id;

    var list = (d.rewards || []).map(function (r) {
      return '<div class="item' + (current && r.id === current.id ? ' on' : '') +
        '" data-act="reward.select" data-val="' + r.id + '">' +
        '<div><div class="t">' + esc(r.name) + '</div>' +
        '<div class="s">value ' + Math.round(IT.rewardValue(d, r)) + ' · ' +
          (r.items || []).length + ' items</div></div></div>';
    }).join('') || ui.empty('No reward bundles.',
      'A reward bundle is what a quest, a boss or a pass tier actually hands over.');

    return '<div class="grid g-1-2"><div>' +
      ui.panel('Reward bundles', list, {
        actions: '<button class="sm" data-act="reward.add">New bundle</button>' }) +
      '</div><div>' +
      (current ? rewardEditor(current) : ui.panel('Editor', ui.empty('Select a reward bundle.'))) +
      '</div></div>';
  }

  /* The level this reward is FOR: the middle of the quests that hand it
     out, or the middle of the curve if nothing does yet. A reward is
     worth a different share of a level at five than at fifty, and the
     answer has to be given somewhere real. */
  /* The design layer owns this now, because the VALUE of a reward
     depends on it too - a slider that says one level and a score that
     assumes another is two answers to one question. */
  function referenceLevel(d, r) { return IT.rewardLevel(d, r); }

  function rewardEditor(r) {
    var d = D();
    var currencies = (d.items || []).filter(function (i) { return i.kind === 'currency'; });

    var items = (r.items || []).map(function (e, i) {
      var it = IT.itemById(d, e.itemId);
      var rarity = it ? (ST.RARITY_BY_ID[it.rarity] || ST.RARITY_BY_ID.common) : null;
      return '<div class="row" style="background:var(--panel-2);border-radius:7px;padding:8px 10px;margin-bottom:6px">' +
        '<span style="flex:1;color:' + (rarity ? rarity.colour : 'var(--text)') + '">' +
          esc(it ? it.name : '(missing)') + '</span>' +
        '<input type="number" value="' + (e.qty || 1) + '" min="1" style="width:62px" data-act="reward.qty" data-val="' + i + '">' +
        '<input type="number" value="' + Math.round((e.chance === undefined ? 1 : e.chance) * 100) +
          '" min="1" max="100" style="width:62px" data-act="reward.chance" data-val="' + i + '">' +
        '<span class="faint tiny">%</span>' +
        '<button class="xs ghost" data-act="reward.removeItem" data-val="' + i + '">remove</button></div>';
    }).join('') || ui.empty('No items.');

    var currencyRows = currencies.map(function (c) {
      var amt = (r.currencies || {})[c.id] || 0;
      return '<div class="row small" style="margin-top:5px">' +
        '<span class="faint tiny" style="width:110px">' + esc(c.name) + '</span>' +
        '<input type="number" value="' + amt + '" min="0" style="flex:1" data-act="reward.currency" data-val="' + c.id + '">' +
        '</div>';
    }).join('') || '<div class="tiny faint">No currencies defined. Create one in the Items tab.</div>';

    var axes = IT.rewardAxes(d, r);
    var axisChips = U.keys(axes).sort(function (a, b) { return axes[b] - axes[a]; })
      .map(function (k) {
        return ui.chip(PN.tax.AXIS_BY_ID[k] ? PN.tax.AXIS_BY_ID[k].name : k, 'good');
      }).join('') || '<span class="tiny faint">Feeds nothing yet.</span>';

    /* Experience is the one number in this editor with no scale
       attached to it. Fifty, five thousand and fifty thousand all look
       equally plausible written down, and which one is right depends
       entirely on a levelling curve set on another screen - so say
       what a level costs HERE, at the level the things granting this
       reward are actually for. */
    var refLevel = referenceLevel(d, r);
    var worth = PN.agents.xpWorth(d, r.xp || 0, refLevel);
    var sharePct = Math.round(worth.share * 100);
    var xpBody = (d.progression.model === 'rank' || d.progression.levelCap < 2)
      ? ui.number({ path: 'rewardSel.xp', label: 'Experience', value: r.xp,
          min: 0, max: 10000000 })
      : ui.rangeAct({ label: 'Share of a level', act: 'reward.xpShare', val: r.id,
          value: U.clamp(sharePct, 0, 300), min: 0, max: 300, suffix: '%',
          title: 'At level ' + refLevel + ', where the content granting this sits' })
        + ui.number({ path: 'rewardSel.xp', label: 'Experience', value: r.xp,
            min: 0, max: 10000000 })
        + '<div class="tiny faint" style="margin:-2px 0 10px;line-height:1.6">'
        + (r.xp > 0
            ? '<b style="color:var(--text)">' + U.fmtCompact(r.xp) + '</b> experience is '
              + sharePct + '% of a level at level ' + refLevel + ', where a level costs '
              + U.fmtCompact(Math.round(worth.levelCost)) + '. About '
              + (worth.perLevel > 999 ? '999+' : Math.max(1, Math.round(worth.perLevel)))
              + ' of these per level.'
            : 'No experience. At level ' + refLevel + ' a level costs '
              + U.fmtCompact(Math.round(worth.levelCost)) + '.')
        + '</div>';

    return ui.panel('Reward: ' + r.name, ''
      + ui.text({ path: 'rewardSel.name', label: 'Name', value: r.name })
      + xpBody
      + ui.number({ path: 'rewardSel.reputation', label: 'Reputation', value: r.reputation, min: 0, max: 100000 })
      + '<div class="tiny faint" style="margin:12px 0 6px;letter-spacing:.08em;text-transform:uppercase">Items</div>'
      + items
      + '<div class="row" style="margin-top:6px">' +
        '<select data-act="reward.pickItem" style="flex:1">' +
          (d.items || []).map(function (i) {
            return '<option value="' + i.id + '">' + esc(i.name) + '</option>'; }).join('') +
        '</select><button class="sm" data-act="reward.addItem">Add</button></div>'
      + '<div class="tiny faint" style="margin:14px 0 4px;letter-spacing:.08em;text-transform:uppercase">Currencies</div>'
      + currencyRows
      + '<div class="grid g2" style="margin-top:14px">'
      + ui.stat('Total value', Math.round(IT.rewardValue(d, r)), 'desirability')
      + ui.stat('Items', (r.items || []).length)
      + '</div>'
      + '<div class="row wrap" style="gap:4px;margin-top:10px">' + axisChips + '</div>',
      { actions: '<button class="sm danger" data-act="reward.remove" data-val="' + r.id + '">Delete</button>' });
  }

  PN.viewsCombat = {
    combatTab: combatTab, abilitiesTab: abilitiesTab, itemsTab: itemsTab,
    abilityEditor: abilityEditor, itemEditor: itemEditor,
    /* Shared with the slider action, so the handle and the readout
       are talking about the same level. */
    referenceLevel: referenceLevel
  };
})(PN);
