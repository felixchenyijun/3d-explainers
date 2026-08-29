// Deep-dive page wiring: the shared tween clock, figure mounting, the
// reading progress bar, and the TOC scroll-spy.

import { stepTweens } from '../anim.js';
import { makeFig } from './fig.js';
import { figShape, figEtcd, figApiserver, figConcurrency } from './figs-a.js';
import { figWatch, figReconcile, figControllers, figScheduler } from './figs-b.js';
import { figKubelet, figLeader, figLessons } from './figs-c.js';
import { figNetwork, figStorage, figOperators } from './figs-d.js';

/* one clock drives every figure's tweens */
let last = performance.now();
function tickClock(now) {
  requestAnimationFrame(tickClock);
  stepTweens(Math.min((now - last) / 1000, .05));
  last = now;
}
requestAnimationFrame(tickClock);

/* figures */
const FIGS = {
  shape: { build: figShape, height: 380, dur: 17 },
  etcd: { build: figEtcd, height: 400, dur: 15 },
  apiserver: { build: figApiserver, height: 340, dur: 18 },
  concurrency: { build: figConcurrency, height: 390, dur: 15 },
  watch: { build: figWatch, height: 430, dur: 19 },
  reconcile: { build: figReconcile, height: 420, dur: 17 },
  controllers: { build: figControllers, height: 440, dur: 15 },
  scheduler: { build: figScheduler, height: 400, dur: 12 },
  kubelet: { build: figKubelet, height: 420, dur: 15 },
  leader: { build: figLeader, height: 380, dur: 14 },
  network: { build: figNetwork, height: 420, dur: 16 },
  storage: { build: figStorage, height: 420, dur: 14 },
  operators: { build: figOperators, height: 440, dur: 15 },
  lessons: { build: figLessons, height: 460, dur: 8 },
};

for (const f of document.querySelectorAll('figure[data-fig]')) {
  const spec = FIGS[f.dataset.fig];
  if (spec) makeFig(f, spec);
}

/* reading progress along the very top */
const readbar = document.getElementById('readbar');
addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  readbar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
}, { passive: true });

/* toc scroll-spy */
const links = [...document.querySelectorAll('#toc a')];
const secs = links.map(a => document.querySelector(a.getAttribute('href')));
const spy = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const i = secs.indexOf(en.target);
    links.forEach((a, j) => a.classList.toggle('is-now', j === i));
  }
}, { rootMargin: '-15% 0px -70% 0px' });
secs.forEach(s => s && spy.observe(s));
