import * as THREE from "three";
import { debugLog } from "./debugLog";
import type { Floor } from "./types";

/**
 * Floor slice: Y-up clip plane + stencil solid caps (three.js clipping_stencil pattern).
 *
 * Plane normal (0,-1,0): clips geometry where world Y > constant.
 */
export class ClipSliceController {
  readonly plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

  private capsGroup = new THREE.Group();
  private tracked: THREE.Mesh[] = [];
  private entries: {
    mesh: THREE.Mesh;
    stencil: THREE.Group;
    cap: THREE.Mesh;
    capMat: THREE.MeshBasicMaterial;
  }[] = [];
  private enabled = false;
  private capsEnabled = false;
  private scene: THREE.Scene | null = null;
  private heightY = 0;
  private _box = new THREE.Box3();
  private _size = new THREE.Vector3();
  private _center = new THREE.Vector3();

  attach(scene: THREE.Scene) {
    this.scene = scene;
    this.capsGroup.name = "clip-caps";
    scene.add(this.capsGroup);
  }

  setMeshes(meshes: THREE.Mesh[]) {
    this.clearCaps();
    this.clearPlanesFromTracked();
    this.tracked = meshes.slice();
    this.applyPlanesToTracked();
    if (this.capsEnabled && this.enabled) this.buildCaps();
    debugLog(
      "ClipSlice",
      `setMeshes n=${meshes.length} enabled=${this.enabled} y=${this.heightY.toFixed(3)}`,
      meshes.length ? "ok" : "warn",
    );
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyPlanesToTracked();
    this.capsGroup.visible = on && this.capsEnabled;
    if (on && this.capsEnabled) this.buildCaps();
    else if (!on) this.clearCaps();
  }

  setCapsEnabled(on: boolean) {
    this.capsEnabled = on;
    if (on && this.enabled) this.buildCaps();
    else this.clearCaps();
    this.capsGroup.visible = on && this.enabled;
  }

  /** Instant — only updates plane.constant + cap Y (no scene walk). */
  setHeight(y: number) {
    this.heightY = y;
    this.plane.constant = y;
    for (const e of this.entries) {
      e.cap.position.y = y;
      this.syncCapFromMesh(e);
    }
  }

  getHeight() {
    return this.heightY;
  }

  rebindMaterials() {
    this.applyPlanesToTracked();
    this.syncAllCapAppearance();
  }

  syncAllCapAppearance() {
    for (const e of this.entries) this.syncCapFromMesh(e);
  }

  clear() {
    this.clearCaps();
    this.clearPlanesFromTracked();
    this.tracked = [];
    this.enabled = false;
  }

  dispose() {
    this.clear();
    if (this.scene) this.scene.remove(this.capsGroup);
    this.scene = null;
  }

  private applyPlanesToTracked() {
    for (const mesh of this.tracked) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || !("clippingPlanes" in m)) continue;
        const mat = m as THREE.Material & {
          clippingPlanes: THREE.Plane[] | null;
          clipShadows?: boolean;
        };
        mat.clippingPlanes = this.enabled ? [this.plane] : [];
        mat.clipShadows = true;
        mat.needsUpdate = true;
      }
    }
  }

  private clearPlanesFromTracked() {
    for (const mesh of this.tracked) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || !("clippingPlanes" in m)) continue;
        (m as THREE.Material & { clippingPlanes: THREE.Plane[] }).clippingPlanes =
          [];
        m.needsUpdate = true;
      }
    }
  }

  private clearCaps() {
    for (const e of this.entries) {
      e.mesh.remove(e.stencil);
      this.capsGroup.remove(e.cap);
      e.stencil.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          (o.material as THREE.Material).dispose();
        }
      });
      e.cap.geometry.dispose();
      e.capMat.dispose();
    }
    this.entries = [];
  }

  private buildCaps() {
    this.clearCaps();
    let i = 1;
    for (const mesh of this.tracked) {
      if (!mesh.geometry || !mesh.visible) continue;

      mesh.updateWorldMatrix(true, false);
      this._box.setFromObject(mesh);
      if (this._box.isEmpty()) continue;
      this._box.getSize(this._size);
      this._box.getCenter(this._center);

      const baseOrder = i * 3;
      const stencil = this.createStencilGroup(mesh.geometry, baseOrder);
      mesh.add(stencil);

      const w = Math.max(this._size.x, 0.05) * 1.05;
      const d = Math.max(this._size.z, 0.05) * 1.05;
      const capMat = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        clippingPlanes: [],
        depthWrite: true,
        depthTest: true,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      this.applySourceAppearance(capMat, mesh);

      const cap = new THREE.Mesh(new THREE.PlaneGeometry(w, d), capMat);
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(this._center.x, this.heightY, this._center.z);
      cap.renderOrder = baseOrder + 1.5;
      cap.userData.isClipCap = true;
      this.capsGroup.add(cap);

      this.entries.push({ mesh, stencil, cap, capMat });
      i += 1;
    }
    this.capsGroup.visible = this.enabled && this.capsEnabled;
  }

  private createStencilGroup(geometry: THREE.BufferGeometry, renderOrder: number) {
    const group = new THREE.Group();
    group.userData.isClipStencil = true;

    const baseMat = new THREE.MeshBasicMaterial();
    baseMat.depthWrite = false;
    baseMat.depthTest = false;
    baseMat.colorWrite = false;
    baseMat.stencilWrite = true;
    baseMat.stencilFunc = THREE.AlwaysStencilFunc;

    const matBack = baseMat.clone();
    matBack.side = THREE.BackSide;
    matBack.clippingPlanes = [this.plane];
    matBack.stencilFail = THREE.IncrementWrapStencilOp;
    matBack.stencilZFail = THREE.IncrementWrapStencilOp;
    matBack.stencilZPass = THREE.IncrementWrapStencilOp;
    const meshBack = new THREE.Mesh(geometry, matBack);
    meshBack.renderOrder = renderOrder;
    meshBack.userData.isClipStencil = true;
    group.add(meshBack);

    const matFront = baseMat.clone();
    matFront.side = THREE.FrontSide;
    matFront.clippingPlanes = [this.plane];
    matFront.stencilFail = THREE.DecrementWrapStencilOp;
    matFront.stencilZFail = THREE.DecrementWrapStencilOp;
    matFront.stencilZPass = THREE.DecrementWrapStencilOp;
    const meshFront = new THREE.Mesh(geometry, matFront);
    meshFront.renderOrder = renderOrder;
    meshFront.userData.isClipStencil = true;
    group.add(meshFront);

    return group;
  }

  private syncCapFromMesh(e: {
    mesh: THREE.Mesh;
    capMat: THREE.MeshBasicMaterial;
  }) {
    this.applySourceAppearance(e.capMat, e.mesh);
  }

  private applySourceAppearance(
    capMat: THREE.MeshBasicMaterial,
    mesh: THREE.Mesh,
  ) {
    const hex =
      (mesh.userData.colorHex as string | undefined) ??
      (mesh.userData.baseColorHex as string | undefined);
    const src = this.readSourceMaterial(mesh);

    if (hex) capMat.color.set(hex);
    else if (src?.color) capMat.color.copy(src.color);
    else capMat.color.setHex(0xb8bec8);

    // Caps read solid for a filled cut (ignore source transparency)
    capMat.transparent = false;
    capMat.opacity = 1;
    capMat.depthWrite = true;
    capMat.needsUpdate = true;
  }

  private readSourceMaterial(
    mesh: THREE.Mesh,
  ): (THREE.Material & { color?: THREE.Color }) | null {
    const m = mesh.material;
    return ((Array.isArray(m) ? m[0] : m) as THREE.Material) ?? null;
  }
}

/** World-space Y bounds of meshes belonging to a floor. */
export function floorWorldYBounds(
  floorId: string,
  roots: (THREE.Object3D | null | undefined)[],
): { yMin: number; yMax: number } | null {
  const box = new THREE.Box3();
  let any = false;
  for (const root of roots) {
    if (!root) continue;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.userData.isClipStencil || o.userData.isSelectionOutline) return;
      if (o.userData.isClipCap) return;
      if (o.userData.floorId !== floorId) return;
      box.expandByObject(o);
      any = true;
    });
  }
  if (!any || box.isEmpty()) return null;
  return { yMin: box.min.y, yMax: box.max.y };
}

export function floorElevationYBounds(
  floorId: string,
  floors: Floor[],
): { yMin: number; yMax: number } | null {
  if (!floors.length) return null;
  const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((f) => f.id === floorId);
  if (idx < 0) return null;
  const floor = sorted[idx];
  const next = sorted[idx + 1];
  let yMin = floor.elevation;
  let yMax = next ? next.elevation : floor.elevation + 3;
  if (Math.abs(yMin) > 100 || Math.abs(yMax) > 100) {
    yMin /= 1000;
    yMax /= 1000;
  }
  return { yMin, yMax: Math.max(yMax, yMin + 0.05) };
}
