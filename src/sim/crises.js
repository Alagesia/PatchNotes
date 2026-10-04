/* Patch Notes - crises written out of your own design.

   An event used to be a fixed string that arrived when a global number
   crossed a line. This turns a cause - which knows the material with no
   sink, the build that owns the ladder, the profession that is a dead
   end - into the crisis that names it, and into options that act on
   those specific objects rather than nudging a global dial.

   So "Emergency maintenance" does not abstractly reduce exploit
   pressure. It changes the thing that caused it, by id, on the live
   build and on your draft, and the patch notes read accordingly.    */
(function (PN) {
  'use strict';
  var U = PN.util, St = PN.state;

  function fx(state, o) { return PN.events.fx(state, o); }
  function hotfix(state, fn) { return PN.events.hotfix(state, fn); }
  function opt(label, detail, apply) { return { label: label, detail: detail, apply: apply }; }

  /* ------------------------------------------------------------ helpers */

  /* Find a subject of a kind on the cause. */
  function subj(c, kind) {
    for (var i = 0; i < (c.subjects || []).length; i++) {
      if (c.subjects[i].kind === kind) return c.subjects[i];
    }
    return null;
  }
  function subjects(c, kind) {
    return (c.subjects || []).filter(function (s) { return s.kind === kind; });
  }

  /* Tune a named build's branch, which is how you nerf a specific thing
     rather than "the game". */
  function tuneBranch(state, playableId, delta) {
    hotfix(state, function (d) {
      var br = ((d.talents || {}).branches || []).filter(function (b) {
        return b.id === playableId; })[0];
      if (br) { br.tuning = U.clamp((br.tuning || 0) + delta, -40, 40); return; }
      var cls = (d.classes || []).filter(function (c) { return c.id === playableId; })[0];
      if (cls) cls.tuning = U.clamp((cls.tuning || 0) + delta, -40, 40);
    });
  }

  /* Give a material a reason to exist, by raising its drop weight
     wherever it already appears. */
  function bumpDrop(state, itemId, mult) {
    hotfix(state, function (d) {
      (d.lootTables || []).forEach(function (t) {
        (t.entries || []).forEach(function (e) {
          if (e.itemId === itemId) e.weight = Math.max(1, Math.round((e.weight || 1) * mult));
        });
      });
    });
  }

  /* ---------------------------------------------------------- the writers

     One per cause id. Each returns { title, body, options, defaultOption }
     with the cause's own nouns in it.                                  */

  var WRITERS = {

    inflation: function (c, state) {
      var cur = subj(c, 'currency');
      return {
        options: [
          opt('Put a sink in', 'Repair bills, a higher auction cut, and a gold cost on the ' +
              'things people already do. Unpopular, and it works.',
            function (s) {
              hotfix(s, function (d) {
                d.economy.sinkRate = U.clamp100(d.economy.sinkRate + 18);
                d.economy.auctionTax = U.clamp(d.economy.auctionTax + 3, 0, 25);
                d.economy.vendorRepair = true;
              });
              fx(s, { sentiment: -7 });
            }),
          opt('Turn the taps down', 'Cut what monsters and quests hand out. Everybody notices ' +
              'within a day and nobody thanks you for it.',
            function (s) {
              hotfix(s, function (d) {
                d.economy.faucetRate = U.clamp100(d.economy.faucetRate - 14); });
              fx(s, { sentiment: -11 });
            }),
          opt('Leave it', (cur ? cur.name : 'The currency') + ' is only worth what people ' +
              'will trade for it. New players will manage.',
            function (s) { fx(s, { sentiment: -4, botPressure: 8 }); })
        ],
        defaultOption: 2
      };
    },

    goldSellers: function (c, state) {
      var mats = subjects(c, 'material');
      return {
        options: [
          opt('Ban wave, and say so', 'Thousands of accounts in one morning, some of them ' +
              'wrong. Make it loud enough that it reads as a policy.',
            function (s) { fx(s, { botPressure: -34, sentiment: 6, popPct: -0.008, cash: -40000 }); }),
          opt('Buy the detection', 'Slower, quieter, and it holds.',
            function (s) {
              fx(s, { botPressure: -16, cash: -180000, sentiment: 2 });
              hotfix(s, function (d) {
                d.economy.antiRmtSpend = U.clamp100(d.economy.antiRmtSpend + 22); });
            }),
          opt('Thin out the nodes they camp',
            mats.length ? 'Spread ' + mats[0].name + ' thinner so a farm route is worth less.'
                        : 'Spread the gathering nodes out.',
            function (s) {
              hotfix(s, function (d) {
                d.economy.gatheringNodes = U.clamp100(d.economy.gatheringNodes - 15); });
              fx(s, { botPressure: -10, sentiment: -5 });
            })
        ],
        defaultOption: 2
      };
    },

    balance: function (c, state) {
      var over = subj(c, 'build');
      var unders = subjects(c, 'build').filter(function (s) { return s.dir === 'up'; });
      var under = unders[0];
      return {
        options: [
          opt('Nerf ' + (over ? over.name : 'the outlier'),
            'Take it down where it is ahead. The people playing it will be furious ' +
            'and they will be right that you let it ship.',
            function (s) {
              if (over) tuneBranch(s, over.playableId, -12);
              fx(s, { sentiment: -6, reputation: 2 });
            }),
          opt('Bring ' + (under ? under.name : 'the rest') + ' up',
            'Buff the bottom instead. Nobody loses anything, and the numbers all ' +
            'go up for ever.',
            function (s) {
              if (under) tuneBranch(s, under.playableId, 10);
              fx(s, { sentiment: 4, techDebt: 6 });
            }),
          opt('Say it is working as intended', 'Ride it out until the next tier resets ' +
              'everything anyway.',
            function (s) { fx(s, { sentiment: -9, reputation: -3 }); })
        ],
        defaultOption: 2
      };
    },

    deadProfession: function (c, state) {
      var profs = subjects(c, 'profession');
      return {
        options: [
          opt('Put the reagents in the world',
            'Add the missing materials to drop tables so the recipes can be made.',
            function (s) {
              hotfix(s, function (d) {
                PN.crafting.recipes(d).forEach(function (r) {
                  if (!profs.some(function (p) { return p.id === r.profession; })) return;
                  (r.inputs || []).forEach(function (i) {
                    var m = PN.items.itemById(d, i.itemId);
                    if (m && PN.items.isOrphan(d, m)) {
                      m.sources = m.sources || {};
                      m.sources.gather = true;
                    }
                  });
                });
              });
              fx(s, { sentiment: 5, progress: { design: -4, eng: -2 } });
            }),
          opt('Pull the profession', 'Take it out rather than ship a dead end.',
            function (s) {
              hotfix(s, function (d) {
                PN.crafting.recipes(d).forEach(function (r) {
                  if (profs.some(function (p) { return p.id === r.profession; })) r.enabled = false;
                });
              });
              fx(s, { sentiment: -6 });
            }),
          opt('Leave it', 'It is one tab in a menu.',
            function (s) { fx(s, { sentiment: -7, reputation: -2 }); })
        ],
        defaultOption: 2
      };
    },

    unreachableLoot: function (c, state) {
      var items = subjects(c, 'item');
      return {
        options: [
          opt('Put them somewhere', 'Make them vendor stock so at least they exist.',
            function (s) {
              hotfix(s, function (d) {
                items.forEach(function (it) {
                  var item = PN.items.itemById(d, it.id);
                  if (!item) return;
                  item.sources = item.sources || {};
                  item.sources.vendor = true;
                  if (!item.vendorValue) item.vendorValue = Math.max(5, (item.itemLevel || 10));
                });
              });
              fx(s, { sentiment: 4, progress: { design: -3 } });
            }),
          opt('Say they are for a future patch', 'Buy yourself a tier to place them properly.',
            function (s) { fx(s, { sentiment: 1, reputation: -1 }); }),
          opt('Say nothing', 'It is a datamine. Most players will never see the thread.',
            function (s) { fx(s, { sentiment: -5 }); })
        ],
        defaultOption: 1
      };
    },

    queues: function (c, state) {
      return {
        options: [
          opt('Buy the hardware', 'Over-provision now and eat the bill.',
            function (s) {
              hotfix(s, function (d) {
                d.infra.capacityHeadroom = U.clamp100(d.infra.capacityHeadroom + 25); });
              fx(s, { cash: -420000, queuePressure: -45, sentiment: 5 });
            }),
          opt('Open more realms', 'Cheaper, and it splits the population you spent ' +
              'two years making feel like one place.',
            function (s) {
              hotfix(s, function (d) { d.infra.regions = Math.min(8, d.infra.regions + 1); });
              fx(s, { queuePressure: -30, sentiment: -2, cash: -120000 });
            }),
          opt('Let them queue', 'It is a good problem. It will not look like one in a week.',
            function (s) { fx(s, { sentiment: -13, popPct: -0.025 }); })
        ],
        defaultOption: 2
      };
    },

    drought: function (c, state) {
      return {
        options: [
          opt('Say what is coming', 'Put a roadmap out. It costs nothing and it buys ' +
              'you weeks, once.',
            function (s) {
              fx(s, { sentiment: 9, reputation: -2 });
              s._roadmapPromised = s.week;
            }),
          opt('Run something on the calendar', 'Bring a live event forward. It is not ' +
              'new content, but it is a reason to log in.',
            function (s) {
              fx(s, { sentiment: 5, progress: { art: -6, design: -3 } });
              s.runtime.weeksSinceContent = Math.max(0, s.runtime.weeksSinceContent - 6);
            }),
          opt('Keep your head down', 'Ship when it is ready and not before.',
            function (s) { fx(s, { sentiment: -6 }); })
        ],
        defaultOption: 2
      };
    },

    ladderDominance: function (c, state) {
      var p = subj(c, 'playable');
      return {
        options: [
          opt('Tune ' + (p ? p.name : 'it') + ' down for PvP',
            'A targeted pass on the thing that is winning.',
            function (s) {
              if (p) tuneBranch(s, p.id, -10);
              fx(s, { sentiment: -3, reputation: 3 });
            }),
          opt('Take gear out of it', 'Drop how much gear decides a match, so the ladder ' +
              'is about the build rather than the loot.',
            function (s) {
              hotfix(s, function (d) {
                d.pvp.gearPower = U.clamp(d.pvp.gearPower - 20, 0, 100); });
              fx(s, { sentiment: 6 });
            }),
          opt('Leave it to the season reset', 'It will look different in a month.',
            function (s) { fx(s, { sentiment: -8 }); })
        ],
        defaultOption: 2
      };
    },

    bugs: function (c, state) {
      return {
        options: [
          opt('Stop the line', 'Everybody on fixes for a fortnight. Nothing new ships.',
            function (s) {
              fx(s, { bugLoad: -30, sentiment: 6, progress: { design: -8, art: -6, eng: -10 } });
            }),
          opt('Use the PTR properly', 'Slow the pipeline down so the next one does not ' +
              'do this.',
            function (s) {
              hotfix(s, function (d) {
                d.liveOps.ptrUse = U.clamp100(d.liveOps.ptrUse + 25); });
              fx(s, { bugLoad: -10, sentiment: 2 });
            }),
          opt('Hotfix the loud ones', 'Fix what is on the front page and let the rest sit.',
            function (s) { fx(s, { bugLoad: -12, techDebt: 10, sentiment: -2 }); })
        ],
        defaultOption: 2
      };
    },

    materialGlut: function (c, state) {
      var mats = subjects(c, 'material');
      var first = mats[0];
      return {
        options: [
          opt('Write a recipe that eats it',
            'Give ' + (first ? first.name : 'it') + ' something to be for.',
            function (s) { fx(s, { sentiment: 5, progress: { design: -5 } }); }),
          opt('Stop it dropping so hard',
            'Thin it out until it is worth picking up again.',
            function (s) {
              mats.forEach(function (m) { bumpDrop(s, m.id, 0.4); });
              fx(s, { sentiment: -2 });
            }),
          opt('Leave it', 'Every MMO has a vendor-trash tier.',
            function (s) { fx(s, { sentiment: -3 }); })
        ],
        defaultOption: 2
      };
    }
  };

  /* --------------------------------------------------------------- roll

     One crisis a week at most, drawn from what is actually wrong. The
     worse a thing is, the likelier it is to be the thing that lands. */
  function roll(state, rng, ctx) {
    var out = [];
    if (state.phase !== 'live') return out;
    state._crisisCooldown = state._crisisCooldown || {};

    var causes = PN.causes.find(state, ctx).filter(function (c) {
      if (!WRITERS[c.id]) return false;
      var cd = state._crisisCooldown[c.id];
      /* A crisis you just handled does not come back next week. */
      return !cd || (state.week - cd) >= 14;
    });
    if (!causes.length) return out;

    var pick = rng.weighted(causes, function (c) { return c.severity; });
    if (!pick) return out;
    /* Even a bad problem is not a headline every single week. */
    if (!rng.chance(U.clamp01(pick.severity * 0.55))) return out;

    var written = WRITERS[pick.id](pick, state);
    state._crisisCooldown[pick.id] = state.week;

    var ev = {
      id: pick.id + ':' + state.week,
      defId: pick.id,
      kind: pick.kind,
      title: pick.title,
      body: pick.body,
      /* The half that did not exist before: what in YOUR design did this. */
      why: pick.why,
      severity: pick.severity,
      options: written.options,
      defaultOption: written.defaultOption === undefined ? 0 : written.defaultOption,
      week: state.week,
      expires: state.week + 2
    };
    state.pendingEvents.push(ev);
    St.log(state, pick.kind === 'economy' ? 'economy' : pick.kind === 'ops' ? 'ops' : 'community',
      pick.title, pick.body + (pick.why.length ? '  (' + pick.why.join('; ') + ')' : ''),
      { event: pick.id });
    out.push(ev);
    return out;
  }

  PN.crises = { roll: roll, WRITERS: WRITERS };
})(PN);
