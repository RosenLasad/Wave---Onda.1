(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('waveCanvas');
  const ctx = canvas.getContext('2d');

  const ui = {
    play: $('playBtn'), stop: $('stopBtn'), load: $('loadBtn'), library: $('libraryBtn'), input: $('midiInput'), seek: $('seek'),
    tempo: $('tempo'), intensity: $('intensity'), transpose: $('transpose'), complexity: $('complexity'),
    tempoValue: $('tempoValue'), intensityValue: $('intensityValue'), transposeValue: $('transposeValue'), complexityValue: $('complexityValue'),
    colorMode: $('colorMode'), colorModeValue: $('colorModeValue'), trace: $('trace'), traceValue: $('traceValue'), glow: $('glow'), glowValue: $('glowValue'),
    scenePicker: $('scenePicker'), autoScene: $('autoSceneBtn'), sceneDescription: $('sceneDescription'), sceneHud: $('sceneHud'), engineHud: $('engineHud'), sceneStatus: $('sceneStatus'),
    trackLabel: $('trackLabel'), sourceStatus: $('sourceStatus'), eventCount: $('eventCount'),
    timeNow: $('timeNow'), timeTotal: $('timeTotal'), noteHud: $('noteHud'), bpmHud: $('bpmHud'),
    libraryPanel: $('midiLibrary'), libraryClose: $('libraryCloseBtn'), libraryList: $('libraryList'), libraryHint: $('libraryHint')
  };

  let audioCtx = null;
  let masterGain = null;
  let song = makeDemoSong();
  let isPlaying = false;
  let playhead = 0;
  let eventIndex = 0;
  let lastFrame = performance.now();
  let activeVisualNotes = new Map();
  let voices = new Map();
  let phase = 0;
  let pulse = 0;
  let midiLibrary = [];
  let currentLibraryFile = null;
  let libraryLoaded = false;
  let currentScene = 'pure';
  let autoScene = false;
  let autoSceneTimer = 0;
  let visualObjects = [];
  let smoothLobes = 5;
  let canvasReady = false;

  const SCENES = {
    pure: {
      label: 'Pure', engine: 'Polygon Pulse', hue: 220, bg: [7, 9, 15],
      description: `Geometria pura: poligoni armonici, simmetrie e morphing continui guidati dalle note.`
    },
    ocean: {
      label: 'Ocean', engine: 'Wave Line', hue: 196, bg: [5, 13, 20],
      description: `Onde stratificate: bassi profondi, note acute come increspature e intensità trasformata in altezza delle onde.`
    },
    hills: {
      label: 'Hills', engine: 'Wave Line', hue: 142, bg: [7, 15, 13],
      description: `Profili morbidi di colline: la melodia sposta i rilievi, il ritmo fa respirare lentamente il paesaggio.`
    },
    desert: {
      label: 'Desert', engine: 'Wave Line', hue: 35, bg: [19, 12, 8],
      description: `Dune geometriche sovrapposte: movimento lento, curvature ampie e colori caldi modulati dalla tonalità.`
    },
    bubbles: {
      label: 'Bubbles', engine: 'Particle Orbit', hue: 185, bg: [7, 10, 16],
      description: `Ogni attacco MIDI genera bolle: pitch, velocity e tempo ne determinano quota, dimensione, salita e luminosità.`
    },
    birds: {
      label: 'Birds', engine: 'Flock Lines', hue: 205, bg: [9, 13, 18],
      description: `Piccoli segni a V diventano uno stormo: la melodia ne guida l'altezza e il ritmo il battito delle ali.`
    },
    galaxy: {
      label: 'Galaxy', engine: 'Orbit / Rosetta', hue: 266, bg: [6, 7, 14],
      description: `Spirali, orbite e stelle reagiscono agli accordi: complessità crea nuovi bracci, il tempo controlla la rotazione.`
    },
    bloom: {
      label: 'Bloom', engine: 'Harmonic Bloom', hue: 326, bg: [14, 7, 14],
      description: `Rosette armoniche che sbocciano con gli accordi: più note e più complessità producono petali e anelli concentrici.`
    }
  };
  const SCENE_ORDER = Object.keys(SCENES);

  function makeDemoSong() {
    const notes = [];
    const pattern = [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65];
    const beat = 0.6;
    for (let i = 0; i < 36; i++) {
      const note = pattern[i % pattern.length];
      const t = i * beat * 0.5;
      const velocity = 58 + ((i * 17) % 54);
      notes.push({ time: t, type: 'on', note, velocity, channel: 0 });
      notes.push({ time: t + beat * 0.42, type: 'off', note, velocity: 0, channel: 0 });
      if (i % 6 === 0) {
        const bass = note - 24;
        notes.push({ time: t, type: 'on', note: bass, velocity: 74, channel: 1 });
        notes.push({ time: t + beat * 1.35, type: 'off', note: bass, velocity: 0, channel: 1 });
      }
    }
    notes.sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));
    return { name: 'Demo geometrica', events: notes, duration: 11.4, baseBpm: 100, ppq: 480 };
  }

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    masterGain.connect(compressor).connect(audioCtx.destination);
    updateMasterGain();
  }

  function updateMasterGain() {
    if (!masterGain || !audioCtx) return;
    const intensity = Number(ui.intensity.value) / 100;
    masterGain.gain.setTargetAtTime(0.18 * intensity, audioCtx.currentTime, 0.03);
  }

  function midiToFreq(note) {
    const transposed = note + Number(ui.transpose.value);
    return 440 * Math.pow(2, (transposed - 69) / 12);
  }

  function voiceKey(channel, note) { return `${channel}:${note}`; }

  function startVoice(note, velocity, channel) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const key = voiceKey(channel, note);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const now = audioCtx.currentTime;
    const v = Math.max(0.04, velocity / 127);

    osc.type = channel % 3 === 1 ? 'triangle' : 'sine';
    osc.frequency.value = midiToFreq(note);
    filter.type = 'lowpass';
    filter.frequency.value = 900 + v * 2600;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16 * v, now + 0.012);

    osc.connect(filter).connect(gain).connect(masterGain);
    osc.start(now);

    if (!voices.has(key)) voices.set(key, []);
    voices.get(key).push({ osc, gain, filter });
  }

  function stopVoice(note, channel) {
    const key = voiceKey(channel, note);
    const list = voices.get(key);
    if (!list || !list.length || !audioCtx) return;
    const voice = list.shift();
    const now = audioCtx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.055);
    try { voice.osc.stop(now + 0.25); } catch (_) {}
    if (!list.length) voices.delete(key);
  }

  function silenceAll() {
    if (audioCtx) {
      const now = audioCtx.currentTime;
      for (const list of voices.values()) {
        for (const voice of list) {
          try {
            voice.gain.gain.cancelScheduledValues(now);
            voice.gain.gain.setTargetAtTime(0.0001, now, 0.02);
            voice.osc.stop(now + 0.08);
          } catch (_) {}
        }
      }
    }
    voices.clear();
    activeVisualNotes.clear();
    visualObjects = [];
  }

  function spawnVisualOnset(event) {
    const v = Math.max(0.08, event.velocity / 127);
    const pitch = clamp((event.note + Number(ui.transpose.value) - 36) / 60, 0, 1);
    const seed = ((event.note * 97 + event.channel * 31 + eventIndex * 17) % 997) / 997;

    if (currentScene === 'bubbles') {
      const copies = 1 + Math.floor(Number(ui.complexity.value) / 4);
      for (let i = 0; i < copies; i++) {
        visualObjects.push({
          kind: 'bubble', x: (seed + i * .23) % 1, y: 1.08 + i * .035, r: .018 + v * .035 + i * .004,
          drift: (seed - .5) * .055, speed: .055 + pitch * .09 + v * .045, age: 0, life: 7 + v * 4,
          pitch, velocity: v, wobble: seed * Math.PI * 2
        });
      }
    } else if (currentScene === 'birds') {
      const copies = 1 + Math.floor(Number(ui.complexity.value) / 3);
      for (let i = 0; i < copies; i++) {
        visualObjects.push({
          kind: 'bird', x: -.10 - i * .045, y: .78 - pitch * .58 + (i - copies / 2) * .025,
          speed: .075 + v * .13 + Number(ui.tempo.value) / 1500, age: 0, life: 9,
          size: .014 + v * .018, pitch, velocity: v, flap: seed * Math.PI * 2
        });
      }
    } else if (currentScene === 'galaxy') {
      visualObjects.push({ kind: 'spark', angle: seed * Math.PI * 2, radius: .12 + pitch * .34, age: 0, life: 2.8, pitch, velocity: v });
    }
    if (visualObjects.length > 140) visualObjects.splice(0, visualObjects.length - 140);
  }

  function processEvent(event) {
    if (event.type === 'on' && event.velocity > 0) {
      startVoice(event.note, event.velocity, event.channel || 0);
      const key = voiceKey(event.channel || 0, event.note);
      activeVisualNotes.set(key, { note: event.note, velocity: event.velocity, started: performance.now() });
      pulse = Math.min(2.2, pulse + 0.8 * (event.velocity / 127));
      spawnVisualOnset(event);
    } else if (event.type === 'off' || event.velocity === 0) {
      stopVoice(event.note, event.channel || 0);
      activeVisualNotes.delete(voiceKey(event.channel || 0, event.note));
    }
  }

  function findEventIndex(time) {
    let lo = 0, hi = song.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (song.events[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function setPlayhead(seconds, reconstruct = false) {
    playhead = Math.max(0, Math.min(song.duration || 0, seconds));
    silenceAll();
    eventIndex = findEventIndex(playhead);

    if (reconstruct && playhead > 0) {
      const state = new Map();
      for (let i = 0; i < eventIndex; i++) {
        const e = song.events[i];
        const key = voiceKey(e.channel || 0, e.note);
        if (e.type === 'on' && e.velocity > 0) state.set(key, e);
        else state.delete(key);
      }
      for (const e of state.values()) processEvent(e);
    }
    refreshTimeUI();
  }

  function togglePlay() {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (playhead >= song.duration - 0.01) setPlayhead(0);
    isPlaying = !isPlaying;
    ui.play.textContent = isPlaying ? '❚❚' : '▶';
    lastFrame = performance.now();
  }

  function stopPlayback() {
    isPlaying = false;
    ui.play.textContent = '▶';
    setPlayhead(0);
  }

  function updatePlayback(dt) {
    if (!isPlaying) return;
    const tempoScale = Number(ui.tempo.value) / 100;
    playhead += dt * tempoScale;

    while (eventIndex < song.events.length && song.events[eventIndex].time <= playhead) {
      processEvent(song.events[eventIndex]);
      eventIndex++;
    }

    if (playhead >= song.duration) {
      playhead = song.duration;
      isPlaying = false;
      ui.play.textContent = '▶';
      silenceAll();
      eventIndex = song.events.length;
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvasReady = false;
    }
    return { w, h, dpr };
  }

  function clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mod(v, m) { return ((v % m) + m) % m; }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function getMetrics(dt, W, H) {
    const notes = [...activeVisualNotes.values()];
    const count = notes.length;
    const complexity = Number(ui.complexity.value);
    const intensity = Number(ui.intensity.value) / 100;
    const tempoScale = Number(ui.tempo.value) / 100;
    const transpose = Number(ui.transpose.value);
    const avgPitch = count ? notes.reduce((sum, n) => sum + n.note + transpose, 0) / count : 60 + transpose;
    const avgVelocity = count ? notes.reduce((sum, n) => sum + n.velocity, 0) / count / 127 : 0.18;
    const pitchNorm = clamp((avgPitch - 36) / 60);
    phase += dt * (0.62 + tempoScale * 1.45);
    pulse *= Math.pow(0.13, dt);
    return {
      dt, W, H, cx: W / 2, cy: H / 2, notes, count, complexity, intensity, tempoScale,
      transpose, avgPitch, avgVelocity, pitchNorm, pulse,
      baseRadius: Math.min(W, H) * (0.165 + pitchNorm * 0.085 + clamp(pulse / 2) * 0.055 * intensity)
    };
  }

  function colorFor(m, offset = 0, alpha = 1, hueOverride = null) {
    const scene = SCENES[currentScene];
    const mode = ui.colorMode.value;
    const anchor = hueOverride == null ? scene.hue : hueOverride;
    let hue;
    if (mode === 'mono') {
      hue = anchor + m.transpose * 3;
    } else if (mode === 'gradient') {
      hue = anchor + m.pitchNorm * 34 + offset * 88 + m.transpose * 5;
    } else if (mode === 'spectrum') {
      hue = m.phaseHue + offset * 360 + m.pitchNorm * 150;
    } else {
      hue = anchor + (m.avgPitch - 60) * 2.8 + offset * 42 + m.transpose * 4 + phase * m.tempoScale * 2.4;
    }
    hue = mod(hue, 360);
    const saturation = clamp(54 + m.intensity * 23 + m.avgVelocity * 14, 45, 96);
    const lightness = clamp(48 + m.avgVelocity * 20 + clamp(m.pulse) * 5, 38, 78);
    return `hsla(${hue.toFixed(1)},${saturation.toFixed(1)}%,${lightness.toFixed(1)}%,${clamp(alpha, 0, 1)})`;
  }

  function setGlow(color, m, factor = 1) {
    const amount = Number(ui.glow.value) / 100;
    ctx.shadowColor = color;
    ctx.shadowBlur = amount * m.intensity * 22 * factor;
  }

  function resetGlow() {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function paintBackground(m) {
    const scene = SCENES[currentScene];
    const trace = Number(ui.trace.value) / 100;
    const fade = canvasReady ? lerp(0.72, 0.065, trace) : 1;
    resetGlow();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(scene.bg, fade);
    ctx.fillRect(0, 0, m.W, m.H);
    canvasReady = true;

    const glow = ctx.createRadialGradient(m.cx, m.cy * .92, 0, m.cx, m.cy, Math.max(m.W, m.H) * .7);
    glow.addColorStop(0, colorFor(m, .05, .035));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, m.W, m.H);
  }

  function drawQuietLine(m) {
    const length = Math.min(m.W * .58, 370);
    const wobble = Math.sin(phase * 1.15) * 3.6 * m.intensity;
    ctx.beginPath();
    const segments = 34;
    for (let i = 0; i <= segments; i++) {
      const x = m.cx - length / 2 + length * i / segments;
      const envelope = Math.sin(Math.PI * i / segments);
      const y = m.cy + Math.sin(i * .64 + phase) * wobble * envelope;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const c = colorFor(m, 0, .68);
    setGlow(c, m, .4);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.15 + m.intensity * .18;
    ctx.stroke();
    resetGlow();
  }

  function renderPure(m) {
    const targetLobes = clamp(3.2 + m.count * .9 + m.complexity * .52, 3.2, 14.8);
    smoothLobes = lerp(smoothLobes, targetLobes, 1 - Math.exp(-m.dt * 2.5));
    if (!m.count) drawQuietLine(m);

    const layers = 1 + Math.floor(m.complexity / 2);
    const points = 180;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const scale = 1 + layer * .105;
      const alpha = .72 / (1 + layer * .56);
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = Math.PI * 2 * i / points;
        const harmonic = Math.sin(a * smoothLobes + phase * (1.12 + layer * .05));
        const secondary = Math.sin(a * (smoothLobes * .5 + 1.7) - phase * .71);
        const attack = Math.sin(a * (2 + m.count) + phase * 3.1) * clamp(m.pulse) * .045;
        const deform = (harmonic * .075 + secondary * .035 + attack) * m.intensity * (.55 + m.complexity / 12);
        const radius = m.baseRadius * scale * (1 + deform + m.avgVelocity * .055);
        const stretch = .82 + m.pitchNorm * .28;
        const rotation = phase * (.10 + m.pitchNorm * .16);
        const x = m.cx + Math.cos(a + rotation) * radius;
        const y = m.cy + Math.sin(a + rotation) * radius * stretch;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const c = colorFor(m, layer / Math.max(1, layers - 1), alpha);
      setGlow(c, m, layer === 0 ? .75 : .25);
      ctx.strokeStyle = c;
      ctx.lineWidth = layer === 0 ? 1.35 + m.intensity * .35 : .7 + m.intensity * .08;
      ctx.stroke();
      if (layer === 0 && m.count) {
        ctx.fillStyle = colorFor(m, .1, .025 + m.avgVelocity * .025);
        ctx.fill();
      }
    }
    resetGlow();

    if (m.pulse > .07) {
      ctx.beginPath();
      ctx.arc(m.cx, m.cy, m.baseRadius * (1.18 + clamp(m.pulse) * .24), 0, Math.PI * 2);
      ctx.strokeStyle = colorFor(m, .2, clamp(m.pulse * .11, 0, .19));
      ctx.lineWidth = .8;
      ctx.stroke();
    }
  }

  function renderOcean(m) {
    const layers = 3 + Math.floor(m.complexity / 2);
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const y0 = m.H * (.48 + depth * .30);
      const amp = m.H * (.018 + .019 * m.intensity + m.avgVelocity * .016) * (1 - depth * .25) + clamp(m.pulse) * 5;
      const freq = 1.45 + layer * .28 + m.pitchNorm * .65;
      ctx.beginPath();
      for (let x = -4; x <= m.W + 4; x += 4) {
        const q = x / m.W;
        const wave = Math.sin(q * Math.PI * 2 * freq + phase * (1.18 + layer * .045))
          + .42 * Math.sin(q * Math.PI * 2 * (freq * 2.13) - phase * .73 + layer)
          + .17 * Math.sin(q * Math.PI * 2 * (freq * 4.4) + phase * 1.7);
        const y = y0 + wave * amp * (.58 + depth * .25);
        if (x <= 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .7, .60 - depth * .26, 195 + depth * 18);
      setGlow(c, m, layer === 0 ? .45 : .12);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.05 + (1 - depth) * .8 * m.intensity;
      ctx.stroke();
    }
    resetGlow();
  }

  function renderHills(m) {
    const layers = 3 + Math.floor(m.complexity / 3);
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const baseline = m.H * (.58 + depth * .13);
      const amp = m.H * (.07 + .018 * m.intensity) * (1 - depth * .18);
      ctx.beginPath();
      ctx.moveTo(-4, m.H + 4);
      for (let x = -4; x <= m.W + 4; x += 5) {
        const q = x / m.W;
        const ridge = .72 * Math.sin(q * Math.PI * 2 * (1.05 + layer * .17) + phase * .17 + layer * .8)
          + .34 * Math.sin(q * Math.PI * 2 * 2.23 - phase * .10 + m.pitchNorm * 2.3)
          + .12 * Math.cos(q * Math.PI * 2 * 4.4 + layer);
        const y = baseline - ridge * amp - clamp(m.pulse) * (1 - depth) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(m.W + 4, m.H + 4);
      ctx.closePath();
      ctx.fillStyle = colorFor(m, depth * .45, .045 + (1 - depth) * .035, 143 + depth * 20);
      ctx.fill();
      ctx.beginPath();
      for (let x = -4; x <= m.W + 4; x += 5) {
        const q = x / m.W;
        const ridge = .72 * Math.sin(q * Math.PI * 2 * (1.05 + layer * .17) + phase * .17 + layer * .8)
          + .34 * Math.sin(q * Math.PI * 2 * 2.23 - phase * .10 + m.pitchNorm * 2.3)
          + .12 * Math.cos(q * Math.PI * 2 * 4.4 + layer);
        const y = baseline - ridge * amp - clamp(m.pulse) * (1 - depth) * 4;
        if (x <= 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .45, .48 - depth * .18, 143 + depth * 20);
      setGlow(c, m, .10);
      ctx.strokeStyle = c;
      ctx.lineWidth = .85 + (1 - depth) * .55;
      ctx.stroke();
    }
    resetGlow();
  }

  function renderDesert(m) {
    const layers = 3 + Math.floor(m.complexity / 3);
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const baseline = m.H * (.56 + depth * .15);
      const amp = m.H * (.055 + .018 * m.intensity) * (1 - depth * .12);
      const drift = phase * .095 * (1 + m.tempoScale * .2);
      ctx.beginPath();
      ctx.moveTo(-4, m.H + 4);
      for (let x = -4; x <= m.W + 4; x += 5) {
        const q = x / m.W;
        const dune = .82 * Math.sin(q * Math.PI * 2 * (.78 + layer * .12) + drift + layer * 1.1)
          + .24 * Math.sin(q * Math.PI * 2 * 1.62 - drift * .45 + m.pitchNorm * 1.8);
        const y = baseline - dune * amp - clamp(m.pulse) * 2.3 * (1 - depth);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(m.W + 4, m.H + 4);
      ctx.closePath();
      ctx.fillStyle = colorFor(m, depth * .35, .048 + (1 - depth) * .026, 33 + depth * 13);
      ctx.fill();
      ctx.beginPath();
      for (let x = -4; x <= m.W + 4; x += 5) {
        const q = x / m.W;
        const dune = .82 * Math.sin(q * Math.PI * 2 * (.78 + layer * .12) + drift + layer * 1.1)
          + .24 * Math.sin(q * Math.PI * 2 * 1.62 - drift * .45 + m.pitchNorm * 1.8);
        const y = baseline - dune * amp - clamp(m.pulse) * 2.3 * (1 - depth);
        if (x <= 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .35, .48 - depth * .17, 33 + depth * 13);
      ctx.strokeStyle = c;
      ctx.lineWidth = .9 + (1 - depth) * .45;
      ctx.stroke();
    }
  }

  function updateVisualObjects(m) {
    for (const o of visualObjects) {
      o.age += m.dt;
      if (o.kind === 'bubble') {
        o.y -= o.speed * m.dt * (.72 + m.tempoScale * .38);
        o.x += Math.sin(o.age * 1.5 + o.wobble) * .008 * m.dt;
      } else if (o.kind === 'bird') {
        o.x += o.speed * m.dt * (.72 + m.tempoScale * .42);
        o.y += Math.sin(o.age * .85 + o.flap) * .004 * m.dt;
      }
    }
    visualObjects = visualObjects.filter(o => o.age < o.life && (o.kind !== 'bubble' || o.y > -.18) && (o.kind !== 'bird' || o.x < 1.18));
  }

  function renderBubbles(m) {
    updateVisualObjects(m);
    if (!visualObjects.some(o => o.kind === 'bubble') && !isPlaying) {
      for (let i = 0; i < 6; i++) {
        const seed = (i * .173 + .11) % 1;
        visualObjects.push({ kind: 'bubble', x: .18 + seed * .64, y: .88 - i * .11, r: .018 + (i % 3) * .008, drift: 0, speed: .012, age: i * .3, life: 30, pitch: seed, velocity: .25, wobble: seed * 6.28 });
      }
    }
    for (const o of visualObjects) {
      if (o.kind !== 'bubble') continue;
      const x = o.x * m.W;
      const y = o.y * m.H;
      const r = o.r * Math.min(m.W, m.H) * (1 + Math.sin(o.age * 2.1 + o.wobble) * .06);
      const fade = clamp(Math.min(o.age * 2.5, (o.life - o.age) * 1.4));
      const c = colorFor(m, o.pitch, .46 * fade, 184 + o.pitch * 38);
      setGlow(c, m, .48 + o.velocity * .5);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = c;
      ctx.lineWidth = .8 + o.velocity * 1.25 * m.intensity;
      ctx.stroke();
      resetGlow();
      ctx.beginPath();
      ctx.arc(x - r * .26, y - r * .28, r * .42, Math.PI * 1.02, Math.PI * 1.54);
      ctx.strokeStyle = colorFor(m, o.pitch + .08, .26 * fade, 200);
      ctx.lineWidth = .65;
      ctx.stroke();
    }
  }

  function renderBirds(m) {
    updateVisualObjects(m);
    if (!visualObjects.some(o => o.kind === 'bird') && !isPlaying) {
      for (let i = 0; i < 7; i++) {
        visualObjects.push({ kind: 'bird', x: .13 + i * .105, y: .38 + Math.sin(i * 1.8) * .09, speed: 0, age: i * .1, life: 40, size: .013 + (i % 3) * .0025, pitch: .45 + i * .04, velocity: .25, flap: i * .8 });
      }
    }
    for (const o of visualObjects) {
      if (o.kind !== 'bird') continue;
      const x = o.x * m.W;
      const y = o.y * m.H;
      const size = o.size * Math.min(m.W, m.H) * (1 + m.intensity * .10);
      const flap = Math.sin(o.age * (5.2 + m.tempoScale * 4.5) + o.flap);
      const wingY = size * (.20 + flap * .54);
      const c = colorFor(m, o.pitch, .52 + o.velocity * .22, 205 + o.pitch * 22);
      setGlow(c, m, .16);
      ctx.beginPath();
      ctx.moveTo(x - size, y + wingY);
      ctx.quadraticCurveTo(x - size * .42, y - size * .18, x, y);
      ctx.quadraticCurveTo(x + size * .42, y - size * .18, x + size, y + wingY);
      ctx.strokeStyle = c;
      ctx.lineWidth = .9 + o.velocity * 1.15 * m.intensity;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    resetGlow();
  }

  function pseudo(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function renderGalaxy(m) {
    const minDim = Math.min(m.W, m.H);
    const starCount = 62 + m.complexity * 8;
    for (let i = 0; i < starCount; i++) {
      const x = pseudo(i * 2 + 1) * m.W;
      const y = pseudo(i * 2 + 2) * m.H;
      const twinkle = .12 + .20 * (.5 + .5 * Math.sin(phase * (1 + pseudo(i) * 2) + i));
      ctx.fillStyle = colorFor(m, pseudo(i), twinkle, 220 + pseudo(i) * 80);
      ctx.fillRect(x, y, .7 + pseudo(i + 4) * 1.1, .7 + pseudo(i + 4) * 1.1);
    }

    const arms = 2 + Math.floor(m.complexity / 3);
    const pointsPerArm = 48 + m.complexity * 7;
    for (let arm = 0; arm < arms; arm++) {
      for (let i = 4; i < pointsPerArm; i++) {
        const t = i / pointsPerArm;
        const r = minDim * (.035 + Math.pow(t, .82) * (.34 + m.intensity * .028));
        const angle = arm * Math.PI * 2 / arms + t * Math.PI * 2 * (1.6 + m.complexity * .085) + phase * .18 * m.tempoScale;
        const jitter = (pseudo(i + arm * 101) - .5) * minDim * .026 * t;
        const x = m.cx + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * jitter;
        const y = m.cy + Math.sin(angle) * r * .72 + Math.sin(angle + Math.PI / 2) * jitter;
        const a = .10 + (1 - t) * .25;
        ctx.fillStyle = colorFor(m, arm / arms + t * .25, a, 260 + arm * 24);
        const dot = .65 + pseudo(i * 3 + arm) * 1.65 + m.avgVelocity * .5;
        ctx.fillRect(x, y, dot, dot);
      }
    }

    for (let i = 0; i < Math.min(m.notes.length, 10); i++) {
      const n = m.notes[i];
      const pn = clamp((n.note + m.transpose - 36) / 60);
      const r = minDim * (.10 + pn * .29);
      const a = phase * (.18 + i * .009) + i * 2.399;
      const x = m.cx + Math.cos(a) * r;
      const y = m.cy + Math.sin(a) * r * .72;
      const c = colorFor(m, pn, .72, 270 + pn * 80);
      setGlow(c, m, .8);
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + n.velocity / 127 * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    }

    for (const o of visualObjects) {
      if (o.kind !== 'spark') continue;
      o.age += m.dt;
      const fade = clamp(1 - o.age / o.life);
      const a = o.angle + phase * .24;
      const r = minDim * o.radius;
      const x = m.cx + Math.cos(a) * r;
      const y = m.cy + Math.sin(a) * r * .72;
      const c = colorFor(m, o.pitch, fade * .8, 280 + o.pitch * 70);
      setGlow(c, m, 1.0);
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + o.velocity * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    }
    visualObjects = visualObjects.filter(o => o.kind !== 'spark' || o.age < o.life);
    resetGlow();

    const core = ctx.createRadialGradient(m.cx, m.cy, 0, m.cx, m.cy, minDim * .12);
    core.addColorStop(0, colorFor(m, .2, .34, 300));
    core.addColorStop(.25, colorFor(m, .1, .12, 260));
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, minDim * .13, 0, Math.PI * 2);
    ctx.fill();
  }

  function renderBloom(m) {
    const petals = clamp(4 + m.count + Math.floor(m.complexity * .55), 4, 18);
    const layers = 2 + Math.floor(m.complexity / 2);
    const points = 220;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const scale = .68 + layer * .12 + clamp(m.pulse) * .025;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = Math.PI * 2 * i / points;
        const petal = Math.cos(a * petals + phase * (1.05 + layer * .04));
        const inner = Math.sin(a * (petals / 2 + 1) - phase * .62);
        const r = m.baseRadius * scale * (1 + petal * (.20 + m.intensity * .045) + inner * .035);
        const rotation = -phase * .07 + layer * .035;
        const x = m.cx + Math.cos(a + rotation) * r;
        const y = m.cy + Math.sin(a + rotation) * r;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const alpha = .62 / (1 + layer * .38);
      const c = colorFor(m, layer / Math.max(1, layers), alpha, 320 + layer * 12);
      setGlow(c, m, layer === 0 ? .72 : .18);
      ctx.strokeStyle = c;
      ctx.lineWidth = layer === 0 ? 1.2 + m.intensity * .3 : .72;
      ctx.stroke();
      ctx.fillStyle = colorFor(m, layer / Math.max(1, layers), .018 + m.avgVelocity * .012, 326 + layer * 10);
      ctx.fill();
    }
    resetGlow();
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, 2.2 + clamp(m.pulse) * 4.5, 0, Math.PI * 2);
    ctx.fillStyle = colorFor(m, .5, .66, 42);
    ctx.fill();
  }

  function updateAutoScene(dt, m) {
    if (!autoScene || !isPlaying) return;
    autoSceneTimer += dt * m.tempoScale;
    const interval = 15 - m.complexity * .45;
    if (autoSceneTimer >= interval) {
      autoSceneTimer = 0;
      const index = SCENE_ORDER.indexOf(currentScene);
      setScene(SCENE_ORDER[(index + 1) % SCENE_ORDER.length], true);
    }
  }

  function drawVisual(dt) {
    const { w, h, dpr } = resizeCanvas();
    ctx.save();
    ctx.scale(dpr, dpr);
    const W = w / dpr;
    const H = h / dpr;
    const m = getMetrics(dt, W, H);
    m.phaseHue = mod(phase * 22 * m.tempoScale + m.transpose * 9, 360);

    paintBackground(m);
    updateAutoScene(dt, m);

    switch (currentScene) {
      case 'ocean': renderOcean(m); break;
      case 'hills': renderHills(m); break;
      case 'desert': renderDesert(m); break;
      case 'bubbles': renderBubbles(m); break;
      case 'birds': renderBirds(m); break;
      case 'galaxy': renderGalaxy(m); break;
      case 'bloom': renderBloom(m); break;
      default: renderPure(m); break;
    }

    ctx.restore();
    const shownNotes = m.notes.slice(0, 5).map(n => noteName(n.note + Number(ui.transpose.value))).join(' · ');
    ui.noteHud.textContent = shownNotes ? `NOTE ${shownNotes}${m.notes.length > 5 ? ' …' : ''}` : 'NOTE —';
  }

  function noteName(n) {
    const names = ['DO', 'DO♯', 'RE', 'RE♯', 'MI', 'FA', 'FA♯', 'SOL', 'SOL♯', 'LA', 'LA♯', 'SI'];
    return names[((Math.round(n) % 12) + 12) % 12];
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec)) return '0:00';
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function refreshTimeUI() {
    ui.timeNow.textContent = formatTime(playhead);
    ui.timeTotal.textContent = formatTime(song.duration);
    const value = song.duration > 0 ? Math.round((playhead / song.duration) * 1000) : 0;
    if (document.activeElement !== ui.seek) ui.seek.value = value;
    const effectiveBpm = Math.round(song.baseBpm * Number(ui.tempo.value) / 100);
    ui.bpmHud.textContent = `${effectiveBpm} BPM`;
  }

  function refreshControls() {
    ui.tempoValue.textContent = `${ui.tempo.value}%`;
    ui.intensityValue.textContent = `${ui.intensity.value}%`;
    const tr = Number(ui.transpose.value);
    ui.transposeValue.textContent = tr > 0 ? `+${tr}` : `${tr}`;
    ui.complexityValue.textContent = ui.complexity.value;
    ui.traceValue.textContent = `${ui.trace.value}%`;
    ui.glowValue.textContent = `${ui.glow.value}%`;
    const colorNames = { musical: 'Musicale', mono: 'Monocromatico', gradient: 'Gradiente', spectrum: 'Spettro' };
    ui.colorModeValue.textContent = colorNames[ui.colorMode.value] || 'Musicale';
    updateMasterGain();
    refreshTimeUI();
  }

  function setScene(name, fromAuto = false) {
    if (!SCENES[name]) return;
    currentScene = name;
    if (!fromAuto) autoSceneTimer = 0;
    visualObjects = [];
    pulse = Math.max(pulse, .22);
    const scene = SCENES[name];
    ui.sceneHud.textContent = scene.label.toUpperCase();
    ui.engineHud.textContent = scene.engine.toUpperCase();
    ui.sceneStatus.textContent = `${scene.label} · ${scene.engine}`;
    ui.sceneDescription.textContent = scene.description;
    ui.scenePicker.querySelectorAll('[data-scene]').forEach(button => {
      const active = button.dataset.scene === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function loadSong(newSong, label) {
    isPlaying = false;
    ui.play.textContent = '▶';
    silenceAll();
    song = newSong;
    playhead = 0;
    eventIndex = 0;
    ui.trackLabel.textContent = label || newSong.name || 'MIDI';
    ui.sourceStatus.textContent = label || newSong.name || 'MIDI caricato';
    ui.eventCount.textContent = String(newSong.events.length);
    refreshTimeUI();
  }


  function prettyMidiTitle(filename) {
    return filename
      .replace(/\.(mid|midi)$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function openLibrary() {
    ui.libraryPanel.classList.add('open');
    ui.libraryPanel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('library-open');
    refreshMidiLibrary();
    setTimeout(() => ui.libraryClose.focus(), 0);
  }

  function closeLibrary() {
    ui.libraryPanel.classList.remove('open');
    ui.libraryPanel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('library-open');
    ui.library.focus();
  }

  function renderMidiLibrary() {
    if (!midiLibrary.length) {
      ui.libraryList.innerHTML = '<p class="library-message">Nessun file MIDI presente nella libreria.</p>';
      return;
    }

    ui.libraryList.innerHTML = '';
    midiLibrary.forEach((entry) => {
      const file = typeof entry === 'string' ? entry : entry.file;
      const title = typeof entry === 'string' ? prettyMidiTitle(entry) : (entry.title || prettyMidiTitle(entry.file));
      if (!file) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `library-item${currentLibraryFile === file ? ' current' : ''}`;
      button.dataset.file = file;
      button.innerHTML = `
        <span class="library-icon" aria-hidden="true">♫</span>
        <span class="library-copy">
          <span class="library-title"></span>
          <span class="library-file"></span>
        </span>
        <span class="library-play" aria-hidden="true">▶</span>`;
      button.querySelector('.library-title').textContent = title;
      button.querySelector('.library-file').textContent = file;
      button.setAttribute('aria-label', `Carica ${title}`);
      button.addEventListener('click', () => loadMidiFromLibrary(file, title, button));
      ui.libraryList.appendChild(button);
    });
  }

  function embeddedMidiLibrary() {
    const data = window.WAVE_MIDI_LIBRARY;
    if (!data) return [];
    return Array.isArray(data) ? data : (Array.isArray(data.files) ? data.files : []);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function refreshMidiLibrary() {
    ui.libraryList.innerHTML = '<p class="library-message">Caricamento libreria…</p>';

    // Offline-first: library.js contiene sia l'elenco sia i byte MIDI in base64.
    const embedded = embeddedMidiLibrary();
    if (embedded.length) {
      midiLibrary = embedded;
      libraryLoaded = true;
      renderMidiLibrary();
      const mode = location.protocol === 'file:' ? 'modalità offline' : 'libreria incorporata';
      const generated = window.WAVE_MIDI_LIBRARY && window.WAVE_MIDI_LIBRARY.generatedAt;
      const updatedText = generated ? ` · aggiornata ${new Date(generated).toLocaleString('it-IT')}` : '';
      ui.libraryHint.innerHTML = `Brani disponibili: <strong>${midiLibrary.length}</strong> · ${mode}${updatedText} · cartella <code>midi/</code>`;
      return;
    }

    // Fallback per installazioni online più vecchie che espongono solo library.json.
    try {
      const response = await fetch(`./midi/library.json?wave=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      midiLibrary = Array.isArray(data) ? data : (Array.isArray(data.files) ? data.files : []);
      libraryLoaded = true;
      renderMidiLibrary();
      ui.libraryHint.innerHTML = `Brani disponibili: <strong>${midiLibrary.length}</strong> · cartella <code>midi/</code>`;
    } catch (err) {
      console.warn('Libreria MIDI non disponibile:', err);
      ui.libraryList.innerHTML = '<p class="library-message">Elenco non disponibile. Esegui <strong>aggiorna-elenco-midi.bat</strong> dopo aver aggiunto i file nella cartella <code>midi/</code>.</p>';
      ui.libraryHint.innerHTML = 'La libreria offline viene generata nel file <code>midi/library.js</code>.';
    }
  }

  async function loadMidiFromLibrary(file, title, button) {
    const buttons = [...ui.libraryList.querySelectorAll('.library-item')];
    buttons.forEach(b => b.classList.remove('loading'));
    if (button) button.classList.add('loading');

    try {
      const entry = embeddedMidiLibrary().find(item => {
        const entryFile = typeof item === 'string' ? item : item.file;
        return entryFile === file;
      });

      let buffer;
      if (entry && typeof entry === 'object' && entry.data) {
        buffer = base64ToArrayBuffer(entry.data);
      } else {
        const safePath = file.split('/').map(part => encodeURIComponent(part)).join('/');
        const response = await fetch(`./midi/${safePath}`);
        if (!response.ok) throw new Error(`File non trovato (HTTP ${response.status}).`);
        buffer = await response.arrayBuffer();
      }

      const parsed = parseMidi(buffer, title || file);
      currentLibraryFile = file;
      loadSong(parsed, title || prettyMidiTitle(file));
      renderMidiLibrary();
      closeLibrary();
    } catch (err) {
      console.error(err);
      alert(`Non riesco a caricare questo MIDI dalla libreria.\n\n${err.message}`);
      if (button) button.classList.remove('loading');
    }
  }

  // -------- Minimal Standard MIDI File parser --------
  function parseMidi(arrayBuffer, filename = 'MIDI caricato') {
    const data = new DataView(arrayBuffer);
    let pos = 0;
    const readU8 = () => data.getUint8(pos++);
    const readU16 = () => { const v = data.getUint16(pos, false); pos += 2; return v; };
    const readU32 = () => { const v = data.getUint32(pos, false); pos += 4; return v; };
    const readStr = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(readU8()); return s; };
    const readVLQ = () => {
      let value = 0, b, guard = 0;
      do { b = readU8(); value = (value << 7) | (b & 0x7f); guard++; } while ((b & 0x80) && guard < 5);
      return value >>> 0;
    };

    if (readStr(4) !== 'MThd') throw new Error('Il file non contiene un header MIDI valido.');
    const headerLen = readU32();
    const format = readU16();
    const tracks = readU16();
    const division = readU16();
    if (headerLen > 6) pos += headerLen - 6;
    if (division & 0x8000) throw new Error('La V1 supporta MIDI basati su PPQ, non SMPTE timecode.');
    const ppq = division || 480;

    const rawNotes = [];
    const tempos = [{ tick: 0, usPerQuarter: 500000 }];
    let maxTick = 0;

    for (let t = 0; t < tracks; t++) {
      if (readStr(4) !== 'MTrk') throw new Error('Traccia MIDI non valida.');
      const len = readU32();
      const end = pos + len;
      let tick = 0;
      let runningStatus = 0;

      while (pos < end) {
        tick += readVLQ();
        maxTick = Math.max(maxTick, tick);
        let status = readU8();
        if (status < 0x80) {
          pos--;
          if (!runningStatus) throw new Error('Running status MIDI non valido.');
          status = runningStatus;
        } else if (status < 0xf0) {
          runningStatus = status;
        }

        if (status === 0xff) {
          const metaType = readU8();
          const metaLen = readVLQ();
          if (metaType === 0x51 && metaLen === 3) {
            const us = (readU8() << 16) | (readU8() << 8) | readU8();
            tempos.push({ tick, usPerQuarter: us });
          } else {
            pos += metaLen;
          }
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const syxLen = readVLQ();
          pos += syxLen;
          continue;
        }

        const type = status & 0xf0;
        const channel = status & 0x0f;
        const d1 = readU8();
        if (type === 0xc0 || type === 0xd0) continue;
        const d2 = readU8();

        if (type === 0x90) {
          rawNotes.push({ tick, type: d2 === 0 ? 'off' : 'on', note: d1, velocity: d2, channel });
        } else if (type === 0x80) {
          rawNotes.push({ tick, type: 'off', note: d1, velocity: d2, channel });
        }
      }
      pos = end;
    }

    if (!rawNotes.length) throw new Error('Non ho trovato eventi Note On/Off nel MIDI.');

    tempos.sort((a, b) => a.tick - b.tick);
    const uniqueTempos = [];
    for (const tempo of tempos) {
      if (uniqueTempos.length && uniqueTempos[uniqueTempos.length - 1].tick === tempo.tick) uniqueTempos[uniqueTempos.length - 1] = tempo;
      else uniqueTempos.push(tempo);
    }

    let cumulativeSeconds = 0;
    for (let i = 0; i < uniqueTempos.length; i++) {
      uniqueTempos[i].seconds = cumulativeSeconds;
      if (i + 1 < uniqueTempos.length) {
        const dticks = uniqueTempos[i + 1].tick - uniqueTempos[i].tick;
        cumulativeSeconds += (dticks / ppq) * (uniqueTempos[i].usPerQuarter / 1e6);
      }
    }

    function tickToSeconds(tick) {
      let lo = 0, hi = uniqueTempos.length - 1, idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (uniqueTempos[mid].tick <= tick) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      const tempo = uniqueTempos[idx];
      return tempo.seconds + ((tick - tempo.tick) / ppq) * (tempo.usPerQuarter / 1e6);
    }

    const events = rawNotes.map(e => ({ ...e, time: tickToSeconds(e.tick) }));
    events.sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));
    const duration = Math.max(tickToSeconds(maxTick), events[events.length - 1].time + 0.4);
    const baseBpm = Math.round(60000000 / uniqueTempos[0].usPerQuarter);

    return { name: filename, events, duration, baseBpm, ppq, format, tracks };
  }

  ui.play.addEventListener('click', togglePlay);
  ui.stop.addEventListener('click', stopPlayback);
  ui.load.addEventListener('click', () => ui.input.click());
  ui.library.addEventListener('click', openLibrary);
  ui.libraryClose.addEventListener('click', closeLibrary);
  ui.libraryPanel.querySelector('[data-close-library]').addEventListener('click', closeLibrary);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.libraryPanel.classList.contains('open')) closeLibrary();
  });

  ui.input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseMidi(buffer, file.name);
      currentLibraryFile = null;
      loadSong(parsed, file.name);
    } catch (err) {
      console.error(err);
      alert(`Non riesco a leggere questo MIDI.\n\n${err.message}`);
    } finally {
      ui.input.value = '';
    }
  });

  ui.seek.addEventListener('input', () => {
    const target = (Number(ui.seek.value) / 1000) * song.duration;
    setPlayhead(target, isPlaying);
  });

  [ui.tempo, ui.intensity, ui.transpose, ui.complexity].forEach(el => el.addEventListener('input', () => {
    if (el === ui.transpose && audioCtx) {
      for (const [key, list] of voices.entries()) {
        const note = Number(key.split(':')[1]);
        list.forEach(v => v.osc.frequency.setTargetAtTime(midiToFreq(note), audioCtx.currentTime, 0.018));
      }
    }
    refreshControls();
  }));

  [ui.trace, ui.glow].forEach(el => el.addEventListener('input', refreshControls));
  ui.colorMode.addEventListener('change', refreshControls);

  ui.scenePicker.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scene]');
    if (!button) return;
    setScene(button.dataset.scene, false);
  });

  ui.autoScene.addEventListener('click', () => {
    autoScene = !autoScene;
    autoSceneTimer = 0;
    ui.autoScene.setAttribute('aria-pressed', autoScene ? 'true' : 'false');
    ui.autoScene.textContent = autoScene ? 'AUTO ON' : 'AUTO';
  });

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    updatePlayback(dt);
    drawVisual(dt);
    refreshTimeUI();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying) {
      isPlaying = false;
      ui.play.textContent = '▶';
      silenceAll();
    }
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  ui.eventCount.textContent = String(song.events.length);
  ui.sourceStatus.textContent = 'Demo interna';
  setScene('pure');
  refreshControls();
  requestAnimationFrame((now) => { lastFrame = now; frame(now); });
})();
