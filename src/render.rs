use ratatui::Frame;
use ratatui::style::{Color, Style};

use crate::game::GameState;

const BG_COLOR: Color = Color::Rgb(15, 15, 25);
const GRID_COLOR: Color = Color::Rgb(25, 25, 40);
const GRID_ACCENT_COLOR: Color = Color::Rgb(35, 35, 55);
const BORDER_COLOR: Color = Color::Rgb(60, 60, 80);
const PLAYER_COLOR: Color = Color::Rgb(80, 220, 100);
const PLAYER_NOSE_COLOR: Color = Color::Rgb(140, 255, 160);
const PROJECTILE_COLOR: Color = Color::Rgb(255, 220, 60);

pub struct Viewport {
    pub left: f64,
    pub top: f64,
    pub width: u16,
    pub height_pixels: u16,
}

pub fn compute_viewport(
    player_pos: (f64, f64),
    world_width: f64,
    world_height: f64,
    screen_width: u16,
    screen_height_pixels: u16,
) -> Viewport {
    let half_w = screen_width as f64 / 2.0;
    let half_h = screen_height_pixels as f64 / 2.0;

    let left = (player_pos.0 - half_w)
        .max(0.0)
        .min((world_width - screen_width as f64).max(0.0));
    let top = (player_pos.1 - half_h)
        .max(0.0)
        .min((world_height - screen_height_pixels as f64).max(0.0));

    Viewport {
        left,
        top,
        width: screen_width,
        height_pixels: screen_height_pixels,
    }
}

fn world_pixel_color(wx: i64, wy: i64, world_width: f64, world_height: f64) -> Color {
    let w = world_width as i64;
    let h = world_height as i64;

    if wx < 0 || wx >= w || wy < 0 || wy >= h {
        return BG_COLOR;
    }
    if wx == 0 || wx == w - 1 || wy == 0 || wy == h - 1 {
        return BORDER_COLOR;
    }
    if wx % 10 == 0 && wy % 10 == 0 {
        return GRID_ACCENT_COLOR;
    }
    if wx % 10 == 0 || wy % 10 == 0 {
        return GRID_COLOR;
    }
    BG_COLOR
}

pub fn draw(frame: &mut Frame, state: &GameState) {
    let area = frame.area();
    let pixel_height = area.height * 2;
    let vp = compute_viewport(
        state.player.position,
        state.world_width,
        state.world_height,
        area.width,
        pixel_height,
    );

    // Build a pixel buffer (width x pixel_height) of colors
    let w = vp.width as usize;
    let h = pixel_height as usize;
    let mut pixels = vec![BG_COLOR; w * h];

    // Draw world background
    for py in 0..h {
        for px in 0..w {
            let wx = (vp.left + px as f64).floor() as i64;
            let wy = (vp.top + py as f64).floor() as i64;
            pixels[py * w + px] = world_pixel_color(wx, wy, state.world_width, state.world_height);
        }
    }

    // Draw projectiles as 1x1 bright dots
    for projectile in &state.projectiles {
        let sx = (projectile.position.0 - vp.left).floor() as i32;
        let sy = (projectile.position.1 - vp.top).floor() as i32;
        if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
            pixels[sy as usize * w + sx as usize] = PROJECTILE_COLOR;
        }
    }

    // Draw player as a 3x3 blob with a nose pixel in the facing direction
    let px = (state.player.position.0 - vp.left).floor() as i32;
    let py = (state.player.position.1 - vp.top).floor() as i32;

    // 3x3 body
    for dy in -1..=1i32 {
        for dx in -1..=1i32 {
            let sx = px + dx;
            let sy = py + dy;
            if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
                pixels[sy as usize * w + sx as usize] = PLAYER_COLOR;
            }
        }
    }

    // Nose: 2 pixels out in facing direction
    let (ndx, ndy) = state.player.direction;
    let nose_x = (px as f64 + ndx * 2.0).round() as i32;
    let nose_y = (py as f64 + ndy * 2.0).round() as i32;
    if nose_x >= 0 && nose_x < w as i32 && nose_y >= 0 && nose_y < h as i32 {
        pixels[nose_y as usize * w + nose_x as usize] = PLAYER_NOSE_COLOR;
    }

    // Render pixel pairs as half-block characters
    let buf = frame.buffer_mut();
    for row in 0..area.height {
        let top_y = (row * 2) as usize;
        let bot_y = top_y + 1;
        for col in 0..area.width {
            let x = col as usize;
            let top_color = if top_y < h { pixels[top_y * w + x] } else { BG_COLOR };
            let bot_color = if bot_y < h { pixels[bot_y * w + x] } else { BG_COLOR };

            let cell = &mut buf[(area.x + col, area.y + row)];
            cell.set_char('▀');
            cell.set_style(Style::default().fg(top_color).bg(bot_color));
        }
    }
}
