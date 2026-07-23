"use client";

import { useState, type RefObject } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Viewer3DHandle } from "./Viewer3D";
import {
  GlassButton,
  GlassInset,
  GlassInput,
  PanelTitle,
} from "./ui";

type Props = {
  viewerRef: RefObject<Viewer3DHandle | null>;
  embedded?: boolean;
};

export default function SavedViewsPanel({ viewerRef, embedded = false }: Props) {
  const savedViews = useAppStore((s) => s.savedViews);
  const addSavedView = useAppStore((s) => s.addSavedView);
  const goToSavedView = useAppStore((s) => s.goToSavedView);
  const removeSavedView = useAppStore((s) => s.removeSavedView);
  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);
  const activeModelId = useAppStore((s) => s.activeModelId);
  const rooms = useAppStore((s) => s.rooms);

  const [draftOpen, setDraftOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || !viewerRef.current) return;
    const pose = viewerRef.current.getCameraPose();
    addSavedView(trimmed, pose.position, pose.target);
    setName("");
    setDraftOpen(false);
  };

  const handleGo = (id: string) => {
    const view = goToSavedView(id);
    if (!view || !viewerRef.current) return;
    if (view.floorId !== undefined) setSelectedFloor(view.floorId);
    void viewerRef.current.flyToPose(view.position, view.target, 850);
  };

  if (rooms.length === 0) return null;

  const body = (
    <div className="space-y-3">
      {!draftOpen ? (
        <GlassButton
          disabled={!activeModelId}
          className="w-full border-dashed"
          onClick={() => setDraftOpen(true)}
        >
          + Save Current View
        </GlassButton>
      ) : (
        <GlassInset className="space-y-2 p-3">
          <GlassInput
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") {
                setDraftOpen(false);
                setName("");
              }
            }}
            placeholder="e.g. Lobby overview"
          />
          <div className="flex gap-2">
            <GlassButton
              variant="primary"
              className="flex-1"
              disabled={!name.trim()}
              onClick={handleSave}
            >
              Save
            </GlassButton>
            <GlassButton
              onClick={() => {
                setDraftOpen(false);
                setName("");
              }}
            >
              Cancel
            </GlassButton>
          </div>
        </GlassInset>
      )}

      {savedViews.length === 0 ? (
        <p className="text-xs text-zinc-400">No saved views yet.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {savedViews.map((v) => (
            <li
              key={v.id}
              className="group flex items-center gap-1 rounded-2xl transition-all duration-300 ease-out hover:bg-white/40"
            >
              <button
                type="button"
                onClick={() => handleGo(v.id)}
                className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium text-zinc-700"
              >
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => removeSavedView(v.id)}
                className="mr-1 rounded-2xl px-2 py-1 text-xs text-zinc-400 opacity-0 transition-all duration-300 ease-out group-hover:opacity-100 hover:bg-white/60 hover:text-zinc-700"
                aria-label={`Delete ${v.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <section className="p-4">
      <PanelTitle>Saved views</PanelTitle>
      {body}
    </section>
  );
}
