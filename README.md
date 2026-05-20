# Asteroid Arena on Cloudflare

An experimental real-time multiplayer browser game built on Cloudflare Workers,
Durable Objects, hibernatable WebSockets, and a compact binary protocol.

## Local Development

```sh
npm install
npm run dev
```

Open http://localhost:8787.

Controls:

- `ArrowLeft` / `A`: turn left
- `ArrowRight` / `D`: turn right
- `ArrowUp` / `W`: thrust
- `Space` / `J`: fire
- `M`: mute/unmute procedural audio
- Mobile: drag the left joystick to turn/thrust and hold the right fire button

Load-test the local arena with server-side bots:

```text
http://localhost:8787/?bots=20
```

The minimap is disabled by default for performance and visual calm. Enable it
when needed with:

```text
http://localhost:8787/?bots=20&minimap=1
```

Decorative starfield/nebula/debris rendering is also disabled by default. Enable
it while experimenting with visuals:

```text
http://localhost:8787/?bots=20&detail=1
```

Extra cosmetic rings, glows, particles, and center reticle are disabled by
default. Enable them with:

```text
http://localhost:8787/?bots=20&effects=1
```

## Architecture

The Worker serves static assets and forwards `/ws` upgrades to a single named
Durable Object, `global-arena`. The Durable Object owns authoritative game
state, accepts binary input packets, simulates movement and bullets at 30 Hz,
and sends compact binary snapshots at 15 Hz. The browser renders at the display
refresh rate with local interpolation, visual effects, minimap, and procedural
audio, so game feel can improve without increasing WebSocket traffic.

See [docs/multiplayer-shooter-spec.md](docs/multiplayer-shooter-spec.md).
