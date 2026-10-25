// Static layout of the SKYMED GRID miniature city. Pure data — no React, no three.js.

export type Vec3 = { x: number; y: number; z: number };

export type LocationKind = "hospital" | "pharmacy" | "residential" | "hub";

export interface CityLocation {
  id: string;
  name: string;
  short: string;
  kind: LocationKind;
  /** Landing / marker point */
  x: number;
  z: number;
  landY: number;
}

export const CRUISE_ALT = 7;
export const PAD_Y = 0.42;

export const LOCATIONS: CityLocation[] = [
  { id: "hospital", name: "City General Hospital", short: "Hospital", kind: "hospital", x: -12, z: -12, landY: 4.35 },
  { id: "pharmacy", name: "CarePlus Pharmacy · Pickup Pad", short: "Pharmacy", kind: "pharmacy", x: 12, z: -9.2, landY: 0.3 },
  { id: "home-a", name: "Maple Residency · Patient Home", short: "Maple Residency", kind: "residential", x: 10.2, z: 10.2, landY: 0.3 },
  { id: "home-b", name: "Lotus Apartments · Patient Home", short: "Lotus Apartments", kind: "residential", x: -12, z: 12, landY: 3.55 },
  { id: "home-c", name: "Cedar Court · Patient Home", short: "Cedar Court", kind: "residential", x: 1.8, z: 10.6, landY: 0.3 },
  { id: "hub-a", name: "Charging Hub Alpha", short: "Hub Alpha", kind: "hub", x: 0, z: -1, landY: PAD_Y },
  { id: "hub-b", name: "Charging Hub Beta", short: "Hub Beta", kind: "hub", x: 12, z: 0.5, landY: PAD_Y },
  { id: "hub-c", name: "Charging Hub Gamma", short: "Hub Gamma", kind: "hub", x: -12, z: 0.5, landY: PAD_Y },
];

export const PATIENT_HOMES = LOCATIONS.filter((l) => l.kind === "residential");
export const HUBS = LOCATIONS.filter((l) => l.kind === "hub");

export function getLocation(id: string): CityLocation {
  const loc = LOCATIONS.find((l) => l.id === id);
  if (!loc) throw new Error(`Unknown location ${id}`);
  return loc;
}

export function landingPoint(id: string): Vec3 {
  const l = getLocation(id);
  return { x: l.x, y: l.landY, z: l.z };
}

/** 4 charging pads per hub (2×2). */
export const PAD_OFFSETS: Array<[number, number]> = [
  [-0.85, -0.85],
  [0.85, -0.85],
  [-0.85, 0.85],
  [0.85, 0.85],
];

export function padPosition(hubId: string, padIndex: number): Vec3 {
  const hub = getLocation(hubId);
  const [ox, oz] = PAD_OFFSETS[padIndex % 4]!;
  return { x: hub.x + ox, y: PAD_Y, z: hub.z + oz };
}

export interface PatrolRoute {
  id: string;
  name: string;
  alt: number;
  points: Array<[number, number]>;
}

export const PATROL_ROUTES: PatrolRoute[] = [
  { id: "perimeter", name: "City perimeter", alt: 8.2, points: [[-16.5, -16.5], [16.5, -16.5], [16.5, 16.5], [-16.5, 16.5]] },
  { id: "medical", name: "Medical corridor", alt: 7.4, points: [[-12, -6], [12, -6], [12, -15], [-12, -15]] },
  { id: "residential", name: "Residential watch", alt: 6.8, points: [[-15, 6], [15, 6], [15, 15.5], [-15, 15.5]] },
];

export const MEDICINES = [
  "Insulin pen kit",
  "Amoxicillin 500mg",
  "Asthma inhaler",
  "Paracetamol + ORS pack",
  "Cardiac meds refill",
  "Blood-pressure tablets",
];

export const PATIENT_NAMES = ["R. Sharma", "A. Mehta", "S. Iyer", "K. Das", "P. Nair", "M. Khan"];
