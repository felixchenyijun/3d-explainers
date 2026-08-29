# 3D explainers

A workspace for chaptered Three.js animations. Each film lives in its own
directory and supplies only its subject; everything generic — renderer, bloom,
lights, camera choreography, chapter director, narration, transport, legend,
sequence HUD, keyboard shortcuts — comes from `engine/`.

```bash
node serve.js          # http://localhost:8731
```

ES modules need HTTP; `file://` will not work. Three.js is vendored in
`vendor/`, so nothing is fetched at runtime.

| | |
|---|---|
| [`protein-synthesis/`](protein-synthesis/) | How a cell turns a gene into a working protein. 10 chapters. |
| [`template/`](template/) | Two-chapter starter. Copy it to begin a new film. |
| [`engine/`](engine/) | The shared machinery. No subject-specific code. |
| `vendor/three/` | Three.js 0.185.1 + OrbitControls, CSS2DRenderer, bloom passes. |

## Starting a new film

```bash
cp -r template my-film
```

Then edit `my-film/main.js`. A film is a config object and a list of chapters:

```js
import { createFilm } from '../engine/film.js';

createFilm({
  title: 'My film',
  subtitle: 'a subtitle',
  chapters: [chapterOne, chapterTwo],
  intro: { eyebrow: '…', headline: 'A <em>title</em>', body: '…' },
});
```

A chapter is a plain object. `build()` is called on entry and its `root` is
disposed automatically on exit, so chapters can allocate freely:

```js
const chapterOne = {
  id: 'lattice',
  title: 'A lattice',          // shown in the chapter rail
  where: 'Chapter one',        // small caption above the narration
  duration: 18,                // seconds at 1x
  legend: 'demo',              // key into config.legends, or null
  beats: [                     // narration, swapped as playback passes each `at`
    { at: 0.0, h: 'Heading', p: 'Body copy, HTML allowed.' },
  ],
  build(ctx) {
    const root = new THREE.Group();
    // …
    return {
      root,
      update(t01, dt, elapsed) { /* every frame */ },
      camera: camPath([         // or a function (t01, outPos, outTarget) => fov
        { at: 0, pos: [0, 8, 70], target: [0, 0, 0], fov: 46 },
        { at: 1, pos: [0, 4, 40], target: [0, 0, 0], fov: 46 },
      ]),
    };
  },
};
```

`ctx.state` is your own mutable object, shared across chapters and preserved
across reloads. `ctx.hud.set(data)` hands `data` to `config.renderHud(data)`,
which returns HTML for the bar under the viewport (return `null` to hide it).

### Other config keys

| key | what it does |
|---|---|
| `state` | initial `ctx.state` |
| `legends` | `{ key: [caption, [[label, colorInt], …]] }` |
| `renderHud` | `(data) => htmlString \| null` |
| `toggles` | extra transport buttons — see below |
| `camera` | `{ fov, near, far, start, min, max }` |
| `scene` | `{ background, fog }` |
| `bloom` | `{ strength, radius, threshold }` |
| `lights` | `(scene, THREE) => {}` to replace the default rig |
| `ambient` | drifting motes: `{ count, spread, for: (i) => ({visible, color}) }` |
| `voice` | read the beats aloud — see below |
| `pacing` | `'step'` (default): hold at each beat until the viewer advances; `'auto'`: play through |
| `seekStep` | seconds per ←/→ press (default 5) |

A toggle is a transport button wired to your own state. `film.reload()` rebuilds
the current chapter at the same timestamp, so a toggle can change the whole film
without losing your place:

```js
toggles: [{
  id: 'mutate', key: 'm',
  label:  (s) => 'Mutation: ' + (s.mutated ? 'on' : 'off'),
  active: (s) => s.mutated,
  onClick: (film) => { film.state.mutated = !film.state.mutated; film.reload(); },
}]
```

## Narration

Set `voice` and the engine reads each beat aloud through the browser's speech
synthesis. No audio files, no network, and it works offline.

```js
voice: {
  lang: 'en-GB',
  preferred: ['Serena', 'Daniel'],   // voice names, first match wins
  normalize,                         // (text) => text, for domain shorthand
  targetRate: 1.15,                  // comfortable speaking rate
}
```

Narration usually needs more wall-clock time than the visuals do, so when the
voice is on **each chapter is stretched to hold its own narration** rather than
the speech being rushed to fit. Chapters animate off `t01`, so this just makes
the same choreography take longer; beats keep their authored `at` positions, and
a beat that overruns queues into the next instead of being cut off.

`normalize` is where you fix anything that reads well but speaks badly. The
engine already handles the generic cases (markup, `→`, `′`, `α`, `µm`,
subscripts); yours handles the jargon.

## engine/gfx.js

Helpers worth knowing about, all subject-agnostic:

- `camPath(keys)` — eased camera keyframes
- `htmlLabel(html)` — a CSS2D label that tracks a 3D position
- `letterSprite(char)`, `textSprite(text)` — canvas-texture sprites that face the camera
- `blob(radius, detail, material, {seed, amp, lobes})` — an organic lump, welded so it shades smoothly
- `baseMaterial(color)` — cached; **`.clone()` it** before animating opacity or glow
- `win(t, a, b)`, `smooth`, `ease`, `lerp`, `clamp` — time-window easing
- `rng(seed)` — deterministic, so reloads look identical
- `setOpacity(root, o)`, `disposeDeep(root)`

## Controls

| | |
|---|---|
| `space` | next step (step pacing) / play–pause |
| `← →` | seek ±5s, rolling across chapters |
| `↑ ↓` | previous / next chapter |
| `P` | step ↔ auto pacing |
| drag, scroll | orbit and zoom; `R` or ⌖ hands control back |
| `L` | labels on / off |
| `V` | narration on / off (when the film sets `voice`) |

`window.__film` exposes `seek(chapter, t01)`, `play()`, `pause()`, `reload()`,
`info()` and the raw `scene` / `camera` / `renderer` for console poking.
