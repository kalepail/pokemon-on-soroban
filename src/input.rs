use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use std::collections::HashSet;
use std::time::Duration;

use crate::game::Action;

pub struct KeyState {
    pub held: HashSet<KeyCode>,
}

impl KeyState {
    pub fn new() -> Self {
        Self {
            held: HashSet::new(),
        }
    }

    pub fn update(&mut self, timeout: Duration) {
        // Wait for first event up to timeout
        if !event::poll(timeout).unwrap_or(false) {
            return;
        }
        // Drain all available events
        while event::poll(Duration::ZERO).unwrap_or(false) {
            if let Ok(Event::Key(key)) = event::read() {
                match key.kind {
                    KeyEventKind::Press => {
                        self.held.insert(key.code);
                    }
                    KeyEventKind::Release => {
                        self.held.remove(&key.code);
                    }
                    _ => {}
                }
            }
        }
    }

    pub fn actions(&self) -> Vec<Action> {
        let mut actions = Vec::new();
        if self.held.contains(&KeyCode::Char('q')) || self.held.contains(&KeyCode::Esc) {
            actions.push(Action::Quit);
            return actions;
        }
        if self.held.contains(&KeyCode::Up) {
            actions.push(Action::Forward);
        }
        if self.held.contains(&KeyCode::Down) {
            actions.push(Action::Backward);
        }
        if self.held.contains(&KeyCode::Left) {
            actions.push(Action::TurnLeft);
        }
        if self.held.contains(&KeyCode::Right) {
            actions.push(Action::TurnRight);
        }
        if self.held.contains(&KeyCode::Char(' ')) {
            actions.push(Action::Shoot);
        }
        actions
    }
}
