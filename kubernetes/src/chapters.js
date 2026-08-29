// The script. Each chapter has a `setup` that snaps the world into a known
// state (so jumping around is safe) and a `play` that choreographs it.

import * as THREE from 'three';
import {
  C, showTags, setTagText, resetTags, makePod, podLabel, pickSlot, place,
  destroyPod, clearPods, runningPods, drawSelectors, setNodeHealth, setLinks, v3,
} from './world.js';

/* ── camera presets ──────────────────────────────────────────────────── */

export const CAM = {
  wide:   { pos: [0, 19, 34], target: [0, 3.4, -1] },
  nodes:  { pos: [0, 15, 27], target: [0, 1.2, 0] },
  plane:  { pos: [0, 14.6, 6], target: [0, 11.4, -17] },
  pod:    { pos: [-2.1, 4.2, 0.6], target: [-5, 1.6, -5] },
  loop:   { pos: [10.5, 14.6, -2], target: [8.4, 12.2, -17] },
  front:  { pos: [-1, 16, 44], target: [0, 3.4, 4] },
  map:    { pos: [0, 25, 40], target: [0, 4, -2] },
};

/* ── shared movements ────────────────────────────────────────────────── */


/** Arc a pod from where it is to a point, with a small landing squash. */
async function flyTo(ctx, pod, to, { dur = 1.1, lift = 4.5, ease = 'io' } = {}) {
  const from = pod.group.position.clone();
  const mid = from.clone().lerp(to, .5).add(v3(0, lift, 0));
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to.clone());
  await ctx.tween({
    dur, ease,
    onUpdate: u => {
      pod.group.position.copy(curve.getPoint(u));
      pod.group.rotation.y = u * Math.PI * .5;
    },
  });
  await ctx.tween({
    dur: .26, ease: 'out',
    onUpdate: u => {
      const s = 1 + Math.sin(u * Math.PI) * .18;
      pod.group.scale.set(s, 1 / s, s);
    },
  });
  pod.group.scale.set(1, 1, 1);
}

async function popIn(ctx, obj, dur = .5) {
  obj.visible = true;
  await ctx.tween({ dur, ease: 'back', onUpdate: u => obj.scale.setScalar(Math.max(.001, u)) });
  obj.scale.setScalar(1);
}

async function dissolve(ctx, pod, dur = .55) {
  const mesh = pod.group.userData.mesh, edges = pod.group.userData.edges;
  mesh.material.transparent = true;
  edges.material.transparent = true;
  await ctx.tween({
    dur, ease: 'in',
    onUpdate: u => {
      pod.group.scale.setScalar(1 - u);
      pod.group.position.y += .012;
      mesh.material.opacity = 1 - u;
      edges.material.opacity = (1 - u) * .5;
    },
  });
}

/** Birth of a pod: it appears above the scheduler, then flies to its slot. */
async function schedulePod(ctx, version = 'v1', { avoid = -1, from = null, keepLabel = false } = {}) {
  const w = ctx.world;
  const spot = pickSlot(w, avoid);
  if (!spot) return null;

  const pod = makePod(w, version);
  const start = from || w.cp.group.position.clone().add(v3(2.8, 2.2, 0));
  pod.group.position.copy(start);
  pod.group.scale.setScalar(.001);
  podLabel(ctx.world, pod, 'pending', 'is-quiet');

  await ctx.tween({ dur: .35, ease: 'back', onUpdate: u => pod.group.scale.setScalar(Math.max(.001, u)) });
  pod.group.scale.set(1, 1, 1);

  place(w, pod, spot.node, spot.slot);
  const dest = spot.slot.world.clone();
  pod.group.position.copy(start);
  await flyTo(ctx, pod, dest, { dur: .95 });
  // labels mark movement, not furniture — a settled pod goes quiet
  if (keepLabel) podLabel(ctx.world, pod, `pod · ${version}`, version === 'v2' ? 'is-go' : 'is-kube');
  else pod.tag.visible = false;
  ctx.sync();
  return pod;
}

/** Put N pods straight into slots with no animation (used by `setup`). */
function seedPods(world, n, version = 'v1') {
  clearPods(world);
  for (let i = 0; i < n; i++) {
    const spot = pickSlot(world);
    if (!spot) break;
    const pod = makePod(world, version);
    place(world, pod, spot.node, spot.slot);
  }
  drawSelectors(world);
}

/** Reset every dial the chapters touch, so each `setup` starts from zero. */
function base(world, o = {}) {
  resetTags(world);
  world.nodes.forEach((n, i) => setNodeHealth(world, i, true));
  setLinks(world, o.links ?? .55);
  world.cp.group.visible = o.cp ?? true;
  world.cp.group.scale.setScalar(1);
  world.svc.group.visible = o.svc ?? false;
  world.svc.group.scale.setScalar(1);
  world.client.group.visible = o.client ?? false;
  world.manifest.group.visible = false;
  world.manifest.group.scale.setScalar(1);
  world.manifest.draw(o.replicas ?? 3, o.version ?? 'v1', null);
  world.traffic.on = o.traffic ?? false;
  world.selectors.visible = o.selectors ?? false;
  if (o.pods !== undefined) seedPods(world, o.pods, o.version ?? 'v1');
  drawSelectors(world);
}

/* ── set pieces reused by buttons and by autoplay ────────────────────── */

async function killAndHeal(ctx, preferred = -1) {
  const w = ctx.world;
  // kill the preferred node if it is actually carrying pods, else the busiest —
  // otherwise a repeat run picks the node it just emptied and nothing happens
  const counts = w.nodes.map(n => w.pods.filter(p => p.node === n).length);
  const nodeIdx = preferred >= 0 && counts[preferred] > 0
    ? preferred
    : counts.indexOf(Math.max(...counts));
  const doomed = w.pods.filter(p => p.node?.i === nodeIdx);
  if (!doomed.length) return;

  ctx.led(null, null, 'node lost');
  setNodeHealth(w, nodeIdx, false);
  setTagText(w, `node${nodeIdx}`, `node ${nodeIdx + 1} · not reporting`, 'is-dead');

  await ctx.tween({
    dur: .5, ease: 'out',
    onUpdate: u => { w.nodes[nodeIdx].group.position.y = -u * .35; },
  });
  await ctx.wait(.5);

  await Promise.all(doomed.map(p => dissolve(ctx, p, .6)));
  doomed.forEach(p => destroyPod(w, p));
  ctx.sync();
  await ctx.wait(.9);

  ctx.led(null, null, 'reconciling');
  for (const _ of doomed) {
    await schedulePod(ctx, ctx.version, { avoid: nodeIdx });
    await ctx.wait(.15);
  }
  await ctx.wait(1.4);

  // bring the node back, so the chapter can run again
  setNodeHealth(w, nodeIdx, true);
  setTagText(w, `node${nodeIdx}`, `node ${nodeIdx + 1}`, 'is-quiet');
  setLinks(w, .55);
  await ctx.tween({ dur: .6, ease: 'out', onUpdate: u => { w.nodes[nodeIdx].group.position.y = -.35 + u * .35; } });
  w.nodes[nodeIdx].group.position.y = 0;
  ctx.led(ctx.desired, runningPods(w).length, 'in sync');
}

async function scaleTo(ctx, target) {
  const w = ctx.world;
  ctx.desired = target;
  w.manifest.draw(target, ctx.version, 'hi');
  ctx.led(target, runningPods(w).length, 'reconciling');
  await ctx.wait(.5);

  while (runningPods(w).length < target) {
    await schedulePod(ctx, ctx.version);
    await ctx.wait(.12);
  }
  while (runningPods(w).length > target) {
    const pod = runningPods(w).at(-1);
    await dissolve(ctx, pod, .45);
    destroyPod(w, pod);
    ctx.sync();
    await ctx.wait(.12);
  }
  ctx.led(target, target, 'in sync');
}

async function rollOut(ctx) {
  const w = ctx.world;
  const to = ctx.version === 'v1' ? 'v2' : 'v1';
  w.manifest.draw(ctx.desired, to, 'v1');
  ctx.led(null, null, `rolling → ${to}`);
  await ctx.wait(.7);

  const old = runningPods(w).filter(p => p.version !== to);
  for (const oldPod of old) {
    const fresh = await schedulePod(ctx, to);
    if (!fresh) break;

    // readiness probe: the new pod has to pass before the old one goes
    podLabel(ctx.world, fresh, 'starting…', 'is-quiet');
    await ctx.wait(.55);
    podLabel(ctx.world, fresh, 'ready ✓', 'is-go');
    await ctx.wait(.35);

    await dissolve(ctx, oldPod, .45);
    destroyPod(w, oldPod);
    ctx.sync();
    fresh.tag.visible = false;
    await ctx.wait(.3);
  }
  ctx.version = to;
  ctx.led(ctx.desired, runningPods(w).length, 'in sync');
}

/* ── the chapters ────────────────────────────────────────────────────── */

export const chapters = [

{
  port: 'by hand',
  kicker: 'before kubernetes',
  title: 'Four machines and a promise',
  body: 'You have servers, and an app that is supposed to stay up. Placed by hand, every failure is <b>yours to notice</b>: a machine dies at 3am, traffic doubles, a release goes out half-broken. Nothing in this picture is watching.',
  legend: [[C.paper, 'machine'], [C.v1, 'your app']],
  setup(ctx) {
    base(ctx.world, { cp: false, links: 0, pods: 0 });
    ctx.led(0, 0, 'nobody watching');
    showTags(ctx.world, ['node0', 'node1', 'node2', 'node3', 'workers']);
    setTagText(ctx.world, 'workers', 'four machines · nothing coordinating them', 'is-big');
    ctx.cam(CAM.nodes, 0);
  },
  async play(ctx) {
    const w = ctx.world;
    await ctx.wait(.8);

    const pod = makePod(w, 'v1');
    const spot = pickSlot(w);
    place(w, pod, spot.node, spot.slot);
    pod.group.position.copy(spot.slot.world).add(v3(0, 9, 6));
    podLabel(ctx.world, pod, 'you, deploying by hand', 'is-quiet');
    await flyTo(ctx, pod, spot.slot.world.clone(), { dur: 1.3, lift: 2 });
    await ctx.wait(1.4);

    setNodeHealth(w, spot.node.i, false);
    setTagText(w, `node${spot.node.i}`, 'machine down', 'is-dead');
    podLabel(ctx.world, pod, 'gone', 'is-dead');
    await ctx.wait(.7);
    await dissolve(ctx, pod, .7);
    destroyPod(w, pod);
    ctx.led(0, 0, 'still nobody watching');
    setTagText(ctx.world, 'workers', 'and it stays down until you look', 'is-big');
    await ctx.wait(2.6);
    ctx.done();
  },
},

{
  port: 'cluster',
  kicker: 'the shape of it',
  title: 'One pool. One thing to talk to.',
  body: 'Kubernetes puts a <b>control plane</b> above the machines and turns them into a single pool. You stop addressing servers and start addressing the cluster. On every machine a small agent, the <b>kubelet</b>, does what the control plane asks and reports back what is actually running.',
  list: [
    ['control plane', 'decides what should run, and where'],
    ['worker node', 'a machine that runs the work'],
    ['kubelet', 'the agent on each node — the only thing that touches containers'],
  ],
  legend: [[C.kube, 'control plane'], [C.paper, 'worker node']],
  setup(ctx) {
    base(ctx.world, { pods: 0, links: 0 });
    ctx.led(0, 0, 'cluster up');
    ctx.world.cp.group.scale.setScalar(.001);
    showTags(ctx.world, ['workers']);
    setTagText(ctx.world, 'workers', 'worker nodes — where your code runs', 'is-big');
    ctx.cam(CAM.nodes, 0);
  },
  async play(ctx) {
    await ctx.wait(.6);
    ctx.cam(CAM.wide, 2.4);
    await popIn(ctx, ctx.world.cp.group, .9);
    showTags(ctx.world, ['workers', 'cp']);
    await ctx.wait(.6);

    await ctx.tween({ dur: 1.1, ease: 'out', onUpdate: u => setLinks(ctx.world, u * .55) });
    showTags(ctx.world, ['workers', 'cp', 'kubelet0', 'kubelet1', 'kubelet2', 'kubelet3']);
    await ctx.wait(3.2);
    ctx.done();
  },
},

{
  port: 'control plane',
  kicker: 'inside the brain',
  title: 'Four parts, one job',
  body: 'Every part of the control plane exists to keep <b>reality matching the plan</b>. Nothing else in the cluster talks to anything directly — it all goes through the API server.',
  list: [
    ['api server', 'the only door in. Every request, human or machine, arrives here'],
    ['etcd', 'the ledger. What you asked for, and what the cluster last saw'],
    ['scheduler', 'picks which node an unplaced pod should run on'],
    ['controllers', 'watch the ledger and act when plan and reality disagree'],
  ],
  legend: [[C.kube, 'control plane part'], [C.signal, 'the loop']],
  setup(ctx) {
    base(ctx.world, { pods: 0 });
    ctx.led(0, 0, 'idle');
    showTags(ctx.world, ['cp']);
    ctx.cam(CAM.plane, 0);
  },
  async play(ctx) {
    const w = ctx.world;
    const beats = [
      ['api', 1.9], ['etcd', 1.9], ['sched', 1.9], ['ctrl', 2.4],
    ];
    for (const [name, hold] of beats) {
      showTags(w, [name]);
      const part = w.cp[name === 'ctrl' ? 'ctrl' : name];
      await ctx.tween({
        dur: .4, ease: 'out',
        onUpdate: u => part.position.y = (name === 'api' ? 1.55 : name === 'etcd' ? 1.4 : name === 'sched' ? 1.1 : 1.7) + u * .45,
      });
      await ctx.wait(hold);
      await ctx.tween({
        dur: .4, ease: 'io',
        onUpdate: u => part.position.y = (name === 'api' ? 1.55 : name === 'etcd' ? 1.4 : name === 'sched' ? 1.1 : 1.7) + (1 - u) * .45,
      });
    }
    showTags(w, ['api', 'etcd', 'sched', 'ctrl']);
    await ctx.wait(2.4);
    ctx.done();
  },
},

{
  port: 'pod',
  kicker: 'the unit',
  title: 'Kubernetes runs Pods, not containers',
  body: 'A <b>Pod</b> is one or more containers that share an IP address, storage and a lifetime — they are always placed, started and killed together. Nearly always it is one container plus the pod wrapper. The important part: pods are <b>disposable</b>. Nothing repairs a pod. It is replaced.',
  list: [
    ['shares', 'one IP, one set of volumes, one fate'],
    ['lives', 'minutes to months — and never moves node once placed'],
    ['dies', 'replaced by a new pod with a new IP, never patched in place'],
  ],
  legend: [[C.v1, 'pod'], [C.paper, 'node slot']],
  setup(ctx) {
    base(ctx.world, { pods: 0, links: 0 });
    ctx.led(0, 0, 'idle');
    const w = ctx.world;
    const pod = makePod(w, 'v1');
    const spot = w.nodes[0].slots[0];
    place(w, pod, w.nodes[0], spot);
    podLabel(ctx.world, pod, 'pod  ·  10.42.1.7', 'is-kube');
    showTags(w, ['node0']);
    ctx.cam(CAM.pod, 0);
  },
  async play(ctx) {
    const w = ctx.world;
    const pod = w.pods[0];
    await ctx.wait(1.2);

    // lift the lid: show the containers sharing the pod
    const inner = new THREE.Group();
    pod.group.add(inner);
    const mk = (x, color) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(.42, .58, .42),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .16, roughness: .45 }),
      );
      m.position.set(x, 0, 0);
      inner.add(m);
      return m;
    };
    mk(-.3, 0xE8DCC8);
    mk(.3, 0xFF9C7A);
    inner.scale.setScalar(.001);

    // flipping `transparent` needs a shader recompile, so do it before the tween
    const shell = pod.group.userData.mesh.material;
    shell.transparent = true;
    shell.depthWrite = false;
    shell.needsUpdate = true;

    await ctx.tween({
      dur: .8, ease: 'back',
      onUpdate: u => {
        inner.scale.setScalar(Math.max(.001, u));
        shell.opacity = 1 - u * .72;
      },
    });
    podLabel(ctx.world, pod, 'one pod · two containers · one ip', 'is-kube');
    await ctx.tween({ dur: 3.6, ease: 'linear', onUpdate: u => { inner.rotation.y = u * Math.PI * 2; } });

    await ctx.tween({
      dur: .6, ease: 'io',
      onUpdate: u => {
        inner.scale.setScalar(Math.max(.001, 1 - u));
        shell.opacity = .28 + u * .72;
      },
    });
    pod.group.remove(inner);
    shell.opacity = 1;
    shell.transparent = false;
    shell.depthWrite = true;
    shell.needsUpdate = true;
    await ctx.wait(1.6);
    ctx.done();
  },
},

{
  port: 'manifest',
  kicker: 'the whole trick',
  title: 'You write down what you want',
  body: 'You never tell Kubernetes to start a container on a machine. You hand the API server a file that says <b>what should be true</b> — three copies of web:v1 — and it is written into etcd. That number is the <b>desired state</b>. It stays true until you change it.',
  list: [
    ['you say', 'replicas: 3'],
    ['you never say', 'which node, in what order, or what to do when one dies'],
  ],
  legend: [[C.signal, 'desired state'], [C.kube, 'api server → etcd']],
  setup(ctx) {
    base(ctx.world, { pods: 0 });
    ctx.desired = 3;
    ctx.led(0, 0, 'no plan yet');
    showTags(ctx.world, ['api']);
    ctx.cam({ pos: [0, 14.2, 7], target: [0, 11.6, -17] }, 0);
  },
  async play(ctx) {
    const w = ctx.world, man = w.manifest;
    man.draw(3, 'v1', null);
    man.group.position.set(-2.2, 12.5, -6.5);
    man.group.rotation.set(-.07, -.12, .02);
    await popIn(ctx, man.group, .7);
    await ctx.wait(2.4);

    man.draw(3, 'v1', 'hi');
    await ctx.wait(1.6);

    // the sheet is posted through the API server, and lands in etcd
    const api = w.cp.api.getWorldPosition(v3(0, 0, 0));
    await ctx.tween({
      dur: 1.3, ease: 'io',
      onUpdate: u => {
        man.group.position.lerpVectors(v3(-2.2, 12.5, -6.5), api.clone().add(v3(0, 1.4, 2.4)), u);
        man.group.scale.setScalar(1 - u * .55);
        man.group.rotation.y = -.12 + u * .12;
      },
    });
    ctx.led(3, 0, 'gap: 3');
    await ctx.tween({
      dur: .8, ease: 'in',
      onUpdate: u => {
        man.group.position.lerpVectors(api.clone().add(v3(0, 1.4, 2.4)), w.cp.etcd.getWorldPosition(v3(0, 0, 0)), u);
        man.group.scale.setScalar(.45 * (1 - u));
      },
    });
    man.group.visible = false;
    showTags(w, ['etcd']);
    setTagText(w, 'etcd', 'etcd · desired: 3 replicas of web:v1', 'is-signal');
    await ctx.wait(3);
    ctx.done();
  },
},

{
  port: 'scheduler',
  kicker: 'placement',
  title: 'The scheduler picks a node, once',
  body: 'Three pods now exist on paper and nowhere in reality. The scheduler <b>filters</b> out nodes that cannot take them — not enough CPU or memory, wrong labels, node marked off-limits — then <b>scores</b> the survivors and takes the best. It happens once, at birth. A running pod never moves.',
  list: [
    ['filter', 'can this node fit the pod at all?'],
    ['score', 'of the ones that can, which is the best home right now?'],
    ['bind', 'write the choice down — the node’s kubelet then starts it'],
  ],
  legend: [[C.dim, 'pending'], [C.v1, 'running'], [C.kube, 'scheduler']],
  setup(ctx) {
    base(ctx.world, { pods: 0 });
    ctx.desired = 3;
    ctx.led(3, 0, 'gap: 3');
    showTags(ctx.world, ['sched', 'node0', 'node1', 'node2', 'node3']);
    ctx.cam(CAM.wide, 0);
  },
  async play(ctx) {
    await ctx.wait(1);
    ctx.led(3, 0, 'scheduling');
    for (let i = 0; i < 3; i++) {
      await schedulePod(ctx, 'v1', { keepLabel: true });
      await ctx.wait(.35);
    }
    ctx.led(3, 3, 'in sync');
    await ctx.wait(3.4);
    ctx.done();
  },
},

{
  port: 'the loop',
  kicker: 'the one idea',
  title: 'Compare. Act. Repeat. Forever.',
  body: 'Every controller runs the same loop: read the desired state, look at the actual state, and do the <b>smallest thing that closes the gap</b>. It never finishes and it never assumes it worked — it just runs again. Everything else in Kubernetes is this loop wearing a different hat.',
  list: [
    ['observe', 'what is actually running right now?'],
    ['diff', 'how is that different from what was asked for?'],
    ['act', 'make one change toward the desired state'],
    ['repeat', 'immediately, forever, whether or not anything changed'],
  ],
  legend: [[C.signal, 'the gap'], [C.go, 'in sync']],
  setup(ctx) {
    base(ctx.world, { pods: 3 });
    ctx.desired = 3;
    ctx.led(3, 3, 'in sync');
    showTags(ctx.world, ['ctrl', 'etcd']);
    setTagText(ctx.world, 'etcd', 'etcd · desired: 3', 'is-signal');
    ctx.cam(CAM.loop, 0);
  },
  async play(ctx) {
    const steps = ['observe · 3 running', 'diff · 0 missing', 'act · nothing to do'];
    await ctx.loop(async () => {
      for (const s of steps) {
        setTagText(ctx.world, 'ctrl', s, 'is-signal');
        await ctx.wait(1.15);
      }
    });
  },
},

{
  port: 'self-healing',
  kicker: 'why nobody gets paged',
  title: 'A node dies. The loop notices.',
  body: 'The node stops reporting, so the control plane marks its pods gone and actual drops below desired. Nothing dramatic happens next — the <b>same loop</b> sees the gap and schedules replacements on the healthy nodes. There is no separate recovery system. Failure is just another gap.',
  list: [
    ['detect', 'kubelet stops reporting → node marked NotReady'],
    ['evict', 'its pods are marked gone; actual state drops'],
    ['replace', 'the loop closes the gap the way it always does'],
  ],
  legend: [[C.signal, 'lost'], [C.v1, 'running'], [C.go, 'healthy node']],
  actions: [{ label: 'Kill a node', run: ctx => killAndHeal(ctx, 1) }],
  setup(ctx) {
    base(ctx.world, { pods: 6 });
    ctx.desired = 6;
    ctx.led(6, 6, 'in sync');
    showTags(ctx.world, ['node0', 'node1', 'node2', 'node3']);
    ctx.cam(CAM.wide, 0);
  },
  async play(ctx) {
    await ctx.wait(1.2);
    await ctx.loop(async () => {
      await killAndHeal(ctx, 1);
      await ctx.wait(2.2);
    });
  },
},

{
  port: 'service',
  kicker: 'networking',
  title: 'The address that outlives the pods',
  body: 'Pods are replaced constantly and every replacement gets a new IP, so nothing can point at a pod. A <b>Service</b> is a fixed name and address in front of them. It keeps a live list of every pod whose labels match — <span style="white-space:nowrap">app=web</span> — and spreads requests across whatever is currently alive.',
  list: [
    ['stable', 'one name, one address, for the life of the app'],
    ['selector', 'membership is by label, not by a list of pods you maintain'],
    ['automatic', 'a pod that dies leaves the pool; a new one joins it'],
  ],
  legend: [[C.signal, 'service + traffic'], [C.v1, 'pod behind it']],
  setup(ctx) {
    base(ctx.world, { pods: 3, svc: true, client: true, selectors: true });
    ctx.desired = 3;
    ctx.led(3, 3, 'in sync');
    showTags(ctx.world, ['svc', 'client']);
    ctx.cam(CAM.front, 0);
  },
  async play(ctx) {
    const w = ctx.world;
    w.svc.group.scale.setScalar(.001);
    w.selectors.visible = false;
    await ctx.wait(.5);
    await popIn(ctx, w.svc.group, .7);
    await ctx.wait(.6);

    w.selectors.visible = true;
    drawSelectors(w);
    await ctx.wait(1.3);

    w.traffic.on = true;
    await ctx.wait(4);

    // a pod drops out mid-traffic; the Service simply stops sending to it
    await ctx.loop(async () => {
      const victim = runningPods(w).at(-1);
      if (victim) {
        podLabel(ctx.world, victim, 'terminating', 'is-dead');
        await ctx.wait(.7);
        await dissolve(ctx, victim, .5);
        destroyPod(w, victim);
        ctx.sync();
        ctx.led(3, runningPods(w).length, 'gap: 1');
        await ctx.wait(1.4);
        await schedulePod(ctx, 'v1');
        ctx.led(3, runningPods(w).length, 'in sync');
      }
      await ctx.wait(2.6);
    });
  },
},

{
  port: 'scaling',
  kicker: 'growth',
  title: 'Scaling is editing one number',
  body: 'Change replicas from 3 to 8. That is the entire operation. The gap opens, the scheduler fills it across whichever nodes have room, and the Service picks up the new pods the moment they are ready — you never register them anywhere. Scaling down runs the same loop backwards.',
  list: [
    ['you change', 'replicas: 3 → 8'],
    ['the loop does', 'schedule 5 more, wherever they fit'],
    ['autoscaling', 'a controller can change that number for you, from CPU or traffic'],
  ],
  legend: [[C.signal, 'desired'], [C.v1, 'running pod']],
  actions: [
    { label: 'Scale to 8', run: ctx => scaleTo(ctx, 8) },
    { label: 'Scale to 2', run: ctx => scaleTo(ctx, 2) },
  ],
  setup(ctx) {
    base(ctx.world, { pods: 3, svc: true, client: true, selectors: true, traffic: true });
    ctx.desired = 3;
    ctx.led(3, 3, 'in sync');
    showTags(ctx.world, ['svc']);
    ctx.cam({ pos: [-2, 21, 40], target: [0, 3, 2] }, 0);
  },
  async play(ctx) {
    await ctx.wait(1.4);
    await ctx.loop(async () => {
      await scaleTo(ctx, 8);
      await ctx.wait(3);
      await scaleTo(ctx, 3);
      await ctx.wait(2.6);
    });
  },
},

{
  port: 'rollout',
  kicker: 'shipping',
  title: 'Ship v2 without going dark',
  body: 'Change the image in the manifest and the desired state changes shape rather than size. The controller brings up v2 pods <b>a few at a time</b> and only removes a v1 pod once its replacement passes its health check. If v2 never becomes ready, the rollout stops on its own — and rolling back is just the previous desired state again.',
  list: [
    ['surge', 'new pods start before old ones stop, so capacity never dips'],
    ['readiness', 'a pod joins the Service only once it says it is ready'],
    ['rollback', 'the old manifest is still in etcd — re-apply and the loop reverses'],
  ],
  legend: [[C.v1, 'v1'], [C.v2, 'v2'], [C.go, 'ready ✓']],
  actions: [{ label: 'Deploy the other version', run: ctx => rollOut(ctx) }],
  setup(ctx) {
    base(ctx.world, { pods: 4, svc: true, client: true, selectors: true, traffic: true });
    ctx.desired = 4;
    ctx.version = 'v1';
    ctx.led(4, 4, 'in sync');
    showTags(ctx.world, ['svc']);
    ctx.cam({ pos: [-1, 12, 38], target: [0, 3.2, 5] }, 0);
  },
  async play(ctx) {
    await ctx.wait(1.4);
    await ctx.loop(async () => {
      await rollOut(ctx);
      await ctx.wait(3.4);
    });
  },
},

{
  port: 'the whole map',
  kicker: 'recap',
  title: 'You write down what you want. A loop makes it true.',
  body: 'That is Kubernetes. Everything else — deployments, services, autoscalers, jobs, ingress — is another controller running the same loop over a different kind of written-down wish. Want the internals? <a href="deep.html" style="font-weight:600">Read The Control Plane, Deeply →</a>',
  list: [
    ['1 · you', 'send a manifest to the api server'],
    ['2 · etcd', 'stores it as the desired state'],
    ['3 · controllers', 'compare desired against actual, forever'],
    ['4 · scheduler', 'picks a node for each pod that has none'],
    ['5 · kubelet', 'starts the containers and reports back'],
    ['6 · service', 'keeps one address in front of whatever is alive'],
  ],
  legend: [[C.kube, 'control plane'], [C.v1, 'pods'], [C.signal, 'traffic']],
  setup(ctx) {
    base(ctx.world, { pods: 6, svc: true, client: true, selectors: true, traffic: true });
    ctx.desired = 6;
    ctx.led(6, 6, 'in sync');
    showTags(ctx.world, ['cp', 'svc', 'node0', 'node1', 'node2', 'node3']);
    ctx.cam(CAM.map, 0);
  },
  async play(ctx) {
    await ctx.wait(2.5);
    await ctx.loop(async () => {
      showTags(ctx.world, ['api', 'etcd', 'sched', 'ctrl', 'svc']);
      await ctx.wait(3.4);
      showTags(ctx.world, ['cp', 'svc', 'node0', 'node1', 'node2', 'node3']);
      await ctx.wait(2.6);
      await killAndHeal(ctx, 1);
      await ctx.wait(2);
    });
  },
},
];
