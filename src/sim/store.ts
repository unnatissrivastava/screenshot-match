import { useEffect } from "react";
import { create } from "zustand";
import { SimEngine, type Alert, type Mission, type Mode, type SimEvent, type SimState, type DroneTask } from "./engine";

export interface DroneView {
  id: string;
  hubId: string;
  battery: number;
  task: DroneTask;
  status: string;
  missionId: string | null;
  carrying: boolean;
  airborne: boolean;
  patrolRouteId: string | null;
  routeVersion: number;
}

export interface Snapshot {
  state: SimState;
  mode: Mode;
  t: number;
  drones: DroneView[];
  missions: Mission[];
  events: SimEvent[];
  alerts: Alert[];
  focusMissionId: string | null;
  version: number;
}

let engineSingleton: SimEngine | null = null;
export function getEngine() {
  if (!engineSingleton) engineSingleton = new SimEngine();
  return engineSingleton;
}

function snapshot(e: SimEngine): Snapshot {
  return {
    state: e.state,
    mode: e.mode,
    t: e.t,
    drones: e.drones.map((d) => ({
      id: d.id,
      hubId: d.hubId,
      battery: d.battery,
      task: d.task,
      status: d.status,
      missionId: d.missionId,
      carrying: d.carrying,
      airborne: d.airborne,
      patrolRouteId: d.patrolRouteId,
      routeVersion: d.routeVersion,
    })),
    missions: e.missions.map((m) => ({ ...m, history: [...m.history] })),
    events: [...e.events],
    alerts: e.alerts.map((a) => ({ ...a })),
    focusMissionId: e.focusMissionId,
    version: e.version,
  };
}

interface Store {
  snap: Snapshot;
  publish: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setMode: (m: Mode) => void;
  startDelivery: () => void;
  verifyOtp: (missionId: string, code: string) => boolean;
  reviewAlert: (id: string, decision: "confirmed" | "dismissed") => void;
  focusMission: (id: string) => void;
}

export const useSim = create<Store>((set) => {
  const act = <T,>(fn: (e: SimEngine) => T) => {
    const e = getEngine();
    const r = fn(e);
    set({ snap: snapshot(e) });
    return r;
  };
  return {
    snap: snapshot(getEngine()),
    publish: () => set({ snap: snapshot(getEngine()) }),
    start: () => act((e) => e.start()),
    pause: () => act((e) => e.pause()),
    resume: () => act((e) => e.resume()),
    reset: () => act((e) => e.reset()),
    setMode: (m) => act((e) => e.setMode(m)),
    startDelivery: () => act((e) => e.startDelivery()),
    verifyOtp: (id, code) => act((e) => e.verifyOtp(id, code)),
    reviewAlert: (id, d) => act((e) => e.reviewAlert(id, d)),
    focusMission: (id) => act((e) => e.focusMission(id)),
  };
});

/** Drives the simulation from requestAnimationFrame and publishes UI snapshots at ~6 Hz. */
export function useSimLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastVersion = -1;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const e = getEngine();
      // Sub-step so long frames in slow browsers stay stable.
      let remaining = dt;
      while (remaining > 0) {
        const s = Math.min(remaining, 0.05);
        e.step(s);
        remaining -= s;
      }
      acc += dt;
      if (acc > 0.16 || e.version !== lastVersion) {
        acc = 0;
        lastVersion = e.version;
        useSim.getState().publish();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

export function formatSimTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `T+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
