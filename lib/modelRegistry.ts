import type { ModelEntry } from "./types";

/**
 * Registry models (secondary to local File upload).
 * Only fetched when the user explicitly picks an entry — never on startup.
 * Do not list paths that are not present under public/models/.
 */
const MODELS: ModelEntry[] = [
  // Uncomment / add once the file exists at public/models/building-a.ifc:
  // {
  //   id: "building-a",
  //   label: "Building A",
  //   ifcPath: "/models/building-a.ifc",
  // },
  {
    id: "smoke",
    label: "Smoke test (minimal)",
    ifcPath: "/models/_smoke.ifc",
  },
];

export function getModels(): ModelEntry[] {
  return MODELS;
}

export function getModelById(id: string): ModelEntry | undefined {
  return MODELS.find((m) => m.id === id);
}
