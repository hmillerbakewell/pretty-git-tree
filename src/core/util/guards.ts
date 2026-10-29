export const isOneOf = <T extends string>(choices: readonly T[], value: unknown): value is T => choices.some((choice) => choice === value);
