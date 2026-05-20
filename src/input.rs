use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use std::collections::HashSet;
use std::time::Duration;

use crate::game::Action;

pub fn poll_keys(timeout: Duration) -> HashSet<KeyCode> {
    let mut keys = HashSet::new();
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        if event::poll(remaining).unwrap_or(false) {
            if let Ok(Event::Key(key)) = event::read() {
                if key.kind == KeyEventKind::Press {
                    keys.insert(key.code);
                }
            }
        } else {
            break;
        }
    }
    keys
}

pub fn keys_to_actions(keys: &HashSet<KeyCode>) -> Vec<Action> {
    let mut actions = Vec::new();
    if keys.contains(&KeyCode::Char('q')) || keys.contains(&KeyCode::Esc) {
        actions.push(Action::Quit);
        return actions;
    }
    if keys.contains(&KeyCode::Up) {
        actions.push(Action::Forward);
    }
    if keys.contains(&KeyCode::Down) {
        actions.push(Action::Backward);
    }
    if keys.contains(&KeyCode::Left) {
        actions.push(Action::TurnLeft);
    }
    if keys.contains(&KeyCode::Right) {
        actions.push(Action::TurnRight);
    }
    if keys.contains(&KeyCode::Char(' ')) {
        actions.push(Action::Shoot);
    }
    actions
}
