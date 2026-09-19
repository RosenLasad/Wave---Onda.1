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
    distortion: $('distortion'), distortionValue: $('distortionValue'), movement: $('movement'), movementValue: $('movementValue'),
    speed: $('speed'), speedValue: $('speedValue'), scale: $('scale'), scaleValue: $('scaleValue'), rotation: $('rotation'), rotationValue: $('rotationValue'),
    powerLow: $('powerLowBtn'), powerMedium: $('powerMediumBtn'), powerHigh: $('powerHighBtn'), powerButtons: $('powerButtons'),
    familyPicker: $('familyPicker'), scenePicker: $('scenePicker'), sceneDrawer: $('sceneDrawer'), sceneDrawerClose: $('sceneDrawerClose'), sceneFamilyLabel: $('sceneFamilyLabel'),
    autoScene: $('autoSceneBtn'), sceneDescription: $('sceneDescription'), sceneHud: $('sceneHud'), engineHud: $('engineHud'), sceneStatus: $('sceneStatus'),
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
  let currentScene = 'pure-pulse';
  let currentFamily = 'pure';
  let menuFamily = 'pure';
  let sceneDrawerOpen = false;
  let autoScene = false;
  let autoSceneTimer = 0;
  let visualObjects = [];
  let smoothLobes = 5;
  let canvasReady = false;
  // Smoothed musical metrics keep note on/off changes from jolting the whole composition.
  let smoothAvgPitch = 60;
  let smoothAvgVelocity = 0.18;
  let smoothSpeedScale = 1;


  const CONTROL_DEFAULTS = {
    tempo: 100,
    intensity: 100,
    transpose: 0,
    complexity: 6,
    trace: 42,
    glow: 55,
    distortion: 30,
    movement: 100,
    speed: 100,
    scale: 100,
    rotation: 0
  };

  const RESPONSE_PROFILES = {
    low: {
      label: 'Low',
      tempo: .58, intensity: .36, transpose: .60, complexity: .50,
      trace: .44, glow: .38, distortion: .28, movement: .42, speed: .45, scale: .48, rotation: .34
    },
    medium: {
      label: 'Medium',
      tempo: .80, intensity: .68, transpose: .82, complexity: .76,
      trace: .72, glow: .68, distortion: .62, movement: .74, speed: .74, scale: .76, rotation: .70
    },
    high: {
      label: 'High',
      tempo: 1, intensity: 1, transpose: 1, complexity: 1,
      trace: 1, glow: 1, distortion: 1, movement: 1, speed: 1, scale: 1, rotation: 1
    }
  };

  const CONTROL_LIST = ['tempo', 'intensity', 'transpose', 'complexity', 'trace', 'glow', 'distortion', 'movement', 'speed', 'scale', 'rotation'];
  let controlPower = 'medium';

  const FAMILIES = {
    pure: {
      label: 'Pure', icon: '◇', hue: 205, bg: [7, 9, 15], accent: '#8ad8ff',
      scenes: [
        { id: 'pure-pulse', label: 'Pulse', engine: 'Polygon Pulse', variant: 'pulse', description: 'Poligoni armonici che respirano sulle note, con simmetrie elastiche e attacchi molto reattivi.' },
        { id: 'pure-prism', label: 'Prism', engine: 'Sharp Prism', variant: 'prism', description: 'Geometria più tagliente: punte, rifrazioni e profili angolari diventano estremi con Distorsione e Intensità.' },
        { id: 'pure-kaleido', label: 'Kaleido', engine: 'Kaleido Fold', variant: 'kaleido', description: 'Strati controrotanti e simmetrie multiple creano un caleidoscopio musicale sempre più fitto.' },
        { id: 'pure-corridor', label: 'Corridor', engine: 'Perspective Corridor', variant: 'corridor', description: 'Cornici geometriche avanzano e arretrano verso un punto di fuga, sovrapponendosi in profondit\u00e0 come una coreografia astratta.' }
      ]
    },
    ocean: {
      label: 'Ocean', icon: '≈', hue: 196, bg: [5, 13, 20], accent: '#39a9ff',
      scenes: [
        { id: 'ocean-tide', label: 'Tide', engine: 'Layered Tide', variant: 'tide', description: 'Onde ampie e stratificate, morbide ai valori bassi e molto profonde quando aumentano Movimento e Intensità.' },
        { id: 'ocean-current', label: 'Current', engine: 'Cross Current', variant: 'current', description: 'Correnti sovrapposte scorrono a velocità diverse e si incrociano seguendo tonalità, ritmo e complessità.' },
        { id: 'ocean-storm', label: 'Storm', engine: 'Storm Surface', variant: 'storm', description: 'La superficie diventa nervosa e tempestosa: armoniche rapide, picchi e scie luminose reagiscono agli attacchi.' },
        { id: 'ocean-abyss', label: 'Abyss', engine: 'Deep Perspective Sea', variant: 'abyss', description: 'Un oceano profondo a strati: onde lontane, foschia, particelle e piani prospettici danno la sensazione di guardare dentro un abisso musicale.' }
      ]
    },
    hills: {
      label: 'Hills', icon: '⌁', hue: 142, bg: [7, 15, 13], accent: '#62d98b',
      scenes: [
        { id: 'hills-meadow', label: 'Meadow', engine: 'Soft Ridge', variant: 'meadow', description: 'Profili morbidi e profondità lenta, come un paesaggio che respira assieme alla melodia.' },
        { id: 'hills-ridge', label: 'Ridge', engine: 'Angular Ridge', variant: 'ridge', description: 'Rilievi più netti e verticali: la Distorsione trasforma le colline in creste e picchi quasi grafici.' },
        { id: 'hills-echo', label: 'Echo', engine: 'Echo Landscape', variant: 'echo', description: 'Più profili si inseguono come echi prospettici; Scia e Complessità possono riempire lo spazio di rilievi.' },
        { id: 'hills-valley', label: 'Valley', engine: 'Atmospheric Valley', variant: 'valley', description: 'Colline a strati aprono una valle prospettica con foschia e linee di profondita, come un paesaggio astratto attraversato dalla musica.' }
      ]
    },
    desert: {
      label: 'Desert', icon: '∿', hue: 35, bg: [19, 12, 8], accent: '#ffad54',
      scenes: [
        { id: 'desert-dune', label: 'Dune', engine: 'Slow Dunes', variant: 'dune', description: 'Dune ampie e lente scorrono in profondità con curvature guidate dalla tonalità.' },
        { id: 'desert-mirage', label: 'Mirage', engine: 'Mirage Lines', variant: 'mirage', description: 'Linee sottili e riflessi ondulati producono un miraggio instabile che aumenta con Distorsione e Glow.' },
        { id: 'desert-wind', label: 'Wind', engine: 'Wind Carve', variant: 'wind', description: 'Il vento scolpisce dune più rapide e striature luminose, con movimento laterale accentuato dal ritmo.' },
        { id: 'desert-sun-gate', label: 'Sun Gate', engine: 'Sun Gate', variant: 'sun-gate', description: 'Un sole geometrico domina l\u2019orizzonte mentre dune e linee prospettiche formano un grande portale desertico in movimento.' }
      ]
    },
    bubbles: {
      label: 'Bubbles', icon: '○', hue: 185, bg: [7, 10, 16], accent: '#50e1d7',
      scenes: [
        { id: 'bubbles-drift', label: 'Drift', engine: 'Bubble Drift', variant: 'drift', description: 'Bolle musicali salgono e oscillano: ogni attacco ne determina dimensione, quota, colore e luminosità.' },
        { id: 'bubbles-orbit', label: 'Orbit', engine: 'Bubble Orbit', variant: 'orbit', description: 'Le bolle orbitano attorno al centro creando anelli vivi e controrotanti, molto sensibili a Scala e Rotazione.' },
        { id: 'bubbles-burst', label: 'Burst', engine: 'Bubble Burst', variant: 'burst', description: 'Gli attacchi esplodono dal centro in grappoli di bolle; Movimento e Intensità rendono l’espansione molto più energica.' },
        { id: 'bubbles-depth-drift', label: 'Depth Drift', engine: 'Depth Drift', variant: 'depth-drift', description: 'Bolle su molti piani avanzano verso l\u2019osservatore e si allontanano, con scala, trasparenza e parallax che simulano una vera profondit\u00e0.' }
      ]
    },
    birds: {
      label: 'Birds', icon: '⌄', hue: 48, bg: [12, 13, 16], accent: '#ffd45a',
      scenes: [
        { id: 'birds-flock', label: 'Flock', engine: 'Flock Lines', variant: 'flock', description: 'Uno stormo di piccoli segni a V segue altezza delle note, ritmo e dinamica.' },
        { id: 'birds-glide', label: 'Glide', engine: 'Wide Glide', variant: 'glide', description: 'Ali più larghe e movimenti lenti creano planate sospese che reagiscono dolcemente agli accordi.' },
        { id: 'birds-rush', label: 'Rush', engine: 'Rush Flock', variant: 'rush', description: 'Stormi rapidi e numerosi attraversano la scena; Complessità e Movimento possono trasformarli in sciami.' },
        { id: 'birds-migration', label: 'Migration', engine: 'Perspective Migration', variant: 'migration', description: 'Stormi su pi\u00f9 piani attraversano un cielo profondo: gli uccelli lontani scorrono lentamente, quelli vicini passano davanti alla camera.' }
      ]
    },
    galaxy: {
      label: 'Galaxy', icon: '✦', hue: 266, bg: [6, 7, 14], accent: '#a879ff',
      scenes: [
        { id: 'galaxy-spiral', label: 'Spiral', engine: 'Spiral Galaxy', variant: 'spiral', description: 'Bracci galattici, stelle e note in orbita ruotano attorno a un nucleo luminoso.' },
        { id: 'galaxy-rings', label: 'Rings', engine: 'Orbital Rings', variant: 'rings', description: 'Anelli ellittici multipli e satelliti musicali costruiscono un sistema orbitale ordinato ma molto deformabile.' },
        { id: 'galaxy-warp', label: 'Warp', engine: 'Star Warp', variant: 'warp', description: 'Stelle e scie radiali simulano un’accelerazione nello spazio; Movimento, Tempo e Scia diventano protagonisti.' },
        { id: 'galaxy-tunnel', label: 'Tunnel', engine: 'Star Tunnel', variant: 'tunnel', description: 'Anelli, stelle e particelle corrono dal punto di fuga verso lo spettatore in un tunnel cosmico musicale, molto efficace con Scia e Glow.' }
      ]
    },
    bloom: {
      label: 'Bloom', icon: '✺', hue: 326, bg: [14, 7, 14], accent: '#ff6fcf',
      scenes: [
        { id: 'bloom-petals', label: 'Petals', engine: 'Harmonic Bloom', variant: 'petals', description: 'Petali armonici sbocciano con gli accordi e cambiano densità con la Complessità.' },
        { id: 'bloom-mandala', label: 'Mandala', engine: 'Rotating Mandala', variant: 'mandala', description: 'Rosette concentriche e controrotanti formano una mandala musicale, ideale con Glow e Scia elevati.' },
        { id: 'bloom-nova', label: 'Nova', engine: 'Bloom Nova', variant: 'nova', description: 'I petali si allungano in esplosioni radiali: gli attacchi forti producono vere aperture luminose.' },
        { id: 'bloom-cathedral', label: 'Cathedral', engine: 'Living Rose Window', variant: 'cathedral', description: 'Rosoni e archi geometrici si sovrappongono in profondit\u00e0 come una vetrata viva, espandendosi e contraendosi con la musica.' }
      ]
    }
  };

  const SCENES = {};
  for (const [familyKey, family] of Object.entries(FAMILIES)) {
    for (const scene of family.scenes) SCENES[scene.id] = { ...scene, family: familyKey };
  }
  const FAMILY_ORDER = Object.keys(FAMILIES);
  const SCENE_ORDER = FAMILY_ORDER.flatMap(key => FAMILIES[key].scenes.map(scene => scene.id));

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
    const safeLevel = 0.16 * Math.sqrt(Math.max(0.2, intensity));
    masterGain.gain.setTargetAtTime(Math.min(0.27, safeLevel), audioCtx.currentTime, 0.03);
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
    const scene = SCENES[currentScene];
    const complexity = Number(ui.complexity.value);
    const movement = Number(ui.movement.value) / 100;

    if (scene.family === 'bubbles') {
      const extra = scene.variant === 'burst' ? 2 : scene.variant === 'orbit' ? 1 : 0;
      const copies = 1 + extra + Math.floor(complexity / 3);
      for (let i = 0; i < copies; i++) {
        const angle = seed * Math.PI * 2 + i * (Math.PI * 2 / Math.max(1, copies));
        const mode = scene.variant;
        visualObjects.push({
          kind: 'bubble', mode,
          x: mode === 'burst' ? .5 : (seed + i * .19) % 1,
          y: mode === 'burst' ? .5 : 1.08 + i * .025,
          r: .014 + v * .034 + i * .0025,
          drift: (seed - .5) * .07,
          speed: (.05 + pitch * .10 + v * .07) * (.55 + movement * .65),
          vx: Math.cos(angle) * (.08 + v * .13), vy: Math.sin(angle) * (.08 + v * .13),
          angle, orbitR: .10 + pitch * .28 + i * .012,
          age: 0, life: mode === 'orbit' ? 10 : 6 + v * 5,
          pitch, velocity: v, wobble: seed * Math.PI * 2
        });
      }
    } else if (scene.family === 'birds') {
      const boost = scene.variant === 'rush' ? 2 : 0;
      const copies = 1 + boost + Math.floor(complexity / 2.6);
      for (let i = 0; i < copies; i++) {
        visualObjects.push({
          kind: 'bird', mode: scene.variant,
          x: -.12 - i * .035, y: .78 - pitch * .58 + (i - copies / 2) * .024,
          speed: (.08 + v * .16) * (scene.variant === 'rush' ? 1.55 : scene.variant === 'glide' ? .62 : 1),
          age: 0, life: scene.variant === 'rush' ? 6 : 10,
          size: .012 + v * .019, pitch, velocity: v, flap: seed * Math.PI * 2
        });
      }
    } else if (scene.family === 'galaxy') {
      const copies = 1 + Math.floor(complexity / 4);
      for (let i = 0; i < copies; i++) {
        visualObjects.push({ kind: 'spark', mode: scene.variant, angle: seed * Math.PI * 2 + i * .7, radius: .10 + pitch * .36, age: 0, life: 2.2 + v * 2, pitch, velocity: v });
      }
    }
    if (visualObjects.length > 260) visualObjects.splice(0, visualObjects.length - 260);
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


  function getControlResponse(name) {
    return RESPONSE_PROFILES[controlPower]?.[name] ?? 1;
  }

  function getEffectiveControl(name) {
    const raw = Number(ui[name].value);
    const neutral = CONTROL_DEFAULTS[name] ?? 0;
    const response = getControlResponse(name);
    return neutral + (raw - neutral) * response;
  }

  function visualSpeedFromControl(value) {
    const v = Math.max(25, Number(value));
    if (v <= 100) return Math.max(.25, v / 100);
    const t = clamp((v - 100) / 700, 0, 1);
    return 1 + Math.pow(t, 1.42) * 7;
  }

  function targetVisualSpeedScale() {
    return visualSpeedFromControl(getEffectiveControl('speed'));
  }

  function syncPowerButtons() {
    [ui.powerLow, ui.powerMedium, ui.powerHigh].forEach((button) => {
      if (!button) return;
      const active = button.dataset.power === controlPower;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setControlPower(level) {
    if (!RESPONSE_PROFILES[level]) return;
    controlPower = level;
    syncPowerButtons();
    refreshControls();
  }

  function getResetValue(name) {
    return CONTROL_DEFAULTS[name] ?? 0;
  }

  function resetControl(name) {
    const input = ui[name];
    if (!input) return;
    input.value = String(getResetValue(name));
    if (name === 'transpose' && audioCtx) {
      for (const [key, list] of voices.entries()) {
        const note = Number(key.split(':')[1]);
        list.forEach(v => v.osc.frequency.setTargetAtTime(midiToFreq(note), audioCtx.currentTime, 0.018));
      }
    }
    refreshControls();
    const button = document.querySelector(`.control-reset[data-reset-for="${name}"]`);
    if (button) {
      button.classList.add('pulse');
      setTimeout(() => button.classList.remove('pulse'), 180);
    }
  }

  function installResetButtons() {
    document.querySelectorAll('.vertical-control').forEach((control) => {
      const input = control.querySelector('input[type="range"]');
      const label = control.querySelector('label');
      if (!input || !label || control.querySelector('.control-reset')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'control-reset';
      button.dataset.resetFor = input.id;
      button.setAttribute('aria-label', `Reset ${label.textContent.replace(/\s+/g, ' ').trim()}`);
      button.textContent = '↺';
      button.addEventListener('click', () => resetControl(input.id));
      control.appendChild(button);
    });
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function getMetrics(dt, W, H) {
    const notes = [...activeVisualNotes.values()];
    const count = notes.length;
    const complexity = getEffectiveControl('complexity');
    const intensity = getEffectiveControl('intensity') / 100;
    const tempoScale = getEffectiveControl('tempo') / 100;
    const targetSpeedScale = targetVisualSpeedScale();
    const speedFollow = 1 - Math.exp(-dt * (targetSpeedScale > smoothSpeedScale ? 4.8 : 3.2));
    smoothSpeedScale = lerp(smoothSpeedScale, targetSpeedScale, speedFollow);
    const speedScale = smoothSpeedScale;
    const transpose = getEffectiveControl('transpose');
    const distortion = getEffectiveControl('distortion') / 100;
    const movement = getEffectiveControl('movement') / 100;
    const scale = getEffectiveControl('scale') / 100;
    const rotation = getEffectiveControl('rotation') / 100;
    const traceLevel = clamp(getEffectiveControl('trace'), 0, 100) / 100;
    const glowLevel = clamp(getEffectiveControl('glow'), 0, 150) / 100;
    const targetAvgPitch = count ? notes.reduce((sum, n) => sum + n.note + transpose, 0) / count : 60 + transpose;
    const targetAvgVelocity = count ? notes.reduce((sum, n) => sum + n.velocity, 0) / count / 127 : 0.18;
    // Notes enter and leave discretely in MIDI. Interpolate their aggregate values so
    // geometry follows the music without making frame-to-frame jumps.
    const pitchFollow = 1 - Math.exp(-dt * (count ? 6.2 : 1.7));
    const velocityFollow = 1 - Math.exp(-dt * (count ? 8.5 : 2.8));
    smoothAvgPitch = lerp(smoothAvgPitch, targetAvgPitch, pitchFollow);
    smoothAvgVelocity = lerp(smoothAvgVelocity, targetAvgVelocity, velocityFollow);
    const avgPitch = smoothAvgPitch;
    const avgVelocity = smoothAvgVelocity;
    const pitchNorm = clamp((avgPitch - 30) / 72);
    const tonalWarp = clamp(transpose / 24, -1, 1);
    const energy = Math.pow(Math.max(.08, intensity), 1.28) * (.45 + avgVelocity * .85 + clamp(pulse) * .42);
    phase += dt * (.12 + Math.max(.08, speedScale) * 1.98);
    pulse *= Math.pow(0.11, dt);
    return {
      dt, W, H, cx: W / 2, cy: H / 2, notes, count, complexity, intensity, tempoScale, speedScale,
      transpose, avgPitch, avgVelocity, pitchNorm, pulse, distortion, movement, scale, rotation, tonalWarp, energy, traceLevel, glowLevel,
      scene: SCENES[currentScene], family: FAMILIES[currentFamily],
      baseRadius: Math.min(W, H) * (.145 + pitchNorm * .105 + clamp(pulse / 2) * .09 * Math.min(2.2, energy))
    };
  }

  function colorFor(m, offset = 0, alpha = 1, hueOverride = null) {
    const mode = ui.colorMode.value;
    const anchor = hueOverride == null ? m.family.hue : hueOverride;
    let hue;
    if (mode === 'mono') {
      hue = anchor + m.transpose * 5.5;
    } else if (mode === 'gradient') {
      hue = anchor + m.pitchNorm * 62 + offset * 118 + m.transpose * 7.5;
    } else if (mode === 'spectrum') {
      hue = m.phaseHue + offset * 360 + m.pitchNorm * 190 + m.transpose * 3;
    } else {
      hue = anchor + (m.avgPitch - 60) * 4.2 + offset * 58 + m.transpose * 6.5 + phase * m.speedScale * 4.2;
    }
    hue = mod(hue, 360);
    const saturation = clamp(58 + m.intensity * 15 + m.avgVelocity * 21 + m.glowBoost * 4, 48, 100);
    const lightness = clamp(45 + m.avgVelocity * 25 + clamp(m.pulse) * 9 + Math.min(2, m.intensity) * 3, 34, 84);
    return `hsla(${hue.toFixed(1)},${saturation.toFixed(1)}%,${lightness.toFixed(1)}%,${clamp(alpha, 0, 1)})`;
  }

  function setGlow(color, m, factor = 1) {
    const amount = m.glowLevel;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.pow(Math.max(0, amount), 1.25) * (14 + Math.min(3, m.energy) * 27) * factor;
  }

  function resetGlow() {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function paintBackground(m) {
    const trace = m.traceLevel;
    const fade = canvasReady ? lerp(.91, .014, Math.pow(trace, .72)) : 1;
    resetGlow();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba(m.family.bg, fade);
    ctx.fillRect(0, 0, m.W, m.H);
    canvasReady = true;

    const radius = Math.max(m.W, m.H) * (.46 + m.energy * .07);
    const glow = ctx.createRadialGradient(m.cx, m.cy * .92, 0, m.cx, m.cy, radius);
    glow.addColorStop(0, colorFor(m, .05, .025 + Math.min(.08, m.energy * .018)));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, m.W, m.H);
  }

  function drawQuietLine(m) {
    const length = Math.min(m.W * .62, 430);
    const wobble = Math.sin(phase * 1.25) * (2 + 8 * m.movement) * (.35 + m.intensity);
    ctx.beginPath();
    const segments = 44;
    for (let i = 0; i <= segments; i++) {
      const x = m.cx - length / 2 + length * i / segments;
      const envelope = Math.sin(Math.PI * i / segments);
      const y = m.cy + Math.sin(i * (.54 + m.distortion * .2) + phase) * wobble * envelope;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const c = colorFor(m, 0, .68);
    setGlow(c, m, .55);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1 + Math.min(3, m.energy) * .55;
    ctx.stroke();
    resetGlow();
  }


  function renderPureCorridor(m) {
    const frames = 8 + Math.floor(m.complexity * .85);
    const vx = m.cx + Math.sin(phase * .075) * m.W * .018 * m.movement;
    const vy = m.H * (.47 + (m.pitchNorm - .5) * .035);
    const speed = .010 + m.speedScale * .010 + m.movement * .006;

    const corners = [[0,0],[m.W,0],[m.W,m.H],[0,m.H]];
    ctx.lineWidth = .55;
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      ctx.strokeStyle = colorFor(m, i * .12, .09, 205 + i * 8);
      ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }

    for (let i = frames - 1; i >= 0; i--) {
      const z = mod(i / frames + phase * speed, 1);
      const p = Math.pow(z, 2.15);
      const pulsePush = 1 + clamp(m.pulse) * .08 * (1 - z);
      const halfW = lerp(m.W * .018, m.W * .57, p) * pulsePush;
      const halfH = lerp(m.H * .014, m.H * .48, p) * pulsePush;
      const skew = Math.sin(phase * .18 + i * .9) * m.distortion * halfW * .12;
      const breathe = Math.sin(phase * (.34 + m.movement * .22) + i * .7) * m.distortion * halfH * .06;
      const alpha = .10 + z * .58;
      const c = colorFor(m, z + i * .035, alpha, 198 + z * 42);
      setGlow(c, m, .18 + z * .72);
      ctx.strokeStyle = c;
      ctx.lineWidth = .55 + z * (1.25 + m.energy * .25);
      ctx.beginPath();
      ctx.moveTo(vx - halfW + skew, vy - halfH + breathe);
      ctx.lineTo(vx + halfW + skew, vy - halfH - breathe);
      ctx.lineTo(vx + halfW - skew, vy + halfH + breathe);
      ctx.lineTo(vx - halfW - skew, vy + halfH - breathe);
      ctx.closePath(); ctx.stroke();
    }

    const notes = m.notes.slice(0, 9);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const pn = clamp((n.note + m.transpose - 30) / 72);
      const z = mod(pn + phase * .012 * (1 + m.movement), 1);
      const spread = Math.pow(z, 1.9);
      const a = i * 2.399 + phase * .08;
      const x = vx + Math.cos(a) * m.W * .34 * spread;
      const y = vy + Math.sin(a) * m.H * .30 * spread;
      const r = 1.2 + spread * (3.2 + n.velocity / 127 * 4.5);
      const c = colorFor(m, pn, .34 + z * .52, 210 + pn * 80);
      setGlow(c, m, .9);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    resetGlow();
  }

  function renderOceanAbyss(m) {
    const horizon = m.H * .27;
    const layers = 7 + Math.floor(m.complexity * .8);
    const halo = ctx.createRadialGradient(m.cx, horizon, 0, m.cx, horizon, Math.max(m.W, m.H) * .55);
    halo.addColorStop(0, colorFor(m, .18, .055 + m.energy * .012, 190));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, m.W, m.H);

    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) / layers;
      const depth = Math.pow(z, 1.45);
      const y0 = lerp(horizon, m.H * .93, depth);
      const amp = m.H * (.005 + depth * (.047 + m.energy * .008));
      const freq = 1.0 + layer * .18 + m.pitchNorm * .8;
      const drift = phase * (.38 + m.movement * .52) * (1 + depth * .55);
      ctx.beginPath();
      for (let x = -8; x <= m.W + 8; x += 4) {
        const q = x / m.W;
        const wave = Math.sin(q * Math.PI * 2 * freq + drift + layer * .5)
          + (.28 + m.distortion * .24) * Math.sin(q * Math.PI * 2 * (freq * 2.2) - drift * .72 + layer)
          + m.distortion * .12 * Math.sin(q * Math.PI * 2 * 7.4 + drift * 1.5);
        const y = y0 + wave * amp + clamp(m.pulse) * (1 - depth) * 4;
        if (x < 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, z * .7, .10 + z * .50, 188 + z * 35);
      setGlow(c, m, .10 + z * .52);
      ctx.strokeStyle = c; ctx.lineWidth = .45 + z * (1.45 + m.energy * .18); ctx.stroke();
    }

    const motes = 18 + Math.floor(m.complexity * 2.2);
    for (let i = 0; i < motes; i++) {
      const z = pseudo(i * 7 + 2);
      const rise = mod(pseudo(i * 9 + 3) - phase * (.003 + .007 * m.movement) * (1 + z), 1);
      const x = pseudo(i * 11 + 4) * m.W;
      const y = horizon + rise * (m.H - horizon);
      const r = .35 + z * 1.7;
      ctx.fillStyle = colorFor(m, z, .08 + z * .22, 195 + z * 22);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    resetGlow();
  }

  function renderHillsValley(m) {
    const horizon = m.H * .32;
    const vx = m.cx + Math.sin(phase * .055) * m.W * .012 * m.movement;
    const layers = 6 + Math.floor(m.complexity * .55);

    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) / layers;
      const depth = Math.pow(z, 1.45);
      const baseline = lerp(horizon + m.H * .035, m.H * .82, depth);
      const amp = lerp(m.H * .025, m.H * .18, depth) * (1 + m.energy * .05);
      ctx.beginPath(); ctx.moveTo(-10, m.H + 10);
      for (let x = -10; x <= m.W + 10; x += 5) {
        const q = x / m.W;
        const side = Math.pow(Math.abs(q - .5) * 2, .65);
        const texture = .72 + .22 * Math.sin(q * Math.PI * (2.1 + layer * .12) + layer + phase * .08 * m.movement)
          + m.distortion * .12 * Math.sin(q * Math.PI * 7.2 + layer * .5);
        const valley = side * amp * texture;
        const y = baseline - valley;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(m.W + 10, m.H + 10); ctx.closePath();
      ctx.fillStyle = colorFor(m, z * .45, .018 + z * .060, 136 + z * 28); ctx.fill();
      ctx.strokeStyle = colorFor(m, z * .45, .14 + z * .34, 138 + z * 24);
      ctx.lineWidth = .45 + z * 1.0; ctx.stroke();
    }

    const roadPulse = 1 + clamp(m.pulse) * .05;
    ctx.strokeStyle = colorFor(m, .2, .22, 150); ctx.lineWidth = .7;
    for (let side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(vx + side * 4, horizon + 2); ctx.lineTo(m.cx + side * m.W * .16 * roadPulse, m.H); ctx.stroke();
    }
    const cross = 7 + Math.floor(m.complexity * .45);
    for (let i = 1; i <= cross; i++) {
      const z = i / (cross + 1);
      const p = Math.pow(z, 2.1);
      const y = lerp(horizon + 4, m.H, p);
      const half = lerp(5, m.W * .16, p);
      ctx.strokeStyle = colorFor(m, z, .06 + z * .12, 155);
      ctx.beginPath(); ctx.moveTo(vx - half, y); ctx.lineTo(vx + half, y); ctx.stroke();
    }

    const fogBands = 3;
    for (let i = 0; i < fogBands; i++) {
      const y = horizon + m.H * (.06 + i * .07);
      ctx.strokeStyle = colorFor(m, i * .2, .045, 170);
      ctx.lineWidth = 4 + i * 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(m.W, y); ctx.stroke();
    }
    resetGlow();
  }

  function renderDesertSunGate(m) {
    const horizon = m.H * .47;
    const minDim = Math.min(m.W, m.H);
    const sunR = minDim * (.105 + clamp(m.pulse) * .018 + m.energy * .006);
    const sun = ctx.createRadialGradient(m.cx, horizon, 0, m.cx, horizon, sunR * 2.6);
    sun.addColorStop(0, colorFor(m, .15, .58, 48));
    sun.addColorStop(.32, colorFor(m, .08, .23, 38));
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(m.cx, horizon, sunR * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colorFor(m, .12, .22 + m.avgVelocity * .18, 43);
    ctx.beginPath(); ctx.arc(m.cx, horizon, sunR, 0, Math.PI * 2); ctx.fill();

    const layers = 5 + Math.floor(m.complexity * .45);
    for (let layer = 0; layer < layers; layer++) {
      const z = (layer + 1) / layers;
      const baseline = lerp(horizon + 6, m.H * .88, Math.pow(z, 1.35));
      const amp = lerp(m.H * .018, m.H * .10, z) * (1 + m.distortion * .15);
      ctx.beginPath(); ctx.moveTo(-8, m.H + 8);
      for (let x = -8; x <= m.W + 8; x += 5) {
        const q = x / m.W;
        const dune = Math.sin(q * Math.PI * 2 * (.72 + layer * .09) + layer * .8 + phase * .055 * m.movement)
          + .22 * Math.sin(q * Math.PI * 2 * 1.7 - layer);
        ctx.lineTo(x, baseline - dune * amp);
      }
      ctx.lineTo(m.W + 8, m.H + 8); ctx.closePath();
      ctx.fillStyle = colorFor(m, z * .3, .025 + z * .055, 27 + z * 12); ctx.fill();
      ctx.strokeStyle = colorFor(m, z * .28, .12 + z * .30, 31 + z * 13); ctx.lineWidth = .5 + z * .85; ctx.stroke();
    }

    const rays = 11 + Math.floor(m.complexity * .5);
    for (let i = 0; i <= rays; i++) {
      const bx = m.W * i / rays;
      ctx.strokeStyle = colorFor(m, i / rays, .045 + m.energy * .008, 40);
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(m.cx, horizon + 4); ctx.lineTo(bx, m.H); ctx.stroke();
    }
    const bands = 8;
    for (let i = 1; i <= bands; i++) {
      const z = i / (bands + 1);
      const p = Math.pow(z, 2.2);
      const y = lerp(horizon + 5, m.H, p);
      ctx.strokeStyle = colorFor(m, z, .04 + z * .08, 42);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(m.W, y); ctx.stroke();
    }
    resetGlow();
  }

  function renderBubblesDepthDrift(m) {
    const minDim = Math.min(m.W, m.H);
    const count = 28 + Math.floor(m.complexity * 4.2);
    for (let i = 0; i < count; i++) {
      const speed = .004 + pseudo(i * 7 + 1) * .005 + m.movement * .004;
      const z = mod(pseudo(i * 5 + 2) + phase * speed, 1);
      const p = Math.pow(z, 2.0);
      const angle = pseudo(i * 9 + 4) * Math.PI * 2 + phase * .015 * (i % 2 ? -1 : 1);
      const spread = minDim * (.02 + p * .66);
      const wobble = Math.sin(phase * (.16 + pseudo(i) * .25) + i) * m.distortion * minDim * .012 * z;
      const x = m.cx + Math.cos(angle) * spread + wobble;
      const y = m.cy + Math.sin(angle) * spread * .70 - wobble * .45;
      const r = minDim * (.003 + p * (.027 + pseudo(i + 20) * .018)) * (1 + m.energy * .035);
      const alpha = .08 + z * .68;
      const c = colorFor(m, pseudo(i + 40), alpha, 176 + z * 45);
      setGlow(c, m, .08 + z * .62);
      ctx.strokeStyle = c; ctx.lineWidth = .45 + z * 1.45;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      if (r > 3) {
        ctx.strokeStyle = colorFor(m, pseudo(i + 50), alpha * .42, 205);
        ctx.lineWidth = .55;
        ctx.beginPath(); ctx.arc(x - r * .22, y - r * .25, r * .42, Math.PI * 1.05, Math.PI * 1.52); ctx.stroke();
      }
    }
    if (m.pulse > .04) {
      const r = minDim * (.05 + clamp(m.pulse) * .16);
      ctx.strokeStyle = colorFor(m, .5, clamp(m.pulse) * .24, 190);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(m.cx, m.cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    resetGlow();
  }

  function renderBirdsMigration(m) {
    const horizon = m.H * .36;
    const sky = ctx.createRadialGradient(m.cx, horizon, 0, m.cx, horizon, Math.max(m.W, m.H) * .72);
    sky.addColorStop(0, colorFor(m, .2, .038 + m.energy * .006, 50));
    sky.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, m.W, m.H);

    const count = 18 + Math.floor(m.complexity * 2.8);
    for (let i = 0; i < count; i++) {
      const depth = .12 + pseudo(i * 7 + 1) * .88;
      const lane = pseudo(i * 11 + 3);
      const speed = (.010 + depth * .018) * (.45 + m.movement * .75) * m.speedScale;
      const travel = mod(pseudo(i * 5 + 2) + phase * speed, 1.35) - .16;
      const x = travel * m.W;
      const y = horizon + (lane - .5) * m.H * (.16 + depth * .34) + Math.sin(phase * .12 + i) * 3 * depth;
      const size = Math.min(m.W, m.H) * (.004 + depth * depth * .030) * (1 + m.energy * .04);
      const flap = Math.sin(phase * (2.2 + depth * 3.5) * m.movement + i * 1.7);
      const wing = size * (.16 + flap * (.24 + m.distortion * .18));
      const c = colorFor(m, depth, .10 + depth * .64, 46 + depth * 18);
      setGlow(c, m, .05 + depth * .24);
      ctx.strokeStyle = c; ctx.lineWidth = .45 + depth * 1.2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - size, y + wing);
      ctx.quadraticCurveTo(x - size * .42, y - size * .18, x, y);
      ctx.quadraticCurveTo(x + size * .42, y - size * .18, x + size, y + wing);
      ctx.stroke();
    }
    ctx.strokeStyle = colorFor(m, .1, .07, 54);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(m.W, horizon); ctx.stroke();
    resetGlow();
  }

  function renderGalaxyTunnel(m) {
    const minDim = Math.min(m.W, m.H);
    const vx = m.cx + Math.sin(phase * .07) * m.W * .022 * m.movement;
    const vy = m.cy + Math.cos(phase * .055) * m.H * .018 * m.movement;
    const rings = 9 + Math.floor(m.complexity * .55);
    const speed = .012 + m.speedScale * .016 + m.movement * .008;

    for (let i = rings - 1; i >= 0; i--) {
      const z = mod(i / rings + phase * speed, 1);
      const p = Math.pow(z, 2.15);
      const r = minDim * (.018 + p * .57);
      const squash = .72 + Math.sin(i * .7 + phase * .08) * m.distortion * .06;
      const c = colorFor(m, z + i * .05, .08 + z * .44, 252 + z * 70);
      setGlow(c, m, .12 + z * .66);
      ctx.strokeStyle = c; ctx.lineWidth = .45 + z * 1.15;
      ctx.beginPath(); ctx.ellipse(vx, vy, r, r * squash, phase * .035 * (i % 2 ? -1 : 1) * m.movement, 0, Math.PI * 2); ctx.stroke();
    }

    const stars = 72 + Math.floor(m.complexity * 8);
    for (let i = 0; i < stars; i++) {
      const z = mod(pseudo(i * 5 + 1) + phase * speed * (.55 + pseudo(i) * .8), 1);
      const p = Math.pow(z, 2.0);
      const a = pseudo(i * 9 + 3) * Math.PI * 2 + phase * .012 * (i % 2 ? -1 : 1);
      const r = minDim * (.02 + p * .62);
      const x = vx + Math.cos(a) * r;
      const y = vy + Math.sin(a) * r * .72;
      const len = 1 + z * (3 + m.energy * 4 + m.distortion * 6);
      const c = colorFor(m, pseudo(i + 90), .09 + z * .55, 250 + pseudo(i) * 90);
      ctx.strokeStyle = c; ctx.lineWidth = .4 + z * 1.1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * .72); ctx.stroke();
    }

    if (m.pulse > .03) {
      const r = minDim * (.04 + clamp(m.pulse) * .24);
      ctx.strokeStyle = colorFor(m, .5, clamp(m.pulse) * .30, 300);
      ctx.lineWidth = 1 + m.energy * .2;
      ctx.beginPath(); ctx.ellipse(vx, vy, r, r * .72, 0, 0, Math.PI * 2); ctx.stroke();
    }
    resetGlow();
  }

  function drawCathedralRose(m, cx, cy, r, alpha, spin, petals) {
    const inner = r * .24;
    for (let i = 0; i < petals; i++) {
      const a = spin + i * Math.PI * 2 / petals;
      const a2 = a + Math.PI * 2 / petals;
      const mid = (a + a2) * .5;
      const x0 = cx + Math.cos(a) * inner;
      const y0 = cy + Math.sin(a) * inner;
      const x1 = cx + Math.cos(mid) * r;
      const y1 = cy + Math.sin(mid) * r;
      const x2 = cx + Math.cos(a2) * inner;
      const y2 = cy + Math.sin(a2) * inner;
      const c = colorFor(m, i / petals, alpha, 316 + i * 2.6);
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x1, y1, x2, y2);
      ctx.quadraticCurveTo(cx + Math.cos(mid) * inner * .60, cy + Math.sin(mid) * inner * .60, x0, y0);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy, inner * .72, 0, Math.PI * 2);
    ctx.strokeStyle = colorFor(m, .5, alpha * .75, 326); ctx.stroke();
  }

  function renderBloomCathedral(m) {
    const minDim = Math.min(m.W, m.H);
    const cx = m.cx;
    const cy = m.cy * .93;
    const archLayers = 4 + Math.floor(m.complexity * .34);
    for (let i = archLayers - 1; i >= 0; i--) {
      const z = (i + 1) / archLayers;
      const half = m.W * (.12 + z * .34);
      const baseY = m.H * (.84 + z * .12);
      const topY = m.H * (.13 + (1 - z) * .12);
      const c = colorFor(m, z * .25, .05 + z * .16, 320 + z * 18);
      ctx.strokeStyle = c; ctx.lineWidth = .5 + z * .75;
      ctx.beginPath();
      ctx.moveTo(cx - half, baseY);
      ctx.lineTo(cx - half, cy);
      ctx.quadraticCurveTo(cx - half * .95, topY, cx, topY);
      ctx.quadraticCurveTo(cx + half * .95, topY, cx + half, cy);
      ctx.lineTo(cx + half, baseY);
      ctx.stroke();
    }

    const windows = 5 + Math.floor(m.complexity * .45);
    for (let i = windows - 1; i >= 0; i--) {
      const z = mod(i / windows + phase * (.005 + m.movement * .004), 1);
      const p = Math.pow(z, 1.85);
      const r = minDim * (.035 + p * .39) * (1 + clamp(m.pulse) * .025);
      const alpha = .07 + z * .46;
      const petals = Math.round(clamp(6 + m.complexity * .55 + (i % 2) * 2, 6, 16));
      setGlow(colorFor(m, z, alpha, 324 + z * 24), m, .08 + z * .45);
      ctx.lineWidth = .45 + z * .85;
      drawCathedralRose(m, cx, cy, r, alpha, phase * .018 * (i % 2 ? -1 : 1) * m.movement + i * .12, petals);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = colorFor(m, z, alpha * .72, 330 + z * 20); ctx.stroke();
    }

    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = i * Math.PI * 2 / rays + phase * .012 * m.movement;
      const r0 = minDim * .045;
      const r1 = minDim * (.22 + m.energy * .012);
      ctx.strokeStyle = colorFor(m, i / rays, .055, 332);
      ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    resetGlow();
  }

  function renderPure(m) {
    const variant = m.scene.variant;
    if (variant === 'corridor') return renderPureCorridor(m);
    const lobeBoost = variant === 'kaleido' ? 2.7 : variant === 'prism' ? 1.4 : 0;
    const targetLobes = clamp(2.8 + m.count * 1.15 + m.complexity * .62 + lobeBoost, 3, 22);
    smoothLobes = lerp(smoothLobes, targetLobes, 1 - Math.exp(-m.dt * (2.2 + m.movement * 2)));
    if (!m.count) drawQuietLine(m);

    const layers = 1 + Math.floor(m.complexity / (variant === 'kaleido' ? 1.35 : 1.8));
    const points = variant === 'prism' ? 150 : 230;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const scale = 1 + layer * (variant === 'kaleido' ? .085 : .115);
      const alpha = .78 / (1 + layer * .47);
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = Math.PI * 2 * i / points;
        let harmonic = Math.sin(a * smoothLobes + phase * (1.0 + m.movement * 1.1 + layer * .05));
        if (variant === 'prism') harmonic = Math.sign(harmonic) * Math.pow(Math.abs(harmonic), .44);
        const secondary = Math.sin(a * (smoothLobes * .5 + 1.7 + m.distortion * 1.6) - phase * (.62 + m.movement * .7));
        const fold = variant === 'kaleido' ? Math.sin(a * smoothLobes * 2.02 - phase * (1.25 + layer * .09)) * .11 : 0;
        const attack = Math.sin(a * (2 + m.count * 1.4) + phase * 3.4) * clamp(m.pulse) * (.05 + m.distortion * .08);
        const deform = (harmonic * (.07 + m.distortion * .11) + secondary * (.03 + m.distortion * .075) + fold + attack) * (.35 + m.energy) * (.52 + m.complexity / 10);
        const radius = m.baseRadius * scale * (1 + deform + m.avgVelocity * .08);
        const stretch = .72 + m.pitchNorm * .44 + m.tonalWarp * .17;
        const localRotation = phase * (variant === 'kaleido' ? (layer % 2 ? -.13 : .15) : .07) * m.movement;
        const x = m.cx + Math.cos(a + localRotation) * radius;
        const y = m.cy + Math.sin(a + localRotation) * radius * stretch;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const c = colorFor(m, layer / Math.max(1, layers - 1), alpha);
      setGlow(c, m, layer === 0 ? 1.05 : .32);
      ctx.strokeStyle = c;
      ctx.lineWidth = layer === 0 ? 1.1 + Math.min(3, m.energy) * .75 : .65 + m.energy * .12;
      ctx.stroke();
      if (layer <= 1 && m.count) {
        ctx.fillStyle = colorFor(m, .1 + layer * .1, .018 + m.avgVelocity * .035);
        ctx.fill();
      }
    }
    resetGlow();

    if (m.pulse > .05) {
      const rings = 1 + Math.floor(m.complexity / 5);
      for (let r = 0; r < rings; r++) {
        ctx.beginPath();
        ctx.arc(m.cx, m.cy, m.baseRadius * (1.12 + r * .14 + clamp(m.pulse) * (.28 + m.distortion * .16)), 0, Math.PI * 2);
        ctx.strokeStyle = colorFor(m, .18 + r * .1, clamp(m.pulse * .13, 0, .24));
        ctx.lineWidth = .7 + m.energy * .12;
        ctx.stroke();
      }
    }
  }

  function renderOcean(m) {
    const variant = m.scene.variant;
    if (variant === 'abyss') return renderOceanAbyss(m);
    const storm = variant === 'storm' ? 1 : 0;
    const current = variant === 'current' ? 1 : 0;
    const layers = 3 + Math.floor(m.complexity / 1.6) + storm;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const y0 = m.H * (.43 + depth * .38) + (current ? (depth - .5) * m.H * .07 * Math.sin(phase * .4) : 0);
      const amp = m.H * (.012 + .026 * Math.min(2.5, m.energy) + storm * .026) * (1 - depth * .28) + clamp(m.pulse) * (7 + storm * 12);
      const freq = 1.05 + layer * (.22 + current * .14) + m.pitchNorm * 1.1 + storm * .45;
      const speed = phase * (1 + m.movement * (1.4 + storm * .7));
      ctx.beginPath();
      for (let x = -8; x <= m.W + 8; x += 3) {
        const q = x / m.W;
        const cross = current && layer % 2 ? -1 : 1;
        let wave = Math.sin(q * Math.PI * 2 * freq + speed * cross + layer * .2)
          + (.34 + m.distortion * .22) * Math.sin(q * Math.PI * 2 * (freq * 2.13) - speed * .68 + layer)
          + (.10 + m.distortion * .25 + storm * .12) * Math.sin(q * Math.PI * 2 * (freq * (4.2 + storm * 1.4)) + speed * 1.6);
        if (storm) wave += .13 * Math.sin(q * Math.PI * 2 * 11.2 - speed * 2.1 + layer);
        const y = y0 + wave * amp * (.56 + depth * .28);
        if (x <= -5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .75, .68 - depth * .31, 193 + depth * 24);
      setGlow(c, m, layer === 0 ? .72 + storm * .4 : .15);
      ctx.strokeStyle = c;
      ctx.lineWidth = .8 + (1 - depth) * (1 + Math.min(2.5, m.energy) * .62);
      ctx.stroke();
    }
    resetGlow();
  }

  function hillShape(q, layer, m, variant) {
    const drift = phase * (.10 + m.movement * .18);
    if (variant === 'ridge') {
      const s = Math.sin(q * Math.PI * 2 * (1.0 + layer * .16) + drift + layer * .8);
      return .72 * Math.sign(s) * Math.pow(Math.abs(s), .55) + .28 * Math.sin(q * Math.PI * 2 * 2.7 - drift * .6);
    }
    const base = .72 * Math.sin(q * Math.PI * 2 * (1.0 + layer * .15) + drift + layer * .8)
      + .32 * Math.sin(q * Math.PI * 2 * 2.23 - drift * .62 + m.pitchNorm * 2.8)
      + (.08 + m.distortion * .16) * Math.cos(q * Math.PI * 2 * (4.4 + m.distortion * 2) + layer);
    return variant === 'echo' ? base + .16 * Math.sin(q * Math.PI * 2 * 6.2 + phase * .4 + layer) : base;
  }

  function renderHills(m) {
    const variant = m.scene.variant;
    if (variant === 'valley') return renderHillsValley(m);
    const layers = 3 + Math.floor(m.complexity / (variant === 'echo' ? 1.4 : 2));
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const baseline = m.H * (.54 + depth * .19);
      const amp = m.H * (.045 + .045 * Math.min(2.4, m.energy) + m.distortion * .02) * (1 - depth * .20);
      ctx.beginPath();
      ctx.moveTo(-8, m.H + 8);
      for (let x = -8; x <= m.W + 8; x += 4) {
        const q = x / m.W;
        const ridge = hillShape(q, layer, m, variant);
        const y = baseline - ridge * amp - clamp(m.pulse) * (1 - depth) * (5 + m.energy * 4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(m.W + 8, m.H + 8);
      ctx.closePath();
      ctx.fillStyle = colorFor(m, depth * .5, .035 + (1 - depth) * (.025 + m.energy * .014), 140 + depth * 24);
      ctx.fill();
      ctx.beginPath();
      for (let x = -8; x <= m.W + 8; x += 4) {
        const q = x / m.W;
        const y = baseline - hillShape(q, layer, m, variant) * amp - clamp(m.pulse) * (1 - depth) * (5 + m.energy * 4);
        if (x <= -5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .48, .55 - depth * .22, 140 + depth * 24);
      setGlow(c, m, variant === 'echo' ? .22 : .12);
      ctx.strokeStyle = c;
      ctx.lineWidth = .75 + (1 - depth) * (.55 + m.energy * .22);
      ctx.stroke();
    }
    resetGlow();
  }

  function desertShape(q, layer, m, variant) {
    const speed = phase * (.055 + m.movement * .18);
    let dune = .82 * Math.sin(q * Math.PI * 2 * (.70 + layer * .11) + speed + layer * 1.1)
      + .24 * Math.sin(q * Math.PI * 2 * 1.62 - speed * .55 + m.pitchNorm * 2.2);
    if (variant === 'mirage') dune += (.14 + m.distortion * .22) * Math.sin(q * Math.PI * 2 * 5.8 + phase * 1.15 + layer);
    if (variant === 'wind') dune += (.10 + m.distortion * .26) * Math.sin(q * Math.PI * 2 * 9.5 - phase * (1.3 + m.movement) + layer * .4);
    return dune;
  }

  function renderDesert(m) {
    const variant = m.scene.variant;
    if (variant === 'sun-gate') return renderDesertSunGate(m);
    const layers = 3 + Math.floor(m.complexity / 1.8);
    for (let layer = layers - 1; layer >= 0; layer--) {
      const depth = layer / Math.max(1, layers - 1);
      const baseline = m.H * (.54 + depth * .18);
      const amp = m.H * (.04 + .035 * Math.min(2.4, m.energy) + m.distortion * .018) * (1 - depth * .12);
      ctx.beginPath();
      ctx.moveTo(-8, m.H + 8);
      for (let x = -8; x <= m.W + 8; x += 4) {
        const q = x / m.W;
        const y = baseline - desertShape(q, layer, m, variant) * amp - clamp(m.pulse) * (3 + m.energy * 3) * (1 - depth);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(m.W + 8, m.H + 8);
      ctx.closePath();
      ctx.fillStyle = colorFor(m, depth * .38, .038 + (1 - depth) * .035, 31 + depth * 17);
      ctx.fill();
      ctx.beginPath();
      for (let x = -8; x <= m.W + 8; x += 4) {
        const q = x / m.W;
        const y = baseline - desertShape(q, layer, m, variant) * amp - clamp(m.pulse) * (3 + m.energy * 3) * (1 - depth);
        if (x <= -5) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      const c = colorFor(m, depth * .35, .55 - depth * .21, 31 + depth * 17);
      setGlow(c, m, variant === 'mirage' ? .36 : .14);
      ctx.strokeStyle = c;
      ctx.lineWidth = .8 + (1 - depth) * (.48 + m.energy * .20);
      ctx.stroke();
    }
    if (variant === 'wind') {
      const streaks = 5 + Math.floor(m.complexity * .7);
      for (let i = 0; i < streaks; i++) {
        const y = m.H * (.18 + pseudo(i + 20) * .55);
        const x = mod(pseudo(i) * m.W + phase * m.movement * (20 + i * 2), m.W + 180) - 90;
        ctx.strokeStyle = colorFor(m, i / streaks, .06 + m.energy * .018, 45);
        ctx.lineWidth = .6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 55 + m.movement * 55, y + Math.sin(i) * 4); ctx.stroke();
      }
    }
    resetGlow();
  }

  function updateVisualObjects(m) {
    for (const o of visualObjects) {
      o.age += m.dt;
      if (o.kind === 'bubble') {
        if (o.mode === 'orbit') {
          o.angle += m.dt * (.45 + o.velocity * 1.2) * (.25 + m.movement * 1.15);
          o.x = .5 + Math.cos(o.angle) * o.orbitR;
          o.y = .5 + Math.sin(o.angle) * o.orbitR * .70;
        } else if (o.mode === 'burst') {
          o.x += o.vx * m.dt * (.25 + m.movement * 1.5);
          o.y += o.vy * m.dt * (.25 + m.movement * 1.5);
          o.vx *= Math.pow(.78, m.dt); o.vy *= Math.pow(.78, m.dt);
        } else {
          o.y -= o.speed * m.dt * (.3 + m.speedScale * .5) * (.35 + m.movement * .9);
          o.x += Math.sin(o.age * (1.2 + m.movement * 1.8) + o.wobble) * .012 * m.dt * (.3 + m.movement);
        }
      } else if (o.kind === 'bird') {
        o.x += o.speed * m.dt * (.32 + m.speedScale * .42) * (.38 + m.movement * .9);
        o.y += Math.sin(o.age * (o.mode === 'rush' ? 2.1 : .85) + o.flap) * .006 * m.dt * (.3 + m.movement * 1.3);
      }
    }
    visualObjects = visualObjects.filter(o => o.age < o.life && (o.kind !== 'bubble' || (o.y > -.3 && o.x > -.3 && o.x < 1.3 && o.y < 1.3)) && (o.kind !== 'bird' || o.x < 1.25));
  }

  function ensureIdleObjects(m) {
    const variant = m.scene.variant;
    if (m.scene.family === 'bubbles' && !visualObjects.some(o => o.kind === 'bubble') && !isPlaying) {
      for (let i = 0; i < 8; i++) {
        const seed = (i * .173 + .11) % 1;
        const angle = i / 8 * Math.PI * 2;
        visualObjects.push({ kind: 'bubble', mode: variant, x: variant === 'burst' ? .5 : .18 + seed * .64, y: variant === 'burst' ? .5 : .88 - i * .09, r: .014 + (i % 3) * .007, drift: 0, speed: .012, vx: Math.cos(angle)*.035, vy: Math.sin(angle)*.035, angle, orbitR: .12 + i * .018, age: i * .25, life: 40, pitch: seed, velocity: .25, wobble: seed * 6.28 });
      }
    }
    if (m.scene.family === 'birds' && !visualObjects.some(o => o.kind === 'bird') && !isPlaying) {
      for (let i = 0; i < 9; i++) {
        visualObjects.push({ kind: 'bird', mode: variant, x: .10 + i * .09, y: .38 + Math.sin(i * 1.8) * .10, speed: 0, age: i * .1, life: 40, size: .012 + (i % 3) * .0025, pitch: .40 + i * .045, velocity: .25, flap: i * .8 });
      }
    }
  }

  function renderBubbles(m) {
    if (m.scene.variant === 'depth-drift') return renderBubblesDepthDrift(m);
    ensureIdleObjects(m);
    updateVisualObjects(m);
    const variant = m.scene.variant;
    for (const o of visualObjects) {
      if (o.kind !== 'bubble') continue;
      const x = o.x * m.W;
      const y = o.y * m.H;
      const breathing = 1 + Math.sin(o.age * (1.8 + m.movement * 1.2) + o.wobble) * (.04 + m.distortion * .10);
      const burstGrow = variant === 'burst' ? 1 + Math.min(1.4, o.age * .45) : 1;
      const r = o.r * Math.min(m.W, m.H) * breathing * burstGrow * (1 + m.energy * .08);
      const fade = clamp(Math.min(o.age * 2.8, (o.life - o.age) * 1.5));
      const c = colorFor(m, o.pitch, (.42 + Math.min(.25, m.energy * .06)) * fade, 180 + o.pitch * 50);
      setGlow(c, m, .55 + o.velocity * .7 + (variant === 'burst' ? .35 : 0));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = c;
      ctx.lineWidth = .65 + o.velocity * (1.1 + Math.min(2.5, m.energy) * .65);
      ctx.stroke();
      if (m.distortion > .18) {
        ctx.beginPath();
        ctx.ellipse(x, y, r * (1 + m.distortion * .18), r * (1 - m.distortion * .12), phase * .2 + o.wobble, 0, Math.PI * 2);
        ctx.strokeStyle = colorFor(m, o.pitch + .12, .11 * fade, 210);
        ctx.lineWidth = .6;
        ctx.stroke();
      }
      resetGlow();
      ctx.beginPath();
      ctx.arc(x - r * .25, y - r * .28, r * .40, Math.PI * 1.02, Math.PI * 1.54);
      ctx.strokeStyle = colorFor(m, o.pitch + .08, .28 * fade, 200);
      ctx.lineWidth = .65;
      ctx.stroke();
    }
  }

  function renderBirds(m) {
    if (m.scene.variant === 'migration') return renderBirdsMigration(m);
    ensureIdleObjects(m);
    updateVisualObjects(m);
    const variant = m.scene.variant;
    for (const o of visualObjects) {
      if (o.kind !== 'bird') continue;
      const x = o.x * m.W;
      const y = o.y * m.H;
      const sizeFactor = variant === 'glide' ? 1.45 : variant === 'rush' ? .82 : 1;
      const size = o.size * Math.min(m.W, m.H) * sizeFactor * (1 + Math.min(2.5, m.energy) * .12);
      const flapRate = variant === 'rush' ? 10.5 : variant === 'glide' ? 2.8 : 5.4;
      const flap = Math.sin(o.age * (flapRate + m.speedScale * 4.5 * m.movement) + o.flap);
      const wingY = size * (.18 + flap * (.30 + m.distortion * .34));
      const c = colorFor(m, o.pitch, .48 + o.velocity * .28, 43 + o.pitch * 28);
      setGlow(c, m, variant === 'rush' ? .34 : .18);
      ctx.beginPath();
      ctx.moveTo(x - size, y + wingY);
      ctx.quadraticCurveTo(x - size * .42, y - size * (.18 + m.distortion * .22), x, y);
      ctx.quadraticCurveTo(x + size * .42, y - size * (.18 + m.distortion * .22), x + size, y + wingY);
      ctx.strokeStyle = c;
      ctx.lineWidth = .75 + o.velocity * (1 + m.energy * .45);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    resetGlow();
  }

  function pseudo(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function drawStars(m, multiplier = 1) {
    const starCount = Math.round((55 + m.complexity * 12) * multiplier);
    for (let i = 0; i < starCount; i++) {
      const x = pseudo(i * 2 + 1) * m.W;
      const y = pseudo(i * 2 + 2) * m.H;
      const twinkle = .10 + .28 * (.5 + .5 * Math.sin(phase * (1 + pseudo(i) * 3) + i));
      ctx.fillStyle = colorFor(m, pseudo(i), twinkle, 220 + pseudo(i) * 90);
      const dot = .55 + pseudo(i + 4) * (1.1 + m.energy * .22);
      ctx.fillRect(x, y, dot, dot);
    }
  }

  function renderGalaxy(m) {
    const variant = m.scene.variant;
    if (variant === 'tunnel') return renderGalaxyTunnel(m);
    const minDim = Math.min(m.W, m.H);
    drawStars(m, variant === 'warp' ? .72 : 1);

    if (variant === 'rings') {
      const rings = 2 + Math.floor(m.complexity / 1.8);
      for (let r = rings - 1; r >= 0; r--) {
        const t = (r + 1) / rings;
        const radius = minDim * (.08 + t * .34);
        ctx.beginPath();
        ctx.ellipse(m.cx, m.cy, radius, radius * (.46 + m.pitchNorm * .24), phase * .06 * (r % 2 ? -1 : 1) * m.movement + r * .22, 0, Math.PI * 2);
        const c = colorFor(m, t, .18 + (1-t)*.32, 250 + r * 13);
        setGlow(c, m, r === 0 ? .7 : .18);
        ctx.strokeStyle = c; ctx.lineWidth = .65 + (1-t) * 1.2 + m.energy * .15; ctx.stroke();
        const satellites = 2 + Math.floor(m.complexity / 3);
        for (let j=0;j<satellites;j++) {
          const a = phase * (.22 + r*.015) * m.movement * (r%2?-1:1) + j*Math.PI*2/satellites + r;
          const x = m.cx + Math.cos(a) * radius;
          const y = m.cy + Math.sin(a) * radius * (.46 + m.pitchNorm*.24);
          ctx.fillStyle = colorFor(m, t+j*.1, .55, 270+j*14); ctx.beginPath(); ctx.arc(x,y,1+m.energy*.45,0,Math.PI*2); ctx.fill();
        }
      }
    } else if (variant === 'warp') {
      const streaks = 50 + m.complexity * 12;
      const speed = .15 + m.movement * .65 + m.speedScale * .12;
      for (let i=0;i<streaks;i++) {
        const a = pseudo(i*3+1)*Math.PI*2;
        const base = pseudo(i*4+2);
        const travel = mod(base + phase * speed * (.03 + pseudo(i)*.045), 1);
        const r = minDim * (.03 + travel * .58);
        const len = 3 + travel * (18 + m.energy*14 + m.distortion*18);
        const x = m.cx + Math.cos(a)*r;
        const y = m.cy + Math.sin(a)*r*.72;
        ctx.strokeStyle = colorFor(m, travel, .08 + travel*.42, 255 + pseudo(i)*80);
        ctx.lineWidth = .5 + travel*1.2;
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x + Math.cos(a)*len, y + Math.sin(a)*len*.72); ctx.stroke();
      }
    } else {
      const arms = 2 + Math.floor(m.complexity / 2.4);
      const pointsPerArm = 55 + m.complexity * 10;
      for (let arm = 0; arm < arms; arm++) {
        for (let i = 4; i < pointsPerArm; i++) {
          const t = i / pointsPerArm;
          const r = minDim * (.035 + Math.pow(t, .80) * (.34 + Math.min(2.5,m.energy) * .035));
          const angle = arm * Math.PI * 2 / arms + t * Math.PI * 2 * (1.55 + m.complexity * .095 + m.distortion*.22) + phase * .20 * m.movement;
          const jitter = (pseudo(i + arm * 101) - .5) * minDim * (.018 + m.distortion*.035) * t;
          const x = m.cx + Math.cos(angle) * r + Math.cos(angle + Math.PI / 2) * jitter;
          const y = m.cy + Math.sin(angle) * r * .72 + Math.sin(angle + Math.PI / 2) * jitter;
          const a = .09 + (1 - t) * .30;
          ctx.fillStyle = colorFor(m, arm / arms + t * .25, a, 260 + arm * 24);
          const dot = .55 + pseudo(i * 3 + arm) * 1.8 + m.energy * .22;
          ctx.fillRect(x, y, dot, dot);
        }
      }
    }

    for (let i = 0; i < Math.min(m.notes.length, 14); i++) {
      const n = m.notes[i];
      const pn = clamp((n.note + m.transpose - 30) / 72);
      const r = minDim * (.09 + pn * .32);
      const a = phase * (.16 + i * .011) * m.movement + i * 2.399;
      const x = m.cx + Math.cos(a) * r;
      const y = m.cy + Math.sin(a) * r * .72;
      const c = colorFor(m, pn, .76, 270 + pn * 80);
      setGlow(c, m, 1.05);
      ctx.beginPath(); ctx.arc(x, y, 1.5 + n.velocity / 127 * (2.8 + m.energy), 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    }

    for (const o of visualObjects) {
      if (o.kind !== 'spark') continue;
      o.age += m.dt;
      const fade = clamp(1 - o.age / o.life);
      const a = o.angle + phase * .28 * m.movement;
      const r = minDim * o.radius * (variant === 'warp' ? 1 + o.age*.18*m.movement : 1);
      const x = m.cx + Math.cos(a) * r;
      const y = m.cy + Math.sin(a) * r * .72;
      const c = colorFor(m, o.pitch, fade * .84, 280 + o.pitch * 70);
      setGlow(c, m, 1.25);
      ctx.beginPath(); ctx.arc(x, y, 1.1 + o.velocity * (3.2 + m.energy), 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    }
    visualObjects = visualObjects.filter(o => o.kind !== 'spark' || o.age < o.life);
    resetGlow();

    const coreSize = minDim * (.10 + Math.min(2, m.energy)*.02);
    const core = ctx.createRadialGradient(m.cx, m.cy, 0, m.cx, m.cy, coreSize);
    core.addColorStop(0, colorFor(m, .2, .40, 300));
    core.addColorStop(.25, colorFor(m, .1, .14, 260));
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(m.cx, m.cy, coreSize, 0, Math.PI * 2); ctx.fill();
  }

  function renderBloom(m) {
    const variant = m.scene.variant;
    if (variant === 'cathedral') return renderBloomCathedral(m);
    const petalBoost = variant === 'mandala' ? 3 : variant === 'nova' ? 1 : 0;
    const petals = clamp(4 + m.count * 1.25 + Math.floor(m.complexity * .75) + petalBoost, 4, 26);
    const layers = 2 + Math.floor(m.complexity / (variant === 'mandala' ? 1.35 : 1.7));
    const points = 260;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const scale = .58 + layer * .105 + clamp(m.pulse) * (.03 + (variant === 'nova' ? .08 : 0));
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = Math.PI * 2 * i / points;
        const petal = Math.cos(a * petals + phase * (1 + m.movement * 1.2 + layer * .04));
        const inner = Math.sin(a * (petals / 2 + 1 + m.distortion*2) - phase * (.55 + m.movement*.45));
        const nova = variant === 'nova' ? Math.pow(Math.max(0, petal), 3) * (clamp(m.pulse)*.35 + m.energy*.10) : 0;
        const mandala = variant === 'mandala' ? Math.sin(a * petals * 2.03 + phase * (layer%2?-.5:.5)) * .07 : 0;
        const r = m.baseRadius * scale * (1 + petal * (.16 + m.energy * .075 + m.distortion*.08) + inner * (.025 + m.distortion*.065) + nova + mandala);
        const localRotation = phase * (variant === 'mandala' ? (layer % 2 ? -.09 : .11) : -.045) * m.movement + layer * .025;
        const x = m.cx + Math.cos(a + localRotation) * r;
        const y = m.cy + Math.sin(a + localRotation) * r;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const alpha = .70 / (1 + layer * .34);
      const c = colorFor(m, layer / Math.max(1, layers), alpha, 318 + layer * 13);
      setGlow(c, m, layer === 0 ? 1.05 : .28);
      ctx.strokeStyle = c;
      ctx.lineWidth = layer === 0 ? 1 + m.energy * .7 : .62 + m.energy*.08;
      ctx.stroke();
      ctx.fillStyle = colorFor(m, layer / Math.max(1, layers), .014 + m.avgVelocity * .022, 326 + layer * 10);
      ctx.fill();
    }
    resetGlow();
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, 2 + clamp(m.pulse) * (5 + m.energy*4), 0, Math.PI * 2);
    ctx.fillStyle = colorFor(m, .5, .74, 42);
    ctx.fill();
  }

  function updateAutoScene(dt, m) {
    if (!autoScene || !isPlaying) return;
    autoSceneTimer += dt * Math.max(.35, m.speedScale);
    const interval = clamp(14 - m.complexity * .55 - m.movement * .8, 5.5, 14);
    if (autoSceneTimer >= interval) {
      autoSceneTimer = 0;
      const index = SCENE_ORDER.indexOf(currentScene);
      setScene(SCENE_ORDER[(index + 1) % SCENE_ORDER.length], true);
    }
  }

  function applyGlobalVisualTransform(m) {
    // Movement at its neutral/reset value (100%) must NOT move the virtual camera.
    // Global drift only fades in above a small dead-zone; internal scene motion still
    // responds normally across the entire Movement slider.
    const cameraMotion = clamp((m.movement - 1.12) / .88, 0, 1.35);
    const motionEnergy = Math.min(1.8, .35 + m.energy * .58);
    const motionX = Math.sin(phase * .52 + m.pitchNorm * 2.8) * m.W * .012 * cameraMotion * motionEnergy;
    const motionY = Math.cos(phase * .43 + m.avgVelocity * 3.1) * m.H * .009 * cameraMotion * motionEnergy;
    const rot = phase * .10 * m.rotation;
    const sx = m.scale * (1 + m.tonalWarp * .12);
    const sy = m.scale * (1 - m.tonalWarp * .09);
    ctx.translate(m.cx + motionX, m.cy + motionY);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.translate(-m.cx, -m.cy);
  }

  function drawVisual(dt) {
    const { w, h, dpr } = resizeCanvas();
    ctx.save();
    ctx.scale(dpr, dpr);
    const W = w / dpr;
    const H = h / dpr;
    const m = getMetrics(dt, W, H);
    m.glowBoost = m.glowLevel / 1.5;
    m.phaseHue = mod(phase * 34 * m.speedScale + m.transpose * 13, 360);

    paintBackground(m);
    updateAutoScene(dt, m);

    ctx.save();
    applyGlobalVisualTransform(m);
    switch (m.scene.family) {
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

  function signedPercent(value) {
    const n = Number(value);
    return `${n > 0 ? '+' : ''}${n}%`;
  }

  function refreshControls() {
    ui.tempoValue.textContent = `${ui.tempo.value}%`;
    ui.intensityValue.textContent = `${ui.intensity.value}%`;
    const tr = Number(ui.transpose.value);
    ui.transposeValue.textContent = tr > 0 ? `+${tr}` : `${tr}`;
    ui.complexityValue.textContent = ui.complexity.value;
    ui.traceValue.textContent = `${ui.trace.value}%`;
    ui.glowValue.textContent = `${ui.glow.value}%`;
    ui.distortionValue.textContent = `${ui.distortion.value}%`;
    ui.movementValue.textContent = `${ui.movement.value}%`;
    ui.speedValue.textContent = `${ui.speed.value}%`;
    ui.scaleValue.textContent = `${ui.scale.value}%`;
    ui.rotationValue.textContent = signedPercent(ui.rotation.value);
    const colorNames = { musical: 'Musicale', mono: 'Monocromatico', gradient: 'Gradiente', spectrum: 'Spettro' };
    ui.colorModeValue.textContent = colorNames[ui.colorMode.value] || 'Musicale';
    syncPowerButtons();
    updateMasterGain();
    refreshTimeUI();
  }

  function renderFamilyPicker() {
    ui.familyPicker.innerHTML = FAMILY_ORDER.map(key => {
      const family = FAMILIES[key];
      const active = (sceneDrawerOpen ? menuFamily : currentFamily) === key;
      return `<button class="family-chip${active ? ' active' : ''}" type="button" data-family="${key}" aria-pressed="${active}" style="--family-color:${family.accent};--family-hue:${family.hue}"><span class="family-icon">${family.icon}</span><strong>${family.label}</strong></button>`;
    }).join('');
  }

  function renderScenePicker() {
    const family = FAMILIES[menuFamily];
    ui.sceneFamilyLabel.textContent = family.label;
    ui.sceneFamilyLabel.style.setProperty('--family-color', family.accent);
    ui.scenePicker.style.setProperty('--family-color', family.accent);
    ui.scenePicker.innerHTML = family.scenes.map(scene => {
      const active = scene.id === currentScene;
      return `<button class="scene-chip${active ? ' active' : ''}" type="button" data-scene="${scene.id}" aria-pressed="${active}"><strong>${scene.label}</strong><small>${scene.engine}</small></button>`;
    }).join('');
  }

  function openSceneDrawer(familyKey = currentFamily) {
    if (!FAMILIES[familyKey]) return;
    menuFamily = familyKey;
    sceneDrawerOpen = true;
    ui.sceneDrawer.classList.add('open');
    ui.sceneDrawer.setAttribute('aria-hidden', 'false');
    renderFamilyPicker();
    renderScenePicker();
  }

  function closeSceneDrawer() {
    sceneDrawerOpen = false;
    ui.sceneDrawer.classList.remove('open');
    ui.sceneDrawer.setAttribute('aria-hidden', 'true');
    renderFamilyPicker();
  }

  function toggleFamily(familyKey) {
    if (!FAMILIES[familyKey]) return;
    if (sceneDrawerOpen && menuFamily === familyKey) {
      closeSceneDrawer();
      return;
    }
    openSceneDrawer(familyKey);
  }

  function setScene(name, fromAuto = false) {
    const scene = SCENES[name];
    if (!scene) return;
    currentScene = name;
    currentFamily = scene.family;
    menuFamily = scene.family;
    if (!fromAuto) autoSceneTimer = 0;
    visualObjects = [];
    pulse = Math.max(pulse, .34);
    canvasReady = false;
    const family = FAMILIES[currentFamily];
    document.documentElement.style.setProperty('--active-family-color', family.accent);
    ui.sceneHud.textContent = `${family.label.toUpperCase()} · ${scene.label.toUpperCase()}`;
    ui.engineHud.textContent = scene.engine.toUpperCase();
    ui.sceneStatus.textContent = `${family.label} · ${scene.label}`;
    ui.sceneDescription.textContent = scene.description;
    renderFamilyPicker();
    renderScenePicker();
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

  CONTROL_LIST.map(key => ui[key]).forEach(el => el.addEventListener('input', () => {
    if (el === ui.transpose && audioCtx) {
      for (const [key, list] of voices.entries()) {
        const note = Number(key.split(':')[1]);
        list.forEach(v => v.osc.frequency.setTargetAtTime(midiToFreq(note), audioCtx.currentTime, 0.018));
      }
    }
    refreshControls();
  }));
  ui.colorMode.addEventListener('change', refreshControls);
  ui.powerButtons.addEventListener('click', (event) => {
    const button = event.target.closest('[data-power]');
    if (!button) return;
    setControlPower(button.dataset.power);
  });

  ui.familyPicker.addEventListener('click', (event) => {
    const button = event.target.closest('[data-family]');
    if (!button) return;
    toggleFamily(button.dataset.family);
  });

  ui.scenePicker.addEventListener('click', (event) => {
    const button = event.target.closest('[data-scene]');
    if (!button) return;
    setScene(button.dataset.scene, false);
    closeSceneDrawer();
  });
  ui.sceneDrawerClose.addEventListener('click', closeSceneDrawer);

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

  installResetButtons();
  ui.eventCount.textContent = String(song.events.length);
  ui.sourceStatus.textContent = 'Demo interna';
  setControlPower('medium');
  setScene('pure-pulse');
  refreshControls();
  renderFamilyPicker();
  renderScenePicker();
  requestAnimationFrame((now) => { lastFrame = now; frame(now); });
})();
