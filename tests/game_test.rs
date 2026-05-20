use pokemon_on_soroban::game::{Action, Direction, Player, Projectile, GameState};
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
