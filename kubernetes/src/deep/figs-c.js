// Figures 09-11: the kubelet at the edge, leader election, and the wall of
// transferable patterns.

import { P, el } from './fig.js';

/* ── 09 · the kubelet ────────────────────────────────────────────────── */

export async function figKubelet(ctx) {
  const H = 420;

  // the node is a world of its own; the api server is far away on the right
  const frame = ctx.g(0, 0);
  el('rect', { x: 36, y: 36, width: 580, height: 348, rx: 6, fill: 'none', stroke: P.faint, 'stroke-dasharray': '6 6' }, frame);
  ctx.label(70, 58, 'node-3', { size: 10.5, fill: P.dim, anchor: 'start' });

  const api = ctx.box(700, 70, 160, 64, 'api server', { stroke: P.kube });
  const kubelet = ctx.box(70, 90, 160, 56, 'kubelet', { sub: 'the loop' });
  const cri = ctx.box(70, 240, 160, 52, 'containerd', { sub: 'via CRI (gRPC)' });
  ctx.line(230, 118, 700, 100);
  ctx.line(150, 146, 150, 240);
  ctx.label(452, 96, 'watch: pods where nodeName = node-3', { size: 8.5, up: false });

  for (const n of [frame, api, kubelet, cri]) await ctx.fadeIn(n, .2);

  // the spec arrives — desired state for this node only
  const spec = ctx.chip(700, 160, 'pod web-x9 (bound here)', { fill: P.paper, size: 9.5 });
  await ctx.pop(spec);
  await ctx.move(spec, 150, 118, { dur: .7, lift: 40 });
  spec.remove();
  await ctx.pulse(kubelet, { color: P.signal });
  await ctx.note(H, 'desired: this pod should be running here. actual: nothing is.');

  // kubelet drives the runtime; it runs no containers itself
  await ctx.zip(150, 146, 150, 240, { color: P.signalSoft, dur: .35 });
  const pull = ctx.label(150, 316, 'pulling web:v1…', { size: 9, fill: P.dim, up: false });
  const pbar = el('rect', { x: 90, y: 324, width: 0, height: 5, rx: 2, fill: P.kube }, ctx.svg);
  await ctx.tween({ dur: 1.1, ease: 'io', onUpdate: u => pbar.setAttribute('width', 120 * u) });
  pull.remove(); pbar.remove();

  const cont = ctx.g(380, 250);
  el('rect', { x: -30, y: -30, width: 60, height: 60, rx: 6, fill: P.go }, cont);
  ctx.label(0, 4, 'web', { size: 10, fill: P.ink, w: 700, parent: cont });
  const st = ctx.label(380, 310, 'running', { size: 9, fill: P.goSoft });
  await ctx.pop(cont);
  await ctx.fadeIn(st, .3);

  // probes feed the actual state; status flows up as observations
  for (let i = 0; i < 2; i++) {
    await ctx.zip(230, 118, 350, 235, { color: P.kubeSoft, dur: .3 });
    ctx.tick(415, 215);
    await ctx.wait(.25);
  }
  const up1 = ctx.chip(400, 70, 'status: Ready 1/1', { fill: P.ink3, color: P.goSoft, size: 9.5 });
  await ctx.pop(up1);
  await ctx.move(up1, 700, 102, { dur: .55 });
  up1.remove();

  // heartbeat: the node lease
  const hb = ctx.chip(452, 140, 'lease renew', { fill: P.ink3, color: P.dim, size: 9 });
  await ctx.pop(hb, .25);
  await ctx.move(hb, 700, 120, { dur: .4 });
  hb.remove();
  await ctx.note(H, 'every few seconds: renew the node lease — "I am still here"');

  // a container dies; PLEG wakes the loop; restart with backoff
  cont.querySelector('rect').setAttribute('fill', P.red);
  st.textContent = 'exited (1)';
  st.setAttribute('fill', P.red);
  ctx.cross(410, 220, { r: 8 });
  const pleg = ctx.chip(280, 250, 'PLEG: container died', { fill: P.red, color: P.paper, size: 9 });
  await ctx.pop(pleg);
  await ctx.move(pleg, 150, 160, { dur: .5 });
  pleg.remove();
  await ctx.pulse(kubelet, { color: P.red });
  await ctx.note(H, 'the runtime’s event wakes the sync loop — desired says: it should be running', { color: P.red });

  const back = ctx.chip(150, 200, 'restart · backoff 10s', { fill: P.ink3, color: P.signalSoft, size: 9 });
  await ctx.pop(back);
  await ctx.wait(.8);
  await ctx.fadeOut(back, .3);
  await ctx.zip(150, 146, 150, 240, { color: P.signalSoft, dur: .35 });
  cont.querySelector('rect').setAttribute('fill', P.go);
  st.textContent = 'running';
  st.setAttribute('fill', P.goSoft);
  const up2 = ctx.chip(400, 70, 'status: Ready · restarts: 1', { fill: P.ink3, color: P.goSoft, size: 9.5 });
  await ctx.pop(up2);
  await ctx.move(up2, 700, 102, { dur: .55 });
  up2.remove();
  await ctx.note(H, 'same shape as every other loop: observe, diff, act — at the edge', { color: P.goSoft });
}

/* ── 10 · leader election ────────────────────────────────────────────── */

export async function figLeader(ctx) {
  const H = 380;

  // the lease is an ordinary object; election is ordinary CAS
  const lease = ctx.box(320, 40, 260, 92, null, { stroke: P.kube });
  ctx.label(130, 24, 'lease · controller-manager', { size: 10, fill: P.paper, up: false, w: 700, parent: lease });
  const holder = ctx.label(130, 48, 'holder: cm-a', { size: 10.5, fill: P.signalSoft, up: false, parent: lease });
  ctx.label(130, 70, 'ttl ~15s', { size: 9, fill: P.dim, up: false, parent: lease });
  const ttlBg = el('rect', { x: 340, y: 142, width: 220, height: 6, rx: 3, fill: P.ink3 }, ctx.svg);
  const ttl = el('rect', { x: 340, y: 142, width: 220, height: 6, rx: 3, fill: P.go }, ctx.svg);

  const cms = [
    { x: 80, name: 'cm-a', box: null },
    { x: 360, name: 'cm-b', box: null },
    { x: 640, name: 'cm-c', box: null },
  ];
  cms.forEach(c => {
    c.box = ctx.box(c.x, 260, 180, 60, c.name, { sub: c.name === 'cm-a' ? 'leading' : 'standby' });
    if (c.name !== 'cm-a') c.box.setAttribute('opacity', .55);
  });

  for (const n of [lease, ttlBg, ttl, ...cms.map(c => c.box)]) await ctx.fadeIn(n, .2);
  await ctx.note(H, 'one may drive at a time — two schedulers would double-place pods');

  // renewals: CAS against the version you read, like any other write
  for (let i = 0; i < 2; i++) {
    await ctx.zip(170, 260, 400, 132, { color: P.goSoft, dur: .45 });
    ctx.tick(590, 60);
    await ctx.tween({ dur: .25, ease: 'out', onUpdate: u => ttl.setAttribute('width', 220 * u) });
    await ctx.wait(.9);
    await ctx.tween({ dur: .9, ease: 'linear', onUpdate: u => ttl.setAttribute('width', 220 * (1 - u * .4)) });
  }

  // the leader dies; the lease drains; the standbys race
  ctx.cross(170, 290, { r: 11 });
  cms[0].box.setAttribute('opacity', .25);
  await ctx.note(H, 'cm-a is gone. nobody is told — the lease speaks for it', { color: P.red });
  await ctx.tween({ dur: 1.6, ease: 'linear', onUpdate: u => ttl.setAttribute('width', 220 * .6 * (1 - u)) });
  await ctx.note(H, 'lease expired — every standby attempts the same CAS write', { color: P.signalSoft });

  const raceB = ctx.chip(450, 220, 'PUT holder:cm-b @ rv:301', { fill: P.paper, size: 9 });
  const raceC = ctx.chip(730, 220, 'PUT holder:cm-c @ rv:301', { fill: P.paper, size: 9 });
  await Promise.all([ctx.pop(raceB), ctx.pop(raceC)]);
  await Promise.all([
    ctx.move(raceB, 430, 132, { dur: .45, lift: 20 }),
    ctx.move(raceC, 480, 132, { dur: .6, lift: 30 }),
  ]);
  raceB.remove();
  holder.textContent = 'holder: cm-b';
  await ctx.pulse(lease, { color: P.go });
  await ctx.tween({ dur: .3, ease: 'out', onUpdate: u => ttl.setAttribute('width', 220 * u) });
  raceC.remove();
  const lost = ctx.chip(640, 170, '409 conflict', { fill: P.red, color: P.paper, size: 9.5 });
  await ctx.pop(lost);
  await ctx.move(lost, 730, 250, { dur: .5 });
  await ctx.fadeOut(lost, .3);

  cms[1].box.setAttribute('opacity', 1);
  cms[1].box.querySelectorAll('text')[1].textContent = 'LEADING';
  await ctx.pulse(cms[1].box, { color: P.signal });
  await ctx.note(H, 'exactly one write wins. election = CAS on a record with a TTL', { color: P.goSoft });
}

/* ── 11 · the pattern wall ───────────────────────────────────────────── */

export async function figLessons(ctx) {
  const H = 460;
  const PATTERNS = [
    ['intent as data', 'the record is the interface'],
    ['declare, don’t command', 'state what, never how'],
    ['level-triggered loops', 'events are hints, not truth'],
    ['idempotent actions', 'safe to run twice, always'],
    ['CAS over locks', 'conflict is normal, retry is cheap'],
    ['watch + cache + resync', 'never poll, never trust forever'],
    ['small loops, no brain', 'compose janitors, not orchestras'],
    ['crash-only workers', 'recovery is the main path'],
    ['uniform machinery', 'extensions are first-class'],
  ];

  ctx.label(450, 40, 'what to steal', { size: 11, fill: P.signalSoft });

  for (let i = 0; i < PATTERNS.length; i++) {
    const col = i % 3, rowI = Math.floor(i / 3);
    const x = 45 + col * 280, y = 66 + rowI * 112;
    const card = ctx.box(x, y, 250, 92, null);
    const n = ctx.chip(x + 26, y + 26, String(i + 1), { fill: P.signal, size: 10 });
    ctx.label(150, 32, PATTERNS[i][0], { size: 11, fill: P.paper, up: false, w: 700, parent: card });
    ctx.label(125, 62, PATTERNS[i][1], { size: 9, fill: P.dim, up: false, parent: card });
    await ctx.fadeIn(card, .18);
    await ctx.pop(n, .2);
  }

  await ctx.wait(.5);
  await ctx.note(H, 'a kubernetes cluster: a database of intent + an army of janitors', { color: P.signalSoft });
}
