/**
 * Fixed-step accumulator (SPEC §3.1): simulation advances in fixed `dt`
 * steps, at most `maxSteps` per frame so a long stall does not explode.
 */
export class FixedStepLoop {
  private acc = 0;

  constructor(
    readonly dt: number,
    readonly maxSteps: number,
  ) {}

  /** Returns how many fixed steps to run for a frame that took `frameDt` seconds. */
  advance(frameDt: number, paused: boolean): number {
    if (paused) return 0;
    this.acc += Math.max(0, frameDt);
    let steps = Math.floor(this.acc / this.dt);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.acc = 0; // drop the backlog instead of catching up later
    } else {
      this.acc -= steps * this.dt;
    }
    return steps;
  }

  /** Fraction of a step left over, for render interpolation. */
  get alpha(): number {
    return this.acc / this.dt;
  }

  reset(): void {
    this.acc = 0;
  }
}
