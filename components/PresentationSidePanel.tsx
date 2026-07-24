"use client";

import { useMemo } from "react";
import { heizlastToColor } from "@/lib/colorMapping";
import { heading } from "@/lib/designTokens";
import { useAppStore } from "@/store/useAppStore";
import LegendBody from "./LegendBody";

/** Light tint of a hex color for list row backgrounds. */
function lightTint(hex: string, mix = 0.78): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `${hex}33`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mixCh = (c: number) => Math.round(c + (255 - c) * mix);
  return `rgb(${mixCh(r)}, ${mixCh(g)}, ${mixCh(b)})`;
}

/**
 * Presentation right panel: Legend + optional Rooms (floor select + room list).
 */
export default function PresentationSidePanel() {
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const presentationFloorId = useAppStore((s) => s.presentationFloorId);
  const setPresentationFloorId = useAppStore((s) => s.setPresentationFloorId);
  const presentationRoomsOpen = useAppStore((s) => s.presentationRoomsOpen);
  const setPresentationRoomsOpen = useAppStore(
    (s) => s.setPresentationRoomsOpen,
  );
  const selectedRoomId = useAppStore((s) => s.selectedRoomId);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const activeColorPalette = useAppStore((s) => s.activeColorPalette);
  const heizlastRange = useAppStore((s) => s.heizlastRange);

  const floorsWithRooms = useMemo(() => {
    const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
    return sorted.filter((f) => rooms.some((r) => r.floorId === f.id));
  }, [floors, rooms]);

  const floorRooms = useMemo(() => {
    if (!presentationFloorId) return [];
    return rooms
      .filter((r) => r.floorId === presentationFloorId)
      .sort(
        (a, b) =>
          a.number.localeCompare(b.number) || a.name.localeCompare(b.name),
      );
  }, [rooms, presentationFloorId]);

  const selectRoom = (roomId: string, expressId: number, floorId: string) => {
    setSelectedRoomId(roomId);
    void import("@/lib/ifcClient").then(({ getElementDetails }) =>
      getElementDetails(expressId, floorId, roomId).then((el) => {
        if (el) setSelectedElement(el);
      }),
    );
  };

  return (
    <div
      className={`flex flex-col text-zinc-800 ${
        presentationRoomsOpen ? "h-full min-h-0 flex-1" : ""
      }`}
    >
      <div className="shrink-0">
        <LegendBody paddedTop />
      </div>

      <section
        className={`flex flex-col space-y-2.5 px-3 pb-4 ${
          presentationRoomsOpen ? "min-h-0 flex-1" : "shrink-0"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-zinc-300/50 bg-white/40 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-zinc-800">Rooms</p>
            <p className="text-[10px] text-zinc-500">
              Pick a floor and highlight rooms
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={presentationRoomsOpen}
            onClick={() => setPresentationRoomsOpen(!presentationRoomsOpen)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
              presentationRoomsOpen ? "bg-sky-600" : "bg-zinc-300/80"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                presentationRoomsOpen ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {presentationRoomsOpen && (
          <div className="flex min-h-0 flex-1 flex-col space-y-2.5">
            <p className={`${heading.muted} shrink-0`}>Floor</p>
            <select
              value={presentationFloorId ?? ""}
              disabled={floorsWithRooms.length === 0}
              onChange={(e) =>
                setPresentationFloorId(
                  e.target.value === "" ? null : e.target.value,
                )
              }
              className="w-full shrink-0 rounded-xl border border-zinc-300/60 bg-white/50 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            >
              {floorsWithRooms.length === 0 ? (
                <option value="">No floors</option>
              ) : (
                floorsWithRooms.map((f) => {
                  const count = rooms.filter((r) => r.floorId === f.id).length;
                  return (
                    <option key={f.id} value={f.id}>
                      {f.name} ({count})
                    </option>
                  );
                })
              )}
            </select>

            {presentationFloorId ? (
              <>
                <p className={`${heading.muted} shrink-0`}>
                  Rooms ({floorRooms.length})
                </p>
                {floorRooms.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No rooms on this floor.
                  </p>
                ) : (
                  <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto thin-scroll pr-0.5 pb-1">
                    {floorRooms.map((room) => {
                      const hex = heizlastToColor(
                        room.heatLoad,
                        activeColorPalette,
                        heizlastRange,
                      );
                      const active = room.id === selectedRoomId;
                      return (
                        <li key={room.id}>
                          <button
                            type="button"
                            onClick={() =>
                              selectRoom(
                                room.id,
                                room.expressId,
                                room.floorId,
                              )
                            }
                            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-all ${
                              active
                                ? "border-zinc-500/50 shadow-sm ring-1 ring-zinc-400/40"
                                : "border-transparent hover:border-zinc-300/40"
                            }`}
                            style={{ backgroundColor: lightTint(hex, 0.82) }}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold text-zinc-900">
                                {room.number ? `${room.number} · ` : ""}
                                {room.name}
                              </span>
                              <span className="mt-0.5 flex gap-2 text-[10px] text-zinc-600">
                                <span className="tabular-nums">
                                  {room.heatLoad.toFixed(0)} W/m²
                                </span>
                                <span className="tabular-nums">
                                  {room.temperature.toFixed(1)} °C
                                </span>
                              </span>
                            </span>
                            <span
                              className="h-3 w-3 shrink-0 rounded-md border border-zinc-400/30"
                              style={{ backgroundColor: hex }}
                              aria-hidden
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-400">
                Select a floor to list rooms
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
