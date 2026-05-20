use crate::constants::*;

pub struct Player {
    pub position: (f64, f64),
    pub direction: (f64, f64),
}

pub struct Projectile {
    pub position: (f64, f64),
    pub direction: (f64, f64),
    pub speed: f64,
    pub traveled: f64,
    pub max_range: f64,
}

impl Projectile {
    pub fn arc_progress(&self) -> f64 {
        (self.traveled / self.max_range).clamp(0.0, 1.0)
    }

    pub fn arc_offset(&self) -> f64 {
        let t = self.arc_progress();
        // Parabola: peaks at t=0.5, zero at t=0 and t=1
        -4.0 * THROW_ARC_HEIGHT * t * (1.0 - t)
    }
}

#[derive(Debug)]
pub enum Action {
    Forward,
    Backward,
    TurnLeft,
    TurnRight,
    Shoot,
    Quit,
}

pub struct GameState {
    pub world_width: f64,
    pub world_height: f64,
    pub player: Player,
    pub projectiles: Vec<Projectile>,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            world_width: WORLD_WIDTH,
            world_height: WORLD_HEIGHT,
            player: Player {
                position: (WORLD_WIDTH / 2.0, WORLD_HEIGHT / 2.0),
                direction: (1.0, 0.0),
            },
            projectiles: Vec::new(),
        }
    }

    pub fn tick(&mut self, dt: f64) {
        for projectile in &mut self.projectiles {
            let dist = projectile.speed * dt;
            projectile.position.0 += projectile.direction.0 * dist;
            projectile.position.1 += projectile.direction.1 * dist;
            projectile.traveled += dist;
        }
        self.projectiles.retain(|p| {
            p.traveled < p.max_range
                && p.position.0 >= 0.0
                && p.position.0 <= self.world_width
                && p.position.1 >= 0.0
                && p.position.1 <= self.world_height
        });
    }

    pub fn apply_action(&mut self, action: &Action, dt: f64) {
        match action {
            Action::Forward => {
                self.player.position.0 = (self.player.position.0 + self.player.direction.0 * PLAYER_SPEED * dt).clamp(0.0, self.world_width);
                self.player.position.1 = (self.player.position.1 + self.player.direction.1 * PLAYER_SPEED * dt).clamp(0.0, self.world_height);
            }
            Action::Backward => {
                self.player.position.0 = (self.player.position.0 - self.player.direction.0 * PLAYER_SPEED * dt).clamp(0.0, self.world_width);
                self.player.position.1 = (self.player.position.1 - self.player.direction.1 * PLAYER_SPEED * dt).clamp(0.0, self.world_height);
            }
            Action::TurnLeft => {
                let angle = -TURN_SPEED * dt;
                let (dx, dy) = self.player.direction;
                self.player.direction = (
                    dx * angle.cos() - dy * angle.sin(),
                    dx * angle.sin() + dy * angle.cos(),
                );
            }
            Action::TurnRight => {
                let angle = TURN_SPEED * dt;
                let (dx, dy) = self.player.direction;
                self.player.direction = (
                    dx * angle.cos() - dy * angle.sin(),
                    dx * angle.sin() + dy * angle.cos(),
                );
            }
            Action::Shoot => {
                self.projectiles.push(Projectile {
                    position: self.player.position,
                    direction: self.player.direction,
                    speed: PROJECTILE_SPEED,
                    traveled: 0.0,
                    max_range: THROW_RANGE,
                });
            }
            Action::Quit => {}
        }
    }
}
