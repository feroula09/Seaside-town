import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BLOCK, INPUT } from '../config';
import { isLand } from '../world/layout';
import { dragDisturbances, type DisturbanceQueue } from './disturbances';

interface Options {
  dom: HTMLElement;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Opaque meshes that hide water behind them. */
  occluders: THREE.Object3D[];
  /** World-space y of still water. */
  waterLevel: () => number;
  /** Converts a world point into block space (identity until the block can tilt). */
  toBlock: (p: THREE.Vector3) => THREE.Vector3;
  queue: DisturbanceQueue;
}

/**
 * Pointer gestures on the water (SPEC §7.1, M0 subset):
 * left-drag on water makes waves, a left click on water pokes it,
 * anything else is handed to OrbitControls (left/right orbit, middle pan, wheel zoom).
 */
export function attachWaterInput(o: Options): () => void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  let drag: {
    id: number;
    downX: number;
    downY: number;
    downT: number;
    moved: boolean;
    last: [number, number];
    lastT: number;
  } | null = null;

  function waterPoint(ev: PointerEvent): [number, number] | null {
    const rect = o.dom.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, o.camera);
    plane.constant = -o.waterLevel();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const waterDist = raycaster.ray.origin.distanceTo(hit);
    const occluded = raycaster.intersectObjects(o.occluders, false).some((i) => i.distance < waterDist);
    if (occluded) return null;
    const p = o.toBlock(hit.clone());
    if (Math.abs(p.x) > BLOCK.HALF || Math.abs(p.z) > BLOCK.HALF || isLand(p.x, p.z)) return null;
    return [p.x, p.z];
  }

  /** Same as waterPoint but without the occlusion test, so a drag can continue behind land. */
  function planePoint(ev: PointerEvent): [number, number] | null {
    const rect = o.dom.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, o.camera);
    plane.constant = -o.waterLevel();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    const p = o.toBlock(hit.clone());
    return [THREE.MathUtils.clamp(p.x, -BLOCK.HALF, BLOCK.HALF), THREE.MathUtils.clamp(p.z, -BLOCK.HALF, BLOCK.HALF)];
  }

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0 || drag) return;
    const p = waterPoint(ev);
    if (!p) return; // let OrbitControls handle it
    o.controls.enabled = false;
    o.dom.setPointerCapture(ev.pointerId);
    o.dom.style.cursor = 'crosshair';
    const now = performance.now();
    drag = { id: ev.pointerId, downX: ev.clientX, downY: ev.clientY, downT: now, moved: false, last: p, lastT: now };
  };

  const onMove = (ev: PointerEvent) => {
    if (!drag) {
      o.dom.style.cursor = waterPoint(ev) ? 'crosshair' : '';
      return;
    }
    if (ev.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.downX, ev.clientY - drag.downY) > INPUT.CLICK_MAX_PX) drag.moved = true;
    if (!drag.moved) return;
    const p = planePoint(ev);
    if (!p) return;
    const now = performance.now();
    const seconds = Math.max((now - drag.lastT) / 1000, 1 / 240);
    for (const d of dragDisturbances(drag.last, p, seconds)) {
      if (!isLand(d.x, d.z)) o.queue.push(d);
    }
    drag.last = p;
    drag.lastT = now;
  };

  const onUp = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const isClick = !drag.moved && performance.now() - drag.downT < INPUT.CLICK_MAX_MS;
    if (isClick && ev.type === 'pointerup') {
      const [x, z] = drag.last;
      o.queue.push({ x, z, radius: INPUT.POKE_RADIUS, amount: INPUT.POKE_AMOUNT });
    }
    if (o.dom.hasPointerCapture(ev.pointerId)) o.dom.releasePointerCapture(ev.pointerId);
    drag = null;
    o.controls.enabled = true;
  };

  const onContextMenu = (ev: Event) => ev.preventDefault();

  // Capture phase so we decide before OrbitControls sees the event.
  o.dom.addEventListener('pointerdown', onDown, { capture: true });
  o.dom.addEventListener('pointermove', onMove);
  o.dom.addEventListener('pointerup', onUp);
  o.dom.addEventListener('pointercancel', onUp);
  o.dom.addEventListener('contextmenu', onContextMenu);
  return () => {
    o.dom.removeEventListener('pointerdown', onDown, { capture: true });
    o.dom.removeEventListener('pointermove', onMove);
    o.dom.removeEventListener('pointerup', onUp);
    o.dom.removeEventListener('pointercancel', onUp);
    o.dom.removeEventListener('contextmenu', onContextMenu);
  };
}
