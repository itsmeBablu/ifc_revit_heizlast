"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { heizlastToColor, temperatureToColor } from "@/lib/colorMapping";
import { frameBoundingBoxOrtho } from "@/lib/flyTo";
import type { Room } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";

type Props = {
  onPointerMove?: (x: number, y: number) => void;
  className?: string;
};

function roomColor(room: Room, mode: "heizlast" | "temperature"): string {
  return mode === "heizlast"
    ? heizlastToColor(room.heatLoad)
    : temperatureToColor(room.temperature);
}

export default function Plan2D({ onPointerMove, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const shellCloneRef = useRef<THREE.Group | null>(null);
  const overlaysRef = useRef<THREE.Group | null>(null);
  const roomMeshById = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycaster = useRef(new THREE.Raycaster());
  const pointerNdc = useRef(new THREE.Vector2());

  const { shellGroup, rooms } = useModelScene();
  const colorMode = useAppStore((s) => s.colorMode);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const setHoveredRoom = useAppStore((s) => s.setHoveredRoom);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const roomsFromStore = useAppStore((s) => s.rooms);

  const fitOrtho = () => {
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

    const { position, target, zoom } = frameBoundingBoxOrtho(box, camera);
    camera.position.copy(position);
    controls.target.copy(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.update();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f5f7);

    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 5000);
    camera.position.set(0, 100, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    renderer.domElement.className = "block h-full w-full touch-none";

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b0b0, 1.1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(20, 40, 10);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.minZoom = 0.2;
    controls.maxZoom = 40;

    const overlays = new THREE.Group();
    scene.add(overlays);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    overlaysRef.current = overlays;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      const aspect = w / h;
      const frustum = 20;
      camera.left = (-frustum * aspect) / 2;
      camera.right = (frustum * aspect) / 2;
      camera.top = frustum / 2;
      camera.bottom = -frustum / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const overlays = overlaysRef.current;
    if (!scene || !overlays) return;

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
      const child = overlays.children[0] as THREE.Mesh;
      overlays.remove(child);
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else (mat as THREE.Material)?.dispose();
    }
    roomMeshById.current.clear();

    if (shellGroup) {
      const clone = shellGroup.clone(true);
      clone.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.material = new THREE.MeshStandardMaterial({
            color: 0xd5d8de,
            roughness: 0.85,
            metalness: 0,
            side: THREE.DoubleSide,
          });
        }
      });
      scene.add(clone);
      shellCloneRef.current = clone;
    }

    const sourceRooms = rooms.length ? rooms : roomsFromStore;
    for (const room of sourceRooms) {
      if (!room.geometry || room.geometry.attributes.position == null) continue;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(roomColor(room, colorMode)),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(room.geometry, material);
      mesh.userData.roomId = room.id;
      mesh.userData.floorId = room.floorId;
      overlays.add(mesh);
      roomMeshById.current.set(room.id, mesh);
    }

    requestAnimationFrame(() => fitOrtho());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellGroup, rooms, roomsFromStore]);

  useEffect(() => {
    const sourceRooms = rooms.length ? rooms : roomsFromStore;
    const byId = new Map(sourceRooms.map((r) => [r.id, r]));
    for (const [id, mesh] of roomMeshById.current) {
      const room = byId.get(id);
      if (!room) continue;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(roomColor(room, colorMode));
    }
  }, [colorMode, rooms, roomsFromStore]);

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
    requestAnimationFrame(() => fitOrtho());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFloor, shellGroup, rooms]);

  useEffect(() => {
    for (const [id, mesh] of roomMeshById.current) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = id === selectedRoomId ? 0.85 : 0.6;
      mat.emissive.setHex(id === selectedRoomId ? 0x333333 : 0x000000);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    const pickRoom = (clientX: number, clientY: number): Room | null => {
      const camera = cameraRef.current;
      const overlays = overlaysRef.current;
      if (!camera || !overlays) return null;
      const rect = canvas.getBoundingClientRect();
      pointerNdc.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(pointerNdc.current, camera);
      const hits = raycaster.current.intersectObjects(overlays.children, false);
      if (!hits.length) return null;
      const roomId = hits[0].object.userData.roomId as string | undefined;
      if (!roomId) return null;
      return (
        rooms.find((r) => r.id === roomId) ??
        roomsFromStore.find((r) => r.id === roomId) ??
        null
      );
    };

    const onMove = (e: PointerEvent) => {
      onPointerMove?.(e.clientX, e.clientY);
      const room = pickRoom(e.clientX, e.clientY);
      setHoveredRoom(room);
      canvas.style.cursor = room ? "pointer" : "grab";
    };

    const onLeave = () => setHoveredRoom(null);

    const onClick = (e: PointerEvent) => {
      const room = pickRoom(e.clientX, e.clientY);
      setSelectedRoomId(room?.id ?? null);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, [onPointerMove, rooms, roomsFromStore, setHoveredRoom, setSelectedRoomId]);

  return <div ref={containerRef} className={className} />;
}
