// Act 1 — the machine itself: the two territories, the weights, and the
// state attention forces us to keep.
import * as THREE from 'three';
import { camPath, win, ease, htmlLabel, clamp } from '../engine/gfx.js';
import { hbmBox, smPanel, busFlow, tokenChip, inspector, COL, HBM_X, SM_X } from './viz.js';
import { GPU, MODEL, ridge, prec, weightBytes, kvBytesPerToken, kvBytesPerSeq, CTX, fmtBytes, fmtInt } from './machine.js';
import { ARTICLES } from './articles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const put = (l, x, y, z) => { l.position.set(x, y, z); return l; };

// --- 1 · the machine ---------------------------------------------------------
const machine = {
  id: 'machine',
  title: 'The machine',
  where: 'Chapter 1 · one GPU, two territories',
  duration: 32,
  legend: 'mem',
  uses: [],
  article: ARTICLES.machine,
  beats: [
    { at: 0.00, h: 'A GPU is two machines',
      p: 'On the left, <b>memory</b>: 80 GB of HBM3, stacked right beside the die. On the right, <b>compute</b>: 132 streaming multiprocessors full of tensor cores. Between them, a wire. Every trick in LLM serving — every acronym you have ever skimmed past — exists because of the mismatch between these two territories.' },
    { at: 0.22, h: 'Memory moves 3.35 TB/s',
      p: 'Weights, conversation state, everything the model knows lives in HBM. The wire can carry <b>3.35 terabytes every second</b> — watch the bytes flow. It sounds enormous. Hold that thought.' },
    { at: 0.42, h: 'Compute does 989 trillion ops/s',
      p: 'The other territory: when the tensor cores light up they perform <b>989 TFLOP/s</b> — nearly a quadrillion floating-point operations a second at bf16. This machine is not short of arithmetic.' },
    { at: 0.62, h: 'Divide the two speeds: 295',
      p: '989 TFLOP/s ÷ 3.35 TB/s ≈ <b>295 FLOPs per byte</b>. For the cores to stay busy, every byte fetched from memory must feed about 295 operations. Feed it fewer and the cores wait, idle, however fast they are. The FLOPs-per-byte of a workload is its <b>arithmetic intensity</b>; 295 is this machine’s <b>ridge</b>.' },
    { at: 0.84, h: 'The question of this film',
      p: 'Generating text, we are about to see, feeds each byte almost <i>nothing</i>. The rest of this film is the industry’s fight against that single fact. Drag to orbit any scene; hover the parts of the machine to interrogate them.' },
  ],
  build(ctx) {
    inspector.begin();
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    hbm.set({ weightsBytes: 0, kvSeqBytes: [] });
    root.add(hbm.group, sm.group, bus.points);

    root.add(put(htmlLabel('HBM3<span class="sub">80 GB · 3.35 TB/s</span>'), HBM_X, 14.5, 0));
    root.add(put(htmlLabel('132 SMs<span class="sub">989 TFLOP/s bf16</span>'), SM_X, 14.5, 0));
    const wireTag = put(htmlLabel('3.35 TB/s', 'muted'), 0, 4.5, 0);
    const ridgeTag = put(htmlLabel(`1 byte : ${Math.round(ridge())} FLOPs<span class="sub">the ridge — feed every byte this much, or wait</span>`), 0, -11, 0);
    root.add(wireTag, ridgeTag);

    inspector.track(hbm.shell, '<b>HBM3</b> — 80 GB of DRAM stacked on the same package as the die. Its 3.35 TB/s of bandwidth is the wire everything below fights over.');
    inspector.track(sm.mesh, '<b>Streaming multiprocessors</b> — 132 of them; each holds tensor cores that do the actual matrix math. Peak: 989 TFLOP/s dense bf16.');
    inspector.track(bus.points, '<b>Bytes in flight</b> — traffic between HBM and the cores. When this wire is the bottleneck, the workload is <i>memory-bound</i>.');

    return {
      root,
      update(t, dt, elapsed) {
        const enter = ease(win(t, 0, 0.14));
        hbm.group.position.y = (1 - enter) * -30;
        sm.group.position.y = (1 - enter) * -30;

        bus.set(t > 0.22 ? 1 : 0);
        bus.update(dt);
        wireTag.visible = t > 0.24;

        const flash = win(t, 0.42, 0.47) * (1 - win(t, 0.58, 0.63));
        sm.setActivity(t < 0.42 ? 0 : t < 0.62 ? flash : 0.35);
        sm.update(elapsed);

        ridgeTag.visible = t > 0.64;
        ctx.hud.set({ rows: [
          ['memory', '80 GB HBM3 · 3.35 TB/s'],
          ['compute', '132 SMs · 989 TFLOP/s bf16'],
          ['ridge', `${Math.round(ridge())} FLOPs per byte`],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 16, 110], target: [0, 0, 0], fov: 46 },
        { at: 0.30, pos: [-30, 12, 78], target: [-12, 0, 0], fov: 46 },
        { at: 0.55, pos: [34, 10, 74], target: [14, 0, 0], fov: 46 },
        { at: 0.80, pos: [0, 8, 84], target: [0, 0, 0], fov: 46 },
        { at: 1.00, pos: [0, 20, 96], target: [0, -2, 0], fov: 46 },
      ]),
    };
  },
};

// --- 2 · the weights ---------------------------------------------------------
const weights = {
  id: 'weights',
  title: 'The model is memory',
  where: (s) => `Chapter 2 · 7B parameters at ${prec(s.precision).label}`,
  duration: 30,
  legend: 'mem',
  uses: ['quant'],
  article: ARTICLES.weights,
  beats: [
    { at: 0.00, h: '7 billion numbers',
      p: (s) => `A “7B model” is exactly that: seven billion learned numbers. At ${prec(s.precision).label} each one costs ${prec(s.precision).bytes} byte${prec(s.precision).bytes === 1 ? '' : 's'}, so the model is a <b>${fmtBytes(weightBytes(s.precision))} block of memory</b> that must sit in HBM before anything can happen. Watch it assemble, layer by layer.` },
    { at: 0.20, h: '32 identical slabs',
      p: 'The block is 32 transformer layers, each the same shape: four attention matrices — W<sub>q</sub>, W<sub>k</sub>, W<sub>v</sub>, W<sub>o</sub>, each 4096×4096 — and an MLP whose up, gate and down projections (4096×11,008 each) hold about two-thirds of the layer’s parameters. Plus separate embedding and output matrices at the two ends, 32,000-token vocabulary each.' },
    { at: 0.45, h: 'Every token touches every weight',
      p: 'In a dense model there is no “hot subset”: producing a single token multiplies through <b>essentially all seven billion numbers</b>. Whatever else happens in this film, that read has to happen. The only questions are how many bytes it costs, and how many tokens share it.' },
    { at: 0.72, h: 'The leftover is the budget',
      p: (s) => `The box is 80 GB; the weights take ${fmtBytes(weightBytes(s.precision))}. The remaining <b>${fmtBytes(GPU.hbm - weightBytes(s.precision))}</b> is the entire budget for serving state — chiefly the KV cache, which the next chapter derives. Try the ${prec(s.precision).label === 'FP16' ? 'Q toggle' : 'Q toggle again'} below: precision changes this arithmetic live.` },
  ],
  build(ctx) {
    inspector.begin();
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);
    sm.setActivity(0);

    const layerTag = put(htmlLabel(''), HBM_X, 14.5, 0);
    const freeTag = put(htmlLabel('', 'muted'), HBM_X, 8, 0);
    root.add(layerTag, freeTag);

    const s = ctx.state;
    const wB = () => weightBytes(s.precision);
    inspector.track(hbm.shell, '<b>HBM</b> — the 80 GB box. Weights are permanent residents; everything else rents what is left.');
    inspector.track(hbm.weights, `<b>Model weights</b> — 7,000,000,000 parameters as one gold block. Every generated token reads essentially all of it.`);
    inspector.track(sm.mesh, '<b>SMs, idle</b> — nothing to compute until work arrives. Loading a model lights the wire, not the cores.');

    return {
      root,
      update(t, dt, elapsed) {
        const layers = Math.max(1, Math.round(ease(win(t, 0.04, 0.55)) * MODEL.layers));
        hbm.set({ weightsBytes: wB() * (layers / MODEL.layers), kvSeqBytes: [] });
        layerTag.userData.el.innerHTML =
          `weights<span class="sub">${layers} / ${MODEL.layers} layers · ${fmtBytes(wB() * layers / MODEL.layers)}</span>`;
        freeTag.visible = t > 0.7;
        freeTag.userData.el.innerHTML = `${fmtBytes(GPU.hbm - wB())} free<span class="sub">the serving budget</span>`;

        bus.set(t < 0.55 ? 0.5 : 0.06);
        bus.update(dt);
        sm.update(elapsed);

        ctx.hud.set({ rows: [
          ['precision', prec(s.precision).label + ` (${prec(s.precision).bytes} B/param)`],
          ['weights', fmtBytes(wB())],
          ['per layer', fmtBytes(wB() / MODEL.layers)],
          ['HBM free', fmtBytes(GPU.hbm - wB())],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [-8, 10, 70], target: [-14, 0, 0], fov: 46 },
        { at: 0.50, pos: [-26, 6, 42], target: [HBM_X, -2, 0], fov: 46 },
        { at: 1.00, pos: [-10, 14, 58], target: [-14, 0, 0], fov: 46 },
      ]),
    };
  },
};

// --- 3 · attention and the KV cache -----------------------------------------
const attention = {
  id: 'attention',
  title: 'What attention remembers',
  where: (s) => `Chapter 3 · the KV cache, at ${prec(s.precision).label}`,
  duration: 34,
  legend: 'tok',
  uses: ['quant'],
  article: ARTICLES.attention,
  beats: [
    { at: 0.00, h: 'Attention, in one breath',
      p: 'Inside every layer, each token is projected into three vectors: a <b>query</b>, a <b>key</b>, and a <b>value</b>. To process the newest token, its query is dotted against the key of <i>every token before it</i>; softmax turns the scores into weights; the output is the weighted blend of their values. That is attention. Watch the new token reach back.' },
    { at: 0.26, h: 'It needs all of the past',
      p: 'The dependency is total: token N+1 cannot be computed without the keys and values of all N tokens before it, in every one of the 32 layers. You have two options: recompute them from scratch on every single step — quadratic work that grows with the square of the conversation — or keep them.' },
    { at: 0.48, h: 'Everyone keeps them',
      p: (s) => `Cache the K and V of each token as it is processed and never compute it again. The price is memory: 2 vectors × 32 layers × 32 heads × 128 dimensions × ${prec(s.precision).bytes} byte${prec(s.precision).bytes === 1 ? '' : 's'} = <b>${fmtBytes(kvBytesPerToken(s.precision))} per token</b>. This is the <b>KV cache</b> — the conversation itself, materialized as memory.` },
    { at: 0.72, h: 'Conversations are gigabytes',
      p: (s) => `At ${fmtBytes(kvBytesPerToken(s.precision))} a token, a ${fmtInt(CTX)}-token context costs <b>${fmtBytes(kvBytesPerSeq(s.precision))} per sequence</b> — rent paid in HBM, beside the weights, for every user you are serving at once. Our model is full multi-head attention, the worst case on purpose; the deep dive covers the relief valves real models use (GQA, MLA, sliding windows).` },
  ],
  build(ctx) {
    inspector.begin();
    const root = new THREE.Group();
    root.position.x = -3.5;      // keep the fresh token inside the frame
    const s = ctx.state;
    const N = 9;

    // the past: a row of committed tokens; the new one arrives at the right
    const tokens = [];
    for (let i = 0; i < N; i++) {
      const c = tokenChip(COL.core, 1.6);
      c.material = c.material.clone();
      c.position.set((i - N / 2) * 2.6, 0, 0);
      root.add(c); tokens.push(c);
    }
    const fresh = tokenChip(COL.token, 1.8);
    fresh.position.set((N - N / 2) * 2.6 + 1.2, 0, 0);
    root.add(fresh);
    root.add(put(htmlLabel('new token<span class="sub">query</span>'), fresh.position.x, 2.2, 0));

    // arcs: query reaching each past key (thickness ≈ softmax weight)
    const arcs = [];
    const wts = [0.02, 0.03, 0.05, 0.04, 0.26, 0.06, 0.08, 0.34, 0.12];
    for (let i = 0; i < N; i++) {
      const from = fresh.position, to = tokens[i].position;
      const mid = V((from.x + to.x) / 2, 4.5 + Math.abs(from.x - to.x) * 0.22, 0);
      const curve = new THREE.QuadraticBezierCurve3(from.clone().setY(0.8), mid, to.clone().setY(0.8));
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.06 + wts[i] * 0.5, 6, false),
        new THREE.MeshStandardMaterial({ color: COL.core, emissive: COL.core,
          emissiveIntensity: 0.7, transparent: true, opacity: 0 }));
      root.add(tube); arcs.push(tube);
    }

    // each token's stored K,V — bricks that extrude into full context columns
    const kvBricks = [];
    for (let i = 0; i < N; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1.2),
        new THREE.MeshStandardMaterial({ color: COL.kv, emissive: COL.kv,
          emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0 }));
      b.position.set(tokens[i].position.x, -2.2, 0);
      root.add(b); kvBricks.push(b);
    }
    const kvTag = put(htmlLabel(''), 0, -4.6, 0);
    kvTag.visible = false;
    root.add(kvTag);

    // the payoff of attention: the weighted blend of values, assembling as a
    // glow above the new token — fed by motes travelling up the arcs
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18),
      new THREE.MeshStandardMaterial({ color: COL.token, emissive: 0x9fd8ff,
        emissiveIntensity: 0.9, transparent: true, opacity: 0 }));
    orb.position.set(fresh.position.x, 4.4, 0);
    root.add(orb);
    const orbTag = put(htmlLabel('weighted blend of values<span class="sub">the token’s output</span>', 'muted'), fresh.position.x, 6.8, 0);
    orbTag.visible = false;
    root.add(orbTag);
    const NF = 26, flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3));
    const flow = new THREE.Points(flowGeo, new THREE.PointsMaterial({
      color: 0x9fd8ff, size: 3.2, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false }));
    root.add(flow);
    const flowState = Array.from({ length: NF }, (_, i) => ({ arc: i % N, u: (i * 0.153) % 1 }));
    const curves = arcs.map((a) => a.geometry.parameters.path);
    inspector.track(orb, '<b>The attention output</b> — every past value vector, mixed in proportion to how hard the query matched its key.');

    inspector.track(fresh, '<b>The newest token</b> — its query must consult every past token’s key before the model can speak.');
    tokens.forEach((tk) => inspector.track(tk, '<b>A past token</b> — already processed; its key and value are what the future needs from it.'));
    kvBricks.forEach((b) => inspector.track(b,
      `<b>Cached K,V</b> — ${fmtBytes(kvBytesPerToken(s.precision))} per token across all 32 layers. Compute once, read forever.`));

    return {
      root,
      update(t, dt, elapsed) {
        for (let i = 0; i < N; i++) {
          const reach = win(t, 0.05 + i * 0.02, 0.13 + i * 0.02);
          arcs[i].material.opacity = reach * (0.25 + wts[i] * 1.6) * (1 - win(t, 0.60, 0.72) * 0.75);
          tokens[i].material.emissiveIntensity = 0.35 + wts[i] * 2.2 * reach * (0.6 + 0.4 * Math.sin(elapsed * 3 + i));
        }
        fresh.rotation.y = Math.sin(elapsed * 0.8) * 0.15;

        // value motes ride the arcs backwards (past → new token) and feed the orb
        const blend = win(t, 0.12, 0.3) * (1 - win(t, 0.55, 0.68) * 0.8);
        const fp = flowGeo.attributes.position.array;
        for (let i = 0; i < NF; i++) {
          const F = flowState[i];
          F.u = (F.u + dt * (0.25 + wts[F.arc] * 0.8)) % 1;
          const p = curves[F.arc].getPoint(1 - F.u);   // toward the fresh token
          fp.set([p.x, p.y, p.z], i * 3);
        }
        flowGeo.attributes.position.needsUpdate = true;
        flow.material.opacity = blend * 0.9;
        flow.visible = blend > 0.02;
        orb.material.opacity = blend * 0.85;
        orb.scale.setScalar(0.4 + blend * (0.6 + 0.08 * Math.sin(elapsed * 2.6)));
        orbTag.visible = blend > 0.5;

        const drop = win(t, 0.48, 0.62);
        const grow = win(t, 0.72, 0.9);
        for (let i = 0; i < N; i++) {
          const b = kvBricks[i];
          const d = clamp(drop * N - i * 0.35, 0, 1);
          b.material.opacity = d * 0.95;
          b.scale.y = 1 + grow * 6;
          b.position.y = -2.2 - grow * 3;
        }
        kvTag.visible = t > 0.5;
        kvTag.userData.el.innerHTML = t < 0.72
          ? `${fmtBytes(kvBytesPerToken(s.precision))} per token<span class="sub">K + V · all 32 layers</span>`
          : `${fmtBytes(kvBytesPerSeq(s.precision))} per ${fmtInt(CTX)}-token sequence<span class="sub">the KV cache</span>`;

        ctx.hud.set({ rows: [
          ['per token', fmtBytes(kvBytesPerToken(s.precision)) + '  (2 · 32 layers · 32 heads · 128 dim)'],
          [`per ${fmtInt(CTX)} ctx`, fmtBytes(kvBytesPerSeq(s.precision))],
          ['of HBM', ((kvBytesPerSeq(s.precision) / GPU.hbm) * 100).toFixed(1) + '% per sequence'],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 3, 34], target: [0, 1, 0], fov: 46 },
        { at: 0.35, pos: [8, 6, 28], target: [3, 1, 0], fov: 46 },
        { at: 0.70, pos: [0, 2, 30], target: [0, -2, 0], fov: 46 },
        { at: 1.00, pos: [0, 4, 40], target: [0, -3, 0], fov: 46 },
      ]),
    };
  },
};

export const act1 = [machine, weights, attention];
