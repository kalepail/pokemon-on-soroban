use crate::constants::*;

pub struct Player {
    pub position: (f64, f64),
    pub direction: (f64, f64),
}

pub struct Projectile {
    pub position: (f64, f64),
    pub direction: (f64, f64),
    pub speed: f64,
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
            projectile.position.0 += projectile.direction.0 * projectile.speed * dt;
            projectile.position.1 += projectile.direction.1 * projectile.speed * dt;
        }
        self.projectiles.retain(|p| {
            p.position.0 >= 0.0
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
                });
            }
            Action::Quit => {}
        }
    }
}
