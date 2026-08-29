// LLM inference infrastructure, from first principles.
// One idealized machine (machine.js) supplies every number; three global
// toggles — batch, precision, speculation — re-run the same moments under new
// assumptions. Substantial reading lives in the beats and in each chapter's
// deep-dive article; the 3D scene exists to make the numbers physical.
import { createFilm } from '../engine/film.js';
import { COL } from './viz.js';
import { BATCHES, PRECISIONS, SPEC_STEPS, prec } from './machine.js';
import { act1 } from './act1.js';
import { act2 } from './act2.js';
import { act3 } from './act3.js';

const state = { batch: 1, precision: 'fp16', spec: 0.7 };

const cycle = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
const usedHere = (kind) => (s, i, ch) => (ch.uses || []).includes(kind);

createFilm({
  title: 'LLM Inference',
  subtitle: 'the machine, from first principles',
  state,
  chapters: [...act1, ...act2, ...act3],
  toggles: [
    { id: 'tg-batch', key: 'b', title: 'Batch size — sequences decoded per weight sweep (B)',
      label: (s) => `batch ${s.batch}`,
      active: (s) => s.batch > 1,
      when: usedHere('batch'),
      onClick: (f) => { f.state.batch = cycle(BATCHES, f.state.batch); f.reload(); } },
    { id: 'tg-prec', key: 'q', title: 'Precision — bytes per stored weight (Q)',
      label: (s) => prec(s.precision).label,
      active: (s) => s.precision !== 'fp16',
      when: usedHere('quant'),
      onClick: (f) => { f.state.precision = cycle(PRECISIONS.map(p => p.id), f.state.precision); f.reload(); } },
    { id: 'tg-spec', key: 's', title: 'Speculative decoding — draft acceptance rate (S)',
      label: (s) => s.spec ? `spec a=${s.spec}` : 'spec off',
      active: (s) => s.spec > 0,
      when: usedHere('spec'),
      onClick: (f) => { f.state.spec = cycle(SPEC_STEPS, f.state.spec); f.reload(); } },
  ],
  legends: {
    mem: ['The machine', [
      ['model weights', COL.weights], ['KV cache', COL.kv],
      ['SM cores', COL.core], ['bytes in flight', 0xbfe3ff]]],
    tok: ['Tokens', [
      ['prompt / accepted', COL.core], ['draft (unverified)', COL.draft],
      ['rejected', COL.reject], ['output', COL.token]]],
  },
  renderHud: (d) => {
    const rows = d.rows.map(([lab, val]) =>
      `<div class="line"><span class="lab">${lab}</span><span class="seq">${val}</span></div>`).join('');
    const warn = d.warn ? `<div class="line"><span class="lab"></span><span class="seq" style="color:#ff6b6b">${d.warn}</span></div>` : '';
    return rows + warn;
  },
  intro: {
    eyebrow: 'An interactive explainer',
    headline: 'Why is <em>generating</em> text so hard?',
    body: 'A GPU that can do a quadrillion operations per second spends most of its life waiting on memory. This film builds LLM inference from first principles — prefill, decode, KV cache, batching, quantization, speculative decoding — on one honest machine whose every number you can check. Drag to orbit any scene; each chapter has a deep-dive article if you want the full story. Prefer reading? <a href="deep.html" style="color:var(--accent)">LLM Inference, Deeply — the written companion →</a>',
    cta: 'Begin',
  },
  camera: { fov: 46, near: 0.1, far: 2000, start: [0, 10, 95], min: 6, max: 400 },
  scene: { background: 0x05080d, fog: 0.0022 },
  ambient: { count: 1500, spread: [260, 160, 260], opacity: 0.35, for: () => ({ visible: true, color: 0x6f8fb8 }) },
  voice: {
    preferred: ['Daniel', 'Google UK English Male', 'Samantha'],
    normalize: (s) => [
      [/\bTB\/s\b/g, ' terabytes per second'], [/\bGB\b/g, ' gigabytes'],
      [/\bMB\b/g, ' megabytes'], [/\bKB\b/g, ' kilobytes'],
      [/\bTFLOP\/s\b/gi, ' teraflops per second'],
      [/\bFLOPs\/byte\b/g, ' flops per byte'], [/\bFLOPs\b/g, ' flops'], [/\bFLOP\b/g, ' flops'],
      [/\btok\/s\b/g, ' tokens per second'], [/\bms\b/g, ' milliseconds'],
      [/\bfp16\b/gi, 'F P sixteen'], [/\bint8\b/gi, 'int eight'], [/\bint4\b/gi, 'int four'],
      [/\bKV\b/g, 'K V'], [/\bSMs\b/g, 'streaming multiprocessors'], [/\bSM\b/g, 'streaming multiprocessor'],
      [/≫/g, ' far beyond '], [/·/g, ' '], [/⁴/g, ' to the fourth'], [/²/g, ' squared'],
      [/\ba=0\.9\b/g, 'acceptance zero point nine'], [/\ba=0\.7\b/g, 'acceptance zero point seven'],
      [/\ba=0\.4\b/g, 'acceptance zero point four'],
    ].reduce((t, [re, to]) => t.replace(re, to), s),
  },
});
