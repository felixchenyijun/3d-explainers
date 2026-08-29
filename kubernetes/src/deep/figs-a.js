// Figures 01-04: the shape, etcd/Raft, the API server pipeline, optimistic
// concurrency. Each is an async script over the ctx drawing kit in fig.js.

import { P } from './fig.js';

/* ── 01 · hub and spoke ──────────────────────────────────────────────── */

export async function figShape(ctx) {
  const H = 380, HUB = { x: 450, y: 182 };

  const hub = ctx.box(370, 150, 160, 64, 'api server', { stroke: P.kube });
  const etcd = ctx.cyl(450, 30, 34, 26, 'etcd');
  const trunk = ctx.line(450, 92, 450, 150, { stroke: P.kube, width: 1.5, op: .7 });

  const spokes = [
    { box: ctx.box(40, 157, 110, 50, 'kubectl'), at: [150, 182], to: [370, 182] },
    { box: ctx.box(730, 64, 140, 50, 'scheduler'), at: [730, 89], to: [530, 165] },
    { box: ctx.box(700, 244, 176, 50, 'controllers'), at: [700, 269], to: [530, 200] },
    { box: ctx.box(170, 302, 124, 50, 'kubelet · n1'), at: [294, 327], to: [400, 214] },
    { box: ctx.box(530, 302, 124, 50, 'kubelet · n2'), at: [592, 302], to: [500, 214] },
  ];

  for (const n of [hub, etcd, trunk]) await ctx.fadeIn(n, .3);
  const lines = [];
  for (const s of spokes) {
    const l = ctx.line(s.at[0], s.at[1], s.to[0], s.to[1]);
    lines.push(l);
    await Promise.all([ctx.fadeIn(s.box, .22), ctx.fadeIn(l, .22)]);
  }

  await ctx.note(H, 'every line ends at the api server — there are no others');

  // traffic: every client converses with the hub, never with a sibling
  for (let round = 0; round < 2; round++) {
    await Promise.all(spokes.map(async (s, i) => {
      await ctx.wait(i * .18);
      await ctx.zip(s.at[0], s.at[1], s.to[0], s.to[1]);
      await ctx.zip(450, 92, 450, 60, { color: P.kubeSoft, dur: .3 });
      await ctx.zip(s.to[0], s.to[1], s.at[0], s.at[1], { color: P.signalSoft });
    }));
  }

  // the forbidden path
  const bad = ctx.line(730, 100, 654, 302, { stroke: P.red, dash: '6 5', width: 1.5, op: 0 });
  await ctx.tween({ dur: .4, ease: 'out', onUpdate: u => bad.setAttribute('opacity', u * .9) });
  const x = ctx.cross(692, 201, { r: 8 });
  await ctx.note(H, 'no back channels: the scheduler cannot phone a kubelet', { color: P.red });
  await ctx.wait(1.6);
  await Promise.all([ctx.fadeOut(bad, .4), ctx.fadeOut(x, .4)]);

  // crash-only: kill the controllers, nothing else notices
  const cm = spokes[2];
  const xx = ctx.cross(788, 269, { r: 10 });
  cm.box.setAttribute('opacity', .3);
  await ctx.note(H, 'kill any component — the rest keep talking to the ledger', { color: P.signalSoft });
  await Promise.all(spokes.filter(s => s !== cm).map(async (s, i) => {
    await ctx.wait(i * .15);
    await ctx.zip(s.at[0], s.at[1], s.to[0], s.to[1]);
  }));
  await ctx.wait(.6);
  xx.remove();
  cm.box.setAttribute('opacity', 1);
  await ctx.pulse(cm.box, { color: P.go });
  await ctx.note(H, 'it returns, re-reads the ledger, and resumes — no state was lost', { color: P.goSoft });
}

/* ── 02 · etcd and raft ──────────────────────────────────────────────── */

export async function figEtcd(ctx) {
  const H = 400;
  const NODES = [
    { x: 150, name: 'etcd-1' },
    { x: 390, name: 'etcd-2' },
    { x: 630, name: 'etcd-3' },
  ];
  const boxes = NODES.map(n => ctx.box(n.x, 80, 130, 52, n.name));
  const crown = ctx.chip(215, 62, 'leader', { fill: P.signal });
  const logs = NODES.map(n => ({ x: n.x, blocks: [] }));

  const block = (log, rv, fill) => {
    const i = log.blocks.length;
    const g = ctx.g(log.x + i * 32, 168);
    const r = ctx.svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', 28); r.setAttribute('height', 24); r.setAttribute('rx', 2); r.setAttribute('fill', fill);
    g.appendChild(r);
    ctx.label(14, 16, rv, { size: 9, fill: P.ink, up: false, w: 700, parent: g });
    log.blocks.push({ g, rect: r });
    return g;
  };

  for (const b of boxes) await ctx.fadeIn(b, .2);
  await ctx.fadeIn(crown, .25);
  ctx.label(450, 40, 'the replicated log', { size: 10 });
  for (const log of logs) for (const rv of [40, 41]) block(log, rv, P.ink3);

  // a write arrives at the leader
  const w = ctx.chip(70, 30, 'PUT pods/web', { fill: P.paper });
  await ctx.pop(w);
  await ctx.move(w, 215, 106, { dur: .7, lift: 20 });
  w.remove();

  block(logs[0], 42, P.signal);
  await ctx.note(H, 'the leader appends rv:42 to its log — not yet committed');
  await ctx.wait(.6);

  // replicate to followers, count acks
  await Promise.all([
    ctx.zip(215, 180, 455, 180, { color: P.signalSoft, dur: .5 }),
    ctx.zip(215, 180, 695, 180, { color: P.signalSoft, dur: .7 }),
  ]);
  block(logs[1], 42, P.signal);
  block(logs[2], 42, P.signal);
  await Promise.all([
    ctx.zip(455, 160, 215, 160, { color: P.goSoft, dur: .45 }),
    ctx.zip(695, 160, 215, 160, { color: P.goSoft, dur: .6 }),
  ]);
  for (const log of logs) log.blocks.at(-1).rect.setAttribute('fill', P.go);
  await ctx.note(H, 'a majority has it (2 of 3) — rv:42 is committed, forever', { color: P.goSoft });
  await ctx.wait(1.2);

  // the leader dies; the cluster elects and keeps writing
  ctx.cross(215, 106, { r: 12 });
  boxes[0].setAttribute('opacity', .3);
  logs[0].blocks.forEach(b => b.g.setAttribute('opacity', .3));
  await ctx.note(H, 'leader gone — election, term 8', { color: P.red });
  await Promise.all([
    ctx.zip(455, 106, 695, 106, { color: P.signalSoft, dur: .3 }),
    ctx.zip(695, 106, 455, 106, { color: P.signalSoft, dur: .3 }),
  ]);
  await ctx.move(crown, 455, 62, { dur: .5, lift: 24 });
  await ctx.wait(.5);

  block(logs[1], 43, P.signal);
  await ctx.zip(455, 180, 695, 180, { color: P.signalSoft, dur: .5 });
  block(logs[2], 43, P.signal);
  await ctx.zip(695, 160, 455, 160, { color: P.goSoft, dur: .45 });
  logs[1].blocks.at(-1).rect.setAttribute('fill', P.go);
  logs[2].blocks.at(-1).rect.setAttribute('fill', P.go);
  await ctx.note(H, 'still writing: 2 of 3 is still a majority — one loss costs nothing', { color: P.goSoft });
}

/* ── 03 · the api server pipeline ────────────────────────────────────── */

export async function figApiserver(ctx) {
  const H = 340, LANE = 168;
  const GATES = [
    { x: 168, name: 'authn', sub: 'who?' },
    { x: 288, name: 'rbac', sub: 'may they?' },
    { x: 408, name: 'mutate', sub: 'defaults' },
    { x: 528, name: 'validate', sub: 'schema' },
    { x: 648, name: 'verify', sub: 'policy' },
  ];

  ctx.label(450, 44, 'the write path', { size: 10 });
  ctx.line(50, LANE, 790, LANE, { stroke: P.faint });
  const gates = GATES.map(g => {
    const b = ctx.box(g.x - 34, 96, 68, 144, null, { fill: P.ink2 });
    ctx.label(34, 30, g.name, { size: 10.5, fill: P.kubeSoft, parent: b });
    ctx.label(34, 126, g.sub, { size: 8.5, fill: P.dim, parent: b });
    return b;
  });
  const etcd = ctx.cyl(830, 130, 30, 40, 'etcd');
  await ctx.fadeIn(etcd, .3);

  const run = async (text, fill, outcome) => {
    const c = ctx.chip(70, LANE, text, { fill });
    await ctx.pop(c);
    for (let i = 0; i < GATES.length; i++) {
      const g = GATES[i];
      await ctx.move(c, g.x, LANE, { dur: .42 });
      if (outcome.fail === g.name) {
        ctx.cross(g.x, 84, { r: 7 });
        const code = ctx.chip(g.x, 258, outcome.code, { fill: P.red, color: P.paper });
        await ctx.pop(code);
        await ctx.note(H, outcome.note, { color: P.red });
        await Promise.all([ctx.move(c, 70, LANE, { dur: .6 }), ctx.wait(.4)]);
        await Promise.all([ctx.fadeOut(c, .3), ctx.fadeOut(code, .3)]);
        return;
      }
      ctx.tick(g.x, 84);
      if (g.name === 'mutate' && outcome.badge) {
        const b = ctx.chip(g.x, 258, outcome.badge, { fill: P.ink3, color: P.signalSoft });
        await ctx.pop(b);
        await ctx.fadeOut(b, .5);
      }
      await ctx.wait(.1);
    }
    await ctx.move(c, 830, LANE, { dur: .5 });
    await ctx.fadeOut(c, .3);
    const stamp = ctx.chip(830, 92, outcome.rv, { fill: P.go });
    await ctx.pop(stamp);
    await ctx.note(H, outcome.note, { color: P.goSoft });
    await ctx.wait(.7);
    await ctx.fadeOut(stamp, .4);
  };

  await run('create pod · alice', P.paper, { rv: 'rv 7341', badge: '+ defaults injected', note: 'five checkpoints, then the ledger — nothing skips the line' });
  await run('delete ns prod · intern', P.paper2, { fail: 'rbac', code: '403', note: 'rbac: this identity may not do this verb on this resource' });
  await run('create pod · no image', P.paper2, { fail: 'validate', code: '422', note: 'schema says no — invalid objects never reach storage' });
}

/* ── 04 · optimistic concurrency ─────────────────────────────────────── */

export async function figConcurrency(ctx) {
  const H = 390;

  // the ledger object, with live fields
  const card = ctx.box(355, 110, 190, 120, null, { stroke: P.kube });
  ctx.label(95, 26, 'deployment/web', { size: 11, fill: P.paper, up: false, w: 700, parent: card });
  const fReplicas = ctx.label(95, 52, 'replicas: 3', { size: 10.5, fill: P.kubeSoft, up: false, parent: card });
  const fImage = ctx.label(95, 72, 'image: v1', { size: 10.5, fill: P.kubeSoft, up: false, parent: card });
  const fRv = ctx.label(95, 98, 'rv: 7', { size: 11, fill: P.signalSoft, up: false, w: 700, parent: card });

  const A = ctx.box(60, 60, 180, 54, 'controller a');
  const B = ctx.box(660, 60, 180, 54, 'controller b');
  ctx.label(150, 138, 'wants replicas: 4', { size: 9.5, up: false });
  ctx.label(750, 138, 'wants image: v2', { size: 9.5, up: false });

  for (const n of [card, A, B]) await ctx.fadeIn(n, .25);

  // both read the same version
  await Promise.all([ctx.zip(355, 150, 240, 90, { dur: .5 }), ctx.zip(545, 150, 660, 90, { dur: .5 })]);
  const rA = ctx.chip(150, 170, 'read @ rv:7', { fill: P.ink3, color: P.paper });
  const rB = ctx.chip(750, 170, 'read @ rv:7', { fill: P.ink3, color: P.paper });
  await Promise.all([ctx.pop(rA), ctx.pop(rB)]);
  await ctx.note(H, 'two writers, one object, no lock anywhere');

  // A wins the race
  const wA = ctx.chip(150, 220, 'PUT replicas:4 @ rv:7', { fill: P.paper });
  await ctx.pop(wA);
  await ctx.move(wA, 450, 170, { dur: .6, lift: 30 });
  wA.remove();
  await ctx.pulse(card, { color: P.go });
  fReplicas.textContent = 'replicas: 4';
  fRv.textContent = 'rv: 8';
  await ctx.note(H, 'accepted: the version it read is still the version on file', { color: P.goSoft });
  await ctx.wait(.8);

  // B's write is now against a stale version
  const wB = ctx.chip(750, 220, 'PUT image:v2 @ rv:7', { fill: P.paper });
  await ctx.pop(wB);
  await ctx.move(wB, 450, 170, { dur: .6, lift: 30 });
  wB.remove();
  await ctx.pulse(card, { color: P.red });
  const conflict = ctx.chip(620, 170, '409 conflict', { fill: P.red, color: P.paper });
  await ctx.pop(conflict);
  await ctx.move(conflict, 750, 220, { dur: .5 });
  await ctx.note(H, 'rejected: rv:7 is history — b was about to erase a’s change', { color: P.red });
  await ctx.wait(1);
  await ctx.fadeOut(conflict, .3);

  // B retries against fresh state
  await ctx.zip(545, 150, 660, 90, { dur: .45 });
  rB.remove(); rA.remove();
  const rB2 = ctx.chip(750, 170, 'read @ rv:8 · replicas:4', { fill: P.ink3, color: P.paper });
  await ctx.pop(rB2);
  const wB2 = ctx.chip(750, 220, 'PUT image:v2 @ rv:8', { fill: P.paper });
  await ctx.pop(wB2);
  await ctx.move(wB2, 450, 170, { dur: .6, lift: 30 });
  wB2.remove();
  await ctx.pulse(card, { color: P.go });
  fImage.textContent = 'image: v2';
  fRv.textContent = 'rv: 9';
  await ctx.note(H, 'both intents survive: read, re-apply, write — the loop absorbs the race', { color: P.goSoft });
}
