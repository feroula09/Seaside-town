import * as THREE from 'three/webgpu';
import { Fn, Loop, clamp, exp, float, texture, uniform, uniformArray, uv, vec2, vec4 } from 'three/tsl';
import { BLOCK, SIM } from '../config';
import { buildWaterMask } from '../world/layout';
import type { Disturbance, WaveParams } from './waveParams';

type TexNode = THREE.TextureNode<'vec4'>;

/**
 * GPU water heightfield (SPEC §4.1).
 *
 * State lives in an N×N float render target: R = h, G = h of the previous step.
 * Each step renders a full-screen quad from one target into the other, so the
 * same code runs on the WebGPU and the WebGL2 backends.
 * Formula and boundaries match `heightfield.ref.ts`.
 */
export class Heightfield {
  readonly n: number;
  private readonly targets: [THREE.RenderTarget, THREE.RenderTarget];
  private readonly quads: [THREE.QuadMesh, THREE.QuadMesh];
  private current = 0;
  private readonly courant2 = uniform(0);
  private readonly decay = uniform(1);
  private readonly disturbData = Array.from({ length: SIM.MAX_DISTURBANCES }, () => new THREE.Vector4(0, 0, 1, 0));
  private readonly disturb = uniformArray<'vec4'>(this.disturbData, 'vec4');
  private readonly samplers: TexNode[] = [];
  private readonly maskTexture: THREE.DataTexture;
  private readonly zeroQuad: THREE.QuadMesh;

  constructor(n: number = SIM.HF_N) {
    this.n = n;
    const make = () =>
      new THREE.RenderTarget(n, n, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        depthBuffer: false,
        generateMipmaps: false,
      });
    this.targets = [make(), make()];

    const mask = buildWaterMask(n);
    const maskRGBA = new Uint8Array(n * n * 4);
    for (let k = 0; k < n * n; k++) maskRGBA[k * 4] = mask[k] * 255;
    this.maskTexture = new THREE.DataTexture(maskRGBA, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.maskTexture.minFilter = THREE.NearestFilter;
    this.maskTexture.magFilter = THREE.NearestFilter;
    this.maskTexture.needsUpdate = true;

    const zero = new THREE.NodeMaterial();
    zero.blending = THREE.NoBlending;
    zero.fragmentNode = vec4(0, 0, 0, 1);
    this.zeroQuad = new THREE.QuadMesh(zero);

    this.quads = [
      new THREE.QuadMesh(this.makeStepMaterial(this.targets[0].texture)),
      new THREE.QuadMesh(this.makeStepMaterial(this.targets[1].texture)),
    ];
  }

  /** Reads `src` and writes the next state; rendered into the other target. */
  private makeStepMaterial(src: THREE.Texture): THREE.NodeMaterial {
    const n = this.n;
    const size = BLOCK.HALF * 2;
    const mat = new THREE.NodeMaterial();
    // Float32 targets are not blendable on WebGPU; a blending pipeline would be rejected.
    mat.blending = THREE.NoBlending;
    mat.fragmentNode = Fn(() => {
      const st = uv();
      const px = vec2(1 / n, 0);
      const pz = vec2(0, 1 / n);
      const c = texture(src, st);
      const h = c.r;
      const hPrev = c.g;
      const lap = texture(src, st.add(px))
        .r.add(texture(src, st.sub(px)).r)
        .add(texture(src, st.add(pz)).r)
        .add(texture(src, st.sub(pz)).r)
        .sub(h.mul(4));
      const next = h.mul(2).sub(hPrev).add(this.courant2.mul(lap)).mul(this.decay).toVar();

      const world = st.mul(size).sub(BLOCK.HALF);
      Loop(SIM.MAX_DISTURBANCES, ({ i }) => {
        const d = this.disturb.element(i);
        const delta = world.sub(d.xy);
        const r2 = d.z.mul(d.z);
        next.addAssign(d.w.mul(exp(delta.dot(delta).negate().div(r2))));
      });

      const m = texture(this.maskTexture, st).r;
      const out = clamp(next, float(-SIM.H_CLAMP), float(SIM.H_CLAMP)).mul(m);
      return vec4(out, h.mul(m), 0, 1);
    })();
    return mat;
  }

  /**
   * A texture node that always reads the latest state, for use in other materials.
   * `uvNode` maps to the block: (0,0) = (x=-HALF, z=-HALF), (1,1) = (x=HALF, z=HALF).
   */
  sample(uvNode: Parameters<typeof texture>[1]): TexNode {
    const node = texture(this.targets[this.current].texture, uvNode) as TexNode;
    this.samplers.push(node);
    return node;
  }

  setParams(p: WaveParams): void {
    this.courant2.value = p.courant2;
    this.decay.value = p.decay;
  }

  /** Advance one fixed step. Disturbances beyond MAX_DISTURBANCES are dropped. */
  step(renderer: THREE.WebGPURenderer, disturbances: readonly Disturbance[]): void {
    for (let k = 0; k < this.disturbData.length; k++) {
      const d = disturbances[k];
      if (d) this.disturbData[k].set(d.x, d.z, d.radius, d.amount);
      else this.disturbData[k].w = 0;
    }
    const src = this.current;
    const dst = 1 - src;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.targets[dst]);
    this.quads[src].render(renderer);
    renderer.setRenderTarget(prevTarget);
    this.current = dst;
    for (const s of this.samplers) s.value = this.targets[dst].texture;
  }

  /** Flatten the water (both state targets to zero). */
  clear(renderer: THREE.WebGPURenderer): void {
    const prevTarget = renderer.getRenderTarget();
    for (const t of this.targets) {
      renderer.setRenderTarget(t);
      this.zeroQuad.render(renderer);
    }
    renderer.setRenderTarget(prevTarget);
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    for (const q of [...this.quads, this.zeroQuad]) (q.material as THREE.Material).dispose();
    this.maskTexture.dispose();
  }
}
