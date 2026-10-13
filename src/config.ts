// All tunable constants live here (SPEC §1.2, Appendix A).

export const BLOCK = {
  HALF: 20, // block spans x,z ∈ [-HALF, HALF]
  BOTTOM: -8,
} as const;

export interface LandRect {
  name: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
}

// SPEC §2.2. Solid land that blocks water. Pier is on piles, so it is not listed.
export const LAND: readonly LandRect[] = [
  { name: 'quay', x0: -20, x1: 12, z0: -12, z1: -8, top: 1.5 },
  { name: 'eastQuay', x0: 12, x1: 20, z0: -12, z1: 20, top: 1.5 },
  { name: 'terrace1', x0: -20, x1: 20, z0: -14, z1: -12, top: 2.5 },
  { name: 'terrace2', x0: -20, x1: 20, z0: -16, z1: -14, top: 4.5 },
  { name: 'terrace3', x0: -20, x1: 20, z0: -18, z1: -16, top: 6.5 },
  { name: 'terrace4', x0: -20, x1: 20, z0: -20, z1: -18, top: 8.5 },
  { name: 'breakwater', x0: 4, x1: 12, z0: 2.4, z1: 3.6, top: 1.0 },
];

export const SEABED = {
  SHALLOW: -2.0, // next to land
  DEEP: -6.0, // open water
  FALLOFF: 14, // distance (u) over which depth goes from SHALLOW to DEEP
  RIPPLE: 0.4,
} as const;

export const SIM = {
  DT: 1 / 120,
  MAX_STEPS_PER_FRAME: 4,
  HF_N: 256,
  WAVE_SPEED_PER_FIRMNESS: 3.0,
  CFL_MAX: 0.7,
  H_CLAMP: 0.8,
  DAMP_LAMBDA_MIN: 0.05,
  DAMP_LAMBDA_RANGE: 2.95,
  MAX_DISTURBANCES: 16,
} as const;

export const INPUT = {
  CLICK_MAX_PX: 6,
  CLICK_MAX_MS: 250,
  DRAG_RADIUS: 0.9,
  DRAG_AMOUNT_PER_SPEED: -0.012,
  DRAG_SPEED_MAX: 20,
  DRAG_SPACING: 0.3,
  POKE_RADIUS: 0.6,
  POKE_AMOUNT: -0.06,
} as const;

export const CAMERA = {
  FOV: 35,
  DIST_MIN: 25,
  DIST_MAX: 110,
  POLAR_MIN_DEG: 15,
  POLAR_MAX_DEG: 80,
  DAMPING: 0.08,
  DEFAULT_POS: [-48, 46, 58] as const,
  DEFAULT_TARGET: [0, -1, -2] as const,
} as const;

// [min, max, step, default]
export const SETTINGS_RANGE = {
  firmness: [0.25, 2.0, 0.05, 1.0],
  waveDamping: [0, 1, 0.01, 0.35],
  tideCm: [-40, 40, 1, 0],
} as const;

export const TIDE_UNITS_PER_CM = 0.01;
