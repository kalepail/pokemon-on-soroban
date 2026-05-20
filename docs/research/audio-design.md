# Audio Design — Pokemon on Soroban

## Summary

This document covers the audio architecture for a browser-based, multiplayer Pokemon-style game on Soroban. The goals are:

- Zero audio file dependencies (no `.wav` / `.ogg` bundle weight)
- Procedural variation so the same event never sounds exactly the same twice
- Spatial positional audio so other players' sounds come from their location on the map
- A clear volume hierarchy: the local player's sounds are the loudest; other players are quieter and positionally attenuated
- Retro-adjacent aesthetic that fits the Gen I/II vibe without being a GBA soundalike

---

## Recommended Library Stack

### Primary SFX engine: ZzFX

ZzFX (Zuper Zmall Zound Zynth) by Frank Force generates every sound via the Web Audio API from a parameter array. Under 1 KB minified, zero dependencies, MIT licensed.

```
npm install zzfx
```

Why ZzFX over alternatives:

| Option | Verdict |
|---|---|
| **ZzFX** | Perfect fit: tiny, generative, no files, built-in randomness, well-documented, js13k battle-tested |
| jsfxr | Good retro presets but less fine-grained control; works well as a design tool to export ZzFX-compatible params |
| wafxr + wasgen | More powerful synthesis but much larger API surface; better for a standalone synth instrument than game SFX |
| Tone.js | Great for generative music; overkill for SFX; large bundle |
| Howler.js | File-playback only — use only if shipped audio assets are needed later |
| Raw Web Audio API | Zero dependencies but we'd rebuild ZzFX; only worth it if we need something ZzFX can't express |

### Music layer (optional): ZzFXM

ZzFXM (by Keith Clark) is a ZzFX-based tracker for in-browser chiptune music. If background music is desired, this keeps everything in the same tiny ecosystem and lets music share the same synth primitives as SFX.

### Spatial audio: Web Audio API PannerNode

ZzFX renders directly to the Web Audio `AudioContext`. We route each remote-player sound through a `PannerNode` positioned at their world coordinates before it hits the final destination. No additional library is needed.

---

## Variation Strategy

The core technique is: one parameter set per event category, played with controlled randomness. This means sounds within a category (e.g. "move impact") share a recognizable character but never sound mechanical or robotic.

### ZzFX `randomness` parameter

The second element in a ZzFX param array controls how much the base frequency shifts on each play:

```js
// [volume, randomness, frequency, ...]
const sfx_step = [0.4, 0.08, 180, ...];   // 8% random pitch drift per play
const sfx_hit  = [0.6, 0.12, 320, ...];   // 12% drift — more variety for impacts
```

Larger `randomness` = more pitch chaos per call. Keep movement sounds around `0.05–0.10`, impact sounds around `0.08–0.15`, destruction sounds can go up to `0.2`.

### Pools: multiple base sounds per category

For events that happen very frequently (footsteps, grass rustle), define a small pool of 2–3 ZzFX parameter sets and pick one at random on each trigger. The subtle ZzFX randomness stacks on top of the pool selection for a wide variation space from nearly zero data.

```js
const pool_footstep = [
  [0.3, 0.06, 210, 0, 0.04, 0.06, 0, 1.2],
  [0.3, 0.07, 190, 0, 0.03, 0.07, 0, 1.1],
  [0.3, 0.05, 225, 0, 0.05, 0.05, 0, 1.3],
];

function play(pool) {
  zzfx(...pool[Math.floor(Math.random() * pool.length)]);
}
```

### Pitch scaling on battle moves

For moves, `zzfx` is called with a pitch multiplier derived from battle context:

- Move power tier (low/mid/high) → `0.85 / 1.0 / 1.2` pitch multiplier
- Critical hit → pitch up `+15%` and a brief silence before the impact hits
- Type effectiveness (super effective / not very effective) → slight pitch shift + volume nudge

---

## Sound Event Catalog

These are the events from the game design that need audio. Each section lists the sonic character and ZzFX parameters to tune toward.

### Movement

| Event | Character | Key ZzFX parameters |
|---|---|---|
| Footstep (grass) | Soft, dull thud + slight hiss | low freq `~180Hz`, shape=`noise`, short attack+release |
| Footstep (path/town) | Harder, brighter tap | higher freq `~280Hz`, shape=`triangle`, very short |
| Ledge drop | Impact + brief reverb tail | freq drops fast via `slide`, longer release |
| Entering grass tile | Brief rustle/swish | shape=`noise`, fast fade, moderate randomness |
| Swimming/surfing | Wet slap + bubbles | layered: noise burst + sine wobble |

### Combat — attacks and moves

Each attack type should have a genre that its sounds belong to. Same genre = same base parameter set; ZzFX randomness + pool selection = variation within the genre.

| Move type | Sonic genre | Character |
|---|---|---|
| Normal | Solid thump | Short square wave impact |
| Fire | Whoosh + crackle | Sawtooth sweep up, noise tail |
| Water | Splash + slosh | Noise burst, low-pass feel |
| Electric | Sharp zap + buzz | Tan wave, fast freq jump |
| Grass | Leaf swish | Noise + gentle sine |
| Psychic | Eerie shimmer | Sine wave with tremolo |
| Ice | Glass crack + hiss | Freq drops, noise layer |
| Fighting | Heavy punch | Square, low freq, very short |
| Poison | Gurgle/bubble | Sine wobble, slow decay |
| Ghost | Hollow wail | Sine, very low freq, long |
| Dragon | Deep roar + rumble | Low saw, pitch slide down |

For each type, define 2–3 ZzFX arrays in the pool; the `randomness` param handles fine variation within each.

### Combat — hits and reactions

| Event | Character |
|---|---|
| Hit (normal effectiveness) | Sharp impact, clean |
| Hit (super effective) | Higher pitch, more intense, brief silence before |
| Hit (not very effective) | Dampened, lower pitch, quiet |
| Hit (immune) | Dull thunk + "nothing happened" feel |
| Critical hit | Same impact sound but pitched up `+15%`, tiny pre-silence |
| Status inflicted (burn) | Sizzle, noise decay |
| Status inflicted (poison) | Gurgle, sine wobble |
| Status inflicted (paralysis) | Zap, brief silence |
| Status inflicted (sleep) | Slow sine fade |
| Self-hit (confusion) | Wobble thud |

### Pokemon fainting / getting destroyed

This is the emotional peak of the sound design. Use a 2–3 beat sequence:

1. **Hit confirmation** — the final blow lands (attack sound plays)
2. **HP zero moment** — brief silence (50–80ms)
3. **Faint sound** — descending pitch sweep, somewhat dramatic

```
Faint sound character:
- Shape: sine or triangle
- Frequency: starts ~400Hz, slides down to ~60Hz over 0.5s
- Volume: moderate (local), attenuated (remote)
- Randomness: 0.05 (consistent feel but not identical)
- Slight tremolo on the slide for that "cry fading out" effect
```

Different faint sounds for the player's own Pokemon vs opponent's Pokemon:

- **Player's Pokemon faints**: slightly somber, lower freq sweep, maybe a second longer
- **Opponent's Pokemon faints**: brighter, shorter sweep — a "defeated" sound not a "loss" sound

### World / encounter events

| Event | Character |
|---|---|
| Wild encounter trigger | Staccato rise + 3 quick beeps (classic alarm pattern) |
| Trainer encounter (exclamation) | Sharp ascending two-tone |
| Item picked up | Bright jingle, ascending arp |
| Heal at Pokemon Center | Soft multi-tone chime, gentle |
| Level up | 4-tone ascending fanfare, celebratory |
| Pokemon caught (ball shake) | 3 wobble thumps, one per shake |
| Pokemon caught (success) | 4-tone rising arp |
| Purchase (mart) | Short coin-drop chime |

---

## Volume Hierarchy and Spatial Audio

### The three tiers

```
Tier 1 — Local player (self):          GainNode at 1.0 (full)
Tier 2 — Nearby remote players:        GainNode at 0.35, + PannerNode positioned at their world xy
Tier 3 — Distant remote players:       PannerNode handles attenuation; inaudible beyond max range
```

### Audio graph for remote player sounds

```
ZzFX buffer source
      │
      ▼
 GainNode (0.35)          ← remote player volume floor
      │
      ▼
 PannerNode               ← world-space position updated from server state
      │
      ▼
 DynamicsCompressorNode   ← prevents clipping when many sounds play simultaneously
      │
      ▼
 AudioContext.destination
```

### Audio graph for local player sounds

```
ZzFX buffer source
      │
      ▼
 GainNode (1.0)           ← full volume, no positional attenuation
      │
      ▼
 DynamicsCompressorNode   ← shared bus
      │
      ▼
 AudioContext.destination
```

### PannerNode configuration

```js
panner.panningModel = 'HRTF';         // binaural for headphones; fall back to 'equalpower' on mobile
panner.distanceModel = 'linear';
panner.refDistance = 2;               // tile units — full volume within 2 tiles
panner.maxDistance = 12;             // silent beyond 12 tiles
panner.rolloffFactor = 1;

// Update on each received server position event
panner.positionX.value = remotePlayer.x;
panner.positionY.value = 0;
panner.positionZ.value = remotePlayer.y;

// AudioListener follows the local player / camera
ctx.listener.positionX.value = localPlayer.x;
ctx.listener.positionZ.value = localPlayer.y;
```

The tile coordinate system maps directly to the 3D audio space (X/Z plane, Y=0 for a top-down game). One tile = one unit. A `refDistance` of 2 means sounds from players on the same or adjacent tiles are heard at the remote player's base volume (0.35 × 1.0 = 0.35 of local); beyond that, linear rolloff to silence at 12 tiles.

### Battle-mode audio

During a battle, spatial audio is suspended — both sides are "at the same location." Remote player events in the overworld continue with positional audio, but the current player's battle sounds play on the local flat bus.

---

## Mobile / Browser Constraints

### AudioContext unlock

Browsers require a user gesture before audio plays. Create the `AudioContext` on the first user interaction (tap, key, click):

```js
let ctx;
function unlockAudio() {
  ctx = new AudioContext();
  document.removeEventListener('keydown', unlockAudio);
  document.removeEventListener('pointerdown', unlockAudio);
}
document.addEventListener('keydown', unlockAudio);
document.addEventListener('pointerdown', unlockAudio);
```

Pass `ctx` into ZzFX via `zzfxX = ctx`.

### Sound budget

Web Audio has a practical limit on simultaneous voices before it degrades. Suggested caps:

- Max simultaneous local sounds: 8 (soft cap, queue and drop oldest if exceeded)
- Max simultaneous remote sounds: 16 total (hard cap; drop sounds from most-distant players first)
- Background music tracks: 1

Use a lightweight priority queue keyed by `(tier, distance)` to evict sounds when over budget.

### Mobile `HRTF` fallback

`HRTF` panningModel is CPU-intensive. Detect mobile and switch to `equalpower`:

```js
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
panner.panningModel = isMobile ? 'equalpower' : 'HRTF';
```

---

## Design Tooling

Use these tools during sound design to get ZzFX parameter arrays without coding everything by ear:

- **ZzFX Sound Designer** — [https://killedbyapixel.github.io/ZzFX/](https://killedbyapixel.github.io/ZzFX/) — interactive 20-parameter tweaker, outputs a copy-pasteable array
- **sfxr.me** — [https://sfxr.me](https://sfxr.me) — retro preset generator (pickupCoin, laserShoot, explosion, etc.); useful for ideating sound character before porting to ZzFX params manually
- **ZzFXM Tracker** — [https://keithclark.github.io/ZzFXM/](https://keithclark.github.io/ZzFXM/) — if music tracks are added later

Workflow: design in sfxr.me or ZzFX designer → copy array → drop into a pool → tune `randomness` and verify variation at runtime.

---

## Implementation Checklist

These are the pieces needed to ship audio, roughly in order of priority:

- [ ] AudioContext initialization on first user gesture
- [ ] ZzFX integration + basic local play function
- [ ] Footstep and tile-transition sounds wired to movement events
- [ ] Attack, hit-reaction, and faint sounds wired to battle events
- [ ] Item pickup, encounter trigger, and heal sounds
- [ ] DynamicsCompressorNode on shared output bus
- [ ] GainNode volume tiers (local vs remote)
- [ ] PannerNode per remote player, updated from server position events
- [ ] Sound budget / priority queue to cap simultaneous voices
- [ ] Mobile HRTF → equalpower fallback
- [ ] AudioContext unlock on mobile gesture (if not already covered by step 1)
- [ ] (Optional) ZzFXM background music track
- [ ] (Optional) Mute/volume settings UI

---

## Sources

- [KilledByAPixel/ZzFX — GitHub](https://github.com/KilledByAPixel/ZzFX)
- [ZzFX Sound Designer](https://killedbyapixel.github.io/ZzFXM/)
- [KilledByAPixel/LittleJS — Sound API](https://killedbyapixel.github.io/LittleJS/docs/Sound.html)
- [keithclark/ZzFXM — GitHub](https://github.com/keithclark/ZzFXM)
- [MDN — Audio for Web Games](https://developer.mozilla.org/en-US/docs/Games/Techniques/Audio_for_Web_Games)
- [MDN — Web Audio Spatialization Basics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Web_audio_spatialization_basics)
- [web.dev — 3D Positional Sound for Web Games](https://web.dev/articles/webaudio-games)
- [W3C Web Audio API 1.1 Specification](https://www.w3.org/TR/webaudio/)
- [sfxr.me — Retro Sound Generator](https://sfxr.me)
