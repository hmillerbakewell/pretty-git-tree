import type { RibbonBand } from "./surface.ts";

type RoundDiskPosition = [edge: number, along: number, order: number];

const roundDiskPosition = (end: RibbonBand["ends"][number]): RoundDiskPosition =>
  end.onHighEdge ? [1, -end.timeFraction, -end.order] : [0, end.timeFraction, end.order];

const comparePositions = (a: RoundDiskPosition, b: RoundDiskPosition) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function dartsRoundEachDisk(diskCount: number, bands: readonly RibbonBand[]): number[][] {
  const around = Array.from({ length: diskCount }, (): { dart: number; position: RoundDiskPosition }[] => []);
  bands.forEach((band, bandIndex) => {
    band.ends.forEach((end, side) => {
      around[end.disk].push({ dart: 2 * bandIndex + side, position: roundDiskPosition(end) });
    });
  });
  return around.map((darts) => darts.sort((a, b) => comparePositions(a.position, b.position)).map(({ dart }) => dart));
}

function nextDartRoundDisk(roundEachDisk: readonly (readonly number[])[], dartCount: number): number[] {
  const next = new Array<number>(dartCount).fill(0);
  for (const darts of roundEachDisk) {
    darts.forEach((dart, position) => {
      next[dart] = darts[(position + 1) % darts.length];
    });
  }
  return next;
}

function orbitCount(nextRoundDisk: readonly number[]): number {
  const seen = new Uint8Array(nextRoundDisk.length);
  let orbits = 0;
  for (let start = 0; start < seen.length; start++) {
    if (seen[start]) continue;
    orbits++;
    for (let dart = start; !seen[dart]; dart = nextRoundDisk[dart ^ 1]) seen[dart] = 1;
  }
  return orbits;
}

export function boundaryCircles(diskCount: number, bands: readonly RibbonBand[]): number {
  const roundEachDisk = dartsRoundEachDisk(diskCount, bands);
  const bareDisks = roundEachDisk.filter((darts) => darts.length === 0).length;
  return bareDisks + orbitCount(nextDartRoundDisk(roundEachDisk, 2 * bands.length));
}

export function connectedComponents(diskCount: number, bands: readonly RibbonBand[]): number {
  const representative = Array.from({ length: diskCount }, (_, index) => index);
  const find = (disk: number): number => {
    let root = disk;
    while (representative[root] !== root) root = representative[root];
    representative[disk] = root;
    return root;
  };
  for (const band of bands) representative[find(band.ends[0].disk)] = find(band.ends[1].disk);
  return representative.filter((_, index) => find(index) === index).length;
}
