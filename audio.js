/* Halloween audio: spooky background music + sound effects.
   Everything is generated in the browser (Web Audio API), no music files needed.
   Browsers only allow sound after a click, so music starts from the 🔊 button. */
const SpookyAudio = (() => {
  let ctx, master, musicGain, sfxGain, delay, feedback, delayOut, noiseBuf;
  let playing = false, timer = null, nextTime = 0, step = 0, nextWind = 0;
  let droneNodes = [];
  const STEP = 0.42; // seconds per melody step (slow and creepy)
  const MUSIC_LEVEL = 0.55;

  // Music-box tune in A harmonic minor, with a creepy D# (tritone) in it
  const MELODY = [69,72,76,75, 76,72,69,null, 68,71,74,71, 68,null,64,null,
                  69,72,76,79, 78,75,72,null, 71,68,64,68, 69,null,null,null];

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    delay = ctx.createDelay(2); delay.delayTime.value = STEP * 1.5;
    feedback = ctx.createGain(); feedback.gain.value = 0.38;
    delayOut = ctx.createGain(); delayOut.gain.value = 0.45;
    delay.connect(feedback); feedback.connect(delay); delay.connect(delayOut); delayOut.connect(musicGain);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  function startDrone() {
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 260; filt.Q.value = 6;
    const g = ctx.createGain(); g.gain.value = 0.16;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 140;
    lfo.connect(lfoAmt); lfoAmt.connect(filt.frequency);
    const oscs = [[55, 'sawtooth', 0], [55.4, 'sawtooth', 0], [82.4, 'triangle', 0], [77.8, 'sine', 0]].map(([f, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(filt); o.start(); return o;
    });
    filt.connect(g); g.connect(musicGain); lfo.start();
    droneNodes = [...oscs, lfo];
  }

  function musicBox(t, midi) {
    const f = mtof(midi);
    [[f, 0.22], [f * 2.01, 0.06], [f * 3.98, 0.025]].forEach(([freq, vol]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(musicGain); g.connect(delay);
      o.start(t); o.stop(t + 1.7);
    });
  }

  function heartbeat(t) {
    [0, 0.22].forEach((off, i) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(70, t + off); o.frequency.exponentialRampToValueAtTime(38, t + off + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(i ? 0.28 : 0.4, t + off + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.25);
      o.connect(g); g.connect(musicGain); o.start(t + off); o.stop(t + off + 0.3);
    });
  }

  function wind(t) {
    const n = noise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(950, t + 2.2); bp.frequency.linearRampToValueAtTime(320, t + 4.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 2); g.gain.linearRampToValueAtTime(0.0001, t + 4.6);
    n.connect(bp); bp.connect(g); g.connect(musicGain); n.start(t); n.stop(t + 4.8);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.25) {
      const note = MELODY[step % MELODY.length];
      if (note !== null) musicBox(nextTime, note);
      if (step % 8 === 0) heartbeat(nextTime);
      if (nextTime >= nextWind) { wind(nextTime); nextWind = nextTime + 7 + Math.random() * 8; }
      nextTime += STEP; step++;
    }
  }

  function start() {
    init(); ctx.resume();
    if (playing) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.1; nextWind = nextTime + 3;
    startDrone();
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.8);
    timer = setInterval(schedule, 60);
  }

  function stop() {
    if (!playing) return;
    playing = false; clearInterval(timer);
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    const nodes = droneNodes; droneNodes = [];
    setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch (e) {} }), 1500);
  }

  function toggle() { playing ? stop() : start(); return playing; }

  /* ---------- sound effects ---------- */
  function creak() {
    init(); ctx.resume(); const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const curve = new Float32Array(24);
    for (let i = 0; i < curve.length; i++) curve[i] = 70 + Math.random() * 60 + i * 3;
    o.frequency.setValueCurveAtTime(curve, t, 0.7);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.linearRampToValueAtTime(0.0001, t + 0.75);
    o.connect(bp); bp.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.8);
  }

  function boo() {
    init(); ctx.resume(); const t = ctx.currentTime;
    [261.6, 370, 392].forEach(f => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f / 3, t + 0.9);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 1.05);
    });
    const n = noise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(lp); lp.connect(ng); ng.connect(sfxGain); n.start(t); n.stop(t + 0.65);
  }

  function chime(notes = [84, 88, 91, 96]) {
    init(); ctx.resume(); const t = ctx.currentTime;
    notes.forEach((m, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m);
      const g = ctx.createGain(); const s = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.25, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
      o.connect(g); g.connect(sfxGain); o.start(s); o.stop(s + 0.65);
    });
  }

  function thud() {
    init(); ctx.resume(); const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t + 0.4);
  }

  /* ---------- speech (English voice) ---------- */
  let voice = null;
  function pickVoice() {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    voice = vs.find(v => /en-US/i.test(v.lang) && /female|samantha|zira|jenny|aria|google us/i.test(v.name))
         || vs.find(v => /en-US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

  function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.82; u.pitch = 1; if (voice) u.voice = voice;
    if (ctx && playing) {
      musicGain.gain.setTargetAtTime(0.15, ctx.currentTime, 0.1);
      u.onend = u.onerror = () => { if (playing) musicGain.gain.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime, 0.4); };
    }
    speechSynthesis.speak(u);
  }

  return { start, stop, toggle, isPlaying: () => playing, creak, boo, chime, thud, speak };
})();
