use crate::constants::*;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

pub struct Player {
    pub position: (f64, f64),
    pub direction: Direction,
}

pub struct Projectile {
    pub position: (f64, f64),
    pub direction: Direction,
    pub speed: f64,
}

pub enum Action {
    Move(Direction),
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
                direction: Direction::Right,
            },
            projectiles: Vec::new(),
        }
    }

    pub fn tick(&mut self, dt: f64) {
        for projectile in &mut self.projectiles {
            match projectile.direction {
                Direction::Up => projectile.position.1 -= projectile.speed * dt,
                Direction::Down => projectile.position.1 += projectile.speed * dt,
                Direction::Left => projectile.position.0 -= projectile.speed * dt,
                Direction::Right => projectile.position.0 += projectile.speed * dt,
            }
        }
        self.projectiles.retain(|p| {
            p.position.0 >= 0.0
                && p.position.0 <= self.world_width
                && p.position.1 >= 0.0
                && p.position.1 <= self.world_height
        });
    }
}
