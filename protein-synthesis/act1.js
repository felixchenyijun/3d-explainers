// act1.js — Act I, inside the nucleus: the cell, the gene, transcription,
// RNA processing, and export through the nuclear pore.
import * as THREE from 'three';
import {
  GENE, codingStrand, transcribe, BASE_COLOR, DNA_COMPLEMENT, RNA_FROM_TEMPLATE,
} from './bio.js';
import {
  camPath, win, smooth, ease, clamp, lerp, rng, htmlLabel, textSprite, letterSprite,
  baseMaterial, blob, setOpacity,
} from '../engine/gfx.js';
import {
  makeCell, makeGeneDNA, makeHelixDecor, makeRNAStrand, makePolymerase,
  makeNuclearPore, makeSegment, setSegment, DNA,
} from './molecules.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Promoter + 5' UTR bolted onto the real HBB coding sequence so the animation
// can show a TATA box, a transcription start site, and start-codon scanning.
export const UPSTREAM = 'GGCTATAAAAGGGCCAGT'; // TATA box at index 3..8
export const TSS = 15;                        // transcription starts here
export const TATA = [3, 9];
export const CDS_START = UPSTREAM.length;     // index of the A of ATG
export const fullDNA = (mut) => UPSTREAM + codingStrand(mut);

function label(text, pos, cls = '') {
  const l = htmlLabel(text, cls);
  l.position.copy(pos);
  return l;
}
// entries: [{obj, at}] — pop in one at a time as the chapter plays
function reveal(entries, t) {
  for (const e of entries) {
    const on = t >= e.at && (e.until === undefined || t < e.until);
    e.obj.visible = on;
    if (on && e.obj.userData.el) {
      e.obj.userData.el.style.opacity = smooth((t - e.at) / 0.03);
    }
  }
}

// =========================================================================
// 1 — THE CELL
// =========================================================================
const chCell = {
  id: 'cell',
  title: 'One cell',
  where: 'Whole cell · ~20 µm across',
  duration: 30,
  legend: null,
  beats: [
    { at: 0.00, h: 'A factory the width of a hair', p: 'This is an animal cell, roughly 20 micrometres across — about a fifth the width of a human hair. Everything you are made of is built in here, and almost all of it is <b>protein</b>: the enzymes that digest your food, the collagen in your skin, the haemoglobin carrying oxygen in your blood.' },
    { at: 0.22, h: 'The blueprint is locked in the nucleus', p: 'The purple sphere is the <b>nucleus</b>. It holds your DNA — 2 metres of it, packed into a compartment 6 µm wide. DNA never leaves. It is the master copy, and the cell treats it like one.' },
    { at: 0.45, h: 'The factory floor', p: 'Green sheets wrapping the nucleus are the <b>rough endoplasmic reticulum</b>, studded with tan dots — <b>ribosomes</b>, the machines that actually build proteins. Orange stacks are the <b>Golgi apparatus</b> (packaging and shipping); red capsules are <b>mitochondria</b> (power).' },
    { at: 0.68, h: 'The problem', p: 'The instructions are inside the nucleus. The machines that read them are outside it. So the cell makes a disposable working copy of one gene, sends the copy out, and builds from that. Two steps: <b>transcription</b> (DNA → RNA) and <b>translation</b> (RNA → protein).' },
    { at: 0.86, h: 'Going in', p: 'We are heading through the nuclear envelope to a single gene on chromosome 11 — <b>HBB</b>, the gene for the beta chain of haemoglobin.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const cell = makeCell();
    root.add(cell);

    const labels = [
      { obj: label('Plasma membrane', V(0, 52, 22)), at: 0.04 },
      { obj: label('Nucleus <span class="sub">the DNA archive</span>', V(0, 26, 0)), at: 0.20 },
      { obj: label('Nucleolus <span class="sub">ribosomes are assembled here</span>', V(6, -6, 6)), at: 0.30 },
      { obj: label('Rough ER <span class="sub">+ ribosomes</span>', V(30, 18, 14)), at: 0.44 },
      { obj: label('Golgi apparatus', V(-38, -6, 14)), at: 0.52 },
      { obj: label('Mitochondrion', V(30, -30, 8)), at: 0.58 },
      { obj: label('Cytosol <span class="sub">water, ions, millions of ribosomes</span>', V(-26, 34, 20)), at: 0.64 },
    ];
    labels.forEach(l => root.add(l.obj));

    const cam = camPath([
      { at: 0.00, pos: [40, 30, 235], target: [0, 0, 0], fov: 42 },
      { at: 0.20, pos: [10, 26, 150], target: [0, 4, 0], fov: 45 },
      { at: 0.45, pos: [-46, 22, 96], target: [-6, 0, 6], fov: 50 },
      { at: 0.66, pos: [34, -6, 88], target: [8, -4, 4], fov: 50 },
      { at: 0.86, pos: [6, 8, 62], target: [0, 2, 0], fov: 46 },
      { at: 1.00, pos: [2, 3, 30], target: [0, 0, 0], fov: 44 },
    ]);

    return {
      root,
      update(t) {
        cell.rotation.y = t * 0.55;
        cell.userData.motes.rotation.y = -t * 0.9;
        cell.userData.nucleolus.rotation.x = t * 2;
        reveal(labels, t);
      },
      camera: cam,
    };
  },
};

// =========================================================================
// 2 — THE GENE: chromosome → nucleosome → double helix
// =========================================================================
function makeNucleosome() {
  const g = new THREE.Group();
  const histMat = new THREE.MeshStandardMaterial({ color: 0x8ce0ff, roughness: 0.35, metalness: 0.15 });
  for (let k = 0; k < 8; k++) {
    const a = (k % 4) / 4 * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12), histMat);
    s.position.set(Math.cos(a) * 1.45, (k < 4 ? -0.75 : 0.75), Math.sin(a) * 1.45);
    g.add(s);
  }
  const pts = [];
  const turns = 1.65, R = 3.5;
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, a = u * turns * Math.PI * 2 - 0.4;
    pts.push(V(Math.cos(a) * R, (u - 0.5) * 2.6, Math.sin(a) * R));
  }
  const dna = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.55, 8, false),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.4 }));
  g.add(dna);
  g.userData = { dna, pts };
  return g;
}

const chGene = {
  id: 'gene',
  title: 'The gene',
  where: 'Chromosome 11 → 57 base pairs',
  duration: 34,
  legend: 'bases',
  beats: [
    { at: 0.00, h: 'Chromosome 11', p: 'Your DNA is split across 46 chromosomes. This is chromosome 11, drawn in its condensed form (two identical sister chromatids joined at a centromere). It carries about 135 million base pairs — and one of them is the gene we want.' },
    { at: 0.20, h: 'DNA is spooled, not loose', p: 'Two metres of DNA fits in a 6 µm nucleus by winding around protein spools called <b>histones</b>. Each spool plus its DNA is a <b>nucleosome</b> — 147 base pairs wrapped 1.65 times around eight histone proteins. Strung together they make the "beads on a string" chromatin fibre.' },
    { at: 0.44, h: 'Unspooling to read', p: 'A gene can only be read when its stretch of DNA is unwound off the histones. Which genes get unwound — in this cell, right now — is most of what makes a liver cell different from a neuron. Same DNA, different pages open.' },
    { at: 0.64, h: 'The double helix', p: 'Naked DNA: two sugar-phosphate backbones running in <b>opposite directions</b>, with rungs of paired bases between them. <b>A pairs with T</b> (two hydrogen bonds), <b>G pairs with C</b> (three). One turn every 10.5 base pairs.' },
    { at: 0.82, h: 'HBB', p: 'Here is our stretch: a <b>promoter</b> (with its TATA box) that says "start here", then the coding sequence. The top strand is the <b>coding strand</b> — its sequence is what the message will say. The bottom is the <b>template strand</b> — the one that actually gets read, because copying a template gives you back the original.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const seq = fullDNA(ctx.state.mutated);

    // --- stage A: chromosome ------------------------------------------------
    const chromo = new THREE.Group();
    const chromMat = new THREE.MeshStandardMaterial({ color: 0xb69bff, roughness: 0.45, metalness: 0.05 });
    for (const [dx, dy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, dy > 0 ? 9 : 13, 8, 16), chromMat);
      arm.position.set(dx * 2.5, dy * (dy > 0 ? 7.4 : 9.4), 0);
      arm.rotation.z = dx * dy * -0.13;
      chromo.add(arm);
    }
    const centro = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0x6c4fd6, roughness: 0.4 }));
    chromo.add(centro);
    chromo.position.set(0, 0, 0);
    root.add(chromo);

    // --- stage B: chromatin fibre of nucleosomes ---------------------------
    const fibre = new THREE.Group();
    const nucs = [];
    const linkerMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.4 });
    const r = rng(77);
    for (let k = 0; k < 9; k++) {
      const n = makeNucleosome();
      const a = k * 1.25;
      n.position.set((k - 4) * 9.5, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      n.rotation.set(r() * 0.6, a, r() * 0.6);
      fibre.add(n); nucs.push(n);
      if (k > 0) {
        const link = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
          nucs[k - 1].position.clone().add(V(3.4, 0, 0)),
          nucs[k - 1].position.clone().lerp(n.position, 0.5).add(V(0, 1.6, 0)),
          n.position.clone().add(V(-3.4, 0, 0)),
        ]), 30, 0.5, 8, false), linkerMat);
        fibre.add(link);
      }
    }
    fibre.visible = false;
    root.add(fibre);

    // --- stage C: the real sequence ----------------------------------------
    const dna = makeGeneDNA(seq);
    dna.group.position.x = -dna.length / 2;
    dna.group.visible = false;
    root.add(dna.group);

    const mid = 0; // dna.group is centred
    const tataX = -dna.length / 2 + (TATA[0] + 2.5) * DNA.rise;
    const cdsX = -dna.length / 2 + (CDS_START + 6) * DNA.rise;
    const labels = [
      { obj: label('Chromosome 11 <span class="sub">~135 million base pairs</span>', V(0, 20, 0)), at: 0.03, until: 0.26 },
      { obj: label('Centromere', V(6, 0, 0)), at: 0.10, until: 0.24 },
      { obj: label('Nucleosome <span class="sub">147 bp around 8 histones</span>', V(0, 7, 0)), at: 0.24, until: 0.60 },
      { obj: label('Linker DNA', V(-14, -6, 0)), at: 0.34, until: 0.58 },
      { obj: label("5′ → 3′ &nbsp;coding strand", V(-dna.length / 2 - 4, 5, 0)), at: 0.66 },
      { obj: label("3′ → 5′ &nbsp;template strand", V(-dna.length / 2 - 4, -5.5, 0)), at: 0.70 },
      { obj: label('TATA box <span class="sub">promoter — "start here"</span>', V(tataX, 6.5, 0)), at: 0.80 },
      { obj: label('Start codon ATG <span class="sub">coding sequence begins</span>', V(cdsX, -7, 0)), at: 0.88 },
    ];
    labels.forEach(l => root.add(l.obj));

    // highlight promoter + CDS by dimming everything else
    function highlight(t) {
      const k = win(t, 0.78, 0.95);
      for (const p of dna.pairs) {
        const inTata = p.i >= TATA[0] && p.i < TATA[1];
        const inCds = p.i >= CDS_START;
        const hot = inTata || inCds;
        const dim = hot ? 1 : lerp(1, 0.22, k);
        for (const m of [p.baseA, p.baseB]) {
          m.material.transparent = dim < 1;
          m.material.opacity = dim;
        }
        if (p.letA) p.letA.material.opacity = dim;
        if (p.letB) p.letB.material.opacity = dim;
        p.baseA.material.emissiveIntensity = inTata ? 1 + (0.5 + 0.5 * Math.sin(t * 60 + p.i)) * 4 * k : 1;
        p.baseB.material.emissiveIntensity = inTata ? 1 + (0.5 + 0.5 * Math.sin(t * 60 + p.i)) * 4 * k : 1;
      }
    }

    const cam = camPath([
      { at: 0.00, pos: [0, 8, 64], target: [0, 0, 0], fov: 44 },
      { at: 0.16, pos: [14, 6, 34], target: [2, 2, 0], fov: 46 },
      { at: 0.30, pos: [-2, 8, 52], target: [0, 0, 0], fov: 48 },
      { at: 0.44, pos: [7, 4, 22], target: [2, 0, 0], fov: 46 },
      { at: 0.56, pos: [0, 3, 15], target: [0, 0, 0], fov: 46 },
      { at: 0.68, pos: [0, 7, 76], target: [0, 0, 0], fov: 46 },
      { at: 0.82, pos: [tataX + 1, 5, 40], target: [tataX, 0, 0], fov: 45 },
      { at: 0.93, pos: [cdsX, 3, 32], target: [cdsX, 0, 0], fov: 44 },
      { at: 1.00, pos: [0, 6, 66], target: [0, 0, 0], fov: 45 },
    ]);

    return {
      root,
      update(t) {
        const a = 1 - win(t, 0.18, 0.28);
        const b = win(t, 0.18, 0.30) * (1 - win(t, 0.55, 0.66));
        const c = win(t, 0.56, 0.68);
        chromo.visible = a > 0.01; if (chromo.visible) setOpacity(chromo, a);
        fibre.visible = b > 0.01; if (fibre.visible) setOpacity(fibre, b);
        dna.group.visible = c > 0.01; if (dna.group.visible) setOpacity(dna.group, c);

        chromo.rotation.y = t * 1.6;
        fibre.rotation.y = 0.25 + t * 0.5;
        // the closest nucleosome pays off the "unspooling" beat
        const un = win(t, 0.46, 0.62);
        nucs.forEach((n, k) => { n.rotation.x = 0.4 * un * (k % 2 ? 1 : -1); n.scale.setScalar(1 - 0.25 * un); });
        dna.group.rotation.y = -0.15 + Math.sin(t * 2) * 0.05;
        if (c > 0.01) { dna.layout(); highlight(t); }
        reveal(labels, t);
        ctx.hud.set(t < 0.6 ? null : { mode: 'dna', dna: seq, tss: TSS, cdsStart: CDS_START });
      },
      camera: cam,
    };
  },
};

// =========================================================================
// 3 — TRANSCRIPTION
// =========================================================================
const chTranscription = {
  id: 'transcription',
  title: 'Transcription',
  where: 'Nucleus · DNA → messenger RNA',
  duration: 52,
  legend: 'bases',
  beats: [
    { at: 0.00, h: 'Copying one gene', p: 'A protein machine, <b>RNA polymerase II</b>, will now copy this gene into RNA. It does not copy the whole chromosome — only from the promoter to the end of this gene.' },
    { at: 0.10, h: 'Docking on the promoter', p: 'Transcription factors recognise the TATA box and recruit the polymerase. Once it clamps on, it prises the two DNA strands apart, opening a <b>transcription bubble</b> about 14 base pairs wide.' },
    { at: 0.24, h: 'Reading the template', p: 'Only the <b>bottom (template) strand</b> is read, and it is read 3′→5′. Free RNA nucleotides float in and are accepted only if they base-pair with the template: <b>A↔U, T↔A, G↔C, C↔G</b>. Note RNA uses <b>uracil (U)</b> where DNA uses thymine (T).' },
    { at: 0.44, h: 'The RNA grows 5′→3′', p: 'Each accepted nucleotide is bonded to the growing chain, so the RNA is built 5′→3′ at about 30–60 nucleotides per second. Because it copies the template, the new RNA reads exactly like the <b>coding strand</b> — with U in place of T.' },
    { at: 0.62, h: 'Zip closed behind', p: 'Behind the polymerase the two DNA strands snap back together. The DNA is left completely unchanged: this is a copy, not a cut. The same gene can be transcribed thousands of times.' },
    { at: 0.82, h: 'A transcript, not yet a message', p: 'What comes off is <b>pre-mRNA</b>. It still needs three edits before it can leave the nucleus.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const coding = fullDNA(ctx.state.mutated);
    const rnaSeq = transcribe(coding).slice(TSS);
    const N = rnaSeq.length;

    const dna = makeGeneDNA(coding);
    root.add(dna.group);
    const xOf = (i) => i * DNA.rise;

    const pol = makePolymerase();
    root.add(pol);
    const polLabel = label('RNA polymerase II', V(0, 8.5, 0));
    pol.add(polLabel);

    const rna = makeRNAStrand({ max: N + 2 });
    root.add(rna.group);

    // free nucleotides drifting in to be tested against the template
    const floats = [];
    const fr = rng(5);
    for (let k = 0; k < 10; k++) {
      const ch = 'AUGC'[(fr() * 4) | 0];
      const g = new THREE.Group();
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xf6d9b0, roughness: 0.4 }));
      const pad = makeSegment(baseMaterial(BASE_COLOR[ch]));
      setSegment(pad, V(0, 0, 0), V(0, -0.9, 0), 0.24);
      const lt = letterSprite(ch, 0.6); lt.position.set(0, -1.25, 0.3);
      g.add(s, pad, lt);
      g.userData = { phase: fr(), from: V(fr() * 14 - 7, 9 + fr() * 7, fr() * 10 - 5) };
      root.add(g); floats.push(g);
    }

    // exit channel the RNA is pushed out through (polymerase-local space)
    const exitCurve = new THREE.CatmullRomCurve3([
      V(0.4, 0.2, 0), V(-1.0, 1.9, 1.4), V(-2.8, 3.9, 2.4), V(-5.4, 5.8, 2.6), V(-9.0, 7.0, 2.0),
    ]);
    const exitLen = exitCurve.getLength();
    const HYBRID = 7;      // RNA:DNA hybrid inside the bubble, ~8-9 bp in reality
    const BUBBLE = 7.0;    // half-width in world units (~14 bp total)
    const NT_SPACING = 1.05;

    const labels = [
      { obj: label('Transcription bubble <span class="sub">~14 bp unwound</span>', V(0, -8.5, 0)), at: 0.16, until: 0.80 },
      { obj: label('Template strand — read 3′→5′', V(-6, -5.5, 4)), at: 0.26, until: 0.72 },
      { obj: label('Growing RNA — built 5′→3′', V(-8, 9, 3)), at: 0.42, until: 0.86 },
      { obj: label('Pre-mRNA', V(0, 12, 0)), at: 0.86 },
    ];
    labels.forEach(l => root.add(l.obj));
    const bubbleLabel = labels[0].obj, tmplLabel = labels[1].obj, rnaLabel = labels[2].obj;

    const _p = new THREE.Vector3(), _q = new THREE.Vector3();
    const progressOf = (t) => win(t, 0.20, 0.86);
    const xPolOf = (t) => xOf(TSS) + progressOf(t) * (N - 1) * DNA.rise;

    function rnaPoint(j, xPol, out) {
      const d = j * NT_SPACING;
      if (d <= exitLen) exitCurve.getPointAt(d / exitLen, out);
      else {
        exitCurve.getPointAt(1, out);
        const over = d - exitLen;
        out.x -= over * 0.82;
        out.y += over * 0.30 + Math.sin(over * 0.5) * 0.6;
        out.z += Math.sin(over * 0.33) * 1.2 - over * 0.1;
      }
      out.x += xPol;
      return out;
    }

    return {
      root,
      update(t, dt, time) {
        const p = progressOf(t);
        const made = Math.floor(p * N + 1e-6);           // nucleotides written so far
        const xPol = xPolOf(t);

        // polymerase: descends onto the promoter, then tracks the bubble
        const drop = win(t, 0.04, 0.18);
        pol.position.set(t < 0.20 ? xOf(TSS) : xPol, lerp(16, 0, drop), 0);
        pol.visible = drop > 0.02;
        const release = win(t, 0.90, 1.0);
        pol.position.x += release * 6; pol.position.y += release * 9;
        setOpacity(pol, 1 - release * 0.85);

        // unzip: bubble centred just ahead of the active site
        for (const pr of dna.pairs) {
          const d = Math.abs(xOf(pr.i) - (xPol + 1.0));
          pr.open = drop * (1 - smooth((d - BUBBLE * 0.45) / (BUBBLE * 0.55))) * (1 - release);
        }
        dna.layout();

        // lay down RNA
        for (let k = 0; k < made; k++) {
          if (rna.nts[k].char === null) {
            const templateBase = DNA_COMPLEMENT[coding[TSS + k]];
            rna.set(k, RNA_FROM_TEMPLATE[templateBase]);
          }
        }
        rna.hideFrom(made);
        for (let k = 0; k < made; k++) {
          const j = made - 1 - k;                        // 0 = newest, at the active site
          rnaPoint(j, xPol, _p);
          if (j < HYBRID) {                              // still paired with the template
            const pr = dna.pairs[TSS + k];
            _q.copy(pr.tipB).add(V(0, -0.15, 0.9));
            _p.lerp(_q, 1 - j / HYBRID);
          }
          const toward = j < HYBRID ? dna.pairs[TSS + k].posB : _p.clone().add(V(0, 1, 0));
          rna.place(k, _p, toward, { visible: true, baseLen: 0.8 });
        }

        // free nucleotides pulled into the active site
        floats.forEach((g, k) => {
          const ph = (p * N * 0.6 + g.userData.phase * 3) % 1;
          const target = V(xPol + 0.6, 0.4, 0.6);
          g.position.copy(g.userData.from).add(V(xPol, 0, 0)).lerp(target, ease(ph));
          g.visible = drop > 0.5 && ph < 0.94 && t < 0.88;
          setOpacity(g, clamp(1 - (ph - 0.7) / 0.24));
          g.rotation.z = ph * 3;
        });

        // active site glows on every bond formed
        pol.userData.active.material.emissiveIntensity = 1 + Math.sin(time * 14) * 0.6;

        bubbleLabel.position.set(xPol, -8.5, 0);
        tmplLabel.position.set(xPol - 7, -5.8, 3);
        rnaLabel.position.set(xPol - 9, 9.5, 2);
        labels[3].obj.position.set(xPol - 16, 11, 0);
        reveal(labels, t);

        ctx.hud.set({
          mode: 'transcription',
          dna: coding, tss: TSS, cdsStart: CDS_START,
          rna: rnaSeq.slice(0, made), rnaLen: N,
        });
      },
      camera(t, pos, tgt) {
        const xPol = xPolOf(t);
        const wide = 1 - win(t, 0.06, 0.20);
        const end = win(t, 0.88, 1.0);
        const trackP = V(xPol - 8, 12, 36), trackT = V(xPol - 1, 1.5, 0);
        const wideP = V(dna.length / 2, 15, 82), wideT = V(dna.length / 2, 0, 0);
        const endP = V(dna.length * 0.62, 18, 64), endT = V(dna.length * 0.55, 6, 0);
        pos.copy(trackP).lerp(wideP, wide).lerp(endP, end);
        tgt.copy(trackT).lerp(wideT, wide).lerp(endT, end);
        return 46;
      },
    };
  },
};

// =========================================================================
// 4 — RNA PROCESSING: cap, splice, tail
// =========================================================================
const chProcessing = {
  id: 'processing',
  title: 'RNA processing',
  where: 'Nucleus · pre-mRNA → mature mRNA',
  duration: 40,
  legend: null,
  beats: [
    { at: 0.00, h: 'Genes are interrupted', p: 'Real human genes are not continuous. HBB is 1,600 bases long but only 444 of them code for protein. The coding pieces are <b>exons</b>; the pieces in between are <b>introns</b>, and they have to come out.' },
    { at: 0.16, h: '5′ cap', p: 'First, a modified guanine (7-methylguanosine) is stuck onto the front of the transcript. The <b>cap</b> protects the RNA from being chewed up, and later it is the handle the ribosome grabs.' },
    { at: 0.34, h: 'Splicing', p: 'The <b>spliceosome</b> — itself made of RNA and protein — finds each intron, loops it into a lariat, cuts it out, and joins the neighbouring exons together. HBB has two introns: 130 and 850 bases.' },
    { at: 0.62, h: 'Why bother?', p: 'Because exons can be re-combined. <b>Alternative splicing</b> lets one gene make several different proteins — which is how ~20,000 human genes produce well over 100,000 distinct proteins.' },
    { at: 0.76, h: 'Poly-A tail', p: 'Finally a tail of 100–250 adenines is added to the 3′ end. It is a fuse: the tail is slowly trimmed in the cytoplasm, and when it runs out the message is destroyed. Tail length sets how many times a message gets read.' },
    { at: 0.90, h: 'Mature mRNA', p: 'Cap, no introns, poly-A tail. It is now a legal export.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const SCALE = 0.0125; // nucleotides -> world units (gene-scale schematic)
    const segs = [];
    let x = 0;
    const EXON_COLORS = [0x4ecdc4, 0x3fb5cf, 0x36a0d6];
    const intronMat = new THREE.MeshStandardMaterial({
      color: 0xb9a8e0, roughness: 0.5, transparent: true, opacity: 0.85, emissive: 0x2a1f45 });
    let exonN = 0;
    for (const s of GENE.structure) {
      const len = s.nt * SCALE;
      const isExon = s.kind === 'exon';
      const col = isExon ? EXON_COLORS[exonN++ % 3] : 0;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(isExon ? 0.85 : 0.32, isExon ? 0.85 : 0.32, 1, 18),
        isExon
          ? new THREE.MeshStandardMaterial({ color: col, roughness: 0.3,
              emissive: new THREE.Color(col).multiplyScalar(0.22) })
          : intronMat.clone());   // each intron fades on its own
      m.rotation.z = Math.PI / 2;
      segs.push({ ...s, mesh: m, len, x0: x, x1: x + len });
      x += len;
      root.add(m);
    }
    const total = x;
    root.position.x = -total / 2;

    // 5' cap
    const cap = new THREE.Group();
    const capBall = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4a00, roughness: 0.3 }));
    const capTag = label('5′ cap <span class="sub">7-methylguanosine</span>', V(-1.4, 3.6, 0));
    cap.add(capBall, capTag);
    cap.position.set(-1.4, 0, 0);
    root.add(cap);

    // poly-A tail
    const tail = new THREE.Group();
    const tailBeads = [];
    for (let k = 0; k < 26; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10),
        new THREE.MeshStandardMaterial({ color: BASE_COLOR.A, roughness: 0.35, emissive: 0x0e3a18 }));
      tail.add(b); tailBeads.push(b);
    }
    const tailTag = label('poly-A tail <span class="sub">100–250 × A</span>', V(0, 2.4, 0));
    tail.add(tailTag);
    root.add(tail);

    // spliceosome
    const spl = blob(3.0, 5, new THREE.MeshStandardMaterial({
      color: 0xff8fd0, transparent: true, opacity: 0.28, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide,
    }), { seed: 31, amp: 0.2, lobes: 4 });
    spl.visible = false;
    root.add(spl);

    // lariats (the excised introns)
    const lariats = GENE.structure.filter(s => s.kind === 'intron').map(() => {
      const g = new THREE.Group();
      const lm = intronMat.clone();
      const loop = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 30), lm);
      const tailPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 10), lm);
      tailPiece.position.set(1.6, -1.3, 0); tailPiece.rotation.z = -0.9;
      g.add(loop, tailPiece); g.visible = false;
      root.add(g);
      return g;
    });

    const labels = [];
    segs.forEach((s) => {
      const l = label(`${s.label} <span class="sub">${s.nt} nt</span>`,
        V(0, s.kind === 'exon' ? 1.9 : -2.0, 0), s.kind === 'intron' ? 'muted' : '');
      root.add(l);
      labels.push({ obj: l, at: 0.03, seg: s });
    });
    const doneLabel = label('Mature mRNA <span class="sub">ready to export</span>', V(0, 3.4, 0));
    root.add(doneLabel);
    const scaleNote = label('drawn at gene scale <span class="sub">1 unit ≈ 80 nucleotides</span>', V(0, -4.2, 0), 'muted');
    root.add(scaleNote);

    const introns = segs.filter(s => s.kind === 'intron');

    let focusX = 0;   // set every frame by update(), so the camera tracks the
                      // transcript as splicing shortens it

    return {
      root,
      update(t, dt, time) {
        // splice each intron in turn, then slide the downstream exons left
        const cut = introns.map((s, k) => win(t, 0.36 + k * 0.14, 0.50 + k * 0.14));
        let shift = 0;
        for (const s of segs) {
          const k = introns.indexOf(s);
          if (k >= 0) {
            const c = cut[k];
            s.mesh.scale.set(1, s.len * (1 - c), 1);
            s.mesh.position.set(s.x0 + s.len * (1 - c) / 2 - shift, 0, 0);
            s.mesh.material.opacity = 0.85 * (1 - c);
            s.mesh.visible = c < 0.99;
            lariats[k].visible = c > 0.05 && c < 0.98;
            lariats[k].position.set(s.x0 - shift, 3.2 + c * 4, 0);
            lariats[k].rotation.z = time * 1.2;
            setOpacity(lariats[k], smooth(c / 0.3) * (1 - smooth((c - 0.7) / 0.3)));
            shift += s.len * c;
          } else {
            s.mesh.scale.set(1, s.len, 1);
            s.mesh.position.set(s.x0 + s.len / 2 - shift, 0, 0);
          }
        }
        const mrnaEnd = total - shift;

        labels.forEach((l) => {
          l.obj.position.x = l.seg.mesh.position.x;
          const k = introns.indexOf(l.seg);
          l.obj.visible = t < 0.9 && (k < 0 || cut[k] < 0.9);
        });

        // spliceosome rides to each intron while it is being removed
        const active = cut.findIndex(c => c > 0.001 && c < 0.999);
        focusX = active >= 0
          ? root.position.x + introns[active].mesh.position.x
          : root.position.x + mrnaEnd / 2;
        spl.visible = active >= 0;
        if (active >= 0) {
          spl.position.set(introns[active].mesh.position.x, 0, 0);
          spl.rotation.y = time * 1.5;
          spl.scale.setScalar(1 + Math.sin(time * 6) * 0.06);
        }

        // cap
        const capIn = win(t, 0.16, 0.28);
        cap.visible = capIn > 0.02;
        cap.position.set(-1.4 - (1 - capIn) * 6, (1 - capIn) * 5, 0);
        setOpacity(cap, capIn);

        // tail
        const tailIn = win(t, 0.76, 0.92);
        tail.visible = tailIn > 0.02;
        tailBeads.forEach((b, k) => {
          const on = k / tailBeads.length < tailIn;
          b.visible = on;
          b.position.set(mrnaEnd + 0.7 + k * 0.62, Math.sin(k * 0.8 + time) * 0.35, Math.cos(k * 0.5) * 0.3);
        });
        tailTag.position.set(mrnaEnd + 6, 2.0, 0);

        doneLabel.visible = t > 0.9;
        doneLabel.position.set(mrnaEnd / 2, 3.4, 0);
        scaleNote.visible = t < 0.14;
        scaleNote.position.set(total / 2, -4.2, 0);

        ctx.hud.set(null);
      },
      camera(t, pos, tgt) {
        const close = win(t, 0.14, 0.24) * (1 - win(t, 0.86, 0.96));
        const dist = lerp(48, 34, close);
        const high = lerp(9, 6, close);
        pos.set(focusX, high, dist);
        tgt.set(focusX, 0, 0);
        return lerp(42, 46, close);
      },
    };
  },
};

// =========================================================================
// 5 — EXPORT through the nuclear pore
// =========================================================================
const chExport = {
  id: 'export',
  title: 'Export',
  where: 'Nuclear pore complex',
  duration: 24,
  legend: null,
  beats: [
    { at: 0.00, h: 'The only way out', p: 'The nuclear envelope is a <b>double membrane</b>, pierced by <b>nuclear pore complexes</b> — each about 120 MDa of protein, one of the largest machines in the cell. Roughly 2,000 of them per nucleus. Below is the nucleus; above is the cytoplasm.' },
    { at: 0.34, h: 'Checked on the way out', p: 'The pore is a checkpoint. RNA that still has an intron in it, or is missing its cap, generally does not get through — it is degraded instead. Only finished messages are exported, cap-first.' },
    { at: 0.70, h: 'Into the cytoplasm', p: 'Out here are the ribosomes. The message has left the archive, and nothing that happens to it from now on can change the DNA. The original is safe; this is a disposable working copy.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    // Envelope lies flat (normal +Y): nucleus below, cytoplasm above. Viewed from
    // the side it reads as a membrane with two sides rather than a purple wall.
    const sheet = new THREE.PlaneGeometry(180, 180, 1, 1);
    const outer = new THREE.Mesh(sheet, new THREE.MeshStandardMaterial({
      color: 0x9b7bff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    const inner = new THREE.Mesh(sheet, new THREE.MeshStandardMaterial({
      color: 0x6d51d6, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }));
    outer.rotation.x = -Math.PI / 2;
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = -3.2;
    root.add(outer, inner);

    const pore = makeNuclearPore(4.4);
    pore.rotation.x = Math.PI / 2;
    pore.scale.setScalar(1.3);
    const pore2 = makeNuclearPore(4.4);
    pore2.rotation.x = Math.PI / 2;
    pore2.scale.setScalar(1.3);
    pore2.position.y = -3.2;
    root.add(pore, pore2);

    const extra = [];
    const pr = rng(9);
    for (let k = 0; k < 12; k++) {
      const g = new THREE.Group();
      const a = pr() * Math.PI * 2, d = 22 + pr() * 60;
      for (const y of [0, -3.2]) {
        const p2 = makeNuclearPore(3.2);
        p2.rotation.x = Math.PI / 2;
        p2.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
        g.add(p2);
      }
      root.add(g); extra.push(g);
    }

    // nucleoplasm haze below, so the two compartments look different
    const haze = new THREE.Mesh(new THREE.BoxGeometry(180, 60, 180),
      new THREE.MeshStandardMaterial({ color: 0x5b3fd6, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.BackSide }));
    haze.position.y = -33;
    root.add(haze);

    // the mRNA threading up through the pore, 5' cap leading
    const noodle = new THREE.Group();
    const beads = [];
    const bm = new THREE.MeshStandardMaterial({ color: 0x4ecdc4, roughness: 0.3, emissive: 0x0d3b38 });
    for (let k = 0; k < 36; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(k === 0 ? 0.95 : 0.52, 14, 10),
        k === 0 ? new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4a00, roughness: 0.3 }) : bm);
      noodle.add(b); beads.push(b);
    }
    root.add(noodle);

    const labels = [
      { obj: label('Nuclear pore complex <span class="sub">~2,000 per nucleus · ~120 MDa each</span>', V(0, 9, 0)), at: 0.04 },
      { obj: label('Nucleus <span class="sub">DNA stays in here</span>', V(22, -11, 22), 'muted'), at: 0.10 },
      { obj: label('Cytoplasm <span class="sub">ribosomes are out here</span>', V(22, 13, 22), 'muted'), at: 0.10 },
      { obj: label('Double membrane', V(-24, -1.6, -4), 'muted'), at: 0.16, until: 0.60 },
      { obj: label('mRNA <span class="sub">5′ cap leads the way out</span>', V(0, 0, 0)), at: 0.28 },
    ];
    labels.forEach(l => root.add(l.obj));

    const cam = camPath([
      { at: 0.00, pos: [40, 5, 46], target: [0, -2, 0], fov: 46 },
      { at: 0.34, pos: [26, 3, 34], target: [0, 0, 0], fov: 48 },
      { at: 0.70, pos: [20, 9, 32], target: [0, 6, 0], fov: 48 },
      { at: 1.00, pos: [24, 15, 34], target: [0, 12, 0], fov: 48 },
    ]);

    return {
      root,
      update(t, dt, time) {
        const p = win(t, 0.16, 0.88);
        beads.forEach((b, k) => {
          const s = p * 52 - k * 1.15;              // arc position of bead k
          const y = s - 22;                          // below 0 = nucleus, above = cytoplasm
          const wander = Math.abs(y) > 4 ? 3.0 : 0.5;
          b.position.set(Math.sin(s * 0.34) * wander, y, Math.cos(s * 0.29) * wander);
          b.visible = s > -1 && s < 56;
        });
        pore.rotation.y = time * 0.25;
        pore2.rotation.y = -time * 0.2;
        extra.forEach((g, k) => { g.rotation.y = time * 0.12 * (k % 2 ? 1 : -1); });
        labels[4].obj.position.set(3.5, beads[0].position.y, beads[0].position.z);
        reveal(labels, t);
      },
      camera: cam,
    };
  },
};

export const ACT1 = [chCell, chGene, chTranscription, chProcessing, chExport];
