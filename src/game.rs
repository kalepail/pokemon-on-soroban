use std::f64::consts::PI;
use crate::protocol::{SnapshotPlayer, SnapshotBullet, SnapshotPacket, ANGLE_STEPS};

pub struct GameState {
    pub world_width: u16,
    pub world_height: u16,
    pub self_id: u16,
    pub players: Vec<SnapshotPlayer>,
    pub bullets: Vec<SnapshotBullet>,
    pub server_tick: u32,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            world_width: 8192,
            world_height: 8192,
            self_id: 0,
            players: Vec::new(),
            bullets: Vec::new(),
            server_tick: 0,
        }
    }

    pub fn apply_snapshot(&mut self, snapshot: SnapshotPacket) {
        self.server_tick = snapshot.tick;
        self.self_id = snapshot.self_id;
        self.players = snapshot.players;
        self.bullets = snapshot.bullets;
    }

    pub fn self_player(&self) -> Option<&SnapshotPlayer> {
        self.players.iter().find(|p| p.id == self.self_id)
    }
}

pub fn angle_to_radians(angle: u16) -> f64 {
    (angle as f64 / ANGLE_STEPS as f64) * PI * 2.0
}

pub fn angle_to_direction(angle: u16) -> (f64, f64) {
    let rad = angle_to_radians(angle);
    (rad.cos(), rad.sin())
}
