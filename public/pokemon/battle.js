// battle.js — turn-based battle state machine + canvas rendering.
// Triggered from arena when a thrown pokeball lands on an enemy.
//
// The battle owns its own queue of timed actions ("msg", "anim", "damage", ...).
// HTML overlay handles HP bars and the action menu; canvas paints the scene.

(function () {
const S = window.SDS_GAME_SPRITES;
const VIEW_W = 384;
const VIEW_H = 216;

// ---------------------------------------------------------------- move/enemy data
const PLAYER_MOVES = [
  { name: 'Ember',        dmg: 14, type: 'fire',   acc: 0.95, anim: 'spark',  desc: 'Lobs a small fireball' },
  { name: 'Tackle',       dmg: 9,  type: 'normal', acc: 1.0,  anim: 'dash',   desc: 'A reliable body slam' },
  { name: 'Flame Charge', dmg: 18, type: 'fire',   acc: 0.80, anim: 'flame',  desc: 'Big damage, can miss' },
  { name: 'Growl',        dmg: 0,  type: 'status', acc: 1.0,  anim: 'wave',   desc: 'Weakens foe attacks', effect: 'lowerAtk' },
];

const ENEMY_DATA = {
  leafkin:  { name: 'Leafkin',  type: 'grass',    maxHP: 26, atk: 7, moves: [
    { name: 'Vine Whip',    dmg: 7,  acc: 1.0,  anim: 'dash' },
    { name: 'Razor Leaf',   dmg: 11, acc: 0.85, anim: 'spark' },
  ]},
  aquoot:   { name: 'Aquoot',   type: 'water',    maxHP: 22, atk: 6, moves: [
    { name: 'Water Jet',    dmg: 9,  acc: 0.95, anim: 'dash' },
    { name: 'Bubble',       dmg: 5,  acc: 1.0,  anim: 'spark' },
  ]},
  voltini:  { name: 'Voltini',  type: 'electric', maxHP: 20, atk: 8, moves: [
    { name: 'Quick Zap',    dmg: 6,  acc: 1.0,  anim: 'dash' },
    { name: 'Thunderbolt',  dmg: 12, acc: 0.85, anim: 'spark' },
  ]},
  stonewee: { name: 'Stonewee', type: 'rock',     maxHP: 30, atk: 5, moves: [
    { name: 'Rock Throw',   dmg: 11, acc: 0.9,  anim: 'dash' },
    { name: 'Harden',       dmg: 0,  acc: 1.0,  anim: 'wave', effect: 'defUp' },
  ]},
  petalon:  { name: 'Petalon',  type: 'grass',    maxHP: 18, atk: 6, moves: [
    { name: 'Pollen Puff',  dmg: 6,  acc: 1.0,  anim: 'spark' },
    { name: 'Sweet Scent',  dmg: 0,  acc: 1.0,  anim: 'wave', effect: 'lowerAcc' },
  ]},
  wispette: { name: 'Wispette', type: 'ghost',    maxHP: 20, atk: 7, moves: [
    { name: 'Shadow Sneak', dmg: 8,  acc: 1.0,  anim: 'dash' },
    { name: 'Spite',        dmg: 5,  acc: 1.0,  anim: 'wave' },
  ]},
  cloudini: { name: 'Cloudini', type: 'flying',   maxHP: 22, atk: 5, moves: [
    { name: 'Gust',         dmg: 7,  acc: 0.95, anim: 'dash' },
    { name: 'Mist',         dmg: 0,  acc: 1.0,  anim: 'wave', effect: 'lowerAcc' },
  ]},
};

// Effectiveness for player's fire-typed moves against enemy types.
function effectiveness(moveType, enemyType) {
  if (moveType !== 'fire') return 1;
  if (enemyType === 'grass') return 1.6;
  if (enemyType === 'water' || enemyType === 'rock') return 0.55;
  if (enemyType === 'flying') return 0.85;
  return 1;
}

function effectivenessLabel(mul) {
  if (mul >= 1.4) return "It's super effective!";
  if (mul <= 0.7) return "It's not very effective…";
  return null;
}

// ---------------------------------------------------------------- entry
function enter(state, enemyRef) {
  const data = ENEMY_DATA[enemyRef.type];
  const playerMaxHP = Math.round(30 + (state.player.scale - 1) * 18);
  state.phase = 'battle';
  state.battle = {
    enemyRef,
    enemy: {
      type: enemyRef.type,
      name: data.name,
      typeName: data.type,
      hp: data.maxHP,
      maxHP: data.maxHP,
      atk: data.atk,
      moves: data.moves,
      x: 282, y: 78,            // sprite anchor (bottom-center)
      scale: 3.2,
      flashT: 0, shakeT: 0,
      offsetY: 0, alpha: 1,
      atkBuff: 0,               // negative = atk lowered
      defBuff: 0,
      caught: false,
    },
    player: {
      hp: playerMaxHP,
      maxHP: playerMaxHP,
      atkBuff: 0,
      moves: PLAYER_MOVES,
      x: 100, y: 122,
      scale: 4.0,
      flashT: 0, shakeT: 0,
      offsetX: 0,
    },
    queue: [],
    current: null,
    awaitClick: false,
    menu: null,                 // null | 'main' | 'fight'
    message: '',
    flashScreen: 0,
    shakeScreen: 0,
    enterT: 0,                  // 0→1 wipe-in
    exitT: 0,                   // 0→1 wipe-out
    exiting: false,
    result: null,               // 'caught' | 'fainted' | 'fled' | 'defeated'
    ball: null,                 // { phase, t, ... } for ball-throw animation
    flashOpacity: 0,            // for enemy-becoming-light effect during catch
  };
  // intro queue
  queueMsg(state.battle, `A wild ${data.name} appeared!`, true);
  enqueue(state.battle, { kind: 'openMenu', menu: 'main' });
}

// ---------------------------------------------------------------- queue helpers
function enqueue(b, action) { b.queue.push(action); }
function queueMsg(b, text, awaitClick = true, duration = 1.6) {
  enqueue(b, { kind: 'msg', text, duration, awaitClick });
}

// ---------------------------------------------------------------- input from UI
function chooseAction(state, action) {
  const b = state.battle;
  if (!b || b.menu !== 'main') return;
  b.menu = null;
  if (action === 'fight') {
    b.menu = 'fight';
    b.message = 'Choose a move.';
  } else if (action === 'catch') {
    enqueue(b, { kind: 'msg', text: 'You threw a pokeball!', duration: 0.7, awaitClick: false });
    enqueue(b, { kind: 'ballThrow' });
  } else if (action === 'run') {
    const success = Math.random() < 0.75;
    if (success) {
      queueMsg(b, 'Got away safely!', true);
      enqueue(b, { kind: 'exit', result: 'fled' });
    } else {
      queueMsg(b, "Couldn't escape!", true);
      enqueue(b, { kind: 'enemyTurn' });
    }
  }
}

function chooseMove(state, moveIdx) {
  const b = state.battle;
  if (!b || b.menu !== 'fight') return;
  b.menu = null;
  const move = b.player.moves[moveIdx];
  enqueue(b, { kind: 'playerAttack', move });
  enqueue(b, { kind: 'checkEnemyHP' });
  enqueue(b, { kind: 'enemyTurn' });
}

function advanceMessage(state) {
  const b = state.battle;
  if (!b) return;
  if (b.current && b.current.kind === 'msg' && b.awaitClick) {
    b.current.t = b.current.duration; // force complete
  }
}

// ---------------------------------------------------------------- update
function update(state, dt) {
  const b = state.battle;
  if (!b) return;

  // wipe-in / wipe-out timers
  if (b.enterT < 1) b.enterT = Math.min(1, b.enterT + dt * 3);
  if (b.exiting) {
    b.exitT = Math.min(1, b.exitT + dt * 3);
    if (b.exitT >= 1) finishExit(state);
    return;
  }

  // decay flashes
  if (b.flashScreen > 0) b.flashScreen = Math.max(0, b.flashScreen - dt * 3);
  if (b.shakeScreen > 0) b.shakeScreen = Math.max(0, b.shakeScreen - dt * 4);
  b.enemy.flashT = Math.max(0, b.enemy.flashT - dt);
  b.enemy.shakeT = Math.max(0, b.enemy.shakeT - dt);
  b.player.flashT = Math.max(0, b.player.flashT - dt);
  b.player.shakeT = Math.max(0, b.player.shakeT - dt);

  if (!b.current) {
    if (b.queue.length === 0) {
      if (!b.menu) b.menu = 'main';
      return;
    }
    b.current = b.queue.shift();
    b.current.t = 0;
    startAction(state, b.current);
  }

  const a = b.current;
  a.t += dt;

  if (a.kind === 'msg') {
    b.message = a.text;
    b.awaitClick = !!a.awaitClick;
    if (a.t >= a.duration) { b.awaitClick = false; endAction(b); }
  } else if (a.kind === 'openMenu') {
    b.menu = a.menu;
    b.message = a.menu === 'main' ? 'What will you do?' : 'Choose a move.';
    endAction(b);
  } else if (a.kind === 'playerAttack') {
    runPlayerAttack(state, a, dt);
  } else if (a.kind === 'enemyTurn') {
    if (b.enemy.hp <= 0 || b.player.hp <= 0) { endAction(b); return; }
    runEnemyAttack(state, a, dt);
  } else if (a.kind === 'ballThrow') {
    runBallThrow(state, a, dt);
  } else if (a.kind === 'checkEnemyHP') {
    if (b.enemy.hp <= 0) {
      enqueue(b, { kind: 'faintEnemy' });
      // skip the queued enemy turn that follows
      b.queue = b.queue.filter((x) => x.kind !== 'enemyTurn');
    }
    endAction(b);
  } else if (a.kind === 'faintEnemy') {
    runFaint(state, a, dt, 'enemy');
  } else if (a.kind === 'faintPlayer') {
    runFaint(state, a, dt, 'player');
  } else if (a.kind === 'exit') {
    b.result = a.result || b.result;
    b.exiting = true;
    b.exitT = 0;
  }
}

function endAction(b) { b.current = null; }

function startAction(state, a) {
  const b = state.battle;
  if (a.kind === 'playerAttack') {
    b.player.shakeT = 0.18; // wind-up
  } else if (a.kind === 'enemyTurn') {
    a.move = a.move || b.enemy.moves[Math.floor(Math.random() * b.enemy.moves.length)];
  } else if (a.kind === 'ballThrow') {
    b.ball = { phase: 'fly', t: 0, x0: 60, y0: 120, x1: b.enemy.x, y1: b.enemy.y + 4, duration: 0.6 };
  }
}

// ---------------------------------------------------------------- attacks
function runPlayerAttack(state, a, dt) {
  const b = state.battle;
  if (!a.started) {
    a.started = true;
    b.message = `Emberon used ${a.move.name}!`;
    a.phase = 'announce';
    a.phaseT = 0;
  }
  a.phaseT += dt;
  const move = a.move;
  // Phase sequence: announce(0.7) → dash(0.4) → hit(0.5) → eff(1.2) → done
  if (a.phase === 'announce' && a.phaseT >= 0.7) {
    a.phase = 'dash'; a.phaseT = 0;
    b.player.offsetX = 0;
  }
  if (a.phase === 'dash') {
    const k = Math.min(1, a.phaseT / 0.4);
    b.player.offsetX = Math.sin(k * Math.PI) * 20;
    if (a.phaseT >= 0.4) {
      a.phase = 'hit'; a.phaseT = 0;
      // resolve
      const hit = Math.random() < move.acc;
      a.hit = hit;
      if (hit) {
        if (move.dmg > 0) {
          const mul = effectiveness(move.type, b.enemy.typeName);
          const atkBuff = 1 + b.player.atkBuff * 0.25;
          const dmg = Math.max(1, Math.round(move.dmg * mul * atkBuff * (0.85 + Math.random() * 0.3)));
          b.enemy.hp = Math.max(0, b.enemy.hp - dmg);
          b.enemy.flashT = 0.35; b.enemy.shakeT = 0.35;
          b.shakeScreen = 0.25;
          a.dmg = dmg;
          a.eff = mul;
        } else if (move.effect === 'lowerAtk') {
          b.enemy.atkBuff = Math.max(-2, b.enemy.atkBuff - 1);
          a.effMsg = `${b.enemy.name}'s attack fell.`;
        }
      }
    }
  } else if (a.phase === 'hit' && a.phaseT >= 0.5) {
    a.phase = 'eff'; a.phaseT = 0;
    if (!a.hit) { b.message = 'But it missed!'; }
    else if (a.effMsg) { b.message = a.effMsg; }
    else if (a.eff !== undefined) {
      const lbl = effectivenessLabel(a.eff);
      b.message = lbl || (a.dmg ? `Dealt ${a.dmg} damage.` : '');
    }
  } else if (a.phase === 'eff' && a.phaseT >= 1.0) {
    endAction(b);
  }
}

function runEnemyAttack(state, a, dt) {
  const b = state.battle;
  if (!a.started) {
    a.started = true;
    a.move = a.move || b.enemy.moves[Math.floor(Math.random() * b.enemy.moves.length)];
    b.message = `Wild ${b.enemy.name} used ${a.move.name}!`;
    a.phase = 'announce'; a.phaseT = 0;
  }
  a.phaseT += dt;
  const move = a.move;
  if (a.phase === 'announce' && a.phaseT >= 0.7) {
    a.phase = 'dash'; a.phaseT = 0;
  }
  if (a.phase === 'dash') {
    const k = Math.min(1, a.phaseT / 0.35);
    b.enemy.offsetY = Math.sin(k * Math.PI) * 14;
    if (a.phaseT >= 0.35) {
      a.phase = 'hit'; a.phaseT = 0; b.enemy.offsetY = 0;
      const hit = Math.random() < move.acc;
      a.hit = hit;
      if (hit) {
        if (move.dmg > 0) {
          const atkBuff = 1 + b.enemy.atkBuff * 0.25;
          const dmg = Math.max(1, Math.round(move.dmg * atkBuff * (0.85 + Math.random() * 0.3)));
          b.player.hp = Math.max(0, b.player.hp - dmg);
          b.player.flashT = 0.35; b.player.shakeT = 0.35;
          b.shakeScreen = 0.3;
          a.dmg = dmg;
        } else if (move.effect === 'defUp') {
          b.enemy.defBuff = Math.min(2, b.enemy.defBuff + 1);
          a.effMsg = `${b.enemy.name}'s defense rose.`;
        } else if (move.effect === 'lowerAcc') {
          a.effMsg = 'A cloud blurs your sight!';
        }
      }
    }
  } else if (a.phase === 'hit' && a.phaseT >= 0.45) {
    a.phase = 'eff'; a.phaseT = 0;
    if (!a.hit) b.message = 'But it missed!';
    else if (a.effMsg) b.message = a.effMsg;
    else if (a.dmg !== undefined) b.message = `Emberon took ${a.dmg} damage.`;
  } else if (a.phase === 'eff' && a.phaseT >= 0.95) {
    if (b.player.hp <= 0) enqueue(b, { kind: 'faintPlayer' });
    else enqueue(b, { kind: 'openMenu', menu: 'main' });
    endAction(b);
  }
}

function runFaint(state, a, dt, who) {
  const b = state.battle;
  if (!a.started) {
    a.started = true;
    if (who === 'enemy') {
      b.message = `Wild ${b.enemy.name} fainted!`;
    } else {
      b.message = 'Emberon fainted!';
    }
    a.phase = 'fall'; a.phaseT = 0;
  }
  a.phaseT += dt;
  if (a.phase === 'fall') {
    const k = Math.min(1, a.phaseT / 0.8);
    if (who === 'enemy') { b.enemy.offsetY = k * 24; b.enemy.alpha = 1 - k; }
    else { b.player.offsetX = 0; b.player.flashT = 0; }
    if (a.phaseT >= 0.8) {
      a.phase = 'wait'; a.phaseT = 0;
    }
  } else if (a.phase === 'wait' && a.phaseT >= 1.2) {
    if (who === 'enemy') {
      enqueue(b, { kind: 'exit', result: 'fainted' });
    } else {
      enqueue(b, { kind: 'exit', result: 'defeated' });
    }
    endAction(b);
  }
}

// ---------------------------------------------------------------- catch
function runBallThrow(state, a, dt) {
  const b = state.battle;
  if (!a.started) {
    a.started = true;
    a.phase = 'fly'; a.phaseT = 0;
    b.message = '';
  }
  a.phaseT += dt;

  if (a.phase === 'fly') {
    const k = Math.min(1, a.phaseT / 0.55);
    b.ball.t = k;
    if (k >= 1) {
      a.phase = 'absorb'; a.phaseT = 0;
      b.enemy.alpha = 1;
      b.flashOpacity = 0;
    }
  } else if (a.phase === 'absorb') {
    const k = Math.min(1, a.phaseT / 0.5);
    b.enemy.alpha = 1 - k;
    b.flashOpacity = Math.sin(k * Math.PI) * 0.8;
    b.ball.absorbK = k;
    if (a.phaseT >= 0.5) {
      a.phase = 'drop'; a.phaseT = 0;
      b.ball.y1Drop = b.enemy.y + 4;
    }
  } else if (a.phase === 'drop') {
    const k = Math.min(1, a.phaseT / 0.25);
    b.ball.dropY = (b.enemy.y + 4) + k * 28;
    if (a.phaseT >= 0.25) {
      a.phase = 'wobble'; a.phaseT = 0;
      a.wobbleIndex = 0;
      // determine success
      const hpFrac = b.enemy.hp / b.enemy.maxHP;
      const chance = 0.18 + 0.65 * (1 - hpFrac);
      a.success = Math.random() < chance;
      a.wobbles = a.success ? 3 : (1 + Math.floor(Math.random() * 3));
    }
  } else if (a.phase === 'wobble') {
    const total = 0.45 * a.wobbles;
    if (a.phaseT >= total) {
      if (a.success) {
        a.phase = 'success'; a.phaseT = 0;
        b.flashScreen = 0.7;
        b.message = `Gotcha! ${b.enemy.name} was caught!`;
      } else {
        a.phase = 'break'; a.phaseT = 0;
        b.message = `${b.enemy.name} broke free!`;
        b.enemy.alpha = 1;
      }
    }
  } else if (a.phase === 'success' && a.phaseT >= 1.6) {
    b.enemy.caught = true;
    enqueue(b, { kind: 'exit', result: 'caught' });
    endAction(b);
  } else if (a.phase === 'break' && a.phaseT >= 1.4) {
    b.ball = null;
    enqueue(b, { kind: 'enemyTurn' });
    endAction(b);
  }
}

// ---------------------------------------------------------------- exit
function finishExit(state) {
  const b = state.battle;
  const result = b.result || 'fled';
  // mutate arena state
  if (result === 'caught') {
    if (b.enemyRef) b.enemyRef.alive = false;
    state.player.scale = Math.min(2.6, state.player.scale + state.tune.growthPerCatch);
    state.caught += 1;
    state.flash = 0.18;
    if (state.caught >= state.totalSpawned) {
      state.won = true; state.wonAt = state.time;
    }
  } else if (result === 'fainted') {
    // KO'd — wild creature is gone, but no growth, doesn't count as caught
    if (b.enemyRef) b.enemyRef.alive = false;
    state.defeated = (state.defeated || 0) + 1;
    // still check win against total cleared
    const cleared = state.caught + (state.defeated || 0);
    if (cleared >= state.totalSpawned) {
      state.won = true; state.wonAt = state.time;
    }
  } else if (result === 'fled') {
    // creature stays in arena; brief invuln so we don't immediately re-trigger
    if (b.enemyRef) {
      b.enemyRef.scaredTimer = 1.0;
      // shove enemy a bit so the ball that triggered the battle no longer overlaps
      const dx = b.enemyRef.x - state.player.x;
      const dy = b.enemyRef.y - state.player.y;
      const m = Math.hypot(dx, dy) || 1;
      b.enemyRef.x += (dx/m) * 24;
      b.enemyRef.y += (dy/m) * 24;
    }
  } else if (result === 'defeated') {
    state.gameOver = true;
  }
  state.phase = 'arena';
  state.battle = null;
  // clear any in-flight balls
  state.balls = [];
}

// ---------------------------------------------------------------- render
function render(ctx, state) {
  const b = state.battle;

  // Animated sky background
  const t = state.time;
  ctx.save();
  // shake
  let sx = 0, sy = 0;
  if (b.shakeScreen > 0) {
    sx = (Math.random() - 0.5) * 4 * b.shakeScreen;
    sy = (Math.random() - 0.5) * 4 * b.shakeScreen;
  }
  ctx.translate(sx, sy);

  drawSky(ctx, t, state.tune.palette);

  // Enemy platform (back)
  drawPlatform(ctx, b.enemy.x, b.enemy.y, 56, 14, true);
  // Player platform (front)
  drawPlatform(ctx, b.player.x, b.player.y, 78, 18, false);

  // Sprites
  drawCreature(ctx, b.enemy);
  drawCreature(ctx, b.player, true);

  // Ball
  if (b.ball) drawBattleBall(ctx, b);

  // flash overlay
  if (b.flashOpacity > 0) {
    ctx.fillStyle = `rgba(255,255,255,${b.flashOpacity})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (b.flashScreen > 0) {
    ctx.fillStyle = `rgba(255,255,255,${b.flashScreen})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  ctx.restore();

  // Wipe-in/out (over everything)
  if (b.enterT < 1) {
    drawWipe(ctx, 1 - b.enterT, 'in');
  }
  if (b.exiting) {
    drawWipe(ctx, b.exitT, 'out');
  }
}

function drawSky(ctx, t, palette) {
  let top, bottom, stripe1, stripe2;
  if (palette === 'night') {
    top = '#0a0820'; bottom = '#1a1438'; stripe1 = '#3a2a58'; stripe2 = '#5a4280';
  } else if (palette === 'dusk') {
    top = '#3a1a4a'; bottom = '#a8424a'; stripe1 = '#e2742a'; stripe2 = '#fde26a';
  } else {
    top = '#7ebcf2'; bottom = '#cfeefe'; stripe1 = '#fde26a'; stripe2 = '#ffffff';
  }
  // vertical gradient (bands for retro)
  const bands = 12;
  for (let i = 0; i < bands; i++) {
    const k = i / (bands - 1);
    ctx.fillStyle = mix(top, bottom, k);
    ctx.fillRect(0, Math.floor(i * VIEW_H / bands), VIEW_W, Math.ceil(VIEW_H / bands));
  }
  // horizon stripe with sun
  const sunX = (VIEW_W * 0.78);
  const sunY = 60;
  ctx.fillStyle = stripe2;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stripe1;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
  ctx.fill();
  // moving clouds
  const cloudY = 30;
  for (let i = 0; i < 4; i++) {
    const x = ((t * 4 + i * 100) % (VIEW_W + 80)) - 60;
    ctx.fillStyle = palette === 'night' ? 'rgba(180,180,220,0.4)' : 'rgba(255,255,255,0.75)';
    ctx.fillRect(x, cloudY + i * 6, 30, 4);
    ctx.fillRect(x + 4, cloudY + i * 6 - 2, 22, 2);
  }
  // grass band acts as ground / horizon — sits just above the HTML bottom strip
  ctx.fillStyle = palette === 'night' ? '#0a1a14' : palette === 'dusk' ? '#4a2a3a' : '#5aa838';
  ctx.fillRect(0, 100, VIEW_W, 28);
  // lighter grass top edge
  ctx.fillStyle = palette === 'night' ? '#1a2a24' : palette === 'dusk' ? '#6a3a4a' : '#74c14a';
  ctx.fillRect(0, 100, VIEW_W, 2);
}

function mix(hexA, hexB, k) {
  const a = hex(hexA), b = hex(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * k);
  const g = Math.round(a[1] + (b[1] - a[1]) * k);
  const bb = Math.round(a[2] + (b[2] - a[2]) * k);
  return `rgb(${r},${g},${bb})`;
}
function hex(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }

function drawPlatform(ctx, cx, cy, rx, ry, isBack) {
  // chunky ellipse drawn pixel-by-pixel
  const color1 = isBack ? '#a8c08a' : '#c8a878';
  const color2 = isBack ? '#74a850' : '#a08658';
  const color3 = isBack ? '#3f7a2a' : '#6c4a28';
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(1 - (y / ry) * (y / ry)));
    let color = color2;
    if (y < -ry * 0.5) color = color1;
    else if (y > ry * 0.3) color = color3;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), Math.round(w * 2), 1);
  }
  // rim highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(Math.round(cx - rx + 4), Math.round(cy - ry), Math.round(rx * 2 - 8), 1);
}

function drawCreature(ctx, c, isPlayer) {
  const sprite = S.SPRITES[c.type || 'emberon'];
  const palette = S.PALETTES[c.type || 'emberon'];
  const w = S.spriteW(sprite), h = S.spriteH(sprite);
  let dx = (c.shakeT > 0) ? (Math.random() - 0.5) * 4 : 0;
  const ox = c.offsetX || 0;
  const oy = c.offsetY || 0;
  const ax = c.x + dx + ox;
  const ay = c.y + oy;
  const s = c.scale;

  ctx.save();
  if (c.alpha !== undefined && c.alpha < 1) ctx.globalAlpha = Math.max(0, c.alpha);

  // shadow under
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 2, (w/2) * s * 0.7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // sprite
  const flip = isPlayer ? true : false;
  S.drawSprite(ctx, sprite, palette, ax - (w/2) * s, ay - h * s + 2, s, flip);

  // white flash when hit
  if (c.flashT > 0) {
    const a = Math.min(1, c.flashT * 3);
    ctx.globalAlpha = a * (ctx.globalAlpha || 1);
    // re-stamp sprite with flat white using a tinted palette
    const whitePal = palette.map((c, i) => i === 0 ? 'transparent' : '#ffffff');
    S.drawSprite(ctx, sprite, whitePal, ax - (w/2) * s, ay - h * s + 2, s, flip);
  }

  ctx.restore();
}

function drawBattleBall(ctx, b) {
  const ball = b.ball;
  if (!ball) return;
  let x, y;
  if (b.current && b.current.kind === 'ballThrow') {
    const a = b.current;
    if (a.phase === 'fly') {
      const k = ball.t;
      x = ball.x0 + (ball.x1 - ball.x0) * k;
      const yg = ball.y0 + (ball.y1 - ball.y0) * k;
      y = yg - Math.sin(k * Math.PI) * 50;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(k * Math.PI * 4);
      S.drawSprite(ctx, S.POKEBALL_SPRITE, S.POKEBALL_PALETTE, -5, -5, 1.6);
      ctx.restore();
    } else if (a.phase === 'absorb') {
      // ball stays at enemy position, opening
      x = ball.x1; y = ball.y1;
      S.drawSprite(ctx, S.POKEBALL_SPRITE, S.POKEBALL_PALETTE, x - 8, y - 8, 1.6);
      // beam
      ctx.strokeStyle = `rgba(255,255,255,${0.8 - a.phaseT})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(b.enemy.x, b.enemy.y - 12);
      ctx.stroke();
    } else if (a.phase === 'drop') {
      x = ball.x1; y = ball.dropY;
      S.drawSprite(ctx, S.POKEBALL_SPRITE, S.POKEBALL_PALETTE, x - 8, y - 8, 1.6);
    } else if (a.phase === 'wobble') {
      x = ball.x1;
      y = (b.enemy.y + 4) + 28;
      const sway = Math.sin(a.phaseT * 12) * 0.3 * Math.max(0, 1 - a.phaseT / (0.45 * a.wobbles));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      S.drawSprite(ctx, S.POKEBALL_SPRITE, S.POKEBALL_PALETTE, -8, -8, 1.6);
      ctx.restore();
    } else if (a.phase === 'success') {
      x = ball.x1;
      y = (b.enemy.y + 4) + 28;
      S.drawSprite(ctx, S.POKEBALL_SPRITE, S.POKEBALL_PALETTE, x - 8, y - 8, 1.6);
      // sparkle stars rising
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k = (a.phaseT + i * 0.13) % 1;
        const sx = x + Math.cos(i * 1.2 + a.phaseT * 2) * 30 * k;
        const sy = y - k * 60;
        const aa = 1 - k;
        ctx.fillStyle = `rgba(253,226,106,${aa})`;
        ctx.fillRect(sx - 1, sy, 3, 1);
        ctx.fillRect(sx, sy - 1, 1, 3);
      }
    } else if (a.phase === 'break') {
      x = ball.x1;
      y = (b.enemy.y + 4) + 28;
      // ball open + flash
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 10 * (1 - a.phaseT/1.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWipe(ctx, k, dir) {
  // diagonal stripes wipe — black bars from corners
  const stripeH = Math.ceil(VIEW_H * (dir === 'in' ? k : (1 - (1 - k))));
  ctx.fillStyle = '#0b0a14';
  // top wipe
  ctx.fillRect(0, 0, VIEW_W, (dir === 'in') ? Math.ceil(VIEW_H * k * 0.5) : Math.ceil(VIEW_H * k * 0.5));
  ctx.fillRect(0, VIEW_H - Math.ceil(VIEW_H * k * 0.5), VIEW_W, Math.ceil(VIEW_H * k * 0.5));
}

// ---------------------------------------------------------------- exports
window.SDS_BATTLE = {
  enter, update, render,
  chooseAction, chooseMove, advanceMessage,
  PLAYER_MOVES, ENEMY_DATA,
};
})();
