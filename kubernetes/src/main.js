// Boot the renderer, then run the chapters. Everything visual lives in
// world.js; everything narrative lives in chapters.js. This file is the wiring.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { buildWorld, drawSelectors, runningPods } from './world.js';
import { chapters } from './chapters.js';
import { tween, wait, forever, stepTweens, CANCEL } from './anim.js';

/* ── renderer ────────────────────────────────────────────────────────── */

const stage = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
document.getElementById('labels').appendChild(labelRenderer.domElement);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0B1A2B);
scene.fog = new THREE.Fog(0x0B1A2B, 58, 145);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 300);
camera.position.set(0, 18, 42);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .07;
controls.minDistance = 8;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * .49;
controls.target.set(0, 3.5, 0);

/* ── light: low sun over dark water ─────────────────────────────────── */

scene.add(new THREE.HemisphereLight(0x9FC0EC, 0x08131F, .75));

const key = new THREE.DirectionalLight(0xFFF1E2, 2.1);
key.position.set(16, 26, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -34;
key.shadow.camera.right = 34;
key.shadow.camera.top = 34;
key.shadow.camera.bottom = -34;
key.shadow.camera.far = 90;
key.shadow.bias = -0.0012;
scene.add(key);

const fill = new THREE.DirectionalLight(0x4C7EF3, .9);
fill.position.set(-22, 12, -18);
scene.add(fill);

/* ── bloom, so the emissive parts actually glow ─────────────────────── */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// threshold high enough that the chart-paper surfaces don't bloom into mush
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .5, .95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── world ───────────────────────────────────────────────────────────── */

const world = buildWorld(scene);

/* ── camera moves ────────────────────────────────────────────────────── */

// The chapter card covers the left of the screen, so translate the whole view
// sideways to keep the subject clear of it. The shift scales with how far the
// camera is, so a close-up is nudged as much as a wide shot — no more, no less.
function viewShift(dist) {
  const k = Math.min(Math.max(dist, 8), 45);
  return innerWidth > 900 ? { x: -k * .19, y: 0 } : { x: 0, y: -k * .1 };
}

let camSig = { dead: false };
let camHome = { pos: [0, 18, 42], target: [0, 3.5, 0] };

function camTo(preset, dur = 1.8) {
  camHome = preset;
  camSig.dead = true;
  camSig = { dead: false };

  // presets are framed for a landscape window; a narrow one needs the camera
  // pulled back or the cluster falls off both edges
  const rawPos = new THREE.Vector3(...preset.pos);
  const rawTarget = new THREE.Vector3(...preset.target);
  const dir = rawPos.clone().sub(rawTarget);
  const dist = dir.length() * Math.min(Math.max(1.5 / camera.aspect, 1), 2.4);
  const s = viewShift(dist);
  const toTarget = rawTarget.clone().add(new THREE.Vector3(s.x, s.y, 0));
  const toPos = toTarget.clone().add(dir.normalize().multiplyScalar(dist));

  if (dur <= 0) {
    camera.position.copy(toPos);
    controls.target.copy(toTarget);
    return Promise.resolve();
  }
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  return tween({
    dur, ease: 'io', signal: camSig,
    onUpdate: u => {
      camera.position.lerpVectors(fromPos, toPos, u);
      controls.target.lerpVectors(fromTarget, toTarget, u);
    },
  }).catch(e => { if (e !== CANCEL) throw e; });
}

/* ── the ledger (desired vs actual) ─────────────────────────────────── */

const $ = id => document.getElementById(id);
const led = { desired: 0, actual: 0, state: 'idle' };

function setLedger(desired, actual, state) {
  if (desired !== null && desired !== undefined) led.desired = desired;
  if (actual !== null && actual !== undefined) led.actual = actual;
  if (state !== null && state !== undefined) led.state = state;

  $('led-desired').textContent = led.desired;
  $('led-actual').textContent = led.actual;
  $('led-state').textContent = led.state;

  const match = led.desired > 0 && led.actual === led.desired;
  $('led-actual').classList.toggle('is-match', match);

  const pct = led.desired > 0 ? Math.min(1, led.actual / led.desired) * 100 : 0;
  const fillEl = $('led-fill');
  fillEl.style.width = pct + '%';
  fillEl.classList.toggle('is-gap', !match);
}

/* ── chapter card ────────────────────────────────────────────────────── */

function renderCard(ch, i, ctx) {
  $('c-num').textContent = String(i + 1).padStart(2, '0');
  $('c-kicker').textContent = ch.kicker;
  $('c-title').textContent = ch.title;
  $('c-body').innerHTML = ch.body;

  $('c-list').innerHTML = (ch.list || [])
    .map(([term, def]) => `<li><em>${term}</em><span>${def}</span></li>`).join('');

  $('c-legend').innerHTML = (ch.legend || [])
    .map(([col, label]) => `<span class="leg"><i style="background:#${col.toString(16).padStart(6, '0')}"></i>${label}</span>`)
    .join('');

  const acts = $('c-actions');
  acts.innerHTML = '';
  if (ch.actions?.length) {
    const h = document.createElement('p');
    h.className = 'try-label';
    h.textContent = 'your turn';
    acts.appendChild(h);
  }
  for (const act of ch.actions || []) {
    const b = document.createElement('button');
    b.className = 'act';
    b.textContent = act.label;
    b.onclick = async () => {
      const btns = acts.querySelectorAll('.act');
      btns.forEach(el => el.disabled = true);
      await runAction(act);
      btns.forEach(el => el.disabled = false);
    };
    acts.appendChild(b);
  }
  $('card').scrollTop = 0;
}

/* ── chapter runner ──────────────────────────────────────────────────── */

// Chapters that never end on their own; autoplay moves on after this long.
const DWELL = {
  'the loop': 15, 'self-healing': 28, 'service': 30,
  'scaling': 34, 'rollout': 36, 'the whole map': 1e9,
};

let index = -1;
let playing = true;
let paused = false;
let current = { sig: { dead: true }, ctx: null };
let dwellTimer = null;

function makeCtx(sig) {
  return {
    world, sig, desired: 0, version: 'v1',
    tween: o => tween({ ...o, signal: sig }),
    wait: s => wait(s, sig),
    loop: fn => forever(fn, sig),
    cam: (preset, dur) => camTo(preset, dur),
    led: setLedger,
    sync() {
      drawSelectors(world);
      setLedger(null, runningPods(world).length, null);
    },
    done() { if (playing) scheduleNext(.8); },
  };
}

let dwell = null;   // { start, total } — feeds the chapter progress bar
const chapfill = document.querySelector('#chapbar i');

function scheduleNext(delaySec) {
  clearTimeout(dwellTimer);
  // a chapter that holds for minutes has no meaningful countdown — hide the bar
  dwell = delaySec < 120 ? { start: performance.now(), total: delaySec * 1000 } : null;
  if (!dwell) chapfill.style.width = '0%';
  const at = index;
  dwellTimer = setTimeout(() => {
    if (playing && index === at && index < chapters.length - 1) go(index + 1);
  }, delaySec * 1000);
}

async function go(i) {
  index = (i + chapters.length) % chapters.length;
  const ch = chapters[index];

  current.sig.dead = true;
  const sig = { dead: false };
  const ctx = makeCtx(sig);
  current = { sig, ctx };

  renderCard(ch, index, ctx);
  renderPorts();
  ch.setup(ctx);
  if (playing) scheduleNext(DWELL[ch.port] ?? 34);

  try {
    await ch.play(ctx);
  } catch (e) {
    if (e !== CANCEL) throw e;
  }
}

async function runAction(act) {
  // Hand control to the reader: stop the chapter's own choreography first.
  const prev = current.ctx;
  current.sig.dead = true;
  stopAutoplay();

  const sig = { dead: false };
  const ctx = Object.assign(makeCtx(sig), { desired: prev.desired, version: prev.version });
  current = { sig, ctx };
  try {
    await act.run(ctx);
  } catch (e) {
    if (e !== CANCEL) throw e;
  }
}

/* ── transport ───────────────────────────────────────────────────────── */

function renderPorts() {
  const ol = $('ports');
  if (ol.children.length !== chapters.length) {
    ol.innerHTML = chapters.map((c, i) =>
      `<li><button class="port" data-i="${i}" aria-label="${c.port}"><i></i><span>${i + 1} · ${c.port}</span></button></li>`
    ).join('');
    ol.onclick = e => {
      const b = e.target.closest('.port');
      if (b) go(+b.dataset.i);
    };
  }
  [...ol.querySelectorAll('.port')].forEach((b, i) => {
    b.classList.toggle('is-now', i === index);
    b.classList.toggle('is-done', i < index);
  });
}

function setPlaying(on) {
  playing = on;
  paused = !on;
  renderPlayBtn();
  if (!on) { clearTimeout(dwellTimer); dwell = null; chapfill.style.width = '0%'; }
  else if (index >= 0) scheduleNext(DWELL[chapters[index].port] ?? 34);
}

function renderPlayBtn() {
  const b = $('play');
  b.innerHTML = playing ? '<i>❚❚</i><span>Pause</span>' : '<i>▶</i><span>Play</span>';
  b.classList.toggle('is-paused', !playing);
}

/** Stop auto-advancing but keep the scene alive — for the "your turn" buttons. */
function stopAutoplay() {
  playing = false;
  paused = false;
  clearTimeout(dwellTimer);
  dwell = null;
  chapfill.style.width = '0%';
  renderPlayBtn();
}

controls.addEventListener('start', () => { if (playing) setPlaying(false); });

$('prev').onclick = () => go(index - 1);
$('next').onclick = () => go(index + 1);
$('play').onclick = () => setPlaying(!playing);
$('recenter').onclick = () => camTo(camHome, 1.1);

addEventListener('keydown', e => {
  if (document.getElementById('gate')?.classList.contains('is-gone') === false) return;
  if (e.key === 'ArrowRight') go(index + 1);
  else if (e.key === 'ArrowLeft') go(index - 1);
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key === 'r' || e.key === 'R') camTo(camHome, 1.1);
});

$('hint').innerHTML =
  '<b>drag</b> to orbit · <b>scroll</b> to zoom · <b>&larr; &rarr;</b> chapters · <b>space</b> pause';

/* ── resize ──────────────────────────────────────────────────────────── */

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

/* ── loop ────────────────────────────────────────────────────────────── */

let last = performance.now();
let frozen = false;   // debug: window.k8s.freeze() stops the loop for screenshots

function frame(now = performance.now()) {
  if (frozen) return;
  requestAnimationFrame(frame);
  // paused feeds the whole scene dt = 0: tweens, ambient motion and traffic
  // all stand still, while the camera stays yours to drag
  const dt = paused ? 0 : Math.min((now - last) / 1000, 1 / 20);
  last = now;
  if (playing && dwell) {
    chapfill.style.width = Math.min(100, ((now - dwell.start) / dwell.total) * 100) + '%';
  }
  stepTweens(dt);
  world.update(dt);
  controls.update();
  composer.render();
  labelRenderer.render(scene, camera);
}

frame();
playing = false;
go(0);
setPlaying(false);

const gate = $('gate');
function start() {
  gate.classList.add('is-gone');
  setTimeout(() => gate.remove(), 500);
  setPlaying(true);
  go(0);
}
$('gate-go').onclick = start;
$('gate-go').focus();

// handy for poking at it from the console
window.k8s = { go, world, setPlaying, camera, controls, freeze: () => { frozen = true; } };
