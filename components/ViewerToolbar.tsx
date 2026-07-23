"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BsFullscreen, BsFullscreenExit } from "react-icons/bs";
import { VscSymbolColor } from "react-icons/vsc";
import { HiOutlineSquare3Stack3D } from "react-icons/hi2";
import { CiLight } from "react-icons/ci";
import { LiaStreetViewSolid } from "react-icons/lia";
import type { RenderMode } from "@/lib/types";
import { SCENE_BACKGROUND_PRESETS, useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";
import Slider from "./ui/Slider";
import type { Viewer3DHandle } from "./Viewer3D";
import type { RefObject } from "react";

const MODES: { id: RenderMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "fullColor", label: "Full Color" },
  { id: "wireframe", label: "Wireframe" },
  { id: "texture", label: "Texture" },
  { id: "realistic", label: "Realistic" },
];

type Props = {
  viewerRef: RefObject<Viewer3DHandle | null>;
  targetRef: RefObject<HTMLElement | null>;
};

type Panel = "shade" | "light" | "save" | null;

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block px-1 py-0.5">
      <div className="mb-0.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-700">{label}</span>
        <span className="tabular-nums text-[10px] text-zinc-500">
          {Math.round(value * 100)}%
        </span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(v) => onChange(v / 100)}
      />
    </label>
  );
}

export default function ViewerToolbar({ viewerRef, targetRef }: Props) {
  const renderMode = useAppStore((s) => s.renderMode);
  const setRenderMode = useAppStore((s) => s.setRenderMode);
  const lighting = useAppStore((s) => s.lighting);
  const setLighting = useAppStore((s) => s.setLighting);
  const sceneBackground = useAppStore((s) => s.sceneBackground);
  const setSceneBackground = useAppStore((s) => s.setSceneBackground);
  const addSavedView = useAppStore((s) => s.addSavedView);
  const activeModelId = useAppStore((s) => s.activeModelId);

  const [panel, setPanel] = useState<Panel>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shadePos, setShadePos] = useState({ bottom: 0, left: 0 });
  const [lightPos, setLightPos] = useState({ bottom: 0, left: 0 });
  const [savePos, setSavePos] = useState({ bottom: 0, left: 0 });
  const [viewName, setViewName] = useState("");

  const shadeBtnRef = useRef<HTMLButtonElement>(null);
  const lightBtnRef = useRef<HTMLButtonElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const shadeMenuRef = useRef<HTMLDivElement>(null);
  const lightMenuRef = useRef<HTMLDivElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useLayoutEffect(() => {
    if (panel !== "shade" || !shadeBtnRef.current) return;
    const update = () => {
      const r = shadeBtnRef.current!.getBoundingClientRect();
      setShadePos({
        bottom: window.innerHeight - r.top + 10,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [panel]);

  useLayoutEffect(() => {
    if (panel !== "light" || !lightBtnRef.current) return;
    const update = () => {
      const r = lightBtnRef.current!.getBoundingClientRect();
      setLightPos({
        bottom: window.innerHeight - r.top + 10,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [panel]);

  useLayoutEffect(() => {
    if (panel !== "save" || !saveBtnRef.current) return;
    const update = () => {
      const r = saveBtnRef.current!.getBoundingClientRect();
      setSavePos({
        bottom: window.innerHeight - r.top + 10,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel === "shade") {
        if (shadeMenuRef.current?.contains(t)) return;
        if (shadeBtnRef.current?.contains(t)) return;
      }
      if (panel === "light") {
        if (lightMenuRef.current?.contains(t)) return;
        if (lightBtnRef.current?.contains(t)) return;
      }
      if (panel === "save") {
        if (saveMenuRef.current?.contains(t)) return;
        if (saveBtnRef.current?.contains(t)) return;
      }
      setPanel(null);
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [panel]);

  const toggleFullscreen = async () => {
    const el = targetRef.current ?? document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const commitSaveView = () => {
    const name = viewName.trim();
    if (!name || !viewerRef.current) return;
    const pose = viewerRef.current.getCameraPose();
    addSavedView(name, pose.position, pose.target);
    setViewName("");
    setPanel(null);
  };

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-700 transition-colors hover:bg-white/40 active:scale-95";

  const glassPopover =
    "fixed z-[80] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/40 bg-white/70 shadow-lg backdrop-blur-xl";

  const shadeMenu =
    panel === "shade" &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={shadeMenuRef}
        className={`${glassPopover} max-h-52 w-44 overflow-y-auto p-1.5`}
        style={{ bottom: shadePos.bottom, left: shadePos.left }}
        role="menu"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setRenderMode(m.id);
              setPanel(null);
            }}
            className={`block w-full rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
              renderMode === m.id
                ? "bg-zinc-900/10 text-zinc-900"
                : "text-zinc-600 hover:bg-white/50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>,
      document.body,
    );

  const lightMenu =
    panel === "light" &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={lightMenuRef}
        className={`${glassPopover} max-h-[min(380px,70vh)] w-56 overflow-y-auto p-1.5`}
        style={{ bottom: lightPos.bottom, left: lightPos.left }}
        role="dialog"
        aria-label="Lighting"
      >
        <p className="mb-0.5 px-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
          Lighting
        </p>
        <SliderRow
          label="Transparency"
          value={lighting.transparency}
          onChange={(transparency) => setLighting({ transparency })}
        />
        <SliderRow
          label="Color"
          value={lighting.color}
          onChange={(color) => setLighting({ color })}
        />
        <SliderRow
          label="Shadow"
          value={lighting.shadow}
          onChange={(shadow) => setLighting({ shadow })}
        />
        <SliderRow
          label="Indirect light"
          value={lighting.indirectLight}
          onChange={(indirectLight) => setLighting({ indirectLight })}
        />

        <div className="mt-1 border-t border-zinc-300/50 pt-1.5">
          <p className="mb-1 px-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
            3D background
          </p>
          <div className="grid grid-cols-3 gap-1 px-0.5">
            {SCENE_BACKGROUND_PRESETS.map((p) => {
              const active =
                sceneBackground.toLowerCase() === p.hex.toLowerCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  onClick={() => setSceneBackground(p.hex)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1 transition-colors ${
                    active
                      ? "border-zinc-500/50 bg-white/70"
                      : "border-transparent hover:bg-white/50"
                  }`}
                >
                  <span
                    className="h-5 w-full rounded-md border border-zinc-400/30"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span className="text-[9px] font-medium leading-tight text-zinc-600">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body,
    );

  const saveMenu =
    panel === "save" &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={saveMenuRef}
        className={`${glassPopover} w-56 p-2.5`}
        style={{ bottom: savePos.bottom, left: savePos.left }}
        role="dialog"
        aria-label="Save view"
      >
        <p className="mb-1.5 px-0.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
          Save view
        </p>
        <input
          autoFocus
          type="text"
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSaveView();
            if (e.key === "Escape") setPanel(null);
          }}
          placeholder="View name"
          className="mb-2 w-full rounded-xl border border-zinc-300/60 bg-white/70 px-2.5 py-1.5 text-xs outline-none focus:border-zinc-400"
        />
        <button
          type="button"
          disabled={!viewName.trim() || !activeModelId}
          onClick={commitSaveView}
          className="w-full rounded-xl bg-zinc-800 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>,
      document.body,
    );

  return (
    <>
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
        <GlassPanel
          variant="panel"
          zIndex={40}
          wrapperClassName="pointer-events-auto"
        >
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              className={btn}
              aria-label="Fit model to screen"
              title="Fit model"
              onClick={() => viewerRef.current?.fitVisible()}
            >
              <HiOutlineSquare3Stack3D className="h-5 w-5" />
            </button>

            <button
              ref={shadeBtnRef}
              type="button"
              className={`${btn} ${panel === "shade" ? "bg-white/40" : ""}`}
              aria-label="Shading mode"
              title="Shading mode"
              aria-expanded={panel === "shade"}
              onClick={() =>
                setPanel((p) => (p === "shade" ? null : "shade"))
              }
            >
              <VscSymbolColor className="h-5 w-5" />
            </button>

            <button
              ref={lightBtnRef}
              type="button"
              className={`${btn} ${panel === "light" ? "bg-white/40" : ""}`}
              aria-label="Lighting"
              title="Lighting"
              aria-expanded={panel === "light"}
              onClick={() =>
                setPanel((p) => (p === "light" ? null : "light"))
              }
            >
              <CiLight className="h-5 w-5" />
            </button>

            <button
              ref={saveBtnRef}
              type="button"
              className={`${btn} ${panel === "save" ? "bg-white/40" : ""}`}
              aria-label="Save view"
              title="Save view"
              aria-expanded={panel === "save"}
              onClick={() => {
                setViewName("");
                setPanel((p) => (p === "save" ? null : "save"));
              }}
            >
              <LiaStreetViewSolid className="h-5 w-5" />
            </button>

            <button
              type="button"
              className={btn}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title="Fullscreen"
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? (
                <BsFullscreenExit className="h-[18px] w-[18px]" />
              ) : (
                <BsFullscreen className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </GlassPanel>
      </div>
      {shadeMenu}
      {lightMenu}
      {saveMenu}
    </>
  );
}
