import type * as THREE from "three";

export type Room = {
  id: string;
  name: string;
  number: string;
  heatLoad: number;
  temperature: number;
  floorId: string;
  expressId: number;
  geometry: THREE.BufferGeometry;
};

export type Floor = {
  id: string;
  name: string;
  elevation: number;
  expressId: number;
};

export type ModelEntry = {
  id: string;
  label: string;
  ifcPath: string;
};

export type SavedView = {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  floorId: string | null;
};

export type ColorMode = "heizlast" | "temperature";

export type RenderMode =
  | "light"
  | "fullColor"
  | "wireframe"
  | "texture"
  | "realistic";

export type ElementProperty = {
  name: string;
  value: string;
  pset?: string;
};

export type SelectedElement = {
  expressId: number;
  globalId: string;
  typeName: string;
  name: string;
  floorId: string | null;
  kind: "room" | "component";
  roomId: string | null;
  properties: ElementProperty[];
};

export type LoadedModel = {
  floors: Floor[];
  rooms: Room[];
  shellGroup: THREE.Group;
};
