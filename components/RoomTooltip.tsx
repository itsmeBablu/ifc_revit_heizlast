"use client";

import type { CSSProperties } from "react";
import { heizlastToColor, temperatureToColor } from "@/lib/colorMapping";
import type { Room } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";

type Props = {
  /** Cursor-follow position (3D hover). Ignored when `anchor` is set. */
  x?: number;
  y?: number;
  /** Explicit room — used for list selection popup. */
  room?: Room | null;
  /** Less transparency / more solid panel. */
  opaque?: boolean;
  /** Fixed screen position for list-selection popup. */
  anchor?: { left: number; top: number } | null;
};

function RoomInfoBody({ room, palette }: { room: Room; palette: string }) {
  const heatColor = heizlastToColor(room.heatLoad, palette);
  const tempColor = temperatureToColor(room.temperature, palette);
  const absHeizlast = room.heizlast;

  return (
    <div className="p-3">
      <p className="truncate text-sm font-semibold tracking-wide text-zinc-900">
        {room.name}
      </p>
      {room.number ? (
        <p className="text-xs font-medium text-zinc-500">Nr. {room.number}</p>
      ) : null}

      <p className="mt-2 mb-1.5 text-[11px] font-semibold tracking-wide text-zinc-800 uppercase">
        Heizlast
      </p>

      <div className="space-y-1.5">
        {absHeizlast != null && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-zinc-500">Heizlast</span>
            <span className="font-medium text-zinc-800 tabular-nums">
              {absHeizlast.toFixed(0)} W
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-zinc-500">W/m²</span>
          <span className="flex items-center gap-1.5 font-medium text-zinc-800">
            <span
              className="inline-block h-2.5 w-2.5 rounded-xl"
              style={{ backgroundColor: heatColor }}
            />
            <span className="tabular-nums">{room.heatLoad.toFixed(1)} W/m²</span>
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-zinc-500">Temperatur</span>
          <span className="flex items-center gap-1.5 font-medium text-zinc-800">
            <span
              className="inline-block h-2.5 w-2.5 rounded-xl"
              style={{ backgroundColor: tempColor }}
            />
            <span className="tabular-nums">
              {room.temperature.toFixed(1)} °C
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RoomTooltip({
  x = 0,
  y = 0,
  room: roomProp = null,
  opaque = false,
  anchor = null,
}: Props) {
  const hoveredRoom = useAppStore((s) => s.hoveredRoom);
  const palette = useAppStore((s) => s.activeColorPalette);

  const room = roomProp ?? hoveredRoom;
  if (!room) return null;

  // Prefer hover cursor follow; selection uses anchor or falls back beside left panel
  let left: number;
  let top: number;
  if (anchor) {
    left = anchor.left;
    top = anchor.top;
  } else if (roomProp && !hoveredRoom) {
    left = typeof window !== "undefined" ? Math.min(360, window.innerWidth - 240) : 360;
    top = typeof window !== "undefined" ? Math.min(160, window.innerHeight - 200) : 160;
  } else {
    const offset = 16;
    left = Math.min(
      x + offset,
      typeof window !== "undefined" ? window.innerWidth - 260 : x,
    );
    top = Math.min(
      y + offset,
      typeof window !== "undefined" ? window.innerHeight - 180 : y,
    );
  }

  const style: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 60,
    width: 224,
    pointerEvents: roomProp ? "auto" : "none",
    ...(opaque
      ? {
          filter: "none",
        }
      : {}),
  };

  return (
    <div style={style}>
      <GlassPanel
        variant="panel"
        zIndex={60}
        wrapperClassName={`w-full ${opaque ? "room-tooltip--opaque" : ""}`}
      >
        <div className={opaque ? "rounded-3xl bg-white/90" : undefined}>
          <RoomInfoBody room={room} palette={palette} />
        </div>
      </GlassPanel>
    </div>
  );
}
