import * as THREE from 'three/webgpu';
import { Fn, float, mix, positionLocal, sin, smoothstep, vec3 } from 'three/tsl';
import { BLOCK, LAND } from '../config';
import type { AtmospherePreset } from '../atmosphere/presets';
import { edgePoint, seabedHeight, waterIntervals, type Edge } from './layout';

/** Constant colour node from a hex string (converted to the linear working space). */
export function rgb(hex: string) {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
}

const EDGES: Edge[] = ['north', 'south', 'west', 'east'];
const OUTWARD: Record<Edge, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

/**
 * Wavy sediment layers on the block sides (SPEC §5.1).
 * Geometry is built in block space, so positionLocal is the block-space position.
 */
function strataMaterial(colors: AtmospherePreset['strata']): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  mat.colorNode = Fn(() => {
    const p = positionLocal;
    const s = p.x.add(p.z);
    const y = p.y;
    const col = rgb(colors[4]).toVar();
    const line = float(0).toVar();
    for (let k = 3; k >= 0; k--) {
      const boundary = float(-1.0 - k * 1.6)
        .add(sin(s.mul(0.25).add(k * 1.7)).mul(0.45))
        .add(sin(s.mul(0.73).add(k * 0.6)).mul(0.2));
      col.assign(mix(col, rgb(colors[k]), smoothstep(boundary.sub(0.02), boundary.add(0.02), y)));
      line.assign(line.max(float(1).sub(smoothstep(0.0, 0.05, y.sub(boundary).abs()))));
    }
    return col.mul(float(1).sub(line.mul(0.18)));
  })();
  return mat;
}

/** Vertical strip along one block edge from y=BLOCK.BOTTOM up to `top(x, z)`. */
function edgeStrip(edge: Edge, a: number, b: number, top: (x: number, z: number) => number, step = 0.25): THREE.BufferGeometry {
  const count = Math.max(1, Math.ceil((b - a) / step));
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const [nx, nz] = OUTWARD[edge];
  for (let k = 0; k <= count; k++) {
    const s = a + ((b - a) * k) / count;
    const [x, z] = edgePoint(edge, s);
    positions.push(x, BLOCK.BOTTOM, z, x, top(x, z), z);
    normals.push(nx, 0, nz, nx, 0, nz);
  }
  // Wind so the face points outward.
  const flip = edge === 'north' || edge === 'east';
  for (let k = 0; k < count; k++) {
    const b0 = k * 2;
    const t0 = b0 + 1;
    const b1 = b0 + 2;
    const t1 = b0 + 3;
    if (flip) indices.push(b0, t0, b1, b1, t0, t1);
    else indices.push(b0, b1, t0, b1, t1, t0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}

export interface BlockParts {
  group: THREE.Group;
  /** Opaque meshes the pointer can hit (land), used to tell land clicks from water clicks. */
  landMeshes: THREE.Mesh[];
}

export function createBlock(atmo: AtmospherePreset): BlockParts {
  const group = new THREE.Group();
  group.name = 'block';
  const strata = strataMaterial(atmo.strata);
  const landTop = new THREE.MeshStandardNodeMaterial({ color: atmo.landTop, roughness: 0.9 });
  const quayTop = new THREE.MeshStandardNodeMaterial({ color: atmo.quayTop, roughness: 0.85 });

  // Land: one box per rect, from the block bottom to its top surface.
  const landMeshes: THREE.Mesh[] = [];
  for (const r of LAND) {
    const h = r.top - BLOCK.BOTTOM;
    const g = new THREE.BoxGeometry(r.x1 - r.x0, h, r.z1 - r.z0);
    g.translate((r.x0 + r.x1) / 2, BLOCK.BOTTOM + h / 2, (r.z0 + r.z1) / 2);
    const top = r.name.startsWith('terrace') ? landTop : quayTop;
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z
    const mesh = new THREE.Mesh(g, [strata, strata, top, strata, strata, strata]);
    mesh.name = `land:${r.name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    landMeshes.push(mesh);
    group.add(mesh);
  }

  // Seabed surface.
  const size = BLOCK.HALF * 2;
  const seabedGeo = new THREE.PlaneGeometry(size, size, 128, 128);
  seabedGeo.rotateX(-Math.PI / 2);
  const pos = seabedGeo.attributes.position as THREE.BufferAttribute;
  for (let k = 0; k < pos.count; k++) pos.setY(k, seabedHeight(pos.getX(k), pos.getZ(k)));
  seabedGeo.computeVertexNormals();
  const seabedMat = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  seabedMat.colorNode = mix(rgb(atmo.seabed).mul(0.78), rgb(atmo.seabed), smoothstep(-6.5, -2.0, positionLocal.y));
  const seabed = new THREE.Mesh(seabedGeo, seabedMat);
  seabed.name = 'seabed';
  seabed.receiveShadow = true;
  group.add(seabed);

  // Block sides below the water, where no land box covers the edge.
  for (const edge of EDGES) {
    for (const [a, b] of waterIntervals(edge)) {
      const skirt = new THREE.Mesh(edgeStrip(edge, a, b, seabedHeight), strata);
      skirt.name = `skirt:${edge}`;
      skirt.receiveShadow = true;
      group.add(skirt);
    }
  }

  return { group, landMeshes };
}
