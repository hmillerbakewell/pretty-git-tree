export type Point = [number, number];
export type Attributes = Readonly<Record<string, string | number | null | undefined>>;

export interface SvgElement {
  readonly tag: string;
  readonly attributes: Attributes;
  readonly children: readonly SvgChild[];
}

export type SvgChild = SvgElement | string;

export const element = (tag: string, attributes: Attributes = {}, children: readonly SvgChild[] = []): SvgElement => ({ tag, attributes, children });

export const group = (attributes: Attributes, children: readonly SvgChild[]): SvgElement => element("g", attributes, children);

export const formatNumber = (v: number): string => String(Math.round(v * 100) / 100 || 0);

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (s: string) => escapeText(s).replace(/"/g, "&quot;");

const renderAttributes = (attributes: Attributes): string =>
  Object.entries(attributes)
    .flatMap(([name, value]) =>
      value === null || value === undefined ? [] : [` ${name}="${escapeAttribute(typeof value === "number" ? formatNumber(value) : value)}"`],
    )
    .join("");

const isText = (child: SvgChild): child is string => typeof child === "string";

export function renderSvg(child: SvgChild, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (isText(child)) return indent + escapeText(child);
  const opening = child.tag + renderAttributes(child.attributes);
  if (child.children.length === 0) return `${indent}<${opening}/>`;
  const texts = child.children.filter(isText);
  if (texts.length === child.children.length) return `${indent}<${opening}>${escapeText(texts.join(""))}</${child.tag}>`;
  const inner = child.children.map((grandchild) => renderSvg(grandchild, depth + 1)).join("\n");
  return `${indent}<${opening}>\n${inner}\n${indent}</${child.tag}>`;
}

export const svgDocument = (width: number, height: number, children: readonly SvgChild[]): SvgElement =>
  element("svg", { xmlns: "http://www.w3.org/2000/svg", width, height, viewBox: `0 0 ${width} ${height}` }, children);

export const polylinePath = (points: Point[]): string => points.map(([x, y], i) => `${i ? " L" : "M"}${formatNumber(x)},${formatNumber(y)}`).join("");
