/* Patch Notes - the weekly tick.
   Development, launch, and the live-service loop. One tick = one week.
   Every system meets here: agents, guilds, the economy, rivals, patches
   and the era.

   A studio can run several games at once, so the week happens in two
   layers: studio work that happens once (wages, hiring, attrition, the
   calendar, the rival market) and title work that happens per game with
   that game mounted on the state. See titles.js for the mount model.  */
(function (PN) {
  'use strict';
  var U = PN.util, tax = PN.tax, met = PN.metrics, pop = PN.pop, St = PN.state;
  var T = null, P = null;   /* PN.titles / PN.patches, resolved lazily */
  function titlesApi() { return T || (T = PN.titles); }
  function patchApi() { return P || (P = PN.patches); }

  /* What the simulation actually reads. The draft design is only a plan
     until it is built and shipped.                                      */
  function live(state) { return state.shipped || state.design; }

  /* Capacity banked against THIS title's next release. Progress lives on
     the title, not the studio, or a second game would inherit the first
     one's half-built patch. */
  function completion(state) {
    /* How far along the release being built is. Before launch there is
       no roadmap yet and this is the game itself; afterwards it is
       whatever sits at the front of the queue, with its own banked
       work rather than a pool shared by everything planned. */
    var pc = patchApi();
    var plan = state.phase === 'live' && pc ? pc.nextPlan(state) : null;
    var cost = plan ? pc.planCost(state, plan) : met.buildCost(state.design);
    var p = plan ? pc.progressOf(state, plan)
                 : (state.progress || { design: 0, art: 0, eng: 0, qa: 0 });
    var pools = ['design', 'art', 'eng', 'qa'];
    var worst = 1, per = {};
    pools.forEach(function (k) {
      var c = Math.max(1, cost[k]);
      per[k] = U.clamp01((p[k] || 0) / c);
      worst = Math.min(worst, per[k]);
    });
    return { overall: worst, per: per, cost: cost };
  }

  /* ------------------------------------------------------------- studio */

  /* Staff morale, burnout and tech debt are studio-wide; capacity is not,
     so this returns the multiplier and the caller shares the capacity out
     across the titles being worked on.                                 */
  function applyStudioWeek(state, cap) {
    var s = state.studio, rt = state.runtime || { sentiment: 50 };
    var crunch = s.crunch / 100;
    var crunchMult = 1 + crunch * 0.42;

    s.staff.forEach(function (st) {
      st.weeks++;
      var target = 74 - crunch * 46 + (cap.effects.morale || 0) * 2.2 +
                   (rt.sentiment - 50) * 0.16 + (s.reputation - 45) * 0.12;
      st.morale += (target - st.morale) * 0.16;
      st.burnout = U.clamp100(st.burnout +
        crunch * 3.2 * St.traitBurnout(st) - (crunch < 0.15 ? 2.4 : 0));
      st.morale = U.clamp100(st.morale);
    });
    s.morale = U.avg(s.staff, function (st) { return st.morale; }) || 50;

    /* Research runs on the same capacity that builds the game, so the
       allocation slider is a real trade: every point spent learning how
       to raise the level cap is a point not spent on this week's zone. */
    var learned = PN.research.tick(state, cap);
    if (learned) {
      St.log(state, 'studio', 'Research complete: ' + learned.name,
        learned.desc || 'The studio can build something it could not before.',
        { research: learned.id });
    }
    return crunchMult;
  }

  /* Hand this title its share of the week's capacity. Allocation is the
     producer's decision; spread is the tax for running more games than
     one team comfortably can.                                          */
  function applyTitleCapacity(state, cap, crunchMult) {
    var ttl = titlesApi();
    var share = ttl ? U.clamp01((state.allocation === undefined ? 100 : state.allocation) / 100) : 1;
    var spread = ttl ? ttl.spreadPenalty(state) : 1;
    var mult = crunchMult * share * spread;
    /* Into the release being built, and on down the roadmap as each
       one is paid for. It used to go into one pool on the title, so
       work done towards the first release showed as progress on the
       third and a producer could not tell which was actually ready. */
    var week = {};
    ['design', 'art', 'eng', 'qa'].forEach(function (k) { week[k] = cap[k] * mult; });
    patchApi().creditWork(state, week);
    state.runtime.techDebt = U.clamp(
      state.runtime.techDebt + (state.studio.crunch / 100) * 1.7 - cap.qa * share * 0.18, 0, 200);
    return mult;
  }

  /* Wages are paid once no matter how many games you run. */
  function studioCosts(state) {
    return { wages: St.weeklyWages(state) };
  }

  /* Servers, marketing and live-ops are per game. */
  function titleCosts(state) {
    var servers = state.phase === 'live' ? St.serverCost(state) : 450;
    var marketing = state.runtime.marketingSpend || 0;
    var d = live(state);
    var liveOps = state.phase === 'live'
      ? (d.liveOps.moderationSpend + d.liveOps.antiCheatSpend + d.economy.antiRmtSpend) * 4.5
      : 0;
    return { servers: servers, marketing: marketing, liveOps: liveOps,
             total: servers + marketing + liveOps };
  }

  /* Kept for saves and callers written against the old single-game shape. */
  function payroll(state) {
    var s = studioCosts(state), t = titleCosts(state);
    return { wages: s.wages, servers: t.servers, marketing: t.marketing,
             liveOps: t.liveOps, total: s.wages + t.total };
  }

  /* ------------------------------------------------------------- staff --

     People do not vanish between one week and the next. They get unhappy
     for a while, they hand in their notice, and then they work out that
     notice while you decide whether to counter-offer, redistribute their
     work, or hire ahead of the gap.

     Losing someone with no warning is not a difficulty setting, it is a
     dice roll you cannot play around - which is why this used to feel
     like a chore. Now it is a problem you can see coming and act on. */

  var NOTICE_WEEKS = 4;

  function attritionRisk(state, st) {
    var s = state.studio;
    /* The base rate is low. Somebody happy and rested almost never goes:
       what makes people leave is months of crunch and a studio nobody
       wants to be seen working at. */
    var p = 0.0018;
    p += Math.max(0, 55 - st.morale) * 0.00085;
    p += (st.burnout / 100) * 0.0075;
    p += Math.max(0, 40 - (s.reputation || 50)) * 0.00035;
    /* Seniority cuts both ways: senior people have somewhere to go, but
       they are also the ones invested in what they have built. */
    if (st.seniority > 0.75) p *= 0.8;
    p *= St.traitStay(st);
    /* Someone who has been here for years has already chosen to stay. */
    p *= U.clamp(1.25 - (st.weeks || 0) / 220, 0.55, 1.25);
    /* Paying under the odds is the quietest reason anyone leaves. */
    var role = St.ROLE_BY_ID[st.role];
    if (role) {
      var market = role.salary * (0.65 + st.seniority * 0.95);
      if (st.salary < market * 0.92) p *= 1 + (1 - st.salary / (market * 0.92)) * 2.2;
    }
    return U.clamp(p, 0, 0.25);
  }

  /* Why this person is unhappy, in the words a producer would use. */
  function attritionReasons(state, st) {
    var out = [];
    var s = state.studio;
    if (st.burnout > 55) out.push('burnt out');
    if (st.morale < 45) out.push('unhappy');
    var role = St.ROLE_BY_ID[st.role];
    if (role) {
      var market = role.salary * (0.65 + st.seniority * 0.95);
      if (st.salary < market * 0.92) out.push('underpaid');
    }
    if ((s.reputation || 50) < 40) out.push('tired of the studio\'s reputation');
    if (!out.length) out.push('offered something better');
    return out;
  }

  function staffAttrition(state, rng) {
    var s = state.studio, left = [];
    for (var i = s.staff.length - 1; i >= 0; i--) {
      var st = s.staff[i];

      /* Already working a notice period: count it down, then go. */
      if (st.noticeWeeks > 0) {
        st.noticeWeeks--;
        if (st.noticeWeeks <= 0) { left.push(st); s.staff.splice(i, 1); }
        continue;
      }

      if (st.resignPending) continue;

      if (rng.chance(attritionRisk(state, st))) {
        raiseResignation(state, st);
        continue;
      }

      /* And the quieter one: somebody who is not leaving the studio,
         but has stopped wanting to do the job you hired them for.
         Unhappiness and burnout both push towards it, and it is rarer
         than resigning because changing discipline is a bigger
         decision than changing employer. */
      if (rng.chance(careerChangeRisk(state, st))) raiseCareerChange(state, st, rng);
    }
    return left;
  }

  /* ------------------------------------------------ a person resigning

     This used to happen TO you: a line in the feed, four weeks on the
     clock, and a counter-offer button buried in the roster. It is a
     decision - the whole reason hiring takes time in 1999 is so that
     this one costs something. */
  function raiseResignation(state, st) {
    var role = St.ROLE_BY_ID[st.role] || { name: st.role, salary: 0 };
    var reasons = attritionReasons(state, st);
    st.noticeReasons = reasons;
    st.resignPending = true;
    var raise = Math.round(st.salary * 0.22);
    var weeks = St.hireWeeksFor(state);

    PN.events.raise(state, {
      kind: 'staff', defId: 'resignation', data: { staffId: st.id },
      title: st.name + ' wants to leave',
      body: role.name + ', ' + Math.round(st.weeks / 52 * 10) / 10 + ' years here. ' +
        'Reason given: ' + U.listJoin(reasons) + '.',
      defaultOption: 1,
      options: [
        PN.events.opt('Give them a raise now',
          U.fmtMoney(raise) + ' a month more, today, before they have talked to anybody else.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (!p) return;
            p.salary += raise;
            p.resignPending = false;
            p.noticeWeeks = 0;
            p.noticeReasons = null;
            p.morale = U.clamp100(p.morale + 20);
            St.log(s, 'staff', p.name + ' is staying',
              'A raise and a conversation, before it became a notice period.',
              { staffId: p.id });
          }),
        PN.events.opt('Accept four weeks notice',
          'They work out the notice at reduced output, and then they are gone.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (!p) return;
            p.resignPending = false;
            p.noticeWeeks = NOTICE_WEEKS;
            p.noticedWeek = s.week;
            St.log(s, 'staff', p.name + ' is working their notice',
              (St.ROLE_BY_ID[p.role] || {}).name + ', ' + NOTICE_WEEKS +
              ' weeks left at reduced output.', { staffId: p.id });
          }),
        PN.events.opt('Start looking for a replacement',
          weeks > 0
            ? 'They work their notice, and the search starts today - about ' +
              weeks + ' weeks before anybody arrives.'
            : 'They work their notice, and somebody replaces them this week.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (p) {
              p.resignPending = false;
              p.noticeWeeks = NOTICE_WEEKS;
              p.noticedWeek = s.week;
            }
            St.openSearch(s, st.role);
          })
      ]
    });
  }

  /* --------------------------------- somebody who wants a different job

     Not leaving - wanting to do something else here. It is the event
     that makes a roster feel like people rather than capacity, and it
     is a genuine trade: a discipline you are thin in against one you
     are not, or a morale hit for saying no. */
  function careerChangeRisk(state, st) {
    if (st.noticeWeeks > 0 || st.resignPending) return 0;
    if ((st.weeks || 0) < 26) return 0;          /* not in your first six months */
    var unhappy = Math.max(0, 62 - st.morale) / 62;
    var burnt = U.clamp01((st.burnout - 25) / 75);
    if (unhappy <= 0 && burnt <= 0) return 0;
    /* Rarer than resigning: changing discipline is a bigger decision
       than changing employer. */
    return U.clamp(0.0009 + unhappy * 0.0026 + burnt * 0.0030, 0, 0.012);
  }

  function raiseCareerChange(state, st, rng) {
    var from = St.ROLE_BY_ID[st.role];
    if (!from) return;
    /* Somewhere else in the studio, and not where they already are. */
    var choices = St.STAFF_ROLES.filter(function (r) { return r.id !== st.role; });
    if (!choices.length) return;
    var to = rng.pick(choices);
    var raise = Math.round(st.salary * 0.15);
    st.careerPending = true;

    PN.events.raise(state, {
      kind: 'staff', defId: 'careerChange', data: { staffId: st.id },
      title: st.name + ' wants to move to ' + to.name.toLowerCase(),
      body: from.name + ' for ' + Math.round((st.weeks || 0) / 52 * 10) / 10 +
        ' years, and ' +
        (st.burnout > 50 ? 'burnt out on it' : 'quietly bored of it') +
        '. They have been teaching themselves ' + to.name.toLowerCase() +
        ' work in the evenings.',
      defaultOption: 2,
      options: [
        PN.events.opt('Offer them the new role',
          'They move to ' + to.name.toLowerCase() + '. Their skill takes a knock ' +
          'while they learn, and the discipline they left is a person down.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (!p) return;
            p.careerPending = false;
            p.role = to.id;
            p.salary = Math.round(to.salary * (0.65 + p.seniority * 0.95));
            /* Starting again somewhere else costs real skill, and buys
               real morale. */
            p.skill = Math.max(0.15, p.skill * 0.72);
            p.morale = U.clamp100(p.morale + 22);
            p.burnout = Math.max(0, p.burnout - 25);
            St.log(s, 'staff', p.name + ' is now a ' + to.name.toLowerCase(),
              'They start again a little further down, and they are happy about it.',
              { staffId: p.id });
          }),
        PN.events.opt('Tell them no',
          'They stay where they are, and they remember that you said no.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (!p) return;
            p.careerPending = false;
            p.morale = U.clamp100(p.morale - 12);
            St.log(s, 'staff', p.name + ' is staying in their role',
              'They asked, you said no, and they are still here.', { staffId: p.id });
          }),
        PN.events.opt('Give them a raise instead',
          U.fmtMoney(raise) + ' a month to keep doing the job you need them doing.',
          function (s) {
            var p = U.byId(s.studio.staff, st.id);
            if (!p) return;
            p.careerPending = false;
            p.salary += raise;
            p.morale = U.clamp100(p.morale + 14);
            St.log(s, 'staff', p.name + ' took the money',
              'Still a ' + (St.ROLE_BY_ID[p.role] || {}).name.toLowerCase() +
              ', and happier about it than they were.', { staffId: p.id });
          })
      ]
    });
  }

  /* Talk somebody out of leaving. Costs a real raise, and works better
     the sooner you do it and the less broken the reason is. */
  function counterOffer(state, staffId) {
    var s = state.studio;
    var st = U.byId(s.staff, staffId);
    if (!st || !st.noticeWeeks) return { ok: false, reason: 'Not leaving.' };
    if (st.counterOffered) return { ok: false, reason: 'You have already tried that.' };
    var rng = St.rngFor(state);
    var raise = Math.round(st.salary * 0.18);
    /* The later you leave it, the less it works. Burnout barely responds
       to money at all, which is the honest version. */
    var odds = 0.72 * (st.noticeWeeks / NOTICE_WEEKS) *
               (st.burnout > 55 ? 0.45 : 1) *
               U.clamp(0.6 + (st.morale / 100), 0.5, 1.25);
    st.counterOffered = true;
    st.salary += raise;
    var took = rng.chance(U.clamp01(odds));
    if (took) {
      st.noticeWeeks = 0;
      st.noticeReasons = null;
      st.morale = U.clamp100(st.morale + 18);
      St.log(state, 'staff', st.name + ' is staying',
        'A ' + U.fmtMoney(raise) + ' raise and a conversation. They withdrew their notice.',
        { staffId: st.id });
    } else {
      St.log(state, 'staff', st.name + ' turned down the counter-offer',
        'The raise stands for whoever replaces them. Money was not the problem.',
        { staffId: st.id });
    }
    St.saveRng(state, rng);
    return { ok: true, took: took, raise: raise };
  }

  /* Everyone currently working a notice period, soonest first. */
  function leaving(state) {
    return (state.studio.staff || [])
      .filter(function (s) { return s.noticeWeeks > 0; })
      .sort(function (a, b) { return a.noticeWeeks - b.noticeWeeks; });
  }

  /* ============================================================== LAUNCH */

  function launch(state, opts) {
    opts = opts || {};
    if (state.phase === 'live') return { ok: false, reason: 'Already live.' };
    var c = completion(state);
    state.shipped = U.clone(state.design);
    state.phase = 'live';
    state.launchWeek = state.week;
    state.launchCompletion = c.overall;

    /* A sequel collects on its inheritance the day it opens, and the
       game it inherited from pays for it. */
    var ttlApi = titlesApi();
    if (ttlApi && ttlApi.cannibalise && state.sequelTo) {
      var rec = ttlApi.byId(state, state.activeTitleId);
      if (rec) {
        rec.sequelTo = state.sequelTo;
        rec.cannibalised = state.cannibalised;
        var moved = ttlApi.cannibalise(state, rec);
        state.cannibalised = rec.cannibalised;
        if (moved && moved.moved > 0) {
          St.log(state, 'launch', U.fmtInt(moved.moved) + ' players came across',
            'They were playing ' + (state.sequelOf || 'your other game') +
            ' this morning. A sequel does not find a new audience so much as ' +
            'move one, and the game they left just got smaller.',
            { moved: moved.moved });
        }
      }
    }
    /* Shipping the game spends the game. Everything banked went into
       what just went out of the door, so the live studio starts its
       first patch from nothing - rather than from the hundred and
       fifty weeks of carried-over surplus that made every patch for
       the rest of the campaign free. */
    POOLS.forEach(function (k) { state.progress[k] = 0; });

    var rt = state.runtime;
    var shortfall = Math.max(0, 1 - c.overall);
    rt.bugLoad = U.clamp(rt.bugLoad + shortfall * 78, 0, 100);
    rt.techDebt = U.clamp(rt.techDebt + shortfall * 48, 0, 200);
    rt.awareness = U.clamp100(rt.awareness + rt.hype * 0.85 + 6);

    var ax = currentAxes(state);
    var vals = PN.axes.values(ax);
    var coh = ax._ctx.coherence;
    rt.reviewScore = U.clamp100(
      vals.stability * 0.26 + vals.value * 0.15 + vals.progression * 0.10 +
      vals.identity * 0.08 + vals.fairness * 0.12 + vals.social * 0.08 +
      vals.mastery * 0.07 + vals.accessibility * 0.06 +
      coh.score * 0.18 - shortfall * 34 +
      (live(state).identity.productionValue - state.era.expectation) * 0.30
    );
    rt.sentiment = U.clamp100(rt.reviewScore * 0.6 + 30);

    /* Launch IS the first release. It goes in the patch history as v1.0.0
       with whatever notes the player wrote, because "what did we ship and
       when" should be one list, not two. */
    var pc = patchApi();
    state.version = { major: 1, minor: 0, patch: 0 };
    state.released = state.released || [];
    var launchNotes = String(opts.notes || '').trim() ||
      (live(state).meta.name + ' is live. ' +
       (c.overall >= 0.999
         ? 'Everything we planned for launch made it in.'
         : Math.round((1 - c.overall) * 100) + '% of the planned scope did not make it in, ' +
           'and you will be able to tell.'));
    state.released.unshift({
      id: U.id('rel'), week: state.week, kind: 'major',
      version: { major: 1, minor: 0, patch: 0 }, versionText: 'v1.0.0',
      name: opts.name || live(state).meta.name, notes: launchNotes,
      notesGenerated: !String(opts.notes || '').trim(), auto: false,
      work: 0, planned: 0, funded: c.overall,
      made: {}, returned: 0, revenue: 0, bugs: 0, launch: true
    });
    state.runtime.weeksSinceContent = 0;

    St.log(state, 'launch', live(state).meta.name + ' is live',
      'Launched at ' + Math.round(c.overall * 100) + '% of planned scope. ' +
      'Reviews are landing around ' + Math.round(rt.reviewScore) + '/100.',
      { review: rt.reviewScore, completion: c.overall });

    return { ok: true, review: rt.reviewScore, completion: c.overall };
  }

  /* ================================================================ SHIP

     Every release goes through here, from a hotfix to an expansion. A
     plan names the version bump and the content it intends to carry; this
     builds whatever was actually paid for, writes the notes, and applies
     the consequences. Expansions are not a separate system - they are the
     major-version case of this one function.                           */

  function shipPlan(state, plan, opts) {
    opts = opts || {};
    var pc = patchApi();
    var d = state.design;
    var kind = pc.KIND_BY_ID[plan.kind] || pc.KIND_BY_ID.minor;

    /* An automatic release is a tuning pass and nothing else. It nudges
       balance numbers and never invents content - and it nudges them
       into ITS OWN changes, not into whichever release the player
       happens to have open in the editor. */
    if (plan.tuningOnly) {
      var tuned = pc.designFor(state, plan);
      pc.applyTuning(tuned, 1);
      plan.delta = pc.deltaBetween(pc.baseStage(state, plan), tuned);
      pc.bumpRoadmap();
    }

    /* What is actually in this release: everything authored since the
       last one that is not being held back for a later release. The
       diff is taken BEFORE shipped is replaced. */
    var diff = pc.pendingDiff(state, plan);
    var planned = pc.pendingWork(state, kind, plan);

    /* How much of it the studio has financed. A release you have not
       paid for is not ready - the content exists in your design either
       way, so it waits rather than arriving smaller. */
    var fraction = opts.force ? 1 : pc.funded(state, plan);
    if (fraction < 0.999 && !opts.force && !opts.partial) {
      return { ok: false, reason: 'Release is ' + Math.round(fraction * 100) + '% built.',
               funded: fraction };
    }

    /* What it cost, read BEFORE players are handed it. Once shipped has
       moved, this release's changes are already in what players have
       and its bill reads as nothing - which would have said every
       release was perfectly tested. */
    var needed = pc.planCost(state, plan);

    /* Bump the version the player chose. */
    state.version = pc.nextVersion(state.version, plan.kind);
    if (state.version.major === 0 && state.phase === 'live') state.version.major = 1;

    /* Hand players what you built - and only what this release was for.
       Anything marked for a later release stays in your design, which
       is the whole point of marking it. */
    var before = met.buildCost(state.shipped || d);
    state.shipped = pc.designFor(state, plan);
    var after = met.buildCost(state.shipped);
    var work = ['design', 'art', 'eng', 'qa'].reduce(function (t, k) {
      return t + Math.max(0, after[k] - before[k]);
    }, 0);

    /* How well this release was tested, measured BEFORE the pools are
       spent: the QA banked for it against the QA it needed. Reading
       this after the pools were emptied made every release look
       completely untested and doubled the bugs it shipped with. */
    var banked = pc.progressOf(state, plan);
    var qaCover = U.clamp01((banked.qa || 0) / Math.max(1, needed.qa));

    /* A release spends the work banked against IT. Every other release
       on the board keeps its own, because it is its own piece of work -
       which is the whole reason progress is held per release rather
       than in one pool on the title. */
    POOLS.forEach(function (k) { banked[k] = 0; });

    var rt = state.runtime;
    rt.weeksSinceContent = 0;
    /* How big this release was decides how long it is remembered - a
       hotfix is forgotten in a month, an expansion carries a year. */
    rt.lastReleaseKind = plan.kind;

    /* Bugs scale with how much went in and how little QA covered it. */
    var shortfall = Math.max(0, 1 - fraction);
    var newBugs = work * 0.42 * (1 - qaCover * 0.55) * (1 - d.liveOps.ptrUse / 260) +
                  shortfall * 30;
    rt.bugLoad = U.clamp(rt.bugLoad + newBugs, 0, 100);
    rt.techDebt = U.clamp(rt.techDebt + shortfall * 20 + work * 0.04, 0, 200);

    /* Notes. If the player did not write them, the game writes them from
       what actually changed - which is the only honest version anyway. */
    var notes = String(plan.notes || '').trim();
    var generated = false;
    if (!notes) {
      var head = kind.id === 'major' ? ((plan.name || 'The expansion') + ' is live.')
               : kind.id === 'minor' ? 'Content update.' : 'Maintenance and tuning.';
      notes = diff.empty ? head + ' No player-facing changes.'
                         : head + '\n\n' + PN.diff.toText(diff);
      generated = true;
    }

    /* A release is an event in the market, sized by what it was. */
    var scale = U.clamp01(work / Math.max(60, met.buildCost(d).design +
                                              met.buildCost(d).art * 0.4));
    rt.hype = Math.max(0, rt.hype - 20 * kind.hypeMult);
    rt.awareness = U.clamp100(rt.awareness + (4 + scale * 18) * kind.hypeMult);
    rt.sentiment = U.clamp100(rt.sentiment + (2 + scale * 8) * kind.hypeMult -
                              shortfall * 14);

    /* Lapsed players come back for something big. A hotfix pulls nobody. */
    var returned = 0, boxRevenue = 0;
    if (kind.lapsedPull > 0.01 && state.phase === 'live') {
      var rng = St.rngFor(state);
      PN.expansions.initLapsed(state);
      var pull = U.clamp01((0.10 + scale * 0.5) * kind.lapsedPull +
                           (rt.sentiment - 50) / 260);
      var ctx = { rng: rng, world: PN.agents.buildWorldCache(state) };
      tax.ARCHETYPES.forEach(function (a) {
        var poolN = state.lapsed[a.id] || 0;
        var eager = a.id === 'raider' ? 1.5 : a.id === 'progressor' ? 1.35
                  : a.id === 'completionist' ? 1.25 : a.id === 'drifter' ? 0.75 : 1;
        var n = poolN * pull * eager;
        if (n < 1) return;
        state.lapsed[a.id] = poolN - n;
        returned += PN.agents.admit(state, a.id, n, ctx);
      });
      state.population.total = U.sum(state.agents, function (a) { return a.w; });
      /* Somebody coming back for an expansion is somebody joining the
         game this week. These were being let in without being counted,
         so a release that pulled five thousand lapsed players back drew
         a joins line that barely twitched - the population jumped and
         the graph meant to explain it said nothing. */
      rt.returnedThisWeek = (rt.returnedThisWeek || 0) + returned;

      /* Only an expansion is something you sell separately - and a
         subscription game sells them too, which is the whole WoW model.
         A game whose expansions are free says so by pricing them at 0.

         The studio does not simply book the money. It puts the
         expansion ON SALE, and every player decides for themselves
         whether to buy it - which is why it shows up on their
         account rather than appearing in the bank from nowhere with
         nobody having been charged. */
      if (kind.id === 'major') {
        var price = d.monetisation.expansionPrice || 0;
        if (price > 0) {
          state.expansionSale = {
            id: plan.id, week: state.week, price: price,
            name: plan.name || pc.versionString(state.version)
          };
        }
      }
      St.saveRng(state, rng);
    }

    /* The release history is the patch notes screen. The changelog is
       stored with the release so it can be read back years later. */
    var record = {
      id: plan.id, week: state.week, kind: plan.kind,
      version: U.clone(state.version), versionText: pc.versionString(state.version),
      name: plan.name || '', notes: notes, notesGenerated: generated,
      auto: !!plan.auto, tuningOnly: !!plan.tuningOnly,
      work: work, planned: planned, funded: fraction,
      changes: PN.diff.lines(diff), headline: PN.diff.headline(diff),
      returned: returned, revenue: boxRevenue,
      bugs: newBugs
    };
    state.released = state.released || [];
    state.released.unshift(record);
    if (state.released.length > 200) state.released.length = 200;

    plan.status = 'shipped';
    plan.shippedWeek = state.week;
    plan.delta = null;
    pc.bumpRoadmap();
    /* Players now have what this release carried, so every release
       still on the board is measured against a new starting point -
       and the draft on screen has to be the one the player is editing,
       re-read from that new starting point. */
    var stillOpen = pc.plansInOrder(state);
    var mounted = PN.app && PN.app.sel ? PN.app.sel.planId : null;
    var keep = pc.planById(state, mounted) || stillOpen[0] || null;
    if (keep && keep.status !== 'planned') keep = stillOpen[0] || null;
    if (PN.app && PN.app.sel) PN.app.sel.planId = keep ? keep.id : null;
    state.design = pc.designFor(state, keep);
    if (PN.titles && PN.titles.stowField) PN.titles.stowField(state, 'design');

    St.log(state, kind.id === 'major' ? 'launch' : 'patch',
      (plan.name ? plan.name + ' — ' : '') + record.versionText + ' is live',
      notes + (fraction < 0.999
        ? ' (' + Math.round((1 - fraction) * 100) + '% of the plan was not finished in time.)' : ''),
      { version: record.versionText, work: work, returned: returned, revenue: boxRevenue });

    return { ok: true, record: record, work: work, funded: fraction,
             returned: returned, revenue: boxRevenue, changes: record.changes };
  }

  /* The title record behind the mounted state, so generators can write to
     it by reference. */
  function activeTitleRecord(state) {
    var ttl = titlesApi();
    var rec = ttl ? ttl.byId(state, state.activeTitleId) : null;
    /* The mounted fields ARE the record's fields, so a shim is fine for
       the single-title and test cases. */
    return rec || { design: state.design, titleName: (state.design.meta || {}).name,
                    version: state.version };
  }

  /* Ship the next planned release now. */
  function shipNext(state, opts) {
    var pc = patchApi();
    var plan = pc.nextPlan(state);
    if (!plan) return { ok: false, reason: 'Nothing is planned.' };
    return shipPlan(state, plan, opts);
  }

  /* Backwards-compatible "just ship the design as it stands", expressed as
     an unplanned small update. Used by saves and by the quick action. */
  function ship(state, opts) {
    opts = opts || {};
    var pc = patchApi();
    var c = completion(state);
    if (c.overall < 0.999 && !opts.force)
      return { ok: false, reason: 'Patch is ' + Math.round(c.overall * 100) + '% built.',
               completion: c.overall };
    var plan = pc.newPlan({
      kind: opts.kind || 'patch', targetWeek: state.week,
      name: opts.name || '', notes: opts.notes || ''
    });
    (state.patchPlan = state.patchPlan || []).push(plan);
    return shipPlan(state, plan, { force: true, partial: true });
  }


  /* How much a content drought costs the public mood.

     It used to be an unbounded 0.9 a week from week ten, so a game that
     had not patched in a year was at -50 whatever its players thought of
     it. That is the number that made every game die on schedule.

     Now it waits for the last release's goodwill to run out first - a
     major update holds far longer than a hotfix - then ramps slowly, and
     it stops at a real but survivable penalty. */
  var DROUGHT_CAP = 22;
  function droughtPenalty(state) {
    var rt = state.runtime || {};
    var weeks = rt.weeksSinceContent || 0;
    var kind = rt.lastReleaseKind || 'minor';
    var hold = (PN.novelty.HOLD_WEEKS[kind] === undefined
      ? PN.novelty.HOLD_WEEKS.minor : PN.novelty.HOLD_WEEKS[kind]) + 4;
    if (weeks <= hold) return 0;
    return Math.min(DROUGHT_CAP, (weeks - hold) * 0.34);
  }
  var POOLS = ['design', 'art', 'eng', 'qa'];

  /* Letting the studio plan releases for you.

     What this may and may not do is the whole point. It may schedule a
     release and it may run a tuning pass - nudge the balance numbers the
     way a maintenance patch does. It may NOT invent content and it may
     NOT touch a setting you own: those are your decisions, and an
     automatic system making them behind your back is how the old version
     grew zones you never authored.

     So automation ships small updates. When you have authored something
     yourself, it notices and schedules a release sized to fit it.    */

  function autoTick(state) {
    var a = state.automate;
    if (!a || !a.enabled || state.phase !== 'live') return null;
    var pc = patchApi();
    var pending = pc.plansInOrder(state);
    if (pending.length) return null;

    var cadence = Math.max(2, a.cadenceWeeks || 8);

    /* Has the player built anything since the last release? If so the
       next release carries it, sized to what it actually is. */
    var diff = pc.pendingDiff(state);
    var authored = !diff.empty;
    var kindId = authored ? PN.diff.suggestKind(diff) : 'patch';

    /* Only ship a release the studio can finish. Everything authored is
       already in the design, so the question is whether the capacity to
       build it will exist by the target week. */
    var cap = St.capacity(state);
    var ttl = titlesApi();
    var share = ttl ? U.clamp01((state.allocation === undefined ? 100 : state.allocation) / 100) : 1;
    var spread = ttl ? ttl.spreadPenalty(state) : 1;
    var need = pc.pendingCost(state);
    var weeks = cadence;
    POOLS.forEach(function (k) {
      var per = Math.max(0.01, cap[k] * share * spread);
      var banked = (state.progress || {})[k] || 0;
      var short = Math.max(0, (need[k] || 0) - banked);
      weeks = Math.max(weeks, Math.ceil(short / per));
    });
    weeks = Math.min(weeks, cadence * 4);

    /* A major release is an expansion and needs a name; automation only
       reaches for one when the player has actually authored that much. */
    var plan = pc.newPlan({
      kind: kindId, auto: true, shipWhenReady: true,
      targetWeek: state.week + weeks,
      name: kindId === 'major' ? autoExpansionName(state) : '',
      /* With nothing authored, the release is a tuning pass and says so. */
      tuningOnly: !authored
    });

    state.patchPlan = state.patchPlan || [];
    state.patchPlan.push(plan);
    return { planned: plan, authored: authored, weeks: weeks };
  }

  var AUTO_EXP_A = ['Rising', 'Shattered', 'Eternal', 'Drowned', 'Burning', 'Forgotten',
                    'Crimson', 'Hollow', 'Sovereign', 'Fractured'];
  var AUTO_EXP_B = ['Tide', 'Crown', 'Legacy', 'Covenant', 'Dominion', 'Reckoning',
                    'Ascension', 'Exile', 'Dawn', 'Requiem'];
  function autoExpansionName(state) {
    var rng = St.rngFor(state);
    var nm = rng.pick(AUTO_EXP_A) + ' ' + rng.pick(AUTO_EXP_B);
    St.saveRng(state, rng);
    return nm;
  }

  /* Ship anything whose week has come, or that is finished early and
     marked ship-when-ready. */
  function releaseDuePatches(state) {
    var pc = patchApi();
    var out = [];
    pc.plansInOrder(state).forEach(function (plan) {
      if (plan.status !== 'planned') return;
      /* THIS release's funding, against THIS release's bill. Asking
         without naming the release read a pool that a live game does
         not fill any more, so every release read as 0% built: the
         dated ones were pushed back four weeks for being unfinished,
         every week, for ever, and "ship as soon as it is finished"
         never fired at all because nothing was ever finished. */
      var fraction = pc.funded(state, plan);
      var due = state.week >= plan.targetWeek;
      /* "Ship as soon as it is finished" means finished EARLY - there
         has to be work outstanding for there to be anything to be
         ready for. A tuning pass has nothing to build, so it counted
         as fully funded the instant it was planned and shipped that
         same week, every week, whatever cadence you asked for. */
      var bill = pc.planCost(state, plan);
      var outstanding = Math.max(0, bill.design + bill.art + bill.eng + bill.qa);
      var early = plan.shipWhenReady && !plan.tuningOnly &&
                  outstanding > 0.5 && fraction >= 0.999;
      if (!due && !early) return;
      /* Automation slips rather than shipping a disaster. A 16%-funded
         expansion is not a release, it is an apology - so an auto-plan
         waits, and keeps waiting, and the drought clock keeps running,
         which is the honest consequence of over-planning. */
      if (due && plan.auto && fraction < 0.55) {
        plan.targetWeek = state.week + 4;
        plan.slipped = (plan.slipped || 0) + 1;
        /* After enough slips, admit it is too big and cut it down. */
        if (plan.slipped === 3) {
          St.log(state, 'warn', 'A planned release keeps slipping',
            (plan.name || pc.versionString(pc.nextVersion(state.version, plan.kind))) +
            ' is only ' + Math.round(fraction * 100) + '% built and has been pushed back ' +
            'three times. It is bigger than this team can make at this cadence.');
        }
        return;
      }
      /* A release the player planned themselves is their call, but the
         game will not quietly ship something almost empty. */
      if (due && !plan.auto && fraction < 0.30) return;
      var r = shipPlan(state, plan, { partial: true });
      if (r.ok) out.push(r);
    });
    return out;
  }

  /* ========================================================= AXES / STATE */

  function currentAxes(state) {
    var d = live(state);
    var rt = state.runtime;
    return PN.axes.compute(d, {
      era: state.era,
      economy: state.economy ? PN.economy.axisEffects(state) : null,
      runtime: {
        bugLoad: rt.bugLoad, techDebt: rt.techDebt, queuePressure: rt.queuePressure,
        outage: rt.outage, botPressure: rt.botPressure, exploitPressure: rt.exploitPressure
      }
    });
  }

  /* ============================================================ THE TICK

     One week for the whole studio. Studio work happens once; then every
     title gets its own week with that title mounted on the state, so the
     hundred-odd `state.agents` / `state.economy` references below this
     line keep meaning exactly what they always did - for whichever game
     is currently mounted.                                             */

  /* A studio with no game still has a week.

     Wages go out, people get tired, a search for somebody runs its
     course, and somebody can still hand in their notice. This used to
     fall through to the title path and die on its first line, which
     reads state.runtime - a thing that only exists once there is a
     game. So founding a studio and letting a single week pass before
     greenlighting anything was not possible, which is exactly what a
     decade where hiring takes six weeks asks you to do. */
  function advanceStudioOnly(state) {
    var rng = St.rngFor(state);
    state.week++;
    var cap = St.capacity(state);
    applyStudioWeek(state, cap);
    St.tickHiring(state);
    var gone = staffAttrition(state, rng);
    gone.forEach(function (g) {
      St.log(state, 'staff', g.name + ' has left',
        ((St.ROLE_BY_ID[g.role] || {}).name || g.role) + ', ' + g.weeks +
        ' weeks in. Morale ' + Math.round(g.morale) + '.');
    });
    state.studio.cash -= studioCosts(state).wages;
    if (PN.competitors) PN.competitors.init(state);
    St.saveRng(state, rng);
    return { week: state.week, events: [], studioOnly: true };
  }

  function advance(state) {
    var ttl = titlesApi();
    if (!state.titles || !state.titles.length) return advanceStudioOnly(state);
    if (!ttl) return advanceTitle(state, null);

    var rng = St.rngFor(state);
    state.week++;

    /* --- studio-level week, once ------------------------------------- */
    var cap = St.capacity(state);
    var crunchMult = applyStudioWeek(state, cap);
    var wages = studioCosts(state).wages;
    ttl.balanceAllocation(state);

    /* The rival market is one market, not one per game. */
    var compOut = null;
    var result = { week: state.week, events: [], titles: {} };

    /* --- each title plays its own week ------------------------------- */
    var revenue = 0, titleCost = 0;
    ttl.forEachTitle(state, function (t) {
      var r = advanceTitle(state, {
        cap: cap, crunchMult: crunchMult, rng: rng,
        sharedCompetitors: compOut
      });
      if (r && r.competitors) compOut = r.competitors;
      revenue += (state.finance.revenueWeek || 0);
      titleCost += (state.finance.costWeek || 0);
      result.titles[t.id] = r;
      if (r && r.events && r.events.length) result.events = result.events.concat(r.events);
    });

    /* --- the money, once -------------------------------------------- */
    state.studio.cash += revenue - wages - titleCost;
    state.portfolio = ttl.portfolio(state);
    state.portfolio.wages = wages;
    state.portfolio.revenueWeek = revenue;
    state.portfolio.costWeek = wages + titleCost;

    /* --- anybody found this week starts on Monday -------------------- */
    St.tickHiring(state);

    /* --- staff leave the studio, not a game -------------------------- */
    var gone = staffAttrition(state, rng);
    gone.forEach(function (g) {
      St.log(state, 'staff', g.name + ' has left',
        St.ROLE_BY_ID[g.role].name + '. Morale was ' + Math.round(g.morale) +
        ', burnout ' + Math.round(g.burnout) + '.');
    });

    /* Running more games than the team supports is worth saying out loud. */
    if (state.portfolio.over > 0 && state.week % 8 === 0) {
      St.log(state, 'warn', 'The team is spread across ' + ttl.building(state).length + ' games',
        'You are staffed for ' + state.portfolio.slots + '. Everything is moving at ' +
        Math.round(state.portfolio.spread * 100) + '% speed until you hire or close something.');
    }

    St.saveRng(state, rng);
    result.summary = { revenue: revenue, cost: wages + titleCost,
                       players: state.portfolio.players };
    return result;
  }

  /* One week for the title currently mounted on the state. */
  function advanceTitle(state, shared) {
    shared = shared || {};
    var rng = shared.rng || St.rngFor(state);
    /* A lone title still needs the week advanced; a portfolio has already
       done it at the studio level. */
    var standalone = !shared.cap;
    if (standalone) state.week++;
    /* Everybody who arrives this week, counted in one place. Releases
       and holidays let lapsed players back in long before the intake
       block runs, and they are joins like any other. */
    state.runtime.returnedThisWeek = 0;
    PN.expansions.advanceEra(state);
    var d = live(state);
    var cap = shared.cap || St.capacity(state);
    var crunchMult = shared.crunchMult || applyStudioWeek(state, cap);
    if (!state.progress) state.progress = { design: 0, art: 0, eng: 0, qa: 0 };
    applyTitleCapacity(state, cap, crunchMult);
    var costs = titleCosts(state);
    if (standalone) costs.total += studioCosts(state).wages;
    var result = { week: state.week, events: [] };

    if (state.phase === 'dead') { state.finance.revenueWeek = 0; state.finance.costWeek = 0; return result; }

    /* ---------------------------------------------------- pre-launch --- */
    if (state.phase !== 'live') {
      if (standalone) state.studio.cash -= costs.total;
      state.runtime.hype = U.clamp100(
        state.runtime.hype + (state.runtime.marketingSpend / 220) - 0.35
      );
      state.runtime.awareness = U.clamp100(
        state.runtime.awareness + (state.runtime.marketingSpend / 400) - 0.08
      );
      if (standalone) {
        var gone0 = staffAttrition(state, rng);
        gone0.forEach(function (g) {
          St.log(state, 'staff', g.name + ' has left',
            St.ROLE_BY_ID[g.role].name + ', ' + g.weeks + ' weeks in. Morale ' +
            Math.round(g.morale) + '.');
        });
      }
      state.finance.revenueWeek = 0;
      state.finance.costWeek = costs.total;
      state.finance.costTotal += costs.total;
      snapshot(state, null, costs);
      if (standalone) St.saveRng(state, rng);
      return result;
    }
    /* -------------------------------------------------------- live ----- */
    state.runtime.weeksSinceContent++;
    PN.economy.init(state);
    PN.expansions.initLapsed(state);

    var ax = currentAxes(state);
    var vals = PN.axes.values(ax);
    var coh = ax._ctx.coherence;
    var bal = ax._ctx.balance;
    var engOut = ax._ctx.engines;
    var fit = PN.axes.archetypeFit(d, ax, state.era);

    var lastChurnRate = state.population.total > 0
      ? (state.lastLeft || 0) / state.population.total : 0;

    var worldCache = PN.agents.buildWorldCache(state);

    /* What new players will be choosing between this week: the tier list
       as a score per build, and how short the game is of each role. A
       thirty-minute tank queue is what finally makes someone tank. */
    var buildScores = {};
    (bal.perBuild || bal.perClass || []).forEach(function (row) {
      if (row.cls) buildScores[row.cls.id] = row.pve;
    });
    var roleShortage = PN.builds.roleShortage(d, PN.builds.roleCounts(state));

    var ctx = {
      rng: rng, vals: vals, fit: fit, balance: bal, engines: engOut,
      lastChurnRate: lastChurnRate,
      /* Rival launches that are still pulling, by archetype. */
      rivalPull: PN.competitors.pullOn(state),
      world: worldCache,
      builds: worldCache.builds,
      buildScores: buildScores,
      roleShortage: roleShortage,
      /* What the people on the payroll are for, so the systems they
         affect can read them rather than only the capacity pools. */
      effects: cap.effects || {},
      goldSunk: 0
    };

    /* --- every player plays a week ---------------------------------- */
    var agentOut = PN.agents.tickAll(state, ctx);
    /* A new game is only new for so long. */
    PN.competitors.fadePull(state);
    agentOut.left = agentOut.left || 0;
    /* Leavers are not gone forever - they join the lapsed pool. */
    state.lastLeft = agentOut.left;

    /* --- the calendar -------------------------------------------------

       An event that has just opened pulls people back. That is what a
       holiday is for and why every real MMO runs one: a dated reason
       to reinstall, with something in it you cannot get in March. */
    var liveNow = PN.gameEvents.activeEvents(d, state);
    var sinceLaunch = Math.max(0, state.week - (state.launchWeek || 0));
    liveNow.forEach(function (ev) {
      if (PN.gameEvents.weekInto(ev, sinceLaunch) !== 0) return;   /* opening week only */
      var pull = PN.gameEvents.eventPull(d, ev);
      if (pull <= 0.01) return;
      PN.expansions.initLapsed(state);
      var back = 0;
      tax.ARCHETYPES.forEach(function (a) {
        var poolN = state.lapsed[a.id] || 0;
        /* Collectors and socialites are who a holiday is aimed at. */
        var keen = a.id === 'completionist' ? 1.6 : a.id === 'socialite' ? 1.4
                 : a.id === 'explorer' ? 1.2 : 0.8;
        var n = poolN * pull * keen * 0.28;
        if (n < 1) return;
        state.lapsed[a.id] = poolN - n;
        back += PN.agents.admit(state, a.id, n, ctx);
      });
      if (back > 0) {
        state.population.total = U.sum(state.agents, function (a) { return a.w; });
        /* A holiday pulling lapsed players back is people joining too. */
        state.runtime.returnedThisWeek = (state.runtime.returnedThisWeek || 0) + back;
        St.log(state, 'community', ev.name + ' has begun',
          U.fmtInt(back) + ' lapsed players came back for it. It runs for ' +
          (ev.weeks || 1) + ' week' + ((ev.weeks || 1) === 1 ? '' : 's') + '.',
          { returned: back });
      }
    });

    /* --- rivals ------------------------------------------------------
       One market, shared across the portfolio: the first title of the
       week advances it, the rest read the same result. */
    var compOut = shared.sharedCompetitors || PN.competitors.tick(state, ctx);
    result.competitors = compOut;
    compOut.events.forEach(function (e) {
      if (e.kind === 'launch') PN.competitors.launchShock(state, e.comp, ctx);
      if (e.kind === 'content') {
        var mini = U.clone(e.comp); mini.quality *= 0.55;
        PN.competitors.launchShock(state, mini, ctx);
      }
    });

    /* --- new players -------------------------------------------------- */
    /* What last week's economy does to this week's intake. Deflation is
       the worst of it: it suits everybody who already has money and
       gives somebody starting today no way to close the gap, so word
       gets round that it is too late to start. */
    var econFeel = PN.economy.axisEffects(state);
    var econGrowth = (econFeel && econFeel.growth) || 0;
    var acq = pop.acquire(state, fit, coh);
    var totalJoined = 0;
    tax.ARCHETYPES.forEach(function (arch) {
      var n = acq.byArchetype[arch.id];
      /* A crowded market means fewer people are looking for a new game. */
      n *= (1 - U.clamp01(compOut.pressure) * 0.7);
      n *= (1 + econGrowth);
      if (n <= 0) return;
      totalJoined += PN.agents.admit(state, arch.id, n, ctx);
    });
    state.population.lifetimeAccounts += totalJoined;
    /* Keep the simulated roster bounded. Past the cap each agent stands
       in for several players rather than the array growing forever.  */
    PN.agents.compact(state, rng);
    /* And the other way: when the roster has room again, the agents
       carrying several players each split back into individuals. */
    PN.agents.individuate(state, rng);

    /* A PvP season ends: the board is wiped and last season's top ten is
       kept as a record, because a ladder that never resets is a record
       book, not a season. */
    var seasonEnd = PN.ladder.tickSeason(state);
    if (seasonEnd && seasonEnd.top) {
      St.log(state, 'pvp', 'Season ' + (seasonEnd.season + 1) + ' has ended',
        seasonEnd.top.agent.nm + ' finished top of the ladder at ' +
        U.fmtInt(seasonEnd.top.rating) + '.', { season: seasonEnd.season });
    }

    /* --- guilds and the economy -------------------------------------- */
    var guildOut = PN.guilds.tick(state, ctx);
    var econ = PN.economy.tick(state, ctx);
    PN.expansions.decayLapsed(state);

    /* --- roll up ------------------------------------------------------ */
    var total = U.sum(state.agents, function (a) { return a.w; });
    state.population.total = total;
    state.population.peak = Math.max(state.population.peak, total);
    state.population.cohorts = PN.agents.aggregate(state);
    state.population.agentCount = state.agents.length;

    var meanSat = agentOut.meanSat;

    /* --- word of mouth, streamers, sentiment -------------------------- */
    var creatorSize = U.sum(state.agents.filter(function (a) { return a.a === 'creator'; }),
                            function (a) { return a.w; });
    var moodGate = 0.35 + (state.runtime.sentiment / 100) * 0.95;
    var wom = (U.saturate(total, 1600) * (meanSat - 58) * 0.052 +
               U.saturate(creatorSize, 22) * 2.9 * ((meanSat - 52) / 60)) * moodGate;
    /* A data scientist is what turns churn into a reason, and the
       cheapest thing that buys is marketing money landing in front of
       people who might actually stay. Same spend, more of it useful.

       This was in the role table and wired to nothing. */
    var telemetry = 1 + U.saturate((cap.effects || {}).telemetry || 0, 2.0) * 0.45;
    state.runtime.awareness = U.clamp100(
      state.runtime.awareness + wom * 0.16 +
      (state.runtime.marketingSpend / 460) * telemetry - 0.32
    );

    var liveQuality = U.clamp100(
      vals.stability * 0.20 + vals.value * 0.16 + vals.fairness * 0.14 +
      meanSat * 0.32 + coh.score * 0.18
    );
    state.runtime.reviewScore += (liveQuality - state.runtime.reviewScore) * 0.035;

    /* The public mood does not turn the week after a release. It holds
       for as long as that release was worth - a hotfix is forgotten in
       a month, an expansion carries most of a year - and then sours
       slowly rather than falling off a cliff.

       It is also bounded. A game people are genuinely enjoying does not
       end up with zero public sentiment because it has not patched; it
       ends up looking quiet, which is a much smaller thing. What the
       players think of it is meanSat above, and that carries most of
       the weight either way. */
    var sentimentTarget = U.clamp100(
      meanSat * 0.68 +
      d.liveOps.transparency * 0.09 + d.liveOps.commsFrequency * 0.07 +
      (cap.effects.sentiment || 0) * 4.5 -
      state.runtime.bugLoad * 0.22 - state.runtime.exploitPressure * 0.18 -
      droughtPenalty(state) -
      Math.max(0, (econ.inflation - 1.4)) * 18
    );
    state.runtime.sentiment += (sentimentTarget - state.runtime.sentiment) * 0.24;

    /* --- operational pressures ---------------------------------------- */
    var rt = state.runtime;
    var capacityPlayers = PN.infra.capacity(d);
    rt.queuePressure = U.clamp100(Math.max(0, (total / Math.max(1, capacityPlayers)) - 1) * 92);

    var fixRate = cap.qa * 1.5 + (d.liveOps.hotfixSpeed / 100) * 5.2 + (cap.effects.stability || 0) * 1.6;
    rt.bugLoad = U.clamp(rt.bugLoad - fixRate + rt.techDebt * 0.030, 0, 100);
    rt.outage = U.clamp(rt.outage * 0.55 +
      Math.max(0, rt.queuePressure - 40) * 0.06 +
      Math.max(0, rt.techDebt - 60) * 0.025 -
      (cap.effects.uptime || 0) * 0.8, 0, 100);

    var rmtAttract = (d.economy.tradingEnabled ? 1 : 0.15) * (d.economy.auctionHouse ? 1.3 : 1) *
                     (1 + engOut.grindIntensity / 130) * U.saturate(total, 600) *
                     U.clamp(econ.inflation, 0.5, 3);
    rt.botPressure = U.clamp100(rt.botPressure + rmtAttract * 3.4 - d.economy.antiRmtSpend * 0.11 - 0.5);
    rt.exploitPressure = U.clamp100(rt.exploitPressure + rt.bugLoad * 0.045 - d.liveOps.hotfixSpeed * 0.05 - 0.4);

    /* --- the roadmap -------------------------------------------------
       A planned release builds hype as it approaches, ships when its week
       comes, and is planned for you if automation is on.              */
    autoTick(state);
    var pc = patchApi();
    var upcoming = pc.nextPlan(state);
    if (upcoming) {
      var kd = pc.KIND_BY_ID[upcoming.kind] || pc.KIND_BY_ID.minor;
      var away = Math.max(0, upcoming.targetWeek - state.week);
      /* Anticipation is strongest just before a release you announced. */
      if (away <= 12) rt.hype = U.clamp100(rt.hype + (0.5 + (12 - away) * 0.09) * kd.hypeMult);
    }
    var shippedNow = releaseDuePatches(state);
    if (shippedNow.length) result.shipped = shippedNow;

    /* --- finance ------------------------------------------------------ */
    state.finance.revenueWeek = agentOut.revenue;
    state.finance.costWeek = costs.total;
    state.finance.revenueTotal += agentOut.revenue;
    state.finance.costTotal += costs.total;
    state.finance.arpuWeek = total > 0 ? agentOut.revenue / total : 0;
    /* Cash is settled once for the whole portfolio, unless this title is
       running on its own. */
    if (standalone) {
      state.studio.cash += agentOut.revenue - costs.total;
      var gone2 = staffAttrition(state, rng);
      gone2.forEach(function (g) {
        St.log(state, 'staff', g.name + ' has left',
          St.ROLE_BY_ID[g.role].name + '. Morale was ' + Math.round(g.morale) +
          ', burnout ' + Math.round(g.burnout) + '.');
      });
    }

    /* --- events -------------------------------------------------------

       Two sources. The cause engine writes crises out of what is
       actually wrong with THIS design and names it; the fixed list
       carries the things that happen to you from outside - a rival
       launch, a streamer, a regulator, somebody poaching your lead. */
    var evCtx = { axes: ax, vals: vals, balance: bal, coherence: coh,
                  meanSat: meanSat, economy: econ, competitors: compOut,
                  engines: ax._ctx ? ax._ctx.engines : null };
    result.events = [];
    if (PN.crises) {
      result.events = result.events.concat(PN.crises.roll(state, rng, evCtx));
    }
    if (PN.events) {
      result.events = result.events.concat(PN.events.roll(state, rng, evCtx));
    }

    /* --- scenario ------------------------------------------------------ */
    if (state.scenario && PN.scenarios) {
      var sc = PN.scenarios.evaluate(state);
      if (sc && sc.outcome !== 'running' && !state.scenario.resolved) {
        state.scenario.resolved = sc.outcome;
        St.log(state, sc.outcome === 'won' ? 'launch' : 'alert',
          sc.outcome === 'won' ? 'Scenario complete: ' + sc.scenario.name
            : sc.outcome === 'failed' ? 'Scenario failed: ' + sc.scenario.name
            : 'Scenario time is up: ' + sc.scenario.name,
          sc.outcome === 'won' ? 'Every objective met.'
            : sc.outcome === 'failed' ? 'The run ended here.'
            : sc.results.filter(function (r) { return !r.met; }).length +
              ' objective(s) unmet when the clock ran out.');
      }
    }

    /* Everybody who arrived this week, however they arrived.

       Only the fresh intake was ever counted. Lapsed players coming
       back for a release or a holiday are let in further down the
       week, long after the intake block has run - so an expansion
       that pulled five thousand people back drew a joins line that
       moved by six hundred, while the population line jumped by five
       thousand. Two graphs on the same screen disagreeing about the
       same week is worse than no graph. */
    totalJoined += state.runtime.returnedThisWeek || 0;
    state.population.lifetimeAccounts += state.runtime.returnedThisWeek || 0;
    /* And the headline figure with them in it. This was read off a
       local worked out before the release ran, so the week an
       expansion landed the population chart posted last week's number
       and caught up seven days late. */
    total = state.population.total;

    narrate(state, {
      total: total, joined: totalJoined, left: agentOut.left, meanSat: meanSat,
      vals: vals, cohorts: state.population.cohorts, balance: bal,
      guilds: guildOut, economy: econ, competitors: compOut
    });

    snapshot(state, {
      total: total, joined: totalJoined, left: agentOut.left, meanSat: meanSat,
      revenue: agentOut.revenue, vals: vals, coherence: coh.score,
      guilds: guildOut, economy: econ, rivals: compOut.totalRivalPlayers,
      lapsed: PN.expansions.totalLapsed(state)
    }, costs);

    if (standalone) St.saveRng(state, rng);
    result.summary = { total: total, joined: totalJoined, left: agentOut.left,
                       meanSat: meanSat, revenue: agentOut.revenue };
    return result;
  }

  /* Write the week's story into the log when something notable happens. */
  function narrate(state, s) {
    var prev = state.history[state.history.length - 1];
    if (!prev) return;
    var dPop = s.total - prev.total;
    var pct = prev.total > 0 ? dPop / prev.total : 0;

    if (pct < -0.10 && prev.total > 150) {
      var worst = null;
      s.cohorts.forEach(function (c) {
        if (c.size < 5) return;
        tax.AXIS_IDS.forEach(function (id) {
          var a = c.axisScores[id]; if (!a) return;
          var pain = (100 - a.score) * a.weight * c.size;
          if (!worst || pain > worst.pain) worst = { pain: pain, axis: id, co: c };
        });
      });
      if (worst) {
        St.log(state, 'alert', 'Population down ' + U.fmtPct(-pct * 100) + ' this week',
          tax.ARCHETYPE_BY_ID[worst.co.arch].name + 's are the loudest, and the axis hurting them most is ' +
          tax.AXIS_BY_ID[worst.axis].name + ' (' + Math.round(worst.co.axisScores[worst.axis].score) + '/100).',
          { axis: worst.axis, archetype: worst.co.arch });
      }
    }
    if (state.runtime.weeksSinceContent === 12) {
      St.log(state, 'warn', 'Twelve weeks without new content',
        'The forums have moved on to arguing about the last patch. Novelty is bleeding out across every cohort.');
    }
    if (s.balance.outliers.length && state.week % 6 === 0) {
      var o = s.balance.outliers[0];
      St.log(state, 'balance', o.cls.name + ' is an outlier',
        (o.pveDev > 0 ? 'Overperforming' : 'Underperforming') + ' by ' +
        U.fmtPct(Math.abs(o.pveDev) * 100) + ' against its role. Representation is skewing.',
        { classId: o.cls.id });
    }
    if (s.guilds && s.guilds.collapsed > 2) {
      St.log(state, 'community', s.guilds.collapsed + ' guilds disbanded this week',
        'When a guild core leaves, the people around them follow. Guilded players are ' +
        U.fmtPct((s.guilds.guildedShare || 0) * 100) + ' of the game.');
    }
    if (s.economy && s.economy.inflation > 1.8 && state.week % 8 === 0) {
      St.log(state, 'economy', 'Prices have run away',
        'Currency per player is ' + U.round(s.economy.inflation, 2) +
        'x what it was at launch. New players cannot afford to play the auction house.');
    }
  }

  function snapshot(state, s, costs) {
    var rt = state.runtime;
    state.history.push({
      week: state.week,
      phase: state.phase,
      total: s ? s.total : 0,
      joined: s ? s.joined : 0,
      left: s ? s.left : 0,
      satisfaction: s ? s.meanSat : 50,
      revenue: s ? s.revenue : 0,
      cost: costs ? costs.total : 0,
      cash: state.studio.cash,
      sentiment: rt.sentiment,
      awareness: rt.awareness,
      bugLoad: rt.bugLoad,
      techDebt: rt.techDebt,
      morale: state.studio.morale,
      axes: s ? U.clone(s.vals) : null,
      coherence: s ? s.coherence : null,
      guilds: s && s.guilds ? s.guilds.guilds : 0,
      guildedShare: s && s.guilds ? s.guilds.guildedShare : 0,
      inflation: s && s.economy ? s.economy.inflation : 1,
      rivals: s ? s.rivals : 0,
      lapsed: s ? s.lapsed : 0
    });
    if (state.history.length > 1200) state.history.shift();
  }

  PN.sim = {
    advance: advance, advanceStudioOnly: advanceStudioOnly, advanceTitle: advanceTitle,
    launch: launch, ship: ship, shipPlan: shipPlan, shipNext: shipNext,
    releaseDuePatches: releaseDuePatches, autoTick: autoTick,
    completion: completion, currentAxes: currentAxes, live: live,
    payroll: payroll, studioCosts: studioCosts, titleCosts: titleCosts,
    counterOffer: counterOffer, leaving: leaving, staffAttrition: staffAttrition,
    droughtPenalty: droughtPenalty,
    attritionRisk: attritionRisk, attritionReasons: attritionReasons,
    careerChangeRisk: careerChangeRisk,
    NOTICE_WEEKS: NOTICE_WEEKS
  };
})(PN);
