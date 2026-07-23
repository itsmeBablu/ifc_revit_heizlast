import * as THREE from "three";
import { flyTo } from "./flyTo";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const CUBE_SIZE = 100;
/** Keep cube above Legend panel (panel starts ~ top-36). */
const MARGIN_TOP = 18;
const MARGIN_RIGHT = 18;

type ZoneKind = "face" | "edge" | "corner";

type ZoneUserData = {
  kind: ZoneKind;
  /** Unit direction from origin toward the view (camera looks at origin from this dir). */
  dir: THREE.Vector3;
  label?: string;
};

type HitMesh = THREE.Mesh;

/**
 * Revit-style ViewCube drawn into a scissor viewport of the main renderer.
 * No background panel — cube floats over the scene.
 */
export class ViewCube {
  readonly size = CUBE_SIZE;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  private root = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hitTargets: HitMesh[] = [];
  private hovered: HitMesh | null = null;
  private viewport = { x: 0, y: 0, w: CUBE_SIZE, h: CUBE_SIZE };
  private disposed = false;

  constructor() {
    this.camera.position.set(0, 0, 4.2);
    this.camera.lookAt(0, 0, 0);
    // Transparent scene — only cube geometry draws
    this.scene.background = null;
    this.scene.add(this.root);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(2, 3, 4);
    this.scene.add(key);
    this.buildCube();
  }

  private buildCube() {
    const faceSize = 1.05;
    const faces: { label: string; dir: THREE.Vector3; color: number; rot: THREE.Euler }[] = [
      { label: "FRONT", dir: new THREE.Vector3(0, 0, 1), color: 0xe8eaee, rot: new THREE.Euler(0, 0, 0) },
      { label: "BACK", dir: new THREE.Vector3(0, 0, -1), color: 0xe8eaee, rot: new THREE.Euler(0, Math.PI, 0) },
      { label: "RIGHT", dir: new THREE.Vector3(1, 0, 0), color: 0xe2e5ea, rot: new THREE.Euler(0, Math.PI / 2, 0) },
      { label: "LEFT", dir: new THREE.Vector3(-1, 0, 0), color: 0xe2e5ea, rot: new THREE.Euler(0, -Math.PI / 2, 0) },
      { label: "TOP", dir: new THREE.Vector3(0, 1, 0), color: 0xf2f4f7, rot: new THREE.Euler(-Math.PI / 2, 0, 0) },
      { label: "BOTTOM", dir: new THREE.Vector3(0, -1, 0), color: 0xd8dce3, rot: new THREE.Euler(Math.PI / 2, 0, 0) },
    ];

    for (const f of faces) {
      const faceCanvas = document.createElement("canvas");
      faceCanvas.width = 128;
      faceCanvas.height = 128;
      const ctx = faceCanvas.getContext("2d")!;
      ctx.fillStyle = `#${f.color.toString(16).padStart(6, "0")}`;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = "#3f3f46";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.label, 64, 64);
      const tex = new THREE.CanvasTexture(faceCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      const geo = new THREE.PlaneGeometry(faceSize, faceSize);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.65,
        metalness: 0.02,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat) as HitMesh;
      mesh.rotation.copy(f.rot);
      mesh.position.copy(f.dir.clone().multiplyScalar(0.52));
      mesh.userData = { kind: "face", dir: f.dir.clone(), label: f.label };
      mesh.userData = Object.assign(mesh.userData, {
        baseEmissive: 0x000000,
        hoverColor: 0xffffff,
      });
      (mesh as THREE.Mesh & { userData: ZoneUserData & { restOpacity?: number } }).userData;
      mat.userData.restEmissiveIntensity = 0;
      this.root.add(mesh);
      this.hitTargets.push(mesh);
    }

    const edgeLen = 0.95;
    const edgeR = 0.08;
    const edgeMids = [
      [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
      [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
      [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
    ];
    for (const [x, y, z] of edgeMids) {
      const dir = new THREE.Vector3(x, y, z).normalize();
      const geo = new THREE.BoxGeometry(
        x === 0 ? edgeLen : edgeR * 2,
        y === 0 ? edgeLen : edgeR * 2,
        z === 0 ? edgeLen : edgeR * 2,
      );
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9ca3af,
        transparent: true,
        opacity: 0.35,
      });
      mat.userData.restColor = 0x9ca3af;
      mat.userData.restOpacity = 0.35;
      const mesh = new THREE.Mesh(geo, mat) as HitMesh;
      mesh.position.set(x * 0.52, y * 0.52, z * 0.52);
      mesh.userData = { kind: "edge", dir };
      this.root.add(mesh);
      this.hitTargets.push(mesh);
    }

    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const dir = new THREE.Vector3(x, y, z).normalize();
          const geo = new THREE.SphereGeometry(0.12, 10, 10);
          const mat = new THREE.MeshBasicMaterial({
            color: 0x71717a,
            transparent: true,
            opacity: 0.45,
          });
          mat.userData.restColor = 0x71717a;
          mat.userData.restOpacity = 0.45;
          const mesh = new THREE.Mesh(geo, mat) as HitMesh;
          mesh.position.set(x * 0.52, y * 0.52, z * 0.52);
          mesh.userData = { kind: "corner", dir };
          this.root.add(mesh);
          this.hitTargets.push(mesh);
        }
      }
    }

    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 1.06, 1.06));
    const line = new THREE.LineSegments(
      edgesGeo,
      new THREE.LineBasicMaterial({ color: 0xa1a1aa }),
    );
    this.root.add(line);
  }

  /** Sync cube orientation to main camera (rotation only). */
  syncFromCamera(mainCamera: THREE.Camera, target: THREE.Vector3) {
    const offset = mainCamera.position.clone().sub(target).normalize();
    this.camera.position.copy(offset.multiplyScalar(4.2));
    this.camera.up.copy(mainCamera.up);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  updateViewport(canvasWidth: number, canvasHeight: number) {
    this.viewport = {
      x: canvasWidth - CUBE_SIZE - MARGIN_RIGHT,
      y: canvasHeight - CUBE_SIZE - MARGIN_TOP,
      w: CUBE_SIZE,
      h: CUBE_SIZE,
    };
  }

  /** Draw into the top-right scissor of the shared renderer (call AFTER main render). */
  render(renderer: THREE.WebGLRenderer) {
    if (this.disposed) return;
    const { x, y, w, h } = this.viewport;
    const prev = {
      autoClear: renderer.autoClear,
    };
    renderer.autoClear = false;
    renderer.clearDepth();
    // Do NOT clear color — leave main scene visible behind the cube
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    const size = new THREE.Vector2();
    renderer.getSize(size);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.autoClear = prev.autoClear;
  }

  /** Returns true if (clientX, clientY) is inside the cube's screen rect. */
  containsClientPoint(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): boolean {
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const size = { w: rect.width, h: rect.height };
    const vx = size.w - CUBE_SIZE - MARGIN_RIGHT;
    const vyTop = MARGIN_TOP;
    return (
      cssX >= vx &&
      cssX <= vx + CUBE_SIZE &&
      cssY >= vyTop &&
      cssY <= vyTop + CUBE_SIZE
    );
  }

  pick(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): ZoneUserData | null {
    const mesh = this.pickMesh(clientX, clientY, canvas);
    return mesh ? (mesh.userData as ZoneUserData) : null;
  }

  private pickMesh(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): HitMesh | null {
    if (!this.containsClientPoint(clientX, clientY, canvas)) return null;
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const vx = rect.width - CUBE_SIZE - MARGIN_RIGHT;
    const vyTop = MARGIN_TOP;
    const nx = ((cssX - vx) / CUBE_SIZE) * 2 - 1;
    const ny = -(((cssY - vyTop) / CUBE_SIZE) * 2 - 1);
    this.pointer.set(nx, ny);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitTargets, false);
    if (!hits.length) return null;
    return hits[0].object as HitMesh;
  }

  /** Live hover highlight for the zone under the cursor (face / edge / corner). */
  updateHover(clientX: number, clientY: number, canvas: HTMLCanvasElement) {
    const next = this.pickMesh(clientX, clientY, canvas);
    if (next === this.hovered) return;
    this.clearHover();
    this.hovered = next;
    if (!next) return;
    this.applyHover(next, true);
  }

  clearHover() {
    if (this.hovered) {
      this.applyHover(this.hovered, false);
      this.hovered = null;
    }
  }

  private applyHover(mesh: HitMesh, on: boolean) {
    const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
    if (mat instanceof THREE.MeshStandardMaterial) {
      if (on) {
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.55;
        mat.opacity = 1;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.opacity = 1;
      }
      mat.needsUpdate = true;
      return;
    }
    if (mat instanceof THREE.MeshBasicMaterial) {
      if (on) {
        mat.color.setHex(0xffffff);
        mat.opacity = 0.95;
      } else {
        mat.color.setHex((mat.userData.restColor as number) ?? 0x9ca3af);
        mat.opacity = (mat.userData.restOpacity as number) ?? 0.35;
      }
      mat.needsUpdate = true;
    }
  }

  /**
   * Animate main camera to look at `controls.target` from the zone direction,
   * preserving approximate distance.
   */
  async snapMainCamera(
    zone: ZoneUserData,
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    duration = 600,
  ): Promise<void> {
    const target = controls.target.clone();
    const dist = Math.max(camera.position.distanceTo(target), 1);
    const dir = zone.dir.clone().normalize();
    const position = target.clone().add(dir.multiplyScalar(dist));
    if (Math.abs(zone.dir.y) > 0.9) {
      camera.up.set(0, 0, zone.dir.y > 0 ? -1 : 1);
    } else {
      camera.up.set(0, 1, 0);
    }
    await flyTo(camera, controls, position, target, duration);
    camera.up.set(0, 1, 0);
    controls.update();
  }

  dispose() {
    this.disposed = true;
    this.clearHover();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}
