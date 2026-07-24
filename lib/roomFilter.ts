import type { Room } from "./types";

export type RoomFilter = {
  minHeat?: number;
  maxHeat?: number;
  temperatures?: number[];
} | null;

export function roomPassesFilter(room: Room, filter: RoomFilter): boolean {
  if (!filter) return true;
  if (filter.minHeat != null && room.heatLoad < filter.minHeat) return false;
  if (filter.maxHeat != null && room.heatLoad > filter.maxHeat) return false;
  if (filter.temperatures?.length) {
    const ok = filter.temperatures.some(
      (t) => Math.abs(room.temperature - t) < 0.51,
    );
    if (!ok) return false;
  }
  return true;
}
