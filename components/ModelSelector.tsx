"use client";

import { getModels } from "@/lib/modelRegistry";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";

type Props = {
  onSelectRegistryModel: (modelId: string) => void;
};

const NONE = "__none__";

/**
 * Explicit registry picker — never auto-loads.
 * Uses a stable "__none__" value so the browser cannot fall through to
 * the first model option (which caused the building-a.ifc 404).
 */
export default function ModelSelector({ onSelectRegistryModel }: Props) {
  const models = getModels();
  const activeModelId = useAppStore((s) => s.activeModelId);
  const activeModelLabel = useAppStore((s) => s.activeModelLabel);
  const isLoadingModel = useAppStore((s) => s.isLoadingModel);

  const isLocal = Boolean(activeModelId?.startsWith("local-"));
  const isRegistry =
    Boolean(activeModelId) &&
    !isLocal &&
    models.some((m) => m.id === activeModelId);

  const selectValue = isLocal
    ? "__local__"
    : isRegistry
      ? (activeModelId as string)
      : NONE;

  if (models.length === 0 && !isLocal) {
    return null;
  }

  return (
    <GlassPanel variant="control" zIndex={2} wrapperClassName="min-w-[150px]">
      <select
        disabled={isLoadingModel}
        value={selectValue}
        aria-label="Optional registry model"
        className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-800 outline-none"
        onChange={(e) => {
          const v = e.target.value;
          if (v === NONE || v === "__local__") return;
          onSelectRegistryModel(v);
        }}
      >
        <option value={NONE}>Registry…</option>
        {isLocal && (
          <option value="__local__">{activeModelLabel ?? "Local IFC"}</option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </GlassPanel>
  );
}
