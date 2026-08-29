// viz.js — the film's shared visual vocabulary: one machine, drawn the same
// way in every chapter so the viewer's mental map survives chapter cuts.
// HBM lives at x<0, the SM array at x>0, and bytes travel the wire between.
// All sizes are proportional to the real numbers in machine.js.
import * as THREE from 'three';
import { htmlLabel, baseMaterial, rng, clamp, tubeFromPoints, dotTexture } from '../engine/gfx.js';
import { createInspector } from '../engine/inspect.js';
import { GPU } from './machine.js';

// one hover-inspector for the whole film; chapters call inspector.begin() in
// build() and track() whatever should explain itself on hover
export const inspector = createInspector();

export const COL = {
  weights: 0xf2c14e,   // gold — model weights
  kv: 0x63d5ff,        // ice blue — KV cache
  core: 0x4ecdc4,      // teal — SM cores at work
  token: 0xe8eef6,     // white — emitted tokens
  draft: 0xff8fab,     // pink — draft / speculative
  reject: 0xff6b6b,    // red — rejected / overflow
};

export const HBM_X = -24, SM_X = 24;
const HBM_W = 16, HBM_H = 22, HBM_D = 11;   // interior box == 80 GB

// bytes → interior height units (the whole box is GPU.hbm bytes)
export const gbH = (bytes) => HBM_H * (bytes / GPU.hbm);

// --- HBM: a glass box that bytes physically occupy ---------------------------
export function hbmBox() {
  const g = new THREE.Group();
  g.position.set(HBM_X, 0, 0);

  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(HBM_W, HBM_H, HBM_D),
    new THREE.MeshStandardMaterial({ color: 0x8fb6ff, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.05, side: THREE.FrontSide, depthWrite: false }));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(HBM_W, HBM_H, HBM_D)),
    new THREE.LineBasicMaterial({ color: 0x8fb6ff, transparent: true, opacity: 0.35 }));
  g.add(shell, edges);

  // weights: a gold slab filling the box bottom-up in proportion to its bytes
  const weights = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: COL.weights, roughness: 0.35,
      emissive: COL.weights, emissiveIntensity: 0.25 }));
  g.add(weights);

  // KV cache: one thin column per sequence, stacked into rows above the weights
  const KV_MAX = 160;
  const kv = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: COL.kv, roughness: 0.4,
      emissive: COL.kv, emissiveIntensity: 0.3 }), KV_MAX);
  kv.count = 0;
  g.add(kv);

  const M = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const api = {
    group: g, shell, weights, kv, edges,
    // weightsBytes: number. kvSeqBytes: array of per-sequence byte sizes
    // (values may animate frame to frame; overflow turns a column red-ish via scale clamp)
    set({ weightsBytes = 0, kvSeqBytes = [] } = {}) {
      const wh = Math.max(0.01, gbH(weightsBytes));
      weights.scale.set(HBM_W - 1.2, wh, HBM_D - 1.2);
      weights.position.y = -HBM_H / 2 + wh / 2 + 0.3;

      const perRow = 8, cw = (HBM_W - 2.4) / perRow;
      const baseY = -HBM_H / 2 + wh + 0.7;
      kv.count = Math.min(kvSeqBytes.length, KV_MAX);
      for (let i = 0; i < kv.count; i++) {
        const h = Math.max(0.02, gbH(kvSeqBytes[i]));
        const col = i % perRow, row = (i / perRow) | 0;
        // columns fill a row side by side; each new row sits in front (z), then loops up
        const zRow = row % 4, yRow = (row / 4) | 0;
        P.set(-HBM_W / 2 + 1.2 + cw * (col + 0.5),
              baseY + h / 2 + yRow * (gbH(2.2e9) + 0.35),
              HBM_D / 2 - 1.4 - zRow * 2.6);
        S.set(cw * 0.72, h, 2.0);
        M.compose(P, new THREE.Quaternion(), S);
        kv.setMatrixAt(i, M);
      }
      kv.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

// --- SM array: 132 cells that light up exactly as much as the math demands ---
export function smPanel() {
  const g = new THREE.Group();
  g.position.set(SM_X, 0, 0);
  const COLS = 12, ROWS = 11, N = COLS * ROWS, cell = 1.55, gap = 0.45;

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(cell, cell, cell),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), N);
  const M = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const c = i % COLS, r = (i / COLS) | 0;
    M.setPosition(0, (r - (ROWS - 1) / 2) * (cell + gap), (c - (COLS - 1) / 2) * (cell + gap));
    mesh.setMatrixAt(i, M);
  }
  mesh.instanceMatrix.needsUpdate = true;
  g.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry((cell + gap) * COLS + 1, (cell + gap) * ROWS + 1, cell + 2)),
    new THREE.LineBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.22 }));
  edges.rotation.y = Math.PI / 2;
  g.add(edges);

  const LIT = new THREE.Color(COL.core).multiplyScalar(2.1);
  const DARK = new THREE.Color(0x141f28);
  const tmp = new THREE.Color();
  let activity = 0;
  const api = {
    group: g, mesh, count: N,
    // frac of SMs doing useful work; lit cells shimmer so "busy" reads as alive
    setActivity(f) { activity = clamp(f, 0, 1); },
    update(elapsed) {
      const lit = Math.round(activity * N);
      for (let i = 0; i < N; i++) {
        if (i < lit) {
          const p = 0.75 + 0.25 * Math.sin(elapsed * 5 + i * 1.7);
          tmp.copy(LIT).multiplyScalar(p);
        } else {
          // idle cores still faintly breathe, so "idle" reads as waiting, not off
          tmp.copy(DARK).multiplyScalar(1 + 0.12 * Math.sin(elapsed * 1.2 + i));
        }
        mesh.setColorAt(i, tmp);
      }
      mesh.instanceColor.needsUpdate = true;
    },
  };
  api.update(0);
  return api;
}

// --- the wire: bytes in flight from HBM to the cores -------------------------
export function busFlow({ count = 420 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const r = rng(7);
  const lanes = [];   // per-particle: y/z offset + speed jitter + x phase
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, rad = Math.pow(r(), 0.6) * 2.4;
    lanes.push({ y: Math.sin(a) * rad, z: Math.cos(a) * rad, j: 0.7 + r() * 0.6, x: r() });
    pos.set([0, 0, 0], i * 3);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xbfe3ff, size: 2.6, map: dotTexture(), transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false }));

  const X0 = HBM_X + HBM_W / 2 + 0.5, X1 = SM_X - 3.5, SPAN = X1 - X0;
  let rate = 0;
  const api = {
    points,
    // rate01: fraction of peak bandwidth in flight (drives density and speed)
    set(rate01) { rate = clamp(rate01, 0, 1); },
    update(dt) {
      const a = geo.attributes.position.array;
      const vis = rate <= 0 ? 0 : Math.max(10, Math.round(count * (0.15 + 0.85 * rate)));
      const speed = 0.06 + 0.5 * rate;
      for (let i = 0; i < count; i++) {
        const L = lanes[i];
        L.x = (L.x + dt * speed * L.j) % 1;
        const k = i * 3;
        a[k] = X0 + L.x * SPAN;
        a[k + 1] = L.y * (1 + 0.25 * Math.sin(L.x * 9));
        a[k + 2] = L.z * (1 + 0.25 * Math.cos(L.x * 7));
      }
      geo.attributes.position.needsUpdate = true;
      geo.setDrawRange(0, vis);
      points.visible = vis > 0;
    },
  };
  return api;
}

// --- a full-weight "sweep": the whole gold block ghosting across the wire ----
// phase 0→1: leaves HBM, crosses, dissolves into the SM panel.
export function makeSweep(bytes, color = COL.weights) {
  const h = Math.max(0.4, gbH(bytes));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.3,
      emissive: color, emissiveIntensity: 0.55, transparent: true, opacity: 0 }));
  mesh.visible = false;
  return {
    mesh,
    at(phase) {
      if (phase <= 0 || phase >= 1) { mesh.visible = false; return; }
      mesh.visible = true;
      mesh.position.x = HBM_X + 6 + (SM_X - HBM_X - 10) * phase;
      mesh.material.opacity = 0.55 * Math.sin(Math.PI * phase);
      mesh.scale.y = 1 - 0.5 * phase;
    },
  };
}

// --- token chip: one generated token ----------------------------------------
export function tokenChip(color = COL.token, w = 1.5) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.05, 0.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35,
      emissive: color, emissiveIntensity: 0.4 }));
  return m;
}

// --- roofline: the one chart that holds the whole film -----------------------
// log-log; x = arithmetic intensity 0.1..10⁴ FLOPs/byte, y = FLOP/s 10¹¹..10¹⁵.
export function rooflinePlot({ W = 46, H = 26 } = {}) {
  const g = new THREE.Group();
  const X = (i) => (Math.log10(i) + 1) / 5 * W - W / 2;          // 0.1 → -W/2
  const Y = (f) => (Math.log10(f) - 11) / 4 * H - H / 2;         // 1e11 → -H/2
  const attainable = (i) => Math.min(GPU.tflops, i * GPU.bandwidth);

  const grid = [];
  for (let d = -1; d <= 4; d++) grid.push(new THREE.Vector3(X(10 ** d), -H / 2, 0), new THREE.Vector3(X(10 ** d), H / 2, 0));
  for (let d = 11; d <= 15; d++) grid.push(new THREE.Vector3(-W / 2, Y(10 ** d), 0), new THREE.Vector3(W / 2, Y(10 ** d), 0));
  const gridLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(grid),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 }));
  g.add(gridLines);

  const roofPts = [];
  for (let lx = -1; lx <= 4; lx += 0.05) roofPts.push(new THREE.Vector3(X(10 ** lx), Y(attainable(10 ** lx)), 0));
  g.add(tubeFromPoints(roofPts, 0.16, 8,
    new THREE.MeshStandardMaterial({ color: COL.core, emissive: COL.core, emissiveIntensity: 0.6, roughness: 0.4 })));

  const ridgeX = X(GPU.tflops / GPU.bandwidth);
  const ridge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ridgeX, -H / 2, 0), new THREE.Vector3(ridgeX, Y(GPU.tflops), 0)]),
    new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, dashSize: 0.6, gapSize: 0.5 }));
  ridge.computeLineDistances();
  g.add(ridge);

  for (const [v, txt] of [[0.1, '0.1'], [1, '1'], [10, '10'], [100, '100'], [1000, '10³'], [10000, '10⁴']]) {
    const l = htmlLabel(`<span class="sub">${txt}</span>`, 'muted'); l.position.set(X(v), -H / 2 - 1.4, 0); g.add(l);
  }
  for (const [v, txt] of [[1e11, '0.1 TF/s'], [1e12, '1'], [1e13, '10'], [1e14, '100'], [1e15, '1000 TF/s']]) {
    const l = htmlLabel(`<span class="sub">${txt}</span>`, 'muted'); l.position.set(-W / 2 - 3.2, Y(v), 0); g.add(l);
  }
  const xt = htmlLabel('arithmetic intensity — FLOPs per byte', 'muted'); xt.position.set(0, -H / 2 - 3.4, 0);
  const rt = htmlLabel(`ridge · ${Math.round(GPU.tflops / GPU.bandwidth)} FLOPs/byte`); rt.position.set(ridgeX, Y(4e12), 0);
  g.add(xt, rt);

  // a placeable dot: sphere + label; move(intensity, flops) re-derives position
  function dot(color, text) {
    const grp = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 }));
    const l = htmlLabel(text); l.position.set(0, 1.6, 0);
    grp.add(s, l);
    g.add(grp);
    return {
      group: grp, sphere: s, label: l,
      move(intensity, flops) { grp.position.set(X(intensity), Y(flops), 0); },
      retitle(html) { l.element.innerHTML = html; },
    };
  }

  return { group: g, X, Y, attainable, dot, ridgeX };
}
