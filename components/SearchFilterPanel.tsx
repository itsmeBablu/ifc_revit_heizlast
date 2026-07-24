"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  temperatureLegendStops,
  temperatureToColor,
} from "@/lib/colorMapping";
import { getElementDetails } from "@/lib/ifcClient";
import { roomPassesFilter } from "@/lib/roomFilter";
import { useAppStore } from "@/store/useAppStore";
import type { Room } from "@/lib/types";
import type { Viewer3DHandle } from "./Viewer3D";
import Slider from "./ui/Slider";
import type { RefObject } from "react";

type Mode = "search" | "filter";

type Props = {
  viewerRef: RefObject<Viewer3DHandle | null>;
  /** When false, live filter draft updates are paused. */
  open: boolean;
  /** Called after a search result is chosen (closes the toolbar popup). */
  onClose: () => void;
};

/**
 * Search / filter panel body for the bottom toolbar popup.
 * Search jumps the camera (exception to non-zooming click-select).
 * Filter fades non-matching rooms via store.activeFilter.
 */
export default function SearchFilterPanel({
  viewerRef,
  open,
  onClose,
}: Props) {
  const rooms = useAppStore((s) => s.rooms);
  const floors = useAppStore((s) => s.floors);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const activeFilter = useAppStore((s) => s.activeFilter);
  const temperatureRange = useAppStore((s) => s.temperatureRange);
  const activeColorPalette = useAppStore((s) => s.activeColorPalette);
  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);
  const setSelectedRoomId = useAppStore((s) => s.setSelectedRoomId);
  const setSelectedElement = useAppStore((s) => s.setSelectedElement);
  const setActiveFilter = useAppStore((s) => s.setActiveFilter);

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [minHeat, setMinHeat] = useState(0);
  const [maxHeat, setMaxHeat] = useState(55);
  const [temps, setTemps] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const floorName = useMemo(() => {
    const m = new Map(floors.map((f) => [f.id, f.name]));
    return (id: string) => m.get(id) ?? id;
  }, [floors]);

  const heatBounds = useMemo(() => {
    const loads = rooms.map((r) => r.heatLoad).filter((v) => Number.isFinite(v));
    if (!loads.length) return { min: 0, max: 55 };
    return {
      min: Math.floor(Math.min(...loads)),
      max: Math.ceil(Math.max(...loads, 1)),
    };
  }, [rooms]);

  useEffect(() => {
    setMinHeat(heatBounds.min);
    setMaxHeat(heatBounds.max);
  }, [heatBounds.min, heatBounds.max]);

  useEffect(() => {
    if (open && mode === "search") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Room[];
    return rooms
      .filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.number.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [rooms, query]);

  const scopedRooms = useMemo(() => {
    if (!selectedFloor) return rooms;
    return rooms.filter((r) => r.floorId === selectedFloor);
  }, [rooms, selectedFloor]);

  const matchCount = useMemo(() => {
    if (!activeFilter) {
      return { match: scopedRooms.length, total: scopedRooms.length };
    }
    let match = 0;
    for (const r of scopedRooms) {
      if (roomPassesFilter(r, activeFilter)) match += 1;
    }
    return { match, total: scopedRooms.length };
  }, [scopedRooms, activeFilter]);

  const tempChips = temperatureLegendStops(
    activeColorPalette,
    temperatureRange,
  );

  /** Search selection: switch floor if needed, select room, fly camera. */
  const handleSearchSelect = async (room: Room) => {
    // Search is an explicit "jump to room" — unlike click-select which never zooms.
    if (selectedFloor != null && room.floorId !== selectedFloor) {
      setSelectedFloor(room.floorId);
    }

    setSelectedRoomId(room.id);
    const el = await getElementDetails(room.expressId, room.floorId, room.id);
    if (el) setSelectedElement(el);

    await viewerRef.current?.flyToRoom?.(room.id);

    setQuery("");
    onClose();
  };

  const resetFilter = () => {
    setMinHeat(heatBounds.min);
    setMaxHeat(heatBounds.max);
    setTemps([]);
    setActiveFilter(null);
  };

  const toggleTemp = (v: number) => {
    setTemps((prev) =>
      prev.includes(v) ? prev.filter((t) => t !== v) : [...prev, v],
    );
  };

  // Live filter updates while Filter mode is open
  useEffect(() => {
    if (!open || mode !== "filter") return;
    const next: {
      minHeat?: number;
      maxHeat?: number;
      temperatures?: number[];
    } = {};
    if (minHeat > heatBounds.min) next.minHeat = minHeat;
    if (maxHeat < heatBounds.max) next.maxHeat = maxHeat;
    if (temps.length) next.temperatures = [...temps];
    const empty =
      next.minHeat == null &&
      next.maxHeat == null &&
      !(next.temperatures && next.temperatures.length);
    setActiveFilter(empty ? null : next);
  }, [
    open,
    mode,
    minHeat,
    maxHeat,
    temps,
    heatBounds.min,
    heatBounds.max,
    setActiveFilter,
  ]);

  return (
    <div className="space-y-2.5 p-1">
      <div className="flex rounded-xl border border-zinc-300/50 bg-white/40 p-0.5">
        <button
          type="button"
          onClick={() => setMode("search")}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "search"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500"
          }`}
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => setMode("filter")}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
            mode === "filter"
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500"
          }`}
        >
          Filter
        </button>
      </div>

      {mode === "search" ? (
        <div className="relative space-y-1.5">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search room name or number…"
            className="w-full rounded-xl border border-zinc-300/60 bg-white/60 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
          {query.trim() && (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-zinc-300/40 bg-white/70 p-1.5">
              {searchResults.length === 0 ? (
                <li className="px-2 py-2 text-xs text-zinc-400">
                  No rooms match
                </li>
              ) : (
                searchResults.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => void handleSearchSelect(room)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-zinc-900/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-zinc-900">
                          {room.number ? `${room.number} · ` : ""}
                          {room.name}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {floorName(room.floorId)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[10px] text-zinc-400">
                        {room.heatLoad.toFixed(0)} W/m²
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-zinc-600">
              <span>Heizlast (W/m²)</span>
              <span className="tabular-nums text-zinc-500">
                {minHeat} – {maxHeat}
              </span>
            </div>
            <label className="mb-1.5 block">
              <span className="mb-0.5 block text-[10px] text-zinc-400">Min</span>
              <Slider
                min={heatBounds.min}
                max={heatBounds.max}
                step={1}
                value={minHeat}
                onChange={(v) => setMinHeat(Math.min(v, maxHeat))}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] text-zinc-400">Max</span>
              <Slider
                min={heatBounds.min}
                max={heatBounds.max}
                step={1}
                value={maxHeat}
                onChange={(v) => setMaxHeat(Math.max(v, minHeat))}
              />
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium text-zinc-600">
              Temperature
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tempChips.map((s) => {
                const on = temps.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleTemp(s.value)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors ${
                      on
                        ? "border-zinc-500/50 bg-white shadow-sm text-zinc-900"
                        : "border-transparent bg-white/40 text-zinc-600 hover:bg-white/60"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{
                        backgroundColor: temperatureToColor(
                          s.value,
                          activeColorPalette,
                          temperatureRange,
                        ),
                      }}
                    />
                    {s.value}°
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-zinc-500">
              <span className="font-semibold tabular-nums text-zinc-800">
                {matchCount.match}
              </span>{" "}
              of <span className="tabular-nums">{matchCount.total}</span> rooms
              match
            </p>
            <button
              type="button"
              onClick={resetFilter}
              className="rounded-xl bg-zinc-800/90 px-2.5 py-1.5 text-[11px] font-medium text-white"
            >
              Reset Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
