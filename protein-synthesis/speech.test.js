// node protein-synthesis/speech.test.js
// Checks the spoken form of every beat in the film, plus the tricky cases.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { applyRules, GENERIC } from '../engine/voice.js';
import { normalize } from './speech.js';

const say = (t) => normalize(applyRules(t, GENERIC)).replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();

const cases = [
  ['<b>protein</b> synthesis',        'protein synthesis'],
  ['built 5′→3′',                     'built 5 prime to 3 prime'],
  ['read 3′→5′',                      'read 3 prime to 5 prime'],
  ['<b>A↔U, T↔A</b>',                 'A pairs with U, T pairs with A'],
  ['GAG → GTG',                       'G A G to G T G'],
  ['the first <b>AUG</b>',            'the first A U G'],
  ['pre-mRNA still needs edits',      'pre-m R N A still needs edits'],
  ['a special <b>tRNA</b>',           'a special t R N A'],
  ['the <i>HBB</i> gene',             'the H B B gene'],
  ['starts with a Met on its front',  'starts with a methionine on its front'],
  ['roughly 20 µm across',            'roughly 20 micrometres across'],
  ['~14 bp unwound',                  'about 14 base pairs unwound'],
  ['carries four O₂ at a time',       'carries four oxygen at a time'],
  ['α₂β₂ · 4 haems',                  'alpha two beta two · 4 haems'],
  ['its TATA box',                    'its T A T A box'],
  ['about 120 MDa',                   'about 120 megadaltons'],
  ['the large (60S) subunit',         'the large (60 S) subunit'],
  ['Glu6Val (E6V)',                   'glutamate 6 valine (E 6 V)'],
  ['costs about 4 ATP',               'costs about 4 A T P'],
  ['the 5′ UTR',                      'the 5 prime U T R'],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = say(input);
  if (got !== want) { failed++; console.error(`  ✗ ${JSON.stringify(input)}\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`); }
}
assert.equal(failed, 0, `${failed} normalisation case(s) failed`);
console.log(`✓ ${cases.length} normalisation cases`);

// Every real beat must survive: no leftover markup, entities, or bare symbols.
const BEAT = /\b[hp]:\s*'((?:[^'\\]|\\.)*)'/g;
const beats = [];
for (const f of ['act1.js', 'act2.js']) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const m of src.matchAll(BEAT)) beats.push(m[1].replace(/\\'/g, "'"));
}
assert.ok(beats.length > 40, `expected the film's beats, found ${beats.length}`);

const BANNED = /[<>&]|[′↔→←×~≈µμ°αβ₀-₄]|\b(mRNA|tRNA|rRNA|HBB|UTR|bp|nt|MDa|Met)\b|\b[ACGTU]{3,6}\b/;
let dirty = 0;
for (const b of beats) {
  const spoken = say(b);
  const hit = spoken.match(BANNED);
  if (hit) { dirty++; console.error(`  ✗ leftover ${JSON.stringify(hit[0])} in: ${spoken.slice(0, 90)}…`); }
}
assert.equal(dirty, 0, `${dirty} beat(s) still contain unspeakable text`);
console.log(`✓ ${beats.length} beats normalise cleanly`);

const words = beats.reduce((n, b) => n + say(b).split(' ').length, 0);
console.log(`  ${words} spoken words, ~${Math.round(words / 2.9 / 60)} min of narration at 1x`);
