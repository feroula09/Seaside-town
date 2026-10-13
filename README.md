# Seaside Town

A browser diorama toy: a floating harbour block whose sea is a wobbly, see-through jelly.
Built with Three.js (`WebGPURenderer`, falls back to WebGL2) and TypeScript.

- Product requirements: [`docs/PRD.md`](docs/PRD.md)
- Technical spec: [`docs/SPEC.md`](docs/SPEC.md)

## Status

**M0 — technical proof** (SPEC §14):

- Vite + TypeScript + Three.js r184 project, ESLint, Vitest, Playwright
- WebGPU renderer with automatic WebGL2 fallback
- Diorama block: terraces, quays, breakwater, seabed, wavy strata on the sides
- Interactive water heightfield (GPU, ping-pong render targets) with see-through side walls
- Drag the water to make waves, click to poke; orbit / zoom camera

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm run lint
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright, Chromium; builds and serves on :4173)
npm run build
```

URL parameters:

| Parameter | Effect |
|-----------|--------|
| `?renderer=webgl` | Force the WebGL2 backend |
| `?debug=1` | Debug panel: firmness, wave damping, tide, pause, FPS |

## Controls

- Drag on the water: waves
- Click on the water: poke
- Drag anywhere else, or right-drag: orbit
- Middle-drag: pan · Scroll: zoom
