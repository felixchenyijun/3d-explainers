// gfx.js — small shared helpers: sprite text, HTML labels, materials, easing.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const ease = (t) => { t = clamp(t); return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; };
// remap a global 0..1 chapter clock onto a sub-window, eased
export const win = (t, a, b, easing = smooth) => easing(clamp((t - a) / (b - a)));

// Deterministic PRNG so every reload looks identical (and bugs reproduce).
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- letter sprites -------------------------------------------------------
// One canvas texture per glyph, cached. Sprites always face the camera, so
// base letters stay readable from any angle and still depth-sort correctly.
const glyphCache = new Map();
function glyphTexture(char, color = '#ffffff', bg = null) {
  const key = char + color + bg;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.beginPath(); g.arc(S/2, S/2, S/2 - 2, 0, Math.PI*2); g.fill();
  }
  g.font = `bold ${Math.round(S * 0.68)}px ui-monospace, "SF Mono", Menlo, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // dark halo first so the glyph reads on any base colour, from any angle
  g.lineWidth = S * 0.11;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(4,8,14,0.92)';
  g.strokeText(char, S/2, S/2 + S*0.04);
  g.fillStyle = color;
  g.fillText(char, S/2, S/2 + S*0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  glyphCache.set(key, tex);
  return tex;
}

export function letterSprite(char, size = 0.9, color = '#ffffff') {
  const mat = new THREE.SpriteMaterial({
    map: glyphTexture(char, color),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

// Short multi-character tag drawn onto a canvas (e.g. "Met", "A site").
const tagCache = new Map();
export function textSprite(text, {
  size = 1.6, color = '#eef2f7', bg = 'rgba(12,16,24,0.72)', border = null, pad = 12,
} = {}) {
  const key = [text, color, bg, border].join('|');
  let tex = tagCache.get(key);
  if (!tex) {
    const F = 64;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `600 ${F}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    const w = Math.ceil(probe.measureText(text).width) + pad * 2;
    const h = F + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.font = probe.font;
    if (bg) {
      const r = h / 2;
      g.fillStyle = bg;
      g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
      if (border) { g.strokeStyle = border; g.lineWidth = 3; g.stroke(); }
    }
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w/2, h/2 + 2);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData.aspect = w / h;
    tagCache.set(key, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  s.scale.set(size * tex.userData.aspect, size, 1);
  s.renderOrder = 20;
  return s;
}

// --- HTML labels (CSS2D) --------------------------------------------------
export function htmlLabel(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'tag ' + cls;
  el.innerHTML = text;
  const obj = new CSS2DObject(el);
  obj.userData.el = el;
  return obj;
}

// --- materials ------------------------------------------------------------
export const matCache = new Map();
const shared = new Set();
// Cached by colour. Anything that animates opacity or glow per object must
// .clone() this first — mutating the cached instance leaks across every mesh
// (and every chapter) that shares the colour.
export function baseMaterial(color, { emissive = 0.18, rough = 0.32, metal = 0.0 } = {}) {
  const key = `${color}|${emissive}|${rough}|${metal}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    emissive: new THREE.Color(color).multiplyScalar(emissive),
  });
  matCache.set(key, m);
  shared.add(m);
  return m;
}

export function glassMaterial(color, opacity = 0.16, side = THREE.DoubleSide) {
  return new THREE.MeshStandardMaterial({
    color, transparent: true, opacity, roughness: 0.15, metalness: 0.0,
    side, depthWrite: false,
  });
}

// --- geometry helpers -----------------------------------------------------
export function tubeFromPoints(points, radius = 0.12, radial = 8, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), radius, radial, false);
  return new THREE.Mesh(geo, material);
}

// A "blobby" organic lump: icosphere pushed around by a few sine lobes.
export function blob(radius, detail, material, { seed = 1, amp = 0.16, lobes = 3 } = {}) {
  // IcosahedronGeometry is non-indexed, so computeVertexNormals would give every
  // face its own normal and the blob renders faceted no matter how fine it is.
  // Welding the duplicate corners first is what makes it read as a smooth lump.
  const geo = mergeVertices(new THREE.IcosahedronGeometry(radius, detail));
  const pos = geo.attributes.position;
  const r = rng(seed);
  const dirs = Array.from({ length: lobes }, () => new THREE.Vector3(r()*2-1, r()*2-1, r()*2-1).normalize());
  const freq = Array.from({ length: lobes }, () => 1.4 + r() * 2.6);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let d = 0;
    for (let k = 0; k < lobes; k++) d += Math.sin(n.dot(dirs[k]) * freq[k] * Math.PI) / lobes;
    v.multiplyScalar(1 + d * amp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

export function disposeDeep(obj) {
  obj.traverse((o) => {
    if (o.isCSS2DObject && o.element?.parentNode) o.element.parentNode.removeChild(o.element);
    if (o.geometry) o.geometry.dispose();
    const m = o.material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => { if (!shared.has(mm)) mm.dispose?.(); });
  });
}

// Fade a whole subtree (used for chapter cross-fades and reveals).
export function setOpacity(root, o) {
  root.traverse((n) => {
    if (n.isCSS2DObject) { n.element.style.opacity = o; return; }
    const m = n.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((mm) => {
      if (mm.userData.baseOpacity === undefined) mm.userData.baseOpacity = mm.opacity ?? 1;
      mm.transparent = true;
      mm.opacity = mm.userData.baseOpacity * o;
    });
  });
}

// --- camera keyframe path -------------------------------------------------
// keys: [{ at, pos:[x,y,z], target:[x,y,z], fov? }] with `at` in 0..1
export function camPath(keys) {
  const A = new THREE.Vector3(), B = new THREE.Vector3();
  return function (t, outPos, outTarget) {
    let i = 0;
    while (i < keys.length - 2 && t > keys[i + 1].at) i++;
    const k0 = keys[i], k1 = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(1e-6, k1.at - k0.at);
    const f = ease(clamp((t - k0.at) / span));
    outPos.copy(A.fromArray(k0.pos)).lerp(B.fromArray(k1.pos), f);
    outTarget.copy(A.fromArray(k0.target)).lerp(B.fromArray(k1.target), f);
    return lerp(k0.fov ?? 45, k1.fov ?? 45, f);
  };
}

// Soft round particle sprite — keeps point clouds from turning into big squares.
let _dotTex = null;
export function dotTexture() {
  if (_dotTex) return _dotTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  _dotTex = new THREE.CanvasTexture(cv);
  return _dotTex;
}
