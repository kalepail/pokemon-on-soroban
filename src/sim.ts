import { ANGLE_STEPS, Button, WORLD_H, WORLD_W } from "./protocol";

export const TICK_RATE = 30;
export const SNAPSHOT_RATE = 15;
export const MS_PER_TICK = 1000 / TICK_RATE;

const DIR_SCALE = 1024;
const TURN_PER_TICK = 27;
const THRUST_PER_TICK = 62;
const DRAG_NUM = 996;
const DRAG_DEN = 1024;
const MAX_SPEED = 1520;
const BULLET_SPEED = 2150;
const BULLET_TTL = Math.round(TICK_RATE * 1.4);
const FIRE_COOLDOWN = 5;
const BASE_RADIUS = 34;

const cosTable = new Int16Array(ANGLE_STEPS);
const sinTable = new Int16Array(ANGLE_STEPS);
for (let i = 0; i < ANGLE_STEPS; i += 1) {
  const radians = (i / ANGLE_STEPS) * Math.PI * 2;
  cosTable[i] = Math.round(Math.cos(radians) * DIR_SCALE);
  sinTable[i] = Math.round(Math.sin(radians) * DIR_SCALE);
}

export type Player = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  score: number;
  hue: number;
  alive: boolean;
  buttons: number;
  lastSeq: number;
  lastInputTick: number;
  fireCooldown: number;
  respawnTicks: number;
  kills: number;
};

export type Bullet = {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
};

export function spawnPlayer(id: number, seed: number): Player {
  const angle = (seed * 97) & (ANGLE_STEPS - 1);
  return {
    id,
    x: positiveModulo(seed * 1543 + 1024, WORLD_W),
    y: positiveModulo(seed * 2141 + 2048, WORLD_H),
    vx: 0,
    vy: 0,
    angle,
    radius: BASE_RADIUS,
    score: 0,
    hue: (seed * 47) % 360,
    alive: true,
    buttons: 0,
    lastSeq: 0,
    lastInputTick: 0,
    fireCooldown: 0,
    respawnTicks: 0,
    kills: 0,
  };
}

export function respawnPlayer(player: Player, seed: number) {
  const fresh = spawnPlayer(player.id, seed);
  player.x = fresh.x;
  player.y = fresh.y;
  player.vx = 0;
  player.vy = 0;
  player.angle = fresh.angle;
  player.radius = BASE_RADIUS;
  player.score = 0;
  player.alive = true;
  player.buttons = 0;
  player.fireCooldown = 0;
  player.respawnTicks = 0;
}

export function stepPlayer(player: Player): Bullet | null {
  if (!player.alive) {
    player.respawnTicks -= 1;
    return null;
  }

  if (player.buttons & Button.Left) {
    player.angle = positiveModulo(player.angle - TURN_PER_TICK, ANGLE_STEPS);
  }
  if (player.buttons & Button.Right) {
    player.angle = positiveModulo(player.angle + TURN_PER_TICK, ANGLE_STEPS);
  }
  if (player.buttons & Button.Thrust) {
    player.vx += Math.trunc((cosTable[player.angle] * THRUST_PER_TICK) / DIR_SCALE);
    player.vy += Math.trunc((sinTable[player.angle] * THRUST_PER_TICK) / DIR_SCALE);
  }

  player.vx = Math.trunc((player.vx * DRAG_NUM) / DRAG_DEN);
  player.vy = Math.trunc((player.vy * DRAG_NUM) / DRAG_DEN);
  clampVelocity(player);

  player.x = wrap(player.x + Math.trunc(player.vx / TICK_RATE), WORLD_W);
  player.y = wrap(player.y + Math.trunc(player.vy / TICK_RATE), WORLD_H);

  if (player.fireCooldown > 0) player.fireCooldown -= 1;
  if ((player.buttons & Button.Fire) && player.fireCooldown === 0) {
    player.fireCooldown = FIRE_COOLDOWN;
    return {
      id: 0,
      ownerId: player.id,
      x: wrap(player.x + Math.trunc((cosTable[player.angle] * (player.radius + 18)) / DIR_SCALE), WORLD_W),
      y: wrap(player.y + Math.trunc((sinTable[player.angle] * (player.radius + 18)) / DIR_SCALE), WORLD_H),
      vx: player.vx + Math.trunc((cosTable[player.angle] * BULLET_SPEED) / DIR_SCALE),
      vy: player.vy + Math.trunc((sinTable[player.angle] * BULLET_SPEED) / DIR_SCALE),
      ttl: BULLET_TTL,
    };
  }

  return null;
}

export function stepBullet(bullet: Bullet): boolean {
  bullet.x = wrap(bullet.x + Math.trunc(bullet.vx / TICK_RATE), WORLD_W);
  bullet.y = wrap(bullet.y + Math.trunc(bullet.vy / TICK_RATE), WORLD_H);
  bullet.ttl -= 1;
  return bullet.ttl > 0;
}

export function hitTest(bullet: Bullet, player: Player, prevX = bullet.x, prevY = bullet.y): boolean {
  if (!player.alive || player.id === bullet.ownerId) return false;
  const ax = torusDelta(prevX, player.x, WORLD_W);
  const ay = torusDelta(prevY, player.y, WORLD_H);
  const bx = ax + torusDelta(bullet.x, prevX, WORLD_W);
  const by = ay + torusDelta(bullet.y, prevY, WORLD_H);
  const radius = player.radius + 8;
  return segmentIntersectsCircle(ax, ay, bx, by, radius);
}

export function awardKill(shooter: Player | undefined) {
  if (!shooter || !shooter.alive) return;
  shooter.kills += 1;
  shooter.score += 100 + shooter.radius;
  shooter.radius = Math.min(110, shooter.radius + 5);
}

function clampVelocity(player: Player) {
  const speedSq = player.vx * player.vx + player.vy * player.vy;
  const maxSq = MAX_SPEED * MAX_SPEED;
  if (speedSq <= maxSq) return;
  const scale = MAX_SPEED / Math.sqrt(speedSq);
  player.vx = Math.trunc(player.vx * scale);
  player.vy = Math.trunc(player.vy * scale);
}

function wrap(value: number, size: number): number {
  return positiveModulo(value, size);
}

function positiveModulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function torusDelta(a: number, b: number, size: number): number {
  let d = a - b;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function segmentIntersectsCircle(ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return ax * ax + ay * ay <= radius * radius;
  const t = Math.max(0, Math.min(1, -(ax * abx + ay * aby) / lenSq));
  const x = ax + abx * t;
  const y = ay + aby * t;
  return x * x + y * y <= radius * radius;
}
