# Old-School Pokemon Battle Mechanics

Scope: basic, implementation-useful battle mechanics for a Soroban prototype, using Generation I and Generation II as the main reference points. This is not an emulator spec; it is a pragmatic model for deterministic contract execution.

## Core Battle Loop

Classic Pokemon battles are turn based: each side chooses an action, the battle engine orders those actions, resolves the first action, checks for fainting or replacement, then resolves the next action if still valid. A battle ends when one side has no usable Pokemon; wild battles can also end by running or catching, while trainer battles normally require defeating the opposing party. Bulbapedia describes moves as the primary battle actions and notes that, when multiple Pokemon use moves in a turn, priority and Speed determine execution order ([Move](https://bulbapedia.bulbagarden.net/wiki/Move)); wild Pokemon are encountered as battle opponents outside trainer battles ([Wild Pokemon](https://bulbapedia.bulbagarden.net/wiki/Wild_Pok%C3%A9mon)).

Prototype recommendation: store a `Battle` with active Pokemon indices, party summaries, pending action commitments, turn number, RNG seed/nonce, and battle kind (`wild` or `trainer`). Resolve one full turn per transaction once both players have submitted actions.

## Move Selection and PP

Each Pokemon can know up to four moves in the old games; Gen I party data explicitly stores four move IDs and four PP values ([Pokemon data structure (Generation I)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_I))). Gen II keeps the same four-move structure, adds held item data, and stores PP values in the party structure ([Pokemon data structure (Generation II)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_II))). A move with no remaining PP cannot be selected normally; games use Struggle when no usable moves remain, but a prototype can either implement Struggle or declare the Pokemon action-locked until it switches.

Prototype recommendation: decrement PP when a move is attempted, before hit/miss resolution. For v1, include Struggle only if switching and party depth are implemented; otherwise keep battles to one active Pokemon and reject turns where no selected move has PP.

## Turn Order, Priority, Speed, and Ties

Move priority is checked before Speed. Bulbapedia states that if two moves have the same priority, the users' Speed stats determine which move executes first ([Priority](https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_priority)). For basic Gen I/II-style single battles, use priority bracket first, then modified Speed, then a random or deterministic tie-break. Speed ties are effectively random in normal battle play; for on-chain determinism, derive the tie-break from the battle RNG seed and turn nonce.

Switches are a special action. Modern summaries place manual switching before attacks, but old-generation edge cases and simultaneous switch ordering differ across games ([Turn Structure, Speed, and Priority in Pokemon Battles](https://poketooling.com/info/articles/pokemon-games/game-mechanics/turn-structure-speed-and-priority); [Priority](https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_priority)). For a contract prototype, treat voluntary switches as priority above moves, then resolve faint-forced replacement immediately after fainting.

Prototype order:

1. Validate actions: move, switch, item/run/catch if enabled.
2. Resolve voluntary switches before moves.
3. Sort moves by priority, modified Speed, then deterministic tie RNG.
4. After each damaging action, check fainting and replacement.
5. Apply end-of-turn effects.

## Accuracy and Evasion

Accuracy determines whether a move hits, and evasion modifies that chance. Bulbapedia notes Gen I compares a random value against modified accuracy and that Gen II treats a modified accuracy of 255 as guaranteed rather than rolling ([Accuracy](https://bulbapedia.bulbagarden.net/wiki/Accuracy)). Smogon highlights the Gen I 1/256 miss behavior for most nominally 100% accurate moves, except always-hit cases such as Swift ([Understanding RBY mechanics](https://www.smogon.com/articles/understanding-rby-mechanics)).

Prototype recommendation: avoid Gen I's 1/256 accuracy quirk unless the goal is emulator fidelity. Use a clean integer model:

`hit = rng(1..100) <= clamp(move_accuracy * accuracy_stage / evasion_stage, 1, 100)`

Keep an `always_hits` flag for moves like Swift. If gas cost matters, omit accuracy/evasion stages at first and only support move base accuracy.

## Critical Hits

Gen I critical rates are based on the user's base Speed, not a flat universal chance; Smogon gives the normal formula as `base_speed * 100 / 512` percent and high-critical moves as `base_speed * 100 / 64` percent ([Understanding RBY mechanics](https://www.smogon.com/articles/understanding-rby-mechanics)). Bulbapedia also notes that Gen I's critical-hit threshold is normally half the user's base Speed ([Critical hit](https://bulbapedia.bulbagarden.net/wiki/Critical)). Gen II changes the model to critical stages, with a base chance of `17/256`, and Gen II through Gen V critical hits deal 2x normal damage ([Critical hit](https://bulbapedia.bulbagarden.net/wiki/Critical)).

Prototype recommendation: use the Gen II-style flat critical stage table for simplicity. Store `crit_stage` on the move or temporary battle state; start with base `17/256`, high-crit moves as a higher stage, and apply `2x` damage on critical hit.

## Damage Formula

The old-game damage shape is:

`damage = floor((((floor((2 * level) / 5) + 2) * power * attack / defense) / 50) + 2) * modifiers`

Bulbapedia defines the key inputs as attacker level, move power, effective attacking stat, effective defending stat, and modifiers such as critical, random factor, STAB, and type effectiveness ([Damage](https://bulbapedia.bulbagarden.net/wiki/Damage_formula)). Pokemon Showdown-derived discussions and calculators use the same integer-flooring structure before modifiers ([Pokemon Damage Calculator source](https://github.com/smogon/damage-calc); [PokeBase formula discussion](https://pokemondb.net/pokebase/276614/what-is-the-actual-pokemon-damage-formula)).

Modifiers to include in v1:

- Critical: `2x` if critical, using simplified Gen II behavior.
- Random roll: old games use a random damage range; modern summaries commonly model this as a multiplier range rather than a fixed value ([Battle Mechanics](https://www.dragonflycave.com/mechanics/battle/)). Use `85..100` percent if you want familiar Pokemon variance, or `100` for deterministic strategic clarity.
- STAB: same-type attack bonus increases damage when the move type matches one of the user's types ([STAB](https://bulbapedia.bulbagarden.net/wiki/Stab)).
- Type effectiveness: type matchups multiply damage; Gen II adds Dark and Steel types while Gen I has the original chart ([Type](https://bulbapedia.bulbagarden.net/wiki/Type)).
- Burn: burn halves physical damage or physical Attack depending on generation-specific implementation; Bulbapedia summarizes burn as reducing physical damage output and causing recurring damage ([Burn](https://bulbapedia.bulbagarden.net/wiki/Burn)).

Prototype recommendation: use fixed-point integer multipliers, e.g. `scale = 10_000`, `STAB = 15_000`, `super_effective = 20_000`, `resisted = 5_000`, `immune = 0`. Apply floors after each major step to match old-game integer feel.

## Physical/Special Categories

Gen I has a single Special stat, while Gen II splits Special Attack and Special Defense in the data model ([Pokemon data structure (Generation I)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_I)); [Pokemon data structure (Generation II)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_II))). In Gen I/II, physical vs special is determined by move type, not by each individual move; later games changed this, but that is out of scope ([Move](https://bulbapedia.bulbagarden.net/wiki/Move)).

Prototype recommendation: choose Gen II stats (`attack`, `defense`, `sp_attack`, `sp_defense`, `speed`) but Gen I/II type-based categories. This preserves old-school behavior while avoiding a single overloaded Special stat.

## STAB and Type Effectiveness

STAB is the damage boost for a Pokemon using a move that matches one of its own types ([STAB](https://bulbapedia.bulbagarden.net/wiki/Stab)). Type effectiveness is multiplicative across the defender's types; Bulbapedia describes type interactions and notes that Dark and Steel were introduced in Gen II ([Type](https://bulbapedia.bulbagarden.net/wiki/Type)).

Prototype recommendation: store a compact `type_chart[attacking_type][defending_type]` with values `{0, 5_000, 10_000, 20_000}`. For dual-type defenders, multiply the two matchups and rescale.

## Stat Stages

Pokemon battles use temporary stat stages for Attack, Defense, Speed, Special or Special Attack/Special Defense, accuracy, and evasion. General stat stage mechanics reset when switching or when battle state is cleared; Gen I/II have generation-specific critical-hit interactions with stages ([Critical hit](https://bulbapedia.bulbagarden.net/wiki/Critical); [RBY Mechanics Guide](https://www.smogon.com/rb/articles/rby_mechanics_guide)).

Prototype recommendation: support stages from `-6..+6` with the common simple multiplier:

- Non-accuracy stats: if stage >= 0, `(2 + stage) / 2`; if stage < 0, `2 / (2 - stage)`.
- Accuracy/evasion: if implemented, use a similar ratio table and combine attacker accuracy with defender evasion.
- Reset volatile stages on switch.

For v1, do not emulate Gen I critical hits ignoring all boosts; use Gen II-like critical behavior or simply ignore stage bypass on criticals.

## Status Conditions

Core non-volatile statuses are sleep, poison, burn, paralysis, and freeze; Bulbapedia distinguishes non-volatile statuses from volatile conditions such as confusion ([Status condition](https://bulbapedia.bulbagarden.net/wiki/Status_ailments)). Sleep prevents normal action for a random duration; Bulbapedia lists Gen I handheld sleep as 1-7 turns and Gen II handheld sleep as 2-8 turns ([Status condition](https://bulbapedia.bulbagarden.net/wiki/Status_ailments)). Freeze prevents action until thawing; Gen II allows more thawing routes than Gen I ([Freeze](https://bulbapedia.bulbagarden.net/wiki/Freeze)). Burn causes recurring damage and reduces physical damage output ([Burn](https://bulbapedia.bulbagarden.net/wiki/Burn)). Paralysis reduces Speed and can prevent movement; poison causes recurring damage ([Status condition](https://bulbapedia.bulbagarden.net/wiki/Status_ailments)).

Prototype recommendation:

- Only one major status per Pokemon.
- `sleep`: store remaining turns, decrement when the Pokemon tries to act.
- `poison`: lose `max_hp / 8` at end of turn.
- `burn`: lose `max_hp / 16` at end of turn and halve physical damage.
- `paralysis`: halve Speed and use a `25%` full-paralysis action failure.
- `freeze`: either omit in v1 or model as "cannot act, 20% thaw chance at action start" for playability.
- `confusion`: volatile, optional; if included, store remaining turns and roll self-hit before move execution.

## Switching and Fainting

Switching changes the active Pokemon and clears most volatile battle state, including temporary stat stages. Fainting occurs when HP reaches zero; experience and replacement rules are outside the battle-core scope, but Bulbapedia notes experience is gained when an opponent Pokemon faints ([Experience](https://bulbapedia.bulbagarden.net/wiki/Experience)). In trainer battles, a player with remaining usable Pokemon must choose a replacement; in wild battles, fainting the wild Pokemon ends the battle.

Prototype recommendation: implement forced replacement as a separate state (`AwaitingReplacement`) rather than trying to finish the whole next send-out flow inside the attack transaction. This keeps contract transitions small and auditable.

## Trainer and Wild Battle Flow

Trainer battle:

1. Initialize from two parties and active leads.
2. Repeat turn submission and resolution.
3. On faint, require replacement if party has usable Pokemon.
4. End when either party has no usable Pokemon.

Wild battle:

1. Initialize player active Pokemon and one wild opponent.
2. Allow move, switch, run, and catch if those systems exist.
3. End on wild faint, player party wipe, successful run, or successful catch.

Prototype recommendation: build trainer battles first because they need fewer extra systems. Add wild-only `run` and `catch` later.

## Soroban Prototype Simplifications

Use these defaults unless there is a specific reason to chase cartridge fidelity:

- Single battles only, one active Pokemon per side.
- Gen II stat model with Gen I/II type-based physical/special categories.
- Four moves per Pokemon with PP.
- Priority, Speed, deterministic speed ties.
- Integer damage formula with STAB, type effectiveness, burn, critical, and optional `85..100` damage roll.
- Stage range `-6..+6`, reset on switch.
- Major statuses: poison, burn, paralysis, sleep. Defer freeze and confusion.
- No abilities, natures, held items, weather, screens, multi-hit moves, recoil, trapping, partial trapping, two-turn moves, or item use in v1.
- Deterministic RNG from committed battle seed plus turn/action counters; avoid user-controlled randomness in the same transaction that reveals the outcome.

## Sources

- [Damage - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Damage_formula)
- [Move - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Move)
- [Priority - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/List_of_moves_by_priority)
- [Accuracy - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Accuracy)
- [Critical hit - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Critical)
- [STAB - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Stab)
- [Type - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Type)
- [Status condition - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Status_ailments)
- [Burn - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Burn)
- [Freeze - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Freeze)
- [Pokemon data structure (Generation I) - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_I))
- [Pokemon data structure (Generation II) - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_(Generation_II))
- [Experience - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Experience)
- [Wild Pokemon - Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Wild_Pok%C3%A9mon)
- [Understanding RBY mechanics - Smogon University](https://www.smogon.com/articles/understanding-rby-mechanics)
- [RBY Mechanics Guide - Smogon University](https://www.smogon.com/rb/articles/rby_mechanics_guide)
- [Battle Mechanics - The Cave of Dragonflies](https://www.dragonflycave.com/mechanics/battle/)
- [Pokemon damage calculator source - Smogon](https://github.com/smogon/damage-calc)
- [Pokemon damage formula discussion - PokeBase](https://pokemondb.net/pokebase/276614/what-is-the-actual-pokemon-damage-formula)
- [Turn Structure, Speed, and Priority - PokeTooling](https://poketooling.com/info/articles/pokemon-games/game-mechanics/turn-structure-speed-and-priority)
