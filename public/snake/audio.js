// ============ Stellar Snake — Chiptune music engine ============
// Original square-wave compositions in Game Boy style.
// All melodies written for this project — not derived from any existing music.

(function () {
  const NOTE_NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(note) {
    if (!note || note === "-") return 0;
    const m = note.match(/^([A-G])(#|b)?(\d)$/);
    if (!m) return 0;
    let n = NOTE_NAMES[m[1]];
    if (m[2] === "#") n++;
    if (m[2] === "b") n--;
    const midi = n + (parseInt(m[3], 10) + 1) * 12;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Build a pulse wave with given duty cycle (e.g. 0.125, 0.25, 0.5).
  function pulseWave(ctx, duty) {
    const harmonics = 32;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let n = 1; n < harmonics; n++) {
      const a = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      imag[n] = a;
    }
    return ctx.createPeriodicWave(real, imag);
  }

  class Synth {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.bus = { lead: null, harm: null, bass: null, noise: null };
      this.muted = false;
      this.volume = 0.16;
      this.currentTrack = null;
      this.loopTimeoutId = null;
      this.waves = null;
      this.noiseBuf = null;
    }

    init() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // Light lowpass to soften aliasing
      this.lowpass = this.ctx.createBiquadFilter();
      this.lowpass.type = "lowpass";
      this.lowpass.frequency.value = 5500;
      this.lowpass.Q.value = 0.6;
      this.master.connect(this.lowpass);
      this.lowpass.connect(this.ctx.destination);
      this.waves = {
        pulse25: pulseWave(this.ctx, 0.25),
        pulse12: pulseWave(this.ctx, 0.125),
      };
      // Noise buffer for drums
      const sr = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, sr * 0.4, sr);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    setMuted(m) {
      this.muted = m;
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.05);
      }
    }

    note({ freq: f, start, dur, type = "pulse25", vol = 0.4 }) {
      if (!f || !this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      if (type === "pulse25") osc.setPeriodicWave(this.waves.pulse25);
      else if (type === "pulse12") osc.setPeriodicWave(this.waves.pulse12);
      else if (type === "triangle") osc.type = "triangle";
      else if (type === "square") osc.type = "square";
      else osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, start);
      // simple envelope: snappy attack, decay tail
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.005);
      g.gain.setValueAtTime(vol, start + Math.max(0.01, dur * 0.7));
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    }

    drum({ start, dur = 0.08, vol = 0.3 }) {
      if (!this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const g = this.ctx.createGain();
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2000;
      g.gain.setValueAtTime(vol, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(start);
      src.stop(start + dur + 0.02);
    }

    // Schedule a single sequence of notes. Returns total duration in seconds.
    // seq: array of { n: "C5"|"-", l: lengthIn16ths, t?: type, v?: vol }
    schedule(seq, bpm, startTime, type = "pulse25", vol = 0.4) {
      const sixteenth = 60 / bpm / 4;
      let pos = startTime;
      for (const ev of seq) {
        const dur = ev.l * sixteenth;
        if (ev.n && ev.n !== "-") {
          this.note({
            freq: freq(ev.n),
            start: pos,
            dur: dur * 0.95,
            type: ev.t || type,
            vol: ev.v != null ? ev.v : vol,
          });
        }
        pos += dur;
      }
      return pos - startTime;
    }

    scheduleDrums(seq, bpm, startTime) {
      const sixteenth = 60 / bpm / 4;
      let pos = startTime;
      for (const ev of seq) {
        if (ev.n === "x") this.drum({ start: pos, dur: 0.04, vol: 0.18 });
        else if (ev.n === "X") this.drum({ start: pos, dur: 0.08, vol: 0.26 });
        pos += ev.l * sixteenth;
      }
      return pos - startTime;
    }

    // ===== Tracks =====
    // All compositions are original 8-bit style melodies written for this project.

    playLoop(trackName) {
      if (this.currentTrack === trackName) return;
      this.stop();
      this.currentTrack = trackName;
      this.init();
      const track = TRACKS[trackName];
      if (!track) return;
      const playOnce = () => {
        const start = this.ctx.currentTime + 0.05;
        const dur = track.play(this, start);
        this.loopTimeoutId = setTimeout(() => {
          if (this.currentTrack === trackName) playOnce();
        }, dur * 1000 - 50);
      };
      playOnce();
    }

    stop() {
      this.currentTrack = null;
      if (this.loopTimeoutId) {
        clearTimeout(this.loopTimeoutId);
        this.loopTimeoutId = null;
      }
    }

    // Fire-and-forget jingle (does not loop, doesn't stop bg music)
    playJingle(name) {
      this.init();
      const track = JINGLES[name];
      if (!track) return;
      const start = this.ctx.currentTime + 0.02;
      track.play(this, start);
    }

    // Short SFX
    sfx(name) {
      this.init();
      const t = this.ctx.currentTime + 0.01;
      if (name === "eat") {
        this.note({ freq: freq("E5"), start: t, dur: 0.08, type: "pulse25", vol: 0.3 });
        this.note({ freq: freq("A5"), start: t + 0.06, dur: 0.1, type: "pulse25", vol: 0.3 });
      } else if (name === "hit") {
        this.drum({ start: t, dur: 0.12, vol: 0.4 });
      } else if (name === "select") {
        this.note({ freq: freq("C5"), start: t, dur: 0.06, type: "pulse12", vol: 0.25 });
      } else if (name === "encounter") {
        // 3-note rising sting
        this.note({ freq: freq("C5"), start: t, dur: 0.1, type: "pulse12", vol: 0.35 });
        this.note({ freq: freq("E5"), start: t + 0.08, dur: 0.1, type: "pulse12", vol: 0.35 });
        this.note({ freq: freq("G5"), start: t + 0.16, dur: 0.18, type: "pulse12", vol: 0.4 });
      }
    }
  }

  // ===== Compositions (original) =====
  // Naming uses one-letter shorthand for brevity.
  // n = note, l = length in 16ths (4 = quarter, 8 = half, 2 = 8th, 1 = 16th)

  const TRACKS = {
    // Title — bouncy major-key intro (16 bars at 138bpm)
    title: {
      play(s, start) {
        const bpm = 138;
        // Lead — bouncy melody in C major
        const lead = [
          { n: "C5", l: 2 }, { n: "E5", l: 2 }, { n: "G5", l: 2 }, { n: "C6", l: 2 },
          { n: "B5", l: 4 }, { n: "A5", l: 2 }, { n: "G5", l: 2 },
          { n: "F5", l: 2 }, { n: "A5", l: 2 }, { n: "C6", l: 4 },
          { n: "G5", l: 2 }, { n: "E5", l: 2 }, { n: "C5", l: 4 },

          { n: "A4", l: 2 }, { n: "C5", l: 2 }, { n: "E5", l: 2 }, { n: "A5", l: 2 },
          { n: "G5", l: 4 }, { n: "F5", l: 2 }, { n: "E5", l: 2 },
          { n: "D5", l: 2 }, { n: "F5", l: 2 }, { n: "A5", l: 4 },
          { n: "G5", l: 8 },
        ];
        // Harmony — third below
        const harm = [
          { n: "G4", l: 2 }, { n: "C5", l: 2 }, { n: "E5", l: 2 }, { n: "G5", l: 2 },
          { n: "G5", l: 4 }, { n: "F5", l: 2 }, { n: "E5", l: 2 },
          { n: "C5", l: 2 }, { n: "F5", l: 2 }, { n: "A5", l: 4 },
          { n: "E5", l: 2 }, { n: "C5", l: 2 }, { n: "G4", l: 4 },

          { n: "E4", l: 2 }, { n: "A4", l: 2 }, { n: "C5", l: 2 }, { n: "E5", l: 2 },
          { n: "E5", l: 4 }, { n: "D5", l: 2 }, { n: "C5", l: 2 },
          { n: "B4", l: 2 }, { n: "D5", l: 2 }, { n: "F5", l: 4 },
          { n: "E5", l: 8 },
        ];
        // Bass — triangle quarter notes following I-vi-IV-V
        const bass = [
          { n: "C3", l: 4 }, { n: "G3", l: 4 }, { n: "C3", l: 4 }, { n: "G3", l: 4 },
          { n: "F3", l: 4 }, { n: "C3", l: 4 }, { n: "G3", l: 4 }, { n: "C3", l: 4 },
          { n: "A2", l: 4 }, { n: "E3", l: 4 }, { n: "A2", l: 4 }, { n: "E3", l: 4 },
          { n: "D3", l: 4 }, { n: "G3", l: 4 }, { n: "C3", l: 8 },
        ];
        const drums = [];
        for (let i = 0; i < 16; i++) {
          drums.push({ n: i % 2 === 0 ? "X" : "x", l: 2 });
        }
        // Schedule all in parallel
        const d1 = s.schedule(lead, bpm, start, "pulse25", 0.32);
        s.schedule(harm, bpm, start, "pulse12", 0.18);
        s.schedule(bass, bpm, start, "triangle", 0.42);
        s.scheduleDrums(drums.concat(drums), bpm, start);
        return d1;
      },
    },

    // Overworld/route — calm rolling tune
    route: {
      play(s, start) {
        const bpm = 124;
        const lead = [
          { n: "E5", l: 2 }, { n: "D5", l: 2 }, { n: "C5", l: 2 }, { n: "D5", l: 2 },
          { n: "E5", l: 2 }, { n: "E5", l: 2 }, { n: "E5", l: 4 },
          { n: "D5", l: 2 }, { n: "D5", l: 2 }, { n: "D5", l: 4 },
          { n: "E5", l: 2 }, { n: "G5", l: 2 }, { n: "G5", l: 4 },

          { n: "E5", l: 2 }, { n: "D5", l: 2 }, { n: "C5", l: 2 }, { n: "D5", l: 2 },
          { n: "E5", l: 2 }, { n: "E5", l: 2 }, { n: "E5", l: 2 }, { n: "E5", l: 2 },
          { n: "D5", l: 2 }, { n: "D5", l: 2 }, { n: "E5", l: 2 }, { n: "D5", l: 2 },
          { n: "C5", l: 8 },
        ];
        const bass = [
          { n: "C3", l: 4 }, { n: "G3", l: 4 }, { n: "C3", l: 4 }, { n: "G3", l: 4 },
          { n: "A2", l: 4 }, { n: "E3", l: 4 }, { n: "F3", l: 4 }, { n: "C3", l: 4 },
          { n: "C3", l: 4 }, { n: "G3", l: 4 }, { n: "F3", l: 4 }, { n: "G3", l: 4 },
          { n: "C3", l: 8 }, { n: "C3", l: 8 },
        ];
        const d1 = s.schedule(lead, bpm, start, "pulse25", 0.28);
        s.schedule(bass, bpm, start, "triangle", 0.4);
        return d1;
      },
    },

    // Battle — fast, urgent loop
    battle: {
      play(s, start) {
        const bpm = 168;
        const lead = [
          { n: "A5", l: 1 }, { n: "G5", l: 1 }, { n: "A5", l: 2 }, { n: "E5", l: 2 }, { n: "A5", l: 2 },
          { n: "B5", l: 2 }, { n: "A5", l: 2 }, { n: "G5", l: 2 }, { n: "E5", l: 2 },
          { n: "F5", l: 1 }, { n: "E5", l: 1 }, { n: "F5", l: 2 }, { n: "C5", l: 2 }, { n: "F5", l: 2 },
          { n: "G5", l: 2 }, { n: "F5", l: 2 }, { n: "E5", l: 2 }, { n: "D5", l: 2 },

          { n: "G5", l: 1 }, { n: "F5", l: 1 }, { n: "G5", l: 2 }, { n: "D5", l: 2 }, { n: "G5", l: 2 },
          { n: "A5", l: 2 }, { n: "G5", l: 2 }, { n: "F5", l: 2 }, { n: "D5", l: 2 },
          { n: "E5", l: 2 }, { n: "F5", l: 2 }, { n: "G5", l: 2 }, { n: "A5", l: 2 },
          { n: "B5", l: 4 }, { n: "-", l: 4 },
        ];
        const bass = [
          { n: "A2", l: 2 }, { n: "A3", l: 2 }, { n: "A2", l: 2 }, { n: "A3", l: 2 },
          { n: "A2", l: 2 }, { n: "A3", l: 2 }, { n: "A2", l: 2 }, { n: "A3", l: 2 },
          { n: "F2", l: 2 }, { n: "F3", l: 2 }, { n: "F2", l: 2 }, { n: "F3", l: 2 },
          { n: "F2", l: 2 }, { n: "F3", l: 2 }, { n: "F2", l: 2 }, { n: "F3", l: 2 },
          { n: "G2", l: 2 }, { n: "G3", l: 2 }, { n: "G2", l: 2 }, { n: "G3", l: 2 },
          { n: "G2", l: 2 }, { n: "G3", l: 2 }, { n: "G2", l: 2 }, { n: "G3", l: 2 },
          { n: "E2", l: 2 }, { n: "E3", l: 2 }, { n: "E2", l: 2 }, { n: "E3", l: 2 },
          { n: "E2", l: 2 }, { n: "E3", l: 2 }, { n: "E2", l: 2 }, { n: "E3", l: 2 },
        ];
        const drums = [];
        for (let i = 0; i < 32; i++) {
          drums.push({ n: i % 4 === 0 ? "X" : (i % 2 === 0 ? "x" : "-"), l: 2 });
        }
        const d1 = s.schedule(lead, bpm, start, "pulse25", 0.34);
        s.schedule(bass, bpm, start, "triangle", 0.42);
        s.scheduleDrums(drums, bpm, start);
        return d1;
      },
    },
  };

  const JINGLES = {
    // Caught a creature — rising bright fanfare
    catch: {
      play(s, start) {
        const bpm = 144;
        const lead = [
          { n: "C5", l: 1 }, { n: "E5", l: 1 }, { n: "G5", l: 1 }, { n: "C6", l: 1 },
          { n: "E6", l: 2 }, { n: "C6", l: 2 }, { n: "E6", l: 8 },
        ];
        const harm = [
          { n: "C4", l: 1 }, { n: "E4", l: 1 }, { n: "G4", l: 1 }, { n: "C5", l: 1 },
          { n: "G4", l: 2 }, { n: "E4", l: 2 }, { n: "C5", l: 8 },
        ];
        s.schedule(lead, bpm, start, "pulse25", 0.4);
        s.schedule(harm, bpm, start, "triangle", 0.4);
      },
    },
    // Game over — descending sad cadence
    gameover: {
      play(s, start) {
        const bpm = 96;
        const lead = [
          { n: "C5", l: 4 }, { n: "B4", l: 4 },
          { n: "A4", l: 4 }, { n: "G4", l: 4 },
          { n: "F4", l: 4 }, { n: "E4", l: 4 },
          { n: "D4", l: 8 },
          { n: "C4", l: 12 },
        ];
        const bass = [
          { n: "C3", l: 8 }, { n: "A2", l: 8 },
          { n: "F2", l: 8 }, { n: "G2", l: 8 },
          { n: "C3", l: 16 },
        ];
        s.schedule(lead, bpm, start, "pulse25", 0.35);
        s.schedule(bass, bpm, start, "triangle", 0.4);
      },
    },
    // Lost a life — short downward sting
    lifeLost: {
      play(s, start) {
        const bpm = 160;
        const lead = [
          { n: "G5", l: 1 }, { n: "F#5", l: 1 }, { n: "E5", l: 1 },
          { n: "D5", l: 1 }, { n: "C5", l: 2 },
        ];
        s.schedule(lead, bpm, start, "pulse25", 0.35);
      },
    },
    // KO an enemy — punchy little tag
    victory: {
      play(s, start) {
        const bpm = 160;
        const lead = [
          { n: "C5", l: 1 }, { n: "E5", l: 1 }, { n: "G5", l: 1 }, { n: "C6", l: 4 },
        ];
        s.schedule(lead, bpm, start, "pulse25", 0.38);
      },
    },
  };

  window.SnakeAudio = new Synth();
})();
