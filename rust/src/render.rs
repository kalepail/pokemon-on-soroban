use ratatui::Frame;
use ratatui::style::{Color, Style};

use crate::game::{GameState, angle_to_direction};

const OUTSIDE_COLOR: Color = Color::Rgb(30, 20, 10);
const SKIN_COLOR: Color = Color::Rgb(240, 200, 160);
const HAIR_COLOR: Color = Color::Rgb(60, 30, 15);
const HAT_COLOR: Color = Color::Rgb(220, 50, 40);
const SHIRT_COLOR: Color = Color::Rgb(50, 100, 200);
const PANTS_COLOR: Color = Color::Rgb(40, 40, 100);
const SHOE_COLOR: Color = Color::Rgb(60, 40, 30);
const POKEBALL_RED: Color = Color::Rgb(220, 50, 50);
const POKEBALL_WHITE: Color = Color::Rgb(240, 240, 240);
const POKEBALL_BAND: Color = Color::Rgb(40, 40, 40);
const SHADOW_COLOR: Color = Color::Rgb(20, 35, 10);
const FENCE_POST: Color = Color::Rgb(90, 60, 30);
const FENCE_RAIL: Color = Color::Rgb(110, 75, 40);
const FENCE_TOP: Color = Color::Rgb(130, 90, 50);
const DEAD_COLOR: Color = Color::Rgb(80, 80, 80);

// World units per pixel — controls zoom level
const SCALE: f64 = 12.0;

fn pixel_hash(x: i64, y: i64) -> u32 {
    let mut h = (x.wrapping_mul(374761393) ^ y.wrapping_mul(668265263)) as u32;
    h = h.wrapping_mul(1274126177);
    h ^= h >> 16;
    h
}

fn grass_color(wx: i64, wy: i64) -> Color {
    let h = pixel_hash(wx, wy);
    let variant = h % 100;
    let base_g: u8 = match variant {
        0..=2 => 90,
        3..=8 => 70,
        90..=94 => 55,
        95..=97 => 50,
        _ => 60,
    };
    let r = match variant {
        90..=94 => 45,
        95..=97 => 70,
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

fn world_pixel_color(wx: i64, wy: i64, world_w: i64, world_h: i64) -> Color {
    if wx < 0 || wx >= world_w || wy < 0 || wy >= world_h {
        return OUTSIDE_COLOR;
    }

    let fence_w = (world_w / 200).max(1);
    let post_spacing = (world_w / 25).max(8);

    let from_left = wx;
    let from_right = world_w - 1 - wx;
    let from_top = wy;
    let from_bottom = world_h - 1 - wy;
    let dist = from_left.min(from_right).min(from_top).min(from_bottom);

    if dist < fence_w {
        if wx % post_spacing < fence_w || wy % post_spacing < fence_w {
            return FENCE_POST;
        }
        return FENCE_RAIL;
    }
    if dist < fence_w * 2 {
        if wx % post_spacing < fence_w || wy % post_spacing < fence_w {
            return FENCE_TOP;
        }
        return FENCE_RAIL;
    }
    if dist < fence_w * 3 {
        return Color::Rgb(35, 55, 15);
    }

    grass_color(wx, wy)
}

fn set_pixel(pixels: &mut [Color], w: usize, h: usize, x: i32, y: i32, color: Color) {
    if x >= 0 && x < w as i32 && y >= 0 && y < h as i32 {
        pixels[y as usize * w + x as usize] = color;
    }
}

fn hue_to_shirt_color(hue: u16) -> Color {
    let h = (hue % 360) as f64;
    let (r, g, b) = hsl_to_rgb(h, 0.7, 0.45);
    Color::Rgb(r, g, b)
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;
    let (r1, g1, b1) = match h as u32 {
        0..=59 => (c, x, 0.0),
        60..=119 => (x, c, 0.0),
        120..=179 => (0.0, c, x),
        180..=239 => (0.0, x, c),
        240..=299 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (
        ((r1 + m) * 255.0) as u8,
        ((g1 + m) * 255.0) as u8,
        ((b1 + m) * 255.0) as u8,
    )
}

fn draw_player_sprite(
    pixels: &mut [Color], w: usize, h: usize,
    px: i32, py: i32, angle: u16, alive: bool, hue: u16,
) {
    let (ndx, ndy) = angle_to_direction(angle);
    let cos_a = ndx;
    let sin_a = ndy;

    let shirt = if alive { hue_to_shirt_color(hue) } else { DEAD_COLOR };
    let skin = if alive { SKIN_COLOR } else { Color::Rgb(140, 140, 140) };
    let hat = if alive { HAT_COLOR } else { Color::Rgb(100, 100, 100) };

    let sprite: &[(f64, f64, Color)] = &[
        // Hat
        (0.0, -4.0, hat), (1.0, -4.0, hat), (2.0, -4.0, hat),
        (-1.0, -3.0, hat), (0.0, -3.0, hat), (1.0, -3.0, hat), (2.0, -3.0, hat),
        // Head
        (-1.0, -2.0, skin), (0.0, -2.0, skin), (1.0, -2.0, skin),
        (-1.0, -1.0, skin), (0.0, -1.0, skin), (1.0, -1.0, skin),
        // Eye
        (1.0, -2.0, HAIR_COLOR),
        // Body
        (-1.0, 0.0, shirt), (0.0, 0.0, shirt), (1.0, 0.0, shirt),
        (-1.0, 1.0, shirt), (0.0, 1.0, shirt), (1.0, 1.0, shirt),
        (0.0, 2.0, shirt),
        // Arms
        (-2.0, 0.0, skin), (2.0, 0.0, skin),
        (-2.0, 1.0, skin), (2.0, 1.0, skin),
        // Legs
        (-1.0, 2.0, PANTS_COLOR), (1.0, 2.0, PANTS_COLOR),
        (-1.0, 3.0, PANTS_COLOR), (1.0, 3.0, PANTS_COLOR),
        // Shoes
        (-1.0, 4.0, SHOE_COLOR), (1.0, 4.0, SHOE_COLOR),
    ];

    for &(sdx, sdy, color) in sprite {
        let rx = (sdx * cos_a - sdy * sin_a).round() as i32;
        let ry = (sdx * sin_a + sdy * cos_a).round() as i32;
        set_pixel(pixels, w, h, px + rx, py + ry, color);
    }
}

pub fn draw(frame: &mut Frame, state: &GameState) {
    let area = frame.area();
    let pixel_w = area.width as usize;
    let pixel_h = area.height as usize * 2;

    // Find camera center — follow self player, or center of world
    let (cam_x, cam_y) = if let Some(me) = state.self_player() {
        (me.x as f64, me.y as f64)
    } else {
        (state.world_width as f64 / 2.0, state.world_height as f64 / 2.0)
    };

    let vp_left = cam_x - (pixel_w as f64 / 2.0) * SCALE;
    let vp_top = cam_y - (pixel_h as f64 / 2.0) * SCALE;

    let w = pixel_w;
    let h = pixel_h;
    let world_w = state.world_width as i64;
    let world_h = state.world_height as i64;

    let mut pixels = vec![OUTSIDE_COLOR; w * h];

    // Draw world background
    for py in 0..h {
        for px in 0..w {
            let wx = (vp_left + px as f64 * SCALE).floor() as i64;
            let wy = (vp_top + py as f64 * SCALE).floor() as i64;
            pixels[py * w + px] = world_pixel_color(wx, wy, world_w, world_h);
        }
    }

    // Draw bullets as pokeballs
    for bullet in &state.bullets {
        let sx = ((bullet.x as f64 - vp_left) / SCALE).floor() as i32;
        let sy = ((bullet.y as f64 - vp_top) / SCALE).floor() as i32;

        // Shadow
        set_pixel(&mut pixels, w, h, sx, sy, SHADOW_COLOR);
        set_pixel(&mut pixels, w, h, sx + 1, sy, SHADOW_COLOR);

        // Simple arc based on remaining TTL (higher TTL = just fired = rising)
        let max_ttl = 42.0; // ~1.4 seconds * 30 ticks
        let progress = 1.0 - (bullet.ttl as f64 / max_ttl).clamp(0.0, 1.0);
        let arc_offset = (-4.0 * 6.0 * progress * (1.0 - progress)).floor() as i32;
        let arc_y = sy + arc_offset;

        for dx in 0..3i32 {
            set_pixel(&mut pixels, w, h, sx - 1 + dx, arc_y - 1, POKEBALL_RED);
            set_pixel(&mut pixels, w, h, sx - 1 + dx, arc_y, POKEBALL_BAND);
            set_pixel(&mut pixels, w, h, sx - 1 + dx, arc_y + 1, POKEBALL_WHITE);
        }
    }

    // Draw players
    for player in &state.players {
        let sx = ((player.x as f64 - vp_left) / SCALE).floor() as i32;
        let sy = ((player.y as f64 - vp_top) / SCALE).floor() as i32;

        if sx < -20 || sx >= w as i32 + 20 || sy < -20 || sy >= h as i32 + 20 {
            continue;
        }

        draw_player_sprite(
            &mut pixels, w, h,
            sx, sy, player.angle, player.alive, player.hue,
        );
    }

    // Render pixel pairs as half-block characters
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
