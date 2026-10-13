import { describe, expect, it } from 'vitest';
import { BLOCK, LAND, SEABED } from '../../src/config';
import { buildWaterMask, cellCenter, isLand, seabedHeight, waterIntervals } from '../../src/world/layout';

describe('layout', () => {
  it('marks land rects as land and open water as water', () => {
    expect(isLand(0, -10)).toBe(true); // quay
    expect(isLand(16, 0)).toBe(true); // east quay
    expect(isLand(8, 3)).toBe(true); // breakwater
    expect(isLand(-10, 10)).toBe(false);
  });

  it('builds a mask that agrees with isLand at every cell centre', () => {
    const n = 32;
    const mask = buildWaterMask(n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const [x, z] = cellCenter(i, j, n);
        expect(mask[j * n + i]).toBe(isLand(x, z) ? 0 : 1);
      }
    }
  });

  it('keeps the seabed below still water and above the block bottom', () => {
    for (let x = -19; x <= 19; x += 2) {
      for (let z = -7; z <= 19; z += 2) {
        if (isLand(x, z)) continue;
        const y = seabedHeight(x, z);
        expect(y).toBeLessThan(0);
        expect(y).toBeGreaterThan(BLOCK.BOTTOM);
        expect(y).toBeGreaterThanOrEqual(SEABED.DEEP - SEABED.RIPPLE);
      }
    }
  });

  it('is shallower next to land than offshore', () => {
    expect(seabedHeight(-10, -7)).toBeGreaterThan(seabedHeight(-12, 16));
  });

  it('finds the water stretches along each block edge', () => {
    // West edge: land from z=-20 to -8, water from -8 to 20.
    expect(waterIntervals('west')).toEqual([[-8, 20]]);
    // South edge: water from x=-20 to 12, east quay beyond.
    expect(waterIntervals('south')).toEqual([[-20, 12]]);
    // North edge is all terraces.
    expect(waterIntervals('north')).toEqual([]);
    // East edge is all quay or terraces.
    expect(waterIntervals('east')).toEqual([]);
  });

  it('keeps every land rect inside the block', () => {
    for (const r of LAND) {
      expect(r.x0).toBeGreaterThanOrEqual(-BLOCK.HALF);
      expect(r.x1).toBeLessThanOrEqual(BLOCK.HALF);
      expect(r.z0).toBeGreaterThanOrEqual(-BLOCK.HALF);
      expect(r.z1).toBeLessThanOrEqual(BLOCK.HALF);
    }
  });
});
