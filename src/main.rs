mod constants;
mod game;
mod input;
mod render;

use std::io;
use std::time::{Duration, Instant};

use crossterm::execute;
use crossterm::event::{
    KeyboardEnhancementFlags, PushKeyboardEnhancementFlags, PopKeyboardEnhancementFlags,
};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use constants::TICK_RATE;
use game::{Action, GameState};
use input::KeyState;

fn main() -> io::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(
        stdout,
        EnterAlternateScreen,
        PushKeyboardEnhancementFlags(KeyboardEnhancementFlags::REPORT_EVENT_TYPES)
    )?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut state = GameState::new();
    let tick_duration = Duration::from_millis(1000 / TICK_RATE);

    let result = run_loop(&mut terminal, &mut state, tick_duration);

    execute!(
        terminal.backend_mut(),
        PopKeyboardEnhancementFlags,
        LeaveAlternateScreen
    )?;
    disable_raw_mode()?;
    terminal.show_cursor()?;

    result
}

fn run_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: &mut GameState,
    tick_duration: Duration,
) -> io::Result<()> {
    let mut keys = KeyState::new();
    loop {
        let frame_start = Instant::now();
        let dt = tick_duration.as_secs_f64();

        keys.update(tick_duration.saturating_sub(frame_start.elapsed()));
        let actions = keys.actions();

        for action in &actions {
            if matches!(action, Action::Quit) {
                return Ok(());
            }
            state.apply_action(action, dt);
        }

        state.tick(dt);

        terminal.draw(|frame| {
            render::draw(frame, state);
        })?;

        let elapsed = frame_start.elapsed();
        if elapsed < tick_duration {
            std::thread::sleep(tick_duration - elapsed);
        }
    }
}
