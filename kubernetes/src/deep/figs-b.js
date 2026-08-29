// Figures 05-08: list+watch/informers, the reconcile loop, controller
// composition + garbage collection, and the scheduler.

import { P, el } from './fig.js';

/* ── 05 · watch, don't poll ──────────────────────────────────────────── */

export async function figWatch(ctx) {
  const H = 430;

  const api = ctx.box(40, 150, 150, 70, 'api server', { stroke: P.kube });
  const refl = ctx.box(270, 84, 170, 46, 'reflector', { sub: 'list + watch' });
  const fifo = ctx.box(270, 180, 170, 46, 'deltafifo', { sub: 'ordered deltas' });
  const cache = ctx.box(520, 50, 340, 168, null);
  ctx.label(170, 22, 'local cache (indexer)', { size: 10.5, fill: P.kubeSoft, parent: cache });
  const queue = ctx.box(520, 262, 340, 54, null);
  ctx.label(170, 20, 'workqueue', { size: 10.5, fill: P.kubeSoft, parent: queue });
  const recon = ctx.box(520, 350, 340, 44, 'reconcile(key)', { labelFill: P.signalSoft });

  const wire = [
    ctx.line(190, 165, 270, 115), ctx.line(355, 130, 355, 180),
    ctx.line(440, 203, 520, 160), ctx.line(690, 218, 690, 262), ctx.line(690, 316, 690, 350),
  ];
  for (const n of [api, refl, fifo, cache, queue, recon, ...wire]) await ctx.fadeIn(n, .14);

  const rows = new Map();
  const row = async (name, rv) => {
    const g = ctx.g(545, 40 + rows.size * 34, cache);
    el('rect', { width: 0, height: 0 }, g); // anchor
    ctx.label(0, 0, `${name}`, { size: 10.5, fill: P.paper, up: false, anchor: 'start', parent: g });
    const rvT = ctx.label(200, 0, `rv:${rv}`, { size: 10, fill: P.dim, up: false, anchor: 'start', parent: g });
    g.setAttribute('transform', `translate(25,${42 + rows.size * 34})`);
    cache.appendChild(g);
    rows.set(name, { g, rvT });
    await ctx.fadeIn(g, .25);
  };

  const qslots = [];
  const enqueue = async (key, dim = false) => {
    if (qslots.includes(key)) {                       // dedupe: already queued
      await ctx.note(H, `"${key}" is already queued — collapsed, not duplicated`);
      return;
    }
    qslots.push(key);
    const c = ctx.chip(560 + (qslots.length - 1) * 105, 296, key, { fill: dim ? P.ink3 : P.signal, color: dim ? P.dim : P.ink, size: 9.5 });
    await ctx.pop(c, .3);
  };

  // LIST: a consistent snapshot
  await ctx.note(H, 'LIST — a full snapshot, stamped rv:41');
  for (const [n, rv] of [['web-a', 39], ['web-b', 40], ['web-c', 41]]) {
    await ctx.zip(190, 170, 300, 100, { dur: .3 });
    await row(n, rv);
  }
  await ctx.wait(.6);

  // WATCH: ordered deltas ride the same wire
  await ctx.note(H, 'WATCH from rv:41 — every change since, in order, no gaps');
  const ev = async (kind, name, rv, fill) => {
    const c = ctx.chip(115, 130, `${kind} ${name}`, { fill, size: 9.5 });
    await ctx.pop(c, .25);
    await ctx.move(c, 355, 107, { dur: .4 });
    await ctx.move(c, 355, 203, { dur: .3 });
    await ctx.move(c, 640, 130, { dur: .4 });
    c.remove();
  };

  await ev('ADD', 'web-d', 42, P.go);
  await row('web-d', 42);
  await enqueue('web-d');

  await ev('MOD', 'web-a', 43, P.kube);
  const ra = rows.get('web-a');
  ra.rvT.textContent = 'rv:43';
  await ctx.pulse(ra.g, { color: P.kube });
  await enqueue('web-a');

  await ev('DEL', 'web-b', 44, P.red);
  await ctx.fadeOut(rows.get('web-b').g, .35);
  await enqueue('web-b');
  await ctx.wait(.5);

  // the stream drops; resume from the last version seen
  const snap = ctx.cross(230, 140, { r: 9 });
  await ctx.note(H, 'watch dropped — networks do that', { color: P.red });
  await ctx.wait(.9);
  snap.remove();
  await ctx.zip(300, 100, 190, 170, { color: P.signalSoft, dur: .5 });
  await ctx.note(H, 'resume: WATCH from rv:44 — no re-list, nothing was missed', { color: P.goSoft });
  await ctx.wait(.9);

  // resync: level-triggered insurance
  await ctx.note(H, 'resync timer: re-queue everything from the LOCAL cache — trust, but re-verify');
  for (const name of ['web-a', 'web-c', 'web-d']) {
    const r = rows.get(name);
    if (r) await ctx.pulse(r.g, { color: P.signal, dur: .25 });
  }
  qslots.length = 0;
  for (const k of ['web-a', 'web-c', 'web-d']) await enqueue(k, true);
}

/* ── 06 · the reconcile loop ─────────────────────────────────────────── */

export async function figReconcile(ctx) {
  const H = 420, C = { x: 610, y: 190 }, R = 100;

  const queue = ctx.box(50, 60, 320, 56, null);
  ctx.label(160, 22, 'workqueue', { size: 10.5, fill: P.kubeSoft, parent: queue });
  await ctx.fadeIn(queue, .25);

  // the loop, drawn as a literal circle with four stations
  el('circle', { cx: C.x, cy: C.y, r: R, fill: 'none', stroke: P.faint, 'stroke-width': 1.5 }, ctx.svg);
  const stations = [
    { a: -Math.PI / 2, name: 'read desired', sub: 'from cache' },
    { a: 0, name: 'observe actual', sub: 'from the world' },
    { a: Math.PI / 2, name: 'diff', sub: 'minimal action' },
    { a: Math.PI, name: 'act', sub: 'one change' },
  ];
  for (const s of stations) {
    const x = C.x + Math.cos(s.a) * R, y = C.y + Math.sin(s.a) * R;
    el('circle', { cx: x, cy: y, r: 5, fill: P.ink3, stroke: P.stroke }, ctx.svg);
    const ly = y + (Math.sin(s.a) > .5 ? 26 : Math.sin(s.a) < -.5 ? -20 : 5);
    const lx = x + (Math.cos(s.a) > .5 ? 20 : Math.cos(s.a) < -.5 ? -20 : 0);
    const anchor = Math.cos(s.a) > .5 ? 'start' : Math.cos(s.a) < -.5 ? 'end' : 'middle';
    ctx.label(lx, ly, s.name, { size: 10.5, fill: P.paper, anchor });
    ctx.label(lx, ly + 13, s.sub, { size: 8.5, fill: P.dim, anchor });
  }

  // three events, one key
  await ctx.note(H, 'three events arrive for the same object…');
  const chips = [];
  for (let i = 0; i < 3; i++) {
    const c = ctx.chip(90, 20, 'web', { fill: P.signal });
    await ctx.pop(c, .2);
    await ctx.move(c, 100 + i * 70, 88, { dur: .35 });
    chips.push(c);
  }
  await ctx.wait(.4);
  await Promise.all([ctx.move(chips[1], 100, 88, { dur: .35 }), ctx.move(chips[2], 100, 88, { dur: .35 })]);
  chips[1].remove(); chips[2].remove();
  await ctx.note(H, '…one key in the queue. a key is a name, not an event — no diff attached');

  const orbit = async (key, failAct) => {
    await ctx.move(key, C.x, C.y - R, { dur: .6, lift: 40 });
    const seg = async (from, to, out) => {
      await ctx.tween({ dur: .55, ease: 'io', onUpdate: u => {
        const a = from + (to - from) * u;
        ctx.place(key, C.x + Math.cos(a) * R, C.y + Math.sin(a) * R);
      } });
      if (out) { const o = ctx.chip(C.x, C.y, out.t, { fill: out.f ?? P.ink3, color: out.c ?? P.paper, size: 10 }); await ctx.pop(o, .3); await ctx.wait(.45); await ctx.fadeOut(o, .25); }
    };
    await seg(-Math.PI / 2, 0, { t: 'desired: 3' });
    await seg(0, Math.PI / 2, { t: 'actual: 2' });
    await seg(Math.PI / 2, Math.PI, { t: 'diff: +1 pod', f: P.signal, c: P.ink });
    if (failAct) {
      ctx.cross(C.x - R - 24, C.y, { r: 7 });
      await ctx.note(H, 'the create fails — api hiccup. no state to roll back: none was kept', { color: P.red });
      return false;
    }
    const done = ctx.chip(C.x - R - 60, C.y, 'create pod ✓', { fill: P.go, size: 10 });
    await ctx.pop(done, .3);
    await ctx.wait(.5);
    await ctx.fadeOut(done, .3);
    return true;
  };

  // run 1: fails at act; requeued with backoff
  let key = chips[0];
  await orbit(key, true);
  await ctx.move(key, 100, 88, { dur: .5, lift: 30 });
  const badge = ctx.chip(196, 88, 'retry in 1s', { fill: P.ink3, color: P.signalSoft, size: 9.5 });
  await ctx.pop(badge, .3);
  await ctx.tween({ dur: 1, ease: 'linear', onUpdate: u => badge.setAttribute('opacity', 1 - u * .5) });
  badge.remove();
  await ctx.note(H, 'requeued with backoff: 1s, 2s, 4s… failure is scheduled, not fatal');

  // run 2: same loop, fresh look, success
  const ok = await orbit(key, false);
  if (ok) {
    await ctx.fadeOut(key, .3);
    await ctx.note(H, 'no memory between runs — every pass re-reads the world from zero', { color: P.goSoft });
  }
}

/* ── 07 · controllers compose ────────────────────────────────────────── */

export async function figControllers(ctx) {
  const H = 440;

  const dep = ctx.box(350, 36, 200, 50, 'deployment · web', { stroke: P.kube });
  const rs1 = ctx.box(120, 150, 220, 46, 'replicaset · web-6b7', { sub: 'image v1' });
  const own1 = ctx.line(230, 150, 400, 86, { dash: '4 4' });

  const podsY = 250;
  const pods1 = [], pods2 = [];
  const mkpod = (x, fill) => {
    const g = ctx.g(x, podsY);
    el('rect', { x: -13, y: -13, width: 26, height: 26, rx: 4, fill }, g);
    return g;
  };

  for (const n of [dep, rs1, own1]) await ctx.fadeIn(n, .25);
  for (let i = 0; i < 3; i++) {
    const p = mkpod(170 + i * 60, P.kube);
    pods1.push(p);
    ctx.line(230, 196, 170 + i * 60, podsY - 16, { dash: '2 4', op: .6 });
    await ctx.fadeIn(p, .18);
  }
  const cnt1 = ctx.label(230, 300, 'replicas: 3', { size: 10, fill: P.kubeSoft, up: false });
  await ctx.note(H, 'deployment manages replicasets. replicaset manages pods. neither knows more.');
  await ctx.wait(.8);

  // new image → new replicaset; rollout is arithmetic between the two
  const evt = ctx.chip(450, 120, 'spec: image v2', { fill: P.paper });
  await ctx.pop(evt);
  await ctx.move(evt, 450, 62, { dur: .4 });
  await ctx.pulse(dep, { color: P.signal });
  evt.remove();

  const rs2 = ctx.box(560, 150, 220, 46, 'replicaset · web-9f2', { sub: 'image v2', stroke: P.go });
  const own2 = ctx.line(670, 150, 500, 86, { dash: '4 4' });
  await Promise.all([ctx.fadeIn(rs2, .3), ctx.fadeIn(own2, .3)]);
  const cnt2 = ctx.label(670, 300, 'replicas: 0', { size: 10, fill: P.goSoft, up: false });

  for (let i = 0; i < 3; i++) {
    const p = mkpod(610 + i * 60, P.go);
    pods2.push(p);
    await ctx.pop(p, .3);
    cnt2.textContent = `replicas: ${i + 1}`;
    await ctx.wait(.25);
    const old = pods1.pop();
    await ctx.fadeOut(old, .3);
    cnt1.textContent = `replicas: ${2 - i}`;
    await ctx.wait(.2);
  }
  await ctx.note(H, 'a rollout is two replicasets and arithmetic — scale one up, the other down', { color: P.goSoft });
  await ctx.wait(1);

  // delete the root; the garbage collector walks the ownerReferences
  ctx.cross(450, 61, { r: 11 });
  dep.setAttribute('opacity', .25);
  await ctx.note(H, 'kubectl delete deployment web', { color: P.red });
  const gc = ctx.chip(450, 350, 'garbage collector', { fill: P.ink3, color: P.signalSoft });
  await ctx.pop(gc);
  await ctx.wait(.4);
  await Promise.all([own1, own2].map(l => ctx.tween({ dur: .4, ease: 'io', onUpdate: u => l.setAttribute('stroke', u < 1 ? P.red : P.faint) })));
  await Promise.all([ctx.fadeOut(rs1, .35), ctx.fadeOut(rs2, .35)]);
  cnt1.remove(); cnt2.remove();
  await Promise.all([...pods1, ...pods2].map(p => ctx.fadeOut(p, .35)));
  await ctx.note(H, 'owners gone → children collected. cascade with zero coordination', { color: P.signalSoft });
}

/* ── 08 · the scheduler ──────────────────────────────────────────────── */

export async function figScheduler(ctx) {
  const H = 400;

  const pod = ctx.chip(150, 52, 'pod web-x9 · cpu: 500m', { fill: P.paper });
  const noNode = ctx.label(150, 80, 'nodeName: —', { size: 10, fill: P.signalSoft, up: false });
  await ctx.pop(pod);
  await ctx.fadeIn(noNode, .3);

  const NODES = [
    { x: 70, name: 'node-1', used: .45, note: null },
    { x: 280, name: 'node-2', used: .3, note: 'taint: gpu-only' },
    { x: 490, name: 'node-3', used: .2, note: null },
    { x: 700, name: 'node-4', used: .93, note: null },
  ];
  const cards = NODES.map(n => {
    const b = ctx.box(n.x, 140, 180, 150, null);
    ctx.label(90, 24, n.name, { size: 11, fill: P.paper, parent: b });
    el('rect', { x: 20, y: 44, width: 140, height: 8, rx: 4, fill: P.ink3 }, b);
    el('rect', { x: 20, y: 44, width: 140 * n.used, height: 8, rx: 4, fill: n.used > .8 ? P.red : P.kube }, b);
    ctx.label(90, 70, `cpu used: ${Math.round(n.used * 100)}%`, { size: 8.5, fill: P.dim, parent: b, up: false });
    if (n.note) ctx.label(90, 92, n.note, { size: 8.5, fill: P.signalSoft, parent: b, up: false });
    return b;
  });
  for (const c of cards) await ctx.fadeIn(c, .15);

  // FILTER: hard constraints, pass or fail
  await ctx.note(H, 'filter: which nodes CAN take this pod at all?');
  await ctx.wait(.5);
  ctx.cross(370, 130, { r: 8 });
  cards[1].setAttribute('opacity', .3);
  await ctx.note(H, 'node-2 out: taint not tolerated', { color: P.red });
  await ctx.wait(.7);
  ctx.cross(790, 130, { r: 8 });
  cards[3].setAttribute('opacity', .3);
  await ctx.note(H, 'node-4 out: 500m does not fit', { color: P.red });
  await ctx.wait(.8);

  // SCORE: soft preferences, ranked
  await ctx.note(H, 'score: of the ones that can — which SHOULD?');
  const score = async (card, x, val) => {
    const bar = el('rect', { x: 20, y: 116, width: 0, height: 8, rx: 4, fill: P.signal }, card);
    const t = ctx.label(90, 140, '', { size: 10, fill: P.signalSoft, parent: card, up: false });
    await ctx.tween({ dur: .7, ease: 'out', onUpdate: u => {
      bar.setAttribute('width', 140 * (val / 100) * u);
      t.textContent = `score: ${Math.round(val * u)}`;
    } });
  };
  await score(cards[0], 70, 62);
  await score(cards[2], 490, 88);
  await ctx.wait(.6);

  // BIND: the decision is a write, not a launch
  await ctx.move(pod, 580, 340, { dur: .9, lift: 90 });
  noNode.remove();
  const stamp = ctx.chip(580, 372, 'nodeName: node-3 · rv:81', { fill: P.go, size: 9.5 });
  await ctx.pop(stamp);
  await ctx.note(H, 'bind = write nodeName to the ledger. the kubelet on node-3 takes it from here', { color: P.goSoft });
}
