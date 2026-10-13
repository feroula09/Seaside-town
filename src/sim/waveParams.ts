import { BLOCK, SIM } from '../config';

export interface Disturbance {
  /** World x */
  x: number;
  /** World z */
  z: number;
  radius: number;
  /** Height added at the centre (u). Negative pushes the surface down. */
  amount: number;
}

export interface WaveParams {
  /** c·dt/dx */
  courant: number;
  /** (c·dt/dx)² — the Laplacian weight */
  courant2: number;
  /** Per-step multiplicative decay, exp(-λ·dt) */
  decay: number;
}

/** SPEC §4.1: map the Firmness / Wave damping sliders to solver coefficients. */
export function waveParams(firmness: number, waveDamping: number, n: number = SIM.HF_N): WaveParams {
  const dx = (BLOCK.HALF * 2) / n;
  const c = SIM.WAVE_SPEED_PER_FIRMNESS * firmness;
  const courant = (c * SIM.DT) / dx;
  const lambda = SIM.DAMP_LAMBDA_MIN + SIM.DAMP_LAMBDA_RANGE * waveDamping * waveDamping;
  return { courant, courant2: courant * courant, decay: Math.exp(-lambda * SIM.DT) };
}

/** Throws if the highest firmness the UI allows would make the solver unstable. */
export function assertCfl(maxFirmness: number, n: number = SIM.HF_N): void {
  const { courant } = waveParams(maxFirmness, 0, n);
  if (courant > SIM.CFL_MAX) {
    throw new Error(`Wave solver CFL ${courant.toFixed(3)} exceeds ${SIM.CFL_MAX} at N=${n}`);
  }
}
