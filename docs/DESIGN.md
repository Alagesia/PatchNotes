# PATCH NOTES
### An MMORPG Design & Management Tycoon

> You are not the architect of a world. You are the **Game Director** of a live MMO.
> You don't place trees. You decide what a level *means*, what a boss *demands*,
> and what your players will forgive.

---

## 1. The Pitch

MMORPG Tycoon 2 and Let's Build a Dungeon ask: *can you build a world?*
**Patch Notes** asks: *can you design a game, and then survive it?*

You author an MMO as a **systems document** — combat paradigm, classes, stats,
progression curves, quest graphs, boss phase tables, loot tables, economies,
monetisation. Then you ship it to a living market of simulated players who
progress, plateau, organise, complain, spend, and quit. Your telemetry tells you
*what* happened. Your job is to work out *why*, and write the next patch.

There is no build mode. There is no camera in the world. The world exists only as
numbers, tags, and consequences — and that is the point.

---

## 2. Design Pillars

**P1 — Authorship over placement.**
Every knob that makes MMOs feel different from each other is exposed. A player
should be able to build a tab-target themepark raiding game, a lane-based
competitive arena, a gearscore-driven grind sandbox, or a creature-collection MMO
using the *same* authoring tools, and have the simulation treat all four as
legitimate.

**P2 — Coherence beats optimisation.**
There is no single correct build. There are *internally consistent* designs and
*muddled* ones. The simulation rewards games that know what they are and who they
are for. A game that tries to serve everyone serves no-one — and the numbers will
say so.

**P3 — The content race is the core tension.**
Players consume content faster than studios can produce it. Every system you
author is either **finite content** (burns down) or a **content engine**
(regenerates, with diminishing returns and its own costs). Managing that ratio is
the central management problem of a real MMO, and of this game.

**P4 — Legible consequence.**
Every number that moves must be traceable to a decision. The UI's most important
job is the causal chain: *raid clear rate fell -> raiders' Challenge need
overshot -> guild fragmentation -> social contagion churn -> -8% subs.* No black
boxes.

**P5 — Your playerbase is a character.**
Not a resource bar. A population with factions, opinions, memory, and a forum.

---

## 3. The Core Loop

```
   +--------------+
   |    DESIGN    |  author/patch systems, content, monetisation
   +------+-------+
          |  costs studio capacity, accrues tech debt
          v
   +--------------+
   |     SHIP     |  patch day / content drop / expansion / season
   +------+-------+
          |
          v
   +--------------+
   |   SIMULATE   |  weeks tick; cohorts play, progress, judge, spend, churn
   +------+-------+
          |
          v
   +--------------+
   |   OBSERVE    |  telemetry, forums, reviews, streams, revenue, crises
   +------+-------+
          |
          v
   +--------------+
   |   DIAGNOSE   |  which need axis broke, for which archetype, and why
   +------+-------+
          +---------> back to DESIGN
```

One tick = **1 week** of live service. Expansions span years. A campaign runs a
studio across an era.

---

## 4. The Three Layers

| Layer | You control | The game simulates |
|---|---|---|
| **Design** | Rules, content, numbers, monetisation | Derived design metrics, coherence |
| **Operate** | Studio, staff, budget, patch cadence, infra, moderation | Capacity, morale, bugs, tech debt, uptime |
| **Market** | Marketing, positioning, pricing, platform | Acquisition, archetype mix, competitors, press |

---

## 5. What Is Authorable

This is the heart of the game. Everything below is player-defined.

### 5.1 Game Identity
- **Setting**: high fantasy, sci-fi, space opera, post-apoc, modern occult, wuxia,
  creature-collection, mythological, horror, superhero, historical — plus tone.
- **Combat paradigm**: tab-target, action/soft-lock, full action, twitch shooter,
  MOBA, turn-based, tactical grid, auto-battler, rhythm.
- **World structure**: seamless open world, zoned themepark, instanced hub-based,
  sharded sandbox, session/match-based, procedural, persistent single-shard.
- **Camera/scale**: first person, third person, isometric, top-down.
- **Death penalty**: none, durability, XP loss, corpse run, item drop, full loot,
  permadeath tier.
- **Session shape**: designed for 20-minute sessions or 4-hour raid nights.

### 5.2 Factions, Races, Identity
- Faction count and relationship (hard-locked PvP factions / soft / none /
  three-way), cross-faction rules, faction-specific content, faction imbalance
  consequences.
- Races with stat modifiers, racial abilities, aesthetic diversity score.
- Character creator depth (a real dial with real cost and real payoff for
  Roleplayers and Completionists).

### 5.3 Stats & Combat Maths
- Define your **own stat set** — primaries, secondaries, derived.
- Damage formula composition (additive/multiplicative layers, mitigation curves,
  diminishing returns, crit model, avoidance).
- Resource systems (mana, rage, energy, cooldown-only, ammo, combo points,
  charge/decay).
- Time-to-kill targets for PvE and PvP separately — the single most important
  feel dial in the game.
- Global cooldown, cast times, mobility budget, animation lock.

### 5.4 Classes & Specialisations
Classes are **composed from ability primitives**, not picked from a list.
- Ability primitives carry tags: `damage/burst/sustained/dot/aoe/cleave`,
  `heal/hot/shield/dispel`, `tank/threat/mitigation`, `cc/hard/soft/root/silence`,
  `mobility/blink/dash/leap`, `utility/buff/debuff/summon/pet`, `resource`,
  `channelled`, `positional`, `reactive`, `cooldown-tier`.
- Derived per class: **Skill Floor**, **Skill Ceiling**, **Button Count**,
  **Rotation Complexity**, **Burst Index**, **Sustain Index**, **Survivability**,
  **Mobility**, **Group Value**, **Solo Value**, **Fantasy Clarity**.
- Role system: rigid trinity / flexible / roleless / hybrid-per-spec.
- Specs per class, respec friction, talent/skill trees (node budget, choice nodes
  vs. filler nodes — filler ratio is a real satisfaction input).
- **Balance is simulated**: classes are auto-compared per content type. Outliers
  create representation skew -> forum pressure -> reroll churn -> homogenisation
  complaints.

### 5.5 Progression
- **Model**: level-based, levelless/horizontal, gear-score, mastery/skill-use,
  match-based rank, creature-collection, or hybrid.
- XP curve editor (banded, formula, or hand-drawn), level cap, target
  time-to-cap, catch-up mechanics, level scaling/mentoring, alt friction.
- Alternate advancement, prestige, account-wide progression.
- **Vertical vs horizontal ratio** — the dial that separates WoW from GW2.

### 5.6 Quests & Narrative
- **Quest graph authoring**: quests as nodes with types (kill, collect, escort,
  puzzle, dialogue, exploration, timed, chain, world event, dynamic event),
  gating, branching, and **reward chains** that can span dozens of steps across
  zones, currencies, reputations, and unlocks.
- Storytelling mode: fully voiced cinematic / text / environmental / none.
- Narrative structure: personal story per class, faction campaigns, shared world
  story, episodic seasons.
- **Reward chain designer**: define multi-stage chains with checkpoints, pity
  timers, catch-up, expiry, and account-wide vs character-bound outcomes. Chain
  *shape* (front-loaded, back-loaded, steady, spiky) drives retention curves.

### 5.7 Zones, Dungeons, Raids, Encounters
- Zones: level band, size, density, aesthetic budget, secrets, world bosses.
- Dungeons: group size, length, difficulty tiers, scaling model, lockouts,
  affix/modifier systems, matchmaking rules.
- **Boss encounter designer** — the showpiece:
  - Multi-phase: phases triggered by HP %, timer, add state, or player action.
  - Per phase: mechanic loadout, damage profile, enrage, transition type.
  - **Mechanic primitives**: ground AoE, tank swap, add waves, DPS check, heal
    check, interrupt rotation, positional/stack/spread, movement puzzle,
    coordination puzzle, RNG targeting, environmental hazard, soft/hard enrage,
    role-specific mechanic, raid-wide burst, dispel chain, phase-transition burn.
  - Derived: **Difficulty**, **Coordination Load**, **Execution Load**,
    **Gear Check**, **Learn Time**, **Wipe Frustration**, **Spectacle**.
  - The sim computes **weekly clear rates per difficulty tier** against your
    playerbase's skill distribution, then feeds raider satisfaction, guild
    survival, streamer coverage, and forum sentiment.

### 5.8 Gearing & Loot
- Item level model, rarity tiers, stat budget per slot, set bonuses, procs,
  legendaries with questlines.
- **Loot tables** with drop rates, bad-luck protection, personal vs group loot,
  trade rules, currency-based vendors, upgrade tracks.
- Gear treadmill config: reset severity per patch, catch-up bands, borrowed
  power systems, crafting parity, sockets/enchants/reforging.
- The **gearing anxiety curve** — how fast last tier becomes worthless — is a
  primary driver of both retention and resentment.

### 5.9 Economy
- Currency design (how many, what they gate, binding rules).
- **Faucets and sinks** with real flow simulation -> inflation/deflation.
- Crafting depth, gathering, node contention, recipe rarity, crafted-vs-drop
  parity.
- Player trading, auction house design, taxes.
- Gold sellers, RMT pressure, bot infestation — emergent, and you must respond.

### 5.10 Endgame & Repeatables
The **content engines** that generate synthetic hours:
- Raid tiers, scaling keystone dungeons, PvP arenas/battlegrounds/open-world,
  ranked ladders and seasons, reputations, collections (mounts/pets/cosmetics),
  achievements, housing, professions, world events, daily/weekly systems,
  roguelike modes, creature collection/breeding/battling.
- Each has: hour generation rate, decay curve, archetype appeal, dev upkeep cost.

### 5.11 Social
- Guild systems (size, perks, banks, halls, progression), group finder depth,
  cross-realm, chat and voice, friend/mentor systems, community tooling.
- Social graph density directly controls **churn contagion**: when a guild's core
  quits, the periphery follows. Social systems are your strongest retention lever
  and the hardest to measure.

### 5.12 Monetisation
- Model: subscription, box + expansions, F2P cosmetic, F2P convenience, F2P
  competitive advantage, hybrid, seasonal.
- Cash shop catalogue: cosmetics, mounts, boosts, convenience, storage,
  transfers, power. Each entry has a price, appeal, and **Fairness cost**.
- **Battle Pass designer**: season length, free vs premium track, reward chain
  contents and shape, grind rate per week, catch-up, FOMO intensity, carryover.
  Get it wrong in either direction and you either leave money on the table or
  trigger a Value/Fairness revolt.
- Lootboxes with regional regulatory risk.
- Price points, regional pricing, founder packs, sales cadence.

### 5.13 Live Operations
- Patch cadence and size, PTR/beta usage, hotfix speed, communication tone and
  frequency, transparency policy.
- Seasons/events, anniversary content, holiday events.
- Server infrastructure, region coverage, queue management, merges, transfers.
- Moderation and anti-cheat investment.

---

## 6. The Simulated Playerbase

### 6.1 Archetypes
The market is a distribution over archetypes. Your design attracts some and
repels others. Serving the ones you attracted is retention.

| Archetype | Wants | Danger |
|---|---|---|
| **Progressor** | A ladder, numbers going up, clear next step | Hits cap, evaporates |
| **Raider** | Organised difficulty, mastery, tiers | Clears content, drought-sensitive |
| **Competitor** | Ranked PvP, fair balance, skill expression | Brutally balance-sensitive |
| **Socialite** | Guilds, chat, events, belonging | Churn contagion hub |
| **Explorer** | World, secrets, lore, scale | Hates instance-only design |
| **Completionist** | Collections, achievements, breadth | Enormous breadth burn |
| **Economist** | Crafting, markets, arbitrage | Killed by inflation or no trade |
| **Roleplayer** | Identity, customisation, housing | Low spend unless cosmetics exist |
| **Drifter** | Low friction, short sessions, catch-up | Huge population, huge churn |
| **Creator** | Spectacle, novelty, drama, clippable moments | Acquisition multiplier; can turn |

Overlaid with a spend tier: **Freeloader / Minnow / Dolphin / Whale**, and a
**skill distribution** that determines who can actually clear what you built.

### 6.2 Need Axes
Every cohort scores your game weekly on ten axes:

`Progression` - `Challenge` - `Accessibility` - `Mastery` - `Novelty` -
`Social` - `Identity` - `Fairness` - `Stability` - `Value`

Each archetype weights these differently, and several are **opposed**
(Challenge vs Accessibility, Novelty vs Stability, Value vs Revenue). You cannot
max them all. Satisfaction drives retention; retention drives everything.

### 6.3 Content Burn
Every piece of finite content has **content hours** and a **replay factor**.
Cohorts consume against their weekly time budget and archetype appeal. When a
cohort exhausts content it cares about, `Novelty` collapses and churn spikes.

**Drought is the default state of an MMO.** Content engines, reward chain
pacing, lockouts, and grind rates are your tools to stretch finite content
across the gap between drops — each with a Value/Fairness cost if overdone.

### 6.4 Coherence
Every design element carries tags. A pairwise synergy matrix produces a global
**Coherence** score that modifies marketing efficiency, development cost, and
satisfaction ceilings. Full-action combat with a 40-button rotation, or
hardcore corpse-run death penalty with a Drifter-targeted marketing campaign,
will be punished. Coherence is how "build WoW" and "build League" are both
correct answers.

---

## 7. The Studio

- **Roles**: systems design, content design, encounter design, narrative,
  client/server/tools engineering, character/environment/VFX art, QA, community,
  SRE/ops, economy analyst, data scientist, producer.
- **Capacity pools**: Design, Art, Engineering, QA. Everything you author draws
  from them.
- **Morale, burnout, attrition, salary, seniority, specialisation.**
- **Crunch**: faster shipping, more bugs, morale collapse, attrition spike.
- **Tech debt**: accrues from rushed work; raises bug rate, cost, and outage risk
  until you spend capacity paying it down. Nobody ever wants to.

---

## 8. Crises & Emergent Events

Exploits and dupes, gold sellers, bot farms, DDoS, launch queues, class balance
revolts, an economy that runs away, a beloved designer poached, a competitor
expansion landing on your patch day, a streamer meltdown, a lootbox regulator,
a data breach, a server merge nobody wants, a beloved system you removed.

Each is a decision with no clean answer and a real cost either way.

---

## 9. Meta-Structure

- **Sandbox** — unlimited budget optional, pure design toy.
- **Campaign** — run a studio across an era; expansions, sequels, legacy.
- **Scenarios** — *Launch in 2004.* *Save a dying game.* *Go free-to-play without
  a riot.* *Ship an expansion in six months.* *Compete with a giant.*
- **Era system** — start anywhere from 1999 to 2030. Tech budgets, market size,
  genre expectations, and monetisation norms all shift. What shipped in 2004
  fails in 2024, and the game knows it.
- **Templates** — start from a themepark, arena, sandbox, or collection-MMO
  preset, then make it yours. Presets are *starting points*, never win buttons.

---

## 10. UI Architecture

Six primary views:

1. **Dashboard** — population, revenue, sentiment, alerts, the week's story.
2. **Design Studio** — the authoring suite (identity, classes, progression,
   content, gearing, economy, monetisation).
3. **Telemetry** — charts, cohort breakdowns, funnels, the causal chain viewer.
4. **Community** — forums, reviews, streamers, social listening.
5. **Studio** — staff, capacity, roadmap, patch planning.
6. **Market** — competitors, marketing, platform, press.

The **Causal Chain Viewer** is the flagship UI: click any metric movement and
walk backwards through exactly which design decision caused it.

---

## 11. Technology

Zero-dependency browser application: plain JavaScript in a global namespace, no
build step, no package manager, runs from `index.html`. Deterministic seeded RNG
so runs are reproducible and bugs are debuggable. State is a single serialisable
object — saves are JSON, and so are player-made game designs, which makes them
shareable.

---

## 12. Roadmap

- **M1 — Foundations**: taxonomy, schema, derived metrics, coherence engine.
- **M2 — Simulation core**: cohorts, needs, content burn, retention, revenue.
- **M3 — Authoring suite**: identity, classes, progression, encounters, loot.
- **M4 — Studio & live ops**: staff, capacity, patches, tech debt, crises.
- **M5 — Market**: competitors, marketing, press, era system.
- **M6 — Depth pass**: economy simulation, social graph, balance analytics.
- **M7 — Meta**: campaign, scenarios, presets, sharing.
