# Old-School Pokemon Data and Progression Notes

Scope: basic implementation-useful mechanics from Generation I and II, focused on data and progression for a Soroban prototype. This is not a full battle-system spec.

## Source Pointers

- Bulbapedia, [Pokemon data structure (Generation II)](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_data_structure_%28Generation_II%29): party Pokemon are 48 bytes, PC Pokemon are 32 bytes, and party-only temporary fields include status, current HP, and calculated battle stats.
- Bulbapedia, [Save data structure (Generation II)](https://bulbapedia.bulbagarden.net/wiki/Save_data_structure_%28Generation_II%29): save data uses list records with counts, capacity, species indexes, Pokemon records, OT names, nicknames, inventories, checksums, and PC boxes.
- Bulbapedia, [Experience](https://bulbapedia.bulbagarden.net/wiki/Exp): level derives from total EXP, Gen I/II use the older flat EXP gain family, and level caps at 100.
- Bulbapedia, [Stat](https://bulbapedia.bulbagarden.net/wiki/Stat), [Individual values](https://bulbapedia.bulbagarden.net/wiki/Individual_values), and [Effort values](https://bulbapedia.bulbagarden.net/wiki/Effort_values): base stats, DVs/IVs, stat experience, and level determine displayed stats.
- Bulbapedia, [Base stats](https://bulbapedia.bulbagarden.net/wiki/Base_stats): base stats are species/form constants.
- Bulbapedia, [Evolution](https://bulbapedia.bulbagarden.net/wiki/Evolution) and [Evolutionary methods](https://bulbapedia.bulbagarden.net/wiki/Evolutionary_methods): early evolution is mostly level, item, trade, friendship, time, and held-item trade based.
- Bulbapedia, [Catch rate](https://bulbapedia.bulbagarden.net/wiki/Catch_rate): Gen I and II capture algorithms use species catch rate, ball, status, and HP, with Gen II moving toward the later "modified catch rate" model.
- Bulbapedia, [Party](https://bulbapedia.bulbagarden.net/wiki/Party) and [Pokemon Storage System](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Storage_System): party capacity is six; extra Pokemon go to PC boxes.
- PokeAPI, [Growth Rates docs](https://staging.pokeapi.co/docs/v2): exposes growth-rate formulas, level-to-EXP tables, species, evolution chains, items, moves, and version groups that can seed off-chain fixtures.
- pret disassemblies, especially [pokered data system summary](https://deepwiki.com/pret/pokered/3.1-pokemon-data-system) and [pokecrystal add-a-Pokemon notes](https://github-wiki-see.page/m/pret/pokecrystal/wiki/Add-a-new-Pok%C3%A9mon): useful if exact ROM-like species, evolution, and learnset tables are needed.

## Species Data

Gen I/II species constants should be stored separately from individual Pokemon state. A prototype species record should include:

- `species_id`: compact numeric ID.
- `name`: UI/off-chain label; avoid storing on-chain if front end can map IDs.
- `types`: one or two type IDs.
- `base_stats`: HP, Attack, Defense, Speed, Special for Gen I; HP, Attack, Defense, Speed, Special Attack, Special Defense for Gen II. Gen II still uses a unified Special DV/stat-exp value even though displayed Special stats are split.
- `base_exp_yield`: used for battle EXP rewards.
- `growth_rate`: one of the old four curves: Medium Fast, Medium Slow, Fast, Slow. Later Erratic/Fluctuating curves are Gen III+ and can be omitted.
- `catch_rate`: species constant used during capture.
- `evolutions`: zero or more triggers.
- `learnset`: ordered level-up moves, plus optional TM/HM compatibility.
- Optional: gender ratio, egg group, hatch cycles, friendship base, held item data. These matter for Gen II breeding/friendship fidelity but are not required for a minimal progression prototype.

Implementation note: keep canonical species tables off-chain or generated into static contract data only if the active roster is tiny. For Soroban, a small curated roster with numeric constants is more practical than full 251-species storage.

## Individual Pokemon State

The Gen II data structure is a good conceptual split: "core" persisted identity/progression plus "temporary" party-only calculated state. For a prototype:

Core fields:

- `owner`: account/address or trainer ID.
- `mon_id`: unique token/instance ID.
- `species_id`.
- `level`: 1-100, derivable from EXP but useful to cache.
- `exp`: total accumulated EXP.
- `dvs`: old-school 4-bit values for Attack, Defense, Speed, Special; HP DV is derived from the low bits of the others. A simplified model can store six 0-15 IV-like values instead.
- `stat_exp`: Gen I/II per-stat training values, 0-65535 each. This is expensive and grind-heavy, so consider omitting or replacing with a single progression score.
- `moves`: up to four move IDs.
- `pp`: current PP per move if battles are persisted.
- `friendship`: needed for Gen II friendship evolutions and some item effects.
- `original_trainer`: optional for trade/outsider EXP.
- `nickname`: off-chain/UI metadata unless names must be permanent.
- `caught_data`: optional, e.g. ball, location, level, timestamp/ledger sequence.

Temporary party/battle fields:

- `current_hp`.
- `status`.
- Calculated stats: max HP, Attack, Defense, Speed, Special Attack, Special Defense.
- Volatile battle state should not be part of permanent Pokemon storage unless combat can pause on-chain.

Recommendation: persist core progression only. Recompute stats from species + level + DVs + simplified training when needed.

## Level and EXP Curves

Level is determined by total EXP and species growth rate. Gen I introduced four useful curves:

- Fast: `4 * level^3 / 5`, level 100 total 800,000.
- Medium Fast: `level^3`, level 100 total 1,000,000.
- Medium Slow: `6/5 * level^3 - 15 * level^2 + 100 * level - 140`, level 100 total 1,059,860.
- Slow: `5 * level^3 / 4`, level 100 total 1,250,000.

Gen I/II battle EXP uses a flat family where the winner's level does not reduce rewards. A practical formula is:

```text
exp_gain = floor((trainer_multiplier * base_exp_yield * defeated_level) / (7 * participants))
```

Then apply optional old-school multipliers:

- Trainer battle: 1.5x.
- Outsider/traded Pokemon: 1.5x.
- Lucky Egg: 1.5x, Gen II only.
- Exp. All / Exp. Share: omit for v1 unless party-wide progression is important.

Prototype simplification: use total EXP, four growth curves, and level-up loops. Avoid exact split-EXP edge cases and Gen I Exp. All bugs.

## Stat Calculation

Old-school stat calculation uses species base stats, level, DVs, and stat experience. For Gen I/II, the shape is:

```text
non_hp = floor((((base + dv) * 2 + floor(sqrt(stat_exp) / 4)) * level) / 100) + 5
hp     = floor((((base + dv) * 2 + floor(sqrt(stat_exp) / 4)) * level) / 100) + level + 10
```

Important differences:

- DVs are 0-15, not modern 0-31 IVs.
- Gen I has one Special stat.
- Gen II displays Special Attack and Special Defense, but still has one Special DV and one Special stat-exp bucket affecting both.
- Stat experience is old EVs: each defeated Pokemon contributes based on its base stats, and each stat can grow up to 65,535. This is much larger and less user-legible than modern EVs.

Prototype simplification: choose one of these:

1. Minimal: `stats = base_stats scaled by level`, no DVs or stat EXP.
2. Recommended: store 0-15 DVs and omit stat EXP.
3. Higher fidelity: store DVs plus one compact `training_points` value that adds a bounded bonus to all stats.

Option 2 gives individuality without heavy grinding/storage.

## Learnsets and Moves

Old-school Pokemon can know four moves. Learnsets are species-specific ordered tables keyed by level. On level-up:

1. Check each newly reached level.
2. If a move is learned and fewer than four moves are known, append it.
3. If four moves are known, the original games prompt for replacement. On-chain, require the player to submit a replacement index or skip the move.

Data needed per move:

- `move_id`.
- Type.
- Power, accuracy, PP.
- Category: Gen I/II category is type-based physical/special, not per-move. A prototype can ignore this if battle damage is out of scope.
- Progression flags: HM/TM compatibility, field use, or evolution dependency if used.

For v1, use level-up learnsets only. TMs/HMs can be inventory items later because they add item ownership, compatibility checks, and one-time-use behavior.

## Evolution Triggers

Gen I basics:

- Level threshold.
- Evolution stone item.
- Trade.

Gen II adds or expands:

- Friendship level-up.
- Time of day for some friendship evolutions.
- Trade while holding item.
- Gender and other species-specific conditions in limited cases.

Prototype triggers:

```text
Level { min_level, target_species }
Item { item_id, target_species }
Trade { target_species }
Friendship { min_friendship, target_species }
```

Recommended simplification: implement Level and Item first. Treat Trade as an explicit contract action between owners only after ownership transfer mechanics are stable. Defer friendship/time/held-item trade unless the selected roster requires them.

## Party and PC Storage

Core-series party size is six. PC storage exists so the player can own more than six Pokemon. Gen II save data models Pokemon lists with a count, capacity, species index list, Pokemon records, OT names, and nicknames.

Prototype structure:

- Trainer/account state:
  - `party: Vec<mon_id>` with max length 6.
  - `box: Vec<mon_id>` or paged `box_slot -> mon_id` map.
  - `active_box` is unnecessary unless emulating Gen II UX.
- Pokemon state:
  - Stored once by `mon_id`.
  - Party/box membership is an index/reference, not a duplicate Pokemon record.

Rules:

- Capture fills an empty party slot if available, otherwise deposits to box.
- Withdrawal requires party length < 6.
- Deposit requires party length > 1 if the game requires the trainer to keep one Pokemon.
- Avoid storing calculated stats separately for boxed Pokemon.

## Inventory and Progression Items

Inventory can be split by item category, like Gen II pockets, but a map is enough on-chain:

```text
inventory[(owner, item_id)] = quantity
```

Progression-relevant item classes:

- Balls: Poke Ball, Great Ball, Ultra Ball, Master Ball. Used by capture.
- Evolution stones: Fire, Water, Thunder, Leaf, Moon; Gen II adds Sun Stone.
- Rare Candy: increases level by one, obeying level cap and evolution checks.
- Vitamins: increase stat experience in the originals; omit or map to simplified training.
- TMs/HMs: teach moves if compatibility passes.
- Held items: Gen II only; include only if implementing Lucky Egg, Everstone, or held-item trade evolutions.
- Key items/badges: gate map/story progression, not necessary for a battle/capture prototype unless route access is on-chain.

Recommendation: implement Balls, Rare Candy, and evolution stones. Defer vitamins, TMs/HMs, held items, badges, and key items.

## Capture Data

A usable capture formula needs:

- Species catch rate.
- Ball modifier.
- Target current HP and max HP.
- Status modifier.
- Randomness source.

Gen I has a distinctive algorithm with early status checks and ball-specific random ranges. Gen II uses a modified catch-rate calculation closer to later games, and determines catch before shake checks.

Soroban concern: randomness is the hard part. If using deterministic ledger data, capture can be gamed. Use a commit/reveal, oracle/VRF-like source, or make capture deterministic from a paid action plus encounter seed if adversarial fairness is not critical.

Prototype simplification:

```text
modified = floor(((3 * max_hp - 2 * current_hp) * catch_rate * ball_bonus * status_bonus) / (3 * max_hp))
catch if random_0_255 < clamp(modified, 1, 255)
```

Use Master Ball as guaranteed capture. Store `caught_level`, `caught_species`, `ball_id`, and `caught_at_ledger` only if provenance matters.

## Save-State Shape for Soroban

Suggested on-chain entities:

```text
SpeciesData {
  species_id,
  types,
  base_stats,
  base_exp_yield,
  growth_rate,
  catch_rate,
}

Pokemon {
  mon_id,
  owner,
  species_id,
  exp,
  level,
  dvs,
  moves[4],
  friendship,
  current_hp, // optional if not in active battle
}

Trainer {
  owner,
  party[<=6 mon_id],
  box_count,
}

BoxSlot {
  owner,
  slot,
  mon_id,
}

InventoryBalance {
  owner,
  item_id,
  quantity,
}
```

Keep large lookup tables off-chain or generated into code:

- `exp_for_level(growth_rate, level)` can be calculated instead of stored.
- `species_data` can be a small static match/table for the selected roster.
- `learnsets`, `evolution_rules`, and `tm_compatibility` are large; store only selected roster rules in v1.

## Recommended Soroban Prototype Cuts

- Use a curated Gen I/II roster, not all 251 species.
- Use Gen II-style six-stat display, but keep a unified Special DV only if you care about old-school authenticity. Otherwise use six simple IVs.
- Store total EXP and derive level through four growth curves.
- Implement level-up moves and Level/Item evolutions only.
- Omit stat experience, breeding, eggs, Pokerus, shininess, gender, natures, abilities, held items, box checksums, and exact save-file byte layouts.
- Keep party and box as owner-owned indexes into unique Pokemon records.
- Avoid exact Gen I/II capture quirks; use a simple catch-rate formula plus a clear randomness strategy.

## Implementation Takeaways

1. Separate species constants from individual Pokemon state; most progression is species table + EXP + level + moves.
2. Gen II's split between compact PC records and richer party records maps well to on-chain storage: persist core state, recompute temporary stats.
3. DVs are cheap and flavorful; stat experience is expensive and can be safely simplified away for v1.
4. Learnsets and evolutions are table-driven, so start with a small curated table and expand.
5. Capture and battle rewards need explicit randomness and anti-abuse decisions before they become real value-bearing mechanics.
