"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  HEIZLAST_GRADIENT_STOPS,
  TEMPERATURE_STOPS,
} from "@/lib/colorMapping";
import { clearFloorSnapshots, renderFloorSnapshot } from "@/lib/floorSnapshot";
import { getModelById } from "@/lib/modelRegistry";
import { heading } from "@/lib/designTokens";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";
import type { Viewer3DHandle } from "./Viewer3D";

type Props = {
  viewerRef: RefObject<Viewer3DHandle | null>;
};

function Divider() {
  return <div className="mx-3 border-t border-zinc-300/50" />;
}

/**
 * Flat left-rail content: summary, floors/rooms, legend, saved views.
 * Single surface with hairline dividers — no nested glossy panels.
 */
export default function SidebarPanel({ viewerRef }: Props) {
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const activeModelLabel = useAppStore((s) => s.activeModelLabel);
  const colorMode = useAppStore((s) => s.colorMode);
  const savedViews = useAppStore((s) => s.savedViews);
  const selectedElement = useAppStore((s) => s.selectedElement);

  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const setColorMode = useAppStore((s) => s.setColorMode);
  const addSavedView = useAppStore((s) => s.addSavedView);
  const goToSavedView = useAppStore((s) => s.goToSavedView);
  const removeSavedView = useAppStore((s) => s.removeSavedView);

  const { shellGroup } = useModelScene();
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [viewName, setViewName] = useState("");

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

  const finiteStops = HEIZLAST_GRADIENT_STOPS;
  const gradient = finiteStops.map((s) => s.color).join(", ");

  useEffect(() => {
    if (activeModelId) clearFloorSnapshots(activeModelId);
    setSnapshotUrl(null);
  }, [activeModelId, shellGroup]);

  useEffect(() => {
    if (!shellGroup || !selectedFloorObj || !activeModelId) {
      setSnapshotUrl(null);
      return;
    }
    try {
      setSnapshotUrl(
        renderFloorSnapshot(
          shellGroup,
          selectedFloorObj,
          sortedFloors,
          activeModelId,
        ),
      );
    } catch {
      setSnapshotUrl(null);
    }
  }, [shellGroup, selectedFloorObj, sortedFloors, activeModelId]);

  const handleSaveView = () => {
    const trimmed = viewName.trim();
    if (!trimmed || !viewerRef.current) return;
    const pose = viewerRef.current.getCameraPose();
    addSavedView(trimmed, pose.position, pose.target);
    setViewName("");
    setDraftOpen(false);
  };

  const handleGoView = (id: string) => {
    const view = goToSavedView(id);
    if (!view || !viewerRef.current) return;
    if (view.floorId !== undefined) setSelectedFloor(view.floorId);
    void viewerRef.current.flyToPose(view.position, view.target, 850);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-zinc-800">
      {/* Selected element / component */}
      <section className="space-y-2 px-4 py-3">
        <p className={heading.panel}>Selection</p>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Click any room or building component in the 3D view to inspect it.
        </p>
        {selectedElement ? (
          <div className="space-y-2 rounded-xl border border-zinc-300/50 bg-white/45 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {selectedElement.name}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {selectedElement.typeName}
                  {selectedElement.kind === "room" ? " · Room" : " · Component"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedElement(null);
                  setSelectedRoomId(null);
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-900/5"
              >
                Clear
              </button>
            </div>
            <dl className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">GlobalId</dt>
                <dd className="truncate font-mono text-zinc-700">
                  {selectedElement.globalId}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Express ID</dt>
                <dd className="font-mono text-zinc-700">
                  {selectedElement.expressId}
                </dd>
              </div>
            </dl>
            {selectedElement.properties.length > 0 ? (
              <ul className="max-h-44 space-y-1 overflow-y-auto border-t border-zinc-300/40 pt-2">
                {selectedElement.properties.slice(0, 60).map((p, i) => (
                  <li
                    key={`${p.pset}-${p.name}-${i}`}
                    className="grid grid-cols-[1fr_auto] gap-2 text-[10px]"
                  >
                    <span className="truncate text-zinc-500" title={p.pset}>
                      {p.name}
                    </span>
                    <span className="max-w-[140px] truncate text-right font-medium text-zinc-800">
                      {p.value || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-400">No properties found.</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300/60 px-3 py-4 text-center text-[11px] text-zinc-400">
            No element selected
          </div>
        )}
      </section>

      <Divider />

      {/* Summary */}
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

      {/* Floors & rooms */}
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
                  No shell geometry for this floor
                </div>
              )}
            </div>
            <p className={heading.muted}>Rooms ({floorRooms.length})</p>
            {floorRooms.length === 0 ? (
              <p className="text-xs text-zinc-400">No rooms on this floor.</p>
            ) : (
              <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                {floorRooms.map((room) => {
                  const active = room.id === selectedRoomId;
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRoomId(room.id);
                          void import("@/lib/ifcClient").then(
                            ({ getElementDetails }) =>
                              getElementDetails(
                                room.expressId,
                                room.floorId,
                                room.id,
                              ).then((el) => {
                                if (el) setSelectedElement(el);
                              }),
                          );
                        }}
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

      {/* Legend */}
      <section className="space-y-2.5 px-4 py-3">
        <p className={heading.panel}>Legend</p>
        <div className="flex rounded-xl border border-zinc-300/50 bg-white/40 p-0.5">
          <button
            type="button"
            onClick={() => setColorMode("heizlast")}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              colorMode === "heizlast"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500"
            }`}
          >
            Heizlast
          </button>
          <button
            type="button"
            onClick={() => setColorMode("temperature")}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              colorMode === "temperature"
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500"
            }`}
          >
            Temperatur
          </button>
        </div>

        {colorMode === "heizlast" ? (
          <div>
            <div
              className="h-2.5 w-full rounded-full"
              style={{
                background: `linear-gradient(to right, ${gradient})`,
              }}
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              {[0, 10, 20, 30, 40, 50].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {TEMPERATURE_STOPS.map((s) => (
              <div
                key={s.value}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300/50 bg-white/40 px-2 py-1"
              >
                <span
                  className="h-2.5 w-2.5 rounded"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[11px] font-medium">{s.value}°C</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {rooms.length > 0 && (
        <>
          <Divider />
          <section className="space-y-2.5 px-4 py-3">
            <p className={heading.panel}>Saved views</p>
            {!draftOpen ? (
              <button
                type="button"
                disabled={!activeModelId}
                onClick={() => setDraftOpen(true)}
                className="w-full rounded-xl border border-dashed border-zinc-300/70 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-white/40 disabled:opacity-40"
              >
                + Save Current View
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveView();
                    if (e.key === "Escape") {
                      setDraftOpen(false);
                      setViewName("");
                    }
                  }}
                  placeholder="View name"
                  className="w-full rounded-xl border border-zinc-300/60 bg-white/50 px-3 py-2 text-sm outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveView}
                    disabled={!viewName.trim()}
                    className="flex-1 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftOpen(false);
                      setViewName("");
                    }}
                    className="rounded-xl px-3 py-1.5 text-xs text-zinc-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {savedViews.length === 0 ? (
              <p className="text-xs text-zinc-400">No saved views yet.</p>
            ) : (
              <ul className="max-h-36 space-y-0.5 overflow-y-auto">
                {savedViews.map((v) => (
                  <li
                    key={v.id}
                    className="group flex items-center rounded-lg hover:bg-zinc-900/5"
                  >
                    <button
                      type="button"
                      onClick={() => handleGoView(v.id)}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-medium"
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedView(v.id)}
                      className="px-2 py-1 text-xs text-zinc-400 opacity-0 group-hover:opacity-100"
                      aria-label={`Delete ${v.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
