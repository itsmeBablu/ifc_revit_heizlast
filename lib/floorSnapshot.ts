import * as THREE from "three";
import type { Floor } from "./types";

type CacheKey = string;

const snapshotCache = new Map<CacheKey, string>();

let sharedRenderer: THREE.WebGLRenderer | null = null;

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "low-power",
    });
    sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  sharedRenderer.setSize(size, size, false);
  sharedRenderer.setPixelRatio(1);
  sharedRenderer.setClearColor(0x000000, 0);
  return sharedRenderer;
}

function floorElevationRange(
  floor: Floor,
  floors: Floor[],
): { minY: number; maxY: number } {
  const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((f) => f.id === floor.id);
  const minY = floor.elevation - 0.35;
  const next = idx >= 0 ? sorted[idx + 1] : undefined;
  const maxY = next ? next.elevation - 0.05 : floor.elevation + 4.5;
  return { minY, maxY };
}

/**
 * Render an uncolored top-down orthographic snapshot of a single floor's
 * shell geometry. Results are cached per model+floor until clearFloorSnapshots().
 */
export function renderFloorSnapshot(
  shellGroup: THREE.Group,
  floor: Floor,
  floors: Floor[],
  modelKey: string,
  size = 640,
): string | null {
  const cacheKey = `${modelKey}::${floor.id}::${size}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const { minY, maxY } = floorElevationRange(floor, floors);

  shellGroup.updateMatrixWorld(true);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f7);

  const planGroup = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x5c6570,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });

  const box = new THREE.Box3();
  let hasGeom = false;

  shellGroup.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const floorId = obj.userData.floorId as string | undefined;

    // Prefer explicit floor tagging; fall back to elevation band
    let include = floorId === floor.id;
    if (!include && !floorId) {
      const meshBox = new THREE.Box3().setFromObject(obj);
      if (meshBox.isEmpty()) return;
      const cy = (meshBox.min.y + meshBox.max.y) / 2;
      include = cy >= minY && cy < maxY;
    }
    if (!include) return;

    const mesh = new THREE.Mesh(obj.geometry, material);
    mesh.applyMatrix4(obj.matrixWorld);
    planGroup.add(mesh);

    const meshBox = new THREE.Box3().setFromObject(mesh);
    if (!meshBox.isEmpty()) {
      box.union(meshBox);
      hasGeom = true;
    }
  });

  if (!hasGeom) {
    material.dispose();
    return null;
  }

  scene.add(planGroup);

  const size3 = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size3.x, size3.z, 1) * 1.15;

  const camera = new THREE.OrthographicCamera(
    -span / 2,
    span / 2,
    span / 2,
    -span / 2,
    0.1,
    5000,
  );
  camera.position.set(center.x, center.y + Math.max(size3.y, 2) + 40, center.z);
  camera.up.set(0, 0, -1);
  camera.lookAt(center.x, center.y, center.z);
  camera.updateProjectionMatrix();

  const renderer = getRenderer(size);
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  material.dispose();
  snapshotCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export function clearFloorSnapshots(modelKey?: string): void {
  if (!modelKey) {
    snapshotCache.clear();
    return;
  }
  for (const key of snapshotCache.keys()) {
    if (key.startsWith(`${modelKey}::`)) snapshotCache.delete(key);
  }
}
