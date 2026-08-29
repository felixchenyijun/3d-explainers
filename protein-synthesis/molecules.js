// molecules.js — every molecular machine in the film, built from primitives.
import * as THREE from 'three';
import {
  BASE_COLOR, IS_PURINE, DNA_COMPLEMENT, ANTICODON_OF, AA, aaColor,
} from './bio.js';
import { baseMaterial, glassMaterial, blob, letterSprite, textSprite, rng, lerp, clamp, dotTexture } from '../engine/gfx.js';

// --- generic oriented cylinder ("bond") ----------------------------------
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

export function makeSegment(material) {
  const m = new THREE.Mesh(UNIT_CYL, material);
  m.matrixAutoUpdate = true;
  return m;
}
export function setSegment(mesh, a, b, radius) {
  _a.copy(a); _b.copy(b); _d.subVectors(_b, _a);
  const len = _d.length() || 1e-6;
  mesh.position.copy(_a).addScaledVector(_d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
  mesh.scale.set(radius, len, radius);
}

// =========================================================================
// DNA — per-nucleotide so the helix can actually be unzipped
// =========================================================================
export const DNA = {
  rise: 0.92,        // units per base pair (0.34 nm in reality)
  radius: 2.15,      // backbone radius
  bpPerTurn: 10.5,   // B-DNA
  grooveOffset: 2.2, // radians between the two backbones -> major/minor grooves
};

const SUGAR_MAT = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.45, metalness: 0.08 });
const SUGAR_MAT_B = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.5, metalness: 0.08 });

/**
 * Interactive double helix.
 * coding: 5'->3' sense strand string. Template strand is generated complementary.
 * Each base pair exposes .open (0 = paired, 1 = fully separated).
 */
export function makeGeneDNA(coding, { showLetters = true, startIndex = 0 } = {}) {
  const group = new THREE.Group();
  // own material instances: chapters animate opacity and glow on these
  const sugarA = SUGAR_MAT.clone(), sugarB = SUGAR_MAT_B.clone();
  const pairs = [];
  const backboneA = new THREE.Group(), backboneB = new THREE.Group();
  group.add(backboneA, backboneB);

  for (let i = 0; i < coding.length; i++) {
    const bA = coding[i];
    const bB = DNA_COMPLEMENT[bA];
    const sA = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), sugarA);
    const sB = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), sugarB);
    const baseA = makeSegment(baseMaterial(BASE_COLOR[bA]).clone());
    const baseB = makeSegment(baseMaterial(BASE_COLOR[bB]).clone());
    const linkA = i > 0 ? makeSegment(sugarA) : null;
    const linkB = i > 0 ? makeSegment(sugarB) : null;

    let letA = null, letB = null;
    if (showLetters) {
      letA = letterSprite(bA, 0.95); letB = letterSprite(bB, 0.95);
      group.add(letA, letB);
    }
    backboneA.add(sA, baseA); backboneB.add(sB, baseB);
    if (linkA) backboneA.add(linkA);
    if (linkB) backboneB.add(linkB);

    pairs.push({
      i: i + startIndex, a: bA, b: bB, open: 0, hidden: false,
      sugarA: sA, sugarB: sB, baseA, baseB, linkA, linkB, letA, letB,
      posA: new THREE.Vector3(), posB: new THREE.Vector3(),
      tipA: new THREE.Vector3(), tipB: new THREE.Vector3(),
    });
  }

  const helixPoint = (i, angleOffset, radius, out) => {
    const th = i * (Math.PI * 2 / DNA.bpPerTurn) + angleOffset;
    return out.set(i * DNA.rise, Math.cos(th) * radius, Math.sin(th) * radius);
  };

  function layout() {
    for (let k = 0; k < pairs.length; k++) {
      const p = pairs[k];
      const o = p.open;
      const r = DNA.radius * (1 + 0.10 * o);
      helixPoint(p.i, 0, r, p.posA).y += o * 2.5;
      helixPoint(p.i, DNA.grooveOffset, r, p.posB).y -= o * 2.5;
      p.sugarA.position.copy(p.posA);
      p.sugarB.position.copy(p.posB);

      // base paddles: point at the axis when paired, splay outward when open
      const tipA = p.tipA, tipB = p.tipB;
      tipA.set(p.posA.x, 0, 0).lerp(p.posA, 0.10);
      _b.copy(p.posA).setY(p.posA.y - 1.25).setZ(p.posA.z * 0.55);
      tipA.lerp(_b, o);
      tipB.set(p.posB.x, 0, 0).lerp(p.posB, 0.10);
      _b.copy(p.posB).setY(p.posB.y + 1.25).setZ(p.posB.z * 0.55);
      tipB.lerp(_b, o);

      setSegment(p.baseA, p.posA, tipA, IS_PURINE[p.a] ? 0.30 : 0.24);
      setSegment(p.baseB, p.posB, tipB, IS_PURINE[p.b] ? 0.30 : 0.24);
      // letters sit just proud of the paddle, pushed away from the helix axis
      if (p.letA) {
        p.letA.position.copy(tipA).lerp(p.posA, 0.30);
        p.letA.position.y += p.posA.y * 0.16; p.letA.position.z += p.posA.z * 0.16 + 0.30;
      }
      if (p.letB) {
        p.letB.position.copy(tipB).lerp(p.posB, 0.30);
        p.letB.position.y += p.posB.y * 0.16; p.letB.position.z += p.posB.z * 0.16 + 0.30;
      }

      if (k > 0) {
        setSegment(p.linkA, pairs[k-1].posA, p.posA, 0.15);
        setSegment(p.linkB, pairs[k-1].posB, p.posB, 0.15);
      }
      const vis = !p.hidden;
      p.sugarA.visible = p.sugarB.visible = p.baseA.visible = p.baseB.visible = vis;
      if (p.linkA) p.linkA.visible = p.linkB.visible = vis;
      if (p.letA) p.letA.visible = p.letB.visible = vis && o < 0.85;
    }
  }
  layout();

  const length = (coding.length - 1) * DNA.rise;
  return { group, pairs, layout, length, xOf: (i) => (i + startIndex) * DNA.rise };
}

// Cheap decorative double helix (no unzipping) for wide shots / chromatin.
export function makeHelixDecor(bp = 90, { radius = 2.15, seed = 7, dim = 0.55 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const bases = 'ATGC';
  const ptsA = [], ptsB = [];
  for (let i = 0; i <= bp; i++) {
    const th = i * (Math.PI * 2 / DNA.bpPerTurn);
    ptsA.push(new THREE.Vector3(i * DNA.rise, Math.cos(th) * radius, Math.sin(th) * radius));
    ptsB.push(new THREE.Vector3(i * DNA.rise, Math.cos(th + DNA.grooveOffset) * radius, Math.sin(th + DNA.grooveOffset) * radius));
  }
  const mkTube = (pts, color) => new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), bp * 3, 0.17, 8, false),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 }));
  g.add(mkTube(ptsA, 0xdfe6ef), mkTube(ptsB, 0x94a6bd));
  for (let i = 0; i <= bp; i++) {
    const b = bases[(r() * 4) | 0];
    const m = makeSegment(baseMaterial(BASE_COLOR[b], { emissive: 0.10 * dim }));
    setSegment(m, ptsA[i], ptsB[i], 0.20);
    m.material = baseMaterial(BASE_COLOR[b]);
    g.add(m);
  }
  g.userData.length = bp * DNA.rise;
  return g;
}

// =========================================================================
// RNA — single strand, grows one nucleotide at a time
// =========================================================================
export function makeRNAStrand({ max = 64, letterSize = 0.75 } = {}) {
  const group = new THREE.Group();
  const nts = [];
  const RIB = new THREE.MeshStandardMaterial({ color: 0xf6d9b0, roughness: 0.4, metalness: 0.05 });
  for (let i = 0; i < max; i++) {
    const sugar = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), RIB);
    const base = makeSegment(baseMaterial(0xffffff));
    const link = makeSegment(RIB);
    const letter = letterSprite('A', letterSize);
    sugar.visible = base.visible = link.visible = letter.visible = false;
    group.add(sugar, base, link, letter);
    nts.push({ sugar, base, link, letter, char: null, pos: new THREE.Vector3(), tip: new THREE.Vector3() });
  }
  let count = 0;

  function set(i, char) {
    const n = nts[i];
    n.char = char;
    n.base.material = baseMaterial(BASE_COLOR[char]).clone();
    n.letter.material.map = letterSprite(char, letterSize).material.map;
    n.letter.material.needsUpdate = true;
    count = Math.max(count, i + 1);
  }
  // place nucleotide i with backbone at p, base pointing towards `toward`
  function place(i, p, toward, { visible = true, baseLen = 0.95, flip = 1 } = {}) {
    const n = nts[i];
    n.pos.copy(p);
    n.sugar.position.copy(p);
    _d.copy(toward).sub(p);
    if (_d.lengthSq() < 1e-8) _d.set(0, flip, 0);
    n.tip.copy(p).addScaledVector(_d.normalize(), baseLen);
    setSegment(n.base, p, n.tip, IS_PURINE[n.char] ? 0.26 : 0.21);
    n.letter.position.copy(n.tip).addScaledVector(_d, 0.28);
    n.sugar.visible = n.base.visible = n.letter.visible = visible;
    if (i > 0) {
      setSegment(n.link, nts[i-1].pos, p, 0.14);
      n.link.visible = visible && nts[i-1].sugar.visible;
    }
  }
  function hideFrom(i) {
    for (let k = i; k < nts.length; k++) {
      nts[k].sugar.visible = nts[k].base.visible = nts[k].letter.visible = nts[k].link.visible = false;
    }
  }
  return { group, nts, set, place, hideFrom, get count() { return count; } };
}

// =========================================================================
// RNA polymerase II — clamped jaws with a downstream channel
// =========================================================================
export function makePolymerase() {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0x6fd6c9, transparent: true, opacity: 0.26, roughness: 0.25,
    metalness: 0.1, depthWrite: false, side: THREE.FrontSide,
  });
  const core = new THREE.MeshStandardMaterial({ color: 0x2fa89a, roughness: 0.35, transparent: true, opacity: 0.55 });

  const top = blob(4.2, 6, shell, { seed: 3, amp: 0.20, lobes: 4 });
  top.position.set(0, 3.1, 0); top.scale.set(1.1, 0.8, 1.0);
  const bottom = blob(3.7, 6, shell, { seed: 9, amp: 0.20, lobes: 4 });
  bottom.position.set(0, -3.0, 0); bottom.scale.set(1.05, 0.8, 1.0);
  const clamp1 = blob(2.0, 4, core, { seed: 5, amp: 0.25 });
  clamp1.position.set(2.6, 0.9, 1.6);
  const active = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xff9f43, emissive: 0x8a4a00, roughness: 0.3 }));
  active.position.set(0.2, 0, 0);
  active.name = 'activeSite';
  g.add(top, bottom, clamp1, active);
  g.userData.active = active;
  return g;
}

// =========================================================================
// Ribosome — 60S large subunit over 40S small subunit, mRNA in the cleft
// =========================================================================
export function makeRibosome() {
  const g = new THREE.Group();
  const largeMat = new THREE.MeshStandardMaterial({
    color: 0xc3a179, transparent: true, opacity: 0.26, roughness: 0.55, metalness: 0.05,
    depthWrite: false, side: THREE.FrontSide,
  });
  const smallMat = new THREE.MeshStandardMaterial({
    color: 0xa98a6c, transparent: true, opacity: 0.30, roughness: 0.6, metalness: 0.05,
    depthWrite: false, side: THREE.FrontSide,
  });
  const large = blob(5.4, 6, largeMat, { seed: 11, amp: 0.17, lobes: 5 });
  large.scale.set(1.15, 0.95, 1.05);
  large.position.y = 4.6;
  const small = blob(3.9, 6, smallMat, { seed: 21, amp: 0.19, lobes: 4 });
  small.scale.set(1.25, 0.8, 1.05);
  small.position.y = -2.4;

  // peptidyl transferase centre — where the peptide bond is made
  const ptc = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x7a5200, roughness: 0.3, transparent: true, opacity: 0.9 }));
  ptc.position.set(-0.1, 6.2, 0);
  g.add(large, small, ptc);
  g.userData = {
    large, small, ptc,
    // local-space anchors, mRNA runs along +X through y = 0
    sites: { E: new THREE.Vector3(-3.45, 0, 0), P: new THREE.Vector3(0, 0, 0), A: new THREE.Vector3(3.45, 0, 0) },
    ptcPos: new THREE.Vector3(-0.1, 6.2, 0),
    exit: new THREE.Vector3(-3.6, 11.2, 0),
  };
  return g;
}

// =========================================================================
// tRNA — the real L-shape: anticodon at one end, amino acid on the CCA arm
// =========================================================================
export function makeTRNA(anticodon, aaLetter) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8fb6ff, roughness: 0.4, metalness: 0.05 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0xb8cfff, roughness: 0.45 });

  // L-shape: anticodon loop at the bottom, acceptor (CCA) arm up and to -X, so
  // that tilting the A- and P-site tRNAs toward each other converges both amino
  // acids on the peptidyl transferase centre - which is what really happens.
  const spine = [
    new THREE.Vector3(0, 0.4, 0),
    new THREE.Vector3(0.05, 2.0, 0.2),
    new THREE.Vector3(0.1, 3.6, -0.1),
    new THREE.Vector3(-0.1, 5.0, 0.15),
    new THREE.Vector3(-0.9, 5.8, 0),
    new THREE.Vector3(-1.9, 6.0, 0.1),
    new THREE.Vector3(-2.5, 5.95, 0),
  ];
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spine), 90, 0.36, 10, false), mat);
  g.add(tube);
  // D-arm stub, gives it the familiar cloverleaf silhouette in 3D
  const stub = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 3.4, 0), new THREE.Vector3(1.3, 4.0, 0.5), new THREE.Vector3(2.0, 5.1, 0.2),
    ]), 40, 0.3, 8, false), armMat);
  g.add(stub);

  // anticodon: three bases reading 3'->5' against the codon's 5'->3'
  const anticodonBases = [];
  for (let k = 0; k < 3; k++) {
    const ch = anticodon[k];
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xf6d9b0, roughness: 0.4 }));
    s.position.set((k - 1) * 0.92, 0.35, 0);
    const paddle = makeSegment(baseMaterial(BASE_COLOR[ch]));
    setSegment(paddle, s.position, new THREE.Vector3(s.position.x, -0.55, 0), IS_PURINE[ch] ? 0.27 : 0.22);
    const letter = letterSprite(ch, 0.72);
    letter.position.set(s.position.x, -0.85, 0.35);
    g.add(s, paddle, letter);
    anticodonBases.push({ sphere: s, paddle, letter, char: ch });
  }

  // the cargo: one amino acid, esterified to the 3' CCA end
  const info = AA[aaLetter] || AA['*'];
  const aa = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 18),
    new THREE.MeshStandardMaterial({ color: aaColor(aaLetter), roughness: 0.3, metalness: 0.05,
      emissive: new THREE.Color(aaColor(aaLetter)).multiplyScalar(0.25) }));
  aa.position.set(-3.3, 5.95, 0);
  const aaTag = textSprite(info.three, { size: 0.95, bg: 'rgba(10,14,22,0.8)' });
  aaTag.position.set(-3.3, 7.3, 0);
  g.add(aa, aaTag);

  g.userData = { aa, aaTag, anticodon, aaLetter, anticodonBases,
                 ccaOffset: new THREE.Vector3(-3.3, 5.95, 0) };
  return g;
}

export const anticodonFor = (codon) => [...codon].map(c => ANTICODON_OF[c]).join('');

// =========================================================================
// Growing polypeptide
// =========================================================================
export function makePolypeptide({ max = 40 } = {}) {
  const group = new THREE.Group();
  const residues = [];
  for (let i = 0; i < max; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 }));
    const bond = makeSegment(new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.5 }));
    s.visible = bond.visible = false;
    group.add(s, bond);
    residues.push({ sphere: s, bond, pos: new THREE.Vector3(), letter: null });
  }
  let n = 0;
  function push(aaLetter) {
    const r = residues[n];
    r.letter = aaLetter;
    const c = aaColor(aaLetter);
    r.sphere.material = new THREE.MeshStandardMaterial({
      color: c, roughness: 0.32, metalness: 0.03,
      emissive: new THREE.Color(c).multiplyScalar(0.22),
    });
    r.sphere.visible = true;
    n++;
    return r;
  }
  function layout() {
    for (let i = 0; i < n; i++) {
      residues[i].sphere.position.copy(residues[i].pos);
      if (i > 0) {
        setSegment(residues[i].bond, residues[i-1].pos, residues[i].pos, 0.22);
        residues[i].bond.visible = true;
      }
    }
  }
  return { group, residues, push, layout, reset(){ n = 0; residues.forEach(r => { r.sphere.visible = r.bond.visible = false; }); }, get n(){ return n; } };
}

// =========================================================================
// Cell scenery
// =========================================================================
export function makeNuclearPore(radius = 1.5) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x7ad0ff, emissive: 0x134b6b, roughness: 0.35, metalness: 0.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.28, 10, 24), ringMat);
  g.add(ring);
  for (let k = 0; k < 8; k++) {
    const th = (k / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.24, 10, 8), ringMat);
    spoke.position.set(Math.cos(th) * radius, Math.sin(th) * radius, 0);
    g.add(spoke);
  }
  return g;
}

export function makeCell({ detail = 3 } = {}) {
  const g = new THREE.Group();
  const r = rng(42);

  const membrane = blob(60, detail + 3, new THREE.MeshStandardMaterial({
    color: 0x7fb2ff, transparent: true, opacity: 0.10, roughness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  }), { seed: 2, amp: 0.06, lobes: 4 });
  const membraneInner = blob(57.5, detail + 3, new THREE.MeshStandardMaterial({
    color: 0xa9d6ff, transparent: true, opacity: 0.07, roughness: 0.2,
    side: THREE.BackSide, depthWrite: false,
  }), { seed: 2, amp: 0.06, lobes: 4 });

  // nucleus
  const nucleus = new THREE.Group();
  const envelope = blob(22, detail + 2, new THREE.MeshStandardMaterial({
    color: 0x9b7bff, transparent: true, opacity: 0.20, roughness: 0.25,
    side: THREE.DoubleSide, depthWrite: false,
  }), { seed: 6, amp: 0.07, lobes: 4 });
  const nucleoplasm = blob(21, 4, new THREE.MeshStandardMaterial({
    color: 0x5b3fd6, transparent: true, opacity: 0.13, roughness: 0.4, depthWrite: false,
  }), { seed: 6, amp: 0.07, lobes: 4 });
  const nucleolus = blob(6.5, 4, new THREE.MeshStandardMaterial({
    color: 0xff8bd0, roughness: 0.5, transparent: true, opacity: 0.55,
  }), { seed: 15, amp: 0.2 });
  nucleolus.position.set(4, -3, 2);
  nucleus.add(envelope, nucleoplasm, nucleolus);

  // chromatin threads
  for (let k = 0; k < 14; k++) {
    const pts = [];
    const base = new THREE.Vector3(r()*24-12, r()*24-12, r()*24-12).clampLength(0, 15);
    for (let s = 0; s < 7; s++) {
      pts.push(base.clone().add(new THREE.Vector3(r()*12-6, r()*12-6, r()*12-6)).clampLength(0, 18.5));
    }
    const thread = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.30 + r()*0.2, 6, false),
      new THREE.MeshStandardMaterial({ color: 0xcdb6ff, roughness: 0.5, transparent: true, opacity: 0.75 }));
    nucleus.add(thread);
  }

  // nuclear pores studded over the envelope
  const pores = [];
  for (let k = 0; k < 26; k++) {
    const u = r(), v = r();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const n = new THREE.Vector3(Math.sin(ph)*Math.cos(th), Math.sin(ph)*Math.sin(th), Math.cos(ph));
    const pore = makeNuclearPore(1.6);
    pore.position.copy(n).multiplyScalar(21.6);
    pore.lookAt(pore.position.clone().add(n));
    nucleus.add(pore);
    pores.push(pore);
  }

  // rough ER: curved sheets hugging the nucleus, studded with ribosomes
  const er = new THREE.Group();
  const erMat = new THREE.MeshStandardMaterial({
    color: 0x64d6a4, transparent: true, opacity: 0.26, roughness: 0.4,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const riboGeo = new THREE.SphereGeometry(0.62, 8, 6);
  const riboMat = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.6 });
  const ribo = new THREE.InstancedMesh(riboGeo, riboMat, 8 * 46);
  let ri = 0; const m4 = new THREE.Matrix4();
  for (let k = 0; k < 8; k++) {
    const rad = 27 + k * 2.6;
    const sheet = new THREE.Mesh(new THREE.TorusGeometry(rad, 2.6, 10, 72, Math.PI * (0.7 + r() * 0.8)), erMat);
    sheet.rotation.set(r()*Math.PI, r()*Math.PI, r()*Math.PI);
    sheet.scale.z = 0.16;   // flatten the tube into a membrane sheet
    er.add(sheet);
    for (let j = 0; j < 46; j++) {
      const a = r() * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0).applyEuler(sheet.rotation);
      p.addScaledVector(new THREE.Vector3(r()-0.5, r()-0.5, r()-0.5).normalize(), 2.1);
      m4.makeTranslation(p.x, p.y, p.z);
      ribo.setMatrixAt(ri++, m4);
    }
  }
  ribo.count = ri;
  er.add(ribo);

  // Golgi stack
  const golgi = new THREE.Group();
  const golgiMat = new THREE.MeshStandardMaterial({
    color: 0xffb86b, transparent: true, opacity: 0.42, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false });
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(6 - k * 0.6, 0.9, 8, 40, Math.PI * 1.3), golgiMat);
    c.position.y = k * 2.1;
    c.rotation.x = -0.35 + k * 0.04;
    golgi.add(c);
  }
  golgi.position.set(-34, -12, 12);
  golgi.rotation.z = 0.4;

  // mitochondria
  const mito = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const mg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 6.5, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xff7b7b, transparent: true, opacity: 0.5, roughness: 0.45, depthWrite: false }));
    mg.add(body);
    for (let c = 0; c < 6; c++) {
      const cr = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.28, 6, 18, Math.PI * 1.5),
        new THREE.MeshStandardMaterial({ color: 0xffd2d2, roughness: 0.5 }));
      cr.position.y = -3 + c * 1.2; cr.rotation.x = Math.PI / 2; cr.rotation.z = c * 0.7;
      mg.add(cr);
    }
    mg.position.set(r()*70-35, r()*60-30, r()*60-30);
    if (mg.position.length() < 30) mg.position.setLength(34 + r() * 12);
    mg.rotation.set(r()*3, r()*3, r()*3);
    mito.add(mg);
  }

  // free-floating cytoplasmic ribosomes + motes
  const motesGeo = new THREE.BufferGeometry();
  const N = 1400, arr = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const v = new THREE.Vector3(r()*2-1, r()*2-1, r()*2-1).normalize().multiplyScalar(24 + r() * 32);
    arr.set([v.x, v.y, v.z], k * 3);
  }
  motesGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({
    color: 0x9fd8ff, size: 1.1, map: dotTexture(), transparent: true, opacity: 0.45,
    sizeAttenuation: true, depthWrite: false }));

  g.add(membrane, membraneInner, nucleus, er, golgi, mito, motes);
  g.userData = { membrane, nucleus, envelope, pores, er, golgi, mito, motes, nucleolus };
  return g;
}
