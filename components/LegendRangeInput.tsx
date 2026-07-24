"use client";

import { useEffect, useState } from "react";
import {
  formatLegendRange,
  MAX_LEGEND_STOPS,
  MIN_LEGEND_STOPS,
  parseLegendRange,
} from "@/lib/colorMapping";

export type RangePreset = {
  id: string;
  label: string;
  values: number[];
};

type Props = {
  values: number[];
  onCommit: (values: number[]) => void;
  unitHint: string;
  presets?: RangePreset[];
};

function rangesEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Comma-separated legend stop editor (6–8 numbers) + optional presets.
 */
export default function LegendRangeInput({
  values,
  onCommit,
  unitHint,
  presets = [],
}: Props) {
  const [draft, setDraft] = useState(() => formatLegendRange(values));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatLegendRange(values));
    setError(null);
  }, [values]);

  const matchedPreset =
    presets.find((p) => rangesEqual(p.values, values))?.id ?? "";

  const commit = () => {
    const parsed = parseLegendRange(draft);
    if (!parsed) {
      setError(`Enter ${MIN_LEGEND_STOPS}–${MAX_LEGEND_STOPS} numbers`);
      setDraft(formatLegendRange(values));
      return;
    }
    setError(null);
    onCommit(parsed);
    setDraft(formatLegendRange(parsed));
  };

  const applyPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    setError(null);
    onCommit(preset.values);
    setDraft(formatLegendRange(preset.values));
  };

  return (
    <div className="space-y-1.5">
      {presets.length > 0 && (
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium tracking-wide text-zinc-500">
            Preset
          </span>
          <select
            value={matchedPreset || "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") applyPreset(e.target.value);
            }}
            className="w-full rounded-xl border border-zinc-300/60 bg-white/55 px-2.5 py-1.5 text-[11px] text-zinc-800 outline-none focus:border-zinc-400"
            aria-label="Legend range preset"
          >
            <option value="custom" disabled={Boolean(matchedPreset)}>
              Custom range
            </option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="mb-0.5 block text-[10px] font-medium tracking-wide text-zinc-500">
          Range ({MIN_LEGEND_STOPS}–{MAX_LEGEND_STOPS} values, {unitHint})
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          spellCheck={false}
          className="w-full rounded-xl border border-zinc-300/60 bg-white/55 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-zinc-800 outline-none focus:border-zinc-400"
          placeholder="0, 10, 20, 30, 40, 50"
          aria-label={`Legend range in ${unitHint}`}
        />
      </label>
      {error ? (
        <p className="text-[10px] text-red-600">{error}</p>
      ) : (
        <p className="text-[10px] text-zinc-400">
          Pick a preset or type {MIN_LEGEND_STOPS}–{MAX_LEGEND_STOPS} numbers
        </p>
      )}
    </div>
  );
}
