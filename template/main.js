// Starter film: copy this directory, rename it, replace the chapters.
// It exists to show the whole engine surface in one readable file — and to keep
// the engine honest, since it shares no code with protein-synthesis.
import * as THREE from 'three';
import { createFilm } from '../engine/film.js';
import { camPath, win, ease, htmlLabel, blob, baseMaterial, rng } from '../engine/gfx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const label = (html, pos) => { const l = htmlLabel(html); l.position.copy(pos); return l; };

// --- chapter 1: a lattice that assembles -----------------------------------
const lattice = {
  id: 'lattice',
  title: 'A lattice',
  where: 'Chapter one · assembly',
  duration: 18,
  legend: 'demo',
  beats: [
    { at: 0.0, h: 'Chapters are plain objects', p: 'Each one builds a <code>THREE.Object3D</code>, then gets an <code>update(t)</code> call every frame with <code>t</code> running 0→1 over its duration.' },
    { at: 0.5, h: 'Narration is keyed to time', p: 'These paragraphs are <b>beats</b> — <code>{ at, h, p }</code>. The engine swaps the panel when playback passes each <code>at</code>.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const N = 5, gap = 3.2, cubes = [];
    const r = rng(4);
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1),
        baseMaterial(x === 2 && y === 2 && z === 2 ? 0xf2c14e : 0x4ecdc4));
      m.userData.home = V((x - 2) * gap, (y - 2) * gap, (z - 2) * gap);
      m.userData.from = V(r() * 90 - 45, r() * 90 - 45, r() * 90 - 45);
      m.userData.delay = r() * 0.45;
      root.add(m); cubes.push(m);
    }
    const tag = label('One highlighted node', V(0, 3, 0));
    root.add(tag);

    return {
      root,
      update(t, dt, elapsed) {
        for (const c of cubes) {
          const k = ease(win(t, c.userData.delay, c.userData.delay + 0.4));
          c.position.copy(c.userData.from).lerp(c.userData.home, k);
          c.rotation.set(elapsed * 0.4, elapsed * 0.3, 0);
          c.scale.setScalar(0.4 + 0.6 * k);
        }
        root.rotation.y = elapsed * 0.15;
        tag.visible = t > 0.5;
        ctx.hud.set({ placed: cubes.filter(c => c.position.distanceTo(c.userData.home) < 0.2).length, of: cubes.length });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 8, 70], target: [0, 0, 0], fov: 46 },
        { at: 0.55, pos: [22, 10, 34], target: [0, 0, 0], fov: 46 },
        { at: 1.00, pos: [0, 4, 40], target: [0, 0, 0], fov: 46 },
      ]),
    };
  },
};

// --- chapter 2: a blob that breathes ---------------------------------------
const shape = {
  id: 'shape',
  title: 'A shape',
  where: 'Chapter two · form',
  duration: 14,
  legend: null,
  beats: [
    { at: 0.0, h: 'Camera moves are declarative', p: '<code>camPath()</code> takes keyframes and eases between them. Drag to take over; press <kbd>R</kbd> to hand control back.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const b = blob(8, 5, new THREE.MeshStandardMaterial({
      color: 0x8fb6ff, roughness: 0.35, transparent: true, opacity: 0.75, side: THREE.FrontSide }),
      { seed: 12, amp: 0.24, lobes: 5 });
    root.add(b, label('blob(radius, detail, material)', V(0, 11, 0)));
    return {
      root,
      update(t, dt, elapsed) {
        b.rotation.set(elapsed * 0.2, elapsed * 0.3, 0);
        b.scale.setScalar(1 + Math.sin(elapsed * 1.5) * 0.06);
        ctx.hud.set(null);
      },
      camera: camPath([
        { at: 0.0, pos: [0, 0, 34], target: [0, 0, 0], fov: 46 },
        { at: 1.0, pos: [18, 8, 26], target: [0, 0, 0], fov: 46 },
      ]),
    };
  },
};

createFilm({
  title: 'Template',
  subtitle: 'Two chapters, no subject',
  chapters: [lattice, shape],
  legends: { demo: ['Legend', [['ordinary node', 0x4ecdc4], ['highlighted', 0xf2c14e]]] },
  renderHud: (d) => `<div class="line"><span class="lab">placed</span><span class="seq">${d.placed} / ${d.of}</span></div>`,
  intro: {
    eyebrow: 'Engine starter',
    headline: 'A <em>template</em> film',
    body: 'Copy <code>template/</code>, rename it, and replace the chapters. Everything you see around the viewport — rail, narration, transport, legend, HUD — comes from the engine.',
    cta: 'Play',
  },
  camera: { fov: 46, near: 0.1, far: 2000, start: [0, 8, 70], min: 3, max: 300 },
  ambient: { count: 1200, spread: [200, 140, 200], for: () => ({ visible: true, color: 0x7fb8e8 }) },
});
