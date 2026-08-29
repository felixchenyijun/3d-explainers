# Protein Synthesis, in 3D

An interactive ten-chapter walkthrough of how a cell turns a gene into a working
protein, built with Three.js. It follows one real gene the whole way through —
human **HBB**, the beta chain of haemoglobin, on chromosome 11 — from packed
chromatin, through RNA polymerase and the ribosome, to a folded molecule that
carries oxygen. Then it breaks it with a single letter.

## Run it

From the workspace root:

```bash
node serve.js     # then open http://localhost:8731/protein-synthesis/
```

## Controls

| | |
|---|---|
| `space` | next step — plays one beat, then holds for you |
| `← →` | seek ±5s like a video |
| `↑ ↓` | previous / next chapter |
| `P` | step ↔ auto pacing |
| drag, scroll | orbit and zoom (the film keeps playing; `R` or ⌖ re-centres) |
| `L` | labels on / off |
| `V` | narration on / off |
| `M` | toggle the sickle-cell mutation |

The **Mutation** button re-runs the whole animation on the sickle-cell sequence.
The single base change propagates through every chapter: `GAG → GTG` in the DNA,
`GAG → GUG` in the mRNA, `Glu → Val` in the protein.

## Pacing

By default the film is **self-paced**: each press of play (or `space`) runs one
narration beat's worth of animation, then holds — the pulsing play button means
it is waiting for you. Narration in flight finishes during the hold. The
**Step ▸ / Auto ▸▸** button (or `P`) switches to lean-back continuous playback;
the choice is remembered.

## Narration

The film reads its own narration aloud through the browser's speech synthesis —
no audio files, nothing fetched. The **Voice** button toggles it (the choice is
remembered).

Read at a comfortable pace the script runs about twice the silent running time,
so with narration on **every chapter is stretched to hold its own words**
instead of the voice being sped up to fit the animation: **6:38 silent, 10:54
narrated**. Beats keep their authored positions, so a line still lands on the
moment it describes; a beat that overruns queues into the next rather than being
cut off mid-sentence.

`speech.js` rewrites the molecular shorthand into something speakable — bare
codons become letters (`AUG` → "A U G"), `mRNA` → "m R N A", `5′→3′` → "five
prime to three prime", `µm` → "micrometres", `Glu6Val` → "glutamate six valine".
`node protein-synthesis/speech.test.js` checks the tricky cases and asserts that
all 106 beats come out clean.

## The chapters

1. **One cell** — where everything happens, and why the copy has to leave the nucleus
2. **The gene** — chromosome → nucleosomes → double helix → the HBB promoter and start codon
3. **Transcription** — RNA polymerase II unzips a bubble, reads the template 3′→5′, extrudes mRNA 5′→3′
4. **RNA processing** — 5′ cap, spliceosome removing both real HBB introns as lariats, poly-A tail
5. **Export** — through a nuclear pore complex, cap first
6. **Initiation** — 40S scans from the cap to the first AUG, Met-tRNA, 60S joins, A/P/E sites
7. **Elongation** — the four-step cycle, twelve times, with the chain growing out the exit tunnel
8. **Termination** — UAA, release factor, subunits separate
9. **Folding** — all 147 residues collapse from a random coil into the globin fold, haem, tetramer
10. **One letter** — Glu6Val, fibre formation, a sickled red cell

## What is real and what is schematic

Real:

- The **standard genetic code**, all 64 codons.
- The **HBB coding sequence** (the animation translates its first 12 codons, plus a
  demo stop; the real gene runs 147) and the **full 147-residue protein sequence**.
- **Exon/intron sizes** for HBB: 142 / 130 / 223 / 850 / 861 nt.
- **B-DNA geometry**: 10.5 bp per turn, 0.34 nm rise, asymmetric backbone offset
  so the major and minor grooves are distinguishable.
- **Alpha-helix geometry**: 1.5 Å rise, 2.3 Å radius, 100° per residue — which is
  what makes every Cα–Cα bond in the folded model come out at 3.8 Å.
- Helices A–H are placed at their real residue ranges, and each is rotated so its
  hydrophobic face points at the core, which is why the yellow residues end up
  buried (mean radius 3.1 vs 4.4 for charged ones).
- The sickle mutation, at the codon it actually occurs in.

Schematic:

- **Helix packing** in the folded protein. The backbone is generated along a
  compact guide curve rather than from crystallographic coordinates, so bond
  lengths, helix geometry and the buried core are right but the specific
  arrangement of the eight helices is not the PDB structure.
- A promoter and short 5′ UTR are bolted onto the coding sequence so the film can
  show a TATA box, a transcription start site, and start-codon scanning.
- RNA processing is drawn at gene scale (~80 nucleotides per unit), everything
  else at nucleotide scale.
- Molecular machines (polymerase, ribosome, spliceosome, release factor) are
  shaped lumps with the right topology and binding sites, not solved structures.

## Layout

Only the biology lives here. The renderer, chapter director, camera
choreography and UI chrome come from [`../engine`](../engine) — the
[workspace README](../README.md) documents that API.

```
index.html      importmap + one script tag
main.js         film config: chapters, intro copy, mutation toggle
bio.js          genetic code, HBB sequences, helix assignments -- no rendering
molecules.js    DNA, RNA, ribosome, tRNA, polymerase, polypeptide, organelles
act1.js         cell, gene, transcription, processing, export
act2.js         translation, termination, folding, sickle cell
hud.js          sequence readout + colour legends
speech.js       molecular shorthand -> speakable text
speech.test.js  self-check for the above
```

`window.__film` exposes `seek(chapter, t01)`, `play()`, `pause()` and `info()`
for poking at it from the console.
