# TUI Game Client Design

## Overview

A terminal-based game client in Rust using `ratatui`. A player moves around a 2D world and shoots directional projectiles. The world is larger than the terminal viewport, which scrolls to follow the player. No networking yet — a local game loop stubs in the simulation, designed so the state model can be swapped for server-synced state later.

## Architecture

Four modules following Approach B (clean separation with swappable state):

- **`game`** — game state and simulation logic, pure data + updates, no I/O
- **`input`** — maps terminal key events to game actions
- **`render`** — reads game state, draws the viewport to the terminal
- **`main`** — owns the game loop, wires modules together

### Why this split

The `game` module exposes an action-based interface (`apply_action(Action)` / `tick(dt)`). When a server exists, the client stops running local simulation and instead applies state snapshots from the server. Input actions get sent over WebSocket instead of applied locally. Rendering doesn't change at all.

## Game State (`game` module)

All positions and velocities use `f64`.

### Types

```rust
enum Direction { Up, Down, Left, Right }

struct Player {
    position: (f64, f64),
    direction: Direction,
}

struct Projectile {
    position: (f64, f64),
    direction: Direction,
    speed: f64,
}

struct GameState {
    world_width: f64,
    world_height: f64,
    player: Player,
    projectiles: Vec<Projectile>,
}
```

### Operations

- `apply_action(action: Action)` — handles player movement and shooting
  - `Move(Direction)`: updates player position by `PLAYER_SPEED * dt` in the given direction, clamps to world bounds, updates facing direction
  - `Shoot`: spawns a `Projectile` at the player's position, traveling in the player's facing direction at `PROJECTILE_SPEED`
- `tick(dt: f64)` — advances all projectiles by `speed * dt` in their direction, removes any that leave world bounds

### Constants (configurable)

- `WORLD_WIDTH`: 200.0
- `WORLD_HEIGHT`: 100.0
- `PLAYER_SPEED`: 20.0 (cells per second)
- `PROJECTILE_SPEED`: 40.0 (cells per second)
- `TICK_RATE`: 15 (ticks per second)

## Input (`input` module)

Maps crossterm key events to an `Action` enum:

```rust
enum Action {
    Move(Direction),
    Shoot,
    Quit,
}
```

Key bindings:
- Arrow keys → `Move(Direction)` (continuous while held)
- Space → `Shoot`
- `q` / Esc → `Quit`

Input is polled each frame with a timeout derived from the tick rate. Multiple actions can be produced per frame (e.g., move + shoot).

## Rendering (`render` module)

Each frame:

1. Compute a viewport rectangle centered on the player, sized to the current terminal dimensions
2. Clamp the viewport so it doesn't extend past world boundaries
3. Draw visible world region:
   - World boundary rendered as a visible border where it intersects the viewport
   - Empty cells as background (space characters)
4. Draw the player as `@` at their position (mapped from world coords to viewport coords by truncating `f64` to cell index)
5. Draw projectiles as `*`

World-to-screen mapping: `screen_x = (world_x - viewport_left).floor() as u16`

## Game Loop (`main.rs`)

```
1. Initialize terminal (crossterm raw mode, alternate screen)
2. Create initial GameState (player at center of world)
3. Loop:
   a. Record frame start time
   b. Poll input events → collect Vec<Action>
   c. If Quit action, break
   d. Apply each action to game state
   e. tick(dt) to advance simulation
   f. Render game state to terminal
   g. Sleep remainder of frame to maintain TICK_RATE
4. Restore terminal on exit
```

## Dependencies

- `ratatui` — TUI framework
- `crossterm` — terminal backend (raw mode, key events, alternate screen)

## Future considerations (not built now)

- WebSocket connection to authoritative game server
- Server-sent state snapshots replacing local simulation
- Input actions serialized and sent to server
- Multiple players rendered on the same map
- Collision detection (server-side)
