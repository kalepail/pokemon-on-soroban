export const PROTOCOL_VERSION = 1;

export const Packet = {
  Input: 1,
  Hello: 2,
  Snapshot: 3,
  Death: 4,
} as const;

export const Button = {
  Left: 1 << 0,
  Right: 1 << 1,
  Thrust: 1 << 2,
  Fire: 1 << 3,
} as const;

export const WORLD_W = 8192;
export const WORLD_H = 8192;
export const ANGLE_STEPS = 1024;

export const INPUT_BYTES = 8;
export const PLAYER_BYTES = 19;
export const BULLET_BYTES = 13;

export type InputPacket = {
  seq: number;
  buttons: number;
  lastServerTick: number;
};

export function readInputPacket(message: ArrayBuffer): InputPacket | null {
  if (message.byteLength < INPUT_BYTES) return null;
  const view = new DataView(message);
  if (view.getUint8(0) !== Packet.Input) return null;
  return {
    seq: view.getUint16(1, true),
    buttons: view.getUint8(3),
    lastServerTick: view.getUint32(4, true),
  };
}

export function writeHello(playerId: number, tick: number): ArrayBuffer {
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, Packet.Hello);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, playerId, true);
  view.setUint32(4, tick, true);
  view.setUint16(8, WORLD_W, true);
  view.setUint16(10, WORLD_H, true);
  return buffer;
}

export function writeDeath(playerId: number, killerId: number, score: number): ArrayBuffer {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint8(0, Packet.Death);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, playerId, true);
  view.setUint16(4, killerId, true);
  view.setUint16(6, Math.min(score, 65535), true);
  return buffer;
}
