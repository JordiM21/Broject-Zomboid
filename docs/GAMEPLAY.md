# Last Haul: gameplay plan

The rules for how this game should feel, and what keeps it going after the town is picked clean. When a feature idea comes up, check it against the rules in section 3.

**The promise:** you and a partner bet what you're carrying on one more trip into a town that gets worse every day, until you decide you've got enough to leave.

## 2.0: outpost and raids (supersedes parts of sections 2, 3 and 8)

The town is no longer one persistent map with a safehouse in the middle. 2.0 splits it in two:

- **The Outpost** is a fenced hub south of the forest that zombies can never reach. It holds the Stash (200 to 800 slots, with tabs per category), the Workbench (upgrades, crafting, repairs with Scrap), the radio, the bed, the Raid Board and four gun displays.
- **A raid** starts when everyone boards the bus. Each raid generates a fresh city with no safe zones, drops the team at a bus stop next to a crate of 2 melee weapons and 2 loaded guns with ammo and a mod, and marks an extraction pad with green smoke across town.
- **The clock** gives 15 minutes. After that, overtime: zombies get faster, hit harder and come in waves aimed at whoever is still out there. This replaces "no countdown timers" in section 8.
- **Downed, not dead.** At 0 health in a raid you go down for 75 seconds: crawl, get revived by a partner holding E, or crawl into the extraction ring. Bleeding out is death: your carried gear stays on your body in that city, so a partner still out there can bring it home.
- **Sealed rooms** in every city: a keycard vault (the card is in a police office), a twin-lever bunker (both levers within 4 seconds, built for two) and a keypad bunker (four notes in the camps around it). Each armory holds 2+ loaded guns, ammo and mods.
- **Inventory** works like Minecraft: 36 slots with the first 9 as the hotbar, click to pick up and put down, right-click for half or one, shift-click to send across.

## 1. Where the game stands today

"What next?" currently has no good answer. From the code:

| When the player has... | What happens today | Problem |
|---|---|---|
| Looted the map | 12% of searched containers refill each dawn, anywhere on the map: about 110 a day, half the town in 5 to 6 days | No real scarcity, and no reason to go somewhere specific |
| Killed the zombies | They respawn at up to 75 a minute, toward a target of 480 + 35 per day | Killing achieves nothing, and nothing tells the player that |
| Run out of ammo | 2 Scrap crafts 8 Light rounds | Ammo isn't scarce once the Armory Locker is built, and shooting is a noise decision only |
| Built everything | All upgrades cost about 125 basic materials in total, and objectives end there | Materials stop mattering, and the game stops asking for anything |
| Stayed home | Zombies can't enter the fence, and the night horde just waits outside | The base is permanently safe, so the world applies no pressure |
| Died | Respawn is free and your gear waits on your body | This one works. Keep it |

The foundations are good: noise, stealth, loot by location, extraction back to a stash, co-op. What's missing is **a reason to take the next risk**, and **an ending**.

## 2. What we take from each reference

| | Take | Leave |
|---|---|---|
| **Project Zomboid** | The world decays on a calendar (power and water fail, food rots). Everyone knows it ends badly, so the story is how long you lasted and how. Zombies as a mass you manage, not targets. One bite can change everything. | Slow first hours, deep skill trees, huge item lists, hours of carpentry. Sessions here are short. |
| **ARC Raiders** | Every trip is a bet: what you carry against what you bring back. Your own noise calls the danger. Base upgrades ask for specific named parts, so you always know what you're hunting. A cheap comeback run after a loss. Changing conditions make the same map feel new. An opt-in reset that pays off for next time. | PvP, matchmaking, raid timers, seasons, a shared economy. We are a persistent two-player world. Time pressure comes from the calendar, not a countdown. |

**What replaces the other players?** In ARC, the tension comes from other raiders. Here it comes from the calendar and your own noise.

## 3. The rules

Each rule has a test you can apply to a design or see in a playtest.

1. **Every trip is a bet.** You leave for a reason, carrying something you'd hate to lose. *Test: before leaving, either player can say what they're going for and what they'd lose.*
2. **Noise is the currency.** A shot buys safety now and sells it a minute later. *Test: players argue about whether to shoot.*
3. **Zombies are weather, not targets.** No XP, no reward and no counter that makes killing a goal. Killing costs ammo, durability and noise. *Test: the best player gets through a trip with few kills.*
4. **The town only gets worse.** New days bring new problems, never relief. Safety is always temporary. *Test: day 10 looks and plays differently from day 2.*
5. **Always short of something.** Not short of everything. Players should be rich in one thing and desperate for another. *Test: ask "what do you need most right now?" and they answer at once.*
6. **Loss hurts, but never ends the game.** Death costs what you carried and a dangerous trip to get it back. A broke player can always make a useful trip with nothing. *Test: after dying, the player wants to go back rather than quit.*
7. **Zero ammo is a playstyle, not a dead end.** Sneaking, doors, noise makers and melee must stay viable. *Test: a player with an empty gun changes plans and keeps playing.*
8. **Two players beat one, without classes.** Co-op value comes from situations: one lures while one loots, one carries while one guards, one comes to get the other's body. *Test: players split up on purpose, then regret it or feel clever.*
9. **The world tells you, the UI doesn't.** No quest arrows on buildings, no rarity colors, no glowing loot. The radio, the map and sounds carry information. *Test: players point at the screen and say "did you hear that?"*
10. **Stop on a decision.** A good session ends with something unresolved: a body left in the police station, a truck one part short. *Test: players leave talking about next time.*

## 4. The answer to "what next?"

### The town has three ages

| Age | Roughly | What it feels like | What the player does |
|---|---|---|---|
| **Scavenging** | Days 1-5 | Plenty nearby, danger is learning | Loot houses, build the base, discover the map |
| **Depletion** | Days 6-14 | Nearby is empty, the good stuff is far and guarded | Plan long trips, chase radio events, hunt specific parts |
| **The Long Night** | Day 15 on | Power's out, hordes hit the fence, every trip could be the last | Decide when to leave |

At 10 real minutes a day, a world lasts about 3 to 5 hours over two or three sittings. These day numbers are starting guesses. Change them after the playtest.

### When the map is looted
Restocking stops being random everywhere. Instead:
- **The center dries out first.** Containers close to the safehouse stop refilling after about day 5, and the empty ring grows outward. Distance becomes the price of loot.
- **The radio gives you a reason to go.** Each dawn the Ham Radio announces one event, such as an airdrop on a block, a police convoy crash, or a fresh wing opening at the hospital. They're marked on the map, rich, loud or guarded, and gone by next dawn. Choosing to go is the daily bet.
- **Conditions change the same streets.** Fog, storms covering your noise, and blackout nights give each day its own feel.
- **Cases stay finite.** About 25 per world, never restocked (added in this patch), so there's always a reason to check the houses you skipped.

### When the zombies are "dead"
They never are, and the game should stop implying otherwise. Population keeps rising, and noise pulls crowds across blocks. A cleared street buys you a few minutes, which is a real reward, but nothing more. Replace "Kill a zombie" in the objectives with a survival or stealth task.

### When the ammo runs out
- **Make ammo actually scarce.** Crafted rounds need Gunpowder, a new material that only comes from specific places. Scrap alone no longer makes bullets. Ammo Cases become a real event.
- **A rough target:** a normal trip should use about one magazine. If players routinely go out with hundreds of rounds, it's too loose.
- **Empty guns are still useful.** Gun-butt shoves, noise makers, pipe bombs and repairable melee keep rule 7 true. Melee durability plus Duct Tape repair gives materials a long-term use.

### When the base is finished
The base starts needing you. From around day 10 the fence can be breached: hordes attack the gates, and repairing or barricading them costs materials every day. Add one or two defensive upgrades, and a generator that needs fuel to keep the lights and radio on. Materials stay valuable forever, and "stay home" stops being safe.

### When the player has had enough: the Last Haul
**The game's name is its ending.** There's a truck at the safehouse. It doesn't run.

1. **The part list.** The truck needs a handful of named parts, each from a different place: a battery from the gas station, tires from the parking lot, an engine part from the hardware store, fuel, and a radio code from the military base. You always know what you're hunting (ARC's best idea).
2. **Leave when you choose.** Once it runs, you can go at any time. Going early is safer. Staying gets you more cargo in a worse town. That's the biggest bet in the game.
3. **The run.** Load the truck, start the engine (very loud), and drive the road out while everything in earshot comes for you. Five tense minutes, and both players are needed. Fail, and the wreck and its cargo sit on the road for one last attempt.
4. **The score.** The end screen shows what you hauled out, the day you left, and who made it. In the spirit of Zomboid: *this is how you got out*, or *this is how you died*.

### Why you'd play another world
Like ARC's opt-in reset, escaping pays forward. Each new world is a new seed, a new layout, and:
- **One small permanent benefit,** chosen from what you hauled out: a known recipe, a starting item, or a bigger first stash. Small enough that a new player isn't far behind.
- **One world modifier you choose,** such as Winter, Dense Town, No Radio, or Runners at Night. Harder modifiers multiply your score.
- **A best-hauls board** on this device for bragging rights between you and your partner.

Giving up also works. A world can continue forever for players who just want to survive, Zomboid-style.

## 5. Pacing targets

Check these in the playtest. If they're wrong, change the game or the target.

| Thing | Target |
|---|---|
| A trip | 3 to 6 minutes, about two a day |
| Time from leaving the base to first scare | Under 90 seconds |
| Kills on a good trip | Under 10, on foot |
| Deaths per player | About one per hour: enough to matter |
| Body recovery | Worth attempting most of the time, and succeeds about half the time |
| Case finds | One every 2 or 3 trips early, then only by going far |
| First upgrade | Within 15 minutes |
| Time from the part list to first possible escape | About 2 hours of play |
| Silence | Regular moments where both players are just listening |

## 6. First playtest guide

**Don't explain anything.** Watch, take notes, and only help if they're truly stuck. Play 60 to 90 minutes in one world.

Watch for:
- What do they say when they leave the base? Do they have a goal, or just wander?
- Do they shoot without thinking? (Rule 2 is failing.)
- Do they kill zombies for no reason? Why?
- When does either of them first say "we should go home"? When do they first ignore that and regret it?
- What do they do after dying? Quit-face, or "I'm going back for my stuff"?
- Do they split up? Does it feel smart or scary?
- When did a menu get in the way? Did they find a case without being told?
- When did the talking stop, and when did it get loud?

Ask afterward:
1. Tell me the story of your best moment, and your worst.
2. What were you trying to get when we stopped?
3. Was there a moment you didn't know what to do next? When?
4. Would you pick this world back up tomorrow? What for?
5. What did you waste time on?

**The result that matters most is question 4.** If they don't have an answer, section 4 is the priority over any other feature.

Also record: day reached, trips made, deaths, ammo left, what was in the stash, and any bugs.

## 7. Build order

Each patch can be played by itself and tests one idea.

| Patch | Name | What's in it | Question it answers |
|---|---|---|---|
| **Now** | Cases | Weapon, Mod and Ammo Cases, shop back offices | Are hidden finds exciting? |
| **Next** | Reasons to Leave | Daily radio event, center dries out, Gunpowder, replace the "kill" objective | Do players now choose where to go? |
| Then | Bad Days | Calendar: power cut, food spoils, conditions; gates can be breached, repairs and generator | Does the pressure feel exciting or just unfair? |
| Then | The Last Haul | Truck, part list, finale run, end screen, score | Is leaving the best moment of the game? |
| Later | Another World | Permanent benefit, modifiers, best-hauls board | Do players start a new world by choice? |
| Backlog | Only if the playtest asks | Skills that improve with use, reclaiming blocks, survivors to rescue, a third player | |

## 8. What we won't do

- XP or rewards for kills. It breaks rule 3 and turns the game into a shooter.
- Quest markers on ordinary buildings, or rarity colors on loot. Finding things is the game.
- PvP. It needs a different game, and it would poison the two-player trust the co-op depends on.
- Countdown timers on trips. The day and night do that job.
- Big crafting trees. Short lists of named things are clearer and more exciting.
- Deleting a world on death. The town and your stash are the story.

## 9. Open decisions

Recommendations are in bold. All of these are easy to revisit after the playtest.

1. **Is there an ending?** **Yes, the Last Haul, with endless survival as an option.** The alternative is purely endless, which suits Zomboid fans but gives most players nothing to aim for.
2. **Can the base be breached?** **Yes, from about day 10.** This removes today's promise on the opening screen that zombies can't enter the fence.
3. **How harsh is death?** **Keep it as it is.** Your gear waits on your body. Consider a Safe Pocket later (one item that survives death), if losing everything feels too harsh.
