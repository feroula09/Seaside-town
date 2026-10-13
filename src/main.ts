import * as THREE from 'three/webgpu';
import './ui/styles.css';
import { SETTINGS_RANGE, SIM, TIDE_UNITS_PER_CM } from './config';
import { ATMOSPHERES, FLAVOURS } from './atmosphere/presets';
import { applySky } from './atmosphere/sky';
import { createCameraRig } from './camera/rig';
import { DisturbanceQueue } from './core/disturbances';
import { attachWaterInput } from './core/input';
import { FixedStepLoop } from './core/loop';
import { Heightfield } from './sim/heightfield';
import { assertCfl, waveParams } from './sim/waveParams';
import { mountHud, showFallback } from './ui/hud';
import { createBlock } from './world/block';
import { createWater } from './world/water';

interface DebugHandle {
  backend: 'webgpu' | 'webgl2';
  ready: boolean;
  frames: number;
  settings: Settings;
  poke(x: number, z: number, amount?: number): void;
  /** Renders one frame into an offscreen target and returns its RGBA pixels (rows bottom-up). */
  capture(width: number, height: number): Promise<{ width: number; height: number; data: number[] }>;
}

interface Settings {
  firmness: number;
  waveDamping: number;
  tideCm: number;
  paused: boolean;
}

declare global {
  interface Window {
    __seaside?: DebugHandle;
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * SPEC §10.5: try WebGPU first; if it can't initialise or the first frame throws
 * (some browser builds reject descriptors newer three versions send), rebuild on WebGL2.
 */
async function start(forceWebGL: boolean): Promise<void> {
  const app = document.getElementById('app')!;
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  try {
    await renderer.init();
  } catch (err) {
    renderer.dispose();
    if (!forceWebGL) return start(true);
    showFallback(app, errorText(err));
    return;
  }
  const backend: 'webgpu' | 'webgl2' =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  try {
    await setup(app, renderer, backend);
  } catch (err) {
    console.warn(`Seaside Town: ${backend} failed on the first frame`, err);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    app.replaceChildren();
    if (backend === 'webgpu') return start(true);
    showFallback(app, errorText(err));
  }
}

/** Builds the scene and starts the frame loop. Throws (after cleaning up) if the first frame fails. */
async function setup(app: HTMLElement, renderer: THREE.WebGPURenderer, backend: 'webgpu' | 'webgl2'): Promise<void> {
  const params = new URLSearchParams(location.search);

  const atmo = ATMOSPHERES.sunset!;
  const flavour = FLAVOURS.seaglass;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = atmo.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'scene';
  app.appendChild(renderer.domElement);

  const hud = mountHud(app);
  hud.setBadge(backend, atmo.label);

  const scene = new THREE.Scene();
  applySky(scene, atmo);

  const hemi = new THREE.HemisphereLight(atmo.ambientTop, atmo.ambientBottom, atmo.ambientIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(atmo.sunColor, atmo.sunIntensity);
  sun.position.set(...atmo.sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  const sc = sun.shadow.camera;
  sc.left = -32;
  sc.right = 32;
  sc.top = 32;
  sc.bottom = -32;
  sc.near = 1;
  sc.far = 160;
  scene.add(sun);

  // Everything that tilts with the jelly block lives under blockRoot (identity in M0).
  const blockRoot = new THREE.Group();
  blockRoot.name = 'blockRoot';
  scene.add(blockRoot);

  assertCfl(SETTINGS_RANGE.firmness[1]);
  const hf = new Heightfield();
  const block = createBlock(atmo);
  blockRoot.add(block.group);
  const water = createWater(hf, flavour);
  blockRoot.add(water.group);

  const settings: Settings = {
    firmness: SETTINGS_RANGE.firmness[3],
    waveDamping: SETTINGS_RANGE.waveDamping[3],
    tideCm: SETTINGS_RANGE.tideCm[3],
    paused: false,
  };

  const rig = createCameraRig(renderer.domElement);
  const queue = new DisturbanceQueue();
  const inverseRoot = new THREE.Matrix4();
  const detachInput = attachWaterInput({
    dom: renderer.domElement,
    camera: rig.camera,
    controls: rig.controls,
    occluders: block.landMeshes,
    waterLevel: () => water.tide.value,
    toBlock: (p) => p.applyMatrix4(inverseRoot.copy(blockRoot.matrixWorld).invert()),
    queue,
  });

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    rig.resize(w, h);
  };
  window.addEventListener('resize', resize);
  resize();
  const teardown = () => {
    window.removeEventListener('resize', resize);
    detachInput();
    rig.controls.dispose();
    hf.dispose();
  };

  // Probe: clear the sim and draw one frame synchronously so backend errors surface here.
  try {
    hf.clear(renderer);
    renderer.render(scene, rig.camera);
  } catch (err) {
    teardown();
    throw err;
  }

  const debug: DebugHandle = {
    backend,
    ready: false,
    frames: 0,
    settings,
    poke(x, z, amount = -0.3) {
      queue.push({ x, z, radius: 1.2, amount });
    },
    async capture(width, height) {
      // Headless browsers can't screenshot a WebGPU canvas, so tests read pixels back from a target instead.
      const target = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType });
      const prevAspect = rig.camera.aspect;
      rig.camera.aspect = width / height;
      rig.camera.updateProjectionMatrix();
      renderer.setRenderTarget(target);
      renderer.render(scene, rig.camera);
      renderer.setRenderTarget(null);
      rig.camera.aspect = prevAspect;
      rig.camera.updateProjectionMatrix();
      const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
      target.dispose();
      return { width, height, data: Array.from(pixels) };
    },
  };
  window.__seaside = debug;

  const fpsMeter = { fps: 0, frames: 0, since: performance.now() };

  if (params.get('debug') === '1') {
    const { default: GUI } = await import('lil-gui');
    const gui = new GUI({ title: 'Debug' });
    const [fMin, fMax, fStep] = SETTINGS_RANGE.firmness;
    const [dMin, dMax, dStep] = SETTINGS_RANGE.waveDamping;
    const [tMin, tMax, tStep] = SETTINGS_RANGE.tideCm;
    gui.add(settings, 'firmness', fMin, fMax, fStep).name('Firmness');
    gui.add(settings, 'waveDamping', dMin, dMax, dStep).name('Wave damping');
    gui.add(settings, 'tideCm', tMin, tMax, tStep).name('Tide (cm)');
    gui.add(settings, 'paused').name('Pause');
    gui.add({ clear: () => hf.clear(renderer) }, 'clear').name('Calm water');
    gui.add({ reset: () => rig.resetView() }, 'reset').name('Reset view');
    gui.add(fpsMeter, 'fps').name('FPS').listen().disable();
  }

  const loop = new FixedStepLoop(SIM.DT, SIM.MAX_STEPS_PER_FRAME);
  const timer = new THREE.Timer();
  timer.connect(document);

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    rig.controls.update(dt);
    water.tide.value = settings.tideCm * TIDE_UNITS_PER_CM;
    hf.setParams(waveParams(settings.firmness, settings.waveDamping, hf.n));

    const steps = loop.advance(dt, settings.paused);
    for (let k = 0; k < steps; k++) hf.step(renderer, queue.take());

    renderer.render(scene, rig.camera);
    debug.frames++;
    debug.ready = true;

    fpsMeter.frames++;
    const now = performance.now();
    if (now - fpsMeter.since > 500) {
      fpsMeter.fps = Math.round((fpsMeter.frames * 1000) / (now - fpsMeter.since));
      fpsMeter.frames = 0;
      fpsMeter.since = now;
    }
  });
}

start(new URLSearchParams(location.search).get('renderer') === 'webgl').catch((err) => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) showFallback(app, errorText(err));
});
