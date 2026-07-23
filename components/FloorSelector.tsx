"use client";

/**
 * Legacy floor tab list — superseded by FloorRoomsPanel dropdown.
 * Kept for reference; not used in the current glass layout.
 */
import { useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { GlassChip, GlassSelect, heading } from "./ui";

export default function FloorSelector() {
  const floors = useAppStore((s) => s.floors);
  const rooms = useAppStore((s) => s.rooms);
  const selectedFloor = useAppStore((s) => s.selectedFloor);
  const setSelectedFloor = useAppStore((s) => s.setSelectedFloor);

  const options = useMemo(() => {
    const sorted = [...floors].sort((a, b) => a.elevation - b.elevation);
    return [
      { id: null as string | null, label: `All floors (${rooms.length})` },
      ...sorted.map((f) => ({
        id: f.id as string | null,
        label: `${f.name} (${rooms.filter((r) => r.floorId === f.id).length})`,
      })),
    ];
  }, [floors, rooms]);

  if (floors.length === 0) {
    return (
      <p className={`${heading.muted} px-1 py-2`}>No floors loaded</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="md:hidden">
        <GlassSelect
          value={selectedFloor ?? ""}
          onChange={(e) =>
            setSelectedFloor(e.target.value === "" ? null : e.target.value)
          }
        >
          {options.map((o) => (
            <option key={o.id ?? "all"} value={o.id ?? ""}>
              {o.label}
            </option>
          ))}
        </GlassSelect>
      </div>
      <div className="hidden flex-wrap gap-1.5 md:flex">
        {options.map((o) => (
          <GlassChip
            key={o.id ?? "all"}
            active={selectedFloor === o.id}
            onClick={() => setSelectedFloor(o.id)}
          >
            {o.label}
          </GlassChip>
        ))}
      </div>
    </div>
  );
}
