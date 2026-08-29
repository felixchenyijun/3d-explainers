// Tiny promise-based tween engine. Chapters are async functions that await
// these; a chapter is cancelled by flipping its signal's `dead` flag, which
// makes every pending tween throw CANCEL and unwind the chapter cleanly.

export const CANCEL = Symbol('cancel');

const active = new Set();

export const EASE = {
  linear: t => t,
  out:    t => 1 - Math.pow(1 - t, 3),
  in:     t => t * t * t,
  io:     t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back:   t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  elastic: t => t === 0 || t === 1 ? t
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1,
};

export function stepTweens(dt) {
  for (const tw of active) {
    if (tw.signal?.dead) { active.delete(tw); tw.reject(CANCEL); continue; }
    tw.t += dt;
    const u = Math.min(1, tw.t / tw.dur);
    tw.onUpdate(tw.ease(u), u);
    if (u === 1) { active.delete(tw); tw.resolve(); }
  }
}

/** Run `onUpdate(easedT, rawT)` for `dur` seconds. Resolves when finished. */
export function tween({ dur = 1, ease = 'io', onUpdate, signal }) {
  if (signal?.dead) return Promise.reject(CANCEL);
  return new Promise((resolve, reject) => {
    const tw = { t: 0, dur: Math.max(dur, 1e-4), ease: EASE[ease] || ease, onUpdate, signal, resolve, reject };
    onUpdate(tw.ease(0), 0);
    active.add(tw);
  });
}

export const wait = (sec, signal) => tween({ dur: sec, ease: 'linear', onUpdate: () => {}, signal });

/** Repeat `fn` until the chapter is cancelled. Used for ambient loops. */
export async function forever(fn, signal) {
  while (!signal?.dead) await fn();
  throw CANCEL;
}

export function killAll() {
  for (const tw of active) tw.reject(CANCEL);
  active.clear();
}

export const lerp = (a, b, t) => a + (b - a) * t;

/** Frame-rate independent smoothing, for things that follow the mouse/camera. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
