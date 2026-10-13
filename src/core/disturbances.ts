import { INPUT, SIM } from '../config';
import type { Disturbance } from '../sim/waveParams';

const QUEUE_MAX = SIM.MAX_DISTURBANCES * 4;

/** FIFO of pending heightfield pushes; each fixed step drains up to MAX_DISTURBANCES. */
export class DisturbanceQueue {
  private items: Disturbance[] = [];

  push(d: Disturbance): void {
    this.items.push(d);
    if (this.items.length > QUEUE_MAX) this.items.splice(0, this.items.length - QUEUE_MAX);
  }

  take(): Disturbance[] {
    return this.items.splice(0, SIM.MAX_DISTURBANCES);
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/**
 * SPEC §4.1: a drag from `from` to `to` (world xz) over `seconds` becomes
 * Gaussian pushes spaced DRAG_SPACING apart, stronger the faster the pointer moves.
 */
export function dragDisturbances(
  from: [number, number],
  to: [number, number],
  seconds: number,
): Disturbance[] {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (dist === 0 || seconds <= 0) return [];
  const speed = Math.min(dist / seconds, INPUT.DRAG_SPEED_MAX);
  const amount = INPUT.DRAG_AMOUNT_PER_SPEED * speed;
  const count = Math.max(1, Math.round(dist / INPUT.DRAG_SPACING));
  const out: Disturbance[] = [];
  for (let k = 1; k <= count; k++) {
    const t = k / count;
    out.push({
      x: from[0] + (to[0] - from[0]) * t,
      z: from[1] + (to[1] - from[1]) * t,
      radius: INPUT.DRAG_RADIUS,
      amount: amount / count,
    });
  }
  return out;
}
