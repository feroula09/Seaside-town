import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA } from '../config';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  resetView(): void;
  resize(width: number, height: number): void;
}

/** Orbit camera with the default 3/4 diorama view (SPEC §8.1, §8.2). */
export function createCameraRig(dom: HTMLElement): CameraRig {
  const camera = new THREE.PerspectiveCamera(CAMERA.FOV, 1, 0.1, 400);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = CAMERA.DAMPING;
  controls.minDistance = CAMERA.DIST_MIN;
  controls.maxDistance = CAMERA.DIST_MAX;
  controls.minPolarAngle = THREE.MathUtils.degToRad(CAMERA.POLAR_MIN_DEG);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(CAMERA.POLAR_MAX_DEG);
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };

  const clampTarget = () => {
    const t = controls.target;
    t.set(THREE.MathUtils.clamp(t.x, -10, 10), THREE.MathUtils.clamp(t.y, -2, 6), THREE.MathUtils.clamp(t.z, -10, 10));
  };
  controls.addEventListener('change', clampTarget);

  const resetView = () => {
    camera.position.set(...CAMERA.DEFAULT_POS);
    controls.target.set(...CAMERA.DEFAULT_TARGET);
    controls.update();
  };
  resetView();

  return {
    camera,
    controls,
    resetView,
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  };
}
