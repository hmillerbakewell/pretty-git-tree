export const consecutivePairs = <T>(items: readonly T[]): [previous: T, next: T][] => items.slice(1).map((next, index) => [items[index], next]);
