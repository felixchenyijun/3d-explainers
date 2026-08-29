// Deep-dive page wiring: palette, tween clock, figure mounting, the reading
// progress bar, and the TOC scroll-spy. Figures live in figs.js (generated).
import { stepTweens } from '../../engine/tween.js';
import { makeFig, setPalette } from '../../engine/fig.js';
import { FIGS } from './figs.js';

// the film's own dark palette — figures are windows back into the machine
setPalette({
  ink: '#05080d', ink2: '#111a26', ink3: '#1a2735',
  paper: '#e8eef6', paper2: '#c9d4e0', dim: '#8a98ab',
  accent: '#4ecdc4', accentSoft: '#a8e6e0',
  kube: '#4ecdc4', kubeSoft: '#a8e6e0',   // legacy slot names some figures use
  signal: '#f2c14e', signalSoft: '#f8dfa0',
  go: '#2FBF7E', goSoft: '#9CE9C6',
  red: '#ff6b6b',
  stroke: 'rgba(232,238,246,.22)', faint: 'rgba(232,238,246,.12)',
});

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  stepTweens(Math.min((now - last) / 1000, .05));
  last = now;
}
requestAnimationFrame(tick);

for (const f of document.querySelectorAll('figure[data-fig]')) {
  const spec = FIGS[f.dataset.fig];
  if (spec) makeFig(f, spec);
}

const readbar = document.getElementById('readbar');
addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  readbar.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
}, { passive: true });

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
