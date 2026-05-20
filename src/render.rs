use ratatui::Frame;
use ratatui::style::{Color, Style};

use crate::game::GameState;

pub struct Viewport {
    pub left: f64,
    pub top: f64,
    pub width: u16,
    pub height: u16,
}

pub fn compute_viewport(
    player_pos: (f64, f64),
    world_width: f64,
    world_height: f64,
    screen_width: u16,
    screen_height: u16,
) -> Viewport {
    let half_w = screen_width as f64 / 2.0;
    let half_h = screen_height as f64 / 2.0;

    let left = (player_pos.0 - half_w)
        .max(0.0)
        .min((world_width - screen_width as f64).max(0.0));
    let top = (player_pos.1 - half_h)
        .max(0.0)
        .min((world_height - screen_height as f64).max(0.0));

    Viewport {
        left,
        top,
        width: screen_width,
        height: screen_height,
    }
}

pub fn draw(frame: &mut Frame, state: &GameState) {
    let area = frame.area();
    let vp = compute_viewport(
        state.player.position,
        state.world_width,
        state.world_height,
        area.width,
        area.height,
    );

    let buf = frame.buffer_mut();

    for y in 0..vp.height {
        for x in 0..vp.width {
            let world_x = vp.left + x as f64;
            let world_y = vp.top + y as f64;

            let ch;
            let style;

            if world_x < 0.0
                || world_x >= state.world_width
                || world_y < 0.0
                || world_y >= state.world_height
            {
                ch = ' ';
                style = Style::default();
            } else if world_x == 0.0
                || world_x >= state.world_width - 1.0
                || world_y == 0.0
                || world_y >= state.world_height - 1.0
            {
                ch = '#';
                style = Style::default().fg(Color::DarkGray);
            } else {
                ch = ' ';
                style = Style::default();
            }

            let cell = &mut buf[(area.x + x, area.y + y)];
            cell.set_char(ch);
            cell.set_style(style);
        }
    }

    for projectile in &state.projectiles {
        let sx = (projectile.position.0 - vp.left).floor() as i32;
        let sy = (projectile.position.1 - vp.top).floor() as i32;
        if sx >= 0 && sx < vp.width as i32 && sy >= 0 && sy < vp.height as i32 {
            let cell = &mut buf[(area.x + sx as u16, area.y + sy as u16)];
            cell.set_char('*');
            cell.set_style(Style::default().fg(Color::Yellow));
        }
    }

    let px = (state.player.position.0 - vp.left).floor() as i32;
    let py = (state.player.position.1 - vp.top).floor() as i32;
    if px >= 0 && px < vp.width as i32 && py >= 0 && py < vp.height as i32 {
        let cell = &mut buf[(area.x + px as u16, area.y + py as u16)];
        cell.set_char('@');
        cell.set_style(Style::default().fg(Color::Green));
    }
}
