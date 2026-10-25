// SKYMED GRID simulation engine. Pure TypeScript (no React / three.js) so it can
// be stepped by the browser animation loop and by unit tests alike.
// ALL telemetry, missions and detections produced here are SIMULATED.

import {
  CRUISE_ALT,
  HUBS,
  MEDICINES,
  PATIENT_HOMES,
  PATIENT_NAMES,
  PATROL_ROUTES,
  getLocation,
  landingPoint,
  padPosition,
  type Vec3,
} from "./city";

export type Mode = "healthcare" | "security";
export type SimState = "idle" | "running" | "paused";
export type DroneTask = "docked" | "charging" | "delivery" | "patrol" | "shuttle" | "returning";

export const DELIVERY_STAGES = [
  "dispatch",
  "pickup",
  "transit",
  "arrival",
  "otp",
  "delivery",
  "return",
  "charging",
] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number] | "complete";

export const STAGE_INFO: Record<DeliveryStage, { title: string; explain: string }> = {
  dispatch: {
    title: "Dispatch",
    explain:
      "Fleet manager picked the nearest charged drone. It runs pre-flight checks and lifts off toward the pharmacy.",
  },
  pickup: {
    title: "Pickup",
    explain:
      "Drone hovers over the pharmacy pad while staff load the sealed medicine box into the cargo bay.",
  },
  transit: {
    title: "In Transit",
    explain:
      "Medicine on board. The drone follows its waypoint corridor at cruise altitude to the patient's home.",
  },
  arrival: {
    title: "Arrival",
    explain: "Drone descends onto the patient's drop pad and holds position, rotors idling.",
  },
  otp: {
    title: "OTP Verification",
    explain:
      "Patient reads out the one-time code sent to their phone. The package is only released if the code matches.",
  },
  delivery: {
    title: "Delivered",
    explain: "Code verified. The cargo bay opens and the medicine is handed over to the patient.",
  },
  return: {
    title: "Return to Base",
    explain:
      "Mission done. The drone climbs back to cruise altitude and flies home to its charging pad.",
  },
  charging: {
    title: "Charging",
    explain: "Drone is docked on its pad and recharging so it's ready for the next mission.",
  },
  complete: {
    title: "Complete",
    explain: "Battery topped up. The drone is back in the available pool.",
  },
};

// ---- Tunable constants (simulated) ----
export const SPEED_CRUISE = 4.4; // units/s
export const SPEED_VERTICAL = 2.2;
export const DRAIN_FLY = 0.75; // %/s
export const DRAIN_HOVER = 0.35;
export const CHARGE_RATE = 7; // %/s
export const LOW_BATTERY = 25;
export const MIN_DISPATCH_BATTERY = 50;
export const PATROL_SLOTS_PER_ROUTE = 2;
export const SHUTTLE_COUNT = 2;
export const HOLD = {
  preflight: 1.2,
  pickup: 3,
  arrival: 1.5,
  delivery: 2.5,
  shuttleStop: 2,
} as const;

const INITIAL_BATTERY = [96, 88, 100, 74, 91, 63, 85, 99, 78, 92, 57, 81];

type HoldReason = "preflight" | "pickup" | "arrival" | "otp" | "delivery" | "shuttleStop" | null;

export interface Drone {
  id: string;
  hubId: string;
  padIndex: number;
  pad: Vec3;
  pos: Vec3;
  heading: number;
  battery: number;
  task: DroneTask;
  status: string;
  route: Vec3[];
  pathIdx: number;
  routeVersion: number;
  hold: number;
  holdReason: HoldReason;
  carrying: boolean;
  airborne: boolean;
  missionId: string | null;
  patrolRouteId: string | null;
  patrolSlot: number;
  patrolIdx: number;
  shuttleStops: string[];
  cruiseAlt: number;
}

export interface Mission {
  id: string;
  droneId: string;
  patientHomeId: string;
  patientName: string;
  medicine: string;
  otp: string;
  stage: DeliveryStage;
  history: Array<{ stage: DeliveryStage; t: number }>;
  otpAttempts: number;
  createdAt: number;
}

export type EventLevel = "info" | "success" | "warning" | "alert";
export interface SimEvent {
  id: number;
  t: number;
  level: EventLevel;
  text: string;
}

export type ReviewStatus = "pending" | "confirmed" | "dismissed";
export interface Alert {
  id: string;
  t: number;
  kind: string;
  label: string;
  locationId: string;
  pos: Vec3;
  confidence: number;
  droneId: string;
  review: ReviewStatus;
}

const ALERT_SAMPLES = [
  { kind: "Person", label: "Person loitering near pharmacy rear entrance", loc: "pharmacy" },
  { kind: "Vehicle", label: "Vehicle stopped in hospital ambulance lane", loc: "hospital" },
  { kind: "Heat signature", label: "Unusual heat signature on apartment rooftop", loc: "home-b" },
  { kind: "Unattended object", label: "Unattended bag beside charging hub", loc: "hub-a" },
  { kind: "Person", label: "Person crossing restricted service road", loc: "hub-b" },
  { kind: "Vehicle", label: "Vehicle idling in residential lane after hours", loc: "home-a" },
];

export interface EngineOptions {
  /** Deterministic RNG for tests. Defaults to Math.random. */
  random?: () => number;
}

function dist3(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export class SimEngine {
  state: SimState = "idle";
  mode: Mode = "healthcare";
  t = 0;
  drones: Drone[] = [];
  missions: Mission[] = [];
  events: SimEvent[] = [];
  alerts: Alert[] = [];
  focusMissionId: string | null = null;
  /** Bumps whenever something structural changes (routes, missions, alerts). */
  version = 0;

  private rand: () => number;
  private eventSeq = 0;
  private missionSeq = 1040;
  private alertSeq = 100;
  private alertTimer = 4;
  private alertSampleIdx = 0;
  private homeIdx = 0;

  constructor(opts: EngineOptions = {}) {
    this.rand = opts.random ?? Math.random;
    this.reset(true);
  }

  // ---------------------------------------------------------------- controls
  reset(silent = false) {
    this.state = "idle";
    this.t = 0;
    this.missions = [];
    this.alerts = [];
    this.events = [];
    this.focusMissionId = null;
    this.alertTimer = 4;
    this.alertSampleIdx = 0;
    this.homeIdx = 0;
    this.drones = Array.from({ length: 12 }, (_, i) => {
      const hub = HUBS[Math.floor(i / 4)]!;
      const pad = padPosition(hub.id, i % 4);
      return {
        id: `SG-${String(i + 1).padStart(2, "0")}`,
        hubId: hub.id,
        padIndex: i % 4,
        pad,
        pos: { ...pad },
        heading: Math.PI * 0.25 * (i % 4),
        battery: INITIAL_BATTERY[i]!,
        task: "docked",
        status: "Docked · ready",
        route: [],
        pathIdx: 0,
        routeVersion: 0,
        hold: 0,
        holdReason: null,
        carrying: false,
        airborne: false,
        missionId: null,
        patrolRouteId: null,
        patrolSlot: 0,
        patrolIdx: 0,
        shuttleStops: [],
        cruiseAlt: CRUISE_ALT + (i % 4) * 0.35,
      } satisfies Drone;
    });
    this.version++;
    if (!silent)
      this.log("info", "Simulation reset — all 12 drones docked at their charging hubs.");
  }

  start() {
    if (this.state === "running") return;
    if (this.state === "paused") return this.resume();
    this.state = "running";
    this.log(
      "info",
      `Simulation started in ${this.mode === "healthcare" ? "Healthcare" : "Security patrol"} mode.`,
    );
    this.maintainAmbient();
    this.version++;
  }

  pause() {
    if (this.state !== "running") return;
    this.state = "paused";
    this.log("warning", "Simulation paused — all drones frozen in place.");
    this.version++;
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "running";
    this.log("info", "Simulation resumed.");
    this.version++;
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.log(
      "info",
      mode === "security"
        ? "Switched to night-time security patrol. City lights dimmed, navigation lights on."
        : "Switched to daytime healthcare mode. Patrol drones returning to base.",
    );
    for (const d of this.drones) {
      if (mode === "security" && d.task === "shuttle")
        this.sendHome(d, "Shuttle ended · returning");
      if (mode === "healthcare" && d.task === "patrol")
        this.sendHome(d, "Patrol ended · returning");
    }
    if (mode === "security") this.alertTimer = 4;
    if (this.state === "running") this.maintainAmbient();
    this.version++;
  }

  /** Dispatch a medicine delivery. Returns the mission or null if no drone is available. */
  startDelivery(): Mission | null {
    if (this.state === "idle") this.start();
    else if (this.state === "paused") this.resume();

    const pharmacy = landingPoint("pharmacy");
    const candidates = this.drones
      .filter(
        (d) => (d.task === "docked" || d.task === "charging") && d.battery >= MIN_DISPATCH_BATTERY,
      )
      .sort((a, b) => dist3(a.pos, pharmacy) - dist3(b.pos, pharmacy) || b.battery - a.battery);
    const drone = candidates[0];
    if (!drone) {
      this.log(
        "warning",
        "No drone available with enough battery — try again once one finishes charging.",
      );
      this.version++;
      return null;
    }
    const home = PATIENT_HOMES[this.homeIdx % PATIENT_HOMES.length]!;
    const mission: Mission = {
      id: `MED-${++this.missionSeq}`,
      droneId: drone.id,
      patientHomeId: home.id,
      patientName: PATIENT_NAMES[this.homeIdx % PATIENT_NAMES.length]!,
      medicine: MEDICINES[this.homeIdx % MEDICINES.length]!,
      otp: String(1000 + Math.floor(this.rand() * 9000)),
      stage: "dispatch",
      history: [{ stage: "dispatch", t: this.t }],
      otpAttempts: 0,
      createdAt: this.t,
    };
    this.homeIdx++;
    this.missions.unshift(mission);
    this.focusMissionId = mission.id;

    drone.task = "delivery";
    drone.missionId = mission.id;
    drone.route = [];
    drone.hold = HOLD.preflight;
    drone.holdReason = "preflight";
    drone.airborne = true;
    drone.status = "Pre-flight checks";
    this.log(
      "info",
      `${mission.id}: ${drone.id} dispatched for ${mission.medicine} → ${home.short}.`,
    );
    this.version++;
    return mission;
  }

  /** Demo OTP check. Returns true when the code matches and the package is released. */
  verifyOtp(missionId: string, code: string): boolean {
    const m = this.missions.find((x) => x.id === missionId);
    if (!m || m.stage !== "otp") return false;
    m.otpAttempts++;
    if (code.trim() !== m.otp) {
      this.log(
        "warning",
        `${m.id}: OTP mismatch (attempt ${m.otpAttempts}). Package stays locked.`,
      );
      this.version++;
      return false;
    }
    const d = this.getDrone(m.droneId);
    this.setStage(m, "delivery");
    d.hold = HOLD.delivery;
    d.holdReason = "delivery";
    d.status = "Releasing package";
    this.log("success", `${m.id}: OTP verified ✓ — releasing medicine to ${m.patientName}.`);
    this.version++;
    return true;
  }

  reviewAlert(alertId: string, decision: "confirmed" | "dismissed") {
    const a = this.alerts.find((x) => x.id === alertId);
    if (!a || a.review !== "pending") return;
    a.review = decision;
    this.log(
      decision === "confirmed" ? "alert" : "info",
      decision === "confirmed"
        ? `${a.id}: Operator confirmed "${a.kind}" — ground team notified (simulated).`
        : `${a.id}: Operator marked "${a.kind}" as false positive.`,
    );
    this.version++;
  }

  focusMission(id: string) {
    this.focusMissionId = id;
    this.version++;
  }

  getDrone(id: string) {
    const d = this.drones.find((x) => x.id === id);
    if (!d) throw new Error(`Unknown drone ${id}`);
    return d;
  }

  // ---------------------------------------------------------------- tick
  step(rawDt: number) {
    if (this.state !== "running") return;
    const dt = Math.min(rawDt, 0.05);
    this.t += dt;

    for (const d of this.drones) this.stepDrone(d, dt);

    if (this.mode === "security") {
      this.alertTimer -= dt;
      if (this.alertTimer <= 0) {
        this.spawnAlert();
        this.alertTimer = 10 + this.rand() * 5;
      }
    }

    this.maintainAmbient();
  }

  private stepDrone(d: Drone, dt: number) {
    // Charging on pad
    if (d.task === "charging") {
      d.battery = Math.min(100, d.battery + CHARGE_RATE * dt);
      d.status = `Charging ${Math.round(d.battery)}%`;
      if (d.battery >= 100) {
        d.task = "docked";
        d.status = "Docked · ready";
        const m = d.missionId ? this.missions.find((x) => x.id === d.missionId) : null;
        if (m && m.stage === "charging") {
          this.setStage(m, "complete");
          this.log("success", `${m.id}: complete. ${d.id} fully charged and available.`);
          d.missionId = null;
        }
        this.version++;
      }
      return;
    }
    if (d.task === "docked") return;

    // Holding (hover / landed actions)
    if (d.holdReason) {
      if (d.holdReason === "otp") return; // landed, waiting for the patient
      d.battery = Math.max(0, d.battery - DRAIN_HOVER * dt);
      d.hold -= dt;
      if (d.hold <= 0) this.onHoldDone(d);
      return;
    }

    // Flying along route
    if (d.pathIdx < d.route.length) {
      d.battery = Math.max(0, d.battery - DRAIN_FLY * dt);
      const target = d.route[d.pathIdx]!;
      const dx = target.x - d.pos.x;
      const dy = target.y - d.pos.y;
      const dz = target.z - d.pos.z;
      const horiz = Math.hypot(dx, dz);
      const dist = Math.hypot(horiz, dy);
      const speed = Math.abs(dy) > horiz ? SPEED_VERTICAL : SPEED_CRUISE;
      const stepLen = speed * dt;
      if (horiz > 0.05) d.heading = lerpAngle(d.heading, Math.atan2(dx, dz), 1 - Math.exp(-5 * dt));
      if (dist <= stepLen) {
        d.pos = { ...target };
        d.pathIdx++;
        if (d.pathIdx >= d.route.length) this.onArrive(d);
      } else {
        d.pos.x += (dx / dist) * stepLen;
        d.pos.y += (dy / dist) * stepLen;
        d.pos.z += (dz / dist) * stepLen;
      }
      if (d.task === "patrol" && d.battery < LOW_BATTERY) {
        this.log(
          "warning",
          `${d.id}: battery low (${Math.round(d.battery)}%) — leaving patrol to recharge.`,
        );
        this.sendHome(d, "Low battery · returning");
      }
    }
  }

  private onHoldDone(d: Drone) {
    const reason = d.holdReason;
    d.holdReason = null;
    d.hold = 0;
    const m = d.missionId ? this.missions.find((x) => x.id === d.missionId) : null;

    if (reason === "preflight" && m) {
      d.status = "En route to pharmacy";
      this.flyTo(d, landingPoint("pharmacy"));
    } else if (reason === "pickup" && m) {
      d.carrying = true;
      this.setStage(m, "transit");
      d.status = `Carrying ${m.medicine}`;
      this.log(
        "info",
        `${m.id}: medicine loaded. ${d.id} heading to ${getLocation(m.patientHomeId).short}.`,
      );
      this.flyTo(d, landingPoint(m.patientHomeId));
    } else if (reason === "arrival" && m) {
      this.setStage(m, "otp");
      d.holdReason = "otp";
      d.airborne = false;
      d.status = "Awaiting patient OTP";
      this.log("info", `${m.id}: landed. Waiting for ${m.patientName} to confirm the OTP.`);
    } else if (reason === "delivery" && m) {
      d.carrying = false;
      this.setStage(m, "return");
      this.log(
        "success",
        `${m.id}: medicine delivered to ${m.patientName}. ${d.id} returning to base.`,
      );
      d.airborne = true;
      this.flyTo(d, d.pad);
      d.task = "delivery";
      d.status = "Returning to base";
    } else if (reason === "shuttleStop") {
      this.nextShuttleLeg(d);
    }
    this.version++;
  }

  private onArrive(d: Drone) {
    const m = d.missionId ? this.missions.find((x) => x.id === d.missionId) : null;
    if (d.task === "delivery" && m) {
      if (m.stage === "dispatch") {
        this.setStage(m, "pickup");
        d.hold = HOLD.pickup;
        d.holdReason = "pickup";
        d.status = "Collecting medicine";
        this.log("info", `${m.id}: ${d.id} at CarePlus Pharmacy — collecting medicine.`);
      } else if (m.stage === "transit") {
        this.setStage(m, "arrival");
        d.hold = HOLD.arrival;
        d.holdReason = "arrival";
        d.status = "Landing at patient home";
      } else if (m.stage === "return") {
        this.setStage(m, "charging");
        this.dock(d);
        this.log("info", `${m.id}: ${d.id} docked at ${getLocation(d.hubId).short}, charging.`);
      }
    } else if (d.task === "patrol") {
      const route = PATROL_ROUTES.find((r) => r.id === d.patrolRouteId)!;
      d.patrolIdx = (d.patrolIdx + 1) % route.points.length;
      const [x, z] = route.points[d.patrolIdx]!;
      this.setRoute(d, [{ x, y: route.alt, z }]);
    } else if (d.task === "shuttle") {
      d.hold = HOLD.shuttleStop;
      d.holdReason = "shuttleStop";
      const stop = d.shuttleStops[0];
      d.status = stop ? `Lab samples · ${getLocation(stop).short}` : "Shuttle stop";
    } else if (d.task === "returning") {
      this.dock(d);
    }
    this.version++;
  }

  private dock(d: Drone) {
    d.pos = { ...d.pad };
    d.route = [];
    d.pathIdx = 0;
    d.routeVersion++;
    d.airborne = false;
    d.patrolRouteId = null;
    d.task = "charging";
    d.status = `Charging ${Math.round(d.battery)}%`;
  }

  private nextShuttleLeg(d: Drone) {
    d.shuttleStops.shift();
    const next = d.shuttleStops[0];
    if (next) {
      d.status = `Shuttle → ${getLocation(next).short}`;
      this.flyTo(d, landingPoint(next));
    } else {
      d.task = "returning";
      d.status = "Shuttle done · returning";
      this.flyTo(d, d.pad);
    }
  }

  private sendHome(d: Drone, status: string) {
    d.task = "returning";
    d.status = status;
    d.holdReason = null;
    d.hold = 0;
    d.patrolRouteId = null;
    this.flyTo(d, d.pad);
    this.version++;
  }

  private setStage(m: Mission, stage: DeliveryStage) {
    m.stage = stage;
    m.history.push({ stage, t: this.t });
  }

  /** Waypoint path: climb → cruise → descend. */
  private flyTo(d: Drone, target: Vec3) {
    const alt = d.cruiseAlt;
    const pts: Vec3[] = [];
    if (d.pos.y < alt - 0.1) pts.push({ x: d.pos.x, y: alt, z: d.pos.z });
    pts.push({ x: target.x, y: alt, z: target.z });
    pts.push({ ...target });
    this.setRoute(d, pts);
  }

  private setRoute(d: Drone, pts: Vec3[]) {
    d.route = [{ ...d.pos }, ...pts];
    d.pathIdx = 1;
    d.routeVersion++;
    d.airborne = true;
  }

  private available(minBattery: number) {
    return this.drones
      .filter((d) => (d.task === "docked" || d.task === "charging") && d.battery >= minBattery)
      .sort((a, b) => b.battery - a.battery);
  }

  /** Keeps background activity alive: supply shuttles by day, patrols by night. */
  private maintainAmbient() {
    if (this.state !== "running") return;
    if (this.mode === "healthcare") {
      const active = this.drones.filter((d) => d.task === "shuttle").length;
      // Leave a reserve so a medicine delivery can always be dispatched.
      for (let i = active; i < SHUTTLE_COUNT; i++) {
        const pool = this.available(75);
        if (pool.length <= 3) break;
        const d = pool[0]!;
        d.task = "shuttle";
        d.shuttleStops = ["hospital", "pharmacy"];
        d.status = "Shuttle → Hospital";
        this.flyTo(d, landingPoint("hospital"));
        this.log("info", `${d.id}: lab-sample shuttle between Hospital and Pharmacy.`);
        this.version++;
      }
    } else {
      for (const route of PATROL_ROUTES) {
        for (let slot = 0; slot < PATROL_SLOTS_PER_ROUTE; slot++) {
          const taken = this.drones.some(
            (d) => d.task === "patrol" && d.patrolRouteId === route.id && d.patrolSlot === slot,
          );
          if (taken) continue;
          const pool = this.available(60);
          if (pool.length <= 2) return;
          const d = pool[0]!;
          d.task = "patrol";
          d.patrolRouteId = route.id;
          d.patrolSlot = slot;
          d.patrolIdx = (slot * 2) % route.points.length;
          d.status = `Patrol · ${route.name}`;
          const [x, z] = route.points[d.patrolIdx]!;
          this.setRoute(d, [
            { x: d.pos.x, y: route.alt, z: d.pos.z },
            { x, y: route.alt, z },
          ]);
          this.log("info", `${d.id}: patrolling ${route.name}.`);
          this.version++;
        }
      }
    }
  }

  private spawnAlert() {
    const patrols = this.drones.filter((d) => d.task === "patrol");
    if (!patrols.length) return;
    if (this.alerts.filter((a) => a.review === "pending").length >= 4) return;
    const sample = ALERT_SAMPLES[this.alertSampleIdx % ALERT_SAMPLES.length]!;
    this.alertSampleIdx++;
    const loc = getLocation(sample.loc);
    const pos = { x: loc.x + (this.rand() - 0.5) * 2, y: 0.05, z: loc.z + (this.rand() - 0.5) * 2 };
    const nearest = [...patrols].sort((a, b) => dist3(a.pos, pos) - dist3(b.pos, pos))[0]!;
    const alert: Alert = {
      id: `A-${++this.alertSeq}`,
      t: this.t,
      kind: sample.kind,
      label: sample.label,
      locationId: loc.id,
      pos,
      confidence: Math.round(62 + this.rand() * 32),
      droneId: nearest.id,
      review: "pending",
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 12) this.alerts.length = 12;
    this.log(
      "alert",
      `${alert.id}: SAMPLE detection "${alert.kind}" by ${nearest.id} near ${loc.short} — needs human review.`,
    );
    this.version++;
  }

  private log(level: EventLevel, text: string) {
    this.events.unshift({ id: ++this.eventSeq, t: this.t, level, text });
    if (this.events.length > 40) this.events.length = 40;
  }
}
