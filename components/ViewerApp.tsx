"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import type { LoadedModel, Room } from "@/lib/types";
import {
  disposeLoadedModel,
  loadIfcModel,
  type IfcSource,
} from "@/lib/ifcClient";
import { clearFloorSnapshots } from "@/lib/floorSnapshot";
import { debugLog } from "@/lib/debugLog";
import { getModelById } from "@/lib/modelRegistry";
import {
  hydratePanelState,
  persistModelId,
  useAppStore,
} from "@/store/useAppStore";
import { heading, motion } from "@/lib/designTokens";
import { ModelSceneContext } from "./ModelSceneContext";
import Viewer3D, { type Viewer3DHandle } from "./Viewer3D";
import RoomTooltip from "./RoomTooltip";
import ModelSelector from "./ModelSelector";
import LoadIfcButton from "./LoadIfcButton";
import FloorsPanel from "./FloorsPanel";
import LegendPanel from "./LegendPanel";
import PresentationSidePanel from "./PresentationSidePanel";
import GlassPanel from "./GlassPanel";
import { GlassButton, IconAlert } from "./ui";
import ViewerToolbar from "./ViewerToolbar";
import { heizlastGradientCss, pickHeizlastRangeFromLoads } from "@/lib/colorMapping";

type LoadSource =
  | { kind: "registry"; modelId: string }
  | { kind: "file"; id: string; name: string; file: File };

export default function ViewerApp() {
  const viewerRef = useRef<Viewer3DHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<LoadedModel | null>(null);
  const loadSourceRef = useRef<LoadSource | null>(null);
  const [shellGroup, setShellGroup] = useState<Group | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [isDesktop, setIsDesktop] = useState(true);
  const [isDraggingIfc, setIsDraggingIfc] = useState(false);
  const dragDepthRef = useRef(0);

  const rooms = useAppStore((s) => s.rooms);
  const isLoadingModel = useAppStore((s) => s.isLoadingModel);
  const loadError = useAppStore((s) => s.loadError);
  const loadProgress = useAppStore((s) => s.loadProgress);
  const loadMessage = useAppStore((s) => s.loadMessage);
  const leftPanelOpen = useAppStore((s) => s.leftPanelOpen);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const isHeaderCollapsed = useAppStore((s) => s.isHeaderCollapsed);
  const setHeaderCollapsed = useAppStore((s) => s.setHeaderCollapsed);
  const activeModelLabel = useAppStore((s) => s.activeModelLabel);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const hoveredRoom = useAppStore((s) => s.hoveredRoom);
  const isPresentationView = useAppStore((s) => s.isPresentationView);
  const presentationRoomsOpen = useAppStore((s) => s.presentationRoomsOpen);

  const setActiveModelId = useAppStore((s) => s.setActiveModelId);
  const setFloors = useAppStore((s) => s.setFloors);
  const setRooms = useAppStore((s) => s.setRooms);
  const setHeizlastRange = useAppStore((s) => s.setHeizlastRange);
  const setIsLoadingModel = useAppStore((s) => s.setIsLoadingModel);
  const setLoadError = useAppStore((s) => s.setLoadError);
  const setLoadProgress = useAppStore((s) => s.setLoadProgress);
  const clearModelData = useAppStore((s) => s.clearModelData);
  const setLeftPanelOpen = useAppStore((s) => s.setLeftPanelOpen);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);

  useEffect(() => {
    debugLog("ViewerApp", "mount", "info");
    hydratePanelState();
    try {
      localStorage.removeItem("ifc-viewer:lastModelId");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Collapse header when clicking outside it; expand only via collapsed bar click
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-app-header]")) return;
      if (!useAppStore.getState().isHeaderCollapsed) {
        setHeaderCollapsed(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [setHeaderCollapsed]);

  const runLoad = useCallback(
    async (source: LoadSource) => {
      loadSourceRef.current = source;
      debugLog(
        "ViewerApp",
        `runLoad — ${source.kind}`,
        "info",
        source.kind === "registry"
          ? { modelId: source.modelId }
          : { name: source.name, size: source.file.size },
      );

      const prevId = useAppStore.getState().activeModelId;
      if (prevId) clearFloorSnapshots(prevId);

      setIsLoadingModel(true);
      setLoadError(null);
      setLoadProgress(0, "Starting…");
      clearModelData();
      setShellGroup(null);

      if (loadedRef.current) {
        disposeLoadedModel(loadedRef.current);
        loadedRef.current = null;
      }

      const label =
        source.kind === "registry"
          ? (getModelById(source.modelId)?.label ?? source.modelId)
          : source.name;
      const id = source.kind === "registry" ? source.modelId : source.id;
      setActiveModelId(id, label);

      try {
        let ifcSource: IfcSource;
        if (source.kind === "registry") {
          const entry = getModelById(source.modelId);
          if (!entry) throw new Error(`Unknown model: ${source.modelId}`);
          ifcSource = entry.ifcPath;
        } else {
          ifcSource = source.file;
        }

        const result = await loadIfcModel(ifcSource, (p) => {
          setLoadProgress(p.progress < 0 ? -1 : p.progress, p.message);
        });
        loadedRef.current = result;
        setFloors(result.floors);
        setRooms(result.rooms);
        setHeizlastRange(
          pickHeizlastRangeFromLoads(result.rooms.map((r) => r.heatLoad)),
        );
        setShellGroup(result.shellGroup);
        if (source.kind === "registry") persistModelId(id);
        debugLog(
          "ViewerApp",
          `load success — rooms=${result.rooms.length} floors=${result.floors.length}`,
          "ok",
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load IFC model";
        debugLog("ViewerApp", `load failed: ${message}`, "error", err);
        setLoadError(message);
        clearModelData();
        setShellGroup(null);
      } finally {
        setIsLoadingModel(false);
      }
    },
    [
      clearModelData,
      setActiveModelId,
      setFloors,
      setIsLoadingModel,
      setLoadError,
      setLoadProgress,
      setRooms,
      setHeizlastRange,
    ],
  );

  const handleRegistrySelect = useCallback(
    (modelId: string) => {
      debugLog("ViewerApp", `registry select: ${modelId}`, "info");
      void runLoad({ kind: "registry", modelId });
    },
    [runLoad],
  );

  const handleFile = useCallback(
    (file: File) => {
      debugLog(
        "ViewerApp",
        `file picked: ${file.name}`,
        "info",
        { size: file.size, type: file.type },
      );
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      void runLoad({ kind: "file", id, name: file.name, file });
    },
    [runLoad],
  );

  const isIfcFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    return (
      name.endsWith(".ifc") ||
      file.type === "application/x-step" ||
      file.type === "application/octet-stream"
    );
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (![...e.dataTransfer.types].includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDraggingIfc(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingIfc(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDraggingIfc(false);
      if (isLoadingModel) return;
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const file =
        [...files].find((f) => isIfcFile(f)) ??
        [...files].find((f) => f.name.toLowerCase().endsWith(".ifc"));
      if (!file) {
        debugLog("ViewerApp", "drop ignored — not an IFC file", "warn");
        return;
      }
      handleFile(file);
    },
    [handleFile, isIfcFile, isLoadingModel],
  );

  const handleRetry = useCallback(() => {
    const src = loadSourceRef.current;
    debugLog("ViewerApp", "retry", "info", src?.kind);
    if (src) void runLoad(src);
  }, [runLoad]);

  useEffect(() => {
    return () => {
      if (loadedRef.current) {
        disposeLoadedModel(loadedRef.current);
        loadedRef.current = null;
      }
    };
  }, []);

  const sceneValue = useMemo(
    () => ({ shellGroup, rooms }),
    [shellGroup, rooms],
  );

  const handlePointerMove = useCallback((x: number, y: number) => {
    setPointer({ x, y });
  }, []);

  const hasModel = rooms.length > 0 || Boolean(shellGroup);
  const showEmptyCta = !hasModel && !isLoadingModel && !loadError;
  const showError = Boolean(loadError) && !isLoadingModel;

  const progressLabel =
    loadProgress < 0
      ? loadMessage || "Working…"
      : `${loadMessage || "Loading"} (${Math.round(Math.max(0, loadProgress) * 100)}%)`;

  return (
    <ModelSceneContext.Provider value={sceneValue}>
      <div
        ref={rootRef}
        className="relative h-dvh w-dvw overflow-hidden text-zinc-900"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="fixed inset-0 z-0">
          <Viewer3D
            ref={viewerRef}
            onPointerMove={handlePointerMove}
            className="h-full w-full"
          />
        </div>

        {isDraggingIfc && !isLoadingModel && (
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/35 p-6 backdrop-blur-[2px]">
            <GlassPanel
              variant="panel"
              zIndex={100}
              wrapperClassName="w-full max-w-md"
            >
              <div className="px-6 py-8 text-center">
                <p className="text-base font-semibold tracking-wide text-zinc-900">
                  Drop IFC to load
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  Release to open the model in the viewer
                </p>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* Header: 50% default / 25% collapsed */}
        <div
          data-app-header
          className={`pointer-events-none fixed top-3 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ease-out ${
            isHeaderCollapsed ? "w-[min(25%,280px)]" : "w-[50%]"
          } min-w-[220px] max-w-[720px]`}
        >
          <div className="pointer-events-auto">
            <GlassPanel variant="panel" zIndex={40}>
              <header
                className={`flex items-center gap-2 px-3 py-1.5 transition-all duration-300 ${
                  isHeaderCollapsed
                    ? "justify-center cursor-pointer"
                    : "justify-between"
                }`}
                onClick={() => {
                  if (isHeaderCollapsed) setHeaderCollapsed(false);
                }}
                title={isHeaderCollapsed ? "Expand header" : undefined}
              >
                <div
                  className={`min-w-0 ${
                    isHeaderCollapsed ? "text-center" : "flex-1 text-left"
                  }`}
                >
                  <h1
                    className={`font-semibold tracking-wide whitespace-nowrap transition-all duration-300 ${
                      isHeaderCollapsed ? "text-xs" : "text-sm sm:text-base"
                    }`}
                    style={{
                      backgroundImage: heizlastGradientCss("to right"),
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                      backgroundSize: "100% 100%",
                    }}
                  >
                    Heizlast Präsentation
                  </h1>
                  {activeModelLabel && (
                    <p
                      className={`truncate text-[10px] font-medium text-zinc-500 ${
                        isHeaderCollapsed ? "text-center" : ""
                      }`}
                    >
                      {activeModelLabel}
                    </p>
                  )}
                </div>

                <div
                  className={`flex shrink-0 items-center gap-1.5 overflow-hidden transition-all duration-300 ease-out ${
                    isHeaderCollapsed
                      ? "max-w-0 scale-95 opacity-0 pointer-events-none w-0"
                      : "max-w-[420px] scale-100 opacity-100"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <LoadIfcButton
                    onFile={handleFile}
                    disabled={isLoadingModel}
                  />
                  <ModelSelector
                    onSelectRegistryModel={handleRegistrySelect}
                  />
                </div>
              </header>
            </GlassPanel>
          </div>
        </div>

        {isLoadingModel && (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6">
            <GlassPanel
              variant="panel"
              zIndex={30}
              wrapperClassName="pointer-events-auto w-full max-w-sm"
            >
              <div className="p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="h-7 w-7 animate-spin rounded-2xl border-2 border-zinc-300/60 border-t-zinc-700" />
                  <p className="text-sm font-semibold tracking-wide text-zinc-800">
                    Loading model
                  </p>
                </div>
                <p className="mb-3 text-xs font-medium text-zinc-500">
                  {progressLabel}
                </p>
                {loadProgress >= 0 && (
                  <div className="h-1.5 overflow-hidden rounded-2xl bg-white/30">
                    <div
                      className="h-full rounded-2xl bg-gradient-to-r from-zinc-600 to-zinc-800 transition-all duration-300 ease-out"
                      style={{
                        width: `${Math.round(loadProgress * 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        )}

        {showEmptyCta && (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6">
            <GlassPanel
              variant="panel"
              zIndex={30}
              wrapperClassName="pointer-events-auto w-full max-w-sm"
            >
              <div className="p-6 text-center">
                <p className="mb-1 text-sm font-semibold tracking-wide text-zinc-900">
                  No model loaded
                </p>
                <p className="mb-4 text-xs font-medium leading-relaxed text-zinc-500">
                  Choose an IFC file from your computer to begin.
                </p>
                <div className="flex justify-center">
                  <LoadIfcButton onFile={handleFile} />
                </div>
              </div>
            </GlassPanel>
          </div>
        )}

        {showError && (
          <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center p-6">
            <GlassPanel
              variant="panel"
              zIndex={30}
              wrapperClassName="pointer-events-auto w-full max-w-md"
            >
              <div className="p-6 text-center">
                <div className="mb-3 flex justify-center">
                  <IconAlert />
                </div>
                <p className="mb-1 text-sm font-semibold tracking-wide text-zinc-900">
                  Could not load model
                </p>
                <p className="mb-4 text-xs font-medium leading-relaxed break-words text-zinc-500">
                  {loadError}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <GlassButton variant="primary" onClick={handleRetry}>
                    Retry
                  </GlassButton>
                  <LoadIfcButton
                    onFile={handleFile}
                    variant="default"
                    label="Load other IFC"
                  />
                </div>
              </div>
            </GlassPanel>
          </div>
        )}

        <RoomTooltip x={pointer.x} y={pointer.y} />
        {selectedRoomId && !hoveredRoom && (() => {
          const room = rooms.find((r) => r.id === selectedRoomId);
          if (!room) return null;
          return (
            <RoomTooltip
              room={room}
              opaque
              anchor={{
                left: leftPanelOpen && !isPresentationView ? 380 : 24,
                top: 120,
              }}
            />
          );
        })()}
        <ViewerToolbar viewerRef={viewerRef} targetRef={rootRef} />

        {/* LEFT — Floors & Rooms (hidden during Presentation View) */}
        {isDesktop && (
          <aside
            className={`fixed top-16 bottom-4 left-4 z-[35] flex w-[min(360px,calc(100vw-2rem))] flex-col ${motion.sidebar} ${
              leftPanelOpen && !isPresentationView
                ? "pointer-events-auto translate-x-0 opacity-100"
                : "pointer-events-none -translate-x-[calc(100%+1.5rem)] opacity-0"
            }`}
            aria-hidden={!leftPanelOpen || isPresentationView}
          >
            <GlassPanel
              variant="panel"
              zIndex={35}
              fill
              wrapperClassName="relative flex h-full min-h-0 flex-col overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setLeftPanelOpen(false)}
                aria-label="Hide floors panel"
                className="absolute inset-y-0 right-0 z-10 flex w-5 items-center justify-center rounded-r-3xl bg-zinc-400/30 text-zinc-600 transition-colors duration-300 ease-out hover:bg-zinc-400/45"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </button>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth pr-5">
                <FloorsPanel viewerRef={viewerRef} />
              </div>
            </GlassPanel>
          </aside>
        )}

        {isDesktop && !leftPanelOpen && !isPresentationView && (
          <button
            type="button"
            onClick={() => setLeftPanelOpen(true)}
            aria-label="Show floors panel"
            className="fixed inset-y-[20%] left-0 z-40 flex w-5 items-center justify-center transition-all duration-350 ease-out"
          >
            <div className="flex h-full w-full items-center justify-center rounded-r-xl bg-zinc-400/35 text-zinc-600 backdrop-blur-sm hover:bg-zinc-400/50">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </div>
          </button>
        )}

        {/* RIGHT — Legend (basic) / combined Legend+Rooms (presentation) */}
        {isDesktop && (
          <aside
            className={`fixed top-36 right-4 z-[35] flex w-[min(280px,calc(100vw-2rem))] flex-col overflow-hidden ${
              isPresentationView && presentationRoomsOpen
                ? "bottom-20 pb-1"
                : ""
            } ${motion.sidebar} ${
              rightPanelOpen
                ? "pointer-events-auto translate-x-0 opacity-100"
                : "pointer-events-none translate-x-[calc(100%+1.5rem)] opacity-0"
            }`}
            aria-hidden={!rightPanelOpen}
          >
            <GlassPanel
              variant="panel"
              zIndex={35}
              fill={isPresentationView && presentationRoomsOpen}
              wrapperClassName={`relative overflow-hidden ${
                isPresentationView && presentationRoomsOpen
                  ? "mb-2 flex min-h-0 flex-1 flex-col"
                  : isPresentationView
                    ? "mb-2"
                    : ""
              }`}
            >
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                aria-label="Hide legend"
                className="absolute inset-y-0 left-0 z-10 flex w-5 items-center justify-center rounded-l-3xl bg-zinc-400/30 text-zinc-600 transition-colors duration-300 ease-out hover:bg-zinc-400/45"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              <div
                className={`pl-5 ${
                  isPresentationView && presentationRoomsOpen
                    ? "flex h-full min-h-0 flex-1 flex-col"
                    : ""
                }`}
              >
                {isPresentationView ? (
                  <PresentationSidePanel />
                ) : (
                  <LegendPanel />
                )}
              </div>
            </GlassPanel>
          </aside>
        )}

        {isDesktop && !rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            aria-label="Show legend"
            className="fixed inset-y-[20%] right-0 z-40 flex w-5 items-center justify-center transition-all duration-350 ease-out"
          >
            <div className="flex h-full w-full items-center justify-center rounded-l-xl bg-zinc-400/35 text-zinc-600 backdrop-blur-sm hover:bg-zinc-400/50">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 6-6 6 6 6" />
              </svg>
            </div>
          </button>
        )}

        {/* Mobile bottom sheet — floors + legend stacked */}
        {!isDesktop && (
          <>
            {!(leftPanelOpen || rightPanelOpen) && (
              <button
                type="button"
                onClick={() => {
                  setLeftPanelOpen(true);
                  setRightPanelOpen(true);
                }}
                aria-label="Show panels"
                className="fixed right-4 bottom-5 z-40 h-14 w-14"
              >
                <GlassPanel
                  variant="control"
                  zIndex={40}
                  fill
                  wrapperClassName="h-full w-full"
                >
                  <div className="flex h-full items-center justify-center text-zinc-700">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      aria-hidden
                    >
                      <path d="M4 7h16M4 12h16M4 17h10" />
                    </svg>
                  </div>
                </GlassPanel>
              </button>
            )}

            <div
              className={`fixed inset-0 z-50 transition-opacity duration-300 ease-out ${
                leftPanelOpen || rightPanelOpen
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <button
                type="button"
                aria-label="Close panels"
                className="absolute inset-0 bg-zinc-900/30"
                onClick={() => {
                  setLeftPanelOpen(false);
                  setRightPanelOpen(false);
                }}
              />
              <div
                className={`absolute inset-x-3 bottom-3 top-[14%] flex flex-col ${motion.sidebar} ${
                  leftPanelOpen || rightPanelOpen
                    ? "translate-y-0"
                    : "translate-y-10"
                }`}
              >
                <GlassPanel
                  variant="panel"
                  zIndex={50}
                  fill
                  wrapperClassName="flex h-full min-h-0 flex-col overflow-hidden"
                >
                  <div className="flex items-center justify-between border-b border-zinc-300/40 px-4 py-3">
                    <p className={heading.panel}>Details</p>
                    <GlassButton
                      className="!px-3"
                      onClick={() => {
                        setLeftPanelOpen(false);
                        setRightPanelOpen(false);
                      }}
                    >
                      Close
                    </GlassButton>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
                    {!isPresentationView && (
                      <>
                        <FloorsPanel viewerRef={viewerRef} />
                        <div className="mx-3 border-t border-zinc-300/50" />
                        <LegendPanel />
                      </>
                    )}
                    {isPresentationView && <PresentationSidePanel />}
                  </div>
                </GlassPanel>
              </div>
            </div>
          </>
        )}
      </div>
    </ModelSceneContext.Provider>
  );
}

export { useModelScene } from "./ModelSceneContext";
