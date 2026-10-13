// SPEC §9.1 / §9.3. M0 ships the Sunset atmosphere and the Sea glass flavour;
// the remaining presets arrive with the panel in M1.

export type Atmosphere = 'day' | 'sunset' | 'night' | 'cosmos';
export type Flavour = 'seaglass' | 'blueberry' | 'lime';

export interface AtmospherePreset {
  label: string;
  sky: { top: string; mid: string; bottom: string; sun?: { x: number; y: number; size: number; color: string } };
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientTop: string;
  ambientBottom: string;
  ambientIntensity: number;
  fog: { color: string; near: number; far: number } | null;
  exposure: number;
  landTop: string;
  quayTop: string;
  strata: [string, string, string, string, string];
  seabed: string;
}

export const ATMOSPHERES: Partial<Record<Atmosphere, AtmospherePreset>> = {
  sunset: {
    label: 'Sunset',
    // Sun position is in screen UV (0,0 = top-left).
    sky: { top: '#C9A9C7', mid: '#E9C6C4', bottom: '#F2DDB0', sun: { x: 0.22, y: 0.24, size: 0.055, color: '#FFF4E8' } },
    sunDir: [-0.6, 0.55, -0.6],
    sunColor: '#FFD2B0',
    sunIntensity: 2.2,
    ambientTop: '#F2C8D0',
    ambientBottom: '#E8C8A8',
    ambientIntensity: 1.1,
    fog: null,
    exposure: 1.05,
    landTop: '#D9B48A',
    quayTop: '#E6C3A3',
    strata: ['#F2D3B4', '#E8B79A', '#D99A86', '#B98274', '#8E6464'],
    seabed: '#D8C3A0',
  },
};

export interface FlavourPreset {
  label: string;
  shallow: string;
  deep: string;
  rim: string;
}

export const FLAVOURS: Record<Flavour, FlavourPreset> = {
  seaglass: { label: 'Sea glass', shallow: '#BFEDE6', deep: '#3FA9B5', rim: '#F2FFFD' },
  blueberry: { label: 'Blueberry', shallow: '#B9C8FF', deep: '#3B4FC4', rim: '#EEF1FF' },
  lime: { label: 'Lime', shallow: '#DDF5B0', deep: '#6FB43F', rim: '#F8FFE8' },
};
