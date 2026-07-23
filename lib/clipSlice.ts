import * as THREE from "three";

/**
 * Stencil-buffer clipping caps (three.js webgl_clipping_stencil pattern),
 * with a per-object colored cap plane matching each mesh's material color.
 */
export class ClipSliceController {
  readonly plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private group = new THREE.Group();
  private entries: {
    mesh: THREE.Mesh;
    stencil: THREE.Group;
    cap: THREE.Mesh;
    capMat: THREE.MeshBasicMaterial;
  }[] = [];
  private enabled = false;
  private scene: THREE.Scene | null = null;

  attach(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = "clip-caps";
    scene.add(this.group);
  }

  clear() {
    for (const e of this.entries) {
      e.mesh.remove(e.stencil);
      this.group.remove(e.cap);
      e.stencil.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.Material;
          m.dispose();
        }
      });
      e.cap.geometry.dispose();
      e.capMat.dispose();
      const mats = e.mesh.material;
      const list = Array.isArray(mats) ? mats : [mats];
      for (const m of list) {
        if (m && "clippingPlanes" in m) {
          (m as THREE.Material & { clippingPlanes?: THREE.Plane[] }).clippingPlanes =
            [];
        }
      }
    }
    this.entries = [];
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.group.visible = on;
    for (const e of this.entries) {
      e.stencil.visible = on;
      e.cap.visible = on;
      const mats = e.mesh.material;
      const list = Array.isArray(mats) ? mats : [mats];
      for (const m of list) {
        if (!m || !("clippingPlanes" in m)) continue;
        (m as THREE.Material & { clippingPlanes: THREE.Plane[] }).clippingPlanes =
          on ? [this.plane] : [];
        m.needsUpdate = true;
      }
    }
  }

  /** Register meshes to clip (shell + room overlays). Call after rebuild. */
  registerMeshes(meshes: THREE.Mesh[]) {
    this.clear();
    let order = 1;
    for (const mesh of meshes) {
      if (!mesh.geometry) continue;
      const color = this.readColor(mesh);
      const stencil = this.createStencilGroup(mesh.geometry, order);
      // Parent under mesh so world transforms stay correct
      mesh.add(stencil);

      const capMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        clippingPlanes: [],
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp,
        stencilZFail: THREE.ReplaceStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
      });
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), capMat);
      cap.rotation.x = -Math.PI / 2;
      cap.renderOrder = order + 0.1;
      this.group.add(cap);

      const mats = mesh.material;
      const list = Array.isArray(mats) ? mats : [mats];
      for (const m of list) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        std.clippingPlanes = this.enabled ? [this.plane] : [];
        std.clipShadows = true;
        std.needsUpdate = true;
      }

      this.entries.push({ mesh, stencil, cap, capMat });
      order += 1;
    }
    this.setEnabled(this.enabled);
  }

  /** Update clip height (Y) and colored caps. Instant. */
  setHeight(y: number) {
    this.plane.constant = y;
    for (const e of this.entries) {
      e.cap.position.set(0, y, 0);
      // Refresh cap color from live material (rooms change with colorMode)
      e.capMat.color.copy(this.readColor(e.mesh));
      e.capMat.needsUpdate = true;
    }
  }

  syncStencilTransforms() {
    // When stencil is child of mesh, local identity is fine
    for (const e of this.entries) {
      e.stencil.position.set(0, 0, 0);
      e.stencil.quaternion.identity();
      e.stencil.scale.set(1, 1, 1);
    }
  }

  private readColor(mesh: THREE.Mesh): THREE.Color {
    const m = mesh.material;
    const mat = (Array.isArray(m) ? m[0] : m) as THREE.MeshStandardMaterial | undefined;
    if (mat?.color) return mat.color.clone();
    return new THREE.Color(0xb8bec8);
  }

  private createStencilGroup(geometry: THREE.BufferGeometry, renderOrder: number) {
    const group = new THREE.Group();
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

    group.userData.isClipStencil = true;
    return group;
  }

  dispose() {
    this.clear();
    if (this.scene) this.scene.remove(this.group);
    this.scene = null;
  }
}
