// Pocket Arena — main game logic.
// All entities, input, AI, rendering, and HUD live here.

(function () {
const S = window.SDS_GAME_SPRITES;
const drawSprite = S.drawSprite;
const SPRITES = S.SPRITES;
const PALETTES = S.PALETTES;
const POKEBALL_SPRITE = S.POKEBALL_SPRITE;
const POKEBALL_PALETTE = S.POKEBALL_PALETTE;
const SHADOW_SPRITE = S.SHADOW_SPRITE;
const SHADOW_PALETTE = S.SHADOW_PALETTE;
const SPARKLE_SPRITE = S.SPARKLE_SPRITE;
const SPARKLE_PALETTE = S.SPARKLE_PALETTE;

// ------------------------------------------------------------- world geometry
const VIEW_W = 384;
const VIEW_H = 216;
const FENCE = 14;             // play-area inset
const WALK = {
  x0: FENCE, y0: FENCE + 12,  // leave room for top HUD strip
  x1: VIEW_W - FENCE,
  y1: VIEW_H - FENCE,
};

// ------------------------------------------------------------- tunables
const TUNE = /*EDITMODE-BEGIN*/{
  "wildCount": 7,
  "ballSpeed": 140,
  "playerSpeed": 70,
  "enemySpeed": 36,
  "growthPerCatch": 0.14,
  "scanlines": true,
  "palette": "day",
  "musicMood": true
}/*EDITMODE-END*/;

// ------------------------------------------------------------- random helpers
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

// ------------------------------------------------------------- creature types
const WILD_TYPES = [
  { key: 'leafkin',  name: 'Leafkin',  walkBob: 1.0 },
  { key: 'aquoot',   name: 'Aquoot',   walkBob: 1.8 },
  { key: 'voltini',  name: 'Voltini',  walkBob: 1.3 },
  { key: 'stonewee', name: 'Stonewee', walkBob: 0.4 },
  { key: 'petalon',  name: 'Petalon',  walkBob: 0.9 },
  { key: 'wispette', name: 'Wispette', walkBob: 2.4 },
  { key: 'cloudini', name: 'Cloudini', walkBob: 2.0 },
];

// ------------------------------------------------------------- pre-rendered bg
let bgCanvas = null;
function buildBackground(palette) {
  const c = document.createElement('canvas');
  c.width = VIEW_W; c.height = VIEW_H;
  const g = c.getContext('2d');

  const pal = palette === 'dusk' ? {
    grass1: '#6a4a82', grass2: '#523a72', grass3: '#3e2a5a', path: '#a08aa0',
    flower1: '#fde26a', flower2: '#ff5aa8', flower3: '#7ebcf2',
    fence: '#3e2a5a', fenceLight: '#7a6a92', stone: '#8a8aa2',
    border: '#1a0e2e',
  } : palette === 'night' ? {
    grass1: '#1f3a48', grass2: '#173040', grass3: '#0f2030', path: '#3a5a6a',
    flower1: '#ffffff', flower2: '#7ebcf2', flower3: '#fde26a',
    fence: '#0f2030', fenceLight: '#3a5a6a', stone: '#5a6a7a',
    border: '#050a14',
  } : {
    grass1: '#74c14a', grass2: '#5aa838', grass3: '#3f7a2a', path: '#cfa978',
    flower1: '#fde26a', flower2: '#ff5aa8', flower3: '#ffffff',
    fence: '#6c5841', fenceLight: '#a8896a', stone: '#a8a8b0',
    border: '#1a0e08',
  };

  // outer dark border
  g.fillStyle = pal.border;
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  // grass field
  g.fillStyle = pal.grass1;
  g.fillRect(WALK.x0 - 4, WALK.y0 - 4, (WALK.x1 - WALK.x0) + 8, (WALK.y1 - WALK.y0) + 8);

  // tiled darker speckle
  const rng = mulberry32(20260520);
  for (let y = WALK.y0; y < WALK.y1; y += 4) {
    for (let x = WALK.x0; x < WALK.x1; x += 4) {
      const r = rng();
      if (r < 0.18) {
        g.fillStyle = pal.grass2;
        g.fillRect(x, y, 2, 2);
      } else if (r < 0.24) {
        g.fillStyle = pal.grass3;
        g.fillRect(x, y, 1, 1);
      }
    }
  }

  // tall grass tufts
  for (let i = 0; i < 50; i++) {
    const x = WALK.x0 + Math.floor(rng() * (WALK.x1 - WALK.x0));
    const y = WALK.y0 + Math.floor(rng() * (WALK.y1 - WALK.y0));
    g.fillStyle = pal.grass3;
    g.fillRect(x, y, 1, 2);
    g.fillRect(x + 2, y - 1, 1, 3);
    g.fillRect(x - 2, y - 1, 1, 3);
  }

  // path arc
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2 + 8;
  for (let a = -Math.PI * 0.85; a <= -Math.PI * 0.15; a += 0.01) {
    const r = 78;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r * 0.7;
    g.fillStyle = pal.path;
    g.fillRect(Math.round(px) - 5, Math.round(py), 10, 6);
  }

  // flowers
  const flowerColors = [pal.flower1, pal.flower2, pal.flower3];
  for (let i = 0; i < 18; i++) {
    const x = WALK.x0 + 4 + Math.floor(rng() * (WALK.x1 - WALK.x0 - 8));
    const y = WALK.y0 + 4 + Math.floor(rng() * (WALK.y1 - WALK.y0 - 8));
    const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
    // petals
    g.fillStyle = fc;
    g.fillRect(x - 1, y, 1, 1);
    g.fillRect(x + 1, y, 1, 1);
    g.fillRect(x, y - 1, 1, 1);
    g.fillRect(x, y + 1, 1, 1);
    // center
    g.fillStyle = pal.flower1;
    g.fillRect(x, y, 1, 1);
  }

  // fence around walkable area
  g.fillStyle = pal.fence;
  // top + bottom rails
  g.fillRect(WALK.x0 - 4, WALK.y0 - 4, (WALK.x1 - WALK.x0) + 8, 2);
  g.fillRect(WALK.x0 - 4, WALK.y1 + 2, (WALK.x1 - WALK.x0) + 8, 2);
  // posts
  for (let x = WALK.x0 - 4; x <= WALK.x1 + 3; x += 12) {
    g.fillStyle = pal.fence;
    g.fillRect(x, WALK.y0 - 6, 2, 6);
    g.fillRect(x, WALK.y1 + 2, 2, 6);
    g.fillStyle = pal.fenceLight;
    g.fillRect(x, WALK.y0 - 6, 1, 1);
    g.fillRect(x, WALK.y1 + 2, 1, 1);
  }
  // side rails
  g.fillStyle = pal.fence;
  g.fillRect(WALK.x0 - 4, WALK.y0 - 4, 2, (WALK.y1 - WALK.y0) + 8);
  g.fillRect(WALK.x1 + 2, WALK.y0 - 4, 2, (WALK.y1 - WALK.y0) + 8);

  // corner stones
  function stone(x, y, w, h) {
    g.fillStyle = pal.stone;
    g.fillRect(x, y, w, h);
    g.fillStyle = pal.fence;
    g.fillRect(x, y + h - 1, w, 1);
    g.fillStyle = '#ffffff22';
    g.fillRect(x, y, w, 1);
  }
  stone(WALK.x0 + 6,  WALK.y1 - 6, 8, 4);
  stone(WALK.x1 - 18, WALK.y0 + 4, 10, 5);
  stone(WALK.x0 + 24, WALK.y0 + 16, 7, 4);

  return c;
}

// ------------------------------------------------------------- prng
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- game state
let state;
function newState() {
  return {
    time: 0,
    phase: 'arena',          // 'arena' | 'battle'
    battle: null,
    tune: TUNE,
    player: makePlayer(),
    enemies: spawnWildlings(TUNE.wildCount),
    balls: [],
    particles: [],
    captures: [],     // capture animations
    caught: 0,
    defeated: 0,
    totalSpawned: TUNE.wildCount,
    flash: 0,
    won: false,
    wonAt: 0,
    gameOver: false,
    lastThrowAt: -1,
    aimAngle: 0,
    cooldown: 0,
    pointer: { x: VIEW_W/2, y: VIEW_H/2, active: false },
  };
}

function makePlayer() {
  return {
    x: VIEW_W / 2,
    y: VIEW_H / 2 + 10,
    vx: 0, vy: 0,
    facing: { x: 0, y: 1 },
    scale: 1,
    walkPhase: 0,
    bopPhase: 0,
    invulnTimer: 0,
  };
}

function spawnWildlings(n) {
  const enemies = [];
  for (let i = 0; i < n; i++) {
    const type = choose(WILD_TYPES);
    let x, y, tries = 0;
    do {
      x = WALK.x0 + 20 + Math.random() * (WALK.x1 - WALK.x0 - 40);
      y = WALK.y0 + 20 + Math.random() * (WALK.y1 - WALK.y0 - 40);
      tries++;
      // keep away from spawn center
    } while (dist2(x, y, VIEW_W/2, VIEW_H/2 + 10) < 50*50 && tries < 30);
    enemies.push({
      type: type.key,
      name: type.name,
      walkBob: type.walkBob,
      x, y,
      vx: 0, vy: 0,
      heading: Math.random() * Math.PI * 2,
      nextTurn: rand(0.6, 1.8),
      bopPhase: Math.random() * Math.PI * 2,
      flipX: Math.random() < 0.5,
      alive: true,
      scaredTimer: 0,
    });
  }
  return enemies;
}

// ------------------------------------------------------------- input
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key === ' ' || e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'j' || e.key === 'Enter') {
    if (state && state.phase === 'battle') {
      window.SDS_BATTLE.advanceMessage(state);
    } else {
      throwBall();
    }
  }
  if (e.key.toLowerCase() === 'r') {
    state = newState();
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });

function pointerToCanvas(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const sx = VIEW_W / r.width;
  const sy = VIEW_H / r.height;
  return {
    x: (e.clientX - r.left) * sx,
    y: (e.clientY - r.top) * sy,
  };
}

// ------------------------------------------------------------- throw
function throwBall() {
  if (!state || state.cooldown > 0 || state.won || state.phase === 'battle' || state.gameOver) return;
  const p = state.player;
  let dx = p.facing.x, dy = p.facing.y;
  if (state.pointer.active) {
    dx = state.pointer.x - p.x;
    dy = state.pointer.y - p.y;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m; dy /= m;
  }
  const speed = TUNE.ballSpeed;
  // travel duration & arc height based on distance to crosshair
  const targetX = state.pointer.active ? state.pointer.x : p.x + dx * 90;
  const targetY = state.pointer.active ? state.pointer.y : p.y + dy * 90;
  const dist = Math.hypot(targetX - p.x, targetY - p.y);
  const duration = clamp(dist / speed, 0.35, 1.1);
  state.balls.push({
    x0: p.x, y0: p.y - 6 * p.scale,
    x1: targetX, y1: targetY,
    t: 0,
    duration,
    arcH: clamp(dist * 0.35, 16, 60),
    rot: 0,
    dead: false,
  });
  state.cooldown = 0.18;
  // recoil
  state.player.bopPhase += 0.6;
}

// ------------------------------------------------------------- update
function update(dt) {
  state.time += dt;

  // Delegate to battle when in battle
  if (state.phase === 'battle') {
    window.SDS_BATTLE.update(state, dt);
    return;
  }

  state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.flash > 0) state.flash -= dt;

  // ---- player
  const p = state.player;
  let mx = 0, my = 0;
  if (keys.has('arrowup') || keys.has('w')) my -= 1;
  if (keys.has('arrowdown') || keys.has('s')) my += 1;
  if (keys.has('arrowleft') || keys.has('a')) mx -= 1;
  if (keys.has('arrowright') || keys.has('d')) mx += 1;
  const moving = mx !== 0 || my !== 0;
  if (moving) {
    const m = Math.hypot(mx, my);
    mx /= m; my /= m;
    p.facing = { x: mx, y: my };
    p.walkPhase += dt * 9;
  } else {
    p.walkPhase *= 0.85;
  }
  const speed = TUNE.playerSpeed;
  p.x += mx * speed * dt;
  p.y += my * speed * dt;

  // clamp to walk area
  const r = 8 * p.scale;
  p.x = clamp(p.x, WALK.x0 + r, WALK.x1 - r);
  p.y = clamp(p.y, WALK.y0 + r, WALK.y1 - r);
  p.bopPhase += dt * 4;

  // ---- aim angle (for crosshair)
  if (state.pointer.active) {
    state.aimAngle = Math.atan2(state.pointer.y - p.y, state.pointer.x - p.x);
  } else {
    state.aimAngle = Math.atan2(p.facing.y, p.facing.x);
  }

  // ---- enemies
  for (const e of state.enemies) {
    if (!e.alive) continue;
    e.nextTurn -= dt;
    e.bopPhase += dt * (3 + e.walkBob);
    if (e.scaredTimer > 0) {
      e.scaredTimer -= dt;
      // dart away from player
      const dx = e.x - p.x, dy = e.y - p.y;
      const m = Math.hypot(dx, dy) || 1;
      e.heading = Math.atan2(dy / m, dx / m);
      e.x += (dx/m) * (TUNE.enemySpeed * 1.6) * dt;
      e.y += (dy/m) * (TUNE.enemySpeed * 1.6) * dt;
    } else {
      if (e.nextTurn <= 0) {
        e.heading += rand(-Math.PI/2, Math.PI/2);
        e.nextTurn = rand(0.7, 2.2);
      }
      const ex = Math.cos(e.heading);
      const ey = Math.sin(e.heading);
      e.x += ex * TUNE.enemySpeed * dt;
      e.y += ey * TUNE.enemySpeed * dt;
      e.flipX = ex < 0;
      // chance to flee if player close
      if (dist2(e.x, e.y, p.x, p.y) < 36*36 && Math.random() < 0.02) {
        e.scaredTimer = rand(0.4, 0.9);
      }
    }
    const er = 8;
    if (e.x < WALK.x0 + er) { e.x = WALK.x0 + er; e.heading = Math.PI - e.heading; }
    if (e.x > WALK.x1 - er) { e.x = WALK.x1 - er; e.heading = Math.PI - e.heading; }
    if (e.y < WALK.y0 + er) { e.y = WALK.y0 + er; e.heading = -e.heading; }
    if (e.y > WALK.y1 - er) { e.y = WALK.y1 - er; e.heading = -e.heading; }
  }

  // ---- balls (arc projectiles)
  for (const b of state.balls) {
    b.t += dt;
    b.rot += dt * 12;
    if (b.t >= b.duration) {
      b.dead = true;
      // landed: spawn dust
      const lx = b.x1, ly = b.y1;
      for (let i = 0; i < 6; i++) {
        state.particles.push({
          kind: 'dust', x: lx, y: ly,
          vx: rand(-30, 30), vy: rand(-20, 0), life: 0.4, age: 0,
        });
      }
      // check hit on any enemy
      let hit = null;
      let bestD = Infinity;
      for (const e of state.enemies) {
        if (!e.alive) continue;
        const d = dist2(lx, ly, e.x, e.y);
        if (d < 10*10 && d < bestD) { bestD = d; hit = e; }
      }
      if (hit) {
        // Trigger battle instead of immediate capture
        window.SDS_BATTLE.enter(state, hit);
      }
    }
  }
  state.balls = state.balls.filter(b => !b.dead);

  // ---- captures (wobble animation)
  for (const c of state.captures) {
    c.t += dt;
    if (c.phase === 'wobble') {
      if (c.t >= 1.6) {
        c.phase = 'sparkle';
        c.t = 0;
        // grow player
        state.player.scale = Math.min(2.4, state.player.scale + TUNE.growthPerCatch);
        state.caught += 1;
        state.flash = 0.18;
        // burst of sparkles
        for (let i = 0; i < 14; i++) {
          state.particles.push({
            kind: 'spark', x: c.x, y: c.y,
            vx: rand(-50, 50), vy: rand(-60, -10), life: 0.7, age: 0,
          });
        }
        // win?
        if (state.caught >= state.totalSpawned) {
          state.won = true;
          state.wonAt = state.time;
        }
      }
    } else if (c.phase === 'sparkle') {
      if (c.t >= 0.55) c.done = true;
    }
  }
  state.captures = state.captures.filter(c => !c.done);

  // ---- particles
  for (const p of state.particles) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 90 * dt;
  }
  state.particles = state.particles.filter(p => p.age < p.life);
}

function initiateCapture(enemy, x, y) {
  enemy.alive = false;
  state.captures.push({
    x, y,
    t: 0,
    phase: 'wobble',
    enemyType: enemy.type,
  });
}

// ------------------------------------------------------------- render
function render(ctx) {
  // Battle scene takes over
  if (state.phase === 'battle' && state.battle) {
    window.SDS_BATTLE.render(ctx, state);
    return;
  }

  // background
  if (!bgCanvas) bgCanvas = buildBackground(TUNE.palette);
  ctx.drawImage(bgCanvas, 0, 0);

  // collect drawables, depth-sort by y
  const drawables = [];

  // enemies
  for (const e of state.enemies) {
    if (!e.alive) continue;
    drawables.push({ y: e.y, draw: () => drawEnemy(ctx, e) });
  }

  // player
  drawables.push({ y: state.player.y, draw: () => drawPlayer(ctx, state.player) });

  // captures (still on ground)
  for (const c of state.captures) {
    drawables.push({ y: c.y, draw: () => drawCapture(ctx, c) });
  }

  // balls (drawn last, on top, plus their shadow first underneath)
  // draw shadows now (under everything)
  for (const b of state.balls) {
    const p = ballPos(b);
    drawSprite(ctx, SHADOW_SPRITE, SHADOW_PALETTE, p.gx - 5, p.gy - 2, 1);
  }

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // balls (above sprites)
  for (const b of state.balls) {
    const p = ballPos(b);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(b.rot);
    drawSprite(ctx, POKEBALL_SPRITE, POKEBALL_PALETTE, -5, -5, 1);
    ctx.restore();
  }

  // particles
  for (const p of state.particles) {
    const a = 1 - p.age / p.life;
    if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(180,160,120,${0.5 * a})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    } else if (p.kind === 'spark') {
      drawSprite(ctx, SPARKLE_SPRITE, ['transparent', `rgba(253,226,106,${a})`, `rgba(255,255,255,${a})`], p.x - 2, p.y - 2, 1);
    }
  }

  // crosshair when pointer active
  if (state.pointer.active && !state.won) {
    const px = Math.round(state.pointer.x);
    const py = Math.round(state.pointer.y);
    const pulse = Math.sin(state.time * 8) * 0.5 + 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * pulse})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 4, py - 4, 9, 9);
    ctx.fillStyle = '#ff4a4a';
    ctx.fillRect(px, py, 1, 1);
  }

  // capture flash
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, state.flash * 3)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function ballPos(b) {
  const t = clamp(b.t / b.duration, 0, 1);
  const x = b.x0 + (b.x1 - b.x0) * t;
  const yGround = b.y0 + (b.y1 - b.y0) * t;
  const arc = -Math.sin(Math.PI * t) * b.arcH;
  return { x, y: yGround + arc, gx: x, gy: yGround };
}

function drawPlayer(ctx, p) {
  const sprite = (p.walkPhase % (Math.PI * 2)) > Math.PI ? SPRITES.emberon_walk : SPRITES.emberon;
  const palette = PALETTES.emberon;
  const w = sprite[0].length;
  const h = sprite.length;
  const s = p.scale;
  // shadow
  drawSprite(ctx, SHADOW_SPRITE, SHADOW_PALETTE, p.x - 6 * s, p.y + 4 * s, s);
  const bobY = Math.sin(p.bopPhase * 1.5) * (0.4 * s) + Math.abs(Math.sin(p.walkPhase * 2)) * (-1.2 * s);
  const flip = p.facing.x < -0.3;
  drawSprite(ctx, sprite, palette, p.x - (w/2) * s, p.y + bobY - h * s + 4 * s, s, flip);
}

function drawEnemy(ctx, e) {
  const sprite = SPRITES[e.type];
  const palette = PALETTES[e.type];
  const w = sprite[0].length;
  const h = sprite.length;
  drawSprite(ctx, SHADOW_SPRITE, SHADOW_PALETTE, e.x - 5, e.y + 3, 1);
  const bob = Math.sin(e.bopPhase) * 1.4;
  drawSprite(ctx, sprite, palette, e.x - w/2, e.y + bob - h + 4, 1, e.flipX);
}

function drawCapture(ctx, c) {
  drawSprite(ctx, SHADOW_SPRITE, SHADOW_PALETTE, c.x - 5, c.y + 2, 1);
  if (c.phase === 'wobble') {
    const wobble = Math.sin(c.t * 14) * Math.min(1, c.t * 1.2) * 0.4;
    ctx.save();
    ctx.translate(c.x, c.y - 4);
    ctx.rotate(wobble);
    drawSprite(ctx, POKEBALL_SPRITE, POKEBALL_PALETTE, -5, -5, 1);
    ctx.restore();
  } else {
    // burst — small flash
    const a = 1 - c.t / 0.55;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const r = (1 - a) * 16;
    ctx.beginPath();
    ctx.arc(c.x, c.y - 4, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------- entry
function mount(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  state = newState();

  // pointer
  canvas.addEventListener('mousemove', (e) => {
    const p = pointerToCanvas(e, canvas);
    state.pointer.x = p.x; state.pointer.y = p.y;
    state.pointer.active = true;
  });
  canvas.addEventListener('mouseleave', () => { state.pointer.active = false; });
  canvas.addEventListener('mousedown', (e) => {
    const p = pointerToCanvas(e, canvas);
    state.pointer.x = p.x; state.pointer.y = p.y;
    state.pointer.active = true;
    if (state.phase === 'battle') {
      window.SDS_BATTLE.advanceMessage(state);
    } else {
      throwBall();
    }
  });
  // touch
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!e.touches[0]) return;
    const p = pointerToCanvas(e.touches[0], canvas);
    state.pointer.x = p.x; state.pointer.y = p.y;
    state.pointer.active = true;
    if (state.phase === 'battle') {
      window.SDS_BATTLE.advanceMessage(state);
    } else {
      throwBall();
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!e.touches[0]) return;
    const p = pointerToCanvas(e.touches[0], canvas);
    state.pointer.x = p.x; state.pointer.y = p.y;
    state.pointer.active = true;
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(ctx);
    window.__game = state;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

window.SDS_GAME = {
  mount,
  resetGame: () => { state = newState(); },
  rebuildBackground: () => { bgCanvas = buildBackground(TUNE.palette); },
  setTune: (key, value) => {
    TUNE[key] = value;
    if (key === 'palette') bgCanvas = buildBackground(TUNE.palette);
    if (key === 'wildCount') {
      // respawn missing creatures up to new count
      state = newState();
    }
  },
  pressKey: (k) => keys.add(String(k).toLowerCase()),
  releaseKey: (k) => keys.delete(String(k).toLowerCase()),
  throwBall: () => throwBall(),
  getState: () => state,
  getTune: () => TUNE,
};
})();
