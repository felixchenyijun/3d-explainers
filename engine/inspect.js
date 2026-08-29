// inspect.js — hover-to-inspect for any film: point at a tracked mesh and a
// small tooltip explains what it is. Subject-free; a chapter registers its own
// meshes and facts.
//
//   const inspect = createInspector();
//   // in each chapter's build():
//   inspect.begin();                       // forget the previous chapter's meshes
//   inspect.track(mesh, '<b>Name</b> — one fact.');
//
// One instance per film. It finds the camera lazily through window.__film, so
// it can be constructed before createFilm() runs, listens once, and never needs
// tearing down when chapters rebuild. Objects that are no longer attached to
// the scene are ignored, so a stale registry cannot resurrect a disposed mesh.
import * as THREE from 'three';

const CSS = `
.inspect-tip { position: fixed; z-index: 40; pointer-events: none;
  max-width: 260px; padding: 8px 11px; border-radius: 9px;
  background: rgba(10, 15, 23, 0.92); border: 1px solid rgba(255,255,255,0.14);
  color: #e8eef6; font: 12.5px/1.5 ui-sans-serif, system-ui, sans-serif;
  box-shadow: 0 6px 24px rgba(0,0,0,0.45);
  opacity: 0; transform: translateY(3px); transition: opacity .12s, transform .12s; }
.inspect-tip.on { opacity: 1; transform: none; }
.inspect-tip b { color: #7fd4cc; }`;

export function createInspector({ getFilm = () => window.__film } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const tip = document.createElement('div');
  tip.className = 'inspect-tip';
  document.body.appendChild(tip);

  const registry = new Map();          // object -> html
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let mx = 0, my = 0, moved = false;

  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY; moved = true;
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });

  const attached = (o, scene) => {
    for (let p = o; p; p = p.parent) if (p === scene) return true;
    return false;
  };

  let hover = null;
  function frame() {
    requestAnimationFrame(frame);
    if (!moved) return;
    moved = false;
    const film = getFilm();
    if (!film || registry.size === 0) return;
    const targets = [...registry.keys()].filter((o) => o.visible && attached(o, film.scene));
    let hit = null;
    if (targets.length) {
      raycaster.setFromCamera(mouse, film.camera);
      const found = raycaster.intersectObjects(targets, true)[0];
      if (found) {
        // the hit may be a child of the tracked object
        for (let p = found.object; p; p = p.parent) if (registry.has(p)) { hit = p; break; }
      }
    }
    if (hit !== hover) {
      hover = hit;
      tip.classList.toggle('on', !!hit);
      if (hit) tip.innerHTML = registry.get(hit);
    }
    if (hit) {
      tip.style.left = Math.min(mx + 16, innerWidth - 280) + 'px';
      tip.style.top = (my + 18) + 'px';
    }
  }
  frame();

  return {
    begin() { registry.clear(); hover = null; tip.classList.remove('on'); },
    track(obj, html) { registry.set(obj, html); return obj; },
  };
}
