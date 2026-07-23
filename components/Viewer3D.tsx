"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { heizlastToColor, temperatureToColor } from "@/lib/colorMapping";
import { flyTo, frameBoundingBox } from "@/lib/flyTo";
import { getElementDetails } from "@/lib/ifcClient";
import { debugLog } from "@/lib/debugLog";
import { ViewCube } from "@/lib/viewCube";
import { ClipSliceController } from "@/lib/clipSlice";
import type { RenderMode, Room } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";

export type Viewer3DHandle = {
  getCameraPose: () => {
    position: [number, number, number];
    target: [number, number, number];
  };
  flyToPose: (
    position: [number, number, number],
    target: [number, number, number],
    duration?: number,
  ) => Promise<void>;
  fitVisible: () => void;
};

type Props = {
  onPointerMove?: (x: number, y: number) => void;
  className?: string;
};

function roomColorHex(room: Room, mode: "heizlast" | "temperature"): string {
  return mode === "heizlast"
    ? heizlastToColor(room.heatLoad)
    : temperatureToColor(room.temperature);
}

/** Per-color material templates — always return a CLONE so rooms never share GPU state. */
function createOverlayMaterialCache() {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  return {
    get(hex: string): THREE.MeshStandardMaterial {
      const key = hex.toLowerCase();
      let proto = cache.get(key);
      if (!proto) {
        proto = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          transparent: true,
          opacity: 0.75,
          roughness: 1,
          metalness: 0,
          envMapIntensity: 0,
          // depthWrite true stops transparent painter-sort flicker while orbiting
          depthWrite: true,
          depthTest: true,
          side: THREE.FrontSide,
          flatShading: true,
        });
        proto.userData.baseColorHex = hex;
        cache.set(key, proto);
      }
      const mat = proto.clone();
      mat.userData.baseColorHex = hex;
      return mat;
    },
    clear() {
      for (const mat of cache.values()) mat.dispose();
      cache.clear();
    },
  };
}

function isOverlayRoomMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (
    obj instanceof THREE.Mesh &&
    obj.userData.kind === "room" &&
    obj.material instanceof THREE.MeshStandardMaterial
  );
}

function isShellMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (
    obj instanceof THREE.Mesh &&
    !obj.userData.isClipStencil &&
    obj.material instanceof THREE.MeshStandardMaterial
  );
}

function applyRenderMode(
  mode: RenderMode,
  shell: THREE.Group | null,
  overlays: THREE.Group | null,
  showRoomOverlays: boolean,
  lighting?: { transparency: number; color: number },
) {
  const wire = mode === "wireframe";
  const light = mode === "light";
  const textureOnly = mode === "texture";
  const shellEmpty = !shell || shell.children.length === 0;
  const baseOpacity = lighting?.transparency ?? 0.7;
  const colorAmt = lighting?.color ?? 1;

  if (overlays) {
    // Texture normally hides overlays; if shell was culled (room-only IFC), show gray volumes
    overlays.visible =
      (showRoomOverlays && !textureOnly) || (textureOnly && shellEmpty);
    overlays.traverse((obj) => {
      // Skip stencil-cap helper meshes parented under rooms
      if (!isOverlayRoomMesh(obj)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      const baseHex =
        (mat.userData.baseColorHex as string | undefined) ??
        `#${mat.color.getHexString()}`;
      mat.wireframe = wire;
      mat.envMapIntensity = 0;
      mat.metalness = 0;
      mat.transparent = true;
      mat.depthWrite = true;
      mat.depthTest = true;
      mat.flatShading = true;
      mat.side = THREE.FrontSide;

      if (textureOnly && shellEmpty) {
        mat.color.setHex(0xc5cad3);
        mat.emissive?.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.roughness = 1;
        mat.opacity = 1;
        mat.transparent = false;
      } else if (light) {
        const c = new THREE.Color(baseHex).lerp(new THREE.Color(0xd0d4dc), 1 - colorAmt);
        mat.color.copy(c);
        mat.roughness = 1;
        mat.emissive.copy(c);
        mat.emissiveIntensity = 0.35 * colorAmt;
        mat.opacity = Math.min(0.95, baseOpacity + 0.1);
      } else {
        const c = new THREE.Color(baseHex).lerp(new THREE.Color(0xb8bec8), 1 - colorAmt);
        mat.color.copy(c);
        mat.roughness = 1;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
        mat.opacity = baseOpacity;
      }
      mat.needsUpdate = true;
    });
  }

  if (shell) {
    shell.visible = true;
    shell.traverse((obj) => {
      if (!isShellMesh(obj)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      mat.wireframe = wire;
      if (light) {
        mat.color.setHex(0xd8dce3);
        mat.roughness = 1;
        mat.metalness = 0;
        mat.envMapIntensity = 0;
        mat.opacity = 0.55;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.side = THREE.FrontSide;
      } else if (textureOnly) {
        mat.color.setHex(0xc5cad3);
        mat.roughness = 0.75;
        mat.metalness = 0.05;
        mat.envMapIntensity = 0.35;
        mat.opacity = 1;
        mat.transparent = false;
        mat.depthWrite = true;
        mat.side = THREE.FrontSide;
      } else if (mode === "realistic") {
        mat.color.setHex(0xb8bec8);
        mat.roughness = 0.65;
        mat.metalness = 0.08;
        mat.envMapIntensity = 0.85;
        mat.opacity = 0.35;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.side = THREE.FrontSide;
      } else {
        // fullColor — quiet shell, no depth-write so rooms don't flicker while orbiting
        mat.color.setHex(0xb8bec8);
        mat.roughness = 0.85;
        mat.metalness = 0.02;
        mat.envMapIntensity = 0.15;
        mat.opacity = 0.22;
        mat.transparent = true;
        mat.depthWrite = false;
        mat.side = THREE.FrontSide;
      }
      mat.needsUpdate = true;
    });
  }
}

const Viewer3D = forwardRef<Viewer3DHandle, Props>(function Viewer3D(
  { onPointerMove, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const shellCloneRef = useRef<THREE.Group | null>(null);
  const overlaysRef = useRef<THREE.Group | null>(null);
  const helpersRef = useRef<THREE.Group | null>(null);
  const sunRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const viewCubeRef = useRef<ViewCube | null>(null);
  const clipRef = useRef<ClipSliceController | null>(null);
  const roomMeshById = useRef<Map<string, THREE.Mesh>>(new Map());
  const materialCacheRef = useRef(createOverlayMaterialCache());
  const raycaster = useRef(new THREE.Raycaster());
  const pointerNdc = useRef(new THREE.Vector2());

  const { shellGroup, rooms } = useModelScene();
  const colorMode = useAppStore((s) => s.colorMode);
  const renderMode = useAppStore((s) => s.renderMode);
  const lighting = useAppStore((s) => s.lighting);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const sliceProgress = useAppStore((s) => s.sliceProgress);
  const floors = useAppStore((s) => s.floors);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const selectedElement = useAppStore((s) => s.selectedElement);
  const setHoveredRoom = useAppStore((s) => s.setHoveredRoom);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const roomsFromStore = useAppStore((s) => s.rooms);

  const fitToVisible = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const overlays = overlaysRef.current;
    const shell = shellCloneRef.current;
    if (!camera || !controls) return;

    const box = new THREE.Box3();
    let has = false;

    const consider = (obj: THREE.Object3D) => {
      if (!obj.visible) return;
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        box.union(b);
        has = true;
      }
    };

    if (overlays) consider(overlays);
    if (shell) consider(shell);

    if (!has) return;
    const { position, target } = frameBoundingBox(box, camera);
    void flyTo(camera, controls, position, target, 850);
  };

  useImperativeHandle(ref, () => ({
    getCameraPose: () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return { position: [0, 0, 0], target: [0, 0, 0] };
      }
      return {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
    },
    flyToPose: async (position, target, duration = 800) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      await flyTo(
        camera,
        controls,
        new THREE.Vector3(...position),
        new THREE.Vector3(...target),
        duration,
      );
    },
    fitVisible: fitToVisible,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8eaed);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(20, 20, 20);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = "block h-full w-full touch-none";

    const viewCube = new ViewCube();
    viewCubeRef.current = viewCube;

    const clip = new ClipSliceController();
    clip.attach(scene);
    clipRef.current = clip;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);
    ambientRef.current = ambient;

    const sun = new THREE.DirectionalLight(0xfff5e8, 1.1);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 250;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0002;
    scene.add(sun);
    sunRef.current = sun;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI; // allow full orbit — avoids horizon clipping flicker

    const overlays = new THREE.Group();
    overlays.name = "room-overlays";
    scene.add(overlays);

    const helpers = new THREE.Group();
    helpers.name = "empty-helpers";
    const grid = new THREE.GridHelper(50, 50, 0xa8adb8, 0xc8cdd6);
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of gridMats) {
      m.transparent = true;
      m.opacity = 0.55;
    }
    helpers.add(grid);
    helpers.add(new THREE.AxesHelper(4));
    scene.add(helpers);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    overlaysRef.current = overlays;
    helpersRef.current = helpers;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      viewCube.updateViewport(w, h);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const tick = () => {
      controls.update();
      viewCube.syncFromCamera(camera, controls.target);
      const sz = new THREE.Vector2();
      renderer.getSize(sz);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, sz.x, sz.y);
      renderer.render(scene, camera);
      viewCube.updateViewport(sz.x, sz.y);
      viewCube.render(renderer);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.environment?.dispose();
      materialCacheRef.current.clear();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      viewCube.dispose();
      clip.dispose();
      viewCubeRef.current = null;
      clipRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      overlaysRef.current = null;
      helpersRef.current = null;
      sunRef.current = null;
      ambientRef.current = null;
    };
  }, []);

  // Build shell + room overlays
  useEffect(() => {
    const scene = sceneRef.current;
    const overlays = overlaysRef.current;
    if (!scene || !overlays) return;

    materialCacheRef.current.clear();
    materialCacheRef.current = createOverlayMaterialCache();
    clipRef.current?.clear();

    if (shellCloneRef.current) {
      scene.remove(shellCloneRef.current);
      shellCloneRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      shellCloneRef.current = null;
    }

    while (overlays.children.length) {
      const child = overlays.children[0];
      overlays.remove(child);
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    }
    roomMeshById.current.clear();

    const sourceRooms = rooms.length ? rooms : roomsFromStore;
    const hasModel = Boolean(shellGroup) || sourceRooms.length > 0;

    if (helpersRef.current) {
      helpersRef.current.visible = !hasModel;
    }

    if (shellGroup) {
      const clone = shellGroup.clone(true);
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xb8bec8),
            roughness: 0.85,
            metalness: 0.02,
            envMapIntensity: 0.25,
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            side: THREE.FrontSide,
          });
          obj.castShadow = false;
          obj.receiveShadow = true;
        }
      });
      scene.add(clone);
      shellCloneRef.current = clone;
    }

    let logged = 0;
    for (const room of sourceRooms) {
      if (!room.geometry || room.geometry.attributes.position == null) continue;
      const hex = roomColorHex(room, colorMode);
      if (logged < 8) {
        debugLog(
          "Viewer3D",
          `color ${room.name}: ${hex} (H=${room.heatLoad}, T=${room.temperature})`,
          "info",
        );
        logged += 1;
      }
      const material = materialCacheRef.current.get(hex);
      const mesh = new THREE.Mesh(room.geometry, material);
      mesh.userData.roomId = room.id;
      mesh.userData.floorId = room.floorId;
      mesh.userData.expressId = room.expressId;
      mesh.userData.kind = "room";
      mesh.userData.colorHex = hex;
      mesh.renderOrder = 2;
      overlays.add(mesh);
      roomMeshById.current.set(room.id, mesh);
    }

    applyRenderMode(
      useAppStore.getState().renderMode,
      shellCloneRef.current,
      overlays,
      true,
      useAppStore.getState().lighting,
    );

    // Register clip-cap targets (shell + room overlays)
    const clipMeshes: THREE.Mesh[] = [];
    shellCloneRef.current?.traverse((o) => {
      if (isShellMesh(o)) clipMeshes.push(o);
    });
    overlays.traverse((o) => {
      if (isOverlayRoomMesh(o)) clipMeshes.push(o);
    });
    clipRef.current?.registerMeshes(clipMeshes);

    if (hasModel) {
      requestAnimationFrame(() => fitToVisible());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellGroup, rooms, roomsFromStore]);

  // Rebuild overlay materials when colorMode changes (new instances via cache)
  useEffect(() => {
    const sourceRooms = rooms.length ? rooms : roomsFromStore;
    const byId = new Map(sourceRooms.map((r) => [r.id, r]));
    materialCacheRef.current.clear();
    materialCacheRef.current = createOverlayMaterialCache();

    for (const [id, mesh] of roomMeshById.current) {
      const room = byId.get(id);
      if (!room) continue;
      const hex = roomColorHex(room, colorMode);
      const prev = mesh.material;
      mesh.material = materialCacheRef.current.get(hex);
      mesh.userData.colorHex = hex;
      if (prev && prev !== mesh.material) {
        if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
        else prev.dispose();
      }
    }
    applyRenderMode(
      renderMode,
      shellCloneRef.current,
      overlaysRef.current,
      true,
      lighting,
    );
    // Re-bind clipping planes after material swap
    const st = useAppStore.getState();
    if (st.selectedFloor && st.sliceProgress < 0.995) {
      clipRef.current?.setEnabled(true);
    }
  }, [colorMode, rooms, roomsFromStore, renderMode, lighting]);

  // Render mode + lighting
  useEffect(() => {
    applyRenderMode(
      renderMode,
      shellCloneRef.current,
      overlaysRef.current,
      true,
      lighting,
    );

    const sun = sunRef.current;
    const ambient = ambientRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (sun) {
      sun.intensity = 0.2 + lighting.shadow * 1.6;
      sun.castShadow = lighting.shadow > 0.05;
    }
    if (ambient) {
      ambient.intensity = 0.15 + lighting.indirectLight * 0.7;
    }
    if (renderer) {
      renderer.toneMappingExposure = 0.75 + lighting.indirectLight * 0.7;
      renderer.shadowMap.enabled = lighting.shadow > 0.05;
    }
    if (scene) {
      // Indirect: strengthen env contribution on shell when present
      shellCloneRef.current?.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (renderMode === "texture" || renderMode === "light") return;
        mat.envMapIntensity =
          (renderMode === "realistic" ? 0.5 : 0.1) +
          lighting.indirectLight * 0.9;
        mat.needsUpdate = true;
      });
    }
  }, [renderMode, lighting]);

  // Horizontal floor slice / clipping caps
  useEffect(() => {
    const clip = clipRef.current;
    if (!clip) return;

    if (!selectedFloor) {
      clip.setEnabled(false);
      return;
    }

    const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
    const idx = sorted.findIndex((f) => f.id === selectedFloor);
    if (idx < 0) {
      clip.setEnabled(false);
      return;
    }

    const floor = sorted[idx];
    const next = sorted[idx + 1];
    let yMax = next?.elevation;
    if (yMax == null) {
      const box = new THREE.Box3();
      shellCloneRef.current?.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) box.expandByObject(o);
      });
      overlaysRef.current?.traverse((o) => {
        if (o instanceof THREE.Mesh && o.visible) box.expandByObject(o);
      });
      yMax = box.isEmpty() ? floor.elevation + 3 : box.max.y;
    }
    const yMin = floor.elevation;
    const span = Math.max(0.05, yMax - yMin);
    // progress 1 = uncut (plane at top); 0 = cut at floor bottom
    const y = yMin + sliceProgress * span;

    if (sliceProgress >= 0.995) {
      clip.setEnabled(false);
    } else {
      clip.setEnabled(true);
      clip.setHeight(y);
      clip.syncStencilTransforms();
    }
  }, [selectedFloor, sliceProgress, floors, shellGroup, rooms]);

  // Floor visibility
  useEffect(() => {

    const apply = (obj: THREE.Object3D) => {
      const floorId = obj.userData.floorId as string | undefined;
      if (!floorId) {
        obj.visible = true;
        return;
      }
      obj.visible = selectedFloor == null || floorId === selectedFloor;
    };

    shellCloneRef.current?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) apply(obj);
    });
    overlaysRef.current?.children.forEach((child) => apply(child));
    // Fit only when floor filter changes (not on click)
    requestAnimationFrame(() => fitToVisible());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor, shellGroup, rooms]);

  // Highlight selected room / element — do NOT fly the camera
  useEffect(() => {
    const baseOpacity = useAppStore.getState().lighting.transparency;
    const selectedExpress = selectedElement?.expressId ?? null;
    for (const [id, mesh] of roomMeshById.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isSel =
        id === selectedRoomId || mesh.userData.expressId === selectedExpress;
      mat.opacity = isSel ? Math.min(0.95, baseOpacity + 0.2) : baseOpacity;
      if (!isSel && useAppStore.getState().renderMode !== "light") {
        mat.emissive.setHex(0x000000);
      } else if (isSel) {
        mat.emissive.setHex(0x223344);
      }
      mat.needsUpdate = true;
    }
    shellCloneRef.current?.traverse((obj) => {
      if (!isShellMesh(obj)) return;
      const mat = obj.material as THREE.MeshStandardMaterial;
      const isSel = obj.userData.expressId === selectedExpress;
      mat.emissive.setHex(isSel ? 0x3b82f6 : 0x000000);
      mat.needsUpdate = true;
    });
  }, [selectedRoomId, selectedElement, lighting.transparency]);

  // Pointer: select only — no camera flyTo
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    const pickHit = (clientX: number, clientY: number) => {
      const camera = cameraRef.current;
      if (!camera) return null;

      const rect = canvas.getBoundingClientRect();
      pointerNdc.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(pointerNdc.current, camera);

      const targets: THREE.Object3D[] = [];
      if (overlaysRef.current) targets.push(...overlaysRef.current.children);
      if (shellCloneRef.current) targets.push(shellCloneRef.current);

      const hits = raycaster.current.intersectObjects(targets, true);
      return hits[0] ?? null;
    };

    const onMove = (e: PointerEvent) => {
      onPointerMove?.(e.clientX, e.clientY);
      const cube = viewCubeRef.current;
      if (cube?.containsClientPoint(e.clientX, e.clientY, canvas)) {
        canvas.style.cursor = "pointer";
        setHoveredRoom(null);
        return;
      }
      const hit = pickHit(e.clientX, e.clientY);
      if (!hit) {
        setHoveredRoom(null);
        canvas.style.cursor = "default";
        return;
      }
      const roomId = hit.object.userData.roomId as string | undefined;
      if (roomId) {
        const room =
          rooms.find((r) => r.id === roomId) ??
          roomsFromStore.find((r) => r.id === roomId) ??
          null;
        setHoveredRoom(room);
      } else {
        setHoveredRoom(null);
      }
      canvas.style.cursor = "pointer";
    };

    const onLeave = () => {
      setHoveredRoom(null);
      canvas.style.cursor = "default";
    };

    const onClick = (e: PointerEvent) => {
      const cube = viewCubeRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (cube && camera && controls && cube.containsClientPoint(e.clientX, e.clientY, canvas)) {
        const zone = cube.pick(e.clientX, e.clientY, canvas);
        if (zone) {
          e.preventDefault();
          e.stopPropagation();
          void cube.snapMainCamera(zone, camera, controls, 600);
        }
        return;
      }

      const hit = pickHit(e.clientX, e.clientY);
      if (!hit) {
        setSelectedRoomId(null);
        setSelectedElement(null);
        return;
      }

      const obj = hit.object;
      const roomId = obj.userData.roomId as string | undefined;
      const expressId = obj.userData.expressId as number | undefined;
      const floorId = (obj.userData.floorId as string | undefined) ?? null;

      if (roomId) setSelectedRoomId(roomId);
      else setSelectedRoomId(null);

      if (expressId != null) {
        void (async () => {
          const details = await getElementDetails(
            expressId,
            floorId,
            roomId ?? null,
          );
          if (details) {
            setSelectedElement(details);
            setSidebarOpen(true);
            debugLog(
              "Viewer3D",
              `selected ${details.typeName}: ${details.name}`,
              "ok",
              { expressId, props: details.properties.length },
            );
          }
        })();
      }
      // Intentionally no flyTo — camera stays put
    };

    const onPointerDown = (e: PointerEvent) => {
      const cube = viewCubeRef.current;
      const controls = controlsRef.current;
      if (cube?.containsClientPoint(e.clientX, e.clientY, canvas) && controls) {
        controls.enabled = false;
      }
    };
    const onPointerUp = () => {
      const controls = controlsRef.current;
      if (controls) controls.enabled = true;
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("click", onClick);
    };
  }, [
    onPointerMove,
    rooms,
    roomsFromStore,
    setHoveredRoom,
    setSelectedRoomId,
    setSelectedElement,
    setSidebarOpen,
  ]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} data-viewer-root>
      {/* Glass frame around ViewCube scissor region (top-right) */}
      <div
        className="pointer-events-none absolute top-4 right-4 z-[5] h-[100px] w-[100px] rounded-2xl border border-white/50 shadow-[0_8px_28px_rgba(0,0,0,0.08)]"
        aria-hidden
      />
    </div>
  );
});

export default Viewer3D;
