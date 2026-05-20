# TUI Game Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TUI game client in Rust where a player moves around a scrolling 2D world and shoots directional projectiles.

**Architecture:** Four modules — `game` (pure state + simulation), `input` (key events to actions), `render` (viewport drawing), `main` (game loop). State uses `f64` positions. Action-based interface so state can be swapped for server-synced later.

**Tech Stack:** Rust, ratatui, crossterm

**Spec:** `docs/superpowers/specs/2026-05-20-tui-game-client-design.md`

---

## File Structure

```
Cargo.toml              — project manifest with ratatui + crossterm deps
src/
  main.rs               — game loop, terminal init/teardown
  game.rs               — GameState, Player, Projectile, Direction, Action, tick(), apply_action()
  input.rs              — poll_actions() maps crossterm events to Vec<Action>
  render.rs             — draw() computes viewport and renders state
  constants.rs          — all configurable constants (speeds, world size, tick rate)
tests/
  game_test.rs          — unit tests for game state logic
  input_test.rs         — unit tests for input mapping
  render_test.rs        — unit tests for viewport calculation
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `Cargo.toml`
- Create: `src/main.rs`
- Create: `src/constants.rs`

- [ ] **Step 1: Initialize the Cargo project**

Run:
```bash
cd /Users/geofframseyer/stellar/pokemon-on-soroban && cargo init --name pokemon-on-soroban
```

- [ ] **Step 2: Add dependencies to Cargo.toml**

Replace the `[dependencies]` section in `Cargo.toml`:

```toml
[dependencies]
ratatui = "0.29"
crossterm = "0.28"
```

- [ ] **Step 3: Create constants module**

Create `src/constants.rs`:

```rust
pub const WORLD_WIDTH: f64 = 200.0;
pub const WORLD_HEIGHT: f64 = 100.0;
pub const PLAYER_SPEED: f64 = 20.0;
pub const PROJECTILE_SPEED: f64 = 40.0;
pub const TICK_RATE: u64 = 15;
```

- [ ] **Step 4: Create minimal main.rs with module declarations**

Replace `src/main.rs`:

```rust
mod constants;
mod game;
mod input;
mod render;

fn main() {
    println!("game client placeholder");
}
```

- [ ] **Step 5: Create stub modules so it compiles**

Create `src/game.rs`:
```rust
```

Create `src/input.rs`:
```rust
```

Create `src/render.rs`:
```rust
```

- [ ] **Step 6: Verify it compiles**

Run: `cargo build`
Expected: compiles with no errors (warnings about unused modules are fine)

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml Cargo.lock src/
git commit -m "feat: scaffold rust project with ratatui + crossterm deps"
```

---

### Task 2: Game State Types and tick()

**Files:**
- Create: `src/game.rs`
- Create: `tests/game_test.rs`

- [ ] **Step 1: Write the failing test for Direction and types**

Create `tests/game_test.rs`:

```rust
use pokemon_on_soroban::game::{Direction, Player, Projectile, GameState};
use pokemon_on_soroban::constants::*;

#[test]
fn test_new_game_state() {
    let state = GameState::new();
    assert_eq!(state.world_width, WORLD_WIDTH);
    assert_eq!(state.world_height, WORLD_HEIGHT);
    assert!((state.player.position.0 - WORLD_WIDTH / 2.0).abs() < f64::EPSILON);
    assert!((state.player.position.1 - WORLD_HEIGHT / 2.0).abs() < f64::EPSILON);
    assert!(state.projectiles.is_empty());
}
```

- [ ] **Step 2: Make modules public by adding lib.rs**

Create `src/lib.rs`:

```rust
pub mod constants;
pub mod game;
pub mod input;
pub mod render;
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cargo test --test game_test test_new_game_state`
Expected: FAIL — types not defined yet

- [ ] **Step 4: Implement game types and GameState::new()**

Write `src/game.rs`:

```rust
use crate::constants::*;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

pub struct Player {
    pub position: (f64, f64),
    pub direction: Direction,
}

pub struct Projectile {
    pub position: (f64, f64),
    pub direction: Direction,
    pub speed: f64,
}

pub enum Action {
    Move(Direction),
    Shoot,
    Quit,
}

pub struct GameState {
    pub world_width: f64,
    pub world_height: f64,
    pub player: Player,
    pub projectiles: Vec<Projectile>,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            world_width: WORLD_WIDTH,
            world_height: WORLD_HEIGHT,
            player: Player {
                position: (WORLD_WIDTH / 2.0, WORLD_HEIGHT / 2.0),
                direction: Direction::Right,
            },
            projectiles: Vec::new(),
        }
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cargo test --test game_test test_new_game_state`
Expected: PASS

- [ ] **Step 6: Write the failing test for tick() — projectile movement**

Add to `tests/game_test.rs`:

```rust
#[test]
fn test_tick_moves_projectiles() {
    let mut state = GameState::new();
    state.projectiles.push(Projectile {
        position: (50.0, 50.0),
        direction: Direction::Right,
        speed: PROJECTILE_SPEED,
    });
    let dt = 1.0;
    state.tick(dt);
    assert!((state.projectiles[0].position.0 - (50.0 + PROJECTILE_SPEED)).abs() < f64::EPSILON);
    assert!((state.projectiles[0].position.1 - 50.0).abs() < f64::EPSILON);
}
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cargo test --test game_test test_tick_moves_projectiles`
Expected: FAIL — `tick` not defined

- [ ] **Step 8: Implement tick()**

Add to `GameState` impl in `src/game.rs`:

```rust
    pub fn tick(&mut self, dt: f64) {
        for projectile in &mut self.projectiles {
            match projectile.direction {
                Direction::Up => projectile.position.1 -= projectile.speed * dt,
                Direction::Down => projectile.position.1 += projectile.speed * dt,
                Direction::Left => projectile.position.0 -= projectile.speed * dt,
                Direction::Right => projectile.position.0 += projectile.speed * dt,
            }
        }
        self.projectiles.retain(|p| {
            p.position.0 >= 0.0
                && p.position.0 <= self.world_width
                && p.position.1 >= 0.0
                && p.position.1 <= self.world_height
        });
    }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cargo test --test game_test test_tick_moves_projectiles`
Expected: PASS

- [ ] **Step 10: Write failing test for tick() removing out-of-bounds projectiles**

Add to `tests/game_test.rs`:

```rust
#[test]
fn test_tick_removes_out_of_bounds_projectiles() {
    let mut state = GameState::new();
    state.projectiles.push(Projectile {
        position: (WORLD_WIDTH - 1.0, 50.0),
        direction: Direction::Right,
        speed: PROJECTILE_SPEED,
    });
    state.tick(1.0);
    assert!(state.projectiles.is_empty());
}
```

- [ ] **Step 11: Run test to verify it passes (already handled by retain)**

Run: `cargo test --test game_test test_tick_removes_out_of_bounds`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src/game.rs src/lib.rs tests/game_test.rs
git commit -m "feat: add game state types, GameState::new(), and tick()"
```

---

### Task 3: apply_action() — Movement and Shooting

**Files:**
- Modify: `src/game.rs`
- Modify: `tests/game_test.rs`

- [ ] **Step 1: Write failing test for Move action**

Add to `tests/game_test.rs`:

```rust
#[test]
fn test_apply_action_move_right() {
    let mut state = GameState::new();
    let start_x = state.player.position.0;
    let dt = 1.0 / TICK_RATE as f64;
    state.apply_action(&Action::Move(Direction::Right), dt);
    let expected_x = start_x + PLAYER_SPEED * dt;
    assert!((state.player.position.0 - expected_x).abs() < f64::EPSILON);
    assert_eq!(state.player.direction, Direction::Right);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test game_test test_apply_action_move_right`
Expected: FAIL — `apply_action` not defined

- [ ] **Step 3: Implement apply_action()**

Add to `GameState` impl in `src/game.rs`:

```rust
    pub fn apply_action(&mut self, action: &Action, dt: f64) {
        match action {
            Action::Move(dir) => {
                self.player.direction = *dir;
                let (dx, dy) = match dir {
                    Direction::Up => (0.0, -PLAYER_SPEED * dt),
                    Direction::Down => (0.0, PLAYER_SPEED * dt),
                    Direction::Left => (-PLAYER_SPEED * dt, 0.0),
                    Direction::Right => (PLAYER_SPEED * dt, 0.0),
                };
                self.player.position.0 = (self.player.position.0 + dx).clamp(0.0, self.world_width);
                self.player.position.1 = (self.player.position.1 + dy).clamp(0.0, self.world_height);
            }
            Action::Shoot => {
                self.projectiles.push(Projectile {
                    position: self.player.position,
                    direction: self.player.direction,
                    speed: PROJECTILE_SPEED,
                });
            }
            Action::Quit => {}
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test game_test test_apply_action_move_right`
Expected: PASS

- [ ] **Step 5: Write failing test for Move clamping at world bounds**

Add to `tests/game_test.rs`:

```rust
#[test]
fn test_apply_action_move_clamps_to_world_bounds() {
    let mut state = GameState::new();
    state.player.position = (0.0, 0.0);
    let dt = 1.0;
    state.apply_action(&Action::Move(Direction::Left), dt);
    assert!((state.player.position.0 - 0.0).abs() < f64::EPSILON);

    state.apply_action(&Action::Move(Direction::Up), dt);
    assert!((state.player.position.1 - 0.0).abs() < f64::EPSILON);
}
```

- [ ] **Step 6: Run test to verify it passes (already clamped)**

Run: `cargo test --test game_test test_apply_action_move_clamps`
Expected: PASS

- [ ] **Step 7: Write failing test for Shoot action**

Add to `tests/game_test.rs`:

```rust
#[test]
fn test_apply_action_shoot() {
    let mut state = GameState::new();
    state.player.direction = Direction::Up;
    let player_pos = state.player.position;
    state.apply_action(&Action::Shoot, 0.0);
    assert_eq!(state.projectiles.len(), 1);
    assert!((state.projectiles[0].position.0 - player_pos.0).abs() < f64::EPSILON);
    assert!((state.projectiles[0].position.1 - player_pos.1).abs() < f64::EPSILON);
    assert_eq!(state.projectiles[0].direction, Direction::Up);
    assert!((state.projectiles[0].speed - PROJECTILE_SPEED).abs() < f64::EPSILON);
}
```

- [ ] **Step 8: Run test to verify it passes (already implemented)**

Run: `cargo test --test game_test test_apply_action_shoot`
Expected: PASS

- [ ] **Step 9: Run all tests**

Run: `cargo test`
Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add src/game.rs tests/game_test.rs
git commit -m "feat: add apply_action() for movement and shooting"
```

---

### Task 4: Input Module

**Files:**
- Create: `src/input.rs`
- Create: `tests/input_test.rs`

- [ ] **Step 1: Write failing test for mapping key events to actions**

Create `tests/input_test.rs`:

```rust
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers, KeyEventKind};
use pokemon_on_soroban::input::map_key_event;
use pokemon_on_soroban::game::{Action, Direction};

fn key_press(code: KeyCode) -> KeyEvent {
    KeyEvent::new(code, KeyModifiers::NONE)
}

#[test]
fn test_map_arrow_keys_to_move() {
    match map_key_event(&key_press(KeyCode::Up)) {
        Some(Action::Move(Direction::Up)) => {}
        other => panic!("expected Move(Up), got {:?}", other),
    }
    match map_key_event(&key_press(KeyCode::Down)) {
        Some(Action::Move(Direction::Down)) => {}
        other => panic!("expected Move(Down), got {:?}", other),
    }
    match map_key_event(&key_press(KeyCode::Left)) {
        Some(Action::Move(Direction::Left)) => {}
        other => panic!("expected Move(Left), got {:?}", other),
    }
    match map_key_event(&key_press(KeyCode::Right)) {
        Some(Action::Move(Direction::Right)) => {}
        other => panic!("expected Move(Right), got {:?}", other),
    }
}

#[test]
fn test_map_space_to_shoot() {
    match map_key_event(&key_press(KeyCode::Char(' '))) {
        Some(Action::Shoot) => {}
        other => panic!("expected Shoot, got {:?}", other),
    }
}

#[test]
fn test_map_q_and_esc_to_quit() {
    match map_key_event(&key_press(KeyCode::Char('q'))) {
        Some(Action::Quit) => {}
        other => panic!("expected Quit, got {:?}", other),
    }
    match map_key_event(&key_press(KeyCode::Esc)) {
        Some(Action::Quit) => {}
        other => panic!("expected Quit, got {:?}", other),
    }
}

#[test]
fn test_map_unknown_key_to_none() {
    assert!(map_key_event(&key_press(KeyCode::Char('x'))).is_none());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test input_test`
Expected: FAIL — `map_key_event` not defined

- [ ] **Step 3: Implement input module**

Write `src/input.rs`:

```rust
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use std::time::Duration;

use crate::game::{Action, Direction};

pub fn map_key_event(key: &KeyEvent) -> Option<Action> {
    if key.kind != KeyEventKind::Press {
        return None;
    }
    match key.code {
        KeyCode::Up => Some(Action::Move(Direction::Up)),
        KeyCode::Down => Some(Action::Move(Direction::Down)),
        KeyCode::Left => Some(Action::Move(Direction::Left)),
        KeyCode::Right => Some(Action::Move(Direction::Right)),
        KeyCode::Char(' ') => Some(Action::Shoot),
        KeyCode::Char('q') | KeyCode::Esc => Some(Action::Quit),
        _ => None,
    }
}

pub fn poll_actions(timeout: Duration) -> Vec<Action> {
    let mut actions = Vec::new();
    if event::poll(timeout).unwrap_or(false) {
        if let Ok(Event::Key(key)) = event::read() {
            if let Some(action) = map_key_event(&key) {
                actions.push(action);
            }
        }
    }
    actions
}
```

- [ ] **Step 4: Add Debug derive to Action and Direction for test output**

In `src/game.rs`, update the derives:
- `Direction`: add `Debug` (it already has it)
- `Action`: add `Debug`

```rust
#[derive(Debug)]
pub enum Action {
    Move(Direction),
    Shoot,
    Quit,
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --test input_test`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/input.rs tests/input_test.rs src/game.rs
git commit -m "feat: add input module mapping key events to game actions"
```

---

### Task 5: Render Module — Viewport Calculation

**Files:**
- Create: `src/render.rs`
- Create: `tests/render_test.rs`

- [ ] **Step 1: Write failing test for viewport calculation — player centered**

Create `tests/render_test.rs`:

```rust
use pokemon_on_soroban::render::compute_viewport;

#[test]
fn test_viewport_centered_on_player() {
    let vp = compute_viewport(
        (100.0, 50.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 60.0).abs() < f64::EPSILON);
    assert!((vp.top - 30.0).abs() < f64::EPSILON);
    assert_eq!(vp.width, 80);
    assert_eq!(vp.height, 40);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --test render_test test_viewport_centered`
Expected: FAIL — `compute_viewport` not defined

- [ ] **Step 3: Implement Viewport struct and compute_viewport()**

Write `src/render.rs`:

```rust
use ratatui::Frame;
use ratatui::style::{Color, Style};
use ratatui::text::Span;
use ratatui::buffer::Buffer;
use ratatui::layout::Rect;
use ratatui::widgets::Widget;

use crate::game::GameState;

pub struct Viewport {
    pub left: f64,
    pub top: f64,
    pub width: u16,
    pub height: u16,
}

pub fn compute_viewport(
    player_pos: (f64, f64),
    world_width: f64,
    world_height: f64,
    screen_width: u16,
    screen_height: u16,
) -> Viewport {
    let half_w = screen_width as f64 / 2.0;
    let half_h = screen_height as f64 / 2.0;

    let left = (player_pos.0 - half_w)
        .max(0.0)
        .min((world_width - screen_width as f64).max(0.0));
    let top = (player_pos.1 - half_h)
        .max(0.0)
        .min((world_height - screen_height as f64).max(0.0));

    Viewport {
        left,
        top,
        width: screen_width,
        height: screen_height,
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cargo test --test render_test test_viewport_centered`
Expected: PASS

- [ ] **Step 5: Write failing test for viewport clamping at world edge**

Add to `tests/render_test.rs`:

```rust
#[test]
fn test_viewport_clamps_at_top_left() {
    let vp = compute_viewport(
        (5.0, 5.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 0.0).abs() < f64::EPSILON);
    assert!((vp.top - 0.0).abs() < f64::EPSILON);
}

#[test]
fn test_viewport_clamps_at_bottom_right() {
    let vp = compute_viewport(
        (195.0, 95.0),
        200.0,
        100.0,
        80,
        40,
    );
    assert!((vp.left - 120.0).abs() < f64::EPSILON);
    assert!((vp.top - 60.0).abs() < f64::EPSILON);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo test --test render_test`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add src/render.rs tests/render_test.rs
git commit -m "feat: add viewport calculation with world-edge clamping"
```

---

### Task 6: Render Module — Drawing the Game

**Files:**
- Modify: `src/render.rs`

- [ ] **Step 1: Implement the draw function**

Add to `src/render.rs`:

```rust
pub fn draw(frame: &mut Frame, state: &GameState) {
    let area = frame.area();
    let vp = compute_viewport(
        state.player.position,
        state.world_width,
        state.world_height,
        area.width,
        area.height,
    );

    let buf = frame.buffer_mut();

    for y in 0..vp.height {
        for x in 0..vp.width {
            let world_x = vp.left + x as f64;
            let world_y = vp.top + y as f64;

            let ch;
            let style;

            if world_x < 0.0
                || world_x >= state.world_width
                || world_y < 0.0
                || world_y >= state.world_height
            {
                ch = ' ';
                style = Style::default();
            } else if world_x == 0.0
                || world_x >= state.world_width - 1.0
                || world_y == 0.0
                || world_y >= state.world_height - 1.0
            {
                ch = '#';
                style = Style::default().fg(Color::DarkGray);
            } else {
                ch = ' ';
                style = Style::default();
            }

            let cell = &mut buf[(area.x + x, area.y + y)];
            cell.set_char(ch);
            cell.set_style(style);
        }
    }

    for projectile in &state.projectiles {
        let sx = (projectile.position.0 - vp.left).floor() as i32;
        let sy = (projectile.position.1 - vp.top).floor() as i32;
        if sx >= 0 && sx < vp.width as i32 && sy >= 0 && sy < vp.height as i32 {
            let cell = &mut buf[(area.x + sx as u16, area.y + sy as u16)];
            cell.set_char('*');
            cell.set_style(Style::default().fg(Color::Yellow));
        }
    }

    let px = (state.player.position.0 - vp.left).floor() as i32;
    let py = (state.player.position.1 - vp.top).floor() as i32;
    if px >= 0 && px < vp.width as i32 && py >= 0 && py < vp.height as i32 {
        let cell = &mut buf[(area.x + px as u16, area.y + py as u16)];
        cell.set_char('@');
        cell.set_style(Style::default().fg(Color::Green));
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo build`
Expected: compiles with no errors

- [ ] **Step 3: Commit**

```bash
git add src/render.rs
git commit -m "feat: add draw() rendering player, projectiles, and world border"
```

---

### Task 7: Game Loop in main.rs

**Files:**
- Modify: `src/main.rs`

- [ ] **Step 1: Implement the full game loop**

Replace `src/main.rs`:

```rust
mod constants;
mod game;
mod input;
mod render;

use std::io;
use std::time::{Duration, Instant};

use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use constants::TICK_RATE;
use game::{Action, GameState};
use input::poll_actions;

fn main() -> io::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = GameState::new();
    let tick_duration = Duration::from_millis(1000 / TICK_RATE);

    let result = run_loop(&mut terminal, &mut state, tick_duration);

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

fn run_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: &mut GameState,
    tick_duration: Duration,
) -> io::Result<()> {
    loop {
        let frame_start = Instant::now();
        let dt = tick_duration.as_secs_f64();

        let actions = poll_actions(tick_duration.saturating_sub(frame_start.elapsed()));

        for action in &actions {
            if matches!(action, Action::Quit) {
                return Ok(());
            }
            state.apply_action(action, dt);
        }

        state.tick(dt);

        terminal.draw(|frame| {
            render::draw(frame, state);
        })?;

        let elapsed = frame_start.elapsed();
        if elapsed < tick_duration {
            std::thread::sleep(tick_duration - elapsed);
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cargo build`
Expected: compiles with no errors

- [ ] **Step 3: Run all tests**

Run: `cargo test`
Expected: all tests pass

- [ ] **Step 4: Run the game manually**

Run: `cargo run`
Expected: alternate screen appears, `@` visible in center of world, arrow keys move player, space shoots `*` projectiles, `q` quits cleanly back to terminal

- [ ] **Step 5: Commit**

```bash
git add src/main.rs
git commit -m "feat: add game loop with input, simulation, and rendering"
```

---

### Task 8: Final Polish and Full Test Run

**Files:**
- All files

- [ ] **Step 1: Run clippy**

Run: `cargo clippy -- -D warnings`
Expected: no warnings

- [ ] **Step 2: Fix any clippy warnings if needed**

Address any issues flagged by clippy.

- [ ] **Step 3: Run all tests one final time**

Run: `cargo test`
Expected: all tests pass

- [ ] **Step 4: Run the game and verify all features**

Run: `cargo run`
Verify:
- Player `@` renders at center of world
- Arrow keys move player smoothly in all 4 directions
- Player stops at world boundaries
- Space shoots `*` projectiles in facing direction
- Projectiles move across screen and disappear at world edge
- World border `#` is visible when near edges
- Viewport scrolls to follow player
- `q` exits cleanly

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: fix clippy warnings and final polish"
```
