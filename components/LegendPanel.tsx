"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_PALETTE_IDS,
  COLOR_PALETTES,
  heizlastGradientCss,
  temperatureStopsFor,
  type ColorPaletteId,
} from "@/lib/colorMapping";
import { heading } from "@/lib/designTokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * Compact legend — palette presets stay hidden until the user clicks
 * the color scale / chips (hidden feature).
 */
export default function LegendPanel() {
  const colorMode = useAppStore((s) => s.colorMode);
  const setColorMode = useAppStore((s) => s.setColorMode);
  const activeColorPalette = useAppStore((s) => s.activeColorPalette);
  const setActiveColorPalette = useAppStore((s) => s.setActiveColorPalette);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const tempStops = temperatureStopsFor(activeColorPalette);

  useEffect(() => {
    if (!paletteOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [paletteOpen]);

  return (
    <div className="text-zinc-800" ref={pickerRef}>
      <section className="space-y-2.5 px-3 pt-14 pb-3">
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
            <button
              type="button"
              title="Change color palette"
              onClick={() => setPaletteOpen((v) => !v)}
              className="group relative block w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
            >
              <div
                className="h-2.5 w-full rounded-full transition-opacity group-hover:opacity-90"
                style={{
                  background: heizlastGradientCss(
                    "to right",
                    activeColorPalette,
                  ),
                }}
              />
            </button>
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              {[0, 10, 20, 30, 40, 50].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p className="mt-0.5 text-[10px] text-zinc-400">W/m²</p>
          </div>
        ) : (
          <div>
            <button
              type="button"
              title="Change color palette"
              onClick={() => setPaletteOpen((v) => !v)}
              className="flex w-full flex-wrap gap-1.5 rounded-xl p-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
            >
              {tempStops.map((s) => (
                <div
                  key={s.value}
                  className="flex items-center gap-1 rounded-lg bg-white/50 px-2 py-1 text-[10px] font-medium text-zinc-700"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-md"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.value}°C
                </div>
              ))}
            </button>
          </div>
        )}

        {paletteOpen && (
          <div className="space-y-1.5 rounded-xl border border-white/50 bg-white/90 p-2 shadow-md backdrop-blur-md">
            <p className="px-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
              Palette
            </p>
            {COLOR_PALETTE_IDS.map((id) => {
              const pal = COLOR_PALETTES[id];
              const active = activeColorPalette === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveColorPalette(id as ColorPaletteId);
                    setPaletteOpen(false);
                  }}
                  className={`w-full rounded-lg border px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "border-zinc-500/40 bg-zinc-900/5"
                      : "border-transparent hover:bg-zinc-900/5"
                  }`}
                >
                  <p className="mb-1 text-[11px] font-semibold text-zinc-800">
                    {pal.name}
                  </p>
                  <div
                    className="h-1.5 w-full rounded-full"
                    style={{
                      background: heizlastGradientCss("to right", id),
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
