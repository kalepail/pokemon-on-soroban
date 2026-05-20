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
