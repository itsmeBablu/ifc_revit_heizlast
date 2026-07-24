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
import {
  ClipSliceController,
  EXPLODE_GAP_FACTOR,
  EXPLODE_LEFT_FACTOR,
  floorWorldYBounds,
} from "@/lib/clipSlice";
import { roomPassesFilter } from "@/lib/roomFilter";
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
  /** Search-only: fly camera to frame a room mesh (does zoom). */
  flyToRoom: (roomId: string) => Promise<void>;
  /** Force a render then return canvas PNG data URL. */
  captureViewport: () => string | null;
};

type Props = {
  onPointerMove?: (x: number, y: number) => void;
  className?: string;
};

function roomColorHex(
  room: Room,
  mode: "heizlast" | "temperature",
  palette?: string,
  heizlastRange?: number[],
  temperatureRange?: number[],
): string {
  return mode === "heizlast"
    ? heizlastToColor(room.heatLoad, palette, heizlastRange)
    : temperatureToColor(room.temperature, palette, temperatureRange);
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
    !obj.userData.isClipStencil &&
    !obj.userData.isClipCap &&
    !obj.userData.isSelectionOutline &&
    obj.material instanceof THREE.MeshStandardMaterial
  );
}

function isShellMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return (
    obj instanceof THREE.Mesh &&
    obj.userData.kind !== "room" &&
    !obj.userData.isClipStencil &&
    !obj.userData.isClipCap &&
    !obj.userData.isSelectionOutline &&
    obj.material instanceof THREE.MeshStandardMaterial
  );
}

function clearSelectionOutlines(root: THREE.Object3D | null | undefined) {
  if (!root) return;
  const toRemove: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.userData.isSelectionOutline) toRemove.push(o);
  });
  for (const o of toRemove) {
    o.parent?.remove(o);
    if (o instanceof THREE.Mesh) {
      (o.material as THREE.Material).dispose();
    }
  }
}

/** White backface outline — shared for 3D click + list select. */
function attachWhiteOutline(mesh: THREE.Mesh) {
  clearSelectionOutlines(mesh);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(1.055);
  outline.userData.isSelectionOutline = true;
  outline.renderOrder = (mesh.renderOrder ?? 0) - 1;
  mesh.add(outline);
}

/** Thick colored outline for presentation room highlight (no camera zoom). */
function attachColorOutline(mesh: THREE.Mesh, hex: string) {
  clearSelectionOutlines(mesh);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(1.12);
  outline.userData.isSelectionOutline = true;
  outline.renderOrder = (mesh.renderOrder ?? 0) - 1;
  mesh.add(outline);
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
  const presentationCamRef = useRef<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const explodeAnimRef = useRef<number>(0);
  const wasPresentationRef = useRef(false);

  const { shellGroup, rooms } = useModelScene();
  const colorMode = useAppStore((s) => s.colorMode);
  const activeColorPalette = useAppStore((s) => s.activeColorPalette);
  const heizlastRange = useAppStore((s) => s.heizlastRange);
  const temperatureRange = useAppStore((s) => s.temperatureRange);
  const renderMode = useAppStore((s) => s.renderMode);
  const lighting = useAppStore((s) => s.lighting);
  const sceneBackground = useAppStore((s) => s.sceneBackground);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const isPresentationView = useAppStore((s) => s.isPresentationView);
  const sliceProgress = useAppStore((s) => s.sliceProgress);
  const floors = useAppStore((s) => s.floors);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const activeFilter = useAppStore((s) => s.activeFilter);
  const selectedElement = useAppStore((s) => s.selectedElement);
  const setHoveredRoom = useAppStore((s) => s.setHoveredRoom);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const setLeftPanelOpen = useAppStore((s) => s.setLeftPanelOpen);
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
    flyToRoom: async (roomId: string) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const mesh = roomMeshById.current.get(roomId);
      if (!camera || !controls || !mesh) return;
      mesh.visible = true;
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.isEmpty()) return;
      const { position, target } = frameBoundingBox(box, camera, 1.55);
      await flyTo(camera, controls, position, target, 900);
    },
    captureViewport: () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      try {
        return renderer.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(
      useAppStore.getState().sceneBackground || 0xe8eaed,
    );

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    camera.position.set(20, 20, 20);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: true,
      // Needed so PDF export can read pixels after render()
      preserveDrawingBuffer: true,
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
      const hex = roomColorHex(
        room,
        colorMode,
        activeColorPalette,
        heizlastRange,
        temperatureRange,
      );
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

    // Floor-scoped clip registration happens in the selectedFloor effect
    clipRef.current?.clear();

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
      const hex = roomColorHex(
        room,
        colorMode,
        activeColorPalette,
        heizlastRange,
        temperatureRange,
      );
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
    clipRef.current?.rebindMaterials();
    clipRef.current?.rebuildCaps();
  }, [colorMode, activeColorPalette, heizlastRange, temperatureRange, rooms, roomsFromStore, renderMode, lighting]);

  // Render mode + lighting
  useEffect(() => {
    applyRenderMode(
      renderMode,
      shellCloneRef.current,
      overlaysRef.current,
      true,
      lighting,
    );
    clipRef.current?.rebindMaterials();

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

  // 3D viewport background color
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.background = new THREE.Color(sceneBackground);
  }, [sceneBackground]);

  // Single slice path (basic view only) — skipped in Presentation View
  useEffect(() => {
    const clip = clipRef.current;

    if (isPresentationView) {
      return;
    }

    const applyFloorVisibility = (obj: THREE.Object3D) => {
      const floorId = obj.userData.floorId as string | undefined;
      if (!floorId) {
        obj.visible = true;
        return;
      }
      obj.visible = selectedFloor == null || floorId === selectedFloor;
    };

    shellCloneRef.current?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) applyFloorVisibility(obj);
    });
    overlaysRef.current?.children.forEach((child) => applyFloorVisibility(child));

    if (!clip) return;

    clip.setOrientation("horizontal");

    if (!selectedFloor) {
      clip.clear();
      clip.setEnabled(false);
      clip.setCapsEnabled(false);
      requestAnimationFrame(() => fitToVisible());
      return;
    }

    const floorMeshes: THREE.Mesh[] = [];
    shellCloneRef.current?.traverse((o) => {
      if (isShellMesh(o) && o.userData.floorId === selectedFloor) {
        floorMeshes.push(o);
      }
    });
    overlaysRef.current?.traverse((o) => {
      if (isOverlayRoomMesh(o) && o.userData.floorId === selectedFloor) {
        floorMeshes.push(o);
      }
    });

    for (const m of floorMeshes) m.visible = true;

    const bounds = floorWorldYBounds(selectedFloor, [
      shellCloneRef.current,
      overlaysRef.current,
    ]);
    const t = useAppStore.getState().sliceProgress;
    const heightY = bounds
      ? bounds.yMin + t * Math.max(0.05, bounds.yMax - bounds.yMin)
      : 0;

    clip.setHeight(heightY);
    clip.setMeshes(floorMeshes);
    clip.setEnabled(true);
    clip.setCapsEnabled(true);
    clip.rebuildCaps();
    clip.setHeight(heightY);

    debugLog(
      "Viewer3D",
      `rebuildSliceCaps floor=${selectedFloor} n=${floorMeshes.length} y=${heightY.toFixed(2)}`,
      floorMeshes.length ? "ok" : "warn",
    );

    requestAnimationFrame(() => fitToVisible());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedFloor,
    colorMode,
    activeColorPalette,
    heizlastRange,
    temperatureRange,
    floors,
    shellGroup,
    rooms,
    roomsFromStore,
    isPresentationView,
  ]);

  // Instant plane/cap height while dragging — basic view only
  useEffect(() => {
    if (isPresentationView) return;
    const clip = clipRef.current;
    if (!clip || !selectedFloor) return;
    const bounds = floorWorldYBounds(selectedFloor, [
      shellCloneRef.current,
      overlaysRef.current,
    ]);
    if (!bounds) return;
    const span = Math.max(0.05, bounds.yMax - bounds.yMin);
    clip.setHeight(bounds.yMin + sliceProgress * span);
  }, [selectedFloor, sliceProgress, floors, shellGroup, rooms, isPresentationView]);

  // Presentation View: explode floors + vertical half-cut + iso camera
  useEffect(() => {
    const clip = clipRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!clip || !camera || !controls) return;

    cancelAnimationFrame(explodeAnimRef.current);

    const collectFloorMeshes = () => {
      const map = new Map<string, THREE.Mesh[]>();
      const add = (o: THREE.Object3D) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.userData.isClipStencil || o.userData.isSelectionOutline) return;
        if (o.userData.isClipCap) return;
        const fid = o.userData.floorId as string | undefined;
        if (!fid) return;
        if (!map.has(fid)) map.set(fid, []);
        map.get(fid)!.push(o);
      };
      shellCloneRef.current?.traverse(add);
      overlaysRef.current?.traverse(add);
      return map;
    };

    const applyExplode = (t: number) => {
      const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
      const byFloor = collectFloorMeshes();

      // Measure floor heights + plan width in world units (strip offsets first)
      let heightSum = 0;
      let heightCount = 0;
      const planBox = new THREE.Box3();
      let anyMesh = false;
      for (const f of sorted) {
        const box = new THREE.Box3();
        for (const mesh of byFloor.get(f.id) ?? []) {
          const offY = (mesh.userData.presentationOffsetY as number) ?? 0;
          const offX = (mesh.userData.presentationOffsetX as number) ?? 0;
          if (offY) mesh.position.y -= offY;
          if (offX) mesh.position.x -= offX;
          box.expandByObject(mesh);
          planBox.expandByObject(mesh);
          anyMesh = true;
          if (offY) mesh.position.y += offY;
          if (offX) mesh.position.x += offX;
        }
        if (!box.isEmpty()) {
          heightSum += Math.max(0.01, box.max.y - box.min.y);
          heightCount += 1;
        }
      }
      const avgH = heightCount ? heightSum / heightCount : 3;
      const gap = avgH * EXPLODE_GAP_FACTOR;
      const widthX = anyMesh && !planBox.isEmpty()
        ? Math.max(planBox.max.x - planBox.min.x, 0.01)
        : avgH * 4;
      const leftShift = -widthX * EXPLODE_LEFT_FACTOR;

      for (let i = 0; i < sorted.length; i++) {
        const targetY = i * gap * t;
        const targetX = leftShift * t;
        const meshes = byFloor.get(sorted[i].id) ?? [];
        for (const mesh of meshes) {
          const prevY = (mesh.userData.presentationOffsetY as number) ?? 0;
          const prevX = (mesh.userData.presentationOffsetX as number) ?? 0;
          mesh.position.y += targetY - prevY;
          mesh.position.x += targetX - prevX;
          mesh.userData.presentationOffsetY = targetY;
          mesh.userData.presentationOffsetX = targetX;
        }
      }
      return gap;
    };

    const collectAllMeshes = () => {
      const all: THREE.Mesh[] = [];
      collectFloorMeshes().forEach((arr) => all.push(...arr));
      return all;
    };

    const flyIso = (allMeshes: THREE.Mesh[]) => {
      const box = new THREE.Box3();
      for (const m of allMeshes) {
        if (m.visible) box.expandByObject(m);
      }
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      // Same corner azimuth, slightly lower pitch
      const elev = (34 * Math.PI) / 180;
      const dir = new THREE.Vector3(
        Math.cos(elev),
        Math.sin(elev),
        Math.cos(elev),
      ).normalize();

      // Fit full exploded stack to the viewport
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      const vFov = (camera.fov * Math.PI) / 180;
      const fitH = sphere.radius / Math.sin(vFov / 2);
      const fitW =
        sphere.radius /
        Math.sin(Math.atan(Math.tan(vFov / 2) * camera.aspect));
      const dist = Math.max(fitH, fitW) * 1.12;
      const isoPos = center.clone().add(dir.multiplyScalar(dist));
      void flyTo(camera, controls, isoPos, center, 900);
    };

    if (isPresentationView) {
      const entering = !wasPresentationRef.current;
      wasPresentationRef.current = true;

      if (entering) {
        presentationCamRef.current = {
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
        };
      }

      // Full floors — no clip/cut so rooms keep normal size
      clip.setOrientation("horizontal");
      clip.clear();
      clip.setEnabled(false);
      clip.setCapsEnabled(false);

      const showAll = (obj: THREE.Object3D) => {
        if (obj instanceof THREE.Mesh && obj.userData.floorId) {
          obj.visible = true;
        }
      };
      shellCloneRef.current?.traverse(showAll);
      overlaysRef.current?.children.forEach(showAll);

      if (!entering) {
        const gap = applyExplode(1);
        debugLog(
          "Viewer3D",
          `presentation refresh n=${collectAllMeshes().length} gap=${gap.toFixed(2)}`,
          "ok",
        );
        return;
      }

      const start = performance.now();
      const duration = 700;
      let lastGap = 0;
      const tick = (now: number) => {
        const e = Math.min(1, (now - start) / duration);
        const ease = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
        lastGap = applyExplode(ease);
        if (e < 1) {
          explodeAnimRef.current = requestAnimationFrame(tick);
        } else {
          const allMeshes = collectAllMeshes();
          flyIso(allMeshes);
          debugLog(
            "Viewer3D",
            `presentation n=${allMeshes.length} gap=${lastGap.toFixed(2)}`,
            "ok",
          );
        }
      };
      explodeAnimRef.current = requestAnimationFrame(tick);
    } else if (wasPresentationRef.current) {
      wasPresentationRef.current = false;
      clip.setOrientation("horizontal");
      clip.clear();
      clip.setEnabled(false);
      clip.setCapsEnabled(false);

      const start = performance.now();
      const duration = 600;
      const startOffsets = new Map<
        THREE.Mesh,
        { y: number; x: number }
      >();
      collectFloorMeshes().forEach((arr) => {
        for (const m of arr) {
          startOffsets.set(m, {
            y: (m.userData.presentationOffsetY as number) ?? 0,
            x: (m.userData.presentationOffsetX as number) ?? 0,
          });
        }
      });

      const tick = (now: number) => {
        const e = Math.min(1, (now - start) / duration);
        const ease = e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2;
        const t = 1 - ease;
        startOffsets.forEach((startOff, mesh) => {
          const targetY = startOff.y * t;
          const targetX = startOff.x * t;
          const prevY = (mesh.userData.presentationOffsetY as number) ?? 0;
          const prevX = (mesh.userData.presentationOffsetX as number) ?? 0;
          mesh.position.y += targetY - prevY;
          mesh.position.x += targetX - prevX;
          mesh.userData.presentationOffsetY = targetY;
          mesh.userData.presentationOffsetX = targetX;
          if (e >= 1) {
            delete mesh.userData.presentationOffsetY;
            delete mesh.userData.presentationOffsetX;
          }
        });
        if (e < 1) {
          explodeAnimRef.current = requestAnimationFrame(tick);
        } else {
          const saved = presentationCamRef.current;
          if (saved) {
            void flyTo(
              camera,
              controls,
              new THREE.Vector3(...saved.position),
              new THREE.Vector3(...saved.target),
              850,
            );
            presentationCamRef.current = null;
          } else {
            requestAnimationFrame(() => fitToVisible());
          }
        }
      };
      explodeAnimRef.current = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(explodeAnimRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresentationView, floors, shellGroup, rooms]);

  // Outline for selected room (3D or list) — no camera zoom
  useEffect(() => {
    const baseOpacity = useAppStore.getState().lighting.transparency;
    const selectedExpress = selectedElement?.expressId ?? null;
    const lightMode = useAppStore.getState().renderMode === "light";
    const presentation = useAppStore.getState().isPresentationView;
    const palette = useAppStore.getState().activeColorPalette;

    const filter = useAppStore.getState().activeFilter;
    const byId = new Map(
      (rooms.length ? rooms : roomsFromStore).map((r) => [r.id, r]),
    );

    for (const [id, mesh] of roomMeshById.current) {
      clearSelectionOutlines(mesh);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const isSel =
        id === selectedRoomId || mesh.userData.expressId === selectedExpress;
      const room = byId.get(id);
      const passes =
        !filter || !room || roomPassesFilter(room, filter);
      // Non-matches stay visible but heavily faded (filter within floor scope)
      mat.opacity = !passes
        ? 0.1
        : isSel
          ? Math.min(0.95, baseOpacity + 0.15)
          : baseOpacity;
      if (!lightMode) {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
      if (isSel && passes) {
        if (presentation) {
          const hex =
            (mesh.userData.colorHex as string | undefined) ??
            (mesh.userData.baseColorHex as string | undefined) ??
            `#${mat.color.getHexString()}`;
          attachColorOutline(mesh, hex);
          if (!lightMode) {
            mat.emissive.set(hex);
            mat.emissiveIntensity = 0.35;
          }
        } else {
          attachWhiteOutline(mesh);
        }
      }
      mat.needsUpdate = true;
    }

    shellCloneRef.current?.traverse((obj) => {
      if (!isShellMesh(obj)) return;
      clearSelectionOutlines(obj);
      const mat = obj.material as THREE.MeshStandardMaterial;
      const isSel = obj.userData.expressId === selectedExpress;
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      if (isSel) {
        if (presentation) {
          const hex =
            (obj.userData.colorHex as string | undefined) ??
            `#${mat.color.getHexString()}`;
          attachColorOutline(obj, hex);
        } else {
          attachWhiteOutline(obj);
        }
      }
      mat.needsUpdate = true;
    });
    // palette unused except for future; keep presentation/selection in sync
    void palette;
  }, [
    selectedRoomId,
    selectedElement,
    lighting.transparency,
    isPresentationView,
    activeColorPalette,
    activeFilter,
    rooms,
    roomsFromStore,
  ]);

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
      const hit = hits.find(
        (h) =>
          !h.object.userData.isClipStencil &&
          !h.object.userData.isSelectionOutline &&
          !h.object.userData.isClipCap,
      );
      return hit ?? null;
    };

    const onMove = (e: PointerEvent) => {
      onPointerMove?.(e.clientX, e.clientY);
      const cube = viewCubeRef.current;
      if (cube?.containsClientPoint(e.clientX, e.clientY, canvas)) {
        cube.updateHover(e.clientX, e.clientY, canvas);
        canvas.style.cursor = "pointer";
        setHoveredRoom(null);
        return;
      }
      cube?.clearHover();
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
      viewCubeRef.current?.clearHover();
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
            setLeftPanelOpen(true);
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
    setLeftPanelOpen,
  ]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} data-viewer-root />
  );
});

export default Viewer3D;
