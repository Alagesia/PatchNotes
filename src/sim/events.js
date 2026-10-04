/* Patch Notes - live-service events.
   Crises with no clean answer. Each option costs something real.
   Events with choices sit in the queue for two weeks, then resolve to
   their default - because not deciding is also a decision.              */
(function (PN) {
  'use strict';
  var U = PN.util, St = PN.state;

  /* Apply a bundle of deltas to runtime / studio / finance. */
  function fx(state, o) {
    var rt = state.runtime, s = state.studio;
    if (o.bugLoad) rt.bugLoad = U.clamp(rt.bugLoad + o.bugLoad, 0, 100);
    if (o.techDebt) rt.techDebt = U.clamp(rt.techDebt + o.techDebt, 0, 200);
    if (o.sentiment) rt.sentiment = U.clamp100(rt.sentiment + o.sentiment);
    if (o.awareness) rt.awareness = U.clamp100(rt.awareness + o.awareness);
    if (o.botPressure) rt.botPressure = U.clamp100(rt.botPressure + o.botPressure);
    if (o.exploitPressure) rt.exploitPressure = U.clamp100(rt.exploitPressure + o.exploitPressure);
    if (o.outage) rt.outage = U.clamp(rt.outage + o.outage, 0, 100);
    if (o.queuePressure) rt.queuePressure = U.clamp100(rt.queuePressure + o.queuePressure);
    if (o.reviewScore) rt.reviewScore = U.clamp100(rt.reviewScore + o.reviewScore);
    if (o.cash) s.cash += o.cash;
    if (o.reputation) s.reputation = U.clamp100(s.reputation + o.reputation);
    if (o.morale) s.staff.forEach(function (st) { st.morale = U.clamp100(st.morale + o.morale); });
    /* Banked capacity belongs to the release being built, not to the
       studio and not to a pool every release on the board reads. A
       good week pours into the roadmap the same way a week of work
       does; a bad one comes off the release the team is on. */
    if (o.progress) {
      var pc = PN.patches, pools = ['design', 'art', 'eng', 'qa'];
      var gain = {}, any = false;
      pools.forEach(function (k) { if ((o.progress[k] || 0) > 0) { gain[k] = o.progress[k]; any = true; } });
      if (any) pc.creditWork(state, gain);
      var pot = pc.progressOf(state, state.phase === 'live' ? pc.nextPlan(state) : null);
      pools.forEach(function (k) {
        if ((o.progress[k] || 0) < 0) pot[k] = Math.max(0, (pot[k] || 0) + o.progress[k]);
      });
    }
    /* Direct population hit, applied proportionally. */
    if (o.popPct) {
      state.population.cohorts.forEach(function (c) { c.size *= (1 + o.popPct); });
      state.population.total = U.sum(state.population.cohorts, function (c) { return c.size; });
    }
  }

  /* Edit both the live build and the draft, for emergency changes that
     genuinely go out the same day.                                     */
  function hotfix(state, fn) {
    if (state.shipped) fn(state.shipped);
    fn(state.design);
  }

  function opt(label, detail, apply) { return { label: label, detail: detail, apply: apply }; }

  var EVENTS = [
    {
      id: 'poached', kind: 'staff', cooldown: 24,
      when: function (s) { return s.studio.morale < 56 && s.studio.staff.length > 4 ? (56 - s.studio.morale) * 0.008 : 0; },
      title: 'A rival studio is hiring your leads',
      body: 'Someone senior has an offer on the table, and the rest of the team knows about it.',
      defaultOption: 1,
      options: [
        opt('Counter-offer', 'Pay to keep them. Everyone else finds out what that costs.',
          function (s) {
            var best = s.studio.staff.slice().sort(function (a, b) { return b.skill - a.skill; })[0];
            if (best) best.salary = Math.round(best.salary * 1.35);
            fx(s, { morale: 5, cash: -20000 });
          }),
        opt('Let them go', 'Wish them well and redistribute the work.',
          function (s) {
            var best = s.studio.staff.slice().sort(function (a, b) { return b.skill - a.skill; })[0];
            if (best) {
              U.removeById(s.studio.staff, best.id);
              St.log(s, 'staff', best.name + ' has been poached', St.ROLE_BY_ID[best.role].name + ', and one of your best.');
            }
            fx(s, { morale: -7, techDebt: 5 });
          }),
        opt('Fix the actual problem', 'Cut crunch, rebalance the roadmap, and mean it.',
          function (s) { s.studio.crunch = Math.max(0, s.studio.crunch - 30); fx(s, { morale: 13 }); })
      ]
    },
    {
      /* Somebody else's patch went well, or did not. */
      id: 'rivalDrift', kind: 'market', cooldown: 14, auto: true,
      when: function (s) {
        return PN.competitors.liveRivals(s).length ? 0.055 : 0;
      },
      title: 'Word of mouth moves on a rival',
      body: 'Their last update landed.',
      apply: function (s) {
        var rng = St.rngFor(s);
        var d = PN.competitors.driftQuality(s, rng);
        St.saveRng(s, rng);
        if (!d) return;
        St.log(s, 'market',
          d.comp.name + (d.up ? ' is reviewing better' : ' is reviewing worse'),
          d.up
            ? 'Their latest update went down well. Review scores around ' +
              Math.round(d.comp.quality) + ', up ' + Math.round(Math.abs(d.move)) +
              '. Expect them to hold more people than they did.'
            : 'Their latest update went badly. Review scores around ' +
              Math.round(d.comp.quality) + ', down ' + Math.round(Math.abs(d.move)) +
              '. Some of those players are looking for somewhere to go.',
          { rival: d.comp.id });
      }
    },
    {
      /* The one that only happens once, if it happens at all. */
      id: 'rivalPhenomenon', kind: 'market', cooldown: 52, once: true, auto: true,
      when: function (s) {
        if (PN.competitors.anyPhenomenon(s)) return 0;
        var able = PN.competitors.liveRivals(s)
          .filter(function (c) { return c.quality >= 80; });
        if (!able.length) return 0;
        /* About one year in twenty, and only while somebody is good
           enough for it to be believable.

           roll() picks ONE event a week out of a weighted pool, so a
           weight is a share of that pool rather than a probability -
           asking for 5% a year here landed at 2.5% once the rest of
           the table had its say. This is the weight that measures 5%.
           If the table grows, measure it again; the self-test asserts
           the rate rather than the number. */
        return 0.075 / 52;
      },
      title: 'A rival MMO has become a cultural phenomenon',
      body: 'It is on the news. People who do not play games are playing it.',
      apply: function (s) {
        var rng = St.rngFor(s);
        var c = PN.competitors.makePhenomenon(s, rng);
        St.saveRng(s, rng);
        if (!c) return;
        St.log(s, 'market', c.name + ' has become a phenomenon',
          c.studio + '\u2019s MMO has stopped being an MMO and become a thing ' +
          'people who do not play games have heard of. It is on the news, it is in ' +
          'adverts, and it is pulling from a market far bigger than the one your genre ' +
          'has. Nothing you ship this year will be compared to anything else.',
          { rival: c.id });
        /* Everybody feels this, whoever they play. */
        fx(s, { awareness: -6, popPct: -0.05 });
      }
    },
    {
      id: 'competitorLaunch', kind: 'market', cooldown: 40,
      when: function (s) { return s.phase === 'live' && s.week > 30 ? 0.030 : 0; },
      title: 'A rival MMO launches this month',
      body: 'Well funded, heavily marketed, and aimed squarely at your audience. Your streamers are already trying it.',
      defaultOption: 1,
      options: [
        opt('Counter-programme', 'Move a content drop forward and buy the marketing slot opposite them.',
          function (s) {
            fx(s, { cash: -320000, awareness: 9, popPct: -0.035, morale: -4 });
            s.studio.crunch = U.clamp100(s.studio.crunch + 18);
          }),
        opt('Let them have the month', 'Novelty fades. Hold the roadmap and keep quality up.',
          function (s) { fx(s, { popPct: -0.085, sentiment: -3 }); }),
        opt('Go on sale', 'Discount everything and open a free trial window.',
          function (s) { fx(s, { popPct: -0.02, awareness: 5, cash: -60000, sentiment: 2 }); })
      ]
    },
    {
      id: 'streamerBlessing', kind: 'market', cooldown: 22,
      when: function (s) { return s.runtime.sentiment > 62 && s.population.total > 2000 ? 0.055 : 0; },
      auto: true,
      title: 'A big creator has adopted your game',
      body: 'Thirty thousand concurrent viewers watching your endgame. Sign-ups are spiking.',
      apply: function (s) { fx(s, { awareness: 11, sentiment: 4 }); }
    },
    {
      id: 'streamerMeltdown', kind: 'community', cooldown: 22,
      when: function (s) { return s.runtime.sentiment < 38 ? (38 - s.runtime.sentiment) * 0.008 : 0; },
      title: 'A two-hour video essay about everything wrong with your game',
      body: 'It is well argued, it is mostly fair, and it is at a million views by Sunday.',
      defaultOption: 1,
      options: [
        opt('Respond publicly, point by point', 'Risky. If the response is honest it can turn the room.',
          function (s) {
            var t = PN.sim.live(s).liveOps.transparency;
            fx(s, { sentiment: t > 55 ? 9 : -8, awareness: 4 });
          }),
        opt('Say nothing, fix the top complaint', 'Let the work be the answer.',
          function (s) { fx(s, { sentiment: -4, progress: { design: -6, eng: -4 } }); }),
        opt('Ignore it entirely', 'It will blow over.',
          function (s) { fx(s, { sentiment: -12, reputation: -5 }); })
      ]
    },
    {
      id: 'ddos', kind: 'crisis', cooldown: 28,
      when: function (s) { return s.population.total > 8000 ? 0.028 : 0; },
      auto: true,
      title: 'Sustained DDoS against the login servers',
      body: 'Nobody can get in for most of a weekend.',
      apply: function (s) {
        var mitigation = PN.sim.live(s).infra.redundancy / 100;
        fx(s, { outage: 26 * (1 - mitigation * 0.7), sentiment: -9 * (1 - mitigation * 0.5),
                cash: -55000, popPct: -0.012 });
      }
    },
    {
      id: 'regulator', kind: 'crisis', cooldown: 999, once: true,
      when: function (s) {
        var d = PN.sim.live(s);
        var risky = (d.monetisation.shop || []).some(function (x) {
          var def = PN.prim.SHOP_BY_ID[x.catId];
          return x.enabled && def && def.tags.indexOf('regulatory-risk') >= 0 && x.prominence > 30;
        });
        return risky && s.era.year >= 2016 ? 0.035 : 0;
      },
      title: 'A regulator is asking about your loot boxes',
      body: 'A formal enquiry in one of your larger markets. Legal want an answer this week.',
      defaultOption: 0,
      options: [
        opt('Remove them voluntarily', 'Take the revenue hit and the goodwill win before you are made to.',
          function (s) {
            hotfix(s, function (d) {
              (d.monetisation.shop || []).forEach(function (x) {
                var def = PN.prim.SHOP_BY_ID[x.catId];
                if (def && def.tags.indexOf('gambling') >= 0) x.enabled = false;
              });
            });
            fx(s, { sentiment: 14, reputation: 8 });
          }),
        opt('Publish the odds and geo-restrict', 'The compliance answer. Keeps most of the revenue.',
          function (s) { fx(s, { cash: -140000, sentiment: 3, reputation: 2 }); }),
        opt('Fight it', 'Lawyers. Years of them.',
          function (s) { fx(s, { cash: -400000, sentiment: -10, reputation: -12 }); })
      ]
    },
    {
      id: 'breach', kind: 'crisis', cooldown: 999, once: true,
      when: function (s) { return s.runtime.techDebt > 85 ? (s.runtime.techDebt - 85) * 0.006 : 0; },
      auto: true,
      title: 'Account credentials leaked',
      body: 'An old service nobody had touched in three years. Forced password reset for everyone, and a very bad week of press.',
      apply: function (s) { fx(s, { sentiment: -20, reputation: -14, cash: -260000, techDebt: -18, popPct: -0.018 }); }
    },
    {
      id: 'worldFirst', kind: 'community', cooldown: 26,
      when: function (s) {
        var d = PN.sim.live(s);
        return PN.schema.hasEngine(d, 'raidTiers') && s.runtime.weeksSinceContent < 5 ? 0.10 : 0;
      },
      auto: true,
      title: 'World-first race is trending',
      body: 'Guilds pulling eighteen-hour days on your hardest boss, and a hundred thousand people watching them do it.',
      apply: function (s) {
        var hard = 0;
        PN.sim.live(s).bosses.forEach(function (b) {
          hard = Math.max(hard, PN.metrics.bossMetrics(PN.sim.live(s), b).difficulty);
        });
        fx(s, { awareness: hard > 60 ? 8 : 3, sentiment: hard > 45 ? 5 : -2 });
      }
    },
    {
      id: 'publisherPressure', kind: 'business', cooldown: 34,
      when: function (s) { return s.studio.cash < 1400000 ? 0.09 : 0; },
      title: 'The publisher wants the revenue curve fixed',
      body: 'A deck has been prepared. It has the word "undermonetised" on slide four.',
      defaultOption: 1,
      options: [
        opt('Give them the cash shop they want', 'Boosts, convenience, and a prominent store button.',
          function (s) {
            hotfix(s, function (d) {
              ['boost', 'convenience', 'storage'].forEach(function (cat) {
                var e = null;
                (d.monetisation.shop || []).forEach(function (x) { if (x.catId === cat) e = x; });
                if (e) { e.enabled = true; e.prominence = U.clamp100(e.prominence + 30); }
                else d.monetisation.shop.push(PN.schema.newShopEntry(cat));
              });
            });
            fx(s, { cash: 260000, sentiment: -8, morale: -5 });
          }),
        opt('Negotiate for time', 'Promise the next expansion will deliver. Buy two quarters.',
          function (s) { fx(s, { morale: -2, reputation: -2 }); }),
        opt('Cut the team instead', 'Protect the design. Lose the people.',
          function (s) {
            var staff = s.studio.staff.slice().sort(function (a, b) { return b.salary - a.salary; });
            var cut = staff.slice(0, Math.max(1, Math.floor(staff.length * 0.2)));
            cut.forEach(function (x) { U.removeById(s.studio.staff, x.id); });
            fx(s, { morale: -22, cash: 120000 });
            St.log(s, 'staff', 'Layoffs', cut.length + ' people let go. The rest noticed.');
          })
      ]
    },
    {
      id: 'pvpBots', kind: 'crisis', cooldown: 22,
      when: function (s) {
        var d = PN.sim.live(s);
        return (PN.schema.hasEngine(d, 'arena') || PN.schema.hasEngine(d, 'battleground')) &&
               s.runtime.botPressure > 30 ? 0.07 : 0;
      },
      auto: true,
      title: 'Bots are farming the ranked ladder',
      body: 'Scripted accounts win-trading through the low brackets. Your competitive players have receipts and are posting them hourly.',
      apply: function (s) {
        var spend = PN.sim.live(s).liveOps.antiCheatSpend / 100;
        fx(s, { sentiment: -11 * (1 - spend * 0.6), botPressure: 8 * (1 - spend) });
      }
    },
    {
      id: 'belovedSystemRemoved', kind: 'community', cooldown: 30,
      when: function (s) { return s.runtime.weeksSinceContent < 3 && s.week > 40 ? 0.045 : 0; },
      auto: true,
      title: 'You removed something people loved',
      body: 'It was unbalanced, barely used, and a maintenance nightmare. It was also somebody\'s whole reason to log in.',
      apply: function (s) { fx(s, { sentiment: -6, techDebt: -8 }); }
    }
  ];

  var BY_ID = {};
  EVENTS.forEach(function (e) { BY_ID[e.id] = e; });

  function val(x, s, c) { return typeof x === 'function' ? x(s, c) : x; }

  function roll(state, rng, ctx) {
    state._eventCooldown = state._eventCooldown || {};
    var fired = [];

    /* Resolve anything the player left sitting too long. */
    for (var i = state.pendingEvents.length - 1; i >= 0; i--) {
      var p = state.pendingEvents[i];
      if (state.week >= p.expires) {
        resolve(state, p.id, p.defaultOption, true);
      }
    }

    /* At most one new event per week - crises should land, not pile up. */
    var candidates = [];
    EVENTS.forEach(function (def) {
      if (def.once && state._eventCooldown['once:' + def.id]) return;
      var cd = state._eventCooldown[def.id];
      if (cd && state.week - cd < (def.cooldown || 20)) return;
      var w = 0;
      try { w = def.when(state, ctx) || 0; } catch (e) { w = 0; }
      if (w > 0) candidates.push({ def: def, w: w });
    });
    if (!candidates.length) return fired;

    var totalW = U.sum(candidates, function (c) { return c.w; });
    if (!rng.chance(U.clamp01(totalW))) return fired;

    var pick = rng.weighted(candidates, function (c) { return c.w; });
    var def = pick.def;
    state._eventCooldown[def.id] = state.week;
    if (def.once) state._eventCooldown['once:' + def.id] = true;

    var title = val(def.title, state, ctx), body = val(def.body, state, ctx);

    if (def.auto) {
      try { def.apply(state, ctx); } catch (e) {}
      St.log(state, def.kind, title, body);
      fired.push({ id: def.id, auto: true, title: title });
    } else {
      var entry = {
        id: U.id('evt'), defId: def.id, kind: def.kind, title: title, body: body,
        options: def.options.map(function (o) { return { label: o.label, detail: o.detail }; }),
        defaultOption: def.defaultOption || 0,
        week: state.week, expires: state.week + 2
      };
      state.pendingEvents.push(entry);
      St.log(state, def.kind, title, body, { pending: entry.id });
      fired.push({ id: def.id, auto: false, title: title, entryId: entry.id });
    }
    return fired;
  }

  /* Raise an event about something specific.

     The table above is written in advance and has to be true of any
     save; some events are about a PERSON, and those can only be
     authored at the moment they fire. Such an entry carries its own
     options with their own apply - which is the one case resolve()
     reads the consequence off the entry rather than the definition. */
  function raise(state, spec) {
    state.pendingEvents = state.pendingEvents || [];
    var entry = {
      id: U.id('evt'), defId: spec.defId || null, kind: spec.kind || 'staff',
      title: spec.title, body: spec.body,
      options: spec.options,
      defaultOption: spec.defaultOption || 0,
      week: state.week, expires: state.week + (spec.weeks === undefined ? 2 : spec.weeks)
    };
    state.pendingEvents.push(entry);
    St.log(state, entry.kind, spec.title, spec.body,
      U.merge({ pending: entry.id }, spec.data || {}));
    return entry;
  }

  function resolve(state, entryId, optionIndex, wasDefault) {
    var idx = -1, entry = null;
    for (var i = 0; i < state.pendingEvents.length; i++)
      if (state.pendingEvents[i].id === entryId) { idx = i; entry = state.pendingEvents[i]; break; }
    if (!entry) return { ok: false };

    /* Where the CONSEQUENCE lives.

       A pending event is a plain object that survives a save, so it
       carries only what the screen needs: the label and the detail.
       What the choice DOES is a function, and functions do not
       survive JSON - so it stays on the definition and is looked up
       by id when the player answers.

       This used to prefer the entry, which always has an options
       array, so every scripted event resolved against options with no
       apply on them: the call threw, the catch below swallowed it,
       and every choice in the game quietly did nothing. A crisis
       written out of a cause is the exception - it is authored at the
       moment it fires and carries its own apply. */
    var def = BY_ID[entry.defId];
    var option = (def && def.options && def.options[optionIndex]) ||
                 (entry.options && entry.options[optionIndex] &&
                  entry.options[optionIndex].apply ? entry.options[optionIndex] : null);
    /* What the player actually read, which is what the log should say. */
    var shown = (entry.options && entry.options[optionIndex]) || option;
    /* The context an option might want is a convenience, not a
       precondition - and it is built BEFORE apply is called, which
       makes building it a way for a choice to do nothing.

       That is not hypothetical: a studio between games has no live
       design to balance, balanceState threw on the way in, and the
       catch below ate it. The player pressed a button, read a
       confirmation, and nothing happened. So it is built on its own,
       and apply runs whether or not that worked. */
    var ctx = {};
    try { ctx.balance = PN.metrics.balanceState(PN.sim.live(state)); } catch (e) {}
    if (option) {
      try {
        option.apply(state, ctx);
      } catch (err) {
        /* And if the consequence itself is broken, say so out loud,
           where it can be seen. Silence here is what hid the last one. */
        St.log(state, 'studio', 'A decision could not be carried out',
          entry.title + ' was answered, but applying it failed: ' +
          ((err && err.message) || err) + '. This is a bug.');
      }
    }
    if (shown) {
      St.log(state, 'decision', entry.title + ' - resolved',
        (wasDefault ? 'No decision was made in time. ' : '') + shown.label + '. ' + shown.detail);
    }
    state.pendingEvents.splice(idx, 1);
    return { ok: true, option: option };
  }

  /* The cause engine writes its crises inline, so the shared helpers
     have to be reachable from outside this file. */
  PN.events = { EVENTS: EVENTS, roll: roll, resolve: resolve, raise: raise,
                fx: fx, hotfix: hotfix, opt: opt };
})(PN);
