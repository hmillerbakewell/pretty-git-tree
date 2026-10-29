export interface Theme {
  name: string;
  background: string;
  backgroundEdge: string;
  grid: string;
  ink: string;
  muted: string;
  palette: string[];
  glow: boolean;
  fontMono: string;
  fontSans: string;
}

const FONT_MONO = "JetBrains Mono, SF Mono, Menlo, Consolas, monospace";
const FONT_SANS = "Inter, SF Pro Display, Helvetica Neue, Arial, sans-serif";

export const laneColour = (theme: Theme, colourIndex: number): string => theme.palette[colourIndex % theme.palette.length];

export const THEMES: Record<string, Theme> = {
  midnight: {
    name: "midnight",
    background: "#0f1a2b",
    backgroundEdge: "#070d17",
    grid: "#1f2d44",
    ink: "#e8eef7",
    muted: "#7d8ca3",
    palette: ["#ffd166", "#4cc9f0", "#f72585", "#80ed99", "#b388ff", "#ff9e40", "#2ec4b6"],
    glow: true,
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
  },
  pcb: {
    name: "pcb",
    background: "#0b3d2e",
    backgroundEdge: "#052219",
    grid: "#14553f",
    ink: "#f4e9c8",
    muted: "#8fbfa8",
    palette: ["#e9c46a", "#f4a261", "#e76f51", "#a8dadc", "#f1faee", "#cdb4db"],
    glow: true,
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
  },
  paper: {
    name: "paper",
    background: "#f7f3ea",
    backgroundEdge: "#ece5d6",
    grid: "#e2d9c6",
    ink: "#1d1b16",
    muted: "#7a7262",
    palette: ["#1d3557", "#e63946", "#2a9d8f", "#e9a03b", "#6d597a", "#457b9d"],
    glow: false,
    fontMono: FONT_MONO,
    fontSans: FONT_SANS,
  },
};
export const DEFAULT_THEME = "midnight";

export const SERIF = "Georgia, Times New Roman, serif";
