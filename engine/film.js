// film.js — a small engine for chaptered 3D explainers.
//
// It owns everything that is not about your subject: renderer, bloom, lights,
// camera choreography, the chapter director, and the UI chrome (chapter rail,
// narration panel, transport bar, legend, sequence HUD, keyboard shortcuts).
//
// You supply chapters. A chapter is:
//
//   {
//     id, title,
//     where,                        // small caption above the narration
//     duration,                     // seconds at 1x
//     legend,                       // key into config.legends, or null
//     beats: [{ at, h, p }],        // narration, `at` in 0..1
//     build(ctx) {                  // called on entry; dispose is automatic
//       return {
//         root,                     // THREE.Object3D added to the scene
//         update(t01, dt, elapsed),
//         camera(t01, outPos, outTarget) -> fov,
//       };
//     },
//   }
//
// ctx gives a chapter { state, hud } — state is your own mutable object (shared
// across chapters and preserved across reloads), hud.set(data) feeds
// config.renderHud.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerp, disposeDeep, rng, dotTexture } from './gfx.js';
import { createVoice } from './voice.js';

export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

const CHROME = `
<div id="stage"></div>
<div id="labels"></div>

<nav id="rail">
  <header><h1 id="film-title"></h1><div class="sub" id="film-sub"></div></header>
  <ul id="chapters"></ul>
</nav>

<aside id="panel">
  <div class="where" id="where"></div>
  <h2 id="beat-h"></h2>
  <p id="beat-p"></p>
  <div id="legend"><div class="cap" id="legend-cap"></div><div class="row" id="legend-row"></div></div>
  <button id="read-btn">Read the deep dive ↗</button>
</aside>

<div id="reader"><div class="sheet">
  <button class="close" id="reader-x" title="Close (esc)">✕</button>
  <div class="article" id="reader-body"></div>
</div></div>

<div id="hud"></div>
<button id="recenter" class="icon" title="Re-centre camera (R)">⌖</button>

<div id="transport">
  <button id="prev" class="icon" title="Restart chapter, or previous (↑)">◀◀</button>
  <button id="play" class="icon" title="Play / pause (space)">❚❚</button>
  <button id="next" class="icon" title="Next chapter (↓)">▶▶</button>
  <div class="divider"></div>
  <div id="scrub"><div class="fill"></div><div class="knob"></div></div>
  <div id="clock">0:00 / 0:00</div>
  <div class="divider"></div>
  <button id="speed" title="Playback speed">1×</button>
  <button id="pace-btn" title="Step waits for you at each beat (P)"></button>
  <span id="toggles"></span>
  <button id="voice-btn" title="Narration (V)">Voice</button>
  <button id="labels-btn" class="on" title="Toggle labels (L)">Labels</button>
</div>

<div id="intro"><div class="box">
  <div class="eyebrow" id="intro-eyebrow"></div>
  <h1 id="intro-headline"></h1>
  <p id="intro-body"></p>
  <div class="keys">
    <span><kbd>space</kbd>next step</span><span><kbd>← →</kbd>seek</span><span><kbd>↑ ↓</kbd>chapter</span>
    <span><kbd>drag</kbd>orbit</span><span><kbd>scroll</kbd>zoom</span>
    <span><kbd>L</kbd>labels</span><span><kbd>V</kbd>voice</span>
  </div>
  <button id="begin">Begin</button>
</div></div>
`;

const DEFAULTS = {
  title: 'Untitled',
  subtitle: '',
  intro: null,
  chapters: [],
  state: {},
  legends: {},
  renderHud: null,
  toggles: [],
  scene: { background: 0x05080d, fog: 0.0035 },
  camera: { fov: 46, near: 0.1, far: 4000, start: [40, 30, 235], min: 4, max: 700 },
  bloom: { strength: 0.42, radius: 0.7, threshold: 0.86 },
  lights: null,
  ambient: null,
  voice: null,
  seekStep: 5,        // seconds per arrow press
  pacing: 'step',     // 'step': hold at each beat until the viewer advances; 'auto': play through
  autoplay: false,
};

export function createFilm(userConfig = {}) {
  const cfg = { ...DEFAULTS, ...userConfig };
  const chapters = cfg.chapters;
  if (!chapters.length) throw new Error('createFilm: no chapters');

  const host = document.createElement('div');
  host.id = 'film';
  host.innerHTML = CHROME;
  document.body.appendChild(host);
  const $ = (id) => document.getElementById(id);

  $('film-title').textContent = cfg.title;
  $('film-sub').innerHTML = cfg.subtitle;

  // --- renderer -----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  $('stage').appendChild(renderer.domElement);

  const css2d = new CSS2DRenderer();
  css2d.setSize(innerWidth, innerHeight);
  css2d.domElement.style.position = 'absolute';
  css2d.domElement.style.top = '0';
  css2d.domElement.style.pointerEvents = 'none';
  $('labels').appendChild(css2d.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.scene.background);
  if (cfg.scene.fog) scene.fog = new THREE.FogExp2(cfg.scene.background, cfg.scene.fog);

  const cc = cfg.camera;
  const camera = new THREE.PerspectiveCamera(cc.fov, innerWidth / innerHeight, cc.near, cc.far);
  camera.position.fromArray(cc.start);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = cc.min;
  controls.maxDistance = cc.max;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight),
    cfg.bloom.strength, cfg.bloom.radius, cfg.bloom.threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  if (cfg.lights) cfg.lights(scene, THREE);
  else {
    scene.add(new THREE.HemisphereLight(0x8fbfff, 0x0a0e14, 0.75));
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(34, 46, 40); scene.add(key);
    const rim = new THREE.DirectionalLight(0x63d5ff, 0.85); rim.position.set(-50, 12, -34); scene.add(rim);
    const warm = new THREE.DirectionalLight(0xffc98a, 0.45); warm.position.set(10, -40, 20); scene.add(warm);
  }

  // ambient motes, so close-up scenes are not floating in a void
  let motes = null;
  if (cfg.ambient) {
    const { count = 2600, spread = [320, 220, 320], size = 2.4, opacity = 0.5, drift = 0.01 } = cfg.ambient;
    const geo = new THREE.BufferGeometry();
    const r = rng(3), a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a.set([(r() - 0.5) * spread[0], (r() - 0.5) * spread[1], (r() - 0.5) * spread[2]], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    // sizeAttenuation off: nearby motes stay small dots instead of exploding into squares
    motes = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size, map: dotTexture(), transparent: true, opacity,
      depthWrite: false, sizeAttenuation: false }));
    motes.visible = false;
    motes.userData.drift = drift;
    scene.add(motes);
  }

  // --- narration ----------------------------------------------------------
  // Narration is the slow part: read at a comfortable pace, a film like this
  // needs roughly twice its silent running time. Rather than speed the voice up
  // to fit the animation, each chapter is stretched to hold its own narration.
  // Everything animates off t01, so a longer chapter just means the same
  // choreography takes longer.
  //
  // Sizing is by the chapter's *total* narration, not its longest beat: sizing
  // by the longest beat leaves every other beat idling (and one badly-balanced
  // beat can triple a chapter). Beats keep their authored `at` positions so
  // narration still lands on the moment it describes; a beat that overruns its
  // slice queues into the next rather than being cut off, and the chapter has
  // the slack to absorb it.
  const voice = cfg.voice ? createVoice(cfg.voice) : null;
  const targetRate = cfg.voice?.targetRate ?? 1.15;
  // `h`, `p` and a chapter's `where` may be functions of state, so prose can
  // quote numbers that depend on toggles and never disagree with the scene.
  const stateText = (v) => (typeof v === 'function' ? v(cfg.state) : v);
  const beatText = (b) => `${stateText(b.h)}. ${stateText(b.p)}`;

  const spokenDuration = chapters.map((ch) => {
    if (!voice || !voice.available || !ch.beats?.length) return ch.duration;
    const total = ch.beats.reduce((n, b) => n + voice.estimate(beatText(b)), 0);
    return Math.max(ch.duration, Math.round(total / targetRate));
  });
  // the running length of chapter i, which depends on whether narration is on
  const dur = (i) => (voice && voice.enabled ? spokenDuration[i] : chapters[i].duration);

  // --- HUD + legend -------------------------------------------------------
  const hudEl = $('hud');
  let hudData = null, hudSig = '';
  const ctx = { state: cfg.state, hud: { set(d) { hudData = d; } } };

  function paintHud() {
    if (!cfg.renderHud) return;
    if (!hudData) { hudEl.classList.remove('on'); hudSig = ''; return; }
    const sig = JSON.stringify(hudData);
    if (sig === hudSig) return;
    hudSig = sig;
    const html = cfg.renderHud(hudData);
    if (!html) { hudEl.classList.remove('on'); return; }
    hudEl.classList.add('on');
    hudEl.innerHTML = html;
  }

  function setLegend(kind) {
    const el = $('legend');
    const spec = kind && cfg.legends[kind];
    if (!spec) { el.classList.remove('on'); return; }
    el.classList.add('on');
    const [cap, items] = spec;
    $('legend-cap').textContent = cap;
    $('legend-row').innerHTML = items
      .map(([n, c]) => `<span class="k"><span class="dot" style="background:${hex(c)}"></span>${n}</span>`).join('');
  }

  // --- director -----------------------------------------------------------
  let current = null, idx = -1, tSec = 0, playing = false, speed = 1, elapsed = 0;
  let freeCam = false, dragging = false, snapCam = true, beatIdx = -1;
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();

  const railEl = $('chapters');
  chapters.forEach((c, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span>${c.title}</span>`;
    li.onclick = () => go(i);
    railEl.appendChild(li);
  });

  function unload() {
    if (!current) return;
    scene.remove(current.root);
    disposeDeep(current.root);
    current = null;
  }

  function go(i, keepTime = false) {
    i = clamp(i, 0, chapters.length - 1) | 0;
    const t = keepTime ? tSec : 0;
    unload();
    idx = i;
    current = chapters[i].build(ctx);
    scene.add(current.root);
    tSec = keepTime ? Math.min(t, dur(i)) : 0;
    freeCam = false; snapCam = true; beatIdx = -1; spokenKey = '';
    voice?.cancel();
    hudData = null; hudSig = '';   // a chapter that never calls hud.set() shows nothing, not the last one's readout
    if (motes) {
      const a = cfg.ambient.for ? cfg.ambient.for(i, chapters[i]) : { visible: true };
      motes.visible = a.visible !== false;
      if (a.color !== undefined) motes.material.color.setHex(a.color);
    }
    setLegend(chapters[i].legend);
    closeReader();
    $('read-btn').style.display = chapters[i].article ? '' : 'none';
    $('where').textContent = stateText(chapters[i].where) || '';
    for (const [tg, b] of toggleBtns) refreshToggle(tg, b);
    [...railEl.children].forEach((li, k) => {
      li.classList.toggle('active', k === i);
      li.classList.toggle('done', k < i);
    });
    $('recenter').classList.remove('on');
  }

  let spokenKey = '';
  function narrate(force = false) {
    if (!voice || !voice.enabled || !playing || beatIdx < 0) return;
    const key = `${idx}:${beatIdx}`;
    if (key === spokenKey && !force) return;
    spokenKey = key;
    const beats = chapters[idx].beats;
    const b = beats[beatIdx];
    const span = (beats[beatIdx + 1]?.at ?? 1) - b.at;
    voice.speak(beatText(b), (span * dur(idx)) / speed, { queue: true });
  }

  function setBeat(t01) {
    const beats = chapters[idx].beats || [];
    if (!beats.length) return;
    let b = 0;
    for (let k = 0; k < beats.length; k++) if (t01 >= beats[k].at) b = k;
    if (b === beatIdx) return;
    beatIdx = b;
    narrate();
    $('beat-h').innerHTML = stateText(beats[b].h);
    $('beat-p').innerHTML = stateText(beats[b].p);
    $('panel').animate([{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // --- loop ---------------------------------------------------------------
  const timer = new THREE.Timer();
  const scrub = $('scrub');
  const fill = scrub.querySelector('.fill');
  const knob = scrub.querySelector('.knob');

  function tick() {
    requestAnimationFrame(tick);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.06);
    elapsed += dt;

    if (current) {
      const D = dur(idx);
      if (playing) {
        if (stepping) {
          // Step pacing: hold at each beat boundary the playhead crosses this
          // frame. Crossing = "was a boundary inside (before, now]?" — with NO
          // exclusion guard: any guard bigger than one frame step (16ms at
          // 60fps) makes every boundary invisible. Re-triggering the boundary
          // we're parked on is instead prevented by parking just PAST it, so
          // it can never be strictly greater than `before` again. Parking past
          // the boundary also flips the panel to the upcoming beat during the
          // hold — you read it, then press to watch it, and its narration
          // starts with its animation (narrate() skips while halted).
          // Narration already in flight keeps going through the hold so it can
          // finish its sentence — halting is not the viewer pausing.
          const before = tSec;
          tSec += dt * speed;
          let hit = 0;
          for (const b of chapters[idx].beats || []) {
            const at = b.at * D;
            if (at > before && at <= tSec) { hit = at; break; }
          }
          if (hit) { tSec = hit + 0.001; halt(); }
          else if (tSec >= D) { tSec = D; halt(); }   // hold at the end; advancing goes to the next chapter
        } else {
          tSec += dt * speed;
          if (tSec >= D) {
            if (idx < chapters.length - 1) { go(idx + 1); return; }
            tSec = D; setPlaying(false);
          }
        }
      }
      const t01 = clamp(tSec / D, 0, 1);
      current.update(t01, dt, elapsed);
      setBeat(t01);

      const fov = current.camera(t01, camPos, camTgt) ?? cc.fov;
      if (!freeCam) {
        const k = snapCam ? 1 : 1 - Math.exp(-7 * dt);
        camera.position.lerp(camPos, k);
        controls.target.lerp(camTgt, k);
        camera.fov = snapCam ? fov : lerp(camera.fov, fov, k);
        camera.updateProjectionMatrix();
        snapCam = false;
      }
      const p = t01 * 100;
      fill.style.width = p + '%';
      knob.style.left = p + '%';
      $('clock').textContent = `${fmt(tSec)} / ${fmt(D)}`;
    }

    if (motes) motes.rotation.y = elapsed * motes.userData.drift;
    controls.update();
    paintHud();
    composer.render();
    css2d.render(scene, camera);
  }

  // --- UI -----------------------------------------------------------------
  const playBtn = $('play');
  let stepping;
  try { stepping = (localStorage.getItem('film:pacing') ?? cfg.pacing) === 'step'; }
  catch { stepping = cfg.pacing === 'step'; }

  // stop advancing but let the narration finish — the step-mode hold
  function halt() {
    playing = false;
    playBtn.textContent = '▶';
    playBtn.classList.add('await');
  }

  function setPlaying(v) {
    // advancing from the very end of a chapter means "next chapter"
    if (v && stepping && idx < chapters.length - 1 && tSec >= dur(idx) - 0.1) go(idx + 1);
    playing = v;
    playBtn.textContent = v ? '❚❚' : '▶';
    playBtn.classList.remove('await');
    if (!voice) return;
    if (!v) voice.pause();
    else if (spokenKey === `${idx}:${beatIdx}`) voice.resume();
    else narrate();
  }
  playBtn.onclick = () => setPlaying(!playing);

  const paceBtn = $('pace-btn');
  function paintPace() {
    paceBtn.textContent = stepping ? 'Step ▸' : 'Auto ▸▸';
    paceBtn.classList.toggle('on', stepping);
  }
  paintPace();
  paceBtn.onclick = () => {
    stepping = !stepping;
    try { localStorage.setItem('film:pacing', stepping ? 'step' : 'auto'); } catch { /* private mode */ }
    paintPace();
    if (!stepping && !playing) setPlaying(true);   // switching to auto resumes the flow
  };
  $('prev').onclick = () => (tSec > 2.5 ? (tSec = 0, snapCam = true, beatIdx = -1) : go(idx - 1));
  $('next').onclick = () => go(idx + 1);

  const SPEEDS = [0.5, 1, 1.5, 2];
  $('speed').onclick = (e) => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    e.target.textContent = speed + '×';
  };

  // deep-dive reader: a chapter may carry `article` — an HTML string (or
  // function of state) of unhurried prose + diagrams. Opening it pauses the
  // film; the viewer reads at their own pace and closes to resume the show.
  const readerEl = $('reader');
  function openReader() {
    if (!chapters[idx].article) return;
    $('reader-body').innerHTML = stateText(chapters[idx].article);
    readerEl.classList.add('on');
    readerEl.querySelector('.sheet').scrollTop = 0;
    setPlaying(false);
  }
  function closeReader() { readerEl.classList.remove('on'); }
  $('read-btn').onclick = openReader;
  $('reader-x').onclick = closeReader;
  readerEl.addEventListener('pointerdown', (e) => { if (e.target === readerEl) closeReader(); });

  const labelsBtn = $('labels-btn');
  labelsBtn.onclick = () => {
    const hidden = $('labels').classList.toggle('hidden');
    labelsBtn.classList.toggle('on', !hidden);
  };

  const voiceBtn = $('voice-btn');
  if (!voice || !voice.available) voiceBtn.remove();
  else {
    const paint = () => voiceBtn.classList.toggle('on', voice.enabled);
    paint();
    voiceBtn.onclick = () => {
      // turning narration on stretches every chapter, so hold the position we
      // are at rather than the raw timestamp
      const t01 = clamp(tSec / dur(idx), 0, 1);
      voice.setEnabled(!voice.enabled);
      paint();
      tSec = t01 * dur(idx);
      spokenKey = '';
      if (voice.enabled) narrate();
    };
  }

  const uncenter = () => { freeCam = false; $('recenter').classList.remove('on'); };
  $('recenter').onclick = uncenter;

  // project-supplied toggles: a button bound to your own state, usually
  // paired with film.reload() to re-run the film under different assumptions
  const toggleBtns = new Map();
  for (const tg of cfg.toggles) {
    const b = document.createElement('button');
    b.id = tg.id;
    if (tg.title) b.title = tg.title;
    b.onclick = () => { tg.onClick(film); refreshToggle(tg, b); };
    $('toggles').appendChild(b);
    toggleBtns.set(tg, b);
    refreshToggle(tg, b);
  }
  function refreshToggle(tg, b) {
    b.textContent = tg.label(cfg.state);
    b.classList.toggle('on', !!(tg.active && tg.active(cfg.state)));
    // a toggle may scope itself to the chapters where it means something
    // (idx is -1 during initial setup, before any chapter is loaded)
    b.style.display = !tg.when || (idx >= 0 && tg.when(cfg.state, idx, chapters[idx])) ? '' : 'none';
  }

  let scrubbing = false;
  const seekPx = (e) => {
    const r = scrub.getBoundingClientRect();
    tSec = clamp((e.clientX - r.left) / r.width, 0, 1) * dur(idx);
    beatIdx = -1; snapCam = true; voice?.cancel();
  };
  scrub.addEventListener('pointerdown', (e) => { scrubbing = true; scrub.setPointerCapture(e.pointerId); seekPx(e); });
  scrub.addEventListener('pointermove', (e) => { if (scrubbing) seekPx(e); });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });

  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('change', () => {
    if (!dragging) return;
    freeCam = true;
    $('recenter').classList.add('on');
  });
  controls.addEventListener('end', () => { dragging = false; });

  // Seek by a few seconds, carrying across chapter boundaries so the film
  // scrubs like one continuous video rather than ten separate ones.
  function nudge(delta) {
    let i = idx, t = tSec + delta;
    while (t < 0 && i > 0) { i -= 1; t += dur(i); }
    while (t > dur(i) && i < chapters.length - 1) { t -= dur(i); i += 1; }
    t = clamp(t, 0, dur(i));
    if (i !== idx) go(i); else { voice?.cancel(); spokenKey = ''; }
    tSec = t;
    beatIdx = -1; snapCam = true;
  }

  addEventListener('keydown', (e) => {
    // while reading, the page behaves like a page: esc closes, space scrolls
    if (readerEl.classList.contains('on')) {
      if (e.code === 'Escape') closeReader();
      return;
    }
    if (e.key === 'd' || e.key === 'D') { openReader(); return; }
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); nudge(cfg.seekStep); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); nudge(-cfg.seekStep); }
    else if (e.code === 'ArrowDown') { e.preventDefault(); go(idx + 1); }
    else if (e.code === 'ArrowUp') { e.preventDefault(); go(idx - 1); }
    else if (e.key === 'l' || e.key === 'L') labelsBtn.click();
    else if (e.key === 'r' || e.key === 'R') uncenter();
    else if (e.key === 'v' || e.key === 'V') voiceBtn?.click();
    else if (e.key === 'p' || e.key === 'P') paceBtn.click();
    else {
      const tg = cfg.toggles.find(x => x.key && x.key.toLowerCase() === e.key.toLowerCase());
      if (tg && (!tg.when || tg.when(cfg.state, idx, chapters[idx]))) toggleBtns.get(tg).click();
    }
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    bloom.setSize(innerWidth, innerHeight);
    css2d.setSize(innerWidth, innerHeight);
  });

  if (cfg.intro) {
    $('intro-eyebrow').textContent = cfg.intro.eyebrow || '';
    $('intro-headline').innerHTML = cfg.intro.headline || cfg.title;
    $('intro-body').innerHTML = cfg.intro.body || '';
    if (cfg.intro.cta) $('begin').textContent = cfg.intro.cta;
    $('begin').onclick = () => { $('intro').classList.add('gone'); setPlaying(true); };
  } else {
    $('intro').remove();
  }

  const film = {
    THREE, scene, camera, renderer, controls, chapters,
    state: cfg.state,
    go,
    // Rebuild the current chapter under new assumptions, snapped back to the
    // start of the current beat: the viewer re-watches the same moment under
    // the new state — a controlled comparison, not a jump cut mid-choreography.
    reload() {
      const beats = chapters[idx].beats || [];
      const at = beats[beatIdx]?.at ?? clamp(tSec / dur(idx), 0, 1);
      go(idx, false);
      tSec = at * dur(idx);
    },
    seek(i, t01) { go(i); tSec = t01 * dur(i); snapCam = true; beatIdx = -1; },
    play() { setPlaying(true); },
    pause() { setPlaying(false); },
    info() {
      return { idx, tSec, t01: tSec / dur(idx), playing,
        duration: dur(idx), stepping, voice: voice ? voice.enabled : null, voiceName: voice?.voiceName ?? null,
        drawCalls: renderer.info.render.calls, tris: renderer.info.render.triangles,
        geoms: renderer.info.memory.geometries, texs: renderer.info.memory.textures };
    },
  };

  go(0);
  setPlaying(cfg.autoplay && !cfg.intro);
  tick();
  window.__film = film;
  return film;
}
