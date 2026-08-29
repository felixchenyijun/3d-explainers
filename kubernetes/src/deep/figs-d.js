// Figures 12-14: Service networking, storage provisioning, and operators.

import { P, el } from './fig.js';

/* ── 12 · the packet that never meets the Service ────────────────────── */

export async function figNetwork(ctx) {
  const H = 420;

  // client side: a pod on node-1, with the node's rewrite rules beside it
  const nodeA = ctx.g(0, 0);
  el('rect', { x: 36, y: 60, width: 330, height: 320, rx: 6, fill: 'none', stroke: P.faint, 'stroke-dasharray': '6 6' }, nodeA);
  ctx.label(70, 84, 'node-1', { size: 10, fill: P.dim, anchor: 'start' });

  const client = ctx.box(64, 110, 130, 54, 'client pod', { sub: '10.244.1.4' });
  const dns = ctx.box(240, 40, 170, 44, 'coredns', { sub: 'also a watcher' });

  const rules = ctx.box(64, 220, 274, 130, null);
  ctx.label(137, 22, 'iptables / ipvs rules', { size: 10, fill: P.kubeSoft, parent: rules });
  ctx.label(137, 40, 'programmed by kube-proxy', { size: 8.5, fill: P.dim, parent: rules, up: false });
  const ruleLines = [];
  const drawRules = (ips, hot = -1) => {
    ruleLines.forEach(r => r.remove()); ruleLines.length = 0;
    ips.forEach((ip, i) => {
      const t = ctx.label(18, 66 + i * 20, `10.96.0.12 → ${ip}`, {
        size: 9.5, fill: i === hot ? P.signalSoft : P.paper, anchor: 'start', up: false, parent: rules,
      });
      ruleLines.push(t);
    });
  };

  // backends on the right
  const BE = [
    { ip: '10.244.2.7', y: 90 },
    { ip: '10.244.3.2', y: 190 },
    { ip: '10.244.2.9', y: 290 },
  ];
  const bePods = BE.map(b => ctx.box(690, b.y, 170, 60, 'pod · web', { sub: b.ip, stroke: P.go }));
  const slice = ctx.box(480, 300, 160, 84, null);
  ctx.label(80, 20, 'endpointslice', { size: 9.5, fill: P.kubeSoft, parent: slice });
  const sliceRows = [];
  const drawSlice = ips => {
    sliceRows.forEach(r => r.remove()); sliceRows.length = 0;
    ips.forEach((ip, i) => sliceRows.push(
      ctx.label(80, 38 + i * 15, ip, { size: 8.5, fill: P.paper, up: false, parent: slice })));
  };

  for (const n of [nodeA, client, dns, rules, slice, ...bePods]) await ctx.fadeIn(n, .15);
  drawRules(BE.map(b => b.ip));
  drawSlice(BE.map(b => b.ip));

  // 1 · DNS: the name resolves to a VIP nobody listens on
  await ctx.zip(194, 130, 240, 62, { dur: .45 });
  const ans = ctx.chip(300, 110, 'web.shop → 10.96.0.12', { fill: P.paper, size: 9.5 });
  await ctx.pop(ans);
  await ctx.note(H, 'a VIP nobody listens on — no process, no box, no hop', { color: P.signalSoft });
  await ctx.wait(1);
  await ctx.fadeOut(ans, .3);

  // 2 · the packet is rewritten on its way out of the node
  const pkt = ctx.chip(130, 180, 'to 10.96.0.12', { fill: P.signal, size: 9.5 });
  await ctx.pop(pkt);
  await ctx.move(pkt, 200, 250, { dur: .5 });
  drawRules(BE.map(b => b.ip), 0);
  await ctx.pulse(rules, { color: P.signal });
  pkt.remove();
  const pkt2 = ctx.chip(240, 250, 'to 10.244.2.7', { fill: P.go, size: 9.5 });
  await ctx.pop(pkt2, .25);
  await ctx.note(H, 'DNAT: destination rewritten by a kernel rule as the packet leaves');
  await ctx.move(pkt2, 775, 120, { dur: .8, lift: 60 });
  await ctx.pulse(bePods[0], { color: P.go });
  await ctx.fadeOut(pkt2, .3);
  await ctx.note(H, 'the packet went straight to a pod ip — the "service" never touched it', { color: P.goSoft });
  await ctx.wait(1);
  drawRules(BE.map(b => b.ip));

  // 3 · a backend dies; the ledger reprograms every node
  ctx.cross(775, 120, { r: 10 });
  bePods[0].setAttribute('opacity', .25);
  await ctx.note(H, 'backend dies → endpointslice controller removes it', { color: P.red });
  await ctx.zip(775, 150, 560, 320, { color: P.red, dur: .5 });
  drawSlice([BE[1].ip, BE[2].ip]);
  await ctx.pulse(slice, { color: P.signal });
  await ctx.zip(560, 340, 338, 285, { color: P.kubeSoft, dur: .5 });
  drawRules([BE[1].ip, BE[2].ip]);
  await ctx.pulse(rules, { color: P.kube });
  await ctx.wait(.4);

  const pkt3 = ctx.chip(130, 180, 'to 10.96.0.12', { fill: P.signal, size: 9.5 });
  await ctx.pop(pkt3);
  await ctx.move(pkt3, 200, 250, { dur: .4 });
  drawRules([BE[1].ip, BE[2].ip], 0);
  pkt3.remove();
  const pkt4 = ctx.chip(240, 250, 'to 10.244.3.2', { fill: P.go, size: 9.5 });
  await ctx.pop(pkt4, .25);
  await ctx.move(pkt4, 775, 220, { dur: .7, lift: 50 });
  await ctx.pulse(bePods[1], { color: P.go });
  await ctx.fadeOut(pkt4, .3);
  await ctx.note(H, 'no node asked another node anything — rules follow the ledger', { color: P.goSoft });
}

/* ── 13 · storage: a claim, not a disk ───────────────────────────────── */

export async function figStorage(ctx) {
  const H = 420;

  const pvc = ctx.box(50, 60, 180, 84, null, { stroke: P.signal });
  ctx.label(90, 22, 'persistentvolumeclaim', { size: 9, fill: P.signalSoft, parent: pvc });
  ctx.label(90, 42, 'pg-data · 10Gi · fast', { size: 9.5, fill: P.paper, up: false, parent: pvc });
  const pvcState = ctx.label(90, 64, 'Pending', { size: 10, fill: P.dim, up: false, w: 700, parent: pvc });

  const prov = ctx.box(340, 46, 200, 60, 'csi provisioner', { sub: 'watching for claims' });
  const cloud = ctx.g(660, 50);
  el('ellipse', { cx: 0, cy: 12, rx: 58, ry: 26, fill: P.ink2, stroke: P.stroke }, cloud);
  ctx.label(0, 16, 'cloud api', { size: 9.5, fill: P.dim, parent: cloud });

  for (const n of [pvc, prov, cloud]) await ctx.fadeIn(n, .2);
  await ctx.note(H, 'a claim is desired state: "I need 10Gi" — no disk exists yet');
  await ctx.wait(.6);

  // provisioner reconciles the claim into a real disk + a PV record
  await ctx.zip(230, 100, 340, 76, { dur: .45 });
  await ctx.pulse(prov, { color: P.signal });
  await ctx.zip(540, 76, 610, 62, { color: P.signalSoft, dur: .45 });
  const disk = ctx.g(660, 160);
  el('path', { d: 'M-30 0 v22 a30 10 0 0 0 60 0 v-22', fill: P.ink3, stroke: P.kube }, disk);
  el('ellipse', { cx: 0, cy: 0, rx: 30, ry: 10, fill: P.ink2, stroke: P.kube }, disk);
  ctx.label(0, 52, 'vol-0a9f · 10Gi', { size: 8.5, fill: P.dim, up: false, parent: disk });
  await ctx.pop(disk);

  const pv = ctx.box(340, 150, 200, 70, null, { stroke: P.kube });
  ctx.label(100, 22, 'persistentvolume', { size: 9, fill: P.kubeSoft, parent: pv });
  ctx.label(100, 42, 'pv-7c21 → vol-0a9f', { size: 9.5, fill: P.paper, up: false, parent: pv });
  await ctx.fadeIn(pv, .3);

  const bind = ctx.line(230, 130, 340, 175, { stroke: P.go, width: 1.5, op: 0 });
  await ctx.tween({ dur: .4, ease: 'out', onUpdate: u => bind.setAttribute('opacity', u) });
  pvcState.textContent = 'Bound';
  pvcState.setAttribute('fill', P.goSoft);
  await ctx.note(H, 'claim ↔ volume bound: intent matched to a record of a real disk', { color: P.goSoft });
  await ctx.wait(.8);

  // the pod arrives; the disk follows it to the node
  const node = ctx.g(0, 0);
  el('rect', { x: 50, y: 250, width: 480, height: 140, rx: 6, fill: 'none', stroke: P.faint, 'stroke-dasharray': '6 6' }, node);
  ctx.label(84, 274, 'node-2', { size: 10, fill: P.dim, anchor: 'start' });
  await ctx.fadeIn(node, .3);

  const pod = ctx.chip(140, 320, 'pod postgres-0', { fill: P.paper });
  await ctx.pop(pod);
  await ctx.move(disk, 400, 300, { dur: .8, lift: 40 });
  await ctx.note(H, 'attach: the disk is joined to the node the scheduler picked');
  await ctx.move(disk, 255, 310, { dur: .5 });
  const mnt = ctx.label(255, 372, 'mounted: /var/lib/postgresql/data', { size: 8.5, fill: P.goSoft, up: false });
  await ctx.fadeIn(mnt, .3);
  await ctx.wait(1);

  // the pod dies; everything durable stays
  await ctx.fadeOut(pod, .4);
  await ctx.note(H, 'pod deleted — claim, volume and data all remain. the claim is the durable thing', { color: P.signalSoft });
  await ctx.pulse(pvc, { color: P.signal });
  await ctx.pulse(pv, { color: P.kube });
}

/* ── 14 · operators: teach the ledger a new noun ─────────────────────── */

export async function figOperators(ctx) {
  const H = 440;

  const api = ctx.box(50, 60, 170, 70, 'api server', { stroke: P.kube });
  await ctx.fadeIn(api, .2);

  // 1 · a CRD teaches the server a new type — instantly served
  const crd = ctx.chip(135, 20, 'CRD: PostgresCluster', { fill: P.paper, size: 9.5 });
  await ctx.pop(crd);
  await ctx.move(crd, 135, 95, { dur: .5 });
  crd.remove();
  await ctx.pulse(api, { color: P.signal });
  const ep = ctx.chip(135, 160, '/apis/db.acme.io/postgresclusters', { fill: P.ink3, color: P.kubeSoft, size: 8.5 });
  await ctx.pop(ep);
  await ctx.note(H, 'one write, and the server serves a new type — storage, rbac, watch, kubectl');
  await ctx.wait(1);

  // 2 · a user posts an instance; your controller is just another watcher
  const obj = ctx.box(340, 46, 210, 76, null, { stroke: P.signal });
  ctx.label(105, 22, 'postgrescluster · pg-main', { size: 9, fill: P.signalSoft, parent: obj });
  ctx.label(105, 42, 'replicas: 2 · version: 16', { size: 9.5, fill: P.paper, up: false, parent: obj });
  const st = ctx.label(105, 62, 'status: —', { size: 9, fill: P.dim, up: false, parent: obj });
  await ctx.fadeIn(obj, .3);

  const op = ctx.box(660, 46, 200, 76, 'your controller', { sub: 'an ordinary pod' });
  await ctx.fadeIn(op, .25);
  await ctx.zip(550, 84, 660, 84, { dur: .45 });
  await ctx.pulse(op, { color: P.signal });
  await ctx.note(H, 'the same loop as every built-in: informer, workqueue, reconcile');

  // 3 · reconcile fans out children, owned for garbage collection
  const kids = [
    ctx.box(300, 210, 170, 50, 'statefulset', { sub: 'pg-0 · pg-1' }),
    ctx.box(510, 210, 150, 50, 'service', { sub: 'pg-main-rw' }),
    ctx.box(700, 210, 150, 50, 'secret', { sub: 'credentials' }),
  ];
  for (const k of kids) {
    ctx.line(445, 122, k.__x + k.__w / 2, 210, { dash: '4 4' });
    await ctx.pop(k, .3);
  }
  const pg0 = ctx.chip(350, 310, 'pg-0 · primary', { fill: P.kube, size: 9.5 });
  const pg1 = ctx.chip(510, 310, 'pg-1 · replica', { fill: P.ink3, color: P.paper, size: 9.5 });
  await Promise.all([ctx.pop(pg0), ctx.pop(pg1)]);
  st.textContent = 'status: Ready';
  st.setAttribute('fill', P.goSoft);
  await ctx.note(H, 'children carry ownerReferences — delete pg-main and gc sweeps it all', { color: P.goSoft });
  await ctx.wait(1.2);

  // 4 · failover is a reconcile, not a runbook
  ctx.cross(350, 310, { r: 9 });
  pg0.setAttribute('opacity', .25);
  await ctx.note(H, 'primary dies at 3am', { color: P.red });
  await ctx.zip(400, 300, 740, 122, { color: P.red, dur: .55 });
  await ctx.pulse(op, { color: P.red });
  await ctx.wait(.4);
  await ctx.zip(740, 122, 560, 300, { color: P.signalSoft, dur: .5 });
  pg1.remove();
  const promoted = ctx.chip(510, 310, 'pg-1 · primary', { fill: P.kube, size: 9.5 });
  await ctx.pop(promoted);
  await ctx.zip(740, 122, 585, 235, { color: P.signalSoft, dur: .4 });
  await ctx.pulse(kids[1], { color: P.signal });
  st.textContent = 'status: failover done';
  st.setAttribute('fill', P.signalSoft);
  await ctx.note(H, 'operational knowledge as a loop: promote, repoint, report — nobody paged', { color: P.goSoft });
}
