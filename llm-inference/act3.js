// Act 3 — shrinking the bytes, spending the idle FLOPs, and the one chart
// that holds the whole film.
import * as THREE from 'three';
import { camPath, win, ease, htmlLabel, clamp, rng } from '../engine/gfx.js';
import { hbmBox, smPanel, busFlow, makeSweep, tokenChip, rooflinePlot, inspector, COL, HBM_X, SM_X, gbH } from './viz.js';
import { GPU, DRAFT, ridge, prec, weightBytes, kvBytesPerSeq, maxSeqFit, decodeStep, throughput, prefill, specYield, CTX, fmtBytes, fmtInt, fmtX } from './machine.js';
import { ARTICLES } from './articles.js';

const put = (l, x, y, z) => { l.position.set(x, y, z); return l; };

// --- 7 · quantization --------------------------------------------------------
const quant = {
  id: 'quant',
  title: 'Quantization: shrink the bytes',
  where: (s) => `Chapter 7 · ${prec(s.precision).label} — ${prec(s.precision).bytes} byte${prec(s.precision).bytes === 1 ? '' : 's'} per weight`,
  duration: 36,
  legend: 'mem',
  uses: ['quant'],
  article: ARTICLES.quant,
  beats: [
    { at: 0.00, h: 'The only currency is bytes',
      p: 'Decode time is bytes ÷ bandwidth, and the bandwidth is fixed in silicon. That leaves one lever: <b>make the bytes fewer</b>. Store each weight in 8 bits, or 4, instead of 16 — the same seven billion numbers, at lower resolution.' },
    { at: 0.16, h: 'Half the bytes, twice the tokens',
      p: (s) => { const d1 = decodeStep({ batch: 1, precision: s.precision }); return `You are at ${prec(s.precision).label}: ${fmtBytes(weightBytes(s.precision))} of weights, ${(d1.seconds * 1e3).toFixed(2)} ms a token, ${fmtInt(d1.perUserTokensPerSec)} tok/s. Press <b>Q</b> and watch every memory-bound number move together — fp16 → int8 → int4 runs 207 → 415 → 830 tok/s. Nothing else in this film is that clean a trade.`; } },
    { at: 0.36, h: 'How: integers plus a scale',
      p: 'The mechanism is humble: a group of weights shares one floating-point <b>scale</b>; each weight becomes a small integer times that scale. The integers travel over the wire; the cores dequantize into registers and the matmul still runs in 16-bit math. Fewer bytes in flight, same arithmetic.' },
    { at: 0.55, h: 'The enemy: outliers',
      p: 'Watch the number line: values snap to the nearest rung of the integer grid, and the error is tiny — until one <b>outlier</b> stretches the scale and crowds everyone else onto a few rungs. This is why naive quantization breaks, and why real methods use per-group scales and calibration: GPTQ rounds so errors cancel; AWQ protects the channels activations actually use.' },
    { at: 0.74, h: 'The capacity dividend',
      p: (s) => `Shrinking weights pays twice: the sweep gets faster <i>and</i> HBM opens up. At ${prec(s.precision).label} the box holds <b>${maxSeqFit(s.precision)} full-context sequences</b> beside the weights (fp16: 30 · int8: 67 · int4: 142). Quantization is also how our batch-32 overflow from last chapter becomes possible at all.` },
    { at: 0.90, h: 'What it costs',
      p: 'Precision is model quality, spent deliberately. Weight-only int8 is usually free; int4 costs a little; pushing activations low is where cliffs live. And on H100, FP8 is special — the tensor cores run it natively at double FLOPs. Evals, not vibes, decide how far to push.' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);
    sm.setActivity(0.02);

    const capTag = put(htmlLabel(''), HBM_X, 14.5, 0);
    root.add(capTag);

    // number line: continuous values snapping to an integer grid
    const line = new THREE.Group();
    line.position.set(0, -9, 14);
    root.add(line);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x8a98ab }));
    line.add(bar);
    const NT = 9, ticks = [];
    for (let i = 0; i < NT; i++) {
      const tk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xc9d4e0 }));
      line.add(tk); ticks.push(tk);
    }
    const NV = 16, vals = [], r = rng(11);
    for (let i = 0; i < NV; i++) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12),
        new THREE.MeshStandardMaterial({ color: COL.weights, emissive: COL.weights, emissiveIntensity: 0.5 }));
      const x0 = (r() * 2 - 1) * 10;
      vals.push({ m: v, x0, y0: 2.2 + r() * 1.5 });
      line.add(v);
    }
    const outlier = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12),
      new THREE.MeshStandardMaterial({ color: COL.reject, emissive: COL.reject, emissiveIntensity: 0.7 }));
    outlier.visible = false;
    line.add(outlier);
    const lineTag = put(htmlLabel('', 'muted'), 0, -3.2, 0);
    line.add(lineTag);

    inspector.track(hbm.weights, `<b>Weights, quantized</b> — same 7B numbers; the Q toggle changes only how many bytes each one costs on the wire.`);
    inspector.track(hbm.kv, '<b>The capacity dividend</b> — every gigabyte the weights give back becomes room for more concurrent users’ KV.');
    inspector.track(bar, '<b>An int grid</b> — a shared scale × small integers. The grid’s reach is set by the largest value it must cover.');
    inspector.track(outlier, '<b>An outlier</b> — one huge value stretches the scale, crushing everyone else’s resolution. Calibration exists because of these.');

    const grid = (stretch) => {
      const span = 10 * stretch;
      ticks.forEach((tk, i) => { tk.position.x = ((i / (NT - 1)) * 2 - 1) * span; });
      bar.scale.x = (span + 1.5) / 12;    // the bar grows with the grid it carries
      return span;
    };

    return {
      root,
      update(t, dt, elapsed) {
        // capacity fill: KV lanes multiply into the freed space
        const fill = ease(win(t, 0.7, 0.92));
        const count = Math.round(maxSeqFit(s.precision) * fill);
        hbm.set({ weightsBytes: weightBytes(s.precision),
          kvSeqBytes: Array.from({ length: count }, () => kvBytesPerSeq(s.precision)) });
        capTag.userData.el.innerHTML = t > 0.72
          ? `${count} sequences fit<span class="sub">at ${prec(s.precision).label}</span>`
          : `weights ${fmtBytes(weightBytes(s.precision))}<span class="sub">${prec(s.precision).label}</span>`;

        // number line: snap, then the outlier arrives and stretches the grid
        const snap = ease(win(t, 0.38, 0.52));
        const stretched = ease(win(t, 0.58, 0.68));
        const span = grid(1 + stretched * 0.9);
        const step = (2 * span) / (NT - 1);
        for (const v of vals) {
          const target = Math.round((v.x0 * (1 - stretched * 0.55)) / step) * step;
          v.m.position.x = v.x0 + (target - v.x0) * snap;
          v.m.position.y = v.y0 * (1 - snap) + 0.55 * snap;
        }
        outlier.visible = t > 0.57;
        outlier.position.set(span, 0.55, 0);
        lineTag.userData.el.innerHTML = t < 0.58
          ? 'values snap to the nearest rung'
          : 'one outlier stretches the whole grid';

        bus.set(0.35);
        bus.update(dt);
        sm.update(elapsed);

        const d = decodeStep({ batch: 1, precision: s.precision });
        ctx.hud.set({ rows: [
          ['precision', `${prec(s.precision).label} — ${prec(s.precision).bytes} B/weight`],
          ['weights', fmtBytes(weightBytes(s.precision))],
          ['decode b1', `${(d.seconds * 1e3).toFixed(2)} ms · ${fmtInt(d.perUserTokensPerSec)} tok/s`],
          ['capacity', `${maxSeqFit(s.precision)} sequences @ ${fmtInt(CTX)} ctx`],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [-12, 10, 64], target: [-10, 0, 0], fov: 46 },
        { at: 0.38, pos: [0, -1, 44], target: [0, -8, 12], fov: 46 },
        { at: 0.70, pos: [2, -2, 42], target: [0, -8, 13], fov: 46 },
        { at: 0.88, pos: [-18, 10, 52], target: [HBM_X + 4, 0, 0], fov: 46 },
        { at: 1.00, pos: [-4, 12, 66], target: [-6, -2, 0], fov: 46 },
      ]),
    };
  },
};

// --- 8 · speculative decoding ------------------------------------------------
const ACCEPT_PATTERNS = { 0.9: [4, 3, 4, 4, 2, 4, 4, 3, 4, 4], 0.7: [2, 1, 3, 1, 2, 1, 3, 1, 2, 2], 0.4: [1, 0, 1, 2, 0, 1, 0, 1, 0, 1] };

const spec = {
  id: 'spec',
  title: 'Speculative decoding',
  where: (s) => `Chapter 8 · ${s.spec ? `draft k=4, acceptance ${s.spec}` : 'speculation off'}`,
  duration: 40,
  legend: 'tok',
  uses: ['spec', 'quant'],
  article: ARTICLES.spec,
  beats: [
    { at: 0.00, h: 'Batching never helped you',
      p: 'Throughput tricks share the machine among <i>more</i> users; the single user typing at a chatbot got nothing — at batch 32 they got slower. To make <b>one person’s</b> tokens come faster, something else is needed. Look back at the idle 99.7% of the cores. That is unspent money.' },
    { at: 0.16, h: 'Verification is nearly free',
      p: 'The key asymmetry: checking k+1 candidate tokens in one forward pass costs the <i>same 14 GB sweep</i> as generating one — a few extra rows of math riding a read that was happening anyway. It is a miniature prefill. Generating serially is expensive; judging in parallel is not.' },
    { at: 0.34, h: 'So let something small guess',
      p: (s) => `A draft model ~1/20th the size (${fmtBytes(DRAFT.params * prec(s.precision).bytes)} of weights) burns through <b>k = ${DRAFT.k} quick guesses</b> — all four together cost ${(DRAFT.k * DRAFT.params * prec(s.precision).bytes / GPU.bandwidth * 1e3).toFixed(2)} ms of memory traffic. The guesses are cheap and often right: language is full of boilerplate the small model nails.` },
    { at: 0.52, h: 'One sweep judges them all',
      p: 'The target model runs a single pass over all the guesses at once. The longest agreeing prefix is <b>accepted</b>; the first disagreement is replaced by the target’s own choice — the <i>bonus token</i> — and the rest are discarded. With rejection-sampling acceptance, the output distribution is <b>mathematically identical</b> to the target model alone. Speculation cannot make the model dumber. Only faster or slower.' },
    { at: 0.72, h: 'The arithmetic of luck',
      p: (s) => { const one = { ...s, batch: 1 }; return s.spec
        ? `Expected tokens per cycle: 1 + a + a² + a³ + a⁴. At acceptance a=${s.spec} that is <b>${specYield(s.spec).toFixed(2)} tokens</b> per ~${(throughput(one).seconds * 1e3).toFixed(1)} ms cycle — <b>${fmtInt(throughput(one).perUserTokensPerSec)} tok/s, ${fmtX(throughput(one).specMult)} faster</b> for that one user. Press S to change the acceptance rate: predictable text (code, forms) sits near 0.9; freewheeling prose sinks toward 0.4.`
        : 'Speculation is off. Press <b>S</b> to pick an acceptance rate and watch the same cycle with guesses in flight.'; } },
    { at: 0.90, h: 'Nothing is free',
      p: 'Total FLOPs and energy go <i>up</i> — the draft runs, and rejected positions are wasted work. Speculation converts idle compute into latency; when the batch is already large there is no idle compute to spend, and it stops paying. The deep dive covers EAGLE, Medusa, and tree speculation.' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const a = s.spec;
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);
    hbm.set({ weightsBytes: weightBytes(s.precision), kvSeqBytes: [kvBytesPerSeq(s.precision)] });

    // the draft model: a small pink resident above the gold block
    const draftBytes = DRAFT.params * prec(s.precision).bytes;
    const draftSlab = new THREE.Mesh(new THREE.BoxGeometry(14.8, Math.max(0.3, gbH(draftBytes)), 9.8),
      new THREE.MeshStandardMaterial({ color: COL.draft, emissive: COL.draft, emissiveIntensity: 0.4, roughness: 0.4 }));
    draftSlab.position.set(HBM_X, -11 + gbH(weightBytes(s.precision)) + 1.2, 0);
    root.add(draftSlab);
    root.add(put(htmlLabel(`draft model<span class="sub">${fmtBytes(draftBytes)}</span>`, 'muted'), HBM_X - 11, -6, 0));

    const bigSweep = makeSweep(weightBytes(s.precision));
    const smallSweep = makeSweep(draftBytes, COL.draft);
    root.add(bigSweep.mesh, smallSweep.mesh);

    // the sequence: committed tokens, then the k guesses awaiting judgement
    const seq = new THREE.Group();
    seq.position.set(0, -14, 8);
    root.add(seq);
    const committed = [];
    for (let i = 0; i < 8; i++) {
      const c = tokenChip(COL.core, 1.3);
      c.material = c.material.clone();
      seq.add(c); committed.push(c);
    }
    const ghosts = [];
    for (let i = 0; i < DRAFT.k; i++) {
      const g = tokenChip(COL.draft, 1.3);
      g.material = g.material.clone();
      g.material.transparent = true;
      seq.add(g); ghosts.push(g);
    }
    const bonus = tokenChip(COL.token, 1.3);
    bonus.material.transparent = true;
    seq.add(bonus);
    const layout = () => {
      committed.forEach((c, i) => c.position.set((i - committed.length) * 1.8, 0, 0));
      ghosts.forEach((g, i) => g.position.set((i + 0.4) * 1.8, 0, 0));
      bonus.position.set((ghosts.length + 0.6) * 1.8, 0, 0);
    };
    layout();
    const cycleTag = put(htmlLabel(''), 0, -18.2, 8);
    root.add(cycleTag);

    inspector.track(draftSlab, '<b>The draft model</b> — a 0.35B sidekick living beside the 7B target. Cheap to sweep, right often enough.');
    inspector.track(sm.mesh, '<b>The idle FLOPs</b> — speculation’s bankroll. Verifying five positions costs barely more math than one, and math was never the limit.');
    ghosts.forEach((g) => inspector.track(g, '<b>A drafted token</b> — provisional until the target model’s one sweep judges the whole run of guesses.'));

    // this chapter is the single-user story: batch is pinned to 1 regardless
    // of what the batching chapter left in the shared state
    const T = () => throughput({ ...s, batch: 1 });
    const draftMs = () => DRAFT.k * DRAFT.params * prec(s.precision).bytes / GPU.bandwidth * 1e3;
    let cyc = 0, phase = 0;
    return {
      root,
      update(t, dt, elapsed) {
        const period = clamp(T().seconds * 500, 1.6, 4.5);
        phase += dt / period;
        if (phase >= 1) { phase %= 1; cyc++; }
        const accepted = a ? ACCEPT_PATTERNS[a][cyc % 10] : 0;

        if (a) {
          // phase A: k draft mini-sweeps · B: one target sweep · C: judgement
          const draftP = win(phase, 0, 0.34), judge = win(phase, 0.62, 0.8);
          smallSweep.at(phase < 0.34 ? (phase * DRAFT.k / 0.34) % 1 : 0);
          bigSweep.at(phase >= 0.36 && phase < 0.62 ? (phase - 0.36) / 0.26 : 0);
          ghosts.forEach((g, i) => {
            const born = clamp(draftP * DRAFT.k - i, 0, 1);
            const dead = judge > 0 && i >= accepted;
            const kept = judge > 0 && i < accepted;
            g.material.opacity = born * (dead ? 1 - judge : 1);
            g.material.color.setHex(kept ? COL.core : dead ? COL.reject : COL.draft);
            g.material.emissive.setHex(kept ? COL.core : dead ? COL.reject : COL.draft);
            g.position.y = dead ? -judge * 3 : 0;
          });
          bonus.material.opacity = judge;
          cycleTag.userData.el.innerHTML =
            `cycle: ${DRAFT.k} guesses + 1 sweep → <b>${accepted + 1} tokens</b><span class="sub">acceptance ${a} · slowed ×500</span>`;
        } else {
          bigSweep.at(phase);
          ghosts.forEach((g) => { g.material.opacity = 0; });
          bonus.material.opacity = phase > 0.9 ? 1 : 0;
          cycleTag.userData.el.innerHTML = 'plain decode: one sweep, one token<span class="sub">press S for speculation</span>';
        }

        bus.set(1);
        bus.update(dt);
        sm.setActivity(a ? (phase >= 0.36 && phase < 0.62 ? 0.06 : 0.01) : 0.008);
        sm.update(elapsed);

        const rows = a ? [
          ['acceptance', `a = ${a}`],
          ['yield', `${specYield(a).toFixed(2)} tokens / cycle  (1+a+a²+a³+a⁴)`],
          ['per user', `${fmtInt(T().perUserTokensPerSec)} tok/s — ${fmtX(T().specMult)} vs plain`],
          ['cycle', `${(T().seconds * 1e3).toFixed(2)} ms  (draft ${draftMs().toFixed(2)} + target ${(decodeStep({ batch: 1, precision: s.precision }).seconds * 1e3).toFixed(2)})`],
          ['total FLOPs', 'UP — idle compute spent on latency'],
        ] : [
          ['speculation', 'off — press S'],
          ['per user', `${fmtInt(T().perUserTokensPerSec)} tok/s`],
        ];
        ctx.hud.set({ rows });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 8, 74], target: [0, -2, 0], fov: 46 },
        { at: 0.30, pos: [-16, 2, 50], target: [HBM_X + 8, -6, 0], fov: 46 },
        { at: 0.60, pos: [8, 0, 44], target: [0, -12, 8], fov: 46 },
        { at: 1.00, pos: [0, 10, 78], target: [0, -4, 0], fov: 46 },
      ]),
    };
  },
};

// --- 9 · the roofline --------------------------------------------------------
const roofline = {
  id: 'roofline',
  title: 'The map of everything',
  where: (s) => `Chapter 9 · batch ${s.batch} · ${prec(s.precision).label}${s.spec ? ` · spec a=${s.spec}` : ''}`,
  duration: 40,
  legend: null,
  uses: ['batch', 'quant', 'spec'],
  article: ARTICLES.roofline,
  beats: [
    { at: 0.00, h: 'One chart holds the film',
      p: 'The <b>roofline</b>. Across: arithmetic intensity — FLOPs of work per byte moved, on a log scale. Up: achievable speed. No workload can escape the two ceilings: the slanted <b>memory roof</b> (intensity × 3.35 TB/s) and the flat <b>compute roof</b> (989 TFLOP/s). They meet at the ridge: 295.' },
    { at: 0.20, h: 'Decode lives in the corner',
      p: 'Plain decode sits at the far bottom-left — intensity below 1, pinned to the memory slope, using a fraction of a percent of the machine. Prefill sits past the ridge on the flat roof, compute-bound. <b>The whole economics of inference is the distance between those two dots.</b>' },
    { at: 0.42, h: 'Every technique is a move on this map',
      p: 'Batching slides decode right along the memory roof — more math per byte, same wire. Quantization shrinks the bytes so the same position pays out more tokens. <b>This is the playground: drag to orbit, and work the B, Q, S buttons — the bright dot is your current configuration, live.</b>' },
    { at: 0.66, h: 'Speculation farms the empty sky',
      p: (s) => s.spec
        ? `The gap between the dot and the roofs is idle compute. Speculative decoding doesn’t move the dot — it harvests the gap: the beam shows ${fmtX(throughput(s).specMult)} useful tokens per sweep at acceptance ${s.spec}.`
        : 'The gap between the dot and the roofs is idle compute — speculation’s bankroll. Press S to see it harvested.' },
    { at: 0.84, h: 'Same silicon, opposite corners',
      p: 'A chat product buys latency: small batches, speculation, aggressive quantization. A batch API sells throughput: huge batches, no speculation. Identical hardware, opposite corners of this chart — and that is why batch tokens are priced at roughly half. The deep dive closes the story: multiple GPUs, MoE, and where to read next.' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const root = new THREE.Group();
    const R = rooflinePlot();
    root.add(R.group);

    const perf = (d) => d.flops / d.seconds;
    const ghost = (state, txt) => {
      const d = decodeStep(state);
      const g = R.dot(0x56637a, `<span class="sub">${txt}</span>`);
      g.move(d.intensity, perf(d));
      g.label.position.set(0, -1.9, 0);   // below the dot: the live dot labels above
      g.sphere.material.transparent = true;
      g.sphere.material.opacity = 0.5;
      g.sphere.scale.setScalar(0.7);
      return g;
    };
    ghost({ batch: 1, precision: 'fp16' }, 'decode b1 · fp16');
    ghost({ batch: 8, precision: 'fp16' }, 'b8');
    ghost({ batch: 32, precision: 'fp16' }, 'b32');

    // the batching road: the path a growing batch walks along the memory roof,
    // with a pulse forever making the trip b1 → b32
    const roadStops = [1, 2, 4, 8, 16, 32].map((b) => {
      const d = decodeStep({ batch: b, precision: 'fp16' });
      return new THREE.Vector3(R.X(d.intensity), R.Y(perf(d)), 0);
    });
    const roadCurve = new THREE.CatmullRomCurve3(roadStops);
    const road = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(roadCurve.getPoints(50)),
      new THREE.LineDashedMaterial({ color: COL.core, transparent: true, opacity: 0.3, dashSize: 0.5, gapSize: 0.4 }));
    road.computeLineDistances();
    root.add(road);
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12),
      new THREE.MeshStandardMaterial({ color: COL.core, emissive: COL.core, emissiveIntensity: 1 }));
    root.add(pulse);
    inspector.track(road, '<b>The batching road</b> — where decode moves as the batch grows 1 → 32. Always along the memory roof, never past the ridge.');
    const pf = prefill({ promptTokens: 512 });
    const pfDot = R.dot(COL.weights, 'prefill 512<span class="sub">compute-bound</span>');
    pfDot.move(pf.intensity, pf.flops / pf.seconds);

    const cur = R.dot(COL.core, '');
    const dNow = decodeStep(s);
    cur.move(dNow.intensity, perf(dNow));

    // speculation: a beam rising from the current dot — tokens minted from idle sky
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 10),
      new THREE.MeshStandardMaterial({ color: COL.draft, emissive: COL.draft,
        emissiveIntensity: 0.8, transparent: true, opacity: 0.65 }));
    beam.visible = false;
    cur.group.add(beam);

    inspector.track(cur.sphere, '<b>You are here</b> — this dot re-derives from the machine model every time a toggle changes.');
    inspector.track(pfDot.sphere, '<b>Prefill</b> — the one phase that reaches the compute roof.');

    return {
      root,
      update(t, dt, elapsed) {
        pulse.position.copy(roadCurve.getPoint((elapsed * 0.12) % 1));
        const d = decodeStep(s);
        cur.move(d.intensity, perf(d));
        cur.sphere.scale.setScalar(1 + 0.18 * Math.sin(elapsed * 3));
        const T = throughput(s);
        cur.retitle(`you are here<span class="sub">b${s.batch} · ${prec(s.precision).label} · ${fmtInt(T.tokensPerSec)} tok/s${s.spec ? ` · spec ${fmtX(T.specMult)}` : ''}</span>`);

        beam.visible = !!s.spec && t > 0.6;
        if (beam.visible) {
          const h = 3.2 * Math.log2(T.specMult + 1) + 1.2;
          beam.scale.y = h;
          beam.position.y = h / 2 + 0.6;
        }

        const need = weightBytes(s.precision) + s.batch * kvBytesPerSeq(s.precision);
        ctx.hud.set({ rows: [
          ['config', `batch ${s.batch} · ${prec(s.precision).label} · ${s.spec ? `spec a=${s.spec}` : 'no spec'}`],
          ['intensity', d.intensity.toFixed(2) + ' FLOPs/B'],
          ['throughput', `${fmtInt(T.tokensPerSec)} tok/s · ${fmtInt(T.perUserTokensPerSec)} per user`],
          ['machine used', (d.utilization * 100).toFixed(2) + '% of peak compute'],
        ], warn: need > GPU.hbm ? 'this config does not fit in HBM' : null });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 2, 56], target: [0, 0, 0], fov: 46 },
        { at: 0.25, pos: [-16, -4, 40], target: [-14, -8, 0], fov: 46 },
        { at: 0.50, pos: [10, 6, 46], target: [4, 2, 0], fov: 46 },
        { at: 0.80, pos: [-4, 0, 38], target: [0, -2, 0], fov: 46 },
        { at: 1.00, pos: [0, 4, 58], target: [0, 0, 0], fov: 46 },
      ]),
    };
  },
};

export const act3 = [quant, spec, roofline];
