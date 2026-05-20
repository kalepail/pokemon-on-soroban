pub const ANGLE_STEPS: u16 = 1024;
pub const PLAYER_BYTES: usize = 19;
pub const BULLET_BYTES: usize = 13;

pub const PACKET_INPUT: u8 = 1;
pub const PACKET_HELLO: u8 = 2;
pub const PACKET_SNAPSHOT: u8 = 3;
pub const PACKET_DEATH: u8 = 4;

pub const BUTTON_LEFT: u8 = 1 << 0;
pub const BUTTON_RIGHT: u8 = 1 << 1;
pub const BUTTON_THRUST: u8 = 1 << 2;
pub const BUTTON_FIRE: u8 = 1 << 3;

#[derive(Debug)]
pub struct HelloPacket {
    pub player_id: u16,
    pub tick: u32,
    pub world_w: u16,
    pub world_h: u16,
}

#[derive(Debug, Clone)]
pub struct SnapshotPlayer {
    pub id: u16,
    pub x: u16,
    pub y: u16,
    pub vx: i16,
    pub vy: i16,
    pub angle: u16,
    pub radius: u16,
    pub score: u16,
    pub alive: bool,
    pub hue: u16,
}

#[derive(Debug, Clone)]
pub struct SnapshotBullet {
    pub id: u16,
    pub owner_id: u16,
    pub x: u16,
    pub y: u16,
    pub vx: i16,
    pub vy: i16,
    pub ttl: u8,
}

#[derive(Debug)]
pub struct SnapshotPacket {
    pub tick: u32,
    pub ack_seq: u16,
    pub self_id: u16,
    pub players: Vec<SnapshotPlayer>,
    pub bullets: Vec<SnapshotBullet>,
}

#[derive(Debug)]
pub struct DeathPacket {
    pub player_id: u16,
    pub killer_id: u16,
    pub score: u16,
}

#[derive(Debug)]
pub enum ServerPacket {
    Hello(HelloPacket),
    Snapshot(SnapshotPacket),
    Death(DeathPacket),
}

pub fn parse_server_packet(data: &[u8]) -> Option<ServerPacket> {
    if data.is_empty() {
        return None;
    }
    match data[0] {
        PACKET_HELLO if data.len() >= 12 => Some(ServerPacket::Hello(HelloPacket {
            player_id: u16::from_le_bytes([data[2], data[3]]),
            tick: u32::from_le_bytes([data[4], data[5], data[6], data[7]]),
            world_w: u16::from_le_bytes([data[8], data[9]]),
            world_h: u16::from_le_bytes([data[10], data[11]]),
        })),
        PACKET_DEATH if data.len() >= 8 => Some(ServerPacket::Death(DeathPacket {
            player_id: u16::from_le_bytes([data[2], data[3]]),
            killer_id: u16::from_le_bytes([data[4], data[5]]),
            score: u16::from_le_bytes([data[6], data[7]]),
        })),
        PACKET_SNAPSHOT if data.len() >= 12 => {
            let mut offset = 2;
            let tick = u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]);
            offset += 4;
            let ack_seq = u16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;
            let self_id = u16::from_le_bytes([data[offset], data[offset + 1]]);
            offset += 2;
            let player_count = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;

            let mut players = Vec::with_capacity(player_count);
            for _ in 0..player_count {
                if offset + PLAYER_BYTES > data.len() {
                    break;
                }
                players.push(SnapshotPlayer {
                    id: u16::from_le_bytes([data[offset], data[offset + 1]]),
                    x: u16::from_le_bytes([data[offset + 2], data[offset + 3]]),
                    y: u16::from_le_bytes([data[offset + 4], data[offset + 5]]),
                    vx: i16::from_le_bytes([data[offset + 6], data[offset + 7]]),
                    vy: i16::from_le_bytes([data[offset + 8], data[offset + 9]]),
                    angle: u16::from_le_bytes([data[offset + 10], data[offset + 11]]),
                    radius: u16::from_le_bytes([data[offset + 12], data[offset + 13]]),
                    score: u16::from_le_bytes([data[offset + 14], data[offset + 15]]),
                    alive: data[offset + 16] == 1,
                    hue: u16::from_le_bytes([data[offset + 17], data[offset + 18]]),
                });
                offset += PLAYER_BYTES;
            }

            if offset + 2 > data.len() {
                return None;
            }
            let bullet_count = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;

            let mut bullets = Vec::with_capacity(bullet_count);
            for _ in 0..bullet_count {
                if offset + BULLET_BYTES > data.len() {
                    break;
                }
                bullets.push(SnapshotBullet {
                    id: u16::from_le_bytes([data[offset], data[offset + 1]]),
                    owner_id: u16::from_le_bytes([data[offset + 2], data[offset + 3]]),
                    x: u16::from_le_bytes([data[offset + 4], data[offset + 5]]),
                    y: u16::from_le_bytes([data[offset + 6], data[offset + 7]]),
                    vx: i16::from_le_bytes([data[offset + 8], data[offset + 9]]),
                    vy: i16::from_le_bytes([data[offset + 10], data[offset + 11]]),
                    ttl: data[offset + 12],
                });
                offset += BULLET_BYTES;
            }

            Some(ServerPacket::Snapshot(SnapshotPacket {
                tick,
                ack_seq,
                self_id,
                players,
                bullets,
            }))
        }
        _ => None,
    }
}

pub fn build_input_packet(seq: u16, buttons: u8, last_server_tick: u32) -> [u8; 8] {
    let mut buf = [0u8; 8];
    buf[0] = PACKET_INPUT;
    buf[1..3].copy_from_slice(&seq.to_le_bytes());
    buf[3] = buttons;
    buf[4..8].copy_from_slice(&last_server_tick.to_le_bytes());
    buf
}
