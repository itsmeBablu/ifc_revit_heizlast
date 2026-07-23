"use client";

import { useEffect, useMemo, useState } from "react";
import { clearFloorSnapshots, renderFloorSnapshot } from "@/lib/floorSnapshot";
import { useAppStore } from "@/store/useAppStore";
import { useModelScene } from "./ModelSceneContext";
import {
  GlassInset,
  GlassSelect,
  PanelTitle,
  heading,
} from "./ui";

type Props = {
  embedded?: boolean;
};

export default function FloorRoomsPanel({ embedded = false }: Props) {
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const { shellGroup } = useModelScene();

  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const sortedFloors = useMemo(
    () => [...floors].sort((a, b) => a.elevation - b.elevation),
    [floors],
  );

  const floorRooms = useMemo(() => {
    if (!selectedFloor) return [];
    return rooms
      .filter((r) => r.floorId === selectedFloor)
      .sort((a, b) => a.number.localeCompare(b.number) || a.name.localeCompare(b.name));
  }, [rooms, selectedFloor]);

  const selectedFloorObj = sortedFloors.find((f) => f.id === selectedFloor);

  useEffect(() => {
    if (activeModelId) clearFloorSnapshots(activeModelId);
    setSnapshotUrl(null);
  }, [activeModelId, shellGroup]);

  useEffect(() => {
    if (!selectedFloorObj || !activeModelId) {
      setSnapshotUrl(null);
      return;
    }
    try {
      const url = renderFloorSnapshot(
        shellGroup,
        selectedFloorObj,
        sortedFloors,
        activeModelId,
        rooms,
      );
      setSnapshotUrl(url);
    } catch {
      setSnapshotUrl(null);
    }
  }, [shellGroup, selectedFloorObj, sortedFloors, activeModelId, rooms]);

  const body = (
    <div className="space-y-3">
      <div>
        <label className={`mb-1.5 block ${heading.muted}`}>Floor</label>
        <GlassSelect
          value={selectedFloor ?? ""}
          onChange={(e) =>
            setSelectedFloor(e.target.value === "" ? null : e.target.value)
          }
          disabled={floors.length === 0}
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
        </GlassSelect>
      </div>

      {selectedFloor ? (
        <>
          <GlassInset className="overflow-hidden p-1.5">
            {snapshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={snapshotUrl}
                alt={`Floor plan ${selectedFloorObj?.name ?? ""}`}
                className="aspect-square w-full rounded-2xl object-contain bg-[#f2f4f7]"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl bg-white/30 text-xs text-zinc-400">
                No floor plan for this level
              </div>
            )}
          </GlassInset>

          <div>
            <p className={`mb-1.5 ${heading.muted}`}>
              Rooms ({floorRooms.length})
            </p>
            {floorRooms.length === 0 ? (
              <p className="text-xs text-zinc-400">No rooms on this floor.</p>
            ) : (
              <ul className="max-h-44 space-y-1 overflow-y-auto pr-0.5">
                {floorRooms.map((room) => {
                  const active = room.id === selectedRoomId;
                  return (
                    <li key={room.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-xs transition-all duration-300 ease-out ${
                          active
                            ? "bg-gradient-to-b from-white/90 to-white/60 font-semibold text-zinc-900 shadow-sm shadow-black/5 border border-white/50"
                            : "border border-transparent text-zinc-600 hover:bg-white/40"
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {room.number ? `${room.number} · ` : ""}
                          {room.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">
                          {room.heatLoad.toFixed(0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <GlassInset className="px-3 py-6 text-center text-xs text-zinc-400">
          Select a floor to see its plan and rooms
        </GlassInset>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="p-4">
      <PanelTitle>Floors & rooms</PanelTitle>
      {body}
    </section>
  );
}
