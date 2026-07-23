"use client";

import { create } from "zustand";
import type {
  ColorMode,
  Floor,
  RenderMode,
  Room,
  SavedView,
  SelectedElement,
} from "@/lib/types";

const LAST_MODEL_KEY = "ifc-viewer:lastModelId";
const SIDEBAR_KEY = "ifc-viewer:sidebarOpen";
const savedViewsKey = (modelId: string) => `ifc-viewer:savedViews:${modelId}`;

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

export function getPersistedSidebarOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY);
    if (raw == null) return false;
    return raw === "1";
  } catch {
    return false;
  }
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
  renderMode: RenderMode;
  isLoadingModel: boolean;
  loadError: string | null;
  loadProgress: number;
  loadMessage: string;
  savedViews: SavedView[];
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
  setRenderMode: (mode: RenderMode) => void;
  setIsLoadingModel: (loading: boolean) => void;
  setLoadError: (error: string | null) => void;
  setLoadProgress: (progress: number, message?: string) => void;
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
  renderMode: "fullColor",
  isLoadingModel: false,
  loadError: null,
  loadProgress: 0,
  loadMessage: "",
  savedViews: [],
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
  setSelectedFloor: (floorId) => set({ selectedFloor: floorId }),
  setSelectedRoomId: (roomId) => set({ selectedRoomId: roomId }),
  setHoveredRoom: (room) => set({ hoveredRoom: room }),
  setSelectedElement: (el) => set({ selectedElement: el }),
  setColorMode: (mode) => set({ colorMode: mode }),
  setRenderMode: (mode) => set({ renderMode: mode }),
  setIsLoadingModel: (loading) => set({ isLoadingModel: loading }),
  setLoadError: (error) => set({ loadError: error }),
  setLoadProgress: (progress, message) =>
    set({
      loadProgress: progress,
      ...(message != null ? { loadMessage: message } : {}),
    }),

  setSidebarOpen: (open) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
      } catch {
        // ignore
      }
    }
    set({ sidebarOpen: open });
  },

  toggleSidebar: () => {
    const next = !get().sidebarOpen;
    get().setSidebarOpen(next);
  },

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
    }),
}));
