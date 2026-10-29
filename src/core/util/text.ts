export const pluralOf = (word: string): string => (word.endsWith("ch") ? `${word}es` : `${word}s`);

export const plural = (count: number, word: string): string => `${count} ${count === 1 ? word : pluralOf(word)}`;
