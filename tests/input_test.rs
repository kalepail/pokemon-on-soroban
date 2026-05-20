use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
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
