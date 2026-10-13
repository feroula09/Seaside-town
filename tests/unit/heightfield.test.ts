import { describe, expect, it } from 'vitest';
import { SETTINGS_RANGE, SIM } from '../../src/config';
import { HeightfieldRef } from '../../src/sim/heightfield.ref';
import { assertCfl, waveParams } from '../../src/sim/waveParams';
import { buildWaterMask } from '../../src/world/layout';

const N = 64;

function bumped(mask?: Uint8Array): HeightfieldRef {
  const hf = new HeightfieldRef(N, mask);
  hf.step(waveParams(1, 0.35, N), [{ x: -8, z: 8, radius: 2, amount: -0.4 }]);
  return hf;
}

describe('waveParams', () => {
  it('keeps the solver within CFL for the whole firmness range at every resolution', () => {
    expect(() => assertCfl(SETTINGS_RANGE.firmness[1], SIM.HF_N)).not.toThrow();
    expect(() => assertCfl(SETTINGS_RANGE.firmness[1], 128)).not.toThrow();
  });

  it('rejects a resolution that would break CFL', () => {
    expect(() => assertCfl(SETTINGS_RANGE.firmness[1], 4096)).toThrow(/CFL/);
  });

  it('decays faster with more damping', () => {
    expect(waveParams(1, 1, N).decay).toBeLessThan(waveParams(1, 0, N).decay);
    expect(waveParams(1, 0, N).decay).toBeLessThan(1);
  });

  it('waves travel faster with more firmness', () => {
    expect(waveParams(2, 0.35, N).courant).toBeGreaterThan(waveParams(1, 0.35, N).courant);
  });
});

describe('HeightfieldRef', () => {
  it('stays finite and decays without input', () => {
    const hf = bumped();
    const start = hf.maxAbs();
    expect(start).toBeGreaterThan(0.1);
    const p = waveParams(1, 0.35, N);
    for (let k = 0; k < 1200; k++) hf.step(p);
    expect(Number.isFinite(hf.maxAbs())).toBe(true);
    expect(hf.maxAbs()).toBeLessThan(start * 0.5);
  });

  it('remains bounded at the stiffest, least damped setting', () => {
    const hf = bumped();
    const start = hf.maxAbs();
    const p = waveParams(SETTINGS_RANGE.firmness[1], 0, N);
    for (let k = 0; k < 2000; k++) hf.step(p);
    expect(hf.maxAbs()).toBeLessThanOrEqual(start);
  });

  it('spreads a disturbance outward', () => {
    const hf = bumped();
    const p = waveParams(1, 0.35, N);
    const far = (16 + 0) * N + 50; // a cell well away from the bump
    expect(Math.abs(hf.h[far])).toBe(0);
    for (let k = 0; k < 240; k++) hf.step(p);
    expect(Math.abs(hf.h[far])).toBeGreaterThan(0);
  });

  it('never moves masked (land) cells', () => {
    const mask = buildWaterMask(N);
    const hf = new HeightfieldRef(N, mask);
    const p = waveParams(1, 0.35, N);
    for (let k = 0; k < 300; k++) hf.step(p, k < 5 ? [{ x: 0, z: -6, radius: 3, amount: -0.5 }] : []);
    for (let k = 0; k < N * N; k++) if (mask[k] === 0) expect(Math.abs(hf.h[k])).toBe(0);
  });

  it('clamps extreme pushes', () => {
    const hf = new HeightfieldRef(N);
    hf.step(waveParams(1, 0.35, N), [{ x: 0, z: 0, radius: 1, amount: -50 }]);
    expect(hf.maxAbs()).toBeCloseTo(SIM.H_CLAMP, 5); // stored as float32
  });
});
