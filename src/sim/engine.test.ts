import { describe, expect, it } from "vitest";
import { SimEngine, type DeliveryStage } from "./engine";

function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function runUntil(e: SimEngine, cond: () => boolean, maxSeconds = 300) {
  for (let i = 0; i < maxSeconds / 0.05; i++) {
    if (cond()) return true;
    e.step(0.05);
  }
  return cond();
}

describe("SKYMED GRID simulation", () => {
  it("has a fleet of exactly 12 drones", () => {
    const e = new SimEngine();
    expect(e.drones).toHaveLength(12);
    expect(e.drones[0]!.id).toBe("SG-01");
    expect(e.drones[11]!.id).toBe("SG-12");
  });

  it("runs a delivery through dispatch, pickup, transit, arrival and waits at OTP", () => {
    const e = new SimEngine({ random: seeded() });
    const m = e.startDelivery()!;
    expect(m.stage).toBe("dispatch");
    expect(runUntil(e, () => m.stage === "otp")).toBe(true);
    const seen = m.history.map((h) => h.stage);
    expect(seen).toEqual<DeliveryStage[]>(["dispatch", "pickup", "transit", "arrival", "otp"]);
    // Waits for the patient — never auto-delivers.
    for (let i = 0; i < 400; i++) e.step(0.05);
    expect(m.stage).toBe("otp");
  });

  it("rejects a wrong OTP and completes after the correct OTP + charging", () => {
    const e = new SimEngine({ random: seeded(3) });
    const m = e.startDelivery()!;
    runUntil(e, () => m.stage === "otp");
    const wrong = m.otp === "0000" ? "1111" : "0000";
    expect(e.verifyOtp(m.id, wrong)).toBe(false);
    expect(m.stage).toBe("otp");
    expect(e.verifyOtp(m.id, m.otp)).toBe(true);
    expect(m.stage).toBe("delivery");
    expect(runUntil(e, () => m.stage === "complete", 600)).toBe(true);
    expect(m.history.map((h) => h.stage).slice(5)).toEqual(["delivery", "return", "charging", "complete"]);
    expect(e.getDrone(m.droneId).battery).toBe(100);
  });

  it("freezes all motion while paused and continues on resume", () => {
    const e = new SimEngine();
    const m = e.startDelivery()!;
    for (let i = 0; i < 60; i++) e.step(0.05);
    e.pause();
    const d = e.getDrone(m.droneId);
    const before = { ...d.pos, battery: d.battery };
    for (let i = 0; i < 100; i++) e.step(0.05);
    expect({ ...d.pos, battery: d.battery }).toEqual(before);
    e.resume();
    for (let i = 0; i < 20; i++) e.step(0.05);
    expect(d.pos).not.toEqual({ x: before.x, y: before.y, z: before.z });
  });

  it("reset returns every drone to its pad and clears missions", () => {
    const e = new SimEngine();
    e.startDelivery();
    for (let i = 0; i < 200; i++) e.step(0.05);
    e.reset();
    expect(e.state).toBe("idle");
    expect(e.missions).toHaveLength(0);
    expect(e.drones.every((d) => d.task === "docked" && d.pos.y === d.pad.y)).toBe(true);
  });

  it("security mode puts 6 drones on patrol and raises detections pending human review", () => {
    const e = new SimEngine({ random: seeded(11) });
    e.setMode("security");
    e.start();
    expect(e.drones.filter((d) => d.task === "patrol")).toHaveLength(6);
    expect(runUntil(e, () => e.alerts.length > 0, 30)).toBe(true);
    expect(e.alerts[0]!.review).toBe("pending");
    e.reviewAlert(e.alerts[0]!.id, "dismissed");
    expect(e.alerts[0]!.review).toBe("dismissed");
  });
});
