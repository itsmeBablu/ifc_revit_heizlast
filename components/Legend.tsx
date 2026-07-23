"use client";

import {
  HEIZLAST_GRADIENT_STOPS,
  TEMPERATURE_STOPS,
} from "@/lib/colorMapping";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";
import { GlassChip, PanelTitle } from "./ui";

type Props = {
  embedded?: boolean;
};

export default function Legend({ embedded = false }: Props) {
  const colorMode = useAppStore((s) => s.colorMode);
  const setColorMode = useAppStore((s) => s.setColorMode);

  const finiteStops = HEIZLAST_GRADIENT_STOPS;
  const gradient = finiteStops.map((s) => s.color).join(", ");
  const ticks = [0, 10, 20, 30, 40, 50];

  const body = (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <GlassChip
          active={colorMode === "heizlast"}
          onClick={() => setColorMode("heizlast")}
        >
          Heizlast (W/m²)
        </GlassChip>
        <GlassChip
          active={colorMode === "temperature"}
          onClick={() => setColorMode("temperature")}
        >
          Temperatur (°C)
        </GlassChip>
      </div>

      {colorMode === "heizlast" ? (
        <GlassPanel variant="control" zIndex={2} wrapperClassName="w-full">
          <div className="px-3 py-2.5">
            <div
              className="h-3 w-full rounded-2xl"
              style={{ background: `linear-gradient(to right, ${gradient})` }}
            />
            <div className="mt-1.5 flex justify-between text-[10px] font-medium tracking-wide text-zinc-500">
              {ticks.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </GlassPanel>
      ) : (
        <div className="flex flex-wrap gap-2">
          {TEMPERATURE_STOPS.map((s) => (
            <GlassPanel
              key={s.value}
              variant="chip"
              zIndex={2}
              wrapperClassName="inline-flex"
            >
              <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                <span
                  className="h-3.5 w-3.5 rounded-xl shadow-inner"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-xs font-medium text-zinc-700">
                  {s.value}°C
                </span>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="p-4">
      <PanelTitle>Legend</PanelTitle>
      {body}
    </div>
  );
}
