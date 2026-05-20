# Pokemon-Style Overworld Loop on Soroban

This note reduces old-school Pokemon overworld mechanics into a Soroban-friendly implementation plan. It focuses on what should be verified on-chain, what should remain client-rendered, and what can be cut for a minimal playable prototype.

## Source Mechanics

- The original loop is split between a top-down overworld and battle scenes. Movement is four-directional on a tile map; ledges create one-way shortcuts; NPCs, signs, and items are interacted with by facing them and pressing an action button; wild battles can start from tall grass, caves, water, fishing, or surfing; trainer battles can start from trainer vision or direct talk. Source: StrategyWiki, "Pokemon Red and Blue/Gameplay" (<https://strategywiki.org/wiki/Pok%C3%A9mon_Red_and_Blue/Gameplay>).
- Random encounters are checked per step on encounter-enabled tiles. In Generation I, the game rolls a random number from 0 to 255 and compares it against the tile/area encounter number; if it passes, species and level are generated. Source: Bulbapedia, "Wild Pokemon" (<https://bulbapedia.bulbagarden.net/wiki/Encounter>).
- Enemy trainers have orientation, sight range, and a battle roster. If the player enters an unobstructed line of sight, the trainer walks to the player and battle begins; if defeated, that trainer no longer attacks. Source: Viglietta, "Gaming is a hard job..." generalized Pokemon proof (<https://csvoss.scripts.mit.edu/junction/p_NPcomp/nphardnintendo.pdf>).
- Items may be given by NPCs, bought at a Poke Mart, or found as overworld item balls. Item balls are picked up by standing next to them, facing them, and interacting. Source: Bulbapedia, "Item" (<https://bulbapedia.bulbagarden.net/wiki/Item>).
- Pokemon Centers restore party HP, PP, and status conditions. If the player's party faints, the player blacks out, loses money, returns to a Pokemon Center or home, and the party is healed. Source: Bulbapedia, "HP" (<https://bulbapedia.bulbagarden.net/wiki/Health>).
- Poke Marts buy and sell items; older games have fixed stock per store, while newer games unlock standard stock by badges. Source: Bulbapedia, "Poke Mart" (<https://bulbapedia.bulbagarden.net/wiki/Mart>).
- Soroban storage has Persistent, Temporary, and Instance storage. Persistent is for long-lived user data; Temporary is cheaper and deleted at expiry; Instance is small, global contract data loaded with the contract. Sources: Soroban SDK storage docs (<https://docs.rs/soroban-sdk/latest/soroban_sdk/storage/struct.Storage.html>) and Stellar storage guide (<https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage>).
- Soroban invocations need a transaction footprint covering all ledger entries read/written by the call, so route data and player state should be keyed narrowly. Source: Stellar transaction simulation docs (<https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/transaction-simulation>).
- Stellar ledgers are ordered states; ledger `N+1` references ledger `N`, which makes ledger sequence/hash usable as public timing context but not as secure player-facing randomness by itself. Source: Stellar ledger docs (<https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/ledgers>).

## Soroban Design Mapping

### Tile Maps and Routes

Keep map rendering off-chain. The contract only needs a compact route definition sufficient to validate transitions and triggers:

```text
Route {
  id: u32,
  width: u16,
  height: u16,
  tile_hash: BytesN<32>,
  exits: Vec<Exit>,
  encounter_table_id: Option<u32>,
}

Tile flags, stored off-chain under tile_hash:
WALL, GRASS, WATER, LEDGE_UP/DOWN/LEFT/RIGHT, CENTER, MART, SIGN, ITEM, NPC, GATE
```

For an MVP, avoid storing every tile on-chain. Store route metadata and a `tile_hash`; the client ships the map data, and movement calls include either:

- a tile proof against a Merkle root, if adversarial clients are in scope; or
- a trusted route version hash, if the game is prototype-grade and the client is considered honest enough.

Recommended MVP: small curated routes with hard-coded server/client map data and on-chain validation against allowed exits plus known trigger coordinates. Full wall-by-wall movement validation can be deferred.

### Player Overworld State

Persistent storage per player:

```text
PlayerState {
  route_id: u32,
  x: u16,
  y: u16,
  facing: Direction,
  flags: u128,          // story flags, trainer defeated bits, item picked bits for MVP
  badges: u16,          // bitset
  money: i64,
  party_hash: BytesN<32>,
  last_center: Location,
  nonce: u64,
}
```

Do not store full map, party details, bag details, and all NPC state in a single expanding value. Split high-churn state into predictable keys:

- `Player(addr)` -> location, flags, badges, money, party hash.
- `Bag(addr, item_id)` -> quantity, only for non-zero balances.
- `TrainerDefeated(addr, trainer_id)` -> bool, if trainer count outgrows a bitset.
- `ItemPicked(addr, item_id)` -> bool, if item count outgrows a bitset.

Global constants such as route registry, admin, item prices, and encounter table hashes can be Instance storage only if bounded and small; otherwise use Persistent keyed by ID.

### Movement Loop

Contract entrypoint:

```text
move(addr, direction, client_step_nonce, optional_random_commit)
```

Validation:

1. Require auth from `addr`.
2. Load `Player(addr)` and route metadata.
3. Compute target tile.
4. Reject wall/locked/gated tiles.
5. Apply one-way ledge rules.
6. Update `x/y/facing/nonce`.
7. Check deterministic triggers in this order: exit, trainer sight, item/NPC/action, random encounter.
8. Emit an event with `Moved`, `Blocked`, `EnteredRoute`, `TrainerTriggered`, or `EncounterPending`.

The client should handle animation and camera locally. On-chain state changes happen at tile boundaries only, not per animation frame.

### Random Encounters

Classic behavior is a per-step probability check on encounter-enabled tiles. On Soroban, avoid hidden contract randomness assumptions. Use one of these levels:

- Prototype: deterministic pseudo-random value from `hash(player, route_id, x, y, nonce, ledger_sequence)` and accept that sophisticated players may preview or influence outcomes by transaction timing.
- Better: commit-reveal. Player commits `H(secret)` before walking or before entering grass, then later reveals `secret`; contract combines it with route/player/ledger context to determine encounter and species.
- Stronger multiplayer/fairness: add a second entropy party, oracle, VRF, or delayed reveal. Plain commit-reveal can suffer last-revealer withholding, a known weakness in blockchain randomness schemes; use penalties/timeouts if rewards are valuable.

For MVP, encounters can be "pending battle tickets":

```text
Encounter {
  player: Address,
  route_id: u32,
  species_id: u16,
  level: u8,
  seed: BytesN<32>,
  expires_ledger: u32,
}
```

Store pending encounters in Temporary storage because they are short-lived and can expire. Persistent storage only changes after battle/catch resolution.

### NPCs and Trainers

Represent NPCs as static route objects:

```text
Npc {
  id: u32,
  route_id: u32,
  x: u16,
  y: u16,
  facing: Direction,
  sight_range: u8,
  kind: Sign | Dialogue | Trainer | Merchant | CenterNurse | Gatekeeper,
  script_id: u32,
}
```

Trainer sight is deterministic: after a valid move, scan only nearby trainers on that route. A trainer triggers if the player is aligned with the trainer direction, within range, unobstructed by blocking tiles/NPCs, and not already defeated. For cost control, avoid scanning all route NPCs; store trainers by route and small fixed arrays, or require the client to provide the candidate trainer ID and validate only that candidate.

After a trainer battle starts, movement should lock until battle resolution. Once defeated, set a bit/flag so the trainer is inert, matching classic behavior.

### Badges and Story Gates

Use badges and flags as bitsets. Gates should be deterministic checks on movement or interaction:

```text
Gate {
  id: u32,
  route_id: u32,
  x: u16,
  y: u16,
  required_badges: u16,
  required_flags: u128,
  required_item: Option<u32>,
}
```

HM-style gates can be reduced to badges plus item/party capability flags. Do not model full HM moves for the prototype; model "can_cut", "can_surf", or "can_pass_boulder" as story flags or badge-gated capabilities.

### Centers, Marts, and Items

Centers:

- Interaction at `CENTER` tile calls `heal(addr, center_id)`.
- Set party HP/PP/status to full in battle/party module, update `last_center`.
- If battle module reports blackout, call/route to `blackout(addr)`: reduce money, move player to `last_center`, heal party.

Marts:

- `buy(addr, mart_id, item_id, qty)` validates stock unlock, price, and money.
- `sell(addr, item_id, qty)` validates sellability and pays configured resale price.
- For MVP, use fixed stock per mart or badge-unlocked stock. Badge-unlocked stock is easy because badges are already a bitset.

Item pickups:

- `pickup(addr, item_id)` validates player is adjacent and facing item coordinate, then sets picked flag and increments bag quantity.
- Static one-time item balls are enough for MVP. Hidden items, berry regrowth, fake items, and line-of-sight blocking item balls can be deferred.

### Transactions and Turn Boundaries

Use one transaction per meaningful tile step or interaction. This is slower than a Game Boy loop, but aligns with blockchain settlement and avoids huge footprints.

Transaction boundaries:

- `move`: one tile, possible trigger emission.
- `interact`: talk/sign/item/center/mart/gate action.
- `start_battle`: consumes pending trainer/encounter trigger and creates battle state.
- `resolve_battle`: writes rewards, defeated flags, catch result, party updates.
- `buy/sell`: mart state and bag/money update.

Do not batch long paths at first unless the contract can validate every intermediate tile and trigger. If batching is added, stop at the first trigger and commit only valid prefix movement.

### State Size and Footprints

Keep read/write sets small:

- Movement should read `Player(addr)`, route metadata, and at most one candidate trigger object; write `Player(addr)` and maybe a temporary pending trigger.
- Avoid loading full route maps or full global NPC lists on every movement.
- Avoid unbounded vectors in a single player record. Use bitsets for small MVP flags and separate keyed records when counts grow.
- Keep large static content off-chain with hashes: tile maps, dialogue text, shop names, NPC flavor text, and encounter table display data.
- Use Temporary storage for pending encounters, pending battles, cooldowns, and commit-reveal commitments. Use Persistent for player progression, bag balances, badges, party ownership, defeated trainers, and picked items.

## Minimal Playable Prototype

Build the smallest on-chain overworld that still feels like Pokemon:

1. Two routes and one town: Town, Route 1, and a small cave/grass area.
2. Grid movement with walls, exits, grass, one ledge, one locked gate.
3. One Pokemon Center, one Poke Mart, three item balls.
4. Two trainers with fixed sight lines and fixed parties.
5. One badge or story flag that unlocks a gate.
6. Grass encounters using prototype deterministic seed or basic commit-reveal.
7. Events for the frontend: movement result, encounter pending, trainer triggered, item picked, healed, bought/sold.

Defer:

- Full HM system.
- Dynamic NPC wandering.
- Hidden items and berry regrowth.
- Full map Merkle proofs.
- Multi-route path batching.
- Sophisticated randomness or anti-withholding penalties.
- Complete battle mechanics, unless battle is the next milestone.

## Implementation Takeaways

1. Treat the overworld as deterministic state transitions at tile boundaries; animation and rendering are entirely client-side.
2. Store only player progression and compact route metadata on-chain; hash or hard-code large static maps off-chain.
3. Random encounters should create temporary pending battle state, not immediately mutate permanent progression.
4. Trainer sight, item pickup, centers, marts, and gates are all deterministic validations against route objects plus player flags.
5. Start with one transaction per tile/interact/battle boundary. Add path batching only after trigger ordering and intermediate validation are solid.
