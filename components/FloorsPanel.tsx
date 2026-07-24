"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { PiFilePdfThin } from "react-icons/pi";
import { clearFloorSnapshots, renderFloorSnapshot } from "@/lib/floorSnapshot";
import { getModelById } from "@/lib/modelRegistry";
import { exportHeizlastPdf } from "@/lib/pdfExport";
import { heading } from "@/lib/designTokens";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";
import GlassPanel from "./GlassPanel";
import Slider from "./ui/Slider";
import type { Viewer3DHandle } from "./Viewer3D";
import type { Floor, Room } from "@/lib/types";

type Props = {
  viewerRef: RefObject<Viewer3DHandle | null>;
};

function Divider() {
  return <div className="mx-3 border-t border-zinc-300/50" />;
}

function FloorSliceSlider({
  floors,
  selectedFloor,
}: {
  floors: Floor[];
  selectedFloor: string;
}) {
  const sliceProgress = useAppStore((s) => s.sliceProgress);
  const setSliceProgress = useAppStore((s) => s.setSliceProgress);

  const { yMin, yMax, heightLabel } = useMemo(() => {
    const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
    const idx = sorted.findIndex((f) => f.id === selectedFloor);
    const floor = sorted[idx];
    const next = sorted[idx + 1];
    const yMin = floor?.elevation ?? 0;
    const yMax = next?.elevation ?? yMin + 3;
    const y = yMin + sliceProgress * Math.max(0.05, yMax - yMin);
    const toM = (v: number) => (Math.abs(v) > 100 ? v / 1000 : v);
    return {
      yMin: toM(yMin),
      yMax: toM(yMax),
      heightLabel: `${toM(y).toFixed(2)} m`,
    };
  }, [floors, selectedFloor, sliceProgress]);

  return (
    <div className="rounded-xl border border-zinc-300/50 bg-white/45 px-3 py-2.5 backdrop-blur-sm">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-zinc-600">
          Schnitthöhe
        </p>
        <p className="tabular-nums text-[11px] font-medium text-zinc-800">
          {heightLabel}
        </p>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={Math.round(sliceProgress * 100)}
        onChange={(v) => setSliceProgress(v / 100)}
        aria-label="Floor slice height"
      />
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>Boden {yMin.toFixed(1)} m</span>
        <span>Mitte</span>
        <span>Decke {yMax.toFixed(1)} m</span>
      </div>
    </div>
  );
}

/** Left panel: building summary, floors, rooms, slice, saved views. */
export default function FloorsPanel({ viewerRef }: Props) {
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const isPresentationView = useAppStore((s) => s.isPresentationView);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const activeModelLabel = useAppStore((s) => s.activeModelLabel);
  const savedViews = useAppStore((s) => s.savedViews);
  const selectedElement = useAppStore((s) => s.selectedElement);

  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const goToSavedView = useAppStore((s) => s.goToSavedView);
  const removeSavedView = useAppStore((s) => s.removeSavedView);

  const { shellGroup, rooms: sceneRooms } = useModelScene();
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfSelected, setPdfSelected] = useState<string[]>([]);

  const sortedFloors = useMemo(
    () => [...floors].sort((a, b) => a.elevation - b.elevation),
    [floors],
  );

  const floorsWithRooms = useMemo(
    () =>
      sortedFloors.filter((f) => rooms.some((r) => r.floorId === f.id)),
    [sortedFloors, rooms],
  );

  useEffect(() => {
    if (
      selectedFloor &&
      !floorsWithRooms.some((f) => f.id === selectedFloor)
    ) {
      setSelectedFloor(null);
    }
  }, [selectedFloor, floorsWithRooms, setSelectedFloor]);

  const floorRooms = useMemo(() => {
    if (!selectedFloor) return [];
    return rooms
      .filter((r) => r.floorId === selectedFloor)
      .sort(
        (a, b) =>
          a.number.localeCompare(b.number) || a.name.localeCompare(b.name),
      );
  }, [rooms, selectedFloor]);

  const selectedFloorObj = sortedFloors.find((f) => f.id === selectedFloor);

  const modelLabel =
    activeModelLabel ??
    (activeModelId
      ? (getModelById(activeModelId)?.label ?? activeModelId)
      : "No model");

  useEffect(() => {
    if (activeModelId) clearFloorSnapshots(activeModelId);
    setSnapshotUrl(null);
  }, [activeModelId, shellGroup]);

  useEffect(() => {
    if (!selectedFloorObj || !activeModelId) {
      setSnapshotUrl(null);
      return;
    }
    const roomSource = rooms.length ? rooms : sceneRooms;
    try {
      setSnapshotUrl(
        renderFloorSnapshot(
          shellGroup,
          selectedFloorObj,
          sortedFloors,
          activeModelId,
          roomSource,
        ),
      );
    } catch {
      setSnapshotUrl(null);
    }
  }, [
    shellGroup,
    selectedFloorObj,
    sortedFloors,
    activeModelId,
    rooms,
    sceneRooms,
  ]);

  /** Select only — no flyTo. Popup is rendered by ViewerApp via RoomTooltip. */
  const selectRoomFromList = (room: Room) => {
    setSelectedRoomId(room.id);
    void import("@/lib/ifcClient").then(({ getElementDetails }) =>
      getElementDetails(room.expressId, room.floorId, room.id).then((el) => {
        if (el) setSelectedElement(el);
      }),
    );
  };

  const handleGoView = (id: string) => {
    const view = goToSavedView(id);
    if (!view || !viewerRef.current) return;
    if (view.floorId !== undefined) setSelectedFloor(view.floorId);
    void viewerRef.current.flyToPose(view.position, view.target, 850);
  };

  const CURRENT_VIEW_ID = "__current__";

  const openPdfPopup = () => {
    // Default: current view + all saved views selected
    setPdfSelected([
      CURRENT_VIEW_ID,
      ...savedViews.map((v) => v.id),
    ]);
    setPdfOpen(true);
  };

  useEffect(() => {
    if (!pdfOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pdfExporting) setPdfOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfOpen, pdfExporting]);

  const togglePdfSelect = (id: string) => {
    setPdfSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const exportPdf = async () => {
    if (pdfExporting || pdfSelected.length === 0 || !viewerRef.current) return;
    setPdfExporting(true);
    try {
      const viewer = viewerRef.current;
      const st = useAppStore.getState();
      const list =
        st.selectedFloor == null
          ? st.rooms
          : st.rooms.filter((r) => r.floorId === st.selectedFloor);

      const restorePose = viewer.getCameraPose();
      const restoreFloor = st.selectedFloor;

      const views: { title: string; viewportDataUrl: string | null }[] = [];

      // Capture current first if selected (before flying away)
      if (pdfSelected.includes(CURRENT_VIEW_ID)) {
        views.push({
          title: "Current view",
          viewportDataUrl: viewer.captureViewport?.() ?? null,
        });
      }

      for (const id of pdfSelected) {
        if (id === CURRENT_VIEW_ID) continue;
        const view = goToSavedView(id);
        if (!view) continue;
        if (view.floorId !== undefined) setSelectedFloor(view.floorId);
        await viewer.flyToPose(view.position, view.target, 700);
        // Let a frame paint after the camera settles
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        views.push({
          title: view.name,
          viewportDataUrl: viewer.captureViewport?.() ?? null,
        });
      }

      // Restore camera so the UI doesn't jump away from where the user was
      if (restoreFloor !== useAppStore.getState().selectedFloor) {
        setSelectedFloor(restoreFloor);
      }
      await viewer.flyToPose(restorePose.position, restorePose.target, 500);

      exportHeizlastPdf({
        views,
        modelName: st.activeModelLabel ?? st.activeModelId ?? "model",
        rooms: list,
        colorMode: st.colorMode,
        palette: st.activeColorPalette,
        heizlastRange: st.heizlastRange,
        temperatureRange: st.temperatureRange,
      });
      setPdfOpen(false);
    } finally {
      setPdfExporting(false);
    }
  };

  const yellowGlossBtn =
    "inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-gradient-to-br from-amber-200/95 via-yellow-300/85 to-amber-400/75 px-2.5 py-1 text-[11px] font-semibold text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_3px_10px_rgba(251,191,36,0.3)] backdrop-blur-md transition active:scale-95 disabled:opacity-40";

  return (
    <div className="thin-scroll flex min-h-0 flex-1 flex-col overflow-y-auto text-zinc-800">
      {selectedElement && (
        <>
          <section className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={heading.muted}>Selection</p>
                <p className="truncate text-sm font-semibold">
                  {selectedElement.name}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {selectedElement.typeName}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
                onClick={() => {
                  setSelectedElement(null);
                  setSelectedRoomId(null);
                }}
              >
                Clear
              </button>
            </div>
          </section>
          <Divider />
        </>
      )}

      <section className="space-y-2 px-4 py-3">
        <p className={heading.muted}>Model</p>
        <p className="truncate text-sm font-semibold tracking-wide">
          {modelLabel}
        </p>
        <div className="flex gap-4 text-xs">
          <span>
            <span className="font-semibold tabular-nums">{floors.length}</span>{" "}
            floors
          </span>
          <span>
            <span className="font-semibold tabular-nums">{rooms.length}</span>{" "}
            rooms
          </span>
        </div>
      </section>

      <Divider />

      <section className="space-y-2.5 px-4 py-3">
        <p className={heading.panel}>Floors & rooms</p>
        <select
          value={selectedFloor ?? ""}
          disabled={floorsWithRooms.length === 0}
          onChange={(e) =>
            setSelectedFloor(e.target.value === "" ? null : e.target.value)
          }
          className="w-full rounded-xl border border-zinc-300/60 bg-white/50 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        >
          <option value="">All floors — pick one for plan</option>
          {floorsWithRooms.map((f) => {
            const count = rooms.filter((r) => r.floorId === f.id).length;
            return (
              <option key={f.id} value={f.id}>
                {f.name} ({count})
              </option>
            );
          })}
        </select>

        {selectedFloor ? (
          <>
            {!isPresentationView && (
              <FloorSliceSlider
                floors={sortedFloors}
                selectedFloor={selectedFloor}
              />
            )}

            <div className="overflow-hidden rounded-xl border border-zinc-300/50 bg-[#f2f4f7]">
              {snapshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={snapshotUrl}
                  alt={`Floor plan ${selectedFloorObj?.name ?? ""}`}
                  className="aspect-square w-full object-contain"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-zinc-400">
                  No floor plan for this level
                </div>
              )}
            </div>

            <p className={heading.muted}>Rooms ({floorRooms.length})</p>
            {floorRooms.length === 0 ? (
              <p className="text-xs text-zinc-400">No rooms on this floor.</p>
            ) : (
              <ul className="thin-scroll max-h-48 space-y-0.5 overflow-y-auto pr-0.5">
                {floorRooms.map((room) => {
                  const active = room.id === selectedRoomId;
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => selectRoomFromList(room)}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          active
                            ? "bg-zinc-900/10 font-semibold text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-900/5"
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {room.number ? `${room.number} · ` : ""}
                          {room.name}
                        </span>
                        <span className="tabular-nums text-zinc-400">
                          {room.heatLoad.toFixed(0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <p className="text-xs text-zinc-400">
            Select a floor to see its plan and rooms
          </p>
        )}
      </section>

      <Divider />

      <section className="space-y-2 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className={heading.panel}>Saved views</p>
          <button
            type="button"
            disabled={rooms.length === 0}
            onClick={openPdfPopup}
            title="Export PDF report"
            aria-label="Save PDF report"
            aria-expanded={pdfOpen}
            className={yellowGlossBtn}
          >
            <PiFilePdfThin className="h-4 w-4" />
            PDF
          </button>
        </div>
        {savedViews.length === 0 ? (
          <p className="text-xs text-zinc-400">
            Use the street-view button in the bottom toolbar to save a camera
            pose.
          </p>
        ) : (
          <ul className="space-y-1">
            {savedViews.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-1 rounded-lg bg-white/40 px-2 py-1"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-700 hover:text-zinc-900"
                  onClick={() => handleGoView(v.id)}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  className="shrink-0 px-1 text-[10px] text-zinc-400 hover:text-red-600"
                  onClick={() => removeSavedView(v.id)}
                  aria-label={`Delete ${v.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pdfOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Close PDF dialog"
              className="absolute inset-0 bg-zinc-900/35 backdrop-blur-[2px]"
              disabled={pdfExporting}
              onClick={() => {
                if (!pdfExporting) setPdfOpen(false);
              }}
            />
            <div
              className="relative z-[121] w-full max-w-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Download PDF"
            >
              <div
                className="rounded-[1.35rem] border border-amber-200/60 bg-gradient-to-br from-amber-100/55 via-white/35 to-yellow-200/40 p-[1px] shadow-[0_12px_40px_rgba(251,191,36,0.28),0_4px_16px_rgba(0,0,0,0.08)]"
              >
                <GlassPanel
                  variant="control"
                  zIndex={121}
                  wrapperClassName="overflow-hidden rounded-[1.25rem]"
                >
                  <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-b from-white/55 via-white/25 to-amber-50/30 p-4 backdrop-blur-xl">
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/70 to-transparent"
                      aria-hidden
                    />
                    <div className="relative">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        Download PDF
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        Select views to include in the report
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pdfExporting}
                      onClick={() => setPdfOpen(false)}
                      className="rounded-lg px-2 py-1 text-sm text-zinc-400 hover:bg-white/50 hover:text-zinc-700"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <ul className="thin-scroll mb-3 max-h-[min(280px,45vh)] space-y-0.5 overflow-y-auto rounded-xl border border-white/50 bg-white/45 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-md">
                    <li>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white/70">
                        <input
                          type="checkbox"
                          checked={pdfSelected.includes(CURRENT_VIEW_ID)}
                          onChange={() => togglePdfSelect(CURRENT_VIEW_ID)}
                          className="accent-amber-500"
                        />
                        <span className="font-medium text-zinc-800">
                          Current view
                        </span>
                      </label>
                    </li>
                    {savedViews.length === 0 ? (
                      <li className="px-2.5 py-2 text-xs text-zinc-400">
                        No saved views yet
                      </li>
                    ) : (
                      savedViews.map((v) => (
                        <li key={v.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white/70">
                            <input
                              type="checkbox"
                              checked={pdfSelected.includes(v.id)}
                              onChange={() => togglePdfSelect(v.id)}
                              className="accent-amber-500"
                            />
                            <span className="min-w-0 truncate text-zinc-700">
                              {v.name}
                            </span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>

                  <div className="mb-3 flex gap-2 px-0.5">
                    <button
                      type="button"
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
                      onClick={() =>
                        setPdfSelected([
                          CURRENT_VIEW_ID,
                          ...savedViews.map((v) => v.id),
                        ])
                      }
                    >
                      Select all
                    </button>
                    <span className="text-zinc-300">·</span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800"
                      onClick={() => setPdfSelected([])}
                    >
                      Clear
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pdfExporting || pdfSelected.length === 0}
                      onClick={() => void exportPdf()}
                      className={`${yellowGlossBtn} h-10 flex-1 justify-center rounded-xl px-3 text-sm disabled:opacity-40`}
                    >
                      {pdfExporting ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-800/30 border-t-amber-900" />
                          Exporting…
                        </>
                      ) : (
                        <>
                          <PiFilePdfThin className="h-5 w-5" />
                          Download
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={pdfExporting}
                      onClick={() => setPdfOpen(false)}
                      className="h-10 rounded-xl border border-white/50 bg-white/40 px-3 text-sm font-medium text-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-md hover:bg-white/60"
                    >
                      Cancel
                    </button>
                  </div>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>
          </div>,
          (document.fullscreenElement as HTMLElement | null) ?? document.body,
        )}
    </div>
  );
}
