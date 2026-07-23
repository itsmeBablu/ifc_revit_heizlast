"use client";

import { create } from "zustand";

export type DebugLevel = "info" | "warn" | "error" | "ok";

export type DebugEntry = {
  id: string;
  ts: number;
  scope: string;
  level: DebugLevel;
  message: string;
  detail?: string;
};

type DebugState = {
  open: boolean;
  entries: DebugEntry[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  clear: () => void;
  log: (
    scope: string,
    message: string,
    level?: DebugLevel,
    detail?: unknown,
  ) => void;
};

function serializeDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (detail instanceof Error) {
    return `${detail.name}: ${detail.message}\n${detail.stack ?? ""}`.trim();
  }
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

export const useDebugStore = create<DebugState>((set, get) => ({
  open: true,
  entries: [],
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
  clear: () => set({ entries: [] }),
  log: (scope, message, level = "info", detail) => {
    const entry: DebugEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      scope,
      level,
      message,
      detail: serializeDetail(detail),
    };
    // Keep console in sync for DevTools copy/paste
    const line = `[${scope}] ${message}`;
    if (level === "error") console.error(line, detail ?? "");
    else if (level === "warn") console.warn(line, detail ?? "");
    else console.log(line, detail ?? "");

    set((s) => ({
      entries: [...s.entries.slice(-199), entry],
    }));
  },
}));

export function debugLog(
  scope: string,
  message: string,
  level?: DebugLevel,
  detail?: unknown,
): void {
  useDebugStore.getState().log(scope, message, level, detail);
}
