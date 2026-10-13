import { describe, expect, it } from 'vitest';
import { DisturbanceQueue, dragDisturbances } from '../../src/core/disturbances';
import { FixedStepLoop } from '../../src/core/loop';
import { INPUT, SIM } from '../../src/config';

describe('FixedStepLoop', () => {
  it('runs whole steps and carries the remainder', () => {
    const loop = new FixedStepLoop(0.01, 4);
    expect(loop.advance(0.025, false)).toBe(2);
    expect(loop.alpha).toBeCloseTo(0.5);
    expect(loop.advance(0.005, false)).toBe(1);
  });

  it('runs nothing while paused', () => {
    const loop = new FixedStepLoop(0.01, 4);
    expect(loop.advance(1, true)).toBe(0);
    expect(loop.advance(0.01, false)).toBe(1);
  });

  it('caps steps after a stall and drops the backlog', () => {
    const loop = new FixedStepLoop(0.01, 4);
    expect(loop.advance(5, false)).toBe(4);
    expect(loop.advance(0.001, false)).toBe(0);
  });
});

describe('disturbances', () => {
  it('drains at most MAX_DISTURBANCES per step', () => {
    const q = new DisturbanceQueue();
    for (let k = 0; k < 20; k++) q.push({ x: 0, z: 0, radius: 1, amount: -0.1 });
    expect(q.take()).toHaveLength(SIM.MAX_DISTURBANCES);
    expect(q.take()).toHaveLength(20 - SIM.MAX_DISTURBANCES);
    expect(q.take()).toHaveLength(0);
  });

  it('spaces drag pushes along the path and scales them with speed', () => {
    const slow = dragDisturbances([0, 0], [3, 0], 1);
    const fast = dragDisturbances([0, 0], [3, 0], 0.1);
    expect(slow).toHaveLength(Math.round(3 / INPUT.DRAG_SPACING));
    expect(slow[slow.length - 1].x).toBeCloseTo(3);
    const total = (ds: typeof slow) => ds.reduce((s, d) => s + d.amount, 0);
    expect(total(fast)).toBeLessThan(total(slow)); // more negative = stronger
  });

  it('ignores a pointer that did not move', () => {
    expect(dragDisturbances([1, 1], [1, 1], 0.1)).toEqual([]);
  });
});
