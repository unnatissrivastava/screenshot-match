// three.js material colors for the 3D scene (WebGL can't read CSS tokens).
// Kept in sync by hand with the oklch tokens in src/styles.css.
export const P = {
  bgDay: "#0d1d33",
  bgNight: "#040a16",
  base: "#13243d",
  baseEdge: "#5fd4f0",
  ground: "#c7d2de",
  block: "#c2ccd8",
  road: "#2b3a52",
  lane: "#9fdcef",
  park: "#7fae8c",
  parkDark: "#5d8f6c",
  tree: "#4f8a62",
  trunk: "#7b6250",
  building: ["#e2e8ef", "#d3dbe5", "#c4cfdb", "#dbe2ea", "#b9c6d4"],
  house: ["#f1ebe3", "#e6ded3", "#dfe5ec", "#ece4ea"],
  roof: ["#5a6b85", "#6f5e57", "#486177", "#7a6a6a"],
  hospital: "#f4f7fa",
  hospitalAccent: "#e5484d",
  pharmacy: "#e9f2ec",
  pharmacyAccent: "#22a06b",
  hub: "#1b2e4a",
  pad: "#24406a",
  cyan: "#4fd8f5",
  amber: "#f5b94f",
  coral: "#ff6b5b",
  green: "#3ee08f",
  mint: "#9be8d6",
  slateBlue: "#8ea3c7",
  window: "#ffd98a",
  droneBody: "#f2f6fa",
  droneDark: "#1c2a3e",
};

export const TASK_COLOR: Record<string, string> = {
  delivery: P.cyan,
  patrol: P.amber,
  shuttle: P.mint,
  returning: P.slateBlue,
  charging: P.green,
  docked: P.slateBlue,
};

/** Shared, per-frame mutable visual state (night blend etc.). */
export const sceneFx = { night: 0 };
