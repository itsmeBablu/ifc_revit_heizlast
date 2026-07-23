"use client";

import { createContext, useContext } from "react";
import type { Group } from "three";
import type { Room } from "@/lib/types";

export type ModelSceneValue = {
  shellGroup: Group | null;
  rooms: Room[];
};

export const ModelSceneContext = createContext<ModelSceneValue>({
  shellGroup: null,
  rooms: [],
});

export function useModelScene() {
  return useContext(ModelSceneContext);
}
