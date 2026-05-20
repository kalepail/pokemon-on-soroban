import { DurableObject } from "cloudflare:workers";
import {
  BULLET_BYTES,
  Packet,
  PLAYER_BYTES,
  readInputPacket,
  WORLD_H,
  WORLD_W,
  writeDeath,
  writeHello,
} from "./protocol";
import {
  awardKill,
  Bullet,
  hitTest,
  MS_PER_TICK,
  Player,
  respawnPlayer,
  SNAPSHOT_RATE,
  spawnPlayer,
  stepBullet,
  stepPlayer,
  TICK_RATE,
} from "./sim";

export interface Env {
  ARENA: DurableObjectNamespace<Arena>;
  ASSETS: Fetcher;
}

type SocketAttachment = {
  playerId: number;
  sessionId: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.ARENA.idFromName("global-arena");
      return env.ARENA.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class Arena extends DurableObject<Env> {
  private players = new Map<number, Player>();
  private bullets = new Map<number, Bullet>();
  private socketPlayers = new WeakMap<WebSocket, number>();
  private sessionPlayers = new Map<string, number>();
  private botPlayerIds = new Set<number>();
  private nextPlayerId = 1;
  private nextBulletId = 1;
  private tick = 0;
  private loop: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = safeAttachment(ws);
      if (attachment) {
        this.socketPlayers.set(ws, attachment.playerId);
        this.sessionPlayers.set(attachment.sessionId, attachment.playerId);
        const player = spawnPlayer(attachment.playerId, attachment.playerId);
        player.lastInputTick = this.tick;
        this.players.set(attachment.playerId, player);
        this.nextPlayerId = Math.max(this.nextPlayerId, attachment.playerId + 1);
      }
    }
    if (this.players.size > 0) this.ensureLoop();
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }

    const url = new URL(request.url);
    const sessionId = cleanSessionId(url.searchParams.get("sid"));
    const requestedBots = clampBotCount(url.searchParams.get("bots"));
    this.replaceExistingSession(sessionId);

    const [client, server] = Object.values(new WebSocketPair());
    const playerId = this.nextPlayerId++;
    const player = spawnPlayer(playerId, playerId + Date.now());
    player.lastInputTick = this.tick;
    this.players.set(playerId, player);
    this.socketPlayers.set(server, playerId);
    this.sessionPlayers.set(sessionId, playerId);
    serializeAttachment(server, { playerId, sessionId });
    this.ctx.acceptWebSocket(server);
    server.send(writeHello(playerId, this.tick));
    if (requestedBots > 0) this.ensureBots(requestedBots);
    this.ensureLoop();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    if (typeof message === "string") return;
    const playerId = this.socketPlayers.get(ws) ?? safeAttachment(ws)?.playerId;
    if (!playerId) return;
    const input = readInputPacket(message);
    if (!input) return;
    const player = this.players.get(playerId);
    if (!player) return;

    const seqDelta = (input.seq - player.lastSeq + 65536) & 0xffff;
    if (seqDelta === 0 || seqDelta > 4096) return;
    player.lastSeq = input.seq;
    player.buttons = input.buttons & 0x0f;
    player.lastInputTick = this.tick;
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    const playerId = this.socketPlayers.get(ws) ?? safeAttachment(ws)?.playerId;
    if (playerId) this.players.delete(playerId);
    const sessionId = safeAttachment(ws)?.sessionId;
    if (sessionId) this.sessionPlayers.delete(sessionId);
    ws.close(code, reason);
    if (this.players.size === 0) this.stopLoop();
  }

  async webSocketError(ws: WebSocket) {
    const playerId = this.socketPlayers.get(ws) ?? safeAttachment(ws)?.playerId;
    if (playerId) this.players.delete(playerId);
    const sessionId = safeAttachment(ws)?.sessionId;
    if (sessionId) this.sessionPlayers.delete(sessionId);
    if (this.players.size === 0) this.stopLoop();
  }

  private ensureLoop() {
    if (this.loop) return;
    this.loop = setInterval(() => this.step(), MS_PER_TICK);
  }

  private stopLoop() {
    if (!this.loop) return;
    clearInterval(this.loop);
    this.loop = null;
    this.bullets.clear();
  }

  private step() {
    this.tick = (this.tick + 1) >>> 0;
    this.pruneDisconnectedPlayers();
    this.updateBots();

    for (const player of this.players.values()) {
      if (!player.alive && player.respawnTicks <= 0) {
        respawnPlayer(player, player.id + this.tick);
      }
      const bullet = stepPlayer(player);
      if (bullet) {
        bullet.id = this.nextBulletId++;
        this.bullets.set(bullet.id, bullet);
      }
    }

    for (const [bulletId, bullet] of this.bullets) {
      const prevX = bullet.x;
      const prevY = bullet.y;
      const bulletAlive = stepBullet(bullet);
      let didHit = false;
      for (const player of this.players.values()) {
        if (!hitTest(bullet, player, prevX, prevY)) continue;
        player.alive = false;
        player.respawnTicks = TICK_RATE;
        player.buttons = 0;
        awardKill(this.players.get(bullet.ownerId));
        this.bullets.delete(bulletId);
        this.broadcast(writeDeath(player.id, bullet.ownerId, player.score));
        didHit = true;
        break;
      }
      if (!didHit && !bulletAlive) this.bullets.delete(bulletId);
    }

    if (this.tick % Math.max(1, TICK_RATE / SNAPSHOT_RATE) === 0) {
      this.broadcastSnapshots();
    }
  }

  private broadcastSnapshots() {
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const playerId = this.socketPlayers.get(ws) ?? safeAttachment(ws)?.playerId ?? 0;
      const player = this.players.get(playerId);
      const ackSeq = player?.lastSeq ?? 0;
      ws.send(this.buildSnapshot(playerId, ackSeq));
    }
  }

  private pruneDisconnectedPlayers() {
    const livePlayerIds = new Set<number>();
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = this.socketPlayers.get(ws) ?? safeAttachment(ws)?.playerId;
      if (playerId && ws.readyState === WebSocket.OPEN) livePlayerIds.add(playerId);
    }
    for (const playerId of this.players.keys()) {
      if (this.botPlayerIds.has(playerId)) continue;
      const player = this.players.get(playerId);
      if (!player) continue;
      const inputAge = this.tick - player.lastInputTick;
      if (!livePlayerIds.has(playerId) || inputAge > TICK_RATE * 3) this.players.delete(playerId);
    }
    for (const [sessionId, playerId] of this.sessionPlayers) {
      if (!this.players.has(playerId)) this.sessionPlayers.delete(sessionId);
    }
    for (const [bulletId, bullet] of this.bullets) {
      if (!this.players.has(bullet.ownerId)) this.bullets.delete(bulletId);
    }
    if (livePlayerIds.size === 0) {
      for (const botId of this.botPlayerIds) this.players.delete(botId);
      this.botPlayerIds.clear();
    }
    if (this.players.size === 0) this.stopLoop();
  }

  private ensureBots(targetCount: number) {
    while (this.botPlayerIds.size < targetCount) {
      const botId = this.nextPlayerId++;
      const bot = spawnPlayer(botId, botId * 7919 + this.tick);
      bot.lastInputTick = this.tick;
      bot.buttons = (botId % 3 === 0 ? 0x08 : 0) | 0x04;
      this.players.set(botId, bot);
      this.botPlayerIds.add(botId);
    }
  }

  private updateBots() {
    for (const botId of this.botPlayerIds) {
      const bot = this.players.get(botId);
      if (!bot || !bot.alive) continue;
      const phase = Math.floor((this.tick + botId * 17) / 18) % 5;
      let buttons = 0x04;
      if (phase === 0 || phase === 1) buttons |= 0x01;
      if (phase === 3 || phase === 4) buttons |= 0x02;
      if ((this.tick + botId * 11) % 38 === 0) buttons |= 0x08;
      bot.buttons = buttons;
      bot.lastInputTick = this.tick;
    }
  }

  private replaceExistingSession(sessionId: string) {
    const existingPlayerId = this.sessionPlayers.get(sessionId);
    if (!existingPlayerId) return;
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = safeAttachment(ws);
      if (attachment?.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "replaced");
      }
    }
    this.players.delete(existingPlayerId);
    this.sessionPlayers.delete(sessionId);
  }

  private broadcast(buffer: ArrayBuffer) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(buffer);
    }
  }

  private buildSnapshot(selfId: number, ackSeq: number): ArrayBuffer {
    const players = [...this.players.values()];
    const bullets = [...this.bullets.values()];
    const size = 12 + players.length * PLAYER_BYTES + 2 + bullets.length * BULLET_BYTES;
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint8(offset, Packet.Snapshot);
    offset += 1;
    view.setUint8(offset, 1);
    offset += 1;
    view.setUint32(offset, this.tick, true);
    offset += 4;
    view.setUint16(offset, ackSeq, true);
    offset += 2;
    view.setUint16(offset, selfId, true);
    offset += 2;
    view.setUint16(offset, players.length, true);
    offset += 2;

    for (const player of players) {
      view.setUint16(offset, player.id, true);
      offset += 2;
      view.setUint16(offset, clampU16(player.x, WORLD_W), true);
      offset += 2;
      view.setUint16(offset, clampU16(player.y, WORLD_H), true);
      offset += 2;
      view.setInt16(offset, clampI16(player.vx), true);
      offset += 2;
      view.setInt16(offset, clampI16(player.vy), true);
      offset += 2;
      view.setUint16(offset, player.angle, true);
      offset += 2;
      view.setUint16(offset, player.radius, true);
      offset += 2;
      view.setUint16(offset, Math.min(player.score, 65535), true);
      offset += 2;
      view.setUint8(offset, player.alive ? 1 : 0);
      offset += 1;
      view.setUint16(offset, player.hue, true);
      offset += 2;
    }

    view.setUint16(offset, bullets.length, true);
    offset += 2;
    for (const bullet of bullets) {
      view.setUint16(offset, bullet.id & 0xffff, true);
      offset += 2;
      view.setUint16(offset, bullet.ownerId, true);
      offset += 2;
      view.setUint16(offset, clampU16(bullet.x, WORLD_W), true);
      offset += 2;
      view.setUint16(offset, clampU16(bullet.y, WORLD_H), true);
      offset += 2;
      view.setInt16(offset, clampI16(bullet.vx), true);
      offset += 2;
      view.setInt16(offset, clampI16(bullet.vy), true);
      offset += 2;
      view.setUint8(offset, Math.max(0, Math.min(255, bullet.ttl)));
      offset += 1;
    }

    return buffer;
  }
}

function clampU16(value: number, max: number): number {
  return Math.max(0, Math.min(max - 1, value));
}

function clampI16(value: number): number {
  return Math.max(-32768, Math.min(32767, value));
}

function cleanSessionId(value: string | null): string {
  if (value && /^[a-zA-Z0-9_-]{8,64}$/.test(value)) return value;
  return crypto.randomUUID().replaceAll("-", "");
}

function clampBotCount(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(20, parsed));
}

function serializeAttachment(ws: WebSocket, attachment: SocketAttachment) {
  const socket = ws as WebSocket & {
    serializeAttachment?: (value: SocketAttachment) => void;
  };
  socket.serializeAttachment?.(attachment);
}

function safeAttachment(ws: WebSocket): SocketAttachment | null {
  const socket = ws as WebSocket & {
    deserializeAttachment?: () => SocketAttachment;
  };
  try {
    return socket.deserializeAttachment?.() ?? null;
  } catch {
    return null;
  }
}
