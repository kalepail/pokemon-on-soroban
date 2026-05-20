# Pokemon on Soroban

Pokemon on Soroban started from a deliberately unreasonable question:

> What would it take to make a Pokemon-style game whose authoritative state can
> live on Soroban?

This repo answers that with working software, not just a pitch. It contains two
polished Pokemon-style browser games, `Pokémon Pocket Clash` as a
server-authoritative real-time multiplayer arena on Cloudflare Durable Objects,
a Rust terminal client that speaks the same binary arena protocol, and a
detailed Soroban design corpus for turning the prototype mechanics into
deterministic on-chain state transitions.

The project is intentionally broader than a normal hackathon demo because the
problem is broader than a normal dapp. A real on-chain game needs a fun client, a
clear simulation model, adversarial-state design, deterministic battle math,
bounded transactions, and a plan for what belongs on-chain versus off-chain.
This repository covers those layers end to end.

## What We Built

### 1. Pocket Arena: Pokemon-Style Browser Game

Open `/pokemon/` in the Worker-served site for the main Pokemon-inspired game.
It is a complete playable browser prototype with:

- A handheld-console presentation with custom pixel-art styling.
- Overworld movement inside a fenced grass arena.
- Seven wild creature types: Leafkin, Aquoot, Voltini, Stonewee, Petalon,
  Wispette, and Cloudini.
- Throwing and capture flow built around pokeballs.
- Turn-based battle transitions when a pokeball hits a wild creature.
- A battle state machine with Fight, Catch, and Run actions.
- Four player moves with damage, accuracy, status effects, and type
  effectiveness.
- Enemy move selection, HP bars, attack animations, screen shake, flashes,
  fainting, capture animations, and battle exits.
- A small tuning surface in source for wild count, speed, growth, scanlines,
  palette, and music mood.

This is the piece that makes the submission instantly understandable to judges:
it feels like a real game, not a ledger demo.

### 2. Pokémon Pocket Clash: Real-Time Multiplayer on Cloudflare

The root page, `/`, is `Pokémon Pocket Clash`: a server-authoritative
multiplayer pokeball arena built on Cloudflare Workers, Durable Objects,
hibernatable WebSockets, Canvas 2D, and a compact binary protocol.

It includes:

- One named Durable Object, `global-arena`, as the authoritative game
  coordinator.
- Hibernatable WebSockets via `ctx.acceptWebSocket`.
- 30 Hz server simulation and 15 Hz binary snapshots.
- Integer movement physics over an 8192 x 8192 toroidal world.
- Server-side pokeball projectile simulation, swept collision checks, kill
  scoring, and elimination.
- Projectile spawn and hit radii model pokeballs explicitly, so collision
  matches the visual object instead of pretending every shot is a point.
- Sequence-number validation to reject replayed or implausibly stale inputs.
- Client-side prediction for the local player.
- Remote interpolation/extrapolation for smooth 60 FPS rendering from 15 Hz
  snapshots.
- Procedural Web Audio for thrust, firing, and impact feedback.
- Mobile controls using analog touch direction and throttle.
- Server-side bots through `?bots=20` for density and stress testing.
- Reconnect/session handling to prevent duplicate ghost players.

The multiplayer arena demonstrates the engineering discipline required for
trust-minimized gameplay: the client renders and predicts, but the server owns
truth.

### 3. Stellar Snake: Game Boy-Style Creature Collector

Open `/snake/` for a second complete browser game, implemented in
`public/snake/`: a Stellar-themed creature collector that fuses classic snake
movement with Pokemon-like encounters, route progression, battles, and a
collection screen.

It includes:

- A Game Boy-style device frame with working D-pad, A, B, Start, and Select
  controls.
- A title screen, route map, gameplay board, pause menu, Stellardex, battle
  screen, catch popup, life-loss overlay, and game-over screen.
- 20 Stellar-themed creatures, including a custom Sparko starter sprite.
- Snake-grid movement with berries, score, length, lives, wild creature
  encounters, and route-based play.
- Turn-based battles with Fight, Catch, Item, and Run actions.
- HP bars, enemy attacks, catches based on remaining HP, KO handling, flee
  handling, and collection updates.
- Original Web Audio chiptune tracks for title, route, battle, catch, life-loss,
  and game-over states, plus sound effects.
- A tweak panel for palette, board size, speed, and mute state.
- A checked-in screenshot at `public/snake/screenshots/01-title.png` for quick
  visual review.

This is the most product-like prototype in the repo: it has progression, a
collection loop, a complete screen state machine, and a cohesive handheld-game
presentation.

### 4. Rust Terminal Arena Client

The `rust/` crate is a terminal client that connects to the same WebSocket
arena and renders the shared game state as a Pokemon-flavored overworld.

It includes:

- A Tungstenite WebSocket client for the arena binary protocol.
- Ratatui/Crossterm rendering in the terminal alternate screen.
- Non-blocking network polling and a 30 Hz terminal render loop.
- Keyboard enhancement flags so simultaneous key state behaves properly.
- A custom pixel renderer using terminal block characters and ANSI colors.
- Procedural grass, fence, flowers, and world background.
- Trainer-like player sprites that rotate with heading.
- Bullets rendered as arcing pokeballs with shadows.

This proves the protocol and simulation are not tied to one frontend. A browser
client and a Rust terminal client can both participate in the same world.

### 5. Soroban Design Documentation

The on-chain layer is specified in `docs/research/`. These documents break down
the exact design choices needed to move from game prototype to Soroban contract:

- `overworld-soroban.md`: player state, route metadata, persistent versus
  temporary storage, encounter triggers, commit-reveal randomness, and
  transaction boundaries.
- `battle-mechanics.md`: deterministic Gen I/II-style battle formulas, fixed
  point type effectiveness, status conditions, turn ordering, replacement flow,
  and gas-bounded battle transitions.
- `data-progression.md`: Pokemon data modeling, party/box structure, stats,
  progression, item ownership, and what should remain off-chain.
- `cloudflare-websocket-capacity.md`: real-time scaling research for Durable
  Objects, hibernation, fan-out, and the path beyond one hot room.
- `audio-design.md`: procedural audio direction for the browser game.

The important thing: the blockchain part is not a vague future idea. The repo
contains a concrete Soroban implementation plan that names the storage keys,
entrypoints, deterministic math, and transaction boundaries.

## Local Development

Install dependencies and run the Worker locally:

```sh
npm install
npm run dev
```

Open:

- Pokémon Pocket Clash multiplayer arena: `http://localhost:8787/`
- Pokemon-style game: `http://localhost:8787/pokemon/`
- Snake: `http://localhost:8787/snake/`
- Arena with bots: `http://localhost:8787/?bots=20`
- Arena with minimap: `http://localhost:8787/?bots=20&minimap=1`
- Arena with decorative detail: `http://localhost:8787/?bots=20&detail=1`
- Arena with extra effects: `http://localhost:8787/?bots=20&effects=1`

Build-check the Worker TypeScript:

```sh
npm run build
```

Run the Rust terminal client after the local Worker is running:

```sh
cd rust
cargo run
```

By default the terminal client connects to:

```text
ws://localhost:8787/ws
```

You can pass another WebSocket URL as the first argument.

## Suggested Judge Path

1. Start at `/`; the bottom navigation links directly to `Pokemon` and `Snake`.
2. Open `/pokemon/` to see the classic Pokemon-style overworld and battle loop.
3. Open `/snake/` to see the Game Boy-style creature collector, Stellardex, and
   original chiptune system.
4. Use Snake's `ARENA` link to jump back to the multiplayer arena.
5. Open `/?bots=20` to see the authoritative multiplayer arena under load.
6. Skim `docs/research/overworld-soroban.md` and
   `docs/research/battle-mechanics.md` to see how the prototypes map to
   deterministic Soroban state transitions.

## Controls

### Pokémon Pocket Clash

- `ArrowLeft` / `A`: turn left
- `ArrowRight` / `D`: turn right
- `ArrowUp` / `W`: thrust
- `Space` / `J`: fire
- `M`: mute/unmute procedural audio
- Mobile: drag the left joystick to aim/thrust and hold the right fire button

### Rust Terminal Client

- `ArrowLeft` / `ArrowRight`: turn
- `ArrowUp`: thrust
- `Space`: fire
- `Q` / `Esc`: quit

### Pokemon Browser Game

- Move with keyboard controls or on-screen controls.
- Throw/catch with the action button.
- In battle, use the visible command menu for Fight, Catch, and Run.

### Stellar Snake

- `Arrow` keys / WASD: move and navigate menus
- `Enter` / `Space` / `Z`: confirm
- `Esc` / `P`: pause or back
- On-screen D-pad, A, B, Start, and Select mirror the keyboard controls
- `ARENA`: fixed link back to the root multiplayer arena

## Architecture

```text
Browser assets
  public/
  public/pokemon/
  public/snake/
        |
        v
Cloudflare Worker (src/index.ts)
  - serves static assets
  - routes /ws upgrades
        |
        v
Durable Object Arena
  - authoritative players and bullets
  - binary protocol
  - 30 Hz simulation
  - 15 Hz snapshots
        |
        +--> Browser arena client
        +--> Rust terminal client

Soroban design docs
  - overworld state model
  - battle math
  - progression data model
  - storage and transaction boundaries
```

The Worker serves static assets and forwards `/ws` upgrades to a single named
Durable Object, `global-arena`. The Durable Object owns authoritative arena
state, accepts binary input packets, simulates movement and bullets at 30 Hz,
and sends compact binary snapshots at 15 Hz.

The clients render independently. The browser arena uses Canvas 2D, local
prediction, interpolation, mobile input, and Web Audio. The Rust client uses the
same protocol but renders the world through a terminal pixel pipeline.

## Binary Protocol

The arena protocol is compact by design:

- Input packet: 8 bytes for basic input, 12 bytes when direct aim and analog
  throttle are included.
- Hello packet: 12 bytes with player ID, tick, and world dimensions.
- Snapshot packet: 12-byte header, 19 bytes per player, 13 bytes per bullet.
- Death packet: 8 bytes.

For a room with 30 players and 60 bullets, one snapshot is under 1.5 KB. At 15
snapshots per second, this keeps bandwidth low while preserving an authoritative
server model.

## Why This Matters

Most blockchain game demos either put a token next to a game or put a trivial
game next to a wallet. This project tackles the actual hard parts:

- How do you make the game feel good before the chain is involved?
- Which state transitions are worth putting on-chain?
- How do you keep those transitions deterministic and gas-bounded?
- How do you handle randomness without trusting the client?
- How do you represent Pokemon-like battle mechanics without floating point?
- How do you keep large art, maps, dialogue, and static tables off-chain while
  still anchoring trust?

That is why this is more than a theme demo. It is a full-stack exploration of
how Pokemon-style gameplay can be made compatible with Soroban's execution
model.

## Key Files

- `public/pokemon/`: Pokemon-style browser game.
- `public/snake/`: Stellar-themed snake and creature collector.
- `public/client.js`: browser client for the multiplayer arena.
- `src/index.ts`: Worker and Durable Object entrypoint.
- `src/sim.ts`: authoritative arena simulation.
- `src/protocol.ts`: binary packet definitions.
- `rust/`: terminal client.
- `docs/multiplayer-shooter-spec.md`: arena implementation spec.
- `docs/research/`: Soroban and game-mechanics research corpus.
- `JUDGE.md`: judging brief and award argument.
