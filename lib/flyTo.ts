import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Smoothly animate a camera + OrbitControls target over `duration` ms.
 */
export function flyTo(
  camera: THREE.Camera,
  controls: OrbitControls,
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration = 800,
): Promise<void> {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();

  return new Promise((resolve) => {
    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const e = easeInOutCubic(t);

      camera.position.lerpVectors(startPos, targetPosition, e);
      controls.target.lerpVectors(startTarget, targetLookAt, e);
      controls.update();

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(step);
  });
}

/** Compute a perspective camera pose that frames a world-space bounding box. */
export function frameBoundingBox(
  box: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  padding = 1.35,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = (camera.fov * Math.PI) / 180;
  let distance = (maxDim / (2 * Math.tan(fov / 2))) * padding;
  distance = Math.max(distance, maxDim * 0.8);

  const direction = new THREE.Vector3(1, 0.75, 1).normalize();
  const position = center.clone().add(direction.multiplyScalar(distance));

  return { position, target: center };
}

/** Top-down orthographic framing for the plan view. */
export function frameBoundingBoxOrtho(
  box: THREE.Box3,
  camera: THREE.OrthographicCamera,
  padding = 1.2,
): { position: THREE.Vector3; target: THREE.Vector3; zoom: number } {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const height = camera.top - camera.bottom;
  const width = camera.right - camera.left;
  const zoomX = width / Math.max(size.x * padding, 1);
  const zoomY = height / Math.max(size.z * padding, 1);
  const zoom = Math.min(zoomX, zoomY);

  const position = new THREE.Vector3(center.x, center.y + Math.max(size.y, 10) + 50, center.z);

  return { position, target: center.clone(), zoom };
}
