use crate::protocol::{ANGLE_STEPS, SnapshotBullet, SnapshotPacket, SnapshotPlayer};
use std::f64::consts::PI;
use std::time::Instant;

const SERVER_TICK_RATE: f64 = 30.0;

pub struct GameState {
    pub world_width: u16,
    pub world_height: u16,
    pub self_id: u16,
    pub players: Vec<SnapshotPlayer>,
    pub bullets: Vec<SnapshotBullet>,
    pub server_tick: u32,
    pub snapshot_time: Instant,
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
            snapshot_time: Instant::now(),
        }
    }

    pub fn apply_snapshot(&mut self, snapshot: SnapshotPacket) {
        self.server_tick = snapshot.tick;
        self.self_id = snapshot.self_id;
        self.players = snapshot.players;
        self.bullets = snapshot.bullets;
        self.snapshot_time = Instant::now();
    }

    pub fn self_player(&self) -> Option<&SnapshotPlayer> {
        self.players.iter().find(|p| p.id == self.self_id)
    }

    pub fn interpolated_pos(&self, x: u16, y: u16, vx: i16, vy: i16) -> (f64, f64) {
        let dt = self.snapshot_time.elapsed().as_secs_f64();
        let ticks = dt * SERVER_TICK_RATE;
        let ww = self.world_width as f64 - 1.0;
        let wh = self.world_height as f64 - 1.0;
        let ix = (x as f64 + (vx as f64 / SERVER_TICK_RATE) * ticks).clamp(0.0, ww);
        let iy = (y as f64 + (vy as f64 / SERVER_TICK_RATE) * ticks).clamp(0.0, wh);
        (ix, iy)
    }
}

pub fn angle_to_radians(angle: u16) -> f64 {
    (angle as f64 / ANGLE_STEPS as f64) * PI * 2.0
}

pub fn angle_to_direction(angle: u16) -> (f64, f64) {
    let rad = angle_to_radians(angle);
    (rad.cos(), rad.sin())
}
