import * as THREE from "three";
import { flyTo } from "./flyTo";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const CUBE_SIZE = 100;
const MARGIN = 16;

type ZoneKind = "face" | "edge" | "corner";

type ZoneUserData = {
  kind: ZoneKind;
  /** Unit direction from origin toward the view (camera looks at origin from this dir). */
  dir: THREE.Vector3;
  label?: string;
};

/**
 * Revit-style ViewCube drawn into a scissor viewport of the main renderer.
 */
export class ViewCube {
  readonly size = CUBE_SIZE;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  private root = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hitTargets: THREE.Object3D[] = [];
  private viewport = { x: 0, y: 0, w: CUBE_SIZE, h: CUBE_SIZE };
  private disposed = false;

  constructor() {
    this.camera.position.set(0, 0, 4.2);
    this.camera.lookAt(0, 0, 0);
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
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.copy(f.rot);
      mesh.position.copy(f.dir.clone().multiplyScalar(0.52));
      const ud: ZoneUserData = { kind: "face", dir: f.dir.clone(), label: f.label };
      mesh.userData = ud;
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
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x * 0.52, y * 0.52, z * 0.52);
      mesh.userData = { kind: "edge", dir } satisfies ZoneUserData;
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
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(x * 0.52, y * 0.52, z * 0.52);
          mesh.userData = { kind: "corner", dir } satisfies ZoneUserData;
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
    // Cube camera sits on a sphere looking at origin, matching main view direction
    this.camera.position.copy(offset.multiplyScalar(4.2));
    this.camera.up.copy(mainCamera.up);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  }

  updateViewport(canvasWidth: number, canvasHeight: number) {
    this.viewport = {
      x: canvasWidth - CUBE_SIZE - MARGIN,
      y: canvasHeight - CUBE_SIZE - MARGIN,
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
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, w, h);
    renderer.setViewport(x, y, w, h);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.width / renderer.getPixelRatio(), renderer.domElement.height / renderer.getPixelRatio());
    // Restore full viewport using drawing buffer size
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
    // Viewport y is from bottom in WebGL; convert CSS top-left to match
    const size = { w: rect.width, h: rect.height };
    const vx = size.w - CUBE_SIZE - MARGIN;
    const vyTop = MARGIN; // CSS top
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
    if (!this.containsClientPoint(clientX, clientY, canvas)) return null;
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const vx = rect.width - CUBE_SIZE - MARGIN;
    const vyTop = MARGIN;
    const nx = ((cssX - vx) / CUBE_SIZE) * 2 - 1;
    const ny = -(((cssY - vyTop) / CUBE_SIZE) * 2 - 1);
    this.pointer.set(nx, ny);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitTargets, false);
    if (!hits.length) return null;
    return hits[0].object.userData as ZoneUserData;
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
    // Keep a sensible up vector (avoid gimbal on Top/Bottom)
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
