# Multiplayer Shooter Spec

## Game

Asteroids-style 2D arena with wrapping world bounds. Players pilot ships using
turn left, turn right, thrust, and fire. Bullet hits eliminate the target, grow
the shooter, and increase score. Eliminated players respawn into the same
global arena after a short delay.

## Cloudflare Runtime

- Worker serves static assets and routes `/ws` to a Durable Object.
- One named Durable Object, `global-arena`, coordinates active players.
- WebSockets use the Durable Object hibernation API via `ctx.acceptWebSocket`.
- State is in memory for v1. Persistent leaderboard storage can be added later
  with Durable Object SQLite storage or D1.

Cloudflare docs confirm Durable Objects are the coordination point for
multi-client WebSocket apps and can handle hibernatable WebSockets with
`acceptWebSocket`.

## Network Model

- Server authoritative.
- Clients send input intent only, never positions or hit claims.
- Server simulates ships, bullets, collisions, score, growth, death, and
  respawn.
- Clients render snapshots and extrapolate lightly from authoritative velocity.

## Simulation

- Server tick rate: 30 Hz.
- Snapshot rate: 15 Hz.
- World size: 8192 x 8192 integer units.
- Coordinates wrap on both axes.
- Runtime motion uses integer positions/velocities and angle lookup tables.

## Binary Packets

Client input packet, 8 bytes:

```text
uint8  type = 1
uint16 inputSeq
uint8  buttons bitfield: left/right/thrust/fire
uint32 lastServerTickSeen
```

Server hello packet, 12 bytes:

```text
uint8  type = 2
uint8  protocolVersion
uint16 playerId
uint32 serverTick
uint16 worldWidth
uint16 worldHeight
```

Server snapshot packet:

```text
uint8  type = 3
uint8  protocolVersion
uint32 serverTick
uint16 ackInputSeq
uint16 selfPlayerId
uint16 playerCount
repeat playerCount:
  uint16 id
  uint16 x
  uint16 y
  int16  vx
  int16  vy
  uint16 angle
  uint16 radius
  uint16 score
  uint8  alive
  uint16 hue
uint16 bulletCount
repeat bulletCount:
  uint16 id
  uint16 ownerId
  uint16 x
  uint16 y
  int16  vx
  int16  vy
  uint8  ttl
```

## Performance Notes

The current v1 sends full compact snapshots. At 200 players, player payload is
about 3.8 KB per snapshot before bullets, or roughly 57 KB/s per connected
client at 15 Hz if every entity is relevant. The next scaling step is
interest management:

- Spatial hash the world into fixed cells.
- Send nearby cells at 15 Hz.
- Send far cells at reduced frequency or omit them.
- Add per-client delta baselines once the entity count grows.

## Client Feel

- Browser rendering runs at `requestAnimationFrame` cadence while the server
  remains authoritative at 30 Hz.
- Local and remote entities are visually interpolated/extrapolated between
  snapshots.
- The camera is zoomed out and eases toward the player with velocity lead.
- The minimap is optional and disabled by default (`minimap=1`) because the
  edge indicators plus wider camera usually provide enough awareness at lower
  render cost.
- Decorative starfield, nebula, and debris layers are optional (`detail=1`) and
  disabled by default. The default renderer prioritizes grid, ships, bullets,
  edge indicators, and short-lived gameplay VFX.
- Extra cosmetic rings, glows, particles, muzzle flashes, and center reticle
  are optional (`effects=1`) and disabled by default. The default renderer
  keeps offscreen indicators, bullet streaks, and ship thrust flames because
  those carry gameplay information.
- Procedural WebAudio is unlocked on the first gesture and generates thrust,
  fire, and impact cues without audio assets.
- `?bots=N` on the page URL asks the local arena for up to 20 server-side bots
  for playtesting density and rendering performance.

## Client Performance Strategy

- Keep gameplay state authoritative and low-frequency, but render with
  `requestAnimationFrame` at the display refresh rate.
- Decorative rendering is adaptive. The client tracks an FPS moving average and
  skips stars, debris, nebulae, gradients, and particle density if frame rate
  drops below target.
- Default mode avoids the decorative starfield entirely, reducing per-frame
  math and draw calls. Rich background detail is an explicit visual-debug mode.
- Decorative object counts are intentionally bounded: background stars, nebulae,
  debris, particles, rings, and muzzle flashes have fixed or capped budgets.
- Expensive effects are nonessential. Low-quality mode keeps ships, bullets,
  grid, HUD, and minimap readable while dropping or simplifying glows,
  gradients, and dense particles.
- Current local check: `?bots=20` with roughly 22 ships and 30+ bullets measured
  60 FPS in the browser automation environment.

## Fairness

- Drop stale or implausibly old input sequence numbers.
- Enforce fire cooldown server-side.
- Simulate bullets and circle collision server-side.
- Ignore client-reported hits.
- Use session ids to replace stale same-tab sockets on reconnect.
- Future high-speed shot improvement: keep 250-500 ms player position history
  and perform lag-compensated projectile or hitscan checks.
