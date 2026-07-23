"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { clearFloorSnapshots, renderFloorSnapshot } from "@/lib/floorSnapshot";
import { getModelById } from "@/lib/modelRegistry";
import { heading } from "@/lib/designTokens";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";
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

  const sortedFloors = useMemo(
    () => [...floors].sort((a, b) => a.elevation - b.elevation),
    [floors],
  );

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-zinc-800">
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
          disabled={floors.length === 0}
          onChange={(e) =>
            setSelectedFloor(e.target.value === "" ? null : e.target.value)
          }
          className="w-full rounded-xl border border-zinc-300/60 bg-white/50 px-3 py-2 text-sm outline-none focus:border-zinc-400"
        >
          <option value="">All floors — pick one for plan</option>
          {sortedFloors.map((f) => {
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
            <FloorSliceSlider
              floors={sortedFloors}
              selectedFloor={selectedFloor}
            />

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
              <ul className="max-h-48 space-y-0.5 overflow-y-auto">
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
        <p className={heading.panel}>Saved views</p>
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
    </div>
  );
}
