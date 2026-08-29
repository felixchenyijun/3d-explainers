// main.js — wires the biology into the film engine. All of the generic
// machinery (renderer, director, transport, camera) lives in ../engine.
import { createFilm } from '../engine/film.js';
import { ACT1 } from './act1.js';
import { ACT2 } from './act2.js';
import { renderHud, LEGENDS } from './hud.js';
import { normalize } from './speech.js';

createFilm({
  title: 'Protein Synthesis',
  subtitle: 'Human <i>HBB</i> · chromosome 11',
  chapters: [...ACT1, ...ACT2],
  state: { mutated: false },
  legends: LEGENDS,
  renderHud,

  intro: {
    eyebrow: 'Molecular biology, rendered',
    headline: 'How your cells<br>build a <em>protein</em>',
    body: `Ten chapters in 3D, following one real gene — <b>HBB</b>, the beta chain of
           haemoglobin — from packed DNA on chromosome 11, through RNA polymerase and the
           ribosome, to a folded machine that carries oxygen. Then we break it with a
           single letter.`,
  },

  toggles: [{
    id: 'mutate',
    key: 'm',
    title: 'Re-run everything with the sickle-cell mutation',
    label: (s) => 'Mutation: ' + (s.mutated ? 'HbS' : 'off'),
    active: (s) => s.mutated,
    onClick: (film) => { film.state.mutated = !film.state.mutated; film.reload(); },
  }],

  // Read aloud, the narration needs about twice the silent running time, so the
  // engine stretches each chapter to fit its own beats rather than rushing the
  // voice. Silent: 6:38. Narrated: ~11 min.
  voice: {
    lang: 'en-GB',
    preferred: ['Serena', 'Daniel', 'Arthur', 'Samantha'],
    normalize,
    targetRate: 1.15,
  },

  camera: { fov: 46, near: 0.1, far: 4000, start: [40, 30, 235], min: 4, max: 700 },
  scene: { background: 0x05080d, fog: 0.0035 },

  // nucleoplasm is purple, cytosol is blue; chapter 1 looks at the cell from
  // outside, so no motes there
  ambient: {
    count: 2600,
    for: (i) => ({ visible: i >= 1, color: i <= 4 ? 0x9b7bff : 0x7fb8e8 }),
  },
});
