// machine.js — the numbers. One GPU, one model, and every figure the film
// quotes — HUD, tooltips, narration — is derived here from first principles,
// so no two surfaces can ever disagree. All throughput figures are ideal upper
// bounds (bytes ÷ bandwidth, FLOPs ÷ peak); real stacks reach a fraction of
// them, but the *shape* of the numbers is what the film teaches.

export const GPU = {
  name: 'H100 SXM',
  tflops: 989e12,        // dense FP16/BF16 tensor-core peak, FLOP/s
  bandwidth: 3.35e12,    // HBM3, bytes/s
  hbm: 80e9,             // bytes
  sms: 132,              // streaming multiprocessors
};

// A Llama-2-7B-shaped model: full multi-head attention, so the KV cache is at
// its heaviest — 32 KV heads, no GQA relief.
export const MODEL = {
  name: '7B', params: 7e9,
  layers: 32, dModel: 4096, heads: 32, kvHeads: 32, headDim: 128,
};

// The draft model for speculative decoding: ~1/20th the size.
export const DRAFT = { params: 0.35e9, k: 4 };

export const PRECISIONS = [
  { id: 'fp16', label: 'FP16', bytes: 2 },
  { id: 'int8', label: 'INT8', bytes: 1 },
  { id: 'int4', label: 'INT4', bytes: 0.5 },
];
export const BATCHES = [1, 8, 32];
// S cycles acceptance rate; 0 = speculative decoding off.
export const SPEC_STEPS = [0, 0.9, 0.7, 0.4];

export const CTX = 4096;               // the context length the film assumes

// The ridge of the roofline: how many times each byte fetched from HBM must be
// used in math before the cores, not the memory, become the limit.
export const ridge = () => GPU.tflops / GPU.bandwidth;   // ≈ 295 FLOPs/byte

export const prec = (id) => PRECISIONS.find(p => p.id === id) ?? PRECISIONS[0];
export const weightBytes = (p) => MODEL.params * prec(p).bytes;

// K and V, one head_dim vector per KV head per layer per token.
// Q also sets KV precision — an honest simplification the narration states.
export const kvBytesPerToken = (p) =>
  2 * MODEL.layers * MODEL.kvHeads * MODEL.headDim * prec(p).bytes;
export const kvBytesPerSeq = (p, ctx = CTX) => kvBytesPerToken(p) * ctx;

// How many full-context sequences fit in HBM beside the weights.
export const maxSeqFit = (p, ctx = CTX) =>
  Math.max(0, Math.floor((GPU.hbm - weightBytes(p)) / kvBytesPerSeq(p, ctx)));

// Expected tokens from ONE target-model pass when the draft proposes k tokens
// with per-token acceptance a: 1 + a + a² + … + aᵏ (the +1 is the bonus token
// the verify pass emits even when everything is rejected).
export function specYield(a, k = DRAFT.k) {
  let y = 1;
  for (let i = 1; i <= k; i++) y += Math.pow(a, i);
  return y;
}

// --- one decode step, for the whole batch ----------------------------------
// Bytes moved: the weights once (shared by every sequence in the batch), plus
// each sequence's own KV cache. FLOPs: ~2 per parameter per sequence.
export function decodeStep({ batch = 1, precision = 'fp16', ctx = CTX } = {}) {
  const bytes = weightBytes(precision) + batch * kvBytesPerSeq(precision, ctx);
  const flops = 2 * MODEL.params * batch;
  const tMem = bytes / GPU.bandwidth;
  const tMath = flops / GPU.tflops;
  const t = Math.max(tMem, tMath);
  return {
    bytes, flops, seconds: t,
    intensity: flops / bytes,                  // FLOPs per byte, vs ridge()
    computeBound: tMath > tMem,
    utilization: Math.min(1, (flops / t) / GPU.tflops),
    tokensPerSec: batch / t,
    perUserTokensPerSec: 1 / t,
  };
}

// --- decode with everything applied -----------------------------------------
// state: { batch, precision, spec } where spec is the acceptance rate (0 = off).
// One speculative cycle = k cheap draft steps + one target step (which reads
// the same weights as a plain step; its idle FLOPs verify all k+1 positions in
// parallel). Yield is specYield(a) tokens. Total FLOPs go UP — spec decode
// spends spare compute to buy latency, it is never free.
export function throughput(state = {}) {
  const s = decodeStep(state);
  const a = state.spec || 0;
  if (!a) return { ...s, specMult: 1, specYield: 1 };
  const draftSeconds = DRAFT.k *
    (DRAFT.params * prec(state.precision).bytes) / GPU.bandwidth;
  const cycle = s.seconds + draftSeconds;
  const y = specYield(a);
  const perUser = y / cycle;
  return {
    ...s,
    seconds: cycle,
    tokensPerSec: (state.batch ?? 1) * perUser,
    perUserTokensPerSec: perUser,
    specMult: perUser * s.seconds,             // vs plain decode, same config
    specYield: y,
  };
}

export const BASELINE = { batch: 1, precision: 'fp16', spec: 0, ctx: CTX };
export const baseline = () => throughput(BASELINE);

// --- prefill ----------------------------------------------------------------
// N prompt tokens as one tall matmul: the weight read is shared by all N rows,
// so intensity ≈ N — past the ridge the cores set time-to-first-token.
export function prefill({ promptTokens = 512, precision = 'fp16', batch = 1 } = {}) {
  const flops = 2 * MODEL.params * promptTokens * batch;
  const bytes = weightBytes(precision) + batch * kvBytesPerToken(precision) * promptTokens;
  const tMath = flops / GPU.tflops, tMem = bytes / GPU.bandwidth;
  const t = Math.max(tMath, tMem);
  return { seconds: t, flops, bytes, intensity: flops / bytes, computeBound: tMath > tMem };
}

// --- formatting -------------------------------------------------------------
export const fmtBytes = (b) =>
  b >= 1e9 ? +(b / 1e9).toPrecision(3) + ' GB'
  : b >= 1e6 ? +(b / 1e6).toPrecision(3) + ' MB'
  : Math.round(b / 1e3) + ' KB';
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const fmtX = (x) => (x >= 10 ? Math.round(x) : +x.toPrecision(2)) + '×';
