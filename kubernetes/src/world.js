// Builds the cluster: ground, worker nodes, the control plane, the Service
// gate, and everything that moves between them. Chapters only ever call the
// small API at the bottom (addPod, killNode, setTraffic…) — never raw meshes.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const C = {
  paper:  0xF2EDE3,
  kube:   0x4C7EF3,
  signal: 0xFF6B35,
  go:     0x2FBF7E,
  dim:    0x6C7F94,
  deck:   0x1B3A5B,
  slab:   0x14304C,
  ground: 0x081420,
  v1:     0x4C7EF3,
  v2:     0x2FBF7E,
  pending:0x7E93AB,
};

// Four nodes in a 2x2 pool: compact enough that the whole cluster, the
// control plane above it and the Service in front all fit in one frame.
export const NODE_POS = [[-5, -5], [5, -5], [-5, 5], [5, 5]];
const NODE_W = 7, SLAB_H = 1.1, SLOT_GAP = 2.15;
const POD_Y = SLAB_H + 0.52;
const CP_Y = 10.5, CP_Z = -17;
const SVC_Z = 15;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ── little factories ────────────────────────────────────────────────── */

function solid(color, { rough = .62, metal = .08, emissive = 0x000000, ei = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei,
  });
}

/** Box with crisp paper-coloured edges — the edges are what make shapes read. */
function edged(geo, mat, edgeColor = C.paper, edgeOpacity = .28) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 28),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity }),
  );
  g.add(mesh, edges);
  g.userData.mesh = mesh;
  g.userData.edges = edges;
  return g;
}

function tagEl(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'tag ' + cls;
  el.textContent = text;
  return el;
}

/* ── the world ───────────────────────────────────────────────────────── */

export function buildWorld(scene) {
  const world = {
    scene, nodes: [], pods: [], tags: new Map(), links: [],
    ambient: [], traffic: null, t: 0,
  };

  /* ground: a chart, not a floor */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(160, 40, 0x18395A, 0x11283E);
  scene.add(grid);

  /* ── worker nodes ─────────────────────────────────────────────────── */
  NODE_POS.forEach(([x, z], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);

    const slabMat = solid(C.slab, { rough: .7 });
    const slab = edged(new RoundedBoxGeometry(NODE_W, SLAB_H, NODE_W, 3, .16), slabMat);
    slab.position.y = SLAB_H / 2;
    slab.userData.mesh.castShadow = true;
    slab.userData.mesh.receiveShadow = true;
    g.add(slab);

    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(NODE_W - .7, NODE_W - .7),
      new THREE.MeshStandardMaterial({ color: C.deck, roughness: .85 }),
    );
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = SLAB_H + .003;
    deck.receiveShadow = true;
    g.add(deck);

    // nine parking spaces, so "where does this pod go?" is a visible question
    const slots = [];
    for (let s = 0; s < 9; s++) {
      const sx = (s % 3 - 1) * SLOT_GAP, sz = (Math.floor(s / 3) - 1) * SLOT_GAP;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1.62, 1.62),
        new THREE.MeshBasicMaterial({ color: C.paper, transparent: true, opacity: .07 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(sx, SLAB_H + .012, sz);
      g.add(m);
      slots.push({ local: v3(sx, POD_Y, sz), world: v3(x + sx, POD_Y, z + sz), pod: null, marker: m });
    }

    // status lamp — the node's heartbeat, one glance tells you if it's alive
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(.15, 16, 12),
      solid(C.go, { emissive: C.go, ei: 1.4, rough: .3 }),
    );
    lamp.position.set(NODE_W / 2 - .55, SLAB_H + .22, NODE_W / 2 - .55);
    g.add(lamp);

    scene.add(g);
    // fill from the middle out, so a half-empty node still looks deliberate
    const order = [4, 1, 3, 5, 7, 0, 2, 6, 8].map(k => slots[k]);
    const node = { i, group: g, slab, deck, slots: order, lamp, x, z, healthy: true };
    world.nodes.push(node);

    addTag(world, `node${i}`, g, `node ${i + 1}`, 'is-quiet', v3(0, SLAB_H + .25, NODE_W / 2 + .3));
    addTag(world, `kubelet${i}`, g, 'kubelet', 'is-kube', v3(0, SLAB_H + .95, -NODE_W / 2 + .55));
  });

  addTag(world, 'workers', scene, 'worker nodes — where your code runs', 'is-big', v3(0, .2, 10.8));

  /* ── control plane ────────────────────────────────────────────────── */
  const cp = new THREE.Group();
  cp.position.set(0, CP_Y, CP_Z);
  scene.add(cp);

  const plate = edged(
    new RoundedBoxGeometry(24, .7, 6.4, 3, .2),
    solid(0x102A44, { rough: .55, metal: .2 }),
    C.kube, .5,
  );
  cp.add(plate);

  const partMat = () => solid(0x1B3E64, { rough: .45, metal: .25, emissive: C.kube, ei: .18 });

  // four parts, four silhouettes — shape alone should tell them apart
  const api = edged(new THREE.CylinderGeometry(1.65, 1.65, 2.4, 8), partMat(), C.kube, .55);
  api.position.set(-8.4, 1.55, 0);

  const etcd = edged(new THREE.CylinderGeometry(1.35, 1.35, 2.1, 28), partMat(), C.kube, .35);
  etcd.position.set(-2.8, 1.4, 0);
  for (let r = 0; r < 3; r++) {          // stacked rings: a ledger, written down
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.38, .045, 8, 40),
      new THREE.MeshBasicMaterial({ color: C.kube, transparent: true, opacity: .55 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -.6 + r * .6;
    etcd.add(ring);
  }

  const sched = edged(new THREE.BoxGeometry(2.6, 1.5, 2.6), partMat(), C.kube, .5);
  sched.position.set(2.8, 1.1, 0);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.4, 4), partMat());
  cone.position.y = 1.45;
  cone.rotation.y = Math.PI / 4;
  sched.add(cone);

  const ctrl = new THREE.Group();                 // a literal loop
  ctrl.position.set(8.4, 1.7, 0);
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, .34, 18, 44),
    solid(0x1B3E64, { rough: .4, metal: .3, emissive: C.kube, ei: .3 }),
  );
  ctrl.add(torus);
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(.3, 18, 14),
    solid(C.signal, { emissive: C.signal, ei: 2.6, rough: .3 }),
  );
  ctrl.add(bead);

  cp.add(api, etcd, sched, ctrl);
  world.cp = { group: cp, plate, api, etcd, sched, ctrl, torus, bead };

  addTag(world, 'cp', cp, 'control plane — the brain', 'is-big', v3(0, 4.9, 0));
  addTag(world, 'api', api, 'api server · the only door in', 'is-kube', v3(0, 1.9, 0));
  addTag(world, 'etcd', etcd, 'etcd · the written-down truth', 'is-kube', v3(0, 2.1, 0));
  addTag(world, 'sched', sched, 'scheduler · picks the node', 'is-kube', v3(0, 3.0, 0));
  addTag(world, 'ctrl', ctrl, 'controllers · close the gap', 'is-signal', v3(0, 2.2, 0));

  /* kubelet links: control plane ↔ every node */
  NODE_POS.forEach(([x, z], i) => {
    const curve = new THREE.QuadraticBezierCurve3(
      v3(x * 1.5, CP_Y - .5, CP_Z + .8),
      v3(x * 1.4, CP_Y - 4.2, (CP_Z + z) / 2),
      v3(x, SLAB_H + .3, z - NODE_W / 2 + .9),
    );
    const pts = curve.getPoints(48);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: C.kube, transparent: true, opacity: 0 }),
    );
    scene.add(line);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(.16, 12, 10),
      solid(C.kube, { emissive: C.kube, ei: 3, rough: .3 }),
    );
    pulse.visible = false;
    scene.add(pulse);
    world.links.push({ curve, line, pulse, phase: i * .27, node: i });
  });

  /* ── the Service gate + inbound traffic ───────────────────────────── */
  const svc = new THREE.Group();
  svc.position.set(0, 0, SVC_Z);
  svc.visible = false;
  scene.add(svc);

  const gate = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, .17, 16, 60),
    solid(C.signal, { emissive: C.signal, ei: 1.3, rough: .35 }),
  );
  gate.position.y = 2.7;
  svc.add(gate);
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(.12, .12, 2.7, 10),
    solid(0x2A3E52, { rough: .6 }),
  );
  post.position.y = 1.35;
  svc.add(post);
  world.svc = { group: svc, gate, port: v3(0, 2.7, SVC_Z) };
  addTag(world, 'svc', svc, 'service · one stable address', 'is-signal', v3(0, 5.6, 0));

  const client = new THREE.Group();
  client.position.set(-12, 0, SVC_Z + 7);
  client.visible = false;
  scene.add(client);
  const box = edged(new RoundedBoxGeometry(2.2, 1.5, 1.6, 3, .14), solid(0x24405C, { rough: .6 }), C.paper, .35);
  box.position.y = 1.1;
  client.add(box);
  world.client = { group: client, port: v3(-12, 1.1, SVC_Z + 7) };
  addTag(world, 'client', client, 'users', 'is-quiet', v3(0, 2.6, 0));

  /* selector lines: Service → the pods whose labels match */
  world.selectors = new THREE.Group();
  scene.add(world.selectors);

  /* traffic particle pool */
  const tGeo = new THREE.SphereGeometry(.12, 10, 8);
  const tMat = solid(C.signal, { emissive: C.signal, ei: 2.1, rough: .4 });
  const packets = [];
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(tGeo, tMat);
    m.visible = false;
    scene.add(m);
    packets.push({ mesh: m, t: 1, curve: null, leg: 0, target: null });
  }
  world.traffic = { on: false, packets, spawn: 0, rate: .13 };

  /* ── the manifest: a sheet of paper with real YAML on it ──────────── */
  world.manifest = makeManifest();
  scene.add(world.manifest.group);

  /* ── ambient motion ───────────────────────────────────────────────── */
  world.update = dt => updateWorld(world, dt);

  hideAllTags(world);
  return world;
}

/* ── manifest sheet ──────────────────────────────────────────────────── */

const MANIFEST_LINES = [
  ['kind:', ' Deployment'],
  ['metadata:', ''],
  ['  name:', ' web'],
  ['spec:', ''],
  ['  replicas:', ' 3', 'hi'],
  ['  template:', ''],
  ['    containers:', ''],
  ['    - image:', ' web:v1', 'v1'],
];

function makeManifest() {
  const cv = document.createElement('canvas');
  cv.width = 720; cv.height = 480;
  const g = cv.getContext('2d');
  const group = new THREE.Group();
  group.visible = false;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(4.9, 3.27),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }),
  );
  group.add(sheet);

  const draw = (replicas = 3, version = 'v1', highlight = null) => {
    g.clearRect(0, 0, 720, 480);
    g.fillStyle = '#EAE3D5';
    g.fillRect(0, 0, 720, 480);
    g.fillStyle = '#FF6B35';
    g.fillRect(0, 0, 720, 7);
    g.font = '600 22px "JetBrains Mono", monospace';
    g.fillStyle = '#8B7F6B';
    g.fillText('web.yaml — what you want', 34, 56);
    g.font = '400 27px "JetBrains Mono", monospace';
    let y = 118;
    for (const [k, val, mark] of MANIFEST_LINES) {
      let v = val;
      if (mark === 'hi') v = ' ' + replicas;
      if (mark === 'v1') v = ' web:' + version;
      const isHot = mark && mark === highlight;
      if (isHot) {
        g.fillStyle = 'rgba(255,107,53,.22)';
        g.fillRect(28, y - 26, 664, 38);
      }
      g.fillStyle = '#4A6076';
      g.fillText(k, 34, y);
      g.fillStyle = isHot ? '#C2410C' : '#0B1A2B';
      g.fillText(v, 34 + g.measureText(k).width, y);
      y += 44;
    }
    tex.needsUpdate = true;
  };
  draw();
  return { group, sheet, draw };
}

/* ── tags ────────────────────────────────────────────────────────────── */

function addTag(world, name, parent, text, cls, offset) {
  const obj = new CSS2DObject(tagEl(text, cls));
  obj.position.copy(offset);
  obj.visible = false;
  obj.userData.def = { text, cls };          // chapters rewrite these; base() puts them back
  parent.add(obj);
  world.tags.set(name, obj);
  return obj;
}

/** Restore every label to the text it was built with. */
export function resetTags(world) {
  for (const t of world.tags.values()) {
    t.element.textContent = t.userData.def.text;
    t.element.className = 'tag ' + t.userData.def.cls;
  }
}

export function hideAllTags(world) {
  for (const t of world.tags.values()) t.visible = false;
  for (const p of world.pods) if (p.tag) p.tag.visible = false;
}

/** The only way chapters touch labels: name what should be readable now. */
export function showTags(world, names) {
  hideAllTags(world);
  for (const n of names) {
    const t = world.tags.get(n);
    if (t) t.visible = true;
  }
}

export function setTagText(world, name, text, cls) {
  const t = world.tags.get(name);
  if (!t) return;
  t.element.textContent = text;
  if (cls !== undefined) t.element.className = 'tag ' + cls;
}

/* ── pods ────────────────────────────────────────────────────────────── */

let podSeq = 0;
const POD_GEO = new RoundedBoxGeometry(1.45, 1.04, 1.45, 3, .13);

export function makePod(world, version = 'v1') {
  const color = version === 'v2' ? C.v2 : C.v1;
  const g = edged(POD_GEO, solid(color, { emissive: color, ei: .28, rough: .4, metal: .1 }), C.paper, .5);
  g.userData.mesh.castShadow = true;
  world.scene.add(g);

  const pod = {
    id: ++podSeq, group: g, version, node: null, slot: null, tag: null,
    setVersion(v) {
      this.version = v;
      const c = v === 'v2' ? C.v2 : C.v1;
      g.userData.mesh.material.color.setHex(c);
      g.userData.mesh.material.emissive.setHex(c);
    },
  };
  world.pods.push(pod);
  return pod;
}

export function podLabel(world, pod, text, cls = 'is-quiet') {
  if (!pod.tag) {
    pod.tag = new CSS2DObject(tagEl(text, cls));
    pod.tag.position.set(0, .95, 0);
    pod.group.add(pod.tag);
  }
  pod.tag.element.textContent = text;
  pod.tag.element.className = 'tag ' + cls;
  pod.tag.visible = true;
  return pod.tag;
}

/** First empty slot on a healthy node, preferring the emptiest node. */
export function pickSlot(world, avoid = -1) {
  const cands = world.nodes
    .filter(n => n.healthy && n.i !== avoid && n.slots.some(s => !s.pod))
    .sort((a, b) => a.slots.filter(s => s.pod).length - b.slots.filter(s => s.pod).length);
  if (!cands.length) return null;
  const n = cands[0];
  return { node: n, slot: n.slots.find(s => !s.pod) };
}

export function place(world, pod, node, slot) {
  if (pod.slot) pod.slot.pod = null;
  pod.node = node; pod.slot = slot; slot.pod = pod;
  pod.group.position.copy(slot.world);
}

export function unplace(world, pod) {
  if (pod.slot) pod.slot.pod = null;
  pod.node = null; pod.slot = null;
}

export function destroyPod(world, pod) {
  unplace(world, pod);
  // removing the group does not fire 'removed' on the label, so do it by hand
  if (pod.tag) { pod.tag.removeFromParent(); pod.tag.element.remove(); pod.tag = null; }
  world.scene.remove(pod.group);
  const i = world.pods.indexOf(pod);
  if (i >= 0) world.pods.splice(i, 1);
}

export function clearPods(world) {
  for (const p of [...world.pods]) destroyPod(world, p);
  world.pods.length = 0;
}

export const runningPods = world => world.pods.filter(p => p.node && p.node.healthy);

/* ── selector lines (Service → pods) ─────────────────────────────────── */

export function drawSelectors(world) {
  world.selectors.clear();
  if (!world.svc.group.visible) return;
  for (const pod of runningPods(world)) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      world.svc.port,
      pod.group.position.clone().add(v3(0, .3, 0)),
    ]);
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineDashedMaterial({ color: C.signal, dashSize: .5, gapSize: .4, transparent: true, opacity: .35 }),
    );
    line.computeLineDistances();
    world.selectors.add(line);
  }
}

/* ── per-frame ───────────────────────────────────────────────────────── */

function updateWorld(world, dt) {
  world.t += dt;
  const t = world.t;

  world.cp.group.position.y = CP_Y + Math.sin(t * .7) * .18;
  world.cp.ctrl.rotation.z = -t * 1.1;
  world.cp.bead.position.set(Math.cos(-t * 1.1 + 1) * 1.35, Math.sin(-t * 1.1 + 1) * 1.35, 0);
  world.cp.etcd.rotation.y = t * .25;
  world.svc.gate.rotation.z = t * .35;

  for (const l of world.links) {
    if (l.line.material.opacity < .02) { l.pulse.visible = false; continue; }
    const u = ((t * .34 + l.phase) % 1);
    l.pulse.visible = world.nodes[l.node].healthy;
    l.pulse.position.copy(l.curve.getPoint(1 - u));
    l.pulse.scale.setScalar(.7 + Math.sin(u * Math.PI) * .8);
  }

  for (const n of world.nodes) {
    const m = n.lamp.material;
    m.emissiveIntensity = n.healthy ? 1.0 + Math.sin(t * 2.4 + n.i) * .45 : 2.6;
  }

  updateTraffic(world, dt);
}

/* Packets ride client → service, then service → a pod, then fade. */
function updateTraffic(world, dt) {
  const tr = world.traffic;
  const targets = runningPods(world);
  if (tr.on && targets.length) {
    tr.spawn -= dt;
    while (tr.spawn <= 0) {
      tr.spawn += tr.rate;
      const p = tr.packets.find(p => p.t >= 1);
      if (!p) break;
      p.t = 0; p.leg = 0; p.mesh.visible = true;
      p.target = targets[Math.floor(Math.random() * targets.length)];
      p.curve = new THREE.QuadraticBezierCurve3(
        world.client.port.clone(),
        world.client.port.clone().lerp(world.svc.port, .5).add(v3(0, 3.2, 0)),
        world.svc.port.clone(),
      );
    }
  }

  for (const p of tr.packets) {
    if (p.t >= 1) { p.mesh.visible = false; continue; }
    p.t += dt * (p.leg === 0 ? 1.05 : 1.5);
    if (p.t >= 1 && p.leg === 0) {
      p.leg = 1; p.t = 0;
      const end = p.target?.node
        ? p.target.group.position.clone().add(v3(0, .4, 0))
        : world.svc.port.clone();
      p.curve = new THREE.QuadraticBezierCurve3(
        world.svc.port.clone(),
        world.svc.port.clone().lerp(end, .5).add(v3(0, 2.6, 0)),
        end,
      );
      continue;
    }
    p.mesh.position.copy(p.curve.getPoint(Math.min(p.t, 1)));
    const fade = p.leg === 1 ? 1 - p.t * p.t : 1;
    p.mesh.scale.setScalar(.6 + fade * .7);
  }
}

/* ── node health ─────────────────────────────────────────────────────── */

export function setNodeHealth(world, i, healthy) {
  const n = world.nodes[i];
  n.healthy = healthy;
  n.lamp.material.color.setHex(healthy ? C.go : C.signal);
  n.lamp.material.emissive.setHex(healthy ? C.go : C.signal);
  n.slab.userData.mesh.material.color.setHex(healthy ? C.slab : 0x2A1710);
  n.deck.material.color.setHex(healthy ? C.deck : 0x39200F);
  n.slab.userData.edges.material.opacity = healthy ? .28 : .5;
  n.slab.userData.edges.material.color.setHex(healthy ? C.paper : C.signal);
  world.links[i].line.material.opacity = healthy ? world.links[i].line.material.opacity : 0;
}

export function setLinks(world, opacity) {
  for (const l of world.links) {
    l.line.material.opacity = world.nodes[l.node].healthy ? opacity : 0;
  }
}

export { v3, POD_Y, SLAB_H, CP_Y, CP_Z, SVC_Z, NODE_W };
