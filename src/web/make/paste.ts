import { useEffect } from "preact/hooks";
import { formatLog, parseLog } from "../../core/index.ts";

export type PasteSource = "paste" | "drop" | "file";

export const cleanLog = (text: string): string => formatLog(parseLog(text));

export const hasCommits = (text: string): boolean => parseLog(text).commits.length > 0;

export function pasteSourceOf(inputType: string | undefined): PasteSource | undefined {
  if (inputType === "insertFromPaste") return "paste";
  if (inputType === "insertFromDrop") return "drop";
  return undefined;
}

const UTF16_LITTLE_ENDIAN_MARK = [0xff, 0xfe];
const UTF16_BIG_ENDIAN_MARK = [0xfe, 0xff];

const startsWith = (bytes: Uint8Array, mark: readonly number[]) => mark.every((byte, index) => bytes[index] === byte);

export async function readTextFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (startsWith(bytes, UTF16_LITTLE_ENDIAN_MARK)) return new TextDecoder("utf-16le").decode(bytes);
  if (startsWith(bytes, UTF16_BIG_ENDIAN_MARK)) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

const isTypingTarget = (target: EventTarget | null) => target instanceof Element && target.closest("input, textarea") !== null;

export function usePasteAnywhere(onLog: (text: string) => void): void {
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const text = event.clipboardData?.getData("text/plain");
      if (!text || !hasCommits(text)) return;
      event.preventDefault();
      onLog(text);
    };
    addEventListener("paste", onPaste);
    return () => removeEventListener("paste", onPaste);
  });
}
