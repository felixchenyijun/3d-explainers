// Act 2 — the two phases of inference and the first great trick:
// prefill (compute-bound), decode (memory-bound), and batching.
import * as THREE from 'three';
import { camPath, win, ease, htmlLabel, clamp } from '../engine/gfx.js';
import { hbmBox, smPanel, busFlow, makeSweep, tokenChip, inspector, COL, HBM_X, SM_X, gbH } from './viz.js';
import { GPU, MODEL, ridge, prec, weightBytes, kvBytesPerToken, kvBytesPerSeq, maxSeqFit, decodeStep, prefill, CTX, fmtBytes, fmtInt } from './machine.js';
import { ARTICLES } from './articles.js';

const put = (l, x, y, z) => { l.position.set(x, y, z); return l; };
const PROMPT = 512;

// --- 4 · prefill -------------------------------------------------------------
const prefillCh = {
  id: 'prefill',
  title: 'Prefill: one tall matmul',
  where: 'Chapter 4 · the prompt, all at once',
  duration: 32,
  legend: 'tok',
  uses: ['quant'],
  article: ARTICLES.prefill,
  beats: [
    { at: 0.00, h: 'The prompt arrives whole',
      p: `Your ${PROMPT}-token prompt is fully known before the model says a word — so nothing forces the GPU to take it one token at a time. All ${PROMPT} tokens enter together, as one tall matrix, ${PROMPT} rows deep.` },
    { at: 0.22, h: 'The weight read is shared',
      p: 'Here is the trick that defines this phase: each weight matrix is fetched from HBM <b>once</b>, and all 512 rows multiply through it before it is let go. The cost of the read is split 512 ways. Arithmetic intensity scales with the number of rows.' },
    { at: 0.45, h: 'Past the ridge',
      p: (s) => `At ${PROMPT} tokens the intensity is ≈${Math.round(prefill({ promptTokens: PROMPT, precision: s.precision }).intensity)} FLOPs per byte — beyond the ridge of 295. For once, <b>the cores set the pace</b>, and the whole SM array burns. Note what this means for the Q toggle: shrinking bytes speeds up nothing here, because bytes were never the limit.` },
    { at: 0.68, h: 'First token in milliseconds',
      p: (s) => `The full pass — ${PROMPT} tokens through all 32 layers — takes ≈<b>${(prefill({ promptTokens: PROMPT, precision: s.precision }).seconds * 1e3).toFixed(1)} ms</b> on our ideal machine; 2,048 tokens would take ≈29 ms, which is 2×10¹⁵ FLOPs. This sets <b>TTFT</b>, time-to-first-token — the pause before the first word appears.` },
    { at: 0.86, h: 'The cache is born here',
      p: 'One more thing happened during that pass: every prompt token’s K and V were computed — and kept. Prefill writes the KV cache that decode will read. The blue columns are the prompt, remembered.' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);

    // the prompt: 512 chips as a 32×16 wall, riding the wire together
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.62, 0.25),
      new THREE.MeshStandardMaterial({ color: COL.core, emissive: COL.core,
        emissiveIntensity: 0.5, roughness: 0.4 }), PROMPT);
    const M = new THREE.Matrix4();
    root.add(wall);
    const wallTag = put(htmlLabel(`${PROMPT} prompt tokens<span class="sub">one matrix, ${PROMPT} rows</span>`), 0, 13, 0);
    root.add(wallTag);

    const first = tokenChip(COL.token, 2.0);
    first.visible = false;
    first.position.set(SM_X, -14, 6);
    root.add(first);
    const firstTag = put(htmlLabel('first token<span class="sub">TTFT</span>'), SM_X, -16.5, 6);
    firstTag.visible = false;
    root.add(firstTag);

    inspector.track(wall, `<b>The prompt</b> — ${PROMPT} tokens processed simultaneously. Together they repay one weight read with ${PROMPT} rows of math.`);
    inspector.track(sm.mesh, '<b>SMs at full burn</b> — prefill is the one phase where this machine is used as designed.');
    inspector.track(hbm.kv, '<b>KV being written</b> — prefill’s second job: remember every prompt token’s K,V for decode to use.');

    return {
      root,
      update(t, dt, elapsed) {
        const ride = ease(win(t, 0.06, 0.8));           // wall crosses the wire
        const wx = -46 + ride * (SM_X + 44 - 46 + 46);  // -46 → SM_X - 2
        for (let i = 0; i < PROMPT; i++) {
          const c = i % 16, r = (i / 16) | 0;
          M.setPosition(wx + (r % 4) * 0.12, (r / 2 - 7.5) * 0.72, (c - 7.5) * 1.05);
          wall.setMatrixAt(i, M);
        }
        wall.instanceMatrix.needsUpdate = true;
        wall.material.opacity = 1;
        wallTag.position.x = wx;
        wallTag.visible = t < 0.8;

        sm.setActivity(t < 0.06 ? 0 : t < 0.8 ? 1 : 0.2);
        sm.update(elapsed);
        bus.set(t < 0.8 ? 1 : 0.1);
        bus.update(dt);

        // the cache fills as the wall passes
        const kvProg = win(t, 0.1, 0.8);
        hbm.set({ weightsBytes: weightBytes(s.precision),
          kvSeqBytes: kvProg > 0 ? [kvBytesPerToken(s.precision) * PROMPT * kvProg * (CTX / PROMPT)] : [] });

        first.visible = t > 0.82;
        firstTag.visible = t > 0.82;
        first.scale.setScalar(1 + 0.15 * Math.sin(elapsed * 4));

        const pf = prefill({ promptTokens: PROMPT, precision: s.precision });
        ctx.hud.set({ rows: [
          ['prompt', `${PROMPT} tokens`],
          ['TTFT (ideal)', (pf.seconds * 1e3).toFixed(1) + ' ms'],
          ['intensity', `${Math.round(pf.intensity)} FLOPs/B  vs ridge ${Math.round(ridge())}`],
          ['bound by', 'COMPUTE — the cores set the pace'],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [-34, 8, 66], target: [-14, 0, 0], fov: 46 },
        { at: 0.45, pos: [0, 14, 62], target: [0, 0, 0], fov: 46 },
        { at: 0.85, pos: [30, 6, 52], target: [SM_X - 4, -4, 0], fov: 46 },
        { at: 1.00, pos: [10, 10, 70], target: [0, -2, 0], fov: 46 },
      ]),
    };
  },
};

// --- 5 · decode --------------------------------------------------------------
const decode = {
  id: 'decode',
  title: 'Decode: the 14 GB treadmill',
  where: (s) => `Chapter 5 · one user · ${prec(s.precision).label}`,
  duration: 38,
  legend: 'mem',
  uses: ['quant'],
  article: ARTICLES.decode,
  beats: [
    { at: 0.00, h: 'Now generate',
      p: 'The prompt is read; the model must speak. And here the parallelism dies: token N+1 depends on token N, which depended on N−1. The future cannot be computed alongside the present. Each output token is one full forward pass, alone.' },
    { at: 0.18, h: 'One token reads the whole model',
      p: (s) => `Watch a single step: a lone 1×4096 vector multiplies through every matrix in the ${fmtBytes(weightBytes(s.precision))} block — the <b>entire model crosses the wire</b> to produce one token. Each weight is fetched, used twice (a multiply and an add), and discarded.` },
    { at: 0.38, h: 'The wire is full. The cores are asleep.',
      p: (s) => `This is what memory-bound means, physically: the wire runs at its full 3.35 TB/s — saturated — while the tensor cores run at <b>${(decodeStep({ batch: 1, precision: s.precision }).utilization * 100).toFixed(2)}%</b> of their capacity. Intensity ≈${decodeStep({ batch: 1, precision: s.precision }).intensity.toFixed(1)} FLOPs per byte, against a ridge of 295. The machine is a quadrillion-op engine reduced to a memory pump.` },
    { at: 0.60, h: 'The ceiling',
      p: (s) => { const d = decodeStep({ batch: 1, precision: s.precision }); return `Time per token is just bytes ÷ bandwidth: (${fmtBytes(weightBytes(s.precision))} weights + ${fmtBytes(kvBytesPerSeq(s.precision))} KV) ÷ 3.35 TB/s ≈ <b>${(d.seconds * 1e3).toFixed(2)} ms</b> — a hard ceiling of <b>${fmtInt(d.perUserTokensPerSec)} tokens/s</b> for one user, before a single inefficiency. Real stacks get a fraction of this.`; } },
    { at: 0.78, h: 'Why batch-1 speed is a spec-sheet number',
      p: 'Nothing about this depends on compute. Two GPUs with the same memory bandwidth decode a 7B model at nearly the same speed, whatever their FLOPs. Decode latency is something you mostly <i>buy</i>, not engineer.' },
    { at: 0.90, h: 'Three ways out',
      p: 'The rest of the film is three attacks on this one picture: <b>share</b> the read across users (batching), <b>shrink</b> the read (quantization), or squeeze <b>more tokens per read</b> (speculative decoding).' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);
    hbm.set({ weightsBytes: weightBytes(s.precision), kvSeqBytes: [kvBytesPerSeq(s.precision)] });

    const sweep = makeSweep(weightBytes(s.precision));
    root.add(sweep.mesh);
    const stepTag = put(htmlLabel(''), 0, 9, 0);
    root.add(stepTag);

    // output row: tokens accumulate under the SM panel
    const out = [];
    const outRoot = new THREE.Group();
    outRoot.position.set(SM_X - 2, -12, 6);
    root.add(outRoot);
    root.add(put(htmlLabel('output<span class="sub">one token per sweep</span>', 'muted'), SM_X - 2, -9.6, 6));

    inspector.track(sweep.mesh, '<b>One decode step</b> — the whole weight block, in flight. This happens for every single token the model utters.');
    inspector.track(sm.mesh, '<b>Tensor cores during decode</b> — ~99.7% idle. The math is trivial; the fetch is everything.');
    inspector.track(hbm.kv, '<b>This user’s KV cache</b> — also re-read every step, and growing by one token each time.');

    const d = () => decodeStep({ batch: 1, precision: s.precision });
    let phase = 0, made = 0;
    return {
      root,
      update(t, dt, elapsed) {
        const visPeriod = d().seconds * 500;            // 4.8 ms → 2.4 s on screen
        if (t > 0.14) {
          phase += dt / visPeriod;
          if (phase >= 1) {
            phase %= 1;
            made++;
            const c = tokenChip(COL.token, 1.3);
            c.material = c.material.clone();
            c.userData.born = elapsed;
            outRoot.add(c);
            out.push(c);
            if (out.length > 10) { const g = out.shift(); outRoot.remove(g); g.geometry.dispose(); g.material.dispose(); }
            out.forEach((m, i) => m.position.set((i - out.length + 1) * 1.9, 0, 0));
          }
          sweep.at(phase);
          // newborn tokens land with a pop, so each sweep visibly *pays out*
          for (const m of out) {
            const age = elapsed - (m.userData.born ?? 0);
            const pop = age < 0.45 ? 1 + 0.9 * Math.exp(-age * 7) : 1;
            m.scale.setScalar(pop);
            m.material.emissiveIntensity = 0.4 + (age < 0.45 ? 1.4 * Math.exp(-age * 6) : 0);
          }
        }
        stepTag.visible = t > 0.14;
        stepTag.userData.el.innerHTML =
          `sweep #${made + 1} — ${fmtBytes(weightBytes(s.precision) + kvBytesPerSeq(s.precision))} for one token<span class="sub">${(d().seconds * 1e3).toFixed(2)} ms · slowed ×500</span>`;

        bus.set(t > 0.14 ? 1 : 0.1);                    // saturated — that is the point
        bus.update(dt);
        sm.setActivity(t > 0.14 ? Math.max(0.008, d().utilization) : 0);
        sm.update(elapsed);

        ctx.hud.set({ rows: [
          ['per token', (d().seconds * 1e3).toFixed(2) + ' ms  (ideal)'],
          ['ceiling', fmtInt(d().perUserTokensPerSec) + ' tok/s · one user'],
          ['intensity', d().intensity.toFixed(2) + ' FLOPs/B  vs ridge ' + Math.round(ridge())],
          ['tensor cores', (d().utilization * 100).toFixed(2) + '% busy'],
          ['bound by', 'MEMORY — the wire sets the pace'],
        ] });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 10, 80], target: [0, 0, 0], fov: 46 },
        { at: 0.30, pos: [-6, 5, 56], target: [0, 0, 0], fov: 46 },
        { at: 0.55, pos: [26, 8, 60], target: [10, 0, 0], fov: 46 },
        { at: 1.00, pos: [0, 14, 84], target: [0, -2, 0], fov: 46 },
      ]),
    };
  },
};

// --- 6 · batching ------------------------------------------------------------
const batch = {
  id: 'batch',
  title: 'Batching: share the sweep',
  where: (s) => `Chapter 6 · batch ${s.batch} · ${prec(s.precision).label}`,
  duration: 38,
  legend: 'mem',
  uses: ['batch', 'quant'],
  article: ARTICLES.batch,
  beats: [
    { at: 0.00, h: 'The read is the cost — split it',
      p: (s) => `The 14 GB sweep happens either way; the question is how many tokens it buys. Run <b>${s.batch === 1 ? 'B' : s.batch} users’ decode steps in the same pass</b> and the weight read is shared: only the KV bytes are per-user. ${s.batch === 1 ? 'Press <b>B</b> below to raise the batch.' : `One sweep now yields ${s.batch} tokens.`}` },
    { at: 0.22, h: 'Throughput, bought with arithmetic',
      p: (s) => { const d = decodeStep(s); return `At batch ${s.batch} and ${prec(s.precision).label}, the step takes ${(d.seconds * 1e3).toFixed(1)} ms but emits ${s.batch} tokens: <b>${fmtInt(d.tokensPerSec)} tokens/s</b> of aggregate throughput. This arithmetic is why batch APIs cost roughly half of interactive ones — the provider is selling the same sweep several times.`; } },
    { at: 0.42, h: 'The price: every user is slower',
      p: (s) => { const d = decodeStep(s); return `Each sequence now waits for a longer step (more KV bytes in the sweep): per-user speed at batch ${s.batch} is <b>${fmtInt(d.perUserTokensPerSec)} tok/s</b>${s.batch > 1 ? ', down from 207 alone' : ''}. Batching converts latency into throughput. It never makes anyone faster.`; } },
    { at: 0.60, h: 'The wall is memory, again',
      p: (s) => { const fit = maxSeqFit(s.precision); const need = weightBytes(s.precision) + s.batch * kvBytesPerSeq(s.precision); return `Every ${fmtInt(CTX)}-token sequence carries ${fmtBytes(kvBytesPerSeq(s.precision))} of KV. Beside the weights, only <b>${fit} sequences fit</b> at ${prec(s.precision).label}. ${need > GPU.hbm ? `Batch ${s.batch} needs ${fmtBytes(need)} — <b>it does not fit</b>. The red overflow is real; try the Q toggle.` : `Batch ${s.batch} uses ${fmtBytes(need)} of 80 GB.`} Capacity, not compute, caps concurrency.`; } },
    { at: 0.78, h: 'Sequences come and go: continuous batching',
      p: 'Users don’t arrive in neat groups of 32. Static batches would idle every finished slot until the longest sequence ends. Modern servers re-form the batch <b>every step</b>: a sequence that finishes leaves immediately, a waiting one takes its slot mid-flight. Watch the lanes churn.' },
    { at: 0.92, h: 'And the memory gets paged',
      p: 'Growing, vanishing KV allocations fragment HBM. vLLM’s <b>PagedAttention</b> borrowed the OS playbook: KV lives in fixed-size pages, mapped on demand. The deep dive covers it, plus chunked prefill and prefill/decode disaggregation.' },
  ],
  build(ctx) {
    inspector.begin();
    const s = ctx.state;
    const root = new THREE.Group();
    const hbm = hbmBox(), sm = smPanel(), bus = busFlow();
    root.add(hbm.group, sm.group, bus.points);

    const B = s.batch;
    const fit = maxSeqFit(s.precision);
    const over = Math.max(0, B - fit);
    hbm.set({ weightsBytes: weightBytes(s.precision),
      kvSeqBytes: Array.from({ length: Math.min(B, fit) }, () => kvBytesPerSeq(s.precision)) });

    // overflow: KV that has nowhere to live
    let overBox = null;
    if (over > 0) {
      const needTotal = weightBytes(s.precision) + B * kvBytesPerSeq(s.precision);
      overBox = new THREE.Mesh(new THREE.BoxGeometry(10, gbH(over * kvBytesPerSeq(s.precision)), 8),
        new THREE.MeshStandardMaterial({ color: COL.reject, emissive: COL.reject,
          emissiveIntensity: 0.5, transparent: true, opacity: 0.5 }));
      overBox.position.set(HBM_X, 13 + gbH(over * kvBytesPerSeq(s.precision)) / 2, 0);
      root.add(overBox);
      root.add(put(htmlLabel(`${over} sequences don’t fit<span class="sub">${fmtBytes(over * kvBytesPerSeq(s.precision))} of KV · ${fmtBytes(needTotal - GPU.hbm)} past capacity</span>`, ''),
        HBM_X, 13 + gbH(over * kvBytesPerSeq(s.precision)) + 2, 0));
      inspector.track(overBox, `<b>Overflow</b> — ${over} sequences’ KV with no HBM to live in. Shrink bytes (Q) or shrink the batch (B).`);
    }

    // lanes: each user's sequence, staggered, churning (continuous batching)
    const laneRoot = new THREE.Group();
    laneRoot.position.set(0, -11, 8);
    root.add(laneRoot);
    const shown = Math.min(B, 8);
    const lanes = [];
    for (let i = 0; i < shown; i++) {
      const g = new THREE.Group();
      g.position.set(-8, 0, (i - (shown - 1) / 2) * 2.4);
      const chips = [];
      for (let j = 0; j < 10; j++) {
        const c = tokenChip(COL.core, 1.1);
        c.material = c.material.clone();
        c.material.transparent = true;
        c.position.x = j * 1.5;
        g.add(c); chips.push(c);
      }
      laneRoot.add(g);
      lanes.push({ g, chips, off: (i * 0.37) % 1 });
    }
    if (B > shown) {
      const more = put(htmlLabel(`+ ${B - shown} more lanes`, 'muted'), 14, -11, 0);
      root.add(more);
    }
    root.add(put(htmlLabel(`${B} sequence${B > 1 ? 's' : ''}, one sweep`, ''), -6, -8.4, 8));
    lanes.forEach((L) => inspector.track(L.g, '<b>One user’s sequence</b> — fills left to right as its tokens arrive; when it finishes, a waiting request takes the lane <i>that same step</i>.'));

    const sweep = makeSweep(weightBytes(s.precision));
    root.add(sweep.mesh);
    const d = () => decodeStep(s);
    let phase = 0;
    return {
      root,
      update(t, dt, elapsed) {
        const visPeriod = clamp(d().seconds * 250, 0.9, 6.5);
        phase += dt / visPeriod;
        const stepped = phase >= 1;
        if (stepped) phase %= 1;
        sweep.at(phase);

        for (const L of lanes) {
          // each lane is a sequence at its own stage of life; loop = leave + admit
          L.off += dt / (visPeriod * 14);
          const life = L.off % 1;
          const len = Math.floor(life * 10) + 1;
          L.chips.forEach((c, j) => {
            c.visible = j < len;
            c.material.opacity = j === len - 1 ? 0.55 + 0.45 * Math.sin(elapsed * 6) : 0.95;
            c.material.color.setHex(life > 0.96 ? COL.token : COL.core);
          });
        }

        bus.set(1);
        bus.update(dt);
        sm.setActivity(Math.max(0.01, d().utilization));
        sm.update(elapsed);
        if (overBox) overBox.material.opacity = 0.35 + 0.2 * Math.sin(elapsed * 2.5);

        const need = weightBytes(s.precision) + B * kvBytesPerSeq(s.precision);
        ctx.hud.set({ rows: [
          ['batch', `${B} sequences`],
          ['throughput', fmtInt(d().tokensPerSec) + ' tok/s aggregate'],
          ['per user', fmtInt(d().perUserTokensPerSec) + ' tok/s'],
          ['HBM', `${fmtBytes(need)} of ${fmtBytes(GPU.hbm)}  (max ${maxSeqFit(s.precision)} seqs @ ${prec(s.precision).label})`],
        ], warn: need > GPU.hbm ? `does not fit — ${fmtBytes(need - GPU.hbm)} over` : null });
      },
      camera: camPath([
        { at: 0.00, pos: [0, 10, 78], target: [0, -2, 0], fov: 46 },
        { at: 0.35, pos: [-20, 16, 60], target: [HBM_X + 6, 2, 0], fov: 46 },
        { at: 0.62, pos: [4, 2, 54], target: [0, -7, 6], fov: 46 },
        { at: 0.86, pos: [8, 0, 48], target: [0, -9, 8], fov: 46 },
        { at: 1.00, pos: [0, 12, 82], target: [0, -2, 0], fov: 46 },
      ]),
    };
  },
};

export const act2 = [prefillCh, decode, batch];
