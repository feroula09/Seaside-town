import { BLOCK, LAND, SEABED, type LandRect } from '../config';

export function landAt(x: number, z: number): LandRect | undefined {
  // Later entries in LAND are not nested inside earlier ones, so first hit wins.
  return LAND.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

export function isLand(x: number, z: number): boolean {
  return landAt(x, z) !== undefined;
}

function distanceToRect(x: number, z: number, r: LandRect): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

export function distanceToLand(x: number, z: number): number {
  let d = Infinity;
  for (const r of LAND) d = Math.min(d, distanceToRect(x, z, r));
  return d;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Seabed height (SPEC §2.2): shallow near land, deep offshore, gentle ripples. */
export function seabedHeight(x: number, z: number): number {
  const d = distanceToLand(x, z);
  const base = SEABED.SHALLOW + (SEABED.DEEP - SEABED.SHALLOW) * smoothstep(0, SEABED.FALLOFF, d);
  const ripple =
    SEABED.RIPPLE * (0.6 * Math.sin(x * 0.31 + z * 0.17) + 0.4 * Math.sin(x * 0.11 - z * 0.37 + 1.3));
  return base + ripple;
}

/** Grid cell (i, j) centre in world units for an N×N field over the block. Row j runs along +z. */
export function cellCenter(i: number, j: number, n: number): [number, number] {
  const size = BLOCK.HALF * 2;
  return [-BLOCK.HALF + ((i + 0.5) * size) / n, -BLOCK.HALF + ((j + 0.5) * size) / n];
}

/** Water mask (SPEC §2.3): 1 = movable water, 0 = land. Index = j * n + i. */
export function buildWaterMask(n: number): Uint8Array {
  const mask = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const [x, z] = cellCenter(i, j, n);
      mask[j * n + i] = isLand(x, z) ? 0 : 1;
    }
  }
  return mask;
}

export type Edge = 'north' | 'south' | 'west' | 'east';

/** World xz of the point at running coordinate s ∈ [-HALF, HALF] along a block edge. */
export function edgePoint(edge: Edge, s: number): [number, number] {
  const h = BLOCK.HALF;
  switch (edge) {
    case 'north':
      return [s, -h];
    case 'south':
      return [s, h];
    case 'west':
      return [-h, s];
    case 'east':
      return [h, s];
  }
}

/**
 * Intervals along an edge (in the edge's running coordinate, from -HALF to HALF)
 * where there is no land, i.e. where water and seabed meet the block side.
 */
export function waterIntervals(edge: Edge): Array<[number, number]> {
  const h = BLOCK.HALF;
  const cuts = new Set<number>([-h, h]);
  for (const r of LAND) {
    const along = edge === 'north' || edge === 'south' ? [r.x0, r.x1] : [r.z0, r.z1];
    for (const v of along) if (v > -h && v < h) cuts.add(v);
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k];
    const b = sorted[k + 1];
    const [x, z] = edgePoint(edge, (a + b) / 2);
    if (!isLand(x, z)) {
      const last = out[out.length - 1];
      if (last && last[1] === a) last[1] = b;
      else out.push([a, b]);
    }
  }
  return out;
}
