import type { Band } from "../../draw/band.ts";
import type { Twist } from "../../draw/embed.ts";
import type { Point, SvgElement } from "../../draw/svg.ts";
import type { Theme } from "../../draw/themes.ts";
import type { PlacedCommit } from "../../style/view.ts";

export const PAD_STRAND = 0;
export const DEPTH_SWELL = 0.2;
const DEPTH_BUCKETS_PER_UNIT = 8;

export interface Board {
  readonly band: Band;
  readonly twist: Twist;
  readonly theme: Theme;
  readonly vertical: boolean;
  readonly inset: number;
  readonly casingWidth: number;
  readonly casingTrim: number;
}

export interface Painted {
  readonly depth: number;
  readonly strand: number;
  readonly element: SvgElement;
}

export const depthBucket = (depth: number): number => Math.round(depth * DEPTH_BUCKETS_PER_UNIT);

export const paintingOrder = (a: Painted, b: Painted): number =>
  depthBucket(a.depth) - depthBucket(b.depth) || Number(a.strand === PAD_STRAND) - Number(b.strand === PAD_STRAND) || a.strand - b.strand || a.depth - b.depth;

export const commitPlace = (band: Band, commit: PlacedCommit): Point => [band.alongAt(commit.timeFraction), band.acrossAt(commit.slot)];
