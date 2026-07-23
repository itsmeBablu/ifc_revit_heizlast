"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BsFullscreen, BsFullscreenExit } from "react-icons/bs";
import { VscSymbolColor } from "react-icons/vsc";
import { HiOutlineSquare3Stack3D } from "react-icons/hi2";
import { CiLight } from "react-icons/ci";
import type { RenderMode } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import GlassPanel from "./GlassPanel";
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

type Panel = "shade" | "light" | null;

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
    <label className="block px-1 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-700">{label}</span>
        <span className="tabular-nums text-[10px] text-zinc-500">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-300/70 accent-zinc-800"
      />
    </label>
  );
}

export default function ViewerToolbar({ viewerRef, targetRef }: Props) {
  const renderMode = useAppStore((s) => s.renderMode);
  const setRenderMode = useAppStore((s) => s.setRenderMode);
  const lighting = useAppStore((s) => s.lighting);
  const setLighting = useAppStore((s) => s.setLighting);

  const [panel, setPanel] = useState<Panel>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shadePos, setShadePos] = useState({ bottom: 0, left: 0 });
  const [lightPos, setLightPos] = useState({ bottom: 0, left: 0 });

  const shadeBtnRef = useRef<HTMLButtonElement>(null);
  const lightBtnRef = useRef<HTMLButtonElement>(null);
  const shadeMenuRef = useRef<HTMLDivElement>(null);
  const lightMenuRef = useRef<HTMLDivElement>(null);

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
        className={`${glassPopover} w-56 p-2`}
        style={{ bottom: lightPos.bottom, left: lightPos.left }}
        role="dialog"
        aria-label="Lighting"
      >
        <p className="mb-1 px-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
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
    </>
  );
}
