"use client";

import type { CSSProperties } from "react";
import { heizlastToColor, temperatureToColor } from "@/lib/colorMapping";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";

type Props = {
  x: number;
  y: number;
};

export default function RoomTooltip({ x, y }: Props) {
  const hoveredRoom = useAppStore((s) => s.hoveredRoom);

  if (!hoveredRoom) return null;

  const heatColor = heizlastToColor(hoveredRoom.heatLoad);
  const tempColor = temperatureToColor(hoveredRoom.temperature);
  const absHeizlast = hoveredRoom.heizlast;

  const offset = 16;
  const left = Math.min(
    x + offset,
    typeof window !== "undefined" ? window.innerWidth - 260 : x,
  );
  const top = Math.min(
    y + offset,
    typeof window !== "undefined" ? window.innerHeight - 180 : y,
  );

  const style: CSSProperties = {
    position: "fixed",
    left,
    top,
    zIndex: 60,
    width: 224,
    pointerEvents: "none",
  };

  return (
    <div style={style}>
      <GlassPanel variant="panel" zIndex={60} wrapperClassName="w-full">
        <div className="p-3">
          <p className="truncate text-sm font-semibold tracking-wide text-zinc-900">
            {hoveredRoom.name}
          </p>
          {hoveredRoom.number ? (
            <p className="text-xs font-medium text-zinc-500">
              Nr. {hoveredRoom.number}
            </p>
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
                <span className="tabular-nums">
                  {hoveredRoom.heatLoad.toFixed(1)} W/m²
                </span>
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
                  {hoveredRoom.temperature.toFixed(1)} °C
                </span>
              </span>
            </div>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}
