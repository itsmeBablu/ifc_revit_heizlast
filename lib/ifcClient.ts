/**
 * IFC loading + parsing (client-side only via web-ifc WASM).
 *
 * Property / PSet names are configurable — Revit IFC exports often use custom
 * shared parameters. Adjust these constants to match your export mapping.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as WebIFC from "web-ifc";
import type { Floor, LoadedModel, Room } from "./types";
import { debugLog } from "./debugLog";

/** Prefer these PSet names when looking up heat-load / temperature values. */
export const HEAT_LOAD_PSET_NAMES = [
  "Pset_SpaceHeatingLoad",
  "Pset_SpaceThermalLoad",
  "Pset_SpaceThermalRequirements",
  "BaseQuantities",
];

export const HEAT_LOAD_PROP_NAMES = [
  "Heizlast",
  "Heizlastdichte",
  "Spezifische Heizlast",
  "spez. Heizlast",
  "HeatingLoad",
  "HeatLoad",
  "HeatLoadPerArea",
  "SpecificHeatLoad",
  "HeatingLoadPerArea",
  "HL",
  "qH",
  "QH",
];

export const TEMPERATURE_PSET_NAMES = [
  "Pset_SpaceThermalRequirements",
  "Pset_SpaceComfort",
  "Pset_SpaceHVACDesign",
  "Pset_SpaceHeatingLoad",
];

export const TEMPERATURE_PROP_NAMES = [
  "Temperature",
  "Solltemperatur",
  "Raumtemperatur",
  "DesignTemperature",
  "RoomTemperature",
  "ThermalComfortTemperature",
  "HeatingDesignTemperature",
  "Temp",
  "T_Soll",
  "TSoll",
];

const WASM_PATH = "/wasm/";

/** Keep the last opened model alive so element property queries work after load. */
let openHandle: { api: WebIFC.IfcAPI; modelID: number } | null = null;

export function closeActiveIfcModel(): void {
  if (!openHandle) return;
  try {
    openHandle.api.CloseModel(openHandle.modelID);
  } catch {
    // ignore
  }
  openHandle = null;
}

export type LoadProgress = {
  phase: "fetch" | "parse" | "geometry" | "properties" | "done";
  progress: number; // 0..1, or -1 for indeterminate
  message: string;
};

type ProgressCallback = (p: LoadProgress) => void;

let apiPromise: Promise<WebIFC.IfcAPI> | null = null;

async function getIfcApi(): Promise<WebIFC.IfcAPI> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const api = new WebIFC.IfcAPI();
      // Prefer absolute URL so Next.js routing never rewrites the wasm fetch.
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      api.SetWasmPath(origin ? `${origin}${WASM_PATH}` : WASM_PATH, true);
      await api.Init();
      return api;
    })();
  }
  return apiPromise;
}

function readString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && value !== null && "value" in value) {
    const v = (value as { value: unknown }).value;
    return v == null ? "" : String(v);
  }
  return String(value);
}

function readNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return readNumber((value as { value: unknown }).value);
  }
  return null;
}

function propNameMatches(name: string, candidates: string[]): boolean {
  const n = name.trim().toLowerCase();
  return candidates.some(
    (c) => n === c.toLowerCase() || n.includes(c.toLowerCase()),
  );
}

function vectorToArray(vec: WebIFC.Vector<number>): number[] {
  const out: number[] = [];
  const size = vec.size();
  for (let i = 0; i < size; i++) out.push(vec.get(i));
  return out;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** web-ifc FlatMesh/IfcGeometry.delete() is not always present at runtime. */
function safeDelete(obj: { delete?: () => void } | null | undefined): void {
  if (obj && typeof obj.delete === "function") {
    try {
      obj.delete();
    } catch {
      // ignore WASM dispose failures
    }
  }
}

function placedGeometryToBuffer(
  api: WebIFC.IfcAPI,
  modelID: number,
  placed: WebIFC.PlacedGeometry,
): THREE.BufferGeometry | null {
  const geom = api.GetGeometry(modelID, placed.geometryExpressID);
  try {
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const indices = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    if (!verts.length || !indices.length) return null;

    const positions = new Float32Array((verts.length / 6) * 3);
    const normals = new Float32Array((verts.length / 6) * 3);

    for (let i = 0, j = 0; i < verts.length; i += 6, j += 3) {
      positions[j] = verts[i];
      positions[j + 1] = verts[i + 1];
      positions[j + 2] = verts[i + 2];
      normals[j] = verts[i + 3];
      normals[j + 1] = verts[i + 4];
      normals[j + 2] = verts[i + 5];
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    buffer.setIndex(new THREE.BufferAttribute(indices, 1));

    const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
    buffer.applyMatrix4(matrix);
    return buffer;
  } finally {
    safeDelete(geom);
  }
}

function mergePlacedGeometries(
  api: WebIFC.IfcAPI,
  modelID: number,
  mesh: WebIFC.FlatMesh,
): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const geos = mesh.geometries;
  const count = geos.size();

  for (let i = 0; i < count; i++) {
    const placed = geos.get(i);
    const part = placedGeometryToBuffer(api, modelID, placed);
    if (part) parts.push(part);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildContainmentMap(api: WebIFC.IfcAPI, modelID: number): Map<number, number> {
  const map = new Map<number, number>();
  const relIds = vectorToArray(
    api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE),
  );

  for (const relId of relIds) {
    const rel = api.GetLine(modelID, relId);
    const relating = rel?.RelatingStructure?.value as number | undefined;
    const related = rel?.RelatedElements as Array<{ value: number }> | undefined;
    if (!relating || !related) continue;
    for (const el of related) {
      if (el?.value != null) map.set(el.value, relating);
    }
  }

  return map;
}

/**
 * Spaces are usually linked to storeys via IfcRelAggregates, not ContainedIn.
 * Returns map: childExpressId → parentExpressId (e.g. space → storey).
 */
function buildAggregationMap(
  api: WebIFC.IfcAPI,
  modelID: number,
): Map<number, number> {
  const map = new Map<number, number>();
  const relIds = vectorToArray(
    api.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES),
  );

  for (const relId of relIds) {
    const rel = api.GetLine(modelID, relId);
    const relating = rel?.RelatingObject?.value as number | undefined;
    const related = rel?.RelatedObjects as Array<{ value: number }> | undefined;
    if (!relating || !related) continue;
    for (const el of related) {
      if (el?.value != null) map.set(el.value, relating);
    }
  }

  return map;
}

function normalizeRoomKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^raum\s+/i, "");
}

/** Best-effort world origin from a product line's ObjectPlacement (flattened). */
function extractPlacementOrigin(line: {
  ObjectPlacement?: unknown;
}): THREE.Vector3 | null {
  try {
    const placement = line.ObjectPlacement as
      | {
          RelativePlacement?: {
            Location?: { Coordinates?: Array<number | { value?: number }> };
          };
          PlacementRelTo?: unknown;
        }
      | undefined;
    if (!placement) return null;

    const walk = (
      p: typeof placement | undefined,
      acc: THREE.Vector3,
    ): THREE.Vector3 => {
      if (!p) return acc;
      const coords = p.RelativePlacement?.Location?.Coordinates;
      if (coords && coords.length >= 3) {
        const x = typeof coords[0] === "number" ? coords[0] : Number(coords[0]?.value ?? 0);
        const y = typeof coords[1] === "number" ? coords[1] : Number(coords[1]?.value ?? 0);
        const z = typeof coords[2] === "number" ? coords[2] : Number(coords[2]?.value ?? 0);
        acc.add(new THREE.Vector3(x, y, z));
      }
      const parent = p.PlacementRelTo as typeof placement | undefined;
      if (parent) return walk(parent, acc);
      return acc;
    };

    return walk(placement, new THREE.Vector3());
  } catch {
    return null;
  }
}

function ingestFlatMesh(
  api: WebIFC.IfcAPI,
  modelID: number,
  mesh: WebIFC.FlatMesh,
  spaceIdSet: Set<number>,
  spaceGeoms: Map<number, THREE.BufferGeometry>,
  shellGeoms: {
    geom: THREE.BufferGeometry;
    expressId: number;
    floorId: string;
  }[],
  containment: Map<number, number>,
  storeyGuidByExpress: Map<number, string>,
  floors: Floor[],
): void {
  const expressID = mesh.expressID;
  const geom = mergePlacedGeometries(api, modelID, mesh);
  if (!geom) return;

  if (spaceIdSet.has(expressID)) {
    const prev = spaceGeoms.get(expressID);
    if (prev) prev.dispose();
    spaceGeoms.set(expressID, geom);
    return;
  }

  const storeyExpress = containment.get(expressID);
  const floorId =
    (storeyExpress != null
      ? storeyGuidByExpress.get(storeyExpress)
      : undefined) ?? floors[0].id;
  shellGeoms.push({ geom, expressId: expressID, floorId });
}

function flattenProps(psets: unknown[]): { pset: string; name: string; value: unknown }[] {
  const out: { pset: string; name: string; value: unknown }[] = [];
  for (const pset of psets) {
    const ps = pset as {
      Name?: { value?: string };
      HasProperties?: unknown[];
    };
    const psetName = readString(ps.Name);
    for (const prop of ps.HasProperties ?? []) {
      const p = prop as {
        Name?: { value?: string };
        NominalValue?: unknown;
        LengthValue?: unknown;
        AreaValue?: unknown;
        VolumeValue?: unknown;
        HasProperties?: unknown[];
      };
      // Nested property sets (rare)
      if (Array.isArray(p.HasProperties)) {
        out.push(...flattenProps([p]));
        continue;
      }
      const name = readString(p.Name);
      const value =
        p.NominalValue ?? p.LengthValue ?? p.AreaValue ?? p.VolumeValue ?? null;
      if (name) out.push({ pset: psetName, name, value });
    }
  }
  return out;
}

function fuzzyHeatLoad(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("heizlast") ||
    n.includes("heatload") ||
    n.includes("heat_load") ||
    n.includes("heatingload") ||
    (n.includes("heat") && n.includes("load")) ||
    (n.includes("w/m") && n.includes("heat")) ||
    n === "qh" ||
    n === "hl"
  );
}

function fuzzyTemperature(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("solltemperatur") ||
    n.includes("raumtemperatur") ||
    n.includes("temperature") ||
    n.includes("temp.") ||
    n.startsWith("temp") ||
    n.includes("°c") ||
    n.includes("celsius")
  );
}

function extractNumericProp(
  psets: unknown[],
  preferredPsets: string[],
  propNames: string[],
  fuzzy?: (name: string) => boolean,
): number | null {
  const preferred = new Set(preferredPsets.map((p) => p.toLowerCase()));
  const flat = flattenProps(psets);

  const tryList = (list: typeof flat): number | null => {
    for (const item of list) {
      if (!propNameMatches(item.name, propNames) && !(fuzzy?.(item.name) ?? false)) {
        continue;
      }
      const num = readNumber(item.value);
      if (num != null) return num;
    }
    return null;
  };

  const preferredItems = flat.filter((i) => preferred.has(i.pset.toLowerCase()));
  return tryList(preferredItems) ?? tryList(flat);
}

async function extractSpaceProps(
  api: WebIFC.IfcAPI,
  modelID: number,
  expressId: number,
): Promise<{ heatLoad: number; temperature: number; number: string; propDump: string[] }> {
  let heatLoad = 0;
  let temperature = 20;
  let number = "";
  const propDump: string[] = [];

  try {
    const psets = await api.properties.getPropertySets(modelID, expressId, true);
    const flat = flattenProps(psets);
    for (const item of flat) {
      propDump.push(`${item.pset}.${item.name}=${readString(item.value)}`);
    }

    heatLoad =
      extractNumericProp(
        psets,
        HEAT_LOAD_PSET_NAMES,
        HEAT_LOAD_PROP_NAMES,
        fuzzyHeatLoad,
      ) ?? 0;
    temperature =
      extractNumericProp(
        psets,
        TEMPERATURE_PSET_NAMES,
        TEMPERATURE_PROP_NAMES,
        fuzzyTemperature,
      ) ?? 20;

    for (const item of flat) {
      const name = item.name.toLowerCase();
      if (
        name === "number" ||
        name === "numbering" ||
        name === "raumnummer" ||
        name === "roomnumber" ||
        name === "mark" ||
        name === "nummer"
      ) {
        number = readString(item.value);
      }
    }
  } catch {
    // Property lookup can fail on incomplete exports — keep defaults.
  }

  return { heatLoad, temperature, number, propDump };
}

export type IfcSource = string | File | ArrayBuffer | Uint8Array;

async function resolveIfcBytes(
  source: IfcSource,
  report: (p: LoadProgress) => void,
): Promise<Uint8Array> {
  if (typeof source === "string") {
    report({ phase: "fetch", progress: 0, message: "Downloading IFC…" });
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch IFC (${response.status}): ${source}`);
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    report({ phase: "fetch", progress: 1, message: "Download complete" });
    return buffer;
  }

  if (source instanceof File) {
    report({ phase: "fetch", progress: 0, message: `Reading ${source.name}…` });
    const ab = await source.arrayBuffer();
    const buffer = new Uint8Array(ab);
    if (buffer.byteLength === 0) {
      throw new Error(`IFC file is empty: ${source.name}`);
    }
    report({ phase: "fetch", progress: 1, message: "File read complete" });
    return buffer;
  }

  report({ phase: "fetch", progress: 1, message: "Using provided buffer…" });
  return source instanceof Uint8Array ? source : new Uint8Array(source);
}

/**
 * Load an IFC from a public path, File, or ArrayBuffer and extract floors,
 * colored room spaces, and a neutral building shell group.
 */
export async function loadIfcModel(
  source: IfcSource,
  onProgress?: ProgressCallback,
): Promise<LoadedModel> {
  const report = (p: LoadProgress) => {
    onProgress?.(p);
    debugLog(
      "ifcClient",
      `${p.phase}: ${p.message}`,
      "info",
      { progress: p.progress },
    );
  };

  const sourceKind =
    typeof source === "string"
      ? `path:${source}`
      : source instanceof File
        ? `file:${source.name} (${source.size} bytes)`
        : `buffer:${source.byteLength} bytes`;
  debugLog("ifcClient", `loadIfcModel start — ${sourceKind}`, "info");

  try {
    const buffer = await resolveIfcBytes(source, report);
    debugLog("ifcClient", `bytes ready: ${buffer.byteLength}`, "ok");

    report({ phase: "parse", progress: -1, message: "Opening model in WASM…" });
    closeActiveIfcModel();
    const api = await getIfcApi();
    debugLog("ifcClient", "WASM IfcAPI ready", "ok");

    const modelID = api.OpenModel(buffer);
    if (modelID < 0) {
      throw new Error("web-ifc failed to open the IFC model");
    }
    openHandle = { api, modelID };
    debugLog("ifcClient", `OpenModel ok — modelID=${modelID}`, "ok");

    try {
      await yieldToMain();

      report({ phase: "properties", progress: 0.1, message: "Reading storeys…" });
      const containment = buildContainmentMap(api, modelID);
      const aggregation = buildAggregationMap(api, modelID);
      debugLog(
        "ifcClient",
        `containment map: ${containment.size} elements, aggregates: ${aggregation.size}`,
        "info",
      );

      const storeyIds = vectorToArray(
        api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY),
      );
      const floors: Floor[] = [];
      const storeyGuidByExpress = new Map<number, string>();

      for (const sid of storeyIds) {
        const line = api.GetLine(modelID, sid);
        const id = readString(line.GlobalId) || `storey-${sid}`;
        const name =
          readString(line.Name) || readString(line.LongName) || `Storey ${sid}`;
        const elevation = readNumber(line.Elevation) ?? 0;
        storeyGuidByExpress.set(sid, id);
        floors.push({ id, name, elevation, expressId: sid });
      }
      floors.sort((a, b) => a.elevation - b.elevation);

      if (floors.length === 0) {
        floors.push({
          id: "default-floor",
          name: "All levels",
          elevation: 0,
          expressId: -1,
        });
      }
      debugLog("ifcClient", `floors: ${floors.length}`, "ok", floors.map((f) => f.name));

      const spaceIds = vectorToArray(
        api.GetLineIDsWithType(modelID, WebIFC.IFCSPACE),
      );
      const spaceIdSet = new Set(spaceIds);
      const rooms: Room[] = [];
      const spaceGeoms = new Map<number, THREE.BufferGeometry>();
      const shellGeoms: {
        geom: THREE.BufferGeometry;
        expressId: number;
        floorId: string;
      }[] = [];

      report({ phase: "geometry", progress: 0, message: "Extracting geometry…" });
      debugLog("ifcClient", `IfcSpace count: ${spaceIds.length}`, "info");

      let meshIndex = 0;
      let meshTotal = 1;
      let meshErrors = 0;

      const takeMesh = (mesh: WebIFC.FlatMesh, index: number, total: number) => {
        meshIndex = index;
        meshTotal = Math.max(total, 1);
        try {
          ingestFlatMesh(
            api,
            modelID,
            mesh,
            spaceIdSet,
            spaceGeoms,
            shellGeoms,
            containment,
            storeyGuidByExpress,
            floors,
          );
        } catch (err) {
          meshErrors += 1;
          if (meshErrors <= 3) {
            debugLog("ifcClient", `mesh #${index} failed`, "warn", err);
          }
        } finally {
          safeDelete(mesh);
        }
      };

      // Building shell + any product meshes that happen to be spaces
      api.StreamAllMeshes(modelID, takeMesh);

      // Revit spaces often have Body representation that StreamAllMeshes skips —
      // pull them explicitly by ID and by type.
      if (spaceIds.length > 0) {
        try {
          api.StreamMeshes(modelID, spaceIds, takeMesh);
        } catch (err) {
          debugLog("ifcClient", "StreamMeshes(spaces) failed", "warn", err);
        }
        try {
          api.StreamAllMeshesWithTypes(modelID, [WebIFC.IFCSPACE], takeMesh);
        } catch (err) {
          debugLog(
            "ifcClient",
            "StreamAllMeshesWithTypes(IFCSPACE) failed",
            "warn",
            err,
          );
        }
      }

      // Per-space GetFlatMesh fallback for any still missing
      let flatMeshHits = 0;
      for (const sid of spaceIds) {
        if (spaceGeoms.has(sid)) continue;
        try {
          const flat = api.GetFlatMesh(modelID, sid);
          if (!flat) continue;
          try {
            const geom = mergePlacedGeometries(api, modelID, flat);
            if (geom) {
              spaceGeoms.set(sid, geom);
              flatMeshHits += 1;
            }
          } finally {
            safeDelete(flat);
          }
        } catch {
          // no tessellation for this space
        }
      }

      // Fallback: Revit often exports room volumes as IfcBuildingElementProxy
      // with the same Name/Number as the IfcSpace — reclaim those shell meshes.
      if (spaceGeoms.size < spaceIds.length && shellGeoms.length > 0) {
        const keyToSpace = new Map<string, number>();
        for (const sid of spaceIds) {
          if (spaceGeoms.has(sid)) continue;
          try {
            const line = api.GetLine(modelID, sid);
            const keys = [
              readString(line.Name),
              readString(line.LongName),
              readString(line.Tag),
            ]
              .map(normalizeRoomKey)
              .filter(Boolean);
            for (const k of keys) {
              if (!keyToSpace.has(k)) keyToSpace.set(k, sid);
            }
          } catch {
            // skip
          }
        }

        const remaining: typeof shellGeoms = [];
        let proxyMatched = 0;
        for (const piece of shellGeoms) {
          let matchedSpace: number | null = null;
          try {
            const typeCode = api.GetLineType(modelID, piece.expressId);
            const typeName = api.GetNameFromTypeCode(typeCode) ?? "";
            const isProxyLike =
              typeCode === WebIFC.IFCBUILDINGELEMENTPROXY ||
              typeName.toLowerCase().includes("proxy") ||
              typeName.toLowerCase().includes("covering") ||
              typeName.toLowerCase().includes("furnishing");

            if (isProxyLike) {
              const line = api.GetLine(modelID, piece.expressId);
              const keys = [
                readString(line.Name),
                readString(line.LongName),
                readString(line.Tag),
                readString(line.ObjectType),
              ]
                .map(normalizeRoomKey)
                .filter(Boolean);
              for (const k of keys) {
                const sid = keyToSpace.get(k);
                if (sid != null && !spaceGeoms.has(sid)) {
                  matchedSpace = sid;
                  break;
                }
              }
            }
          } catch {
            // keep as shell
          }

          if (matchedSpace != null) {
            const prev = spaceGeoms.get(matchedSpace);
            if (prev) prev.dispose();
            spaceGeoms.set(matchedSpace, piece.geom);
            proxyMatched += 1;
          } else {
            remaining.push(piece);
          }
        }
        shellGeoms.length = 0;
        shellGeoms.push(...remaining);
        if (proxyMatched > 0) {
          debugLog(
            "ifcClient",
            `matched ${proxyMatched} proxy/volume mesh(es) to IfcSpace by name`,
            "ok",
          );
        }
      }

      // Spatial fallback: assign unmatched proxy-like shell meshes to nearest space
      // placement when name matching left spaces without geometry.
      if (spaceGeoms.size < spaceIds.length && shellGeoms.length > 0) {
        const unmatchedSpaces = spaceIds.filter((id) => !spaceGeoms.has(id));
        const spaceOrigins = new Map<number, THREE.Vector3>();
        for (const sid of unmatchedSpaces) {
          try {
            const line = api.GetLine(modelID, sid, true);
            const origin = extractPlacementOrigin(line);
            if (origin) spaceOrigins.set(sid, origin);
          } catch {
            // skip
          }
        }

        if (spaceOrigins.size > 0) {
          const usedSpaces = new Set<number>();

          const candidates = shellGeoms
            .map((piece) => {
              let proxyLike = false;
              try {
                const typeCode = api.GetLineType(modelID, piece.expressId);
                const typeName =
                  api.GetNameFromTypeCode(typeCode)?.toLowerCase() ?? "";
                proxyLike =
                  typeCode === WebIFC.IFCBUILDINGELEMENTPROXY ||
                  typeName.includes("proxy") ||
                  typeName.includes("space");
              } catch {
                proxyLike = false;
              }
              piece.geom.computeBoundingBox();
              const center = new THREE.Vector3();
              piece.geom.boundingBox?.getCenter(center);
              return { piece, center, proxyLike };
            })
            .filter((c) => c.proxyLike);

          if (candidates.length > 0) {
            const claimed = new Set<number>();
            let spatialMatched = 0;

            for (const { piece, center } of candidates) {
              let bestId: number | null = null;
              let bestDist = Infinity;
              for (const [sid, origin] of spaceOrigins) {
                if (usedSpaces.has(sid)) continue;
                const d = center.distanceToSquared(origin);
                if (d < bestDist) {
                  bestDist = d;
                  bestId = sid;
                }
              }
              const maxDist = 8; // metres
              if (bestId != null && bestDist <= maxDist * maxDist) {
                const prev = spaceGeoms.get(bestId);
                if (prev) prev.dispose();
                spaceGeoms.set(bestId, piece.geom);
                usedSpaces.add(bestId);
                claimed.add(piece.expressId);
                spatialMatched += 1;
              }
            }

            const remaining = shellGeoms.filter(
              (p) => !claimed.has(p.expressId),
            );
            shellGeoms.length = 0;
            shellGeoms.push(...remaining);
            if (spatialMatched > 0) {
              debugLog(
                "ifcClient",
                `matched ${spatialMatched} shell mesh(es) to IfcSpace by proximity`,
                "ok",
              );
            }
          }
        }
      }

      // Type histogram for first shell pieces (debug)
      if (shellGeoms.length > 0 && spaceGeoms.size === 0) {
        const hist = new Map<string, number>();
        for (const piece of shellGeoms.slice(0, 40)) {
          try {
            const name =
              api.GetNameFromTypeCode(
                api.GetLineType(modelID, piece.expressId),
              ) || "Unknown";
            hist.set(name, (hist.get(name) ?? 0) + 1);
          } catch {
            hist.set("?", (hist.get("?") ?? 0) + 1);
          }
        }
        debugLog(
          "ifcClient",
          "shell type sample (no space geoms yet)",
          "warn",
          Object.fromEntries(hist),
        );
      }

      debugLog(
        "ifcClient",
        `geometry stream done — meshes≈${meshTotal}, spacesWithGeom=${spaceGeoms.size}, shellParts=${shellGeoms.length}, flatMeshHits=${flatMeshHits}, meshErrors=${meshErrors}`,
        meshErrors || spaceGeoms.size === 0 ? "warn" : "ok",
      );

      report({
        phase: "geometry",
        progress: Math.min(1, meshIndex / meshTotal),
        message: "Building room meshes…",
      });
      await yieldToMain();

      report({
        phase: "properties",
        progress: 0.4,
        message: "Reading space properties…",
      });

      let processed = 0;
      let sampleLogged = false;
      for (const spaceExpressId of spaceIds) {
        processed++;
        if (processed % 8 === 0) {
          report({
            phase: "properties",
            progress: 0.4 + 0.5 * (processed / Math.max(spaceIds.length, 1)),
            message: `Reading spaces (${processed}/${spaceIds.length})…`,
          });
          await yieldToMain();
        }

        const line = api.GetLine(modelID, spaceExpressId);
        const globalId = readString(line.GlobalId) || `space-${spaceExpressId}`;
        const name =
          readString(line.LongName) ||
          readString(line.Name) ||
          `Room ${spaceExpressId}`;
        const tagNumber = readString(line.Name) || readString(line.Tag);
        const props = await extractSpaceProps(api, modelID, spaceExpressId);

        if (!sampleLogged && props.propDump.length) {
          sampleLogged = true;
          debugLog(
            "ifcClient",
            `sample space props (${props.propDump.length})`,
            "info",
            props.propDump.slice(0, 40),
          );
          debugLog(
            "ifcClient",
            `parsed heatLoad=${props.heatLoad} temperature=${props.temperature}`,
            props.heatLoad === 0 ? "warn" : "ok",
          );
        }

        const geom = spaceGeoms.get(spaceExpressId);
        if (!geom) continue;

        const storeyExpress =
          aggregation.get(spaceExpressId) ?? containment.get(spaceExpressId);
        const floorId =
          (storeyExpress != null
            ? storeyGuidByExpress.get(storeyExpress)
            : undefined) ?? floors[0].id;

        rooms.push({
          id: globalId,
          name,
          number: props.number || tagNumber,
          heatLoad: props.heatLoad,
          temperature: props.temperature,
          floorId,
          expressId: spaceExpressId,
          geometry: geom,
        });
      }

      const heatValues = rooms.map((r) => r.heatLoad);
      const minH = heatValues.length ? Math.min(...heatValues) : 0;
      const maxH = heatValues.length ? Math.max(...heatValues) : 0;
      debugLog(
        "ifcClient",
        `rooms built: ${rooms.length} — Heizlast range ${minH}…${maxH}`,
        maxH === 0 && rooms.length > 0 ? "warn" : "ok",
      );

      report({
        phase: "geometry",
        progress: 0.95,
        message: "Assembling building shell…",
      });
      await yieldToMain();

      const shellGroup = new THREE.Group();
      shellGroup.name = "building-shell";

      const shellMaterial = new THREE.MeshStandardMaterial({
        color: 0xc8cdd3,
        roughness: 0.7,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });

      for (const piece of shellGeoms) {
        const meshObj = new THREE.Mesh(piece.geom, shellMaterial.clone());
        meshObj.castShadow = true;
        meshObj.receiveShadow = true;
        meshObj.userData.floorId = piece.floorId;
        meshObj.userData.expressId = piece.expressId;
        shellGroup.add(meshObj);
      }

      const coord = api.GetCoordinationMatrix(modelID);
      if (coord && coord.length === 16) {
        const m = new THREE.Matrix4().fromArray(coord);
        shellGroup.applyMatrix4(m);
        for (const room of rooms) {
          room.geometry.applyMatrix4(m);
        }
      }

      report({ phase: "done", progress: 1, message: "Ready" });
      debugLog(
        "ifcClient",
        `load complete — floors=${floors.length} rooms=${rooms.length} shellChildren=${shellGroup.children.length}`,
        "ok",
      );
      return { floors, rooms, shellGroup };
    } catch (err) {
      closeActiveIfcModel();
      throw err;
    }
  } catch (err) {
    debugLog("ifcClient", "loadIfcModel failed", "error", err);
    throw err;
  }
}

export async function getElementDetails(
  expressId: number,
  floorId: string | null = null,
  roomId: string | null = null,
): Promise<import("./types").SelectedElement | null> {
  if (!openHandle) {
    debugLog("ifcClient", "getElementDetails: no open model", "warn");
    return null;
  }
  const { api, modelID } = openHandle;
  try {
    const line = api.GetLine(modelID, expressId, true);
    const typeCode = api.GetLineType(modelID, expressId);
    const typeName =
      typeof api.GetNameFromTypeCode === "function"
        ? api.GetNameFromTypeCode(typeCode)
        : `Type ${typeCode}`;
    const globalId = readString(line?.GlobalId) || `id-${expressId}`;
    const name =
      readString(line?.LongName) ||
      readString(line?.Name) ||
      readString(line?.Tag) ||
      typeName;

    const psets = await api.properties.getPropertySets(modelID, expressId, true);
    const flat = flattenProps(psets);
    const properties = flat.map((p) => ({
      name: p.name,
      value: readString(p.value),
      pset: p.pset,
    }));

    const kind = roomId ? "room" : "component";
    return {
      expressId,
      globalId,
      typeName: String(typeName),
      name,
      floorId,
      kind,
      roomId,
      properties,
    };
  } catch (err) {
    debugLog("ifcClient", `getElementDetails failed #${expressId}`, "error", err);
    return null;
  }
}

export function disposeLoadedModel(model: LoadedModel | null | undefined): void {
  if (!model) return;
  for (const room of model.rooms) {
    room.geometry.dispose();
  }
  model.shellGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
  // Keep WASM model open for property queries until next load replaces it.
}
