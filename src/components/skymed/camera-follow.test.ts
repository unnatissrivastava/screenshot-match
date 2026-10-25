import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { updateCinematicCamera } from "./camera-follow";

describe("cinematic camera follow", () => {
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
