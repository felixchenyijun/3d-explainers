// act2.js — Act II, in the cytoplasm: initiation, elongation, termination,
// folding, and what one wrong letter does.
import * as THREE from 'three';
import {
  GENE, SICKLE, codingStrand, transcribe, peptideOf, codonsOf, translate,
  AA, aaColor, BASE_COLOR, ANTICODON_OF, HBB_PRECURSOR, HBB_HELICES,
} from './bio.js';
import {
  camPath, win, smooth, ease, clamp, lerp, rng, htmlLabel, textSprite, letterSprite,
  blob, setOpacity,
} from '../engine/gfx.js';
import {
  makeRibosome, makeTRNA, makeRNAStrand, makePolypeptide, makeSegment, setSegment,
  anticodonFor,
} from './molecules.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UTR = 3;                 // 5' UTR nucleotides in front of the start codon
const NT = 1.15;               // world units per nucleotide
const CODON = NT * 3;

function label(text, pos, cls = '') { const l = htmlLabel(text, cls); l.position.copy(pos); return l; }
function reveal(entries, t) {
  for (const e of entries) {
    e.obj.visible = t >= e.at && (e.until === undefined || t < e.until);
  }
}

// =========================================================================
// Shared translation rig: mRNA + ribosome + tRNAs + growing chain.
// Everything is a pure function of `cy`, the continuous elongation-cycle clock.
//   cy = c + f  ->  ribosome has codon c in its P site, f is the phase:
//     f 0.00-0.38  incoming tRNA docks in the A site
//     f 0.38-0.58  peptide bond: chain hands off from P-site tRNA to A-site tRNA
//     f 0.58-0.85  translocation: ribosome slides one codon along the mRNA
//     f 0.85-1.35  spent tRNA leaves through the E site
// =========================================================================
export function makeTranslationRig(ctx, { stopIndex = null } = {}) {
  const root = new THREE.Group();
  const mut = ctx.state.mutated;
  const mrnaSeq = 'AGU' + transcribe(codingStrand(mut));      // 5'UTR + CDS
  const codons = codonsOf(mrnaSeq.slice(UTR));
  const chain = peptideOf(mrnaSeq.slice(UTR));                // [{codon, aa}]

  // --- mRNA -------------------------------------------------------------
  const mrna = makeRNAStrand({ max: mrnaSeq.length, letterSize: 0.85 });
  root.add(mrna.group);
  const xNt = (k) => k * NT;
  for (let k = 0; k < mrnaSeq.length; k++) {
    mrna.set(k, mrnaSeq[k]);
    const p = V(xNt(k), 0, 0);
    mrna.place(k, p, V(xNt(k), 1, 0), { visible: true, baseLen: 0.9 });
  }
  // 5' cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 18, 14),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4a00, roughness: 0.3 }));
  cap.position.set(-1.6, 0, 0);
  root.add(cap);
  // poly-A tail
  const tail = new THREE.Group();
  for (let k = 0; k < 14; k++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8),
      new THREE.MeshStandardMaterial({ color: BASE_COLOR.A, roughness: 0.4 }));
    b.position.set(xNt(mrnaSeq.length - 1) + 1.0 + k * 0.6, Math.sin(k * 0.9) * 0.35, Math.cos(k * 0.6) * 0.3);
    tail.add(b);
  }
  root.add(tail);

  // reading-frame ribbon: one coloured tile per codon = the amino acid it means
  const frame = new THREE.Group();
  const tiles = codons.map((cd, i) => {
    const aa = translate(cd);
    const m = new THREE.Mesh(new THREE.BoxGeometry(CODON * 0.88, 0.18, 1.0),
      new THREE.MeshStandardMaterial({ color: aaColor(aa), roughness: 0.4, transparent: true, opacity: 0.38,
        emissive: new THREE.Color(aaColor(aa)).multiplyScalar(0.18) }));
    m.position.set(xNt(UTR + i * 3 + 1), -1.05, 0);
    frame.add(m);
    return m;
  });
  root.add(frame);

  // --- ribosome ---------------------------------------------------------
  const ribo = makeRibosome();
  root.add(ribo);
  const sites = {};
  for (const [name, off] of Object.entries(ribo.userData.sites)) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 28),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.30, roughness: 0.4 }));
    ring.position.copy(off).setY(-0.55);
    ring.rotation.x = Math.PI / 2;
    const tag = textSprite(`${name} site`, { size: 0.85, bg: 'rgba(10,14,22,0.75)' });
    tag.position.copy(off).setY(-2.6);
    ribo.add(ring, tag);
    sites[name] = { ring, tag };
  }
  const siteLabels = ['E', 'P', 'A'].map(n => sites[n]);

  // --- tRNA pool --------------------------------------------------------
  const tr = rng(1234);
  const trnas = chain.map((step, i) => {
    if (step.aa === '*') return null;
    const g = makeTRNA(anticodonFor(step.codon), step.aa);
    g.visible = false;
    root.add(g);
    const dir = V(tr() * 2 - 1, 0.7 + tr(), tr() * 2 - 1).normalize();
    return { g, i, spawn: dir.multiplyScalar(26 + tr() * 10), codon: step.codon, aa: step.aa };
  });

  // --- polypeptide ------------------------------------------------------
  const poly = makePolypeptide({ max: chain.length + 2 });
  root.add(poly.group);
  chain.forEach(s => { if (s.aa !== '*') poly.push(s.aa); });
  poly.residues.forEach(r => { r.sphere.visible = false; r.bond.visible = false; });

  // exit path for the nascent chain, in ribosome-local space
  const exitCurve = new THREE.CatmullRomCurve3([
    V(-0.1, 6.2, 0), V(-1.0, 8.1, 0.2), V(-2.2, 9.9, 0.5), V(-3.6, 11.3, 1.0),
    V(-5.6, 12.4, 1.8), V(-8.2, 12.8, 2.6),
  ]);
  const exitLen = exitCurve.getLength();
  const RES = 1.5;               // Ca-Ca spacing, held constant through folding

  const xP = (i) => xNt(UTR + i * 3 + 1);           // world x of codon i's middle base
  const tiltFor = (rel) => lerp(-0.85, -0.05, clamp((rel + 3.45) / 6.9));

  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function exitPoint(d, out) {
    if (d <= exitLen) exitCurve.getPointAt(d / exitLen, out);
    else {
      exitCurve.getPointAt(1, out);
      const o = d - exitLen;
      out.x -= o * 0.90; out.y += Math.sin(o * 0.35) * 1.0; out.z += o * 0.28 + Math.cos(o * 0.3) * 0.8;
    }
    return out;
  }

  // returns useful state for the HUD
  function setCycle(cy, time, { showChain = true } = {}) {
    const c = Math.floor(cy);
    const f = cy - c;
    const translocate = win(f, 0.58, 0.85);
    const riboX = xP(Math.max(0, c)) + CODON * translocate;
    ribo.position.set(riboX, 0, 0);

    // tRNAs
    for (const T of trnas) {
      if (!T) continue;
      const { g, i } = T;
      const enter = win(cy, i - 1, i - 1 + 0.38);
      const leave = win(cy, i + 0.85, i + 1.35);
      const alive = cy > i - 1.05 && leave < 0.999 && (stopIndex === null || i < stopIndex);
      g.visible = alive;
      if (!alive) continue;
      const anchor = V(xP(i), 0, 0);
      g.position.copy(T.spawn).add(anchor).lerp(anchor, enter);
      if (leave > 0) {
        _v.copy(T.spawn).setY(Math.abs(T.spawn.y)).multiplyScalar(0.9).add(anchor);
        g.position.lerp(_v, leave);
      }
      const rel = g.position.x - riboX;
      g.rotation.set(0, 0, tiltFor(rel));
      g.rotation.y = (1 - enter) * 2.4 + leave * 1.8;
      setOpacity(g, Math.min(smooth(enter / 0.25 + 0.001), 1 - leave));
      // its amino acid becomes part of the chain at the peptide-bond step
      const handed = cy >= i - 1 + 0.48;
      g.userData.aa.visible = !handed;
      g.userData.aaTag.visible = !handed;
    }

    // growing chain
    const nRes = clamp(c + 1 + (f >= 0.48 ? 1 : 0), 0, poly.n);
    const handoff = win(f, 0.38, 0.58);
    // anchor = where the C-terminal residue sits: P-site aa -> A-site aa
    _w.copy(ribo.userData.ptcPos).add(ribo.position);
    for (let k = 0; k < poly.n; k++) {
      const r = poly.residues[k];
      const on = showChain && k < nRes;
      r.sphere.visible = on;
      if (!on) { r.bond.visible = false; continue; }
      const j = nRes - 1 - k;
      exitPoint(j * RES, r.pos).add(ribo.position);
      if (j === 0) {
        r.pos.copy(_w).add(V(lerp(-0.4, 0.5, handoff), lerp(0.55, -0.1, handoff), 0));
      }
    }
    poly.layout();
    for (let k = 0; k < poly.n; k++) poly.residues[k].bond.visible = (k > 0 && k < nRes && showChain);

    return { c, f, nRes, riboX };
  }

  return {
    root, mrna, mrnaSeq, ribo, trnas, poly, codons, chain, sites, siteLabels,
    cap, tail, frame, tiles, setCycle, xP, exitPoint, exitLen, RES,
    length: xNt(mrnaSeq.length - 1),
  };
}

// =========================================================================
// 6 — INITIATION
// =========================================================================
const chInitiation = {
  id: 'initiation',
  title: 'Translation: initiation',
  where: 'Cytoplasm · finding the start codon',
  duration: 34,
  legend: 'aa',
  beats: [
    { at: 0.00, h: 'The message meets the machine', p: 'The mature mRNA is now in the cytoplasm. A <b>ribosome</b> will read it three letters at a time. Each triplet — a <b>codon</b> — names one amino acid. 4 letters in groups of 3 gives 64 codons for 20 amino acids, so the code is redundant but never ambiguous.' },
    { at: 0.22, h: 'The small subunit grabs the cap', p: 'The <b>small (40S) subunit</b> binds the 5′ cap and starts sliding along the message, looking for the first <b>AUG</b>.' },
    { at: 0.46, h: 'AUG — start here', p: 'AUG is the start codon. It also codes for methionine, so every protein starts life with a Met on its front (often trimmed off later). Finding AUG sets the <b>reading frame</b>: shift by one letter and every codon after it is wrong.' },
    { at: 0.66, h: 'The initiator tRNA', p: 'A special <b>tRNA</b> carrying methionine drops into the <b>P site</b>, its anticodon UAC pairing with the AUG. tRNAs are the adaptors of biology: one end reads RNA, the other end carries an amino acid.' },
    { at: 0.84, h: 'The large subunit locks on', p: 'The <b>large (60S) subunit</b> clamps down, completing the ribosome and creating three tRNA slots: <b>A</b> (arrival), <b>P</b> (peptide chain), <b>E</b> (exit).' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const rig = makeTranslationRig(ctx);
    root.add(rig.root);
    const { ribo } = rig;
    const large = ribo.userData.large, small = ribo.userData.small;

    const labels = [
      { obj: label("5′ cap", V(-1.6, 2.6, 0)), at: 0.05, until: 0.55 },
      { obj: label('5′ UTR <span class="sub">not translated</span>', V(1.2, -3.4, 0)), at: 0.12, until: 0.55 },
      { obj: label('AUG <span class="sub">start codon</span>', V(rig.xP(0), 3.2, 0)), at: 0.42 },
      { obj: label('Reading frame <span class="sub">one colour = one codon = one amino acid</span>', V(14, -3.6, 0)), at: 0.30 },
      { obj: label('Met-tRNA <span class="sub">anticodon UAC</span>', V(rig.xP(0) - 5, 9, 0)), at: 0.66, until: 0.90 },
      { obj: label('Large subunit (60S)', V(rig.xP(0) - 7, 12.5, 0)), at: 0.88 },
      { obj: label('Small subunit (40S)', V(rig.xP(0) - 6, -6.5, 0)), at: 0.24 },
    ];
    labels.forEach(l => root.add(l.obj));

    const cam = camPath([
      { at: 0.00, pos: [22, 10, 46], target: [22, 0, 0], fov: 46 },
      { at: 0.20, pos: [-2, 6, 26], target: [1, 0, 0], fov: 48 },
      { at: 0.46, pos: [4, 5, 22], target: [5, 1, 0], fov: 46 },
      { at: 0.70, pos: [2, 6, 26], target: [5, 3, 0], fov: 48 },
      { at: 1.00, pos: [-2, 8, 34], target: [4, 4, 0], fov: 48 },
    ]);

    return {
      root,
      update(t, dt, time) {
        // scan: the small subunit slides from the cap to the start codon
        const scan = win(t, 0.24, 0.46);
        const joinLarge = win(t, 0.84, 0.98);
        const dock = win(t, 0.62, 0.82);
        rig.setCycle(0, time, { showChain: false });
        ribo.position.x = lerp(-1.0, rig.xP(0), scan);

        large.visible = joinLarge > 0.02;
        setOpacity(large, joinLarge);
        large.position.y = lerp(16, 4.6, joinLarge);
        ribo.userData.ptc.visible = joinLarge > 0.5;
        rig.siteLabels.forEach((s) => { s.ring.visible = s.tag.visible = joinLarge > 0.6; });

        // initiator tRNA
        const T = rig.trnas[0];
        T.g.visible = dock > 0.02;
        const anchor = V(rig.xP(0), 0, 0);
        T.g.position.copy(V(-14, 22, 8)).add(anchor).lerp(anchor, dock);
        T.g.rotation.set(0, (1 - dock) * 3, -0.5 * dock);
        setOpacity(T.g, dock);
        T.g.userData.aa.visible = T.g.userData.aaTag.visible = true;

        // start-codon glow once found
        const found = win(t, 0.44, 0.54);
        rig.tiles.forEach((m, i) => { m.material.opacity = 0.38 * (i === 0 ? 1.6 : lerp(1, 0.5, found)); });
        for (let k = 0; k < 3; k++) {
          rig.mrna.nts[UTR + k].base.material.emissiveIntensity = 1 + found * (3 + 2 * Math.sin(time * 8));
        }

        labels[2].obj.position.set(rig.xP(0), 3.2, 0);
        reveal(labels, t);
        ctx.hud.set({ mode: 'translation', mrna: rig.mrnaSeq, utr: UTR, codonIndex: t > 0.46 ? 0 : -1, peptide: t > 0.66 ? ['M'] : [] });
      },
      camera: cam,
    };
  },
};

// =========================================================================
// 7 — ELONGATION
// =========================================================================
const chElongation = {
  id: 'elongation',
  title: 'Translation: elongation',
  where: 'Cytoplasm · the cycle that builds the chain',
  duration: 68,
  legend: 'aa',
  beats: [
    { at: 0.00, h: 'One codon at a time', p: 'The ribosome now repeats a four-step cycle, once per codon. Watch the <b>A site</b> — everything starts there.' },
    { at: 0.10, h: '1 · A tRNA arrives', p: 'tRNAs carrying amino acids collide with the ribosome constantly. Only the one whose <b>anticodon</b> base-pairs with the codon in the A site stays. That single pairing check is the entire translation of nucleic-acid language into protein language.' },
    { at: 0.24, h: '2 · Peptide bond', p: 'The ribosome joins the growing chain to the new amino acid. The catalyst is not a protein — it is the ribosome\'s own RNA. The ribosome is a <b>ribozyme</b>, a relic of an RNA-first world.' },
    { at: 0.38, h: '3 · Translocation', p: 'The ribosome ratchets exactly three nucleotides along. Notice the tRNAs do not move — they stay stuck to their codons — the <b>ribosome</b> slides past them. A→P, P→E.' },
    { at: 0.52, h: '4 · The spent tRNA leaves', p: 'The now-empty tRNA drops out of the E site, gets recharged with a fresh amino acid elsewhere in the cell, and comes back. Each cycle costs the equivalent of about 4 ATP.' },
    { at: 0.66, h: 'And again. And again.', p: 'Human ribosomes run this cycle at about <b>5–9 amino acids per second</b>. A 400-residue protein takes roughly a minute. Meanwhile several ribosomes usually read the same mRNA at once, in a chain called a <b>polysome</b>.' },
    { at: 0.86, h: 'The chain is not random', p: 'The order of the amino acids is dictated, letter for letter, by the DNA. Their chemistry — the colours here: yellow water-hating, teal water-loving, red negative, blue positive — is what will make the chain fold into one specific shape.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const rig = makeTranslationRig(ctx);
    root.add(rig.root);
    const nCodons = rig.chain.filter(s => s.aa !== '*').length;   // 12

    // decoration: spare tRNAs milling around in the cytosol
    const spare = new THREE.Group();
    const sr = rng(88);
    for (let k = 0; k < 7; k++) {
      const cd = rig.codons[(sr() * 12) | 0];
      const g = makeTRNA(anticodonFor(cd), translate(cd));
      g.scale.setScalar(0.55);
      g.userData.aaTag.visible = false;          // background traffic, not participants
      g.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.45; } });
      g.userData.drift = { p: V(sr() * 90 - 10, 26 + sr() * 26, -40 - sr() * 40), s: 0.3 + sr() * 0.5, ph: sr() * 9 };
      spare.add(g);
    }
    root.add(spare);

    const labels = [
      { obj: label('A site <span class="sub">arrival</span>', V(0, 0, 0)), at: 0.02, until: 0.62 },
      { obj: label('Peptide bond forms here <span class="sub">peptidyl transferase centre</span>', V(0, 0, 0)), at: 0.20, until: 0.40 },
      { obj: label('Exit tunnel <span class="sub">the chain leaves through the 60S</span>', V(0, 0, 0)), at: 0.28, until: 0.52 },
      { obj: label('Growing polypeptide <span class="sub">N-terminus first</span>', V(0, 0, 0)), at: 0.42 },
    ];
    labels.forEach(l => root.add(l.obj));

    // slow for the first three cycles, then let it run
    const cyOf = (t) => 3 * ease(win(t, 0.02, 0.60)) + (nCodons - 3 - 0.02) * ease(win(t, 0.60, 0.97));

    return {
      root,
      update(t, dt, time) {
        const cy = cyOf(t);
        const st = rig.setCycle(cy, time);
        const rx = st.riboX;

        spare.children.forEach((g) => {
          const d = g.userData.drift;
          g.position.set(d.p.x + rx * 0.55 + Math.sin(time * d.s + d.ph) * 5,
                         d.p.y * (d.ph > 4.5 ? -0.9 : 1) + Math.cos(time * d.s * 0.8 + d.ph) * 4,
                         d.p.z + Math.sin(time * d.s * 0.6 + d.ph) * 5);
          g.rotation.set(time * 0.2 + d.ph, time * 0.3 + d.ph, Math.sin(time * 0.25 + d.ph) * 0.4);
        });

        labels[0].obj.position.set(rx + 3.45, -5.2, 0);
        labels[1].obj.position.set(rx + 1.2, 8.4, 0);
        labels[2].obj.position.set(rx - 6.2, 9.2, 1.6);
        const tip = rig.poly.residues[0];
        labels[3].obj.position.copy(tip.pos).add(V(-1, 2.2, 0));
        reveal(labels, t);

        ctx.hud.set({
          mode: 'translation', mrna: rig.mrnaSeq, utr: UTR,
          codonIndex: st.c, peptide: rig.chain.slice(0, st.nRes).map(s => s.aa),
        });
      },
      camera(t, pos, tgt) {
        const cy = cyOf(t);
        const rx = rig.xP(Math.floor(cy)) + CODON * win(cy - Math.floor(cy), 0.58, 0.85);
        const close = 1 - win(t, 0.58, 0.72);       // tight for the first cycles, then pull back
        const near = V(rx + 1, 7.5, 27), nearT = V(rx + 1, 4.2, 0);
        const far = V(rx - 6, 13, 48), farT = V(rx - 6, 5, 0);
        pos.copy(far).lerp(near, close);
        tgt.copy(farT).lerp(nearT, close);
        return 47;
      },
    };
  },
};

// =========================================================================
// 8 — TERMINATION
// =========================================================================
const chTermination = {
  id: 'termination',
  title: 'Termination',
  where: 'Cytoplasm · stop codon',
  duration: 26,
  legend: 'aa',
  beats: [
    { at: 0.00, h: 'A codon with no tRNA', p: 'The A site now holds <b>UAA</b>. No tRNA in the cell has a matching anticodon — three of the 64 codons (UAA, UAG, UGA) mean nothing but "stop".' },
    { at: 0.34, h: 'Release factor', p: 'Instead, a protein called a <b>release factor</b> fits into the empty A site. It is shaped like a tRNA but carries no amino acid. It makes the ribosome add water to the chain instead of another residue, cutting it free.' },
    { at: 0.62, h: 'Everything comes apart', p: 'The finished polypeptide is released, the two ribosomal subunits separate, and the mRNA is free to be read again — or to be destroyed once its poly-A tail runs down.' },
    { at: 0.84, h: 'A chain, not yet a protein', p: 'What is released is a floppy string of 12 amino acids (a real beta-globin chain is 147). A string does nothing. It has to fold.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const rig = makeTranslationRig(ctx, { stopIndex: 12 });
    root.add(rig.root);
    const nCodons = 12;

    // release factor: a tRNA-shaped protein with no cargo
    const rf = new THREE.Group();
    const rfBody = blob(1.6, 5, new THREE.MeshStandardMaterial({
      color: 0xff6bd6, roughness: 0.3, transparent: true, opacity: 0.8,
      emissive: 0x4a0033 }), { seed: 44, amp: 0.16, lobes: 4 });
    rfBody.scale.set(0.85, 2.0, 0.85);      // roughly tRNA-shaped, carrying nothing
    const rfTag = textSprite('release factor', { size: 1.0 });
    rfTag.position.set(0, 4.6, 0);
    rf.add(rfBody, rfTag);
    rf.visible = false;
    root.add(rf);

    const labels = [
      { obj: label('UAA <span class="sub">stop — no matching tRNA exists</span>', V(0, 0, 0)), at: 0.03, until: 0.62 },
      { obj: label('Free polypeptide', V(0, 0, 0)), at: 0.66 },
      { obj: label('mRNA <span class="sub">re-usable</span>', V(0, 0, 0)), at: 0.74 },
    ];
    labels.forEach(l => root.add(l.obj));

    const stopX = rig.xP(nCodons);

    return {
      root,
      update(t, dt, time) {
        const cy = (nCodons - 1) + ease(win(t, 0.02, 0.30)) * 0.99;
        const st = rig.setCycle(cy, time);
        const rx = st.riboX;

        const rfIn = win(t, 0.32, 0.52);
        rf.visible = rfIn > 0.02;
        rf.position.set(lerp(rx + 22, rx + 3.45, rfIn), lerp(20, 3.0, rfIn), lerp(10, 0, rfIn));
        setOpacity(rf, rfIn * (1 - win(t, 0.80, 0.95)));

        // the chain lets go and drifts off
        const cut = win(t, 0.56, 0.86);
        rig.poly.group.position.set(-cut * 7, cut * 3 + Math.sin(time) * 0.4 * cut, cut * 4);
        rig.poly.group.rotation.z = cut * 0.35;

        // subunits separate
        const apart = win(t, 0.66, 0.94);
        rig.ribo.userData.large.position.y = 4.6 + apart * 14;
        rig.ribo.userData.large.position.x = -apart * 5;
        rig.ribo.userData.small.position.y = -2.4 - apart * 8;
        rig.ribo.userData.ptc.visible = apart < 0.3;
        rig.siteLabels.forEach(s => { s.ring.visible = s.tag.visible = apart < 0.3; });
        rig.trnas.forEach(T => { if (T && apart > 0.4) setOpacity(T.g, 1 - apart); });

        // glow the stop codon
        for (let k = 0; k < 3; k++) {
          const nt = rig.mrna.nts[UTR + nCodons * 3 + k];
          if (nt) nt.base.material.emissiveIntensity = 1 + (0.5 + 0.5 * Math.sin(time * 7)) * 4 * (1 - apart);
        }

        labels[0].obj.position.set(stopX, 3.4, 0);
        labels[1].obj.position.copy(rig.poly.residues[0].pos).add(V(-2, 2.5, 0));
        labels[2].obj.position.set(rx + 6, -4.2, 0);
        reveal(labels, t);

        ctx.hud.set({ mode: 'translation', mrna: rig.mrnaSeq, utr: UTR, codonIndex: nCodons,
          peptide: rig.chain.slice(0, 12).map(s => s.aa) });
      },
      camera: camPath([
        { at: 0.00, pos: [rig.xP(11) + 2, 8, 30], target: [rig.xP(11) + 3, 4, 0], fov: 47 },
        { at: 0.40, pos: [rig.xP(11) + 4, 9, 26], target: [rig.xP(11) + 4, 4, 0], fov: 47 },
        { at: 0.75, pos: [rig.xP(11) - 8, 12, 40], target: [rig.xP(11) - 6, 6, 0], fov: 48 },
        { at: 1.00, pos: [rig.xP(11) - 14, 14, 46], target: [rig.xP(11) - 12, 8, 0], fov: 48 },
      ]),
    };
  },
};

// =========================================================================
// Globin fold generator
// -------------------------------------------------------------------------
// A real protein backbone is a compact tour of space with regular helical
// stretches on it. Rather than hand-placing eight helix axes (and fighting the
// loop-length constraints between them), we walk a smooth guide curve: inside a
// helix the guide advances by the true alpha-helix rise per residue and the
// residue is offset onto a corkscrew of the true radius; in a loop it advances
// by roughly a Ca-Ca step. That keeps every bond ~3.8 A and still produces
// eight visibly helical runs packed into a globule.
// =========================================================================
const HELIX_RISE = 0.587;    // 1.5 A per residue, in world units
const HELIX_RADIUS = 0.90;   // 2.3 A -> chord + rise gives the real 3.8 A Ca-Ca step
const HELIX_TWIST = 100 * Math.PI / 180;
const LOOP_STEP = 1.5;
const CA = 1.5;              // Ca-Ca spacing

function helixIndexMap(n) {
  const m = new Int8Array(n).fill(-1);
  HBB_HELICES.forEach((h, k) => { for (let i = h.a; i <= h.b && i < n; i++) m[i] = k; });
  return m;
}

// deterministic compact guide curve — a wandering tour of a small shell
function guideCurve(seed = 5) {
  const r = rng(seed);
  const pts = [];
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const K = 32;   // enough waypoints that the guide is longer than the chain needs
  for (let k = 0; k < K; k++) {
    const y = 1 - (k / (K - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = k * GOLD * 2.1;
    const shell = 5.8 * (0.70 + 0.30 * Math.sin(k * 1.9 + 0.4)) + (r() - 0.5) * 1.0;
    pts.push(new THREE.Vector3(Math.cos(th) * rad, y * 0.95, Math.sin(th) * rad).multiplyScalar(shell));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
}

export function globinFold(n = HBB_PRECURSOR.length, seed = 5) {
  const curve = guideCurve(seed);
  const total = curve.getLength();
  const inHelix = helixIndexMap(n);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const endP = new THREE.Vector3(), endT = new THREE.Vector3();
  curve.getPointAt(1, endP); curve.getTangentAt(1, endT);
  const up = new THREE.Vector3(0, 1, 0), U = new THREE.Vector3(), W = new THREE.Vector3();

  // pass 1 — walk the guide, recording a local frame per residue. Radius and
  // step ease across helix boundaries; a hard switch would put two consecutive
  // residues in the same place.
  const G = [];
  let phase = 0, s = 0, rad = 0, step = LOOP_STEP;
  for (let i = 0; i < n; i++) {
    const helical = inHelix[i] >= 0;
    rad += ((helical ? HELIX_RADIUS : 0) - rad) * 0.55;
    step += ((helical ? HELIX_RISE : LOOP_STEP) - step) * 0.55;
    if (s <= total) { curve.getPointAt(s / total, P); curve.getTangentAt(s / total, T); }
    else { P.copy(endP).addScaledVector(endT, s - total); T.copy(endT); }   // never pile up at the end
    U.crossVectors(T, up);
    if (U.lengthSq() < 1e-6) U.set(1, 0, 0); else U.normalize();
    W.crossVectors(T, U).normalize();
    phase += HELIX_TWIST;
    G.push({ P: P.clone(), U: U.clone(), W: W.clone(), rad, phase });
    s += step;
  }

  // pass 2 — spin each helix about its own axis so its hydrophobic face points
  // at the core. Real helices are amphipathic for exactly this reason: the
  // greasy side is buried, the charged side meets water.
  const d = new THREE.Vector3(), inward = new THREE.Vector3();
  const offset = HBB_HELICES.map((h) => {
    let best = 0, bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const phi = (k / 24) * Math.PI * 2;
      let score = 0;
      for (let i = h.a; i <= h.b && i < n; i++) {
        const g = G[i];
        d.copy(g.U).multiplyScalar(Math.cos(g.phase + phi)).addScaledVector(g.W, Math.sin(g.phase + phi));
        inward.copy(g.P).multiplyScalar(-1);
        if (inward.lengthSq() > 1e-6) inward.normalize();
        score += (AA[HBB_PRECURSOR[i]].cls === 'hydrophobic' ? 1 : -0.6) * d.dot(inward);
      }
      if (score > bestScore) { bestScore = score; best = phi; }
    }
    return best;
  });

  // pass 3 — final positions
  const out = [];
  for (let i = 0; i < n; i++) {
    const g = G[i];
    const phi = inHelix[i] >= 0 ? offset[inHelix[i]] : 0;
    out.push(g.P.clone()
      .addScaledVector(g.U, Math.cos(g.phase + phi) * g.rad)
      .addScaledVector(g.W, Math.sin(g.phase + phi) * g.rad));
  }

  // hydrophobic collapse: greasy residues are pulled toward the core and
  // charged ones pushed toward the water, while relax() keeps bonds at 3.8 A.
  const pull = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cls = AA[HBB_PRECURSOR[i]].cls;
    pull[i] = cls === 'hydrophobic' ? -0.10 : (cls === 'polar' ? 0.05 : 0.09);
  }
  relax(out, 18, 1.15, pull);
  const c = out.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / out.length);
  out.forEach(p => p.sub(c));
  return { points: out, inHelix, guideLength: total, guideUsed: s };
}

// A few passes of push-apart-then-restore-bond-length. The guide curve packs the
// chain tightly enough that distant parts of it can end up inside each other;
// this separates them without unwinding the helices (i..i+3 in a helix is ~5 A,
// comfortably above the 1.15-unit floor).
function relax(pts, iters = 14, floor = 1.15, pull = null) {
  const n = pts.length, d = new THREE.Vector3(), mid = new THREE.Vector3();
  for (let it = 0; it < iters; it++) {
    if (pull) {
      mid.set(0, 0, 0);
      for (const p of pts) mid.add(p);
      mid.multiplyScalar(1 / n);
      for (let i = 0; i < n; i++) {
        d.subVectors(pts[i], mid);
        const L = d.length() || 1e-6;
        pts[i].addScaledVector(d, pull[i] / L);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 3; j < n; j++) {
        d.subVectors(pts[j], pts[i]);
        const L = d.length();
        if (L < floor && L > 1e-6) {
          d.multiplyScalar((floor - L) * 0.5 / L);
          pts[j].add(d); pts[i].sub(d);
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      for (let i = 1; i < n; i++) {
        d.subVectors(pts[i], pts[i - 1]);
        const L = d.length() || 1e-6;
        d.multiplyScalar((L - CA) * 0.5 / L);
        pts[i].sub(d); pts[i - 1].add(d);
      }
    }
  }
}

// an unfolded chain: a persistent random walk, floppy and spread out
function randomCoil(n, seed = 11, span = 30) {
  const r = rng(seed);
  const pts = [new THREE.Vector3(0, 0, 0)];
  const d = new THREE.Vector3(1, 0.2, 0.1).normalize();
  for (let i = 1; i < n; i++) {
    d.x += (r() - 0.5) * 0.75; d.y += (r() - 0.5) * 0.75; d.z += (r() - 0.5) * 0.75;
    d.normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, CA));
  }
  const box = new THREE.Box3().setFromPoints(pts);
  const size = box.getSize(new THREE.Vector3()).length();
  const c = box.getCenter(new THREE.Vector3());
  const k = span / size;
  pts.forEach(p => p.sub(c).multiplyScalar(k));
  return pts;
}

// find a surface pocket to seat the haem in
function pocketPoint(points) {
  let best = null, bestScore = -1;
  const dir = new THREE.Vector3();
  for (let k = 0; k < 120; k++) {
    const th = k * 2.399, y = 1 - (k / 119) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    dir.set(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(5.2);
    let near = Infinity;
    for (const p of points) near = Math.min(near, p.distanceToSquared(dir));
    if (near > bestScore) { bestScore = near; best = dir.clone(); }
  }
  return best;
}

// =========================================================================
// 9 — FOLDING
// =========================================================================
const chFolding = {
  id: 'folding',
  title: 'Folding',
  where: 'Cytoplasm · sequence → shape',
  duration: 46,
  legend: 'aa',
  beats: [
    { at: 0.00, h: 'The whole chain', p: 'Here is the real thing: all <b>147 amino acids</b> of beta-globin, in the order the ribosome laid them down. The first twelve are the ones we just watched being built. Fresh off the ribosome it is a floppy random coil — it does nothing.' },
    { at: 0.16, h: 'Chemistry does the folding', p: 'Nothing folds this by hand. Water does it. The yellow residues are <b>hydrophobic</b> — they cannot hydrogen-bond with water, so water squeezes them together into the middle. The coloured, water-loving residues end up on the outside.' },
    { at: 0.38, h: 'Local structure first', p: 'Backbone hydrogen bonds snap short stretches into regular shapes: the corkscrew <b>alpha helix</b>, or flat <b>beta sheets</b>. Beta-globin is almost all helix — eight of them, named A to H, and they pack around a pocket.' },
    { at: 0.56, h: 'One sequence, one shape', p: 'The fold is not chosen; it is the lowest-energy arrangement of that exact sequence. Anfinsen showed in the 1950s that a denatured protein re-folds to the same shape on its own. Change the sequence and you change the shape — and <b>misfolding</b> is what goes wrong in Alzheimer\'s, Parkinson\'s and CJD.' },
    { at: 0.72, h: 'The pocket has a job', p: 'The eight helices cradle a <b>haem</b> group — a flat ring holding a single iron atom. That iron is what binds oxygen. This is the point of the whole exercise: a specific shape that does a specific chemical job.' },
    { at: 0.86, h: 'DNA → RNA → protein → you', p: 'Two alpha chains, two beta chains and four haems assemble into one molecule of <b>haemoglobin</b>, which carries four O₂ at a time. Your body makes about 2.4 million red blood cells every second, each packed with roughly 270 million of these.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    const chainGroup = new THREE.Group();
    root.add(chainGroup);
    const seq = HBB_PRECURSOR;
    const n = seq.length;
    const { points: folded, inHelix } = globinFold(n);
    const coil = randomCoil(n, 11, 34);

    const spheres = [], bonds = [];
    for (let i = 0; i < n; i++) {
      const col = aaColor(seq[i]);
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35,
          emissive: new THREE.Color(col).multiplyScalar(0.18) }));
      chainGroup.add(m); spheres.push(m);
      if (i > 0) {
        const b = makeSegment(new THREE.MeshStandardMaterial({ color: 0xc7d2e0, roughness: 0.5 }));
        chainGroup.add(b); bonds.push(b);
      }
    }
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0x8fa9c9, roughness: 0.4, transparent: true, opacity: 0, depthWrite: false });
    const ribbon = new THREE.Mesh(new THREE.BufferGeometry(), ribbonMat);
    chainGroup.add(ribbon);

    // haem in the pocket
    const haem = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.30, 6),
      new THREE.MeshStandardMaterial({ color: 0x8e1b2e, roughness: 0.3, metalness: 0.25, emissive: 0x35000c }));
    disc.rotation.x = Math.PI / 2;
    const fe = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xe08a35, metalness: 0.7, roughness: 0.25, emissive: 0x4a2200 }));
    const o2 = new THREE.Group();
    [-0.38, 0.38].forEach(dx => {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0x6fd0ff, emissive: 0x0a3b52, roughness: 0.3 }));
      sp.position.set(dx, 0, 0); o2.add(sp);
    });
    o2.position.set(0, 1.35, 0);
    haem.add(disc, fe, o2);
    const pocket = pocketPoint(folded);
    haem.position.copy(pocket);
    haem.lookAt(0, 0, 0);
    haem.visible = false;
    chainGroup.add(haem);

    // the other three subunits. The atomic chain we just folded becomes the
    // fourth (a beta chain), so the four are spaced to match its size.
    const others = new THREE.Group();
    const SUB_POS = { b1: V(-7, -6, 2), a1: V(-7, 6, -2), a2: V(7, -6, -2), b2: V(7, 6, 2) };
    const SUBS = [
      ['α chain', 0x6fa8ff, SUB_POS.a1],
      ['α chain', 0x6fa8ff, SUB_POS.a2],
      ['β chain', 0xff8f8f, SUB_POS.b2],
    ];
    SUBS.forEach(([nm, col, at], i) => {
      const g = new THREE.Group();
      const b = blob(5.5, 6, new THREE.MeshStandardMaterial({
        color: col, roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false,
        side: THREE.FrontSide }), { seed: 60 + i, amp: 0.20, lobes: 5 });
      const h = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0xb02a42, emissive: 0x6b0e20, roughness: 0.3, metalness: 0.2 }));
      h.rotation.x = Math.PI / 2; h.position.set(1.8, 0.6, 2.6);
      const fe2 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xe08a35, metalness: 0.7, roughness: 0.25, emissive: 0x5a3000 }));
      fe2.position.copy(h.position);
      g.add(fe2);
      const tag = textSprite(nm, { size: 1.5 });
      tag.position.set(0, 7.2, 0);
      g.add(b, h, tag);
      g.position.copy(at);
      others.add(g);
    });
    const selfShell = blob(5.5, 6, new THREE.MeshStandardMaterial({
      color: 0xff8f8f, roughness: 0.4, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.FrontSide }), { seed: 77, amp: 0.20, lobes: 5 });
    selfShell.position.copy(SUB_POS.b1);
    others.add(selfShell);
    const selfTag = textSprite('β chain · the one we built', { size: 1.5 });
    selfTag.position.copy(SUB_POS.b1).add(V(0, 7.2, 0));
    selfTag.visible = false;
    others.add(selfTag);
    others.visible = false;
    root.add(others);

    const labels = [
      { obj: label('147 residues <span class="sub">the first 12 are the ones we built</span>', V(0, 0, 0)), at: 0.02, until: 0.20 },
      { obj: label('Hydrophobic core <span class="sub">water pushes yellow residues inward</span>', V(0, -11, 0)), at: 0.20, until: 0.40 },
      { obj: label('α-helix <span class="sub">3.6 residues per turn</span>', V(0, 0, 0)), at: 0.40, until: 0.70 },
      { obj: label('Haem <span class="sub">Fe²⁺ binds O₂</span>', V(0, 0, 0)), at: 0.74, until: 0.88 },
      { obj: label('Haemoglobin <span class="sub">α₂β₂ · 4 haems · 4 O₂ per molecule</span>', V(0, 17, 0)), at: 0.90 },
      { obj: label('schematic globin fold <span class="sub">real bond lengths and helix geometry; helix packing is approximate</span>', V(0, -8.6, 0), 'muted'), at: 0.44, until: 0.72 },
    ];
    labels.forEach(l => root.add(l.obj));

    const pts = folded.map(p => p.clone());
    let frame = 0;
    // anchor the helix callout on the most exposed helical residue
    let helixTag = 0;
    for (let i = 0; i < n; i++) if (inHelix[i] >= 0 && folded[i].length() > folded[helixTag].length()) helixTag = i;
    const helixAnchor = folded[helixTag].clone().multiplyScalar(1.28);
    const _lp = new THREE.Vector3();

    return {
      root,
      update(t, dt, time) {
        const f = ease(win(t, 0.10, 0.66));
        for (let i = 0; i < n; i++) {
          const p = pts[i];
          p.copy(coil[i]).lerp(folded[i], f);
          if (f < 1) p.y += Math.sin(time * 1.5 + i * 0.5) * 0.22 * (1 - f);
          spheres[i].position.copy(p);
          spheres[i].scale.setScalar(lerp(0.72, 0.40, f));
        }
        for (let i = 1; i < n; i++) setSegment(bonds[i - 1], pts[i - 1], pts[i], lerp(0.20, 0.13, f));

        // ribbon costs real time to rebuild, so only while it is actually moving
        if ((f > 0.05 && f < 1) ? (frame++ % 2 === 0) : frame === 0) {
          ribbon.geometry.dispose();
          ribbon.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, 0.46, 7, false);
          if (f >= 1) frame = 1;
        }
        ribbonMat.opacity = smooth((f - 0.2) / 0.5) * 0.55;

        // highlight the twelve residues we watched being made
        const hi = 1 - smooth(t / 0.18);
        for (let i = 0; i < 12; i++) {
          spheres[i].material.emissiveIntensity = 1 + hi * (1.6 + Math.sin(time * 5) * 0.8);
          spheres[i].scale.multiplyScalar(1 + hi * 0.5);
        }

        const spin = time * 0.22;
        chainGroup.rotation.y = spin;
        others.rotation.y = spin;

        const hm = win(t, 0.72, 0.84);
        haem.visible = hm > 0.02;
        haem.position.copy(pocket).multiplyScalar(lerp(3.4, 1.0, hm));
        setOpacity(haem, hm);
        o2.position.y = 1.35 + Math.sin(time * 2) * 0.08;

        // assemble the tetramer: the atomic chain becomes one of the four subunits
        const tet = win(t, 0.86, 0.99);
        others.visible = tet > 0.02;
        setOpacity(others, tet);
        others.scale.setScalar(lerp(0.55, 1, tet));
        selfTag.visible = tet > 0.6;
        selfShell.material.opacity = tet * 0.34;
        chainGroup.scale.setScalar(lerp(1, 1.0, tet));
        chainGroup.position.copy(SUB_POS.b1).applyAxisAngle(V(0, 1, 0), spin).multiplyScalar(tet);

        labels[0].obj.position.set(0, 13 + 4 * (1 - f), 0);
        labels[2].obj.position.copy(_lp.copy(helixAnchor).applyAxisAngle(V(0,1,0), chainGroup.rotation.y)).multiplyScalar(f).add(V(0, 1.4, 0));
        labels[3].obj.position.copy(haem.position).add(V(0, 3.2, 0));
        reveal(labels, t);
        ctx.hud.set(t < 0.86 ? { mode: 'protein', peptide: [...seq.slice(0, 12)] } : null);
      },
      camera: camPath([
        { at: 0.00, pos: [0, 6, 62], target: [0, 0, 0], fov: 44 },
        { at: 0.22, pos: [8, 8, 46], target: [0, 0, 0], fov: 46 },
        { at: 0.48, pos: [-6, 5, 34], target: [0, 0, 0], fov: 46 },
        { at: 0.70, pos: [4, 3, 30], target: [0, 0, 0], fov: 46 },
        { at: 0.84, pos: [2, 2, 34], target: [0, 0, 0], fov: 46 },
        { at: 1.00, pos: [0, 2, 62], target: [0, 0, 0], fov: 46 },
      ]),
    };
  },
};

// =========================================================================
// 10 — ONE LETTER
// =========================================================================
function makeRBC(color = 0xd94b4b) {
  const top = [[0, 0.30], [1.2, 0.26], [2.4, 0.50], [3.4, 0.92], [4.2, 1.02], [4.9, 0.72], [5.2, 0.22], [5.28, 0]];
  const prof = [];
  for (let i = top.length - 1; i >= 0; i--) prof.push(new THREE.Vector2(top[i][0], -top[i][1]));
  for (let i = 0; i < top.length; i++) prof.push(new THREE.Vector2(top[i][0], top[i][1]));
  const geo = new THREE.LatheGeometry(prof, 64);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, roughness: 0.45, metalness: 0.05, emissive: new THREE.Color(color).multiplyScalar(0.12) }));
  mesh.userData.base = geo.attributes.position.array.slice();
  return mesh;
}

const chSickle = {
  id: 'sickle',
  title: 'One letter',
  where: 'HBB · GAG → GTG',
  duration: 44,
  legend: 'aa',
  beats: [
    { at: 0.00, h: 'Change one base', p: 'In the sixth residue of the mature beta-globin chain — the seventh codon of the message — one A becomes a T in the DNA. <b>GAG → GTG</b>. One letter out of three billion.' },
    { at: 0.18, h: 'Glutamate becomes valine', p: 'GAG codes for <b>glutamate</b>: negatively charged, happy in water, sits on the protein\'s surface. GUG codes for <b>valine</b>: greasy, water-hating. The mutation puts a sticky hydrophobic patch on the <b>outside</b> of a molecule whose greasy residues are all supposed to be buried.' },
    { at: 0.38, h: 'The fold still works — the surface does not', p: 'This is the cruel part: the protein still folds, still holds its haem, still carries oxygen. Only one dot on its surface changed colour. Everything that follows comes from that one dot.' },
    { at: 0.54, h: 'Sticky proteins polymerise', p: 'After haemoglobin releases its oxygen, that valine patch fits neatly into a pocket on a neighbouring molecule. They chain up into long stiff fibres — and there are roughly 270 million haemoglobin molecules in a single red cell.' },
    { at: 0.74, h: 'The cell deforms', p: 'The fibres distort the soft biconcave disc into a rigid crescent. Sickled cells jam in capillaries — causing pain crises and organ damage — and they rupture early, causing anaemia. That is <b>sickle-cell disease</b>.' },
    { at: 0.90, h: 'Why the gene persists', p: 'One copy of the sickle allele makes red cells hostile to the malaria parasite, so carriers survive better where malaria is endemic — which is why the allele is common. Hit the <b>Mutation</b> button to re-run the whole animation on the sickle sequence and watch the change travel from DNA to shape.' },
  ],
  build(ctx) {
    const root = new THREE.Group();

    // --- the two codons ---
    const rows = new THREE.Group();
    const mkRow = (seq, y) => {
      const g = new THREE.Group();
      [...seq].forEach((ch, i) => {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.35),
          new THREE.MeshStandardMaterial({ color: BASE_COLOR[ch], roughness: 0.35,
            emissive: new THREE.Color(BASE_COLOR[ch]).multiplyScalar(0.28) }));
        box.position.set((i - 1) * 1.75, y, 0);
        const lt = letterSprite(ch, 1.15); lt.position.set((i - 1) * 1.75, y, 0.45);
        g.add(box, lt);
      });
      return g;
    };
    const normalRow = mkRow('GAG', 2.6), sickleRow = mkRow('GUG', -1.4);
    rows.add(normalRow, sickleRow);
    root.add(rows);
    const aaN = textSprite('Glu · negative, water-loving', { size: 1.05, bg: 'rgba(239,83,80,0.9)' });
    aaN.position.set(6.6, 2.6, 0);
    const aaS = textSprite('Val · greasy, water-hating', { size: 1.05, bg: 'rgba(242,193,78,0.92)' });
    aaS.position.set(6.4, -1.4, 0);
    root.add(aaN, aaS);

    // --- the folded molecule, with residue 6 called out ---
    const mol = new THREE.Group();
    const { points } = globinFold();
    const ribbon = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), points.length * 2, 0.46, 8, false),
      new THREE.MeshStandardMaterial({ color: 0x9fb6d4, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false }));
    mol.add(ribbon);
    // every hydrophobic residue, to show they are all buried except this one
    const cores = [];
    for (let i = 0; i < points.length; i += 1) {
      if (AA[HBB_PRECURSOR[i]].cls !== 'hydrophobic') continue;
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.4, transparent: true, opacity: 0.45 }));
      sp.position.copy(points[i]);
      mol.add(sp); cores.push(sp);
    }
    // present the molecule with residue 6 facing the viewer — the whole point of
    // this chapter is one dot on the surface
    const faceCam = new THREE.Quaternion().setFromUnitVectors(
      points[6].clone().normalize(), new THREE.Vector3(0.15, 0.25, 1).normalize());
    const site = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.3, emissive: 0x5a0f0d }));
    site.position.copy(points[6]);
    mol.add(site);

    mol.quaternion.copy(faceCam);
    mol.visible = false;
    root.add(mol);
    const siteWorld = points[6].clone().applyQuaternion(faceCam);

    // --- fibre of stuck-together molecules ---
    const fibre = new THREE.Group();
    const units = [];
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group();
      const b = blob(2.3, 5, new THREE.MeshStandardMaterial({
        color: 0xe86a6a, roughness: 0.4, transparent: true, opacity: 0.9 }), { seed: 70 + k, amp: 0.18, lobes: 4 });
      const patch = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10),
        new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x6b5210, roughness: 0.3 }));
      patch.position.set(2.0, 0.5, 0.7);
      g.add(b, patch);
      g.userData.patch = patch;
      fibre.add(g); units.push(g);
    }
    fibre.visible = false;
    root.add(fibre);

    // --- the red cell ---
    const rbc = makeRBC();
    rbc.material.transparent = true;
    rbc.material.opacity = 0.62;        // so the fibres read as being inside it
    rbc.material.depthWrite = false;
    rbc.scale.setScalar(1.6);
    rbc.position.set(0, -9, 0);
    rbc.visible = false;
    root.add(rbc);
    const pos = rbc.geometry.attributes.position;

    const labels = [
      { obj: label('Normal HBB <span class="sub">codon 7 = GAG</span>', V(-5.4, 2.6, 0)), at: 0.02, until: 0.34 },
      { obj: label('Sickle allele HbS <span class="sub">codon 7 = GUG</span>', V(-5.6, -1.4, 0)), at: 0.12, until: 0.34 },
      { obj: label('Every other greasy residue is buried', V(0, -11, 0), 'muted'), at: 0.40, until: 0.54 },
      { obj: label('Residue 6 <span class="sub">Glu → Val: a greasy patch, on the outside</span>', V(0, 0, 0)), at: 0.42, until: 0.60 },
      { obj: label('Haemoglobin fibre', V(0, 9, 0)), at: 0.60, until: 0.80 },
      { obj: label('Sickled red blood cell', V(0, -20, 0)), at: 0.80 },
    ];
    labels.forEach(l => root.add(l.obj));

    return {
      root,
      update(t, dt, time) {
        const swap = win(t, 0.16, 0.32);
        sickleRow.scale.setScalar(lerp(0.85, 1.15, swap));
        normalRow.scale.setScalar(lerp(1.1, 0.85, swap));
        const showCodons = t < 0.40;
        rows.visible = aaN.visible = aaS.visible = showCodons;
        rows.position.y = 4;

        // molecule: appears, then residue 6 flips from acidic red to greasy yellow
        const molIn = win(t, 0.34, 0.46);
        mol.visible = molIn > 0.02 && t < 0.62;
        setOpacity(mol, molIn * (1 - win(t, 0.56, 0.62)));
        // gentle rock, so residue 6 stays visible
        mol.quaternion.copy(faceCam);
        mol.rotateY(Math.sin(time * 0.45) * 0.5);
        const flip = win(t, 0.44, 0.52);
        site.material.color.setHex(flip > 0.5 ? 0xf2c14e : 0xef5350);
        site.material.emissive.setHex(flip > 0.5 ? 0x6b5210 : 0x5a0f0d);
        site.scale.setScalar(1 + Math.sin(time * 5) * 0.14 * flip);
        labels[3].obj.position.copy(siteWorld).multiplyScalar(1.25).add(V(0, 2.6, 0));

        // fibre
        const poly = win(t, 0.54, 0.76);
        fibre.visible = poly > 0.02;
        setOpacity(fibre, poly);
        const shrink = win(t, 0.76, 0.92);
        fibre.scale.setScalar(lerp(1, 0.30, shrink));
        fibre.position.set(lerp(0, -1.5, shrink), lerp(4, -9, shrink), lerp(0, 0.5, shrink));
        fibre.rotation.z = shrink * 0.35;
        units.forEach((g, k) => {
          const joined = clamp((poly * units.length - k) / 1.2);
          g.position.set((k - 3.5) * lerp(8, 4.0, joined),
                         Math.sin(k * 1.3) * lerp(5, 0.5, joined),
                         Math.cos(k * 0.9) * lerp(4, 0.4, joined));
          g.rotation.y = time * 0.3 + k;
          g.userData.patch.material.emissiveIntensity = 1 + Math.sin(time * 5 + k) * 0.5;
        });

        // The disc bends into a crescent: every vertex is interpolated between its
        // flat position and the same point wrapped around an axis parallel to Y,
        // with the tips tapering. Lathe axis is Y, so the disc lies in XZ.
        const bend = win(t, 0.76, 0.95);
        rbc.visible = t > 0.68;
        const base = rbc.userData.base;
        const R0 = 6.0, ARC = 1.62, RIM = 5.28;
        for (let i = 0; i < pos.count; i++) {
          const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
          const a = (z / R0) * ARC;
          const d = R0 - x;
          const bx = R0 - d * Math.cos(a);
          const bz = d * Math.sin(a);
          const taper = 1 - 0.5 * bend * Math.pow(Math.min(1, Math.abs(z) / RIM), 1.6);
          pos.setXYZ(i, lerp(x, bx, bend) - bend * 2.2, y * taper, lerp(z, bz, bend));
        }
        pos.needsUpdate = true;
        rbc.geometry.computeVertexNormals();
        // face-on, so the biconcave dimple and then the crescent are both readable
        rbc.rotation.set(-Math.PI / 2 + 0.34, 0, Math.sin(time * 0.25) * 0.14);
        rbc.material.color.setHex(bend > 0.5 ? 0xb03a3a : 0xd94b4b);
        setOpacity(rbc, clamp((t - 0.68) / 0.05));

        reveal(labels, t);
        ctx.hud.set(null);
      },
      camera: camPath([
        { at: 0.00, pos: [0, 5, 26], target: [0, 3, 0], fov: 46 },
        { at: 0.26, pos: [2, 4, 22], target: [1, 3, 0], fov: 46 },
        { at: 0.44, pos: [0, 2, 34], target: [0, 0, 0], fov: 46 },
        { at: 0.62, pos: [0, 5, 48], target: [0, 3, 0], fov: 48 },
        { at: 0.84, pos: [0, -3, 52], target: [0, -9, 0], fov: 48 },
        { at: 1.00, pos: [-9, -6, 50], target: [0, -9, 0], fov: 48 },
      ]),
    };
  },
};

export const ACT2 = [chInitiation, chElongation, chTermination, chFolding, chSickle];
