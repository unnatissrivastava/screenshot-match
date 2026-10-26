import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { getDeliveryCameraFocus, updateCinematicCamera } from "./camera-follow";

describe("cinematic camera follow", () => {
  it("frames the drone and the relevant location at each delivery stage", () => {
    const drone = new THREE.Vector3(1, 2, 3);
    const pickup = new THREE.Vector3(5, 6, 7);
    const destination = new THREE.Vector3(9, 10, 11);
    const hub = new THREE.Vector3(-1, 0, -3);
    const target = new THREE.Vector3();
    const stages = [
      ["dispatch", drone, 18],
      ["pickup", new THREE.Vector3(3, 4, 5), 16],
      ["transit", drone, 22],
      ["arrival", new THREE.Vector3(5, 6, 7), 16],
      ["otp", new THREE.Vector3(5, 6, 7), 14],
      ["delivery", new THREE.Vector3(5, 6, 7), 14],
      ["return", new THREE.Vector3(0, 1, 0), 18],
      ["charging", new THREE.Vector3(0, 1, 0), 14],
    ] as const;

    for (const [stage, expectedTarget, expectedDistance] of stages) {
      const distance = getDeliveryCameraFocus(stage, drone, pickup, destination, hub, target);
      expect(target.distanceTo(expectedTarget)).toBe(0);
      expect(distance).toBe(expectedDistance);
    }
  });

  it("smoothly moves toward and tracks the actual drone object position", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(35, 37, 35);
    const controls = { target: new THREE.Vector3(), update: vi.fn() };
    const drone = new THREE.Group();
    drone.position.set(4, 7, -3);
    drone.updateMatrixWorld(true);

    updateCinematicCamera(camera, controls, drone, true, false, 1 / 60);
    const firstDistance = camera.position.distanceTo(new THREE.Vector3(12, 13, 5));

    expect(firstDistance).toBeGreaterThan(0);
    expect(firstDistance).toBeLessThan(Math.hypot(23, 24, 30));
    expect(controls.target.distanceTo(drone.position)).toBeLessThan(
      new THREE.Vector3().distanceTo(drone.position),
    );

    drone.position.set(-6, 9, 12);
    drone.updateMatrixWorld(true);
    const beforeTrack = camera.position.clone();
    const targetDistanceBeforeTrack = controls.target.distanceTo(drone.position);
    updateCinematicCamera(camera, controls, drone, true, false, 1 / 60);

    expect(camera.position.distanceTo(beforeTrack)).toBeGreaterThan(0);
    expect(controls.target.distanceTo(drone.position)).toBeLessThan(targetDistanceBeforeTrack);
    expect(controls.update).toHaveBeenCalledTimes(2);
  });

  it("smoothly returns the camera to the city overview", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 8, 10);
    const controls = { target: new THREE.Vector3(3, 4, 5), update: vi.fn() };

    const reached = updateCinematicCamera(camera, controls, undefined, false, true, 1 / 60);

    expect(reached).toBe(false);
    expect(camera.position.x).toBeGreaterThan(10);
    expect(controls.target.x).toBeLessThan(3);
    expect(controls.update).toHaveBeenCalledOnce();
  });

  it("smoothly moves the camera target and zoom to a delivery-stage focus", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(35, 37, 35);
    const controls = { target: new THREE.Vector3(), update: vi.fn() };
    const target = new THREE.Vector3(8, 4, -6);
    const focus = { target, distance: 14 };

    for (let i = 0; i < 120; i++) {
      updateCinematicCamera(camera, controls, undefined, true, false, 1 / 60, focus);
    }

    expect(controls.target.distanceTo(target)).toBeLessThan(0.1);
    expect(camera.position.distanceTo(target)).toBeCloseTo(14, 0);
  });

  it("holds the current camera while the active drone object is not registered yet", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(12, 15, 18);
    const before = camera.position.clone();
    const controls = { target: new THREE.Vector3(3, 4, 5), update: vi.fn() };
    const targetBefore = controls.target.clone();

    const reached = updateCinematicCamera(camera, controls, undefined, true, false, 1 / 60);

    expect(reached).toBe(false);
    expect(camera.position.equals(before)).toBe(true);
    expect(controls.target.equals(targetBefore)).toBe(true);
    expect(controls.update).not.toHaveBeenCalled();
  });
});
