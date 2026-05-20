const Packet = {
  Input: 1,
  Hello: 2,
  Snapshot: 3,
  Death: 4,
};

const Button = {
  Left: 1 << 0,
  Right: 1 << 1,
  Thrust: 1 << 2,
  Fire: 1 << 3,
  Direct: 1 << 4,
};

const PLAYER_BYTES = 19;
const BULLET_BYTES = 13;
const WORLD = { w: 8192, h: 8192 };
const ANGLE_STEPS = 1024;
const TICK_RATE = 30;
const TURN_PER_TICK = 27;
const DIRECT_TURN_PER_TICK = 72;
const THRUST_PER_TICK = 62;
const DRAG_PER_TICK = 996 / 1024;
const MAX_SPEED = 1520;
const BULLET_SPEED = 2150;
const BULLET_TTL = 1.4;
const MAX_ACTIVE_BULLETS = 10;
const INPUT_RATE = 30;
const INPUT_DT = 1 / INPUT_RATE;
const MAX_PENDING_INPUTS = 90;
const LEADERBOARD_INTERVAL_MS = 250;
const keys = new Set();
const players = new Map();
const bullets = new Map();
const renderPlayers = new Map();
const renderBullets = new Map();
const predictedBullets = [];
const particles = [];
const rings = [];
const muzzleFlashes = [];
const knownBulletIds = new Set();
const knownPlayerIds = new Set();
const urlOptions = new URLSearchParams(location.search);
const SHOW_MINIMAP = urlOptions.get("minimap") === "1";
const SHOW_DETAIL = urlOptions.get("detail") === "1";
const SHOW_EFFECTS = urlOptions.get("effects") === "1";

const stars = SHOW_DETAIL ? Array.from({ length: 420 }, (_, i) => ({
  x: (i * 1543) % WORLD.w,
  y: (i * 2731) % WORLD.h,
  r: 0.55 + ((i * 17) % 10) / 10,
  a: 0.12 + ((i * 19) % 44) / 100,
  layer: 0.42 + ((i * 23) % 55) / 100,
})) : [];
const nebulae = SHOW_DETAIL ? Array.from({ length: 2 }, (_, i) => ({
  x: (i * 1879 + 913) % WORLD.w,
  y: (i * 1297 + 1821) % WORLD.h,
  radius: 520 + ((i * 211) % 740),
  hue: [174, 202, 38, 322, 26][i % 5],
  alpha: 0.035 + ((i * 13) % 20) / 1000,
})) : [];
const debris = SHOW_DETAIL ? Array.from({ length: 18 }, (_, i) => ({
  x: (i * 977 + 271) % WORLD.w,
  y: (i * 1609 + 821) % WORLD.h,
  size: 10 + ((i * 37) % 34),
  spin: ((i * 41) % 628) / 100,
  sides: 5 + (i % 4),
  hue: 188 + (i % 5) * 13,
})) : [];

const canvas = document.querySelector("#arena");
const ctx = canvas.getContext("2d", { alpha: false });
const statusEl = document.querySelector("#status");
const shipEl = document.querySelector("#ship");
const shipsEl = document.querySelector("#ships");
const scoreEl = document.querySelector("#score");
const leaderboardEl = document.querySelector("#leaderboard");
const stickZoneEl = document.querySelector("#stick-zone");
const stickKnobEl = document.querySelector("#stick-knob");
const fireButtonEl = document.querySelector("#fire-button");
const deathModalEl = document.querySelector("#death-modal");
const deathScoreEl = document.querySelector("#death-score");
const respawnButtonEl = document.querySelector("#respawn-button");

const camera = {
  x: WORLD.w / 2,
  y: WORLD.h / 2,
  zoom: 0.19,
  targetZoom: 0.19,
  shake: 0,
  shakeX: 0,
  shakeY: 0,
};

const perf = {
  fps: 60,
  quality: 2,
  starStep: 1,
  debrisStep: 1,
  nebulaStep: 1,
};

const audio = {
  ctx: null,
  master: null,
  muted: false,
  thrustOsc: null,
  thrustGain: null,
  musicTimer: 0,
  musicStep: 0,
  lastFireAt: 0,
};

const touchInput = {
  active: false,
  aimAngle: 0,
  throttle: 0,
  fire: false,
  stickPointerId: null,
};

let socket;
let selfId = 0;
let serverTick = 0;
let inputSeq = 1;
let lastAckSeq = 0;
let lastFrame = performance.now();
let inputAccumulator = 0;
let reconnectTimer = 0;
let deathFlash = 0;
let lastButtons = 0;
let frameButtons = 0;
let isDead = false;
let suppressNextCloseReconnect = false;
let predictedSelf = null;
let predictionBaseSeq = 0;
const pendingInputs = [];
let lastSnapshotAt = performance.now();
let lastLeaderboardAt = 0;
let lastScoreText = "";
let lastShipsText = "";
let leaderboardSignature = "";
let nextPredictedBulletId = -1;
let predictedFireCooldown = 0;
let tabSessionId = sessionStorage.getItem("arenaSid");
if (!tabSessionId) {
  tabSessionId = crypto.randomUUID().replaceAll("-", "");
  sessionStorage.setItem("arenaSid", tabSessionId);
}

function connect() {
  isDead = false;
  statusEl.textContent = "connecting";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams();
  params.set("sid", tabSessionId);
  const botCount = urlOptions.get("bots");
  if (botCount) params.set("bots", botCount);
  socket = new WebSocket(`${proto}//${location.host}/ws?${params.toString()}`);
  socket.binaryType = "arraybuffer";
  socket.addEventListener("open", () => {
    statusEl.textContent = "online";
  });
  socket.addEventListener("message", (event) => {
    if (!(event.data instanceof ArrayBuffer)) return;
    readPacket(event.data);
  });
  socket.addEventListener("close", (event) => {
    if (suppressNextCloseReconnect) {
      suppressNextCloseReconnect = false;
      return;
    }
    if (event.code === 4001) {
      showDeathModal(Number(scoreEl.textContent) || 0);
      return;
    }
    scheduleReconnect();
  });
  socket.addEventListener("error", () => {
    if (!isDead) scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (isDead) return;
  statusEl.textContent = "reconnecting";
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    connect();
  }, 700);
}

function readPacket(buffer) {
  const view = new DataView(buffer);
  const type = view.getUint8(0);
  if (type === Packet.Hello) {
    selfId = view.getUint16(2, true);
    serverTick = view.getUint32(4, true);
    WORLD.w = view.getUint16(8, true);
    WORLD.h = view.getUint16(10, true);
    shipEl.textContent = `Trainer #${selfId}`;
    return;
  }
  if (type === Packet.Death) {
    const deadId = view.getUint16(2, true);
    const deadScore = view.getUint16(6, true);
    const dead = players.get(deadId) ?? renderPlayers.get(deadId);
    if (dead) spawnExplosion(dead.x, dead.y, dead.hue, deadId === selfId);
    if (deadId === selfId) {
      deathFlash = 1;
      camera.shake = Math.max(camera.shake, 26);
      playImpact(true);
      showDeathModal(deadScore);
    } else {
      playImpact(false);
    }
    return;
  }
  if (type !== Packet.Snapshot) return;

  const now = performance.now();
  lastSnapshotAt = now;
  let offset = 2;
  serverTick = view.getUint32(offset, true);
  offset += 4;
  lastAckSeq = view.getUint16(offset, true);
  offset += 2;
  selfId = view.getUint16(offset, true);
  offset += 2;
  const playerCount = view.getUint16(offset, true);
  offset += 2;

  players.clear();
  const freshPlayerIds = new Set();
  for (let i = 0; i < playerCount; i += 1) {
    const player = {
      id: view.getUint16(offset, true),
      x: view.getUint16(offset + 2, true),
      y: view.getUint16(offset + 4, true),
      vx: view.getInt16(offset + 6, true),
      vy: view.getInt16(offset + 8, true),
      angle: view.getUint16(offset + 10, true),
      radius: view.getUint16(offset + 12, true),
      score: view.getUint16(offset + 14, true),
      alive: view.getUint8(offset + 16) === 1,
      hue: view.getUint16(offset + 17, true),
      updatedAt: now,
    };
    players.set(player.id, player);
    freshPlayerIds.add(player.id);
    if (!renderPlayers.has(player.id)) {
      renderPlayers.set(player.id, { ...player, turnGlow: 0, thrustGlow: 0 });
      if (SHOW_EFFECTS) rings.push({ x: player.x, y: player.y, hue: player.hue, life: 0.8, max: 0.8, size: player.radius * 3 });
    }
    offset += PLAYER_BYTES;
  }
  for (const id of knownPlayerIds) {
    if (!freshPlayerIds.has(id)) {
      const old = renderPlayers.get(id);
      if (old) spawnExplosion(old.x, old.y, old.hue, id === selfId);
      renderPlayers.delete(id);
    }
  }
  knownPlayerIds.clear();
  for (const id of freshPlayerIds) knownPlayerIds.add(id);

  bullets.clear();
  const freshBulletIds = new Set();
  const bulletCount = view.getUint16(offset, true);
  offset += 2;
  for (let i = 0; i < bulletCount; i += 1) {
    const id = view.getUint16(offset, true);
    const bullet = {
      id,
      ownerId: view.getUint16(offset + 2, true),
      x: view.getUint16(offset + 4, true),
      y: view.getUint16(offset + 6, true),
      vx: view.getInt16(offset + 8, true),
      vy: view.getInt16(offset + 10, true),
      ttl: view.getUint8(offset + 12),
      updatedAt: now,
    };
    bullets.set(id, bullet);
    freshBulletIds.add(id);
    if (!knownBulletIds.has(id)) {
      const owner = players.get(bullet.ownerId) ?? renderPlayers.get(bullet.ownerId);
      if (owner) spawnMuzzle(owner);
      if (bullet.ownerId === selfId) reconcilePredictedBullet(bullet);
      if (bullet.ownerId !== selfId) playFire(false);
    }
    offset += BULLET_BYTES;
  }
  knownBulletIds.clear();
  for (const id of freshBulletIds) knownBulletIds.add(id);

  const self = players.get(selfId);
  if (self) reconcilePredictedSelf(self, lastAckSeq);
  updateHud(self, now);
}

function sendInput() {
  if (isDead || !socket || socket.readyState !== WebSocket.OPEN) return;
  const buttons = currentButtons();
  const seq = inputSeq;
  const aimAngle = touchInput.active ? touchInput.aimAngle : 0;
  const throttle = touchInput.active ? touchInput.throttle : 0;
  const buffer = new ArrayBuffer(12);
  const view = new DataView(buffer);
  view.setUint8(0, Packet.Input);
  view.setUint16(1, seq, true);
  view.setUint8(3, buttons);
  view.setUint32(4, serverTick, true);
  view.setUint16(8, aimAngle, true);
  view.setUint8(10, throttle);
  view.setUint8(11, 0);
  inputSeq = (inputSeq + 1) & 0xffff;
  if (inputSeq === 0) inputSeq = 1;
  socket.send(buffer);
  pendingInputs.push({ seq, buttons, aimAngle, throttle });
  if (pendingInputs.length > MAX_PENDING_INPUTS) pendingInputs.splice(0, pendingInputs.length - MAX_PENDING_INPUTS);

  if (predictedFireCooldown > 0) predictedFireCooldown -= 1;
  if ((buttons & Button.Fire) && predictedFireCooldown === 0 && spawnPredictedBullet()) {
    predictedFireCooldown = 5;
    playFire(true);
  }
  lastButtons = buttons;
}

function flushInput(dt) {
  if (isDead) {
    inputAccumulator = 0;
    return;
  }
  inputAccumulator = Math.min(INPUT_DT * 3, inputAccumulator + dt);
  while (inputAccumulator >= INPUT_DT) {
    sendInput();
    inputAccumulator -= INPUT_DT;
  }
}

function currentButtons() {
  if (isDead) return 0;
  let buttons = 0;
  if (touchInput.active) buttons |= Button.Direct | Button.Thrust;
  if (keys.has("ArrowLeft") || keys.has("KeyA")) buttons |= Button.Left;
  if (keys.has("ArrowRight") || keys.has("KeyD")) buttons |= Button.Right;
  if (keys.has("ArrowUp") || keys.has("KeyW")) buttons |= Button.Thrust;
  if (keys.has("Space") || keys.has("KeyJ") || touchInput.fire) buttons |= Button.Fire;
  return buttons;
}

function showDeathModal(score) {
  if (isDead && !deathModalEl?.hidden) return;
  isDead = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
  predictedBullets.length = 0;
  predictedFireCooldown = 0;
  resetStick();
  setFireButton(false);
  statusEl.textContent = "fainted";
  scoreEl.textContent = String(score);
  if (deathScoreEl) deathScoreEl.textContent = String(score);
  if (deathModalEl) deathModalEl.hidden = false;
}

function respawn() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }
  try {
    suppressNextCloseReconnect = Boolean(socket);
    socket?.close(1000, "respawn");
  } catch {
    // Ignore stale sockets; the new session below is authoritative.
  }
  socket = null;
  isDead = false;
  deathFlash = 0;
  selfId = 0;
  inputSeq = 1;
  lastAckSeq = 0;
  inputAccumulator = 0;
  lastButtons = 0;
  players.clear();
  bullets.clear();
  predictedBullets.length = 0;
  renderPlayers.clear();
  renderBullets.clear();
  predictedSelf = null;
  predictionBaseSeq = 0;
  pendingInputs.length = 0;
  predictedFireCooldown = 0;
  knownPlayerIds.clear();
  knownBulletIds.clear();
  lastScoreText = "";
  lastShipsText = "";
  leaderboardSignature = "";
  lastLeaderboardAt = 0;
  leaderboardEl.replaceChildren();
  shipEl.textContent = "--";
  shipsEl.textContent = "0";
  scoreEl.textContent = "0";
  tabSessionId = crypto.randomUUID().replaceAll("-", "");
  sessionStorage.setItem("arenaSid", tabSessionId);
  if (deathModalEl) deathModalEl.hidden = true;
  connect();
}

function renderLeaderboard() {
  const leaders = [...players.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  const signature = leaders.map((player) => `${player.id}:${player.score}`).join("|");
  if (signature === leaderboardSignature) return;
  leaderboardSignature = signature;
  const fragment = document.createDocumentFragment();
  for (const player of leaders) {
    const li = document.createElement("li");
    li.textContent = `Trainer #${player.id}  ${player.score}`;
    if (player.id === selfId) li.style.color = "#1f7a46";
    fragment.append(li);
  }
  leaderboardEl.replaceChildren(fragment);
}

function updateHud(self, now) {
  if (self) {
    const scoreText = String(self.score);
    if (scoreText !== lastScoreText) {
      scoreEl.textContent = scoreText;
      lastScoreText = scoreText;
    }
  }
  const shipsText = String(players.size);
  if (shipsText !== lastShipsText) {
    shipsEl.textContent = shipsText;
    lastShipsText = shipsText;
  }
  if (now - lastLeaderboardAt >= LEADERBOARD_INTERVAL_MS) {
    lastLeaderboardAt = now;
    renderLeaderboard();
  }
}

function draw(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  flushInput(dt);
  updateQuality(dt);
  resize();
  frameButtons = currentButtons();
  updateRenderState(dt);
  updateCamera(dt);
  updateAudio();
  updateVfx(dt);

  ctx.fillStyle = "#bde886";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (SHOW_DETAIL) {
    drawNebulae();
    drawBackdrop();
  }
  drawGrid();
  if (SHOW_DETAIL) drawDebris(now);
  if (SHOW_EFFECTS) drawRings();
  drawBullets(dt);
  if (SHOW_EFFECTS) drawParticles();
  drawPlayers();
  drawOffscreenIndicators();
  if (SHOW_EFFECTS) drawReticle();
  if (SHOW_MINIMAP) drawMinimap();

  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(255, 55, 76, ${deathFlash * 0.28})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    deathFlash = Math.max(0, deathFlash - dt * 1.8);
  }

  requestAnimationFrame(draw);
}

function updateQuality(dt) {
  if (dt <= 0) return;
  const instantFps = Math.min(120, 1 / dt);
  perf.fps = perf.fps * 0.94 + instantFps * 0.06;

  if (perf.fps < 46) perf.quality = 0;
  else if (perf.fps < 55) perf.quality = 1;
  else if (perf.fps > 58) perf.quality = 2;

  perf.starStep = perf.quality === 2 ? 1 : perf.quality === 1 ? 2 : 4;
  perf.debrisStep = perf.quality === 2 ? 1 : perf.quality === 1 ? 2 : 3;
  perf.nebulaStep = perf.quality === 2 ? 1 : perf.quality === 1 ? 2 : 3;
  window.__arenaPerf = {
    fps: Math.round(perf.fps),
    quality: perf.quality,
    particles: particles.length,
    pokeBalls: renderBullets.size,
    predictedPokeBalls: predictedBullets.length,
    pokemon: renderPlayers.size,
    snapshotAgeMs: Math.round(performance.now() - lastSnapshotAt),
    pendingInputs: pendingInputs.length,
    ackSeq: lastAckSeq,
    predictionBaseSeq,
    prediction: Boolean(predictedSelf),
  };
}

function updateRenderState(dt) {
  for (const [id, player] of players) {
    const render = renderPlayers.get(id) ?? { ...player, turnGlow: 0, thrustGlow: 0 };
    if (id === selfId) {
      if (!predictedSelf || predictedSelf.id !== player.id) reconcilePredictedSelf(player, lastAckSeq);
      predictShip(predictedSelf, currentInputState(), dt);
      const predicted = predictedSelf;
      render.x = predicted.x;
      render.y = predicted.y;
      render.vx = predicted.vx;
      render.vy = predicted.vy;
      render.angle = predicted.angle;
    } else {
      render.x = wrapLerp(render.x, player.x + player.vx * dt * 0.55, WORLD.w, 0.18);
      render.y = wrapLerp(render.y, player.y + player.vy * dt * 0.55, WORLD.h, 0.18);
      render.vx += (player.vx - render.vx) * 0.22;
      render.vy += (player.vy - render.vy) * 0.22;
      render.angle = angleLerp(render.angle, player.angle, 0.3);
    }
    render.radius += (player.radius - render.radius) * 0.24;
    render.score = player.score;
    render.hue = player.hue;
    render.alive = player.alive;
    render.thrustGlow = Math.max(0, render.thrustGlow - dt * 2.7);
    render.turnGlow = Math.max(0, render.turnGlow - dt * 2.9);
    renderPlayers.set(id, render);
  }

  const self = renderPlayers.get(selfId);
  if (self) {
    if (frameButtons & Button.Thrust) self.thrustGlow = 1;
    if (frameButtons & (Button.Left | Button.Right)) self.turnGlow = frameButtons & Button.Left ? -1 : 1;
  }

  for (const [id, bullet] of bullets) {
    const render = renderBullets.get(id) ?? { ...bullet, px: bullet.x, py: bullet.y };
    render.px = render.x;
    render.py = render.y;
    render.x = wrapLerp(render.x, bullet.x + bullet.vx * dt * 0.65, WORLD.w, 0.55);
    render.y = wrapLerp(render.y, bullet.y + bullet.vy * dt * 0.65, WORLD.h, 0.55);
    render.vx = bullet.vx;
    render.vy = bullet.vy;
    render.ownerId = bullet.ownerId;
    render.ttl = bullet.ttl;
    renderBullets.set(id, render);
  }
  for (const id of renderBullets.keys()) {
    if (!bullets.has(id)) renderBullets.delete(id);
  }
  updatePredictedBullets(dt);
}

function reconcilePredictedSelf(serverPlayer, ackSeq) {
  pruneAckedInputs(ackSeq);
  const next = { ...serverPlayer };
  for (const input of pendingInputs) predictShip(next, input, INPUT_DT);

  if (predictedSelf && predictedSelf.id === serverPlayer.id) {
    next.x = wrapLerp(predictedSelf.x, next.x, WORLD.w, 0.72);
    next.y = wrapLerp(predictedSelf.y, next.y, WORLD.h, 0.72);
    next.vx = predictedSelf.vx + (next.vx - predictedSelf.vx) * 0.72;
    next.vy = predictedSelf.vy + (next.vy - predictedSelf.vy) * 0.72;
    next.angle = angleLerp(predictedSelf.angle, next.angle, 0.72);
  }
  predictedSelf = next;
  predictionBaseSeq = ackSeq;
}

function pruneAckedInputs(ackSeq) {
  while (pendingInputs.length > 0 && seqLessOrEqual(pendingInputs[0].seq, ackSeq)) {
    pendingInputs.shift();
  }
}

function seqLessOrEqual(seq, ackSeq) {
  return seq === ackSeq || (((ackSeq - seq + 65536) & 0xffff) < 32768);
}

function currentInputState() {
  return {
    buttons: currentButtons(),
    aimAngle: touchInput.active ? touchInput.aimAngle : 0,
    throttle: touchInput.active ? touchInput.throttle : 0,
  };
}

function predictShip(ship, input, dt) {
  const buttons = input.buttons;
  const tickScale = dt * TICK_RATE;
  if (buttons & Button.Direct) {
    ship.angle = stepAngleToward(ship.angle, input.aimAngle, DIRECT_TURN_PER_TICK * tickScale);
  } else {
    if (buttons & Button.Left) ship.angle = wrap(ship.angle - TURN_PER_TICK * tickScale, ANGLE_STEPS);
    if (buttons & Button.Right) ship.angle = wrap(ship.angle + TURN_PER_TICK * tickScale, ANGLE_STEPS);
  }
  if (buttons & Button.Thrust) {
    const thrust = buttons & Button.Direct ? Math.max(18, input.throttle) / 255 : 1;
    const radians = (ship.angle / ANGLE_STEPS) * Math.PI * 2;
    const accel = THRUST_PER_TICK * TICK_RATE * thrust;
    ship.vx += Math.cos(radians) * accel * dt;
    ship.vy += Math.sin(radians) * accel * dt;
  }

  const drag = Math.pow(DRAG_PER_TICK, tickScale);
  ship.vx *= drag;
  ship.vy *= drag;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > MAX_SPEED) {
    ship.vx = (ship.vx / speed) * MAX_SPEED;
    ship.vy = (ship.vy / speed) * MAX_SPEED;
  }
  ship.x = wrap(ship.x + ship.vx * dt, WORLD.w);
  ship.y = wrap(ship.y + ship.vy * dt, WORLD.h);
}

function spawnPredictedBullet() {
  const self = predictedSelf ?? renderPlayers.get(selfId) ?? players.get(selfId);
  if (!self || countSelfBullets() + predictedBullets.length >= MAX_ACTIVE_BULLETS) return false;
  const radians = (self.angle / ANGLE_STEPS) * Math.PI * 2;
  predictedBullets.push({
    id: nextPredictedBulletId--,
    ownerId: selfId,
    x: wrap(self.x + Math.cos(radians) * (self.radius + 18), WORLD.w),
    y: wrap(self.y + Math.sin(radians) * (self.radius + 18), WORLD.h),
    vx: self.vx + Math.cos(radians) * BULLET_SPEED,
    vy: self.vy + Math.sin(radians) * BULLET_SPEED,
    ttl: BULLET_TTL,
    predicted: true,
  });
  return true;
}

function countSelfBullets() {
  let count = 0;
  for (const bullet of renderBullets.values()) {
    if (bullet.ownerId === selfId) count += 1;
  }
  return count;
}

function updatePredictedBullets(dt) {
  for (let i = predictedBullets.length - 1; i >= 0; i -= 1) {
    const bullet = predictedBullets[i];
    bullet.x = wrap(bullet.x + bullet.vx * dt, WORLD.w);
    bullet.y = wrap(bullet.y + bullet.vy * dt, WORLD.h);
    bullet.ttl -= dt;
    if (bullet.ttl <= 0) predictedBullets.splice(i, 1);
  }
}

function reconcilePredictedBullet(serverBullet) {
  if (predictedBullets.length === 0) return;
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < predictedBullets.length; i += 1) {
    const candidate = predictedBullets[i];
    const dx = torusDelta(candidate.x, serverBullet.x, WORLD.w);
    const dy = torusDelta(candidate.y, serverBullet.y, WORLD.h);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  predictedBullets.splice(bestIndex, 1);
}

function updateCamera(dt) {
  const self = renderPlayers.get(selfId) ?? renderPlayers.values().next().value;
  if (!self) return;
  const speed = Math.hypot(self.vx, self.vy);
  const speedZoom = Math.min(0.025, speed / 28000);
  camera.targetZoom = clamp(0.19 - speedZoom, 0.16, 0.23);
  const leadX = self.vx * 0.72;
  const leadY = self.vy * 0.72;
  camera.x = wrapLerp(camera.x, self.x + leadX, WORLD.w, 1 - Math.pow(0.001, dt));
  camera.y = wrapLerp(camera.y, self.y + leadY, WORLD.h, 1 - Math.pow(0.001, dt));
  camera.zoom += (camera.targetZoom - camera.zoom) * 0.08;
  camera.shake = Math.max(0, camera.shake - dt * 42);
  if (camera.shake > 0) {
    camera.shakeX = (Math.random() - 0.5) * camera.shake * devicePixelRatio;
    camera.shakeY = (Math.random() - 0.5) * camera.shake * devicePixelRatio;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
  }
}

function drawBackdrop() {
  for (let i = 0; i < stars.length; i += perf.starStep) {
    const star = stars[i];
    const point = toScreen(star.x, star.y, star.layer);
    if (!isNearScreen(point.x, point.y, 20)) continue;
    ctx.fillStyle = `rgba(255, 246, 176, ${star.a * 1.45})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, star.r * devicePixelRatio * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawNebulae() {
  if (perf.quality === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < nebulae.length; i += perf.nebulaStep) {
    const cloud = nebulae[i];
    const point = toScreen(cloud.x, cloud.y, 0.32);
    const radius = cloud.radius * devicePixelRatio * camera.zoom * 0.9;
    if (!isNearScreen(point.x, point.y, radius)) continue;
    const grad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
    grad.addColorStop(0, `hsla(${96 + cloud.hue % 44} 72% 58% / ${cloud.alpha * 3})`);
    grad.addColorStop(0.45, `hsla(${188 + cloud.hue % 36} 72% 62% / ${cloud.alpha})`);
    grad.addColorStop(1, `hsla(${96 + cloud.hue % 44} 80% 50% / 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGrid() {
  const grid = perf.quality === 0 ? 512 : 256;
  const major = grid * 4;
  const view = screenWorldBounds();
  ctx.lineWidth = 1;
  for (let x = Math.floor(view.left / grid) * grid; x <= view.right; x += grid) {
    const p = toScreen(wrap(x, WORLD.w), camera.y);
    ctx.strokeStyle = x % major === 0 ? "rgba(42, 117, 187, 0.16)" : "rgba(31, 122, 70, 0.07)";
    ctx.beginPath();
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, canvas.height);
    ctx.stroke();
  }
  for (let y = Math.floor(view.top / grid) * grid; y <= view.bottom; y += grid) {
    const p = toScreen(camera.x, wrap(y, WORLD.h));
    ctx.strokeStyle = y % major === 0 ? "rgba(255, 203, 5, 0.18)" : "rgba(31, 122, 70, 0.06)";
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(canvas.width, p.y);
    ctx.stroke();
  }
}

function drawDebris(now) {
  for (let i = 0; i < debris.length; i += perf.debrisStep) {
    const rock = debris[i];
    const point = toScreen(rock.x, rock.y, 0.9);
    const size = rock.size * visualScale(0.32);
    if (!isNearScreen(point.x, point.y, size * 4)) continue;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Math.sin(now * 0.001 + rock.spin) * 0.12);
    ctx.fillStyle = "rgba(46, 146, 73, 0.28)";
    ctx.strokeStyle = "rgba(18, 100, 50, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let blade = 0; blade < rock.sides + 2; blade += 1) {
      const offset = (blade - rock.sides / 2) * size * 0.18;
      ctx.moveTo(offset, size * 0.7);
      ctx.quadraticCurveTo(offset + size * 0.2, 0, offset + Math.sin(blade) * size * 0.45, -size * (0.8 + blade * 0.02));
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayers() {
  const self = renderPlayers.get(selfId);
  for (const player of renderPlayers.values()) {
    if (player.id === selfId) continue;
    const point = toScreen(player.x, player.y);
    if (!isNearScreen(point.x, point.y, 120)) continue;
    drawPokemon(point.x, point.y, player);
  }
  if (!self) return;
  const point = toScreen(self.x, self.y);
  if (isNearScreen(point.x, point.y, 120)) drawPokemon(point.x, point.y, self);
}

function drawPokemon(x, y, player) {
  const angle = (player.angle / 1024) * Math.PI * 2;
  const scale = visualScale(0.46);
  const r = player.radius * scale;
  const isSelf = player.id === selfId;
  const bodyHue = isSelf ? 48 : (player.hue + 18) % 360;
  const accentHue = isSelf ? 210 : (player.hue + 116) % 360;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = player.alive ? 1 : 0.24;

  const speed = Math.hypot(player.vx, player.vy);
  if (SHOW_EFFECTS && isSelf && speed > 80 && perf.quality > 0) {
    const wake = clamp(speed / 860, 0, 1);
    const grad = ctx.createLinearGradient(-r * 0.6, 0, -r * (2.8 + wake), 0);
    grad.addColorStop(0, "rgba(255,203,5,0.26)");
    grad.addColorStop(1, "rgba(255,203,5,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(-r * 1.15, 0, r * (1.3 + wake), r * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (player.thrustGlow > 0 || (isSelf && frameButtons & Button.Thrust)) {
    const dash = (0.65 + Math.random() * 0.35) * (player.thrustGlow || 0.8);
    if (SHOW_EFFECTS && perf.quality > 0) {
      const grad = ctx.createLinearGradient(-r * 0.55, 0, -r * (2 + dash), 0);
      grad.addColorStop(0, "rgba(255,255,255,0.82)");
      grad.addColorStop(0.42, "rgba(255,203,5,0.5)");
      grad.addColorStop(1, "rgba(46,146,73,0)");
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = "rgba(255,203,5,0.5)";
    }
    ctx.beginPath();
    ctx.ellipse(-r * 1.25, 0, r * (0.8 + dash), r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (SHOW_EFFECTS && Math.abs(player.turnGlow) > 0) {
    ctx.strokeStyle = player.turnGlow < 0 ? "rgba(238,21,21,0.62)" : "rgba(42,117,187,0.62)";
    ctx.lineWidth = Math.max(1, 2 * devicePixelRatio);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, player.turnGlow < 0 ? -2.8 : -0.35, player.turnGlow < 0 ? -1.25 : 1.2);
    ctx.stroke();
  }

  ctx.shadowBlur = SHOW_EFFECTS && perf.quality > 0 ? (isSelf ? 16 * devicePixelRatio : 5 * devicePixelRatio) : 0;
  ctx.shadowColor = isSelf ? "#ffcb05" : `hsl(${bodyHue} 80% 58%)`;
  ctx.fillStyle = `hsl(${bodyHue} 82% ${isSelf ? 56 : 60}%)`;
  ctx.strokeStyle = isSelf ? "#243746" : "rgba(36, 55, 70, 0.68)";
  ctx.lineWidth = isSelf ? 2.5 * devicePixelRatio : 1.3 * devicePixelRatio;

  ctx.beginPath();
  ctx.ellipse(-r * 0.08, 0, r * 0.98, r * 0.74, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${bodyHue} 88% ${isSelf ? 66 : 68}%)`;
  ctx.beginPath();
  ctx.ellipse(r * 0.54, 0, r * 0.62, r * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = `hsl(${accentHue} 72% 54%)`;
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 0.48);
  ctx.lineTo(-r * 0.04, -r * 1.1);
  ctx.lineTo(r * 0.62, -r * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(r * 0.2, r * 0.48);
  ctx.lineTo(-r * 0.04, r * 1.1);
  ctx.lineTo(r * 0.62, r * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#243746";
  ctx.lineWidth = Math.max(1, 1.5 * devicePixelRatio);
  ctx.beginPath();
  ctx.arc(r * 0.8, -r * 0.18, Math.max(2, r * 0.13), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#243746";
  ctx.beginPath();
  ctx.arc(r * 0.84, -r * 0.18, Math.max(1.2, r * 0.055), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#243746";
  ctx.lineWidth = Math.max(1, 1.2 * devicePixelRatio);
  ctx.beginPath();
  ctx.arc(r * 0.86, r * 0.12, r * 0.2, 0.15, 1.05);
  ctx.stroke();

  ctx.fillStyle = `hsl(${accentHue} 78% 50%)`;
  ctx.beginPath();
  ctx.ellipse(-r * 0.88, 0, r * 0.38, r * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBullets(dt) {
  for (const bullet of predictedBullets) drawBullet(bullet, dt);
  for (const bullet of renderBullets.values()) {
    drawBullet(bullet, dt);
  }
}

function drawBullet(bullet, dt) {
  const ownerIsSelf = bullet.ownerId === selfId;
  const to = toScreen(bullet.x + bullet.vx * dt * 0.35, bullet.y + bullet.vy * dt * 0.35);
  if (!isNearScreen(to.x, to.y, 80)) return;
  const speed = Math.max(1, Math.hypot(bullet.vx, bullet.vy));
  const trailLength = clamp(speed * camera.zoom * 0.045, 14, 42) * devicePixelRatio;
  const from = {
    x: to.x - (bullet.vx / speed) * trailLength,
    y: to.y - (bullet.vy / speed) * trailLength,
  };
  if (!SHOW_EFFECTS || perf.quality === 0 || bullet.predicted) {
    ctx.strokeStyle = ownerIsSelf ? "rgba(255,203,5,0.72)" : "rgba(42,117,187,0.58)";
  } else {
    const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
    grad.addColorStop(0, ownerIsSelf ? "rgba(255,203,5,0)" : "rgba(42,117,187,0)");
    grad.addColorStop(0.58, ownerIsSelf ? "rgba(255,203,5,0.62)" : "rgba(42,117,187,0.48)");
    grad.addColorStop(1, "rgba(255,255,255,0.95)");
    ctx.strokeStyle = grad;
  }
  ctx.lineWidth = Math.max(2, 3 * visualScale(0.34));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const ballR = Math.max(5, 8 * visualScale(0.34));
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
  ctx.fillStyle = ownerIsSelf ? "#ee1515" : "#2a75bb";
  ctx.strokeStyle = "#243746";
  ctx.lineWidth = Math.max(1, 1.4 * devicePixelRatio);
  ctx.beginPath();
  ctx.arc(0, 0, ballR, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, ballR, 0, Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-ballR, 0);
  ctx.lineTo(ballR, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, ballR * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const point = toScreen(p.x, p.y);
    if (!isNearScreen(point.x, point.y, 60)) continue;
    const a = Math.max(0, p.life / p.max);
    ctx.fillStyle = `hsla(${p.hue} 95% ${p.light}%, ${a})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, p.size * a * visualScale(0.34), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const flash of muzzleFlashes) {
    const point = toScreen(flash.x, flash.y);
    const a = Math.max(0, flash.life / flash.max);
    ctx.fillStyle = `rgba(255,203,5,${a})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, flash.size * (1.4 - a) * visualScale(0.34), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings() {
  for (const ring of rings) {
    const point = toScreen(ring.x, ring.y);
    const a = Math.max(0, ring.life / ring.max);
    ctx.strokeStyle = `hsla(${ring.hue} 82% 58% / ${a * 0.75})`;
    ctx.lineWidth = Math.max(1, 2 * devicePixelRatio);
    ctx.beginPath();
    ctx.arc(point.x, point.y, ring.size * (1.15 - a) * visualScale(0.32), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawReticle() {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.strokeStyle = "rgba(238, 21, 21, 0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 20 * devicePixelRatio, 0, Math.PI * 2);
  ctx.moveTo(cx - 34 * devicePixelRatio, cy);
  ctx.lineTo(cx - 11 * devicePixelRatio, cy);
  ctx.moveTo(cx + 11 * devicePixelRatio, cy);
  ctx.lineTo(cx + 34 * devicePixelRatio, cy);
  ctx.stroke();
}

function drawMinimap() {
  const dpr = devicePixelRatio;
  const w = Math.min(220 * dpr, canvas.width * 0.23);
  const h = w;
  const x = canvas.width - w - 18 * dpr;
  const y = canvas.height - h - 18 * dpr;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.strokeStyle = "rgba(42,117,187,0.45)";
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, 8 * dpr);
  ctx.fill();
  ctx.stroke();

  const self = renderPlayers.get(selfId);
  if (self) {
    ctx.strokeStyle = "rgba(238,21,21,0.28)";
    ctx.strokeRect(x + (self.x / WORLD.w) * w - w * 0.12, y + (self.y / WORLD.h) * h - h * 0.12, w * 0.24, h * 0.24);
  }
  for (const player of renderPlayers.values()) {
    const px = x + (player.x / WORLD.w) * w;
    const py = y + (player.y / WORLD.h) * h;
    ctx.fillStyle = player.id === selfId ? "#ee1515" : `hsl(${(player.hue + 18) % 360} 82% 58%)`;
    ctx.beginPath();
    ctx.arc(px, py, (player.id === selfId ? 4 : 2.4) * dpr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawOffscreenIndicators() {
  const self = renderPlayers.get(selfId);
  if (!self) return;
  for (const player of renderPlayers.values()) {
    if (player.id === selfId || !player.alive) continue;
    const point = toScreen(player.x, player.y);
    if (isNearScreen(point.x, point.y, 30)) continue;
    const dx = torusDelta(player.x, self.x, WORLD.w);
    const dy = torusDelta(player.y, self.y, WORLD.h);
    const angle = Math.atan2(dy, dx);
    const margin = 34 * devicePixelRatio;
    const edge = edgePoint(Math.cos(angle), Math.sin(angle), margin);
    ctx.save();
    ctx.translate(edge.x, edge.y);
    ctx.rotate(angle);
    ctx.fillStyle = `hsla(${(player.hue + 18) % 360} 82% 54% / 0.72)`;
    ctx.strokeStyle = "#243746";
    ctx.lineWidth = Math.max(1, 1.2 * devicePixelRatio);
    ctx.beginPath();
    ctx.arc(0, 0, 10 * devicePixelRatio, -0.85, 0.85);
    ctx.lineTo(16 * devicePixelRatio, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function updateVfx(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x = wrap(p.x + p.vx * dt, WORLD.w);
    p.y = wrap(p.y + p.vy * dt, WORLD.h);
    p.vx *= 0.985;
    p.vy *= 0.985;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    rings[i].life -= dt;
    if (rings[i].life <= 0) rings.splice(i, 1);
  }
  for (let i = muzzleFlashes.length - 1; i >= 0; i -= 1) {
    muzzleFlashes[i].life -= dt;
    if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
  }
}

function spawnMuzzle(owner) {
  if (!SHOW_EFFECTS) return;
  if (perf.quality === 0 || muzzleFlashes.length > 40) return;
  const radians = (owner.angle / 1024) * Math.PI * 2;
  const x = wrap(owner.x + Math.cos(radians) * (owner.radius + 20), WORLD.w);
  const y = wrap(owner.y + Math.sin(radians) * (owner.radius + 20), WORLD.h);
  muzzleFlashes.push({ x, y, life: 0.12, max: 0.12, size: 42 });
}

function spawnExplosion(x, y, hue, strong) {
  if (!SHOW_EFFECTS) return;
  if (particles.length > 160) particles.splice(0, particles.length - 120);
  rings.push({ x, y, hue, life: 0.6, max: 0.6, size: strong ? 220 : 150 });
  const count = perf.quality === 2 ? (strong ? 34 : 20) : perf.quality === 1 ? (strong ? 20 : 12) : (strong ? 10 : 6);
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 90 + Math.random() * (strong ? 520 : 340);
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      hue: i % 3 === 0 ? 46 : hue,
      light: i % 3 === 0 ? 68 : 58,
      life: 0.35 + Math.random() * 0.5,
      max: 0.85,
      size: 6 + Math.random() * 12,
    });
  }
}

function unlockAudio() {
  if (audio.ctx || audio.muted) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audio.ctx = new AudioCtx();
  audio.master = audio.ctx.createGain();
  const compressor = audio.ctx.createDynamicsCompressor();
  audio.master.gain.value = 0.28;
  audio.master.connect(compressor);
  compressor.connect(audio.ctx.destination);
  startThrustHum();
  startPocketMelody();
}

function startThrustHum() {
  if (!audio.ctx || audio.thrustOsc) return;
  audio.thrustOsc = audio.ctx.createOscillator();
  audio.thrustGain = audio.ctx.createGain();
  audio.thrustOsc.type = "triangle";
  audio.thrustOsc.frequency.value = 110;
  audio.thrustGain.gain.value = 0;
  audio.thrustOsc.connect(audio.thrustGain);
  audio.thrustGain.connect(audio.master);
  audio.thrustOsc.start();
}

function startPocketMelody() {
  if (!audio.ctx || audio.musicTimer) return;
  const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 739.99, 880, 739.99];
  audio.musicTimer = window.setInterval(() => {
    if (!audio.ctx || audio.muted || document.hidden) return;
    const note = notes[audio.musicStep % notes.length];
    const accent = audio.musicStep % 4 === 0;
    blip(note, accent ? 0.032 : 0.018, 0.085, "square", 0);
    if (accent) blip(note / 2, 0.018, 0.11, "triangle", 0);
    audio.musicStep += 1;
  }, 285);
}

function updateAudio() {
  if (!audio.ctx || !audio.thrustGain || audio.muted) return;
  const self = renderPlayers.get(selfId);
  const thrust = self && frameButtons & Button.Thrust ? 1 : 0;
  const now = audio.ctx.currentTime;
  audio.thrustGain.gain.setTargetAtTime(thrust ? 0.035 : 0.0001, now, 0.05);
  if (audio.thrustOsc && self) {
    audio.thrustOsc.frequency.setTargetAtTime(146 + Math.min(120, Math.hypot(self.vx, self.vy) * 0.09), now, 0.07);
  }
}

function playFire(local) {
  if (!audio.ctx || audio.muted) return;
  const now = audio.ctx.currentTime;
  if (now - audio.lastFireAt < 0.045) return;
  audio.lastFireAt = now;
  blip(local ? 1046 : 784, local ? 0.105 : 0.04, 0.06, "square", -220);
  blip(local ? 1568 : 1174, local ? 0.055 : 0.025, 0.045, "triangle", -180);
}

function playImpact(local) {
  if (!audio.ctx || audio.muted) return;
  noiseBurst(local ? 0.11 : 0.045, 0.12);
  blip(local ? 196 : 247, local ? 0.13 : 0.06, 0.16, "triangle", -80);
  blip(local ? 130.81 : 164.81, local ? 0.07 : 0.035, 0.2, "square", -40);
}

function blip(freq, volume, duration, type, slide) {
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq * (0.94 + Math.random() * 0.12);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audio.ctx.currentTime + duration);
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start();
  osc.stop(audio.ctx.currentTime + duration + 0.02);
}

function noiseBurst(volume, duration) {
  const length = Math.max(1, Math.floor(audio.ctx.sampleRate * duration));
  const buffer = audio.ctx.createBuffer(1, length, audio.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.ctx.createBufferSource();
  const gain = audio.ctx.createGain();
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audio.master);
  source.start();
}

function toScreen(x, y, parallax = 1) {
  const scale = devicePixelRatio * camera.zoom * parallax;
  const dx = torusDelta(x, camera.x, WORLD.w);
  const dy = torusDelta(y, camera.y, WORLD.h);
  return {
    x: canvas.width / 2 + dx * scale + camera.shakeX,
    y: canvas.height / 2 + dy * scale + camera.shakeY,
  };
}

function visualScale(minZoom) {
  return devicePixelRatio * Math.max(camera.zoom, minZoom);
}

function screenWorldBounds() {
  const halfW = canvas.width / (2 * devicePixelRatio * camera.zoom) + 512;
  const halfH = canvas.height / (2 * devicePixelRatio * camera.zoom) + 512;
  return {
    left: camera.x - halfW,
    right: camera.x + halfW,
    top: camera.y - halfH,
    bottom: camera.y + halfH,
  };
}

function edgePoint(dx, dy, margin) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const k = Math.min((canvas.width / 2 - margin) / Math.max(0.001, Math.abs(dx)), (canvas.height / 2 - margin) / Math.max(0.001, Math.abs(dy)));
  return { x: cx + dx * k, y: cy + dy * k };
}

function isNearScreen(x, y, margin) {
  return x > -margin && y > -margin && x < canvas.width + margin && y < canvas.height + margin;
}

function torusDelta(a, b, size) {
  let d = a - b;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return d;
}

function wrap(value, size) {
  return ((value % size) + size) % size;
}

function wrapLerp(from, to, size, t) {
  return wrap(from + torusDelta(to, from, size) * t, size);
}

function angleLerp(from, to, t) {
  let d = ((to - from + 512) % 1024) - 512;
  if (d < -512) d += 1024;
  return wrap(from + d * t, 1024);
}

function stepAngleToward(from, to, maxStep) {
  let d = wrap(to - from + ANGLE_STEPS / 2, ANGLE_STEPS) - ANGLE_STEPS / 2;
  if (d < -ANGLE_STEPS / 2) d += ANGLE_STEPS;
  if (Math.abs(d) <= maxStep) return wrap(to, ANGLE_STEPS);
  return wrap(from + Math.sign(d) * maxStep, ANGLE_STEPS);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function resize() {
  const width = Math.floor(innerWidth * devicePixelRatio);
  const height = Math.floor(innerHeight * devicePixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function updateStick(event) {
  if (!stickZoneEl || !stickKnobEl) return;
  const rect = stickZoneEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = Math.min(rect.width, rect.height) * 0.28;
  const rawDx = event.clientX - cx;
  const rawDy = event.clientY - cy;
  const distance = Math.hypot(rawDx, rawDy);
  const scale = distance > max ? max / distance : 1;
  const dx = rawDx * scale;
  const dy = rawDy * scale;
  const dead = max * 0.18;
  const activeDistance = Math.hypot(dx, dy);
  touchInput.active = activeDistance > dead;
  touchInput.aimAngle = touchInput.active ? Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * 1024 + 1024) % 1024 : touchInput.aimAngle;
  touchInput.throttle = touchInput.active ? Math.round(clamp((activeDistance - dead) / (max - dead), 0, 1) * 255) : 0;
  stickKnobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function resetStick() {
  touchInput.active = false;
  touchInput.throttle = 0;
  touchInput.stickPointerId = null;
  stickZoneEl?.classList.remove("is-active");
  if (stickKnobEl) stickKnobEl.style.transform = "translate(-50%, -50%)";
}

function setFireButton(active) {
  touchInput.fire = active;
  fireButtonEl?.classList.toggle("is-active", active);
}

addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  unlockAudio();
  if (event.code === "KeyM" && !event.repeat) {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.28;
  }
  keys.add(event.code);
});

addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

addEventListener("pointerdown", unlockAudio);

respawnButtonEl?.addEventListener("click", respawn);

stickZoneEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  touchInput.stickPointerId = event.pointerId;
  stickZoneEl.setPointerCapture(event.pointerId);
  stickZoneEl.classList.add("is-active");
  updateStick(event);
});

stickZoneEl?.addEventListener("pointermove", (event) => {
  if (event.pointerId !== touchInput.stickPointerId) return;
  event.preventDefault();
  updateStick(event);
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  stickZoneEl?.addEventListener(type, (event) => {
    if ("pointerId" in event && event.pointerId !== touchInput.stickPointerId) return;
    event.preventDefault();
    resetStick();
  });
}

fireButtonEl?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  unlockAudio();
  fireButtonEl.setPointerCapture(event.pointerId);
  setFireButton(true);
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  fireButtonEl?.addEventListener(type, (event) => {
    event.preventDefault();
    setFireButton(false);
  });
}

connect();
requestAnimationFrame(draw);
