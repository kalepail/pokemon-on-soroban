mod constants;
mod game;
mod input;
mod protocol;
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
use tungstenite::{connect, Message};
use game::GameState;
use input::KeyState;
use protocol::{parse_server_packet, build_input_packet, ServerPacket};

const SERVER_URL: &str = "ws://localhost:8787/ws";

fn main() -> io::Result<()> {
    let url_str = std::env::args().nth(1).unwrap_or_else(|| SERVER_URL.to_string());
    let sid = format!("tui-{}", std::process::id());
    let full_url = if url_str.contains('?') {
        format!("{}&sid={}", url_str, sid)
    } else {
        format!("{}?sid={}&bots=10", url_str, sid)
    };

    eprintln!("Connecting to {}...", full_url);
    let (mut socket, _response) = connect(&full_url).expect("failed to connect");
    eprintln!("Connected!");

    // Set socket to non-blocking so we can poll without hanging
    if let tungstenite::stream::MaybeTlsStream::Plain(s) = socket.get_ref() {
        s.set_nonblocking(true).ok();
    }

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
    let tick_duration = Duration::from_millis(1000 / 30);

    let result = run_loop(&mut terminal, &mut state, &mut socket, tick_duration);

    execute!(
        terminal.backend_mut(),
        PopKeyboardEnhancementFlags,
        LeaveAlternateScreen
    )?;
    disable_raw_mode()?;
    terminal.show_cursor()?;

    let _ = socket.close(None);

    result
}

fn run_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: &mut GameState,
    socket: &mut tungstenite::WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>,
    tick_duration: Duration,
) -> io::Result<()> {
    let mut keys = KeyState::new();
    let mut input_seq: u16 = 0;
    let mut last_buttons: u8 = 0;

    loop {
        let frame_start = Instant::now();

        // Poll input
        keys.update(tick_duration.saturating_sub(frame_start.elapsed()));

        if keys.wants_quit() {
            return Ok(());
        }

        // Send input to server
        let buttons = keys.buttons();
        if buttons != last_buttons || buttons != 0 {
            let packet = build_input_packet(input_seq, buttons, state.server_tick);
            let _ = socket.send(Message::Binary(packet.to_vec().into()));
            input_seq = input_seq.wrapping_add(1);
            last_buttons = buttons;
        }

        // Read all available messages from server
        loop {
            match socket.read() {
                Ok(Message::Binary(data)) => {
                    if let Some(packet) = parse_server_packet(&data) {
                        match packet {
                            ServerPacket::Hello(hello) => {
                                state.self_id = hello.player_id;
                                state.world_width = hello.world_w;
                                state.world_height = hello.world_h;
                                state.server_tick = hello.tick;
                            }
                            ServerPacket::Snapshot(snapshot) => {
                                state.apply_snapshot(snapshot);
                            }
                            ServerPacket::Death(_death) => {
                                // TODO: death effects
                            }
                        }
                    }
                }
                Ok(_) => {} // text messages, pings, etc
                Err(tungstenite::Error::Io(ref e))
                    if e.kind() == io::ErrorKind::WouldBlock => break,
                Err(_) => break,
            }
        }

        // Render
        terminal.draw(|frame| {
            render::draw(frame, state);
        })?;

        let elapsed = frame_start.elapsed();
        if elapsed < tick_duration {
            std::thread::sleep(tick_duration - elapsed);
        }
    }
}
