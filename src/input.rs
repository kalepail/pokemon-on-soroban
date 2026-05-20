use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyEventKind};
use std::time::Duration;

use crate::game::Action;

pub fn map_key_event(key: &KeyEvent) -> Option<Action> {
    if key.kind != KeyEventKind::Press {
        return None;
    }
    match key.code {
        KeyCode::Up => Some(Action::Forward),
        KeyCode::Down => Some(Action::Backward),
        KeyCode::Left => Some(Action::TurnLeft),
        KeyCode::Right => Some(Action::TurnRight),
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
