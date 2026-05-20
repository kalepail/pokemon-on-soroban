// ============ Stellar Snake — main app ============
// State machine + Game Boy device frame + all screens.

const { useState, useEffect, useRef, useCallback, useMemo } = React;
const creatureById = window.creatureById;
const CR = window.CREATURES;
const STARTER_ID = window.STARTER_ID;
const StellarIcon = window.StellarIcon;
const loadIconSprite = window.loadIconSprite;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "vibrant",
  "speed": 130,
  "boardSize": "regular",
  "muted": false
}/*EDITMODE-END*/;

// ---------- helpers ----------
const BOARD_SIZES = {
  small:   { w: 16, h: 12, cell: 24 },
  regular: { w: 22, h: 15, cell: 22 },
  large:   { w: 26, h: 18, cell: 18 },
};
const TICK_MS = 130; // snake speed

const DIRS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
  right: { dx: 1,  dy: 0  },
};
const OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Random integer in [a,b]
function rint(a, b) { return a + rand(b - a + 1); }

// ============ Screens ============

function TitleScreen({ onStart }) {
  const stellarMon = creatureById(STARTER_ID);
  return (
    <div className="title gb-palette">
      <h1 className="title-main">
        STELLAR<span className="accent-inline">MON</span>
      </h1>
      <div className="sub">CATCH 'EM · STACK 'EM</div>
      <div className="hero">
        {stellarMon && <window.CreatureSprite creature={stellarMon} />}
        <div style={{ position: "absolute", top: 22, left: -10 }}>
          <div className="sparkle" style={{ animationDelay: "0.1s" }}></div>
        </div>
        <div style={{ position: "absolute", top: 60, right: -8 }}>
          <div className="sparkle" style={{ animationDelay: "0.5s" }}></div>
        </div>
        <div style={{ position: "absolute", bottom: 12, left: 30 }}>
          <div className="sparkle" style={{ animationDelay: "0.9s" }}></div>
        </div>
      </div>
      <div className="press-start" onClick={onStart} style={{ cursor: "pointer" }}>
        PRESS START
      </div>
      <div className="footer">© 2026 SDF · v0.1</div>
    </div>
  );
}

function MapScreen({ onSelect, unlocked }) {
  const routes = [
    { id: 0, x: 0.18, y: 0.78, label: "ROUTE 1 · MEADOW",     name: "Meadow"   },
    { id: 1, x: 0.42, y: 0.58, label: "ROUTE 2 · COIN CAVE",  name: "Cave"     },
    { id: 2, x: 0.62, y: 0.40, label: "ROUTE 3 · CLOUD CITY", name: "Cloud"    },
    { id: 3, x: 0.82, y: 0.22, label: "ROUTE 4 · CHAIN GROVE",name: "Chain"    },
  ];
  const [sel, setSel] = useState(0);

  // path lines connect consecutive routes
  const lines = [];
  for (let i = 0; i < routes.length - 1; i++) {
    const a = routes[i], b = routes[i + 1];
    const ax = a.x * 100, ay = a.y * 100;
    const bx = b.x * 100, by = b.y * 100;
    const dx = (bx - ax), dy = (by - ay);
    const len = Math.sqrt(dx*dx + dy*dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    lines.push({ ax, ay, len, ang });
  }

  return (
    <div className="map-screen">
      <div className="gb-header">
        <span>TRAINER MAP</span>
        <span className="right">{`▶ ${routes[sel].name}`}</span>
      </div>
      <div className="map-board">
        {lines.map((l, i) => (
          <div
            key={i}
            className="route-line"
            style={{
              left: `${l.ax}%`,
              top: `${l.ay}%`,
              width: `${l.len}%`,
              transform: `rotate(${l.ang}deg)`,
            }}
          />
        ))}
        {routes.map((r, i) => {
          const locked = i > unlocked;
          return (
            <div
              key={r.id}
              className={"route-node " + (sel === i ? "selected" : "") + (locked ? " locked" : "")}
              style={{
                left: `calc(${r.x * 100}% - 24px)`,
                top:  `calc(${r.y * 100}% - 24px)`,
              }}
              onClick={() => !locked && (sel === i ? onSelect(r.id) : setSel(i))}
            >
              {locked ? "?" : (i + 1)}
            </div>
          );
        })}
        <div className="route-label" style={{ left: "8px", bottom: "8px" }}>
          {routes[sel].label}
        </div>
      </div>
      <div className="gb-header" style={{ borderBottom: 0, borderTop: "2px solid var(--gb-0)", marginTop: 0, paddingTop: 6 }}>
        <span>A · ENTER</span>
        <span className="right">D-PAD · MOVE</span>
      </div>
    </div>
  );
}

// ---------- Game board ----------

function makeInitialSnake(B) {
  // 3-segment snake going right
  const cy = Math.floor(B.h / 2);
  return [
    { x: 5, y: cy },
    { x: 4, y: cy },
    { x: 3, y: cy },
  ];
}

function placeBerry(snake, wilds, B) {
  while (true) {
    const x = rand(B.w);
    const y = rand(B.h);
    if (snake.some(s => s.x === x && s.y === y)) continue;
    if (wilds.some(w => w.x === x && w.y === y)) continue;
    return { x, y };
  }
}

function placeWild(snake, wilds, berry, pool, B) {
  while (true) {
    const x = rand(B.w);
    const y = rand(B.h);
    if (snake.some(s => s.x === x && s.y === y)) continue;
    if (wilds.some(w => w.x === x && w.y === y)) continue;
    if (berry && berry.x === x && berry.y === y) continue;
    // not too close to head
    const h = snake[0];
    if (Math.abs(x - h.x) + Math.abs(y - h.y) < 3) continue;
    const c = pick(pool);
    return { x, y, creatureId: c.id, hp: c.hp, maxHp: c.hp };
  }
}

function GameScreen({ routeId, lead, onEncounter, onGameOver, onPauseToggle, paused, score, setScore, caught, frameKey, tickMs, boardSize, lives }) {
  const B = BOARD_SIZES[boardSize] || BOARD_SIZES.regular;
  const [snake, setSnake] = useState(() => makeInitialSnake(B));
  const [dir, setDir] = useState("right");
  const [nextDir, setNextDir] = useState("right");
  const [berry, setBerry] = useState(() => placeBerry(makeInitialSnake(B), [], B));
  const [shake, setShake] = useState(false);

  // wild creature pool: exclude the player's lead
  const pool = useMemo(
    () => CR.filter(c => c.id !== lead.id),
    [lead.id]
  );

  const [wilds, setWilds] = useState(() => {
    const s = makeInitialSnake(B);
    const w1 = placeWild(s, [], null, pool, B);
    const w2 = placeWild(s, [w1], null, pool, B);
    return [w1, w2];
  });

  const dirRef = useRef(dir);
  const nextDirRef = useRef(nextDir);
  const deadRef = useRef(false);
  useEffect(() => { dirRef.current = dir; }, [dir]);
  useEffect(() => { nextDirRef.current = nextDir; }, [nextDir]);

  // Keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (paused) {
        if (e.key === "Escape" || e.key === "p" || e.key === "P" || e.key === "Enter") {
          e.preventDefault();
          onPauseToggle();
        }
        return;
      }
      const map = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
        w: "up", s: "down", a: "left", d: "right",
        W: "up", S: "down", A: "left", D: "right",
      };
      const nd = map[e.key];
      if (nd) {
        e.preventDefault();
        if (nd !== OPPOSITE[dirRef.current]) setNextDir(nd);
      } else if (e.key === "Escape" || e.key === "p" || e.key === "P" || e.key === "Enter") {
        e.preventDefault();
        onPauseToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, onPauseToggle]);

  // Tick loop
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      if (deadRef.current) return;
      setSnake(prevSnake => {
        const d = nextDirRef.current;
        dirRef.current = d;
        setDir(d);
        const head = prevSnake[0];
        const { dx, dy } = DIRS[d];
        const newHead = { x: head.x + dx, y: head.y + dy };

        // wall collision
        if (newHead.x < 0 || newHead.x >= B.w || newHead.y < 0 || newHead.y >= B.h) {
          deadRef.current = true;
          if (window.SnakeAudio) window.SnakeAudio.sfx("hit");
          setShake(true);
          setTimeout(() => onGameOver("WALL"), 350);
          return prevSnake;
        }
        // self collision
        if (prevSnake.some((s, i) => i !== prevSnake.length - 1 && s.x === newHead.x && s.y === newHead.y)) {
          deadRef.current = true;
          if (window.SnakeAudio) window.SnakeAudio.sfx("hit");
          setShake(true);
          setTimeout(() => onGameOver("SELF"), 350);
          return prevSnake;
        }

        // wild collision - enter encounter (don't move snake into wild's cell)
        const wildIdx = wilds.findIndex(w => w.x === newHead.x && w.y === newHead.y);
        if (wildIdx >= 0) {
          const wild = wilds[wildIdx];
          if (window.SnakeAudio) window.SnakeAudio.sfx("encounter");
          // remove wild from list before encounter
          setWilds(ws => ws.filter((_, i) => i !== wildIdx));
          setTimeout(() => onEncounter(wild, wildIdx), 0);
          return prevSnake;
        }

        // berry eat?
        let ateBerry = false;
        let nb = berry;
        if (berry && newHead.x === berry.x && newHead.y === berry.y) {
          ateBerry = true;
          if (window.SnakeAudio) window.SnakeAudio.sfx("eat");
          setScore(s => s + 10);
          nb = placeBerry([newHead, ...prevSnake], wilds, B);
          setBerry(nb);
        }
        // grow or move
        const newSnake = ateBerry
          ? [newHead, ...prevSnake]
          : [newHead, ...prevSnake.slice(0, -1)];

        // occasionally spawn another wild
        if (wilds.length < 3 && Math.random() < 0.04) {
          const w = placeWild(newSnake, wilds, nb, pool, B);
          setWilds(ws => [...ws, w]);
        }

        return newSnake;
      });
    }, tickMs || TICK_MS);
    return () => clearInterval(id);
  }, [paused, berry, wilds, pool, onEncounter, onGameOver, setScore, tickMs]);

  // Build grid
  const head = snake[0];
  const cells = [];
  for (let y = 0; y < B.h; y++) {
    for (let x = 0; x < B.w; x++) {
      const isHead = head.x === x && head.y === y;
      const bodyIdx = snake.findIndex((s, i) => i > 0 && s.x === x && s.y === y);
      const isTail = bodyIdx === snake.length - 1;
      const isBerry = berry && berry.x === x && berry.y === y;
      const wild = wilds.find(w => w.x === x && w.y === y);
      let cls = "cell";
      let attrs = {};
      let content = null;
      if (isHead) {
        cls += " snake-head";
        attrs["data-dir"] = dir;
      } else if (bodyIdx > 0) {
        cls += isTail ? " snake-tail" : " snake-body";
      } else if (wild) {
        cls += " wild";
        const cre = creatureById(wild.creatureId);
        content = (
          <div className="wild-spr gb-palette">
            <window.CreatureSprite creature={cre} />
          </div>
        );
      } else if (isBerry) {
        cls += " berry";
      }
      cells.push(
        <div key={`${x}-${y}`} className={cls} {...attrs}>
          {content}
        </div>
      );
    }
  }

  return (
    <div className="game-screen">
      <div className="hud">
        <div className="group">
          <span><span className="label">SCR</span>{String(score).padStart(5, "0")}</span>
          <span><span className="label">LEN</span>{String(snake.length).padStart(2, "0")}</span>
        </div>
        <div className="group">
          <span className="lives" title="Lives remaining">
            <span className="label">LIVES</span>
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={"heart" + (i < lives ? " on" : " off")}>♥</span>
            ))}
          </span>
          <span><span className="label">DEX</span>{String(caught.length).padStart(2, "0")}/{CR.length}</span>
        </div>
      </div>
      <div className="board-wrap">
        <div
          className={"board" + (shake ? " shake" : "")}
          style={{
            gridTemplateColumns: `repeat(${B.w}, ${B.cell}px)`,
            gridTemplateRows: `repeat(${B.h}, ${B.cell}px)`,
          }}
          key={frameKey}
        >
          {cells}
        </div>
      </div>
    </div>
  );
}

// ---------- Battle screen ----------
function BattleScreen({ wild, lead, onWin, onCatch, onFlee, onKO }) {
  const wildC = creatureById(wild.creatureId);
  const [wildHp, setWildHp] = useState(wild.hp);
  const [playerHp, setPlayerHp] = useState(lead.curHp || lead.hp);
  const [msg, setMsg] = useState(`A wild ${wildC.name} appeared!`);
  const [menu, setMenu] = useState(0); // 0..3 selected option
  const [phase, setPhase] = useState("intro"); // intro|menu|playerAct|enemyAct|catching|won|fled
  const [foeShake, setFoeShake] = useState(false);
  const [foeFlee, setFoeFlee] = useState(false);
  const [ballState, setBallState] = useState(null); // null|throw|wiggle|caught|broke
  const [showFlash, setShowFlash] = useState(false);

  // wait briefly then open menu
  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => {
        setMsg(`What will ${lead.name} do?`);
        setPhase("menu");
      }, 1100);
      return () => clearTimeout(t);
    }
  }, [phase, lead.name]);

  const OPTIONS = ["FIGHT", "CATCH", "ITEM", "RUN"];

  function attack() {
    setPhase("playerAct");
    setMsg(`${lead.name} used ${lead.type} STRIKE!`);
    setFoeShake(true);
    setTimeout(() => setFoeShake(false), 400);
    setTimeout(() => {
      const dmg = lead.atk + rint(-2, 3);
      const newHp = Math.max(0, wildHp - dmg);
      setWildHp(newHp);
      setTimeout(() => {
        if (newHp === 0) {
          setMsg(`${wildC.name} fainted!`);
          setFoeFlee(true);
          setTimeout(() => onKO(wildC), 900);
        } else {
          enemyTurn(newHp);
        }
      }, 700);
    }, 400);
  }

  function enemyTurn(curWildHp) {
    setMsg(`${wildC.name} fights back!`);
    setPhase("enemyAct");
    setTimeout(() => {
      const dmg = Math.max(1, Math.floor(wildC.atk * 0.5) + rint(-1, 2));
      const newP = Math.max(0, playerHp - dmg);
      setPlayerHp(newP);
      if (newP === 0) {
        setMsg(`${lead.name} fainted!`);
        setTimeout(() => onFlee("ko"), 1100);
      } else {
        setMsg(`What will ${lead.name} do?`);
        setPhase("menu");
        setMenu(0);
      }
    }, 700);
  }

  function tryCatch() {
    setPhase("catching");
    setMsg(`Threw a STELLR BALL!`);
    setBallState("throw");
    setTimeout(() => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
      setBallState("wiggle");
      // catch probability
      const pct = clamp(1 - wildHp / wildC.hp, 0, 1);
      const chance = 0.35 + pct * 0.55; // 35-90%
      const success = Math.random() < chance;
      setTimeout(() => {
        if (success) {
          setMsg(`Gotcha! ${wildC.name} was caught!`);
          setTimeout(() => onCatch(wildC), 1200);
        } else {
          setMsg(`Oh no! ${wildC.name} broke free!`);
          setBallState(null);
          setFoeShake(true);
          setTimeout(() => setFoeShake(false), 400);
          setTimeout(() => enemyTurn(wildHp), 900);
        }
      }, 1200);
    }, 700);
  }

  function runAway() {
    setMsg(`Got away safely!`);
    setPhase("fled");
    setTimeout(() => onFlee("run"), 900);
  }

  function useItem() {
    setMsg(`The bag is empty! Pick BERRIES first.`);
    setTimeout(() => {
      setMsg(`What will ${lead.name} do?`);
    }, 1200);
  }

  function pickAction() {
    if (phase !== "menu") return;
    if (OPTIONS[menu] === "FIGHT") attack();
    else if (OPTIONS[menu] === "CATCH") tryCatch();
    else if (OPTIONS[menu] === "ITEM") useItem();
    else if (OPTIONS[menu] === "RUN") runAway();
  }

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== "menu") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); setMenu(m => (m % 2 === 1 ? m - 1 : m)); }
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); setMenu(m => (m % 2 === 0 ? m + 1 : m)); }
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); setMenu(m => (m >= 2 ? m - 2 : m)); }
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); setMenu(m => (m < 2 ? m + 2 : m)); }
      else if (e.key === "Enter" || e.key === " " || e.key === "z" || e.key === "Z") { e.preventDefault(); pickAction(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, menu, pickAction]);

  return (
    <div className="battle gb-palette">
      <div className="battle-arena">
        {/* HP bars */}
        <div className="hpbar foe">
          <div className="name"><span>{wildC.name}</span><span className="lvl">Lv.{Math.floor(wildC.atk + wildC.hp/3)}</span></div>
          <div className="bar-row">
            <span>HP</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(wildHp/wildC.hp)*100}%` }} /></div>
          </div>
        </div>
        <div className="hpbar player">
          <div className="name"><span>{lead.name}</span><span className="lvl">Lv.{Math.floor(lead.atk + lead.hp/3)}</span></div>
          <div className="bar-row">
            <span>HP</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(playerHp/lead.hp)*100}%` }} /></div>
          </div>
          <div className="hp-num">{playerHp}/{lead.hp}</div>
        </div>

        {/* Platforms */}
        <div className="mon-platform foe" />
        <div className="mon-platform player" />

        {/* Sprites */}
        {!foeFlee && (
          <div className={"foe-mon enter" + (foeShake ? " shake" : "")}>
            <window.CreatureSprite creature={wildC} />
          </div>
        )}
        {foeFlee && (
          <div className="foe-mon flee">
            <window.CreatureSprite creature={wildC} />
          </div>
        )}
        <div className="player-mon enter">
          <window.CreatureSprite creature={lead} />
        </div>

        {/* Catch ball */}
        {ballState === "throw" && (
          <div className="ball throw">
            <div className="top" /><div className="bot" /><div className="belt" /><div className="btn" />
          </div>
        )}
        {ballState === "wiggle" && (
          <div className="ball wiggle" style={{ left: 420, top: 90 }}>
            <div className="top" /><div className="bot" /><div className="belt" /><div className="btn" />
          </div>
        )}
        {showFlash && <div className="flash-white" />}
      </div>

      <div className="battle-msg">
        <div className="msg-text">
          {msg}
          {phase !== "menu" && phase !== "catching" && <div className="caret" />}
        </div>
        {phase === "menu" && (
          <div className="menu">
            {OPTIONS.map((opt, i) => (
              <button
                key={opt}
                className={menu === i ? "selected" : ""}
                onClick={() => { setMenu(i); setTimeout(() => pickAction(), 50); }}
              >{opt}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Catch popup ----------
function CatchPopup({ creature, onContinue }) {
  useEffect(() => {
    const t = setTimeout(onContinue, 2800);
    return () => clearTimeout(t);
  }, [onContinue]);
  return (
    <div className="catch-popup gb-palette">
      <h2>{creature.name}<br />was added to<br />your STELLARDEX!</h2>
      <div className="portrait-big">
        <window.CreatureSprite creature={creature} />
        <div className="sparkle" style={{ top: 10, left: 10 }} />
        <div className="sparkle" style={{ top: 20, right: 16, animationDelay: ".3s" }} />
        <div className="sparkle" style={{ bottom: 30, left: 24, animationDelay: ".6s" }} />
        <div className="sparkle" style={{ bottom: 14, right: 20, animationDelay: ".9s" }} />
      </div>
      <div className="info-line">
        TYPE · {creature.type}<br />
        HP · {creature.hp}  ATK · {creature.atk}
      </div>
    </div>
  );
}

// ---------- Pause menu ----------
function PauseMenu({ onResume, onCollection, onMap, onTitle }) {
  const items = [
    { label: "RESUME",    fn: onResume },
    { label: "STELLARDEX", fn: onCollection },
    { label: "TRAINER MAP", fn: onMap },
    { label: "QUIT GAME", fn: onTitle },
  ];
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); setSel(s => (s - 1 + items.length) % items.length); }
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); setSel(s => (s + 1) % items.length); }
      else if (e.key === "Enter" || e.key === " " || e.key === "z" || e.key === "Z") { e.preventDefault(); items[sel].fn(); }
      else if (e.key === "Escape" || e.key === "p" || e.key === "P") { e.preventDefault(); onResume(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);
  return (
    <div className="pause-overlay">
      <div className="pause-menu">
        <h2>PAUSE</h2>
        <ul>
          {items.map((it, i) => (
            <li key={it.label} className={sel === i ? "selected" : ""} onClick={() => it.fn()}>
              {it.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- Game over ----------
function GameOver({ score, caught, onRetry, onTitle, reason }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "z" || e.key === "Z") { e.preventDefault(); onRetry(); }
      else if (e.key === "Escape") { e.preventDefault(); onTitle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="gameover" onClick={onRetry}>
      <h1>GAME OVER</h1>
      <div className="stats">
        <div className="row"><span>SCORE</span><span>{String(score).padStart(5, "0")}</span></div>
        <div className="row"><span>CAUGHT</span><span>{caught.length}/{CR.length}</span></div>
        <div className="row"><span>REASON</span><span>{reason === "WALL" ? "HIT WALL" : reason === "SELF" ? "ATE TAIL" : "FAINTED"}</span></div>
      </div>
      <div className="cta">▶ PRESS A / CLICK TO RETRY</div>
    </div>
  );
}

// ---------- Stellardex ----------
function Stellardex({ caught, onBack }) {
  const [sel, setSel] = useState(0);
  const visible = CR;
  useEffect(() => {
    const onKey = (e) => {
      const cols = 5;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); setSel(s => Math.min(visible.length - 1, s + 1)); }
      else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { e.preventDefault(); setSel(s => Math.min(visible.length - 1, s + cols)); }
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { e.preventDefault(); setSel(s => Math.max(0, s - cols)); }
      else if (e.key === "Escape" || e.key === "Enter" || e.key === " " || e.key === "b" || e.key === "B") { e.preventDefault(); onBack(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selC = visible[sel];
  const isCaught = caught.includes(selC.id);

  return (
    <div className="collection gb-palette">
      <div className="gb-header">
        <span>STELLARDEX</span>
        <span className="right">{caught.length}/{CR.length} CAUGHT</span>
      </div>
      <div className="dex-grid">
        {visible.map((c, i) => {
          const got = caught.includes(c.id);
          return (
            <div
              key={c.id}
              className={"dex-cell " + (sel === i ? "selected " : "") + (got ? "" : "locked")}
              onClick={() => setSel(i)}
            >
              <div className="num">#{String(i + 1).padStart(3, "0")}</div>
              {got ? <window.CreatureSprite creature={c} /> : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "var(--gb-1)" }}>?</div>}
            </div>
          );
        })}
      </div>
      <div className="dex-detail">
        <div className="portrait" style={{ background: isCaught ? "var(--gb-3)" : "var(--gb-1)" }}>
          {isCaught && <window.CreatureSprite creature={selC} />}
        </div>
        <div className="info">
          <div className="name">{isCaught ? `#${String(sel + 1).padStart(3, "0")} ${selC.name}` : "????????"}</div>
          <div className="meta">
            {isCaught ? `TYPE ${selC.type}  HP ${selC.hp}  ATK ${selC.atk}` : "DATA NOT FOUND"}
          </div>
          <div className="desc">{isCaught ? selC.desc : "Catch this STELLARMON to see its entry."}</div>
        </div>
      </div>
      <div className="gb-header" style={{ borderBottom: 0, borderTop: "2px solid var(--gb-0)" }}>
        <span>D-PAD · BROWSE</span>
        <span className="right">B · BACK</span>
      </div>
    </div>
  );
}

// ---------- Life lost overlay ----------
function LifeLostOverlay({ reason, livesLeft }) {
  const labelByReason = {
    WALL: "HIT A WALL",
    SELF: "ATE YOUR TAIL",
    KO:   "FAINTED IN BATTLE",
  };
  return (
    <div className="life-lost gb-palette">
      <div className="life-lost-inner">
        <div className="life-lost-title">OH NO!</div>
        <div className="life-lost-reason">{labelByReason[reason] || "BLACKED OUT"}</div>
        <div className="life-lost-hearts">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={"heart big" + (i < livesLeft ? " on" : " off")}>♥</span>
          ))}
        </div>
        <div className="life-lost-msg">
          {livesLeft === 1 && "LAST LIFE!"}
          {livesLeft === 2 && "TWO LIVES LEFT"}
          {livesLeft >= 3 && "RESPAWNING…"}
        </div>
      </div>
    </div>
  );
}

// ============ Device frame ============
function GameBoyFrame({ children, onDpad, onA, onB, onStart, onSelect, activeDir }) {
  return (
    <div className="gb-device">
      <div className="gb-led" />
      <div className="gb-led-label">POWER</div>
      <div className="gb-brand">
        <span className="mark">STELLAR</span>
        <span className="dot">★</span>
        <span className="mark">DOTBOY</span>
      </div>

      <div className="gb-bezel">
        <div className="gb-screen">
          {children}
        </div>
      </div>

      <div className="gb-controls">
        {/* D-pad */}
        <div className="gb-dpad">
          <button className={"dpad-btn up" + (activeDir === "up" ? " active" : "")}    onMouseDown={() => onDpad("up")}><span className="dpad-arrow up" /></button>
          <button className={"dpad-btn down" + (activeDir === "down" ? " active" : "")}  onMouseDown={() => onDpad("down")}><span className="dpad-arrow down" /></button>
          <button className={"dpad-btn left" + (activeDir === "left" ? " active" : "")}  onMouseDown={() => onDpad("left")}><span className="dpad-arrow left" /></button>
          <button className={"dpad-btn right" + (activeDir === "right" ? " active" : "")} onMouseDown={() => onDpad("right")}><span className="dpad-arrow right" /></button>
        </div>

        {/* A B */}
        <div className="gb-ab">
          <button className="ab-btn" onClick={onB}><span className="label">B</span>B</button>
          <button className="ab-btn" onClick={onA}><span className="label">A</span>A</button>
        </div>

        {/* Start/Select */}
        <div className="gb-startsel">
          <button className="ss-btn" onClick={onSelect}><span className="label">SELECT</span></button>
          <button className="ss-btn" onClick={onStart}><span className="label">START</span></button>
        </div>

        {/* Speaker */}
        <div className="gb-speaker">
          {Array.from({ length: 24 }).map((_, i) => <div key={i} />)}
        </div>
      </div>
    </div>
  );
}

// ============ App ============
function App() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Apply data-palette to body
  useEffect(() => {
    document.body.setAttribute("data-palette", t.palette);
  }, [t.palette]);

  // Sync audio mute with tweak
  useEffect(() => {
    if (window.SnakeAudio) window.SnakeAudio.setMuted(!!t.muted);
  }, [t.muted]);

  // Audio context needs a user gesture to start. Init on first click anywhere.
  useEffect(() => {
    const init = () => {
      if (window.SnakeAudio) {
        window.SnakeAudio.init();
        window.SnakeAudio.setMuted(!!t.muted);
      }
    };
    window.addEventListener("pointerdown", init, { once: true });
    window.addEventListener("keydown", init, { once: true });
    return () => {
      window.removeEventListener("pointerdown", init);
      window.removeEventListener("keydown", init);
    };
  }, []);

  // Music — switch tracks based on screen state.
  useEffect(() => {
    const A = window.SnakeAudio;
    if (!A) return;
    if (t.muted) { A.stop(); return; }
    if (screen === "title")       A.playLoop("title");
    else if (screen === "map")    A.playLoop("route");
    else if (screen === "game" || screen === "pause") A.playLoop("route");
    else if (screen === "battle") A.playLoop("battle");
    else if (screen === "catch")  { A.stop(); A.playJingle("catch"); }
    else if (screen === "gameover") { A.stop(); A.playJingle("gameover"); }
    else if (screen === "lifeLost") { A.stop(); A.playJingle("lifeLost"); }
  }, [screen, t.muted]);

  const [screen, setScreen] = useState("loading"); // loading|title|map|game|battle|catch|gameover|pause|dex|lifeLost
  const [returnTo, setReturnTo] = useState("title");
  const [unlocked, setUnlocked] = useState(0); // route highest unlocked
  const [routeId, setRouteId] = useState(0);
  const [score, setScore] = useState(0);
  const [caught, setCaught] = useState([STARTER_ID]); // list of creature ids
  const [encounterWild, setEncounterWild] = useState(null);
  const [gameOverReason, setGameOverReason] = useState(null);
  const [activeDir, setActiveDir] = useState(null);
  const [gameKey, setGameKey] = useState(0); // bump to reset game
  const [lives, setLives] = useState(3);
  const [lastLossReason, setLastLossReason] = useState(null);
  const [lead, setLead] = useState(() => {
    const c = creatureById(STARTER_ID);
    return { ...c, curHp: c.hp };
  });

  // load icon sprite
  useEffect(() => {
    loadIconSprite().then(() => setScreen("title"));
  }, []);

  // Synthetic dpad press
  function dpadPress(d) {
    setActiveDir(d);
    setTimeout(() => setActiveDir(null), 120);
    // dispatch arrow key
    const map = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
    const ev = new KeyboardEvent("keydown", { key: map[d], bubbles: true });
    window.dispatchEvent(ev);
  }
  function aPress() {
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    window.dispatchEvent(ev);
    if (screen === "title") setScreen("map");
  }
  function bPress() {
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.dispatchEvent(ev);
    if (screen === "dex" || screen === "map") setScreen(returnTo);
  }
  function startPress() {
    if (screen === "game") setScreen("pause");
    else if (screen === "pause") setScreen("game");
    else if (screen === "title") setScreen("map");
  }
  function selectPress() {
    if (screen === "game" || screen === "pause") {
      setReturnTo(screen === "pause" ? "game" : "game");
      setScreen("dex");
    }
  }

  // Encounter triggered from game
  const onEncounter = useCallback((wild) => {
    setEncounterWild(wild);
    setScreen("battle");
  }, []);

  const onGameOver = useCallback((reason) => {
    setLastLossReason(reason);
    setLives(prev => {
      const next = prev - 1;
      if (next <= 0) {
        setGameOverReason(reason);
        setScreen("gameover");
      } else {
        setScreen("lifeLost");
      }
      return next;
    });
  }, []);

  // After "lifeLost" overlay, respawn the snake on a fresh board
  useEffect(() => {
    if (screen !== "lifeLost") return;
    const t = setTimeout(() => {
      setGameKey(k => k + 1);
      setScreen("game");
    }, 1600);
    return () => clearTimeout(t);
  }, [screen]);

  // Battle handlers
  const onCatch = (wildCreature) => {
    setCaught(prev => prev.includes(wildCreature.id) ? prev : [...prev, wildCreature.id]);
    setEncounterWild(null);
    setScreen("catch");
  };
  const onWin = () => { setEncounterWild(null); setScreen("game"); };
  const onKO = (wildC) => {
    setScore(s => s + 50);
    setEncounterWild(null);
    setScreen("game");
  };
  const onFlee = (kind) => {
    if (kind === "ko") {
      // Use lives system so KO consumes a life like other deaths
      setEncounterWild(null);
      onGameOver("KO");
    } else {
      setEncounterWild(null);
      setScreen("game");
    }
  };

  function restart() {
    setScore(0);
    setCaught([STARTER_ID]);
    setLives(3);
    setLastLossReason(null);
    const c = creatureById(STARTER_ID);
    setLead({ ...c, curHp: c.hp });
    setGameKey(k => k + 1);
    setScreen("map");
  }

  return (
    <React.Fragment>
    <GameBoyFrame
      activeDir={activeDir}
      onDpad={dpadPress}
      onA={aPress}
      onB={bPress}
      onStart={startPress}
      onSelect={selectPress}
    >
      <div className="screen-content">
        {screen === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--gb-0)", fontSize: 11 }}>
            <div>LOADING</div>
            <div className="sparkle" />
          </div>
        )}
        {screen === "title" && <TitleScreen onStart={() => setScreen("map")} />}
        {screen === "map" && <MapScreen unlocked={unlocked} onSelect={(rid) => { setRouteId(rid); setLives(3); setLastLossReason(null); setGameKey(k => k + 1); setScreen("game"); }} />}
        {(screen === "game" || screen === "pause") && (
          <GameScreen
            routeId={routeId}
            lead={lead}
            paused={screen === "pause"}
            tickMs={t.speed}
            boardSize={t.boardSize}
            lives={lives}
            onEncounter={onEncounter}
            onGameOver={onGameOver}
            onPauseToggle={() => setScreen(s => s === "pause" ? "game" : "pause")}
            score={score}
            setScore={setScore}
            caught={caught}
            frameKey={gameKey}
          />
        )}
        {screen === "pause" && (
          <PauseMenu
            onResume={() => setScreen("game")}
            onCollection={() => { setReturnTo("pause"); setScreen("dex"); }}
            onMap={() => setScreen("map")}
            onTitle={() => setScreen("title")}
          />
        )}
        {screen === "battle" && encounterWild && (
          <BattleScreen
            wild={encounterWild}
            lead={lead}
            onWin={onWin}
            onCatch={onCatch}
            onFlee={onFlee}
            onKO={onKO}
          />
        )}
        {screen === "lifeLost" && (
          <LifeLostOverlay
            reason={lastLossReason}
            livesLeft={lives}
          />
        )}
        {screen === "catch" && (
          <CatchPopup
            creature={creatureById(caught[caught.length - 1])}
            onContinue={() => setScreen("game")}
          />
        )}
        {screen === "dex" && <Stellardex caught={caught} onBack={() => setScreen(returnTo)} />}
        {screen === "gameover" && (
          <GameOver
            score={score}
            caught={caught}
            reason={gameOverReason}
            onRetry={restart}
            onTitle={() => setScreen("title")}
          />
        )}
      </div>
    </GameBoyFrame>
    <window.TweaksPanel>
      <window.TweakSection label="Palette" />
      <window.TweakRadio
        label="Theme"
        value={t.palette}
        options={["vibrant", "mono", "berry", "cosmic"]}
        onChange={(v) => setTweak("palette", v)}
      />
      <window.TweakSection label="Gameplay" />
      <window.TweakRadio
        label="Board size"
        value={t.boardSize}
        options={["small", "regular", "large"]}
        onChange={(v) => { setTweak("boardSize", v); setGameKey(k => k + 1); }}
      />
      <window.TweakSlider
        label="Speed"
        value={t.speed}
        min={60}
        max={240}
        step={10}
        unit="ms"
        onChange={(v) => setTweak("speed", v)}
      />
      <window.TweakSection label="Audio" />
      <window.TweakToggle
        label="Mute music & SFX"
        value={t.muted}
        onChange={(v) => setTweak("muted", v)}
      />
    </window.TweaksPanel>
    </React.Fragment>
  );
}

window.App = App;
