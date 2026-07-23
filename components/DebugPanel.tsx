"use client";

import { useMemo } from "react";
import { useDebugStore, type DebugLevel } from "@/lib/debugLog";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";

const levelColor: Record<DebugLevel, string> = {
  info: "text-zinc-600",
  ok: "text-emerald-700",
  warn: "text-amber-700",
  error: "text-red-700",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

/**
 * Floating debug inspector — copy the dump and paste it back into chat.
 */
export default function DebugPanel() {
  const open = useDebugStore((s) => s.open);
  const entries = useDebugStore((s) => s.entries);
  const toggle = useDebugStore((s) => s.toggle);
  const clear = useDebugStore((s) => s.clear);
  const setOpen = useDebugStore((s) => s.setOpen);

  const activeModelId = useAppStore((s) => s.activeModelId);
  const activeModelLabel = useAppStore((s) => s.activeModelLabel);
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const isLoadingModel = useAppStore((s) => s.isLoadingModel);
  const loadError = useAppStore((s) => s.loadError);
  const loadProgress = useAppStore((s) => s.loadProgress);
  const loadMessage = useAppStore((s) => s.loadMessage);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const colorMode = useAppStore((s) => s.colorMode);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  const snapshot = useMemo(() => {
    const lines = [
      "=== Heizlast IFC Debug Dump ===",
      `time: ${new Date().toISOString()}`,
      `ua: ${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`,
      "",
      "-- App state --",
      `activeModelId: ${activeModelId ?? "null"}`,
      `activeModelLabel: ${activeModelLabel ?? "null"}`,
      `floors: ${floors.length}`,
      `rooms: ${rooms.length}`,
      `selectedFloor: ${selectedFloor ?? "null"}`,
      `colorMode: ${colorMode}`,
      `sidebarOpen: ${sidebarOpen}`,
      `isLoadingModel: ${isLoadingModel}`,
      `loadProgress: ${loadProgress}`,
      `loadMessage: ${loadMessage || "(empty)"}`,
      `loadError: ${loadError ?? "(none)"}`,
      "",
      "-- Log (newest last) --",
      ...entries.map(
        (e) =>
          `${formatTime(e.ts)} [${e.level}] [${e.scope}] ${e.message}` +
          (e.detail ? `\n  ${e.detail.replace(/\n/g, "\n  ")}` : ""),
      ),
      "=== end ===",
    ];
    return lines.join("\n");
  }, [
    activeModelId,
    activeModelLabel,
    floors.length,
    rooms.length,
    selectedFloor,
    colorMode,
    sidebarOpen,
    isLoadingModel,
    loadProgress,
    loadMessage,
    loadError,
    entries,
  ]);

  const copyDump = async () => {
    try {
      await navigator.clipboard.writeText(snapshot);
      useDebugStore.getState().log("DebugPanel", "Copied dump to clipboard", "ok");
    } catch (err) {
      useDebugStore
        .getState()
        .log("DebugPanel", "Clipboard copy failed", "error", err);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[60] rounded-2xl border border-white/40 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-white shadow-lg backdrop-blur"
      >
        Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(420px,calc(100vw-2rem))]">
      <GlassPanel variant="panel" zIndex={60} wrapperClassName="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-300/40 px-3 py-2">
          <p className="text-xs font-semibold tracking-wide text-zinc-800">
            Debug
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void copyDump()}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-white/40"
            >
              Copy dump
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-white/40"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-white/40"
            >
              Hide
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-zinc-300/40 px-3 py-2 text-[10px] text-zinc-600">
          <div>
            Model:{" "}
            <span className="font-medium text-zinc-800">
              {activeModelLabel ?? activeModelId ?? "—"}
            </span>
          </div>
          <div>
            Load:{" "}
            <span className="font-medium text-zinc-800">
              {isLoadingModel
                ? `${Math.round(Math.max(0, loadProgress) * 100)}%`
                : loadError
                  ? "error"
                  : rooms.length
                    ? "ok"
                    : "idle"}
            </span>
          </div>
          <div>
            Floors/Rooms:{" "}
            <span className="font-medium text-zinc-800">
              {floors.length}/{rooms.length}
            </span>
          </div>
          <div>
            Error:{" "}
            <span className={loadError ? "font-medium text-red-700" : ""}>
              {loadError ? "yes" : "no"}
            </span>
          </div>
        </div>

        {loadError && (
          <div className="border-b border-red-200/60 bg-red-50/50 px-3 py-2 text-[11px] text-red-800 break-words">
            {loadError}
          </div>
        )}

        <ul className="max-h-56 space-y-1 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed">
          {entries.length === 0 ? (
            <li className="text-zinc-400">No log entries yet.</li>
          ) : (
            [...entries].reverse().map((e) => (
              <li key={e.id} className="border-b border-zinc-200/40 pb-1">
                <span className="text-zinc-400">{formatTime(e.ts)}</span>{" "}
                <span className={`font-semibold ${levelColor[e.level]}`}>
                  [{e.level}]
                </span>{" "}
                <span className="text-zinc-500">[{e.scope}]</span>{" "}
                <span className="text-zinc-800">{e.message}</span>
                {e.detail && (
                  <pre className="mt-0.5 max-h-24 overflow-auto whitespace-pre-wrap text-zinc-500">
                    {e.detail}
                  </pre>
                )}
              </li>
            ))
          )}
        </ul>
      </GlassPanel>
    </div>
  );
}
