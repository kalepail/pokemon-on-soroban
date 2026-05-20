use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use std::collections::HashSet;
use std::time::Duration;

use crate::game::Action;

pub fn poll_keys(timeout: Duration) -> HashSet<KeyCode> {
    let mut keys = HashSet::new();
    // Drain all pending events, keep track of which keys are pressed
    if event::poll(timeout).unwrap_or(false) {
        while event::poll(Duration::ZERO).unwrap_or(false) {
            if let Ok(Event::Key(key)) = event::read() {
                if key.kind == KeyEventKind::Press {
                    keys.insert(key.code);
                }
            }
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
