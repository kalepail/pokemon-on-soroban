use crossterm::event::{self, Event, KeyCode, KeyEventKind};
use std::collections::HashSet;
use std::time::Duration;

use crate::protocol;

pub struct KeyState {
    pub held: HashSet<KeyCode>,
    pub just_pressed: HashSet<KeyCode>,
}

impl KeyState {
    pub fn new() -> Self {
        Self {
            held: HashSet::new(),
            just_pressed: HashSet::new(),
        }
    }

    pub fn update(&mut self, timeout: Duration) {
        self.just_pressed.clear();
        if !event::poll(timeout).unwrap_or(false) {
            return;
        }
        while event::poll(Duration::ZERO).unwrap_or(false) {
            if let Ok(Event::Key(key)) = event::read() {
                match key.kind {
                    KeyEventKind::Press => {
                        if self.held.insert(key.code) {
                            self.just_pressed.insert(key.code);
                        }
                    }
                    KeyEventKind::Release => {
                        self.held.remove(&key.code);
                    }
                    _ => {}
                }
            }
        }
    }

    pub fn wants_quit(&self) -> bool {
        self.held.contains(&KeyCode::Char('q')) || self.held.contains(&KeyCode::Esc)
    }

    pub fn buttons(&self) -> u8 {
        let mut b = 0u8;
        if self.held.contains(&KeyCode::Left) {
            b |= protocol::BUTTON_LEFT;
        }
        if self.held.contains(&KeyCode::Right) {
            b |= protocol::BUTTON_RIGHT;
        }
        if self.held.contains(&KeyCode::Up) {
            b |= protocol::BUTTON_THRUST;
        }
        if self.just_pressed.contains(&KeyCode::Char(' ')) {
            b |= protocol::BUTTON_FIRE;
        }
        b
    }
}
