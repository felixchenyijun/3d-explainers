// speech.js — how the narration should be *said*. The beats are written to be
// read, so the voice track needs the molecular shorthand expanded: bare codons
// are letters, not syllables, and "mRNA" is four sounds rather than "murna".
// Pure string work, no imports — see speech.test.js.

const AA3 = {
  Met: 'methionine', Val: 'valine', Glu: 'glutamate', Lys: 'lysine',
  His: 'histidine', Leu: 'leucine', Thr: 'threonine', Pro: 'proline',
  Ser: 'serine', Ala: 'alanine', Gly: 'glycine', Phe: 'phenylalanine',
};

const RULES = [
  // nucleic-acid species: say the letters
  [/\b(m|t|r|sn)RNA\b/g, '$1 R N A'],
  [/\bUTR\b/g, 'U T R'],
  [/\bHBB\b/g, 'H B B'],
  [/\bHbS\b/g, 'H b S'],
  [/\bCJD\b/g, 'C J D'],

  // sickle shorthand
  [/\bGlu(\d+)Val\b/g, 'glutamate $1 valine'],
  [/\bE(\d+)V\b/g, 'E $1 V'],

  // bare codons and other runs of bases — spell them out
  [/\b([ACGTU]{3,6})\b/g, (m) => m.split('').join(' ')],

  // amino-acid abbreviations
  [new RegExp(`\\b(${Object.keys(AA3).join('|')})\\b`, 'g'), (m) => AA3[m]],

  // units and symbols the eye reads but the ear does not
  [/\bO2\b|\bO ?two\b/g, 'oxygen'],
  [/\bbp\b/g, 'base pairs'],
  [/\bnt\b/g, 'nucleotides'],
  [/\bMDa\b/g, 'megadaltons'],
  [/\bATP\b/g, 'A T P'],
  [/\b(\d+)S\b/g, '$1 S'],
];

export function normalize(text) {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), text);
}
