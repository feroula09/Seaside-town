import * as THREE from 'three/webgpu';
import { Fn, color, float, mix, screenSize, screenUV, smoothstep, vec2 } from 'three/tsl';
import type { AtmospherePreset } from './presets';

/** Full-screen gradient sky with an optional soft sun disc (SPEC §9.1). */
export function applySky(scene: THREE.Scene, atmo: AtmospherePreset): void {
  const { top, mid, bottom, sun } = atmo.sky;
  scene.backgroundNode = Fn(() => {
    const y = screenUV.y; // 0 = top of the screen
    const upper = mix(color(top), color(mid), smoothstep(0.0, 0.55, y));
    const sky = mix(upper, color(bottom), smoothstep(0.5, 1.0, y)).toVar();
    if (sun) {
      const aspect = screenSize.x.div(screenSize.y);
      const d = screenUV.sub(vec2(sun.x, sun.y)).mul(vec2(aspect, 1)).length();
      const disc = float(1).sub(smoothstep(sun.size * 0.92, sun.size, d));
      const glow = float(1).sub(smoothstep(sun.size, sun.size * 4, d)).pow(2).mul(0.35);
      sky.assign(mix(sky, color(sun.color), disc.max(glow)));
    }
    return sky;
  })();
}
