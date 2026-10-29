import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "tests", "scripts", "vite.config.ts"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const REGEX_CAN_FOLLOW = new Set([..."(,=:[!&|?{};+-*%~^<>", ""]);
const REGEX_CAN_FOLLOW_WORDS = new Set(["return", "typeof", "case", "in", "of", "void", "yield", "await"]);

interface CommentFound {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return SOURCE_FILE.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => (entry === "node_modules" || entry === "examples" ? [] : sourceFiles(join(path, entry))));
}

const lineAt = (source: string, offset: number) => source.slice(0, offset).split("\n").length;

function previousToken(source: string, offset: number): string {
  const before = source.slice(0, offset).trimEnd();
  const word = /[A-Za-z_$][\w$]*$/.exec(before)?.[0];
  return word ?? before.slice(-1);
}

const regexMayStartAt = (source: string, offset: number) => {
  const token = previousToken(source, offset);
  return REGEX_CAN_FOLLOW.has(token) || REGEX_CAN_FOLLOW_WORDS.has(token);
};

function skipQuoted(source: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < source.length && source[index] !== quote) index += source[index] === "\\" ? 2 : 1;
  return index + 1;
}

function skipRegex(source: string, start: number): number {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length && (inCharacterClass || source[index] !== "/") && source[index] !== "\n") {
    if (source[index] === "\\") index += 1;
    else if (source[index] === "[") inCharacterClass = true;
    else if (source[index] === "]") inCharacterClass = false;
    index += 1;
  }
  return index + 1;
}

function skipTemplate(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length && source[index] !== "`") {
    if (source[index] === "\\") index += 2;
    else if (source.startsWith("${", index)) index = skipCode(source, index + 2, "}").end + 1;
    else index += 1;
  }
  return index + 1;
}

function commentEndingAfter(source: string, start: number): number | undefined {
  if (source.startsWith("//", start)) {
    const lineEnd = source.indexOf("\n", start);
    return lineEnd === -1 ? source.length : lineEnd;
  }
  if (source.startsWith("/*", start)) {
    const blockEnd = source.indexOf("*/", start);
    return blockEnd === -1 ? source.length : blockEnd + 2;
  }
  return undefined;
}

function skipToken(source: string, index: number): number {
  const character = source[index];
  if (character === '"' || character === "'") return skipQuoted(source, index, character);
  if (character === "`") return skipTemplate(source, index);
  if (character === "/" && regexMayStartAt(source, index)) return skipRegex(source, index);
  return index + 1;
}

const braceDepthChange = (character: string | undefined) => (character === "{" ? 1 : character === "}" ? -1 : 0);

function skipCode(source: string, start: number, closing: string | null, file = ""): { end: number; comments: CommentFound[] } {
  const comments: CommentFound[] = [];
  let depth = 0;
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (closing && character === closing && depth === 0) return { end: index, comments };
    depth += braceDepthChange(character);
    const commentEnd = commentEndingAfter(source, index);
    if (commentEnd === undefined) {
      index = skipToken(source, index);
      continue;
    }
    comments.push({ file, line: lineAt(source, index), text: source.slice(index, commentEnd).split("\n")[0] ?? "" });
    index = commentEnd;
  }
  return { end: index, comments };
}

const commentsIn = (file: string): CommentFound[] => skipCode(readFileSync(file, "utf8"), 0, null, file).comments;

const found = ROOTS.flatMap(sourceFiles).flatMap(commentsIn);
for (const { file, line, text } of found) console.log(`${file}:${line}  ${text.trim().slice(0, 100)}`);
console.log(found.length ? `${found.length} comments` : "no comments");
process.exitCode = found.length ? 1 : 0;
