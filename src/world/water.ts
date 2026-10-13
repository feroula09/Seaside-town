import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  float,
  mix,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  transformNormalToView,
  uniform,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { BLOCK } from '../config';
import type { FlavourPreset } from '../atmosphere/presets';
import type { Heightfield } from '../sim/heightfield';
import { edgePoint, seabedHeight, waterIntervals, type Edge } from './layout';

const EDGES: Edge[] = ['north', 'south', 'west', 'east'];
const OUTWARD: Record<Edge, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

export interface Water {
  group: THREE.Group;
  /** Still-water level in block space (tide). */
  tide: { value: number };
  setFlavour(f: FlavourPreset): void;
}

/**
 * Jelly sea (SPEC §5.2), M0 version: heightfield-displaced top surface and
 * see-through side walls. Refraction, absorption and caustics land in M1.
 */
export function createWater(hf: Heightfield, flavour: FlavourPreset, segments = 160): Water {
  const size = BLOCK.HALF * 2;
  const texel = 1 / hf.n;
  const tide = uniform(0);
  const shallow = uniform(new THREE.Color(flavour.shallow));
  const deep = uniform(new THREE.Color(flavour.deep));
  const rim = uniform(new THREE.Color(flavour.rim));

  const blockUV = (p: THREE.Node<'vec3'>) => p.xz.add(BLOCK.HALF).div(size);

  // ---- Top surface -------------------------------------------------------
  const topGeo = new THREE.PlaneGeometry(size, size, segments, segments);
  topGeo.rotateX(-Math.PI / 2);
  const topPos = topGeo.attributes.position as THREE.BufferAttribute;
  const depth = new Float32Array(topPos.count);
  for (let k = 0; k < topPos.count; k++) depth[k] = Math.max(0, -seabedHeight(topPos.getX(k), topPos.getZ(k)));
  topGeo.setAttribute('aDepth', new THREE.BufferAttribute(depth, 1));

  const top = new THREE.MeshStandardNodeMaterial({ transparent: true, roughness: 0.12, metalness: 0 });
  const st = blockUV(positionLocal);
  const h = hf.sample(st).r;
  const hxp = hf.sample(st.add(vec2(texel, 0))).r;
  const hxn = hf.sample(st.sub(vec2(texel, 0))).r;
  const hzp = hf.sample(st.add(vec2(0, texel))).r;
  const hzn = hf.sample(st.sub(vec2(0, texel))).r;
  const twoDx = (2 * size) / hf.n;
  const localNormal = varying(normalize(vec3(hxn.sub(hxp).div(twoDx), 1, hzn.sub(hzp).div(twoDx))));
  top.positionNode = positionLocal.add(vec3(0, h.add(tide), 0));
  top.normalNode = transformNormalToView(localNormal);

  const vDepth = varying(attribute<'float'>('aDepth'));
  const tint = mix(shallow, deep, smoothstep(0.8, 6.0, vDepth));
  const view = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1).sub(localNormal.dot(view).max(0)), 3);
  top.colorNode = tint;
  top.emissiveNode = rim.mul(fresnel.mul(0.35));
  top.opacityNode = mix(float(0.62), float(0.9), smoothstep(0.5, 6.0, vDepth));
  const topMesh = new THREE.Mesh(topGeo, top);
  topMesh.name = 'water:top';
  topMesh.renderOrder = 2;

  // ---- Side walls (the jelly cross-section) --------------------------------
  const positions: number[] = [];
  const normals: number[] = [];
  const isTop: number[] = [];
  const indices: number[] = [];
  const step = size / segments;
  for (const edge of EDGES) {
    const [nx, nz] = OUTWARD[edge];
    const flip = edge === 'north' || edge === 'east';
    for (const [a, b] of waterIntervals(edge)) {
      const count = Math.max(1, Math.ceil((b - a) / step));
      const base = positions.length / 3;
      for (let k = 0; k <= count; k++) {
        const s = a + ((b - a) * k) / count;
        const [x, z] = edgePoint(edge, s);
        positions.push(x, seabedHeight(x, z), z, x, 0, z);
        normals.push(nx, 0, nz, nx, 0, nz);
        isTop.push(0, 1);
      }
      for (let k = 0; k < count; k++) {
        const b0 = base + k * 2;
        const t0 = b0 + 1;
        const b1 = b0 + 2;
        const t1 = b0 + 3;
        if (flip) indices.push(b0, t0, b1, b1, t0, t1);
        else indices.push(b0, b1, t0, b1, t1, t0);
      }
    }
  }
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  wallGeo.setAttribute('aTop', new THREE.Float32BufferAttribute(isTop, 1));
  wallGeo.setIndex(indices);

  const wall = new THREE.MeshStandardNodeMaterial({ transparent: true, roughness: 0.3, metalness: 0 });
  const aTop = attribute<'float'>('aTop');
  const wallH = hf.sample(blockUV(positionLocal)).r;
  const surfaceY = wallH.add(tide);
  const wallY = positionLocal.y.add(surfaceY.mul(aTop));
  wall.positionNode = vec3(positionLocal.x, wallY, positionLocal.z);
  // Distance below the moving surface, for the bright lip along the top edge.
  const below = varying(surfaceY.sub(wallY));
  wall.colorNode = mix(deep, shallow, smoothstep(-6.0, 0.0, varying(wallY)));
  wall.opacityNode = float(0.8);
  wall.emissiveNode = rim.mul(float(1).sub(smoothstep(0.0, 0.18, below)).mul(0.55));
  const wallMesh = new THREE.Mesh(wallGeo, wall);
  wallMesh.name = 'water:walls';
  wallMesh.renderOrder = 1;

  const group = new THREE.Group();
  group.name = 'water';
  group.add(wallMesh, topMesh);

  return {
    group,
    tide,
    setFlavour(f) {
      shallow.value.set(f.shallow);
      deep.value.set(f.deep);
      rim.value.set(f.rim);
    },
  };
}
