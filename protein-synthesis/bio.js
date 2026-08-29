// bio.js — the biology. Real data: standard genetic code + human HBB (beta-globin).

export const BASE_COLOR = {
  A: 0x53d769, // adenine   - green
  T: 0xff5f56, // thymine   - red
  U: 0xff5f56, // uracil    - red (same slot as T)
  G: 0xffb02e, // guanine   - amber
  C: 0x3fa9ff, // cytosine  - blue
};

export const BASE_NAME = {
  A: 'Adenine', T: 'Thymine', U: 'Uracil', G: 'Guanine', C: 'Cytosine',
};

// Watson–Crick pairing
export const DNA_COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };
export const RNA_FROM_TEMPLATE = { A: 'U', T: 'A', G: 'C', C: 'G' }; // template DNA base -> RNA base
export const ANTICODON_OF = { A: 'U', U: 'A', G: 'C', C: 'G' };      // mRNA base -> tRNA base

// Purines are two-ring (bigger), pyrimidines one-ring.
export const IS_PURINE = { A: true, G: true, T: false, C: false, U: false };

// ---------------------------------------------------------------------------
// Standard genetic code (all 64 codons)
// ---------------------------------------------------------------------------
export const CODON_TABLE = {
  UUU:'F', UUC:'F', UUA:'L', UUG:'L',  CUU:'L', CUC:'L', CUA:'L', CUG:'L',
  AUU:'I', AUC:'I', AUA:'I', AUG:'M',  GUU:'V', GUC:'V', GUA:'V', GUG:'V',
  UCU:'S', UCC:'S', UCA:'S', UCG:'S',  CCU:'P', CCC:'P', CCA:'P', CCG:'P',
  ACU:'T', ACC:'T', ACA:'T', ACG:'T',  GCU:'A', GCC:'A', GCA:'A', GCG:'A',
  UAU:'Y', UAC:'Y', UAA:'*', UAG:'*',  CAU:'H', CAC:'H', CAA:'Q', CAG:'Q',
  AAU:'N', AAC:'N', AAA:'K', AAG:'K',  GAU:'D', GAC:'D', GAA:'E', GAG:'E',
  UGU:'C', UGC:'C', UGA:'*', UGG:'W',  CGU:'R', CGC:'R', CGA:'R', CGG:'R',
  AGU:'S', AGC:'S', AGA:'R', AGG:'R',  GGU:'G', GGC:'G', GGA:'G', GGG:'G',
};

// Amino-acid chemistry drives folding, so class colour is the useful colour.
export const AA_CLASS_COLOR = {
  hydrophobic: 0xf2c14e,
  polar:       0x4ecdc4,
  acidic:      0xef5350,
  basic:       0x5a8def,
  stop:        0x8a8f98,
};

export const AA = {
  A: { three:'Ala', name:'Alanine',       cls:'hydrophobic' },
  R: { three:'Arg', name:'Arginine',      cls:'basic' },
  N: { three:'Asn', name:'Asparagine',    cls:'polar' },
  D: { three:'Asp', name:'Aspartate',     cls:'acidic' },
  C: { three:'Cys', name:'Cysteine',      cls:'polar' },
  E: { three:'Glu', name:'Glutamate',     cls:'acidic' },
  Q: { three:'Gln', name:'Glutamine',     cls:'polar' },
  G: { three:'Gly', name:'Glycine',       cls:'hydrophobic' },
  H: { three:'His', name:'Histidine',     cls:'basic' },
  I: { three:'Ile', name:'Isoleucine',    cls:'hydrophobic' },
  L: { three:'Leu', name:'Leucine',       cls:'hydrophobic' },
  K: { three:'Lys', name:'Lysine',        cls:'basic' },
  M: { three:'Met', name:'Methionine',    cls:'hydrophobic' },
  F: { three:'Phe', name:'Phenylalanine', cls:'hydrophobic' },
  P: { three:'Pro', name:'Proline',       cls:'hydrophobic' },
  S: { three:'Ser', name:'Serine',        cls:'polar' },
  T: { three:'Thr', name:'Threonine',     cls:'polar' },
  W: { three:'Trp', name:'Tryptophan',    cls:'hydrophobic' },
  Y: { three:'Tyr', name:'Tyrosine',      cls:'polar' },
  V: { three:'Val', name:'Valine',        cls:'hydrophobic' },
  '*':{ three:'Stop',name:'Stop codon',   cls:'stop' },
};

export const aaColor = (letter) => AA_CLASS_COLOR[(AA[letter] || AA['*']).cls];
export const translate = (codon) => CODON_TABLE[codon] ?? '*';

// ---------------------------------------------------------------------------
// The gene we follow: human HBB (haemoglobin subunit beta), chromosome 11.
// Coding (sense) strand, 5'->3'. These are the real first 12 codons of the CDS.
// The 13th codon here is a demo stop so the animation terminates on screen;
// real HBB runs 147 codons.
// ---------------------------------------------------------------------------
export const GENE = {
  symbol: 'HBB',
  name: 'Haemoglobin subunit beta',
  locus: 'chromosome 11p15.4',
  promoter: 'TATAAA',               // schematic TATA box
  codingDNA: 'ATGGTGCATCTGACTCCTGAGGAGAAGTCTGCCGTT' + 'TAA',
  realCodonCount: 147,
  demoNote: 'first 12 codons of the real HBB coding sequence + a demo stop',
  // Real HBB exon/intron sizes in nucleotides (pre-mRNA layout).
  structure: [
    { kind:'exon',   label:'Exon 1',   nt:142 },
    { kind:'intron', label:'Intron 1', nt:130 },
    { kind:'exon',   label:'Exon 2',   nt:223 },
    { kind:'intron', label:'Intron 2', nt:850 },
    { kind:'exon',   label:'Exon 3',   nt:861 },
  ],
};

// Sickle-cell anaemia: HbS carries GAG -> GTG in the 7th codon of the transcript,
// which is residue 6 of the mature protein (the initiator Met is cleaved off).
export const SICKLE = { codonIndex: 6, from: 'GAG', to: 'GTG', label: 'Glu6Val (E6V)' };

export function codingStrand(mutated = false) {
  const dna = GENE.codingDNA;
  if (!mutated) return dna;
  const i = SICKLE.codonIndex * 3;
  return dna.slice(0, i) + SICKLE.to + dna.slice(i + 3);
}

export const templateStrand = (coding) =>
  [...coding].map(b => DNA_COMPLEMENT[b]).join('');

export const transcribe = (coding) => coding.replace(/T/g, 'U');

export function codonsOf(seq) {
  const out = [];
  for (let i = 0; i + 2 < seq.length; i += 3) out.push(seq.slice(i, i + 3));
  return out;
}

export function peptideOf(mrna) {
  const chain = [];
  for (const codon of codonsOf(mrna)) {
    const aa = translate(codon);
    chain.push({ codon, aa });
    if (aa === '*') break;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Full beta-globin. HBB_MATURE is the 146-residue chain found in haemoglobin;
// the primary translation product carries the initiator Met in front of it,
// which is cleaved off afterwards. Used by the folding chapter so the protein
// that assembles on screen is the real one, not a 12-residue stub.
// ---------------------------------------------------------------------------
export const HBB_MATURE =
  'VHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKG' +
  'TFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH';
export const HBB_PRECURSOR = 'M' + HBB_MATURE;

// Alpha-helices A-H of the globin fold, as [start, end] indices into
// HBB_PRECURSOR (inclusive). Boundaries are the standard globin assignment
// shifted by one for the initiator Met.
export const HBB_HELICES = [
  { id: 'A', a: 4,   b: 19 },
  { id: 'B', a: 21,  b: 36 },
  { id: 'C', a: 37,  b: 43 },
  { id: 'D', a: 52,  b: 58 },
  { id: 'E', a: 59,  b: 78 },
  { id: 'F', a: 87,  b: 95 },
  { id: 'G', a: 101, b: 119 },
  { id: 'H', a: 125, b: 146 },
];
