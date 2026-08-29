// Figure engine for the deep dive. Each figure is an async "build" script,
// written with the same promise-tween engine the 3D walkthrough uses, that
// draws into a fresh SVG every time it plays. Cancellation works exactly like
// the walkthrough's chapters: kill the signal, every pending tween throws.

import { tween as rawTween, wait as rawWait, CANCEL } from '../anim.js';

export const P = {
  ink: '#0B1A2B', ink2: '#16304A', ink3: '#1D3A57',
  paper: '#F2EDE3', paper2: '#E1D9C8', dim: '#6C7F94',
  kube: '#4C7EF3', kubeSoft: '#A9C2FB',
  signal: '#FF6B35', signalSoft: '#FFC0A4',
  go: '#2FBF7E', goSoft: '#9CE9C6',
  red: '#E5484D',
  stroke: 'rgba(242,237,227,.25)',
  faint: 'rgba(242,237,227,.13)',
};

const NS = 'http://www.w3.org/2000/svg';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── raw svg ─────────────────────────────────────────────────────────── */

export function el(name, attrs = {}, parent) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/* ── the runtime ─────────────────────────────────────────────────────── */

export function makeFig(mount, { build, height = 380, dur = 14 }) {
  const panel = document.createElement('div');
  panel.className = 'fig-panel';
  const svg = el('svg', { viewBox: `0 0 900 ${height}`, role: 'img' });
  panel.appendChild(svg);

  const ctl = document.createElement('div');
  ctl.className = 'fig-ctl';
  const btn = document.createElement('button');
  btn.className = 'fig-btn';
  btn.textContent = reduced ? '▶ play' : '↻ replay';
  const prog = document.createElement('div');
  prog.className = 'fig-prog';
  const fill = document.createElement('i');
  prog.appendChild(fill);
  ctl.append(btn, prog);

  const caption = mount.querySelector('figcaption');
  mount.insertBefore(panel, caption);
  mount.insertBefore(ctl, caption);

  let sig = { dead: true };
  let raf = 0;

  async function play() {
    sig.dead = true;
    cancelAnimationFrame(raf);
    sig = { dead: false };
    svg.innerHTML = '';
    const mySig = sig;

    const t0 = performance.now();
    const tickBar = () => {
      if (mySig.dead) return;
      // creep to 96% on the declared duration; snap to 100 on actual finish
      fill.style.width = Math.min(96, ((performance.now() - t0) / 1000 / dur) * 100) + '%';
      raf = requestAnimationFrame(tickBar);
    };
    tickBar();

    try {
      await build(makeCtx(svg, mySig));
      if (!mySig.dead) fill.style.width = '100%';
    } catch (e) {
      if (e !== CANCEL) console.error(e);
    } finally {
      cancelAnimationFrame(raf);
    }
  }

  btn.onclick = play;

  // Autoplay once when the figure scrolls into view — unless the reader asked
  // for reduced motion, in which case the play button is theirs to press.
  if (!reduced) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (en.isIntersecting) { io.disconnect(); play(); }
      }
    }, { threshold: 0.35 });
    io.observe(mount);
  }
}

/* ── drawing context passed to builders ──────────────────────────────── */

function makeCtx(svg, sig) {
  const ctx = {
    svg, sig,
    tween: o => rawTween({ ...o, signal: sig }),
    wait: s => rawWait(s, sig),
  };

  /** group translated to (x,y); everything that moves is one of these */
  ctx.g = (x = 0, y = 0, parent = svg) => {
    const g = el('g', { transform: `translate(${x},${y})` }, parent);
    g.__x = x; g.__y = y;
    return g;
  };

  ctx.place = (g, x, y) => {
    g.__x = x; g.__y = y;
    g.setAttribute('transform', `translate(${x},${y})`);
  };

  ctx.label = (x, y, str, { size = 11, fill = P.dim, anchor = 'middle', ls = '.08em', up = true, w = 400, parent = svg } = {}) => {
    const t = el('text', {
      x, y, fill, 'text-anchor': anchor,
      'font-family': MONO, 'font-size': size, 'letter-spacing': ls, 'font-weight': w,
    }, parent);
    t.textContent = up ? String(str).toUpperCase() : str;
    return t;
  };

  ctx.line = (x1, y1, x2, y2, { stroke = P.faint, width = 1, dash = null, op = 1, parent = svg } = {}) => {
    const l = el('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, opacity: op }, parent);
    if (dash) l.setAttribute('stroke-dasharray', dash);
    return l;
  };

  /** labelled box; returns the group, positioned at its top-left */
  ctx.box = (x, y, w, h, label, { fill = P.ink2, stroke = P.stroke, sub = null, labelFill = P.paper, size = 11.5 } = {}) => {
    const g = ctx.g(x, y);
    el('rect', { width: w, height: h, rx: 3, fill, stroke }, g);
    if (label) ctx.label(w / 2, h / 2 + (sub ? -2 : 4), label, { fill: labelFill, size, parent: g });
    if (sub) ctx.label(w / 2, h / 2 + 13, sub, { fill: P.dim, size: 9.5, parent: g });
    g.__w = w; g.__h = h;
    return g;
  };

  /** small rounded pill with mono text; the moving token of these figures */
  ctx.chip = (x, y, text, { fill = P.kube, color = P.ink, size = 10.5 } = {}) => {
    const w = String(text).length * (size * .62) + 16;
    const g = ctx.g(x, y);
    el('rect', { x: -w / 2, y: -11, width: w, height: 22, rx: 11, fill }, g);
    ctx.label(0, 4, text, { fill: color, size, ls: '.03em', up: false, w: 700, parent: g });
    g.__w = w;
    return g;
  };

  /** etcd-style cylinder */
  ctx.cyl = (x, y, rx, h, label) => {
    const g = ctx.g(x, y);
    const ry = rx * .32;
    el('path', { d: `M${-rx} 0 v${h} a${rx} ${ry} 0 0 0 ${rx * 2} 0 v${-h}`, fill: P.ink2, stroke: P.stroke }, g);
    el('ellipse', { cx: 0, cy: 0, rx, ry, fill: P.ink3, stroke: P.stroke }, g);
    if (label) ctx.label(0, h + ry + 16, label, { fill: P.dim, size: 10, parent: g });
    return g;
  };

  ctx.tick = (x, y, { color = P.go, parent = svg } = {}) =>
    el('path', { d: `M${x - 5} ${y} l4 4 l7 -8`, stroke: color, 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }, parent);

  ctx.cross = (x, y, { color = P.red, r = 6, parent = svg } = {}) => {
    const g = el('g', { stroke: color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, parent);
    el('line', { x1: x - r, y1: y - r, x2: x + r, y2: y + r }, g);
    el('line', { x1: x - r, y1: y + r, x2: x + r, y2: y - r }, g);
    return g;
  };

  /* ── motion ── */

  ctx.move = (g, x, y, { dur = .8, ease = 'io', lift = 0 } = {}) => {
    const fx = g.__x, fy = g.__y;
    return ctx.tween({
      dur, ease,
      onUpdate: u => {
        const px = fx + (x - fx) * u;
        let py = fy + (y - fy) * u;
        if (lift) py -= Math.sin(u * Math.PI) * lift;
        g.setAttribute('transform', `translate(${px},${py})`);
      },
    }).then(() => { g.__x = x; g.__y = y; });
  };

  ctx.fadeIn = (n, dur = .4, to = 1) => {
    n.setAttribute('opacity', 0);
    return ctx.tween({ dur, ease: 'out', onUpdate: u => n.setAttribute('opacity', u * to) });
  };

  ctx.fadeOut = (n, dur = .4) => {
    const from = +(n.getAttribute('opacity') ?? 1);
    return ctx.tween({ dur, ease: 'in', onUpdate: u => n.setAttribute('opacity', from * (1 - u)) })
      .then(() => n.remove());
  };

  ctx.pop = (g, dur = .4) => {
    const { __x: x, __y: y } = g;
    return ctx.tween({
      dur, ease: 'back',
      onUpdate: u => g.setAttribute('transform', `translate(${x},${y}) scale(${Math.max(.001, u)})`),
    }).then(() => g.setAttribute('transform', `translate(${x},${y})`));
  };

  ctx.pulse = (n, { color = P.signal, dur = .5 } = {}) => {
    const r = n.querySelector('rect, ellipse, circle, path');
    if (!r) return Promise.resolve();
    const orig = r.getAttribute('stroke');
    return ctx.tween({
      dur, ease: 'io',
      onUpdate: u => {
        r.setAttribute('stroke', u < .5 ? color : (orig ?? P.stroke));
        r.setAttribute('stroke-width', 1 + Math.sin(u * Math.PI) * 1.6);
      },
    }).then(() => { if (orig) r.setAttribute('stroke', orig); r.setAttribute('stroke-width', 1); });
  };

  /** a dot that travels a line and dies — message traffic */
  ctx.zip = (x1, y1, x2, y2, { color = P.kubeSoft, dur = .55, r = 3.5 } = {}) => {
    const d = el('circle', { r, fill: color }, svg);
    return ctx.tween({
      dur, ease: 'io',
      onUpdate: u => { d.setAttribute('cx', x1 + (x2 - x1) * u); d.setAttribute('cy', y1 + (y2 - y1) * u); },
    }).then(() => d.remove());
  };

  /** banner note at the bottom of the panel */
  ctx.note = async (h, text, { color = P.signalSoft } = {}) => {
    ctx.__note?.remove();
    const g = ctx.g(450, h - 18);
    const w = text.length * 6.6 + 26;
    el('rect', { x: -w / 2, y: -14, width: w, height: 24, rx: 2, fill: 'rgba(6,15,25,.85)', stroke: P.faint }, g);
    ctx.label(0, 2, text, { fill: color, size: 10.5, up: false, parent: g });
    ctx.__note = g;
    await ctx.fadeIn(g, .3);
    return g;
  };

  return ctx;
}
