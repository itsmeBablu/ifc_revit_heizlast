"use client";

import { create } from "zustand";
import type { ColorPaletteId } from "@/lib/colorMapping";
import type {
  ColorMode,
  Floor,
  RenderMode,
  Room,
  SavedView,
  SelectedElement,
} from "@/lib/types";

const LAST_MODEL_KEY = "ifc-viewer:lastModelId";
const LEFT_PANEL_KEY = "ifc-viewer:leftPanelOpen";
const RIGHT_PANEL_KEY = "ifc-viewer:rightPanelOpen";
const PALETTE_KEY = "ifc-viewer:colorPalette";
const savedViewsKey = (modelId: string) => `ifc-viewer:savedViews:${modelId}`;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function loadSavedViews(modelId: string): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(savedViewsKey(modelId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedViews(modelId: string, views: SavedView[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(savedViewsKey(modelId), JSON.stringify(views));
  } catch {
    // ignore quota / private mode
  }
}

export function getPersistedModelId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_MODEL_KEY);
  } catch {
    return null;
  }
}

export function persistModelId(modelId: string): void {
  if (typeof window === "undefined") return;
  if (modelId.startsWith("local-")) return;
  try {
    localStorage.setItem(LAST_MODEL_KEY, modelId);
  } catch {
    // ignore
  }
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

/** @deprecated use left/right panel keys */
export function getPersistedSidebarOpen(): boolean {
  return readBool(RIGHT_PANEL_KEY, false) || readBool(LEFT_PANEL_KEY, false);
}

type AppState = {
  activeModelId: string | null;
  activeModelLabel: string | null;
  floors: Floor[];
  rooms: Room[];
  selectedFloor: string | null;
  selectedRoomId: string | null;
  hoveredRoom: Room | null;
  selectedElement: SelectedElement | null;
  colorMode: ColorMode;
  activeColorPalette: ColorPaletteId;
  renderMode: RenderMode;
  lighting: {
    transparency: number;
    color: number;
    shadow: number;
    indirectLight: number;
  };
  /** 0 = floor bottom, 0.5 = mid (default), 1 = floor top. */
  sliceProgress: number;
  isLoadingModel: boolean;
  loadError: string | null;
  loadProgress: number;
  loadMessage: string;
  savedViews: SavedView[];
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  /** @deprecated alias of rightPanelOpen for older callers */
  sidebarOpen: boolean;
  headerExpanded: boolean;
  isHeaderCollapsed: boolean;

  setActiveModelId: (id: string | null, label?: string | null) => void;
  setFloors: (floors: Floor[]) => void;
  setRooms: (rooms: Room[]) => void;
  setSelectedFloor: (floorId: string | null) => void;
  setSelectedRoomId: (roomId: string | null) => void;
  setHoveredRoom: (room: Room | null) => void;
  setSelectedElement: (el: SelectedElement | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setActiveColorPalette: (id: ColorPaletteId) => void;
  setRenderMode: (mode: RenderMode) => void;
  setLighting: (
    partial: Partial<{
      transparency: number;
      color: number;
      shadow: number;
      indirectLight: number;
    }>,
  ) => void;
  setSliceProgress: (t: number) => void;
  setIsLoadingModel: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setLoadProgress: (progress: number, message?: string) => void;
  setLeftPanelOpen: (open: boolean) => void;
  setRightPanelOpen: (open: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHeaderExpanded: (expanded: boolean) => void;
  setHeaderCollapsed: (collapsed: boolean) => void;
  toggleHeaderCollapsed: () => void;
  addSavedView: (
    name: string,
    position: [number, number, number],
    target: [number, number, number],
  ) => void;
  goToSavedView: (id: string) => SavedView | undefined;
  removeSavedView: (id: string) => void;
  clearModelData: () => void;
};

function persistPanel(key: string, open: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // ignore
  }
}

function initialPalette(): ColorPaletteId {
  if (typeof window === "undefined") return "standard";
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    if (raw === "softPastel" || raw === "warmPastel" || raw === "standard") {
      return raw;
    }
  } catch {
    // ignore
  }
  return "standard";
}

export const useAppStore = create<AppState>((set, get) => ({
  activeModelId: null,
  activeModelLabel: null,
  floors: [],
  rooms: [],
  selectedFloor: null,
  selectedRoomId: null,
  hoveredRoom: null,
  selectedElement: null,
  colorMode: "heizlast",
  activeColorPalette: initialPalette(),
  renderMode: "fullColor",
  lighting: {
    transparency: 0.7,
    color: 1,
    shadow: 0.55,
    indirectLight: 0.45,
  },
  sliceProgress: 0.5,
  isLoadingModel: false,
  loadError: null,
  loadProgress: 0,
  loadMessage: "",
  savedViews: [],
  leftPanelOpen: false,
  rightPanelOpen: false,
  sidebarOpen: false,
  headerExpanded: true,
  isHeaderCollapsed: false,

  setActiveModelId: (id, label) => {
    set({
      activeModelId: id,
      activeModelLabel: label ?? null,
      selectedFloor: null,
      selectedRoomId: null,
      hoveredRoom: null,
      selectedElement: null,
      savedViews: id ? loadSavedViews(id) : [],
      loadError: null,
    });
  },

  setFloors: (floors) => set({ floors }),
  setRooms: (rooms) => set({ rooms }),
  setSelectedFloor: (floorId) =>
    set({
      selectedFloor: floorId,
      // Mid-height cross-section by default when a floor is chosen
      sliceProgress: floorId ? 0.5 : 0.5,
      selectedRoomId: null,
    }),
  setSelectedRoomId: (roomId) => set({ selectedRoomId: roomId }),
  setHoveredRoom: (room) => set({ hoveredRoom: room }),
  setSelectedElement: (el) => set({ selectedElement: el }),
  setColorMode: (mode) => set({ colorMode: mode }),
  setActiveColorPalette: (id) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(PALETTE_KEY, id);
      } catch {
        // ignore
      }
    }
    set({ activeColorPalette: id });
  },
  setRenderMode: (mode) => set({ renderMode: mode }),
  setLighting: (partial) =>
    set((s) => ({
      lighting: {
        transparency: clamp01(partial.transparency ?? s.lighting.transparency),
        color: clamp01(partial.color ?? s.lighting.color),
        shadow: clamp01(partial.shadow ?? s.lighting.shadow),
        indirectLight: clamp01(
          partial.indirectLight ?? s.lighting.indirectLight,
        ),
      },
    })),
  setSliceProgress: (t) => set({ sliceProgress: clamp01(t) }),
  setIsLoadingModel: (loading) => set({ isLoadingModel: loading }),
  setLoadError: (error) => set({ loadError: error }),
  setLoadProgress: (progress, message) =>
    set({
      loadProgress: progress,
      ...(message != null ? { loadMessage: message } : {}),
    }),

  setLeftPanelOpen: (open) => {
    persistPanel(LEFT_PANEL_KEY, open);
    set({ leftPanelOpen: open });
  },
  setRightPanelOpen: (open) => {
    persistPanel(RIGHT_PANEL_KEY, open);
    set({ rightPanelOpen: open, sidebarOpen: open });
  },
  toggleLeftPanel: () => get().setLeftPanelOpen(!get().leftPanelOpen),
  toggleRightPanel: () => get().setRightPanelOpen(!get().rightPanelOpen),

  setSidebarOpen: (open) => get().setRightPanelOpen(open),
  toggleSidebar: () => get().toggleRightPanel(),

  setHeaderExpanded: (expanded) => set({ headerExpanded: expanded }),
  setHeaderCollapsed: (collapsed) => set({ isHeaderCollapsed: collapsed }),
  toggleHeaderCollapsed: () =>
    set({ isHeaderCollapsed: !get().isHeaderCollapsed }),

  addSavedView: (name, position, target) => {
    const { activeModelId, selectedFloor, savedViews } = get();
    if (!activeModelId) return;
    const view: SavedView = {
      id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      position,
      target,
      floorId: selectedFloor,
    };
    const next = [...savedViews, view];
    persistSavedViews(activeModelId, next);
    set({ savedViews: next });
  },

  goToSavedView: (id) => get().savedViews.find((v) => v.id === id),

  removeSavedView: (id) => {
    const { activeModelId, savedViews } = get();
    const next = savedViews.filter((v) => v.id !== id);
    if (activeModelId) persistSavedViews(activeModelId, next);
    set({ savedViews: next });
  },

  clearModelData: () =>
    set({
      floors: [],
      rooms: [],
      selectedFloor: null,
      selectedRoomId: null,
      hoveredRoom: null,
      selectedElement: null,
      sliceProgress: 0.5,
    }),
}));

/** Hydrate panel open state after mount (avoids SSR mismatch). */
export function hydratePanelState(): void {
  useAppStore.getState().setLeftPanelOpen(readBool(LEFT_PANEL_KEY, false));
  useAppStore.getState().setRightPanelOpen(readBool(RIGHT_PANEL_KEY, false));
}
