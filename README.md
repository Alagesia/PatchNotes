# Patch Notes

An MMORPG **design and management** tycoon. You are the Game Director, not the
level designer: you write the abilities, the quests, the loot tables and the
boss phases, then ship it to a few thousand simulated players who each have
their own level, their own bags and their own opinion of you.

See [docs/DESIGN.md](docs/DESIGN.md) for the full design bible.

---

## Run it

No Node, no npm, nothing to install. From PowerShell:

```powershell
Invoke-Item "dist\PatchNotes.html"
```

That is a single self-contained HTML file. It runs from `file://`, saves to
`localStorage`, and works offline.

To rebuild it after editing anything in `src/` or `styles/`:

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

Some browsers and preview panes refuse very large local files. If yours does,
serve the folder instead:

```powershell
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

…then open `http://localhost:8080/dist/PatchNotes.html`.

The test suite is `dist/selftest.html` — 229 checks including several full
multi-year campaigns. Open it in a browser; it reports pass/fail inline.

---


---

## How a run starts

You found a **studio**, not a game: name it, and pick the year you start in.
The year is the difficulty setting and a real one — it decides the size of the
market, what players forgive, how normal free-to-play is, and how much it costs
to look competent. 1999 is tiny and enormously forgiving; 2028 is a huge market
full of cynical players and expensive production.

A new studio has money, a team, and nothing in production. The design side of
the interface does not exist yet. Greenlight an MMO and it opens up.

Later, if you have the staff, you can greenlight a second — a sequel, or
something else entirely. A team runs about one game per dozen people; beyond
that everything still moves, just slower, which is how a studio ends up with
three mediocre games instead of one good one.

---

## Patches

A live MMO is not a design, it is a sequence of releases — which is what the
game is named after. You plan one **before** you build it:

| Size | Version | What it is |
|---|---|---|
| **Small update** | v1.0.**X** | Fixes and tuning. Cheap, frequent, unglamorous. |
| **Minor update** | v1.**X**.0 | A content patch. The backbone of a live game. |
| **Major update** | v**X**.0.0 | An expansion. Always named, and the game holds you to it. |

You pick the size, name it if it is an expansion, write the patch notes, and say
what content it carries — zones, dungeons, raids, gear tiers, questlines, a new
class, a level-cap raise. When it ships, that intent is **generated as real
content**: zones with real monsters and quests, dungeons with real bosses and
real loot tables. There is no second code path where an expansion means "some
sliders moved".

Then you find out whether you financed it. A release ships whatever was actually
paid for and says how much was not, so a patch you underfunded arrives smaller
rather than later.

**Automatic patches** keep a roadmap running whether or not you are still
authoring. They plan against what the studio can actually build, pool by pool:
a small team auto-plans content patches with small fixes in between, a big one
auto-plans expansions. It slips a release rather than shipping one at sixteen
percent and calling it an expansion.

---

## Finding your way around

Navigation is one surface: the left rail, in collapsible groups. There is no
tab strip — twelve design sections in a wrapping strip was the single worst
thing about the first build.

- **Ctrl+K** (or `/`) opens **Jump to anything**: fuzzy-search every section
  *and* every object you have authored — classes, abilities, items, zones,
  monsters, quests, dungeons, bosses, talent branches. Pick one and it takes
  you to the right section with that object already selected. `hvstrk` finds
  *Heavy Strike*.
- **!** opens the **Problems** drawer: every dangling pointer and unfinished
  bit of wiring, grouped by severity. Click a row to go and fix it. The rail
  badge shows the count.
- **1–8** jump between the live-game screens and the studio; **space** advances
  a week.

Master/detail screens scroll their two columns independently, and panel headers
stay put, so picking the next thing to edit never means scrolling back past the
editor you just finished with.

## What the game is

Eleven authoring sections, all of which feed one simulation:

| Tab | What you author |
|---|---|
| **Identity** | Setting, tone, combat paradigm, world structure, roles, death penalty, factions |
| **Progression** | Model, level cap, XP curve, catch-up, alt friction, and the character-system fork: classes or a talent tree |
| **Combat & Stats** | Your own primary and secondary stats, gear budget curve, global cooldown — plus *derived* time-to-kill readouts |
| **Abilities** | Individual abilities: cooldown, cast, channel, charges, range, radius, targets, resource cost and gain, and 29 effect types |
| **Classes / Talents** | Under a class system: ability kits, primary stat, solved rotation, PvE and PvP scores, balance table. Under a talent system: branches, tiered nodes, either/or choices, and the builds they compile to. Either way, balance is measured per *build* |
| **Items & Rewards** | Gear with real stats against a budget, currencies, consumables, materials, cosmetics; weighted loot tables; reward bundles |
| **World & Quests** | Zones that own monsters, questgivers and quests; quests with objectives that point at real monsters and items; reward chains |
| **PvE** | Dungeons and raids placed in zones, bosses placed in dungeons, multi-phase encounters, loot and completion rewards |
| **PvP** | Arena maps with real parameters, objective modes, the ladder, season rewards |

Plus the studio side: **Your Studio**, **Games** (the portfolio), **Patches**,
Dashboard, Telemetry, **Players**, **Economy**, Community and Market.

---

## Three ideas the whole thing rests on

**1. Everything derives from what you authored.**
Time-to-kill is not a slider. It comes out of a rotation solver that reads the
abilities you wrote and the gear you designed. Change one ability's power
coefficient and that class's DPS, its solved rotation, the game's time-to-kill
and its balance quality all move. Monster health is pinned to a baseline power
curve, so a stronger kit really does kill things faster.

**2. Every player is a real player.**
The world is scaled down roughly 100× from the real genre — a hit here is a few
thousand players, not millions — which makes it affordable to give every single
one a level, sixteen gear slots, a bag, currencies, a guild and a class. They
pick up quests, run dungeons, roll on your loot tables, equip upgrades, buy from
vendors, and judge the game on ten need axes. You can open any one of them and
read their character sheet.

**3. Every number is traceable.**
`axes.js` records a labelled contribution for every term it adds. The causal
chain viewer replays that list, so a population drop can always be walked back
to the design decision that caused it.

---

## Architecture

Plain JavaScript on a single global `PN` namespace. No framework, no modules,
no transpiler. Each file registers onto `PN`; the bundler concatenates them.

```
src/core/ns.js          maths, deterministic RNG, formatting, event bus
src/data/taxonomy.js    need axes, archetypes, skill bands, eras, market scale
src/data/primitives.js  combat paradigms, boss mechanics, content engines, shop categories
src/data/presets.js     six complete, fully-wired MMOs
src/data/scenarios.js   sandbox plus five scenarios with objectives and failure states

src/design/stats.js     the player's own stat set, gear slots, rarities, item budgets
src/design/items.js     items, loot tables, reward bundles
src/design/abilities.js ability authoring: 29 effect types, 49 templates
src/design/talents.js   talent branches and nodes, compiled into playable builds
src/design/builds.js    class x role x stat - what a player actually plays
src/design/pvp.js       arena maps, objective modes, class-map affinity, the ladder
src/design/world.js     monsters, questgivers, quests, zone generators
src/design/schema.js    the authorable design object - saves are this, as JSON
src/design/metrics.js   derived numbers and a design-integrity checker
src/design/coherence.js the tag synergy/conflict web
src/design/axes.js      design + runtime -> ten need axes, with labelled contributions

src/sim/combat.js       rotation solver: DPS, HPS, EHP, PvE/PvP scores, time-to-kill
src/sim/state.js        the studio, staff, capacity, starting years
src/sim/titles.js       the portfolio, and the mount model that makes it work
src/sim/patches.js      planned releases, versions, notes, content intent
src/sim/agents.js       individual players: inventory, gear, levelling, churn, spend
src/sim/guilds.js       the social graph and churn contagion
src/sim/economy.js      counted currency, faucets, sinks, inflation
src/sim/expansions.js   the shared content makers, lapsed players, era progression
src/sim/competitors.js  rival studios as live actors
src/sim/population.js   acquisition and archetype market mix
src/sim/events.js       live-service crises
src/sim/tick.js         the weekly tick

src/ui/*                charts, components, and the nine view modules
```

---

## Notes for extending it

- **The draft/shipped split.** `state.design` is the draft; `state.shipped` is
  what players actually have. The sim only ever reads `shipped`. Authoring is
  free; shipping costs capacity-weeks.
- **Everything points at everything by id.** Quests point at monsters and
  reward bundles, bosses at dungeons and loot tables, pass tiers at rewards.
  `metrics.integrity()` finds every dangling pointer; the UI surfaces them as
  warnings on the object itself.
- **`targetItemLevel` is the median of the best item per slot**, not a formula.
  If you author a tier, that *is* the current tier. One absurd item is ignored
  (anything over 2.5× the median).
- **A class can only wear gear carrying its own primary stat.** The primary is
  derived from whether its abilities are spells or attacks, unless you set it
  explicitly. Getting this wrong makes mages wear plate and breaks every
  downstream number.
- **Inflation is a rate, not a total** — currency per unit of expected wealth
  now versus a year ago. A fixed launch baseline drifts with the population's
  level mix and reads 20× when nothing is wrong.
- **Sinks must scale with wealth, not just income.** Taxing income alone has no
  equilibrium and the economy inflates forever. This is exactly what happens in
  real MMOs that only tax income.
- **Aggregate churn rate falls during a drought** — acquisition collapses first,
  so the survivors are long-tenured veterans. Measure per-agent churn chance
  instead.
- **Content engines have hard aggregate diminishing returns** (`ENGINE_CAP` in
  `agents.js`). Bolting on a tenth grind does not give players a tenth more to
  do. Remove that cap and drought becomes impossible.
- **Churn is an S-curve on satisfaction**, not a line. Satisfaction around 70 is
  not a healthy game, it is a game people drift away from.
- Grid layouts use `minmax(0, 1fr)` and `auto-fit` throughout. Plain `1fr`
  collapses to zero inside narrow columns and silently hides every bar chart.
- **Exactly one title is MOUNTED on the state at a time.** `state.design`,
  `state.agents`, `state.economy` and the rest are the *active* game's fields;
  the others wait as records in `state.titles`. The weekly tick mounts each in
  turn. `TITLE_FIELDS` in `titles.js` is the most important list in the
  codebase — a field that belongs to a game but is missing from it leaks across
  every title in the portfolio.
- **Editing a title record while one is mounted needs `syncField`.** The next
  unmount overwrites the record from the mounted copy, so a change written to
  the record alone is silently lost. `syncField` pushes one named field back.
  It is deliberately *not* a blanket copy: syncing everything clobbers whatever
  the mounted title changed but has not written back, which is what made a
  second title quietly refuse to launch.
- **A build is what a player plays, not a class.** `PN.builds.enumerate` is
  class × viable role × viable stat. Roles come from the kit (a "tank" with no
  taunt is not one) and stats from what the abilities actually scale off. A stat
  must power 40% of the kit before it opens a build — below that it is a trap,
  not a choice.
- **A primary stat powers one kind of ability, not both.** `characterProfile`
  splits attack and spell power, with an off-stat floor. Without this every
  stat build is numerically identical and the choice is decoration.
- **Players do not chase the meta.** Taste first, tier list second, weighted by
  `META_PULL` per archetype. If everyone ends up on the best build, that
  weighting is wrong, not the sim.
- **Automation plans against capacity pool by pool.** Sizing against the total
  was a real bug: content is art-heavy and funding is measured on the *worst*
  pool, so plans that fitted the total were always short on art and slipped
  forever. A small studio should ship less often, not blander — so the cadence
  stretches rather than the content thinning.
- **Repair costs are a share of income, not hours × level.** Hours times levels
  is not money; it outgrew income at every level, so drain permanently exceeded
  income, no gold ever accumulated, and the inflation metric was measuring an
  empty economy.
- **`PN.schema.playable(design)` is the seam between authoring and the sim.**
  Under a class system it returns the authored classes; under a talent system it
  returns the branches compiled into class-shaped builds. The rotation solver,
  the balance table and the agent sim all read it and none of them know which
  system is on. Add a third character system by teaching that one function
  about it. `PN.schema.tunable()` is its mutable counterpart — balance hotfixes
  have to land on the class or branch, not on a derived copy that gets thrown
  away on the next recompile.
- **A talent point budget is the balance lever, not the node count.** A tree
  whose branches cost less than one budget has no choices in it; `treeMetrics`
  reports `reach` for exactly this reason, and `sizeToBudget()` rescales node
  costs so a branch is worth about 1.15 budgets.
- **Talent splash goes to one other branch, not the whole tree.** Spending the
  leftovers across every branch made all six builds converge on the same kit
  and crashed PvP time-to-kill to two seconds. Real players commit to one
  secondary path; so does the compiler.
- **Filler is measured, not dialled.** The old build had a "filler node ratio"
  slider, which had it backwards: filler is a property you can read off a tree
  once it exists (`isFiller` — a small percentage on a boring lever), so the
  need axes read the real number instead of a claimed one.
- **Quests have no type; they are their objectives.** Hours, enjoyment, content
  categories and build cost all derive from what the quest asks you to do. Ten
  is the baseline count, and only `kill`, `collect` and `tame` are `countable` —
  nothing else carries a number, because nobody escorts a man ten times.
- **PvP time-to-kill is a median across non-healers.** Averaging in a healer who
  cannot kill anybody made a two-second duel read as twenty-one seconds and hid
  a real balance problem for the whole first build.
- **`pvp.damping` is the genre's duel-length lever** (resilience, expertise, a
  stat template — every PvP game ships one). Without it, burst tuned against a
  raid boss deletes players instantly and there is nothing you can do about it.
- **Every range control is paired with a typed box.** `ui.slider` for
  state-bound fields, `ui.rangeAct` for action-bound ones. Do not hand-write an
  `<input type="range">`; use one of those two, or the value becomes
  drag-only and unreachable for precise work.
- **Panel headers use a container query, not a media query.** How wide one
  column of a three-pane screen is has nothing to do with the viewport.

---

## Still not built

The design doc describes more than the game currently does. Honest gaps:

- Crafting is a dial, not an authored recipe tree.
- Talent-tree builds are still compiled by a greedy spend per branch, so two
  players on the same branch run the same nodes. Role and stat vary per player;
  which nodes they picked does not.
- Sequels are just another title. A sequel does not cannibalise its parent's
  players, and it should.
- Specs exist on classes but are not separately balanced.
- Housing, collections and achievements are content engines rather than
  authored objects the way gear and quests now are.
- Competitor studios do not author designs of their own; they are modelled by
  angle, quality and momentum.
