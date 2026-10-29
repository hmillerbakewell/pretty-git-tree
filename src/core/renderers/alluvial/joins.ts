import type { Channels } from "./channels.ts";
import { curve, type Sample } from "./samples.ts";

export const edgeFacing = ([, across, ribbonWidth]: Sample, towards: number, width: number): number =>
  across + Math.sign(towards - across) * Math.max(0, ribbonWidth / 2 - width / 2);

export const bankFacing = ([, across, ribbonWidth]: Sample, towards: number, width: number): number =>
  across + Math.sign(towards - across) * (ribbonWidth / 2 + width / 2);

const bendAlong = (channels: Channels, start: Sample, end: Sample): number => Math.min(Math.max(end[0] - start[0], 0), channels.bendLength(end[1] - start[1]));

export function forkJoin(channels: Channels, parent: Sample, child: Sample, width: number): Sample[] {
  const start: Sample = [parent[0], edgeFacing(parent, child[1], width), width];
  const end: Sample = [child[0], child[1], width];
  const bentBy = start[0] + bendAlong(channels, start, end);
  return [...curve(start, [bentBy, end[1], width], channels.curveSpacing), end];
}

export function mergeJoin(channels: Channels, parent: Sample, child: Sample, width: number): Sample[] {
  const start: Sample = [parent[0], parent[1], width];
  const end: Sample = [child[0], edgeFacing(child, parent[1], width), width];
  const bendsFrom = end[0] - bendAlong(channels, start, end);
  return [start, ...curve([bendsFrom, start[1], width], end, channels.curveSpacing)];
}
