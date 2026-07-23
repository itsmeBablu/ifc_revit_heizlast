"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BsFullscreen, BsFullscreenExit } from "react-icons/bs";
import { VscSymbolColor } from "react-icons/vsc";
import { HiOutlineSquare3Stack3D } from "react-icons/hi2";
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

export default function ViewerToolbar({ viewerRef, targetRef }: Props) {
  const renderMode = useAppStore((s) => s.renderMode);
  const setRenderMode = useAppStore((s) => s.setRenderMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [menuPos, setMenuPos] = useState({ bottom: 0, left: 0 });
  const shadeBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || !shadeBtnRef.current) return;
    const update = () => {
      const r = shadeBtnRef.current!.getBoundingClientRect();
      setMenuPos({
        bottom: window.innerHeight - r.top + 10,
        left: r.left + r.width / 2,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (shadeBtnRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    // Defer so the opening click doesn't immediately close
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [menuOpen]);

  const toggleFullscreen = async () => {
    const el = targetRef.current ?? document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore — browser may block
    }
  };

  const btn =
    "flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-700 transition-colors hover:bg-white/40 active:scale-95";

  const menu =
    menuOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuRef}
        className="fixed z-[80] max-h-52 w-44 -translate-x-1/2 overflow-y-auto rounded-2xl border border-white/40 bg-white/75 p-1.5 shadow-lg backdrop-blur-xl"
        style={{ bottom: menuPos.bottom, left: menuPos.left }}
        role="menu"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="menuitem"
            onClick={() => {
              setRenderMode(m.id);
              setMenuOpen(false);
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
              className={`${btn} ${menuOpen ? "bg-white/40" : ""}`}
              aria-label="Shading mode"
              title="Shading mode"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <VscSymbolColor className="h-5 w-5" />
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
      {menu}
    </>
  );
}
