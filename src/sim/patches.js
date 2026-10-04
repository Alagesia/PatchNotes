/* Patch Notes - patches, versions and the release plan.

   The game is named after this file. A live MMO is not a design, it is a
   sequence of patches, and the interesting decision is never "ship it" -
   it is deciding six weeks ahead what the next release is FOR, then
   finding out whether you built enough of it in time.

   So a patch is planned first and shipped later. A plan holds a version
   bump, a name, notes, and the content the player intends to put in it.
   When its week comes round the plan ships whatever is actually finished
   and tells the truth about the rest.                                   */
(function (PN) {
  'use strict';
  var U = PN.util;

  /* ------------------------------------------------------------ versions

     Purely the player's own language for the size of a release - except
     that a major version is an expansion, and the game holds you to it. */
  var KINDS = [
    { id: 'patch', name: 'Small update', bump: 'patch', example: 'v1.0.X',
      desc: 'Bug fixes, tuning, a reward that should always have been there. Cheap, frequent, unglamorous.',
      minWork: 0, hypeMult: 0.22, lapsedPull: 0.04, needsName: false,
      /* Shipping anything costs something even when the content is
         free: a build, a pass over what it touched, and the nerve to
         put it in front of live players. "overhead" is that, in
         cap-weeks; "liveTax" is the same per hundred cap-weeks of
         game already out there, because regression-testing a big
         MMO costs more than regression-testing a small one. */
      overhead: 4, liveTax: 0.5 },
    { id: 'minor', name: 'Minor update', bump: 'minor', example: 'v1.X.0',
      desc: 'A content patch. A raid tier, a zone, a system. The backbone of a live game.',
      minWork: 25, hypeMult: 0.75, lapsedPull: 0.22, needsName: false,
      overhead: 14, liveTax: 1.5 },
    { id: 'major', name: 'Major update', bump: 'major', example: 'vX.0.0',
      desc: 'An expansion. Raises the ceiling, resets the treadmill, and gets its own name on a box.',
      minWork: 140, hypeMult: 2.4, lapsedPull: 1.0, needsName: true,
      overhead: 40, liveTax: 3 }
  ];
  var KIND_BY_ID = {};
  KINDS.forEach(function (k) { KIND_BY_ID[k.id] = k; });

  function versionString(v) {
    if (!v) return 'v0.1.0';
    return 'v' + (v.major || 0) + '.' + (v.minor || 0) + '.' + (v.patch || 0);
  }

  /* What the version WOULD read as if this plan shipped. Shown while
     planning, so the release history reads deliberately. */
  function nextVersion(current, kindId) {
    var v = { major: (current && current.major) || 0,
              minor: (current && current.minor) || 0,
              patch: (current && current.patch) || 0 };
    if (kindId === 'major') { v.major += 1; v.minor = 0; v.patch = 0; }
    else if (kindId === 'minor') { v.minor += 1; v.patch = 0; }
    else v.patch += 1;
    /* A live game is at least 1.0.0 - nobody launches on 0.x and admits it. */
    if (v.major === 0 && kindId !== 'patch') v.major = Math.max(v.major, 0);
    return v;
  }

  /* ---------------------------------------------------------- the plan --

     A plan is a date and a promise: the week you intend to ship, the size
     of the version bump, and a name if it is an expansion. It does NOT
     say what goes in it.

     This used to work the other way round. You declared "two zones and a
     raid" and shipping GENERATED that content into your game at random -
     so the one thing a patch could not do was describe the work you
     actually did, and the design grew things you never authored. Now the
     content of a release is simply everything you have built since the
     last one, and the notes are read off the difference.              */

  function newPlan(opts) {
    opts = opts || {};
    return {
      id: U.id('pch'),
      kind: opts.kind || 'minor',
      name: opts.name || '',
      notes: opts.notes || '',
      /* Absolute week the player intends to ship this. */
      targetWeek: opts.targetWeek === undefined ? 0 : opts.targetWeek,
      /* Ship the moment it is built rather than waiting for the date. */
      shipWhenReady: opts.shipWhenReady === undefined ? false : opts.shipWhenReady,
      auto: !!opts.auto,
      /* An automatic release is a tuning pass and nothing else - it may
         never invent content or touch a setting the player owns. */
      tuningOnly: !!opts.tuningOnly,
      /* What this release CHANGES, and the work banked towards it.
         Both belong to the release: a roadmap is several pieces of
         work, not one pile with several dates on it. */
      delta: opts.delta || blankDelta(),
      progress: opts.progress || { design: 0, art: 0, eng: 0, qa: 0 },
      status: 'planned'                  /* planned | shipped | abandoned */
    };
  }

  /* ============================================ what a release changes

     A studio with three releases on the board is authoring three sets
     of changes, not one pile. Which meant every one of these had to be
     true at once, and none of them were:

       - the work goes into the release being built, per release;
       - a change belongs to the release you had selected when you made
         it, and to no other;
       - an earlier release's changes are already in force for the
         later ones, so re-typing the same value into a later release
         does nothing and typing the old value back is a real revert;
       - with nothing planned, changing anything plans something.

     The first attempt tagged newly AUTHORED OBJECTS with a plan id,
     which covered adding a quest and covered nothing else - every
     slider, every retuned loot table, every renamed boss belonged to
     no release at all and leaked into whichever one shipped first.

     So a release does not hold a list of objects. It holds a DELTA: the
     difference between the game as it stands after everything planned
     before it, and the game as you want it after this one. Every kind
     of edit is the same kind of thing to a delta, which is why this
     works where tagging did not.                                     */

  /* A path addresses a field anywhere in a design. Plain keys are
     dotted; a member of a list of objects is `key#id`, because the big
     lists are keyed by id rather than by position - inserting a zone
     must not renumber the changes to every zone after it.

     The small nested lists have no ids: loot table entries, quest
     objectives, ability effects, reward lines, boss phases. Those are
     addressed by position as `key@3`, which is what makes retuning one
     drop chance record THAT drop chance instead of the whole table -
     and a whole-table change was a change that reverted whatever
     another release had done to any other row of it. */
  var PATH_SEP = '#', IDX_SEP = '@';

  function isKeyedList(v) {
    if (!Array.isArray(v) || !v.length) return false;
    for (var i = 0; i < v.length; i++) {
      if (!v[i] || typeof v[i] !== 'object' || v[i].id === undefined) return false;
    }
    return true;
  }
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function isRowList(v) {
    if (!Array.isArray(v) || !v.length) return false;
    for (var i = 0; i < v.length; i++) if (!isPlainObject(v[i])) return false;
    return true;
  }
  function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function blankDelta() { return { set: {}, add: {}, del: {} }; }
  function deltaEmpty(dl) {
    return !dl || (!U.keys(dl.set).length && !U.keys(dl.add).length &&
                   !U.keys(dl.del).length);
  }

  /* Everything that differs between two designs. */
  function deltaBetween(base, after) {
    var out = blankDelta();
    if (!base || !after) return out;
    walk(base, after, '');
    return out;

    function walk(a, b, prefix) {
      U.keys(b).forEach(function (k) {
        /* Bookkeeping the player never edits. */
        if (k === '__rev') return;
        var av = a ? a[k] : undefined, bv = b[k];
        var path = prefix ? prefix + '.' + k : k;

        if (isKeyedList(bv) || (isKeyedList(av) && Array.isArray(bv))) {
          var byId = {};
          (av || []).forEach(function (o) { byId[o.id] = o; });
          var seen = {};
          (bv || []).forEach(function (o) {
            seen[o.id] = 1;
            if (byId[o.id] === undefined) {
              (out.add[path] || (out.add[path] = [])).push(U.clone(o));
            } else {
              walk(byId[o.id], o, path + PATH_SEP + o.id);
            }
          });
          (av || []).forEach(function (o) {
            if (!seen[o.id]) (out.del[path] || (out.del[path] = [])).push(o.id);
          });
          return;
        }
        /* A list with no ids in it is addressed by position - but only
           while the two sides are the same shape. Once a row has been
           added or removed the positions mean different things, and
           the list is recorded whole. */
        if (isRowList(bv) && isRowList(av) && av.length === bv.length) {
          for (var ix = 0; ix < bv.length; ix++) {
            walk(av[ix], bv[ix], path + IDX_SEP + ix);
          }
          return;
        }
        if (isPlainObject(bv) && isPlainObject(av)) { walk(av, bv, path); return; }
        if (!sameValue(av, bv)) out.set[path] = U.clone(bv);
      });
    }
  }

  /* Walk a path and hand back the object holding its last key. Returns
     null when the path no longer leads anywhere - a change to a quest
     somebody has since deleted simply does not apply. */
  function resolve(root, path, make) {
    var parts = path.split('.');
    var node = root;
    for (var i = 0; i < parts.length - 1 && node; i++) {
      node = step(node, parts[i], make);
    }
    if (!node) return null;
    var last = parts[parts.length - 1];
    if (!splitPart(last)) return { obj: node, key: last };
    /* The last step is a list member, so there is no field to set. */
    return { obj: step(node, last, make), key: null };
  }

  /* `zones#z_vale` and `entries@3` - by id, or by position. */
  function splitPart(part) {
    for (var i = 0; i < part.length; i++) {
      var c = part.charAt(i);
      if (c === PATH_SEP || c === IDX_SEP) {
        return { key: part.slice(0, i), byId: c === PATH_SEP, ref: part.slice(i + 1) };
      }
    }
    return null;
  }

  function step(node, part, make) {
    var sp = splitPart(part);
    if (!sp) {
      if (node[part] === undefined && make) node[part] = {};
      return node[part];
    }
    var list = node[sp.key];
    if (!Array.isArray(list)) return null;
    return sp.byId ? U.byId(list, sp.ref) : list[parseInt(sp.ref, 10)];
  }

  /* Put a delta onto a design, giving back a new one. */
  function applyDelta(design, dl) {
    var out = U.clone(design);
    if (!dl) return out;
    /* Removals first, then additions, then field changes - so a field
       set on something this same release added still lands. */
    U.keys(dl.del || {}).forEach(function (path) {
      var list = listAt(out, path);
      if (!Array.isArray(list)) return;
      dl.del[path].forEach(function (id) { U.removeById(list, id); });
    });
    U.keys(dl.add || {}).forEach(function (path) {
      var list = listAt(out, path, true);
      if (!Array.isArray(list)) return;
      dl.add[path].forEach(function (o) {
        if (!U.byId(list, o.id)) list.push(U.clone(o));
      });
    });
    U.keys(dl.set || {}).forEach(function (path) {
      var t = resolve(out, path, true);
      if (!t || !t.obj || t.key === null) return;
      t.obj[t.key] = U.clone(dl.set[path]);
    });
    U.bumpDesign(out);
    return out;
  }

  function listAt(root, path, make) {
    var parts = path.split('.');
    var node = root;
    for (var i = 0; i < parts.length - 1 && node; i++) node = step(node, parts[i], make);
    if (!node) return null;
    var last = parts[parts.length - 1];
    if (node[last] === undefined && make) node[last] = [];
    return node[last];
  }

  /* ------------------------------------------------- reading the queue */

  function planOrder(title) {
    var out = {};
    plansInOrder(title).forEach(function (p, i) { out[p.id] = i; });
    return out;
  }

  /* Where a release sits in the queue, and where the back of it is.

     "The back" matters twice over: an unplanned edit has to land on a
     release that ships AFTER everything already on the board, and a
     release you plan by hand should join the end of the queue rather
     than cutting into the middle of it because its default lead time
     happened to be shorter. */
  function indexOf(title, plan) {
    var list = plansInOrder(title);
    for (var i = 0; i < list.length; i++) if (list[i].id === plan.id) return i;
    return -1;
  }
  function backWeek(title, lead) {
    var last = 0;
    plansInOrder(title).forEach(function (p) { last = Math.max(last, p.targetWeek); });
    return Math.max((title.week || 0) + lead, last + Math.max(1, lead));
  }

  /* ---------------------------------------------------- the stages

     Reading the roadmap means replaying it: what players have, then
     each release's delta in the order they ship. Stage N is the game
     after the first N releases, so stage 0 is what is live and the
     last stage is what the game becomes once the board is empty.

     Replaying clones the whole design, which is not something to do
     forty times per frame - so the stages are cached against a key
     that changes whenever anything that could move them does. The
     cached objects are SHARED and must not be written to; anything
     that keeps one takes a copy.                                   */
  var stageKey = null, stageCache = null, stageNonce = 0;

  function roadmapKey(title) {
    var parts = [stageNonce, title.activeTitleId || '', (title.released || []).length,
                 (title.shipped && title.shipped.__rev) || 0];
    (title.patchPlan || []).forEach(function (p) {
      parts.push(p.id + ':' + p.targetWeek + ':' + p.status);
    });
    return parts.join('|');
  }

  /* Anything that edits a delta, ships a release or replaces what
     players have says so here; everything else the stages depend on is
     in the key.

     Editing one release only moves the stages AFTER it, which matters:
     the draft is re-read against its own base after every keystroke,
     and throwing the whole replay away each time would clone the
     design once per release per edit. */
  function bumpRoadmap(fromIndex) {
    if (fromIndex === undefined || fromIndex === null || fromIndex < 0 || !stageCache) {
      stageNonce++; stageKey = null; stageCache = null;
      return;
    }
    U.keys(stageCache).forEach(function (k) {
      if (+k > fromIndex) delete stageCache[k];
    });
  }

  function stages(title) {
    var key = roadmapKey(title);
    if (key !== stageKey || !stageCache) { stageKey = key; stageCache = {}; }
    return stageCache;
  }

  function stageAt(title, n) {
    var cache = stages(title);
    if (cache[n]) return cache[n];
    var list = plansInOrder(title);
    if (n <= 0 || !list.length) {
      return (cache[0] = U.clone(title.shipped || title.design));
    }
    var idx = Math.min(n, list.length);
    return (cache[idx] = applyDelta(stageAt(title, idx - 1), list[idx - 1].delta));
  }

  /* Shared, read-only: the game as it stands after everything planned
     BEFORE this release. That is what an edit to it is measured
     against, which is what makes re-typing a value an earlier release
     already set into a change that does nothing. */
  function baseStage(title, plan) {
    if (!plan) return stageAt(title, (plansInOrder(title) || []).length);
    var i = indexOf(title, plan);
    return stageAt(title, i < 0 ? plansInOrder(title).length : i);
  }
  /* And after it ships. With no release named, that is the whole
     roadmap played out - which is what you are looking at when you
     have nothing selected. */
  function viewStage(title, plan) {
    if (!plan) return stageAt(title, (plansInOrder(title) || []).length);
    var i = indexOf(title, plan);
    return stageAt(title, i < 0 ? plansInOrder(title).length : i + 1);
  }

  /* The same two, as copies you may keep and edit. */
  function baseFor(title, plan) { return U.clone(baseStage(title, plan)); }
  function designFor(title, plan) { return U.clone(viewStage(title, plan)); }
  function finalDesign(title) { return U.clone(stageAt(title, plansInOrder(title).length)); }

  /* Record what the draft now says, as this release's delta. Called
     after every edit: the draft IS the selected release's design, so
     the difference between it and everything planned before is exactly
     what this release changes. */
  function captureInto(title, plan) {
    if (!plan) return null;
    plan.delta = deltaBetween(baseStage(title, plan), title.design);
    /* The stages behind this release have not moved, but everything in
       front of it has. */
    bumpRoadmap(indexOf(title, plan));
    return plan.delta;
  }

  /* Put a release's design on the state for the editors to bind to.

     Everything on every design screen binds to `state.design`, so
     switching which release you are authoring IS switching what that
     object is. With nothing selected it is the whole roadmap played
     out, because that is the game you would be changing. */
  function mountPlan(title, planId) {
    var plan = planId ? planById(title, planId) : null;
    if (plan && plan.status !== 'planned') plan = null;
    title.design = designFor(title, plan);
    /* The mounted design is a NEW object rather than an edited one, so
       the title record has to be told or the next save writes the one
       it still remembers. */
    if (PN.titles && PN.titles.stowField) PN.titles.stowField(title, 'design');
    return plan;
  }

  /* Which release the thing you just changed is FOR.

     Every design screen edits one object - the draft - and a studio
     with three releases on the board is authoring three sets of
     changes into it. So after every edit the draft is compared against
     the game as it will stand once everything planned BEFORE the
     selected release has shipped, and the difference IS that release.
     Which gives all four of the things that have to be true at once:

       - a change lands on the release you had selected, and no other;
       - an earlier release's changes are already in force, so typing a
         value it already set changes nothing and typing the old value
         back is a real revert;
       - nothing leaks into a release you were not looking at;
       - with nothing selected the draft is the whole roadmap played
         out, so a change to it is something NEW - and it goes onto a
         release at the BACK of the queue, never onto the one at the
         front, which would ship work you had not decided to ship.

     This lived in the UI, which is why three passes of tests never
     caught that it was wrong.                                       */
  function assign(title, planId) {
    if (!title || title.phase !== 'live' || !title.design) return null;
    var plan = planId ? planById(title, planId) : null;
    if (plan && plan.status !== 'planned') plan = null;
    if (!plan) {
      /* Nothing selected, so the draft is the whole roadmap played
         out - and a release is only worth planning if the draft has
         drifted from it. Renaming a release, starting a research
         project and a hundred other things pass through here without
         touching the design, and none of them should put a card on
         the board. */
      if (deltaEmpty(deltaBetween(stageAt(title, plansInOrder(title).length), title.design))) {
        return null;
      }
      plan = newPlan({ kind: 'patch', targetWeek: backWeek(title, 4), auto: true });
      (title.patchPlan || (title.patchPlan = [])).push(plan);
      if (PN.state && PN.state.log) {
        PN.state.log(title, 'patch', 'Small update planned automatically',
          'You changed the design with no release selected, so a small update was ' +
          'planned at the back of the roadmap to carry it. Move it, resize it, or ' +
          'select a different release and change it there instead.', { plan: plan.id });
      }
    }
    captureInto(title, plan);
    return plan;
  }

  /* A game saved before a release held its own changes.

     A release used to be "everything authored since the last one",
     banked against one pool on the title - which is why work towards
     the release at the front read as progress on the third one down,
     and why a slider you moved belonged to no release at all and went
     out with whichever one shipped next. So a save arrives with
     neither a delta nor a pool on any of its releases.

     Everything it has accumulated goes to the release at the FRONT of
     its roadmap, because that is where the old rules would have
     shipped it, and the banked work goes with it. Nothing is lost and
     nothing changes release. */
  function adopt(title, week) {
    function blank() { return { design: 0, art: 0, eng: 0, qa: 0 }; }
    var plans = plansInOrder(title);
    var live = title.phase === 'live' && title.shipped;
    if (plans.length && !plans.some(function (p) { return !p.delta || !p.progress; })) {
      return false;
    }
    plans.forEach(function (p, i) {
      if (!p.progress) p.progress = i === 0 ? U.merge(blank(), title.progress || {}) : blank();
      if (!p.delta) {
        p.delta = i === 0 && live ? deltaBetween(title.shipped, title.design) : blankDelta();
      }
    });
    /* A live game holding edits with nothing on the board was holding
       work no release would ever carry. It gets one. */
    if (!plans.length && live) {
      var dl = deltaBetween(title.shipped, title.design);
      if (deltaEmpty(dl)) return false;
      var made = newPlan({ kind: 'patch', targetWeek: (week || title.week || 0) + 4, auto: true });
      made.delta = dl;
      made.progress = U.merge(blank(), title.progress || {});
      (title.patchPlan || (title.patchPlan = [])).push(made);
      plans = [made];
    }
    /* Emptied in place, not replaced: a save hands the mounted game
       and its record back as two names for the same pool, and swapping
       one of them for a fresh object leaves the other still holding
       the work that has just been handed to a release. */
    if (plans.length) {
      if (!title.progress) title.progress = blank();
      ['design', 'art', 'eng', 'qa'].forEach(function (k) { title.progress[k] = 0; });
    }
    bumpRoadmap();
    return true;
  }

  /* How much is being held back from this release for a later one. */
  function deltaSize(dl) {
    if (!dl) return 0;
    var n = U.keys(dl.set || {}).length;
    U.keys(dl.add || {}).forEach(function (k) { n += dl.add[k].length; });
    U.keys(dl.del || {}).forEach(function (k) { n += dl.del[k].length; });
    return n;
  }
  function heldBack(title, plan) {
    var mine = plan ? indexOf(title, plan) : -1;
    var n = 0;
    plansInOrder(title).forEach(function (p, i) {
      if (i > mine) n += deltaSize(p.delta);
    });
    return n;
  }
  /* ------------------------------------------------------- what is due --

     Everything authored since the last release, and what it costs to
     build. This is the real content of the next patch.                */

  function pendingDiff(state, plan) {
    return PN.diff.compare(state.shipped,
      plan ? viewStage(state, plan) : state.design);
  }

  /* What THIS release adds, as opposed to what it carries.

     A release ships everything marked for it or earlier, so reading a
     plan against what players have gives every card on the roadmap the
     one before it as well - plan a second patch and its content list
     opened with a copy of the first one's. That reading is literally
     true and completely useless: what a producer wants off a card is
     what that release is FOR. So a card is measured against the
     release before it on the board. */
  function previousPlan(title, plan) {
    var list = plansInOrder(title);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === plan.id) return i > 0 ? list[i - 1] : null;
    }
    return null;
  }

  function planDiff(state, plan) {
    if (!plan) return pendingDiff(state);
    return PN.diff.compare(baseStage(state, plan), viewStage(state, plan));
  }

  /* And what it adds on top of the one before, in capacity-weeks. */
  function planCost(state, plan) {
    var met = PN.metrics;
    var kind = KIND_BY_ID[(plan || {}).kind] || KIND_BY_ID.minor;
    var base = met.buildCost(plan ? baseStage(state, plan)
                                  : (state.shipped || state.design));
    var now = met.buildCost(plan ? viewStage(state, plan) : state.design);
    var over = state.phase === 'live' ? releaseOverhead(state, kind)
                                      : { design: 0, art: 0, eng: 0, qa: 0 };
    var out = {};
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      out[k] = Math.max(0, (now[k] || 0) - (base[k] || 0)) + (over[k] || 0);
    });
    return out;
  }

  /* Which plan the next release is, for pricing purposes: the first one
     still planned, or a small update if the player has not planned one. */
  function nextKind(state) {
    var planned = (state.patchPlan || []).filter(function (p) {
      return p.status === 'planned'; })
      .sort(function (a, b) { return a.targetWeek - b.targetWeek; })[0];
    return KIND_BY_ID[(planned || {}).kind] || KIND_BY_ID.patch;
  }

  /* Shipping is never free. A release costs a build, a pass over
     everything it touched, and the nerve to put it in front of live
     players - before any of the new content is counted.

     It scales with the game already out there, because regression-testing
     a four-hundred cap-week MMO is not the same job as testing a
     forty-cap-week one. Most of it lands on engineering and QA, which is
     where shipping actually happens.                                 */
  var OVERHEAD_SHARE = { design: 0.15, art: 0.15, eng: 0.3, qa: 0.4 };

  function releaseOverhead(state, kind) {
    kind = kind || nextKind(state);
    var met = PN.metrics;
    var live = state.shipped ? met.buildCost(state.shipped)
                             : { design: 0, art: 0, eng: 0, qa: 0 };
    var size = (live.design || 0) + (live.art || 0) + (live.eng || 0) + (live.qa || 0);
    var total = (kind.overhead || 0) + (size / 100) * (kind.liveTax || 0);
    var out = {};
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      out[k] = total * OVERHEAD_SHARE[k];
    });
    return out;
  }

  /* Capacity-weeks between what players have and what you have authored,
     plus what it costs to ship at all.
     Negative deltas - content you deleted - do not refund work. */
  function pendingCost(state, kind, plan) {
    var met = PN.metrics;
    /* Only what THIS release carries. Content held back for a later
       one is work you have not committed to yet, and pricing it here
       made the next patch look unaffordable because of a quest you
       scheduled for three months' time. */
    var now = met.buildCost(plan ? viewStage(state, plan) : state.design);
    var live = state.shipped ? met.buildCost(state.shipped)
                             : { design: 0, art: 0, eng: 0, qa: 0 };
    var over = state.phase === 'live' ? releaseOverhead(state, kind)
                                      : { design: 0, art: 0, eng: 0, qa: 0 };
    var out = {};
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      out[k] = Math.max(0, (now[k] || 0) - (live[k] || 0)) + (over[k] || 0);
    });
    return out;
  }

  /* What is new in this release, without the cost of shipping it. This is
     the number that decides whether a plan is big enough to be called an
     expansion - overhead is not content. */
  function pendingContent(state, plan) {
    var met = PN.metrics;
    var now = met.buildCost(plan ? viewStage(state, plan) : state.design);
    var live = state.shipped ? met.buildCost(state.shipped)
                             : { design: 0, art: 0, eng: 0, qa: 0 };
    var total = 0;
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      total += Math.max(0, (now[k] || 0) - (live[k] || 0));
    });
    return total;
  }

  /* What THIS release adds on top of the one before it, without the
     cost of shipping it. A card on the roadmap is about its own
     release: reading it against what players have gave the second
     patch on the board the first one's content as well. */
  function planContent(state, plan) {
    if (!plan) return pendingContent(state, null);
    var met = PN.metrics;
    var base = met.buildCost(baseStage(state, plan));
    var now = met.buildCost(viewStage(state, plan));
    var total = 0;
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      total += Math.max(0, (now[k] || 0) - (base[k] || 0));
    });
    return total;
  }

  function pendingWork(state, kind, plan) {
    var c = pendingCost(state, kind, plan);
    return c.design + c.art + c.eng + c.qa;
  }

  /* What fraction of the outstanding work the studio has actually banked.
     A release you have not paid for is not ready, rather than arriving
     smaller - because the content already exists in your design. */
  function funded(state, plan) {
    /* Naming no release used to mean "the whole draft against the
       title's pool", which a live game stopped filling the moment
       releases started banking their own work - so it quietly
       answered 0% to anything that forgot to say which release it
       meant. On a live game, no release named means the one being
       built. */
    if (!plan && state.phase === 'live') plan = nextPlan(state);
    var need = plan ? planCost(state, plan) : pendingCost(state, null, null);
    var have = progressOf(state, plan);
    var worst = 1;
    ['design', 'art', 'eng', 'qa'].forEach(function (k) {
      if (need[k] <= 0.001) return;
      worst = Math.min(worst, U.clamp01((have[k] || 0) / need[k]));
    });
    return worst;
  }

  /* --------------------------------------------- work, banked per plan

     Capacity used to go into one pool on the title, so three releases
     on the board all read the same percentage: work done towards the
     first one showed as progress on the third. A release is a piece of
     work, and a piece of work has its own progress.                  */
  function progressOf(state, plan) {
    if (!plan) return state.progress || { design: 0, art: 0, eng: 0, qa: 0 };
    if (!plan.progress) plan.progress = { design: 0, art: 0, eng: 0, qa: 0 };
    return plan.progress;
  }

  /* This week's capacity, poured into the roadmap in order.

     The release at the front is the one being built. When it has
     everything it needs the rest flows to the next one, which is what
     a team does when a patch is finished and the date is still a
     fortnight off. */
  function creditWork(state, amount) {
    var pools = ['design', 'art', 'eng', 'qa'];
    var left = {};
    pools.forEach(function (k) { left[k] = amount[k] || 0; });
    var list = plansInOrder(state);
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var have = progressOf(state, p);
      var need = planCost(state, p);
      var spare = false;
      pools.forEach(function (k) {
        var room = Math.max(0, (need[k] || 0) - (have[k] || 0));
        var give = Math.min(room, left[k]);
        have[k] = (have[k] || 0) + give;
        left[k] -= give;
        if (left[k] > 0.0001) spare = true;
      });
      if (!spare) return;
    }
    /* Nothing planned, or everything on the board is already paid for:
       it banks on the title, which is where it went before there were
       plans at all. */
    if (!state.progress) state.progress = { design: 0, art: 0, eng: 0, qa: 0 };
    pools.forEach(function (k) { state.progress[k] += left[k]; });
  }

  /* Is there enough here to justify the version bump the player chose?
     Calling a tuning pass an expansion is the lie the game will not let
     you tell without saying so. */
  function planIssues(state, plan) {
    var out = [];
    var kind = KIND_BY_ID[plan.kind] || KIND_BY_ID.minor;
    /* About THIS release. These used to read the whole draft against
       what players have, so three cards on the board all warned about
       the same work and all quoted the same percentage. */
    var diff = planDiff(state, plan);
    /* "Is this big enough to be an expansion" is a question about
       content. The cost of shipping is not content. */
    var work = planContent(state, plan);
    if (kind.needsName && !String(plan.name).trim())
      out.push('A major update is an expansion. It needs a name.');
    if (diff.empty)
      out.push('Nothing has changed since the last release - there is no patch here.');
    else {
      var suggested = PN.diff.suggestKind(diff);
      var rank = { patch: 0, minor: 1, major: 2 };
      if (rank[plan.kind] > rank[suggested])
        out.push('This is ' + KIND_BY_ID[suggested].name.toLowerCase() +
                 '-sized work under a ' + kind.name.toLowerCase() + ' label.');
      if (rank[plan.kind] < rank[suggested])
        out.push('There is ' + KIND_BY_ID[suggested].name.toLowerCase() +
                 '-sized work here under a ' + kind.name.toLowerCase() + ' label.');
    }
    var built = funded(state, plan);
    if (work > 0 && built < 0.999)
      out.push(Math.round(built * 100) + '% built - the studio has not finished it yet.');
    if (!String(plan.notes).trim())
      out.push('No patch notes written - the game will write them from your changes.');
    return out;
  }

  function planById(title, id) { return U.byId(title.patchPlan || [], id); }

  function plansInOrder(title) {
    return (title.patchPlan || []).slice()
      .filter(function (p) { return p.status === 'planned'; })
      .sort(function (a, b) { return a.targetWeek - b.targetWeek; });
  }
  function nextPlan(title) { return plansInOrder(title)[0] || null; }

  /* What every planned release will be NUMBERED, read down the roadmap
     in the order they ship.

     Each card used to work its own version out from the one currently
     live, so three planned minor patches all announced themselves as
     the same version and the roadmap could not be read as a sequence.
     A version is a consequence of everything shipping before it. */
  function projectedVersions(title) {
    var v = title.version || { major: 0, minor: 0, patch: 0 };
    var out = {};
    plansInOrder(title).forEach(function (p) {
      v = nextVersion(v, p.kind);
      if (v.major === 0 && title.phase === 'live') v = U.merge(v, { major: 1 });
      out[p.id] = v;
    });
    return out;
  }

  /* Move a planned release up or down the roadmap.

     Order is the ship date, so reordering is swapping dates with the
     neighbour - and because the version numbers are read down the list,
     they renumber themselves. Two releases can share a week, so a plan
     that would land on top of its neighbour is nudged clear. */
  function reorder(title, id, dir) {
    var list = plansInOrder(title);
    var i = -1;
    for (var n = 0; n < list.length; n++) if (list[n].id === id) i = n;
    var j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= list.length) return false;
    var a = list[i], b = list[j];
    var aw = a.targetWeek, bw = b.targetWeek;
    if (aw === bw) { if (dir < 0) aw -= 1; else bw -= 1; }
    a.targetWeek = bw; b.targetWeek = aw;
    return true;
  }

  /* ------------------------------------------------------------- notes --

     A patch that ships with no notes still needs notes, so the game can
     write them - from the difference between what players have and what
     you built, which is the only honest version anyway.               */
  function autoNotes(state, plan) {
    /* What this release is, not what the whole draft is. Writing the
       notes for a second planned patch used to hand you the first
       one's notes, because the diff behind them ignored which release
       was being written about. */
    var diff = planDiff(state, plan);
    var kind = KIND_BY_ID[plan.kind] || KIND_BY_ID.minor;
    var head = kind.id === 'major'
      ? (plan.name || 'The expansion') + ' is live.'
      : kind.id === 'minor' ? 'Content update.' : 'Maintenance and tuning.';
    if (diff.empty) return head + ' No player-facing changes.';
    return head + '\n\n' + PN.diff.toText(diff);
  }

  /* ------------------------------------------------------- tuning pass --

     What an automatic release is allowed to be. It never invents content
     and never touches a setting the player owns: it nudges the balance
     numbers, which is what a real maintenance patch does. Returns the
     lines it changed so the notes can say so.                        */
  var TUNING = [
    { path: 'stats.critBonus',           step: 1.5,  min: 40,  max: 260 },
    { path: 'stats.healthPerLevel',      step: 0.4,  min: 6,   max: 90 },
    { path: 'stats.powerPerLevel',       step: 0.06, min: 0.6, max: 14 },
    { path: 'progression.catchUp',       step: 1.2,  min: 0,   max: 100 },
    { path: 'economy.faucetRate',        step: 0.8,  min: 0,   max: 100 },
    { path: 'gearing.resetSeverity',     step: -0.6, min: 0,   max: 100 },
    { path: 'liveOps.hotfixSpeed',       step: 0.9,  min: 0,   max: 100 }
  ];

  function applyTuning(design, strength) {
    var moved = [];
    var s = strength === undefined ? 1 : strength;
    TUNING.forEach(function (t) {
      var parts = t.path.split('.');
      var obj = design;
      for (var i = 0; i < parts.length - 1; i++) {
        obj = obj && obj[parts[i]];
      }
      if (!obj) return;
      var key = parts[parts.length - 1];
      var was = obj[key];
      if (typeof was !== 'number') return;
      var next = U.clamp(was + t.step * s, t.min, t.max);
      if (Math.abs(next - was) < 0.005) return;
      obj[key] = U.round(next, 2);
      moved.push(t.path);
    });
    return moved;
  }

  PN.patches = {
    KINDS: KINDS, KIND_BY_ID: KIND_BY_ID,
    versionString: versionString, nextVersion: nextVersion,
    newPlan: newPlan, planById: planById,
    plansInOrder: plansInOrder, nextPlan: nextPlan,
    projectedVersions: projectedVersions, reorder: reorder,
    /* The delta engine: what a release changes, and reading the
       roadmap forwards from what players have. */
    deltaBetween: deltaBetween, applyDelta: applyDelta, deltaEmpty: deltaEmpty,
    baseFor: baseFor, designFor: designFor, finalDesign: finalDesign,
    baseStage: baseStage, viewStage: viewStage,
    captureInto: captureInto, mountPlan: mountPlan, assign: assign, adopt: adopt,
    heldBack: heldBack, planOrder: planOrder, deltaSize: deltaSize,
    bumpRoadmap: bumpRoadmap, blankDelta: blankDelta,
    indexOf: indexOf, backWeek: backWeek,
    progressOf: progressOf, creditWork: creditWork,
    pendingDiff: pendingDiff, planDiff: planDiff, planCost: planCost,
    previousPlan: previousPlan,
    pendingCost: pendingCost, pendingWork: pendingWork,
    pendingContent: pendingContent, planContent: planContent,
    releaseOverhead: releaseOverhead, nextKind: nextKind,
    funded: funded, planIssues: planIssues, autoNotes: autoNotes,
    TUNING: TUNING, applyTuning: applyTuning
  };
})(window.PN);
