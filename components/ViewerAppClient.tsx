"use client";

import dynamic from "next/dynamic";

const ViewerApp = dynamic(() => import("./ViewerApp"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-zinc-100 text-zinc-500">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
        <p className="text-sm">Loading viewer…</p>
      </div>
    </div>
  ),
});

export default function ViewerAppClient() {
  return <ViewerApp />;
}
