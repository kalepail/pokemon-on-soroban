use ratatui::Frame;
use ratatui::style::{Color, Style};

use crate::game::GameState;

const OUTSIDE_COLOR: Color = Color::Rgb(30, 20, 10);
const PLAYER_COLOR: Color = Color::Rgb(80, 220, 100);
const PLAYER_NOSE_COLOR: Color = Color::Rgb(140, 255, 160);
const POKEBALL_RED: Color = Color::Rgb(220, 50, 50);
const POKEBALL_WHITE: Color = Color::Rgb(240, 240, 240);
const POKEBALL_BAND: Color = Color::Rgb(40, 40, 40);
const SHADOW_COLOR: Color = Color::Rgb(20, 35, 10);
const FENCE_POST: Color = Color::Rgb(90, 60, 30);
const FENCE_RAIL: Color = Color::Rgb(110, 75, 40);
const FENCE_TOP: Color = Color::Rgb(130, 90, 50);

pub struct Viewport {
    pub left: f64,
    pub top: f64,
    pub width: usize,
    pub height: usize,
}

pub fn compute_viewport(
    player_pos: (f64, f64),
    world_width: f64,
    world_height: f64,
    pixel_width: usize,
    pixel_height: usize,
) -> Viewport {
    let half_w = pixel_width as f64 / 2.0;
    let half_h = pixel_height as f64 / 2.0;

    let left = (player_pos.0 - half_w)
        .max(0.0)
        .min((world_width - pixel_width as f64).max(0.0));
    let top = (player_pos.1 - half_h)
        .max(0.0)
        .min((world_height - pixel_height as f64).max(0.0));

    Viewport {
        left,
        top,
        width: pixel_width,
        height: pixel_height,
    }
}

// Simple deterministic hash for grass variation
fn pixel_hash(x: i64, y: i64) -> u32 {
    let mut h = (x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263)) as u32;
    h = h.wrapping_mul(1274126177);
    h ^= h >> 16;
    h
}

fn grass_color(wx: i64, wy: i64) -> Color {
    let h = pixel_hash(wx, wy);
    let variant = h % 100;

    // Base grass with subtle variation
    let base_g: u8 = match variant {
        0..=2 => 90,    // dark patch
        3..=8 => 70,    // slightly dark
        90..=94 => 55,  // little flower/clover
        95..=97 => 50,  // dandelion yellow tint
        _ => 60,        // normal grass
    };

    let r = match variant {
        90..=94 => 45,  // clover - slightly different
        95..=97 => 70,  // dandelion
        _ => 25 + (h % 15) as u8,
    };

    let g = base_g + (h % 20) as u8;

    let b = match variant {
        90..=94 => 30,
        95..=97 => 15,
        _ => 10 + (h % 10) as u8,
    };

    Color::Rgb(r, g, b)
}

fn world_pixel_color(wx: i64, wy: i64, world_width: f64, world_height: f64) -> Color {
    let w = world_width as i64;
    let h = world_height as i64;

    if wx < 0 || wx >= w || wy < 0 || wy >= h {
        return OUTSIDE_COLOR;
    }

    // Fence: 3 pixels thick border
    let from_left = wx;
    let from_right = w - 1 - wx;
    let from_top = wy;
    let from_bottom = h - 1 - wy;
    let dist_to_edge = from_left.min(from_right).min(from_top).min(from_bottom);

    if dist_to_edge == 0 {
        // Fence posts every 8 cells, rail between
        if wx % 8 == 0 || wy % 8 == 0 {
            return FENCE_POST;
        }
        return FENCE_RAIL;
    }
    if dist_to_edge == 1 {
        // Top rail of fence
        if wx % 8 == 0 || wy % 8 == 0 {
            return FENCE_TOP;
        }
        return FENCE_RAIL;
    }
    if dist_to_edge == 2 {
        // Inner fence edge - slightly worn grass
        return Color::Rgb(35, 55, 15);
    }

    grass_color(wx, wy)
}

fn set_pixel(pixels: &mut [Color], w: usize, h: usize, x: i32, y: i32, color: Color) {
    if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
        pixels[y as usize * w + x as usize] = color;
    }
}

// Given a 2x2 block of colors, pick the best quadrant char + fg/bg.
// Each cell has 4 sub-pixels: top-left, top-right, bottom-left, bottom-right.
fn quadrant_cell(tl: Color, tr: Color, bl: Color, br: Color) -> (char, Color, Color) {
    let colors = [tl, tr, bl, br];

    // Find the two most common colors (or just pick fg/bg)
    let bg = most_common_color(&colors);
    let fg = most_different_color(&colors, bg);

    // Build quadrant mask: 1 = fg, 0 = bg
    let mut mask = 0u8;
    if closer_to(tl, fg, bg) { mask |= 0b0001; } // top-left
    if closer_to(tr, fg, bg) { mask |= 0b0010; } // top-right
    if closer_to(bl, fg, bg) { mask |= 0b0100; } // bottom-left
    if closer_to(br, fg, bg) { mask |= 0b1000; } // bottom-right

    let ch = QUADRANT_CHARS[mask as usize];
    (ch, fg, bg)
}

const QUADRANT_CHARS: [char; 16] = [
    ' ', '▘', '▝', '▀',
    '▖', '▌', '▞', '▛',
    '▗', '▚', '▐', '▜',
    '▄', '▙', '▟', '█',
];

fn color_eq(a: Color, b: Color) -> bool {
    match (a, b) {
        (Color::Rgb(r1, g1, b1), Color::Rgb(r2, g2, b2)) => r1 == r2 && g1 == g2 && b1 == b2,
        _ => false,
    }
}

fn most_common_color(colors: &[Color; 4]) -> Color {
    let mut best = colors[0];
    let mut best_count = 0;
    for &c in colors {
        let count = colors.iter().filter(|&&x| color_eq(x, c)).count();
        if count > best_count {
            best_count = count;
            best = c;
        }
    }
    best
}

fn most_different_color(colors: &[Color; 4], bg: Color) -> Color {
    for &c in colors {
        if !color_eq(c, bg) {
            return c;
        }
    }
    bg
}

fn closer_to(c: Color, fg: Color, bg: Color) -> bool {
    if color_eq(c, fg) { return true; }
    if color_eq(c, bg) { return false; }
    color_dist(c, fg) < color_dist(c, bg)
}

fn color_dist(a: Color, b: Color) -> i32 {
    match (a, b) {
        (Color::Rgb(r1, g1, b1), Color::Rgb(r2, g2, b2)) => {
            let dr = r1 as i32 - r2 as i32;
            let dg = g1 as i32 - g2 as i32;
            let db = b1 as i32 - b2 as i32;
            dr * dr + dg * dg + db * db
        }
        _ => 0,
    }
}

pub fn draw(frame: &mut Frame, state: &GameState) {
    let area = frame.area();
    let pixel_w = area.width as usize;
    let pixel_h = area.height as usize * 2;
    let vp = compute_viewport(
        state.player.position,
        state.world_width,
        state.world_height,
        pixel_w,
        pixel_h,
    );

    let w = vp.width;
    let h = vp.height;
    let mut pixels = vec![OUTSIDE_COLOR; w * h];

    // Draw world background
    for py in 0..h {
        for px in 0..w {
            let wx = (vp.left + px as f64).floor() as i64;
            let wy = (vp.top + py as f64).floor() as i64;
            pixels[py * w + px] = world_pixel_color(wx, wy, state.world_width, state.world_height);
        }
    }

    // Draw pokeball projectiles with arc
    for projectile in &state.projectiles {
        let gx = (projectile.position.0 - vp.left).floor() as i32;
        let gy = (projectile.position.1 - vp.top).floor() as i32;
        let arc_y = gy + projectile.arc_offset().floor() as i32;

        // Shadow on ground
        set_pixel(&mut pixels, w, h, gx, gy, SHADOW_COLOR);
        set_pixel(&mut pixels, w, h, gx + 1, gy, SHADOW_COLOR);

        // Pokeball: 3 tall x 3 wide — red top, band, white bottom
        for dx in 0..3i32 {
            set_pixel(&mut pixels, w, h, gx - 1 + dx, arc_y - 1, POKEBALL_RED);
            set_pixel(&mut pixels, w, h, gx - 1 + dx, arc_y, POKEBALL_BAND);
            set_pixel(&mut pixels, w, h, gx - 1 + dx, arc_y + 1, POKEBALL_WHITE);
        }
    }

    // Draw player: 5x5 body with nose
    let px = (state.player.position.0 - vp.left).floor() as i32;
    let py = (state.player.position.1 - vp.top).floor() as i32;

    for dy in -2..=2i32 {
        for dx in -2..=2i32 {
            // Skip corners for a rounder shape
            if dx.abs() == 2 && dy.abs() == 2 {
                continue;
            }
            set_pixel(&mut pixels, w, h, px + dx, py + dy, PLAYER_COLOR);
        }
    }

    // Nose: 3 pixels out in facing direction
    let (ndx, ndy) = state.player.direction;
    let nose_x = (px as f64 + ndx * 3.0).round() as i32;
    let nose_y = (py as f64 + ndy * 3.0).round() as i32;
    set_pixel(&mut pixels, w, h, nose_x, nose_y, PLAYER_NOSE_COLOR);

    // Render pixel pairs as half-block characters (1 wide, 2 tall per cell)
    let buf = frame.buffer_mut();
    for row in 0..area.height {
        let top_y = row as usize * 2;
        let bot_y = top_y + 1;
        for col in 0..area.width {
            let x = col as usize;
            let top_color = if top_y < h { pixels[top_y * w + x] } else { OUTSIDE_COLOR };
            let bot_color = if bot_y < h { pixels[bot_y * w + x] } else { OUTSIDE_COLOR };

            let cell = &mut buf[(area.x + col, area.y + row)];
            cell.set_char('▀');
            cell.set_style(Style::default().fg(top_color).bg(bot_color));
        }
    }
}
