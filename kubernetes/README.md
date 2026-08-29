# Kubernetes, in 3D

Two connected pieces:

1. **`index.html` — the 3D walkthrough.** What a cluster does, in twelve
   autoplaying chapters, with a running **desired vs actual** ledger pinned to
   the screen — because that gap is the whole idea.
2. **`deep.html` — The Control Plane, Deeply.** How the machine works inside:
   fourteen sections (etcd/Raft, the API server pipeline, optimistic
   concurrency, informers, reconcile loops, controller composition, the
   scheduler, the kubelet, leader election, Service networking/kube-proxy,
   storage/CSI, operators/CRDs, the transferable patterns). Visual-first: short
   setup prose, an animated SVG figure per section that does the teaching,
   tight mechanics after, real annotated YAML (`in practice` blocks), and a
   "pattern to steal" card per section. All content fact-checked by an
   adversarial review pass.

## Run it

```bash
./start.sh             # serves it and opens the browser; Ctrl-C stops
./start.sh 9000        # or pick a port
```

Or by hand: `node serve.js 8742`, then open http://localhost:8742.

Everything is vendored: no network needed at runtime, no build step, no npm
install. Just a static server (ES modules need `http://`, not `file://`).

## Controls

| | |
|---|---|
| `←` `→` | previous / next chapter |
| `space` or the **Pause** button | freeze everything — the scene stops dead, the camera stays yours |
| `R` or ⌖ | re-centre the camera |
| drag / scroll | orbit and zoom (dragging pauses, so autoplay stops yanking the camera) |
| the dots | jump to any chapter |

Three chapters have buttons — **Kill a node**, **Scale to 8**, **Deploy the other
version**. Pressing one pauses autoplay and hands you the cluster.

## The chapters

1. **By hand** — four machines, one app, nobody watching
2. **Cluster** — control plane above, worker nodes below, kubelet on each
3. **Control plane** — api server, etcd, scheduler, controllers
4. **Pod** — the unit is a pod, not a container, and it is disposable
5. **Manifest** — you write down what you want; it lands in etcd as desired state
6. **Scheduler** — filter, score, bind; placement happens once
7. **The loop** — observe, diff, act, repeat, forever
8. **Self-healing** — a node dies and the same loop closes the same gap
9. **Service** — one stable address in front of pods that keep being replaced
10. **Scaling** — change one number
11. **Rolling update** — v2 comes up ready before v1 goes away
12. **Recap** — the whole map in one sentence

## Layout

```
index.html        3D walkthrough — markup + import map
styles.css        walkthrough styling (chart-paper cards over navy water)
deep.html         the deep dive (GENERATED — edit gen_deep.py or sections.json)
deep.css          deep-dive styling (paper document, dark figure panels)
gen_deep.py       assembles deep.html from sections.json + config examples
sections.json     the deep dive's verified prose content
src/main.js       walkthrough: renderer, camera, UI wiring, chapter runner
src/world.js      the 3D cluster: nodes, pods, control plane, service, traffic
src/chapters.js   walkthrough script — each chapter is setup() + async play()
src/anim.js       promise-based tween engine with cancellation (shared)
src/deep/fig.js   deep-dive figure engine (SVG + the same tween engine)
src/deep/figs-*.js the 11 animated figures
src/deep/main.js  deep-dive wiring: clock, figures, TOC spy, progress
serve.js          static file server, caching off
vendor/three      three r185 (build + addons)
vendor/fonts      Bricolage Grotesque, Instrument Sans, JetBrains Mono (woff2)
```

Chapters are async functions. `setup()` snaps the world into a known state so
jumping between chapters is always safe; `play()` choreographs it and is
cancelled mid-`await` when you navigate away.

`window.k8s` is exposed for poking from the console: `go(i)`, `setPlaying(bool)`,
`freeze()`, plus `world`, `camera` and `controls`.
