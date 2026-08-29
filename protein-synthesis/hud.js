// hud.js — the sequence readout and colour legends. Everything here is about
// nucleic acids; the engine just asks for HTML.
import { AA, aaColor, BASE_COLOR, AA_CLASS_COLOR } from './bio.js';
import { hex } from '../engine/film.js';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };

function seqSpans(seq, { from = 0, to = 1e9, dimOutside = true, group = 0, curFrom = -1, curTo = -1 } = {}) {
  let out = '';
  for (let i = 0; i < seq.length; i++) {
    if (group && i > 0 && i % group === 0) out += ' ';
    const inside = i >= from && i < to;
    const cls = [];
    if (dimOutside && !inside) cls.push('dim');
    if (i >= curFrom && i < curTo) cls.push('cur');
    const col = inside ? hex(BASE_COLOR[seq[i]] ?? 0x8a98ab) : '';
    out += `<span class="${cls.join(' ')}"${col ? ` style="color:${col}"` : ''}>${seq[i]}</span>`;
  }
  return out;
}

function aaChips(letters, total = 0) {
  let out = '';
  letters.forEach((l) => {
    const info = AA[l] || AA['*'];
    out += `<span class="aa" style="background:${hex(aaColor(l))}">${info.three}</span>`;
  });
  for (let i = letters.length; i < total; i++) out += `<span class="aa pend" style="background:#8a98ab">···</span>`;
  return out;
}

const row = (lab, body) => `<div class="line"><span class="lab">${lab}</span><span class="seq">${body}</span></div>`;

export function renderHud(d) {
  switch (d.mode) {
    case 'dna':
      return row('DNA 5′→3′', seqSpans(d.dna, {}))
           + row('template 3′→5′', seqSpans([...d.dna].map(b => COMPLEMENT[b]).join(''), {}));

    case 'transcription':
      return row('DNA coding', seqSpans(d.dna, { from: d.tss }))
           + row('mRNA 5′→3′',
                 `<span class="dim">${'·'.repeat(d.tss)}</span>${seqSpans(d.rna, {})}` +
                 `<span class="dim">${'·'.repeat(Math.max(0, d.rnaLen - d.rna.length))}</span>`);

    case 'translation': {
      const c = d.codonIndex, from = d.utr + c * 3;
      return row('mRNA', seqSpans(d.mrna, { curFrom: c >= 0 ? from : -1, curTo: c >= 0 ? from + 3 : -1 }))
           + row('protein', aaChips(d.peptide, 12));
    }

    case 'protein':
      return row('protein', aaChips(d.peptide));

    default:
      return null;
  }
}

export const LEGENDS = {
  bases: ['Nucleotide bases', [
    ['A adenine', BASE_COLOR.A], ['T / U thymine · uracil', BASE_COLOR.T],
    ['G guanine', BASE_COLOR.G], ['C cytosine', BASE_COLOR.C]]],
  aa: ['Amino acid chemistry', [
    ['hydrophobic', AA_CLASS_COLOR.hydrophobic], ['polar', AA_CLASS_COLOR.polar],
    ['acidic (−)', AA_CLASS_COLOR.acidic], ['basic (+)', AA_CLASS_COLOR.basic]]],
};
