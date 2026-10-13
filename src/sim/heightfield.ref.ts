import { SIM } from '../config';
import { cellCenter } from '../world/layout';
import type { Disturbance, WaveParams } from './waveParams';

/**
 * CPU reference of the GPU heightfield step (SPEC §4.1, §13.1).
 * Same formula and boundary handling as `heightfield.ts`; used by unit tests.
 * Boundaries clamp to the edge cell (zero gradient → reflective).
 */
export class HeightfieldRef {
  readonly n: number;
  h: Float32Array;
  hPrev: Float32Array;
  private next: Float32Array;
  private readonly mask: Uint8Array;

  constructor(n: number, mask?: Uint8Array) {
    this.n = n;
    this.h = new Float32Array(n * n);
    this.hPrev = new Float32Array(n * n);
    this.next = new Float32Array(n * n);
    this.mask = mask ?? new Uint8Array(n * n).fill(1);
  }

  private at(field: Float32Array, i: number, j: number): number {
    const n = this.n;
    const ci = i < 0 ? 0 : i >= n ? n - 1 : i;
    const cj = j < 0 ? 0 : j >= n ? n - 1 : j;
    return field[cj * n + ci];
  }

  step(p: WaveParams, disturbances: readonly Disturbance[] = []): void {
    const { n, h, hPrev, next, mask } = this;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const c = h[k];
        const lap =
          this.at(h, i - 1, j) + this.at(h, i + 1, j) + this.at(h, i, j - 1) + this.at(h, i, j + 1) - 4 * c;
        let v = (2 * c - hPrev[k] + p.courant2 * lap) * p.decay;
        if (disturbances.length) {
          const [x, z] = cellCenter(i, j, n);
          for (const d of disturbances) {
            const dx = x - d.x;
            const dz = z - d.z;
            v += d.amount * Math.exp(-(dx * dx + dz * dz) / (d.radius * d.radius));
          }
        }
        v = Math.min(Math.max(v, -SIM.H_CLAMP), SIM.H_CLAMP);
        next[k] = v * mask[k];
      }
    }
    for (let k = 0; k < n * n; k++) hPrev[k] = h[k] * mask[k];
    this.hPrev = hPrev;
    this.h = next;
    this.next = h;
  }

  maxAbs(): number {
    let m = 0;
    for (const v of this.h) m = Math.max(m, Math.abs(v));
    return m;
  }
}
