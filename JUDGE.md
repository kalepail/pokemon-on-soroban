# Why Pokemon on Soroban Should Win

## The Short Version

This project deserves the win because it did the thing hackathons are supposed
to reward: it took an ambitious, slightly absurd idea and pushed it through real
engineering until there was working software on the screen.

The idea was not "add a wallet to a game." The idea was:

> Can a Pokemon-style game be designed so its meaningful state transitions can
> be executed by a Soroban smart contract?

That question forced the project to cover game design, deterministic battle
math, Soroban storage strategy, transaction boundaries, multiplayer simulation,
binary networking, browser rendering, mobile controls, terminal rendering,
original audio, collection loops, and edge deployment. The result is not a thin
demo. It is a multi-layer prototype and architecture package that shows what an
on-chain Pokemon-like game could actually become.

For judges, the shortest path is: start at `/`, use the in-app links to play
`/pokemon/` and `/snake/`, then open `/?bots=20`. That shows the classic
Pokemon loop, the Stellar-themed collection loop, and the server-authoritative
multiplayer system in minutes.

## The Winning Thesis

Pokemon on Soroban should win because it solves the judging problem from both
directions:

- It is immediately playable. A judge can open the site and understand the
  fantasy without reading architecture notes.
- It is technically serious. The multiplayer arena uses an authoritative edge
  simulation, hibernatable WebSockets, compact binary packets, prediction,
  reconciliation, interpolation, bots, and a second client.
- It is credible as a Soroban project. The repo identifies which parts of a
  Pokemon-like game should become deterministic contract transitions and which
  parts should stay client-side or edge-side.

That combination is rare. A fun frontend alone is not enough. A contract sketch
alone is not enough. This submission has a playable product surface and the
systems thinking needed to turn that surface into auditable Soroban state.

## Honest Scope

The implemented artifacts are the browser games, Cloudflare Worker, Durable
Object arena, binary protocol, bots, browser client, and Rust terminal client.
The Soroban contract itself is not checked in as a finished contract. Instead,
the repo includes the implementation plan for the contract layer in
`docs/research/`, including storage keys, transaction boundaries, deterministic
battle formulas, data modeling, and randomness design.

That is a strength, not a dodge. The project does not claim that a full Pokemon
world can simply be shoved into contract storage. It shows the correct product
boundary: keep feel, art, sound, and rendering off-chain; put progression,
captures, route validation, inventories, and battle resolution into
deterministic, gas-bounded transitions.

## What Was Shipped

### 1. A Playable Pokemon-Style Browser Game

The `public/pokemon/` game is the clearest expression of the product vision. It
is a full browser game presented inside a handheld-console interface, with a
playable overworld, wild creatures, pokeball throws, capture flow, and
turn-based battles.

What it includes:

- A custom pixel-art world with grass, fences, flowers, shadows, and a handheld
  console frame.
- Seven creature types with distinct identities and movement behavior.
- Overworld movement, aiming, projectile throws, collision against wild
  creatures, capture animations, and progression counters.
- A battle state machine with message queues, menus, attack phases, enemy
  turns, catch attempts, run attempts, fainting, battle exits, HP bars, screen
  shake, flashes, and sprite animation.
- Four player moves with accuracy, damage, type effectiveness, and a status
  effect.
- Enemy move selection and type-aware feedback such as "super effective" and
  "not very effective."
- Source-level tuning for wild count, movement speed, projectile speed, growth
  per catch, palette, scanlines, and music mood.

This matters because a blockchain game still has to be a good game. Judges can
open the prototype and immediately understand the intended experience.

### 2. Stellar Snake: A Second Complete Creature-Collector Prototype

The newest addition, `public/snake/`, is a second fully playable game.
It takes the Pokemon-on-Soroban premise in a different direction: snake-grid
movement, route progression, wild encounters, battles, collection, lives, and
Game Boy presentation.

What it includes:

- A complete Game Boy-style device frame with D-pad, A, B, Start, and Select
  controls.
- Title, map, game, battle, pause, Stellardex, catch, life-loss, and game-over
  screens.
- 20 Stellar-themed creatures built from Stellar icon assets plus a custom
  Sparko starter sprite.
- Snake movement with berries, score, length, lives, and wild creatures placed
  directly on the board.
- Route selection and route unlocking structure.
- Turn-based battle flow with Fight, Catch, Item, and Run actions.
- Catch probability that improves as the wild creature's HP falls.
- KO handling, life loss, respawn, and final game-over flow.
- A Stellardex collection screen with caught/unknown entries and creature
  details.
- Original chiptune music and sound effects generated through Web Audio.
- A tweak panel for palette, board size, speed, and audio muting.
- A checked-in title screenshot at `public/snake/screenshots/01-title.png` for
  quick visual review.
- A fixed `ARENA` link back to `/`, so the demo flow stays connected instead of
  feeling like disconnected prototypes.

This addition matters for judging because it proves the team did not stop after
one attractive mockup. It adds another full gameplay loop, another interaction
model, another audio system, another UI shell, and another expression of how
Pokemon-like progression could feel before the Soroban state layer is attached.

### 3. Pokémon Pocket Clash: A Server-Authoritative Multiplayer Arena

The root app, `Pokémon Pocket Clash`, is a real-time multiplayer pokeball arena
built on Cloudflare Workers, Durable Objects, hibernatable WebSockets, Canvas
2D, Web Audio, and a custom binary protocol.

This is not a decorative backend. It is an authoritative simulation:

- A single named Durable Object, `global-arena`, owns the room state.
- WebSocket upgrades route through the Worker to the Durable Object.
- The object accepts sockets with `ctx.acceptWebSocket`, allowing hibernation.
- The simulation runs at 30 Hz and broadcasts snapshots at 15 Hz.
- Player movement, pokeball projectile creation, projectile TTL, fire cooldowns,
  hit detection, kills, scoring, elimination, and bot behavior all run
  server-side.
- Clients never report hits. They only send input.
- Inputs carry sequence numbers, and the server rejects replayed or implausible
  deltas.
- The world wraps toroidally, and collision uses shortest-path torus deltas so
  boundary-crossing shots are handled correctly.
- Projectile spawn distance and hit radii now model the pokeball as a real
  object, not a point, and the swept collision math accounts for relative
  player/projectile movement between ticks.

That is the right security posture for any serious on-chain game. The client is
allowed to render and predict, but it is not allowed to decide truth.

### 4. A Compact Binary Protocol

Instead of sending JSON blobs, the project defines its own compact packet
format:

- Input: 8 bytes for base input, 12 bytes with direct aim and analog throttle.
- Hello: 12 bytes.
- Death: 8 bytes.
- Snapshot: 12-byte header plus 19 bytes per player and 13 bytes per bullet.

At 30 players and 60 bullets, a snapshot is still under 1.5 KB. At 15 snapshots
per second, that keeps traffic practical while preserving server authority.

This is the sort of infrastructure work most hackathon projects skip. We did it
because responsive multiplayer and trust-minimized gameplay need more than a
REST endpoint.

### 5. Client Prediction, Interpolation, and Mobile Controls

The browser arena is not a naive snapshot viewer. It includes:

- Local prediction for the current player.
- A pending-input queue keyed by acknowledged sequence number.
- Server reconciliation.
- Predicted bullets reconciled against server-confirmed bullet IDs.
- Remote entity interpolation/extrapolation from position and velocity.
- Camera smoothing with velocity lead.
- Adaptive rendering quality for cosmetic layers.
- Procedural audio for thrust, shots, and impacts.
- Touch controls with direct aim and analog throttle using the same packet
  fields as desktop input.

That is why the game feels responsive while still respecting server truth.

### 6. Server-Side Bots and Stress Testing

The arena can be loaded with bots through `?bots=20`. These bots are real server
entities, not client decorations. They move, fire, collide, die, and contribute
to load just like connected players.

The bots gave us dense playtesting from the beginning and made it possible to
exercise the renderer, network protocol, snapshot packing, scoring, and
collision paths without needing a room full of humans.

### 7. A Rust Terminal Client for the Same Arena

The `rust/` crate connects to the same WebSocket endpoint and parses the same
binary packets. It renders the shared arena as a terminal-based Pokemon-flavored
overworld.

Highlights:

- Tungstenite WebSocket client.
- Ratatui/Crossterm terminal UI.
- Non-blocking socket reads.
- 30 Hz input/render loop.
- Keyboard enhancement flags for simultaneous key state.
- Terminal pixel rendering with block characters and ANSI colors.
- Procedural grass, fences, flowers, and world background.
- Trainer-style player sprites rotated according to heading.
- Bullets rendered as arcing pokeballs with ground shadows.

This proves the simulation and protocol are frontend-agnostic. We built one
authoritative world and multiple clients for it.

### 8. Soroban Architecture That Is Actually Thought Through

The `docs/research/` directory is the bridge from prototype to Soroban. It does
not say "we will put it on-chain later" and stop there. It specifies how.

The design covers:

- `PlayerState` in Persistent storage.
- Separate keyed bag/inventory records to avoid unbounded player-state growth.
- Route metadata with off-chain tile maps anchored by hashes.
- Trigger coordinates, route exits, NPC interactions, shops, and item pickup.
- One transaction per meaningful tile step, stopping at the first trigger.
- Commit-reveal randomness for wild encounters, including the withholding
  tradeoff.
- Battle entrypoints and state transitions.
- Deterministic fixed-point type effectiveness.
- Gen I/II-inspired damage formulas without floating point.
- Accuracy/evasion stages, status conditions, critical hits, priority, speed
  ties, voluntary switches, and replacement state.
- Party, PC, progression, stat, item, move, and evolution data modeling.
- What belongs on-chain, what belongs off-chain, and why.

This is exactly the analysis an on-chain game needs. Soroban is deterministic,
metered, and storage-sensitive. The docs respect those constraints instead of
pretending a full game can be shoved blindly into contract storage.

### 9. A Clear Evidence Trail

The repo is structured so every major claim can be checked quickly:

| Claim | Evidence |
|---|---|
| The main game loop is playable | `public/pokemon/`, served at `/pokemon/` |
| There is a second complete creature-collector loop | `public/snake/`, served at `/snake/` |
| Multiplayer authority lives server-side | `src/index.ts`, `src/sim.ts` |
| Clients send intent, not outcomes | `readInputPacket` in `src/protocol.ts`, `webSocketMessage` in `src/index.ts` |
| Snapshots are compact binary packets | `src/protocol.ts`, `buildSharedSnapshot` in `src/index.ts` |
| Bots exercise the real simulation | `?bots=20`, `ensureBots`, and `updateBots` in `src/index.ts` |
| The protocol is portable | `rust/src/protocol.rs` and the terminal client in `rust/` |
| The Soroban design is concrete | `docs/research/overworld-soroban.md`, `battle-mechanics.md`, `data-progression.md` |

This matters because a judge should not have to infer whether the project is
real. The files line up with the pitch.

## Why It Is Awesome

### It Is Ambitious in the Right Way

The project did not aim for the smallest possible blockchain demo. It aimed at a
beloved, mechanically rich game shape and asked what has to change for that
shape to work with Soroban.

That led to real design decisions:

- Static maps should not live directly in contract storage.
- Large text and art assets should stay off-chain.
- On-chain route metadata can anchor the valid world.
- Movement should be committed in bounded prefixes.
- Battle math must be integer/fixed-point.
- Random encounters need adversarial randomness design.
- The client can be rich and responsive while the contract stays authoritative
  over progression.

Those are mature choices. They show restraint and product sense, not just
enthusiasm.

### It Has Multiple Working Verticals

Many teams ship one screen. This repo ships:

- Two Pokemon-style browser games.
- A server-authoritative multiplayer arena.
- A Rust terminal client.
- A custom binary protocol shared across clients.
- A Cloudflare edge deployment model.
- Original procedural and chiptune audio systems.
- A Soroban architecture and mechanics research corpus.

Each vertical is meaningful on its own. Together, they show unusual breadth.

### It Treats Games as Adversarial Systems

The multiplayer architecture is useful evidence for the Soroban vision because
it already applies the correct trust model:

- Clients submit intent, not outcomes.
- The authority validates and simulates.
- State updates are compact and deterministic.
- Replay and stale input are rejected.
- Collision and scoring are not client claims.

That same mindset carries into the Soroban docs: deterministic math,
gas-bounded transitions, storage partitioning, and randomness analysis.

### It Understands What Should Not Be On-Chain

One of the most important technical choices is restraint. The docs separate
state that needs authority from assets that only need rendering:

- Sprites, animations, maps, audio, dialogue, camera movement, and input feel
  stay in the client.
- Real-time room coordination and fast snapshots stay in the Durable Object.
- Progression, route location, inventory, captures, collection state, battle
  actions, and battle resolution become Soroban-owned transitions.
- Large static data is represented by compact IDs and hashes instead of copied
  wholesale into contract storage.

That is the difference between a blockchain-themed game and a game designed for
blockchain constraints.

### It Is Built Like Engineers Cared

Specific examples:

- Integer physics with precomputed sine/cosine lookup tables.
- Swept bullet collision rather than point-only collision.
- Pokeball projectile sizing and spawn offsets that match the visual/gameplay
  object.
- Toroidal shortest-path collision handling.
- WebSocket hibernation instead of always-hot room processes.
- Snapshot reuse with per-client ack/self fields patched in.
- Adaptive browser rendering that degrades cosmetic work before gameplay work.
- Browser and Rust clients sharing the same protocol.
- Procedural audio instead of asset dependency.
- Terminal renderer that creates a pixel-art feel without image files.

These choices are invisible in a quick pitch, but they are exactly what
separates a serious implementation from a mockup.

## Why It Deserves the Win Over Competitors

Most competitors will likely fall into one of three categories:

1. A normal web app with a blockchain transaction.
2. A game-like frontend with little real systems work.
3. A contract idea with no convincing user experience.

Pokemon on Soroban beats those because it delivers all three things at once:

- A playable game experience.
- Serious real-time systems engineering.
- A credible Soroban execution model.

It also avoids the common blockchain-game trap of making the chain the whole
product. The chain is used where it matters: ownership, progression,
deterministic battle resolution, encounter validation, and auditable state
transitions. The client remains responsible for what clients are good at:
animation, rendering, sound, input, and feel.

That division of responsibility is the difference between a demo and a path to a
real product.

## Judging Criteria Fit

### Technical Difficulty

Very high. The project spans:

| Area | Evidence |
|---|---|
| Soroban design | Storage keys, deterministic battle math, transaction boundaries, randomness analysis |
| Real-time backend | Durable Object authority, hibernatable WebSockets, 30 Hz simulation |
| Networking | Hand-authored binary packet protocol, snapshots, input sequence validation |
| Browser game | Canvas rendering, procedural audio, local prediction, mobile controls |
| Pokemon prototypes | Pocket Arena plus Stellar Snake: overworlds, creatures, captures, battles, menus, HP, collection |
| Rust client | WebSocket protocol parsing, terminal renderer, Ratatui/Crossterm loop |
| Game feel | Camera, interpolation, animations, screen shake, particles, handheld UI, chiptune music |

The especially difficult part is not any one bullet. It is that the pieces agree
with each other: the protocol is compact enough for real-time play, the server
is authoritative enough to be a trust model, the browser remains responsive
through prediction/interpolation, and the Soroban docs preserve the same
authority model in deterministic contract-sized operations.

### Creativity

The idea is memorable: Pokemon on Soroban. It is funny, bold, technically
interesting, and instantly legible. More importantly, the implementation backs
up the joke with real work.

### Completeness

The repo contains multiple runnable artifacts:

- `npm run dev` starts the Cloudflare Worker locally.
- `/` opens the multiplayer arena.
- `/pokemon/` opens the Pokemon-style game.
- `/snake/` opens the Stellar-themed snake creature collector.
- `?bots=20` stress-tests the arena.
- `cd rust && cargo run` starts the terminal client against the local Worker.

The Soroban design is documented in enough detail that implementation can
continue from the current repo without rediscovering the core architecture.

Recommended judge verification:

```sh
npm install
npm run build
npm run dev
```

Then open `/`, `/pokemon/`, `/snake/`, and `/?bots=20`.

With the Worker still running:

```sh
cd rust
cargo run
```

That checks the browser experience, Worker build, Durable Object route, WebSocket
protocol, server-side bot path, and second client.

### Product Potential

The path forward is clear:

1. Keep the browser Pokemon prototypes as the primary UX exploration surface.
2. Implement the Soroban `PlayerState`, route, inventory, and battle records
   described in the docs.
3. Move progression, captures, route unlocks, collection updates, and battle
   resolution into deterministic contract transitions.
4. Keep maps, sprites, audio, and animations client-side with hashes anchoring
   critical static data where needed.
5. Use the real-time arena work as proof for future multiplayer regions, events,
   or side modes.

The result can become a real on-chain game rather than a one-off hackathon
screen.

### Judge Delight

Beyond the architecture, the project has the thing hackathon winners usually
need: it is memorable. "Pokemon on Soroban" is easy to repeat, funny without
being unserious, and backed by enough implementation that the joke turns into a
technical argument. Judges can play it, see that it has breadth, and then inspect
the repo to find real systems work underneath.

The best demos create a moment where the room understands the idea before the
presenter finishes explaining it. This one does that, then rewards deeper
inspection.

## Final Argument

Pokemon on Soroban should win because it combines ambition with execution. It
does not merely claim that a Pokemon-like game on Soroban would be interesting.
It builds the playable game, builds the real-time authoritative systems around
it, builds a second client in Rust, and documents the Soroban architecture needed
to make the important state transitions deterministic, auditable, and
gas-bounded.

That is the kind of project a hackathon should reward: a memorable idea, serious
engineering, real demos, honest constraint handling, and a credible path from
prototype to product.
