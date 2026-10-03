import { BOX_SIZES, Cabinet, StorageRow } from "../models";
import { storageRowFor } from "./location";

// What "make this container bigger" means, per kind of storage:
//   bin   — a bulk bin: its capacity goes up by N places.
//   box   — a row of wine boxes: one more box is added (its capacity is the sum
//           of its boxes, so a box row cannot just be given N places).
//   depth — a grid slot: a slot holds `cabinet.depth` bottles and the depth is
//           shared by every slot of the rack, so the whole rack gets deeper.
// The bottom zone has no limit, so it never comes up here.
export type GrowKind = "bin" | "box" | "depth";

// Mirrors MAX_RACK_DEPTH in the backend's const.py.
export const MAX_RACK_DEPTH = 20;

export function growKind(cabinet: Cabinet | undefined | null, zone: string): GrowKind | null {
  if (!cabinet) return null;
  if (!zone) return "depth";
  if (zone === "bottom") return null;
  const sr = storageRowFor(cabinet, zone);
  if (!sr) return null;
  return sr.type === "box" ? "box" : "bin";
}

export function zoneLabel(sr: StorageRow | undefined): string {
  return sr?.name || (sr?.type === "box" ? "This box" : "This bin");
}

// The smallest standard box that covers what is missing, else the biggest one.
export function defaultBoxSize(needed: number): number {
  return BOX_SIZES.find((size) => size >= needed) ?? BOX_SIZES[BOX_SIZES.length - 1];
}
